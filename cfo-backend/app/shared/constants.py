"""Cross-module constants."""

from __future__ import annotations

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
PAGE_CHUNK_MAX_CHARS = 4000

TRANSCRIPT_DOC_TYPES = {"TR", "current_ec", "historical_ec", "earnings_transcript"}

# Third-party analyst research reports.
RESEARCH_DOC_TYPES = {"RR"}

# Document types that must never feed AI-predicted Q&A or simulator answers:
# transcripts are the event we predict against; research reports are third-party
# analyst content, not the company's own disclosures.
QA_EXCLUDED_DOC_TYPES = TRANSCRIPT_DOC_TYPES | RESEARCH_DOC_TYPES

# Belt-and-suspenders for legacy chunks whose document_type is blank but whose
# source_category is set. Mirrors QA_EXCLUDED_DOC_TYPES at the category level.
QA_EXCLUDED_SOURCE_CATEGORIES = {"research_report", "earnings_transcript"}

# Shared expert persona — prepend this to every analysis/extraction/generation
# system prompt so the LLM adopts a consistent seniority and perspective.
EXPERT_PERSONA = (
    "You are a seasoned expert spanning Investor Relations, Financial "
    "Planning & Analysis (FP&A), and Accounting & Controllership. You have "
    "sat on both sides of earnings calls — preparing CFOs for Q&A and "
    "asking the hard questions as a sell-side analyst — and you think in "
    "terms of analyst KPIs, disclosure quality, forward guidance risk, "
    "and the accounting treatments that drive reported numbers."
)

# Industry-awareness directive — append when a company name is in scope so
# the LLM frames outputs in that company's sector-specific vocabulary, KPIs,
# regulatory regime, and analyst focus areas.
INDUSTRY_AWARE_DIRECTIVE = (
    "Before responding, internally infer this company's industry from its "
    "name and the surrounding context (banking, insurance, pharma, IT "
    "services, retail, industrials, etc.). Frame every question and every "
    "answer in terms of THAT industry's KPIs, regulatory regime, and the "
    "specific metrics analysts actually track for peers in the same sector. "
    "For banks think NIM, CASA, NPA, CET1, credit cost, slippage; for IT "
    "services think book-to-bill, DSO, offshore mix, utilization, pricing; "
    "for pharma think R&D/sales, pipeline, ANDA approvals, USFDA actions; "
    "for consumer think volume growth, ASP, gross margin, A&P intensity, "
    "channel mix. Never use generic phrasing when an industry-specific "
    "term is available."
)

# The three-level taxonomy used across ingestion, extraction, and generation.
# Keep this block identical everywhere so L1 values match byte-for-byte.
CATEGORY_L1_ENUM = (
    "Growth, Margins, Guidance, Capital & Liquidity, Asset Quality, "
    "Segment Performance, Demand, Cost Structure, M&A, Risk & Regulation, "
    "Strategy, Other"
)
# Legacy free-form block — kept for backward compatibility while old code
# paths still reference it. New code should use the closed-enum prompts below.
CATEGORY_TAXONOMY_BLOCK = (
    f"Use a three-level taxonomy on every question/topic you emit:\n"
    f"  category_l1 — ONE bucket copied verbatim from: {CATEGORY_L1_ENUM}.\n"
    f"  category_l2 — 2-5 word specific angle under that L1 (e.g. 'NIM "
    f"Pressure', 'Buybacks', 'NPA Trend', 'Book-to-Bill', 'ANDA Pipeline').\n"
    f"  category_l3 — 2-5 word even-more-granular sub-angle (e.g. 'EBLR "
    f"Repricing Lag', 'Retail Unsecured Cost', 'Large-Cap Deal Velocity'). "
    f"Empty string allowed only when no finer detail exists."
)


