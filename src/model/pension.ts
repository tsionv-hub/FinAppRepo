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
  /** Income tax credit points of each pension owner (2.25 for a resident; 2.75 for a woman). */
  creditPoints: number;
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

/**
 * Israeli income tax brackets, monthly ₪ (2026). Brackets, the credit point and the
 * pension exemption ceiling are updated with the consumer price index, so the
 * pension's tax is worked out in today's money.
 */
export const TAX_BRACKETS: [upTo: number, rate: number][] = [
  [7010, 0.1], [10060, 0.14], [19000, 0.2], [25100, 0.31], [46690, 0.35], [60130, 0.47], [Infinity, 0.5],
];
/** Value of one income tax credit point, ₪ per month (2026). */
export const CREDIT_POINT = 242;

/** Monthly income tax on taxable income (today's money), after credit points. */
export function incomeTax(taxable: number, creditPoints: number): number {
  let tax = 0;
  let from = 0;
  for (const [upTo, rate] of TAX_BRACKETS) {
    if (taxable <= from) break;
    tax += (Math.min(taxable, upTo) - from) * rate;
    from = upTo;
  }
  return Math.max(0, tax - creditPoints * CREDIT_POINT);
}

/**
 * Monthly tax on one person's pension (today's money): the exempt share of the
 * pension up to the ceiling (Amendment 190: 67% from 2028) is tax free, the rest is
 * taxed with the income tax brackets, less the person's credit points.
 */
export function pensionTax(monthly: number, exemptPct: number, ceiling: number, creditPoints: number): number {
  const exempt = (Math.min(monthly, ceiling) * exemptPct) / 100;
  return incomeTax(Math.max(0, monthly - exempt), creditPoints);
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
  // Tax in today's money: the ceiling and brackets rise with prices (when inflation is off, prices don't rise).
  for (const m of byOwner.values()) {
    pre += m;
    net += m - pensionTax(m / inf, x.exemptPct, x.exemptCeiling, x.creditPoints) * inf;
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
