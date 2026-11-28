// Goals review (SPEC v1.27): change, remove and add goals in one go, then write
// only what changed. Cells are found by column name; formula cells are never written.

import type { Cell, Rows } from '../model/parse';
import type { Goal } from '../model/types';
import { a1, columnLetter, SheetsClient } from './api';
import type { GoalsTab } from '../model/parse';
import { nextIds } from './data';
import { isFormula } from './edit';

/** A goal as edited in the review. `orig` is the goal it started from (none = new). */
export interface GoalDraft {
  orig?: Goal;
  name: string;
  nameHe: string;
  amount: number;
  year: number;
  month: number;
  spend: boolean;
  everyYears: number;
  untilYear: number | null;
  description: string;
  remove: boolean;
}

export function draftOf(g: Goal): GoalDraft {
  return {
    orig: g,
    name: g.name,
    nameHe: g.nameHe ?? '',
    amount: g.amount,
    year: g.year,
    month: g.month || 1,
    spend: g.spend,
    everyYears: g.everyYears ?? 0,
    untilYear: g.everyYears ? (g.untilYear ?? null) : null,
    description: g.description ?? '',
    remove: false,
  };
}

/** Each draft field's column in the Goals tab. */
const COLS: [keyof GoalDraft, string][] = [
  ['name', 'name'], ['nameHe', 'name_he'], ['amount', 'target_amount_ILS'], ['year', 'target_year'], ['month', 'target_month'],
  ['spend', 'spend_when_due'], ['everyYears', 'repeat_every_years'], ['untilYear', 'repeat_until_year'], ['description', 'description'],
];

function cell(d: GoalDraft, k: keyof GoalDraft): Cell {
  const v = d[k];
  if (k === 'spend') return v ? 1 : 0;
  if (k === 'everyYears') return d.everyYears > 0 ? d.everyYears : '';
  if (k === 'untilYear') return d.everyYears > 0 && d.untilYear ? d.untilYear : '';
  if (typeof v === 'string') return /^[=+]/.test(v.trim()) ? "'" + v.trim() : v.trim();
  return v as Cell;
}

/** Fields whose value differs from the goal it started from (all of them for a new goal). */
export function changedFields(d: GoalDraft): (keyof GoalDraft)[] {
  if (!d.orig) return COLS.map(([k]) => k);
  const o = draftOf(d.orig);
  return COLS.map(([k]) => k).filter((k) => String(cell(d, k)) !== String(cell(o, k)));
}

export interface GoalPlan {
  /** Header cells for columns the tab doesn't have yet (name_he, description, repeat_*). */
  header: { range: string; values: Rows }[];
  /** Changed cells of existing goals, and cleared cells of removed ones. */
  cells: { range: string; values: Rows }[];
  /** New goals, in the (extended) column order. */
  append: Rows;
  /** The header after adding columns. */
  columns: string[];
}

/**
 * What to write for a reviewed list of goals. Pure. `formulas[row]` is that goal row as typed
 * (formula cells are skipped when changing or clearing it).
 */
export function planGoals(gt: GoalsTab, drafts: GoalDraft[], formulas: Record<number, Rows[number]> = {}): GoalPlan {
  const columns = [...gt.header];
  const header: GoalPlan['header'] = [];
  const need = (col: string) => {
    if (columns.includes(col)) return;
    header.push({ range: a1('Goals', columnLetter(columns.length) + 1), values: [[col]] });
    columns.push(col);
  };
  const live = drafts.filter((d) => !(d.remove && !d.orig?.row));
  for (const d of live) {
    if (d.remove) continue;
    const ch = changedFields(d);
    if (d.nameHe.trim() && ch.includes('nameHe')) need('name_he');
    if (d.description.trim() && ch.includes('description')) need('description');
    if (d.everyYears > 0 && (ch.includes('everyYears') || ch.includes('untilYear'))) {
      need('repeat_every_years');
      need('repeat_until_year');
    }
  }
  const cells: GoalPlan['cells'] = [];
  const col = (name: string) => columns.indexOf(name);
  for (const d of live) {
    if (!d.orig?.row) continue;
    const row = d.orig.row;
    const f = formulas[row] ?? [];
    if (d.remove) {
      gt.header.forEach((_h, i) => {
        if (f[i] != null && f[i] !== '' && !isFormula(f[i])) cells.push({ range: a1('Goals', columnLetter(i) + row), values: [['']] });
      });
      continue;
    }
    for (const k of changedFields(d)) {
      const name = COLS.find(([x]) => x === k)![1];
      const i = col(name);
      if (i < 0 || isFormula(f[i])) continue;
      const v = cell(d, k);
      // A blank optional field on a column the sheet doesn't have needs no write.
      if (i >= gt.header.length && (v === '' || v == null)) continue;
      cells.push({ range: a1('Goals', columnLetter(i) + row), values: [[v]] });
    }
  }
  const fresh = live.filter((d) => !d.remove && (!d.orig || !d.orig.row));
  const ids = nextIds(gt.ids, fresh.length);
  const append = fresh.map((d, n) => {
    const v: Record<string, Cell> = {
      id: ids[n], priority: gt.ids.length + n + 1, notes: 'Added in app', type: '',
    };
    for (const [k, name] of COLS) v[name] = cell(d, k);
    return columns.map((h) => (h in v ? v[h] : ''));
  });
  return { header, cells, append, columns };
}

/** True when the review changes anything. */
export const hasChanges = (p: GoalPlan) => p.cells.length + p.append.length > 0;

/** Writes the reviewed goals: new header cells and changed cells in one request, then the new rows. */
export async function saveGoalsReview(c: SheetsClient, gt: GoalsTab, drafts: GoalDraft[]): Promise<void> {
  const rows = [...new Set(drafts.filter((d) => d.orig?.row).map((d) => d.orig!.row!))];
  const formulas: Record<number, Rows[number]> = {};
  const last = columnLetter(Math.max(0, gt.header.length - 1));
  // Changing or clearing a row must never overwrite a formula in it.
  await Promise.all(rows.map(async (r) => (formulas[r] = await c.rowFormulas(a1('Goals', `A${r}:${last}${r}`)))));
  const p = planGoals(gt, drafts, formulas);
  await c.batchUpdate([...p.header, ...p.cells]);
  if (p.append.length) await c.append(a1('Goals', 'A1'), p.append);
}
