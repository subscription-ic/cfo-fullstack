"""Documents service: catalog listing + full cascade delete."""

from __future__ import annotations

from typing import Any

from supabase import Client

from app.infrastructure.storage import remove_object
from app.infrastructure.vector_store import delete_chunks_by_document
from app.modules.documents.repository import DocumentsRepository


def list_catalog(supabase: Client) -> list[dict[str, Any]]:
    return DocumentsRepository(supabase).list_catalog()


def delete_document_cascade(supabase: Client, document_id: str) -> None:
    """Fully remove a document and every trace of it:
    storage object, document_chunks (vector rows), document_analyses,
    actual_earnings_qa extracted from this document, then the documents row.
    """
    repo = DocumentsRepository(supabase)
    row = repo.get_storage_ref(document_id)
    if not row:
        raise LookupError(f"document {document_id} not found")

    bucket = row.get("storage_bucket")
    path = row.get("storage_path")
    if bucket and path:
        remove_object(supabase, bucket, path)

    delete_chunks_by_document(supabase, document_id)

    try:
        supabase.table("document_analyses").delete().eq("document_id", document_id).execute()
    except Exception:
        pass

    try:
        supabase.table("actual_earnings_qa").delete().eq(
            "source_document_id", document_id
        ).execute()
    except Exception:
        pass

    repo.delete(document_id)


def delete_quarter_cascade(
    supabase: Client, company: str, fiscal_year: int, quarter: str
) -> dict[str, int]:
    """Remove every trace of a single (company, fiscal_year, quarter):

    each document via the per-document cascade, plus any actual_earnings_qa
    and predicted_qa rows tied to that period (covers manually-added Q&A with
    no source document). Idempotent and re-runnable: an empty quarter returns
    {"documents_deleted": 0} without error.
    """
    repo = DocumentsRepository(supabase)
    doc_ids = repo.find_ids_by_period(company, fiscal_year, quarter)

    deleted = 0
    for document_id in doc_ids:
        try:
            delete_document_cascade(supabase, document_id)
            deleted += 1
        except Exception:
            # Survive a single bad document; the op stays re-runnable.
            continue

    try:
        supabase.table("actual_earnings_qa").delete().eq("company", company).eq(
            "fiscal_year", fiscal_year
        ).eq("quarter", quarter).execute()
    except Exception:
        pass

    try:
        supabase.table("predicted_qa").delete().eq("company", company).eq(
            "fiscal_year", fiscal_year
        ).eq("quarter", quarter).execute()
    except Exception:
        pass

    return {"documents_deleted": deleted}
