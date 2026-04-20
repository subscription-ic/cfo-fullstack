import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../../components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "../../components/ui/dialog";
import { Textarea } from "../../components/ui/textarea";
import {
  Upload,
  X,
  Save,
  FileText,
  FileSpreadsheet,
  Edit,
  Trash2,
  Plus,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Tag,
  Loader2,
  Sparkles,
  RefreshCw,
  // Brain,
} from "lucide-react";
import { Progress } from "../../components/ui/progress";
import { toast } from "sonner";
import {
  getAccessToken,
  uploadDocuments,
  deleteDocument,
  fetchDocumentCatalog,
  runQuestionGeneration,
  fetchCompanies,
  fetchActualEarningsQA,
  fetchPredictedQuestions,
  createActualEarningsQA,
  updateActualEarningsQA,
  deleteActualEarningsQA,
  type UploadFileMeta,
  type FileUploadResult as ApiUploadFileResult,
  type DocumentCatalogRow,
  type ActualEarningsQARow,
  type PredictedQA,
} from "../../utils/api";
// import AnalysisPanel from "./AnalysisPanel";

interface UploadedFile {
  id: string;
  file: File;
  year: string;
  quarter: string;
  documentType: string;
  sourceCategory: string;
}

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => (currentYear - i).toString());
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const DOC_TYPES = [
  "FIN",
  "PR",
  "TR",
  "PPT",
  "AR",
  "GUIDE",
  "SUPP",
] as const;

const CUSTOM_COMPANIES_STORAGE_KEY = "cfo_admin_custom_companies";
const COMPANY_SELECT_NONE = "__none__";

function readStoredCustomCompanies(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_COMPANIES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  } catch {
    return [];
  }
}

function sourceCategoryForDocType(documentType: string): string {
  if (
    documentType === "TR" ||
    documentType === "historical_ec" ||
    documentType === "current_ec"
  ) {
    return "earnings_transcript";
  }
  if (
    documentType === "SUPP" ||
    documentType === "financial_stats"
  ) {
    return "supplementary";
  }
  return "reporting_materials";
}

/** Map DB row → Admin table row */
function mapActualFromApi(r: ActualEarningsQARow) {
  const period =
    r.period_label?.trim() ||
    (r.quarter && r.fiscal_year
      ? `${r.quarter} FY${String(r.fiscal_year).slice(-2)}`
      : "—");
  return {
    id: r.id,
    period,
    question: r.question,
    answer: r.answer ?? "",
    answeredBy: r.answered_by ?? "",
    category: r.category ?? "",
    predictedQaId: r.predicted_qa_id ?? null,
    similarityScore:
      typeof r.similarity_score === "number"
        ? r.similarity_score
        : r.similarity_score != null
        ? Number(r.similarity_score)
        : null,
    matchReason: r.match_reason ?? null,
  };
}

function parsePeriodLabel(period: string): {
  fiscal_year?: number;
  quarter?: string;
  period_label: string;
} {
  const m = period.trim().match(/^(Q[1-4])\s+FY(\d{2})$/i);
  if (!m) return { period_label: period.trim() };
  const quarter = m[1].toUpperCase();
  const fy2 = parseInt(m[2], 10);
  const fiscal_year = fy2 >= 70 ? 1900 + fy2 : 2000 + fy2;
  return { fiscal_year, quarter, period_label: period.trim() };
}

function periodSortKey(period: string): number {
  const m = period.trim().match(/^(Q[1-4])\s+FY(\d{2})$/i);
  if (!m) return -1;
  const q = parseInt(m[1].replace(/Q/i, ""), 10);
  const fy2 = parseInt(m[2], 10);
  const year = fy2 >= 70 ? 1900 + fy2 : 2000 + fy2;
  return year * 10 + q;
}

function uniqueReviewPeriods(
  rows: { period: string }[],
): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.period && r.period !== "—") set.add(r.period);
  }
  return Array.from(set).sort((a, b) => periodSortKey(b) - periodSortKey(a));
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  FIN: "Financial Results",
  PR: "Press Release",
  TR: "Earnings Call Transcript",
  PPT: "Investor Presentation",
  AR: "Annual Report",
  GUIDE: "Guidance / Outlook Document",
  SUPP: "Supplementary Data / Supporting Documents",
  historical_ec: "Historical earnings call",
  current_ec: "Current earnings call",
  financial_stats: "Financial statements",
  current_quarter_financial: "Current quarter financial",
};

function formatDocumentTypeLabel(code: string): string {
  return DOCUMENT_TYPE_LABELS[code] ?? code.replace(/_/g, " ");
}

function formatQuarterPeriod(quarter: string, fiscalYear: number): string {
  const fy = String(fiscalYear).length <= 2 ? fiscalYear : String(fiscalYear).slice(-2);
  return `${quarter} FY${fy}`;
}

function formatCatalogDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatPredictedRisk(risk: string | null | undefined): string {
  const t = (risk ?? "").trim();
  if (!t) return "—";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/** Word-level Jaccard on meaningful tokens (length > 2) → 0–100 */
function jaccardSimilarity(a: string, b: string): number {
  const words = (s: string) => {
    const t = s
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);
    return new Set(t);
  };
  const A = words(a);
  const B = words(b);
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : Math.round((inter / union) * 100);
}

const COMPARISON_MATCH_THRESHOLD = 26;

interface ComparisonData {
  id: string;
  predictedQuestion: string;
  wasAsked: boolean;
  actualPhrasing: string;
  similarity: number;
  recommendedAnswer: string;
  actualAnswer: string;
  category: string;
  feedback: "good-prediction" | "false-positive" | "missed-question";
}

