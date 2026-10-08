# Box-3: Wi-Fi updates, Wi-Fi development, then the camera - plan

Written 6 Oct 2026. Not started.

## Why

The Box-3's single USB connection (PHY) is either a USB device (the PC link on COM3, used for flashing and the serial log) or a USB host (the C270 webcam on the dock's USB-A). It can't be both. `main.cpp` therefore only starts the camera when no PC is plugged in. Once flashing and logging work over Wi-Fi, the box can live on dock power permanently, which frees USB for the camera.

Most of the camera support already exists: `firmware/esp32-s3-box-3/src/camera.cpp` has a UVC host driver that uploads frames to the server on port 3003. It has never been run without the PC cable.

## Phase 1 - firmware updates over Wi-Fi (OTA)

**How it works: the device pulls the firmware from the server.** The server already serves files to the device on port 3003 (face packs), so it serves the firmware there too.

1. **Partition table.** Check `platformio.ini` / `board_build.partitions` and confirm there are two app slots (`ota_0`, `ota_1`) plus `otadata`. The Box-3 has 16 MB of flash, so use a 2 × ~6 MB layout if needed. Changing the partition table needs **one last USB flash**.
2. **Version.** The build stamps `FW_VERSION` (git short hash plus build time) into the firmware. The device reports it in its first debug message and in every heartbeat.
3. **Server side** (`services/firmwareService.js` plus a route on the device server, port 3003):
   - `GET /device/firmware.bin` serves `.pio/build/esp32s3box/firmware.bin`, with its SHA-256 and version in the headers;
   - `POST /api/firmware/push`, admin only, tells the connected Box-3 `{ otaUpdate: { url, version, sha256, size } }`;
   - a "Firmware" card on the system page shows the running version, the built version, an Update button and the last result.
4. **Device side** (`ota.cpp`):
   - on `otaUpdate`, refuse while a conversation, a recording, an alarm or playback is in progress, and tell the server why;
   - otherwise show "Updating…" with a progress bar on screen, download with `HTTPUpdate` (or `esp_https_ota`) in chunks while checking the SHA-256, then reboot;
   - report progress and the outcome over the existing debug channel (`ota_progress`, `ota_ok`, `ota_failed: reason`).
5. **Rollback safety:**
   - enable app rollback;
   - the new firmware only marks itself good (`esp_ota_mark_app_valid_cancel_rollback`) after it has reached the server and run for about 60 s;
   - if it crashes or never connects, the bootloader goes back to the previous version by itself, so a bad update can never leave the box unusable.
6. **One-command flow for development:** `npm run fw:ota` builds with PlatformIO and then calls `/api/firmware/push`. It replaces `pio run -t upload --upload-port COM3`.

**Test:** do one USB flash with the new partition table. Then update twice over Wi-Fi, and once with a deliberately broken build to check that it rolls back.

## Phase 1b - Device Health page: OTA updates, every status working, and a terminal

The Device Health page (`/ims/device-health`, `src/components/Dashboard/DeviceHealthPortal.jsx`, API `routes/deviceHealth.js`) becomes the one place to watch, update and debug the Box-3.

1. **Audit what it shows now.** Go through every field the page displays and every field the device sends: heap, PSRAM, internal RAM, minimum heap, RSSI, uptime, state, reset reason and history. For each one, confirm that it arrives, is current and is correct.
   - Fix any that are blank, stale or wrong. Today `boot_reset_reason=POWERON` is reported on every reconnect, so it doesn't tell a reboot from a reconnect.
   - Make "online" reflect the live socket, not just the last heartbeat time.
2. **Show every status that matters, with a clear colour for each:**
   - connection (online, reconnecting, offline, last seen);
   - firmware (running version, built version, "update available");
   - OTA state (idle, downloading %, verifying, rebooting, done, failed with the reason, rolled back);
   - device state (standby, verifying, listening, thinking, speaking);
   - wake listener (running, green when verified);
   - mic (live, muted) and speaker;
   - recording mode (on or off);
   - camera (off, not plugged in, seen, streaming, error);
   - Gemini session (open, closed, cooldown, last error);
   - time since the last crash, and its reason.
3. **"Update firmware (OTA)" card:**
   - **Build:** runs `pio run` on the server.
   - **Update device:** pushes the new build over Wi-Fi, with a progress bar fed by `ota_progress`.
   - Shows the outcome and the version before and after. The update is refused, with the reason shown, while a conversation, recording or playback is in progress.
   - Confirm before updating, admin only.
   - A small history of past updates: when, from which version to which, and the result.
