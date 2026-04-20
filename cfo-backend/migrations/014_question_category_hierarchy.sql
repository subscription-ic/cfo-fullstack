-- Two-level question taxonomy. L1 is the broad bucket (e.g. "Margins"),
-- L2 is the specific angle (e.g. "Gross Margin Pressure").
ALTER TABLE predicted_qa
    ADD COLUMN IF NOT EXISTS category_l1 TEXT,
    ADD COLUMN IF NOT EXISTS category_l2 TEXT;

ALTER TABLE actual_earnings_qa
    ADD COLUMN IF NOT EXISTS category_l1 TEXT,
    ADD COLUMN IF NOT EXISTS category_l2 TEXT;

CREATE INDEX IF NOT EXISTS idx_predicted_qa_category_l1 ON predicted_qa(category_l1);
CREATE INDEX IF NOT EXISTS idx_actual_earnings_qa_category_l1 ON actual_earnings_qa(category_l1);
