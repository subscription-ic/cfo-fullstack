"""
predict_questions_tavily.py
───────────────────────────
Sends historical financial result PDFs + earnings-call summary excels
(paired by quarter) plus the current quarter PDF directly to OpenAI
(using the Files API — no local text extraction) along with Tavily
web search context.

Produces 1 Excel output per run:
  1. <stem>_predicted_questions_tavily.xlsx (+ Tavily web search context)
"""

import os, re, json
from pathlib import Path

import pandas as pd
from openai import OpenAI
from dotenv import load_dotenv

# ── Config ─────────────────────────────────────────────────────────────────────
COMPANY_NAME = "HDFC"
TAVILY_CUTOFF_DATE = "2026-01-16"

# ── Paths ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent.resolve()
APP_DIR    = SCRIPT_DIR.parent.parent
ROOT_DIR   = APP_DIR.parent
load_dotenv(ROOT_DIR / ".env")

HISTORICAL_PDF_DIR = APP_DIR / "input"  / "files"    / "fin_results" / "historical"
CURRENT_PDF_DIR    = APP_DIR / "input"  / "files"    / "fin_results" / "current"
SUMMARY_EXCEL_DIR  = APP_DIR / "output" / "summaries" / "page_chunks"
PRED_QUES_DIR      = APP_DIR / "output" / "reports"   / "pred_ques"

# ── Clients ────────────────────────────────────────────────────────────────────
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = "gpt-4o"

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")

# ── Helpers ────────────────────────────────────────────────────────────────────
def extract_quarter_key(filename):
    m = re.search(r"(q[1-4]fy\d{2,4})", filename.lower())
    return m.group(1) if m else None

def upload_pdf(pdf_path: Path) -> str:
    print(f"    Uploading {pdf_path.name} to OpenAI...")
    with open(pdf_path, "rb") as f:
        uploaded = openai_client.files.create(file=f, purpose="user_data")
    print(f"    -> file_id: {uploaded.id}")
    return uploaded.id

def delete_file(file_id: str):
    try:
        openai_client.files.delete(file_id)
    except Exception:
        pass

def read_summary_excel(excel_path: Path) -> list:
    try:
        df = pd.read_excel(excel_path)
        return json.loads(df.to_json(orient="records", force_ascii=False))
    except Exception as e:
        print(f"  WARNING: Could not read {excel_path.name}: {e}")
        return []

# ── Context builders ───────────────────────────────────────────────────────────
def build_historical_context() -> dict:
    context = {}
    if HISTORICAL_PDF_DIR.exists():
        for pdf in sorted(HISTORICAL_PDF_DIR.glob("*.[pP][dD][fF]")):
            key = extract_quarter_key(pdf.name)
            if not key:
                print(f"  SKIP (no quarter key): {pdf.name}"); continue
            context.setdefault(key, {})
            context[key]["pdf_path"]                = pdf
            context[key]["fin_result_pdf_filename"] = pdf.name
            print(f"  OK historical PDF [{key}]: {pdf.name}")
    else:
        print(f"  WARNING: {HISTORICAL_PDF_DIR} not found")

    if SUMMARY_EXCEL_DIR.exists():
        for xl in sorted(SUMMARY_EXCEL_DIR.glob("*.xlsx")):
            key = extract_quarter_key(xl.name)
            if not key:
                print(f"  SKIP (no quarter key): {xl.name}"); continue
            context.setdefault(key, {})
            context[key]["earnings_call_summary"]          = read_summary_excel(xl)
            context[key]["earnings_call_summary_filename"] = xl.name
            print(f"  OK summary Excel  [{key}]: {xl.name}")
    else:
        print(f"  WARNING: {SUMMARY_EXCEL_DIR} not found")

    return context

def get_current_pdf() -> tuple:
    if not CURRENT_PDF_DIR.exists():
        return None
    candidates = [p for p in CURRENT_PDF_DIR.glob("*.[pP][dD][fF]") if p.parent == CURRENT_PDF_DIR]
    if not candidates:
        print(f"  WARNING: No current PDF in {CURRENT_PDF_DIR}"); return None
    pdf = candidates[0]
    if len(candidates) > 1:
        print(f"  NOTE: Multiple PDFs found, using: {pdf.name}")
    print(f"  OK current PDF: {pdf.name}")
    return pdf

