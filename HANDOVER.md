# Handover: start your own copy of Finance Planner

> **For the AI assistant reading this first:** this file is your briefing. A person has given you this repository as a starting point for *their own* version of the app. Read this file completely. Then read `docs/SPEC.md`, `docs/PLAN.md`, `docs/TAXES.md` and `CLAUDE.md` before changing anything. Follow the rules in section 6. Confirm with the person before any step that affects GitHub, Google Cloud or their sheet.

> **For the person:** paste this whole file (or its link) as the first message of your AI coding session, and say what you want to change.

---

## 1. What this is

**Finance Planner** is a phone app (a PWA, so it works on iPhone, Android and desktop browsers) for planning a household's money. It reads and writes the user's **own Google Sheet**. There is **no server**: everything runs in the browser, and data only goes between the device and Google.

It shows:
- totals after tax, and the money that is **free to spend today** without breaking any goal;
- a monthly projection, with goals, loans and early retirement checked month by month;
- pension at pension age, after Israeli tax;
- official fund returns from the Ministry of Finance's open data;
- optionally, an **Ask AI** chat that uses the user's own Gemini key.

It is in English and Hebrew (RTL), and Israeli tax rules (2026) are built in.

## 2. How your copy stays separate from the original

You work on **your own copy** of the code, published as **your own app** with **your own Google sign-in and sheet**. Nothing you do can change the original repository, app or data.

| | Original | Your copy |
|---|---|---|
| Code | the original GitHub repository | **your fork** (or a repo made from it) |
| App address | the original's GitHub Pages | `https://<you>.github.io/<your-repo>/` |
| Google sign-in | the original's OAuth client | **your** Google Cloud OAuth client |
| Data | the original owner's sheet | **your** Google Sheet |

Getting later updates from the original is optional. On GitHub, use **Sync fork**, or merge `upstream/main` yourself.

## 3. Set up your copy (one time)

1. **Copy the code.** On GitHub, open the original repository and choose **Fork** (or **Use this template**). Keep the copy **public** if you want free GitHub Pages.
2. **Publish it.** In your repository: **Settings → Pages → Source: GitHub Actions**. Then run **Actions → Deploy to GitHub Pages → Run workflow**. Your app appears at `https://<you>.github.io/<repo>/`. The beta is at `…/<repo>/beta/` once a `beta` branch exists.
3. **Create your Google sign-in.** Follow `docs/SETUP.md` Part B:
   - Create a Google Cloud project and enable the **Google Sheets API**.
   - Set up the OAuth consent screen (External, Testing) and add yourself as a test user.
   - Create an OAuth client of type **Web application**, with authorized JavaScript origin `https://<you>.github.io` and the redirect URIs listed in SETUP.md.
4. **Optional repository variables** (Settings → Secrets and variables → Actions → Variables):
   - `GOOGLE_CLIENT_ID`: your client ID, so users don't have to paste it.
   - `FEEDBACK_EMAIL`: where the app's "Send feedback" button emails. Never put an email in the code.
5. **Make your sheet.** Open your app → **Download an empty template** (or the example) → upload it to Google Drive → **File → Save as Google Sheets** → fill it in.
6. **Connect.** In the app, paste the sheet link, give it a nickname, and sign in.

## 4. How the app is built (the short version)

- **Stack:** Vite 6, TypeScript and the plain DOM (no framework), a hand-made SVG chart, Vitest and Playwright. The service worker is generated in `vite.config.ts`. A strict CSP in `vite.config.ts` lists every outside host.
- **Layout:**
  - `src/model/` holds the pure calculations: simulation, goals, loans, free money, pension, deposits, parsing. No DOM, network or clock.
  - `src/official/` holds the data.gov.il fund data.
  - `src/sheets/` holds sign-in, the Sheets client and the sheet check. **Every** write lives here; `edit.ts` adds, edits and removes rows.
  - `src/ui/` holds the screens, `i18n.ts` (strings) and `style.css`.
  - `src/ai/` holds Ask AI.
  - `src/storage.ts` holds what the device keeps.
