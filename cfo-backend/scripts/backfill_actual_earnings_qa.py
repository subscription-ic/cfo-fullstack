"""Backfill actual_earnings_qa for transcript documents already in the DB.

Reassembles transcript text from document_chunks (ordered by chunk_index) and
runs the existing transcript_qa extractor + judge pipeline. Skips documents
that already have rows in actual_earnings_qa unless --force is passed.

Run from cfo-backend:
    python -m scripts.backfill_actual_earnings_qa
    python -m scripts.backfill_actual_earnings_qa --doc-id <uuid>
    python -m scripts.backfill_actual_earnings_qa --company HDFC --force
"""

from __future__ import annotations

import argparse
import logging

from supabase import create_client

from app.core.config import get_settings, require_supabase_config
from app.modules.transcript_qa.extractor import extract_and_store_from_transcript
from app.shared.constants import TRANSCRIPT_DOC_TYPES

logger = logging.getLogger("backfill_actual_earnings_qa")


def _reassemble_text(supabase, document_id: str) -> str:
    res = (
        supabase.table("document_chunks")
        .select("chunk_index, content")
        .eq("document_id", document_id)
        .order("chunk_index")
        .execute()
    )
    rows = res.data or []
    return "\n\n".join(str(r.get("content") or "") for r in rows).strip()


def _already_has_rows(supabase, document_id: str) -> bool:
    res = (
        supabase.table("actual_earnings_qa")
        .select("id", count="exact")
        .eq("source_document_id", document_id)
        .limit(1)
        .execute()
    )
    return bool(res.data)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--doc-id", help="Backfill a single document by id")
    parser.add_argument("--company", help="Restrict to a single company")
    parser.add_argument("--force", action="store_true", help="Re-run even if rows already exist")
    parser.add_argument("--limit", type=int, default=200)
    args = parser.parse_args()

    require_supabase_config()
    s = get_settings()
    supabase = create_client(s.supabase_url, s.supabase_key)

    q = supabase.table("documents").select(
        "id, company, fiscal_year, quarter, document_type, original_filename"
    )
    if args.doc_id:
        q = q.eq("id", args.doc_id)
    else:
        q = q.in_("document_type", sorted(TRANSCRIPT_DOC_TYPES))
        if args.company:
            q = q.ilike("company", args.company)
        q = q.limit(args.limit)
    docs = (q.execute().data or [])

    logger.info("found %d candidate transcript document(s)", len(docs))
    total_inserted = 0
    for d in docs:
        doc_id = d["id"]
        label = f"{d.get('company')} {d.get('quarter')} FY{d.get('fiscal_year')} ({d.get('original_filename')})"
        if not args.force and _already_has_rows(supabase, doc_id):
            logger.info("skip %s — already has actual_earnings_qa rows", label)
            continue
        if args.force:
            try:
                supabase.table("actual_earnings_qa").delete().eq(
                    "source_document_id", doc_id
                ).execute()
                logger.info("cleared existing actuals for %s before re-insert", label)
            except Exception as exc:
                logger.warning("could not clear actuals for %s: %s", label, exc)
            try:
                supabase.table("predicted_qa").delete().ilike(
                    "company", f"%{d['company'].strip()}%"
                ).eq("fiscal_year", int(d["fiscal_year"])).eq(
                    "quarter", d["quarter"]
                ).execute()
                logger.info("cleared existing predictions for %s before re-gen", label)
            except Exception as exc:
                logger.warning("could not clear predictions for %s: %s", label, exc)
        text = _reassemble_text(supabase, doc_id)
        if not text:
            logger.warning("skip %s — no chunk text found", label)
            continue
        logger.info("processing %s (%d chars)", label, len(text))
        try:
            n = extract_and_store_from_transcript(
                supabase,
                document_id=doc_id,
                company=d["company"],
                fiscal_year=int(d["fiscal_year"]),
                quarter=d["quarter"],
                transcript_text=text,
            )
        except Exception as exc:
            logger.exception("failed %s: %s", label, exc)
            continue
        logger.info("inserted %d rows for %s", n, label)
        total_inserted += n

    logger.info("done. total rows inserted: %d", total_inserted)


if __name__ == "__main__":
    main()
