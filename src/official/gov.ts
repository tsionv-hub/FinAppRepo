// Official fund data from the Israeli Ministry of Finance (Gemel-Net,
// Bituach-Net and Pensia-Net), published on data.gov.il. Public data about
// funds, looked up by the fund numbers in the Holdings and Pension
// `fund_number` columns. Only those numbers are sent; nothing about the user.

import type { Holding, Official, PensionFund } from '../model/types';
import { reinvestmentHolding } from '../model/parse';

export const API = 'https://data.gov.il/api/3/action/datastore_search';
/** datastore resources "2024 to today" of the gemelnet, insurance (Bituach-Net) and pensia-net datasets. */
export const RESOURCES = {
  gemel: 'a30dcbea-a1d2-482c-ae29-8f781f5025fb',
  bituach: 'c6c62cc7-fe02-4b18-8f3e-813abfbb4647',
  pensia: '6d47d6b5-cb08-488b-b333-f1e717b1e1bd',
} as const;
export type Db = keyof typeof RESOURCES;

/**
 * A cell that may hold several parts with their share of the money:
 * "(101,25%),(202,75%)" → [101 at 0.25, 202 at 0.75]. The older forms "101" and
 * "101, 202" (equal shares) work too. Shares are scaled to add up to 1.
 */
export function shares(s: unknown): { value: string; w: number }[] {
  const t = String(s ?? '').trim();
  if (!t) return [];
  let parts: { value: string; w: number | null }[];
  if (t.includes('(')) {
    parts = [...t.matchAll(/\(\s*([^,()]+?)\s*,\s*([\d.]+)\s*%?\s*\)/g)].map((m) => ({ value: m[1], w: parseFloat(m[2]) }));
  } else parts = t.split(/[,;]+|\s+/).filter(Boolean).map((value) => ({ value, w: null }));
  if (!parts.length) return [];
  const given = parts.every((p) => p.w != null && p.w > 0);
  const sum = given ? parts.reduce((a, p) => a + p.w!, 0) : parts.length;
  return parts.map((p) => ({ value: p.value, w: given ? p.w! / sum : 1 / parts.length }));
}

/** Fund numbers with their share of the holding. */
export function fundTracks(s: unknown): { id: number; w: number }[] {
  const ps = shares(s).map((p) => ({ id: parseInt(p.value.replace(/[^\d]/g, ''), 10), w: p.w })).filter((p) => p.id > 0);
  const sum = ps.reduce((a, p) => a + p.w, 0) || 1;
  return ps.map((p) => ({ id: p.id, w: p.w / sum }));
}

/** "101, 202" or "(101,25%),(202,75%)" → [101, 202]. */
export function fundIds(s: string): number[] {
  return fundTracks(s).map((x) => x.id);
}

/**
 * expected_yearly_cost: one percent, or one per fund in the fund_number format.
 * "?" (or anything not a number) means not known yet.
 */
export function costParts(s: unknown): { v: number | null; w: number }[] {
  return shares(s).map((p) => {
    const v = parseFloat(p.value.replace('%', ''));
    return { v: Number.isFinite(v) ? v : null, w: p.w };
  });
}

/** The holding's total expected yearly cost (weighted), or null if any part is unknown. */
export function costTotal(s: unknown): number | null {
  const ps = costParts(s);
  if (!ps.length || ps.some((p) => p.v == null)) return null;
  return ps.reduce((a, p) => a + p.v! * p.w, 0);
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

/** Pension funds with a fund number (looked up in Pensia-Net). */
export function lookupPension(P: PensionFund[]): PensionFund[] {
  return P.filter((p) => fundIds(p.fundNumber ?? '').length);
}

/** Fetches the latest month of each fund; one request per database. */
export async function fetchOfficial(H: Holding[], fetchFn: typeof fetch = fetch, P: PensionFund[] = []): Promise<Map<string, Official>> {
  const want: Record<Db, Set<number>> = { gemel: new Set(), bituach: new Set(), pensia: new Set() };
  for (const h of lookupHoldings(H)) for (const id of fundIds(h.info!.fundNumber)) want[dbFor(h)].add(id);
  for (const p of lookupPension(P)) for (const id of fundIds(p.fundNumber!)) want.pensia.add(id);
  const out = new Map<string, Official>();
  // Bituach-Net first, so policy tracks it doesn't have can join the Gemel-Net request.
  for (const db of ['bituach', 'gemel', 'pensia'] as Db[]) {
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
 * weighted by each track's share; a track without a 5-year figure (or not
 * found) uses the sheet's return_5y_avg_pct. Fees stay as in the sheet.
 * Pension funds the same way (Pensia-Net; fallback yearly_return_pct).
 * Safe to call again: it always starts from the sheet's return.
 */
export function applyOfficial(H: Holding[], map: Map<string, Official>, P: PensionFund[] = []): void {
  for (const h of H) {
    if (h.retSheet != null) h.ret = h.retSheet;
    h.official = undefined;
  }
  for (const h of lookupHoldings(H)) {
    const tracks = fundTracks(h.info!.fundNumber).map(({ id, w }) => ({ id, w, o: map.get(key(dbFor(h), id)) ?? map.get(key('gemel', id)) ?? null }));
    h.retSheet = h.ret;
    h.official = tracks;
    h.ret = tracks.reduce((a, x) => a + x.w * (x.o?.avg5 ?? h.retSheet!), 0);
  }
  for (const p of P) {
    if (p.returnSheet != null) p.returnPct = p.returnSheet;
    p.official = undefined;
  }
  for (const p of lookupPension(P)) {
    const tracks = fundTracks(p.fundNumber!).map(({ id, w }) => ({ id, w, o: map.get(key('pensia', id)) ?? null }));
    p.returnSheet = p.returnPct;
    p.official = tracks;
    p.returnPct = tracks.reduce((a, x) => a + x.w * (x.o?.avg5 ?? p.returnSheet!), 0);
  }
  const i = H.findIndex((h) => h.synthetic);
  if (i >= 0) H[i] = { ...reinvestmentHolding(H.filter((h) => !h.synthetic)), value: H[i].value, deposited: H[i].deposited };
}
