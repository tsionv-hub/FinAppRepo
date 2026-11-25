import { describe, expect, it } from 'vitest';
import { applyOfficial, dbFor, fetchOfficial, fundIds, latest } from '../src/official/gov';
import { parseHoldings } from '../src/model';

// Made-up fund numbers and figures.
const rec = (id: number, period: number, avg5: number | null, extra: Record<string, unknown> = {}) => ({
  FUND_ID: id, FUND_NAME: 'Fund  ' + id, REPORT_PERIOD: period, AVG_ANNUAL_YIELD_TRAILING_5YRS: avg5, AVG_ANNUAL_YIELD_TRAILING_3YRS: 9,
  YEAR_TO_DATE_YIELD: 4, AVG_ANNUAL_MANAGEMENT_FEE: 0.6, TOTAL_ASSETS: 200, STOCK_MARKET_EXPOSURE: 150, FOREIGN_EXPOSURE: 50, ...extra,
});
const holdings = () => parseHoldings([
  ['id', 'name', 'type', 'currency', 'current_amount', 'return_5y_avg_pct', 'fund_number', 'group'],
  ['H1', 'Fund A', 'Investment fund', 'ILS', 100000, 6, '111', ''],
  ['H2', 'Policy B', 'Savings plan', 'ILS', 50000, 5, '222, 333', ''],
  ['H3', 'Bank', 'Cash', 'ILS', 10000, 0, '444', ''],
  ['H4', 'Fund C', 'Investment fund', 'ILS', 20000, 7, '', ''],
], { ILS: 1 });

describe('official fund data', () => {
  it('splits fund numbers and picks the database', () => {
    expect(fundIds('101, 202')).toEqual([101, 202]);
    expect(fundIds(' 3456 ')).toEqual([3456]);
    expect(fundIds('')).toEqual([]);
    const H = holdings();
    expect(dbFor(H[0])).toBe('gemel');
    expect(dbFor(H[1])).toBe('bituach');
  });
  it('keeps the latest month per fund and turns exposures into percent', () => {
    const m = latest('gemel', [rec(111, 202609, 7), rec(111, 202610, 8), rec(222, 202608, 5)]);
    expect(m.get(111)!.avg5).toBe(8);
    expect(m.get(111)!.period).toBe(202610);
    expect(m.get(111)!.stocksPct).toBe(75);
    expect(m.get(111)!.name).toBe('Fund 111');
  });
  it('uses the official 5-year average, split evenly; the sheet return fills gaps', () => {
    const H = holdings();
    const map = new Map([
      ['gemel:111', latest('gemel', [rec(111, 202610, 8)]).get(111)!],
      ['bituach:222', latest('bituach', [rec(222, 202610, 10)]).get(222)!],
      ['bituach:333', latest('bituach', [rec(333, 202610, null)]).get(333)!],
    ]);
    applyOfficial(H, map);
    expect(H[0].ret).toBe(8);
    expect(H[0].retSheet).toBe(6);
    expect(H[1].ret).toBe((10 + 5) / 2); // 333 has no 5-year figure: the sheet's 5
    expect(H[2].official).toBeUndefined(); // bank: never looked up
    expect(H[3].official).toBeUndefined(); // no fund number
    const re = H.find((h) => h.synthetic)!;
    expect(re.ret).toBeCloseTo((100000 * 8 + 50000 * 7.5 + 20000 * 7) / 170000, 6);
    applyOfficial(H, new Map()); // again, with nothing found: back to the sheet
    expect(H[0].ret).toBe(6);
    expect(H[0].official).toEqual([{ id: 111, o: null }]);
  });
  it('asks each database only for its own fund numbers', async () => {
    const urls: string[] = [];
    const fake = (async (u: string) => {
      urls.push(u);
      const q = new URL(u).searchParams;
      const ids = JSON.parse(q.get('filters')!).FUND_ID as number[];
      // Bituach-Net knows 222 only; 333 is another company's provident fund (Gemel-Net).
      const has = q.get('resource_id')!.startsWith('c6c6') ? ids.filter((id) => id === 222) : ids;
      return new Response(JSON.stringify({ success: true, result: { records: has.map((id) => rec(id, 202610, id === 333 ? 9 : 6)) } }));
    }) as typeof fetch;
    const H = holdings();
    const map = await fetchOfficial(H, fake);
    expect(urls.length).toBe(2);
    expect(JSON.parse(new URL(urls[0]).searchParams.get('filters')!)).toEqual({ FUND_ID: [222, 333] });
    expect(JSON.parse(new URL(urls[1]).searchParams.get('filters')!)).toEqual({ FUND_ID: [111, 333] });
    expect([...map.keys()].sort()).toEqual(['bituach:222', 'gemel:111', 'gemel:333']);
    applyOfficial(H, map);
    expect(H[1].official!.map((x) => x.o?.db)).toEqual(['bituach', 'gemel']);
    expect(H[1].ret).toBe((6 + 9) / 2);
  });
});
