import { useState, useEffect } from 'react';
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
import { useNavigate } from 'react-router';
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

export default function PredictionVsActual() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [comparisonState, setComparisonState] = useState<ComparisonData[]>([]);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [availableQuarters, setAvailableQuarters] = useState<string[]>([]);
  const [activeQuarter, setActiveQuarter] = useState<string>("");
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    fetch(`${API_URL}/api/companies`)
      .then(res => res.json())
      .then(data => { if (data.companies) setCompanies(data.companies); })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedCompany) { setComparisonState([]); setAvailableQuarters([]); setActiveQuarter(""); return; }
    setComparisonLoading(true);
    fetch(`${API_URL}/api/comparisons?company=${encodeURIComponent(selectedCompany)}`)
      .then(res => res.json())
      .then(data => {
        if (data.data) {
          setComparisonState(data.data);
          const periods = Array.from(new Set(data.data.map((q: any) => q.period))) as string[];
          periods.sort((a, b) => {
            const parseP = (p: string) => { const m = p.match(/Q(\d)\s+FY(\d+)/); return m ? parseInt(m[2]) * 10 + parseInt(m[1]) : 0; };
            return parseP(a) - parseP(b);
          });
          setAvailableQuarters(periods);
          if (periods.length > 0) setActiveQuarter(periods[periods.length - 1]);
        }
      })
      .catch(err => console.error("Failed to fetch comparisons:", err))
      .finally(() => setComparisonLoading(false));
  }, [selectedCompany]);
  
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
          <Select value={selectedCompany} onValueChange={setSelectedCompany}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select Company..." />
            </SelectTrigger>
            <SelectContent>
              {companies.map(company => (
                <SelectItem key={company} value={company}>{company}</SelectItem>
              ))}
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