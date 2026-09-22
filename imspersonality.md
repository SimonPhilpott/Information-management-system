# IMS Personality System — Implementation Plan

Touchscreen-controlled personality for IMS (the ESP32-S3-BOX-3B voice terminal): five continuous
style sliders, a multi-layered variance engine so replies stop feeling repetitive, and a bounded
"grows over time" relationship memory — combined at Gemini Live session-setup time into a dynamic
system prompt.

## Grounding in the existing codebase

- `pdf-knowledge-base/server/services/hardwareClientService.js` → `getHardwareSetupPayload(voiceName)`
  already builds the Gemini Live `setup` handshake (`generationConfig`, `voiceConfig`, `systemInstruction`,
  `tools`). `voiceName` is already a parameter, just never called with one yet.
- `pdf-knowledge-base/server/index.js` (~line 697) already intercepts every device's `setup` message and
  overwrites `systemInstruction`/`tools` before forwarding to Gemini. This is the hook point for making
  the prompt dynamic.
- SQLite already has a generic `settings(key TEXT PRIMARY KEY, value TEXT)` table — no new schema needed
  for the slider values themselves.
- An uncommitted edit already sitting in the working tree bumped `temperature` 0.8→0.9 and added a
  "never repeat the same opening line" instruction to the system prompt — a first, unenforced pass at
  the variance problem this plan replaces with something stateful.

## Architectural constraint that shapes everything below

**A Gemini Live session is one persistent WebSocket. `systemInstruction` and `generationConfig`
(temperature, penalties, etc.) are fixed at that session's `setup` handshake and cannot be edited
mid-session.** IMS's mic stays open across many conversational turns on one connection, not one
connection per turn. This means:

- Slider changes take effect on the **next new session** (reconnect), not mid-conversation.
- "Per-turn" variance (jittered temperature, a fresh framing directive every reply) is **not natively
  available** within one open session. Anything below described as "per-turn" has been redesigned to
  operate at **session-setup granularity** by default, with the true per-turn version marked as an
  R&D spike to validate before committing to it.

## Phase 1 — Dynamic persona prompt (continuous, not 3 hard buckets)

