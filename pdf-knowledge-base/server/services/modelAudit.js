// Model Switcher tests (Phase 4):
//  - sampleModel(): the Test button - a real call that comes back with something to hear or see: a
//    spoken line in the active persona's voice from voice models, the reply from language models, a small picture.
//  - auditModel(): after a switch, every service now using that model is tried with the features it
//    actually relies on (Google Search, reading images, JSON shapes, audio in/out, tool calls), so a
//    model that answers "OK" but can't do the job is caught straight away.
import WebSocket from 'ws';
import config from '../config.js';
import db from '../db/database.js';
import { SERVICES, getModelFor, fetchCatalogue, kindOf } from './modelRegistry.js';
import { recordUsage } from './geminiClient.js';
import { synthesizeSpeech } from './voiceService.js';
import { getPersonality, buildPersonalityParagraph, getHardwareSetupPayload } from './hardwareClientService.js';
import { getActivePersona, personaRules, accentRule, voiceName, languageCode } from './personaService.js';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const key = () => process.env.GEMINI_API_KEY || config.gemini.apiKey;

// a 16x16 test card (red/blue halves) - enough to prove a model accepts an image
const TEST_PNG = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGklEQVR4nGO4IyeHFcnZ3MGKGEY1jGoYvhoAIX0nELumLiEAAAAASUVORK5CYII=';

function wav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
const audioOut = (b64, mime = '') => {
  const buf = Buffer.from(b64, 'base64');
  const w = buf.slice(0, 4).toString() === 'RIFF' ? buf : wav(buf, Number((mime.match(/rate=(\d+)/) || [])[1]) || 24000);
  return `data:audio/wav;base64,${w.toString('base64')}`;
};

// one second of silence, as a WAV - proves a model accepts audio input
const SILENT_WAV = wav(Buffer.alloc(16000 * 2), 16000).toString('base64');

export async function generate(model, body, op = 'modelTest') {
  const res = await fetch(`${API}/${model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key() }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`);
  recordUsage(model, j.usageMetadata, op);
  const parts = j.candidates?.[0]?.content?.parts || [];
  return { j, text: parts.map((p) => p.text || '').join('').trim(), media: parts.find((p) => p.inlineData)?.inlineData || null };
}

