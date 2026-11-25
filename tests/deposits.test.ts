import { describe, expect, it } from 'vitest';
import { groupOf, shortName, impliedReturn, nextDepositId, nextId, parseDate, parseDeposits, parseGrants, parseHoldings, type Holding } from '../src/model';
import { depositedAfter, grantRow } from '../src/sheets/data';

describe('deposits', () => {
  it('read dates in the usual sheet formats', () => {
    expect(parseDate('2022-02-14')).toBe('2022-02-14');
    expect(parseDate('14/2/2022')).toBe('2022-02-14');
    expect(parseDate('1.7.26')).toBe('2026-07-01');
    expect(parseDate(44606)).toBe('2022-02-14'); // spreadsheet serial
    expect(parseDate('soon')).toBeNull();
  });

  it('parse the Deposits tab by column name, sorted by date', () => {
    const rows = [
      ['deposit_id', 'holding_id', 'date', 'amount', 'currency', 'notes', 'holding_name'],
      ['D2', 'H3', '2023-05-10', '12,500', 'ILS', '', 'x'],
      ['D1', 'H3', '2022-02-14', 40000, 'ILS', 'first', 'x'],
      ['D3', '', '2024-01-01', 5, 'ILS', '', ''],
    ];
    const d = parseDeposits(rows);
    expect(d.map((x) => [x.id, x.date, x.amount, x.row])).toEqual([['D1', '2022-02-14', 40000, 3], ['D2', '2023-05-10', 12500, 2]]);
  });

  it('implied yearly return matches a known case', () => {
    // 100 two years ago, worth 121 now → 10%/year.
    const r = impliedReturn([{ date: '2024-11-25', amount: 100 }], 121, new Date('2026-11-25T00:00:00Z'));
    expect(r).toBeCloseTo(0.1, 2);
    // Several made-up deposits growing at exactly 8%/year → 8%/year back.
    const today = new Date('2026-11-25T00:00:00Z');
    const deps = [{ date: '2021-11-25', amount: 50000 }, { date: '2023-11-25', amount: 30000 }, { date: '2025-11-25', amount: 20000 }];
    const yrs = (d: string) => (today.getTime() - Date.parse(d + 'T00:00:00Z')) / 86400000 / 365.25;
    const value = deps.reduce((a, d) => a + d.amount * Math.pow(1.08, yrs(d.date)), 0);
    expect(impliedReturn(deps, value, today)).toBeCloseTo(0.08, 4);
  });

  it('gives no figure when it cannot be told', () => {
    const today = new Date('2026-11-25T00:00:00Z');
    expect(impliedReturn([], 100, today)).toBeNull();
    expect(impliedReturn([{ date: '2026-11-01', amount: 100 }], 101, today)).toBeNull(); // under 2 months
  });

  it('continues deposit ids', () => {
    expect(nextDepositId(['D1', 'D15', 'X'])).toBe('D16');
    expect(nextDepositId([])).toBe('D1');
  });
});

describe('holding groups and grants', () => {
  it('uses the group column, else the type', () => {
    expect(groupOf('bank', 'Investment fund')).toBe('bank');
    expect(groupOf(' Study Fund ', 'Cash')).toBe('study_fund');
    expect(groupOf('', 'Study fund')).toBe('study_fund');
    expect(groupOf(null, 'Cash')).toBe('bank');
    expect(groupOf('', 'Stocks (unvested)')).toBe('stocks');
    expect(groupOf('', 'Brokerage')).toBe('trading');
    expect(groupOf('nonsense', 'Savings plan')).toBe('fund');
  });
  it('reads group and fund_number from Holdings', () => {
    const H = parseHoldings([
      ['id', 'name', 'type', 'currency', 'current_amount', 'group', 'fund_number'],
      ['H1', 'A', 'Investment fund', 'ILS', 100, '', 512],
      ['H2', 'B', 'Cash', 'ILS', 50, 'bank', ''],
    ], { ILS: 1 });
    expect(H[0].group).toBe('fund');
    expect(H[0].info?.fundNumber).toBe('512');
    expect(H[1].group).toBe('bank');
    expect(H[2].synthetic && H[2].group).toBe('fund');
  });
  it('parses grants and makes the next row in column order', () => {
    const g = parseGrants([
      ['grant_id', 'holding_id', 'date', 'shares', 'notes'],
      ['GR2', 'H9', '15/3/2025', 300, ''],
      ['GR1', 'H9', 45000, 500, 'first'],
      ['', 'H9', '', 10, 'no date: skipped'],
    ]);
    expect(g.map((x) => x.id)).toEqual(['GR1', 'GR2']);
    expect(g[1].date).toBe('2025-03-15');
    const h = { id: 'H9', name: 'X' } as Holding;
    expect(grantRow(['notes', 'grant_id', 'holding_id', 'date', 'shares', 'other'], g, h, { date: '2026-01-02', shares: 40, notes: 'n' }))
      .toEqual(['n', 'GR3', 'H9', '2026-01-02', 40, '']);
    expect(nextId('GR', [])).toBe('GR1');
  });
});

describe('deposited_amount after a deposit', () => {
  it('adds to a typed number, fills a blank, and leaves a formula alone', () => {
    expect(depositedAfter(40000, 60000, 1000)).toBe(41000);
    expect(depositedAfter('40,000', 60000, 1000)).toBe(41000);
    expect(depositedAfter('', 60000, 1000)).toBe(61000);
    expect(depositedAfter(undefined, 60000, 1000)).toBe(61000);
    expect(depositedAfter('=SUMIFS(Deposits!D:D,Deposits!B:B,A2)', 60000, 1000)).toBeNull();
  });
});

describe('short names for charts', () => {
  const h = (o: Partial<Holding> & { short?: string }) => ({ name: '', vendor: '', owner: '', ...o, info: { short: o.short ?? '' } }) as unknown as Holding;
  it('uses short_name, else vendor short form plus the digits in the name, else the owner', () => {
    expect(shortName(h({ short: 'My fund', vendor: 'Migdal' }))).toBe('My fund');
    expect(shortName(h({ vendor: 'Migdal', name: 'Savings plan ...1234' }))).toBe('MG 1234');
    expect(shortName(h({ vendor: 'Hachshara', name: 'Policy', owner: 'dana' }))).toBe('HAC D');
    expect(shortName(h({ vendor: 'הפניקס', name: 'קרן 98765' }))).toBe('PHX 8765');
    expect(shortName(h({ vendor: 'Some Bank', name: 'X' }))).toBe('SOM');
  });
});
