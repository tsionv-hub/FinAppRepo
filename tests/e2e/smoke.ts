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
let tabs: Record<string, unknown[][]> = { Settings: settings, Holdings: holdingsRows, Goals: goalsX, Pension: pensionRows, Loans: loansX };
let sheetsMode: 'ok' | 'ratelimit' | 'offline' = 'ok';
const writes: { method: string; url: string; body: unknown }[] = [];
let badAuth = 0;
let sheetCalls = 0;
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
    sheetCalls++;
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
  await page.click('summary:has(h2[data-t=assum])');
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
  ok((await page.locator('#chkList .ck').count()) === 5, 'checklist lists the five tabs (Loans included)');
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
  ok(/After debts ₪[\d,]+/.test(await txt('#debt')), 'totals show the "after debts" line: ' + (await txt('#debt')));
  const postN = Number((await txt('#post')).replace(/\D/g, ''));
  ok(Number((await txt('#debt')).replace(/\D/g, '')) === postN - 86000, 'after debts = post-tax − ₪86,000 owed');
  ok((await txt('#goals .g[data-gd]:has-text("Family vacation")')).includes('every year until 2032'), 'recurring goal shows as one row: ' + (await txt('#goals .g[data-gd]:has-text("Family vacation") .lbl')));
  ok((await page.locator('#chart rect').count()) === 1, 'chart has the retirement band');
  ok((await page.locator('#nx .g').count()) === 3, 'next goals shows three');
  ok(await page.evaluate(() => [...document.querySelectorAll('details.card')].filter((d) => (d as HTMLDetailsElement).open).length) === 2, 'only Free money and Projection start open');
  await page.screenshot({ path: OUT + '/app-en.png', fullPage: true });

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
  ok(/Not adjusted for inflation.*worth only about ₪78,120/.test(await txt('#inflTxt')) && (await txt('#infl')) === 'Adjust for inflation', 'the warning says the real picture is worse, with a button to adjust: ' + (await txt('#inflTxt')));
  await page.screenshot({ path: OUT + '/infl-off.png' });
  const fmOff = await txt('#fm');
  await page.click('#infl');
  ok(!(await page.evaluate(() => document.getElementById('inflBar')!.classList.contains('warn'))) && (await txt('#inflTxt')).startsWith('Shown in today’s money') && (await txt('#infl')) === 'Turn off', 'inflation on: calm note and a Turn off button');
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
  for (const sel of ['#helpBtn', '#inflHelp', '#hl .g:has-text("Broker C")', '#lnl .g:has-text("Car loan")', '#goals .g:has-text("חופשה משפחתית")', '#goals .g:has-text("פרישה מוקדמת")', '#hl .g:has-text("Pension 1")']) {
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
