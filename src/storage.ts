// Everything the app keeps on the phone (SPEC 2.4): sheet ID, OAuth client ID,
// language, UI choices and (if the user adds one) their Gemini key. Never the
// access token, financial data, or AI questions and answers.

/** Storage names start with this; the beta uses its own, so the two apps share nothing. */
export const P = __APP_CHANNEL__ === 'beta' ? 'fpb_' : 'fp_';

export const KEYS = {
  sheet: P + 'sheet',
  clientId: P + 'client_id',
  lang: P + 'lang',
  authMode: P + 'auth_mode',
  signedIn: P + 'signed_in',
  oauthState: P + 'oauth_state',
  checked: P + 'checked',
  /** Ask AI: the user's own Gemini key, privacy warning accepted, reminder count, reminder off. */
  aiKey: P + 'ai_key',
  aiOk: P + 'ai_ok',
  aiSeen: P + 'ai_seen',
  aiQuiet: P + 'ai_quiet',
  /** Key setup in progress (the user went to AI Studio to create a key). */
  aiSetup: P + 'ai_setup',
  /** Ask AI "Don't send my data" (app questions only). */
  aiPrivate: P + 'ai_private',
  /** Holdings panel: which groups are open (UI choice only). */
  holdOpen: P + 'hold_open',
  /** Saved sheets: [{id, nick}], sheet IDs only (not full links) and the user's nicknames. */
  sheets: P + 'sheets',
  /** Holdings panel: period shown in the official returns chart (UI choice only). */
  ofcPeriod: P + 'ofc_period',
} as const;

function ls(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function get(k: string): string {
  return ls()?.getItem(k) ?? '';
}

export function set(k: string, v: string): void {
  try {
    ls()?.setItem(k, v);
  } catch {
    /* private mode or full: the app still works for this session */
  }
}

export function remove(k: string): void {
  ls()?.removeItem(k);
}

/** "Forget this sheet": wipes everything this app stored on the phone. */
export function forgetAll(): void {
  for (const s of [ls(), (() => { try { return sessionStorage; } catch { return null; } })()]) {
    if (!s) continue;
    for (const k of Object.keys(s)) if (k.startsWith(P)) s.removeItem(k);
  }
}

// ---------- saved sheets (this phone only) ----------

export interface SavedSheet {
  /** Google Sheets ID (from the link). */
  id: string;
  /** The user's short name for it. */
  nick: string;
}

/** Saved sheets; a sheet set up before this list existed is added with no nickname yet. */
export function savedSheets(): SavedSheet[] {
  let list: SavedSheet[] = [];
  try {
    const v = JSON.parse(get(KEYS.sheets) || '[]') as unknown;
    if (Array.isArray(v)) list = v.filter((x): x is SavedSheet => !!x && typeof x.id === 'string' && x.id !== '').map((x) => ({ id: x.id, nick: String(x.nick ?? '') }));
  } catch {
    /* ignore */
  }
  const cur = get(KEYS.sheet);
  if (cur && !list.some((x) => x.id === cur)) list.unshift({ id: cur, nick: '' });
  return list;
}

function store(list: SavedSheet[]): void {
  set(KEYS.sheets, JSON.stringify(list));
}

/** Adds or renames a sheet (an empty nickname keeps the old one). */
export function saveSheet(id: string, nick: string): void {
  const list = savedSheets();
  const i = list.findIndex((x) => x.id === id);
  const n = nick.trim().slice(0, 40);
  if (i >= 0) list[i].nick = n || list[i].nick;
  else list.push({ id, nick: n });
  store(list);
}

export function removeSheet(id: string): SavedSheet[] {
  const list = savedSheets().filter((x) => x.id !== id);
  store(list);
  if (get(KEYS.sheet) === id) remove(KEYS.sheet);
  return list;
}

export const nickOf = (id: string) => savedSheets().find((x) => x.id === id)?.nick ?? '';

/** The first-run sheet check is shown once per sheet. ("1" from older versions = the current sheet.) */
export function isChecked(id: string): boolean {
  const v = get(KEYS.checked);
  if (v === '1') return true;
  try {
    return (JSON.parse(v || '[]') as string[]).includes(id);
  } catch {
    return false;
  }
}

export function markChecked(id: string): void {
  let ids: string[] = [];
  const v = get(KEYS.checked);
  if (v && v !== '1') {
    try {
      ids = JSON.parse(v) as string[];
    } catch {
      ids = [];
    }
  }
  if (!ids.includes(id)) ids.push(id);
  set(KEYS.checked, JSON.stringify(ids));
}
