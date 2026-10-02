// One place for every AI model IMS uses (Phase 4, Dev Idea #47).
//
//  - SERVICES: each part of IMS that calls a model, the kind of model it needs and its default.
//  - The user's choice per service lives in settings ('model_selection') with the model it
//    replaced, so a bad switch can be rolled back in one click.
//  - The catalogue is the live list from the Gemini API for this key (cached), described in plain
//    words: what each model is for, cost, depth, speed and how settled it is.
//  - A model is only switched to after a tiny test call succeeds - the API lists some models that
//    then answer "no longer available to new users".
//
// geminiClient.js asks resolveModel() on every call, so a switch takes effect on the next request
// with no restart. Live voice sessions pick it up on their next setup.
import WebSocket from 'ws';
import db from '../db/database.js';
import config from '../config.js';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const apiKey = () => process.env.GEMINI_API_KEY || config.gemini.apiKey;

// kind: text | live | tts | image | embedding
export const SERVICES = [
  { key: 'chat', recommended: 'gemini-3.8-flash', recommendedWhy: 'The newest stable Flash: noticeably better than 2.5 Flash at answering from long passages of your library and citing them, at the same everyday tier. Stable, so answers stay consistent.', label: 'Library chat', kind: 'text', default: config.gemini.chatModels.flash, files: ['chatService.js'], matchDefault: true,
    use: 'Answers questions about your PDF library (Flash tier in the chat model picker).' },
  { key: 'chatDeep', recommended: 'gemini-2.5-pro', recommendedWhy: 'The only stable Pro model your key offers. Gemini 3.1 Pro reasons better but is a Preview (can change or be withdrawn) - when you pick Pro you want the careful answer you can rely on, so stable wins for now.', label: 'Library chat - Pro & Research tiers', kind: 'text', default: config.gemini.chatModels.pro, files: ['chatService.js'], matchDefault: true,
    use: 'The deeper chat tiers you pick in the chat model picker.' },
  { key: 'dayReport', recommended: 'gemini-3.8-flash', recommendedWhy: 'The day report is a script read aloud every morning: it needs good writing, close following of your section sliders and the Yorkshire persona rules. 3.8 Flash does that better than 2.5 and one report a day costs pennies.', label: 'Day Report', kind: 'text', default: 'gemini-2.5-flash', files: ['morningReportService.js'],
    use: 'Writes the morning report script, the per-section examples and the preview.' },
  { key: 'imsHelpers', recommended: 'gemini-3.8-flash', recommendedWhy: 'The Google Search fallback has to search, read and answer in one go while Ims waits - 3.8 Flash handled a live search in about 4 s and gives fuller, more current answers than 2.5. Stable.', label: 'Ims helpers & Google Search fallback', kind: 'text', default: 'gemini-2.5-flash', files: ['imsFallbackService.js', 'hardwareClientService.js', 'tasksService.js', 'aiTextService.js'],
    use: 'Answers Ims looks up with Google Search when his own tools fall short, task titles and short texts.' },
  { key: 'running', recommended: 'gemini-3.8-flash', recommendedWhy: 'Run debriefs and glucose-on-the-run insights mix numbers, timings and health context; the newer Flash is more careful with figures. Stable matters here because it feeds health advice.', label: 'Running & Run Planner', kind: 'text', default: 'gemini-2.5-flash', files: ['runInsightService.js', 'runGlucoseService.js', 'goalService.js', 'stravaService.js'],
    use: 'Run debriefs, glucose-on-the-run insights, goals and Strava summaries.' },
  { key: 'glucose', recommended: 'gemini-3.8-flash', recommendedWhy: 'Covers Photo Carbs, where a better reading of the plate means a better carb count - 3.8 Flash reads images and fills the exact JSON shape the carb log needs. Pro would be slower at the table for little gain; stable for anything near insulin.', label: 'Glucose & T1D Rulebook', kind: 'text', default: 'gemini-2.5-flash', files: ['glucoseInsightService.js', 'glucoseHubService.js', 't1dRulebookService.js'],
    use: 'Glucose pattern insights and the T1D Rulebook findings.' },
  { key: 'campaigns', recommended: 'gemini-3.8-flash', recommendedWhy: 'Chronicles are long creative writing that must stay wholly in-world (Tolkien\'s voice for LOTR, 1920s for Arkham), plus rules lookups and voice-note transcription. 3.8 Flash writes better prose and works with the no-thinking setting transcription uses.', label: 'Campaigns, decks & chronicles', kind: 'text', default: 'gemini-2.5-flash', files: ['campaignsService.js', 'decksService.js', 'arkhamCampaigns.js', 'arkhamMap.js', 'middleEarthMap.js', 'rulebooks.js'],
    use: 'LOTR and Arkham campaign chronicles, maps, rule checks and deck questions.' },
  { key: 'library', recommended: 'gemini-3.5-flash-lite', recommendedWhy: 'Reading new PDFs for topics and subjects is high-volume, simple classification into a fixed JSON shape - exactly what Flash-Lite is for. A fraction of Flash\'s price and quicker, with no real loss for tagging.', label: 'Library indexing (topics & subjects)', kind: 'text', default: 'gemini-2.5-flash', files: ['topicService.js', 'categorisationService.js'],
    use: 'Reads new PDFs to suggest topics, questions and which subject they belong in.' },
  { key: 'newsMusic', recommended: 'gemini-3.5-flash-lite', recommendedWhy: 'Tagging news stories and tidying music scan names are short, repetitive jobs that run often - Flash-Lite does them well at the lowest cost and fastest speed.', label: 'News & music', kind: 'text', default: 'gemini-2.5-flash', files: ['newsService.js', 'musicScanService.js'],
    use: 'Tags news stories and tidies music scan results.' },
  { key: 'recordings', recommended: 'gemini-3.8-flash', recommendedWhy: 'Meeting and call summaries need to read a whole long transcript and pick out what matters - the newer Flash keeps more of the detail and decisions than 2.5, and handles very long inputs.', label: 'Call & meeting recordings', kind: 'text', default: 'gemini-2.5-flash', files: ['recordingService.js'],
    use: 'Summarises recorded calls and meetings.' },
  { key: 'codeRepo', recommended: 'gemini-3.8-flash', recommendedWhy: 'Pattern cataloguing and audits run over many files, so Pro\'s price multiplies quickly; 3.8 Flash is strong at code and keeps a scan affordable.', label: 'Code best practices', kind: 'text', default: 'gemini-2.5-flash', files: ['codeRepoService.js'],
    use: 'Catalogues patterns and audits your repositories.' },
  { key: 'vision', recommended: 'gemini-3.8-flash', recommendedWhy: 'Answering questions about a camera snapshot needs a model that reads images well - 3.8 Flash does, quickly, and is stable.', label: 'Look (camera questions)', kind: 'text', default: config.gemini.chatModels.flash, files: ['lookService.js'],
    use: 'Answers questions about a camera snapshot - needs a model that reads images.' },
  { key: 'imsVoice', recommended: 'gemini-3.8-live', recommendedWhy: 'Ims\'s own voice: the newest stable Live model - natural en-GB speech, reliable tool calls mid-conversation, and it connected in under a second. The Extended Thinking variant reasons more but adds a pause before he speaks, which feels wrong in conversation.', label: 'Ims voice (desk & web)', kind: 'live', default: 'gemini-3.8-live', files: [],
    use: 'The real-time conversation model behind Ims on the Box-3 and the web Ims panel.' },
  { key: 'browserVoice', recommended: 'gemini-3.8-live', recommendedWhy: 'Stable instead of the 3.1 Preview it uses now, and the same model as Ims on the desk, so the browser voice behaves the same way.', label: 'Browser voice chat', kind: 'live', default: 'gemini-3.1-flash-live-preview', files: [],
    use: 'The generic voice assistant in the library chat page (not Ims).' },
  { key: 'tts', recommended: 'gemini-2.5-flash-preview-tts', recommendedWhy: 'Keep it. The newer 3.8 TTS models are stable, but tested on 2 Oct 2026 they read IMS\'s Yorkshire style instructions out loud (a doorbell alert became four minutes of instructions) instead of following them, and they refuse a separate style instruction. 2.5 TTS follows them. Worth revisiting once the voice instructions are reworked for the newer models.', label: 'Spoken audio (TTS)', kind: 'tts', default: 'gemini-2.5-flash-preview-tts', files: ['voiceService.js', 'chronicleVoice.js'],
    use: 'Reads text aloud in the Yorkshire voice - doorbell in the browser, chronicle narration.' },
  { key: 'image', recommended: 'gemini-3.1-flash-image', recommendedWhy: 'Nano Banana 2: good, consistent illustrations for chronicles at a sensible price per picture. Nano Banana Pro draws finer detail but costs several times as much and is slower.', label: 'Pictures', kind: 'image', default: 'gemini-3.1-flash-image', files: ['chronicleArt.js', 'imageService.js'],
    use: 'Chronicle illustrations, 1920s photographs and generated images.' },
  { key: 'embedding', recommended: 'gemini-embedding-001', recommendedWhy: 'Keep it: every book in the library was indexed with it. Gemini Embedding 2 is newer, but switching means re-embedding the whole library (hours, and cost) for a small gain in search.', label: 'Library search (embeddings)', kind: 'embedding', default: config.gemini.embeddingModel, files: ['embeddingService.js'], locked: true,
    use: 'Turns every PDF passage into numbers for search. Locked: a different embedding model speaks a different "language", so switching means re-indexing the whole library (hours, and every book re-embedded).' },
];
const byKey = Object.fromEntries(SERVICES.map((s) => [s.key, s]));

