from fastapi import APIRouter, HTTPException, Query

from app.core.dependencies import SupabaseDep
from app.modules.diagnostics import service as diagnostics_service

router = APIRouter(prefix="/api/diagnostics", tags=["diagnostics"])


@router.get("/taxonomy-drift")
def get_taxonomy_drift(
    supabase: SupabaseDep,
    company: str = Query(..., description="Company name (ILIKE partial match)"),
    fiscal_year: int = Query(..., description="Fiscal year, e.g. 2026"),
    quarter: str = Query(..., description="Q1/Q2/Q3/Q4"),
):
    try:
        return diagnostics_service.taxonomy_drift(supabase, company, fiscal_year, quarter)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/similarity-histogram")
def get_similarity_histogram(
    supabase: SupabaseDep,
    company: str = Query(..., description="Company name (ILIKE partial match)"),
    fiscal_year: int = Query(..., description="Fiscal year, e.g. 2026"),
    quarter: str = Query(..., description="Q1/Q2/Q3/Q4"),
    bucket_size: float = Query(10.0, ge=1.0, le=50.0, description="Histogram bucket width (0–100 scale)"),
):
    try:
        return diagnostics_service.similarity_histogram(
            supabase, company, fiscal_year, quarter, bucket_size,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/confusion-invariants")
def get_confusion_invariants(
    supabase: SupabaseDep,
    company: str = Query(..., description="Company name (ILIKE partial match)"),
    fiscal_year: int = Query(..., description="Fiscal year, e.g. 2026"),
    quarter: str = Query(..., description="Q1/Q2/Q3/Q4"),
):
    try:
        return diagnostics_service.confusion_invariants(supabase, company, fiscal_year, quarter)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
