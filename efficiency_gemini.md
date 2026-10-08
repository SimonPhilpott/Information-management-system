# IMS Architectural Review & Efficiency Audit

**Audit Date:** 8 October 2026  
**Auditor:** Gemini (Senior Solution Architect & Lead Systems Engineer)  
**System Scope:** Full Stack — Node.js/Express Backend (`pdf-knowledge-base/server`), React Frontend (`src/`), ESP32-S3-BOX-3 Firmware (`firmware/esp32-s3-box-3`), AI/LLM Orchestration, Data Tier (SQLite/Chroma), and Startup Automation.  
**Regionalisation:** British English (`en-GB`), Currency in GBP (`£`).

---

## Executive Summary

An exhaustive end-to-end architectural audit of the Information Management System (IMS) reveals an ambitious, highly integrated multimodal companion platform. However, the system currently suffers from severe operational red flags across security, AI token economics, Node.js event-loop health, and firmware maintainability.

The most critical operational vulnerabilities include:
1. **Broken AI Spend-Cap Protections:** The primary production models (`gemini-3.8-live`, `gemini-3.8-flash`, `gemini-3.5-flash-lite`, and image models) have zero list prices registered in `modelRegistry.js`. Consequently, SQLite records `£0.00` cost for primary workloads, the Costs Dashboard presents a false £0.37 weekly expenditure, and automated spend caps never trigger.
2. **Acoustic Wake-Verification Token Bleed:** Ambient acoustic triggers continuously open full Gemini Live sessions transmitting the entire ~16,000-token system instruction and 39 tool declarations. With ~360 false acoustic wake checks per day versus ~19 genuine interactions, approximately 95% of voice API expenditure is wasted on ambient silence or room noise.
3. **Blocking Synchronous File I/O & Memory Leaks:** The primary diagnostic log (`audio_captures/debug.log`) has bloated to **410.4 MB** and is written via synchronous `fs.appendFileSync` on the single-threaded Node.js event loop. Concurrently, persistent device socket closures buffer unbounded log lines in memory (`connectionLogLines`).
4. **Vite Bundler Misuse for Backend Infrastructure:** `vite.config.js` has grown into a 735-line server running unauthenticated PowerShell backups, ngrok process supervision, and SharePoint XML parsing. These capabilities fail completely in production builds.
5. **Monolithic Codebases:** Both the server entry point (`index.js` at 3,840 lines) and the ESP32 firmware (`main.cpp` at 5,800 lines) are monolithic single-file architectures that degrade maintainability, testability, and compile times.

---

## 1. Critical Architectural Red Flags & Security

