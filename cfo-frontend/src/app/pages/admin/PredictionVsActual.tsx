import { useState } from 'react';
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
  predictedQuestion: string;
  wasAsked: boolean;
  actualPhrasing: string;
  similarity: number;
  recommendedAnswer: string;
  actualAnswer: string;
  category: string;
  feedback: string;
}

export default function PredictionVsActual() {
  const navigate = useNavigate();
  const [selectedQuarter, setSelectedQuarter] = useState('Q1 FY26');
  
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
  
  const comparisonData: ComparisonData[] = [
    {
      id: '1',
      predictedQuestion: 'Can you walk through the key drivers of the 120 bps margin expansion this quarter?',
      wasAsked: true,
      actualPhrasing: 'Walk us through the margin bridge this quarter and sustainability into Q2?',
      similarity: 92,
      recommendedAnswer: 'The 120 basis point expansion was driven by three factors: operational efficiency gains (60 bps), favorable product mix (40 bps), and pricing realization (20 bps)...',
      actualAnswer: 'Three main drivers: efficiency improvements from automation, premium mix shift, and pricing actions. We expect most of these gains to sustain...',
      category: 'Margin / Profitability',
      feedback: 'good-prediction'
    },
    {
      id: '2',
      predictedQuestion: 'What gives you confidence in the full-year revenue guidance?',
      wasAsked: true,
      actualPhrasing: 'Your guidance implies deceleration in Q2 - what are the specific headwinds?',
      similarity: 78,
      recommendedAnswer: 'Our guidance reflects normal seasonality, tougher prior year comparisons, and a prudent approach...',
      actualAnswer: 'Q2 has typical seasonal patterns, we\'re lapping a very strong Q2 last year, and being appropriately conservative given macro uncertainty...',
      category: 'Guidance',
      feedback: 'good-prediction'
    },
    {
      id: '3',
      predictedQuestion: 'How much of your revenue growth is coming from volume versus price?',
      wasAsked: true,
      actualPhrasing: 'Can you break out volume and price contribution to growth?',
      similarity: 95,
      recommendedAnswer: 'Q1 growth was 5.5% volume and 3.0% price. We expect this mix to hold through the year...',
      actualAnswer: 'Volume contributed 5.5 points, pricing 3 points. Both sustainable through the year given our value proposition...',
      category: 'Revenue / Growth',
      feedback: 'good-prediction'
    },
    {
      id: '4',
      predictedQuestion: 'What specific actions are you taking to turn around international?',
      wasAsked: true,
      actualPhrasing: 'International remains weak - what\'s the turnaround plan and timeline?',
      similarity: 88,
      recommendedAnswer: 'We have a three-pronged plan: new leadership in Europe, localized product portfolio launching Q3, and streamlined go-to-market...',
      actualAnswer: 'New Europe leadership is in place, we\'re launching localized products in Q3, and simplifying our distribution model. Expect stabilization Q2, growth by Q4...',
      category: 'Region / Segment',
      feedback: 'good-prediction'
    },
    {
      id: '5',
      predictedQuestion: 'Can you provide more color on working capital trends?',
      wasAsked: false,
      actualPhrasing: '',
      similarity: 0,
      recommendedAnswer: 'Cash conversion was 92% in Q1, slightly below our 95% target due to planned inventory build...',
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
      recommendedAnswer: 'The competitive environment remains rational. We have not seen irrational pricing or elevated promotions...',
      actualAnswer: 'Competitive environment is disciplined, no crazy pricing, our market share is holding well...',
      category: 'Competition',
      feedback: 'good-prediction'
    },
    {
      id: '7',
      predictedQuestion: 'Any update on the regulatory environment?',
      wasAsked: false,
      actualPhrasing: '',
      similarity: 0,
      recommendedAnswer: 'We continue to monitor regulatory developments closely. Current proposals would have minimal impact...',
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
      actualAnswer: 'Cloud migration is 60% complete, contributing to efficiency gains. Expect further margin benefit as we complete migration...',
      category: 'Technology',
      feedback: 'missed-question'
    }
  ];

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
          <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Q1 FY26">Q1 FY26</SelectItem>
              <SelectItem value="Q4 FY25">Q4 FY25</SelectItem>
              <SelectItem value="Q3 FY25">Q3 FY25</SelectItem>
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

      {/* Prediction Accuracy Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600">Prediction Rate</span>
              <Target className="w-4 h-4 text-[#ED232A]" />
            </div>
            <div className="text-2xl font-semibold text-slate-900">{accuracyMetrics.questionsCorrectlyPredicted}%</div>
            <div className="mt-2 h-1.5 bg-[#ED232A]/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-[#ED232A] transition-all"
                style={{ width: `${accuracyMetrics.questionsCorrectlyPredicted}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600">Top Concern Recall</span>
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            </div>
            <div className="text-2xl font-semibold text-slate-900">{accuracyMetrics.recallTopConcerns}%</div>
            <div className="mt-2 h-1.5 bg-[#ED232A]/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-[#ED232A] transition-all"
                style={{ width: `${accuracyMetrics.recallTopConcerns}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600">Answer Usefulness</span>
              <Brain className="w-4 h-4 text-[#ED232A]" />
            </div>
            <div className="text-2xl font-semibold text-slate-900">{accuracyMetrics.answerUsefulness}%</div>
            <div className="mt-2 h-1.5 bg-[#ED232A]/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-[#ED232A] transition-all"
                style={{ width: `${accuracyMetrics.answerUsefulness}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600">Confidence Calibration</span>
              <TrendingUp className="w-4 h-4 text-[#ED232A]" />
            </div>
            <div className="text-2xl font-semibold text-slate-900">{accuracyMetrics.confidenceCalibration}%</div>
            <div className="mt-2 h-1.5 bg-[#ED232A]/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-[#ED232A] transition-all"
                style={{ width: `${accuracyMetrics.confidenceCalibration}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600">False Positives</span>
              <AlertCircle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-semibold text-slate-900">{accuracyMetrics.falsePositives}</div>
            <div className="text-xs text-slate-600 mt-1">Questions predicted</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-600">Missed Categories</span>
              <XCircle className="w-4 h-4 text-red-600" />
            </div>
            <div className="text-2xl font-semibold text-slate-900">{accuracyMetrics.missedCategories.length}</div>
            <div className="text-xs text-slate-600 mt-1">Need improvement</div>
          </CardContent>
        </Card>
      </div>

      {/* Model Improvement Insights */}
      <Card className="border-[#ED232A]/30 bg-gradient-to-br from-[#FEE2E2] to-white">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-[#ED232A]" />
            <CardTitle className="text-[#8B1319]">AI Learning Insights</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-white rounded-lg border border-[#ED232A]/20">
                <TrendingDown className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-medium text-slate-900 mb-1">Missed: Cloud migration focus</div>
                  <div className="text-sm text-slate-600">
                    Analysts focused more on technology transformation than predicted. Need stronger mapping to tech trends.
                  </div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-4 bg-white rounded-lg border border-[#ED232A]/20">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-medium text-slate-900 mb-1">Overpredicted: Regulatory concerns</div>
                  <div className="text-sm text-slate-600">
                    Regulatory questions did not materialize despite sector news. Recalibrate sector sensitivity weights.
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-white rounded-lg border border-[#ED232A]/20">
                <TrendingUp className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-medium text-slate-900 mb-1">Strong: Margin question prediction</div>
                  <div className="text-sm text-slate-600">
                    Correctly predicted all margin-related questions with high similarity. Maintain current approach.
                  </div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-4 bg-white rounded-lg border border-[#ED232A]/20">
                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-medium text-slate-900 mb-1">Improved: International segment focus</div>
                  <div className="text-sm text-slate-600">
                    Successfully predicted turnaround questions after Q4 FY25 learning. Model adaptation working well.
                  </div>
                </div>
              </div>
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