import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { accountKey, parseDelta, type TextItem } from '../src/import/delta';
import { monthEnd, planImport, trackCell } from '../src/import/proposals';

// Made-up report in the real layout (see tests/fixtures/delta-items.json).
const fx = JSON.parse(readFileSync(new URL('./fixtures/delta-items.json', import.meta.url), 'utf8')) as { pages: TextItem[][] };

describe('Delta report parser', () => {
  const r = parseDelta(fx.pages);
  const by = (acc: string) => r.products.find((p) => accountKey(p.account) === accountKey(acc))!;

  it('finds every product on the summary page, joined with its detail page', () => {
    expect(r.produced).toBe('28/11/2026');
    expect(r.products.map((p) => p.account)).toEqual(['55501234-2', '55501234-3', '7712345', '570-911-400001-0']);
  });

  it('reads a detail page: balance, date, fees, deposits, company and tracks', () => {
    const p = by('7712345');
    expect(p).toMatchObject({ type: 'קופת גמל להשקעה', company: 'קופות גמל More', status: 'פעיל', balance: 38302, asOf: '10/2026', depositFeePct: 0, balanceFeePct: 0.45, depositsThisYear: 38163 });
    expect(p.tracks).toEqual([{ name: 'להשקעה - מניות סחיר', amount: 38302, stocksPct: 97.43, fxPct: 21.46, abroadPct: 68.42, number: '15256', ytd: 14.14, ret12m: 17.98 }]);
  });

  it('joins a two-track product: amounts and exposure from the summary, track numbers and returns from the detail', () => {
    const p = by('55501234-2');
    expect(p).toMatchObject({ balance: 763413, depositFeePct: 1.8, balanceFeePct: 0.1 });
    expect(p.tracks.map((t) => [t.number, t.name, t.amount, t.stocksPct, t.ret3y])).toEqual([
      ['15263', 'מניות סחיר', 478886, 70.19, undefined],
      ['13909', 'לבני 50 ומטה', 284527, 61.82, 16.3],
    ]);
  });

  it('a product only on the summary page: account number split over two lines, status and balance', () => {
    expect(by('570-911-400001-0')).toMatchObject({ account: '570-911-400001-0', status: 'לא פעיל', balance: 52956, depositFeePct: null });
  });

  it('reads the same from the PDF itself (pdf.js), not only from the extracted text', async () => {
    const doc = await getDocument({ data: new Uint8Array(readFileSync(new URL('./fixtures/delta-fake.pdf', import.meta.url))), isEvalSupported: false }).promise;
    const pages: TextItem[][] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const tc = await (await doc.getPage(n)).getTextContent();
      pages.push(tc.items.flatMap((i) => ('str' in i && i.str.trim() ? [{ s: i.str, x: i.transform[4], y: i.transform[5] }] : [])));
    }
    const fromPdf = parseDelta(pages);
    expect(fromPdf.produced).toBe('28/11/2026');
    expect(fromPdf.products).toEqual(r.products);
  });
});

describe('import proposals', () => {
  const r = parseDelta(fx.pages);
  const H = ['id', 'name', 'account_number', 'currency', 'current_amount', 'deposit_fee_pct', 'management_fee_pct', 'fund_number', 'last_updated'];
  const P = ['id', 'name', 'account_number', 'fund_number', 'current_amount_ILS', 'deposit_fee_pct', 'accumulation_fee_pct'];
  const holdings = { header: H, rows: [H, ['H1', 'GL.MOR...2345', '7712345', 'ILS', 37000, 0, 0.45, '15256', ''], ['H2', 'GL.PNX...0001', '570911400001-0', 'ILS', 52956, 0, 0.6, '7908', '2026-01-01'], ['H3', 'Cash', '', 'ILS', 1000, '', '', '', '']] };
  const pension = { header: P, rows: [P, ['P1', 'PN.MOR', '55501234-2', '(15263,60%),(13909,40%)', 700000, 1.8, 0.1]] };
  const plan = planImport(r, holdings, pension);

  it('matches by account number (digits only) and proposes only what changed', () => {
    expect(plan.matched.map((m) => [m.tab, m.row, m.name])).toEqual([['Pension', 2, 'PN.MOR'], ['Holdings', 2, 'GL.MOR...2345'], ['Holdings', 3, 'GL.PNX...0001']]);
    expect(plan.proposals.map((p) => [p.tab, p.row, p.field, p.old, p.value])).toEqual([
      ['Pension', 2, 'current_amount_ILS', 700000, 763413],
      ['Pension', 2, 'fund_number', '(15263,60%),(13909,40%)', '(15263,63%),(13909,37%)'],
      ['Holdings', 2, 'current_amount', 37000, 38302],
      ['Holdings', 2, 'last_updated', '', '2026-10-31'],
    ]);
  });

  it('lists products with money that are in neither tab', () => {
    expect(plan.unmatched.map((p) => p.account)).toEqual(['55501234-3']);
  });

  it('lists the sheet rows the report had nothing on', () => {
    expect(plan.missing).toEqual([{ tab: 'Holdings', row: 4, name: 'Cash' }]);
  });

  it('two reports read together: each fund once, from whichever report has it', () => {
    const both = parseDelta([...fx.pages, ...fx.pages]);
    expect(both.products).toEqual(r.products);
  });

  it('track shares add up to 100; a missing track number means no proposal', () => {
    expect(trackCell({ tracks: [{ number: '1', name: 'a', amount: 1 }, { number: '2', name: 'b', amount: 1 }, { number: '3', name: 'c', amount: 1 }] } as never)).toBe('(1,34%),(2,33%),(3,33%)');
    expect(trackCell({ tracks: [{ name: 'a', amount: 5 }] } as never)).toBeNull();
    expect(monthEnd('02/2028')).toBe('2028-02-29');
  });

  it('a fee dropping to 0% and an insurance track number start unticked', () => {
    const r2 = { produced: null, products: [{ account: '12345678', type: 'חיים משולב חסכון', company: '', status: '', balance: 1000, asOf: '10/2026', depositFeePct: 0, balanceFeePct: 0, depositsThisYear: null, tracks: [{ number: '76', name: 'מניות', amount: 1000 }] }] };
    const h = { header: H, rows: [H, ['H9', 'SP', '12345678', 'ILS', 1000, 0, 0.9, '15463', '']] };
    const p = planImport(r2, h, { header: P, rows: [P] }).proposals;
    expect(p.map((x) => [x.field, x.doubt])).toEqual([['management_fee_pct', 'zeroFee'], ['fund_number', 'insTrack']]);
  });
});
