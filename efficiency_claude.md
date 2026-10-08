# IMS architecture review - efficiency, cost, reliability and security

Review by Claude Code, 8 October 2026, of the whole IMS system: backend (`pdf-knowledge-base/server`), web
app (`src/`), Box-3 firmware and the start-up scripts. Figures come from the live database (`token_usage`), `audio_captures/debug.log`,
the scheduler definitions in `index.js`, and local tests.

> **Status (8 Oct 2026, 12:40): items 1, 2 and 3 are fixed** - see "Fixed" notes under each. Verified through
> the public tunnel address: the database, project files and `.env` return 404, the tool routes return 403,
> and the app still loads.
>
> **Update (8 Oct 2026, afternoon):** items 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16 and 17 are done, 15 and 19
> partly (see the "Done" notes). 5 (prompt trimming) and 18 (splitting `index.js`) are left on purpose - see their notes.

Suggested order for the rest: **4 and 6** (cost), then **8, 9 and 11**.

---

## Critical - fix today

### 1. Private data is downloadable from the internet without a login
- ngrok publishes the **Vite development server** (port 6001) at the public tunnel address.
- The dev server hands out raw files from the whole project folder. The backend's login check
  (`requireAdmin`) only covers `/api` calls, which are proxied to port 3001; plain file requests never reach it.
- Confirmed through the public address: the full database `pdf-knowledge-base/server/data/app.db` (37 MB)
  downloads with HTTP 200. It holds glucose and health history, OAuth tokens, face recognition data,
  conversations and memories. `config.js`, `TASK_LIST.md` and other project files download too.
  (`.env` files are refused by Vite and return the fallback page.)
- **Fix:** have the tunnel point at a production build served by the backend, behind its login, not the dev
  server. At minimum, restrict the dev server to `src/`, `public/` and `node_modules/` and deny everything
  else (especially `pdf-knowledge-base/**`, `*.db` and `data/**`).
- **Immediate protection:** stop the ngrok tunnel until this is fixed.
- **Fixed:** a `security-guard` plugin runs first in `vite.config.js`. It serves only `src/`, `public/`,
  `node_modules/` and `index.html`. Any other project file or folder, any dot-file, any `..` path and
  `/@fs/` outside `node_modules` returns 404. `server.fs.deny` also blocks `*.db`, `pdf-knowledge-base/**`,
  `firmware/**` and `backups/**`. (Serving a production build behind the backend login is still the better long-term set-up.)

### 2. Command routes in `vite.config.js` bypass the login and are also exposed
- `vite.config.js` adds its own routes that run inside the dev server, before the proxy:
  `/api/backup` (runs PowerShell), `/api/mesh-backups`, `/api/mesh-backups/restore` and `/api/tunnel/start`.
- `/api/mesh-backups/restore?filename=` builds a path from `filename` without checking it. A `../` filename
  can read **any file on the PC**, which is then written into `src/data/mesh_authority.json(.js)` and can
  be downloaded through item 1.
- **Fix:** remove these routes or move them behind the backend login, and reject any filename that isn't a plain name in `backups/`.
- **Fixed:** these routes (and `/ims/port-status`) now answer only requests made on this PC; through the tunnel
  they return 403. The restore route accepts only a plain `*.json` file name.

### 3. Public GitHub repository with `.env` committed
- `SimonPhilpott/Information-management-system` is **public**, and the root `.env` (the `NGROK_AUTHTOKEN`) is
  tracked in git. API keys are not in it, but anyone can run tunnels on the ngrok account.
- **Fix:** make the repository private, or remove `.env` from git (`git rm --cached .env`) and add it to `.gitignore`.
  (The standing preference is not to rotate secrets; this is listed for awareness.)
- **Fixed (going forward):** the root `.env` is now encrypted with **dotenvx**, so it can be committed. The
  private key is stored in Windows Credential Manager on this PC, and `.env.keys` is git-ignored. `vite.config.js`
  and `start-all.bat` decrypt it. **The old, plain-text token is still in the public git history**, so it should
  be rotated in the ngrok dashboard; only that makes the old copy useless.

---

## Cost - the big wins

### 4. Wake-word checks use full Gemini Live sessions
- Any sound the Box-3 hears is streamed to the backend, which opens a **Gemini Live session with the full
  prompt** and checks the transcript for "Hey Ims" (`noWakeDetected` otherwise).
