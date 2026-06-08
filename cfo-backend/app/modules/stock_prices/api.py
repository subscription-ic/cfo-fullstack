from fastapi import APIRouter, HTTPException, Query

from app.core.dependencies import SupabaseDep
from app.modules.stock_prices import news_service, service as stock_service

router = APIRouter(prefix="/api/stock", tags=["stock"])


@router.get("/quarter-prices")
def get_quarter_prices(
    supabase: SupabaseDep,
    company: str = Query(..., description="Company name; auto-resolved to a Yahoo ticker."),
    fiscal_year: int = Query(..., description="Indian fiscal year, e.g. 2026 = Apr 2025 → Mar 2026"),
    quarter: str = Query(..., description="Q1, Q2, Q3, or Q4"),
):
    try:
        return stock_service.fetch_quarter_prices(supabase, company, fiscal_year, quarter)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/quarter-news-sentiment")
def get_quarter_news_sentiment(
    company: str = Query(..., description="Company name; auto-resolved to a Yahoo ticker."),
    fiscal_year: int = Query(..., description="Indian fiscal year, e.g. 2026 = Apr 2025 → Mar 2026"),
    quarter: str = Query(..., description="Q1, Q2, Q3, or Q4"),
):
    try:
        return news_service.fetch_news_sentiment(company, fiscal_year, quarter)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
