// Builds tests/fixtures/delta-fake.pdf from delta-items.json (made-up data in the real report's
// layout), printed by Chromium like the real report. Run: NODE_PATH=/opt/node22/lib/node_modules npx tsx tests/fixtures/make-delta-pdf.ts
import { readFileSync } from 'fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright');

const dir = new URL('.', import.meta.url).pathname;
const { size, pages } = JSON.parse(readFileSync(dir + 'delta-items.json', 'utf8')) as { size: [number, number]; pages: { s: string; x: number; y: number }[][] };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const html = `<!doctype html><meta charset="utf-8"><style>
@page { size: ${size[0]}pt ${size[1]}pt; margin: 0 }
body { margin: 0; font: 7pt "DejaVu Sans", Arial, sans-serif }
.p { position: relative; width: ${size[0]}pt; height: ${size[1]}pt; page-break-after: always; overflow: hidden }
.p span { position: absolute; white-space: nowrap; unicode-bidi: plaintext; line-height: 1 }
</style>${pages
  .map((p) => `<div class="p">${p.map((i) => `<span style="left:${i.x}pt;bottom:${i.y}pt">${esc(i.s)}</span>`).join('')}</div>`)
  .join('')}`;
const b = await chromium.launch();
const page = await b.newPage();
await page.setContent(html);
await page.pdf({ path: dir + 'delta-fake.pdf', preferCSSPageSize: true });
await b.close();
console.log('wrote', dir + 'delta-fake.pdf');
