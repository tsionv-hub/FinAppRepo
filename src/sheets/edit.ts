// Editing the sheet from the app (SPEC 12.19): add, change and remove rows,
// field by field, by column name. Cells that hold a formula are never written.

import type { Cell, Rows } from '../model/parse';
import type { Holding } from '../model/types';
import { nextId } from '../model/deposits';
import { a1, columnLetter, SheetsClient } from './api';
import { MissingColumnError, type SheetData } from './data';

export type FieldKind = 'text' | 'num' | 'type' | 'group' | 'currency' | 'tax' | 'bool';
export interface Field {
  key: string;
  kind: FieldKind;
  /** Shown first; the rest sit under "More fields". */
  main?: boolean;
  required?: boolean;
}

export const HOLDING_TYPES = ['Study fund', 'Investment fund', 'Savings plan', 'Brokerage', 'Cash', 'Stocks', 'Stocks (unvested)'];

export const HOLDING_FIELDS: Field[] = [
  { key: 'name', kind: 'text', main: true, required: true },
  { key: 'type', kind: 'type', main: true, required: true },
  { key: 'current_amount', kind: 'num', main: true, required: true },
  { key: 'currency', kind: 'currency', main: true },
  { key: 'owner', kind: 'text', main: true },
  { key: 'vendor', kind: 'text', main: true },
  { key: 'fund_number', kind: 'text' },
  { key: 'return_5y_avg_pct', kind: 'num' },
  { key: 'management_fee_pct', kind: 'num' },
  { key: 'expected_yearly_cost', kind: 'text' },
  { key: 'deposited_amount', kind: 'num' },
  { key: 'tax_type', kind: 'tax' },
  { key: 'include_in_total', kind: 'bool' },
  { key: 'group', kind: 'group' },
  { key: 'short_name', kind: 'text' },
  { key: 'investment_track', kind: 'text' },
  { key: 'investment_style', kind: 'text' },
  { key: 'deposit_fee_pct', kind: 'num' },
  { key: 'ticker', kind: 'text' },
  { key: 'quantity', kind: 'num' },
  { key: 'notes', kind: 'text' },
];

/** The tax type a new holding of this type usually has. */
export function defaultTax(type: string): string {
  if (type === 'Study fund' || type === 'Cash') return 'none';
  if (type === 'Stocks' || type === 'Stocks (unvested)') return 'income';
  return 'capital_gain';
}

export const isFormula = (v: Cell) => typeof v === 'string' && v.trim().startsWith('=');

/** A form value as a sheet cell. Text starting with "=" is kept as text, not run as a formula. */
export function toCell(kind: FieldKind, v: string): Cell {
  const s = v.trim();
  if (kind === 'num') {
    if (s === '') return '';
    const n = parseFloat(s.replace(/,/g, ''));
    return Number.isFinite(n) ? n : '';
  }
  if (kind === 'bool') return s === '1' || s === 'true' ? 1 : 0;
  return /^[=+]/.test(s) ? "'" + s : s;
}

