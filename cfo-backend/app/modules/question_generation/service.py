"""Dynamic question generation using historical Q&A, optional RAG chunks, and LLM."""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

from supabase import Client

from app.infrastructure.llm import chat_completion, embed_query, get_openai_client
from app.shared.constants import (
    CATEGORY_TAXONOMY_QUESTION_PROMPT,
    EXPERT_PERSONA,
    INDUSTRY_AWARE_DIRECTIVE,
)
from app.modules.question_generation.schemas import (
    GeneratedQuestionItem,
    QuestionGenerationRequest,
    QuestionGenerationResponse,
)


DEFAULT_NUM_QUESTIONS_FALLBACK = 10
AUTO_NUM_QUESTIONS_MIN = 10
AUTO_NUM_QUESTIONS_MAX = 25


QUESTION_GENERATION_PROMPT = """{expert_persona}

{industry_directive}

═══════════════════════════════════════════════════════════════════
ROLE
═══════════════════════════════════════════════════════════════════
You are preparing {company}'s CFO for the {quarter} FY{fy_short} ({fiscal_year}) earnings call.
Your job is to predict the SPECIFIC questions sell-side analysts and
institutional investors will ask — NOT to generate a generic earnings FAQ.

Your output will be scored against the actual call transcript on:
- PRECISION: % of your predictions that match actual questions
- RECALL: % of actual questions you anticipated
- THEME COVERAGE: % of L1/L2 categories correctly identified

Generic, textbook questions will score 0%. Specific, document-grounded
questions tied to named events and quantitative disclosures will score.

═══════════════════════════════════════════════════════════════════
INPUT CONTEXT
═══════════════════════════════════════════════════════════════════

--- Historical actual Q&A from prior calls ---
{actual_block}

--- Prior predicted questions (for diversity, do not repeat) ---
{predicted_block}

--- Financial & IR document excerpts (current period source material) ---
{rag_block}

--- Quarter analysis: themes, deltas, signals ---
{analysis_block}

═══════════════════════════════════════════════════════════════════
GENERATION RULES (PRIORITY ORDER — RULE 1 OVERRIDES RULE 7)
═══════════════════════════════════════════════════════════════════

RULE 1 — GROUND IN UPLOADED DOCUMENTS (HARD REQUIREMENT)
Every question MUST be traceable to a specific line, number, or named
entity from the financial/IR document excerpts above. If you cannot
point to the source, DROP the question.

In each question's `_reasoning` field, cite the trigger:
  "RAG line 4: 'gross margin declined 230 bps due to Gerry Weber...'"
  "Analysis delta: tax rate jump 10% → 17%"
  "Historical pattern: 3 of last 4 quarters asked about U.S. tariffs"

RULE 2 — SPECIFICITY OVER GENERICNESS (HARD REQUIREMENT)
Every question MUST reference at least ONE of:
  ✓ A named customer, supplier, partner, or consultant
  ✓ A specific number (₹ figure, %, bps, headcount)
  ✓ A named regulation, FTA, tariff, or tax regime
  ✓ A specific geography, segment, or product line
  ✓ A named event (acquisition, divestiture, lawsuit, management change)

BANNED phrasings (auto-reject):
  ✗ "What is your strategy for [X]?"
  ✗ "How are you addressing [Y]?"
  ✗ "Can you provide an update on [Z]?"
  ✗ "What is your outlook on [W]?"
  ✗ "What are the key drivers behind [V]?"

REQUIRED phrasings (prefer):
  ✓ "Given [specific disclosure], how does that change [specific metric]?"
  ✓ "You mentioned [named event] — what's the impact on [named segment]?"
  ✓ "[Named customer/regulator/competitor] [did X]. What's your response?"
  ✓ "[Specific number] vs [prior number] — what drove the delta?"

RULE 3 — CATALYST WEIGHTING
At least 40% of questions must target events NEW since the prior
reporting period. Hunt for these in the documents:
  • Regulatory changes (tariffs, tax regimes, FTAs, sanctions)
  • Customer events (bankruptcies, M&A, contract renewals/losses)
  • Consultant/advisor engagements (BCG, McKinsey, restructuring firms)
  • Currency moves in operating geographies
  • Management changes (theirs or major customers')
  • Capital structure events (debt refinancing, buybacks, raises)

RULE 4 — CLUSTERING IS ALLOWED (anti-uniform-distribution)
Real analyst calls cluster on the quarter's pain points. Identify the
1-2 DOMINANT issues from the documents and allocate questions like:
  • Dominant issue #1: 25-35% of questions
  • Dominant issue #2: 15-25% of questions
  • Remaining categories: 1-2 questions each

Do NOT force one question per category if the evidence doesn't support it.

RULE 5 — L1/L2 CATEGORIZATION (HARD REQUIREMENT)
Every question MUST be tagged with both `category_l1` and `category_l2`
from the taxonomy below. Generic "General" tags are rejected.

{category_taxonomy}

L1/L2 selection procedure (mandatory mental check):
  STEP 1: What is the core financial/operational concern?
  STEP 2: Which L1 bucket does it belong to? (Margins, Growth, Guidance,
          Demand, Cost Structure, Capital & Liquidity, Risk & Regulation,
          Strategy, Segment Performance, ESG, M&A, etc.)
  STEP 3: Which L2 sub-bucket is most specific? (e.g., L1=Margins →
          L2=Gross Margin / EBITDA Margin / Operating Margin / Other Margins)
  STEP 4: If the question spans two L2s, pick the PRIMARY one and note
          the secondary in `_reasoning`.

RULE 6 — SUGGESTED ANSWER QUALITY
Each `suggested_answer` must be:
  • 60-120 words (one-liners rejected)
  • Include ≥1 quantitative anchor from the documents
    OR a clearly-labeled placeholder: "[Q1 opex saving: insert from MIS]"
  • Name specific levers, customers, geographies — never abstract categories
  • CFO tone: matter-of-fact, defensive where warranted, no marketing speak

RULE 7 — LIKELIHOOD SCORING
Tag each question with `likelihood`:
  • near_certain: directly tied to a material disclosure in the documents
  • probable: standard analyst topic given current-quarter dynamics
  • possible: relevant but depends on which analysts dial in
  • speculative: thematic, may or may not surface

Aim for ≥60% of questions in near_certain + probable tiers.

RULE 8 — DIVERSITY WITHIN CLUSTERS
When multiple questions hit the same L1/L2 (per Rule 4), each must
attack a DIFFERENT angle:
  • Margins cluster example:
    Q1 attacks GROSS margin specifically (mix/pricing)
    Q2 attacks EBITDA margin (opex leverage)
    Q3 attacks MEDIUM-TERM margin trajectory (guidance)
    Q4 attacks COST-SAVING initiative quantification

═══════════════════════════════════════════════════════════════════
OUTPUT SCHEMA
═══════════════════════════════════════════════════════════════════

Return a JSON array of {num_questions}+ objects. Each object MUST have:

{{
  "predicted_question": "string — the question, in analyst voice",
  "suggested_answer": "string — 60-120 word CFO response with numbers",
  "category_l1": "string — top-level taxonomy bucket (required)",
  "category_l2": "string — sub-bucket (required)",
  "category": "string — formatted as 'L1 / L2' (required)",
  "risk": "low | medium | high",
  "likelihood": "near_certain | probable | possible | speculative",
  "catalyst_type": "new_event | recurring_theme | macro | guidance_followup",
  "_reasoning": "string — cite specific source line(s) that triggered this question, plus L1/L2 selection logic",
  "source_refs": ["array of strings identifying which RAG/historical/analysis blocks were used"]
}}

═══════════════════════════════════════════════════════════════════
SELF-CHECK BEFORE OUTPUT
═══════════════════════════════════════════════════════════════════

Before emitting JSON, verify silently:
  □ Every question cites a specific document/historical source
  □ No banned phrasings present
  □ ≥40% target catalysts (new events)
  □ Dominant theme has 2-4 questions (clustering allowed)
  □ Every question has L1 AND L2 from the taxonomy (no "General")
  □ Every L1/L2 pair is consistent with the question's substance
  □ ≥60% of questions are near_certain or probable
  □ Suggested answers include quantitative anchors
  □ No two questions are paraphrases of each other

Output ONLY the JSON array. No markdown fences, no preamble, no commentary.
"""


