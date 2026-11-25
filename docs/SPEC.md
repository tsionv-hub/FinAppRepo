# Finance Planner – Standalone Mobile App Spec (merged, current)

Single source of truth. `reference/prototype.html` is the working prototype: where this spec is silent, the prototype's behaviour is intended. The prototype reads the sheet through a Claude connector; the app replaces that with direct Google Sheets API calls. Port the calculation logic as pure, unit-tested functions.

## 1. Principles and targets
- **Phone only, iPhone and Android.** One codebase as a PWA (installable from the browser, app shell works offline). Optional later: wrap with Capacitor for the stores. No native code to start.
- **Fully local, no backend, no analytics, no telemetry.** Financial data only travels between the phone and the user's own Google Sheet.
- **The Google Sheet is the source of truth.** The app reads it and writes only on explicit save buttons.
- **Standalone:** no sheet ID, credentials, names or personal data in the source, fixtures or template.
- **Bilingual UI** (English and Hebrew, right-to-left). **Sheet data is English only.**
- Mobile first, max content width about 640 px, light and dark theme.

## 2. First run
1. Welcome screen asks for the Google Sheet link (full URL or bare ID; the ID follows `/d/`).
2. Google sign-in (read and write). If the user has not configured sign-in, show a guided setup with the exact steps and a field for their OAuth client ID.
3. Validate the sheet: show a checklist of tabs and columns found or missing with actionable messages. Offer **Download sheet template** (section 3.6).
4. Stored locally: sheet ID, OAuth client ID, language, UI choices. Never stored: access token (memory only), any financial data.
5. Settings: **Change sheet**, **Forget this sheet** (wipes everything stored).

## 3. Sheet schema
Rows in Settings are found by key; columns in other tabs by header name (column order is free). Numbers may contain commas. Use unformatted values.

### 3.1 Settings (A key, B value, C notes)
base_currency (ILS), display_currency (ILS/USD/EUR; bottom-line only), inflation_enabled (0/1), inflation_rate_pct, start_date (app uses the current month), FX rows USD and EUR (rate to ILS, live via GOOGLEFINANCE in the sheet), monthly_saving_ILS, yearly_free_cash_ILS, yearly_intel_grant_USD (a value, not shares), capital_gains_tax_pct (25), income_tax_pct (50), intel_vest_years (4), intel_vest_every_months (6), birth_year, retirement_age, pre_retirement_allowance_ILS (monthly), pension_start_age (67), pension_deposit_growth_pct, pension_exempt_pct, pension_exempt_ceiling_ILS, pension_tax_rate_pct, old_age_allowance_ILS, return_factor_optimistic (1), return_factor_moderate (0.75), return_factor_pessimistic (0.5).

### 3.2 Holdings
id, name, vendor, account_number, owner, type, investment_style, investment_track, currency, current_amount, deposited_amount, return_5y_avg_pct, deposit_fee_pct, management_fee_pct, tax_type, include_in_total, ticker, quantity, available_from, opened_date, last_updated, notes; then computed convenience columns (the app ignores them and computes itself).
- `type`: Study fund, Investment fund, Savings plan, Brokerage, Cash, Stocks, Stocks (unvested). Pension is not in this tab.
- `tax_type`: none, capital_gain, income (blank = none). `include_in_total`: 1/0 (blank = 1).
- Value ILS = current_amount × FX of currency. Deposited ILS = deposited_amount × FX; blank = value (gain 0).
- **return_5y_avg_pct is the return used** (blank = 0). `yearly_return_pct` no longer exists. Fees are stored, not used in projections yet.
- Stock rows: current_amount is a sheet formula quantity × GOOGLEFINANCE(ticker,"price"); the app only reads numbers and never calls a market API.
- Never display or log full account numbers; the app does not need them.

### 3.3 Pension (one row per fund)
id, name, owner, current_amount_ILS, monthly_deposit_ILS, deposit_fee_pct, accumulation_fee_pct, yearly_return_pct, conversion_coefficient, stops_at_early_retirement (blank = 1), notes.

