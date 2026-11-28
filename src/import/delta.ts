// Reads a Delta ("דלתא – בית לתכנון פיננסי") periodic report from the text of its PDF
// pages (SPEC v1.28). Pure: takes positioned text items, so it runs in tests without a PDF.
//
// The report has two kinds of pages we use:
// - "ריכוז מוצרים" (summary): one block per product (account number, status, balance, date)
//   followed by its tracks with the amount in each and their stock / foreign currency / abroad exposure.
// - "פירוט מוצר" (detail): one product per page, label / value pairs (account number, as-of date,
//   balance, fees, deposits this year, status) and a table of its tracks with their official
//   track number and returns.
// Both are joined by account number.

/** One piece of text on a page: its string and the position of its bottom-left corner, in points. */
export interface TextItem {
  s: string;
  x: number;
  y: number;
}

export interface DeltaTrack {
  /** Official track number (מסלול באוצר), from the detail page. */
  number?: string;
  name: string;
  /** ILS in this track, from the summary page. */
  amount?: number;
  stocksPct?: number;
  fxPct?: number;
  abroadPct?: number;
  ret5y?: number;
  ret3y?: number;
  ret12m?: number;
  ytd?: number;
}

export interface DeltaProduct {
  /** Account / policy number as printed (e.g. "570-911-400001-0"). */
  account: string;
  /** Product type heading, e.g. "קרן פנסיה", "קופת גמל להשקעה". */
  type: string;
  company: string;
  status: string;
  balance: number | null;
  /** "MM/YYYY" the figures are correct to. */
  asOf: string | null;
  depositFeePct: number | null;
  balanceFeePct: number | null;
  depositsThisYear: number | null;
  tracks: DeltaTrack[];
}

export interface DeltaReport {
  /** "DD/MM/YYYY" the report was produced. */
  produced: string | null;
  products: DeltaProduct[];
}

