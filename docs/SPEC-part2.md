## 14. Revision 3 (supersedes earlier sections where they conflict)

The working prototype `reference/prototype.html` is the behavioural reference for everything below. It is a single HTML file that reads the sheet through a Claude connector; the standalone app replaces that part with direct Google Sheets API calls (sections 2 and 7). Port the calculation logic as pure, unit-tested functions.

### 14.1 Targets and delivery
- Phone only: iPhone and Android. Build one codebase as a PWA (installable from the browser, works offline for the app shell). Optional later: wrap the same code with Capacitor for the App Store and Play Store; do not start with native code.
- Fully local: no backend, no analytics. Financial data only travels between the phone and the user's own Google Sheet.
- First screen asks for the Google Sheet link (full URL or ID), then Google sign-in (read and write).
- No sheet ID, name or personal data anywhere in the source.

### 14.2 Sheet schema (read by column name, so column order is free)
**Settings** (A key, B value): base_currency, display_currency, inflation_enabled, inflation_rate_pct, start_date, USD and EUR rate rows (live via GOOGLEFINANCE in the sheet), monthly_saving_ILS, yearly_free_cash_ILS, yearly_intel_grant_USD, capital_gains_tax_pct, income_tax_pct, intel_vest_years (4), intel_vest_every_months (6), birth_year, retirement_age, pre_retirement_allowance_ILS (monthly), pension_start_age (67), pension_deposit_growth_pct, pension_exempt_pct, pension_exempt_ceiling_ILS, pension_tax_rate_pct, old_age_allowance_ILS, return_factor_optimistic (1), return_factor_moderate (0.75), return_factor_pessimistic (0.5).

**Holdings**: id, name, vendor, account_number, owner, type, investment_style, investment_track, currency, current_amount, deposited_amount, return_5y_avg_pct, deposit_fee_pct, management_fee_pct, tax_type, include_in_total, ticker, quantity, available_from, opened_date, last_updated, notes, then computed convenience columns. The app computes values itself. `yearly_return_pct` no longer exists: **return_5y_avg_pct is the return used** (blank = 0). Fees are stored but not used in projections yet. Pension is not in this tab.

**Pension** (one row per fund): id, name, owner, current_amount_ILS, monthly_deposit_ILS, deposit_fee_pct, accumulation_fee_pct, yearly_return_pct, conversion_coefficient, stops_at_early_retirement, notes.

**Goals**: id, name, target_amount_ILS, target_year, target_month (blank = 1), priority, notes, spend_when_due, type (blank, `reserve` for the rainy day fund, `retirement` for early retirement).

**ToDo**: id, item, area, status (open, in progress, done), notes. Not read by the app.

The app must also offer a downloadable template with these tabs and headers.

### 14.3 Model changes
- **Goal dates:** a goal falls due on the 1st of its month (default January), so it is paid at the start of that month.
- **Returns:** each holding grows at return_5y_avg_pct × the scenario factor. A scenario dropdown (Optimistic, Moderate, Pessimistic; default Moderate) sits in the Projection panel. It is a what-if and is not written to the sheet. Pension funds use their own Pension-tab return and ignore the scenario (open question).
- **Intel stock sale:** vested Intel shares are sold in the first month, and each unvested tranche is sold the month it vests. Income tax at the marginal rate is taken at the sale. Net proceeds go into a synthetic holding **Stock reinvestment**: liquid, taxed as capital gain on growth, basis = net proceeds, return = value-weighted average return_5y of Study fund, Investment fund, Savings plan and Brokerage holdings (not cash, Intel or pension).
- **Unvested Intel:** lots vest in equal tranches every `intel_vest_every_months` over `intel_vest_years`; each yearly grant (USD converted at the live rate) is a new lot. Unvested value is never liquid.
- **Retirement:** from January of birth_year + retirement_age to the year before pension_start_age, the monthly allowance is withdrawn from liquid post-tax money, never touching the rainy day fund. Yearly free cash and the Intel grant stop at retirement. Monthly saving continues (decision pending).
- **Rainy day fund:** counted in totals, never spendable. **Early retirement** and the rainy day fund are rows in Goals with the types above.
- **Free money** and **colored money**: as in sections 5.10 and 5.11, but the colored bar groups into four lines: Rainy day fund, Early retirement, Other goals (with a count), Free.
- **Pension panel:** per-fund projection (monthly deposit net of deposit fee, yearly accumulation fee on the balance, interest, deposits stop at early retirement, interest continues to pension age), then monthly pension = balance ÷ conversion coefficient, with the tax exemption ceiling applied per owner, after-tax pension, and the share of the retirement allowance covered (plus optional old-age allowance). Pension is never part of totals, goals or free money.

### 14.4 UI (order and defaults)
1. Totals: post-tax large, pre-tax smaller below, in one panel (collapsed; amounts visible in the header).
2. Free money (open): amount, explanation, colored bar and legend.
3. Projection (open): return scenario dropdown, date slider with status for the chosen month, chart with pre-tax, post-tax and free money lines, goal markers (a small dot on the post-tax line plus a tick, green funded and red short, no dashed lines), and a shaded retirement band labelled with the retirement age and pension age.
4. Next goals (three nearest), Goals (collapsible list, add-goal form with optional month, per-goal spend checkbox), Pension, Assumptions (rainy day fund, retirement age and allowance, savings, inflation, taxes, toggles), Holdings list (pre-tax and post-tax, pension pre-tax only, vendor, owner, 5-year average), Breakdown by type. All panels collapsible; only Free money and Projection start open.
5. English and Hebrew with right-to-left layout; goal names translated with a built-in dictionary. Sheet data is English only; adding and saving are disabled in Hebrew.
6. Writes only on explicit save buttons: new goals, rainy day fund amount, retirement age and allowance. Never automatic.

### 14.5 Decisions still pending
Monthly saving after retirement; unvested Intel at retirement; whether fees reduce returns (reported 5-year returns are usually net of fees); whether the scenario factor applies to pension; the stock tax and selling model (ToDo T1); pension start at age 60.