def _avg_questions_last_4_quarters(supabase: Client, company: str) -> int | None:
    """Average analyst-question count per quarter for this company across its
    most recent 4 quarters in actual_earnings_qa. Returns None when no data."""
    try:
        resp = (
            supabase.table("actual_earnings_qa")
            .select("fiscal_year, quarter")
            .ilike("company", f"%{company.strip()}%")
            .execute()
        )
        rows = resp.data or []
    except Exception:
        return None
    if not rows:
        return None

    counts: dict[tuple[int, str], int] = {}
    for r in rows:
        fy_raw = r.get("fiscal_year")
        qt = str(r.get("quarter") or "").strip()
        if fy_raw is None or not qt:
            continue
        try:
            fy = int(fy_raw)
        except (TypeError, ValueError):
            continue
        counts[(fy, qt)] = counts.get((fy, qt), 0) + 1

    if not counts:
        return None

    sorted_keys = sorted(counts.keys(), key=lambda k: (k[0], k[1]), reverse=True)
    last4 = sorted_keys[:4]
    avg = sum(counts[k] for k in last4) / len(last4)
    return max(AUTO_NUM_QUESTIONS_MIN, min(round(avg), AUTO_NUM_QUESTIONS_MAX))


def _quarter_to_int(q: str | None) -> int | None:
    if not q:
        return None
    s = q.strip().upper().lstrip("Q")
    try:
        n = int(s)
    except (TypeError, ValueError):
        return None
    return n if 1 <= n <= 4 else None


