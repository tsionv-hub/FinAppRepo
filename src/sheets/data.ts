// Reads the whole sheet into model objects, and the three explicit writes:
// new goals, rainy day fund amount, retirement age and allowance.

import { parseGoals, parseHoldings, parsePension, parseSettings, type GoalsTab } from '../model/parse';
import type { Goal, Holding, PensionFund, Settings, StartMonth } from '../model/types';
import type { Cell, Rows } from '../model/parse';
import { a1, columnLetter, SheetsClient, SheetsError } from './api';
import { RULES, validate, type Checklist } from './validate';

export interface SheetData {
  title: string;
  settings: Settings;
  holdings: Holding[];
  pension: PensionFund[];
  goals: GoalsTab;
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
    };
    return gt.header.map((h) => (h in v ? v[h] : ''));
  });
}

export async function appendGoals(c: SheetsClient, gt: GoalsTab, goals: Goal[]): Promise<void> {
  if (!goals.length) return;
  await c.append(a1('Goals', 'A1'), goalRows(gt, goals));
}
