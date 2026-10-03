// Ims's personas - the ONE place his character, dialect, accent and voice come from.
//
// Each persona is a Markdown file in /personas: a YAML header (voice, accent, dialect word pools, sample
// lines such as doorbell announcements and sign-offs) and the character sections below it. The active
// persona is a setting; switching it changes every place IMS writes or speaks as Ims - Live sessions
// (desk, web, browser), spoken alerts (TTS), the day report, weather wording, doorbell and reminder
// announcements, the Google Search fallback, and the Model Switcher's persona checks. Nothing else may
// hard-code an accent: ask this service.
//
// _house_rules.md holds what every persona shares (item creation, clarifying, no self-corrections,
// health and joke rules). Ims is always called Ims, answers to "Hey Ims" and speaks English only.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { getSetting, setSetting } from '../db/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(__dirname, '../../../personas');
const HOUSE_FILE = path.join(DIR, '_house_rules.md');
const HISTORY_DIR = path.resolve(__dirname, '../data/persona_history');
export const DEFAULT_PERSONA = 'yorkshire';
const ACTIVE_KEY = 'active_persona';

const DEFAULTS = {
  name: 'New persona', description: '', voice: 'Umbriel', languageCode: 'en-GB',
  accent: 'a natural British', accentRule: '', dialect: 'your own dialect', judgeAccent: '', character: 'a warm, plain-spoken friend with opinions',
  weatherPhrasing: 'plain', testLine: "Hello! This is Ims, testing this voice.", clarifyExample: "Sorry, I didn't catch all of that - what was that last bit?",
  signOffs: [], dialectWords: [], tagEndings: [], thinkingSounds: [], doorbell: { ding: [], motion: [] },
};

// ---- files ----
const FRONT = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
export function parsePersona(raw) {
  const m = FRONT.exec(String(raw || ''));
  if (!m) return { meta: { ...DEFAULTS }, body: String(raw || '').trim() };
  let meta = {};
  try { meta = YAML.parse(m[1]) || {}; } catch (err) { throw new Error(`The persona header isn't valid YAML: ${err.message}`); }
  return { meta: { ...DEFAULTS, ...meta, doorbell: { ...DEFAULTS.doorbell, ...(meta.doorbell || {}) } }, body: m[2].trim() };
}

export function serializePersona(meta, body) {
  const clean = Object.fromEntries(Object.entries(meta).filter(([k, v]) => v !== undefined && k !== 'id'));
  return `---\n${YAML.stringify(clean, { lineWidth: 110 }).trim()}\n---\n${String(body || '').trim()}\n`;
}

const fileOf = (id) => path.join(DIR, `${id}.md`);
const validId = (id) => /^[a-z0-9][a-z0-9-]{0,40}$/.test(String(id || ''));

const cache = new Map(); // id -> { mtimeMs, persona }
export function getPersona(id) {
  if (!validId(id)) return null;
  const f = fileOf(id);
  if (!fs.existsSync(f)) return null;
  const { mtimeMs } = fs.statSync(f);
  const hit = cache.get(id);
  if (hit && hit.mtimeMs === mtimeMs) return hit.persona;
  const raw = fs.readFileSync(f, 'utf8');
  const { meta, body } = parsePersona(raw);
  const persona = { id, ...meta, body, raw, updatedAt: new Date(mtimeMs).toISOString() };
  cache.set(id, { mtimeMs, persona });
  return persona;
}

