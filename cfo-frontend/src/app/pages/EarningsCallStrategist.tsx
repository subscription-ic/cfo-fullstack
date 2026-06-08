import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ScrollArea } from '../components/ui/scroll-area';
import { toast } from 'sonner';
import { 
  Check, X, ArrowLeft, FileText, ChevronDown, ChevronUp, Plus, Loader2, AlertCircle
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../components/ui/collapsible';
import {
  fetchCompanies,
  fetchPredictedQuestions,
  fetchSimulatorSuggestedAnswer,
  type PredictedQA,
} from '../utils/api';
import { AnswerWithCitationLinks } from '../components/AnswerWithCitationLinks';

interface QuestionItem {
  id: string;
  question: string;
  category: string;
  categoryL1?: string | null;
  categoryL2?: string | null;
  riskLevel: string;
  suggestedAnswer: string;
  period: string;
  status: 'pending' | 'retained' | 'rejected';
  isCustom?: boolean;
  company?: string;
  fiscalYear?: number | null;
  quarter?: string | null;
  ragSources?: {
    excerpt: string;
    label: string;
    filename?: string | null;
    citation?: string;
    pdf_url?: string | null;
    page_number?: number;
  }[];
  citationHrefs?: Record<string, string>;
  citationLabels?: Record<string, string>;
  ragLoading?: boolean;
  ragError?: string | null;
  ragFetched?: boolean;
  retrievalMode?: string;
  dbSuggestedAnswer?: string;
}

function formatSourceLabel(meta: Record<string, unknown>): string {
  const t = String(meta.document_type ?? '').trim();
  const q = String(meta.quarter ?? '').trim();
  const y = meta.fiscal_year;
  const yStr = y != null && y !== '' ? `FY${y}` : '';
  const fn = String(meta.source_filename ?? '').trim();
  const base = [t, q, yStr].filter(Boolean).join(' · ');
  if (fn && base) return `${base} · ${fn}`;
  if (fn) return fn;
  return base || 'Uploaded document';
}

function mapApiToQuestion(q: PredictedQA): QuestionItem {
  return {
    id: q.id,
    question: q.predicted_question,
    category: q.category ?? '',
    categoryL1: q.category_l1 ?? null,
    categoryL2: q.category_l2 ?? null,
    riskLevel: q.risk?.toLowerCase() ?? 'medium',
    suggestedAnswer: q.suggested_answer ?? '',
    status: 'pending',
    isCustom: false,
    company: q.company ?? '',
    fiscalYear: q.fiscal_year ?? null,
    quarter: q.quarter ?? null,
    ragFetched: false,
    ragLoading: false,
    ragError: null,
    dbSuggestedAnswer: q.suggested_answer ?? '',
  };
}

export default function EarningsCallStrategist() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCustomQuestion, setNewCustomQuestion] = useState('');
  const [openQuestions, setOpenQuestions] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<string>('');
  const [selectedQuarter, setSelectedQuarter] = useState<string>('');
  // Canonical company list — independent of the (filtered) questions stream.
  const [allCompanies, setAllCompanies] = useState<string[]>([]);
  // Unfiltered predictions used to populate the period dropdown; refreshed
  // when the selected company changes so periods reflect that company only.
  const [periodsCatalog, setPeriodsCatalog] = useState<PredictedQA[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchCompanies()
      .then((list) => {
        if (cancelled) return;
        setAllCompanies(list);
        if (list.length === 1 && !selectedCompany) {
          setSelectedCompany(list[0]);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh the period catalog whenever the company filter changes. Uses NO
  // period filter so all available quarters appear in the dropdown.
  useEffect(() => {
    let cancelled = false;
    fetchPredictedQuestions(selectedCompany || undefined)
      .then((data) => {
        if (cancelled) return;
        setPeriodsCatalog(data);
      })
      .catch(() => {
        if (!cancelled) setPeriodsCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCompany]);

  const topSourceSnippets = useMemo(() => {
    const seen = new Set<string>();
    const out: {
      key: string;
      citation?: string;
      filename?: string | null;
      label: string;
      excerpt: string;
      pdf_url?: string | null;
      page_number?: number;
    }[] = [];
    for (const q of questions) {
      if (!q.ragSources) continue;
      if (selectedCompany.trim() && q.company !== selectedCompany) continue;
      if (selectedFiscalYear && String(q.fiscalYear ?? '') !== selectedFiscalYear) continue;
      if (selectedQuarter && (q.quarter ?? '') !== selectedQuarter) continue;
      for (const s of q.ragSources) {
        const key = `${s.citation ?? ''}|${s.excerpt.slice(0, 80)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          key,
          citation: s.citation,
          filename: s.filename,
          label: s.label,
          excerpt: s.excerpt,
          pdf_url: s.pdf_url,
          page_number: s.page_number,
        });
        if (out.length >= 10) return out;
      }
    }
    return out;
  }, [questions, selectedCompany, selectedFiscalYear, selectedQuarter]);

  const periodOptions = useMemo(() => {
    const set = new Set<string>();
    for (const q of periodsCatalog) {
      if (q.fiscal_year != null && q.quarter) {
        set.add(`${q.fiscal_year}|${q.quarter}`);
      }
    }
    return Array.from(set)
      .map((k) => {
        const [fy, qt] = k.split('|');
        return { fiscalYear: Number(fy), quarter: qt };
      })
      .sort((a, b) =>
        a.fiscalYear === b.fiscalYear
          ? a.quarter.localeCompare(b.quarter)
          : b.fiscalYear - a.fiscalYear,
      );
  }, [periodsCatalog]);

  const visibleQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (q.isCustom) return true;
      if (selectedCompany.trim() && q.company !== selectedCompany) return false;
      if (selectedFiscalYear && String(q.fiscalYear ?? '') !== selectedFiscalYear) return false;
      if (selectedQuarter && (q.quarter ?? '') !== selectedQuarter) return false;
      return true;
    });
  }, [questions, selectedCompany, selectedFiscalYear, selectedQuarter]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const fy = selectedFiscalYear ? Number(selectedFiscalYear) : undefined;
        const data = await fetchPredictedQuestions(
          selectedCompany || undefined,
          fy,
          selectedQuarter || undefined,
        );
        setQuestions(data.map(mapApiToQuestion));
      } catch (err: any) {
        setError(err.message ?? 'Failed to load questions from the server.');
        toast.error('Could not load questions', { description: err.message });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [selectedCompany, selectedFiscalYear, selectedQuarter]);

  const ensureRagAnswer = useCallback(
    async (item: QuestionItem) => {
      let skip = false;
      setQuestions((prev) => {
        const cur = prev.find((x) => x.id === item.id);
        if (!cur || cur.ragFetched || cur.ragLoading) {
          skip = true;
          return prev;
        }
        return prev.map((x) =>
          x.id === item.id ? { ...x, ragLoading: true, ragError: null } : x,
        );
      });
      if (skip) return;
      try {
        const res = await fetchSimulatorSuggestedAnswer(
        item.question,
        item.fiscalYear ?? null,
        item.quarter ?? null,
        item.company ?? selectedCompany ?? null,
      );
        setQuestions((prev) =>
          prev.map((x) =>
            x.id === item.id
              ? {
                  ...x,
                  suggestedAnswer: res.answer,
                  citationHrefs: res.citation_hrefs,
                  citationLabels: res.citation_labels,
                  ragSources: res.sources.map((s) => ({
                    excerpt: s.excerpt,
                    citation: s.citation,
                    filename: s.filename,
                    pdf_url: s.pdf_url,
                    page_number: s.page_number,
                    label: formatSourceLabel(s.metadata),
                  })),
                  ragFetched: true,
                  ragLoading: false,
                  ragError: null,
                  retrievalMode: res.retrieval_mode,
                }
              : x,
          ),
        );
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Could not load answer from documents.';
        setQuestions((prev) =>
          prev.map((x) =>
            x.id === item.id ? { ...x, ragLoading: false, ragError: msg } : x,
          ),
        );
      }
    },
    [],
  );

  // Note: RAG answers are fetched lazily — only when the user expands a
  // question via handleQuestionOpenChange. Pre-fetching for every question on
  // quarter change burned 2 LLM calls per question (rerank + synthesis) and
  // made dropdown changes feel slow despite the answers never being visible
  // until the user clicked.

  const handleQuestionOpenChange = (item: QuestionItem, open: boolean) => {
    setOpenQuestions((prev) => {
      if (open) return prev.includes(item.id) ? prev : [...prev, item.id];
      return prev.filter((x) => x !== item.id);
    });
    if (open) void ensureRagAnswer(item);
  };

  const handleGeneratePredictions = async () => {
    if (!selectedCompany) {
      toast.error('Please select a company first');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPredictedQuestions(selectedCompany);
      setQuestions(data.map(mapApiToQuestion));
      if (data.length === 0) {
        toast.info('No predictions found for this company');
      } else {
        toast.success(`Loaded ${data.length} predicted questions`);
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to load questions from the server.');
      toast.error('Could not load questions', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'high': return 'bg-[#C00000]/10 text-[#C00000] border-[#C00000]/20';
      case 'medium': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'low': return 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  const handleRetain = (id: string) => {
    setQuestions(prev =>
      prev.map(q => (q.id === id ? { ...q, status: 'retained' as const } : q))
    );
    toast.success('Question Retained', { description: 'Added to your cheat sheet.' });
  };

  const handleReject = (id: string) => {
    setQuestions(prev =>
      prev.map(q => (q.id === id ? { ...q, status: 'rejected' as const } : q))
    );
    toast.info('Question Rejected', { description: 'Removed from prep materials.' });
  };

  const handleAddCustomQuestion = () => {
    if (!newCustomQuestion.trim()) {
      toast.error('Please enter a question');
      return;
    }

    const newQuestion: QuestionItem = {
      id: `custom-${Date.now()}`,
      question: newCustomQuestion,
      category: 'Custom',
      riskLevel: 'medium',
      suggestedAnswer:
        'Open “View suggested answer” to load text from your uploaded documents (hybrid search across all uploads).',
      status: 'retained',
      isCustom: true,
      company: '',
      ragFetched: false,
      ragLoading: false,
      ragError: null,
    };

    setQuestions(prev => [newQuestion, ...prev]);
    setNewCustomQuestion('');
    toast.success('Custom Question Added', { description: 'Question added to your prep list.' });
  };

  const handleDownloadCheatSheet = () => {
    toast.loading('Generating Cheat Sheet...', { id: 'cheat-sheet' });
    
    setTimeout(() => {
      const retainedQuestions = questions.filter(q => q.status === 'retained');
      const content = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Earnings Call Cheat Sheet</title>
          <style>
            body { font-family: Montserrat, sans-serif; padding: 40px; max-width: 1000px; margin: 0 auto; background: #f8fafc; }
            h1 { color: #C00000; border-bottom: 3px solid #C00000; padding-bottom: 10px; margin-bottom: 30px; }
            .meta { background: white; padding: 20px; border-radius: 8px; margin-bottom: 30px; border-left: 4px solid #C00000; }
            .question { margin: 20px 0; padding: 25px; border: 1px solid #d4dce6; border-radius: 8px; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            .question h3 { color: #C00000; margin-top: 0; font-size: 16px; }
            .answer { background: #FFE8EA; padding: 18px; border-radius: 6px; margin-top: 15px; line-height: 1.6; }
            .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 600; margin-right: 8px; }
            .high { background: #C00000; color: white; }
            .medium { background: #fbbf24; color: #78350f; }
            .low { background: #10b981; color: white; }
            .custom { background: #C00000; color: white; }
          </style>
        </head>
        <body>
          <h1>🎯 Earnings Call Preparation - Cheat Sheet</h1>
          <div class="meta">
            <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>Total Questions Prepared:</strong> ${retainedQuestions.length}</p>
            <p><strong>Custom Questions:</strong> ${retainedQuestions.filter(q => q.isCustom).length}</p>
          </div>
          ${retainedQuestions.map((q, idx) => `
            <div class="question">
              <h3>Question ${idx + 1} ${q.isCustom ? '(Custom)' : ''}</h3>
              <p><strong>${q.question}</strong></p>
              <p>
                <span class="badge ${q.isCustom ? 'custom' : q.riskLevel}">${q.isCustom ? 'CUSTOM' : q.riskLevel.toUpperCase() + ' RISK'}</span>
                <span class="badge">${q.category}</span>
              </p>
              <div class="answer">
                <strong>💡 Suggested Answer:</strong><br/><br/>
                ${q.suggestedAnswer}
              </div>
            </div>
          `).join('')}
        </body>
        </html>
      `;
      
      const blob = new Blob([content], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Cheat-Sheet-${new Date().toISOString().split('T')[0]}.html`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success('Cheat Sheet Downloaded', {
        id: 'cheat-sheet',
        description: 'Your customized cheat sheet has been saved.',
      });
    }, 1000);
  };

  const retainedQuestions = questions.filter((q: QuestionItem) => q.status === 'retained');
  const retainedCount = retainedQuestions.length;

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading && questions.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 text-[#C00000] animate-spin mx-auto" />
          <p className="text-slate-600 font-medium">Loading questions from database…</p>
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md">
          <AlertCircle className="w-10 h-10 text-[#C00000] mx-auto" />
          <h2 className="text-xl font-semibold text-[#C00000]">Failed to load questions</h2>
          <p className="text-slate-600 text-sm">{error}</p>
          <p className="text-slate-500 text-xs">Make sure the FastAPI backend is running on port 8000.</p>
          <Button
            onClick={() => window.location.reload()}
            className="bg-[#C00000] hover:bg-[#C00000] text-white"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const emptyDb = !loading && !error && questions.length === 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Button 
              variant="ghost" 
              onClick={() => navigate('/dashboard')}
              className="mb-3 text-[#C00000] hover:text-[#C00000] hover:bg-[#FFE8EA]"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <h1 className="text-3xl font-semibold text-[#C00000] mb-2">Earnings Call Simulator</h1>
            <p className="text-slate-600">Prepare for tough questions with AI-predicted scenarios</p>
            {questions.some((q) => q.ragLoading) && (
              <p className="text-sm text-[#C00000] mt-2 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                Grounding CFO-style answers from uploaded documents (hybrid search + rerank)…
              </p>
            )}
            {allCompanies.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-slate-700">
                  Filter list by company:
                </span>
                <Select
                  value={selectedCompany || '__all__'}
                  onValueChange={(v) =>
                    setSelectedCompany(v === '__all__' ? '' : v)
                  }
                >
                  <SelectTrigger className="w-[240px] border-[#C00000]/40">
                    <SelectValue placeholder="All companies" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All companies</SelectItem>
                    {allCompanies.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {periodOptions.length > 0 && (
                  <>
                    <span className="text-sm font-medium text-slate-700">Period:</span>
                    <Select
                      value={
                        selectedFiscalYear && selectedQuarter
                          ? `${selectedFiscalYear}|${selectedQuarter}`
                          : '__all__'
                      }
                      onValueChange={(v) => {
                        if (v === '__all__') {
                          setSelectedFiscalYear('');
                          setSelectedQuarter('');
                        } else {
                          const [fy, qt] = v.split('|');
                          setSelectedFiscalYear(fy);
                          setSelectedQuarter(qt);
                        }
                      }}
                    >
                      <SelectTrigger className="w-[200px] border-[#C00000]/40">
                        <SelectValue placeholder="All periods" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All periods</SelectItem>
                        {periodOptions.map((p) => (
                          <SelectItem
                            key={`${p.fiscalYear}|${p.quarter}`}
                            value={`${p.fiscalYear}|${p.quarter}`}
                          >
                            {p.quarter} FY{String(p.fiscalYear).slice(-2)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {emptyDb && (
          <Card className="border-amber-200 bg-amber-50/80">
            <CardContent className="py-4 text-sm text-amber-950 space-y-2">
              <p className="font-medium">No rows in the Supabase table <code className="bg-amber-100 px-1 rounded">predicted_qa</code>.</p>
              <ul className="list-disc pl-5 space-y-1 text-amber-900/90">
                <li>Run <code className="bg-amber-100 px-1 rounded text-xs">cfo-backend/migrations/004_seed_sample_qa.sql</code> in the Supabase SQL Editor, or</li>
                <li>In Admin → Generate Q&amp;A, set company to <strong>HDFC</strong> (same as seed) and click <strong>Generate questions (LLM)</strong> with persist enabled, or</li>
                <li>Use the Excel uploader script <code className="bg-amber-100 px-1 rounded text-xs">upload_questions_to_supabase.py</code>.</li>
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Main Content - Two Column Layout */}
        <div className="space-y-6">
          {/* File Upload Section */}
          <Card className="border-[#ED232A]/30 shadow-sm">
            <CardHeader className="bg-gradient-to-r from-[#FFE8EA] to-white border-b border-[#d4dce6]">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-[#8B1319]">Upload Documents for AI Prediction</CardTitle>
                  <p className="text-sm text-slate-600 mt-1">Provide historical transcripts, historical financials, and current financials to generate predictions.</p>
                </div>
                <div className="w-[300px]">
                  <Label className="text-xs font-semibold text-[#8B1319] mb-1 block">Target Company</Label>
                  <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                    <SelectTrigger className="bg-white border-[#ED232A]/30">
                      <SelectValue placeholder="Select a company" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid md:grid-cols-3 gap-6">
                
                {/* Box 1: Historical Transcript */}
                <div className="flex flex-col gap-3 p-4 border rounded-lg bg-slate-50 border-[#ED232A]/20">
                  <Label className="font-semibold text-slate-800">Historical Transcript</Label>
                  <Input type="file" multiple className="bg-white border-slate-300" />
                  <div className="flex gap-2">
                    <Select>
                      <SelectTrigger className="bg-white border-slate-300"><SelectValue placeholder="FY" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FY24">FY24</SelectItem>
                        <SelectItem value="FY25">FY25</SelectItem>
                        <SelectItem value="FY26">FY26</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select>
                      <SelectTrigger className="bg-white border-slate-300"><SelectValue placeholder="QTR" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Q1">Q1</SelectItem>
                        <SelectItem value="Q2">Q2</SelectItem>
                        <SelectItem value="Q3">Q3</SelectItem>
                        <SelectItem value="Q4">Q4</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Box 2: Historical Financial Results */}
                <div className="flex flex-col gap-3 p-4 border rounded-lg bg-slate-50 border-[#ED232A]/20">
                  <Label className="font-semibold text-slate-800">Historical Financial Results</Label>
                  <Input type="file" multiple className="bg-white border-slate-300" />
                  <div className="flex gap-2">
                    <Select>
                      <SelectTrigger className="bg-white border-slate-300"><SelectValue placeholder="FY" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FY24">FY24</SelectItem>
                        <SelectItem value="FY25">FY25</SelectItem>
                        <SelectItem value="FY26">FY26</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select>
                      <SelectTrigger className="bg-white border-slate-300"><SelectValue placeholder="QTR" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Q1">Q1</SelectItem>
                        <SelectItem value="Q2">Q2</SelectItem>
                        <SelectItem value="Q3">Q3</SelectItem>
                        <SelectItem value="Q4">Q4</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Box 3: Current Financial Results */}
                <div className="flex flex-col gap-3 p-4 border rounded-lg bg-slate-50 border-[#ED232A]/20">
                  <Label className="font-semibold text-slate-800">Current Financial Results</Label>
                  <Input type="file" className="bg-white border-slate-300" />
                  <div className="flex gap-2">
                    <Select>
                      <SelectTrigger className="bg-white border-slate-300"><SelectValue placeholder="FY" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FY24">FY24</SelectItem>
                        <SelectItem value="FY25">FY25</SelectItem>
                        <SelectItem value="FY26">FY26</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select>
                      <SelectTrigger className="bg-white border-slate-300"><SelectValue placeholder="QTR" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Q1">Q1</SelectItem>
                        <SelectItem value="Q2">Q2</SelectItem>
                        <SelectItem value="Q3">Q3</SelectItem>
                        <SelectItem value="Q4">Q4</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="outline"
                  disabled
                  className="text-slate-400 border-slate-200 bg-slate-50 cursor-not-allowed"
                >
                  Fetch Documents
                </Button>
                <Button 
                  onClick={handleGeneratePredictions}
                  className="bg-[#ED232A] hover:bg-[#C11B22] text-white font-medium"
                  disabled={loading}
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
                  ) : (
                    'Upload & Generate Predictions'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Predicted Questions List */}
          <Card className="lg:col-span-2 border-[#C00000]/30 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-[#FFE8EA] to-white border-b border-[#d4dce6]">
              <CardTitle className="text-[#C00000] text-xl">
                AI-Predicted Questions
              </CardTitle>
              <p className="text-sm text-slate-600 mt-2">
                Ranked by likelihood and predictability
              </p>
              
              {/* Add Custom Question Input */}
              <div className="mt-4 space-y-2">
                <div className="text-sm font-medium text-[#C00000]">Add Custom Question</div>
                <div className="flex gap-2">
                  <Input
                    value={newCustomQuestion}
                    onChange={(e) => setNewCustomQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCustomQuestion()}
                    placeholder="Type your custom question here..."
                    className="flex-1 border-[#C00000]/50 focus:border-[#C00000]"
                  />
                  <Button 
                    onClick={handleAddCustomQuestion}
                    className="bg-[#C00000] hover:bg-[#C00000] text-white"
                    size="sm"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[800px]">
                <div className="p-4 space-y-3">
                  {emptyDb && (
                    <p className="text-slate-600 text-sm px-2">
                      Add questions using the steps above, or type a custom question below.
                    </p>
                  )}
                  {visibleQuestions.map((q, idx) => (
                    <Card 
                      key={q.id} 
                      className={`border transition-all ${
                        q.status === 'retained' 
                          ? 'border-[#10b981] bg-[#10b981]/5' 
                          : q.status === 'rejected'
                          ? 'border-[#C00000]/30 bg-[#C00000]/5 opacity-60'
                          : 'border-[#d4dce6] bg-white'
                      }`}
                    >
                      <CardContent className="p-4">
                        {/* Question Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className="text-xs font-semibold text-[#C00000] border-[#C00000]">
                                Q{idx + 1}
                              </Badge>
                              {q.categoryL1 ? (
                                <Badge variant="outline" className="text-xs border-[#C00000] text-[#C00000]">
                                  {q.categoryL1}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs border-[#C00000] text-[#C00000]">
                                  {q.category}
                                </Badge>
                              )}
                              {q.categoryL2 && (
                                <Badge variant="outline" className="text-xs border-slate-300 text-slate-600">
                                  {q.categoryL2}
                                </Badge>
                              )}
                              <Badge className={`text-xs ${getRiskColor(q.riskLevel)}`}>
                                {q.riskLevel}
                              </Badge>
                              {q.isCustom && (
                                <Badge className="text-xs bg-[#C00000] text-white">
                                  Custom
                                </Badge>
                              )}
                            </div>
                            <div className="font-medium text-[#C00000] text-sm leading-relaxed">
                              {q.question}
                            </div>
                            {q.ragLoading && (
                              <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
                                <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                                Loading document-grounded answer…
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 mb-3">
                          <Button
                            size="sm"
                            onClick={() => handleRetain(q.id)}
                            disabled={q.status === 'retained'}
                            className={`flex-1 ${
                              q.status === 'retained'
                                ? 'bg-[#10b981] hover:bg-[#10b981]'
                                : 'bg-[#10b981]/10 text-[#10b981] hover:bg-[#10b981] hover:text-white'
                            }`}
                          >
                            <Check className="w-4 h-4 mr-1.5" />
                            {q.status === 'retained' ? 'Retained' : 'Retain'}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleReject(q.id)}
                            disabled={q.status === 'rejected'}
                            className={`flex-1 ${
                              q.status === 'rejected'
                                ? 'bg-[#C00000] hover:bg-[#C00000]'
                                : 'bg-[#C00000]/10 text-[#C00000] hover:bg-[#C00000] hover:text-white'
                            }`}
                          >
                            <X className="w-4 h-4 mr-1.5" />
                            {q.status === 'rejected' ? 'Rejected' : 'Reject'}
                          </Button>
                        </div>

                        {/* Collapsible: hybrid RAG answer from uploads */}
                        <Collapsible
                          open={openQuestions.includes(q.id)}
                          onOpenChange={(open) => handleQuestionOpenChange(q, open)}
                        >
                          <CollapsibleTrigger
                            className="w-full flex items-center justify-between p-3 bg-[#FFE8EA]/50 hover:bg-[#FFE8EA] rounded-lg transition-colors"
                          >
                            <span className="text-sm font-medium text-[#C00000]">
                              View suggested answer (from uploaded documents)
                            </span>
                            {openQuestions.includes(q.id) ? (
                              <ChevronUp className="w-4 h-4 text-[#C00000]" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-[#C00000]" />
                            )}
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-3">
                            <div className="p-4 bg-white border border-[#d4dce6] rounded-lg space-y-3">
                              {q.ragLoading && (
                                <div className="flex items-center gap-2 text-sm text-slate-600 py-2">
                                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                                  Hybrid search + reranking against your document chunks…
                                </div>
                              )}
                              {q.ragError && (
                                <div
                                  role="alert"
                                  className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3"
                                >
                                  {q.ragError}
                                </div>
                              )}
                              {!q.ragLoading && (
                                <>
                                  <div className="text-sm font-medium text-[#C00000]">
                                    Suggested answer
                                  </div>
                                  <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                                    <AnswerWithCitationLinks
                                      text={q.suggestedAnswer}
                                      hrefs={q.citationHrefs}
                                      labels={q.citationLabels}
                                    />
                                  </div>
                                  {q.ragFetched && q.retrievalMode && (
                                    <p className="text-xs text-slate-500">
                                      Citations in [brackets] open the source PDF at the indexed page
                                      (Chrome/Edge). Retrieval: hybrid search (dense + keyword), RRF
                                      fusion, rerank — leg:{' '}
                                      {q.retrievalMode.replace(/_/g, ' ')}.
                                    </p>
                                  )}
                                  {q.ragSources && q.ragSources.length > 0 && (
                                    <div className="space-y-2 border-t border-dashed border-slate-200 pt-3">
                                      <div className="text-xs font-semibold text-slate-600">
                                        Top source snippets
                                      </div>
                                      {q.ragSources.map((s, si) => (
                                        <div
                                          key={si}
                                          className="text-xs bg-slate-50 rounded p-2 border border-slate-100"
                                        >
                                          <div className="flex flex-wrap items-center gap-2 mb-1">
                                            {s.pdf_url ? (
                                              <a
                                                href={s.pdf_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs font-semibold text-[#C00000] hover:underline"
                                              >
                                                {s.filename ?? s.label}
                                                {s.page_number != null
                                                  ? ` · page ${s.page_number}`
                                                  : ''}{' '}
                                                (open PDF)
                                              </a>
                                            ) : (
                                              <span className="text-xs font-semibold text-slate-800">
                                                {s.filename ?? s.label}
                                                {s.page_number != null
                                                  ? ` · page ${s.page_number}`
                                                  : ''}
                                              </span>
                                            )}
                                          </div>
                                          {s.filename && s.label && s.label !== s.filename && (
                                            <div className="text-[11px] text-slate-500 mb-1">
                                              {s.label}
                                            </div>
                                          )}
                                          <div className="text-slate-600 leading-relaxed">
                                            {s.excerpt}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Right: Cheat Sheet Preview */}
          <Card className="lg:col-span-1 border-[#C00000]/30 shadow-lg h-fit sticky top-6">
            <CardHeader className="bg-gradient-to-r from-[#C00000] to-[#C00000] text-white">
              <CardTitle className="text-xl flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Prep Cheat Sheet
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-[#FFE8EA] rounded-lg">
                  <div className="text-xs text-slate-600">Questions</div>
                  <div className="text-2xl font-semibold text-[#C00000]">{retainedCount}</div>
                </div>
                <div className="p-3 bg-[#FFE8EA] rounded-lg">
                  <div className="text-xs text-slate-600">Custom</div>
                  <div className="text-2xl font-semibold text-[#C00000]">
                    {retainedQuestions.filter(q => q.isCustom).length}
                  </div>
                </div>
              </div>

              {/* Retained Questions List */}
              <div>
                <div className="text-sm font-medium text-[#C00000] mb-3">Retained Questions:</div>
                {retainedCount === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    No questions retained yet. Click "Retain" on questions above to add them to your cheat sheet.
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {retainedQuestions.map((q, idx) => (
                        <div key={q.id} className="p-3 bg-[#FFE8EA] rounded-lg border border-[#C00000]/20">
                          <div className="flex items-start gap-2">
                            <div className="text-xs font-semibold text-[#C00000] mt-0.5">
                              {idx + 1}.
                            </div>
                            <div className="flex-1">
                              <div className="text-xs text-[#C00000] leading-relaxed">
                                {q.question}
                              </div>
                              {q.isCustom && (
                                <Badge className="text-xs bg-[#C00000] text-white mt-1.5">
                                  Custom
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>

              {/* Download Button */}
              <Button 
                onClick={handleDownloadCheatSheet}
                disabled={retainedCount === 0}
                className="w-full bg-[#C00000] hover:bg-[#C00000] text-white disabled:opacity-50"
              >
                <FileText className="w-4 h-4 mr-2" />
                Download Cheat Sheet ({retainedCount})
              </Button>

              {/* Info */}
              <div className="text-xs text-slate-600 text-center pt-2 border-t border-[#d4dce6]">
                Your cheat sheet will include all retained questions with suggested answers
              </div>
            </CardContent>
          </Card>

          {/* Top source snippets — aggregated across visible questions */}
          <Card className="lg:col-span-1 border-[#C00000]/30 shadow-lg h-fit">
            <CardHeader className="bg-gradient-to-r from-[#FFE8EA] to-white border-b border-[#d4dce6]">
              <CardTitle className="text-[#C00000] text-lg flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Top source snippets
              </CardTitle>
              <p className="text-xs text-slate-600 mt-1">
                Highest-ranked excerpts pulled from your uploaded documents
                {selectedCompany ? ` for ${selectedCompany}` : ''}
                {selectedFiscalYear && selectedQuarter
                  ? ` · ${selectedQuarter} FY${selectedFiscalYear.slice(-2)}`
                  : ''}
              </p>
            </CardHeader>
            <CardContent className="p-4">
              {topSourceSnippets.length === 0 ? (
                <div className="text-xs text-slate-500 py-4 text-center">
                  Open a predicted question to fetch grounded answers — top
                  source snippets will appear here.
                </div>
              ) : (
                <ScrollArea className="h-[420px] pr-2">
                  <div className="space-y-2">
                    {topSourceSnippets.map((s, idx) => (
                      <div
                        key={s.key}
                        className="text-xs bg-slate-50 rounded p-2 border border-slate-100"
                      >
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-[10px] font-semibold text-[#C00000]">
                            #{idx + 1}
                          </span>
                          {s.pdf_url ? (
                            <a
                              href={s.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-semibold text-[#C00000] hover:underline"
                            >
                              {s.filename ?? s.label}
                              {s.page_number != null
                                ? ` · p${s.page_number}`
                                : ''}
                            </a>
                          ) : (
                            <span className="text-xs font-semibold text-slate-800">
                              {s.filename ?? s.label}
                              {s.page_number != null
                                ? ` · p${s.page_number}`
                                : ''}
                            </span>
                          )}
                        </div>
                        {s.filename && s.label && s.label !== s.filename && (
                          <div className="text-[11px] text-slate-500 mb-1">
                            {s.label}
                          </div>
                        )}
                        <div className="text-slate-600 leading-relaxed line-clamp-4">
                          {s.excerpt}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
        </div>
      </div>
    </div>
  );
}
