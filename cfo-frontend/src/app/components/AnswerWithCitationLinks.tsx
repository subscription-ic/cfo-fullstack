import type { ReactNode } from 'react';

/**
 * Turn inline citations like [a1b2c3#4] into links when citation_hrefs maps the id to a signed PDF URL.
 */
export function AnswerWithCitationLinks({
  text,
  hrefs,
  className,
}: {
  text: string;
  hrefs?: Record<string, string>;
  className?: string;
}) {
  if (!hrefs || Object.keys(hrefs).length === 0) {
    return <span className={className}>{text}</span>;
  }

  const keys = Object.keys(hrefs).sort((a, b) => b.length - a.length);
  const parts: ReactNode[] = [];
  let remaining = text;
  let keyIndex = 0;

  while (remaining.length > 0) {
    let bestPos = -1;
    let bestKey = '';
    let bestLen = 0;
    for (const k of keys) {
      const token = `[${k}]`;
      const pos = remaining.indexOf(token);
      if (pos !== -1 && (bestPos === -1 || pos < bestPos)) {
        bestPos = pos;
        bestKey = k;
        bestLen = token.length;
      }
    }
    if (bestPos === -1) {
      parts.push(
        <span key={`t-${keyIndex++}`}>{remaining}</span>,
      );
      break;
    }
    if (bestPos > 0) {
      parts.push(
        <span key={`t-${keyIndex++}`}>{remaining.slice(0, bestPos)}</span>,
      );
    }
    const href = hrefs[bestKey];
    parts.push(
      <a
        key={`a-${keyIndex++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#ED232A] underline underline-offset-2 font-mono text-[13px] font-semibold"
        title="Open source PDF at this page"
      >
        [{bestKey}]
      </a>,
    );
    remaining = remaining.slice(bestPos + bestLen);
  }

  return <span className={className}>{parts}</span>;
}
