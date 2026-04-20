"""Backfill exact PDF page numbers into document_chunks.metadata.

Run from cfo-backend:
    python -m app.bootstrap.backfill_chunk_page_numbers --limit 50
    python -m app.bootstrap.backfill_chunk_page_numbers --doc-id <uuid> --force

This script reads PDFs from Supabase Storage, finds best matching page per chunk,
and updates:
  - metadata.page_number
  - metadata.citation   (file_ref#page)
  - metadata.file_ref
  - metadata.source_filename
"""

from __future__ import annotations

import argparse
import io
import re
from pathlib import Path

from pypdf import PdfReader
from supabase import create_client

from app.core.config import get_settings, require_supabase_config


def _normalize(text: str) -> str:
    text = text.lower()
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return text.strip()


def _safe_stem(name: str, max_len: int = 32) -> str:
    base = Path(name).name or "document"
    stem = Path(base).stem
    stem = re.sub(r"[^\w.\-]+", "-", stem, flags=re.UNICODE).strip("-_.") or "document"
    return stem[:max_len]


def _file_ref(document_id: str) -> str:
    ref = document_id.replace("-", "")[:6]
    return ref if len(ref) >= 6 else (ref + "000000")[:6]


def _extract_pdf_pages(pdf_bytes: bytes) -> list[tuple[int, str]]:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    pages: list[tuple[int, str]] = []
    for i, p in enumerate(reader.pages, start=1):
        t = p.extract_text() or ""
        n = _normalize(t)
        if n:
            pages.append((i, n))
    return pages


def _best_page(chunk_text: str, pages: list[tuple[int, str]]) -> int:
    target = _normalize(chunk_text)
    if not target:
        return 1
    target_tokens = set(target.split())
    if not target_tokens:
        return 1
    best_page = 1
    best_score = -1.0
    for page_num, page_txt in pages:
        page_tokens = set(page_txt.split())
        if not page_tokens:
            continue
        inter = len(target_tokens & page_tokens)
        score = inter / max(1, len(target_tokens))
        if score > best_score:
            best_score = score
            best_page = page_num
    return best_page


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--doc-id", default=None, help="Only process one document id")
    parser.add_argument("--limit", type=int, default=100, help="Max documents to process")
    parser.add_argument("--force", action="store_true", help="Recompute even if metadata.page_number exists")
    args = parser.parse_args()

    require_supabase_config()
    s = get_settings()
    supabase = create_client(s.supabase_url, s.supabase_key)

    q = supabase.table("documents").select("id,storage_bucket,storage_path,original_filename,mime_type")
    if args.doc_id:
        q = q.eq("id", args.doc_id)
    rows = (q.limit(args.limit).execute().data or [])

    processed = 0
    updated = 0
    for d in rows:
        doc_id = str(d["id"])
        filename = (d.get("original_filename") or "").lower()
        mime = (d.get("mime_type") or "").lower()
        if not (filename.endswith(".pdf") or "pdf" in mime):
            continue

        bucket = d.get("storage_bucket") or s.storage_bucket
        path = d.get("storage_path")
        if not path:
            continue

        try:
            pdf_bytes = supabase.storage.from_(bucket).download(path)
            pages = _extract_pdf_pages(pdf_bytes)
            if not pages:
                continue
        except Exception as exc:
            print(f"[skip] {doc_id} failed download/extract: {exc}")
            continue

        chunks = (
            supabase.table("document_chunks")
            .select("id,content,metadata")
            .eq("document_id", doc_id)
            .execute()
            .data
            or []
        )
        if not chunks:
            continue

        ref = _file_ref(doc_id)
        stem = _safe_stem(str(d.get("original_filename") or "document"))
        for ch in chunks:
            meta = dict(ch.get("metadata") or {})
            if (not args.force) and meta.get("page_number"):
                continue
            page = _best_page(str(ch.get("content") or ""), pages)
            meta["page_number"] = page
            meta["file_ref"] = ref
            meta["citation"] = f"{ref}#{page}"
            meta["citation_label"] = f"{stem}#{page}"
            if d.get("original_filename"):
                meta["source_filename"] = Path(str(d["original_filename"])).name
            if d.get("storage_bucket"):
                meta["storage_bucket"] = d["storage_bucket"]
            if d.get("storage_path"):
                meta["storage_path"] = d["storage_path"]
            if d.get("mime_type"):
                meta["mime_type"] = d["mime_type"]

            supabase.table("document_chunks").update({"metadata": meta}).eq("id", ch["id"]).execute()
            updated += 1
        processed += 1
        print(f"[ok] document {doc_id} processed")

    print(f"Done. documents={processed}, chunks_updated={updated}")


if __name__ == "__main__":
    main()
