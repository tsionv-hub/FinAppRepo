// Turns raw sheet values (arrays of rows) into model objects.
// Tabs are read by column name, so column order in the sheet is free.

import type { Goal, Holding, PensionFund, Scenario, Settings, TaxType } from './types';
import { INVEST_TYPES, REINVEST_TYPE } from './types';

export type Cell = string | number | boolean | null | undefined;
export type Rows = Cell[][];
export type Record_ = Record<string, Cell> & { _row: number };

export function num(x: Cell): number {
  const v = parseFloat(String(x ?? '').replace(/,/g, ''));
  return Number.isNaN(v) ? 0 : v;
}

export function blank(x: Cell): boolean {
  return x === undefined || x === null || String(x).trim() === '';
}

/** First row is the header; returns one object per data row with its 1-based sheet row. */
export function table(rows: Rows): Record_[] {
  const head = (rows[0] ?? []).map((h) => String(h ?? '').trim());
  const out: Record_[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const o = { _row: i + 1 } as Record_;
    head.forEach((h, j) => {
      if (h) o[h] = r[j];
    });
    out.push(o);
  }
  return out;
}

function numOr(x: Cell, d: number): number {
  return blank(x) ? d : num(x);
}
function numOrNull(x: Cell): number | null {
  return blank(x) ? null : num(x);
}

export function parseSettings(rows: Rows): Settings {
  const raw: Record<string, string> = {};
  const at: Record<string, number> = {};
  rows.forEach((r, i) => {
    const k = String(r?.[0] ?? '').trim();
    if (k) {
      raw[k] = r[1] == null ? '' : String(r[1]);
      at[k] = i + 1;
    }
  });
  const S = raw;
  const usd = num(S.USD) || 1;
  const returnFactors: Record<Scenario, number> = {
    opt: numOr(S.return_factor_optimistic, 1),
    mod: numOr(S.return_factor_moderate, 0.75),
    pes: numOr(S.return_factor_pessimistic, 0.5),
  };
  return {
    raw,
    rows: at,
    fx: { ILS: 1, USD: usd, EUR: num(S.EUR) || 1 },
    usd,
    returnFactors,
    inflationEnabled: num(S.inflation_enabled) === 1 || /^true$/i.test(S.inflation_enabled ?? ''),
    inflationRatePct: num(S.inflation_rate_pct),
    monthlySaving: num(S.monthly_saving_ILS),
    yearlyFreeCash: num(S.yearly_free_cash_ILS),
    yearlyGrantUSD: num(S.yearly_intel_grant_USD),
    capitalGainsTaxPct: num(S.capital_gains_tax_pct),
    incomeTaxPct: num(S.income_tax_pct),
    vestYears: num(S.intel_vest_years) || 4,
    vestEveryMonths: num(S.intel_vest_every_months) || 6,
    birthYear: numOrNull(S.birth_year),
    retirementAge: numOrNull(S.retirement_age),
    retirementAllowance: num(S.pre_retirement_allowance_ILS),
    pensionStartAge: num(S.pension_start_age) || 67,
    pensionDepositGrowthPct: num(S.pension_deposit_growth_pct),
    pensionExemptPct: numOr(S.pension_exempt_pct, 67),
    pensionExemptCeiling: numOr(S.pension_exempt_ceiling_ILS, 9430),
    pensionTaxRatePct: numOr(S.pension_tax_rate_pct, 20),
    oldAgeAllowance: num(S.old_age_allowance_ILS),
  };
}

function taxType(x: Cell): TaxType {
  const s = String(x ?? '').trim();
  return s === 'capital_gain' || s === 'income' ? s : 'none';
}

