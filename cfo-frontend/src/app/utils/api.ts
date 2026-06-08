/**
 * API service for CFO Earnings Intelligence backend (FastAPI).
 */

const BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.toString().trim() ||
  "http://localhost:8000";

const TOKEN_KEY = "access_token";

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearAccessToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export interface PredictedQA {
  id: string;
  period?: string;
  company: string;
  predicted_question?: string;
  question?: string;
  suggested_answer?: string;
  answer?: string;
  category: string;
  category_l1?: string | null;
  category_l2?: string | null;
  risk: string;
  created_at: string;
  fiscal_year?: number | null;
  quarter?: string | null;
}

export interface PredictedQAResponse {
  data: PredictedQA[];
  count: number;
}

export async function login(username: string, password: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { access_token: string };
  localStorage.setItem(TOKEN_KEY, data.access_token);
}

export interface SimulatorSource {
  chunk_id: string;
  document_id: string | null;
  /** File ref # page, e.g. a1b2c3#4 */
  citation?: string;
  /** Original uploaded file name, e.g. "Q2-FY26 Financial Results.pdf" */
  filename?: string | null;
  excerpt: string;
  metadata: Record<string, unknown>;
  rrf_score: number;
  rerank_position: number;
  /** Signed Supabase URL; PDFs include #page=N */
  pdf_url?: string | null;
  page_number?: number;
}

export interface SimulatorSuggestedAnswerResponse {
  answer: string;
  sources: SimulatorSource[];
  /** Maps citation id (without brackets) to signed PDF URL with #page */
  citation_hrefs: Record<string, string>;
  /** Maps citation id to a human-readable "<filename> (p.N)" label */
  citation_labels: Record<string, string>;
  retrieval_mode: string;
}

/** Hybrid search + rerank over all uploaded document chunks. When
 * fiscal_year + quarter are supplied, the same quarter's earnings transcript
 * is excluded server-side so the simulator never answers a question with the
 * very transcript it came from. */
export async function fetchSimulatorSuggestedAnswer(
  question: string,
  fiscalYear?: number | null,
  quarter?: string | null,
  company?: string | null,
): Promise<SimulatorSuggestedAnswerResponse> {
  const res = await fetch(`${BASE_URL}/api/simulator/suggested-answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      fiscal_year: fiscalYear ?? null,
      quarter: quarter ?? null,
      company: company ?? null,
    }),
  });
  if (!res.ok) {
    throw new Error(`Suggested answer failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as SimulatorSuggestedAnswerResponse;
  return {
    ...json,
    citation_hrefs: json.citation_hrefs ?? {},
    citation_labels: json.citation_labels ?? {},
  };
}

export async function fetchPredictedQuestions(
  company?: string,
  fiscalYear?: number | null,
  quarter?: string | null,
): Promise<PredictedQA[]> {
  const url = new URL(`${BASE_URL}/api/predicted-questions`);
  if (company) url.searchParams.set("company", company);
  if (fiscalYear != null) url.searchParams.set("fiscal_year", String(fiscalYear));
  if (quarter) url.searchParams.set("quarter", quarter);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  const json: PredictedQAResponse = await res.json();
  return json.data;
}

export async function fetchCompanies(): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/api/companies`);
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  const json: { companies: string[] } = await res.json();
  return json.companies;
}

export interface UploadFileMeta {
  company: string;
  fiscal_year: number;
  quarter: string;
  document_type: string;
  source_category: string;
}

export interface FileUploadResult {
  filename: string;
  ok: boolean;
  document_id?: string | null;
  chunks_created: number;
  detected_document_type?: string | null;
  sections_detected?: string[];
  financial_metrics_count?: number;
  chunking_strategy?: string | null;
  error?: string | null;
}

export interface UploadResponse {
  results: FileUploadResult[];
}

export interface DocumentCatalogRow {
  id: string;
  company: string;
  document_type: string;
  quarter: string;
  fiscal_year: number;
  original_filename?: string | null;
  created_at: string;
  updated_at: string;
}

/** Ingested documents (admin); requires Bearer token. */
export async function fetchDocumentCatalog(
  token: string
): Promise<DocumentCatalogRow[]> {
  const res = await fetch(`${BASE_URL}/documents`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Documents list failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<DocumentCatalogRow[]>;
}

/** Permanently delete an uploaded document and every trace of it
 *  (storage object, vector chunks, analyses, extracted Q&A). */
export async function deleteDocument(
  documentId: string,
  token: string,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/documents/${documentId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Delete failed (${res.status}): ${await res.text()}`);
  }
}

