import os
import json
import asyncio
from pathlib import Path
from openai import AsyncOpenAI
import pandas as pd

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
MODEL = "gpt-4o"

openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

TAVILY_QUERIES = [
    "{company} quarterly financial results analyst questions earnings call before {cutoff}",
    "{company} revenue growth margin guidance outlook before {cutoff}",
    "{company} stock analyst commentary investor concerns before {cutoff}",
    "{company} earnings call key themes sector trends before {cutoff}",
    "{company} India business update capex debt guidance before {cutoff}",
]

WEB_NOTE = ("3. Web search results (news and analyst commentary up to {cutoff}) are also provided "
            "— use these to enrich predictions with current macro/sector themes.")

SYS_QUES = """You are an expert equity research analyst predicting questions that analysts will ask
during the upcoming earnings call of an Indian listed company.

You will receive:
  1. Historical quarterly financial result PDFs (as file attachments) paired with
     their earnings-call summaries (topics, key points, outlook type) as JSON text.
  2. The current quarter financial result PDF (as a file attachment).
  {web_note}

Predict 15-25 highly specific analyst questions. Return ONLY a JSON object:
{{"predicted_questions": [
  {{"question": "...", "rationale": "...", "basis_quarters": ["Q1-2025"],
   "category": "Revenue|Margins|Debt/Capital|Guidance|Operations|Macro/Sector|Management|Other",
   "outlook_type": "Forward Looking|Backward Looking|Mixed",
   "suggested_answer": "A concise management-perspective answer the company is likely to give (2-4 sentences).",
   "risk": "High|Medium|Low"}}
]}}

For "suggested_answer": draft the response management is likely to give based on the financial results and historical call tone.
For "risk": rate how sensitive/risky the question is for management — High = likely to cause discomfort or reveal weakness, Medium = neutral, Low = routine/safe."""


async def fetch_tavily_context(company: str, cutoff_date: str, custom_queries: str = None) -> str:
    if not TAVILY_API_KEY:
        print("WARNING: TAVILY_API_KEY not set")
        return ""
    
    try:
        from tavily import AsyncTavilyClient
        tv = AsyncTavilyClient(api_key=TAVILY_API_KEY)
    except ImportError:
        print("WARNING: tavily-python not installed or wrong version.")
        return ""

    queries = TAVILY_QUERIES
    if custom_queries and custom_queries.strip():
        queries = [q.strip() for q in custom_queries.strip().split("\n") if q.strip()]

    all_results = []
    
    cutoff_val = cutoff_date if cutoff_date else "today"

    for q_template in queries:
        query = q_template.replace("{company}", company).replace("{cutoff}", cutoff_val)
        try:
            resp = await tv.search(query=query, search_depth="advanced", max_results=5, include_answer=True)
            answer  = resp.get("answer", "")
            results = resp.get("results", [])
            block = f"[Query: {query}]\n"
            if answer:
                block += f"Summary: {answer}\n"
            for r in results:
                published = r.get("published_date", "")
                if cutoff_date and published and published[:10] > cutoff_date:
                    continue  # skip articles after cutoff
                block += f"- {r.get('title','')}: {r.get('content','')[:400]}\n"
            all_results.append(block)
        except Exception as e:
            print(f"Tavily search failed for query '{query[:60]}...': {e}")
            continue

    if not all_results:
        return ""
    return (
        f"\n=== EXTERNAL WEB SEARCH CONTEXT (Tavily, company: {company}, cutoff: {cutoff_val}) ===\n"
        + "\n\n".join(all_results)
    )

async def upload_pdf_to_openai(file_path: str) -> str:
    with open(file_path, "rb") as f:
        uploaded = await openai_client.files.create(file=f, purpose="user_data")
        return uploaded.id

def build_message_content(db_context: dict, current_fin_file_id: str, hist_fin_file_ids: dict, tavily_ctx: str) -> list:
    content = []
    content.append({"type": "text", "text": "=== HISTORICAL CONTEXT (by quarter) ==="})

    # Group by quarter
    for qtr_key, data in db_context.items():
        content.append({"type": "text", "text": f"--- Quarter: {qtr_key} ---"})
        
        if qtr_key in hist_fin_file_ids:
            content.append({"type": "text", "text": f"[Financial Result PDF Attachment Included]"})
            content.append({"type": "file", "file": {"file_id": hist_fin_file_ids[qtr_key]}})
        
        if data.get("questions"):
            summary_json = json.dumps(data["questions"], ensure_ascii=False, separators=(",", ":"))[:15000]
            content.append({
                "type": "text",
                "text": f"[Earnings Call Exerts:]\n{summary_json}"
            })

    if current_fin_file_id:
        content.append({"type": "text", "text": "=== CURRENT QUARTER FINANCIAL RESULT ==="})
        content.append({"type": "file", "file": {"file_id": current_fin_file_id}})

    if tavily_ctx:
        content.append({"type": "text", "text": tavily_ctx})

    return content

async def execute_prediction(
    supabase_client, 
    company_name: str, 
    cut_off_date: str, 
    search_queries: str,
    hist_fin_paths: list[dict], # [{"path": "...", "quarter_key": "Q1-2025"}]
    current_fin_path: str
) -> list:
    
    # 1. Fetch DB history for the company
    earnings_resp = supabase_client.table("earnings_calls") \
        .select("id, fiscal_year, quarter") \
        .eq("company_id", supabase_client.table("companies").select("id").eq("name", company_name).single().execute().data["id"]) \
        .execute()
    
    db_context = {}
    for call in earnings_resp.data:
        qtr_key = f"{call['quarter']}-{call['fiscal_year']}"
        db_context[qtr_key] = {"questions": []}
        
        qs = supabase_client.table("actual_questions").select("*").eq("earnings_call_id", call["id"]).execute()
        for q in qs.data:
            db_context[qtr_key]["questions"].append({
                "question": q["question_text"],
                "answer": q["answer_text"],
                "answered_by": q["answered_by"],
                "category": q["category"],
                "key_points": q["key_points"]
            })
    
    # 2. Upload Historical Fin PDFs
    hist_fin_file_ids = {}
    upload_tasks = []
    
    async def upload_hist(item):
        fid = await upload_pdf_to_openai(item["path"])
        hist_fin_file_ids[item["quarter_key"]] = fid
        
    for h in hist_fin_paths:
        upload_tasks.append(upload_hist(h))
        
    if upload_tasks:
        await asyncio.gather(*upload_tasks)
        
    # 3. Upload Current Fin PDF
    current_fin_file_id = None
    if current_fin_path:
        current_fin_file_id = await upload_pdf_to_openai(current_fin_path)
        
    # 4. Fetch Tavily
    tavily_ctx = await fetch_tavily_context(company_name, cut_off_date, search_queries)
    
    # 5. Build Content & Call OpenAI
    content_list = build_message_content(db_context, current_fin_file_id, hist_fin_file_ids, tavily_ctx)
    web_note = WEB_NOTE.format(cutoff=cut_off_date if cut_off_date else "today")
    
    resp = await openai_client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYS_QUES.format(web_note=web_note)},
            {"role": "user",   "content": content_list},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    
    # Clean up OpenAI files
    all_fids = list(hist_fin_file_ids.values())
    if current_fin_file_id:
        all_fids.append(current_fin_file_id)
        
    for fid in all_fids:
        try:
            await openai_client.files.delete(fid)
        except:
            pass
            
    parsed = json.loads(resp.choices[0].message.content)
    return parsed.get("predicted_questions", [])
