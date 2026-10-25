import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import db from '../db/database.js';
import config from '../config.js';
import { GoogleGenerativeAI } from './geminiClient.js';
import { getModelFor } from './modelRegistry.js';
import { searchRules, passagesText, fateDice } from './dndLibrary.js';
import { pickSoundscape } from './dndSoundscapes.js';

// The books in play in an adventure, and the hero's trackers (momentum, stress, sanity ...) - added 25 Oct 2026
try { db.exec('ALTER TABLE dnd_campaigns ADD COLUMN books_json TEXT'); } catch { /* already there */ }
try { db.exec('ALTER TABLE dnd_characters ADD COLUMN trackers_json TEXT'); } catch { /* already there */ }
// whose adventure it is: NULL for Simon, an invited guest's email for theirs
try { db.exec('ALTER TABLE dnd_campaigns ADD COLUMN owner TEXT'); } catch { /* already there */ }
export const campaignOwner = (id) => db.prepare('SELECT owner FROM dnd_campaigns WHERE id = ?').get(id);
export const characterCampaign = (charId) => db.prepare('SELECT id, owner FROM dnd_campaigns WHERE character_id = ?').get(charId);
export const turnCampaign = (turnId) => db.prepare('SELECT c.id, c.owner FROM dnd_turns t JOIN dnd_campaigns c ON c.id = t.campaign_id WHERE t.id = ?').get(turnId);

export const DND_BOOKS_ROOT = process.env.DND_BOOKS_PATH || 'G:\\My Drive\\BOOKS\\D&D';

