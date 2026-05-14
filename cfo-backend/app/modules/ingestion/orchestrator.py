"""Top-level upload pipeline: extract, chunk, embed, persist, enqueue QA extraction."""

from __future__ import annotations

import hashlib
import uuid
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, UploadFile
from supabase import Client

from app.core.config import get_settings
from app.infrastructure.llm import embed_texts
from app.infrastructure.storage import ensure_bucket, upload_object
from app.infrastructure.vector_store import insert_chunks
from app.modules.documents.repository import DocumentsRepository
from app.modules.ingestion.chunking import chunk_text
from app.modules.ingestion.enrichment import (
    classify_document_type,
    detect_topics,
    extract_financial_metrics,
    importance_score,
    is_table_like,
    segment_sections,
)
from app.modules.ingestion.schemas import FileUploadResult
from app.modules.ingestion.summarization import PageAnalysis, analyze_pages
from app.modules.ingestion.text_extraction import extract_pdf_pages
from app.shared.constants import PAGE_CHUNK_MAX_CHARS, TRANSCRIPT_DOC_TYPES
from app.shared.utils import (
    document_file_ref,
    safe_citation_stem,
    utc_now_iso,
)


_PAGE_COLUMN_KEYS = (
    "page_number",
    "page_summary",
    "l1_heading",
    "l2_headings",
    "l3_headings",
)


def _embedding_to_db_value(vec: list[float]) -> Any:
    """Format embedding for PostgREST / Supabase."""
    return vec


def _insert_chunks_with_fallback(supabase: Client, rows: list[dict[str, Any]]) -> None:
    """Insert chunks; if migration 013 hasn't been applied, retry without the
    new top-level page columns (values remain available inside `metadata`)."""
    try:
        insert_chunks(supabase, rows)
        return
    except Exception as exc:
        msg = str(exc)
        if not any(key in msg for key in _PAGE_COLUMN_KEYS):
            raise
    stripped = [
        {k: v for k, v in row.items() if k not in _PAGE_COLUMN_KEYS} for row in rows
    ]
    insert_chunks(supabase, stripped)


