-- =============================================================================
-- CFO Fullstack — complete database setup (Supabase / PostgreSQL 15+)
-- =============================================================================
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- This is migrations/001..017 consolidated into one idempotent script. Safe to
-- re-run: every object uses IF NOT EXISTS / CREATE OR REPLACE.
--
-- NOTE ON THE LEGACY SCHEMA: an earlier prototype (pipeline_router.py) created
-- companies / earnings_calls / predicted_questions / actual_questions and a
-- DIFFERENT `documents` table. Those are left untouched except that the legacy
-- `documents` table is renamed to `documents_legacy` — otherwise
-- CREATE TABLE IF NOT EXISTS would silently keep the wrong shape and every
-- upload/ingest call would fail later on missing columns.
-- To copy the legacy rows into the new tables, run
-- migrations/018_backfill_from_legacy_schema.sql afterwards.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- -----------------------------------------------------------------------------
-- 0. Move the legacy `documents` table out of the way (no-op on a fresh project)
-- -----------------------------------------------------------------------------
DO $do$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'documents'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'company'
    ) THEN
        ALTER TABLE public.documents RENAME TO documents_legacy;
        RAISE NOTICE 'Legacy documents table renamed to documents_legacy.';
    END IF;
END
$do$;

-- -----------------------------------------------------------------------------
-- 1. predicted_qa — predicted questions for earnings prep
--    API: GET /api/predicted-questions; inserts from question-generation
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS predicted_qa (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company            TEXT NOT NULL,
    predicted_question TEXT NOT NULL,
    suggested_answer   TEXT,
    category           TEXT,
    risk               TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 010: period attribution
ALTER TABLE predicted_qa
    ADD COLUMN IF NOT EXISTS fiscal_year INTEGER,
    ADD COLUMN IF NOT EXISTS quarter     TEXT;

-- 014: two-level taxonomy
ALTER TABLE predicted_qa
    ADD COLUMN IF NOT EXISTS category_l1 TEXT,
    ADD COLUMN IF NOT EXISTS category_l2 TEXT;

-- 017: question-generation extended fields
ALTER TABLE predicted_qa
    ADD COLUMN IF NOT EXISTS likelihood    TEXT,
    ADD COLUMN IF NOT EXISTS catalyst_type TEXT,
    ADD COLUMN IF NOT EXISTS reasoning     TEXT,
    ADD COLUMN IF NOT EXISTS source_refs   TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_predicted_qa_company     ON predicted_qa (company);
CREATE INDEX IF NOT EXISTS idx_predicted_qa_created_at  ON predicted_qa (created_at);
CREATE INDEX IF NOT EXISTS idx_predicted_qa_category_l1 ON predicted_qa (category_l1);
CREATE INDEX IF NOT EXISTS idx_predicted_qa_company_period
    ON predicted_qa (company, fiscal_year, quarter);

COMMENT ON TABLE predicted_qa IS 'Predicted earnings-call Q&A; strategist list source.';

-- -----------------------------------------------------------------------------
-- 2. documents — uploaded file metadata (bytes live in Supabase Storage)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company           TEXT NOT NULL,
    fiscal_year       INTEGER NOT NULL,
    quarter           TEXT NOT NULL,
    document_type     TEXT NOT NULL,
    source_category   TEXT NOT NULL,
    storage_bucket    TEXT NOT NULL,
    storage_path      TEXT NOT NULL,
    original_filename TEXT,
    mime_type         TEXT,
    size_bytes        BIGINT,
    processing_status TEXT NOT NULL DEFAULT 'pending',
    error_message     TEXT,
    content_hash      TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 007 / 012 for pre-existing installs
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_content_hash
    ON documents (content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_company        ON documents (company);
CREATE INDEX IF NOT EXISTS idx_documents_company_year_q ON documents (company, fiscal_year, quarter);

COMMENT ON TABLE documents IS 'Per-upload metadata; links to Storage path and document_chunks.';

-- -----------------------------------------------------------------------------
-- 3. document_chunks — text chunks + embeddings for RAG
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_chunks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id  UUID NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    chunk_index  INTEGER NOT NULL,
    content      TEXT NOT NULL,
    embedding    vector(1536),
    page_number  INTEGER,
    page_summary TEXT,
    l1_heading   TEXT,
    l2_headings  TEXT[],
    l3_headings  TEXT[],
    metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 005: lexical leg of hybrid search
ALTER TABLE document_chunks
    ADD COLUMN IF NOT EXISTS content_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_page_number ON document_chunks (document_id, page_number);
CREATE INDEX IF NOT EXISTS idx_document_chunks_content_tsv ON document_chunks USING gin (content_tsv);

COMMENT ON TABLE document_chunks IS 'Chunked text; metadata repeats company/year/quarter/type for filters.';

-- -----------------------------------------------------------------------------
-- 4. actual_earnings_qa — real analyst Q&A extracted from transcripts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS actual_earnings_qa (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company      TEXT NOT NULL,
    fiscal_year  INTEGER,
    quarter      TEXT,
    period_label TEXT,
    question     TEXT NOT NULL,
    answer       TEXT,
    answered_by  TEXT,
    category     TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 009 / 011 / 014
ALTER TABLE actual_earnings_qa
    ADD COLUMN IF NOT EXISTS predicted_qa_id    UUID REFERENCES predicted_qa (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS similarity_score   NUMERIC(5, 2),
    ADD COLUMN IF NOT EXISTS match_reason       TEXT,
    ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES documents (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS asked_by           TEXT,
    ADD COLUMN IF NOT EXISTS category_l1        TEXT,
    ADD COLUMN IF NOT EXISTS category_l2        TEXT;

CREATE INDEX IF NOT EXISTS idx_actual_earnings_qa_company      ON actual_earnings_qa (company);
CREATE INDEX IF NOT EXISTS idx_actual_earnings_qa_period       ON actual_earnings_qa (company, fiscal_year, quarter);
CREATE INDEX IF NOT EXISTS idx_actual_earnings_qa_predicted_qa ON actual_earnings_qa (predicted_qa_id);
CREATE INDEX IF NOT EXISTS idx_actual_earnings_qa_source_document ON actual_earnings_qa (source_document_id);
CREATE INDEX IF NOT EXISTS idx_actual_earnings_qa_category_l1  ON actual_earnings_qa (category_l1);

COMMENT ON TABLE actual_earnings_qa IS 'Historical analyst Q&A; admin review tab + question-generation context.';

-- -----------------------------------------------------------------------------
-- 5. document_analyses (008) — cached per-document LLM analysis
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_analyses (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id          UUID NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    company              TEXT NOT NULL,
    fiscal_year          INTEGER NOT NULL,
    quarter              TEXT NOT NULL,
    detected_company     TEXT,
    detected_period      TEXT,
    detected_fiscal_year INTEGER,
    detected_quarter     TEXT,
    historical_doc_ids   UUID[] DEFAULT '{}',
    themes               JSONB NOT NULL DEFAULT '[]'::jsonb,
    deltas               JSONB NOT NULL DEFAULT '[]'::jsonb,
    signals              JSONB NOT NULL DEFAULT '[]'::jsonb,
    question_patterns    JSONB NOT NULL DEFAULT '[]'::jsonb,
    status               TEXT NOT NULL DEFAULT 'pending',
    error_message        TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_analyses_document_id ON document_analyses (document_id);
CREATE INDEX IF NOT EXISTS idx_document_analyses_company_period ON document_analyses (company, fiscal_year, quarter);
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_analyses_document_unique ON document_analyses (document_id);

COMMENT ON TABLE document_analyses IS 'Cached LLM analysis per document: themes, deltas, signals, question patterns.';

-- -----------------------------------------------------------------------------
-- 6. analyst_research_reports (016)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analyst_research_reports (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id          UUID NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    company              TEXT NOT NULL,
    fiscal_year          INTEGER NOT NULL,
    quarter              TEXT NOT NULL,
    firm                 TEXT,
    rating               TEXT,
    rating_tone          TEXT,
    target_price         NUMERIC,
    target_price_display TEXT,
    summary              TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_analyst_research_reports_document
    ON analyst_research_reports (document_id);
CREATE INDEX IF NOT EXISTS idx_analyst_research_reports_company_period
    ON analyst_research_reports (company, fiscal_year, quarter);

COMMENT ON TABLE analyst_research_reports IS 'Per-document analyst research report: firm, rating, target price, summary (LLM-extracted).';

-- -----------------------------------------------------------------------------
-- 7. match_audit_log (015)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS match_audit_log (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id                    UUID NOT NULL,
    run_kind                  TEXT NOT NULL DEFAULT 'extract',
    company                   TEXT NOT NULL,
    fiscal_year               INTEGER NOT NULL,
    quarter                   TEXT NOT NULL,
    actual_qa_id              UUID,
    actual_question           TEXT,
    actual_category_l1        TEXT,
    actual_category_l2        TEXT,
    predicted_qa_id_candidate UUID,
    predicted_question        TEXT,
    predicted_category_l1     TEXT,
    predicted_category_l2     TEXT,
    l1_match                  BOOLEAN,
    l2_match                  BOOLEAN,
    similarity                DOUBLE PRECISION,
    threshold_similarity      DOUBLE PRECISION,
    threshold_strong          DOUBLE PRECISION,
    linked                    BOOLEAN NOT NULL DEFAULT FALSE,
    link_reason               TEXT,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_audit_log_company_period
    ON match_audit_log (company, fiscal_year, quarter, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_audit_log_run    ON match_audit_log (run_id);
CREATE INDEX IF NOT EXISTS idx_match_audit_log_actual ON match_audit_log (actual_qa_id);

COMMENT ON TABLE match_audit_log IS
    'One row per link attempt during transcript extraction or relink.';

-- -----------------------------------------------------------------------------
-- 8. RAG retrieval RPCs
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION match_document_chunks (
    query_embedding vector(1536),
    filter_company TEXT,
    filter_doc_type TEXT DEFAULT NULL,
    filter_source_category TEXT DEFAULT NULL,
    match_count INTEGER DEFAULT 12
)
RETURNS TABLE (
    id UUID,
    document_id UUID,
    content TEXT,
    metadata JSONB,
    similarity DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $fn$
    SELECT
        dc.id,
        dc.document_id,
        dc.content,
        dc.metadata,
        (1 - (dc.embedding <=> query_embedding))::DOUBLE PRECISION AS similarity
    FROM document_chunks dc
    WHERE dc.embedding IS NOT NULL
      AND (filter_company IS NULL OR filter_company = ''
           OR dc.metadata->>'company' ILIKE '%' || filter_company || '%')
      AND (filter_doc_type IS NULL OR filter_doc_type = ''
           OR dc.metadata->>'document_type' = filter_doc_type)
      AND (filter_source_category IS NULL OR filter_source_category = ''
           OR dc.metadata->>'source_category' = filter_source_category)
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
$fn$;

COMMENT ON FUNCTION match_document_chunks IS 'RAG retrieval; pass query embedding + optional metadata filters.';

CREATE OR REPLACE FUNCTION match_document_chunks_lexical (
    query_text TEXT,
    filter_company TEXT,
    match_count INTEGER DEFAULT 24
)
RETURNS TABLE (
    id UUID,
    document_id UUID,
    content TEXT,
    metadata JSONB,
    lex_score DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $fn$
    SELECT
        dc.id,
        dc.document_id,
        dc.content,
        dc.metadata,
        ts_rank_cd(dc.content_tsv, plainto_tsquery('english', query_text))::DOUBLE PRECISION AS lex_score
    FROM document_chunks dc
    WHERE query_text IS NOT NULL
      AND btrim(query_text) <> ''
      AND dc.content_tsv @@ plainto_tsquery('english', query_text)
      AND (filter_company IS NULL OR filter_company = ''
           OR dc.metadata->>'company' ILIKE '%' || filter_company || '%')
    ORDER BY lex_score DESC
    LIMIT match_count;
$fn$;

COMMENT ON FUNCTION match_document_chunks_lexical IS 'Lexical retrieval for hybrid search; pairs with match_document_chunks (dense).';
