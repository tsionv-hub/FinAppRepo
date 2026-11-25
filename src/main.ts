// Startup and first run (SPEC 2): sheet link → sign-in setup (client ID) →
// Google sign-in → sheet check → planner. Plus the ?diag sign-in test (SPEC 7).

import { parseSheetId, SheetsClient } from './sheets/api';
import {
  authMode, clientId, forgetToken, getToken, handleRedirect, redirectUri, setAuthMode, setClientId, signInPopup,
  signInRedirect, signOut, validClientId, wasSignedIn, type RedirectResult,
} from './sheets/auth';
import type { Checklist } from './sheets/validate';
import { forgetAll, get, KEYS, nickOf, P, remove, removeSheet, saveSheet, savedSheets, set } from './storage';
import { templateXlsx } from './template';
import { exampleXlsx } from './example';
import { applyLang, clearData, errorText, initApp, load, showApp, showHelp, showMsg } from './ui/app';
import { t, type Lang } from './ui/i18n';
import { initAi, resumeKeySetup } from './ui/ai';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const K_SILENT = P + 'silent_tried';
/** "1.12.0" or "1.12.0-beta". */
const VERSION_LABEL = __APP_VERSION__ + (__APP_CHANNEL__ === 'beta' ? '-beta' : '');
/** Feedback address: set at build time (repo variable FEEDBACK_EMAIL), so it is not in the source. */
const FEEDBACK = ((import.meta.env.VITE_FEEDBACK_EMAIL as string | undefined) ?? '').trim();

/** Points the feedback links at the phone's mail app, with version and device filled in (never any financial data). */
function feedbackLinks(): void {
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const subject = t('fbSubj', { v: VERSION_LABEL });
  const body = t('fbBody', { v: VERSION_LABEL, l: document.documentElement.lang, i: standalone ? t('yes') : t('no'), d: navigator.userAgent });
  const href = 'mailto:' + FEEDBACK + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  for (const id of ['fbBtn', 'fbBtn2']) {
    const a = $<HTMLAnchorElement>(id);
    a.hidden = !FEEDBACK;
    a.href = href;
  }
}
/** Exploring the built-in example: in memory only, so reopening the app starts fresh. */
let demo = new URLSearchParams(location.search).has('example');

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

// ---------- saved sheets ----------

/** Setup screen: pick one of the saved sheets, or add a new link with a nickname. */
function fillSavedPicker(): void {
  const list = savedSheets();
  $('savedBox').hidden = !list.length;
  $<HTMLSelectElement>('savedSel').innerHTML = list.map((x) => `<option value="${esc(x.id)}">${esc(x.nick || t('noNick'))}</option>`).join('');
  $<HTMLInputElement>('sid').value = '';
  $<HTMLInputElement>('snick').value = '';
  $('sidErr').textContent = '';
}

/** Main screen, top: the current sheet's nickname; switch, rename or add a sheet. */
function renderSheetBar(): void {
  const cur = sheetId();
  const bar = $('sheetBar');
  bar.hidden = demo || !cur || $('app').hidden;
  if (bar.hidden) return;
  const sel = $<HTMLSelectElement>('sheetSel');
  sel.setAttribute('aria-label', t('sheetSelL'));
  sel.innerHTML = savedSheets().map((x) => `<option value="${esc(x.id)}"${x.id === cur ? ' selected' : ''}>${esc(x.nick || t('noNick'))}</option>`).join('')
    + `<option value="__rename">✏️ ${esc(t('nickRen'))}</option><option value="__add">➕ ${esc(t('sheetAdd'))}</option>`;
}

function useSheet(id: string): void {
  if (id === sheetId()) return;
  set(KEYS.sheet, id);
  clearData();
  route();
}

// ---------- screens ----------

type Step = 'sheet' | 'client' | 'sign' | 'check';

function screen(name: 'setup' | 'diag' | 'app'): void {
  $('setup').hidden = name !== 'setup';
  $('diag').hidden = name !== 'diag';
  $('app').hidden = name !== 'app';
  $('aiBtn').hidden = name !== 'app';
}