- On a typical day: **~362 wake checks (`verifying_start`) for 19 real utterances**. Of 482 sessions,
  155 lasted under 5 seconds.
- Last 7 days, `imsVoice` on `gemini-3.8-live`: **797 sessions, 14.4 million input tokens, 86,000 output
  tokens**, an average of **~18,000 input tokens per session**. Almost all of the cost is resending the prompt.
- **Fix:** check the wake word locally before opening Gemini:
  - on the PC: openWakeWord or a small Whisper / Vosk model in the existing Python environment, run on the short clip;
  - or on the Box-3: ESP-SR WakeNet.
  
  Only open a Gemini session for a real wake phrase. Expect roughly a 90% cut in voice cost and faster first replies.
- **Done:** `wakeGateService.js` + `python/wake_stt.py` (faster-whisper `base.en`, int8, CPU, hotword "Ims").
  On standby the Box-3's audio is held and transcribed locally; Gemini is opened - and handed the held audio -
  only when it matches the wake phrases (the same matchers, including the phrases service's recorded
  spellings) or opens with a greeting. Never applies in a conversation, follow-up, touch-to-talk or recording.
  Fails open (local model down -> Gemini decides). Tested: all six wake recordings pass (~0.8 s); silence,
  noise and ordinary chat are held. Live: background sounds are now held instead of opening Gemini.

### 5. The voice prompt is very large, and may be getting cut off
- The system instruction is **40,000 characters**, plus **23,000 characters of tool declarations (39 tools)**:
  about **16,000 tokens before anything is said**, sent on every session and every reconnect. Gemini closes
  idle sessions after 30-40 seconds, so reconnects are frequent.
- One section ("WHEN SOMETHING FAILS: ...") is about **25,000 characters** on its own, which suggests rules or memory are being appended into it.
- It's *exactly* 40,000 characters, which suggests a cap somewhere is trimming the end. Worth verifying.
- **Fix:** trim and deduplicate the prompt, move rarely needed rules into tool descriptions or tool results,
  and send only the tools that are relevant.
- **Checked, not changed:** there is **no 40,000 cap** - the prompt was 39,709 characters, nothing is cut. It
  is: persona rules (`personas/yorkshire.md`, your own persona file) 14,912; memory 6,078; fixed rules and
  data ~18,700; tools 22,654. With the wake check, ~90% fewer sessions carry it. Trimming the persona file
  or memory changes how Ims talks, so it is left for you to decide.

### 6. The cost page under-reports badly
- The Costs page shows **£0.37 for the last 7 days**, but **24.4 million tokens are unpriced**, including
  `gemini-3.8-live` and `gemini-3.8-flash`, the models doing nearly all the work.