# ── Tavily search ──────────────────────────────────────────────────────────────
TAVILY_QUERIES = [
    "{company} quarterly financial results analyst questions earnings call before {cutoff}",
    "{company} revenue growth margin guidance outlook before {cutoff}",
    "{company} stock analyst commentary investor concerns before {cutoff}",
    "{company} earnings call key themes sector trends before {cutoff}",
    "{company} India business update capex debt guidance before {cutoff}",
]

def fetch_tavily_context() -> str:
    if not TAVILY_API_KEY or TAVILY_API_KEY.startswith("your_") or TAVILY_API_KEY.startswith("tvly-..."):
        print("  WARNING: TAVILY_API_KEY not set — skipping web search")
        return ""
    try:
        from tavily import TavilyClient
    except ImportError:
        print("  WARNING: tavily-python not installed. Run: pip install tavily-python")
        return ""

    tv = TavilyClient(api_key=TAVILY_API_KEY)
    all_results = []

    print(f"  Running {len(TAVILY_QUERIES)} Tavily searches for '{COMPANY_NAME}' (cutoff: {TAVILY_CUTOFF_DATE})...")
    for q_template in TAVILY_QUERIES:
        query = q_template.replace("{company}", COMPANY_NAME).replace("{cutoff}", TAVILY_CUTOFF_DATE)
        try:
            resp = tv.search(query=query, search_depth="advanced", max_results=5, include_answer=True)
            answer  = resp.get("answer", "")
            results = resp.get("results", [])
            block = f"[Query: {query}]\n"
            if answer:
                block += f"Summary: {answer}\n"
            for r in results:
                published = r.get("published_date", "")
                if published and published[:10] > TAVILY_CUTOFF_DATE:
                    continue  # skip articles after cutoff
                block += f"- {r.get('title','')}: {r.get('content','')[:400]}\n"
            all_results.append(block)
        except Exception as e:
            print(f"  WARNING: Tavily search failed for query '{query[:60]}...': {e}"); continue

    if not all_results:
        return ""
    return (
        "\n=== EXTERNAL WEB SEARCH CONTEXT (Tavily, company: " + COMPANY_NAME
        + ", cutoff: " + TAVILY_CUTOFF_DATE + ") ===\n"
        + "\n\n".join(all_results)
    )

# ── System prompts ─────────────────────────────────────────────────────────────
SYS_QUES = """You are an expert equity research analyst predicting questions that analysts will ask
during the upcoming earnings call of an Indian listed company.

You will receive:
  1. Historical quarterly financial result PDFs (as file attachments) paired with
     their earnings-call summaries (topics, key points, outlook type) as JSON text.
  2. The current quarter financial result PDF (as a file attachment).
  {web_note}

Predict 15-25 highly specific analyst questions. Return ONLY a JSON object:
{{"predicted_questions": [
  {{"question": "...", "rationale": "...", "basis_quarters": ["q1fy26"],
   "category": "Revenue|Margins|Debt/Capital|Guidance|Operations|Macro/Sector|Management|Other",
   "outlook_type": "Forward Looking|Backward Looking|Mixed",
   "suggested_answer": "A concise management-perspective answer the company is likely to give (2-4 sentences).",
   "risk": "High|Medium|Low"}}
]}}

For "suggested_answer": draft the response management is likely to give based on the financial results and historical call tone.
For "risk": rate how sensitive/risky the question is for management — High = likely to cause discomfort or reveal weakness, Medium = neutral, Low = routine/safe."""

WEB_NOTE = ("3. Web search results (news and analyst commentary up to {cutoff}) are also provided "
            "— use these to enrich predictions with current macro/sector themes.")