function showStep(step: Step, err?: string | null): void {
  screen('setup');
  $('setupSheet').hidden = step !== 'sheet';
  $('setupDemo').hidden = step !== 'sheet';
  $('setupClient').hidden = step !== 'client';
  $('setupSign').hidden = step !== 'sign';
  $('setupCheck').hidden = step !== 'check';
  if (step !== 'check') $('reload').hidden = true;
  $('sheetBar').hidden = true;
  if (step === 'sheet') fillSavedPicker();
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

let lastCheck: [Checklist, boolean] | null = null;

function showCheck(c: Checklist, canOpen: boolean): void {
  lastCheck = [c, canOpen];
  showStep('check');
  $('chkSum').textContent = canOpen ? t('chkOk') : t('chkBad');
  $<HTMLButtonElement>('openApp').disabled = !canOpen;
  const kindL = { tab: t('tabL'), column: t('colL'), key: t('keyL') };
  // Show what matters: every tab, and only the missing columns and keys.
  $('chkList').innerHTML = c.items
    .filter((i) => i.kind === 'tab' || !i.found)
    .map((i) => {
      const where = i.kind === 'tab' ? t('chkTab', { t: esc(i.name) }) : `${esc(i.tab)}: ${kindL[i.kind]} <b dir="ltr">${esc(i.name)}</b>`;
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

function download(bytes: Uint8Array, name: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
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
  const mode = authMode() === 'popup' ? t('mPopup') : t('mRedirect');
  const lines = [
    'Finance Planner v' + VERSION_LABEL,
    t('dgInst') + ': ' + (standalone ? t('yes') : t('dgNotInst')),
    t('dgDev') + ': ' + navigator.userAgent,
    t('dgOnline') + ': ' + (navigator.onLine ? t('yes') : t('no')),
    t('dgCid') + ': ' + (cid ? cid.slice(0, 8) + '…' : t('dgNotSet')),
    t('dgOrigin') + ': ' + location.origin,
    t('dgRedirUri') + ': ' + redirectUri(),
    t('dgMode') + ': ' + mode,
    t('dgSheet') + ': ' + (id ? id.slice(0, 4) + '…' + id.slice(-4) : t('no')),
    t('dgTok') + ': ' + (tok ? t('dgTokOk', { m: Math.round((tok.expiresAt - Date.now()) / 60000) }) : t('dgTokNo')),
    t('dgLast') + ': ' + JSON.stringify(lastRedirect),
    t('dgSw') + ': ' + (navigator.serviceWorker?.controller ? t('dgSwOn') : t('dgSwOff')),
    '',
    ...diagLog,
  ];
  $('diagOut').textContent = lines.join('\n');
  $('dMode').textContent = authMode() === 'popup' ? t('dgToRedir') : t('dgToPopup');
}

async function diagRead(): Promise<void> {
  const c = client();
  if (!c) return diag(t('dgNoSheet'));
  const t0 = performance.now();
  try {
    const m = await c.meta();
    const [rows] = await c.batchGet(["'Settings'!A1:B3"]);
    diag(t('dgReadOk', { ms: Math.round(performance.now() - t0), t: m.title, tabs: m.tabs.join(', '), n: rows.length }));
  } catch (e) {
    diag(t('dgReadFail', { e: errorText(e) + ' ' + String((e as Error).message ?? '') }));
  }
}

// ---------- wiring ----------

function wire(): void {
  $('lb').addEventListener('click', () => {
    const l: Lang = document.documentElement.lang === 'he' ? 'en' : 'he';
    set(KEYS.lang, l);
    applyLang(l);
    feedbackLinks();
    // Texts built in code (not data-t) need redrawing in the new language.
    if (!$('diag').hidden) diag();
    else if ($('setup').hidden) return renderSheetBar(); // main screen: applyLang already re-rendered it
    else if (!$('setupCheck').hidden && lastCheck) showCheck(...lastCheck);
    else if (!$('setupSign').hidden) showStep('sign');
    else if (!$('setupClient').hidden) showStep('client');
  });
  $('sidGo').addEventListener('click', () => {
    const id = parseSheetId($<HTMLInputElement>('sid').value);
    const nick = $<HTMLInputElement>('snick').value.trim() || nickOf(id ?? '');
    $('sidErr').textContent = !id ? t('badId') : !nick ? t('nickNeed') : '';
    if (!id || !nick) return;
    saveSheet(id, nick);
    set(KEYS.sheet, id);
    route();
  });
  $('savedGo').addEventListener('click', () => {
    const id = $<HTMLSelectElement>('savedSel').value;
    if (!id) return;
    set(KEYS.sheet, id);
    route();
  });
  $('sheetSel').addEventListener('change', () => {
    const sel = $<HTMLSelectElement>('sheetSel');
    const v = sel.value;
    const cur = sheetId();
    if (v === '__rename') {
      const n = prompt(t('nickQ'), nickOf(cur));
      if (n != null && n.trim()) saveSheet(cur, n);
      renderSheetBar();
    } else if (v === '__add') {
      sel.value = cur;
      showStep('sheet');
      $<HTMLInputElement>('sid').focus();
    } else useSheet(v);
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
  for (const b of ['tplBtn', 'tplBtn2']) $(b).addEventListener('click', () => download(templateXlsx(), 'finance-planner-template.xlsx'));
  $('exBtn').addEventListener('click', () => download(exampleXlsx(), 'finance-planner-example.xlsx'));
  $('demoGo').addEventListener('click', () => {
    demo = true;
    route();
  });
  $('demoExit').addEventListener('click', () => {
    demo = false;
    clearData();
    if (location.search.includes('example')) history.replaceState(null, '', location.pathname);
    route();
  });
  $('chgSheet').addEventListener('click', () => {
    remove(KEYS.sheet);
    clearData();
    route();
  });
  $('signOut').addEventListener('click', async () => {
    await signOut();
    clearData();
    route();
  });
  const forgetEverything = async () => {
    await signOut();
    forgetAll();
    clearData();
    applyLang('en');
    route();
  };
  // Main screen: remove this sheet from the phone's list; the last one also clears everything else.
  $('forget').addEventListener('click', async () => {
    const cur = sheetId();
    const others = savedSheets().filter((x) => x.id !== cur);
    if (!confirm(others.length ? t('rmQ', { n: nickOf(cur) || t('noNick') }) : t('forgetQ'))) return;
    if (!others.length) return forgetEverything();
    removeSheet(cur);
    clearData();
    route();
  });
  $('setupForget').addEventListener('click', async () => {
    if (confirm(t('forgetQ'))) await forgetEverything();
  });
  const toDiag = () => {
    history.replaceState(null, '', location.pathname + '?diag');
    route();
  };
  $('toDiag').addEventListener('click', toDiag);
  $('setupDiag').addEventListener('click', toDiag);

  $('dPopup').addEventListener('click', async () => {
    try {
      await signInPopup();
      diag(t('dgPopOk'));
    } catch (e) {
      diag(t('dgPopFail', { e: String((e as Error).message) }));
    }
  });
  $('dRedir').addEventListener('click', () => {
    try {
      signInRedirect({ returnTo: 'diag' });
    } catch (e) {
      diag(t('dgRedFail', { e: String((e as Error).message) }));
    }
  });
  $('dMode').addEventListener('click', () => {
    setAuthMode(authMode() === 'popup' ? 'redirect' : 'popup');
    diag(t('dgSwitched', { m: authMode() === 'popup' ? t('mPopup') : t('mRedirect') }));
  });
  $('dRead').addEventListener('click', diagRead);
  $('dOut').addEventListener('click', async () => {
    await signOut();
    diag(t('dgSignedOut'));
  });
  $('dBack').addEventListener('click', () => {
    history.replaceState(null, '', location.pathname);
    route();
  });
}

/**
 * After a deploy, a phone can still be running the previous version. On start
 * (when online) compare with the site's version.json and reload once if newer.
 */
async function checkForUpdate(): Promise<void> {
  if (!navigator.onLine || !import.meta.env.PROD) return;
  try {
    const r = await fetch('version.json', { cache: 'no-store' });
    const { version } = (await r.json()) as { version: string };
    if (!version || version === __APP_VERSION__) return;
    const tried = sessionStorage.getItem(P + 'update_tried');
    if (tried === version) return; // already reloaded for this version: never loop
    sessionStorage.setItem(P + 'update_tried', version);
    location.reload();
  } catch {
    /* offline or no version file: keep running this version */
  }
}

function route(): void {
  $('demoBar').hidden = !demo;
  $('foot').hidden = demo;
  if (demo) {
    load();
    return;
  }
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
      renderSheetBar();
      resumeKeySetup();
    },
    demo: () => demo,
  });
  applyLang(saved === 'he' ? 'he' : 'en');
  // Older versions marked the sheet check as done with "1": that meant the current sheet.
  if (get(KEYS.checked) === '1') set(KEYS.checked, JSON.stringify(sheetId() ? [sheetId()] : []));
  $('ver').textContent = 'v' + VERSION_LABEL;
  $('verTop').textContent = '(v' + VERSION_LABEL + ')';
  $('verTop').classList.toggle('beta', __APP_CHANNEL__ === 'beta');
  feedbackLinks();
  initAi(() => demo);
  $('helpBtn').addEventListener('click', showHelp);
  wire();
  lastRedirect = handleRedirect();
  if (lastRedirect.kind !== 'none' && lastRedirect.returnTo === 'diag') history.replaceState(null, '', location.pathname + '?diag');
  if (lastRedirect.kind === 'ok') diagLog.push(t('dgRedOk'));
  route();
  if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('sw.js').then((r) => r.update()).catch(() => {});
  checkForUpdate();
  // Coming back to an app left open in the background also checks.
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && checkForUpdate());
}

main();