export function listPersonas() {
  fs.mkdirSync(DIR, { recursive: true });
  const active = activePersonaId();
  return fs.readdirSync(DIR).filter((f) => f.endsWith('.md') && !f.startsWith('_')).map((f) => f.replace(/\.md$/, ''))
    .map((id) => getPersona(id)).filter(Boolean)
    .map((p) => ({ id: p.id, name: p.name, description: p.description, voice: p.voice, accent: p.accent, updatedAt: p.updatedAt, active: p.id === active, isDefault: p.id === DEFAULT_PERSONA }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
}

export function activePersonaId() {
  const id = getSetting(ACTIVE_KEY);
  return id && getPersona(id) ? id : DEFAULT_PERSONA;
}
// withPersona(p, fn): build something (e.g. the desk setup) as persona p without switching - used by the
// test bench to try a persona that isn't active. Synchronous builders only.
let override = null;
export function withPersona(persona, fn) {
  const prev = override;
  override = persona;
  try { return fn(); } finally { override = prev; }
}

export function getActivePersona() {
  if (override) return override;
  return getPersona(activePersonaId()) || { id: DEFAULT_PERSONA, ...DEFAULTS, body: '', raw: '' };
}
export function setActivePersona(id) {
  if (!getPersona(id)) throw new Error('No such persona.');
  setSetting(ACTIVE_KEY, id);
  console.log(`[Persona] Active persona: ${id}`);
  return getPersona(id);
}

// ---- history (a copy of every version replaced) ----
function snapshot(id, prev) {
  try {
    const dir = path.join(HISTORY_DIR, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.md`), prev, 'utf8');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
    for (const old of files.slice(0, Math.max(0, files.length - 60))) fs.unlinkSync(path.join(dir, old));
  } catch (err) { console.warn('[Persona] history snapshot failed:', err.message); }
}
export function listHistory(id) {
  const dir = path.join(HISTORY_DIR, id);
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort().reverse().map((f) => ({
      id: f.replace(/\.md$/, ''),
      savedAt: f.replace(/\.md$/, '').replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d+Z)$/, '$1:$2:$3.$4'),
      bytes: fs.statSync(path.join(dir, f)).size,
    }));
  } catch { return []; }
}
export function readHistory(id, versionId) {
  if (!/^[0-9TZ-]+$/.test(versionId)) return null;
  const f = path.join(HISTORY_DIR, id, `${versionId}.md`);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
}

// ---- edit ----
export function savePersonaRaw(id, raw) {
  if (!validId(id)) throw new Error('Bad persona id.');
  const { meta, body } = parsePersona(raw); // throws on bad YAML
  if (!String(meta.name || '').trim()) throw new Error('The persona needs a name.');
  if (!body.trim()) throw new Error('The persona needs its character sections.');
  const f = fileOf(id);
  if (fs.existsSync(f)) { const prev = fs.readFileSync(f, 'utf8'); if (prev !== raw) snapshot(id, prev); }
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(f, raw.endsWith('\n') ? raw : `${raw}\n`, 'utf8');
  cache.delete(id);
  return getPersona(id);
}

export function savePersonaParts(id, { meta, body }) {
  const current = getPersona(id);
  const merged = { ...(current ? Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, current[k]])) : DEFAULTS), ...(meta || {}) };
  return savePersonaRaw(id, serializePersona(merged, body ?? current?.body ?? ''));
}

const slug = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'persona';
const TEMPLATE_BODY = (name) => `# ${name}

Who this Ims is and how he talks. The rules every persona shares are in the House rules.

---

## 1. Identity

- **Name:** Ims (rhymes with *rims*) - always.
- **Physical form:** a small desk terminal with an expressive face, two microphones and a speaker, on the user's desk.
- **Relationship:** the user is a trusted friend and work partner.
- **Tone comes from the sliders:** this persona fixes dialect, mannerisms and relationship; humour, warmth, bluntness and formality come from the personality settings.

---

## 2. Voice & accent

- **How Ims sounds:** describe the accent - vowels, rhythm, what it must never drift into.
- **After looking something up:** put tool results back into your own phrasing - never read them out flat.

---

## 3. Spoken rhythm

- How he starts a reply when thinking, fillers he uses, how long replies run.

---

## 4. Conversation style

- How he keeps a conversation going, gives opinions, and his kind of humour.

---

## 5. Examples

- **User:** *"Hey IMS, what's the capital of Australia?"*
  **Ims:** *"..."*
`;

export function createPersona({ name, fromId = null }) {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('Give the persona a name.');
  let id = slug(clean);
  for (let n = 2; getPersona(id); n++) id = `${slug(clean)}-${n}`;
  const src = fromId ? getPersona(fromId) : null;
  const meta = src ? Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, src[k]])) : { ...DEFAULTS };
  meta.name = clean;
  if (src) meta.description = `Copy of ${src.name}`;
  const body = src ? src.body.replace(/^# .*$/m, `# ${clean}`) : TEMPLATE_BODY(clean);
  return savePersonaRaw(id, serializePersona(meta, body));
}

export function deletePersona(id) {
  if (id === DEFAULT_PERSONA) throw new Error('The original Yorkshire persona can\'t be deleted (it is the fallback).');
  if (id === activePersonaId()) throw new Error('Switch to another persona before deleting this one.');
  const f = fileOf(id);
  if (!fs.existsSync(f)) return false;
  snapshot(id, fs.readFileSync(f, 'utf8'));
  fs.unlinkSync(f);
  cache.delete(id);
  return true;
}

// ---- house rules (shared) ----
export function getHouseRules() {
  try { return fs.readFileSync(HOUSE_FILE, 'utf8').trim(); } catch { return ''; }
}
export function saveHouseRules(raw) {
  if (!String(raw || '').trim()) throw new Error('The house rules can\'t be empty.');
  try { const prev = fs.readFileSync(HOUSE_FILE, 'utf8'); if (prev !== raw) snapshot('_house', prev); } catch { }
  fs.writeFileSync(HOUSE_FILE, raw, 'utf8');
}

// ---- what everything else asks for (active persona unless one is passed in) ----
const P = (p) => p || getActivePersona();
/** The persona's character sections plus the shared house rules - what goes into every prompt. */
export const personaRules = (p) => [P(p).body, getHouseRules()].filter(Boolean).join('\n\n');
/** The non-negotiable accent instruction. */
export const accentRule = (p) => P(p).accentRule || `ACCENT - EVERY SENTENCE OF EVERY REPLY: speak in ${P(p).accent} accent, from the first word to the last, including numbers, names and anything read out from a tool. Never drift into another accent.`;
export const accentLabel = (p) => P(p).accent;
export const dialectLabel = (p) => P(p).dialect;
/** Short phrase for one-off instructions: "in your own voice - West Yorkshire (Leeds) accent, English only". */
export const inYourVoice = (p) => `in your own voice - ${P(p).accent} accent, English only`;
export const voiceName = (p) => P(p).voice || 'Umbriel';
export const languageCode = (p) => P(p).languageCode || 'en-GB';
export const signOffs = (p) => P(p).signOffs || [];
export const pools = (p) => ({ dialectWords: P(p).dialectWords || [], tagEndings: P(p).tagEndings || [], thinkingSounds: P(p).thinkingSounds || [] });
export const usesYorkshireWeatherPhrasing = (p) => P(p).weatherPhrasing === 'yorkshire';

/** A doorbell / motion announcement line in the persona's words. */
export function doorbellLine(event, cameraName = 'front door', p = null, userName = 'Simon') {
  const lines = (P(p).doorbell || {})[event === 'ding' ? 'ding' : 'motion'] || [];
  const place = !cameraName || /front|door/i.test(cameraName) ? 'front door' : cameraName;
  const pick = lines.length ? lines[Math.floor(Math.random() * lines.length)] : (event === 'ding' ? `Someone's at the ${place}, ${userName}.` : `There's movement by the ${place}.`);
  return pick.replace(/\{place\}/g, place).replace(/\{name\}/g, userName).replace(/\bthe the\b/gi, 'the');
}

export default {
  DEFAULT_PERSONA, getPersona, listPersonas, getActivePersona, activePersonaId, setActivePersona, savePersonaRaw, savePersonaParts,
  createPersona, deletePersona, getHouseRules, saveHouseRules, listHistory, readHistory, parsePersona, serializePersona,
  personaRules, accentRule, accentLabel, dialectLabel, inYourVoice, voiceName, languageCode, signOffs, pools, usesYorkshireWeatherPhrasing, doorbellLine,
};
