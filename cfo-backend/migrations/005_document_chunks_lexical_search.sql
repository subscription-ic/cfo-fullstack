-- Full-text search on document_chunks for hybrid RAG (lexical leg).
-- Run after 001_initial.sql. Safe to re-run: IF NOT EXISTS / CREATE OR REPLACE.

ALTER TABLE document_chunks
    ADD COLUMN IF NOT EXISTS content_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_document_chunks_content_tsv
    ON document_chunks USING gin (content_tsv);

CREATE OR REPLACE FUNCTION match_document_chunks_lexical (
    query_text text,
    filter_company text,
    match_count integer DEFAULT 24
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
AS $$
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
      AND (
          filter_company IS NULL
          OR filter_company = ''
          OR dc.metadata->>'company' ILIKE '%' || filter_company || '%'
      )
    ORDER BY lex_score DESC
    LIMIT match_count;
$$;

COMMENT ON FUNCTION match_document_chunks_lexical IS 'Lexical retrieval for hybrid search; pairs with match_document_chunks (dense).';
