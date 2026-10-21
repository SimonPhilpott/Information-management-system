# Restoring IMS from this backup

This folder holds everything needed to rebuild IMS on a new or rebuilt PC. It's refreshed every night at 03:30
by the **IMS NAS backup** task. `LAST_BACKUP.txt` says when it last ran and whether anything went wrong.

## What's here

| Folder | What it is |
|---|---|
| `project\` | The whole `D:\Information management system` folder: code, `.env` files (API keys), data, PDFs, wake-word data, firmware, Home Assistant config, homebrew ingredient pictures and label fonts, installed packages. Nothing is ever deleted from it, so it may also hold files you'd since removed. |
| `databases\<date>\` | Clean copies of the IMS database (`app.db` - holds all recipes, batches, logs, tastings, ingredient mappings) and Home Assistant's (`home-assistant_v2.db`), one folder per night for 30 nights. **Always restore the database from here, not from `project\`.** |
| `git\` | The full code history as a single file per night (`ims-<date>.bundle`). |
| `claude-project\` | Claude's memory notes and conversation history for IMS. |
| `windows-startup\` | The shortcuts that start IMS when Windows starts. |

## Full restore, step by step

1. **Install the tools**: Node.js (LTS), Git, PowerShell 7, and if you use them Docker Desktop (Home Assistant),
   Python 3.12 and PlatformIO (Box-3 firmware), ngrok (remote access).
2. **Copy the project back**: copy `project\` to `D:\Information management system` (keep that exact path - the
   scripts and startup shortcuts expect it).
   `robocopy "\\Sideburnt\NorthField\IMS BACKUP\project" "D:\Information management system" /E`
3. **Put the databases back**: pick the newest folder in `databases\` (or an older one, to go back in time) and copy
   - `app.db` to `D:\Information management system\pdf-knowledge-base\server\data\app.db`
   - `home-assistant_v2.db` to `D:\Information management system\homeassistant\config\home-assistant_v2.db`
   Do this with IMS and Home Assistant stopped.
4. **Packages**: they came back with the project. If the server won't start with a "module" error, run `npm install`
   in `D:\Information management system`, `...\pdf-knowledge-base` and `...\pdf-knowledge-base\server`.
5. **Start-up**: copy the shortcuts in `windows-startup\` to
   `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`, then run `start-all.bat` (or restart Windows).
6. **The nightly backup**: re-create the task by running, in PowerShell,
   `pwsh -File "D:\Information management system\scripts\nas-backup\install-task.ps1"`
7. **Claude's notes**: copy `claude-project\` to `%USERPROFILE%\.claude\projects\d--Information-management-system`.
8. **Firmware** (only if the Box-3 itself needs re-flashing): the built files are in
   `project\firmware\esp32-s3-box-3\bin\`.

## Getting the code back without the project copy

`git clone "\\Sideburnt\NorthField\IMS BACKUP\git\ims-<date>.bundle" "D:\Information management system"` gives the
code and its full history (but not data, `.env` files or PDFs - those are in `project\`).

## Just one thing back

- **A deleted or broken file**: copy it from `project\` (same path inside).
- **The database as it was on a given night**: stop IMS, copy `app.db` from that night's `databases\` folder, start IMS.
