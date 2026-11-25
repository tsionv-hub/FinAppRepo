// Minimal Google Gemini client. Calls go straight from the phone to Google with
// the user's own API key (kept on the phone only). Nothing is logged or stored.

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
/** Tried in order; the first that exists for this key is remembered for the session. */
export const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];

export type AiErrorCode = 'badkey' | 'denied' | 'limit' | 'blocked' | 'network' | 'other';

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

/** Sends the conversation; returns the model's answer text. */
export async function ask(key: string, system: string, turns: ChatTurn[], fetcher: typeof fetch = fetch): Promise<string> {
  const models = workingModel ? [workingModel] : MODELS;
  let last: AiError | null = null;
  for (const model of models) {
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
      last = new AiError('other', msg); // this model isn't available: try the next one
      continue;
    }
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