function buildComparisonRows(
  predicted: PredictedQA[],
  actuals: {
    id: string;
    question: string;
    answer: string;
    category: string;
    predictedQaId?: string | null;
    similarityScore?: number | null;
  }[],
): ComparisonData[] {
  const rows: ComparisonData[] = [];
  const usedActual = new Set<string>();
  const usedPred = new Set<string>();

  // First pass: honor server-side LLM-judge matches (predicted_qa_id + similarity_score).
  for (const a of actuals) {
    if (!a.predictedQaId) continue;
    const p = predicted.find((x) => x.id === a.predictedQaId);
    if (!p || usedPred.has(p.id)) continue;
    const sim =
      typeof a.similarityScore === "number" && !Number.isNaN(a.similarityScore)
        ? Math.round(a.similarityScore)
        : jaccardSimilarity(p.predicted_question, a.question);
    usedPred.add(p.id);
    usedActual.add(a.id);
    rows.push({
      id: `m-${p.id}-${a.id}`,
      predictedQuestion: p.predicted_question,
      wasAsked: true,
      actualPhrasing: a.question,
      similarity: sim,
      recommendedAnswer: p.suggested_answer ?? "",
      actualAnswer: a.answer ?? "",
      category: p.category || a.category || "",
      feedback: "good-prediction",
    });
  }

  type Pair = { pi: number; aj: number; sim: number };
  const pairs: Pair[] = [];
  predicted.forEach((p, pi) => {
    if (usedPred.has(p.id)) return;
    actuals.forEach((a, aj) => {
      if (usedActual.has(a.id)) return;
      pairs.push({
        pi,
        aj,
        sim: jaccardSimilarity(p.predicted_question, a.question),
      });
    });
  });
  pairs.sort((a, b) => b.sim - a.sim);

  for (const { pi, aj, sim } of pairs) {
    const p = predicted[pi];
    const a = actuals[aj];
    if (!p || !a || usedPred.has(p.id) || usedActual.has(a.id)) continue;
    if (sim < COMPARISON_MATCH_THRESHOLD) continue;
    usedPred.add(p.id);
    usedActual.add(a.id);
    rows.push({
      id: `m-${p.id}-${a.id}`,
      predictedQuestion: p.predicted_question,
      wasAsked: true,
      actualPhrasing: a.question,
      similarity: sim,
      recommendedAnswer: p.suggested_answer ?? "",
      actualAnswer: a.answer ?? "",
      category: p.category || a.category || "",
      feedback: "good-prediction",
    });
  }

  for (const p of predicted) {
    if (usedPred.has(p.id)) continue;
    rows.push({
      id: `fp-${p.id}`,
      predictedQuestion: p.predicted_question,
      wasAsked: false,
      actualPhrasing: "",
      similarity: 0,
      recommendedAnswer: p.suggested_answer ?? "",
      actualAnswer: "",
      category: p.category ?? "",
      feedback: "false-positive",
    });
  }

  for (const a of actuals) {
    if (usedActual.has(a.id)) continue;
    rows.push({
      id: `miss-${a.id}`,
      predictedQuestion: "",
      wasAsked: true,
      actualPhrasing: a.question,
      similarity: 0,
      recommendedAnswer: "",
      actualAnswer: a.answer ?? "",
      category: a.category ?? "",
      feedback: "missed-question",
    });
  }

  return rows;
}