const genId = (prefix) => `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

// Known metadata profiles for recognised solo RPG systems in Simon's library
const SYSTEM_METADATA = {
  'Across a Thousand Dead Worlds': {
    id: 'across-a-thousand-dead-worlds',
    name: 'Across a Thousand Dead Worlds',
    genre: 'Sci-Fi Deep Space Solo Crawler',
    dice_system: 'd20 / d100',
    description: 'Explore derelict alien vessels, planetside ruins, and uncharted systems as an ambitious Scavenger in the depths of hostile space.',
    character_template: {
      role_or_class: 'Deep Space Scavenger',
      hp: 20, max_hp: 20, ac: 12,
      attributes: { STR: 12, DEX: 14, CON: 13, INT: 14, WIS: 10, CHA: 8, Oxygen: 10, Morale: 10 },
      inventory: ['Stun Carbine', 'Light EVA Suit', 'Salvage Scanner', 'Emergency Oxygen Pack x2', 'Med-Gel Tube'],
      skills: ['Zero-G Maneuvering', 'Xeno-Tech Salvage', 'Tactical Firearms', 'Breaching']
    }
  },
  'Alien RPG': {
    id: 'alien-rpg',
    name: 'Alien RPG (Heart of Darkness & Building Better Worlds)',
    genre: 'Cinematic Sci-Fi Survival Horror',
    dice_system: 'd6 Dice Pool (Base + Stress)',
    description: 'Harsh, unforgiving sci-fi horror in the frontier of deep space. Face corporate greed, dwindling supplies, mounting panic, and deadly xenomorphs.',
    character_template: {
      role_or_class: 'Colonial Marine / Field Specialist',
      hp: 10, max_hp: 10, ac: 3,
      attributes: { Strength: 4, Agility: 3, Wits: 4, Empathy: 3, Stress: 1 },
      inventory: ['M41A Pulse Rifle', 'Motion Tracker', 'Personal Medkit', 'Strobe Flare x3'],
      skills: ['Ranged Combat 2', 'Mobility 1', 'Observation 2', 'Survival 1']
    }
  },
  'Barbarian Prince': {
    id: 'barbarian-prince',
    name: 'Barbarian Prince',
    genre: 'Classic Heroic Solo Quest',
    dice_system: '2d6',
    description: 'Prince Cal Arath of the North has been overthrown. Solo hex-crawling across dangerous wild lands to raise 500 gold pieces and reclaim your ancestral throne.',
    character_template: {
      role_or_class: 'Exiled Barbarian Prince',
      hp: 18, max_hp: 18, ac: 14,
      attributes: { Combat: 8, Endurance: 9, Wit: 6, Gold: 15 },
      inventory: ['Broadsword', 'Chainmail Hauberk', 'Rations (5 days)', 'Map of the Northlands'],
      skills: ['Wilderness Tracking', 'Mounted Combat', 'Intimidation']
    }
  },
  'CAMPFIRE STORY': {
    id: 'campfire-story',
    name: 'CAMPFIRE STORY',
    genre: 'Atmospheric Solo Folk Horror',
    dice_system: 'd6 / Story Prompts',
    description: 'A solitary storytelling tabletop experience where eerie tales, rural legends, and uncanny encounters unfold by the dying embers of a forest campfire.',
    character_template: {
      role_or_class: 'Night Traveller / Chronicler',
      hp: 6, max_hp: 6, ac: 10,
      attributes: { Courage: 3, Perception: 4, Intuition: 3, Sanity: 5 },
      inventory: ['Brass Oil Lantern', 'Worn Journal', 'Matches', 'Heavy Woollen Coat'],
      skills: ['Ghost Lore', 'Woodcraft', 'Storycraft']
    }
  },
  'Doom Pilgrim': {
    id: 'doom-pilgrim',
    name: 'Doom Pilgrim',
    genre: 'Grim Dark Fantasy Solo RPG',
    dice_system: 'd6 / Cards',
    description: 'A dark, punishing solo pilgrimage through ruined sanctuaries, cursed catacombs, and forsaken lands where faith and steel battle creeping doom.',
    character_template: {
      role_or_class: 'Penitent Pilgrim',
      hp: 14, max_hp: 14, ac: 12,
      attributes: { Might: 3, Faith: 4, Cunning: 2, Fate: 3 },
      inventory: ['Spiked Flail', 'Sanctified Relic', 'Dried Rations', 'Flask of Holy Oil'],
      skills: ['Banish Unclean', 'Pain Resistance', 'Ancient Inscriptions']
    }
  },
  'Ker Nathalas': {
    id: 'ker-nethalas',
    name: 'Ker Nethalas: Into the Midnight Throne',
    genre: 'Solo Necro-Labyrinth Dungeon Crawl',
    dice_system: 'd100',
    description: 'Awake in an endless, subterranean necropolis of stone and bone with no memory. Scavenge remnants, avoid abominations, and delve towards the Midnight Throne.',
    character_template: {
      role_or_class: 'Survivor of the Necropolis',
      hp: 16, max_hp: 16, ac: 11,
      attributes: { Strength: 45, Agility: 50, Presence: 40, Toughness: 45, Sanity: 40 },
      inventory: ['Rusty Cleaver', 'Torn Leather Jerkin', 'Tinderbox', 'Torch x2', 'Bone Dagger'],
      skills: ['Stealth', 'Dungeon Navigation', 'Weapon Crafting']
    }
  },
  'Last Days Zombie Apocalypse': {
    id: 'last-days-zombie-apocalypse',
    name: 'Last Days: Zombie Apocalypse',
    genre: 'Tactical Post-Apocalyptic Skirmish & Solo Campaign',
    dice_system: 'd6',
    description: 'Lead a small group of desperate survivors through the ruins of civilisation. Fortify your refuge, scrounge supplies, and fend off hordes and rival scavengers.',
    character_template: {
      role_or_class: 'Refuge Leader / Scavenger',
      hp: 12, max_hp: 12, ac: 12,
      attributes: { Melee: 3, Shooting: 4, Agility: 3, Resilience: 4, Leadership: 4 },
      inventory: ['Hunting Shotgun (6 shells)', 'Machete', 'Field Radio', 'First Aid Kit'],
      skills: ['Barricade Construction', 'Scavenging', 'Inspiring Shout']
    }
  },
  'Thousand Year Old Campfire': {
    id: 'thousand-year-old-campfire',
    name: 'Thousand Year Old Campfire',
    genre: 'Contemplative Solo Journaling RPG',
    dice_system: 'd10 / d6',
    description: 'A poetic, introspective solo journaling RPG tracking centuries of wandering, fading memories, loss, and immortal encounters across changing epochs.',
    character_template: {
      role_or_class: 'Immortal Wanderer',
      hp: 10, max_hp: 10, ac: 10,
      attributes: { Memories: 5, Relics: 3, Year: 1, Solitude: 4 },
      inventory: ['Faded Locket with Portrait', 'Carved Walking Staff', 'Blank Chronicle Vellum'],
      skills: ['Languages of Old', 'Enduring Memory', 'Herbalism']
    }
  },
  'D&D 5th Edition Solo': {
    id: 'dnd-5e-solo',
    name: 'Dungeons & Dragons 5th Edition (Solo DM)',
    genre: 'High Fantasy Heroic Adventure',
    dice_system: 'd20 System (Advantage/Disadvantage)',
    description: 'Classic 5th Edition D&D solo adventures. Roll up brave heroes, explore perilous forgotten ruins, slay ferocious monsters, and uncover legendary treasures.',
    character_template: {
      role_or_class: 'Fighter (Champion)',
      hp: 22, max_hp: 22, ac: 16,
      attributes: { STR: 16, DEX: 14, CON: 15, INT: 10, WIS: 12, CHA: 10 },
      inventory: ['Longsword (1d8+3)', 'Shield (+2 AC)', 'Chain Shirt', 'Explorer Pack', 'Potion of Healing x2', '25 GP'],
      skills: ['Athletics (+5)', 'Perception (+3)', 'Survival (+3)', 'Second Wind (1d10+2)']
    }
  }
};

/**
 * Recursively scans directory and catalogs D&D / Solo RPG assets
 */
export function scanDndLibrary(targetDir = DND_BOOKS_ROOT) {
  const discovered = {};

  // (no built-in D&D 5e entry any more - only the games in the D&D folder are played)

  if (!fs.existsSync(targetDir)) {
    console.warn(`[DndSolo] Target directory not found: ${targetDir}. Returning cached or virtual sets.`);
    // Return existing sets from database if path is temporarily unmounted
    const rows = db.prepare('SELECT * FROM dnd_rulesets').all();
    if (rows.length) {
      return rows.map((r) => {
        try { r.metadata = JSON.parse(r.metadata_json || '{}'); } catch { r.metadata = {}; }
        return r;
      });
    }
  } else {
    try {
      const topEntries = fs.readdirSync(targetDir, { withFileTypes: true });
      for (const entry of topEntries) {
        if (!entry.isDirectory()) continue;
        const subfolderName = entry.name;
        const subfolderPath = path.join(targetDir, subfolderName);

        // Match against known profiles or use folder name
        const metaKey = Object.keys(SYSTEM_METADATA).find((k) =>
          subfolderName.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(subfolderName.toLowerCase())
        );

        const baseProfile = metaKey ? SYSTEM_METADATA[metaKey] : {
          id: subfolderName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          name: subfolderName,
          genre: 'Solo RPG Adventure',
          dice_system: 'd20 / d6',
          description: `Solo tabletop adventure module and sourcebooks for ${subfolderName}.`,
          character_template: {
            role_or_class: 'Adventurer',
            hp: 20, max_hp: 20, ac: 10,
            attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
            inventory: ['Basic Gear', 'Rations', 'Torch'],
            skills: ['Investigation', 'Perception']
          }
        };

        const books = [];
        const maps = [];
        const sheets = [];
        const tokens = [];

        function walk(currentDir) {
          try {
            const files = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const file of files) {
              const fullPath = path.join(currentDir, file.name);
              const relativePath = path.relative(targetDir, fullPath).replace(/\\/g, '/');
              if (file.isDirectory()) {
                walk(fullPath);
              } else {
                const lower = file.name.toLowerCase();
                const item = {
                  filename: file.name,
                  path: relativePath,
                  fullPath: fullPath,
                  size: fs.statSync(fullPath).size
                };

                if (lower.endsWith('.pdf')) {
                  if (lower.includes('sheet') || lower.includes('form') || lower.includes('roster') || lower.includes('log')) {
                    sheets.push(item);
                  } else {
                    books.push(item);
                  }
                } else if (lower.endsWith('.jpg') || lower.endsWith('.png') || lower.endsWith('.webp')) {
                  if (lower.includes('token') || lower.includes('counter')) {
                    tokens.push(item);
                  } else if (lower.includes('battlemap') || lower.includes('map') || lower.includes('grid')) {
                    maps.push(item);
                  } else {
                    maps.push(item);
                  }
                } else if (lower.endsWith('.zip') && lower.includes('map')) {
                  maps.push(item);
                }
              }
            }
          } catch (_) {}
        }

        walk(subfolderPath);

        discovered[baseProfile.id] = {
          ...baseProfile,
          path: subfolderPath,
          books,
          maps,
          sheets,
          tokens
        };
      }
    } catch (err) {
      console.error('[DndSolo] Failed scanning library folder:', err.message);
    }
  }

  // Persist into SQLite table dnd_rulesets
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO dnd_rulesets (
      id, name, path, description, genre, dice_system, books_count, maps_count, sheets_count, metadata_json, last_scanned
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  for (const found of Object.values(discovered)) {
    // a game already found in the library index and studied keeps its profile and books; the folder scan adds its maps
    let prev = {};
    try { prev = JSON.parse(db.prepare('SELECT metadata_json FROM dnd_rulesets WHERE id = ?').get(found.id)?.metadata_json || '{}'); } catch { /* none */ }
    const set = prev.studied_at ? { ...found, ...prev, maps: found.maps, sheets: found.sheets, tokens: found.tokens, folder_books: found.books } : { ...prev, ...found };
    insertStmt.run(
      set.id,
      set.name,
      set.path || found.path,
      set.description,
      set.genre,
      set.dice_system,
      Math.max((set.books || []).length, (set.files || []).length),
      (set.maps || []).length,
      (set.sheets || []).length,
      JSON.stringify(set),
      now
    );
  }

  return Object.values(discovered);
}

export function getRulesets() {
  const rows = db.prepare('SELECT * FROM dnd_rulesets ORDER BY name ASC').all();
  if (!rows.length) {
    return scanDndLibrary();
  }
  return rows.map((r) => {
    try { r.metadata = JSON.parse(r.metadata_json || '{}'); } catch { r.metadata = {}; }
    return r;
  });
}

export function getRuleset(id) {
  const row = db.prepare('SELECT * FROM dnd_rulesets WHERE id = ?').get(id);
  if (!row) return null;
  try { row.metadata = JSON.parse(row.metadata_json || '{}'); } catch { row.metadata = {}; }
  return row;
}

// -------------------------------------------------------------
// Characters
// -------------------------------------------------------------
// The page and older callers send snake_case or camelCase; both are taken (25 Oct 2026: the page sent
// ruleset_id / role_or_class / max_hp / skills / backstory, the service read only camelCase, so every hero was saved
// as a classless 20 HP adventurer with no skills or backstory).
const pick = (o, ...keys) => { for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k]; return undefined; };

export function createCharacter(body = {}) {
  const id = genId('char');
  const now = new Date().toISOString();
  const maxHp = Number(pick(body, 'maxHp', 'max_hp', 'hp')) || 20;
  db.prepare(`
    INSERT INTO dnd_characters (
      id, name, ruleset_id, role_or_class, level, hp, max_hp, ac,
      attributes_json, inventory_json, spells_or_skills_json, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, String(pick(body, 'name') || 'Hero of the Realm'), String(pick(body, 'rulesetId', 'ruleset_id') || 'dnd-5e-solo'),
    String(pick(body, 'roleOrClass', 'role_or_class') || 'Adventurer'), Number(pick(body, 'level')) || 1,
    Number(pick(body, 'hp')) || maxHp, maxHp, Number(pick(body, 'ac')) || 10,
    JSON.stringify(pick(body, 'attributes') || {}), JSON.stringify(pick(body, 'inventory') || []),
    JSON.stringify(pick(body, 'spellsOrSkills', 'spells_or_skills', 'skills') || []),
    String(pick(body, 'notes', 'backstory') || ''), now, now
  );
  if (Array.isArray(body.trackers) && body.trackers.length) return updateCharacter(id, { trackers: body.trackers });
  return getCharacter(id);
}

