# Finance Planner: user guide

**[עברית](MANUAL.he.md)** · First time? The short version is [Getting started](START.md).

Finance Planner shows where your money stands today and whether your plans are funded in the future. It reads your numbers from **your own Google Sheet**, and nothing is stored on any server. Only two optional features send anything elsewhere: fund numbers to the government's public fund data, and Ask AI (see section 7).

---

## 1. Just looking? Try the example

Open the app link and tap **Explore with example data** (or add `?example` to the end of the link).
You'll see a made-up household. Change things, tap rows, move the slider; nothing is saved.

---

## 2. Use it with your own numbers

**What you need:** a Google account, and to be added as a tester by the person who sent you the app (send them your Gmail address).

### a. Make your sheet (computer is easiest)
1. Open the app → **Download the example sheet** (made-up numbers) or **Download an empty template**.
2. Go to **drive.google.com** → **New** → **File upload** → pick the file.
3. Open it, then **File** → **Save as Google Sheets**. (Important: the app can't read an Excel file.)
4. Replace the numbers with yours. Keep the tab names and the column headers exactly as they are.

### b. Install the app on your phone
- **iPhone:** open the link in **Safari** → **Share** → **Add to Home Screen**.
- **Android:** open the link in **Chrome** → **⋮** → **Add to Home screen** (or **Install app**).

Always open the app from its icon.

### c. Connect
1. Paste your sheet's link (in Google Sheets: **Share** → **Copy link**), give it a short **nickname** (e.g. *Home*) → **Continue**.
2. Tap **Continue with Google** → choose your account.
3. Google shows **"Google hasn't verified this app"**. That's normal for a private app: tap **Advanced** → **Go to Finance Planner** → **Continue**.
4. The **Sheet check** shows what was found. When everything has a ✓, tap **Open the planner**.

Next time: open the icon → **Continue with Google**. You sign in again each time on purpose; the app keeps no login on the phone.

**Several sheets** (for example your own and your parents'): the nickname of the open sheet is shown at the top. Tap it to switch sheets, **Add a sheet** (link + nickname) or **Rename this sheet**. Each sheet is checked once the first time you open it. You need to be signed in with a Google account that can open the sheet. **Remove this sheet** (bottom) takes it off the list; the sheet itself isn't touched.

---

## 3. What you see

The screen has four sections: **Quick look** (your money today, projection), **Your money & goals** (holdings, goals, loans), **Retirement & pension** and **Settings**. Tap **➕** to open a panel and **➖** to close it; only the projection graph starts open. Every panel has a **🤔** button with a short explanation.

| Panel | What it tells you |
|---|---|
| **Inflation bar** (top) | Yellow ⚠ while amounts are in future shekels; tap **Adjust for inflation** for today's money. **🤔** explains it. |
| **Your money today** | Everything you have after tax (what you'd keep if you sold it all now), before tax, and after debts. Pension is not included. **Free to spend today**: how much you could spend now and still pay every goal, loan and early retirement on time and keep the rainy day fund. Tap **➕** at the bottom of the card for the colored bar showing where the rest is set aside. |
| **Projection** | Your money over time. Move the slider to see any month. Dots mark goals: green = funded, red = short. The shaded band is early retirement. Below the graph, pick a return scenario (Optimistic, Moderate, Pessimistic). |
| **Goals** | Each goal's date, amount and whether it's on track. Add a goal at the bottom; it can repeat (for example every year, or every 5 years). |
| **Early retirement** | When you stop working, the monthly allowance until your pension, and whether your money lasts. Change the age and allowance here. See section 4. |
| **Pension** | What your pension funds may pay per month, after tax. Kept separate from everything else. |
| **Assumptions** | Saving per month, yearly extra cash, inflation rate, tax rates and the rainy day fund. Changes are "what if" only. |
| **Loans** | Each loan: what you still owe (at the date on the slider), the payment plan and whether it's on track. Only shown if your sheet has a Loans tab with loans. |
| **Holdings** | Your money today by type (before tax), then every account at the date on the slider, in sections (study funds, funds and savings, trading accounts, bank, stocks, pension): tap a section's header to open or close it. Next to each account's name, a **%** shows its own yearly return so far, worked out from its deposits (each from its own date) to today's value: greener the higher, red if it lost money. It's shown only for accounts with deposits. At the bottom, the **Official returns** chart compares your funds' official returns (see section 6). |

**Tap any holding, loan or goal** for details. A holding's window also lets you add a deposit (funds and trading accounts), update the balance (bank) or add a share grant (stocks).

**Language:** tap **עברית / English** at the top. Everything works in both, including adding goals.

**How it works** (top) gives the basics in a few lines. **Send feedback** (bottom) opens an email to the person who shared the app.

---

## 4. Early retirement

Early retirement means you stop working **before** your pension starts, and live from your savings until then.

**How it works**
- **Start:** January of the year you reach your retirement age (**default 60**; set `retirement_age` in Settings or change it in the panel).
- **Until:** December of the year before your pension starts (`pension_start_age`, usually 67).
- **Each month in between**, the monthly allowance (`pre_retirement_allowance_ILS`) is paid from your liquid money: after tax, never from the rainy day fund, never from pension or unvested shares.
- **What changes at retirement:** yearly free cash and the stock grant stop. Monthly saving continues (a default you can change later).
- **With inflation on**, the allowance is in today's money and grows each year.

**What the panel shows**
- Start and end dates, your age, number of years, the monthly allowance and the total until your pension.
- **Status:** *On track* if every month is covered; *Short ₪X* shows how much is missing in total.
- **Set aside today:** how much of today's money is kept aside for it (also the purple part of the free money bar).
- **Pension then covers:** how much of the allowance your pension will replace once it starts.

**To plan it:** the Goals tab needs a row with `type` = `retirement` (the template has it), and Settings needs your `birth_year`. To try another age or allowance, change them in the panel; tap **Save retirement settings** to keep them in your sheet.

---

## 5. Ask AI (optional)

Tap **💬 Ask AI** (bottom corner) to ask questions in your own words, in Hebrew or English: *"How many holdings do I have with Migdal?"*, *"Is my early retirement on track?"*, *"How do I add a loan?"*

- **Privacy first:** each question sends your question **and your sheet's numbers** to Google Gemini, like pasting your sheet into Gemini yourself. With a free key, Google may use it to improve its AI. Account numbers are never sent, the app saves no questions or answers, and the person who shared the app never sees any of it. The first time, you must confirm you understand this.
- **One-time setup:** create a free Gemini key at **aistudio.google.com/apikey** (sign in → **Create API key** → copy it → on iPhone tap **Done** to come back), paste it into the app and tap **Save and test**. The setup screen waits for you when you return. The key stays on your phone; **Remove AI key** in the chat deletes it.
- **🔒 Don't send my data:** tick this in the chat to ask about the app only. Then only your question and this guide go to Google, none of your numbers. Switching it on or off starts a new conversation.
- **What it knows:** your sheet, the app's own results (totals, free money, goal status, retirement, pension) and this guide. It also gets your deposits and share grants (if you have those tabs) and the official fund data. It can't know what isn't in the sheet.
- **Limits:** the free key has a daily limit; AI can make mistakes, so the app's numbers are the reference. It's not financial advice.
- A short reminder appears once each time you open the app; from the 4th time you can choose **Don't show this again**.

---

## 6. Good to know

- **Your sheet is the source of truth.** Edit numbers in Google Sheets, then tap **Reload** in the app.
- **The app writes to your sheet only when you tap a Save button**: new goals, the rainy day fund, retirement age and allowance, new deposits, a bank balance, and share grants. Nothing else, never automatically.
- **"What if" changes** in Assumptions only change the screen. To keep them, change the sheet.
- **Returns** use each account's official 5-year average return when it has a fund number (otherwise your `return_5y_avg_pct`), scaled by the scenario (Moderate = 75% of it), **minus your own management fee** (`management_fee_pct`): official returns are before it, so a lower fee shows up as more growth.
- **Taxes:** capital gains tax (25%) is on the gain you sell; with inflation on, only on the real gain (above inflation). Study funds are tax free. The early-retirement allowance is your own money, so the only tax is on the gains sold to pay it. **Pension tax** follows the 2026 rules per person: 67% of the pension up to ₪9,430 a month is tax free (from 2028), the rest goes through the income tax brackets, less your credit points (`pension_tax_credit_points`, 2.25 by default; 2.75 for a woman). It's worked out in today's money.
- **Rainy day fund** counts in your totals but is never spent.
- **Repeating goals** (Goals tab: `repeat_every_years`, `repeat_until_year`): each time is checked on its own, so you'll see if, say, the 2031 vacation is short.
- **Loans** (optional Loans tab): money you owe, paid in monthly installments or in one payment on a date. Repayments come out of your money like goals do. Your totals don't subtract loans; the **After debts** line does.
- **Deposits** (optional Deposits tab: `deposit_id`, `holding_id`, `date`, `amount`, `currency`, `notes`): tap a holding to see its deposits, the yearly return they add up to so far, and a form to add a deposit. Saving adds a row to Deposits, adds the amount to the holding's `deposited_amount` (unless that cell is a formula, which updates itself), and, if you leave the box ticked, to its `current_amount`.
- **Holding groups** (Holdings `group` column: `study_fund`, `fund`, `trading`, `bank`, `stocks`; blank = from the type): the Holdings panel shows one section per group (tap a section's header to open or close it; the app remembers), an **Official returns** chart at the bottom comparing all holdings with a fund number (choose 5 years, 3 years or since January; columns are coloured by type and labelled with a short name such as `PHX 1234`, or your own `short_name` column; tap a column to highlight that holding in the list), and tapping a holding offers what fits its group:
  - Study funds: details only.
  - Funds and trading accounts: deposits, and adding a deposit.
  - Bank: update the balance.
  - Intel stocks: share grants (optional Grants tab: `grant_id`, `holding_id`, `date`, `shares`, `notes`). Adding one also adds the shares to the unvested holding's `quantity`.
- **Fund number** (Holdings `fund_number`, the official fund or track number): for study funds and funds, the app looks it up in the Finance Ministry's public data (Gemel-Net; Bituach-Net for savings plans) and shows the official returns, fees and stock exposure. The projection then uses the official 5-year average instead of `return_5y_avg_pct`. Your fees still come from your sheet. Several funds in one holding: write each with its share, e.g. `(101,25%),(202,75%)` (the older `101, 202` still works and means equal shares); the return is weighted by those shares. The same goes for **Pension** (`fund_number` there is looked up in Pensia-Net and replaces `yearly_return_pct` when a 5-year figure exists).
- **Expected yearly cost** (`expected_yearly_cost`, Holdings and Pension): the yearly cost your provider quotes, as a % of the balance: the management fee plus the fund's own investment costs (brokers, external managers). One number, or one per fund in the same `(cost,share%)` form; `?` = not known yet. It's shown in the details window. It isn't subtracted again in the projection, because the official returns are already after these costs. A savings plan's track can also be another company's provident fund: if it isn't in Bituach-Net, the app looks in Gemel-Net. A track with no 5-year figure, or one not found, uses your `return_5y_avg_pct`.
- **Liquid money** means accounts you can actually use: not pension, not shares that haven't vested.
- It's a planning tool with simplified tax rules, not financial advice.

---

## 7. Privacy

- Your numbers go only between your phone and your Google Sheet.
- The person who sent you the app **cannot** see your sheet or your numbers.
- If you fill in `fund_number`, only those fund numbers are sent to data.gov.il (the government's public data site) to fetch public fund data. No amounts, names or account numbers.
- The phone keeps only your sheets' IDs and nicknames, your language, a few display choices and (if you add one) your Gemini key. **Remove this sheet** (bottom of the app) takes one sheet off; removing the last one, or **Forget everything** on the first screen, clears it all.
- Two optional exceptions to "only between your phone and your sheet": **fund numbers** go to data.gov.il as above, and **Ask AI** (see section 5).

---

## 8. Problems?

| What you see | Try this |
|---|---|
| Error 403 / access denied at Google | You're not added as a tester yet: ask the person who sent you the app. |
| "This file is an Excel file" | In Google Sheets: **File** → **Save as Google Sheets**, then use the new link. |
| "This Google account cannot open the sheet" | Sign in with the Google account that owns the sheet. |
| Sheet check shows ✗ | Fix that tab or column name in the sheet exactly as shown, then **Check again**. |
| Sign-in window doesn't open | On the sign-in screen, tap **Sign-in test** at the bottom and try **2. Sign in (redirect)**. |
| Ask AI: "prepayment credits are depleted" (402) | The key's Google project is on paid billing with no credit. In AI Studio (ai.studio/projects) create a new project without billing and a key in it, or add credit. |
| Ask AI: "busy" (503) | Google's free AI is overloaded for a moment; the app already tried other models. Your key is fine: try again in a minute. |
| No official data for a fund ("not found") | Check the number in `fund_number`: it's the fund's or track's official number (on your statement or the provider's site). Several tracks: separate them with commas. |
| Old version after an update | Close the app completely and reopen it while online: it checks for a new version and updates itself. The version is shown at the top, next to the name. |
