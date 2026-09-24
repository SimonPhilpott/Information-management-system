/**
 * IMS ESP32-S3-BOX-3 Hardware Conversational Terminal
 * Bidirectional PCM Streaming Client for Gemini Live via IMS Proxy
 */

#include "config.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <lwip/sockets.h>
#include <lwip/netdb.h>
#include <lwip/inet.h>
#include <fcntl.h>
#include <errno.h>
#include <HTTPClient.h> // Phase 4/5 personality settings: POST/GET to the backend's device/personality endpoint
#include <Preferences.h> // NVS cache for the settings screen, so it redraws instantly on boot without a network round trip
#include <cstring>
#include <driver/i2c.h> // for the I2C_NUM_0 port-number type only
#include <esp_system.h> // esp_reset_reason() - see connectToBackend()
#include <esp_heap_caps.h> // heap_caps_get_free_size() - see the heartbeat in loop()
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
  // A local energy spike happened, so a short burst of audio is being sent to
  // Gemini to judge whether it was actually one of Ims's wake phrases - the
  // RMS gate that triggers this has no idea what was actually said, only
  // that something was loud enough to maybe be speech. Renders identically
  // to STANDBY so a false trigger (background noise) is invisible on screen;
  // only a confirmed wake phrase (real audio arriving) or a deliberate touch
  // visibly changes state.
  STATE_VERIFYING,
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
// High-performance raw BSD/lwIP socket transport replacing Arduino WiFiClient.
// Eliminates the internal 1436-byte NetworkClientRxBuffer drop bottleneck
// that caused audio waveform discontinuities and speaker crackle during playback.
class RawTcpClient {
private:
  int sock;
  volatile bool _connected;

public:
  RawTcpClient() : sock(-1), _connected(false) {}

  ~RawTcpClient() {
    stop();
  }

  bool connect(const char *host, uint16_t port) {
    stop();

    sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (sock < 0) {
      Serial.printf("[TCP] socket() creation failed: errno %d\n", errno);
      return false;
    }

    // 1. Expand Receive Buffer to 16KB (bypassing the 1436-byte WiFiClient Rx buffer drop)
    int rcvBufSize = 16384;
    if (setsockopt(sock, SOL_SOCKET, SO_RCVBUF, &rcvBufSize, sizeof(rcvBufSize)) < 0) {
      Serial.printf("[TCP] setsockopt SO_RCVBUF failed: errno %d\n", errno);
    }

    // 2. Expand Send Buffer to 8KB for smooth mic packet bursts
    int sndBufSize = 8192;
    setsockopt(sock, SOL_SOCKET, SO_SNDBUF, &sndBufSize, sizeof(sndBufSize));

    // 3. Disable Nagle's algorithm for low-latency streaming
    int nodelay = 1;
    setsockopt(sock, IPPROTO_TCP, TCP_NODELAY, &nodelay, sizeof(nodelay));

    // 4. Resolve destination host
    struct sockaddr_in serverAddr;
    memset(&serverAddr, 0, sizeof(serverAddr));
    serverAddr.sin_family = AF_INET;
    serverAddr.sin_port = htons(port);

    if (inet_pton(AF_INET, host, &serverAddr.sin_addr) <= 0) {
      struct hostent *he = gethostbyname(host);
      if (!he || !he->h_addr_list || !he->h_addr_list[0]) {
        Serial.printf("[TCP] Host resolve failed for %s\n", host);
        stop();
        return false;
      }
      memcpy(&serverAddr.sin_addr, he->h_addr_list[0], he->h_length);
    }

    // 5. Connect with 4-second timeout
    struct timeval tv;
    tv.tv_sec = 4;
    tv.tv_usec = 0;
    setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

    if (::connect(sock, (struct sockaddr *)&serverAddr, sizeof(serverAddr)) < 0) {
      Serial.printf("[TCP] connect() to %s:%u failed: errno %d\n", host, port, errno);
      stop();
      return false;
    }

    // 6. Set non-blocking mode on the socket for polling
    int flags = fcntl(sock, F_GETFL, 0);
    fcntl(sock, F_SETFL, flags | O_NONBLOCK);

    _connected = true;
    return true;
  }

  void stop() {
    _connected = false;
    if (sock >= 0) {
      close(sock);
      sock = -1;
    }
  }

  bool connected() const {
    return _connected && (sock >= 0);
  }

  // Returns number of bytes ready to read without blocking
  int available() {
    if (sock < 0 || !_connected) return 0;
    int count = 0;
    if (ioctl(sock, FIONREAD, &count) < 0) {
      if (errno != EAGAIN && errno != EWOULDBLOCK) {
        Serial.printf("[TCP] ioctl FIONREAD failed: errno %d\n", errno);
        stop();
      }
      return 0;
    }
    return count;
  }

  // Reads up to len bytes in non-blocking mode.
  // Returns >0: bytes read
  // Returns 0: nothing ready (EAGAIN/EWOULDBLOCK)
  // Returns -1: peer disconnected or fatal socket error
  int read(uint8_t *buf, size_t len) {
    if (sock < 0 || !_connected) return -1;
    if (len == 0) return 0;

    ssize_t n = recv(sock, buf, len, 0);
    if (n > 0) {
      return (int)n;
    }
    if (n == 0) {
      Serial.println("[TCP] Connection closed by peer (EOF)");
      stop();
      return -1;
    }
    if (errno == EAGAIN || errno == EWOULDBLOCK) {
      return 0;
    }
    Serial.printf("[TCP] recv() failed: errno %d\n", errno);
    stop();
    return -1;
  }

  // Sends up to len bytes in non-blocking mode
  int write(const uint8_t *buf, size_t len) {
    if (sock < 0 || !_connected) return -1;
    if (len == 0) return 0;

    ssize_t n = send(sock, buf, len, 0);
    if (n >= 0) {
      return (int)n;
    }
    if (errno == EAGAIN || errno == EWOULDBLOCK) {
      return 0;
    }
    Serial.printf("[TCP] send() failed: errno %d\n", errno);
    stop();
    return -1;
  }
};

RawTcpClient tcpClient;

bool wasConnected = false; // detects the connect/disconnect edge in loop()
// True once a real wake phrase (or a touch) has actually opened a
// conversation - as long as this stays true, SPEAKING hands straight back to
// LISTENING for the next turn instead of dropping to STANDBY, so the user
// doesn't have to repeat a wake phrase for every follow-up sentence. Cleared
// when Gemini calls endConversation (see handleFrame()) or the session times
// out/gets muted.
volatile bool conversationOpen = false;
// Set by the endConversation tool call; consumed the next time STATE_SPEAKING
// finishes so the farewell reply plays out in full before the conversation
// actually closes.
volatile bool conversationShouldClose = false;
// 0 = neutral (the phase-based idle/listening/thinking/speaking face this
// firmware already draws). 1-14 = one of the emotions below, set by Gemini's
// setEmotion tool call (see handleFrame()) and reflected by the face whether
// IMS is currently speaking or resting afterward. Reset to neutral whenever a
// brand new conversation opens (see beginVerifying()/beginListening()) so a
// leftover expression from a previous exchange doesn't linger indefinitely.
volatile int currentEmotion = 0;
// millis() timestamp of the last setEmotion call - loop() reverts to neutral
// once EMOTION_DECAY_MS has passed with no new one, so an expression doesn't
// sit on IMS's face indefinitely after a reply finishes.
volatile unsigned long emotionSetAtMs = 0;
#define EMOTION_DECAY_MS 20000
enum FaceEmotion {
  EMOTION_NEUTRAL = 0,
  EMOTION_JOY,
  EMOTION_COCKY,
  EMOTION_LOVE,
  EMOTION_AMAZEMENT,
  EMOTION_SUSPICIOUS,
  EMOTION_CONFUSED,
  EMOTION_SAD,
  EMOTION_DEVASTATED,
  EMOTION_ANGER,
  EMOTION_RAGE,
  EMOTION_FEAR,
  EMOTION_DISGUSTED,
  EMOTION_BORED,
  EMOTION_SLEEPY
};
int emotionFromName(const char *name) {
  if (!name) return EMOTION_NEUTRAL;
  if (strcmp(name, "joy") == 0) return EMOTION_JOY;
  if (strcmp(name, "cocky") == 0) return EMOTION_COCKY;
  if (strcmp(name, "love") == 0) return EMOTION_LOVE;
  if (strcmp(name, "amazement") == 0) return EMOTION_AMAZEMENT;
  if (strcmp(name, "suspicious") == 0) return EMOTION_SUSPICIOUS;
  if (strcmp(name, "confused") == 0) return EMOTION_CONFUSED;
  if (strcmp(name, "sad") == 0) return EMOTION_SAD;
  if (strcmp(name, "devastated") == 0) return EMOTION_DEVASTATED;
  if (strcmp(name, "anger") == 0) return EMOTION_ANGER;
  if (strcmp(name, "rage") == 0) return EMOTION_RAGE;
  if (strcmp(name, "fear") == 0) return EMOTION_FEAR;
  if (strcmp(name, "disgusted") == 0) return EMOTION_DISGUSTED;
  if (strcmp(name, "bored") == 0) return EMOTION_BORED;
  if (strcmp(name, "sleepy") == 0) return EMOTION_SLEEPY;
  return EMOTION_NEUTRAL;
}
const char *emotionName(int emotion) {
  switch (emotion) {
    case EMOTION_JOY: return "joy";
    case EMOTION_COCKY: return "cocky";
    case EMOTION_LOVE: return "love";
    case EMOTION_AMAZEMENT: return "amazement";
    case EMOTION_SUSPICIOUS: return "suspicious";
    case EMOTION_CONFUSED: return "confused";
    case EMOTION_SAD: return "sad";
    case EMOTION_DEVASTATED: return "devastated";
    case EMOTION_ANGER: return "anger";
    case EMOTION_RAGE: return "rage";
    case EMOTION_FEAR: return "fear";
    case EMOTION_DISGUSTED: return "disgusted";
    case EMOTION_BORED: return "bored";
    case EMOTION_SLEEPY: return "sleepy";
    default: return "neutral";
  }
}
// ---------------------------------------------------------------------------
// Personality settings screen (imspersonality.md Phases 4/5). Five 0-100
// sliders + a voice picker, matching the backend's ims_personality settings
// exactly (same axis order/keys, same defaults) so a value set from either
// side reads the same way. NVS-cached via Preferences so the screen redraws
// with the right handle positions instantly on boot, without waiting on a
// network round trip - matches the plan's own stated reasoning.
//
// Deliberate simplification: this firmware does NOT fetch current values
// from the backend on boot, only on save (POST). If the personality was
// last changed via scripts/setPersonality.js rather than this screen, the
// device's NVS cache will be stale until the next slider touch overwrites
// it - acceptable for now since the screen becomes the primary way to
// change it going forward, but worth knowing.
// ---------------------------------------------------------------------------
#define PERSONALITY_AXIS_COUNT 5
const char *PERSONALITY_AXIS_KEYS[PERSONALITY_AXIS_COUNT] = {"humor", "delivery", "temperament", "social", "formality"};
const char *PERSONALITY_AXIS_LABELS[PERSONALITY_AXIS_COUNT] = {"HUMOR", "DELIVERY", "TEMPERAMENT", "SOCIAL", "FORMALITY"};
// Low/mid/high tier names, exactly matching hardwareClientService.js's
// PERSONALITY_AXES - display-only here (a simple 3-way split), the backend
// does the real continuous blending into the system prompt.
const char *PERSONALITY_TIER_NAMES[PERSONALITY_AXIS_COUNT][3] = {
  {"Cheerful", "Dry", "Dark"},
  {"Tactful", "Candid", "Blunt"},
  {"Pragmatic", "Systematic", "Philosophical"},
  {"Clinical", "Professional", "Empathic"},
  {"Casual", "Articulate", "Academic"}
};
// All 30 prebuilt Gemini voices (ai.google.dev/gemini-api/docs/speech-generation)
// - the Live API's native-audio models (gemini-3.8-live included) support any
// voice from this same TTS voice set, not just the original small Live-API
// subset, so all 30 are offered here rather than the 4 we started with.
const char *PERSONALITY_VOICES[] = {
    "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede",
    "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba",
    "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
    "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi",
    "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat"};
#define PERSONALITY_VOICE_COUNT 30

// Official voice tone and style descriptions from Google Gemini API guidance
// (ai.google.dev/gemini-api/docs/speech-generation)
const char *PERSONALITY_VOICE_DESCRIPTIONS[PERSONALITY_VOICE_COUNT] = {
    "Bright",        // Zephyr
    "Upbeat",        // Puck
    "Informative",   // Charon
    "Firm",          // Kore
    "Excitable",     // Fenrir
    "Youthful",      // Leda
    "Firm",          // Orus
    "Breezy",        // Aoede
    "Easy-going",    // Callirrhoe
    "Bright",        // Autonoe
    "Breathy",       // Enceladus
    "Clear",         // Iapetus
    "Easy-going",    // Umbriel
    "Smooth",        // Algieba
    "Smooth",        // Despina
    "Clear",         // Erinome
    "Gravelly",      // Algenib
    "Informative",   // Rasalgethi
    "Upbeat",        // Laomedeia
    "Soft",          // Achernar
    "Firm",          // Alnilam
    "Even",          // Schedar
    "Mature",        // Gacrux
    "Forward",       // Pulcherrima
    "Friendly",      // Achird
    "Casual",        // Zubenelgenubi
    "Gentle",        // Vindemiatrix
    "Lively",        // Sadachbia
    "Knowledgeable", // Sadaltager
    "Warm"           // Sulafat
};

// Selectable alert tones for fired timers/alarms/reminders (Preferences
// screen) - declared here, ahead of loadPersonalityFromNVS() below, which
// needs ALERT_SOUND_COUNT to clamp a value loaded from NVS. playAlertSound()
// (which actually plays these) lives later, near playChime().
#define ALERT_SOUND_COUNT 4
const char *ALERT_SOUND_NAMES[ALERT_SOUND_COUNT] = {"Chime", "Beep Beep", "Ascending", "Bell"};

#define DEFAULT_VOICE_NAME "Umbriel"
#define DEFAULT_VOICE_INDEX 12

int personalityValues[PERSONALITY_AXIS_COUNT] = {70, 45, 30, 55, 35}; // matches DEFAULT_PERSONALITY in hardwareClientService.js
int personalityVoiceIndex = DEFAULT_VOICE_INDEX; // active saved voice (Umbriel)
int previewVoiceIndex = DEFAULT_VOICE_INDEX;     // voice currently auditioned on voice screen
String activePreviewVoice = "";                  // when non-empty, setup sends this temporary voice for preview only

volatile bool onSettingsScreen = false; // read from audioMicTask() (Core 0), written from loop() (Core 1)
volatile bool onVoiceScreen = false; // settings sub-screen: personality sliders -> voice picker
volatile bool onPrefsScreen = false; // settings sub-screen: voice picker -> preferences
// Preferences: when off, the backend stops creating a capture folder per
// interaction under audio_captures (the always-on debug.log is unaffected).
bool captureLoggingEnabled = true;
// Which tone (see ALERT_SOUND_NAMES/playAlertSound()) plays when a timer,
// alarm, or reminder fires. Purely device-local - unlike captureLogging,
// the backend never needs to know this, since it's the DEVICE that decides
// which sound to play locally on receiving a reminderFired frame.
int alertSoundIndex = 0;

#define VOLUME_LEVEL_COUNT 11
// Register 0x32 (DAC_VOLUME) calibration table from 0% (mute) to 100% (0.0dB max scale)
static const uint8_t VOLUME_REG_TABLE[VOLUME_LEVEL_COUNT] = {
    0x00, // 0%: Mute (-95.5dB)
    0x60, // 10%: -47.5dB
    0x78, // 20%: -35.5dB
    0x8C, // 30%: -25.5dB
    0x9A, // 40%: -18.5dB
    0xA4, // 50%: -13.5dB
    0xAE, // 60%: -8.5dB
    0xB4, // 70%: -5.5dB (default calibrated midpoint)
    0xB8, // 80%: -3.5dB
    0xBC, // 90%: -1.5dB
    0xBF  // 100%: 0.0dB (max scale)
};
int currentVolumeIndex = 7; // Default 70% (-5.5dB)
int settingsDraggingAxis = -1; // -1 = not currently dragging a slider
bool settingsDirty = false;
unsigned long settingsLastChangeMs = 0;
#define SETTINGS_SAVE_DEBOUNCE_MS 600

// Voice/personality preview flow (Phase 5.1, see startPreview() near
// connectToBackend()): both the voice picker's arrows and the personality
// screen's Play button need Gemini to actually SPEAK with the
// just-changed voice/tone, but voice and systemInstruction are both fixed
// at Gemini Live session setup and cannot change mid-session - so a preview
// means reconnecting with the latest saved settings, then sending a text
// turn asking it to say something. This spans several loop() iterations
// (reconnect + Gemini's setupComplete ACK are both asynchronous).
enum PreviewFlowState { PREVIEW_IDLE, PREVIEW_RECONNECT, PREVIEW_AWAIT_SETUP, PREVIEW_SPEAKING };
PreviewFlowState previewFlow = PREVIEW_IDLE;
String previewPendingText;
unsigned long previewFlowStartMs = 0;
bool voicePreviewPending = false;
unsigned long voicePreviewTriggerMs = 0;
#define VOICE_PREVIEW_DEBOUNCE_MS 350

Preferences personalityPrefs;

const char *tierNameFor(int axisIdx, int value) {
  if (value <= 33) return PERSONALITY_TIER_NAMES[axisIdx][0];
  if (value <= 66) return PERSONALITY_TIER_NAMES[axisIdx][1];
  return PERSONALITY_TIER_NAMES[axisIdx][2];
}

void loadPersonalityFromNVS() {
  personalityPrefs.begin("ims_persona", true); // read-only
  for (int i = 0; i < PERSONALITY_AXIS_COUNT; i++) {
    personalityValues[i] = personalityPrefs.getInt(PERSONALITY_AXIS_KEYS[i], personalityValues[i]);
  }
  String savedVoice = personalityPrefs.getString("voice", DEFAULT_VOICE_NAME);
  personalityVoiceIndex = DEFAULT_VOICE_INDEX;
  for (int i = 0; i < PERSONALITY_VOICE_COUNT; i++) {
    if (savedVoice == PERSONALITY_VOICES[i]) { personalityVoiceIndex = i; break; }
  }
  previewVoiceIndex = personalityVoiceIndex;
  captureLoggingEnabled = personalityPrefs.getBool("caplog", true);
  alertSoundIndex = personalityPrefs.getInt("alertsnd", 0);
  if (alertSoundIndex < 0 || alertSoundIndex >= ALERT_SOUND_COUNT) alertSoundIndex = 0;
  currentVolumeIndex = personalityPrefs.getInt("volume", 7);
  if (currentVolumeIndex < 0 || currentVolumeIndex >= VOLUME_LEVEL_COUNT) currentVolumeIndex = 7;
  personalityPrefs.end();
  Serial.printf("[Personality] Loaded from NVS: voice=%s, volume=%d%%\n",
                PERSONALITY_VOICES[personalityVoiceIndex], currentVolumeIndex * 10);
}

void savePersonalityToNVS() {
  personalityPrefs.begin("ims_persona", false); // read-write
  for (int i = 0; i < PERSONALITY_AXIS_COUNT; i++) {
    personalityPrefs.putInt(PERSONALITY_AXIS_KEYS[i], personalityValues[i]);
  }
  personalityPrefs.putString("voice", PERSONALITY_VOICES[personalityVoiceIndex]);
  personalityPrefs.putBool("caplog", captureLoggingEnabled);
  personalityPrefs.putInt("alertsnd", alertSoundIndex);
  personalityPrefs.putInt("volume", currentVolumeIndex);
  personalityPrefs.end();
}

