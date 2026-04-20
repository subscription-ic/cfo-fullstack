"""Document analysis pipeline endpoints."""

from fastapi import APIRouter, HTTPException

from app.core.dependencies import CurrentUserDep, SupabaseDep
from app.modules.analysis import service as analysis_service
from app.modules.analysis.schemas import AnalysisResult, RunAnalysisRequest, RunAnalysisResponse

router = APIRouter()


@router.post("/analysis/run", response_model=RunAnalysisResponse)
def run_document_analysis(
    _user: CurrentUserDep,
    supabase: SupabaseDep,
    body: RunAnalysisRequest,
) -> RunAnalysisResponse:
    try:
        result = analysis_service.run_analysis(supabase, body.document_id, body.force)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    summary_parts = [
        f"{len(result.themes)} themes",
        f"{len(result.deltas)} deltas",
        f"{len(result.signals)} signals",
        f"{len(result.question_patterns)} question patterns",
    ]
    return RunAnalysisResponse(
        analysis=result,
        context_summary=f"Analysis complete: {', '.join(summary_parts)}.",
    )


@router.get("/analysis/{document_id}", response_model=AnalysisResult)
def get_analysis(
    _user: CurrentUserDep,
    supabase: SupabaseDep,
    document_id: str,
) -> AnalysisResult:
    result = analysis_service.get_analysis(supabase, document_id)
    if result is None:
        raise HTTPException(status_code=404, detail="No analysis found for this document")
    return result


@router.get("/analysis/company/{company}", response_model=list[AnalysisResult])
def list_company_analyses(
    _user: CurrentUserDep,
    supabase: SupabaseDep,
    company: str,
) -> list[AnalysisResult]:
    return analysis_service.list_company_analyses(supabase, company)
