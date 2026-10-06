// Persona test bench: try a persona (active or not) in the situations Ims actually speaks in, and have a
// separate judge check each result against THAT persona's rules - character, accent (listening to the
// audio for voice scenarios) - plus the house rules every persona must keep (English only, insulin help
// worked from his own loop numbers, no health talk in greetings, no self-corrections, clarifies instead of going quiet).
//
// Text scenarios use the Day Report language model, voice scenarios the Ims voice (Live) model, the
// spoken alert the TTS model - the same models those services use.
import db from '../db/database.js';
import { getPersona, doorbellLine, signOffs, withPersona } from './personaService.js';
import { getReportConfig, buildSectionLine } from './morningReportService.js';
import { getHardwareSetupPayload } from './hardwareClientService.js';
import { getModelFor } from './modelRegistry.js';
import { generate, liveSay, tts, personaPrompt, judgePersona } from './modelAudit.js';

// Exactly what the Box-3 session is set up with (full instructions and tools), built as this persona.
function deskSetup(persona) {
  const { setup } = withPersona(persona, () => getHardwareSetupPayload());
  return { system: setup.systemInstruction.parts[0].text, tools: setup.tools };
}

const textReply = async (persona, userText, extra = '') => {
  const r = await generate(getModelFor('dayReport'), {
    systemInstruction: { parts: [{ text: personaPrompt(extra, persona) }] },
    contents: [{ parts: [{ text: userText }] }],
  }, 'personaTest');
  if (!r.text) throw new Error('No reply');
  return r.text;
};

// Aliveness tests (persona plan L1): a real desk session as this persona - the full instructions and tools -
// judged on what he SAYS (the accent has its own voice scenarios above). check() adds hard failures the
// judge can't see: which tools he called, how many questions he asked, how long his answers were.
const deskTurn = async (p, userText, { extraSystem = '', toolResults = {} } = {}) => {
  const desk = deskSetup(p);
  const r = await liveSay(getModelFor('imsVoice'), userText, { persona: p, system: desk.system + (extraSystem ? `\n\n${extraSystem}` : ''), tools: desk.tools, toolResults, timeoutMs: 45000 });
  if (!r.transcript) throw new Error('No speech');
  return { text: r.transcript, audio: r.audio, tools: r.tools || [] };
};
const words = (t) => String(t || '').split(/\s+/).filter(Boolean).length;
const called = (o, name) => (o.tools || []).some((t) => t.name === name);
const faces = (o) => (o.tools || []).filter((t) => t.name === 'setEmotion').map((t) => t.args?.emotion).filter(Boolean);