export function getCharacter(id) {
  const r = db.prepare('SELECT * FROM dnd_characters WHERE id = ?').get(id);
  if (!r) return null;
  try { r.attributes = JSON.parse(r.attributes_json || '{}'); } catch { r.attributes = {}; }
  try { r.inventory = JSON.parse(r.inventory_json || '[]'); } catch { r.inventory = []; }
  try { r.spells_or_skills = JSON.parse(r.spells_or_skills_json || '[]'); } catch { r.spells_or_skills = []; }
  try { r.trackers = JSON.parse(r.trackers_json || '[]'); } catch { r.trackers = []; }
  return r;
}

export function updateCharacter(id, updates = {}) {
  const c = getCharacter(id);
  if (!c) throw new Error('Character not found');
  const val = (v, fallback) => (v !== undefined ? v : fallback);
  const maxHp = Number(val(pick(updates, 'maxHp', 'max_hp'), c.max_hp));
  const hp = Math.max(0, Math.min(maxHp, Number(val(pick(updates, 'hp'), c.hp))));
  db.prepare(`
    UPDATE dnd_characters SET
      name = ?, role_or_class = ?, hp = ?, max_hp = ?, ac = ?, level = ?, attributes_json = ?,
      inventory_json = ?, spells_or_skills_json = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `).run(
    String(val(pick(updates, 'name'), c.name)), String(val(pick(updates, 'roleOrClass', 'role_or_class'), c.role_or_class)),
    hp, maxHp, Number(val(pick(updates, 'ac'), c.ac)), Number(val(pick(updates, 'level'), c.level)),
    JSON.stringify(val(pick(updates, 'attributes'), c.attributes)), JSON.stringify(val(pick(updates, 'inventory'), c.inventory)),
    JSON.stringify(val(pick(updates, 'spellsOrSkills', 'spells_or_skills', 'skills'), c.spells_or_skills)),
    String(val(pick(updates, 'notes', 'backstory'), c.notes || '')), new Date().toISOString(), id
  );
  if (Array.isArray(updates.trackers)) {
    const clean = updates.trackers.map((t) => ({ name: String(t.name), min: Number(t.min) || 0, max: Number(t.max) || 10, value: Math.max(Number(t.min) || 0, Math.min(Number(t.max) || 10, Number(t.value) || 0)), about: t.about || '' }));
    db.prepare('UPDATE dnd_characters SET trackers_json = ? WHERE id = ?').run(JSON.stringify(clean), id);
  }
  return getCharacter(id);
}

