import { describe, expect, it } from 'vitest';
import { systemPrompt, type AiSnapshot } from '../src/ai/context';
import { ask, AiError, cleanKey, looksLikeKey, resetModel } from '../src/ai/gemini';
import { parseGoals, parseHoldings, parseLoans, parsePension, parseSettings } from '../src/model';
import { goalsRows, holdingsRows, pensionRows, settingsRows } from './fixture';

const ACCOUNT = '987-654321';

function snapshot(): AiSnapshot {
  // Put account numbers in the sheet: they must never reach the AI.
  const hold = holdingsRows.map((r, i) => (i === 0 ? r : r.map((v, j) => (holdingsRows[0][j] === 'account_number' ? ACCOUNT + i : v))));
  const pen = [[...pensionRows[0], 'account_number'], ...pensionRows.slice(1).map((r) => [...r, ACCOUNT])];
  const s = parseSettings(settingsRows);
  return {
    today: '2026-11-25', lang: 'en', example: false, settings: s.raw,
    holdings: parseHoldings(hold, s.fx), pension: parsePension(pen), goals: parseGoals(goalsRows, 2026).goals, rainyDayFund: 120000,
    loans: parseLoans([['name', 'kind', 'balance_ILS', 'monthly_payment_ILS'], ['Car loan', 'installments', 36000, 1500]]),
    results: { postTax: 1, preTax: 2, afterDebts: 3, freeToday: 4, freeNote: '', scenario: 'Moderate', inflation: 'off', goals: [], loans: [], retirement: null, pension: null },
    guide: 'GUIDE TEXT',
  };
}

describe('what the AI is told', () => {
  it('includes the sheet data, the app results and the guide', () => {
    const p = systemPrompt(snapshot());
    expect(p).toContain('"vendor":"Vendor 2"');
    expect(p).toContain('"name":"Car loan"');
    expect(p).toContain('"freeToday":4');
    expect(p).toContain('GUIDE TEXT');
    expect(p).toContain('Answer in English');
  });

  it('never includes account numbers', () => {
    expect(systemPrompt(snapshot())).not.toContain(ACCOUNT);
  });

  it('asks for Hebrew answers in Hebrew mode and flags example data', () => {
    const p = systemPrompt({ ...snapshot(), lang: 'he', example: true });
    expect(p).toContain('Answer in Hebrew');
    expect(p).toContain('example data');
  });
});

describe('Gemini client', () => {
  const ok = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
  const err = (status: number, message: string) => new Response(JSON.stringify({ error: { message } }), { status });

  it('accepts any key format (the test call decides), only rejects what is clearly too short', () => {
    expect(looksLikeKey('AIza' + 'x'.repeat(35))).toBe(true);
    expect(looksLikeKey('AQ.' + 'Ab3_-'.repeat(8))).toBe(true);
    expect(looksLikeKey('sk-123')).toBe(false);
    expect(cleanKey('  AQ.abc\n def" ')).toBe('AQ.abcdef');
  });

  it('sends the key in a header, not the URL, and returns the answer', async () => {
    resetModel();
    let seen: { url: string; init: RequestInit } | null = null;
    const f = (async (url: string, init: RequestInit) => ((seen = { url, init }), ok('Three holdings.'))) as unknown as typeof fetch;
    expect(await ask('AIzaKEY', 'sys', [{ role: 'user', text: 'How many?' }], f)).toBe('Three holdings.');
    expect(seen!.url).not.toContain('AIzaKEY');
    expect((seen!.init.headers as Record<string, string>)['x-goog-api-key']).toBe('AIzaKEY');
    expect(JSON.parse(seen!.init.body as string).contents[0].parts[0].text).toBe('How many?');
  });

  it('falls back to another model when one is not available', async () => {
    resetModel();
    const urls: string[] = [];
    const f = (async (url: string) => (urls.push(url), urls.length === 1 ? err(404, 'not found') : ok('hi'))) as unknown as typeof fetch;
    expect(await ask('k', 's', [{ role: 'user', text: 'q' }], f)).toBe('hi');
    expect(urls).toHaveLength(2);
  });

  it('turns errors into plain codes', async () => {
    resetModel();
    const run = (r: Response) => ask('k', 's', [{ role: 'user', text: 'q' }], (async () => r) as unknown as typeof fetch).catch((e: AiError) => e.code);
    expect(await run(err(429, 'quota'))).toBe('limit');
    expect(await run(err(400, 'API key not valid. Please pass a valid API key.'))).toBe('badkey');
    expect(await run(err(403, 'permission denied'))).toBe('denied');
    expect(await run(err(402, 'Your prepayment credits are depleted. Please go to AI Studio'))).toBe('billing');
  });
});
