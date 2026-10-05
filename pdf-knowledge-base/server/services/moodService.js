// Feeling and a life of his own (persona plan Phase 4), worked out from what has actually happened:
//  I2  a mood that lasts - a campaign win or loss, how Simon seemed last time, a long gap since they spoke -
//      each fading with a six-hour half-life. It colours his tone and face; never a reason to speak unprompted.
//  D2  things on his mind - new releases from Simon's artists, today's doorbell visitors, a recent campaign
//      game - his to bring up at a natural lull, only in a conversation Simon started.
//  D1/I3  speech habits from the stored transcripts (faces used, reply lengths, questions, repeated openers,
//      overused dialect words) - the worst habit becomes next week's "vary this".
import db, { getSetting, setSetting } from '../db/database.js';
import { lastUserMood } from './memoryProfiles.js';
import { recentCampaignGames } from './campaignsService.js';
import { getTodayReleases, getUpcomingReleases } from './musicScanService.js';
import { getActivePersona } from './personaService.js';

const HOUR = 3600000;
const fade = (ageMs) => Math.pow(0.5, Math.max(0, ageMs) / (6 * HOUR));

// ---- I2: mood ----
export function currentMood() {
  const now = Date.now();
  const reasons = [];
  // a campaign game today or last night
  try {
    for (const g of recentCampaignGames().slice(0, 1)) {
      const won = /\bthey beat\b/.test(g);
      const scenario = (g.match(/"([^"]+)"(?:\s*\(|;|$)/g) || []).pop()?.replace(/[";(]/g, '').trim();
      const when = (g.match(/: (today|last night|yesterday)/) || [])[1] || 'recently';
      reasons.push({ v: won ? 0.5 : -0.35, a: won ? 0.6 : 0.3, why: won ? `you both beat "${scenario}" ${when}` : `"${scenario}" beat you both ${when}`, age: 8 * HOUR });
    }
  } catch { /* no campaigns */ }
  // how Simon seemed last time (from the conversation notes)
  const um = lastUserMood();
  if (um?.mood && now - um.at < 24 * HOUR) {
    const m = um.mood.toLowerCase();
    if (/fed up|tired|stressed|rushed|down|low|annoyed|frustrat|grumpy|sad|worried/.test(m)) reasons.push({ v: -0.1, a: 0.2, gentle: true, why: `Simon seemed ${um.mood} last time you spoke`, age: now - um.at });
    else if (/cheer|happy|chatty|upbeat|excited|good/.test(m)) reasons.push({ v: 0.25, a: 0.5, why: `Simon was ${um.mood} last time you spoke`, age: now - um.at });
  }
  // a long gap since they last talked
  try {
    const last = db.prepare('SELECT started_at FROM conversations ORDER BY started_at DESC LIMIT 1').get();
    if (last && now - last.started_at > 48 * HOUR) reasons.push({ v: 0.2, a: 0.5, why: "you haven't talked for a couple of days", age: 0 });
  } catch { /* no conversations yet */ }

  let v = 0, a = 0.35;
  for (const r of reasons) { const w = fade(r.age); v += r.v * w; a += (r.a - 0.35) * w * 0.5; }
  v = Math.max(-1, Math.min(1, v));
  const label = v >= 0.35 ? 'chuffed' : v >= 0.12 ? 'in good spirits' : v > -0.12 ? 'steady' : v > -0.3 ? 'a bit flat' : 'subdued';
  const strong = reasons.filter((r) => fade(r.age) > 0.25).sort((x, y) => Math.abs(y.v) * fade(y.age) - Math.abs(x.v) * fade(x.age));
  return { valence: Number(v.toFixed(2)), arousal: Number(a.toFixed(2)), label, gentle: strong.some((r) => r.gentle), reasons: strong.map((r) => r.why) };
}

export function moodForPrompt() {
  const m = currentMood();
  if (m.label === 'steady' && !m.gentle) return '';
  const why = m.reasons.length ? ` - because ${m.reasons.slice(0, 2).join(', and ')}` : '';
  return `YOUR MOOD RIGHT NOW: ${m.label}${why}. Let it colour your tone and the face you pick${m.gentle ? '; go a little gentler with him' : ''}. Mention the reason only if it fits the conversation - never as an opener.`;
}

// ---- D2: things on his mind ----
export function thingsOnMind() {
  const out = [];
  try {
    const today = getTodayReleases().filter((r) => !r.owned).slice(0, 2);
    if (today.length) out.push(`New out today from artists in his library: ${today.map((r) => `${r.artist} - "${r.title}"`).join('; ')}`);
    else {
      const soon = (getUpcomingReleases() || []).filter((r) => r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Date.parse(r.date) - Date.now() < 4 * 86400000).slice(0, 1);
      if (soon.length) out.push(`Coming out in the next few days: ${soon.map((r) => `${r.mbName || r.artist} - "${r.title}" (${r.date})`).join('; ')}`);
    }
  } catch { /* music scanner not set up */ }
  try {
    const since = new Date(Date.now() - 12 * HOUR).toISOString().replace('T', ' ').slice(0, 19);
    const rings = db.prepare("SELECT created_at FROM doorbell_events WHERE event_type = 'ding' AND created_at >= ? ORDER BY created_at DESC").all(since);
    if (rings.length) out.push(`The doorbell rang ${rings.length === 1 ? 'once' : `${rings.length} times`} today, last at ${new Date(`${rings[0].created_at.replace(' ', 'T')}Z`).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })}`);
  } catch { /* no doorbell */ }
  try {
    const g = recentCampaignGames()[0];
    if (g) out.push(g.split('; the chronicle')[0]);
  } catch { /* no campaigns */ }
  return out.slice(0, 3);
}

