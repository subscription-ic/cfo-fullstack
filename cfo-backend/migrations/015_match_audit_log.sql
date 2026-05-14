-- 015_match_audit_log.sql
-- Persistent trace of every prediction↔actual match attempt. Lets us replay
-- any quarter and answer "why didn't these two link?" without re-running the
-- LLM judge.

CREATE TABLE IF NOT EXISTS match_audit_log (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id                      UUID NOT NULL,
    run_kind                    TEXT NOT NULL DEFAULT 'extract',  -- 'extract' | 'relink'
    company                     TEXT NOT NULL,
    fiscal_year                 INTEGER NOT NULL,
    quarter                     TEXT NOT NULL,

    actual_qa_id                UUID,
    actual_question             TEXT,
    actual_category_l1          TEXT,
    actual_category_l2          TEXT,

    predicted_qa_id_candidate   UUID,
    predicted_question          TEXT,
    predicted_category_l1       TEXT,
    predicted_category_l2       TEXT,

    l1_match                    BOOLEAN,
    l2_match                    BOOLEAN,

    similarity                  DOUBLE PRECISION,
    threshold_similarity        DOUBLE PRECISION,
    threshold_strong            DOUBLE PRECISION,

    linked                      BOOLEAN NOT NULL DEFAULT FALSE,
    link_reason                 TEXT,

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_audit_log_company_period
    ON match_audit_log (company, fiscal_year, quarter, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_match_audit_log_run
    ON match_audit_log (run_id);

CREATE INDEX IF NOT EXISTS idx_match_audit_log_actual
    ON match_audit_log (actual_qa_id);

COMMENT ON TABLE match_audit_log IS
    'One row per link attempt during transcript extraction or relink. Replay any quarter by selecting on (company, fiscal_year, quarter).';