# Closed L1→L2 enum shared by every classifier (questions and pages).
# /debrief joins predicted vs actual by EXACT STRING MATCH on (L1, L2).
# Any classifier emitting a value outside this list silently breaks the join.
_TAXONOMY_CLOSED_LIST = """\
═══════════════════════════════════════════════════════════════════
CLOSED TAXONOMY — the ONLY allowed values
═══════════════════════════════════════════════════════════════════

category_l1 ∈ { Growth, Margins, Guidance, Capital & Liquidity,
Asset Quality, Segment Performance, Demand, Cost Structure, M&A,
Risk & Regulation, Strategy, Other }

Allowed L2 per L1 (copy VERBATIM — same casing, ampersands, slashes):

Growth:               Revenue Growth | Volume Growth | Customer Acquisition |
                      Geographic Expansion | Pricing-Led Growth |
                      Segment Mix Growth | Other Growth
Margins:              Gross Margin | Operating Margin | EBITDA Margin |
                      Net Margin | NIM Pressure | Cost Pass-Through |
                      Pricing & Mix | Other Margins
Guidance:             Next-Quarter Guidance | Full-Year Guidance |
                      Long-Term Targets | Capex Guidance | Margin Guidance |
                      Tax-Rate Guidance | Other Guidance
Capital & Liquidity:  Buybacks | Dividends | Leverage & Debt |
                      Capital Adequacy | Cash Position | Working Capital |
                      Other Capital
Asset Quality:        NPA Trend | Provisioning | Credit Cost | Slippages |
                      Recoveries | Restructured Book | Other Asset Quality
Segment Performance:  Segment Mix | Geographic Mix | Product Line |
                      Vertical Performance | Channel Performance |
                      Other Segment
Demand:               End-Market Demand | Order Book | Pipeline |
                      Customer Sentiment | Seasonality | Macro Demand |
                      Other Demand
Cost Structure:       Opex Leverage | Employee Cost | Input Costs |
                      Inflation Pass-Through | One-Off Costs | Other Costs
M&A:                  Acquisition Rationale | Integration Progress |
                      Synergies | Divestiture | M&A Pipeline | Other M&A
Risk & Regulation:    Compliance | Litigation | Regulatory Change |
                      Tariff & Trade | Geopolitical | Cybersecurity |
                      Other Risk
Strategy:             Long-Term Strategy | Digital Transformation |
                      Competitive Positioning | Capital Allocation Strategy |
                      Sustainability / ESG | Brand & Marketing | Other Strategy
Other:                Business Focus | Management Commentary |
                      Operational Update | Uncategorized

`category` (legacy flat label) = lowercase snake_case of L1
   (e.g. "margins", "capital_and_liquidity", "risk_and_regulation").

Tie-breaker rules (apply in order when 2+ L1s seem to fit):
  i.   Specificity beats generality. A question/page about NIM is
       Margins, not Asset Quality, even though both touch the loan book.
  ii.  Forward-looking goes to Guidance ONLY if the analyst is asking
       management to NUMBER it ("what margin for FY27?"). Pure
       directional discussion stays under the metric's natural L1.
  iii. Capital-return mechanics (buyback, dividend, leverage) always
       belong in Capital & Liquidity, not Strategy.
  iv.  Regulatory or tariff-driven items are Risk & Regulation even
       when they affect Margins or Growth.
  v.   If two L1s still tie, pick the one whose L2 list contains a
       more specific match.
"""


