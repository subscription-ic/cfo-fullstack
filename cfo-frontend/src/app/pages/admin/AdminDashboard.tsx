import { useState, useEffect } from "react";
const API_URL = import.meta.env.VITE_API_URL ?? `${API_URL}`;

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
  BarChart,
  FileSpreadsheet,
  Edit,
  Trash2,
  Plus,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Tag,
  UserPlus,
} from "lucide-react";
import { Progress } from "../../components/ui/progress";

interface UploadedFile {
  id: string;
  file: File;
  year: string;
  quarter: string;
}

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => (currentYear - i).toString());
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

const REVIEW_QUARTERS = ["Q1 FY25", "Q4 FY24", "Q3 FY24", "Q2 FY24"];

const mockActualQuestions = [
  // Q1 FY25
  {
    id: "1",
    period: "Q1 FY25",
    question: "Walk us through the margin bridge this quarter and sustainability into Q2?",
    answer: "Three main drivers: efficiency improvements from automation, premium mix shift, and pricing actions.",
    answeredBy: "Jane Doe, CFO",
    category: "Margin / Profitability",
  },
  {
    id: "2",
    period: "Q1 FY25",
    question: "Your guidance implies deceleration in Q2 - what are the specific headwinds?",
    answer: "Q2 has typical seasonal patterns, we're lapping a very strong Q2 last year.",
    answeredBy: "John Smith, CEO",
    category: "Guidance",
  },
  {
    id: "3",
    period: "Q1 FY25",
    question: "Can you break out volume and price contribution to growth?",
    answer: "Volume contributed 5.5 points, pricing 3 points. Both sustainable.",
    answeredBy: "Jane Doe, CFO",
    category: "Revenue / Growth",
  },

  // Q4 FY24
  {
    id: "4",
    period: "Q4 FY24",
    question: "How are you thinking about capital allocation for the rest of the year?",
    answer: "Our priority remains investing in organic growth, followed by opportunistic share repurchases.",
    answeredBy: "Jane Doe, CFO",
    category: "Capital Allocation",
  },
  {
    id: "5",
    period: "Q4 FY24",
    question: "What drove the higher than expected tax rate this quarter?",
    answer: "There was a one-time discrete tax headwind related to our European restructuring efforts which will not repeat next year.",
    answeredBy: "Jane Doe, CFO",
    category: "Tax",
  },
  {
    id: "6",
    period: "Q4 FY24",
    question: "Are you seeing any changes in consumer spending patterns?",
    answer: "Consumers remain largely resilient, though we are seeing slight trade-down behavior in select lower-income cohorts.",
    answeredBy: "John Smith, CEO",
    category: "Macro / Consumer",
  },

  // Q3 FY24
  {
    id: "7",
    period: "Q3 FY24",
    question: "Can you provide an update on the progress of the new CRM rollout across the sales teams?",
    answer: "We are currently 80% deployed and expect to finish the implementation ahead of schedule by next quarter.",
    answeredBy: "Michael Johnson, COO",
    category: "Operations",
  },
  {
    id: "8",
    period: "Q3 FY24",
    question: "How much of the revenue beat was driven by FX movements vs organic volume?",
    answer: "FX was a minor tailwind of roughly 1 point, the vast majority of the beat was driven by strong underlying volume in core markets.",
    answeredBy: "Jane Doe, CFO",
    category: "Revenue / Growth",
  },

  // Q2 FY24
  {
    id: "9",
    period: "Q2 FY24",
    question: "Supply chain disruptions were a major headwind last quarter. Have those issues fully resolved?",
    answer: "We've made significant progress diversifying our suppliers. While freight costs remain elevated, we are no longer facing severe component shortages.",
    answeredBy: "Michael Johnson, COO",
    category: "Supply Chain",
  },
  {
    id: "10",
    period: "Q2 FY24",
    question: "What is your outlook on competitive pricing dynamics given recent aggressive promotions from rivals?",
    answer: "We are closely monitoring the market but believe our premium brand positioning isolates us from needing to participate in deep discounting.",
    answeredBy: "John Smith, CEO",
    category: "Competition",
  }
];

const mockPredictedQuestions = [
  {
    id: "p1",
    period: "Q1 FY25",
    question: "How will the recent interest rate hikes impact loan growth targets?",
    answer: "We've modeled a conservative 5% downside in loan origination volume but expect steady NIMs.",
    category: "Macro / Interest Rates",
    risk: "High",
  },
  {
    id: "p2",
    period: "Q1 FY25",
    question: "Do you anticipate needing to increase loan loss reserves heavily in Q2?",
    answer: "Our current coverage ratio is strong. We expect provisions to normalize rather than increase substantially.",
    category: "Asset Quality",
    risk: "Medium",
  },
  {
    id: "p3",
    period: "Q4 FY24",
    question: "Can you comment on the expected tech spending for next fiscal year?",
    answer: "Tech investments will continue but growth rate will moderate to low single digits.",
    category: "OpEx",
    risk: "Low",
  }
];

interface ComparisonData {
  id: string;
  predictedQuestion: string;
  wasAsked: boolean;
  actualPhrasing: string;
  similarity: number;
  recommendedAnswer: string;
  actualAnswer: string;
  category: string;
  feedback: string;
}

const comparisonData: ComparisonData[] = [
  {
    id: '1',
    predictedQuestion: 'Can you walk through the key drivers of the 120 bps margin expansion this quarter?',
    wasAsked: true,
    actualPhrasing: 'Walk us through the margin bridge this quarter and sustainability into Q2?',
    similarity: 92,
    recommendedAnswer: '',
    actualAnswer: '',
    category: 'Margin / Profitability',
    feedback: 'good-prediction'
  },
  {
    id: '2',
    predictedQuestion: 'What gives you confidence in the full-year revenue guidance?',
    wasAsked: true,
    actualPhrasing: 'Your guidance implies deceleration in Q2 - what are the specific headwinds?',
    similarity: 78,
    recommendedAnswer: '',
    actualAnswer: '',
    category: 'Guidance',
    feedback: 'good-prediction'
  },
  {
    id: '3',
    predictedQuestion: 'How much of your revenue growth is coming from volume versus price?',
    wasAsked: true,
    actualPhrasing: 'Can you break out volume and price contribution to growth?',
    similarity: 95,
    recommendedAnswer: '',
    actualAnswer: '',
    category: 'Revenue / Growth',
    feedback: 'good-prediction'
  },
  {
    id: '4',
    predictedQuestion: 'What specific actions are you taking to turn around international?',
    wasAsked: true,
    actualPhrasing: 'International remains weak - what\'s the turnaround plan and timeline?',
    similarity: 88,
    recommendedAnswer: '',
    actualAnswer: '',
    category: 'Region / Segment',
    feedback: 'good-prediction'
  },
  {
    id: '5',
    predictedQuestion: 'Can you provide more color on working capital trends?',
    wasAsked: false,
    actualPhrasing: '',
    similarity: 0,
    recommendedAnswer: '',
    actualAnswer: '',
    category: 'Capital Allocation',
    feedback: 'false-positive'
  },
  {
    id: '6',
    predictedQuestion: 'What are you seeing from competitors on pricing?',
    wasAsked: true,
    actualPhrasing: 'Any signs of irrational pricing or competitive pressure?',
    similarity: 85,
    recommendedAnswer: '',
    actualAnswer: '',
    category: 'Competition',
    feedback: 'good-prediction'
  },
  {
    id: '7',
    predictedQuestion: 'Any update on the regulatory environment?',
    wasAsked: false,
    actualPhrasing: '',
    similarity: 0,
    recommendedAnswer: '',
    actualAnswer: '',
    category: 'Regulation / Risk',
    feedback: 'false-positive'
  },
  {
    id: '8',
    predictedQuestion: '',
    wasAsked: true,
    actualPhrasing: 'Can you talk about your cloud migration progress and impact on margins?',
    similarity: 0,
    recommendedAnswer: '',
    actualAnswer: '',
    category: 'Technology',
    feedback: 'missed-question'
  }
];


