#pragma once

// ============================================================================
// Information Management System (IMS) - ESP32-S3-BOX-3 Hardware Configuration
// ============================================================================

// 1. Wi-Fi Configuration
#define WIFI_SSID "XXX"
#define WIFI_PASSWORD "XXX"

// 2. IMS Backend Configuration (Automatic Primary Local LAN with Public Ngrok
// Fallback) Primary: Local LAN for sub-millisecond network latency inside your
// house
#define IMS_PRIMARY_HOST "192.168.1.78"
#define IMS_PRIMARY_PORT 3001
#define IMS_PRIMARY_PATH "/api/hardware-live"
#define IMS_PRIMARY_SSL false

// Fallback: Public Ngrok URL (routes through Vite proxy port 6001 over wss://)
#define IMS_FALLBACK_HOST "simon-ims.ngrok-free.app"
#define IMS_FALLBACK_PORT 443
#define IMS_FALLBACK_PATH "/api/hardware-live"
#define IMS_FALLBACK_SSL true

// Max connection retry attempts on primary before switching to fallback
#define MAX_PRIMARY_RETRIES 3

// 3. Audio Codec Hardware Pinout (ESP32-S3-BOX-3)
// ES7210 (Dual Microphone ADC) & ES8311 (Speaker DAC)
#define I2S_MCLK_PIN GPIO_NUM_2
#define I2S_BCLK_PIN GPIO_NUM_17
// WS/LRCLK is GPIO45, NOT GPIO47 - confirmed against a working ESPHome
// config for this exact board (AlmostInteractive/ESP32-S3-Box-3-Voice-
// Assistant-Sensor-Dock, i2s_lrclk_pin: GPIO45). GPIO47 is actually the LCD
// backlight pin (see LGFX_BOX3 in main.cpp) - these two were swapped in the
// original pinout, meaning I2S was fighting the display for GPIO47 and the
// codec never received a valid frame-sync signal, which is why the mic read
// a constant 0 regardless of any codec register configuration.
#define I2S_WS_PIN GPIO_NUM_45
#define I2S_DOUT_PIN GPIO_NUM_15 // To ES8311 DAC
#define I2S_DIN_PIN GPIO_NUM_16  // From ES7210 ADC

#define I2C_SDA_PIN GPIO_NUM_8
#define I2C_SCL_PIN GPIO_NUM_18
#define PA_ENABLE_PIN GPIO_NUM_46 // Audio Power Amp enable

// 4. LCD & Touch Hardware Pinout (ESP32-S3-BOX-3: 320x240 ILI9342C +
// GT911/TT21100)
// NOTE: these values are informational only - main.cpp's LGFX_BOX3 class
// hardcodes its own pin numbers directly (taken from LovyanGFX's own
// validated board_ESP32_S3_BOX_V3 autodetect profile) rather than reading
// these macros. Kept in sync here for reference; previously LCD_RST_PIN and
// LCD_BL_PIN were wrong (there is no LCD reset line, and backlight is on
// GPIO47 not GPIO45), which caused a permanent white/blank screen.
#define LCD_MOSI_PIN GPIO_NUM_6
#define LCD_MISO_PIN -1 // Not wired on this board
#define LCD_SCLK_PIN GPIO_NUM_7
#define LCD_DC_PIN GPIO_NUM_4
#define LCD_CS_PIN GPIO_NUM_5
#define LCD_RST_PIN -1 // No dedicated reset line - GPIO48 is left floating
                        // (input_pullup), NOT driven as reset
#define LCD_BL_PIN GPIO_NUM_47
#define TP_INT_PIN GPIO_NUM_3
#define MUTE_BTN_PIN GPIO_NUM_1

// 5. Audio Specs
#define MIC_SAMPLE_RATE 16000
#define SPEAKER_SAMPLE_RATE 24000
#define AUDIO_CHUNK_SAMPLES 512
