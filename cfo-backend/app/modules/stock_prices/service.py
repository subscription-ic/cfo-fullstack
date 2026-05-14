"""Stock-price retrieval scoped to a (company, fiscal_year, quarter).

Indian fiscal-year convention: FYxxxx = Apr (xxxx-1) → Mar xxxx (e.g. FY26 =
Apr-2025 → Mar-2026). Quarters within an FY: Q1=Apr-Jun, Q2=Jul-Sep,
Q3=Oct-Dec, Q4=Jan-Mar.

Ticker resolution: ask Yahoo Finance's search endpoint for the company name,
prefer NSE (`.NS`), then BSE (`.BO`), then any equity quote. Caches the
resolution in memory for the lifetime of the process.
"""

from __future__ import annotations

import logging
import re
from datetime import date, timedelta
from typing import Any

import requests
import yfinance as yf
from supabase import Client

logger = logging.getLogger(__name__)

_YAHOO_SEARCH_URL = "https://query2.finance.yahoo.com/v1/finance/search"
_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)
_QUOTE_TYPE_RANK = {"EQUITY": 0, "ETF": 1, "MUTUALFUND": 2}
_EXCHANGE_RANK = {"NSI": 0, "BSE": 1, "NMS": 2, "NYQ": 3}  # NSI = NSE on Yahoo

# Module-level cache so repeated requests for the same company don't hammer Yahoo.
_TICKER_CACHE: dict[str, str | None] = {}


def _quarter_to_range(fiscal_year: int, quarter: str) -> tuple[date, date]:
    """Indian fiscal-year mapping: FY26 = Apr 2025 → Mar 2026."""
    q = (quarter or "").strip().upper()
    cal_start_year = fiscal_year - 1  # FY26 starts in 2025
    if q == "Q1":
        return date(cal_start_year, 4, 1), date(cal_start_year, 6, 30)
    if q == "Q2":
        return date(cal_start_year, 7, 1), date(cal_start_year, 9, 30)
    if q == "Q3":
        return date(cal_start_year, 10, 1), date(cal_start_year, 12, 31)
    if q == "Q4":
        return date(fiscal_year, 1, 1), date(fiscal_year, 3, 31)
    raise ValueError(f"Unknown quarter '{quarter}' (expected Q1/Q2/Q3/Q4)")


def resolve_ticker(company: str) -> str | None:
    """Ask Yahoo's search endpoint for the best ticker for this company name.
    Preference order: NSE → BSE → other equities. Returns None when nothing fits."""
    key = (company or "").strip().lower()
    if not key:
        return None
    if key in _TICKER_CACHE:
        return _TICKER_CACHE[key]

    try:
        resp = requests.get(
            _YAHOO_SEARCH_URL,
            params={"q": key, "quotesCount": 10, "newsCount": 0, "enableEnhancedTrivialQuery": "true"},
            headers={"User-Agent": _USER_AGENT, "Accept": "application/json"},
            timeout=8,
        )
        resp.raise_for_status()
        quotes = list(resp.json().get("quotes") or [])
    except Exception as exc:
        logger.warning("yahoo search failed for %r: %s", company, exc)
        _TICKER_CACHE[key] = None
        return None

    if not quotes:
        _TICKER_CACHE[key] = None
        return None

    def _rank(q: dict[str, Any]) -> tuple[int, int]:
        qt = str(q.get("quoteType") or "").upper()
        ex = str(q.get("exchange") or "").upper()
        return (_QUOTE_TYPE_RANK.get(qt, 9), _EXCHANGE_RANK.get(ex, 9))

    quotes.sort(key=_rank)
    chosen = quotes[0].get("symbol")
    ticker = str(chosen).strip() if chosen else None
    _TICKER_CACHE[key] = ticker
    return ticker


_DATE_PATTERNS = [
    # "January 31, 2026" / "Jan 31, 2026"
    re.compile(
        r"(?P<month>January|February|March|April|May|June|July|August|September|"
        r"October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
        r"[.\s]+(?P<day>\d{1,2})(?:st|nd|rd|th)?[,\s]+(?P<year>\d{4})",
        re.IGNORECASE,
    ),
    # "31 January 2026" / "31st Jan 2026"
    re.compile(
        r"(?P<day>\d{1,2})(?:st|nd|rd|th)?\s+"
        r"(?P<month>January|February|March|April|May|June|July|August|September|"
        r"October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
        r"[,\s]+(?P<year>\d{4})",
        re.IGNORECASE,
    ),
]
_MONTH_INDEX = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6,
    "jul": 7, "july": 7, "aug": 8, "august": 8, "sep": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}


