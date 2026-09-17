/**
 * IMS ESP32-S3-BOX-3 Hardware Conversational Terminal
 * Bidirectional PCM Streaming Client for Gemini Live via IMS Proxy
 */

#include "config.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <WebSocketsClient.h>
#include <WiFi.h>
#include <esp32-hal-i2c.h>
#include <cstring>
#include <driver/i2c.h> // for the I2C_NUM_0 port-number type only
#include <driver/i2s.h>

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
WebSocketsClient webSocket;
bool isSetupAcknowledged = false;
volatile bool geminiSetupComplete =
    false; // Set true only after Gemini sends setupComplete ACK
String lastTranscript = "Tap screen to ask a question";
unsigned long lastSpeechTimestamp = 0;
const unsigned long SESSION_IDLE_TIMEOUT_MS = 14000;

// Audio Queue: Core 0 (audioMicTask) produces mic chunks, Core 1 (loop) is the
// ONLY task that ever touches webSocket or tft, since neither WebSocketsClient
// nor LovyanGFX is safe to call concurrently from two FreeRTOS tasks/cores.
struct AudioChunkMsg {
  uint8_t data[AUDIO_CHUNK_SAMPLES * sizeof(int16_t)];
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

  // State Orb
  tft.fillCircle(160, 85, 28, statusColor);
  tft.drawCircle(160, 85, 34, tft.color565(50, 60, 80));
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

// NOTE: LovyanGFX's Touch_GT911 driver already owns the I2C0 peripheral on
// GPIO8/GPIO18 (see LGFX_BOX3 touch config above), since the BOX-3 hardware
// wires the touch controller and both audio codecs onto the SAME physical
// I2C bus - confirmed by the "esp32-hal-i2c.c: i2cInit()" log line LGFX's
// touch init already prints at boot. Two earlier attempts at this both had
// real problems: calling Wire.begin() again double-installs the same
// peripheral (the original hang/crash bug), while calling the legacy
// driver/i2c.h API (i2c_master_write_to_device) targets a completely
// different, never-installed driver stack that silently "succeeds" without
// ever touching real hardware. i2cWrite() is the plain C function that
// TwoWire::endTransmission() itself calls internally - using it directly
// reuses the exact bus LGFX already initialized, with no double-install and
// no dependency on Wire's own (separately allocated, and in this shared-bus
// case never allocated) TX/RX buffers.
void writeCodecReg(uint8_t i2c_addr, uint8_t reg, uint8_t val) {
  uint8_t buf[2] = {reg, val};
  esp_err_t err = i2cWrite(0, i2c_addr, buf, sizeof(buf), 100);
  if (err != ESP_OK) {
    Serial.printf("[Hardware] I2C write failed (addr=0x%02X reg=0x%02X): %s\n",
                  i2c_addr, reg, esp_err_to_name(err));
  }
}

void initCodecChips() {
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
  writeCodecReg(0x40, 0x00, 0xFF); // Reset all registers
  delay(20);
  writeCodecReg(0x40, 0x00, 0x32); // Reset configuration
  writeCodecReg(0x40, 0x09, 0x30); // Time control 0
  writeCodecReg(0x40, 0x0A, 0x30); // Time control 1
  writeCodecReg(0x40, 0x23, 0x2A); // ADC1/2 high-pass filter 1
  writeCodecReg(0x40, 0x22, 0x0A); // ADC1/2 high-pass filter 2
  writeCodecReg(0x40, 0x21, 0x2A); // ADC3/4 high-pass filter 1
  writeCodecReg(0x40, 0x20, 0x0A); // ADC3/4 high-pass filter 2
  writeCodecReg(0x40, 0x40, 0xC3); // Analog front-end power up
  writeCodecReg(0x40, 0x47, 0x08); // MIC1 channel power
  writeCodecReg(0x40, 0x48, 0x08); // MIC2 channel power
  writeCodecReg(0x40, 0x49, 0x08); // MIC3 channel power (unused, harmless)
  writeCodecReg(0x40, 0x4A, 0x08); // MIC4 channel power (unused, harmless)
  writeCodecReg(0x40, 0x06, 0x04); // Power down DLL (required bring-up step)
  writeCodecReg(0x40, 0x4B, 0x0F); // MIC1/2 power enable
  writeCodecReg(0x40, 0x4C, 0x0F); // MIC3/4 power enable
  // I2S format: standard I2S, 16-bit, non-TDM (single mono RX channel)
  writeCodecReg(0x40, 0x0B, 0x60); // SDP interface1: I2S fmt(0x00) | 16-bit(0x60)
  writeCodecReg(0x40, 0x0C, 0x00); // SDP interface2: TDM disabled
  // Sample rate: 16kHz via 4.096MHz MCLK (256x ratio), from the official
  // coefficient table for {mclk=4096000, lrck=16000}
  writeCodecReg(0x40, 0x07, 0x20); // OSR
  writeCodecReg(0x40, 0x02, 0xC1); // adc_div=1 | doubler<<6 | dll<<7
  writeCodecReg(0x40, 0x04, 0x01); // LRCK divider high byte
  writeCodecReg(0x40, 0x05, 0x00); // LRCK divider low byte
  writeCodecReg(0x40, 0x41, 0x70); // MIC1/2 bias 2.87V
  writeCodecReg(0x40, 0x42, 0x70); // MIC3/4 bias 2.87V
  writeCodecReg(0x40, 0x43, 0x1E); // MIC1 gain (37.5dB | enable bit)
  writeCodecReg(0x40, 0x44, 0x1E); // MIC2 gain (37.5dB | enable bit)
  writeCodecReg(0x40, 0x00, 0x71); // Enable device
  writeCodecReg(0x40, 0x00, 0x41); // Enable device (final)

  // 2. Initialise ES8311 Speaker DAC (I2C Addr: 0x18)
  writeCodecReg(0x18, 0x00, 0x80); // Reset
  delay(20);
  writeCodecReg(0x18, 0x01, 0xBF); // Clock manager enable
  writeCodecReg(0x18, 0x02, 0x00); // Normal operation
  writeCodecReg(0x18, 0x03, 0x10); // Power on analog
  writeCodecReg(0x18, 0x12, 0x00); // System power up
  writeCodecReg(0x18, 0x13, 0x10); // Output enable
  writeCodecReg(0x18, 0x32, 0xC0); // Volume (0xBF = ~0dB)
  Serial.println("[Hardware] ES7210 & ES8311 initialized successfully.");
}

void initAudioHardware() {
  Serial.println("[Hardware] Initializing I2S for BOX-3 Codec...");

  // Configure MUTE Button (GPIO 1, active LOW)
  pinMode(MUTE_BTN_PIN, INPUT_PULLUP);

  // Configure Power Amplifier pin
  pinMode(PA_ENABLE_PIN, OUTPUT);
  digitalWrite(PA_ENABLE_PIN, HIGH); // Enable speaker amp

  // Configure I2C audio chips
  initCodecChips();

  // Configure I2S driver for full duplex audio. A known-working reference
  // config for this exact board (ESPHome i2s_audio + es7210 component,
  // AlmostInteractive/ESP32-S3-Box-3-Voice-Assistant-Sensor-Dock) uses a
  // single mono data line for the mic, not stereo - reverting the earlier
  // stereo experiment now that the real bug (WS pin) is fixed.
  i2s_config_t i2s_config = {
      .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX | I2S_MODE_RX),
      .sample_rate = MIC_SAMPLE_RATE,
      .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
      .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
      .communication_format = I2S_COMM_FORMAT_STAND_I2S,
      .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
      .dma_buf_count = 8,
      .dma_buf_len = AUDIO_CHUNK_SAMPLES,
      .use_apll = true,
      .tx_desc_auto_clear = true};