# ── Build message content ──────────────────────────────────────────────────────
def build_message_content(ctx: dict, current_file_id: str,
                           hist_file_ids: dict, tavily_ctx: str = "") -> list:
    content = []
    content.append({"type": "text", "text": "=== HISTORICAL CONTEXT (by quarter) ==="})

    for qtr in sorted(ctx.keys()):
        d = ctx[qtr]
        content.append({"type": "text", "text": f"--- Quarter: {qtr.upper()} ---"})

        if qtr in hist_file_ids:
            content.append({"type": "text",
                             "text": f"[Financial Result PDF: {d.get('fin_result_pdf_filename','')}]"})
            content.append({"type": "file", "file": {"file_id": hist_file_ids[qtr]}})

        if "earnings_call_summary" in d:
            summary_json = json.dumps(d["earnings_call_summary"],
                                      ensure_ascii=False, separators=(",", ":"))[:15000]
            content.append({
                "type": "text",
                "text": (f"[Earnings Call Summary: {d.get('earnings_call_summary_filename','')}]\n"
                         + summary_json)
            })

    content.append({"type": "text", "text": "=== CURRENT QUARTER FINANCIAL RESULT ==="})
    content.append({"type": "file", "file": {"file_id": current_file_id}})

    if tavily_ctx:
        content.append({"type": "text", "text": tavily_ctx})

    return content

# ── OpenAI call ────────────────────────────────────────────────────────────────
def call_openai(sys_prompt: str, content: list, label: str) -> dict:
    print(f"  Calling OpenAI ({label})...")
    try:
        resp = openai_client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": sys_prompt},
                {"role": "user",   "content": content},
            ],
            temperature=0.3,
            response_format={"type": "json_object"},
        )
        return json.loads(resp.choices[0].message.content)
    except Exception as e:
        print(f"  ERROR ({label}): {e}")
        return {}

# ── Save helpers ───────────────────────────────────────────────────────────────
def flatten_list_col(df, col):
    if col in df.columns:
        df[col] = df[col].apply(lambda x: ", ".join(x) if isinstance(x, list) else x)
    return df

def save_questions(data: dict, stem: str, suffix: str = ""):
    items = data.get("predicted_questions", [])
    if not items:
        print("  WARNING: No questions returned"); return
    df = flatten_list_col(pd.DataFrame(items), "basis_quarters")
    PRED_QUES_DIR.mkdir(parents=True, exist_ok=True)
    out = PRED_QUES_DIR / f"{stem}_predicted_questions{suffix}.xlsx"
    df.to_excel(out, index=False)
    print(f"  SAVED -> {out}")

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    uploaded_file_ids = []

    try:
        print("\n-- Step 1: Historical context")
        ctx = build_historical_context()

        print("\n-- Step 2: Current PDF")
        cur_path = get_current_pdf()
        if not cur_path:
            print("ERROR: No current PDF found. Exiting."); return
        stem = cur_path.stem

        print("\n-- Step 3: Fetching Tavily web search context")
        tavily_ctx = fetch_tavily_context()
        if not tavily_ctx:
            print("\n  ERROR: Tavily context unavailable. Check API key.")
            return

        print("\n-- Step 4: Uploading PDFs to OpenAI")
        hist_file_ids = {}
        for qtr, d in ctx.items():
            if "pdf_path" in d:
                fid = upload_pdf(d["pdf_path"])
                hist_file_ids[qtr] = fid
                uploaded_file_ids.append(fid)

        print(f"  Uploading current PDF: {cur_path.name}")
        current_file_id = upload_pdf(cur_path)
        uploaded_file_ids.append(current_file_id)

        print("\n-- Step 5: Predict questions (with web search)")
        content_tavily = build_message_content(ctx, current_file_id, hist_file_ids, tavily_ctx)
        web_note = WEB_NOTE.format(cutoff=TAVILY_CUTOFF_DATE)
        q_data_tv = call_openai(SYS_QUES.format(web_note=web_note), content_tavily, "questions+tavily")

        print("\n-- Step 6: Save Tavily outputs")
        save_questions(q_data_tv, stem, suffix="_tavily")

    finally:
        if uploaded_file_ids:
            print(f"\n-- Cleaning up {len(uploaded_file_ids)} uploaded file(s) from OpenAI...")
            for fid in uploaded_file_ids:
                delete_file(fid)
            print("   Done.")

    print("\nAll outputs saved.")

if __name__ == "__main__":
    main()
