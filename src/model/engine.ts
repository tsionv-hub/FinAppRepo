// Monthly simulation, ported from reference/prototype.html (run, sim, freeAt, freeMoney).
// Pure functions: inputs in, results out.

import { lastStep, monthAt, stepOf } from './calendar';
import type { Goal, Holding, Params, StartMonth } from './types';
import { PENSION_TYPE, REINVEST_TYPE, UNVESTED, VESTED_STOCK } from './types';

export interface Lot {
  b: number;
  /** Tranches still to vest. */
  rem: number;
  /** Step the lot was granted. */
  k0: number;
}
export interface Slot {
  /** Balance (nominal ILS). */
  b: number;
  /** Cost basis. */
  d: number;
  h: Holding;
  lots?: Lot[];
}
export interface Snapshot {
  k: number;
  S: Slot[];
}
export interface GoalResult {
  g: Goal;
  /** Step the goal is paid (or, for retirement, the first month of the allowance). */
  k: number;
  ok: boolean;
  /** Shortfall in today's money. */
  short: number;
  /** Amount available for the goal in today's money. */
  have: number;
}
export interface SimResult {
  /** [k, preTax, postTax] in display money (deflated when inflation is on). */
  pts: [number, number, number][];
  res: GoalResult[];
  end: number;
}

// ---------- holdings rules ----------

export function included(h: Holding, p: Pick<Params, 'countUnvested'>): boolean {
  if (h.type === PENSION_TYPE) return false;
  if (h.type === UNVESTED) return p.countUnvested;
  return h.include;
}

/** Spendable: included and not unvested stock. */
export function liquid(h: Holding, p: Pick<Params, 'countUnvested'>): boolean {
  return included(h, p) && h.type !== UNVESTED;
}

/** Tax due if balance b (basis d) were cashed out now. */
export function taxOf(h: Holding, b: number, d: number, cg: number, it: number): number {
  if (h.tax === 'capital_gain') return Math.max(0, b - d) * cg;
  if (h.tax === 'income') return b * it;
  return 0;
}

export function totals(S: Slot[], p: Params): [number, number] {
  let pre = 0;
  let post = 0;
  for (const s of S) {
    if (!included(s.h, p)) continue;
    pre += s.b;
    post += s.b - taxOf(s.h, s.b, s.d, p.cgTax, p.incomeTax);
  }
  return [pre, post];
}

export function liquidPostTax(S: Slot[], p: Params): number {
  let q = 0;
  for (const s of S) if (liquid(s.h, p)) q += s.b - taxOf(s.h, s.b, s.d, p.cgTax, p.incomeTax);
  return q;
}

export function copySlots(S: Slot[]): Slot[] {
  return S.map((x) => ({ b: x.b, d: x.d, h: x.h, lots: x.lots?.map((l) => ({ ...l })) }));
}

// ---------- goals timing ----------

/**
 * Step at which a normal goal is paid. A goal falls due on the 1st of its month;
 * the money leaves at the step before (the end of the previous month), so it is
 * gone by the due date and is not funded by that month's inflows. Never step 0.
 * (Matches the prototype's gdk.)
 */
export function goalStep(start: StartMonth, g: Goal): number {
  return Math.max(1, stepOf(start, g.year, (g.month || 1) - 1) - 1);
}

/** Step after which a goal no longer constrains free money (retirement: December of its last year). */
export function goalHorizon(start: StartMonth, g: Goal): number {
  return g.retirement ? stepOf(start, g.endYear ?? g.year, 11) : goalStep(start, g);
}

export function goalOrder(a: Goal, b: Goal): number {
  return a.year * 12 + (a.month || 1) - (b.year * 12 + (b.month || 1));
}

export interface RetirementInputs {
  birthYear: number | null;
  retirementAge: number | null;
  pensionStartAge: number;
  allowance: number;
}

/**
 * Fills in the derived fields of the retirement goal: it starts in January of
 * birth_year + retirement_age (at least next year) and pays the monthly
 * allowance until December of the year before pension age. The retirement row
 * is dropped when birth year or retirement age is missing.
 */
export function resolveGoals(goals: Goal[], r: RetirementInputs, start: StartMonth): Goal[] {
  const out: Goal[] = [];
  for (const g of goals) {
    if (!g.retirement) {
      out.push(g);
      continue;
    }
    if (r.birthYear == null || r.retirementAge == null) continue;
    const year = Math.max(start.year + 1, r.birthYear + r.retirementAge);
    const endYear = r.birthYear + r.pensionStartAge - 1;
    out.push({
      ...g,
      year,
      month: 1,
      endYear,
      monthly: r.allowance,
      amount: r.allowance * 12 * Math.max(0, endYear - year + 1),
    });
  }
  return out;
}