  i2s_pin_config_t pin_config = {.mck_io_num = I2S_MCLK_PIN,
                                 .bck_io_num = I2S_BCLK_PIN,
                                 .ws_io_num = I2S_WS_PIN,
                                 .data_out_num = I2S_DOUT_PIN,
                                 .data_in_num = I2S_DIN_PIN};

  i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_NUM_0, &pin_config);
  i2s_zero_dma_buffer(I2S_NUM_0);
  Serial.println("[Hardware] I2S Driver installed successfully.");
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
  webSocket.sendTXT(jsonString);
}

// Sends a debug telemetry string to the backend over the existing WebSocket
// (backend just logs and drops it - see hardwareClientService/index.js).
// Core 1 only, same as every other webSocket.* call in this file.
void sendDebug(const char *text) {
  if (!webSocket.isConnected()) return;
  String msg = "{\"debug\":\"" + String(text) + "\"}";
  webSocket.sendTXT(msg);
}

// Touch-to-talk: no wake word, no synthetic greeting turn sent to Gemini.
// Just flip to LISTENING so audioMicTask (Core 0) starts enqueueing real mic
// audio for Core 1 to stream, and the user speaks their actual question.
void beginListening(const char *reason) {
  if (!webSocket.isConnected() || !geminiSetupComplete) {
    Serial.printf("[IMS] beginListening(%s) blocked - ws=%d setup=%d\n",
                  reason, webSocket.isConnected(), geminiSetupComplete);
    sendDebug("beginListening_blocked");
    lastTranscript = "Still connecting to Gemini...";
    renderScreen(true);
    return;
  }
  Serial.printf("[IMS] Starting listening session (%s)...\n", reason);
  sendDebug((String("listening_start:") + reason).c_str());
  currentState = STATE_LISTENING;
  lastSpeechTimestamp = millis();
  lastTranscript = "Listening...";
  renderScreen(true);
}

