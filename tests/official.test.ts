import { describe, expect, it } from 'vitest';
import { applyOfficial, costParts, costTotal, dbFor, fetchOfficial, fundIds, fundTracks, latest, shares } from '../src/official/gov';
import { parseHoldings, parsePension } from '../src/model';

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
    expect(H[0].official).toEqual([{ id: 111, w: 1, o: null }]);
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

describe('fund numbers with shares, and expected yearly cost', () => {
  it('reads "(id,share%)" lists, and the older forms', () => {
    expect(fundTracks('(101,25%),(202,75%)')).toEqual([{ id: 101, w: 0.25 }, { id: 202, w: 0.75 }]);
    expect(fundTracks('( 101 , 25 ) , ( 202 , 75% )')).toEqual([{ id: 101, w: 0.25 }, { id: 202, w: 0.75 }]);
    expect(fundTracks('(101,1),(202,3)')).toEqual([{ id: 101, w: 0.25 }, { id: 202, w: 0.75 }]); // scaled to 100%
    expect(fundTracks('101, 202')).toEqual([{ id: 101, w: 0.5 }, { id: 202, w: 0.5 }]);
    expect(fundTracks(3456)).toEqual([{ id: 3456, w: 1 }]);
    expect(fundIds('(101,25%),(202,75%)')).toEqual([101, 202]);
    expect(shares('')).toEqual([]);
  });
  it('reads expected yearly cost: one value, per fund, or unknown', () => {
    expect(costTotal('0.94')).toBe(0.94);
    expect(costTotal(0.718)).toBe(0.718);
    expect(costTotal('(0.4,25%),(0.8,75%)')).toBeCloseTo(0.7, 10);
    expect(costTotal('?')).toBeNull();
    expect(costTotal('(0.4,25%),(?,75%)')).toBeNull();
    expect(costTotal('')).toBeNull();
    expect(costParts('(0.4,25%),(?,75%)')).toEqual([{ v: 0.4, w: 0.25 }, { v: null, w: 0.75 }]);
  });
  it('weights the official return by each fund\'s share, for holdings and pension funds', () => {
    const H = parseHoldings([
      ['id', 'name', 'type', 'currency', 'current_amount', 'return_5y_avg_pct', 'fund_number'],
      ['H1', 'Policy', 'Savings plan', 'ILS', 1000, 5, '(222,25%),(333,75%)'],
    ], { ILS: 1 });
    const P = parsePension([
      ['name', 'current_amount_ILS', 'yearly_return_pct', 'fund_number', 'expected_yearly_cost'],
      ['Fund', 1000, 4, '(444,40%),(555,60%)', '(0.3,40%),(0.5,60%)'],
    ]);
    const map = new Map([
      ['bituach:222', latest('bituach', [rec(222, 202610, 12)]).get(222)!],
      ['gemel:333', latest('gemel', [rec(333, 202610, 8)]).get(333)!],
      ['pensia:444', latest('pensia', [rec(444, 202610, 10)]).get(444)!],
    ]);
    applyOfficial(H, map, P);
    expect(H[0].ret).toBeCloseTo(0.25 * 12 + 0.75 * 8, 10);
    expect(P[0].returnPct).toBeCloseTo(0.4 * 10 + 0.6 * 4, 10); // 555 not found: the sheet's 4
    expect(P[0].returnSheet).toBe(4);
    expect(costTotal(P[0].expectedCost)).toBeCloseTo(0.42, 10);
    applyOfficial(H, new Map(), P);
    expect(P[0].returnPct).toBe(4);
  });
});
