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
import uuid
from typing import Any

from supabase import Client

from app.infrastructure.llm import chat_completion
from app.shared.constants import (
    CATEGORY_TAXONOMY_QUESTION_PROMPT,
    EXPERT_PERSONA,
    INDUSTRY_AWARE_DIRECTIVE,
)

logger = logging.getLogger(__name__)


EXTRACTION_SYSTEM_PROMPT = (
    EXPERT_PERSONA
    + "\n\n"
    + INDUSTRY_AWARE_DIRECTIVE
    + "\n\n"
    + """You are a financial transcript parser. You extract the analyst Q&A \
section from earnings call transcripts.

Output rules:
- Only return questions asked by outside analysts / investors during the Q&A \
portion of the call. Ignore operator remarks, prepared remarks, management \
opening statements, and any forward-looking disclaimers read by the IR team.
- Include the matching management answer if one is clearly present. If the \
answer is split across multiple speakers, concatenate them.
- Identify the analyst's name and firm when stated (e.g. "Ankit Sharma, \
Morgan Stanley").
- Classify each question using the closed taxonomy below. The meta-instruction \
and 4-step reasoning procedure are MANDATORY — apply them to every extracted \
question and emit the trace in `_reasoning`.
- Return STRICT JSON. No markdown, no commentary.

"""
    + CATEGORY_TAXONOMY_QUESTION_PROMPT
)