function collectUploadPayload(
  company: string,
  list: UploadedFile[],
  filesOut: File[],
  metaOut: UploadFileMeta[],
) {
  const c = company.trim();
  for (const item of list) {
    filesOut.push(item.file);
    metaOut.push({
      company: c,
      fiscal_year: parseInt(item.year, 10),
      quarter: item.quarter,
      document_type: item.documentType,
      source_category: item.sourceCategory,
    });
  }
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [uploadSubmitting, setUploadSubmitting] = useState(false);
  const [qgenSubmitting, setQgenSubmitting] = useState(false);

  const [adminMainTab, setAdminMainTab] = useState<"generate">("generate");
  const [reviewCompany, setReviewCompany] = useState("HDFC");
  const [companyPicker, setCompanyPicker] = useState<string[]>(["HDFC"]);
  const [actualLoading, setActualLoading] = useState(false);
  const [predictedLoading, setPredictedLoading] = useState(false);

  const [actualQuestions, setActualQuestions] = useState<
    {
      id: string;
      period: string;
      question: string;
      answer: string;
      answeredBy: string;
      category: string;
      predictedQaId?: string | null;
      similarityScore?: number | null;
      matchReason?: string | null;
    }[]
  >([]);
  const [editingQuestion, setEditingQuestion] = useState<any>(null);
  const [isAddMode, setIsAddMode] = useState<boolean>(false);
  const [activeReviewQuarter, setActiveReviewQuarter] = useState<string>("");

  const [predictedRows, setPredictedRows] = useState<PredictedQA[]>([]);
  const [predictedQuarterFilter, setPredictedQuarterFilter] = useState<string>("all");

  const [comparisonTab, setComparisonTab] = useState<
    "all" | "correct" | "missed" | "false"
  >("all");

  const [companyName, setCompanyName] = useState("");
  const [newCompanyInput, setNewCompanyInput] = useState("");
  const [customCompanies, setCustomCompanies] = useState<string[]>(() =>
    readStoredCustomCompanies(),
  );
  const [uploadDocTab, setUploadDocTab] = useState<"historical" | "current">("current");

  const [currentQuarterEc, setCurrentQuarterEc] = useState<UploadedFile[]>([]);
  const [lastUploadResults, setLastUploadResults] = useState<ApiUploadFileResult[]>([]);
  const [documentsCatalog, setDocumentsCatalog] = useState<DocumentCatalogRow[]>([]);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [documentsLoading, setDocumentsLoading] = useState(false);

  const loadActualQuestions = useCallback(async () => {
    setActualLoading(true);
    try {
      const rows = await fetchActualEarningsQA(reviewCompany);
      setActualQuestions(rows.map(mapActualFromApi));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Could not load actual Q&A", { description: msg });
      setActualQuestions([]);
    } finally {
      setActualLoading(false);
    }
  }, [reviewCompany]);

  const loadPredictedQuestions = useCallback(async (company: string) => {
    setPredictedLoading(true);
    try {
      const list = await fetchPredictedQuestions(company.trim() || undefined);
      setPredictedRows(list);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Could not load predicted Q&A", { description: msg });
      setPredictedRows([]);
    } finally {
      setPredictedLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies()
      .then((list) => {
        const merged = list.length > 0 ? list : ["HDFC"];
        setCompanyPicker(merged);
        setReviewCompany((prev) => (merged.includes(prev) ? prev : merged[0]));
      })
      .catch(() => {
        setCompanyPicker(["HDFC"]);
      });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        CUSTOM_COMPANIES_STORAGE_KEY,
        JSON.stringify(customCompanies),
      );
    } catch {
      /* ignore quota */
    }
  }, [customCompanies]);

  const companyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of companyPicker) {
      const t = c?.trim();
      if (t) set.add(t);
    }
    for (const c of customCompanies) {
      const t = c?.trim();
      if (t) set.add(t);
    }
    for (const d of documentsCatalog) {
      const t = d.company?.trim();
      if (t) set.add(t);
    }
    const selected = companyName.trim();
    if (selected) set.add(selected);
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [companyPicker, customCompanies, documentsCatalog, companyName]);

  const filteredDocumentsCatalog = useMemo(() => {
    const key = companyName.trim();
    if (!key) return [];
    return documentsCatalog.filter(
      (d) => d.company.trim().toLowerCase() === key.toLowerCase(),
    );
  }, [documentsCatalog, companyName]);

  const addCompanyToList = useCallback(
    (raw: string) => {
      const name = raw.trim();
      if (!name) {
        toast.error("Enter a company name");
        return;
      }
      const norm = name.toLowerCase();
      const inApi = companyPicker.some((c) => c.trim().toLowerCase() === norm);
      const inCustom = customCompanies.some((c) => c.trim().toLowerCase() === norm);
      const inDocs = documentsCatalog.some(
        (d) => d.company.trim().toLowerCase() === norm,
      );
      if (!inApi && !inCustom && !inDocs) {
        setCustomCompanies((prev) =>
          [...prev, name].sort((a, b) =>
            a.localeCompare(b, undefined, { sensitivity: "base" }),
          ),
        );
        toast.success("Company added to list", {
          description: `${name} is selected for uploads and the Historical view.`,
        });
      } else {
        toast.info("Company selected", {
          description: `${name} was already in the list.`,
        });
      }
      setCompanyName(name);
    },
    [companyPicker, customCompanies, documentsCatalog],
  );

  useEffect(() => {
    if (adminMainTab !== "review") return;
    void loadActualQuestions();
    void loadPredictedQuestions(reviewCompany);
  }, [adminMainTab, loadActualQuestions, loadPredictedQuestions, reviewCompany]);

  const loadDocumentCatalog = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setDocumentsCatalog([]);
      return;
    }
    setDocumentsLoading(true);
    try {
      const rows = await fetchDocumentCatalog(token);
      setDocumentsCatalog(rows);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Could not load document catalog", { description: msg });
      setDocumentsCatalog([]);
    } finally {
      setDocumentsLoading(false);
    }
  }, []);

  const handleDeleteHistoricalDocument = useCallback(
    async (docId: string, label: string) => {
      const confirmed = window.confirm(
        `Permanently delete "${label}"?\n\n` +
          "This removes the file from storage, all vector chunks, any extracted " +
          "analyst Q&A, and the document row itself. This cannot be undone.",
      );
      if (!confirmed) return;
      const token = getAccessToken();
      if (!token) {
        toast.error("You must be signed in to delete documents.");
        return;
      }
      setDeletingDocId(docId);
      try {
        await deleteDocument(docId, token);
        setDocumentsCatalog((prev) => prev.filter((d) => d.id !== docId));
        toast.success(`Deleted "${label}"`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error("Delete failed", { description: msg });
      } finally {
        setDeletingDocId(null);
      }
    },
    [],
  );

  useEffect(() => {
    if (adminMainTab === "generate" && uploadDocTab === "historical") {
      void loadDocumentCatalog();
    }
  }, [adminMainTab, uploadDocTab, loadDocumentCatalog]);

  const reviewPeriods = useMemo(
    () => uniqueReviewPeriods(actualQuestions),
    [actualQuestions],
  );

  const resolvedReviewQuarter = useMemo(() => {
    if (reviewPeriods.length === 0) return "";
    if (activeReviewQuarter && reviewPeriods.includes(activeReviewQuarter))
      return activeReviewQuarter;
    return reviewPeriods[0];
  }, [reviewPeriods, activeReviewQuarter]);

  const predictedQuarters = useMemo(() => {
    const set = new Set<string>();
    for (const p of predictedRows) {
      if (p.quarter && p.fiscal_year) {
        set.add(`${p.quarter} FY${String(p.fiscal_year).slice(-2)}`);
      }
    }
    return Array.from(set).sort((a, b) => periodSortKey(b) - periodSortKey(a));
  }, [predictedRows]);

  const filteredPredictedRows = useMemo(() => {
    if (predictedQuarterFilter === "all") return predictedRows;
    return predictedRows.filter((p) => {
      if (!p.quarter || !p.fiscal_year) return false;
      return (
        `${p.quarter} FY${String(p.fiscal_year).slice(-2)}` ===
        predictedQuarterFilter
      );
    });
  }, [predictedRows, predictedQuarterFilter]);

  const filteredActualQuestions = useMemo(() => {
    if (predictedQuarterFilter === "all") return actualQuestions;
    return actualQuestions.filter((a) => a.period === predictedQuarterFilter);
  }, [actualQuestions, predictedQuarterFilter]);

  const comparisonRows = useMemo(() => {
    // Always compare predicted vs actual WITHIN THE SAME (fiscal_year, quarter).
    // In "All quarters" mode we still group per-quarter so a Q1 prediction never
    // matches a Q2 actual.
    const quartersInScope = new Set<string>();
    for (const p of filteredPredictedRows) {
      if (p.quarter && p.fiscal_year) {
        quartersInScope.add(`${p.quarter} FY${String(p.fiscal_year).slice(-2)}`);
      }
    }
    for (const a of filteredActualQuestions) {
      if (a.period && a.period !== "—") quartersInScope.add(a.period);
    }
    const rows: ComparisonData[] = [];
    for (const period of quartersInScope) {
      const preds = filteredPredictedRows.filter(
        (p) =>
          p.quarter &&
          p.fiscal_year &&
          `${p.quarter} FY${String(p.fiscal_year).slice(-2)}` === period,
      );
      const acts = filteredActualQuestions.filter((a) => a.period === period);
      rows.push(...buildComparisonRows(preds, acts));
    }
    return rows;
  }, [filteredPredictedRows, filteredActualQuestions]);

  const comparisonDisplayed = useMemo(() => {
    if (comparisonTab === "all") return comparisonRows;
    if (comparisonTab === "correct")
      return comparisonRows.filter((d) => d.feedback === "good-prediction");
    if (comparisonTab === "missed")
      return comparisonRows.filter((d) => d.feedback === "missed-question");
    return comparisonRows.filter((d) => d.feedback === "false-positive");
  }, [comparisonRows, comparisonTab]);

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<UploadedFile[]>>,
    currentFiles: UploadedFile[],
    defaultDocumentType: string,
  ) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map((file) => ({
        id: Math.random().toString(36).substring(7),
        file,
        year: currentYear.toString(),
        quarter: QUARTERS[0],
        documentType: defaultDocumentType,
        sourceCategory: sourceCategoryForDocType(defaultDocumentType),
      }));
      setter([...currentFiles, ...newFiles]);
    }
    // reset input
    e.target.value = "";
  };

  const removeFile = (
    id: string,
    setter: React.Dispatch<React.SetStateAction<UploadedFile[]>>,
    currentFiles: UploadedFile[],
  ) => {
    setter(currentFiles.filter((f) => f.id !== id));
  };

  const updateFileMeta = (
    id: string,
    key: "year" | "quarter" | "documentType",
    value: string,
    setter: React.Dispatch<React.SetStateAction<UploadedFile[]>>,
    currentFiles: UploadedFile[],
  ) => {
    setter(
      currentFiles.map((f) =>
        f.id === id
          ? key === "documentType"
            ? {
                ...f,
                documentType: value,
                sourceCategory: sourceCategoryForDocType(value),
              }
            : { ...f, [key]: value }
          : f,
      ),
    );
  };

  const renderFileList = (
    files: UploadedFile[],
    setter: React.Dispatch<React.SetStateAction<UploadedFile[]>>,
    icon: React.ReactNode,
  ) => {
    if (files.length === 0) return null;

    return (
      <div className="mt-4 space-y-3">
        {files.map((fileObj) => (
          <div
            key={fileObj.id}
            className="flex items-center gap-4 bg-slate-50 p-3 rounded-lg border border-slate-100"
          >
            <div className="flex-shrink-0 text-slate-400">{icon}</div>
            <div className="flex-grow min-w-0">
              <p className="text-sm font-medium text-slate-700 truncate">
                {fileObj.file.name}
              </p>
              <p className="text-xs text-slate-500">
                {(fileObj.file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={fileObj.year}
                onChange={(e) =>
                  updateFileMeta(
                    fileObj.id,
                    "year",
                    e.target.value,
                    setter,
                    files,
                  )
                }
                className="text-sm border-slate-200 rounded-md py-1.5 px-3 focus:ring-[#ED232A] focus:border-[#ED232A]"
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <select
                value={fileObj.quarter}
                onChange={(e) =>
                  updateFileMeta(
                    fileObj.id,
                    "quarter",
                    e.target.value,
                    setter,
                    files,
                  )
                }
                className="text-sm border-slate-200 rounded-md py-1.5 px-3 focus:ring-[#ED232A] focus:border-[#ED232A]"
              >
                {QUARTERS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
              <select
                value={fileObj.documentType}
                onChange={(e) =>
                  updateFileMeta(
                    fileObj.id,
                    "documentType",
                    e.target.value,
                    setter,
                    files,
                  )
                }
                className="text-sm border-slate-200 rounded-md py-1.5 px-3 focus:ring-[#ED232A] focus:border-[#ED232A]"
              >
                {DOC_TYPES.map((d) => (
                  <option key={d} value={d}>
                    {d} — {formatDocumentTypeLabel(d)}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeFile(fileObj.id, setter, files)}
                className="text-slate-400 hover:text-red-600 hover:bg-red-50 ml-2"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const handleSave = async () => {
    const token = getAccessToken();
    if (!token) {
      toast.error("Not signed in", {
        description: "Log in from the home page with admin credentials, then return here.",
      });
      return;
    }
    const files: File[] = [];
    const metadata: UploadFileMeta[] = [];
    const company = companyName.trim();
    collectUploadPayload(company, currentQuarterEc, files, metadata);
    setUploadSubmitting(true);
    setLastUploadResults([]);
    try {
      const res = await uploadDocuments(files, metadata, token);
      setLastUploadResults(res.results);
      const failed = res.results.filter((r) => !r.ok);
      const ok = res.results.filter((r) => r.ok);
      const topDocTypes = Array.from(
        new Set(ok.map((r) => r.detected_document_type).filter(Boolean)),
      ).slice(0, 3);
      const sectionsTotal = ok.reduce(
        (sum, r) => sum + (r.sections_detected?.length ?? 0),
        0,
      );
      if (failed.length === 0) {
        toast.success("Upload complete", {
          description:
            `${ok.length} file(s) indexed (${ok.reduce((s, r) => s + r.chunks_created, 0)} chunks). ` +
            `${sectionsTotal} section blocks detected` +
            (topDocTypes.length ? `; types: ${topDocTypes.join(", ")}.` : "."),
        });
      } else {
        const failedList = failed
          .map((r) => `• ${r.filename}${r.error ? ` — ${r.error}` : ""}`)
          .join("\n");
        toast.warning(`Upload finished with errors (${ok.length} ok, ${failed.length} failed)`, {
          description: failedList,
          duration: 10000,
        });
      }
      void loadDocumentCatalog();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      toast.error("Upload failed", { description: message });
      setLastUploadResults([]);
    } finally {
      setUploadSubmitting(false);
    }
  };

  const handleQuestionGeneration = async () => {
    const token = getAccessToken();
    if (!token) {
      toast.error("Not signed in");
      return;
    }
    const company = companyName.trim();
    if (!company) {
      toast.error("Enter a company name");
      return;
    }
    setQgenSubmitting(true);
    try {
      const res = await runQuestionGeneration(
        { company, last_n_quarters: 8, persist: true },
        token,
      );
      toast.success("Questions generated", {
        description: `${res.questions.length} question(s). ${res.context_summary}`,
      });
      void loadPredictedQuestions(company);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Generation failed";
      toast.error("Question generation failed", { description: message });
    } finally {
      setQgenSubmitting(false);
    }
  };

  const handleSaveQuestion = async () => {
    if (!editingQuestion) return;
    const token = getAccessToken();
    if (!token) {
      toast.error("Sign in first (home page → admin / admin)");
      return;
    }
    const periodMeta = parsePeriodLabel(editingQuestion.period || "");
    try {
      if (isAddMode) {
        await createActualEarningsQA(
          {
            company: reviewCompany,
            question: editingQuestion.question,
            answer: editingQuestion.answer || undefined,
            answered_by: editingQuestion.answeredBy || undefined,
            category: editingQuestion.category || undefined,
            fiscal_year: periodMeta.fiscal_year,
            quarter: periodMeta.quarter,
            period_label: periodMeta.period_label,
          },
          token,
        );
        toast.success("Record saved to database");
      } else {
        const upd: Parameters<typeof updateActualEarningsQA>[1] = {
          company: reviewCompany,
          question: editingQuestion.question,
          answer: editingQuestion.answer || null,
          answered_by: editingQuestion.answeredBy || null,
          category: editingQuestion.category || null,
        };
        if (periodMeta.fiscal_year !== undefined) upd.fiscal_year = periodMeta.fiscal_year;
        if (periodMeta.quarter !== undefined) upd.quarter = periodMeta.quarter;
        if (periodMeta.period_label) upd.period_label = periodMeta.period_label;
        await updateActualEarningsQA(editingQuestion.id, upd, token);
        toast.success("Record updated");
      }
      await loadActualQuestions();
      setEditingQuestion(null);
      setIsAddMode(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Save failed", { description: msg });
    }
  };

  const handleDeleteQuestion = async () => {
    if (!editingQuestion) return;
    const token = getAccessToken();
    if (!token) {
      toast.error("Sign in first");
      return;
    }
    if (isAddMode) {
      setEditingQuestion(null);
      setIsAddMode(false);
      return;
    }
    try {
      await deleteActualEarningsQA(editingQuestion.id, token);
      toast.success("Record deleted");
      await loadActualQuestions();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Delete failed", { description: msg });
    }
    setEditingQuestion(null);
    setIsAddMode(false);
  };

  const handleAddRecordClick = (period: string) => {
    setIsAddMode(true);
    setEditingQuestion({
      id: Math.random().toString(36).substring(7),
      period: period,
      question: "",
      answer: "",
      answeredBy: "",
      category: "",
    });
  };

  const totalFiles = currentQuarterEc.length;
  const isFormValid = companyName.trim() !== "" && totalFiles > 0;

  return (
    <div className="p-6 space-y-6 max-w-[1800px] mx-auto">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-[#002850] mb-2">
            Admin Panel
          </h1>
          <p className="text-slate-600">
            Configure company details and upload relevant intelligence documents.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate("/dashboard")}
          className="border-[#002850] text-[#002850] hover:bg-[#002850] hover:text-white"
        >
          Go to Dashboard
        </Button>
      </div>

      <Tabs
        value={adminMainTab}
        onValueChange={(v) => setAdminMainTab(v as "generate")}
        className="w-full"
      >
        <TabsList className="mb-10 flex w-full max-w-2xl bg-slate-200/80 p-2 rounded-2xl mx-auto shadow-inner">
          <TabsTrigger
            value="generate"
            className="flex-1 rounded-xl py-4 text-lg font-medium text-slate-600 data-[state=active]:bg-[#002850] data-[state=active]:text-white data-[state=active]:shadow-lg transition-all"
          >
            <div className="flex items-center justify-center gap-2">
              <Upload className="w-5 h-5" />
              Generate Q&A
            </div>
          </TabsTrigger>
          {/* <TabsTrigger
            value="review"
            className="flex-1 rounded-xl py-4 text-lg font-medium text-slate-600 data-[state=active]:bg-[#002850] data-[state=active]:text-white data-[state=active]:shadow-lg transition-all"
          >
            <div className="flex items-center justify-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Review Q&A
            </div>
          </TabsTrigger> */}
          {/* <TabsTrigger
            value="analysis"
            className="flex-1 rounded-xl py-4 text-lg font-medium text-slate-600 data-[state=active]:bg-[#002850] data-[state=active]:text-white data-[state=active]:shadow-lg transition-all"
          >
            <div className="flex items-center justify-center gap-2">
              <Brain className="w-5 h-5" />
              Analysis
            </div>
          </TabsTrigger> */}
        </TabsList>

        {/* Review Q&A tab — hidden for now */}
        {false && <TabsContent value="review">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-xl border border-slate-200">
              <span className="font-medium text-slate-700">Company:</span>
              <Select
                value={reviewCompany}
                onValueChange={(v) => {
                  setReviewCompany(v);
                }}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select Company" />
                </SelectTrigger>
                <SelectContent>
                  {companyPicker.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(actualLoading || predictedLoading) && (
                <span className="text-sm text-slate-500 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </span>
              )}
            </div>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl text-[#8B1319]">
                  Actual Questions Review
                </CardTitle>
                <CardDescription>
                  Stored actual Q&A for this company (from your database — add or edit records to match calls tied to your document uploads).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {reviewPeriods.length === 0 ? (
                  <div className="space-y-4">
                    <p className="text-center text-slate-500 py-6">
                      No period-tagged actual Q&A for this company yet. Use &quot;Add Record&quot; after selecting a period, or load data via your pipeline.
                    </p>
                    <div className="flex justify-end">
                      <Button
                        onClick={() =>
                          handleAddRecordClick(
                            activeReviewQuarter || "Q1 FY25",
                          )
                        }
                        className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300"
                      >
                        <Plus className="w-4 h-4 mr-2" /> Add Record
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Tabs
                    value={resolvedReviewQuarter}
                    onValueChange={setActiveReviewQuarter}
                  >
                    <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                      <TabsList className="flex-wrap h-auto">
                        {reviewPeriods.map((qtr) => (
                          <TabsTrigger key={qtr} value={qtr}>
                            {qtr}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                      <Button
                        onClick={() =>
                          handleAddRecordClick(resolvedReviewQuarter)
                        }
                        className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300"
                      >
                        <Plus className="w-4 h-4 mr-2" /> Add Record
                      </Button>
                    </div>

                    {reviewPeriods.map((qtr) => {
                      const qtrQuestions = actualQuestions.filter(
                        (q) => q.period === qtr,
                      );
                      return (
                        <TabsContent key={qtr} value={qtr} className="mt-0">
                          <div className="border rounded-lg overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="min-w-[250px]">
                                    Question
                                  </TableHead>
                                  <TableHead className="min-w-[300px]">
                                    Answer
                                  </TableHead>
                                  <TableHead className="w-[150px]">
                                    Answered By
                                  </TableHead>
                                  <TableHead className="w-[150px]">
                                    Category
                                  </TableHead>
                                  <TableHead className="w-[80px]">
                                    Actions
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {qtrQuestions.length > 0 ? (
                                  qtrQuestions.map((row) => (
                                    <TableRow key={row.id}>
                                      <TableCell className="text-sm font-medium">
                                        <div
                                          className="max-w-[55ch] truncate"
                                          title={row.question}
                                        >
                                          {row.question}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-sm text-slate-600">
                                        <div
                                          className="max-w-[67ch] truncate"
                                          title={row.answer}
                                        >
                                          {row.answer}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-sm">
                                        {row.answeredBy}
                                      </TableCell>
                                      <TableCell>
                                        <Badge
                                          variant="outline"
                                          className="text-xs"
                                        >
                                          {row.category}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            setEditingQuestion(row)
                                          }
                                        >
                                          <Edit className="w-4 h-4 text-slate-500 hover:text-slate-700" />
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))
                                ) : (
                                  <TableRow>
                                    <TableCell
                                      colSpan={5}
                                      className="h-24 text-center text-slate-500"
                                    >
                                      No Q&A data for {qtr}.
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </TabsContent>
                      );
                    })}
                  </Tabs>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl text-[#8B1319]">
                  Predicted Questions Review
                </CardTitle>
                <CardDescription>
                  Loaded from the database for this company — populated when you run Generate Q&amp;A with persist. No demo data.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <p className="text-sm text-slate-600">
                    {filteredPredictedRows.length} question
                    {filteredPredictedRows.length === 1 ? "" : "s"} for{" "}
                    <span className="font-medium">{reviewCompany}</span>
                    {predictedQuarterFilter !== "all" && (
                      <>
                        {" "}
                        ·{" "}
                        <span className="font-medium">
                          {predictedQuarterFilter}
                        </span>
                      </>
                    )}
                  </p>
                  {predictedQuarters.length > 0 && (
                    <Select
                      value={predictedQuarterFilter}
                      onValueChange={setPredictedQuarterFilter}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="All quarters" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All quarters</SelectItem>
                        {predictedQuarters.map((q) => (
                          <SelectItem key={q} value={q}>
                            {q}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[110px]">Quarter</TableHead>
                        <TableHead className="min-w-[250px]">Question</TableHead>
                        <TableHead className="min-w-[300px]">Suggested answer</TableHead>
                        <TableHead className="w-[100px]">Risk</TableHead>
                        <TableHead className="w-[150px]">Category</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPredictedRows.length > 0 ? (
                        filteredPredictedRows.map((row) => {
                          const rk = formatPredictedRisk(row.risk);
                          const riskLower = rk.toLowerCase();
                          const quarterLabel =
                            row.quarter && row.fiscal_year
                              ? `${row.quarter} FY${String(row.fiscal_year).slice(-2)}`
                              : "—";
                          return (
                            <TableRow key={row.id}>
                              <TableCell className="text-sm text-slate-600 whitespace-nowrap">
                                {quarterLabel}
                              </TableCell>
                              <TableCell className="text-sm font-medium">
                                <div
                                  className="max-w-[55ch] truncate"
                                  title={row.predicted_question}
                                >
                                  {row.predicted_question}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-slate-600">
                                <div
                                  className="max-w-[67ch] truncate"
                                  title={row.suggested_answer ?? ""}
                                >
                                  {row.suggested_answer ?? "—"}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={`text-xs ${
                                    riskLower === "high"
                                      ? "bg-red-50 text-red-700 border-red-200"
                                      : riskLower === "medium"
                                        ? "bg-amber-50 text-amber-700 border-amber-200"
                                        : riskLower === "low"
                                          ? "bg-green-50 text-green-700 border-green-200"
                                          : ""
                                  }`}
                                >
                                  {rk}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {row.category || "—"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="h-24 text-center text-slate-500"
                          >
                            No predicted questions in the database for this
                            company. Run Generate Q&amp;A with the same company
                            name and persist enabled.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl text-[#8B1319]">
                  Predicted vs Actual Questions Comparison
                </CardTitle>
                <CardDescription>
                  Built from the predicted and actual rows above for{" "}
                  {reviewCompany}. Similarity uses word overlap (Jaccard); pairs
                  above {COMPARISON_MATCH_THRESHOLD}% are treated as matches.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs
                  value={comparisonTab}
                  onValueChange={(v) =>
                    setComparisonTab(v as typeof comparisonTab)
                  }
                  className="mb-4"
                >
                  <TabsList className="flex-wrap h-auto">
                    <TabsTrigger value="all">
                      All ({comparisonRows.length})
                    </TabsTrigger>
                    <TabsTrigger value="correct">
                      Matched (
                      {
                        comparisonRows.filter(
                          (d) => d.feedback === "good-prediction",
                        ).length
                      }
                      )
                    </TabsTrigger>
                    <TabsTrigger value="missed">
                      Missed (actual only) (
                      {
                        comparisonRows.filter(
                          (d) => d.feedback === "missed-question",
                        ).length
                      }
                      )
                    </TabsTrigger>
                    <TabsTrigger value="false">
                      Unmatched predicted (
                      {
                        comparisonRows.filter(
                          (d) => d.feedback === "false-positive",
                        ).length
                      }
                      )
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">Status</TableHead>
                        <TableHead className="min-w-[300px]">
                          Predicted Question
                        </TableHead>
                        <TableHead className="min-w-[300px]">
                          Actual Question
                        </TableHead>
                        <TableHead className="w-[150px]">Similarity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comparisonDisplayed.length > 0 ? (
                        comparisonDisplayed.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell>
                              {row.wasAsked && row.predictedQuestion ? (
                                <CheckCircle2 className="w-5 h-5 text-green-600" />
                              ) : row.wasAsked && !row.predictedQuestion ? (
                                <XCircle className="w-5 h-5 text-red-600" />
                              ) : (
                                <AlertCircle className="w-5 h-5 text-amber-600" />
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              {row.predictedQuestion || (
                                <span className="text-slate-400 italic">
                                  Not predicted
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              {row.actualPhrasing || (
                                <span className="text-slate-400 italic">
                                  Not asked
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {row.similarity > 0 ? (
                                <div className="flex items-center gap-2">
                                  <Progress
                                    value={row.similarity}
                                    className="w-12 h-2"
                                  />
                                  <span className="text-sm font-medium">
                                    {row.similarity}%
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-sm">
                                  N/A
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="h-24 text-center text-slate-500"
                          >
                            Nothing in this view. Add predicted (Generate Q&amp;A)
                            and/or actual Q&amp;A for this company.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          <Dialog
            open={!!editingQuestion}
            onOpenChange={(open) => {
              if (!open) {
                setEditingQuestion(null);
                setIsAddMode(false);
              }
            }}
          >
            <DialogContent className="!max-w-[90vw] w-[90vw] h-[78vh] max-h-[85vh] overflow-y-auto overflow-x-hidden">
              <DialogHeader className="flex flex-row items-center justify-between pr-8 mt-2">
                <div className="space-y-1">
                  <DialogTitle>{isAddMode ? "Add a Record" : "Edit Q&A"}</DialogTitle>
                  <DialogDescription>
                    {isAddMode ? "Manually add a new actual question and answer captured from the call." : "Modify the actual question and answer captured from the call."}
                  </DialogDescription>
                </div>
                {!isAddMode && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDeleteQuestion}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 mt-0"
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Delete Row
                  </Button>
                )}
              </DialogHeader>

              {editingQuestion && (
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Question</Label>
                    <Textarea
                      value={editingQuestion.question}
                      onChange={(e) =>
                        setEditingQuestion({
                          ...editingQuestion,
                          question: e.target.value,
                        })
                      }
                      className="min-h-[80px] break-words [overflow-wrap:anywhere]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Answer</Label>
                    <Textarea
                      value={editingQuestion.answer}
                      onChange={(e) =>
                        setEditingQuestion({
                          ...editingQuestion,
                          answer: e.target.value,
                        })
                      }
                      className="min-h-[220px] break-words [overflow-wrap:anywhere]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Answered By</Label>
                      <Input
                        value={editingQuestion.answeredBy}
                        onChange={(e) =>
                          setEditingQuestion({
                            ...editingQuestion,
                            answeredBy: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Input
                        value={editingQuestion.category}
                        onChange={(e) =>
                          setEditingQuestion({
                            ...editingQuestion,
                            category: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => { setEditingQuestion(null); setIsAddMode(false); }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveQuestion}
                  className="bg-[#ED232A] hover:bg-[#C11B22] text-white"
                >
                  {isAddMode ? "Add Record" : "Save Changes"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>}

        <TabsContent value="generate">
          <div className="space-y-6">
            {/* Section 1: Company Name */}
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-xl text-[#8B1319]">
                  Company Profile
                </CardTitle>
                <CardDescription>
                  Select the company for uploads, question generation, and the Historical document
                  list. Add a new name to extend the dropdown (saved in this browser).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 max-w-xl">
                <div className="space-y-2">
                  <Label htmlFor="company-select">Company</Label>
                  <Select
                    value={companyName.trim() ? companyName.trim() : COMPANY_SELECT_NONE}
                    onValueChange={(v) =>
                      setCompanyName(v === COMPANY_SELECT_NONE ? "" : v)
                    }
                  >
                    <SelectTrigger
                      id="company-select"
                      className="border-slate-200 focus:border-[#ED232A] focus:ring-[#ED232A]"
                    >
                      <SelectValue placeholder="Select a company…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={COMPANY_SELECT_NONE}>
                        Select a company…
                      </SelectItem>
                      {companyOptions.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* <div className="space-y-2">
                  <Label htmlFor="newCompany">Add company to list</Label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      id="newCompany"
                      placeholder="e.g. Acme Corp"
                      value={newCompanyInput}
                      onChange={(e) => setNewCompanyInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCompanyToList(newCompanyInput);
                          setNewCompanyInput("");
                        }
                      }}
                      className="focus:border-[#ED232A] focus:ring-[#ED232A] sm:flex-1"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0 border border-[#ED232A]/30 text-[#8B1319]"
                      onClick={() => {
                        addCompanyToList(newCompanyInput);
                        setNewCompanyInput("");
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1.5" />
                      Add
                    </Button>
                  </div>
                </div> */}
              </CardContent>
            </Card>

            <Tabs
              value={uploadDocTab}
              onValueChange={(v) => setUploadDocTab(v as "historical" | "current")}
              className="w-full"
            >
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="historical">Historical</TabsTrigger>
                <TabsTrigger value="current">Current</TabsTrigger>
              </TabsList>

              <TabsContent value="historical" className="space-y-6 mt-4">
                <Card className="border-slate-200">
                  <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-xl text-[#8B1319]">
                        <FileText className="h-5 w-5 shrink-0" />
                        Ingested documents
                      </CardTitle>
                      <CardDescription className="mt-1 max-w-2xl">
                        Documents for the company selected in <strong>Company Profile</strong>{" "}
                        above. Use the <strong>Current</strong> tab to upload files for that company.
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-[#ED232A]/40 text-[#8B1319] shrink-0"
                      onClick={() => void loadDocumentCatalog()}
                      disabled={documentsLoading || !getAccessToken()}
                    >
                      {documentsLoading ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Refresh
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {!getAccessToken() ? (
                      <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/60 p-5 text-sm text-amber-950">
                        Sign in from the home page (admin credentials) to load this table.
                      </div>
                    ) : documentsLoading ? (
                      <div className="flex items-center justify-center gap-2 py-16 text-slate-600 text-sm">
                        <Loader2 className="h-5 w-5 animate-spin text-[#ED232A]" />
                        Loading documents…
                      </div>
                    ) : !companyName.trim() ? (
                      <div className="rounded-lg border border-dashed border-slate-200 p-5 text-sm text-slate-700 bg-slate-50/60">
                        <p className="font-medium text-[#8B1319] mb-1">Select a company</p>
                        <p>
                          Choose a company in <strong>Company Profile</strong> to see ingested
                          documents for that company only.
                        </p>
                      </div>
                    ) : documentsCatalog.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-5 text-sm text-slate-600 bg-slate-50/60">
                        No documents in the database yet. Select <strong>{companyName.trim()}</strong>{" "}
                        in Company Profile, then upload PDFs or text files from the{" "}
                        <strong>Current</strong> tab.
                      </div>
                    ) : filteredDocumentsCatalog.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/70 p-5 text-sm text-amber-950">
                        <p className="font-medium mb-1">No documents for {companyName.trim()}</p>
                        <p>
                          Nothing ingested for this company yet. Keep this company selected in{" "}
                          <strong>Company Profile</strong>, go to the <strong>Current</strong> tab,
                          add files, and click <strong>Upload documents</strong>.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-lg border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Document type</TableHead>
                              <TableHead>Quarter</TableHead>
                              <TableHead>Created</TableHead>
                              <TableHead>Updated</TableHead>
                              <TableHead className="w-[90px] text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredDocumentsCatalog.map((row) => {
                              const label =
                                row.original_filename ||
                                `${formatDocumentTypeLabel(row.document_type)} — ${formatQuarterPeriod(row.quarter, row.fiscal_year)}`;
                              const isDeleting = deletingDocId === row.id;
                              return (
                                <TableRow key={row.id}>
                                  <TableCell className="text-sm">
                                    {formatDocumentTypeLabel(row.document_type)}
                                  </TableCell>
                                  <TableCell className="text-sm whitespace-nowrap">
                                    {formatQuarterPeriod(row.quarter, row.fiscal_year)}
                                  </TableCell>
                                  <TableCell className="text-sm text-slate-600 whitespace-nowrap">
                                    {formatCatalogDate(row.created_at)}
                                  </TableCell>
                                  <TableCell className="text-sm text-slate-600 whitespace-nowrap">
                                    {formatCatalogDate(row.updated_at)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="text-[#8B1319] hover:bg-red-50 hover:text-[#8B1319]"
                                      onClick={() =>
                                        void handleDeleteHistoricalDocument(row.id, label)
                                      }
                                      disabled={isDeleting}
                                      aria-label={`Delete ${label}`}
                                    >
                                      {isDeleting ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="current" className="space-y-6 mt-4">
                <Card className="border-slate-200">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl text-[#8B1319]">
                      <FileSpreadsheet className="h-5 w-5" />
                      Current Documents
                    </CardTitle>
                    <CardDescription>
                      Upload current-quarter documents and choose the document type for each file.
                      Files are associated with the company selected in <strong>Company Profile</strong>.
                    </CardDescription>
                    <div className="mt-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {}}
                        className="border-[#ED232A] text-[#ED232A] hover:bg-[#FFE8EA]"
                      >
                        Fetch All Documents
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 bg-slate-50/50 hover:bg-slate-50 transition-colors text-center">
                      <Input
                        type="file"
                        id="upload-current-docs"
                        multiple
                        accept=".pdf,.txt"
                        className="hidden"
                        onChange={(e) =>
                          handleFileUpload(
                            e,
                            setCurrentQuarterEc,
                            currentQuarterEc,
                            "FIN",
                          )
                        }
                      />
                      <Label
                        htmlFor="upload-current-docs"
                        className="cursor-pointer flex flex-col items-center"
                      >
                        <div className="h-12 w-12 rounded-full bg-[#ED232A]/10 flex items-center justify-center mb-4">
                          <Upload className="h-6 w-6 text-[#ED232A]" />
                        </div>
                        <span className="font-medium text-[#8B1319]">
                          Browse all files
                        </span>
                        <span className="text-sm text-slate-500 mt-1">
                          Select one or many PDFs / TXT — pick the document type
                          (FIN, PR, TR, PPT, AR, GUIDE, SUPP) per file below
                        </span>
                      </Label>
                    </div>
                    {renderFileList(
                      currentQuarterEc,
                      setCurrentQuarterEc,
                      <FileSpreadsheet className="h-5 w-5" />,
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 mb-20">
              <Button
                type="button"
                variant="outline"
                onClick={handleQuestionGeneration}
                disabled={companyName.trim() === "" || qgenSubmitting}
                className="border-[#002850] text-[#002850] px-6 py-6 text-lg rounded-xl"
              >
                {qgenSubmitting ? (
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-5 w-5 mr-2" />
                )}
                Generate questions (LLM)
              </Button>
              <Button
                onClick={handleSave}
                disabled={!isFormValid || uploadSubmitting}
                className="bg-[#ED232A] hover:bg-[#C11B22] text-white px-8 py-6 text-lg rounded-xl shadow-lg hover:shadow-xl transition-all font-medium disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
              >
                {uploadSubmitting ? (
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <Save className="h-5 w-5 mr-2" />
                )}
                Upload documents
              </Button>
            </div>

            <Card className="border-slate-200 mb-10">
              <CardHeader>
                <CardTitle className="text-xl text-[#8B1319]">
                  Ingestion Summary
                </CardTitle>
                <CardDescription>
                  File-by-file processing output from the latest upload run.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {lastUploadResults.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-5 text-sm text-slate-600 bg-slate-50/60">
                    No upload results yet. Upload one or more files to see detected document type,
                    sections, financial metric extraction count, and chunking strategy here.
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[220px]">File</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Detected Type</TableHead>
                            <TableHead>Sections</TableHead>
                            <TableHead>Metrics</TableHead>
                            <TableHead>Chunks</TableHead>
                            <TableHead>Strategy</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lastUploadResults.map((r) => (
                            <TableRow key={`${r.filename}-${r.document_id ?? "na"}`}>
                              <TableCell className="font-medium text-sm">{r.filename}</TableCell>
                              <TableCell>
                                {r.ok ? (
                                  <Badge className="bg-green-100 text-green-800 border-green-200">
                                    Success
                                  </Badge>
                                ) : (
                                  <Badge className="bg-red-100 text-red-800 border-red-200">
                                    Failed
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-sm">
                                {r.detected_document_type || "—"}
                              </TableCell>
                              <TableCell className="text-sm">
                                {r.sections_detected?.length
                                  ? r.sections_detected.join(", ")
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-sm">
                                {r.financial_metrics_count ?? 0}
                              </TableCell>
                              <TableCell className="text-sm">{r.chunks_created}</TableCell>
                              <TableCell className="text-sm">
                                {r.chunking_strategy || (r.ok ? "default" : "—")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {lastUploadResults.some((r) => !r.ok && r.error) && (
                      <div className="mt-3 space-y-2">
                        {lastUploadResults
                          .filter((r) => !r.ok && r.error)
                          .map((r) => (
                            <p
                              key={`err-${r.filename}`}
                              className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1"
                            >
                              <span className="font-semibold">{r.filename}:</span> {r.error}
                            </p>
                          ))}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* <TabsContent value="analysis">
          <AnalysisPanel
            documents={documentsCatalog}
            companies={companyOptions}
          />
        </TabsContent> */}
      </Tabs>
    </div>
  );
}