### 3.4 Goals
id, name, target_amount_ILS, target_year, target_month (blank = 1), priority, notes, spend_when_due (blank = 1), type.
- type blank = normal goal; `reserve` = rainy day fund (amount only); `retirement` = early retirement (amount and date derived from Settings; the app recomputes them).

### 3.5 Write rules
Only on explicit save, only in English UI (reject goal names with Hebrew letters): append new goals (id, name, amount, year, month, priority, "Added in app", spend flag); update the rainy day fund amount; update retirement_age and pre_retirement_allowance_ILS. Nothing is written automatically. ToDo tab is not read by the app.

### 3.6 Template
Downloadable template (CSV set or .xlsx) with Settings, Holdings, Pension, Goals, ToDo, the headers above, one generic example row per type, the GOOGLEFINANCE formulas and a note per tab.

## 4. Loading
One batch request for all tabs. Status line "Updated <time> · USD <rate>"; Reload button. Goals added but not saved stay in the list across reloads marked "(not saved)". Handle: not signed in, no access, sheet or tab missing, rate limit, offline: each with a plain message and retry.

## 5. Calculation model (pure functions)

### 5.1 Values and tax
Per holding: value, deposited, gain in ILS. Tax: capital_gain = max(0, value − deposited) × capital gains rate (no credit for losses); income = value × income tax rate; none = 0. Post-tax = value − tax. Totals cover included holdings only; **pension is never in totals**. A toggle decides whether unvested Intel counts in totals; it never makes it liquid.

### 5.2 Time grid and order
Monthly steps, k = 0 now. Each month: growth, then Intel sale and vesting, monthly saving, January contributions, retirement withdrawal, goal checks, record totals. Horizon = latest of 2036, last goal year, retirement end year. Monthly growth = (1 + r × scenario factor)^(1/12) − 1 with r = return_5y_avg_pct.

### 5.3 Return scenario
Dropdown in the Projection panel: Optimistic (factor 1), Moderate (0.75, default), Pessimistic (0.5), factors from Settings. Multiplies every holding's return including Stock reinvestment. Not saved to the sheet. Pension funds use their own Pension-tab return (open question whether the factor applies).

### 5.4 Savings
Monthly saving: spread over included, non-unvested holdings in proportion to value, raising deposited. Yearly free cash: each January, over capital_gain holdings in proportion to value. Yearly Intel grant: each January, USD converted at the live rate, added as a new unvested lot. From January of the retirement year yearly free cash and the grant stop; monthly saving continues (decision pending).

### 5.5 Intel vesting, sale and reinvestment
Unvested shares are lots; a lot vests in intel_vest_years × 12 / intel_vest_every_months equal tranches (default 8), the first one interval after creation. Unvested value is never liquid. **Vested Intel is sold:** existing vested shares in the first month, each tranche the month it vests. Income tax at the marginal rate is taken at the sale. Net proceeds go into the synthetic holding **Stock reinvestment**: liquid, capital_gain tax on growth, basis = net proceeds, return = value-weighted average return_5y of Study fund, Investment fund, Savings plan and Brokerage holdings (not cash, Intel, pension). Shown in the Holdings list when non-zero. The stock tax and selling model is a known simplification (ToDo T1).

### 5.6 Goals
Due on the 1st of its month (default January). Paid from liquid money only: included holdings except unvested Intel and pension. Available = liquid post-tax − rainy day fund; funded if available ≥ amount. If spend_when_due = 1 a single fraction of every liquid holding is sold so net proceeds equal the amount and deposited shrinks by the same fraction.

### 5.7 Rainy day fund
Counted in totals, never spendable: subtracted before any goal check and before free money. Covered if liquid post-tax ≥ amount.

### 5.8 Early retirement
Starts January of birth_year + retirement_age (at earliest next year) until December of birth_year + pension_start_age − 1. The monthly allowance is withdrawn from liquid post-tax money, proportionally, never touching the rainy day fund. If available money is below the allowance in a month the goal is short; shortfall = sum of missing amounts. Displayed amount = allowance × 12 × years until pension.

