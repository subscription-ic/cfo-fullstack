"""Structured earnings-call analysis pipeline.

Orchestrates: auto-detect metadata, fetch historical context, extract themes,
compute deltas, detect signals/risks, learn analyst question patterns.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from supabase import Client

from app.infrastructure.llm import chat_completion, get_openai_client
from app.shared.constants import EXPERT_PERSONA, INDUSTRY_AWARE_DIRECTIVE
from app.modules.analysis.schemas import (
    AnalysisResult,
    DeltaItem,
    QuestionPatternItem,
    SignalItem,
    ThemeItem,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Quarter ordering helpers
# ---------------------------------------------------------------------------

_QUARTER_ORDER = {"Q1": 1, "Q2": 2, "Q3": 3, "Q4": 4}


def _quarter_sort_key(doc: dict[str, Any]) -> tuple[int, int]:
    fy = doc.get("fiscal_year") or 0
    q = _QUARTER_ORDER.get(str(doc.get("quarter", "")).upper(), 0)
    return (fy, q)


def _prev_quarters(fiscal_year: int, quarter: str, n: int = 4) -> list[tuple[int, str]]:
    """Return the *n* quarters immediately before (fiscal_year, quarter)."""
    qi = _QUARTER_ORDER.get(quarter.upper(), 0)
    result: list[tuple[int, str]] = []
    fy, q = fiscal_year, qi
    for _ in range(n):
        q -= 1
        if q < 1:
            q = 4
            fy -= 1
        result.append((fy, f"Q{q}"))
    return result


# ---------------------------------------------------------------------------
# Utility: safe JSON parse from LLM output
# ---------------------------------------------------------------------------

def _safe_json(raw: str) -> Any:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Step 1: Auto-detect company + reporting period
# ---------------------------------------------------------------------------

def _auto_detect_company_period(chunks: list[str]) -> dict[str, Any]:
    """Use LLM to extract company name and period from document text."""
    text = "\n".join(chunks[:3])[:2000]
    if not text.strip():
        return {}

    prompt = (
        "Extract the company name and reporting period from this financial document excerpt.\n"
        'Return JSON: {"company": "<full name>", "period": "<e.g. Q1 FY2025>", '
        '"fiscal_year": <int or null>, "quarter": "<Q1-Q4 or null>"}\n'
        "Return null for any field you cannot determine.\n\n"
        f"Text:\n{text}"
    )
    raw = chat_completion(
        [
            {
                "role": "system",
                "content": (
                    EXPERT_PERSONA
                    + "\n\n"
                    + INDUSTRY_AWARE_DIRECTIVE
                    + "\n\nYou extract structured metadata from financial documents. Output only valid JSON."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.1,
    )
    return _safe_json(raw) or {}


# ---------------------------------------------------------------------------
# Step 2: Fetch last 4 quarters of historical documents
# ---------------------------------------------------------------------------

def _fetch_historical_documents(
    supabase: Client,
    company: str,
    fiscal_year: int,
    quarter: str,
    current_doc_id: str,
) -> list[dict[str, Any]]:
    """Return up to 4 previous-quarter documents for the same company."""
    try:
        resp = (
            supabase.table("documents")
            .select("id, company, fiscal_year, quarter, document_type, processing_status")
            .ilike("company", f"%{company.strip()}%")
            .eq("processing_status", "completed")
            .order("fiscal_year", desc=True)
            .order("quarter", desc=True)
            .limit(20)
            .execute()
        )
        rows = resp.data or []
    except Exception:
        logger.warning("Failed to fetch historical documents", exc_info=True)
        return []

    # Exclude the current document and keep only prior quarters
    prev_set = set(_prev_quarters(fiscal_year, quarter, n=4))
    historical: list[dict[str, Any]] = []
    for r in rows:
        if r.get("id") == current_doc_id:
            continue
        key = (r.get("fiscal_year"), str(r.get("quarter", "")).upper())
        if key in prev_set and key not in {(d.get("fiscal_year"), d.get("quarter")) for d in historical}:
            historical.append(r)
        if len(historical) >= 4:
            break
    return historical


# ---------------------------------------------------------------------------
# Step 3: Load chunks for a set of documents
# ---------------------------------------------------------------------------

def _load_chunks_for_docs(
    supabase: Client,
    doc_ids: list[str],
    max_per_doc: int = 20,
) -> dict[str, list[dict[str, Any]]]:
    """Batch-fetch document_chunks, grouped by document_id."""
    if not doc_ids:
        return {}
    try:
        resp = (
            supabase.table("document_chunks")
            .select("id, document_id, chunk_index, content, metadata")
            .in_("document_id", doc_ids)
            .order("chunk_index")
            .limit(max_per_doc * len(doc_ids))
            .execute()
        )
        rows = resp.data or []
    except Exception:
        logger.warning("Failed to load chunks", exc_info=True)
        return {}

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        did = r.get("document_id", "")
        if len(grouped[did]) < max_per_doc:
            grouped[did].append(r)

    # Sort each group by importance_score descending, keep top max_per_doc
    for did in grouped:
        grouped[did].sort(
            key=lambda c: (c.get("metadata") or {}).get("importance_score", 0),
            reverse=True,
        )
        grouped[did] = grouped[did][:max_per_doc]
        # Re-sort by chunk_index for reading order
        grouped[did].sort(key=lambda c: c.get("chunk_index", 0))

    return dict(grouped)


# ---------------------------------------------------------------------------
# Step 4: Extract themes + deltas + signals (single LLM call)
# ---------------------------------------------------------------------------

def _build_analysis_prompt(
    company: str,
    fiscal_year: int,
    quarter: str,
    current_chunks: list[dict[str, Any]],
    historical_docs: list[dict[str, Any]],
    historical_chunks: dict[str, list[dict[str, Any]]],
) -> str:
    """Assemble the analysis prompt with current + historical context."""

    # Current quarter text
    current_text = "\n\n".join(
        c.get("content", "")[:800] for c in current_chunks[:15]
    )

    # Historical quarters text
    hist_blocks: list[str] = []
    for doc in sorted(historical_docs, key=_quarter_sort_key, reverse=True):
        did = doc.get("id", "")
        q = doc.get("quarter", "?")
        fy = doc.get("fiscal_year", "?")
        chunks = historical_chunks.get(did, [])
        text = "\n\n".join(c.get("content", "")[:600] for c in chunks[:8])
        if text.strip():
            hist_blocks.append(f"--- {q} FY{fy} ---\n{text}")

    hist_section = "\n\n".join(hist_blocks) if hist_blocks else "(no historical documents available)"

    return f"""Company: {company}
