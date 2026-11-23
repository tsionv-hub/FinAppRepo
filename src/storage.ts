// Everything the app keeps on the phone (SPEC 2.4): sheet ID, OAuth client ID,
// language and UI choices. Never the access token or financial data.

export const KEYS = {
  sheet: 'fp_sheet',
  clientId: 'fp_client_id',
  lang: 'fp_lang',
  authMode: 'fp_auth_mode',
  signedIn: 'fp_signed_in',
  oauthState: 'fp_oauth_state',
  checked: 'fp_checked',
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
