# Finance Planner: taxes, returns and assumptions

**[עברית](TAXES.he.md)** · Back to the [user guide](MANUAL.md)

This page explains, in detail, how the app works out returns and taxes. It also lists what it assumes and what it leaves out. The rules are Israel's for 2026. The app is a planning tool, not tax advice: for decisions, check with a tax adviser or your provider.

---

## 1. The basics

- **Everything happens month by month.** Starting this month, the app grows each holding, adds savings, pays goals, loans and the early-retirement allowance, and counts the tax that would be paid.
- **Two values for everything.** *Pre-tax* is what the account shows. *Post-tax* is what you'd keep if you sold it now. Totals, goals and free money all use **post-tax** money.
- **Taxes are paid when money is taken out.** A goal, a loan payment or the allowance sells part of your liquid holdings. The tax on the gain in that part is paid at that moment, so what you get is net.
- **Pension is separate.** It's never in totals, goals or free money, and it has its own tax (section 6).

## 2. Inflation (on by default)

The app shows amounts in **today's money**: future amounts are divided by the inflation built up until then (`inflation_rate_pct`, 2.5% a year by default). This is on by default and should stay on. Three things depend on it:

1. **Seeing the real picture.** At 2.5% a year, ₪100,000 in 25 years buys what about ₪54,000 buys today.
2. **Pension tax.** The exemption ceiling, the tax brackets and the credit point value all rise with prices every year. The app works out the pension tax in today's money against today's figures, which is the same thing (section 6).
3. **Capital gains tax.** The tax is on the *real* gain only (section 4). The part of a gain that just keeps up with prices isn't taxed.

You can turn it off. The app asks first, because everything then looks better than it is: savings look bigger, pension tax is too high, and capital gains tax is charged on the whole gain.

What grows with inflation when it's on:
- **Goals** are amounts in today's money; the app raises them with inflation until they're due.
- **The early-retirement allowance** is in today's money, so it rises every year.
- **The rainy day fund** is in today's money too.
- **Monthly saving, yearly free cash and the stock grant stay as typed:** they don't rise with inflation. That's a cautious assumption.

## 3. Returns

**The yearly return used for each holding:**

> return used = (official 5-year average **or** your `return_5y_avg_pct`) × scenario factor − your `management_fee_pct`

- **Official 5-year average.** For study funds and funds with a `fund_number`, the app reads the official figure (Gemel-Net, Bituach-Net, or Pensia-Net for pension) from data.gov.il. With several funds, e.g. `(58,25%),(877,75%)`, it's weighted by your shares. A fund with no official 5-year figure yet (a track under 5 years old) uses your `return_5y_avg_pct`. Its 1–3-year history isn't used, because a short good period would overstate long-term growth.
- **Scenario factor.** Optimistic × 1, Moderate × 0.75, Pessimistic × 0.5 (Settings: `return_factor_…`). It scales the market return.
- **Your management fee is taken off.** Official returns are **after** the fund's own investment costs (brokers, external managers) but **before** your personal management fee. So the app subtracts `management_fee_pct`, and a lower fee than average shows up as more growth.
- **`expected_yearly_cost` is not subtracted.** It's the provider's *expected yearly cost* (שיעור עלות שנתית צפויה): your management fee plus the fund's investment costs. Those costs are already inside the official return, so subtracting it would count them twice. It's shown in the details window for comparison.
- **Pension funds** use their own official return (Pensia-Net) or `yearly_return_pct`, without the scenario factor. Their fees are handled in the pension projection (section 6).
- **Stock reinvestment** is money from selling vested shares. It grows at the value-weighted return of your investment holdings, after their fees.

## 4. Capital gains tax (`tax_type` = `capital_gain`)

Used for investment provident funds (קופת גמל להשקעה), savings policies, brokerage accounts and similar.

- **Rate:** `capital_gains_tax_pct`, 25% by default.
- **The gain is the value minus what you put in** (`deposited_amount`, the cost basis). With no `deposited_amount`, the whole value counts as cost, so there's no gain and no tax.
- **Real gain only.** With inflation on, the cost basis rises with inflation every month, so the tax is only on the gain above inflation, as Israeli law does for these assets.
  - *Example:* you put in ₪100,000, and it's worth ₪150,000 when prices have risen 20%. The adjusted cost is ₪120,000, the real gain ₪30,000, and the tax **₪7,500**. On the nominal gain it would be ₪12,500.
- **Selling part of a holding:** the tax is on that part's share of the gain. Selling 10% of the holding taxes 10% of the gain.
- **No credit for losses.** A loss in one holding doesn't reduce tax on another.

## 5. Other tax types

- **Tax free** (`tax_type` = `none`): study funds (קרן השתלמות, within the tax-free limits), bank cash, and money that has already been taxed.
- **Income tax** (`tax_type` = `income`): used for the employer shares (Intel). The whole value is taxed at `income_tax_pct` (50% by default, your marginal rate).
  - *Vested shares* are sold right away; the net proceeds go to Stock reinvestment.
  - *Unvested shares* vest in equal parts every `intel_vest_every_months` over `intel_vest_years`, and each part is sold and taxed when it vests.
  - The *yearly grant* (`yearly_intel_grant_USD`) adds a new batch every January until early retirement.
  - *Simplification:* under section 102 (capital track), only the value at grant is income. Growth after the grant would be capital gain at 25%. The app taxes everything at the income rate, which is cautious.

