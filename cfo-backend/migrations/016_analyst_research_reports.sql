-- 016_analyst_research_reports.sql
-- One row per uploaded Research Report (RR) document: the issuing analyst firm,
-- its rating, target price, and a short summary, extracted via LLM at ingest.
-- Powers the Post-Call Analysis "Analyst Target Prices" + "Research Reports —
-- Rating & Summarization" sections.

CREATE TABLE IF NOT EXISTS analyst_research_reports (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         UUID NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    company             TEXT NOT NULL,
    fiscal_year         INTEGER NOT NULL,
    quarter             TEXT NOT NULL,

    firm                TEXT,
    rating              TEXT,
    rating_tone         TEXT,            -- positive | neutral | negative
    target_price        NUMERIC,         -- nullable; numeric value for charting
    target_price_display TEXT,           -- e.g. "₹2,050"
    summary             TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One report row per RR document (idempotent re-ingest / backfill via upsert).
CREATE UNIQUE INDEX IF NOT EXISTS uq_analyst_research_reports_document
    ON analyst_research_reports (document_id);

CREATE INDEX IF NOT EXISTS idx_analyst_research_reports_company_period
    ON analyst_research_reports (company, fiscal_year, quarter);

COMMENT ON TABLE analyst_research_reports
    IS 'Per-document analyst research report: firm, rating, target price, summary (LLM-extracted at ingest).';
