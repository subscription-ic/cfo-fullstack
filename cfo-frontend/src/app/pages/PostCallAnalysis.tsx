import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import {
  ArrowLeft,
  TrendingUp,
  Activity,
  Gauge,
  ClipboardList,
  Banknote,
  Target,
  Sparkles,
} from 'lucide-react';

interface KpiTile {
  label: string;
  value: string;
  valueTone: 'positive' | 'neutral' | 'negative';
  icon: typeof TrendingUp;
  delta: string;
  context: string;
}

const POST_CALL_KPIS: KpiTile[] = [
  {
    label: 'Stock Price Movement',
    value: '+6.2%',
    valueTone: 'positive',
    icon: TrendingUp,
    delta: '↑ 6.6pp vs +1.3% FII-come window',
    context: 'Day 0 → Day 7 vs FII-come window',
  },
  {
    label: 'Sentiment Score Change',
    value: '+11 pts',
    valueTone: 'positive',
    icon: Gauge,
    delta: '+8 pts vs −2 pts prior',
    context: 'vs last earnings cycle',
  },
  {
    label: 'Analyst Rating Change',
    value: '14 Buy / 2 Hold',
    valueTone: 'neutral',
    icon: ClipboardList,
    delta: '+3 upgrades on 11 Buy / 1 Hold',
    context: 'vs pre-call ratings',
  },
  {
    label: 'FII / DII Net Flow',
    value: '₹1,420 Cr',
    valueTone: 'positive',
    icon: Banknote,
    delta: '+₹970 Cr vs −₹120 Cr',
    context: 'Day-7 inflow vs last cycle',
  },
];

const STOCK_MOVEMENT_7D = [
  { day: 'Day 0', price: 2480 },
  { day: 'Day 1', price: 2545 },
  { day: 'Day 2', price: 2560 },
  { day: 'Day 3', price: 2540 },
  { day: 'Day 4', price: 2570 },
  { day: 'Day 5', price: 2600 },
  { day: 'Day 6', price: 2625 },
  { day: 'Day 7', price: 2634 },
];

const SENTIMENT_EVOLUTION_7D = [
  { day: 'Day 0', positive: 32, neutral: 48, negative: 20 },
  { day: 'Day 1', positive: 44, neutral: 40, negative: 16 },
  { day: 'Day 2', positive: 50, neutral: 36, negative: 14 },
  { day: 'Day 3', positive: 46, neutral: 38, negative: 16 },
  { day: 'Day 4', positive: 55, neutral: 32, negative: 13 },
  { day: 'Day 5', positive: 62, neutral: 26, negative: 12 },
  { day: 'Day 6', positive: 68, neutral: 22, negative: 10 },
  { day: 'Day 7', positive: 72, neutral: 19, negative: 9 },
];

const AI_INSIGHTS: { label: string; body: string }[] = [
  {
    label: 'Initial rally driven by EBITDA beat',
    body: 'Stock surged 2.6% on Day 1 as margin expansion of 120 bps exceeded analyst expectations.',
  },
  {
    label: 'Mid-week dip due to sector pressure',
    body: 'Broader IT sector selloff on Day 3 pulled stock down 1.0%, but fundamentals remained intact.',
  },
  {
    label: 'Recovery after broker upgrades',
    body: 'Three HOLD → BUY upgrades from Motilal Oswal, Kotak, and HDFC drove Days 5–7 recovery to +6.2% total.',
  },
  {
    label: 'FII inflows accelerated post-call',
    body: 'Net FII buying of ₹1,420 Cr over 7 days; 5.2× higher than previous earnings cycle.',
  },
];

interface BrokerAction {
  broker: string;
  previous: string;
  previousTone: 'positive' | 'neutral' | 'negative';
  current: string;
  currentTone: 'positive' | 'neutral' | 'negative' | 'strong';
  targetPrice: string;
  confidence: number;
}

