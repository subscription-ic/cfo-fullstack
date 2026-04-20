"""Predicted Q&A review queries.

Thin Supabase helpers for the admin review panel. No repository layer per
project defaults — this module owns both data access and light shaping.
"""

from __future__ import annotations

from typing import Any

from supabase import Client


def list_predicted_questions(
    supabase: Client,
    company: str | None,
    fiscal_year: int | None = None,
    quarter: str | None = None,
) -> dict[str, Any]:
    query = supabase.table("predicted_qa").select("*").order("created_at", desc=False)
    if company:
        query = query.ilike("company", f"%{company}%")
    if fiscal_year is not None:
        query = query.eq("fiscal_year", fiscal_year)
    if quarter:
        query = query.eq("quarter", quarter)
    response = query.execute()
    data = response.data or []
    return {"data": data, "count": len(data)}


def get_predicted_question(supabase: Client, question_id: str) -> dict[str, Any] | None:
    response = (
        supabase.table("predicted_qa")
        .select("*")
        .eq("id", question_id)
        .single()
        .execute()
    )
    return response.data


def list_known_companies(supabase: Client) -> list[str]:
    """Distinct company names across predicted_qa, actual_earnings_qa, documents."""
    names: set[str] = set()
    for table in ("predicted_qa", "actual_earnings_qa", "documents"):
        try:
            resp = supabase.table(table).select("company").execute()
            for row in resp.data or []:
                val = row.get("company")
                if val:
                    names.add(str(val).strip())
        except Exception:
            continue
    return sorted(n for n in names if n)