export function retirementYear(goals: Goal[]): number | null {
  const g = goals.find((x) => x.retirement);
  return g ? g.year : null;
}

// ---------- simulation ----------

/** Runs from step k0 (state S, mutated) to December of endYear. */
export function run(
  S: Slot[],
  k0: number,
  p: Params,
  extraMonthly: number,
  goals: Goal[],
  endYear: number,
  snaps?: Snapshot[],
  /** Stop at the first goal (or retirement month) that is short. Used by the
   *  free-money searches, which only need to know whether everything is funded. */
  stopOnFail = false,
): { pts: [number, number, number][]; res: GoalResult[] } {
  const pts: [number, number, number][] = [];
  const res: GoalResult[] = [];
  const rg = goals.find((g) => g.retirement);
  let rs: { k: number; fail: boolean; short: number } | null = null;
  const us = S.find((s) => s.h.type === UNVESTED);
  const vested = S.filter((s) => s.h.type === VESTED_STOCK);
  const rv = S.find((s) => s.h.type === REINVEST_TYPE);
  const infl = (k: number) => (p.inflationOn ? Math.pow(1 + p.inflationRate, k / 12) : 1);
  const stopYear = p.stopYear ?? Infinity;

  // Adds money to the matching included holdings, in proportion to their balance.
  const put = (amt: number, fn: (h: Holding) => boolean) => {
    let w = 0;
    for (const s of S) if (included(s.h, p) && fn(s.h) && !s.lots) w += s.b;
    if (w <= 0) return;
    for (const s of S)
      if (included(s.h, p) && fn(s.h) && !s.lots) {
        const x = (amt * s.b) / w;
        s.b += x;
        s.d += x;
      }
  };
  // Takes a fraction of every liquid holding (keeps each holding's gain ratio).
  const takeLiquid = (fr: number) => {
    if (fr > 0)
      for (const s of S)
        if (liquid(s.h, p)) {
          s.b *= 1 - fr;
          s.d *= 1 - fr;
        }
  };

  const last = lastStep(p.start, endYear);
  for (let k = k0 + 1; k <= last; k++) {
    const { year: yr, month0: mo } = monthAt(p.start, k);

    // 1. Growth.
    for (const s of S) {
      const g = Math.pow(1 + (s.h.ret * p.returnFactor) / 100, 1 / 12);
      s.b *= g;
      s.lots?.forEach((l) => (l.b *= g));
    }

    // 2. Intel: vested shares are sold, unvested tranches are sold as they vest.
    //    Income tax at sale; net proceeds go to Stock reinvestment.
    if (rv) {
      for (const v of vested)
        if (v.b > 0) {
          const net = v.b * (1 - p.incomeTax);
          rv.b += net;
          rv.d += net;
          v.b = 0;
          v.d = 0;
        }
      if (us?.lots)
        for (const l of us.lots)
          if (l.rem > 0 && k > l.k0 && (k - l.k0) % p.vestEveryMonths === 0) {
            const x = l.b / l.rem;
            l.b -= x;
            l.rem--;
            us.b -= x;
            us.d = Math.max(0, us.d - x);
            const net = x * (1 - p.incomeTax);
            rv.b += net;
            rv.d += net;
          }
    }

    // 3. Monthly saving (plus an optional extra used for "how much more to save").
    put(p.monthlySaving + extraMonthly, () => true);

    // 4. January: yearly free cash and the Intel grant, until retirement.
    if (mo === 0 && yr < stopYear) {
      put(p.yearlyFreeCash, (h) => h.tax === 'capital_gain');
      if (us?.lots) {
        if (p.yearlyGrant > 0) {
          us.b += p.yearlyGrant;
          us.d += p.yearlyGrant;
          us.lots.push({ b: p.yearlyGrant, rem: p.vestTranches, k0: k });
        }
      } else put(p.yearlyGrant, (h) => h.tax === 'income');
    }

    // 5. Retirement allowance, from liquid post-tax money, never touching the rainy day fund.
    if (rg && yr >= rg.year && yr <= (rg.endYear ?? rg.year)) {
      if (!rs) rs = { k, fail: false, short: 0 };
      const q0 = liquidPostTax(S, p);
      const w = (rg.monthly ?? 0) * infl(k);
      const av = q0 - p.reserve * infl(k);
      if (av >= w) takeLiquid(q0 > 0 ? w / q0 : 0);
      else {
        rs.fail = true;
        rs.short += (w - Math.max(0, av)) / infl(k);
        takeLiquid(av > 0 && q0 > 0 ? av / q0 : 0);
        if (stopOnFail) {
          res.push({ g: rg, k: rs.k, ok: false, short: rs.short, have: 0 });
          return { pts, res };
        }
      }
    }

    // 6. Goals due now.
    for (const g of goals) {
      if (g.retirement || goalStep(p.start, g) !== k) continue;
      const q = liquidPostTax(S, p);
      const a = g.amount * infl(k);
      const av = q - p.reserve * infl(k);
      res.push({ g, k, ok: av >= a, short: Math.max(0, a - av) / infl(k), have: Math.max(0, av) / infl(k) });
      if (stopOnFail && av < a) return { pts, res };
      if (g.spend && q > 0) takeLiquid(Math.min(1, a / q));
    }

    const t = totals(S, p);
    pts.push([k, t[0] / infl(k), t[1] / infl(k)]);
    snaps?.push({ k, S: copySlots(S) });
  }
  if (rg && rs) res.push({ g: rg, k: rs.k, ok: !rs.fail, short: rs.short, have: Math.max(0, rg.amount - rs.short) });
  return { pts, res };
}