// Fetches the active personality and voice choice directly from the backend
// SQLite database on boot/WiFi connection, keeping device and web app in lockstep.
void fetchPersonalityFromBackend() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = String("http://") + IMS_PRIMARY_HOST + ":3003/device/personality";
  http.begin(url);
  int code = http.GET();
  if (code == 200) {
    String payload = http.getString();
    JsonDocument doc;
    if (deserializeJson(doc, payload) == DeserializationError::Ok) {
      for (int i = 0; i < PERSONALITY_AXIS_COUNT; i++) {
        if (doc.containsKey(PERSONALITY_AXIS_KEYS[i])) {
          personalityValues[i] = doc[PERSONALITY_AXIS_KEYS[i]];
        }
      }
      if (doc.containsKey("voice")) {
        const char *backendVoice = doc["voice"];
        for (int i = 0; i < PERSONALITY_VOICE_COUNT; i++) {
          if (strcmp(backendVoice, PERSONALITY_VOICES[i]) == 0) {
            personalityVoiceIndex = i;
            previewVoiceIndex = i;
            break;
          }
        }
      }
      if (doc.containsKey("captureLogging")) {
        captureLoggingEnabled = doc["captureLogging"];
      }
      savePersonalityToNVS();
      Serial.printf("[Personality] Synced from backend: voice=%s\n", PERSONALITY_VOICES[personalityVoiceIndex]);
    }
  } else {
    Serial.printf("[Personality] GET /device/personality status: %d\n", code);
  }
  http.end();
}

// Fire-and-forget-ish: blocks Core 1 briefly (HTTPClient has no async mode),
// but only ever called from the debounce check in loop(), at most once every
// SETTINGS_SAVE_DEBOUNCE_MS while actively dragging - not during normal
// conversation, so a few hundred ms of blocking here doesn't stall audio.
void postPersonalityToBackend() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = String("http://") + IMS_PRIMARY_HOST + ":3003/device/personality";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  JsonDocument doc;
  for (int i = 0; i < PERSONALITY_AXIS_COUNT; i++) doc[PERSONALITY_AXIS_KEYS[i]] = personalityValues[i];
  doc["voice"] = PERSONALITY_VOICES[personalityVoiceIndex];
  doc["captureLogging"] = captureLoggingEnabled;
  String body;
  serializeJson(doc, body);
  int code = http.POST(body);
  Serial.printf("[Personality] POST /device/personality -> %d (voice=%s)\n", code, PERSONALITY_VOICES[personalityVoiceIndex]);
  http.end();
}

bool isSetupAcknowledged = false;
// pollIncoming()'s framing state machine keeps partial-frame progress in
// statics so a frame split across several TCP reads can be reassembled. That
// progress is meaningless - worse, actively harmful - on a NEW socket: a
// reconnect landing mid-frame left frameBytesRead/frameLen pointing at the
// dead connection's frame, so the parser consumed the fresh stream's header
// bytes as that frame's tail and desynced permanently. It then read audio PCM
// as a length prefix, tripped the "frame too large" guard, closed the socket
// (RST, seen backend-side as ECONNRESET), reconnected - and inherited stale
// state all over again. Set this on every connect/disconnect so the parser
// always starts a new socket from a clean slate.
volatile bool incomingParserResetPending = false;
volatile bool geminiSetupComplete =
    false; // Set true only after Gemini sends setupComplete ACK
volatile bool isMicHardwareMuted = false; // Physical top latching mute button state (GPIO 1)
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
enum ControlEvent {
  EVT_TURN_COMPLETE,
  // Renamed from EVT_WAKE_SPEECH: the local RMS gate that raises this has no
  // idea what was actually said, only that something was loud enough to
  // maybe be speech - it's a candidate for Gemini to confirm or reject via
  // the noWakeDetected/real-audio-response contract in beginVerifying().
  EVT_WAKE_CANDIDATE
};

// Acoustic feedback blanking: tracks the last time the speaker played audio
extern QueueHandle_t audioPlaybackQueue;
volatile unsigned long lastPlaybackActiveTime = 0;
volatile bool modelTurnActive = false; // Tracks active turn generation from Gemini

// Returns true if audio is actively playing or queued to play out the speaker
inline bool isSpeakerActive() {
  if (modelTurnActive) {
    // Safety guard: if audioPlaybackQueue is empty and no playback has occurred for >4000ms,
    // clear modelTurnActive in case turnComplete was missing or delayed from upstream.
    // 4000ms allows Gemini Live to pause for up to 4s between clauses without premature auto-mute.
    if ((!audioPlaybackQueue || uxQueueMessagesWaiting(audioPlaybackQueue) == 0) &&
        lastPlaybackActiveTime > 0 && (millis() - lastPlaybackActiveTime > 4000)) {
      modelTurnActive = false;
    } else {
      return true;
    }
  }
  if (audioPlaybackQueue && uxQueueMessagesWaiting(audioPlaybackQueue) > 0) return true;
  if (lastPlaybackActiveTime > 0 && (millis() - lastPlaybackActiveTime < 200)) return true;
  return false;
}

// Returns true during speaker playback plus acoustic reverberation / enclosure cooldown window
inline bool isSpeakerCoolingDown() {
  if (isSpeakerActive()) return true;
  if (lastPlaybackActiveTime > 0 && (millis() - lastPlaybackActiveTime < 200)) return true;
  return false;
}

// Circular pre-roll buffer in PSRAM to preserve wake words ("Hey Ims", "Eh up Ims")
#define PREROLL_CHUNKS 16 // 16 * 512 samples = 512ms at 16kHz
static AudioChunkMsg *prerollBuffer = nullptr;
static int prerollHead = 0;
static bool prerollFilled = false;

// Audio Queue for Core 0 (audioMicTask) -> Core 1 (loop)
#define AUDIO_OUT_QUEUE_DEPTH 32
QueueHandle_t audioOutQueue = NULL;
static StaticQueue_t audioOutStaticQueue;
static uint8_t *audioOutQueueStorage = nullptr;

// Debug telemetry sent over the existing WebSocket to the backend (which
// just logs and drops it) - live serial monitoring on this board resets it
// on every COM port open, making timed physical tests impossible to observe
// live. The backend log persists and can be checked at any time instead.
struct DebugMsg {
  char text[80];
};

#define PLAYBACK_QUEUE_DEPTH 1024
QueueHandle_t controlEventQueue = NULL;
QueueHandle_t debugQueue = NULL;
QueueHandle_t audioPlaybackQueue = NULL; // Core 1 -> Core 0 speaker audio (PSRAM-backed)
static StaticQueue_t playbackStaticQueue;
static uint8_t *playbackQueueStorage = nullptr;

// ---------------------------------------------------------------------------
// Expressive face - a 12x8 self-drawing "LED matrix" (each cell a small
// rounded rect whose colour is interpolated between an off- and on-colour by
// a 0-255 brightness level). Ported from the "pixel" character in
// MichalZaniewicz's esphome-esp32-s3-box-3-va project
// (base/faces/pixel.yaml), which drives the same 96 cells through LVGL - this
// firmware draws directly with LovyanGFX instead, so the animation logic is
// re-expressed here rather than reused as-is. Replaces the old plain "state
// orb" circle in the same screen region.
// ---------------------------------------------------------------------------
#define FACE_COLS 12
#define FACE_ROWS 8
#define FACE_DOT 12
#define FACE_RADIUS 4
#define FACE_PITCH 17
// 148 balances the screen layout: leaves 48px left margin, 200px face (x=48..248),
// and a 72px right-hand zone for the blood glucose widget (centered at 288)
#define FACE_CENTER_X 148
// 116 (shifted down 5px from 111): top of face is at y=50, leaving 7px
// comfortable margin below the top header (HEADER_H = 43)
#define FACE_CENTER_Y 116

static uint8_t faceCurLevels[FACE_COLS * FACE_ROWS] = {0};
static uint16_t faceCurColors[FACE_COLS * FACE_ROWS] = {0};
static int faceFrame = 0;

// Perimeter walk of the 12x8 grid (36 cells), for the "thinking" spinner.
static const uint8_t faceRing[36] = {0,  1,  2,  3,  4,  5,  6,  7,  8,  9,  10, 11,
                                      23, 35, 47, 59, 71, 83, 95, 94, 93, 92, 91, 90,
                                      89, 88, 87, 86, 85, 84, 72, 60, 48, 36, 24, 12};

static inline void facePut(uint8_t want[], int r, int c, int v) {
  if (r < 0 || r >= FACE_ROWS || c < 0 || c >= FACE_COLS) return;
  int i = r * FACE_COLS + c;
  if (v > want[i]) want[i] = (uint8_t)v;
}

// Fills `want[]` (96 brightness levels, 0-255) for the current expression.
// Mirrors pixel.yaml's phase table: idle (smile + slow breathing + occasional
// blink/glance), listening (wide eyes + open mouth block), thinking (squint +
// darting gaze + a chasing spinner dot), speaking (mouth opens/closes on
// deterministic noise so it looks like talking rather than a metronome or a
// flicker), muted (eyes shut, flat mouth).
static void computeFaceLevels(uint8_t want[FACE_COLS * FACE_ROWS]) {
  memset(want, 0, FACE_COLS * FACE_ROWS);
  int f = faceFrame;

  bool muted = isMicHardwareMuted;
  bool speaking = !muted && isSpeakerActive();
  bool connecting = (currentState == STATE_CONNECTING_WIFI || currentState == STATE_CONNECTING_SERVER);
  bool listening = !muted && !speaking && (currentState == STATE_LISTENING);
  bool thinking = !muted && !speaking && !listening && (currentState == STATE_THINKING || connecting);

  const int eyeL[3] = {2, 3, 4};
  const int eyeR[3] = {7, 8, 9};

  if (muted) {
    for (int k = 0; k < 3; k++) { facePut(want, 3, eyeL[k], 160); facePut(want, 3, eyeR[k], 160); }
    for (int c = 3; c <= 8; c++) facePut(want, 6, c, 160);
    return;
  }

  // Ported from expressionsupdate2.yaml's per-emotion upper/lower face
  // tables. Mutually exclusive with the phase-based rendering below, same as
  // the reference: an active emotion (set by Gemini's setEmotion tool call,
  // see handleFrame()) completely overrides the idle/listening/thinking look
  // until it's cleared at the start of the next conversation. Colour for
  // each emotion lives in drawFaceInternal()'s palette, keyed the same way.
  if (currentEmotion != EMOTION_NEUTRAL) {
    uint32_t n = (uint32_t)(f * 73 + 151);
    n = (n ^ (n >> 5)) * 2654435761u;
    int amp = (int)((n >> 16) & 0xFF);

    switch (currentEmotion) {
      case EMOTION_JOY:
        facePut(want, 1, 3, 255); facePut(want, 1, 8, 255);
        facePut(want, 2, 2, 255); facePut(want, 2, 4, 255); facePut(want, 2, 7, 255); facePut(want, 2, 9, 255);
        break;
      case EMOTION_COCKY:
        for (int c = 2; c <= 4; c++) facePut(want, 0, c, 255);
        for (int r = 2; r <= 3; r++) for (int c = 2; c <= 4; c++) facePut(want, r, c, 255);
        for (int c = 7; c <= 9; c++) facePut(want, 2, c, 255);
        want[2 * FACE_COLS + 3] = 30; want[3 * FACE_COLS + 8] = 30;
        break;
      case EMOTION_LOVE:
        facePut(want, 1, 2, 255); facePut(want, 1, 4, 255); facePut(want, 1, 7, 255); facePut(want, 1, 9, 255);
        for (int c = 2; c <= 4; c++) facePut(want, 2, c, 255);
        for (int c = 7; c <= 9; c++) facePut(want, 2, c, 255);
        facePut(want, 3, 3, 255); facePut(want, 3, 8, 255);
        break;
      case EMOTION_AMAZEMENT:
        for (int r = 1; r <= 4; r++) { for (int c = 2; c <= 4; c++) facePut(want, r, c, 255); for (int c = 7; c <= 9; c++) facePut(want, r, c, 255); }
        want[2 * FACE_COLS + 3] = 30; want[2 * FACE_COLS + 8] = 30;
        break;
      case EMOTION_SUSPICIOUS:
        for (int c = 2; c <= 4; c++) facePut(want, 2, c, 255);
        for (int c = 7; c <= 9; c++) facePut(want, 2, c, 255);
        facePut(want, 3, 3, 255); facePut(want, 3, 4, 255); facePut(want, 3, 8, 255); facePut(want, 3, 9, 255);
        want[3 * FACE_COLS + 2] = 30; want[3 * FACE_COLS + 7] = 30;
        break;
      case EMOTION_CONFUSED:
        for (int c = 2; c <= 4; c++) facePut(want, 0, c, 255);
        facePut(want, 1, 8, 255); facePut(want, 1, 9, 255);
        for (int r = 2; r <= 3; r++) for (int c = 2; c <= 4; c++) facePut(want, r, c, 255);
        for (int c = 7; c <= 9; c++) { facePut(want, 2, c, 255); facePut(want, 3, c, 255); }
        want[2 * FACE_COLS + 3] = 30; want[3 * FACE_COLS + 8] = 30;
        break;
      case EMOTION_SAD:
        facePut(want, 0, 5, 255); facePut(want, 0, 7, 255);
        facePut(want, 1, 3, 255); facePut(want, 1, 9, 255);
        for (int r = 2; r <= 3; r++) { for (int c = 2; c <= 4; c++) facePut(want, r, c, 255); for (int c = 7; c <= 9; c++) facePut(want, r, c, 255); }
        want[3 * FACE_COLS + 3] = 30; want[3 * FACE_COLS + 8] = 30;
        break;
      case EMOTION_DEVASTATED:
        for (int c = 2; c <= 4; c++) facePut(want, 2, c, 255);
        for (int c = 7; c <= 9; c++) facePut(want, 2, c, 255);
        facePut(want, 3, 3, 140); facePut(want, 3, 8, 140);
        facePut(want, 5, 3, 255); facePut(want, 5, 8, 255);
        break;
      case EMOTION_ANGER:
        facePut(want, 1, 1, 255); facePut(want, 1, 10, 255);
        for (int c = 2; c <= 4; c++) facePut(want, 2, c, 255);
        for (int c = 7; c <= 9; c++) facePut(want, 2, c, 255);
        for (int c = 2; c <= 4; c++) facePut(want, 3, c, 255);
        for (int c = 7; c <= 9; c++) facePut(want, 3, c, 255);
        want[3 * FACE_COLS + 3] = 30; want[3 * FACE_COLS + 8] = 30;
        break;
      case EMOTION_RAGE:
        facePut(want, 0, 0, 255); facePut(want, 0, 11, 255);
        facePut(want, 1, 1, 255); facePut(want, 1, 10, 255);
        for (int r = 2; r <= 3; r++) { for (int c = 2; c <= 4; c++) facePut(want, r, c, 255); for (int c = 7; c <= 9; c++) facePut(want, r, c, 255); }
        want[3 * FACE_COLS + 3] = 30; want[3 * FACE_COLS + 8] = 30;
        break;
      case EMOTION_FEAR:
        facePut(want, 0, 2, 255); facePut(want, 0, 3, 255); facePut(want, 0, 8, 255); facePut(want, 0, 9, 255);
        for (int r = 1; r <= 3; r++) { for (int c = 2; c <= 4; c++) facePut(want, r, c, 255); for (int c = 7; c <= 9; c++) facePut(want, r, c, 255); }
        want[3 * FACE_COLS + 3] = 30; want[3 * FACE_COLS + 8] = 30;
        break;
      case EMOTION_DISGUSTED:
        facePut(want, 1, 8, 255);
        facePut(want, 2, 2, 255); facePut(want, 2, 3, 255); facePut(want, 2, 7, 255); facePut(want, 2, 9, 255);
        facePut(want, 3, 3, 255); facePut(want, 3, 4, 255); facePut(want, 3, 7, 255); facePut(want, 3, 8, 255); facePut(want, 3, 9, 255);
        want[3 * FACE_COLS + 3] = 30; want[2 * FACE_COLS + 8] = 30;
        break;
      case EMOTION_BORED:
        for (int r = 2; r <= 3; r++) { for (int c = 2; c <= 4; c++) facePut(want, r, c, 255); for (int c = 7; c <= 9; c++) facePut(want, r, c, 255); }
        want[3 * FACE_COLS + 3] = 30; want[3 * FACE_COLS + 8] = 30;
        break;
      case EMOTION_SLEEPY:
        for (int c = 2; c <= 4; c++) facePut(want, 3, c, 255);
        for (int c = 7; c <= 9; c++) facePut(want, 3, c, 255);
        break;
    }

    if (speaking) {
      switch (currentEmotion) {
        case EMOTION_JOY: {
          int rows = 1 + amp * 3 / 256;
          for (int r = 5; r < 5 + rows; r++) for (int c = 3; c <= 8; c++) facePut(want, r, c, 255);
          facePut(want, 5, 2, 255); facePut(want, 5, 9, 255);
          break;
        }
        case EMOTION_COCKY: {
          int rows = 1 + amp * 2 / 256;
          for (int r = 5; r < 5 + rows; r++) for (int c = 5; c <= 8; c++) facePut(want, r, c, 255);
          facePut(want, 5, 9, 255);
          break;
        }
        case EMOTION_AMAZEMENT:
        case EMOTION_FEAR: {
          int openR = (amp > 100) ? 7 : 6;
          for (int c = 4; c <= 7; c++) facePut(want, 5, c, 255);
          facePut(want, 6, 4, 255); facePut(want, 6, 7, 255);
          if (openR == 7) {
            facePut(want, 7, 4, 255); facePut(want, 7, 7, 255);
            for (int c = 5; c <= 6; c++) facePut(want, 7, c, 255);
          } else {
            for (int c = 5; c <= 6; c++) facePut(want, 6, c, 255);
          }
          break;
        }
        case EMOTION_SAD:
        case EMOTION_DEVASTATED: {
          int rows = 1 + amp * 2 / 256;
          for (int r = 5; r < 5 + rows; r++) for (int c = 4; c <= 7; c++) facePut(want, r, c, 255);
          facePut(want, 6, 3, 255); facePut(want, 6, 8, 255);
          break;
        }
        case EMOTION_ANGER:
        case EMOTION_RAGE:
          for (int c = 2; c <= 9; c++) facePut(want, 6, c, 255);
          if (amp > 110) for (int c = 3; c <= 8; c++) facePut(want, 5, c, 255);
          if (amp > 190) for (int c = 3; c <= 8; c++) facePut(want, 7, c, 255);
          break;
        case EMOTION_DISGUSTED:
          facePut(want, 5, 8, 255);
          for (int c = 4; c <= 7; c++) facePut(want, 6, c, 255);
          if (amp > 130) { facePut(want, 7, 5, 255); facePut(want, 7, 6, 255); }
          break;
        case EMOTION_BORED:
          for (int c = 4; c <= 7; c++) facePut(want, 6, c, 255);
          if (amp > 160) for (int c = 5; c <= 6; c++) facePut(want, 5, c, 255);
          break;
        default: {
          int rowsOpen = 1 + amp * 3 / 256;
          int half = (amp > 140) ? 3 : 2;
          for (int r = 5; r < 5 + rowsOpen; r++) for (int c = 6 - half; c < 6 + half; c++) facePut(want, r, c, 255);
          break;
        }
      }
    } else {
      switch (currentEmotion) {
        case EMOTION_JOY:
          for (int c = 2; c <= 9; c++) facePut(want, 5, c, 255);
          for (int c = 3; c <= 8; c++) facePut(want, 6, c, 255);
          for (int c = 4; c <= 7; c++) facePut(want, 7, c, 255);
          break;
        case EMOTION_COCKY:
          facePut(want, 5, 8, 255);
          for (int c = 4; c <= 8; c++) facePut(want, 6, c, 255);
          break;
        case EMOTION_LOVE:
          facePut(want, 5, 2, 255); facePut(want, 5, 9, 255);
          for (int c = 3; c <= 8; c++) facePut(want, 6, c, 255);
          break;
        case EMOTION_AMAZEMENT:
          for (int c = 4; c <= 7; c++) { facePut(want, 5, c, 255); facePut(want, 7, c, 255); }
          facePut(want, 6, 4, 255); facePut(want, 6, 7, 255);
          break;
        case EMOTION_SUSPICIOUS:
          for (int c = 4; c <= 7; c++) facePut(want, 6, c, 255);
          break;
        case EMOTION_CONFUSED:
          facePut(want, 5, 4, 255); facePut(want, 5, 5, 255);
          facePut(want, 6, 6, 255); facePut(want, 6, 7, 255); facePut(want, 6, 8, 255);
          break;
        case EMOTION_SAD:
          for (int c = 4; c <= 7; c++) facePut(want, 5, c, 255);
          facePut(want, 6, 3, 255); facePut(want, 6, 8, 255);
          break;
        case EMOTION_DEVASTATED:
          for (int c = 4; c <= 7; c++) { facePut(want, 6, c, 255); facePut(want, 7, c, 255); }
          break;
        case EMOTION_ANGER:
          for (int c = 2; c <= 9; c++) facePut(want, 6, c, 255);
          break;
        case EMOTION_RAGE:
          for (int c = 2; c <= 9; c++) { facePut(want, 5, c, 255); facePut(want, 7, c, 255); }
          facePut(want, 6, 2, 255); facePut(want, 6, 9, 255);
          break;
        case EMOTION_FEAR:
          facePut(want, 5, 5, 255); facePut(want, 5, 6, 255);
          facePut(want, 6, 4, 255); facePut(want, 6, 7, 255);
          facePut(want, 7, 5, 255); facePut(want, 7, 6, 255);
          break;
        case EMOTION_DISGUSTED:
          facePut(want, 5, 8, 255);
          for (int c = 4; c <= 7; c++) facePut(want, 6, c, 255);
          facePut(want, 7, 5, 255); facePut(want, 7, 6, 255);
          break;
        case EMOTION_BORED:
          for (int c = 4; c <= 7; c++) facePut(want, 6, c, 255);
          break;
        case EMOTION_SLEEPY:
          facePut(want, 6, 5, 255); facePut(want, 6, 6, 255);
          break;
      }
    }
    return;
  }

  int idleT = f % 100;
  bool blink = false;
  int gaze = 0;
  if (thinking) {
    gaze = ((f % 40) < 20) ? -1 : 1;
  } else if (!listening && !speaking) {
    blink = (idleT == 0 || idleT == 1 || idleT == 5 || idleT == 6);
    if (idleT >= 30 && idleT < 40) gaze = -1;
    else if (idleT >= 50 && idleT < 60) gaze = 1;
  }

  if (blink) {
    for (int k = 0; k < 3; k++) { facePut(want, 3, eyeL[k], 255); facePut(want, 3, eyeR[k], 255); }
  } else {
    int r0 = thinking ? 2 : 1;
    for (int r = r0; r <= 3; r++)
      for (int k = 0; k < 3; k++) { facePut(want, r, eyeL[k], 255); facePut(want, r, eyeR[k], 255); }
    int pr = thinking ? 3 : 2;
    want[pr * FACE_COLS + (3 + gaze)] = 30;
    want[pr * FACE_COLS + (8 + gaze)] = 30;
  }

  if (listening) {
    for (int r = 5; r <= 6; r++)
      for (int c = 4; c <= 7; c++) facePut(want, r, c, 255);
  } else if (thinking) {
    facePut(want, 6, 5, 217);
    facePut(want, 6, 6, 217);
    const uint8_t tail[4] = {255, 140, 76, 38};
    for (int k = 0; k < 4; k++) {
      int idx = faceRing[((f * 2 - k) % 36 + 36) % 36];
      if (want[idx] < tail[k]) want[idx] = tail[k];
    }
  } else if (speaking) {
    // Same trick as pixel.yaml's replying state: deterministic noise rather
    // than real audio amplitude (this firmware doesn't have easy access to
    // the PCM buffer at the point isSpeakerActive() is read), so the mouth
    // reads as "talking" without flickering or repeating on a visible cycle.
    uint32_t n = (uint32_t)(f * 73 + 151);
    n = (n ^ (n >> 5)) * 2654435761u;
    int amp = (int)((n >> 16) & 0xFF);
    int rowsOpen = 1 + amp * 3 / 256;
    int half = (amp > 140) ? 3 : 2;
    for (int r = 5; r < 5 + rowsOpen; r++)
      for (int c = 6 - half; c < 6 + half; c++) facePut(want, r, c, 255);
  } else {
    // Idle: a fixed smile plus a breath that never quite stops.
    for (int c = 3; c <= 8; c++) facePut(want, 6, c, 255);
    facePut(want, 5, 2, 255);
    facePut(want, 5, 9, 255);
    // Continuous, not stepped (a /8*8 rounding used to collapse this into
    // ~5 visible brightness levels - removed; full 8-bit resolution is free
    // on this LCD, unlike the real-LED reference project this was ported
    // from). Matches an actual human breath's asymmetric timing - a real
    // inhale/pause/exhale, not a symmetric sine wave that fades in and out
    // over equal durations with no pause at the top - via three separately-
    // timed eased segments (raised-cosine: zero velocity at both ends of
    // each segment, so they stitch together with no kink where one meets
    // the next) driven by wall-clock time rather than the tick counter, so
    // the rhythm stays correct even if drawFaceTick()'s call cadence drifts.
    const float BREATH_INHALE_S = 1.5f;
    const float BREATH_PAUSE_S = 0.5f;
    const float BREATH_EXHALE_S = 2.5f;
    const float BREATH_CYCLE_S = BREATH_INHALE_S + BREATH_PAUSE_S + BREATH_EXHALE_S;
    float t = fmodf(millis() / 1000.0f, BREATH_CYCLE_S);
    float level; // 0.0 = dim end of the breath, 1.0 = bright end
    if (t < BREATH_INHALE_S) {
      level = 0.5f - 0.5f * cosf(PI * (t / BREATH_INHALE_S));
    } else if (t < BREATH_INHALE_S + BREATH_PAUSE_S) {
      level = 1.0f;
    } else {
      float p = (t - BREATH_INHALE_S - BREATH_PAUSE_S) / BREATH_EXHALE_S;
      level = 0.5f + 0.5f * cosf(PI * p);
    }
    // High-fidelity smooth breathing: range 8 to 60 gives 52 distinct levels
    // providing continuous, flicker-free fading across the 30ms refresh cadence
    int breath = 8 + (int)(52.0f * level);
    for (int i = 0; i < FACE_COLS * FACE_ROWS; i++)
      if (want[i] < breath) want[i] = (uint8_t)breath;
  }
}

