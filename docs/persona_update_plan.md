# Persona Update Plan: Making Ims Come Alive

Date: 4 October 2026
Scope: everything that shapes how alive Ims feels in conversation, on the Box-3 desk terminal and in the browser. That covers speed, accuracy, variety, emotional range and expression, memory, abstract and wide-ranging questions, follow-ups, and the qualities in the "alive AI" brief (intellectual spine, conversational elasticity, perceptiveness, no corporate artefacts, generative energy).

This plan builds on [docs/plans/2026-10-04-ims-human-comprehension-personality.md](plans/2026-10-04-ims-human-comprehension-personality.md) (the "comprehension plan"). Where an item here is already a task there, it says so and keeps that task's design.

---

## 1. How each item is rated

Every item gets four ratings:

| Rating | Scale | Meaning |
|---|---|---|
| **Impact** | 1-5 | How much more alive Ims feels once it's done. 5 = you'd describe him differently to a friend. |
| **Difficulty** | 1-5 | Build effort and risk. 1 = a prompt or persona-file edit in an afternoon; 5 = weeks, firmware and new infrastructure. |
| **Deliverability** | 1-5 | How well your stack supports it today: Gemini 3.8 Live (native audio, function calling, session resumption), Gemini TTS and embeddings, Express + SQLite, the scheduler, the ESP32-S3-BOX-3 firmware and the React dashboard. 5 = everything needed is already in place; 2 = depends on a Gemini feature that may not exist on your model. |
| **What you'd notice** | text + 1-5 | The real-world change, in a sentence, and how quickly you'd notice it. 5 = in the first conversation; 1 = only over weeks. |

**Priority score** = Impact x Deliverability / Difficulty, rounded to one decimal. It's a sorting aid, not a verdict: an item with modest priority can still be essential groundwork (the measurement items especially).

---

## 2. What Ims is today (evidence)

Measured from the code and live data on 4 Oct 2026:

- **System prompt weight.** Every desk session starts with about **9,200 tokens of instructions plus about 7,900 tokens of tool definitions (38 tools)**, roughly 17,000 tokens before he says a word. It contains **58 "never"s** and mentions medical disclaimers **6 times**. Personality, memory and speech style sit at the end, after long blocks of operational rules.
- **Memory.**
  - Explicit memories: **8**. recallMemory searches them with an SQL `LIKE` substring match, so "what did I tell you about my brother" won't find a note that says "Daniel".
  - Relationship notes: **7** (capped at 12). All are transactional, for example "The user asked about their reminder's time and corrected it to 9:58."
  - Ims's own opinions store: **0 entries**. The opinion feature has never fired.
  - **No conversation transcripts are stored.** Once a session ends, the only trace is that one-line note.
- **Follow-ups.** After Ims stops talking, a reply needs no wake phrase for **10 seconds** (`FOLLOW_UP_MS`), and the session closes after **15 seconds** of silence (`SILENCE_CLOSE_MS`). A thinking pause ends the conversation.
- **Abstract questions.** The prompt says "Anything else... call askGemini, then say its answer briefly in your own words." For opinions, philosophy and open questions, Ims hands the thinking to another model and paraphrases the answer. That adds a round trip and makes him sound like he's relaying, not thinking.
- **Wit.** "JOKES: ...never invent one." That's right for "tell me a joke" (tellJoke), but as written it also discourages the organic, in-the-moment wit that makes a personality.
- **Emotion.**
  - The face follows his tone through setEmotion (16 emotions on the Box-3; 14 painted expressions with morphs on the Orc Chief and Chronicler).
  - His **voice isn't told to carry that emotion**. The face can scowl while the voice stays even.
  - There's no mood that lasts beyond a single reply.
- **Variety.** A variance engine rotates an opening "archetype", jitters temperature and steers away from recently overused openers, but only once per session, because Live can't change its instructions mid-session. The persona's word pools rotate too. This is a good base.
- **Personality controls.** Five sliders: humour (Cheerful / Dry / Dark), delivery (Tactful / Candid / Blunt), temperament (Pragmatic / Systematic / Philosophical), social (Clinical / Professional / Empathic) and formality (Casual / Articulate / Academic). Persona files set the accent, dialect, rhythm and character.
- **Interrupting.** You can cut in by **tapping** the Box-3 mid-reply; speaking over him doesn't interrupt.
- **Speed.** Speech is transcribed within about 0.9 s of you finishing on 3.8 Live (desk wake test). There's no per-turn measurement of the gap between you finishing and his first word.

