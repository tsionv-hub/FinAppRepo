// Reads the whole sheet into model objects, and the three explicit writes:
// new goals, rainy day fund amount, retirement age and allowance.

import { parseGoals, parseHoldings, parseLoans, parsePension, parseSettings, type GoalsTab } from '../model/parse';
import { nextDepositId, parseDeposits, type Deposit } from '../model/deposits';
import type { Goal, Holding, Loan, PensionFund, Settings, StartMonth } from '../model/types';
import type { Cell, Rows } from '../model/parse';
import { a1, columnLetter, SheetsClient, SheetsError } from './api';
import { RULES, validate, type Checklist } from './validate';

export interface SheetData {
  title: string;
  settings: Settings;
  holdings: Holding[];
  pension: PensionFund[];
  goals: GoalsTab;
  loans: Loan[];
  /** Null when the sheet has no Deposits tab. */
  deposits: Deposit[] | null;
  /** Column order of the tabs the app writes to. */
  headers: { holdings: string[]; deposits: string[] };
  fetchedAt: number;
}

export interface LoadResult {
  check: Checklist;
  /** Null when a required tab or column is missing. */
  data: SheetData | null;
  title: string;
}

/** Reads every tab in one batch request, validates, then parses. */
export async function loadSheet(c: SheetsClient, start: StartMonth): Promise<LoadResult> {
  const meta = await c.meta();
  const present = Object.keys(RULES).filter((t) => meta.tabs.includes(t));
  const got = present.length ? await c.batchGet(present.map((t) => (t === 'Settings' ? a1(t, 'A:C') : a1(t)))) : [];
  const rows: Record<string, Rows> = {};
  present.forEach((t, i) => (rows[t] = got[i] ?? []));
  return fromRows(meta.title, meta.tabs, rows, start);
}

/** Validates and parses rows already read (from the sheet, or the built-in example). */
export function fromRows(title: string, tabs: string[], rows: Record<string, Rows>, start: StartMonth): LoadResult {
  const check = validate(tabs, rows);
  if (!check.ok) return { check, data: null, title };
  const settings = parseSettings(rows.Settings);
  return {
    check,
    title,
    data: {
      title,
      settings,
      holdings: parseHoldings(rows.Holdings, settings.fx),
      pension: rows.Pension ? parsePension(rows.Pension) : [],
      goals: parseGoals(rows.Goals, start.year),
      loans: rows.Loans ? parseLoans(rows.Loans) : [],
      deposits: rows.Deposits ? parseDeposits(rows.Deposits) : null,
      headers: {
        holdings: (rows.Holdings[0] ?? []).map((h) => String(h ?? '').trim()),
        deposits: (rows.Deposits?.[0] ?? []).map((h) => String(h ?? '').trim()),
      },
      fetchedAt: Date.now(),
    },
  };
}

function col(header: string[], name: string): number {
  const i = header.indexOf(name);
  if (i < 0) throw new SheetsError('other', 0, `Goals tab has no ${name} column`);
  return i;
}

export async function saveReserve(c: SheetsClient, gt: GoalsTab, amount: number): Promise<void> {
  if (!gt.reserveRow) throw new SheetsError('other', 0, 'no reserve row');
  const ci = col(gt.header, 'target_amount_ILS');
  await c.update(a1('Goals', columnLetter(ci) + gt.reserveRow), [[amount]]);
}

export async function saveRetirement(c: SheetsClient, s: Settings, age: number, allowance: number): Promise<void> {
  const ra = s.rows.retirement_age;
  const al = s.rows.pre_retirement_allowance_ILS;
  if (!ra || !al) throw new SheetsError('other', 0, 'Settings is missing retirement_age or pre_retirement_allowance_ILS');
  await c.update(a1('Settings', 'B' + ra), [[age]]);
  await c.update(a1('Settings', 'B' + al), [[allowance]]);
}

/** Next free "G<n>" ids. */
export function nextIds(existing: string[], n: number): string[] {
  let max = 0;
  for (const id of existing) {
    const m = /^G(\d+)$/.exec(id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return Array.from({ length: n }, (_, i) => 'G' + (max + i + 1));
}

/** Rows for new goals, laid out in the Goals tab's own column order. */
export function goalRows(gt: GoalsTab, goals: Goal[]): Rows {
  const ids = nextIds(gt.ids, goals.length);
  const prio = gt.ids.length; // after every existing row
  return goals.map((g, i) => {
    const v: Record<string, Cell> = {
      id: ids[i],
      name: g.name,
      target_amount_ILS: g.amount,
      target_year: g.year,
      target_month: g.month || 1,
      priority: prio + i + 1,
      notes: 'Added in app',
      spend_when_due: g.spend ? 1 : 0,
      type: '',
      repeat_every_years: g.everyYears ?? '',
      repeat_until_year: g.everyYears ? (g.untilYear ?? '') : '',
    };
    return gt.header.map((h) => (h in v ? v[h] : ''));
  });
}

export class MissingColumnError extends Error {
  constructor(public tab: string, public columns: string[]) {
    super(`${tab} is missing ${columns.join(', ')}`);
  }
}

export async function appendGoals(c: SheetsClient, gt: GoalsTab, goals: Goal[]): Promise<void> {
  if (!goals.length) return;
  // A recurring goal needs its repeat columns, or it would be saved as a one-off.
  const need = goals.some((g) => g.everyYears) ? ['repeat_every_years', 'repeat_until_year'].filter((h) => !gt.header.includes(h)) : [];
  if (need.length) throw new MissingColumnError('Goals', need);
  await c.append(a1('Goals', 'A1'), goalRows(gt, goals));
}

export interface NewDeposit {
  /** YYYY-MM-DD */
  date: string;
  amount: number;
  notes: string;
}

/** The new Deposits row, in the tab's own column order. */
export function depositRow(header: string[], existing: Deposit[], h: Holding, d: NewDeposit): Cell[] {
  const v: Record<string, Cell> = {
    deposit_id: nextDepositId(existing.map((x) => x.id)),
    holding_id: h.id ?? '',
    date: d.date,
    amount: d.amount,
    currency: h.info?.currency ?? 'ILS',
    notes: d.notes,
    holding_name: h.name,
  };
  return header.map((k) => (k in v ? v[k] : ''));
}

/**
 * Records a deposit: a new row in the Deposits tab and, if asked, the amount
 * added to the holding's current_amount (the deposited total and first/last
 * deposit dates in Holdings are usually formulas over the Deposits tab).
 */
export async function saveDeposit(c: SheetsClient, data: SheetData, h: Holding, d: NewDeposit, addToValue: boolean): Promise<void> {
  if (!data.deposits) throw new MissingColumnError('Deposits', ['holding_id', 'date', 'amount']);
  const need = ['holding_id', 'date', 'amount'].filter((k) => !data.headers.deposits.includes(k));
  if (need.length) throw new MissingColumnError('Deposits', need);
  await c.append(a1('Deposits', 'A1'), [depositRow(data.headers.deposits, data.deposits, h, d)]);
  if (addToValue && h.row && h.info) {
    const ci = data.headers.holdings.indexOf('current_amount');
    if (ci < 0) throw new MissingColumnError('Holdings', ['current_amount']);
    await c.update(a1('Holdings', columnLetter(ci) + h.row), [[Math.round((h.info.amount + d.amount) * 100) / 100]]);
  }
}
