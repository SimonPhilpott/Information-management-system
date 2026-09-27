import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Hall of Beorn (hallofbeorn.com) - the LOTR LCG card database that also covers encounter cards,
// which RingsDB doesn't. Used to give deck insights the real quest stages, enemies, locations and
// treacheries of the scenario being played. Each encounter set is cached on disk for 30 days.
const BASE = 'https://hallofbeorn.com';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', '..', 'data', 'decks', 'lotr_encounters');
const MAX_AGE_MS = 30 * 86400000;

const clean = (s) => String(s || '').replace(/`/g, "'").replace(/\s+/g, ' ').trim();
const side = (f) => f && {
  stats: Object.fromEntries(Object.entries(f.Stats || {}).filter(([, v]) => v !== null && v !== '')),
  traits: (f.Traits || []).map((t) => t.replace(/\.$/, '')).join(', '),
  keywords: (f.Keywords || []).map(clean).join(' '),
  text: (f.Text || []).map(clean).join(' '),
  shadow: clean(f.Shadow),
};

export async function fetchEncounterSet(name) {
  const file = path.join(CACHE_DIR, `${name.replace(/[^\w-]+/g, '_')}.json`);
  try {
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - cached.fetchedAt < MAX_AGE_MS) return cached.cards;
  } catch (_) { /* not cached */ }
  const res = await fetch(`${BASE}/Export/Search?EncounterSet=${encodeURIComponent(name)}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Hall of Beorn answered ${res.status} for "${name}".`);
  const raw = await res.json();
  const cards = (Array.isArray(raw) ? raw : []).map((c) => ({
    name: c.Title, type: c.CardType, unique: Boolean(c.IsUnique), qty: c.Quantity ?? null, easyQty: c.EncounterInfo?.EasyModeQuantity ?? null,
    stage: c.EncounterInfo?.StageNumber ? `${c.EncounterInfo.StageNumber}${c.EncounterInfo.StageLetter || ''}` : null,
    front: side(c.Front), back: side(c.Back),
  }));
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ fetchedAt: Date.now(), cards }));
  return cards;
}

// The scenario's cards as compact lines for a prompt: quest stages first, then the encounter deck.
export async function describeScenarioCards(setNames, { nightmareSet = null } = {}) {
  const sets = [...setNames, ...(nightmareSet ? [nightmareSet] : [])];
  const all = [];
  for (const s of sets) {
    try { for (const c of await fetchEncounterSet(s)) all.push({ ...c, set: s }); } catch (_) { /* skip a set that won't load */ }
  }
  if (!all.length) return null;
  const stat = (st) => Object.entries(st || {}).map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').trim()} ${v}`).join(', ');
  const face = (f) => [f?.traits && `(${f.traits})`, f?.keywords, stat(f?.stats), f?.text, f?.shadow && `Shadow: ${f.shadow}`].filter(Boolean).join(' ');
  const quests = all.filter((c) => c.type === 'Quest').sort((a, b) => String(a.stage).localeCompare(String(b.stage)));
  const deck = all.filter((c) => c.type !== 'Quest');
  return [
    'QUEST STAGES:',
    ...quests.map((q) => `- Stage ${q.stage || '?'} "${q.name}": ${face(q.front)}${q.back ? ` | B side: ${face(q.back)}` : ''}`.slice(0, 700)),
    'ENCOUNTER CARDS (quantity in brackets):',
    ...deck.map((c) => `- [${c.type}${c.qty ? ` x${c.qty}` : ''}] ${c.unique ? '• ' : ''}${c.name}: ${face(c.front)}`.slice(0, 420)),
  ].join('\n');
}