### 5.9 Inflation
When enabled, goal amounts, allowance and rainy day fund are in today's money and inflated by (1 + rate)^(k/12) at each check; displayed projections are divided by the same factor.

### 5.10 Pension panel
Separate from totals, goals and free money. Per fund: monthly deposit (growing by pension_deposit_growth_pct) net of deposit fee; yearly accumulation fee on the balance applied monthly; interest at the fund's return; deposits stop in January of the retirement year when stops_at_early_retirement = 1; interest continues until pension_start_age. Monthly pension = balance ÷ conversion_coefficient. Tax: exempt share pension_exempt_pct up to pension_exempt_ceiling_ILS per month **per owner**, remainder taxed at pension_tax_rate_pct. Show total at pension age, monthly pension pre-tax and after tax, and the share of the retirement allowance covered (plus optional old-age allowance). Inflation toggle shows today's money.

### 5.11 Free money
Largest post-tax amount X removable from liquid holdings now such that every remaining goal and the retirement withdrawals stay funded and the rainy day fund stays intact. Upper bound = liquid post-tax − rainy day fund. Bisection (24 iterations now, 14 for the curve), removing X proportionally and re-simulating the future. Future saving and growth count, so a future shortfall that they close does not reduce today's free money. If 0 because goals cannot be met, show the extra monthly saving needed (bisection up to ₪1M); if one goal limits it, name it. Free money curve: monthly snapshots, evaluated every 3 months (every 6 when horizon beyond 2040); after the last goal and full vesting it follows the post-tax curve at a roughly constant distance.

### 5.12 Colored money
Today's liquid post-tax money L split into four lines: Rainy day fund (grey) = min(fund, L); Early retirement (purple); Other goals (orange, with count) = goals sorted by due date, R(k) = L − maxFree(first k goals), each gets R(k) − R(k−1); Free (green) = maxFree(all). A goal covered by future saving shows ₪0 "covered by future saving".

## 6. UI
Order and defaults (all panels collapsible; only Free money and Projection start open):
1. **Totals:** post-tax large, pre-tax smaller below, one panel; amounts visible in the collapsed header; estimated tax and pension line inside.
2. **Free money:** amount, explanation, colored bar, legend.
3. **Projection:** scenario dropdown, date slider (month steps, status for the chosen month: pre-tax, post-tax, free money), chart (SVG) with pre-tax, post-tax and free money lines; goal markers as a small dot on the post-tax line plus a tick (green funded, red short; no dashed lines); shaded retirement band labelled with retirement age and pension age; marker for the selected date.
4. **Next goals** (three nearest, with date, time remaining, amount, status). **Goals** (collapsible list with rainy day row, rows with amount, month and year, on track or short, projected balance, spend checkbox, progress bar; early retirement row shows age; add-goal form with name, amount, year, optional month, spend checkbox; "Save N new goals to sheet" button). **Pension** panel with a collapsed assumptions section. **Assumptions** (rainy day fund with Save, retirement age and allowance with Save, savings, Intel grant USD, inflation, tax rates, toggles). **Holdings** list at the selected date (vendor, owner, 5-year average, pre-tax and post-tax; pension pre-tax only). **Breakdown by type**.
5. Every field starts from the sheet; edits are what-if until the matching save button.
6. **Hebrew:** all labels translated, RTL, goal names via a built-in dictionary (first names, wedding, car, apartment, etc., rainy day fund, early retirement; unknown words stay), adding and saving disabled with a note, ILS amounts wrapped in LTR isolates.
7. Quality: full recalculation under about half a second on a phone; slider must not rerun the full simulation (cache until an input changes); Web Worker if needed.