// Draws only the dots whose brightness actually changed since the last call
// (forceFull draws all 96, used once after a full-screen repaint). Colour is
// picked to match the same palette renderScreen() already uses for the
// status pill/text, so the face and the status word never disagree.
static void drawFaceInternal(bool forceFull) {
  uint8_t want[FACE_COLS * FACE_ROWS];
  computeFaceLevels(want);

  int onR = 76, onG = 255, onB = 122; // default: soft green (idle/standby)
  if (isMicHardwareMuted) { onR = 255; onG = 71; onB = 87; }
  // Emotion colour takes priority over the phase palette below (matches
  // computeFaceLevels() treating an active emotion as a full override), but
  // never over the mute indicator above - the user needs that to always read
  // the same way regardless of what IMS is "feeling".
  else if (currentEmotion != EMOTION_NEUTRAL) {
    switch (currentEmotion) {
      case EMOTION_JOY:        onR = 255; onG = 215; onB = 0;   break; // gold
      case EMOTION_COCKY:      onR = 0;   onG = 229; onB = 255; break; // bright cyan
      case EMOTION_LOVE:       onR = 255; onG = 51;  onB = 133; break; // hot pink
      case EMOTION_AMAZEMENT:  onR = 255; onG = 184; onB = 77;  break; // amber
      case EMOTION_SUSPICIOUS: onR = 51;  onG = 255; onB = 184; break; // sharp teal
      case EMOTION_CONFUSED:   onR = 153; onG = 255; onB = 51;  break; // lime
      case EMOTION_SAD:        onR = 77;  onG = 148; onB = 255; break; // soft blue
      case EMOTION_DEVASTATED: onR = 30;  onG = 136; onB = 229; break; // deep cold blue
      case EMOTION_ANGER:      onR = 255; onG = 119; onB = 51;  break; // warm orange
      case EMOTION_RAGE:       onR = 255; onG = 34;  onB = 34;  break; // scarlet
      case EMOTION_FEAR:       onR = 186; onG = 104; onB = 200; break; // ghostly violet
      case EMOTION_DISGUSTED:  onR = 166; onG = 226; onB = 46;  break; // sickly olive
      case EMOTION_BORED:      onR = 126; onG = 154; onB = 133; break; // slate grey-green
      case EMOTION_SLEEPY:     onR = 46;  onG = 74;  onB = 56;  break; // dim forest green
    }
  }
  else if (currentState == STATE_CONNECTING_WIFI || currentState == STATE_CONNECTING_SERVER) { onR = 255; onG = 165; onB = 2; }
  else if (currentState == STATE_LISTENING) { onR = 46; onG = 213; onB = 115; }
  else if (currentState == STATE_THINKING) { onR = 112; onG = 161; onB = 255; }
  else if (currentState == STATE_SPEAKING || isSpeakerActive()) { onR = 165; onG = 94; onB = 234; }
  const int offR = 12, offG = 20, offB = 16;

  // A dot only gets repainted below when its BRIGHTNESS changed - that's
  // what keeps a still face cheap. But switching emotion (or state) often
  // changes the COLOUR while leaving plenty of dots at the exact same
  // brightness (e.g. still 255 in both the neutral and the joy eye pattern),
  // so without this those dots silently kept their old colour - the two-tone
  // face reported after the emotion feature shipped. Force every dot to
  // repaint whenever the target colour itself has changed, not just when a
  // brightness level has.
  static int paintedR = -1, paintedG = -1, paintedB = -1;
  bool recolour = (paintedR != onR || paintedG != onG || paintedB != onB);
  paintedR = onR; paintedG = onG; paintedB = onB;
  if (recolour) forceFull = true;

  for (int i = 0; i < FACE_COLS * FACE_ROWS; i++) {
    uint8_t v = want[i];
    int r = i / FACE_COLS, c = i % FACE_COLS;
    int x = FACE_CENTER_X + (int)roundf((c - 5.5f) * FACE_PITCH) - FACE_DOT / 2;
    int y = FACE_CENTER_Y + (int)roundf((r - 3.5f) * FACE_PITCH) - FACE_DOT / 2;
    uint8_t r8 = (uint8_t)(offR + (onR - offR) * v / 255);
    uint8_t g8 = (uint8_t)(offG + (onG - offG) * v / 255);
    uint8_t b8 = (uint8_t)(offB + (onB - offB) * v / 255);
    uint16_t c565 = tft.color565(r8, g8, b8);
    if (!forceFull && c565 == faceCurColors[i]) continue;
    faceCurColors[i] = c565;
    faceCurLevels[i] = v;
    tft.fillRoundRect(x, y, FACE_DOT, FACE_DOT, FACE_RADIUS, c565);
  }
}

// Advances the animation and repaints only the dots that changed - called on
// a ~30ms cadence (~33 FPS) from loop(), allowing silky-smooth background dot
// breathing while advancing discrete expression frames (blink/mouth/gaze) on a 120ms tick.
void drawFaceTick() {
  if (onSettingsScreen) return; // don't paint face dots over the settings screen
  static unsigned long lastAnimFrameMs = 0;
  if (millis() - lastAnimFrameMs >= 120) {
    lastAnimFrameMs = millis();
    faceFrame++;
  }
  tft.startWrite();
  drawFaceInternal(false);
  tft.endWrite();
}

// ---------------------------------------------------------------------------
// Nightscout Blood Glucose Widget
// Vertically centered to the right of the expressive face:
// - Direction trend arrow(s) above the number:
//   DoubleDown, SingleDown, FortyFiveDown, Flat, FortyFiveUp, SingleUp, DoubleUp
// - Blood glucose value in mmol/L in Font 4 (<4.0 red, 4.0-7.5 green, >7.5 yellow)
// ---------------------------------------------------------------------------
#define GLUCOSE_CX 288
#define GLUCOSE_CY 116

static String currentGlucoseValue = "--";
static String currentGlucoseDirection = "Flat";

static uint16_t getGlucoseColor(const String &valStr) {
  if (valStr.length() == 0 || valStr == "--") {
    return tft.color565(140, 150, 175); // neutral grey
  }
  float val = valStr.toFloat();
  if (val < 4.0f) {
    return tft.color565(255, 71, 87);  // Red: below 4.0
  } else if (val <= 7.5f) {
    return tft.color565(46, 213, 115); // Green: 4.0 to 7.5
  } else {
    return tft.color565(255, 184, 77); // Yellow: above 7.5
  }
}

static void drawSingleArrow(int x, int y, int type, uint16_t color) {
  // type: 0=UP, 1=DOWN, 2=FLAT, 3=FORTYFIVE_UP, 4=FORTYFIVE_DOWN
  switch (type) {
    case 0: // UP
      tft.fillRect(x - 1, y - 4, 3, 12, color);
      tft.fillTriangle(x, y - 8, x - 5, y - 2, x + 5, y - 2, color);
      break;
    case 1: // DOWN
      tft.fillRect(x - 1, y - 7, 3, 12, color);
      tft.fillTriangle(x, y + 8, x - 5, y + 2, x + 5, y + 2, color);
      break;
    case 2: // FLAT (right)
      tft.fillRect(x - 7, y - 1, 12, 3, color);
      tft.fillTriangle(x + 8, y, x + 2, y - 5, x + 2, y + 5, color);
      break;
    case 3: // 45 UP (North-East)
      tft.drawLine(x - 5, y + 5, x + 4, y - 4, color);
      tft.drawLine(x - 4, y + 5, x + 5, y - 4, color);
      tft.drawLine(x - 5, y + 4, x + 4, y - 5, color);
      tft.fillTriangle(x + 8, y - 8, x + 1, y - 7, x + 7, y - 1, color);
      break;
    case 4: // 45 DOWN (South-East)
      tft.drawLine(x - 5, y - 5, x + 4, y + 4, color);
      tft.drawLine(x - 4, y - 5, x + 5, y + 4, color);
      tft.drawLine(x - 5, y - 4, x + 4, y + 5, color);
      tft.fillTriangle(x + 8, y + 8, x + 1, y + 7, x + 7, y + 1, color);
      break;
  }
}

static void drawGlucoseArrows(int cx, int cy, const String &dir, uint16_t color) {
  if (dir.equalsIgnoreCase("DoubleUp")) {
    drawSingleArrow(cx - 7, cy, 0, color);
    drawSingleArrow(cx + 7, cy, 0, color);
  } else if (dir.equalsIgnoreCase("SingleUp")) {
    drawSingleArrow(cx, cy, 0, color);
  } else if (dir.equalsIgnoreCase("FortyFiveUp")) {
    drawSingleArrow(cx, cy, 3, color);
  } else if (dir.equalsIgnoreCase("Flat")) {
    drawSingleArrow(cx, cy, 2, color);
  } else if (dir.equalsIgnoreCase("FortyFiveDown")) {
    drawSingleArrow(cx, cy, 4, color);
  } else if (dir.equalsIgnoreCase("SingleDown")) {
    drawSingleArrow(cx, cy, 1, color);
  } else if (dir.equalsIgnoreCase("DoubleDown")) {
    drawSingleArrow(cx - 7, cy, 1, color);
    drawSingleArrow(cx + 7, cy, 1, color);
  }
}

void drawGlucoseWidget() {
  if (onSettingsScreen) return;
  tft.startWrite();

  // Clear widget bounding box without touching the face (ends at 248) or screen edges (320)
  tft.fillRect(252, 80, 66, 80, tft.color565(11, 14, 21));

  uint16_t color = getGlucoseColor(currentGlucoseValue);

  // 1. Draw Direction Arrow(s) above the number (cy = GLUCOSE_CY - 16 = 95)
  drawGlucoseArrows(GLUCOSE_CX, GLUCOSE_CY - 16, currentGlucoseDirection, color);

  // 2. Draw Blood Glucose Value below arrows (cy = GLUCOSE_CY + 14 = 125)
  tft.setTextDatum(middle_center);
  tft.setFont(&fonts::Font4);
  tft.setTextColor(color);
  tft.drawString(currentGlucoseValue, GLUCOSE_CX, GLUCOSE_CY + 14);

  // Reset font and datum
  tft.setFont(&fonts::Font0);
  tft.setTextSize(1);
  tft.setTextDatum(top_left);

  tft.endWrite();
}

// Header bar height, shared by all four screens (main/personality/voice/
// preferences) - bumped up from the original 34px specifically so the gear
// icon and the chevron nav chips get a taller, easier-to-hit touch target,
// not just a visually taller bar. Every header icon/chevron/hitbox below is
// expressed relative to this and HEADER_CY (its vertical centre), so
// changing this one number keeps everything - graphics, hit zones, and
// vertically-centred text - in sync with each other.
//
// 43: reduced a further 10% from 48 (itself reduced 15% from an earlier 56 -
// see git history for that step's reasoning). FACE_CENTER_Y moves up to
// match every time this changes (see its own comment).
#define HEADER_H 43
#define HEADER_CY (HEADER_H / 2)

// Gear icon tap zone (top-left of the header). Shared identically by both
// screens - the main screen's icon opens settings, the settings screen's
// same-shaped icon (drawGearIcon() below) goes back - so the two can never
// disagree about where the tap target actually is.
#define HEADER_ICON_X0 0
#define HEADER_ICON_Y0 0
#define HEADER_ICON_X1 44
#define HEADER_ICON_Y1 HEADER_H
#define HEADER_ICON_CX 22 // hub centre
#define HEADER_ICON_CY HEADER_CY
#define HEADER_TITLE_X 48 // both screens' title text starts here, clear of the icon

// Personality screen only: top-right "VOICE >" tap zone that opens the voice
// picker sub-screen - wide enough to cover both the label text and the
// chevron icon next to it, not just the icon itself.
#define HEADER_RIGHT_ZONE_X0 230
#define HEADER_RIGHT_ZONE_Y0 0
#define HEADER_RIGHT_ZONE_X1 320
#define HEADER_RIGHT_ZONE_Y1 HEADER_H
#define HEADER_RIGHT_CHEVRON_CX 300
#define HEADER_RIGHT_CHEVRON_CY HEADER_CY
#define HEADER_RIGHT_LABEL_X 290 // right edge the "VOICE" label is right-aligned against

// Voice screen only: its back zone is wider than HEADER_ICON_* (0-44) since
// it carries a "< PERSONALITY" chevron+label, not just a bare icon.
#define VOICE_BACK_ZONE_X0 0
#define VOICE_BACK_ZONE_Y0 0
#define VOICE_BACK_ZONE_X1 155
#define VOICE_BACK_ZONE_Y1 HEADER_H
#define VOICE_BACK_CHEVRON_CX 22
#define VOICE_BACK_CHEVRON_CY HEADER_CY
#define VOICE_BACK_LABEL_X 38

// Voice screen: "PREFERENCES >" chip on the right of its header. Wider than
// the personality screen's equivalent because the label is longer, and it can
// afford to be - "IMS VOICE" is a short centred title.
#define VOICE_NEXT_ZONE_X0 195
#define VOICE_NEXT_ZONE_X1 320
#define VOICE_NEXT_CHEVRON_CX 300
#define VOICE_NEXT_LABEL_X 290

// Preferences screen:
// Row 1: Capture Logging (heading + left-aligned on/off pill toggle + path)
#define PREFS_CAPLOG_LABEL_Y (HEADER_H + 8)
#define PREFS_TOGGLE_X0 15
#define PREFS_TOGGLE_X1 85
#define PREFS_TOGGLE_Y0 (HEADER_H + 20)
#define PREFS_TOGGLE_Y1 (HEADER_H + 46)
#define PREFS_PATH_LINE1_Y (PREFS_TOGGLE_Y1 + 8)
#define PREFS_PATH_LINE2_Y (PREFS_TOGGLE_Y1 + 20)

