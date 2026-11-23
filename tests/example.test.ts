import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exampleRows, exampleXlsx } from '../src/example';
import { buildParams, defaultWhatIf, freeMoney, resolveGoals, retirementYear, simulate } from '../src/model';
import { fromRows } from '../src/sheets/data';

const START = { year: 2026, month0: 10 };

function run(scenario: 'mod' | 'pes') {
  const rows = exampleRows();
  const { data, check } = fromRows('Example', Object.keys(rows), rows, START);
  expect(check.ok).toBe(true);
  const d = data!;
  const w = { ...defaultWhatIf(d.settings, d.goals.reserve), scenario };
  const goals = resolveGoals(d.goals.goals, { birthYear: d.settings.birthYear, retirementAge: w.retirementAge, pensionStartAge: d.settings.pensionStartAge, allowance: w.allowance }, START);
  const p = buildParams(d.settings, w, START, retirementYear(goals));
  return { d, sim: simulate(d.holdings, goals, p), fm: freeMoney(d.holdings, goals, p) };
}

describe('example household', () => {
  it('passes the sheet check and covers every holding type, a pension and the special goals', () => {
    const { d } = run('mod');
    expect(new Set(d.holdings.map((h) => h.type))).toEqual(new Set(['Study fund', 'Investment fund', 'Savings plan', 'Brokerage', 'Cash', 'Stocks', 'Stocks (unvested)', 'Stock reinvestment']));
    expect(d.pension.length).toBeGreaterThan(0);
    expect(d.goals.reserve).toBeGreaterThan(0);
    expect(d.goals.goals.some((g) => g.retirement)).toBe(true);
  });

  it('tells a story: Moderate is funded but limited by early retirement; Pessimistic is short', () => {
    const mod = run('mod');
    expect(mod.sim.res.every((z) => z.ok)).toBe(true);
    expect(mod.fm.free).toBeGreaterThan(0);
    expect(mod.fm.note).toMatchObject({ kind: 'limited', goal: { retirement: true } });
    const pes = run('pes');
    expect(pes.sim.res.find((z) => z.g.retirement)!.ok).toBe(false);
    expect(pes.fm.note.kind).toBe('saveMore');
  });

  it('downloads as a valid workbook', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'ex-')), 'e.xlsx');
    writeFileSync(f, exampleXlsx());
    try {
      execFileSync('python3', ['-I', '-c', 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None', f]);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  });
});
