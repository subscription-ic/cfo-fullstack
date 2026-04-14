"""
FastAPI backend for CFO Earnings Intelligence Copilot.

Endpoints:
  GET /api/predicted-questions          – all rows from predicted_questions
  GET /api/predicted-questions?company= – filter by company name

Run:
  uvicorn main:app --reload --port 8000
"""

import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client

# ── Load .env ─────────────────────────────────────────────────────────────────
def find_env_file(start: Path) -> Path | None:
    for directory in [start, *start.parents]:
        candidate = directory / ".env"
        if candidate.is_file():
            return candidate
    return None

env_path = find_env_file(Path(__file__).parent)
if env_path:
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()  # fallback to system env

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in the .env file.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI(
    title="CFO Earnings Intelligence API",
    description="Serves predicted Q&A and other earnings data from Supabase.",
    version="1.0.0",
)

# Allow the Vite dev server and the deployed Vercel frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://cfo-frontend-topaz.vercel.app",
        "https://cfo-frontend-c7kq63d25-subscription-ics-projects.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────────────────────
from pipeline_router import pipeline_router
app.include_router(pipeline_router)

@app.get("/")
def root():
    return {"message": "CFO Earnings Intelligence API is running 🚀"}


@app.get("/api/predicted-questions")
def get_predicted_questions(company: Optional[str] = Query(default=None)):
    """Return rows from predicted_questions, optionally filtering by company, with period label."""
    try:
        if company:
            company_resp = supabase.table("companies").select("id").ilike("name", f"%{company}%").execute()
            if not company_resp.data:
                return {"data": [], "count": 0}
            company_ids = [c["id"] for c in company_resp.data]
            calls_resp = supabase.table("earnings_calls").select("id, fiscal_year, quarter").in_("company_id", company_ids).execute()
        else:
            calls_resp = supabase.table("earnings_calls").select("id, fiscal_year, quarter").execute()
            
        if not calls_resp.data:
            return {"data": [], "count": 0}
        
        call_map = {c["id"]: c for c in calls_resp.data}
        call_ids = list(call_map.keys())
        response = supabase.table("predicted_questions").select("*").in_("earnings_call_id", call_ids).order("created_at", desc=False).execute()
        
        formatted = []
        for q in response.data:
            call = call_map.get(q["earnings_call_id"], {})
            period = f"{call.get('quarter', '?')} FY{str(call.get('fiscal_year', ''))[-2:]}"
            formatted.append({
                "id": q["id"],
                "period": period,
                "question": q["question_text"],
                "answer": q.get("suggested_answer", ""),
                "category": q.get("category", ""),
                "risk": q.get("risk", "Medium"),
                "earnings_call_id": q["earnings_call_id"],
            })
        
        return {"data": formatted, "count": len(formatted)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))



