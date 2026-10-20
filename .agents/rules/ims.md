---
trigger: always_on
description: Development standards, dual-mode governance, and pragmatic tooling for Information Management System
---

# Information Management System (IMS) Operational Standards

## Operating Modes: Claude (Fast) vs Governance (Audit)

To balance rapid development velocity with architectural integrity, operate in two distinct modes:

### 1. Default: Claude Mode (Rapid Iteration & Direct Execution)
Apply to all everyday development tasks, UI features, bug fixes, data parsing, and service enhancements:
- **Direct & Pragmatic Action:** Inspect relevant files directly, apply surgical diffs, and verify immediately with automated checks (`npm run build`, `node -e`).
- **Zero Administrative Friction:** Do NOT touch or update `TASK_LIST.md`, `test_plan.md`, `feature.json`, or `ProjectStructure.JSON` unless the user explicitly asks for them.
- **Fast Search:** Use `grep_search` (ripgrep) or `everything_search` for instant file/symbol lookups. Do not run slow recursive terminal sweeps (`Get-ChildItem -Recurse` or `dir /s`).

### 2. High-Assurance Mode (Governance & Milestone Audits)
Triggered only when the user explicitly requests it (e.g. `[govern]`, `[audit]`, `governance mode`, or `record this milestone`):
- **Triple Registry Synchronization:** Synchronise `feature.json`, `ProjectStructure.JSON`, and `test_plan.md` with new `FEAT-XXX` mappings, matrix rows, and test suites.
- **Task List Protocol:** Record milestone progress in `./TASK_LIST.md` with timestamps (`DD/MM/YYYY HH:mm`).
- **Architectural Verification:** Run full static analysis and blast-radius checks before applying multi-service changes.

---

## Code Intelligence & CodeGraph Governance (Sensible Use)

- **Use CodeGraph (`codegraph-ims`) when sensibly needed:**
  - **Refactoring & Symbol Renaming:** Call `codegraph_analyze_impact` before renaming public exports, shared types, or cross-cutting service methods.
  - **Downstream Dependency Mapping:** Call `codegraph_get_dependency_graph` when altering module imports, detecting circular dependencies, or restructuring project packages.
  - **Execution Flow:** Call `codegraph_get_call_graph` before updating critical shared pipelines with deep caller/callee trees (e.g. Gemini Live audio proxy, event bus, job scheduler).
- **Skip CodeGraph when:**
  - Building self-contained features, local utility methods, isolated UI components, data ingestion scripts, or direct route additions. Do not perform redundant static analysis when the scope is clearly local.

---

## Database Governance & Persistence Hygiene

- **Database Access:** Use the `sqlite` MCP server or direct Node.js `better-sqlite3` execution in application code/services.
- **Connection Hygiene:** Explicitly close database connections, cursors, and prepared statements after use to avoid persistent file locks that break concurrent SQLite MCP tooling.
- **Schema Migrations:** Inspect table schemas prior to executing schema updates or writing persistence logic.

---

## Asset & Path Discovery via Everything MCP

- Call `everything` MCP (`everything_search`) to locate media files, documents, data dumps, and configuration paths across local volumes (`C:`, `D:`, or network mounts).
- Prohibited: Recursive terminal sweeps (`Get-ChildItem -Recurse` or `dir /s`).

---

## Defensive Engineering & State Integrity

- **Resource & Memory Management:** Clear timers, unbind event listeners, close open file descriptors, and cleanly release worker threads/subprocesses on termination or unmount.
- **Input & Payload Validation:** Implement runtime schema validation, null checks, and defensive fallbacks on all file reads, API payloads, and query returns.
- **Async UX & Feedback:** Ensure asynchronous tasks provide explicit status feedback across all three states: active execution/loading, actionable error fallbacks, and zero-data/empty collection states.
- **Avoid SPFx Overhead:** Do not apply corporate SPFx conventions, `@microsoft/sp-property-pane` patterns, or Griffel CSS-in-JS constraints to this codebase unless explicitly requested.

---

## Firmware Flashing & Windows Python Encoding

- **Mandatory Encoding Invariant:** Whenever compiling or flashing ESP32 firmware on Windows, ALWAYS set `$env:PYTHONIOENCODING="utf-8"` in PowerShell or `set "PYTHONIOENCODING=utf-8"` in cmd.
- **Flashing Protocol:** Avoid PlatformIO's upload target when uploading to COM3 because Click/Python terminal UI progress bar throws `UnicodeEncodeError: 'charmap'` on Windows cp1252. Prefer direct binary upload with `esptool.exe`:
  `$env:PYTHONIOENCODING="utf-8"; & "$env:USERPROFILE\.platformio\penv\Scripts\esptool.exe" --chip esp32s3 -p COM3 -b 921600 write-flash 0x00000000 "firmware\esp32-s3-box-3\bin\firmware.factory.bin"`