import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import db from '../db/database.js';
import config from '../config.js';
import { GoogleGenerativeAI } from './geminiClient.js';

const DND_BOOKS_ROOT = process.env.DND_BOOKS_PATH || 'G:\\My Drive\\BOOKS\\D&D';

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

  // Always seed the standard D&D 5e Solo virtual ruleset
  discovered['dnd-5e-solo'] = {
    ...SYSTEM_METADATA['D&D 5th Edition Solo'],
    path: 'virtual',
    books: [],
    maps: [],
    sheets: [],
    tokens: []
  };

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
  for (const set of Object.values(discovered)) {
    insertStmt.run(
      set.id,
      set.name,
      set.path,
      set.description,
      set.genre,
      set.dice_system,
      (set.books || []).length,
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
// Character Management
// -------------------------------------------------------------

export function createCharacter({
  name,
  rulesetId,
  roleOrClass = '',
  level = 1,
  hp = 20,
  maxHp = 20,
  ac = 10,
  attributes = {},
  inventory = [],
  spellsOrSkills = [],
  notes = ''
}) {
  const id = genId('char');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO dnd_characters (
      id, name, ruleset_id, role_or_class, level, hp, max_hp, ac,
      attributes_json, inventory_json, spells_or_skills_json, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, name, rulesetId, roleOrClass, Number(level) || 1, Number(hp) || 20, Number(maxHp) || 20, Number(ac) || 10,
    JSON.stringify(attributes), JSON.stringify(inventory), JSON.stringify(spellsOrSkills), notes || '', now, now
  );
  return getCharacter(id);
}

export function getCharacter(id) {
  const r = db.prepare('SELECT * FROM dnd_characters WHERE id = ?').get(id);
  if (!r) return null;
  try { r.attributes = JSON.parse(r.attributes_json || '{}'); } catch { r.attributes = {}; }
  try { r.inventory = JSON.parse(r.inventory_json || '[]'); } catch { r.inventory = []; }
  try { r.spells_or_skills = JSON.parse(r.spells_or_skills_json || '[]'); } catch { r.spells_or_skills = []; }
  return r;
}

export function updateCharacter(id, updates = {}) {
  const current = getCharacter(id);
  if (!current) throw new Error('Character not found');

  const now = new Date().toISOString();
  const nextHp = updates.hp !== undefined ? Number(updates.hp) : current.hp;
  const nextMaxHp = updates.maxHp !== undefined ? Number(updates.maxHp) : current.max_hp;
  const nextAc = updates.ac !== undefined ? Number(updates.ac) : current.ac;
  const nextLevel = updates.level !== undefined ? Number(updates.level) : current.level;
  const nextAttrs = updates.attributes ? JSON.stringify(updates.attributes) : current.attributes_json;
  const nextInv = updates.inventory ? JSON.stringify(updates.inventory) : current.inventory_json;
  const nextSkills = updates.spellsOrSkills ? JSON.stringify(updates.spellsOrSkills) : current.spells_or_skills_json;
  const nextNotes = updates.notes !== undefined ? updates.notes : current.notes;

  db.prepare(`
    UPDATE dnd_characters SET
      hp = ?, max_hp = ?, ac = ?, level = ?, attributes_json = ?,
      inventory_json = ?, spells_or_skills_json = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `).run(nextHp, nextMaxHp, nextAc, nextLevel, nextAttrs, nextInv, nextSkills, nextNotes, now, id);

  return getCharacter(id);
}

// -------------------------------------------------------------
// Campaign Management
// -------------------------------------------------------------

export function createCampaign({
  title,
  rulesetId,
  setting = '',
  characterId = null,
  initialScene = 'You stand at the beginning of your solitary quest...'
}) {
  const id = genId('cmp');
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO dnd_campaigns (
      id, title, ruleset_id, setting, character_id, current_scene, turn_count, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, 'active', '', ?, ?)
  `).run(id, title, rulesetId, setting, characterId || null, initialScene, now, now);

  // Record Turn 0 as prologue
  db.prepare(`
    INSERT INTO dnd_turns (campaign_id, turn_number, player_action, dm_narrative, dice_rolls_json, scene_state_json)
    VALUES (?, 0, 'Beginning of adventure', ?, '[]', '{}')
  `).run(id, initialScene);

  return getCampaign(id);
}

export function getCampaigns() {
  const rows = db.prepare(`
    SELECT c.*, r.name as ruleset_name, ch.name as character_name, ch.role_or_class as character_class
    FROM dnd_campaigns c
    LEFT JOIN dnd_rulesets r ON c.ruleset_id = r.id
    LEFT JOIN dnd_characters ch ON c.character_id = ch.id
    ORDER BY c.updated_at DESC
  `).all();
  return rows;
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
  });

  return { ...c, character, turns };
}

export function deleteCampaign(id) {
  db.prepare('DELETE FROM dnd_campaigns WHERE id = ?').run(id);
  return { success: true };
}

// -------------------------------------------------------------
// Interactive Dice Rolling & Solo Oracle
// -------------------------------------------------------------

export function rollDice({ count = 1, sides = 20, modifier = 0, advantage = false, disadvantage = false } = {}) {
  const rolls = [];
  const n = Math.max(1, Math.min(20, Number(count) || 1));
  const s = Number(sides) || 20;

  for (let i = 0; i < n; i++) {
    rolls.push(Math.floor(Math.random() * s) + 1);
  }

  let finalRoll = rolls.reduce((a, b) => a + b, 0);

  // If 1d20 with advantage or disadvantage
  let secondRoll = null;
  if (n === 1 && s === 20 && (advantage || disadvantage)) {
    secondRoll = Math.floor(Math.random() * 20) + 1;
    if (advantage) {
      finalRoll = Math.max(rolls[0], secondRoll);
    } else if (disadvantage) {
      finalRoll = Math.min(rolls[0], secondRoll);
    }
  }

  const total = finalRoll + (Number(modifier) || 0);
  const isCrit = s === 20 && finalRoll === 20;
  const isFumble = s === 20 && finalRoll === 1;

  return {
    formula: `${n}d${s}${modifier ? (modifier > 0 ? `+${modifier}` : modifier) : ''}`,
    rolls,
    secondRoll,
    advantage,
    disadvantage,
    modifier: Number(modifier) || 0,
    total,
    isCrit,
    isFumble
  };
}

export function consultOracle({ odds = '50/50', question = '' } = {}) {
  // Solo Oracle odds: Impossible (19+), Unlikely (15+), 50/50 (11+), Likely (7+), Almost Certain (3+)
  const thresholdMap = {
    'impossible': 19,
    'unlikely': 15,
    '50/50': 11,
    'likely': 7,
    'almost_certain': 3
  };

  const key = odds.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const target = thresholdMap[key] || 11;
  const d20 = Math.floor(Math.random() * 20) + 1;
  const passed = d20 >= target;

  let outcome = passed ? 'Yes' : 'No';
  // If rolled extreme edge of range (1-2 or 19-20), add "and..." or "but..."
  if (d20 === 20 || d20 === 19) {
    outcome = passed ? 'Yes, and...' : 'No, but...';
  } else if (d20 === 1 || d20 === 2) {
    outcome = passed ? 'Yes, but...' : 'No, and...';
  }

  return {
    question,
    odds,
    roll: d20,
    target,
    outcome
  };
}

// -------------------------------------------------------------
// AI Solo Dungeon Master Engine
// -------------------------------------------------------------

export async function processDmTurn({ campaignId, playerAction, diceRoll = null, oracleResult = null }) {
  const campaign = getCampaign(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const character = campaign.character;
  const recentTurns = campaign.turns.slice(-6);

  const genAI = new GoogleGenerativeAI(config.geminiApiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.75,
      maxOutputTokens: 900
    }
  });

  const turnsContext = recentTurns.map((t) =>
    `Turn ${t.turn_number}:\n[Player]: ${t.player_action}\n[Dungeon Master]: ${t.dm_narrative}`
  ).join('\n\n');

  const charContext = character ? `
CHARACTER SHEET:
- Name: ${character.name}
- Class/Role: ${character.role_or_class || 'Adventurer'}
- Level: ${character.level} | HP: ${character.hp}/${character.max_hp} | AC: ${character.ac}
- Attributes: ${JSON.stringify(character.attributes)}
- Inventory: ${character.inventory.join(', ')}
- Skills/Abilities: ${character.spells_or_skills.join(', ')}
` : 'No character sheet bound.';

  const diceContext = diceRoll
    ? `PLAYER DICE ROLL: Result was ${diceRoll.total} (${diceRoll.formula}${diceRoll.isCrit ? ' - NATURAL 20 CRITICAL HIT!' : ''}${diceRoll.isFumble ? ' - NATURAL 1 CRITICAL FUMBLE!' : ''}). Interpret this roll fairly into the outcome.`
    : '';

  const oracleContext = oracleResult
    ? `SOLO ORACLE ANSWER: Simon asked "${oracleResult.question}" at odds (${oracleResult.odds}) -> Oracle answered: "${oracleResult.outcome}". Weave this fate into the scene.`
    : '';

  const prompt = `
You are the master Dungeon Master running a solo tabletop roleplaying campaign for Simon.
SYSTEM/GENRE: ${campaign.ruleset_name || 'Solo RPG'} (${campaign.genre || 'Fantasy'}).
SETTING: ${campaign.setting || 'Dangerous uncharted wilderness and labyrinthine dungeons'}.

${charContext}

RECENT CHRONICLE:
${turnsContext}

CURRENT PLAYER ACTION:
"${playerAction}"

${diceContext}
${oracleContext}

INSTRUCTIONS FOR THE DUNGEON MASTER:
1. Deliver rich, visceral, atmospheric storytelling in British English. Describe sensory details, shadows, smells, sounds, and consequences of his actions.
2. If he took an action with a dice roll, narrate the outcome based on success or failure. If he took damage, mention it vividly.
3. Keep the pacing punchy (2-4 paragraphs maximum). Do not waffle or summarize endlessly.
4. Conclude your turn with:
   - A clear present situation description.
   - 3 bulleted tactical/narrative options for what Simon could do next.
   - An invitation to either choose one, try something else, or roll a skill check.
`;

  const response = await model.generateContent(prompt);
  const dmNarrative = response.response.text();

  const nextTurnNumber = campaign.turns.length ? Math.max(...campaign.turns.map(t => t.turn_number)) + 1 : 1;
  const now = new Date().toISOString();

  // Save new turn
  db.prepare(`
    INSERT INTO dnd_turns (campaign_id, turn_number, player_action, dm_narrative, dice_rolls_json, scene_state_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    campaignId,
    nextTurnNumber,
    playerAction,
    dmNarrative,
    JSON.stringify(diceRoll ? [diceRoll] : []),
    JSON.stringify({ oracle: oracleResult || null })
  );

  // Update campaign
  db.prepare(`
    UPDATE dnd_campaigns SET
      turn_count = turn_count + 1,
      current_scene = ?,
      updated_at = ?
    WHERE id = ?
  `).run(dmNarrative.slice(0, 300), now, campaignId);

  return getCampaign(campaignId);
}
