"""Regenerate predicted_qa for every (company, fiscal_year, quarter) combination
that has at least one ingested document.

Deletes existing rows for each combo then runs `refresh_for_quarter`, which is
the same code path the upload hook uses.

Run from cfo-backend:
    python -m scripts.regenerate_predicted_qa
    python -m scripts.regenerate_predicted_qa --company HDFC
"""

from __future__ import annotations

import argparse
import logging
import sys
import time

from supabase import create_client

from app.core.config import get_settings, require_supabase_config
from app.modules.predicted_qa.refresh import refresh_for_quarter

logger = logging.getLogger("regenerate_predicted_qa")


def _discover_combos(supabase, company_filter: str | None) -> list[tuple[str, int, str]]:
    query = supabase.table("documents").select("company, fiscal_year, quarter")
    if company_filter:
        query = query.ilike("company", f"%{company_filter}%")
    rows = (query.execute().data) or []
    seen: set[tuple[str, int, str]] = set()
    for r in rows:
        c = (r.get("company") or "").strip()
        fy = r.get("fiscal_year")
        q = (r.get("quarter") or "").strip()
        if not c or fy is None or not q:
            continue
        try:
            seen.add((c, int(fy), q))
        except (TypeError, ValueError):
            continue
    return sorted(seen)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--company", help="Optional company name filter (ILIKE)")
    parser.add_argument(
        "--pause-seconds",
        type=float,
        default=2.0,
        help="Sleep between combos to ease OpenAI TPM pressure",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    require_supabase_config()
    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_key)

    combos = _discover_combos(supabase, args.company)
    if not combos:
        logger.info("No (company, FY, quarter) combos found.")
        return 0

    logger.info("Regenerating %d combo(s):", len(combos))
    for c, fy, q in combos:
        logger.info("  - %s FY%s %s", c, fy, q)

    failures: list[tuple[str, int, str, str]] = []
    for i, (company, fy, quarter) in enumerate(combos):
        logger.info("[%d/%d] %s FY%s %s — refreshing", i + 1, len(combos), company, fy, quarter)
        try:
            refresh_for_quarter(supabase, company, fy, quarter)
            logger.info("  done")
        except Exception as exc:
            logger.error("  FAILED: %s", exc)
            failures.append((company, fy, quarter, str(exc)))
        if i < len(combos) - 1 and args.pause_seconds > 0:
            time.sleep(args.pause_seconds)

    logger.info("Finished. %d succeeded, %d failed.", len(combos) - len(failures), len(failures))
    for company, fy, quarter, err in failures:
        logger.error("  %s FY%s %s: %s", company, fy, quarter, err)
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
