# Healthy Weight Coach

An AI-powered healthy weight-loss companion. Claude (via the Anthropic API, with web search for
accurate nutrition facts) analyzes meals, lab reports, and activity screenshots, generates
condition-aware guidance, and coaches gradual behavior change — paired with lightweight tracking
for water, steps, activity, and supplements. Installable as a PWA.

## Features

- **Registration** — name, age, gender, height, weight (all required) plus health conditions,
  used to personalize every recommendation, including physiological differences by age and
  gender (metabolic pace, muscle mass, hormonal factors).
- **Weight loss program** — pick a pace (Easy/Normal/Hard) or a target number of days; the daily
  calorie target and weekly rate are computed from your actual BMR/TDEE (never below a safe
  floor — an overly aggressive timeframe gets capped and explained, not silently honored), plus a
  generated 7-day **equipment-free indoor exercise program** calibrated to that pace and your
  profile.
- **App lock** (optional) — a password, plus Face ID/Touch ID/Windows Hello/Android fingerprint
  via WebAuthn if your device supports it. Skippable on first run and toggleable any time from
  the Profile tab; the app works exactly the same with it off.
- **Backup & restore** — download everything you've logged as a single JSON file (from the
  Profile tab) so switching phones doesn't mean losing your data, and restore from it later; a
  restore requires explicit confirmation since it replaces all local data. **Google Drive sync**
  (optional) does this automatically — one-tap backup to a private file in your Drive, and
  restore on a new phone by just signing into the same Google account (see setup below).
- **Coach chat** — conversational guidance grounded in the user's profile *and* a rolling summary
  of what they've actually logged recently (meals, activity, water, weight trend) — so it answers
  "how am I doing?" from real data, not just demographics. Backed by web search for accurate facts
  on specific branded/restaurant foods. Includes **voice mode** (say "Hey Coach, ...") using the
  browser's built-in speech recognition/synthesis — hands-free while the tab is open and focused
  (there's no way for a website to listen in the background like "Hey Siri"; that needs an OS-level
  integration no PWA can reach). Also includes **"Should I eat this?"** — a quick, decisive check
  (text or photo) for the moment before you eat something, not just an after-the-fact log.
- **Full conversational control** — almost everything below is also a chat tool, so "just talk to
  it" genuinely operates the app: logging meals/water/weight/steps/activity/supplements/health
  readings, generating any plan, checking rewards, syncing Google Fit, backing up to Drive,
  starting a workout timer/rep counter/Tabata session/video tracker, switching tabs — the coach
  calls the matching tool instead of just describing how to do it manually. Deliberately excluded:
  anything needing a photo/file upload (has to go through the UI), and anything security-sensitive
  or destructive (password/biometric setup, restoring a backup, deleting entries) — those stay
  manual on purpose.
- **Meal analyzer** — a **Quick Snap** box (upload/take a photo → analyzed and logged
  automatically, meal type guessed from time of day) plus a detailed manual analyzer. Accepts a
  photo, a PDF (menu, nutrition-facts sheet), or a spreadsheet (.xlsx/.csv, e.g. a food-log
  export) — not just images — with portion sizes, calories, a balanced-plate breakdown, and
  condition-specific warnings before you save it.
- **Family / shared meal** — for dishes ordered and shared at the table (e.g. a typical Chinese
  family dinner): list what's on the table and get a recommended personal portion per dish plus
  rice, sized for the party and adjusted for health conditions.
- **Food diary** — meals logged from either analyzer, identified by the photo you took, grouped by
  day, tagged with who logged it (you or a partner, see sharing below).
- **Mindful eating awareness** — the meal analyzer flags portions that look larger than a typical
  serving, and you can optionally self-report eating pace and fullness per meal; the coach surfaces
  real patterns from that (e.g. "ate past comfortably full in 4 of 7 meals this week") instead of
  generic "eat slower" advice — most people can't tell their own portion/pace has crept up over
  time without it being pointed out factually.
- **Share with a partner** — generate a code from the Profile tab and send it to a spouse/partner;
  they open a link (no login, no access to the rest of the app) that shows today's calorie
  allowance, water/step progress, and goal pace, refreshing automatically, plus a button to log a
  meal you ate together (with its own photo). Regenerate the code any time to revoke access.
