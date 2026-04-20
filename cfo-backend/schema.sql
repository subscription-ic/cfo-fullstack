-- =============================================================================
-- CFO Fullstack — revised database schema (Supabase / PostgreSQL 15+)
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor → New query → Run.
--
-- Prerequisites:
--   • Enable extension "vector" (this script uses CREATE EXTENSION IF NOT EXISTS).
--   • Embedding size is 1536 — must match backend EMBEDDING_DIMENSION / OpenAI model
--     (e.g. text-embedding-3-small). If you change model dimensions, alter vector(1536)
--     here and recreate document_chunks + match_document_chunks.
--
-- Idempotent: IF NOT EXISTS tables; CREATE OR REPLACE function.
-- Data seeding (optional): migrations/004_seed_sample_qa.sql
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- -----------------------------------------------------------------------------
-- predicted_qa — AI / predicted questions for earnings prep
--   API: GET /api/predicted-questions, inserts from question-generation (persist)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS predicted_qa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company TEXT NOT NULL,
    predicted_question TEXT NOT NULL,
    suggested_answer TEXT,
    category TEXT,
    risk TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_predicted_qa_company ON predicted_qa (company);
CREATE INDEX IF NOT EXISTS idx_predicted_qa_created_at ON predicted_qa (created_at);

COMMENT ON TABLE predicted_qa IS 'Predicted earnings-call Q&A; strategist list source.';

-- -----------------------------------------------------------------------------
-- documents — uploaded file metadata (bytes live in Supabase Storage)
--   API: POST /upload
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company TEXT NOT NULL,
    fiscal_year INTEGER NOT NULL,
    quarter TEXT NOT NULL,
    document_type TEXT NOT NULL,
    source_category TEXT NOT NULL,
    storage_bucket TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    original_filename TEXT,
    mime_type TEXT,
    size_bytes BIGINT,
    processing_status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    content_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_content_hash
    ON documents (content_hash)
    WHERE content_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_company ON documents (company);
CREATE INDEX IF NOT EXISTS idx_documents_company_year_q ON documents (company, fiscal_year, quarter);

COMMENT ON TABLE documents IS 'Per-upload metadata; links to Storage path and document_chunks.';

-- -----------------------------------------------------------------------------
-- document_chunks — text chunks + embeddings for RAG
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),
    page_number INTEGER,
    page_summary TEXT,
    l1_heading TEXT,
    l2_headings TEXT[],
    l3_headings TEXT[],
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_page_number ON document_chunks (document_id, page_number);

COMMENT ON TABLE document_chunks IS 'Chunked text; metadata repeats company/year/quarter/type for filters.';
COMMENT ON COLUMN document_chunks.metadata IS 'JSON: company, fiscal_year, quarter, document_type, source_category, chunk_index, etc.';

-- -----------------------------------------------------------------------------
-- actual_earnings_qa — historical real Q&A from calls (for review + LLM context)
--   API: GET/POST/PUT/DELETE /api/actual-earnings-qa
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS actual_earnings_qa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company TEXT NOT NULL,
    fiscal_year INTEGER,
    quarter TEXT,
    period_label TEXT,
    question TEXT NOT NULL,
    answer TEXT,
    answered_by TEXT,
    category TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_actual_earnings_qa_company ON actual_earnings_qa (company);
CREATE INDEX IF NOT EXISTS idx_actual_earnings_qa_period ON actual_earnings_qa (company, fiscal_year, quarter);

COMMENT ON TABLE actual_earnings_qa IS 'Historical analyst Q&A; admin review tab + question-generation context.';

-- -----------------------------------------------------------------------------
-- match_document_chunks — vector similarity RPC (cosine distance via <=> )
--   Called from backend via supabase.rpc("match_document_chunks", {...})
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
AS $$
    SELECT
        dc.id,
        dc.document_id,
        dc.content,
        dc.metadata,
        (1 - (dc.embedding <=> query_embedding))::DOUBLE PRECISION AS similarity
    FROM document_chunks dc
    WHERE dc.embedding IS NOT NULL
      AND (
          filter_company IS NULL
          OR filter_company = ''
          OR dc.metadata->>'company' ILIKE '%' || filter_company || '%'
      )
      AND (
          filter_doc_type IS NULL
          OR filter_doc_type = ''
          OR dc.metadata->>'document_type' = filter_doc_type
      )
      AND (
          filter_source_category IS NULL
          OR filter_source_category = ''
          OR dc.metadata->>'source_category' = filter_source_category
      )
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
$$;

COMMENT ON FUNCTION match_document_chunks IS 'RAG retrieval; pass query embedding + optional metadata filters.';

-- -----------------------------------------------------------------------------
-- Optional: HNSW index on embeddings after you have enough rows (performance)
-- -----------------------------------------------------------------------------
-- CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw
--     ON document_chunks
--     USING hnsw (embedding vector_cosine_ops);

-- -----------------------------------------------------------------------------
-- Hybrid search (lexical leg) — see migrations/005_document_chunks_lexical_search.sql
-- -----------------------------------------------------------------------------
-- ALTER TABLE document_chunks ADD COLUMN content_tsv tsvector
--   GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;
-- CREATE INDEX idx_document_chunks_content_tsv ON document_chunks USING gin (content_tsv);
-- Function: match_document_chunks_lexical(query_text, filter_company, match_count)
--
-- document_chunks.metadata (ingest): page_number, citation, file_ref, source_filename,
--   storage_bucket, storage_path, mime_type (for signed PDF links with #page=N).
-- Optional backfill: migrations/006_backfill_chunk_storage_from_documents.sql