const BROKER_ACTIONS: BrokerAction[] = [
  { broker: 'Motilal Oswal', previous: 'HOLD', previousTone: 'neutral', current: 'BUY', currentTone: 'positive', targetPrice: '₹2,650', confidence: 68 },
  { broker: 'ICICI Securities', previous: 'BUY', previousTone: 'positive', current: 'STRONG BUY', currentTone: 'strong', targetPrice: '₹2,930', confidence: 90 },
  { broker: 'Kotak Institutional', previous: 'HOLD', previousTone: 'neutral', current: 'BUY', currentTone: 'positive', targetPrice: '₹2,800', confidence: 65 },
  { broker: 'Axis Capital', previous: 'BUY', previousTone: 'positive', current: 'BUY', currentTone: 'positive', targetPrice: '₹2,750', confidence: 80 },
  { broker: 'HDFC Securities', previous: 'HOLD', previousTone: 'neutral', current: 'BUY', currentTone: 'positive', targetPrice: '₹2,840', confidence: 71 },
  { broker: 'Edelweiss', previous: 'BUY', previousTone: 'positive', current: 'STRONG BUY', currentTone: 'strong', targetPrice: '₹2,910', confidence: 90 },
];

function ratingBadgeClass(tone: 'positive' | 'neutral' | 'negative' | 'strong'): string {
  switch (tone) {
    case 'positive':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'neutral':
      return 'bg-slate-50 text-slate-700 border-slate-200';
    case 'negative':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'strong':
      return 'bg-green-600 text-white border-green-700';
  }
}

function kpiValueClass(tone: 'positive' | 'neutral' | 'negative'): string {
  if (tone === 'positive') return 'text-green-700';
  if (tone === 'negative') return 'text-red-700';
  return 'text-slate-900';
}

interface ResearchReport {
  firm: string;
  rating: string;
  ratingTone: 'positive' | 'neutral' | 'negative';
  targetPrice: string;
  summary: string;
}

const HDFC_RESEARCH_REPORTS: ResearchReport[] = [
  {
    firm: 'BP Wealth',
    rating: 'BUY',
    ratingTone: 'positive',
    targetPrice: '₹2,050',
    summary:
      'Healthy NIM expansion driven by CASA recovery and retail loan mix; asset quality stable with slippages at multi-quarter low. HDB Financial listing seen as near-term value unlock.',
  },
  {
    firm: 'IDBI Capital',
    rating: 'ACCUMULATE',
    ratingTone: 'positive',
    targetPrice: '₹1,940',
    summary:
      'Post-merger synergies progressing — LDR moderating ahead of plan and deposit traction strong. Margin guidance conservative; expect FY26 RoA recovery to ~1.9%.',
  },
  {
    firm: 'ICICI Direct',
    rating: 'BUY',
    ratingTone: 'positive',
    targetPrice: '₹2,100',
    summary:
      'Branch expansion and digital throughput driving cross-sell. Maintain BUY on visibility of mid-teens earnings CAGR; key monitorable is unsecured retail credit cost.',
  },
  {
    firm: 'Geojit',
    rating: 'HOLD',
    ratingTone: 'neutral',
    targetPrice: '₹1,820',
    summary:
      'Valuation re-rating largely played out near-term. Liquidity coverage and CD ratio normalisation will gate upside; await Q2 commentary on deposit cost trajectory.',
  },
  {
    firm: 'Deven Choksey',
    rating: 'BUY',
    ratingTone: 'positive',
    targetPrice: '₹2,180',
    summary:
      'Best-in-class franchise with structural deposit advantage. Subsidiaries (HDB, HDFC AMC, HDFC Life) add ~15% SOTP; preferred large-cap private banking pick.',
  },
];

type SentimentSource =
  | 'X'
  | 'Reddit'
  | 'Moneycontrol'
  | 'LinkedIn'
  | 'Economic Times'
  | 'StockTwits'
  | 'ValuePickr'
  | 'YouTube'
  | 'Trendlyne'
  | 'Business Standard'
  | 'Livemint'
  | 'CNBC-TV18';

interface SentimentRow {
  date: string;
  source: SentimentSource;
  theme: string;
  sentiment: 'Positive' | 'Neutral' | 'Negative';
  score: number;
  summary: string;
}

