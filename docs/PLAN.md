# Implementation plan

Source of truth: `docs/SPEC.md` (merged). Where it is silent, `reference/prototype.html`.

## Stack
- Vite + TypeScript, vanilla DOM UI (the prototype is plain DOM; a 1:1 port), hand-built SVG chart.
- Vitest. PWA: manifest + build-generated service worker (app shell only, never data).
- No backend, no analytics. Google Identity Services token popup (SPEC 7) with an OAuth
  redirect fallback for installed PWAs where popups fail. Token in memory only.
- The OAuth client ID is entered on first run (guided setup) and kept on the phone.

## Stages
1. **Sign-in test** (`?diag`): both methods, test read, from home-screen installs.
2. **Model** (`src/model`, pure): unit tests per rule, section 10 acceptance tests, and a parity
   test that runs the prototype script itself against a fictional fixture.
3. **Sheets layer**: one batch read, sheet check, writes only on explicit save, columns by header.
4. **UI**: panels in SPEC 6 order, English/Hebrew + RTL, first-run screens, Forget this sheet.
5. **Template** `.xlsx` with example rows, GOOGLEFINANCE formulas and notes.

## Behaviour kept from the prototype (worth a decision)
- A goal is paid at the step before its due month (end of the previous month), so January
  inflows (free cash, grant) do not fund a January goal. Displayed due dates are the 1st of the month.
- Monthly saving is spread over all included liquid holdings by value, including Cash and vested
  Intel (which is then sold the next month), as SPEC 5.4 says.
- Holdings with include_in_total = 0 still count toward the Stock reinvestment return weighting.
- Horizon floor is 10 years from now (= 2036 today, as SPEC 5.2 says).

## Performance (SPEC 6.7)
Panels: ~30 ms on a laptop CPU. The free-money curve (~150 ms) is drawn right after the panels,
so the screen never waits for it. Free-money searches stop at the first short goal. Move to a
Web Worker if the phone test shows lag.

## Pending (SPEC 11, defaults applied)
Saving after retirement continues; unvested Intel keeps vesting; fees unused; scenario factor not
applied to pension; stock tax model as 5.5; pension at 67.