/** Permanently delete all data for one (company, fiscal_year, quarter):
 *  every document and its cascade, plus the period's actual and predicted Q&A. */
export async function deleteQuarter(
  company: string,
  fiscalYear: number,
  quarter: string,
  token: string,
): Promise<{ documents_deleted: number }> {
  const url = new URL(`${BASE_URL}/api/historical/quarter`);
  url.searchParams.set("company", company);
  url.searchParams.set("fiscal_year", String(fiscalYear));
  url.searchParams.set("quarter", quarter);
  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Delete quarter failed (${res.status}): ${await res.text()}`);
  }
  return res.json().catch(() => ({ documents_deleted: 0 }));
}

export async function uploadDocuments(
  files: File[],
  metadata: UploadFileMeta[],
  token: string
): Promise<UploadResponse> {
  const form = new FormData();
  for (const f of files) {
    form.append("files", f);
  }
  form.append("metadata", JSON.stringify(metadata));

  const res = await fetch(`${BASE_URL}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Upload failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<UploadResponse>;
}

export interface QuestionGenerationBody {
  company: string;
  fiscal_year?: number;
  quarter?: string;
  last_n_quarters?: number;
  year_from?: number;
  year_to?: number;
  document_type_filter?: string;
  source_category_filter?: string;
  persist?: boolean;
  num_questions?: number;
  analysis_id?: string;
}

export interface GeneratedQuestionItem {
  id?: string | null;
  predicted_question: string;
  suggested_answer: string;
  category: string;
  risk: string;
}

export interface QuestionGenerationResponse {
  questions: GeneratedQuestionItem[];
  context_summary: string;
}

