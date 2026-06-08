"""Backfill analyst_research_reports for Research Report (RR) documents that
were uploaded before the extraction feature existed.

For each completed RR document with no analyst_research_reports row, this
reconstructs the document text from its stored chunks and runs the same
extractor the upload hook uses.

Run from cfo-backend:
    python -m scripts.backfill_research_reports
    python -m scripts.backfill_research_reports --company HDFC
    python -m scripts.backfill_research_reports --force   # re-extract existing rows
"""

from __future__ import annotations

import argparse
import logging
import sys
import time

from supabase import create_client

from app.core.config import get_settings, require_supabase_config
from app.modules.research_reports.extractor import extract_and_store_research_report

logger = logging.getLogger("backfill_research_reports")

# Document types / source categories that denote a third-party research report.
_RR_DOC_TYPES = ["RR"]
_RR_SOURCE_CATEGORIES = ["research_report"]


def _rr_documents(supabase, company_filter: str | None) -> list[dict]:
    query = (
        supabase.table("documents")
        .select(
            "id, company, fiscal_year, quarter, document_type, source_category, "
            "original_filename, processing_status"
        )
    )
    if company_filter:
        query = query.ilike("company", f"%{company_filter}%")
    rows = (query.execute().data) or []
    out = []
    for r in rows:
        dt = str(r.get("document_type") or "").strip()
        sc = str(r.get("source_category") or "").strip()
        if dt not in _RR_DOC_TYPES and sc not in _RR_SOURCE_CATEGORIES:
            continue
        if str(r.get("processing_status") or "") != "completed":
            continue
        out.append(r)
    return out


def _existing_document_ids(supabase) -> set[str]:
    try:
        rows = (
            supabase.table("analyst_research_reports")
            .select("document_id")
            .execute()
            .data
        ) or []
    except Exception:
        return set()
    return {str(r.get("document_id")) for r in rows if r.get("document_id")}


def _reconstruct_text(supabase, document_id: str) -> str:
    try:
        rows = (
            supabase.table("document_chunks")
            .select("content, chunk_index")
            .eq("document_id", document_id)
            .order("chunk_index")
            .execute()
            .data
        ) or []
    except Exception as exc:
        logger.warning("Could not load chunks for %s: %s", document_id, exc)
        return ""
    return "\n\n".join(str(r.get("content") or "") for r in rows)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--company", help="Optional company name filter (ILIKE)")
    parser.add_argument(
        "--force", action="store_true", help="Re-extract even if a row already exists"
    )
    parser.add_argument("--pause-seconds", type=float, default=1.5)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    require_supabase_config()
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_key)

    docs = _rr_documents(supabase, args.company)
    if not docs:
        logger.info("No completed Research Report documents found.")
        return 0

    existing = set() if args.force else _existing_document_ids(supabase)
    todo = [d for d in docs if str(d["id"]) not in existing]
    logger.info(
        "%d RR document(s) found; %d to extract (%d already done).",
        len(docs),
        len(todo),
        len(docs) - len(todo),
    )

    failures = 0
    for i, d in enumerate(todo):
        doc_id = str(d["id"])
        company = str(d.get("company") or "").strip()
        fy = d.get("fiscal_year")
        quarter = str(d.get("quarter") or "").strip()
        filename = str(d.get("original_filename") or "")
        logger.info(
            "[%d/%d] %s FY%s %s — %s", i + 1, len(todo), company, fy, quarter, filename
        )
        text = _reconstruct_text(supabase, doc_id)
        if not text.strip():
            logger.warning("  no chunk text; storing fail-soft row")
        try:
            row = extract_and_store_research_report(
                supabase,
                document_id=doc_id,
                company=company,
                fiscal_year=int(fy) if fy is not None else 0,
                quarter=quarter,
                text=text,
                source_filename=filename,
            )
            logger.info(
                "  -> firm=%s rating=%s target=%s",
                row.get("firm"),
                row.get("rating"),
                row.get("target_price_display"),
            )
        except Exception as exc:
            logger.error("  FAILED: %s", exc)
            failures += 1
        if i < len(todo) - 1 and args.pause_seconds > 0:
            time.sleep(args.pause_seconds)

    logger.info("Finished. %d ok, %d failed.", len(todo) - failures, failures)
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
