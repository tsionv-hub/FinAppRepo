import { describe, expect, it } from 'vitest';
import { defaultTax, holdingWrites, moveFormula, toCell } from '../src/sheets/edit';

const header = ['id', 'name', 'type', 'currency', 'current_amount', 'deposited_amount', 'tax_type', 'last_updated', 'value_ILS'];

describe('editing holdings', () => {
  it('turns form values into cells', () => {
    expect(toCell('num', '1,234.5')).toBe(1234.5);
    expect(toCell('num', '')).toBe('');
    expect(toCell('bool', '1')).toBe(1);
    expect(toCell('bool', '0')).toBe(0);
    expect(toCell('text', ' Fund A ')).toBe('Fund A');
    expect(toCell('text', '=HACK()')).toBe("'=HACK()"); // typed text never becomes a formula
  });

  it('moves same-row references when a formula is copied to another row', () => {
    expect(moveFormula('=R17*GOOGLEFINANCE(Q17,"price")', 17, 22)).toBe('=R22*GOOGLEFINANCE(Q22,"price")');
    expect(moveFormula('=IF(COUNTIF(Deposits!$B$2:$B,A17)=0,"",SUMIFS(Deposits!$D$2:$D,Deposits!$B$2:$B,A17))', 17, 22))
      .toBe('=IF(COUNTIF(Deposits!$B$2:$B,A22)=0,"",SUMIFS(Deposits!$D$2:$D,Deposits!$B$2:$B,A22))');
    expect(moveFormula('=J17*$B$170+K170', 17, 22)).toBe('=J22*$B$170+K170'); // only this row's references move
  });

  it('edits only the cells in the form, never a formula cell', () => {
    const w = holdingWrites(header, { name: 'Fund B', current_amount: '5000', deposited_amount: '4000' }, 4, ['H3', 'Fund', 'Brokerage', 'ILS', 4500, '=SUM(X)', '', '', '=E4*1'], { stamp: true });
    expect(w).toEqual([
      { range: "'Holdings'!B4", values: [['Fund B']] },
      { range: "'Holdings'!E4", values: [[5000]] },
      { range: "'Holdings'!H4", values: [[expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)]] },
    ]);
  });

  it("adds a row: new id, typed values, and the sheet's formulas copied down into empty cells", () => {
    const w = holdingWrites(
      header,
      { name: 'New', type: 'Investment fund', currency: 'ILS', current_amount: '100', tax_type: defaultTax('Investment fund') },
      10,
      ['', '', '', '', '', '', '', '', '=E10*1'], // the next row already has the value formula
      { newId: 'H9', template: ['H8', 'Old', 'Cash', 'ILS', 50, '=SUMIFS(D:D,B:B,A9)', 'none', '2026-01-01', '=E9*1'], templateRow: 9, stamp: true },
    );
    const m = Object.fromEntries(w.map((x) => [x.range.replace("'Holdings'!", ''), x.values[0][0]]));
    expect(m).toMatchObject({ A10: 'H9', B10: 'New', C10: 'Investment fund', E10: 100, F10: '=SUMIFS(D:D,B:B,A10)', G10: 'capital_gain' });
    expect(m.I10).toBeUndefined(); // already a formula there: left alone
    expect(defaultTax('Study fund')).toBe('none');
    expect(defaultTax('Stocks (unvested)')).toBe('income');
  });
});