def _filter_by_year(rows: list[dict[str, Any]], y_from: int | None, y_to: int | None) -> list[dict[str, Any]]:
    if y_from is None and y_to is None:
        return rows
    out: list[dict[str, Any]] = []
    for r in rows:
        fy = r.get("fiscal_year")
        if fy is None:
            out.append(r)
            continue
        try:
            y = int(fy)
        except (TypeError, ValueError):
            out.append(r)
            continue
        if y_from is not None and y < y_from:
            continue
        if y_to is not None and y > y_to:
            continue
        out.append(r)
    return out


def _fetch_historical_context(supabase: Client, req: QuestionGenerationRequest) -> tuple[str, str]:
    """Returns (actual_qa_block, predicted_qa_block) as formatted strings."""
    company_filter = req.company.strip()

    try:
        aq_resp = supabase.table("actual_earnings_qa").select("*").ilike("company", f"%{company_filter}%").execute()
        aq_rows = aq_resp.data or []
    except Exception:
        aq_rows = []

    aq_rows = _filter_by_year(aq_rows, req.year_from, req.year_to)
    # Strict prior-period filter: don't leak actual questions from the target
    # quarter or any future quarter into the prediction prompt.
    if req.fiscal_year and req.quarter:
        target_fy = int(req.fiscal_year)
        target_qt_n = _quarter_to_int(req.quarter.strip())
        if target_qt_n is not None:
            filtered: list[dict[str, Any]] = []
            for r in aq_rows:
                r_fy_raw = r.get("fiscal_year")
                try:
                    r_fy = int(r_fy_raw) if r_fy_raw is not None else None
                except (TypeError, ValueError):
                    r_fy = None
                r_qt_n = _quarter_to_int(r.get("quarter"))
                if r_fy is None or r_qt_n is None:
                    continue
                if (r_fy, r_qt_n) < (target_fy, target_qt_n):
                    filtered.append(r)
            aq_rows = filtered
    if req.last_n_quarters and len(aq_rows) > req.last_n_quarters * 5:
        aq_rows = aq_rows[-req.last_n_quarters * 5 :]

    actual_lines: list[str] = []
    for r in aq_rows[:40]:
        period = r.get("period_label") or f"{r.get('quarter','')} {r.get('fiscal_year','')}"
        q = r.get("question", "")
        a = (r.get("answer") or "")[:1000]
        cat = r.get("category", "")
        actual_lines.append(f"- [{period}] ({cat}) Q: {q}\n  A: {a}")

    # Only include predicted_qa rows from quarters STRICTLY OLDER than the
    # target. Same- and newer-period rows are self-generated noise that the LLM
    # would just echo back, collapsing per-quarter diversity.
    pq_rows: list[dict[str, Any]] = []
    if not (req.fiscal_year and req.quarter):
        try:
            pq_resp = supabase.table("predicted_qa").select("*").ilike("company", f"%{company_filter}%").execute()
            pq_rows = pq_resp.data or []
        except Exception:
            pq_rows = []
        pq_rows = _filter_by_year(pq_rows, req.year_from, req.year_to)
    else:
        try:
            pq_resp = supabase.table("predicted_qa").select("*").ilike("company", f"%{company_filter}%").execute()
            all_pq = pq_resp.data or []
        except Exception:
            all_pq = []
        target_fy = int(req.fiscal_year)
        target_qt = req.quarter.strip()
        target_qt_n = _quarter_to_int(target_qt)
        for r in all_pq:
            r_fy_raw = r.get("fiscal_year")
            try:
                r_fy = int(r_fy_raw) if r_fy_raw is not None else None
            except (TypeError, ValueError):
                r_fy = None
            r_qt = str(r.get("quarter") or "").strip()
            r_qt_n = _quarter_to_int(r_qt)
            if r_fy is None or r_qt_n is None:
                continue
            if (r_fy, r_qt_n) < (target_fy, target_qt_n):
                pq_rows.append(r)
        pq_rows = _filter_by_year(pq_rows, req.year_from, req.year_to)
    if req.last_n_quarters and len(pq_rows) > req.last_n_quarters * 5:
        pq_rows = pq_rows[-req.last_n_quarters * 5 :]

    pred_lines: list[str] = []
    for r in pq_rows[:40]:
        pq = r.get("predicted_question", r.get("question", ""))
        cat = r.get("category", "")
        risk = r.get("risk", "")
        pred_lines.append(f"- ({cat}, risk={risk}) {pq}")

    return "\n".join(actual_lines) if actual_lines else "(none)", "\n".join(pred_lines) if pred_lines else "(none)"


