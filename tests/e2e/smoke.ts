// End-to-end smoke test against a built app (npm run build && npm run preview).
// Google is mocked: the OAuth page redirects straight back with a fake token and
// the Sheets API is served from the fictional fixture. Run: npx tsx tests/e2e/smoke.ts [url] [outDir]
import { createRequire } from 'node:module';
// Resolved with require so a globally installed Playwright works too (set NODE_PATH).
const { chromium, devices } = createRequire(import.meta.url)('playwright') as typeof import('playwright');
import { goalsRows, holdingsRows, pensionRows, settingsRows } from '../fixture';

const URL0 = process.argv[2] ?? 'http://localhost:4173/';
const OUT = process.argv[3] ?? '.';
const SHEET = 'TESTSHEET_abcdefghijklmnopqrstuvwxyz0123';
const tabs: Record<string, unknown[][]> = { Settings: settingsRows, Holdings: holdingsRows, Goals: goalsRows, Pension: pensionRows };
const writes: { method: string; url: string; body: unknown }[] = [];
const fail = (m: string) => { console.error('FAIL: ' + m); process.exitCode = 1; };
const ok = (c: unknown, m: string) => (c ? console.log('ok   ' + m) : fail(m));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await ctx.route('https://accounts.google.com/**', async (route) => {
    const u = new URL(route.request().url());
    const q = u.searchParams;
    ok(q.get('response_type') === 'token' && q.get('scope') === 'https://www.googleapis.com/auth/spreadsheets', 'OAuth request asks for a token with the Sheets scope');
    const back = `${q.get('redirect_uri')}#access_token=FAKE&token_type=Bearer&expires_in=3599&scope=${encodeURIComponent(q.get('scope')!)}&state=${q.get('state')}`;
    await route.fulfill({ status: 302, headers: { location: back } });
  });
  await ctx.route('https://sheets.googleapis.com/**', async (route) => {
    const r = route.request();
    const u = new URL(r.url());
    ok(r.headers()['authorization'] === 'Bearer FAKE', `Sheets call carries the token (${r.method()} ${u.pathname.split('/').pop()})`);
    if (r.method() !== 'GET') {
      writes.push({ method: r.method(), url: decodeURIComponent(u.pathname), body: r.postDataJSON() });
      return route.fulfill({ json: {} });
    }
    if (u.searchParams.get('fields')) return route.fulfill({ json: { properties: { title: 'Test sheet' }, sheets: Object.keys(tabs).map((title) => ({ properties: { title } })) } });
    const ranges = u.searchParams.getAll('ranges');
    return route.fulfill({ json: { valueRanges: ranges.map((x) => ({ values: tabs[x.split('!')[0].replace(/'/g, '')] })) } });
  });

  // 1. First launch: sheet link, then sign-in.
  await page.goto(URL0);
  ok(await page.isVisible('#setupSheet'), 'first launch asks for the sheet link');
  await page.fill('#sid', 'https://example.com/nope');
  await page.click('#sidGo');
  ok((await page.textContent('#sidErr'))!.length > 0, 'rejects a non-Sheets link');
  await page.fill('#sid', `https://docs.google.com/spreadsheets/d/${SHEET}/edit#gid=0`);
  await page.click('#sidGo');
  ok(await page.isVisible('#setupSign'), 'then asks to sign in');
  await page.click('#signIn');
  await page.waitForSelector('#app:not([hidden])', { timeout: 15000 });
  ok(!page.url().includes('access_token'), 'token removed from the URL after sign-in');
  await page.waitForFunction(() => document.getElementById('fm')!.textContent!.includes('₪'));

  // 2. Panels.
  const txt = async (s: string) => (await page.textContent(s))!.replace(/[⁦⁩]/g, '');
  console.log('     post-tax', await txt('#post'), '| pre-tax', await txt('#pre'), '| free', await txt('#fm'));
  ok(/₪[\d,]+/.test(await txt('#post')), 'totals rendered');
  ok((await page.locator('#cl .lg').count()) === 4, 'colored money legend has 4 lines (reserve, retirement, other goals, free)');
  ok((await page.locator('#chart circle').count()) === 4, 'chart has one marker per goal (3 goals + retirement)');
  ok((await page.locator('#chart rect').count()) === 1, 'chart has the retirement band');
  ok((await page.locator('#nx .g').count()) === 3, 'next goals shows three');
  ok(await page.evaluate(() => [...document.querySelectorAll('details.card')].filter((d) => (d as HTMLDetailsElement).open).length) === 2, 'only Free money and Projection start open');
  await page.screenshot({ path: OUT + '/app-en.png', fullPage: true });

  // 3. What-ifs: scenario and slider.
  const before = await txt('#fm');
  await page.selectOption('#sc', 'pes');
  await page.waitForFunction((b) => document.getElementById('fm')!.textContent!.replace(/[⁦⁩]/g, '') !== b, before);
  ok(true, 'scenario change recomputes free money: ' + before + ' -> ' + (await txt('#fm')));
  await page.selectOption('#sc', 'mod');
  await page.$eval('#tm', (e: HTMLInputElement) => { e.value = '60'; e.dispatchEvent(new Event('input')); });
  ok((await txt('#th')).startsWith('Status in'), 'slider shows status for the chosen month: ' + (await txt('#th')));

  // 4. Add a goal and save; save reserve; save retirement.
  await page.click('#goals >> xpath=..');
  await page.fill('#gn', 'Boat');
  await page.fill('#ga', '50000');
  await page.fill('#gy', '2030');
  await page.selectOption('#gmo', '4');
  await page.click('#gb');
  ok(await page.isVisible('#sv'), 'save button appears for the pending goal');
  await page.click('#sv');
  await page.waitForFunction(() => document.getElementById('gm')!.textContent!.includes('Saved'));
  const ap = writes.find((w) => w.url.endsWith(':append'));
  ok(ap && JSON.stringify((ap.body as { values: unknown[][] }).values[0]) === JSON.stringify(['G7', 'Boat', 50000, 2030, 4, 7, 'Added in app', 1, '']), 'goal appended in the Goals column order: ' + JSON.stringify((ap?.body as { values: unknown })?.values));
  await page.click('summary:has(h2[data-t=assum])');
  await page.fill('#rd', '130000');
  await page.click('#rb');
  await page.waitForFunction(() => document.getElementById('gm')!.textContent!.includes('Rainy'));
  ok(writes.some((w) => w.url.includes("'Goals'!C2") && JSON.stringify(w.body).includes('130000')), 'rainy day fund written to Goals!C2');
  await page.fill('#ra', '57');
  await page.click('#rb2');
  await page.waitForFunction(() => document.getElementById('gm')!.textContent!.includes('Retirement'));
  ok(writes.some((w) => w.url.includes("'Settings'!B17") && JSON.stringify(w.body).includes('57')), 'retirement age written to Settings!B17');
  ok(writes.length === 4, 'exactly 4 writes, all from save buttons (' + writes.length + ')');

  // 5. Hebrew.
  await page.click('#lb');
  ok((await page.getAttribute('html', 'dir')) === 'rtl', 'Hebrew switches to right-to-left');
  ok(await page.isDisabled('#gb') && await page.isDisabled('#rb'), 'adding and saving disabled in Hebrew');
  ok((await page.textContent('#goals'))!.includes('החתונה של Alex'), 'goal names translated');
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
  await page.screenshot({ path: OUT + '/app-he.png', fullPage: true });
  await page.click('#lb');

  // 6. Horizontal overflow at phone width.
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal scroll at phone width');

  // 7. Diagnostics screen.
  await page.goto(URL0 + '?diag');
  await page.click('#dRead');
  await page.waitForFunction(() => document.getElementById('diagOut')!.textContent!.includes('Test read'));
  ok((await page.textContent('#diagOut'))!.includes('Test read OK'), 'diag test read works');
  await page.screenshot({ path: OUT + '/diag.png', fullPage: true });

  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})();
