"""Auto-refresh predicted Q&A from uploaded financial documents.

Wired into the ingestion orchestrator: a successful FIN upload regenerates the
question set for that (company, FY, Q); subsequent PR / PPT uploads override
the existing set only if questions already exist for that quarter.
"""

from __future__ import annotations

import logging

from supabase import Client

from app.modules.question_generation.schemas import QuestionGenerationRequest
from app.modules.question_generation.service import run_question_generation

logger = logging.getLogger(__name__)


def has_existing_questions(
    supabase: Client, company: str, fiscal_year: int, quarter: str
) -> bool:
    try:
        res = (
            supabase.table("predicted_qa")
            .select("id")
            .eq("company", company)
            .eq("fiscal_year", fiscal_year)
            .eq("quarter", quarter)
            .limit(1)
            .execute()
        )
        return bool(res.data)
    except Exception as exc:
        logger.warning(
            "predicted_qa existence check failed for %s/%s/%s: %s",
            company, fiscal_year, quarter, exc,
        )
        return False


def refresh_for_quarter(
    supabase: Client, company: str, fiscal_year: int, quarter: str
) -> None:
    try:
        supabase.table("predicted_qa").delete().eq("company", company).eq(
            "fiscal_year", fiscal_year
        ).eq("quarter", quarter).execute()
    except Exception as exc:
        logger.warning(
            "predicted_qa delete failed for %s/%s/%s: %s",
            company, fiscal_year, quarter, exc,
        )

    req = QuestionGenerationRequest(
        company=company,
        fiscal_year=fiscal_year,
        quarter=quarter,
        persist=True,
    )
    try:
        run_question_generation(supabase, req)
    except Exception as exc:
        logger.error(
            "predicted_qa regeneration failed for %s/%s/%s: %s",
            company, fiscal_year, quarter, exc,
        )
