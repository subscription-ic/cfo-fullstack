"""Read side: list analyst research reports for a company + quarter."""

from __future__ import annotations

import logging
from typing import Any

from supabase import Client

logger = logging.getLogger(__name__)


def list_research_reports(
    supabase: Client, company: str, fiscal_year: int, quarter: str
) -> list[dict[str, Any]]:
    """Return analyst research reports for the exact (company, FY, quarter),
    ordered by target price descending (rows without a target sort last)."""
    try:
        resp = (
            supabase.table("analyst_research_reports")
            .select(
                "firm, rating, rating_tone, target_price, target_price_display, summary"
            )
            .ilike("company", f"%{company.strip()}%")
            .eq("fiscal_year", fiscal_year)
            .eq("quarter", quarter.strip())
            .execute()
        )
        rows = list(resp.data or [])
    except Exception as exc:
        logger.warning("Failed to list research reports: %s", exc, exc_info=True)
        return []

    def _sort_key(r: dict[str, Any]) -> float:
        tp = r.get("target_price")
        try:
            return float(tp) if tp is not None else float("-inf")
        except (TypeError, ValueError):
            return float("-inf")

    rows.sort(key=_sort_key, reverse=True)
    return rows
