-- Add content_hash to documents to prevent duplicate ingestion of the same file.
-- Hash is SHA-256 of the raw upload bytes, hex-encoded (64 chars).

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_content_hash
    ON documents (content_hash)
    WHERE content_hash IS NOT NULL;
