import { vestTranches } from './engine';
import type { Loan, Params, Scenario, Settings, StartMonth } from './types';

/** What-if values the user can change in the app (not written to the sheet). */
export interface WhatIf {
  scenario: Scenario;
  monthlySaving: number;
  yearlyFreeCash: number;
  yearlyGrantUSD: number;
  inflationOn: boolean;
  inflationRatePct: number;
  capitalGainsTaxPct: number;
  incomeTaxPct: number;
  countUnvested: boolean;
  reserve: number;
  retirementAge: number | null;
  allowance: number;
  pensionDepositGrowthPct: number;
  pensionCreditPoints: number;
  oldAgeAllowance: number;
}

export function defaultWhatIf(s: Settings, reserve: number): WhatIf {
  return {
    scenario: 'mod',
    monthlySaving: s.monthlySaving,
    yearlyFreeCash: s.yearlyFreeCash,
    yearlyGrantUSD: s.yearlyGrantUSD,
    inflationOn: s.inflationEnabled,
    inflationRatePct: s.inflationRatePct,
    capitalGainsTaxPct: s.capitalGainsTaxPct,
    incomeTaxPct: s.incomeTaxPct,
    countUnvested: true,
    reserve,
    retirementAge: s.retirementAge,
    allowance: s.retirementAllowance,
    pensionDepositGrowthPct: s.pensionDepositGrowthPct,
    pensionCreditPoints: s.pensionCreditPoints,
    oldAgeAllowance: s.oldAgeAllowance,
  };
}

export function buildParams(s: Settings, w: WhatIf, start: StartMonth, stopYear: number | null, loans: Loan[] = []): Params {
  return {
    start,
    returnFactor: s.returnFactors[w.scenario] ?? 1,
    cgTax: w.capitalGainsTaxPct / 100,
    incomeTax: w.incomeTaxPct / 100,
    monthlySaving: w.monthlySaving,
    yearlyFreeCash: w.yearlyFreeCash,
    yearlyGrant: w.yearlyGrantUSD * s.usd,
    inflationOn: w.inflationOn,
    inflationRate: w.inflationRatePct / 100,
    reserve: w.reserve,
    stopYear,
    vestEveryMonths: s.vestEveryMonths,
    vestTranches: vestTranches(s.vestYears, s.vestEveryMonths),
    countUnvested: w.countUnvested,
    loans,
  };
}
