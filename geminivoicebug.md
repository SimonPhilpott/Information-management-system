# Playback-Cutoff Investigation — Summary

## Symptom
Gemini's spoken reply stops mid-sentence/mid-word during normal use, at unpredictable points (anywhere from 2s to 20s+ into a reply). Happens regardless of Gemini model (3.8, 2.1, 2.5 all showed it). Occasionally also surfaced as a *different* symptom — a garbled/stale snippet from an earlier conversation playing after a cutoff — which turned out to be a separate, now-fixed bug (see below).

## What's confirmed, with evidence (not guesses)
- **Not Gemini truncating the reply.** We added `outputAudioTranscription` (a real word-for-word transcript of what Gemini actually generated/spoke) and captured several crash instances where the transcript is a complete, grammatical sentence — Gemini finished generating fine.
- **Not a "token budget" cap.** An earlier theory (500-700 token / ~20s hard limit) was checked against official Gemini Live docs and disproved.
- **The actual mechanism: the ESP32's TCP connection to the backend gets reset.** Backend logs show `CLIENT ERROR: read ECONNRESET` — the *device* is resetting the connection, not Gemini and not the backend. This has now been caught happening in three different timing patterns: right at the very end of a complete reply, several seconds *after* a reply already finished (idle), and once mid-generation (the only case where the transcript itself was also cut short).
- **Not a device reboot/crash.** The device reconnects again within single-digit-to-~20 milliseconds every time — far too fast for a real reboot (WiFi reassociation alone takes much longer). We added `esp_reset_reason()` telemetry, which reports *why the chip last actually restarted* and survives real resets (brownout, panic, watchdog). It has shown the identical value across every reconnect, crashed or not — conclusively ruling out an actual chip-level reset.
- **Not weak WiFi signal.** RSSI stays in a normal, healthy range (-34 to -42) with no correlation to when crashes happen.
- **Heap is the live lead.** We added tracking for both total free heap and internal-RAM-only free heap (PSRAM is a separate pool on this board, so this rules out PSRAM masking a real internal-RAM problem). Across a burst of 5 rapid reconnects in ~90 seconds, internal RAM dropped by a real, measurable ~7KB — and the 4th and 5th reconnects in that exact burst were the two that crashed. This is currently the strongest, most concrete lead: something in the reconnect path appears to leak a small amount of internal RAM per reconnect, and enough of that accumulating destabilizes the TCP/WiFi link.
- **Reproducible on demand now.** This is the biggest practical break: hammering the "Play personality demo" button on the settings screen (which forces a full reconnect every press) reliably triggers the crash within a handful of presses — far more reliably than waiting for it to happen randomly during real wake-word conversations.

## What's still unknown
- *Exactly* what's leaking per reconnect — candidates are WiFiClient's internal buffers not being fully released by `tcpClient.stop()`/`connect()`, ArduinoJson allocations in the setup handshake, or something inside the WiFi/lwIP driver itself.
- Why it manifests specifically as a TCP reset rather than some other failure mode.

## Fixed this session (side-effects, not the root cause)
1. `audioStreamEnd` now sent correctly when an input stream is abandoned (a real Gemini Live API correctness gap, found while investigating).
2. Device now flushes its local audio-playback queue and mutes the speaker the instant a disconnect is detected — previously, audio already buffered from a now-dead conversation could keep playing after the crash and bleed into whatever came next (the "snippet of another conversation" symptom).
3. The voice/personality preview flow now cleanly aborts instead of getting stuck if a crash happens mid-preview.
4. A race where a voice-change preview could get silently dropped by a quick Play tap is fixed.

None of these fix the underlying leak — they just stop it from producing confusing secondary symptoms.

## What's being logged, and where
- `pdf-knowledge-base/server/audio_captures/debug.log` — one always-on log, every connection writes here regardless of outcome.
- `pdf-knowledge-base/server/audio_captures/<timestamp>_hardware/` — a folder is created **only** for a connection that had a real spoken interaction, containing `audio.wav` (Gemini's actual audio), `mic.wav`, `audio_spoken.txt` (the real transcript — ground truth for what was actually said), and that connection's own log slice.
- Per-connection log lines worth checking: `CLIENT CONNECTED/CLOSED/ERROR`, `GEMINI CLOSE` (with `connectionAliveMs` and `msSinceOwnAudioAtClose`), `heartbeat` every 5s (`heap`, `minHeap`, `rssi`, `intHeap`, `intMin`), and `boot_reset_reason` on every reconnect.

## Recommended next step
Another burst of 8-10 rapid Play presses would give more heap data points to confirm whether the decline is a steady per-reconnect leak or something threshold-triggered — that's what will actually pin down where in the reconnect path to look.
