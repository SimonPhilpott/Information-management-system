# IMS Human Comprehension, Personality Depth & Adaptive Multi-Turn Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform IMS from a rigid, concise desk assistant into an empathetic, highly comprehensible, and human-sounding companion capable of fluid multi-turn follow-ups, acoustic speech resilience, and adaptive depth for both quick commands and deep, complex analytical discussions.

**Architecture:** Implement an Adaptive Complexity Engine in [`hardwareClientService.js`](file:///d:/Information%20management%20system/pdf-knowledge-base/server/services/hardwareClientService.js) replacing static brevity constraints with 3-tier depth scaling; deploy an in-memory `ShortTermDialogCache` and dynamic follow-up watchdog in [`server/index.js`](file:///d:/Information%20management%20system/pdf-knowledge-base/server/index.js) to preserve conversational context across connection cycles; enhance acoustic speech recovery and natural disambiguation in [`personas/_house_rules.md`](file:///d:/Information%20management%20system/pdf-knowledge-base/personas/_house_rules.md) and [`personas/yorkshire.md`](file:///d:/Information%20management%20system/pdf-knowledge-base/personas/yorkshire.md); and orchestrate multi-hop tool execution before speech synthesis.

**Tech Stack:** Node.js (ESM), `@google/genai` (Gemini 3.8 Live WebSockets), Web Audio / 16kHz PCM streaming, ESP32-S3 Box-3 C++/PlatformIO, SQLite, React (Vite).

---

## 1. Problem Statement & Root Cause Analysis

### Current Bottlenecks:
1. **Premature Session Teardown & Context Amnesia:**
   - In [`server/index.js`](file:///d:/Information%20management%20system/pdf-knowledge-base/server/index.js), `SILENCE_CLOSE_MS = 15000`. If a user pauses for >15s while thinking about a complex answer, the WebSocket terminates.
   - When the user speaks again, a new Gemini Live session begins with zero memory of the preceding dialogue turns, forcing repetitive context resets.
2. **Artificial Brevity Suppressing Complex Answers:**
   - The system instruction has historically mandated: `"Keep it short and to the point. 1-3 sentences maximum. This is for a small desk device."`
   - While ideal for "What's the weather?", this completely strangles depth when the user asks multi-hop physiological, technical, or strategic questions (e.g. "Why did my blood sugar spike after my 10k yesterday?", "Explain how the Ring motion detection interacts with the ESP32 screen"). IMS currently truncates answers into superficial bullet points.
3. **Acoustic Drop-off & Silence Traps:**
   - In [`server/index.js`](file:///d:/Information%20management%20system/pdf-knowledge-base/server/index.js), muffled or low-volume audio frames under 45 frames (~1.4s) drop silently without an intent match.
   - Gemini Live occasionally receives ambiguous phonemes and emits neither audio nor tool calls, causing an awkward 5-second silence before falling back.
4. **Single-Shot Tool Limitation:**
   - For multi-domain queries ("Look at my last run, check my glucose trend, and tell me if I should eat before going out in this weather"), tools are either called piecemeal or the model begins speaking before synthesising all three domains.
5. **Sterile Cadence & Missing Human Personality:**
   - Even with regional dialect words, speech can feel like a corporate LLM reading phonetic substitutions. It lacks authentic thinking hesitation, contextual backchanneling, genuine opinions, and conversational hand-offs.

---

## 2. Target Behavioral Architecture

```mermaid
flowchart TD
    UserAudio[User Spoken Audio] --> Box3Mic[ESP32-S3 Box-3 / Web VAD]
    Box3Mic --> TurnPacer[Server Index Turn Pacer & Audio Buffer]
    
    subgraph Comprehension & Context Layer
        TurnPacer --> DialogCache[Short-Term Dialog Cache (Last 8 Turns)]
        DialogCache --> IntentClassifier[Adaptive Depth & Intent Classifier]
        IntentClassifier --> ToolChainer[Multi-Hop Tool Orchestrator]
    end

    subgraph Reasoning & Persona Engine
        ToolChainer --> GeminiLive[Gemini 3.8 Live WebSocket]
        GeminiLive --> PersonaPrompt[Persona & House Rules Engine]
        PersonaPrompt --> DynamicDepth[Depth Scaling: Tier 1, 2, or 3]
    end

    subgraph Speech & Pacing Layer
        DynamicDepth --> AudioOut[Spoken 24kHz PCM Stream]
        AudioOut --> DynamicFollowUp[Dynamic Follow-up Watchdog (15s-30s)]
        DynamicFollowUp --> ListenForFollowUp[Active Listening Without Wake Word]
    end
```

---

## 3. Implementation Tasks Breakdown

### Task 1: Dynamic Conversational Depth & Adaptive Explanatory Architecture

**Files:**
- Modify: [`pdf-knowledge-base/server/services/hardwareClientService.js:150-320`](file:///d:/Information%20management%20system/pdf-knowledge-base/server/services/hardwareClientService.js)
- Modify: [`pdf-knowledge-base/personas/_house_rules.md:1-50`](file:///d:/Information%20management%20system/pdf-knowledge-base/personas/_house_rules.md)
- Test: [`pdf-knowledge-base/server/test/test_adaptive_depth.mjs`](file:///d:/Information%20management%20system/pdf-knowledge-base/server/test/test_adaptive_depth.mjs)

**Step 1: Write the failing test**
Create [`pdf-knowledge-base/server/test/test_adaptive_depth.mjs`](file:///d:/Information%20management%20system/pdf-knowledge-base/server/test/test_adaptive_depth.mjs) asserting that:
1. Operational requests (e.g. "Set a timer for 10 minutes", "What's the temperature?") receive `ADAPTIVE_DEPTH_TIER_1` instructions (concise, 1-2 sentences).
2. Explanatory/analytical inquiries (e.g. "Why did my blood sugar drop so fast?", "Explain the difference between Arkham Horror LCG and Marvel Champions") receive `ADAPTIVE_DEPTH_TIER_3` instructions (expansive, structured conversational prose, multi-clause depth, no arbitrary sentence ceiling).

```javascript
import assert from 'node:assert/strict';
import { buildLiveSystemInstruction } from '../services/hardwareClientService.js';

// Verify adaptive depth directives exist in system prompt
const prompt = buildLiveSystemInstruction('desk');
assert.ok(prompt.includes('ADAPTIVE CONVERSATIONAL DEPTH'), 'System prompt must declare Adaptive Conversational Depth');
assert.ok(prompt.includes('TIER 1 (OPERATIONAL)'), 'Must define Tier 1 operational brevity');
assert.ok(prompt.includes('TIER 3 (ANALYTICAL & EXPLANATORY)'), 'Must define Tier 3 analytical depth');
assert.ok(!prompt.includes('1-3 sentences maximum'), 'Strict 1-3 sentences blanket constraint must be eliminated');
console.log('PASS: Adaptive depth prompt structure verified.');
```

**Step 2: Run test to verify it fails**
Run: `node "d:/Information management system/pdf-knowledge-base/server/test/test_adaptive_depth.mjs"`
Expected: FAIL with "System prompt must declare Adaptive Conversational Depth".

**Step 3: Implement minimal code in `hardwareClientService.js` and `_house_rules.md`**
Replace the blanket brevity rule with:
```markdown
### ADAPTIVE CONVERSATIONAL DEPTH
Calibrate your reply length dynamically to the nature of Simon's query:
- **TIER 1 (Operational & Quick Commands):** Timers, alarms, clock, quick single-metric queries (e.g. "What's my sugar right now?", "Turn on bedroom light"). Be crisp, direct, and immediate (1-2 sentences). No superfluous small talk.
- **TIER 2 (Casual Chat & Dialogue):** Banter, greetings, opinions on simple subjects. Speak naturally with warm regional cadence (2-4 sentences) and an open conversational hand-off.
- **TIER 3 (Analytical, Strategic & Complex Explanations):** Explaining physiological trends (glucose/exercise kinetics), board game strategy, technical architectures, Middle-earth campaign lore, or historical questions. Provide deep, multi-paragraph, richly detailed answers. Never truncate or summarize artificially into superficial bullet points. Speak in natural, fluid conversational paragraphs, explaining cause, effect, and practical context.
```

**Step 4: Run test to verify it passes**
Run: `node "d:/Information management system/pdf-knowledge-base/server/test/test_adaptive_depth.mjs"`
Expected: PASS.

**Step 5: Commit**
`git commit -m "feat(voice): implement adaptive conversational depth engine"`

---

### Task 2: Short-Term Multi-Turn Dialog Cache & Reconnection State Restoration

**Files:**
- Modify: [`pdf-knowledge-base/server/index.js:800-1100`](file:///d:/Information%20management%20system/pdf-knowledge-base/server/index.js)
- Create: [`pdf-knowledge-base/server/services/dialogContextService.js`](file:///d:/Information%20management%20system/pdf-knowledge-base/server/services/dialogContextService.js)
- Test: [`pdf-knowledge-base/server/test/test_dialog_cache.mjs`](file:///d:/Information%20management%20system/pdf-knowledge-base/server/test/test_dialog_cache.mjs)

**Step 1: Write the failing test**
Create [`pdf-knowledge-base/server/test/test_dialog_cache.mjs`](file:///d:/Information%20management%20system/pdf-knowledge-base/server/test/test_dialog_cache.mjs) verifying:
1. `recordTurn(clientId, 'user', text)` and `recordTurn(clientId, 'assistant', text)` buffer dialogue turns.
2. `getRecentDialogContext(clientId, maxTurns=6)` formats turns into chronological conversational context.
3. Turns older than 30 minutes expire automatically.
4. When a new Gemini Live session connects, the dialog context is injected as initial history so follow-ups retain context even after silence timeouts.

**Step 2: Run test to verify it fails**
Run: `node "d:/Information management system/pdf-knowledge-base/server/test/test_dialog_cache.mjs"`
Expected: FAIL with "module not found".

**Step 3: Implement `dialogContextService.js` and integrate into `index.js`**
Build [`dialogContextService.js`](file:///d:/Information%20management%20system/pdf-knowledge-base/server/services/dialogContextService.js):
- In-memory map keyed by client IP/device identifier.
- Ring buffer of 10 exchanges per client.
- When `openGeminiLiveSession()` initializes in [`server/index.js`](file:///d:/Information%20management%20system/pdf-knowledge-base/server/index.js), fetch recent dialog context and inject it as a preparatory message in `clientContent` turns, or append it to dynamic system instruction preamble.

**Step 4: Run test to verify it passes**
Run: `node "d:/Information management system/pdf-knowledge-base/server/test/test_dialog_cache.mjs"`
Expected: PASS.

**Step 5: Commit**
`git commit -m "feat(voice): add short-term dialog cache for persistent multi-turn follow-ups"`

---

### Task 3: Adaptive Follow-Up Window & Conversational Linger Watchdog

**Files:**
- Modify: [`pdf-knowledge-base/server/index.js:1450-1650`](file:///d:/Information%20management%20system/pdf-knowledge-base/server/index.js)
- Test: [`pdf-knowledge-base/server/test/test_followup_pacing.mjs`](file:///d:/Information%20management%20system/pdf-knowledge-base/server/test/test_followup_pacing.mjs)

**Step 1: Write the failing test**
Test that:
- Standard operational turn sets `FOLLOW_UP_MS = 12000` (12 seconds).
- Turn ending in a question or deep explanation sets `FOLLOW_UP_MS = 25000` (25 seconds).
- Silence closing timeout (`SILENCE_CLOSE_MS`) dynamically scales to match `FOLLOW_UP_MS + 5000`.

**Step 2: Run test to verify it fails**
Run: `node "d:/Information management system/pdf-knowledge-base/server/test/test_followup_pacing.mjs"`
Expected: FAIL.

**Step 3: Implement dynamic follow-up window calculation**
In [`server/index.js`](file:///d:/Information%20management%20system/pdf-knowledge-base/server/index.js):
- Inspect last assistant transcript output. If it contains interrogatives (`?`, "reckon", "what think", "want me to") or is classified as Tier 3 (>60 words), compute:
  `const activeFollowUpMs = isExplanatoryOrQuestion ? 25000 : 15000;`
- Update `followUpUntil = playEnd + activeFollowUpMs`.
- Reset silence timer to `activeFollowUpMs + 5000` instead of a hardcoded 15000ms.

**Step 4: Run test to verify it passes**
Run: `node "d:/Information management system/pdf-knowledge-base/server/test/test_followup_pacing.mjs"`
Expected: PASS.

**Step 5: Commit**
`git commit -m "feat(pacing): dynamic follow-up window scaling for complex conversations"`

---

### Task 4: Acoustic Speech Recovery & Natural Clarification Heuristics

**Files:**
- Modify: [`pdf-knowledge-base/server/index.js:1250-1350`](file:///d:/Information%20management%20system/pdf-knowledge-base/server/index.js)
- Modify: [`pdf-knowledge-base/personas/_house_rules.md`](file:///d:/Information%20management%20system/pdf-knowledge-base/personas/_house_rules.md)
- Modify: [`firmware/esp32-s3-box-3/src/main.cpp:520-560`](file:///d:/Information%20management%20system/firmware/esp32-s3-box-3/src/main.cpp)
- Test: [`pdf-knowledge-base/server/test/test_clarification_flow.mjs`](file:///d:/Information%20management%20system/pdf-knowledge-base/server/test/test_clarification_flow.mjs)

**Step 1: Write the failing test**
Create a test simulating:
1. Speech stream that triggers VAD but produces zero Gemini transcript tokens within 2800ms.
2. Backend triggers a persona-calibrated clarification nudge (`"Sorry cocker, didn't quite catch that with the background noise. Say again?"`) instead of dropping into dead silence.

**Step 2: Run test to verify it fails**
Run: `node "d:/Information management system/pdf-knowledge-base/server/test/test_clarification_flow.mjs"`
Expected: FAIL.

**Step 3: Implement acoustic recovery watchdog in `server/index.js` & firmware pre-roll**
- In [`server/index.js`](file:///d:/Information%20management%20system/pdf-knowledge-base/server/index.js): If `speechFramesReceived > 30` (~960ms of audio energy) but Gemini emits empty turn within 2.5s post-speech, synthesize a natural clarification prompt rather than silently aborting.
- In [`firmware/esp32-s3-box-3/src/main.cpp`](file:///d:/Information%20management%20system/firmware/esp32-s3-box-3/src/main.cpp): Increase audio pre-roll ring buffer from 200ms to 400ms to ensure initial plosives and soft consonants are never lost before VAD trips high.

**Step 4: Run test to verify it passes**
Run: `node "d:/Information management system/pdf-knowledge-base/server/test/test_clarification_flow.mjs"`
Expected: PASS.

**Step 5: Commit**
`git commit -m "feat(audio): acoustic speech recovery watchdog and increased pre-roll buffering"`

---

### Task 5: Multi-Hop Tool Chaining for Complex Compound Inquiries

**Files:**
- Modify: [`pdf-knowledge-base/server/services/hardwareClientService.js:280-350`](file:///d:/Information%20management%20system/pdf-knowledge-base/server/services/hardwareClientService.js)
- Modify: [`pdf-knowledge-base/server/index.js:1700-1850`](file:///d:/Information%20management%20system/pdf-knowledge-base/server/index.js)
- Test: [`pdf-knowledge-base/server/test/test_multihop_tools.mjs`](file:///d:/Information%20management%20system/pdf-knowledge-base/server/test/test_multihop_tools.mjs)

**Step 1: Write the failing test**
Test query: `"Look at my last run, check what my glucose is doing now, and tell me if I should have a snack before going out again."`
Assert that:
1. Model invokes both `getLastRun` and `getBloodGlucose` before outputting audio.
2. Audio output references both run metrics and current glucose trend in a unified analytical synthesis.

**Step 2: Run test to verify it fails**
Run: `node "d:/Information management system/pdf-knowledge-base/server/test/test_multihop_tools.mjs"`
Expected: FAIL.

**Step 3: Update Tool Execution Directives in `hardwareClientService.js`**
Instruct the Gemini Live model explicitly:
```markdown
### MULTI-HOP REASONING & COMPOUND QUERIES
If Simon asks a question requiring multiple sources of context (e.g., combining glucose data with run history, or weather forecast with calendar events), execute all relevant tools first before formulating your spoken response. Do not guess or answer one part while ignoring the other. Synthesize all retrieved findings into a coherent, practical perspective.
```

**Step 4: Run test to verify it passes**
Run: `node "d:/Information management system/pdf-knowledge-base/server/test/test_multihop_tools.mjs"`
Expected: PASS.

**Step 5: Commit**
`git commit -m "feat(reasoning): add multi-hop tool execution directives for compound queries"`

---

### Task 6: Human Persona Nuance, Spoken Cadence & Personality Warmth

**Files:**
- Modify: [`pdf-knowledge-base/personas/yorkshire.md`](file:///d:/Information%20management%20system/pdf-knowledge-base/personas/yorkshire.md)
- Modify: [`pdf-knowledge-base/personas/_house_rules.md`](file:///d:/Information%20management%20system/pdf-knowledge-base/personas/_house_rules.md)
- Test: [`pdf-knowledge-base/server/test/test_persona_humanity.mjs`](file:///d:/Information%20management%20system/pdf-knowledge-base/server/test/test_persona_humanity.mjs)

**Step 1: Write the failing test**
Test that persona prompt contains:
1. Authentic thinking markers ("Well now...", "Right then...", "Aye, let's look at that...").
2. Explicit prohibition of corporate AI cliches ("Certainly!", "I'd be glad to assist", "Here are 3 key factors:").
3. Conversational hand-offs (asking a thoughtful follow-up question when concluding complex explanations).

**Step 2: Run test to verify it fails**
Run: `node "d:/Information management system/pdf-knowledge-base/server/test/test_persona_humanity.mjs"`
Expected: FAIL.

**Step 3: Refine Persona & House Rules**
Enrich [`personas/yorkshire.md`](file:///d:/Information%20management%20system/pdf-knowledge-base/personas/yorkshire.md) and [`_house_rules.md`](file:///d:/Information%20management%20system/pdf-knowledge-base/personas/_house_rules.md):
- Add thinking phrases mapped to query difficulty.
- Emphasise genuine personal opinions grounded in past discussions (e.g. favourite board games, running pacing philosophy).
- Mandate natural conversational closures that encourage multi-turn follow-ups without requiring wake words.

**Step 4: Run test to verify it passes**
Run: `node "d:/Information management system/pdf-knowledge-base/server/test/test_persona_humanity.mjs"`
Expected: PASS.

**Step 5: Commit**
`git commit -m "feat(persona): enrich vocal warmth, thinking cadences, and conversational hand-offs"`

---

## 4. Verification & Testing Matrix

| Scenario ID | Test Case / Utterance | Expected Behavior | Verification Method |
|---|---|---|---|
| **SCEN-01** | *"Set a timer for 15 minutes."* | Quick, crisp response (1 sentence: "Right, 15 minutes on the clock.") | Spoken desk trace & audio transcript timing (<1.2s) |
| **SCEN-02** | *"Why did my blood sugar drop so fast around mile 4 yesterday?"* | Tier 3 deep explanation: references pace change, active insulin, aerobic threshold, refuelling gap. Multi-paragraph conversational narrative. | Spoken test trace; word count > 80; no bullet points. |
| **SCEN-03** | Immediate follow-up: *"Should I have eaten a gel before that hill?"* (spoken 18s later without wake word) | Follow-up window remains open (25s ceiling); Ims answers referring seamlessly to the previous mile 4 climb. | Live ESP32 & Web socket test bench; verify session not torn down. |
| **SCEN-04** | Muffled utterance with ambient noise: *"What... game... Arkham... setup?"* | Does not drop into silence. Clarifies naturally: *"Sorry cocker, didn't quite catch that with the noise. Were you asking about Arkham Horror setup?"* | Audio playback injection; verify clarification audio triggered within 2.8s. |
| **SCEN-05** | Compound query: *"Check my sugar and see if it's dry enough for a run now."* | Executes `getBloodGlucose` and `getWeather` sequentially, synthesizes integrated advice: *"You're at 6.8 with a flat arrow, and rain's holding off until 4pm..."* | WebSocket tool invocation logger; verify both tools executed before audio playback starts. |

---

## 5. Execution Handoff

Plan complete and saved to `docs/plans/2026-10-04-ims-human-comprehension-personality.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagents per task, review between tasks, fast iteration.
**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints.

Which approach would you like to take?