/** Holdings converted to ILS, plus the synthetic Stock reinvestment holding at the end. */
export function parseHoldings(rows: Rows, fx: Record<string, number>): Holding[] {
  const H: Holding[] = table(rows)
    .filter((x) => !blank(x.id) && !blank(x.type))
    .map((x) => {
      const rate = fx[String(x.currency ?? 'ILS').trim()] ?? 1;
      const value = num(x.current_amount) * rate;
      return {
        name: String(x.name ?? ''),
        vendor: String(x.vendor ?? ''),
        owner: String(x.owner ?? ''),
        type: String(x.type).trim(),
        ret: num(x.return_5y_avg_pct),
        tax: taxType(x.tax_type),
        include: blank(x.include_in_total) ? true : num(x.include_in_total) === 1 || /^true$/i.test(String(x.include_in_total)),
        value,
        deposited: blank(x.deposited_amount) ? value : num(x.deposited_amount) * rate,
        info: {
          currency: String(x.currency ?? 'ILS').trim() || 'ILS',
          amount: num(x.current_amount),
          rate,
          track: String(x.investment_track ?? '').trim(),
          style: String(x.investment_style ?? '').trim(),
          depositFeePct: numOrNull(x.deposit_fee_pct),
          managementFeePct: numOrNull(x.management_fee_pct),
          ticker: String(x.ticker ?? '').trim(),
          quantity: numOrNull(x.quantity),
          lastUpdated: String(x.last_updated ?? '').trim(),
          notes: String(x.notes ?? '').trim(),
        },
      };
    });
  H.push(reinvestmentHolding(H));
  return H;
}

/** Liquid, capital-gain taxed, return = value-weighted average of the investment-type holdings. */
export function reinvestmentHolding(H: Holding[]): Holding {
  let w = 0;
  let wr = 0;
  for (const h of H) {
    if (INVEST_TYPES.includes(h.type) && h.value > 0) {
      w += h.value;
      wr += h.value * h.ret;
    }
  }
  return {
    name: REINVEST_TYPE,
    synthetic: true,
    vendor: '',
    owner: '',
    type: REINVEST_TYPE,
    ret: w > 0 ? wr / w : 0,
    tax: 'capital_gain',
    include: true,
    value: 0,
    deposited: 0,
  };
}

export function parsePension(rows: Rows): PensionFund[] {
  return table(rows)
    .filter((x) => !blank(x.name))
    .map((x) => ({
      name: String(x.name),
      owner: String(x.owner ?? ''),
      balance: num(x.current_amount_ILS),
      monthlyDeposit: num(x.monthly_deposit_ILS),
      depositFeePct: num(x.deposit_fee_pct),
      accumulationFeePct: num(x.accumulation_fee_pct),
      returnPct: num(x.yearly_return_pct),
      coefficient: num(x.conversion_coefficient) || 200,
      stopsAtEarlyRetirement: blank(x.stops_at_early_retirement) ? true : num(x.stops_at_early_retirement) === 1 || /^true$/i.test(String(x.stops_at_early_retirement)),
    }));
}

export interface GoalsTab {
  goals: Goal[];
  /** Rainy day fund: sum of `reserve` rows. */
  reserve: number;
  /** Sheet row of the last `reserve` row (0 = none), for writing the amount back. */
  reserveRow: number;
  header: string[];
  /** Existing ids, to generate new unique ones. */
  ids: string[];
}

export function parseGoals(rows: Rows, startYear: number): GoalsTab {
  const t = table(rows);
  let reserve = 0;
  let reserveRow = 0;
  for (const x of t) {
    if (String(x.type ?? '').trim() === 'reserve') {
      reserve += num(x.target_amount_ILS);
      reserveRow = x._row;
    }
  }
  const goals = t
    .filter((x) => !blank(x.name) && String(x.type ?? '').trim() !== 'reserve')
    .map<Goal>((x) => ({
      id: blank(x.id) ? undefined : String(x.id),
      name: String(x.name),
      amount: num(x.target_amount_ILS),
      year: parseInt(String(x.target_year), 10),
      month: Math.min(12, Math.max(1, parseInt(String(x.target_month ?? ''), 10) || 1)),
      spend: blank(x.spend_when_due) ? true : num(x.spend_when_due) === 1 || /^true$/i.test(String(x.spend_when_due)),
      retirement: String(x.type ?? '').trim() === 'retirement',
      notes: String(x.notes ?? '').trim(),
      priority: blank(x.priority) ? undefined : num(x.priority),
    }))
    // The retirement row's year is derived from birth year + retirement age, so keep it regardless.
    .filter((g) => g.retirement || g.year >= startYear);
  return {
    goals,
    reserve,
    reserveRow,
    header: (rows[0] ?? []).map((h) => String(h ?? '').trim()),
    ids: t.map((x) => String(x.id ?? '')).filter(Boolean),
  };
}
