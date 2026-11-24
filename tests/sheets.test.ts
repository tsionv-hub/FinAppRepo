import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseGoals, parseSettings } from '../src/model';
import { columnLetter, parseSheetId, a1 } from '../src/sheets/api';
import { goalRows, nextIds } from '../src/sheets/data';
import { crc32, TEMPLATE_TABS, templateXlsx } from '../src/template';
import { goalsRows } from './fixture';

describe('sheet id', () => {
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-xy';
  it('accepts URLs and bare ids', () => {
    expect(parseSheetId(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`)).toBe(id);
    expect(parseSheetId(`  ${id} `)).toBe(id);
    expect(parseSheetId('https://example.com/nope')).toBeNull();
    expect(parseSheetId('short')).toBeNull();
  });
});

describe('A1 helpers', () => {
  it('column letters', () => {
    expect([0, 2, 25, 26, 27, 51, 52].map(columnLetter)).toEqual(['A', 'C', 'Z', 'AA', 'AB', 'AZ', 'BA']);
  });
  it('quotes tab names', () => {
    expect(a1('Goals', 'C5')).toBe("'Goals'!C5");
    expect(a1("Bob's")).toBe("'Bob''s'");
  });
});

describe('goal writes', () => {
  it('follow the header order and continue ids', () => {
    const gt = parseGoals(goalsRows, 2026);
    expect(nextIds(gt.ids, 2)).toEqual(['G7', 'G8']);
    const shuffled = [['name', 'type', 'id', 'spend_when_due', 'target_month', 'target_year', 'target_amount_ILS', 'notes', 'priority'], ...goalsRows.slice(1)];
    const gs = parseGoals(shuffled.map((r, i) => (i === 0 ? r : [r[1], r[8], r[0], r[7], r[4], r[3], r[2], r[6], r[5]])), 2026);
    const rows = goalRows(gs, [{ name: 'Boat', amount: 5000, year: 2030, month: 4, spend: false, retirement: false }]);
    expect(rows[0]).toEqual(['Boat', '', 'G7', 0, 4, 2030, 5000, 'Added in app', 7]);
  });
});

describe('settings rows', () => {
  it('remembers the row of each key for writing back', () => {
    const s = parseSettings([['key', 'value'], ['retirement_age', 55], ['pre_retirement_allowance_ILS', 1]]);
    expect(s.rows.retirement_age).toBe(2);
    expect(s.rows.pre_retirement_allowance_ILS).toBe(3);
  });
});

describe('template', () => {
  it('crc32 matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('is a valid zip with all tabs (checked with python zipfile when available)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tpl-'));
    const f = join(dir, 't.xlsx');
    writeFileSync(f, templateXlsx());
    let out = '';
    try {
      out = execFileSync('python3', ['-I', '-c', 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(z.read("xl/workbook.xml").decode())', f]).toString();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return; // no python
      throw e;
    }
    for (const t of TEMPLATE_TABS) expect(out).toContain(`name="${t.name}"`);
  });
});

import { validate } from '../src/sheets/validate';
import { goalName, setLang } from '../src/ui/i18n';
import { goalsRows as GR, holdingsRows, settingsRows } from './fixture';
import { parseHoldings, parsePension } from '../src/model';

describe('sheet check (SPEC 2.3)', () => {
  it('passes the fixture, Pension optional', () => {
    const tabs = ['Settings', 'Holdings', 'Goals'];
    const c = validate(tabs, { Settings: settingsRows, Holdings: holdingsRows, Goals: GR });
    expect(c.ok).toBe(true);
    expect(c.items.find((i) => i.name === 'Pension')).toMatchObject({ found: false, required: false });
  });

  it('flags missing required tabs and columns, warns on optional ones', () => {
    const goals = [GR[0].filter((h) => h !== 'target_year' && h !== 'target_month')];
    const c = validate(['Settings', 'Goals'], { Settings: [['USD', 3]], Goals: goals });
    expect(c.ok).toBe(false);
    const miss = c.items.filter((i) => !i.found).map((i) => `${i.kind}:${i.name}:${i.required}`);
    expect(miss).toContain('tab:Holdings:true');
    expect(miss).toContain('column:target_year:true');
    expect(miss).toContain('column:target_month:false');
    expect(miss).toContain('key:income_tax_pct:true');
  });
});

describe('template content (SPEC 3.6)', () => {
  const rows = (name: string) => TEMPLATE_TABS.find((t) => t.name === name)!.rows.map((r) => r.map((v) => (v && typeof v === 'object' ? 0 : v)));
  it('passes the app’s own sheet check and parses', () => {
    const tabs = TEMPLATE_TABS.map((t) => t.name);
    expect(validate(tabs, Object.fromEntries(tabs.map((t) => [t, rows(t)]))).ok).toBe(true);
    const s = parseSettings(rows('Settings'));
    expect(s.incomeTaxPct).toBe(50);
    expect(s.capitalGainsTaxPct).toBe(25);
    const H = parseHoldings(rows('Holdings'), { ILS: 1, USD: 3.7 });
    const types = new Set(H.map((h) => h.type));
    for (const ty of ['Study fund', 'Investment fund', 'Savings plan', 'Brokerage', 'Cash', 'Stocks', 'Stocks (unvested)']) expect(types.has(ty)).toBe(true);
    expect(parsePension(rows('Pension'))).toHaveLength(1);
    const g = parseGoals(rows('Goals'), 2026);
    expect(g.reserveRow).toBe(2);
  });
  it('stock rows take their value from GOOGLEFINANCE', () => {
    const h = TEMPLATE_TABS.find((t) => t.name === 'Holdings')!.rows;
    const ci = (h[0] as string[]).indexOf('current_amount');
    const stock = h.find((r) => r[5] === 'Stocks')!;
    expect(stock[ci]).toEqual({ f: expect.stringContaining('GOOGLEFINANCE(Q') });
  });
});

describe('Hebrew goal names (SPEC 6.6)', () => {
  it('translates names and words, leaves unknown words', () => {
    setLang('he');
    expect(goalName("Noa's wedding")).toBe('החתונה של נועה');
    expect(goalName("Zork's wedding")).toBe('החתונה של Zork');
    expect(goalName('New car')).toBe('רכב חדש');
    expect(goalName('Family vacation')).toBe('חופשה משפחתית');
    expect(goalName("Noa's bat mitzvah")).toBe('בת המצווה של נועה');
    expect(goalName('טיול שנתי')).toBe('טיול שנתי');
    expect(goalName('Rainy day fund')).toBe('קרן ליום סגריר');
    expect(goalName('Apartment down payment')).toBe('מקדמה לדירה');
    setLang('en');
    expect(goalName('New car')).toBe('New car');
  });
});