Current Period: {quarter} FY{fiscal_year}

=== CURRENT QUARTER DOCUMENTS ===
{current_text}

=== HISTORICAL QUARTERS ===
{hist_section}

Analyze the documents above and return a JSON object with exactly three arrays:

{{
  "themes": [
    {{
      "name": "<short identifier, e.g. margin_pressure, deposit_growth, asset_quality>",
      "description": "<2-3 sentence description of the theme>",
      "evidence": ["<direct quote or data point from documents>"],
      "importance": "high|medium|low"
    }}
  ],
  "deltas": [
    {{
      "theme": "<matches a theme name above>",
      "direction": "improved|declined|stable",
      "current_summary": "<1 sentence: what current quarter shows>",
      "previous_summary": "<1 sentence: what previous quarters showed>",
      "magnitude": "significant|moderate|marginal"
    }}
  ],
  "signals": [
    {{
      "type": "risk|driver|confidence|forward_looking",
      "description": "<1-2 sentences>",
      "severity": "high|medium|low",
      "evidence": "<supporting quote or data>"
    }}
  ]
}}

Extract 5-8 themes covering margins, growth, deposits, asset quality, costs, and any other material areas.
Produce deltas for each theme where historical data allows comparison.
Extract 4-8 signals focusing on pressure areas, growth drivers, management confidence, and forward-looking statements.
Focus on what equity analysts would probe during an earnings call."""


def _extract_themes_and_signals(
    company: str,
    fiscal_year: int,
    quarter: str,
    current_chunks: list[dict[str, Any]],
    historical_docs: list[dict[str, Any]],
    historical_chunks: dict[str, list[dict[str, Any]]],
) -> tuple[list[ThemeItem], list[DeltaItem], list[SignalItem]]:
    """Single LLM call to extract themes, deltas, and signals."""

    prompt = _build_analysis_prompt(
        company, fiscal_year, quarter,
        current_chunks, historical_docs, historical_chunks,
    )

    raw = chat_completion(
        [
            {
                "role": "system",
                "content": (
                    EXPERT_PERSONA
                    + "\n\n"
                    + INDUSTRY_AWARE_DIRECTIVE
                    + "\n\nYou are preparing a briefing note for a CFO ahead of an earnings call. "
                    "Analyze the provided financial documents in industry-specific vocabulary and "
                    "return structured JSON. No markdown."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
    )

    data = _safe_json(raw)
    if not isinstance(data, dict):
        logger.warning("LLM returned non-dict for analysis: %s", raw[:200])
        return [], [], []

    themes = [
        ThemeItem(
            name=str(t.get("name", "")),
            description=str(t.get("description", "")),
            evidence=[str(e) for e in (t.get("evidence") or [])],
            importance=str(t.get("importance", "medium")),
        )
        for t in (data.get("themes") or [])
        if isinstance(t, dict) and t.get("name")
    ]

    deltas = [
        DeltaItem(
            theme=str(d.get("theme", "")),
            direction=str(d.get("direction", "stable")),
            current_summary=str(d.get("current_summary", "")),
            previous_summary=str(d.get("previous_summary", "")),
            magnitude=str(d.get("magnitude", "")),
        )
        for d in (data.get("deltas") or [])
        if isinstance(d, dict) and d.get("theme")
    ]

    signals = [
        SignalItem(
            type=str(s.get("type", "")),
            description=str(s.get("description", "")),
            severity=str(s.get("severity", "medium")),
            evidence=str(s.get("evidence", "")),
        )
        for s in (data.get("signals") or [])
        if isinstance(s, dict) and s.get("description")
    ]

    return themes, deltas, signals


# ---------------------------------------------------------------------------
# Step 5: Learn analyst question patterns from actual_earnings_qa
# ---------------------------------------------------------------------------

def _extract_question_patterns(
    supabase: Client,
    company: str,
) -> list[QuestionPatternItem]:
    """Analyze historical analyst questions to find recurring patterns."""
    try:
        resp = (
            supabase.table("actual_earnings_qa")
            .select("question, category, fiscal_year, quarter")
            .ilike("company", f"%{company.strip()}%")
            .limit(200)
            .execute()
        )
        rows = resp.data or []
    except Exception:
        logger.warning("Failed to fetch actual_earnings_qa", exc_info=True)
        return []

    if not rows:
        return []

    # Group by category
    by_cat: dict[str, list[str]] = defaultdict(list)
    for r in rows:
        cat = r.get("category") or "General"
        q = r.get("question", "")
        if q:
            by_cat[cat].append(q)

    # Build prompt
    cat_blocks: list[str] = []
    total = 0
    for cat, questions in sorted(by_cat.items()):
        sample = questions[:10]
        total += len(sample)
        qs = "\n".join(f"  - {q}" for q in sample)
        cat_blocks.append(f"--- {cat} ({len(questions)} questions) ---\n{qs}")
        if total >= 60:
            break

    prompt = f"""Company: {company}

