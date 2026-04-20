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
