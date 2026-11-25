// Everything the app keeps on the phone (SPEC 2.4): sheet ID, OAuth client ID,
// language, UI choices and (if the user adds one) their Gemini key. Never the
// access token, financial data, or AI questions and answers.

export const KEYS = {
  sheet: 'fp_sheet',
  clientId: 'fp_client_id',
  lang: 'fp_lang',
  authMode: 'fp_auth_mode',
  signedIn: 'fp_signed_in',
  oauthState: 'fp_oauth_state',
  checked: 'fp_checked',
  /** Ask AI: the user's own Gemini key, privacy warning accepted, reminder count, reminder off. */
  aiKey: 'fp_ai_key',
  aiOk: 'fp_ai_ok',
  aiSeen: 'fp_ai_seen',
  aiQuiet: 'fp_ai_quiet',
  /** Key setup in progress (the user went to AI Studio to create a key). */
  aiSetup: 'fp_ai_setup',
  /** Ask AI "Don't send my data" (app questions only). */
  aiPrivate: 'fp_ai_private',
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
    for (const k of Object.keys(s)) if (k.startsWith('fp_')) s.removeItem(k);
  }
}
