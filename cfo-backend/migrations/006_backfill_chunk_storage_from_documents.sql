-- Backfill document_chunks.metadata with storage location from documents (for signed PDF links).
-- Safe to re-run: only fills when storage_path missing on the chunk.

UPDATE document_chunks dc
SET metadata = dc.metadata
    || jsonb_build_object(
        'storage_bucket', d.storage_bucket,
        'storage_path', d.storage_path,
        'mime_type', COALESCE(NULLIF(d.mime_type, ''), '')
    )
FROM documents d
WHERE dc.document_id = d.id
  AND (dc.metadata->>'storage_path' IS NULL OR dc.metadata->>'storage_path' = '');
