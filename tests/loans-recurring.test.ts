// Recurring goals and loans (additions after SPEC v1).
import { describe, expect, it } from 'vitest';
import {
  expandGoals, freeAt, freeMoney, goalHorizon, goalStep, loanEndYear, loanMonths, parseGoals, parseLoans, simEndYear,
  simulate, stepOf, type Goal, type Holding, type Loan, type Params, type Snapshot,
} from '../src/model';

const START = { year: 2026, month0: 10 }; // 1 Nov 2026
const cash = (value: number): Holding => ({ name: 'Cash', vendor: '', owner: '', type: 'Cash', ret: 0, tax: 'none', include: true, value, deposited: value });
const params = (o: Partial<Params> = {}): Params => ({
  start: START, returnFactor: 1, cgTax: 0.25, incomeTax: 0.5, monthlySaving: 0, yearlyFreeCash: 0, yearlyGrant: 0, inflationOn: false,
  inflationRate: 0, reserve: 0, stopYear: null, vestEveryMonths: 6, vestTranches: 8, countUnvested: true, loans: [], ...o,
});
const goal = (o: Partial<Goal>): Goal => ({ name: 'g', amount: 100, year: 2028, month: 1, spend: true, retirement: false, ...o });
const loan = (o: Partial<Loan>): Loan => ({ name: 'L', owner: '', kind: 'installments', balance: 1200, ratePct: 0, monthlyPayment: 100, year: 0, month: 1, notes: '', ...o });
const last = (r: { pts: [number, number, number][] }) => r.pts[r.pts.length - 1][1];

describe('recurring goals', () => {
  it('expand every N years until the given year, or to the end of the projection', () => {
    const g = goal({ name: 'Car', year: 2028, everyYears: 4, untilYear: 2040 });
    expect(expandGoals([g], 2050).map((x) => x.year)).toEqual([2028, 2032, 2036, 2040]);
    expect(expandGoals([{ ...g, untilYear: undefined }], 2037).map((x) => x.year)).toEqual([2028, 2032, 2036]);
    expect(expandGoals([g], 2050).every((x) => x.series === g)).toBe(true);
  });

  it('pay every occurrence and report each one', () => {
    const g = goal({ name: 'Vacation', amount: 1000, year: 2027, month: 8, everyYears: 1, untilYear: 2030 });
    const r = simulate([cash(10000)], [g], params());
    expect(r.res.filter((z) => z.g.series === g).map((z) => [z.g.year, z.ok])).toEqual([[2027, true], [2028, true], [2029, true], [2030, true]]);
    expect(last(r)).toBeCloseTo(6000);
  });

  it('a later occurrence can be short while earlier ones are funded', () => {
    const g = goal({ amount: 4000, year: 2027, everyYears: 1, untilYear: 2029 });
    const r = simulate([cash(10000)], [g], params());
    expect(r.res.map((z) => z.ok)).toEqual([true, true, false]);
    expect(r.res[2].short).toBeCloseTo(2000);
  });

  it('keep constraining free money until their last occurrence', () => {
    expect(goalHorizon(START, goal({ everyYears: 2 }))).toBe(Infinity);
    expect(goalHorizon(START, goal({ year: 2028, everyYears: 2, untilYear: 2033 }))).toBe(goalStep(START, goal({ year: 2032 })));
    expect(simEndYear(START, [goal({ year: 2028, everyYears: 5, untilYear: 2050 })])).toBe(2050);
  });

  it('free money keeps every occurrence funded', () => {
    const g = goal({ amount: 1000, year: 2027, everyYears: 1, untilYear: 2031 });
    expect(freeMoney([cash(10000)], [g], params()).free).toBeCloseTo(5000, 0);
  });

  it('parse from the Goals tab (blank = once)', () => {
    const rows = [
      ['id', 'name', 'target_amount_ILS', 'target_year', 'target_month', 'repeat_every_years', 'repeat_until_year', 'type'],
      ['G1', 'Car', 140000, 2028, 6, 5, 2045, ''],
      ['G2', 'Trip', 20000, 2027, 8, '', '', ''],
    ];
    const g = parseGoals(rows, 2026).goals;
    expect(g[0]).toMatchObject({ everyYears: 5, untilYear: 2045 });
    expect(g[1].everyYears).toBeUndefined();
  });
});

