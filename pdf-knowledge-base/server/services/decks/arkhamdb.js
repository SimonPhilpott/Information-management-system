// ArkhamDB (arkhamdb.com) - the card database and deck site for Arkham Horror: The Card Game. Public,
// read-only JSON API: every card (player and encounter), every pack, published decklists and decks their
// owners have made public. A deck's investigator is kept where a LOTR deck keeps its heroes.
const BASE = 'https://arkhamdb.com';

const plain = (html) => String(html || '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/?(b|i|em|strong|cite|u)>/gi, '').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(90000) });
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !type.includes('json')) return null;
  return res.json();
}

export async function fetchCardData() {
  const [cards, packs] = await Promise.all([getJson(`${BASE}/api/public/cards/?encounter=1`), getJson(`${BASE}/api/public/packs/`)]);
  if (!Array.isArray(cards) || !Array.isArray(packs)) throw new Error('ArkhamDB did not return its card list.');
  return {
    packs: packs.map((p) => ({ code: p.code, name: p.name, position: p.position, cycle: p.cycle_position, released: p.available || null })),
    cards: cards.filter((c) => !c.hidden || c.type_code === 'investigator').map((c) => ({
      code: c.code, name: c.name, subname: c.subname || null, type: c.type_code, typeName: c.type_name,
      // the card's class plays the part a LOTR card's sphere does
      sphere: c.faction_code, sphereName: c.faction_name, sphere2: c.faction2_code || null,
      cost: c.cost ?? null, xp: c.xp ?? null, threat: null, willpower: c.skill_willpower ?? null, intellect: c.skill_intellect ?? null,
      combat: c.skill_combat ?? null, agility: c.skill_agility ?? null, wild: c.skill_wild ?? null,
      health: c.health ?? null, sanity: c.sanity ?? null, attack: null, defense: null, victory: c.victory ?? null, questPoints: null,
      traits: c.traits || '', text: plain(c.text), unique: Boolean(c.is_unique), deckLimit: c.deck_limit ?? 2,
      pack: c.pack_code, packName: c.pack_name, packs: [{ code: c.pack_code, qty: c.quantity ?? 1 }],
      encounter: c.encounter_name || null, encounterCode: c.encounter_code || null, position: c.position ?? null,
      restrictions: c.restrictions || null, deckOptions: c.deck_options || null, deckRequirements: c.deck_requirements || null,
      image: c.imagesrc ? BASE + c.imagesrc : null, url: c.url,
    })),
  };
}

// An ArkhamDB deck from a link or an id: /decklist/view/<id>/... (published), /deck/view/<id> (a deck made
// public in the owner's settings), or a bare number (tries both).
export function parseDeckRef(input) {
  const s = String(input || '').trim();
  let m = s.match(/arkhamdb\.com\/decklist\/(?:view\/)?(\d+)/i);
  if (m) return { kind: 'decklist', id: m[1] };
  m = s.match(/arkhamdb\.com\/deck\/(?:view\/)?(\d+)/i);
  if (m) return { kind: 'deck', id: m[1] };
  m = s.match(/^\d+$/);
  if (m) return { kind: 'either', id: s };
  throw new Error('That doesn\'t look like an ArkhamDB deck link - it should look like arkhamdb.com/decklist/view/12345/... or arkhamdb.com/deck/view/12345.');
}

export async function fetchDeck(ref) {
  const tries = ref.kind === 'decklist' ? ['decklist'] : ref.kind === 'deck' ? ['deck'] : ['decklist', 'deck'];
  for (const kind of tries) {
    const d = await getJson(`${BASE}/api/public/${kind}/${ref.id}.json`).catch(() => null);
    if (d && d.slots) {
      const heroes = d.investigator_code ? { [d.investigator_code]: 1 } : {};
      const slots = { ...d.slots };
      for (const code of Object.keys(heroes)) delete slots[code];
      return {
        kind, id: String(d.id), name: d.name, description: d.description_md || '',
        heroes, slots, sideslots: Array.isArray(d.sideSlots || d.sideslots) ? {} : (d.sideSlots || d.sideslots || {}),
        updatedAt: d.date_update || d.date_creation || null,
        url: `${BASE}/${kind === 'decklist' ? 'decklist/view' : 'deck/view'}/${d.id}`,
      };
    }
  }
  throw new Error(ref.kind === 'deck' || ref.kind === 'either'
    ? 'ArkhamDB would not share that deck. For a private deck, make your decks public in your ArkhamDB account settings, or publish it.'
    : 'ArkhamDB has no published decklist with that number.');
}

export const siteInfo = { name: 'ArkhamDB', url: BASE, newDeckUrl: `${BASE}/deck/new`, importUrl: `${BASE}/deck/import` };
