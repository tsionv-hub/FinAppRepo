// Startup and first run (SPEC 2): sheet link → sign-in setup (client ID) →
// Google sign-in → sheet check → planner. Plus the ?diag sign-in test (SPEC 7).

import { parseSheetId, SheetsClient } from './sheets/api';
import {
  authMode, clientId, forgetToken, getToken, handleRedirect, redirectUri, setAuthMode, setClientId, signInPopup,
  signInRedirect, signOut, validClientId, wasSignedIn, type RedirectResult,
} from './sheets/auth';
import type { Checklist } from './sheets/validate';
import { forgetAll, get, KEYS, remove, set } from './storage';
import { templateXlsx } from './template';
import { applyLang, clearData, errorText, initApp, load, showApp, showMsg } from './ui/app';
import { t, type Lang } from './ui/i18n';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const K_SILENT = 'fp_silent_tried';

const sheetId = () => get(KEYS.sheet);
function client(): SheetsClient | null {
  const id = sheetId();
  return id ? new SheetsClient(id, () => getToken()?.accessToken ?? null) : null;
}

function silentTried(): boolean {
  try {
    return sessionStorage.getItem(K_SILENT) === '1';
  } catch {
    return true;
  }
}
function markSilent(): void {
  try {
    sessionStorage.setItem(K_SILENT, '1');
  } catch {
    /* ignore */
  }
}

// ---------- screens ----------

type Step = 'sheet' | 'client' | 'sign' | 'check';

function screen(name: 'setup' | 'diag' | 'app'): void {
  $('setup').hidden = name !== 'setup';
  $('diag').hidden = name !== 'diag';
  $('app').hidden = name !== 'app';
}

function showStep(step: Step, err?: string | null): void {
  screen('setup');
  $('setupSheet').hidden = step !== 'sheet';
  $('setupClient').hidden = step !== 'client';
  $('setupSign').hidden = step !== 'sign';
  $('setupCheck').hidden = step !== 'check';
  if (step !== 'check') $('reload').hidden = true;
  if (step === 'client') {
    $('cid4').textContent = t('cid4', { o: location.origin });
    $('cid5').textContent = t('cid5', { u: redirectUri() });
    $<HTMLInputElement>('cid').value = clientId();
  }
  if (step === 'sign') {
    const again = wasSignedIn();
    $('signH').textContent = again ? t('signAgain') : t('signT');
    $('signP').textContent = again ? t('signAgainN') : t('signN');
  }
  showMsg(err ?? null);
}

function showCheck(c: Checklist, canOpen: boolean): void {
  showStep('check');
  $('chkSum').textContent = canOpen ? t('chkOk') : t('chkBad');
  $<HTMLButtonElement>('openApp').disabled = !canOpen;
  const kindL = { tab: t('tabL'), column: t('colL'), key: t('keyL') };
  // Show what matters: every tab, and only the missing columns and keys.
  $('chkList').innerHTML = c.items
    .filter((i) => i.kind === 'tab' || !i.found)
    .map((i) => {
      const where = i.kind === 'tab' ? `${esc(i.name)} ${kindL.tab}` : `${esc(i.tab)}: ${kindL[i.kind]} <b dir="ltr">${esc(i.name)}</b>`;
      const st = i.found ? '<span class="ok">✓</span>' : `<span class="${i.required ? 'bad' : 'lbl'}">✗ ${t('missL')}${i.required ? '' : ' (' + t('optL') + ')'}</span>`;
      return `<div class="ck"><span>${where}</span>${st}</div>`;
    })
    .join('');
}

function onAuthError(): void {
  forgetToken();
  if (authMode() === 'redirect' && !silentTried()) {
    markSilent();
    signInRedirect({ silent: true });
    return;
  }
  showStep('sign', t('eAuth'));
}

async function signInTap(returnTo = ''): Promise<void> {
  try {
    if (authMode() === 'redirect') return signInRedirect({ returnTo });
    await signInPopup();
    route();
  } catch (e) {
    showMsg(errorText(e));
  }
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
  const cid = clientId();
  const lines = [
    'Installed (standalone): ' + (standalone ? 'yes' : 'NO - open it from the home-screen icon'),
    'Device: ' + navigator.userAgent,
    'Online: ' + navigator.onLine,
    'Client ID: ' + (cid ? cid.slice(0, 8) + '…' : 'not set'),
    'JavaScript origin to register: ' + location.origin,
    'Redirect URI to register (method 2): ' + redirectUri(),
    'Method used by the app: ' + authMode(),
    'Sheet ID saved: ' + (id ? id.slice(0, 4) + '…' + id.slice(-4) : 'no'),
    'Token (memory only): ' + (tok ? 'valid, ' + Math.round((tok.expiresAt - Date.now()) / 60000) + ' min left' : 'none'),
    'Last redirect: ' + JSON.stringify(lastRedirect),
    'Service worker: ' + (navigator.serviceWorker?.controller ? 'active' : 'not controlling'),
    '',
    ...diagLog,
  ];
  $('diagOut').textContent = lines.join('\n');
  $('dMode').textContent = authMode() === 'popup' ? 'App uses popup → switch to redirect' : 'App uses redirect → switch to popup';
}

