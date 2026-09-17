---
trigger: always_on
description: Development rules and database access for Information Management System
---

---
trigger: always_on
description: Development standards, database governance, and MCP tooling for Information Management System
---

# Information Management System (IMS) Standards

## Code Intelligence via CodeGraph MCP
- You MUST use `codegraph-ims` (`codegraph_get_call_graph`, `codegraph_find_references`, `codegraph_get_symbol_info`) for symbol tracing, dependency mapping, and consumer lookups across the codebase.
- Native multi-file regex grep and sequential file scans are strictly FORBIDDEN.

## Database Governance & SQLite MCP
- Local Database Queries: Query all local SQLite databases exclusively through the `sqlite` MCP server (`read_query`, `describe_table`, `list_tables`).
- Prohibited Actions: Never execute ad-hoc Python scripts, terminal commands, or regex text parsing against raw `.db` or `.sqlite` files to read data or schemas.
- Connection Hygiene: Explicitly close database connections, cursors, and prepared statements after use to avoid persistent file locks that break concurrent SQLite MCP tooling.
- Schema Migrations: Inspect table schemas using SQLite MCP prior to executing schema updates or writing persistence logic.

## Asset & Path Discovery via Everything MCP
- Call `everything` MCP (`everything_search`) to locate media files, documents, data dumps, and configuration paths across local volumes (`C:`, `D:`, or network mounts).
- Do NOT run recursive filesystem searches (`Get-ChildItem -Recurse` or `dir /s`).

## Defensive Engineering & State Integrity
- Resource & Memory Management: Clear timers, unbind event listeners, close open file descriptors, and cleanly release worker threads/subprocesses on termination or unmount.
- Input & Payload Validation: Never assume payload structure or external file completeness. Implement runtime schema validation, null checks, and defensive fallbacks on all file reads, API payloads, and query returns.
- Async UX & Feedback: Ensure asynchronous tasks provide explicit status feedback across all three states: active execution/loading, actionable error fallbacks, and zero-data/empty collection states.

## Architecture & Code Style
- Stack Paradigm: Clean, modular, and idiomatic TypeScript or Python. Prioritise functional separation, maintainability, and rapid iteration.
- Separation of Concerns: Keep data access, business orchestration, and UI/presentation layers decoupled.
- Avoid Unnecessary Overhead: Do not apply corporate SPFx conventions, `@microsoft/sp-property-pane` patterns, or Griffel CSS-in-JS constraints to this codebase unless explicitly requested.