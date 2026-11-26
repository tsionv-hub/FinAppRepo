// Builds the empty sheet template (.xlsx) with the tabs and headers of SPEC 14.2.
// Upload it to Google Drive and open it with Google Sheets.

/** A cell: text, number, empty, or a formula with an optional cached value (shown before Sheets recalculates). */
export type Val = string | number | { f: string; v?: number } | null;
export type Tab = { name: string; rows: Val[][] };

const HOLDINGS_HEAD = [
  'id', 'name', 'vendor', 'account_number', 'owner', 'type', 'investment_style', 'investment_track', 'currency',
  'current_amount', 'deposited_amount', 'return_5y_avg_pct', 'deposit_fee_pct', 'management_fee_pct', 'tax_type',
  'include_in_total', 'ticker', 'quantity', 'available_from', 'opened_date', 'last_updated', 'notes', 'group', 'fund_number', 'short_name', 'expected_yearly_cost',
];

/** One generic example row per holding type (SPEC 3.6). Stock values come from GOOGLEFINANCE in the sheet. */
function holdingRow(n: number, o: Record<string, Val>): Val[] {
  const row = n + 1;
  const v: Record<string, Val> = { id: 'H' + n, include_in_total: 1, ...o };
  if (o.ticker) v.current_amount = { f: `R${row}*GOOGLEFINANCE(Q${row},"price")` };
  return HOLDINGS_HEAD.map((h) => (h in v ? v[h] : null));
}

const EX = 'Example row: replace or delete. ';

