// Main screen: loads the sheet, keeps what-if values from the inputs, renders
// every panel. Ported from the prototype's render(), freeMoney(), tmView(),
// nextView(), pensionView() and the save functions.

import {
  buildParams, freeAt, freeCurve, freeMoney, goalOrder, monthAt, projectPension, resolveGoals, retirementYear,
  simulate, startFromDate, stepOf, taxOf, today, type FreeMoney, type Goal, type Params, type Scenario, type SimResult,
  type GoalResult, type Holding, type Loan, type Slot, type Snapshot, type StartMonth, type WhatIf, loanMonths,
} from '../model';
import { SheetsClient, SheetsError } from '../sheets/api';
import { appendGoals, fromRows, loadSheet, MissingColumnError, saveReserve, saveRetirement, type LoadResult, type SheetData } from '../sheets/data';
import { exampleRows } from '../example';
import type { Checklist } from '../sheets/validate';
import { AuthError } from '../sheets/auth';
import { get, KEYS, set } from '../storage';
import { chartSvg } from './chart';
import { docsUrl } from '../docs';
import { getLang, goalName, locale, setLang, t, ty, type Lang } from './i18n';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const inp = (id: string) => $<HTMLInputElement>(id);
const N = (id: string) => parseFloat(inp(id).value) || 0;
const f = (v: number) => '⁦₪' + Math.round(v).toLocaleString('en-US') + '⁩';
const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface AppDeps {
  client: () => SheetsClient | null;
  /** Called when Google says the token is no longer valid. */
  onAuthError: () => void;
  /** Shows the sheet checklist (first run, or something required is missing). */
  onCheck: (c: Checklist, canOpen: boolean) => void;
  /** Shows the main screen. */
  onReady: () => void;
  /** True while exploring the built-in example (no Google calls, no saves). */
  demo: () => boolean;
}

let deps: AppDeps;
let start: StartMonth;
let data: SheetData | null = null;
let pending: Goal[] = [];
let listed: Goal[] = [];
let cache: { key: string; snaps: Snapshot[]; r: SimResult; free: [number, number][] | null; fm: FreeMoney; p: Params; goals: Goal[] } | null = null;
let pensionBalances: number[][] = [];
/** What each tappable row stands for, so a tap can open its details. */
let holdRows: Slot[] = [];
let goalRows: Goal[] = [];
let curK = 0;

// ---------- messages ----------

export function showMsg(text: string | null): void {
  const m = $('msg');
  m.hidden = !text;
  m.textContent = text ?? '';
}

export function errorText(e: unknown): string {
  if (e instanceof AuthError) return t('ePopup', { c: e.code });
  if (e instanceof MissingColumnError) return t('eCol', { c: e.columns.join(', '), t: e.tab });
  if (e instanceof SheetsError) {
    if (e.code === 'ratelimit') return t('eRate');
    if (/not supported for this document/i.test(e.message)) return t('eXlsx');
    if (e.code === 'auth') return t('eAuth');
    if (e.code === 'forbidden') return t('eForb');
    if (e.code === 'notfound') return t('eNF');
    if (e.code === 'network') return t('eNet', { c: navigator.onLine ? 'network' : 'offline' });
    return t('eNet', { c: e.status ? `${e.status} ${e.message}` : e.message });
  }
  return t('eNet', { c: String((e as Error)?.message ?? e) });
}

// ---------- language ----------

export function applyLang(l?: Lang): void {
  if (l) setLang(l);
  const lang = getLang();
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  document.title = t('title');
  $('lb').textContent = lang === 'he' ? 'English' : 'עברית';
  document.querySelectorAll<HTMLElement>('[data-t]').forEach((e) => (e.textContent = t(e.dataset.t as never)));
  document.querySelectorAll<HTMLInputElement>('[data-p]').forEach((e) => (e.placeholder = t(e.dataset.p as never)));
  const ms = $<HTMLSelectElement>('gmo');
  const cur = ms.value || '1';
  ms.innerHTML = '';
  for (let i = 1; i <= 12; i++) {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = new Date(2026, i - 1, 1).toLocaleDateString(locale(), { month: 'long' });
    ms.appendChild(o);
  }
  ms.value = cur;
  $('gm').textContent = '';
  updatedLine();
  if (data) render();
}

function updatedLine(): void {
  $('upd').textContent = data
    ? t('read') + ' ' + new Date(data.fetchedAt).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }) + ' · USD ' + data.settings.usd.toFixed(3)
    : '';
}

// ---------- loading ----------

function fillInputs(d: SheetData): void {
  const s = d.settings;
  const set = (id: string, v: number | null) => (inp(id).value = v == null ? '' : String(v));
  set('ms', s.monthlySaving);
  set('fc', s.yearlyFreeCash);
  set('gr', s.yearlyGrantUSD);
  set('ir', s.inflationRatePct);
  set('cg', s.capitalGainsTaxPct);
  set('it', s.incomeTaxPct);
  setInflation(s.inflationEnabled, false);
  set('ra', s.retirementAge);
  set('al', s.retirementAllowance);
  set('rd', d.goals.reserve);
  set('pg', s.pensionDepositGrowthPct);
  set('pt', s.pensionTaxRatePct);
  set('po', s.oldAgeAllowance);
}

