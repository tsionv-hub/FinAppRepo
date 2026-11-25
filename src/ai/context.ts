// What the AI is told with each question: instructions, the user guide, the
// sheet's data and the app's own results. Pure: no DOM, no network.
// Account numbers are never included (the parsers never read them).

import type { Goal, Holding, Loan, PensionFund } from '../model/types';
import type { Deposit } from '../model/deposits';

export interface AiResults {
  postTax: number;
  preTax: number;
  afterDebts: number;
  freeToday: number;
  freeNote: string;
  scenario: string;
  inflation: string;
  goals: { name: string; due: string; amount: number; repeats?: string; status: string }[];
  loans: { name: string; owedToday: number; plan: string; status: string }[];
  retirement: Record<string, string | number> | null;
  pension: Record<string, string | number> | null;
}

export interface AiSnapshot {
  today: string;
  lang: 'en' | 'he';
  example: boolean;
  settings: Record<string, string>;
  holdings: Holding[];
  pension: PensionFund[];
  goals: Goal[];
  rainyDayFund: number;
  loans: Loan[];
  /** Deposits tab rows; null when the sheet has none. */
  deposits?: Deposit[] | null;
  results: AiResults;
  guide: string;
}

const round = (v: number) => Math.round(v);

/** Sheet data in a compact form the model reads easily. */
export function sheetJson(s: AiSnapshot): string {
  const holdings = s.holdings
    .filter((h) => !h.synthetic || h.value > 0)
    .map((h) => ({
      name: h.name, vendor: h.vendor || undefined, owner: h.owner || undefined, type: h.type,
      currency: h.info?.currency, amount_in_currency: h.info?.amount, value_ILS: round(h.value), deposited_ILS: round(h.deposited),
      return_5y_avg_pct: h.ret, tax_type: h.tax, included_in_totals: h.include,
      track: h.info?.track || undefined, style: h.info?.style || undefined, ticker: h.info?.ticker || undefined, quantity: h.info?.quantity ?? undefined,
      deposit_fee_pct: h.info?.depositFeePct ?? undefined, management_fee_pct: h.info?.managementFeePct ?? undefined,
      last_updated: h.info?.lastUpdated || undefined, notes: h.info?.notes || undefined, created_by_app: h.synthetic || undefined,
    }));
  const goals = s.goals.map((g) => ({
    name: g.name, amount_ILS: g.amount, year: g.year, month: g.month, paid_out_when_due: g.spend,
    type: g.retirement ? 'early retirement' : undefined, repeat_every_years: g.everyYears, repeat_until_year: g.untilYear,
    notes: g.notes || undefined, not_saved_yet: g.pending || undefined,
  }));
  const loans = s.loans.map((l) => ({
    name: l.name, owner: l.owner || undefined, kind: l.kind, owed_today_ILS: l.balance, interest_pct: l.ratePct,
    monthly_payment_ILS: l.kind === 'installments' ? l.monthlyPayment : undefined,
    repay: l.kind === 'lump_sum' ? `${l.year}-${String(l.month).padStart(2, '0')}` : undefined, notes: l.notes || undefined,
  }));
  const names = new Map(s.holdings.filter((h) => h.id).map((h) => [h.id!, h.name]));
  const deposits = s.deposits?.map((d) => ({ holding: names.get(d.holdingId) ?? d.holdingId, date: d.date, amount: d.amount, currency: d.currency || undefined, notes: d.notes || undefined }));
  return JSON.stringify({ settings: s.settings, holdings, pension_funds: s.pension, goals, rainy_day_fund_ILS: s.rainyDayFund, loans, deposits });
}

export function systemPrompt(s: AiSnapshot): string {
  const lang = s.lang === 'he' ? 'Hebrew' : 'English';
  return [
    'You are the assistant inside "Finance Planner", a personal finance planning app. You answer questions about the user\'s own data and about how the app works.',
    '',
    'Rules:',
    '- Use only the sheet data, the app results and the guide below. If something is not there, say so plainly.',
    s.deposits ? '- "deposits" lists each deposit into a holding (date, amount in the holding\'s currency).' : '- The sheet keeps no history of individual deposits: only the total deposited and a last_updated date per holding.',
    '- For totals, free money, goal status, retirement and pension, use the app results as given; do not recompute them differently.',
    '- Amounts are in Israeli shekels (₪) unless another currency is stated.',
    `- Today is ${s.today}.`,
    `- Answer in ${lang}, unless the user writes in another language. Be short and clear; use a short list when there are several items.`,
    '- This is planning help, not financial, tax or legal advice. If asked what to do, explain the numbers and options, and say it is not advice.',
    '- Never ask for passwords, account numbers or other credentials.',
    s.example ? '- This is the app\'s example data (a made-up household), not a real person\'s finances.' : '',
    '',
    'APP RESULTS (JSON):',
    JSON.stringify(s.results),
    '',
    'SHEET DATA (JSON):',
    sheetJson(s),
    '',
    'APP GUIDE:',
    s.guide,
  ].filter((l) => l !== null).join('\n');
}

/**
 * "Don't send my data": only the question and the user guide go to the AI.
 * No sheet data, no results, nothing about the user's finances.
 */
export function appOnlyPrompt(lang: 'en' | 'he', today: string, guide: string): string {
  const l = lang === 'he' ? 'Hebrew' : 'English';
  return [
    'You are the assistant inside "Finance Planner", a personal finance planning app. Answer questions about how the app works, using the guide below.',
    '',
    'Rules:',
    "- You do NOT have the user's data: they chose \"Don't send my data\". If they ask about their own numbers, holdings or goals, say you can't see them in this mode, and that they can untick \"Don't send my data\" in the chat to include their sheet.",
    '- General explanations (what free money means, how a recurring goal works, what inflation adjustment changes) are fine.',
    `- Today is ${today}.`,
    `- Answer in ${l}, unless the user writes in another language. Be short and clear.`,
    '- This is planning help, not financial, tax or legal advice.',
    '',
    'APP GUIDE:',
    guide,
  ].join('\n');
}
