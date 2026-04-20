import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import {
  TrendingUp,
  TrendingDown,
  ArrowLeft,
  MessageSquare,
  Sparkles,
  Send,
  Bot,
  User,
  FileText,
  Loader2,
  AlertTriangle,
  Zap,
  Shield,
  Eye,
  Minus,
  Trash2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { ScrollArea } from "../components/ui/scroll-area";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import {
  fetchCompanies,
  fetchKeyTopics,
  fetchAvailableQuarters,
  fetchQuarterDetail,
  generateQuarterSummary,
  sendHistoricalChat,
  fetchDocumentCatalog,
  deleteDocument,
  getAccessToken,
  type TopicWeight,
  type QuarterSummaryInfo,
  type QuarterDetailResponse,
  type DocumentCatalogRow,
} from "../utils/api";

interface ChatMessage {
  id: number;
  type: "user" | "ai";
  text: string;
  timestamp: Date;
}

const IMPORTANCE_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-800 border-red-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-green-100 text-green-800 border-green-200",
};

const SIGNAL_ICONS: Record<string, typeof AlertTriangle> = {
  risk: AlertTriangle,
  driver: Zap,
  confidence: Shield,
  forward_looking: Eye,
};

const TOPIC_COLORS = ["#ED232A", "#DC2626", "#B91C1C", "#991B1B", "#7F1D1D"];