export async function load(): Promise<void> {
  const demo = deps.demo();
  const c = deps.client();
  if (!c && !demo) return;
  showMsg(t('loading'));
  start = startFromDate(new Date());
  try {
    let res: LoadResult;
    if (demo) {
      const rows = exampleRows();
      res = fromRows('Example', Object.keys(rows), rows, start);
    } else res = await loadSheet(c!, start);
    showMsg(null);
    $('reload').hidden = false;
    if (!res.data) {
      deps.onCheck(res.check, false);
      return;
    }
    data = res.data;
    fillInputs(data);
    cache = null;
    updatedLine();
    if (!demo && !get(KEYS.checked)) deps.onCheck(res.check, true);
    else showApp();
  } catch (e) {
    if (e instanceof SheetsError && e.code === 'auth') {
      deps.onAuthError();
      return;
    }
    showMsg(errorText(e));
    $('reload').hidden = false;
  }
}

/** Opens the main screen once the sheet has been read (and checked on first run). */
export function showApp(): void {
  if (!data) return;
  if (!deps.demo()) set(KEYS.checked, '1');
  deps.onReady();
  render();
}

/** Drops loaded data (change sheet, sign out, forget). */
export function clearData(): void {
  data = null;
  cache = null;
  pending = [];
  updatedLine();
}

// ---------- model inputs ----------

function whatIf(): WhatIf {
  const ra = inp('ra').value.trim();
  return {
    scenario: $<HTMLSelectElement>('sc').value as Scenario,
    monthlySaving: N('ms'),
    yearlyFreeCash: N('fc'),
    yearlyGrantUSD: N('gr'),
    inflationOn: inflationOn(),
    inflationRatePct: N('ir'),
    capitalGainsTaxPct: N('cg'),
    incomeTaxPct: N('it'),
    countUnvested: inp('uv').checked,
    reserve: N('rd'),
    retirementAge: ra === '' ? null : parseFloat(ra),
    allowance: N('al'),
    pensionDepositGrowthPct: N('pg'),
    pensionTaxRatePct: N('pt'),
    oldAgeAllowance: N('po'),
  };
}

function allGoals(): Goal[] {
  return data ? [...data.goals.goals, ...pending] : [];
}

function model() {
  const d = data!;
  const w = whatIf();
  const goals = resolveGoals(allGoals(), { birthYear: d.settings.birthYear, retirementAge: w.retirementAge, pensionStartAge: d.settings.pensionStartAge, allowance: w.allowance }, start);
  const p = buildParams(d.settings, w, start, retirementYear(goals), d.loans);
  return { w, goals, p };
}

// ---------- render ----------

export function render(): void {
  if (!data) return;
  inflationBar();
  const d = data;
  const { w, goals, p } = model();
  const S = d.settings;
  $('scn').textContent = t('scf', { f: S.returnFactors[w.scenario] });
  $('rb').hidden = !d.goals.reserveRow;
  $('ri').textContent = S.birthYear != null ? t('ri', { b: S.birthYear, p: S.pensionStartAge }) : t('noBirth');

  const td = today(d.holdings, p);
  $('pre').textContent = f(td.preTax);
  $('post').textContent = f(td.postTax);
  const pe = d.pension.reduce((a, x) => a + x.balance, 0);
  $('tax').textContent = t('est') + ' ' + f(td.tax) + ' · ' + t('penl') + ' (' + f(pe) + ')';
  // Loans are not subtracted from the headline; "after debts" shows the net figure.
  const owed = d.loans.reduce((a, l) => a + l.balance, 0);
  $('debt').hidden = owed <= 0;
  $('debt').textContent = owed > 0 ? t('debtL') + ' ' + f(td.postTax - owed) : '';
  // display_currency: bottom-line totals only (SPEC 3.1).
  const dc = String(S.raw.display_currency ?? '').trim().toUpperCase();
  const rate = S.fx[dc];
  const sym: Record<string, string> = { USD: '$', EUR: '€' };
  $('dcur').textContent = dc && dc !== 'ILS' && rate
    ? t('dcur', { c: dc, a: '\u2066' + (sym[dc] ?? '') + Math.round(td.postTax / rate).toLocaleString('en-US') + '\u2069', b: '\u2066' + (sym[dc] ?? '') + Math.round(td.preTax / rate).toLocaleString('en-US') + '\u2069' })
    : '';

  const key = JSON.stringify([p, goals.map((g) => [g.name, g.amount, g.year, g.month, g.spend, g.retirement, g.endYear, g.monthly, g.everyYears, g.untilYear]), d.fetchedAt]);
  if (!cache || cache.key !== key) {
    const snaps: Snapshot[] = [];
    const r = simulate(d.holdings, goals, p, { snaps });
    cache = { key, snaps, r, free: null, fm: freeMoney(d.holdings, goals, p), p, goals };
    // The free-money curve is the slow part (SPEC 6.7): draw the panels first, add the line right after.
    const c = cache;
    setTimeout(() => {
      if (cache !== c) return;
      c.free = freeCurve(c.snaps, c.p, c.goals, c.r.end);
      tmView();
    }, 0);
  }
  freeView(cache.fm);
  nextView(cache.r);
  pensionView(w, cache.goals);
  tmView();
  // Use the cached goal objects: results point at them (the retirement goal is rebuilt each render).
  goalsView(cache.r, cache.goals, td.liquidPostTax, w.reserve);

  const bk = td.byType;
  const tt = Object.values(bk).reduce((a, x) => a + x, 0);
  $('bk').innerHTML = Object.keys(bk)
    .map((k) => `<div class="bk"><span>${esc(ty(k))}</span><span>${f(bk[k])} · ${Math.round((bk[k] / tt) * 100)}%</span></div>`)
    .join('');
}

