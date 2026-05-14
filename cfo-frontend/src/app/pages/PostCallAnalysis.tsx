import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  LineChart,
  Line,
  ReferenceLine,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  ArrowLeft,
  TrendingUp,
  Activity,
  Gauge,
  ClipboardList,
  Banknote,
  Target,
  Sparkles,
  Loader2,
} from 'lucide-react';
import {
  fetchCompanies,
  fetchAvailableQuarters,
  fetchQuarterDetail,
  fetchStockQuarterPrices,
  fetchQuarterNewsSentiment,
  type QuarterDetailResponse,
  type QuarterSummaryInfo,
  type StockQuarterPricesResponse,
  type NewsSentimentResponse,
} from '../utils/api';

function kpiValueClass(tone: 'positive' | 'neutral' | 'negative'): string {
  if (tone === 'positive') return 'text-green-700';
  if (tone === 'negative') return 'text-red-700';
  return 'text-slate-900';
}

function parseTargetPrice(s: string): number {
  return Number(s.replace(/[^\d.]/g, '')) || 0;
}

function isoWeekStart(d: Date): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - (day - 1));
  return date;
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
  | 'CNBC-TV18'
  | 'Tavily';

interface SentimentRow {
  date: string;
  // Predefined badge keys (HDFC mock dataset) OR a free-form publisher name
  // (yfinance .news pulls from many publishers — Moneycontrol, Reuters,
  // GuruFocus, Simply Wall St., etc.).
  source: SentimentSource | string;
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
  'Tavily': 'bg-cyan-50 text-cyan-700 border-cyan-200',
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

