// Pension projection, ported from the prototype's pensionView. Pension is never
// part of totals, goals or free money.

import { monthAt, stepOf } from './calendar';
import type { PensionFund, StartMonth } from './types';

export interface PensionInputs {
  start: StartMonth;
  birthYear: number;
  pensionStartAge: number;
  /** First year of early retirement (deposits stop for funds flagged so); null = no early retirement. */
  retirementYear: number | null;
  depositGrowthPct: number;
  exemptPct: number;
  exemptCeiling: number;
  taxRatePct: number;
  oldAgeAllowance: number;
  /** Monthly retirement allowance, for the coverage share. */
  allowance: number;
  inflationOn: boolean;
  /** Fraction, e.g. 0.03. */
  inflationRate: number;
}

export interface FundProjection {
  fund: PensionFund;
  /** Balance at each step from 0 to pension start (nominal). */
  balances: number[];
  final: number;
  monthly: number;
  deposits: number;
  fees: number;
}

export interface PensionResult {
  funds: FundProjection[];
  /** Step of January of the pension start year. */
  kEnd: number;
  today: number;
  /** All amounts below in display money (deflated when inflation is on). */
  total: number;
  monthlyPreTax: number;
  monthlyAfterTax: number;
  deposits: number;
  fees: number;
  /** Share (0-1+) of the retirement allowance covered in today's money, or null without an allowance. */
  coverage: number | null;
}

/** Monthly tax on a pension: part up to the ceiling is exempt at exemptPct. */
export function pensionTax(monthly: number, exemptPct: number, ceiling: number, taxRatePct: number): number {
  const exempt = (Math.min(monthly, ceiling) * exemptPct) / 100;
  return (Math.max(0, monthly - exempt) * taxRatePct) / 100;
}

export function projectFund(f: PensionFund, x: PensionInputs, kEnd: number): FundProjection {
  const gm = Math.pow(1 + f.returnPct / 100, 1 / 12);
  const fm = Math.pow(1 - f.accumulationFeePct / 100, 1 / 12);
  const g = x.depositGrowthPct / 100;
  const stop = x.retirementYear ?? Infinity;
  let b = f.balance;
  const balances = [b];
  let deposits = 0;
  let fees = 0;
  for (let k = 1; k <= kEnd; k++) {
    const { year } = monthAt(x.start, k);
    b *= gm;
    const fee = b * (1 - fm);
    b -= fee;
    fees += fee;
    if (f.monthlyDeposit > 0 && !(f.stopsAtEarlyRetirement && year >= stop)) {
      const d = f.monthlyDeposit * Math.pow(1 + g, (k - 1) / 12);
      b += d * (1 - f.depositFeePct / 100);
      fees += (d * f.depositFeePct) / 100;
      deposits += d;
    }
    balances.push(b);
  }
  return { fund: f, balances, final: b, monthly: b / f.coefficient, deposits, fees };
}

export function projectPension(funds: PensionFund[], x: PensionInputs): PensionResult {
  const kEnd = Math.max(0, stepOf(x.start, x.birthYear + x.pensionStartAge, 0));
  const real = Math.pow(1 + x.inflationRate, kEnd / 12);
  const inf = x.inflationOn ? real : 1;
  const proj = funds.map((f) => projectFund(f, x, kEnd));
  const byOwner = new Map<string, number>();
  for (const p of proj) byOwner.set(p.fund.owner, (byOwner.get(p.fund.owner) ?? 0) + p.monthly);
  let pre = 0;
  let net = 0;
  for (const m of byOwner.values()) {
    pre += m;
    net += m - pensionTax(m, x.exemptPct, x.exemptCeiling, x.taxRatePct);
  }
  const sum = (fn: (p: FundProjection) => number) => proj.reduce((a, p) => a + fn(p), 0);
  return {
    funds: proj,
    kEnd,
    today: funds.reduce((a, f) => a + f.balance, 0),
    total: sum((p) => p.final) / inf,
    monthlyPreTax: pre / inf,
    monthlyAfterTax: net / inf,
    deposits: sum((p) => p.deposits) / inf,
    fees: sum((p) => p.fees) / inf,
    coverage: x.allowance > 0 ? (net / real + x.oldAgeAllowance) / x.allowance : null,
  };
}