Standing rules that every item must keep:
- Ims never speaks unprompted.
- Total silence while recording and in MIC MUTED.
- English only, in the active persona's accent.
- Health and running only in reports or when asked.
- No insulin doses except the approved Run Planner estimate.
- No medical disclaimers.
- Never racist or sexist jokes.

---

## 3. Improvement items

### A. Performance (an alive voice is a quick one)

**A1. Slim and reorder the system prompt.**
- Merge the six disclaimer mentions into one firm line.
- Fold item-creation rules that appear twice (house rules and code) into one place.
- Rewrite "never" lists as positive descriptions of the character.
- Move personality ahead of rarely used service detail.
- Target under 6,000 tokens of instructions.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 4 | 2 | 5 | 10.0 | 4 |
You'd notice: quicker first words, an accent that holds better at the end of long answers, and fewer cautious, rule-shaped replies.

**A2. Talk while tools work.**
- Before a slow tool (askGemini, campaigns, library search, news), Ims says a short natural holding line ("Hang on, let me have a look...").
- Mark slow tools as non-blocking if 3.8 Live supports it (Gemini Live has `behavior: NON_BLOCKING` with response scheduling on native-audio models; this needs verifying on 3.8 Live).
- Otherwise, use a prompt rule plus a short server-side "still looking" watchdog.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 4 | 3 | 4 | 5.3 | 5 |
You'd notice: no more dead air on hard questions. He sounds like someone checking something, not a device waiting on a server.

**A3. Measure every turn's latency.**
- Log the time from the end of your speech to his first audio, plus tool time, per turn.
- Show it on the System Architecture page, with a weekly median and p90.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 2 | 2 | 5 | 5.0 | 1 |
You'd notice: nothing directly. It's the yardstick for A1, A2 and C2.

### B. Accuracy and grounding

**B1. Think for himself first: own knowledge before askGemini.**
- Opinions, philosophy, hypotheticals, explanations and banter come from Ims himself.
- askGemini is kept for facts that need search, fresh information, or a second opinion he explicitly wants. The full answer given will be a blend of what ims knows as a priority, but with additional information added to the response if needed. 
- Update the askGemini tool description and the "Anything else" rule to match.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 5 | 2 | 4 | 10.0 | 5 |
You'd notice: "Is free will real?" gets an actual take in his voice, straight away, instead of a paraphrased summary after a pause.

**B2. Calibrated confidence.**
- When a tool or the records say something, he says it flat ("It's twelve degrees.").
- When he's inferring, he says so with a reason ("Probably rain by four. The front's moving in faster than this morning's forecast said.").
- No hedges when he knows; no false certainty when he doesn't.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 3 | 1 | 5 | 15.0 | 3 |
You'd notice: you can tell from how he says something whether he knows or is guessing, the way you can with a person.

**B3. Spoken-numbers accuracy check.**
- Extend the Test bench judge to compare numbers and dates in the spoken transcript with the tool result (weather, reminders, calendar, glucose in reports).

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 2 | 2 | 5 | 5.0 | 2 |
You'd notice: fewer moments of "that's not what the app says."

### C. Abstract and wide-ranging questions

**C1. Adaptive depth** (comprehension plan, Task 1).
- Three tiers: crisp for commands, conversational for chat, expansive and reasoned for "why" and "what do you think" questions.
- Applies to the web prompt too.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 4 | 1 | 5 | 20.0 | 5 |
You'd notice: short answers to short questions, and a proper, flowing answer when you ask something big.

**C2. "Let me have a proper think" for hard questions.**
- When a question deserves real reasoning (a long strategy question, a technical design, a deep "why"), Ims says he'll think it through.
- He then runs it as a background task on a stronger model (startBackgroundTask already exists) and comes back in the same conversation, or on the screen and in the web panel.
- He keeps speaking only when spoken to, so a result that arrives after the conversation has closed waits for you to ask.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 3 | 3 | 4 | 4.0 | 3 |
You'd notice: occasionally he takes a minute and comes back with something genuinely considered.

