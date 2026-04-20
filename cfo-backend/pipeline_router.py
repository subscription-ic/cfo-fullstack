import os
import uuid
import shutil
import asyncio
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, File, UploadFile, Form, HTTPException
from pydantic import BaseModel

# Import global supabase client from main (we will attach it on startup or just import create_client to make a local one)
from services.extraction import process_historical_pdf
from services.pipeline import execute_prediction
from services.comparison import run_comparison
from supabase import create_client

pipeline_router = APIRouter()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Shared Tasks dict, can reuse or have local
pipeline_tasks = {}

@pipeline_router.post("/api/pipeline/predict")
async def pipeline_predict(
    background_tasks: BackgroundTasks,
    company: str = Form(...),
    cut_off_date: Optional[str] = Form(None),
    search_queries: Optional[str] = Form(None),
    historical_fin_files: List[UploadFile] = File(default=[]),
    historical_fin_quarters: List[str] = Form(default=[]),
    current_fin_file: Optional[UploadFile] = File(None),
    current_quarter: Optional[str] = Form(None),
    current_ec_file: Optional[UploadFile] = File(None)
):
    task_id = str(uuid.uuid4())
    pipeline_tasks[task_id] = "Initializing prediction pipeline..."
    
    import tempfile
    upload_dir = Path(tempfile.gettempdir()) / "uploads"
    upload_dir.mkdir(exist_ok=True)
    
    hist_fin_paths = []
    for i, f in enumerate(historical_fin_files):
        path = str(upload_dir / f"hist_{task_id}_{i}.pdf")
        with open(path, "wb") as buffer:
            shutil.copyfileobj(f.file, buffer)
        try:
           qtr = historical_fin_quarters[i]
        except:
           qtr = f"Unknown-{i}"
        hist_fin_paths.append({"path": path, "quarter_key": qtr})
        
    cur_fin_path = None
    if current_fin_file:
        cur_fin_path = str(upload_dir / f"curfin_{task_id}.pdf")
        with open(cur_fin_path, "wb") as buffer:
            shutil.copyfileobj(current_fin_file.file, buffer)
            
    cur_ec_path = None
    if current_ec_file:
        cur_ec_path = str(upload_dir / f"curec_{task_id}.pdf")
        with open(cur_ec_path, "wb") as buffer:
            shutil.copyfileobj(current_ec_file.file, buffer)

    background_tasks.add_task(
        process_pipeline_background,
        task_id, company, cut_off_date, search_queries, hist_fin_paths, cur_fin_path, cur_ec_path, current_quarter
    )
    return {"task_id": task_id, "message": "Pipeline started."}

@pipeline_router.get("/api/pipeline/tasks/{task_id}")
def get_pipeline_task_status(task_id: str):
    if task_id not in pipeline_tasks:
        # Fallback to main tasks if we want
        raise HTTPException(status_code=404, detail="Task not found")
    return {"task_id": task_id, "status": pipeline_tasks[task_id]}


def process_pipeline_background(
    task_id: str, company: str, cut_off_date: str, search_queries: str, 
    hist_fin_paths: list, cur_fin_path: Optional[str], cur_ec_path: Optional[str], current_quarter: Optional[str]
):
    try:
        def update_status(msg: str):
            pipeline_tasks[task_id] = msg
            print(f"Pipeline {task_id}: {msg}")

        update_status("Fetching Context & Predicting Questions via LLM (Tavily & OpenAI)...")
        predictions = asyncio.run(execute_prediction(supabase, company, cut_off_date, search_queries, hist_fin_paths, cur_fin_path))
        
        update_status(f"Saving {len(predictions)} predicted questions...")
        
        company_resp = supabase.table("companies").select("id").ilike("name", company).execute()
        if company_resp.data:
            company_id = company_resp.data[0]["id"]
        else:
            new_comp = supabase.table("companies").insert({"name": company}).execute()
            company_id = new_comp.data[0]["id"]
            
        cur_year = 2025 # default if missing
        cur_qtr = "Q1"
        if current_quarter:
            parts = current_quarter.split("-")
            if len(parts) == 2:
                cur_qtr, cur_year_str = parts[0], parts[1]
                cur_year = int(cur_year_str)
                
        call_resp = supabase.table("earnings_calls").select("id").eq("company_id", company_id).eq("fiscal_year", cur_year).eq("quarter", cur_qtr).execute()
        if call_resp.data:
            ec_id = call_resp.data[0]["id"]
        else:
            new_call = supabase.table("earnings_calls").insert({
                "company_id": company_id,
                "fiscal_year": cur_year,
                "quarter": cur_qtr,
                "is_upcoming": True
            }).execute()
            ec_id = new_call.data[0]["id"]

        predicted_insert_payload = []
        for p in predictions:
            predicted_insert_payload.append({
                "earnings_call_id": ec_id,
                "question_text": p.get("question", ""),
                "suggested_answer": p.get("suggested_answer", ""),
                "category": p.get("category", ""),
                "risk": p.get("risk", "Medium")
            })
            
        inserted_predictions = []
        if predicted_insert_payload:
            pred_resp = supabase.table("predicted_questions").insert(predicted_insert_payload).execute()
            inserted_predictions = pred_resp.data

        actuals_data = []
        if cur_ec_path:
            update_status("Extracting Actual Questions from Current Quarter EC...")
            rows_generator = process_historical_pdf(cur_ec_path, update_status)
            
            # Note: process_historical_pdf used to just print & yield, wait, it returned list of dicts.
            rows = rows_generator if isinstance(rows_generator, list) else list(rows_generator)
            
            if rows:
                update_status("Saving actual questions to db...")
                actuals_insert_payload = []
                for row in rows:
                    actuals_insert_payload.append({
                        "earnings_call_id": ec_id,
                        "question_text": row.get("question_text", ""),
                        "answer_text": row.get("answer_text", ""),
                        "answered_by": row.get("answered_by", ""),
                        "category": row.get("category", ""),
                        "question_topics": row.get("question_topics", ""),
                        "answer_summary": row.get("answer_summary", ""),
                        "key_points": row.get("key_points", "")
                    })
                
                if actuals_insert_payload:
                    act_resp = supabase.table("actual_questions").insert(actuals_insert_payload).execute()
                    actuals_data = act_resp.data
                
        if inserted_predictions and actuals_data:
            update_status("Comparing Predictions vs Actuals...")
            pred_list = [{"id": p["id"], "question": p["question_text"]} for p in inserted_predictions]
            act_list = [{"id": a["id"], "question": a["question_text"]} for a in actuals_data]
            
            comparisons = asyncio.run(run_comparison(pred_list, act_list))
            
            comp_insert_payload = []
            for c in comparisons:
                comp_insert_payload.append({
                    "earnings_call_id": ec_id,
                    "predicted_question_id": c.get("predicted_id"),
                    "actual_question_id": c.get("matched_actual_id"),
                    "was_asked": c.get("was_asked", False),
                    "similarity_score": c.get("similarity_score", 0),
                    "feedback": c.get("feedback")
                })
            
            if comp_insert_payload:
                supabase.table("predicted_vs_actual_comparisons").insert(comp_insert_payload).execute()

        update_status("COMPLETE")

    except Exception as e:
        pipeline_tasks[task_id] = f"ERROR: {str(e)}"
        print(f"Pipeline error for {task_id}: {e}")
    finally:
        for h in hist_fin_paths:
            try: os.remove(h["path"])
            except: pass
        if cur_fin_path:
            try: os.remove(cur_fin_path)
            except: pass
        if cur_ec_path:
            try: os.remove(cur_ec_path)
            except: pass

