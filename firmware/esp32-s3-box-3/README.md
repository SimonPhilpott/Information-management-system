# IMS ESP32-S3-BOX-3 / BOX-3B Voice Terminal Firmware

Bidirectional PCM streaming firmware for the Espressif ESP32-S3-BOX-3 and BOX-3B connecting directly to the Information Management System (IMS) Gemini Live proxy.

---

## 1. Directory Overview

| File / Folder | Purpose |
|---|---|
| `bin/` | **Pre-compiled firmware binaries** (includes `firmware.factory.bin` and `firmware.bin`) |
| `build-and-flash.bat` | One-click Windows script to build from source via PlatformIO, upload to device, and refresh `bin/` |
| `flash-binary.bat` | One-click Windows script to flash pre-compiled `bin/firmware.factory.bin` directly via `esptool` |
| `src/main.cpp` | Complete application source (LovyanGFX UI, dual I2S audio tasks, PSRAM queue, VAD) |
| `include/config.h` | Pinout definitions, audio configuration, and network endpoints |
| `include/secrets.h` | Local Wi-Fi credentials (`WIFI_SSID`, `WIFI_PASSWORD` - gitignored) |
| `include/secrets.h.example` | Template for creating `secrets.h` |
| `platformio.ini` | PlatformIO configuration (Espressif 32 55.3.311 / Arduino 3.3.11 with Octal PSRAM) |

---

## 2. Hardware Architecture

- **Microcontroller**: ESP32-S3 (240MHz dual-core Xtensa LX7, 16MB Flash, 8MB/16MB Octal PSRAM).
- **Display**: 2.4-inch 320x240 LCD (ILI9342 SPI2_HOST, CS=GPIO5, DC=GPIO4, MOSI=GPIO6, SCLK=GPIO7, BL=GPIO47).
- **Touch Controller**: Capacitive Touch (GT911 on I2C_NUM_0, SDA=GPIO8, SCL=GPIO18, INT=GPIO3).
- **Microphone ADC**: Everest Semi ES7210 dual ADC (I2C addr `0x40`, shared I2S master clock MCLK=GPIO2, BCLK=GPIO17, WS=GPIO45, DIN=GPIO16).
- **Speaker DAC**: Everest Semi ES8311 mono DAC (I2C addr `0x18`, shared I2S bus, DOUT=GPIO15).
- **Audio Power Amp**: NS4150B Class-D amplifier enabled via `PA_ENABLE_PIN = GPIO46` with pre-warming during thinking states.

---

## 3. Pre-Compiled Binaries in `bin/`

The `bin/` folder contains ready-to-flash binaries:

1. **`bin/firmware.factory.bin`** (Offset `0x0`):
   - Merged factory image containing `bootloader.bin` (0x0), `partitions.bin` (0x8000), `boot_app0.bin` (0xe000), and `firmware.bin` (0x10000).
   - Can be flashed to any fresh or bricked ESP32-S3-BOX-3 with a single write command:
     ```cmd
     flash-binary.bat
     ```
     Or manually:
     ```cmd
     esptool.py --chip esp32s3 write_flash -z 0x0 bin\firmware.factory.bin
     ```

2. **`bin/firmware.bin`** (Offset `0x10000`):
   - Application image for OTA or standard application upload.

---

## 4. How to Build & Flash from Source

1. **Configure Wi-Fi**:
   - Copy `include/secrets.h.example` to `include/secrets.h` (if not already created):
     ```cmd
     copy include\secrets.h.example include\secrets.h
     ```
   - Open `include/secrets.h` and enter your 2.4GHz Wi-Fi credentials.

2. **Flash with One Click**:
   - Plug the ESP32-S3-BOX-3 into your PC via USB-C.
   - Double-click or run:
     ```cmd
     build-and-flash.bat
     ```
   - The script will automatically invoke PlatformIO, upload to COM3, and update `bin/` with the freshly built binaries.

---

## 5. Audio & VAD Invariants

- **256-Chunk PSRAM Playback Queue**:
  - Allocated dynamically with `ps_malloc` in PSRAM, storing up to ~8.2 seconds of 16kHz audio buffer.
  - Prevents buffer overflow and clipping when Gemini Live sends synthesis frames in high-speed TCP bursts.
- **Calibrated Hysteresis VAD**:
  - `VOICE_SPEECH_THRESHOLD = 350` (user speech is typically RMS 1000–2000+).
  - `VOICE_SILENCE_THRESHOLD = 250` (ambient room noise floor is RMS 75–130).
  - Automatically transitions to `THINKING` after 900ms of silence following speech.
- **Tap-to-Send**:
  - Screen tap or top button press during `STATE_LISTENING` completes the turn immediately.
- **Decoupled PA Warmup**:
  - `PA_ENABLE_PIN` (GPIO46) is raised non-blocking when entering `STATE_THINKING` so the NS4150B exits shutdown during Gemini's 1–3s inference time, completely eliminating audio latency and Core 1 stalling.