export function thingsOnMindForPrompt() {
  const t = thingsOnMind();
  if (!t.length) return '';
  return "THINGS ON YOUR MIND TODAY (yours to bring up only inside a conversation Simon started, at a natural lull, at most one per conversation, never as an opener):\n" + t.map((x) => `- ${x}`).join('\n');
}

// ---- D1 / I3: speech habits from the transcripts ----
const STATS_KEY = 'ims_speech_stats';
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };

export function computeSpeechStats({ days = 7 } = {}) {
  const rows = db.prepare("SELECT text, emotion FROM conversation_turns WHERE role = 'ims' AND at >= ?").all(Date.now() - days * 86400000);
  const persona = getActivePersona();
  const emotions = {};
  const lengths = [];
  const openers = {};
  let questions = 0, fillers = 0;
  const wordCounts = {};
  const watch = [...(persona.dialectWords || []), ...(persona.tagEndings || []).map((t) => t.replace(/^\.\.\./, '').replace(/["]/g, ''))]
    .map((w) => String(w).replace(/\s*\(.*\)$/, '').trim().toLowerCase()).filter((w) => w.length > 1);
  for (const r of rows) {
    const text = String(r.text || '');
    const words = text.split(/\s+/).filter(Boolean);
    lengths.push(words.length);
    for (const e of String(r.emotion || 'none').split(',')) emotions[e] = (emotions[e] || 0) + 1;
    const op = words.slice(0, 2).join(' ').toLowerCase().replace(/[^a-z' ]/g, '');
    if (op) openers[op] = (openers[op] || 0) + 1;
    if (/\?/.test(text)) questions++;
    if (/\b(erm+|err+|um+|hm+|so{3,}|we{3,}ll|ri{3,}ght)\b/i.test(text)) fillers++;
    const lower = ` ${text.toLowerCase()} `;
    for (const w of watch) if (lower.includes(` ${w}`)) wordCounts[w] = (wordCounts[w] || 0) + 1;
  }
  const n = rows.length;
  const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
  const stats = {
    replies: n, days,
    emotions: Object.fromEntries(top(emotions)),
    length: { p10: pct(lengths, 0.1), median: pct(lengths, 0.5), p90: pct(lengths, 0.9) },
    questionRate: n ? Number((questions / n).toFixed(2)) : null,
    fillerRate: n ? Number((fillers / n).toFixed(2)) : null,
    topOpeners: top(openers).slice(0, 5),
    topDialect: top(wordCounts).slice(0, 6),
    at: new Date().toISOString(),
  };
  setSetting(STATS_KEY, JSON.stringify(stats));
  return stats;
}

export const lastSpeechStats = () => { try { return JSON.parse(getSetting(STATS_KEY) || 'null'); } catch { return null; } };

// the worst habit of the week, as one line for the session prompt (needs a fair sample)
export function speechVarietyHint() {
  const s = lastSpeechStats();
  if (!s || s.replies < 20) return '';
  const hints = [];
  const [op, opN] = s.topOpeners[0] || [];
  if (op && opN / s.replies > 0.2) hints.push([opN / s.replies, `you've opened ${Math.round(100 * opN / s.replies)}% of replies with "${op}" lately - start differently`]);
  const [w, wN] = s.topDialect[0] || [];
  if (w && wN / s.replies > 0.25) hints.push([wN / s.replies, `you've leant on "${w}" a lot this week - give it a rest`]);
  if (s.questionRate != null && s.questionRate > 0.5) hints.push([s.questionRate, `over half your replies have ended in a question - ask less`]);
  if (s.fillerRate != null && s.fillerRate > 0.6) hints.push([s.fillerRate, `most replies have had an "erm" or a stretched word - use them less`]);
  const em = Object.entries(s.emotions || {}).filter(([e]) => e !== 'none');
  const emTotal = em.reduce((x, [, c]) => x + c, 0);
  if (emTotal >= 20 && em[0] && em[0][1] / emTotal > 0.65) hints.push([em[0][1] / emTotal, `your face has been "${em[0][0]}" ${Math.round(100 * em[0][1] / emTotal)}% of the time - let it show what you actually feel`]);
  if (!hints.length) return '';
  hints.sort((a, b) => b[0] - a[0]);
  return `YOUR HABITS THIS WEEK: ${hints[0][1]}.`;
}
