// Money helpers. Internally everything is integer öre (1 kr = 100 öre).
import { locale } from './i18n';

// Format öre as kronor in the active locale: 5000 -> "50 kr", 4950 -> "49,50 kr"
// (sv) or "49.50 kr" (en). The currency is always kronor; only grouping and the
// decimal separator follow the language.
export function kr(ore: number): string {
  const abs = Math.abs(ore);
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  const sign = ore < 0 ? '−' : ''; // U+2212 minus
  const loc = locale();
  const dec = loc.startsWith('sv') ? ',' : '.';
  const num =
    cents === 0
      ? whole.toLocaleString(loc)
      : `${whole.toLocaleString(loc)}${dec}${String(cents).padStart(2, '0')}`;
  return `${sign}${num} kr`;
}

// Like kr() but always shows an explicit + or − sign (for transaction rows).
export function krSigned(ore: number): string {
  if (ore > 0) return `+${kr(ore)}`;
  return kr(ore); // kr() already prefixes − for negatives
}

// Parse a user-typed amount in kronor into öre. Accepts "50", "49,50", "49.50",
// "1 234,50". Returns a non-negative integer, or null if unparseable.
export function parseKr(input: string): number | null {
  const cleaned = input.trim().replace(/\s/g, '').replace(/kr$/i, '');
  if (!cleaned) return null;
  const m = cleaned.match(/^(\d+)(?:[.,](\d{1,2}))?$/);
  if (!m) return null;
  const whole = Number(m[1]);
  const cents = m[2] ? Number(m[2].padEnd(2, '0')) : 0;
  if (!Number.isFinite(whole) || !Number.isFinite(cents)) return null;
  return whole * 100 + cents;
}
