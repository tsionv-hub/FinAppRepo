# Finance Planner

A phone-only PWA (iPhone and Android) that reads and writes **your own Google Sheet**.
No backend and no analytics: financial data only travels between the phone and Google.

- Spec (single source of truth): [`docs/SPEC.md`](docs/SPEC.md).
- Behavioural reference: [`reference/prototype.html`](reference/prototype.html) (personal data removed).
- Plan and open decisions: [`docs/PLAN.md`](docs/PLAN.md).
- **User guide (for anyone using the app): [`docs/MANUAL.md`](docs/MANUAL.md).**
- Setting it up yourself (hosting + Google sign-in): [`docs/SETUP.md`](docs/SETUP.md).
- Example data: `src/example.ts` (a made-up household). Try it at `<app url>?example`.

## Layout

| Path | What |
|---|---|
| `src/model/` | Pure calculation logic (simulation, free money, pension, sheet parsing). No DOM, no network. |
| `src/sheets/` | Google sign-in (popup, redirect fallback), Sheets API client, sheet check; the only three writes. |
| `src/storage.ts` | What the phone keeps: sheet ID, client ID, language. Never the token or financial data. |
| `src/ui/` | Panels, chart, English/Hebrew strings. |
| `src/template.ts` | Builds the empty `.xlsx` template (Settings, Holdings, Pension, Goals, ToDo). |
| `tests/` | Unit tests, a parity test that runs the prototype itself, and an end-to-end smoke test. |

## Setup

Step-by-step (GitHub Pages, Google sign-in, iPhone): [`docs/SETUP.md`](docs/SETUP.md).
Deploys run from `.github/workflows/deploy.yml` on every push to `main`.

## Develop

```sh
npm install
npm test            # unit + parity tests
npm run dev         # http://localhost:5173 (add it as a redirect URI to sign in locally)
npm run build       # dist/ — static files, host anywhere with HTTPS
npm run e2e         # builds, serves and drives the app with Google mocked (needs Playwright)
```

## Step (a): sign-in test on phones

Host `dist/` on HTTPS, open it on the phone, **Add to Home Screen**, launch it from the icon, then tap
**Sign-in test** (or open `<app url>?diag`). Try **1. Sign in (popup)**, the spec's method, then **Test read**.
If the popup fails in the installed app, try **2. Sign in (redirect)** and switch the app to it with the
method button. Do this on iPhone (Safari) and Android (Chrome) and note which method works where.