def _extract_dates_from_text(text: str) -> list[date]:
    """Pull every plausible 'Month DD, YYYY' or 'DD Month YYYY' from `text`."""
    if not text:
        return []
    out: list[date] = []
    for pat in _DATE_PATTERNS:
        for m in pat.finditer(text):
            try:
                d = int(m.group("day"))
                y = int(m.group("year"))
                mo = _MONTH_INDEX.get(m.group("month").lower())
                if mo is None:
                    continue
                out.append(date(y, mo, d))
            except (ValueError, KeyError):
                continue
    return out


def _earnings_dates_from_transcript(
    supabase: Client | None, company: str, fiscal_year: int, quarter: str,
    start: date, end: date,
) -> list[str]:
    """Fallback: when Yahoo has no calendar entry, scan the first page of any
    transcript-type document for this period for a date that falls inside
    [quarter_start, quarter_end + 100 days]."""
    if supabase is None:
        return []
    try:
        from app.shared.constants import TRANSCRIPT_DOC_TYPES
        # Find transcript documents for this company+period.
        docs_resp = (
            supabase.table("documents")
            .select("id, document_type")
            .ilike("company", f"%{company.strip()}%")
            .eq("fiscal_year", fiscal_year)
            .eq("quarter", quarter)
            .execute()
        )
        tr_ids = [
            r["id"] for r in (docs_resp.data or [])
            if str(r.get("document_type") or "").strip() in TRANSCRIPT_DOC_TYPES
        ]
        if not tr_ids:
            return []
        chunks_resp = (
            supabase.table("document_chunks")
            .select("content, page_number")
            .in_("document_id", tr_ids)
            .order("page_number", desc=False)
            .limit(8)
            .execute()
        )
        window_end = end + timedelta(days=100)
        found: list[str] = []
        for ch in (chunks_resp.data or []):
            text = str(ch.get("content") or "")[:4000]
            for d in _extract_dates_from_text(text):
                if start <= d <= window_end:
                    iso = d.isoformat()
                    if iso not in found:
                        found.append(iso)
            if found:
                break  # first page hit is enough
        found.sort()
        return found
    except Exception as exc:
        logger.warning("transcript date-extract failed: %s", exc)
        return []


def _earnings_dates_for_period(
    tk: "yf.Ticker", start: date, end: date,
) -> list[str]:
    """Yahoo's `earnings_dates` returns past + upcoming reporting dates for a
    ticker. The call that reports a quarter usually lands shortly AFTER the
    quarter ends, so we include a 100-day window past `end` to catch it.
    Returns ISO date strings, deduped + sorted ascending. Empty list when
    Yahoo's calendar has nothing for this ticker (common for small caps).
    """
    window_end = end + timedelta(days=100)
    try:
        df = tk.earnings_dates
    except Exception as exc:
        logger.warning("yfinance earnings_dates fetch failed: %s", exc)
        return []
    if df is None:
        return []
    dates: list[str] = []
    try:
        for ts in df.index:
            try:
                d = ts.date() if hasattr(ts, "date") else date.fromisoformat(str(ts)[:10])
            except Exception:
                continue
            if start <= d <= window_end:
                iso = d.isoformat()
                if iso not in dates:
                    dates.append(iso)
    except Exception as exc:
        logger.warning("yfinance earnings_dates parse failed: %s", exc)
        return []
    dates.sort()
    return dates


