// Minimal Google Sheets API v4 client using fetch. Calls go straight from the
// phone to sheets.googleapis.com with the user's own access token.

import type { Rows } from '../model/parse';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets/';

export type SheetsErrorCode = 'auth' | 'forbidden' | 'notfound' | 'ratelimit' | 'network' | 'other';

export class SheetsError extends Error {
  constructor(public code: SheetsErrorCode, public status: number, message: string) {
    super(message);
  }
}

/** Accepts a full Google Sheets URL or a bare spreadsheet ID. */
export function parseSheetId(input: string): string | null {
  const s = input.trim();
  const m = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(s);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(s) ? s : null;
}

/** 0 -> A, 25 -> Z, 26 -> AA. */
export function columnLetter(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Quotes a tab name for A1 notation. */
export function a1(tab: string, range = ''): string {
  return `'${tab.replace(/'/g, "''")}'` + (range ? '!' + range : '');
}

export class SheetsClient {
  constructor(
    public readonly id: string,
    private token: () => string | null,
  ) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const t = this.token();
    if (!t) throw new SheetsError('auth', 401, 'not signed in');
    let r: Response;
    try {
      r = await fetch(BASE + encodeURIComponent(this.id) + path, {
        ...init,
        headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
      });
    } catch (e) {
      throw new SheetsError('network', 0, String(e));
    }
    if (!r.ok) {
      let msg = r.statusText;
      try {
        msg = ((await r.json()) as { error?: { message?: string } }).error?.message ?? msg;
      } catch {
        /* ignore */
      }
      const code: SheetsErrorCode =
        r.status === 401 ? 'auth' : r.status === 429 ? 'ratelimit' : r.status === 403 && /quota|rate/i.test(msg) ? 'ratelimit' : r.status === 403 ? 'forbidden' : r.status === 404 ? 'notfound' : 'other';
      throw new SheetsError(code, r.status, msg);
    }
    return (await r.json()) as T;
  }

  async meta(): Promise<{ title: string; tabs: string[] }> {
    const j = await this.call<{ properties: { title: string }; sheets: { properties: { title: string } }[] }>(
      '?fields=properties.title,sheets.properties.title',
    );
    return { title: j.properties.title, tabs: j.sheets.map((s) => s.properties.title) };
  }

  /** Reads several ranges; numbers come back as numbers. */
  async batchGet(ranges: string[]): Promise<Rows[]> {
    const q = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING' });
    ranges.forEach((r) => q.append('ranges', r));
    const j = await this.call<{ valueRanges: { values?: Rows }[] }>('/values:batchGet?' + q.toString());
    return j.valueRanges.map((v) => v.values ?? []);
  }

  /** One cell as typed in the sheet: a formula comes back as its text, e.g. "=SUM(...)". */
  async cellFormula(range: string): Promise<Rows[number][number]> {
    const j = await this.call<{ values?: Rows }>('/values/' + encodeURIComponent(range) + '?valueRenderOption=FORMULA');
    return j.values?.[0]?.[0];
  }

  async update(range: string, values: Rows): Promise<void> {
    await this.call('/values/' + encodeURIComponent(range) + '?valueInputOption=USER_ENTERED', {
      method: 'PUT',
      body: JSON.stringify({ range, values }),
    });
  }

  async append(range: string, values: Rows): Promise<void> {
    await this.call('/values/' + encodeURIComponent(range) + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS', {
      method: 'POST',
      body: JSON.stringify({ values }),
    });
  }
}
