import { useState, useEffect } from 'react';
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
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
import { fetchPredictedQuestions, type PredictedQA } from '../utils/api';

interface QuestionItem {
  id: string;
  question: string;
  category: string;
  riskLevel: string;
  suggestedAnswer: string;
  period: string;
  status: 'pending' | 'retained' | 'rejected';
  isCustom?: boolean;
}

function mapApiToQuestion(q: PredictedQA): QuestionItem {
  return {
    id: q.id,
    question: q.predicted_question || q.question || '',
    category: q.category || 'General',
    riskLevel: q.risk?.toLowerCase() ?? 'medium',
    suggestedAnswer: q.suggested_answer || q.answer || '',
    period: q.period ? q.period.split(' ')[0] : 'Q?',
    status: 'pending',
    isCustom: false,
  };
}

export default function EarningsCallStrategist() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCustomQuestion, setNewCustomQuestion] = useState('');
  const [openQuestions, setOpenQuestions] = useState<string[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>("");

  useEffect(() => {
    fetch(`${API_URL}/api/companies`)
      .then(res => res.json())
      .then(data => {
        if (data.companies) {
          setCompanies(data.companies);
        }
      })
      .catch(err => console.error("Failed to fetch companies:", err));
  }, []);

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
      case 'high': return 'bg-[#E31837]/10 text-[#E31837] border-[#E31837]/20';
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
      suggestedAnswer: 'Please provide your own answer for this custom question.',
      period: 'Q?',
      status: 'retained',
      isCustom: true,
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
            h1 { color: #8B1319; border-bottom: 3px solid #ED232A; padding-bottom: 10px; margin-bottom: 30px; }
            .meta { background: white; padding: 20px; border-radius: 8px; margin-bottom: 30px; border-left: 4px solid #ED232A; }
            .question { margin: 20px 0; padding: 25px; border: 1px solid #d4dce6; border-radius: 8px; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            .question h3 { color: #ED232A; margin-top: 0; font-size: 16px; }
            .answer { background: #FFE8EA; padding: 18px; border-radius: 6px; margin-top: 15px; line-height: 1.6; }
            .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 600; margin-right: 8px; }
            .high { background: #E31837; color: white; }
            .medium { background: #fbbf24; color: #78350f; }
            .low { background: #10b981; color: white; }
            .custom { background: #ED232A; color: white; }
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

  const toggleQuestion = (id: string) => {
    setOpenQuestions(prev =>
      prev.includes(id) ? prev.filter(qId => qId !== id) : [...prev, id]
    );
  };

  const retainedQuestions = questions.filter((q: QuestionItem) => q.status === 'retained');
  const retainedCount = retainedQuestions.length;

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading && questions.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 text-[#ED232A] animate-spin mx-auto" />
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
          <AlertCircle className="w-10 h-10 text-[#ED232A] mx-auto" />
          <h2 className="text-xl font-semibold text-[#8B1319]">Failed to load questions</h2>
          <p className="text-slate-600 text-sm">{error}</p>
          <p className="text-slate-500 text-xs">Make sure the FastAPI backend is running on port 8000.</p>
          <Button
            onClick={() => window.location.reload()}
            className="bg-[#ED232A] hover:bg-[#C11B22] text-white"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Button 
              variant="ghost" 
              onClick={() => navigate('/dashboard')}
              className="mb-3 text-[#ED232A] hover:text-[#C11B22] hover:bg-[#FFE8EA]"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <h1 className="text-3xl font-semibold text-[#8B1319] mb-2">Earnings Call Simulator</h1>
            <p className="text-slate-600">Prepare for tough questions with AI-predicted scenarios</p>
          </div>
        </div>

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
          <Card className="lg:col-span-2 border-[#ED232A]/30 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-[#FFE8EA] to-white border-b border-[#d4dce6]">
              <CardTitle className="text-[#8B1319] text-xl">
                AI-Predicted Questions
              </CardTitle>
              <p className="text-sm text-slate-600 mt-2">
                Ranked by likelihood and predictability
              </p>
              
              {/* Add Custom Question Input */}
              <div className="mt-4 space-y-2">
                <div className="text-sm font-medium text-[#8B1319]">Add Custom Question</div>
                <div className="flex gap-2">
                  <Input
                    value={newCustomQuestion}
                    onChange={(e) => setNewCustomQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCustomQuestion()}
                    placeholder="Type your custom question here..."
                    className="flex-1 border-[#ED232A]/50 focus:border-[#ED232A]"
                  />
                  <Button 
                    onClick={handleAddCustomQuestion}
                    className="bg-[#ED232A] hover:bg-[#C11B22] text-white"
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
                  {questions.map((q, idx) => (
                    <Card 
                      key={q.id} 
                      className={`border transition-all ${
                        q.status === 'retained' 
                          ? 'border-[#10b981] bg-[#10b981]/5' 
                          : q.status === 'rejected'
                          ? 'border-[#E31837]/30 bg-[#E31837]/5 opacity-60'
                          : 'border-[#d4dce6] bg-white'
                      }`}
                    >
                      <CardContent className="p-4">
                        {/* Question Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className="text-xs font-semibold text-[#ED232A] border-[#ED232A] bg-white">
                                Q{idx + 1}
                              </Badge>
                              <Badge variant="outline" className="text-xs border-[#ED232A] text-[#ED232A] bg-white">
                                {q.category}
                              </Badge>
                              <Badge className={`text-xs ${getRiskColor(q.riskLevel)}`}>
                                {q.riskLevel}
                              </Badge>
                              {q.isCustom && (
                                <Badge className="text-xs bg-[#ED232A] text-white">
                                  Custom
                                </Badge>
                              )}
                            </div>
                            <div className="font-medium text-[#8B1319] text-sm leading-relaxed">
                              {q.question}
                            </div>
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
                                ? 'bg-[#E31837] hover:bg-[#E31837]'
                                : 'bg-[#E31837]/10 text-[#E31837] hover:bg-[#E31837] hover:text-white'
                            }`}
                          >
                            <X className="w-4 h-4 mr-1.5" />
                            {q.status === 'rejected' ? 'Rejected' : 'Reject'}
                          </Button>
                        </div>

                        {/* Collapsible Suggested Answer */}
                        <Collapsible open={openQuestions.includes(q.id)}>
                          <CollapsibleTrigger 
                            onClick={() => toggleQuestion(q.id)}
                            className="w-full flex items-center justify-between p-3 bg-[#FFE8EA]/50 hover:bg-[#FFE8EA] rounded-lg transition-colors"
                          >
                            <span className="text-sm font-medium text-[#ED232A]">
                              View Suggested Answer
                            </span>
                            {openQuestions.includes(q.id) ? (
                              <ChevronUp className="w-4 h-4 text-[#ED232A]" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-[#ED232A]" />
                            )}
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-3">
                            <div className="p-4 bg-white border border-[#d4dce6] rounded-lg">
                              <div className="text-sm font-medium text-[#ED232A] mb-2">💡 Suggested Answer:</div>
                              <div className="text-sm text-slate-700 leading-relaxed">
                                {q.suggestedAnswer}
                              </div>
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
          <Card className="lg:col-span-1 border-[#ED232A]/30 shadow-lg h-fit sticky top-6">
            <CardHeader className="bg-gradient-to-r from-[#ED232A] to-[#C11B22] text-white">
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
                  <div className="text-2xl font-semibold text-[#ED232A]">{retainedCount}</div>
                </div>
                <div className="p-3 bg-[#FFE8EA] rounded-lg">
                  <div className="text-xs text-slate-600">Custom</div>
                  <div className="text-2xl font-semibold text-[#ED232A]">
                    {retainedQuestions.filter(q => q.isCustom).length}
                  </div>
                </div>
              </div>

              {/* Retained Questions List */}
              <div>
                <div className="text-sm font-medium text-[#8B1319] mb-3">Retained Questions:</div>
                {retainedCount === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    No questions retained yet. Click "Retain" on questions above to add them to your cheat sheet.
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {retainedQuestions.map((q, idx) => (
                        <div key={q.id} className="p-3 bg-[#FFE8EA] rounded-lg border border-[#ED232A]/20">
                          <div className="flex items-start gap-2">
                            <div className="text-xs font-semibold text-[#ED232A] mt-0.5">
                              {idx + 1}.
                            </div>
                            <div className="flex-1">
                              <div className="text-xs text-[#8B1319] leading-relaxed">
                                {q.question}
                              </div>
                              {q.isCustom && (
                                <Badge className="text-xs bg-[#ED232A] text-white mt-1.5">
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
                className="w-full bg-[#ED232A] hover:bg-[#C11B22] text-white disabled:opacity-50"
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
        </div>
        </div>
      </div>
    </div>
  );
}
