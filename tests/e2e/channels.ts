// Checks the stable and beta apps published side by side (as the deploy does):
//   <base>/        stable     <base>/beta/   beta
// They must look different and share nothing (storage, offline cache).
// Run: npx tsx tests/e2e/channels.ts http://localhost:8090/FinAppRepo/
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright') as typeof import('playwright');

const BASE = process.argv[2] ?? 'http://localhost:8090/FinAppRepo/';
const fail = (m: string) => { console.error('FAIL: ' + m); process.exitCode = 1; };
const ok = (c: unknown, m: string) => (c ? console.log('ok   ' + m) : fail(m));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  const info = async (url: string) => {
    await page.goto(url);
    await page.waitForSelector('#setupSheet:not([hidden]), #app:not([hidden])');
    return page.evaluate(async () => {
      const m = await fetch(document.querySelector<HTMLLinkElement>('link[rel=manifest]')!.href).then((r) => r.json());
      return {
        title: document.title, ver: document.getElementById('verTop')!.textContent, touch: document.querySelector<HTMLLinkElement>('link[rel=apple-touch-icon]')!.getAttribute('href'),
        appTitle: document.querySelector<HTMLMetaElement>('meta[name=apple-mobile-web-app-title]')!.content, name: m.short_name, start: new URL(m.start_url, location.href).pathname,
      };
    });
  };
  const s = await info(BASE);
  const b = await info(BASE + 'beta/');
  ok(s.title === 'Finance Planner' && s.name === 'Finance' && s.appTitle === 'Finance' && s.touch === 'icons/apple-touch-icon.png' && /^\(v[\d.]+\)$/.test(s.ver!), 'stable: name, icon and version as before ' + JSON.stringify(s));
  ok(b.title === 'Finance Planner β' && b.name === 'Finance β' && b.appTitle === 'Finance β' && b.touch === 'icons/beta/apple-touch-icon.png' && /^\(v[\d.]+-beta\)$/.test(b.ver!), 'beta: own name, BETA icon and "-beta" version ' + JSON.stringify(b));
  ok(s.start !== b.start && b.start.endsWith('/beta/'), 'different start addresses, so the phone treats them as two apps');

  // Storage: set up the stable app; the beta must still be on its first screen.
  await page.goto(BASE);
  await page.fill('#sid', 'https://docs.google.com/spreadsheets/d/STABLESHEET_abcdefghijklmnopqrstuvwxyz/edit');
  await page.fill('#snick', 'Test');
  await page.click('#sidGo');
  await page.waitForSelector('#setupClient:not([hidden])');
  await page.goto(BASE + 'beta/');
  await page.waitForSelector('#setupSheet:not([hidden])');
  ok(true, 'the beta does not see the stable app’s sheet link (separate storage)');
  await page.click('#lb');
  await page.goto(BASE);
  ok((await page.getAttribute('html', 'lang')) === 'en', 'changing the beta’s language leaves the stable app alone');
  const keys = await page.evaluate(() => Object.keys(localStorage).sort());
  ok(keys.includes('fp_sheet') && keys.includes('fpb_lang') && !keys.includes('fpb_sheet'), 'stored separately: ' + keys.join(', '));

  // Offline layers: each page is controlled by its own service worker, with its own cache.
  await page.goto(BASE); await page.waitForTimeout(1500); await page.reload();
  const sc = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL);
  await page.goto(BASE + 'beta/'); await page.waitForTimeout(1500); await page.reload();
  const bc = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL);
  ok(!!sc && sc.endsWith('/FinAppRepo/sw.js') && !!bc && bc.endsWith('/FinAppRepo/beta/sw.js'), 'each app has its own offline layer: ' + sc + ' | ' + bc);
  const caches = await page.evaluate(() => caches.keys());
  ok(caches.some((k) => k.startsWith('fp-stable-')) && caches.some((k) => k.startsWith('fp-beta-')), 'both offline caches exist side by side: ' + caches.join(', '));
  await page.goto(BASE); await page.waitForTimeout(1000);
  ok((await page.evaluate(() => caches.keys())).some((k) => k.startsWith('fp-beta-')), 'opening the stable app does not delete the beta’s cache');

  const vs = await page.evaluate(async (u) => [await fetch(u + 'version.json').then((r) => r.json()), await fetch(u + 'beta/version.json').then((r) => r.json())], BASE);
  ok(!!vs[0].version && !!vs[1].version, 'each app has its own version file');
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})();
