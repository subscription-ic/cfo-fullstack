import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { 
  TrendingUp, TrendingDown, ArrowLeft, Users, MessageSquare, ThumbsUp, ThumbsDown, Sparkles, Send, Bot, User, FileText
} from 'lucide-react';
import { historicalQuarters, QuarterData } from '../data/mockData';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ScrollArea } from '../components/ui/scroll-area';
import { toast } from 'sonner';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../components/ui/accordion';

interface ChatMessage {
  id: number;
  type: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

export default function HistoricalIntelligenceHub() {
  const navigate = useNavigate();
  const [selectedQuarter, setSelectedQuarter] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      type: 'ai',
      text: 'Hello! I\'m your AI assistant. Ask me anything about your historical earnings data, and I can generate summaries, insights, and analysis.',
      timestamp: new Date(),
    }
  ]);
  const [chatInput, setChatInput] = useState('');

  // Find the current quarter based on selection
  const currentQuarter = selectedQuarter 
    ? historicalQuarters.find(q => `${q.quarter} ${q.fiscalYear}` === selectedQuarter)
    : null;

  // Word cloud data from last 3 quarters
  const wordCloudData = [
    { text: 'Revenue Growth', size: 1.8 },
    { text: 'Margins', size: 1.6 },
    { text: 'International', size: 1.5 },
    { text: 'Product Innovation', size: 1.4 },
    { text: 'Market Share', size: 1.4 },
    { text: 'Operating Efficiency', size: 1.3 },
    { text: 'Customer Acquisition', size: 1.3 },
    { text: 'Guidance', size: 1.2 },
    { text: 'Competition', size: 1.2 },
    { text: 'Cloud Services', size: 1.2 },
    { text: 'AI Integration', size: 1.1 },
    { text: 'Supply Chain', size: 1.1 },
    { text: 'Cost Control', size: 1.1 },
    { text: 'Free Cash Flow', size: 1.0 },
    { text: 'Partnerships', size: 1.0 },
  ];

  const colors = ['#ED232A', '#DC2626', '#B91C1C', '#991B1B', '#7F1D1D'];

  const handleGenerateSummary = () => {
    if (!currentQuarter) return;
    
    toast.loading('Generating AI Summary...', { id: 'ai-summary' });
    
    setTimeout(() => {
      const summaryContent = `
        <h2>AI-Generated Summary - ${selectedQuarter}</h2>
        <p><strong>Overall Performance:</strong> ${currentQuarter.beatMeetMiss === 'beat' ? 'Beat' : 'Met'} expectations with revenue of $${currentQuarter.revenue / 1000}B (${currentQuarter.revenueGrowth}% YoY growth)</p>
        <p><strong>Key Highlights:</strong></p>
        <ul>
          ${currentQuarter.highlights.map(h => `<li>${h}</li>`).join('')}
        </ul>
        <p><strong>Market Reaction:</strong> Positive sentiment with stock up 4.2%</p>
        <p><strong>Analyst Consensus:</strong> 15 Buy, 3 Hold, 0 Sell</p>
      `;
      
      const blob = new Blob([summaryContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `AI-Summary-${selectedQuarter.replace(' ', '-')}.html`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success('AI Summary Generated', {
        id: 'ai-summary',
        description: `Summary for ${selectedQuarter} has been downloaded.`,
      });
    }, 1500);
  };

  // Mock data for questions and attendees
  const mockQuestions = [
    { id: 1, analyst: 'Sarah Chen - Goldman Sachs', question: 'Can you elaborate on the margin expansion drivers for the quarter?' },
    { id: 2, analyst: 'Michael Roberts - Morgan Stanley', question: 'What\'s the outlook for international revenue growth?' },
    { id: 3, analyst: 'Jennifer Liu - JP Morgan', question: 'How are you thinking about capital allocation priorities?' },
    { id: 4, analyst: 'David Martinez - Bank of America', question: 'Can you provide more color on the competitive landscape?' },
    { id: 5, analyst: 'Emily Watson - Credit Suisse', question: 'What are the key risks to achieving your guidance?' },
  ];

  const mockAttendees = [
    { name: 'John Smith', title: 'Chief Financial Officer' },
    { name: 'Sarah Johnson', title: 'Chief Executive Officer' },
    { name: 'Robert Chen', title: 'VP Investor Relations' },
    { name: 'Lisa Anderson', title: 'Chief Operating Officer' },
  ];

  const handleChatSubmit = () => {
    if (!chatInput.trim()) return;
    
    const newMessage: ChatMessage = {
      id: chatMessages.length + 1,
      type: 'user',
      text: chatInput,
      timestamp: new Date(),
    };
    
    const updatedMessages = [...chatMessages, newMessage];
    setChatMessages(updatedMessages);
    const userQuestion = chatInput.toLowerCase();
    setChatInput('');
    
    // Simulate AI response with contextual intelligence
    setTimeout(() => {
      let aiResponse = '';
      
      // Generate contextual responses based on keywords
      if (userQuestion.includes('summary') || userQuestion.includes('summarize')) {
        const quarter = userQuestion.match(/q[1-4]\s*20\d{2}/i)?.[0] || selectedQuarter || 'the selected quarter';
        aiResponse = `I've generated a comprehensive summary for ${quarter}. Based on the historical data, the company demonstrated strong performance with revenue growth of 8.5% YoY. Key highlights include margin expansion, successful international market penetration, and positive analyst sentiment. The earnings call was well-received with primarily strategic questions from top-tier investment banks. Would you like me to download this summary as a file?`;
      } else if (userQuestion.includes('compare') || userQuestion.includes('trend')) {
        aiResponse = `Analyzing trends across the selected quarters: Revenue has shown consistent growth quarter-over-quarter, with Q4 2024 showing the strongest performance at $5.2B (+8.5% YoY). EBITDA margins improved from 22.1% to 24.3%, indicating strong operational efficiency. The sentiment has been predominantly positive, with analyst upgrades following each earnings call. Key growth drivers include international expansion and product innovation.`;
      } else if (userQuestion.includes('concern') || userQuestion.includes('risk') || userQuestion.includes('negative')) {
        aiResponse = `Based on historical data, the main concerns raised by analysts include: (1) Competitive pressure in international markets, (2) Rising operational costs impacting margins, (3) Supply chain vulnerabilities, and (4) Execution risks on new product launches. However, management has consistently addressed these concerns with concrete action plans and mitigation strategies.`;
      } else if (userQuestion.includes('sentiment') || userQuestion.includes('analyst')) {
        aiResponse = `Sentiment analysis across the last 3 quarters shows overwhelmingly positive reception. Analyst consensus is "Buy" with 15 Buy ratings, 3 Hold, and 0 Sell. Market reaction has been positive with average 4-5% stock price increases post-earnings. Key positive themes include strong execution, margin expansion, and clear strategic vision. The sentiment score has improved from 7.5/10 to 8.9/10 over this period.`;
      } else if (userQuestion.includes('download') || userQuestion.includes('export') || userQuestion.includes('file')) {
        aiResponse = `I can help you download various reports and summaries. Please select a quarter from the dropdown above, then use the "Generate AI Summary" button to download a comprehensive HTML report with all key metrics, highlights, and analysis. You can also export specific data sections using the action buttons throughout the interface.`;
      } else if (userQuestion.includes('question') || userQuestion.includes('asked')) {
        aiResponse = `The most frequently asked questions across recent earnings calls focus on: (1) Revenue growth sustainability and guidance, (2) Margin expansion drivers and sustainability, (3) International market strategy and execution, (4) Capital allocation priorities including M&A and dividends, and (5) Competitive positioning in key markets. Most questions came from Goldman Sachs, Morgan Stanley, JP Morgan, and Bank of America analysts.`;
      } else {
        // Generic helpful response
        aiResponse = `I'm here to help analyze your historical earnings data. I can: 
        
• Generate summaries for specific quarters
• Compare trends across multiple periods
• Analyze sentiment and market reactions
• Identify key concerns and risks
• Explain specific metrics and performance indicators
• Export downloadable reports

Please feel free to ask specific questions about revenue, margins, analyst sentiment, or any other aspect of your earnings history!`;
      }
      
      const aiMessage: ChatMessage = {
        id: updatedMessages.length + 1,
        type: 'ai',
        text: aiResponse,
        timestamp: new Date(),
      };
      
      setChatMessages([...updatedMessages, aiMessage]);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Button 
              variant="ghost" 
              onClick={() => navigate('/dashboard')}
              className="mb-3 text-[#ED232A] hover:text-[#B91C1C] hover:bg-[#FEE2E2]"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <h1 className="text-3xl font-semibold text-[#002850] mb-2">Historical Intelligence Hub</h1>
            <p className="text-slate-600">Explore past earnings calls with comprehensive analysis</p>
          </div>
        </div>

        {/* Persistent Section - Always Visible */}
        <div className="space-y-6">
          {/* Word Cloud - Key Topics (Last 3 Quarters) */}
          <Card className="border-[#ED232A]/30 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-[#FEE2E2] to-white border-b border-[#d4dce6]">
              <CardTitle className="text-[#002850] text-xl">Key Topics - Last 3 Quarters</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="h-[250px] bg-white rounded-lg border border-[#d4dce6]/50 flex flex-wrap items-center justify-center gap-3 p-6">
                {wordCloudData.map((word, idx) => (
                  <span
                    key={idx}
                    style={{
                      fontSize: `${word.size}rem`,
                      color: colors[idx % colors.length],
                    }}
                    className="font-semibold hover:opacity-70 transition-opacity cursor-pointer"
                  >
                    {word.text}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Generate AI Summary Button - Always Visible */}
          <div className="flex justify-center">
            <Button 
              onClick={handleGenerateSummary}
              disabled={!selectedQuarter}
              className="bg-[#ED232A] hover:bg-[#B91C1C] text-white px-8 h-12 text-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-5 h-5 mr-2" />
              Generate AI Summary
              {selectedQuarter && <span className="ml-2 text-sm">({selectedQuarter})</span>}
            </Button>
          </div>
        </div>

        {/* Quarter Selection */}
        <Card className="border-[#ED232A]/30 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-[#FEE2E2] to-white border-b border-[#d4dce6]">
            <CardTitle className="text-[#002850] text-xl">Select Quarter for Detailed Analysis</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <Select value={selectedQuarter} onValueChange={(value) => {
              setSelectedQuarter(value);
              // Auto-generate AI summary when quarter is selected
              const quarter = historicalQuarters.find(q => `${q.quarter} ${q.fiscalYear}` === value);
              if (quarter) {
                setTimeout(() => {
                  const summary = `Based on comprehensive analysis of ${value}, the company demonstrated ${quarter.beatMeetMiss === 'beat' ? 'exceptional' : 'solid'} performance with revenue of $${quarter.revenue / 1000}B, representing ${quarter.revenueGrowth}% year-over-year growth. EBITDA margins expanded to ${quarter.ebitdaMargin}%, reflecting strong operational efficiency and cost discipline.

Key highlights from the quarter include: ${quarter.highlights.slice(0, 2).join('; ')}.

The earnings call received positive reception from the analyst community, with particularly strong focus on ${quarter.themes.slice(0, 3).join(', ')}. Management's commentary was well-received, addressing key investor concerns with clear strategic vision and execution roadmap.

Market reaction post-earnings was favorable, with the stock experiencing positive momentum. The consensus analyst rating remains "Buy" with an average price target increase of 8-12%. Institutional investors highlighted the company's consistent execution and expanding competitive moat as key investment drivers.`;
                  setAiSummary(summary);
                }, 500);
              }
            }}>
              <SelectTrigger className="w-full max-w-sm border-[#ED232A] h-11">
                <SelectValue placeholder="Choose a quarter to explore..." />
              </SelectTrigger>
              <SelectContent>
                {historicalQuarters.map(q => (
                  <SelectItem key={`${q.quarter}-${q.fiscalYear}`} value={`${q.quarter} ${q.fiscalYear}`}>
                    {q.quarter} {q.fiscalYear}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* AI-Generated Summary - Appears automatically when quarter is selected */}
        {selectedQuarter && aiSummary && currentQuarter && (
          <Card className="border-[#ED232A]/30 shadow-lg bg-gradient-to-br from-white to-[#FEE2E2]/30">
            <CardHeader className="bg-gradient-to-r from-[#ED232A] to-[#B91C1C] text-white border-b">
              <CardTitle className="text-xl flex items-center gap-2">
                <Sparkles className="w-6 h-6" />
                AI-Generated Summary - {selectedQuarter}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="prose prose-sm max-w-none">
                <p className="text-slate-700 leading-relaxed whitespace-pre-line">{aiSummary}</p>
              </div>
              <div className="mt-4 pt-4 border-t border-[#d4dce6] flex gap-3">
                <Button 
                  onClick={handleGenerateSummary}
                  size="sm"
                  className="bg-[#ED232A] hover:bg-[#B91C1C] text-white"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Download Full Report
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quarter Details - Only shown when quarter is selected */}
        {selectedQuarter && currentQuarter && (
          <>
            {/* Key Metrics */}
            <div className="grid md:grid-cols-4 gap-4">
              <Card className="border-[#d4dce6]">
                <CardContent className="p-4">
                  <div className="text-sm text-slate-600 mb-1">Revenue</div>
                  <div className="text-2xl font-semibold text-[#002850]">${currentQuarter.revenue / 1000}B</div>
                  <div className="text-sm text-[#10b981] mt-1">+{currentQuarter.revenueGrowth}% YoY</div>
                </CardContent>
              </Card>
              <Card className="border-[#d4dce6]">
                <CardContent className="p-4">
                  <div className="text-sm text-slate-600 mb-1">EBITDA Margin</div>
                  <div className="text-2xl font-semibold text-[#002850]">{currentQuarter.ebitdaMargin}%</div>
                  <div className="text-sm text-[#ED232A] mt-1">+120 bps</div>
                </CardContent>
              </Card>
              <Card className="border-[#d4dce6]">
                <CardContent className="p-4">
                  <div className="text-sm text-slate-600 mb-1">vs Expectations</div>
                  <Badge className="bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20 mt-2">
                    {currentQuarter.beatMeetMiss.toUpperCase()}
                  </Badge>
                </CardContent>
              </Card>
              <Card className="border-[#d4dce6]">
                <CardContent className="p-4">
                  <div className="text-sm text-slate-600 mb-1">Call Difficulty</div>
                  <div className="text-2xl font-semibold text-[#002850]">{currentQuarter.callDifficulty}/10</div>
                </CardContent>
              </Card>
            </div>

            {/* Collapsible Sections */}
            <Accordion type="multiple" className="space-y-4">
              {/* Questions Asked */}
              <AccordionItem value="questions" className="border rounded-lg bg-white shadow-sm">
                <AccordionTrigger className="px-6 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-5 h-5 text-[#ED232A]" />
                    <span className="font-semibold text-[#002850] text-lg">Questions Asked During Call</span>
                    <Badge variant="outline" className="border-[#ED232A] text-[#ED232A]">{mockQuestions.length}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6">
                  <div className="space-y-3 pt-2">
                    {mockQuestions.map(q => (
                      <div key={q.id} className="p-4 bg-[#FEE2E2]/50 rounded-lg border border-[#ED232A]/20">
                        <div className="font-medium text-[#002850] mb-2">{q.question}</div>
                        <div className="text-sm text-slate-600">{q.analyst}</div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Attendees */}
              <AccordionItem value="attendees" className="border rounded-lg bg-white shadow-sm">
                <AccordionTrigger className="px-6 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-[#ED232A]" />
                    <span className="font-semibold text-[#002850] text-lg">Call Attendees</span>
                    <Badge variant="outline" className="border-[#ED232A] text-[#ED232A]">{mockAttendees.length}</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6">
                  <div className="grid md:grid-cols-2 gap-3 pt-2">
                    {mockAttendees.map((attendee, idx) => (
                      <div key={idx} className="p-4 bg-[#FEE2E2]/50 rounded-lg border border-[#ED232A]/20">
                        <div className="font-medium text-[#002850]">{attendee.name}</div>
                        <div className="text-sm text-slate-600">{attendee.title}</div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Key Themes */}
              <AccordionItem value="themes" className="border rounded-lg bg-white shadow-sm">
                <AccordionTrigger className="px-6 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-[#ED232A]" />
                    <span className="font-semibold text-[#002850] text-lg">Key Discussion Themes</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6">
                  <div className="pt-2">
                    <div className="flex flex-wrap gap-2">
                      {currentQuarter.themes.map((theme, idx) => (
                        <Badge key={idx} className="bg-[#FEE2E2] text-[#ED232A] border-[#ED232A]/30 px-3 py-1.5">
                          {theme}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Overall Sentiment */}
              <AccordionItem value="sentiment" className="border rounded-lg bg-white shadow-sm">
                <AccordionTrigger className="px-6 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="w-5 h-5 text-[#10b981]" />
                    <span className="font-semibold text-[#002850] text-lg">Overall Sentiment Analysis</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6">
                  <div className="space-y-4 pt-2">
                    <div className="p-4 bg-[#10b981]/5 border border-[#10b981]/20 rounded-lg">
                      <div className="text-sm font-medium text-[#10b981] mb-2">Positive Sentiment</div>
                      <ul className="space-y-1.5">
                        {currentQuarter.marketChatter.positive.slice(0, 3).map((item, idx) => (
                          <li key={idx} className="text-sm text-slate-700 flex items-start gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] mt-1.5 flex-shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="p-4 bg-[#E31837]/5 border border-[#E31837]/20 rounded-lg">
                      <div className="text-sm font-medium text-[#E31837] mb-2">Concerns Raised</div>
                      <ul className="space-y-1.5">
                        {currentQuarter.marketChatter.negative.slice(0, 3).map((item, idx) => (
                          <li key={idx} className="text-sm text-slate-700 flex items-start gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#E31837] mt-1.5 flex-shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="p-4 bg-[#FEE2E2] rounded-lg border border-[#ED232A]/20">
                      <div className="text-sm font-medium text-[#ED232A] mb-2">Analyst Consensus</div>
                      <div className="text-2xl font-semibold text-[#002850]">Positive</div>
                      <div className="text-sm text-slate-600 mt-1">15 Buy • 3 Hold • 0 Sell</div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </>
        )}

        {/* Empty State when no quarter selected */}
        {!selectedQuarter && (
          <Card className="border-[#d4dce6] p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 rounded-full bg-[#FEE2E2] flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-8 h-8 text-[#ED232A]" />
              </div>
              <h3 className="text-xl font-semibold text-[#002850] mb-2">
                Select a Quarter to Begin
              </h3>
              <p className="text-slate-600">
                Choose a quarter from the dropdown above to explore detailed earnings call analysis, questions, attendees, and more.
              </p>
            </div>
          </Card>
        )}

        {/* Chat Section */}
        <div className="space-y-6">
          {/* AI Chat Assistant - Always Visible */}
          <Card className="border-[#ED232A]/30 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-[#FEE2E2] to-white border-b border-[#d4dce6]">
              <CardTitle className="text-[#002850] text-xl flex items-center gap-2">
                <Bot className="w-6 h-6 text-[#ED232A]" />
                AI Intelligence Assistant
              </CardTitle>
              <p className="text-sm text-slate-600 mt-1">Ask me anything about your historical earnings data</p>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {/* Chat Messages */}
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-4">
                  {chatMessages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex gap-3 max-w-[85%] ${msg.type === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                        {/* Avatar */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.type === 'user' ? 'bg-[#ED232A]' : 'bg-gradient-to-br from-[#FEE2E2] to-[#ED232A]/20 border border-[#ED232A]/30'}`}>
                          {msg.type === 'user' ? (
                            <User className="w-4 h-4 text-white" />
                          ) : (
                            <Bot className="w-4 h-4 text-[#ED232A]" />
                          )}
                        </div>
                        
                        {/* Message Bubble */}
                        <div className={`rounded-2xl p-4 ${msg.type === 'user' ? 'bg-[#ED232A] text-white' : 'bg-white border border-[#d4dce6]'}`}>
                          <div className="text-sm leading-relaxed">
                            {msg.text}
                          </div>
                          <div className={`text-xs mt-2 ${msg.type === 'user' ? 'text-white/70' : 'text-slate-500'}`}>
                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              
              {/* Chat Input */}
              <div className="flex gap-3 pt-4 border-t border-[#d4dce6]">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleChatSubmit()}
                  placeholder="Ask me to generate summaries, analyze trends, or explain metrics..."
                  className="flex-1 border-[#ED232A]/50 focus:border-[#ED232A] h-12"
                />
                <Button
                  onClick={handleChatSubmit}
                  disabled={!chatInput.trim()}
                  className="bg-[#ED232A] hover:bg-[#B91C1C] text-white px-6 h-12 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-5 h-5" />
                </Button>
              </div>
              
              {/* Quick Actions */}
              <div className="pt-2">
                <div className="text-xs font-medium text-slate-600 mb-2">Quick Actions:</div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setChatInput('Generate a summary of Q4 2024')}
                    className="border-[#ED232A]/30 text-[#ED232A] text-xs hover:bg-[#FEE2E2]"
                  >
                    <Sparkles className="w-3 h-3 mr-1.5" />
                    Summary Q4 2024
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setChatInput('Compare Q3 and Q4 revenue trends')}
                    className="border-[#ED232A]/30 text-[#ED232A] text-xs hover:bg-[#FEE2E2]"
                  >
                    <TrendingUp className="w-3 h-3 mr-1.5" />
                    Compare Trends
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setChatInput('What were the key concerns in Q3 2024?')}
                    className="border-[#ED232A]/30 text-[#ED232A] text-xs hover:bg-[#FEE2E2]"
                  >
                    <MessageSquare className="w-3 h-3 mr-1.5" />
                    Key Concerns
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setChatInput('Analyze sentiment across last 3 quarters')}
                    className="border-[#ED232A]/30 text-[#ED232A] text-xs hover:bg-[#FEE2E2]"
                  >
                    <ThumbsUp className="w-3 h-3 mr-1.5" />
                    Sentiment Analysis
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}