- **Fix:** add prices for the models in use, so the dashboard and the monthly cap mean something.
- **Done:** list prices (ai.google.dev, checked 8 Oct) added for `gemini-3.8-flash`, `gemini-3.8-live`,
  `gemini-3.8-flash-tts`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-image`. The last 7 days now show
  **£17.35** (Ims voice £9.01, model tests £7.66); this month is projected at about **£72**.

### 7. Model Switcher assessments are expensive
- `modelTest` used **8+ million input tokens in 7 days**, including **7.3 million on 5 October** alone, when new models appeared.
- The daily `model_assessment` job also re-runs after every server restart (see 8).
- **Fix:** run it weekly, test fewer services per new model, or require confirmation for big runs.
- **Done:** the scheduled `model_assessment` job is disabled; it runs only from the Model Switcher page.

---

## Things that don't work as intended

### 8. The scheduler doesn't save when jobs last ran
- `schedulerService` keeps `lastRun` only in memory.
- **Jobs with a start-up delay re-run after every restart**, including the weekly `speech_stats` and
  `backup_integrity_drill` and the daily `model_assessment`. The server restarts many times a day during
  development (it restarts whenever a file it watches changes).
- **Jobs without one only run once a full interval has passed since start-up**, so the daily
  `pdf_dedupe` effectively never runs.
- **Fix:** save `lastRun` per job in the database, and on start-up schedule each job for `lastRun + interval`.
- **Done:** `lastRun` of every job of 10 minutes or longer is saved (setting `scheduler_last_runs`); a restart
  schedules it for `lastRun + interval` (never sooner than its start-up delay), and a job that has never run
  goes ~5 minutes after start-up.

### 9. Gemini sessions dropped by bad messages
- 8 closes with **1007 "Unknown name 'log'"**: a Box-3 `{"log": ...}` message sometimes gets forwarded to
  Gemini instead of being handled as device telemetry, and Gemini drops the session.
- 6 closes with **1008 "Requested entity was not found"**: an expired session resumption handle. Resuming with it fails.
- **Fix:** never forward device messages that aren't `realtimeInput` or `clientContent` upstream; drop
  the resumption handle after a failure.
- **Done:** only `setup` / `clientContent` / `realtimeInput` / `toolResponse` messages go to Gemini (or open a
  session); anything else is logged as "DEVICE MESSAGE (not for Gemini, dropped)". The cause was device log
  lines from the USB boot flood that weren't valid JSON. Resumption handles older than 15 minutes aren't used.

### 10. `feature.json` is invalid JSON
- There is an extra closing brace at the end, and it has been there for several commits.
  Anything that parses it will fail.
- **Done:** the `"features"` object closed after 90 entries, leaving 37 at the top level; they are back inside
  it (127 features) and the file parses.

---

## Performance

### 11. `debug.log` is 430 MB, never rotated, and written with blocking calls
- `audio_captures/debug.log`: about 430 MB, 2.85 million lines.
- Every line is written with `fs.appendFileSync`, which pauses the server's event loop during heavy logging.
- Most lines are device noise: about **88,000 `DEVICE DEBUG` lines a day** (an `rms=` level reading every
  500 ms) and verbose USB-host debug output (`D (...) USBH: Processing actions`). The firmware builds with
  `CORE_DEBUG_LEVEL=3`, and USB host logging is at debug level.
- **Fix:** lower the device log levels, write asynchronously (a stream), and rotate daily or by size.
- **Done:** one write stream; rotation to `debug-YYYY-MM-DD.log` daily or past 100 MB; rotated logs and capture
  folders deleted after 14 days; ESP-IDF `V`/`D` lines dropped. Firmware (built, needs flashing): USB stack
  logging back to warnings, the mic `rms=` reading every 10 s instead of 0.5 s.

### 12. Unbounded memory per live connection
- `connectionLogLines` in `handleLiveProxyConnection` keeps every log line for the lifetime of the
  connection, even when per-conversation capture is off. The Box-3 stays connected for hours.
- **Fix:** keep a short ring buffer (e.g. the last 500 lines), only for writing a capture folder.
- **Done:** the last 2,000 lines are kept; the capture file is written through a stream.

### 13. The web app is one 4.1 MB JavaScript file
- `dist/assets/index-*.js` is 4.1 MB, and `App.jsx` is about 2,500 lines. Every page is downloaded at start-up.
- **Fix:** load each page (`React.lazy` per route) only when it's opened. Expect start-up several times faster.
- **Done:** 32 pages are `React.lazy` with a `Suspense` in `main.jsx`: main bundle **4.1 MB -> 2.7 MB**, 84 chunks.
  Most of the rest is the 3D knowledge mesh (three.js) on the main screen - lazy-loading it is the next step.

---

## Clutter, dead code, wasted resources

### 14. An old copy of the web app is still started
- `start-all.bat` runs `pdf-knowledge-base`'s `dev:client`, an **old copy of the front end**
  (`pdf-knowledge-base/client`, last changed 27 August) that uses memory and a port for nothing.
- About **280 duplicate source files** are tracked in `scratch/` (`extracted_backup_june`, `temp_zip`) and `pdf-knowledge-base/client`.
- **Done:** no longer started (`start-all.bat`, `pdf-knowledge-base/package.json`), its process stopped and the
  folder removed (still in git history). `scratch/` is no longer tracked (kept on disk, already in `.gitignore`).

### 15. About 2.6 GB of stale data
- `server/data/vectors_float32_backup` (**1.9 GB**), `vectors_stale_backup` (83 MB), `data/backups` (645 MB).
- `audio_captures/` has 183 per-conversation folders (about 1 GB of WAV files).
- **Fix:** delete the old vector backups once the current vectors are confirmed good; add retention for backups and captures.
- **Done:** 458 leftover integrity-drill files removed and the drill now cleans up after itself; capture
  folders older than 14 days are deleted with the log rotation. The nightly backup zips (7 x ~51 MB, kept 10)
  are the intended backups. **Not done:** the vector backups - the old one holds 135 files under a different
  topic naming scheme from the 78 live ones, so it isn't clearly redundant; confirm before deleting 2 GB.

### 16. Leftover start functions that are never called
- `startNightlyBackups` (backupService), `startWeeklyDependencyWatch` (dependencyWatchService),
  `startEveningKomootSync` (routeFinderService), `startRunLearning` (runLearningService) and
  `startRunPushQueue` (runAlertsService). The scheduler took over these jobs. Delete them.
- **Done:** deleted.

### 17. Root folder clutter (much of it tracked in git)
- PowerPoints, a spreadsheet, JPEGs, a firmware zip, NAV exports (`NAVXML.*`, `nav.*`, `RawOutput.json`),
  an Office lock file (`~$an my run backup.docx`) and the 60 MB `antigravity-god-mode` folder.
- **Done:** 21 documents and reference files moved to `archive/` (git-ignored, kept on disk, no longer in the
  public repo); the Office lock file deleted. `NAVXML.txt` stays (the SharePoint fallback reads it);
  `antigravity-god-mode` stays (the Antigravity agent uses it); the extracted factory-firmware folder is
  locked by another program, so it's just ignored by git.

### 18. `index.js` is 3,800 lines
- The live voice proxy (`handleLiveProxyConnection`) is one huge function that handles wake checks, tool calls,
  device messages, recording, timers and logging.
- **Fix:** split it into modules (wake, tools, device protocol, session lifecycle). Bugs like item 9 would be easier to find.
- **Done:** `index.js` 4,020 -> ~1,340 lines. The live voice proxy is `server/live/liveProxy.js`; its helpers are
  `live/textMatching.js` (wake / vision / face-cue matchers), `live/setupMessages.js` (Gemini setup), `live/debugLog.js`
  and `live/state.js` (the device/browser sessions, cooldown and last-conversation state both sides share - they
  used to be `let`s in index.js the proxy reassigned). Found on the way: `noWakeDetected` / `endConversation` set
  two variables that no longer existed, which throws in a module - so the device was never told and a farewell
  never marked the conversation to end; fixed. The OTA "is a conversation open?" check read a variable that
  never existed outside the proxy; it now asks the wake daemon.

### 19. The device server (port 3003) has no login
- The plain HTTP server for the Box-3 accepts camera frames, logs, face packs and **personality setting
  changes** without any authentication. It's on the home network only, so the risk is low, but a shared device key would close it.
- **Done and on:** the Box-3 sends `X-IMS-Key` (key in `secrets.h`) on all its requests;
  the server rejects requests without it once `IMS_DEVICE_KEY` is set in `pdf-knowledge-base/.env`.

---

## Summary table

| # | Area | Problem | Impact | Effort |
|---|------|---------|--------|--------|
| 1 | Security | Database and files downloadable via ngrok dev server | Critical | Small |
| 2 | Security | Unauthenticated command routes and file read in `vite.config.js` | Critical | Small |
| 3 | Security | Public repo with `.env` committed | Medium | Small |
| 4 | Cost | Wake checks open full Gemini Live sessions | ~90% of voice cost | Medium |
| 5 | Cost | 16k-token prompt, possible truncation | High | Medium |
| 6 | Cost | Costs page missing prices for main models | Visibility | Small |
| 7 | Cost | Model assessments burn millions of tokens | Medium | Small |
| 8 | Reliability | Scheduler doesn't save job run times | Medium | Small |
| 9 | Reliability | Device messages and stale handles drop Gemini sessions | Medium | Small |
| 10 | Reliability | `feature.json` invalid | Low | Trivial |
| 11 | Performance | 430 MB log, blocking writes, device log noise | Medium | Small |
| 12 | Performance | Unbounded per-connection log memory | Medium | Trivial |
| 13 | Performance | 4.1 MB single JS bundle | Medium | Medium |
| 14 | Waste | Old web app still started | Low | Trivial |
| 15 | Waste | ~2.6 GB stale data | Low | Small |
| 16 | Waste | Unused start functions | Low | Trivial |
| 17 | Waste | Root clutter | Low | Small |
| 18 | Maintainability | 3,800-line `index.js` | Medium | Large |
| 19 | Security | Unauthenticated device server (LAN) | Low | Small |
