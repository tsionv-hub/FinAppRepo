// Turns a parsed Delta report into proposed changes to the sheet (SPEC v1.28). Nothing is
// written here: the review window shows the proposals, and only the ones the user keeps
// are written (see applyProposals).

import type { Cell, Rows } from '../model/parse';
import { a1, columnLetter, SheetsClient } from '../sheets/api';
import { isFormula } from '../sheets/edit';
import { accountKey, type DeltaProduct, type DeltaReport } from './delta';

export type ProposalTab = 'Holdings' | 'Pension';

export interface Proposal {
  tab: ProposalTab;
  /** Row in the tab (1-based). */
  row: number;
  /** The holding / fund name in the sheet. */
  name: string;
  /** Column name in the tab. */
  field: string;
  old: Cell;
  value: Cell;
  /** "MM/YYYY" of the report figure. */
  asOf: string | null;
  /** Why this one may be wrong: shown with it, and it starts unticked. */
  doubt?: 'zeroFee' | 'insTrack';
}

export interface ProductMatch {
  product: DeltaProduct;
  tab: ProposalTab;
  row: number;
  name: string;
}

export interface ImportPlan {
  proposals: Proposal[];
  matched: ProductMatch[];
  /** Products with money that are in no row of Holdings or Pension. */
  unmatched: DeltaProduct[];
  /** Products with no money and no row (closed accounts): not shown as missing. */
  empty: DeltaProduct[];
}

interface Tab {
  tab: ProposalTab;
  header: string[];
  rows: Rows;
}

/** Last day of an "MM/YYYY" month as YYYY-MM-DD. */
export function monthEnd(mmYYYY: string): string {
  const [m, y] = mmYYYY.split('/').map(Number);
  const d = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * The fund_number cell for a product's tracks, in the sheet's own format: one track → its number,
 * several → "(number,share%)" each, shares from the amount in each track (whole percents adding up to 100).
 * Null when a track number or amount is missing.
 */
export function trackCell(p: DeltaProduct): string | null {
  const ts = p.tracks.filter((t) => t.number);
  if (!ts.length || ts.length !== p.tracks.length) return null;
  if (ts.length === 1) return ts[0].number!;
  const total = ts.reduce((a, t) => a + (t.amount ?? 0), 0);
  if (!total || ts.some((t) => t.amount == null)) return null;
  const raw = ts.map((t) => (t.amount! / total) * 100);
  const sh = raw.map(Math.floor);
  // Largest remainders get the leftover points, so the shares add up to exactly 100.
  raw.map((v, i) => [v - sh[i], i] as const).sort((a, b) => b[0] - a[0]).slice(0, 100 - sh.reduce((a, b) => a + b, 0)).forEach(([, i]) => sh[i]++);
  return ts.map((t, i) => `(${t.number},${sh[i]}%)`).join(',');
}

/** The 5-year average return across the tracks, weighted by amount (null when any track has none). */
export function ret5y(p: DeltaProduct): number | null {
  const ts = p.tracks;
  if (!ts.length || ts.some((t) => t.ret5y == null)) return null;
  if (ts.length === 1) return ts[0].ret5y!;
  const total = ts.reduce((a, t) => a + (t.amount ?? 0), 0);
  if (!total) return null;
  return Math.round((ts.reduce((a, t) => a + (t.amount ?? 0) * t.ret5y!, 0) / total) * 100) / 100;
}

const asNum = (v: Cell) => (typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, '')));
/** Same value? Numbers within a small margin, text without spaces. */
function same(old: Cell, value: Cell): boolean {
  if (typeof value === 'number') {
    const o = asNum(old);
    return Number.isFinite(o) && Math.abs(o - value) < (Math.abs(value) >= 100 ? 0.5 : 0.005);
  }
  return String(old ?? '').replace(/\s/g, '') === String(value ?? '').replace(/\s/g, '');
}

/** The cells this product would change in its row, for the columns the tab has. */
function fieldsFor(t: Tab, p: DeltaProduct, row: Rows[number]): { field: string; value: Cell }[] {
  const has = (k: string) => t.header.includes(k);
  const out: { field: string; value: Cell }[] = [];
  const add = (field: string, value: Cell | null | undefined) => {
    if (value == null || value === '' || !has(field)) return;
    out.push({ field, value });
  };
  const cur = (k: string) => row[t.header.indexOf(k)];
  if (t.tab === 'Holdings') {
    // Only an ILS holding's amount can take the report's shekel balance.
    const ccy = String(cur('currency') ?? '').trim().toUpperCase();
    if (!ccy || ccy === 'ILS') add('current_amount', p.balance);
    add('deposit_fee_pct', p.depositFeePct);
    add('management_fee_pct', p.balanceFeePct);
    add('return_5y_avg_pct', ret5y(p));
  } else {
    add('current_amount_ILS', p.balance);
    add('deposit_fee_pct', p.depositFeePct);
    add('accumulation_fee_pct', p.balanceFeePct);
  }
  add('fund_number', trackCell(p));
  return out;
}

