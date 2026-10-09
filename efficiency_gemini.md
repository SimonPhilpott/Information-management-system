# IMS Architectural Review & Efficiency Audit (Fresh Re-Audit)

**Audit Date:** 8 October 2026 (Post-Remediation Re-Audit)  
**Auditor:** Gemini (Senior Solution Architect & Lead Systems Engineer)  
**System Scope:** Full Stack — Node.js/Express Backend (`pdf-knowledge-base/server`), React Frontend (`src/`), ESP32-S3-BOX-3 Firmware (`firmware/esp32-s3-box-3`), AI/LLM Orchestration, Data Tier (SQLite/Chroma), and Startup Automation.  
**Regionalisation:** British English (`en-GB`), Currency in GBP (`£`).

---

## Executive Summary & Differential Audit

Following the implementation of major architectural patches across commits `07984e1`, `0e39942`, `c5ccd68`, and `cc377e7`, the IMS codebase has undergone a profound transformation in operational stability, security hardening, and cost efficiency.

### Major Remediations Verified & Confirmed
1. **AI Cost Tracking Restored:** Missing model pricing (`gemini-3.8-live`, `gemini-3.8-flash`, `gemini-3.8-flash-tts`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-image`) has been incorporated into `modelRegistry.js`. SQLite `token_usage` now logs real pound-and-pence costs, and monthly spend-cap enforcement is active.
2. **Acoustic Wake-Word Pre-Filtering (~95% Voice API Savings):** `wakeGateService.js` coupled with local `faster-whisper` (`base.en` running int8 on CPU via `python/wake_stt.py`) now intercepts and pre-screens ambient mic bursts before opening Gemini Live sessions. Ambient noise no longer incurs ~16,000-token prompt setup penalties.
3. **Backend Modularisation:** The monolithic `index.js` has been reduced from 4,020 lines to 1,406 lines. `handleLiveProxyConnection` now lives in `server/live/liveProxy.js`, accompanied by domain modules (`state.js`, `textMatching.js`, `setupMessages.js`, `debugLog.js`).
4. **Scheduler Persistence:** Job execution history is now saved to SQLite settings (`scheduler_last_runs`). Hot-reloading development servers no longer trigger redundant daily/weekly job storms, and interval starvation is eliminated.
5. **Disk & Event-Loop Health:** `audio_captures/debug.log` was reduced from **410.4 MB** to **3.1 MB**, transitioned to an asynchronous `fs.createWriteStream`, and configured for daily / 100 MB rotation with a 14-day retention cycle. In-memory connection logs are capped at 2,000 entries (`CONNECTION_LOG_MAX`).
6. **Frontend Lazy Loading:** 32 dashboard portals in `App.jsx` have been converted to `React.lazy()`, reducing the production bundle from **4.1 MB** to **2.7 MB**.
7. **Dead Code & Clutter Purge:** The legacy `pdf-knowledge-base/client` application has been completely decommissioned from disk and `start-all.bat`. Over 138,000 lines of obsolete scratch backups, docx lock files, and untracked archives have been deleted.

---

## Remaining Red Flags & Structural Improvements

While the critical vulnerabilities have been successfully neutralised, this fresh re-audit has identified several secondary architectural bottlenecks, UX regressions, and latent inefficiencies that warrant attention.

---

### 1. Frontend Architecture & Bundle Splitting

#### 1.1 Remaining 3D Canvas Bundle Bloat (2.7 MB Bundle)
* **Location:** [src/App.jsx](file:///d:/Information%20management%20system/src/App.jsx#L8-L19)
* **Root Cause:** While 32 portals were converted to `React.lazy()`, the four primary 3D Knowledge Mesh canvases remain statically imported at the top of `App.jsx`:
  ```javascript
  import { MeshCanvas } from './components/KnowledgeMesh/MeshCanvas';
  import { SpatialCanvas } from './components/KnowledgeMesh/SpatialCanvas';
  import { InstancedSpatialCanvas } from './components/KnowledgeMesh/InstancedSpatialCanvas';
  import { SunburstCanvas } from './components/KnowledgeMesh/SunburstCanvas';
  ```
* **Impact:** These components pull `@react-three/fiber`, `three.js`, and complex graph-projection math into the initial entry bundle. A user opening `/ims/glucose`, `/ims/calendar`, or `/ims/device-health` is still forced to download 2.7 MB of JavaScript on initial boot.
* **Remediation:** Convert `MeshCanvas`, `SpatialCanvas`, `InstancedSpatialCanvas`, and `SunburstCanvas` to `React.lazy()`. This will cut the initial bundle from 2.7 MB down to **< 800 KB**.

#### 1.2 Root-Level `<Suspense>` Unmounting Regression
* **Location:** [src/main.jsx](file:///d:/Information%20management%20system/src/main.jsx#L46-L48)
* **Root Cause:** The only `<React.Suspense>` boundary in the application wraps the top-level `<App />` component in `main.jsx`:
  ```jsx
  <React.Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }} />}>
    <App />
  </React.Suspense>
  ```
* **Impact:** In React, when a lazy component suspends during navigation, React ascends to the *nearest* enclosing `<Suspense>` boundary. Because `<App />` is inside that boundary, navigating between tabs (e.g. from `/ims/glucose` to `/ims/activities`) momentarily unmounts the entire application shell — dismantling navigation, header status, ongoing TTS playback, and live connection telemetry — flashing a blank screen while the chunk loads.
* **Remediation:** Place a dedicated `<Suspense fallback={<PortalSkeleton />}>` boundary inside `Layout.jsx` directly around the portal render outlet. This ensures the app shell, persistent audio, and sidebar remain mounted during route transitions.

---

### 2. Backend Server & Build Configuration Separation

#### 2.1 Backend Route Embedding in `vite.config.js` (736 Lines)
* **Location:** [vite.config.js](file:///d:/Information%20management%20system/vite.config.js#L138-L350)
* **Root Cause:** `vite.config.js` remains 736 lines long and retains four full server plugins:
  - `backupPlugin`: Spawns `powershell.exe Compress-Archive`.
  - `meshBackupPlugin`: Reads/writes backups and handles restore.
  - `tunnelPlugin`: Supervises ngrok child processes.
  - `sharePointXml`: Scrapes and traverses XML hierarchy.
* **Impact:** 
  1. **Production Failure:** These endpoints only exist in Vite's development middleware (`configureServer`). Any production deployment (`npm run build` served via Node or reverse proxy) will return HTTP 404 on all backup and tunnel API calls.
  2. **Architectural Hygiene:** Build configurations should strictly configure bundling tokens, alias mappings, and proxy tables. Server execution belongs in Express routers.
* **Remediation:** Relocate these endpoints into `pdf-knowledge-base/server/routes/meshBackups.js` and `pdf-knowledge-base/server/routes/tunnel.js`. Shrink `vite.config.js` to a clean build specification (< 60 lines).

---

### 3. Hardware, Camera & Edge Efficiency

#### 3.1 24-Hour Camera Awake Timeout & Continuous Neural Inference
* **Location:** [cameraService.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/services/cameraService.js#L21) & [presenceService.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/services/presenceService.js#L22)
* **Root Cause:** `AWAKE_MS` in `cameraService.js` remains configured to 24 hours:
  ```javascript
  export const AWAKE_MS = 24 * 60 * 60 * 1000; // Keep camera permanently hot for active testing
  ```
* **Impact:**
  - The Box-3 streams Logitech C270 MJPEG frames over Wi-Fi 24/7 at 6 fps (~4.3 GB of network traffic per day).
  - `presenceService.js` executes `detectFacesFast()` via OpenCV YuNet and SFace every 250 ms (`TICK_MS = 250`) on the host CPU indefinitely (345,600 inferences/day), even during night-time hours when the desk is unoccupied.
* **Remediation:** 
  - Reduce `AWAKE_MS` to a sensible default (e.g. 5–10 minutes) with automatic reset on user interaction.
  - Implement dynamic cadence in `presenceService.js`: poll at 250 ms when a person is present, scale back to 2,000 ms after 30 seconds of absence, and sleep the stream after 10 minutes of inactivity.

#### 3.2 Unset `IMS_DEVICE_KEY` Leaves LAN Port 3003 Open
* **Location:** [pdf-knowledge-base/server/index.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/index.js#L1280-L1286)
* **Root Cause:** The authentication check on port 3003 evaluates:
  ```javascript
  if (process.env.IMS_DEVICE_KEY && req.headers['x-ims-key'] !== process.env.IMS_DEVICE_KEY) { ... }
  ```
  However, `IMS_DEVICE_KEY` is currently undefined in `pdf-knowledge-base/.env`.
* **Impact:** Because the variable is unset, the authentication check bypasses, leaving camera uploads, face pack downloads, and personality manipulation open to any device on the local network.
* **Remediation:** Generate a cryptographically random device secret, add `IMS_DEVICE_KEY=<secret>` to `pdf-knowledge-base/.env`, and configure `#define IMS_DEVICE_KEY "<secret>"` in firmware `secrets.h`.