Persist one JSON blob at `settings['ims_personality']`: `{ humor, delivery, temperament, social, formality, voice }`,
each axis 0–100. Replace the hardcoded `systemInstruction` string with a function that blends the two
nearest anchor descriptions per axis based on slider position (e.g. humor=75 → "leaning toward Dark,
still carrying some Dry restraint") rather than snapping at a threshold, so small nudges are audible.
`getHardwareSetupPayload()` gets called with the persisted `voice` and the built instruction instead of
the static string.

## Phase 2 — Multi-layered variance engine (expanded scope)

Goal: eliminate repetitive phrasing beyond a blunt "don't say X" filter, without relying on mechanisms
the Live API doesn't actually expose mid-session.

### 2.1 Structural & rhetorical angle priming

Maintain a small set of entry archetypes (the four supplied — Observation/In media res, Reflective Echo,
Direct Pivot, Laconic Understatement — plus room to add more) and bias each new **session's** system
prompt toward one, e.g. appending: *"Framing directive for this session: open via direct tactical
observation; avoid introductory conversational buffers."*

- **Session-level (build this first):** rotate/weighted-random the archetype on each reconnect, logging
  which was last used (`settings['ims_last_archetype']`) so back-to-back sessions don't repeat one.
- **Per-turn (R&D spike, do after the above ships):** the backend already parses `clientContent.turns`
  messages and the firmware already proves out sending text turns via `sendTextQuery()`. The open
  question is whether injecting a short silent/system-role text turn immediately after VAD detects
  end-of-user-speech — before forwarding to Gemini — actually steers the next reply's structure without
  Gemini treating it as something to answer or the user hearing it as an extra turn. This needs a small
  standalone prototype against the live API before it's relied on; it is not guaranteed to behave the
  way a per-turn system message would in a stateless chat completion API.

### 2.2 Pattern fingerprinting (upgrade from a flat banned-phrase list)

A verbatim rolling list only catches identical wording ("Well, looks like..." doesn't stop "Alright,
seems like..."). Instead:

- New table (or a `settings` key holding a small JSON array) storing, per reply: the 3-gram/4-gram hash
  set of the opening ~15 words, plus a coarse pattern tag (rhetorical-question, colloquial-acknowledgment,
  assertive-statement, stark-observation, etc.).
- **Tagging approach:** start with cheap keyword/regex heuristics (fast, deterministic, no extra API
  call) — e.g. openers starting with "Well"/"Alright"/"So" tag as colloquial-acknowledgment; openers
  ending in "?" tag as rhetorical-question. Only upgrade to a secondary small Gemini text classification
  call later if heuristics prove too coarse — that would add a small latency/cost hop at session-start,
  not per-turn.
- At next session build, compute which pattern tags dominate the recent window and inject a structural
  *inversion* directive instead of a negative string match: *"Recent openers relied on rhetorical
  questions and colloquial acknowledgments. Invert this: use an assertive statement or a stark
  observation."* This is the mechanism that actually generalizes past exact-string repeats.

### 2.3 Dynamic sampling

- **Temperature jitter:** since `generationConfig` is fixed per session, jitter happens **at session
  setup**, not per-turn as literally described — draw a value each reconnect from a band centered and
  widened by the Temperament/Humor slider values (e.g. center = 0.7 + 0.2×(humor/100), width ±0.1).
- **Presence/frequency penalty:** `presencePenalty`/`frequencyPenalty` exist in Gemini's general
  `generationConfig` surface, but whether they're honored for `gemini-2.5-flash-native-audio-latest`
  specifically over the Live API needs verifying against current docs/behavior before being relied on —
  native-audio models have historically had a reduced config surface versus text models. Treat this as a
  concrete spike: if supported, set a moderate per-session value (~0.3–0.5) scaled slightly by slider
  position; if not honored, lean more on 2.1/2.2/2.4 instead, which don't depend on it.

### 2.4 Dynamic perspective / cognitive focus seed

The most straightforward layer — fits the existing "build prompt fresh at session setup" architecture
with no open questions. Derive a one-sentence "current lens" from the five slider values at session
setup (can reuse Phase 1's blended per-axis descriptors, combined for the two most extreme axes into one
framing sentence) and inject it into `systemInstruction`. Persist recently-used lens phrasings
(`settings['ims_recent_lenses']`) and vary the *wording* of the lens sentence even when the underlying
slider values are unchanged, so two sessions with identical slider positions don't converge on identical
phrasing.

### Phase 2 build order

1. Pattern fingerprint storage + retrieval (2.2) — foundational, the inversion directive in 2.1 depends on it.
2. Archetype rotation baked into system prompt at session setup (2.1, session-level).
3. Cognitive focus seed generation (2.4) — cheap, high value, builds directly on Phase 1.
4. Temperature jitter at session setup (2.3, session-level).
5. Presence/frequency penalty — verify feasibility against the live API/model before committing.
6. *(Stretch, optional)* per-turn archetype injection via mid-session `clientContent` text turns — only
   pursue once 1–4 are shipped and only if session-level variance turns out not to be enough in practice.

## Phase 3 — Bounded relationship memory ("grows over time")

Deliberately kept separate from the tone sliders: sliders set *style*, this layer adds *content* IMS has
learned about you, without overriding the style you dialled in. After each conversation, a lightweight
summarization step appends to a running note (`settings['ims_relationship_memory']` or a small dedicated
table) — topics discussed, things you've mentioned caring about — periodically condensed so it can't grow
unbounded and blow out the prompt. Injected into the system prompt as its own section. Start small (last
few session topics) and iterate once you've seen how it feels in practice, rather than designing the full
scope up front.

## Phase 4 — Firmware: the settings screen

- **Entry point:** a small gear icon in the header's top-left corner (currently unused space), tapped
  explicitly — not a long-press or bare screen-tap, since tapping the main screen already means
  interrupt/wake and shouldn't collide with opening settings.
- **Layout:** five horizontal sliders stacked in the 320×240 area, each row showing the axis name, the
  blended descriptor at its current position (e.g. "Humor — Dry"), and a draggable track/handle.
- **Back arrow:** top-left tap zone on the settings screen, returns to the main face screen.
- **Touch handling:** drag-to-set using the existing `tft.getTouch()` already polled in `loop()`.
- **Persistence:** debounce (~500ms after last drag movement) and POST the five values + selected voice
  to a new lightweight backend endpoint (same unauthenticated-HTTP-from-hardware pattern already used for
  the mic-upload endpoint, kept off the low-latency TCP audio channel). Cache last-known values in ESP32
  NVS via `Preferences` purely so the settings screen redraws with correct handle positions instantly on
  boot, without waiting on a round trip.

## Phase 5 — Voice picker

`voiceName` is already plumbed through `getHardwareSetupPayload()`. Add it as a row of selectable
presets on the settings screen (Puck + whichever other prebuilt Gemini voices are wanted) rather than a
slider.

## Honesty notes / open verification items

- Everything in Phase 2 described by the original ask as "per-turn" has been redesigned to operate at
  session-setup granularity, because the Live API doesn't support editing `systemInstruction` or
  `generationConfig` mid-session. The one genuinely per-turn mechanism (2.1's stretch goal) is unproven
  and flagged as a spike, not a committed deliverable.
- Presence/frequency penalty support for `gemini-2.5-flash-native-audio-latest` over the Live API is
  unverified and needs a direct check against current behavior/docs before Phase 2.3 relies on it.
- Reconnecting the Gemini session so slider changes apply sooner than "next time you start talking to
  me" is possible but adds a few seconds of visible "reconnecting" state right after you hit Save — not
  in scope unless it turns out to matter in practice.