export function simEndYear(start: StartMonth, goals: Goal[]): number {
  return Math.max(start.year + 10, ...goals.map((g) => (g.retirement ? (g.endYear ?? g.year) : g.year)));
}

export function vestTranches(vestYears: number, everyMonths: number): number {
  return Math.max(1, Math.round((vestYears * 12) / everyMonths));
}

export function initialSlots(H: Holding[], p: Params, takeFraction = 0): Slot[] {
  return H.map((h) => {
    const f = takeFraction && liquid(h, p) ? 1 - takeFraction : 1;
    const o: Slot = { b: h.value * f, d: h.deposited * f, h };
    if (h.type === UNVESTED) o.lots = [{ b: h.value, rem: p.vestTranches, k0: 0 }];
    return o;
  });
}

/**
 * Full simulation from today. `takeFraction` removes that share of liquid
 * money at the start (used to test how much can be spent now).
 */
export function simulate(
  H: Holding[],
  goals: Goal[],
  p: Params,
  opts: { takeFraction?: number; extraMonthly?: number; snaps?: Snapshot[]; stopOnFail?: boolean } = {},
): SimResult {
  const gs = goals.slice().sort(goalOrder);
  const end = simEndYear(p.start, gs);
  const S = initialSlots(H, p, opts.takeFraction ?? 0);
  const t0 = totals(S, p);
  opts.snaps?.push({ k: 0, S: copySlots(S) });
  const r = run(S, 0, p, opts.extraMonthly ?? 0, gs, end, opts.snaps, opts.stopOnFail);
  r.pts.unshift([0, t0[0], t0[1]]);
  return { ...r, end };
}

// ---------- free money ----------

const allOk = (r: { res: GoalResult[] }) => r.res.every((z) => z.ok);

/**
 * Free money at a future snapshot: the most that could be taken from liquid
 * post-tax money at that step while every later goal stays funded. Returned in
 * display money.
 */
export function freeAt(s: Snapshot, p: Params, goals: Goal[], endYear: number, iterations = 14): number {
  const rem = goals.filter((g) => goalHorizon(p.start, g) > s.k);
  let L = 0;
  for (const x of s.S) if (liquid(x.h, p)) L += x.b - taxOf(x.h, x.b, x.d, p.cgTax, p.incomeTax);
  const infl = p.inflationOn ? Math.pow(1 + p.inflationRate, s.k / 12) : 1;
  const hiX = Math.max(0, L - p.reserve * infl);
  let fm = hiX;
  if (hiX > 0 && rem.length) {
    const good = (X: number) => {
      const S2 = copySlots(s.S);
      const f = X / L;
      for (const x of S2)
        if (liquid(x.h, p)) {
          x.b *= 1 - f;
          x.d *= 1 - f;
        }
      return allOk(run(S2, s.k, p, 0, rem, endYear, undefined, true));
    };
    if (!good(hiX)) {
      if (!good(0)) fm = 0;
      else {
        let lo = 0;
        let hi = hiX;
        for (let i = 0; i < iterations; i++) {
          const m = (lo + hi) / 2;
          if (good(m)) lo = m;
          else hi = m;
        }
        fm = lo;
      }
    }
  }
  return Math.max(0, fm) / infl;
}

/** Free money over time, sampled every 3 months (6 for long horizons). */
export function freeCurve(snaps: Snapshot[], p: Params, goals: Goal[], endYear: number): [number, number][] {
  const gs = goals.slice().sort(goalOrder);
  const st = endYear - p.start.year > 14 ? 6 : 3;
  return snaps.filter((s) => s.k % st === 0).map((s) => [s.k, freeAt(s, p, gs, endYear)]);
}