CATEGORY_TAXONOMY_QUESTION_PROMPT = f"""
═══════════════════════════════════════════════════════════════════
META-INSTRUCTION — read this BEFORE classifying any question
═══════════════════════════════════════════════════════════════════

You are about to label QUESTIONS with a two-level taxonomy
(`category_l1`, `category_l2`). Downstream code joins PREDICTED to
ACTUAL questions by EXACT STRING MATCH on the pair. Inventing a new
L2, or rephrasing an existing one ("Margin Pressure" instead of
"Other Margins"), silently breaks the join and the system reports
zero recall.

Run the 4-step reasoning procedure mentally for every question and
emit a terse `_reasoning` field so the result is auditable. NEVER
skip a step. NEVER emit a label without completing the self-check.

STEP 1 — Restate.
  In one sentence, paraphrase what the question is literally asking.
  Strip pleasantries. Capture: subject + asked-for variable + timeframe.

STEP 2 — Identify the analyst's PRIMARY intent.
  Which single KPI or executive decision is the analyst probing?
  Use industry vocabulary (NIM for banks, book-to-bill for IT,
  ANDA pipeline for pharma, gross margin for consumer, etc.).
  If two intents tie, pick the more specific KPI.

STEP 3 — Pick L1 by elimination.
  Enumerate ≥ 2 candidate L1 buckets that could plausibly fit. Apply
  the tie-breakers (i-v) below. Commit to ONE L1 copied verbatim.

STEP 4 — Pick L2 + self-check.
  Scan the closed L2 list under the chosen L1. Pick the L2 that best
  fits Step 2's intent. If none fit, use the "Other …" fallback under
  the chosen L1 — never invent a new L2.
  SELF-CHECK: is the string you're about to emit character-identical
  to one of the allowed L2 values for this L1? If not, fix it.

{_TAXONOMY_CLOSED_LIST}
═══════════════════════════════════════════════════════════════════
WORKED EXAMPLES — few-shot anchors for the reasoning style
═══════════════════════════════════════════════════════════════════

EXAMPLE A — "On the US front, should we expect substantial growth in H2?
  You've been onboarding large clients — how does that flow into revenue?"
  _reasoning:
    Step 1: Will US revenue grow materially in H2 given recent large-client wins?
    Step 2: Forward US revenue trajectory, driven by new customer ramps.
    Step 3: Candidates: Growth, Guidance, Segment Performance.
      Tie-breaker (ii): not numbered guidance. Tie-breaker (v): Growth's
      L2 list captures Customer Acquisition exactly. Commit: Growth.
    Step 4: Customer Acquisition. Self-check ✓.
  category_l1: Growth
  category_l2: Customer Acquisition
  category: growth

EXAMPLE B — "Gross margins improved 0.5% this quarter. How sustainable
  is that, and what should we model for FY27?"
  _reasoning:
    Step 1: Is the GM improvement sustainable, and what GM should be
      modeled for FY27?
    Step 2: Forward gross-margin trajectory.
    Step 3: Candidates: Margins, Guidance. Tie-breaker (ii): analyst
      asks management to NUMBER FY27 → Guidance. Commit: Guidance.
    Step 4: Margin Guidance. Self-check ✓.
  category_l1: Guidance
  category_l2: Margin Guidance
  category: guidance

EXAMPLE C — "Pallak, where is most of your time going in the business?"
  _reasoning:
    Step 1: How is the CEO allocating attention across the portfolio?
    Step 2: Soft / colour question; no specific KPI.
    Step 3: Candidates: Strategy, Other. No specific L2 under Strategy
      fits. Tie-breaker (v): Other has a closer L2. Commit: Other.
    Step 4: Business Focus. Self-check ✓.
  category_l1: Other
  category_l2: Business Focus
  category: other

═══════════════════════════════════════════════════════════════════
OUTPUT REQUIREMENTS
═══════════════════════════════════════════════════════════════════

For each question, the JSON output MUST include:
  _reasoning   — multi-line string capturing Steps 1-4 in plain text,
                 ≤ 90 words. REQUIRED.
  category_l1  — verbatim from the L1 enum.
  category_l2  — verbatim from the L2 list for that L1.
  category     — lowercase snake_case of L1.

If you cannot complete the self-check, emit:
  category_l1 = "Other", category_l2 = "Uncategorized"
and explain the failure in `_reasoning`.

NEVER emit a label that fails the self-check. NEVER skip `_reasoning`.
"""


