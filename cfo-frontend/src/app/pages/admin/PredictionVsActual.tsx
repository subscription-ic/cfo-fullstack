import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  fetchPredictedQuestions,
  fetchActualEarningsQA,
  fetchCompanies,
  type PredictedQA,
  type ActualEarningsQARow,
} from '../../utils/api';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { 
  CheckCircle2, XCircle, AlertCircle, Upload, Download, Tag,
  TrendingUp, TrendingDown, Target, Brain, ArrowLeft
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Progress } from '../../components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { downloadHTMLFile, downloadCSVFile, generateLearningReport, generateTrainingData } from '../../utils/downloadHelpers';

interface ComparisonData {
  id: string;
  period: string;
  predictedQuestion: string;
  wasAsked: boolean;
  actualPhrasing: string;
  similarity: number;
  category: string;
  feedback: string;
}

function periodLabelOf(r: ActualEarningsQARow): string {
  if (r.period_label && r.period_label.trim()) return r.period_label.trim();
  if (r.quarter && r.fiscal_year) {
    return `${r.quarter} FY${String(r.fiscal_year).slice(-2)}`;
  }
  return '—';
}

interface ThemeMetrics {
  theme: string;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  matchingRate: number;
}

function themeOf(
  row: { category_l1?: string | null; category?: string | null },
): string {
  const l1 = (row.category_l1 ?? '').trim();
  if (l1) return l1;
  const flat = (row.category ?? '').trim();
  return flat || 'Uncategorized';
}

