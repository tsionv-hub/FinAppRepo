# Implementation plan

Sources: `docs/SPEC-part2.md` (section 14, Revision 3) and `reference/prototype.html`.
SPEC.md (sections 1-13) has not been added to the repo yet; anything that depends on it
(sections 2, 5.10, 5.11, 7) follows the prototype until it is.

## Stack
- Vite + TypeScript, no UI framework (the prototype is plain DOM; this keeps the port 1:1).
- Vitest for unit tests. PWA: web manifest + hand-written service worker (app shell only).
- No backend, no analytics. Google OAuth 2.0 implicit flow (token in the URL fragment),
  Sheets API v4 called straight from the phone.
- Google OAuth client ID comes from the `VITE_GOOGLE_CLIENT_ID` build variable; the sheet
  ID is entered on first launch and kept in the phone's local storage only.

## Stages
1. **Sign-in test** (`?diag` screen): sign in from a home-screen install on iPhone and
   Android, read the sheet title and Settings!A1:B3, show token expiry and display mode.
   Uses a full-page redirect (not a popup) because popups are unreliable in installed PWAs.
2. **Model** (`src/model`, pure, unit-tested). `tests/parity.test.ts` runs the prototype
   script itself in a VM against a fictional fixture and checks identical numbers.
3. **Sheets layer** (`src/sheets`): read tabs, write only on explicit save, columns
   located by header name.
4. **UI** (`src/ui`): panels in the order of 14.4, English/Hebrew + RTL.
5. **Template download**: .xlsx with the Settings, Holdings, Pension, Goals and ToDo tabs.

## Behaviour kept from the prototype (worth a decision)
- A goal is paid at the step before its due month (end of previous month), so January
  inflows (free cash, grant) do not fund a January goal.
- Monthly saving is spread over all included liquid holdings by balance, including Cash
  and vested Intel stock (which is then sold the next month).
- "Old account"-style holdings with include_in_total = 0 still count toward the Stock
  reinvestment return weighting.
- The simulation starts at the current month (the prototype hard-coded November 2026).
  `start_date` in Settings is not used yet.
