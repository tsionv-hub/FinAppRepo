import { describe, expect, it } from 'vitest';
import { exposure, foreignShare, stockShare } from '../src/model/exposure';
import type { Holding } from '../src/model/types';

const h = (o: Partial<Holding> & { currency?: string; stocks?: number; abroad?: number }) => ({
  name: 'X', vendor: '', owner: '', type: 'Investment fund', value: 100, ...o,
  info: { currency: o.currency ?? 'ILS' },
  official: o.stocks == null ? undefined : [{ id: 1, w: 1, o: { stocksPct: o.stocks, foreignPct: o.abroad ?? null } }],
}) as unknown as Holding;

describe('exposure', () => {
  it('uses official data first, then the type and currency', () => {
    expect(stockShare(h({ stocks: 40 }))).toBeCloseTo(0.4);
    expect(stockShare(h({ type: 'Stocks' }))).toBe(1);
    expect(stockShare(h({ type: 'Cash' }))).toBe(0);
    expect(stockShare(h({ type: 'Brokerage' }))).toBeNull();
    expect(foreignShare(h({ stocks: 40, abroad: 30 }))).toBeCloseTo(0.3);
    expect(foreignShare(h({ type: 'Stocks', currency: 'USD' }))).toBe(1);
    expect(foreignShare(h({ type: 'Cash', currency: 'ILS' }))).toBe(0);
    expect(foreignShare(h({ type: 'Savings plan' }))).toBeNull();
  });
  it('adds up in money, with an unknown part', () => {
    const e = exposure([h({ stocks: 50, abroad: 20, value: 200 }), h({ type: 'Stocks', currency: 'USD', value: 100 }), h({ type: 'Brokerage', value: 100 }), h({ type: 'Cash', value: 0 })]);
    expect(e.stocks).toEqual({ yes: 200, no: 100, unknown: 100 });
    expect(e.foreign.yes).toBeCloseTo(140);
    expect(e.foreign.no).toBeCloseTo(160);
    expect(e.foreign.unknown).toBe(100);
  });
});
