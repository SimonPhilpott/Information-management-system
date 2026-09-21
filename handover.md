# ESP32-S3-BOX-3B Microphone Investigation — Handover

Written as a handover document (e.g. to hand to another AI model or engineer) summarizing an extended debugging session into a persistent microphone quality issue on an ESP32-S3-BOX-3B hardware voice terminal. The mic hardware itself is proven working; something in software/configuration is not.

## Git context

- Repo root: `D:\Information management system`
- Working branch for this investigation: `esp32-i2s-std-migration`
- Stable backup branch (last known-good pre-i2s_std-migration state): `ESP32-S3-BOX-3B` (pushed to `https://github.com/SimonPhilpott/Information-management-system`)

---

## 1. Hardware facts (confirmed)

- Board: ESP32-S3-BOX-3B (ESP32-S3-WROOM-1, 16MB flash, 8MB octal PSRAM)
- ES7210 dual-mic ADC at I2C address **0x40**
- ES8311 speaker DAC at I2C address **0x18**
- Shared I2C0 bus: SDA=**GPIO8**, SCL=**GPIO18** (also used by GT911 touch controller at 0x5D/0x14)
- Shared I2S bus: MCLK=**GPIO2**, BCLK=**GPIO17**, WS/LRCLK=**GPIO45** (an ESP32-S3 strapping pin — needs `ignore_strapping_warning` in ESPHome, or just care in raw ESP-IDF), DOUT (to ES8311)=**GPIO15**, DIN (from ES7210)=**GPIO16**
- Speaker amp enable: **GPIO46**
- **Mic hardware is confirmed physically functional** — verified twice (most recently after all other testing in this session) via Espressif's own closed factory test firmware, which records and plays back clean audio from both L and R mic channels. This rules out a hardware fault on this specific unit.
- Speaker output is separately confirmed clean and working in our own firmware (clean chime + TTS playback).

---

## 2. Firmware projects — paths and status

### 2a. Main production firmware ("Gemini Live" voice terminal)
Streams mic audio directly to Google Gemini Live API over raw TCP to a Node.js backend, plays Gemini's reply audio back through the speaker.