/** Insurance products (policies) list the insurer's own track numbers, which may not be the official fund numbers. */
const INSURANCE = /ביטוח|חיים|פוליס|מנהלים/;
const FEES = new Set(['deposit_fee_pct', 'management_fee_pct', 'accumulation_fee_pct']);

function doubtOf(p: DeltaProduct, field: string, old: Cell, value: Cell): Proposal['doubt'] {
  // A fee that drops to exactly 0% is usually a fee the company didn't report.
  if (FEES.has(field) && value === 0 && asNum(old) > 0) return 'zeroFee';
  if (field === 'fund_number' && INSURANCE.test(p.type)) return 'insTrack';
  return undefined;
}

/** Proposed changes for every product of the report found in Holdings or Pension (by account number). */
export function planImport(r: DeltaReport, holdings: { header: string[]; rows: Rows }, pension: { header: string[]; rows: Rows }): ImportPlan {
  const tabs: Tab[] = [
    { tab: 'Holdings', ...holdings },
    { tab: 'Pension', ...pension },
  ];
  const plan: ImportPlan = { proposals: [], matched: [], unmatched: [], empty: [] };
  for (const p of r.products) {
    const k = accountKey(p.account);
    let hit: { t: Tab; i: number } | null = null;
    for (const t of tabs) {
      const ac = t.header.indexOf('account_number');
      if (ac < 0) continue;
      const i = t.rows.findIndex((row, n) => n > 0 && k.length >= 5 && accountKey(String(row[ac] ?? '')) === k);
      if (i > 0) {
        hit = { t, i };
        break;
      }
    }
    if (!hit) {
      (p.balance ? plan.unmatched : plan.empty).push(p);
      continue;
    }
    const { t, i } = hit;
    const row = t.rows[i];
    const name = String(row[t.header.indexOf('name')] ?? '');
    plan.matched.push({ product: p, tab: t.tab, row: i + 1, name });
    let amountChanged = false;
    for (const f of fieldsFor(t, p, row)) {
      const old = row[t.header.indexOf(f.field)] ?? '';
      if (same(old, f.value)) continue;
      if (f.field === 'current_amount') amountChanged = true;
      plan.proposals.push({ tab: t.tab, row: i + 1, name, field: f.field, old, value: f.value, asOf: p.asOf, doubt: doubtOf(p, f.field, old, f.value) });
    }
    // A new balance also moves the holding's "last updated" date to the report's date.
    if (amountChanged && p.asOf && t.header.includes('last_updated')) {
      const old = row[t.header.indexOf('last_updated')] ?? '';
      const value = monthEnd(p.asOf);
      if (!same(old, value)) plan.proposals.push({ tab: t.tab, row: i + 1, name, field: 'last_updated', old, value, asOf: p.asOf });
    }
  }
  return plan;
}

/**
 * Writes the chosen proposals, one request for all. A cell that holds a formula is never written:
 * those are returned, so the user can be told.
 */
export async function applyProposals(c: SheetsClient, chosen: Proposal[], headers: Record<ProposalTab, string[]>): Promise<Proposal[]> {
  const rows = [...new Set(chosen.map((p) => `${p.tab}|${p.row}`))];
  const formulas = new Map<string, Rows[number]>();
  await Promise.all(
    rows.map(async (k) => {
      const [tab, row] = k.split('|') as [ProposalTab, string];
      const last = columnLetter(Math.max(0, headers[tab].length - 1));
      formulas.set(k, await c.rowFormulas(a1(tab, `A${row}:${last}${row}`)));
    }),
  );
  const skipped: Proposal[] = [];
  const data: { range: string; values: Rows }[] = [];
  for (const p of chosen) {
    const i = headers[p.tab].indexOf(p.field);
    if (i < 0 || isFormula(formulas.get(`${p.tab}|${p.row}`)?.[i])) {
      skipped.push(p);
      continue;
    }
    data.push({ range: a1(p.tab, columnLetter(i) + p.row), values: [[p.value]] });
  }
  await c.batchUpdate(data);
  return skipped;
}
