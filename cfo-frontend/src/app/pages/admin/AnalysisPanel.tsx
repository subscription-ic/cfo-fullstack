import { useState, useCallback } from "react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Zap,
  Shield,
  Eye,
  ChevronDown,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  getAccessToken,
  runAnalysis,
  fetchAnalysis,
  runQuestionGeneration,
  type DocumentCatalogRow,
  type AnalysisResult,
} from "../../utils/api";

interface AnalysisPanelProps {
  documents: DocumentCatalogRow[];
  companies: string[];
}

const IMPORTANCE_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-800 border-red-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-green-100 text-green-800 border-green-200",
};

const SEVERITY_COLORS: Record<string, string> = {
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

const DIRECTION_ICONS: Record<string, typeof TrendingUp> = {
  improved: TrendingUp,
  declined: TrendingDown,
  stable: Minus,
};

const DIRECTION_COLORS: Record<string, string> = {
  improved: "text-green-600",
  declined: "text-red-600",
  stable: "text-slate-500",
};

const FREQUENCY_COLORS: Record<string, string> = {
  frequent: "bg-blue-100 text-blue-800 border-blue-200",
  occasional: "bg-slate-100 text-slate-700 border-slate-200",
  rare: "bg-gray-100 text-gray-600 border-gray-200",
};

function formatPeriod(quarter: string, fiscalYear: number): string {
  const fy = String(fiscalYear).length <= 2 ? fiscalYear : String(fiscalYear).slice(-2);
  return `${quarter} FY${fy}`;
}

export default function AnalysisPanel({ documents, companies }: AnalysisPanelProps) {
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [contextSummary, setContextSummary] = useState("");

  const selectedDoc = documents.find((d) => d.id === selectedDocId);

  const handleSelectDocument = useCallback(async (docId: string) => {
    setSelectedDocId(docId);
    setAnalysis(null);
    setContextSummary("");
    const token = getAccessToken();
    if (!token) return;
    try {
      const cached = await fetchAnalysis(docId, token);
      if (cached) setAnalysis(cached);
    } catch {
      // No cached analysis — that's fine
    }
  }, []);

  const handleRunAnalysis = useCallback(async (force = false) => {
    if (!selectedDocId) return;
    const token = getAccessToken();
    if (!token) { toast.error("Not authenticated"); return; }
    setLoading(true);
    try {
      const resp = await runAnalysis(selectedDocId, force, token);
      setAnalysis(resp.analysis);
      setContextSummary(resp.context_summary);
      toast.success("Analysis complete");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }, [selectedDocId]);

  const handleGenerateQuestions = useCallback(async () => {
    if (!analysis?.id || !selectedDoc) return;
    const token = getAccessToken();
    if (!token) { toast.error("Not authenticated"); return; }
    setGenerating(true);
    try {
      const resp = await runQuestionGeneration(
        {
          company: selectedDoc.company,
          fiscal_year: selectedDoc.fiscal_year,
          quarter: selectedDoc.quarter,
          num_questions: 10,
          persist: true,
          analysis_id: analysis.id,
        },
        token,
      );
      toast.success(`Generated ${resp.questions.length} smart questions`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, [analysis, selectedDoc]);

  return (
    <div className="space-y-6">
      {/* Document Selector */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-xl text-[#002850]">Document Analysis Pipeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[250px]">
              <label className="text-sm font-medium text-slate-700 mb-1 block">Select Document</label>
              <Select value={selectedDocId} onValueChange={handleSelectDocument}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a document to analyze..." />
                </SelectTrigger>
                <SelectContent>
                  {documents.map((doc) => (
                    <SelectItem key={doc.id} value={doc.id}>
                      {doc.company} — {formatPeriod(doc.quarter, doc.fiscal_year)} — {doc.document_type.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={() => handleRunAnalysis(false)}
              disabled={!selectedDocId || loading}
              className="bg-[#002850] hover:bg-[#003d7a] text-white"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
              {loading ? "Analyzing..." : "Run Analysis"}
            </Button>

            {analysis && (
              <Button
                onClick={() => handleRunAnalysis(true)}
                disabled={loading}
                variant="outline"
                className="border-slate-300"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Re-run
              </Button>
            )}
          </div>

          {contextSummary && (
            <p className="text-sm text-slate-500 bg-slate-50 rounded px-3 py-2">{contextSummary}</p>
          )}

          {analysis?.detected_company && (
            <p className="text-sm text-slate-600">
              <span className="font-medium">Auto-detected:</span>{" "}
              {analysis.detected_company}{analysis.detected_period ? ` — ${analysis.detected_period}` : ""}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Analysis Results */}
      {analysis && analysis.status === "completed" && (
        <>
          {/* Themes */}
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg text-[#002850]">
                Key Themes ({analysis.themes.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {analysis.themes.map((theme, i) => (
                <Collapsible key={i}>
                  <CollapsibleTrigger className="w-full text-left">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                      <Badge variant="outline" className={IMPORTANCE_COLORS[theme.importance] || IMPORTANCE_COLORS.medium}>
                        {theme.importance}
                      </Badge>
                      <span className="font-medium text-slate-800">{theme.name.replace(/_/g, " ")}</span>
                      <ChevronDown className="w-4 h-4 ml-auto text-slate-400" />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-3 pt-2 pb-3">
                    <p className="text-sm text-slate-600 mb-2">{theme.description}</p>
                    {theme.evidence.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-slate-500 uppercase">Evidence</p>
                        {theme.evidence.map((e, j) => (
                          <p key={j} className="text-xs text-slate-500 bg-white rounded border border-slate-100 px-2 py-1 italic">
                            "{e}"
                          </p>
                        ))}
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </CardContent>
          </Card>

          {/* Deltas */}
          {analysis.deltas.length > 0 && (
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg text-[#002850]">
                  Quarter-over-Quarter Changes ({analysis.deltas.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Theme</TableHead>
                      <TableHead>Direction</TableHead>
                      <TableHead>Magnitude</TableHead>
                      <TableHead>Current</TableHead>
                      <TableHead>Previous</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analysis.deltas.map((delta, i) => {
                      const DirIcon = DIRECTION_ICONS[delta.direction] || Minus;
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{delta.theme.replace(/_/g, " ")}</TableCell>
                          <TableCell>
                            <span className={`flex items-center gap-1 ${DIRECTION_COLORS[delta.direction] || ""}`}>
                              <DirIcon className="w-4 h-4" />
                              {delta.direction}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {delta.magnitude || "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600 max-w-[200px]">{delta.current_summary}</TableCell>
                          <TableCell className="text-sm text-slate-500 max-w-[200px]">{delta.previous_summary}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Signals */}
          {analysis.signals.length > 0 && (
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg text-[#002850]">
                  Signals & Risks ({analysis.signals.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {analysis.signals.map((signal, i) => {
                  const SigIcon = SIGNAL_ICONS[signal.type] || AlertTriangle;
                  return (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
                      <SigIcon className="w-5 h-5 mt-0.5 text-slate-500 shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs capitalize">
                            {signal.type.replace(/_/g, " ")}
                          </Badge>
                          <Badge variant="outline" className={`text-xs ${SEVERITY_COLORS[signal.severity] || ""}`}>
                            {signal.severity}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-700">{signal.description}</p>
                        {signal.evidence && (
                          <p className="text-xs text-slate-500 mt-1 italic">"{signal.evidence}"</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Question Patterns */}
          {analysis.question_patterns.length > 0 && (
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg text-[#002850]">
                  Analyst Question Patterns ({analysis.question_patterns.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {analysis.question_patterns.map((pattern, i) => (
                  <Collapsible key={i}>
                    <CollapsibleTrigger className="w-full text-left">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                        <span className="font-medium text-slate-800">{pattern.theme.replace(/_/g, " ")}</span>
                        <Badge variant="outline" className={`text-xs ${FREQUENCY_COLORS[pattern.frequency] || ""}`}>
                          {pattern.frequency}
                        </Badge>
                        <ChevronDown className="w-4 h-4 ml-auto text-slate-400" />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-3 pt-2 pb-3">
                      <p className="text-sm text-slate-600 mb-2">{pattern.pattern_description}</p>
                      {pattern.example_questions.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-slate-500 uppercase">Example Questions</p>
                          {pattern.example_questions.map((q, j) => (
                            <p key={j} className="text-xs text-slate-600 bg-white rounded border border-slate-100 px-2 py-1">
                              {q}
                            </p>
                          ))}
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Generate Smart Questions */}
          <Card className="border-[#002850]/20 bg-[#002850]/5">
            <CardContent className="flex items-center justify-between py-6">
              <div>
                <p className="font-medium text-[#002850]">Generate Smart Questions</p>
                <p className="text-sm text-slate-600">
                  Use the analysis above to generate precise, analyst-style earnings call questions.
                </p>
              </div>
              <Button
                onClick={handleGenerateQuestions}
                disabled={generating || !analysis.id}
                className="bg-[#ED232A] hover:bg-[#C11B22] text-white"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                {generating ? "Generating..." : "Generate 10 Questions"}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {/* Error state */}
      {analysis && analysis.status === "failed" && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-6">
            <p className="text-red-700 font-medium">Analysis failed</p>
            <p className="text-sm text-red-600">{analysis.error_message || "Unknown error"}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