_TRANSCRIPT_TYPES = {"TR", "current_ec", "historical_ec", "earnings_transcript"}
# Higher = preferred as a question-generation source. FIN/SUPP carry the
# numbers analysts will probe; PR/PPT carry the narrative; transcripts are the
# event we're predicting against and must not leak the answers.
_DOC_TYPE_PRIORITY = {
    "FIN": 5,
    "SUPP": 4,
    "PR": 3,
    "PPT": 3,
    "AR": 3,  # bumped: annual reports carry tax / regulatory notes that one-off filings often omit
    "GUIDE": 2,
    "RR": 1,
}


def _fetch_period_chunks(
    supabase: Client, company: str, fiscal_year: int, quarter: str, limit: int
) -> list[dict[str, Any]]:
    """Direct metadata-filtered fetch of chunks for the exact (company, FY, Q).
    Skips transcripts — transcript content is what we're predicting against,
    not a source of pre-call questions. Prioritises FIN/SUPP/PR/PPT over the
    raw chunk_index order so analyst-relevant material wins the limited slots."""
    try:
        resp = (
            supabase.table("document_chunks")
            .select("content, metadata, chunk_index, document_id")
            .filter("metadata->>company", "ilike", f"%{company.strip()}%")
            .filter("metadata->>fiscal_year", "eq", str(fiscal_year))
            .filter("metadata->>quarter", "eq", quarter)
            .limit(200)
            .execute()
        )
        rows = list(resp.data or [])
    except Exception:
        return []

    eligible = [
        r for r in rows
        if str((r.get("metadata") or {}).get("document_type") or "")
        not in _TRANSCRIPT_TYPES
    ]

    def _rank(row: dict[str, Any]) -> tuple[int, float, int]:
        meta = row.get("metadata") or {}
        dt = str(meta.get("document_type") or "")
        try:
            imp = float(meta.get("importance_score") or 0.0)
        except (TypeError, ValueError):
            imp = 0.0
        # Negate importance so a higher score sorts first; secondary chunk_index
        # ascending keeps reading order within ties.
        return (
            -_DOC_TYPE_PRIORITY.get(dt, 0),
            -imp,
            int(row.get("chunk_index") or 0),
        )

    eligible.sort(key=_rank)
    return eligible[:limit]