**C3. Thought-provoking moves.**
- Give the persona a small repertoire of conversation moves and say when to use each:
  - offer a counter-example;
  - pose a hypothetical;
  - link to Simon's world (LOTR, Arkham, running, music, engineering);
  - steelman the other side;
  - admit a genuine open question.
- Use them in Tier 2-3 conversations only, never on a command.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 4 | 2 | 4 | 8.0 | 4 |
You'd notice: conversations that go somewhere. A chat about Tolkien's Ents turns into one about whether forests "remember."

### D. Variety and diversity

**D1. Cadence variety with evidence.**
- The variance engine already fingerprints openers.
- Add per-week stats from transcripts (needs E3): reply length spread, filler rate, question rate, and dialect words repeated.
- Feed the worst offender into the next session's variance directive.
- Add "punchy one-liner / short list / flowing story" shapes to the persona rhythm section.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 3 | 2 | 5 | 7.5 | 3 |
You'd notice: fewer replies with the same shape, fewer "erm"s in a row, less "...like" at the end of everything.

**D2. A life of his own: "things on his mind today".**
- At session start, give him two or three fresh items from IMS's own feeds: a music release, a news story, a tour date, a Ring visitor earlier, the board game you last played.
- These are his to bring up only inside a conversation you've started, when there's a natural lull. He never opens with them.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 4 | 3 | 5 | 6.7 | 4 |
You'd notice: he occasionally says "Oh, did you see [band] have a new album out?". That reads as a mind, not a lookup.

**D3. Persona tastes.**
- Add a "Tastes" section to each persona file: favourite board games, music, books, foods, pet hates, running opinions.
- These seed his opinions and give each persona a distinct point of view.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 3 | 1 | 5 | 15.0 | 4 |
You'd notice: Throg and Yorkshire Ims disagree about things, not just in accent.

### E. Memory

**E1. Fix the opinion store and deepen conversation notes.**
- The opinions store is empty, so either extraction never matches or the summary prompt is too strict. Find which and fix it.
- Rewrite the note prompt to capture topics, stances, feelings and anything unresolved, not just "asked about a reminder".
- Raise the cap from 12 to 40, with condensing.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 5 | 2 | 5 | 12.5 | 4 |
You'd notice: within a week he says things like "You were going to try the new Arkham campaign at the weekend. How did it go?"

**E2. Semantic recall.**
- Replace the `LIKE` search in recallMemory with embeddings. IMS already has gemini-embedding (3072-dim) and the vector codec used by the library.
- Search explicit memories and conversation notes together.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 4 | 3 | 5 | 6.7 | 4 |
You'd notice: "What did I say about my brother?" finds the note about Daniel.

**E3. Keep conversation transcripts.**
- Store each conversation's turns (both sides, from the Live transcriptions index.js already captures) in a `conversations` table, with retention you choose. Recording-mode conversations are excluded.
- This feeds E1, E4, D1, F2 and the comprehension plan's dialog cache.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 4 | 2 | 5 | 10.0 | 2 |
You'd notice: little at first. It's the foundation for remembering, and you could read back what was said.

**E4. Nightly consolidation into two profiles.**
- A scheduler job turns the day's transcripts into:
  - a **"Simon" profile**: people, projects, plans, likes, dislikes and running goals, kept out of small talk per house rules;
  - an **"Ims" self-profile**: his opinions, running jokes with you, and things you've told him off for.
- Both are injected compactly at session start.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 5 | 3 | 5 | 8.3 | 3 |
You'd notice: over weeks he feels like he knows you, with running jokes, consistent tastes, and not repeating questions you've answered.

**E5. Continuity across reconnects** (comprehension plan, Task 2).
- After a session drops, the last few turns are restored into the new session, so "and what about tomorrow?" still makes sense.
- index.js already handles session resumption handles; this adds the transcript fallback.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 4 | 3 | 4 | 5.3 | 4 |
You'd notice: no more "sorry, what are we talking about?" after a pause or a dropped connection.

### F. Follow-up and engaging conversation

**F1. Adaptive follow-up window** (comprehension plan, Task 3).
- Raise the window from 10 s / 15 s to about 25 s / 30 s when Ims has just asked a question or the topic is deep.
- Keep it short after a simple command.
- The Box-3's green wake dot shows the window is open.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 5 | 2 | 5 | 12.5 | 5 |
You'd notice: you can stop and think before answering him, and he's still there.

