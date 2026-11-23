import { SheetsClient, parseSheetId } from './sheets/api';
import { clientId, forgetToken, getToken, handleRedirect, redirectUri, signIn, signOut, silentTried, wasSignedIn, type RedirectResult } from './sheets/auth';
import { templateXlsx } from './template';
import { applyLang, errorText, initApp, load, showMsg } from './ui/app';
import { t, type Lang } from './ui/i18n';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const K_SHEET = 'fp_sheet';
const K_LANG = 'fp_lang';

function ls(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}
const sheetId = () => ls()?.getItem(K_SHEET) ?? '';

function client(): SheetsClient | null {
  const id = sheetId();
  return id ? new SheetsClient(id, () => getToken()?.accessToken ?? null) : null;
}

function screen(name: 'setup' | 'diag' | 'app'): void {
  $('setup').hidden = name !== 'setup';
  $('diag').hidden = name !== 'diag';
  $('app').hidden = name !== 'app' || $('app').dataset.loaded !== '1';
}

function startSignIn(silent: boolean, returnTo = ''): void {
  if (!clientId()) {
    showMsg(t('noCid'));
    return;
  }
  signIn({ silent, returnTo });
}

function showSetup(err?: string): void {
  screen('setup');
  $('reload').hidden = true;
  const hasSheet = !!sheetId();
  $('setupSheet').hidden = hasSheet;
  $('setupSign').hidden = !hasSheet;
  showMsg(err ?? (clientId() ? null : t('noCid')));
}

function onAuthError(): void {
  forgetToken();
  if (!silentTried()) startSignIn(true);
  else showSetup(t('eAuth'));
}

function downloadTemplate(): void {
  const blob = new Blob([templateXlsx() as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'finance-planner-template.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

// ---------- sign-in test (?diag) ----------

let lastRedirect: RedirectResult = { kind: 'none' };
const diagLog: string[] = [];

async function diag(extra?: string): Promise<void> {
  if (extra) diagLog.push(new Date().toLocaleTimeString() + ' ' + extra);
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const tok = getToken();
  const id = sheetId();
  let persisted = 'n/a';
  try {
    persisted = String(await navigator.storage?.persisted?.());
  } catch {
    /* ignore */
  }
  const lines = [
    'Installed (standalone): ' + (standalone ? 'yes' : 'no'),
    'Device: ' + navigator.userAgent,
    'Online: ' + navigator.onLine,
    'Client ID set: ' + (clientId() ? 'yes' : 'NO (set VITE_GOOGLE_CLIENT_ID)'),
    'Redirect URI (register this in Google Cloud): ' + redirectUri(),
    'Sheet ID saved: ' + (id ? id.slice(0, 4) + '…' + id.slice(-4) : 'no'),
    'Token: ' + (tok ? 'valid, ' + Math.round((tok.expiresAt - Date.now()) / 60000) + ' min left' : 'none'),
    'Signed in before: ' + wasSignedIn() + '; silent refresh tried this session: ' + silentTried(),
    'Last redirect: ' + JSON.stringify(lastRedirect),
    'Storage persisted: ' + persisted,
    'Service worker: ' + (navigator.serviceWorker?.controller ? 'active' : 'not controlling'),
    '',
    ...diagLog,
  ];
  $('diagOut').textContent = lines.join('\n');
}

async function diagRead(): Promise<void> {
  const c = client();
  if (!c) return diag('Test read: no sheet ID saved. Enter it on the main screen first.');
  const t0 = performance.now();
  try {
    const m = await c.meta();
    const [rows] = await c.batchGet(["'Settings'!A1:B3"]);
    diag(`Test read OK in ${Math.round(performance.now() - t0)} ms: "${m.title}", tabs: ${m.tabs.join(', ')}; Settings rows read: ${rows.length}`);
  } catch (e) {
    diag('Test read FAILED: ' + errorText(e) + ' ' + String((e as Error).message ?? ''));
  }
}

function showDiag(): void {
  screen('diag');
  diag();
}

// ---------- startup ----------

function wire(): void {
  $('lb').addEventListener('click', () => {
    const l: Lang = document.documentElement.lang === 'he' ? 'en' : 'he';
    ls()?.setItem(K_LANG, l);
    applyLang(l);
  });
  $('sidGo').addEventListener('click', () => {
    const id = parseSheetId($<HTMLInputElement>('sid').value);
    if (!id) {
      $('sidErr').textContent = t('badId');
      return;
    }
    $('sidErr').textContent = '';
    ls()?.setItem(K_SHEET, id);
    route();
  });
  $('signIn').addEventListener('click', () => startSignIn(false));
  $('tplBtn').addEventListener('click', downloadTemplate);
  $('tplBtn2').addEventListener('click', downloadTemplate);
  $('chgSheet').addEventListener('click', () => {
    ls()?.removeItem(K_SHEET);
    $('app').dataset.loaded = '';
    showSetup();
  });
  $('signOut').addEventListener('click', async () => {
    await signOut();
    $('app').dataset.loaded = '';
    showSetup();
  });
  $('dSign').addEventListener('click', () => startSignIn(false, 'diag'));
  $('dSilent').addEventListener('click', () => startSignIn(true, 'diag'));
  $('dRead').addEventListener('click', diagRead);
  $('dOut').addEventListener('click', async () => {
    await signOut();
    diag('Signed out');
  });
  $('dBack').addEventListener('click', () => {
    history.replaceState(null, '', location.pathname);
    route();
  });
}

function route(): void {
  if (new URLSearchParams(location.search).has('diag')) return showDiag();
  if (!sheetId()) return showSetup();
  if (!getToken()) {
    if (lastRedirect.kind === 'error' && !lastRedirect.silent) return showSetup(t('eSign', { c: lastRedirect.error }));
    if (wasSignedIn() && !silentTried()) return startSignIn(true);
    return showSetup();
  }
  screen('app');
  $('app').dataset.loaded = '1';
  load();
}

function main(): void {
  let lang: Lang = 'en';
  const saved = ls()?.getItem(K_LANG);
  if (saved === 'he' || saved === 'en') lang = saved;
  initApp({ client, onAuthError });
  applyLang(lang);
  wire();
  lastRedirect = handleRedirect();
  if (lastRedirect.kind !== 'none' && lastRedirect.returnTo === 'diag') {
    history.replaceState(null, '', location.pathname + '?diag');
  }
  route();
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  navigator.storage?.persist?.().catch(() => {});
}

main();
