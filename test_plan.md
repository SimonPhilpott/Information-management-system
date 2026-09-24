# Test Plan & Verification Matrix

## Executive Summary
- Total Registered Features: 32
- Verified Features: 32
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
| FEAT-014 | Hardware Dynamic RAG Tool Calling | [server/index.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/index.js) | Server-side setup injection & HNSW vector search verification | PASS |
| FEAT-015 | Acoustic Pre-Roll Wake-Word & Dual-Trigger Subsystem | [main.cpp](file:///d:/Information%20management%20system/firmware/esp32-s3-box-3/src/main.cpp) | PSRAM pre-roll circular buffer, acoustic feedback blanking, volume attenuation & dual trigger | PASS |
| FEAT-016 | Hardware Conversational Persona | [hardwareClientService.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/services/hardwareClientService.js) | Witty British sarcastic persona, dark humour greetings, and grounded RAG answer verification | PASS |
| FEAT-017 | Hardware Half-Duplex Audio Protection & Lossless Playback Pacing | [main.cpp](file:///d:/Information%20management%20system/firmware/esp32-s3-box-3/src/main.cpp) | Server/firmware half-duplex mic suppression, FreeRTOS lossless queue retry loop & RAG spoken brevity | PASS |
| FEAT-018 | Hardware Stutter-Free Playback & Responsive Wake-Word Triggering | [main.cpp](file:///d:/Information%20management%20system/firmware/esp32-s3-box-3/src/main.cpp) | Core 1 non-blocking playback queue pacing, server mic passthrough & calibrated wake VAD | PASS |
| FEAT-019 | Hardware Physical Mic Mute Switch, Transcript Logging & PA Protection | [main.cpp](file:///d:/Information%20management%20system/firmware/esp32-s3-box-3/src/main.cpp) | Physical latching mute button (GPIO 1), transcript saving alongside WAV, PA enable guarantee & rich persona | PASS |
| FEAT-020 | Hardware Complete Audio Playback & Synthesis Continuity Guarantee | [main.cpp](file:///d:/Information%20management%20system/firmware/esp32-s3-box-3/src/main.cpp) | 4000ms pause-tolerant drain timer, 1-3 sentence spoken brevity limit, defensive PA/DAC unmute, and socket lifecycle logging | PASS |
| FEAT-021 | Hardware Keep-Alive Ping, Amplifier Persistence & Fast Turn Transition | [main.cpp](file:///d:/Information%20management%20system/firmware/esp32-s3-box-3/src/main.cpp) | 15s WebSocket ping, persistent PA during dialogue, 200ms post-drain cooldown & 1-2 sentence spoken conciseness | PASS |
| FEAT-022 | Hardware Interactive Voice Shuffling & Official Voice Descriptions | [main.cpp](file:///d:/Information%20management%20system/firmware/esp32-s3-box-3/src/main.cpp) | Immediate audio termination, 350ms settle debounce, 30 official voice descriptions, and wake-gating text exemption | PASS |
| FEAT-023 | Hardware Precision 3 Wake-Phrase Gating & Room Chatter Rejection | [hardwareClientService.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/services/hardwareClientService.js) | Dual-layer precision 3 wake-phrase gating ('Hey IMS', 'Hi IMS', 'Eh up IMS'), candidate speech verification & sessionClosed reset | PASS |
| FEAT-024 | Hardware Yorkshire Persona, Dynamic Markdown Rulebook & Emotion Matrix | [hardwareClientService.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/services/hardwareClientService.js) | Dynamic ims_persona_rules.md loading, Yorkshire phonetic priming, turn-by-turn setEmotion activation & non-blocking farewell | PASS |
| FEAT-025 | Hardware Explicit Memory & Recall Subsystem | [hardwareClientService.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/services/hardwareClientService.js) | rememberFact SQLite persistence, prompt pre-injection, and recallMemory / forgetMemory execution | PASS |
| FEAT-026 | IMS Memory Management Portal | [MemoriesPortal.jsx](file:///d:/Information%20management%20system/src/components/Dashboard/MemoriesPortal.jsx) | /ims/memories route view, add, edit, and delete operations | PASS |
| FEAT-027 | Hardware BSD Socket Transport & Buffer Crackle Elimination | [main.cpp](file:///d:/Information%20management%20system/firmware/esp32-s3-box-3/src/main.cpp) | PlatformIO compilation, raw BSD socket connect, 16KB SO_RCVBUF, TCP_NODELAY | PASS |
| FEAT-028 | Unified Cross-Platform Voice Persistence & Preview Isolation | [useGeminiLive.js](file:///d:/Information%20management%20system/src/hooks/useGeminiLive.js) | Ephemeral Web previewVoice, decoupled Box-3 previewVoiceIndex, backend sync & default voice lock | PASS |
| FEAT-029 | IMS Central Hub and Dynamic Persona Portal | [PersonaPortal.jsx](file:///d:/Information%20management%20system/src/components/Dashboard/PersonaPortal.jsx) | /ims central card navigation, /ims/persona Markdown editor, /api/persona-rules GET/PUT persistence | PASS |
| FEAT-030 | Subject-Grounded Library Book Retrieval & Response Formulation | [subjectMatcherService.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/services/subjectMatcherService.js) | Dynamic taxonomy scoring, book candidate resolution, & grounded prompt formulation | PASS |
| FEAT-031 | Real-Time Live Weather Integration & Yorkshire Commentary | [weatherService.js](file:///d:/Information%20management%20system/pdf-knowledge-base/server/services/weatherService.js) | Open-Meteo live API geocoding, WMO condition translation & getWeather tool response | PASS |
| FEAT-032 | Nightscout Real-Time Blood Glucose Widget & CGM Monitoring | [main.cpp](file:///d:/Information%20management%20system/firmware/esp32-s3-box-3/src/main.cpp) | Nightscout 60s polling, WebSocket push, LCD vector arrows & Font 4 mmol/L range rendering | PASS |







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

### Suite 14: Hardware Dynamic RAG Tool Calling (FEAT-014)
1. **Setup Augmentation:** Intercept incoming ESP32 setup packet in `server/index.js` and verify dynamic injection of the `tools` schema declaring `searchLibrary`.
2. **Dynamic Prompt Enrichment:** Validate `systemInstruction` is augmented with voice-tailored directives instructing Gemini to query `searchLibrary` for document and topic inquiries.
3. **Asynchronous Vector Retrieval:** Execute `executeHardwareRAGSearch` against HNSW vector store and SQLite metadata; confirm passage extraction with filename and page metadata.
4. **Resilient Tool Response & Error Fallback:** Confirm `toolResponse` delivery to Gemini Live and fallback acknowledgment on error or timeouts to maintain session continuity.

### Suite 15: Acoustic Pre-Roll Wake-Word & Dual-Trigger Subsystem (FEAT-015)
1. **Pre-Roll Speech Capture:** Verify 16-chunk PSRAM circular buffer captures ~512ms of leading audio before RMS threshold crossing, preserving wake phrase attack ("Hey Ims", "Eh up Ims").
2. **Acoustic Feedback Blanking:** Confirm `isSpeakerCoolingDown()` suppresses wake detection and flushes pre-roll buffer during speaker playback plus 1000ms cooldown, preventing self-interruption and clipping.
3. **Volume Calibration:** Verify ES8311 register 0x32 calibrated to 0xB4 (-5.5dB) and 1.2x digital gain produce clear, balanced listening levels without clipping or distortion.
4. **Clean Standby Boot:** Confirm omission of synthetic startup text query keeps device in silent, stable `STATE_STANDBY` until user initiates interaction via voice or touch.
5. **Multi-Sentence Paced Playback:** Verify 1024-chunk PSRAM playback queue (32.8s) and 35ms flow-control pacing prevent chunk drops and speech speedup distortion on long multi-sentence RAG answers.

### Suite 16: Hardware Conversational Persona (FEAT-016)
1. **Wake Greeting Tone:** Trigger Box-3 with standalone wake phrase ("Eh up Ims", "Hey Ims") and verify witty, dry, or mildly sarcastic gallows humour greeting response.
2. **Library Knowledge Accuracy:** Inquire about specific documents in the IMS library (e.g. project reports or manuals); verify Gemini executes `searchLibrary` and returns 100% accurate grounded facts.
3. **Subtle Persona Seasoning:** Confirm that factual responses retain a subtle, entertaining hint of the friendly sarcastic persona without obscuring technical details or data.
4. **Firmware Fallback Parity:** Verify Box-3 firmware fallback prompt maintains identical persona tone if backend handshake overrides are bypassed.

### Suite 17: Hardware Half-Duplex Audio Protection & Lossless Playback Pacing (FEAT-017)
1. **Server-Side Half-Duplex Suppression:** Monitor `live_proxy_debug.log` during long assistant speech turns; confirm binary mic messages from hardware client are filtered while `isModelSpeaking` is true, preventing false Gemini cloud VAD barge-in.
2. **Firmware Outbound Queue Reset:** Verify `sendTurnComplete()` and `handleFrame()` immediately deactivate `micStreamingActive` and reset `audioOutQueue`, stopping in-flight microphone packets from colliding with model audio synthesis.
3. **Core 0 audioMicTask Playback Guard:** Validate that `audioMicTask` inhibits mic frame pushing into `audioOutQueue` whenever `currentState == STATE_SPEAKING` or `isSpeakerCoolingDown()` is active.
4. **Lossless Playback Ingestion:** Verify that long bursts of audio chunks streamed into `handleFrame()` utilize the 40ms/4ms delay retry loop rather than silently dropping chunks, ensuring 100% audio packet delivery to `audioPlaybackQueue`.
5. **RAG Spoken Brevity & Completion:** Trigger a multi-document library query; verify Gemini synthesizes a complete, punchy 2-4 sentence spoken answer without mid-sentence cut-offs or token duration exhaustion.

### Suite 18: Hardware Stutter-Free Playback & Responsive Wake-Word Triggering (FEAT-018)
1. **Core 1 Non-Blocking Network Ingestion:** Verify `handleFrame()` pushes incoming resampled audio into `audioPlaybackQueue` using bounded 15ms queue send without `vTaskDelay` loops, maintaining continuous lwIP TCP socket polling without receive window stalls.
2. **Smooth Stutter-Free Speaker Playback:** Stream multi-sentence Gemini Live voice responses into ESP32-S3-BOX-3B; verify smooth, continuous audio reproduction through ES8311 DAC without I2S DMA underrun clicks, stuttering, or gaps.
3. **Unconditional Proxy Mic Ingestion:** Confirm `index.js` routes all binary microphone frames from the hardware terminal to upstream Gemini Live without model-speaking suppression, preventing wake-word dropped packets.
4. **modelTurnActive Auto-Clearing Guard:** Verify `isSpeakerActive()` safely clears `modelTurnActive` if `audioPlaybackQueue` has been empty for >1500ms, eliminating permanent acoustic cooldown lockups when upstream `turnComplete` is missing.
5. **Responsive Acoustic Wake Triggering:** Say "Hey Ims" or "Eh up Ims" from 1m distance; confirm immediate transition to `STATE_LISTENING` on the 1st attempt via calibrated 650 RMS / 2-frame VAD.

### Suite 19: Hardware Physical Mic Mute Switch, Transcript Logging & PA Protection (FEAT-019)
1. **Physical Latching Mute Button:** Press top mute button on ESP32-S3-BOX-3; confirm button illuminates red and LCD renders `[MIC MUTED]` status with footer prompt `Press the top button to unmute`, with top-right header clean, actively blocking all mic streaming and wake detection.
2. **Unmute Recovery:** Press top button again to release latch; confirm LED extinguishes and LCD immediately transitions back to ready `STANDBY` state, allowing immediate wake-word ("Hey Ims") triggering.
3. **Power Amplifier Power-On Guarantee:** Trigger conversational speech turn; verify `PA_ENABLE_PIN` (GPIO 46) is unconditionally asserted HIGH upon incoming audio arrival in `unmuteDacOnly()` and `handleFrame()`, eliminating silent "Speaking..." states.
4. **Full Response Transcript (.txt) Logging:** Trigger speech playback; verify `server/index.js` creates a `.txt` file containing the complete Gemini Live text response with the identical filename alongside each saved `.wav` file in `pdf-knowledge-base/server/audio_captures/`.
5. **Time-Bounded Echo Suppression:** Confirm server suppresses mic audio forwarding while `Date.now() - lastModelAudioTime < 800`, eliminating Google's server-side `GEMINI INTERRUPTED` acoustic feedback aborts while permitting immediate speech once model finishes.
6. **Varied Persona Synthesis:** Issue successive queries and wake-ups; verify Gemini generates novel, non-repetitive responses at temperature 0.9 while adhering to the witty, dark British comedic persona.

### Suite 20: Hardware Complete Audio Playback & Synthesis Continuity Guarantee (FEAT-020)
1. **Pause-Tolerant Audio Playback:** Issue an inquiry eliciting a multi-clause response; verify that Gemini Live pauses up to 4,000ms between clauses or sentences do not prematurely trigger `speaking_autotransition` or mute the ES8311 DAC.
2. **Spoken Brevity Enforcement:** Trigger library search queries and general conversation; confirm Gemini consistently constrains spoken responses to 1 to 3 complete sentences (under 15–20s of audio) without rambling or buffer overflow.
3. **Sentence Completion:** Verify that all spoken responses finish with a natural sentence conclusion, avoiding abrupt cutoffs mid-word or mid-sentence.
4. **Defensive PA/DAC Assertion:** Confirm that PA enable (GPIO 46) and ES8311 DAC unmute are continuously re-asserted on every binary audio chunk in `handleFrame()`, preventing any underrun from silencing audio.
5. **Proxy Connection Telemetry:** Verify `live_proxy_debug.log` captures client IP, remote port, and explicit connection close codes for all hardware terminal sessions.

### Suite 21: Hardware Keep-Alive Ping, Amplifier Persistence & Fast Turn Transition (FEAT-021)
1. **WebSocket Keep-Alive Heartbeat:** Verify server proxy logs `gWs.ping()` transmissions every 15 seconds during idle periods, preventing Cloudflare and Google Cloud edge socket closures.
2. **Persistent Amplifier Power:** Initiate dialogue; verify `PA_ENABLE_PIN` (GPIO 46) remains HIGH across turn transitions while `conversationOpen == true`, eliminating the 100-150ms wake delay and preventing opening syllable clipping.
3. **Rapid 200ms Turn Transition:** When speech finishes, verify `isSpeakerActive()` transitions to `STATE_LISTENING` within 200ms of I2S DMA empty, enabling instant natural user follow-up responses without delay.
4. **Spoken Conciseness Enforcement:** Confirm Gemini consistently limits voice replies to 1-2 concise sentences (under 10s of audio), completely eliminating the 20-second Google token cutoff.
5. **Standby Power Saving:** When conversation closes (`conversationOpen == false`), verify `setSpeakerMute(true)` sets `PA_ENABLE_PIN` LOW, restoring full low-power quiet standby.

### Suite 22: Hardware Interactive Voice Shuffling & Official Voice Descriptions (FEAT-022)
1. **Immediate Audio Interruption & Queue Purge:** During active voice preview playback, tap the left or right chevron arrow on the Box-3 LCD; verify speaker amplifier (`PA_ENABLE_PIN`) is immediately deasserted LOW, `audioPlaybackQueue` and `audioOutQueue` are instantly flushed, and prior audio speech halts with zero perceptual latency.
2. **Rapid Voice Shuffling & Debounce Pacing:** Rapidly tap through 5-10 voice selections; confirm LCD title, voice name, and description update with zero lag on every tap, while network reconnection and Gemini audio preview requests are debounced to 350ms of quiet settle time, eliminating socket flooding and heap fragmentation.
3. **Official Voice Descriptions Display:** Cycle through all 30 Gemini voices (Puck, Charon, Kore, Fenrir, Aoede, etc.); verify each voice name displays in emerald green and its corresponding official Google description (e.g. "Bright", "Upbeat", "Informative", "Firm", "Excitable") renders directly beneath in sky blue.
4. **Text-Turn Wake Gating Exemption:** On voice preview trigger, verify server-side `hardwareClientService.js` explicitly exempts direct text turns (`clientContent`) from `noWakeDetected` silence gating, ensuring preview speech "Hi, I'm <voice>" synthesizes and plays aloud reliably.
5. **Preview Flow Reset Safety:** If server emits a `noWakeDetected` signal or WebSocket reconnects, verify `previewFlow` resets safely to `PREVIEW_IDLE`, restoring UI interactive indicators without locking the screen in "Speaking preview...".

### Suite 23: Hardware Precision 3 Wake-Phrase Gating & Room Chatter Rejection (FEAT-023)
1. **Approved Wake-Phrase Initiation:** Speak any of the 3 approved wake phrases ("Hey, IMS", "Hi, IMS", "Eh up, IMS" / "Ey up, IMS"); verify Gemini Live immediately responds aloud, transitioning device from `STANDBY` to `SPEAKING`.
2. **Elimination of False Thinking Transitions:** During wake candidate speech verification (`!conversationOpen`), verify the LCD display stays firmly on `STANDBY` without displaying "GEMINI THINKING...".
3. **Unauthorized Ambient Speech Dropping:** Speak direct queries or ambient conversation into the room without an approved wake opening (e.g. "When is my next meeting?", "What time is it?", casual conversation like "current", or unapproved greetings like "Now then", "Morning"); verify Gemini calls `noWakeDetected`, emits 0 audio bytes, and device remains silent in `STANDBY` with zero spoken audio.
4. **Continuous Dialogue Flow:** After an approved wake phrase opens the dialogue (`conversationOpen = true`), speak follow-up questions naturally without repeating wake words; verify Gemini answers each turn and shows `LISTENING...` / `GEMINI THINKING...` / `SPEAKING`.
5. **Explicit Closing Phrase Teardown:** Speak a closing phrase (e.g. "thanks, bye", "goodbye", "that's all, IMS", "stop talking"); verify Gemini delivers farewell speech, calls `endConversation`, and device returns to `STANDBY` with `conversationOpen = false`.
6. **Session Idle Context Teardown:** Allow an open conversation to sit idle for 14s; verify firmware transitions `STATE_LISTENING` -> `STATE_STANDBY`, transmits `{"sessionClosed": true}`, and backend drops upstream Gemini session (code 1000) so old context cannot bleed into subsequent sessions.
7. **Touch-To-Talk Wake Bypass:** Tap the LCD screen directly; verify firmware sends `{"touchToTalk": true}` and enters `STATE_LISTENING`, allowing direct query questions without requiring a spoken wake phrase.

### Suite 24: Hardware Yorkshire Persona, Dynamic Markdown Rulebook & Emotion Matrix (FEAT-024)
1. **Dynamic Markdown Rulebook Ingestion:** Modify `ims_persona_rules.md` in repository root; start a hardware session and verify server console logs `personaRules=loaded` and system prompt contains injected rules without requiring server restart or firmware reflash.
2. **Yorkshire Dialect Acoustic Synthesis & Multi-Turn Retention:** Speak an approved wake phrase (e.g. "Ey up, IMS", "Now then, IMS"); engage in multi-turn conversation across general, technical, and coding topics; verify spoken audio response maintains genuine Northern cadence, regional idioms ("nowt", "owt", "proper", "crack on", "champion"), en-GB spelling, and syntactic anchors across all sentences without drifting into an American accent.
3. **Turn-by-Turn Facial Emotion Expression:** Monitor Box-3 LCD display across multi-turn exchanges; verify Gemini invokes `setEmotion` at the start of every reply with context-appropriate expressions (`joy` on greetings, `cocky` on witty comebacks, `suspicious` on dubious questions, `amazement` on technical milestones, `sleepy` at night) rather than sitting statically on `neutral`.
4. **Mid-Turn Emotional Transitions:** Present a prompt requiring evaluation and conclusion (e.g. checking a complex contract clause); verify Gemini calls `setEmotion` mid-turn, visibly transforming the LCD pixel matrix as the sentiment shifts from investigation to resolution.
5. **Conversational Agency & Hook Engagement:** Engage in dialogue; verify IMS closes turns with active conversational hooks, counter-questions, or dry observations rather than subservient corporate assistant closures ("How may I assist you today?").
6. **Non-Blocking Farewell Execution:** Speak a closing phrase ("Thanks, bye"); verify Gemini synthesizes and plays farewell audio immediately without lag, and Box-3 transitions to `STANDBY` as `conversationOpen` closes.
7. **Smooth High-Step Background Dot Breathing:** Observe IMS's face on the LCD display during idle STANDBY state; verify the inactive background dots surrounding the mouth and eyes fade in and out continuously at ~33 FPS without visible stepping, stutter, or colour jumps across the 52-step dynamic range, while facial animations (blink, gaze, expressions) preserve their 120ms cadence.

### Suite 25: Hardware Explicit Memory & Recall Subsystem (FEAT-025)
1. **Explicit Fact Ingestion ("Remember that / remember this"):** Speak a directive with an approved wake phrase (e.g. "Hey IMS, I left me car keys in the top drawer by the front door, remember that"); verify Gemini invokes `rememberFact`, logs `[rememberFact saved]` in server console, sets an expressive face (e.g. `cocky`), and delivers an affirmative in-character acknowledgment aloud.
2. **Persistent Storage Verification:** Inspect SQLite `ims_memories` table; verify the fact is recorded with unique ID, categorized appropriately, and timestamped.
3. **Session Handshake Pre-Injection:** Open a new hardware session; verify `buildMemoryParagraph()` loads the stored fact from `ims_memories` and injects it into `systemInstruction.parts[0].text` alongside past conversation topic summaries.
4. **Targeted Memory Recall ("Where are my keys?"):** Ask a direct recall question (e.g. "Quick question, IMS, where did I leave me car keys?"); verify Gemini recalls the exact saved fact and answers aloud in authentic dialect without hallucination.
5. **Broad Memory Querying ("What did I ask you to remember?"):** Ask "What have I asked you to remember?"; verify Gemini invokes `recallMemory` and recites the active stored notes.
6. **Targeted Fact Deletion ("Forget that note"):** Instruct IMS to forget a specific item (e.g. "Forget about the car keys"); verify Gemini calls `forgetMemory`, deletes the record from `ims_memories`, and acknowledges the removal.

### Suite 26: IMS Memory Management Portal (/ims/memories) (FEAT-026)
1. **Route Activation:** Navigate to `/ims/memories` in browser or click "Memories DB" in the left sidebar or topbar icon; verify `MemoriesPortal` renders with Oatmeal/dark theme, overview metric cards, and responsive toolbar.
2. **Database Ingestion & Categorization:** Click "Add Memory", enter fact text, choose category (`item_location`, `preference`, `personal`, `work`), and submit; verify `POST /api/memories` returns HTTP 201, toast confirms insertion, and memory card displays immediately.
3. **Real-time Live Search & Filtering:** Enter keywords into the search input or toggle category pills (`All`, `Item Locations`, `Preferences`, etc.); verify grid updates instantly reflecting filtered memory subsets.
4. **Inline Fact Editing:** Click the edit icon on a memory card; update the fact string or category in the modal and save; verify `PUT /api/memories/:id` persists changes and card refreshes.
5. **Destructive Action Confirmation Guard:** Click the delete trash icon; verify card presents an explicit confirmation button ("Confirm") before executing `DELETE /api/memories/:id`, preventing accidental fact loss.
6. **Hardware Cross-Synchronization:** Speak a fact to the Box-3 assistant ("Hey IMS, remember that my workshop code is 4421"); refresh `/ims/memories` and verify the spoken memory appears in the web portal with its timestamp and category.

### Suite 27: Hardware BSD Socket Transport & Buffer Crackle Elimination (FEAT-027)
1. **Transport Initialization:** Flash firmware to ESP32-S3-BOX-3; verify `RawTcpClient` initializes socket, sets `SO_RCVBUF` to 16,384 bytes, enables `TCP_NODELAY`, and successfully connects to `IMS_PRIMARY_HOST:IMS_TCP_PORT`.
2. **Sustained Audio Ingestion Without Drops:** Stream a long multi-sentence response from Gemini Live while state=6 (SPEAKING); monitor serial log to verify 0 occurrences of `[TCP] Resynced after skipping 1436 bytes` and 0 dropped audio frames.
3. **Acoustic Waveform Continuity:** Listen to speaker output throughout lengthy spoken responses; verify clean, continuous audio output with zero audible clicks, pops, or crackles.
4. **Rapid Shuffling Stress Test:** Navigate rapidly between voices on the settings screen; verify raw BSD socket cleanly handles socket drops, immediate audio cutoffs, and reconnects without heap exhaustion or framing desync.

### Suite 28: Unified Cross-Platform Voice Persistence & Preview Isolation (FEAT-028)
1. **Default Voice Persistence Across Clients:** Ensure active voice is set to `Umbriel` in web client and hardware terminal; reload browser and verify `Umbriel` remains selected; reboot ESP32-S3-BOX-3 and verify serial logs show `[Personality] Synced from backend: voice=Umbriel` and voice screen renders `Umbriel [ ACTIVE DEFAULT VOICE ]`.
2. **Web Audition Preview Isolation:** Open voice dropdown in Web UI, click the Play preview button next to `Zephyr` (or any other voice); verify audio snippet plays in that auditioned voice; verify the primary voice dropdown, `voiceName` hook state, and `localStorage` retain `Umbriel`.
3. **Hardware Audition Preview Isolation:** On the Box-3 terminal, navigate to IMS Voice screen; tap the right arrow repeatedly to audition other voices (`Fenrir`, `Aoede`, `Zephyr`); verify the Box-3 speaks "Hi, I'm <voice>", but status indicator shows `[ TAP HERE TO SET AS DEFAULT ]` (amber); exit back to IMS PERSONALITY without tapping center; verify active default voice remains `Umbriel` and SQLite backend `ims_personality` voice is unaffected.
4. **Hardware Explicit Voice Default Commitment:** On the Box-3 terminal voice screen, cycle to a new voice and explicitly tap the center area; verify label updates to green `[ ACTIVE DEFAULT VOICE ]`, NVS is updated, and `POST /device/personality` updates backend SQLite; verify subsequent reboots retain this chosen voice.
5. **Backend Single Source of Truth:** Update voice via `POST /api/settings/personality` or Web UI; reboot Box-3 hardware; verify `fetchPersonalityFromBackend()` during WiFi setup retrieves and applies the newly committed voice automatically.

### Suite 29: IMS Central Hub and Dynamic Persona Portal (FEAT-029)
1. **Hub Navigation:** Navigate to `/ims` via the left sidebar "IMS Hub" button; verify portal renders responsive navigation cards for Memories (`/ims/memories`) and Persona (`/ims/persona`).
2. **Dynamic Persona Editing:** Open `/ims/persona`; verify editor loads current `ims_persona_rules.md` contents via `GET /api/persona-rules`; modify text and click Save; verify `PUT /api/persona-rules` persists to disk and returns success toast.
3. **Runtime Reflection:** Initiate a Gemini Live voice session on web or hardware terminal; verify updated persona rules are dynamically loaded into the systemInstruction without requiring a server reboot or firmware reflash.

### Suite 30: Subject-Grounded Library Book Retrieval & Response Formulation (FEAT-030)
1. **Dynamic Taxonomy Resolution:** Query `subjectMatcherService.js` for known library subjects; verify caching and extraction of 70+ taxonomy paths with synonyms (e.g. GNN -> Graph Neural Networks, LLM -> Large Language Models, PyTorch -> Pytorch).
2. **Query Subject Detection:** Submit query containing subject terms (e.g. "How do I implement few-shot prompt engineering?"); verify `detectQuerySubjects()` returns matching leaf subjects (e.g. `Artificial Intelligence / Deep Learning / Large Language Models / Prompt Engineering`) and candidate books (e.g. `Prompt Engineering for Generative AI.pdf`).
3. **Multi-Format Document Resolution:** Verify `resolveDriveFileIdsForSubjects()` in `vectorStore.js` resolves matching `drive_file_id`s regardless of path delimiter spacing (`/` vs ` / `) or prefix hierarchy depth.
4. **Targeted Vector Chunk Grounding:** Execute chat query with matched subjects; verify `searchSimilarMultiQuery` filters chunks strictly against targeted book IDs, falling back cleanly to broad library search if chunks < 3.
5. **Prompt Directive Injection:** Verify Gemini prompt includes `LIBRARY SUBJECT GROUNDING (HIGH PRIORITY)` directives instructing formulation and code derivation strictly from the matched library books.
6. **UI Grounding Badge:** Verify `MessageBubble.jsx` displays visual grounding badge (`📚 Grounded in: [Subject Leaf Name] ([N] books)`) when `groundedSubjects` and `groundedBooks` are returned.
7. **Hardware Audio RAG Prepend:** Verify `executeHardwareRAGSearch()` in `hardwareClientService.js` prepends detected subject headers to RAG context for Box-3 voice responses.

### Suite 31: Real-Time Live Weather Integration & Yorkshire Commentary (FEAT-031)
1. **Local Weather Voice Query:** Speak wake phrase and ask "What's the weather like today?"; verify Gemini calls `getWeather(location: "")`, receives Leeds / West Yorkshire conditions, and answers aloud with accurate temperature in °C and condition.
2. **Specific Global City Weather Query:** Ask "What's the weather in Paris?" or "How is it in New York?"; verify `weatherService.js` executes geocoding and returns targeted forecast for the specified municipality.
3. **WMO Meteorological Code Translation:** Verify WMO weather codes (e.g. 0 -> Clear sky, 51 -> Light drizzle, 61 -> Slight rain, 3 -> Overcast) correctly map to natural language conditions in the tool payload.
4. **10-Minute TTL Cache Operation:** Issue two weather queries for the same location within 10 minutes; verify the second response serves from memory without executing an outbound network fetch.
5. **Yorkshire Commentary Ingestion:** Verify Gemini's spoken audio frames incorporate authentic regional commentary matching the temperature and sky conditions (e.g. "cracking flags", "proper chilly", "chucking it down", "grab your big coat").

### Suite 32: Nightscout Real-Time Blood Glucose Widget & CGM Monitoring (FEAT-032)
1. **Nightscout 60s Background Polling:** Verify `glucoseService.js` polls Nightscout properties API every 60,000ms, extracting latest `scaled` mmol/L value and `direction` from `bgnow.sgvs`.
2. **Range-Based Health Color Verification:** Verify numerical blood glucose value and trend arrows render in green (`#2ED573`) for 4.0-7.5 mmol/L, yellow/amber (`#FFB84D`) for >7.5 mmol/L, and red (`#FF4757`) for <4.0 mmol/L.
3. **Geometric Vector Trend Arrow Rendering:** Verify all 7 Nightscout trend directions (`DoubleDown`, `SingleDown`, `FortyFiveDown`, `Flat`, `FortyFiveUp`, `SingleUp`, `DoubleUp`) render crisp geometric arrowheads above the glucose reading on the LCD without character clipping.
4. **LCD Screen Layout & Padding Verification:** Verify `FACE_CENTER_X` is centered at 148, `FACE_CENTER_Y` is lowered to 116 (providing 7px margin below the header bar), the status label sits at y=188, and the glucose widget is centered at x=288, y=116 with balanced margins preventing overlap with the face or right bezel.
5. **Flicker-Free Selective Invalidation:** Verify 60-second WebSocket push updates redraw only the 66x80px bounding box via `drawGlucoseWidget()` without causing a full-screen flash or interrupting active face dot animations.
6. **Gemini Live getBloodGlucose Tool Calling:** Speak wake phrase and ask "Hey IMS, how's me blood sugar?"; verify Gemini calls `getBloodGlucose()`, reports the exact mmol/L value and trend direction aloud, and delivers reassuring Yorkshire commentary.
7. **REST Endpoint Inspection:** Issue HTTP GET to `/api/glucose`; verify JSON payload returns `value`, `direction`, `range`, `colorHex`, and `timestamp`.
8. **Footer Schedule Indicator Icons:** Set an alarm, timer, or reminder; verify the corresponding orange icon (16x16 XBM bell for alarm, clock for timer, pen for reminder) renders at double font height with 18px spacing to the right of the date string, optically centered at y=210, and automatically disappears when the alert is cancelled or dismissed without ghosting or clipping the emotion label.
9. **Mechanical 22x22 Cog Settings Icon Verification:** Verify the header settings icon at (22, 21) renders an authentic 22x22 XBM mechanical cog with 8 symmetrical tapered teeth and a transparent hollow central axle bore against the header background (`#141822`), responding accurately to touch within its bounding box (`x < 55 && y < 45`).

## Section 3: Defensive Engineering Invariants
1. Hardware watchdog timer (WDT) and auto-reconnect logic on ESP32 WebSocket disconnects.
2. Anti-stutter ring buffer and I2S DMA queue sizing on ESP32 PSRAM to prevent audio underflow/overflow.
3. Clean socket disconnection teardown on both Node.js backend and ESP32 firmware upon session termination or Wi-Fi dropouts.
4. Stereo I2S bus acquisition with pure Left channel deinterleaving to prevent phase cancellation or DC-offset intermodulation on shared Box-3 codec lines.
5. Server-side toolResponse fallback ensuring Gemini Live receives an error acknowledgment if RAG search encounters a timeout or failure.
6. Acoustic feedback cooldown blanking window (1000ms) ensuring microphone task suppresses wake detection and resets pre-roll buffer while speaker is active or reverberating.
7. Playback flow-control pacing (15ms timeout) into 1024-chunk PSRAM buffer ensuring streaming audio chunks are ingested without dropping frames or blocking Core 1's network poll loop.
8. Conversational persona instructions enforce 100% strict adherence to RAG tool execution (`searchLibrary`) so wit does not override factual veracity.
9. Acoustic wake detection requires multi-frame verification (2 consecutive frames > 650 RMS) and 1,500ms post-playback cooldown to eliminate ambient noise and speaker reverberation false triggers.
10. Dual-trigger recovery allows wake phrase, touch, and top button to interrupt or reset from THINKING or LISTENING states.
11. Hardware-level half-duplex microphone suppression: during active physical speaker playback (`STATE_SPEAKING` and `isSpeakerCoolingDown()`), microphone forwarding is suppressed on the device itself with microsecond DMA accuracy.
12. Acoustic state timeout guard: `modelTurnActive` is automatically cleared after 1500ms of speaker silence to ensure missing upstream `turnComplete` packets cannot permanently dead-end acoustic wake detection.
13. Hardware physical mic mute switch (GPIO 1) is active LOW and unconditionally halts mic task streaming, purges outbound queues, and rejects touch-to-talk triggers until physically disengaged.
14. Class-D speaker power amplifier (NS4150B on GPIO 46) is guaranteed enabled on every audio chunk reception to eliminate race conditions between local silence timers and rapid Gemini synthesis.
15. Playback pause tolerance guard: `isSpeakerActive()` maintains `modelTurnActive` for up to 4,000ms of empty-queue silence, preventing inter-clause speech synthesis pauses from prematurely muting the hardware codec.
16. Strict spoken length boundary: Gemini Live system prompt strictly limits audio answers to 1-3 complete sentences (max 15-20s audio) to prevent FreeRTOS PSRAM queue exhaustion and cloud VAD aborts.
17. WebSocket keep-alive ping interval (15s) maintains intermediate Google Cloud edge proxies and prevents silent TCP half-open connection termination during conversational pauses.
18. Class-D amplifier persistence: `PA_ENABLE_PIN` (GPIO 46) is held asserted HIGH for the entirety of an active dialogue (`conversationOpen`), eliminating the 100-150ms startup delay that clips initial syllables of short replies.
19. Rapid turn-taking cooldown: the post-drain acoustic cooldown is bounded to 200ms after the I2S DMA playback queue empties, restoring the microphone immediately for natural zero-lag conversational replies without echo feedback.
20. Voice preview audio cutoff: on chevron arrow touch in the IMS Voice screen, speaker PA is immediately disabled (LOW), `audioPlaybackQueue` is flushed, and `previewFlow` is aborted to allow instant, non-blocking shuffling between voices.
21. Voice shuffle settle debounce (350ms): rapid screen navigation updates UI and voice state immediately while pacing backend TCP socket reconnection, preventing socket churn and FreeRTOS heap exhaustion.
22. Standby wake verification invariant: while `conversationOpen == false`, `sendTurnComplete()` leaves `currentState = STATE_VERIFYING` and the LCD rendered in `STANDBY`, preventing candidate audio evaluation from flashing false `GEMINI THINKING...` screens.
23. Session state synchronization: firmware explicitly broadcasts `sessionClosed` upon idle timeout, verification timeout, mute engagement, or tap-cancel, ensuring proxy terminates upstream Gemini session (code 1000) and prevents conversational context bleed.
24. Dynamic persona configuration fallback: if `ims_persona_rules.md` is missing or unreadable, `hardwareClientService.js` gracefully falls back to default system instructions without crashing the session setup handshake.
25. Non-blocking tool execution safety: `endConversation` and `setEmotion` tools are declared without blocking behavior flags, ensuring Gemini Live synthesizes voice immediately without waiting for server response round trips.
26. Explicit memory error resilience: if database lookup encounters a transient lock or error, `rememberFact` and `recallMemory` return defensive error fallbacks to Gemini Live without breaking the WebSocket stream or audio pipeline.
27. Web memory portal optimistic and defensive validation: memory additions and deletions are validated on both client and Express routes with non-empty string checks, confirmation gates on destructive actions, and non-blocking asynchronous REST endpoints preserving SQLite database integrity.
28. Raw BSD socket window expansion and retry resilience: `RawTcpClient` explicitly expands socket receive buffer (`SO_RCVBUF`) to 16KB, disables Nagle batching (`TCP_NODELAY`), implements non-blocking `recv()` via `ioctl(FIONREAD)` and handles `EAGAIN`/`EWOULDBLOCK` on transmit with microsecond delays, preventing buffer truncation and acoustic waveform distortion.
29. Voice audition isolation invariant: Web previewVoice initializes an ephemeral WebSocket connection with dedicated AudioContext playback that automatically terminates on turnComplete without mutating voiceName or localStorage; firmware previewVoiceIndex and activePreviewVoice decouple arrow auditioning from personalityVoiceIndex, preventing auditions from altering NVS or sending mutating POST requests to SQLite without explicit user tap-to-commit.
30. Persona rules runtime loading invariant: `loadPersonaRules` dynamically resolves `ims_persona_rules.md` across known relative root paths on each Gemini Live setup payload construction, and `savePersonaRules` safely performs atomic synchronous disk write via `/api/persona-rules` PUT endpoint with non-empty validation.
31. Dynamic subject-grounded book scoping fallback invariant: if targeted subject-grounded vector filtering returns fewer than 3 chunks, vectorStore and chatService automatically execute a secondary broad library vector search to guarantee complete answer formulation and avoid starved context.
32. Weather API error resilience and caching invariant: `weatherService.js` implements a 10-minute in-memory TTL cache to prevent redundant HTTP requests and rate-limiting, and catches all upstream network/geocoding failures to return structured fallback payloads, preventing unhandled promise rejections or tool execution failures in Gemini Live.
33. Nightscout CGM error resilience & LCD bounding box invalidation invariant: `glucoseService.js` wraps Nightscout HTTP requests with a 7-second abort timeout and falls back to cached readings upon network interruptions, while `drawGlucoseWidget()` exclusively clears its 66x80px bounding box (`fillRect(252, 80, 66, 80)`) to ensure 60-second periodic updates never flash the display or disrupt ongoing face dot tick animations.
34. Schedule status synchronization & indicator rendering invariant: `remindersService.js` provides `getActiveScheduledStatus()` querying SQLite `scheduled_items` for active types, `index.js` automatically broadcasts `schedule` status on connection, tool mutation, and 15s checks, and `drawFooterClock()` renders dedicated orange vector icons (bell for alarm, clock for timer, pen for reminder) within `fillRect(0, 204, 265, 20)` without overlapping the right-aligned emotion label.
35. Settings cog icon XBM rendering invariant: `cog_icon_22x22` bitmap in PROGMEM is rendered via `tft.drawXBitmap(cx - 11, cy - 11, cog_icon_22x22, 22, 22, col)` preceded by a 24x24 background patch (`fillRect(cx - 12, cy - 12, 24, 24, color565(20, 24, 34))`), preventing residual artifacts or ghosting between redraw states while maintaining instant touch hit detection.








