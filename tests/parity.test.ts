// Runs the reference prototype's own script in a VM (fake DOM + fake Sheets
// connector fed with the fixture) and checks the port produces the same numbers.
// The prototype hard-codes November 2026 as month 0, so the port starts there too.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  buildParams, defaultWhatIf, freeAt, freeCurve, freeMoney, goalOrder, parseGoals, parseHoldings,
  parsePension, parseSettings, projectPension, resolveGoals, retirementYear, simulate,
  type Scenario, type Snapshot,
} from '../src/model';
import type { Rows } from '../src/model/parse';
import { goalsRows, holdingsRows, pensionRows, settingsRows } from './fixture';

const START = { year: 2026, month0: 10 };
const html = readFileSync(resolve(__dirname, '../reference/prototype.html'), 'utf8');
const script = html
  .slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'))
  // Drop the auto-start lines; the test drives it.
  .replace(/\[\"sc\",[\s\S]*$/, '')
  // Same fix as the port: saving is split evenly when every account is empty, instead of vanishing.
  .replace('if(w<=0)return;', 'if(w<=0){var t=S.filter(function(s){return inc(s.h)&&fn(s.h)&&!s.lots});t.forEach(function(s){s.b+=amt/t.length;s.d+=amt/t.length});return}');

interface WI {
  sc?: Scenario; infl?: boolean; uv?: boolean; ms?: number; rd?: number; ir?: number; extraGoals?: Rows;
}

class El {
  value = ''; checked = false; textContent = ''; innerHTML = ''; disabled = false; max = '';
  style: Record<string, string> = {}; options: El[] = []; attrs: Record<string, string> = {};
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  getAttribute(k: string) { return this.attrs[k] ?? null; }
  appendChild(c: El) { this.options.push(c); }
  addEventListener() {}
}

async function runPrototype(w: WI, goals: Rows) {
  const els: Record<string, El> = {};
  const document = {
    getElementById: (id: string) => (els[id] ??= new El()),
    querySelectorAll: () => [],
    createElement: () => new El(),
    documentElement: {} as Record<string, string>,
    title: '',
  };
  const data: Record<string, Rows> = { Settings: settingsRows, Holdings: holdingsRows, Goals: goals, Pension: pensionRows };
  const mcp = {
    callTool: async (_s: string, _t: string, a: { range: string }) => ({ payload: { values: data[a.range.split('!')[0]] }, cache: { storedAt: 0 } }),
  };
  const ctx = vm.createContext({
    document, Math, Date, JSON, parseInt, parseFloat, isNaN, String, Object, Promise,
    localStorage: { getItem: () => null, setItem() {} },
    window: { claude: { use: async () => mcp } },
  });
  vm.runInContext(script, ctx);
  const $ = (id: string) => document.getElementById(id);
  $('sc').value = w.sc ?? 'mod';
  $('uv').checked = w.uv ?? true;
  $('tm').value = '0';
  await vm.runInContext('load()', ctx);
  // Apply what-if overrides the way the UI would, then re-render.
  if (w.infl !== undefined) $('infl').checked = w.infl;
  if (w.ms !== undefined) $('ms').value = String(w.ms);
  if (w.rd !== undefined) $('rd').value = String(w.rd);
  if (w.ir !== undefined) $('ir').value = String(w.ir);
  vm.runInContext('render()', ctx);
  const run = vm.runInContext('(function(){var sn=[];var r=sim(0,0,null,sn);return {r:r,sn:sn}})()', ctx);
  const digits = (s: string) => Number(s.replace(/[^\d]/g, ''));
  return {
    pts: run.r.pts as number[][],
    res: (run.r.res as { g: { n: string }; k: number; ok: boolean; short: number; have: number }[]).map((x) => ({ n: x.g.n, k: x.k, ok: x.ok, short: x.short, have: x.have })),
    free: digits($('fm').textContent),
    freeNote: $('fn').textContent,
    legend: $('cl').innerHTML,
    pension: ['pn1', 'pn2', 'pn3'].map((i) => digits($(i).textContent)),
    coverage: $('pn4').textContent,
    freeCurve: vm.runInContext('CACHE.r.free', ctx) as number[][],
    freeAt30: vm.runInContext('freeAt(CACHE.sn[30],P(),G.slice().sort(gsort),CACHE.r.end)', ctx) as number,
  };
}

function runPort(w: WI, goalsRowsIn: Rows) {
  const s = parseSettings(settingsRows);
  const H = parseHoldings(holdingsRows, s.fx);
  const gt = parseGoals(goalsRowsIn, START.year);
  const wi = defaultWhatIf(s, gt.reserve);
  wi.scenario = w.sc ?? 'mod';
  wi.countUnvested = w.uv ?? true;
  if (w.infl !== undefined) wi.inflationOn = w.infl;
  if (w.ms !== undefined) wi.monthlySaving = w.ms;
  if (w.rd !== undefined) wi.reserve = w.rd;
  if (w.ir !== undefined) wi.inflationRatePct = w.ir;
  const goals = resolveGoals(gt.goals, { birthYear: s.birthYear, retirementAge: wi.retirementAge, pensionStartAge: s.pensionStartAge, allowance: wi.allowance }, START);
  const p = buildParams(s, wi, START, retirementYear(goals));
  const snaps: Snapshot[] = [];
  const r = simulate(H, goals, p, { snaps });
  const fm = freeMoney(H, goals, p);
  const pen = projectPension(parsePension(pensionRows), {
    start: START, birthYear: s.birthYear!, pensionStartAge: s.pensionStartAge, retirementYear: retirementYear(goals),
    depositGrowthPct: wi.pensionDepositGrowthPct, exemptPct: s.pensionExemptPct, exemptCeiling: s.pensionExemptCeiling,
    taxRatePct: wi.pensionTaxRatePct, oldAgeAllowance: wi.oldAgeAllowance, allowance: wi.allowance,
    inflationOn: wi.inflationOn, inflationRate: wi.inflationRatePct / 100,
  });
  return {
    r, fm, pen, snaps, goals, p,
    freeCurve: freeCurve(snaps, p, goals, r.end),
    freeAt30: freeAt(snaps[30], p, goals.slice().sort(goalOrder), r.end),
  };
}

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1e-6 * Math.max(1, Math.abs(a), Math.abs(b)));

const cases: [string, WI, Rows][] = [
  ['defaults (moderate)', {}, goalsRows],
  ['optimistic', { sc: 'opt' }, goalsRows],
  ['pessimistic, unvested excluded', { sc: 'pes', uv: false }, goalsRows],
  ['inflation on', { infl: true, ir: 3 }, goalsRows],
  ['low saving, big reserve', { ms: 1000, rd: 300000 }, goalsRows],
  ['impossible goal', {}, [...goalsRows, ['G9', 'Island', 9e7, 2029, 3, 9, '', 1, '']]],
  ['no goals', {}, [goalsRows[0]]],
];

describe('parity with reference/prototype.html', () => {
  for (const [name, w, gr] of cases) {
    it(name, async () => {
      const proto = await runPrototype(w, gr);
      const port = runPort(w, gr);

      expect(port.r.pts.length).toBe(proto.pts.length);
      port.r.pts.forEach((pt, i) => {
        expect(pt[0]).toBe(proto.pts[i][0]);
        close(pt[1], proto.pts[i][1]);
        close(pt[2], proto.pts[i][2]);
      });

      expect(port.r.res.map((x) => [x.g.name, x.k, x.ok])).toEqual(proto.res.map((x) => [x.n, x.k, x.ok]));
      port.r.res.forEach((x, i) => {
        close(x.short, proto.res[i].short);
        close(x.have, proto.res[i].have);
      });

      expect(Math.round(port.fm.free)).toBe(proto.free);
      if (port.fm.note.kind === 'saveMore') expect(proto.freeNote).toContain(Math.round(port.fm.note.perMonth).toLocaleString('en-US'));
      if (port.fm.note.kind === 'impossible') expect(proto.freeNote).toMatch(/even/);
      if (port.fm.note.kind === 'allReserved') expect(proto.freeNote).toMatch(/set aside/);
      if (port.fm.note.kind === 'limited') expect(proto.freeNote).toContain(`Limited by ${port.fm.note.goal.name}`);

      expect(port.freeCurve.length).toBe(proto.freeCurve.length);
      port.freeCurve.forEach((x, i) => {
        expect(x[0]).toBe(proto.freeCurve[i][0]);
        close(x[1], proto.freeCurve[i][1]);
      });
      close(port.freeAt30, proto.freeAt30);

      expect([Math.round(port.pen.total), Math.round(port.pen.monthlyPreTax), Math.round(port.pen.monthlyAfterTax)]).toEqual(proto.pension);
      expect(`${Math.round(port.pen.coverage! * 100)}%`).toBe(proto.coverage);
    });
  }
});