function freeView(fm: FreeMoney): void {
  $('fm').textContent = f(fm.free);
  let s = t('freeN');
  const n = fm.note;
  if (n.kind === 'limited') s += ' ' + t('lim') + ' ' + goalName(n.goal.name) + ' (' + n.goal.year + ').';
  if (n.kind === 'allReserved') s = t('allRes');
  if (n.kind === 'impossible') s = t('none2');
  if (n.kind === 'saveMore') s = t('none1', { x: f(n.perMonth) });
  $('fn').textContent = s;

  const L = fm.liquid;
  let bar = '';
  let lg = '';
  const row = (c: string, name: string, v: number, note?: string) =>
    `<div class="lg"><span><b style="background:${c}"></b>${name}${note ? ` <span class="lbl">${note}</span>` : ''}</span><span>${f(v)}</span></div>`;
  const seg = (c: string, v: number) => {
    if (L > 0 && v > 0.5) bar += `<i style="width:${(v / L) * 100}%;background:${c}"></i>`;
  };
  if (whatIf().reserve > 0) {
    seg('var(--c-res)', fm.reserve);
    lg += row('var(--c-res)', esc(t('rdf')), fm.reserve);
  }
  if (data?.loans.length) {
    seg('var(--c-loan)', fm.loanSetAside);
    lg += row('var(--c-loan)', esc(t('lnRepL')), fm.loanSetAside, fm.loanSetAside > 0.5 ? '' : esc(t('cfs')));
  }
  if (fm.hasRetirement) {
    seg('var(--c-ret)', fm.retirementSetAside);
    lg += row('var(--c-ret)', esc(t('erg')), fm.retirementSetAside, fm.retirementSetAside > 0.5 ? '' : esc(t('cfs')));
  }
  if (fm.otherCount) {
    seg('var(--c-goal)', fm.otherSetAside);
    lg += row('var(--c-goal)', esc(t('ogl')) + ' (' + fm.otherCount + ')', fm.otherSetAside, fm.otherSetAside > 0.5 ? '' : esc(t('cfs')));
  }
  seg('var(--free)', fm.free);
  lg += row('var(--free)', esc(t('freeL')), fm.free);
  $('cm').innerHTML = bar;
  $('cl').innerHTML = lg;
}

function dateAt(k: number, month: 'short' | 'long' = 'short'): string {
  const m = monthAt(start, k);
  return new Date(m.year, m.month0, 1).toLocaleDateString(locale(), { month, year: 'numeric' });
}

function dur(k: number): string {
  const y = Math.floor(k / 12), m = k % 12, he = getLang() === 'he';
  return (y ? y + (he ? ' שנ׳ ' : 'y ') : '') + (m ? m + (he ? ' חו׳' : 'm') : '') || (he ? 'עכשיו' : 'now');
}

function nextView(r: SimResult): void {
  const it = r.res.slice().sort((a, b) => a.k - b.k).slice(0, 3);
  $('nx').innerHTML =
    it
      .map((z) => {
        const g = z.g;
        const l = g.loan;
        // Normal goals (and lump-sum loans) are paid the step before their due month; show the due month.
        const o2 = g.retirement || (l && l.kind === 'installments') ? 0 : 1;
        const what = g.retirement ? t('retS') + ' ' : l ? (l.kind === 'installments' ? t('lnPaidOff') : t('lnRepay')) + ' ' : '';
        const amt = g.retirement ? f(g.monthly ?? 0) + '/' + t('mo2') : l?.kind === 'installments' ? f(l.monthlyPayment) + '/' + t('mo2') : f(g.amount);
        return `<div class="g"><div class="gh"><div><b>${esc(goalName(g.name))}</b><div class="lbl">${what}${dateAt(z.k + o2)} · ${t('inT')} ${dur(z.k + o2)}</div></div><div>${amt}<div class="lbl ${z.ok ? 'ok' : 'bad'}">${z.ok ? t('on') : t('sh') + ' ' + f(z.short)}</div></div></div></div>`;
      })
      .join('') || `<div class="lbl">${t('nog')}</div>`;
}

function pensionView(w: WhatIf, goals: Goal[]): void {
  const S = data!.settings;
  const has = S.birthYear != null;
  $('pnBody').hidden = !has;
  $('pnNo').hidden = has;
  pensionBalances = [];
  if (!has) {
    $('pnS').textContent = '';
    return;
  }
  const rety = retirementYear(goals);
  const pr = projectPension(data!.pension, {
    start, birthYear: S.birthYear!, pensionStartAge: S.pensionStartAge, retirementYear: rety,
    depositGrowthPct: w.pensionDepositGrowthPct, exemptPct: S.pensionExemptPct, exemptCeiling: S.pensionExemptCeiling,
    taxRatePct: w.pensionTaxRatePct, oldAgeAllowance: w.oldAgeAllowance, allowance: w.allowance,
    inflationOn: w.inflationOn, inflationRate: w.inflationRatePct / 100,
  });
  pensionBalances = pr.funds.map((x) => x.balances);
  const inf = w.inflationOn ? Math.pow(1 + w.inflationRatePct / 100, pr.kEnd / 12) : 1;
  $('pfl').innerHTML = pr.funds
    .map((x) => `<div class="g"><div class="gh"><div><b>${esc(x.fund.name)}</b><div class="lbl">${esc(x.fund.owner)} · ${f(x.fund.balance)} → ${f(x.final / inf)}</div></div><div>${f(x.monthly / inf)}<div class="lbl">/${t('mo2')}</div></div></div></div>`)
    .join('');
  $('pn1').textContent = f(pr.total);
  $('pn2').textContent = f(pr.monthlyPreTax);
  $('pn3').textContent = f(pr.monthlyAfterTax);
  $('pnS').textContent = f(pr.monthlyPreTax) + '/' + t('mo2');
  $('pn4').textContent = pr.coverage == null ? '–' : Math.round(pr.coverage * 100) + '%';
  $('pn5').textContent = t('pnote', {
    n: f(pr.today), d: f(pr.deposits), f: f(pr.fees), y: rety ?? S.birthYear! + S.pensionStartAge, p: S.pensionStartAge,
    x: S.pensionExemptPct, c: f(S.pensionExemptCeiling), m: w.inflationOn ? '' : t('pnom'),
  });
}

