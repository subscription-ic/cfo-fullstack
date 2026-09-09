// Fiscal-year conventions differ per issuer, so "Q1 FY26" means different
// calendar months depending on the company:
//
//   Americana  — calendar fiscal year (Jan–Dec). FY2026 Q1 = Jan–Mar 2026.
//   HDFC Bank  — Indian April–March fiscal year. FY2026 spans Apr 2025 –
//   ITC          Mar 2026, so FY2026 Q1 = Apr–Jun 2025 and Q4 = Jan–Mar 2026.
//
// Companies we don't recognise return null rather than a guessed range — a
// wrong month label is worse than no label.

export type FiscalConvention = 'calendar' | 'april-march';

/** Matched as lowercase substrings so "Americana Restaurants" etc. still resolve. */
const CALENDAR_FY_COMPANIES = ['americana'];
const APRIL_FY_COMPANIES = ['hdfc', 'itc'];

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function fiscalConventionFor(
  company?: string | null,
): FiscalConvention | null {
  const c = (company ?? '').trim().toLowerCase();
  if (!c) return null;
  if (CALENDAR_FY_COMPANIES.some((k) => c.includes(k))) return 'calendar';
  if (APRIL_FY_COMPANIES.some((k) => c.includes(k))) return 'april-march';
  return null;
}

/** Accepts 2026, "2026", "FY26", "FY2026", "26" → 2026. */
function normalizeFiscalYear(fy: number | string | null | undefined): number | null {
  if (fy == null || fy === '') return null;
  const digits = String(fy).replace(/[^0-9]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n)) return null;
  if (digits.length <= 2) return 2000 + n;
  return n;
}

/** Accepts "Q1", "q1", "1", "Q1 FY26" → 1. */
function normalizeQuarter(quarter: string | number | null | undefined): number | null {
  if (quarter == null || quarter === '') return null;
  const m = String(quarter).match(/[1-4]/);
  if (!m) return null;
  return Number(m[0]);
}

export interface FiscalPeriodRange {
  /** e.g. "Jan–Mar 2026" */
  label: string;
  /** 0-indexed calendar month of the quarter's first month. */
  startMonth: number;
  startYear: number;
  endMonth: number;
  endYear: number;
  convention: FiscalConvention;
}

/**
 * Calendar months covered by `quarter` of `fiscalYear` for `company`.
 * Returns null when the company's convention is unknown or the inputs don't
 * parse, so callers can simply render nothing.
 */
export function fiscalQuarterRange(
  company: string | null | undefined,
  fiscalYear: number | string | null | undefined,
  quarter: string | number | null | undefined,
): FiscalPeriodRange | null {
  const convention = fiscalConventionFor(company);
  if (!convention) return null;

  const fy = normalizeFiscalYear(fiscalYear);
  const q = normalizeQuarter(quarter);
  if (fy == null || q == null) return null;

  // Calendar-year issuers start FY in January of the FY itself; April–March
  // issuers start in April of the *previous* calendar year (FY26 → Apr 2025).
  const startMonthOfFy = convention === 'calendar' ? 0 : 3;
  const startYearOfFy = convention === 'calendar' ? fy : fy - 1;

  const absoluteStart = startMonthOfFy + (q - 1) * 3;
  const startYear = startYearOfFy + Math.floor(absoluteStart / 12);
  const startMonth = absoluteStart % 12;

  const absoluteEnd = absoluteStart + 2;
  const endYear = startYearOfFy + Math.floor(absoluteEnd / 12);
  const endMonth = absoluteEnd % 12;

  // A quarter never straddles a calendar year under either convention, but
  // label defensively in case that ever changes.
  const label =
    startYear === endYear
      ? `${MONTHS[startMonth]}–${MONTHS[endMonth]} ${startYear}`
      : `${MONTHS[startMonth]} ${startYear}–${MONTHS[endMonth]} ${endYear}`;

  return { label, startMonth, startYear, endMonth, endYear, convention };
}

/** Human-readable description of the company's fiscal year, for tooltips. */
export function fiscalConventionLabel(company?: string | null): string | null {
  const convention = fiscalConventionFor(company);
  if (convention === 'calendar') return 'Fiscal year runs Jan–Dec';
  if (convention === 'april-march') return 'Fiscal year runs Apr–Mar';
  return null;
}

/** Convenience: "Jan–Mar 2026" for a period, or null. */
export function fiscalQuarterLabel(
  company: string | null | undefined,
  fiscalYear: number | string | null | undefined,
  quarter: string | number | null | undefined,
): string | null {
  return fiscalQuarterRange(company, fiscalYear, quarter)?.label ?? null;
}
