# Finance Planner

**[עברית](README.he.md)**

A phone app (iPhone and Android) for planning your money. It shows what your savings are worth after tax, how much you can spend today, and whether your goals, early retirement, loans and pension are covered.

Your numbers stay in **your own Google Sheet**. There is no server and no tracking: data only travels between your phone and Google. The optional **Ask AI** chat sends your question and sheet to Google Gemini, only after you agree.

## Using the app

| | English | עברית |
|---|---|---|
| **First time? Start here** | [Getting started](docs/START.md) | [איך מתחילים](docs/START.he.md) |
| Full user guide | [User guide](docs/MANUAL.md) | [המדריך המלא](docs/MANUAL.he.md) |

To just look around, open the app and tap **Explore with example data**. No sign-in is needed.

## Running your own copy

[`docs/SETUP.md`](docs/SETUP.md) covers publishing on GitHub Pages, creating the Google sign-in and adding friends as testers.

---

## For developers

- Spec (single source of truth): [`docs/SPEC.md`](docs/SPEC.md), including section 12 for recurring goals, loans and languages.
- Behavioural reference: [`reference/prototype.html`](reference/prototype.html) (personal data removed).
- Plan and open decisions: [`docs/PLAN.md`](docs/PLAN.md).
- Example data: `src/example.ts` (a made-up household); try it at `<app url>?example`.

### Layout

| Path | What |
|---|---|
| `src/model/` | Pure calculation logic (simulation, goals, loans, free money, pension, sheet parsing). No DOM, no network. |
| `src/sheets/` | Google sign-in (popup, redirect fallback), Sheets API client, sheet check; the only three writes. |
| `src/storage.ts` | What the phone keeps: sheet ID, client ID, language. Never the token or financial data. |
| `src/ui/` | Panels, chart, popups, English/Hebrew strings (every string must exist in both). |
| `src/template.ts`, `src/example.ts` | The downloadable empty template and example sheet. |
| `tests/` | Unit tests, a parity test that runs the prototype itself, and an end-to-end smoke test. |

### Develop

```sh
npm install
npm test            # unit + parity tests
npm run dev         # http://localhost:5173 (add it as a redirect URI to sign in locally)
npm run build       # dist/: static files, host anywhere with HTTPS
npm run e2e         # builds, serves and drives the app with Google mocked (needs Playwright)
```

Deploys run from `.github/workflows/deploy.yml`: `main` is published as the stable app and `beta` (built with `VITE_CHANNEL=beta`) under `/beta/` as a separate "Finance β" app; see [`docs/SETUP.md`](docs/SETUP.md). The version shown in the app comes from `package.json`.

```sh
VITE_CHANNEL=beta npm run build   # beta build (own name, icon, storage, offline cache)
npx tsx tests/e2e/channels.ts <base url>   # checks stable and beta side by side
```
