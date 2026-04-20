-- Last-modified time for document rows (also set by backend on status updates).
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE documents SET updated_at = created_at WHERE updated_at IS NULL;
