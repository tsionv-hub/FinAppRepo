import { describe, expect, it } from 'vitest';
import {
  buildParams, defaultWhatIf, goalStep, initialSlots, liquidPostTax, monthAt, parseGoals, parseHoldings,
  parsePension, parseSettings, pensionTax, projectPension, resolveGoals, retirementYear, run, simulate,
  stepOf, taxOf, today, type Goal, type Holding, type Params,
} from '../src/model';
import { goalsRows, holdingsRows, pensionRows, settingsRows } from './fixture';

const START = { year: 2026, month0: 10 }; // 1 Nov 2026

function holding(o: Partial<Holding>): Holding {
  return { name: 'x', vendor: '', owner: '', type: 'Cash', ret: 0, tax: 'none', include: true, value: 0, deposited: 0, ...o };
}
function params(o: Partial<Params> = {}): Params {
  return {
    start: START, returnFactor: 1, cgTax: 0.25, incomeTax: 0.5, monthlySaving: 0, yearlyFreeCash: 0, yearlyGrant: 0,
    inflationOn: false, inflationRate: 0, reserve: 0, stopYear: null, vestEveryMonths: 6, vestTranches: 8, countUnvested: true, ...o,
  };
}
const reinvest = () => holding({ name: 'Stock reinvestment', type: 'Stock reinvestment', synthetic: true, tax: 'capital_gain' });

describe('calendar', () => {
  it('maps steps to months across years', () => {
    expect(monthAt(START, 0)).toEqual({ year: 2026, month0: 10 });
    expect(monthAt(START, 2)).toEqual({ year: 2027, month0: 0 });
    expect(stepOf(START, 2027, 0)).toBe(2);
  });
});

describe('parsing', () => {
  it('reads columns by name, in any order', () => {
    const rows = holdingsRows.map((r) => r.slice().reverse());
    const a = parseHoldings(holdingsRows, { ILS: 1, USD: 3.7, EUR: 4 });
    const b = parseHoldings(rows, { ILS: 1, USD: 3.7, EUR: 4 });
    expect(b).toEqual(a);
  });

  it('converts currencies, defaults blank return to 0 and blank basis to value', () => {
    const s = parseSettings(settingsRows);
    const H = parseHoldings(holdingsRows, s.fx);
    const broker = H.find((h) => h.name === 'Broker C')!;
    expect(broker.value).toBeCloseTo(60000 * 3.7);
    expect(broker.deposited).toBeCloseTo(40000 * 3.7);
    const cash = H.find((h) => h.name === 'Checking')!;
    expect(cash.ret).toBe(0);
    expect(cash.deposited).toBe(cash.value);
    expect(H.find((h) => h.name === 'Old account')!.include).toBe(false);
  });

  it('adds Stock reinvestment with the value-weighted return of investment holdings', () => {
    const H = parseHoldings(holdingsRows, { ILS: 1, USD: 3.7, EUR: 4 });
    const rv = H[H.length - 1];
    expect(rv.synthetic).toBe(true);
    const w = 210000 + 320000 + 60000 * 3.7 + 90000;
    const wr = 210000 * 7.5 + 320000 * 8 + 60000 * 3.7 * 10 + 90000 * 5;
    // "Old account" is a Brokerage too; it counts toward the weighting even though excluded from totals (as in the prototype).
    expect(rv.ret).toBeCloseTo((wr + 5000 * 4 * 4) / (w + 5000 * 4));
  });

  it('reads goals: reserve rows, default month, old goals dropped', () => {
    const g = parseGoals(goalsRows, 2026);
    expect(g.reserve).toBe(120000);
    expect(g.reserveRow).toBe(2);
    expect(g.goals.map((x) => x.name)).toEqual(['Early retirement', 'Car', "Alex's wedding", 'Apartment']);
    expect(g.goals.find((x) => x.name === "Alex's wedding")!.month).toBe(1);
    expect(g.goals.find((x) => x.name === 'Apartment')!.spend).toBe(false);
  });

  it('reads settings with defaults', () => {
    const s = parseSettings([['vest', '']]);
    expect(s.returnFactors).toEqual({ opt: 1, mod: 0.75, pes: 0.5 });
    expect(s.vestYears).toBe(4);
    expect(s.vestEveryMonths).toBe(6);
    expect(s.pensionStartAge).toBe(67);
    expect(s.birthYear).toBeNull();
  });
});

