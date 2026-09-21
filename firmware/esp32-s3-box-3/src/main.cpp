/**
 * IMS ESP32-S3-BOX-3 Hardware Conversational Terminal
 * Bidirectional PCM Streaming Client for Gemini Live via IMS Proxy
 */

#include "config.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <cstring>
#include <driver/i2c.h> // for the I2C_NUM_0 port-number type only
// Migrated from the legacy driver/i2s.h (deprecated, and only capable of a
// software channel-select "fake mono" over a physically stereo frame) to
// the newer channel-based i2s_std driver, which supports a genuine hardware
// I2S_SLOT_MODE_MONO - matching Espressif's own validated ESP32-S3-BOX-3
// BSP (espressif/esp-bsp, bsp/esp-box-3/esp-box-3_idf5.c) exactly, after
// their factory test firmware proved the mic hardware itself is fine and
// our own legacy-driver mic capture was still full of static.
#include <driver/i2s_std.h>

#define LGFX_USE_V1
#include <LovyanGFX.hpp>

class LGFX_BOX3 : public lgfx::LGFX_Device {
  lgfx::Panel_ILI9342 _panel_instance;
  lgfx::Bus_SPI       _bus_instance;
  lgfx::Light_PWM     _light_instance;
  lgfx::Touch_GT911   _touch_instance;

public:
  LGFX_BOX3(void) {
    // Pin assignments below are taken directly from LovyanGFX's own built-in
    // board_ESP32_S3_BOX_V3 autodetect profile (lgfx/v1_autodetect/
    // LGFX_AutoDetect_ESP32_all.hpp), which is the authoritative, validated
    // config for this exact board - NOT the values from config.h, which
    // turned out to be wrong for RST/backlight and caused a permanent white
    // screen (backlight pin was wrong, and GPIO48 isn't a reset line at all).
    {
      auto cfg = _bus_instance.config();
      cfg.spi_host = SPI2_HOST;
      cfg.spi_mode = 0;
      cfg.freq_write = 40000000;
      cfg.freq_read  = 16000000;
      cfg.spi_3wire  = true;
      cfg.use_lock   = true;
      cfg.pin_sclk = GPIO_NUM_7;
      cfg.pin_mosi = GPIO_NUM_6;
      cfg.pin_miso = -1; // Not wired on this board
      cfg.pin_dc   = GPIO_NUM_4;
      _bus_instance.config(cfg);
      _panel_instance.setBus(&_bus_instance);
    }
    {
      auto cfg = _panel_instance.config();
      cfg.pin_cs           = GPIO_NUM_5;
      cfg.pin_rst          = -1; // No dedicated LCD reset line on this board -
                                  // GPIO48 is NOT the panel RST pin. It's left
                                  // as input_pullup in setup() instead.
      cfg.pin_busy         = -1;
      cfg.panel_width      = 320;
      cfg.panel_height     = 240;
      cfg.offset_x         = 0;
      cfg.offset_y         = 0;
      cfg.offset_rotation  = 1;
      cfg.dummy_read_pixel = 8;
      cfg.dummy_read_bits  = 1;
      cfg.readable         = false; // No MISO wired
      cfg.invert           = false;
      cfg.rgb_order        = false;
      cfg.dlen_16bit       = false;
      cfg.bus_shared       = false;
      _panel_instance.config(cfg);
    }
    {
      auto cfg = _light_instance.config();
      cfg.pin_bl = GPIO_NUM_47; // NOT GPIO45 - that was the bug
      cfg.invert = false;
      cfg.freq   = 12000;
      cfg.pwm_channel = 7;
      _light_instance.config(cfg);
      _panel_instance.setLight(&_light_instance);
    }
    {
      auto cfg = _touch_instance.config();
      cfg.x_min      = 0;
      cfg.x_max      = 319;
      cfg.y_min      = 0;
      cfg.y_max      = 279; // 239 + 40px for the touch panel's active area
                             // extending below the visible LCD region
      cfg.pin_int    = GPIO_NUM_3;
      cfg.bus_shared = false;
      cfg.offset_rotation = 2;
      cfg.i2c_port   = I2C_NUM_0;
      cfg.i2c_addr   = 0x14;
      cfg.pin_sda    = GPIO_NUM_8;
      cfg.pin_scl    = GPIO_NUM_18;
      cfg.freq       = 400000;
      _touch_instance.config(cfg);
      _panel_instance.setTouch(&_touch_instance);
    }
    setPanel(&_panel_instance);
  }
};

static LGFX_BOX3 tft;

// System States
enum TerminalState {
  STATE_CONNECTING_WIFI,
  STATE_CONNECTING_SERVER,
  STATE_STANDBY,   // Idle, waiting for a screen tap or button press
  STATE_LISTENING, // Active full-duplex session
  STATE_THINKING,
  STATE_SPEAKING
};

volatile TerminalState currentState = STATE_CONNECTING_WIFI;
TerminalState lastRenderedState = (TerminalState)-1;
// i2s_std channel handles (see initAudioHardware()) - separate TX/RX handles
// even though they share one physical I2S peripheral/clock, matching
// Espressif's own BSP pattern (one i2s_new_channel() call returns both).
i2s_chan_handle_t i2sTxChan = NULL;
i2s_chan_handle_t i2sRxChan = NULL;
// Raw TCP, not WebSocket - see config.h for why. Speaks the same simple
// framed protocol as the ESPHome ims_bridge component and the backend's
// HardwareTcpClient shim: [1 byte type][4 bytes big-endian length][payload].
WiFiClient tcpClient;
bool wasConnected = false; // detects the connect/disconnect edge in loop()
bool isSetupAcknowledged = false;
volatile bool geminiSetupComplete =
    false; // Set true only after Gemini sends setupComplete ACK
String lastTranscript = "Tap screen to ask a question";
// volatile: written by beginListening()/audioMicTask() on Core 1 and Core 0
// respectively, read from both - a plain unsigned long here let a stale
// cached value on one core survive well past a fresh beginListening() reset
// on the other, which was firing the silence-detected turnComplete logic
// (below) within ~100ms of a touch instead of the intended 1.2s+.
volatile unsigned long lastSpeechTimestamp = 0;
// Reset by beginListening() at the start of every session so a session
// aborted mid-flight (e.g. by a Gemini-side disconnect) can never leave
// isSpeakingDetected/speechStartTime stale for the NEXT session - audioMicTask
// used to own these as function-local variables that persisted for the whole
// device uptime, so a leftover "already speaking, already 1.2s in" state from
// an interrupted prior session could trip an instant bogus turn-complete on
// the very next tap.
volatile bool isSpeakingDetected = false;
volatile unsigned long speechStartTime = 0;
const unsigned long SESSION_IDLE_TIMEOUT_MS = 14000;
bool textQuerySentOnce = false; // Mic-free "Hi, how are you" diagnostic, once per boot

// Live mic RMS level, written every buffer by audioMicTask (Core 0) and read
// by renderScreen() (Core 1) to pulse the status orb while LISTENING - a
// single int read/write like this doesn't need a lock for an approximate,
// display-only value. Only meaningful while currentState == STATE_LISTENING.
volatile int currentMicRms = 0;

// Gates whether audioMicTask actually streams mic audio to the backend -
// deliberately NOT the same thing as currentState == STATE_LISTENING.
// Gemini's server-side VAD needs to observe the real trailing silence in a
// CONTINUOUS audio stream to detect end-of-speech and start responding on
// its own; cutting the stream off the instant our own local RMS-based
// silence timer fires (the previous design) denied it that, and Gemini
// just hung waiting for either more audio or a turn-completion signal that
// never correctly arrived. Now the display can show "Thinking..." (cosmetic
// only) while this stays true and audio keeps flowing, right up until
// Gemini's own response actually starts arriving.
volatile bool micStreamingActive = false;


// Audio Queue: Core 0 (audioMicTask) produces mic chunks, Core 1 (loop) is the
// ONLY task that ever touches tcpClient or tft, since neither a raw socket
// nor LovyanGFX is safe to call concurrently from two FreeRTOS tasks/cores.
struct AudioChunkMsg {
  uint8_t data[AUDIO_CHUNK_SAMPLES * sizeof(int16_t)];
  size_t len;
};
// Playback queue message: stereo 16-bit PCM chunks produced by handleFrame()
// on Core 1 and consumed by audioPlaybackTask() on Core 0. Using a queue
// (not a direct i2s_channel_write from handleFrame) is critical: calling
// i2s_channel_write with portMAX_DELAY on Core 1 blocked loop() entirely,
// which starved the TCP socket and caused the server to disconnect mid-reply.
// The struct holds one AUDIO_CHUNK_SAMPLES-sized stereo chunk; larger frames
// are split into multiple messages before queuing.
struct PlaybackChunkMsg {
  uint8_t data[AUDIO_CHUNK_SAMPLES * 2 * sizeof(int16_t)]; // stereo
  size_t len;
};
enum ControlEvent { EVT_TURN_COMPLETE };

// Debug telemetry sent over the existing WebSocket to the backend (which
// just logs and drops it) - live serial monitoring on this board resets it
// on every COM port open, making timed physical tests impossible to observe
// live. The backend log persists and can be checked at any time instead.
struct DebugMsg {
  char text[80];
};

QueueHandle_t audioOutQueue = NULL;
QueueHandle_t controlEventQueue = NULL;
QueueHandle_t debugQueue = NULL;
QueueHandle_t audioPlaybackQueue = NULL; // Core 1 -> Core 0 speaker audio

