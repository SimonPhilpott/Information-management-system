# System Architecture Implementation Plan: Modernisation & Reliability

## Executive Overview

This plan outlines the systematic modernisation and hardening of the **Information Management System (IMS)** backend, data layer, and web client. It addresses all **9 outstanding architectural developer ideas** recorded in the IMS Dev Ideas service.

To ensure continuous system availability—particularly for critical real-time features like continuous glucose monitoring (CGM), hardware voice interactions (ESP32-S3-BOX-3), and daily briefing generation—the work is sequenced across **5 distinct, dependency-aware phases**.

```mermaid
graph TD
    P1["Phase 1: Housekeeping & Tunnel Hardening<br/>(Ideas #49 & #46)"] --> P2["Phase 2: Master Scheduler & Disaster Recovery<br/>(Ideas #44 & #48)"]
    P2 --> P3["Phase 3: Real-Time Push & Searchable Logs<br/>(Ideas #42 & #50)"]
    P3 --> P4["Phase 4: AI SDK Upgrade & Vector Slimming<br/>(Ideas #47 & #51)"]
    P4 --> P5["Phase 5: Monolith Modularisation & Code-Splitting<br/>(Idea #43)"]

    style P1 fill:#10b981,stroke:#059669,stroke-width:2px,color:#ffffff
    style P2 fill:#0284c7,stroke:#0369a1,stroke-width:2px,color:#ffffff
    style P3 fill:#6366f1,stroke:#4f46e5,stroke:#4f46e5,color:#ffffff
    style P4 fill:#d97706,stroke:#b45309,stroke-width:2px,color:#ffffff
    style P5 fill:#e11d48,stroke:#be123c,stroke-width:2px,color:#ffffff
```

---

## High-Level Experience Matrix: What Changes for You (At a Glance)

| Phase | Core Objective | What Looks Different | What Feels Different |
|---|---|---|---|
| **Phase 1** | Housekeeping & Tunnel Hardening | Clean file trees, absence of loose scratch scripts, and valid security badges on remote browsers | Reassurance when accessing IMS away from home over mobile or public Wi-Fi; protected against oversized request crashes |
| **Phase 2** | Master Scheduler & Disaster Recovery | Brand new **Background Jobs** card in `/ims/architecture` and a **1-Click Restore** section in `/ims/backups` with verified drill badges | Zero database locking freezes; background jobs no longer clash; peace of mind that a full restore takes seconds if the PC fails |
| **Phase 3** | Instant Live Updates & Searchable Logbook | Instant UI transitions on doorbell dings and glucose arrivals; brand new **Logs Explorer** tab in `/ims/architecture` | The app feels "alive" with zero polling lag; laptop and phone battery life improves with the elimination of endless HTTP polling loops |
| **Phase 4** | AI SDK Upgrade & Vector Slimming | Reclaimed 3–4 GB of drive space; new **Storage Breakdown** visualizer in the Admin panel | PDF uploads index 3–5x faster without freezing the system; sharper, up-to-date Gemini responses across reports and research |
| **Phase 5** | Monolith Modularisation & Code-Splitting | Zero `>500 kB` bundle warnings; smooth, on-demand component loading across all 29 portal views | Near-instant initial page loads, particularly over mobile ngrok links; silky smooth portal transitions and zero IDE lag during development |

---

## The 5 Implementation Phases

### Phase 1: Spring Clean & Locking the Front Doors
*Addressing Dev Idea #49 (Housekeeping) and Dev Idea #46 (Security Hardening)*

#### What It Means in Plain English
Think of this as tidying up the workshop bench so you don't trip over old testing scraps, while putting proper deadbolts and parcel weight limits on the front door so nobody can drop a massive 50 MB boulder through the letterbox.