describe('tax', () => {
  it('capital gain on growth only, income on the whole amount', () => {
    expect(taxOf(holding({ tax: 'capital_gain' }), 150, 100, 0.25, 0.5)).toBe(12.5);
    expect(taxOf(holding({ tax: 'capital_gain' }), 90, 100, 0.25, 0.5)).toBe(0);
    expect(taxOf(holding({ tax: 'income' }), 100, 0, 0.25, 0.5)).toBe(50);
    expect(taxOf(holding({ tax: 'none' }), 100, 0, 0.25, 0.5)).toBe(0);
  });
});

describe('goals', () => {
  const g = (o: Partial<Goal>): Goal => ({ name: 'g', amount: 100, year: 2028, month: 1, spend: true, retirement: false, ...o });

  it('are paid at the step before the 1st of their month (default January)', () => {
    expect(goalStep(START, g({ year: 2028, month: 6 }))).toBe(stepOf(START, 2028, 5) - 1);
    expect(goalStep(START, g({ year: 2028, month: 0 }))).toBe(stepOf(START, 2028, 0) - 1);
    expect(goalStep(START, g({ year: 2026, month: 11 }))).toBe(1);
  });

  it('never use the rainy day fund', () => {
    const H = [holding({ value: 1000, deposited: 1000 })];
    const r = simulate(H, [g({ amount: 800, year: 2027, month: 3 })], params({ reserve: 300 }));
    expect(r.res[0].ok).toBe(false);
    expect(r.res[0].short).toBeCloseTo(100);
    expect(r.res[0].have).toBeCloseTo(700);
  });

  it('are withdrawn when spend is on and kept when off', () => {
    const H = [holding({ value: 1000, deposited: 1000 })];
    const spent = simulate(H, [g({ amount: 400, year: 2027, month: 3 })], params());
    const kept = simulate(H, [g({ amount: 400, year: 2027, month: 3, spend: false })], params());
    expect(spent.pts[spent.pts.length - 1][1]).toBeCloseTo(600);
    expect(kept.pts[kept.pts.length - 1][1]).toBeCloseTo(1000);
  });
});

describe('Intel stock', () => {
  it('sells vested shares in the first month, net of income tax, into Stock reinvestment', () => {
    const H = [holding({ type: 'Stocks', tax: 'income', value: 1000, deposited: 0 }), reinvest()];
    const p = params();
    const S = initialSlots(H, p);
    run(S, 0, p, 0, [], 2026);
    expect(S[0].b).toBe(0);
    expect(S[1].b).toBeCloseTo(500);
    expect(S[1].d).toBeCloseTo(500);
  });

  it('vests unvested shares in tranches every N months; unvested is never liquid', () => {
    const H = [holding({ type: 'Stocks (unvested)', tax: 'income', value: 800, deposited: 0 }), reinvest()];
    const p = params({ vestEveryMonths: 6, vestTranches: 4 });
    const S = initialSlots(H, p);
    expect(liquidPostTax(S, p)).toBe(0);
    run(S, 0, p, 0, [], 2027); // to Dec 2027 = step 13: tranches at 6 and 12
    expect(S[0].b).toBeCloseTo(400);
    expect(S[1].b).toBeCloseTo(200);
  });

  it('adds each yearly grant as a new lot in January, until retirement', () => {
    const H = [holding({ type: 'Stocks (unvested)', tax: 'income', value: 0 }), reinvest()];
    const p = params({ yearlyGrant: 1000, stopYear: 2028 });
    const S = initialSlots(H, p);
    run(S, 0, p, 0, [], 2029);
    expect(S[0].lots!.length).toBe(2); // the initial lot plus Jan 2027; none from the retirement year (2028)
  });
});