const SOURCE_BADGE_CLASS: Record<SentimentSource, string> = {
  'X': 'bg-slate-900 text-white border-slate-900',
  'Reddit': 'bg-orange-50 text-orange-700 border-orange-200',
  'Moneycontrol': 'bg-blue-50 text-blue-700 border-blue-200',
  'LinkedIn': 'bg-sky-50 text-sky-700 border-sky-200',
  'Economic Times': 'bg-purple-50 text-purple-700 border-purple-200',
  'StockTwits': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'ValuePickr': 'bg-pink-50 text-pink-700 border-pink-200',
  'YouTube': 'bg-red-50 text-red-700 border-red-200',
  'Trendlyne': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Business Standard': 'bg-amber-50 text-amber-800 border-amber-200',
  'Livemint': 'bg-yellow-50 text-yellow-700 border-yellow-200',
  'CNBC-TV18': 'bg-rose-50 text-rose-700 border-rose-200',
};

const HDFC_SENTIMENT_Q1_FY25: SentimentRow[] = [
  {
    date: '2024-04-12',
    source: 'X',
    theme: 'NIM Pressure post-merger',
    sentiment: 'Negative',
    score: -0.72,
    summary:
      'Threads from buy-side handles flagging NIM compression to ~3.4% and slow LDR normalisation; concerns about wholesale-deposit roll-down cost.',
  },
  {
    date: '2024-04-18',
    source: 'X',
    theme: 'HDB Financial IPO unlock',
    sentiment: 'Positive',
    score: 0.78,
    summary:
      'Strong chatter around HDB Financial DRHP filing — viewed as a 5–8% SOTP catalyst; retail enthusiasm building.',
  },
  {
    date: '2024-04-22',
    source: 'Reddit',
    theme: 'Valuation vs ICICI Bank',
    sentiment: 'Neutral',
    score: 0.05,
    summary:
      'r/IndianStockMarket debating P/B re-rating gap vs ICICI; consensus sees fair-value catch-up only after 2 quarters of RoA recovery.',
  },
  {
    date: '2024-05-03',
    source: 'Reddit',
    theme: 'FII outflows & MSCI weight cut',
    sentiment: 'Negative',
    score: -0.65,
    summary:
      'r/IndiaInvestments highlighting persistent FII selling and MSCI weight rebalancing as near-term overhang on price.',
  },
  {
    date: '2024-05-10',
    source: 'Moneycontrol',
    theme: 'Deposit growth traction',
    sentiment: 'Positive',
    score: 0.71,
    summary:
      'Forum + article coverage on 24% YoY deposit growth — branch additions and CASA stickiness viewed favourably by retail investors.',
  },
  {
    date: '2024-05-21',
    source: 'Moneycontrol',
    theme: 'Unsecured retail credit cost',
    sentiment: 'Neutral',
    score: -0.10,
    summary:
      'Mixed commentary on rising slippages in personal loans / credit cards; analysts say within guided range but worth monitoring.',
  },
  {
    date: '2024-05-28',
    source: 'X',
    theme: 'Subsidiary value (HDFC Life, AMC)',
    sentiment: 'Positive',
    score: 0.66,
    summary:
      'Tavily-aggregated posts highlighting HDFC AMC AUM growth and HDFC Life VNB margin holding — supportive of SOTP narrative.',
  },
  {
    date: '2024-06-04',
    source: 'X',
    theme: 'Branch expansion pace',
    sentiment: 'Positive',
    score: 0.62,
    summary:
      'Investor handles tracking 100+ new branch additions per month; viewed as supporting CASA share recovery into FY26.',
  },
  {
    date: '2024-06-11',
    source: 'Reddit',
    theme: 'Tech outage & service quality',
    sentiment: 'Negative',
    score: -0.58,
    summary:
      'r/india threads about NetBanking and UPI intermittent outages; reputation risk flagged though no material business impact.',
  },
  {
    date: '2024-06-17',
    source: 'Moneycontrol',
    theme: 'Cost-to-income trajectory',
    sentiment: 'Neutral',
    score: -0.05,
    summary:
      'Mixed reactions to elevated opex from branch + tech investments; payoff expected from FY26 as productivity ramps up.',
  },
  {
    date: '2024-06-25',
    source: 'X',
    theme: 'Stake-sale chatter (HDB Financial)',
    sentiment: 'Positive',
    score: 0.55,
    summary:
      'Speculation around partial stake monetisation pre-IPO; cited as a near-term capital release and sentiment trigger.',
  },
  {
    date: '2024-06-28',
    source: 'Moneycontrol',
    theme: 'Asset quality outlook',
    sentiment: 'Positive',
    score: 0.74,
    summary:
      'Coverage highlighting GNPA at 1.33% with improving recovery momentum; provisioning buffer adequate per analyst takes.',
  },
  {
    date: '2024-04-15',
    source: 'LinkedIn',
    theme: 'CFO commentary on LDR',
    sentiment: 'Positive',
    score: 0.60,
    summary:
      'Sell-side analysts circulating CFO clarification that LDR will normalise over 4–5 years — viewed as credible and well-paced.',
  },
  {
    date: '2024-05-06',
    source: 'LinkedIn',
    theme: 'Digital banking leadership',
    sentiment: 'Positive',
    score: 0.69,
    summary:
      'Industry posts spotlighting HDFC mobile app monthly active users crossing 60M; cross-sell uplift narrative gaining traction.',
  },
  {
    date: '2024-04-20',
    source: 'Economic Times',
    theme: 'Q4 FY24 earnings beat',
    sentiment: 'Positive',
    score: 0.81,
    summary:
      'ET Markets coverage on PAT beat vs consensus; commentary on conservative provisioning seen as a positive surprise.',
  },
  {
    date: '2024-05-14',
    source: 'Economic Times',
    theme: 'CD ratio normalisation pace',
    sentiment: 'Neutral',
    score: 0.10,
    summary:
      'ET piece on credit-deposit ratio still elevated at ~104% — markets watching deposit accretion before re-rating further.',
  },
  {
    date: '2024-04-26',
    source: 'StockTwits',
    theme: 'Retail momentum on dip',
    sentiment: 'Positive',
    score: 0.58,
    summary:
      'Strong buy-the-dip chatter on StockTwits after post-results pullback; bullish tags spike around ₹1,470 support level.',
  },
  {
    date: '2024-06-08',
    source: 'StockTwits',
    theme: 'Options activity skew',
    sentiment: 'Neutral',
    score: 0.00,
    summary:
      'Mixed flow with ATM put writing into expiry; positioning suggests range-bound view rather than directional conviction.',
  },
  {
    date: '2024-05-02',
    source: 'ValuePickr',
    theme: 'Long-term thesis revisit',
    sentiment: 'Positive',
    score: 0.72,
    summary:
      'ValuePickr thread re-evaluating moat post-merger; consensus that compounding profile intact, near-term optics noisy.',
  },
  {
    date: '2024-06-12',
    source: 'ValuePickr',
    theme: 'Subsidiary holdco discount',
    sentiment: 'Neutral',
    score: -0.08,
    summary:
      'Forum debate on appropriate holdco discount for HDB Financial / HDFC AMC stakes; range of 15–25% considered fair.',
  },
  {
    date: '2024-04-29',
    source: 'YouTube',
    theme: 'Influencer technical breakdown',
    sentiment: 'Negative',
    score: -0.55,
    summary:
      'Popular Hindi finance channels flagging weekly chart breakdown; short-term traders bearish till ₹1,500 reclaim.',
  },
  {
    date: '2024-06-15',
    source: 'YouTube',
    theme: 'Long-term SIP recommendation',
    sentiment: 'Positive',
    score: 0.76,
    summary:
      'Multiple investor-education channels reiterating HDFC as core SIP pick; framed as best risk-adjusted private bank exposure.',
  },
  {
    date: '2024-05-08',
    source: 'Trendlyne',
    theme: 'Forecaster upgrades',
    sentiment: 'Positive',
    score: 0.68,
    summary:
      'Trendlyne tracker showing 4 broker target upgrades vs 1 cut over the quarter; consensus PT drift higher.',
  },
  {
    date: '2024-06-22',
    source: 'Trendlyne',
    theme: 'DII vs FII flows',
    sentiment: 'Neutral',
    score: 0.05,
    summary:
      'Holdings tracker shows DII buying largely offsetting FII outflows; net institutional ownership broadly stable.',
  },
  {
    date: '2024-04-25',
    source: 'Business Standard',
    theme: 'RBI liquidity stance',
    sentiment: 'Neutral',
    score: -0.15,
    summary:
      'BS analysis on tighter liquidity environment squeezing system deposit costs; HDFC relatively better placed vs peers.',
  },
  {
    date: '2024-06-19',
    source: 'Livemint',
    theme: 'CASA share recovery',
    sentiment: 'Positive',
    score: 0.70,
    summary:
      'Mint coverage on CASA share inching up to ~38%; viewed as the single biggest lever for NIM recovery into FY26.',
  },
  {
    date: '2024-05-16',
    source: 'CNBC-TV18',
    theme: 'Management guidance interview',
    sentiment: 'Positive',
    score: 0.73,
    summary:
      'Sashidhar Jagdishan TV interaction reiterated medium-term RoA target; tone read as confident and execution-focused.',
  },
];