Below are historical analyst questions from past earnings calls, grouped by category:

{chr(10).join(cat_blocks)}

Identify 5-10 recurring patterns in what analysts ask about. For each pattern:
1. Name the theme it relates to
2. Describe the pattern (what are analysts trying to understand?)
3. Give 2-3 representative example questions
4. Rate frequency: frequent (asked most calls), occasional, rare

Return a JSON array:
[
  {{
    "theme": "...",
    "pattern_description": "...",
    "example_questions": ["...", "..."],
    "frequency": "frequent|occasional|rare"
  }}
]"""

    raw = chat_completion(
        [
            {
                "role": "system",
                "content": (
                    EXPERT_PERSONA
                    + "\n\n"
                    + INDUSTRY_AWARE_DIRECTIVE
                    + "\n\nYou analyze historical earnings call Q&A to identify recurring analyst "
                    "questioning patterns specific to this company's industry. Output only valid JSON."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.25,
    )

    data = _safe_json(raw)
    if not isinstance(data, list):
        # Try extracting from wrapper
        if isinstance(data, dict):
            data = data.get("patterns") or data.get("question_patterns") or []
        else:
            return []

    return [
        QuestionPatternItem(
            theme=str(p.get("theme", "")),
            pattern_description=str(p.get("pattern_description", "")),
            example_questions=[str(e) for e in (p.get("example_questions") or [])],
            frequency=str(p.get("frequency", "occasional")),
        )
        for p in data
        if isinstance(p, dict) and p.get("theme")
    ]


# ---------------------------------------------------------------------------
# Step 6: Persist analysis to DB
# ---------------------------------------------------------------------------

def _persist_analysis(supabase: Client, result: AnalysisResult, historical_doc_ids: list[str]) -> str:
    """Upsert analysis row into document_analyses. Returns the analysis id."""
    analysis_id = result.id or str(uuid.uuid4())
    now = _utc_now_iso()

    row = {
        "id": analysis_id,
        "document_id": result.document_id,
        "company": result.company,
        "fiscal_year": result.fiscal_year,
        "quarter": result.quarter,
        "detected_company": result.detected_company,
        "detected_period": result.detected_period,
        "historical_doc_ids": historical_doc_ids,
        "themes": [t.model_dump() for t in result.themes],
        "deltas": [d.model_dump() for d in result.deltas],
        "signals": [s.model_dump() for s in result.signals],
        "question_patterns": [p.model_dump() for p in result.question_patterns],
        "status": result.status,
        "error_message": result.error_message,
        "updated_at": now,
    }

    # Try update first (upsert pattern)
    try:
        existing = (
            supabase.table("document_analyses")
            .select("id")
            .eq("document_id", result.document_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            analysis_id = existing.data[0]["id"]
            row.pop("id")
            supabase.table("document_analyses").update(row).eq("id", analysis_id).execute()
        else:
            row["created_at"] = now
            supabase.table("document_analyses").insert(row).execute()
    except Exception:
        # Fallback: try insert (may fail on unique constraint)
        row["id"] = analysis_id
        row["created_at"] = now
        supabase.table("document_analyses").insert(row).execute()

    return analysis_id


# ---------------------------------------------------------------------------
# Main pipeline entry point
# ---------------------------------------------------------------------------

def run_analysis(supabase: Client, document_id: str, force: bool = False) -> AnalysisResult:
    """Run the full analysis pipeline for a document.

    Steps:
    1. Check for existing analysis (skip if not force)
    2. Load document metadata
    3. Auto-detect company + period from text
    4. Fetch last 4 quarters of historical documents
    5. Load chunks for current + historical docs
    6. Extract themes + deltas + signals (single LLM call)
    7. Learn analyst question patterns from actual_earnings_qa
    8. Persist and return results
    """
    if get_openai_client() is None:
        raise RuntimeError("OPENAI_API_KEY is not configured; cannot run analysis")

    # 1. Check for existing analysis
    if not force:
        try:
            existing = (
                supabase.table("document_analyses")
                .select("*")
                .eq("document_id", document_id)
                .limit(1)
                .execute()
            )
            if existing.data and existing.data[0].get("status") == "completed":
                row = existing.data[0]
                return AnalysisResult(
                    id=row["id"],
                    document_id=row["document_id"],
                    company=row["company"],
                    fiscal_year=row["fiscal_year"],
                    quarter=row["quarter"],
                    detected_company=row.get("detected_company"),
                    detected_period=row.get("detected_period"),
                    themes=[ThemeItem(**t) for t in (row.get("themes") or [])],
                    deltas=[DeltaItem(**d) for d in (row.get("deltas") or [])],
                    signals=[SignalItem(**s) for s in (row.get("signals") or [])],
                    question_patterns=[QuestionPatternItem(**p) for p in (row.get("question_patterns") or [])],
                    status="completed",
                    created_at=row.get("created_at"),
                )
        except Exception:
            pass  # proceed to run fresh

    # 2. Load document metadata
    doc_resp = (
        supabase.table("documents")
        .select("id, company, fiscal_year, quarter, document_type, processing_status")
        .eq("id", document_id)
        .limit(1)
        .execute()
    )
    if not doc_resp.data:
        raise ValueError(f"Document {document_id} not found")
    doc = doc_resp.data[0]
    company = doc["company"]
    fiscal_year = int(doc["fiscal_year"])
    quarter = str(doc["quarter"])

    # 3. Auto-detect company + period from text
    current_chunks_raw = _load_chunks_for_docs(supabase, [document_id], max_per_doc=20)
    current_chunks = current_chunks_raw.get(document_id, [])
    if not current_chunks:
        raise ValueError(f"No chunks found for document {document_id}. Was it processed?")

    detected = _auto_detect_company_period([c.get("content", "") for c in current_chunks])
    detected_company = detected.get("company")
    detected_period = detected.get("period")

    # Use detected values as fallback if original metadata is sparse
    if detected.get("fiscal_year") and not fiscal_year:
        fiscal_year = int(detected["fiscal_year"])
    if detected.get("quarter") and not quarter:
        quarter = str(detected["quarter"])

    # 4. Fetch last 4 quarters of historical documents
    historical_docs = _fetch_historical_documents(
        supabase, company, fiscal_year, quarter, document_id,
    )
    historical_doc_ids = [d["id"] for d in historical_docs]

    # 5. Load chunks for historical docs
    historical_chunks = _load_chunks_for_docs(supabase, historical_doc_ids, max_per_doc=10)

    # 6. Extract themes + deltas + signals
    themes, deltas, signals = _extract_themes_and_signals(
        company, fiscal_year, quarter,
        current_chunks, historical_docs, historical_chunks,
    )

    # 7. Learn analyst question patterns
    question_patterns = _extract_question_patterns(supabase, company)

    # 8. Build result
    result = AnalysisResult(
        document_id=document_id,
        company=company,
        fiscal_year=fiscal_year,
        quarter=quarter,
        detected_company=detected_company,
        detected_period=detected_period,
        themes=themes,
        deltas=deltas,
        signals=signals,
        question_patterns=question_patterns,
        status="completed",
    )

    # 9. Persist
    analysis_id = _persist_analysis(supabase, result, historical_doc_ids)
    result.id = analysis_id

    return result


def get_analysis(supabase: Client, document_id: str) -> AnalysisResult | None:
    """Fetch a cached analysis for a document, or None."""
    try:
        resp = (
            supabase.table("document_analyses")
            .select("*")
            .eq("document_id", document_id)
            .limit(1)
            .execute()
        )
        if not resp.data:
            return None
        row = resp.data[0]
        return AnalysisResult(
            id=row["id"],
            document_id=row["document_id"],
            company=row["company"],
            fiscal_year=row["fiscal_year"],
            quarter=row["quarter"],
            detected_company=row.get("detected_company"),
            detected_period=row.get("detected_period"),
            themes=[ThemeItem(**t) for t in (row.get("themes") or [])],
            deltas=[DeltaItem(**d) for d in (row.get("deltas") or [])],
            signals=[SignalItem(**s) for s in (row.get("signals") or [])],
            question_patterns=[QuestionPatternItem(**p) for p in (row.get("question_patterns") or [])],
            status=row.get("status", "unknown"),
            error_message=row.get("error_message"),
            created_at=row.get("created_at"),
        )
    except Exception:
        return None


def list_company_analyses(supabase: Client, company: str) -> list[AnalysisResult]:
    """List all analyses for a company, newest first."""
    try:
        resp = (
            supabase.table("document_analyses")
            .select("*")
            .ilike("company", f"%{company.strip()}%")
            .order("fiscal_year", desc=True)
            .order("quarter", desc=True)
            .limit(50)
            .execute()
        )
        rows = resp.data or []
    except Exception:
        return []

    return [
        AnalysisResult(
            id=row["id"],
            document_id=row["document_id"],
            company=row["company"],
            fiscal_year=row["fiscal_year"],
            quarter=row["quarter"],
            detected_company=row.get("detected_company"),
            detected_period=row.get("detected_period"),
            themes=[ThemeItem(**t) for t in (row.get("themes") or [])],
            deltas=[DeltaItem(**d) for d in (row.get("deltas") or [])],
            signals=[SignalItem(**s) for s in (row.get("signals") or [])],
            question_patterns=[QuestionPatternItem(**p) for p in (row.get("question_patterns") or [])],
            status=row.get("status", "unknown"),
            error_message=row.get("error_message"),
            created_at=row.get("created_at"),
        )
        for row in rows
    ]