describe('retirement', () => {
  it('derives the retirement goal from birth year, retirement age and pension age', () => {
    const r = resolveGoals([{ name: 'Early retirement', amount: 0, year: 0, month: 1, spend: true, retirement: true }],
      { birthYear: 1980, retirementAge: 55, pensionStartAge: 67, allowance: 10000 }, START);
    expect(r[0]).toMatchObject({ year: 2035, endYear: 2046, monthly: 10000, amount: 10000 * 12 * 12 });
    expect(resolveGoals(r, { birthYear: null, retirementAge: 55, pensionStartAge: 67, allowance: 1 }, START)).toEqual([]);
  });

  it('withdraws the allowance monthly and stops yearly free cash', () => {
    const goal: Goal = { name: 'r', amount: 12 * 100, year: 2028, endYear: 2028, monthly: 100, month: 1, spend: true, retirement: true };
    const H = [holding({ value: 10000, deposited: 10000, tax: 'capital_gain' })];
    const r = simulate(H, [goal], params({ yearlyFreeCash: 5000, stopYear: 2028 }));
    // Jan 2027 adds 5000; Jan 2028 does not; 2028 takes 12 x 100.
    expect(r.pts[r.pts.length - 1][1]).toBeCloseTo(15000 - 1200);
    expect(r.res[0]).toMatchObject({ ok: true, k: stepOf(START, 2028, 0) });
  });
});

describe('totals', () => {
  it('exclude pension and excluded rows; unvested is optional', () => {
    const H = [
      holding({ value: 100, deposited: 100 }),
      holding({ type: 'Pension', value: 1e6 }),
      holding({ type: 'Stocks (unvested)', tax: 'income', value: 50 }),
      holding({ value: 999, include: false }),
    ];
    expect(today(H, params()).preTax).toBe(150);
    expect(today(H, params({ countUnvested: false })).preTax).toBe(100);
    expect(today(H, params()).liquidPostTax).toBe(100);
  });
});

describe('pension', () => {
  it('applies the exemption up to the ceiling', () => {
    expect(pensionTax(5000, 67, 9430, 20)).toBeCloseTo(5000 * 0.33 * 0.2);
    expect(pensionTax(20000, 67, 9430, 20)).toBeCloseTo((20000 - 9430 * 0.67) * 0.2);
  });

  it('stops deposits at early retirement for flagged funds only and splits tax per owner', () => {
    const funds = parsePension(pensionRows);
    const base = {
      start: START, birthYear: 1980, pensionStartAge: 67, depositGrowthPct: 0, exemptPct: 67, exemptCeiling: 9430,
      taxRatePct: 20, oldAgeAllowance: 0, allowance: 10000, inflationOn: false, inflationRate: 0,
    };
    const early = projectPension(funds, { ...base, retirementYear: 2035 });
    const none = projectPension(funds, { ...base, retirementYear: null });
    expect(early.funds[0].final).toBeLessThan(none.funds[0].final);
    expect(early.funds[1].final).toBeLessThan(none.funds[1].final); // blank flag = stops
    expect(early.funds[2].final).toBeCloseTo(none.funds[2].final);
    const byOwner = { P1: early.funds[0].monthly + early.funds[2].monthly, P2: early.funds[1].monthly };
    const net = Object.values(byOwner).reduce((a, m) => a + m - pensionTax(m, 67, 9430, 20), 0);
    expect(early.monthlyAfterTax).toBeCloseTo(net);
  });
});

describe('params', () => {
  it('applies the scenario factor and converts the grant', () => {
    const s = parseSettings(settingsRows);
    const w = defaultWhatIf(s, 0);
    w.scenario = 'pes';
    const p = buildParams(s, w, START, retirementYear([]));
    expect(p.returnFactor).toBe(0.5);
    expect(p.yearlyGrant).toBeCloseTo(20000 * 3.7);
    expect(p.vestTranches).toBe(8);
    expect(p.stopYear).toBeNull();
  });
});