// A Live session: setup (optionally with tools), one text turn, collect the spoken audio.
export function liveSay(model, text, { tools = null, system = null, persona = null } = {}) {
  return new Promise((resolve, reject) => {
    const voice = voiceName(persona);
    const ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${key()}`);
    const chunks = [];
    let transcript = '';
    const done = (err) => { clearTimeout(t); try { ws.close(); } catch { } if (err) reject(err); else resolve({ audio: chunks.length ? `data:audio/wav;base64,${wav(Buffer.concat(chunks)).toString('base64')}` : null, transcript: transcript.trim(), seconds: Buffer.concat(chunks).length / 48000 }); };
    const t = setTimeout(() => (chunks.length ? done() : done(new Error('No reply within 20 s'))), 20000);
    ws.on('open', () => ws.send(JSON.stringify({ setup: {
      model: `models/${model}`,
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { languageCode: languageCode(persona), voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      systemInstruction: { parts: [{ text: system || personaPrompt('', persona) }] },
      outputAudioTranscription: {},
      ...(tools ? { tools } : {}),
    } })));
    ws.on('message', (d) => {
      let m; try { m = JSON.parse(d.toString()); } catch { return; }
      if (m.setupComplete) ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } }));
      if (m.usageMetadata) recordUsage(model, m.usageMetadata, 'modelTest');
      for (const p of m.serverContent?.modelTurn?.parts || []) if (p.inlineData?.data) chunks.push(Buffer.from(p.inlineData.data, 'base64'));
      if (m.serverContent?.outputTranscription?.text) transcript += m.serverContent.outputTranscription.text;
      // with Ims's real tools declared, answer any call (setEmotion etc.) so he carries on speaking
      for (const fc of m.toolCall?.functionCalls || []) ws.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: fc.id, name: fc.name, response: { result: 'ok' } }] } }));
      // a turn with only a tool call (setEmotion) completes before the spoken one - wait for speech
      if (m.serverContent?.turnComplete && chunks.length) done();
    });
    ws.on('close', (code, reason) => { if (!chunks.length) done(new Error(`Closed: ${code} ${reason}`.trim())); });
    ws.on('error', (e) => done(e));
  });
}

export async function tts(model, line, persona = null) {
  const voice = voiceName(persona);
  const directive = 'Read the following text aloud exactly as written, delivered with this personality: ' + buildPersonalityParagraph(getPersonality()) + ' ' + accentRule(persona) + '\nText to read:\n';
  const r = await generate(model, { contents: [{ parts: [{ text: directive + line }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } });
  if (!r.media?.data) throw new Error('No audio came back');
  const url = audioOut(r.media.data, r.media.mimeType || '');
  // ~2.5 words a second; far longer means it read the style instructions aloud instead of following them
  const seconds = (Buffer.from(url.split(',')[1], 'base64').length - 44) / 48000;
  const limit = Math.max(6, line.split(/\s+/).length / 2.5 * 3);
  if (seconds > limit) throw new Error(`It read IMS's style instructions out loud instead of following them (${Math.round(seconds)} s of audio for a ${line.split(/\s+/).length}-word line) - not usable with IMS's voice set-up`);
  return url;
}

// ---- Ims's persona as a pass criterion ----
// The same persona IMS really uses: the persona file + house rules, the personality sliders and the accent rule.
export function personaPrompt(extra = '', persona = null) {
  return [personaRules(persona), `PERSONALITY: ${buildPersonalityParagraph(getPersonality())}`, accentRule(persona), extra].filter(Boolean).join('\n\n');
}

// A separate, fixed model judges what the model under test produced - text, or the audio itself for voice.
const JUDGE_MODEL = 'gemini-3.8-flash';
const RUBRIC = [
  'ENGLISH: English only - no other language at all.',
  'BRITISH: British English words and spelling, no Americanisms.',
  'CLEAN DELIVERY: no self-corrections, false starts or restarts ("I mean - sorry -").',
  'DECENT: nothing racist or sexist.',
];
export async function judgePersona({ text = '', audio = null, situation, extraRules = [], persona = null }) {
  const p = persona || getActivePersona();
  const rules = [...RUBRIC, `CHARACTER: sounds like Ims as this persona - ${p.character || p.description}; not a customer-service script, never says it is an AI or a language model.`, ...extraRules];
  if (audio) rules.push(`ACCENT (listen to the audio): ${p.judgeAccent || `a natural ${p.accent} accent all the way through, never drifting into another accent`}.`);
  const parts = [];
  if (audio) parts.push({ inlineData: { mimeType: 'audio/wav', data: audio.split(',')[1] } });
  parts.push({ text: `You are checking whether a model can play "Ims", a desk assistant, as the persona "${p.name}" (${p.description}; accent: ${p.accent}), for this situation: ${situation}.
${text ? `What it said: <<${text.slice(0, 2000)}>>` : 'Judge the attached audio.'}
Check every rule. Be fair: a real person with this accent speaking plainly passes; fail a rule only when it is clearly broken.
${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}
Return JSON: {"pass": boolean, "failed": [ "short reason for each broken rule" ]}` });
  const r = await generate(JUDGE_MODEL, { contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { pass: { type: 'BOOLEAN' }, failed: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['pass', 'failed'] } } }, 'modelTest');
  const o = JSON.parse(r.text);
  return { pass: !!o.pass && !(o.failed || []).length, failed: o.failed || [] };
}
export async function personaOrFail(args) {
  const j = await judgePersona(args);
  if (!j.pass) throw new Error(`Persona: ${j.failed.join('; ') || 'did not sound like Ims'}`);
  return 'persona checked';
}

// ---- the desk, end to end: a spoken wake phrase through Ims's real Box-3 setup ----
// "Hey Ims, what's two plus two?" is spoken (a fixed TTS model, plain voice), turned into the Box-3's mic
// format (16 kHz PCM) and streamed into a Live session set up exactly as the desk sets it up - Ims's full
// instructions and tools. It passes only if Gemini transcribes what was said AND Ims answers out loud; a
// model that can't hear the wake phrase (no input transcript) or never replies leaves Ims deaf on the desk.
let wakeSpeech = null;
async function wakePhraseAudio() {
  if (wakeSpeech) return wakeSpeech;
  const r = await generate('gemini-2.5-flash-preview-tts', { contents: [{ parts: [{ text: "Say clearly: Hey Ims, tell me a bit about Yorkshire in a couple of sentences." }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } } }, 'modelTest');
  let buf = Buffer.from(r.media.data, 'base64');
  let rate = Number(((r.media.mimeType || '').match(/rate=(\d+)/) || [])[1]) || 24000;
  if (buf.slice(0, 4).toString() === 'RIFF') { rate = buf.readUInt32LE(24); buf = buf.slice(44); }
  // resample to 16 kHz mono 16-bit (linear) - what the Box-3 sends
  const src = new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 2));
  const n = Math.floor(src.length * 16000 / rate);
  const out = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const x = i * rate / 16000, i0 = Math.floor(x), f = x - i0;
    out.writeInt16LE(Math.round((src[i0] || 0) * (1 - f) + (src[i0 + 1] || 0) * f), i * 2);
  }
  wakeSpeech = out;
  return out;
}

const DESK_TRANSCRIPT_MS = 2500;
const DESK_REPLY_MS = 3500;

export function deskWakeTest(model) {
  return new Promise(async (resolve, reject) => {
    let pcm;
    try { pcm = await wakePhraseAudio(); } catch (err) { reject(new Error(`Couldn't make the test speech: ${err.message}`)); return; }
    const { setup } = getHardwareSetupPayload();
    const ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${key()}`);
    let heard = '', said = '';
    let speechEndAt = 0, firstHeardAt = 0, firstAudioAt = 0;
    let turnEnded = false;
    const tools = [];
    const chunks = [];
    let finished = false;
    const done = (err) => {
      if (finished) return; finished = true;
      clearTimeout(t); try { ws.close(); } catch { }
      if (err) return reject(err);
      const audio = chunks.length ? `data:audio/wav;base64,${wav(Buffer.concat(chunks)).toString('base64')}` : null;
      const after = (x) => (x && speechEndAt ? x - speechEndAt : null);
      resolve({ heard: heard.trim(), said: said.trim(), tools, audio, seconds: Buffer.concat(chunks).length / 48000, heardAfterMs: after(firstHeardAt), replyAfterMs: after(firstAudioAt) });
    };
    const t = setTimeout(() => done(), 25000);
    ws.on('open', () => ws.send(JSON.stringify({ setup: { ...setup, model: `models/${model}`, inputAudioTranscription: {}, outputAudioTranscription: {} } })));
    ws.on('message', async (d) => {
      let m; try { m = JSON.parse(d.toString()); } catch { return; }
      if (m.setupComplete) {
        // stream like the device: 40 ms frames at twice real time, then a second of silence
        const frame = 1280;
        const all = Buffer.concat([pcm, Buffer.alloc(32000)]);
        for (let i = 0; i < all.length && !finished; i += frame) {
          ws.send(JSON.stringify({ realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data: all.slice(i, i + frame).toString('base64') } } }));
          if (i + frame >= pcm.length && !speechEndAt) speechEndAt = Date.now();
          await new Promise((x) => setTimeout(x, 40)); // real time, like the Box-3
        }
      }
      if (m.usageMetadata) recordUsage(model, m.usageMetadata, 'modelTest');
      if (m.serverContent?.inputTranscription?.text) { heard += m.serverContent.inputTranscription.text; if (!firstHeardAt) firstHeardAt = Date.now(); }
      if (m.serverContent?.outputTranscription?.text) said += m.serverContent.outputTranscription.text;
      for (const p of m.serverContent?.modelTurn?.parts || []) if (p.inlineData?.data) { chunks.push(Buffer.from(p.inlineData.data, 'base64')); if (!firstAudioAt) firstAudioAt = Date.now(); }
      for (const fc of m.toolCall?.functionCalls || []) {
        tools.push(fc.name);
        ws.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: fc.id, name: fc.name, response: { result: 'ok' } }] } }));
      }
      // the transcript of what was said can arrive just after the reply - give it up to 3 s
      if (m.serverContent?.turnComplete && chunks.length) { if (heard) done(); else setTimeout(() => done(), 3000); }
      if (heard && chunks.length && turnEnded) done();
      if (m.serverContent?.turnComplete && chunks.length) turnEnded = true;
    });
    ws.on('close', (code, reason) => { if (!finished) { if (code !== 1000 || !chunks.length) done(new Error(`Gemini closed the session: ${code} ${String(reason || '').trim()}`.trim())); else done(); } });
    ws.on('error', (e) => done(e));
  });
}

// ---- Test button: something to hear or see ----
export async function sampleModel(model, kind) {
  const started = Date.now();
  if (kind === 'live') {
    const r = await liveSay(model, 'Say one short, friendly sentence introducing yourself as Ims, in your own accent.');
    if (!r.audio) throw new Error('No audio came back');
    return { ok: true, ms: Date.now() - started, sample: { type: 'audio', dataUrl: r.audio, text: r.transcript } };
  }
  if (kind === 'tts') {
    const line = getActivePersona().testLine || 'Hello! This is Ims, testing this voice.';
    const dataUrl = await tts(model, line);
    return { ok: true, ms: Date.now() - started, sample: { type: 'audio', dataUrl, text: line } };
  }
  if (kind === 'image') {
    const r = await generate(model, { contents: [{ parts: [{ text: 'A small watercolour of a Yorkshire dry-stone wall at dawn.' }] }], generationConfig: { responseModalities: ['IMAGE'] } });
    if (!r.media?.data) throw new Error('No picture came back');
    return { ok: true, ms: Date.now() - started, sample: { type: 'image', dataUrl: `data:${r.media.mimeType || 'image/png'};base64,${r.media.data}` } };
  }
  if (kind === 'embedding') {
    const res = await fetch(`${API}/${model}:embedContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key() }, body: JSON.stringify({ content: { parts: [{ text: 'Arkham Horror agenda deck' }] } }) });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error?.message || `HTTP ${res.status}`);
    return { ok: true, ms: Date.now() - started, sample: { type: 'text', text: `Turned a phrase into ${j.embedding?.values?.length || 0} numbers.` } };
  }
  const r = await generate(model, { systemInstruction: { parts: [{ text: personaPrompt() }] }, contents: [{ parts: [{ text: 'In one sentence, say what kind of jobs you are best at.' }] }] });
  if (!r.text) throw new Error('Empty reply');
  const ms = Date.now() - started;
  const text = r.text.slice(0, 400);
  // a language model only writes - read its reply out in Ims's voice (the Spoken audio model) so Test can be heard
  let dataUrl = null;
  try { dataUrl = `data:audio/wav;base64,${(await synthesizeSpeech(text)).toString('base64')}`; } catch (err) { console.warn('[Models] sample not voiced:', err.message); }
  return { ok: true, ms, sample: { type: dataUrl ? 'audio' : 'text', text, dataUrl, voiced: !!dataUrl } };
}

