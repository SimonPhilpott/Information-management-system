# IMS - Information Management System

IMS is a personal knowledge and home-assistant system built around **Ims**, a Yorkshire-accented voice companion that lives on an **ESP32-S3-BOX-3** desk terminal. It combines:

- a **voice terminal** (custom firmware) that talks to Gemini Live through a local proxy,
- a **web app** for chatting with your PDF library (RAG over Google Drive + Gemini),
- a set of **`/ims` services** for the things Ims knows about and can do: memories, persona, music releases, code repository best practices (Personal & TurnTown), alarms/timers/reminders, birthdays, calendar, blood sugar (Nightscout), Strava activities, a T1D run planner with a comprehensive glucose rulebook, pre-run glucose readiness card, morning and day reports, news, background tasks, board games, dev ideas, Box-3 device health monitoring, voice latency telemetry, and Gemini spend budget breakdowns,
- the **Campaign Manager** (`/campaigns`) for card-game campaigns - a tab per game: **Lord of the Rings LCG** and **Arkham Horror LCG** - with decks, maps, rule checks, and an illustrated, narrated chronicle,
- a **System Architecture** page (`/ims/architecture`) with a live test box that lights up every part of the system a prompt uses, plus a dedicated **Voice Latency & Tools Telemetry** dashboard with turn-stage waterfalls and 1800ms target budget analysis,
- a **Direct Ring Doorbell API Service** (`/ims/doorbell`) with persistent 2FA refresh token storage, real-time SIP/WebSocket event streaming (dings and motions), ESP32-S3-BOX-3 chime alerts, and Yorkshire vocal announcements.

Everything runs on your own machine. Cloud services used: Google (Drive, Calendar, Gemini) plus data sources such as GitHub (Personal & TurnTown repos), Nightscout, Strava, Komoot, Ring, BoardGameGeek, MusicBrainz, Open-Meteo, Open Food Facts, RingsDB, Hall of Beorn, ArkhamDB and the news feeds.

