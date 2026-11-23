// End-to-end smoke test against a built app (npm run build && npm run preview).
// Google is mocked: the sign-in library (popup method) and the OAuth page
// (redirect method) hand back a fake token, and the Sheets API is served from
// the fictional fixture. Run: npx tsx tests/e2e/smoke.ts [url] [outDir]
import { createRequire } from 'node:module';
import { goalsRows, holdingsRows, pensionRows, settingsRows } from '../fixture';
// Resolved with require so a globally installed Playwright works too (set NODE_PATH).
const { chromium, devices } = createRequire(import.meta.url)('playwright') as typeof import('playwright');

const URL0 = process.argv[2] ?? 'http://localhost:4173/';
const OUT = process.argv[3] ?? '.';
const SHEET = 'TESTSHEET_abcdefghijklmnopqrstuvwxyz0123';
const CLIENT = 'test-client-123.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const settings = settingsRows.map((r) => (r[0] === 'display_currency' ? ['display_currency', 'USD'] : r));
let tabs: Record<string, unknown[][]> = { Settings: settings, Holdings: holdingsRows, Goals: goalsRows, Pension: pensionRows };
let sheetsMode: 'ok' | 'ratelimit' | 'offline' = 'ok';
const writes: { method: string; url: string; body: unknown }[] = [];
let badAuth = 0;
const fail = (m: string) => { console.error('FAIL: ' + m); process.exitCode = 1; };
const ok = (c: unknown, m: string) => (c ? console.log('ok   ' + m) : fail(m));