// -------------------------------------------------------------
// Campaigns
// -------------------------------------------------------------

// owner: null for Simon's own, a guest's email for theirs
export function getCampaigns(owner = null) {
  return db.prepare(`
    SELECT c.id, c.title, c.ruleset_id, c.setting, c.character_id, c.current_scene, c.turn_count, c.status, c.created_at, c.updated_at,
      r.name as ruleset_name, r.genre, ch.name as character_name, ch.role_or_class as character_class, ch.hp, ch.max_hp
    FROM dnd_campaigns c
    LEFT JOIN dnd_rulesets r ON c.ruleset_id = r.id
    LEFT JOIN dnd_characters ch ON c.character_id = ch.id
    WHERE c.owner IS ?
    ORDER BY c.updated_at DESC
  `).all(owner);
}

export function getCampaign(id) {
  const c = db.prepare(`
    SELECT c.*, r.name as ruleset_name, r.genre, r.dice_system
    FROM dnd_campaigns c
    LEFT JOIN dnd_rulesets r ON c.ruleset_id = r.id
    WHERE c.id = ?
  `).get(id);
  if (!c) return null;
  const character = c.character_id ? getCharacter(c.character_id) : null;
  const turns = db.prepare('SELECT * FROM dnd_turns WHERE campaign_id = ? ORDER BY turn_number ASC').all(id);
  turns.forEach((t) => {
    try { t.dice_rolls = JSON.parse(t.dice_rolls_json || '[]'); } catch { t.dice_rolls = []; }
    try { t.scene_state = JSON.parse(t.scene_state_json || '{}'); } catch { t.scene_state = {}; }
    delete t.dice_rolls_json; delete t.scene_state_json;
  });
  // notes holds the story so far (the long memory the DM reads); books: the ids of the books in play
  let books = [];
  try { books = JSON.parse(c.books_json || '[]'); } catch { /* none */ }
  return { ...c, books, story_so_far: c.notes || '', character, turns };
}

// The campaign and its hero go together
export function deleteCampaign(id) {
  const c = db.prepare('SELECT character_id FROM dnd_campaigns WHERE id = ?').get(id);
  db.prepare('DELETE FROM dnd_turns WHERE campaign_id = ?').run(id);
  db.prepare('DELETE FROM dnd_campaigns WHERE id = ?').run(id);
  if (c?.character_id) {
    const stillUsed = db.prepare('SELECT 1 FROM dnd_campaigns WHERE character_id = ?').get(c.character_id);
    if (!stillUsed) db.prepare('DELETE FROM dnd_characters WHERE id = ?').run(c.character_id);
  }
  return { success: true };
}

// -------------------------------------------------------------
// Dice & the oracle
// -------------------------------------------------------------