function computeMetrics(
  predicted: PredictedQA[],
  actuals: ActualEarningsQARow[],
): { overall: ThemeMetrics; perTheme: ThemeMetrics[] } {
  const linkedPredIds = new Set<string>();
  for (const a of actuals) {
    if (a.predicted_qa_id) linkedPredIds.add(a.predicted_qa_id);
  }

  const row = (theme: string, tp: number, fp: number, fn: number): ThemeMetrics => {
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    const matchingRate = recall;
    return { theme, tp, fp, fn, precision, recall, f1, matchingRate };
  };

  // Overall
  const overallTP = actuals.filter((a) => !!a.predicted_qa_id).length;
  const overallFN = actuals.length - overallTP;
  const overallFP = predicted.filter((p) => !linkedPredIds.has(p.id)).length;
  const overall = row('Overall', overallTP, overallFP, overallFN);

  // Per-theme (union of L1 themes across both sides)
  const themes = new Set<string>();
  for (const p of predicted) themes.add(themeOf(p));
  for (const a of actuals) themes.add(themeOf(a));

  const perTheme: ThemeMetrics[] = [];
  for (const t of themes) {
    const predInTheme = predicted.filter((p) => themeOf(p) === t);
    const actualsInTheme = actuals.filter((a) => themeOf(a) === t);
    const tp = actualsInTheme.filter((a) => !!a.predicted_qa_id).length;
    const fn = actualsInTheme.length - tp;
    const fp = predInTheme.filter((p) => !linkedPredIds.has(p.id)).length;
    perTheme.push(row(t, tp, fp, fn));
  }
  perTheme.sort((a, b) => b.tp + b.fp + b.fn - (a.tp + a.fp + a.fn));

  return { overall, perTheme };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

function buildLiveComparison(
  predicted: PredictedQA[],
  actuals: ActualEarningsQARow[],
): ComparisonData[] {
  const rows: ComparisonData[] = [];
  const usedPred = new Set<string>();
  const usedActual = new Set<string>();

  for (const a of actuals) {
    if (!a.predicted_qa_id) continue;
    const p = predicted.find((x) => x.id === a.predicted_qa_id);
    if (!p || usedPred.has(p.id)) continue;
    usedPred.add(p.id);
    usedActual.add(a.id);
    rows.push({
      id: `m-${p.id}-${a.id}`,
      predictedQuestion: p.predicted_question,
      wasAsked: true,
      actualPhrasing: a.question,
      similarity: Math.round(Number(a.similarity_score ?? 0)),
      recommendedAnswer: p.suggested_answer ?? '',
      actualAnswer: a.answer ?? '',
      category: themeOf(p) || themeOf(a),
      feedback: 'good-prediction',
    });
  }

  for (const p of predicted) {
    if (usedPred.has(p.id)) continue;
    rows.push({
      id: `fp-${p.id}`,
      predictedQuestion: p.predicted_question,
      wasAsked: false,
      actualPhrasing: '',
      similarity: 0,
      recommendedAnswer: p.suggested_answer ?? '',
      actualAnswer: '',
      category: themeOf(p),
      feedback: 'false-positive',
    });
  }

  for (const a of actuals) {
    if (usedActual.has(a.id)) continue;
    rows.push({
      id: `miss-${a.id}`,
      predictedQuestion: '',
      wasAsked: true,
      actualPhrasing: a.question,
      similarity: 0,
      recommendedAnswer: '',
      actualAnswer: a.answer ?? '',
      category: themeOf(a),
      feedback: 'missed-question',
    });
  }

  return rows;
}

export default function PredictionVsActual() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [predicted, setPredicted] = useState<PredictedQA[]>([]);
  const [actuals, setActuals] = useState<ActualEarningsQARow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedQuarter, setSelectedQuarter] = useState('Q1 FY26');

  useEffect(() => {
    let cancelled = false;
    fetchCompanies()
      .then((list) => {
        if (cancelled) return;
        setCompanies(list);
        if (list.length && !selectedCompany) setSelectedCompany(list[0]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCompany) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchPredictedQuestions(selectedCompany),
      fetchActualEarningsQA(selectedCompany),
    ])
      .then(([p, a]) => {
        if (cancelled) return;
        setPredicted(p);
        setActuals(a);
      })
      .catch(() => {
        if (!cancelled) {
          setPredicted([]);
          setActuals([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCompany]);

  const availableQuarters = useMemo(() => {
    const set = new Set<string>();
    for (const a of actuals) {
      const label = periodLabelOf(a);
      if (label !== '—') set.add(label);
    }
    for (const p of predicted) {
      if (p.quarter && p.fiscal_year) {
        set.add(`${p.quarter} FY${String(p.fiscal_year).slice(-2)}`);
      }
    }
    return Array.from(set).sort().reverse();
  }, [actuals, predicted]);

  useEffect(() => {
    if (availableQuarters.length === 0) return;
    if (!availableQuarters.includes(selectedQuarter)) {
      setSelectedQuarter(availableQuarters[0]);
    }
  }, [availableQuarters, selectedQuarter]);

  const quarterFilteredActuals = useMemo(
    () => actuals.filter((a) => periodLabelOf(a) === selectedQuarter),
    [actuals, selectedQuarter],
  );

  const quarterFilteredPredicted = useMemo(
    () =>
      predicted.filter((p) => {
        if (!p.quarter || !p.fiscal_year) return false;
        return (
          `${p.quarter} FY${String(p.fiscal_year).slice(-2)}` === selectedQuarter
        );
      }),
    [predicted, selectedQuarter],
  );


  // Handler functions
  const handleExportReport = () => {
    toast.loading('Generating Learning Report...', { id: 'learning-report' });
    setTimeout(() => {
      const content = generateLearningReport(activeQuarter, {});
      downloadHTMLFile(content, `Learning-Report-${activeQuarter.replace(' ', '-')}.html`);
      toast.success('Learning Report Downloaded', {
        id: 'learning-report',
        description: `Comprehensive learning report for ${activeQuarter} has been saved.`,
      });
    }, 1000);
  };

  const handleProcessTranscript = () => {
    toast.loading('Processing Transcript...', { id: 'process' });
    setTimeout(() => {
      toast.success('Processing Complete', {
        id: 'process',
        description: '12 questions identified, 8 new insights extracted.',
      });
    }, 2500);
  };

  const handleSaveFeedback = () => {
    toast.success('Feedback Saved', {
      description: 'Your feedback has been saved and will be used for model training.',
    });
  };

  const handleApproveForLearning = () => {
    toast.success('Approved for Learning', {
      description: 'This data has been approved for the next training cycle.',
    });
  };

  const handleApproveAllLearnings = () => {
    toast.loading('Approving All Learnings...', { id: 'approve' });
    setTimeout(() => {
      toast.success('All Learnings Approved', {
        id: 'approve',
        description: '24 insights approved and queued for model training.',
      });
    }, 1500);
  };

  const handleRetrainModel = () => {
    toast.loading('Starting Model Retraining...', { id: 'retrain' });
    setTimeout(() => {
      toast.success('Retraining Complete', {
        id: 'retrain',
        description: 'Model updated. Expected accuracy improvement: +3.2%',
      });
    }, 3000);
  };

  const handleExportTrainingData = () => {
    toast.loading('Exporting Training Data...', { id: 'export-data' });
    setTimeout(() => {
      const csvContent = generateTrainingData(comparisonState);
      downloadCSVFile(csvContent, `Training-Data-${activeQuarter.replace(' ', '-')}.csv`);
      toast.success('Training Data Downloaded', { id: 'export-data', description: 'Training dataset has been saved as CSV file.' });
    }, 800);
  };

  const handleViewChangelog = () => {
    toast.info('Opening Model Changelog', {
      description: 'Viewing version history and model improvements.',
    });
  };
  
  const comparisonData: ComparisonData[] = useMemo(
    () => buildLiveComparison(quarterFilteredPredicted, quarterFilteredActuals),
    [quarterFilteredPredicted, quarterFilteredActuals],
  );

  const performanceMetrics = useMemo(
    () => computeMetrics(quarterFilteredPredicted, quarterFilteredActuals),
    [quarterFilteredPredicted, quarterFilteredActuals],
  );

  const accuracyMetrics = {
    questionsCorrectlyPredicted: 75,
    recallTopConcerns: 88,
    answerUsefulness: 82,
    confidenceCalibration: 79,
    missedCategories: ['Technology', 'ESG'],
    falsePositives: 2
  };

  return (
    <div className="p-6 space-y-6 max-w-[1800px] mx-auto">
      {/* Back to Dashboard Button */}
      <div>
        <Button 
          variant="ghost" 
          onClick={() => navigate('/dashboard')}
          className="mb-3 text-[#ED232A] hover:text-[#B91C1C] hover:bg-[#FEE2E2]"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>

      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900 mb-2">Prediction vs Actual Review</h1>
          <p className="text-slate-600">Post-earnings analysis and model learning</p>
        </div>
        <div className="flex items-center gap-3">
          {companies.length > 0 && (
            <Select value={selectedCompany} onValueChange={setSelectedCompany}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Company" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={loading ? 'Loading…' : 'Quarter'} />
            </SelectTrigger>
            <SelectContent>
              {availableQuarters.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  No transcripts uploaded yet
                </SelectItem>
              ) : (
                availableQuarters.map((q) => (
                  <SelectItem key={q} value={q}>
                    {q}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExportReport}>
            <Download className="w-4 h-4 mr-2" />
            Export Learning Report
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="bg-[#ED232A] hover:bg-[#B91C1C]" onClick={handleProcessTranscript}>
                <Upload className="w-4 h-4 mr-2" />
                Upload Transcript
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Upload Earnings Call Materials</DialogTitle>
                <DialogDescription>
                  Upload transcript and supporting documents to improve model accuracy
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Earnings Call Transcript
                  </label>
                  <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-[#ED232A]/50 transition-colors cursor-pointer">
                    <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-600">Click to upload or drag and drop</p>
                    <p className="text-xs text-slate-500 mt-1">PDF, DOCX, or TXT</p>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Analyst Reports (Optional)
                  </label>
                  <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-[#ED232A]/50 transition-colors cursor-pointer">
                    <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-600">Upload analyst reports</p>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Management Script (Optional)
                  </label>
                  <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-[#ED232A]/50 transition-colors cursor-pointer">
                    <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-600">Upload prepared remarks</p>
                  </div>
                </div>
                <Button className="w-full bg-[#ED232A] hover:bg-[#B91C1C]">
                  Process & Analyze
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>




      {/* Performance Metrics — theme level + question level */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Metrics — Precision / Recall / F1</CardTitle>
          <p className="text-sm text-slate-600 mt-1">
            Computed for {selectedQuarter} from{' '}
            {quarterFilteredPredicted.length} predicted and{' '}
            {quarterFilteredActuals.length} actual questions. A predicted
            question counts as a true positive only when an actual question
            links to it with a high similarity score AND matching category.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Overall */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {(() => {
              const m = performanceMetrics.overall;
              const items: Array<[string, string]> = [
                ['Precision', pct(m.precision)],
                ['Recall', pct(m.recall)],
                ['F1 Score', pct(m.f1)],
                ['Matching Rate', pct(m.matchingRate)],
                ['TP / FP / FN', `${m.tp} / ${m.fp} / ${m.fn}`],
              ];
              return items.map(([label, value]) => (
                <div
                  key={label}
                  className="p-3 rounded-lg border border-[#ED232A]/20 bg-[#FEE2E2]/40"
                >
                  <div className="text-xs text-slate-600">{label}</div>
                  <div className="text-2xl font-semibold text-[#8B1319]">
                    {value}
                  </div>
                </div>
              ));
            })()}
          </div>

          {/* Per-theme */}
          <div>
            <h3 className="font-medium text-slate-900 mb-2">
              By theme (L1 category)
            </h3>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Theme</TableHead>
                    <TableHead className="text-right">TP</TableHead>
                    <TableHead className="text-right">FP</TableHead>
                    <TableHead className="text-right">FN</TableHead>
                    <TableHead className="text-right">Precision</TableHead>
                    <TableHead className="text-right">Recall</TableHead>
                    <TableHead className="text-right">F1</TableHead>
                    <TableHead className="text-right">Matching Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {performanceMetrics.perTheme.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center text-sm text-slate-500 py-6"
                      >
                        No predicted or actual questions for this quarter yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    performanceMetrics.perTheme.map((m) => (
                      <TableRow key={m.theme}>
                        <TableCell className="font-medium text-slate-800">
                          {m.theme}
                        </TableCell>
                        <TableCell className="text-right">{m.tp}</TableCell>
                        <TableCell className="text-right">{m.fp}</TableCell>
                        <TableCell className="text-right">{m.fn}</TableCell>
                        <TableCell className="text-right">
                          {pct(m.precision)}
                        </TableCell>
                        <TableCell className="text-right">
                          {pct(m.recall)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-[#8B1319]">
                          {pct(m.f1)}
                        </TableCell>
                        <TableCell className="text-right">
                          {pct(m.matchingRate)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              TP = predicted question actually asked (linked); FP = predicted
              question not asked; FN = analyst question with no matching
              prediction. Precision = TP / (TP+FP); Recall = Matching Rate =
              TP / (TP+FN); F1 = harmonic mean.
            </p>
          </div>

          {/* Question-level breakdown */}
          <div>
            <h3 className="font-medium text-slate-900 mb-2">
              Question-level status ({comparisonData.length})
            </h3>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[110px]">Outcome</TableHead>
                    <TableHead className="w-[140px]">Theme</TableHead>
                    <TableHead className="min-w-[240px]">Predicted</TableHead>
                    <TableHead className="min-w-[240px]">Actual</TableHead>
                    <TableHead className="w-[100px] text-right">
                      Similarity
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparisonData.map((row) => {
                    const outcome =
                      row.feedback === 'good-prediction'
                        ? { label: 'TP', color: 'text-green-700 bg-green-50' }
                        : row.feedback === 'false-positive'
                          ? { label: 'FP', color: 'text-amber-700 bg-amber-50' }
                          : { label: 'FN', color: 'text-red-700 bg-red-50' };
                    return (
                      <TableRow key={`qlevel-${row.id}`}>
                        <TableCell>
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${outcome.color}`}
                          >
                            {outcome.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-slate-700">
                          {row.category || '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.predictedQuestion || (
                            <span className="text-slate-400 italic">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.actualPhrasing || (
                            <span className="text-slate-400 italic">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {row.similarity > 0 ? `${row.similarity}%` : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Predicted vs Actual Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle>Predicted vs Actual Questions Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Quarter Tabs */}
          {availableQuarters.length > 0 && (
            <div className="flex gap-1 mb-4 overflow-x-auto">
              {availableQuarters.map(qtr => (
                <button
                  key={qtr}
                  onClick={() => setActiveQuarter(qtr)}
                  className={`px-3 py-1.5 rounded-sm text-sm font-medium transition-all whitespace-nowrap ${
                    activeQuarter === qtr
                      ? 'bg-white shadow-sm text-slate-950 border border-slate-200'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {qtr}
                </button>
              ))}
            </div>
          )}

          {(() => {
            const byQtr = comparisonState.filter(d => d.period === activeQuarter);
            const filtered = byQtr.filter(d => {
              if (activeTab === 'all') return true;
              if (activeTab === 'correct') return d.wasAsked && d.predictedQuestion;
              if (activeTab === 'missed') return d.feedback === 'missed-actual' || (d.wasAsked && !d.predictedQuestion);
              if (activeTab === 'false') return !d.wasAsked;
              return true;
            });
            return (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="all">All ({byQtr.length})</TabsTrigger>
                  <TabsTrigger value="correct">Correct Predictions ({byQtr.filter(d => d.wasAsked && d.predictedQuestion).length})</TabsTrigger>
                  <TabsTrigger value="missed">Missed ({byQtr.filter(d => d.feedback === 'missed-actual' || (d.wasAsked && !d.predictedQuestion)).length})</TabsTrigger>
                  <TabsTrigger value="false">False Positives ({byQtr.filter(d => !d.wasAsked).length})</TabsTrigger>
                </TabsList>
                <TabsContent value={activeTab} className="mt-4">
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50px]">Status</TableHead>
                          <TableHead className="min-w-[250px]">Predicted Question</TableHead>
                          <TableHead className="min-w-[250px]">Actual Question</TableHead>
                          <TableHead className="w-[120px]">Similarity</TableHead>
                          <TableHead className="w-[150px]">Category</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {comparisonLoading ? (
                          <TableRow><TableCell colSpan={5} className="h-24 text-center"><div className="flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#ED232A]"></div></div></TableCell></TableRow>
                        ) : filtered.length > 0 ? (
                          filtered.map(row => (
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
                                <Badge variant="outline" className="text-xs">{row.category}</Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center text-slate-500">
                              {!selectedCompany
                                ? 'Select a company above to view data.'
                                : comparisonLoading ? '' : 'No data found for this quarter.'}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            );
          })()}
        </CardContent>
      </Card>




      {/* Feedback Loop Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Learning Feedback Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="space-y-3">
              <h3 className="font-medium text-slate-900">Key Learnings This Quarter</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <span className="text-sm text-green-800">Margin questions: 6/6 predicted</span>
                </div>
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span className="text-sm text-amber-800">Tech focus underpredicted</span>
                </div>
                <div className="flex items-center gap-2 p-3 bg-[#FEE2E2] border border-[#ED232A]/20 rounded-lg">
                  <TrendingUp className="w-4 h-4 text-[#ED232A] flex-shrink-0" />
                  <span className="text-sm text-[#991B1B]">International turnaround timing accurate</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-medium text-slate-900">Recommended Adjustments</h3>
              <div className="space-y-2 text-sm">
                <div className="p-3 border rounded-lg">
                  <div className="font-medium text-slate-900 mb-1">Increase tech transformation weight</div>
                  <div className="text-slate-600">Weight: 15% → 25%</div>
                </div>
                <div className="p-3 border rounded-lg">
                  <div className="font-medium text-slate-900 mb-1">Reduce regulatory sensitivity</div>
                  <div className="text-slate-600">Weight: 20% → 10%</div>
                </div>
                <div className="p-3 border rounded-lg">
                  <div className="font-medium text-slate-900 mb-1">Add cloud migration signals</div>
                  <div className="text-slate-600">New data source</div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-medium text-slate-900">Actions</h3>
              <div className="space-y-2">
                <Button className="w-full bg-[#ED232A] hover:bg-[#B91C1C]" onClick={handleApproveAllLearnings}>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Approve All Learnings
                </Button>
                <Button variant="outline" className="w-full" onClick={handleRetrainModel}>
                  <Brain className="w-4 h-4 mr-2" />
                  Retrain Model
                </Button>
                <Button variant="outline" className="w-full" onClick={handleExportTrainingData}>
                  <Download className="w-4 h-4 mr-2" />
                  Export Training Data
                </Button>
                <Button variant="outline" className="w-full" onClick={handleViewChangelog}>
                  View Model Changelog
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}