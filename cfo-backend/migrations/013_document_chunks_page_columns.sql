-- Promote per-page analysis fields from chunk.metadata JSONB to real columns
-- so they can be queried, indexed, and displayed without JSON digging.

ALTER TABLE document_chunks
    ADD COLUMN IF NOT EXISTS page_number INTEGER,
    ADD COLUMN IF NOT EXISTS page_summary TEXT,
    ADD COLUMN IF NOT EXISTS l1_heading TEXT,
    ADD COLUMN IF NOT EXISTS l2_headings TEXT[],
    ADD COLUMN IF NOT EXISTS l3_headings TEXT[];

CREATE INDEX IF NOT EXISTS idx_document_chunks_page_number
    ON document_chunks (document_id, page_number);