- **Path**: `D:\Information management system\firmware\esp32-s3-box-3\`
  - `platformio.ini`
  - `src\main.cpp`
  - `include\config.h`
  - `include\secrets.h` (gitignored — real WiFi creds; `include\secrets.h.example` is the committed template)
- Framework: Arduino via PlatformIO, ESP-IDF 5.5.5 (via the `pioarduino` community fork of `platform-espressif32`, since the official PlatformIO `espressif32` registry entry is frozen on ESP-IDF 4.4, too old for `i2s_std`/`i2s_tdm`)
- Uses `driver/i2s_std.h`, mono, `I2S_SLOT_MODE_MONO`, `I2S_STD_SLOT_LEFT`, 16kHz native
- **Symptom**: real audio, correctly timed with speech, but a low-level modulated tone/static rides underneath it during quiet stretches. Spectral analysis of quiet segments shows a fundamental around ~500Hz (sometimes ~1000Hz) with sidebands roughly ±10-20Hz around each harmonic — amplitude-modulated, not a fixed tone.

### 2b. Isolated minimal test firmware (built to eliminate all other complexity)
- **Path**: `D:\Information management system\firmware\esp32-s3-box-3-mictest\`
  - `src\main.cpp`
  - `capture_wav.py` (PC-side script: reads a `WAVDUMP1`-framed serial dump, saves a real `.wav`)
- No WiFi, TCP, display, or touch — just I2C codec bring-up (plain Arduino `Wire`, not LovyanGFX's I2C driver) + I2S capture/playback + serial dump
- **Symptom**: **exact zero** samples (rms=0, peak=0) on every recording, regardless of codec register configuration or I2S mode (see section 3). Double-verified as a genuine capture failure:
  - Pre-filled the buffer with a known pattern (`0x5A5A`) before recording — reliably overwritten, proving `i2s_channel_read()` really writes fresh DMA data
  - Computed RMS on the in-memory buffer *before* any serial transmission — still exact zero, ruling out a transmission-path bug

### 2c. PlatformIO + ESP-IDF attempt using the real `espressif/esp-box-3` + `esp_codec_dev` components (BLOCKED — build tooling bug)
- **Path**: `D:\Information management system\firmware\esp32-s3-box-3-official-mictest\` (also copied to `C:\esp-idf-mictest\` to work around a separate "whitespace in project path" fatal error from ESP-IDF's own tooling)
- Uses `idf_component.yml` to pull `espressif/esp-box-3` (v3.2.0) as a real dependency, calling `bsp_audio_codec_microphone_init()`/`esp_codec_dev_read()` directly — no hand-transcribed registers
- **Blocked by**: a reproducible SCons packaging bug in `pioarduino`'s ESP-IDF integration on Windows: `ModuleNotFoundError: No module named 'SCons.Tool.FortranCommon'` during final compile, even after clearing/reinstalling cached SCons packages

### 2d. Raw `idf.py` attempt, same real components, bypassing PlatformIO entirely (BLOCKED — environment mismatch)
- **Path**: `C:\esp-idf-native-mictest\`
- Same `main.c` design as 2c, built via ESP-IDF's own `idf.py` directly (not PlatformIO), reusing the real ESP-IDF 5.5.5 checkout that ESPHome downloaded at `C:\Users\sideb\AppData\Local\esphome\Cache\idf\frameworks\5.5.5\` and its Python venv at `C:\Users\sideb\AppData\Local\esphome\Cache\idf\penvs\5.5.5\Scripts\python.exe`
- **Blocked by**: `idf.py` internally re-validates against the *standard* ESP-IDF install path (`C:\Users\<user>\.espressif\python_env\idf5.5_py3.12_env\Scripts\python.exe`) regardless of which Python actually launches the script. ESPHome manages its own separate venv location via its own internal orchestration, not the standard `export.ps1`/`idf_tools.py` flow, so the two are incompatible without a full, separate, standard ESP-IDF installation via the official installer (not yet done).

### 2e. Real-world reference firmware (built and flashed successfully via ESPHome — inconclusive result)
- **Path**: `C:\esphome-va-test\` (cloned from GitHub, see links below)
- A real, currently-used ESP32-S3-BOX-3 voice assistant project using a third-party `esp_audio_stack`/`esp_aec` component set that wraps `esp_codec_dev` directly with genuine 4-slot TDM and hardware AEC (DAC-loopback reference on slot 1)
- Built and flashed successfully via ESPHome's own CMake+Ninja pipeline (not PlatformIO)
- Live logs confirmed: `TDM mode: 4 slots, mic_slot=0, ref_slot=1, mask=0xf`, `esp_codec_dev backend ready (rx_codec=ES7210, tx_codec=ES8311)`, WiFi connected, real Home Assistant instance connected, wake word engine reached `DETECTING_WAKE_WORD` — no errors during init
- **Symptom**: none of the three configured wake words ("Alexa", "Okay Nabu", "Hey Jarvis") trigger a response at normal volume/distance. **Inconclusive** — `micro_wake_word` only logs actual detections, not per-frame audio levels, so we can't yet distinguish "mic audio is bad" from "gain/threshold needs tuning" from this log stream alone. Did not modify their config to add verbose per-frame RMS logging (would need another ~10+ minute ESPHome recompile).

### 2f. Espressif's official closed factory test firmware (WORKS — the one confirmed-good reference)
- **Path**: `D:\Information management system\esp32_s3_box_3_factory_test_firmware.bin\esp32_s3_box_3_factory_test_firmware.bin` (also `D:\Information management system\esp32_s3_box_3_factory_test_firmware.bin.zip`)
- Flash with: `esptool.py --chip esp32s3 --port COM3 --baud 921600 write_flash 0x0 <path>`
- Closed binary, no source, but string extraction from the binary shows it uses `i2s_std` + `i2s_new_channel` + `es7210_codec_new`/`es8311_codec_new` (i.e. `esp_codec_dev`), and its embedded debug-string paths literally reference `./components/esp-box-3/esp-box-3.c` / `esp-box-3_idf5.c`
- **Confirmed working twice**: clean recording and playback from both L and R mic channels

---

## 3. ES7210 register configurations tried in the isolated test firmware (2b) — all produced exact zero

### Lineage 1 — `esp_codec_dev` (Espressif's newer codec framework)
```
0x40,0x00,0xFF (reset) → delay 20ms → 0x40,0x00,0x41 (release)
0x40,0x01,0x3F  (clock off)
0x40,0x09,0x30 / 0x40,0x0A,0x30  (time control)
0x40,0x23,0x2A / 0x40,0x22,0x0A / 0x40,0x20,0x0A / 0x40,0x21,0x2A  (HPF)
0x40,0x08,0x00  (slave/secondary mode)
0x40,0x11,0x60  (SDP interface: I2S format, 16-bit — bits[7:5]=011 width, bits[1:0]=00 format)
0x40,0x40,0x43  (analog power)
0x40,0x41,0x70 / 0x40,0x42,0x70  (mic bias 2.87V)
0x40,0x07,0x20  (OSR)
0x40,0x02,0xC1  (mainclk: adc_div=1|doubler<<6|dll<<7, for {mclk=4096000,lrck=16000})
0x40,0x04,0x01 / 0x40,0x05,0x00  (LRCK divider)
0x40,0x12,0x00  (non-TDM)
mic1/mic2 gain+enable: clear gain regs 0x43-0x46=0x00, power 0x4B/0x4C=0xFF, then per-mic:
  clear CLOCK_OFF_REG01 bits 0x0B (0x3F & ~0x0B = 0x34), 0x4B=0x00, gain reg = 0x1A (enable|30dB)