void sendTurnComplete() {
  if (!webSocket.isConnected() || !geminiSetupComplete) return;
  Serial.println("[IMS] Sending realtimeInput turnComplete signal to Gemini...");
  // Gemini Multimodal Live API expects clientContent to have non-empty parts,
  // or realtimeInput with endOfTurn to commit speech stream.
  JsonDocument doc;
  JsonObject clientContent = doc["clientContent"].to<JsonObject>();
  JsonArray turns = clientContent["turns"].to<JsonArray>();
  JsonObject turn = turns.add<JsonObject>();
  turn["role"] = "user";
  JsonArray parts = turn["parts"].to<JsonArray>();
  JsonObject part = parts.add<JsonObject>();
  part["text"] = "."; // Minimal non-empty turn anchor
  clientContent["turnComplete"] = true;

  String turnStr;
  serializeJson(doc, turnStr);
  webSocket.sendTXT(turnStr);
  currentState = STATE_THINKING;
  renderScreen(true);
}

bool usingFallback = false;
int connectionAttempts = 0;

void connectToBackend() {
  webSocket.disconnect();
  Serial.printf("[WS] Connecting to PRIMARY (Local LAN): %s:%d%s\n",
                IMS_PRIMARY_HOST, IMS_PRIMARY_PORT, IMS_PRIMARY_PATH);
  webSocket.begin(IMS_PRIMARY_HOST, IMS_PRIMARY_PORT, IMS_PRIMARY_PATH);
}

void webSocketEvent(WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
  case WStype_DISCONNECTED:
    Serial.println("[WS] Disconnected from IMS Server - Reconnecting...");
    currentState = STATE_CONNECTING_SERVER;
    isSetupAcknowledged = false;
    geminiSetupComplete = false; // Reset on disconnect
    break;

  case WStype_CONNECTED:
    Serial.printf("[WS] Connected to: %s\n", payload);
    // Stay in CONNECTING_SERVER (not STANDBY) until Gemini actually ACKs the
    // setup handshake below — otherwise the screen invites a tap/wake before
    // the backend is ready, and beginListening() silently no-ops.
    currentState = STATE_CONNECTING_SERVER;
    connectionAttempts = 0;
    isSetupAcknowledged = true;
    geminiSetupComplete = false; // Will be set true when Gemini ACKs setup
    sendSetupHandshake();
    break;

  case WStype_TEXT: {
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, payload, length);
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
        currentState = STATE_LISTENING;
        lastSpeechTimestamp = millis();
        renderScreen(true);
      }
      if (doc["serverContent"].is<JsonObject>()) {
        JsonObject serverContent = doc["serverContent"];
        if (serverContent["modelTurn"].is<JsonObject>()) {
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
          currentState = STATE_LISTENING;
          lastSpeechTimestamp = millis();
          renderScreen(true);
        }
      }
    } else {
      Serial.printf("[WS] JSON parse error: %s\n", error.c_str());
      Serial.printf("[WS] Raw payload: %.*s\n", (int)min(length, (size_t)200),
                    (char *)payload);
    }
    break;
  }

  case WStype_BIN: {
    // Non-blocking incoming 24kHz PCM audio from IMS proxy
    size_t bytesWritten = 0;
    i2s_write(I2S_NUM_0, payload, length, &bytesWritten, pdMS_TO_TICKS(50));
    lastSpeechTimestamp = millis();
    break;
  }

  case WStype_ERROR:
    Serial.printf("[WS] ERROR from server: %s\n",
                  payload ? (char *)payload : "(no payload)");
    break;
  }
}

// Energy-based silence detection while actively LISTENING (tuned for BOX-3
// dual mic array + ES7210 gain). Touch/button is the only trigger into
// LISTENING now — this threshold only decides when the user has stopped
// talking so we can close the turn.
#define VOICE_ENERGY_THRESHOLD 25