def process_upload_file(
    supabase: Client,
    upload: UploadFile,
    company: str,
    fiscal_year: int,
    quarter: str,
    document_type: str,
    source_category: str,
    background_tasks: BackgroundTasks | None = None,
) -> FileUploadResult:
    s = get_settings()
    bucket = s.storage_bucket
    filename = upload.filename or "unnamed"
    try:
        raw = upload.file.read()
        if not raw:
            return FileUploadResult(filename=filename, ok=False, error="Empty file")

        content_hash = hashlib.sha256(raw).hexdigest()
        existing = DocumentsRepository(supabase).find_by_hash(content_hash)
        if existing:
            existing_name = existing.get("original_filename") or existing.get("id")
            return FileUploadResult(
                filename=filename,
                ok=False,
                error=(
                    f"Duplicate file: identical content already ingested as "
                    f"'{existing_name}' ({existing.get('company')} "
                    f"{existing.get('quarter')} FY{existing.get('fiscal_year')})."
                ),
            )

        fn_lower = filename.lower()
        ct = (upload.content_type or "").lower()
        is_pdf = fn_lower.endswith(".pdf") or "pdf" in ct
        is_txt = fn_lower.endswith(".txt") or ct.startswith("text/plain")

        doc_id = str(uuid.uuid4())
        file_ref = document_file_ref(doc_id)
        citation_stem = safe_citation_stem(filename)

        chunk_records: list[dict[str, Any]] = []
        all_text_for_analysis: list[str] = []
        page_analyses: dict[int, PageAnalysis] = {}
        # Unified page-chunking strategy. PDFs split by real pages; TXT files are
        # treated as a single logical page (page 1), since they have no paging.
        if is_txt:
            txt = raw.decode("utf-8", errors="replace").strip()
            if not txt:
                return FileUploadResult(filename=filename, ok=False, error="No extractable text")
            sections = segment_sections(txt)
            dominant_section = sections[0][0] if sections else "general"
            page_analyses = analyze_pages([(1, txt)], company=company)
            pieces = (
                [txt]
                if len(txt) <= PAGE_CHUNK_MAX_CHARS
                else chunk_text(txt, size=PAGE_CHUNK_MAX_CHARS, overlap=200)
            )
            for piece in pieces:
                all_text_for_analysis.append(piece)
                chunk_records.append(
                    {
                        "content": piece,
                        "page": 1,
                        "section": dominant_section,
                        "kind": "table" if is_table_like(piece) else "narrative",
                        "topics": detect_topics(piece),
                        "importance": importance_score(piece),
                    }
                )
        elif is_pdf:
            pages = extract_pdf_pages(raw)
            if not pages:
                return FileUploadResult(
                    filename=filename,
                    ok=False,
                    error=(
                        "No extractable text — the PDF appears to be image-only "
                        "(scanned). Install Tesseract OCR on the server or "
                        "upload a text-based PDF."
                    ),
                )
            page_analyses = analyze_pages(pages, company=company)
            # Page-level chunking: each PDF page is one chunk. Preserves citation
            # fidelity (every chunk maps to a single page) and keeps retrieved
            # context coherent. Pages longer than PAGE_CHUNK_MAX_CHARS are split
            # into sub-pages so embeddings don't get truncated.
            for page_num, page_text in pages:
                page_text = page_text.strip()
                if not page_text:
                    continue
                sections = segment_sections(page_text)
                dominant_section = sections[0][0] if sections else "general"
                if len(page_text) <= PAGE_CHUNK_MAX_CHARS:
                    page_pieces = [page_text]
                else:
                    page_pieces = chunk_text(
                        page_text,
                        size=PAGE_CHUNK_MAX_CHARS,
                        overlap=200,
                    )
                for piece in page_pieces:
                    all_text_for_analysis.append(piece)
                    chunk_records.append(
                        {
                            "content": piece,
                            "page": page_num,
                            "section": dominant_section,
                            "kind": "table" if is_table_like(piece) else "narrative",
                            "topics": detect_topics(piece),
                            "importance": importance_score(piece),
                        }
                    )
        else:
            return FileUploadResult(filename=filename, ok=False, error="Unsupported file type (use PDF or TXT)")

        if not chunk_records:
            return FileUploadResult(filename=filename, ok=False, error="No chunks after extraction")

        full_text = "\n\n".join(all_text_for_analysis)
        # Preserve the admin-provided code (FIN/PR/TR/PPT/AR/GUIDE/SUPP) as the canonical
        # document_type. The heuristic detector output is kept only as a secondary hint.
        detected_doc_type_hint = classify_document_type(full_text, document_type)
        canonical_doc_type = document_type or detected_doc_type_hint
        financial_metrics = extract_financial_metrics(full_text)
        section_set = sorted({str(r["section"]) for r in chunk_records})

        storage_path = f"{company}/{doc_id}/{filename}"

        ensure_bucket(supabase, bucket)
        upload_object(supabase, bucket, storage_path, raw, upload.content_type)

        doc_row = {
            "id": doc_id,
            "company": company,
            "fiscal_year": fiscal_year,
            "quarter": quarter,
            "document_type": canonical_doc_type,
            "source_category": source_category,
            "storage_bucket": bucket,
            "storage_path": storage_path,
            "original_filename": filename,
            "mime_type": upload.content_type,
            "size_bytes": len(raw),
            "content_hash": content_hash,
            "processing_status": "processing",
        }
        try:
            supabase.table("documents").insert(doc_row).execute()
        except Exception as exc:
            # Graceful fallback if migration 012 (content_hash) has not been
            # applied yet: retry the insert without the new column so ingestion
            # still works. Dedupe is silently disabled until the migration runs.
            if "content_hash" in str(exc):
                doc_row.pop("content_hash", None)
                supabase.table("documents").insert(doc_row).execute()
            else:
                raise

        pieces = [str(r["content"]) for r in chunk_records]
        if not pieces:
            supabase.table("documents").update(
                {"processing_status": "failed", "error_message": "No chunks", "updated_at": utc_now_iso()}
            ).eq("id", doc_id).execute()
            return FileUploadResult(filename=filename, ok=False, error="No chunks after extraction")

        embeddings = embed_texts(pieces)
        dim = s.embedding_dimension
        for emb in embeddings:
            if len(emb) != dim:
                supabase.table("documents").update(
                    {
                        "processing_status": "failed",
                        "error_message": f"Embedding dim {len(emb)} != {dim}",
                        "updated_at": utc_now_iso(),
                    }
                ).eq("id", doc_id).execute()
                return FileUploadResult(
                    filename=filename, ok=False, error=f"Embedding dimension mismatch (expected {dim})"
                )

        chunk_rows: list[dict[str, Any]] = []
        for i, (record, emb) in enumerate(zip(chunk_records, embeddings)):
            content = str(record["content"])
            page_num = int(record["page"])
            citation = f"{file_ref}#{page_num}"
            analysis = page_analyses.get(page_num, PageAnalysis())
            financial_summary = [
                f"{m.get('metric')}:{m.get('value_text')}" for m in financial_metrics[:20]
            ]
            meta = {
                "company": company,
                "fiscal_year": fiscal_year,
                "quarter": quarter,
                "document_type": canonical_doc_type,
                "detected_document_type": detected_doc_type_hint,
                "source_category": source_category,
                "chunk_index": i,
                "section_type": str(record["section"]),
                "chunk_kind": str(record["kind"]),
                "topics": record["topics"],
                "importance_score": float(record["importance"]),
                "financial_metrics_count_doc": len(financial_metrics),
                "financial_metrics_doc": financial_summary,
                "source_filename": Path(filename).name,
                "page_number": page_num,
                "file_ref": file_ref,
                "citation": citation,
                "citation_label": f"{citation_stem}#{page_num}",
                "storage_bucket": bucket,
                "storage_path": storage_path,
                "mime_type": upload.content_type or "",
                "page_summary": analysis.summary,
                "page_primary_theme": analysis.primary_theme,
                "page_sub_themes": analysis.sub_themes,
                "l1_heading": analysis.l1_heading,
                "l2_headings": analysis.l2_headings,
                "l3_headings": analysis.l3_headings,
                "category_l1": analysis.category_l1,
                "category_l2": analysis.category_l2,
                "category_l3": analysis.category_l3,
            }
            chunk_rows.append(
                {
                    "id": str(uuid.uuid4()),
                    "document_id": doc_id,
                    "chunk_index": i,
                    "content": content,
                    "embedding": _embedding_to_db_value(emb),
                    "page_number": page_num,
                    "page_summary": analysis.summary,
                    "l1_heading": analysis.l1_heading or None,
                    "l2_headings": analysis.l2_headings,
                    "l3_headings": analysis.l3_headings,
                    "metadata": meta,
                }
            )

        _insert_chunks_with_fallback(supabase, chunk_rows)

        supabase.table("documents").update(
            {"processing_status": "completed", "error_message": None, "updated_at": utc_now_iso()}
        ).eq("id", doc_id).execute()

        if background_tasks is not None and canonical_doc_type in TRANSCRIPT_DOC_TYPES:
            # Import lazily to avoid a circular import between ingestion and
            # transcript_qa (transcript_qa may pull ingestion helpers in turn).
            from app.modules.transcript_qa.extractor import (
                extract_and_store_from_transcript,
            )

            background_tasks.add_task(
                extract_and_store_from_transcript,
                supabase,
                document_id=doc_id,
                company=company,
                fiscal_year=fiscal_year,
                quarter=quarter,
                transcript_text=full_text,
            )

        if background_tasks is not None:
            # FIN always (re)generates predicted Q&A for this quarter.
            # PR / PPT override only when a question set already exists — they
            # refine the prep, they don't seed it.
            if canonical_doc_type == "FIN":
                from app.modules.predicted_qa.refresh import refresh_for_quarter

                background_tasks.add_task(
                    refresh_for_quarter,
                    supabase,
                    company=company,
                    fiscal_year=fiscal_year,
                    quarter=quarter,
                )
            elif canonical_doc_type in ("PR", "PPT"):
                from app.modules.predicted_qa.refresh import (
                    has_existing_questions,
                    refresh_for_quarter,
                )

                if has_existing_questions(supabase, company, fiscal_year, quarter):
                    background_tasks.add_task(
                        refresh_for_quarter,
                        supabase,
                        company=company,
                        fiscal_year=fiscal_year,
                        quarter=quarter,
                    )

        return FileUploadResult(
            filename=filename,
            ok=True,
            document_id=doc_id,
            chunks_created=len(chunk_rows),
            detected_document_type=canonical_doc_type,
            sections_detected=section_set,
            financial_metrics_count=len(financial_metrics),
            chunking_strategy="page chunking",
        )
    except Exception as exc:
        return FileUploadResult(filename=filename, ok=False, error=str(exc))
