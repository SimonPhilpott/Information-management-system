# Test Plan & Verification Matrix

## Executive Summary
- Total Registered Features: 13
- Verified Features: 13
- Pending Features: 0

## Section 1: Feature Matrix
| Feature ID | Feature Name | Primary File Link | Concrete Verification Method | Target Status |
|---|---|---|---|---|
| FEAT-001 | 3D Spatial Knowledge Graph | [SpatialCanvas.jsx](file:///d:/Information%20management%20system/src/components/KnowledgeMesh/SpatialCanvas.jsx) | R3F 3D spatial canvas rendering | PASS |
| FEAT-002 | Oatmeal Premium Theme Layout | [Layout.jsx](file:///d:/Information%20management%20system/src/components/Dashboard/Layout.jsx) | Theme wrapper & resize validation | PASS |
| FEAT-003 | Topic Discovery & Session Panel | [ChatHistory.jsx](file:///d:/Information%20management%20system/src/components/Dashboard/ChatHistory.jsx) | Session persistence & chat log deletion | PASS |
| FEAT-004 | Hierarchical SVG Sunburst Visualisation | [SunburstCanvas.jsx](file:///d:/Information%20management%20system/src/components/KnowledgeMesh/SunburstCanvas.jsx) | SVG concentric radial sector drilldown | PASS |
| FEAT-005 | PDF Research Workspace | [PDFWorkspace.jsx](file:///d:/Information%20management%20system/src/components/Dashboard/PDFWorkspace.jsx) | Split-screen PDF viewer rendering | PASS |
| FEAT-006 | SharePointPortalView | [AdminPanel.jsx](file:///d:/Information%20management%20system/src/components/Admin/AdminPanel.jsx) | Hierarchical breadcrumbs & concept inheritance | PASS |
| FEAT-007 | Simplified Demo Portal | [DemoPortal.jsx](file:///d:/Information%20management%20system/src/components/Dashboard/DemoPortal.jsx) | /demo route stats and visual embeds | PASS |
| FEAT-008 | Port Status Service | [SyncStatus.jsx](file:///d:/Information%20management%20system/src/components/Dashboard/SyncStatus.jsx) | /api/port-status probe verification | PASS |
| FEAT-009 | HNSW Vector Index Acceleration | [HnswIndexModal.jsx](file:///d:/Information%20management%20system/src/components/Dashboard/HnswIndexModal.jsx) | SSE streaming & hnswlib nearest neighbour | PASS |
| FEAT-010 | Gemini Voice Lock & Session Persistence | [useGeminiLive.js](file:///d:/Information%20management%20system/src/hooks/useGeminiLive.js) | LocalStorage voice lock & keep-alive tools | PASS |
| FEAT-011 | Rulebook Search & Downloader Scraper | [RulebookScraper.jsx](file:///d:/Information%20management%20system/src/components/Admin/RulebookScraper.jsx) | SSE streaming & Python grounding scraper | PASS |
| FEAT-012 | ESP32-S3-BOX-3 Hardware Voice Terminal | [server/index.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/index.js) | ESP32 WebSocket audio streaming to /api/hardware-live | PASS |
| FEAT-013 | ESP32-S3-BOX-3B Clean Microphone Capture Subsystem | [main.cpp](file:///d:/Information%20management%20system/firmware/esp32-s3-box-3/src/main.cpp) | ES7210 register readback, stereo DMA deinterleaving & 16kHz PCM | PASS |

## Section 2: Detailed Scenarios
### Suite 12: ESP32-S3-BOX-3 Hardware Voice Terminal (FEAT-012)
1. **Network Handshake:** Connect ESP32-S3-BOX-3 via Wi-Fi to IMS backend ws://<host>:3001/api/live (or ngrok). Verify WebSocket handshake and setup packet exchange.
2. **Audio Input Streaming:** Stream 16kHz 16-bit PCM microphone frames from ES7210/ES8311 I2S codec on ESP32 into IMS backend; confirm audio packet ingestion and forwarding to Gemini Live.
3. **Audio Output Streaming:** Receive Gemini Live 24kHz PCM downsampled/resampled to Box-3 speaker DAC; verify smooth speech output without buffer underruns via 256-chunk PSRAM-backed playback queue (~8.2s audio buffer).
4. **Tool Calling & Screen Telemetry:** Verify tool calling (searchLibrary) queries IMS RAG vector store and renders state changes (Listening, Thinking, Speaking) on the Box-3 320x240 LCD, with calibrated VAD thresholds (speech RMS > 350, silence RMS < 250).

### Suite 13: ESP32-S3-BOX-3B Clean Microphone Capture Subsystem (FEAT-013)
1. **ES7210 Clock State Verification:** Confirm ES7210 register 0x08 retains 0x10 (`LRCK_RATE_MODE`) in slave mode, preventing 16:1 sample decimation dropouts.
2. **Continuous Audio Ingestion:** Capture 48,000 samples over 3s; verify >95% non-zero sample ratio with uniform modulo-16 distribution across DMA slots.
3. **Square-Wave Tone Elimination:** Execute hardware stereo I2S acquisition (`I2S_SLOT_MODE_STEREO`) and software extraction of pure Left channel (MIC1), eliminating 500Hz/1000Hz inter-channel square-wave modulation.
4. **Class-D PA Noise Isolation:** Ensure PA enable pin and ES8311 DAC unmute are gated during recording turns, isolating the analogue microphone lines from amplifier switching ripple.

## Section 3: Defensive Engineering Invariants
1. Hardware watchdog timer (WDT) and auto-reconnect logic on ESP32 WebSocket disconnects.
2. Anti-stutter ring buffer and I2S DMA queue sizing on ESP32 PSRAM to prevent audio underflow/overflow.
3. Clean socket disconnection teardown on both Node.js backend and ESP32 firmware upon session termination or Wi-Fi dropouts.
4. Stereo I2S bus acquisition with pure Left channel deinterleaving to prevent phase cancellation or DC-offset intermodulation on shared Box-3 codec lines.

