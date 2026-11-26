# Design notes

The source of truth is `docs/SPEC.md`. These notes cover how the app is built and the decisions behind it.

## Stack
- Vite + TypeScript, vanilla DOM, a hand-built SVG chart. No framework, no backend, no analytics.
- A PWA: the manifest and a service worker generated at build time. The service worker keeps the app shell only, never data.
- Google sign-in uses the Identity Services popup, with a redirect fallback for installed apps. The token is kept in memory only.
- External reads, all made from the phone:
  - Google Sheets.
  - data.gov.il (official fund data): only fund numbers are sent.
  - Gemini (Ask AI): only with the user's own key and consent.

## Code layout
| Path | What |
|---|---|
| `src/model/` | Pure calculation: simulation, goals, loans, free money, pension, deposits, sheet parsing. No DOM, no network, no clock. |
| `src/official/` | Official fund data: the fetch, the `(id,share%)` parsing, applying returns. |
| `src/sheets/` | Sign-in, the Sheets client, the sheet check, and every write (each behind a Save button). |
| `src/ui/` | Panels, chart, popups, Ask AI, English and Hebrew strings. |
| `src/storage.ts` | What the phone keeps: saved sheets (ID and nickname), client ID, language, UI choices, Gemini key. |

## Tests
- **`tests/*.test.ts`:** unit tests per rule, the SPEC section 10 acceptance cases, and the docs.
- **`tests/parity.test.ts`:** runs `reference/prototype.html` itself and compares. The deliberate improvements in SPEC section 12.17 are excluded.
- **`tests/e2e/smoke.ts`:** drives the built app with Google, Gemini and data.gov.il mocked.
- **`tests/e2e/channels.ts`:** checks that the stable and beta apps stay separate.

## Model decisions (kept from the prototype)
- A goal is paid at the end of the month before it's due, so January inflows don't fund a January goal.
- Monthly saving is spread over all included liquid holdings by value.
- Holdings with `include_in_total` = 0 still count toward the Stock reinvestment return.
- The projection runs at least 10 years from now.
- Saving continues after early retirement, and unvested Intel keeps vesting.
- The scenario factor is not applied to pension.

The model corrections and known simplifications are in SPEC section 12.17.

## Performance
The panels take about 30 ms on a laptop CPU. The free-money curve takes about 150 ms and is drawn just after the panels. The free-money searches stop at the first goal that is short.
