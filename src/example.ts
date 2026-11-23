// A made-up household for exploring the app: used by "Explore with example data"
// (no sign-in) and by the downloadable example sheet. Every name and number here
// is invented.

import type { Rows } from './model/parse';
import { TEMPLATE_TABS, workbookFiles, zip, type Tab, type Val } from './template';

const SETTINGS_NOTES = new Map(TEMPLATE_TABS[0].rows.map((r) => [r[0], r[2]]));
const settings = (rows: [string, Val][]): Val[][] => [['key', 'value', 'notes'], ...rows.map(([k, v]) => [k, v, SETTINGS_NOTES.get(k) ?? null])];

const HOLD_HEAD = TEMPLATE_TABS[1].rows[0] as string[];
const hold = (o: Record<string, Val>): Val[] => HOLD_HEAD.map((h) => (h in o ? o[h] : null));

export const EXAMPLE_TABS: Tab[] = [
  {
    name: 'Settings',
    rows: settings([
      ['base_currency', 'ILS'],
      ['display_currency', 'ILS'],
      ['inflation_enabled', 0],
      ['inflation_rate_pct', 2.5],
      ['start_date', null],
      ['USD', { f: 'GOOGLEFINANCE("CURRENCY:USDILS")', v: 3.7 }],
      ['EUR', { f: 'GOOGLEFINANCE("CURRENCY:EURILS")', v: 4 }],
      ['monthly_saving_ILS', 4500],
      ['yearly_free_cash_ILS', 30000],
      ['yearly_intel_grant_USD', 15000],
      ['capital_gains_tax_pct', 25],
      ['income_tax_pct', 50],
      ['intel_vest_years', 4],
      ['intel_vest_every_months', 6],
      ['birth_year', 1986],
      ['retirement_age', 53],
      ['pre_retirement_allowance_ILS', 20000],
      ['pension_start_age', 67],
      ['pension_deposit_growth_pct', 1],
      ['pension_exempt_pct', 67],
      ['pension_exempt_ceiling_ILS', 9430],
      ['pension_tax_rate_pct', 20],
      ['old_age_allowance_ILS', 2500],
      ['return_factor_optimistic', 1],
      ['return_factor_moderate', 0.75],
      ['return_factor_pessimistic', 0.5],
    ]),
  },
  {
    name: 'Holdings',
    rows: [
      HOLD_HEAD,
      hold({ id: 'H1', name: 'Study fund (Alex)', vendor: 'Provider A', owner: 'Alex', type: 'Study fund', investment_track: 'Stocks', currency: 'ILS', current_amount: 185000, deposited_amount: 140000, return_5y_avg_pct: 7.2, deposit_fee_pct: 0, management_fee_pct: 0.6, tax_type: 'none', include_in_total: 1, last_updated: '2026-11-01' }),
      hold({ id: 'H2', name: 'Study fund (Sam)', vendor: 'Provider B', owner: 'Sam', type: 'Study fund', investment_track: 'General', currency: 'ILS', current_amount: 96000, deposited_amount: 80000, return_5y_avg_pct: 6.8, management_fee_pct: 0.7, tax_type: 'none', include_in_total: 1, last_updated: '2026-11-01' }),
      hold({ id: 'H3', name: 'Investment fund', vendor: 'Provider A', owner: 'Alex', type: 'Investment fund', investment_track: 'S&P 500', currency: 'ILS', current_amount: 140000, deposited_amount: 110000, return_5y_avg_pct: 6.5, management_fee_pct: 0.5, tax_type: 'capital_gain', include_in_total: 1, last_updated: '2026-11-01' }),
      hold({ id: 'H4', name: 'Kids savings plan', vendor: 'Provider C', owner: 'Sam', type: 'Savings plan', investment_track: 'Balanced', currency: 'ILS', current_amount: 60000, deposited_amount: 52000, return_5y_avg_pct: 5.1, management_fee_pct: 0.4, tax_type: 'capital_gain', include_in_total: 1, last_updated: '2026-10-15' }),
      hold({ id: 'H5', name: 'Brokerage account', vendor: 'Broker D', owner: 'Alex', type: 'Brokerage', investment_style: 'Index ETFs', currency: 'USD', current_amount: 42000, deposited_amount: 30000, return_5y_avg_pct: 9.8, tax_type: 'capital_gain', include_in_total: 1, last_updated: '2026-11-20' }),
      hold({ id: 'H6', name: 'Checking and deposits', vendor: 'Bank E', owner: 'Joint', type: 'Cash', currency: 'ILS', current_amount: 65000, tax_type: 'none', include_in_total: 1, last_updated: '2026-11-20' }),
      hold({ id: 'H7', name: 'Company shares (vested)', owner: 'Alex', type: 'Stocks', currency: 'USD', current_amount: 18000, return_5y_avg_pct: 3, tax_type: 'income', include_in_total: 1, notes: 'In your own sheet, current_amount can be quantity × GOOGLEFINANCE price.' }),
      hold({ id: 'H8', name: 'Company shares (unvested)', owner: 'Alex', type: 'Stocks (unvested)', currency: 'USD', current_amount: 36000, return_5y_avg_pct: 3, tax_type: 'income', include_in_total: 1 }),
      hold({ id: 'H9', name: 'Old foreign account', vendor: 'Bank F', owner: 'Sam', type: 'Brokerage', currency: 'EUR', current_amount: 4000, deposited_amount: 4000, return_5y_avg_pct: 2, tax_type: 'capital_gain', include_in_total: 0, notes: 'include_in_total = 0: shown but not counted.' }),
    ],
  },
  {
    name: 'Pension',
    rows: [
      TEMPLATE_TABS[2].rows[0],
      ['P1', 'Pension fund (Alex)', 'Alex', 410000, 4200, 1.5, 0.2, 5.5, 205, 1, null],
      ['P2', 'Pension fund (Sam)', 'Sam', 260000, 3100, 1, 0.25, 5.2, 210, 1, null],
      ['P3', 'Old manager policy', 'Alex', 120000, 0, 0, 0.6, 4, 190, 0, 'No new deposits'],
    ],
  },
  {
    name: 'Goals',
    rows: [
      TEMPLATE_TABS[3].rows[0],
      ['G1', 'Rainy day fund', 100000, null, null, 1, 'Never spent', null, 'reserve'],
      ['G2', 'Early retirement', 0, null, null, 2, 'Year and amount come from Settings', null, 'retirement'],
      ['G3', 'Family trip', 35000, 2027, 8, 3, null, 1, null],
      ['G4', 'New car', 140000, 2028, 6, 4, null, 1, null],
      ['G5', 'Kitchen renovation', 120000, 2030, 3, 5, null, 1, null],
      ['G6', "Noa's bat mitzvah", 60000, 2032, 5, 6, null, 1, null],
      ['G7', 'University', 150000, 2036, 10, 7, 'Kept invested: not paid out', 0, null],
      ['G8', 'Apartment help', 400000, 2040, 1, 8, null, 1, null],
    ],
  },
  {
    name: 'ToDo',
    rows: [TEMPLATE_TABS[4].rows[0], ['T1', 'Update balances from the provider sites', 'Holdings', 'open', 'Once a month']],
  },
];

/** The example as the app reads a sheet: formulas replaced by their values. */
export function exampleRows(): Record<string, Rows> {
  const out: Record<string, Rows> = {};
  for (const t of EXAMPLE_TABS) out[t.name] = t.rows.map((r) => r.map((v) => (v && typeof v === 'object' ? v.v ?? '' : v)));
  return out;
}

export function exampleXlsx(): Uint8Array {
  return zip(workbookFiles(EXAMPLE_TABS));
}