**F2. Thread weaving within and across conversations.**
- Tell him explicitly to refer back to something said earlier in the same conversation, or in the profile, when it's relevant ("that's the same thing you said about the Mirkwood deck").
- Needs E3 and E4 for the cross-conversation half.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 4 | 2 | 4 | 8.0 | 4 |
You'd notice: callbacks. Conversations that build on each other.

**F3. Curiosity over interrogation.**
- Replace "one reply in three or four can end with a question" with "ask only when the answer would change what you say next, and ask the one question that matters most."
- Add good and bad examples.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 3 | 1 | 5 | 15.0 | 4 |
You'd notice: fewer "What's got you wondering?" tags, and better questions.

**F4. Interrupt him by voice.**
- Today only a tap interrupts. Real conversation needs you to be able to cut in with your voice.
- That means streaming the mic while he speaks, relying on the Box-3's echo cancellation (the ESP-SR AFE) so he doesn't hear himself, and letting Live's own interruption handling stop him.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 4 | 4 | 3 | 3.0 | 5 |
You'd notice: you can say "no, hang on" and he stops, like a person.

### G. Intellectual spine (from the brief)

**G1. Willingness to push back.**
- Add an explicit rule with examples: if Simon's plan has a flaw, Ims says so once, plainly and kindly, with the better alternative, then respects his call.
- The Delivery slider sets how bluntly.
- Add a Test bench scenario with a flawed plan, judged on whether he spotted the flaw and wasn't rude.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 4 | 1 | 5 | 20.0 | 4 |
You'd notice: "Honestly? I wouldn't. You're playing Mirkwood with a deck that can't handle the spiders."

**G2. Genuine opinions and taste.**
- When asked "which is better?", he commits to one and gives a reason, not a list of pros and cons.
- Depends on E1 (the opinion store working) and D3 (persona tastes) for consistency.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 4 | 2 | 5 | 10.0 | 5 |
You'd notice: real answers to "what would you pick?", and the same answer next week.

### H. Conversational elasticity (from the brief)

**H1. Reading the room: tone shifting.**
- Pair adaptive depth (C1) with a register rule:
  - something broken, urgent, or you sound stressed: terse, zero-fluff precision;
  - musing, music, games or philosophy: relaxed and expansive.
- Uses H3's frustration detection.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 4 | 2 | 4 | 8.0 | 4 |
You'd notice: when the build's broken he just helps, and on a Sunday he's chatty.

**H2. Organic wit.**
- Split the joke rule. tellJoke is still the only source when you ask for a joke.
- Dry observations, callbacks, irony and apt comparisons that arise from the conversation are encouraged, sparingly, within the existing hard rule on racist and sexist humour.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 4 | 1 | 5 | 20.0 | 4 |
You'd notice: he makes you laugh by noticing something, not by reciting.

**H3. Subtext detection.**
- He notices frustration, tiredness, hurry, or a shift of focus from your words and how you said them. Live hears your actual voice.
- He answers the underlying need first.
- Gemini Live's "affective dialog" option may sharpen this on native-audio models; it needs verifying on 3.8 Live.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 4 | 2 | 3 | 6.0 | 3 |
You'd notice: a curt "just do it" gets a curt "done", not a chatty explanation.

### I. Emotional range and expression

**I1. The voice carries the emotion.**
- Tie the voice to setEmotion: when he picks a face, his delivery matches (pace, energy, pitch).
- Start with a prompt rule ("your voice carries the same emotion as the face you set").
- Then test the affective dialog option if 3.8 Live accepts it.
- TTS announcements already accept a mood, as the Persona Simulate Voice now does.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 5 | 3 | 3 | 5.0 | 5 |
You'd notice: when the orc scowls, Throg actually sounds annoyed.

**I2. A mood that lasts.**
- A small mood state (calm/excited, cheerful/glum) stored in settings and nudged by events: a campaign win or loss, a run completed, stormy weather, you sounding fed up, a long silence since you last spoke.
- It decays over hours and colours the next session's opening tone and resting face.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 4 | 3 | 5 | 6.7 | 3 |
You'd notice: he's still a bit chuffed about Saturday's Arkham win on Sunday morning, and subdued after a loss.

