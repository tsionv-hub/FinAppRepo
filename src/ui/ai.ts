// "Ask AI": a chat with Google Gemini about the user's own data.
// Flow: first time, a red privacy warning → key setup → chat. Later, a short
// reminder once per app opening (with "Don't show again" from the 4th time) → chat.
// The app stores no questions or answers; the conversation lives in memory
// while the chat is open and is gone when it closes.

import { systemPrompt } from '../ai/context';
import { AiError, ask, cleanKey, looksLikeKey, type ChatTurn } from '../ai/gemini';
import { get, KEYS, remove, set } from '../storage';
import { aiSnapshot, openDialog } from './app';
import { t } from './i18n';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** The AI's answer as safe HTML: escaped, with **bold** and line breaks kept. */
const fmt = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');

const AI_STUDIO = 'https://aistudio.google.com/apikey';

let isDemo: () => boolean = () => false;
/** The reminder shows once per app opening. */
let remindedThisOpening = false;
/** The full privacy warning was accepted during this opening (it is only remembered for good once a key works). */
let acceptedThisOpening = false;
let history: ChatTurn[] = [];
let busy = false;
/** Set while the key setup popup is the one showing. */
let keySetupShown = false;
/** True between tapping the AI Studio link and coming back. */
let awayToStudio = false;

function closeDlg(): void {
  const d = $<HTMLDialogElement>('dlg');
  if (d.open) d.close();
}

/** Entry point: the floating 💬 button. */
export function startAi(): void {
  // Until a key actually works, the full warning is shown every time.
  if (!get(KEYS.aiKey) && !acceptedThisOpening) return warning();
  if (!get(KEYS.aiQuiet) && !remindedThisOpening) return reminder();
  if (!get(KEYS.aiKey)) return keySetup();
  openChat();
}

function warning(): void {
  openDialog(t('aiWT'), '', `<div class="ai-warn"><p>${t('aiW1')}</p><p>${t('aiW2')}</p></div>`
    + `<ul class="ai-ok"><li>${t('aiW3')}</li><li>${t('aiW4')}</li><li>${t('aiW5')}</li></ul>`
    + `<div class="ai-btns"><button class="s" data-ai="cancel">${t('aiCancel')}</button><button data-ai="agree">${t('aiAgree')}</button></div>`);
}

function reminder(): void {
  const seen = parseInt(get(KEYS.aiSeen), 10) || 0;
  openDialog(t('aiRT'), '', `<p class="dhelp">${t('aiR1')}</p>`
    + (seen >= 3 ? `<label class="chk"><input type="checkbox" id="aiQuietChk">${t('aiQuiet')}</label>` : '')
    + `<div class="ai-btns"><button data-ai="gotit">${t('aiGot')}</button></div>`);
}

function keySetup(msg = ''): void {
  openDialog(t('aiKT'), '', `<ol class="steps"><li>${t('aiK1')}</li><li>${t('aiK2')}</li><li>${t('aiK3')}</li><li>${t('aiK4')}</li></ol>`
    + `<a class="hwlink" id="aiStudio" href="${AI_STUDIO}" target="_blank" rel="noopener">${t('aiKLink')}</a>`
    + `<label for="aiKey" style="margin-top:12px">${t('aiKL')}</label><input type="text" id="aiKey" autocomplete="off" autocapitalize="off" spellcheck="false">`
    + `<div class="lbl" id="aiKMsg" style="margin-top:6px">${msg}</div>`
    + `<div class="ai-btns"><button data-ai="savekey">${t('aiKSave')}</button></div><p class="lbl">${t('aiKN')}</p>`);
  keySetupShown = true;
}

/**
 * Coming back from AI Studio: on iPhone the page opens on top of the app and can
 * even reload it, so the steps and the paste box come back by themselves.
 */
export function resumeKeySetup(): void {
  // Only right after the user accepted the warning and left for AI Studio.
  if (!get(KEYS.aiSetup) || get(KEYS.aiKey)) return;
  if ($<HTMLDialogElement>('dlg').open && keySetupShown) return;
  if ($('app').hidden) return;
  remindedThisOpening = true; // they just accepted the privacy note
  acceptedThisOpening = true;
  keySetup(t('aiKBack'));
}

async function saveKey(): Promise<void> {
  const key = cleanKey($<HTMLInputElement>('aiKey').value);
  const m = $('aiKMsg');
  if (!looksLikeKey(key)) {
    m.textContent = t('aiKBad');
    m.className = 'lbl bad';
    return;
  }
  m.textContent = t('aiKTesting');
  m.className = 'lbl';
  try {
    await ask(key, 'Reply with the single word OK.', [{ role: 'user', text: 'ping' }]);
    set(KEYS.aiKey, key);
    set(KEYS.aiOk, '1'); // the warning counts as accepted for good only now
    remove(KEYS.aiSetup);
    closeDlg();
    openChat();
  } catch (e) {
    if (e instanceof AiError && e.code === 'billing') {
      // Key is fine, but its project is on prepaid billing with no credit: explain and link.
      m.innerHTML = `${esc(t('aiKBilling'))} <a href="https://ai.studio/projects" target="_blank" rel="noopener">${esc(t('aiKProjects'))}</a>`;
    } else {
      // Show Google's own reason in full, so a wrong key, a key without Gemini access, etc. are clear.
      m.textContent = t('aiKFail', { c: String((e as Error).message ?? e) });
    }
    m.className = 'lbl bad';
  }
}