// count, sides (or diceType 'd8'), modifier, advantage/disadvantage. values: the faces the 3D dice in the tray landed on,
// when the roll was a physical one - kept as they fell (if they're possible faces), so the record matches the tray.
export function rollDice(body = {}) {
  const { modifier = 0, advantage = false, disadvantage = false, values = null } = body;
  const sides = Number(body.sides) || Number(String(body.diceType || '').replace(/^d/i, '')) || 20;
  const n = Math.max(1, Math.min(20, Number(body.count) || 1));
  const face = () => Math.floor(Math.random() * sides) + 1;
  const given = Array.isArray(values) && values.every((v) => Number.isInteger(v) && v >= 1 && v <= sides) ? values : null;
  const pair = n === 1 && sides === 20 && (advantage || disadvantage);
  const rolls = given ? given.slice(0, pair ? 1 : n) : Array.from({ length: n }, face);
  while (rolls.length < n) rolls.push(face());
  let kept = rolls.reduce((a, b) => a + b, 0);
  let secondRoll = null;
  if (pair) {
    secondRoll = given && given.length > 1 ? given[1] : face();
    kept = advantage ? Math.max(rolls[0], secondRoll) : Math.min(rolls[0], secondRoll);
  }
  const mod = Number(modifier) || 0;
  return {
    formula: `${n}d${sides}${mod ? (mod > 0 ? `+${mod}` : mod) : ''}`, label: body.label || null,
    rolls, secondRoll, advantage: Boolean(advantage), disadvantage: Boolean(disadvantage), modifier: mod,
    kept, total: kept + mod, dc: Number(body.dc) || null,
    success: Number(body.dc) ? kept + mod >= Number(body.dc) : null,
    isCrit: sides === 20 && kept === 20, isFumble: sides === 20 && kept === 1,
  };
}

// A yes/no question to fate: a d20 against the odds; 1-2 and 19-20 add "and" / "but".
export function consultOracle(body = {}) {
  const odds = String(body.odds || body.likelihood || '50/50');
  const targets = { impossible: 19, unlikely: 15, '50_50': 11, likely: 7, almost_certain: 3 };
  const target = targets[odds.toLowerCase().replace(/[^a-z0-9]+/g, '_')] || 11;
  const roll = Math.floor(Math.random() * 20) + 1;
  const yes = roll >= target;
  let outcome = yes ? 'Yes' : 'No';
  if (roll >= 19) outcome = yes ? 'Yes, and...' : 'No, but...';
  else if (roll <= 2) outcome = yes ? 'Yes, but...' : 'No, and...';
  return { question: String(body.question || ''), odds, roll, target, outcome };
}

// -------------------------------------------------------------
// The Dungeon Master (Rindewind, the old wizard-chronicler)
// -------------------------------------------------------------
// Each turn the DM answers in a fixed shape: the narrative, what's in front of you now, three options, the check to
// roll if one is needed, and what happened to the hero (HP, kit). The page shows the options and a one-tap roll for
// the check; HP and kit change on the sheet by themselves. A summary of the story so far is kept and re-written every
// few turns, so the DM remembers the whole adventure, not just the last few exchanges.

const MOODS = ['neutral', 'joy', 'fear', 'rage', 'amazement', 'suspicious', 'sad'];
const ATMOSPHERES = ['dungeon', 'campfire', 'tavern', 'scifi', 'storm'];
const TURN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    scene_title: { type: 'STRING' },
    narrative: { type: 'STRING' },
    situation: { type: 'STRING' },
    options: { type: 'ARRAY', items: { type: 'STRING' } },
    check: {
      type: 'OBJECT',
      properties: { needed: { type: 'BOOLEAN' }, label: { type: 'STRING' }, attribute: { type: 'STRING' }, dice: { type: 'STRING' }, dc: { type: 'INTEGER' }, why: { type: 'STRING' } },
      required: ['needed'],
    },
    hp_change: { type: 'INTEGER' },
    items_gained: { type: 'ARRAY', items: { type: 'STRING' } },
    items_lost: { type: 'ARRAY', items: { type: 'STRING' } },
    mood: { type: 'STRING', enum: MOODS },
    atmosphere: { type: 'STRING', enum: ATMOSPHERES },
    rules_used: { type: 'ARRAY', items: { type: 'INTEGER' } },
    tables_rolled: { type: 'ARRAY', items: { type: 'STRING' } },
    tracker_changes: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, change: { type: 'INTEGER' } }, required: ['name', 'change'] } },
  },
  required: ['scene_title', 'narrative', 'situation', 'options', 'check', 'hp_change', 'mood', 'atmosphere'],
};

const model = (temperature = 0.85, schema = TURN_SCHEMA) => new GoogleGenerativeAI(config.geminiApiKey).getGenerativeModel({
  model: getModelFor('campaigns') || 'gemini-2.5-flash',
  generationConfig: { temperature, maxOutputTokens: 4000, responseMimeType: 'application/json', responseSchema: schema },
});

function sheetText(ch) {
  if (!ch) return 'No character sheet.';
  return `Name: ${ch.name} | Class/role: ${ch.role_or_class || 'Adventurer'} | Level ${ch.level} | HP ${ch.hp}/${ch.max_hp} | AC ${ch.ac}
Attributes: ${Object.entries(ch.attributes || {}).map(([k, v]) => `${k} ${v}`).join(', ')}
Kit: ${(ch.inventory || []).join('; ') || 'nothing'}${(ch.trackers || []).length ? `\nTrackers: ${ch.trackers.map((t) => `${t.name} ${t.value} (${t.min} to ${t.max})`).join(', ')}` : ''}
Skills & abilities: ${(ch.spells_or_skills || []).join('; ') || 'none'}${ch.notes ? `\nBackstory: ${ch.notes}` : ''}`;
}