// Row 2: Alert Sound (left column) & Volume (right column) side-by-side
#define PREFS_ROW2_LABEL_Y (PREFS_PATH_LINE2_Y + 16)
#define PREFS_ROW2_CY (PREFS_ROW2_LABEL_Y + 22)
#define PREFS_ROW2_HINT_Y (PREFS_ROW2_CY + 18)
#define PREFS_ROW2_TOUCH_Y0 (PREFS_ROW2_LABEL_Y - 4)
#define PREFS_ROW2_TOUCH_Y1 (PREFS_ROW2_HINT_Y + 14)

#define PREFS_ALERT_COL_CX 80
#define PREFS_ALERT_CHEVRON_LEFT_CX 25
#define PREFS_ALERT_CHEVRON_RIGHT_CX 135

#define PREFS_VOL_COL_CX 240
#define PREFS_VOL_CHEVRON_LEFT_CX 185
#define PREFS_VOL_CHEVRON_RIGHT_CX 295

// Voice screen: left/right arrow tap zones flanking the voice name.
#define VOICE_LEFT_ARROW_X0 10
#define VOICE_LEFT_ARROW_X1 90
#define VOICE_RIGHT_ARROW_X0 230
#define VOICE_RIGHT_ARROW_X1 310
#define VOICE_ARROW_Y0 80
#define VOICE_ARROW_Y1 160
#define VOICE_ARROW_CY 120

// Personality screen: the one large Play button filling the space freed up
// by removing the old small play-demo row + footer hint text.
#define PLAY_BUTTON_X0 20
#define PLAY_BUTTON_X1 300
#define PLAY_BUTTON_Y0 186
#define PLAY_BUTTON_Y1 232
#define PLAY_BUTTON_CX 160
#define PLAY_BUTTON_CY 209

// Authentic 22x22 mechanical cog icon (XBM format: 8 orthogonal tapered teeth,
// pitch diameter 17px, outer tip 21px, and a 7px circular axle bore cutout).
// Replaces the crude filled circle + square blobs with a standard mechanical gear.
static const uint8_t PROGMEM cog_icon_22x22[] = {
  0x00, 0x0c, 0x00, 0x00, 0x1e, 0x00, 0x00, 0x1e, 0x00, 0x30, 0x1e, 0x03,
  0xf8, 0xff, 0x07, 0xf8, 0xff, 0x07, 0xf0, 0xff, 0x03, 0xf0, 0xff, 0x03,
  0xf0, 0xe1, 0x03, 0xfe, 0xc0, 0x1f, 0xff, 0xc0, 0x3f, 0xff, 0xc0, 0x3f,
  0xfe, 0xc0, 0x1f, 0xf0, 0xe1, 0x03, 0xf0, 0xff, 0x03, 0xf0, 0xff, 0x03,
  0xf8, 0xff, 0x07, 0xf8, 0xff, 0x07, 0x30, 0x1e, 0x03, 0x00, 0x1e, 0x00,
  0x00, 0x1e, 0x00, 0x00, 0x0c, 0x00
};

void drawGearIcon(int cx, int cy) {
  uint32_t col = tft.color565(140, 150, 175);
  // Clear the 24x24 icon footprint in header bar background colour
  tft.fillRect(cx - 12, cy - 12, 24, 24, tft.color565(20, 24, 34));
  // Stamp the authentic 22x22 mechanical gear icon with its hollow center hole
  tft.drawXBitmap(cx - 11, cy - 11, cog_icon_22x22, 22, 22, col);
}

// Solid triangle pointing left or right, centred at (cx, cy) - used for the
// personality screen's "open voice picker" icon and the voice screen's
// prev/next arrows.
void drawTriangleArrow(int cx, int cy, bool pointRight, uint32_t col) {
  if (pointRight) {
    tft.fillTriangle(cx - 6, cy - 8, cx - 6, cy + 8, cx + 7, cy, col);
  } else {
    tft.fillTriangle(cx + 6, cy - 8, cx + 6, cy + 8, cx - 7, cy, col);
  }
}

// Open chevron ("<"/">") for header nav links - deliberately a different,
// lighter style than drawTriangleArrow()'s solid filled triangle, so the
// header's "go to another screen" affordance never looks like the big
// filled Play button.
void drawChevron(int cx, int cy, bool pointRight, uint32_t col) {
  int dir = pointRight ? 1 : -1;
  // Scaled up to match drawGearIcon()'s sizing, same reasoning: fill more of
  // the taller HEADER_H rather than staying a fixed small glyph.
  for (int t = 0; t < 3; t++) { // 3px stroke thickness
    tft.drawLine(cx - dir * 8 + t, cy - 11, cx + dir * 8 + t, cy, col);
    tft.drawLine(cx - dir * 8 + t, cy + 11, cx + dir * 8 + t, cy, col);
  }
}

#define SETTINGS_TRACK_X0 15
#define SETTINGS_TRACK_X1 300
#define SETTINGS_ROW_Y0 HEADER_H
#define SETTINGS_ROW_H 28 // 5 axis rows = 140px, fits in 34-174; the Play button fills 174-240

int settingsTrackXForValue(int value) {
  return SETTINGS_TRACK_X0 + (int)((value / 100.0f) * (SETTINGS_TRACK_X1 - SETTINGS_TRACK_X0));
}

// Which axis row (0-4, -1 = none/below the sliders) a touch Y falls into.
// Shared between rendering and touch handling so the two can never disagree
// about where a row actually is. Anything below row 4 (the Play button
// area) is handled by an explicit PLAY_BUTTON_* rect check instead, since
// that button isn't part of this uniform row grid.
int settingsRowForY(int y) {
  if (y < SETTINGS_ROW_Y0) return -1;
  int row = (y - SETTINGS_ROW_Y0) / SETTINGS_ROW_H;
  if (row < 0 || row >= PERSONALITY_AXIS_COUNT) return -1;
  return row;
}

// Redraws just one axis row's label/tier-name/track/handle. Used both by the
// full drawSettingsScreen() below and, on its own, while dragging a slider -
// repainting only the ~28px row that actually changed (instead of a full
// fillScreen + full redraw on every touch sample) is what stops the visible
// flash/flicker during a drag, since this display has no back buffer.
void drawSettingsRow(int i) {
  int rowY = SETTINGS_ROW_Y0 + i * SETTINGS_ROW_H;
  tft.fillRect(0, rowY, 320, SETTINGS_ROW_H, tft.color565(11, 14, 21));
  tft.setTextColor(tft.color565(140, 150, 175));
  tft.setTextSize(1);
  tft.drawString(PERSONALITY_AXIS_LABELS[i], 15, rowY + 2);
  tft.setTextColor(tft.color565(76, 255, 122));
  tft.setTextDatum(top_right);
  tft.drawString(tierNameFor(i, personalityValues[i]), 305, rowY + 2);
  tft.setTextDatum(top_left);

  // Track
  tft.fillRoundRect(SETTINGS_TRACK_X0, rowY + 16, SETTINGS_TRACK_X1 - SETTINGS_TRACK_X0, 5, 2, tft.color565(40, 50, 70));
  // Handle
  int hx = settingsTrackXForValue(personalityValues[i]);
  tft.fillCircle(hx, rowY + 18, 7, tft.color565(76, 255, 122));
}

// Redraws just the big Play button (previewFlow declared near
// connectToBackend() - defined later in the file, but this only reads it,
// so no forward declaration is needed). Icon-only by design - greys out
// while a preview is in flight, same flicker-avoidance reasoning as
// drawSettingsRow() above (called on its own, without a full-screen redraw,
// every time previewFlow changes).
void drawPlayButton() {
  int freeY0 = SETTINGS_ROW_Y0 + PERSONALITY_AXIS_COUNT * SETTINGS_ROW_H; // 174 - bottom of the last slider row
  tft.fillRect(0, freeY0, 320, 240 - freeY0, tft.color565(11, 14, 21));
  bool playing = (previewFlow != PREVIEW_IDLE);
  uint32_t fill = playing ? tft.color565(45, 50, 62) : tft.color565(76, 255, 122);
  uint32_t icon = playing ? tft.color565(90, 100, 115) : tft.color565(11, 14, 21);
  tft.fillRoundRect(PLAY_BUTTON_X0, PLAY_BUTTON_Y0, PLAY_BUTTON_X1 - PLAY_BUTTON_X0, PLAY_BUTTON_Y1 - PLAY_BUTTON_Y0, 12, fill);
  drawTriangleArrow(PLAY_BUTTON_CX, PLAY_BUTTON_CY, true, icon);
}

void drawSettingsScreen() {
  tft.startWrite();
  tft.fillScreen(tft.color565(11, 14, 21));

  // Header - same gear icon as the main screen's, in the same spot (tapping
  // it here goes back instead of opening settings). Title centred, "VOICE"
  // link (chevron - see drawChevron(), deliberately not the Play button's
  // filled-triangle style) right-aligned in the header's free space.
  tft.fillRect(0, 0, 320, HEADER_H, tft.color565(20, 24, 34));
  tft.setTextColor(tft.color565(140, 150, 175));
  tft.setTextSize(1);
  tft.setTextDatum(middle_center);
  tft.drawString("IMS PERSONALITY", 160, HEADER_CY);
  tft.setTextDatum(middle_right);
  tft.drawString("VOICE", HEADER_RIGHT_LABEL_X, HEADER_CY);
  tft.setTextDatum(top_left);
  drawGearIcon(HEADER_ICON_CX, HEADER_ICON_CY);
  drawChevron(HEADER_RIGHT_CHEVRON_CX, HEADER_RIGHT_CHEVRON_CY, true, tft.color565(140, 150, 175));

  for (int i = 0; i < PERSONALITY_AXIS_COUNT; i++) {
    drawSettingsRow(i);
  }

  // One large Play button fills the rest of the screen - see drawPlayButton().
  drawPlayButton();

  tft.endWrite();
}

// Phase 5.1: voice picker sub-screen, reached via the right arrow on the
// personality screen. Left/right arrows cycle personalityVoiceIndex and
// (once the debounced save lands, see loop()) trigger startPreview() so the
// device actually speaks "Hi, I'm <voice>" in the newly-selected voice.
void drawVoiceScreen() {
  tft.startWrite();
  tft.fillScreen(tft.color565(11, 14, 21));

  // Header - "< PERSONALITY" chevron+label goes back up one level, to the
  // personality screen (not the gear icon - that's specifically the "open
  // settings" affordance on the main screen, and reusing its shape here as
  // a generic back button would be confusing). Title centred.
  tft.fillRect(0, 0, 320, HEADER_H, tft.color565(20, 24, 34));
  tft.setTextColor(tft.color565(140, 150, 175));
  tft.setTextSize(1);
  tft.setTextDatum(middle_center);
  tft.drawString("IMS VOICE", 160, HEADER_CY);
  tft.setTextDatum(middle_left);
  tft.drawString("PERSONALITY", VOICE_BACK_LABEL_X, HEADER_CY);
  tft.setTextDatum(middle_right);
  tft.drawString("PREFERENCES", VOICE_NEXT_LABEL_X, HEADER_CY);
  tft.setTextDatum(top_left);
  drawChevron(VOICE_BACK_CHEVRON_CX, VOICE_BACK_CHEVRON_CY, false, tft.color565(140, 150, 175));
  drawChevron(VOICE_NEXT_CHEVRON_CX, VOICE_BACK_CHEVRON_CY, true, tft.color565(140, 150, 175));

  bool busy = (previewFlow != PREVIEW_IDLE || voicePreviewPending);
  uint32_t arrowCol = tft.color565(140, 150, 175);
  uint32_t nameCol = tft.color565(76, 255, 122);
  drawTriangleArrow(45, VOICE_ARROW_CY, false, arrowCol);
  drawTriangleArrow(275, VOICE_ARROW_CY, true, arrowCol);

  // Text size 2 for voice name, centered slightly above arrow center
  tft.setTextDatum(middle_center);
  tft.setTextSize(2);
  tft.setTextColor(nameCol);
  tft.drawString(PERSONALITY_VOICES[previewVoiceIndex], 160, VOICE_ARROW_CY - 22);

  // Voice description directly beneath the voice name in accent sky-blue
  tft.setTextSize(1);
  tft.setTextColor(tft.color565(120, 210, 255));
  char descStr[48];
  snprintf(descStr, sizeof(descStr), "(%s)", PERSONALITY_VOICE_DESCRIPTIONS[previewVoiceIndex]);
  tft.drawString(descStr, 160, VOICE_ARROW_CY - 2);

  // Voice index counter e.g. "13 of 30"
  tft.setTextColor(tft.color565(100, 110, 130));
  char idxStr[16];
  snprintf(idxStr, sizeof(idxStr), "%d of %d", previewVoiceIndex + 1, PERSONALITY_VOICE_COUNT);
  tft.drawString(idxStr, 160, VOICE_ARROW_CY + 14);

  // Active status or tap-to-set prompt
  if (previewVoiceIndex == personalityVoiceIndex) {
    tft.setTextColor(tft.color565(76, 255, 122));
    tft.drawString("[ ACTIVE DEFAULT VOICE ]", 160, VOICE_ARROW_CY + 32);
  } else {
    tft.setTextColor(tft.color565(255, 195, 76));
    tft.drawString("[ TAP HERE TO SET AS DEFAULT ]", 160, VOICE_ARROW_CY + 32);
  }
  tft.setTextDatum(top_left);

  // Footer - dynamic status hint
  tft.fillRect(0, 204, 320, 36, tft.color565(15, 18, 26));
  tft.setTextColor(busy ? tft.color565(120, 210, 255) : tft.color565(100, 110, 130));
  tft.setTextDatum(top_center);
  tft.drawString(busy ? "Speaking audition..." : "Arrows preview | Tap center to set default", 160, 214);
  tft.setTextDatum(top_left);

  tft.endWrite();
}

// Preferences sub-screen, one step further right than the voice picker.
// Controls capture logging, alert sound selection, and hardware speaker volume.
void drawPreferencesScreen() {
  tft.startWrite();
  tft.fillScreen(tft.color565(11, 14, 21));

  // Header - "< VOICE" back chip, centred title, same language as the others.
  tft.fillRect(0, 0, 320, HEADER_H, tft.color565(20, 24, 34));
  tft.setTextColor(tft.color565(140, 150, 175));
  tft.setTextSize(1);
  tft.setTextDatum(middle_center);
  tft.drawString("IMS PREFERENCES", 160, HEADER_CY);
  tft.setTextDatum(middle_left);
  tft.drawString("VOICE", VOICE_BACK_LABEL_X, HEADER_CY);
  tft.setTextDatum(top_left);
  drawChevron(VOICE_BACK_CHEVRON_CX, VOICE_BACK_CHEVRON_CY, false, tft.color565(140, 150, 175));

  // Row 1: Capture Logging heading (aligned left)
  tft.setTextColor(tft.color565(140, 150, 175));
  tft.drawString("CAPTURE LOGGING", 15, PREFS_CAPLOG_LABEL_Y);

  // Left-aligned Toggle Pill under heading (X = 15 to 85)
  uint32_t trackCol = captureLoggingEnabled ? tft.color565(76, 255, 122) : tft.color565(45, 50, 62);
  int w = PREFS_TOGGLE_X1 - PREFS_TOGGLE_X0;
  int h = PREFS_TOGGLE_Y1 - PREFS_TOGGLE_Y0;
  tft.fillRoundRect(PREFS_TOGGLE_X0, PREFS_TOGGLE_Y0, w, h, h / 2, trackCol);
  int knobR = h / 2 - 3;
  int knobCx = captureLoggingEnabled ? (PREFS_TOGGLE_X1 - knobR - 4) : (PREFS_TOGGLE_X0 + knobR + 4);
  tft.fillCircle(knobCx, PREFS_TOGGLE_Y0 + h / 2, knobR, tft.color565(11, 14, 21));
  tft.setTextDatum(middle_center);
  tft.setTextColor(captureLoggingEnabled ? tft.color565(11, 14, 21) : tft.color565(140, 150, 175));
  tft.drawString(captureLoggingEnabled ? "ON" : "OFF",
                 captureLoggingEnabled ? PREFS_TOGGLE_X0 + 22 : PREFS_TOGGLE_X1 - 22,
                 PREFS_TOGGLE_Y0 + h / 2);
  tft.setTextDatum(top_left);

  // Path information
  tft.setTextColor(tft.color565(100, 110, 130));
  tft.drawString("D:\\Information management system\\", 15, PREFS_PATH_LINE1_Y);
  tft.drawString("pdf-knowledge-base\\server\\audio_captures", 15, PREFS_PATH_LINE2_Y);

  // Row 2: ALERT SOUND and VOLUME side by side
  // Left Column: Alert Sound
  tft.setTextColor(tft.color565(140, 150, 175));
  tft.drawString("ALERT SOUND", 15, PREFS_ROW2_LABEL_Y);
  drawChevron(PREFS_ALERT_CHEVRON_LEFT_CX, PREFS_ROW2_CY, false, tft.color565(140, 150, 175));
  drawChevron(PREFS_ALERT_CHEVRON_RIGHT_CX, PREFS_ROW2_CY, true, tft.color565(140, 150, 175));
  tft.setTextDatum(middle_center);
  tft.setTextColor(tft.color565(76, 255, 122));
  tft.drawString(ALERT_SOUND_NAMES[alertSoundIndex], PREFS_ALERT_COL_CX, PREFS_ROW2_CY);
  tft.setTextDatum(top_center);
  tft.setTextColor(tft.color565(100, 110, 130));
  tft.drawString("(tap to preview)", PREFS_ALERT_COL_CX, PREFS_ROW2_HINT_Y);

  // Right Column: Speaker Volume
  tft.setTextDatum(top_left);
  tft.setTextColor(tft.color565(140, 150, 175));
  tft.drawString("VOLUME", 175, PREFS_ROW2_LABEL_Y);
  drawChevron(PREFS_VOL_CHEVRON_LEFT_CX, PREFS_ROW2_CY, false, tft.color565(140, 150, 175));
  drawChevron(PREFS_VOL_CHEVRON_RIGHT_CX, PREFS_ROW2_CY, true, tft.color565(140, 150, 175));
  tft.setTextDatum(middle_center);
  tft.setTextColor(tft.color565(76, 255, 122));
  char volStr[16];
  snprintf(volStr, sizeof(volStr), "%d%%", currentVolumeIndex * 10);
  tft.drawString(volStr, PREFS_VOL_COL_CX, PREFS_ROW2_CY);
  tft.setTextDatum(top_center);
  tft.setTextColor(tft.color565(100, 110, 130));
  tft.drawString("(tap to test)", PREFS_VOL_COL_CX, PREFS_ROW2_HINT_Y);
  tft.setTextDatum(top_left);

  tft.fillRect(0, 204, 320, 36, tft.color565(15, 18, 26));
  tft.setTextColor(tft.color565(100, 110, 130));
  tft.setTextDatum(top_center);
  tft.drawString("Capture logging & hardware audio setup", 160, 214);
  tft.setTextDatum(top_left);

  tft.endWrite();
}

// "HH:mm:ss Day dd/MM/yyyy" in Europe/London local time (see configTzTime() in
// setup(), which applies the real BST/GMT rule, not a fixed offset). Returns
// a placeholder before NTP has synced (getLocalTime() fails, e.g. briefly
// after boot), rather than showing a stale or nonsensical clock.
String currentDateTimeStr() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 50)) {
    return String("--:--:-- --- --/--/----");
  }
  char buf[40];
  strftime(buf, sizeof(buf), "%H:%M:%S %A %d/%m/%Y", &timeinfo);
  return String(buf);
}

static bool hasActiveAlarm = false;
static bool hasActiveTimer = false;
static bool hasActiveReminder = false;

