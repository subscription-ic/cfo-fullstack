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
  const [sentimentPage, setSentimentPage] = useState(1);
  const SENTIMENT_PAGE_SIZE = 5;
  const sentimentTotalPages = Math.max(
    1,
    Math.ceil(HDFC_SENTIMENT_Q1_FY25.length / SENTIMENT_PAGE_SIZE),
  );
  const paginatedSentiment = HDFC_SENTIMENT_Q1_FY25.slice(
    (sentimentPage - 1) * SENTIMENT_PAGE_SIZE,
    sentimentPage * SENTIMENT_PAGE_SIZE,
  );

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

      {/* Sell-side Research Reports — shown only for HDFC */}
      {selectedCompany.trim().toUpperCase() === 'HDFC' && (
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
      )}

      {/* Sentimental Analysis (Q1 FY25) — shown only for HDFC */}
      {selectedCompany.trim().toUpperCase() === 'HDFC' && (
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
                  onClick={() =>
                    setSentimentPage((p) => Math.max(1, p - 1))
                  }
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
                    setSentimentPage((p) =>
                      Math.min(sentimentTotalPages, p + 1),
                    )
                  }
                  disabled={sentimentPage === sentimentTotalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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