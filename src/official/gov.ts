// Official fund data from the Israeli Ministry of Finance (Gemel-Net and
// Bituach-Net), published on data.gov.il. Public data about funds, looked up
// by the fund numbers in the Holdings `fund_number` column. Only those
// numbers are sent; nothing about the user.

import type { Holding, Official } from '../model/types';
import { reinvestmentHolding } from '../model/parse';

export const API = 'https://data.gov.il/api/3/action/datastore_search';
/** datastore resources "2024 to today" of the gemelnet and insurance (Bituach-Net) datasets. */
export const RESOURCES = {
  gemel: 'a30dcbea-a1d2-482c-ae29-8f781f5025fb',
  bituach: 'c6c62cc7-fe02-4b18-8f3e-813abfbb4647',
} as const;
export type Db = keyof typeof RESOURCES;

/** "101, 202" → [101, 202]. */
export function fundIds(s: string): number[] {
  return String(s ?? '')
    .split(/[^\d]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => n > 0);
}

/**
 * Insurance savings policies are in Bituach-Net; study funds and provident funds in Gemel-Net.
 * A policy can also invest through another company's provident fund (a Gemel-Net number),
 * so a policy track not found in Bituach-Net is looked up in Gemel-Net too.
 */
export function dbFor(h: Holding): Db {
  return h.type === 'Savings plan' ? 'bituach' : 'gemel';
}

/** Holdings that can use official data: study funds and funds with a fund number. */
export function lookupHoldings(H: Holding[]): Holding[] {
  return H.filter((h) => !h.synthetic && (h.group === 'study_fund' || h.group === 'fund') && fundIds(h.info?.fundNumber ?? '').length);
}

type Rec = Record<string, unknown>;
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : v == null || v === '' ? null : Number.isFinite(+String(v)) ? +String(v) : null);

/** The latest month per fund from datastore records. */
export function latest(db: Db, records: Rec[]): Map<number, Official> {
  const out = new Map<number, Official>();
  for (const r of records) {
    const id = n(r.FUND_ID);
    const period = n(r.REPORT_PERIOD);
    if (id == null || period == null) continue;
    const prev = out.get(id);
    if (prev && prev.period >= period) continue;
    const assets = n(r.TOTAL_ASSETS);
    const share = (k: string) => {
      const v = n(r[k]);
      return v != null && assets ? Math.round((1000 * v) / assets) / 10 : null;
    };
    out.set(id, {
      db,
      id,
      name: String(r.FUND_NAME ?? '').replace(/\s+/g, ' ').trim(),
      period,
      avg5: n(r.AVG_ANNUAL_YIELD_TRAILING_5YRS),
      avg3: n(r.AVG_ANNUAL_YIELD_TRAILING_3YRS),
      ytd: n(r.YEAR_TO_DATE_YIELD),
      fee: n(r.AVG_ANNUAL_MANAGEMENT_FEE),
      assetsM: assets,
      stocksPct: share('STOCK_MARKET_EXPOSURE'),
      foreignPct: share('FOREIGN_EXPOSURE'),
    });
  }
  return out;
}

export const key = (db: Db, id: number) => db + ':' + id;

/** Fetches the latest month of each fund; one request per database. */
export async function fetchOfficial(H: Holding[], fetchFn: typeof fetch = fetch): Promise<Map<string, Official>> {
  const want: Record<Db, Set<number>> = { gemel: new Set(), bituach: new Set() };
  for (const h of lookupHoldings(H)) for (const id of fundIds(h.info!.fundNumber)) want[dbFor(h)].add(id);
  const out = new Map<string, Official>();
  // Bituach-Net first, so policy tracks it doesn't have can join the Gemel-Net request.
  for (const db of ['bituach', 'gemel'] as Db[]) {
    const ids = [...want[db]];
    if (!ids.length) continue;
    const q = new URLSearchParams({
      resource_id: RESOURCES[db],
      filters: JSON.stringify({ FUND_ID: ids }),
      sort: 'REPORT_PERIOD desc',
      // About two years of months per fund: enough to find each fund's latest month.
      limit: String(Math.min(32000, ids.length * 24)),
    });
    const r = await fetchFn(API + '?' + q.toString());
    if (!r.ok) throw new Error('data.gov.il ' + r.status);
    const j = (await r.json()) as { success?: boolean; result?: { records?: Rec[] } };
    if (!j.success) throw new Error('data.gov.il: no result');
    for (const [id, o] of latest(db, j.result?.records ?? [])) out.set(key(db, id), o);
    if (db === 'bituach') for (const id of ids) if (!out.has(key(db, id))) want.gemel.add(id);
  }
  return out;
}

/**
 * Sets each looked-up holding's return to the official 5-year yearly average,
 * split evenly between its tracks; a track without a 5-year figure (or not
 * found) uses the sheet's return_5y_avg_pct. Fees stay as in the sheet.
 * Safe to call again: it always starts from the sheet's return.
 */
export function applyOfficial(H: Holding[], map: Map<string, Official>): void {
  for (const h of H) {
    if (h.retSheet != null) h.ret = h.retSheet;
    h.official = undefined;
  }
  for (const h of lookupHoldings(H)) {
    const ids = fundIds(h.info!.fundNumber);
    const tracks = ids.map((id) => ({ id, o: map.get(key(dbFor(h), id)) ?? map.get(key('gemel', id)) ?? null }));
    h.retSheet = h.ret;
    h.official = tracks;
    h.ret = tracks.reduce((a, x) => a + (x.o?.avg5 ?? h.retSheet!), 0) / tracks.length;
  }
  const i = H.findIndex((h) => h.synthetic);
  if (i >= 0) H[i] = { ...reinvestmentHolding(H.filter((h) => !h.synthetic)), value: H[i].value, deposited: H[i].deposited };
}
