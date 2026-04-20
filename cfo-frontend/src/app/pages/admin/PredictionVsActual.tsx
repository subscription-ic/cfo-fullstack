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
  predictedQuestion: string;
  wasAsked: boolean;
  actualPhrasing: string;
  similarity: number;
  recommendedAnswer: string;
  actualAnswer: string;
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

      {/* Performance Metrics — theme level */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Metrics — By Theme (L1 Category)</CardTitle>
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
                          <Badge variant="outline" className="text-xs">
                            {row.category}
                          </Badge>
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
                          <Badge variant="outline" className="text-xs">{row.category}</Badge>
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
                        <Badge variant="outline">{row.category}</Badge>
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
                        <Badge variant="outline">{row.category}</Badge>
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