## 7. Architecture
- TypeScript, Vite, static build to `dist/`. Light UI layer (vanilla or Preact); hand-built SVG chart. Modules: model (pure), sheets, auth, i18n, state, ui, storage.
- **Google access: sign in with Google in the browser** (Google Identity Services token flow, no server). Scope `https://www.googleapis.com/auth/spreadsheets`. Calls straight to `sheets.googleapis.com`: values:batchGet, values:append, values:update. Token in memory only; silent re-request on expiry; clear "Sign in again" screen.
- The user creates their own OAuth client (Web application) in their own Google Cloud project, enables the Sheets API, adds the app's origin as an authorized JavaScript origin; consent screen may stay in testing mode with the user as test user.
- **Hosting:** any static HTTPS host (GitHub Pages, Cloudflare Pages, Netlify); the files contain nothing personal so the host can be public. PWA manifest, icons, service worker caching the app shell only; financial data never cached to disk. Development on localhost.
- **Test first:** Google sign-in pop-up from a home-screen install on iPhone (and Android). Fallback: open the same URL in the browser.
- CSP: connect only to sheets.googleapis.com and accounts.google.com; only external script is Google's sign-in library.

## 8. Privacy and security
No analytics, error reporting or value logging. No data leaves the device except calls to Google for the user's own sheet. Token in memory only; "Forget this sheet" wipes local storage. No secrets or personal data in the repository.

## 9. Out of scope for now
Pension modelling beyond section 5.10; dynamic withdrawals beyond the fixed allowance; non-ILS goals; multiple sheets or users; share-vesting calendars; non-ILS display except bottom-line totals; use of fee columns in projections.

## 10. Tests and acceptance
- Unit tests per rule in section 5 using a small fictional fixture (no real data); post-tax total matches a hand calculation.
- A new Holdings row typed in the sheet appears after Reload; changing income_tax_pct changes only income-taxed rows; study funds never show tax; pension never in totals.
- Goals small relative to saving: free money = liquid post-tax − rainy day fund. Raising a goal never increases free money; adding saving never decreases it.
- After the last goal and full vesting: free money = post-tax − rainy day fund − unvested post-tax.
- Goal due dates fall on the 1st of the chosen month; default January.
- Intel: vested shares sold in month 1; each tranche sold at vesting; proceeds appear in Stock reinvestment with income tax taken.
- Scenario: Pessimistic ≤ Moderate ≤ Optimistic total at any future date.
- Retirement: yearly saving and grant stop; too-high allowance shows Short with a total.
- Pension: per-owner exemption ceiling; deposits stop at retirement.
- Hebrew: RTL, no writes possible, goal names translated.
- Sign-in failure, missing tab, offline each show a clear message.

## 11. Decisions still pending (defaults apply until decided)
1. Monthly saving after retirement (default: continues).
2. Unvested Intel at retirement (default: keeps vesting).
3. Whether fees reduce returns (reported 5-year returns are usually net of fees).
4. Whether the scenario factor applies to pension (default: no).
5. Stock tax and selling model (ToDo T1, default as in 5.5).
6. Option to start pension at age 60 (default: pension starts at 67).

## 12. Additions after v1

### 12.1 Recurring goals
Goals tab, two optional columns: `repeat_every_years` (blank = once) and `repeat_until_year` (blank = until the end of the projection). The amount is per occurrence, in today's money. Each occurrence is due on the 1st of `target_month` and is checked like a normal goal (funded, spend, free money). The list shows one row per recurring goal ("N of M funded"); the chart marks every occurrence; the popup lists them. The add-goal form has "Repeat every … years" and "Until year".

### 12.2 Loans (optional Loans tab)
Columns: id, name, owner, kind (`installments` or `lump_sum`), balance_ILS (owed today), interest_rate_pct (blank = 0), monthly_payment_ILS (installments), repay_year and repay_month (lump sum; month blank = January), notes.
- Interest is added monthly. Installments are paid each month until the balance is 0; a lump sum is paid in full on the 1st of its month.
- Repayments come from liquid post-tax money, never from the rainy day fund. A missed installment stays owed and is added to the next payment; "short" is the most the user falls behind.
- Repayments are checked like goals: they count for free money (with a "Loan repayments" line in the colored bar) and appear in Next goals and on the chart.
- A loan is an "anti-holding" with its own **Loans** panel (after Goals, only when there are loans): each loan's balance at the selected date as a negative amount, its plan (monthly payment and payoff date, or repayment date) and status; the header shows the total owed. Headline totals are not reduced; an "After debts" line shows post-tax minus the amount owed today.

