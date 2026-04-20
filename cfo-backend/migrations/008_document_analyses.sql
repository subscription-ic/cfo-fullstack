-- 008_document_analyses.sql
-- Stores cached LLM analysis results per document: themes, deltas, signals, question patterns.

CREATE TABLE IF NOT EXISTS document_analyses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    company         TEXT NOT NULL,
    fiscal_year     INTEGER NOT NULL,
    quarter         TEXT NOT NULL,

    -- Auto-detected metadata
    detected_company     TEXT,
    detected_period      TEXT,
    detected_fiscal_year INTEGER,
    detected_quarter     TEXT,

    -- IDs of historical documents used as context
    historical_doc_ids   UUID[] DEFAULT '{}',

    -- LLM analysis results (JSONB arrays)
    themes              JSONB NOT NULL DEFAULT '[]'::jsonb,
    deltas              JSONB NOT NULL DEFAULT '[]'::jsonb,
    signals             JSONB NOT NULL DEFAULT '[]'::jsonb,
    question_patterns   JSONB NOT NULL DEFAULT '[]'::jsonb,

    status          TEXT NOT NULL DEFAULT 'pending',
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_analyses_document_id
    ON document_analyses (document_id);

CREATE INDEX IF NOT EXISTS idx_document_analyses_company_period
    ON document_analyses (company, fiscal_year, quarter);

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_analyses_document_unique
    ON document_analyses (document_id);

COMMENT ON TABLE document_analyses
    IS 'Cached LLM analysis per document: themes, deltas, signals, question patterns.';