void renderScreen(bool forceRedraw = false) {
  if (!forceRedraw && currentState == lastRenderedState)
    return;
  lastRenderedState = currentState;

  tft.startWrite();
  // Clear entire 320x240 frame buffer with dark theme background
  tft.fillScreen(tft.color565(11, 14, 21));

  // Header bar
  tft.fillRect(0, 0, 320, 34, tft.color565(20, 24, 34));
  tft.setTextColor(tft.color565(140, 150, 175));
  tft.setTextSize(1);
  tft.drawString("IMS INTELLIGENCE TERMINAL", 10, 11);

  if (WiFi.status() == WL_CONNECTED) {
    tft.fillCircle(285, 17, 4, tft.color565(46, 213, 115));
    tft.drawString("WIFI", 295, 11);
  } else {
    tft.fillCircle(285, 17, 4, tft.color565(255, 71, 87));
    tft.drawString("DISC", 295, 11);
  }

  // Main Body Background
  tft.fillRect(0, 34, 320, 170, tft.color565(11, 14, 21));

  // Status Pill and Waveform area
  uint32_t statusColor;
  const char *statusText;
  switch (currentState) {
  case STATE_CONNECTING_WIFI:
    statusColor = tft.color565(255, 165, 2);
    statusText = "CONNECTING WI-FI...";
    break;
  case STATE_CONNECTING_SERVER:
    statusColor = tft.color565(255, 165, 2);
    statusText = "CONNECTING IMS BACKEND...";
    break;
  case STATE_STANDBY:
    statusColor = tft.color565(87, 101, 116);
    statusText = "TAP SCREEN TO TALK";
    break;
  case STATE_LISTENING:
    statusColor = tft.color565(46, 213, 115);
    statusText = "LISTENING...";
    break;
  case STATE_THINKING:
    statusColor = tft.color565(112, 161, 255);
    statusText = "GEMINI THINKING...";
    break;
  case STATE_SPEAKING:
    statusColor = tft.color565(165, 94, 234);
    statusText = "SPEAKING";
    break;
  default:
    statusColor = tft.color565(255, 255, 255);
    statusText = "ONLINE";
    break;
  }

  // State Orb - while LISTENING, the outer ring's radius tracks the live
  // mic RMS level so you can visually confirm the mic is actually picking
  // up sound (vs. just trusting the state label), which is exactly the
  // ambiguity that made the silent-mic bug hard to diagnose from the
  // screen alone. currentMicRms is only meaningful during LISTENING.
  tft.fillCircle(160, 85, 28, statusColor);
  if (currentState == STATE_LISTENING) {
    int pulse = currentMicRms / 4;
    if (pulse > 22) pulse = 22;
    tft.drawCircle(160, 85, 34 + pulse, tft.color565(46, 213, 115));
  } else {
    tft.drawCircle(160, 85, 34, tft.color565(50, 60, 80));
  }
  tft.drawCircle(160, 85, 40, tft.color565(30, 40, 60));

  // Status Label
  tft.setTextColor(statusColor);
  tft.setTextDatum(top_center);
  tft.drawString(statusText, 160, 130);

  // Transcript Box
  tft.setTextDatum(top_left);
  tft.setTextColor(tft.color565(200, 214, 229));
  tft.fillRect(10, 155, 300, 42, tft.color565(18, 22, 32));
  tft.drawRect(10, 155, 300, 42, tft.color565(40, 50, 70));
  String displayMsg = lastTranscript;
  if (displayMsg.length() > 38) {
    displayMsg = displayMsg.substring(0, 35) + "...";
  }
  tft.drawString(displayMsg.c_str(), 18, 168);

  // Footer Bar
  tft.fillRect(0, 204, 320, 36, tft.color565(15, 18, 26));
  tft.setTextColor(tft.color565(100, 110, 130));
  if (currentState == STATE_STANDBY) {
    tft.drawString("Tap the screen to ask a question", 15, 214);
  } else {
    tft.drawString("Tap Screen to Interrupt / Sleep", 15, 214);
  }
  tft.endWrite();
}

// Redraws only the orb's own bounding box (not the whole 320x240 screen)
// so the mic-level pulse ring can animate every ~100ms without the visible
// full-screen flicker a repeated renderScreen(true) causes - fillScreen()
// there redraws the header, buttons, transcript box and footer every time,
// which over SPI is slow enough to see as flashing at that refresh rate.
void drawOrbPulse() {
  tft.startWrite();
  tft.fillRect(95, 20, 130, 130, tft.color565(11, 14, 21));
  tft.fillCircle(160, 85, 28, tft.color565(46, 213, 115));
  int pulse = currentMicRms / 4;
  if (pulse > 22) pulse = 22;
  tft.drawCircle(160, 85, 34 + pulse, tft.color565(46, 213, 115));
  tft.drawCircle(160, 85, 40, tft.color565(30, 40, 60));
  tft.endWrite();
}

// NOTE: LovyanGFX's Touch_GT911 driver already owns the I2C0 peripheral on
// GPIO8/GPIO18 (see LGFX_BOX3 touch config above), since the BOX-3 hardware
// wires the touch controller and both audio codecs onto the SAME physical
// I2C bus. THREE earlier attempts at sharing this bus all had real
// problems: calling Wire.begin() again double-installs the same peripheral
// (the original hang/crash bug); calling the legacy driver/i2c.h API
// (i2c_master_write_to_device) targets a completely different,
// never-installed driver stack that silently "succeeds" without touching
// real hardware; and calling Arduino's own i2cWrite()/i2cWriteReadNonStop()
// (esp32-hal-i2c.c) - which looked correct, since it's the function
// TwoWire::endTransmission() itself calls - turned out to ALSO silently
// no-op, because both gate on a `bus[i2c_num].initialized` flag that is
// PART OF ARDUINO'S OWN HAL bookkeeping, only ever set by Arduino's own
// i2cInit()/Wire.begin(). LovyanGFX initializes I2C0 through its own
// entirely separate internal driver (lgfx::i2c::init(), called from
// Touch_GT911's setup), which never touches that flag - so every register
// write silently failed the entire time, which is why mic capture kept
// returning a hard zero regardless of which registers we wrote or what
// values we used. Confirmed by reading registers back afterwards: every
// single one came back 0xFF (readCodecReg()'s own failure sentinel).
// lgfx::i2c::beginTransaction()/writeBytes()/readBytes()/endTransaction()
// (lgfx/v1/platforms/common.hpp) is LGFX's own public, port-indexed I2C API
// - the same one Bus_I2C and Touch_GT911 use internally - so calling it
// ourselves reuses the bus's real, already-correctly-initialized state.
// Uses LGFX's own bundled transactionWrite()/transactionWriteRead() helpers
// (same ones Touch_GT911 uses for its own register I/O) rather than manually
// sequencing beginTransaction/writeBytes/restart/readBytes/endTransaction -
// fewer steps to get wrong.
void writeCodecReg(uint8_t i2c_addr, uint8_t reg, uint8_t val) {
  uint8_t buf[2] = {reg, val};
  if (lgfx::i2c::transactionWrite(I2C_NUM_0, i2c_addr, buf, sizeof(buf), 100000)
          .has_error()) {
    Serial.printf("[Hardware] I2C write failed (addr=0x%02X reg=0x%02X)\n", i2c_addr, reg);
  }
}

// Reads back a register - used only for one-shot diagnostic verification
// that our writeCodecReg() calls actually stuck.
uint8_t readCodecReg(uint8_t i2c_addr, uint8_t reg) {
  uint8_t value = 0xFF;
  if (lgfx::i2c::transactionWriteRead(I2C_NUM_0, i2c_addr, &reg, 1, &value, 1, 100000)
          .has_error()) {
    return 0xFF;
  }
  return value;
}

// Speaker amplifier & DAC muting helper: disables Class-D PA and mutes ES8311 DAC
// during microphone capture to eliminate acoustic coupling and electrical switching ripple.
void setSpeakerMute(bool mute) {
  if (mute) {
    writeCodecReg(0x18, 0x31, 0x01); // ES8311 DAC Mute
    digitalWrite(PA_ENABLE_PIN, LOW); // Disable Class-D speaker PA
  } else {
    digitalWrite(PA_ENABLE_PIN, HIGH); // Enable Class-D speaker PA
    // 150ms: NS4150B Class-D amp datasheet specifies ~100ms startup from
    // shutdown. 10ms was too short - the first Gemini audio chunks arrived
    // while the amp was still in its mute release ramp, so they played into
    // a dead output and were lost. 150ms gives full headroom with a safety
    // margin so every chunk is audible.
    delay(150);
    writeCodecReg(0x18, 0x31, 0x00); // Unmute ES8311 DAC
  }
}

// Populated once in initCodecChips() and sent to the backend as a one-shot
// debug string as soon as the TCP connection is up, so we can verify the
// ES7210's actual register state over the network without touching COM3
// (which resets the board every time it's opened).
char codecRegDump[256] = "";

// Every register readback via both the Arduino HAL and LGFX's own I2C API
// has come back as a hard failure at address 0x40, even after fixing two
// real register bugs - which stopped being explainable by driver/API choice
// once the exact same LGFX transactionWrite/transactionWriteRead calls that
// Touch_GT911 itself uses (proven working, since touch responds) also
// failed. The remaining explanation is that nothing is actually ACKing at
// 0x40 on this board. A full scan settles it either way: an empty result
// means the codec isn't responding at all (power/wiring), a result at a
// different address means our assumed 0x40 was simply wrong.
// A full 0x03-0x77 sweep hung the board solid (confirmed via one serial
// capture - boot log stopped completely partway through, never even
// reaching initCodecChips()'s own first Serial.println) - some address in
// that range wedges LGFX's i2c_wait()/getBusBusy() polling loop, unlike
// 0x40 which reliably NAKs and returns promptly (already proven safe by
// every prior readCodecReg(0x40, ...) call completing normally). Scanning
// only known candidate addresses avoids re-triggering that hang: 0x40/0x41
// (ES7210 variants), 0x18/0x19 (ES8311 variants), 0x5D/0x14 (GT911 touch,
// expected to answer - confirms the scan mechanism itself works).
const uint8_t I2C_SCAN_CANDIDATES[] = {0x18, 0x19, 0x40, 0x41, 0x14, 0x5D};

