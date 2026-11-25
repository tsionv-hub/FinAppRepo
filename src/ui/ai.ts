// "Ask AI": a chat with Google Gemini about the user's own data.
// Flow: first time, a red privacy warning → key setup → chat. Later, a short
// reminder once per app opening (with "Don't show again" from the 4th time) → chat.
// The app stores no questions or answers; the conversation lives in memory
// while the chat is open and is gone when it closes.

import { systemPrompt } from '../ai/context';
import { AiError, ask, looksLikeKey, type ChatTurn } from '../ai/gemini';
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
let history: ChatTurn[] = [];
let busy = false;

function closeDlg(): void {
  const d = $<HTMLDialogElement>('dlg');
  if (d.open) d.close();
}

/** Entry point: the floating 💬 button. */
export function startAi(): void {
  if (!get(KEYS.aiOk)) return warning();
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
    + `<a class="hwlink" href="${AI_STUDIO}" target="_blank" rel="noopener">${t('aiKLink')}</a>`
    + `<label for="aiKey" style="margin-top:12px">${t('aiKL')}</label><input type="text" id="aiKey" autocomplete="off" autocapitalize="off" spellcheck="false">`
    + `<div class="lbl" id="aiKMsg" style="margin-top:6px">${msg}</div>`
    + `<div class="ai-btns"><button data-ai="savekey">${t('aiKSave')}</button></div><p class="lbl">${t('aiKN')}</p>`);
}

async function saveKey(): Promise<void> {
  const key = $<HTMLInputElement>('aiKey').value.trim();
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
    closeDlg();
    openChat();
  } catch (e) {
    m.textContent = t('aiKFail', { c: (e as AiError).code ?? 'error' });
    m.className = 'lbl bad';
  }
}

function errText(e: unknown): string {
  const c = e instanceof AiError ? e.code : 'other';
  if (c === 'badkey') return t('aiErrKey');
  if (c === 'limit') return t('aiErrLimit');
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
      set(KEYS.aiOk, '1');
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