export function tmView(): void {
  if (!cache || !data) return;
  const { r, snaps, p, goals } = cache;
  const sl = inp('tm');
  const mx = r.pts[r.pts.length - 1][0];
  sl.max = String(mx);
  const k = Math.min(mx, Math.max(0, parseInt(sl.value, 10) || 0));
  const infl = p.inflationOn ? Math.pow(1 + p.inflationRate, k / 12) : 1;
  const pt = r.pts[k];
  $('th').textContent = k === 0 ? t('now') : t('stat', { d: dateAt(k, 'long') });
  $('t1').textContent = f(pt[1]);
  $('t2').textContent = f(pt[2]);
  $('t3').textContent = f(freeAt(snaps[k], p, goals.slice().sort(goalOrder), r.end));

  const S = data.settings;
  const rety = retirementYear(goals);
  const yearTicks: { k: number; label: string }[] = [];
  for (let y = start.year + 1; y <= r.end; y++) yearTicks.push({ k: stepOf(start, y, 0), label: String(y) });
  const band = rety != null && S.birthYear != null
    ? { k1: stepOf(start, rety, 0), k2: stepOf(start, S.birthYear + S.pensionStartAge, 0), label1: t('agel', { a: rety - S.birthYear }), label2: t('agel', { a: S.pensionStartAge }) }
    : null;
  $('chart').innerHTML = chartSvg({ pts: r.pts, res: r.res, free: cache.free ?? [], sel: k, yearTicks, band });

  // Holdings at the selected month.
  const s = snaps[k];
  curK = k;
  holdRows = s.S.filter((x) => !(x.h.synthetic && x.b < 1)).sort((a, b) => b.b - a.b);
  const rows = holdRows
    .map((x, i) => {
      const h = x.h;
      const pre = x.b / infl;
      const post = (x.b - taxOf(h, x.b, x.d, p.cgTax, p.incomeTax)) / infl;
      const inc = h.type === 'Pension' ? false : h.type === 'Stocks (unvested)' ? p.countUnvested : h.include;
      const meta = esc(ty(h.type)) + (h.synthetic ? ' · ' + t('avgr', { r: h.ret.toFixed(1) }) : ' · ' + t('r5') + ' ' + h.ret.toFixed(1) + '%')
        + (h.vendor ? ' · ' + esc(h.vendor) : '') + (h.owner ? ' · ' + esc(h.owner) : '') + (inc ? '' : ' · ' + t('sepn'));
      return `<div class="g" data-h="${i}"><div class="gh"><div><b>${esc(h.synthetic ? t('sre') : h.name)}</b><div class="lbl">${meta}</div></div><div><div>${t('legPre')} ${f(pre)}</div>${h.type === 'Pension' ? '' : `<div class="lbl">${t('legPost')} ${f(post)}</div>`}</div></div></div>`;
    });
  const pens = data.pension.map((fd, i) => {
    const bs = pensionBalances[i];
    const v = bs ? bs[Math.min(k, bs.length - 1)] : fd.balance;
    return `<div class="g" data-pf="${i}"><div class="gh"><div><b>${esc(fd.name)}</b><div class="lbl">${esc(ty('Pension'))}${fd.owner ? ' · ' + esc(fd.owner) : ''}</div></div><div><div>${t('legPre')} ${f(v / infl)}</div></div></div></div>`;
  });
  const debts = data.loans.map((l, i) => {
    const owed = s.D[i] ?? 0;
    const meta = esc(ty('Loan')) + ' · ' + (l.kind === 'installments' ? t('lnInst') : t('lnLump')) + (l.ratePct ? ' · ' + l.ratePct + '%' : '') + (l.owner ? ' · ' + esc(l.owner) : '');
    return `<div class="g" data-ln="${i}"><div class="gh"><div><b>${esc(l.name)}</b><div class="lbl">${meta}</div></div><div><div class="${owed > 0 ? 'bad' : 'ok'}">${owed > 0 ? '−' + f(owed / infl) : t('lnPaidOff')}</div></div></div></div>`;
  });
  $('hs').textContent = t('hold') + ' (' + (rows.length + pens.length + debts.length) + ')';
  $('hl').innerHTML = rows.join('') + pens.join('') + debts.join('');
}