async function diagRead(): Promise<void> {
  const c = client();
  if (!c) return diag('Test read: no sheet ID saved yet. Enter it on the main screen first.');
  const t0 = performance.now();
  try {
    const m = await c.meta();
    const [rows] = await c.batchGet(["'Settings'!A1:B3"]);
    diag(`Test read OK in ${Math.round(performance.now() - t0)} ms: "${m.title}", tabs: ${m.tabs.join(', ')}; Settings rows read: ${rows.length}`);
  } catch (e) {
    diag('Test read FAILED: ' + errorText(e) + ' ' + String((e as Error).message ?? ''));
  }
}

// ---------- wiring ----------

function wire(): void {
  $('lb').addEventListener('click', () => {
    const l: Lang = document.documentElement.lang === 'he' ? 'en' : 'he';
    set(KEYS.lang, l);
    applyLang(l);
  });
  $('sidGo').addEventListener('click', () => {
    const id = parseSheetId($<HTMLInputElement>('sid').value);
    $('sidErr').textContent = id ? '' : t('badId');
    if (!id) return;
    set(KEYS.sheet, id);
    remove(KEYS.checked);
    route();
  });
  $('cidGo').addEventListener('click', () => {
    const v = $<HTMLInputElement>('cid').value.trim();
    $('cidErr').textContent = validClientId(v) ? '' : t('cidBad');
    if (!validClientId(v)) return;
    setClientId(v);
    route();
  });
  $('signIn').addEventListener('click', () => signInTap());
  $('chkAgain').addEventListener('click', () => load());
  $('openApp').addEventListener('click', () => showApp());
  for (const b of ['tplBtn', 'tplBtn2']) $(b).addEventListener('click', downloadTemplate);
  $('chgSheet').addEventListener('click', () => {
    remove(KEYS.sheet);
    remove(KEYS.checked);
    clearData();
    route();
  });
  $('signOut').addEventListener('click', async () => {
    await signOut();
    clearData();
    route();
  });
  const forget = async () => {
    if (!confirm(t('forgetQ'))) return;
    await signOut();
    forgetAll();
    clearData();
    applyLang('en');
    route();
  };
  $('forget').addEventListener('click', forget);
  $('setupForget').addEventListener('click', forget);
  const toDiag = () => {
    history.replaceState(null, '', location.pathname + '?diag');
    route();
  };
  $('toDiag').addEventListener('click', toDiag);
  $('setupDiag').addEventListener('click', toDiag);

  $('dPopup').addEventListener('click', async () => {
    try {
      await signInPopup();
      diag('Popup sign-in OK');
    } catch (e) {
      diag('Popup sign-in FAILED: ' + String((e as Error).message));
    }
  });
  $('dRedir').addEventListener('click', () => {
    try {
      signInRedirect({ returnTo: 'diag' });
    } catch (e) {
      diag('Redirect sign-in FAILED: ' + String((e as Error).message));
    }
  });
  $('dMode').addEventListener('click', () => {
    setAuthMode(authMode() === 'popup' ? 'redirect' : 'popup');
    diag('Switched the app to ' + authMode());
  });
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
  if (new URLSearchParams(location.search).has('diag')) {
    screen('diag');
    showMsg(null);
    diag();
    return;
  }
  if (!sheetId()) return showStep('sheet');
  if (!clientId()) return showStep('client');
  if (!getToken()) {
    if (lastRedirect.kind === 'error' && !lastRedirect.silent) return showStep('sign', t('eSign', { c: lastRedirect.error }));
    // Redirect method: renew without a tap once per session. Popup method needs a tap.
    if (authMode() === 'redirect' && wasSignedIn() && !silentTried()) {
      markSilent();
      return signInRedirect({ silent: true });
    }
    return showStep('sign');
  }
  load();
}

function main(): void {
  const saved = get(KEYS.lang);
  initApp({
    client,
    onAuthError,
    onCheck: showCheck,
    onReady: () => {
      screen('app');
      showMsg(null);
    },
  });
  applyLang(saved === 'he' ? 'he' : 'en');
  wire();
  lastRedirect = handleRedirect();
  if (lastRedirect.kind !== 'none' && lastRedirect.returnTo === 'diag') history.replaceState(null, '', location.pathname + '?diag');
  if (lastRedirect.kind === 'ok') diagLog.push('Redirect sign-in OK');
  route();
  if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('sw.js').catch(() => {});
}

main();
