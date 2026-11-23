// Projection chart: pre-tax, post-tax and free money lines, goal markers
// (dot on the post-tax line plus a tick, green funded / red short) and a shaded
// retirement band. Ported from the prototype's chart().

import type { GoalResult } from '../model';

export interface ChartInput {
  pts: [number, number, number][];
  res: GoalResult[];
  free: [number, number][];
  /** Selected step (slider). */
  sel: number | null;
  /** Step of the 1st of each January, for year labels. */
  yearTicks: { k: number; label: string }[];
  band: { k1: number; k2: number; label1: string; label2: string } | null;
}

const M = (v: number) => (v / 1e6).toFixed(1) + 'M';

export function chartSvg(c: ChartInput): string {
  const W = 340, H = 190, l = 38, rr = 8, tp = 10, b = 22;
  const P = c.pts;
  const n = Math.max(1, P[P.length - 1][0]);
  let mx = 0;
  for (const p of P) mx = Math.max(mx, p[1]);
  for (const p of c.free) mx = Math.max(mx, p[1]);
  mx = Math.ceil(mx / 1e6) * 1e6 || 1e6;
  const X = (k: number) => l + (k / n) * (W - l - rr);
  const Y = (v: number) => tp + (1 - v / mx) * (H - tp - b);
  const line = (pts: [number, number][]) => pts.map((p, j) => (j ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('');

  let o = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
  for (let i = 0; i <= 4; i++) {
    const v = (mx * i) / 4, y = Y(v);
    o += `<line x1="${l}" x2="${W - rr}" y1="${y}" y2="${y}" stroke="var(--ln)"/><text x="${l - 4}" y="${y + 3}" font-size="9" text-anchor="end" fill="var(--mu)">${M(v)}</text>`;
  }
  const every = c.yearTicks.length > 12 ? 4 : 2;
  c.yearTicks.forEach((t, i) => {
    if (i % every === 0 && t.k <= n) o += `<text x="${X(Math.max(0, t.k))}" y="${H - 6}" font-size="9" text-anchor="middle" fill="var(--mu)">${t.label}</text>`;
  });
  if (c.band) {
    const k1 = c.band.k1, k2 = Math.min(n, c.band.k2);
    if (k1 >= 0 && k1 < k2) {
      const x1 = X(k1), x2 = X(k2);
      o += `<rect x="${x1}" y="${tp}" width="${x2 - x1}" height="${H - tp - b}" fill="var(--ac)" opacity=".08"/>`
        + `<line x1="${x1}" x2="${x1}" y1="${tp}" y2="${H - b}" stroke="var(--mu)" opacity=".6"/><line x1="${x2}" x2="${x2}" y1="${tp}" y2="${H - b}" stroke="var(--mu)" opacity=".6"/>`
        + `<text x="${x1 + 3}" y="${tp + 10}" font-size="9" fill="var(--mu)">${c.band.label1}</text><text x="${x2 - 3}" y="${tp + 10}" font-size="9" text-anchor="end" fill="var(--mu)">${c.band.label2}</text>`;
    }
  }
  let dots = '';
  for (const x of c.res) {
    const k = Math.min(x.k, n), px = X(k), col = x.ok ? 'var(--ok)' : 'var(--bad)';
    o += `<line x1="${px}" x2="${px}" y1="${H - b}" y2="${H - b + 5}" stroke="${col}" stroke-width="2"/>`;
    dots += `<circle cx="${px}" cy="${Y(P[k][2])}" r="4" fill="${col}" stroke="var(--card)" stroke-width="1.5"/>`;
  }
  if (c.sel != null) {
    const sx = X(c.sel);
    o += `<line x1="${sx}" x2="${sx}" y1="${tp}" y2="${H - b}" stroke="var(--tx)" stroke-width="1.5"/>`;
  }
  o += `<path d="${line(P.map((p) => [p[0], p[1]]))}" fill="none" stroke="var(--ac2)" stroke-width="2"/>`
    + `<path d="${line(P.map((p) => [p[0], p[2]]))}" fill="none" stroke="var(--ac)" stroke-width="2.5"/>`
    + `<path d="${line(c.free)}" fill="none" stroke="var(--free)" stroke-width="2.5"/>` + dots + '</svg>';
  return o;
}