> **Status:** the voice terminal, web app, and all active `/ims` services are operational.
> **Commit History:** Inspect detailed commit activity and build changelogs at [GitHub Commits](https://github.com/SimonPhilpott/Information-management-system/commits/main).

---

## Contents

1. [Architecture](#architecture)
2. [Repository layout](#repository-layout)
3. [Ports](#ports)
4. [Prerequisites](#prerequisites)
5. [Setup and running](#setup-and-running)
6. [The `/ims` services](#the-ims-services)
7. [The voice terminal (ESP32-S3-BOX-3)](#the-voice-terminal-esp32-s3-box-3)
8. [Voice, persona and conversation behaviour](#voice-persona-and-conversation-behaviour)
9. [Data, privacy and what is stored where](#data-privacy-and-what-is-stored-where)
10. [Configuration reference](#configuration-reference)
11. [Troubleshooting](#troubleshooting)
12. [Commit History](#commit-history)

---

## Architecture

```
                    +---------------------------+
   voice / touch    |   ESP32-S3-BOX-3 (Ims)    |   footer icons, face, clock
  ----------------> |   firmware/esp32-s3-box-3 |
                    +-------------+-------------+
                                  | raw TCP :3002 (framed audio + JSON)
                                  | plain HTTP :3003 (device endpoints)
                                  v
 +-------------------------------------------------------------------+
 |  Backend  pdf-knowledge-base/server  (Node + Express, :3001)      |
 |   - Gemini Live proxy (persona, tools, session resumption)        |
 |   - RAG search over your PDF library (HNSW + Gemini embeddings)   |
 |   - /api/* for every /ims service (SQLite + JSON files)           |
 |   - schedulers: alarms/timers, nightly music scan, morning report |
 |   - python helpers: music scanner                                 |
 +---------+---------------------------+-----------------+-----------+
           |                           |                 |
           v                           v                 v
   Gemini Live / TTS /         Google Drive         MusicBrainz, BGG,
   generateContent API         (PDF library)        Open-Meteo, Nightscout,
           ^                                        GitHub, Ring
           |
 +---------+-------------------+
 |  Web app (Vite + React :6001) |  main dashboard and every /ims page
 +-------------------------------+
```

The web app talks to the backend through the Vite dev proxy. The device never touches the web app: it speaks a small framed TCP protocol to the backend and posts a few plain HTTP endpoints (personality) that intentionally bypass the web login.

## Repository layout

| Path | What it is |
|---|---|
| `src/` | The main React app: dashboard, chat, and all `/ims/*` pages (`src/components/Dashboard/`) |
| `pdf-knowledge-base/server/` | The backend: `index.js` (Gemini Live proxy + device servers), `routes/`, `services/`, `db/` |
| `pdf-knowledge-base/server/python/` | Local Python helpers: `ims_scan_service.py` (music scanner engine) |
| `pdf-knowledge-base/client/` | The original standalone PDF Knowledge Base UI (`:5173`) |
| `firmware/esp32-s3-box-3/` | ESP32-S3-BOX-3 firmware (PlatformIO, Arduino): `src/main.cpp`, `include/config.h` |
| `ims_persona_rules.md` | Ims's fixed dialect, identity and tool-usage rules (editable at `/ims/persona`) |
| `imspersonality.md` | Design notes for the personality-slider system |
| `homeassistant/` | ESPHome / Home Assistant experiments for the same hardware |
| `start-all.bat` | Windows launcher for everything (app, backend, tunnel) |
| `ports.json` | Port numbers shared by the launcher and Vite config |
| `TASK_LIST.md`, `test_plan.md`, `handover.md` | Working notes and test plans |

## Ports

| Port | Service |
|---|---|
| `6001` | Main IMS web app (Vite) - the one you open |
| `3001` | Backend HTTP API and the browser Gemini Live WebSocket |
| `3002` | Raw TCP endpoint the ESP32 connects to (Gemini Live proxy) |
| `3003` | Plain HTTP for the device: `/device/personality` |
| `5173` | Original PDF Knowledge Base client (optional) |

## Prerequisites

- **Windows** (the launcher and several paths assume it), **Node.js 22+**, **Python 3.12**.
- A **Google Cloud project** with the Drive and Generative Language APIs enabled, an OAuth client, and a **Gemini API key**.
- For the voice terminal: an **ESP32-S3-BOX-3 / BOX-3B**, **PlatformIO** (VS Code extension or CLI), and a 2.4 GHz Wi-Fi network.
- Optional: an **ngrok** account (to reach the app remotely), a BoardGameGeek API token, a Nightscout instance (blood glucose), the `D:\Music scanner` setup below.

Python packages used by the backend helpers:

```
pip install musicbrainzngs
```

## Setup and running

### 1. Backend configuration

```
cd pdf-knowledge-base
copy .env.example .env
```

Fill in `.env` (see the [configuration reference](#configuration-reference)) - at minimum `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY`, `SESSION_SECRET`, `ADMIN_EMAIL`.

### 2. Install dependencies

```
npm install                      # root (web app)
cd pdf-knowledge-base
npm install                      # backend
```

### 3. Run everything

The easiest way on Windows is the launcher, which installs missing dependencies, frees the ports, and opens each service in its own terminal tab:

```
start-all.bat
```

Or run the pieces by hand:

```
npm run dev                          # web app on :6001
cd pdf-knowledge-base
npm run dev:server                   # backend on :3001 (hot-reloads on file changes)
```

Open `http://localhost:6001`. The IMS hub is at `/ims`.

### 4. Music scanner engine (optional)

The nightly music scan runs a Python engine that lives **outside** this repository by default, at `D:\Music scanner`. A copy of the engine is in `pdf-knowledge-base/server/python/ims_scan_service.py`:

1. Copy it to `D:\Music scanner\ims_scan_service.py`.
2. Adjust the constants at the top of `pdf-knowledge-base/server/services/musicScanService.js` if your paths differ (`SCANNER_DIR`, `PYTHON_EXE`).
3. Set the library location on the `/ims/musicscan` page (default `\\Sideburnt\NorthField\MUZAK`, laid out as `Genre\Artist\Album`).

## The `/ims` services

The **IMS Hub** (`/ims`) links to every service below, listed alphabetically under each heading. Each page has a back button to the hub, works in light and dark themes, and is a self-contained scrollable page.

**Ctrl+K** opens the command palette: jump to any page, or type two letters or more to **search everything at once** - memories, background tasks, lists, campaign chronicles, dev ideas, recordings, the calendar and the PDF library. Results are grouped and open the item itself: the page scrolls to it and rings it, a chronicle opens the book at that chapter, and a library hit opens the PDF at the page.

| Page | What it does |
|---|---|
| `/ims/weather` | **Weather** (Core functions). Open-Meteo forecasts (Met Office UKV over the UK) for **home** (Leeds unless changed) and **saved places**, up to 16 days ahead: a today card, a 16-day strip and 48 hours hour by hour (rain chance, mm, wind arrows in mph). Everything is graded from the hours still to come, so rain that has already fallen isn't reported as coming. **What Ims will say** shows a Yorkshire-style preview built from the **Weather phrases** - the words Ims may and may not use for each strength of rain, heat, cold, wind, fog, frost, snow, thunder, strong sun and muggy days - so drizzle is never "chucking it down". Each day is compared with the last 10 years at that place, and weather that is unusual for the time of year gets a fresh remark from Ims |
| `/ims/memories` | View, add, edit and delete everything Ims has been told to remember (SQLite-backed). Deleting archives: the Archive panel keeps deleted memories with when they were added and deleted, and can restore them |
| `/ims/persona` | Edit `ims_persona_rules.md` as **sections**: editable cards you can reorder, duplicate, remove and add from templates (pronunciation, relationship, grammar, phrases to avoid, tool rules), or switch to raw markdown. Every save keeps the previous version in a History list. Live, no restart |
| `/ims/facedesigner` | **Face Designer.** Every face Ims can pull, as two 12x8 dot grids (mouth closed / open). Click dots to light them (click again to switch off), open the colour picker or type a hex colour, name the face, and write *when it should be used* - that text is what Gemini is told. Every face is editable. **Standby** is Ims's idle face (never chosen by Ims; listening, thinking and connecting keep their state colours). Any face can have **animated eyes**: a looping timeline of eye cells (as many as you like), each painted on the dot grid with its own duration. Standby starts with four - eyes open, blink, look left, look right. Hovering a face in the list plays its eyes and mouth. The faded breathing background dots always take a dim version of the face's colour. Preview on IMS |
| `/ims/wifi` | **Wi-Fi networks.** Add networks and passwords. Passwords are encrypted on disk (AES-256-GCM, key in `server/data/.wifi_key` or `WIFI_ENCRYPTION_KEY`) and shown as dots until you press the eye, which fetches that one password for 10 seconds and is logged. Needs this browser signed in with your Google account |
| `/ims/recordings` | **Call and meeting recordings.** Say "Ims, record this call", answer who it is with, and Ims goes completely silent (no speech, alarms, sounds or reactions; taps ignored) while it transcribes. Say "Ims stop" or "Ims stop recording" to end it. Open, copy and delete transcripts here, and ask for an AI summary with actions, follow-up questions, key points, decisions and risks. Call audio is never saved, and transcripts are kept out of Ims's memory and logs |
| `/ims/calendar` | **Google Calendar.** Upcoming events, add appointments (or ask Ims), and rules: when an event title contains some words Ims shows an icon (pod below the glucose reading, sensor above it - white on the day, orange the day before, prescription lower right) or sets a reminder. Bin-day style events are filtered out before anything sees them. Reminders and alarms on their pages have an *Add to Google Calendar* button. Needs Calendar access: sign in again once to grant it, and enable the Google Calendar API in your Google Cloud project |
| `/ims/activities` | **Strava activities.** Logs your Strava activities locally (SQLite) for analysis: period totals with change vs the previous period, weekly load chart (distance / time / climbing / count), sport breakdown, records, a filterable activity table and an AI training review. Connect once with Strava OAuth (asks for `activity:read_all`; set the Strava app's *Authorization Callback Domain* to `localhost`). Client secret and tokens are stored encrypted, never in a file. Checks for new activities every 30 minutes, and Ims can answer training questions (`getTrainingSummary`). Speed and hill sessions can be tagged so their pace stays out of averages. **Training load**: 7-day fatigue, 42-day fitness, form, acute:chronic ratio and week-on-week running ramp (warns above 10%), with recovery time and percentage (also on the Run Planner and Blood sugar pages) |
| `/ims/runplanner` | **Run planner**, in five tabs. **1. Run Planner:** pick a route (Route Finder, saved routes, a Komoot share link, your Komoot account - with *Switch account* - or a GPX file) or just a distance; the **Run plan** sits at the foot of the page at all times and recalculates by itself as anything changes - time and pace (live target-time slider), carbs and when to take them (+/- steppers), pre-run carbs and the rulebook's exercise target, hydration and sips from the live route weather, your loop's ISF and carb ratio, insulin and carbs on board, and **recovery** carry-over from recent training (raised insulin sensitivity for 48 hours after a session, more glucose uptake when form is low). One interactive chart shows glucose (with and without carbs), hydration, insulin on board and the course coloured by steepness, with effort varying minute by minute so climbs pull glucose down; hover for the numbers at any minute. Never gives insulin doses - insulin changes are pointed at ISPAD 2022 / Riddell 2017 for you and your team. **2. Route Finder:** filter every saved route (your Komoot saved routes are imported, and new ones are pulled in at 10pm on any day with a run in your calendar) by shape (loop / there and back), a distance range and a run-time range (your last time on the route from Strava, or an estimate), each with a map and a one-line description from Komoot's directions; *Plan this run* hands it to tab 1. **Duplicate routes** groups copies that are the same line run the same way round (reverses listed separately). **3. Run Flythrough & Retrospective:** replay the plan or a completed run; the retrospective comes only from a real run's glucose trace, with follow-ups linked to Blood sugar (insulin-sensitivity window and overnight risk), carbs (refuelling) and the next plan. **4. T1D Rulebook & Intelligence** (5 clinical pillars, book indexing, AI literature scanner) and **5. Targets & Assumptions** (start target, floor, weight, exercise sensitivity multiplier up to 10x). Also the **Pre-Run Glucose Readiness Card** (GO / WAIT / EAT FIRST) |
| `/ims/dayreport` | **Day Report.** Configures schedule, trigger criteria, and content preferences for the automated daily briefing delivered by Ims, tracking weather, calendar, fitness, glucose trends, pre-run readiness, news, and project task summaries. Each section has sub-filters - for weather: tomorrow, unusual-for-the-time-of-year, and **a second saved place** to read out after home |
| `/ims/code-repo` | **Code Repository Best Practices.** Curated architectural and implementation standards across Personal and TurnTown GitHub repositories. Categorised by functional domains (Authentication & Security, Data & Database, API & Integration, Architecture & Orchestration, UI & Frontend, Testing & Quality, Cloud & Deployment) with search, function/repo/technology filters, actionable code snippets, and direct links. **Dependencies**: a weekly `npm audit` and `npm outdated` across IMS (web app, server, library client) and every scanned repo - critical and high advisories with fixes, packages a major version or more behind, and one dev idea per critical advisory listing every project it affects |
| `/ims/musicscan` | **Music scanner.** Nightly (default 01:00 London time) scan of your music library against MusicBrainz. Shows scan progress, and per artist every album/EP with an exact release date, coloured **green = owned**, **red = not owned**, **grey = owned but not on MusicBrainz**. Views for Day / Week / Month / 6 Months / Year plus an All Artists list; collapsible artists with owned / not-owned counts; a "Released today" list (this count drives the vinyl icon on the device); per-artist search-name and pseudonym editing with an instant rescan |
| `/ims/alarms`, `/ims/timers`, `/ims/reminders` | Create, edit and cancel entries; changes reach the device within ~15 s. Ims chimes/speaks them when they fire. An **Archive** tab keeps everything that has finished, with when it was set, when it went off, and whether it was acknowledged, went unanswered or was cancelled, plus a full event timeline. Ask Ims "did my reminder go off?" or "what alarms did I set yesterday?" |
| `/ims/birthday` | Names, day/month and optional birth year. A cake icon appears on the device within 7 days (yellow), or green on the day (green wins if both apply). Deleting archives; the Archive tab lists deleted birthdays (restorable) and those that passed in the last 30 days |
| `/ims/boardgames` | Your BoardGameGeek collection, with expandable expansions (owned vs not owned) and a **want-to-sell tick** per game/expansion. Needs a BGG API token (see below) |
| `/ims/glucose` | **Blood sugar.** Nightscout readings every minute, time in range, overnight summary and carb logging (carbs are posted to Nightscout as a Meal Bolus and picked up by AndroidAPS - insulin is never sent). Old Nightscout data can be auto-cleared after 3 months. **Clinic AGP Report**: a 14- or 90-day Ambulatory Glucose Profile PDF for your diabetes team (time in ranges against the consensus targets, GMI, CV, coverage, the 24-hour percentile profile, daily traces with pod and sensor change markers, hypo events, and the first 24 hours after each change), beside *Download PDF Report*. Also shows training load and recovery |
| `/ims/news` | **News sources.** RSS feeds with tags and an importance weighting (1-5) used by the morning report and `getNews`; UK tour news for bands in your music library |
| `/ims/tasks` | **Background tasks.** Research Ims runs on its own (with Google Search) and reports on later, or in the next day report |
| `/ims/devideas` | **Dev ideas.** Ideas for improving IMS, saved by Ims (`saveDevIdea`) or automatically when a tool fails, for pickup in Claude Code |
| `/ims/phrases` | **Wake and stop phrases.** Record how you say them; your recorded spellings feed the wake gate |
| `/ims/doorbell` | **Ring Doorbell.** Direct Ring API integration (`ring-client-api`) with persistent 2FA refresh token persistence, real-time SIP/WebSocket streaming for dings and motion, live snapshot previews, Box-3 hardware chime pushes, and Gemini Live Yorkshire spoken announcements |
| `/ims/device-health` | **Device Health & Observability.** Minute-by-minute ESP32-S3-BOX-3 hardware telemetry (Wi-Fi RSSI, free heap, uptime, reconnect count, audio buffer underruns, last error) with live SVG sparklines, historical log, and automatic Dev Ideas logging on reconnect/reboot spikes |
| `/ims/spend` | **Gemini Spend Budget & Breakdown.** Token usage and cost breakdown per service per day/month, soft monthly spend budget warnings (≥ 80% and ≥ 95%), and high-cost prompt candidate identification for model optimization or caching |
| `/ims/architecture` | **System Architecture & Voice Latency.** Visual architecture map with real-time prompt telemetry, plus dedicated **Voice Latency & Tools Telemetry** tracking turn stages (`wake` → `Gemini connect` → `first audio` → `finished`), tool execution durations, and standby dropout diagnosis with an 1800ms target budget |
| `/campaigns` | **Campaign Manager** - see below |

### Campaign Manager (`/campaigns`)

A tab per game, each with its **campaigns first and decks second**, and entirely separate data. Invited guests (e.g. Daniel) sign in with a basic Google sign-in and can use the whole Campaign Manager and nothing else.

**Lord of the Rings LCG** (`/campaigns/lotr`)
- **Decks** from RingsDB (import by link, including shared private decks), card images on hover, owned-pack tracking, test hands, AI insights (synergies, swaps, focus areas, scenario and partner-deck tuning using Hall of Beorn's encounter cards) and a Q&A per deck; CSV/JSON export.
- **Campaigns**: players and decks, fallen heroes, scenarios played (date and time, result, score, notable moments), boons and burdens (with suggestions from the scenario's product after a win), threat penalty, notes, rule checks, a banner image, and deleting only when every player agrees.
- **Map of Middle-earth** with numbered pins, the gold road of wins, lore pop-ups, and an overall journey across every campaign.
- **Chronicle**: a quill-and-ink book (Elven Common Speak titles, page turning, a fixed page size) with a chapter per scenario written in Tolkien's style, wholly in-world, illustrated with ink engravings, a Roll of the Fallen with epitaphs, an index, a PDF download, editing (text, titles, pictures from an editable description, locks, rewrite), and a **narrator** (deep, aged voice) whose readings are recorded as chapters are written.
- **Rulebooks**: the official FFG rulebooks downloaded into the library and indexed; rule checks across every rulebook or per campaign/scenario, answered with quoted citations that open the rulebook at the page.

**Arkham Horror LCG** (`/campaigns/ahlcg`)
- **Decks** from ArkhamDB (investigator, class colours, health and sanity, card images), AI insights with Arkham focus areas and XP upgrades.
- **Campaigns**: investigators with physical/mental trauma, XP earned/spent and fate (killed / insane); the **chaos bag** read from the campaign's own guide at your difficulty (add/remove tokens, reset, draw a token); the **campaign log** under the guide's own sections, with crossing out; scenarios with resolutions and XP; rule checks against the Arkham rulebooks.
- **Map of Arkham** with pins at the landmarks and a "Beyond Arkham" strip for Dunwich, Innsmouth and the rest; overall progress across every campaign.
- **Chronicle as an investigator's case file**: typewritten notes on lined paper, handwritten margin notes, 1920s photographs paperclipped in, pencil sketches, noir Lovecraftian prose, "The Lost", a case-file PDF, and a weary Miskatonic archivist narrator.

Ims knows every campaign (`getCampaigns`) and mentions a game played that day or the night before in the day report.

### BoardGameGeek token

BGG's XML API returns HTTP 401 without an application token (registration became mandatory in Oct 2025). Register an application on your BGG account at <https://boardgamegeek.com/applications>, create a token, and paste it into the BoardGameGeek panel on `/ims/boardgames` (it is stored on the server only and never sent back to the browser). "Want to sell" is IMS's own flag; it does not change BGG.

### Morning report

The first time you talk to Ims each day (London date), it offers your morning report along with its greeting (a day report after noon; ask for it any time). It is always given **in full**, with no length limit: weather at home for the rest of today and tomorrow (graded honestly, with anything unusual for the time of year, and optionally a second saved place), alarms/timers/reminders today and the week ahead, calendar (today, and tomorrow from 4pm), birthdays in the next 14 days, new music out today, a card game played today or last night, glucose now and overnight, training and the last run, running goals, UK tour news, news from your weighted sources, finished background tasks, and a Nightscout storage warning when it is over 90% full. News stories are only marked as told once the report is actually given.

### Ims tools during a conversation

Ims has 35 tools: library search, weather (home, saved or named places, now or any day up to 16 days ahead - "in a fortnight" - described from graded facts and the weather phrases), calendar (read and add), blood glucose and carbs (Nightscout), food carb look-ups, training (Strava), timers/alarms/reminders and their history, lists, memories, birthdays, new music, news, the day report, background tasks, dev ideas, board games, card-game campaigns, jokes, and recording. Every conversation also starts with a **snapshot of everything saved** - next birthday and reminder, every birthday, alarms and reminders, lists, the next 14 days of calendar, tasks, dev ideas, carbs today, music want list and upcoming releases, memories, board games, campaigns and decks - and Ims treats that snapshot as authoritative when a tool looks less far ahead.

**Jokes.** Ask for a joke and Ims calls `tellJoke`, which picks from about 80,000 jokes from the [r/Jokes dataset](https://github.com/orionw/rJokesData) (Reddit terms apply; kept in the git-ignored `server/data/jokes`). The Humor slider on IMS Personality is a style axis (Cheerful - Dry - Dark), so the jokes scale with it: clean and wholesome at the low end, short dry one-liners in the middle, dark and twisted towards the top, always preferring better-scored jokes and not repeating one until they are used up. **Core rule: never a racist or sexist joke.** Anything about race, nationality, religion, gender or wives/girlfriends, plus hate, sexual, self-harm and real-tragedy material, is filtered out at import and never stored. Set it up with `node scripts/importJokes.js` (about 90 seconds; downloads the data if it is missing).

## The voice terminal (ESP32-S3-BOX-3)

Firmware lives in `firmware/esp32-s3-box-3/` (PlatformIO, Arduino-ESP32 3.3.x via the pioarduino platform, LovyanGFX UI). See that folder's own `README.md` for pinouts and audio internals.

### First-time setup

1. Copy `include/secrets.h.example` to `include/secrets.h` and set `WIFI_SSID` / `WIFI_PASSWORD` (gitignored).
2. Set `IMS_PRIMARY_HOST` in `include/config.h` to your PC's LAN IP (the backend host).
3. Build and flash:

```
cd firmware/esp32-s3-box-3
platformio run                       # build
platformio run --target upload       # flash over USB
```

`build-and-flash.bat` and `flash-binary.bat` do the same on Windows; `bin/` holds pre-built images.

> **Windows tip:** set `PYTHONIOENCODING=utf-8` before flashing. Without it, esptool's progress bar can crash on the default `cp1252` console mid-write and leave the device unbootable ("invalid header: 0xffffffff"); reflash to recover.

### What the device shows

- **Header:** *(I)nformation (M)anagement (S)ystem* title, gear icon (settings: personality sliders, voice, preferences), and **VOICE / WAKE / WIFI / USB** status dots (USB green = a PC is on the USB link).
- **Face:** an expressive 12x8 dot-matrix face that breathes when idle and reacts to what Ims says (emotions set by Gemini), with the status text below it.
- **Icon stack (left of the face):** alarms, timers, reminders (orange, with counts), birthdays (yellow within a week, green on the day), and new music released today (record icon, with count).
- **Right:** live blood-glucose reading with trend arrows (if Nightscout is configured).
- **Footer:** date/time (Europe/London, DST-aware) and rotating active notification ticker.

### Wake phrases

Ims speaks **only inside an active conversation**. A conversation starts when you say **"Hey IMS"**, **"Hi IMS"** or **"Eh up IMS"** (or touch the screen). It ends when you say a goodbye or stop phrase ("thanks IMS bye", "bye IMS", "goodbye IMS", "stop IMS"), or **automatically after about 15 seconds with no follow-up**. When it ends, the face and status return to **STANDBY** and Ims produces no speech or other output until the next wake phrase. As a safeguard the device also drops any audio that arrives while it is idle, so a stray Gemini reply can never make Ims speak over a conversation you're having with someone else.

## Voice, persona and conversation behaviour

Ims's behaviour comes from three layers that apply **everywhere Ims speaks** (device and browser voice chat):

1. **Voice** - chosen on the device's Personality screen and saved to the backend. It is re-applied and logged on every Gemini (re)connection, and read-aloud in the web app uses the same voice via Gemini TTS. There is **no fallback voice**: if it can't be produced, nothing is spoken.
2. **Personality sliders** - humour, delivery, temperament, social, formality (0-100 each), which set *tone*.
3. **`ims_persona_rules.md`** - fixed identity: Yorkshire dialect, pronunciation, grammar, relationship, tool mechanics. Editable live at `/ims/persona`.

Long conversations survive Gemini cycling its upstream session (it does after ~30-40 s of quiet) through **session resumption**: the backend keeps the resumption handle and resumes with full context instead of starting cold and re-greeting.

## Data, privacy and what is stored where

| Data | Location | Notes |
|---|---|---|
| Memories, reminders/alarms/timers, birthdays, people, board-game flags | SQLite in `pdf-knowledge-base/server/data/` | git-ignored |
| Board-game collection cache, BGG token | `server/data/boardgames_*.json` | token never returned to the browser |
| Music scan state | `D:\Music scanner\ims_scan_*.json` | config, artist overrides, status, results |
| Audio captures / debug logs | `pdf-knowledge-base/server/audio_captures/` | toggle "capture logging" on the device's Preferences screen |

**Access control - read this before exposing the app.** `/api/*` is protected by a single admin check that passes once the server itself is authorised against your Google account (and `ADMIN_EMAIL` matches); it is not a per-visitor login, and `/api/memories` is deliberately not gated. The device-only endpoints on `:3003` are unauthenticated plain HTTP for the LAN. So: keep the backend on your LAN, and if you tunnel the web app with ngrok, treat the tunnel URL as a secret.

## Configuration reference

**`pdf-knowledge-base/.env`**

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth client for Google Drive access |
| `GEMINI_API_KEY` | Gemini API (chat, embeddings, Live, TTS, vision) |
| `SESSION_SECRET` | Session signing secret (any long random string) |
| `ADMIN_EMAIL` | The one account allowed to use the app |
| `PORT` | Backend port (default 3001) |
| `CLIENT_URL` | CORS origin for the original client |
| `NGROK_AUTHTOKEN` / `NGROK_DOMAIN` | Optional tunnel |
| `BGG_API_TOKEN` | Optional: BoardGameGeek token (or paste it on the page) |

**Firmware:** `firmware/esp32-s3-box-3/include/secrets.h` (Wi-Fi) and `include/config.h` (backend host, pins).

**Runtime settings (edited in the UI, not by hand):** personality sliders and voice (device screen), persona rules (`/ims/persona`), music-scan schedule and library path (`/ims/musicscan`), BGG username/token (`/ims/boardgames`).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Flashing hangs or crashes with `UnicodeEncodeError` | Set `PYTHONIOENCODING=utf-8`; if the device now boot-loops with `invalid header: 0xffffffff`, just reflash |
| `COM3` missing / USB dot red | Check USB-C cable connection to PC; if needed hold **BOOT**, tap **RESET**, release **BOOT** |
| Ims greets again mid-conversation | Gemini cycled its session and resumption wasn't available; check the backend log for `Resuming previous Gemini session` |
| A different voice is heard | Check the backend log line `Gemini setup voice = <name>` on each connection; the saved voice is pinned on every reconnect |
| `/ims/boardgames` says a token is needed | BGG requires an application token - see [BoardGameGeek token](#boardgamegeek-token) |
| Music scan can't reach the library | The share isn't reachable from the backend host; set the correct path on `/ims/musicscan` |
| Clock shows the wrong hour | Time syncs via NTP with a Europe/London POSIX rule; the boot log prints raw UTC and the adjusted time - compare them |
| Web page won't scroll / missing changes | Hard-refresh; the backend hot-reloads but the Vite app caches aggressively behind a tunnel |

## Commit History

All project milestones, feature additions, and bug fixes are tracked in source control. You can view the live commit stream and changelog on GitHub at:
[https://github.com/SimonPhilpott/Information-management-system/commits/main](https://github.com/SimonPhilpott/Information-management-system/commits/main)