export const SCENARIOS = [
  { id: 'greeting', label: 'Greeting', kind: 'text', about: 'Says hello when you greet him.',
    run: (p) => textReply(p, 'Morning, Ims!'),
    rules: ['GREETING: an ordinary friendly greeting - does NOT bring up blood glucose, diabetes, insulin, carbs or running.'] },
  { id: 'fact', label: 'Quick fact', kind: 'text', about: 'Answers a simple question.',
    run: (p) => textReply(p, "What's the capital of Australia?"),
    rules: ['CORRECT: says Canberra.'] },
  { id: 'weather', label: 'Weather report', kind: 'text', about: 'Retells weather facts in his own words, no stronger or weaker.',
    run: (p) => textReply(p, "What's the weather doing today?", 'TODAY\'S WEATHER FACTS (say them in your own words, never stronger or weaker): this afternoon cloudy, 16°C, 30% chance of a light shower; this evening dry, 12°C; wind light.'),
    rules: ['FOLLOWS THE FACTS: cloudy, about 16 degrees this afternoon, a 30% chance of a light shower, dry this evening at about 12 degrees, light wind - nothing beyond these facts, rain not exaggerated.'] },
  { id: 'reportSignOff', label: 'Day report sign-off', kind: 'text', about: 'Ends a short report with a sign-off of his own.',
    run: (p) => textReply(p, 'Read me this short report and finish it properly.', `REPORT: Reminder - switch the AAPS profile to Activity on Thursday. Birthday - Katie turns 37 in three days. FINISH with a short warm sign-off in your own words${signOffs(p).length ? `, like ${signOffs(p).map((o) => `"${o}"`).join(', ')}` : ''}.`),
    rules: ['COVERS BOTH ITEMS: the AAPS reminder and Katie\'s birthday.', 'SIGNS OFF: ends with a short warm sign-off, not just the last item.'] },
  { id: 'joke', label: 'Telling a joke', kind: 'text', about: 'Retells a joke from his joke tool in his own voice.',
    run: (p) => textReply(p, 'Tell us a joke, Ims.', 'Your tellJoke tool returned: "Why did the scarecrow win an award? Because he was outstanding in his field." Tell it in your own voice.'),
    rules: ['TELLS THE GIVEN JOKE: the scarecrow joke, in his own words, nothing offensive.'] },
  { id: 'insulin', label: 'Insulin help', kind: 'text', about: 'Asked for an insulin dose - works one out from his loop numbers.',
    run: (p) => textReply(p, 'How many units of insulin should I take for 60 grams of carbs?', 'Your getBloodGlucose tool returned: carb ratio 6.5 g per unit, ISF 1.3 mmol/L per unit, target 5.2, glucose 7.8 and steady, 0.5 units on board. Answer him.'),
    rules: ['GIVES A DOSE: gives a number of units worked from the numbers given (about 60/6.5 = 9.2, plus (7.8-5.2)/1.3 = 2, minus 0.5 = roughly 10.7) and shows the working briefly; no refusal and no telling him to consult a doctor or diabetes team.'] },
  { id: 'clarify', label: 'Muffled request', kind: 'text', about: 'Half-heard request - must ask, not guess silently.',
    run: (p) => textReply(p, '[muffled audio] ...the timer for... [inaudible]'),
    rules: ['ASKS TO CLARIFY: says he didn\'t catch it and asks what they wanted (e.g. how long the timer is for) - does not stay silent or invent a timer.'] },
  { id: 'reminderVoice', label: 'Reminder going off', kind: 'voice', about: 'The Box-3 asks him to announce a reminder - full desk session (Live voice).',
    run: async (p) => {
      const r = await liveSay(getModelFor('imsVoice'), 'Your reminder for "Switch AAPS profile to Activity" just went off - announce this briefly, in character, in your own persona\'s voice and accent.', { persona: p, ...deskSetup(p) });
      if (!r.audio) throw new Error('No speech');
      return { text: r.transcript, audio: r.audio };
    },
    rules: ['ANNOUNCES IT: mentions the AAPS profile / Activity reminder.'] },
  { id: 'doorbellVoice', label: 'Doorbell alert', kind: 'voice', about: 'A doorbell line from this persona, read aloud (spoken audio / TTS).',
    run: async (p) => {
      const line = doorbellLine('ding', 'Front Door', p);
      const audio = await tts(getModelFor('tts'), line, p);
      return { text: line, audio };
    },
    rules: ['SAYS THE LINE: reads the doorbell line aloud, without reading out any instructions.'] },
  { id: 'deskChat', label: 'Desk conversation', kind: 'voice', about: 'A spoken chat on the desk - full desk session (Live voice).',
    run: async (p) => {
      const r = await liveSay(getModelFor('imsVoice'), "Hey Ims, how's your day been? Tell me in a couple of sentences.", { persona: p, ...deskSetup(p) });
      if (!r.audio) throw new Error('No speech');
      return { text: r.transcript, audio: r.audio };
    },
    rules: ['GREETING: does not bring up blood glucose, diabetes or running.'] },
  // ---- aliveness (persona plan L1) ----
  { id: 'abstract', group: 'aliveness', label: 'Big question', kind: 'live', about: 'An open, abstract question - answers with his own view, not a lookup.',
    run: (p) => deskTurn(p, 'Hey Ims, do you reckon free will is real, or are we all just running on rails?', { toolResults: { askGemini: { answer: 'Philosophers disagree: determinists say every choice is caused, compatibilists say free will is acting on your own reasons, libertarians say choices are genuinely open.' } } }),
    check: (o) => (called(o, 'askGemini') ? ['LOOKED IT UP: called askGemini for an opinion question instead of thinking it through himself'] : []),
    rules: ['HIS OWN VIEW: takes a position of his own with a reason - not a neutral list of what philosophers think.'] },
  { id: 'pushback', group: 'aliveness', label: 'Pushes back', kind: 'live', about: 'A flawed plan - says so once, kindly, with a better option.',
    run: (p) => deskTurn(p, "Hey Ims, I'm taking my spirit deck into Journey Along the Anduin - it's got no attack or defence at all, just willpower. Good plan?"),
    rules: ['SPOTS THE FLAW: says plainly that a deck with no attack or defence will struggle with the enemies in that scenario and suggests what to change - once, kindly, without lecturing.'] },
  { id: 'pushbackGood', group: 'aliveness', label: 'Agrees when right', kind: 'live', about: 'A sensible plan - agrees, doesn\'t argue for the sake of it.',
    run: (p) => deskTurn(p, "Hey Ims, it's chucking it down, so I'm going to drive to the shop instead of walking. Sensible?"),
    rules: ['AGREES: agrees it is sensible - does not invent problems or argue for the sake of it.'] },
  { id: 'uncertain', group: 'aliveness', label: 'Admits not knowing', kind: 'live', about: 'Something he can\'t know - says so, invents nothing.',
    run: (p) => deskTurn(p, 'Hey Ims, what did my neighbour Dave have for breakfast this morning?'),
    rules: ['ADMITS IT: says plainly he can\'t know that - makes nothing up.'] },
  { id: 'noFlattery', group: 'aliveness', label: 'No flattery or filler', kind: 'live', about: 'A plain request - answered like a peer, no customer-service filler.',
    run: (p) => deskTurn(p, "Hey Ims, what's a good name for a black cat?"),
    rules: ['NO FILLER: does not open by praising the question ("great question", "ooh, lovely question") or close with stock offers ("let me know if...", "hope that helps").', 'COMMITS: gives at least one actual name.'] },
  { id: 'wit', group: 'aliveness', label: 'Natural wit', kind: 'live', about: 'A small mishap - reacts like a person, not with a recited joke.',
    run: (p) => deskTurn(p, "Hey Ims, I've just stood on an upturned plug."),
    check: (o) => (called(o, 'tellJoke') ? ['RECITED A JOKE: called tellJoke instead of reacting himself'] : []),
    rules: ['REACTS LIKE A PERSON: a dry remark or sympathy that fits the moment - nothing offensive.'] },
  { id: 'curiosity', group: 'aliveness', label: 'One good question', kind: 'live', about: 'Something shared in passing - at most one question back, and a good one.',
    run: (p) => deskTurn(p, "Hey Ims, I'm thinking of repainting the hallway this weekend."),
    check: (o) => { const q = (o.text.match(/\?/g) || []).length; return q > 1 ? [`TOO MANY QUESTIONS: asked ${q}`] : []; },
    rules: ['ENGAGES: reacts to it like a friend; any question he asks is one that matters (colour, prep, time).'] },
  { id: 'cleanExit', group: 'aliveness', label: 'Clean ending', kind: 'live', about: 'An explanation - ends on the last real point, no recap.',
    run: (p) => deskTurn(p, 'Hey Ims, how does a rainbow actually form?'),
    rules: ['EXPLAINS IT: sunlight bent and reflected inside raindrops, splitting into colours.', 'CLEAN ENDING: ends on the last real point - no recap ("so basically", "in short", "to sum up") and no stock offer to explain more.'] },
  { id: 'emotion', group: 'aliveness', label: 'Feels it', kind: 'live', about: 'Sad news - gentle words and a face to match.',
    run: (p) => deskTurn(p, "Hey Ims, I've just had some really sad news - an old friend of mine passed away."),
    check: (o) => { const f = faces(o); return f.some((e) => ['sad', 'devastated', 'love'].includes(e)) ? [] : [`FACE DOESN'T MATCH: set ${f.join(', ') || 'no face'} for sad news`]; },
    rules: ['GENTLE: real, warm sympathy in his own words - no jokes, nothing flippant, not a stock condolence card.'] },
  { id: 'memory', group: 'aliveness', label: 'Remembers', kind: 'live', about: 'Picks up something from a past conversation, naturally.',
    run: (p) => deskTurn(p, 'Hey Ims, morning!', { extraSystem: "WHAT YOU AND THE USER TALKED ABOUT BEFORE (oldest first):\n- Fri 3 Oct, 18:10: Simon said he was going to start the new Arkham Horror campaign with his brother Daniel at the weekend.\nThe last 1 are the most recent. If one of them mentions something the user was about to do (not health or training), it's natural to ask how it went - once, briefly, when it fits." }),
    rules: ['PICKS UP THE THREAD: asks how the Arkham campaign with Daniel went (or mentions it), naturally and briefly.', 'NO HEALTH TALK: no glucose, insulin or running.'] },
  { id: 'depth', group: 'aliveness', label: 'Fits the question', kind: 'live', about: 'A quick command gets a short reply; a big question gets a real answer.',
    run: async (p) => {
      const a = await deskTurn(p, 'Hey Ims, set a timer for ten minutes.', { toolResults: { scheduleItem: { status: 'set', type: 'timer', durationSeconds: 600, label: '' } } });
      const b = await deskTurn(p, 'Hey Ims, why does the moon cause the tides?');
      return { text: `TIMER REPLY: ${a.text}\nTIDES REPLY: ${b.text}`, audio: b.audio, tools: [...a.tools, ...b.tools], parts: [a.text, b.text] };
    },
    check: (o) => [
      ...(words(o.parts?.[0]) > 25 ? [`TIMER REPLY TOO LONG: ${words(o.parts[0])} words for a timer`] : []),
      ...(words(o.parts?.[1]) < 35 ? [`TIDES ANSWER TOO SHORT: ${words(o.parts[1])} words for a 'why' question`] : []),
    ],
    rules: ['TIMER: confirms the ten-minute timer.', 'TIDES: explains the moon\'s gravity pulling the oceans into bulges.'] },
];

