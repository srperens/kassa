// Money helpers. Internally everything is an integer number of minor units
// (1 major unit = 100 minor, e.g. 1 kr = 100 öre, $1 = 100 cents). Currency is a
// per-account *display label* only — amounts are never converted between
// currencies. All supported currencies use 2 decimal places, so the /100 split
// is the same for every one of them; only the symbol, its position, and the
// decimal separator (which follows the language) vary.
import { locale } from './i18n';

export type Currency = 'SEK' | 'USD' | 'EUR' | 'GBP';

interface CurrencyInfo {
  symbol: string;
  position: 'before' | 'after'; // "$50" vs "50 kr"
}

const CURRENCIES: Record<Currency, CurrencyInfo> = {
  SEK: { symbol: 'kr', position: 'after' },
  USD: { symbol: '$', position: 'before' },
  EUR: { symbol: '€', position: 'before' },
  GBP: { symbol: '£', position: 'before' },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES) as Currency[];

export function currencySymbol(currency?: string): string {
  return (CURRENCIES[currency as Currency] ?? CURRENCIES.SEK).symbol;
}

// Format minor units in the active locale, e.g. 5000 -> "50 kr"/"$50",
// 4950 -> "49,50 kr" (sv) or "49.50 kr" (en). Unknown currencies fall back to SEK.
export function money(minor: number, currency?: string): string {
  const info = CURRENCIES[currency as Currency] ?? CURRENCIES.SEK;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  const sign = minor < 0 ? '−' : ''; // U+2212 minus
  const loc = locale();
  const dec = loc.startsWith('sv') ? ',' : '.';
  const num =
    cents === 0
      ? whole.toLocaleString(loc)
      : `${whole.toLocaleString(loc)}${dec}${String(cents).padStart(2, '0')}`;
  const body = info.position === 'before' ? `${info.symbol}${num}` : `${num} ${info.symbol}`;
  return `${sign}${body}`;
}

// Like money() but always shows an explicit + or − sign (for transaction rows).
export function moneySigned(minor: number, currency?: string): string {
  if (minor > 0) return `+${money(minor, currency)}`;
  return money(minor, currency); // money() already prefixes − for negatives
}

// Parse a user-typed amount into minor units. Accepts "50", "49,50", "49.50",
// "1 234,50" and tolerates a leading/trailing currency symbol ("$50", "50 kr").
// Returns a non-negative integer, or null if unparseable.
export function parseMoney(input: string): number | null {
  const cleaned = input
    .trim()
    .replace(/\s/g, '')
    .replace(/kr$/i, '')
    .replace(/^[$€£]|[$€£]$/g, '');
  if (!cleaned) return null;
  const m = cleaned.match(/^(\d+)(?:[.,](\d{1,2}))?$/);
  if (!m) return null;
  const whole = Number(m[1]);
  const cents = m[2] ? Number(m[2].padEnd(2, '0')) : 0;
  if (!Number.isFinite(whole) || !Number.isFinite(cents)) return null;
  return whole * 100 + cents;
}