export interface FreeMoneyPart {
  g: Goal;
  /** Liquid post-tax money set aside for this goal today. */
  v: number;
}
export type FreeNote =
  | { kind: 'ok' }
  | { kind: 'limited'; goal: Goal }
  | { kind: 'allReserved' }
  | { kind: 'saveMore'; perMonth: number }
  | { kind: 'impossible' };

export interface FreeMoney {
  /** Free money today. */
  free: number;
  /** Liquid post-tax money today. */
  liquid: number;
  /** Rainy day fund portion actually covered by liquid money. */
  reserve: number;
  /** Money set aside per goal (nearest first). */
  parts: FreeMoneyPart[];
  retirementSetAside: number;
  otherSetAside: number;
  otherCount: number;
  hasRetirement: boolean;
  note: FreeNote;
}

/**
 * Free money today and how liquid money splits between the rainy day fund,
 * goals and free money. Each goal's share is the extra money that must stay
 * invested once that goal is added to the nearer ones.
 */
export function freeMoney(H: Holding[], goals: Goal[], p: Params, iterations = 24): FreeMoney {
  let L = 0;
  for (const h of H) if (liquid(h, p)) L += h.value - taxOf(h, h.value, h.deposited, p.cgTax, p.incomeTax);
  const hiX = Math.max(0, L - p.reserve);
  const ok = (x: number, xm: number, gl: Goal[]) =>
    allOk(simulate(H, gl, p, { takeFraction: L > 0 ? x / L : 0, extraMonthly: xm, stopOnFail: true }));
  const maxFree = (gl: Goal[]) => {
    if (hiX <= 0) return 0;
    if (ok(hiX, 0, gl)) return hiX;
    if (!ok(0, 0, gl)) return 0;
    let lo = 0;
    let hi = hiX;
    for (let i = 0; i < iterations; i++) {
      const m = (lo + hi) / 2;
      if (ok(m, 0, gl)) lo = m;
      else hi = m;
    }
    return lo;
  };

  const gl = goals.slice().sort(goalOrder);
  const reserve = Math.min(p.reserve, Math.max(0, L));
  const parts: FreeMoneyPart[] = [];
  let prev = reserve;
  let fm = hiX;
  for (let n = 1; n <= gl.length; n++) {
    fm = maxFree(gl.slice(0, n));
    const R = L - fm;
    parts.push({ g: gl[n - 1], v: Math.max(0, R - prev) });
    prev = Math.max(prev, R);
  }

  let note: FreeNote = { kind: 'ok' };
  if (fm > 0 && fm < hiX) {
    const r = simulate(H, gl, p, { takeFraction: Math.min(1, (fm * 1.02 + 1) / L) });
    const bad = r.res.find((z) => !z.ok);
    if (bad) note = { kind: 'limited', goal: bad.g };
  }
  if (fm <= 0 && L > 0) {
    if (ok(0, 0, gl)) note = { kind: 'allReserved' };
    else if (!ok(0, 1e6, gl)) note = { kind: 'impossible' };
    else {
      let a = 0;
      let b = 1e6;
      for (let j = 0; j < iterations; j++) {
        const c = (a + b) / 2;
        if (ok(0, c, gl)) b = c;
        else a = c;
      }
      note = { kind: 'saveMore', perMonth: b };
    }
  }

  let ra = 0;
  let ro = 0;
  let no = 0;
  let nr = 0;
  for (const x of parts) {
    if (x.g.retirement) {
      ra += x.v;
      nr++;
    } else {
      ro += x.v;
      no++;
    }
  }
  return {
    free: fm,
    liquid: L,
    reserve,
    parts,
    retirementSetAside: ra,
    otherSetAside: ro,
    otherCount: no,
    hasRetirement: nr > 0,
    note,
  };
}

// ---------- today ----------

export interface Today {
  preTax: number;
  postTax: number;
  tax: number;
  /** Pre-tax value by holding type (included holdings with a positive value). */
  byType: Record<string, number>;
  liquidPostTax: number;
}

export function today(H: Holding[], p: Params): Today {
  let pre = 0;
  let post = 0;
  let lq = 0;
  const byType: Record<string, number> = {};
  for (const h of H) {
    if (liquid(h, p)) lq += h.value - taxOf(h, h.value, h.deposited, p.cgTax, p.incomeTax);
    if (!included(h, p)) continue;
    pre += h.value;
    post += h.value - taxOf(h, h.value, h.deposited, p.cgTax, p.incomeTax);
    if (h.value > 0) byType[h.type] = (byType[h.type] ?? 0) + h.value;
  }
  return { preTax: pre, postTax: post, tax: pre - post, byType, liquidPostTax: lq };
}