// ---- selection (settings) ----
function readJson(key, fallback) {
  try { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key); return r ? JSON.parse(r.value) : fallback; } catch { return fallback; }
}
function writeJson(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
}
// Re-read every 2 s: a choice changed by another process (a script, a roll back) takes effect without a restart.
let selectionCache = null;
let selectionAt = 0;
function selection() {
  if (!selectionCache || Date.now() - selectionAt > 2000) { selectionCache = readJson('model_selection', {}); selectionAt = Date.now(); }
  return selectionCache;
}

export function getModelFor(serviceKey) {
  const s = byKey[serviceKey];
  if (!s) return null;
  return (!s.locked && selection()[serviceKey]?.current) || s.default;
}

// Which service is calling, from the caller's file and the model its code asked for.
export function serviceFor(file, requestedModel) {
  const candidates = SERVICES.filter((s) => s.files.includes(file));
  if (!candidates.length) return null;
  return candidates.find((s) => s.matchDefault && s.default === requestedModel)
    || candidates.find((s) => !s.matchDefault && (s.kind !== 'text' || !/embedding|image|tts/.test(requestedModel || '')))
    || null;
}

// The model to actually call: the user's choice for that service, else what the code asked for.
export function resolveModel(file, requestedModel) {
  const svc = serviceFor(file, requestedModel);
  if (!svc || svc.locked) return { model: requestedModel, service: svc?.key || null };
  return { model: selection()[svc.key]?.current || requestedModel, service: svc.key };
}