void scanI2CBus() {
  char scanResult[200];
  int pos = snprintf(scanResult, sizeof(scanResult), "i2c_scan:");
  for (uint8_t addr :
       I2C_SCAN_CANDIDATES) {
    uint8_t dummy = 0;
    if (!lgfx::i2c::transactionRead(I2C_NUM_0, addr, &dummy, 1, 100000).has_error()) {
      pos += snprintf(scanResult + pos, sizeof(scanResult) - pos, " 0x%02X", addr);
    }
  }
  if (pos == 9) { // nothing appended after "i2c_scan:"
    snprintf(scanResult + pos, sizeof(scanResult) - pos, " (nothing found)");
  }
  Serial.println(scanResult);
  strncpy(codecRegDump, scanResult, sizeof(codecRegDump) - 1);
  codecRegDump[sizeof(codecRegDump) - 1] = '\0';
}

void initCodecChips() {
  scanI2CBus();
  Serial.println("[Hardware] Initializing ES7210 ADC (Microphone) & ES8311 DAC "
                 "via shared I2C bus (owned by LovyanGFX touch driver)...");

  // 1. Initialise ES7210 Dual Microphone ADC (I2C Addr: 0x40).
  // This sequence is transcribed from Espressif's own official es7210.c
  // driver (esp-bsp repo), NOT reverse-engineered - the previous hand-rolled
  // sequence had several register addresses simply wrong (0x40 is analog
  // front-end power, not "digital gain") and was missing the mic-channel
  // power-enable registers (0x47-0x4C) entirely, without which the ADC
  // channels never actually turn on - which is exactly why the mic was
  // reading a constant 0 regardless of real input.
  // Register addresses below are cross-checked against Espressif's real
  // es7210_adc_init()/es7210_set_bits() (esp-adf, components/audio_hal/
  // driver/es7210/es7210.c) after live telemetry showed the mic capturing
  // pure silence (rms=0 on every sample) even after every prior codec fix.
  // Two real bugs found: (1) register 0x08 (master/slave select) was never
  // written at all, leaving the ES7210's clock role at whatever its
  // power-on default is even though the ESP32 already drives BCLK/WS as
  // I2S master - the two need to agree, or the codec never latches valid
  // samples; (2) the I2S word-width/format register was written to 0x0B,
  // which isn't a real ES7210 register at all - the actual register is
  // 0x11 (SDP_INTERFACE1_REG11). That meant the ADC was left running at
  // its post-reset word width (24-bit) while the ESP32 I2S peripheral
  // reads 16-bit words, silently desynchronizing every sample - exactly
  // the flat-zero symptom observed.
  // REWRITTEN to exactly mirror Espressif's actual es7210_open() +
  // es7210_mic_select() (esp_codec_dev's es7210_new.c, the codec driver
  // esp-bsp's validated ESP32-S3-BOX-3 example uses), byte-for-byte and in
  // the same order, instead of our own hand-assembled sequence. Reading the
  // real source turned up several concrete deviations we'd been carrying
  // for the whole "static" investigation:
  //  - We wrote registers 0x47-0x4A (individual mic channel power) at init;
  //    the official driver never touches them at all in open()/mic_select().
  //  - We wrote register 0x06=0x04 ("power down DLL") during bring-up; that
  //    register is only ever written during es7210_close() (shutdown) in
  //    the official driver, not init - writing it at bring-up was
  //    backwards.
  //  - We wrote register 0x00=0x71 then 0x41 ("enable device") at the very
  //    end; the official open() never revisits register 0x00 after the
  //    initial reset at all.
  //  - Default gain was 24dB (0x18); the official default is 30dB - see
  //    es7210_gain_value_t, GAIN_30DB=10=0x0A, so register value
  //    0x10(enable) | 0x0A = 0x1A.
  //  - Register 0x03 (MCLK source) is only ever written in MASTER mode; we
  //    are in SLAVE mode (ESP32 drives the I2S clock), where the official
  //    driver never touches it at all - a prior attempt to write it here
  //    was based on a misread of the clock coefficient table and has been
  //    removed again.
  writeCodecReg(0x40, 0x00, 0xFF); // RESET_REG00: full reset
  delay(20);
  writeCodecReg(0x40, 0x00, 0x41); // RESET_REG00: release
  writeCodecReg(0x40, 0x01, 0x3F); // CLOCK_OFF_REG01: all off during config
  writeCodecReg(0x40, 0x09, 0x30); // TIME_CONTROL0_REG09
  writeCodecReg(0x40, 0x0A, 0x30); // TIME_CONTROL1_REG0A
  writeCodecReg(0x40, 0x23, 0x2A); // ADC12_HPF2_REG23
  writeCodecReg(0x40, 0x22, 0x0A); // ADC12_HPF1_REG22
  writeCodecReg(0x40, 0x20, 0x0A); // ADC34_HPF2_REG20
  writeCodecReg(0x40, 0x21, 0x2A); // ADC34_HPF1_REG21
  // MODE_CONFIG_REG08: slave mode (bit0=0), preserve default bits[7:4]=0x10
  writeCodecReg(0x40, 0x08, 0x10);
  // I2S format: standard I2S(0x00) | 16-bit(0x60) - register 0x11 is the
  // real SDP_INTERFACE1 register (cross-checked earlier this session).
  writeCodecReg(0x40, 0x11, 0x60); // SDP_INTERFACE1_REG11
  writeCodecReg(0x40, 0x40, 0x43); // ANALOG_REG40: analog front-end power up
  writeCodecReg(0x40, 0x41, 0x70); // MIC12_BIAS_REG41: 2.87V
  writeCodecReg(0x40, 0x42, 0x70); // MIC34_BIAS_REG42: 2.87V
  writeCodecReg(0x40, 0x07, 0x20); // OSR_REG07
  writeCodecReg(0x40, 0x02, 0xC1); // MAINCLK_REG02: adc_div|doubler<<6|dll<<7
  // es7210_mic_select(MIC1|MIC2): clear the enable bit on all 4 gain
  // registers first, power both mic pairs off, then power/enable/gain just
  // MIC1 and MIC2 (matching the official driver's exact call sequence,
  // including its redundant re-writes per mic).
  writeCodecReg(0x40, 0x43, 0x00); // MIC1_GAIN_REG43: clear enable bit
  writeCodecReg(0x40, 0x44, 0x00); // MIC2_GAIN_REG44: clear enable bit
  writeCodecReg(0x40, 0x45, 0x00); // MIC3_GAIN_REG45: clear enable bit (unused)
  writeCodecReg(0x40, 0x46, 0x00); // MIC4_GAIN_REG46: clear enable bit (unused)
  writeCodecReg(0x40, 0x4B, 0xFF); // MIC12_POWER_REG4B: off
  writeCodecReg(0x40, 0x4C, 0xFF); // MIC34_POWER_REG4C: off (stays off, unused)
  writeCodecReg(0x40, 0x01, 0x34); // CLOCK_OFF_REG01: clear bits 0x0B (0x3F & ~0x0B)
  writeCodecReg(0x40, 0x4B, 0x00); // MIC12_POWER_REG4B: on
  writeCodecReg(0x40, 0x43, 0x1C); // MIC1_GAIN_REG43: enable | 36dB (max)
  writeCodecReg(0x40, 0x01, 0x34); // (redundant, matches official's own redundancy)
  writeCodecReg(0x40, 0x4B, 0x00); // (redundant, matches official's own redundancy)
  writeCodecReg(0x40, 0x44, 0x1C); // MIC2_GAIN_REG44: enable | 36dB (max)
  writeCodecReg(0x40, 0x12, 0x00); // SDP_INTERFACE2_REG12: non-TDM (2 mics)

  // =========================================================================
  // CRITICAL es7210_start() PHASE (from Espressif esp_codec_dev):
  // Wakes up DLL (0x06=0x00), powers mic preamps (0x47/0x48=0x08), and
  // latches digital filter state machine sequencer (0x71 -> 0x41).
  // =========================================================================
  writeCodecReg(0x40, 0x01, 0x34); // CLOCK_OFF_REG01
  writeCodecReg(0x40, 0x06, 0x00); // POWER_DOWN_REG06: 0x00 (WAKE UP DLL & analog circuits)
  writeCodecReg(0x40, 0x40, 0x43); // ANALOG_REG40
  writeCodecReg(0x40, 0x47, 0x08); // MIC1_POWER_REG47: 0x08 (power up MIC1 preamp)
  writeCodecReg(0x40, 0x48, 0x08); // MIC2_POWER_REG48: 0x08 (power up MIC2 preamp)
  writeCodecReg(0x40, 0x49, 0x08); // MIC3_POWER_REG49: 0x08
  writeCodecReg(0x40, 0x4A, 0x08); // MIC4_POWER_REG4A: 0x08
  writeCodecReg(0x40, 0x4B, 0x00); // MIC12_POWER_REG4B
  writeCodecReg(0x40, 0x43, 0x1C); // MIC1_GAIN_REG43: enable | 36dB (max)
  writeCodecReg(0x40, 0x44, 0x1C); // MIC2_GAIN_REG44: enable | 36dB (max)
  writeCodecReg(0x40, 0x40, 0x43); // ANALOG_REG40
  writeCodecReg(0x40, 0x00, 0x71); // RESET_REG00: 0x71 (enable digital sequencer state machine)
  writeCodecReg(0x40, 0x00, 0x41); // RESET_REG00: 0x41 (release into active capture state)

  // One-shot register readback appended after the I2C scan result (both
  // share codecRegDump so a single sendDebug() call reports everything) so
  // we can confirm over the network (not serial - opening COM3 resets the
  // board) whether our writes actually stuck.
  size_t dumpLen = strlen(codecRegDump);
  snprintf(codecRegDump + dumpLen, sizeof(codecRegDump) - dumpLen,
           " | es7210_regs r00=%02X r01=%02X r06=%02X r08=%02X r11=%02X r12=%02X "
           "r40=%02X r47=%02X r48=%02X r4B=%02X r43=%02X r44=%02X",
           readCodecReg(0x40, 0x00), readCodecReg(0x40, 0x01),
           readCodecReg(0x40, 0x06), readCodecReg(0x40, 0x08),
           readCodecReg(0x40, 0x11), readCodecReg(0x40, 0x12),
           readCodecReg(0x40, 0x40), readCodecReg(0x40, 0x47),
           readCodecReg(0x40, 0x48), readCodecReg(0x40, 0x4B),
           readCodecReg(0x40, 0x43), readCodecReg(0x40, 0x44));
  Serial.println(codecRegDump);

  // 2. Initialise ES8311 Speaker DAC (I2C Addr: 0x18). The original 8-line
  // version of this sequence only powered the analog block on - it never
  // configured the clock dividers for our 4.096MHz MCLK / 16kHz rate, never
  // set the I2S word-length/format register (0x09 - the exact same class of
  // bug as the ES7210's missing register 0x11), and never explicitly
  // unmuted the DAC (register 0x31). That combination matches the observed
  // symptom exactly: the amp audibly clicks on (analog power/PA enable
  // succeeds) but no actual tone comes through (DAC never configured to
  // decode real audio). Rebuilt against Espressif's real es8311_codec_init()
  // + es8311_start(), using the coefficient-table row for
  // {mclk=4096000, rate=16000} from the same official es8311.c, since that's
  // the identical MCLK/rate pair the ES7210 mic side already uses.
  writeCodecReg(0x18, 0x44, 0x08); // GPIO: I2C noise immunity
  writeCodecReg(0x18, 0x44, 0x08); // (written twice - official driver does
                                    // this too, first I2C write sometimes
                                    // fails on this chip)
  writeCodecReg(0x18, 0x16, 0x24); // ADC (unconditional in reference)
  writeCodecReg(0x18, 0x0B, 0x00); // System
  writeCodecReg(0x18, 0x0C, 0x00); // System
  writeCodecReg(0x18, 0x10, 0x1F); // System
  writeCodecReg(0x18, 0x11, 0x7F); // System
  writeCodecReg(0x18, 0x00, 0x80); // Reset, then slave mode (ESP32 is I2S master)
  // Clock manager: final coefficient-table values for mclk=4.096MHz,
  // rate=16000 (pre_div=1, pre_multi=1, adc_div=1, dac_div=1, fs_mode=0,
  // lrck=0x00FF, bclk_div=4, adc_osr=0x10, dac_osr=0x20), MCLK sourced from
  // the dedicated MCLK pin (shared with the ES7210, not derived from BCLK).
  writeCodecReg(0x18, 0x01, 0x3F); // Clock manager enable, MCLK from pin
  writeCodecReg(0x18, 0x02, 0x00); // pre_div=1, pre_multi=1
  writeCodecReg(0x18, 0x03, 0x10); // adc_osr=0x10
  writeCodecReg(0x18, 0x04, 0x20); // dac_osr=0x20
  writeCodecReg(0x18, 0x05, 0x00); // adc_div=1, dac_div=1
  writeCodecReg(0x18, 0x06, 0x03); // bclk_div=4
  writeCodecReg(0x18, 0x07, 0x00); // lrck_h
  writeCodecReg(0x18, 0x08, 0xFF); // lrck_l
  writeCodecReg(0x18, 0x13, 0x10); // System
  writeCodecReg(0x18, 0x1B, 0x0A); // ADC (unused path, set per reference anyway)
  writeCodecReg(0x18, 0x1C, 0x6A); // ADC (unused path, set per reference anyway)
  // es8311_start(DAC-only): I2S format/word-length register, power-up
  // sequencing, and finally an explicit unmute - all previously missing.
  writeCodecReg(0x18, 0x09, 0x0C); // SDPIN: I2S normal format, 16-bit, DAC enabled
  writeCodecReg(0x18, 0x0A, 0x40); // SDPOUT: ADC side unused/tri-stated
  writeCodecReg(0x18, 0x17, 0xBF); // ADC volume (unused path)
  writeCodecReg(0x18, 0x0E, 0x02); // System power
  writeCodecReg(0x18, 0x12, 0x00); // System: enable DAC
  writeCodecReg(0x18, 0x14, 0x1A); // System: analog PGA gain, no DMIC
  writeCodecReg(0x18, 0x0D, 0x01); // System power up
  writeCodecReg(0x18, 0x15, 0x40); // ADC ramp (unused path)
  writeCodecReg(0x18, 0x37, 0x08); // DAC ramp rate
  writeCodecReg(0x18, 0x45, 0x00); // GP control
  writeCodecReg(0x18, 0x44, 0x58); // Internal reference signal (ADCL + DACR)
  writeCodecReg(0x18, 0x31, 0x00); // DAC unmute (was never explicitly set before)
  writeCodecReg(0x18, 0x32, 0xBF); // DAC volume (~0dB)
  Serial.println("[Hardware] ES7210 & ES8311 initialized successfully.");
}