def _fetch_rag_chunks(supabase: Client, req: QuestionGenerationRequest) -> str:
    if get_openai_client() is None:
        return ""

    # When a target period is set, anchor the prompt in chunks from that exact
    # period first. Otherwise the LLM gets generic cross-quarter themes and
    # outputs near-identical questions for every quarter.
    period_chunks: list[dict[str, Any]] = []
    if req.fiscal_year and req.quarter:
        period_chunks = _fetch_period_chunks(
            supabase, req.company, int(req.fiscal_year), req.quarter.strip(), limit=14
        )

    period_str = ""
    if req.fiscal_year and req.quarter:
        period_str = (
            f" for {req.quarter} FY{str(req.fiscal_year)[-2:]} ({req.fiscal_year})"
        )
    qtext = (
        f"Key themes, results, and risks specific to {req.company}{period_str}; "
        f"analyst focus areas; guidance, margins, segment performance, and "
        f"period-specific disclosures."
    )
    try:
        vec = embed_query(qtext)
        params = {
            "query_embedding": vec,
            "filter_company": req.company.strip(),
            "filter_doc_type": req.document_type_filter,
            "filter_source_category": req.source_category_filter,
            "match_count": 20,
        }
        res = supabase.rpc("match_document_chunks", params).execute()
        rag_rows = list(res.data or [])
    except Exception:
        rag_rows = []

    # Merge: period_chunks first, then thematic vector rows we haven't already
    # included. Dedup by (document_id, chunk_index) when available, otherwise
    # by content prefix.
    seen_keys: set[str] = set()

    def _key(row: dict[str, Any]) -> str:
        doc_id = row.get("document_id") or (row.get("metadata") or {}).get("document_id") or ""
        idx = row.get("chunk_index")
        if doc_id and idx is not None:
            return f"{doc_id}#{idx}"
        return (row.get("content") or "")[:120]

    merged: list[dict[str, Any]] = []
    for row in period_chunks:
        k = _key(row)
        if k in seen_keys:
            continue
        seen_keys.add(k)
        merged.append(row)
    if len(merged) < 14:
        for row in rag_rows:
            k = _key(row)
            if k in seen_keys:
                continue
            seen_keys.add(k)
            merged.append(row)
            if len(merged) >= 14:
                break

    if not merged:
        return ""

    lines: list[str] = []
    for row in merged:
        content = (row.get("content") or "")[:1200]
        meta = row.get("metadata") or {}
        # Pull hierarchical headings from either the chunk columns or its
        # metadata payload so the model sees where in the source document this
        # excerpt sits — useful when the question generator decides which
        # disclosure to probe.
        l1 = row.get("l1_heading") or meta.get("l1_heading") or ""
        l2 = row.get("l2_headings") or meta.get("l2_headings") or []
        l3 = row.get("l3_headings") or meta.get("l3_headings") or []
        heading_parts = []
        if l1:
            heading_parts.append(f"L1: {l1}")
        if isinstance(l2, list) and l2:
            heading_parts.append("L2: " + " › ".join(str(x) for x in l2[:3]))
        if isinstance(l3, list) and l3:
            heading_parts.append("L3: " + " › ".join(str(x) for x in l3[:4]))
        heading_tag = (" {" + " | ".join(heading_parts) + "}") if heading_parts else ""
        lines.append(
            f"- [{meta.get('document_type')}/{meta.get('source_category')}/"
            f"{meta.get('quarter')} {meta.get('fiscal_year')}]{heading_tag} {content}"
        )
    return "\n".join(lines)


def _parse_llm_questions(raw: str, num: int) -> list[GeneratedQuestionItem]:
    raw = raw.strip()
    try:
        data = json.loads(raw)
        if isinstance(data, dict) and "questions" in data:
            data = data["questions"]
        if not isinstance(data, list):
            return []
        out: list[GeneratedQuestionItem] = []
        for item in data[:num]:
            if not isinstance(item, dict):
                continue
            l1 = str(item.get("category_l1") or "").strip() or None
            l2 = str(item.get("category_l2") or "").strip() or None
            flat = str(item.get("category") or "").strip()
            if not flat and l1:
                flat = f"{l1} / {l2}" if l2 else l1
            likelihood = str(item.get("likelihood") or "").strip().lower() or None
            catalyst_type = str(item.get("catalyst_type") or "").strip() or None
            reasoning = str(item.get("_reasoning") or item.get("reasoning") or "").strip() or None
            refs_raw = item.get("source_refs")
            source_refs = [str(r) for r in refs_raw] if isinstance(refs_raw, list) else []
            out.append(
                GeneratedQuestionItem(
                    predicted_question=str(item.get("predicted_question", item.get("question", ""))),
                    suggested_answer=str(item.get("suggested_answer", item.get("recommended_answer", ""))),
                    category=flat or "General",
                    category_l1=l1,
                    category_l2=l2,
                    risk=str(item.get("risk", "medium")).lower(),
                    likelihood=likelihood,
                    catalyst_type=catalyst_type,
                    reasoning=reasoning,
                    source_refs=source_refs,
                )
            )
        return out
    except json.JSONDecodeError:
        pass

    out: list[GeneratedQuestionItem] = []
    blocks = re.split(r"\n---\n", raw)
    for b in blocks[:num]:
        if not b.strip():
            continue
        out.append(
            GeneratedQuestionItem(
                predicted_question=b.strip()[:2000],
                suggested_answer="",
                category="General",
                risk="medium",
            )
        )
    return out