const SENTIMENT_PAGE_SIZE = 5;

export default function PostCallAnalysis() {
  const navigate = useNavigate();
  const [sentimentPage, setSentimentPage] = useState(1);

  const sentimentTotalPages = useMemo(
    () => Math.max(1, Math.ceil(HDFC_SENTIMENT_Q1_FY25.length / SENTIMENT_PAGE_SIZE)),
    [],
  );
  const paginatedSentiment = useMemo(
    () =>
      HDFC_SENTIMENT_Q1_FY25.slice(
        (sentimentPage - 1) * SENTIMENT_PAGE_SIZE,
        sentimentPage * SENTIMENT_PAGE_SIZE,
      ),
    [sentimentPage],
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>

        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Post-Call Analysis</h1>
          <p className="text-sm text-slate-500 mt-1">
            Q1 FY26 Earnings Call · 7-Day Impact Assessment
          </p>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {POST_CALL_KPIS.map((k) => {
            const Icon = k.icon;
            return (
              <Card key={k.label} className="border-slate-200">
                <CardContent className="p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Icon className="w-3.5 h-3.5 text-[#ED232A]" />
                    {k.label}
                  </div>
                  <div className={`text-2xl font-semibold ${kpiValueClass(k.valueTone)}`}>
                    {k.value}
                  </div>
                  <div className="text-xs text-slate-600">{k.delta}</div>
                  <div className="text-[11px] text-slate-400">{k.context}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Market Impact Story */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wide text-slate-600">
              <Activity className="w-4 h-4 text-[#ED232A]" />
              Market Impact Story
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium text-slate-800">Stock Movement (7-Day)</h3>
                <p className="text-xs text-slate-500 mb-3">NSE Price (₹) with Volume Indicators</p>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={STOCK_MOVEMENT_7D} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis
                        domain={[2470, 2660]}
                        ticks={[2480, 2500, 2520, 2540, 2560, 2580, 2600, 2620, 2640]}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                      />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="price"
                        stroke="#ED232A"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: '#ED232A' }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Day 1 rally (+2.6%) · Day 3 dip (−0.4%) · Day 7 recovery (+6.2% total)
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-slate-800">Sentiment Evolution</h3>
                <p className="text-xs text-slate-500 mb-3">Analyst &amp; Media Sentiment Distribution (%)</p>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={SENTIMENT_EVOLUTION_7D} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Area type="monotone" dataKey="positive" name="Positive" stackId="1" stroke="#16a34a" fill="#bbf7d0" />
                      <Area type="monotone" dataKey="neutral" name="Neutral" stackId="1" stroke="#94a3b8" fill="#e2e8f0" />
                      <Area type="monotone" dataKey="negative" name="Negative" stackId="1" stroke="#dc2626" fill="#fecaca" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI Insight Summary */}
        <Card className="border-[#ED232A]/30 bg-[#FEE2E2]/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-[#8B1319]">
              <Sparkles className="w-4 h-4 text-[#ED232A]" />
              AI Insight Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {AI_INSIGHTS.map((i) => (
              <div key={i.label} className="flex items-start gap-2 text-sm">
                <Target className="w-3.5 h-3.5 text-[#ED232A] mt-1 shrink-0" />
                <p className="text-slate-700">
                  <span className="font-semibold text-slate-900">{i.label}:</span> {i.body}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Deep Dive Analysis — Analyst & Broker Actions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wide text-slate-600">
              <ClipboardList className="w-4 h-4 text-[#ED232A]" />
              Deep Dive Analysis
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">Analyst &amp; Broker Actions</p>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Broker</TableHead>
                    <TableHead className="w-[140px]">Previous Rating</TableHead>
                    <TableHead className="w-[140px]">New Rating</TableHead>
                    <TableHead className="w-[140px]">Target Price (₹)</TableHead>
                    <TableHead>Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {BROKER_ACTIONS.map((b) => (
                    <TableRow key={b.broker}>
                      <TableCell className="font-medium text-slate-800">{b.broker}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={ratingBadgeClass(b.previousTone)}>
                          {b.previous}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={ratingBadgeClass(b.currentTone)}>
                          {b.current}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-700">{b.targetPrice}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={b.confidence} className="w-40 h-2" />
                          <span className="text-xs text-slate-600 tabular-nums">{b.confidence}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Research Reports — Rating & Summarization (relocated from Debrief) */}
        <Card>
          <CardHeader>
            <CardTitle>Research Reports — Rating & Summarization</CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Sell-side research coverage on HDFC compiled from BP Wealth, IDBI
              Capital, ICICI Direct, Geojit, and Deven Choksey.
            </p>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Research Report</TableHead>
                    <TableHead className="w-[140px]">Rating</TableHead>
                    <TableHead className="w-[120px]">Target Price</TableHead>
                    <TableHead>Summarization</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {HDFC_RESEARCH_REPORTS.map((r) => (
                    <TableRow key={r.firm}>
                      <TableCell className="font-medium">{r.firm}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            r.ratingTone === 'positive'
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : r.ratingTone === 'negative'
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }
                        >
                          {r.rating}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-slate-700">
                        {r.targetPrice}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {r.summary}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Sentimental Analysis (Q1 FY25) — relocated from Debrief */}
        <Card>
          <CardHeader>
            <CardTitle>Sentimental Analysis — HDFC (Q1 FY25)</CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Themes aggregated via Tavily across X (Twitter), Reddit,
              Moneycontrol, LinkedIn, Economic Times, StockTwits, ValuePickr,
              YouTube, Trendlyne, Business Standard, Livemint, and CNBC-TV18.
              Date, source, theme, sentiment, and summary per signal.
            </p>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Date</TableHead>
                    <TableHead className="w-[140px]">Source</TableHead>
                    <TableHead className="w-[220px]">Theme</TableHead>
                    <TableHead className="w-[120px]">Sentiment</TableHead>
                    <TableHead className="w-[90px] text-right">Score</TableHead>
                    <TableHead>Summary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedSentiment.map((s, i) => (
                    <TableRow key={`${s.date}-${s.source}-${i}`}>
                      <TableCell className="text-sm text-slate-700 whitespace-nowrap">
                        {new Date(s.date).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: '2-digit',
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={SOURCE_BADGE_CLASS[s.source]}
                        >
                          {s.source}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        {s.theme}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            s.sentiment === 'Positive'
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : s.sentiment === 'Negative'
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }
                        >
                          {s.sentiment}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={
                          'text-right text-sm font-medium tabular-nums ' +
                          (s.score >= 0.2
                            ? 'text-green-700'
                            : s.score <= -0.2
                            ? 'text-red-700'
                            : 'text-amber-700')
                        }
                      >
                        {s.score >= 0 ? '+' : ''}
                        {s.score.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {s.summary}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between mt-3 text-sm">
              <span className="text-slate-500">
                Showing{' '}
                {(sentimentPage - 1) * SENTIMENT_PAGE_SIZE + 1}–
                {Math.min(
                  sentimentPage * SENTIMENT_PAGE_SIZE,
                  HDFC_SENTIMENT_Q1_FY25.length,
                )}{' '}
                of {HDFC_SENTIMENT_Q1_FY25.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSentimentPage((p) => Math.max(1, p - 1))}
                  disabled={sentimentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-slate-600">
                  Page {sentimentPage} of {sentimentTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSentimentPage((p) => Math.min(sentimentTotalPages, p + 1))
                  }
                  disabled={sentimentPage === sentimentTotalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