#### Technical Scope
1. **Repository Hygiene (#49):**
   - Move non-essential diagnostic scripts (`check_cols.js`, `check_db.js`, `check_schema.js`, `check_settings.js`, `check_token.js`, `scratch_check_db.js`, `scratch_test_drive.js`, `test_attachment_extraction.js`, `test_endpoint.js`) into `pdf-knowledge-base/server/scripts/`.
   - Purge dead crash artifacts (`bash.exe.stackdump`), empty placeholder SQLite files (`db/database.sqlite`, `db/library.db`), and Office temporary locks (`~$*`).
   - Extend `.gitignore` to prevent scratch files from polluting source control.
2. **Tunnel & Access Hardening (#46):**
   - Enable Express `trust proxy: 1` in `server/index.js` to accurately inspect client IP addresses forwarded by `ngrok` or `cloudflared`.
   - Set session cookie security policies: enforce `sameSite: 'lax'` and conditionally set `secure: true` whenever requests arrive over HTTPS.
   - Restrict the global JSON body parser from `50mb` down to `1mb` standard payload limits, granting `50mb` exemptions only to specific document and photo upload routers (`/api/pdf`, `/api/carbs/photo`, `/api/rulebook`).
   - Integrate Helmet middleware with Content Security Policy (CSP) tailored to allow OpenStreetMap map tiles, Google Web Fonts, and local WebSocket connections.

#### Tangible Changes: What You Will See & Feel
- **Visual Appearance:**
  - The repository root and backend folder structure look clean and professional, with all diagnostic tools tucked away into an organized `scripts/` directory.
  - In remote browsers (via `simon-ims.ngrok-free.app`), the address bar displays a clean HTTPS lock badge without mixed-content warnings or insecure cookie notices.
  - The browser developer console stays free of cross-origin or insecure iframe warnings.
- **Everyday Feel & Experience:**
  - Total confidence when accessing IMS from a smartphone on external mobile networks or public coffee-shop Wi-Fi, knowing session cookies cannot be intercepted.
  - Immediate protection against accidental large payload locks—dropping an accidental 100 MB file onto an ordinary text field immediately returns a clean, polite `413 Payload Too Large` error rather than crashing the Node server process.
  - Valid photo carb scans and PDF uploads continue to upload seamlessly.

#### Trade-Offs & Stability Risks
* **Pros:** Closes remote denial-of-service vulnerabilities, protects session cookies from sniffing over public Wi-Fi, and eliminates cognitive clutter in the codebase.
* **Cons:** Requires explicit CSP declarations for third-party CDNs and mapping assets.
* **Stability Risk:** **Low–Moderate.** If CSP rules are too rigid, map tiles or audio streaming sockets could be blocked. 
* **Rollback Plan:** Immediate reversion of Helmet CSP config; fast toggle back to default body parser limits.

---

### Phase 2: One Master Timetable & a Tested "Panic Button"
*Addressing Dev Idea #44 (Central Job Scheduler) and Dev Idea #48 (Backup Drills & Restore)*

#### What It Means in Plain English
Replacing 18 separate kitchen egg timers with one smart master clock on the wall, and actually testing your fire escape door once a week to prove it opens smoothly instead of just crossing your fingers.

#### Technical Scope
1. **Central Job Scheduler (#44):**
   - Construct `pdf-knowledge-base/server/services/schedulerService.js` to replace 18 fragmented `setInterval` loops across `index.js`, `glucoseHubService`, `stravaService`, `calendarService`, `weatherService`, and `morningReportService`.
   - Enforce British London wall-clock scheduling (`Europe/London`).
   - Introduce concurrency run-locks per task to prevent overlapping execution of long-running operations (e.g., Strava synchronization or morning report pre-warming).
   - Track `lastRun`, `nextRun`, `durationMs`, and `lastError` metadata, exposing `GET /api/jobs` to power a new **Background Jobs** telemetry card in `/ims/architecture`.
2. **Automated Backup Drills & One-Click Restore (#48):**
   - Build a weekly background drill in `backupService.js` that unzips the latest archive into a temporary sandbox and executes SQLite `PRAGMA integrity_check`, publishing status badges to the Backups portal.
   - Implement an authenticated **Restore** endpoint (`POST /api/backups/restore/:filename`) that pauses background jobs, creates a pre-restore safety snapshot of the active `app.db`, replaces database and asset files, and gracefully reboots.
   - Add a separate secure backup mechanism for `data/.wifi_key` so hardware credentials survive restorations.

#### Tangible Changes: What You Will See & Feel
- **Visual Appearance:**
  - In **System Architecture** (`/ims/architecture`), a brand new **Background Jobs** monitor card appears. It displays all 18 system routines with countdown badges showing exactly when each will run next (e.g. `Next: 14m 22s`), how long the previous run took in milliseconds, a green/amber/red health pill, and a manual **"Run Now"** trigger button.
  - In the **Backups Portal** (`/ims/backups`), a prominent green status banner announces: `Automated Drill: Passed (Today at 03:00 - Database integrity verified)`.
  - Beside every backup entry, a distinctive **"Restore"** button appears, opening an interactive safety modal with pre-flight check confirmations.
- **Everyday Feel & Experience:**
  - No more mysterious UI freezes or brief SQLite lock hiccups caused when heavy jobs (like Strava activity sync and morning report pre-warming) collide at the exact same second.
  - Restoring the entire IMS state after a PC failure changes from a 30-minute stressful manual command-line process into a 10-second single click with zero anxiety.
  - Restoring a backup never knocks your ESP32-S3-BOX-3 offline because Wi-Fi encryption keys are preserved independently.

#### Trade-Offs & Stability Risks
* **Pros:** Prevents simultaneous background tasks from locking the SQLite database; guarantees backup archives are uncorrupted and recoverable without command-line intervention.
* **Cons:** Requires centralising 18 diverse job contracts with different retry behaviours.
* **Stability Risk:** **Moderate–High.** If a scheduled job crashes unhandled within the scheduler loop, background syncs could stall. An improperly managed database restore could corrupt live data.
* **Rollback Plan:** Individual job execution wrapped in defensive `try/catch` sandboxes with watchdog alarms; restore protocol mandates an automatic pre-restore backup snapshot before touching any live file.

---

### Phase 3: Instant Live Updates & Searchable Logbook
*Addressing Dev Idea #42 (Unified Server Push Stream) and Dev Idea #50 (Structured Levelled Logging)*

#### What It Means in Plain English
Instead of your web browser repeatedly tapping the server on the shoulder every 10 seconds asking *"Did the doorbell ring? Got new glucose? Finished that task?"*, the server simply whispers updates to your screen the split second they happen.

#### Technical Scope
1. **Server-Sent Events (SSE) Push Pipeline (#42):**
   - Establish `pdf-knowledge-base/server/services/eventBus.js` and an SSE endpoint at `GET /api/events`.
   - Broadcast events in real time: `glucose:update`, `doorbell:ding`, `device:status`, `job:complete`, `tasks:update`, and `music:scan_progress`.
   - Equip `/api/events` with 20-second keep-alive heartbeats (`: ping\n\n`) to prevent tunnel timeouts.
   - Introduce a React hook `useSystemEvents(topic, handler)` across client portals, eliminating client-side `setInterval` fetch loops.
2. **Structured Logging & Architecture Logs Explorer (#50):**
   - Introduce a structured logger (`pino`) with service tags (`[Weather]`, `[MorningReport]`, `[HardwareProxy]`) and levelled filters (`trace`, `debug`, `info`, `warn`, `error`).
   - Configure asynchronous log rotation in `data/logs/` capped at 14 days.
   - Quieten repetitive HTTP poll logging and add an interactive **Logs Explorer** tab inside `/ims/architecture` supporting full-text search, level filters, and direct links to trace IDs.

#### Tangible Changes: What You Will See & Feel
- **Visual Appearance:**
  - **Doorbell Alerts (`/ims/doorbell`):** A doorbell ding or motion event updates the screen with live snapshot thumbnails *the exact millisecond* it occurs—no more waiting up to 10 seconds for the next client poll.
  - **Blood Sugar Monitoring (`/ims/glucose` & Top Header):** Glucose readings and trend arrows update synchronously the moment Nightscout publishes a new 1-minute delta.
  - **Music Scan Progress (`/ims/musicscan`):** The scan bar moves with continuous, silky animation as each artist is processed, rather than jumping in staggered leaps.
  - **System Architecture (`/ims/architecture`):** A dedicated **Logs Explorer** tab lets you search and filter live server logs by severity (`ERROR`, `WARN`, `INFO`) or service name (`[Weather]`, `[MorningReport]`) with live keyword search and syntax highlighting.
- **Everyday Feel & Experience:**
  - Opening browser DevTools Network tab shows a calm, silent network: hundreds of repetitive `GET /api/...` calls every minute are replaced by one quiet, continuous stream.
  - Laptop and smartphone battery drain while leaving IMS dashboard tabs open drops noticeably.
  - Diagnosing an unexpected error or voice tool failure is instantaneous—no need to remote-desktop into the PC or search raw text files in PowerShell.

#### Trade-Offs & Stability Risks
* **Pros:** Reduces client-server HTTP network chatter by >80%; delivers instant UI feedback (zero delay on doorbell rings or glucose alarms); provides instant diagnostic traceability for bugs.
* **Cons:** Requires SSE connection reconnection logic on mobile devices when waking from sleep.
* **Stability Risk:** **Low–Moderate.** Memory leaks if client components fail to unbind SSE listeners upon unmounting.
* **Rollback Plan:** Client hook includes an automatic fallback to standard periodic polling if the SSE stream encounters persistent connection failures.

---

### Phase 4: Upgrading the AI Brain & Shrinking the Library
*Addressing Dev Idea #47 (Google Gen AI SDK Migration) and Dev Idea #51 (Knowledge Base Storage Optimization)*

> **Status: rolled out 02/10/2026** (TASK-262/263/264). Delivered: `@google/genai` behind `services/geminiClient.js`; `services/modelRegistry.js` with the **Model Switcher** page (`/ims/models` - per-service language/voice model, tested before switching, one-click roll back); PDF SHA-256 de-duplication by hard links (964.9 MB saved); int8 vectors (1,887.5 MB -> 275 MB, float originals kept until deleted from the Storage page); incremental HNSW updates; the **Storage** page (`/ims/storage`) and, added to the plan, the **Costs** page (`/ims/costs`). Differences from the plan: the storage breakdown lives in Customisation and system settings rather than `/admin`; the model list is read live from Google for the API key (the hard-coded list in the plan was out of date - `imagen-3.0` is no longer offered); the measured PDF saving was ~1 GB (only exact duplicates are linked), and the vector backup must be deleted to reclaim the remaining ~1.6 GB.

#### What It Means in Plain English
Updating your AI subscription to Google's brand-new software engine, while digitising and compressing an overflowing filing cabinet so it takes up a fraction of the room without losing any detail.

#### Technical Scope
1. **Google Gen AI SDK Upgrade (#47):**
   - Upgrade from deprecated `@google/generative-ai` (^0.21.0) to Google's official unified `@google/genai` library.
   - Eliminate hardcoded, obsolete model strings (retiring `gemini-1.5-flash` references in `chatService.js`).
   - Centralise all model definitions in `config.js` (`gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-3.8-live`, `text-embedding-004`, `imagen-3.0`) and synchronise them with the Model Switcher and System Architecture diagram.
2. **Storage Slimming & Vector Quantisation (#51):**
   - Implement SHA-256 content deduplication for PDF uploads in `data/pdfs/` (4.3 GB), preventing duplicate copies across different subject taxonomies.
   - Convert high-dimensional float32 vector embeddings in `data/vectors/` (1.9 GB) to int8 or float16 scalar quantisation, shrinking memory and disk consumption by 50% to 75%.
   - Implement incremental node updates in `hnswlib` (`indexDocumentIncremental()`) to remove the need for slow, full-index rebuilds on new uploads.
   - Add storage utilisation breakdowns per subject to the Admin panel.

#### Tangible Changes: What You Will See & Feel
- **Visual Appearance:**
  - In the **Admin Panel** (`/admin`), a new **Storage Utilisation Breakdown** widget displays sleek horizontal bar charts showing exact megabytes used by PDFs and vector embeddings across subjects (LOTR, Arkham, Diabetes, Technology, Board Games).
  - The **Model Switcher** and **System Architecture** cards show updated, uniform AI model badges reflecting `gemini-2.5-flash`, `gemini-2.5-pro`, and `gemini-3.8-live` consistently.
  - Vector indexing modal displays instant per-document progress bars instead of a global blocking screen.
- **Everyday Feel & Experience:**
  - Your PC reclaims **3.0 to 4.5 GB of solid-state disk space** immediately.
  - Adding a new PDF rulebook or clinical paper indexes in seconds: the system no longer locks CPU cores for several minutes recalculating the entire library's HNSW vector graph.
  - AI responses—from Day Reports and RAG rule checks to Photo Carbs food analyses—feel faster, more consistent, and immune to upcoming Google API deprecation shutdowns.

#### Trade-Offs & Stability Risks
* **Pros:** Future-proofs IMS against Google API deprecations; reclaims 3–4 GB of disk space; accelerates document ingestion and reduces RAM usage.
* **Cons:** Quantisation introduces a microscopic (<1%) trade-off in mathematical retrieval precision.
* **Stability Risk:** **Moderate–High.** Gemini powers critical workflows: Day Report generation, RAG document search, Photo Carbs nutritional breakdown, and the voice fallback tool. Any interface discrepancy will cause AI failures. Vector corruption could break document search.
* **Rollback Plan:** Keep float32 vector backups alongside quantised files during testing; retain fallback wrapper matching `@google/generative-ai` response shapes until regression verification passes.

---

### Phase 5: Breaking Down the Two Giant "Do-Everything" Files (still outstanding)
*Addressing Dev Idea #43 (Monolith Decomposition)*

#### What It Means in Plain English
Taking two 2,500-page telephone directories that have everything crammed into them and neatly splitting them into individual, well-organised booklets.

#### Technical Scope
1. **Deconstruct Server Monolith (`server/index.js` — 2,690 lines):**
   - Extract the Gemini Live WebSocket proxy into `server/services/geminiLiveProxy.js`.
   - Extract the Box-3 TCP audio bridge and framing logic into `server/services/box3HardwareBridge.js`.
   - Delegate Express route registration to modular routers under `server/routes/`.
2. **Deconstruct Web Client Monolith (`src/App.jsx` — 2,459 lines):**
   - Replace manual `switch/case` portal rendering with a declarative Route Table (`src/routes.js`).
   - Implement asynchronous code-splitting using `React.lazy()` and `Suspense` for all 29 portal views.
   - Resolve Vite's `>500 kB` bundle warning (currently bundling a 3.94 MB JavaScript blob).

#### Tangible Changes: What You Will See & Feel
- **Visual Appearance:**
  - Initial browser loading displays a crisp, instant top navigation bar and subtle skeleton loader as portals mount effortlessly.
  - In terminal build logs, the persistent yellow warning `(!) Some chunks are larger than 500 kB after minification` completely disappears. In its place, Vite outputs cleanly isolated bundles (e.g., `dist/assets/RunPlanner-[hash].js`, `dist/assets/Campaigns-[hash].js`).
- **Everyday Feel & Experience:**
  - **Lightning Initial Page Load:** Opening IMS on mobile or desktop drops the initial JavaScript download from ~4 MB down to ~250 kB—making first page load instantaneous.
  - Navigating between unrelated portals (e.g. jumping from Blood Sugar to Arkham Horror Campaign Manager) feels snappier and lighter on browser memory.
  - Future AI development sessions and human code edits become vastly quicker and less error-prone: modifying one portal's logic has zero risk of inadvertently breaking another portal or causing merge conflicts in `App.jsx`.

#### Trade-Offs & Stability Risks
* **Pros:** Speeds up initial browser page load times; eliminates merge conflicts; makes future pair-programming and AI code generation significantly safer and faster.
* **Cons:** High refactoring surface area requiring touchpoints across every portal in the application.
* **Stability Risk:** **Very High.** High blast radius. Risk of broken route parameters, missed WebSocket lifecycle listeners, or missing context providers.
* **Rollback Plan:** Executed only after Phases 1–4 are complete and proven stable. Staged on an isolated branch with automated regression tests before merging.

---

## Complete Dev Ideas Cross-Reference

| Dev Idea ID | Category | Summary Description | Assigned Phase | Primary Experience Impact |
|---|---|---|---|---|
| **#49** | Housekeeping | Tidy root scripts, remove stale databases, extend `.gitignore` | **Phase 1** | Clean, uncluttered repository and zero scratch file noise |
| **#46** | Security | Harden tunnel access, secure cookies, trust proxy, body limits, Helmet CSP | **Phase 1** | Secure mobile access and DOS payload protection |
| **#44** | Reliability | Central job scheduler, London time sync, concurrency locks, jobs panel | **Phase 2** | Live background jobs card and zero database lockups |
| **#48** | Reliability | One-click backup restore, weekly integrity drill, separate Wi-Fi key export | **Phase 2** | 10-second panic restore button and automated drill badges |
| **#50** | Observability | Structured levelled logging (Pino), log rotation, Architecture Logs tab | **Phase 3** | In-app searchable logs explorer and instant debugging |
| **#42** | Performance | Single `/api/events` SSE push stream to eliminate browser polling | **Phase 3** | Instant doorbell/glucose updates and silent network tab |
| **#47** | Reliability | Upgrade to `@google/genai` SDK, centralise model constants in `config.js` | **Phase 4** | Future-proof AI engine and consistent modern models |
| **#51** | Storage/Perf | PDF deduplication, int8 vector quantisation, incremental HNSW indexing | **Phase 4** | 3–4 GB disk space reclaimed and 3–5x faster indexing |
| **#43** | Maintainability | Split `server/index.js` and `App.jsx`, implement `React.lazy` code splitting | **Phase 5** | Instant first page load (~250 kB shell) and clean builds |

---

## Recommended Execution Step

We recommend initiating **Phase 1 (Dev Ideas #49 & #46)** immediately:
1. It cleans the workspace of clutter and strengthens external tunnel security.
2. It carries virtually zero operational risk to active diabetes monitoring, voice streaming, or day report services.
3. It creates a clean, predictable baseline for the subsequent scheduler and logging enhancements.