void initAudioHardware() {
  Serial.println("[Hardware] Initializing I2S for BOX-3 Codec...");

  // Configure MUTE Button (GPIO 1, active LOW)
  pinMode(MUTE_BTN_PIN, INPUT_PULLUP);

  // Configure Power Amplifier pin - start muted to isolate mic
  pinMode(PA_ENABLE_PIN, OUTPUT);
  setSpeakerMute(true);

  // Configure I2C audio chips
  initCodecChips();

  i2s_chan_config_t chan_cfg =
      I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
  chan_cfg.auto_clear = true; // replaces the legacy i2s_zero_dma_buffer() call
  ESP_ERROR_CHECK(i2s_new_channel(&chan_cfg, &i2sTxChan, &i2sRxChan));

  i2s_std_config_t std_cfg = {
      .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(MIC_SAMPLE_RATE),
      .slot_cfg = I2S_STD_PHILIP_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT,
                                                      I2S_SLOT_MODE_STEREO),
      .gpio_cfg = {.mclk = I2S_MCLK_PIN,
                   .bclk = I2S_BCLK_PIN,
                   .ws = I2S_WS_PIN,
                   .dout = I2S_DOUT_PIN,
                   .din = I2S_DIN_PIN,
                   .invert_flags = {.mclk_inv = false,
                                    .bclk_inv = false,
                                    .ws_inv = false}}};

  ESP_ERROR_CHECK(i2s_channel_init_std_mode(i2sTxChan, &std_cfg));
  ESP_ERROR_CHECK(i2s_channel_init_std_mode(i2sRxChan, &std_cfg));
  ESP_ERROR_CHECK(i2s_channel_enable(i2sTxChan));
  ESP_ERROR_CHECK(i2s_channel_enable(i2sRxChan));
  Serial.println("[Hardware] I2S (i2s_std, 16kHz, STEREO) channels enabled successfully.");
}

// Standalone mic read-rate test: reads a fixed number of buffers back to
// back via i2s_channel_read(), the SAME i2sRxChan/std_cfg as the live app,
// but with NO WiFi/TCP/Gemini/state-machine involved at all - runs once at
// boot, before WiFi.begin() is even called.
void micReadRateTest() {
  const int TEST_BUFFERS = 60;
  static int16_t stereoTestBuf[AUDIO_CHUNK_SAMPLES * 2];
  size_t bytesRead = 0;
  Serial.println("[MicTest] Standalone I2S read-rate test starting - "
                  "speak into the mic now...");
  unsigned long testStart = millis();
  int zeroCount = 0;
  int64_t maxRms = 0;
  for (int i = 0; i < TEST_BUFFERS; i++) {
    unsigned long readStart = millis();
    esp_err_t err = i2s_channel_read(i2sRxChan, stereoTestBuf, sizeof(stereoTestBuf),
                                      &bytesRead, portMAX_DELAY);
    unsigned long readMs = millis() - readStart;
    if (bytesRead == 0) zeroCount++;
    int pairCount = bytesRead / (2 * sizeof(int16_t));
    int64_t sumSquare = 0;
    for (int s = 0; s < pairCount; s++) {
      int16_t sample = stereoTestBuf[2 * s]; // Pure MIC1 Left
      sumSquare += (int32_t)sample * (int32_t)sample;
    }
    int rms = pairCount > 0 ? (int)sqrt((double)(sumSquare / pairCount)) : 0;
    if (rms > maxRms) maxRms = rms;
    (void)err;
    (void)readMs;
  }
  unsigned long totalMs = millis() - testStart;
  Serial.printf("[MicTest] DONE: %d buffers in %lums (avg %lums/buf), "
                "zeroByteReads=%d, peakRms=%lld\n",
                TEST_BUFFERS, totalMs, totalMs / TEST_BUFFERS, zeroCount,
                (long long)maxRms);
}