## 6. Pension tax

**The projection, for each fund:**
1. Each month, the balance grows by the fund's return.
2. The yearly fee on the balance (`accumulation_fee_pct`) is taken off, a twelfth a month.
3. The monthly deposit (`monthly_deposit_ILS`) is added, less the deposit fee (`deposit_fee_pct`). It grows each year by `pension_deposit_growth_pct`.
4. Deposits stop in January of the early-retirement year if `stops_at_early_retirement` = 1. The balance keeps growing until `pension_start_age`.
5. **Monthly pension = balance ÷ `conversion_coefficient`.**

**Tax, per person** (the Pension tab's `owner`), in today's money:

1. **Add up** the person's pensions from all their funds.
2. **Tax-free part** = the smaller of the pension and the ceiling (`pension_exempt_ceiling_ILS`, ₪9,430 a month in 2026) × the exempt share (`pension_exempt_pct`). Under Amendment 190 the share is 57.5% in 2026, 62.5% in 2027 and **67% from 2028**. At 67% the most that's tax free is about ₪6,318 a month.
3. **Taxable part** = pension − tax-free part.
4. **Income tax brackets** (monthly, 2026):

   | Income up to | Rate |
   |---|---|
   | ₪7,010 | 10% |
   | ₪10,060 | 14% |
   | ₪19,000 | 20% |
   | ₪25,100 | 31% |
   | ₪46,690 | 35% |
   | ₪60,130 | 47% |
   | above | 50% (including the 3% surtax) |

5. **Credit points:** subtract `pension_tax_credit_points` × ₪242 (2026). The default is 2.25, every resident's base; a woman gets 2.75, and there are extra points for children, degrees and immigrants. The tax can't go below 0, and unused credit isn't refunded.

**Examples** (today's money, 2.25 points):

| Monthly pension | Tax free | Taxable | Bracket tax | − credit | **Tax** |
|---|---|---|---|---|---|
| ₪8,000 | ₪5,360 | ₪2,640 | ₪264 | ₪545 | **₪0** |
| ₪20,000 | ₪6,318 | ₪13,682 | ₪1,852 | ₪545 | **₪1,308** (6.5%) |
| ₪50,000 | ₪6,318 | ₪43,682 | ₪11,311 | ₪545 | **₪10,766** (21.5%) |

**Coverage of the early-retirement allowance:** (pension after tax in today's money + `old_age_allowance_ILS`) ÷ the allowance.

## 7. The early-retirement allowance

- **When:** from January of the year you reach `retirement_age` to December of the year before `pension_start_age`, the app pays `pre_retirement_allowance_ILS` every month (in today's money, so it rises with inflation).
- **No income tax.** It's your own savings, not income.
- **Where it comes from:** liquid holdings, in proportion to their value. The tax on the gains in what's sold is paid at the same time, so you receive the full allowance.
- **What's never touched:** the rainy day fund, pension and unvested shares.
- **If money runs out:** the month is marked short, and the panel shows how much is missing in total.

## 8. Not modelled (on purpose, or not yet)

- **Pension:**
  - *Tax-free severance taken earlier* (פיצויים פטורים) reduces the pension exemption (קיבוע זכויות). The app assumes it's all still available.
  - *Using the exemption for a lump-sum withdrawal* instead of the monthly pension.
  - *Health tax and national insurance* on the pension, and tax on the old-age allowance.
- **Investments:**
  - *An investment provident fund taken as a monthly pension after age 60* is tax free. The app treats it as a sale.
  - *Inflation before today:* the real-gain adjustment starts from today, so existing gains are taxed a little too high.
  - *Foreign-currency investments* have their own real-gain rules; the app uses the same rule for all.
  - *Withdrawal order:* tax-free money first would pay less tax. The app takes proportionally from everything.
  - *The 3% surtax* on large capital gains.
- **Everything:** the 2026 brackets, ceiling and point value are used for all years, rising with prices (which is how Israeli law updates them). Future law changes aren't known.

## 9. Settings keys for taxes

| Key | Default | Meaning |
|---|---|---|
| `inflation_rate_pct` | 2.5 | Yearly inflation (on by default in the app) |
| `capital_gains_tax_pct` | 25 | Tax on real gains |
| `income_tax_pct` | 50 | Marginal rate for employer shares |
| `pension_exempt_pct` | 67 | Tax-free share of the pension (from 2028) |
| `pension_exempt_ceiling_ILS` | 9430 | Monthly ceiling for the exemption (2026) |
| `pension_tax_credit_points` | 2.25 | Credit points per person |
| `old_age_allowance_ILS` | 0 | Bituach Leumi old-age allowance per month (today's money) |
| `return_factor_optimistic` / `_moderate` / `_pessimistic` | 1 / 0.75 / 0.5 | Scenario factors |

`inflation_enabled` and `pension_tax_rate_pct` from older sheets are no longer used.
