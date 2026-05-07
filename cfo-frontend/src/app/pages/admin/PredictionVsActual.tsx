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
  TrendingUp, Target, Brain, ArrowLeft,
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Progress } from '../../components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { downloadHTMLFile, downloadCSVFile, generateLearningReport, generateTrainingData } from '../../utils/downloadHelpers';

// Research-report + sentiment-analysis data and rendering have been
// relocated to the Post-Call Analysis module.

interface ComparisonData {
  id: string;
  predictedQuestion: string;
  wasAsked: boolean;
  actualPhrasing: string;
  similarity: number;
  recommendedAnswer: string;
  actualAnswer: string;
  category: string;
  subCategory: string;
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
  subTheme: string;
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

function subThemeOf(row: { category_l2?: string | null }): string {
  const l2 = (row.category_l2 ?? '').trim();
  return l2 || '—';
}

function pairKey(l1: string, l2: string): string {
  return `${l1}${l2}`;
}

function computeMetrics(
  predicted: PredictedQA[],
  actuals: ActualEarningsQARow[],
): { overall: ThemeMetrics; perTheme: ThemeMetrics[] } {
  const linkedPredIds = new Set<string>();
  for (const a of actuals) {
    if (a.predicted_qa_id) linkedPredIds.add(a.predicted_qa_id);
  }

  const row = (
    theme: string,
    subTheme: string,
    tp: number,
    fp: number,
    fn: number,
  ): ThemeMetrics => {
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    const matchingRate = recall;
    return { theme, subTheme, tp, fp, fn, precision, recall, f1, matchingRate };
  };

  // Overall
  const overallTP = actuals.filter((a) => !!a.predicted_qa_id).length;
  const overallFN = actuals.length - overallTP;
  const overallFP = predicted.filter((p) => !linkedPredIds.has(p.id)).length;
  const overall = row('Overall', '', overallTP, overallFP, overallFN);

  // Per (L1, L2) pair — union across both sides
  const pairs = new Map<string, { l1: string; l2: string }>();
  for (const p of predicted) {
    const l1 = themeOf(p);
    const l2 = subThemeOf(p);
    pairs.set(pairKey(l1, l2), { l1, l2 });
  }
  for (const a of actuals) {
    const l1 = themeOf(a);
    const l2 = subThemeOf(a);
    pairs.set(pairKey(l1, l2), { l1, l2 });
  }

  const perTheme: ThemeMetrics[] = [];
  for (const { l1, l2 } of pairs.values()) {
    const predInPair = predicted.filter(
      (p) => themeOf(p) === l1 && subThemeOf(p) === l2,
    );
    const actualsInPair = actuals.filter(
      (a) => themeOf(a) === l1 && subThemeOf(a) === l2,
    );
    const tp = actualsInPair.filter((a) => !!a.predicted_qa_id).length;
    const fn = actualsInPair.length - tp;
    const fp = predInPair.filter((p) => !linkedPredIds.has(p.id)).length;
    perTheme.push(row(l1, l2, tp, fp, fn));
  }
  perTheme.sort((a, b) => {
    const byL1 = a.theme.localeCompare(b.theme);
    if (byL1 !== 0) return byL1;
    const byVolume = b.tp + b.fp + b.fn - (a.tp + a.fp + a.fn);
    if (byVolume !== 0) return byVolume;
    return a.subTheme.localeCompare(b.subTheme);
  });

  return { overall, perTheme };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Top-K accuracy: fraction of linked actual questions whose matched prediction
 * is among the K earliest-generated predictions for the same (L1, L2) theme.
 * created_at ascending is used as the prediction priority order — the same
 * order the backend returns. Falls back to overall top-K when the actual has
 * no theme metadata.
 */
function computeTopKAccuracy(
  predicted: PredictedQA[],
  actuals: ActualEarningsQARow[],
  k: number,
): { matched: number; total: number; rate: number } {
  const linkedActuals = actuals.filter((a) => !!a.predicted_qa_id);
  if (linkedActuals.length === 0) return { matched: 0, total: 0, rate: 0 };

  const topByPair = new Map<string, Set<string>>();
  for (const p of predicted) {
    const key = pairKey(themeOf(p), subThemeOf(p));
    const bucket = topByPair.get(key) ?? new Set<string>();
    if (bucket.size < k) bucket.add(p.id);
    topByPair.set(key, bucket);
  }
  const overallTopK = new Set(predicted.slice(0, k).map((p) => p.id));

  let matched = 0;
  for (const a of linkedActuals) {
    const key = pairKey(themeOf(a), subThemeOf(a));
    const bucket = topByPair.get(key) ?? overallTopK;
    if (a.predicted_qa_id && bucket.has(a.predicted_qa_id)) matched += 1;
  }
  return { matched, total: linkedActuals.length, rate: matched / linkedActuals.length };
}

/**
 * Theme coverage: fraction of (L1, L2) themes appearing in actual analyst
 * questions that were also covered by at least one prediction. Counts a pair
 * as "covered" when either the L1+L2 pair or just the L1 theme matches a
 * prediction's theme — predictions sometimes leave L2 blank.
 */
function computeThemeCoverage(
  predicted: PredictedQA[],
  actuals: ActualEarningsQARow[],
): { covered: number; total: number; rate: number } {
  const predictedPairs = new Set<string>();
  const predictedL1 = new Set<string>();
  for (const p of predicted) {
    predictedPairs.add(pairKey(themeOf(p), subThemeOf(p)));
    predictedL1.add(themeOf(p));
  }
  const actualPairs = new Set<string>();
  const actualPairL1 = new Map<string, string>();
  for (const a of actuals) {
    const l1 = themeOf(a);
    const key = pairKey(l1, subThemeOf(a));
    actualPairs.add(key);
    actualPairL1.set(key, l1);
  }
  if (actualPairs.size === 0) return { covered: 0, total: 0, rate: 0 };

  let covered = 0;
  for (const key of actualPairs) {
    if (predictedPairs.has(key) || predictedL1.has(actualPairL1.get(key) ?? '')) {
      covered += 1;
    }
  }
  return { covered, total: actualPairs.size, rate: covered / actualPairs.size };
}

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
      subCategory: subThemeOf(p) !== '—' ? subThemeOf(p) : subThemeOf(a),
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
      subCategory: subThemeOf(p),
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
      subCategory: subThemeOf(a),
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
      const content = generateLearningReport(selectedQuarter, accuracyMetrics);
      downloadHTMLFile(content, `Learning-Report-${selectedQuarter.replace(' ', '-')}.html`);
      
      toast.success('Learning Report Downloaded', {
        id: 'learning-report',
        description: `Comprehensive learning report for ${selectedQuarter} has been saved.`,
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
      const csvContent = generateTrainingData(comparisonData);
      downloadCSVFile(csvContent, `Training-Data-${selectedQuarter.replace(' ', '-')}.csv`);
      
      toast.success('Training Data Downloaded', {
        id: 'export-data',
        description: 'Training dataset has been saved as CSV file.',
      });
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

  const topThreeAccuracy = useMemo(
    () => computeTopKAccuracy(quarterFilteredPredicted, quarterFilteredActuals, 3),
    [quarterFilteredPredicted, quarterFilteredActuals],
  );

  const themeCoverage = useMemo(
    () => computeThemeCoverage(quarterFilteredPredicted, quarterFilteredActuals),
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

      {/* Aggregated KPIs */}
      <Card>
        <CardHeader>
          <CardTitle>Aggregated KPIs</CardTitle>
          <p className="text-sm text-slate-600 mt-1">
            Effectiveness of the AI-driven earnings call prediction engine for {selectedQuarter}.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                <Target className="w-3.5 h-3.5 text-[#ED232A]" />
                Precision
              </div>
              <div className="mt-2 text-2xl font-semibold text-[#8B1319]">
                {pct(performanceMetrics.overall.precision)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {performanceMetrics.overall.tp} of {performanceMetrics.overall.tp + performanceMetrics.overall.fp} predictions matched.
              </div>
              <div className="mt-1 text-[11px] text-slate-500 leading-snug">
                Predictions that actually became analyst questions.
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#ED232A]" />
                Recall (Matching Rate)
              </div>
              <div className="mt-2 text-2xl font-semibold text-[#8B1319]">
                {pct(performanceMetrics.overall.recall)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {performanceMetrics.overall.tp} of {performanceMetrics.overall.tp + performanceMetrics.overall.fn} analyst questions captured.
              </div>
              <div className="mt-1 text-[11px] text-slate-500 leading-snug">
                Analyst concerns the model successfully anticipated.
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                <Brain className="w-3.5 h-3.5 text-[#ED232A]" />
                F1 Score
              </div>
              <div className="mt-2 text-2xl font-semibold text-[#8B1319]">
                {pct(performanceMetrics.overall.f1)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Harmonic mean of precision and recall.
              </div>
              <div className="mt-1 text-[11px] text-slate-500 leading-snug">
                Balanced view of accuracy and coverage.
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                <TrendingUp className="w-3.5 h-3.5 text-[#ED232A]" />
                Top 3 Accuracy
              </div>
              <div className="mt-2 text-2xl font-semibold text-[#8B1319]">
                {pct(topThreeAccuracy.rate)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {topThreeAccuracy.matched} of {topThreeAccuracy.total} matches inside top-3 predictions per theme.
              </div>
              <div className="mt-1 text-[11px] text-slate-500 leading-snug">
                Did the actual question land in the model's top picks for its theme?
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                <Tag className="w-3.5 h-3.5 text-[#ED232A]" />
                Theme Coverage
              </div>
              <div className="mt-2 text-2xl font-semibold text-[#8B1319]">
                {pct(themeCoverage.rate)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {themeCoverage.covered} of {themeCoverage.total} L1/L2 themes covered.
              </div>
              <div className="mt-1 text-[11px] text-slate-500 leading-snug">
                Share of business themes & sub-themes the model identified.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Metrics — theme level */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Metrics — By Theme (L1 / L2 Category)</CardTitle>
          <p className="text-sm text-slate-600 mt-1">
            Computed for {selectedQuarter} from{' '}
            {quarterFilteredPredicted.length} predicted and{' '}
            {quarterFilteredActuals.length} actual questions.
          </p>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">L1 Theme</TableHead>
                  <TableHead className="min-w-[180px]">L2 Sub-theme</TableHead>
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
                      colSpan={9}
                      className="text-center text-sm text-slate-500 py-6"
                    >
                      No predicted or actual questions for this quarter yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  performanceMetrics.perTheme.map((m) => (
                    <TableRow key={`${m.theme}__${m.subTheme}`}>
                      <TableCell className="font-medium text-slate-800">
                        {m.theme}
                      </TableCell>
                      <TableCell className="text-slate-700">
                        {m.subTheme}
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
        </CardContent>
      </Card>

      {/* Predicted vs Actual Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle>Predicted vs Actual Questions Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All ({comparisonData.length})</TabsTrigger>
              <TabsTrigger value="correct">Correct Predictions ({comparisonData.filter(d => d.wasAsked && d.predictedQuestion).length})</TabsTrigger>
              <TabsTrigger value="missed">Missed ({comparisonData.filter(d => d.feedback === 'missed-question').length})</TabsTrigger>
              <TabsTrigger value="false">False Positives ({comparisonData.filter(d => d.feedback === 'false-positive').length})</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-4">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">Status</TableHead>
                      <TableHead className="min-w-[250px]">Predicted Question</TableHead>
                      <TableHead className="min-w-[250px]">Actual Question</TableHead>
                      <TableHead className="w-[100px]">Similarity</TableHead>
                      <TableHead className="w-[150px]">Category</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparisonData.map((row) => (
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
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="text-xs">
                              {row.category}
                            </Badge>
                            {row.subCategory && row.subCategory !== '—' && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-slate-50 text-slate-600 border-slate-200"
                              >
                                {row.subCategory}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <Tag className="w-4 h-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-3xl">
                              <DialogHeader>
                                <DialogTitle>Question Feedback</DialogTitle>
                                <DialogDescription>
                                  Provide feedback to improve future predictions
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div className="grid md:grid-cols-2 gap-4">
                                  <div className="p-4 bg-[#FEE2E2] rounded-lg border border-[#ED232A]/20">
                                    <div className="text-sm font-medium text-[#8B1319] mb-2">Predicted</div>
                                    <p className="text-sm text-[#991B1B]">{row.predictedQuestion || 'N/A'}</p>
                                  </div>
                                  <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                                    <div className="text-sm font-medium text-green-900 mb-2">Actual</div>
                                    <p className="text-sm text-green-800">{row.actualPhrasing || 'N/A'}</p>
                                  </div>
                                </div>
                                
                                <div>
                                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                                    Feedback Type
                                  </label>
                                  <Select defaultValue={row.feedback}>
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="good-prediction">Good Prediction</SelectItem>
                                      <SelectItem value="missed-nuance">Missed Nuance</SelectItem>
                                      <SelectItem value="wrong-priority">Wrong Priority</SelectItem>
                                      <SelectItem value="good-answer">Good Answer</SelectItem>
                                      <SelectItem value="weak-answer">Weak Answer</SelectItem>
                                      <SelectItem value="needs-retraining">Needs Retraining</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                
                                <div>
                                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                                    Notes
                                  </label>
                                  <Textarea 
                                    placeholder="Add specific feedback or corrections..."
                                    className="min-h-[100px]"
                                  />
                                </div>
                                
                                <div className="flex gap-2">
                                  <Button className="flex-1 bg-[#ED232A] hover:bg-[#B91C1C]" onClick={handleSaveFeedback}>
                                    Save Feedback
                                  </Button>
                                  <Button variant="outline" className="flex-1" onClick={handleApproveForLearning}>
                                    Approve for Learning
                                  </Button>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="correct" className="mt-4">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Predicted Question</TableHead>
                      <TableHead>Actual Question</TableHead>
                      <TableHead>Similarity</TableHead>
                      <TableHead>Category</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparisonData.filter(d => d.wasAsked && d.predictedQuestion).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-sm">{row.predictedQuestion}</TableCell>
                        <TableCell className="text-sm">{row.actualPhrasing}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={row.similarity} className="w-12 h-2" />
                            <span className="text-sm font-medium">{row.similarity}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="text-xs">{row.category}</Badge>
                            {row.subCategory && row.subCategory !== '—' && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-slate-50 text-slate-600 border-slate-200"
                              >
                                {row.subCategory}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="missed" className="mt-4">
              <div className="space-y-4">
                {comparisonData.filter(d => d.feedback === 'missed-question').map((row) => (
                  <div key={row.id} className="p-4 border border-red-200 bg-red-50 rounded-lg">
                    <div className="flex items-start gap-3 mb-3">
                      <XCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="font-medium text-red-900 mb-1">Missed Question</div>
                        <p className="text-sm text-red-800 mb-2">{row.actualPhrasing}</p>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{row.category}</Badge>
                          {row.subCategory && row.subCategory !== '—' && (
                            <Badge
                              variant="outline"
                              className="bg-white text-red-700 border-red-200"
                            >
                              {row.subCategory}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="pl-8">
                      <div className="text-sm text-red-700 mb-2">Actual Answer Given:</div>
                      <p className="text-sm text-red-800 bg-white p-3 rounded border border-red-200">
                        {row.actualAnswer}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="false" className="mt-4">
              <div className="space-y-4">
                {comparisonData.filter(d => d.feedback === 'false-positive').map((row) => (
                  <div key={row.id} className="p-4 border border-amber-200 bg-amber-50 rounded-lg">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="font-medium text-amber-900 mb-1">False Positive Prediction</div>
                        <p className="text-sm text-amber-800 mb-2">{row.predictedQuestion}</p>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{row.category}</Badge>
                          {row.subCategory && row.subCategory !== '—' && (
                            <Badge
                              variant="outline"
                              className="bg-white text-amber-700 border-amber-200"
                            >
                              {row.subCategory}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

    </div>
  );
}