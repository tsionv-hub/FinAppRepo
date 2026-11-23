import { createHash } from 'node:crypto';
import { defineConfig, type Plugin } from 'vite';

// Content Security Policy for production builds: scripts only from this app,
// network only to Google's sign-in and Sheets endpoints. (Not applied in dev,
// where Vite needs inline scripts and a websocket.)
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://sheets.googleapis.com https://oauth2.googleapis.com",
  "form-action 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

function csp(): Plugin {
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${CSP}">`),
  };
}

// Writes sw.js with the exact list of built files, so the app shell works offline.
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = ['./', ...Object.keys(bundle).map((f) => './' + f), './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
      const version = createHash('sha256').update(files.join('|') + Object.values(bundle).map((b) => ('code' in b ? b.code : String(b.source))).join('')).digest('hex').slice(0, 12);
      const sw = `// Generated at build time. Caches the app shell only; never sheet data or Google calls.
const CACHE = 'fp-${version}';
const SHELL = ${JSON.stringify(files)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Network first for the page (the OAuth redirect lands here), cached shell when offline.
    e.respondWith(fetch(req).catch(() => caches.match('./', { cacheName: CACHE })));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [csp(), serviceWorker()],
  build: { target: 'es2020' },
  test: { include: ['tests/**/*.test.ts'] },
} as import('vite').UserConfig & { test: unknown });
