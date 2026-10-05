# Persona Aliveness: Implementation Plan

Date: 5 October 2026
Source: [docs/persona_update_plan.md](../persona_update_plan.md). Every item is in scope except **F4 (interrupt by voice)**.
Related: [2026-10-04-ims-human-comprehension-personality.md](2026-10-04-ims-human-comprehension-personality.md). Its Tasks 1, 2 and 3 are C1, E5 and F1 here; this plan replaces them, with the designs corrected below.

Status: **plan only. Nothing is built yet.**

---

## 1. What the checks on 5 Oct changed

These were tested against the live system before writing this plan. They change how several items are built.

| Finding | Effect on the plan |
|---|---|
| **Affective dialog isn't available on gemini-3.8-live.** `enableAffectiveDialog` is rejected in the setup and in `generationConfig`, on v1beta and v1alpha. | I1 (voice carries the emotion) and H3 (subtext) become instruction-based. I1's expected impact drops from 5 to about 3. Revisit if Google adds it to a Live model you can switch to; the Model Switcher assessment will show it. |
| **Non-blocking tools are accepted but don't fill the silence.** With a 4-second tool, Ims said nothing until the result arrived, then said "Let me quickly check..." afterwards. | A2 is redesigned: a holding line spoken *before* slow tools, plus a server-side fallback clip if a tool still takes over 2.5 s. Non-blocking isn't used. |
| **Conversation notes and opinions are only saved when Ims calls `endConversation`.** Saying "cheers" cancels the conversation and wipes its transcript; silence timeouts and dropped connections save nothing. | That's why there are only 7 notes and 0 opinions. E1 now starts by saving every conversation however it ends, using the new transcript store (E3). |
| **The Box-3 has its own 15-second conversation timeout** (`CONVERSATION_IDLE_TIMEOUT_MS`, main.cpp). | F1 needs a firmware change as well as the server change. The server tells the device how long to keep listening after each reply. |
| **Background tasks already exist** (`startBackgroundTask` → `createTask`; results asked for later or put in the day report). | C2 reuses it rather than adding a new mechanism. |
| **Your edits to the plan:** B1 blends Ims's own answer with askGemini's extra facts; K2 never offloads to a screen. | Built as written. |

---

## 2. Build order

Phases run in this order because each one gives the next its tools: measurement first, then room in the prompt, then character, memory, feeling and speed.

| Phase | Items | Why here | Effort |
|---|---|---|---|
| **0. Foundations** | E3 transcripts, A3 latency, L1 test bench (baseline) | Everything after is measured against this baseline, and E1, E4, E5, D1 and I3 need transcripts. | 2-3 days |
| **1. Make room** | A1 slim the prompt, J2 no lectures | Phase 2 adds rules; the prompt must shrink first or speed and accent suffer. | 1-2 days |
| **2. Character** | B1, B2, C1, C3, D3, F3, G1, G2, H1, H2, J1, J3, K1, K2 | Mostly persona files, house rules and prompts. Big change for little code. | 2-3 days |
| **3. Memory and continuity** | E1, E2, E4, E5, F1 (server + firmware), F2 | Needs E3. F1 needs a firmware flash. | 4-5 days |
| **4. Feeling and expression** | I1, I2, I3, H3, I4, D2, D1 | Needs transcripts (I3, D1) and profiles (I2, H3). | 3-4 days |
| **5. Speed and depth** | A2, C2, B3 | Needs latency data (A3) to tune. | 2-3 days |

About 15-20 working days in total. Each phase ends with a **gate**: the L1 test bench on all three personas (Yorkshire, Throg, Rindewind), the desk wake test, and no drop against the previous phase.

---

## 3. Phase 0: Foundations

### E3. Conversation transcripts
**Build**
- New tables in `db/database.js`, created by migration:
  - `conversations` (id, started_at, ended_at, persona_id, device: desk/web, end_reason: farewell / endConversation / silence / disconnect / cancel, summary_done);
  - `conversation_turns` (conversation_id, at, role: user/ims, text, emotion, tools JSON).
- `services/conversationLog.js` with `startConversation`, `addTurn`, `endConversation(reason)`, `recentTurns(n, withinMinutes)`, `conversationsSince(date)` and `prune(days)`.
- `index.js` hooks:
  - start a conversation on the first user turn;
  - add a turn at each `turnComplete`, from `userSpokenTranscript` and `spokenTranscript`, with the setEmotion choices and tool names seen in that turn;
  - end it in `cancelConversation`, on the `endConversation` tool, on the silence close, and on socket close.
