"""Thin data-access helpers for the `document_analyses` table.

Kept intentionally minimal: the existing service.py still reaches into
Supabase directly in several places. New callers should prefer this
repository; existing call sites will be migrated incrementally.
"""

from __future__ import annotations

from typing import Any

from supabase import Client


class AnalysisRepository:
    def __init__(self, supabase: Client) -> None:
        self._s = supabase

    def get_by_document(self, document_id: str) -> dict[str, Any] | None:
        res = (
            self._s.table("document_analyses")
            .select("*")
            .eq("document_id", document_id)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        return rows[0] if rows else None

    def list_for_company(self, company: str) -> list[dict[str, Any]]:
        res = (
            self._s.table("document_analyses")
            .select("*")
            .eq("company", company)
            .order("created_at", desc=True)
            .execute()
        )
        return list(res.data or [])

    def delete_by_document(self, document_id: str) -> None:
        try:
            self._s.table("document_analyses").delete().eq("document_id", document_id).execute()
        except Exception:
            pass
