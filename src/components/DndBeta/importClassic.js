// Brings a campaign from the classic D&D Solo across to the beta (29 Oct 2026, Simon: "port the current campaign with
// noddy into the new beta service"). The hero, his vitals, kit, skills and masteries are carried as they stand. The
// classic has no map, so the chambers its story passed through (found the same way the classic's own map finds them)
// become cleared places on the beta map, and the turns of the story are kept in the Log. A fight in progress is not
// carried: the beta only has three creature stat blocks so far, so he picks up in a quiet moment.
import * as E from './kn/engine';

// chambers from the story, grouped as the classic map does
function chambersOf(turns) {
  const kw = /ossuary|crypt|sepulchre|vault|gallery|reliquary|sluice|conduit|cruciform|sarcophagus|catacomb|shrine|chamber|maw|nave|hall|chasm|passage|sanctum/i;
  const name = (raw, prev) => {
    const m = String(raw || '').match(/(?:in the|into the|of the|of|at the)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    if (m && kw.test(m[1])) return m[1];
    if (kw.test(raw || '')) return raw;
    return prev || raw || 'A dark chamber';
  };
  const rooms = []; let cur = null;
  for (const t of turns) {
    const ss = t.scene_state || {}; const title = String(ss.scene_title || 'A dark chamber').trim();
    const move = /wade|move|advance|enter|head|descend|ascend|portal|door|corridor|passage|crawlway|archway|retreat|return|open the|step/i.test(t.player_action || '');
    const nm = name(title, cur?.name);
    if (!cur || (move && cur.name !== nm)) {
      if (cur) rooms.push(cur);
      cur = { name: nm, desc: ss.situation || String(t.dm_narrative || '').slice(0, 280), turns: [t.turn_number] };
    } else { cur.turns.push(t.turn_number); if (ss.situation) cur.desc = ss.situation; }
  }
  if (cur) rooms.push(cur);
  return rooms;
}

const SKILL = /^(.*?)\s*\((\d+)%\)\s*(.*)$/;
function convertHero(ch) {
  const trk = Object.fromEntries((ch.trackers || []).map((t) => [t.name, t]));
  const val = (n, d) => (trk[n] ? Number(trk[n].value ?? trk[n].start ?? d) : d);
  const max = (n, d) => (trk[n] ? Number(trk[n].max ?? d) : d);
  const attrs = ch.attributes || {}; const skills = {}, marks = {};
  for (const raw of ch.spells_or_skills || []) {
    const m = String(raw).match(SKILL); if (!m) continue;
    skills[m[1].trim()] = Number(m[2]); if (/✓/.test(m[3] || raw)) marks[m[1].trim()] = true;
  }
  const inv = ch.inventory || []; const items = { rations: 0, bandages: 0, crafting: 0, cooking: 0, coins: 0, torches: 0, tinder: 0 }; const misc = [];
  for (const it of inv) {
    const t = String(it);
    if (/pickaxe|breastplate/i.test(t)) continue;
    if (/cooking ingredient/i.test(t)) items.cooking += 1;
    else if (/ration/i.test(t)) items.rations += 1;
    else if (/torch/i.test(t)) items.torches += 1;
    else if (/tinder/i.test(t)) items.tinder += 1;
    else if (/bandage/i.test(t)) items.bandages += 1;
    else misc.push(t);
  }
  const masteries = ch.masteries || []; const has = (n) => masteries.some((m) => new RegExp(n, 'i').test(m.name));
  const pick = inv.find((x) => /pickaxe/i.test(x));
  const shaft = Object.keys(skills).find((k) => /shafted/i.test(k)) || 'Shafted Weapons';
  const weapons = [];
  if (pick) weapons.push({ name: 'Mining Pickaxe', dmg: 'd6', speed: 0, skill: shaft, parry: false, bonus: has('weapon master') ? 'd4' : null });
  weapons.push({ name: 'Fists', dmg: 'd4', speed: 0, skill: Object.keys(skills).find((k) => /unarmed/i.test(k)) || 'Unarmed Combat & Fist Weapons', parry: false });
  const hasPlate = inv.some((x) => /breastplate/i.test(x));
  return {
    name: ch.name, level: ch.level || 1, role: ch.role_or_class, avatar: ch.avatar_url || null, backstory: ch.notes || '',
    resist: { Endurance: attrs.Endurance ?? 20, Resolve: attrs.Resolve ?? 20, Spellward: attrs.Spellward ?? 20 },
    skills, weapons, wield: 0, armor: hasPlate ? { Torso: Number(ch.ac) || 3 } : {},
    vit: { maxHealth: ch.max_hp, health: ch.hp, maxTough: max('Toughness', 30), tough: val('Toughness', 30), maxAether: max('Aether', 10), aether: val('Aether', 10), maxSanity: max('Sanity', 12), sanity: val('Sanity', 12), exh: val('Exhaustion', 0), light: val('Light', 10), xp: val('XP', 0) },
    items: { ...items, lockpicks: 0, tools: 0 }, misc, effects: [], madness: [], marks, rot: val('The Rot', 0), masteries,
    armorName: inv.find((x) => /breastplate|armou?r|mail/i.test(x)) || null, goals: '', notes: '', wounds: [], perks: [], dmgMod: 0,
    mods: { advantage: has('tracker') ? ['Scavenge', 'Perception'] : [], scavengeCooking: has('tracker') },
    hb: { d6: 0, d4: 0 }, imported: true,
  };
}

// the story so far, cut at the last full sentence that fits
const sentences = (t, n) => {
  const x = String(t).trim();
  if (x.length <= n) return x;
  const cut = x.slice(0, n);
  const i = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
  return i > 200 ? cut.slice(0, i + 1) : `${cut.trim()}...`;
};

export function fromClassic(c) {
  const ch = c.character; if (!ch) throw new Error('That campaign has no hero.');
  const hero = convertHero(ch);
  let st = E.newGame(hero, c.title);
  st.source = { classic: c.id, turns: c.turn_count || (c.turns || []).length };
  const tension = (ch.trackers || []).find((t) => t.name === 'Tension Die'); if (tension) st.domain.tension = Number(tension.value) || 8;
  st.pieces[0].title = 'Where you woke';
  st = E.appendImported(st, chambersOf(c.turns || []));
  st.log.push({ id: `imp-${c.id}`, kind: 'room', title: 'The story so far', text: sentences(c.story_so_far || c.notes || '', 900) || 'The story so far was not kept.', rolls: [], tags: [] });
  if (c.current_scene) st.log.push({ id: `imp-${c.id}-now`, kind: 'note', title: 'Where the tale stands', text: `${c.current_scene}`, rolls: [] });
  st.imported = (c.turns || []).map((t) => ({ n: t.turn_number, action: t.player_action, text: t.dm_narrative }));
  st.updated = Date.now();
  return st;
}
