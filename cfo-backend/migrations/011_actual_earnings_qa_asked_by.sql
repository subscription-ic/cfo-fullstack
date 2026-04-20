-- Analyst / asker name + firm captured from the transcript extraction prompt.
ALTER TABLE actual_earnings_qa
    ADD COLUMN IF NOT EXISTS asked_by TEXT;