#### 3.3 Firmware Translation Unit Monolith (`main.cpp` at 5,800 lines)
* **Location:** [firmware/esp32-s3-box-3/src/main.cpp](file:///d:/Information%20management%20system/firmware/esp32-s3-box-3/src/main.cpp)
* **Impact:** `main.cpp` bundles LovyanGFX display routines, capacitive touch handlers, FreeRTOS queue dispatch, I2S standard audio, OTA networking, and face pack decoders in a single compilation unit. Any adjustment to UI layout forces a 45–60 second recompile on PlatformIO.
* **Remediation:** Split `main.cpp` into modular headers and source files (`display_ui.cpp`, `audio_pipeline.cpp`, `network_manager.cpp`).

---

### 4. Storage & Database Hygiene

#### 4.1 Residual Stale Vector Backups (~2.0 GB Disk Bloat)
* **Location:** [pdf-knowledge-base/server/data/](file:///d:/Information%20management%20system/pdf-knowledge-base/server/data/)
* **Findings:**
  - `server/data/vectors_float32_backup/`: **1.9 GB**
  - `server/data/vectors_stale_backup/`: **83 MB**
* **Impact:** These directories represent obsolete float32 embedding arrays from prior index migrations. They occupy ~2.0 GB of SSD storage without operational purpose.
* **Remediation:** Archive to external cold storage or delete both backup folders once active vector indices are validated.

#### 4.2 SQLite WAL Checkpointing
* **Location:** [pdf-knowledge-base/server/data/app.db-wal](file:///d:/Information%20management%20system/pdf-knowledge-base/server/data/app.db-wal)
* **Findings:** `app.db-wal` currently stands at **3.9 MB** and has no scheduled WAL checkpointing.
* **Impact:** Under heavy write loads (continuous presence sessions, token usage logging, conversation turns), SQLite WAL files can grow monotonically if checkpoints are never forced.
* **Remediation:** Add a daily scheduled maintenance task in `schedulerService.js` to run `PRAGMA wal_checkpoint(TRUNCATE)` and `PRAGMA optimize`.

---

## 5. Prioritised Action Matrix (Post-Remediation)

| Priority | Category | Action Item | Target Impact | Effort |
| :--- | :--- | :--- | :--- | :--- |
| **P1** | **UX / Stability** | Relocate `<Suspense>` boundary from root `main.jsx` to inside `Layout.jsx` around the portal outlet. | Eliminates full-app unmounting and page flickering on route changes. | Trivial (30 mins) |
| **P1** | **Frontend Perf** | Lazy-load `MeshCanvas`, `SpatialCanvas`, `InstancedSpatialCanvas`, and `SunburstCanvas` in `App.jsx`. | Reduces entry bundle from 2.7 MB to < 800 KB (~70% reduction). | Trivial (30 mins) |
| **P1** | **Resource Health** | Add idle back-off to `cameraService.js` (`AWAKE_MS = 5 min`) and `presenceService.js` (poll back-off). | Saves ~4 GB/day Wi-Fi traffic and eliminates 345k daily CPU neural inferences. | Small (1–2 hrs) |
| **P2** | **Security** | Define `IMS_DEVICE_KEY` in `pdf-knowledge-base/.env` and Box-3 `secrets.h`. | Hardens port 3003 against unauthenticated LAN tampering. | Trivial (15 mins) |
| **P2** | **Architecture** | Extract backup, restore, and tunnel handlers from `vite.config.js` into Express routes. | Restores backup API compatibility in production builds; cleans bundler config. | Medium (2–3 hrs) |
| **P2** | **Storage** | Purge `vectors_float32_backup` (1.9 GB) and `vectors_stale_backup` (83 MB). | Reclaims 2.0 GB of local disk space. | Trivial (5 mins) |
| **P3** | **Firmware** | Decompose `main.cpp` (5,800 lines) into modular translation units (`display_ui`, `audio_io`, `network`). | Slashes PlatformIO compile times from ~60s to ~15s for UI iterations. | Large (1–2 days) |
| **P3** | **Database** | Add nightly `PRAGMA wal_checkpoint(TRUNCATE)` job to `schedulerService.js`. | Prevents write-ahead log bloat and maintains database read latency. | Trivial (30 mins) |
