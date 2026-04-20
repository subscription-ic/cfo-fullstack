"""Extract analyst Q&A from an Earnings Call Transcript and match against predicted_qa.

Two LLM calls per transcript:
  1. Extraction — pull only the analyst questions (and management answers) from the raw transcript text.
  2. LLM-as-judge matching — for each extracted question, pick the best matching predicted_qa row for the
     same company and score the similarity 0-100.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from supabase import Client

from app.infrastructure.llm import chat_completion
from app.shared.constants import EXPERT_PERSONA, INDUSTRY_AWARE_DIRECTIVE

logger = logging.getLogger(__name__)


EXTRACTION_SYSTEM_PROMPT = (
    EXPERT_PERSONA
    + "\n\n"
    + INDUSTRY_AWARE_DIRECTIVE
    + "\n\n"
) + """You are a financial transcript parser. You extract the analyst Q&A \
section from earnings call transcripts.

Output rules:
- Only return questions asked by outside analysts / investors during the Q&A portion of the call. \
Ignore operator remarks, prepared remarks, management opening statements, and any forward-looking \
disclaimers read by the IR team.
- Include the matching management answer if one is clearly present. If the answer is split across \
multiple speakers, concatenate them.
- Identify the analyst's name and firm when stated (e.g. "Ankit Sharma, Morgan Stanley").
- Classify each question into a two-level taxonomy. `category_l1` MUST be one of this EXACT list \
(copy the label verbatim, including punctuation and capitalization):
    Growth, Margins, Guidance, Capital & Liquidity, Asset Quality, Segment Performance, Demand, \
Cost Structure, M&A, Risk & Regulation, Strategy, Other.
  `category_l2` is a short (2-5 words) specific angle under that L1 — for example "NIM Pressure", \
"Buybacks", "NPA Trend", "CASA Share", "Fee Income", "Tech Stack".
- `category` is a legacy flat label; set it to the lowercase snake_case of the L1 (e.g. \
"margins", "asset_quality", "capital_and_liquidity", "risk_and_regulation").
- Return STRICT JSON. No markdown, no commentary.
"""

EXTRACTION_USER_TEMPLATE = """Extract the analyst Q&A from the transcript below.

Return a JSON object of the form:
{{
  "questions": [
    {{
      "question": "<full analyst question, verbatim or lightly cleaned>",
      "answer": "<management answer or empty string>",
      "answered_by": "<executive name + title if stated, else empty>",
      "asked_by": "<analyst name + firm if stated, else empty>",
      "category": "<one of the categories listed in the system prompt>",
      "category_l1": "<one of the L1 buckets listed in the system prompt>",
      "category_l2": "<specific 2-5 word angle under the L1>"
    }}
  ]
}}

Transcript:
---
{transcript}
---
"""

JUDGE_SYSTEM_PROMPT = (
    EXPERT_PERSONA
    + "\n\n"
    + INDUSTRY_AWARE_DIRECTIVE
    + "\n\n"
) + """You are a financial-research similarity judge. Given one actual analyst \
question from an earnings call and a list of predicted questions that were generated in advance for \
the same company, pick the single predicted question that most closely matches the actual one in \
SUBSTANCE (topic, specificity, intent) — not just surface wording.

Scoring rubric (0-100). Be generous on thematic matches — analysts rarely use identical phrasing.
  95-100  Same exact sub-topic and angle (e.g. both ask about NIM trajectory for the next quarter).
  80-94   Same theme + same angle, different metric or timeframe.
  65-79   Same L1 theme (margins, growth, asset quality, etc.) and the predicted question is a \
plausible prep for the actual one, even if the specific driver differs.
  50-64   Adjacent themes that a prepared CFO would likely answer together.
  30-49   Loosely related; predicted might surface one relevant data point.
  0-29    Unrelated topic.

Return STRICT JSON. No markdown. If none of the predicted questions are a reasonable match, return \
best_index = -1 and similarity = 0. Never invent a match that isn't there, but do not under-score a \
genuine thematic match just because wording differs.
"""

JUDGE_USER_TEMPLATE = """Actual question:
"{actual}"