// Audio Recording & Ingestion Task on Core 0.
// This task NEVER calls webSocket.* or tft.* directly — those are only safe
// to call from Core 1 (loop()), since neither WebSocketsClient nor LovyanGFX
// tolerates concurrent access from two tasks/cores. Instead this task hands
// off work via audioOutQueue / controlEventQueue for loop() to drain.
void audioMicTask(void *param) {
  int16_t micBuffer[AUDIO_CHUNK_SAMPLES];
  size_t bytesRead = 0;
  unsigned long speechStartTime = 0;
  bool isSpeakingDetected = false;

  while (true) {
    // Only stream audio when Gemini has fully acknowledged setup
    // This prevents binary audio from reaching the server before the
    // setup text message, which causes Gemini to reject with 1007.
    if (webSocket.isConnected() && geminiSetupComplete) {
      i2s_read(I2S_NUM_0, micBuffer, sizeof(micBuffer), &bytesRead,
               portMAX_DELAY);
      if (bytesRead > 0 && currentState == STATE_LISTENING) {
        int64_t sumSquare = 0;
        int sampleCount = bytesRead / sizeof(int16_t);
        for (int i = 0; i < sampleCount; i++) {
          sumSquare += ((int32_t)micBuffer[i] * (int32_t)micBuffer[i]);
        }
        int rms = (int)sqrt((double)(sumSquare / sampleCount));

        static unsigned long lastRmsLog = 0;
        if (millis() - lastRmsLog > 500) {
          lastRmsLog = millis();
          Serial.printf("[Mic] RMS=%d (threshold=%d) sample0=%d\n", rms,
                        VOICE_ENERGY_THRESHOLD / 2, micBuffer[0]);
          DebugMsg dmsg;
          snprintf(dmsg.text, sizeof(dmsg.text), "rms=%d sample0=%d", rms,
                   micBuffer[0]);
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

        AudioChunkMsg msg;
        size_t copyLen = min(bytesRead, sizeof(msg.data));
        memcpy(msg.data, micBuffer, copyLen);
        msg.len = copyLen;
        // Non-blocking: if the queue is full (loop() briefly busy), drop this
        // chunk rather than stalling the I2S read cadence.
        xQueueSend(audioOutQueue, &msg, 0);
      }
    } else {
      // Drain I2S buffer to prevent overflow accumulation while not streaming
      if (webSocket.isConnected()) {
        i2s_read(I2S_NUM_0, micBuffer, sizeof(micBuffer), &bytesRead, 10);
      }
      vTaskDelay(pdMS_TO_TICKS(10));
    }
  }
}

void setup() {
  Serial.begin(115200);
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

  // 4. Connect WebSocket to backend (primary with automatic fallback)
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(8000); // 8s prevents session-kill thrash
  connectToBackend();

  // 5. Create the Core0 -> Core1 hand-off queues before the audio task can
  // possibly use them, then pin mic audio task to Core 0 (leaving Core 1 for
  // WiFi, WS event loop & UI render)
  audioOutQueue = xQueueCreate(8, sizeof(AudioChunkMsg));
  controlEventQueue = xQueueCreate(4, sizeof(ControlEvent));
  debugQueue = xQueueCreate(8, sizeof(DebugMsg));
  xTaskCreatePinnedToCore(audioMicTask, "MicTask", 4096, NULL, 5, NULL, 0);
}

void loop() {
  // Drain Core0 -> Core1 hand-off queues FIRST: this is the only place
  // webSocket.sendBIN()/sendTurnComplete() may be called from, so they never
  // race with webSocket.loop() below or with each other.
  AudioChunkMsg outMsg;
  while (xQueueReceive(audioOutQueue, &outMsg, 0) == pdTRUE) {
    if (webSocket.isConnected()) {
      webSocket.sendBIN(outMsg.data, outMsg.len);
    }
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

  webSocket.loop();
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
      lastTranscript = "Tap screen to ask a question";
      renderScreen(true);
    }
    delay(50); // debounce
  }
  lastBtnState = btnState;

  // Auto-return to STANDBY after idle conversation
  if (currentState == STATE_LISTENING &&
      (millis() - lastSpeechTimestamp > SESSION_IDLE_TIMEOUT_MS)) {
    currentState = STATE_STANDBY;
    lastTranscript = "Tap screen to ask a question";
    renderScreen(true);
  }

  // Touch feedback
  uint16_t touchX, touchY;
  if (tft.getTouch(&touchX, &touchY)) {
    if (currentState == STATE_SPEAKING) {
      // User interrupted Gemini: switch to listening
      currentState = STATE_LISTENING;
      lastSpeechTimestamp = millis();
      lastTranscript = "Interrupted by user";
      renderScreen(true);
    } else if (currentState == STATE_STANDBY) {
      // Touch-to-talk: start listening for the user's spoken question
      beginListening("touch");
    } else if (currentState == STATE_LISTENING) {
      // Manual touch sleep
      currentState = STATE_STANDBY;
      lastTranscript = "Tap screen to ask a question";
      renderScreen(true);
    }
    delay(200);
  }
}
