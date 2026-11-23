# Setup: from zero to the app on your iPhone

Three parts, about 20 minutes. Do parts A and B on a computer, part C on the iPhone.

In this guide, replace:
- `USER` with your GitHub username
- `REPO` with the repository name (e.g. `FinAppRepo`; capitals matter)

Your app's address will be **`https://USER.github.io/REPO/`**.

---

## Part A: publish the app (GitHub, one time)

1. **Make the repository public.**
   Repository → **Settings** → scroll to the bottom (Danger Zone) → **Change visibility** → **Make public**.
2. **Turn on GitHub Pages.**
   **Settings** → **Pages** (left menu) → under *Build and deployment*, set **Source** to **GitHub Actions**.
3. **Merge the app into `main`.**
   **Pull requests** → open the Finance Planner pull request → **Merge pull request** → **Confirm merge**.
4. **Wait for the deploy.**
   **Actions** tab → *Deploy to GitHub Pages* → wait for the green check (about 1–2 minutes).
   Open `https://USER.github.io/REPO/` on your computer: you should see "Connect your Google Sheet".

---

## Part B: create your Google sign-in (Google Cloud, one time)

This lets the app sign in as you. It is free and only you use it.

1. Go to **https://console.cloud.google.com** and sign in with **the Google account that owns your sheet**.
2. **Create a project:** project picker at the top → **New project** → name it `Finance Planner` → **Create**. Make sure it is selected.
3. **Turn on the Sheets API:** search bar → type `Google Sheets API` → open it → **Enable**.
4. **Set up the sign-in screen:** menu ☰ → **Google Auth Platform** (older name: *APIs & Services → OAuth consent screen*) → **Get started**:
   - App name: `Finance Planner`; support email: your Gmail → **Next**
   - Audience: **External** → **Next**
   - Contact email: your Gmail → **Next** → tick the agreement → **Create**
5. **Add yourself as a test user:** **Audience** (left menu) → *Test users* → **Add users** → your Gmail → **Save**.
   Leave *Publishing status* on **Testing**.
6. **Create the client ID:** **Clients** (left menu) → **Create client**:
   - Application type: **Web application**
   - Name: `Finance Planner`
   - **Authorized JavaScript origins** → Add URI → `https://USER.github.io` (no slash at the end, no repo name)
   - **Authorized redirect URIs** → Add URI → `https://USER.github.io/REPO/` (with the slash at the end)
   - **Create**
7. **Copy the Client ID** (ends with `.apps.googleusercontent.com`).
8. **Put it in GitHub** so you don't have to type it on the phone:
   GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **Variables** tab → **New repository variable**:
   - Name: `GOOGLE_CLIENT_ID`
   - Value: the client ID → **Add variable**

   Then rebuild: **Actions** → *Deploy to GitHub Pages* → **Run workflow** → **Run workflow**. Wait for the green check.

Google can take a few minutes (rarely longer) before a new client ID works.

---

## Part C: install and sign in on the iPhone

1. Open **Safari** and go to `https://USER.github.io/REPO/`.
2. Tap **Share** (square with arrow) → **Add to Home Screen** → **Add**.
3. **Close Safari and open the app from its new home-screen icon.** (Always use the icon, not Safari.)
4. **Paste your sheet link.** In the Google Sheets app: open your sheet → ⋯ → **Share & export** → **Copy link**. Paste it → **Continue**.
   (If the app asks for a client ID, part B step 8 was skipped: paste the client ID instead.)
5. Tap **Continue with Google** → choose your account.
6. Google warns **"Google hasn't verified this app"**. That's expected: it's your own app. Tap **Advanced** → **Go to Finance Planner (unsafe)** → **Continue** to allow access to your spreadsheets.
7. The **Sheet check** lists your tabs. If everything has a ✓, tap **Open the planner**.

**Every time after:** open the icon → tap **Continue with Google** (one tap; the sign-in isn't kept on the phone on purpose).

---

## If something goes wrong

| What you see | What to do |
|---|---|
| Sign-in window doesn't open, or comes back without signing in | Tap **Sign-in test** (bottom of the screen) → try **1. Sign in (popup)**. If it fails, try **2. Sign in (redirect)**; if that works, tap the button that says *switch to redirect*, then **Back to app**. |
| `Error 400: origin_mismatch` or `redirect_uri_mismatch` | In Google Cloud → Clients, check the two addresses from B6 exactly (origin without slash, redirect with slash). Wait 5 minutes, try again. |
| `Error 403: access_denied` | Your Gmail isn't a test user: redo B5. |
| "This Google account cannot open the sheet" | You signed in with a different Google account than the sheet owner's. |
| Sheet check shows ✗ | Fix the tab or column name in the sheet exactly as shown, then tap **Check again**. |
| Page not found | Wait for the green check in **Actions**; check that the address matches the repository name's capitals. |

The **Sign-in test** screen shows what the app sees (installed or not, token status, addresses to register). A screenshot of it is the fastest way to get help.

---

## Letting friends use it

Friends don't repeat parts A and B. They use **your** app address and **your** client ID:
1. Google Cloud → **Google Auth Platform** → **Audience** → *Test users* → **Add users** → their Gmail. (Up to 100 people.)
2. Make sure the client ID is baked in (part B step 8), so they aren't asked for it.
3. Send them the app link and the user guide (`docs/MANUAL.md`).

Their data stays between their phone and their own sheet; you can't see it.

## Day to day

- **Change your numbers:** edit the Google Sheet, then tap **Reload** in the app.
- **Saved from the app:** only new goals, the rainy day fund, and retirement age/allowance, each only when you tap its Save button.
- **App updates:** new versions arrive automatically when `main` changes. Close the app completely and reopen it (sometimes twice) to get the latest.
- **Remove everything from the phone:** **Forget this sheet** at the bottom of the app.
