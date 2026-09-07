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

def get_download_url(supabase: Client, document_id: str, expires_in: int = 300) -> dict[str, Any]:
    """Short-lived signed URL for viewing/downloading an ingested document.

    Read-only: nothing in the database or storage is modified. The frontend has
    no Supabase credentials, so the signing has to happen here.
    """
    repo = DocumentsRepository(supabase)
    row = repo.get_storage_ref(document_id)
    if not row:
        raise LookupError(f"document {document_id} not found")

    bucket = row.get("storage_bucket")
    path = (row.get("storage_path") or "").lstrip("/")
    if not bucket or not path:
        raise LookupError("document has no stored file")

    signed = supabase.storage.from_(bucket).create_signed_url(path, expires_in)
    url = signed.get("signedURL") or signed.get("signedUrl") or signed.get("signed_url")
    if not url:
        raise RuntimeError("storage did not return a signed URL")
    return {"url": url, "expires_in": expires_in}

def delete_company_cascade(supabase: Client, company: str) -> dict[str, int]:
    """Remove every trace of one company from the CURRENT schema.

    Deletes, in dependency order: each document via the per-document cascade
    (storage object, chunks, analyses, and Q&A extracted from it), then any
    remaining predicted_qa / actual_earnings_qa / analyst_research_reports rows
    carrying that company name.

    Deliberately does NOT touch the legacy prototype tables (companies,
    earnings_calls, predicted_questions, actual_questions) — a separate legacy
    deployment still reads those.

    Matching is exact on the company name, not a LIKE, so "HDFC" never takes
    "HDFC Bank" with it. Returns per-table counts of what was removed.
    """
    name = (company or "").strip()
    if not name:
        raise ValueError("company name is required")

    counts = {"documents": 0, "predicted_qa": 0, "actual_earnings_qa": 0,
              "analyst_research_reports": 0}

    repo = DocumentsRepository(supabase)
    try:
        rows = (
            supabase.table("documents").select("id").eq("company", name).execute()
        ).data or []
    except Exception:
        rows = []
    for row in rows:
        try:
            delete_document_cascade(supabase, row["id"])
            counts["documents"] += 1
        except Exception:
            # survive one bad document so the rest still clears
            continue

    for table in ("predicted_qa", "actual_earnings_qa", "analyst_research_reports"):
        try:
            res = supabase.table(table).delete().eq("company", name).execute()
            counts[table] = len(res.data or [])
        except Exception:
            pass

    return counts
