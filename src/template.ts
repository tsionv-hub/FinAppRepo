// Builds the empty sheet template (.xlsx) with the tabs and headers of SPEC 14.2.
// Upload it to Google Drive and open it with Google Sheets.

type Val = string | number | { f: string } | null;

export const TEMPLATE_TABS: { name: string; rows: Val[][] }[] = [
  {
    name: 'Settings',
    rows: [
      ['key', 'value'],
      ['base_currency', 'ILS'],
      ['display_currency', 'ILS'],
      ['inflation_enabled', 0],
      ['inflation_rate_pct', 2.5],
      ['start_date', null],
      ['USD', { f: 'GOOGLEFINANCE("CURRENCY:USDILS")' }],
      ['EUR', { f: 'GOOGLEFINANCE("CURRENCY:EURILS")' }],
      ['monthly_saving_ILS', 0],
      ['yearly_free_cash_ILS', 0],
      ['yearly_intel_grant_USD', 0],
      ['capital_gains_tax_pct', 25],
      ['income_tax_pct', 47],
      ['intel_vest_years', 4],
      ['intel_vest_every_months', 6],
      ['birth_year', null],
      ['retirement_age', null],
      ['pre_retirement_allowance_ILS', 0],
      ['pension_start_age', 67],
      ['pension_deposit_growth_pct', 0],
      ['pension_exempt_pct', 67],
      ['pension_exempt_ceiling_ILS', 9430],
      ['pension_tax_rate_pct', 20],
      ['old_age_allowance_ILS', 0],
      ['return_factor_optimistic', 1],
      ['return_factor_moderate', 0.75],
      ['return_factor_pessimistic', 0.5],
    ],
  },
  {
    name: 'Holdings',
    rows: [[
      'id', 'name', 'vendor', 'account_number', 'owner', 'type', 'investment_style', 'investment_track', 'currency',
      'current_amount', 'deposited_amount', 'return_5y_avg_pct', 'deposit_fee_pct', 'management_fee_pct', 'tax_type',
      'include_in_total', 'ticker', 'quantity', 'available_from', 'opened_date', 'last_updated', 'notes',
    ]],
  },
  {
    name: 'Pension',
    rows: [[
      'id', 'name', 'owner', 'current_amount_ILS', 'monthly_deposit_ILS', 'deposit_fee_pct', 'accumulation_fee_pct',
      'yearly_return_pct', 'conversion_coefficient', 'stops_at_early_retirement', 'notes',
    ]],
  },
  {
    name: 'Goals',
    rows: [
      ['id', 'name', 'target_amount_ILS', 'target_year', 'target_month', 'priority', 'notes', 'spend_when_due', 'type'],
      ['G1', 'Rainy day fund', 0, null, null, 1, 'Never spent', null, 'reserve'],
      ['G2', 'Early retirement', 0, null, null, 2, 'Year and amount come from Settings', null, 'retirement'],
    ],
  },
  { name: 'ToDo', rows: [['id', 'item', 'area', 'status', 'notes']] },
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
          if (typeof v === 'object') return `<c r="${ref}"><f>${xmlEsc(v.f)}</f></c>`;
          return `<c r="${ref}" t="inlineStr"><is><t>${xmlEsc(v)}</t></is></c>`;
        })
        .join('');
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

export function templateFiles(): { name: string; data: string }[] {
  const tabs = TEMPLATE_TABS;
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

export function templateXlsx(): Uint8Array {
  return zip(templateFiles());
}
