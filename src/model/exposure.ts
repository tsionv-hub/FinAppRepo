import type { Holding } from './types';

/** One exposure split, in ILS: the part that is in it, the part that is not, and the part we can't tell. */
export interface Split {
  yes: number;
  no: number;
  unknown: number;
}

export interface Exposure {
  /** Money invested in stocks. */
  stocks: Split;
  /** Money held abroad or in a foreign currency. */
  foreign: Split;
}

const STOCK_TYPES = new Set(['Stocks', 'Stocks (unvested)']);

/** The official figure (0–100) for a holding, weighted by track share; null when no track has one. */
function official(h: Holding, k: 'stocksPct' | 'foreignPct'): number | null {
  const v = (h.official ?? []).filter((x) => x.o?.[k] != null);
  const w = v.reduce((a, x) => a + x.w, 0);
  return w ? v.reduce((a, x) => a + x.w * x.o![k]!, 0) / w : null;
}

/**
 * Share (0–1) of a holding that is in stocks, or null when unknown.
 * Official fund data first; stocks count as all stocks; cash as none.
 */
export function stockShare(h: Holding): number | null {
  const o = official(h, 'stocksPct');
  if (o != null) return o / 100;
  if (STOCK_TYPES.has(h.type)) return 1;
  if (h.type === 'Cash') return 0;
  return null;
}

/**
 * Share (0–1) of a holding that is abroad, or null when unknown.
 * Official fund data first; shares and cash count by their currency (not ILS = abroad).
 */
export function foreignShare(h: Holding): number | null {
  const o = official(h, 'foreignPct');
  if (o != null) return o / 100;
  if (STOCK_TYPES.has(h.type) || h.type === 'Cash') return (h.info?.currency || 'ILS').toUpperCase() === 'ILS' ? 0 : 1;
  return null;
}

/** Stock and foreign exposure of the given holdings (pass the ones counted in the totals). */
export function exposure(H: Holding[]): Exposure {
  const add = (s: Split, v: number, share: number | null) => {
    if (share == null) s.unknown += v;
    else {
      s.yes += v * share;
      s.no += v * (1 - share);
    }
  };
  const e: Exposure = { stocks: { yes: 0, no: 0, unknown: 0 }, foreign: { yes: 0, no: 0, unknown: 0 } };
  for (const h of H) {
    if (!(h.value > 0)) continue;
    add(e.stocks, h.value, stockShare(h));
    add(e.foreign, h.value, foreignShare(h));
  }
  return e;
}