### 12.3 Languages
Every screen, popup and message is available in English and Hebrew (the build fails if a Hebrew string is missing). Adding and saving work in both languages; text the user types (such as goal names) is saved as typed. Tab and column names stay English.

### 12.4 Model fix
When every eligible account is empty, monthly saving and yearly cash are split evenly across those accounts instead of being lost (the prototype dropped them from then on).

### 12.5 Early retirement panel and layout (v1.5)
- `retirement_age` blank = **60**. Early retirement has its own panel: start (January of birth_year + age), last year, pension start, years, monthly allowance, total, status, money set aside today, share covered by the pension, and the age/allowance fields with their Save button (moved from Assumptions).
- Every panel has a 🤔 button with a short explanation (it never opens or closes the panel). Panels are grouped as Today / Your plans / Details & settings, with a sticky jump bar; closed panels show a key value in their header (status badge, total, next date).

### 12.6 Sections (v1.8)
Quick look (your money today, projection) · Your money & goals (holdings with money by type on top, goals, loans) · Retirement & pension (early retirement, pension) · Settings (assumptions). The Next goals panel was removed. Only the projection starts open.

### 12.7 Ask AI (v1.9, optional, opt-in)
A floating 💬 Ask AI button opens a chat with Google Gemini, using each user's own free Gemini API key (stored on the phone only; Remove AI key and Forget this sheet delete it). First use: a red privacy warning that must be accepted (question and sheet numbers go to Google; free-tier data may be used to improve Google's AI; the developer sees nothing; account numbers are never sent), then step-by-step key setup with a test call (any key format is accepted; Google's answer decides; the setup screen reopens when the user returns from AI Studio). Later: a short 🥱🧑‍⚖️ reminder once per app opening, with "Don't show again" from the 4th time. Each question sends the sheet data, the app's own results and the user guide; the conversation lives in memory only while the chat is open and nothing is stored. This is the one exception to section 1's "data only travels between the phone and the sheet", made at the user's explicit choice.

- v1.10: a "🔒 Don't send my data" checkbox in the chat sends only the question and the user guide (no sheet data or results); switching it starts a new conversation; the choice is remembered on the phone; the privacy warning and reminder mention it.

### 12.8 Updates and header (v1.11)
On start and when returning to the app (online), it compares its version with the site's `version.json` and reloads once if newer; the service worker always revalidates the page (GitHub Pages lets browsers reuse pages for 10 minutes). The version is shown in brackets next to the title. The quick-navigation bar was removed.

### 12.9 Beta channel (v1.12)
A `beta` branch is built with `VITE_CHANNEL=beta` and published under `/beta/` as a separate app ("Finance β", BETA-ribbon icon, version shown as `-beta`). It has its own storage prefix (`fpb_`), service worker scope and cache; the stable service worker ignores `/beta/`. Changes land on `beta` first and are released by merging `beta` into `main`.

### 12.10 Deposits (v1.13)
Optional `Deposits` tab, one row per deposit: `holding_id` (Holdings `id`), `date`, `amount` (holding's currency) required; `deposit_id`, `currency`, `notes` optional; other columns (e.g. a `holding_name` formula) are kept. Dates may be ISO, day-first d/m/y or d.m.y, or a sheet serial. The holding popup lists the holding's deposits, the total, first and last date, and the return so far: the yearly rate r that solves Σ amount·(1+r)^(years since deposit) = current_amount (shown only with a span of two months or more). An add form appends a row in the tab's own column order (`deposit_id` = next `D<n>`) and, if ticked (default), adds the amount to the holding's `current_amount`. `deposited_amount` is read as typed first: a formula (e.g. SUMIFS over Deposits) is left alone, a number gets the deposit added, and a blank becomes the value before the deposit plus the deposit (v1.14.1). The projection still uses `deposited_amount` as the cost basis. Deposits go to Ask AI with the sheet data (holding name, date, amount; no row numbers).

### 12.11 Holding groups, bank balance, share grants (v1.14)
Holdings gets two optional columns. `group` is one of `study_fund`, `fund`, `trading`, `bank` or `stocks`; when it is blank or unknown, the group comes from `type`: Study fund → study_fund, Cash → bank, Stocks and Stocks (unvested) → stocks, Brokerage → trading, anything else → fund. `fund_number` is free text.

The Holdings panel shows one sub-section per group in that order, then Pension, each with a count and a pre-tax subtotal at the selected month.

The holding popup by group:
- **study_fund:** details only; the fund number is shown.
- **fund and trading:** deposits (12.10); the fund number is shown for funds.
- **bank:** a balance form that writes `current_amount`, in the row's own currency.
- **stocks:** share grants. A grant goes to the `Stocks (unvested)` holding with the same ticker, or else to the holding tapped. Saving appends a row to the optional Grants tab (`holding_id`, `date` and `shares` required; `grant_id` = next `GR<n>`; `notes`) and adds the shares to that holding's `quantity`. Its value is usually `quantity × GOOGLEFINANCE`.

The projection is unchanged: vesting still uses the Settings vesting values. Groups, fund numbers and grants go to Ask AI.

### 12.12 Official fund data (v1.15)
For study_fund and fund holdings with a `fund_number`, the app reads the latest month for each number from data.gov.il, which sends CORS `*`. It queries `datastore_search` on the "2024–today" resources: Bituach-Net (`c6c62cc7-…`) for type `Savings plan`, Gemel-Net (`a30dcbea-…`) for everything else. There is one request per database, filtering on `FUND_ID` (list) and sorting by `REPORT_PERIOD` descending. Fund IDs repeat across the two databases, so the database comes from the holding type. A policy can invest through another company's provident fund: a policy track not found in Bituach-Net is looked up in Gemel-Net in the same Gemel-Net request (v1.15.1).

`fund_number` may hold several numbers. The holding is then split evenly between the tracks: return = mean over tracks of (official `AVG_ANNUAL_YIELD_TRAILING_5YRS`, or the sheet's `return_5y_avg_pct` when a track has none or is not found). That return replaces `ret` for the projection, and the Stock reinvestment average is recomputed from it. Fees are never taken from official data; the sheet's fees are kept, because personal fees are usually lower.

The popup shows per track: name, 5-year and 3-year yearly averages, year to date (with month), the fund's average fee next to the user's, and stock and abroad exposure as a percent of assets. The panel marks such returns "(official)".

Results stay in memory for the visit only and are never stored. If the fetch fails, the sheet's returns are used. Demo mode does not fetch. Only fund numbers are sent. The data goes to Ask AI with the holdings. The CSP `connect-src` adds `https://data.gov.il`.

### 12.13 Collapsible groups, official returns chart (v1.16)
Each Holdings group (including Pension) is a collapsible section. Sections are closed by default, and the open ones are remembered on the phone (`hold_open`, a UI choice).

At the bottom of the Holdings panel, an "Official returns" chart compares every holding with official data in one vertical column chart. A selector picks the period: 5 years or 3 years (yearly averages), or since January. The choice is remembered on the phone (`ofc_period`). A holding split between tracks shows the plain average of its tracks. Columns are sorted best first, in reading order (right to left in Hebrew). Each column shows its value; negative values go below the zero line, and a missing value shows "–". Names are rotated and shortened to 18 characters. The note names the latest month of the data. (v1.16.1)

**v1.17:** Columns are coloured by holding type (study fund, investment fund, savings plan, brokerage, other), with a legend.

Each column is labelled with a short name:
- the optional Holdings `short_name`, if filled;
- otherwise a short form of the vendor (a fixed list of public company names, e.g. Migdal → MG, Hachshara → HAC) plus the last 4 digits at the end of the holding name;
- otherwise the owner's initial instead of the digits.

Tapping a column picks it:
- the other columns dim;
- a line under the chart names the holding, with a "Show in list" button that scrolls to it;
- its row in the list is highlighted, and its group opens.

Tapping the column again clears the pick. Redraws take the groups' open state from the screen, so a fast redraw doesn't undo a close.
