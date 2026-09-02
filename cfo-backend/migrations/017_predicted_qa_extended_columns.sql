-- 017_predicted_qa_extended_columns.sql
-- The question-generation persist path writes likelihood / catalyst_type /
-- reasoning / source_refs (app/modules/question_generation/service.py), but no
-- migration ever created them. Without this the insert falls back to the
-- legacy column set and those fields are silently dropped.

ALTER TABLE predicted_qa
    ADD COLUMN IF NOT EXISTS likelihood    TEXT,
    ADD COLUMN IF NOT EXISTS catalyst_type TEXT,
    ADD COLUMN IF NOT EXISTS reasoning     TEXT,
    ADD COLUMN IF NOT EXISTS source_refs   TEXT[] DEFAULT '{}';

COMMENT ON COLUMN predicted_qa.source_refs
    IS 'RAG / historical / analysis blocks the LLM cited when generating this question.';