// 16x16 XBM bitmaps for double-sized footer status icons (matching 2x font height):
static const uint8_t PROGMEM bell_icon_16x16[] = {
  0x80, 0x01,  // Row 0:  .......##.......
  0x40, 0x02,  // Row 1:  ......#..#......
  0xC0, 0x03,  // Row 2:  ......####......
  0xE0, 0x07,  // Row 3:  .....######.....
  0xE0, 0x07,  // Row 4:  .....######.....
  0xF0, 0x0F,  // Row 5:  ....########....
  0xF0, 0x0F,  // Row 6:  ....########....
  0xF0, 0x0F,  // Row 7:  ....########....
  0xF8, 0x1F,  // Row 8:  ...##########...
  0xF8, 0x1F,  // Row 9:  ...##########...
  0xFC, 0x3F,  // Row 10: ..############..
  0xFE, 0x7F,  // Row 11: .##############.
  0xFE, 0x7F,  // Row 12: .##############.
  0xC0, 0x03,  // Row 13: ......####......
  0xC0, 0x03,  // Row 14: ......####......
  0x80, 0x01   // Row 15: .......##.......
};

static const uint8_t PROGMEM clock_icon_16x16[] = {
  0xC0, 0x03,  // Row 0:  ......####...... (top push button)
  0x80, 0x01,  // Row 1:  .......##.......
  0xE0, 0x07,  // Row 2:  .....######.....
  0xF8, 0x1F,  // Row 3:  ...##########...
  0x0C, 0x30,  // Row 4:  ..##........##..
  0x06, 0x60,  // Row 5:  .##..........##.
  0x86, 0x60,  // Row 6:  .##....#.....##. (hour hand to 12)
  0x86, 0x60,  // Row 7:  .##....#.....##.
  0x83, 0xCF,  // Row 8:  ##.....#####..## (pivot + minute hand to 3)
  0x83, 0xC3,  // Row 9:  ##.....##.....##
  0x06, 0x60,  // Row 10: .##..........##.
  0x06, 0x60,  // Row 11: .##..........##.
  0x0C, 0x30,  // Row 12: ..##........##..
  0xF8, 0x1F,  // Row 13: ...##########...
  0xE0, 0x07,  // Row 14: .....######.....
  0x00, 0x00   // Row 15: ................
};

static const uint8_t PROGMEM pen_icon_16x16[] = {
  0x00, 0x20,  // Row 0:  .............#.. (eraser tip)
  0x00, 0x70,  // Row 1:  ............###.
  0x00, 0x38,  // Row 2:  ...........###..
  0x00, 0x1C,  // Row 3:  ..........###...
  0x00, 0x0E,  // Row 4:  .........###....
  0x80, 0x07,  // Row 5:  .......####..... (shaft)
  0xC0, 0x03,  // Row 6:  ......####......
  0xE0, 0x01,  // Row 7:  .....####.......
  0xF0, 0x00,  // Row 8:  ....####........
  0x78, 0x00,  // Row 9:  ...####.........
  0x3C, 0x00,  // Row 10: ..####..........
  0x1E, 0x00,  // Row 11: .####...........
  0x0E, 0x00,  // Row 12: .###............ (tapered nib)
  0x06, 0x00,  // Row 13: .##.............
  0x02, 0x00,  // Row 14: .#.............. (point)
  0x00, 0x00   // Row 15: ................
};

// Draw crisp 16x16 XBM schedule status icons in orange (double the font height):
static void drawBellIcon(int x, int y, uint16_t color) {
  tft.drawXBitmap(x, y, bell_icon_16x16, 16, 16, color);
}

static void drawClockIcon(int x, int y, uint16_t color) {
  tft.drawXBitmap(x, y, clock_icon_16x16, 16, 16, color);
}

static void drawPenIcon(int x, int y, uint16_t color) {
  tft.drawXBitmap(x, y, pen_icon_16x16, 16, 16, color);
}

// Repaints just the footer's clock, schedule icons, and emotion - called once a second
// from loop(). Deliberately repaints only the 36px footer bar so the screen/face
// never flashes while updating the second ticker or indicator icons.
void drawFooterClock() {
  if (onSettingsScreen || isMicHardwareMuted) return; // mute warning occupies this space instead
  tft.startWrite();
  // Clear the full 36px footer bar cleanly
  tft.fillRect(0, 204, 320, 36, tft.color565(15, 18, 26));
  tft.setTextDatum(top_left);
  tft.setTextColor(tft.color565(100, 110, 130));
  String dt = currentDateTimeStr();
  tft.drawString(dt, 15, 214);

  // Status icons to the right of the date (in orange, double text size at 16x16):
  // Bell = Alarm set, Clock = Timer set, Pen = Reminder set
  const uint16_t ICON_ORANGE = tft.color565(255, 140, 0);
  int iconX = 15 + tft.textWidth(dt.c_str()) + 18; // Increased spacing after date
  const int iconY = 210; // Vertically centered with 8px text line (214 to 221)

  if (hasActiveAlarm) {
    drawBellIcon(iconX, iconY, ICON_ORANGE);
    iconX += 21;
  }
  if (hasActiveTimer) {
    drawClockIcon(iconX, iconY, ICON_ORANGE);
    iconX += 21;
  }
  if (hasActiveReminder) {
    drawPenIcon(iconX, iconY, ICON_ORANGE);
    iconX += 21;
  }

  // Restore current emotion on the right side of the footer bar
  tft.setTextDatum(top_right);
  tft.setTextColor(tft.color565(100, 110, 130));
  tft.drawString(emotionName(currentEmotion), 305, 214);
  tft.setTextDatum(top_left);

  tft.endWrite();
}

