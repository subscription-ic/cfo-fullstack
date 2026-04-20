-- Same DDL as schema.sql — paste into Supabase SQL Editor and Run.

CREATE EXTENSION IF NOT EXISTS vector;

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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_company ON documents (company);
CREATE INDEX IF NOT EXISTS idx_documents_company_year_q ON documents (company, fiscal_year, quarter);

COMMENT ON TABLE documents IS 'Per-upload metadata; links to Storage path and document_chunks.';

CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks (document_id);

COMMENT ON TABLE document_chunks IS 'Chunked text; metadata repeats company/year/quarter/type for filters.';
COMMENT ON COLUMN document_chunks.metadata IS 'JSON: company, fiscal_year, quarter, document_type, source_category, chunk_index, etc.';

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