4. **Terminal panel:** a live, scrolling console on the page.
   - **Live output:** streams from the server (Server-Sent Events). It shows build output, OTA progress, the device's mirrored serial log (`DEVICE LOG`, from Phase 2), `DEVICE DEBUG` events and server lines for the Box-3 (connects, Gemini session open and close).
   - **Filters:** build / OTA / device / server; also pause, clear, copy and download the last 2,000 lines.
   - **Command box (fixed commands only, not a shell):**
     - `build`, `update`, `status`, `reboot`, `heap`, `camera on|off`, `logs on|off`;
     - `flash usb`: the cable fallback, running the PlatformIO upload on COM3 with `PYTHONIOENCODING=utf-8` and streaming its output.
   - Commands are admin only. Each is logged, and reboot, update and USB flash ask for confirmation.
5. **Server pieces:**
   - `services/firmwareService.js`: build, push, OTA state and history;
   - an in-memory log ring buffer plus `GET /api/device-health/stream` (Server-Sent Events);
   - `POST /api/device-health/command` with a fixed list of allowed commands;
   - firmware version and OTA state added to the `/api/device-health` response.
6. **Check it works:**
   - every status shows a real value with the device online, and switches to "offline" when it's unplugged;
   - an OTA update run end to end from the page, watched in the terminal;
   - a deliberately bad build rolls back, and the page shows "rolled back".

## Phase 2 - developing over Wi-Fi (no serial cable)

1. **Log mirror.**
   - Route the firmware's `Serial.printf` logging through a `logf()` that also sends lines to the server (batched, rate-limited) as `DEVICE LOG:` entries in `debug.log`.
   - Keep the existing `DEVICE DEBUG` events.
   - Camera logs (`camLogf`) go the same way.
2. **Crash reports.** At boot, send the reset reason, plus the panic backtrace from the core dump partition if there is one. The current `boot_reset_reason=POWERON` on every connect isn't enough to explain today's 10-second drop-out at 10:04.
3. **Remote commands** (admin only): reboot, report heap and tasks, and switch the camera on or off.
4. **Docs:** in `firmware/README.md`, "flash once by USB, then everything over Wi-Fi", including the BOOT+RESET recovery for when a USB flash is ever needed.

## Phase 3 - the camera (C270 on the dock)

1. **Hardware trial:**
   - power the Box-3 from the dock's USB-C (5 V, 2 A or more) with no PC cable, and plug the C270 into the dock's USB-A;
   - read the mirrored camera logs: is it enumerated, accepted as UVC, and is the MJPEG stream running at low resolution (320×240 or 640×480)?
   - watch the heap and the audio for glitches while the camera is on.
2. **Grab on demand:**
   - keep the camera asleep by default;
   - the server sends `{ camera: { grab: true } }` and the device wakes the stream, takes one frame, uploads it to port 3003, then sleeps again;
   - the screen shows a camera icon while it's grabbing.
3. **Ims tool `lookAtCamera(question)`:**
   - the server asks for a frame, sends it to Gemini's vision model with the question, and returns a short description for Ims to say in his own voice;
   - plate photos reuse the photo-carbs analysis;
   - the "have a look" wording goes into his instructions.
4. **Privacy rules (hard):**
   - the camera is only used when Simon asks, never continuously and never on Ims's own initiative;
   - never while a recording is running or the mic is muted;
   - frames aren't stored unless he asks to save one;
   - the icon is always on screen while the camera is active.
5. **Later (optional):** a live view for Gemini Live at about 1 frame a second ("tell me when the kettle's boiled"). That costs more quota, so it only gets built if wanted.

## Order and size

| Phase | Work | Needs |
|---|---|---|
| 1 | OTA, partition check, rollback, push command | 1 final USB flash |
| 1b | Device Health: audit, all statuses, OTA card, terminal with build/update/flash | Phase 1 |
| 2 | log mirror, crash reports, remote commands | Phase 1 |
| 3 | camera trial, grab on demand, Ims tool, privacy | Phases 1-2 and the dock with a 2 A supply |

## Risks

- **Partition change:** needs a USB flash and wipes NVS if the layout moves. Wi-Fi credentials and settings would need re-entering, so check what's in NVS first.
- **Update over a weak Wi-Fi signal:** the chunked download and SHA-256 check refuse a corrupted image, and rollback covers a bad build.
- **Camera load on the ESP32-S3:** USB full speed, plus MJPEG buffers in PSRAM, plus audio. If audio glitches, take frames only while Ims isn't speaking.
- **Mic/camera trust:** the privacy rules above are part of the feature, not an add-on.