```
Never writes registers 0x47-0x4A (individual mic power) or 0x06 (DLL powerdown) during init; never revisits register 0x00 after the initial reset.

### Lineage 2 — ESPHome's own real, currently-shipping driver
Differs from lineage 1:
- Second reset write is **0x32**, not 0x41
- Analog power register is **0xC3**, not 0x43
- **Does** write individual mic power registers 0x47-0x4A = 0x08 each
- **Does** write 0x06=0x04 (DLL powerdown) during setup, not only shutdown
- Final mic power state is 0x4B/0x4C=**0x0F** (not 0x00)
- Has a final "enable device" step: 0x00=0x71 then 0x00=0x41

### Lineage 3 — TDM variant (matching a real published full-duplex config)
Same as lineage 2, but all 4 mic channels enabled (`mic_selected: 0x0F`), which per official driver logic (`mic_num >= 3` triggers TDM) forces `SDP_INTERFACE2_REG12 = 0x02`, and the ESP32 I2S peripheral switched from `i2s_std` to **`i2s_tdm`** (`driver/i2s_tdm.h`), 4 slots, reading slot 0, at **48kHz native** (not 16kHz), `slot_bit_width=16`.

All three were verified via I2C read-back after writing (registers held the intended values) and all still produced exact-zero audio in the isolated firmware.

---

## 4. Everything else ruled out (isolated firmware, each tested individually, no effect)
- TX priming write (writing to speaker once before first mic read)
- Continuous I2S draining while idle vs. idle-until-triggered
- `pinMode(GPIO_NUM_48, INPUT_PULLUP)`
- Record buffer in PSRAM vs internal SRAM
- ESP-IDF's documented "adjacent samples need to be swapped" erratum for 16-bit I2S STD mono mode (per ESPHome's own driver comment)
- Register 0x11 as read-modify-write (preserving unknown bits) vs blind overwrite
- I2S communication format variants (standard vs left-justified), gain sweeps (12/24/30/37.5dB), L vs R slot selection, RX-only duplex mode, hardware mute circuit — all ruled out earlier in the session against the main firmware specifically
- A genuine ESP32-S3 native-USB-CDC serial-blocking bug was found and fixed along the way (`Serial.setTxTimeoutMs(0)` needed to stop `audioMicTask()` stalling) — unrelated to audio quality itself, but was masking true results for a while

---

## 5. Build/tooling problems encountered (separate from the audio issue, but needed to reproduce any of this)

1. **PlatformIO + Arduino framework**: works reliably, but requires enabling Windows long paths (`LongPathsEnabled` registry key) and setting `PYTHONIOENCODING=utf-8` before every `platformio run --target upload` (otherwise PlatformIO's progress-bar Unicode characters crash its output thread on Windows' default cp1252 console codepage, deadlocking the esptool subprocess via an undrained stdout pipe — looks exactly like a hung flash).
2. **PlatformIO + ESP-IDF framework**: reproducible SCons bug (`ModuleNotFoundError: No module named 'SCons.Tool.FortranCommon'`), see 2c.
3. **ESP-IDF tooling refuses to run under Git Bash/MSYS**: `ERROR: MSys/Mingw is not supported.` — must use native PowerShell/cmd for anything ESP-IDF-related.
4. **ESPHome** (`pip install --user esphome` — plain `pip install esphome` fails on a permissions error writing to the system Python's `Scripts` folder): built and flashed the real community project (2e) successfully via native CMake+Ninja (no SCons), proving raw ESP-IDF builds work fine on this machine via PowerShell.
5. **Reusing ESPHome's cached ESP-IDF via raw `idf.py`**: environment mismatch, see 2d.

---

## 6. Other project files
- Backend server (captures mic audio to WAV, hosts the Gemini Live proxy): `D:\Information management system\pdf-knowledge-base\server\index.js`
  - Raw TCP hardware endpoint: port 3002
  - Debug mic-upload HTTP endpoint (added for TDM testing): port 3003, `/debug-mic-upload`
- All mic capture WAVs: `D:\Information management system\pdf-knowledge-base\server\audio_captures\`
- A separately-downloaded copy of the ESPHome `wake-word-voice-assistants` repo: `D:\Information management system\wake-word-voice-assistants-26.6.1\`

---

## 7. Links used for guidance / reference source

- **Espressif official BSP source** (esp-box-3, the authoritative board support package): https://github.com/espressif/esp-bsp — specifically `bsp/esp-box-3/esp-box-3_idf5.c`, `bsp/esp-box-3/idf_component.yml`
- **ESP Component Registry** entries: https://components.espressif.com/components/espressif/esp-box-3 and https://components.espressif.com/components/espressif/esp_codec_dev
- **Espressif hardware overview docs**: https://github.com/espressif/esp-box/blob/master/docs/hardware_overview/esp32_s3_box_3/hardware_overview_for_box_3.md
- **ESPHome core repo** (source of the real, currently-shipping `es7210` component): https://github.com/esphome/esphome — specifically `esphome/components/es7210/es7210.cpp`, `es7210_const.h`
- **ESPHome wake-word-voice-assistants repo** (reference `esp32-s3-box-3.yaml`/`.factory.yaml`): https://github.com/esphome/wake-word-voice-assistants
- **ESPHome developer docs** (checked, found to be contributor/architecture docs only — not directly useful for this hardware issue): https://developers.esphome.io/ and https://github.com/esphome/developers.esphome.io
- **maxi1134's full-duplex AEC config** (documents TDM slot ordering MIC1,MIC3,MIC2,MIC4 and the DAC-loopback AEC reference on slot 1, measured on real hardware): https://github.com/maxi1134/Home-Assistant-Config/blob/master/esphome/templates/ESP32-S3-BOX-3/maxi_assistants_main_code_full_cloud.yaml
- **esphome-audio-stack component** (the `esp_audio_stack`/`esp_aec` external components used by both community configs above): https://github.com/n-IA-hane/esphome-audio-stack
- **esphome-intercom component** (referenced alongside the above, for the media-player/speaker fork): https://github.com/n-IA-hane/esphome-intercom
- **MichalZaniewicz's ESP32-S3-BOX-3 voice assistant** (cloned and built, see 2e): https://github.com/MichalZaniewicz/esphome-esp32-s3-box-3-va
- **pioarduino platform-espressif32** (community fork used for all PlatformIO builds, since the official one is frozen on ESP-IDF 4.4): https://github.com/pioarduino/platform-espressif32
- **Reddit thread that led to the maxi1134/n-IA-hane discovery** ("ESP32-S3-Box-3 Owners rejoice! Audio Duplex..."): https://www.reddit.com/r/Esphome/comments/1u3w9jh/esp32s3box3_owners_rejoice_audio_duplex_stop_halt/ (could not be fetched directly — Reddit blocks automated access — but its content was manually copied into this session)

---

## 8. Open question for a fresh perspective

Given the mic hardware is proven functional, and three independently-sourced, verified-correct ES7210 register configurations have been matched exactly (confirmed via I2C read-back) in a maximally simplified isolated test firmware with no other peripherals active — yet still produce exact-zero captured audio in every case — what could cause genuinely zero DMA-captured samples despite (a) correct codec register state, (b) confirmed I2S read calls actually writing fresh data into the buffer, and (c) working hardware?

Candidates not yet tested:
- MCLK signal integrity/precision at the ESP32 pin itself (no oscilloscope available)
- A possible required delay or additional init step between codec configuration and first I2S read that no register-level reference documents
- Something specific to how `i2s_new_channel()`/`i2s_channel_enable()` interacts with a shared TX+RX full-duplex channel pair when created via Arduino's `driver/i2s_std.h`/`driver/i2s_tdm.h` wrapper specifically, as opposed to ESP-IDF's own component-manager `esp_codec_dev`/`bsp_audio_init()` call path (which could not be tested directly due to the build tooling issues in section 5)