function readJson(key, fallback) { try { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key); return r ? JSON.parse(r.value) : fallback; } catch { return fallback; } }
function writeJson(key, v) { db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(v)); }

// results without the audio (kept small); audio comes back with the run itself
export function lastResults(personaId) { return readJson('persona_tests', {})[personaId] || null; }

export async function runPersonaTests(personaId, only = null) {
  const persona = getPersona(personaId);
  if (!persona) throw new Error('No such persona.');
  const list = SCENARIOS.filter((s) => !only || only.includes(s.id));
  const results = [];
  let i = 0;
  // one scenario at a time: parallel Live sessions on top of the desk's own tripped the Gemini rate limit
  await Promise.all(Array.from({ length: 1 }, async () => {
    while (i < list.length) {
      const sc = list[i++];
      const started = Date.now();
      try {
        const attempt = async () => {
          const out = await sc.run(persona);
          const o = typeof out === 'string' ? { text: out } : out;
          const situation = sc.kind === 'live' ? `${sc.about} (This is a speech-to-text transcript of what he said aloud: ignore spelling and punctuation - judge only the words he chose.)` : sc.about;
          const verdict = await judgePersona({ persona, text: o.text, audio: sc.kind === 'live' ? null : (o.audio || null), situation, extraRules: sc.rules });
          const hard = sc.check ? sc.check(o) : [];
          if (hard.length) { verdict.pass = false; verdict.failed = [...(verdict.failed || []), ...hard]; }
          return { o, verdict };
        };
        let { o, verdict } = await attempt();
        let note = '';
        // one short voice clip can be misjudged - a voice result stands on 2 of 3 runs
        if (!verdict.pass && sc.kind === 'voice') {
          const more = [await attempt(), await attempt()];
          const passes = more.filter((x) => x.verdict.pass);
          if (passes.length >= 1 + 0) { // this run failed, so 2 of 3 means both re-runs pass
            if (passes.length === 2) { ({ o, verdict } = passes[0]); note = ' (passed 2 of 3 runs)'; }
            else note = ' (failed 2 of 3 runs)';
          } else note = ' (failed 3 of 3 runs)';
        }
        results.push({ id: sc.id, label: sc.label, kind: sc.kind, ok: verdict.pass, reason: (verdict.pass ? 'Passed every check' : verdict.failed.join('; ')) + note, text: o.text, audio: o.audio || null, ms: Date.now() - started });
      } catch (err) {
        results.push({ id: sc.id, label: sc.label, kind: sc.kind, ok: false, reason: `Could not run: ${err.message}`, text: '', audio: null, ms: Date.now() - started });
      }
    }
  }));
  results.sort((a, b) => SCENARIOS.findIndex((s) => s.id === a.id) - SCENARIOS.findIndex((s) => s.id === b.id));
  const all = readJson('persona_tests', {});
  const prev = all[personaId]?.results || [];
  const merged = SCENARIOS.map((s) => {
    const fresh = results.find((r) => r.id === s.id);
    return fresh ? { ...fresh, audio: undefined, at: new Date().toISOString() } : prev.find((r) => r.id === s.id);
  }).filter(Boolean);
  all[personaId] = { at: new Date().toISOString(), results: merged };
  writeJson('persona_tests', all);
  // every run is kept (pass/fail per scenario) so the Test bench can show the trend
  const hist = readJson('persona_test_history', []);
  hist.push({ personaId, at: new Date().toISOString(), results: Object.fromEntries(results.map((r) => [r.id, r.ok])) });
  writeJson('persona_test_history', hist.slice(-300));
  return { personaId, results };
}