export function setModelFor(serviceKey, model, note = '') {
  const s = byKey[serviceKey];
  if (!s) throw new Error('Unknown service');
  if (s.locked) throw new Error(`${s.label} is locked - switching it needs a full re-index of the library.`);
  const all = { ...selection() };
  const was = all[serviceKey]?.current || s.default;
  if (was === model) return all[serviceKey] || { current: model };
  const history = [{ model: was, until: new Date().toISOString() }, ...(all[serviceKey]?.history || [])].slice(0, 10);
  all[serviceKey] = { current: model, previous: was, changedAt: new Date().toISOString(), note, history };
  writeJson('model_selection', all);
  selectionCache = all;
  console.log(`[Models] ${s.label}: ${was} -> ${model}`);
  return all[serviceKey];
}

export function rollback(serviceKey) {
  const cur = selection()[serviceKey];
  if (!cur?.previous) throw new Error('Nothing to roll back to.');
  return setModelFor(serviceKey, cur.previous, 'rolled back');
}

export function resetToDefault(serviceKey) {
  return setModelFor(serviceKey, byKey[serviceKey].default, 'reset to default');
}

// ---- catalogue ----
let catalogueCache = { at: 0, models: [] };
export async function fetchCatalogue(force = false) {
  if (!force && catalogueCache.models.length && Date.now() - catalogueCache.at < 6 * 3600 * 1000) return catalogueCache.models;
  const res = await fetch(`${API}/models?pageSize=1000&key=${apiKey()}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Model list: HTTP ${res.status}`);
  const j = await res.json();
  catalogueCache = {
    at: Date.now(),
    models: (j.models || []).map((m) => ({
      id: m.name.replace('models/', ''), name: m.displayName || m.name, methods: m.supportedGenerationMethods || [],
      inputLimit: m.inputTokenLimit, outputLimit: m.outputTokenLimit, description: m.description || ''
    }))
  };
  return catalogueCache.models;
}

export function kindOf(m) {
  const id = m.id;
  if (m.methods.includes('embedContent')) return 'embedding';
  if (/-tts\b|-tts-/.test(id)) return 'tts';
  if (/image|nano-banana/.test(id)) return 'image';
  if (m.methods.includes('bidiGenerateContent')) {
    if (/transcribe|translate|robotics|lyria/.test(id)) return 'other';
    return 'live';
  }
  if (m.methods.includes('generateContent')) {
    if (/lyria|transcribe|robotics|computer-use|deep-research|antigravity|customtools|omni|veo|aqa/.test(id)) return 'other';
    if (/^gemini-|^gemma-/.test(id)) return 'text';
  }
  return 'other';
}

// List prices in US$ per 1M tokens (Google's paid tier) for the models where they're known; the
// Costs page lets these be edited, and anything not listed shows as "price not set".
export const KNOWN_PRICES = {
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },
  'gemini-2.5-pro': { input: 1.25, output: 10.00 },
  'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
  'gemini-embedding-001': { input: 0.15, output: 0 },
  'gemini-2.5-flash-preview-tts': { input: 0.50, output: 10.00 },
  'gemini-2.5-pro-preview-tts': { input: 1.00, output: 20.00 },
};

const RATING = { 1: 'Low', 2: 'Moderate', 3: 'High', 4: 'Very high' };

