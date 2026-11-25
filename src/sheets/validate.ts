// Sheet validation (SPEC 2.3): which tabs, columns and Settings keys were found.
// Pure: takes the tab names and the rows read.

import type { Rows } from '../model/parse';

export interface CheckItem {
  kind: 'tab' | 'column' | 'key';
  tab: string;
  name: string;
  found: boolean;
  /** Missing required items stop the app; missing optional ones only warn. */
  required: boolean;
}

export interface Checklist {
  items: CheckItem[];
  ok: boolean;
}

interface TabRule {
  required: boolean;
  columns: string[];
  optionalColumns: string[];
}

export const RULES: Record<string, TabRule> = {
  Settings: { required: true, columns: [], optionalColumns: [] },
  Holdings: {
    required: true,
    columns: ['id', 'name', 'type', 'currency', 'current_amount'],
    optionalColumns: ['vendor', 'owner', 'deposited_amount', 'return_5y_avg_pct', 'tax_type', 'include_in_total', 'group', 'fund_number', 'short_name'],
  },
  Pension: {
    required: false,
    columns: ['name', 'current_amount_ILS'],
    optionalColumns: ['owner', 'monthly_deposit_ILS', 'deposit_fee_pct', 'accumulation_fee_pct', 'yearly_return_pct', 'conversion_coefficient', 'stops_at_early_retirement'],
  },
  Goals: {
    required: true,
    columns: ['id', 'name', 'target_amount_ILS', 'target_year', 'type'],
    optionalColumns: ['target_month', 'priority', 'notes', 'spend_when_due', 'repeat_every_years', 'repeat_until_year'],
  },
  Deposits: {
    required: false,
    columns: ['holding_id', 'date', 'amount'],
    optionalColumns: ['deposit_id', 'currency', 'notes'],
  },
  Grants: {
    required: false,
    columns: ['holding_id', 'date', 'shares'],
    optionalColumns: ['grant_id', 'notes'],
  },
  Loans: {
    required: false,
    columns: ['name', 'kind', 'balance_ILS'],
    optionalColumns: ['id', 'owner', 'interest_rate_pct', 'monthly_payment_ILS', 'repay_year', 'repay_month', 'notes'],
  },
};

export const REQUIRED_KEYS = ['USD', 'capital_gains_tax_pct', 'income_tax_pct'];
export const OPTIONAL_KEYS = [
  'EUR', 'inflation_enabled', 'inflation_rate_pct', 'monthly_saving_ILS', 'yearly_free_cash_ILS', 'yearly_intel_grant_USD',
  'intel_vest_years', 'intel_vest_every_months', 'birth_year', 'retirement_age', 'pre_retirement_allowance_ILS', 'pension_start_age',
  'return_factor_optimistic', 'return_factor_moderate', 'return_factor_pessimistic',
];

export function validate(tabs: string[], rows: Record<string, Rows>): Checklist {
  const items: CheckItem[] = [];
  for (const [tab, rule] of Object.entries(RULES)) {
    const found = tabs.includes(tab);
    items.push({ kind: 'tab', tab, name: tab, found, required: rule.required });
    if (!found) continue;
    if (tab === 'Settings') {
      const keys = new Set((rows.Settings ?? []).map((r) => String(r?.[0] ?? '').trim()));
      for (const k of REQUIRED_KEYS) items.push({ kind: 'key', tab, name: k, found: keys.has(k), required: true });
      for (const k of OPTIONAL_KEYS) items.push({ kind: 'key', tab, name: k, found: keys.has(k), required: false });
      continue;
    }
    const head = new Set((rows[tab]?.[0] ?? []).map((h) => String(h ?? '').trim()));
    // An optional tab's columns are only required if the tab is there.
    for (const c of rule.columns) items.push({ kind: 'column', tab, name: c, found: head.has(c), required: true });
    for (const c of rule.optionalColumns) items.push({ kind: 'column', tab, name: c, found: head.has(c), required: false });
  }
  return { items, ok: items.every((i) => i.found || !i.required) };
}
