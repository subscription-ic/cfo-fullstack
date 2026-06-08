import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { Textarea } from '../../components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { 
  Sparkles, Download, Edit, Save, RotateCcw, AlertTriangle,
  CheckCircle2, Shield, FileText, Mic, Plus, TrendingUp
} from 'lucide-react';
import { predictedQuestions } from '../../data/mockData';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Progress } from '../../components/ui/progress';
import { toast } from 'sonner';
import { downloadHTMLFile, generateCheatSheet } from '../../utils/downloadHelpers';

export default function EarningsCallSimulator() {
  const [selectedScenario, setSelectedScenario] = useState('base');
  const [selectedQuestionId, setSelectedQuestionId] = useState(predictedQuestions[0].id);
  const [isEditing, setIsEditing] = useState(false);
  const [customAnswer, setCustomAnswer] = useState('');
  
  const selectedQuestion = predictedQuestions.find(q => q.id === selectedQuestionId) || predictedQuestions[0];

  const scenarios = [
    { value: 'base', label: 'Base Case' },
    { value: 'conservative', label: 'Conservative Street View' },
    { value: 'bearish', label: 'Bearish Analyst View' },
    { value: 'activist', label: 'Activist Investor Mode' },
    { value: 'board', label: 'Board Prep Mode' }
  ];

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'high': return 'bg-[#C00000]/10 text-[#C00000] border-[#C00000]/20';
      case 'medium': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'low': return 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  // Handler functions
  const handleExportCheatSheet = () => {
    toast.loading('Generating Cheat Sheet...', { id: 'cheat-sheet' });
    
    setTimeout(() => {
      const content = generateCheatSheet(predictedQuestions);
      downloadHTMLFile(content, `Earnings-Call-Cheat-Sheet-${new Date().toISOString().split('T')[0]}.html`);
      
      toast.success('Cheat Sheet Downloaded', {
        id: 'cheat-sheet',
        description: 'Your earnings call cheat sheet has been saved to your downloads.',
      });
    }, 1000);
  };

  const handleRecordAnswer = () => {
    toast.info('Recording Started', {
      description: 'Microphone activated. Start speaking your answer.',
    });
  };

  const handleEvaluateResponse = () => {
    toast.success('Response Evaluated', {
      description: 'AI confidence score: 87%. Good narrative consistency.',
    });
  };

  const handleSave = () => {
    toast.success('Changes Saved', {
      description: 'Your custom answer has been saved successfully.',
    });
  };

  const handleGenerateBetterAnswer = () => {
    toast.loading('Generating Answer...', { id: 'better-answer' });
    setTimeout(() => {
      toast.success('New Answer Generated', {
        id: 'better-answer',
        description: 'A refined answer has been generated based on your input.',
      });
    }, 2000);
  };

  const handleResetToOriginal = () => {
    setCustomAnswer('');
    toast.info('Reset Complete', {
      description: 'Answer has been reset to the original recommendation.',
    });
  };

  const handleAddTalkingPoint = () => {
    toast.success('Talking Point Added', {
      description: 'You can now edit your custom talking point.',
    });
  };

  const handleGenerateFollowUp = () => {
    toast.loading('Generating Follow-Up Q&A...', { id: 'follow-up' });
    setTimeout(() => {
      toast.success('Follow-Up Questions Ready', {
        id: 'follow-up',
        description: '5 potential follow-up questions have been generated.',
      });
    }, 1500);
  };

  const handleAddToPrepSheet = () => {
    toast.success('Added to Prep Sheet', {
      description: 'This Q&A has been added to your preparation materials.',
    });
  };

  const handleRegenerateAnswer = () => {
    toast.loading('Regenerating Answer...', { id: 'regenerate' });
    setTimeout(() => {
      toast.success('Answer Regenerated', {
        id: 'regenerate',
        description: 'A new answer version is now available.',
      });
    }, 2000);
  };

  const handleCompareVersions = () => {
    toast.info('Opening Comparison', {
      description: 'View side-by-side comparison of answer versions.',
    });
  };

  const handleGenerateAIAnswer = () => {
    toast.loading('Generating AI Answer...', { id: 'ai-answer' });
    setTimeout(() => {
      toast.success('Answer Generated', {
        id: 'ai-answer',
        description: 'AI-powered answer is ready for your custom question.',
      });
    }, 2000);
  };

  return (
    <div className="p-6 space-y-6 max-w-[1800px] mx-auto">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-[#002850] mb-2">Earnings Call Simulator</h1>
          <p className="text-slate-600">AI-powered Q&A preparation and answer generator</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedScenario} onValueChange={setSelectedScenario}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scenarios.map(s => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button variant="outline" onClick={handleExportCheatSheet} className="border-[#004C8F] text-[#004C8F] hover:bg-[#E8F2F9]">
            <FileText className="w-4 h-4 mr-2" />
            Generate Cheat Sheet
          </Button>

          <Dialog>
            <DialogTrigger asChild>
              <Button className="bg-[#C00000] hover:bg-[#C00000] text-white">
                <Mic className="w-4 h-4 mr-2" />
                Live Rehearsal Mode
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle className="text-[#002850]">Live Rehearsal Mode</DialogTitle>
                <DialogDescription>
                  Practice your answers in real-time with AI evaluation
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="p-6 bg-gradient-to-br from-[#E8F2F9] to-blue-50 rounded-lg border border-[#004C8F]/20">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-[#004C8F] flex items-center justify-center">
                      <Sparkles className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <div className="font-medium text-[#002850]">AI Analyst</div>
                      <div className="text-sm text-slate-600">Ready to ask questions</div>
                    </div>
                  </div>
                  <div className="p-4 bg-white rounded-lg border mb-4">
                    <p className="text-[#002850]">
                      Can you walk through the key drivers of the 120 bps margin expansion this quarter and how sustainable is this into Q2?
                    </p>
                  </div>
                  <Textarea 
                    placeholder="Type or speak your answer here..."
                    className="min-h-[120px] mb-4"
                  />
                  <div className="flex gap-2">
                    <Button className="flex-1 bg-[#004C8F] hover:bg-[#003d70] text-white" onClick={handleRecordAnswer}>
                      <Mic className="w-4 h-4 mr-2" />
                      Record Answer
                    </Button>
                    <Button variant="outline" className="flex-1 border-[#004C8F] text-[#004C8F] hover:bg-[#E8F2F9]" onClick={handleEvaluateResponse}>
                      Evaluate Response
                    </Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Scenario Alert */}
      {selectedScenario !== 'base' && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-medium text-amber-900">
              {selectedScenario === 'bearish' && 'Bearish Scenario Mode'}
              {selectedScenario === 'conservative' && 'Conservative Street View'}
              {selectedScenario === 'activist' && 'Activist Investor Mode'}
              {selectedScenario === 'board' && 'Board Preparation Mode'}
            </div>
            <div className="text-sm text-amber-800 mt-1">
              Questions and answers are adjusted for this scenario. Expect more challenging and skeptical inquiries.
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Panel: Predicted Questions */}
        <Card className="lg:col-span-1 border-[#d4dce6]">
          <CardHeader>
            <CardTitle className="text-[#002850]">AI Predicted Questions</CardTitle>
            <p className="text-sm text-slate-600">
              Ranked by likelihood and difficulty
            </p>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[800px] pr-4">
              <div className="space-y-3">
                {predictedQuestions.map(q => (
                  <Card 
                    key={q.id}
                    className={`cursor-pointer transition-all ${ 
                      selectedQuestionId === q.id 
                        ? 'border-[#004C8F] border-2 shadow-md' 
                        : 'border-slate-200 hover:border-[#004C8F]/50'
                    }`}
                    onClick={() => setSelectedQuestionId(q.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <Badge variant="outline" className="text-xs border-[#004C8F] text-[#004C8F]">
                          {q.category}
                        </Badge>
                        <div className="flex gap-1">
                          <Badge className="bg-[#004C8F]/10 text-[#004C8F] text-xs border-[#004C8F]/20">
                            {q.likelihood}%
                          </Badge>
                        </div>
                      </div>
                      
                      <p className="text-sm text-[#002850] font-medium mb-3 line-clamp-3">
                        {q.question}
                      </p>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-600">Difficulty:</span>
                          <div className="flex items-center gap-1">
                            <Progress value={q.difficulty * 10} className="w-16 h-1.5" />
                            <span className="text-[#002850] font-medium">{q.difficulty}/10</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-600">Risk Level:</span>
                          <Badge className={`${getRiskColor(q.riskLevel)} text-xs`}>
                            {q.riskLevel}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Center/Right Panel: Answer Workspace */}
        <Card className="lg:col-span-2 border-[#d4dce6]">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-[#002850]">Question & Answer Workspace</CardTitle>
                <p className="text-sm text-slate-600 mt-1">
                  {selectedQuestion.analystPersona}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="border-[#004C8F] text-[#004C8F] hover:bg-[#E8F2F9]" onClick={handleSave}>
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </Button>
                <Button variant="outline" size="sm" className="border-[#004C8F] text-[#004C8F] hover:bg-[#E8F2F9]" onClick={() => setIsEditing(!isEditing)}>
                  <Edit className="w-4 h-4 mr-2" />
                  {isEditing ? 'Cancel' : 'Edit'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Question Card */}
            <div className="p-5 bg-[#E8F2F9] rounded-lg border border-[#004C8F]/20">
              <div className="flex items-start justify-between mb-3">
                <Badge variant="outline" className="border-[#004C8F] text-[#004C8F]">{selectedQuestion.category}</Badge>
                <div className="flex gap-2">
                  <Badge className="bg-[#004C8F]/10 text-[#004C8F] border-[#004C8F]/20">
                    Likelihood: {selectedQuestion.likelihood}%
                  </Badge>
                  <Badge className="bg-slate-100 text-slate-800">
                    Difficulty: {selectedQuestion.difficulty}/10
                  </Badge>
                </div>
              </div>
              <p className="text-lg font-medium text-[#002850]">
                {selectedQuestion.question}
              </p>
            </div>

            {/* Why AI Predicts This */}
            <div className="p-4 bg-[#E8F2F9] rounded-lg border border-[#004C8F]/20">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-[#004C8F]" />
                <span className="font-medium text-[#002850]">Why AI Predicts This Question</span>
              </div>
              <p className="text-sm text-slate-700">{selectedQuestion.reasoning}</p>
            </div>

            {/* Tabs for Answer Content */}
            <Tabs defaultValue="recommended">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="recommended">Recommended Answer</TabsTrigger>
                <TabsTrigger value="talking-points">Talking Points</TabsTrigger>
                <TabsTrigger value="evidence">Evidence</TabsTrigger>
                <TabsTrigger value="stress-test">Stress Test</TabsTrigger>
              </TabsList>

              <TabsContent value="recommended" className="space-y-4 mt-4">
                {isEditing ? (
                  <div className="space-y-3">
                    <Textarea 
                      defaultValue={selectedQuestion.recommendedAnswer}
                      className="min-h-[200px]"
                      onChange={(e) => setCustomAnswer(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button className="bg-[#004C8F] hover:bg-[#003d70] text-white" onClick={handleGenerateBetterAnswer}>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate Better Answer
                      </Button>
                      <Button variant="outline" className="border-[#004C8F] text-[#004C8F] hover:bg-[#E8F2F9]" onClick={handleResetToOriginal}>
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Reset to Original
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 bg-white rounded-lg border border-[#d4dce6]">
                    <p className="text-slate-800 leading-relaxed">
                      {selectedQuestion.recommendedAnswer}
                    </p>
                  </div>
                )}

                {/* Confidence Metrics */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-[#10b981]/10 rounded-lg border border-[#10b981]/20">
                    <div className="text-sm text-[#10b981] mb-1">Confidence Score</div>
                    <div className="text-2xl font-semibold text-[#065f46]">{selectedQuestion.confidence}%</div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-sm text-slate-600 mb-1">Risk if Answered Poorly</div>
                    <Badge className={`${getRiskColor(selectedQuestion.riskLevel)} mt-1`}>
                      {selectedQuestion.riskLevel.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="p-4 bg-[#E8F2F9] rounded-lg border border-[#004C8F]/20">
                    <div className="text-sm text-[#004C8F] mb-1">Narrative Alignment</div>
                    <div className="text-2xl font-semibold text-[#002850]">92%</div>
                  </div>
                </div>

                {/* Flags */}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="px-3 py-1.5 border-[#10b981] text-[#10b981]">
                    <Shield className="w-3 h-3 mr-1" />
                    Needs Legal Review: No
                  </Badge>
                  <Badge variant="outline" className="px-3 py-1.5 border-[#10b981] text-[#10b981]">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Disclosure Safe
                  </Badge>
                  <Badge className="bg-[#10b981]/10 text-[#10b981] px-3 py-1.5 border-[#10b981]/20">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Board Approved
                  </Badge>
                </div>
              </TabsContent>

              <TabsContent value="talking-points" className="mt-4">
                <div className="space-y-3">
                  {selectedQuestion.talkingPoints.map((point, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-4 bg-[#E8F2F9] rounded-lg">
                      <div className="w-6 h-6 rounded-full bg-[#004C8F] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-sm font-medium text-white">{idx + 1}</span>
                      </div>
                      <p className="text-slate-800">{point}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <Button variant="outline" className="w-full border-[#004C8F] text-[#004C8F] hover:bg-[#E8F2F9]" onClick={handleAddTalkingPoint}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Custom Talking Point
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="evidence" className="mt-4">
                <div className="space-y-3">
                  {selectedQuestion.evidencePoints.map((evidence, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-4 bg-[#10b981]/10 rounded-lg border border-[#10b981]/20">
                      <CheckCircle2 className="w-5 h-5 text-[#10b981] flex-shrink-0 mt-0.5" />
                      <p className="text-slate-800">{evidence}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-4 bg-[#E8F2F9] rounded-lg border border-[#004C8F]/20">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-[#004C8F]" />
                    <span className="font-medium text-[#002850]">Historical Consistency</span>
                  </div>
                  <p className="text-sm text-slate-700">
                    This answer aligns with Q4 FY25 and Q3 FY25 commentary on margin drivers. No contradictions detected.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="stress-test" className="mt-4">
                <div className="space-y-4">
                  <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600" />
                      <span className="font-medium text-amber-900">Answer Stress Test</span>
                    </div>
                    <div className="space-y-3 text-sm">
                      <div>
                        <div className="font-medium text-amber-900 mb-1">Potential Follow-Up Questions:</div>
                        <ul className="list-disc list-inside text-amber-800 space-y-1 ml-2">
                          <li>What happens if product mix normalizes faster than expected?</li>
                          <li>How much of the efficiency gains are one-time vs recurring?</li>
                          <li>What is your pricing assumption for Q2?</li>
                        </ul>
                      </div>
                      <div>
                        <div className="font-medium text-amber-900 mb-1">Potential Weaknesses:</div>
                        <ul className="list-disc list-inside text-amber-800 space-y-1 ml-2">
                          <li>May need more specificity on automation investments</li>
                          <li>Mix sustainability claim could be challenged</li>
                        </ul>
                      </div>
                      <div>
                        <div className="font-medium text-amber-900 mb-1">Risk Flags:</div>
                        <ul className="list-disc list-inside text-amber-800 space-y-1 ml-2">
                          <li>Ensure consistency with IR deck margin bridge</li>
                          <li>Verify pricing elasticity data is current</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <Button variant="outline" className="w-full border-[#004C8F] text-[#004C8F] hover:bg-[#E8F2F9]" onClick={handleGenerateFollowUp}>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Follow-Up Q&A
                  </Button>
                </div>
              </TabsContent>
            </Tabs>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t">
              <Button variant="outline" className="flex-1 border-[#004C8F] text-[#004C8F] hover:bg-[#E8F2F9]" onClick={handleAddToPrepSheet}>
                <Edit className="w-4 h-4 mr-2" />
                Add to Prep Sheet
              </Button>
              <Button variant="outline" className="flex-1 border-[#004C8F] text-[#004C8F] hover:bg-[#E8F2F9]" onClick={handleRegenerateAnswer}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Regenerate Answer
              </Button>
              <Button className="flex-1 bg-[#004C8F] hover:bg-[#003d70] text-white" onClick={handleCompareVersions}>
                <Sparkles className="w-4 h-4 mr-2" />
                Compare Versions
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Custom Question Section */}
      <Card className="border-[#d4dce6]">
        <CardHeader>
          <CardTitle className="text-[#002850]">Add Custom Question</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  Question
                </label>
                <Textarea 
                  placeholder="Enter a custom question you want to prepare for..."
                  className="min-h-[100px]"
                />
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    Category
                  </label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="revenue">Revenue / Growth</SelectItem>
                      <SelectItem value="margin">Margin / Profitability</SelectItem>
                      <SelectItem value="guidance">Guidance</SelectItem>
                      <SelectItem value="capital">Capital Allocation</SelectItem>
                      <SelectItem value="competition">Competition</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full bg-[#004C8F] hover:bg-[#003d70] text-white" onClick={handleGenerateAIAnswer}>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate AI Answer
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