describe('loans', () => {
  it('installments: paid monthly from liquid money until paid off', () => {
    const l = loan({ balance: 1200, monthlyPayment: 100 });
    const snaps: Snapshot[] = [];
    const r = simulate([cash(5000)], [], params({ loans: [l] }), { snaps });
    expect(last(r)).toBeCloseTo(3800);
    expect(snaps[6].D[0]).toBeCloseTo(600);
    expect(snaps[12].D[0]).toBe(0);
    const z = r.res.find((x) => x.g.loan === l)!;
    expect(z).toMatchObject({ ok: true, k: 12 });
  });

  it('installments with interest: payoff month matches loanMonths', () => {
    const l = loan({ balance: 10000, ratePct: 6, monthlyPayment: 500 });
    const snaps: Snapshot[] = [];
    simulate([cash(50000)], [], params({ loans: [l] }), { snaps });
    const m = loanMonths(l)!;
    expect(snaps[m - 1].D[0]).toBeGreaterThan(0);
    expect(snaps[m].D[0]).toBe(0);
    expect(loanMonths(loan({ balance: 10000, ratePct: 12, monthlyPayment: 50 }))).toBeNull();
    expect(loanEndYear(l, START)).toBe(2028);
  });

  it('lump sum: paid on its due date, with interest added until then', () => {
    const l = loan({ kind: 'lump_sum', balance: 1000, ratePct: 12, year: 2028, month: 3 });
    const r = simulate([cash(5000)], [], params({ loans: [l] }), {});
    const k = goalStep(START, { ...goal({}), year: 2028, month: 3 });
    expect(r.res[0]).toMatchObject({ ok: true, k });
    expect(last(r)).toBeCloseTo(5000 - 1000 * Math.pow(1.12, k / 12), 4);
  });

  it('never use the rainy day fund; short repayments are reported', () => {
    const l = loan({ balance: 1000, monthlyPayment: 100 });
    const r = simulate([cash(1000)], [], params({ loans: [l], reserve: 600 }));
    const z = r.res[0];
    expect(z.ok).toBe(false);
    expect(z.short).toBeCloseTo(600);
    expect(last(r)).toBeCloseTo(600);
  });

  it('a late installment that is caught up later is short by the most it fell behind, then paid off', () => {
    const l = loan({ balance: 1000, monthlyPayment: 200 });
    // 300 now, +100 saving a month: falls behind, then catches up.
    const r = simulate([cash(300)], [], params({ loans: [l], monthlySaving: 100 }));
    const z = r.res[0];
    expect(z.ok).toBe(false);
    expect(z.short).toBeGreaterThan(0);
    expect(z.short).toBeLessThan(1000);
    expect(z.have).toBeCloseTo(1000);
  });

  it('free money keeps loan repayments funded, and the money is shown as set aside for loans', () => {
    const l = loan({ kind: 'lump_sum', balance: 3000, year: 2030, month: 1 });
    const fm = freeMoney([cash(10000)], [], params({ loans: [l] }));
    expect(fm.free).toBeCloseTo(7000, 0);
    expect(fm.loanSetAside).toBeCloseTo(3000, 0);
  });

  it('free money later still counts what is owed then', () => {
    const l = loan({ balance: 2400, monthlyPayment: 100 });
    const p = params({ loans: [l] });
    const snaps: Snapshot[] = [];
    const r = simulate([cash(10000)], [], p, { snaps });
    // After 12 months: 8800 left, 1200 still owed.
    expect(freeAt(snaps[12], p, [], r.end)).toBeCloseTo(7600, 0);
    expect(freeAt(snaps[24], p, [], r.end)).toBeCloseTo(7600, 0);
  });

  it('parse from the Loans tab', () => {
    const rows = [
      ['id', 'name', 'owner', 'kind', 'balance_ILS', 'interest_rate_pct', 'monthly_payment_ILS', 'repay_year', 'repay_month', 'notes'],
      ['L1', 'Car loan', 'A', 'installments', '48,000', 3.5, 1500, '', '', ''],
      ['L2', 'From parents', 'B', 'Lump sum', 60000, '', '', 2029, '', 'no interest'],
      ['L3', 'Paid off', 'B', 'installments', 0, '', 100, '', '', ''],
    ];
    const L = parseLoans(rows);
    expect(L).toHaveLength(2);
    expect(L[0]).toMatchObject({ kind: 'installments', balance: 48000, ratePct: 3.5, monthlyPayment: 1500 });
    expect(L[1]).toMatchObject({ kind: 'lump_sum', balance: 60000, year: 2029, month: 1, ratePct: 0 });
    expect(stepOf(START, L[1].year, L[1].month - 1)).toBe(26);
  });
});