  // Company + quarter filters drive every section below.
  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [quarters, setQuarters] = useState<QuarterSummaryInfo[]>([]);
  const [selectedQuarterKey, setSelectedQuarterKey] = useState<string>('');
  const [quarterDetail, setQuarterDetail] = useState<QuarterDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [stockData, setStockData] = useState<StockQuarterPricesResponse | null>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [newsData, setNewsData] = useState<NewsSentimentResponse | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);

  // Mount: load canonical company list.
  useEffect(() => {
    let cancelled = false;
    fetchCompanies()
      .then((list) => {
        if (cancelled) return;
        setCompanies(list);
        if (list.length && !selectedCompany) {
          setSelectedCompany(list[0]);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Company changes → reload its quarter list.
  useEffect(() => {
    if (!selectedCompany) {
      setQuarters([]);
      setSelectedQuarterKey('');
      setQuarterDetail(null);
      return;
    }
    let cancelled = false;
    fetchAvailableQuarters(selectedCompany)
      .then((resp) => {
        if (cancelled) return;
        setQuarters(resp.quarters);
        if (resp.quarters.length) {
          const q = resp.quarters[0];
          setSelectedQuarterKey(`${q.quarter}|${q.fiscal_year}`);
        } else {
          setSelectedQuarterKey('');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQuarters([]);
          setSelectedQuarterKey('');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCompany]);

  // Selection changes → fetch quarter detail (sentiment, themes, questions).
  useEffect(() => {
    if (!selectedCompany || !selectedQuarterKey) {
      setQuarterDetail(null);
      return;
    }
    const [quarter, fy] = selectedQuarterKey.split('|');
    if (!quarter || !fy) return;
    let cancelled = false;
    setDetailLoading(true);
    fetchQuarterDetail(selectedCompany, Number(fy), quarter)
      .then((d) => {
        if (cancelled) return;
        setQuarterDetail(d);
      })
      .catch(() => {
        if (!cancelled) setQuarterDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCompany, selectedQuarterKey]);

  // Reset pagination when selection changes.
  useEffect(() => {
    setSentimentPage(1);
  }, [selectedCompany, selectedQuarterKey]);

  // Fetch stock prices for the selected company + quarter.
  useEffect(() => {
    if (!selectedCompany || !selectedQuarterKey) {
      setStockData(null);
      return;
    }
    const [quarter, fy] = selectedQuarterKey.split('|');
    if (!quarter || !fy) return;
    let cancelled = false;
    setStockLoading(true);
    fetchStockQuarterPrices(selectedCompany, Number(fy), quarter)
      .then((d) => {
        if (!cancelled) setStockData(d);
      })
      .catch(() => {
        if (!cancelled) setStockData(null);
      })
      .finally(() => {
        if (!cancelled) setStockLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCompany, selectedQuarterKey]);

  // Fetch news-based sentiment rows for the selected company + quarter.
  useEffect(() => {
    if (!selectedCompany || !selectedQuarterKey) {
      setNewsData(null);
      return;
    }
    const [quarter, fy] = selectedQuarterKey.split('|');
    if (!quarter || !fy) return;
    let cancelled = false;
    setNewsLoading(true);
    fetchQuarterNewsSentiment(selectedCompany, Number(fy), quarter)
      .then((d) => {
        if (!cancelled) setNewsData(d);
      })
      .catch(() => {
        if (!cancelled) setNewsData(null);
      })
      .finally(() => {
        if (!cancelled) setNewsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCompany, selectedQuarterKey]);

  // Indian fiscal year: FYxxxx = Apr (xxxx-1) → Mar xxxx. So FY25 Q1 = Apr-Jun 2024.
  const quarterDateRange = useMemo<{ start: string; end: string } | null>(() => {
    const [q, fyStr] = (selectedQuarterKey || '').split('|');
    if (!q || !fyStr) return null;
    const fy = Number(fyStr);
    if (!Number.isFinite(fy)) return null;
    const calStart = fy - 1; // FY26 starts in 2025
    if (q === 'Q1') return { start: `${calStart}-04-01`, end: `${calStart}-06-30` };
    if (q === 'Q2') return { start: `${calStart}-07-01`, end: `${calStart}-09-30` };
    if (q === 'Q3') return { start: `${calStart}-10-01`, end: `${calStart}-12-31` };
    if (q === 'Q4') return { start: `${fy}-01-01`, end: `${fy}-03-31` };
    return null;
  }, [selectedQuarterKey]);

  // Is the HDFC mock dataset relevant? Only when the user selects an HDFC
  // company AND a Q1 FY25 quarter — otherwise the page is driven by the
  // backend quarter-detail payload.
  const showHdfcMock = useMemo(() => {
    const c = selectedCompany.trim().toLowerCase();
    if (!c || !c.includes('hdfc')) return false;
    const [quarter, fy] = (selectedQuarterKey || '').split('|');
    return quarter === 'Q1' && fy === '2025';
  }, [selectedCompany, selectedQuarterKey]);

  // Distribute N items evenly across the quarter's date range.
  const datesAcrossRange = (
    n: number,
    range: { start: string; end: string } | null,
  ): string[] => {
    if (!range || n <= 0) return [];
    const startMs = new Date(range.start).getTime();
    const endMs = new Date(range.end).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
      return Array.from({ length: n }, () => range.start);
    }
    if (n === 1) return [range.start];
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const ts = startMs + ((endMs - startMs) * i) / (n - 1);
      out.push(new Date(ts).toISOString().slice(0, 10));
    }
    return out;
  };

  // Dynamic sentiment rows for non-HDFC view, built from the quarter-detail
  // sentiment.positive_points and negative_points returned by the backend.
  // Dates are spread across the selected quarter's date range so the rows
  // sit on a sensible timeline (the underlying analysis is period-scoped,
  // not pinned to a single calendar day).
  const dynamicSentimentRows = useMemo<SentimentRow[]>(() => {
    if (!quarterDetail) return [];
    const pos = quarterDetail.sentiment?.positive_points ?? [];
    const neg = quarterDetail.sentiment?.negative_points ?? [];
    const posDates = datesAcrossRange(pos.length, quarterDateRange);
    const negDates = datesAcrossRange(neg.length, quarterDateRange);
    const posRows: SentimentRow[] = pos.map((text, i) => ({
      date: posDates[i] ?? quarterDateRange?.start ?? '',
      source: 'Tavily' as SentimentSource,
      theme: text.slice(0, 60),
      sentiment: 'Positive' as const,
      score: 0.6 + Math.min(0.4, i * 0.05),
      summary: text,
    }));
    const negRows: SentimentRow[] = neg.map((text, i) => ({
      date: negDates[i] ?? quarterDateRange?.start ?? '',
      source: 'Tavily' as SentimentSource,
      theme: text.slice(0, 60),
      sentiment: 'Negative' as const,
      score: -0.6 - Math.min(0.4, i * 0.05),
      summary: text,
    }));
    return [...posRows, ...negRows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }, [quarterDetail, quarterDateRange]);

  // Filter helper: keep only rows whose date falls in the selected quarter.
  const filterToRange = (rows: SentimentRow[]): SentimentRow[] => {
    if (!quarterDateRange) return rows;
    const { start, end } = quarterDateRange;
    return rows.filter((r) => r.date >= start && r.date <= end);
  };

  // Convert news API rows to the shared SentimentRow shape.
  const newsSentimentRows = useMemo<SentimentRow[]>(() => {
    const rows = newsData?.rows ?? [];
    return rows.map((r) => ({
      date: r.date,
      source: r.publisher,
      theme: r.theme,
      sentiment: r.sentiment,
      score: r.score,
      summary: r.summary || r.title,
    }));
  }, [newsData]);

  // Which dataset is currently driving the cards? Always include the news
  // headlines on top of either the HDFC mock set (for HDFC Q1 FY25) or the
  // dynamic driver/risk rows (for any other selection). Filter everything to
  // the quarter window and sort chronologically so the table reads cleanly.
  const activeSentimentData: SentimentRow[] = useMemo(() => {
    const base = showHdfcMock
      ? filterToRange(HDFC_SENTIMENT_Q1_FY25)
      : dynamicSentimentRows;
    const news = filterToRange(newsSentimentRows);
    const merged = [...base, ...news];
    merged.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return merged;
    // filterToRange depends on quarterDateRange which is captured already.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHdfcMock, dynamicSentimentRows, newsSentimentRows, quarterDateRange]);

  const activeResearchReports: ResearchReport[] = showHdfcMock
    ? HDFC_RESEARCH_REPORTS
    : [];

  const sentimentTotalPages = useMemo(
    () => Math.max(1, Math.ceil(activeSentimentData.length / SENTIMENT_PAGE_SIZE)),
    [activeSentimentData],
  );
  const paginatedSentiment = useMemo(
    () =>
      activeSentimentData.slice(
        (sentimentPage - 1) * SENTIMENT_PAGE_SIZE,
        sentimentPage * SENTIMENT_PAGE_SIZE,
      ),
    [activeSentimentData, sentimentPage],
  );

  // Aggregates derived from whichever Research Reports table is active.
  const reportStats = useMemo(() => {
    const reports = activeResearchReports;
    if (reports.length === 0) {
      return {
        avgTarget: 0,
        minTarget: 0,
        maxTarget: 0,
        ratingCounts: {} as Record<string, number>,
        positiveCount: 0,
        total: 0,
        ratingMixLabel: '—',
      };
    }
    const targets = reports.map((r) => parseTargetPrice(r.targetPrice));
    const total = reports.length;
    const avgTarget = Math.round(targets.reduce((s, t) => s + t, 0) / total);
    const minTarget = Math.min(...targets);
    const maxTarget = Math.max(...targets);
    const ratingCounts = reports.reduce((acc, r) => {
      acc[r.rating] = (acc[r.rating] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const positiveCount = reports.filter((r) => r.ratingTone === 'positive').length;
    const ratingMixLabel = Object.entries(ratingCounts)
      .map(([k, v]) => `${v} ${k}`)
      .join(' · ');
    return { avgTarget, minTarget, maxTarget, ratingCounts, positiveCount, total, ratingMixLabel };
  }, [activeResearchReports]);

  // Aggregates derived from whichever Sentiment Analysis table is active.
  const sentimentStats = useMemo(() => {
    const rows = activeSentimentData;
    const total = rows.length;
    if (total === 0) {
      return {
        total: 0,
        avgScore: 0,
        positives: 0,
        neutrals: 0,
        negatives: 0,
        positivePct: 0,
        negativePct: 0,
      };
    }
    const avgScore = rows.reduce((s, e) => s + e.score, 0) / total;
    const positives = rows.filter((e) => e.sentiment === 'Positive').length;
    const neutrals = rows.filter((e) => e.sentiment === 'Neutral').length;
    const negatives = rows.filter((e) => e.sentiment === 'Negative').length;
    const positivePct = (positives / total) * 100;
    const negativePct = (negatives / total) * 100;
    return { total, avgScore, positives, neutrals, negatives, positivePct, negativePct };
  }, [activeSentimentData]);

  // Bar chart series: target price per broker, ordered by target descending.
  const targetPriceSeries = useMemo(
    () =>
      activeResearchReports
        .map((r) => ({
          firm: r.firm,
          target: parseTargetPrice(r.targetPrice),
          tone: r.ratingTone,
        }))
        .sort((a, b) => b.target - a.target),
    [activeResearchReports],
  );

  // Stacked area: sentiment-share per ISO week, derived from active rows.
  const sentimentWeeklySeries = useMemo(() => {
    const buckets = new Map<
      string,
      { date: Date; positive: number; neutral: number; negative: number }
    >();
    for (const e of activeSentimentData) {
      const weekStart = isoWeekStart(new Date(e.date));
      const key = weekStart.toISOString().slice(0, 10);
      const bucket = buckets.get(key) ?? { date: weekStart, positive: 0, neutral: 0, negative: 0 };
      if (e.sentiment === 'Positive') bucket.positive += 1;
      else if (e.sentiment === 'Neutral') bucket.neutral += 1;
      else bucket.negative += 1;
      buckets.set(key, bucket);
    }
    return Array.from(buckets.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((b) => {
        const denom = b.positive + b.neutral + b.negative || 1;
        return {
          week: b.date.toLocaleDateString(undefined, { month: 'short', day: '2-digit' }),
          positive: Math.round((b.positive / denom) * 100),
          neutral: Math.round((b.neutral / denom) * 100),
          negative: Math.round((b.negative / denom) * 100),
        };
      });
  }, [activeSentimentData]);

  // AI Insight bullets derived from the same data.
  const aiInsights = useMemo(() => {
    const bullets: { label: string; body: string }[] = [];
    if (activeSentimentData.length === 0) {
      return bullets;
    }
    const sortedByScore = [...activeSentimentData].sort((a, b) => b.score - a.score);
    const top = sortedByScore[0];
    const bottom = sortedByScore[sortedByScore.length - 1];

    bullets.push({
      label: `Net sentiment ${sentimentStats.avgScore >= 0 ? 'tilted positive' : 'tilted negative'} (avg ${sentimentStats.avgScore >= 0 ? '+' : ''}${sentimentStats.avgScore.toFixed(2)})`,
      body: `${sentimentStats.positives} positive, ${sentimentStats.neutrals} neutral, and ${sentimentStats.negatives} negative signals across ${sentimentStats.total} entries (${sentimentStats.positivePct.toFixed(0)}% positive share).`,
    });
    if (top) {
      bullets.push({
        label: `Top positive driver — ${top.theme}`,
        body: `${top.summary} (Source: ${top.source}, score ${top.score >= 0 ? '+' : ''}${top.score.toFixed(2)})`,
      });
    }
    if (bottom && bottom !== top) {
      bullets.push({
        label: `Top negative concern — ${bottom.theme}`,
        body: `${bottom.summary} (Source: ${bottom.source}, score ${bottom.score >= 0 ? '+' : ''}${bottom.score.toFixed(2)})`,
      });
    }

    if (activeResearchReports.length > 0) {
      const sortedReports = [...activeResearchReports].sort(
        (a, b) => parseTargetPrice(b.targetPrice) - parseTargetPrice(a.targetPrice),
      );
      const highest = sortedReports[0];
      bullets.push({
        label: `Highest broker target — ${highest.firm}`,
        body: `${highest.rating} call with target ${highest.targetPrice}. ${highest.summary}`,
      });
    }
    return bullets;
  }, [activeSentimentData, activeResearchReports, sentimentStats]);

  const fmtINR = (n: number) => `₹${n.toLocaleString('en-IN')}`;

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
            {selectedCompany ? `${selectedCompany}` : 'Select a company'}
            {selectedQuarterKey ? ` · ${selectedQuarterKey.split('|')[0]} FY${String(selectedQuarterKey.split('|')[1]).slice(-2)}` : ''}
            {' — sell-side coverage and multi-source sentiment, derived from the tables below.'}
          </p>
        </div>

        {/* Company + Quarter filter row */}
        <Card className="border-slate-200">
          <CardContent className="p-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700">Company:</span>
              <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                <SelectTrigger className="w-[240px] border-[#ED232A]/40">
                  <SelectValue placeholder="Pick a company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-500">No companies yet</div>
                  ) : (
                    companies.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700">Quarter:</span>
              <Select
                value={selectedQuarterKey}
                onValueChange={setSelectedQuarterKey}
                disabled={!selectedCompany || quarters.length === 0}
              >
                <SelectTrigger className="w-[200px] border-[#ED232A]/40">
                  <SelectValue placeholder="Pick a quarter" />
                </SelectTrigger>
                <SelectContent>
                  {quarters.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-500">No quarters available</div>
                  ) : (
                    quarters.map((q) => (
                      <SelectItem key={`${q.quarter}|${q.fiscal_year}`} value={`${q.quarter}|${q.fiscal_year}`}>
                        {q.quarter} FY{String(q.fiscal_year).slice(-2)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            {detailLoading && (
              <span className="text-xs text-slate-500 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading {selectedCompany} data…
              </span>
            )}
            {!detailLoading && !showHdfcMock && quarterDetail && activeSentimentData.length === 0 && (
              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                No sentiment signals available for this quarter. Upload more documents or run
                document analysis.
              </span>
            )}
          </CardContent>
        </Card>

        {/* KPI tiles — derived from the Research Reports + Sentiment tables */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-slate-200">
            <CardContent className="p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Banknote className="w-3.5 h-3.5 text-[#ED232A]" />
                Avg Analyst Target
              </div>
              <div className={`text-2xl font-semibold ${kpiValueClass('neutral')}`}>
                {fmtINR(reportStats.avgTarget)}
              </div>
              <div className="text-xs text-slate-600">
                Range {fmtINR(reportStats.minTarget)} – {fmtINR(reportStats.maxTarget)}
              </div>
              <div className="text-[11px] text-slate-400">
                Across {reportStats.total} sell-side firms
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Gauge className="w-3.5 h-3.5 text-[#ED232A]" />
                Net Sentiment Score
              </div>
              <div
                className={`text-2xl font-semibold ${kpiValueClass(
                  sentimentStats.avgScore >= 0.05
                    ? 'positive'
                    : sentimentStats.avgScore <= -0.05
                    ? 'negative'
                    : 'neutral',
                )}`}
              >
                {sentimentStats.avgScore >= 0 ? '+' : ''}
                {sentimentStats.avgScore.toFixed(2)}
              </div>
              <div className="text-xs text-slate-600">
                Avg of {sentimentStats.total} signals
              </div>
              <div className="text-[11px] text-slate-400">
                {sentimentStats.positives} pos · {sentimentStats.neutrals} neu · {sentimentStats.negatives} neg
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <ClipboardList className="w-3.5 h-3.5 text-[#ED232A]" />
                Analyst Rating Mix
              </div>
              <div className={`text-2xl font-semibold ${kpiValueClass('neutral')}`}>
                {reportStats.ratingMixLabel}
              </div>
              <div className="text-xs text-slate-600">
                {reportStats.positiveCount} of {reportStats.total} positive-toned
              </div>
              <div className="text-[11px] text-slate-400">
                From the Research Reports table
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <TrendingUp className="w-3.5 h-3.5 text-[#ED232A]" />
                Positive Sentiment Share
              </div>
              <div
                className={`text-2xl font-semibold ${kpiValueClass(
                  sentimentStats.positivePct >= 50 ? 'positive' : 'neutral',
                )}`}
              >
                {sentimentStats.positivePct.toFixed(0)}%
              </div>
              <div className="text-xs text-slate-600">
                {sentimentStats.positives} of {sentimentStats.total} entries
              </div>
              <div className="text-[11px] text-slate-400">
                Negative share: {sentimentStats.negativePct.toFixed(0)}%
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stock Price During Quarter */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-wide text-slate-600">
              <TrendingUp className="w-4 h-4 text-[#ED232A]" />
              Stock Price During Quarter
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              {stockData?.ticker ? (
                <>
                  <span className="font-medium">{stockData.ticker}</span>
                  {stockData.currency && <> · {stockData.currency}</>}
                  {stockData.range && <> · {stockData.range.start} → {stockData.range.end}</>}
                  {typeof stockData.return_pct === 'number' && (
                    <>
                      {' '}·{' '}
                      <span
                        className={
                          stockData.return_pct >= 0
                            ? 'text-green-700 font-medium'
                            : 'text-red-700 font-medium'
                        }
                      >
                        {stockData.return_pct >= 0 ? '+' : ''}
                        {stockData.return_pct.toFixed(2)}% open→close
                      </span>
                    </>
                  )}
                  {stockData.earnings_call_dates.length > 0 && (
                    <> · Earnings-call markers: {stockData.earnings_call_dates.join(', ')}</>
                  )}
                </>
              ) : (
                'Resolving ticker from Yahoo Finance…'
              )}
            </p>
          </CardHeader>
          <CardContent>
            {stockLoading ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Loading prices…
              </div>
            ) : stockData?.error ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded">
                {stockData.error}
              </div>
            ) : !stockData?.prices.length ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-slate-500">
                No price data returned for this period.
              </div>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={stockData.prices.map((p) => ({ date: p.date, close: p.close }))}
                    margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickFormatter={(v) =>
                        new Date(v).toLocaleDateString(undefined, {
                          month: 'short',
                          day: '2-digit',
                        })
                      }
                      interval={Math.max(0, Math.floor((stockData.prices.length || 1) / 10))}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickFormatter={(v: number) => v.toFixed(0)}
                    />
                    <Tooltip
                      formatter={(v: number) =>
                        `${stockData.currency ? stockData.currency + ' ' : ''}${v.toFixed(2)}`
                      }
                      labelFormatter={(l) =>
                        new Date(l).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: '2-digit',
                        })
                      }
                    />
                    {stockData.earnings_call_dates
                      .filter((d) =>
                        stockData.range
                          ? d >= stockData.range.start && d <= stockData.range.end
                          : true,
                      )
                      .map((d) => (
                        <ReferenceLine
                          key={`call-${d}`}
                          x={d}
                          stroke="#ED232A"
                          strokeDasharray="3 3"
                          label={{ value: 'Call', fontSize: 10, fill: '#ED232A', position: 'top' }}
                        />
                      ))}
                    <Line
                      type="monotone"
                      dataKey="close"
                      stroke="#ED232A"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

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
                <h3 className="text-sm font-medium text-slate-800">Analyst Target Prices</h3>
                <p className="text-xs text-slate-500 mb-3">
                  Per-firm targets from the Research Reports table (₹)
                </p>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={targetPriceSeries} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                      <XAxis dataKey="firm" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} angle={-15} textAnchor="end" height={60} />
                      <YAxis
                        domain={[1700, 2300]}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                      />
                      <Tooltip formatter={(v: number) => fmtINR(v)} />
                      <Bar dataKey="target" fill="#ED232A" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Avg {fmtINR(reportStats.avgTarget)} · Range {fmtINR(reportStats.minTarget)} – {fmtINR(reportStats.maxTarget)}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-slate-800">Sentiment Evolution</h3>
                <p className="text-xs text-slate-500 mb-3">
                  Weekly distribution from the Sentiment Analysis table (% share)
                </p>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sentimentWeeklySeries} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                      <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#64748b' }} />
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

        {/* AI Insight Summary — derived */}
        <Card className="border-[#ED232A]/30 bg-[#FEE2E2]/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-[#8B1319]">
              <Sparkles className="w-4 h-4 text-[#ED232A]" />
              AI Insight Summary
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Computed from the Research Reports and Sentiment Analysis tables below.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {aiInsights.map((i) => (
              <div key={i.label} className="flex items-start gap-2 text-sm">
                <Target className="w-3.5 h-3.5 text-[#ED232A] mt-1 shrink-0" />
                <p className="text-slate-700">
                  <span className="font-semibold text-slate-900">{i.label}:</span> {i.body}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Research Reports — Rating & Summarization */}
        <Card>
          <CardHeader>
            <CardTitle>Research Reports — Rating & Summarization</CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              {showHdfcMock
                ? 'Sell-side research coverage on HDFC compiled from BP Wealth, IDBI Capital, ICICI Direct, Geojit, and Deven Choksey.'
                : `Sell-side coverage for ${selectedCompany || 'this company'}. Connect a research aggregator to populate this table.`}
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
                  {activeResearchReports.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-slate-500 py-6">
                        No research reports collected for {selectedCompany || 'this company'} yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    activeResearchReports.map((r) => (
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
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Sentimental Analysis */}
        <Card>
          <CardHeader>
            <CardTitle>
              Sentimental Analysis — {selectedCompany || 'Company'}
              {selectedQuarterKey && (
                <>
                  {' '}({selectedQuarterKey.split('|')[0]} FY{String(selectedQuarterKey.split('|')[1]).slice(-2)})
                </>
              )}
            </CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              {quarterDateRange && (
                <>
                  Window: <span className="font-medium">{quarterDateRange.start}</span> →{' '}
                  <span className="font-medium">{quarterDateRange.end}</span>.{' '}
                </>
              )}
              {showHdfcMock
                ? 'Themes aggregated via Tavily across X (Twitter), Reddit, Moneycontrol, LinkedIn, Economic Times, StockTwits, ValuePickr, YouTube, Trendlyne, Business Standard, Livemint, and CNBC-TV18.'
                : 'Driver / risk points are LLM-derived from the quarter analysis. News headlines are pulled from Yahoo Finance (Moneycontrol, Reuters, Bloomberg, GuruFocus and other publishers when Yahoo has indexed them for this ticker) and sentiment-classified.'}
              {newsLoading && ' Loading news…'}
              {newsData?.error && ` News fetch: ${newsData.error}`}
              {newsData && !newsData.error && newsData.rows.length > 0 && (
                <> {newsData.rows.length} news headline{newsData.rows.length === 1 ? '' : 's'} from {newsData.ticker}.</>
              )}
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
                  {paginatedSentiment.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-slate-500 py-6">
                        No sentiment signals available for {selectedCompany || 'this company'} yet.
                        {detailLoading ? ' Loading…' : ''}
                      </TableCell>
                    </TableRow>
                  )}
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
                          className={
                            SOURCE_BADGE_CLASS[s.source as SentimentSource] ??
                            'bg-slate-50 text-slate-700 border-slate-200'
                          }
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
                {activeSentimentData.length === 0
                  ? 0
                  : (sentimentPage - 1) * SENTIMENT_PAGE_SIZE + 1}
                –
                {Math.min(
                  sentimentPage * SENTIMENT_PAGE_SIZE,
                  activeSentimentData.length,
                )}{' '}
                of {activeSentimentData.length}
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
