-- Link extracted actual analyst Q&A to the transcript document and to the best-matching predicted_qa row,
-- with an LLM-as-judge similarity score (0-100) and a short reason.
ALTER TABLE actual_earnings_qa
    ADD COLUMN IF NOT EXISTS predicted_qa_id UUID REFERENCES predicted_qa(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS similarity_score NUMERIC(5, 2),
    ADD COLUMN IF NOT EXISTS match_reason TEXT,
    ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_actual_earnings_qa_source_document
    ON actual_earnings_qa(source_document_id);

CREATE INDEX IF NOT EXISTS idx_actual_earnings_qa_predicted_qa
    ON actual_earnings_qa(predicted_qa_id);