export const TEMPLATE_TABS: Tab[] = [
  {
    name: 'Settings',
    rows: [
      ['key', 'value', 'notes'],
      ['base_currency', 'ILS', 'All amounts are converted to this'],
      ['display_currency', 'ILS', 'ILS, USD or EUR; bottom-line totals only'],
      ['inflation_enabled', 1, 'Not used by the app any more: it always starts in today’s money (inflation on)'],
      ['inflation_rate_pct', 2.5, 'Yearly inflation %'],
      ['start_date', null, 'Informational; the app starts from the current month'],
      ['USD', { f: 'GOOGLEFINANCE("CURRENCY:USDILS")' }, 'Live rate to ILS'],
      ['EUR', { f: 'GOOGLEFINANCE("CURRENCY:EURILS")' }, 'Live rate to ILS'],
      ['monthly_saving_ILS', 0, 'Added every month to your liquid holdings'],
      ['yearly_free_cash_ILS', 0, 'Added every January to capital-gain holdings'],
      ['yearly_intel_grant_USD', 0, 'Value of the yearly stock grant in USD (not shares)'],
      ['capital_gains_tax_pct', 25, 'Tax on gains when selling'],
      ['income_tax_pct', 50, 'Marginal rate, used for stock sales'],
      ['intel_vest_years', 4, 'Each grant vests over this many years'],
      ['intel_vest_every_months', 6, 'A tranche vests every N months'],
      ['birth_year', null, 'Needed for retirement and pension'],
      ['retirement_age', 60, 'Early retirement age (blank = 60)'],
      ['pre_retirement_allowance_ILS', 0, 'Monthly amount from retirement until pension'],
      ['pension_start_age', 67, 'Age the pension starts'],
      ['pension_deposit_growth_pct', 0, 'Yearly growth of pension deposits'],
      ['pension_exempt_pct', 67, 'Exempt share of the pension'],
      ['pension_exempt_ceiling_ILS', 9430, 'Monthly ceiling for the exemption, per person'],
      ['pension_tax_credit_points', 2.25, 'Income tax credit points per person for the pension tax (2.25 resident, 2.75 for a woman; more for children etc.)'],
      ['old_age_allowance_ILS', 0, 'Optional monthly old-age allowance'],
      ['return_factor_optimistic', 1, 'Multiplies every 5-year return'],
      ['return_factor_moderate', 0.75, 'Default scenario'],
      ['return_factor_pessimistic', 0.5, ''],
    ],
  },
  {
    name: 'Holdings',
    rows: [
      HOLDINGS_HEAD,
      holdingRow(1, { name: 'Study fund A', vendor: 'Provider', owner: 'Person 1', type: 'Study fund', currency: 'ILS', current_amount: 100000, deposited_amount: 80000, return_5y_avg_pct: 7, tax_type: 'none', group: 'study_fund', fund_number: 1001, notes: EX + 'group (app panel section): study_fund, fund, trading, bank, stocks; blank = from type. fund_number: the fund\'s number, for study funds and funds. short_name: optional chart label. Several funds in one holding: fund_number (1001,40%),(1002,60%) and expected_yearly_cost in the same form, e.g. (0.8,40%),(0.7,60%); ? = not known yet. type: Study fund, Investment fund, Savings plan, Brokerage, Cash, Stocks, Stocks (unvested). tax_type: none, capital_gain, income. include_in_total: 1 or 0. Pension goes in the Pension tab.' }),
      holdingRow(2, { name: 'Investment fund A', vendor: 'Provider', owner: 'Person 1', type: 'Investment fund', currency: 'ILS', current_amount: 50000, deposited_amount: 40000, return_5y_avg_pct: 6, tax_type: 'capital_gain', group: 'fund', fund_number: 1002, notes: EX }),
      holdingRow(3, { name: 'Savings plan A', vendor: 'Provider', owner: 'Person 2', type: 'Savings plan', currency: 'ILS', current_amount: 30000, deposited_amount: 30000, return_5y_avg_pct: 4, tax_type: 'capital_gain', group: 'fund', fund_number: 1003, notes: EX }),
      holdingRow(4, { name: 'Brokerage A', vendor: 'Broker', owner: 'Person 2', type: 'Brokerage', currency: 'USD', current_amount: 10000, deposited_amount: 8000, return_5y_avg_pct: 9, tax_type: 'capital_gain', group: 'trading', notes: EX + 'Amounts are in the row’s currency.' }),
      holdingRow(5, { name: 'Checking', vendor: 'Bank', owner: 'Person 1', type: 'Cash', currency: 'ILS', current_amount: 20000, tax_type: 'none', group: 'bank', notes: EX + 'Blank return = 0.' }),
      holdingRow(6, { name: 'Company shares (vested)', owner: 'Person 1', type: 'Stocks', currency: 'USD', ticker: 'NASDAQ:INTC', quantity: 100, return_5y_avg_pct: 0, tax_type: 'income', group: 'stocks', notes: EX + 'current_amount = quantity × GOOGLEFINANCE price.' }),
      holdingRow(7, { name: 'Company shares (unvested)', owner: 'Person 1', type: 'Stocks (unvested)', currency: 'USD', ticker: 'NASDAQ:INTC', quantity: 200, return_5y_avg_pct: 0, tax_type: 'income', group: 'stocks', notes: EX + 'Never spendable until vested.' }),
    ],
  },
  {
    name: 'Pension',
    rows: [
      ['id', 'name', 'owner', 'current_amount_ILS', 'monthly_deposit_ILS', 'deposit_fee_pct', 'accumulation_fee_pct', 'yearly_return_pct', 'conversion_coefficient', 'stops_at_early_retirement', 'notes', 'fund_number', 'expected_yearly_cost'],
      ['P1', 'Pension fund A', 'Person 1', 300000, 3000, 1.5, 0.2, 5, 200, 1, EX + 'One row per fund. stops_at_early_retirement: 1 = deposits stop when you retire early. fund_number (optional): the fund\'s official number(s), like in Holdings; the official 5-year return then replaces yearly_return_pct.', null, null],
    ],
  },
  {
    name: 'Goals',
    rows: [
      ['id', 'name', 'target_amount_ILS', 'target_year', 'target_month', 'priority', 'notes', 'spend_when_due', 'type', 'repeat_every_years', 'repeat_until_year'],
      ['G1', 'Rainy day fund', 0, null, null, 1, 'type reserve: never spent; only the amount is used', null, 'reserve'],
      ['G2', 'Early retirement', 0, null, null, 2, 'type retirement: amount and date come from Settings', null, 'retirement'],
      ['G3', 'Car', 100000, 2030, 6, 3, EX + 'Due on the 1st of target_month (blank = January). spend_when_due: 1 = paid out.', 1, null],
      ['G4', 'Family vacation', 20000, 2027, 8, 4, EX + 'Recurring: repeats every repeat_every_years from target_year, until repeat_until_year (blank = to the end of the projection). The amount is per time.', 1, null, 1, null],
    ],
  },
  {
    name: 'Loans',
    rows: [
      ['id', 'name', 'owner', 'kind', 'balance_ILS', 'interest_rate_pct', 'monthly_payment_ILS', 'repay_year', 'repay_month', 'notes'],
      ['L1', 'Car loan', 'Person 1', 'installments', 40000, 4, 1200, null, null, EX + 'Optional tab. kind installments: balance_ILS = still owed today, paid monthly_payment_ILS each month until paid off.'],
      ['L2', 'Loan from family', 'Person 2', 'lump_sum', 50000, 0, null, 2029, 1, EX + 'kind lump_sum: the whole balance (plus interest) is repaid on the 1st of repay_month of repay_year.'],
    ],
  },
  {
    name: 'Deposits',
    rows: [
      ['deposit_id', 'holding_id', 'date', 'amount', 'currency', 'notes'],
      ['D1', 'H2', '2020-01-15', 25000, 'ILS', EX + 'Optional tab: one row per deposit into a fund or trading account. holding_id = the id in Holdings; amount in the holding\'s currency. The app shows them when you tap a holding, and can add new ones.'],
      ['D2', 'H2', '2023-06-01', 15000, 'ILS', EX],
    ],
  },
  {
    name: 'Grants',
    rows: [
      ['grant_id', 'holding_id', 'date', 'shares', 'notes'],
      ['GR1', 'H7', '2025-03-01', 200, EX + 'Optional tab: company share grants. holding_id = the unvested shares holding. Adding a grant in the app also adds the shares to that holding\'s quantity.'],
    ],
  },
  {
    name: 'ToDo',
    rows: [
      ['id', 'item', 'area', 'status', 'notes'],
      ['T1', 'Example task', 'General', 'open', EX + 'status: open, in progress, done. Not read by the app.'],
    ],
  },
];