- **Cut junk food** — an AI-generated, gradual step-down plan for reducing (and ideally
  eliminating) junk food/sugary drinks, with weekly targets, swap ideas, and craving tips. Junk
  items flagged during meal analysis count automatically; you can also quick-log one directly.
  Includes a **Balance & Rewards** ledger: logged extra activity banks redeemable treat credits
  (capped so it can't be hoarded into a binge), and junk food instances suggest a bit of extra
  light activity to work back toward even — nothing is ever blocked, just nudged.
- **Activity** — a **start/stop workout timer**: say what you're starting (swimming, tabata,
  whatever), hit Start, hit Stop when done — duration is timed automatically and calories burned
  are estimated from your weight and the activity's MET value (the standard exercise-science
  formula; a static table covers common activities, with an AI fallback only for activities it
  doesn't recognize). Also a beginner-friendly daily step goal (defaults scale with your activity
  level, e.g. 3,000/day to start if sedentary), a log for spontaneous sessions, an **end-of-day
  photo check-in** (screenshot your phone's step counter/fitness app/smartwatch and Claude reads
  the numbers off it), and **Google Fit auto-sync** for Android (see setup below).
- **Rep counter** — say what countable bodyweight exercise you're doing (push-ups, squats,
  sit-ups, lunges, jumping jacks, burpees, and more) and it paces you through a full set with a
  large animated counter and spoken cues ("1... down... up... 2..."); set size is chosen for your
  fitness level from a deterministic table (AI fallback for exercises it doesn't recognize), not a
  maximum-effort target.
- **Tabata interval timer** — the real 20s-work/10s-rest structure with audio cues, plus an
  AI-curated (web-search-grounded, so the songs are real) list of Tabata-tempo track suggestions
  with one-tap search links — no in-app playback, since that would need a full Spotify
  account/SDK integration well beyond what was asked for.
- **AI video exercise coach** — enable your camera, wave to start, and it counts reps live by
  tracking your body's joint angles (sit-ups, push-ups, squats) using Google's MediaPipe pose model
  running entirely in your browser — no video ever leaves your device. Flags if you look like
  you've paused mid-set, and estimates calories burned (and a rough fat-gram equivalent) from your
  actual tracked reps and body weight. This is a best-effort geometric estimate, not a clinically
  validated fitness tracker — accuracy depends on lighting and how much of your body is in frame.
- **Water reminders** — daily goal computed from your weight and activity level (~33ml/kg + an
  activity bonus, not a flat default), with reminders spaced across your active hours to actually
  reach it, a pace check that flags when you're falling behind, and a daily cup log.
- **Healthy additions** — track probiotics/yogurt, vitamin C, digestive enzymes, fiber, and other
  supplements over time.
- **Health report analyzer** — upload a lab report (PDF, photo, or a spreadsheet export); Claude
  extracts markers (blood pressure, cholesterol, glucose, uric acid, etc.), explains the health
  impact of anything abnormal, flags relevant conditions, and lets you apply them straight to
  your profile.
- **Daily plan** — a one-day meal + light-exercise plan built from your profile.
- **Progress** — a required **morning weigh-in prompt** (shown once per day until logged), log
  readings from any kit (smart scale, BP monitor, glucose meter, uric acid meter), and a weight
  trend chart against your goal. If your weight stalls for two-plus weeks against your goal
  direction, a **plateau alert** offers an AI-generated alternative strategy based on your actual
  logged calories/activity/junk-food data — not generic advice.
- **Insights** — trend charts (14 days) for weight, calories logged, active minutes, steps, water,
  and junk food instances, built from everything else you've logged.
- **Installable (PWA)** — add to your phone's home screen for an app-like experience.

## Architecture

```
backend/    Node.js + Express API, calls the Anthropic API (Claude), JSON-file storage
frontend/   React + Vite single-page app
```

Data is stored locally in `backend/data/store.json` — there's no database or auth; this is a
single-user local app. No data leaves your machine except the specific request payloads sent to
the Anthropic API (meal descriptions/photos, lab report files, chat messages) and, if you connect
it, Google's Fitness/Drive APIs (steps/workout sessions read-only; Drive backup only ever sees the
one file this app created). The video exercise coach is the one exception worth calling out
explicitly: it runs Google's MediaPipe pose-tracking model (`@mediapipe/tasks-vision`) entirely
client-side in the browser — camera frames are never sent anywhere, including to this app's own
backend.

A partner opening a `?companion=1` share link renders a separate, minimal React entry point
(`frontend/src/CompanionApp.jsx`) gated only by the share code, not the app lock — see "Share with
a partner" above and the security note below.