const clean = (s: string) => s.replace(/[‎‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim();
const RE_PCT = /^-?\d+(?:\.\d+)?%$/;
const RE_MONEY = /^₪-?[\d,]+(?:\.\d+)?$/;
const RE_MONTH = /^\d{2}\/\d{4}$/;
const NOT_REPORTED = /^(\*?לא דווח\*?)$/;
const isValue = (s: string) => RE_PCT.test(s) || RE_MONTH.test(s) || NOT_REPORTED.test(s);

export const money = (s: string | undefined): number | null => (s && RE_MONEY.test(s) ? parseFloat(s.slice(1).replace(/,/g, '')) : null);
export const pct = (s: string | undefined): number | null => (s && RE_PCT.test(s) ? parseFloat(s) : null);
/** Digits only, without leading zeros: how account numbers are compared. */
export const accountKey = (s: string) => s.replace(/\D/g, '').replace(/^0+/, '');

/** Product type headings of the summary pages. */
const PRODUCT_TYPES = ['קרן פנסיה', 'קופת גמל להשקעה', 'קופת גמל', 'קרן השתלמות', 'ביטוח חיים וחסכון', 'חיים משולב חסכון', 'ביטוח מנהלים', 'פוליסת חיסכון', 'תיקי השקעות', 'השקעות אלטרנטיביות', 'גמל להשקעה'];

const STATUSES = ['לא פעיל', 'תום תקופה', 'מוקפא', 'פעיל', 'לא ידוע'];

/** Items of a page as rows (same height within `tol`), top to bottom; each row right to left. */
function rows(items: TextItem[], tol = 2.5): { y: number; items: TextItem[] }[] {
  const out: { y: number; items: TextItem[] }[] = [];
  for (const it of [...items].sort((a, b) => b.y - a.y)) {
    const r = out.find((x) => Math.abs(x.y - it.y) <= tol);
    if (r) r.items.push(it);
    else out.push({ y: it.y, items: [it] });
  }
  out.forEach((r) => r.items.sort((a, b) => b.x - a.x));
  return out;
}

function normalize(items: TextItem[]): TextItem[] {
  return items.map((i) => ({ ...i, s: clean(i.s) })).filter((i) => i.s);
}

/** Track names are compared without spaces, dashes or quotes ("להשקעה - מניות סחיר" = "להשקעה-מניות סחיר"). */
const nameKey = (s: string) => s.replace(/[\s\-–'"״׳]/g, '');

// ---------- summary pages ----------

interface SummaryProduct {
  account: string;
  type: string;
  status: string;
  balance: number | null;
  asOf: string | null;
  tracks: DeltaTrack[];
}

function parseSummary(items: TextItem[]): SummaryProduct[] {
  const out: SummaryProduct[] = [];
  let type = '';
  let cur: SummaryProduct | null = null;
  const rs = rows(items);
  for (const r of rs) {
    const texts = r.items.map((i) => i.s);
    // A product type heading: a lone known product name on the right.
    if (r.items.length === 1 && r.items[0].x > 300 && PRODUCT_TYPES.includes(texts[0])) {
      type = texts[0];
      continue;
    }
    const date = r.items.find((i) => RE_MONTH.test(i.s) && i.x < 70);
    const amounts = r.items.filter((i) => RE_MONEY.test(i.s));
    if (date && amounts.length) {
      // The account number can wrap onto the lines just above and below ("570-911-" / "400001-0").
      const acc = items
        .filter((i) => i.x > 360 && Math.abs(i.y - r.y) <= 10 && /^[\d-]{3,}$/.test(i.s) && /\d{3}/.test(i.s))
        .sort((a, b) => b.y - a.y)
        .map((i) => i.s)
        .join('');
      const status = STATUSES.find((st) => texts.includes(st)) ?? '';
      const bal = amounts.reduce((a, b) => (b.x < a.x ? b : a));
      cur = { account: acc, type, status, balance: money(bal.s), asOf: date.s, tracks: [] };
      if (acc) out.push(cur);
      continue;
    }
    // A track row: its amount in the "סכום" column, then three exposure percentages.
    const amt = r.items.find((i) => RE_MONEY.test(i.s) && i.x > 260 && i.x < 340);
    const ps = r.items.filter((i) => RE_PCT.test(i.s) && i.x < 270);
    if (cur && amt && ps.length >= 3) {
      const name = items
        .filter((i) => i.x > 330 && Math.abs(i.y - r.y) <= 6 && !isValue(i.s) && !RE_MONEY.test(i.s))
        .sort((a, b) => b.y - a.y || b.x - a.x)
        .map((i) => i.s)
        .join(' ');
      const [stocks, fx, abroad] = ps.map((i) => pct(i.s)!);
      cur.tracks.push({ name, amount: money(amt.s) ?? undefined, stocksPct: stocks, fxPct: fx, abroadPct: abroad });
    }
  }
  return out;
}

// ---------- detail pages ----------

interface DetailProduct {
  account: string;
  type: string;
  company: string;
  status: string;
  balance: number | null;
  asOf: string | null;
  depositFeePct: number | null;
  balanceFeePct: number | null;
  depositsThisYear: number | null;
  tracks: DeltaTrack[];
}

function parseDetail(items: TextItem[]): DetailProduct | null {
  const head = items.find((i) => i.s.startsWith('פירוט מוצר'));
  if (!head) return null;
  const type = clean(head.s.replace(/^פירוט מוצר\s*-?\s*/, ''));
  const labels = new Set(['מספר פוליסה', 'סטטוס', 'תאריך נכונות', 'סך צבירה']);
  // Right column: the value sits just under its label.
  const under = (label: string) => {
    const l = items.find((i) => i.s === label && i.x > 250);
    if (!l) return undefined;
    return items
      .filter((i) => i.x > 250 && i.y < l.y - 2 && i.y > l.y - 24 && !labels.has(i.s))
      .sort((a, b) => b.y - a.y)[0]?.s;
  };
  // Left column: the value is on the same line, further left.
  const beside = (label: string) => {
    const l = items.find((i) => i.s === label);
    if (!l) return undefined;
    return items.filter((i) => i.x < l.x - 15 && Math.abs(i.y - l.y) <= 4).sort((a, b) => a.x - b.x)[0]?.s;
  };
  // The managing company is the line right under the product heading on the right.
  const typeLine = items.find((i) => i.x > 250 && i.s === type && i !== head);
  // (A line mixing Hebrew and English can come as several pieces: join that whole line.)
  const first = typeLine ? items.filter((i) => i.x > 250 && i.y < typeLine.y - 2 && i.y > typeLine.y - 20).sort((a, b) => b.y - a.y)[0] : undefined;
  const company = first ? items.filter((i) => i.x > 250 && Math.abs(i.y - first.y) <= 2).sort((a, b) => b.x - a.x).map((i) => i.s).join(' ') : '';
  // Tracks: rows of the table under "מסלול באוצר", each starting with an official track number.
  const tableTop = items.find((i) => i.s.includes('מסלול באוצר'));
  const tableEnd = items.find((i) => i.s.startsWith('התפתחות מוצר'));
  const tracks: DeltaTrack[] = [];
  if (tableTop) {
    const nums = items.filter((i) => /^\d{2,6}$/.test(i.s) && i.x > 370 && i.y < tableTop.y && (!tableEnd || i.y > tableEnd.y));
    for (const n of nums.sort((a, b) => b.y - a.y)) {
      const near = items.filter((i) => i !== n && Math.abs(i.y - n.y) <= 6 && i.x < 400);
      const vals = near.filter((i) => Math.abs(i.y - n.y) <= 2.5 && isValue(i.s)).sort((a, b) => b.x - a.x);
      const name = near.filter((i) => !isValue(i.s) && i.x > 300).sort((a, b) => b.y - a.y || b.x - a.x).map((i) => i.s).join(' ');
      // Columns right to left: monthly, since January, 12 months, 3-year average, 5-year average, as-of.
      const v = vals.map((i) => i.s);
      const num = (k: number) => pct(v[k]) ?? undefined;
      tracks.push({ number: n.s, name, ytd: num(1), ret12m: num(2), ret3y: num(3), ret5y: num(4) });
    }
  }
  return {
    account: under('מספר פוליסה') ?? '',
    type,
    company,
    status: under('סטטוס') ?? '',
    balance: money(under('סך צבירה')),
    asOf: (() => {
      const v = under('תאריך נכונות');
      return v && RE_MONTH.test(v) ? v : null;
    })(),
    depositFeePct: pct(beside('דמי ניהול הפקדה')),
    balanceFeePct: pct(beside('דמי ניהול צבירה')),
    depositsThisYear: money(beside('הפקדות לחסכון השנה')),
    tracks,
  };
}

/** The whole report: every product found, with summary and detail joined by account number. */
export function parseDelta(pages: TextItem[][]): DeltaReport {
  const byKey = new Map<string, DeltaProduct>();
  let produced: string | null = null;
  for (const raw of pages) {
    const items = normalize(raw);
    if (!produced) {
      const line = rows(items).find((r) => r.items.some((i) => i.s.includes('הופק בתאריך')));
      produced = line?.items.map((i) => i.s).join(' ').match(/הופק בתאריך\s*(\d{2}\/\d{2}\/\d{4})/)?.[1] ?? line?.items.map((i) => i.s).join(' ').match(/\d{2}\/\d{2}\/\d{4}/)?.[0] ?? null;
    }
    // Summary pages (the first one titled "ריכוז מוצרים", the next ones not) have a "שם מסלול" column header.
    const detail = items.some((i) => i.s.startsWith('פירוט מוצר'));
    if (!detail && items.some((i) => i.s === 'שם מסלול') && items.some((i) => i.s === "מס' פוליסה")) {
      for (const s of parseSummary(items)) {
        const k = accountKey(s.account);
        const old = byKey.get(k);
        if (old) {
          old.tracks = mergeTracks(old.tracks, s.tracks);
          old.status ||= s.status;
          old.balance ??= s.balance;
          old.asOf ??= s.asOf;
          if (!old.type) old.type = s.type;
        } else {
          byKey.set(k, { account: s.account, type: s.type, company: '', status: s.status, balance: s.balance, asOf: s.asOf, depositFeePct: null, balanceFeePct: null, depositsThisYear: null, tracks: s.tracks });
        }
      }
    }
    const d = parseDetail(items);
    if (d && d.account) {
      const k = accountKey(d.account);
      const old = byKey.get(k);
      if (old) {
        // The detail page is the more precise source for everything it has.
        old.account = d.account;
        old.type = d.type || old.type;
        old.company = d.company || old.company;
        old.status = d.status || old.status;
        old.balance = d.balance ?? old.balance;
        old.asOf = d.asOf ?? old.asOf;
        old.depositFeePct = d.depositFeePct;
        old.balanceFeePct = d.balanceFeePct;
        old.depositsThisYear = d.depositsThisYear;
        old.tracks = mergeTracks(old.tracks, d.tracks);
      } else byKey.set(k, { ...d });
    }
  }
  return { produced, products: [...byKey.values()] };
}

/** Joins tracks of the same product from the two kinds of page, by name (or by order when names differ). */
function mergeTracks(a: DeltaTrack[], b: DeltaTrack[]): DeltaTrack[] {
  if (!a.length) return b;
  if (!b.length) return a;
  const out = a.map((t) => ({ ...t }));
  const used = new Set<number>();
  b.forEach((t, j) => {
    let i = out.findIndex((x, k) => !used.has(k) && nameKey(x.name) === nameKey(t.name));
    if (i < 0 && a.length === b.length) i = j;
    if (i < 0) {
      out.push({ ...t });
      return;
    }
    used.add(i);
    const x = out[i];
    for (const [k, v] of Object.entries(t)) if (v !== undefined && v !== '' && (x as unknown as Record<string, unknown>)[k] === undefined) (x as unknown as Record<string, unknown>)[k] = v;
    if (!x.name) x.name = t.name;
  });
  return out;
}