function errText(e: unknown): string {
  const c = e instanceof AiError ? e.code : 'other';
  if (c === 'badkey') return t('aiErrKey');
  if (c === 'limit') return t('aiErrLimit');
  if (c === 'billing') return t('aiKBilling');
  if (c === 'network') return t('aiErrNet');
  if (c === 'blocked') return t('aiErrBlock');
  if (c === 'denied') return t('aiErrDenied', { c: (e as Error).message.slice(0, 80) });
  return t('aiErrOther', { c: String((e as Error)?.message ?? e).slice(0, 80) });
}

// ---------- chat ----------

function render(extra = ''): void {
  const log = $('aiLog');
  const examples = history.length ? '' : `<div class="ai-ex">${['aiEx1', 'aiEx2', 'aiEx3'].map((k) => `<button class="s" data-ask="${esc(t(k as never))}">${t(k as never)}</button>`).join('')}</div>`;
  log.innerHTML = examples + history.map((h) => `<div class="ai-msg ${h.role === 'user' ? 'me' : 'bot'}">${h.role === 'user' ? esc(h.text) : fmt(h.text)}</div>`).join('') + extra;
  log.scrollTop = log.scrollHeight;
}

function openChat(): void {
  history = [];
  $('aiDemo').hidden = !isDemo();
  render();
  const d = $<HTMLDialogElement>('aiChat');
  if (!d.open) d.showModal();
  $<HTMLTextAreaElement>('aiIn').focus();
}

async function send(text: string): Promise<void> {
  const q = text.trim();
  const key = get(KEYS.aiKey);
  if (!q || busy || !key) return;
  const snap = aiSnapshot(isDemo());
  if (!snap) return;
  busy = true;
  $<HTMLTextAreaElement>('aiIn').value = '';
  history.push({ role: 'user', text: q });
  render(`<div class="ai-msg bot wait">${t('aiThinking')}</div>`);
  try {
    const answer = await ask(key, systemPrompt(snap), history);
    history.push({ role: 'model', text: answer });
    render();
  } catch (e) {
    history.pop(); // the question wasn't answered: let it be asked again
    render(`<div class="ai-msg err">${esc(errText(e))}</div>`);
    $<HTMLTextAreaElement>('aiIn').value = q;
  }
  busy = false;
}

export function initAi(demo: () => boolean): void {
  isDemo = demo;
  $('aiBtn').addEventListener('click', startAi);
  // Buttons inside the shared popup (warning, reminder, key setup).
  $('dlgB').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-ai]');
    if (!b) return;
    const a = b.dataset.ai;
    if (a === 'cancel') closeDlg();
    if (a === 'agree') {
      acceptedThisOpening = true;
      remindedThisOpening = true;
      closeDlg();
      startAi();
    }
    if (a === 'gotit') {
      set(KEYS.aiSeen, String((parseInt(get(KEYS.aiSeen), 10) || 0) + 1));
      if ($<HTMLInputElement>('aiQuietChk')?.checked) set(KEYS.aiQuiet, '1');
      remindedThisOpening = true;
      closeDlg();
      startAi();
    }
    if (a === 'savekey') saveKey();
  });
  // Leaving for AI Studio: remember we're mid-setup.
  $('dlgB').addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('#aiStudio')) {
      set(KEYS.aiSetup, '1');
      awayToStudio = true;
    }
  });
  // Closing the key setup on purpose ends it; the popup closing for any other reason doesn't.
  $('dlg').addEventListener('close', () => {
    if (keySetupShown && !awayToStudio && !get(KEYS.aiKey)) remove(KEYS.aiSetup);
    keySetupShown = false;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    awayToStudio = false;
    resumeKeySetup();
  });
  $('aiSend').addEventListener('click', () => send($<HTMLTextAreaElement>('aiIn').value));
  $<HTMLTextAreaElement>('aiIn').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send($<HTMLTextAreaElement>('aiIn').value);
    }
  });
  $('aiLog').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-ask]');
    if (b) send(b.dataset.ask!);
  });
  $('aiX').addEventListener('click', () => $<HTMLDialogElement>('aiChat').close());
  // Closing the chat forgets the conversation: nothing is kept.
  $('aiChat').addEventListener('close', () => {
    history = [];
    $('aiLog').innerHTML = '';
  });
  $('aiRm').addEventListener('click', () => {
    remove(KEYS.aiKey);
    $<HTMLDialogElement>('aiChat').close();
    openDialog(t('aiChatT'), '', `<p class="dhelp">${t('aiRemoved')}</p>`);
  });
}
