# IMS - Information Management System

IMS is a personal knowledge and home-assistant system built around **Ims**, a Yorkshire-accented voice companion that lives on an **ESP32-S3-BOX-3** desk terminal. It combines:

- a **voice terminal** (custom firmware) that talks to Gemini Live through a local proxy,
- a **web app** for chatting with your PDF library (RAG over Google Drive + Gemini),
- a set of **`/ims` services** for the things Ims knows about and can do: memories, persona, music releases, alarms/timers/reminders, birthdays, board games, and a camera ("Look" and "Faces").

Everything runs on your own machine. The only cloud services used are Google (Drive, Gemini) and, optionally, BoardGameGeek, MusicBrainz and Open-Meteo for data lookups. Face recognition is fully local.

> **Status:** the voice terminal, web app, and all `/ims` services are working. The dock **webcam driver is experimental** (see [Camera](#camera-status-and-hardware-notes)).

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
9. [Camera: status and hardware notes](#camera-status-and-hardware-notes)
10. [Data, privacy and what is stored where](#data-privacy-and-what-is-stored-where)
11. [Configuration reference](#configuration-reference)
12. [Troubleshooting](#troubleshooting)

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
 |   - python helpers: face recognition, music scanner               |
 +---------+---------------------------+-----------------+-----------+
           |                           |                 |
           v                           v                 v
   Gemini Live / TTS /         Google Drive         MusicBrainz, BGG,
   generateContent API         (PDF library)        Open-Meteo, Nightscout
           ^
           |
 +---------+-------------------+
 |  Web app (Vite + React :6001) |  main dashboard and every /ims page
 +-------------------------------+
```

The web app talks to the backend through the Vite dev proxy. The device never touches the web app: it speaks a small framed TCP protocol to the backend and posts a few plain HTTP endpoints (personality, camera) that intentionally bypass the web login.

## Repository layout

| Path | What it is |
|---|---|
| `src/` | The main React app: dashboard, chat, and all `/ims/*` pages (`src/components/Dashboard/`) |
| `pdf-knowledge-base/server/` | The backend: `index.js` (Gemini Live proxy + device servers), `routes/`, `services/`, `db/` |
| `pdf-knowledge-base/server/python/` | Local Python helpers: `face_tool.py` (face detection/recognition), `ims_scan_service.py` (music scanner engine) |
| `pdf-knowledge-base/client/` | The original standalone PDF Knowledge Base UI (`:5173`) |
| `firmware/esp32-s3-box-3/` | ESP32-S3-BOX-3 firmware (PlatformIO, Arduino): `src/main.cpp`, `src/camera.cpp`, `include/config.h` |
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
| `3003` | Plain HTTP for the device: `/device/personality`, `/device/camera/*` |
| `5173` | Original PDF Knowledge Base client (optional) |

## Prerequisites

- **Windows** (the launcher and several paths assume it), **Node.js 22+**, **Python 3.12**.
- A **Google Cloud project** with the Drive and Generative Language APIs enabled, an OAuth client, and a **Gemini API key**.
- For the voice terminal: an **ESP32-S3-BOX-3 / BOX-3B**, **PlatformIO** (VS Code extension or CLI), and a 2.4 GHz Wi-Fi network.
- Optional: an **ngrok** account (to reach the app remotely), a BoardGameGeek API token, a Nightscout instance (blood glucose), the `D:\Music scanner` setup below.

Python packages used by the backend helpers:

```
pip install musicbrainzngs opencv-python-headless numpy
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

### 3. Face-recognition models (one-off)

Face recognition uses OpenCV's YuNet (detection) and SFace (recognition) models. They are ~39 MB, so they are **not committed**. Download them into `pdf-knowledge-base/server/python/models/`:

```
curl -L -o pdf-knowledge-base/server/python/models/yunet.onnx  https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
curl -L -o pdf-knowledge-base/server/python/models/sface.onnx  https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx
```

### 4. Run everything

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

### 5. Music scanner engine (optional)

The nightly music scan runs a Python engine that lives **outside** this repository by default, at `D:\Music scanner`. A copy of the engine is in `pdf-knowledge-base/server/python/ims_scan_service.py`:

1. Copy it to `D:\Music scanner\ims_scan_service.py`.
2. Adjust the constants at the top of `pdf-knowledge-base/server/services/musicScanService.js` if your paths differ (`SCANNER_DIR`, `PYTHON_EXE`).
3. Set the library location on the `/ims/musicscan` page (default `\\Sideburnt\NorthField\MUZAK`, laid out as `Genre\Artist\Album`).

## The `/ims` services

The **IMS Hub** (`/ims`) links to every service below. Each page has a back button to the hub, works in light and dark themes, and is a self-contained scrollable page.

| Page | What it does |
|---|---|
| `/ims/memories` | View, add, edit and delete everything Ims has been told to remember (SQLite-backed). Deleting archives: the Archive panel keeps deleted memories with when they were added and deleted, and can restore them |
| `/ims/persona` | Edit `ims_persona_rules.md` as **sections**: editable cards you can reorder, duplicate, remove and add from templates (pronunciation, relationship, grammar, phrases to avoid, tool rules), or switch to raw markdown. Every save keeps the previous version in a History list. Live, no restart |
| `/ims/facedesigner` | **Face Designer.** Every face Ims can pull, as two 12x8 dot grids (mouth closed / open). Click dots to light them (click again to switch off), open the colour picker or type a hex colour, name the face, and write *when it should be used* - that text is what Gemini is told. Every face is editable. **Standby** is Ims's idle face (never chosen by Ims; listening, thinking and connecting keep their state colours). Any face can have **animated eyes**: a looping timeline of eye cells (as many as you like), each painted on the dot grid with its own duration. Standby starts with four - eyes open, blink, look left, look right. Hovering a face in the list plays its eyes and mouth. The faded breathing background dots always take a dim version of the face's colour. Preview on IMS |
| `/ims/wifi` | **Wi-Fi networks.** Add networks and passwords. Passwords are encrypted on disk (AES-256-GCM, key in `server/data/.wifi_key` or `WIFI_ENCRYPTION_KEY`) and shown as dots until you press the eye, which fetches that one password for 10 seconds and is logged. Needs this browser signed in with your Google account |
| `/ims/recordings` | **Call and meeting recordings.** Say "Ims, record this call", answer who it is with, and Ims goes completely silent (no speech, alarms, sounds or reactions; taps ignored) while it transcribes. Say "Ims stop" or "Ims stop recording" to end it. Open, copy and delete transcripts here, and ask for an AI summary with actions, follow-up questions, key points, decisions and risks. Call audio is never saved, and transcripts are kept out of Ims's memory and logs |
| `/ims/calendar` | **Google Calendar.** Upcoming events, add appointments (or ask Ims), and rules: when an event title contains some words Ims shows an icon (pod below the glucose reading, sensor above it - white on the day, orange the day before, prescription lower right) or sets a reminder. Bin-day style events are filtered out before anything sees them. Reminders and alarms on their pages have an *Add to Google Calendar* button. Needs Calendar access: sign in again once to grant it, and enable the Google Calendar API in your Google Cloud project |
| `/ims/activities` | **Strava activities.** Logs your Strava activities locally (SQLite) for analysis: period totals with change vs the previous period, weekly load chart (distance / time / climbing / count), sport breakdown, records, a filterable activity table and an AI training review. Connect once with Strava OAuth (asks for `activity:read_all`; set the Strava app's *Authorization Callback Domain* to `localhost`). Client secret and tokens are stored encrypted, never in a file. Checks for new activities every 30 minutes, and Ims can answer training questions (`getTrainingSummary`) |
| `/ims/runplanner` | **Run planner.** Pick a Komoot route (GPX file, share link, or your saved routes via your Komoot account, stored encrypted) or just a distance, and get carbs and timing for the run that keep glucose above your floor (default: start near 9, never below 5 mmol/L). Uses the route's climbing (grade-adjusted pace and effort), your current glucose, insulin on board and carbs on board from Nightscout, your loop's real ISF and carb ratio, and your own matched runs once there are four. Shows an estimated glucose curve with carb stops over the elevation profile, what-if tables for other starting glucose and IOB, and points at published insulin guidance (ISPAD 2022, Riddell 2017) for you to discuss with your team - it never gives insulin doses |
| `/ims/musicscan` | **Music scanner.** Nightly (default 01:00 London time) scan of your music library against MusicBrainz. Shows scan progress, and per artist every album/EP with an exact release date, coloured **green = owned**, **red = not owned**, **grey = owned but not on MusicBrainz**. Views for Day / Week / Month / 6 Months / Year plus an All Artists list; collapsible artists with owned / not-owned counts; a "Released today" list (this count drives the vinyl icon on the device); per-artist search-name and pseudonym editing with an instant rescan |
| `/ims/alarms`, `/ims/timers`, `/ims/reminders` | Create, edit and cancel entries; changes reach the device within ~15 s. Ims chimes/speaks them when they fire. An **Archive** tab keeps everything that has finished, with when it was set, when it went off, and whether it was acknowledged, went unanswered or was cancelled, plus a full event timeline. Ask Ims "did my reminder go off?" or "what alarms did I set yesterday?" |
| `/ims/birthday` | Names, day/month and optional birth year. A cake icon appears on the device within 7 days (yellow), or green on the day (green wins if both apply). Deleting archives; the Archive tab lists deleted birthdays (restorable) and those that passed in the last 30 days |
| `/ims/boardgames` | Your BoardGameGeek collection, with expandable expansions (owned vs not owned) and a **want-to-sell tick** per game/expansion. Needs a BGG API token (see below) |
| `/ims/look` | See what Ims sees: live view, snapshots, and questions about the live view or any saved photo (answered by Gemini, with recognised people named) |
| `/ims/faces` | Teach Ims who people are: capture a face, name it, add notes, add more samples. Recognition is **local** |

### BoardGameGeek token

BGG's XML API returns HTTP 401 without an application token (registration became mandatory in Oct 2025). Register an application on your BGG account at <https://boardgamegeek.com/applications>, create a token, and paste it into the BoardGameGeek panel on `/ims/boardgames` (it is stored on the server only and never sent back to the browser). "Want to sell" is IMS's own flag; it does not change BGG.

### Morning report

The first time you talk to Ims each day (London date), it offers your morning report along with its greeting: today's weather (with a heads-up if rain is likely), reminders/alarms due today, birthdays coming up, and new music out today. If the camera has a fresh view of someone enrolled on `/ims/faces`, Ims greets them by name; it never guesses at unknown faces.

### Ims tools during a conversation

Beyond searching your library, Ims can call: weather, blood glucose (Nightscout), timers/alarms/reminders, lists, memories, `getUpcomingBirthdays`, `getNewMusicReleases`, `getScheduleHistory` (past alarms/timers/reminders) and `lookAtCamera`. The birthday, music and camera tools return real data, and Ims is instructed to say plainly when there is none instead of guessing.

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

- **Header:** *(I)nformation (M)anagement (S)ystem* title, gear icon (settings: personality sliders, voice, preferences), and **WIFI / USB** status dots (USB green = a PC is on the USB link).
- **Face:** an expressive 12x8 dot-matrix face that breathes when idle and reacts to what Ims says (emotions set by Gemini), with the status text below it.
- **Icon stack (left of the face):** alarms, timers, reminders (orange, with counts), birthdays (yellow within a week, green on the day), new music released today (record icon, with count), and camera (yellow = attached and asleep, green = awake).
- **Right:** live blood-glucose reading with trend arrows (if Nightscout is configured).
- **Footer:** date/time (Europe/London, DST-aware) and current emotion.

### Wake phrases

Ims speaks **only inside an active conversation**. A conversation starts when you say **"Hey IMS"**, **"Hi IMS"** or **"Eh up IMS"** (or touch the screen). It ends when you say a goodbye or stop phrase ("thanks IMS bye", "bye IMS", "goodbye IMS", "stop IMS"), or **automatically after about 15 seconds with no follow-up**. When it ends, the face and status return to **STANDBY** and Ims produces no speech or other output until the next wake phrase. As a safeguard the device also drops any audio that arrives while it is idle, so a stray Gemini reply can never make Ims speak over a conversation you're having with someone else.

## Voice, persona and conversation behaviour

Ims's behaviour comes from three layers that apply **everywhere Ims speaks** (device and browser voice chat):

1. **Voice** - chosen on the device's Personality screen and saved to the backend. It is re-applied and logged on every Gemini (re)connection, and read-aloud in the web app uses the same voice via Gemini TTS. There is **no fallback voice**: if it can't be produced, nothing is spoken.
2. **Personality sliders** - humour, delivery, temperament, social, formality (0-100 each), which set *tone*.
3. **`ims_persona_rules.md`** - fixed identity: Yorkshire dialect, pronunciation, grammar, relationship, tool mechanics. Editable live at `/ims/persona`.

Long conversations survive Gemini cycling its upstream session (it does after ~30-40 s of quiet) through **session resumption**: the backend keeps the resumption handle and resumes with full context instead of starting cold and re-greeting.

## Camera: status and hardware notes

The dock webcam lets Ims see (`lookAtCamera`), recognise you for the morning greeting, and feeds `/ims/look` and `/ims/faces`. State machine (backend, implemented): the camera is **awake for ~10 minutes** after boot or any use (Look/Faces open, a question, a snapshot), then **asleep**; the device icon is green when awake, yellow when attached but asleep.

The frame source is pluggable: the device's camera, **this computer's webcam** (from the browser), or an **uploaded photo** - so Look and Faces are fully usable today regardless of the device driver.

**Device driver (`firmware/esp32-s3-box-3/src/camera.cpp`) is experimental.** What is known:

- The **BOX-3 dock's USB-A port** shares the ESP32-S3's single USB data pair and PHY with the USB port used for flashing/serial (COM3). They cannot both work at once. The firmware only starts USB-host mode if **no PC is on the USB link** at boot (so flashing/debugging keep working), and it releases the serial driver before starting host mode. **Do not connect the camera while flashing.** To use the camera, power the dock from its own USB-C (a charge-only cable/charger works best) with the camera in the USB-A port.
- The ESP32-S3 has **USB 1.1 full-speed only**, so expect MJPEG at up to ~640x480 @ 15 fps (320x240 @ 30), not 720p.
- The prebuilt framework caps the USB host descriptor buffer at 256 bytes, which is too small for a **Logitech C270** (>1 KB descriptor), so it does not enumerate. The `esp32s3box_cam` PlatformIO environment rebuilds the framework with a larger buffer (`CONFIG_USB_HOST_CONTROL_TRANSFER_MAX_SIZE=2048`); it is still being validated. A phone in tethering/MIDI mode enumerates fine, which confirms host mode itself works.
- With no serial port in camera mode, the box posts its camera diagnostics to the backend: read them at `GET /api/camera/device-log`.

## Data, privacy and what is stored where

| Data | Location | Notes |
|---|---|---|
| Memories, reminders/alarms/timers, birthdays, people, snapshots (metadata), board-game flags | SQLite in `pdf-knowledge-base/server/data/` | git-ignored |
| Face crops and snapshot photos | `pdf-knowledge-base/server/data/faces/`, `.../snapshots/` | git-ignored; local only |
| Face embeddings | SQLite (`face_samples`) | numbers derived locally by OpenCV; never sent to a cloud service |
| Snapshot questions | Photo + question go to **Gemini** (`generateContent`) to be answered | only when you ask a question; recognised names are supplied by the local engine |
| Board-game collection cache, BGG token | `server/data/boardgames_*.json` | token never returned to the browser |
| Music scan state | `D:\Music scanner\ims_scan_*.json` | config, artist overrides, status, results |
| Camera frames | RAM only | nothing written unless you take a snapshot |
| Audio captures / debug logs | `pdf-knowledge-base/server/audio_captures/` | toggle "capture logging" on the device's Preferences screen |

**Access control - read this before exposing the app.** `/api/*` is protected by a single admin check that passes once the server itself is authorised against your Google account (and `ADMIN_EMAIL` matches); it is not a per-visitor login, and `/api/memories` is deliberately not gated. The device-only endpoints on `:3003` are unauthenticated plain HTTP for the LAN. So: keep the backend on your LAN, and if you tunnel the web app with ngrok, treat the tunnel URL as a secret - anyone who can reach it can reach the API, including snapshots and face data. A proper per-user login is a sensible next hardening step.

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
| `COM3` missing / USB dot red | Box is in USB-host (camera) mode or has no PC link. Unplug the camera, reboot with the PC cable attached; if needed hold **BOOT**, tap **RESET**, release **BOOT** |
| Ims greets again mid-conversation | Gemini cycled its session and resumption wasn't available; check the backend log for `Resuming previous Gemini session` |
| A different voice is heard | Check the backend log line `Gemini setup voice = <name>` on each connection; the saved voice is pinned on every reconnect |
| `/ims/boardgames` says a token is needed | BGG requires an application token - see [BoardGameGeek token](#boardgamegeek-token) |
| Music scan can't reach the library | The share isn't reachable from the backend host; set the correct path on `/ims/musicscan` |
| Face recognition errors | Models missing in `pdf-knowledge-base/server/python/models/` (see setup step 3), or Python packages not installed |
| Clock shows the wrong hour | Time syncs via NTP with a Europe/London POSIX rule; the boot log prints raw UTC and the adjusted time - compare them |
| Web page won't scroll / missing changes | Hard-refresh; the backend hot-reloads but the Vite app caches aggressively behind a tunnel |