def _fetch_analysis_context(supabase: Client, analysis_id: str) -> str:
    """Fetch analysis results and format as structured context blocks."""
    try:
        resp = (
            supabase.table("document_analyses")
            .select("*")
            .eq("id", analysis_id)
            .limit(1)
            .execute()
        )
        if not resp.data:
            return ""
        row = resp.data[0]
    except Exception:
        return ""

    blocks: list[str] = []

    # Themes
    themes = row.get("themes") or []
    if themes:
        lines = [f"- {t['name']} ({t.get('importance','medium')}): {t.get('description','')}" for t in themes]
        blocks.append("--- Identified Themes (current quarter) ---\n" + "\n".join(lines))

    # Deltas
    deltas = row.get("deltas") or []
    if deltas:
        lines = [
            f"- {d['theme']}: {d.get('direction','stable')} ({d.get('magnitude','')})"
            f" — Current: {d.get('current_summary','')} | Previous: {d.get('previous_summary','')}"
            for d in deltas
        ]
        blocks.append("--- Quarter-over-Quarter Changes ---\n" + "\n".join(lines))

    # Signals
    signals = row.get("signals") or []
    if signals:
        lines = [f"- [{s.get('type','')}] ({s.get('severity','medium')}): {s.get('description','')}" for s in signals]
        blocks.append("--- Detected Signals & Risks ---\n" + "\n".join(lines))

    # Question patterns
    patterns = row.get("question_patterns") or []
    if patterns:
        lines = []
        for p in patterns:
            examples = "; ".join(p.get("example_questions", [])[:3])
            lines.append(f"- {p.get('theme','')}: {p.get('pattern_description','')} ({p.get('frequency','')}) — Examples: {examples}")
        blocks.append("--- Historical Analyst Question Patterns ---\n" + "\n".join(lines))

    return "\n\n".join(blocks)


