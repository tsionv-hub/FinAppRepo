// Acceptance checks from SPEC.md section 10, on the fictional fixture.
import { describe, expect, it } from 'vitest';
import {
  buildParams, defaultWhatIf, freeAt, freeMoney, goalOrder, parseGoals, parseHoldings, parseSettings, resolveGoals,
  retirementYear, simEndYear, simulate, taxOf, today, type Goal, type Snapshot, type WhatIf,
} from '../src/model';
import { goalsRows, holdingsRows, settingsRows } from './fixture';

const START = { year: 2026, month0: 10 };
const S = parseSettings(settingsRows);
const H = parseHoldings(holdingsRows, S.fx);
const GT = parseGoals(goalsRows, START.year);

function setup(over: Partial<WhatIf> = {}, goals: Goal[] = GT.goals) {
  const w = { ...defaultWhatIf(S, GT.reserve), ...over };
  const gs = resolveGoals(goals, { birthYear: S.birthYear, retirementAge: w.retirementAge, pensionStartAge: S.pensionStartAge, allowance: w.allowance }, START);
  return { w, goals: gs, p: buildParams(S, w, START, retirementYear(gs)) };
}
const normal = (name: string, amount: number, year: number, month = 1): Goal => ({ name, amount, year, month, spend: true, retirement: false });

describe('values and tax (5.1)', () => {
  it('post-tax total matches a hand calculation', () => {
    const { p } = setup({ incomeTaxPct: 47, capitalGainsTaxPct: 25 });
    // Study 210000 (none) + Invest 320000 (gain 70000) + Broker 60000 USD×3.7 = 222000 (gain 74000)
    // + Savings 90000 (no gain) + Cash 80000 + Intel vested 111000 (income) + unvested 185000 (income).
    const pre = 210000 + 320000 + 222000 + 90000 + 80000 + 111000 + 185000;
    const tax = 70000 * 0.25 + 74000 * 0.25 + (111000 + 185000) * 0.47;
    const t = today(H, p);
    expect(t.preTax).toBeCloseTo(pre, 6);
    expect(t.postTax).toBeCloseTo(pre - tax, 6);
  });

  it('changing income tax changes only income-taxed rows; study funds never show tax', () => {
    for (const h of H) {
      const a = taxOf(h, h.value, h.deposited, 0.25, 0.3);
      const b = taxOf(h, h.value, h.deposited, 0.25, 0.6);
      if (h.tax === 'income') expect(b).toBeGreaterThan(a);
      else expect(b).toBe(a);
      if (h.type === 'Study fund') expect(a).toBe(0);
    }
  });

  it('pension is never in totals; the unvested toggle never makes unvested liquid', () => {
    const withPension = [...H, { ...H[0], type: 'Pension', value: 9e6, deposited: 9e6 }];
    const { p } = setup();
    expect(today(withPension, p).preTax).toBe(today(H, p).preTax);
    const on = today(H, { ...p, countUnvested: true });
    const off = today(H, { ...p, countUnvested: false });
    expect(on.preTax - off.preTax).toBeCloseTo(185000);
    expect(on.liquidPostTax).toBe(off.liquidPostTax);
  });
});

describe('horizon (5.2)', () => {
  it('is the latest of 2036, the last goal year and the retirement end year', () => {
    expect(simEndYear(START, [])).toBe(2036);
    expect(simEndYear(START, [normal('x', 1, 2040)])).toBe(2040);
    expect(simEndYear(START, setup().goals)).toBe(1980 + 67 - 1);
  });
});

describe('free money (5.11, section 10)', () => {
  it('with goals small relative to saving, equals liquid post-tax minus the rainy day fund', () => {
    const { p, goals } = setup({}, [normal('Small', 1000, 2030)]);
    const fm = freeMoney(H, goals, p);
    expect(fm.free).toBeCloseTo(today(H, p).liquidPostTax - p.reserve, 6);
  });

  it('raising a goal never increases free money', () => {
    let prev = Infinity;
    for (const amt of [0, 2e5, 5e5, 8e5, 1.2e6, 2e6, 5e6]) {
      const { p, goals } = setup({ retirementAge: null }, [normal('Car', 150000, 2028, 6), normal('House', amt, 2031, 3)]);
      const f = freeMoney(H, goals, p).free;
      expect(f).toBeLessThanOrEqual(prev + 1);
      prev = f;
    }
  });

  it('adding saving never decreases free money', () => {
    let prev = -Infinity;
    for (const ms of [0, 2000, 6000, 12000, 30000]) {
      const { p, goals } = setup({ monthlySaving: ms });
      const f = freeMoney(H, goals, p).free;
      expect(f).toBeGreaterThanOrEqual(prev - 1);
      prev = f;
    }
  });

  it('after the last goal and full vesting: post-tax − rainy day fund − unvested post-tax', () => {
    // No retirement row and no new grants, so everything has vested by 2031.
    const { p, goals } = setup({ yearlyGrantUSD: 0, inflationOn: true, inflationRatePct: 3 }, [normal('Car', 150000, 2028, 6)]);
    const snaps: Snapshot[] = [];
    const r = simulate(H, goals, p, { snaps });
    const k = 70; // Sep 2032: after the car and after the last tranche
    const s = snaps[k];
    const infl = Math.pow(1.03, k / 12);
    const unvestedPost = s.S.filter((x) => x.h.type === 'Stocks (unvested)').reduce((a, x) => a + x.b - taxOf(x.h, x.b, x.d, p.cgTax, p.incomeTax), 0) / infl;
    expect(unvestedPost).toBeCloseTo(0, 6);
    const expected = r.pts[k][2] - p.reserve - unvestedPost;
    expect(freeAt(s, p, goals.slice().sort(goalOrder), r.end)).toBeCloseTo(expected, 4);
  });
});

describe('scenario (5.3)', () => {
  it('Pessimistic ≤ Moderate ≤ Optimistic total at every future date', () => {
    const run = (sc: 'opt' | 'mod' | 'pes') => {
      const { p, goals } = setup({ scenario: sc });
      return simulate(H, goals, p).pts;
    };
    const [o, m, pe] = [run('opt'), run('mod'), run('pes')];
    o.forEach((x, i) => {
      expect(pe[i][1]).toBeLessThanOrEqual(m[i][1] + 1e-6);
      expect(m[i][1]).toBeLessThanOrEqual(x[1] + 1e-6);
    });
  });
});

describe('retirement (5.8)', () => {
  it('a too-high allowance shows Short with a total', () => {
    const { p, goals } = setup({ allowance: 200000 });
    const r = simulate(H, goals, p).res.find((x) => x.g.retirement)!;
    expect(r.ok).toBe(false);
    expect(r.short).toBeGreaterThan(0);
    expect(r.short).toBeLessThanOrEqual(r.g.amount);
  });
});