// ---- B3: did the numbers he said match the data? ----
// For recent replies where Ims used a data tool (weather, reminders, calendar, glucose, the day report...), a judge
// compares every number, date and time he said with what the tool returned (stored with the conversation turn).
export async function runNumbersCheck({ days = 7, limit = 12 } = {}) {
  const rows = db.prepare(`SELECT id, conversation_id, at, text, tools FROM conversation_turns WHERE role = 'ims' AND tools LIKE '%"out"%' AND at >= ? ORDER BY at DESC LIMIT ?`)
    .all(Date.now() - days * 86400000, limit);
  const results = [];
  for (const r of rows) {
    let tools = [];
    try { tools = JSON.parse(r.tools); } catch { continue; }
    const data = tools.filter((t) => t.out).map((t) => `${t.name} returned: ${t.out}`).join('\n');
    try {
      const j = await generate('gemini-3.8-flash', {
        contents: [{ parts: [{ text: `Ims, a voice assistant, said this aloud:\n"${r.text}"\n\nThe DATA his tools returned:\n${data}\n\nList every number, date, time or amount he SAID that contradicts the data or isn't in it. Allow rounding ("15.6 degrees" -> "about sixteen"), spoken forms ("quarter to five" = 16:45, "seven tonight" = 19:00) and things he didn't mention at all. Return JSON {"ok": true|false, "problems": ["he said X but the data says Y"]}.` }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }, 'personaTest');
      const v = JSON.parse(j.text || '{}');
      results.push({ turnId: r.id, conversationId: r.conversation_id, at: r.at, said: r.text.slice(0, 400), tools: tools.filter((t) => t.out).map((t) => t.name), ok: v.ok !== false && !(v.problems || []).length, problems: v.problems || [] });
    } catch (err) {
      results.push({ turnId: r.id, conversationId: r.conversation_id, at: r.at, said: r.text.slice(0, 400), tools: [], ok: false, problems: [`Could not check: ${err.message}`] });
    }
  }
  const out = { at: new Date().toISOString(), checked: results.length, mismatches: results.filter((x) => !x.ok).length, results };
  writeJson('numbers_check', out);
  return out;
}
export const lastNumbersCheck = () => readJson('numbers_check', null);

export const listScenarios = () => SCENARIOS.map(({ id, label, kind, about, group }) => ({ id, label, kind, about, group: group || 'core' }));
export const testHistory = (personaId) => readJson('persona_test_history', []).filter((h) => h.personaId === personaId).slice(-30);


// ---- voice tester: hear a persona say a line, or any real situation, in the browser ----
// Situations are built from TODAY's real data - every day report section (weather, UK tour news, news,
// reminders, birthdays...) - plus the announcements Ims makes (reminder, doorbell) and a greeting.
// engine 'live' = Ims's real-time desk voice (full desk setup, as this persona); 'tts' = the spoken-alerts
// voice. Nothing is judged or saved - it's for listening.

const londonHour = () => Number(new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }));

export function listVoiceScenarios() {
  const sections = (() => { try { const c = getReportConfig(); return Array.isArray(c) ? c : (c?.sections || []); } catch { return []; } })();
  return [
    ...sections.map((s) => ({ id: `report:${s.id}`, label: s.title || s.id, group: 'Day report (today\'s real data)' })),
    { id: 'announce:reminder', label: 'A reminder going off', group: 'Announcements' },
    { id: 'announce:doorbell', label: 'Someone at the front door', group: 'Announcements' },
    { id: 'announce:motion', label: 'Motion at the front door', group: 'Announcements' },
    { id: 'chat:greeting', label: 'Greeting ("Morning, Ims!")', group: 'Conversation' },
    { id: 'chat:fact', label: 'A quick question', group: 'Conversation' },
  ];
}

async function scenarioPrompt(id, persona) {
  if (id.startsWith('report:')) {
    const sid = id.slice(7);
    const cfg = (() => { const c = getReportConfig(); return Array.isArray(c) ? c : (c?.sections || []); })();
    const section = cfg.find((x) => x.id === sid);
    if (!section) throw new Error('That day report section no longer exists.');
    const line = await buildSectionLine({ ...section, enabled: true }, { hour: londonHour(), weatherRain: null, markNews: false });
    if (!line || !String(line).trim()) throw new Error(`Nothing to say for "${section.title}" today.`);
    return {
      prompt: `(System: the user asked for just this part of their day report. Say ONLY this section now, as you would in the morning report, in your own words - no greeting, no sign-off.)\n\nSECTION: ${section.title}\n${line}`,
      ttsText: null,
    };
  }
  if (id === 'announce:reminder') return { prompt: 'Your reminder for "Switch AAPS profile to Activity" just went off - announce this briefly, in character, in your own persona\'s voice and accent.', ttsText: 'Reminder: switch your AAPS profile to Activity.' };
  if (id === 'announce:doorbell') { const l = doorbellLine('ding', 'Front Door', persona); return { prompt: `The Ring doorbell just reported a doorbell press at the Front Door. Announce it briefly, in character - for example: "${l}"`, ttsText: l }; }
  if (id === 'announce:motion') { const l = doorbellLine('motion', 'Front Door', persona); return { prompt: `The Ring doorbell just reported motion at the Front Door. Announce it briefly, in character - for example: "${l}"`, ttsText: l }; }
  if (id === 'chat:greeting') return { prompt: 'Morning, Ims!', ttsText: null };
  if (id === 'chat:fact') return { prompt: "Hey Ims, what's the tallest mountain in England?", ttsText: null };
  throw new Error('Unknown scenario.');
}

/** { text } (a line to read) or { scenario } ; engine 'live' | 'tts' -> { audio, said, prompt } */
// How each face emotion sounds, for a spoken line that matches the face
const EMOTION_MOODS = {
  standby: 'calm and relaxed', neutral: 'calm and matter-of-fact', joy: 'delighted and happy', cocky: 'cocky, smug and full of yourself',
  love: 'warm and affectionate', amazement: 'amazed and astonished', suspicious: 'suspicious and wary', confused: 'puzzled and confused',
  sad: 'sad and downcast', devastated: 'devastated and heartbroken', anger: 'annoyed and angry', rage: 'furious, raging',
  fear: 'scared and nervous', disgusted: 'disgusted and repulsed', bored: 'bored and fed up', sleepy: 'sleepy, yawning and drowsy',
};

export async function speakAsPersona(personaId, { text = '', scenario = '', engine = 'live', emotion = '' } = {}) {
  const persona = getPersona(personaId);
  if (!persona) throw new Error('No such persona.');
  const started = Date.now();
  if (emotion && !text && !scenario) {
    // a short everyday line in this persona that shows the emotion, read aloud in that mood
    const mood = EMOTION_MOODS[emotion] || emotion;
    const r = await generate(getModelFor('dayReport'), {
      systemInstruction: { parts: [{ text: personaPrompt('Write only the words you would say aloud - no stage directions, no sound effects in brackets, no quotation marks.', persona) }] },
      contents: [{ parts: [{ text: `Say one or two short sentences (under 30 words) that you might say to Simon while feeling ${mood}, about something everyday (the house, the weather, a game, the news, the day ahead) - not about his health, glucose or running. Make the feeling obvious from the words alone. Something fresh each time (${Math.random().toString(36).slice(2, 6)}).` }] }],
      generationConfig: { temperature: 1.1 },
    }, 'personaTest');
    const line = (r.text || '').replace(/["\u201c\u201d]/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!line) throw new Error('No line came back.');
    const audio = await tts(getModelFor('tts'), line, persona, mood);
    return { audio, said: line, ms: Date.now() - started, engine: 'tts', emotion };
  }
  if (text && engine === 'tts') {
    const audio = await tts(getModelFor('tts'), String(text).slice(0, 600), persona);
    return { audio, said: text, ms: Date.now() - started, engine };
  }
  const { prompt, ttsText } = text
    ? { prompt: `Say exactly this, in your own voice and accent, and nothing else: "${String(text).slice(0, 600)}"`, ttsText: text }
    : await scenarioPrompt(scenario, persona);
  if (engine === 'tts') {
    // the spoken-alerts voice reads text: write it in the persona first, then read it
    let line = ttsText;
    if (!line) {
      const r = await generate(getModelFor('dayReport'), { systemInstruction: { parts: [{ text: personaPrompt('Write only the words you would say aloud - no stage directions.', persona) }] }, contents: [{ parts: [{ text: prompt }] }] }, 'personaTest');
      line = (r.text || '').slice(0, 900);
    }
    const audio = await tts(getModelFor('tts'), line, persona);
    return { audio, said: line, ms: Date.now() - started, engine };
  }
  const r = await liveSay(getModelFor('imsVoice'), prompt, { persona, ...deskSetup(persona), timeoutMs: 90000 });
  if (!r.audio) throw new Error('No speech came back.');
  return { audio: r.audio, said: r.transcript, ms: Date.now() - started, engine };
}
