import { describe, expect, it } from 'vitest';
import { impliedReturn, nextDepositId, parseDate, parseDeposits } from '../src/model';

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
