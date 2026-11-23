// Google sign-in for a backend-less PWA. The access token is kept in memory only
// (SPEC 2.4, 8), so it is gone when the app is closed.
//
// Two methods, so the phone test (SPEC 7 "Test first") can compare them:
//  - popup (default): Google Identity Services token client.
//  - redirect: OAuth 2.0 implicit flow with a full-page redirect. Popups can be
//    unreliable in installed PWAs; this is the fallback if the popup fails there.

import { get, KEYS, remove, set } from '../storage';

export const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

export type AuthMode = 'popup' | 'redirect';

export interface Token {
  accessToken: string;
  /** Epoch ms. */
  expiresAt: number;
}

export type RedirectResult =
  | { kind: 'none' }
  | { kind: 'ok'; returnTo: string }
  | { kind: 'error'; error: string; silent: boolean; returnTo: string };

export class AuthError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

let token: Token | null = null;

// ---------- settings ----------

/** OAuth client ID: entered in the app (stored on the phone) or baked in at build time. */
export function clientId(): string {
  return get(KEYS.clientId).trim() || ((import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? '');
}

export function setClientId(id: string): void {
  set(KEYS.clientId, id.trim());
}

export function validClientId(id: string): boolean {
  return /^[\w-]+\.apps\.googleusercontent\.com$/.test(id.trim());
}

export function authMode(): AuthMode {
  return get(KEYS.authMode) === 'redirect' ? 'redirect' : 'popup';
}

export function setAuthMode(m: AuthMode): void {
  set(KEYS.authMode, m);
}

/** The page's own URL: the JavaScript origin and (redirect method) redirect URI to register. */
export function redirectUri(): string {
  return location.origin + location.pathname;
}

// ---------- token ----------

export function getToken(now = Date.now()): Token | null {
  return token && token.expiresAt - 60_000 > now ? token : null;
}

function keep(accessToken: string, expiresIn: number): void {
  token = { accessToken, expiresAt: Date.now() + (expiresIn || 3600) * 1000 };
  set(KEYS.signedIn, '1');
}

export function forgetToken(): void {
  token = null;
}

/** Whether this phone has signed in before (not a secret; only decides which screen to show). */
export function wasSignedIn(): boolean {
  return get(KEYS.signedIn) === '1';
}

export async function signOut(): Promise<void> {
  const t = token;
  token = null;
  remove(KEYS.signedIn);
  if (t) {
    try {
      await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t.accessToken), { method: 'POST' });
    } catch {
      /* offline: the token expires on its own within the hour */
    }
  }
}

// ---------- popup (Google Identity Services) ----------

interface GisTokenResponse {
  access_token?: string;
  expires_in?: number | string;
  scope?: string;
  error?: string;
}
interface GisTokenClient {
  requestAccessToken(o?: { prompt?: string }): void;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(c: {
            client_id: string;
            scope: string;
            callback: (r: GisTokenResponse) => void;
            error_callback?: (e: { type: string }) => void;
          }): GisTokenClient;
        };
      };
    };
  }
}

let gis: Promise<void> | null = null;

/** Loads Google's sign-in library (the only external script, SPEC 7). */
export function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gis ??= new Promise<void>((res, rej) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => res();
    s.onerror = () => {
      gis = null;
      rej(new AuthError('gis_load_failed'));
    };
    document.head.appendChild(s);
  });
  return gis;
}

/**
 * Opens Google's sign-in popup. Must be called from a tap (popup blockers).
 * prompt '' shows the account chooser only when needed.
 */
export async function signInPopup(prompt: '' | 'consent' | 'select_account' = ''): Promise<void> {
  const id = clientId();
  if (!id) throw new AuthError('no_client_id');
  await loadGis();
  await new Promise<void>((res, rej) => {
    const c = window.google!.accounts.oauth2.initTokenClient({
      client_id: id,
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) return rej(new AuthError(r.error || 'no_token'));
        if (!r.scope?.split(' ').includes(SCOPE)) return rej(new AuthError('scope_not_granted'));
        keep(r.access_token, Number(r.expires_in) || 3600);
        res();
      },
      // popup_closed, popup_failed_to_open, unknown
      error_callback: (e) => rej(new AuthError(e.type)),
    });
    c.requestAccessToken({ prompt });
  });
}

// ---------- redirect (fallback) ----------

function randomState(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Leaves the page for Google's sign-in; comes back to redirectUri() with the token in the fragment. */
export function signInRedirect(opts: { silent?: boolean; returnTo?: string } = {}): void {
  const id = clientId();
  if (!id) throw new AuthError('no_client_id');
  const state = randomState();
  set(KEYS.oauthState, JSON.stringify({ state, silent: !!opts.silent, returnTo: opts.returnTo ?? '' }));
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

/** Call once at startup: picks up the token Google put in the URL fragment (redirect method). */
export function handleRedirect(): RedirectResult {
  const h = location.hash.startsWith('#') ? location.hash.slice(1) : '';
  const q = new URLSearchParams(h);
  if (!q.has('access_token') && !q.has('error')) return { kind: 'none' };
  history.replaceState(null, '', location.pathname + location.search);
  let saved: { state: string; silent: boolean; returnTo: string } | null = null;
  try {
    saved = JSON.parse(get(KEYS.oauthState) || 'null');
  } catch {
    /* ignore */
  }
  remove(KEYS.oauthState);
  const returnTo = saved?.returnTo ?? '';
  if (!saved || saved.state !== q.get('state')) return { kind: 'error', error: 'state_mismatch', silent: false, returnTo };
  if (q.has('error')) return { kind: 'error', error: q.get('error') ?? 'error', silent: saved.silent, returnTo };
  if (!q.get('scope')?.split(' ').includes(SCOPE)) return { kind: 'error', error: 'scope_not_granted', silent: saved.silent, returnTo };
  keep(q.get('access_token') ?? '', parseInt(q.get('expires_in') ?? '3600', 10));
  return { kind: 'ok', returnTo };
}
