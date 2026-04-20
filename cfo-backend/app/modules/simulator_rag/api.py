from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.dependencies import SupabaseDep
from app.modules.simulator_rag.service import build_suggested_answer_from_uploads

router = APIRouter()


class SuggestedAnswerRequest(BaseModel):
    question: str = Field(min_length=1, max_length=8000)
    company: str | None = None
    fiscal_year: int | None = None
    quarter: str | None = None


@router.post("/simulator/suggested-answer")
def post_simulator_suggested_answer(body: SuggestedAnswerRequest, supabase: SupabaseDep):
    company = (body.company or "").strip() or None
    quarter = (body.quarter or "").strip() or None
    return build_suggested_answer_from_uploads(
        supabase,
        body.question,
        company,
        body.fiscal_year,
        quarter,
    )