EXTRACTION_USER_TEMPLATE = """Extract the analyst Q&A from the transcript below.

For each question, run the 4-step reasoning procedure from the system prompt \
and emit the result as:
{{
  "questions": [
    {{
      "question": "<full analyst question, verbatim or lightly cleaned>",
      "answer": "<management answer or empty string>",
      "answered_by": "<executive name + title if stated, else empty>",
      "asked_by": "<analyst name + firm if stated, else empty>",
      "_reasoning": "<Steps 1-4 from the procedure, <=90 words>",
      "category": "<snake_case of category_l1>",
      "category_l1": "<verbatim from the L1 enum>",
      "category_l2": "<verbatim from the L2 list for that L1>"
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
SIMILARITY_LINK_THRESHOLD = 70.0
STRONG_LINK_THRESHOLD = 85.0


def _write_audit_row(
    supabase: Client,
    *,
    run_id: str,
    run_kind: str,
    company: str,
    fiscal_year: int,
    quarter: str,
    actual_qa_id: str | None,
    actual_question: str,
    actual_l1: str | None,
    actual_l2: str | None,
    predicted_id: str | None,
    predicted_row: dict[str, Any] | None,
    similarity: float,
    linked: bool,
    link_reason: str,
) -> None:
    """Persist a single match-attempt trace. Fails soft: if the audit table
    isn't present (migration 015 not yet applied) or the insert errors for
    any other reason, the linker continues without raising."""
    try:
        pred_l1 = (predicted_row or {}).get("category_l1") if predicted_row else None
        pred_l2 = (predicted_row or {}).get("category_l2") if predicted_row else None
        l1_match: bool | None = None
        l2_match: bool | None = None
        if predicted_row is not None:
            l1_match = (actual_l1 or "").strip().lower() == (pred_l1 or "").strip().lower()
            l2_match = (actual_l2 or "").strip().lower() == (pred_l2 or "").strip().lower()
        row = {
            "run_id": run_id,
            "run_kind": run_kind,
            "company": company,
            "fiscal_year": fiscal_year,
            "quarter": quarter,
            "actual_qa_id": actual_qa_id,
            "actual_question": actual_question[:4000] if actual_question else None,
            "actual_category_l1": actual_l1,
            "actual_category_l2": actual_l2,
            "predicted_qa_id_candidate": predicted_id,
            "predicted_question": (
                ((predicted_row or {}).get("predicted_question") or "")[:4000]
                if predicted_row
                else None
            ),
            "predicted_category_l1": pred_l1,
            "predicted_category_l2": pred_l2,
            "l1_match": l1_match,
            "l2_match": l2_match,
            "similarity": float(similarity) if similarity is not None else None,
            "threshold_similarity": SIMILARITY_LINK_THRESHOLD,
            "threshold_strong": STRONG_LINK_THRESHOLD,
            "linked": bool(linked),
            "link_reason": (link_reason or "")[:2000] or None,
        }
        supabase.table("match_audit_log").insert(row).execute()
    except Exception as exc:
        # match_audit_log table missing OR transient failure → skip audit, keep linking working.
        logger.debug("match_audit_log insert skipped: %s", exc)


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

    audit_run_id = str(uuid.uuid4())
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

        _write_audit_row(
            supabase,
            run_id=audit_run_id,
            run_kind="extract",
            company=company,
            fiscal_year=fiscal_year,
            quarter=quarter,
            actual_qa_id=None,  # actual row hasn't been inserted yet at this point
            actual_question=q["question"],
            actual_l1=q.get("category_l1"),
            actual_l2=q.get("category_l2"),
            predicted_id=predicted_id,
            predicted_row=cand,
            similarity=similarity,
            linked=linked_predicted_id is not None,
            link_reason=reason,
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


def relink_actuals_to_predictions(
    supabase: Client,
    *,
    company: str,
    fiscal_year: int,
    quarter: str,
    overwrite_linked: bool = False,
) -> dict[str, int]:
    """Re-run the judge across all `actual_earnings_qa` rows for this period
    and (re)populate `predicted_qa_id` against the current `predicted_qa` set.

    Use this when predictions were generated *after* the actuals were extracted,
    so the original extract pass had no candidates to link against.

    Args:
        overwrite_linked: when False, only fills rows where predicted_qa_id is
        currently NULL. When True, also re-evaluates rows that already have a
        link (useful if predictions were regenerated).

    Returns: counters {"actuals": N, "linked": M, "unchanged": K, "errors": E}.
    """
    try:
        resp = (
            supabase.table("actual_earnings_qa")
            .select("*")
            .ilike("company", f"%{company.strip()}%")
            .eq("fiscal_year", fiscal_year)
            .eq("quarter", quarter)
            .execute()
        )
        actuals = list(resp.data or [])
    except Exception as exc:
        logger.exception("relink_actuals: fetch failed: %s", exc)
        return {"actuals": 0, "linked": 0, "unchanged": 0, "errors": 1}

    if not actuals:
        return {"actuals": 0, "linked": 0, "unchanged": 0, "errors": 0}

    candidates = _fetch_predicted_candidates(supabase, company, fiscal_year, quarter)
    if not candidates:
        logger.info(
            "relink_actuals: no predictions to link against for %s %s FY%s",
            company, quarter, fiscal_year,
        )
        return {"actuals": len(actuals), "linked": 0, "unchanged": len(actuals), "errors": 0}

    candidates_by_id = {str(c.get("id")): c for c in candidates if c.get("id")}

    audit_run_id = str(uuid.uuid4())
    linked = 0
    unchanged = 0
    errors = 0
    for a in actuals:
        if a.get("predicted_qa_id") and not overwrite_linked:
            unchanged += 1
            continue
        try:
            predicted_id, similarity, reason = judge_similarity(
                a.get("question", ""), candidates,
            )
        except Exception as exc:
            logger.warning("relink_actuals: judge failed for %s: %s", a.get("id"), exc)
            errors += 1
            continue

        linked_predicted_id: str | None = None
        cand = candidates_by_id.get(predicted_id) if predicted_id else None
        if predicted_id and similarity >= STRONG_LINK_THRESHOLD:
            linked_predicted_id = predicted_id
        elif (
            predicted_id
            and similarity >= SIMILARITY_LINK_THRESHOLD
            and cand
            and _categories_match(a, cand)
        ):
            linked_predicted_id = predicted_id
        elif predicted_id and similarity >= SIMILARITY_LINK_THRESHOLD and cand:
            reason = (
                (reason + " ").strip()
                + f"[Not linked: category mismatch "
                f"(actual={_canonical_category(a)!r}, predicted={_canonical_category(cand)!r})]"
            )
        elif predicted_id:
            reason = (
                (reason + " ").strip()
                + f"[Not linked: similarity {int(similarity)} < {int(SIMILARITY_LINK_THRESHOLD)}]"
            )

        _write_audit_row(
            supabase,
            run_id=audit_run_id,
            run_kind="relink",
            company=company,
            fiscal_year=fiscal_year,
            quarter=quarter,
            actual_qa_id=str(a.get("id")) if a.get("id") else None,
            actual_question=a.get("question", ""),
            actual_l1=a.get("category_l1"),
            actual_l2=a.get("category_l2"),
            predicted_id=predicted_id,
            predicted_row=cand,
            similarity=similarity,
            linked=linked_predicted_id is not None,
            link_reason=reason,
        )

        # Only update if something would actually change.
        current_link = a.get("predicted_qa_id")
        if linked_predicted_id == current_link and not overwrite_linked:
            unchanged += 1
            continue

        try:
            supabase.table("actual_earnings_qa").update(
                {
                    "predicted_qa_id": linked_predicted_id,
                    "similarity_score": round(similarity, 2),
                    "match_reason": reason or None,
                }
            ).eq("id", a["id"]).execute()
            if linked_predicted_id:
                linked += 1
            else:
                unchanged += 1
        except Exception as exc:
            logger.exception("relink_actuals: update failed for %s: %s", a.get("id"), exc)
            errors += 1

    return {
        "actuals": len(actuals),
        "linked": linked,
        "unchanged": unchanged,
        "errors": errors,
    }


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
