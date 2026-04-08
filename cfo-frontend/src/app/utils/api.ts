/**
 * API service for CFO Earnings Intelligence backend (FastAPI @ port 8000).
 */

const BASE_URL = "http://localhost:8000";

export interface PredictedQA {
  id: string;
  company: string;
  predicted_question: string;
  suggested_answer: string;
  category: string;
  risk: string;           // 'low' | 'medium' | 'high'
  created_at: string;
}

export interface PredictedQAResponse {
  data: PredictedQA[];
  count: number;
}

/**
 * Fetch all predicted Q&A rows, optionally filtered by company name.
 */
export async function fetchPredictedQuestions(
  company?: string
): Promise<PredictedQA[]> {
  const url = new URL(`${BASE_URL}/api/predicted-questions`);
  if (company) url.searchParams.set("company", company);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  const json: PredictedQAResponse = await res.json();
  return json.data;
}

/**
 * Fetch distinct company names available in the database.
 */
export async function fetchCompanies(): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/api/companies`);
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  const json: { companies: string[] } = await res.json();
  return json.companies;
}