// Sends one framed message: [1 byte type][4 bytes big-endian length][data].
// type 0x00 = text/JSON, 0x01 = binary PCM. Matches HardwareTcpClient in
// index.js and the ESPHome ims_bridge component exactly. Core 1 only.
void sendFrame(uint8_t type, const uint8_t *data, size_t len) {
  if (!tcpClient.connected()) return;
  uint8_t header[5];
  header[0] = type;
  header[1] = (len >> 24) & 0xFF;
  header[2] = (len >> 16) & 0xFF;
  header[3] = (len >> 8) & 0xFF;
  header[4] = len & 0xFF;
  tcpClient.write(header, sizeof(header));
  if (len > 0) {
    tcpClient.write(data, len);
  }
}

void sendSetupHandshake() {
  Serial.println("[IMS] Sending Gemini Live setup configuration...");
  JsonDocument doc;
  JsonObject setup = doc["setup"].to<JsonObject>();
  setup["model"] = "models/gemini-2.5-flash-native-audio-latest";

  JsonObject genConfig = setup["generationConfig"].to<JsonObject>();
  JsonArray modalities = genConfig["responseModalities"].to<JsonArray>();
  modalities.add("AUDIO");
  genConfig["temperature"] = 1.0;

  JsonObject speechConfig = genConfig["speechConfig"].to<JsonObject>();
  speechConfig["voiceConfig"]["prebuiltVoiceConfig"]["voiceName"] = "Puck";

  JsonObject sysInstruct = setup["systemInstruction"].to<JsonObject>();
  JsonArray parts = sysInstruct["parts"].to<JsonArray>();
  JsonObject part1 = parts.add<JsonObject>();
  // Plain ASCII only - IPA chars in string literals cause malformed UTF-8 JSON
  part1["text"] =
      "You are Ims, an intelligent voice assistant on an ESP32-S3-BOX-3 "
      "device. Your name is Ims (rhymes with rims). The user taps a button to "
      "start talking, then asks you a question directly - respond to what "
      "they say, do not wait for a greeting or wake phrase. Respond concisely "
      "in natural British English. Keep all answers short and suitable for "
      "voice. Never terminate or close the session.";

  String jsonString;
  serializeJson(doc, jsonString);
  Serial.printf("[IMS] Setup sent (%d bytes)\n", jsonString.length());
  sendFrame(0x00, (const uint8_t *)jsonString.c_str(), jsonString.length());
}

// Sends a debug telemetry string to the backend over the existing TCP
// connection (backend just logs and drops it - see hardwareClientService/
// index.js). Core 1 only, same as every other tcpClient/sendFrame call.
void sendDebug(const char *text) {
  if (!tcpClient.connected()) return;
  String msg = "{\"debug\":\"" + String(text) + "\"}";
  sendFrame(0x00, (const uint8_t *)msg.c_str(), msg.length());
}

// Plays a short 440Hz tone directly via i2s_channel_write(), bypassing Gemini and
// the mic entirely - isolates the speaker/DAC/amp half of the pipeline so
// it can be verified independently of whatever the mic is doing. Blocking
// (~300ms); only ever called from loop() (Core 1) in response to a touch on
// the TEST button, so it can't race the mic task's I2S reads (I2S RX/TX
// share one peripheral but are independent FIFOs/DMA channels).
void playChime() {
  Serial.println("[Hardware] Playing speaker test tone...");
  sendDebug("test_chime");
  setSpeakerMute(false); // Enable speaker amp & unmute DAC
  const float freq = 440.0f;
  const int totalSamples = MIC_SAMPLE_RATE * 300 / 1000; // 300ms
  const int fadeSamples = 200; // click-free fade in/out
  int16_t stereoBuf[512];
  int written = 0;
  while (written < totalSamples) {
    int chunkLen = min(256, totalSamples - written);
    for (int i = 0; i < chunkLen; i++) {
      int idx = written + i;
      float t = (float)idx / MIC_SAMPLE_RATE;
      float envelope = 1.0f;
      if (idx < fadeSamples) envelope = (float)idx / fadeSamples;
      if (idx > totalSamples - fadeSamples)
        envelope = (float)(totalSamples - idx) / fadeSamples;
      int16_t sample = (int16_t)(sinf(2.0f * PI * freq * t) * 9000.0f * envelope);
      stereoBuf[2 * i] = sample;
      stereoBuf[2 * i + 1] = sample;
    }
    size_t bytesWritten = 0;
    i2s_channel_write(i2sTxChan, stereoBuf, chunkLen * 2 * sizeof(int16_t),
                       &bytesWritten, portMAX_DELAY);
    written += chunkLen;
  }
  delay(30);
  setSpeakerMute(true); // Return to muted state to isolate mic
}

// Sends a real clientContent text turn (not the empty/placeholder "."
// turn that caused Gemini to answer the literal period instead of real
// mic audio) - used as a mic-free diagnostic to confirm the network/
// Gemini/speaker path works in isolation from the still-unresolved mic
// static issue. Gemini's reply comes back as binary audio frames and
// plays through the already-working speaker path in handleFrame().
void sendTextQuery(const char *text) {
  if (!tcpClient.connected() || !geminiSetupComplete) return;
  Serial.printf("[IMS] Sending text query: %s\n", text);
  JsonDocument doc;
  JsonObject clientContent = doc["clientContent"].to<JsonObject>();
  JsonArray turns = clientContent["turns"].to<JsonArray>();
  JsonObject turn = turns.add<JsonObject>();
  turn["role"] = "user";
  JsonArray parts = turn["parts"].to<JsonArray>();
  JsonObject part = parts.add<JsonObject>();
  part["text"] = text;
  clientContent["turnComplete"] = true;

  String turnStr;
  serializeJson(doc, turnStr);
  sendFrame(0x00, (const uint8_t *)turnStr.c_str(), turnStr.length());
  currentState = STATE_THINKING;
  lastTranscript = String(text);
  renderScreen(true);
}

// Touch-to-talk: no wake word, no synthetic greeting turn sent to Gemini.
// Just flip to LISTENING so audioMicTask (Core 0) starts enqueueing real mic
// audio for Core 1 to stream, and the user speaks their actual question.
void beginListening(const char *reason) {
  if (!tcpClient.connected() || !geminiSetupComplete) {
    Serial.printf("[IMS] beginListening(%s) blocked - tcp=%d setup=%d\n",
                  reason, tcpClient.connected(), geminiSetupComplete);
    sendDebug("beginListening_blocked");
    lastTranscript = "Still connecting to Gemini...";
    renderScreen(true);
    return;
  }
  Serial.printf("[IMS] Starting listening session (%s)...\n", reason);
  sendDebug((String("listening_start:") + reason).c_str());
  setSpeakerMute(true); // Isolate mic from speaker PA switching noise
  currentState = STATE_LISTENING;
  micStreamingActive = true;
  lastSpeechTimestamp = millis();
  isSpeakingDetected = false;
  speechStartTime = 0;
  lastTranscript = "Listening...";
  renderScreen(true);
}

// Deliberately sends nothing to Gemini - just flips the local UI to
// THINKING. Two things learned the hard way getting here: (1) sending a
// clientContent turn with a placeholder "." text part (the original
// approach) made Gemini answer the literal period instead of the real
// audio, producing the same generic "Yes, how can I help you?" reply every
// time; (2) realtimeInput.audioStreamEnd (the next attempt) isn't a
// recognized field either - Gemini just silently never responded and the
// session eventually timed out. The browser app's own useGeminiLive.js
// sendTurnComplete() sends {clientContent:{turns:[],turnComplete:true}},
// but index.js explicitly drops that exact empty-turns shape server-side
// to avoid a Gemini 1007 rejection - so in the ALREADY-WORKING browser
// path, that message never actually reaches Gemini either. What actually
// ends a turn there is Gemini's own server-side voice activity detection,
// on by default for realtimeInput.audio streams with no explicit opt-in
// needed - it notices the silence in the continuous audio stream itself
// and starts responding unprompted. This only flips the DISPLAY to
// THINKING - it deliberately leaves micStreamingActive alone, so
// audioMicTask keeps streaming real mic audio (including trailing silence)
// the whole time Gemini is "thinking", giving its VAD an actual continuous
// stream to detect the end of speech from rather than an abruptly cut-off
// one. handleFrame() clears micStreamingActive once Gemini's response
// actually starts arriving.
void sendTurnComplete() {
  if (!tcpClient.connected() || !geminiSetupComplete) return;
  currentState = STATE_THINKING;
  micStreamingActive = false; // Stop streaming mic audio so Gemini's VAD completes the turn!
  renderScreen(true);
}

bool usingFallback = false;
int connectionAttempts = 0;

void connectToBackend() {
  tcpClient.stop();
  Serial.printf("[TCP] Connecting to PRIMARY (Local LAN): %s:%d\n",
                IMS_PRIMARY_HOST, IMS_TCP_PORT);
  currentState = STATE_CONNECTING_SERVER;
  if (tcpClient.connect(IMS_PRIMARY_HOST, IMS_TCP_PORT)) {
    Serial.println("[TCP] Connected to backend");
    connectionAttempts = 0;
    isSetupAcknowledged = true;
    geminiSetupComplete = false; // Will be set true when Gemini ACKs setup
    sendSetupHandshake();
  } else {
    Serial.println("[TCP] Connect failed - will retry");
    connectionAttempts++;
  }
}