### 1.1 Vite Bundler Architecture Violation & Administrative Attack Surface
* **Location:** [vite.config.js](file:///d:/Information%20management%20system/vite.config.js#L1-L160)
* **Root Cause:** In early development, backend utility routes were injected directly into Vite's dev-server middleware (`configureServer`) rather than the Express backend. This includes `/api/backup` (which spawns `powershell.exe Compress-Archive`), `/api/mesh-backups/restore`, `/api/tunnel/start`, and SharePoint XML parsing.
* **The Red Flag:** 
  1. Although a recent `securityGuardPlugin` was added to check local host/IP headers, administrative routes executing shell commands should never reside in a frontend client build configuration.
  2. In production builds (`npm run build`), Vite's dev server middleware does not execute; any production deployment serving static assets will find these endpoints missing (HTTP 404).
  3. The restore endpoint historically accepted unsanitised filenames (`../` path traversal risks).
* **Remediation:** 
  - Migrate all administrative endpoints, SharePoint scrapers, and backup routines out of `vite.config.js` into authenticated Express routers (`pdf-knowledge-base/server/routes/`).
  - Keep `vite.config.js` strictly scoped to bundler configuration (< 60 lines).
  - Ensure ngrok tunnels route exclusively to the hardened Node/Express server behind session/admin authentication, never directly to the Vite dev server.

### 1.2 Unauthenticated LAN Hardware Server (Port 3003)
* **Location:** [pdf-knowledge-base/server/index.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/index.js) & [cameraService.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/services/cameraService.js)
* **Root Cause:** Port 3003 runs a plain HTTP server for ESP32 camera uploads, face pack downloads, telemetry pushes, and personality updates without authentication.
* **The Red Flag:** Any local network device (or compromised IoT device on the LAN) can POST arbitrary video frames to `/device/camera/frame`, manipulate personality sliders via `/device/personality`, or trigger device commands.
* **Remediation:** Implement a shared secret token in HTTP headers (`X-Device-Token`) shared via `config.h` in firmware and `.env` on the host.

### 1.3 Git Repository Exposure of Network Tokens
* **Location:** Root [.env](file:///d:/Information%20management%20system/.env)
* **The Red Flag:** The public repository `SimonPhilpott/Information-management-system` tracks `.env` containing `NGROK_AUTHTOKEN`.
* **Remediation:** Remove `.env` from git tracking (`git rm --cached .env`), ensure it is listed in `.gitignore`, and set repository visibility according to security requirements.

---

## 2. AI Token Economics & Voice Pipeline Inefficiencies

### 2.1 Silent Spend-Cap Failure & Missing Price Registry
* **Location:** [modelRegistry.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/services/modelRegistry.js#L158-L165) & [usageService.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/services/usageService.js#L15-L27)
* **Root Cause:** `KNOWN_PRICES` only contains entries for legacy/static models (`gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.5-flash-lite`, `gemini-embedding-001`, `gemini-2.5-flash-preview-tts`). The primary active models specified in `SERVICES` (`gemini-3.8-live`, `gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-image`) are absent.
* **The Red Flag:**
  - `usageService.js` defaults unrecognised models to `{ input: 0, output: 0 }`.
  - Millions of tokens consumed by `gemini-3.8-live` and `gemini-3.8-flash` are recorded in SQLite `token_usage` with `estimated_cost = 0.0`.
  - The Costs Dashboard reports an artificial £0.37 for the week, blinding administrators to real spend.
  - The monthly spend-cap check (`checkSpendCap()`) cannot trigger, creating financial exposure to runaway API loops.
* **Remediation:** Add explicit pricing entries for `gemini-3.8-live` (audio/text input/output rates), `gemini-3.8-flash`, and `gemini-3.5-flash-lite` to `KNOWN_PRICES`. Fallback to a non-zero estimation if a new model is introduced.

### 2.2 Wake-Verification Acoustic Bleed
* **Location:** [pdf-knowledge-base/server/index.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/index.js#L1100-L1300) & [wakeDaemonService.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/services/wakeDaemonService.js)
* **Root Cause:** When ambient acoustic energy exceeds the device threshold (RMS > 450), the ESP32 streams raw PCM audio. The server responds by establishing a live bidirectional session with `gemini-3.8-live`.
* **The Red Flag:**
  - Establishing a Gemini Live session transmits the full setup payload: ~40,000 characters of system prompt and 39 tool schemas (~16,000–18,000 tokens).
  - Out of ~380 acoustic triggers per day, only ~19 represent genuine user interactions; 95% terminate in `noWakeDetected` within 3–5 seconds.
  - At ~360 false sessions/day × 18k tokens, the system bleeds ~6.5 million prompt tokens per day (~195 million tokens per month) solely verifying ambient noise.
* **Remediation:**
  1. Implement local, zero-cost wake-word verification before opening upstream Gemini Live sessions.
  2. On the host PC, run a small local wake engine (e.g. `openWakeWord`, Vosk, or a 40 MB Whisper/ONNX model via the existing Python environment) to verify "Hey Ims" / "Eh up Ims" on the initial 1.5-second audio buffer.
  3. Alternatively, enable Espressif's on-chip `ESP-SR WakeNet` on Core 0 of the ESP32-S3.
  4. Only invoke `ensureGeminiSocket()` when a local acoustic match is confirmed.

### 2.3 Monolithic System Instruction Bloat
* **Location:** [hardwareClientService.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/services/hardwareClientService.js)
* **The Red Flag:** 
  - The system prompt sent on every connection is exactly 40,000 characters (~10,000+ tokens).
  - Approximately 25,000 characters consist of exhaustive failure rules ("WHEN SOMETHING FAILS: ...").
  - Repetitive error handling rules should be passed dynamically inside tool execution results when an error actually occurs, rather than burdening every single session setup.
* **Remediation:** Trim static instructions to core persona, syntax, and voice rules (< 12,000 characters). Offload error remediation instructions to dynamic tool failure payloads.

### 2.4 Model Assessment Churn
* **Location:** [tasksService.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/services/tasksService.js) & [schedulerService.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/services/schedulerService.js)
* **The Red Flag:** Automated model switcher test suites consumed 8+ million input tokens over 7 days (including 7.3 million tokens during a single batch assessment on 5 October). Because the scheduler lacks persistent run tracking, server restarts trigger unbudgeted model tests.
* **Remediation:** Limit automated model assessment to weekly execution windows, cap candidate evaluation to primary services, and require manual user confirmation for full battery tests.

---

## 3. Backend Scalability, Reliability & Node.js Runtime

### 3.1 Event-Loop Blocking via Synchronous Logging & Giant Log Files
* **Location:** [pdf-knowledge-base/server/index.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/index.js#L1125-L1131)
* **Root Cause:** `audio_captures/debug.log` has grown to **410.4 MB** (over 2.8 million lines). The `logCapture()` helper writes synchronously to disk:
  ```javascript
  fs.appendFileSync(globalLogPath, line);
  ```
* **The Red Flag:** Synchronous disk writes on a 410 MB file occur multiple times per second (on every audio chunk, device telemetry push, and state transition). This pauses Node's single-threaded event loop, inducing audio packet jitter, WebSocket latency spikes, and delayed HTTP responses.
* **Remediation:**
  - Replace `fs.appendFileSync` with an asynchronous write stream (`fs.createWriteStream` with backpressure handling) or a buffered logger.
  - Implement log rotation (e.g. daily rotation or 25 MB file caps with 5-generation archiving).
  - Reduce firmware log levels from `CORE_DEBUG_LEVEL=3` to `CORE_DEBUG_LEVEL=1` (Info/Warn) to silence continuous FreeRTOS/USBH polling output.

### 3.2 Unbounded Memory Leak in Active Device Sockets
* **Location:** [pdf-knowledge-base/server/index.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/index.js#L1107-L1130)
* **Root Cause:** In `handleLiveProxyConnection`, `connectionLogLines = []` pushes every single log string for the lifetime of the socket connection.
* **The Red Flag:** The ESP32-S3-BOX-3 maintains long-running TCP connections for hours or days. `connectionLogLines` grows monotonically in heap memory without any size cap or FIFO eviction, consuming hundreds of megabytes of RAM.
* **Remediation:** Convert `connectionLogLines` into a fixed circular ring buffer (e.g. 500 items), retaining only the context necessary for post-wake analysis.

### 3.3 Scheduler Volatility & State Loss
* **Location:** [schedulerService.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/services/schedulerService.js#L14-L65)
* **Root Cause:** Background jobs track execution metadata (`lastRun`, `status`, `durationMs`) solely in an in-memory `Map()`.
* **The Red Flag:**
  - On every server reload (`node --watch` or development restart), all execution timestamps are wiped.
  - Jobs configured with an `initialDelayMs` (e.g. `model_assessment`, `speech_stats`, `backup_integrity_drill`) execute immediately after boot, causing resource thrashing during active editing.
  - Conversely, 24-hour maintenance jobs without initial delays starve and never execute if the server is restarted during the day.
* **Remediation:** Persist scheduler execution records to a SQLite table:
  ```sql
  CREATE TABLE IF NOT EXISTS scheduled_job_history (
    job_name TEXT PRIMARY KEY,
    last_run_at DATETIME,
    last_status TEXT,
    last_duration_ms INTEGER
  );
  ```
  On startup, schedule each job at `MAX(now, last_run_at + intervalMs)`.

### 3.4 Upstream WebSocket Protocol Disconnects (Error 1007/1008)
* **Location:** [pdf-knowledge-base/server/index.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/index.js)
* **Root Cause:** Box-3 telemetry packets (`{"log": ...}`) and expired session resumption handles are occasionally forwarded unmodified into the upstream Gemini WebSocket.
* **The Red Flag:** Gemini rejects unknown schema keys with `1007 Protocol Error` ("Unknown name 'log'"), dropping the active conversation. Stale resumption handles result in `1008 Requested entity not found`.
* **Remediation:** Strictly filter upstream WebSocket frames to allow only authorised Gemini schemas (`realtimeInput`, `clientContent`). Drop and invalidate resumption tokens on any 1008 error.

### 3.5 Monolithic Server Entry Point (3,840 Lines)
* **Location:** [pdf-knowledge-base/server/index.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/index.js)
* **The Red Flag:** `index.js` encapsulates HTTP routes, WebSocket proxies, audio pacing, prompt generation, device state machines, face rendering, and telemetry orchestration in a single file. This monolithic structure obscures side effects and impedes modular testing.
* **Remediation:** Decompose `index.js` into distinct service modules:
  - `server/transports/hardwareTcpServer.js` (Port 3002)
  - `server/transports/deviceHttpServer.js` (Port 3003)
  - `server/proxies/geminiLiveProxy.js` (WebSocket & Bidi stream)
  - `server/controllers/deskTurnController.js` (Conversation turn state machine)

---

## 4. Hardware, Camera & Firmware Architecture

### 4.1 24/7 Unthrottled Camera & Continuous Neural Net Inference
* **Location:** [cameraService.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/services/cameraService.js#L21) & [presenceService.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/services/presenceService.js#L22-L35)
* **Root Cause:** `AWAKE_MS` in `cameraService.js` is set to `24 * 60 * 60 * 1000` (24 hours).
* **The Red Flag:**
  - The Logitech C270 camera continuously uploads 640x480 MJPEG frames over Wi-Fi at 6 fps, generating ~4.3 GB of network traffic daily.
  - Concurrently, `presenceService.js` polls frames every 250 ms (`TICK_MS = 250`), running OpenCV YuNet face detection and SFace neural inference 4 times a second (345,600 inferences/day), even when the user is asleep or away from the desk.
* **Remediation:**
  - Restore reasonable camera sleep timeouts: reduce `AWAKE_MS` to 5 minutes after last interaction.
  - Introduce dynamic presence back-off: poll at 250 ms when a person is present, reduce to 2,000 ms after 30 seconds of absence, and suspend camera streaming after 10 minutes of inactivity until woken by a touch or wake word.

### 4.2 Firmware Monolith & PlatformIO Compile Inefficiency
* **Location:** [firmware/esp32-s3-box-3/src/main.cpp](file:///d:/Information%20management%20system/firmware/esp32-s3-box-3/src/main.cpp)
* **The Red Flag:** `main.cpp` is 5,800 lines long, combining LovyanGFX display rendering, touch events, FreeRTOS queue management, TCP networking, audio I2S pipelines, ArduinoOTA, and camera command handling. Minor UI edits require 45–60 second re-compilation passes.
* **Remediation:** Split `main.cpp` into modular compilation units:
  - `display_ui.cpp` / `.h` (LGFX display and sprite rendering)
  - `audio_pipeline.cpp` / `.h` (I2S standard mic and DAC routines)
  - `network_manager.cpp` / `.h` (Wi-Fi, TCP socket, OTA)
  - `state_machine.cpp` / `.h` (Device state transitions)

---

## 5. Frontend & Build Architecture Inefficiencies

### 5.1 Monolithic 4.2 MB Client Bundle & Static Route Imports
* **Location:** [src/App.jsx](file:///d:/Information%20management%20system/src/App.jsx#L1-L58)
* **Root Cause:** All 35+ portal components (`GlucosePortal`, `SystemArchitecturePortal`, `FaceDesignerPortal`, `CodeRepoPortal`, `BoardgamesPortal`, etc.) and heavy 3D rendering canvases (`MeshCanvas`, `SpatialCanvas`, `SunburstCanvas` via Three.js / React Three Fiber) are imported synchronously at the top of `App.jsx`.
* **The Red Flag:** The production build emits a single 4.2 MB JavaScript asset (`dist/assets/index-*.js`). Any visitor navigating to a simple page must download, parse, and evaluate the entire 3D engine, animation libraries, and all auxiliary portals.
* **Remediation:** Implement code-splitting using `React.lazy()` and `Suspense`:
  ```javascript
  const MeshCanvas = React.lazy(() => import('./components/KnowledgeMesh/MeshCanvas'));
  const GlucosePortal = React.lazy(() => import('./components/Dashboard/GlucosePortal'));
  const SystemArchitecturePortal = React.lazy(() => import('./components/Dashboard/SystemArchitecturePortal'));
  ```
  This reduces the initial bundle size from 4.2 MB to ~750 KB, speeding up initial page load significantly.

### 5.2 Legacy Frontend Ghost Process in Startup Automation
* **Location:** [start-all.bat](file:///d:/Information%20management%20system/start-all.bat#L54-L59)
* **Root Cause:** `start-all.bat` automatically launches `npm run dev:client` inside `pdf-knowledge-base/` on port 5173.
* **The Red Flag:** `pdf-knowledge-base/client` is an abandoned legacy frontend last modified in August 2026. Booting this service consumes memory, occupies a TCP port, and risks confusing users with stale dashboards.
* **Remediation:** Remove the `dev:client` invocation from `start-all.bat`. Archive or deprecate `pdf-knowledge-base/client`.

---

## 6. Storage, Database & Repository Hygiene

### 6.1 Stale Data Bloat (~4.0 GB Disk Reclaim Opportunity)
* **Locations:**
  - `pdf-knowledge-base/server/data/vectors_float32_backup/`: **1.9 GB**
  - `pdf-knowledge-base/server/data/backups/`: **645 MB**
  - `pdf-knowledge-base/server/data/vectors_stale_backup/`: **83 MB**
  - `pdf-knowledge-base/server/audio_captures/debug.log`: **410.4 MB**
  - `pdf-knowledge-base/server/audio_captures/` (183 unpruned conversation folders): **~1.0 GB**
* **The Red Flag:** Nearly 4 GB of obsolete binary vectors, redundant backups, and unrotated audio recordings are held on disk without retention policies.
* **Remediation:**
  - Clean up confirmed redundant vector backups.
  - Implement a scheduled retention pruner for `audio_captures/` (retaining audio older than 14 days only if marked as bookmarked).
  - Truncate and rotate `debug.log`.

### 6.2 SQLite WAL Hygiene & Redundant Databases
* **Location:** [pdf-knowledge-base/server/data/](file:///d:/Information%20management%20system/pdf-knowledge-base/server/data/)
* **The Red Flag:**
  - `app.db` is 37.3 MB with an active 4.1 MB `-wal` journal. Explicit checkpointing (`PRAGMA wal_checkpoint(TRUNCATE)`) is never scheduled, allowing write-ahead logs to grow.
  - A secondary, empty `database.sqlite` (12 KB) exists alongside `app.db`, creating confusion regarding the active data source.
* **Remediation:** Remove obsolete `database.sqlite` and configure a nightly scheduler job to run `PRAGMA wal_checkpoint(TRUNCATE)` and `PRAGMA optimize`.

---

## 7. Prioritised Action Matrix

The remediation roadmap is organised below by impact versus implementation effort:

| Priority | Category | Action Item | Impact | Effort |
| :--- | :--- | :--- | :--- | :--- |
| **P0** | **AI Cost** | Add `gemini-3.8-live` and `gemini-3.8-flash` to `KNOWN_PRICES` in `modelRegistry.js` to restore real spend tracking and monthly spend caps. | Critical | Trivial (< 1 hr) |
| **P0** | **Performance** | Truncate `debug.log` (410 MB) and replace synchronous `fs.appendFileSync` with an async stream and rotation limit. | Critical | Small (1–2 hrs) |
| **P0** | **Memory** | Convert `connectionLogLines` in `handleLiveProxyConnection` to a 500-line circular ring buffer to stop socket memory leaks. | High | Trivial (< 1 hr) |
| **P1** | **Security & Arch** | Relocate administrative endpoints and SharePoint scraping from `vite.config.js` into authenticated Express routers. | High | Medium (3–4 hrs) |
| **P1** | **AI Cost** | Implement local acoustic wake-phrase verification (openWakeWord/Whisper-base/ESP-SR) to eliminate ~95% of false Gemini Live sessions. | ~£30–£50/mo savings | Medium (4–6 hrs) |
| **P1** | **Reliability** | Persist scheduler job timestamps (`last_run`) in SQLite to prevent re-execution storms on server reloads. | High | Small (1–2 hrs) |
| **P1** | **Protocol** | Sanitise upstream Gemini WebSocket payloads to prevent 1007 protocol errors from Box-3 log packets. | High | Small (1 hr) |
| **P2** | **Frontend** | Implement `React.lazy()` code-splitting across `App.jsx` to reduce initial bundle from 4.2 MB to < 800 KB. | High (UX / Load) | Small (2 hrs) |
| **P2** | **CPU & Net** | Add idle back-off to `cameraService.js` and `presenceService.js` (disable 24/7 unthrottled streaming and 4 Hz neural inference). | Medium (Efficiency) | Small (2 hrs) |
| **P2** | **Clean-up** | Remove legacy `dev:client` startup from `start-all.bat` and purge ~4 GB of stale vector and capture backups. | Medium (Disk / RAM) | Small (1 hr) |
| **P3** | **Architecture** | Refactor `index.js` (3,840 lines) and `main.cpp` (5,800 lines) into modular domain components. | Maintainability | Large (2–3 days) |
| **P3** | **Security** | Add `X-Device-Token` authentication to LAN hardware port 3003 endpoints. | Low (LAN Defense) | Small (1 hr) |