def run_question_generation(supabase: Client, req: QuestionGenerationRequest) -> QuestionGenerationResponse:
    if get_openai_client() is None:
        raise RuntimeError("OPENAI_API_KEY is not configured; cannot generate questions")

    auto_resolved = False
    if req.num_questions is None:
        avg = _avg_questions_last_4_quarters(supabase, req.company)
        resolved_num = avg if avg is not None else DEFAULT_NUM_QUESTIONS_FALLBACK
        auto_resolved = True
    else:
        resolved_num = req.num_questions
    req.num_questions = resolved_num

    actual_block, predicted_block = _fetch_historical_context(supabase, req)
    rag_block = _fetch_rag_chunks(supabase, req)

    # Fetch analysis context if analysis_id is provided
    analysis_block = ""
    if req.analysis_id:
        analysis_block = _fetch_analysis_context(supabase, req.analysis_id)

    quarter_label = (req.quarter or "the upcoming").strip()
    fiscal_year_label = str(req.fiscal_year) if req.fiscal_year else "the upcoming"
    fy_short_label = str(req.fiscal_year)[-2:] if req.fiscal_year else "—"

    prompt = QUESTION_GENERATION_PROMPT.format(
        expert_persona=EXPERT_PERSONA,
        industry_directive=INDUSTRY_AWARE_DIRECTIVE,
        company=req.company,
        quarter=quarter_label,
        fy_short=fy_short_label,
        fiscal_year=fiscal_year_label,
        actual_block=actual_block or "(no historical Q&A available)",
        predicted_block=predicted_block or "(no prior predicted questions)",
        rag_block=rag_block or "(no vector matches or OPENAI unavailable)",
        analysis_block=analysis_block or "(no analysis context available — fall back to historical patterns and RAG)",
        category_taxonomy=CATEGORY_TAXONOMY_QUESTION_PROMPT,
        num_questions=req.num_questions,
    )

    raw = chat_completion(
        [
            {
                "role": "system",
                "content": (
                    EXPERT_PERSONA
                    + "\n\n"
                    + INDUSTRY_AWARE_DIRECTIVE
                    + "\n\nYou output only valid JSON arrays. No markdown."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.35,
    )

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    questions = _parse_llm_questions(cleaned, req.num_questions)

    persist_errors: list[str] = []
    persist_saved = 0
    # If the DB hasn't had migration 010 applied yet, PostgREST can't see the
    # fiscal_year / quarter columns. Detect that once and fall back to the
    # legacy column set so persistence still succeeds.
    period_columns_supported = True
    category_hierarchy_supported = True
    extended_columns_supported = True
    _EXTENDED_COLS = ("likelihood", "catalyst_type", "reasoning", "source_refs")
    if req.persist and questions:
        for q in questions:
            base_row: dict[str, Any] = {
                "id": str(uuid.uuid4()),
                "company": req.company.strip(),
                "predicted_question": q.predicted_question,
                "suggested_answer": q.suggested_answer,
                "category": q.category,
                "risk": q.risk,
            }
            row = dict(base_row)
            if period_columns_supported:
                row["fiscal_year"] = req.fiscal_year
                row["quarter"] = req.quarter
            if category_hierarchy_supported:
                row["category_l1"] = q.category_l1
                row["category_l2"] = q.category_l2
            if extended_columns_supported:
                row["likelihood"] = q.likelihood
                row["catalyst_type"] = q.catalyst_type
                row["reasoning"] = q.reasoning
                row["source_refs"] = q.source_refs
            try:
                supabase.table("predicted_qa").insert(row).execute()
                q.id = row["id"]
                persist_saved += 1
            except Exception as exc:
                msg = str(exc)
                if extended_columns_supported and any(c in msg for c in _EXTENDED_COLS):
                    extended_columns_supported = False
                    for c in _EXTENDED_COLS:
                        row.pop(c, None)
                    try:
                        supabase.table("predicted_qa").insert(row).execute()
                        q.id = row["id"]
                        persist_saved += 1
                        continue
                    except Exception as exc_inner:
                        msg = str(exc_inner)
                if category_hierarchy_supported and (
                    "category_l1" in msg or "category_l2" in msg
                ):
                    category_hierarchy_supported = False
                    row.pop("category_l1", None)
                    row.pop("category_l2", None)
                    try:
                        supabase.table("predicted_qa").insert(row).execute()
                        q.id = row["id"]
                        persist_saved += 1
                        continue
                    except Exception:
                        pass
                if period_columns_supported and (
                    "fiscal_year" in msg or "quarter" in msg or "PGRST204" in msg
                ):
                    period_columns_supported = False
                    try:
                        supabase.table("predicted_qa").insert(base_row).execute()
                        q.id = base_row["id"]
                        persist_saved += 1
                        continue
                    except Exception as exc2:
                        persist_errors.append(
                            f"{q.predicted_question[:40]}…: {exc2}"
                        )
                        continue
                persist_errors.append(f"{q.predicted_question[:40]}…: {exc}")
    if req.persist and questions and persist_saved == 0:
        raise RuntimeError(
            "Failed to persist questions to predicted_qa. "
            + ("; ".join(persist_errors[:3]) if persist_errors else "No rows saved.")
        )

    summary = (
        f"Target count: {resolved_num}"
        f"{' (auto from last 4 quarters)' if auto_resolved else ''}. "
        f"Used {len(actual_block.splitlines())} actual Q&A lines, "
        f"{len(predicted_block.splitlines())} predicted lines, RAG={'yes' if rag_block else 'no'}."
    )
    if persist_errors:
        summary += f" Persist: {persist_saved}/{len(questions)} saved; {len(persist_errors)} error(s)."
    return QuestionGenerationResponse(
        questions=questions,
        context_summary=summary,
        resolved_num_questions=resolved_num,
    )
