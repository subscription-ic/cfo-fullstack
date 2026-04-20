-- Attribute each predicted question to the reporting period it was generated for.
ALTER TABLE predicted_qa
    ADD COLUMN IF NOT EXISTS fiscal_year INTEGER,
    ADD COLUMN IF NOT EXISTS quarter TEXT;

CREATE INDEX IF NOT EXISTS idx_predicted_qa_company_period
    ON predicted_qa(company, fiscal_year, quarter);
