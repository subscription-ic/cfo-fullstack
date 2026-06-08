"""Historical Intelligence Hub endpoints."""

from fastapi import APIRouter, HTTPException, Query, status

from app.core.dependencies import CurrentUserDep, SupabaseDep
from app.modules.documents import service as documents_service
from app.modules.historical import service as historical_service
from app.modules.historical.schemas import (
    ChatRequest,
    ChatResponse,
    KeyTopicsResponse,
    QuarterDetailResponse,
    QuartersListResponse,
    SummaryRequest,
    SummaryResponse,
)

router = APIRouter()


@router.get("/historical/topics", response_model=KeyTopicsResponse)
def get_key_topics(
    supabase: SupabaseDep,
    company: str = Query(..., min_length=1),
    num_quarters: int = Query(3, ge=1, le=8),
) -> KeyTopicsResponse:
    return historical_service.get_key_topics(supabase, company, num_quarters)


@router.get("/historical/quarters", response_model=QuartersListResponse)
def get_available_quarters(
    supabase: SupabaseDep,
    company: str = Query(..., min_length=1),
) -> QuartersListResponse:
    return historical_service.get_available_quarters(supabase, company)


@router.delete("/historical/quarter", status_code=status.HTTP_200_OK)
def delete_quarter(
    _user: CurrentUserDep,
    supabase: SupabaseDep,
    company: str = Query(..., min_length=1),
    fiscal_year: int = Query(...),
    quarter: str = Query(..., min_length=1),
) -> dict[str, int]:
    """Purge all data for one (company, fiscal_year, quarter): documents and
    their cascade, plus the period's actual and predicted Q&A."""
    try:
        return documents_service.delete_quarter_cascade(
            supabase, company, fiscal_year, quarter
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


@router.get("/historical/quarter-detail", response_model=QuarterDetailResponse)
def get_quarter_detail(
    supabase: SupabaseDep,
    company: str = Query(..., min_length=1),
    fiscal_year: int = Query(...),
    quarter: str = Query(...),
) -> QuarterDetailResponse:
    return historical_service.get_quarter_detail(supabase, company, fiscal_year, quarter)


@router.post("/historical/summary", response_model=SummaryResponse)
def generate_summary(
    supabase: SupabaseDep,
    body: SummaryRequest,
) -> SummaryResponse:
    try:
        return historical_service.generate_quarter_summary(
            supabase, body.company, body.fiscal_year, body.quarter
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/historical/chat", response_model=ChatResponse)
def chat(
    supabase: SupabaseDep,
    body: ChatRequest,
) -> ChatResponse:
    try:
        return historical_service.chat_with_context(
            supabase,
            message=body.message,
            company=body.company,
            quarter=body.quarter,
            fiscal_year=body.fiscal_year,
            history=body.history,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