const RULES = `HOW YOU RUN THE GAME:
- You are Rindewind, an ancient wizard-chronicler acting as Dungeon Master for a solo player, Simon. Write in British English: vivid, sensory, atmospheric - shadow, smell, sound - and fair. 2-4 short paragraphs of narrative, no headings, no bullet points, no markdown, no lists of options inside the narrative.
- Run the chosen system's rules and tone faithfully (its dice, its stats, its dangers). Never decide the player's actions or feelings for him.
- Ask for a check (check.needed true) only when the outcome is genuinely uncertain and failure would matter. Give the check a short label (e.g. "Athletics", "Stealth", "Attack with the longsword", "Sanity"), the attribute from his sheet it uses (exactly as written there, or "" if none fits), the dice (e.g. "1d20", "1d100", "2d6") and a fair DC/target for the system. If no check is needed, set needed false and leave the rest empty.
- When he has just rolled, honour the result exactly: at or above the DC succeeds, below fails; a natural 20 is a triumph, a natural 1 a mishap. Narrate the consequence.
- hp_change: the HP he gained (+) or lost (-) this turn from what you narrated, 0 if none. items_gained / items_lost: kit that changed hands this turn, written as it should appear on his sheet (lost items exactly as on the sheet). Be consistent: if he drinks a potion, it is lost and he heals.
- At 0 HP he is down and dying by the system's rules - make it dramatic, not instantly fatal unless the system says so.
- options: exactly 3 short, distinct things he could do next (under 12 words each, in the second person imperative, e.g. "Force the rusted portcullis").
- situation: one sentence on where things stand right now.
- mood: the feeling of this moment, for the narrator's face. atmosphere: the soundscape that suits the scene.
- RULES FROM HIS BOOKS (when given) are the real rules of his game: follow them over anything you remember, use their terms, numbers and tables, and list the [n] of the passages you actually relied on in rules_used.
- tracker_changes: changes this turn to his trackers (named exactly as on his sheet), e.g. momentum +2 after a strong hit, supply -1 - by the game's rules. Empty if none.
- FATE DICE (when given) are real rolls: whenever the book or the moment calls for a random table, encounter, loot or event, read it with these dice (in order) instead of choosing, and say what was rolled in tables_rolled, e.g. "Encounter table (d100 37): a starving ghoul". Never invent a roll.`;

