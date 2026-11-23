# Finance Planner

A phone-only PWA (iPhone and Android) that reads and writes **your own Google Sheet**.
No backend and no analytics: financial data only travels between the phone and Google.

- Spec: [`docs/SPEC-part2.md`](docs/SPEC-part2.md) (section 14, Revision 3). SPEC.md part 1 is not in the repo yet.
- Behavioural reference: [`reference/prototype.html`](reference/prototype.html) (personal data removed).
- Plan and open decisions: [`docs/PLAN.md`](docs/PLAN.md).

## Layout

| Path | What |
|---|---|
| `src/model/` | Pure calculation logic (simulation, free money, pension, sheet parsing). No DOM, no network. |
| `src/sheets/` | Google sign-in (OAuth redirect) and the Sheets API client; the only three writes. |
| `src/ui/` | Panels, chart, English/Hebrew strings. |
| `src/template.ts` | Builds the empty `.xlsx` template (Settings, Holdings, Pension, Goals, ToDo). |
| `tests/` | Unit tests, a parity test that runs the prototype itself, and an end-to-end smoke test. |

## Google Cloud setup (one time)

1. In Google Cloud Console create a project, enable the **Google Sheets API**.
2. OAuth consent screen: External, Testing mode, add your Google account(s) as test users.
   Scope: `https://www.googleapis.com/auth/spreadsheets`.
3. Credentials → OAuth client ID → **Web application**.
   - Authorized JavaScript origins: the site origin, e.g. `https://<you>.github.io`
   - Authorized redirect URIs: the exact app URL, e.g. `https://<you>.github.io/FinAppRepo/`
     (the `?diag` screen prints the exact value to register).
4. Build with the client ID (it is public, not a secret, but keep it out of the source):
   `VITE_GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com npm run build`

In Testing mode Google sign-ins last about an hour; the app refreshes silently and asks again only if that fails.

## Develop

```sh
npm install
npm test            # unit + parity tests
npm run dev         # http://localhost:5173 (add it as a redirect URI to sign in locally)
npm run build       # dist/ — static files, host anywhere with HTTPS
npm run e2e         # builds, serves and drives the app with Google mocked (needs Playwright)
```

## Step (a): sign-in test on phones

Host `dist/` on HTTPS, open it on the phone, **Add to Home Screen**, launch it from the icon, then open
`<app url>?diag`. It shows whether the app runs installed, the redirect URI, token status, and has
**Sign in**, **Silent refresh** and **Test read** buttons. Check on both iPhone (Safari) and Android (Chrome):
sign-in returns to the installed app, Test read works, and the app still works after closing it.
