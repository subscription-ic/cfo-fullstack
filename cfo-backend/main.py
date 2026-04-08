"""
FastAPI backend for CFO Earnings Intelligence Copilot.

Endpoints:
  GET /api/predicted-questions          – all rows from predicted_qa
  GET /api/predicted-questions?company= – filter by company name

Run:
  uvicorn main:app --reload --port 8000
"""

import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
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

# Allow the Vite dev server (port 5173) and any other origin during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "CFO Earnings Intelligence API is running 🚀"}


@app.get("/api/predicted-questions")
def get_predicted_questions(company: Optional[str] = Query(default=None)):
    """
    Return all rows from predicted_qa table.
    Optionally filter by ?company=<name> (case-insensitive ILIKE).
    """
    try:
        query = supabase.table("predicted_qa").select("*").order("created_at", desc=False)
        if company:
            query = query.ilike("company", f"%{company}%")
        response = query.execute()
        return {"data": response.data, "count": len(response.data)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/predicted-questions/{question_id}")
def get_predicted_question(question_id: str):
    """Return a single predicted_qa row by id."""
    try:
        response = (
            supabase.table("predicted_qa")
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


@app.get("/api/companies")
def get_companies():
    """Return distinct list of companies in predicted_qa."""
    try:
        response = supabase.table("predicted_qa").select("company").execute()
        companies = sorted({row["company"] for row in response.data if row.get("company")})
        return {"companies": companies}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