@app.get("/api/predicted-questions/{question_id}")
def get_predicted_question(question_id: str):
    """Return a single predicted_questions row by id."""
    try:
        response = (
            supabase.table("predicted_questions")
            .select("*")
            .eq("id", question_id)
            .single()
            .execute()
        )
        if not response.data:
            raise HTTPException(status_code=404, detail="Question not found")
        return response.data
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/actual-questions")
def get_actual_questions(company: Optional[str] = Query(default=None)):
    """Return rows from actual_questions, mapped with quarter/year from earnings_calls."""
    try:
        if company:
            company_resp = supabase.table("companies").select("id").ilike("name", f"%{company}%").execute()
            if not company_resp.data:
                return {"data": [], "count": 0}
            company_ids = [c["id"] for c in company_resp.data]
            calls_resp = supabase.table("earnings_calls").select("id, fiscal_year, quarter").in_("company_id", company_ids).execute()
        else:
            calls_resp = supabase.table("earnings_calls").select("id, fiscal_year, quarter").execute()
            
        if not calls_resp.data:
            return {"data": [], "count": 0}
            
        call_map = {c["id"]: c for c in calls_resp.data}
        call_ids = list(call_map.keys())
        
        questions_resp = supabase.table("actual_questions").select("*").in_("earnings_call_id", call_ids).order("created_at", desc=False).execute()
        
        formatted_questions = []
        for q in questions_resp.data:
            call = call_map[q["earnings_call_id"]]
            period = f"{call['quarter']} FY{str(call['fiscal_year'])[-2:]}"
            formatted_questions.append({
                "id": q["id"],
                "period": period,
                "question": q["question_text"],
                "questionTopics": q.get("question_topics", ""),
                "answer": q["answer_text"],
                "answerSummary": q.get("answer_summary", ""),
                "keyPoints": q.get("key_points", ""),
                "answeredBy": q["answered_by"],
                "category": q["category"]
            })
            
        return {"data": formatted_questions, "count": len(formatted_questions)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


class ActualQuestionCreate(BaseModel):
    company_name: str
    period: str
    question: str
    questionTopics: Optional[str] = None
    answer: str
    answerSummary: Optional[str] = None
    keyPoints: Optional[str] = None
    answeredBy: Optional[str] = None
    category: Optional[str] = None

class ActualQuestionUpdate(BaseModel):
    question: Optional[str] = None
    questionTopics: Optional[str] = None
    answer: Optional[str] = None
    answerSummary: Optional[str] = None
    keyPoints: Optional[str] = None
    answeredBy: Optional[str] = None
    category: Optional[str] = None

@app.post("/api/actual-questions")
def create_actual_question(req: ActualQuestionCreate):
    try:
        parts = req.period.split(" FY")
        if len(parts) != 2:
            raise HTTPException(status_code=400, detail="Invalid period format")
        quarter = parts[0].strip()
        year_suffix = parts[1].strip()
        year = 2000 + int(year_suffix) if len(year_suffix) == 2 else int(year_suffix)

        company_resp = supabase.table("companies").select("id").ilike("name", f"%{req.company_name}%").execute()
        if not company_resp.data:
            raise HTTPException(status_code=404, detail=f"Company {req.company_name} not found")
        company_id = company_resp.data[0]["id"]

        call_resp = supabase.table("earnings_calls").select("id").eq("company_id", company_id).eq("fiscal_year", year).eq("quarter", quarter).execute()
        
        if not call_resp.data:
            new_call = supabase.table("earnings_calls").insert({
                "company_id": company_id,
                "fiscal_year": year,
                "quarter": quarter,
                "is_upcoming": False
            }).execute()
            earnings_call_id = new_call.data[0]["id"]
        else:
            earnings_call_id = call_resp.data[0]["id"]

        ins_res = supabase.table("actual_questions").insert({
            "earnings_call_id": earnings_call_id,
            "question_text": req.question,
            "answer_text": req.answer,
            "answered_by": req.answeredBy,
            "category": req.category,
            "question_topics": req.questionTopics,
            "answer_summary": req.answerSummary,
            "key_points": req.keyPoints
        }).execute()
        
        record = ins_res.data[0]
        return {
            "id": record["id"],
            "period": req.period,
            "question": record["question_text"],
            "questionTopics": record["question_topics"],
            "answer": record["answer_text"],
            "answerSummary": record["answer_summary"],
            "keyPoints": record["key_points"],
            "answeredBy": record["answered_by"],
            "category": record["category"],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@app.put("/api/actual-questions/{question_id}")
def update_actual_question(question_id: str, req: ActualQuestionUpdate):
    try:
        update_data = {}
        if req.question is not None: update_data["question_text"] = req.question
        if req.answer is not None: update_data["answer_text"] = req.answer
        if req.answeredBy is not None: update_data["answered_by"] = req.answeredBy
        if req.category is not None: update_data["category"] = req.category
        if req.questionTopics is not None: update_data["question_topics"] = req.questionTopics
        if req.answerSummary is not None: update_data["answer_summary"] = req.answerSummary
        if req.keyPoints is not None: update_data["key_points"] = req.keyPoints
        
        if not update_data:
            return {"message": "No updates"}
            
        upd_res = supabase.table("actual_questions").update(update_data).eq("id", question_id).execute()
        if not upd_res.data:
            raise HTTPException(status_code=404, detail="Question not found")
        return {"success": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@app.delete("/api/actual-questions/{question_id}")
def delete_actual_question(question_id: str):
    try:
        supabase.table("actual_questions").delete().eq("id", question_id).execute()
        return {"success": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete("/api/companies/{company_name}")
def delete_company(company_name: str):
    """Delete a company and all related records (cascade via DB FK or manual deletion)."""
    try:
        # Find the company
        company_resp = supabase.table("companies").select("id, name").ilike("name", f"%{company_name}%").execute()
        if not company_resp.data:
            raise HTTPException(status_code=404, detail=f"Company '{company_name}' not found")
        
        company_id = company_resp.data[0]["id"]
        name = company_resp.data[0]["name"]
        
        # Delete the company - all child records are cascade-deleted via FK constraints
        supabase.table("companies").delete().eq("id", company_id).execute()
        
        return {"success": True, "deleted": name}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/companies")
def get_companies():
    """Return distinct list of companies from the companies table."""
    try:
        companies_resp = supabase.table("companies").select("name").execute()
        comp_set = {row["name"] for row in companies_resp.data if row.get("name")}
        
        return {"companies": sorted(comp_set)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))




class UserCreateRequest(BaseModel):
    email: str
    password: str
    first_name: str
    last_name: str
    role: str = "user"

@app.post("/api/admin/users")
def create_admin_user(req: UserCreateRequest):
    """
    Create a new user via Supabase Admin API and add an entry in the profiles table.
    """
    try:
        auth_response = supabase.auth.admin.create_user({
            "email": req.email,
            "password": req.password,
            "email_confirm": True,
            "user_metadata": {
                "first_name": req.first_name,
                "last_name": req.last_name
            }
        })
        
        new_user = auth_response.user
        if not new_user:
            raise Exception("User creation failed, no user object returned.")

        supabase.table("profiles").insert({
            "id": new_user.id,
            "first_name": req.first_name,
            "last_name": req.last_name,
            "role": req.role
        }).execute()
        
        return {"message": "User created successfully", "user_id": new_user.id}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── Background Task: PDF Upload ───────────────────────────────────────────────

import uuid
import shutil
from services.extraction import process_historical_pdf

tasks = {}

@app.post("/api/upload/historical")
def upload_historical(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    company: str = Form(...),
    year: int = Form(...),
    quarter: str = Form(...),
    cut_off_date: Optional[str] = Form(None),
    search_queries: Optional[str] = Form(None)
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    
    task_id = str(uuid.uuid4())
    tasks[task_id] = "Initializing upload..."
    
    import tempfile
    upload_dir = Path(tempfile.gettempdir()) / "uploads"
    upload_dir.mkdir(exist_ok=True)
    temp_file_path = upload_dir / f"{task_id}.pdf"
    
    with open(temp_file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    background_tasks.add_task(process_pdf_background, task_id, str(temp_file_path), company, year, quarter)
    return {"task_id": task_id, "message": "File uploaded, processing started in background."}

@app.get("/api/tasks/{task_id}")
def get_task_status(task_id: str):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"task_id": task_id, "status": tasks[task_id]}

def process_pdf_background(task_id: str, file_path: str, company: str, year: int, quarter: str):
    try:
        def update_status(msg: str):
            tasks[task_id] = msg
            print(f"Task {task_id}: {msg}")
            
        update_status("Starting PDF processing...")
        rows = process_historical_pdf(file_path, update_status)
        update_status("Saving to database...")
        
        company_resp = supabase.table("companies").select("id").ilike("name", company).execute()
        if company_resp.data:
            company_id = company_resp.data[0]["id"]
        else:
            new_comp = supabase.table("companies").insert({"name": company}).execute()
            company_id = new_comp.data[0]["id"]
            
        call_resp = supabase.table("earnings_calls").select("id").eq("company_id", company_id).eq("fiscal_year", year).eq("quarter", quarter).execute()
        if call_resp.data:
            earnings_call_id = call_resp.data[0]["id"]
        else:
            new_call = supabase.table("earnings_calls").insert({
                "company_id": company_id,
                "fiscal_year": year,
                "quarter": quarter,
                "is_upcoming": False
            }).execute()
            earnings_call_id = new_call.data[0]["id"]
            
        questions_to_insert = []
        for row in rows:
            questions_to_insert.append({
                "earnings_call_id": earnings_call_id,
                "question_text": row["question_text"],
                "answer_text": row["answer_text"],
                "answered_by": row["answered_by"],
                "category": row["category"],
                "question_topics": row["question_topics"],
                "answer_summary": row["answer_summary"],
                "key_points": row["key_points"]
            })
            
        update_status(f"Inserting {len(questions_to_insert)} questions...")
        if questions_to_insert:
            supabase.table("actual_questions").insert(questions_to_insert).execute()
            
        update_status("COMPLETE")
    except Exception as e:
        update_status(f"ERROR: {str(e)}")
        print(f"Error processing PDF task {task_id}: {e}")
    finally:
        try:
            os.remove(file_path)
        except:
            pass

@app.get("/api/comparisons")
def get_comparisons(company: Optional[str] = Query(default=None)):
    """Return rows combining predicted_vs_actual_comparisons, predicted_questions, and actual_questions"""
    try:
        if company:
            company_resp = supabase.table("companies").select("id").ilike("name", f"%{company}%").execute()
            if not company_resp.data:
                return {"data": [], "count": 0}
            company_ids = [c["id"] for c in company_resp.data]
            calls_resp = supabase.table("earnings_calls").select("id, fiscal_year, quarter").in_("company_id", company_ids).execute()
        else:
            calls_resp = supabase.table("earnings_calls").select("id, fiscal_year, quarter").execute()
            
        if not calls_resp.data:
            return {"data": [], "count": 0}
        
        call_map = {c["id"]: c for c in calls_resp.data}
        call_ids = list(call_map.keys())

        # Fetch comparisons
        comps_resp = supabase.table("predicted_vs_actual_comparisons").select("*").in_("earnings_call_id", call_ids).execute()
        
        # Fetch predicted questions
        pred_resp = supabase.table("predicted_questions").select("*").in_("earnings_call_id", call_ids).execute()
        pred_map = {p["id"]: p for p in pred_resp.data}
        
        # Filter call_ids to ONLY those that have predictions or comparisons
        valid_call_ids = set([c["earnings_call_id"] for c in comps_resp.data] + [p["earnings_call_id"] for p in pred_resp.data])
        
        if not valid_call_ids:
            return {"data": [], "count": 0}
            
        # Fetch actual questions ONLY for the valid calls
        act_resp = supabase.table("actual_questions").select("*").in_("earnings_call_id", list(valid_call_ids)).execute()
        act_map = {a["id"]: a for a in act_resp.data}

        formatted = []
        matched_actual_ids = set()

        for c in comps_resp.data:
            call = call_map.get(c["earnings_call_id"], {})
            period = f"{call.get('quarter', '?')} FY{str(call.get('fiscal_year', ''))[-2:]}"
            
            p_q = pred_map.get(c["predicted_question_id"], {}) if c.get("predicted_question_id") else {}
            a_q = act_map.get(c["actual_question_id"], {}) if c.get("actual_question_id") else {}
            
            if c.get("actual_question_id"):
                matched_actual_ids.add(c["actual_question_id"])

            formatted.append({
                "id": c["id"],
                "period": period,
                "predictedQuestion": p_q.get("question_text", ""),
                "actualPhrasing": a_q.get("question_text", ""),
                "wasAsked": c.get("was_asked", False),
                "similarity": c.get("similarity_score", 0),
                "feedback": c.get("feedback", ""),
                "category": p_q.get("category", "")
            })

        for act_id, a_q in act_map.items():
            if act_id not in matched_actual_ids:
                call = call_map.get(a_q["earnings_call_id"], {})
                period = f"{call.get('quarter', '?')} FY{str(call.get('fiscal_year', ''))[-2:]}"
                
                formatted.append({
                    "id": f"missed-{act_id}",
                    "period": period,
                    "predictedQuestion": "",
                    "actualPhrasing": a_q.get("question_text", ""),
                    "wasAsked": True,
                    "similarity": 0,
                    "feedback": "missed-actual",
                    "category": a_q.get("category", "")
                })

        return {"data": formatted, "count": len(formatted)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))



class ComparisonUpdate(BaseModel):
    similarity_score: Optional[float] = None

@app.put("/api/comparisons/{comparison_id}")
def update_comparison(comparison_id: str, req: ComparisonUpdate):
    """Update similarity score of a predicted_vs_actual_comparisons row."""
    try:
        update_data = {}
        if req.similarity_score is not None:
            update_data["similarity_score"] = req.similarity_score

        if not update_data:
            return {"message": "No fields to update"}

        upd_res = supabase.table("predicted_vs_actual_comparisons").update(update_data).eq("id", comparison_id).execute()
        if not upd_res.data:
            raise HTTPException(status_code=404, detail="Comparison record not found")

        return {"message": "Comparison updated successfully"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@app.post("/api/comparisons/recalculate")
async def recalculate_comparisons(company: str = Query(...), period: str = Query(...)):
    """
    Delete all comparison rows for a company+period and rerun GPT-4o similarity scoring.
    period format: "Q3 FY26"
    """
    try:
        from services.comparison import run_comparison

        # Parse period
        parts = period.split(" FY")
        if len(parts) != 2:
            raise HTTPException(status_code=400, detail="Invalid period format. Use 'Q3 FY26'")
        quarter = parts[0].strip()
        year_suffix = parts[1].strip()
        fiscal_year = 2000 + int(year_suffix) if len(year_suffix) == 2 else int(year_suffix)

        # Lookup company
        comp_resp = supabase.table("companies").select("id").ilike("name", f"%{company}%").execute()
        if not comp_resp.data:
            raise HTTPException(status_code=404, detail=f"Company '{company}' not found")
        company_id = comp_resp.data[0]["id"]

        # Lookup earnings_call for that quarter
        call_resp = supabase.table("earnings_calls").select("id").eq("company_id", company_id).eq("fiscal_year", fiscal_year).eq("quarter", quarter).execute()
        if not call_resp.data:
            raise HTTPException(status_code=404, detail=f"No earnings call found for {period}")
        earnings_call_id = call_resp.data[0]["id"]

        # Delete existing comparisons for this call
        supabase.table("predicted_vs_actual_comparisons").delete().eq("earnings_call_id", earnings_call_id).execute()

        # Fetch current predicted and actual questions
        pred_resp = supabase.table("predicted_questions").select("id, question_text").eq("earnings_call_id", earnings_call_id).execute()
        act_resp = supabase.table("actual_questions").select("id, question_text").eq("earnings_call_id", earnings_call_id).execute()

        if not pred_resp.data or not act_resp.data:
            return {"message": "Comparisons cleared. No predictions or actuals to compare.", "data": []}

        pred_list = [{"id": p["id"], "question": p["question_text"]} for p in pred_resp.data]
        act_list  = [{"id": a["id"], "question": a["question_text"]} for a in act_resp.data]

        # Run GPT-4o comparison
        comparisons = await run_comparison(pred_list, act_list)

        # Insert new comparison rows
        if comparisons:
            insert_payload = [
                {
                    "earnings_call_id": earnings_call_id,
                    "predicted_question_id": c.get("predicted_id"),
                    "actual_question_id": c.get("matched_actual_id"),
                    "was_asked": c.get("was_asked", False),
                    "similarity_score": c.get("similarity_score", 0),
                    "feedback": c.get("feedback")
                }
                for c in comparisons
            ]
            supabase.table("predicted_vs_actual_comparisons").insert(insert_payload).execute()

        return {"message": f"Recalculated {len(comparisons)} comparison(s) for {period}", "count": len(comparisons)}

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

class PredictedQuestionCreate(BaseModel):
    company_name: str
    period: str
    question: str
    answer: Optional[str] = None
    category: Optional[str] = None
    risk: Optional[str] = 'Medium'

class PredictedQuestionUpdate(BaseModel):
    question: Optional[str] = None
    answer: Optional[str] = None
    category: Optional[str] = None
    risk: Optional[str] = None

@app.post("/api/predicted-questions")
def create_predicted_question(req: PredictedQuestionCreate):
    try:
        parts = req.period.split(" FY")
        if len(parts) != 2:
            raise HTTPException(status_code=400, detail="Invalid period format")
        quarter = parts[0].strip()
        year_suffix = parts[1].strip()
        year = 2000 + int(year_suffix) if len(year_suffix) == 2 else int(year_suffix)

        company_resp = supabase.table("companies").select("id").ilike("name", f"%{req.company_name}%").execute()
        if not company_resp.data:
            raise HTTPException(status_code=404, detail=f"Company {req.company_name} not found")
        company_id = company_resp.data[0]["id"]

        call_resp = supabase.table("earnings_calls").select("id").eq("company_id", company_id).eq("fiscal_year", year).eq("quarter", quarter).execute()
        
        if not call_resp.data:
            new_call = supabase.table("earnings_calls").insert({
                "company_id": company_id,
                "fiscal_year": year,
                "quarter": quarter,
                "is_upcoming": True
            }).execute()
            earnings_call_id = new_call.data[0]["id"]
        else:
            earnings_call_id = call_resp.data[0]["id"]

        ins_res = supabase.table("predicted_questions").insert({
            "earnings_call_id": earnings_call_id,
            "question_text": req.question,
            "suggested_answer": req.answer,
            "category": req.category,
            "risk": req.risk
        }).execute()
        
        record = ins_res.data[0]
        return {
            "id": record["id"],
            "period": req.period,
            "question": record.get("question_text", ""),
            "answer": record.get("suggested_answer", ""),
            "category": record.get("category", ""),
            "risk": record.get("risk", "Medium")
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@app.put("/api/predicted-questions/{question_id}")
def update_predicted_question(question_id: str, req: PredictedQuestionUpdate):
    try:
        update_data = {}
        if req.question is not None: update_data["question_text"] = req.question
        if req.answer is not None: update_data["suggested_answer"] = req.answer
        if req.category is not None: update_data["category"] = req.category
        if req.risk is not None: update_data["risk"] = req.risk

        if not update_data:
            return {"message": "No fields to update"}
            
        upd_res = supabase.table("predicted_questions").update(update_data).eq("id", question_id).execute()
        if not upd_res.data:
            raise HTTPException(status_code=404, detail="Predicted question not found")
            
        return {"message": "Predicted question updated successfully"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@app.delete("/api/predicted-questions/{question_id}")
def delete_predicted_question(question_id: str):
    try:
        del_res = supabase.table("predicted_questions").delete().eq("id", question_id).execute()
        if not del_res.data:
            raise HTTPException(status_code=404, detail="Predicted question not found")
        return {"message": "Predicted question deleted successfully"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