function goalsView(r: SimResult, goals: Goal[], liquidNow: number, reserve: number): void {
  let o = '';
  if (reserve > 0) {
    const cv = liquidNow >= reserve;
    o += `<div class="g" data-res="1"><div class="gh"><div><b>${esc(t('rdf'))}</b><div class="lbl">${f(reserve)} · ${t('resv')}</div></div><div><span class="${cv ? 'ok' : 'bad'}">${cv ? t('cov') : t('sh') + ' ' + f(reserve - liquidNow)}</span></div></div></div>`;
  }
  const raw = allGoals();
  listed = [];
  goalRows = [];
  goals.slice().sort(goalOrder).forEach((x) => {
    if (x.everyYears) {
      o += recurringRow(x, r.res.filter((z) => z.g.series === x), listed.push(x) - 1);
      goalRows.push(x);
      return;
    }
    const y = r.res.find((z) => z.g === x);
    const pc = y && x.amount > 0 ? Math.min(100, (y.have / x.amount) * 100) : y?.ok ? 100 : 0;
    // The retirement goal is re-derived each render; map it back to its sheet row.
    const orig = x.retirement ? raw.find((g) => g.retirement)! : x;
    const i = listed.push(orig) - 1;
    goalRows.push(x);
    const date = new Date(x.year, (x.month || 1) - 1, 1).toLocaleDateString(locale(), { month: 'short', year: 'numeric' });
    o += `<div class="g" data-gd="${i}"><div class="gh"><div><b>${esc(goalName(x.name))}</b>`
      + (orig.pending ? ` <span class="lbl">${t('ns')}</span> <button class="s" data-rm="${i}">${t('rm')}</button>` : '')
      + `<div class="lbl">${f(x.amount)} · ${date}${x.retirement ? ' · ' + t('age') + ' ' + inp('ra').value : ''}</div></div><div>`
      + (y ? `<span class="${y.ok ? 'ok' : 'bad'}">${y.ok ? t('on') : t('sh') + ' ' + f(y.short)}</span>` + (x.retirement ? '' : `<div class="lbl">${t('prj')} ${f(y.have)}</div>`) : '')
      + '</div></div>'
      + (x.retirement ? '' : `<label class="chk"><input type="checkbox" data-sp="${i}"${x.spend ? ' checked' : ''}>${t('spend')}</label>`)
      + `<div class="bar"><i style="width:${pc}%"></i></div></div>`;
  });
  $('gs').textContent = t('goals') + ' (' + (goals.length + (reserve > 0 ? 1 : 0)) + ')';
  $('goals').innerHTML = o || `<div class="lbl">${t('nog')}</div>`;
  const np = pending.length;
  $('sv').hidden = !np;
  $('sv').textContent = np === 1 ? t('save1') : t('saveN', { n: np });
}

function everyText(g: Goal): string {
  return (g.everyYears === 1 ? t('everyY') : t('everyN', { n: g.everyYears! })) + (g.untilYear ? ' ' + t('untilY', { y: g.untilYear }) : '');
}

/** One row for a recurring goal: next date, and whether every occurrence is funded. */
function recurringRow(x: Goal, zs: GoalResult[], i: number): string {
  const nOk = zs.filter((z) => z.ok).length;
  const bad = zs.find((z) => !z.ok);
  const next = zs[0];
  const first = new Date(x.year, (x.month || 1) - 1, 1).toLocaleDateString(locale(), { month: 'short', year: 'numeric' });
  const status = !zs.length ? '' : bad
    ? `<span class="bad">${t('shortIn', { y: bad.g.year })} ${f(bad.short)}</span>`
    : `<span class="ok">${t('on')}</span>`;
  const pc = zs.length ? (nOk / zs.length) * 100 : 0;
  return `<div class="g" data-gd="${i}"><div class="gh"><div><b>${esc(goalName(x.name))}</b>`
    + (x.pending ? ` <span class="lbl">${t('ns')}</span> <button class="s" data-rm="${i}">${t('rm')}</button>` : '')
    + `<div class="lbl">${f(x.amount)} ${everyText(x)} · ${t('fromL')} ${first}</div></div><div>${status}`
    + (zs.length ? `<div class="lbl">${t('nRec', { n: nOk, m: zs.length })}${next ? '' : ''}</div>` : '')
    + '</div></div>'
    + `<label class="chk"><input type="checkbox" data-sp="${i}"${x.spend ? ' checked' : ''}>${t('spend')}</label>`
    + `<div class="bar"><i style="width:${pc}%"></i></div></div>`;
}

// ---------- actions ----------

function addGoal(): void {
  const n = inp('gn').value.trim();
  const a = N('ga');
  const y = parseInt(inp('gy').value, 10);
  if (!n || a <= 0 || !(y >= start.year && y <= start.year + 60)) {
    $('gm').textContent = t('need', { y: start.year });
    return;
  }
  const every = Math.round(N('grp'));
  const until = parseInt(inp('gru').value, 10);
  if (every < 0 || (every > 0 && until && until < y)) {
    $('gm').textContent = t('needRep');
    return;
  }
  pending.push({
    name: n, amount: a, year: y, month: parseInt($<HTMLSelectElement>('gmo').value, 10) || 1, spend: inp('gsp').checked, retirement: false, pending: true,
    everyYears: every > 0 ? every : undefined, untilYear: every > 0 && until ? until : undefined,
  });
  $<HTMLSelectElement>('gmo').value = '1';
  inp('gn').value = inp('ga').value = inp('gy').value = inp('grp').value = inp('gru').value = '';
  $('gm').textContent = t('addedH');
  render();
}

async function withSave(btn: string, fn: (c: SheetsClient) => Promise<void>, okText: string, failSuffix = ''): Promise<void> {
  if (deps.demo()) {
    $('gm').textContent = t('demoNoSave');
    return;
  }
  const c = deps.client();
  if (!c || !data) return;
  inp(btn).disabled = true;
  $('gm').textContent = t('wr');
  try {
    await fn(c);
    $('gm').textContent = okText;
  } catch (e) {
    if (e instanceof SheetsError && e.code === 'auth') deps.onAuthError();
    $('gm').textContent = errorText(e) + failSuffix;
  }
  inp(btn).disabled = false;
}

function saveGoals(): Promise<void> {
  return withSave('sv', async (c) => {
    await appendGoals(c, data!.goals, pending);
    pending = [];
    await load();
  }, t('saved'), ' ' + t('chk'));
}

