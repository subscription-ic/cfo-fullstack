import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../components/ui/accordion';
import { 
  TrendingUp, TrendingDown, FileText, Sparkles, ArrowRight,
  AlertCircle, CheckCircle2, Target
} from 'lucide-react';
import { historicalQuarters, historicalQuestions, earningsReadinessMetrics, analystPersonas, peerBenchmarks } from '../../data/mockData';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { toast } from 'sonner';
import { downloadHTMLFile, generatePrepPackDocument } from '../../utils/downloadHelpers';

export default function QuarterlyIntelligenceHub() {
  const navigate = useNavigate();
  const [selectedQuarter, setSelectedQuarter] = useState('Q1 FY26');
  
  // Find the current quarter based on selection
  const currentQuarter = historicalQuarters.find(
    q => `${q.quarter} ${q.fiscalYear}` === selectedQuarter
  ) || historicalQuarters[0];

  // Prepare chart data
  const revenueData = historicalQuarters.slice(0, 8).reverse().map(q => ({
    quarter: `${q.quarter} ${q.fiscalYear}`,
    revenue: q.revenue / 1000,
    growth: q.revenueGrowth
  }));

  const marginData = historicalQuarters.slice(0, 8).reverse().map(q => ({
    quarter: `${q.quarter} ${q.fiscalYear}`,
    margin: q.ebitdaMargin
  }));

  const questionsByCategory = historicalQuestions.reduce((acc, q) => {
    acc[q.category] = (acc[q.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const categoryData = Object.entries(questionsByCategory).map(([name, value]) => ({
    name,
    value
  }));

  const COLORS = ['#ED232A', '#DC2626', '#B91C1C', '#991B1B', '#7F1D1D', '#E31837', '#002850'];

  const handleGeneratePrepPack = () => {
    toast.loading('Generating Prep Pack...', { id: 'prep-pack' });
    
    setTimeout(() => {
      const content = generatePrepPackDocument(selectedQuarter, currentQuarter);
      downloadHTMLFile(content, `Prep-Pack-${selectedQuarter.replace(' ', '-')}.html`);
      
      toast.success('Prep Pack Downloaded', {
        id: 'prep-pack',
        description: `Comprehensive prep pack for ${selectedQuarter} has been saved to your downloads.`,
      });
    }, 1000);
  };

  return (
    <div className="p-6 space-y-6 max-w-[1800px] mx-auto">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-[#002850] mb-2">Quarterly Intelligence Hub</h1>
          <p className="text-slate-600">Historical earnings performance and intelligence summary</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleGeneratePrepPack} className="border-[#ED232A] text-[#ED232A] hover:bg-[#FEE2E2]">
            <FileText className="w-4 h-4 mr-2" />
            Generate Prep Pack
          </Button>
          <Button onClick={() => navigate('/cfo/simulator')} className="bg-[#ED232A] hover:bg-[#B91C1C] text-white">
            <Sparkles className="w-4 h-4 mr-2" />
            Open Simulator
          </Button>
        </div>
      </div>

      {/* Historical Quarter Analysis - Collapsible */}
      <Card className="border-[#ED232A]/30 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-[#FEE2E2] to-white border-b border-[#d4dce6]">
          <div className="flex items-center justify-between">
            <CardTitle className="text-[#002850] text-2xl">Historical Quarter Analysis</CardTitle>
            <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
              <SelectTrigger className="w-56 border-[#ED232A]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {historicalQuarters.map(q => (
                  <SelectItem key={`${q.quarter}-${q.fiscalYear}`} value={`${q.quarter} ${q.fiscalYear}`}>
                    {q.quarter} {q.fiscalYear}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {/* Key Metrics Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-[#E8F2F9]/50 rounded-lg">
            <div>
              <div className="text-xs text-slate-600 mb-1">Revenue</div>
              <div className="text-xl font-semibold text-[#002850]">${currentQuarter.revenue / 1000}B</div>
              <div className="text-xs text-[#10b981]">+{currentQuarter.revenueGrowth}% YoY</div>
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">EBITDA Margin</div>
              <div className="text-xl font-semibold text-[#002850]">{currentQuarter.ebitdaMargin}%</div>
              <div className="text-xs text-[#ED232A]">+120 bps YoY</div>
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">vs Expectations</div>
              <Badge className="bg-[#10b981]/10 text-[#10b981] hover:bg-[#10b981]/20 border-[#10b981]/20">
                {currentQuarter.beatMeetMiss.toUpperCase()}
              </Badge>
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">Call Difficulty</div>
              <div className="text-xl font-semibold text-[#002850]">{currentQuarter.callDifficulty}/10</div>
            </div>
          </div>

          <Accordion type="multiple" className="space-y-2">
            {/* Pre-Call Insights */}
            <AccordionItem value="pre-call" className="border rounded-lg px-4 bg-white">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-[#ED232A]" />
                  <span className="font-semibold text-[#002850]">Pre-Call Insights</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="p-3 bg-[#FEE2E2] rounded-lg">
                      <div className="text-xs text-[#ED232A] font-medium mb-1">Market Expectations</div>
                      <div className="text-sm text-slate-700">Revenue: $8.3B | EPS: $2.45</div>
                    </div>
                    <div className="p-3 bg-[#FEE2E2] rounded-lg">
                      <div className="text-xs text-[#ED232A] font-medium mb-1">Analyst Sentiment</div>
                      <div className="text-sm text-slate-700">15 Buy, 3 Hold, 0 Sell</div>
                    </div>
                  </div>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="text-xs text-amber-800 font-medium mb-2">Key Concerns</div>
                    <ul className="text-sm text-slate-700 space-y-1">
                      <li className="flex items-start gap-2">
                        <AlertCircle className="w-3 h-3 text-amber-600 mt-0.5 flex-shrink-0" />
                        <span>Margin sustainability questions</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <AlertCircle className="w-3 h-3 text-amber-600 mt-0.5 flex-shrink-0" />
                        <span>International segment performance</span>
                      </li>
                    </ul>
                  </div>
                  <div className="p-3 bg-[#FEE2E2] rounded-lg">
                    <div className="text-xs text-[#ED232A] font-medium mb-1">Predicted Question Count</div>
                    <div className="text-2xl font-semibold text-[#002850]">12-15</div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* During Call Highlights */}
            <AccordionItem value="during-call" className="border rounded-lg px-4 bg-white">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-[#10b981]" />
                  <span className="font-semibold text-[#002850]">During Call Highlights</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  {currentQuarter.highlights.slice(0, 5).map((highlight, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-3 bg-[#10b981]/5 border border-[#10b981]/20 rounded-lg">
                      <CheckCircle2 className="w-4 h-4 text-[#10b981] mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-slate-700">{highlight}</span>
                    </div>
                  ))}
                  <div className="p-3 bg-[#FEE2E2] rounded-lg border border-[#ED232A]/20">
                    <div className="text-xs text-[#ED232A] font-medium mb-2">Guidance Provided</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-slate-600">Revenue</div>
                        <div className="text-sm font-medium text-[#002850]">{currentQuarter.guidance.revenue}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-600">EBITDA</div>
                        <div className="text-sm font-medium text-[#002850]">{currentQuarter.guidance.ebitda}</div>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 bg-[#FEE2E2] rounded-lg">
                    <div className="text-xs text-[#ED232A] font-medium mb-2">Key Themes Discussed</div>
                    <div className="flex flex-wrap gap-1.5">
                      {currentQuarter.themes.map((theme, idx) => (
                        <Badge key={idx} className="bg-white text-[#ED232A] text-xs border-[#ED232A]/30">
                          {theme}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Post-Call Analysis */}
            <AccordionItem value="post-call" className="border rounded-lg px-4 bg-white">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-[#ED232A]" />
                  <span className="font-semibold text-[#002850]">Post-Call Analysis</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="p-3 bg-[#10b981]/10 rounded-lg border border-[#10b981]/20">
                      <div className="text-xs text-[#10b981] font-medium mb-1">Market Reaction</div>
                      <div className="text-2xl font-semibold text-[#10b981]">+4.2%</div>
                      <div className="text-xs text-slate-600">Stock price movement</div>
                    </div>
                    <div className="p-3 bg-[#FEE2E2] rounded-lg">
                      <div className="text-xs text-[#ED232A] font-medium mb-1">Questions Asked</div>
                      <div className="text-2xl font-semibold text-[#002850]">14</div>
                      <div className="text-xs text-slate-600">Total analyst questions</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#10b981] font-medium mb-2">Positive Feedback</div>
                    <div className="space-y-2">
                      {currentQuarter.marketChatter.positive.slice(0, 3).map((item, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-sm text-slate-700 p-2 bg-[#10b981]/5 rounded">
                          <TrendingUp className="w-3 h-3 text-[#10b981] mt-0.5 flex-shrink-0" />
                          <span className="text-xs">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[#E31837] font-medium mb-2">Concerns Raised</div>
                    <div className="space-y-2">
                      {currentQuarter.marketChatter.negative.slice(0, 3).map((item, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-sm text-slate-700 p-2 bg-[#E31837]/5 rounded">
                          <TrendingDown className="w-3 h-3 text-[#E31837] mt-0.5 flex-shrink-0" />
                          <span className="text-xs">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Current Performance Metrics */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card className="border-[#d4dce6]">
          <CardHeader>
            <CardTitle className="text-[#002850] text-lg">Readiness Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-semibold text-[#10b981] mb-2">{earningsReadinessMetrics.overallScore}</div>
            <div className="text-sm text-slate-600">Out of 100</div>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Question Coverage</span>
                <span className="font-medium text-[#002850]">{earningsReadinessMetrics.questionCoverage}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Response Quality</span>
                <span className="font-medium text-[#002850]">{earningsReadinessMetrics.responseQuality}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Simulation Completeness</span>
                <span className="font-medium text-[#002850]">{earningsReadinessMetrics.simulationCompleteness}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#d4dce6]">
          <CardHeader>
            <CardTitle className="text-[#002850] text-lg">Top Question Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(questionsByCategory).slice(0, 5).map(([category, count], idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">{category.split(' / ')[0]}</span>
                  <Badge variant="outline" className="border-[#ED232A] text-[#ED232A]">{count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#ED232A]/30 bg-gradient-to-br from-[#FEE2E2] to-white">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#ED232A]" />
              <CardTitle className="text-[#002850] text-lg">Quick Actions</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full bg-[#ED232A] hover:bg-[#B91C1C] text-white" onClick={() => navigate('/cfo/simulator')}>
              <Sparkles className="w-4 h-4 mr-2" />
              Start Simulation
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button variant="outline" onClick={handleGeneratePrepPack} className="w-full border-[#ED232A] text-[#ED232A] hover:bg-[#FEE2E2]">
              <FileText className="w-4 h-4 mr-2" />
              Download Prep Pack
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Performance Trends */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="border-[#d4dce6]">
          <CardHeader>
            <CardTitle className="text-[#002850]">Revenue Trend (Last 8 Quarters)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d4dce6" />
                <XAxis dataKey="quarter" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="revenue" stroke="#ED232A" strokeWidth={2} dot={{ fill: '#ED232A', r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-[#d4dce6]">
          <CardHeader>
            <CardTitle className="text-[#002850]">EBITDA Margin Trend (Last 8 Quarters)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={marginData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d4dce6" />
                <XAxis dataKey="quarter" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[20, 30]} />
                <Tooltip />
                <Bar dataKey="margin" fill="#ED232A" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Historical Questions & Category Breakdown */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-[#d4dce6]">
          <CardHeader>
            <CardTitle className="text-[#002850]">Recurring Questions (Last 8 Quarters)</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="space-y-2">
              {historicalQuestions.slice(0, 8).map(q => (
                <AccordionItem key={q.id} value={q.id} className="border rounded-lg px-4 bg-white">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-start justify-between gap-4 w-full pr-4">
                      <div className="flex-1 text-left">
                        <div className="font-medium text-[#002850] text-sm">{q.question}</div>
                        <div className="text-xs text-slate-600 mt-1">{q.analyst} • {q.quarter}</div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="outline" className="border-[#ED232A] text-[#ED232A] text-xs">{q.category.split(' / ')[0]}</Badge>
                        <Badge className="bg-[#FEE2E2] text-[#ED232A] text-xs">Asked {q.frequency}x</Badge>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pt-2 pb-2 text-sm text-slate-600">
                      <div className="font-medium text-[#002850] mb-1">Context:</div>
                      This question was asked {q.frequency} times across the last 8 quarters, indicating it's a recurring topic of interest for analysts.
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        <Card className="border-[#d4dce6]">
          <CardHeader>
            <CardTitle className="text-[#002850]">Questions by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name.split(' / ')[0]}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-category-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Analyst Personas & Peer Benchmarks */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="border-[#d4dce6]">
          <CardHeader>
            <CardTitle className="text-[#002850]">Key Analyst Profiles</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="space-y-2">
              {analystPersonas.slice(0, 4).map((analyst, idx) => (
                <AccordionItem key={idx} value={`analyst-${idx}`} className="border rounded-lg px-4 bg-white">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-start justify-between w-full pr-4">
                      <div>
                        <div className="font-medium text-[#002850]">{analyst.name}</div>
                        <div className="text-xs text-slate-600">{analyst.firm}</div>
                      </div>
                      <Badge variant="outline" className="border-[#ED232A] text-[#ED232A] text-xs">
                        Aggression: {analyst.aggressiveness}/10
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pt-2 space-y-2">
                      <div className="text-sm text-slate-700">{analyst.style}</div>
                      <div>
                        <div className="text-xs text-slate-600 mb-1">Focus Areas:</div>
                        <div className="flex flex-wrap gap-1.5">
                          {analyst.focusAreas.map((area, i) => (
                            <Badge key={i} className="bg-[#FEE2E2] text-[#ED232A] text-xs border-[#ED232A]/20">
                              {area}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        <Card className="border-[#d4dce6]">
          <CardHeader>
            <CardTitle className="text-[#002850]">Peer Benchmark Intelligence</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="space-y-2">
              {peerBenchmarks.map((peer, idx) => (
                <AccordionItem key={idx} value={`peer-${idx}`} className="border rounded-lg px-4 bg-white">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex items-center justify-between w-full pr-4">
                      <div>
                        <div className="font-medium text-[#002850]">{peer.company}</div>
                        <div className="text-xs text-slate-600">{peer.recentQuarter}</div>
                      </div>
                      <Badge className={
                        peer.sentiment === 'positive' ? 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20' :
                        peer.sentiment === 'negative' ? 'bg-[#E31837]/10 text-[#E31837] border-[#E31837]/20' :
                        'bg-amber-100 text-amber-800'
                      }>
                        {peer.sentiment}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pt-2 space-y-2">
                      <div className="text-xs text-slate-600">Topics Discussed:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {peer.topicsAsked.map((topic, i) => (
                          <Badge key={i} variant="outline" className="text-xs border-[#ED232A] text-[#ED232A]">
                            {topic}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}