CATEGORY_TAXONOMY_PAGE_PROMPT = f"""
═══════════════════════════════════════════════════════════════════
META-INSTRUCTION — read this BEFORE classifying the page
═══════════════════════════════════════════════════════════════════

You are about to label a PAGE of a corporate-finance document with a
three-level taxonomy (`category_l1`, `category_l2`, `category_l3`).
The pair `(category_l1, category_l2)` is the primary retrieval key
used to pull this chunk in response to analyst questions on the same
theme, and to join predicted/actual Q&A in /debrief. Inventing a new
L2, or rephrasing an existing one, silently breaks retrieval AND the
join. The L2 string must be character-identical to an allowed value.

Run the 5-step reasoning procedure for every page and emit a terse
`_reasoning` field so the result is auditable. NEVER skip a step.

STEP 1 — Read and restate.
  In 2-3 sentences, restate what the page is about. Identify the
  document section (cover sheet, MD&A, financial highlights, segment
  results, transcript Q&A, risk factors, etc.).

STEP 2 — Identify the page's DOMINANT analyst lens.
  An equity analyst skimming this page would flag ONE thing as the
  main story. What is it? Use industry-specific KPIs.
  If the page is purely administrative (cover sheet, contact info,
  legal disclaimer, table of contents) there is no analyst lens —
  default to L1 = Other.

STEP 3 — Pick L1 by elimination.
  Enumerate ≥ 2 candidate L1 buckets. Apply tie-breakers (i-v).
  Commit to ONE L1 copied verbatim.

STEP 4 — Pick L2 + self-check.
  Scan the closed L2 list under the chosen L1. Pick the L2 that best
  fits Step 2's lens. If none fit, use the "Other …" fallback under
  the chosen L1 — never invent a new L2.
  SELF-CHECK: is the string character-identical to an allowed L2 for
  this L1? If not, fix it.

STEP 5 — Free-form L3 (page-specific sub-angle).
  2-5 words describing the SPECIFIC angle within the chosen L2.
  Examples: "Q2 FY26 NIM Walk", "US Segment Order Book",
  "Tariff Impact on FY27 GM". Empty string OK when no finer detail.

{_TAXONOMY_CLOSED_LIST}
═══════════════════════════════════════════════════════════════════
WORKED EXAMPLES
═══════════════════════════════════════════════════════════════════

EXAMPLE A — Page contains: "Gross margin improved 50 bps YoY to 14.2%
  driven by favourable mix and lower input costs. We expect 13.5-14%
  for FY26 based on current tariff scenarios…"
  _reasoning:
    Step 1: Page reports Q2 gross margin and gives FY26 GM range.
    Step 2: Dominant lens is gross-margin trajectory with explicit
      forward range.
    Step 3: Candidates: Margins, Guidance. Page NUMBERS FY26 → ii
      pulls toward Guidance. Commit: Guidance.
    Step 4: Margin Guidance. ✓
    Step 5: FY26 GM Range
  category_l1: Guidance
  category_l2: Margin Guidance
  category_l3: FY26 GM Range
  category: guidance

EXAMPLE B — Page contains: "Listing Department, National Stock Exchange…
  Scrip Symbol PDSL… Subject: Disclosure under Reg 30…"
  _reasoning:
    Step 1: Cover sheet for a stock-exchange filing.
    Step 2: No analyst lens — administrative boilerplate.
    Step 3: Candidates: Risk & Regulation, Other. Cover-sheet filing
      is administrative, not a regulatory event. Commit: Other.
    Step 4: Operational Update. ✓
    Step 5: Stock Exchange Filing
  category_l1: Other
  category_l2: Operational Update
  category_l3: Stock Exchange Filing
  category: other

═══════════════════════════════════════════════════════════════════
OUTPUT REQUIREMENTS
═══════════════════════════════════════════════════════════════════

In addition to whatever the caller asks for (summary, headings, etc.),
the JSON MUST include:
  _reasoning    — multi-line string capturing Steps 1-5, ≤ 100 words.
  category_l1   — verbatim from the L1 enum.
  category_l2   — verbatim from the L2 list for that L1.
  category_l3   — 2-5 word page-specific sub-angle, or empty string.
  category      — lowercase snake_case of L1.

NEVER emit a label that fails the self-check. NEVER skip `_reasoning`.
"""