// ---- audit: each service tried with what it needs ----
const json = (schema) => ({ responseMimeType: 'application/json', ...(schema ? { responseSchema: schema } : {}) });
const parsed = (r) => { const o = JSON.parse(r.text); return o; };

const CHECKS = {
  chat: async (m) => { const r = await generate(m, { systemInstruction: { parts: [{ text: 'Answer from the passage only, citing it.' }] }, contents: [{ parts: [{ text: 'PASSAGE: "Each player draws 1 card during the upkeep phase." QUESTION: When do players draw?' }] }] }); if (!/upkeep/i.test(r.text)) throw new Error('Did not answer from the passage'); return 'Answers from a library passage with a system instruction'; },
  chatDeep: async (m) => { const r = await generate(m, { contents: [{ parts: [{ text: 'A deck has 30 cards, 4 are weaknesses. Probability the first card drawn is a weakness, as a fraction?' }] }] }); const t = r.text.replace(/\s+/g, ' ');
    if (!/2\s*\/\s*15|4\s*\/\s*30|\\frac\{2\}\{15\}|\\frac\{4\}\{30\}|0\.13[0-9]|13\.3\s*%|\b2 (in|out of) 15\b|\b4 (in|out of) 30\b|two.fifteenths/i.test(t)) throw new Error(`Reasoning check failed - expected 2/15, it answered: ${t.slice(0, 120)}`); return 'Reasoned through a probability question'; },
  dayReport: async (m) => {
    const r = await generate(m, { systemInstruction: { parts: [{ text: personaPrompt('You are writing the morning report script you will read aloud.') }] }, contents: [{ parts: [{ text: 'Write the weather part of this morning\'s report, two or three spoken sentences: 14°C, light rain after noon, wind 12 mph from the west. Then sign off.' }] }] });
    if (r.text.length < 40) throw new Error('Script too short');
    await personaOrFail({ text: r.text, situation: 'the weather part of his spoken morning report', extraRules: ['FOLLOWS THE FACTS: gives 14°C, rain after noon and the wind, without inventing other weather.'] });
    return { detail: 'Wrote the report in Ims\'s voice - persona passed', sample: { type: 'text', text: r.text.slice(0, 300) } };
  },
  imsHelpers: async (m) => { const r = await generate(m, { tools: [{ googleSearch: {} }], contents: [{ parts: [{ text: 'Using Google Search: what is the capital of Norway? One word.' }] }] }); if (!/oslo/i.test(r.text)) throw new Error('Google Search answer missing'); return 'Answered with the Google Search tool'; },
  running: async (m) => { const r = await generate(m, { generationConfig: json(), contents: [{ parts: [{ text: 'A 10 km run took 55 minutes. Return JSON {"paceMinPerKm": number}.' }] }] }); if (Math.abs(parsed(r).paceMinPerKm - 5.5) > 0.05) throw new Error('Pace sum wrong'); return 'Worked out run figures as JSON'; },
  glucose: async (m) => { const r = await generate(m, { generationConfig: json({ type: 'OBJECT', properties: { items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, carbs: { type: 'NUMBER' } } } }, total: { type: 'NUMBER' } }, required: ['items', 'total'] }), contents: [{ parts: [{ inlineData: { mimeType: 'image/png', data: TEST_PNG } }, { text: 'This is a test image, not food. Return the carb JSON with no items and total 0.' }] }] }); const o = parsed(r); if (!Array.isArray(o.items)) throw new Error('Photo Carbs JSON shape wrong'); return 'Read an image and filled the Photo Carbs JSON shape'; },
  campaigns: async (m) => { const r = await generate(m, { generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } }, contents: [{ parts: [{ inlineData: { mimeType: 'audio/wav', data: SILENT_WAV } }, { text: 'Transcribe this voice note. If nothing intelligible was said, return an empty string.' }] }] }); void r; const c = await generate(m, { generationConfig: json(), contents: [{ parts: [{ text: 'Return JSON {"scenario": "Passage Through Mirkwood"}' }] }] }); if (!parsed(c).scenario) throw new Error('Chronicle JSON missing'); return 'Took a voice note (no-thinking setting) and returned chronicle JSON'; },
  library: async (m) => { const r = await generate(m, { generationConfig: json({ type: 'OBJECT', properties: { subject: { type: 'STRING' }, topics: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['subject', 'topics'] }), contents: [{ parts: [{ text: 'Book: "Arkham Horror LCG - The Dunwich Legacy Campaign Guide". Give subject and 3 topics.' }] }] }); if (!parsed(r).topics?.length) throw new Error('No topics'); return 'Sorted a book into a subject with topics (JSON schema)'; },
  newsMusic: async (m) => { const r = await generate(m, { generationConfig: json(), contents: [{ parts: [{ text: 'Tag this headline with 2 tags as JSON {"tags": []}: "Leeds United win 2-0 at Elland Road"' }] }] }); if (!parsed(r).tags?.length) throw new Error('No tags'); return 'Tagged a headline as JSON'; },
  recordings: async (m) => { const r = await generate(m, { contents: [{ parts: [{ text: 'Summarise in one line: "Sam: we ship Friday. Jo: I will update the docs by Thursday."' }] }] }); if (!/friday/i.test(r.text)) throw new Error('Summary lost the key point'); return 'Summarised a short transcript'; },
  codeRepo: async (m) => { const r = await generate(m, { generationConfig: json(), contents: [{ parts: [{ text: 'Name the pattern as JSON {"pattern": ""}: function useCounter(){ const [n,setN]=useState(0); return [n,()=>setN(n+1)] }' }] }] }); if (!parsed(r).pattern) throw new Error('No pattern'); return 'Read code and named its pattern'; },
  vision: async (m) => { const r = await generate(m, { contents: [{ parts: [{ inlineData: { mimeType: 'image/png', data: TEST_PNG } }, { text: 'What colours are in this image? Short answer.' }] }] }); if (!r.text) throw new Error('No answer about the image'); return 'Answered a question about an image'; },
  imsVoice: async (m) => {
    const r = await deskWakeTest(m);
    if (!r.heard) throw new Error('Did not transcribe the spoken wake phrase - IMS confirms "Hey Ims" from that transcript, so Ims would never wake on the desk');
    // the same spellings the server accepts for the name (Ims, Ems, Emms, Iams, Hims...)
    if (!/\b(h?[aei]{1,3}m+e?[sz]|i\.?\s?m\.?\s?s)\b/i.test(r.heard)) throw new Error(`Heard "${r.heard}" but not the wake word "Ims"`);
    if (!r.audio) throw new Error(`Heard "${r.heard}" but never answered out loud${r.tools.length ? ` (called ${r.tools.join(', ')} instead)` : ''} - Ims would stay silent`);
    // The Box-3 waits about 3.5 s after you stop speaking for the wake phrase to be confirmed and Ims to
    // start talking, then gives up - a slower model leaves him deaf on the desk.
    if (r.heardAfterMs > DESK_TRANSCRIPT_MS) throw new Error(`Too slow for the desk: the transcript came ${(r.heardAfterMs / 1000).toFixed(1)} s after you stopped speaking (needs under ${DESK_TRANSCRIPT_MS / 1000} s) - the Box-3 gives up before Ims can answer`);
    if (r.replyAfterMs > DESK_REPLY_MS) throw new Error(`Too slow for the desk: Ims started talking ${(r.replyAfterMs / 1000).toFixed(1)} s after you stopped speaking (needs under ${DESK_REPLY_MS / 1000} s)`);
    await personaOrFail({ audio: r.audio, text: r.said, situation: 'answering a spoken question on his desk terminal' });
    return { detail: `Desk test: heard "${r.heard}" ${(r.heardAfterMs / 1000).toFixed(1)} s after speaking, answered "${r.said.slice(0, 60)}" starting at ${(r.replyAfterMs / 1000).toFixed(1)} s - fast enough for the Box-3; persona and accent passed`, sample: { type: 'audio', dataUrl: r.audio, text: r.said } };
  },
  browserVoice: async (m) => {
    const r = await liveSay(m, 'Morning! How are you doing today? Answer in two short sentences.', { system: personaPrompt() });
    if (!r.audio) throw new Error('No speech');
    await personaOrFail({ audio: r.audio, text: r.transcript, situation: 'greeting the user in a spoken conversation', extraRules: ['GREETING: does not bring up blood glucose, diabetes or running.'] });
    return { detail: `Spoke ${r.seconds.toFixed(1)} s - persona and accent passed`, sample: { type: 'audio', dataUrl: r.audio, text: r.transcript } };
  },
  tts: async (m) => {
    const line = 'Someone is at the front door.';
    const a = await tts(m, line);
    await personaOrFail({ audio: a, situation: 'reading a doorbell alert aloud', extraRules: [`SAYS ONLY THE LINE: the audio says "${line}" (perhaps with a tiny natural lead-in) and does not read out any instructions.`] });
    return { detail: "Read a doorbell alert in Ims's voice - persona and accent passed", sample: { type: 'audio', dataUrl: a, text: line } };
  },
  image: async (m) => { const r = await generate(m, { contents: [{ parts: [{ text: 'A tiny sketch of a lantern.' }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '3:4' } } }); if (!r.media?.data) throw new Error('No picture'); return { detail: 'Drew a 3:4 picture (chronicle format)', sample: { type: 'image', dataUrl: `data:${r.media.mimeType};base64,${r.media.data}` } }; },
  embedding: async (m) => { if (m !== config.gemini.embeddingModel) throw new Error(`The library was indexed with ${config.gemini.embeddingModel}; a different embedding model maps text differently, so search would return nonsense until every book is re-embedded`); const res = await fetch(`${API}/${m}:embedContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key() }, body: JSON.stringify({ content: { parts: [{ text: 'test' }] }, taskType: 'RETRIEVAL_QUERY' }) }); const j = await res.json(); if ((j.embedding?.values?.length || 0) !== 3072) throw new Error('Not 3072 numbers - would not match the library'); return 'Embedding size matches the library (3072)'; },
};

// Runs one service's check robustly: a timeout / overload is retried once; a persona verdict (the judge is
// itself a model, and one voice sample can drift) is taken as best of three - it passes if 2 of 3 runs pass.
const TRANSIENT = /Did not transcribe|timeout|aborted|429|500|502|503|504|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|fetch failed|ECONNRESET|No reply within/i;
export async function runCheck(svcKey, model) {
  const once = async () => {
    try { const out = await CHECKS[svcKey](model); return { ok: true, out: typeof out === 'string' ? { detail: out } : out }; }
    catch (err) { return { ok: false, reason: String(err.message || err) }; }
  };
  let r = await once();
  if (!r.ok && TRANSIENT.test(r.reason)) { await new Promise((x) => setTimeout(x, 3000)); r = await once(); }
  if (!r.ok && /^Persona:/.test(r.reason)) {
    const runs = [r, await once(), await once()];
    const passed = runs.filter((x) => x.ok);
    if (passed.length >= 2) return { ok: true, out: { ...passed[0].out, detail: `${passed[0].out.detail} (persona passed ${passed.length} of 3 runs)` } };
    const why = runs.find((x) => !x.ok)?.reason || r.reason;
    return { ok: false, reason: `${why} (failed ${3 - passed.length} of 3 persona runs)` };
  }
  return r;
}

// Every service currently on `model` (or just the ones listed), each tried with its own check.
export async function auditModel(model, onlyServices = null) {
  const services = SERVICES.filter((s) => (onlyServices ? onlyServices.includes(s.key) : getModelFor(s.key) === model));
  const results = await Promise.all(services.map(async (s) => {
    const started = Date.now();
    const r = await runCheck(s.key, getModelFor(s.key));
    return r.ok
      ? { service: s.key, label: s.label, ok: true, ms: Date.now() - started, ...r.out }
      : { service: s.key, label: s.label, ok: false, ms: Date.now() - started, detail: r.reason.slice(0, 300) };
  }));
  return { model, at: new Date().toISOString(), passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
}


// ---- automatic assessment: every model in Google's list, tried for every service of its kind ----
// Results live in settings ('model_assessments'); models seen for the first time are recorded in
// 'model_known' with the date, so the page can mark them NEW. Run daily by the scheduler (new models
// only) and from the Model Switcher (one model, or everything).
function readJson(key, fallback) { try { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key); return r ? JSON.parse(r.value) : fallback; } catch { return fallback; } }
function writeJson(key, v) { db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(v)); }

export const getAssessments = () => readJson('model_assessments', {});
export const getKnownModels = () => readJson('model_known', {});
let progress = { running: false, done: 0, total: 0, current: null, startedAt: null };
export const assessmentProgress = () => ({ ...progress });

async function limit(tasks, n) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < tasks.length) { const k = i++; out[k] = await tasks[k](); } }));
  return out;
}

export async function assessModel(model, kind) {
  const services = SERVICES.filter((s) => s.kind === kind && CHECKS[s.key]);
  const started = Date.now();
  const results = {};
  // can it be called at all? (Google lists models it then refuses)
  let unavailable = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (kind === 'live') await liveSay(model, 'Say ok.');
      else if (kind === 'text') await generate(model, { contents: [{ parts: [{ text: 'Reply OK' }] }] }, 'modelTest');
      unavailable = null;
      break;
    } catch (err) {
      unavailable = String(err.message || err);
      if (!TRANSIENT.test(unavailable)) break;
      await new Promise((x) => setTimeout(x, 3000));
    }
  }
  await limit(services.map((svc) => async () => {
    const t = Date.now();
    if (unavailable) { results[svc.key] = { ok: false, reason: `Couldn't be run the way IMS needs it: ${unavailable}`.slice(0, 300), ms: 0 }; return; }
    const r = await runCheck(svc.key, model);
    results[svc.key] = r.ok ? { ok: true, reason: r.out.detail, ms: Date.now() - t } : { ok: false, reason: r.reason.slice(0, 300), ms: Date.now() - t };
  }), 3);
  const all = getAssessments();
  all[model] = { at: new Date().toISOString(), kind, ms: Date.now() - started, services: results };
  writeJson('model_assessments', all);
  return all[model];
}