// Linear-interpolation downsampler, 24kHz (Gemini's native output rate) to
// 16kHz (this board's shared I2S bus rate, fixed by the mic side). Keeps
// phase/last-sample state across calls (static) so pitch/timing stay
// continuous across the many small chunks a streaming response arrives in,
// rather than resetting every chunk boundary. Ratio is exactly 2/3.
size_t resample24to16(const int16_t *in, size_t inSamples, int16_t *out,
                       size_t outCapacity) {
  static float phase = 0.0f;
  static int16_t lastSample = 0;
  static bool hasLast = false;
  const float step = 24000.0f / 16000.0f; // 1.5 input samples per output sample

  if (!hasLast && inSamples > 0) {
    lastSample = in[0];
    hasLast = true;
  }

  size_t outCount = 0;
  while (outCount < outCapacity) {
    size_t idx = (size_t)phase;
    if (idx >= inSamples) break;
    float frac = phase - (float)idx;
    int16_t s0 = (idx == 0) ? lastSample : in[idx - 1];
    int16_t s1 = in[idx];
    out[outCount++] = (int16_t)(s0 + frac * (s1 - s0));
    phase += step;
  }

  phase -= (float)inSamples;
  if (phase < 0.0f) phase = 0.0f;
  if (inSamples > 0) {
    lastSample = in[inSamples - 1];
  }
  return outCount;
}

// Sized for Gemini's largest observed messages (RIO-ESP32-S3-Gemini-Live-
// Voice-Assistant reported 41KB+ text turns) plus headroom. Buffers below
// are allocated once from PSRAM (board_build enables it - see
// platformio.ini) rather than as static arrays, since 64KB would otherwise
// eat a big chunk of internal DRAM.
#define FRAME_BUF_CAPACITY (64 * 1024)

// Dispatches one fully-received frame: type 0x00 = JSON/text control message
// (reuses the exact same Gemini Live message parsing that used to live in
// webSocketEvent's WStype_TEXT case), type 0x01 = binary 24kHz PCM audio from
// Gemini, resampled down to the 16kHz I2S bus rate before playback.
void handleFrame(uint8_t type, const uint8_t *data, size_t len) {
  if (type == 0x01) {
    // Incoming 24kHz PCM audio from IMS proxy - resample to 16kHz bus rate.
    // Downsampling only shrinks the sample count, so the input's own sample
    // count is always a safe upper bound for the output buffer.
    static int16_t *resampled = nullptr;
    if (resampled == nullptr) {
      resampled = (int16_t *)ps_malloc(FRAME_BUF_CAPACITY);
    }
    static int16_t *stereoPlaybackBuf = nullptr;
    if (stereoPlaybackBuf == nullptr) {
      stereoPlaybackBuf = (int16_t *)ps_malloc(FRAME_BUF_CAPACITY * 2);
    }
    size_t inSamples = len / sizeof(int16_t);
    size_t outSamples =
        resample24to16((const int16_t *)data, inSamples, resampled,
                        FRAME_BUF_CAPACITY / sizeof(int16_t));
    for (size_t i = 0; i < outSamples; i++) {
      // x1.5 playback gain: Gemini's 24kHz output tends to be quiet after
      // resampling to 16kHz. Clamped to int16 range to avoid wrap clipping.
      int32_t boosted = (int32_t)resampled[i] * 3 / 2;
      if (boosted >  32767) boosted =  32767;
      if (boosted < -32768) boosted = -32768;
      stereoPlaybackBuf[2 * i]     = (int16_t)boosted;
      stereoPlaybackBuf[2 * i + 1] = (int16_t)boosted;
    }
    // Push to audioPlaybackQueue in AUDIO_CHUNK_SAMPLES-sized stereo chunks.
    // audioPlaybackTask (Core 0) drains the queue with portMAX_DELAY writes,
    // so Core 1 (this function, called from loop()) is NEVER blocked waiting
    // for DMA - which was the root cause of the TCP disconnect loop:
    // portMAX_DELAY here was holding Core 1 for up to ~600ms per large frame.
    static PlaybackChunkMsg pbMsg;
    size_t offset = 0;
    while (offset < outSamples) {
      size_t chunk = outSamples - offset;
      if (chunk > AUDIO_CHUNK_SAMPLES) chunk = AUDIO_CHUNK_SAMPLES;
      memcpy(pbMsg.data, &stereoPlaybackBuf[offset * 2], chunk * 2 * sizeof(int16_t));
      pbMsg.len = chunk * 2 * sizeof(int16_t);
      // pdMS_TO_TICKS(20): brief wait only - if playback task is momentarily
      // behind, give it 20ms to catch up rather than dropping immediately.
      // Core 1 still returns to loop() within one DMA-drain period.
      xQueueSend(audioPlaybackQueue, &pbMsg, pdMS_TO_TICKS(20));
      offset += chunk;
    }
    lastSpeechTimestamp = millis();
    // This binary audio channel is Gemini's actual spoken reply (we're
    // AUDIO-only, responseModalities=["AUDIO"]) - the JSON serverContent/
    // text paths below are for transcript-style messages that may not
    // arrive at all for a pure-audio response. Without this, nothing ever
    // told audioMicTask to stop streaming once Gemini started replying, and
    // the screen could sit on "Thinking..." through the entire reply.
    if (currentState != STATE_SPEAKING) {
      setSpeakerMute(false); // Unmute DAC & enable speaker PA for Gemini speech playback
      currentState = STATE_SPEAKING;
      micStreamingActive = false;
      lastTranscript = "Speaking...";
      renderScreen(true);
    }
    return;
  }

  // type == 0x00: JSON/text control message
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, data, len);
  if (!error) {
    // Gemini setup acknowledgment - now safe to stream audio
    if (doc["setupComplete"].is<JsonObject>() ||
        !doc["setupComplete"].isNull()) {
      Serial.println(
          "[Gemini] Setup complete ACK received - audio streaming enabled!");
      geminiSetupComplete = true;
      currentState = STATE_STANDBY;
      lastTranscript = "Tap screen to ask a question";
      renderScreen(true);
      sendDebug(codecRegDump);
      // Startup greeting: Gemini synthesises this as native audio and streams
      // it back through the speaker path immediately on first connect, so the
      // user gets audible confirmation the device is ready without needing to
      // tap anything. Uses sendTextQuery() which sends a proper clientContent
      // turn with turnComplete=true so Gemini responds immediately.
      sendTextQuery("Please say exactly: Hi, I'm Ims, ready to talk.");
      // The mic-free "Hi, how are you" auto-query (sendTextQuery) already
      // did its job confirming the network/Gemini/speaker path in
      // isolation - removed because its own trailing reply audio can still
      // be arriving when a real mic test starts, and handleFrame() treats
      // ANY incoming audio as "Gemini is replying, stop listening" -
      // silently truncating the very next listening session to a fraction
      // of a second. sendTextQuery() is left defined for future manual use.
    }
    if (doc["text"].is<const char *>()) {
      const char *textSnippet = doc["text"].as<const char *>();
      Serial.printf("[Gemini Text] %s\n", textSnippet);
      currentState = STATE_SPEAKING;
      lastSpeechTimestamp = millis();
      lastTranscript = String(textSnippet);
      renderScreen(true);
    }
    if (doc["turnComplete"].as<bool>() || doc["turnComplete"].is<JsonObject>()) {
      setSpeakerMute(true); // Return to muted speaker
      currentState = STATE_STANDBY;
      micStreamingActive = false;
      lastTranscript = "Tap screen to ask a question";
      renderScreen(true);
    }
    if (doc["serverContent"].is<JsonObject>()) {
      JsonObject serverContent = doc["serverContent"];
      if (serverContent["modelTurn"].is<JsonObject>()) {
        if (currentState != STATE_SPEAKING) {
          setSpeakerMute(false);
        }
        currentState = STATE_SPEAKING;
        lastSpeechTimestamp = millis();
        JsonArray modelParts = serverContent["modelTurn"]["parts"];
        for (JsonObject p : modelParts) {
          if (p["text"].is<const char *>()) {
            const char *textSnippet = p["text"].as<const char *>();
            Serial.printf("[Gemini] %s\n", textSnippet);
            lastTranscript = String(textSnippet);
            renderScreen(true);
          }
        }
      }
      if (serverContent["turnComplete"].as<bool>()) {
        setSpeakerMute(true); // Return to muted speaker
        currentState = STATE_STANDBY;
        micStreamingActive = false;
        lastTranscript = "Tap screen to ask a question";
        renderScreen(true);
      }
    }
  } else {
    Serial.printf("[TCP] JSON parse error: %s\n", error.c_str());
    Serial.printf("[TCP] Raw payload: %.*s\n", (int)min(len, (size_t)200),
                  (const char *)data);
  }
}

