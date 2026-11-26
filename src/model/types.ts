// Domain types for the finance model. Everything in src/model is pure:
// no DOM, no network, no clock (the start month is passed in).

export type TaxType = 'capital_gain' | 'income' | 'none';

export const UNVESTED = 'Stocks (unvested)';
export const VESTED_STOCK = 'Stocks';
export const PENSION_TYPE = 'Pension';
export const REINVEST_TYPE = 'Stock reinvestment';
/** Holding types whose value-weighted 5y return drives the Stock reinvestment holding. */
export const INVEST_TYPES = ['Study fund', 'Investment fund', 'Savings plan', 'Brokerage'];

/** Sub-sections of the Holdings panel; each has its own actions in the holding popup. */
export type HoldingGroup = 'study_fund' | 'fund' | 'trading' | 'bank' | 'stocks';
export const GROUPS: HoldingGroup[] = ['study_fund', 'fund', 'trading', 'bank', 'stocks'];

export interface Holding {
  /** The sheet's id (e.g. H9) and row, for deposits and writes. */
  id?: string;
  row?: number;
  /** Holdings `group` column; blank = worked out from the type. */
  group?: HoldingGroup;
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
  /** Display-only details from the sheet (account numbers are never read). */
  info?: HoldingInfo;
  /** return_5y_avg_pct from the sheet, kept when `ret` comes from official data. */
  retSheet?: number;
  /** Official data per track (fund_number may hold several; the money is split evenly). */
  official?: { id: number; w: number; o: Official | null }[];
}

/** One fund or track's latest month in Gemel-Net / Bituach-Net (data.gov.il). Percent values. */
export interface Official {
  db: 'gemel' | 'bituach' | 'pensia';
  id: number;
  name: string;
  /** YYYYMM */
  period: number;
  avg5: number | null;
  avg3: number | null;
  ytd: number | null;
  /** Average management fee across members (for comparison; the app uses the sheet's own fees). */
  fee: number | null;
  /** Fund size, millions of ILS. */
  assetsM: number | null;
  stocksPct: number | null;
  foreignPct: number | null;
}

export interface HoldingInfo {
  currency: string;
  /** current_amount in the row's own currency. */
  amount: number;
  /** Rate to ILS used. */
  rate: number;
  track: string;
  style: string;
  depositFeePct: number | null;
  managementFeePct: number | null;
  ticker: string;
  quantity: number | null;
  lastUpdated: string;
  notes: string;
  /** fund_number column (study funds and funds only). */
  fundNumber: string;
  /** short_name column: a label for charts (blank = made from the vendor). */
  short: string;
  /** expected_yearly_cost as typed: "0.94", "?" or "(0.41,38%),(0.34,62%)". */
  expectedCost: string;
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
  /** fund_number and expected_yearly_cost as typed (same formats as Holdings). */
  fundNumber?: string;
  expectedCost?: string;
  /** yearly_return_pct from the sheet, kept when returnPct comes from official data. */
  returnSheet?: number;
  official?: { id: number; w: number; o: Official | null }[];
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
  notes?: string;
  priority?: number;
  /** Recurring goal: repeats every N years from `year` (blank = once). */
  everyYears?: number;
  /** Recurring goal: last year an occurrence may fall in (blank = end of the projection). */
  untilYear?: number;
  /** Set on each occurrence of a recurring goal: the goal it came from. */
  series?: Goal;
  /** Set on the stand-in goal that reports a loan's repayment. */
  loan?: Loan;
  /** Retirement goal only: last year of the allowance (inclusive) and monthly allowance. */
  endYear?: number;
  monthly?: number;
}

/** Money you owe (SPEC addition: Loans tab). Shown as a negative holding; repayments are checked like goals. */
export interface Loan {
  id?: string;
  name: string;
  owner: string;
  /** installments: a monthly payment until paid off. lump_sum: everything on one date. */
  kind: 'installments' | 'lump_sum';
  /** Amount owed today (ILS). */
  balance: number;
  /** Yearly interest on the balance, in percent (blank = 0). */
  ratePct: number;
  /** installments only. */
  monthlyPayment: number;
  /** lump_sum only: due on the 1st of this month (month blank = January). */
  year: number;
  month: number;
  notes: string;
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
  /** Money owed; repaid from liquid money (never the rainy day fund). */
  loans: Loan[];
}