export default function HistoricalIntelligenceHub() {
  const navigate = useNavigate();

  // Company selection
  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState("");

  // Key topics
  const [topics, setTopics] = useState<TopicWeight[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);

  // Quarters
  const [quarters, setQuarters] = useState<QuarterSummaryInfo[]>([]);
  const [selectedQuarterKey, setSelectedQuarterKey] = useState("");

  // Quarter detail
  const [quarterDetail, setQuarterDetail] = useState<QuarterDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Documents catalog (for the Documents accordion + delete)
  const [documentsCatalog, setDocumentsCatalog] = useState<DocumentCatalogRow[]>([]);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  // AI summary
  const [aiSummary, setAiSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      type: "ai",
      text: "Hello! I'm your AI assistant. Ask me anything about your historical earnings data — I'll search through uploaded documents and past Q&A to give you data-driven answers.",
      timestamp: new Date(),
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // Load companies on mount
  useEffect(() => {
    fetchCompanies()
      .then(setCompanies)
      .catch(() => {});
  }, []);

  // When company changes, load topics + quarters
  useEffect(() => {
    if (!selectedCompany) {
      setTopics([]);
      setQuarters([]);
      setQuarterDetail(null);
      setAiSummary("");
      setSelectedQuarterKey("");
      return;
    }

    setTopicsLoading(true);
    fetchKeyTopics(selectedCompany, 4)
      .then((resp) => setTopics(resp.topics))
      .catch(() => setTopics([]))
      .finally(() => setTopicsLoading(false));

    fetchAvailableQuarters(selectedCompany)
      .then((resp) => setQuarters(resp.quarters))
      .catch(() => setQuarters([]));

    const token = getAccessToken();
    if (token) {
      fetchDocumentCatalog(token)
        .then(setDocumentsCatalog)
        .catch(() => setDocumentsCatalog([]));
    } else {
      setDocumentsCatalog([]);
    }

    // Reset quarter selection
    setSelectedQuarterKey("");
    setQuarterDetail(null);
    setAiSummary("");
  }, [selectedCompany]);

  // When quarter changes, load detail
  const handleQuarterSelect = useCallback(
    async (key: string) => {
      setSelectedQuarterKey(key);
      setAiSummary("");
      if (!key || !selectedCompany) {
        setQuarterDetail(null);
        return;
      }
      const [q, fyStr] = key.split("|");
      const fy = parseInt(fyStr, 10);
      setDetailLoading(true);
      try {
        const detail = await fetchQuarterDetail(selectedCompany, fy, q);
        setQuarterDetail(detail);
      } catch {
        toast.error("Failed to load quarter details");
        setQuarterDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [selectedCompany],
  );

  // Generate AI summary
  const handleGenerateSummary = useCallback(async () => {
    if (!selectedQuarterKey || !selectedCompany) return;
    const [q, fyStr] = selectedQuarterKey.split("|");
    const fy = parseInt(fyStr, 10);
    setSummaryLoading(true);
    toast.loading("Generating AI Summary...", { id: "ai-summary" });
    try {
      const resp = await generateQuarterSummary(selectedCompany, fy, q);
      setAiSummary(resp.summary);
      toast.success("AI Summary Generated", { id: "ai-summary" });
    } catch {
      toast.error("Failed to generate summary", { id: "ai-summary" });
    } finally {
      setSummaryLoading(false);
    }
  }, [selectedQuarterKey, selectedCompany]);

  // Download summary as HTML
  const handleDownloadSummary = useCallback(() => {
    if (!aiSummary || !quarterDetail) return;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>AI Summary - ${quarterDetail.company} ${quarterDetail.quarter} FY${quarterDetail.fiscal_year}</title><style>body{font-family:system-ui;max-width:800px;margin:40px auto;padding:0 20px;color:#333}h1{color:#002850}h2{color:#ED232A;border-bottom:2px solid #ED232A;padding-bottom:8px}</style></head><body><h1>${quarterDetail.company} — ${quarterDetail.quarter} FY${quarterDetail.fiscal_year}</h1><h2>AI-Generated Summary</h2>${aiSummary.split("\n").map((p) => `<p>${p}</p>`).join("")}</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `AI-Summary-${quarterDetail.company}-${quarterDetail.quarter}-FY${quarterDetail.fiscal_year}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [aiSummary, quarterDetail]);

  // Chat submit
  const handleChatSubmit = useCallback(async () => {
    if (!chatInput.trim() || !selectedCompany) return;
    const userMsg: ChatMessage = {
      id: chatMessages.length + 1,
      type: "user",
      text: chatInput,
      timestamp: new Date(),
    };
    const updated = [...chatMessages, userMsg];
    setChatMessages(updated);
    const question = chatInput;
    setChatInput("");
    setChatLoading(true);

    // Build history for context
    const history = updated
      .filter((m) => m.id > 1) // skip initial greeting
      .map((m) => ({
        role: m.type === "user" ? "user" : "assistant",
        content: m.text,
      }));

    const [q, fyStr] = selectedQuarterKey ? selectedQuarterKey.split("|") : [undefined, undefined];
    const fy = fyStr ? parseInt(fyStr, 10) : undefined;

    try {
      const resp = await sendHistoricalChat(question, selectedCompany, q, fy, history);
      const aiMsg: ChatMessage = {
        id: updated.length + 1,
        type: "ai",
        text: resp.reply,
        timestamp: new Date(),
      };
      setChatMessages([...updated, aiMsg]);
    } catch {
      const errMsg: ChatMessage = {
        id: updated.length + 1,
        type: "ai",
        text: "Sorry, I encountered an error processing your question. Please try again.",
        timestamp: new Date(),
      };
      setChatMessages([...updated, errMsg]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatMessages, selectedCompany, selectedQuarterKey]);

  const parsedQuarter = selectedQuarterKey
    ? { quarter: selectedQuarterKey.split("|")[0], fiscal_year: parseInt(selectedQuarterKey.split("|")[1], 10) }
    : null;

  const quarterDocuments = parsedQuarter
    ? documentsCatalog.filter(
        (d) =>
          d.company.trim().toLowerCase() ===
            selectedCompany.trim().toLowerCase() &&
          d.quarter === parsedQuarter.quarter &&
          d.fiscal_year === parsedQuarter.fiscal_year,
      )
    : [];

  const handleDeleteDocument = useCallback(
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
        // Refresh quarter-dependent data so the UI reflects the removal.
        if (parsedQuarter && selectedCompany) {
          try {
            const refreshed = await fetchQuarterDetail(
              selectedCompany,
              parsedQuarter.fiscal_year,
              parsedQuarter.quarter,
            );
            setQuarterDetail(refreshed);
          } catch {
            /* ignore */
          }
          fetchAvailableQuarters(selectedCompany)
            .then((resp) => setQuarters(resp.quarters))
            .catch(() => {});
          fetchKeyTopics(selectedCompany, 4)
            .then((resp) => setTopics(resp.topics))
            .catch(() => {});
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Delete failed";
        toast.error(msg);
      } finally {
        setDeletingDocId(null);
      }
    },
    [parsedQuarter, selectedCompany],
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Button
              variant="ghost"
              onClick={() => navigate("/dashboard")}
              className="mb-3 text-[#ED232A] hover:text-[#B91C1C] hover:bg-[#FEE2E2]"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <h1 className="text-3xl font-semibold text-[#002850] mb-2">
              Historical Intelligence Hub
            </h1>
            <p className="text-slate-600">
              Explore past earnings calls with comprehensive analysis
            </p>
          </div>
        </div>

        {/* Company Selector */}
        <Card className="border-[#ED232A]/30 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <span className="font-medium text-slate-700">Company:</span>
              <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                <SelectTrigger className="w-64 border-[#ED232A]">
                  <SelectValue placeholder="Select a company..." />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {!selectedCompany && (
          <Card className="border-[#d4dce6] p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 rounded-full bg-[#FEE2E2] flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-8 h-8 text-[#ED232A]" />
              </div>
              <h3 className="text-xl font-semibold text-[#002850] mb-2">
                Select a Company to Begin
              </h3>
              <p className="text-slate-600">
                Choose a company above to explore historical earnings data, key topics, and AI-powered insights.
              </p>
            </div>
          </Card>
        )}

        {selectedCompany && (
          <>
            {/* Key Topics Word Cloud */}
            <Card className="border-[#ED232A]/30 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-[#FEE2E2] to-white border-b border-[#d4dce6]">
                <CardTitle className="text-[#002850] text-xl">
                  Key Topics — Last 4 Quarters
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {topicsLoading ? (
                  <div className="h-[200px] flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-[#ED232A]" />
                  </div>
                ) : topics.length === 0 ? (
                  <div className="h-[200px] flex items-center justify-center text-slate-500">
                    No topics found. Upload documents and run analysis first.
                  </div>
                ) : (
                  <div className="h-[250px] bg-white rounded-lg border border-[#d4dce6]/50 flex flex-wrap items-center justify-center gap-3 p-6">
                    {topics.map((topic, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: `${topic.weight * 1.2}rem`,
                          color: TOPIC_COLORS[idx % TOPIC_COLORS.length],
                        }}
                        className="font-semibold hover:opacity-70 transition-opacity cursor-pointer"
                      >
                        {topic.text}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Generate AI Summary Button */}
            <div className="flex justify-center">
              <Button
                onClick={handleGenerateSummary}
                disabled={!selectedQuarterKey || summaryLoading}
                className="bg-[#ED232A] hover:bg-[#B91C1C] text-white px-8 h-12 text-base disabled:opacity-50"
              >
                {summaryLoading ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-5 h-5 mr-2" />
                )}
                {summaryLoading ? "Generating..." : "Generate AI Summary"}
                {parsedQuarter && (
                  <span className="ml-2 text-sm">
                    ({parsedQuarter.quarter} FY{parsedQuarter.fiscal_year})
                  </span>
                )}
              </Button>
            </div>

            {/* Quarter Selection */}
            <Card className="border-[#ED232A]/30 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-[#FEE2E2] to-white border-b border-[#d4dce6]">
                <CardTitle className="text-[#002850] text-xl">
                  Select Quarter for Detailed Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {quarters.length === 0 ? (
                  <p className="text-slate-500">No quarters available for {selectedCompany}. Upload documents first.</p>
                ) : (
                  <Select value={selectedQuarterKey} onValueChange={handleQuarterSelect}>
                    <SelectTrigger className="w-full max-w-sm border-[#ED232A] h-11">
                      <SelectValue placeholder="Choose a quarter to explore..." />
                    </SelectTrigger>
                    <SelectContent>
                      {quarters.map((q) => {
                        const key = `${q.quarter}|${q.fiscal_year}`;
                        return (
                          <SelectItem key={key} value={key}>
                            {q.quarter} FY{q.fiscal_year}
                            {q.document_count > 0 && ` — ${q.document_count} doc${q.document_count > 1 ? "s" : ""}`}
                            {q.actual_qa_count > 0 && ` — ${q.actual_qa_count} Q&A`}
                            {q.has_analysis && " — Analyzed"}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
              </CardContent>
            </Card>

            {/* Loading state */}
            {detailLoading && (
              <div className="flex justify-center py-12">
                <Loader2 className="w-10 h-10 animate-spin text-[#ED232A]" />
              </div>
            )}

            {/* AI Summary — always visible once a quarter is selected */}
            {parsedQuarter && !detailLoading && (
              <Card className="border-[#ED232A]/30 shadow-lg bg-gradient-to-br from-white to-[#FEE2E2]/30">
                <CardHeader className="bg-gradient-to-r from-[#ED232A] to-[#B91C1C] text-white border-b">
                  <CardTitle className="text-xl flex items-center gap-2">
                    <Sparkles className="w-6 h-6" />
                    AI-Generated Summary — {parsedQuarter.quarter} FY{parsedQuarter.fiscal_year}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="prose prose-sm max-w-none">
                    {aiSummary ? (
                      <p className="text-slate-700 leading-relaxed whitespace-pre-line">
                        {aiSummary}
                      </p>
                    ) : (
                      <p className="text-slate-500 italic">
                        No AI summary available yet for this quarter. Upload
                        documents for {parsedQuarter.quarter} FY
                        {parsedQuarter.fiscal_year} and run analysis to generate one.
                      </p>
                    )}
                  </div>
                  {aiSummary && (
                    <div className="mt-4 pt-4 border-t border-[#d4dce6] flex gap-3">
                      <Button
                        onClick={handleDownloadSummary}
                        size="sm"
                        className="bg-[#ED232A] hover:bg-[#B91C1C] text-white"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Download Full Report
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Quarter Details — always render all five sections when a quarter is chosen */}
            {parsedQuarter && !detailLoading && (
              <Accordion
                type="multiple"
                defaultValue={[
                  "documents",
                  "questions",
                  "attendees",
                  "themes",
                  "sentiment",
                ]}
                className="space-y-4"
              >
                {/* Documents uploaded for this quarter (with delete) */}
                <AccordionItem
                  value="documents"
                  className="border rounded-lg bg-white shadow-sm"
                >
                  <AccordionTrigger className="px-6 hover:no-underline">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-[#ED232A]" />
                      <span className="font-semibold text-[#002850] text-lg">
                        Documents for {parsedQuarter.quarter} FY
                        {parsedQuarter.fiscal_year}
                      </span>
                      <Badge
                        variant="outline"
                        className="border-[#ED232A] text-[#ED232A]"
                      >
                        {quarterDocuments.length}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-6">
                    {quarterDocuments.length > 0 ? (
                      <ul className="space-y-2 pt-2">
                        {quarterDocuments.map((doc) => {
                          const label = `${doc.document_type} — ${doc.quarter} FY${doc.fiscal_year}`;
                          const busy = deletingDocId === doc.id;
                          return (
                            <li
                              key={doc.id}
                              className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[#d4dce6] bg-slate-50"
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-[#002850] truncate">
                                  {doc.document_type}
                                </div>
                                <div className="text-xs text-slate-500">
                                  Uploaded{" "}
                                  {new Date(doc.created_at).toLocaleDateString()}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() =>
                                  handleDeleteDocument(doc.id, label)
                                }
                                className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 shrink-0"
                              >
                                {busy ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <>
                                    <Trash2 className="w-4 h-4 mr-1.5" />
                                    Delete
                                  </>
                                )}
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="pt-2 text-sm text-slate-500 italic">
                        No documents uploaded for this quarter yet.
                      </p>
                    )}
                  </AccordionContent>
                </AccordionItem>

                {/* Questions Asked — from transcript extraction */}
                <AccordionItem
                  value="questions"
                  className="border rounded-lg bg-white shadow-sm"
                >
                  <AccordionTrigger className="px-6 hover:no-underline">
                    <div className="flex items-center gap-3">
                      <MessageSquare className="w-5 h-5 text-[#ED232A]" />
                      <span className="font-semibold text-[#002850] text-lg">
                        Questions Asked During Actual Earnings Call
                      </span>
                      <Badge
                        variant="outline"
                        className="border-[#ED232A] text-[#ED232A]"
                      >
                        {quarterDetail?.questions.length ?? 0}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-6">
                    {quarterDetail && quarterDetail.questions.length > 0 ? (
                      <div className="space-y-3 pt-2">
                        {quarterDetail.questions.map((q) => (
                          <div
                            key={q.id}
                            className="p-4 bg-[#FEE2E2]/50 rounded-lg border border-[#ED232A]/20"
                          >
                            <div className="font-medium text-[#002850] mb-1">
                              {q.question}
                            </div>
                            {q.answer && (
                              <p className="text-sm text-slate-600 mb-1">
                                <span className="font-medium">A:</span> {q.answer}
                              </p>
                            )}
                            <div className="flex gap-2 text-xs text-slate-500">
                              {q.answered_by && <span>{q.answered_by}</span>}
                              {q.category && (
                                <Badge variant="outline" className="text-xs">
                                  {q.category}
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="pt-2 text-sm text-slate-500 italic">
                        No analyst questions extracted yet for{" "}
                        {parsedQuarter.quarter} FY{parsedQuarter.fiscal_year}. Upload
                        the earnings call transcript (document type TR) and the
                        system will extract the Q&amp;A automatically.
                      </p>
                    )}
                  </AccordionContent>
                </AccordionItem>

                {/* Call Attendees */}
                <AccordionItem
                  value="attendees"
                  className="border rounded-lg bg-white shadow-sm"
                >
                  <AccordionTrigger className="px-6 hover:no-underline">
                    <div className="flex items-center gap-3">
                      <MessageSquare className="w-5 h-5 text-[#ED232A]" />
                      <span className="font-semibold text-[#002850] text-lg">
                        Call Attendees
                      </span>
                      <Badge
                        variant="outline"
                        className="border-[#ED232A] text-[#ED232A]"
                      >
                        {quarterDetail?.attendees.length ?? 0}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-6">
                    {quarterDetail && quarterDetail.attendees.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                        {(["management", "analyst"] as const).map((role) => {
                          const list = quarterDetail.attendees.filter(
                            (a) => a.role === role,
                          );
                          if (list.length === 0) return null;
                          return (
                            <div
                              key={role}
                              className="p-4 rounded-lg border border-[#ED232A]/20 bg-[#FEE2E2]/30"
                            >
                              <div className="text-sm font-medium text-[#002850] mb-2 capitalize">
                                {role === "management" ? "Management" : "Analysts"}
                              </div>
                              <ul className="space-y-1">
                                {list.map((a, idx) => (
                                  <li
                                    key={`${role}-${idx}`}
                                    className="text-sm text-slate-700 flex items-start gap-2"
                                  >
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#ED232A] mt-1.5 flex-shrink-0" />
                                    {a.name}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="pt-2 text-sm text-slate-500 italic">
                        Attendees are derived from the extracted analyst Q&amp;A.
                        They will appear once a transcript (TR) is uploaded and
                        processed for this quarter.
                      </p>
                    )}
                  </AccordionContent>
                </AccordionItem>

                {/* Key Themes */}
                <AccordionItem
                  value="themes"
                  className="border rounded-lg bg-white shadow-sm"
                >
                  <AccordionTrigger className="px-6 hover:no-underline">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-[#ED232A]" />
                      <span className="font-semibold text-[#002850] text-lg">
                        Key Discussion Themes
                      </span>
                      <Badge
                        variant="outline"
                        className="border-[#ED232A] text-[#ED232A]"
                      >
                        {quarterDetail?.themes.length ?? 0}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-6">
                    {quarterDetail && quarterDetail.themes.length > 0 ? (
                      <div className="pt-2 flex flex-wrap gap-2">
                        {quarterDetail.themes.map((theme, idx) => (
                          <Badge
                            key={idx}
                            className={`px-3 py-1.5 ${IMPORTANCE_COLORS[theme.importance] || "bg-[#FEE2E2] text-[#ED232A] border-[#ED232A]/30"}`}
                          >
                            {theme.name}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="pt-2 text-sm text-slate-500 italic">
                        Themes are generated by running Analysis on uploaded
                        documents for this quarter.
                      </p>
                    )}
                  </AccordionContent>
                </AccordionItem>

                {/* Signals & Risks */}
                {quarterDetail.signals.length > 0 && (
                  <AccordionItem
                    value="signals"
                    className="border rounded-lg bg-white shadow-sm"
                  >
                    <AccordionTrigger className="px-6 hover:no-underline">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-[#ED232A]" />
                        <span className="font-semibold text-[#002850] text-lg">
                          Signals & Risks
                        </span>
                        <Badge
                          variant="outline"
                          className="border-[#ED232A] text-[#ED232A]"
                        >
                          {quarterDetail.signals.length}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-6">
                      <div className="space-y-3 pt-2">
                        {quarterDetail.signals.map((signal, i) => {
                          const SigIcon = SIGNAL_ICONS[signal.type] || AlertTriangle;
                          return (
                            <div
                              key={i}
                              className="flex items-start gap-3 p-3 rounded-lg bg-slate-50"
                            >
                              <SigIcon className="w-5 h-5 mt-0.5 text-slate-500 shrink-0" />
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className="text-xs capitalize">
                                    {signal.type.replace(/_/g, " ")}
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className={`text-xs ${IMPORTANCE_COLORS[signal.severity] || ""}`}
                                  >
                                    {signal.severity}
                                  </Badge>
                                </div>
                                <p className="text-sm text-slate-700">{signal.description}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )}

                {/* Sentiment — always rendered */}
                <AccordionItem
                  value="sentiment"
                  className="border rounded-lg bg-white shadow-sm"
                >
                  <AccordionTrigger className="px-6 hover:no-underline">
                    <div className="flex items-center gap-3">
                      {quarterDetail?.sentiment.overall === "positive" ? (
                        <TrendingUp className="w-5 h-5 text-[#10b981]" />
                      ) : quarterDetail?.sentiment.overall === "negative" ? (
                        <TrendingDown className="w-5 h-5 text-[#E31837]" />
                      ) : (
                        <Minus className="w-5 h-5 text-slate-500" />
                      )}
                      <span className="font-semibold text-[#002850] text-lg">
                        Overall Sentiment Analysis
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          quarterDetail?.sentiment.overall === "positive"
                            ? "border-green-500 text-green-600"
                            : quarterDetail?.sentiment.overall === "negative"
                              ? "border-red-500 text-red-600"
                              : "border-slate-400 text-slate-600"
                        }
                      >
                        {quarterDetail?.sentiment.overall ?? "neutral"}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-6">
                    {quarterDetail &&
                    (quarterDetail.sentiment.positive_points.length > 0 ||
                      quarterDetail.sentiment.negative_points.length > 0) ? (
                      <div className="space-y-4 pt-2">
                        {quarterDetail.sentiment.positive_points.length > 0 && (
                          <div className="p-4 bg-[#10b981]/5 border border-[#10b981]/20 rounded-lg">
                            <div className="text-sm font-medium text-[#10b981] mb-2">
                              Growth Drivers
                            </div>
                            <ul className="space-y-1.5">
                              {quarterDetail.sentiment.positive_points.map((item, idx) => (
                                <li
                                  key={idx}
                                  className="text-sm text-slate-700 flex items-start gap-2"
                                >
                                  <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] mt-1.5 flex-shrink-0" />
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {quarterDetail.sentiment.negative_points.length > 0 && (
                          <div className="p-4 bg-[#E31837]/5 border border-[#E31837]/20 rounded-lg">
                            <div className="text-sm font-medium text-[#E31837] mb-2">
                              Risks & Concerns
                            </div>
                            <ul className="space-y-1.5">
                              {quarterDetail.sentiment.negative_points.map((item, idx) => (
                                <li
                                  key={idx}
                                  className="text-sm text-slate-700 flex items-start gap-2"
                                >
                                  <div className="w-1.5 h-1.5 rounded-full bg-[#E31837] mt-1.5 flex-shrink-0" />
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="pt-2 text-sm text-slate-500 italic">
                        Sentiment is derived from document analysis signals
                        (drivers / risks). Run analysis on the uploaded documents
                        for this quarter to populate this section.
                      </p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {/* No quarter selected empty state */}
            {!selectedQuarterKey && !detailLoading && (
              <Card className="border-[#d4dce6] p-12 text-center">
                <div className="max-w-md mx-auto">
                  <div className="w-16 h-16 rounded-full bg-[#FEE2E2] flex items-center justify-center mx-auto mb-4">
                    <TrendingUp className="w-8 h-8 text-[#ED232A]" />
                  </div>
                  <h3 className="text-xl font-semibold text-[#002850] mb-2">
                    Select a Quarter to Begin
                  </h3>
                  <p className="text-slate-600">
                    Choose a quarter from the dropdown above to explore detailed
                    earnings call analysis, questions, and more.
                  </p>
                </div>
              </Card>
            )}

            {/* AI Chat Assistant */}
            <Card className="border-[#ED232A]/30 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-[#FEE2E2] to-white border-b border-[#d4dce6]">
                <CardTitle className="text-[#002850] text-xl flex items-center gap-2">
                  <Bot className="w-6 h-6 text-[#ED232A]" />
                  AI Intelligence Assistant
                </CardTitle>
                <p className="text-sm text-slate-600 mt-1">
                  Ask me anything about {selectedCompany}'s historical earnings data
                </p>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-4">
                    {chatMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.type === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`flex gap-3 max-w-[85%] ${msg.type === "user" ? "flex-row-reverse" : "flex-row"}`}
                        >
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.type === "user" ? "bg-[#ED232A]" : "bg-gradient-to-br from-[#FEE2E2] to-[#ED232A]/20 border border-[#ED232A]/30"}`}
                          >
                            {msg.type === "user" ? (
                              <User className="w-4 h-4 text-white" />
                            ) : (
                              <Bot className="w-4 h-4 text-[#ED232A]" />
                            )}
                          </div>
                          <div
                            className={`rounded-2xl p-4 ${msg.type === "user" ? "bg-[#ED232A] text-white" : "bg-white border border-[#d4dce6]"}`}
                          >
                            <div className="text-sm leading-relaxed whitespace-pre-line">
                              {msg.text}
                            </div>
                            <div
                              className={`text-xs mt-2 ${msg.type === "user" ? "text-white/70" : "text-slate-500"}`}
                            >
                              {msg.timestamp.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex justify-start">
                        <div className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FEE2E2] to-[#ED232A]/20 border border-[#ED232A]/30 flex items-center justify-center">
                            <Bot className="w-4 h-4 text-[#ED232A]" />
                          </div>
                          <div className="rounded-2xl p-4 bg-white border border-[#d4dce6]">
                            <Loader2 className="w-5 h-5 animate-spin text-[#ED232A]" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                <div className="flex gap-3 pt-4 border-t border-[#d4dce6]">
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleChatSubmit()}
                    placeholder="Ask about trends, themes, key concerns, or any earnings data..."
                    className="flex-1 border-[#ED232A]/50 focus:border-[#ED232A] h-12"
                    disabled={chatLoading}
                  />
                  <Button
                    onClick={handleChatSubmit}
                    disabled={!chatInput.trim() || chatLoading}
                    className="bg-[#ED232A] hover:bg-[#B91C1C] text-white px-6 h-12 disabled:opacity-50"
                  >
                    {chatLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </Button>
                </div>

                {/* Quick Actions */}
                <div className="pt-2">
                  <div className="text-xs font-medium text-slate-600 mb-2">
                    Quick Actions:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setChatInput(
                          `What are the key themes from ${selectedCompany}'s recent earnings?`,
                        )
                      }
                      className="border-[#ED232A]/30 text-[#ED232A] text-xs hover:bg-[#FEE2E2]"
                    >
                      <Sparkles className="w-3 h-3 mr-1.5" />
                      Key Themes
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setChatInput(
                          `Compare performance trends across the last few quarters for ${selectedCompany}`,
                        )
                      }
                      className="border-[#ED232A]/30 text-[#ED232A] text-xs hover:bg-[#FEE2E2]"
                    >
                      <TrendingUp className="w-3 h-3 mr-1.5" />
                      Compare Trends
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setChatInput(
                          `What are the main risks and concerns raised by analysts for ${selectedCompany}?`,
                        )
                      }
                      className="border-[#ED232A]/30 text-[#ED232A] text-xs hover:bg-[#FEE2E2]"
                    >
                      <MessageSquare className="w-3 h-3 mr-1.5" />
                      Key Concerns
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setChatInput(
                          `What questions did analysts ask most frequently about ${selectedCompany}?`,
                        )
                      }
                      className="border-[#ED232A]/30 text-[#ED232A] text-xs hover:bg-[#FEE2E2]"
                    >
                      <MessageSquare className="w-3 h-3 mr-1.5" />
                      Top Questions
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