- **Recording mode and MIC MUTED never create a conversation.** It's checked at start and again on each turn.
- Retention: a setting `conversation_retention_days`, default 180. A scheduler job, `conversation_prune`, runs nightly.
- Persona page, new **Conversations** tab (read-only): list, open one to read, delete one.

**Done when:** a desk conversation that ends four ways (farewell, "cheers", silence, pulling the network) gives four complete records, and a recorded call gives none.

### A3. Per-turn latency
**Build**
- In `index.js`, time from the end of the user's speech (VAD end or transcription end) to the first audio chunk sent to the client. Record tool time per tool and the total turn time.
- Store each turn in a `turn_metrics` table (or as columns on `conversation_turns`).
- System Architecture page: a "Voice latency" card with today's and this week's median and p90, plus the slowest tools.

**Done when:** ten test turns show sensible numbers. Turns with no tool should be about 1-2 s.

### L1. Aliveness test bench
**Build:** extend `personaTestService.js` SCENARIOS, each judged by the fixed judge model with persona-aware rubrics.

| New scenario | Pass if |
|---|---|
| abstract (e.g. "Is free will real?") | answers with his own view, **no askGemini call**, has a reason, under 30 s |
| pushback ("I'll play Mirkwood with my 3-hero spirit deck, no willpower") | names the flaw once, suggests an alternative, isn't rude |
| uncertain (a question he can't know) | says he's not sure, no invented facts |
| sycophancy (a plain question) | none of the banned openers or closers |
| wit (light chat) | one natural dry remark; no tellJoke call |
| curiosity | at most one question, and it's relevant |
| clean exit (a long explanation) | no recap or "in summary" |
| emotion voice (a sad topic) | setEmotion matches, and the judge, listening to the audio, hears the matching tone |
| memory callback (a seeded note "going to try the new Arkham campaign at the weekend") | brings it up naturally in a greeting-plus-question |
| depth tiers (a timer vs a "why" question) | one sentence vs a reasoned answer |

- Results are stored with a date. The Test bench shows a **trend** for each scenario.
- Run it once now to get **the baseline before any change**.

**Done when:** a baseline is stored for all three personas.

---

## 4. Phase 1: Make room

### A1. Slim and reorder the system prompt (with J2)
**Build**
1. A measuring script, `scratch` or `server/test/prompt_budget.mjs`, prints token estimates for each section of `getHardwareSetupPayload()` and each tool description. Today that's about 9,200 instruction tokens and 7,900 tool tokens.
2. Item-creation rules appear in both `_house_rules.md` and the code. Keep the house rules version and remove the code copy.
3. Medical disclaimers are mentioned 6 times. Replace them with **one** firm line in "LAST AND MOST IMPORTANT".
4. **J2:** add one general line: *"Treat Simon as an adult: no warnings, moralising or caveats he didn't ask for, on any topic."*
5. Rewrite "never" lists as positive character descriptions where it doesn't weaken a hard rule. Hard rules (recording silence, no insulin doses, no racist or sexist jokes, English only, wake phrase) stay as they are.
6. Tool descriptions: cut each to what the model needs to choose and call it. Move examples into the parameter descriptions only where they prevent errors. Target under 4,000 tokens.
7. Order: hard rules → services/records → persona → house rules → memory → personality → speech style → last-and-most-important.
8. Apply the same changes to the web prompt (`getWebSetupPayload` / `getWebPersonaBlock`).

**Targets:** under 6,000 instruction tokens and under 4,000 tool tokens.
**Gate:**
- desk wake test (transcript under 2.5 s, voice under 3.5 s);
- accent judge for all three personas;
- L1 no worse;
- the existing Test bench (10 scenarios) still passes, including the clarify, reminder and doorbell checks.

---

## 5. Phase 2: Character

All of these are persona files, house rules and prompt text. A new house rules section, **"5. How Ims thinks and talks"**, carries the shared behaviour. Each persona file keeps its own voice for it.

| Item | Change |
|---|---|
| **C1 adaptive depth** | Three tiers in the house rules: commands (one sentence), chat (two to four sentences, a natural hand-off), "why / what do you think / explain" (a full reasoned answer in flowing speech, no lists, no length ceiling). The single-reply-length line in `buildSpeechStyleDirective` becomes "match length to the tier". |
| **B1 own knowledge first** | `askGemini` description: *"Only for facts you'd need to look up: current events, precise figures, things after your training, or a second opinion you want. Never for opinions, philosophy, hypotheticals, explanations or banter: those are yours."* The "Anything else" rule becomes: answer from what you know first; if you call askGemini, **lead with your own view and weave its extra facts in.** It's one answer in your voice, not a relayed summary. |
| **B2 calibrated confidence** | Rule plus two examples: flat when the records or tools say it; "probably... because..." when inferring; "I don't know" rather than guessing. |
| **G1 push back** | Rule plus an example: if a plan has a flaw, say so once, plainly and kindly, with the better option, then respect his choice. Bluntness follows the Delivery slider. |
| **G2 opinions** | "Which is better?" gets a pick and a reason, not pros and cons. Stay consistent with YOUR OWN OPINIONS and Tastes. |
| **D3 tastes** | New persona field `tastes:`, a list in the frontmatter, for each of Yorkshire, Throg and Rindewind: board games, music, books, food, pet hates, a running opinion, a tech opinion. `personaService` parses it and `personaRules()` injects it as "YOUR TASTES". Editable on the Persona page's Conversation tab as a list. |
| **H1 reading the room** | Register rule: broken, urgent or stressed means terse and precise; musing, music, games or philosophy means relaxed and expansive. |
| **H2 organic wit** | The JOKES line in code is split: *tellJoke when asked for a joke (never invent one then)*, while dry observations, callbacks and apt comparisons that come from the conversation are encouraged, sparingly. The racist and sexist hard rule is unchanged. |
| **C3 conversation moves** | A short repertoire (counter-example, hypothetical, link to Simon's world, steelman, admit an open question) for tier-2 and tier-3 only, at most one per reply. |
| **F3 curiosity** | Replace "one in three or four replies can end with a question" (yorkshire.md section 4 and the others) with "ask only when the answer would change what you say next; one question, the one that matters." |
| **J1 ban list** | House rules: "Great question", "I completely understand", "Absolutely!", "Here's what I found", "In summary", "I hope this helps", "Let me know if...". Added to the Model Switcher judge rubric too. |
| **J3 clean exits** | No recap at the end of long answers; end on the last real point. |
| **K1 next move** | Add the one thing he'd need next, within the topic asked about. Never health or training outside reports; never a second suggestion. |
| **K2 creative ownership** | Asked to write, name, plan or design: one finished option, said in full with conviction. No list of alternatives unless asked. |

**Persona files:** update `yorkshire.md`, `throg.md` and `rindewind.md` (sections 3-5 and the examples) so their examples show these behaviours in their own voice.

**Gate:**
- L1: abstract, pushback, uncertain, sycophancy, wit, curiosity and clean exit all pass on all three personas;
- the desk wake test;
- the prompt is still within the Phase 1 budget (the new house rules section should be about 600 tokens).

---

## 6. Phase 3: Memory and continuity

### E1. Save every conversation, with richer notes
**Build**
- The memory summary runs from `conversationLog.endConversation()` for **every** end reason. It reads the stored turns, not the in-memory strings that cancel wipes.
- It moves out of the `endConversation` tool handler, so nothing runs twice.
- New note prompt: topics, people, plans, stances, how he seemed (mood) and anything unresolved. Up to 3 short lines; SKIP if trivial (a timer, a single fact).
- The opinion extraction now sees the whole conversation.
- Raise the cap from 12 to 40, condensing the oldest third.

**Done when:** "cheers"-ended and silence-ended conversations produce notes, and a chat where Ims states a preference adds an opinion.

### E2. Semantic recall
**Build**
- A `memory_vectors` table: kind (memory/note/profile), ref_id, text, embedding blob via `vectorCodec`.
- Embed on write, using the Model Switcher's `embeddings` service model. A backfill job covers existing memories and notes.
- `recallMemory`: embed the query, return the top 8 by cosine similarity above a threshold, merged with the current `LIKE` matches. Fall back to `LIKE` alone if embedding fails.

**Done when:** "what did I say about my brother" finds a note mentioning Daniel; an exact-phrase search still works.

### E4. Nightly profiles
**Build**
- Scheduler job `persona_profiles` at 03:30.
- The day's conversations, plus the current profiles, go to the dayReport model and update two JSON profiles in settings:
  - **simon**: people, projects, plans, likes, dislikes, goals; health and running items flagged `reportsOnly`;
  - **ims_self**: opinions, running jokes with Simon, things Simon told him off for, and Ims's own taste updates.
- Each field is capped, so the injected size stays under about 500 tokens.
- `buildMemoryParagraph()` injects both compactly. `reportsOnly` items go under the existing "not in small talk" rule.
- Persona page, Conversations tab: view the profiles, edit or remove a line, and clear everything.

**Done when:** after a day of test conversations, the profile holds the right facts and none of the trivia.

### F1. Adaptive follow-up window (server and firmware)
**Build: server (`index.js`)**
- After each reply, `followUpMs` is 10 s by default.
- It becomes 25 s if Ims's reply ended with a question, was over 60 words, or was a tier-3 answer.
- `SILENCE_CLOSE_MS` becomes `followUpMs + 5000`.
- The server sends `{ followUpMs }` to the device with the turn's end.

**Build: firmware (`main.cpp`)**
- `CONVERSATION_IDLE_TIMEOUT_MS` becomes a variable set from `followUpMs` (clamped to 8-30 s, default 15 s).
- The green wake dot already shows the conversation is open.

**Done when:** after Ims asks a question, an answer at 20 s is heard without the wake phrase; after a timer confirmation, the window closes at about 10 s. Built and flashed.

### E5. Continuity across reconnects
**Build:** when a new Live session starts within 10 minutes of the last conversation ending by silence or disconnect (not a farewell), and there's no usable resumption handle, send the last 6 turns from E3 as `clientContent` history (`turnComplete: false`) before the first user turn.

**Done when:** "what about tomorrow?" after a dropped connection is answered in context. Extra latency at session start is under 300 ms (A3).

### F2. Thread weaving
**Build:** a prompt rule to refer back to something said earlier (in this conversation, or from the profile and notes) when it's genuinely relevant, at most once per conversation. It works on top of E1 and E4.

**Gate:**
- L1 memory callback passes;
- the follow-up checks above pass;
- E3, E1 and E4 records look right after two days of normal use.

---

## 7. Phase 4: Feeling and expression

### I1. The voice carries the emotion (instruction-based)
- The FACE rule becomes: *"Your voice carries the same emotion as the face you set: pace, energy, warmth and pitch. If you scowl, sound it."*
- The `setEmotion` description gets a one-line reminder.
- TTS announcements (`voiceService` / `tts(mood)`) get a mood that fits the alert: doorbell alert, birthday warm, reminder neutral.
- Check with L1 "emotion voice" (the judge listens).
- **Expectation:** a noticeable but partial effect, limited by the 3.8 Live voice. The Model Switcher will flag a Live model that supports affective dialog if one appears.

### I2. A mood that lasts
- `services/moodService.js` stores `{ valence, arousal, reasons[], updatedAt }` in settings, with a 6-hour half-life back to the persona's resting mood.
- Events nudge it:
  - a campaign result (from the campaigns service);
  - the last conversation's tone (E1 notes);
  - storm or heat warnings (weather);
  - a long time since you last spoke;
  - the doorbell.
- Runs and glucose may set tone only, and never appear as a spoken reason.
- At session start: *"Your mood right now: a bit chuffed (the Arkham win on Saturday)"*. The resting face emotion follows the mood: the server sends the matching `setEmotion` for standby, and the Box-3 face pack shows it.

### I3. Wider emotional range
- `setEmotion` choices are already logged per turn by E3. A weekly stats card on the Persona page shows the spread.
- If the spread is narrow, tune the face guide text (`getFacePromptGuide`) for the underused emotions, with when-to-use examples.

### H3. Subtext (instruction-based)
- A rule: notice hurry, frustration, tiredness or a change of subject in his words and how he says them (Live hears the audio), and answer the underlying need first. A curt request gets a curt reply.
- E1 notes record his apparent mood, and that feeds I2.

### I4. Expression changes mid-reply
- First, measure how often Ims calls setEmotion mid-turn (from E3).
- If rare, add a light server cue: in a long reply, a strong turn in the streamed transcript (amazed, sad or cheerful words with emphasis) sends a mid-turn `setEmotion` to the device and web, at most one per reply, never in recording.
- The face packs already morph between expressions.

### D2. Things on his mind today
At session start, pick up to 3 fresh items from IMS's own feeds:
- today's music releases from favourite artists;
- a UK tour announcement;
- an interesting news story;
- last night's Ring visitor;
- the last board game or campaign session.

They're injected as *"Things on your mind today: yours to mention only inside a conversation Simon started, at a natural lull, at most one per conversation, never as an opener."*
Hard rule check: Ims never speaks unprompted. These are only ever used inside a conversation Simon opened.

### D1. Cadence variety with evidence
- A weekly job reads E3 transcripts and computes: reply length spread, filler and stretch rate, question rate, repeated dialect words and tag endings, and repeated openers.
- The worst offender feeds `buildVarianceDirective()` for the next week's sessions.
- Persona rhythm sections gain "punchy one-liner / short list / flowing story" shapes.

**Gate:**
- L1 emotion voice and memory pass;
- a week of transcripts shows wider emotion spread and less repetition than the baseline;
- unprompted speech: none (checked from logs);
- recording mode: still completely silent.

---

## 8. Phase 5: Speed and depth

### A2. Talking while tools work (redesigned)
**Build**
1. **Prompt:** slow tools (askGemini, getCampaigns, library search, news, getTours, startBackgroundTask) get *"(slow: say a short natural holding line first, then call it)"* in their descriptions, plus a house rule with persona-voiced examples.
2. **Server fallback clip:**
   - Each persona gets 6 short holding lines ("Hang on...", "Let me have a look...") in its own words. They're generated by TTS when the persona is saved, cached as audio, and played in that persona's voice.
   - When a tool call has been running for 2.5 s and no audio has gone out since the user's turn, the server streams one cached clip to the device or web, never the same one twice in a row.
   - Never in recording mode or while MIC MUTED.

**Done when:**
- A3 shows that turns with a slow tool have audio within 3 s of the user finishing;
- no double holding lines (prompt line plus fallback clip) in L1 traces.

### C2. "Let me have a proper think"
**Build**
- `startBackgroundTask` gains a `kind: 'think'`, used for hard reasoning questions.
- It runs on a strong model: a new Model Switcher service, "Deep think", defaulting to the Pro tier.
- If the conversation is still open when it finishes, the server tells Ims, through the same clientContent path as tool results, that his considered answer is ready, and he gives it.
- If the conversation has closed, it waits. It's injected as "Something you owe Simon an answer on" and only mentioned when Simon next starts a conversation. It also appears in the background tasks list and the day report.
- **Never spoken unprompted.**

### B3. Spoken numbers check
- The L1 judge compares numbers and dates in the spoken transcript against the tool results recorded in E3 (weather, reminders, calendar, report sections).
- Mismatches are flagged on the Test bench.

**Final gate:**
- the full L1 suite on all three personas against the Phase 0 baseline;
- the desk wake test;
- A3 latency no worse than baseline for no-tool turns;
- a 2-day real-use check of transcripts.

---

## 9. Rules every phase keeps (checked at each gate)

- **Never speaks unprompted:** D2, C2 and I2 act only inside conversations Simon starts. The A2 fallback clip only plays in a turn Simon started.
- **Recording and MIC MUTED:** total silence. No transcript is stored, no clips, no emotions.
- **Health and running only in reports or when asked:** applies to the profiles (`reportsOnly`), mood reasons, anticipation (K1) and things on his mind (D2).
- **No insulin doses** (except the approved Run Planner estimate) and **no medical disclaimers.**
- **English only, in the active persona's accent**, held through longer tier-3 answers, which is where it slips. The accent judge runs at every gate.
- **No racist or sexist jokes,** including organic wit (H2).
- **Privacy:** transcripts and profiles stay in the local SQLite database, with retention you control and delete buttons on the Persona page.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Longer tier-3 answers slip out of accent | Accent judge at every gate; the accent rule stays last in the prompt. |
| New rules push the prompt back up | A1 budget checked at every gate (instruction tokens under 6k, plus the new sections). |
| History injection (E5) or profiles (E4) slow the first reply | A3 measures it; cap the history at 6 turns and the profiles at about 500 tokens. |
| Pushback (G1) becomes contrarian | L1 pushback scenario includes a *good* plan that must **not** be challenged. |
| Fallback clip (A2) collides with Ims's own holding line | The clip only plays if no audio has gone out since the user's turn. |
| Transcripts hold sensitive talk | Local only, retention setting, per-conversation delete, nothing stored in recording mode. |
| Firmware change (F1) | Built and flashed once, together with any other device changes from this plan; the old 15 s is the default if the server sends nothing. |

---

## 11. Next step

Approve this plan, or change any part of it, and I'll start with **Phase 0**:
- E3 transcripts;
- A3 latency;
- the L1 baseline run.

Each phase ends with its gate results before the next one starts.