// Plain-words profile of a model from its name: why it exists, what it's for, and how it compares.
export function describe(m) {
  const id = m.id;
  const kind = kindOf(m);
  const version = parseFloat((id.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1]) || null;
  const preview = /preview|exp/.test(id);
  const alias = /-latest$/.test(id);
  const reliability = alias
    ? { level: 'Moving alias', score: 2, text: 'Always points at Google\'s current model of this kind, so it upgrades itself - convenient, but its behaviour can change under you with no warning.' }
    : preview
      ? { level: 'Preview', score: 1, text: 'An early release: may be slower to answer, change behaviour, have tighter limits or be withdrawn at short notice. Good for trying out, risky for things you rely on.' }
      : { level: 'Stable', score: 3, text: 'A fixed, generally available version: answers stay consistent until Google retires it (with notice).' };

  let p = { purpose: '', benefits: [], drawbacks: [], cost: 2, depth: 2, speed: 3, complexity: 1 };
  if (kind === 'text') {
    if (/gemma/.test(id)) p = { purpose: 'Google\'s open-weights model, also served through the API. Exists so developers can prototype on the same model they could run on their own hardware.', benefits: ['Very cheap (often free) on the API', 'Same model you could run locally'], drawbacks: ['Weaker reasoning and instruction-following than Gemini', 'No Google Search grounding or image input'], cost: 1, depth: 1, speed: 3, complexity: 2, intended: 'Experiments and simple text jobs; not recommended for anything health-related.' };
    else if (/lite/.test(id)) p = { purpose: 'The smallest, cheapest Gemini of its generation. Exists for high-volume, simple jobs where speed and price matter more than depth.', benefits: ['Fastest replies', 'Lowest cost - a fraction of Flash'], drawbacks: ['Shallower reasoning', 'More likely to miss nuance in long instructions'], cost: 1, depth: 1, speed: 4, complexity: 1, intended: 'Tagging, titles, classification, short summaries - e.g. news tags, task titles, library topics.' };
    else if (/flash/.test(id)) p = { purpose: 'Google\'s everyday workhorse: a balance of quality, speed and price. Exists as the sensible default for most app features.', benefits: ['Good quality for most jobs', 'Quick', 'Reasonable price'], drawbacks: ['Less thorough than Pro on long, tricky reasoning'], cost: 2, depth: 2, speed: 3, complexity: 1, intended: 'Most of IMS: day report, run debriefs, chronicles, chat.' };
    else if (/pro/.test(id)) p = { purpose: 'Google\'s most capable reasoning model of its generation. Exists for hard problems where getting it right beats speed and cost.', benefits: ['Deepest reasoning and best at long, complex instructions', 'Best for analysis over lots of material'], drawbacks: ['Several times the cost of Flash', 'Noticeably slower (thinks before answering)'], cost: 4, depth: 4, speed: 1, complexity: 3, intended: 'Deep library research, tricky rule questions, careful glucose/run analysis.' };
    if (version && version >= 3) { p.depth = Math.min(4, p.depth + 1); p.benefits = [...p.benefits, `Newer generation (${version}) - generally better than 2.5 at the same tier`]; }
  } else if (kind === 'live') {
    p = { purpose: 'A real-time voice model: listens and speaks over a streaming connection with natural turn-taking. Exists for spoken conversations - text models can\'t do this.', benefits: ['Natural voice, low latency', 'Can call IMS tools mid-conversation'], drawbacks: ['Billed per second of audio both ways while the session is open'], cost: 3, depth: 2, speed: 4, complexity: 3, intended: 'Ims on the desk and in the web app.' };
    if (/extended-thinking/.test(id)) { p.purpose += ' This variant thinks longer before speaking.'; p.depth = 4; p.speed = 2; p.cost = 4; p.drawbacks = [...p.drawbacks, 'Longer pause before Ims starts talking']; }
    if (/native-audio/.test(id)) p.benefits = [...p.benefits, 'Native audio (one model hears and speaks, no separate TTS)'];
  } else if (kind === 'tts') {
    p = { purpose: 'Text-to-speech: turns a script into spoken audio in a chosen voice. Exists for reading prepared text aloud - cheaper and more controllable than a live session.', benefits: ['Controllable voice and pacing', 'No live connection needed'], drawbacks: ['Not conversational', 'Output audio billed per token'], cost: /pro/.test(id) ? 3 : /lite/.test(id) ? 1 : 2, depth: 1, speed: /pro/.test(id) ? 2 : 3, complexity: 1, intended: 'Doorbell voice in the browser, chronicle narration.' };
  } else if (kind === 'image') {
    p = { purpose: 'Image generation ("Nano Banana" family): draws pictures from a description. Exists for illustrations.', benefits: /pro/.test(id) ? ['Best detail and text-in-image'] : /lite/.test(id) ? ['Cheapest, fastest pictures'] : ['Good quality at a sensible price'], drawbacks: /pro/.test(id) ? ['Most expensive per image', 'Slower'] : ['Less fine detail than Pro'], cost: /pro/.test(id) ? 4 : /lite/.test(id) ? 1 : 2, depth: 2, speed: /pro/.test(id) ? 1 : 3, complexity: 1, intended: 'Chronicle art and 1920s photographs.' };
  } else if (kind === 'embedding') {
    p = { purpose: 'Turns text into a list of numbers that captures its meaning, so similar passages can be found. Exists for search, not for answering.', benefits: ['Very cheap', 'Powers library search'], drawbacks: ['Changing it needs every book re-indexed'], cost: 1, depth: 1, speed: 4, complexity: 1, intended: 'Library search.' };
  }
  const price = KNOWN_PRICES[id] || null;
  return {
    ...m, kind, version, reliability,
    purpose: p.purpose, intended: p.intended || '', benefits: p.benefits, drawbacks: p.drawbacks,
    ratings: { cost: p.cost, depth: p.depth, speed: p.speed, complexity: p.complexity, reliability: reliability.score },
    ratingWords: { cost: RATING[p.cost], depth: RATING[p.depth], speed: RATING[p.speed], complexity: RATING[p.complexity] },
    price
  };
}

