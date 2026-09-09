import { fiscalConventionLabel, fiscalQuarterRange } from '../utils/fiscalCalendar';

interface FiscalPeriodBadgeProps {
  company?: string | null;
  fiscalYear?: number | string | null;
  quarter?: string | number | null;
  className?: string;
}

/**
 * Shows which calendar months a selected quarter actually covers, since the
 * meaning depends on the company's fiscal year (see utils/fiscalCalendar).
 * Renders nothing when the company or period is unknown.
 */
export function FiscalPeriodBadge({
  company,
  fiscalYear,
  quarter,
  className = '',
}: FiscalPeriodBadgeProps) {
  const range = fiscalQuarterRange(company, fiscalYear, quarter);
  if (!range) return null;

  const title = fiscalConventionLabel(company) ?? undefined;

  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--acu-accent2)]/40 bg-[var(--acu-accent-pale,#fcecec)] px-2.5 py-1 text-xs font-medium whitespace-nowrap text-[var(--acu-accent2,#a01419)] ${className}`}
    >
      <span aria-hidden="true">🗓</span>
      {range.label}
    </span>
  );
}
