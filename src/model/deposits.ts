// Deposits (optional Deposits tab): money put into a holding on a date.
// Pure functions: parsing, and the yearly return a holding's value implies.

import { blank, num, table, type Rows } from './parse';

export interface Deposit {
  id: string;
  holdingId: string;
  /** YYYY-MM-DD */
  date: string;
  /** In the deposit's own currency. */
  amount: number;
  currency: string;
  notes: string;
  /** 1-based sheet row. */
  row: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A date cell as YYYY-MM-DD. Accepts 2026-07-01, 1/7/2026 or 1.7.2026 (day first,
 * as in Israel), and a spreadsheet serial number (days since 1899-12-30).
 */
export function parseDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return `${y}-${pad(+m[2])}-${pad(+m[1])}`;
  }
  return null;
}

export function parseDeposits(rows: Rows): Deposit[] {
  return table(rows)
    .filter((x) => !blank(x.holding_id) && parseDate(x.date) && num(x.amount) !== 0)
    .map((x) => ({
      id: String(x.deposit_id ?? '').trim(),
      holdingId: String(x.holding_id).trim(),
      date: parseDate(x.date)!,
      amount: num(x.amount),
      currency: String(x.currency ?? '').trim() || 'ILS',
      notes: String(x.notes ?? '').trim(),
      row: x._row,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const DAY = 86400000;
const years = (from: string, to: Date) => (to.getTime() - Date.parse(from + 'T00:00:00Z')) / DAY / 365.25;

/**
 * The yearly return that turns these deposits into today's value (money-weighted,
 * like XIRR). Null when it can't be told: no deposits, under ~2 months of history,
 * or no value.
 */
export function impliedReturn(deposits: { date: string; amount: number }[], value: number, today: Date): number | null {
  if (!deposits.length || value <= 0) return null;
  const span = Math.max(...deposits.map((d) => years(d.date, today)));
  if (span < 0.15) return null;
  const fv = (r: number) => deposits.reduce((a, d) => a + d.amount * Math.pow(1 + r, Math.max(0, years(d.date, today))), 0);
  let lo = -0.95;
  let hi = 5;
  if (fv(lo) > value || fv(hi) < value) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (fv(mid) > value) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Next free "D<n>" id. */
export function nextDepositId(existing: string[]): string {
  return nextId('D', existing);
}

/** An Intel (employer) share grant (optional Grants tab). */
export interface Grant {
  id: string;
  holdingId: string;
  /** YYYY-MM-DD */
  date: string;
  shares: number;
  notes: string;
}

export function parseGrants(rows: Rows): Grant[] {
  return table(rows)
    .filter((x) => parseDate(x.date) && num(x.shares) !== 0)
    .map((x) => ({
      id: String(x.grant_id ?? '').trim(),
      holdingId: String(x.holding_id ?? '').trim(),
      date: parseDate(x.date)!,
      shares: num(x.shares),
      notes: String(x.notes ?? '').trim(),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Next free id with this prefix, e.g. D7 or GR3. */
export function nextId(prefix: string, existing: string[]): string {
  let max = 0;
  const re = new RegExp('^' + prefix + '(\\d+)$');
  for (const id of existing) {
    const m = re.exec(id);
    if (m) max = Math.max(max, +m[1]);
  }
  return prefix + (max + 1);
}