// ---- probe: a tiny real call, so a switch never lands on a model that won't answer ----
function probeLive(model) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey()}`);
    const done = (r) => { clearTimeout(t); try { ws.close(); } catch { } resolve(r); };
    const t = setTimeout(() => done({ ok: false, error: 'No answer within 10 s' }), 10000);
    ws.on('open', () => ws.send(JSON.stringify({ setup: { model: `models/${model}`, generationConfig: { responseModalities: ['AUDIO'] } } })));
    ws.on('message', (d) => { try { if (JSON.parse(d.toString()).setupComplete) done({ ok: true }); } catch { } });
    ws.on('close', (code, reason) => done({ ok: false, error: `Closed: ${code} ${reason}`.trim() }));
    ws.on('error', (e) => done({ ok: false, error: e.message }));
  });
}

export async function probeModel(model, kind) {
  const started = Date.now();
  let r;
  try {
    if (kind === 'live') r = await probeLive(model);
    else if (kind === 'image' || kind === 'embedding') {
      // drawing a picture costs money - counting tokens proves the model answers this key
      const res = await fetch(`${API}/models/${model}:countTokens?key=${apiKey()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: 'test' }] }] }), signal: AbortSignal.timeout(15000) });
      r = res.ok ? { ok: true } : { ok: false, error: (await res.json().catch(() => ({})))?.error?.message || `HTTP ${res.status}` };
    } else {
      const body = kind === 'tts'
        ? { contents: [{ parts: [{ text: 'Say: ok' }] }], generationConfig: { responseModalities: ['AUDIO'] } }
        : { contents: [{ parts: [{ text: 'Reply with the single word OK.' }] }] };
      const res = await fetch(`${API}/models/${model}:generateContent?key=${apiKey()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
      r = res.ok ? { ok: true } : { ok: false, error: (await res.json().catch(() => ({})))?.error?.message || `HTTP ${res.status}` };
    }
  } catch (err) { r = { ok: false, error: err.message }; }
  const result = { ...r, ms: Date.now() - started, at: new Date().toISOString() };
  const probes = readJson('model_probes', {});
  probes[model] = result;
  writeJson('model_probes', probes);
  return result;
}

// ---- recommended vs the model in use, dimension by dimension ----
// What each kind of change means for each service: the benefit of a gain, and why a drop is acceptable
// there. Used to explain a recommendation against whatever is selected now.
const STAKES = {
  chat: { costUp: 'library questions are occasional - a few a day at most - so a higher rate adds pennies a month', costDown: 'every library answer costs less', depthUp: 'it reads the passages more carefully and joins up answers that span several books or pages', depthDown: 'most library questions are looking something up rather than long reasoning', speedUp: 'answers appear sooner while you wait in the chat', speedDown: 'a second or two longer while you wait for a careful answer is a fair trade' },
  chatDeep: { costUp: 'you only pick Pro or Research for the hard questions, so it runs rarely', costDown: 'the deep tiers cost less each time you use them', depthUp: 'these tiers exist for the hardest questions, where deeper reasoning is the whole point', depthDown: 'still a Pro-class model, deep enough for research questions', speedUp: 'deep answers arrive sooner', speedDown: 'you choose these tiers expecting a considered answer, so waiting longer is expected' },
  dayReport: { costUp: 'it runs about once a day, so even a higher rate is pennies a month', costDown: 'the daily report and its previews cost less', depthUp: 'it follows your section sliders, the say-it-once rules and the Yorkshire persona more faithfully, and writes a more natural spoken script', depthDown: 'the report is mostly retelling the facts it is given', speedUp: 'previews and examples on the Day Report page come back sooner', speedDown: 'the report is prepared before you ask for it, so a few extra seconds are never felt' },
  imsHelpers: { costUp: 'it only runs when Ims has no answer of his own - a handful of times a day', costDown: 'each search fallback costs less', depthUp: 'it reads search results more carefully and gives fuller, more current answers for Ims to pass on', depthDown: 'these are short look-ups and task titles that need little reasoning', speedUp: 'Ims answers sooner while you wait mid-conversation', speedDown: 'a little more wait mid-conversation, in exchange for a better answer' },
  running: { costUp: 'debriefs and insights run once or twice per run', costDown: 'run insights cost less', depthUp: 'it is more careful with paces, timings and glucose figures - this feeds health advice, so care matters', depthDown: 'the numbers are worked out by IMS first; the model mostly explains them', speedUp: 'debriefs appear sooner after a run', speedDown: 'debriefs are read after the run, so a few extra seconds do not matter' },
  glucose: { costUp: 'Photo Carbs and insights run a few times a day', costDown: 'each photo estimate costs less', depthUp: 'it reads the plate and portions more accurately - a better carb count means better insulin decisions', depthDown: 'your corrected values for regular foods override it anyway', speedUp: 'the carb estimate is back sooner while your food goes cold', speedDown: 'a second or two longer at the table for a more accurate count is worth it' },
  campaigns: { costUp: 'chronicles are written after a session, a few times a week', costDown: 'each chronicle and rules check costs less', depthUp: 'it keeps long chronicles wholly in-world (Tolkien for LOTR, the 1920s for Arkham) and gets rules details right more often', depthDown: 'most of this is writing from your notes rather than hard reasoning', speedUp: 'rules checks come back sooner mid-game', speedDown: 'chronicles are written after the game, so waiting a little longer is fine' },
  library: { costUp: 'it only runs when new PDFs are added', costDown: 'every new PDF is cheaper to sort - and a whole folder at once can mean hundreds of calls', depthUp: 'subjects and topics are picked more precisely', depthDown: 'sorting a book into a subject and listing topics is simple classification - more depth adds little', speedUp: 'big batches of new books are indexed faster', speedDown: 'indexing runs in the background' },
  newsMusic: { costUp: 'tagging runs a few times a day', costDown: 'frequent, repetitive tagging costs a fraction as much', depthUp: 'tags are a little more precise', depthDown: 'tagging a headline or tidying an album name needs very little reasoning', speedUp: 'news and music scans finish sooner', speedDown: 'scans run in the background' },
  recordings: { costUp: 'recordings are summarised once each, a few a week', costDown: 'long transcripts cost less to summarise', depthUp: 'it keeps more of the decisions and actions from a long call', depthDown: 'summaries are mostly picking out what was said', speedUp: 'the summary is ready sooner after the call', speedDown: 'summaries are read later, so a slower one is not felt' },
  codeRepo: { costUp: 'scans are occasional', costDown: 'scans over many files cost much less', depthUp: 'it spots better patterns and subtler problems in the code', depthDown: 'cataloguing patterns is closer to sorting than deep analysis', speedUp: 'scans finish sooner', speedDown: 'scans run in the background' },
  vision: { costUp: 'camera questions are occasional', costDown: 'each camera question costs less', depthUp: 'it reads the snapshot more accurately', depthDown: 'most questions are simple ("what can you see")', speedUp: 'the answer comes back sooner', speedDown: 'a short extra wait for a better reading of the photo' },
  imsVoice: { costUp: 'conversations are short and close after 15 s of silence', costDown: 'every minute of conversation costs less', depthUp: 'Ims understands better and uses his tools more sensibly', depthDown: 'quick spoken back-and-forth matters more than deep thought - long reasoning makes him pause before speaking', speedUp: 'Ims starts talking sooner, which makes conversation feel natural', speedDown: 'a slightly longer pause before Ims speaks' },
  browserVoice: { costUp: 'the browser voice chat is used occasionally', costDown: 'voice chat costs less per minute', depthUp: 'it understands questions better', depthDown: 'it is for quick spoken questions', speedUp: 'replies start sooner', speedDown: 'a slightly longer pause before it speaks' },
  tts: { costUp: 'it only speaks short alerts and chronicle narration', costDown: 'each spoken alert or narration costs less', depthUp: 'it follows the Yorkshire style direction more closely', depthDown: 'reading text aloud needs little reasoning', speedUp: 'audio starts sooner after the alert', speedDown: 'narration is made ahead of time and cached' },
  image: { costUp: 'pictures are made once per chronicle and kept', costDown: 'each picture costs less', depthUp: 'pictures follow the description more faithfully', depthDown: 'illustrations need a good likeness, not reasoning', speedUp: 'pictures appear sooner', speedDown: 'pictures are drawn in the background and kept' },
  embedding: { costUp: '', costDown: '', depthUp: '', depthDown: '', speedUp: '', speedDown: '' },
};

const DIMS = [
  // key, label, higher is better?
  ['cost', 'Cost', false],
  ['depth', 'Reasoning depth', true],
  ['speed', 'Speed', true],
  ['complexity', 'Complexity', false],
  ['reliability', 'Reliability', true],
];
const LEVEL = { 1: 'Low', 2: 'Moderate', 3: 'High', 4: 'Very high' };
const RELIABILITY = { 1: 'Preview', 2: 'Moving alias', 3: 'Stable' };

export function compareForService(svcKey, cur, rec) {
  if (!cur || !rec || cur.id === rec.id) return [];
  const st = STAKES[svcKey] || {};
  return DIMS.map(([key, label, higherBetter]) => {
    const a = cur.ratings[key], b = rec.ratings[key];
    const show = (v) => (key === 'reliability' ? RELIABILITY[v] : LEVEL[v]);
    const change = `${show(a)} → ${show(b)}`;
    if (a === b) {
      const same = key === 'reliability' ? `both ${show(a)}` : `${show(a)} for both`;
      return { key, label, verdict: 'same', change: show(a), text: `No change (${same}).` };
    }
    const better = higherBetter ? b > a : b < a;
    let text;
    if (key === 'cost') text = better ? `Cheaper: ${st.costDown || 'it costs less to run'}.` : `Costs more - acceptable because ${st.costUp || 'it runs rarely'}.`;
    else if (key === 'depth') text = better ? `Deeper reasoning: ${st.depthUp || 'better answers'}.` : `Less reasoning depth - acceptable because ${st.depthDown || 'this job needs little reasoning'}.`;
    else if (key === 'speed') text = better ? `Faster: ${st.speedUp || 'results arrive sooner'}.` : `Slower - acceptable because ${st.speedDown || 'nobody is waiting on it'}.`;
    else if (key === 'complexity') text = better
      ? 'Simpler: fewer moving parts (less hidden thinking or setup), so its behaviour is easier to predict.'
      : 'More complex (it thinks before answering, or needs more setup) - acceptable because IMS already handles that, and it is what buys the extra depth above.';
    else text = better
      ? `More dependable: a ${show(b)} version answers the same way until Google retires it (with notice), instead of changing or disappearing${svcKey === 'glucose' || svcKey === 'running' ? ' - important for anything feeding health decisions' : ''}.`
      : `Less settled (${show(b)}) - acceptable only because the gain above is worth it; if it misbehaves, Roll back puts the previous model back in one click.`;
    return { key, label, verdict: better ? 'better' : 'worse', change, text };
  });
}

// ---- recommendation from the assessments ----
// What matters most for each service (weights on cost, reasoning depth, speed, simplicity). Only models
// that PASSED that service's assessment (Ims's persona included) can be recommended; stable versions
// first, previews only if no stable one passes. Ties go to the newer generation, then the faster run.
const PRIORITIES = {
  chat: { depth: 2, cost: 1, speed: 1, simple: 0.5, why: 'answer quality first, then price and speed' },
  chatDeep: { depth: 3, cost: 0.5, speed: 0.25, simple: 0, why: 'reasoning depth above everything - you pick these tiers for the hard questions' },
  dayReport: { depth: 2, cost: 1, speed: 0.5, simple: 0.5, why: 'writing and instruction-following first, then price' },
  imsHelpers: { depth: 2, cost: 1, speed: 1, simple: 0.5, why: 'speed and answer quality together - Ims is waiting mid-conversation' },
  running: { depth: 2, cost: 1, speed: 0.5, simple: 0.5, why: 'care with figures first, then price' },
  glucose: { depth: 2, cost: 1, speed: 1, simple: 0.5, why: 'accuracy first (it feeds carb counts), then speed at the table' },
  campaigns: { depth: 2, cost: 1, speed: 0.5, simple: 0.5, why: 'writing quality first, then price' },
  library: { depth: 0.5, cost: 3, speed: 1, simple: 0.5, why: 'price first - it runs for every new book - then speed' },
  newsMusic: { depth: 0.5, cost: 3, speed: 1, simple: 0.5, why: 'price first - frequent, simple tagging - then speed' },
  recordings: { depth: 2, cost: 1, speed: 0.5, simple: 0.5, why: 'keeping the detail first, then price' },
  codeRepo: { depth: 2, cost: 1.5, speed: 0.5, simple: 0.5, why: 'code understanding and price equally - scans cover many files' },
  vision: { depth: 2.5, cost: 1, speed: 1, simple: 0.5, why: 'reading the image well, then speed' },
  imsVoice: { depth: 1, cost: 1, speed: 2, simple: 0.5, why: 'how quickly Ims starts talking first - natural conversation - then understanding' },
  browserVoice: { depth: 1, cost: 1, speed: 2, simple: 0.5, why: 'quick replies first, then understanding' },
  tts: { depth: 0.5, cost: 1, speed: 1, simple: 0.5, why: 'price and speed for short alerts and narration' },
  image: { depth: 1, cost: 2, speed: 1, simple: 0, why: 'price per picture first, then quality' },
};

function fitScore(m, p) {
  const r = m.ratings;
  return p.depth * r.depth + p.cost * (5 - r.cost) + p.speed * r.speed + p.simple * (5 - r.complexity);
}

export function pickRecommended(svc, models) {
  if (svc.locked || !PRIORITIES[svc.key]) return null;
  const passing = models.filter((m) => m.kind === svc.kind && m.assessment?.services?.[svc.key]?.ok);
  if (!passing.length) return null;
  const stable = passing.filter((m) => m.reliability.level === 'Stable');
  const pool = stable.length ? stable : passing;
  const p = PRIORITIES[svc.key];
  const ms = (m) => m.assessment.services[svc.key].ms || 0;
  const ranked = [...pool].sort((a, b) => (fitScore(b, p) - fitScore(a, p)) || ((b.version || 0) - (a.version || 0)) || (ms(a) - ms(b)));
  return { best: ranked[0], passing, pool, ranked, usedPreview: !stable.length };
}

function dynamicWhy(svc, pick, curated) {
  const m = pick.best;
  const p = PRIORITIES[svc.key];
  const runner = pick.ranked[1];
  const bits = [`Picked from the assessments: ${pick.passing.length} model${pick.passing.length === 1 ? '' : 's'} passed every check for this service${['dayReport', 'imsVoice', 'browserVoice', 'tts'].includes(svc.key) ? ' (Ims\'s persona and accent included)' : ''}, and for ${p.why} this one fits best`];
  if (runner) bits.push(`- ahead of ${runner.id}${runner.version && m.version && m.version > runner.version && fitScore(runner, p) === fitScore(m, p) ? ' (same strengths, newer generation)' : ''}`);
  if (pick.usedPreview) bits.push('. No stable version passes yet, so this is a Preview - roll back if it misbehaves');
  if (curated && curated !== m.id) bits.push(`. It replaces the earlier hand-picked recommendation, ${curated}`);
  return `${bits.join(' ')}.`;
}

export async function getOverview({ refresh = false } = {}) {
  let models = [];
  let catalogueError = null;
  try { models = (await fetchCatalogue(refresh)).map(describe); } catch (err) { catalogueError = err.message; }
  const probes = readJson('model_probes', {});
  const assessments = readJson('model_assessments', {});
  const known = readJson('model_known', {});
  const sel = selection();
  const withAssess = models.map((m) => ({ ...m, assessment: assessments[m.id] || null }));
  const recFor = (s) => {
    const pick = pickRecommended(s, withAssess);
    if (!pick) return { id: s.recommended || null, why: s.recommendedWhy || '', source: 'hand-picked' };
    if (pick.best.id === s.recommended) return { id: s.recommended, why: `${s.recommendedWhy} Confirmed by the assessments: it passed every check for this service.`, source: 'assessed' };
    return { id: pick.best.id, why: dynamicWhy(s, pick, s.recommended), source: 'assessed', isNew: !!(known[pick.best.id] && !known[pick.best.id].initial) };
  };
  const recs = Object.fromEntries(SERVICES.map((s) => [s.key, recFor(s)]));
  return {
    catalogueError,
    services: SERVICES.map((s) => ({
      comparison: compareForService(s.key, models.find((m) => m.id === getModelFor(s.key)), models.find((m) => m.id === recs[s.key].id)),
      key: s.key, label: s.label, kind: s.kind, use: s.use, locked: !!s.locked, default: s.default,
      recommended: recs[s.key].id, recommendedWhy: recs[s.key].why, recommendedSource: recs[s.key].source, recommendedIsNew: !!recs[s.key].isNew,
      current: getModelFor(s.key), previous: sel[s.key]?.previous || null, changedAt: sel[s.key]?.changedAt || null,
      history: sel[s.key]?.history || []
    })),
    models: models.filter((m) => m.kind !== 'other').map((m) => ({
      ...m, probe: probes[m.id] || null,
      assessment: assessments[m.id] || null,
      // new: first seen in the last 14 days (not the first ever listing)
      isNew: !!(known[m.id] && !known[m.id].initial && Date.now() - Date.parse(known[m.id].firstSeen) < 14 * 86400000),
      firstSeen: known[m.id]?.firstSeen || null,
    })),
  };
}

export default { SERVICES, getModelFor, resolveModel, serviceFor, setModelFor, rollback, resetToDefault, getOverview, probeModel, describe, fetchCatalogue, KNOWN_PRICES };