const FAKE_GIS = `window.google={accounts:{oauth2:{initTokenClient:function(c){return{requestAccessToken:function(){
  if(c.client_id!==${JSON.stringify(CLIENT)})return c.error_callback({type:'bad_client'});
  setTimeout(function(){c.callback({access_token:'FAKE',expires_in:3599,scope:${JSON.stringify(SCOPE)}})},20)}}}}}};`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  page.on('dialog', (d) => d.accept());

  await ctx.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE_GIS }));
  await ctx.route('https://accounts.google.com/o/oauth2/**', async (route) => {
    const q = new URL(route.request().url()).searchParams;
    ok(q.get('response_type') === 'token' && q.get('scope') === SCOPE && q.get('client_id') === CLIENT, 'redirect method: token request with the Sheets scope and the entered client ID');
    const back = `${q.get('redirect_uri')}#access_token=FAKE&token_type=Bearer&expires_in=3599&scope=${encodeURIComponent(SCOPE)}&state=${q.get('state')}`;
    await route.fulfill({ status: 302, headers: { location: back } });
  });
  await ctx.route('https://oauth2.googleapis.com/revoke**', (r) => r.fulfill({ json: {} }));
  await ctx.route('https://sheets.googleapis.com/**', async (route) => {
    const r = route.request();
    const u = new URL(r.url());
    if (r.headers()['authorization'] !== 'Bearer FAKE') badAuth++;
    // Mocked routes still answer under setOffline, so drop the request like a dead network would.
    if (sheetsMode === 'offline') return route.abort('internetdisconnected');
    if (sheetsMode === 'ratelimit') return route.fulfill({ status: 429, json: { error: { message: 'Quota exceeded' } } });
    if (r.method() !== 'GET') {
      writes.push({ method: r.method(), url: decodeURIComponent(u.pathname), body: r.postDataJSON() });
      return route.fulfill({ json: {} });
    }
    if (u.searchParams.get('fields')) return route.fulfill({ json: { properties: { title: 'Test sheet' }, sheets: Object.keys(tabs).map((title) => ({ properties: { title } })) } });
    const ranges = u.searchParams.getAll('ranges');
    return route.fulfill({ json: { valueRanges: ranges.map((x) => ({ values: tabs[x.split('!')[0].replace(/'/g, '')] ?? [] })) } });
  });
  const txt = async (s: string) => ((await page.textContent(s)) ?? '').replace(/[⁦⁩]/g, '');

  // 1. First run: sheet link → client ID → sign in → checklist → planner.
  await page.goto(URL0);
  ok(await page.isVisible('#setupSheet'), 'first run asks for the sheet link');
  await page.fill('#sid', 'https://example.com/nope');
  await page.click('#sidGo');
  ok((await txt('#sidErr')).length > 0, 'rejects a non-Sheets link');
  await page.fill('#sid', `https://docs.google.com/spreadsheets/d/${SHEET}/edit#gid=0`);
  await page.click('#sidGo');
  ok(await page.isVisible('#setupClient'), 'then shows the guided sign-in setup');
  ok((await txt('#cid4')).includes(new URL(URL0).origin), 'setup shows the exact JavaScript origin to register');
  await page.fill('#cid', 'not-a-client-id');
  await page.click('#cidGo');
  ok((await txt('#cidErr')).length > 0, 'rejects a malformed client ID');
  await page.fill('#cid', CLIENT);
  await page.click('#cidGo');
  ok(await page.isVisible('#setupSign'), 'then asks to sign in');
  await page.screenshot({ path: OUT + '/setup-sign.png' });
  await page.click('#signIn');
  await page.waitForSelector('#setupCheck:not([hidden])');
  ok((await txt('#chkSum')).includes('Everything'), 'sheet check passes: ' + (await txt('#chkSum')));
  ok((await page.locator('#chkList .ck').count()) === 4, 'checklist lists the four tabs');
  await page.screenshot({ path: OUT + '/setup-check.png' });
  await page.click('#openApp');
  await page.waitForSelector('#app:not([hidden])');
  await page.waitForFunction(() => document.getElementById('fm')!.textContent!.includes('₪'));
  await page.waitForFunction(() => (document.querySelectorAll('#chart path')[2]?.getAttribute('d') ?? '').length > 10);
  ok(true, 'free-money line is drawn after the panels');

  // 2. Panels.
  console.log('     post-tax', await txt('#post'), '| pre-tax', await txt('#pre'), '| free', await txt('#fm'));
  ok(/In USD: post-tax \$[\d,]+ · pre-tax \$[\d,]+/.test(await txt('#dcur')), 'display_currency USD shows bottom-line totals: ' + (await txt('#dcur')));
  ok((await page.locator('#cl .lg').count()) === 4, 'colored money legend has 4 lines');
  ok((await page.locator('#chart circle').count()) === 4, 'chart has one marker per goal (3 goals + retirement)');
  ok((await page.locator('#chart rect').count()) === 1, 'chart has the retirement band');
  ok((await page.locator('#nx .g').count()) === 3, 'next goals shows three');
  ok(await page.evaluate(() => [...document.querySelectorAll('details.card')].filter((d) => (d as HTMLDetailsElement).open).length) === 2, 'only Free money and Projection start open');
  await page.screenshot({ path: OUT + '/app-en.png', fullPage: true });

  // 3. What-ifs.
  const before = await txt('#fm');
  await page.selectOption('#sc', 'pes');
  await page.waitForFunction((b) => document.getElementById('fm')!.textContent!.replace(/[⁦⁩]/g, '') !== b, before);
  ok(true, 'scenario change recomputes free money: ' + before + ' -> ' + (await txt('#fm')));
  await page.selectOption('#sc', 'mod');
  await page.$eval('#tm', (e: HTMLInputElement) => { e.value = '60'; e.dispatchEvent(new Event('input')); });
  ok((await txt('#th')).startsWith('Status in'), 'slider shows status for the chosen month: ' + (await txt('#th')));

  // 4. The three writes, only from save buttons.
  ok(writes.length === 0, 'nothing written before a save button');
  await page.click('#gs');
  await page.fill('#gn', 'Boat');
  await page.fill('#ga', '50000');
  await page.fill('#gy', '2030');
  await page.selectOption('#gmo', '4');
  await page.click('#gb');
  await page.click('#sv');
  await page.waitForFunction(() => document.getElementById('gm')!.textContent!.includes('Saved'));
  const ap = writes.find((w) => w.url.endsWith(':append'));
  ok(ap && JSON.stringify((ap.body as { values: unknown[][] }).values[0]) === JSON.stringify(['G7', 'Boat', 50000, 2030, 4, 7, 'Added in app', 1, '']), 'goal appended in the Goals column order');
  await page.click('summary:has(h2[data-t=assum])');
  await page.fill('#rd', '130000');
  await page.click('#rb');
  await page.waitForFunction(() => document.getElementById('gm')!.textContent!.includes('Rainy'));
  ok(writes.some((w) => w.url.includes("'Goals'!C2") && JSON.stringify(w.body).includes('130000')), 'rainy day fund written to Goals!C2');
  await page.fill('#ra', '57');
  await page.click('#rb2');
  await page.waitForFunction(() => document.getElementById('gm')!.textContent!.includes('Retirement'));
  ok(writes.some((w) => w.url.includes("'Settings'!B17") && JSON.stringify(w.body).includes('57')), 'retirement age written to Settings!B17');
  ok(writes.length === 4, 'exactly 4 writes (' + writes.length + ')');

  // 5. Hebrew.
  await page.click('#lb');
  ok((await page.getAttribute('html', 'dir')) === 'rtl', 'Hebrew switches to right-to-left');
  ok((await page.isDisabled('#gb')) && (await page.isDisabled('#rb')) && (await page.isDisabled('#rb2')), 'adding and saving disabled in Hebrew');
  ok((await txt('#goals')).includes('החתונה של Alex'), 'goal names translated (unknown name kept)');
  await page.click('#lb');
  ok(/On track|Short/.test(await txt('#goals .g[data-gd]:has-text("Early retirement")')), 'retirement row keeps its status after a cached re-render');

  // 5b. Detail popups.
  const dlgOpen = () => page.evaluate(() => (document.getElementById('dlg') as HTMLDialogElement).open);
  await page.$eval('#tm', (e: HTMLInputElement) => { e.value = '0'; e.dispatchEvent(new Event('input')); });
  await page.click('summary#hs');
  await page.click('#hl .g:has-text("Broker C")');
  ok(await dlgOpen(), 'tapping a holding opens its details');
  ok((await txt('#dlgT')) === 'Broker C' && /USD.*60,000 at 3\.700/.test(await txt('#dlgB')), 'holding popup shows the sheet amount in USD and the rate');
  ok((await txt('#dlgB')).includes('Return used (Moderate)7.5%'), 'holding popup shows the scenario return: ' + (await txt('#dlgB')).match(/Return used[^%]*%/)?.[0]);
  await page.screenshot({ path: OUT + '/popup-holding.png' });
  await page.mouse.click(5, 5);
  ok(!(await dlgOpen()), 'tapping outside closes the popup');
  await page.click('#hl .g:has-text("Pension 1")');
  ok((await txt('#dlgB')).includes('At pension age (67)'), 'pension fund popup shows the pension-age projection');
  await page.click('#dlgX');
  await page.click('#goals .g:has-text("Car")');
  ok((await txt('#dlgB')).includes('Due1 June 2028'), 'goal popup shows the due date on the 1st: ' + (await txt('#dlgB')).match(/Due[^A-Z]*\d{4}/)?.[0]);
  await page.screenshot({ path: OUT + '/popup-goal.png' });
  await page.click('#dlgX');
  await page.click('#goals .g:has-text("Early retirement")');
  ok(/Starts.*Jan.*2037/.test(await txt('#dlgB')) && (await txt('#dlgB')).includes('Monthly allowance'), 'retirement popup shows start and allowance');
  await page.click('#dlgX');
  await page.click('#goals .g[data-res]');
  ok((await txt('#dlgT')) === 'Rainy day fund', 'rainy day fund row opens its popup');
  await page.click('#dlgX');
  await page.click('#goals .g:has-text("Car") input[type=checkbox]');
  ok(!(await dlgOpen()), 'tapping the spend checkbox does not open the popup');
  await page.click('#goals .g:has-text("Car") input[type=checkbox]');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal scroll at phone width');

  // 6. Errors: rate limit, offline, missing tab.
  sheetsMode = 'ratelimit';
  await page.click('#reload');
  await page.waitForFunction(() => !document.getElementById('msg')!.hidden && /limiting/.test(document.getElementById('msg')!.textContent!));
  ok(true, 'rate limit shows a plain message');
  sheetsMode = 'ok';
  await ctx.setOffline(true);
  sheetsMode = 'offline';
  await page.click('#reload');
  await page.waitForFunction(() => /Could not reach Google/.test(document.getElementById('msg')!.textContent!));
  ok(true, 'offline shows a plain message: ' + (await txt('#msg')));
  await ctx.setOffline(false);
  sheetsMode = 'ok';
  const goals = tabs.Goals;
  tabs = { ...tabs };
  delete tabs.Goals;
  await page.click('#reload');
  await page.waitForSelector('#setupCheck:not([hidden])');
  ok((await page.isDisabled('#openApp')) && (await txt('#chkList')).includes('Goals tab✗ missing'), 'missing Goals tab blocks with the checklist');
  tabs = { ...tabs, Goals: goals };
  await page.click('#chkAgain');
  await page.waitForSelector('#app:not([hidden])');
  ok(true, 'Check again recovers once the tab is back');

  // 7. Privacy: nothing but choices on the phone; token gone after a restart.
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  ok(!stored.includes('FAKE') && !/\d{5,}/.test(stored.replace(/TESTSHEET_\w+/, '')), 'no token or amounts in local storage: ' + Object.keys(JSON.parse(stored)).join(', '));
  await page.reload();
  await page.waitForSelector('#setupSign:not([hidden])');
  ok((await txt('#signH')) === 'Sign in again', 'after restart the token is gone: "Sign in again"');
  await page.click('#signIn');
  await page.waitForSelector('#app:not([hidden])');
  ok(true, 'one tap back in (no checklist on later runs)');

  // 8. Sign-in test screen: both methods.
  await page.goto(URL0 + '?diag');
  await page.click('#dPopup');
  await page.waitForFunction(() => /Popup sign-in OK/.test(document.getElementById('diagOut')!.textContent!));
  ok(true, 'diag: popup method works');
  await page.click('#dRedir');
  await page.waitForFunction(() => /Redirect sign-in OK/.test(document.getElementById('diagOut')?.textContent ?? ''));
  ok(page.url().endsWith('?diag') && !page.url().includes('access_token'), 'diag: redirect method returns to the test screen, token out of the URL');
  await page.click('#dRead');
  await page.waitForFunction(() => document.getElementById('diagOut')!.textContent!.includes('Test read'));
  ok((await txt('#diagOut')).includes('Test read OK'), 'diag: test read works');
  await page.screenshot({ path: OUT + '/diag.png', fullPage: true });

  // 9. Forget this sheet.
  await page.click('#dBack');
  await page.waitForSelector('#app:not([hidden])');
  await page.click('#forget');
  await page.waitForSelector('#setupSheet:not([hidden])');
  const left = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('fp_')));
  ok(left.length === 0, 'Forget this sheet wipes everything stored (' + left.join(',') + ')');

  ok(badAuth === 0, 'every Sheets call carried the token');
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})();