function saveRes(): Promise<void> {
  const v = N('rd');
  if (v < 0 || !data?.goals.reserveRow) return Promise.resolve();
  return withSave('rb', (c) => saveReserve(c, data!.goals, v), t('rsaved'));
}

function saveRet(): Promise<void> {
  return withSave('rb2', (c) => saveRetirement(c, data!.settings, N('ra'), N('al')), t('rsaved2'));
}

let timer: number | undefined;
function renderSoon(): void {
  clearTimeout(timer);
  timer = window.setTimeout(render, 150);
}

// ---------- detail popups ----------

const pct = (v: number | null | undefined, d = 2) => (v == null ? '–' : v.toFixed(d).replace(/\.?0+$/, '') + '%');
const row = (label: string, value: string) => `<div class="dr"><span>${label}</span><span>${value}</span></div>`;
const sec = (title: string) => `<div class="dsec">${title}</div>`;
const yn = (b: boolean) => (b ? t('yes') : t('no'));

function openDialog(title: string, sub: string, body: string): void {
  $('dlgT').textContent = title;
  $('dlgB').innerHTML = (sub ? `<p class="dsub">${sub}</p>` : '') + body;
  const d = $<HTMLDialogElement>('dlg');
  if (!d.open) d.showModal();
  $('dlgB').scrollTop = 0;
}

/** Value lines for a balance b with basis d, in display money. */
function valueLines(x: { b: number; d: number; h: Holding }, infl: number, p: Params): string {
  const tax = taxOf(x.h, x.b, x.d, p.cgTax, p.incomeTax);
  return row(t('dVal'), f(x.b / infl)) + row(t('dDep'), f(x.d / infl)) + row(t('dGain'), f((x.b - x.d) / infl))
    + row(t('dTax'), f(tax / infl)) + row(t('dPost'), f((x.b - tax) / infl));
}

function holdingDetails(x: Slot): void {
  if (!cache || !data) return;
  const { p } = cache;
  const h = x.h;
  const i = h.info;
  const inc = h.type === 'Stocks (unvested)' ? p.countUnvested : h.include;
  const scen = $<HTMLSelectElement>('sc').selectedOptions[0]?.textContent ?? '';
  const taxName = h.tax === 'capital_gain' ? t('taxCg') : h.tax === 'income' ? t('taxInc') : t('taxNone');
  let body = sec(t('dToday')) + valueLines({ b: h.value, d: h.deposited, h }, 1, p);
  if (curK > 0) {
    const infl = p.inflationOn ? Math.pow(1 + p.inflationRate, curK / 12) : 1;
    body += sec(t('dAt', { d: dateAt(curK, 'long') })) + valueLines(x, infl, p);
  }
  body += sec(t('dRT'))
    + row(t('dRet'), pct(h.ret)) + row(t('dEff', { s: scen }), pct(h.ret * p.returnFactor))
    + row(t('dTaxT'), taxName) + row(t('dInTot'), yn(inc)) + row(t('dSpendable'), yn(inc && h.type !== 'Stocks (unvested)'));
  if (i) {
    body += sec(t('dSheet'));
    if (i.currency !== 'ILS') body += row(i.currency, `⁦${i.amount.toLocaleString('en-US')} ${t('dRate', { r: i.rate.toFixed(3) })}⁩`);
    if (i.ticker) body += row(t('dTicker'), esc(i.ticker));
    if (i.quantity != null) body += row(t('dQty'), i.quantity.toLocaleString('en-US'));
    if (i.track) body += row(t('dTrack'), esc(i.track));
    if (i.style) body += row(t('dStyle'), esc(i.style));
    if (i.depositFeePct != null) body += row(t('dDepF'), pct(i.depositFeePct));
    if (i.managementFeePct != null) body += row(t('dMgmF'), pct(i.managementFeePct));
    if (i.lastUpdated) body += row(t('dUpd'), esc(i.lastUpdated));
  }
  if (i?.depositFeePct != null || i?.managementFeePct != null) body += `<div class="dnote">${t('dFeesN')}</div>`;
  if (h.synthetic) body += `<div class="dnote">${t('dSreN')}</div>`;
  if (h.type === 'Stocks (unvested)') body += `<div class="dnote">${t('dUnvN', { m: data.settings.vestEveryMonths })}</div>`;
  if (i?.notes) body += `<div class="dnote">${esc(i.notes)}</div>`;
  const sub = [ty(h.type), h.vendor, h.owner].filter(Boolean).map(esc).join(' · ');
  openDialog(h.synthetic ? t('sre') : h.name, sub, body);
}

function pensionDetails(idx: number): void {
  if (!data || !cache) return;
  const fd = data.pension[idx];
  const bs = pensionBalances[idx];
  const S = data.settings;
  const w = whatIf();
  let body = sec(t('dToday')) + row(t('dBal'), f(fd.balance)) + row(t('dMDep'), f(fd.monthlyDeposit))
    + row(t('dDepF'), pct(fd.depositFeePct)) + row(t('dAccF'), pct(fd.accumulationFeePct)) + row(t('dYRet'), pct(fd.returnPct))
    + row(t('dCoef'), String(fd.coefficient)) + row(t('dStops'), yn(fd.stopsAtEarlyRetirement));
  if (bs) {
    const kEnd = bs.length - 1;
    const inf = (k: number) => (w.inflationOn ? Math.pow(1 + w.inflationRatePct / 100, k / 12) : 1);
    if (curK > 0 && curK < kEnd) body += sec(t('dAt', { d: dateAt(curK, 'long') })) + row(t('dBal'), f(bs[curK] / inf(curK)));
    body += sec(t('dAtPen', { a: S.pensionStartAge })) + row(t('dBal'), f(bs[kEnd] / inf(kEnd))) + row(t('dMPen'), f(bs[kEnd] / fd.coefficient / inf(kEnd)));
  }
  body += `<div class="dnote">${t('dPenN')}</div>`;
  openDialog(fd.name, [ty('Pension'), fd.owner].filter(Boolean).map(esc).join(' · '), body);
}