function DeleteCompanyTab({ companies, onDeleted }: { companies: string[], onDeleted: (name: string) => void }) {
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleDelete = async () => {
    if (!selectedCompany) return;
    if (!window.confirm(`Are you sure you want to PERMANENTLY delete "${selectedCompany}" and ALL related earnings calls, questions, and comparisons? This cannot be undone.`)) return;

    setIsDeleting(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/companies/${encodeURIComponent(selectedCompany)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to delete company");
      }
      const data = await res.json();
      setMessage({ type: "success", text: `"${data.deleted}" and all related records have been permanently deleted.` });
      onDeleted(selectedCompany);
      setSelectedCompany("");
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Gradient header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-700 via-red-800 to-red-950 p-8 text-white shadow-xl">
        <div
          className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "radial-gradient(circle at 80% 20%, #fff 1px, transparent 1px)", backgroundSize: "24px 24px" }}
        />
        <div className="relative z-10 flex items-start gap-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 shadow-inner">
            <Trash2 className="h-7 w-7 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Delete Company</h2>
            <p className="mt-1 text-red-200 text-sm leading-relaxed">
              Permanently remove a company and every record associated with it — earnings calls, actual Q&amp;A, predicted questions, and comparison data.
            </p>
          </div>
        </div>
      </div>

      {/* Danger zone card */}
      <Card className="border-red-200 shadow-md overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-red-500 via-red-700 to-red-500" />
        <CardContent className="pt-6 pb-8 px-6 space-y-6">

          {/* Warning banner */}
          <div className="flex gap-3 rounded-xl bg-red-50 border border-red-200 p-4">
            <div className="text-red-600 text-xl mt-0.5">⚠️</div>
            <div>
              <p className="font-semibold text-red-800 text-sm">Irreversible Action</p>
              <p className="text-red-600 text-xs mt-0.5 leading-relaxed">
                All earnings calls, actual questions, predicted questions, and comparison records linked to this company will be <strong>permanently erased</strong> from the database. There is no undo.
              </p>
            </div>
          </div>

          {/* Company selector */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700">Select Company to Delete</Label>
            <Select value={selectedCompany} onValueChange={setSelectedCompany}>
              <SelectTrigger className="w-full h-11 border-slate-300 rounded-lg">
                <SelectValue placeholder="Choose a company from the database..." />
              </SelectTrigger>
              <SelectContent>
                {companies.length > 0 ? (
                  companies.map(c => (
                    <SelectItem key={c} value={c}>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-red-500" />
                        {c}
                      </div>
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>No companies in database</SelectItem>
                )}
              </SelectContent>
            </Select>
            {selectedCompany && (
              <p className="text-xs text-slate-500 mt-1 pl-1">
                You are about to delete: <span className="font-semibold text-red-700">{selectedCompany}</span>
              </p>
            )}
          </div>

          {/* Feedback message */}
          {message && (
            <div className={`flex items-start gap-3 p-4 rounded-xl text-sm border ${
              message.type === "success"
                ? "bg-green-50 text-green-800 border-green-200"
                : "bg-red-50 text-red-800 border-red-200"
            }`}>
              <span className="text-base mt-0.5">{message.type === "success" ? "✅" : "❌"}</span>
              <span>{message.text}</span>
            </div>
          )}

          {/* Delete button */}
          <Button
            onClick={handleDelete}
            disabled={!selectedCompany || isDeleting}
            className="w-full h-11 bg-red-700 hover:bg-red-800 active:bg-red-900 text-white font-semibold rounded-lg shadow-md transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" /> Deleting...</>
            ) : (
              <><Trash2 className="w-4 h-4 mr-2" /> Delete {selectedCompany || "Company"} Permanently</>
            )}
          </Button>

          {!selectedCompany && (
            <p className="text-center text-xs text-slate-400">Select a company above to enable deletion.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


export default function AdminDashboard() {
  const [actualQuestions, setActualQuestions] = useState<any[]>([]);
  const [actualQuestionsLoading, setActualQuestionsLoading] = useState(false);
  const [availableReviewQuarters, setAvailableReviewQuarters] = useState<string[]>([]);
  const [activeReviewQuarter, setActiveReviewQuarter] = useState<string>("");
  const [editingQuestion, setEditingQuestion] = useState<any>(null);
  const [isAddMode, setIsAddMode] = useState<boolean>(false);
  
  const [availableCompanies, setAvailableCompanies] = useState<string[]>([]);
  const [reviewCompany, setReviewCompany] = useState<string>("");

  const fetchCompanies = () => {
    fetch(`${API_URL}/api/companies`)
      .then(res => res.json())
      .then(data => {
        if (data.companies) {
          setAvailableCompanies(data.companies);
        }
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  useEffect(() => {
    if (!reviewCompany) return;
    setActualQuestionsLoading(true);
    fetch(`${API_URL}/api/actual-questions?company=${encodeURIComponent(reviewCompany)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.data) {
          setActualQuestions(data.data);
          
          const periods = Array.from(new Set(data.data.map((q: any) => q.period))) as string[];
          // Sort periods chronologically: Q1 FY25, Q2 FY25, Q1 FY26, etc.
          periods.sort((a, b) => {
            const parseP = (p: string) => {
              const m = p.match(/Q(\d)\s+FY(\d+)/);
              return m ? parseInt(m[2]) * 10 + parseInt(m[1]) : 0;
            };
            return parseP(a) - parseP(b);
          });
          setAvailableReviewQuarters(periods);
          
          if (periods.length > 0) {
            setActiveReviewQuarter(periods[0]);
          } else {
            setActiveReviewQuarter("");
          }
        }
      })
      .catch((err) => console.error("Failed to fetch actual questions:", err))
      .finally(() => setActualQuestionsLoading(false));
  }, [reviewCompany]);

  const [predictedQuestions, setPredictedQuestions] = useState<any[]>([]);
  const [predictedQuestionsLoading, setPredictedQuestionsLoading] = useState(false);
  const [availablePredictedQuarters, setAvailablePredictedQuarters] = useState<string[]>([]);
  const [activePredictedQuarter, setActivePredictedQuarter] = useState<string>("");

  useEffect(() => {
    if (!reviewCompany) return;
    setPredictedQuestionsLoading(true);
    fetch(`${API_URL}/api/predicted-questions?company=${encodeURIComponent(reviewCompany)}`)
      .then(res => res.json())
      .then(data => {
        if (data.data) {
          setPredictedQuestions(data.data);
          const periods = Array.from(new Set(data.data.map((q: any) => q.period))) as string[];
          periods.sort((a, b) => {
            const parseP = (p: string) => { const m = p.match(/Q(\d)\s+FY(\d+)/); return m ? parseInt(m[2]) * 10 + parseInt(m[1]) : 0; };
            return parseP(a) - parseP(b);
          });
          setAvailablePredictedQuarters(periods);
          if (periods.length > 0) setActivePredictedQuarter(periods[periods.length - 1]);
        }
      })
      .catch(err => console.error("Failed to fetch predicted questions:", err))
      .finally(() => setPredictedQuestionsLoading(false));
  }, [reviewCompany]);

  const [editingPredictedQuestion, setEditingPredictedQuestion] = useState<any>(null);
  const [isAddPredictedMode, setIsAddPredictedMode] = useState<boolean>(false);

  const [comparisonState, setComparisonState] = useState<any[]>([]);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [availableComparisonQuarters, setAvailableComparisonQuarters] = useState<string[]>([]);
  const [activeComparisonQuarter, setActiveComparisonQuarter] = useState<string>("");
  const [editingComparison, setEditingComparison] = useState<ComparisonData | null>(null);
  const [activeComparisonTab, setActiveComparisonTab] = useState("all");

  useEffect(() => {
    if (!reviewCompany) return;
    setComparisonLoading(true);
    fetch(`${API_URL}/api/comparisons?company=${encodeURIComponent(reviewCompany)}`)
      .then(res => res.json())
      .then(data => {
        if (data.data) {
          setComparisonState(data.data);
          const periods = Array.from(new Set(data.data.map((q: any) => q.period))) as string[];
          periods.sort((a, b) => {
            const parseP = (p: string) => { const m = p.match(/Q(\d)\s+FY(\d+)/); return m ? parseInt(m[2]) * 10 + parseInt(m[1]) : 0; };
            return parseP(a) - parseP(b);
          });
          setAvailableComparisonQuarters(periods);
          if (periods.length > 0) setActiveComparisonQuarter(periods[periods.length - 1]);
        }
      })
      .catch(err => console.error("Failed to fetch comparisons:", err))
      .finally(() => setComparisonLoading(false));
  }, [reviewCompany]);
  const [companyName, setCompanyName] = useState("");
  const [cutOffDate, setCutOffDate] = useState("");
  const DEFAULT_QUERIES = [
    "{company} quarterly financial results analyst questions earnings call before {cutoff}",
    "{company} revenue growth margin guidance outlook before {cutoff}",
    "{company} stock analyst commentary investor concerns before {cutoff}",
    "{company} earnings call key themes sector trends before {cutoff}",
    "{company} India business update capex debt guidance before {cutoff}",
  ].join("\n");
  const [searchQueries, setSearchQueries] = useState<string>(DEFAULT_QUERIES);

  // Upload Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("");

  // User Management State
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userFirstName, setUserFirstName] = useState("");
  const [userLastName, setUserLastName] = useState("");
  const [userRole, setUserRole] = useState("user");
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [userMessage, setUserMessage] = useState("");

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingUser(true);
    setUserMessage("");
    try {
      const resp = await fetch(`${API_URL}/api/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          password: userPassword,
          first_name: userFirstName,
          last_name: userLastName,
          role: userRole,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.detail || "Failed to create user");
      }
      setUserMessage("User created successfully!");
      setUserEmail("");
      setUserPassword("");
      setUserFirstName("");
      setUserLastName("");
      setUserRole("user");
      // Hide message after 5s
      setTimeout(() => setUserMessage(""), 5000);
    } catch (err: any) {
      setUserMessage(err.message);
    } finally {
      setIsCreatingUser(false);
    }
  };

  // File state arrays
  const [historicalPdfs, setHistoricalPdfs] = useState<UploadedFile[]>([]);
  const [currentQuarterEc, setCurrentQuarterEc] = useState<UploadedFile[]>([]);
  const [financialStats, setFinancialStats] = useState<UploadedFile[]>([]);
  const [currentQuarterStats, setCurrentQuarterStats] = useState<
    UploadedFile[]
  >([]);

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<UploadedFile[]>>,
    currentFiles: UploadedFile[],
  ) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map((file) => ({
        id: Math.random().toString(36).substring(7),
        file,
        year: currentYear.toString(),
        quarter: QUARTERS[0],
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
    key: "year" | "quarter",
    value: string,
    setter: React.Dispatch<React.SetStateAction<UploadedFile[]>>,
    currentFiles: UploadedFile[],
  ) => {
    setter(currentFiles.map((f) => (f.id === id ? { ...f, [key]: value } : f)));
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
    if (historicalPdfs.length === 0) {
      alert("Please upload at least one historical PDF to process.");
      return;
    }
    
    setIsProcessing(true);

    const uploadAndPoll = (fileObj: UploadedFile, index: number, total: number): Promise<void> => {
      return new Promise(async (resolve, reject) => {
        try {
          setProcessingMessage(`[${index + 1}/${total}] Uploading ${fileObj.file.name}...`);

          const formData = new FormData();
          formData.append("file", fileObj.file);
          formData.append("company", companyName);
          formData.append("year", fileObj.year);
          formData.append("quarter", fileObj.quarter);
          if (cutOffDate) formData.append("cut_off_date", cutOffDate);
          if (searchQueries) formData.append("search_queries", searchQueries);

          const response = await fetch(`${API_URL}/api/upload/historical`, {
            method: "POST",
            body: formData
          });

          const data = await response.json();
          if (!response.ok) throw new Error(data.detail || "Failed to start extraction");

          const taskId = data.task_id;

          const pollInterval = setInterval(async () => {
            try {
              const statusRes = await fetch(`${API_URL}/api/tasks/${taskId}`);
              const statusData = await statusRes.json();
              if (statusRes.ok) {
                setProcessingMessage(`[${index + 1}/${total}] ${fileObj.file.name}: ${statusData.status}`);

                if (statusData.status === "COMPLETE") {
                  clearInterval(pollInterval);
                  resolve();
                } else if (statusData.status.startsWith("ERROR")) {
                  clearInterval(pollInterval);
                  reject(new Error(`${fileObj.file.name}: ${statusData.status}`));
                }
              }
            } catch (err) {
              console.error("Polling error", err);
            }
          }, 2000);
        } catch (err) {
          reject(err);
        }
      });
    };

    try {
      for (let i = 0; i < historicalPdfs.length; i++) {
        await uploadAndPoll(historicalPdfs[i], i, historicalPdfs.length);
      }

      setProcessingMessage("Starting Prediction Pipeline...");
      const predictData = new FormData();
      predictData.append("company", companyName);
      if (cutOffDate) predictData.append("cut_off_date", cutOffDate);
      if (searchQueries) predictData.append("search_queries", searchQueries);
      
      financialStats.forEach(f => {
          predictData.append("historical_fin_files", f.file);
          predictData.append("historical_fin_quarters", `${f.quarter}-${f.year}`);
      });

      if (currentQuarterStats.length > 0) {
          predictData.append("current_fin_file", currentQuarterStats[0].file);
      }
      
      if (currentQuarterEc.length > 0) {
          predictData.append("current_quarter", `${currentQuarterEc[0].quarter}-${currentQuarterEc[0].year}`);
      } else if (currentQuarterStats.length > 0) {
          predictData.append("current_quarter", `${currentQuarterStats[0].quarter}-${currentQuarterStats[0].year}`);
      }
      
      if (currentQuarterEc.length > 0) {
          predictData.append("current_ec_file", currentQuarterEc[0].file);
      }
      
      const pResp = await fetch(`${API_URL}/api/pipeline/predict`, {
          method: "POST",
          body: predictData,
      });
      const pData = await pResp.json();
      const pTaskId = pData.task_id;

      const pollPipeline = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_URL}/api/pipeline/tasks/${pTaskId}`);
          const statusData = await statusRes.json();
          if (statusRes.ok) {
            setProcessingMessage(`Pipeline: ${statusData.status}`);
            if (statusData.status === "COMPLETE") {
              clearInterval(pollPipeline);
              setProcessingMessage("Pipeline generation complete!");
              setIsProcessing(false);
              setHistoricalPdfs([]);
              setFinancialStats([]);
              setCurrentQuarterStats([]);
              setCurrentQuarterEc([]);
              setTimeout(() => setProcessingMessage(""), 5000);
            } else if (statusData.status.startsWith("ERROR")) {
              clearInterval(pollPipeline);
              alert(`Pipeline Failed: ${statusData.status}`);
              setIsProcessing(false);
            }
          }
        } catch (err) {
          console.error("Pipeline polling error", err);
        }
      }, 2000);

    } catch (error: any) {
      alert(`Process aborted: ${error.message}`);
      setIsProcessing(false);
      setProcessingMessage("");
    }
  };

  const handleSaveQuestion = async () => {
    if (!editingQuestion) return;
    try {
      if (isAddMode) {
        const payload = {
          company_name: reviewCompany,
          period: editingQuestion.period,
          question: editingQuestion.question || "",
          questionTopics: editingQuestion.questionTopics || "",
          answer: editingQuestion.answer || "",
          answerSummary: editingQuestion.answerSummary || "",
          keyPoints: editingQuestion.keyPoints || "",
          answeredBy: editingQuestion.answeredBy || "",
          category: editingQuestion.category || "General"
        };
        const res = await fetch(`${API_URL}/api/actual-questions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error("Failed to add question");
        const newRecord = await res.json();
        setActualQuestions((prev) => [newRecord, ...prev]);
      } else {
        const payload = {
          question: editingQuestion.question,
          questionTopics: editingQuestion.questionTopics,
          answer: editingQuestion.answer,
          answerSummary: editingQuestion.answerSummary,
          keyPoints: editingQuestion.keyPoints,
          answeredBy: editingQuestion.answeredBy,
          category: editingQuestion.category
        };
        const res = await fetch(`${API_URL}/api/actual-questions/${editingQuestion.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error("Failed to update question");
        
        setActualQuestions((prev) =>
          prev.map((q) => (q.id === editingQuestion.id ? { ...q, ...payload } : q)),
        );
      }
      setEditingQuestion(null);
      setIsAddMode(false);
    } catch (err: any) {
      alert("Error saving: " + err.message);
    }
  };

  const handleDeleteQuestion = async () => {
    if (!editingQuestion) return;
    if (isAddMode) {
      setEditingQuestion(null);
      setIsAddMode(false);
      return;
    }
    if (!window.confirm("Are you sure you want to delete this actual question permanently?")) return;
    
    try {
      const res = await fetch(`${API_URL}/api/actual-questions/${editingQuestion.id}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Failed to delete question");
      setActualQuestions((prev) =>
        prev.filter((q) => q.id !== editingQuestion.id),
      );
      setEditingQuestion(null);
      setIsAddMode(false);
    } catch (err: any) {
      alert("Error deleting: " + err.message);
    }
  };

  const handleAddRecordClick = (period: string) => {
    setIsAddMode(true);
    setEditingQuestion({
      id: Math.random().toString(36).substring(7),
      period: period,
      question: "",
      questionTopics: "",
      answer: "",
      answerSummary: "",
      keyPoints: "",
      answeredBy: "",
      category: "",
    });
  };

  const handleSaveComparison = () => {
    if (!editingComparison) return;
    setComparisonState(prev => 
      prev.map(c => c.id === editingComparison.id ? editingComparison : c)
    );
    setEditingComparison(null);
  };

  const handleSavePredictedQuestion = () => {
    if (!editingPredictedQuestion) return;
    if (isAddPredictedMode) {
      setPredictedQuestions((prev) => [editingPredictedQuestion, ...prev]);
    } else {
      setPredictedQuestions((prev) =>
        prev.map((q) => (q.id === editingPredictedQuestion.id ? editingPredictedQuestion : q)),
      );
    }
    setEditingPredictedQuestion(null);
    setIsAddPredictedMode(false);
  };

  const handleDeletePredictedQuestion = () => {
    if (!editingPredictedQuestion) return;
    setPredictedQuestions((prev) =>
      prev.filter((q) => q.id !== editingPredictedQuestion.id),
    );
    setEditingPredictedQuestion(null);
    setIsAddPredictedMode(false);
  };

  const handleAddPredictedRecordClick = () => {
    setIsAddPredictedMode(true);
    setEditingPredictedQuestion({
      id: Math.random().toString(36).substring(7),
      question: "",
      answer: "",
      category: "",
      risk: "Medium",
    });
  };

  const isFormValid =
    companyName.trim() !== "" &&
    historicalPdfs.length > 0;

  return (
    <div className="p-6 space-y-6 max-w-[1800px] mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-[#002850] mb-2">
          Admin Panel
        </h1>
        <p className="text-slate-600">
          Configure company details and upload relevant intelligence documents.
        </p>
      </div>

      <Tabs defaultValue="generate" className="w-full" onValueChange={(tab) => { if (tab === "review" || tab === "delete-company") fetchCompanies(); }}>
        <TabsList className="mb-10 grid grid-cols-4 w-full gap-3 bg-transparent p-0 h-auto">
          <TabsTrigger
            value="generate"
            className="group relative flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-[#002850]/30 data-[state=active]:border-[#002850] data-[state=active]:bg-[#002850] data-[state=active]:shadow-lg data-[state=active]:shadow-[#002850]/20 data-[state=active]:scale-[1.02]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 group-data-[state=active]:bg-white/15 transition-colors">
              <Upload className="w-5 h-5 text-slate-500 group-data-[state=active]:text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-600 group-data-[state=active]:text-white">Generate Q&amp;A</span>
            <span className="text-[10px] text-slate-400 group-data-[state=active]:text-blue-200 leading-tight text-center">Upload &amp; extract transcripts</span>
          </TabsTrigger>

          <TabsTrigger
            value="review"
            className="group relative flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-[#002850]/30 data-[state=active]:border-[#002850] data-[state=active]:bg-[#002850] data-[state=active]:shadow-lg data-[state=active]:shadow-[#002850]/20 data-[state=active]:scale-[1.02]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 group-data-[state=active]:bg-white/15 transition-colors">
              <FileSpreadsheet className="w-5 h-5 text-slate-500 group-data-[state=active]:text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-600 group-data-[state=active]:text-white">Review Q&amp;A</span>
            <span className="text-[10px] text-slate-400 group-data-[state=active]:text-blue-200 leading-tight text-center">Browse &amp; edit Q&amp;A records</span>
          </TabsTrigger>

          <TabsTrigger
            value="users"
            className="group relative flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-[#002850]/30 data-[state=active]:border-[#002850] data-[state=active]:bg-[#002850] data-[state=active]:shadow-lg data-[state=active]:shadow-[#002850]/20 data-[state=active]:scale-[1.02]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 group-data-[state=active]:bg-white/15 transition-colors">
              <UserPlus className="w-5 h-5 text-slate-500 group-data-[state=active]:text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-600 group-data-[state=active]:text-white">Manage Users</span>
            <span className="text-[10px] text-slate-400 group-data-[state=active]:text-blue-200 leading-tight text-center">Add &amp; manage user accounts</span>
          </TabsTrigger>

          <TabsTrigger
            value="delete-company"
            className="group relative flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-red-400/40 data-[state=active]:border-red-700 data-[state=active]:bg-red-700 data-[state=active]:shadow-lg data-[state=active]:shadow-red-700/20 data-[state=active]:scale-[1.02]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 group-data-[state=active]:bg-white/15 transition-colors">
              <Trash2 className="w-5 h-5 text-red-500 group-data-[state=active]:text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-600 group-data-[state=active]:text-white">Delete Company</span>
            <span className="text-[10px] text-slate-400 group-data-[state=active]:text-red-200 leading-tight text-center">Remove all company data</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card className="border-slate-200 shadow-sm max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="text-xl text-[#8B1319]">
                Create New User
              </CardTitle>
              <CardDescription>
                Provision a new account for an employee. They will be able to log in securely.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={userFirstName}
                      onChange={(e) => setUserFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={userLastName}
                      onChange={(e) => setUserLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Temporary Password</Label>
                  <Input
                    id="password"
                    type="text"
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label>System Role</Label>
                  <Select value={userRole} onValueChange={setUserRole}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Standard User</SelectItem>
                      <SelectItem value="admin">Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {userMessage && (
                  <div className={`p-3 rounded-md text-sm ${userMessage.includes("success") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                    {userMessage}
                  </div>
                )}
                <Button type="submit" disabled={isCreatingUser} className="w-full bg-[#002850] hover:bg-[#002850]/90">
                  {isCreatingUser ? "Provisioning..." : "Create Account"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="delete-company">
          <DeleteCompanyTab companies={availableCompanies} onDeleted={(name) => setAvailableCompanies(prev => prev.filter(c => c !== name))} />
        </TabsContent>

        <TabsContent value="review">
          <div className="space-y-6">
            <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-slate-200">
              <span className="font-medium text-slate-700">Company:</span>
              <Select value={reviewCompany} onValueChange={setReviewCompany}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select Company" />
                </SelectTrigger>
                <SelectContent>
                  {availableCompanies.length > 0 ? (
                    availableCompanies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)
                  ) : (
                    <SelectItem value="none" disabled>No companies available</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl text-[#8B1319]">
                  Actual Questions Review
                </CardTitle>
                <CardDescription>
                  Review the Q&A from the selected company's latest earnings
                  call
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={activeReviewQuarter} onValueChange={setActiveReviewQuarter}>
                  <div className="flex justify-between items-center mb-4">
                    <TabsList className="flex overflow-x-auto max-w-[60vw] scrollbar-hide">
                      {availableReviewQuarters.map(qtr => (
                        <TabsTrigger key={qtr} value={qtr} className="shrink-0">{qtr}</TabsTrigger>
                      ))}
                    </TabsList>
                    <Button onClick={() => handleAddRecordClick(activeReviewQuarter)} className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300">
                      <Plus className="w-4 h-4 mr-2" /> Add Record
                    </Button>
                  </div>
                  
                  {actualQuestionsLoading ? (
                    <div className="flex justify-center p-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#ED232A]"></div></div>
                  ) : availableReviewQuarters.length === 0 ? (
                    <div className="border rounded-lg p-10 text-center text-slate-500">
                      No Actual Questions found for this company. Upload a Historical PDF above!
                    </div>
                  ) : (
                    availableReviewQuarters.map(qtr => {
                      const qtrQuestions = actualQuestions.filter(q => q.period === qtr);
                      return (
                        <TabsContent key={qtr} value={qtr} className="mt-0">
                          <div className="border rounded-lg overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="min-w-[200px]">Question</TableHead>
                                  <TableHead className="min-w-[150px]">Question Topics</TableHead>
                                  <TableHead className="min-w-[200px]">Answer</TableHead>
                                  <TableHead className="min-w-[150px]">Answer Summary</TableHead>
                                  <TableHead className="min-w-[150px]">Key Points</TableHead>
                                  <TableHead className="w-[120px]">Answered By</TableHead>
                                  <TableHead className="w-[100px]">Category</TableHead>
                                  <TableHead className="w-[80px]">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {qtrQuestions.length > 0 ? (
                                  qtrQuestions.map((row) => (
                                    <TableRow key={row.id}>
                                      <TableCell className="text-sm font-medium">
                                        <div className="max-w-[40ch] truncate" title={row.question}>{row.question}</div>
                                      </TableCell>
                                      <TableCell className="text-sm text-slate-600">
                                        <div className="max-w-[30ch] truncate" title={row.questionTopics}>{row.questionTopics || "-"}</div>
                                      </TableCell>
                                      <TableCell className="text-sm text-slate-600">
                                        <div className="max-w-[50ch] truncate" title={row.answer}>{row.answer}</div>
                                      </TableCell>
                                      <TableCell className="text-sm text-slate-600">
                                        <div className="max-w-[30ch] truncate" title={row.answerSummary}>{row.answerSummary || "-"}</div>
                                      </TableCell>
                                      <TableCell className="text-sm text-slate-600">
                                        <div className="max-w-[30ch] truncate" title={row.keyPoints}>{row.keyPoints || "-"}</div>
                                      </TableCell>
                                      <TableCell className="text-sm">{row.answeredBy}</TableCell>
                                      <TableCell>
                                        <Badge variant="outline" className="text-xs">{row.category}</Badge>
                                      </TableCell>
                                      <TableCell>
                                        <Button variant="ghost" size="sm" onClick={() => setEditingQuestion(row)}>
                                          <Edit className="w-4 h-4 text-slate-500 hover:text-slate-700" />
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))
                                ) : (
                                  <TableRow>
                                    <TableCell colSpan={8} className="h-24 text-center text-slate-500">
                                      No Q&A data available for {qtr}.
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </TabsContent>
                      );
                    })
                  )}
                </Tabs>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl text-[#8B1319]">
                  Predicted Questions Review
                </CardTitle>
                <CardDescription>
                  Review the questions predicted for the selected company's upcoming earnings call
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-center mb-4">
                  <div className="flex overflow-x-auto">
                    {availablePredictedQuarters.length > 0 ? (
                      <div className="inline-flex h-10 items-center justify-center rounded-md bg-slate-100 p-1 text-slate-500">
                        {availablePredictedQuarters.map(qtr => (
                          <button
                            key={qtr}
                            onClick={() => setActivePredictedQuarter(qtr)}
                            className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all shrink-0 ${
                              activePredictedQuarter === qtr
                                ? 'bg-white text-slate-950 shadow-sm'
                                : 'hover:bg-white/50 hover:text-slate-700'
                            }`}
                          >
                            {qtr}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="inline-flex h-10 items-center justify-center rounded-md bg-slate-100 p-1 text-slate-500">
                        <div className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium bg-white text-slate-950 shadow-sm cursor-default select-none">
                          No data
                        </div>
                      </div>
                    )}
                  </div>
                  <Button onClick={handleAddPredictedRecordClick} className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300">
                    <Plus className="w-4 h-4 mr-2" /> Add Record
                  </Button>
                </div>
                
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[250px]">Question</TableHead>
                        <TableHead className="min-w-[300px]">Answer</TableHead>
                        <TableHead className="w-[100px]">Risk</TableHead>
                        <TableHead className="w-[150px]">Category</TableHead>
                        <TableHead className="w-[80px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {predictedQuestionsLoading ? (
                        <TableRow><TableCell colSpan={5} className="h-24 text-center"><div className="flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#ED232A]"></div></div></TableCell></TableRow>
                      ) : predictedQuestions.filter(q => q.period === activePredictedQuarter).length > 0 ? (
                        predictedQuestions.filter(q => q.period === activePredictedQuarter).map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="text-sm font-medium">
                              <div className="max-w-[55ch] truncate" title={row.question}>{row.question}</div>
                            </TableCell>
                            <TableCell className="text-sm text-slate-600">
                              <div className="max-w-[67ch] truncate" title={row.answer}>{row.answer}</div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-xs ${row.risk === 'High' ? 'bg-red-50 text-red-700 border-red-200' : row.risk === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                                {row.risk}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{row.category}</Badge>
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" onClick={() => setEditingPredictedQuestion(row)}>
                                <Edit className="w-4 h-4 text-slate-500 hover:text-slate-700" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center text-slate-500">
                            {!reviewCompany
                              ? "Select a company above to view predicted questions."
                              : "No predicted questions found. Run the Generate Q&A pipeline to create predictions."}
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
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-start mb-4">
                  <div className="space-y-4">
                    <div className="flex overflow-x-auto">
                      {availableComparisonQuarters.length > 0 ? (
                        <div className="inline-flex h-10 items-center justify-center rounded-md bg-slate-100 p-1 text-slate-500">
                          {availableComparisonQuarters.map(qtr => (
                            <button
                              key={qtr}
                              onClick={() => setActiveComparisonQuarter(qtr)}
                              className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all shrink-0 ${
                                activeComparisonQuarter === qtr
                                  ? 'bg-white text-slate-950 shadow-sm'
                                  : 'hover:bg-white/50 hover:text-slate-700'
                              }`}
                            >
                              {qtr}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="inline-flex h-10 items-center justify-center rounded-md bg-slate-100 p-1 text-slate-500">
                          <div className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium bg-white text-slate-950 shadow-sm cursor-default select-none">
                            No data
                          </div>
                        </div>
                      )}
                    </div>
                    {(() => {
                      const filteredByQuarter = comparisonState.filter(d => d.period === activeComparisonQuarter);
                      return (
                        <Tabs value={activeComparisonTab} onValueChange={setActiveComparisonTab}>
                          <TabsList>
                            <TabsTrigger value="all">All ({filteredByQuarter.length})</TabsTrigger>
                            <TabsTrigger value="correct">Correct Predictions ({filteredByQuarter.filter(d => d.wasAsked && d.predictedQuestion).length})</TabsTrigger>
                            <TabsTrigger value="missed">Missed ({filteredByQuarter.filter(d => d.feedback === 'missed-actual' || (d.wasAsked && !d.predictedQuestion)).length})</TabsTrigger>
                            <TabsTrigger value="false">False Positives ({filteredByQuarter.filter(d => !d.wasAsked).length})</TabsTrigger>
                          </TabsList>
                        </Tabs>
                      );
                    })()}
                  </div>
                  <Button className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 mt-[52px]">
                    Calculate Similarity
                  </Button>
                </div>

                <div className="border rounded-lg overflow-hidden mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">Status</TableHead>
                        <TableHead className="min-w-[300px]">Predicted Question</TableHead>
                        <TableHead className="min-w-[300px]">Actual Question</TableHead>
                        <TableHead className="w-[150px]">Similarity</TableHead>
                        <TableHead className="w-[80px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comparisonLoading ? (
                        <TableRow><TableCell colSpan={5} className="h-24 text-center"><div className="flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#ED232A]"></div></div></TableCell></TableRow>
                      ) : (
                        comparisonState
                          .filter(d => d.period === activeComparisonQuarter)
                          .filter(d => {
                            if (activeComparisonTab === "all") return true;
                            if (activeComparisonTab === "correct") return d.wasAsked && d.predictedQuestion;
                            if (activeComparisonTab === "missed") return d.feedback === 'missed-actual' || (d.wasAsked && !d.predictedQuestion);
                            if (activeComparisonTab === "false") return !d.wasAsked;
                            return true;
                          })
                          .length > 0 ? (
                            comparisonState
                              .filter(d => d.period === activeComparisonQuarter)
                              .filter(d => {
                                if (activeComparisonTab === "all") return true;
                                if (activeComparisonTab === "correct") return d.wasAsked && d.predictedQuestion;
                                if (activeComparisonTab === "missed") return d.feedback === 'missed-actual' || (d.wasAsked && !d.predictedQuestion);
                                if (activeComparisonTab === "false") return !d.wasAsked;
                                return true;
                              })
                              .map((row) => (
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
                                    {row.predictedQuestion || <span className="text-slate-400 italic">Not predicted</span>}
                                  </TableCell>
                                  <TableCell className="text-sm">
                                    {row.actualPhrasing || <span className="text-slate-400 italic">Not asked</span>}
                                  </TableCell>
                                  <TableCell>
                                    {row.similarity > 0 ? (
                                      <div className="flex items-center gap-2">
                                        <Progress value={row.similarity} className="w-12 h-2" />
                                        <span className="text-sm font-medium">{row.similarity}%</span>
                                      </div>
                                    ) : (
                                      <span className="text-slate-400 text-sm">N/A</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Button variant="ghost" size="sm" onClick={() => setEditingComparison(row)}>
                                      <Edit className="w-4 h-4 text-slate-500 hover:text-slate-700" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={5} className="h-24 text-center text-slate-500">
                                {!reviewCompany
                                  ? "Select a company above to view predicted vs actual comparisons."
                                  : "No comparison data found. Run the Extract Q&A and Generate Q&A pipelines."}
                              </TableCell>
                            </TableRow>
                          )
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          <Dialog
            open={!!editingComparison}
            onOpenChange={(open) => {
              if (!open) {
                setEditingComparison(null);
              }
            }}
          >
            <DialogContent className="!max-w-[90vw] w-[90vw] h-[78vh] max-h-[85vh] overflow-y-auto overflow-x-hidden">
              <DialogHeader className="flex flex-row items-center justify-between pr-8 mt-2">
                <div className="space-y-1">
                  <DialogTitle>Edit Comparison Record</DialogTitle>
                  <DialogDescription>
                    Modify the predicted vs actual question comparison details.
                  </DialogDescription>
                </div>
              </DialogHeader>
              
              {editingComparison && (
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Predicted Question</Label>
                    <Textarea 
                      value={editingComparison.predictedQuestion}
                      onChange={(e) => setEditingComparison({...editingComparison, predictedQuestion: e.target.value})}
                      className="min-h-[80px] break-words [overflow-wrap:anywhere]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Actual Question</Label>
                    <Textarea 
                      value={editingComparison.actualPhrasing}
                      onChange={(e) => setEditingComparison({...editingComparison, actualPhrasing: e.target.value})}
                      className="min-h-[80px] break-words [overflow-wrap:anywhere]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Similarity (%)</Label>
                      <Input 
                        type="number"
                        min="0"
                        max="100"
                        value={editingComparison.similarity}
                        onChange={(e) => setEditingComparison({...editingComparison, similarity: parseInt(e.target.value) || 0})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Was Asked</Label>
                      <Select 
                        value={editingComparison.wasAsked ? "yes" : "no"}
                        onValueChange={(val) => setEditingComparison({...editingComparison, wasAsked: val === "yes"})}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingComparison(null)}>Cancel</Button>
                <Button className="bg-[#ED232A] hover:bg-[#C11B22] text-white" onClick={handleSaveComparison}>Save Changes</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
                    <Label>Question Topics</Label>
                    <Input
                      value={editingQuestion.questionTopics || ""}
                      onChange={(e) =>
                        setEditingQuestion({
                          ...editingQuestion,
                          questionTopics: e.target.value,
                        })
                      }
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
                      className="min-h-[120px] break-words [overflow-wrap:anywhere]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Answer Summary</Label>
                      <Textarea
                        value={editingQuestion.answerSummary || ""}
                        onChange={(e) =>
                          setEditingQuestion({
                            ...editingQuestion,
                            answerSummary: e.target.value,
                          })
                        }
                        className="min-h-[80px] break-words [overflow-wrap:anywhere]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Key Points</Label>
                      <Textarea
                        value={editingQuestion.keyPoints || ""}
                        onChange={(e) =>
                          setEditingQuestion({
                            ...editingQuestion,
                            keyPoints: e.target.value,
                          })
                        }
                        className="min-h-[80px] break-words [overflow-wrap:anywhere]"
                      />
                    </div>
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

          <Dialog
            open={!!editingPredictedQuestion}
            onOpenChange={(open) => {
              if (!open) {
                setEditingPredictedQuestion(null);
                setIsAddPredictedMode(false);
              }
            }}
          >
            <DialogContent className="!max-w-[90vw] w-[90vw] h-[78vh] max-h-[85vh] overflow-y-auto overflow-x-hidden">
              <DialogHeader className="flex flex-row items-center justify-between pr-8 mt-2">
                <div className="space-y-1">
                  <DialogTitle>{isAddPredictedMode ? "Add Predicted Question" : "Edit Predicted Question"}</DialogTitle>
                  <DialogDescription>
                    {isAddPredictedMode ? "Manually add a predicted question for the upcoming call." : "Modify the predicted question."}
                  </DialogDescription>
                </div>
                {!isAddPredictedMode && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDeletePredictedQuestion}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 mt-0"
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Delete Row
                  </Button>
                )}
              </DialogHeader>

              {editingPredictedQuestion && (
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Question</Label>
                    <Textarea
                      value={editingPredictedQuestion.question}
                      onChange={(e) =>
                        setEditingPredictedQuestion({
                          ...editingPredictedQuestion,
                          question: e.target.value,
                        })
                      }
                      className="min-h-[80px] break-words [overflow-wrap:anywhere]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Answer (if provided)</Label>
                    <Textarea
                      value={editingPredictedQuestion.answer}
                      onChange={(e) =>
                        setEditingPredictedQuestion({
                          ...editingPredictedQuestion,
                          answer: e.target.value,
                        })
                      }
                      className="min-h-[220px] break-words [overflow-wrap:anywhere]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Risk</Label>
                      <Select
                        value={editingPredictedQuestion.risk}
                        onValueChange={(val) => 
                          setEditingPredictedQuestion({
                            ...editingPredictedQuestion,
                            risk: val,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Risk" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="High">High</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="Low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Input
                        value={editingPredictedQuestion.category}
                        onChange={(e) =>
                          setEditingPredictedQuestion({
                            ...editingPredictedQuestion,
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
                  onClick={() => { setEditingPredictedQuestion(null); setIsAddPredictedMode(false); }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSavePredictedQuestion}
                  className="bg-[#ED232A] hover:bg-[#C11B22] text-white"
                >
                  {isAddPredictedMode ? "Add Record" : "Save Changes"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="generate">
          <div className="space-y-6">
            {/* Section 1: Company Name */}
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-xl text-[#8B1319]">
                  Company Profile
                </CardTitle>
                <CardDescription>
                  Enter the target company name for analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-w-md">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input
                    id="companyName"
                    placeholder="e.g. Apple Inc, Microsoft, etc."
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="focus:border-[#ED232A] focus:ring-[#ED232A]"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Section 2: Historical Earnings Call PDFs */}
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl text-[#8B1319]">
                  <FileText className="h-5 w-5" />
                  Historical Earnings Call Transcripts
                </CardTitle>
                <CardDescription>
                  Upload historical PDFs and assign them to the correct year and
                  quarter
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 bg-slate-50/50 hover:bg-slate-50 transition-colors text-center">
                  <Input
                    type="file"
                    id="upload-historical"
                    multiple
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) =>
                      handleFileUpload(e, setHistoricalPdfs, historicalPdfs)
                    }
                  />
                  <Label
                    htmlFor="upload-historical"
                    className="cursor-pointer flex flex-col items-center"
                  >
                    <div className="h-12 w-12 rounded-full bg-[#ED232A]/10 flex items-center justify-center mb-4">
                      <Upload className="h-6 w-6 text-[#ED232A]" />
                    </div>
                    <span className="font-medium text-[#8B1319]">
                      Click to browse files
                    </span>
                    <span className="text-sm text-slate-500 mt-1">
                      or drag and drop PDF documents here
                    </span>
                  </Label>
                </div>
                {renderFileList(
                  historicalPdfs,
                  setHistoricalPdfs,
                  <FileText className="h-5 w-5" />,
                )}
              </CardContent>
            </Card>

            {/* Section 2.5: Current Quarter Earnings Call */}
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl text-[#8B1319]">
                  <FileText className="h-5 w-5" />
                  Current Quarter Earnings Call
                </CardTitle>
                <CardDescription>
                  Upload the current quarter earnings call transcript
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 bg-slate-50/50 hover:bg-slate-50 transition-colors text-center">
                  <Input
                    type="file"
                    id="upload-current-ec"
                    multiple
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) =>
                      handleFileUpload(e, setCurrentQuarterEc, currentQuarterEc)
                    }
                  />
                  <Label
                    htmlFor="upload-current-ec"
                    className="cursor-pointer flex flex-col items-center"
                  >
                    <div className="h-12 w-12 rounded-full bg-[#ED232A]/10 flex items-center justify-center mb-4">
                      <Upload className="h-6 w-6 text-[#ED232A]" />
                    </div>
                    <span className="font-medium text-[#8B1319]">
                      Click to browse files
                    </span>
                    <span className="text-sm text-slate-500 mt-1">
                      or drag and drop PDF documents here
                    </span>
                  </Label>
                </div>
                {renderFileList(
                  currentQuarterEc,
                  setCurrentQuarterEc,
                  <FileText className="h-5 w-5" />,
                )}
              </CardContent>
            </Card>

            {/* Section 3: Financial Statement PDFs */}
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl text-[#8B1319]">
                  <BarChart className="h-5 w-5" />
                  Historical Financial Statements
                </CardTitle>
                <CardDescription>
                  Upload supplementary financial statements and proxy materials
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 bg-slate-50/50 hover:bg-slate-50 transition-colors text-center">
                  <Input
                    type="file"
                    id="upload-financial"
                    multiple
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) =>
                      handleFileUpload(e, setFinancialStats, financialStats)
                    }
                  />
                  <Label
                    htmlFor="upload-financial"
                    className="cursor-pointer flex flex-col items-center"
                  >
                    <div className="h-12 w-12 rounded-full bg-[#ED232A]/10 flex items-center justify-center mb-4">
                      <Upload className="h-6 w-6 text-[#ED232A]" />
                    </div>
                    <span className="font-medium text-[#8B1319]">
                      Click to browse files
                    </span>
                    <span className="text-sm text-slate-500 mt-1">
                      or drag and drop PDF documents here
                    </span>
                  </Label>
                </div>
                {renderFileList(
                  financialStats,
                  setFinancialStats,
                  <BarChart className="h-5 w-5" />,
                )}
              </CardContent>
            </Card>

            {/* Section 4: Current Quarter Financial Statements */}
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl text-[#8B1319]">
                  <FileSpreadsheet className="h-5 w-5" />
                  Current Quarter Financial Statements
                </CardTitle>
                <CardDescription>
                  Upload the target earnings quarter reporting materials
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 bg-slate-50/50 hover:bg-slate-50 transition-colors text-center">
                  <Input
                    type="file"
                    id="upload-current"
                    multiple
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) =>
                      handleFileUpload(
                        e,
                        setCurrentQuarterStats,
                        currentQuarterStats,
                      )
                    }
                  />
                  <Label
                    htmlFor="upload-current"
                    className="cursor-pointer flex flex-col items-center"
                  >
                    <div className="h-12 w-12 rounded-full bg-[#ED232A]/10 flex items-center justify-center mb-4">
                      <Upload className="h-6 w-6 text-[#ED232A]" />
                    </div>
                    <span className="font-medium text-[#8B1319]">
                      Click to browse files
                    </span>
                    <span className="text-sm text-slate-500 mt-1">
                      or drag and drop PDF documents here
                    </span>
                  </Label>
                </div>
                {renderFileList(
                  currentQuarterStats,
                  setCurrentQuarterStats,
                  <FileSpreadsheet className="h-5 w-5" />,
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-xl text-[#8B1319]">
                  Cut-off Date
                </CardTitle>
                <CardDescription>
                  Optional: Specify a cut-off date for generating answers and context.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Input
                  type="date"
                  value={cutOffDate}
                  max="2099-12-31"
                  onChange={(e) => setCutOffDate(e.target.value)}
                  className="max-w-xs block w-full [&::-webkit-calendar-picker-indicator]:ml-auto [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                />
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-xl text-[#8B1319]">
                  Search Queries
                </CardTitle>
                <CardDescription>
                  Modify the initial Tavily search queries if needed. Each line is treated as a separate query. {"{company}"} and {"{cutoff}"} will be dynamically injected.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <textarea
                  value={searchQueries}
                  onChange={(e) => setSearchQueries(e.target.value)}
                  className="flex min-h-[140px] w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8B1319]/20 focus:border-[#8B1319] transition-all disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Enter one query per line..."
                />
              </CardContent>
            </Card>

            {/* Action Bar */}
            <div className="flex flex-col items-end pt-4 mb-20">
              <Button
                onClick={handleSave}
                disabled={!isFormValid || isProcessing}
                className="bg-[#ED232A] hover:bg-[#C11B22] text-white px-8 py-6 text-lg rounded-xl shadow-lg hover:shadow-xl transition-all font-medium disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
              >
                {isProcessing ? (
                  <div className="h-5 w-5 mr-2 animate-spin rounded-full border-b-2 border-white"></div>
                ) : (
                  <Save className="h-5 w-5 mr-2" />
                )}
                {isProcessing ? "Processing..." : "Submit and Generate Q&A"}
              </Button>
              {processingMessage && (
                <div className={`mt-3 text-sm font-medium px-4 py-2 rounded-lg ${processingMessage.includes("complete") ? "bg-green-100 text-green-800" : "bg-blue-50 text-blue-700 animate-pulse"}`}>
                  {processingMessage}
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}