Predicted candidates (index: question):
{candidates}

Return JSON of the form:
{{
  "best_index": <integer index into the candidates list, or -1 if no reasonable match>,
  "similarity": <integer 0-100 — 100 = same question, 0 = unrelated>,
  "reason": "<one short sentence explaining the judgment>"
}}
"""

MAX_TRANSCRIPT_CHARS = 60000


def _strip_json_fence(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```(?:json)?\s*", "", t)
        t = re.sub(r"\s*```$", "", t)
    return t.strip()


def _safe_json_load(text: str) -> Any:
    try:
        return json.loads(_strip_json_fence(text))
    except Exception:
        logger.warning("transcript_qa: failed to parse LLM JSON output")
        return None


def _truncate_transcript(full_text: str) -> str:
    if len(full_text) <= MAX_TRANSCRIPT_CHARS:
        return full_text
    # Keep the tail — the Q&A section is almost always at the end of a transcript.
    return "…[truncated]…\n" + full_text[-MAX_TRANSCRIPT_CHARS:]


def extract_analyst_qa(transcript_text: str) -> list[dict[str, Any]]:
    if not transcript_text.strip():
        return []
    user_prompt = EXTRACTION_USER_TEMPLATE.format(transcript=_truncate_transcript(transcript_text))
    raw = chat_completion(
        messages=[
            {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.1,
    )
    parsed = _safe_json_load(raw)
    if not isinstance(parsed, dict):
        return []
    questions = parsed.get("questions")
    if not isinstance(questions, list):
        return []
    out: list[dict[str, Any]] = []
    for q in questions:
        if not isinstance(q, dict):
            continue
        question = str(q.get("question") or "").strip()
        if not question:
            continue
        out.append(
            {
                "question": question,
                "answer": str(q.get("answer") or "").strip(),
                "answered_by": str(q.get("answered_by") or "").strip(),
                "asked_by": str(q.get("asked_by") or "").strip(),
                "category": str(q.get("category") or "other").strip(),
                "category_l1": str(q.get("category_l1") or "").strip() or None,
                "category_l2": str(q.get("category_l2") or "").strip() or None,
            }
        )
    return out


# Two thresholds:
#   - SIMILARITY_LINK_THRESHOLD: link when similarity is reasonable AND L1 categories agree.
#   - STRONG_LINK_THRESHOLD: link regardless of category when similarity is high enough on its own
#     (handles cases where the LLM assigned slightly different L1 labels to the same theme).
SIMILARITY_LINK_THRESHOLD = 55.0
STRONG_LINK_THRESHOLD = 75.0


def _fetch_predicted_candidates(
    supabase: Client,
    company: str,
    fiscal_year: int,
    quarter: str,
) -> list[dict[str, Any]]:
    """Predicted questions generated for this exact company+period."""
    try:
        res = (
            supabase.table("predicted_qa")
            .select("id, predicted_question, category, category_l1, category_l2, fiscal_year, quarter")
            .ilike("company", company)
            .eq("fiscal_year", fiscal_year)
            .eq("quarter", quarter)
            .limit(200)
            .execute()
        )
        return list(res.data or [])
    except Exception:
        # Pre-migration-014 fallback: category_l1/l2 columns don't exist yet.
        res = (
            supabase.table("predicted_qa")
            .select("id, predicted_question, category, fiscal_year, quarter")
            .ilike("company", company)
            .eq("fiscal_year", fiscal_year)
            .eq("quarter", quarter)
            .limit(200)
            .execute()
        )
        return list(res.data or [])


_CATEGORY_ALIAS: dict[str, str] = {
    # Extractor flat-category outputs (snake_case) → canonical L1 bucket
    "revenue_growth": "growth",
    "growth": "growth",
    "margins": "margins",
    "margin": "margins",
    "guidance": "guidance",
    "capital_allocation": "capital & liquidity",
    "capital": "capital & liquidity",
    "liquidity": "capital & liquidity",
    "capital & liquidity": "capital & liquidity",
    "segment_performance": "segment performance",
    "segment performance": "segment performance",
    "demand": "demand",
    "cost": "cost structure",
    "cost_structure": "cost structure",
    "cost structure": "cost structure",
    "m_and_a": "m&a",
    "m&a": "m&a",
    "risk": "risk & regulation",
    "regulation": "risk & regulation",
    "risk & regulation": "risk & regulation",
    "asset_quality": "asset quality",
    "asset quality": "asset quality",
    "strategy": "strategy",
    "other": "other",
}


def _canonical_category(row: dict[str, Any]) -> str:
    """Best guess at the L1 bucket for a predicted/actual row, regardless of
    which field the LLM populated. Tries category_l1, then the flat category,
    then aliases the snake_case extractor categories onto the L1 taxonomy."""
    l1 = (row.get("category_l1") or "").strip().lower()
    if l1:
        return _CATEGORY_ALIAS.get(l1, l1)
    flat = (row.get("category") or "").strip().lower()
    if not flat:
        return ""
    return _CATEGORY_ALIAS.get(flat, flat)


def _categories_match(actual: dict[str, Any], predicted: dict[str, Any]) -> bool:
    a = _canonical_category(actual)
    p = _canonical_category(predicted)
    if not a or not p:
        # One side has no category at all — don't block the link on this rule;
        # defer to the similarity score.
        return True
    return a == p


def judge_similarity(
    actual_question: str,
    candidates: list[dict[str, Any]],
) -> tuple[str | None, float, str]:
    """Return (best predicted_qa id, similarity 0-100, reason)."""
    if not candidates:
        return None, 0.0, "No predicted questions available for this company."
    lines = [f"{i}: {c.get('predicted_question', '')}" for i, c in enumerate(candidates)]
    user_prompt = JUDGE_USER_TEMPLATE.format(actual=actual_question, candidates="\n".join(lines))
    raw = chat_completion(
        messages=[
            {"role": "system", "content": JUDGE_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.0,
    )
    parsed = _safe_json_load(raw)
    if not isinstance(parsed, dict):
        return None, 0.0, "Judge returned no parseable response."
    try:
        idx = int(parsed.get("best_index", -1))
        similarity = float(parsed.get("similarity", 0))
    except (TypeError, ValueError):
        return None, 0.0, "Judge returned invalid numeric fields."
    reason = str(parsed.get("reason") or "").strip()
    if idx < 0 or idx >= len(candidates):
        return None, max(0.0, min(similarity, 100.0)), reason or "No reasonable match."
    best_id = candidates[idx].get("id")
    return (str(best_id) if best_id else None), max(0.0, min(similarity, 100.0)), reason


def extract_and_store_from_transcript(
    supabase: Client,
    *,
    document_id: str,
    company: str,
    fiscal_year: int,
    quarter: str,
    transcript_text: str,
) -> int:
    """Full pipeline. Returns number of actual_earnings_qa rows inserted."""
    period_label = f"{quarter} FY{str(fiscal_year)[-2:]}"
    try:
        questions = extract_analyst_qa(transcript_text)
    except Exception as exc:
        logger.exception("transcript_qa: extraction failed for document %s: %s", document_id, exc)
        return 0

    if not questions:
        logger.info("transcript_qa: no analyst questions extracted from document %s", document_id)
        return 0

    # Generate predicted questions for this period FIRST (if none exist) so the
    # judge has something to link against on the very first transcript upload.
    try:
        _auto_generate_predictions(supabase, company, fiscal_year, quarter)
    except Exception as exc:
        logger.warning(
            "transcript_qa: pre-extract auto prediction generation failed for %s %s FY%s: %s",
            company, quarter, fiscal_year, exc,
        )

    candidates = _fetch_predicted_candidates(supabase, company, fiscal_year, quarter)

    candidates_by_id = {str(c.get("id")): c for c in candidates if c.get("id")}

    rows: list[dict[str, Any]] = []
    for q in questions:
        try:
            predicted_id, similarity, reason = judge_similarity(q["question"], candidates)
        except Exception as exc:
            logger.warning("transcript_qa: judge failed for one question (%s): %s", document_id, exc)
            predicted_id, similarity, reason = None, 0.0, "Judge error."

        # Link rules:
        #   (a) similarity >= STRONG_LINK_THRESHOLD → link regardless of category,
        #   (b) similarity >= SIMILARITY_LINK_THRESHOLD AND canonical L1 categories agree → link,
        #   otherwise keep predicted_qa_id NULL but still store the similarity score
        #   and reason so reviewers can audit near-misses.
        linked_predicted_id: str | None = None
        cand = candidates_by_id.get(predicted_id) if predicted_id else None
        if predicted_id and similarity >= STRONG_LINK_THRESHOLD:
            linked_predicted_id = predicted_id
        elif predicted_id and similarity >= SIMILARITY_LINK_THRESHOLD and cand and _categories_match(q, cand):
            linked_predicted_id = predicted_id
        elif predicted_id and similarity >= SIMILARITY_LINK_THRESHOLD and cand:
            reason = (
                (reason + " ").strip()
                + f"[Not linked: category mismatch "
                f"(actual={_canonical_category(q)!r}, predicted={_canonical_category(cand)!r})]"
            )
        elif predicted_id:
            reason = (
                (reason + " ").strip()
                + f"[Not linked: similarity {int(similarity)} < {int(SIMILARITY_LINK_THRESHOLD)}]"
            )

        rows.append(
            {
                "company": company,
                "fiscal_year": fiscal_year,
                "quarter": quarter,
                "period_label": period_label,
                "question": q["question"],
                "answer": q["answer"] or None,
                "answered_by": q["answered_by"] or None,
                "asked_by": q.get("asked_by") or None,
                "category": q["category"] or None,
                "category_l1": q.get("category_l1"),
                "category_l2": q.get("category_l2"),
                "predicted_qa_id": linked_predicted_id,
                "similarity_score": round(similarity, 2),
                "match_reason": reason or None,
                "source_document_id": document_id,
            }
        )

    if not rows:
        return 0
    try:
        supabase.table("actual_earnings_qa").insert(rows).execute()
    except Exception as exc:
        msg = str(exc)
        if "category_l1" in msg or "category_l2" in msg:
            stripped = [
                {k: v for k, v in r.items() if k not in ("category_l1", "category_l2")}
                for r in rows
            ]
            try:
                supabase.table("actual_earnings_qa").insert(stripped).execute()
            except Exception as exc2:
                logger.exception(
                    "transcript_qa: failed to insert %d rows for document %s: %s",
                    len(rows),
                    document_id,
                    exc2,
                )
                return 0
        else:
            logger.exception(
                "transcript_qa: failed to insert %d rows for document %s: %s",
                len(rows),
                document_id,
                exc,
            )
            return 0
    logger.info("transcript_qa: inserted %d rows for document %s", len(rows), document_id)
    return len(rows)


def _auto_generate_predictions(
    supabase: Client,
    company: str,
    fiscal_year: int,
    quarter: str,
) -> None:
    """Runs question-generation with persist=True for this company/period.
    No-op if rows already exist for that exact period."""
    try:
        existing = (
            supabase.table("predicted_qa")
            .select("id", count="exact")
            .ilike("company", f"%{company.strip()}%")
            .eq("fiscal_year", fiscal_year)
            .eq("quarter", quarter)
            .limit(1)
            .execute()
        )
        if existing.data:
            logger.info(
                "transcript_qa: predicted_qa already exists for %s %s FY%s — skipping auto-gen",
                company, quarter, fiscal_year,
            )
            return
    except Exception:
        # If the existence check fails (e.g. migration 010 not applied), fall through and try to generate anyway.
        pass

    # Lazy import to avoid a circular dependency with question_generation.
    from app.modules.question_generation.schemas import QuestionGenerationRequest
    from app.modules.question_generation.service import run_question_generation

    req = QuestionGenerationRequest(
        company=company,
        fiscal_year=fiscal_year,
        quarter=quarter,
        last_n_quarters=8,
        persist=True,
        num_questions=None,  # auto-size from historical average
    )
    resp = run_question_generation(supabase, req)
    logger.info(
        "transcript_qa: auto-generated %d predicted questions for %s %s FY%s",
        len(resp.questions), company, quarter, fiscal_year,
    )