function recurringDetails(g: Goal): void {
  if (!cache) return;
  const zs = cache.r.res.filter((z) => z.g.series === g);
  let body = row(t('dAmt'), f(g.amount)) + row(t('dRepeat'), everyText(g)) + row(t('dSpendQ'), yn(g.spend))
    + row(t('dStatus'), t('nRec', { n: zs.filter((z) => z.ok).length, m: zs.length }));
  body += sec(t('dOcc'));
  for (const z of zs) {
    const d = new Date(z.g.year, (z.g.month || 1) - 1, 1).toLocaleDateString(locale(), { month: 'short', year: 'numeric' });
    body += row(d, z.ok ? `<span class="ok">${t('on')}</span>` : `<span class="bad">${t('sh')} ${f(z.short)}</span>`);
  }
  if (!zs.length) body += `<div class="dnote">${t('dNoOcc')}</div>`;
  body += `<div class="dnote">${t('dRecN')}</div>`;
  if (g.notes) body += `<div class="dnote">${esc(g.notes)}</div>`;
  openDialog(goalName(g.name), g.pending ? t('ns') : '', body);
}

function loanDetails(i: number): void {
  if (!data || !cache) return;
  const l: Loan = data.loans[i];
  const z = cache.r.res.find((x) => x.g.loan === l);
  const p = cache.p;
  const inst = l.kind === 'installments';
  let body = row(t('lnKind'), inst ? t('lnInst') : t('lnLump')) + row(t('lnOwed'), f(l.balance)) + row(t('lnRate'), pct(l.ratePct));
  if (inst) {
    body += row(t('lnPay'), f(l.monthlyPayment));
    const m = loanMonths(l);
    if (m != null) body += row(t('lnPaidOff'), dateAt(m) + ' · ' + t('inT') + ' ' + dur(m));
  } else body += row(t('lnDue'), new Date(l.year, l.month - 1, 1).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }));
  if (curK > 0) {
    const infl = p.inflationOn ? Math.pow(1 + p.inflationRate, curK / 12) : 1;
    body += row(t('lnAt', { d: dateAt(curK, 'long') }), f((cache.snaps[curK].D[i] ?? 0) / infl));
  }
  if (z) body += row(t('dStatus'), z.ok ? `<span class="ok">${t('on')}</span>` : `<span class="bad">${t('sh')} ${f(z.short)}</span>`);
  if (inst && loanMonths(l) == null) body += `<div class="dnote bad">${t('lnNever')}</div>`;
  body += `<div class="dnote">${t('lnN')}</div>`;
  if (l.notes) body += `<div class="dnote">${esc(l.notes)}</div>`;
  openDialog(l.name, [ty('Loan'), l.owner].filter(Boolean).map(esc).join(' · '), body);
}

function goalDetails(g: Goal): void {
  if (!cache) return;
  if (g.everyYears) return recurringDetails(g);
  const z = cache.r.res.find((x) => x.g === g);
  const status = z ? `<span class="${z.ok ? 'ok' : 'bad'}">${z.ok ? t('on') : t('sh')}</span>` : '–';
  let body = '';
  if (g.retirement) {
    const years = Math.max(0, (g.endYear ?? g.year) - g.year + 1);
    body += row(t('dFrom'), dateAt(stepOf(start, g.year, 0))) + row(t('dUntil'), String(g.endYear ?? g.year)) + row(t('dYears'), String(years))
      + row(t('dMonthly'), f(g.monthly ?? 0)) + row(t('dTotal'), f(g.amount)) + row(t('dStatus'), status);
    if (z && !z.ok) body += row(t('dShortBy'), f(z.short));
    body += `<div class="dnote">${t('dRetN')}</div>`;
  } else {
    const due = stepOf(start, g.year, (g.month || 1) - 1);
    body += row(t('dAmt'), f(g.amount)) + row(t('dDue'), new Date(g.year, (g.month || 1) - 1, 1).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }))
      + row(t('dLeft'), dur(Math.max(0, due))) + row(t('dSpendQ'), yn(g.spend)) + row(t('dStatus'), status);
    if (z) body += row(t('dHave'), f(z.have)) + (z.ok ? '' : row(t('dShortBy'), f(z.short)));
    if (g.priority != null) body += row(t('dPrio'), String(g.priority));
    body += `<div class="dnote">${t('dGoalN')}</div>`;
    if (g.notes) body += `<div class="dnote">${esc(g.notes)}</div>`;
  }
  openDialog(goalName(g.name), g.pending ? t('ns') : '', body);
}

function reserveDetails(): void {
  if (!data || !cache) return;
  const reserve = whatIf().reserve;
  const lq = today(data.holdings, cache.p).liquidPostTax;
  const cv = lq >= reserve;
  const body = row(t('dAmt'), f(reserve)) + row(t('dLiqNow'), f(lq))
    + row(t('dStatus'), `<span class="${cv ? 'ok' : 'bad'}">${cv ? t('cov') : t('sh') + ' ' + f(reserve - lq)}</span>`)
    + `<div class="dnote">${t('dResN')}</div>`;
  openDialog(t('rdf'), '', body);
}

