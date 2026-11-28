import { describe, expect, it } from 'vitest';
import { changedFields, draftOf, planGoals, type GoalDraft } from '../src/sheets/goals';
import type { GoalsTab } from '../src/model/parse';
import type { Goal } from '../src/model/types';

const header = ['id', 'name', 'target_amount_ILS', 'target_year', 'target_month', 'priority', 'notes', 'spend_when_due', 'type'];
const g = (o: Partial<Goal>): Goal => ({ name: 'Car', amount: 100000, year: 2030, month: 1, spend: true, retirement: false, ...o });
const gt: GoalsTab = { goals: [], reserve: 0, reserveRow: 0, header, ids: ['G1', 'G2', 'R1'] };

describe('goals review plan', () => {
  it('writes only the changed cells of an existing goal', () => {
    const d = { ...draftOf(g({ id: 'G1', row: 2 })), amount: 120000, month: 6 };
    expect(changedFields(d)).toEqual(['amount', 'month']);
    const p = planGoals(gt, [d]);
    expect(p.header).toEqual([]);
    expect(p.cells).toEqual([{ range: "'Goals'!C2", values: [[120000]] }, { range: "'Goals'!E2", values: [[6]] }]);
    expect(p.append).toEqual([]);
  });

  it('adds missing columns at the end of the header for a Hebrew name and a description', () => {
    const d = { ...draftOf(g({ id: 'G1', row: 2 })), nameHe: 'רכב', description: 'Second car' };
    const p = planGoals(gt, [d]);
    expect(p.header).toEqual([{ range: "'Goals'!J1", values: [['name_he']] }, { range: "'Goals'!K1", values: [['description']] }]);
    expect(p.cells).toEqual([{ range: "'Goals'!J2", values: [['רכב']] }, { range: "'Goals'!K2", values: [['Second car']] }]);
  });

  it('clears a removed goal row but never a formula cell', () => {
    const d: GoalDraft = { ...draftOf(g({ id: 'G2', row: 3 })), remove: true };
    const p = planGoals(gt, [d], { 3: ['G2', 'Car', '=B1*2', 2030] });
    expect(p.cells.map((c) => c.range)).toEqual(["'Goals'!A3", "'Goals'!B3", "'Goals'!D3"]);
    expect(p.cells.every((c) => c.values[0][0] === '')).toBe(true);
  });

  it('appends new goals with the next ids; a removed new goal is dropped', () => {
    const base = draftOf(g({}));
    const a: GoalDraft = { ...base, orig: undefined, name: 'Boat', amount: 50000, year: 2031, month: 4 };
    const b: GoalDraft = { ...base, orig: undefined, name: 'Gone', remove: true };
    const p = planGoals(gt, [a, b]);
    expect(p.append).toEqual([['G3', 'Boat', 50000, 2031, 4, 4, 'Added in app', 1, '']]);
  });

  it('a "=" typed in a text field is kept as text', () => {
    const d = { ...draftOf(g({ id: 'G1', row: 2 })), name: '=HACK()' };
    expect(planGoals(gt, [d]).cells[0].values[0][0]).toBe("'=HACK()");
  });
});