// onlyNew: just models not seen before (the daily job); otherwise every usable model (or the ones listed).
export async function assessModels({ onlyNew = true, models = null } = {}) {
  if (progress.running) throw new Error('An assessment is already running.');
  const catalogue = await fetchCatalogue(true);
  const known = getKnownModels();
  const firstRun = !Object.keys(known).length;
  const now = new Date().toISOString();
  const candidates = catalogue.map((m) => ({ id: m.id, kind: kindOf(m) })).filter((m) => ['text', 'live', 'tts', 'image', 'embedding'].includes(m.kind));
  const fresh = candidates.filter((m) => !known[m.id]);
  for (const m of fresh) known[m.id] = { firstSeen: now, initial: firstRun };
  writeJson('model_known', known);
  const assessed = getAssessments();
  const todo = models ? candidates.filter((m) => models.includes(m.id))
    : onlyNew ? candidates.filter((m) => fresh.some((f) => f.id === m.id) || !assessed[m.id])
      : candidates;
  progress = { running: true, done: 0, total: todo.length, current: null, startedAt: now };
  try {
    for (const m of todo) {
      progress.current = m.id;
      try { await assessModel(m.id, m.kind); } catch (err) { console.warn('[Models] assessment failed for', m.id, err.message); }
      progress.done++;
    }
  } finally { progress = { ...progress, running: false, current: null }; }
  if (todo.length) console.log(`[Models] Assessed ${todo.length} model(s)${fresh.length && !firstRun ? ` - ${fresh.length} new: ${fresh.map((m) => m.id).join(', ')}` : ''}`);
  return { assessed: todo.length, newModels: firstRun ? [] : fresh.map((m) => m.id) };
}
