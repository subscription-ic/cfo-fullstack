"""Thin data-access layer for the `documents` table."""

from __future__ import annotations

from typing import Any

from supabase import Client


class DocumentsRepository:
    def __init__(self, supabase: Client) -> None:
        self._s = supabase

    def list_catalog(self, limit: int = 500) -> list[dict[str, Any]]:
        res = (
            self._s.table("documents")
            .select(
                "id, company, document_type, quarter, fiscal_year, "
                "original_filename, created_at, updated_at"
            )
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return list(res.data or [])

    def find_by_hash(self, content_hash: str) -> dict[str, Any] | None:
        """Returns an existing row matching the hash, or None.

        Returns None silently if the `content_hash` column is missing — lets the
        app run before migration 012 is applied.
        """
        try:
            res = (
                self._s.table("documents")
                .select("id, original_filename, company, fiscal_year, quarter, created_at")
                .eq("content_hash", content_hash)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            if "content_hash" in str(exc):
                return None
            raise
        rows = res.data or []
        return rows[0] if rows else None

    def get_storage_ref(self, document_id: str) -> dict[str, Any] | None:
        res = (
            self._s.table("documents")
            .select("id, storage_bucket, storage_path")
            .eq("id", document_id)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        return rows[0] if rows else None

    def find_ids_by_period(
        self, company: str, fiscal_year: int, quarter: str
    ) -> list[str]:
        """Document ids for an exact (company, fiscal_year, quarter).

        Exact equality (not ilike) is deliberate: this feeds a destructive
        per-quarter delete, so "HDFC" must not match "HDFC Bank".
        """
        res = (
            self._s.table("documents")
            .select("id")
            .eq("company", company)
            .eq("fiscal_year", fiscal_year)
            .eq("quarter", quarter)
            .execute()
        )
        return [r["id"] for r in (res.data or []) if r.get("id")]

    def delete(self, document_id: str) -> None:
        self._s.table("documents").delete().eq("id", document_id).execute()
