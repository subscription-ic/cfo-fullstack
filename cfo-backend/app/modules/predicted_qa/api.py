from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.core.dependencies import CurrentUserDep, SupabaseDep
from app.modules.documents import service as documents_service
from app.modules.predicted_qa import service as predicted_qa_service

router = APIRouter()


@router.get("/predicted-questions")
def get_predicted_questions(
    supabase: SupabaseDep,
    company: Optional[str] = Query(default=None),
    fiscal_year: Optional[int] = Query(default=None),
    quarter: Optional[str] = Query(default=None),
):
    try:
        return predicted_qa_service.list_predicted_questions(
            supabase, company, fiscal_year, quarter
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/predicted-questions/{question_id}")
def get_predicted_question(supabase: SupabaseDep, question_id: str):
    try:
        data = predicted_qa_service.get_predicted_question(supabase, question_id)
        if not data:
            raise HTTPException(status_code=404, detail="Question not found")
        return data
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/companies")
def get_companies(supabase: SupabaseDep):
    """Distinct company names from predicted_qa, actual_earnings_qa, and documents."""
    return {"companies": predicted_qa_service.list_known_companies(supabase)}

@router.delete("/companies/{company}")
def delete_company(
    _user: CurrentUserDep,
    supabase: SupabaseDep,
    company: str,
):
    """Delete a company and everything recorded against it. Destructive and
    irreversible; requires authentication. Legacy prototype tables untouched."""
    try:
        return documents_service.delete_company_cascade(supabase, company)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