/** A formula copied from one row to another: same-row references move with it ($-anchored ones stay). */
export function moveFormula(f: string, from: number, to: number): string {
  return f.replace(new RegExp(`(^|[^A-Za-z$0-9_])(\\$?[A-Z]{1,3})${from}(?![0-9])`, 'g'), (_m, pre: string, col: string) => `${pre}${col}${to}`);
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Range covering one whole row of the tab. */
const rowRange = (tab: string, header: string[], row: number) => a1(tab, `A${row}:${columnLetter(Math.max(0, header.length - 1))}${row}`);

/** Which columns of this holding's row are formulas (those can't be edited from the app). */
export async function formulaKeys(c: SheetsClient, data: SheetData, row: number): Promise<Set<string>> {
  const f = await c.rowFormulas(rowRange('Holdings', data.headers.holdings, row));
  const out = new Set<string>();
  data.headers.holdings.forEach((k, i) => isFormula(f[i]) && out.add(k));
  return out;
}

/**
 * The cells to write for a holding. Pure: `formulas` is the target row as typed,
 * `template` the last holding's row (for a new row: its formulas are copied down
 * into empty cells, so the sheet's own calculated columns keep working).
 */
export function holdingWrites(
  header: string[],
  values: Record<string, string>,
  row: number,
  formulas: Rows[number],
  opts: { newId?: string; template?: Rows[number]; templateRow?: number; stamp?: boolean } = {},
): { range: string; values: Rows }[] {
  const out: { range: string; values: Rows }[] = [];
  const kinds = new Map(HOLDING_FIELDS.map((f) => [f.key, f.kind]));
  header.forEach((key, i) => {
    if (!key || isFormula(formulas[i])) return;
    const at = a1('Holdings', columnLetter(i) + row);
    let v: Cell | undefined;
    if (key === 'id' && opts.newId) v = opts.newId;
    else if (key in values) v = toCell(kinds.get(key) ?? 'text', values[key]);
    else if (key === 'last_updated' && opts.stamp) v = today();
    else if (opts.template && opts.templateRow && isFormula(opts.template[i]) && (formulas[i] == null || formulas[i] === '')) {
      v = moveFormula(String(opts.template[i]), opts.templateRow, row);
    }
    if (v !== undefined) out.push({ range: at, values: [[v]] });
  });
  return out;
}

/** Saves an edited holding (only the cells shown in the form; formula cells are skipped). */
export async function saveHolding(c: SheetsClient, data: SheetData, h: Holding, values: Record<string, string>): Promise<void> {
  if (!h.row) throw new Error('holding has no row');
  const f = await c.rowFormulas(rowRange('Holdings', data.headers.holdings, h.row));
  const changedValue = 'current_amount' in values && Number(values.current_amount) !== h.info?.amount;
  await c.batchUpdate(holdingWrites(data.headers.holdings, values, h.row, f, { stamp: changedValue }));
}

/**
 * Adds a holding in the first free row after the last one (rows below often already
 * hold the sheet's own formulas, which are kept), with the next "H<n>" id.
 */
export async function addHolding(c: SheetsClient, data: SheetData, values: Record<string, string>): Promise<string> {
  const header = data.headers.holdings;
  const idCol = header.indexOf('id');
  const need = ['id', 'name', 'type', 'current_amount'].filter((k) => !header.includes(k));
  if (need.length) throw new MissingColumnError('Holdings', need);
  const real = data.holdings.filter((h) => !h.synthetic && h.row);
  const last = Math.max(1, ...real.map((h) => h.row!));
  const row = last + 1;
  const newId = nextId('H', real.map((h) => h.id ?? ''));
  const [target, template] = await Promise.all([
    c.rowFormulas(rowRange('Holdings', header, row)),
    last > 1 ? c.rowFormulas(rowRange('Holdings', header, last)) : Promise.resolve([] as Rows[number]),
  ]);
  const v = { ...values };
  if (!v.tax_type && header.includes('tax_type')) v.tax_type = defaultTax(v.type);
  if (target[idCol] != null && target[idCol] !== '') {
    // The next row is taken (should not happen): add at the end of the table instead.
    const kinds = new Map(HOLDING_FIELDS.map((x) => [x.key, x.kind]));
    await c.append(a1('Holdings', 'A1'), [header.map((k) => (k === 'id' ? newId : k in v ? toCell(kinds.get(k) ?? 'text', v[k]) : ''))]);
    return newId;
  }
  await c.batchUpdate(holdingWrites(header, v, row, target, { newId, template, templateRow: last, stamp: true }));
  return newId;
}

/** Removes a holding: clears its typed cells (formulas and the row itself stay, so nothing else in the sheet breaks). */
export async function removeHolding(c: SheetsClient, data: SheetData, h: Holding): Promise<void> {
  if (!h.row) return;
  const header = data.headers.holdings;
  const f = await c.rowFormulas(rowRange('Holdings', header, h.row));
  await c.batchUpdate(
    header
      .map((_k, i) => i)
      .filter((i) => f[i] != null && f[i] !== '' && !isFormula(f[i]))
      .map((i) => ({ range: a1('Holdings', columnLetter(i) + h.row), values: [['']] })),
  );
}