- **Data flow:** sign in (Google Identity Services, popup with a redirect fallback; the token stays in memory only) → one `batchGet` of all tabs → check the columns (`src/sheets/validate.ts`) → parse **by column name** → simulate → draw.
- **The sheet:** the tabs are Settings, Holdings, Goals, and the optional Pension, Loans, Deposits and Grants. Columns are found by header name, so their order is free. The template is `src/template.ts`; the made-up example is `src/example.ts`.
- **Writes:** only when the user taps a Save button. A cell that holds a formula is never overwritten. Removing clears the typed cells and keeps the row.
- **Two apps from one codebase:** branch `main` is the stable app. Branch `beta`, built with `VITE_CHANNEL=beta`, is a separate app under `/beta/`, with its own name, icon, storage prefix and offline cache. `.github/workflows/deploy.yml` builds both into one Pages site.
- **Official fund data:** `fund_number` values like `(58,25%),(877,75%)` are looked up on data.gov.il (Gemel-Net, Bituach-Net, Pensia-Net). Only the numbers are sent, and results are kept in memory only.
- **Models and taxes:** see `docs/TAXES.md` for the full explanation and `docs/SPEC.md` (section 12 lists every change, in order).

## 5. Commands

```sh
npm install
npx tsc --noEmit                      # types
npx vitest run                        # unit, acceptance, parity and docs tests
VITE_FEEDBACK_EMAIL=feedback@example.com npx vite build && npx vite preview --port 4173
npx tsx tests/e2e/smoke.ts http://localhost:4173/ out    # end-to-end, Google/Gemini/data.gov.il mocked
VITE_CHANNEL=beta npx vite build      # beta build
```

The end-to-end test needs Playwright with Chromium installed. Every line it prints must start with `ok`.

## 6. Rules to keep (they protect users)

1. **No personal data in the repository:** no sheet IDs, emails, names, account numbers, real amounts or real fund numbers, in code, tests or docs. Use made-up data only. Example fund numbers are 99901–99905, which no real fund uses.
2. **The sheet is the source of truth.** Write only behind an explicit Save button, never automatically, and never overwrite a formula cell.
3. **Two languages.** Every user-facing string lives in `src/ui/i18n.ts`. `he` is typed against `en`, so a missing Hebrew string fails the build.
4. **Privacy:** the token stays in memory; the device stores no financial data; only fund numbers go to data.gov.il; Ask AI needs the user's own key and consent. Add any new outside host to the CSP.
5. **Keep docs in step with the code:** each feature gets a SPEC section 12.x and updates to `docs/MANUAL.md` and `MANUAL.he.md`, plus `docs/TAXES.md` if a model changes. Bump `package.json` `version` for every release (it's shown in the app).
6. **Tests stay green:** add unit tests for model rules and end-to-end checks for user flows.

## 7. Things you'll probably want to change

- **`CLAUDE.md`:** its first section is the original owner's personal reply rule; keep it or replace it with your own. Its release flow (beta first, then "promote" to main) works for any copy.
- **Employer shares:** the Settings keys and labels mention Intel (`yearly_intel_grant_USD`, "Intel stocks"). Rename them in the parser, template, strings and docs together if you use another employer.
- **Tax figures** (2026 brackets, pension exemption, credit point) are in `src/model/pension.ts`, with defaults in `src/model/parse.ts`. Update them each year from the Israel Tax Authority.
- **Branding:** the name and icons are in `index.html`, `public/icons/` and the manifest in `vite.config.ts`.

## 8. Ideas not done yet (from the original backlog)

- Editing goals, loans and pension funds in the app (holdings are done; reuse `src/sheets/edit.ts`), and a "Save to sheet" for the Assumptions panel.
- A section 102 share-tax model: growth after the grant taxed as capital gain.
- A tax-smart withdrawal order (tax-free money first), and the investment provident fund's tax-free annuity after 60.
- Counting past inflation for existing gains, using the Deposits dates.
- A monthly "update balances" flow, and warnings on holdings whose values are stale.

## 9. Suggested first steps for the AI

1. Read `docs/SPEC.md`, `docs/PLAN.md`, `docs/TAXES.md` and `CLAUDE.md`.
2. Run `npm install`, `npx tsc --noEmit` and `npx vitest run`, and report the results.
3. Ask the person what they want to change, and whether section 3 (their own Pages, Google client and sheet) is already done.
4. Work on a branch, with small releases; check the app in the browser (or with the end-to-end test) before calling a change done.
