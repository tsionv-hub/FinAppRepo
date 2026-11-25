// End-to-end smoke test against a built app (npm run build && npm run preview).
// Google is mocked: the sign-in library (popup method) and the OAuth page
// (redirect method) hand back a fake token, and the Sheets API is served from
// the fictional fixture. Run: npx tsx tests/e2e/smoke.ts [url] [outDir]
import { createRequire } from 'node:module';
import { goalsRows, holdingsRows, pensionRows, settingsRows } from '../fixture';
import { T } from '../../src/ui/i18n';
// Resolved with require so a globally installed Playwright works too (set NODE_PATH).
const { chromium, devices } = createRequire(import.meta.url)('playwright') as typeof import('playwright');

const URL0 = process.argv[2] ?? 'http://localhost:4173/';
const OUT = process.argv[3] ?? '.';
const SHEET = 'TESTSHEET_abcdefghijklmnopqrstuvwxyz0123';
const CLIENT = 'test-client-123.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const settings = settingsRows.map((r) => (r[0] === 'display_currency' ? ['display_currency', 'USD'] : r));
// The fixture plus the newer features: a recurring goal (repeat columns) and a Loans tab.
const goalsX = [[...goalsRows[0], 'repeat_every_years', 'repeat_until_year'], ...goalsRows.slice(1), ['G7', 'Family vacation', 15000, 2027, 8, 7, '', 1, '', 1, 2032]];
const loansX = [
  ['id', 'name', 'owner', 'kind', 'balance_ILS', 'interest_rate_pct', 'monthly_payment_ILS', 'repay_year', 'repay_month', 'notes'],
  ['L1', 'Car loan', 'P1', 'installments', 36000, 4, 1500, '', '', ''],
  ['L2', 'Loan from parents', 'P2', 'lump_sum', 50000, 0, '', 2029, 9, ''],
];
const depositsX = [
  ['deposit_id', 'holding_id', 'date', 'amount', 'currency', 'notes', 'holding_name'],
  ['D1', 'H3', 30000, 25000, 'USD', 'first', 'Broker C'],
  ['D2', 'H3', '2024-05-10', 15000, 'USD', '', 'Broker C'],
];
let tabs: Record<string, unknown[][]> = { Settings: settings, Holdings: holdingsRows, Goals: goalsX, Pension: pensionRows, Loans: loansX, Deposits: depositsX, Grants: [['grant_id', 'holding_id', 'date', 'shares', 'notes']] };
let sheetsMode: 'ok' | 'ratelimit' | 'offline' = 'ok';
const writes: { method: string; url: string; body: unknown }[] = [];
let badAuth = 0;
let sheetCalls = 0;
const aiCalls: { url: string; key: string; body: { systemInstruction: { parts: { text: string }[] }; contents: { role: string; parts: { text: string }[] }[] } }[] = [];
let aiMode: 'ok' | 'limit' | 'busy' = 'ok';
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
  await ctx.route('https://aistudio.google.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<p>AI Studio (mock)</p>' }));
  await ctx.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const r = route.request();
    const body = r.postDataJSON() as { systemInstruction: { parts: { text: string }[] }; contents: { role: string; parts: { text: string }[] }[] };
    aiCalls.push({ url: r.url(), key: r.headers()['x-goog-api-key'], body });
    if (r.headers()['x-goog-api-key'].includes('BUSY') || aiMode === 'busy') return route.fulfill({ status: 503, json: { error: { message: 'The model is overloaded. Please try again later.' } } });
    if (r.headers()['x-goog-api-key'].includes('NOCREDIT')) return route.fulfill({ status: 402, json: { error: { message: 'Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.' } } });
    if (aiMode === 'limit') return route.fulfill({ status: 429, json: { error: { message: 'Resource exhausted' } } });
    const q = body.contents[body.contents.length - 1].parts[0].text;
    return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: q === 'ping' ? 'OK' : `**Answer** to: ${q}` }] } }] } });
  });
  await ctx.route('https://sheets.googleapis.com/**', async (route) => {
    const r = route.request();
    const u = new URL(r.url());
    sheetCalls++;
    if (r.headers()['authorization'] !== 'Bearer FAKE') badAuth++;
    // Mocked routes still answer under setOffline, so drop the request like a dead network would.
    if (sheetsMode === 'offline') return route.abort('internetdisconnected');
    if (sheetsMode === 'ratelimit') return route.fulfill({ status: 429, json: { error: { message: 'Quota exceeded' } } });
    if (r.method() !== 'GET') {
      writes.push({ method: r.method(), url: decodeURIComponent(u.pathname), body: r.postDataJSON() });
      return route.fulfill({ json: {} });
    }
    // Single-cell formula read (deposited_amount before a deposit): the mock sheet has no formulas.
    const one = /\/values\/'([^']+)'!([A-Z]+)(\d+)$/.exec(decodeURIComponent(u.pathname));
    if (one && u.searchParams.get('valueRenderOption') === 'FORMULA') {
      const t = tabs[one[1]] ?? [];
      const ci = one[2].charCodeAt(0) - 65;
      return route.fulfill({ json: { values: [[t[+one[3] - 1]?.[ci] ?? '']] } });
    }
    if (u.searchParams.get('fields')) return route.fulfill({ json: { properties: { title: 'Test sheet' }, sheets: Object.keys(tabs).map((title) => ({ properties: { title } })) } });
    const ranges = u.searchParams.getAll('ranges');
    return route.fulfill({ json: { valueRanges: ranges.map((x) => ({ values: tabs[x.split('!')[0].replace(/'/g, '')] ?? [] })) } });
  });
  const txt = async (s: string) => ((await page.textContent(s)) ?? '').replace(/[⁦⁩]/g, '');

  // 0. Example mode: no sign-in, no Google calls, nothing saved.
  await page.goto(URL0);
  await page.click('#demoGo');
  await page.waitForSelector('#app:not([hidden])');
  await page.waitForFunction(() => document.getElementById('fm')!.textContent!.includes('₪'));
  ok(await page.isVisible('#demoBar'), 'example mode: banner shown');
  ok(await page.isVisible('#fbBtn'), 'feedback is available in example mode too');
  ok((await txt('#fn')).includes('Limited by Early retirement'), 'example mode: free money limited by early retirement: ' + (await txt('#fm')));
  await page.selectOption('#sc', 'pes');
  await page.waitForFunction(() => /Saving about/.test(document.getElementById('fn')!.textContent!));
  ok(true, 'example mode, Pessimistic: ' + (await txt('#fn')));
  await page.selectOption('#sc', 'mod');
  await page.evaluate(() => ((document.getElementById('pRet') as HTMLDetailsElement).open = true));
  await page.click('#rb2');
  ok((await txt('#gm')) === 'This is example data, so nothing is saved.', 'example mode: save buttons save nothing');
  await page.screenshot({ path: OUT + '/example.png', fullPage: true });
  await page.click('#demoExit');
  await page.waitForSelector('#setupSheet:not([hidden])');
  ok(sheetCalls === 0 && writes.length === 0, 'example mode made no Google calls');
  await page.goto(URL0 + '?example');
  await page.waitForSelector('#app:not([hidden])');
  ok(await page.isVisible('#demoBar'), 'the ?example link opens example mode directly');
  await page.click('#demoExit');

  // 1. First run: sheet link → client ID → sign in → checklist → planner.
  await page.goto(URL0);
  ok(await page.isVisible('#setupSheet'), 'first run asks for the sheet link');
  ok(await page.isVisible('#fbBtn2'), 'feedback is available on the setup screen');
  ok(!(await page.isVisible('#aiBtn')), 'no Ask AI button on setup screens');
  await page.click('#helpBtn');
  ok((await txt('#dlgT')) === 'How it works' && /Settings:.*save each month and each year/.test(await txt('#dlgB')) && /Holdings:/.test(await txt('#dlgB')) && /Goals:/.test(await txt('#dlgB')) && /Free money:/.test(await txt('#dlgB')), 'How it works explains what to fill in and what you get, on the first screen');
  ok((await page.locator('#dlgB a.hwlink').count()) === 0, 'guide link is left out off GitHub Pages (it points at the repository the site comes from)');
  ok(await page.evaluate(() => { const d = document.getElementById('dlg')!.getBoundingClientRect(); return d.bottom <= window.innerHeight && d.right <= window.innerWidth; }), 'How it works fits on a phone screen');
  await page.screenshot({ path: OUT + '/popup-help.png' });
  await page.click('#dlgX');
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
  ok((await page.locator('#chkList .ck').count()) === 9, 'checklist lists the seven tabs (Loans, Deposits and Grants included) and the two new optional Holdings columns');
  await page.screenshot({ path: OUT + '/setup-check.png' });
  await page.click('#openApp');
  await page.waitForSelector('#app:not([hidden])');
  await page.waitForFunction(() => document.getElementById('fm')!.textContent!.includes('₪'));
  await page.waitForFunction(() => (document.querySelectorAll('#chart path')[2]?.getAttribute('d') ?? '').length > 10);
  ok(true, 'free-money line is drawn after the panels');

  // 2. Panels.
  console.log('     post-tax', await txt('#post'), '| pre-tax', await txt('#pre'), '| free', await txt('#fm'));
  ok(/In USD: post-tax \$[\d,]+ · pre-tax \$[\d,]+/.test(await txt('#dcur')), 'display_currency USD shows bottom-line totals: ' + (await txt('#dcur')));
  ok((await page.locator('#cl .lg').count()) === 5, 'colored money legend has 5 lines (loan repayments added)');
  ok((await txt('#cl')).includes('Loan repayments'), 'legend shows loan repayments');
  ok((await page.locator('#chart circle').count()) >= 4 + 6 + 2, 'chart marks every goal, every vacation year and both loans: ' + (await page.locator('#chart circle').count()));
  ok(/^After debts₪[\d,]+$/.test(await txt('#debtW')), 'totals show "after debts": ' + (await txt('#debtW')));
  const postN = Number((await txt('#post')).replace(/\D/g, ''));
  ok(Number((await txt('#debt')).replace(/\D/g, '')) === postN - 86000, 'after debts = post-tax − ₪86,000 owed');
  ok((await txt('#goals .g[data-gd]:has-text("Family vacation")')).includes('every year until 2032'), 'recurring goal shows as one row: ' + (await txt('#goals .g[data-gd]:has-text("Family vacation") .lbl')));
  ok((await page.locator('#chart rect').count()) === 1, 'chart has the retirement band');
  ok(!(await page.$('#pNext')) && !(await page.$('#pBk')), 'no separate Next goals or by-type panels');
  ok(await page.evaluate(() => [...document.querySelectorAll('details.card')].filter((d) => (d as HTMLDetailsElement).open).map((d) => d.id).join()) === 'pProj', 'only the projection graph starts open');
  ok(/Yourmoneytoday🤔Post-tax₪[\d,]+Pre-tax₪[\d,]+Afterdebts₪[\d,]+Freetospendtoday₪[\d,]+/.test((await txt('#pToday > summary')).replace(/\s+/g, '')), 'one "today" panel shows totals and free money even when closed: ' + (await txt('#pToday > summary')).replace(/\s+/g, ' '));
  ok(await page.evaluate(() => {
    const s = document.querySelector('#pToday > summary')!;
    const r = s.getBoundingClientRect();
    const fl = s.querySelector('.freeline')!.getBoundingClientRect();
    const after = getComputedStyle(s, '::after');
    return after.content === '"➕"' && after.order === '9' && fl.bottom < r.bottom && fl.height < 60;
  }), 'the ➕ sits at the bottom of the closed "today" card, and the free-money line stays on one line');
  ok(await page.evaluate(() => !!(document.getElementById('chart')!.compareDocumentPosition(document.getElementById('sc')!) & Node.DOCUMENT_POSITION_FOLLOWING)), 'the return scenario is below the graph');
  const marker = (id: string) => page.evaluate((i) => getComputedStyle(document.querySelector(`#${i} > summary`)!, '::after').content, id);
  ok((await marker('pGoals')) === '"➕"' && (await marker('pProj')) === '"➖"', 'closed panels show ➕, open ones ➖');
  ok(await page.evaluate(() => (document.querySelector('.hint') as HTMLElement).innerText) === 'Tap ➕/➖ to open/close a panel.\nTap 🤔 for a short explanation.', 'the tip: ➕/➖ on one line, 🤔 on the next');
  await page.screenshot({ path: OUT + '/app-en.png', fullPage: true });
  await page.locator('#pToday').screenshot({ path: OUT + '/today-card.png' });

  // 2b. Inflation switch at the top, with its explanation.
  ok(await page.evaluate(() => {
    const bar = document.querySelector('.infl-bar')!;
    const first = document.querySelector('#app details.card')!;
    return bar.compareDocumentPosition(first) === Node.DOCUMENT_POSITION_FOLLOWING && !!bar.querySelector('#infl') && !document.querySelector('details #infl');
  }), 'inflation switch sits at the top of the main screen, above the totals');
  await page.click('#inflHelp');
  ok((await txt('#dlgT')) === 'Inflation: what this switch does' && /At 2\.5% a year, ₪100,000 in 2036 buys what about ₪78,120 buys today/.test(await txt('#dlgB')), 'the ? explains inflation with the current rate: ' + (await txt('#dlgB')).match(/At [^.]*\./)?.[0]);
  ok(!/\{\w+\}/.test(await txt('#dlgB')), 'no unfilled {placeholders} in the explanation');
  await page.screenshot({ path: OUT + '/popup-inflation.png' });
  await page.click('#dlgX');
  ok(await page.evaluate(() => document.getElementById('inflBar')!.classList.contains('warn')), 'inflation off: the bar is a yellow warning');
  ok((await txt('#inflTxt')) === 'Not adjusted for inflation' && (await txt('#infl')) === 'Adjust for inflation', 'the warning is just its title, with the button and 🤔: ' + (await txt('#inflTxt')));
  await page.screenshot({ path: OUT + '/infl-off.png' });
  const fmOff = await txt('#fm');
  await page.click('#infl');
  ok(!(await page.evaluate(() => document.getElementById('inflBar')!.classList.contains('warn'))) && (await txt('#inflTxt')) === 'Shown in today’s money' && (await txt('#infl')) === 'Turn off', 'inflation on: calm note and a Turn off button');
  await page.screenshot({ path: OUT + '/infl-on.png' });
  await page.waitForFunction((b) => document.getElementById('fm')!.textContent!.replace(/[⁦⁩]/g, '') !== b, fmOff);
  ok(true, 'turning inflation on recomputes free money: ' + fmOff + ' -> ' + (await txt('#fm')));
  await page.click('#inflHelp');
  ok((await txt('#dlgB')).includes('Now: on'), 'the explanation shows the switch is on');
  await page.click('#dlgX');
  await page.click('#infl');

  // 2c. Feedback link.
  const fbHref = await page.getAttribute('#fbBtn', 'href');
  ok(await page.isVisible('#fbBtn') && fbHref!.startsWith('mailto:feedback@example.com?subject=' + encodeURIComponent('Finance Planner feedback (v')), 'feedback opens an email to the configured address: ' + fbHref!.slice(0, 80));
  ok(decodeURIComponent(fbHref!).includes('Version: ') && !/₪|\d{5,}/.test(decodeURIComponent(fbHref!).replace(/Mozilla.*$/s, '')), 'feedback email has version and device, no amounts');

  // 2d. New layout: groups, jump bar, early retirement panel, 🤔 on every panel.
  ok((await page.locator('.grp').allTextContents()).join('|') === 'Quick look|Your money & goals|Retirement & pension|Settings', 'sections: Quick look, Your money & goals, Retirement & pension, Settings');
  ok((await page.$$eval('#app details.card', (ds) => ds.map((d) => d.id).join())) === 'pToday,pProj,pHold,pGoals,lnCard,pRet,pPen,pAss', 'panel order: today, projection, holdings, goals, loans, retirement, pension, assumptions');
  ok(await page.evaluate(() => !!document.querySelector('#pHold #bk .bk') && document.querySelector('#pHold #bk')!.compareDocumentPosition(document.querySelector('#pHold #hl')!) === Node.DOCUMENT_POSITION_FOLLOWING), 'Holdings shows money by type above the account list');
  ok(!(await txt('.hint')).includes('💡'), 'no light bulb in the tip line');
  await page.evaluate(() => { document.querySelectorAll('details.card').forEach((d) => ((d as HTMLDetailsElement).open = false)); window.scrollTo(0, 0); });
  await page.screenshot({ path: OUT + '/sections.png', fullPage: true });
  await page.evaluate(() => ((document.getElementById('pHold') as HTMLDetailsElement).open = true));
  await page.locator('#pHold').screenshot({ path: OUT + '/holdings.png' });
  await page.evaluate(() => ((document.getElementById('pProj') as HTMLDetailsElement).open = true));
  ok(!(await page.$('#jump')) && !(await page.$('[data-go]')), 'no quick-navigation bar');
  const ver = (await page.evaluate(() => fetch('version.json', { cache: 'no-store' }).then((r) => r.json()))) as { version: string };
  ok((await txt('#verTop')) === `(v${ver.version})` && /^\d+\.\d+\.\d+$/.test(ver.version), 'the version is shown in brackets at the top and matches the site: ' + (await txt('#verTop')));
  await page.evaluate(() => ((document.getElementById('pRet') as HTMLDetailsElement).open = true));
  const retTxt = await txt('#retBody');
  ok(/Starts.*Jan 2035.*Age 55/.test(retTxt) && /StatusOn track/.test(retTxt) && /Set aside today/.test(retTxt) && /Pension then covers\d+%/.test(retTxt), 'Early retirement panel: start, status, money set aside and pension coverage');
  ok(/Age 55.*On track/.test(await txt('#retK')), 'the closed retirement panel shows age and status in its header: ' + (await txt('#retK')));
  await page.locator('#pRet').screenshot({ path: OUT + '/panel-retirement.png' });
  const keys = await page.$$eval('.hq[data-help]', (bs) => bs.map((b) => (b as HTMLElement).dataset.help!));
  ok(keys.length === 8, 'every panel has a 🤔 button (' + keys.length + ')');
  for (const key of keys) {
    const before = await page.$eval(`.hq[data-help=${key}]`, (b) => (b.closest('details') as HTMLDetailsElement).open);
    await page.click(`.hq[data-help=${key}]`);
    const okHelp = (await page.evaluate(() => (document.getElementById('dlg') as HTMLDialogElement).open)) && (await txt('#dlgB')).length > 40;
    await page.click('#dlgX');
    const after = await page.$eval(`.hq[data-help=${key}]`, (b) => (b.closest('details') as HTMLDetailsElement).open);
    if (!okHelp || before !== after) fail(`🤔 for ${key}: help=${okHelp}, panel toggled=${before !== after}`);
  }
  ok(true, '🤔 opens a short explanation for each panel and does not open or close the panel');
  const ring = await page.evaluate(() => {
    const a = document.activeElement as HTMLElement;
    const sum = a.closest('summary') ?? a;
    return { outline: getComputedStyle(a).outlineStyle, sumOutline: getComputedStyle(sum).outlineStyle, fv: a.matches(':focus-visible') };
  });
  ok((ring.outline === 'none' && ring.sumOutline === 'none') || ring.fv, 'no blue focus frame around the panel after closing a 🤔 explanation: ' + JSON.stringify(ring));
  ok((await txt('.hint')).includes('Tap 🤔 for a short explanation'), 'a tip line explains the 🤔 buttons');
  ok((await txt('#hsK')) === 'Today', 'Holdings header says "Today"');
  await page.click('.hq[data-help=ret]');
  ok((await txt('#dlgB')).includes('Default age: 60'), 'the retirement help mentions the default age of 60');
  await page.click('#dlgX');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: OUT + '/layout-top.png' });

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
  ok(ap && JSON.stringify((ap.body as { values: unknown[][] }).values[0]) === JSON.stringify(['G8', 'Boat', 50000, 2030, 4, 8, 'Added in app', 1, '', '', '']), 'goal appended in the Goals column order');
  await page.click('summary:has(h2[data-t=assum])');
  await page.fill('#rd', '130000');
  await page.click('#rb');
  await page.waitForFunction(() => document.getElementById('gm')!.textContent!.includes('Rainy'));
  ok(writes.some((w) => w.url.includes("'Goals'!C2") && JSON.stringify(w.body).includes('130000')), 'rainy day fund written to Goals!C2');
  await page.evaluate(() => ((document.getElementById('pRet') as HTMLDetailsElement).open = true));
  await page.fill('#ra', '57');
  await page.click('#rb2');
  await page.waitForFunction(() => document.getElementById('gm')!.textContent!.includes('Retirement'));
  ok(writes.some((w) => w.url.includes("'Settings'!B17") && JSON.stringify(w.body).includes('57')), 'retirement age written to Settings!B17');
  ok(writes.length === 4, 'exactly 4 writes so far (' + writes.length + ')');

  // 5. Hebrew: everything works, including adding a (recurring) goal and saving it.
  await page.click('#lb');
  ok((await page.getAttribute('html', 'dir')) === 'rtl', 'Hebrew switches to right-to-left');
  ok(await page.isVisible('#app'), 'switching language keeps you on the main screen');
  ok(!(await page.isDisabled('#gb')) && !(await page.isDisabled('#rb')) && !(await page.isDisabled('#rb2')), 'adding and saving work in Hebrew');
  ok((await txt('#goals')).includes('החתונה של Alex'), 'goal names translated (unknown name kept)');
  await page.fill('#gn', 'טיול שנתי');
  await page.fill('#ga', '10000');
  await page.fill('#gy', '2028');
  await page.fill('#grp', '2');
  await page.fill('#gru', '2034');
  await page.click('#gb');
  await page.click('#sv');
  await page.waitForFunction(() => document.getElementById('gm')!.textContent!.includes('נשמר'));
  const ap2 = writes.filter((w) => w.url.endsWith(':append'))[1];
  ok(ap2 && JSON.stringify((ap2.body as { values: unknown[][] }).values[0]) === JSON.stringify(['G8', 'טיול שנתי', 10000, 2028, 1, 8, 'Added in app', 1, '', 2, 2034]), 'Hebrew recurring goal saved with its repeat columns: ' + JSON.stringify((ap2?.body as { values: unknown })?.values));
  // Language audit: open everything, including popups, and look for any English string that has a Hebrew version.
  const englishLeft = async () => {
    const shown = await page.evaluate(() => {
      document.querySelectorAll('details').forEach((d) => (d.open = true));
      return document.body.innerText;
    });
    const out: string[] = [];
    for (const [k, en] of Object.entries(T.en)) {
      if (k === 'ty' || typeof en !== 'string') continue;
      const he = (T.he as Record<string, unknown>)[k];
      if (he === en) continue;
      if (/\{\w+\}/.test(shown)) out.push('unfilled placeholder on screen');
      for (const frag of en.split(/\{\w+\}/)) if (frag.trim().length >= 12 && shown.includes(frag.trim())) out.push(`${k}: "${frag.trim()}"`);
    }
    return out;
  };
  let untranslated = await englishLeft();
  ok((await txt('#goals')).includes('חופשה משפחתית'), 'goal phrases translated in the right word order');
  ok(decodeURIComponent((await page.getAttribute('#fbBtn', 'href'))!).includes('משוב על תכנון פיננסי'), 'feedback email subject follows the language');
  for (const sel of ['#helpBtn', '#inflHelp', '.hq[data-help=ret]', '.hq[data-help=today]', '.hq[data-help=goals]', '#hl .g:has-text("Broker C")', '#lnl .g:has-text("Car loan")', '#goals .g:has-text("חופשה משפחתית")', '#goals .g:has-text("פרישה מוקדמת")', '#hl .g:has-text("Pension 1")']) {
    await page.click(sel);
    untranslated = untranslated.concat(await englishLeft());
    await page.click('#dlgX');
  }
  ok(untranslated.length === 0, 'Hebrew audit: no English text left on screen or in popups' + (untranslated.length ? ': ' + [...new Set(untranslated)].join(' | ') : ''));
  await page.screenshot({ path: OUT + '/app-he.png', fullPage: true });
  await page.click('#lb');
  ok(/On track|Short/.test(await txt('#goals .g[data-gd]:has-text("Early retirement")')), 'retirement row keeps its status after a cached re-render');

  // 5b. Detail popups.
  const dlgOpen = () => page.evaluate(() => (document.getElementById('dlg') as HTMLDialogElement).open);
  await page.$eval('#tm', (e: HTMLInputElement) => { e.value = '0'; e.dispatchEvent(new Event('input')); });
  await page.evaluate(() => ((document.getElementById('hs')!.parentElement as HTMLDetailsElement).open = true));
  await page.click('#hl .g:has-text("Broker C")');
  ok(await dlgOpen(), 'tapping a holding opens its details');
  ok((await txt('#dlgT')) === 'Broker C' && /USD.*60,000 at 3\.700/.test(await txt('#dlgB')), 'holding popup shows the sheet amount in USD and the rate');
  ok((await txt('#dlgB')).includes('Return used (Moderate)7.5%'), 'holding popup shows the scenario return: ' + (await txt('#dlgB')).match(/Return used[^%]*%/)?.[0]);
  const dB = await txt('#dlgB');
  ok(dB.includes('Total deposited (2)') && /40,000 USD/.test(dB) && dB.includes('Yearly return so far'), 'holding popup lists its deposits (serial and ISO dates), the total and the return so far');
  await page.screenshot({ path: OUT + '/popup-holding.png' });
  await page.click('#dpS');
  ok((await txt('#dpM')) === 'Enter a date and an amount.', 'add deposit needs an amount');
  const nw = writes.length;
  await page.fill('#dpA', '1000');
  await page.fill('#dpN', 'test');
  await page.click('#dpS');
  await page.waitForFunction(() => document.getElementById('dpM')?.textContent === 'Deposit saved to the Deposits tab.');
  const dw = writes.slice(nw);
  const dRow = (dw.find((w) => w.url.includes("'Deposits'") && w.url.endsWith(':append'))?.body as { values: unknown[][] } | undefined)?.values[0];
  ok(dRow && /^\["D3","H3","\d{4}-\d{2}-\d{2}",1000,"USD","test","Broker C"\]$/.test(JSON.stringify(dRow)), 'deposit appended in the Deposits column order: ' + JSON.stringify(dRow));
  const hcol = String.fromCharCode(65 + (holdingsRows[0] as string[]).indexOf('current_amount'));
  const dcol = String.fromCharCode(65 + (holdingsRows[0] as string[]).indexOf('deposited_amount'));
  const dpw = dw.find((w) => w.method === 'PUT' && w.url.includes("'Holdings'!" + dcol + '4'));
  ok(dpw && JSON.stringify((dpw.body as { values: unknown[][] }).values) === '[[41000]]', 'a typed deposited_amount gets the deposit added: ' + dpw?.url);
  const vw = dw.find((w) => w.method === 'PUT' && w.url.includes("'Holdings'!" + hcol));
  ok(vw && vw.url.includes(hcol + '4') && JSON.stringify((vw.body as { values: unknown[][] }).values) === '[[61000]]', 'and the holding value goes up by the deposit: ' + vw?.url);
  ok((await dlgOpen()) && (await txt('#dlgT')) === 'Broker C', 'the popup stays open after saving');
  await page.click('#dlgX');
  const grps = await page.$$eval('#hl .hgrp span:first-child', (e) => e.map((x) => x.textContent));
  ok(JSON.stringify(grps.slice(0, 5)) === JSON.stringify(['Study funds (1)', 'Funds and savings (2)', 'Trading accounts (2)', 'Bank (1)', 'Intel stocks (2)']) && grps[5]?.startsWith('Pension'), 'holdings are split into groups: ' + grps.join(', '));
  ok(await page.$eval('#hl', (hl) => { const k = [...hl.children]; const b = k.findIndex((x) => x.classList.contains('hgrp') && x.textContent!.startsWith('Bank')); return k[b + 1]?.textContent?.includes('Checking'); }), 'rows sit under their group');
  await page.click('#hl .g:has-text("Study A")');
  ok((await page.locator('#dpS, #bvS, #grS').count()) === 0, 'study fund popup has no deposit, balance or grant form');
  await page.click('#dlgX');
  await page.click('#hl .g:has-text("Checking")');
  ok((await page.inputValue('#bvA')) === '80000' && (await page.locator('#dpS').count()) === 0, 'bank popup offers a balance update (no deposits), prefilled');
  let n0 = writes.length;
  await page.fill('#bvA', '85000');
  await page.click('#bvS');
  await page.waitForFunction(() => document.getElementById('bvM')?.textContent === 'Balance saved to the Holdings tab.');
  const bw = writes.slice(n0).find((w) => w.method === 'PUT');
  ok(bw && bw.url.includes("'Holdings'!" + hcol + '6') && JSON.stringify((bw.body as { values: unknown[][] }).values) === '[[85000]]', 'bank balance written to current_amount: ' + bw?.url);
  await page.click('#dlgX');
  await page.click('#hl .g:has-text("Intel vested")');
  ok((await page.locator('#grS').count()) === 1 && (await txt('#dlgB')).includes('“Intel unvested”'), 'stocks popup offers a grant, added to the unvested holding');
  n0 = writes.length;
  await page.fill('#grN', '120');
  await page.click('#grS');
  await page.waitForFunction(() => document.getElementById('grM')?.textContent === 'Grant saved to the Grants tab.');
  const gw = writes.slice(n0);
  const gRow = (gw.find((w) => w.url.includes("'Grants'") && w.url.endsWith(':append'))?.body as { values: unknown[][] } | undefined)?.values[0];
  ok(gRow && /^\["GR1","H7","\d{4}-\d{2}-\d{2}",120,""\]$/.test(JSON.stringify(gRow)), 'grant appended in the Grants column order: ' + JSON.stringify(gRow));
  const qcol = String.fromCharCode(65 + (holdingsRows[0] as string[]).indexOf('quantity'));
  const qw = gw.find((w) => w.method === 'PUT');
  ok(qw && qw.url.includes("'Holdings'!" + qcol + '8') && JSON.stringify((qw.body as { values: unknown[][] }).values) === '[[120]]', 'and the shares are added to the unvested quantity: ' + qw?.url);
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
  // The Hebrew save reloaded the sheet (the mock keeps no writes), so retirement age is the sheet's 55 again.
  ok(/Starts.*Jan.*2035/.test(await txt('#dlgB')) && (await txt('#dlgB')).includes('Monthly allowance'), 'retirement popup shows start and allowance');
  await page.click('#dlgX');
  ok(await page.isVisible('#lnCard') && (await txt('#lnS')) === 'Loans (2)', 'loans have their own panel');
  ok(await page.evaluate(() => !document.querySelector('#hl [data-ln]')), 'loans are no longer mixed into Holdings');
  await page.evaluate(() => ((document.getElementById('lnCard') as HTMLDetailsElement).open = true));
  ok(/1,500\/month · paid off/.test(await txt('#lnl .g:has-text("Car loan")')) && /repay Sept? 2029/.test(await txt('#lnl .g:has-text("Loan from parents")')), 'loan rows show the plan: ' + (await txt('#lnl .g:has-text("Car loan") .lbl:nth-of-type(2)')));
  ok(/^−₪[\d,]+$/.test(await txt('#lnTot')), 'the Loans header shows the total owed: ' + (await txt('#lnTot')));
  await page.locator('#lnCard').screenshot({ path: OUT + '/loans-panel.png' });
  await page.click('#lnl .g:has-text("Car loan")');
  ok((await txt('#dlgT')) === 'Car loan' && /Owed today₪36,000/.test(await txt('#dlgB')) && /Paid off.*20\d\d/.test(await txt('#dlgB')), 'loan popup: owed today and payoff date');
  await page.click('#dlgX');
  ok(/−₪[\d,]+/.test(await txt('#lnl .g:has-text("Loan from parents")')), 'loans show what is owed as a negative balance');
  await page.click('#goals .g:has-text("Family vacation")');
  ok((await page.locator('#dlgB .dr').count()) >= 3 + 6 && (await txt('#dlgB')).includes('Aug 2032'), 'recurring goal popup lists each year');
  await page.screenshot({ path: OUT + '/popup-recurring.png' });
  await page.click('#dlgX');
  await page.click('#goals .g[data-res]');
  ok((await txt('#dlgT')) === 'Rainy day fund', 'rainy day fund row opens its popup');
  await page.click('#dlgX');
  await page.click('#goals .g:has-text("Car") input[type=checkbox]');
  ok(!(await dlgOpen()), 'tapping the spend checkbox does not open the popup');
  await page.click('#goals .g:has-text("Car") input[type=checkbox]');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal scroll at phone width');

  // 5c. Ask AI.
  const dlgOpen2 = () => page.evaluate(() => (document.getElementById('dlg') as HTMLDialogElement).open);
  const chatOpen = () => page.evaluate(() => (document.getElementById('aiChat') as HTMLDialogElement).open);
  ok(await page.isVisible('#aiBtn') && (await txt('#aiBtn')) === '💬 Ask AI', 'a floating 💬 Ask AI button is on the main screen');
  await page.click('#aiBtn');
  ok((await txt('#dlgB .ai-tip')).includes('Don’t send my data'), 'the privacy warning explains the 🔒 Don’t send my data option');
  ok((await txt('#dlgT')) === '⚠️ Your data goes to Google’s AI' && (await page.isVisible('.ai-warn')) && /sheet’s numbers.*Google Gemini/.test(await txt('#dlgB')) && /developer never sees/.test(await txt('#dlgB')), 'first time: red privacy warning');
  await page.screenshot({ path: OUT + '/ai-warning.png' });
  await page.click('[data-ai=cancel]');
  ok(!(await dlgOpen2()) && !(await page.evaluate(() => localStorage.getItem('fp_ai_ok'))), 'Cancel closes it and remembers nothing');
  await page.click('#aiBtn');
  await page.click('[data-ai=agree]');
  ok((await txt('#dlgT')).includes('Connect your free Gemini key') && (await page.locator('#dlgB ol.steps li').count()) === 4 && (await page.getAttribute('#dlgB a.hwlink', 'href')) === 'https://aistudio.google.com/apikey', 'then step-by-step key setup with a link to AI Studio');
  await page.screenshot({ path: OUT + '/ai-key.png' });
  ok((await txt('#dlgB ol.steps')).includes('tap Done at the top') && !(await txt('#dlgB')).includes('AIza'), 'the steps say how to come back, and assume no key format');
  // Going to AI Studio: even if the phone reloads the app, the setup comes back.
  const [studio] = await Promise.all([ctx.waitForEvent('page'), page.click('#aiStudio')]);
  await studio.close();
  ok((await page.evaluate(() => localStorage.getItem('fp_ai_setup'))) === '1', 'tapping the AI Studio link remembers the setup is in progress');
  await page.reload();
  await page.click('#signIn');
  await page.waitForSelector('#app:not([hidden])');
  await page.waitForFunction(() => (document.getElementById('dlg') as HTMLDialogElement).open);
  ok((await txt('#dlgT')).includes('Connect your free Gemini key') && (await txt('#aiKMsg')).startsWith('Welcome back'), 'coming back (even after a reload) reopens the key setup: ' + (await txt('#aiKMsg')));
  // Until a key works, the full warning comes back on every new opening.
  await page.click('#dlgX');
  await page.click('#aiBtn');
  ok((await txt('#dlgT')).includes('Connect your free Gemini key'), 'in the same opening, accepted once is enough');
  await page.click('#dlgX');
  await page.reload();
  await page.click('#signIn');
  await page.waitForSelector('#app:not([hidden])');
  await page.click('#aiBtn');
  ok((await txt('#dlgT')) === '⚠️ Your data goes to Google’s AI', 'no working key yet: the full privacy warning shows again after reopening');
  await page.click('[data-ai=agree]');
  // A key whose project is on prepaid billing with no credit (the real case seen on a phone).
  await page.fill('#aiKey', 'AQ.NOCREDIT' + 'x'.repeat(20));
  await page.click('[data-ai=savekey]');
  await page.waitForFunction(() => /paid|billing/.test(document.getElementById('aiKMsg')!.textContent!));
  ok((await txt('#aiKMsg')).includes('set up for paid (prepaid) use') && (await page.getAttribute('#aiKMsg a', 'href')) === 'https://ai.studio/projects' && !(await page.evaluate(() => localStorage.getItem('fp_ai_key'))), 'a key whose project has no credit gets a plain explanation and a link, and is not saved');
  await page.fill('#aiKey', 'sk-too-short');
  await page.click('[data-ai=savekey]');
  ok((await txt('#aiKMsg')).includes('too short'), 'only an obviously wrong key is caught before testing');
  const KEY = 'AQ.' + 'Ab3_-'.repeat(8);
  await page.fill('#aiKey', '  ' + KEY + '\n');
  await page.click('[data-ai=savekey]');
  await page.waitForFunction(() => (document.getElementById('aiChat') as HTMLDialogElement).open);
  aiCalls.splice(0, aiCalls.length - 1); // keep only the successful test call
  ok(aiCalls.length === 1 && aiCalls[0].key === KEY && !aiCalls[0].url.includes(KEY), 'a key in another format is tested for real (spaces removed, sent in a header), then the chat opens');
  ok(!(await page.evaluate(() => localStorage.getItem('fp_ai_setup'))), 'once the key works, the setup is no longer pending');
  ok((await page.locator('#aiLog .ai-ex button').count()) === 3, 'the chat suggests example questions');
  await page.fill('#aiIn', 'How many holdings with Vendor 2?');
  await page.click('#aiSend');
  await page.waitForSelector('#aiLog .ai-msg.bot:not(.wait)');
  const sys = aiCalls[1].body.systemInstruction.parts[0].text;
  ok((await txt('#aiLog .ai-msg.bot')) === 'Answer to: How many holdings with Vendor 2?' && (await page.$eval('#aiLog .ai-msg.bot b', (b) => b.textContent)) === 'Answer', 'the answer shows in the chat (bold kept)');
  ok(sys.includes('"vendor":"Vendor 2"') && sys.includes('APP RESULTS') && sys.includes('"freeToday"') && sys.includes('APP GUIDE') && !/account_number/.test(sys), 'the AI gets the sheet, the app’s results and the guide, never account numbers');
  await page.click('#aiLog .ai-ex button >> nth=0').catch(() => {});
  await page.fill('#aiIn', 'And Vendor 3?');
  await page.press('#aiIn', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('#aiLog .ai-msg.bot:not(.wait)').length === 2);
  ok(aiCalls[aiCalls.length - 1].body.contents.map((c) => c.role).join() === 'user,model,user', 'follow-up questions include the conversation so far');
  await page.screenshot({ path: OUT + '/ai-chat.png' });
  // Phone keyboard open: the visible area shrinks; the whole chat must stay on screen.
  const full = page.viewportSize()!;
  await page.setViewportSize({ width: full.width, height: 380 });
  await page.waitForTimeout(300);
  const box = await page.evaluate(() => {
    const r = document.getElementById('aiChat')!.getBoundingClientRect();
    const h = document.getElementById('aiT')!.getBoundingClientRect();
    const i = document.getElementById('aiIn')!.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, title: h.top, input: i.bottom, vh: window.visualViewport!.height };
  });
  ok(box.top >= 0 && box.title >= 0 && box.bottom <= box.vh && box.input <= box.vh, 'with the keyboard up, the chat fits above it: title and input both visible ' + JSON.stringify(box));
  await page.screenshot({ path: OUT + '/ai-keyboard.png' });
  await page.setViewportSize(full);
  // 🔒 Don't send my data.
  ok(!(await page.isChecked('#aiPriv')), '🔒 Don’t send my data starts unticked');
  await page.check('#aiPriv');
  ok((await page.locator('#aiLog .ai-msg.bot').count()) === 0 && (await txt('#aiLog .ai-msg.note')).includes('Your data isn’t sent') && (await txt('#aiLog .ai-ex')).includes('How do I add a loan?'), 'ticking it starts a new conversation with app-only example questions');
  await page.fill('#aiIn', 'How does free money work?');
  await page.click('#aiSend');
  await page.waitForSelector('#aiLog .ai-msg.bot:not(.wait)');
  const priv = aiCalls[aiCalls.length - 1].body;
  const ps = priv.systemInstruction.parts[0].text;
  ok(!ps.includes('SHEET DATA') && !ps.includes('APP RESULTS') && !ps.includes('Vendor 2') && !ps.includes('Broker C') && ps.includes('APP GUIDE') && priv.contents.length === 1, 'with it ticked, only the question and the guide are sent: no sheet, no results, no earlier answers');
  await page.screenshot({ path: OUT + '/ai-private.png' });
  await page.click('#aiX');
  await page.click('#aiBtn');
  ok(await page.isChecked('#aiPriv'), 'the choice is remembered');
  await page.uncheck('#aiPriv');
  ok((await txt('#aiLog .ai-msg.note')).includes('sent with each question again'), 'unticking says the numbers are sent again');
  await page.fill('#aiIn', 'Total?');
  await page.click('#aiSend');
  await page.waitForSelector('#aiLog .ai-msg.bot:not(.wait)');
  ok(aiCalls[aiCalls.length - 1].body.systemInstruction.parts[0].text.includes('SHEET DATA'), 'unticked, the sheet is included again');
  const aiStored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  ok(!aiStored.includes('Vendor 2') && !aiStored.includes('Answer'), 'no questions or answers are saved on the phone');
  aiMode = 'limit';
  await page.fill('#aiIn', 'Another one');
  await page.click('#aiSend');
  await page.waitForSelector('#aiLog .ai-msg.err');
  ok((await txt('#aiLog .ai-msg.err')).includes('free limit'), 'the free-tier limit shows a plain message');
  aiMode = 'busy';
  await page.fill('#aiIn', 'One more');
  await page.click('#aiSend');
  await page.waitForSelector('#aiLog .ai-msg.err:has-text("busy")', { timeout: 15000 });
  ok((await txt('#aiLog .ai-msg.err')).includes('Your key is fine'), 'when Google’s AI is busy (503), after trying other models the chat says so plainly');
  aiMode = 'ok';
  await page.click('#aiX');
  // The dialog's close event fires a moment after the tap.
  const forgot = await page.waitForFunction(() => document.getElementById('aiLog')!.innerHTML === '', null, { timeout: 3000 }).then(() => true, () => false);
  ok(forgot, 'closing the chat forgets the conversation');
  await page.click('#aiBtn');
  ok((await chatOpen()) && !(await dlgOpen2()), 'during the same opening, the chat opens straight away');
  ok(!(await page.evaluate(() => document.activeElement?.id === 'aiIn')), 'opening the chat does not pop the keyboard up by itself');
  await page.click('#aiX');
  // Hebrew: the AI screens are translated too.
  await page.click('#lb');
  await page.click('#aiBtn');
  ok((await txt('#aiChat .ai-foot')).includes('שום דבר לא נשמר') && (await page.getAttribute('#aiIn', 'placeholder'))!.includes('שאלו'), 'the chat is in Hebrew in Hebrew mode');
  await page.click('#aiX');
  await page.click('#lb');

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
  // Ask AI after reopening: a short reminder; "Don't show again" only from the 4th time.
  for (let i = 1; i <= 4; i++) {
    if (i > 1) {
      await page.reload();
      await page.click('#signIn');
      await page.waitForSelector('#app:not([hidden])');
    }
    await page.click('#aiBtn');
    const isReminder = (await txt('#dlgT')) === '🥱🧑‍⚖️ The fine print, once more';
    const hasQuiet = (await page.locator('#aiQuietChk').count()) === 1;
    if (!isReminder || hasQuiet !== (i === 4)) fail(`reminder ${i}: shown=${isReminder}, don't-show-again=${hasQuiet}`);
    if (i === 1) await page.screenshot({ path: OUT + '/ai-reminder.png' });
    if (i === 4) await page.check('#aiQuietChk');
    await page.click('[data-ai=gotit]');
    await page.waitForFunction(() => (document.getElementById('aiChat') as HTMLDialogElement).open);
    await page.click('#aiX');
  }
  ok(true, 'after reopening, a 🥱🧑‍⚖️ reminder shows once per opening, with "Don’t show again" from the 4th time');
  await page.reload();
  await page.click('#signIn');
  await page.waitForSelector('#app:not([hidden])');
  await page.click('#aiBtn');
  ok((await chatOpen()) && !(await dlgOpen2()), 'after "Don’t show again", the chat opens directly');
  await page.click('#aiRm');
  ok(!(await page.evaluate(() => localStorage.getItem('fp_ai_key'))), 'Remove AI key deletes it from the phone');
  await page.click('#dlgX');
  await page.click('#aiBtn');
  ok((await txt('#dlgT')) === '⚠️ Your data goes to Google’s AI', 'after removing the key, the full privacy warning comes back first');
  await page.click('[data-ai=agree]');
  ok((await txt('#dlgT')).includes('Connect your free Gemini key'), 'then the key setup');
  // The real case seen on a phone: a new key, but Google answers 503 (busy).
  await page.fill('#aiKey', 'AQ.BUSY' + 'x'.repeat(20));
  await page.click('[data-ai=savekey]');
  await page.waitForFunction(() => (document.getElementById('aiChat') as HTMLDialogElement).open, null, { timeout: 15000 });
  ok((await txt('#aiLog .ai-msg.err')).includes('Your key works and is saved') && !!(await page.evaluate(() => localStorage.getItem('fp_ai_key'))), 'a 503 during setup: the key is saved and the chat opens, saying Google is busy');
  await page.click('#aiX');

  // 7b. After a deploy: the app notices the newer version and reloads once (never loops).
  let loads = 0;
  page.on('load', () => loads++);
  await page.route('**/version.json', (r) => r.fulfill({ json: { version: '99.0.0' } }));
  await page.reload();
  await page.waitForTimeout(3000);
  ok(loads === 2, 'a newer version on the site makes the app reload once to pick it up, and not loop (' + loads + ' loads)');
  await page.unroute('**/version.json');

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