// Polls the raw TCP socket for complete [1 byte type][4 byte BE length]
// [payload] frames and dispatches each to handleFrame() as it completes.
// Replaces WebSocketsClient's callback-based webSocketEvent entirely - a
// plain WiFiClient has no event loop of its own, so this is called every
// pass through loop() instead. Core 1 only.
void pollIncoming() {
  static uint8_t header[5];
  static size_t headerBytesRead = 0;
  static uint8_t frameType = 0;
  static uint32_t frameLen = 0;
  static uint8_t *frameBuf = nullptr;
  static size_t frameBytesRead = 0;

  if (frameBuf == nullptr) {
    frameBuf = (uint8_t *)ps_malloc(FRAME_BUF_CAPACITY);
    if (frameBuf == nullptr) {
      Serial.println("[TCP] FATAL: failed to allocate frame buffer");
      return;
    }
  }

  while (tcpClient.available() > 0) {
    if (headerBytesRead < sizeof(header)) {
      int n = tcpClient.read(header + headerBytesRead,
                              sizeof(header) - headerBytesRead);
      if (n <= 0) return;
      headerBytesRead += n;
      if (headerBytesRead < sizeof(header)) return; // wait for rest
      frameType = header[0];
      frameLen = ((uint32_t)header[1] << 24) | ((uint32_t)header[2] << 16) |
                 ((uint32_t)header[3] << 8) | (uint32_t)header[4];
      frameBytesRead = 0;
      if (frameLen > FRAME_BUF_CAPACITY) {
        Serial.printf("[TCP] Frame too large (%u bytes) - dropping "
                      "connection\n",
                      (unsigned)frameLen);
        tcpClient.stop();
        headerBytesRead = 0;
        return;
      }
    }

    if (frameBytesRead < frameLen) {
      int n = tcpClient.read(frameBuf + frameBytesRead,
                              frameLen - frameBytesRead);
      if (n <= 0) return;
      frameBytesRead += n;
      if (frameBytesRead < frameLen) return; // wait for rest
    }

    handleFrame(frameType, frameBuf, frameLen);
    headerBytesRead = 0;
    frameBytesRead = 0;
  }
}

// Energy-based silence detection while actively LISTENING (tuned for BOX-3
// dual mic array + ES7210 gain). Touch/button is the only trigger into
// LISTENING now — this threshold only decides when the user has stopped
// talking so we can close the turn.
// Raised from 25 to 50 to track the ×2 software gain applied in
// audioMicTask - raw RMS values are now doubled, so the threshold must
// scale with them to maintain the same effective silence sensitivity.
#define VOICE_ENERGY_THRESHOLD 50

// Bit-alignment diagnostic (see audioMicTask()) - left-shifts every mic
// sample by this many bits before sending/logging. Tested at 4: result was
// proportionally louder static+voice together, not cleaner voice - exactly
// what correctly-aligned data does under extra digital gain, which rules
// out a bit-alignment bug. Back to 0 (no shift).
#define MIC_SHIFT_TEST_BITS 0

// Audio Recording & Ingestion Task on Core 0.
// This task NEVER calls tcpClient.* or tft.* directly — those are only safe
// to call from Core 1 (loop()), since neither a raw WiFiClient socket nor
// LovyanGFX tolerates concurrent access from two tasks/cores. Instead this
// task hands off work via audioOutQueue / controlEventQueue for loop() to
// drain.
void audioMicTask(void *param) {
  static int16_t stereoBuffer[AUDIO_CHUNK_SAMPLES * 2];
  static int16_t micBuffer[AUDIO_CHUNK_SAMPLES];
  static AudioChunkMsg msg;
  size_t bytesRead = 0;
  // DIAGNOSTIC: is i2s_channel_read() actually keeping pace with the 16kHz
  // stream, or silently stalling for long stretches between buffers? Tracks
  // wall-clock elapsed time and buffer count since streaming last started,
  // logged alongside rms below, to tell "mic is just quiet" apart from
  // "mic reads are starved" without relying on the 5s heartbeat cadence.
  bool wasStreaming = false;
  unsigned long sessionStartMs = 0;
  unsigned long bufCount = 0;
  unsigned long attemptCount = 0;
  unsigned long zeroByteCount = 0;
  static unsigned long lastAttemptLog = 0;

  while (true) {
    // Only stream audio when Gemini has fully acknowledged setup
    // This prevents binary audio from reaching the server before the
    // setup text message, which causes Gemini to reject with 1007.
    if (tcpClient.connected() && geminiSetupComplete) {
      if (micStreamingActive && !wasStreaming) {
        sessionStartMs = millis();
        bufCount = 0;
        attemptCount = 0;
        zeroByteCount = 0;
        wasStreaming = true;
      } else if (!micStreamingActive) {
        wasStreaming = false;
      }
      unsigned long readStartMs = millis();
      i2s_channel_read(i2sRxChan, stereoBuffer, sizeof(stereoBuffer), &bytesRead,
                        portMAX_DELAY);
      unsigned long readMs = millis() - readStartMs;
      attemptCount++;
      if (bytesRead == 0) zeroByteCount++;

      // DIAGNOSTIC: fires every 500ms regardless of bytesRead/micStreamingActive,
      // unlike the rms log below which only fires on a successful in-session
      // read - this is the only way to tell "the loop itself is stalling
      // inside i2s_channel_read()" apart from "the loop spins fine but
      // bytesRead keeps coming back 0" or "micStreamingActive keeps gating
      // real buffers out".
      if (wasStreaming && millis() - lastAttemptLog > 500) {
        lastAttemptLog = millis();
        // Raw Serial.printf here too - straight off USB serial, bypassing
        // debugQueue/TCP/backend entirely, since those add their own
        // queuing/throttling that could otherwise be mistaken for the mic
        // task itself stalling.
        Serial.printf("[MicAttempt] att=%lu zero=%lu ok=%lu el=%lums rd=%lu "
                      "str=%d\n",
                      attemptCount, zeroByteCount, bufCount,
                      millis() - sessionStartMs, readMs,
                      (int)micStreamingActive);
        DebugMsg amsgQ;
        snprintf(amsgQ.text, sizeof(amsgQ.text),
                 "att=%lu zero=%lu ok=%lu el=%lums rd=%lu str=%d",
                 attemptCount, zeroByteCount, bufCount,
                 millis() - sessionStartMs, readMs, (int)micStreamingActive);
        xQueueSend(debugQueue, &amsgQ, 0);
      }

      if (bytesRead > 0 && micStreamingActive) {
        bufCount++;
        int monoSampleCount = bytesRead / (2 * sizeof(int16_t));
        if (monoSampleCount > AUDIO_CHUNK_SAMPLES) monoSampleCount = AUDIO_CHUNK_SAMPLES;
        int64_t sumSquare = 0;
        for (int i = 0; i < monoSampleCount; i++) {
          // ×2 software gain to compensate for quiet capture even at max
          // hardware 36dB. Clamped to int16 range to prevent wrap-around
          // clipping artifacts.
          int32_t boosted = (int32_t)stereoBuffer[2 * i] * 2;
          if (boosted >  32767) boosted =  32767;
          if (boosted < -32768) boosted = -32768;
          int16_t sample = (int16_t)boosted; // Pure Left channel (MIC1), boosted
          micBuffer[i] = sample;
          sumSquare += (int32_t)sample * (int32_t)sample;
        }
        int rms = monoSampleCount > 0 ? (int)sqrt((double)(sumSquare / monoSampleCount)) : 0;
        currentMicRms = rms;

        static unsigned long lastRmsLog = 0;
        if (millis() - lastRmsLog > 500) {
          lastRmsLog = millis();
          unsigned long elapsed = millis() - sessionStartMs;
          Serial.printf("[Mic] RMS=%d sample0=%d n=%lu elapsed=%lums "
                        "lastReadMs=%lu\n",
                        rms, micBuffer[0], bufCount, elapsed, readMs);
          DebugMsg dmsg;
          snprintf(dmsg.text, sizeof(dmsg.text),
                   "rms=%d n=%lu elapsed=%lums lastReadMs=%lu", rms, bufCount,
                   elapsed, readMs);
          xQueueSend(debugQueue, &dmsg, 0);
        }

        if (rms > (VOICE_ENERGY_THRESHOLD / 2)) {
          lastSpeechTimestamp = millis();
          if (!isSpeakingDetected) {
            isSpeakingDetected = true;
            speechStartTime = millis();
          }
        } else {
          // User went silent while in LISTENING
          if (isSpeakingDetected && (millis() - lastSpeechTimestamp > 800) &&
              (millis() - speechStartTime > 1200)) {
            Serial.println("[Audio] Silence detected after speech turn -> "
                            "queuing turnComplete");
            isSpeakingDetected = false;
            ControlEvent evt = EVT_TURN_COMPLETE;
            xQueueSend(controlEventQueue, &evt, 0);
          }
        }

        size_t copyLen = monoSampleCount * sizeof(int16_t);
        if (copyLen > sizeof(msg.data)) copyLen = sizeof(msg.data);
        memcpy(msg.data, micBuffer, copyLen);
        msg.len = copyLen;
        // Non-blocking: if the queue is full (loop() briefly busy), drop this
        // chunk rather than stalling the I2S read cadence.
        xQueueSend(audioOutQueue, &msg, 0);
      }
    } else {
      // Drain I2S buffer to prevent overflow accumulation while not streaming
      if (tcpClient.connected()) {
        i2s_channel_read(i2sRxChan, stereoBuffer, sizeof(stereoBuffer), &bytesRead, 10);
      }
      vTaskDelay(pdMS_TO_TICKS(10));
    }
  }
}

// Speaker audio playback task on Core 0.
// Drains audioPlaybackQueue (filled by handleFrame() on Core 1) and writes
// each stereo PCM chunk to the I2S TX DMA with portMAX_DELAY. Running this
// on Core 0 means Core 1's loop()/pollIncoming()/TCP path is NEVER blocked
// by an i2s_channel_write() call - the root cause of the Standby->Speaking->
// Connecting reconnect loop observed when portMAX_DELAY was called directly
// from handleFrame(). Core 0 also hosts audioMicTask (priority 5); this task
// runs at priority 4 so mic reads always take precedence, matching the
// established read/write priority order in the ESP-IDF I2S examples.
void audioPlaybackTask(void *param) {
  static PlaybackChunkMsg msg;
  while (true) {
    if (xQueueReceive(audioPlaybackQueue, &msg, portMAX_DELAY) == pdTRUE) {
      size_t bytesWritten = 0;
      // portMAX_DELAY here is safe: this is Core 0, not the TCP loop.
      // The DMA drains at 16kHz stereo 16-bit = 64KB/s, so each
      // AUDIO_CHUNK_SAMPLES (512 stereo samples = 2048 bytes) chunk
      // completes in ~32ms worst-case.
      i2s_channel_write(i2sTxChan, msg.data, msg.len, &bytesWritten, portMAX_DELAY);
    }
  }
}

