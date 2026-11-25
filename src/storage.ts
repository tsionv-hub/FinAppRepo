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
