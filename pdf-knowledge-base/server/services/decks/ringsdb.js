// RingsDB (ringsdb.com) - the card database and deck site for The Lord of the Rings: The Card Game.
// Public, read-only JSON API: every player card, every pack, published decklists, and private decks
// the owner has chosen to share. There's no public write API (saving to RingsDB needs its OAuth
// app flow), so decks go back to RingsDB by pasting the text export into its deck import.
const BASE = 'https://ringsdb.com';

const plain = (html) => String(html || '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/?(b|i|em|strong|cite|u)>/gi, '').replace(/<[^>]+>/g, '')
  .replace(/\[([a-z]+)\]/gi, (_, s) => `[${s}]`).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !type.includes('json')) return null;
  return res.json();
}

export async function fetchCardData() {
  const [cards, packs] = await Promise.all([getJson(`${BASE}/api/public/cards/`), getJson(`${BASE}/api/public/packs/`)]);
  if (!Array.isArray(cards) || !Array.isArray(packs)) throw new Error('RingsDB did not return its card list.');
  return {
    packs: packs.map((p) => ({ code: p.code, name: p.name, position: p.position, cycle: p.cycle_position, released: p.available || null })),
    cards: cards.map((c) => ({
      code: c.code, name: c.name, type: c.type_code, typeName: c.type_name, sphere: c.sphere_code, sphereName: c.sphere_name,
      cost: c.cost ?? null, threat: c.threat ?? null, willpower: c.willpower ?? null, attack: c.attack ?? null, defense: c.defense ?? null, health: c.health ?? null,
      victory: c.victory ?? null, questPoints: c.quest ?? null,
      traits: c.traits || '', text: plain(c.text), unique: Boolean(c.is_unique), deckLimit: c.deck_limit ?? 3,
      pack: c.pack_code, packName: c.pack_name,
      packs: (c.packs || [{ pack_code: c.pack_code, quantity: c.quantity }]).map((p) => ({ code: p.pack_code, qty: p.quantity })),
      image: c.imagesrc ? BASE + c.imagesrc : null, url: c.url,
    })),
  };
}

// A RingsDB deck from a link or an id: /decklist/view/<id>/... (published), /deck/view/<id> (a
// private deck with sharing switched on), or a bare number (tries both).
export function parseDeckRef(input) {
  const s = String(input || '').trim();
  let m = s.match(/ringsdb\.com\/decklist\/(?:view\/)?(\d+)/i);
  if (m) return { kind: 'decklist', id: m[1] };
  m = s.match(/ringsdb\.com\/deck\/(?:view\/)?(\d+)/i);
  if (m) return { kind: 'deck', id: m[1] };
  m = s.match(/^\d+$/);
  if (m) return { kind: 'either', id: s };
  throw new Error('That doesn\'t look like a RingsDB deck link - it should look like ringsdb.com/decklist/view/12345/... or ringsdb.com/deck/view/12345.');
}

// RingsDB's API has no endpoint for private decks - "Share my decks" only makes the deck's page
// public. That page carries the deck as JSON in app.deck.init({...}), same shape as the API.
async function fetchSharedDeckPage(id) {
  const res = await fetch(`${BASE}/deck/view/${id}`, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) return null;
  const html = await res.text();
  const at = html.indexOf('app.deck.init(');
  if (at < 0) return null;
  const start = html.indexOf('{', at);
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) { try { return JSON.parse(html.slice(start, i + 1)); } catch { return null; } }
  }
  return null;
}

export async function fetchDeck(ref) {
  const tries = ref.kind === 'decklist' ? ['decklist'] : ref.kind === 'deck' ? ['deck'] : ['decklist', 'deck'];
  for (const kind of tries) {
    const d = kind === 'deck' ? await fetchSharedDeckPage(ref.id) : await getJson(`${BASE}/api/public/decklist/${ref.id}.json`);
    if (d && d.slots) {
      const heroes = { ...(d.heroes || {}) };
      const slots = { ...d.slots };
      for (const code of Object.keys(heroes)) delete slots[code]; // RingsDB lists heroes in slots too
      return {
        kind, id: String(d.id), name: d.name, description: d.description_md || '',
        heroes, slots, sideslots: Array.isArray(d.sideslots) ? {} : (d.sideslots || {}),
        updatedAt: d.date_update || d.date_creation || null,
        url: `${BASE}/${kind === 'decklist' ? 'decklist/view' : 'deck/view'}/${d.id}`,
      };
    }
  }
  throw new Error(ref.kind === 'deck' || ref.kind === 'either'
    ? 'RingsDB would not share that deck. For a private deck, switch on "Share my decks" in your RingsDB account settings, or publish it.'
    : 'RingsDB has no published decklist with that number.');
}

export const siteInfo = { name: 'RingsDB', url: BASE, newDeckUrl: `${BASE}/deck/new`, importUrl: `${BASE}/deck/import` };

// Every scenario (quest) RingsDB knows: its pack, encounter sets and the encounter deck make-up at
// each difficulty. There's no list endpoint, so ids are walked until they run out.
export async function fetchScenarios() {
  const out = []; let miss = 0;
  for (let base = 1; miss < 40 && base < 600; base += 10) {
    const got = await Promise.all(Array.from({ length: 10 }, (_, k) => base + k).map((id) => getJson(`${BASE}/api/public/scenario/${id}.json`).catch(() => null)));
    for (const s of got) { if (s && s.id) { out.push(s); miss = 0; } else miss++; }
  }
  if (!out.length) throw new Error('RingsDB did not return any scenarios.');
  const counts = (s, d) => (s[`has_${d}`] === false && d !== 'normal' ? null : {
    cards: s[`${d}_cards`], enemies: s[`${d}_enemies`], locations: s[`${d}_locations`], treacheries: s[`${d}_treacheries`], shadows: s[`${d}_shadows`],
    surges: s[`${d}_surges`], objectives: s[`${d}_objectives`], objectiveAllies: s[`${d}_objective_allies`], sideQuests: s[`${d}_encounter_side_quests`],
  });
  return out.map((s) => ({
    id: s.id, name: s.name, pack: s.pack, community: /^ALeP\b/.test(s.name) || /^ALeP\b/.test(s.pack || ''),
    encounterSets: (s.encounters || []).map((e) => e.name),
    difficulties: { easy: counts(s, 'easy'), normal: counts(s, 'normal'), nightmare: counts(s, 'nightmare') },
  }));
}
