"""LLM extraction of analyst rating / target price from a Research Report (RR).

One uploaded RR document = one analyst firm's report = one row in
`analyst_research_reports`. A single chat-completion call pulls the issuing
firm, its rating, the price target, and a one-to-two-sentence summary. Designed
to fail soft: if the LLM call or JSON parse fails, we still upsert a row (firm
falls back to the filename stem) so the upload is never silently dropped.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from supabase import Client

from app.infrastructure.llm import chat_completion, get_openai_client
from app.shared.constants import EXPERT_PERSONA
from app.shared.utils import utc_now_iso

logger = logging.getLogger(__name__)

MAX_CHARS_FOR_LLM = 8000

_SYSTEM_PROMPT = (
    EXPERT_PERSONA
    + "\n\nYou are reading a single third-party sell-side equity research report on "
    "one company. Extract ONLY what the report itself states. Respond with a single "
    "JSON object and nothing else, using these keys:\n"
    '  "firm": the research house / broker that authored the report (e.g. '
    '"BP Wealth", "ICICI Direct"). If not stated, use an empty string.\n'
    '  "rating": the recommendation verbatim (e.g. BUY, ACCUMULATE, ADD, HOLD, '
    'NEUTRAL, REDUCE, SELL). Empty string if none.\n'
    '  "target_price": the numeric 12-month price target as a number only (no '
    'currency symbol or commas). null if none.\n'
    '  "currency": the target-price currency symbol or code (e.g. "₹", "Rs", '
    '"$"). Empty string if unknown.\n'
    '  "summary": a concise 1-2 sentence summary of the analyst\'s thesis.\n'
    "Do not invent values; leave fields empty/null when the report does not state them."
)

_POSITIVE_WORDS = {"buy", "add", "accumulate", "overweight", "outperform", "strong buy"}
_NEGATIVE_WORDS = {"sell", "reduce", "underweight", "underperform"}


def _extract_json_object(text: str) -> dict | None:
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def _rating_tone(rating: str) -> str:
    r = (rating or "").strip().lower()
    if not r:
        return "neutral"
    if any(w in r for w in _POSITIVE_WORDS):
        return "positive"
    if any(w in r for w in _NEGATIVE_WORDS):
        return "negative"
    return "neutral"


def _coerce_target_price(raw: Any) -> float | None:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    # Strip currency symbols, commas, spaces from a string like "₹2,050".
    digits = re.sub(r"[^\d.]", "", str(raw))
    if not digits:
        return None
    try:
        return float(digits)
    except ValueError:
        return None


def _format_target_display(value: float | None, currency: str) -> str:
    if value is None:
        return ""
    sym = (currency or "").strip() or "₹"
    # Render without a trailing .0 for whole numbers, with thousands separators.
    if value == int(value):
        return f"{sym}{int(value):,}"
    return f"{sym}{value:,.2f}"


def extract_and_store_research_report(
    supabase: Client,
    *,
    document_id: str,
    company: str,
    fiscal_year: int,
    quarter: str,
    text: str,
    source_filename: str = "",
) -> dict[str, Any]:
    """Extract firm/rating/target/summary from an RR and upsert one row keyed by
    document_id. Fail-soft: always writes a row, falling back to the filename
    stem for the firm when extraction is unavailable."""
    fallback_firm = Path(source_filename or "").stem or "Research report"

    firm = fallback_firm
    rating = ""
    target_price: float | None = None
    target_display = ""
    summary = ""

    if get_openai_client() is not None and (text or "").strip():
        try:
            messages = [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        f"Company under coverage: {company}.\n\n"
                        f"Research report text:\n{text[:MAX_CHARS_FOR_LLM]}"
                    ),
                },
            ]
            raw = chat_completion(messages, temperature=0.2)
            obj = _extract_json_object(raw)
            if obj:
                firm = str(obj.get("firm") or "").strip() or fallback_firm
                rating = str(obj.get("rating") or "").strip()
                target_price = _coerce_target_price(obj.get("target_price"))
                target_display = _format_target_display(
                    target_price, str(obj.get("currency") or "")
                )
                summary = str(obj.get("summary") or "").strip()
        except Exception as exc:  # fail soft — never block ingestion
            logger.warning(
                "Research-report extraction failed for document %s: %s",
                document_id,
                exc,
                exc_info=True,
            )

    row = {
        "document_id": document_id,
        "company": company,
        "fiscal_year": fiscal_year,
        "quarter": quarter,
        "firm": firm,
        "rating": rating or None,
        "rating_tone": _rating_tone(rating),
        "target_price": target_price,
        "target_price_display": target_display or None,
        "summary": summary or None,
        "updated_at": utc_now_iso(),
    }

    try:
        supabase.table("analyst_research_reports").upsert(
            row, on_conflict="document_id"
        ).execute()
    except Exception as exc:
        logger.error(
            "Failed to upsert analyst_research_reports for document %s: %s",
            document_id,
            exc,
            exc_info=True,
        )
    return row