## Setup

### 1. Backend

```sh
cd backend
npm install
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

Runs on `http://localhost:3001`.

### 2. Frontend

```sh
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173` and proxies `/api/*` to the backend. Open it in your phone's
browser (same network, use your machine's LAN IP instead of localhost) to test the "Add to Home
Screen" install flow — Chrome/Android supports it over plain HTTP on your LAN for development;
a real deployment needs HTTPS.

### 3. Google Fit setup (optional, Android only)

Apple HealthKit has no web-reachable API — a browser can never read it, only a native iOS app
can, so there's no equivalent setup for iPhone. Use the photo check-in in the Activity tab
instead. Android's Google Fit *does* have a cloud REST API a web backend can reach:

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a project (or reuse
   one) and enable the **Fitness API**.
2. Configure the **OAuth consent screen** (External is fine for personal use; add your own Google
   account as a test user while the app is unpublished).
3. Create an **OAuth client ID** of type **Web application**. Add an authorized redirect URI of
   `http://localhost:3001/api/google-fit/callback` (match `GOOGLE_FIT_REDIRECT_URI` below exactly).
4. Copy the generated **Client ID** and **Client secret** into `backend/.env`:
   ```
   GOOGLE_FIT_CLIENT_ID=...
   GOOGLE_FIT_CLIENT_SECRET=...
   GOOGLE_FIT_REDIRECT_URI=http://localhost:3001/api/google-fit/callback
   FRONTEND_URL=http://localhost:5173
   ```
5. Restart the backend, open the **Activity** tab, and tap **Connect Google Fit**.

Once connected, tap **Sync now** to pull the last 14 days of step counts and workout sessions.
Manual entries always take priority — a sync will never overwrite a day you typed in yourself.

### 4. Google Drive sync setup (optional)

Reuses the **same OAuth client** as Google Fit — just add a second redirect URI to it:

1. In the same Google Cloud project, enable the **Google Drive API**.
2. On the OAuth client you already created for Google Fit, add a second **Authorized redirect URI**:
   `http://localhost:3001/api/google-drive/callback`.
3. Add to `backend/.env` (the client ID/secret are shared with Google Fit — no new credentials needed):
   ```
   GOOGLE_DRIVE_REDIRECT_URI=http://localhost:3001/api/google-drive/callback
   ```
4. Restart the backend, open the **Profile** tab, and tap **Connect Google Drive** under "Google Drive sync".

This uses the `drive.file` scope — the app can only see files it created itself, never your
existing Drive contents. Because that visibility follows your Google account (not the device),
reconnecting with the same account on a new phone finds the same backup file automatically, which
is what makes "switch phones without losing data" work without you handling any files yourself.

### 5. App lock (optional)

No extra setup — Face ID/Touch ID/Windows Hello/Android fingerprint use the browser's built-in
WebAuthn support, gated by the same `FRONTEND_URL` env var used for Google Fit (it must match the
origin the frontend is actually served from, since WebAuthn checks it exactly). Works out of the
box at `http://localhost:5173`. There's no password-recovery flow — if you forget it, delete the
`security` block from `backend/data/store.json` to reset.

## Deploy to Render

Puts the app on a public URL anyone with the login can reach, instead of just your own machine.
This is still the same single-user app described above — one login, one account — just reachable
over the internet instead of localhost.

1. **Push this repo to GitHub** (if you haven't already):
   ```sh
   git add -A
   git commit -m "Initial commit"
   git push -u origin main
   ```
2. In the [Render dashboard](https://dashboard.render.com/), **New > Blueprint**, and select this
   repo. Render reads `render.yaml` at the repo root and creates the web service automatically —
   build command, start command, and health check are already configured.
3. You'll be prompted to fill in the env vars marked secret in `render.yaml` — at minimum
   `ANTHROPIC_API_KEY`. Leave `OPENAI_API_KEY`/`GEMINI_API_KEY`/Google Fit/Drive vars blank unless
   you use those features. **Never paste real keys into files you commit** — only into Render's
   dashboard.
4. Deploy. Render assigns a URL like `https://healthy-weight-coach.onrender.com` — the app detects
   this automatically (via Render's built-in `RENDER_EXTERNAL_URL`), so CORS and WebAuthn just work
   without you having to set `FRONTEND_URL` yourself.
5. **Open the URL immediately and register.** Until a password is set, the registration endpoint is
   open to anyone who finds the URL — whoever registers first owns the account. Don't share the
   link before you've done this.

**Persistent storage:** the free plan's filesystem is wiped on every redeploy/restart, which means
your logged data (profile, food log, login) resets too. To make it durable:
- In the Render dashboard, change the service's plan to **Starter** (or higher) — free plan
  services can't attach disks.
- Uncomment the `disk:` block at the bottom of `render.yaml` (or add a disk from the dashboard's
  Disks tab, mounted at `/var/data` — matches the `DATA_DIR` env var already set).
- Redeploy.

**Google Fit / Google Drive:** if you use either, update the OAuth client's redirect URIs in the
Google Cloud Console to your Render URL (`https://<your-app>.onrender.com/api/google-fit/callback`
and `.../api/google-drive/callback`), and set `GOOGLE_FIT_REDIRECT_URI`/`GOOGLE_DRIVE_REDIRECT_URI`
in Render's env vars to match exactly.

## Notes & limitations

- **Not medical advice.** The coach, meal analyzer, health report analyzer, and plateau
  alternative-plan generator all give general lifestyle guidance, not diagnosis or treatment.
  Every AI response that touches health data carries this reminder; take it seriously if you fork
  this for real use.
- **Device sync:** Google Fit (Android) syncs live once connected (see setup above). Everything
  else — smart scales, BP monitors, glucose meters, uric acid meters, and iPhone activity data —
  is manual entry or the photo check-in; there's no Bluetooth/HealthKit/Fitbit integration, since
  those need native app code or vendor credentials beyond what a web app can reach.
- **Water/step reminders, and voice mode, only work while the tab is open and focused** — there's
  no background push notification service or background microphone access in this build (a
  website can never listen in the background the way "Hey Siri" does — that needs OS-level
  integration only a native app can get).
- **PWA icon is a placeholder SVG.** It works for Android/Chrome install prompts; iOS's
  `apple-touch-icon` technically wants a PNG, so replace `frontend/public/icon.svg` (and add PNG
  variants) before a real deployment.
- **Single user, not multi-tenant.** Registration (name/DOB/login) is required on first use — every
  API route requires a valid session cookie, issued only after registering or logging in — but
  there's exactly one account per deployment, not per-visitor accounts. Anyone who registers first
  (or knows the login) has the one account; there's no separate data per user. See "Deploy to
  Render" above for what that means before sharing a public link.
- **Weight loss program calorie math** (BMR/TDEE via the Mifflin-St Jeor equation, a standard
  safe-minimum calorie floor) is a general-purpose estimate, not individualized medical guidance —
  the app says so in the UI, but take it seriously if you have a medical condition affecting
  metabolism.
- **Calories burned are MET-based estimates**, not measured — real energy expenditure varies by
  fitness level, effort, and individual physiology; treat the numbers as a reasonable ballpark.
  The video coach's per-rep calorie/fat-gram figures are the same kind of ballpark estimate (rep
  count × a published per-rep energy cost, scaled by body weight), not a metabolic measurement —
  the "fat-equivalent" grams specifically assume the calorie deficit came entirely from fat stores,
  which isn't how exercise fuel use actually works; it's an illustrative conversion, not a reading.
- **The video exercise coach** needs camera permission and, on first use, an internet connection to
  download the pose-tracking model from Google's CDN (a few MB, cached by the browser after that);
  all tracking itself then runs locally with nothing uploaded. Rep-counting accuracy depends on
  lighting and how much of your body is in frame — it's a heuristic joint-angle threshold, not a
  clinically validated form/rep tracker.
- **Partner sharing** uses a share code stored in plain text in `store.json` (like a Wi-Fi
  password, not hashed) with a short lockout after repeated wrong guesses — reasonable for
  something you deliberately hand to a partner, but anyone with the code or link gets read access
  to your daily plan and can log meals until you regenerate it from the Profile tab.
- **Voice mode requires Chrome or another browser with Web Speech API support** — Safari/Firefox
  support is inconsistent, so the voice button is hidden automatically where it isn't available.
- **Excel parsing** uses `exceljs` (only reads modern `.xlsx`, not the legacy binary `.xls`
  format) rather than the more common `xlsx`/SheetJS package, which has a known unpatched
  high-severity vulnerability — not an acceptable risk for a feature that parses untrusted
  user-uploaded files.