def fetch_quarter_prices(
    supabase: Client,
    company: str,
    fiscal_year: int,
    quarter: str,
) -> dict[str, Any]:
    """Return daily OHLCV for the quarter plus dynamic earnings-call markers.

    Earnings-call resolution order:
      1. yfinance `Ticker.earnings_dates` — Yahoo's reporting calendar (best
         when available; thin for small-cap Indian tickers).
      2. Regex scan of the transcript document's first chunks for a date
         inside the [quarter_start, quarter_end + 100 days] window.
    """
    ticker = resolve_ticker(company)
    if not ticker:
        return {
            "company": company,
            "ticker": None,
            "currency": None,
            "range": None,
            "prices": [],
            "return_pct": None,
            "earnings_call_dates": [],
            "error": "Could not resolve a ticker symbol for this company on Yahoo Finance.",
        }

    try:
        start, end = _quarter_to_range(fiscal_year, quarter)
    except ValueError as exc:
        return {
            "company": company,
            "ticker": ticker,
            "currency": None,
            "range": None,
            "prices": [],
            "return_pct": None,
            "earnings_call_dates": [],
            "error": str(exc),
        }

    # Build the chart's effective date range. The selected quarter is the
    # core window, but the earnings call for that quarter typically lands a
    # few weeks AFTER quarter-end. If yfinance lists one in that post-quarter
    # window we extend the chart's end so the marker is visible alongside the
    # price reaction. `chart_end` may equal `end` if no future call is known.
    tk = yf.Ticker(ticker)
    earnings_call_dates = _earnings_dates_for_period(tk, start, end)
    if not earnings_call_dates:
        earnings_call_dates = _earnings_dates_from_transcript(
            supabase, company, fiscal_year, quarter, start, end,
        )
    latest_call_iso = max(earnings_call_dates) if earnings_call_dates else None
    chart_end = end
    if latest_call_iso:
        try:
            latest_call = date.fromisoformat(latest_call_iso)
            if latest_call > end:
                chart_end = latest_call + timedelta(days=5)
        except ValueError:
            pass

    # yfinance's `end` parameter is exclusive — bump by one day to include the
    # final trading day.
    end_exclusive = chart_end + timedelta(days=1)
    try:
        hist = tk.history(start=start.isoformat(), end=end_exclusive.isoformat(), interval="1d")
    except Exception as exc:
        logger.warning("yfinance history failed for %s: %s", ticker, exc)
        return {
            "company": company,
            "ticker": ticker,
            "currency": None,
            "range": {"start": start.isoformat(), "end": end.isoformat()},
            "prices": [],
            "return_pct": None,
            "earnings_call_dates": [],
            "error": f"yfinance error: {exc}",
        }

    currency: str | None = None
    try:
        info = getattr(tk, "fast_info", None)
        if info is not None:
            currency = str(getattr(info, "currency", None) or "") or None
    except Exception:
        currency = None

    prices: list[dict[str, Any]] = []
    for ts, row in hist.iterrows():
        prices.append({
            "date": ts.date().isoformat(),
            "open": float(row.get("Open")) if row.get("Open") is not None else None,
            "high": float(row.get("High")) if row.get("High") is not None else None,
            "low": float(row.get("Low")) if row.get("Low") is not None else None,
            "close": float(row.get("Close")) if row.get("Close") is not None else None,
            "volume": int(row.get("Volume")) if row.get("Volume") is not None else None,
        })

    # Return % is anchored to the SELECTED QUARTER (first open inside the
    # window → last close inside the window), not the extended chart range —
    # so the headline number stays comparable across quarters.
    in_quarter_prices = [
        p for p in prices
        if p.get("date") and start.isoformat() <= p["date"] <= end.isoformat()
    ]
    return_pct: float | None = None
    if len(in_quarter_prices) >= 2:
        first_open = in_quarter_prices[0].get("open") or in_quarter_prices[0].get("close")
        last_close = in_quarter_prices[-1].get("close")
        if first_open and last_close and first_open != 0:
            return_pct = round(((last_close - first_open) / first_open) * 100.0, 2)

    return {
        "company": company,
        "ticker": ticker,
        "currency": currency,
        # `range` is the chart's full X-axis span: quarter window, optionally
        # extended through the post-quarter earnings call. `quarter_range`
        # carries the original quarter bounds for any caller that needs them.
        "range": {"start": start.isoformat(), "end": chart_end.isoformat()},
        "quarter_range": {"start": start.isoformat(), "end": end.isoformat()},
        "prices": prices,
        "return_pct": return_pct,
        "earnings_call_dates": earnings_call_dates,
        "error": None,
    }
