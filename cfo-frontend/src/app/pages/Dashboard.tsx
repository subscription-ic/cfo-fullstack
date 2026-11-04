import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { fetchDocumentCatalog, getAccessToken } from '../utils/api';

/* Top navigation. Unicode glyphs follow the Acuvon booklet's iconography set
   (section 11). Each entry routes to the same page as its module card. */
const NAV_ITEMS = [
  { label: 'Dashboard', glyph: '', path: '/dashboard' },
  { label: 'Company Details', glyph: '▣', path: '/company-details' },
  { label: 'Historical Hub', glyph: '◈', path: '/intelligence-hub' },
  { label: 'Simulator', glyph: '⬡', path: '/simulator' },
  { label: 'Post-Call Analysis', glyph: '◇', path: '/post-call-analysis' },
];

type ModuleCard = {
  glyph: string;
  title: string;
  description: string;
  bullets: string[];
  cta: string;
  path: string;
};

const MODULES: ModuleCard[] = [
  {
    glyph: '▣',
    title: 'Company Details',
    description: 'Manage companies and the documents uploaded for them',
    // filled in at render time from /documents
    bullets: [],
    cta: 'View Details',
    path: '/company-details',
  },
  {
    glyph: '◈',
    title: 'Historical Intelligence Hub',
    description: 'Explore past earnings calls with detailed analysis and insights',
    bullets: [
      'Quarter-by-quarter review',
      'Questions & attendee tracking',
      'Sentiment & theme analysis',
      'AI-generated summaries',
    ],
    cta: 'Access Hub',
    path: '/intelligence-hub',
  },
  {
    glyph: '⬡',
    title: 'Earnings Call Simulator',
    description: 'Prepare for upcoming calls with AI-predicted questions',
    bullets: [
      '24 Predicted Questions',
      'Interactive Q&A simulator',
      'Rehearsal Mode Ready',
      'Custom Question Builder',
    ],
    cta: 'Start Simulator',
    path: '/simulator',
  },
  {
    glyph: '◇',
    title: 'Post-Call Analysis',
    description: 'Track market response and analyst reactions post-earnings',
    bullets: [
      'Stock price movement (7-day)',
      'Sentiment evolution analysis',
      'Analyst rating changes',
      'FII/DII flow tracking',
    ],
    cta: 'View Analysis',
    path: '/post-call-analysis',
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = localStorage.getItem('isAdmin') === 'true';

  // Live figure for the Company Details card. The call is read-only and
  // failures fall back to a static bullet list rather than breaking the card.
  const [docCount, setDocCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = getAccessToken();
    if (token) {
      fetchDocumentCatalog(token)
        .then((d) => !cancelled && setDocCount(d.length))
        .catch(() => !cancelled && setDocCount(null));
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const companyBullets = (): string[] => {
    return [
      docCount === null ? 'Documents uploaded' : `${docCount} document${docCount === 1 ? '' : 's'} uploaded`,
      'Documents by period & type',
      'Q&A coverage per company',
    ];
  };

  return (
    <div className="min-h-screen bg-[#f2f2f2]">
      {/* Top navigation — booklet .topbar: white, 60px, hairline bottom border */}
      <header className="sticky top-0 z-50 h-[3.6rem] bg-white border-b border-[var(--acu-border)] flex items-stretch px-8">
        <nav className="flex items-stretch">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className={`relative flex items-center gap-2 px-5 text-[1rem] cursor-pointer transition-colors duration-200 ${
                  active
                    ? 'text-[var(--acu-accent2)] font-medium'
                    : 'text-[var(--acu-ink2)] hover:text-[var(--acu-accent2)]'
                }`}
              >
                {item.glyph && (
                  <span className="text-[0.875rem] leading-none">{item.glyph}</span>
                )}
                {item.label}
                {active && (
                  <span className="absolute left-4 right-4 bottom-0 h-[2px] bg-[var(--acu-accent2)]" />
                )}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="max-w-[1880px] mx-auto px-6 pb-10">
        {/* Admin entry point — unchanged */}
        <div className="flex justify-end items-center gap-3 pt-4 min-h-[2.25rem]">
          {isAdmin && (
            <Button
              onClick={() => navigate('/admin')}
              className="bg-[#a01419] hover:bg-[#A00000] text-white cursor-pointer"
            >
              Go to Admin Panel
            </Button>
          )}
        </div>

        <div className="mb-6 mt-1 text-center">
          <h1 className="acu-display font-normal text-[2.4rem] leading-tight text-[var(--acu-ink)] mb-1">
            Earnings Call Companion
          </h1>
          <p className="text-[1rem] text-[var(--acu-ink3)]">Select a module to begin</p>
        </div>

        {/* Module Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {MODULES.map((m) => (
            <Card
              key={m.path}
              className="h-full gap-4 rounded-lg bg-white border border-[var(--acu-border)] shadow-none cursor-pointer group transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--acu-accent-light)] hover:shadow-[0_6px_16px_rgba(15,17,23,0.06)]"
              onClick={() => navigate(m.path)}
            >
              <CardHeader className="space-y-3 pt-5 pb-0">
                <div className="w-12 h-12 rounded-[10px] bg-[var(--acu-accent2)] flex items-center justify-center text-white text-[1.4rem] leading-none transition-transform group-hover:scale-105">
                  {m.glyph}
                </div>
                <div>
                  {/* one-line floor — at 440px every title fits on a single
                      line. If one wraps on a narrower window the card simply
                      grows; the CTA stays aligned via mt-auto below. */}
                  <CardTitle className="acu-display font-normal text-[1.75rem] leading-tight text-[var(--acu-ink)] mb-2 min-h-[2.2rem]">
                    {m.title}
                  </CardTitle>
                  {/* two-line floor keeps every card's bullet list on the same
                      baseline when a description happens to fit on one line */}
                  <CardDescription className="text-[1rem] leading-[1.55] text-[var(--acu-ink3)] min-h-[3.15rem]">
                    {m.description}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-0 pb-5 flex-1 flex flex-col">
                <ul className="space-y-2 mb-4">
                  {(m.path === '/company-details' ? companyBullets() : m.bullets).map((b) => (
                    <li
                      key={b}
                      className="flex items-start gap-2.5 text-[0.95rem] text-[var(--acu-ink2)]"
                    >
                      <span className="text-[0.8rem] leading-none mt-[0.3rem] text-[var(--acu-accent2)]">
                        ◇
                      </span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto flex items-center gap-2 text-[1rem] font-medium text-[var(--acu-accent2)] transition-all group-hover:gap-3">
                  {m.cta}
                  <span aria-hidden="true">→</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center mt-10 text-[0.9rem] text-[var(--acu-ink3)]">
          Secure &amp; Confidential · Enterprise-Grade Intelligence
        </div>
      </div>
    </div>
  );
}
