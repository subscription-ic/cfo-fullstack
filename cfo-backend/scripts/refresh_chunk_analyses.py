"""Refresh existing chunk metadata WITHOUT deleting or re-embedding.

For each completed document this script:
  1. Pulls its existing chunks (ordered by chunk_index).
  2. Groups them by page_number.
  3. Re-runs summarization.analyze_page() once per page on the reconstructed
     page text.
  4. UPDATEs each chunk's metadata in place with the refreshed summary,
     headings, taxonomy, and the new analyst-signal lists (quant_anchors,
     named_entities, catalyst_events, forward_statements).

Chunk IDs, content, and embeddings are NOT touched. Document rows are NOT
touched. Cost: ~1 LLM call per unique (document, page); zero embedding calls.

Run from cfo-backend:
    python -m scripts.refresh_chunk_analyses
    python -m scripts.refresh_chunk_analyses --company "pds limited"
    python -m scripts.refresh_chunk_analyses --company "pds limited" --fiscal-year 2026 --quarter Q3
    python -m scripts.refresh_chunk_analyses --skip-if-present (default — skip pages whose chunks already carry the new fields)
    python -m scripts.refresh_chunk_analyses --force          (re-analyze even pages that already look refreshed)
    python -m scripts.refresh_chunk_analyses --dry-run        (count only, no LLM calls)
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from collections import defaultdict
from typing import Any

from supabase import create_client

from app.core.config import get_settings, require_supabase_config
from app.modules.ingestion.summarization import analyze_page

logger = logging.getLogger("refresh_chunk_analyses")

# Keys produced by the new analyze_page that should be merged into each
# chunk's metadata. A chunk whose metadata already has any of them is
# considered "already refreshed" by default.
NEW_FIELDS = ("quant_anchors", "named_entities", "catalyst_events", "forward_statements")


def _meta_has_new_fields(meta: dict[str, Any]) -> bool:
    return any(meta.get(k) for k in NEW_FIELDS)


def _fetch_target_documents(
    client,
    company: str | None,
    fiscal_year: int | None,
    quarter: str | None,
) -> list[dict[str, Any]]:
    query = (
        client.table("documents")
        .select("id, company, fiscal_year, quarter, original_filename, processing_status")
        .eq("processing_status", "completed")
        .order("created_at", desc=False)
    )
    if company:
        query = query.ilike("company", f"%{company.strip()}%")
    if fiscal_year is not None:
        query = query.eq("fiscal_year", fiscal_year)
    if quarter:
        query = query.eq("quarter", quarter)
    resp = query.execute()
    return list(resp.data or [])


def _fetch_chunks_for_document(client, document_id: str) -> list[dict[str, Any]]:
    resp = (
        client.table("document_chunks")
        .select("id, content, page_number, metadata")
        .eq("document_id", document_id)
        .order("chunk_index", desc=False)
        .execute()
    )
    return list(resp.data or [])


def _group_by_page(chunks: list[dict[str, Any]]) -> dict[int, list[dict[str, Any]]]:
    by_page: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for c in chunks:
        page = c.get("page_number")
        if page is None:
            continue
        try:
            by_page[int(page)].append(c)
        except (TypeError, ValueError):
            continue
    return by_page


def _reconstruct_page_text(page_chunks: list[dict[str, Any]]) -> str:
    """Concatenate chunk contents in order. Each chunk was a slice of the
    original page text during ingestion, so joining them reconstructs (close
    enough to) the page text the original analyzer saw."""
    parts: list[str] = []
    for c in page_chunks:
        body = str(c.get("content") or "").strip()
        if body:
            parts.append(body)
    return "\n".join(parts)


def _update_chunk_metadata(
    client,
    chunk_id: str,
    existing_meta: dict[str, Any],
    analysis_dict: dict[str, Any],
) -> None:
    """Merge new analysis fields into existing metadata. Everything outside
    the analyzer's responsibility (company, fiscal_year, quarter, citation,
    embedding-relevant fields) is preserved as-is."""
    new_meta = dict(existing_meta or {})
    new_meta.update({
        "page_summary": analysis_dict.get("summary") or new_meta.get("page_summary"),
        "page_primary_theme": analysis_dict.get("primary_theme") or new_meta.get("page_primary_theme"),
        "page_sub_themes": analysis_dict.get("sub_themes") or new_meta.get("page_sub_themes"),
        "l1_heading": analysis_dict.get("l1_heading") or new_meta.get("l1_heading"),
        "l2_headings": analysis_dict.get("l2_headings") or new_meta.get("l2_headings"),
        "l3_headings": analysis_dict.get("l3_headings") or new_meta.get("l3_headings"),
        "category_l1": analysis_dict.get("category_l1") or new_meta.get("category_l1"),
        "category_l2": analysis_dict.get("category_l2") or new_meta.get("category_l2"),
        "category_l3": analysis_dict.get("category_l3") or new_meta.get("category_l3"),
        "quant_anchors": analysis_dict.get("quant_anchors") or [],
        "named_entities": analysis_dict.get("named_entities") or [],
        "catalyst_events": analysis_dict.get("catalyst_events") or [],
        "forward_statements": analysis_dict.get("forward_statements") or [],
    })

    update_payload: dict[str, Any] = {"metadata": new_meta}
    # Mirror to top-level chunk columns (migration 013) when they exist; the
    # exception fallback below handles older schemas that don't have them.
    update_payload["page_summary"] = analysis_dict.get("summary") or None
    update_payload["l1_heading"] = analysis_dict.get("l1_heading") or None
    update_payload["l2_headings"] = analysis_dict.get("l2_headings") or []
    update_payload["l3_headings"] = analysis_dict.get("l3_headings") or []

    try:
        client.table("document_chunks").update(update_payload).eq("id", chunk_id).execute()
    except Exception as exc:
        msg = str(exc)
        if "page_summary" in msg or "l1_heading" in msg:
            try:
                client.table("document_chunks").update({"metadata": new_meta}).eq("id", chunk_id).execute()
            except Exception as exc2:
                logger.warning("chunk %s metadata-only update failed: %s", chunk_id, exc2)
        else:
            logger.warning("chunk %s update failed: %s", chunk_id, exc)


def refresh_chunks(
    company: str | None = None,
    fiscal_year: int | None = None,
    quarter: str | None = None,
    skip_if_present: bool = True,
    dry_run: bool = False,
) -> dict[str, int]:
    require_supabase_config()
    s = get_settings()
    client = create_client(s.supabase_url, s.supabase_key)

    docs = _fetch_target_documents(client, company, fiscal_year, quarter)
    if not docs:
        logger.info("No completed documents match the filter; nothing to do.")
        return {
            "documents": 0,
            "pages_seen": 0,
            "pages_skipped_present": 0,
            "pages_analyzed": 0,
            "chunks_updated": 0,
            "errors": 0,
        }

    counters = {
        "documents": 0,
        "pages_seen": 0,
        "pages_skipped_present": 0,
        "pages_analyzed": 0,
        "chunks_updated": 0,
        "errors": 0,
    }

    start_wall = time.time()
    for doc in docs:
        doc_id = doc["id"]
        doc_company = (doc.get("company") or "").strip()
        fy = doc.get("fiscal_year")
        qt = doc.get("quarter")
        fname = doc.get("original_filename") or "(unknown)"
        chunks = _fetch_chunks_for_document(client, doc_id)
        if not chunks:
            continue
        counters["documents"] += 1
        by_page = _group_by_page(chunks)
        logger.info(
            "[doc %s] %s -- %s %s -- %d chunks across %d pages",
            doc_id[:8], fname, qt or "?", fy or "?", len(chunks), len(by_page),
        )

        for page_num in sorted(by_page.keys()):
            page_chunks = by_page[page_num]
            counters["pages_seen"] += 1
            if skip_if_present and all(
                _meta_has_new_fields(c.get("metadata") or {}) for c in page_chunks
            ):
                counters["pages_skipped_present"] += 1
                continue

            if dry_run:
                continue

            page_text = _reconstruct_page_text(page_chunks)
            if not page_text:
                continue
            try:
                analysis = analyze_page(page_text, page_num, company=doc_company)
            except Exception as exc:
                logger.warning(
                    "page %s of doc %s analyze failed: %s",
                    page_num, doc_id[:8], exc,
                )
                counters["errors"] += 1
                continue

            analysis_dict = analysis.to_dict()
            counters["pages_analyzed"] += 1
            for c in page_chunks:
                _update_chunk_metadata(client, c["id"], c.get("metadata") or {}, analysis_dict)
                counters["chunks_updated"] += 1

        # Small breather so a 200-page back-fill doesn't slam OpenAI's rate limit.
        time.sleep(0.05)

    elapsed = time.time() - start_wall
    logger.info(
        "Done in %.1fs. docs=%d pages_seen=%d analyzed=%d skipped=%d chunks_updated=%d errors=%d",
        elapsed,
        counters["documents"],
        counters["pages_seen"],
        counters["pages_analyzed"],
        counters["pages_skipped_present"],
        counters["chunks_updated"],
        counters["errors"],
    )
    return counters


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--company", help="ILIKE filter on documents.company")
    parser.add_argument("--fiscal-year", type=int, help="Filter by exact fiscal year")
    parser.add_argument("--quarter", help="Filter by exact quarter (Q1/Q2/Q3/Q4)")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-analyze every page, even if its chunks already carry the new fields.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be processed without calling the LLM or writing.",
    )
    parser.add_argument("--log-level", default="INFO", help="DEBUG / INFO / WARNING")
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    counters = refresh_chunks(
        company=args.company,
        fiscal_year=args.fiscal_year,
        quarter=args.quarter,
        skip_if_present=not args.force,
        dry_run=args.dry_run,
    )
    print(counters)
    return 0


if __name__ == "__main__":
    sys.exit(main())
