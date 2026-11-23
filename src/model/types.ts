// Domain types for the finance model. Everything in src/model is pure:
// no DOM, no network, no clock (the start month is passed in).

export type TaxType = 'capital_gain' | 'income' | 'none';

export const UNVESTED = 'Stocks (unvested)';
export const VESTED_STOCK = 'Stocks';
export const PENSION_TYPE = 'Pension';
export const REINVEST_TYPE = 'Stock reinvestment';
/** Holding types whose value-weighted 5y return drives the Stock reinvestment holding. */
export const INVEST_TYPES = ['Study fund', 'Investment fund', 'Savings plan', 'Brokerage'];

export interface Holding {
  name: string;
  vendor: string;
  owner: string;
  type: string;
  /** Yearly return in percent (return_5y_avg_pct, before the scenario factor). */
  ret: number;
  tax: TaxType;
  /** include_in_total (blank = included). */
  include: boolean;
  /** Current value in ILS. */
  value: number;
  /** Cost basis in ILS (deposited_amount; blank = value). */
  deposited: number;
  /** True for the app-generated Stock reinvestment holding. */
  synthetic?: boolean;
}

export interface PensionFund {
  name: string;
  owner: string;
  balance: number;
  monthlyDeposit: number;
  depositFeePct: number;
  accumulationFeePct: number;
  returnPct: number;
  coefficient: number;
  stopsAtEarlyRetirement: boolean;
}

export interface Goal {
  id?: string;
  name: string;
  /** Target amount in today's ILS. For the retirement goal this is derived. */
  amount: number;
  year: number;
  /** 1-12; blank in the sheet = 1. */
  month: number;
  /** Pay out (withdraw) on the due date. */
  spend: boolean;
  /** True for the `retirement` row (early retirement). */
  retirement: boolean;
  /** Added in the app, not saved yet. */
  pending?: boolean;
  /** Retirement goal only: last year of the allowance (inclusive) and monthly allowance. */
  endYear?: number;
  monthly?: number;
}

/** Month 0 of the simulation: the 1st of the current month. month0 is 0-11. */
export interface StartMonth {
  year: number;
  month0: number;
}

export type Scenario = 'opt' | 'mod' | 'pes';

/** Values read from the Settings tab, already parsed. Blank optional values are null. */
export interface Settings {
  raw: Record<string, string>;
  /** Row number (1-based) of each key in the Settings tab, for writing back. */
  rows: Record<string, number>;
  fx: Record<string, number>;
  usd: number;
  returnFactors: Record<Scenario, number>;
  inflationEnabled: boolean;
  inflationRatePct: number;
  monthlySaving: number;
  yearlyFreeCash: number;
  yearlyGrantUSD: number;
  capitalGainsTaxPct: number;
  incomeTaxPct: number;
  vestYears: number;
  vestEveryMonths: number;
  birthYear: number | null;
  retirementAge: number | null;
  retirementAllowance: number;
  pensionStartAge: number;
  pensionDepositGrowthPct: number;
  pensionExemptPct: number;
  pensionExemptCeiling: number;
  pensionTaxRatePct: number;
  oldAgeAllowance: number;
}

/** Everything the simulation needs, after UI what-if overrides. */
export interface Params {
  start: StartMonth;
  returnFactor: number;
  /** Fractions, e.g. 0.25. */
  cgTax: number;
  incomeTax: number;
  monthlySaving: number;
  yearlyFreeCash: number;
  /** Yearly Intel grant converted to ILS. */
  yearlyGrant: number;
  inflationOn: boolean;
  /** Fraction, e.g. 0.03. */
  inflationRate: number;
  /** Rainy day fund in today's ILS. */
  reserve: number;
  /** Year retirement starts (yearly free cash and grant stop from then); null = no retirement. */
  stopYear: number | null;
  vestEveryMonths: number;
  vestTranches: number;
  countUnvested: boolean;
}
