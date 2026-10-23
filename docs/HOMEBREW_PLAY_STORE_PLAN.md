# Homebrew: implementation plan for the Play Store

> A copy of `docs/IMPLEMENTATION.md` in the Homebrew repo (`D:\Homebrew`, github.com/SimonPhilpott/Homebrew), kept here
> beside IMS, where Homebrew is still built (`src/components/HomebrewBeta`). File paths below are the Homebrew repo's:
> `server/...` is `pdf-knowledge-base/server/...` here, and `twa/`, `public/` and `docs/ANDROID.md` are only in the Homebrew repo.

What's left to turn Homebrew into a proper Android app that anyone can install, apart from the recipe book (which needs
recipes you're allowed to publish - a separate job). For each piece: what it means, the decisions that are yours, the
steps, and how you'll know it's done.

**Where things stand (23 Oct 2026).** The app itself is ready: Material 3, installable, offline shell, icons, Android
app settings (`twa/`), free fonts only (Fraunces, Figtree, Noto Emoji), brewing tools. What's missing is mostly
*behind* the app - it still runs on IMS on your PC - plus Google Play's paperwork.

**Total:** about 3–5 weeks of focused work, plus Google's 14-day closed test.

---

## Contents

1. [Decisions to make first](#1-decisions-to-make-first)
2. [Accounts and running costs](#2-accounts-and-running-costs)
3. [Order of work](#3-order-of-work)
4. [Must do before release](#4-must-do-before-release)
   - 4.1 [A domain name](#41-a-domain-name)
   - 4.2 [Its own backend and hosting](#42-its-own-backend-and-hosting)
   - 4.3 [Accounts for anyone](#43-accounts-for-anyone)
   - 4.4 [Removing the "Simon" assumptions](#44-removing-the-simon-assumptions)
   - 4.5 [Cutting the IMS ties](#45-cutting-the-ims-ties)
   - 4.6 [Costs and abuse](#46-costs-and-abuse)
   - 4.7 [UK data protection](#47-uk-data-protection)
   - 4.8 [Google Play requirements](#48-google-play-requirements)
5. [Should do for a proper app](#5-should-do-for-a-proper-app)
6. [Nice to have](#6-nice-to-have)
7. [Release checklist](#7-release-checklist)

---

## 1. Decisions to make first

These shape everything after them. Each has a recommendation.

| Decision | Options | Recommendation |
|---|---|---|
| **Backend** | **Firebase** (Google's mobile backend: sign-in, database, storage, functions, notifications) or **Cloud Run + Cloud SQL** (today's Express server in the cloud, with Postgres) | **Firebase.** It's what Google recommends for Android, and it replaces most of the server you'd otherwise maintain. Cloud Run keeps more of today's code, but you'd still build sign-in, rules and notifications yourself. |
| **Database** (if Firebase) | **Firestore** (documents) or **Data Connect** (Postgres) | **Firestore.** Brews, logs and tastings fit documents naturally, and its security rules express "your brews are yours" directly. |
| **App name and package ID** | e.g. *Homebrew* / `uk.co.philpott.homebrew` | Check the name isn't taken on Play. **The package ID can never change after the first upload.** It's set in `twa/twa-manifest.json`. |
| **Domain** | e.g. `homebrewapp.co.uk`, `myhomebrew.app` | Something short you'll keep. See 4.1. |
| **Who sees what** | One shared recipe book (read-only) + each person's own brews, or everything private | **Shared book, private brews,** with optional sharing of a brew (as guests have now). |
| **Free, or paid** | Free with limits on AI features, or a paid tier | **Free with daily limits** at first (4.6). Decide on a paid tier once you see real costs. |
| **Admin** | You only, or you and helpers | **You only**, as an admin role (4.4). The ingredient-picture admin becomes a web tool for you, not part of the Play app. |

---

## 2. Accounts and running costs

| What | Who sets it up | Cost |
|---|---|---|
| Google Play Console (developer account) | You - needs ID verification, takes a few days | $25, once |
| Firebase project, on the **Blaze** (pay-as-you-go) plan | You create it; Blaze is needed for Cloud Functions | Free allowance first; a small app is typically £0–£20 a month |
| Domain name | You | about £10–£40 a year |
| Gemini API (insights, colours, what-if, ingredient picks) | Already have a key in IMS; give the app its own | Pennies per call; the limits in 4.6 keep it predictable |
| Pexels / Pixabay (photo search) | Already have keys; give the app its own | Free (rate-limited) |
| Sentry (error reports) | You | Free tier is enough |
| ICO data protection fee (UK) | You - check whether it applies (4.7) | about £40–£52 a year if it does |

**Set budget alerts** in Google Cloud Billing on day one (e.g. at £10, £25 and £50 a month).

---

## 3. Order of work

```
Week 1      4.1 Domain  ->  4.2 Firebase project, data model, security rules
Week 2      4.2 Move the data and pictures; the app reads and writes Firebase
Week 3      4.3 Open sign-up, first run  +  4.4 admin role  +  4.5 IMS ties cut
Week 4      4.6 Limits, App Check  +  4.7 privacy, export, deletion  +  5.x offline logging, notifications
Week 5      4.8 Store listing, build, sign, closed test starts (14 days)  ->  production
```

The backend and accounts (4.2, 4.3) are the long pole. Everything after them is small.

---

## 4. Must do before release

### 4.1 A domain name

**Why.** The Android app proves it belongs to its website through a file on the domain
(`/.well-known/assetlinks.json`); share links and the QR codes on bottle labels need a stable public address; Play
needs a privacy policy URL.

**You:**
1. Buy the domain (any registrar - Cloudflare, Namecheap, Google Domains' successor Squarespace...).
2. When Firebase Hosting is set up (4.2), add the domain there: Firebase gives you two DNS records to add at your
   registrar. HTTPS is automatic.

**Code:**
- Replace `HOMEBREW_HOST` in `twa/twa-manifest.json`.
- Share and label links: `publicBase()` in `server/services/homebrewShare.js` uses your ngrok address today; it becomes
  the domain (4.5).

**Done when:** `https://YOUR_DOMAIN` opens Homebrew over HTTPS.

---

### 4.2 Its own backend and hosting

**Why.** Today the app talks to `/api/homebrew` on the IMS server on your PC. A Play Store app needs a backend that's
always on, can't see the rest of IMS, and serves many people.

**You (Firebase console, about 30 minutes):**
1. Create a Firebase project ("homebrew"), region **europe-west2 (London)**.
2. Upgrade it to **Blaze** and set the budget alerts.
3. Turn on: **Authentication** (Google provider), **Firestore** (production mode), **Storage**, **Hosting**,
   **Cloud Functions**, **App Check**, **Cloud Messaging**.
4. Add an **Android app** in project settings with your package ID; add a **Web app** too (the TWA runs the web app).

**The data model (Firestore):**

| Collection | Document | Notes |
|---|---|---|
| `users/{uid}` | name, email, created, plan, limits used today | one per person |
| `users/{uid}/favourites/{brewId}` | (empty) | replaces `brews.favourite` and `brew_favourites` |
| `recipes/{id}` | everything a recipe has today, plus main ingredients, colour, banner | shared, read-only for everyone but admin |
| `brews/{id}` | everything a brew has, plus **`ownerUid`** and optional `sharedWith: [uid]` | replaces `brews.owner` |
| `brews/{id}/logs/{id}` | readings, rackings, additions | |
| `brews/{id}/tastings/{id}` | tastings | |
| `ingredients/{norm}` | name, type, picture path, added by hand | the admin list |
| `shares/{token}` | recipe id | public share links |

Pictures move to **Storage**: `pictures/{key}.jpg` (banners and ingredient photos), `uploads/{uid}/...` (people's own).

**Security rules (the heart of it):**
- Recipes and ingredients: anyone signed in can read; only admin can write.
- Brews: read if you own it or it's shared with you (or you're admin); write only if you own it.
- Logs and tastings: follow their brew.
- Favourites: only your own.

These replace `ownBrewOnly`, `notGuest` and `seenBy` in `server/routes/homebrew.js`.

**Code (me, or whoever builds it):**
1. **Export script**: read `app.db` (brews, logs, tastings, favourites, main ingredients, colours, banner choices,
   ingredient pictures and extras) and write the Firestore documents; copy `homebrew_pictures/` into Storage. Run it
   once against a test project, check it, then for real.
2. **Server logic → Cloud Functions**: what can't run in the app - Gemini (insights, colours, what-if, main-ingredient
   picks), photo searches and banner fill, share links, recipe PDFs and bottle labels. Labels and PDFs use a headless
   browser (Playwright) today, so they need a function with Chromium (or a small Cloud Run service just for them).
3. **The app**: every call goes through `api()` in `src/components/HomebrewBeta/logic.js` and a handful of direct
   `fetch('/api/homebrew/...')` calls. Replace them with the Firebase SDK (reads and writes) and function calls.
4. **Hosting**: `npm run build`, then `firebase deploy` serves `dist/` on your domain.

**Done when:** the app on your domain works with IMS switched off, your brews and recipes are all there, and a second
test account can't change them.

---

### 4.3 Accounts for anyone

**Why.** Today only you and the people you invite can sign in, through IMS's Google sign-in and its invite list.

**Steps:**
1. **Sign-in**: Firebase Authentication with Google. Optionally email-link sign-in for people without Google accounts.
   `src/AuthGate.jsx` swaps IMS's `/api/auth/status` for Firebase's signed-in user.
2. **First run** for a new, empty account:
   - a short welcome (what Homebrew does, in three screens at most),
   - "Start your first brew" (from a recipe or from scratch),
   - empty states that say what to do on My brews, Favourites and Find (most exist already).
3. **Profile**: name, sign out, delete account (4.7), units (6).
4. **Age gate**: it's an alcohol app. Ask for confirmation of being 18+ (UK legal drinking age) at sign-up, and set
   Play's target audience to adults (4.8).
5. **Sharing (optional)**: keep today's "see each other's brews" as *share a brew with someone* by email, rather than
   everyone seeing everyone.

**Done when:** a brand new Google account can sign up, start a brew, log a reading and favourite a recipe, and sees
none of your brews unless you share one.

---

### 4.4 Removing the "Simon" assumptions

**Why.** The code treats whoever isn't a guest as you.

| Where | Today | Becomes |
|---|---|---|
| `HomebrewBeta.jsx` | `isOwner = !user?.guest` | `isAdmin` from a Firebase **custom claim** (`admin: true`), set on your account only |
| `HomebrewBeta.jsx` | `initials()` falls back to "Simon Philpott" | falls back to the person's own name or email |
| `server/routes/homebrew.js` | `onlyOwner` / `isApprovedSession` (IMS's admin) | security rules + the admin claim |
| `server/routes/homebrew.js` | `ownerName: 'Simon'` for brews with no owner | every brew has an `ownerUid`; names come from `users/{uid}` |
| Admin screen (ingredient pictures, New ingredient, Invite) | in the app, for you | **a separate admin web page** (same code, own route) that the Play app never shows |
| Invites (`Invite.jsx`) | IMS's guest list | not needed once sign-up is open; becomes "share a brew" (4.3) |

**Done when:** searching the app code for "Simon" finds nothing outside comments, and a normal account has no admin
anything.

---

### 4.5 Cutting the IMS ties

| Tie | Today | Becomes |
|---|---|---|
| Step and nutrient reminders | `setStepReminders` / `setNutrientReminders` in `homebrewService.js` create reminders in IMS (`remindersService`) | **push notifications** via Firebase Cloud Messaging, scheduled by a Cloud Function (Cloud Tasks or a scheduled function checking due reminders). See 5.2. |
| Share links and label QR codes | `publicBase()` in `homebrewShare.js`: `SHARE_BASE_URL` or the ngrok address | `https://YOUR_DOMAIN/s/{token}` |
| Ims's voice tools (`findBrew`, `brewsForIms`) | read your brews | stay in IMS only; not part of the app |
| `brewGlossary.js` | already copied into this repo | nothing to do |
| Keys (Gemini, Pexels, Pixabay) | IMS settings / `.env` | the app's own keys in **Secret Manager**, used only by Cloud Functions |

**Done when:** the app works with no IMS anywhere, and labels' QR codes open a recipe on your domain.

---

### 4.6 Costs and abuse

**Why.** Every Gemini call and photo search costs money or quota, and a public backend can be called by anyone who
finds it.

**Steps:**
1. **App Check** with **Play Integrity** (Android) and **reCAPTCHA Enterprise** (web): only your genuine app can call
   your functions and database.
2. **Daily limits per person**, counted in `users/{uid}`. A starting point:

   | Feature | Limit a day |
   |---|---|
   | Insights | 5 |
   | What-if | 10 |
   | Photo searches (Change picture) | 20 |
   | Picture uploads | 20 |

   Main ingredients, colours and banners are made once per recipe and shared, so they don't need per-person limits.
3. **Budget alerts** (section 2) and a **kill switch**: a config value that turns AI features off if costs spike.
4. **Keys server-side only** (Secret Manager), never in the app.

**Done when:** a user hitting a limit sees a friendly "try again tomorrow", and costs show up in your budget alerts.

---

### 4.7 UK data protection

**Why.** UK GDPR applies as soon as other people's data is stored. Play also requires account deletion.

**You:**
1. **Privacy policy** (a page on your domain): what you collect (name, email, brews, readings, tastings, photos you
   upload, crash reports), why (to run the app), where (Google Cloud, London), how long (until you delete your
   account), who else sees it (Google as processor; Sentry if used), and how to contact you. Generators help, but read
   what it says.
2. **Check the ICO data protection fee**: https://ico.org.uk/for-organisations/data-protection-fee/ has a short
   self-assessment.

**Code:**
1. **Download my data**: a function that gathers the person's brews, logs, tastings and favourites into a JSON (and
   CSV) file.
2. **Delete my account**: in the app (Profile) **and** on a web page (Play requires both). Deletes the user, their brews,
   logs, tastings, favourites and uploads; the shared recipe book is untouched.
3. **Consent for crash reports/analytics** if you add any that aren't strictly necessary.

**Done when:** you can export and then delete a test account, and nothing of it is left.

---

### 4.8 Google Play requirements

Detailed build steps are in `docs/ANDROID.md` in the Homebrew repo. The order:

**You (Play Console):**
1. **Developer account** ($25, ID verification - start this early, it can take days).
2. **Create the app**: name, default language English (UK), app (not game), free.
3. **App content** (Policy section) - all must be complete before release:
   - **Privacy policy** URL (4.7).
   - **App access**: give Google a test login (they need to get past sign-in).
   - **Ads**: "No ads".
   - **Content rating** questionnaire: it references alcohol, so expect an adult rating.
   - **Target audience**: **18+** only (alcohol).
   - **Data safety** form: collected - name, email, user content (brews, notes, photos), app activity, crash logs;
     encrypted in transit: yes; deletion: yes (link to the web deletion page).
   - **Account deletion** URL.
4. **Store listing**:

   | Asset | Size |
   |---|---|
   | App icon | 512 × 512 PNG (`public/icons/icon-512.png`) |
   | Feature graphic | 1024 × 500 |
   | Phone screenshots | at least 2 (up to 8), 9:16, e.g. 1080 × 1920 |
   | Short description | up to 80 characters |
   | Full description | up to 4,000 characters |

**Build (needs the domain and hosting first):**
1. `npm i -g @bubblewrap/cli`, then in `twa/`: `bubblewrap init --manifest https://YOUR_DOMAIN/manifest.webmanifest`
   and `bubblewrap build`. Keep `android.keystore` and its passwords safe - **lose it and you can't update the app**.
2. Upload the `.aab` to a **closed test** track; turn on **Play App Signing**.
3. Copy Play's **app signing SHA-256 fingerprint** into `public/.well-known/assetlinks.json`, deploy, and check
   `https://YOUR_DOMAIN/.well-known/assetlinks.json`. Without it the app shows a browser bar.

**Closed test:**
1. Invite at least **12 testers** (Google accounts) who stay opted in for **14 days in a row**.
2. Fix what they find; push updates (most changes are web deploys - no new app upload needed).
3. Apply for **production access** in Play Console; answer the questions about the test.

**Done when:** the app is live on Play, opens full screen with no browser bar, and updates arrive by deploying the site.

---

## 5. Should do for a proper app

### 5.1 Offline logging
**Why.** The app opens with no signal, but a reading or tasting logged in the shed with no signal is lost.
**How.** Firestore's offline persistence covers most of it once 4.2 is done: writes queue on the phone and send when
back online. Show a small "Saved on this phone - will sync" note while offline.
**Size.** 1–2 days.

### 5.2 Push notifications
**Why.** "Take a reading", "rack it", "bottle it" - in place of IMS reminders.
**How.** Firebase Cloud Messaging; the app asks permission the first time a brew starts; a scheduled function sends
what's due (the step plans `nextJobs` and `setStepReminders` already work out). The TWA settings already have
`enableNotifications: true`.
**Size.** 2–3 days.

### 5.3 Testing on real phones and accessibility
- Test on at least two real Android phones (one small, one large), in light and dark, with large text.
- **TalkBack** pass: every button has a name, the order makes sense, sheets trap focus.
- Check colour contrast in both themes.
**Size.** 2 days, plus fixes.

### 5.4 Error reports and backups
- **Sentry** (or Firebase Crashlytics for the web): hear about crashes with the screen and steps.
- **Backups**: Firestore scheduled exports to a Storage bucket, daily, kept 30 days.
**Size.** 1 day.

### 5.5 A faster first load
The app loads as one ~480 KB file. Split it by screen (Tools, Admin, the brew form and label maker load when first
opened) with `React.lazy`, so the first screen appears sooner on a slow connection.
**Size.** half a day.

### 5.6 Guest and sharing rules, tested for real
The guest rules (read everything, change only your own) were tested with simulated data only. Once 4.3 is done, test
with two real accounts: each sees only what it should, and can change only its own.
**Size.** half a day.

---

## 6. Nice to have

| Item | Notes |
|---|---|
| **Units** | The Tools already offer litres, UK and US gallons (remembered on the phone). Still to do: an app-wide setting so brew pages, batch sizes and temperatures (°C / °F) follow it. |
| **Your own recipes** | Let each person save and edit their own recipes, alongside the shared book. |
| **Import and export** | Export a brew (PDF already exists; add CSV/JSON); import from a spreadsheet or another app. |
| **Ratings prompt** | Ask for a Play review after, say, the third finished brew - Play's in-app review API via the TWA isn't available, so link to the listing. |

---

## 7. Release checklist

- [ ] Decisions in section 1 made
- [ ] Play developer account verified
- [ ] Domain bought and pointing at Firebase Hosting, HTTPS working
- [ ] Firebase project on Blaze, budget alerts set, region London
- [ ] Data model and security rules written and tested with two accounts
- [ ] Data and pictures moved; app works with IMS switched off
- [ ] Open sign-up, first run, 18+ confirmation
- [ ] Admin is a claim on your account only; admin tools not in the Play app
- [ ] Reminders are push notifications; share links and QR codes use the domain
- [ ] App Check on; daily limits; keys in Secret Manager
- [ ] Privacy policy published; data export and account deletion (app and web)
- [ ] Offline logging; error reports; backups
- [ ] Tested on real phones; TalkBack pass
- [ ] Recipes you're allowed to publish (separate job)
- [ ] Store listing assets; App content section complete
- [ ] App built with Bubblewrap, signed, uploaded; assetlinks.json live
- [ ] 12 testers for 14 days; production access granted
- [ ] Released