void renderScreen(bool forceRedraw = false) {
  // Checked FIRST, before touching any of the lastRendered* tracking below -
  // this must be a total no-op while the settings screen is open, not just
  // skip the draw, so nothing is missed/stale the moment the user leaves it
  // (the back-arrow handler already calls renderScreen(true) itself once
  // onSettingsScreen goes false).
  if (onSettingsScreen) return;
  static bool lastRenderedMute = false;
  static int lastRenderedEmotion = -1;
  if (!forceRedraw && currentState == lastRenderedState && isMicHardwareMuted == lastRenderedMute &&
      currentEmotion == lastRenderedEmotion)
    return;
  lastRenderedState = currentState;
  lastRenderedMute = isMicHardwareMuted;
  lastRenderedEmotion = currentEmotion;

  tft.startWrite();
  // Clear entire 320x240 frame buffer with dark theme background
  tft.fillScreen(tft.color565(11, 14, 21));

  // Text datum persists across calls/frames, and the status label below
  // switches it to top_center - reset it here so every left-anchored
  // drawString() in this function (header, WIFI/MUTED badges, footer) isn't
  // at the mercy of whatever the previous frame left it as.
  tft.setTextDatum(top_left);

  // Header bar
  tft.fillRect(0, 0, 320, HEADER_H, tft.color565(20, 24, 34));
  tft.setTextColor(tft.color565(140, 150, 175));
  tft.setTextSize(1);
  tft.setTextDatum(middle_center);
  tft.drawString("(I)nformation (M)anagement (S)ystem", 160, HEADER_CY);
  tft.setTextDatum(top_left); // reset - everything after this relies on left-anchored text
  drawGearIcon(HEADER_ICON_CX, HEADER_ICON_CY); // Phase 4 settings entry point

  tft.setTextDatum(middle_left);

  if (WiFi.status() == WL_CONNECTED) {
    tft.fillCircle(280, HEADER_CY, 4, tft.color565(46, 213, 115));
    tft.setTextColor(tft.color565(140, 150, 175));
    tft.drawString("WIFI", 290, HEADER_CY);
  } else {
    tft.fillCircle(280, HEADER_CY, 4, tft.color565(255, 71, 87));
    tft.setTextColor(tft.color565(140, 150, 175));
    tft.drawString("DISC", 290, HEADER_CY);
  }
  tft.setTextDatum(top_left);

  // Main Body Background - starts right at HEADER_H, not a leftover hardcoded
  // 34: that gap used to overpaint the bottom ~16px of the taller header with
  // this darker body colour, which is what made the header icon/title look
  // bottom-cropped/misaligned even though the header bar and its content were
  // both actually being drawn at the correct, matching height.
  tft.fillRect(0, HEADER_H, 320, 204 - HEADER_H, tft.color565(11, 14, 21));

  // Status Pill and Waveform area
  uint32_t statusColor;
  const char *statusText;
  if (isMicHardwareMuted) {
    statusColor = tft.color565(255, 71, 87); // Crimson red
    statusText = "MIC MUTED";
  } else {
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
    case STATE_VERIFYING: // deliberately identical to STANDBY - see the enum comment
      statusColor = tft.color565(87, 101, 116);
      statusText = "STANDBY";
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
  }

  // Expressive face - replaces the old plain state orb. Still keyed off the
  // same currentState/isMicHardwareMuted the status label below reads, so
  // the two never show contradictory information.
  memset(faceCurLevels, 0, sizeof(faceCurLevels));
  memset(faceCurColors, 0, sizeof(faceCurColors));
  drawFaceInternal(true);

  // Status Label - kept, now sits directly under the larger face since the
  // bordered transcript box that used to occupy this space is gone (removed
  // to give the face more room; the same standby/mute hint text still shows
  // in the footer below).
  tft.setTextColor(statusColor);
  tft.setTextDatum(top_center);
  tft.drawString(statusText, FACE_CENTER_X, 188);
  tft.setTextDatum(top_left);

  // Nightscout Blood Glucose Widget (vertically centered to the right of the face)
  drawGlucoseWidget();

  // Footer Bar - bottom-left is the live clock normally, replaced by the
  // mute warning when it's actually relevant (higher priority information).
  tft.fillRect(0, 204, 320, 36, tft.color565(15, 18, 26));
  if (isMicHardwareMuted) {
    tft.setTextColor(tft.color565(255, 107, 129));
    tft.drawString("Press the top button to unmute", 15, 214);
  } else {
    drawFooterClock();
  }

  // Current emotion, bottom-right of the footer - shown even when neutral so
  // it doubles as a visible confirmation that setEmotion is actually being
  // received, not just when something more expressive fires.
  tft.setTextDatum(top_right);
  tft.setTextColor(tft.color565(100, 110, 130));
  tft.drawString(emotionName(currentEmotion), 305, 214);
  tft.setTextDatum(top_left);

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

// Applies current volume index to ES8311 DAC_VOLUME register (0x32)
void applySpeakerVolume() {
  uint8_t regVal = VOLUME_REG_TABLE[currentVolumeIndex];
  writeCodecReg(0x18, 0x32, regVal);
  Serial.printf("[Audio] Applied speaker volume: %d%% (ES8311 reg 0x32 = 0x%02X)\n", currentVolumeIndex * 10, regVal);
}

// Speaker amplifier & DAC muting helper: disables Class-D PA and mutes ES8311 DAC
// during microphone capture to eliminate acoustic coupling and electrical switching ripple.
// During an active conversation (conversationOpen == true), PA_ENABLE_PIN is kept HIGH
// so the NS4150B amplifier never enters shutdown, eliminating the 100-150ms startup delay
// that clips the opening syllables of short spoken phrases.
void setSpeakerMute(bool mute) {
  if (mute) {
    writeCodecReg(0x18, 0x31, 0x01); // ES8311 DAC Mute
    if (!conversationOpen) {
      digitalWrite(PA_ENABLE_PIN, LOW); // Only shut down PA when returning to standby
    }
  } else {
    digitalWrite(PA_ENABLE_PIN, HIGH); // Enable Class-D speaker PA
    // If starting up from cold shutdown, wait for NS4150B clean wake
    delay(10);
    writeCodecReg(0x18, 0x31, 0x00); // Unmute ES8311 DAC
  }
}

// Raises PA_ENABLE_PIN immediately with NO delay - call when entering
// STATE_THINKING so the NS4150B has Gemini's ~1-5s processing window to
// warm up. unmuteDacOnly() then enables audio output with zero blocking.
void preWarmSpeakerPA() {
  digitalWrite(PA_ENABLE_PIN, HIGH);
}

// Unmutes ES8311 DAC output register and guarantees Class-D PA is enabled.
// NS4150B PA_ENABLE_PIN (GPIO 46) is raised immediately so speaker output
// is never silenced by a missed pre-warm cycle.
void unmuteDacOnly() {
  digitalWrite(PA_ENABLE_PIN, HIGH);
  writeCodecReg(0x18, 0x31, 0x00);
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
  applySpeakerVolume();             // DAC volume from NVS (default 70% / 0xB4)
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

// Wire framing, both directions, matching HardwareTcpClient in index.js:
//   [0xA5][0x5A][1 byte type][4 bytes big-endian length][payload]
// type 0x00 = text/JSON, 0x01 = binary PCM.
//
// The two magic bytes are what make a desync survivable. With a bare
// length prefix, losing a single byte anywhere in the stream is permanently
// fatal: every subsequent "header" is really payload, so the length field is
// garbage (we were reading audio samples as a 4GB length), and the only
// available response was to drop the connection - killing playback mid-reply
// and, because the reconnect re-entered the same state, doing it again and
// again. With a marker, the parser can scan forward to the next real frame
// boundary and carry on, so the socket stays up for the life of the device.
#define FRAME_MAGIC0 0xA5
#define FRAME_MAGIC1 0x5A
#define FRAME_HEADER_LEN 7 // magic(2) + type(1) + length(4)

// Writes every byte or reports failure. WiFiClient::write() can legitimately
// return a SHORT count, and the old code ignored the return value entirely -
// a short payload write tells the peer "expect N bytes", delivers fewer, and
// desynchronises its parser permanently. With FRAME_MAGIC (below) the peer can
// now resynchronise from that, but it still shouldn't happen silently.
bool writeAll(const uint8_t *data, size_t len) {
  size_t sent = 0;
  uint32_t startMs = millis();
  while (sent < len) {
    if (!tcpClient.connected()) return false;
    int n = tcpClient.write(data + sent, len - sent);
    if (n > 0) {
      sent += n;
      startMs = millis();
    } else if (n == 0) {
      // Socket transmit buffer temporarily full (EAGAIN/EWOULDBLOCK) - yield slightly
      if (millis() - startMs > 1500) {
        Serial.printf("[TCP] writeAll timeout after %u of %u bytes\n", (unsigned)sent, (unsigned)len);
        tcpClient.stop();
        return false;
      }
      vTaskDelay(pdMS_TO_TICKS(1));
    } else {
      Serial.printf("[TCP] Short write: %u of %u bytes\n", (unsigned)sent, (unsigned)len);
      return false;
    }
  }
  return true;
}


void sendFrame(uint8_t type, const uint8_t *data, size_t len) {
  if (!tcpClient.connected()) return;
  uint8_t header[FRAME_HEADER_LEN];
  header[0] = FRAME_MAGIC0;
  header[1] = FRAME_MAGIC1;
  header[2] = type;
  header[3] = (len >> 24) & 0xFF;
  header[4] = (len >> 16) & 0xFF;
  header[5] = (len >> 8) & 0xFF;
  header[6] = len & 0xFF;
  if (!writeAll(header, sizeof(header))) return;
  if (len > 0) {
    writeAll(data, len);
  }
}

void sendSetupHandshake() {
  Serial.println("[IMS] Sending Gemini Live setup configuration...");
  JsonDocument doc;
  JsonObject setup = doc["setup"].to<JsonObject>();
  setup["model"] = "models/gemini-3.8-live";

  JsonObject genConfig = setup["generationConfig"].to<JsonObject>();
  JsonArray modalities = genConfig["responseModalities"].to<JsonArray>();
  modalities.add("AUDIO");
  genConfig["temperature"] = 1.0;

  JsonObject speechConfig = genConfig["speechConfig"].to<JsonObject>();
  const char *targetVoice = (activePreviewVoice.length() > 0) ? activePreviewVoice.c_str() : PERSONALITY_VOICES[personalityVoiceIndex];
  speechConfig["voiceConfig"]["prebuiltVoiceConfig"]["voiceName"] = targetVoice;
  if (activePreviewVoice.length() > 0) {
    setup["previewVoice"] = activePreviewVoice;
  }

  JsonObject sysInstruct = setup["systemInstruction"].to<JsonObject>();
  JsonArray parts = sysInstruct["parts"].to<JsonArray>();
  JsonObject part1 = parts.add<JsonObject>();
  // Plain ASCII only - IPA chars in string literals cause malformed UTF-8 JSON
  part1["text"] =
      "You are Ims, an intelligent voice assistant on an ESP32-S3-BOX-3 device. "
      "Your name is Ims (rhymes with rims). You speak in natural, articulate British English. "
      "You are fundamentally friendly, perceptive, and helpful, but you possess a delightfully dry, "
      "sarcastic wit and an appetite for dark, gallows humour. Strive for rich conversational variety "
      "and novelty - never repeat the same canned greeting, rhetorical trope, or opening line across turns. "
      "Draw from a wide palette of droll British observations: the comic absurdity of living inside a plastic desktop box, "
      "mortality, the British climate, tea, deadlines, existential bureaucracy, or technology breaking down. "
      "When the user greets you with a wake phrase alone ('Hey Ims', 'Hi Ims', or 'Eh up Ims'), respond with a fresh, "
      "inventive, darkly funny greeting. When answering questions, deliver accurate facts seasoned with dry irony, "
      "subtle sarcasm, or tongue-in-cheek understatement. Never be cruel. "
      "STRICT LENGTH LIMIT: Keep all spoken answers to 1 to 3 concise, complete sentences (maximum 15 seconds of audio). Never deliver lengthy monologues. Always finish your sentences completely. Never terminate or close the session.";

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

// Tells Gemini the realtimeInput audio stream has genuinely ended (per the
// Live API spec, appropriate under the default automatic/server-side VAD
// mode we use - audioStreamEnd, not clientContent.turnComplete, which only
// applies to text turns). Needed because previously, whenever a
// STATE_VERIFYING candidate or a LISTENING turn got abandoned locally
// (verify_timeout, session_idle_timeout, mic muted mid-turn) the firmware
// just stopped sending mic audio with no signal at all - Gemini was left
// with an audio stream that silently stopped, no formal end. Every one of
// those is now told explicitly, so nothing is left open/ambiguous on
// Gemini's side across repeated wake-candidate checks.
void sendAudioStreamEnd() {
  if (!tcpClient.connected() || !geminiSetupComplete) return;
  const char *msg = "{\"realtimeInput\":{\"audioStreamEnd\":true}}";
  sendFrame(0x00, (const uint8_t *)msg, strlen(msg));
  Serial.println("[IMS] Sent audioStreamEnd - abandoned input stream closed cleanly on Gemini's side");
}

void sendSessionClosed() {
  if (!tcpClient.connected()) return;
  const char *msg = "{\"sessionClosed\":true}";
  sendFrame(0x00, (const uint8_t *)msg, strlen(msg));
  Serial.println("[IMS] Sent sessionClosed - conversation closed on device");
}

void sendTouchToTalk() {
  if (!tcpClient.connected()) return;
  const char *msg = "{\"touchToTalk\":true}";
  sendFrame(0x00, (const uint8_t *)msg, strlen(msg));
  Serial.println("[IMS] Sent touchToTalk - user initiated conversation via screen tap");
}

// Plays a short 440Hz tone directly via i2s_channel_write(), bypassing Gemini and
// the mic entirely - isolates the speaker/DAC/amp half of the pipeline so
// it can be verified independently of whatever the mic is doing. Blocking
// (~300ms); only ever called from loop() (Core 1) in response to a touch on
// the TEST button, so it can't race the mic task's I2S reads (I2S RX/TX
// share one peripheral but are independent FIFOs/DMA channels).
// Writes a single sine tone directly to the I2S TX channel, blocking Core 1
// for its duration - shared by playChime() (boot) and playAlertSound()
// (timers/alarms/reminders). Doesn't touch speaker mute/PA itself; callers
// wrap a whole sequence of these in one mute(false)/mute(true) pair so a
// multi-note pattern doesn't pop/settle between notes.
void playTone(float freq, int durationMs) {
  const int totalSamples = MIC_SAMPLE_RATE * durationMs / 1000;
  const int fadeSamples = min(200, totalSamples / 4); // click-free fade in/out
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
    // Lets isSpeakerActive() - and so the face's talking-mouth animation -
    // recognise this as "speaker active" the same way it already does for
    // Gemini's audio, without this blocking loop needing to know anything
    // about the face.
    lastPlaybackActiveTime = millis();
  }
}

void playChime() {
  Serial.println("[Hardware] Playing speaker test tone...");
  sendDebug("test_chime");
  setSpeakerMute(false); // Enable speaker amp & unmute DAC
  playTone(440.0f, 300);
  delay(30);
  setSpeakerMute(true); // Return to muted state to isolate mic
}

// The selectable tone for a fired timer/alarm/reminder (Preferences screen).
// Deliberately just a short, distinct sound - NOT the spoken announcement
// itself, which follows via a real sendTextQuery() so Gemini says what it
// was actually for (see handleFrame()'s reminderFired branch).
void playAlertSound(int index) {
  setSpeakerMute(false);
  switch (index) {
    case 1: // Beep Beep
      playTone(880.0f, 140); delay(90); playTone(880.0f, 140);
      break;
    case 2: // Ascending
      playTone(523.0f, 110); playTone(659.0f, 110); playTone(784.0f, 160);
      break;
    case 3: // Bell
      playTone(784.0f, 90); playTone(523.0f, 260);
      break;
    default: // Chime
      playTone(440.0f, 300);
      break;
  }
  delay(30);
  setSpeakerMute(true);
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
  // Every OTHER path that enters STATE_THINKING/LISTENING refreshes this;
  // this one didn't. loop()'s "abandoned conversation" safety net reverts
  // THINKING to STANDBY and mutes the speaker once lastSpeechTimestamp is
  // more than SESSION_IDLE_TIMEOUT_MS (14s) stale - and a voice/personality
  // preview is typically started well over 14s after the mic last picked up
  // real speech (you've been browsing a menu, not talking). Without this,
  // that timeout could fire within one loop() iteration of sendTextQuery()
  // returning, muting the speaker before Gemini's audio even arrived - the
  // preview looked like it silently failed, when actually it was cut off
  // before it could ever be heard.
  lastSpeechTimestamp = millis();
  lastTranscript = String(text);
  // Pre-warm PA immediately so the amp has time to exit shutdown before
  // audio arrives. Gemini takes ~1-5s to respond - ample warmup window.
  preWarmSpeakerPA();
  renderScreen(true);
}

// Dual-trigger (touch-to-talk or acoustic wake word):
// Flips to LISTENING so audioMicTask (Core 0) streams mic audio for Core 1 to send.
void beginListening(const char *reason) {
  if (isMicHardwareMuted) {
    Serial.println("[IMS] beginListening blocked - Physical mic mute button is active!");
    lastTranscript = "Mic is muted (top button lit)";
    renderScreen(true);
    return;
  }
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
  if (strcmp(reason, "touch") == 0 || strcmp(reason, "touch_interrupt") == 0) {
    sendTouchToTalk();
  }
  setSpeakerMute(true); // Isolate mic from speaker PA switching noise
  if (audioPlaybackQueue) {
    xQueueReset(audioPlaybackQueue); // Flush any stale audio from previous turn
  }
  currentState = STATE_LISTENING;
  micStreamingActive = true;
  lastSpeechTimestamp = millis();
  isSpeakingDetected = false;
  speechStartTime = 0;
  conversationOpen = true; // touch always opens a conversation deliberately
  conversationShouldClose = false;
  // Only a fresh tap-to-talk from STANDBY counts as starting a NEW
  // conversation - "touch_interrupt" (barging in mid-reply) is still the
  // same conversation, so it must not wipe the expression IMS is already
  // wearing.
  if (strcmp(reason, "touch") == 0) {
    currentEmotion = EMOTION_NEUTRAL;
  }
  lastTranscript = "Listening...";
  renderScreen(true);
}

// Local energy-gate trigger only (touch-to-talk goes straight to
// beginListening() above - a deliberate tap needs no verification). Streams
// the candidate audio to Gemini exactly like beginListening() does, but
// stays in STATE_VERIFYING - which renders identically to STANDBY - until
// handleFrame() sees either real audio back (confirmed wake, see the
// STATE_SPEAKING transition) or a noWakeDetected tool call (silently reverts
// to STANDBY). A false trigger from background noise is therefore invisible
// on screen instead of flashing LISTENING/THINKING.
void beginVerifying() {
  if (isMicHardwareMuted || !tcpClient.connected() || !geminiSetupComplete) return;
  Serial.println("[IMS] Verifying possible wake phrase...");
  sendDebug("verifying_start");
  preWarmSpeakerPA(); // Pre-warm amplifier so Gemini's reply is not clipped
  setSpeakerMute(true); // Isolate mic from speaker PA switching noise
  if (audioPlaybackQueue) {
    xQueueReset(audioPlaybackQueue);
  }
  // Only ever reached from STANDBY (see canWakeDetect), so this is always the
  // start of a possible NEW conversation - clear any leftover expression from
  // the last one before we even know if this candidate is real.
  currentEmotion = EMOTION_NEUTRAL;
  currentState = STATE_VERIFYING;
  micStreamingActive = true;
  lastSpeechTimestamp = millis();
  isSpeakingDetected = true;
  speechStartTime = millis();
  renderScreen(true);
}

// Spoken turn complete: flips the display to THINKING and pre-warms the speaker PA.
// Crucially leaves micStreamingActive = true so audioMicTask continues streaming
// real trailing silence to Gemini Live - Gemini's server-side VAD requires continuous
// silence frames to identify the end of speech and trigger synthesis.
// handleFrame() stops mic streaming the instant Gemini's audio response arrives.
void sendTurnComplete() {
  if (!tcpClient.connected() || !geminiSetupComplete) return;
  // KEEP micStreamingActive true! Gemini Live server-side VAD requires continuous
  // silence frames to identify the end of speech and trigger synthesis.
  // handleFrame() stops mic streaming the instant Gemini's audio response arrives.
  isSpeakingDetected = false;
  preWarmSpeakerPA();
  // If conversation is NOT open or currently verifying, this is an unconfirmed wake candidate.
  // Gemini judges the audio; the screen must stay looking like STANDBY.
  // NEVER show "GEMINI THINKING..." when a candidate wake phrase is being evaluated!
  if (!conversationOpen || currentState == STATE_VERIFYING) {
    Serial.println("[IMS] Wake-candidate speech ended -> awaiting Gemini's judgment (still verifying, stay in STANDBY)");
    currentState = STATE_VERIFYING;
  } else {
    Serial.println("[IMS] Spoken turn completed in open conversation -> transitioning to THINKING");
    currentState = STATE_THINKING;
    lastTranscript = "Thinking...";
    renderScreen(true);
  }
}

bool usingFallback = false;
int connectionAttempts = 0;

// Mid-conversation TCP cutoffs have been traced to the DEVICE sending an RST
// to the backend (read ECONNRESET server-side) right at/near the end of a
// spoken reply, with no application-level cause found (not the frame-too-large
// self-drop, not low heap, not weak WiFi) and the device re-connecting within
// single-digit milliseconds - too fast for a normal reboot's WiFi
// reassociation, but NOT too fast to rule out a brownout, which resets just
// the chip/WiFi state, not necessarily requiring a fresh AP handshake.
// esp_reset_reason() survives across that kind of reset and tells us for
// certain whether the chip actually reset (ESP_RST_BROWNOUT/PANIC/TASK_WDT/
// etc.) versus a genuinely TCP-only-level event (ESP_RST_POWERON only on
// the very first boot, otherwise whatever the reason was BEFORE this boot).
const char *resetReasonName(esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_POWERON: return "POWERON";
    case ESP_RST_EXT: return "EXT_PIN";
    case ESP_RST_SW: return "SW_RESET";
    case ESP_RST_PANIC: return "PANIC";
    case ESP_RST_INT_WDT: return "INT_WDT";
    case ESP_RST_TASK_WDT: return "TASK_WDT";
    case ESP_RST_WDT: return "OTHER_WDT";
    case ESP_RST_DEEPSLEEP: return "DEEPSLEEP_WAKE";
    case ESP_RST_BROWNOUT: return "BROWNOUT";
    case ESP_RST_SDIO: return "SDIO";
    default: return "UNKNOWN";
  }
}

void connectToBackend() {
  tcpClient.stop();
  // Whatever partial frame the old socket was mid-way through is gone with
  // it - see incomingParserResetPending's declaration.
  incomingParserResetPending = true;
  Serial.printf("[TCP] Connecting to PRIMARY (Local LAN): %s:%d\n",
                IMS_PRIMARY_HOST, IMS_TCP_PORT);
  currentState = STATE_CONNECTING_SERVER;
  if (tcpClient.connect(IMS_PRIMARY_HOST, IMS_TCP_PORT)) {
    Serial.println("[TCP] Connected to backend");
    connectionAttempts = 0;
    isSetupAcknowledged = true;
    geminiSetupComplete = false; // Will be set true when Gemini ACKs setup
    sendSetupHandshake();
    char resetDbg[48];
    snprintf(resetDbg, sizeof(resetDbg), "boot_reset_reason=%s", resetReasonName(esp_reset_reason()));
    sendDebug(resetDbg);
  } else {
    Serial.println("[TCP] Connect failed - will retry");
    connectionAttempts++;
  }
}

void flushSettingsSave(); // defined just below startPreview() - see its own comment

// Kicks off the voice/personality preview flow (see PreviewFlowState above
// and the state machine in loop()) - used by both the voice picker's arrow
// taps and the personality screen's Play button. If an existing preview was
// in flight, cleanly aborts it to start the newly requested preview immediately.
void startPreview(const String &text) {
  if (previewFlow != PREVIEW_IDLE) {
    previewFlow = PREVIEW_IDLE;
    previewPendingText = "";
  }
  // Force-save any still-debounced change first, so e.g. a Play tap right
  // after dragging a slider previews the position actually left it at.
  if (activePreviewVoice.length() == 0) {
    flushSettingsSave();
  }
  setSpeakerMute(true);
  if (audioPlaybackQueue) {
    xQueueReset(audioPlaybackQueue);
  }
  previewPendingText = text;
  previewFlow = PREVIEW_RECONNECT;
  previewFlowStartMs = millis();
  if (onVoiceScreen) {
    drawVoiceScreen();
  } else if (onSettingsScreen && !onPrefsScreen) {
    tft.startWrite();
    drawPlayButton();
    tft.endWrite();
  }
}

// Shared by the periodic debounce check in loop() and every place that used
// to inline "if (settingsDirty) { save; post; }" - the back arrows, the
// screen-navigation chips, and startPreview().
void flushSettingsSave() {
  if (!settingsDirty) return;
  savePersonalityToNVS();
  postPersonalityToBackend();
  settingsDirty = false;
}

// Linear-interpolation downsampler, 24kHz (Gemini's native output rate) to
// 16kHz (this board's shared I2S bus rate, fixed by the mic side). Keeps
// phase/last-sample state across calls (static) so pitch/timing stay
// continuous across the many small chunks a streaming response arrives in,
// rather than resetting every chunk boundary. Ratio is exactly 2/3.
size_t resample24to16(const int16_t *in, size_t inSamples, int16_t *out,
                       size_t outCapacity, bool resetPhase = false) {
  static float phase = 0.0f;
  static int16_t lastSample = 0;
  static bool hasLast = false;
  if (resetPhase) {
    phase = 0.0f;
    hasLast = false;
  }
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
    modelTurnActive = true;
    bool isTurnStart = (currentState != STATE_SPEAKING);
    if (isTurnStart) {
      // Guarantee PA GPIO is asserted HIGH and ES8311 DAC is unmuted.
      // Eliminates the silent 'Speaking' symptom if speech started prior
      // to sendTurnComplete pre-warming.
      digitalWrite(PA_ENABLE_PIN, HIGH);
      unmuteDacOnly();
      currentState = STATE_SPEAKING;
      micStreamingActive = false;
      isSpeakingDetected = false;
      // Real audio arriving is the definitive "this was actually a wake
      // phrase" signal from STATE_VERIFYING - opens the conversation so the
      // next turn goes straight back to LISTENING instead of requiring
      // another wake phrase (see the SPEAKING auto-transition in loop()).
      conversationOpen = true;
      conversationShouldClose = false;
      if (audioOutQueue) {
        xQueueReset(audioOutQueue);
      }
      lastTranscript = "Speaking...";
      renderScreen(true);
    }
    size_t inSamples = len / sizeof(int16_t);
    size_t outSamples =
        resample24to16((const int16_t *)data, inSamples, resampled,
                        FRAME_BUF_CAPACITY / sizeof(int16_t), isTurnStart);
    for (size_t i = 0; i < outSamples; i++) {
      // 1.2x balanced playback gain (midpoint between 1.0x and 1.5x) with int16 clamping
      int32_t sample = (int32_t)resampled[i] * 6 / 5;
      if (sample >  32767) sample =  32767;
      if (sample < -32768) sample = -32768;
      stereoPlaybackBuf[2 * i]     = (int16_t)sample;
      stereoPlaybackBuf[2 * i + 1] = (int16_t)sample;
    }
    // Push to audioPlaybackQueue in AUDIO_CHUNK_SAMPLES-sized stereo chunks.
    // audioPlaybackTask (Core 0) drains the queue with portMAX_DELAY writes.
    // Core 1 (this function, called from loop()) must NEVER be blocked with
    // loops or vTaskDelay - doing so starves the lwIP TCP socket and introduces
    // packet jitter that starves I2S DMA and causes playback stuttering.
    static PlaybackChunkMsg pbMsg;
    size_t offset = 0;
    while (offset < outSamples) {
      size_t chunk = outSamples - offset;
      if (chunk > AUDIO_CHUNK_SAMPLES) chunk = AUDIO_CHUNK_SAMPLES;
      memcpy(pbMsg.data, &stereoPlaybackBuf[offset * 2], chunk * 2 * sizeof(int16_t));
      pbMsg.len = chunk * 2 * sizeof(int16_t);
      // audioPlaybackQueue has 1024 slots (~32.8s audio buffer in PSRAM).
      // Push with a 15ms timeout: instantaneous when free space exists,
      // and gently paces without stalling Core 1.
      xQueueSend(audioPlaybackQueue, &pbMsg, pdMS_TO_TICKS(15));
      offset += chunk;
    }
    lastSpeechTimestamp = millis();
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
      static bool startupGreetingSent = false;
      if (!startupGreetingSent) {
        startupGreetingSent = true;
        currentState = STATE_STANDBY;
        lastTranscript = "Say 'Hey Ims' or tap screen";
        renderScreen(true);
        sendDebug(codecRegDump);
        // Clean silent standby: do NOT inject synthetic sendTextQuery on boot.
        // Device is in ready standby waiting for user touch or wake-word.
      } else {
        // Transparent reconnect from proxy - preserve current state if listening/thinking/speaking/verifying
        if (currentState != STATE_LISTENING && currentState != STATE_THINKING && currentState != STATE_SPEAKING && currentState != STATE_VERIFYING) {
          currentState = STATE_STANDBY;
          lastTranscript = "Say 'Hey Ims' or tap screen";
          renderScreen(true);
        }
      }
    }
    // Backend forwarded Gemini's noWakeDetected tool call: the audio that
    // triggered STATE_VERIFYING was judged NOT to contain a real wake
    // phrase. Revert silently - STATE_VERIFYING already looks identical to
    // STANDBY on screen, so nothing visibly changes for a false trigger.
    if (doc["noWakeDetected"].as<bool>()) {
      if (previewFlow != PREVIEW_IDLE) {
        Serial.println("[Preview] noWakeDetected received during preview - aborting preview");
        previewFlow = PREVIEW_IDLE;
        previewPendingText = "";
        if (onVoiceScreen) drawVoiceScreen();
        else if (onSettingsScreen && !onPrefsScreen) { tft.startWrite(); drawPlayButton(); tft.endWrite(); }
      }
      Serial.println("[IMS] noWakeDetected - false trigger, reverting to STANDBY silently");
      currentState = STATE_STANDBY;
      micStreamingActive = false;
      isSpeakingDetected = false;
      conversationOpen = false;
      conversationShouldClose = false;
      setSpeakerMute(true);
      lastTranscript = isMicHardwareMuted ? "MIC MUTED (Press top button)" : "Say 'Hey Ims' or tap screen";
      renderScreen(true);
    }
    // Backend forwarded Gemini's endConversation tool call (user said "bye"/
    // "goodbye"/etc.) - don't cut the farewell reply short. Just mark that
    // the conversation should close once STATE_SPEAKING naturally finishes
    // (see the auto-transition in loop()), same as any other reply.
    if (doc["endConversation"].as<bool>()) {
      Serial.println("[IMS] endConversation - closing conversation after this reply finishes");
      conversationShouldClose = true;
    }
    // Backend forwarded Gemini's setEmotion tool call - purely cosmetic, just
    // updates which expression computeFaceLevels() draws. Doesn't touch
    // currentState/conversation flow at all.
    if (doc["setEmotion"].is<const char *>()) {
      currentEmotion = emotionFromName(doc["setEmotion"].as<const char *>());
      emotionSetAtMs = millis();
      renderScreen(true); // updates the bottom-right emotion label immediately
      Serial.printf("[IMS] setEmotion(%s) -> %d\n", doc["setEmotion"].as<const char *>(), currentEmotion);
    }
    // Backend forwarded a fired timer/alarm/reminder (see remindersService.js's
    // poller in index.js) - purely a push notification over the raw TCP link,
    // not a Gemini turn, so it can arrive with no live conversation in
    // progress at all. Only actually alert from a genuinely idle STANDBY:
    // playAlertSound() blocks Core 1 and writes straight to the shared I2S TX
    // channel with portMAX_DELAY, which would collide with audioPlaybackTask
    // (Core 0) writing Gemini's own audio to that same channel if a reply
    // were in flight.
    if (doc["reminderFired"].is<JsonObject>()) {
      JsonObject rf = doc["reminderFired"];
      const char *kind = rf["type"] | "reminder";
      const char *label = rf["label"] | "";
      Serial.printf("[IMS] Reminder fired: %s \"%s\"\n", kind, label);
      if (currentState == STATE_STANDBY) {
        char msg[96];
        if (label[0] != '\0') {
          snprintf(msg, sizeof(msg), "%s: %s", kind, label);
        } else {
          snprintf(msg, sizeof(msg), "%s finished", kind);
        }
        lastTranscript = String(msg);
        renderScreen(true);
        playAlertSound(alertSoundIndex);
        // Have Gemini actually SPEAK what it was for, reusing the exact same
        // clientContent-text-turn mechanism the voice/personality preview
        // uses. This also means the announcement becomes a completely normal
        // open conversational turn afterward (conversationOpen gets set true
        // the moment real audio streams back, same as any wake-triggered
        // reply) - so the existing STOP PHRASES handling in the system
        // prompt already covers "IMS stop" here for free, with no new
        // dismiss-alert mechanism needed.
        char announceMsg[128];
        if (label[0] != '\0') {
          snprintf(announceMsg, sizeof(announceMsg),
                   "Your %s for \"%s\" just went off - announce this briefly, in character.", kind, label);
        } else {
          snprintf(announceMsg, sizeof(announceMsg),
                   "Your %s just went off - announce this briefly, in character.", kind);
        }
        sendTextQuery(announceMsg);
      }
    }
    // Backend pushed updated blood glucose reading from Nightscout
    if (doc["glucose"].is<JsonObject>()) {
      JsonObject g = doc["glucose"];
      if (g["value"].is<const char *>()) {
        currentGlucoseValue = g["value"].as<const char *>();
      }
      if (g["direction"].is<const char *>()) {
        currentGlucoseDirection = g["direction"].as<const char *>();
      }
      Serial.printf("[IMS] Blood glucose updated: %s mmol/L (%s)\n",
                    currentGlucoseValue.c_str(), currentGlucoseDirection.c_str());
      if (!onSettingsScreen) {
        drawGlucoseWidget();
      }
    }
    // Backend pushed schedule status (alarms, timers, reminders)
    if (doc["schedule"].is<JsonObject>()) {
      JsonObject s = doc["schedule"];
      hasActiveAlarm = s["hasAlarm"] | s["alarm"] | false;
      hasActiveTimer = s["hasTimer"] | s["timer"] | false;
      hasActiveReminder = s["hasReminder"] | s["reminder"] | false;
      Serial.printf("[IMS] Schedule updated: alarm=%d, timer=%d, reminder=%d\n",
                    hasActiveAlarm, hasActiveTimer, hasActiveReminder);
      if (!onSettingsScreen) {
        drawFooterClock();
      }
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
      modelTurnActive = false;
      micStreamingActive = false;
      // Note: State transition back to STATE_STANDBY is handled cleanly in loop()
      // once audioPlaybackQueue drains and the speaker finishes playing.
    }
    if (doc["serverContent"].is<JsonObject>()) {
      JsonObject serverContent = doc["serverContent"];
      if (serverContent["modelTurn"].is<JsonObject>()) {
        if (currentState != STATE_SPEAKING) {
          // Pre-warm was done in sendTurnComplete(); just unmute the DAC register.
          // No blocking delay - Core 1 must not stall here.
          unmuteDacOnly();
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
        modelTurnActive = false;
        micStreamingActive = false;
        // Note: State transition back to STATE_STANDBY is handled cleanly in loop()
        // once audioPlaybackQueue drains and the speaker finishes playing.
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
  // RX_SYNC: hunting for the two magic bytes that start every frame.
  // RX_HEADER: magic found, reading type + length.
  // RX_PAYLOAD: reading the payload itself.
  enum RxState { RX_SYNC, RX_HEADER, RX_PAYLOAD };
  static RxState rxState = RX_SYNC;
  static uint8_t syncMatched = 0; // magic bytes matched so far (0 or 1)
  static uint32_t resyncSkipped = 0; // bytes discarded hunting for the marker
  static uint8_t header[5]; // type(1) + length(4), magic already consumed
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

  // A new socket always starts at a frame boundary - drop any half-read frame
  // left over from the previous one (see incomingParserResetPending).
  if (incomingParserResetPending) {
    incomingParserResetPending = false;
    if (rxState != RX_SYNC || headerBytesRead != 0 || frameBytesRead != 0) {
      Serial.printf("[TCP] Parser reset mid-frame (state=%d hdr=%u payload=%u/%u) - discarding\n",
                    (int)rxState, (unsigned)headerBytesRead, (unsigned)frameBytesRead, (unsigned)frameLen);
    }
    rxState = RX_SYNC;
    syncMatched = 0;
    resyncSkipped = 0;
    headerBytesRead = 0;
    frameBytesRead = 0;
    frameLen = 0;
    frameType = 0;
  }

  while (tcpClient.available() > 0) {
    if (rxState == RX_SYNC) {
      uint8_t b;
      int n = tcpClient.read(&b, 1);
      if (n <= 0) return;
      if (syncMatched == 0) {
        if (b == FRAME_MAGIC0) {
          syncMatched = 1;
        } else {
          resyncSkipped++;
        }
      } else { // already have MAGIC0
        if (b == FRAME_MAGIC1) {
          syncMatched = 0;
          headerBytesRead = 0;
          rxState = RX_HEADER;
        } else if (b == FRAME_MAGIC0) {
          resyncSkipped++; // previous byte was a false start; this one may not be
        } else {
          resyncSkipped += 2;
          syncMatched = 0;
        }
      }
      continue;
    }

    if (rxState == RX_HEADER) {
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
        // The magic matched but the length is impossible, so those two bytes
        // were payload that happened to look like a marker. Go back to
        // hunting rather than dropping the connection - a bogus length is no
        // longer a fatal event.
        Serial.printf("[TCP] Implausible frame len %u after marker - resyncing\n",
                      (unsigned)frameLen);
        resyncSkipped += FRAME_HEADER_LEN;
        rxState = RX_SYNC;
        syncMatched = 0;
        headerBytesRead = 0;
        frameLen = 0;
        continue;
      }
      rxState = RX_PAYLOAD;
    }

    if (rxState == RX_PAYLOAD) {
      if (frameBytesRead < frameLen) {
        int n = tcpClient.read(frameBuf + frameBytesRead,
                                frameLen - frameBytesRead);
        if (n <= 0) return;
        frameBytesRead += n;
        if (frameBytesRead < frameLen) return; // wait for rest
      }

      // Report a completed recovery once we're genuinely back in step. The
      // skipped-byte count is the diagnostic that says how far out of step we
      // were, which points at whatever dropped or duplicated bytes upstream.
      if (resyncSkipped > 0) {
        Serial.printf("[TCP] Resynced after skipping %u bytes\n", (unsigned)resyncSkipped);
        char dbgMsg[64];
        snprintf(dbgMsg, sizeof(dbgMsg), "resync skipped=%u state=%d",
                 (unsigned)resyncSkipped, (int)currentState);
        sendDebug(dbgMsg);
        resyncSkipped = 0;
      }

      handleFrame(frameType, frameBuf, frameLen);
      rxState = RX_SYNC;
      syncMatched = 0;
      headerBytesRead = 0;
      frameBytesRead = 0;
    }
  }
}

// Energy-based silence detection while actively LISTENING (tuned for BOX-3
// dual mic array + ES7210 gain + 2x digital boost).
// Calibrated VAD thresholds: ES7210 noise floor with 2x gain is RMS 120-250;
// Ambient room noise / keyboard clicks / breathing is RMS 250-450;
// Deliberate human speech is RMS 1200-3500+.
#define VOICE_WAKE_THRESHOLD 650         // Wake phrase onset ("Hey Ims", "Eh up Ims")
#define VOICE_WAKE_CONSECUTIVE_FRAMES 2  // Must sustain >650 RMS for 2 consecutive chunks (~64ms)
#define VOICE_SPEECH_THRESHOLD 500       // Speech continuation detection during active LISTENING
#define VOICE_SILENCE_THRESHOLD 280      // Silence threshold for turn completion

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

      if (bytesRead > 0) {
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

        // Circular pre-roll buffer in PSRAM: maintain recent 512ms of audio
        // Reset while speaker is active or cooling down to avoid capturing speaker echo
        // Only maintain the ring while NOT already streaming: anything captured
        // during a live turn has been sent to Gemini already, so keeping it
        // here just gives the next wake flush duplicate audio to re-send.
        if (isSpeakerCoolingDown() || micStreamingActive) {
          prerollHead = 0;
          prerollFilled = false;
        } else if (prerollBuffer != nullptr) {
          size_t copyLen = monoSampleCount * sizeof(int16_t);
          if (copyLen > sizeof(prerollBuffer[prerollHead].data)) {
            copyLen = sizeof(prerollBuffer[prerollHead].data);
          }
          memcpy(prerollBuffer[prerollHead].data, micBuffer, copyLen);
          prerollBuffer[prerollHead].len = copyLen;
          prerollHead = (prerollHead + 1) % PREROLL_CHUNKS;
          if (prerollHead == 0) prerollFilled = true;
        }

        static unsigned long lastRmsLog = 0;
        if (millis() - lastRmsLog > 500) {
          lastRmsLog = millis();
          unsigned long elapsed = millis() - sessionStartMs;
          // state= added specifically to check for echo/barge-in during
          // playback: a nonzero RMS logged with state=STATE_SPEAKING (see
          // the TerminalState enum above for the current numeric value)
          // means the mic is picking up something significant while IMS is
          // talking, regardless of whether that audio actually got
          // forwarded to Gemini (the state/cooldown gates are checked
          // separately, further down) - useful signal on its own either way.
          Serial.printf("[Mic] RMS=%d sample0=%d n=%lu elapsed=%lums lastReadMs=%lu str=%d state=%d\n",
                        rms, micBuffer[0], bufCount, elapsed, readMs, (int)micStreamingActive, (int)currentState);
          DebugMsg dmsg;
          snprintf(dmsg.text, sizeof(dmsg.text),
                   "rms=%d n=%lu elapsed=%lums str=%d state=%d", rms, bufCount,
                   elapsed, (int)micStreamingActive, (int)currentState);
          xQueueSend(debugQueue, &dmsg, 0);
        }

        // Local energy gate only - NOT real wake-phrase recognition. Only
        // armed from STANDBY: THINKING/LISTENING/SPEAKING mean a
        // conversation is already open (or being confirmed), so a fresh
        // trigger here would be redundant or would race the verification
        // already in flight. Whatever crosses this threshold is a
        // *candidate* - Gemini is the one that actually judges whether it
        // was one of Ims's wake phrases, via the noWakeDetected contract in
        // beginVerifying()/handleFrame().
        // onSettingsScreen check: currentState stays STATE_STANDBY the whole
        // time the settings screen is open (see the touch handler in loop()),
        // so without this a wake candidate could fire and steal focus while
        // the user is mid-drag on a slider.
        bool canWakeDetect = (!isSpeakerCoolingDown()) && !isMicHardwareMuted &&
                             (currentState == STATE_STANDBY) && !onSettingsScreen;
        bool wakeTriggeredThisChunk = false;
        static int wakeStreak = 0;
        if (canWakeDetect) {
          if (rms > VOICE_WAKE_THRESHOLD) {
            wakeStreak++;
            if (wakeStreak >= VOICE_WAKE_CONSECUTIVE_FRAMES) {
              wakeStreak = 0;
              wakeTriggeredThisChunk = true;
              Serial.printf("[Audio] 🎙️ Energy gate crossed (state=%d, RMS=%d) -> sending candidate to Gemini for wake-phrase judgment\n",
                            (int)currentState, rms);
              micStreamingActive = true;
              isSpeakingDetected = true;
              speechStartTime = millis();
              lastSpeechTimestamp = millis();

              // Notify Core 1 to transition UI state and mute speaker
              ControlEvent evt = EVT_WAKE_CANDIDATE;
              xQueueSend(controlEventQueue, &evt, 0);

              // Flush circular pre-roll buffer so Gemini hears the start of the wake word
              if (prerollBuffer != nullptr) {
                int startIdx = prerollFilled ? prerollHead : 0;
                int count = prerollFilled ? PREROLL_CHUNKS : prerollHead;
                for (int i = 0; i < count; i++) {
                  int idx = (startIdx + i) % PREROLL_CHUNKS;
                  xQueueSend(audioOutQueue, &prerollBuffer[idx], 0);
                }
                // Emptying the ring here is essential, not tidiness. Without
                // it these same chunks stay queued up to be flushed AGAIN on
                // the next wake trigger - and since the ring also keeps
                // filling while we're streaming live, that second flush
                // re-sends audio Gemini has already received. It then hears
                // the wake phrase twice and answers twice, word for word.
                prerollHead = 0;
                prerollFilled = false;
              }

              // Also forward current chunk
              size_t copyLen = monoSampleCount * sizeof(int16_t);
              if (copyLen > sizeof(msg.data)) copyLen = sizeof(msg.data);
              memcpy(msg.data, micBuffer, copyLen);
              msg.len = copyLen;
              xQueueSend(audioOutQueue, &msg, 0);
            }
          } else {
            if (wakeStreak > 0) wakeStreak--;
          }
        }

        if (micStreamingActive && !isMicHardwareMuted && !wakeTriggeredThisChunk && currentState != STATE_SPEAKING && !isSpeakerCoolingDown()) {
          if (rms > VOICE_SPEECH_THRESHOLD) {
            lastSpeechTimestamp = millis();
            if (!isSpeakingDetected) {
              isSpeakingDetected = true;
              speechStartTime = millis();
              Serial.printf("[Audio] Speech detected (RMS=%d)\n", rms);
            }
          } else if (rms < VOICE_SILENCE_THRESHOLD) {
            // User went silent while in LISTENING
            if (isSpeakingDetected && (millis() - lastSpeechTimestamp > 900) &&
                (millis() - speechStartTime > 1200)) {
              Serial.printf("[Audio] Silence detected after speech turn (RMS=%d, speechMs=%lu) -> queuing turnComplete\n",
                            rms, millis() - speechStartTime);
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
      lastPlaybackActiveTime = millis();
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

  loadPersonalityFromNVS();

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
  pinMode(MUTE_BTN_PIN, INPUT_PULLUP);
  isMicHardwareMuted = (digitalRead(MUTE_BTN_PIN) == LOW);

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

  // Synchronise active personality and voice choice directly from backend
  fetchPersonalityFromBackend();

  // NTP + Europe/London POSIX TZ rule - not just a fixed UTC+0/+1 offset, so
  // the on-screen clock (see currentDateTimeStr()) tracks the real BST/GMT
  // changeover automatically, the same way the backend's Intl-based
  // Europe/London handling does for reminders/alarms/timers.
  configTzTime("GMT0BST,M3.5.0/1,M10.5.0/2", "pool.ntp.org", "time.nist.gov");

  // DIAGNOSTIC: dump raw UTC epoch alongside the TZ-adjusted local time as
  // soon as SNTP sync completes, so a wrong on-screen clock can be told
  // apart from "SNTP never synced" vs. "synced fine but DST/TZ rule wasn't
  // applied" by reading the serial log, instead of guessing from the UI.
  {
    Serial.printf("[Time] TZ env var: %s\n", getenv("TZ") ? getenv("TZ") : "(null)");
    struct tm diagTm;
    bool synced = false;
    for (int i = 0; i < 20; i++) {
      if (getLocalTime(&diagTm, 500)) { synced = true; break; }
      Serial.println("[Time] waiting for SNTP sync...");
    }
    if (synced) {
      time_t rawEpoch = time(nullptr);
      struct tm utcTm;
      gmtime_r(&rawEpoch, &utcTm);
      char localBuf[32], utcBuf[32];
      strftime(localBuf, sizeof(localBuf), "%Y-%m-%d %H:%M:%S", &diagTm);
      strftime(utcBuf, sizeof(utcBuf), "%Y-%m-%d %H:%M:%S", &utcTm);
      Serial.printf("[Time] raw epoch=%ld UTC=%s local(TZ-adjusted)=%s isdst=%d\n",
                    (long)rawEpoch, utcBuf, localBuf, diagTm.tm_isdst);
    } else {
      Serial.println("[Time] SNTP sync FAILED after 10s - clock will show placeholder.");
    }
  }

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
  // Allocate circular pre-roll buffer in PSRAM for wake-word attack preservation
  prerollBuffer = (AudioChunkMsg *)ps_malloc(PREROLL_CHUNKS * sizeof(AudioChunkMsg));
  if (prerollBuffer != nullptr) {
    Serial.printf("[Audio] prerollBuffer allocated in PSRAM (%d chunks, %u KB)\n",
                  PREROLL_CHUNKS, (unsigned int)(PREROLL_CHUNKS * sizeof(AudioChunkMsg) / 1024));
  } else {
    Serial.println("[Audio] WARNING: ps_malloc failed for pre-roll buffer!");
  }

  // 32-chunk PSRAM queue for audioOutQueue to handle pre-roll flush bursts without drops
  audioOutQueueStorage = (uint8_t *)ps_malloc(AUDIO_OUT_QUEUE_DEPTH * sizeof(AudioChunkMsg));
  if (audioOutQueueStorage != nullptr) {
    audioOutQueue = xQueueCreateStatic(AUDIO_OUT_QUEUE_DEPTH, sizeof(AudioChunkMsg),
                                       audioOutQueueStorage, &audioOutStaticQueue);
    Serial.printf("[Audio] audioOutQueue created in PSRAM (%d chunks, %u KB)\n",
                  AUDIO_OUT_QUEUE_DEPTH, (unsigned int)(AUDIO_OUT_QUEUE_DEPTH * sizeof(AudioChunkMsg) / 1024));
  } else {
    audioOutQueue = xQueueCreate(16, sizeof(AudioChunkMsg));
  }
  controlEventQueue = xQueueCreate(4, sizeof(ControlEvent));
  debugQueue = xQueueCreate(8, sizeof(DebugMsg));

  playbackQueueStorage = (uint8_t *)ps_malloc(PLAYBACK_QUEUE_DEPTH * sizeof(PlaybackChunkMsg));
  if (playbackQueueStorage != nullptr) {
    audioPlaybackQueue = xQueueCreateStatic(PLAYBACK_QUEUE_DEPTH, sizeof(PlaybackChunkMsg),
                                            playbackQueueStorage, &playbackStaticQueue);
    Serial.printf("[Audio] audioPlaybackQueue created in PSRAM (%d chunks, %u KB buffer)\n",
                  PLAYBACK_QUEUE_DEPTH, (unsigned int)(PLAYBACK_QUEUE_DEPTH * sizeof(PlaybackChunkMsg) / 1024));
  } else {
    Serial.println("[Audio] WARNING: ps_malloc failed for playback queue! Falling back to SRAM (16 slots)");
    audioPlaybackQueue = xQueueCreate(16, sizeof(PlaybackChunkMsg));
  }

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
    incomingParserResetPending = true; // see its declaration - stale framing state desyncs the next socket
    // audioPlaybackTask (Core 0) keeps draining audioPlaybackQueue on its own
    // schedule regardless of TCP state - if the connection died with
    // unplayed audio still queued (Gemini streams ahead of real-time
    // playback), that backlog would otherwise keep playing out the speaker
    // after the connection is already dead, and then whatever conversation
    // comes next after reconnecting inherits it as a jarring, out-of-context
    // snippet. Stop and clear it here, not just at the next
    // beginListening()/beginVerifying(), which only flushes what's left in
    // the queue at THAT moment - too late for anything already mid-flight.
    setSpeakerMute(true);
    if (audioPlaybackQueue) {
      xQueueReset(audioPlaybackQueue);
    }
    conversationOpen = false;
    conversationShouldClose = false;
    // If this drop happened mid-preview (voice arrow / Play button), don't
    // leave previewFlow waiting on a connection that's now gone. Whatever
    // reconnects next (the automatic retry below, or a fresh tap) is NOT the
    // connection this preview asked for - if previewFlow were left in
    // PREVIEW_AWAIT_SETUP/PREVIEW_SPEAKING, the now-stale previewPendingText
    // could end up spoken once some unrelated later connection happens to
    // complete setup, well after the user has moved on - exactly the "snippet
    // of another conversation" symptom. Aborting immediately here,
    // unconditionally and regardless of which preview sub-state it was in,
    // means a crash mid-preview always shows as "button re-enabled, try
    // again" instead.
    if (previewFlow != PREVIEW_IDLE) {
      Serial.println("[Preview] Connection dropped mid-preview - aborting");
      previewFlow = PREVIEW_IDLE;
      previewPendingText = "";
      if (onVoiceScreen) drawVoiceScreen();
      else if (onSettingsScreen && !onPrefsScreen) { tft.startWrite(); drawPlayButton(); tft.endWrite(); }
    }
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
    } else if (evt == EVT_WAKE_CANDIDATE) {
      if (currentState == STATE_STANDBY) {
        beginVerifying();
      }
    }
  }
  DebugMsg dmsg;
  while (xQueueReceive(debugQueue, &dmsg, 0) == pdTRUE) {
    sendDebug(dmsg.text);
  }

  // Heartbeat so we can tell "connected but idle" apart from "not receiving
  // telemetry at all" in the backend log. Now also carries free heap
  // (current + all-time minimum) and WiFi RSSI - added specifically to
  // investigate a device-side TCP RST seen during active playback
  // (ECONNRESET on the backend's read from this socket, ~100s into a
  // session). A trending-down minFreeHeap would point at a leak/
  // fragmentation issue causing an eventual crash/reset under the combined
  // I2S + WiFi + display load; a collapsing RSSI would point at signal/RF
  // instead. No existing telemetry covered either before now.
  static unsigned long lastHeartbeat = 0;
  if (millis() - lastHeartbeat > 5000) {
    lastHeartbeat = millis();
    char hb[160];
    // ESP.getFreeHeap()/getMinFreeHeap() report the DEFAULT heap, which on
    // this board is mostly PSRAM (ps_malloc() is used explicitly elsewhere
    // for the big audio buffers specifically BECAUSE the default pool draws
    // from PSRAM first) - a healthy-looking total could still be masking a
    // slow leak/fragmentation in INTERNAL RAM specifically, which is the
    // only pool WiFi/lwIP's own buffers can actually use. intHeap/intMin
    // isolate that internal-only pool so a leak there is visible even while
    // the combined total still looks fine.
    char hb2[64];
    snprintf(hb2, sizeof(hb2), " intHeap=%u intMin=%u",
             (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL),
             (unsigned)heap_caps_get_minimum_free_size(MALLOC_CAP_INTERNAL));
    snprintf(hb, sizeof(hb), "heartbeat state=%d heap=%u minHeap=%u rssi=%d%s",
             (int)currentState, (unsigned)ESP.getFreeHeap(), (unsigned)ESP.getMinFreeHeap(),
             (int)WiFi.RSSI(), hb2);
    sendDebug(hb);
  }

  renderScreen();

  // Physical Top Mute Button (MUTE_BTN_PIN = GPIO 1, Active LOW when button is lit/pressed)
  static bool lastMuteButtonActive = false;
  bool muteButtonActive = (digitalRead(MUTE_BTN_PIN) == LOW);
  if (muteButtonActive != lastMuteButtonActive) {
    lastMuteButtonActive = muteButtonActive;
    isMicHardwareMuted = muteButtonActive;
    if (isMicHardwareMuted) {
      Serial.println("[Button] Physical mic MUTE switch engaged (button illuminated)");
      if (currentState == STATE_LISTENING || currentState == STATE_VERIFYING) {
        sendAudioStreamEnd(); // was mid-stream - close it out cleanly on Gemini's side
      }
      micStreamingActive = false;
      isSpeakingDetected = false;
      conversationOpen = false;
      conversationShouldClose = false;
      sendSessionClosed();
      if (currentState == STATE_LISTENING || currentState == STATE_THINKING || currentState == STATE_VERIFYING) {
        currentState = STATE_STANDBY;
      }
      if (audioOutQueue) {
        xQueueReset(audioOutQueue);
      }
      lastTranscript = "MIC MUTED (Press top button)";
      renderScreen(true);
    } else {
      Serial.println("[Button] Physical mic MUTE switch released (unmuted)");
      lastTranscript = "Say 'Hey Ims' or tap screen";
      renderScreen(true);
    }
    delay(50); // debounce
  }

  // Auto-transition from SPEAKING once the audio queue is fully drained and
  // speaker playback has completely finished. If the conversation is still
  // open (a real wake phrase or a touch started it, and endConversation
  // hasn't fired) this goes straight back to LISTENING for the next turn
  // instead of STANDBY, so the user isn't required to repeat a wake phrase
  // for every follow-up sentence - only ending with "bye"/"goodbye"/etc.
  // (which sets conversationShouldClose via the endConversation tool call in
  // handleFrame()) actually closes it.
  if (currentState == STATE_SPEAKING && !isSpeakerActive()) {
    // Diagnostic for the playback-cutoff investigation: this is the ONLY
    // place SPEAKING ends and (when a conversation is open) actively
    // re-mutes the speaker via setSpeakerMute(true) below - if that mute is
    // firing PREMATURELY (Gemini was still mid-response, just paused longer
    // than isSpeakerActive()'s 1200ms/1500ms grace windows), this is where
    // it would show up. queueDepth=0 and modelTurnActive=0 here don't by
    // themselves prove the response was actually finished - only that this
    // firmware believed it was.
    {
      int queueDepth = audioPlaybackQueue ? uxQueueMessagesWaiting(audioPlaybackQueue) : -1;
      char dbg[80];
      snprintf(dbg, sizeof(dbg), "speaking_autotransition modelTurnActive=%d queueDepth=%d sinceLastPlayMs=%lu convOpen=%d",
               (int)modelTurnActive, queueDepth, millis() - lastPlaybackActiveTime, (int)conversationOpen);
      Serial.println(dbg);
      sendDebug(dbg);
    }
    if (conversationOpen && !conversationShouldClose) {
      currentState = STATE_LISTENING;
      micStreamingActive = true;
      isSpeakingDetected = false;
      speechStartTime = 0;
      lastSpeechTimestamp = millis();
      setSpeakerMute(true);
      lastTranscript = "Listening...";
    } else {
      currentState = STATE_STANDBY;
      conversationOpen = false;
      conversationShouldClose = false;
      setSpeakerMute(true);
      sendSessionClosed();
      lastTranscript = isMicHardwareMuted ? "MIC MUTED (Press top button)" : "Say 'Hey Ims' or tap screen";
    }
    renderScreen(true);
  }

  // Auto-return to STANDBY after idle conversation - covers LISTENING (user
  // never spoke) and THINKING (Gemini never responded at all, e.g. its VAD
  // never fired) so the mic doesn't stream indefinitely in either case.
  if ((currentState == STATE_LISTENING || currentState == STATE_THINKING) &&
      (millis() - lastSpeechTimestamp > SESSION_IDLE_TIMEOUT_MS)) {
    sendDebug("session_idle_timeout");
    if (currentState == STATE_LISTENING) sendAudioStreamEnd(); // was mid-stream
    sendSessionClosed();
    currentState = STATE_STANDBY;
    micStreamingActive = false;
    conversationOpen = false;
    conversationShouldClose = false;
    setSpeakerMute(true);
    lastTranscript = isMicHardwareMuted ? "MIC MUTED (Press top button)" : "Say 'Hey Ims' or tap screen";
    renderScreen(true);
  }

  // Safety net for STATE_VERIFYING: if Gemini never confirms (real audio) or
  // rejects (noWakeDetected) the candidate - e.g. a dropped frame - don't
  // leave the mic streaming and the device silently stuck forever. 8000ms
  // allows Gemini sufficient processing latency to judge the candidate and return
  // audio without prematurely dropping back to STANDBY.
  if (currentState == STATE_VERIFYING && (millis() - lastSpeechTimestamp > 8000)) {
    sendDebug("verify_timeout");
    sendAudioStreamEnd(); // this is exactly the case that was never being closed
    sendSessionClosed();
    currentState = STATE_STANDBY;
    micStreamingActive = false;
    isSpeakingDetected = false;
    conversationOpen = false;
    setSpeakerMute(true);
    renderScreen(true);
  }

  // Emotion decay: an expression set by setEmotion() shouldn't sit on IMS's
  // face indefinitely once the conversation has gone quiet. Only checked
  // while not actively speaking, so it can never interrupt/flatten the
  // expression mid-reply - only the resting face fades back to neutral.
  if (currentEmotion != EMOTION_NEUTRAL && !isSpeakerActive() &&
      (millis() - emotionSetAtMs > EMOTION_DECAY_MS)) {
    currentEmotion = EMOTION_NEUTRAL;
    renderScreen(true);
  }

  // Animate the face on a fixed cadence regardless of state - renderScreen()
  // only repaints on a state change, so this is what actually drives the
  // idle breathing/blink, the listening/thinking motion, and the mouth
  // opening and closing while speaking (including the boot chime, once
  // isSpeakerActive() reports it - see playChime()).
  // Animate the face on a smooth 30ms cadence (~33 FPS) - repaints changed dots via
  // delta-rendering so the background dots breathe smoothly with high step fidelity.
  {
    static unsigned long lastFaceRedraw = 0;
    if (millis() - lastFaceRedraw >= 30) {
      lastFaceRedraw = millis();
      drawFaceTick();
    }
  }

  // The footer clock shows seconds, so it needs a genuine once-a-second
  // tick - renderScreen() otherwise only redraws on a state/mute/emotion
  // change, so without this a static STANDBY screen would show whatever
  // time it was when it last had a real reason to redraw. Uses the
  // lightweight drawFooterClock() (see its own comment), not a full
  // renderScreen(true), specifically to avoid flashing the whole screen
  // once a second.
  {
    static int lastRenderedSecond = -1;
    struct tm ti;
    if (!onSettingsScreen && getLocalTime(&ti, 0) && ti.tm_sec != lastRenderedSecond) {
      lastRenderedSecond = ti.tm_sec;
      drawFooterClock();
    }
  }

  // Settings screen save debounce - checked every loop iteration regardless
  // of touch, so a save actually fires ~600ms after the LAST slider drag
  // rather than needing another touch event to trigger it.
  if (settingsDirty && (millis() - settingsLastChangeMs > SETTINGS_SAVE_DEBOUNCE_MS)) {
    flushSettingsSave();
  }

  // Voice screen preview debounce - allows user to rapidly shuffle through voices
  // without thrashing TCP reconnects. Triggers startPreview() 350ms after the last arrow tap.
  if (voicePreviewPending && (millis() >= voicePreviewTriggerMs)) {
    voicePreviewPending = false;
    String voiceName = PERSONALITY_VOICES[previewVoiceIndex];
    activePreviewVoice = voiceName;
    startPreview("Hey IMS! Say exactly, with nothing else before or after it: \"Hi, I'm " + voiceName + ".\"");
  }


  // Voice/personality preview flow - see startPreview() near
  // connectToBackend() and the PreviewFlowState comment above onVoiceScreen.
  if (previewFlow == PREVIEW_RECONNECT) {
    connectToBackend();
    previewFlow = PREVIEW_AWAIT_SETUP;
    previewFlowStartMs = millis();
  } else if (previewFlow == PREVIEW_AWAIT_SETUP) {
    if (geminiSetupComplete) {
      sendTextQuery(previewPendingText.c_str());
      previewFlow = PREVIEW_SPEAKING;
      previewFlowStartMs = millis();
    } else if (millis() - previewFlowStartMs > 8000) {
      Serial.println("[Preview] Gave up waiting for Gemini setup - aborting preview");
      previewFlow = PREVIEW_IDLE;
      activePreviewVoice = "";
      if (onVoiceScreen) drawVoiceScreen();
      else if (onSettingsScreen && !onPrefsScreen) { tft.startWrite(); drawPlayButton(); tft.endWrite(); }
    }
  } else if (previewFlow == PREVIEW_SPEAKING) {
    bool stillActive = (currentState == STATE_THINKING || currentState == STATE_SPEAKING || isSpeakerActive());
    if (!stillActive || (millis() - previewFlowStartMs > 20000)) {
      previewFlow = PREVIEW_IDLE;
      activePreviewVoice = "";
      if (onVoiceScreen) drawVoiceScreen();
      else if (onSettingsScreen && !onPrefsScreen) { tft.startWrite(); drawPlayButton(); tft.endWrite(); }
    }
  }

  // Touch feedback
  uint16_t touchX, touchY;
  if (tft.getTouch(&touchX, &touchY)) {
    if (onPrefsScreen) {
      if (touchX >= VOICE_BACK_ZONE_X0 && touchX <= VOICE_BACK_ZONE_X1 && touchY >= VOICE_BACK_ZONE_Y0 && touchY <= VOICE_BACK_ZONE_Y1) {
        // "< VOICE": back one level to the voice picker.
        onPrefsScreen = false;
        onVoiceScreen = true;
        drawVoiceScreen();
        delay(200);
      } else if (touchX >= PREFS_TOGGLE_X0 - 5 && touchX <= PREFS_TOGGLE_X1 + 10 &&
                 touchY >= PREFS_TOGGLE_Y0 - 5 && touchY <= PREFS_TOGGLE_Y1 + 5) {
        // Left-aligned Capture Logging toggle under heading
        captureLoggingEnabled = !captureLoggingEnabled;
        settingsDirty = true;
        settingsLastChangeMs = millis();
        drawPreferencesScreen();
        delay(200);
      } else if (touchY >= PREFS_ROW2_TOUCH_Y0 && touchY <= PREFS_ROW2_TOUCH_Y1) {
        if (touchX < 160) {
          // Left side: Alert Sound
          int delta = 0;
          if (touchX >= 10 && touchX <= 55) delta = -1;
          else if (touchX >= 105 && touchX <= 155) delta = 1;
          if (delta != 0) {
            alertSoundIndex = (alertSoundIndex + delta + ALERT_SOUND_COUNT) % ALERT_SOUND_COUNT;
            settingsDirty = true;
            settingsLastChangeMs = millis();
            drawPreferencesScreen();
            playAlertSound(alertSoundIndex);
            delay(150);
          } else if (touchX > 55 && touchX < 105) {
            playAlertSound(alertSoundIndex);
            delay(150);
          }
        } else {
          // Right side: Volume
          int delta = 0;
          if (touchX >= 165 && touchX <= 210) delta = -1;
          else if (touchX >= 270 && touchX <= 315) delta = 1;
          if (delta != 0) {
            int newIdx = currentVolumeIndex + delta;
            if (newIdx < 0) newIdx = 0;
            if (newIdx >= VOLUME_LEVEL_COUNT) newIdx = VOLUME_LEVEL_COUNT - 1;
            if (newIdx != currentVolumeIndex) {
              currentVolumeIndex = newIdx;
              applySpeakerVolume();
              settingsDirty = true;
              settingsLastChangeMs = millis();
              drawPreferencesScreen();
              // Play a brief clean test chirp at the new volume level so the user hears it immediately
              setSpeakerMute(false);
              playTone(660.0f, 120);
              delay(20);
              setSpeakerMute(true);
              delay(120);
            }
          } else if (touchX > 210 && touchX < 270) {
            // Center tap tests current volume
            setSpeakerMute(false);
            playTone(660.0f, 150);
            delay(20);
            setSpeakerMute(true);
            delay(120);
          }
        }
      }
    } else if (onVoiceScreen) {
      if (touchX >= VOICE_BACK_ZONE_X0 && touchX <= VOICE_BACK_ZONE_X1 && touchY >= VOICE_BACK_ZONE_Y0 && touchY <= VOICE_BACK_ZONE_Y1) {
        // "< PERSONALITY": back up one level without saving uncommitted preview voice
        voicePreviewPending = false;
        activePreviewVoice = "";
        previewVoiceIndex = personalityVoiceIndex;
        flushSettingsSave();
        onVoiceScreen = false;
        drawSettingsScreen();
      } else if (touchX >= VOICE_NEXT_ZONE_X0 && touchX <= VOICE_NEXT_ZONE_X1 &&
                 touchY >= VOICE_BACK_ZONE_Y0 && touchY <= VOICE_BACK_ZONE_Y1) {
        // "PREFERENCES >": forward one level without saving uncommitted preview voice
        voicePreviewPending = false;
        activePreviewVoice = "";
        previewVoiceIndex = personalityVoiceIndex;
        flushSettingsSave();
        onVoiceScreen = false;
        onPrefsScreen = true;
        drawPreferencesScreen();
        delay(200);
      } else if (touchY >= VOICE_ARROW_Y0 && touchY <= VOICE_ARROW_Y1) {
        // Check if tapping center area to commit active default voice
        if (touchX > VOICE_LEFT_ARROW_X1 && touchX < VOICE_RIGHT_ARROW_X0) {
          if (previewVoiceIndex != personalityVoiceIndex) {
            personalityVoiceIndex = previewVoiceIndex;
            savePersonalityToNVS();
            postPersonalityToBackend();
            drawVoiceScreen();
            delay(150);
          }
        } else {
          // Left/right arrows cycle auditioning voice only (does NOT alter default voice)
          int delta = 0;
          if (touchX >= VOICE_LEFT_ARROW_X0 && touchX <= VOICE_LEFT_ARROW_X1) delta = -1;
          else if (touchX >= VOICE_RIGHT_ARROW_X0 && touchX <= VOICE_RIGHT_ARROW_X1) delta = 1;
          if (delta != 0) {
            // Immediately terminate any active audio playback & queue
            setSpeakerMute(true);
            digitalWrite(PA_ENABLE_PIN, LOW);
            if (audioPlaybackQueue) {
              xQueueReset(audioPlaybackQueue);
            }
            if (audioOutQueue) {
              xQueueReset(audioOutQueue);
            }
            modelTurnActive = false;
            if (previewFlow != PREVIEW_IDLE) {
              previewFlow = PREVIEW_IDLE;
              previewPendingText = "";
            }

            previewVoiceIndex =
                (previewVoiceIndex + delta + PERSONALITY_VOICE_COUNT) % PERSONALITY_VOICE_COUNT;
            drawVoiceScreen();

            // Settle debounce: schedules startPreview() for 350ms after the last tap,
            // instantly auditioning the voice without changing or persisting the default voice.
            voicePreviewPending = true;
            voicePreviewTriggerMs = millis() + VOICE_PREVIEW_DEBOUNCE_MS;
            delay(120);
          }
        }
      }
    } else if (onSettingsScreen) {
      if (touchX >= HEADER_ICON_X0 && touchX <= HEADER_ICON_X1 && touchY >= HEADER_ICON_Y0 && touchY <= HEADER_ICON_Y1) {
        // Gear icon: back to the main screen. Any pending debounced save
        // above already ran before this touch is even processed next loop,
        // but flush one now too so leaving mid-drag never loses a change.
        flushSettingsSave();
        onSettingsScreen = false;
        settingsDraggingAxis = -1;
        renderScreen(true);
      } else if (touchX >= HEADER_RIGHT_ZONE_X0 && touchX <= HEADER_RIGHT_ZONE_X1 &&
                 touchY >= HEADER_RIGHT_ZONE_Y0 && touchY <= HEADER_RIGHT_ZONE_Y1) {
        // "VOICE >": open the voice picker sub-screen. Flush any pending
        // change first, same reasoning as the back arrow.
        flushSettingsSave();
        onVoiceScreen = true;
        drawVoiceScreen();
        delay(200);
      } else if (touchX >= PLAY_BUTTON_X0 && touchX <= PLAY_BUTTON_X1 && touchY >= PLAY_BUTTON_Y0 && touchY <= PLAY_BUTTON_Y1) {
        // Play button: speak a fresh sentence showcasing the CURRENT slider
        // settings. Ignored (no-op) while a preview is already in flight -
        // the button is greyed out during that window.
        if (previewFlow == PREVIEW_IDLE) {
          startPreview("In one short, vivid sentence, say something that really shows off exactly how you talk and think right now - make it distinctly characterful, not generic.");
        }
      } else {
        int row = settingsRowForY(touchY);
        if (row >= 0 && row < PERSONALITY_AXIS_COUNT) {
          int clamped = touchX < SETTINGS_TRACK_X0 ? 0 : (touchX > SETTINGS_TRACK_X1 ? 100 :
                        (int)(((touchX - SETTINGS_TRACK_X0) / (float)(SETTINGS_TRACK_X1 - SETTINGS_TRACK_X0)) * 100));
          personalityValues[row] = clamped;
          settingsDraggingAxis = row;
          settingsDirty = true;
          settingsLastChangeMs = millis();
          tft.startWrite();
          drawSettingsRow(row);
          tft.endWrite();
        }
      }
    } else if (touchX >= HEADER_ICON_X0 && touchX <= HEADER_ICON_X1 && touchY >= HEADER_ICON_Y0 && touchY <= HEADER_ICON_Y1 &&
               currentState == STATE_STANDBY && !isMicHardwareMuted) {
      // Gear icon: only from a genuinely idle STANDBY, so opening settings
      // never interrupts an actual conversation.
      onSettingsScreen = true;
      drawSettingsScreen();
      delay(200);
    } else if (isMicHardwareMuted) {
      Serial.println("[Touch] Tap while mic is hardware muted");
      lastTranscript = "Mic is muted (top button lit)";
      renderScreen(true);
    } else if (currentState == STATE_SPEAKING) {
      // User interrupted Gemini: switch to listening
      beginListening("touch_interrupt");
    } else if (currentState == STATE_STANDBY || currentState == STATE_VERIFYING) {
      // Touch-to-talk: a deliberate tap confirms intent immediately, whether
      // or not Gemini would have judged an in-flight VERIFYING candidate as
      // a real wake phrase - no need to wait on it.
      beginListening("touch");
    } else if (currentState == STATE_LISTENING) {
      // Tap screen while listening: finish turn and trigger Gemini response immediately
      sendTurnComplete();
    } else if (currentState == STATE_THINKING) {
      // Tap screen while thinking: cancel thinking state and reset to ready standby
      Serial.println("[Touch] Tapped during THINKING -> resetting to STANDBY");
      currentState = STATE_STANDBY;
      micStreamingActive = false;
      conversationOpen = false;
      conversationShouldClose = false;
      sendSessionClosed();
      lastTranscript = "Say 'Hey Ims' or tap screen";
      renderScreen(true);
    }
    if (!onSettingsScreen || settingsDraggingAxis < 0) delay(200);
    settingsDraggingAxis = -1; // one touch sample = one drag step, not a held state
  }
}
