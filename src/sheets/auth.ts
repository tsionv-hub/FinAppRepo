// Google sign-in for a backend-less PWA: OAuth 2.0 implicit flow with a
// full-page redirect (popups are unreliable in installed PWAs, iOS especially).
// The access token lives in this phone's local storage and lasts about an hour;
// after that we try a silent redirect (prompt=none) before asking again.

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const K_TOKEN = 'fp_token';
const K_STATE = 'fp_oauth_state';
const K_SIGNED = 'fp_signed_in';
const K_SILENT = 'fp_silent_tried';

export interface Token {
  accessToken: string;
  /** Epoch ms. */
  expiresAt: number;
}

export type RedirectResult =
  | { kind: 'none' }
  | { kind: 'ok'; returnTo: string }
  | { kind: 'error'; error: string; silent: boolean; returnTo: string };

export function clientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? '';
}

/** Must be listed exactly under "Authorized redirect URIs" of the OAuth client. */
export function redirectUri(): string {
  return location.origin + location.pathname;
}

function store(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function getToken(now = Date.now()): Token | null {
  try {
    const t = JSON.parse(store()?.getItem(K_TOKEN) ?? 'null') as Token | null;
    return t && t.expiresAt - 60_000 > now ? t : null;
  } catch {
    return null;
  }
}

export function wasSignedIn(): boolean {
  return store()?.getItem(K_SIGNED) === '1';
}

export function silentTried(): boolean {
  try {
    return sessionStorage.getItem(K_SILENT) === '1';
  } catch {
    return true;
  }
}

function randomState(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Leaves the page for Google's sign-in; comes back to redirectUri(). */
export function signIn(opts: { silent?: boolean; returnTo?: string } = {}): void {
  const id = clientId();
  if (!id) throw new Error('missing client id');
  const state = randomState();
  store()?.setItem(K_STATE, JSON.stringify({ state, silent: !!opts.silent, returnTo: opts.returnTo ?? '' }));
  if (opts.silent) {
    try {
      sessionStorage.setItem(K_SILENT, '1');
    } catch {
      /* ignore */
    }
  }
  const q = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPE,
    state,
    include_granted_scopes: 'true',
  });
  if (opts.silent) q.set('prompt', 'none');
  location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + q.toString());
}

/** Call once at startup: picks up the token Google put in the URL fragment. */
export function handleRedirect(): RedirectResult {
  const h = location.hash.startsWith('#') ? location.hash.slice(1) : '';
  const q = new URLSearchParams(h);
  if (!q.has('access_token') && !q.has('error')) return { kind: 'none' };
  history.replaceState(null, '', location.pathname + location.search);
  let saved: { state: string; silent: boolean; returnTo: string } | null = null;
  try {
    saved = JSON.parse(store()?.getItem(K_STATE) ?? 'null');
  } catch {
    /* ignore */
  }
  store()?.removeItem(K_STATE);
  const returnTo = saved?.returnTo ?? '';
  if (!saved || saved.state !== q.get('state')) {
    return { kind: 'error', error: 'state_mismatch', silent: false, returnTo };
  }
  if (q.has('error')) return { kind: 'error', error: q.get('error') ?? 'error', silent: saved.silent, returnTo };
  if (!q.get('scope')?.split(' ').includes(SCOPE)) {
    return { kind: 'error', error: 'scope_not_granted', silent: saved.silent, returnTo };
  }
  const t: Token = {
    accessToken: q.get('access_token') ?? '',
    expiresAt: Date.now() + (parseInt(q.get('expires_in') ?? '3600', 10) || 3600) * 1000,
  };
  store()?.setItem(K_TOKEN, JSON.stringify(t));
  store()?.setItem(K_SIGNED, '1');
  try {
    sessionStorage.removeItem(K_SILENT);
  } catch {
    /* ignore */
  }
  return { kind: 'ok', returnTo };
}

export function forgetToken(): void {
  store()?.removeItem(K_TOKEN);
}

export async function signOut(): Promise<void> {
  const t = getToken();
  forgetToken();
  store()?.removeItem(K_SIGNED);
  if (t) {
    try {
      await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t.accessToken), { method: 'POST' });
    } catch {
      /* offline: the token expires on its own */
    }
  }
}