export async function runQuestionGeneration(
  body: QuestionGenerationBody,
  token: string
): Promise<QuestionGenerationResponse> {
  const res = await fetch(`${BASE_URL}/question-generation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Question generation failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<QuestionGenerationResponse>;
}

/** Actual earnings call Q&A (Supabase `actual_earnings_qa`) */
export interface ActualEarningsQARow {
  id: string;
  company: string;
  fiscal_year: number | null;
  quarter: string | null;
  period_label: string | null;
  question: string;
  answer: string | null;
  answered_by: string | null;
  category: string | null;
  category_l1?: string | null;
  category_l2?: string | null;
  created_at?: string;
  predicted_qa_id?: string | null;
  similarity_score?: number | null;
  match_reason?: string | null;
  source_document_id?: string | null;
}

export async function fetchActualEarningsQA(
  company?: string
): Promise<ActualEarningsQARow[]> {
  const url = new URL(`${BASE_URL}/api/actual-earnings-qa`);
  if (company) url.searchParams.set("company", company);
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { data: ActualEarningsQARow[] };
  return json.data ?? [];
}

export async function createActualEarningsQA(
  body: {
    company: string;
    question: string;
    answer?: string;
    answered_by?: string;
    category?: string;
    fiscal_year?: number;
    quarter?: string;
    period_label?: string;
  },
  token: string
): Promise<ActualEarningsQARow> {
  const res = await fetch(`${BASE_URL}/api/actual-earnings-qa`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Create failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<ActualEarningsQARow>;
}

export async function updateActualEarningsQA(
  id: string,
  body: Partial<{
    company: string;
    question: string;
    answer: string | null;
    answered_by: string | null;
    category: string | null;
    fiscal_year: number | null;
    quarter: string | null;
    period_label: string | null;
  }>,
  token: string
): Promise<ActualEarningsQARow> {
  const res = await fetch(`${BASE_URL}/api/actual-earnings-qa/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Update failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<ActualEarningsQARow>;
}

export async function deleteActualEarningsQA(id: string, token: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/actual-earnings-qa/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Delete failed (${res.status}): ${await res.text()}`);
  }
}

// ---------------------------------------------------------------------------
// Document Analysis Pipeline
// ---------------------------------------------------------------------------

export interface ThemeItem {
  name: string;
  description: string;
  evidence: string[];
  importance: string;
}

export interface DeltaItem {
  theme: string;
  direction: string;
  current_summary: string;
  previous_summary: string;
  magnitude: string;
}

export interface SignalItem {
  type: string;
  description: string;
  severity: string;
  evidence: string;
}

export interface QuestionPatternItem {
  theme: string;
  pattern_description: string;
  example_questions: string[];
  frequency: string;
}

export interface AnalysisResult {
  id: string | null;
  document_id: string;
  company: string;
  fiscal_year: number;
  quarter: string;
  detected_company: string | null;
  detected_period: string | null;
  themes: ThemeItem[];
  deltas: DeltaItem[];
  signals: SignalItem[];
  question_patterns: QuestionPatternItem[];
  status: string;
  error_message: string | null;
  created_at: string | null;
}

export interface RunAnalysisResponse {
  analysis: AnalysisResult;
  context_summary: string;
}

export async function runAnalysis(
  documentId: string,
  force: boolean,
  token: string,
): Promise<RunAnalysisResponse> {
  const res = await fetch(`${BASE_URL}/api/analysis/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ document_id: documentId, force }),
  });
  if (!res.ok) {
    throw new Error(`Analysis failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<RunAnalysisResponse>;
}

export async function fetchAnalysis(
  documentId: string,
  token: string,
): Promise<AnalysisResult | null> {
  const res = await fetch(
    `${BASE_URL}/api/analysis/${encodeURIComponent(documentId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Fetch analysis failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<AnalysisResult>;
}

export async function fetchCompanyAnalyses(
  company: string,
  token: string,
): Promise<AnalysisResult[]> {
  const res = await fetch(
    `${BASE_URL}/api/analysis/company/${encodeURIComponent(company)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(`Company analyses failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<AnalysisResult[]>;
}

// ---------------------------------------------------------------------------
// Historical Intelligence Hub
// ---------------------------------------------------------------------------

export interface TopicWeight {
  text: string;
  weight: number;
}

export interface KeyTopicsResponse {
  topics: TopicWeight[];
  quarters_used: number;
  company: string;
}

export interface QuarterSummaryInfo {
  fiscal_year: number;
  quarter: string;
  document_count: number;
  actual_qa_count: number;
  has_analysis: boolean;
}

export interface QuartersListResponse {
  quarters: QuarterSummaryInfo[];
  company: string;
}

export interface QuarterQuestion {
  id: string;
  question: string;
  answer: string | null;
  answered_by: string | null;
  category: string | null;
}

export interface ThemeBadge {
  name: string;
  importance: string;
}

export interface SentimentDetail {
  overall: string;
  positive_points: string[];
  negative_points: string[];
}

export interface CallAttendee {
  name: string;
  role: string; // "management" | "analyst"
}

export interface QuarterDetailResponse {
  company: string;
  fiscal_year: number;
  quarter: string;
  themes: ThemeBadge[];
  questions: QuarterQuestion[];
  sentiment: SentimentDetail;
  ai_summary: string;
  signals: Array<{ type: string; description: string; severity: string; evidence: string }>;
  attendees: CallAttendee[];
}

export interface ChatResponseData {
  reply: string;
  sources: Array<{ chunk_id: string; quarter: string; fiscal_year: string; excerpt: string }>;
}

export async function fetchKeyTopics(
  company: string,
  numQuarters?: number,
): Promise<KeyTopicsResponse> {
  const url = new URL(`${BASE_URL}/api/historical/topics`);
  url.searchParams.set("company", company);
  if (numQuarters) url.searchParams.set("num_quarters", String(numQuarters));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Topics failed (${res.status}): ${await res.text()}`);
  return res.json() as Promise<KeyTopicsResponse>;
}

export async function fetchAvailableQuarters(
  company: string,
): Promise<QuartersListResponse> {
  const url = new URL(`${BASE_URL}/api/historical/quarters`);
  url.searchParams.set("company", company);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Quarters failed (${res.status}): ${await res.text()}`);
  return res.json() as Promise<QuartersListResponse>;
}

export async function fetchQuarterDetail(
  company: string,
  fiscalYear: number,
  quarter: string,
): Promise<QuarterDetailResponse> {
  const url = new URL(`${BASE_URL}/api/historical/quarter-detail`);
  url.searchParams.set("company", company);
  url.searchParams.set("fiscal_year", String(fiscalYear));
  url.searchParams.set("quarter", quarter);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Quarter detail failed (${res.status}): ${await res.text()}`);
  return res.json() as Promise<QuarterDetailResponse>;
}

export interface StockQuarterPriceRow {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export interface StockQuarterPricesResponse {
  company: string;
  ticker: string | null;
  currency: string | null;
  range: { start: string; end: string } | null;
  prices: StockQuarterPriceRow[];
  return_pct: number | null;
  earnings_call_dates: string[];
  error: string | null;
}

export async function fetchStockQuarterPrices(
  company: string,
  fiscalYear: number,
  quarter: string,
): Promise<StockQuarterPricesResponse> {
  const url = new URL(`${BASE_URL}/api/stock/quarter-prices`);
  url.searchParams.set("company", company);
  url.searchParams.set("fiscal_year", String(fiscalYear));
  url.searchParams.set("quarter", quarter);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Stock prices failed (${res.status}): ${await res.text()}`);
  return res.json() as Promise<StockQuarterPricesResponse>;
}

export interface ResearchReportRow {
  firm: string;
  rating: string | null;
  rating_tone: "positive" | "neutral" | "negative";
  target_price: number | null;
  target_price_display: string | null;
  summary: string | null;
}

export interface ResearchReportsResponse {
  company: string;
  fiscal_year: number;
  quarter: string;
  reports: ResearchReportRow[];
}

/** Analyst research reports (firm, rating, target price, summary) for the
 * selected company + quarter, extracted from uploaded RR documents. */
export async function fetchResearchReports(
  company: string,
  fiscalYear: number,
  quarter: string,
): Promise<ResearchReportRow[]> {
  const url = new URL(`${BASE_URL}/api/research-reports`);
  url.searchParams.set("company", company);
  url.searchParams.set("fiscal_year", String(fiscalYear));
  url.searchParams.set("quarter", quarter);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Research reports failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as ResearchReportsResponse;
  return json.reports ?? [];
}

export interface NewsSentimentRow {
  date: string;
  publisher: string;
  url: string;
  title: string;
  summary: string;
  theme: string;
  sentiment: "Positive" | "Neutral" | "Negative";
  score: number;
}

export interface NewsSentimentResponse {
  company: string;
  ticker: string | null;
  range: { start: string; end: string } | null;
  rows: NewsSentimentRow[];
  error: string | null;
}

export async function fetchQuarterNewsSentiment(
  company: string,
  fiscalYear: number,
  quarter: string,
): Promise<NewsSentimentResponse> {
  const url = new URL(`${BASE_URL}/api/stock/quarter-news-sentiment`);
  url.searchParams.set("company", company);
  url.searchParams.set("fiscal_year", String(fiscalYear));
  url.searchParams.set("quarter", quarter);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`News sentiment failed (${res.status}): ${await res.text()}`);
  return res.json() as Promise<NewsSentimentResponse>;
}

export async function generateQuarterSummary(
  company: string,
  fiscalYear: number,
  quarter: string,
): Promise<{ summary: string }> {
  const res = await fetch(`${BASE_URL}/api/historical/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company, fiscal_year: fiscalYear, quarter }),
  });
  if (!res.ok) throw new Error(`Summary failed (${res.status}): ${await res.text()}`);
  return res.json() as Promise<{ summary: string }>;
}

export async function sendHistoricalChat(
  message: string,
  company: string,
  quarter?: string,
  fiscalYear?: number,
  history?: Array<{ role: string; content: string }>,
): Promise<ChatResponseData> {
  const res = await fetch(`${BASE_URL}/api/historical/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      company,
      quarter: quarter || null,
      fiscal_year: fiscalYear || null,
      history: history || [],
    }),
  });
  if (!res.ok) throw new Error(`Chat failed (${res.status}): ${await res.text()}`);
  return res.json() as Promise<ChatResponseData>;
}
