# Finance Planner: user guide

**[עברית](MANUAL.he.md)** · First time? The short version is [Getting started](START.md).

Finance Planner shows where your money stands today and whether your plans are funded in the future. It reads your numbers from **your own Google Sheet**; nothing is sent anywhere else, and nothing is stored on any server.

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
1. Paste your sheet's link (in Google Sheets: **Share** → **Copy link**) → **Continue**.
2. Tap **Continue with Google** → choose your account.
3. Google shows **"Google hasn't verified this app"**. That's normal for a private app: tap **Advanced** → **Go to Finance Planner** → **Continue**.
4. The **Sheet check** shows what was found. When everything has a ✓, tap **Open the planner**.

Next time: open the icon → **Continue with Google**. You sign in again each time on purpose; the app keeps no login on the phone.

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
| **Holdings** | Your money today by type (before tax), then every account at the date on the slider. |

**Tap any holding, loan or goal** for details.

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
- **What it knows:** your sheet, the app's own results (totals, free money, goal status, retirement, pension) and this guide. It can't know what isn't in the sheet; for example, the sheet keeps no history of individual deposits.
- **Limits:** the free key has a daily limit; AI can make mistakes, so the app's numbers are the reference. It's not financial advice.
- A short reminder appears once each time you open the app; from the 4th time you can choose **Don't show this again**.

---

## 6. Good to know

- **Your sheet is the source of truth.** Edit numbers in Google Sheets, then tap **Reload** in the app.
- **The app writes to your sheet only when you tap a Save button**: new goals, the rainy day fund, retirement age and allowance, and new deposits. Nothing else, never automatically.
- **"What if" changes** in Assumptions only change the screen. To keep them, change the sheet.
- **Returns** use each account's 5-year average return, scaled by the scenario (Moderate = 75% of it).
- **Rainy day fund** counts in your totals but is never spent.
- **Repeating goals** (Goals tab: `repeat_every_years`, `repeat_until_year`): each time is checked on its own, so you'll see if, say, the 2031 vacation is short.
- **Loans** (optional Loans tab): money you owe, paid in monthly installments or in one payment on a date. Repayments come out of your money like goals do. Your totals don't subtract loans; the **After debts** line does.
- **Deposits** (optional Deposits tab: `deposit_id`, `holding_id`, `date`, `amount`, `currency`, `notes`): tap a holding to see its deposits, the yearly return they add up to so far, and a form to add a deposit. Saving adds a row to Deposits and, if you leave the box ticked, adds the amount to the holding's `current_amount`.
- **Liquid money** means accounts you can actually use: not pension, not shares that haven't vested.
- It's a planning tool with simplified tax rules, not financial advice.

---

## 7. Privacy

- Your numbers go only between your phone and your Google Sheet.
- The person who sent you the app **cannot** see your sheet or your numbers.
- The phone keeps only your sheet link, language and (if you add one) your Gemini key. **Forget this sheet** (bottom of the app) removes them.
- **Ask AI** is the one exception to "only between your phone and your sheet": see section 5.

---

## 8. Problems?

| What you see | Try this |
|---|---|
| Error 403 / access denied at Google | You're not added as a tester yet: ask the person who sent you the app. |
| "This file is an Excel file" | In Google Sheets: **File** → **Save as Google Sheets**, then use the new link. |
| "This Google account cannot open the sheet" | Sign in with the Google account that owns the sheet. |
| Sheet check shows ✗ | Fix that tab or column name in the sheet exactly as shown, then **Check again**. |
| Sign-in window doesn't open | Tap **Sign-in test** at the bottom and try **2. Sign in (redirect)**. |
| Ask AI: "prepayment credits are depleted" (402) | The key's Google project is on paid billing with no credit. In AI Studio (ai.studio/projects) create a new project without billing and a key in it, or add credit. |
| Ask AI: "busy" (503) | Google's free AI is overloaded for a moment; the app already tried other models. Your key is fine: try again in a minute. |
| Old version after an update | Close the app completely and reopen it while online: it checks for a new version and updates itself. The version is shown at the top, next to the name. |
