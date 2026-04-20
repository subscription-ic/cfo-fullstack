"""Cross-module constants."""

from __future__ import annotations

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
PAGE_CHUNK_MAX_CHARS = 4000

TRANSCRIPT_DOC_TYPES = {"TR", "current_ec", "historical_ec", "earnings_transcript"}

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
CATEGORY_TAXONOMY_BLOCK = (
    f"Use a three-level taxonomy on every question/topic you emit:\n"
    f"  category_l1 — ONE bucket copied verbatim from: {CATEGORY_L1_ENUM}.\n"
    f"  category_l2 — 2-5 word specific angle under that L1 (e.g. 'NIM "
    f"Pressure', 'Buybacks', 'NPA Trend', 'Book-to-Bill', 'ANDA Pipeline').\n"
    f"  category_l3 — 2-5 word even-more-granular sub-angle (e.g. 'EBLR "
    f"Repricing Lag', 'Retail Unsecured Cost', 'Large-Cap Deal Velocity'). "
    f"Empty string allowed only when no finer detail exists."
)
