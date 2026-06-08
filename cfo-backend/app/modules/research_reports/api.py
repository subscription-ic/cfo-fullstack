from fastapi import APIRouter, HTTPException, Query

from app.core.dependencies import SupabaseDep
from app.modules.research_reports import service as research_reports_service

router = APIRouter(tags=["research-reports"])


@router.get("/research-reports")
def get_research_reports(
    supabase: SupabaseDep,
    company: str = Query(..., description="Company name (ILIKE match)."),
    fiscal_year: int = Query(..., description="Indian fiscal year, e.g. 2026."),
    quarter: str = Query(..., description="Q1, Q2, Q3, or Q4"),
):
    try:
        reports = research_reports_service.list_research_reports(
            supabase, company, fiscal_year, quarter
        )
        return {
            "company": company,
            "fiscal_year": fiscal_year,
            "quarter": quarter,
            "reports": reports,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
