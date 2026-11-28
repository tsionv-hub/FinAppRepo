import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

// Two channels from one codebase: the stable app, and a beta built with
// VITE_CHANNEL=beta and published under /beta/. The beta has its own name, icon,
// storage and offline cache, so the two apps never touch each other.
const channel = process.env.VITE_CHANNEL === 'beta' ? 'beta' : 'stable';
const beta = channel === 'beta';
const iconDir = beta ? 'icons/beta/' : 'icons/';

// The web app manifest for this channel (separate start URL = separate home-screen app).
const manifest = {
  name: beta ? 'Finance Planner β' : 'Finance Planner',
  short_name: beta ? 'Finance β' : 'Finance',
  description: beta ? 'Beta (testing) version of the Finance Planner.' : 'Personal finance planner that reads your own Google Sheet.',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#f6f7f9',
  theme_color: beta ? '#f59e0b' : '#2563eb',
  icons: [
    { src: iconDir + 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: iconDir + 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: iconDir + 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

// Name and icons in the page itself (iPhone uses these for "Add to Home Screen").
function channelHtml(): Plugin {
  return {
    name: 'channel-html',
    transformIndexHtml: (html) =>
      beta
        ? html
            .replace('<title>Finance Planner</title>', '<title>Finance Planner β</title>')
            .replace('content="Finance">', 'content="Finance β">')
            .replace('<meta name="theme-color" content="#2563eb">', '<meta name="theme-color" content="#f59e0b">')
            .replace('href="icons/icon-192.png"', 'href="icons/beta/icon-192.png"')
            .replace('href="icons/apple-touch-icon.png"', 'href="icons/beta/apple-touch-icon.png"')
        : html,
  };
}

// Content Security Policy for production builds (SPEC 7): scripts only from this
// app plus Google's sign-in library; network only to Google sign-in and Sheets. (Not applied in dev,
// where Vite needs inline scripts and a websocket.)
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "img-src 'self' data: blob:",
  "frame-src https://accounts.google.com/gsi/",
  "connect-src 'self' https://sheets.googleapis.com https://accounts.google.com/gsi/ https://oauth2.googleapis.com https://generativelanguage.googleapis.com https://data.gov.il",
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
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify(manifest, null, 2) });
      // The PDF reader (Delta import) is big and rarely used: fetched when needed, not kept offline.
      const files = ['./', ...Object.keys(bundle).filter((f) => !/^assets\/pdf[.-]/.test(f)).map((f) => './' + f), './' + iconDir + 'icon-192.png', './' + iconDir + 'icon-512.png', './' + iconDir + 'apple-touch-icon.png'];
      const version = createHash('sha256').update(files.join('|') + Object.values(bundle).map((b) => ('code' in b ? b.code : String(b.source))).join('')).digest('hex').slice(0, 12);
      const sw = `// Generated at build time. Caches the app shell only; never sheet data or Google calls.
const CACHE = 'fp-${channel}-${version}';
const CHANNEL = '${channel}';
// Only clear this channel's old caches (and, for stable, caches from before channels existed).
const mine = (k) => (CHANNEL === 'beta' ? k.startsWith('fp-beta-') : k.startsWith('fp-') && !k.startsWith('fp-beta-'));
const SHELL = ${JSON.stringify(files)};
self.addEventListener('install', (e) => {
  // cache: 'reload' so the offline copy is the new version, not a browser-cached old one.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && mine(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // The stable app never handles the beta app's pages (they live inside its folder).
  if (CHANNEL === 'stable' && req.url.startsWith(self.registration.scope + 'beta/')) return;
  // The version check must always reach the network.
  if (url.pathname.endsWith('/version.json')) return;
  if (req.mode === 'navigate') {
    // Network first for the page (the OAuth redirect lands here), cached shell when offline.
    // 'no-cache': always ask the server (GitHub Pages lets browsers reuse pages for 10 minutes).
    e.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).catch(() => caches.match('./', { cacheName: CACHE })));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
      // The app compares this with its own version on start and reloads once if they differ.
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: appVersion }) });
    },
  };
}

const appVersion = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;

export default defineConfig({
  base: './',
  // Shown at the bottom of the app and in the sign-in test, to check which version a phone runs.
  define: { __APP_VERSION__: JSON.stringify(appVersion), __APP_CHANNEL__: JSON.stringify(channel) },
  plugins: [channelHtml(), csp(), serviceWorker()],
  build: { target: 'es2020' },
  test: { include: ['tests/**/*.test.ts'] },
} as import('vite').UserConfig & { test: unknown });