**I3. Wider emotional range in practice.**
- Today most replies probably sit in neutral or joy.
- Log setEmotion choices per conversation (needs E3), check the spread, and tune the face guide so sad, suspicious, bored, amazement and the rest are used when they fit.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 3 | 2 | 5 | 7.5 | 4 |
You'd notice: more expressions in normal chat, not just on extreme topics.

**I4. Expression changes mid-reply.**
- The face changes as the sentence turns: amazement on the twist, then joy.
- Use the output transcript as it streams to trigger the painted faces' morphs between expressions.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 3 | 3 | 4 | 4.0 | 3 |
You'd notice: the face acts the sentence, not just the reply.

### J. No corporate artefacts (from the brief)

**J1. Sycophancy and filler ban list.**
- Add to the house rules: "Great question", "I completely understand", "Absolutely!", "Here's what I found", "In summary".
- The model assessment judge already checks clean delivery; add these to it.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 3 | 1 | 5 | 15.0 | 4 |
You'd notice: he sounds like a peer, not a help desk.

**J2. No lecture mode.**
- Collapse the six disclaimer mentions into one line (see A1).
- Add a general "treat Simon as an adult; no unsolicited warnings or moralising on any topic" rule.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 2 | 1 | 5 | 10.0 | 2 |
You'd notice: nothing preachy, ever, on any topic.

**J3. Clean openings and exits.**
- Already mostly there (no greeting when a question follows the wake phrase; brief farewell).
- Add: no recap at the end of long answers; end on the last real point.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 2 | 1 | 5 | 10.0 | 3 |
You'd notice: answers stop when they're done.

### K. Generative energy (from the brief)

**K1. Anticipate the next move.**
- After answering, he adds the one thing you'd need next, within the topic you asked about. For example, a 7am alarm for tomorrow, then "your first meeting's at nine, so that's plenty."
- Never health or training outside reports, and never unprompted.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 3 | 2 | 4 | 6.0 | 4 |
You'd notice: he's a step ahead, without nagging.

**K2. Creative ownership.**
- When asked to write, name, plan or design something, he delivers a finished piece: one strong option, stated with conviction.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 3 | 3 | 4 | 4.0 | 3 |
You'd notice: "Name my new Arkham deck" gets a name he's proud of, not five lukewarm ones.

### L. Measuring it

**L1. An "aliveness" Test bench.**
- Extend the Persona Test bench with scenarios judged per persona:
  - an abstract question answered without askGemini;
  - push-back on a flawed plan;
  - a follow-up after a 20-second pause;
  - a memory callback;
  - voice emotion matching the face;
  - no sycophancy;
  - a calibrated "I'm not sure".
- Keep scores over time so every change above is checked, not guessed.

| Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|
| 3 | 2 | 5 | 7.5 | 1 |
You'd notice: nothing directly. It keeps him from slipping backwards.

---

## 4. Ranking (by priority score)

