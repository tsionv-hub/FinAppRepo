// Minimal Google Gemini client. Calls go straight from the phone to Google with
// the user's own API key (kept on the phone only). Nothing is logged or stored.

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
/** Tried in order; the first that exists for this key is remembered for the session. */
export const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.0-flash'];

export type AiErrorCode = 'badkey' | 'billing' | 'denied' | 'limit' | 'busy' | 'blocked' | 'network' | 'other';

export class AiError extends Error {
  constructor(public code: AiErrorCode, message: string) {
    super(message);
  }
}

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

/** Cleans a pasted key (spaces, line breaks, quotes). */
export function cleanKey(k: string): string {
  return k.replace(/[\s"'“”]/g, '');
}

/** Only rejects what clearly isn't a key (too short); the test call decides the rest. */
export function looksLikeKey(k: string): boolean {
  return cleanKey(k).length >= 20;
}

let workingModel: string | null = null;

type GenResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
};

async function call(key: string, model: string, system: string, turns: ChatTurn[], fetcher: typeof fetch): Promise<Response> {
  return fetcher(BASE + encodeURIComponent(model) + ':generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
      generationConfig: { temperature: 0.2 },
    }),
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends the conversation; returns the model's answer text.
 * Busy models (503/500/504, common on the free tier) are skipped for the next
 * model; if every model is busy, it waits briefly and tries the first once more.
 */
export async function ask(key: string, system: string, turns: ChatTurn[], fetcher: typeof fetch = fetch, sleep: (ms: number) => Promise<unknown> = wait): Promise<string> {
  const base = workingModel ? [workingModel, ...MODELS.filter((m) => m !== workingModel)] : MODELS;
  let last: AiError | null = null;
  let busy = 0;
  const order = [...base, base[0]];
  for (let i = 0; i < order.length; i++) {
    const model = order[i];
    if (i === order.length - 1) {
      if (busy === 0) break; // the extra retry is only for "everything was busy"
      await sleep(2000);
    }
    let r: Response;
    try {
      r = await call(key, model, system, turns, fetcher);
    } catch (e) {
      throw new AiError('network', String(e));
    }
    let j: GenResponse = {};
    try {
      j = (await r.json()) as GenResponse;
    } catch {
      /* ignore */
    }
    if (r.ok) {
      workingModel = model;
      if (j.promptFeedback?.blockReason) throw new AiError('blocked', j.promptFeedback.blockReason);
      const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
      if (!text) throw new AiError('blocked', j.candidates?.[0]?.finishReason ?? 'empty');
      return text;
    }
    const msg = j.error?.message ?? r.statusText;
    if (r.status === 404) {
      last = last ?? new AiError('other', msg); // this model isn't available: try the next one
      continue;
    }
    if (r.status === 503 || r.status === 500 || r.status === 504) {
      busy++;
      last = new AiError('busy', `${r.status} ${msg}`); // overloaded: try another model
      continue;
    }
    // 402: the key's project is on paid/prepaid billing with no credit left.
    if (r.status === 402 || /prepay|credits? (are|is) depleted|billing/i.test(msg)) throw new AiError('billing', msg);
    if (r.status === 429) throw new AiError('limit', msg);
    if (r.status === 400 && /api key/i.test(msg)) throw new AiError('badkey', msg);
    if (r.status === 401 || r.status === 403) throw new AiError(/api key/i.test(msg) ? 'badkey' : 'denied', msg);
    throw new AiError('other', `${r.status} ${msg}`);
  }
  throw last ?? new AiError('other', 'no model');
}

/** For tests: forget which model worked. */
export function resetModel(): void {
  workingModel = null;
}