void setup() {
  Serial.begin(115200);
  // ROOT CAUSE of the "short/empty mic recording" bug: ESP32-S3's native
  // USB-Serial/JTAG Serial (HWCDC) blocks in write() - via
  // xSemaphoreTake(tx_lock, tx_timeout_ms) - whenever its small TX ring
  // buffer fills, waiting for the host to drain it. A standalone i2s mic
  // read-rate test (60 buffers, no WiFi/TCP/Gemini involved at all) proved
  // this directly: with a Serial.printf() on every buffer, 60 reads took
  // 47.4s wall-clock (avg 790ms/buf) despite each individual
  // i2s_channel_read() itself completing in ~15ms; removing the per-buffer
  // printf alone dropped the same 60-buffer test to 918ms (avg 15ms/buf) -
  // a ~50x difference from Serial.printf() blocking, not the mic/codec/I2S
  // config at all. This app logs from audioMicTask() and elsewhere
  // throughout every session, so in real use those calls were stalling the
  // mic task for hundreds of ms at a time. Setting the TX timeout to 0
  // makes write() return immediately instead of blocking when the buffer is
  // full, silently dropping serial output rather than starving the task
  // that called it.
  Serial.setTxTimeoutMs(0);
  delay(500);
  Serial.println("===============================================");
  Serial.println("  IMS ESP32-S3-BOX-3 Hardware Terminal");
  Serial.println("===============================================");

  // 1. Initialise LovyanGFX Display & Touch. GPIO48 is NOT the LCD reset pin
  // (see LGFX_BOX3 class above) - leave it as input_pullup, matching
  // LovyanGFX's own validated board_ESP32_S3_BOX_V3 profile, since it may
  // serve another purpose on this board that a driven output would disturb.
  lgfx::pinMode(GPIO_NUM_48, lgfx::pin_mode_t::input_pullup);
  bool panelInitOk = tft.init();
  Serial.printf("[Hardware] tft.init() returned: %s (width=%d height=%d)\n",
                panelInitOk ? "OK" : "FAILED", tft.width(), tft.height());
  tft.setRotation(1);
  tft.setBrightness(180);
  renderScreen(true);

  // 2. Audio Hardware setup
  initAudioHardware();

  // Boot-time speaker self-test: plays automatically, no touch involved, so
  // speaker output can be confirmed (or ruled out) independently of the
  // touchscreen and before WiFi/Gemini are even in the picture.
  playChime();

  // DIAGNOSTIC: standalone mic read-rate test, no WiFi/TCP/Gemini running
  // yet at all - isolates whether the live app's severe mic-read stall is
  // inherent to the i2s_std config itself or caused by contention once
  // WiFi/TCP/Gemini are active. See micReadRateTest() for detail.
  delay(1000);
  micReadRateTest();

  // 3. Wi-Fi Connection
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[WiFi] Connecting to ");
  Serial.println(WIFI_SSID);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    renderScreen();
  }
  Serial.println(" Connected!");
  Serial.printf("[WiFi] IP Address: %s\n", WiFi.localIP().toString().c_str());

  currentState = STATE_CONNECTING_SERVER;
  renderScreen(true);

  // 4. Connect raw TCP socket to backend (polling-style WiFiClient - no
  // event callback to register; pollIncoming()/loop() drive reconnects).
  connectToBackend();

  // 5. Create Core0 <-> Core1 hand-off queues before the audio tasks can
  // possibly use them, then pin both audio tasks to Core 0 (leaving Core 1
  // exclusively for WiFi, TCP polling & UI render).
  // audioPlaybackQueue is Core1->Core0: handleFrame() (Core 1) pushes
  // resampled stereo PCM; audioPlaybackTask() (Core 0) drains it to I2S TX.
  // This decoupling means Core 1 is NEVER blocked by i2s_channel_write(),
  // which was causing TCP disconnects when portMAX_DELAY held Core 1 for
  // up to ~600ms per large Gemini audio frame.
  audioOutQueue = xQueueCreate(8, sizeof(AudioChunkMsg));
  controlEventQueue = xQueueCreate(4, sizeof(ControlEvent));
  debugQueue = xQueueCreate(8, sizeof(DebugMsg));
  audioPlaybackQueue = xQueueCreate(16, sizeof(PlaybackChunkMsg));
  xTaskCreatePinnedToCore(audioMicTask, "MicTask", 8192, NULL, 5, NULL, 0);
  xTaskCreatePinnedToCore(audioPlaybackTask, "PlaybackTask", 4096, NULL, 4, NULL, 0);
}

void loop() {
  // Connection management: reconnect on an 8s interval (prevents
  // session-kill thrash), and detect the connect/disconnect edge via
  // wasConnected so state only resets once per actual transition.
  bool nowConnected = tcpClient.connected();
  if (!nowConnected && wasConnected) {
    Serial.println("[TCP] Disconnected from IMS Server - Reconnecting...");
    currentState = STATE_CONNECTING_SERVER;
    isSetupAcknowledged = false;
    geminiSetupComplete = false;
    micStreamingActive = false;
  }
  wasConnected = nowConnected;

  static unsigned long lastReconnectAttempt = 0;
  if (!nowConnected && (millis() - lastReconnectAttempt > 8000)) {
    lastReconnectAttempt = millis();
    connectToBackend();
  }

  pollIncoming();

  // Drain Core0 -> Core1 hand-off queues: this is the only place
  // sendFrame()/sendTurnComplete() may be called from, so they never race
  // with pollIncoming() above or with each other.
  AudioChunkMsg outMsg;
  while (xQueueReceive(audioOutQueue, &outMsg, 0) == pdTRUE) {
    sendFrame(0x01, outMsg.data, outMsg.len);
  }
  ControlEvent evt;
  while (xQueueReceive(controlEventQueue, &evt, 0) == pdTRUE) {
    if (evt == EVT_TURN_COMPLETE) {
      sendTurnComplete();
    }
  }
  DebugMsg dmsg;
  while (xQueueReceive(debugQueue, &dmsg, 0) == pdTRUE) {
    sendDebug(dmsg.text);
  }

  // Heartbeat so we can tell "connected but idle" apart from "not receiving
  // telemetry at all" in the backend log.
  static unsigned long lastHeartbeat = 0;
  if (millis() - lastHeartbeat > 5000) {
    lastHeartbeat = millis();
    char hb[48];
    snprintf(hb, sizeof(hb), "heartbeat state=%d", (int)currentState);
    sendDebug(hb);
  }

  renderScreen();

  // Physical Top Button (MUTE_BTN_PIN = GPIO 1, Active LOW) - same
  // touch-to-talk trigger as the screen.
  static int lastBtnState = HIGH;
  int btnState = digitalRead(MUTE_BTN_PIN);
  if (btnState == LOW && lastBtnState == HIGH) {
    Serial.println("[Button] Talk button pressed!");
    if (currentState == STATE_STANDBY) {
      beginListening("button");
    } else {
      currentState = STATE_STANDBY;
      micStreamingActive = false;
      lastTranscript = "Tap screen to ask a question";
      renderScreen(true);
    }
    delay(50); // debounce
  }
  lastBtnState = btnState;

  // Auto-return to STANDBY after idle conversation - covers LISTENING (user
  // never spoke) and THINKING (Gemini never responded at all, e.g. its VAD
  // never fired) so the mic doesn't stream indefinitely in either case.
  if ((currentState == STATE_LISTENING || currentState == STATE_THINKING) &&
      (millis() - lastSpeechTimestamp > SESSION_IDLE_TIMEOUT_MS)) {
    sendDebug("session_idle_timeout");
    currentState = STATE_STANDBY;
    micStreamingActive = false;
    lastTranscript = "Tap screen to ask a question";
    renderScreen(true);
  }

  // Force a periodic redraw while LISTENING so the mic-level pulse ring
  // (see renderScreen()) actually animates - renderScreen() otherwise skips
  // redrawing whenever the state itself hasn't changed.
  if (currentState == STATE_LISTENING) {
    static unsigned long lastPulseRedraw = 0;
    if (millis() - lastPulseRedraw > 100) {
      lastPulseRedraw = millis();
      drawOrbPulse();
    }
  }

  // Touch feedback
  uint16_t touchX, touchY;
  if (tft.getTouch(&touchX, &touchY)) {
    if (currentState == STATE_SPEAKING) {
      // User interrupted Gemini: switch to listening
      currentState = STATE_LISTENING;
      micStreamingActive = true;
      lastSpeechTimestamp = millis();
      lastTranscript = "Interrupted by user";
      renderScreen(true);
    } else if (currentState == STATE_STANDBY) {
      // Touch-to-talk: start listening for the user's spoken question
      beginListening("touch");
    } else if (currentState == STATE_LISTENING) {
      // Manual touch sleep
      currentState = STATE_STANDBY;
      micStreamingActive = false;
      lastTranscript = "Tap screen to ask a question";
      renderScreen(true);
    }
    delay(200);
  }
}