/** Taps on a row (not on its checkbox or buttons) open its details. */
function rowTap(e: Event): HTMLElement | null {
  const el = e.target as HTMLElement;
  if (el.closest('input, button, label, a')) return null;
  return el.closest<HTMLElement>('.g');
}

// ---------- inflation bar ----------

function inflationOn(): boolean {
  return $('infl').getAttribute('aria-pressed') === 'true';
}

/** Switches inflation on or off (a what-if: never saved) and redraws. */
function setInflation(on: boolean, redraw = true): void {
  $('infl').setAttribute('aria-pressed', String(on));
  inflationBar();
  if (redraw) render();
}

/** Off: a yellow warning that the real picture is worse. On: a calm note. */
function inflationBar(): void {
  const on = inflationOn();
  const r = N('ir');
  const y = (start?.year ?? new Date().getFullYear()) + 10;
  const pctTxt = String(Math.round(r * 10) / 10);
  $('inflBar').classList.toggle('warn', !on);
  $('inflIc').textContent = on ? '✓' : '!';
  $('inflTxt').innerHTML = on
    ? `<b>${t('inflOnT')}</b>${t('inflOnN', { r: pctTxt })}`
    : `<b>${t('inflOffT')}</b>${t('inflOffN', { r: pctTxt, y, a: f(100000 / Math.pow(1 + r / 100, 10)) })}`;
  $('infl').textContent = on ? t('inflOffBtn') : t('inflOnBtn');
}

/** "How it works": the basics in a few lines, with a link to the full guide in the current language. */
export function showHelp(): void {
  const li = (...k: Parameters<typeof t>[0][]) => `<ul class="hwl">${k.map((x) => `<li>${t(x)}</li>`).join('')}</ul>`;
  const url = docsUrl(t('hwDoc'));
  const body = `<p class="dsub" style="font-size:14px;color:var(--tx)">${t('hwIntro')}</p>`
    + sec(t('hwFill')) + li('hw1', 'hw2', 'hw3', 'hw4')
    + sec(t('hwCalc')) + li('hw5', 'hw6', 'hw7')
    + sec(t('hwTip')) + li('hw8', 'hw9')
    + (url ? `<a class="hwlink" href="${url}" target="_blank" rel="noopener">${t('hwGuide')} ›</a>` : '');
  openDialog(t('hwT'), '', body);
}

/** The "?" next to the inflation switch: what it does, with examples at the current rate. */
function inflationHelp(): void {
  const w = whatIf();
  const r = w.inflationRatePct;
  const y = start.year + 10;
  const factor = Math.pow(1 + r / 100, 10);
  const pctTxt = String(Math.round(r * 10) / 10);
  const body = `<p class="dsub">${t('ihNow', { s: w.inflationOn ? t('ihStOn') : t('ihStOff') })}</p>`
    + `<div class="dnote" style="color:var(--tx)">${t('ihOff', { y })}</div>`
    + `<div class="dnote" style="color:var(--tx)">${t('ihOn')}</div>`
    + `<div class="dex">${t('ihEx', { r: pctTxt, y, a: f(100000 / factor), b: f(100000 * factor) })}</div>`
    + `<div class="dnote">${t('ihEff')}</div>`
    + `<div class="dnote">${t('ihRate', { r: pctTxt })}</div>`;
  openDialog(t('ihT'), '', body);
}

export function initApp(d: AppDeps): void {
  deps = d;
  ['sc', 'uv'].forEach((i) => $(i).addEventListener('change', render));
  $('infl').addEventListener('click', () => setInflation(!inflationOn()));
  ['ms', 'fc', 'gr', 'ir', 'cg', 'it', 'rd', 'ra', 'al', 'pg', 'pt', 'po'].forEach((i) => $(i).addEventListener('input', renderSoon));
  $('tm').addEventListener('input', tmView);
  $('inflHelp').addEventListener('click', inflationHelp);
  $('gb').addEventListener('click', addGoal);
  $('sv').addEventListener('click', saveGoals);
  $('rb').addEventListener('click', saveRes);
  $('rb2').addEventListener('click', saveRet);
  $('reload').addEventListener('click', load);
  $('goals').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-rm]');
    if (!b) return;
    const g = listed[parseInt(b.dataset.rm!, 10)];
    pending = pending.filter((x) => x !== g);
    render();
  });
  $('hl').addEventListener('click', (e) => {
    const r = rowTap(e);
    if (r?.dataset.h) holdingDetails(holdRows[parseInt(r.dataset.h, 10)]);
    else if (r?.dataset.pf) pensionDetails(parseInt(r.dataset.pf, 10));
    else if (r?.dataset.ln) loanDetails(parseInt(r.dataset.ln, 10));
  });
  $('goals').addEventListener('click', (e) => {
    const r = rowTap(e);
    if (r?.dataset.gd) goalDetails(goalRows[parseInt(r.dataset.gd, 10)]);
    else if (r?.dataset.res) reserveDetails();
  });
  const dlg = $<HTMLDialogElement>('dlg');
  $('dlgX').addEventListener('click', () => dlg.close());
  // Tap outside the box (on the backdrop) closes it.
  dlg.addEventListener('click', (e) => {
    const b = dlg.getBoundingClientRect();
    const ev = e as MouseEvent;
    if (e.target === dlg && (ev.clientX < b.left || ev.clientX > b.right || ev.clientY < b.top || ev.clientY > b.bottom)) dlg.close();
  });
  $('goals').addEventListener('change', (e) => {
    const c = e.target as HTMLInputElement;
    if (!c.dataset.sp) return;
    listed[parseInt(c.dataset.sp, 10)].spend = c.checked;
    render();
  });
}
