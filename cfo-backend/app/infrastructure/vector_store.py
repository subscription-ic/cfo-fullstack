"""Vector store helpers: batched chunk inserts + match_document_chunks RPC."""

from __future__ import annotations

from typing import Any

from supabase import Client


def insert_chunks(
    supabase: Client,
    rows: list[dict[str, Any]],
    batch_size: int = 32,
) -> None:
    """Insert chunk rows into document_chunks in batches."""
    for start in range(0, len(rows), batch_size):
        batch = rows[start : start + batch_size]
        supabase.table("document_chunks").insert(batch).execute()


def delete_chunks_by_document(supabase: Client, document_id: str) -> None:
    try:
        supabase.table("document_chunks").delete().eq("document_id", document_id).execute()
    except Exception:
        pass


def match_document_chunks(supabase: Client, params: dict[str, Any]) -> list[dict[str, Any]]:
    """Call the match_document_chunks RPC and return the data list."""
    resp = supabase.rpc("match_document_chunks", params).execute()
    return list(resp.data or [])