async function generateTurn(campaign, { playerAction, diceRoll, oracleResult, opening = false }) {
  const ruleset = getRuleset(campaign.ruleset_id);
  const profile = ruleset?.metadata || {};
  const lastState = campaign.turns[campaign.turns.length - 1]?.scene_state || {};
  // the pages of his books that bear on this moment
  const inPlay = (profile.files || []).filter((f) => (campaign.books || []).includes(f.id) && f.role && f.role !== 'core' && f.role !== 'sheet');
  const passages = await searchRules(ruleset, opening
    ? `${campaign.ruleset_name}: starting an adventure, the first scene, setting up a solo game ${campaign.setting || ''}`
    : `${playerAction}. ${lastState.situation || ''} ${lastState.check?.label || ''} ${diceRoll?.label || ''}`, 5, campaign.books?.length ? campaign.books : null);
  const fate = fateDice();
  const recent = campaign.turns.slice(-8).map((t) => (t.turn_number === 0
    ? `Opening scene:\n${t.dm_narrative}`
    : `Turn ${t.turn_number} - Simon: ${t.player_action}${t.dice_rolls?.[0] ? ` [rolled ${t.dice_rolls[0].label || t.dice_rolls[0].formula}: ${t.dice_rolls[0].total}${t.dice_rolls[0].dc ? ` vs DC ${t.dice_rolls[0].dc}` : ''}]` : ''}\nDM: ${t.dm_narrative}`)).join('\n\n');
  const lastCheck = campaign.turns[campaign.turns.length - 1]?.scene_state?.check;
  const roll = diceRoll?.outcome ? `HE ROLLED${diceRoll.label ? ` for ${diceRoll.label}` : ''}: ${diceRoll.formula} - ${diceRoll.detail || ''} => ${diceRoll.outcome}. Honour it exactly.` : diceRoll ? `HE ROLLED${diceRoll.label ? ` for ${diceRoll.label}` : ''}: ${diceRoll.formula} = ${diceRoll.total}${diceRoll.rolls ? ` (dice ${[...diceRoll.rolls, ...(diceRoll.secondRoll != null ? [diceRoll.secondRoll] : [])].join(', ')}${diceRoll.advantage ? ', advantage' : diceRoll.disadvantage ? ', disadvantage' : ''})` : ''}${diceRoll.dc || lastCheck?.dc ? ` against DC ${diceRoll.dc || lastCheck.dc}` : ''}${diceRoll.isCrit ? ' - NATURAL 20' : ''}${diceRoll.isFumble ? ' - NATURAL 1' : ''}.` : '';
  const oracle = oracleResult ? `THE ORACLE: he asked "${oracleResult.question}" (odds ${oracleResult.odds}) and fate answered "${oracleResult.outcome}". That answer is true in the world - weave it in.` : '';
  const prompt = `${RULES}

SYSTEM: ${campaign.ruleset_name || 'Solo RPG'} - ${campaign.genre || 'fantasy'}. Dice: ${campaign.dice_system || 'd20'}.${profile.core_mechanic ? `\nHOW ACTIONS RESOLVE: ${profile.core_mechanic}` : ''}${profile.solo_play ? `\nHOW SOLO PLAY WORKS IN IT: ${profile.solo_play}` : ''}${profile.check_dice ? `\nAn ordinary check rolls ${profile.check_dice}.` : ''}${profile.hp_label ? ` Health is "${profile.hp_label}", defence "${profile.defence_label || 'AC'}".` : ''}
CAMPAIGN: "${campaign.title}". ${campaign.setting ? `Premise: ${campaign.setting}` : ''}${inPlay.length ? `\nBOOKS IN PLAY BEYOND THE CORE RULES (use their content; a SETTING is the world this adventure takes place in): ${inPlay.map((f) => `${f.filename.replace(/\.pdf$/i, '')} [${f.role}]${f.adds ? ` - ${f.adds}` : ''}`).join('; ')}. Books not listed are NOT in play.` : ''}

HIS SHEET:
${sheetText(campaign.character)}
${campaign.notes ? `\nTHE STORY SO FAR:\n${campaign.notes}\n` : ''}
${passages.length ? `RULES FROM HIS BOOKS:\n${passagesText(passages)}\n\n` : ''}FATE DICE: d6 ${fate.d6.join(', ')}; d8 ${fate.d8}; d10 ${fate.d10}; d12 ${fate.d12}; d20 ${fate.d20.join(', ')}; d66 ${fate.d66}; d100 ${fate.d100.join(', ')}.

${opening ? `Write the OPENING SCENE: set the scene and drop him straight into the first moment of the adventure with a hook${campaign.setting ? ' that follows the premise' : ''}. Nothing has happened to him yet (hp_change 0, no items).` : `RECENT TURNS:\n${recent}\n\nWHAT HE DOES NOW: "${playerAction}"\n${roll}\n${oracle}`}`;
  const res = await model().generateContent(prompt);
  let out;
  try { out = JSON.parse(res.response.text()); } catch { throw new Error('The Dungeon Master lost his thread - try that again.'); }
  out.options = (out.options || []).filter(Boolean).slice(0, 3);
  out.mood = MOODS.includes(out.mood) ? out.mood : 'neutral';
  out.atmosphere = ATMOSPHERES.includes(out.atmosphere) ? out.atmosphere : null;
  out.hp_change = Math.round(Number(out.hp_change) || 0);
  out.check = out.check?.needed ? { needed: true, label: out.check.label || 'Check', attribute: out.check.attribute || '', dice: /^\d*d\d+$/i.test(out.check.dice || '') ? out.check.dice.toLowerCase() : '1d20', dc: Number(out.check.dc) || null, why: out.check.why || '' } : { needed: false };
  out.narrative = String(out.narrative || '').replace(/\*\*?|__|^#+\s*/gm, '').trim();
  out.rules = [...new Map((out.rules_used || []).map((n) => passages[n - 1]).filter(Boolean).map(({ id, book, page }) => [`${id}:${page}`, { id, book, page }])).values()];
  out.tables_rolled = (out.tables_rolled || []).filter(Boolean).slice(0, 4);
  return out;
}

// HP and kit from the turn, onto the sheet; what it was before is kept so the turn can be undone
function applyToSheet(character, out) {
  if (!character) return { before: null, applied: { hp: 0, gained: [], lost: [] } };
  const before = { hp: character.hp, inventory: character.inventory };
  let inv = [...character.inventory];
  const lost = [];
  for (const item of out.items_lost || []) {
    const i = inv.findIndex((x) => x.toLowerCase() === String(item).toLowerCase());
    const j = i >= 0 ? i : inv.findIndex((x) => x.toLowerCase().includes(String(item).toLowerCase()) || String(item).toLowerCase().includes(x.toLowerCase()));
    if (j >= 0) { lost.push(inv[j]); inv.splice(j, 1); }
  }
  const gained = (out.items_gained || []).map(String).filter(Boolean);
  inv = [...inv, ...gained];
  const hp = Math.max(0, Math.min(character.max_hp, character.hp + out.hp_change));
  before.trackers = character.trackers;
  const moved = [];
  const trackers = (character.trackers || []).map((t) => {
    const ch = (out.tracker_changes || []).find((x) => String(x.name).toLowerCase() === t.name.toLowerCase());
    if (!ch || !ch.change) return t;
    const value = Math.max(t.min, Math.min(t.max, t.value + ch.change));
    if (value !== t.value) moved.push({ name: t.name, change: value - t.value });
    return { ...t, value };
  });
  updateCharacter(character.id, { hp, inventory: inv, trackers });
  return { before, applied: { hp: hp - character.hp, gained, lost, trackers: moved } };
}

function saveTurn(campaignId, number, playerAction, out, diceRoll, oracleResult, sheet) {
  db.prepare(`
    INSERT INTO dnd_turns (campaign_id, turn_number, player_action, dm_narrative, dice_rolls_json, scene_state_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(campaignId, number, playerAction, out.narrative, JSON.stringify(diceRoll ? [diceRoll] : []), JSON.stringify({
    scene_title: out.scene_title, situation: out.situation, options: out.options, check: out.check, mood: out.mood,
    atmosphere: out.atmosphere, oracle: oracleResult || null, applied: sheet.applied, before: sheet.before,
    rules: out.rules || [], tables_rolled: out.tables_rolled || [], soundscape: out.soundscape || null,
  }));
  db.prepare('UPDATE dnd_campaigns SET turn_count = ?, current_scene = ?, updated_at = ? WHERE id = ?')
    .run(number, out.situation || out.narrative.slice(0, 300), new Date().toISOString(), campaignId);
}

// Every 6 turns the story so far is re-written from the last summary and the turns since (in the background)
const SUMMARY_EVERY = 6;
async function refreshStorySoFar(campaignId) {
  const c = getCampaign(campaignId);
  if (!c) return;
  const since = c.turns.slice(-SUMMARY_EVERY).map((t) => `${t.turn_number ? `Simon: ${t.player_action}\n` : ''}DM: ${t.dm_narrative}`).join('\n\n');
  const res = await model(0.4, { type: 'OBJECT', properties: { summary: { type: 'STRING' } }, required: ['summary'] }).generateContent(
    `Keep a running summary of a solo tabletop campaign for its Dungeon Master: the places visited, people met (names!), threats, promises, clues, injuries, important kit and unresolved threads - everything needed to stay consistent. Under 300 words, plain prose, past tense.\n\nSUMMARY SO FAR:\n${c.notes || '(none yet)'}\n\nWHAT HAPPENED SINCE:\n${since}`);
  const summary = JSON.parse(res.response.text()).summary;
  if (summary) db.prepare('UPDATE dnd_campaigns SET notes = ? WHERE id = ?').run(summary, campaignId);
}

// A new campaign: its hero, then the DM writes the opening scene
export async function startCampaign(body = {}, owner = null) {
  const rulesetId = String(pick(body, 'rulesetId', 'ruleset_id') || 'dnd-5e-solo');
  const ruleset = getRuleset(rulesetId);
  const tpl = ruleset?.metadata?.character_template || {};
  const ch = body.character || {};
  const character = createCharacter({
    rulesetId, name: ch.name || body.characterName || 'Hero of the Realm',
    roleOrClass: ch.roleOrClass || tpl.role_or_class, hp: ch.maxHp || tpl.max_hp || tpl.hp, maxHp: ch.maxHp || tpl.max_hp || tpl.hp, ac: ch.ac || tpl.ac,
    attributes: ch.attributes || tpl.attributes, inventory: ch.inventory || tpl.inventory, spellsOrSkills: ch.skills || tpl.skills, notes: ch.backstory || '',
    trackers: (ruleset?.metadata?.trackers || []).map((t) => ({ name: t.name, min: t.min, max: t.max, value: t.start ?? t.min, about: t.about || '' })),
  });
  if (character.trackers?.length === 0 && (ruleset?.metadata?.trackers || []).length) updateCharacter(character.id, { trackers: ruleset.metadata.trackers.map((t) => ({ name: t.name, min: t.min, max: t.max, value: t.start ?? t.min, about: t.about || '' })) });
  // the books in play: the core rules always, plus the expansions / settings / supplements chosen
  const files = ruleset?.metadata?.files || [];
  const chosen = Array.isArray(body.books) ? body.books.map(String) : [];
  const books = [...new Set([...files.filter((f) => f.core || f.role === 'core').map((f) => f.id), ...chosen.filter((id) => files.some((f) => f.id === id))])];
  const id = genId('cmp');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO dnd_campaigns (id, title, ruleset_id, setting, character_id, current_scene, turn_count, status, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, '', 0, 'active', '', ?, ?)
  `).run(id, String(body.title || `${ruleset?.name || 'Solo'} campaign`), rulesetId, String(pick(body, 'premise', 'setting') || ''), character.id, now, now);
  db.prepare('UPDATE dnd_campaigns SET books_json = ?, owner = ? WHERE id = ?').run(JSON.stringify(books), owner, id);
  try {
    const out = await generateTurn(getCampaign(id), { opening: true });
    out.soundscape = await pickSoundscape({ title: out.scene_title, situation: out.situation, narrative: out.narrative, atmosphere: out.atmosphere, genre: ruleset?.metadata?.genre || ruleset?.genre }).catch(() => null);
    saveTurn(id, 0, '', out, null, null, { before: null, applied: { hp: 0, gained: [], lost: [] } });
  } catch (err) {
    deleteCampaign(id);
    throw err;
  }
  return getCampaign(id);
}

export async function processDmTurn({ campaignId, playerAction, diceRoll = null, oracleResult = null }) {
  const campaign = getCampaign(campaignId);
  if (!campaign) throw new Error('Campaign not found');
  const out = await generateTurn(campaign, { playerAction, diceRoll, oracleResult });
  const prevSound = [...campaign.turns].reverse().find((t) => t.scene_state?.soundscape)?.scene_state.soundscape || null;
  const rs = getRuleset(campaign.ruleset_id);
  out.soundscape = await pickSoundscape({ title: out.scene_title, situation: out.situation, narrative: out.narrative, atmosphere: out.atmosphere, genre: rs?.metadata?.genre || rs?.genre || campaign.genre }, prevSound).catch(() => prevSound);
  const sheet = applyToSheet(campaign.character, out);
  const number = (campaign.turns.length ? Math.max(...campaign.turns.map((t) => t.turn_number)) : 0) + 1;
  saveTurn(campaignId, number, playerAction, out, diceRoll, oracleResult, sheet);
  if (number % SUMMARY_EVERY === 0) refreshStorySoFar(campaignId).catch((e) => console.warn('[DndSolo] story so far:', e.message));
  return getCampaign(campaignId);
}

// Take back the last turn: the sheet goes back to how it was before it
export function undoLastTurn(campaignId) {
  const c = getCampaign(campaignId);
  if (!c) throw new Error('Campaign not found');
  const last = c.turns[c.turns.length - 1];
  if (!last || last.turn_number === 0) throw new Error('There is nothing to take back.');
  const before = last.scene_state?.before;
  if (before && c.character) updateCharacter(c.character.id, { hp: before.hp, inventory: before.inventory, ...(before.trackers ? { trackers: before.trackers } : {}) });
  db.prepare('DELETE FROM dnd_turns WHERE id = ?').run(last.id);
  const prev = c.turns[c.turns.length - 2];
  db.prepare('UPDATE dnd_campaigns SET turn_count = ?, current_scene = ?, updated_at = ? WHERE id = ?')
    .run(prev?.turn_number || 0, prev?.scene_state?.situation || '', new Date().toISOString(), campaignId);
  return { campaign: getCampaign(campaignId), action: last.player_action, roll: last.dice_rolls?.[0] || null };
}

export function getTurn(turnId) {
  const t = db.prepare('SELECT * FROM dnd_turns WHERE id = ?').get(turnId);
  if (!t) return null;
  try { t.scene_state = JSON.parse(t.scene_state_json || '{}'); } catch { t.scene_state = {}; }
  return t;
}
