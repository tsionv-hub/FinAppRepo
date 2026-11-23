// Fictional sheet data for tests. Not anyone's real finances.
import type { Rows } from '../src/model/parse';

export const settingsRows: Rows = [
  ['key', 'value'],
  ['base_currency', 'ILS'],
  ['display_currency', 'ILS'],
  ['inflation_enabled', '0'],
  ['inflation_rate_pct', '2.5'],
  ['start_date', '2026-01-01'],
  ['USD', '3.7'],
  ['EUR', '4'],
  ['monthly_saving_ILS', '6000'],
  ['yearly_free_cash_ILS', '40000'],
  ['yearly_intel_grant_USD', '20000'],
  ['capital_gains_tax_pct', '25'],
  ['income_tax_pct', '47'],
  ['intel_vest_years', '4'],
  ['intel_vest_every_months', '6'],
  ['birth_year', '1980'],
  ['retirement_age', '55'],
  ['pre_retirement_allowance_ILS', '18000'],
  ['pension_start_age', '67'],
  ['pension_deposit_growth_pct', '1'],
  ['pension_exempt_pct', '67'],
  ['pension_exempt_ceiling_ILS', '9430'],
  ['pension_tax_rate_pct', '20'],
  ['old_age_allowance_ILS', '2000'],
  ['return_factor_optimistic', '1'],
  ['return_factor_moderate', '0.75'],
  ['return_factor_pessimistic', '0.5'],
];

const HH = ['id', 'name', 'vendor', 'account_number', 'owner', 'type', 'investment_style', 'investment_track', 'currency', 'current_amount', 'deposited_amount', 'return_5y_avg_pct', 'deposit_fee_pct', 'management_fee_pct', 'tax_type', 'include_in_total', 'ticker', 'quantity', 'available_from', 'opened_date', 'last_updated', 'notes'];
const h = (o: Record<string, string | number>) => HH.map((k) => (o[k] ?? '') as string | number);

export const holdingsRows: Rows = [
  HH,
  h({ id: 'H1', name: 'Study A', vendor: 'Vendor 1', owner: 'P1', type: 'Study fund', currency: 'ILS', current_amount: 210000, deposited_amount: 150000, return_5y_avg_pct: 7.5, tax_type: 'none' }),
  h({ id: 'H2', name: 'Invest B', vendor: 'Vendor 2', owner: 'P2', type: 'Investment fund', currency: 'ILS', current_amount: 320000, deposited_amount: 250000, return_5y_avg_pct: 8, tax_type: 'capital_gain' }),
  h({ id: 'H3', name: 'Broker C', vendor: 'Vendor 3', owner: 'P1', type: 'Brokerage', currency: 'USD', current_amount: 60000, deposited_amount: 40000, return_5y_avg_pct: 10, tax_type: 'capital_gain' }),
  h({ id: 'H4', name: 'Savings D', vendor: 'Vendor 4', owner: 'P2', type: 'Savings plan', currency: 'ILS', current_amount: 90000, return_5y_avg_pct: 5, tax_type: 'capital_gain' }),
  h({ id: 'H5', name: 'Checking', vendor: 'Bank', owner: 'P1', type: 'Cash', currency: 'ILS', current_amount: 80000, return_5y_avg_pct: '', tax_type: 'none' }),
  h({ id: 'H6', name: 'Intel vested', owner: 'P1', type: 'Stocks', currency: 'USD', current_amount: 30000, return_5y_avg_pct: 2, tax_type: 'income' }),
  h({ id: 'H7', name: 'Intel unvested', owner: 'P1', type: 'Stocks (unvested)', currency: 'USD', current_amount: 50000, return_5y_avg_pct: 2, tax_type: 'income' }),
  h({ id: 'H8', name: 'Old account', owner: 'P2', type: 'Brokerage', currency: 'EUR', current_amount: 5000, return_5y_avg_pct: 4, tax_type: 'capital_gain', include_in_total: 0 }),
];

export const goalsHeader = ['id', 'name', 'target_amount_ILS', 'target_year', 'target_month', 'priority', 'notes', 'spend_when_due', 'type'];
export const goalsRows: Rows = [
  goalsHeader,
  ['G1', 'Rainy day fund', 120000, '', '', 1, '', '', 'reserve'],
  ['G2', 'Early retirement', 0, 2035, '', 2, '', '', 'retirement'],
  ['G3', 'Car', 150000, 2028, 6, 3, '', 1, ''],
  ['G4', "Alex's wedding", 200000, 2031, '', 4, '', 1, ''],
  ['G5', 'Apartment', 600000, 2033, 9, 5, '', 0, ''],
  ['G6', 'Old trip', 10000, 2020, '', 6, '', 1, ''],
];

const PH = ['id', 'name', 'owner', 'current_amount_ILS', 'monthly_deposit_ILS', 'deposit_fee_pct', 'accumulation_fee_pct', 'yearly_return_pct', 'conversion_coefficient', 'stops_at_early_retirement', 'notes'];
export const pensionRows: Rows = [
  PH,
  ['P1', 'Pension 1', 'P1', 600000, 4500, 1.5, 0.2, 5, 205, 1, ''],
  ['P2', 'Pension 2', 'P2', 400000, 3500, 1, 0.25, 5.5, 210, '', ''],
  ['P3', 'Manager policy', 'P1', 150000, 0, 0, 0.5, 4, 190, 0, ''],
];
