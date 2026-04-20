-- Optional sample data so predicted Q&A and Actual Earnings Q&A are not empty.
-- Run in Supabase SQL Editor after 001_initial.sql. Safe to run once; duplicates possible if re-run — delete rows first if needed.

INSERT INTO predicted_qa (company, predicted_question, suggested_answer, category, risk) VALUES
(
  'HDFC',
  'What drove loan growth this quarter and how sustainable is it?',
  'Growth was led by retail and SME; we expect a normalized pace next quarter while keeping asset quality stable.',
  'Revenue',
  'medium'
),
(
  'HDFC',
  'How are you managing funding costs and NIM pressure?',
  'We are optimizing the deposit mix and repricing where appropriate; NIM guidance remains unchanged.',
  'Margins',
  'high'
),
(
  'HDFC',
  'What is the outlook on asset quality and provisioning?',
  'Collections remain healthy; we hold adequate coverage and will update if macro conditions shift.',
  'Asset Quality',
  'medium'
);

INSERT INTO actual_earnings_qa (company, fiscal_year, quarter, period_label, question, answer, answered_by, category) VALUES
(
  'HDFC',
  2025,
  'Q1',
  'Q1 FY25',
  'Walk us through the margin bridge this quarter and sustainability into Q2?',
  'Three main drivers: efficiency improvements from automation, premium mix shift, and pricing actions.',
  'Jane Doe, CFO',
  'Margin / Profitability'
),
(
  'HDFC',
  2025,
  'Q1',
  'Q1 FY25',
  'Your guidance implies deceleration in Q2 - what are the specific headwinds?',
  'Q2 has typical seasonal patterns; we are lapping a very strong Q2 last year.',
  'John Smith, CEO',
  'Guidance'
),
(
  'HDFC',
  2024,
  'Q4',
  'Q4 FY24',
  'How are you thinking about capital allocation for the rest of the year?',
  'Our priority remains organic growth, followed by opportunistic share repurchases.',
  'Jane Doe, CFO',
  'Capital Allocation'
);
