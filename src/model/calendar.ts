import type { StartMonth } from './types';

// The simulation runs in monthly steps. Step k is the 1st of month (start + k).

export function startFromDate(d: Date): StartMonth {
  return { year: d.getFullYear(), month0: d.getMonth() };
}

/** Step index of the 1st of the given month (month0 is 0-11). */
export function stepOf(start: StartMonth, year: number, month0: number): number {
  return (year - start.year) * 12 + month0 - start.month0;
}

/** Calendar year and month (0-11) at step k. */
export function monthAt(start: StartMonth, k: number): { year: number; month0: number } {
  const a = start.year * 12 + start.month0 + k;
  return { year: Math.floor(a / 12), month0: a % 12 };
}

/** Last step of a simulation that ends in December of `endYear`. */
export function lastStep(start: StartMonth, endYear: number): number {
  return stepOf(start, endYear, 11);
}