const xmlEsc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function colName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function sheetXml(rows: Val[][]): string {
  const body = rows
    .map((r, ri) => {
      const cells = r
        .map((v, ci) => {
          const ref = colName(ci) + (ri + 1);
          if (v === null || v === '') return '';
          if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
          if (typeof v === 'object') return `<c r="${ref}"><f>${xmlEsc(v.f)}</f>${v.v != null ? `<v>${v.v}</v>` : ''}</c>`;
          return `<c r="${ref}" t="inlineStr"><is><t>${xmlEsc(v)}</t></is></c>`;
        })
        .join('');
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

export function workbookFiles(tabs: Tab[]): { name: string; data: string }[] {
  const files = [
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${tabs.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${tabs.map((t, i) => `<sheet name="${xmlEsc(t.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${tabs.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
    },
    ...tabs.map((t, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(t.rows) })),
  ];
  return files;
}

// ---- minimal zip (stored, no compression) ----

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zip(files: { name: string; data: string }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = enc.encode(f.data);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // stored
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cen.set(name, 46);
    parts.push(local, data);
    central.push(cen);
    offset += local.length + data.length;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
  let p = 0;
  for (const a of all) {
    out.set(a, p);
    p += a.length;
  }
  return out;
}

export function templateFiles(): { name: string; data: string }[] {
  return workbookFiles(TEMPLATE_TABS);
}

export function templateXlsx(): Uint8Array {
  return zip(templateFiles());
}