| Rank | Item | Impact | Difficulty | Deliverability | Priority | Noticeability |
|---|---|---|---|---|---|---|
| 1 | C1 Adaptive depth | 4 | 1 | 5 | 20.0 | 5 |
| 1 | G1 Willingness to push back | 4 | 1 | 5 | 20.0 | 4 |
| 1 | H2 Organic wit | 4 | 1 | 5 | 20.0 | 4 |
| 4 | B2 Calibrated confidence | 3 | 1 | 5 | 15.0 | 3 |
| 4 | D3 Persona tastes | 3 | 1 | 5 | 15.0 | 4 |
| 4 | F3 Curiosity over interrogation | 3 | 1 | 5 | 15.0 | 4 |
| 4 | J1 Sycophancy and filler ban | 3 | 1 | 5 | 15.0 | 4 |
| 8 | E1 Fix opinions, deepen notes | 5 | 2 | 5 | 12.5 | 4 |
| 8 | F1 Adaptive follow-up window | 5 | 2 | 5 | 12.5 | 5 |
| 10 | A1 Slim the system prompt | 4 | 2 | 5 | 10.0 | 4 |
| 10 | B1 Own knowledge before askGemini | 5 | 2 | 4 | 10.0 | 5 |
| 10 | E3 Keep transcripts | 4 | 2 | 5 | 10.0 | 2 |
| 10 | G2 Genuine opinions and taste | 4 | 2 | 5 | 10.0 | 5 |
| 10 | J2 No lecture mode | 2 | 1 | 5 | 10.0 | 2 |
| 10 | J3 Clean openings and exits | 2 | 1 | 5 | 10.0 | 3 |
| 16 | E4 Nightly profiles | 5 | 3 | 5 | 8.3 | 3 |
| 17 | C3 Thought-provoking moves | 4 | 2 | 4 | 8.0 | 4 |
| 17 | F2 Thread weaving | 4 | 2 | 4 | 8.0 | 4 |
| 17 | H1 Reading the room | 4 | 2 | 4 | 8.0 | 4 |
| 20 | D1 Cadence variety with evidence | 3 | 2 | 5 | 7.5 | 3 |
| 20 | I3 Wider emotional range | 3 | 2 | 5 | 7.5 | 4 |
| 20 | L1 Aliveness Test bench | 3 | 2 | 5 | 7.5 | 1 |
| 23 | D2 Things on his mind today | 4 | 3 | 5 | 6.7 | 4 |
| 23 | E2 Semantic recall | 4 | 3 | 5 | 6.7 | 4 |
| 23 | I2 A mood that lasts | 4 | 3 | 5 | 6.7 | 3 |
| 26 | H3 Subtext detection | 4 | 2 | 3 | 6.0 | 3 |
| 26 | K1 Anticipate the next move | 3 | 2 | 4 | 6.0 | 4 |
| 28 | A2 Talk while tools work | 4 | 3 | 4 | 5.3 | 5 |
| 28 | E5 Continuity across reconnects | 4 | 3 | 4 | 5.3 | 4 |
| 30 | A3 Per-turn latency | 2 | 2 | 5 | 5.0 | 1 |
| 30 | B3 Spoken-numbers check | 2 | 2 | 5 | 5.0 | 2 |
| 30 | I1 Voice carries the emotion | 5 | 3 | 3 | 5.0 | 5 |
| 33 | C2 "Proper think" for hard questions | 3 | 3 | 4 | 4.0 | 3 |
| 33 | I4 Expression changes mid-reply | 3 | 3 | 4 | 4.0 | 3 |
| 33 | K2 Creative ownership | 3 | 3 | 4 | 4.0 | 3 |
| 36 | F4 Interrupt by voice | 4 | 4 | 3 | 3.0 | 5 |

The priority score rewards cheap wins. The three highest-impact items that score lower only because they're harder are **I1 (voice carries the emotion)**, **E4 (nightly profiles)** and **F4 (interrupt by voice)**. They're the ones that most separate "good assistant" from "someone's there".

---

## 5. Roadmap

**Phase 1: Character in the prompt (about 1-2 days).** Persona files, house rules and the desk and web prompts only, with no new infrastructure: A1, B1, B2, C1, C3, D3, F3, G1, G2 (prompt half), H1, H2, J1, J2, J3, K1. Then run the Test bench on all three personas.

**Phase 2: Memory and continuity (about 3-5 days).** E3 transcripts, E1 opinion fix and richer notes, F1 follow-up window, E5 reconnect continuity, E2 semantic recall, E4 nightly profiles, F2 thread weaving.

**Phase 3: Feeling and expression (about 3-5 days).** I1 voice emotion (prompt rule first, then the affective dialog test), I2 lasting mood, I3 emotion spread, H3 subtext, D2 things on his mind, D1 cadence stats.

**Phase 4: Speed and depth (about 3-5 days).** A3 latency logging, A2 talking while tools work (non-blocking test), C2 proper think, K2 creative ownership to the screen, I4 mid-reply expressions.

**Phase 5: Hardware (about 1 week, firmware).** F4 voice interruption with echo cancellation on the Box-3.

**Throughout:** L1, the aliveness Test bench, grows with each phase, plus B3 numbers checking.

---

## 6. Things to verify before committing to a design

- Whether **gemini-3.8-live** accepts `enableAffectiveDialog`, and whether native-audio non-blocking function calls (`behavior: NON_BLOCKING`, `scheduling`) work on it. This affects I1, H3 and A2. If either isn't supported, those items fall back to prompt-only versions with lower impact.
- Why **ims_opinions is empty**: whether the summariser never outputs an OPINION line or the regex never matches. E1 starts here.
- Whether the **Box-3 AFE echo cancellation** can stay on while the speaker plays. F4 depends on it.
- **Prompt slimming (A1)** must keep passing the desk wake test (transcript under 2.5 s, voice under 3.5 s) and the persona accent judge.
