import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import db from '../db/database.js';
import config from '../config.js';
import { GoogleGenerativeAI } from './geminiClient.js';
import { getModelFor } from './modelRegistry.js';
import { searchRules, passagesText, fateDice } from './dndLibrary.js';
import { pickSoundscape } from './dndSoundscapes.js';
import {
  getGameSystemConfig,
  getRulesDigest,
  selectRulesForSituation,
  formatRulesDigestForPrompt
} from './rulesDigestService.js';

// The books in play in an adventure, and the hero's trackers (momentum, stress, sanity ...) - added 25 Oct 2026
try { db.exec('ALTER TABLE dnd_campaigns ADD COLUMN books_json TEXT'); } catch { /* already there */ }
try { db.exec('ALTER TABLE dnd_characters ADD COLUMN trackers_json TEXT'); } catch { /* already there */ }
try { db.exec('ALTER TABLE dnd_characters ADD COLUMN avatar_url TEXT'); } catch { /* already there */ }
// progress tracks (Ironsworn's vows, journeys, fights): [{ name, rank, ticks 0-40, done }]
try { db.exec('ALTER TABLE dnd_characters ADD COLUMN progress_json TEXT'); } catch { /* already there */ }
try { db.exec('ALTER TABLE dnd_characters ADD COLUMN masteries_json TEXT'); } catch { /* already there */ }
const RANK_TICKS = { troublesome: 12, dangerous: 8, formidable: 4, extreme: 2, epic: 1 };
// whose adventure it is: NULL for Simon, an invited guest's email for theirs
try { db.exec('ALTER TABLE dnd_campaigns ADD COLUMN owner TEXT'); } catch { /* already there */ }
try { db.exec('ALTER TABLE dnd_campaigns ADD COLUMN chronicle_compaction INTEGER DEFAULT 0'); } catch { /* already there */ }

export function isChronicleCompactionEnabled(campaignId) {
  try {
    if (campaignId) {
      const c = db.prepare('SELECT chronicle_compaction FROM dnd_campaigns WHERE id = ?').get(campaignId);
      if (c && c.chronicle_compaction != null) return Boolean(c.chronicle_compaction);
    }
  } catch {}
  try {
    const s = db.prepare('SELECT value FROM settings WHERE key = ?').get('dnd_chronicle_compaction_enabled');
    if (s) return s.value === 'true' || s.value === '1';
  } catch {}
  return false; // Default OFF for all games
}

export function setChronicleCompactionSetting(campaignId, enabled) {
  const val = enabled ? 1 : 0;
  if (campaignId) {
    db.prepare('UPDATE dnd_campaigns SET chronicle_compaction = ? WHERE id = ?').run(val, campaignId);
  }
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('dnd_chronicle_compaction_enabled', enabled ? 'true' : 'false');
  return { enabled: Boolean(val) };
}
import { generateHeroAvatar } from './dndAvatarService.js';
export const campaignOwner = (id) => db.prepare('SELECT owner FROM dnd_campaigns WHERE id = ?').get(id);
export const characterCampaign = (charId) => db.prepare('SELECT id, owner FROM dnd_campaigns WHERE character_id = ?').get(charId);
export const turnCampaign = (turnId) => db.prepare('SELECT c.id, c.owner FROM dnd_turns t JOIN dnd_campaigns c ON c.id = t.campaign_id WHERE t.id = ?').get(turnId);

export const DND_BOOKS_ROOT = process.env.DND_BOOKS_PATH || 'G:\\My Drive\\BOOKS\\D&D';

const genId = (prefix) => `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

// Known metadata profiles for recognised solo RPG systems in Simon's library
export const SYSTEM_METADATA = {
  'Across a Thousand Dead Worlds': {
    id: 'across-a-thousand-dead-worlds',
    name: 'Across a Thousand Dead Worlds',
    genre: 'Sci-Fi Deep Space Solo Crawler',
    dice_system: 'd20 / d100',
    resolution: 'd20',
    check_dice: '1d20',
    dice_config: {
      mode: 'd20',
      dice: '1d20',
      roll_under: false,
      target_label: 'DC ≥',
      crit_rule: 'Natural 20 is a Critical Triumph',
      fumble_rule: 'Natural 1 is a Critical Mishap',
      prompt_directive: 'Across a Thousand Dead Worlds uses a d20 roll-high system testing against DC thresholds (typically DC 10-25). Natural 20 is a Triumph, natural 1 is a Mishap.'
    },
    trackers: [
      { name: 'Oxygen', min: 0, max: 10, start: 10, about: 'EVA suit air supply; depleted by physical exertion or vacuum breaches' },
      { name: 'Morale', min: 0, max: 10, start: 10, about: 'Psychological composure amidst dead alien ruins and derelict isolation' },
      { name: 'Scrap', min: 0, max: 100, start: 0, about: 'Salvaged alien components, valuable alloys, and functional xeno-tech' }
    ],
    description: 'Explore derelict alien vessels, planetside ruins, and uncharted systems as an ambitious Scavenger in the depths of hostile space.',
    character_template: {
      role_or_class: 'Deep Space Scavenger',
      hp: 20, max_hp: 20, ac: 12,
      attributes: { STR: 12, DEX: 14, CON: 13, INT: 14, WIS: 10, CHA: 8 },
      inventory: ['Stun Carbine (1d8)', 'Light EVA Suit (AC 12)', 'Salvage Scanner', 'Emergency Oxygen Pack x2', 'Med-Gel Tube'],
      skills: ['Zero-G Maneuvering (+4)', 'Xeno-Tech Salvage (+4)', 'Tactical Firearms (+4)', 'Breaching (+2)']
    }
  },
  'Alien RPG': {
    id: 'alien-rpg',
    name: 'Alien RPG (Heart of Darkness & Building Better Worlds)',
    genre: 'Cinematic Sci-Fi Survival Horror',
    dice_system: 'd6 Dice Pool (Base + Stress)',
    resolution: 'd6-pool',
    check_dice: 'd6',
    pool_success: 6,
    dice_config: {
      mode: 'd6-pool',
      dice: 'd6',
      roll_under: false,
      pool_success: 6,
      has_stress_dice: true,
      target_label: 'Pool 6s',
      crit_rule: 'Multiple 6s grant bonus stunts or extra damage',
      fumble_rule: 'Any 1 on Stress die triggers Panic check',
      prompt_directive: 'Alien RPG uses a d6 dice pool mechanic (Base Dice + Skill + Stress Dice). Any die rolling a 6 is a success; multiple 6s grant stunts or bonus damage. Any 1 on a Stress die triggers an immediate Panic check. Never call for a d20 or d100 check.'
    },
    trackers: [
      { name: 'Stress', min: 0, max: 10, start: 1, about: 'Mounting psychological tension; adds to dice pool but triggers Panic on rolling 1s' },
      { name: 'Health', min: 0, max: 10, start: 10, about: 'Physical life; reaching 0 breaks character and forces a D66 Critical Injury roll' },
      { name: 'Oxygen', min: 0, max: 10, start: 8, about: 'Environmental suit air supply; depleted during strenuous exertion or hull puncture' },
      { name: 'Power', min: 0, max: 10, start: 6, about: 'Energy cells for motion trackers, floodlights, and pulse rifles' }
    ],
    description: 'Harsh, unforgiving sci-fi horror in the frontier of deep space. Face corporate greed, dwindling supplies, mounting panic, and deadly xenomorphs.',
    character_template: {
      role_or_class: 'Colonial Marine / Field Specialist',
      hp: 10, max_hp: 10, ac: 3,
      attributes: { Strength: 4, Agility: 3, Wits: 4, Empathy: 3 },
      inventory: ['M41A Pulse Rifle (Damage 3)', 'Motion Tracker', 'Personal Medkit', 'Strobe Flare x3'],
      skills: ['Ranged Combat 2', 'Mobility 1', 'Observation 2', 'Survival 1']
    }
  },
  'Barbarian Prince': {
    id: 'barbarian-prince',
    name: 'Barbarian Prince',
    genre: 'Classic Heroic Solo Quest',
    dice_system: '2d6',
    resolution: 'sum',
    check_dice: '2d6',
    dice_config: {
      mode: 'sum',
      dice: '2d6',
      roll_under: false,
      target_label: '2d6 Sum',
      crit_rule: 'Natural 12',
      fumble_rule: 'Natural 2',
      prompt_directive: 'Barbarian Prince resolves checks using 1d6 or 2d6 sums compared against event tables or combat skill differential tables.'
    },
    trackers: [
      { name: 'Gold', min: 0, max: 500, start: 15, about: 'Gold pieces accumulated. Goal is 500 GP within 70 days to hire an army and reclaim throne' },
      { name: 'Food', min: 0, max: 30, start: 5, about: 'Rations available. 1 consumed per day; 0 causes starvation and combat penalties' },
      { name: 'Days Left', min: 0, max: 70, start: 70, about: 'Time limit countdown before the usurper solidifies rule and executes loyalists' },
      { name: 'Followers', min: 0, max: 12, start: 0, about: 'Number of loyal guides, mercenaries, and northern clansmen in your retinue' }
    ],
    description: 'Prince Cal Arath of the North has been overthrown. Solo hex-crawling across dangerous wild lands to raise 500 gold pieces and reclaim your ancestral throne.',
    character_template: {
      role_or_class: 'Exiled Barbarian Prince',
      hp: 18, max_hp: 18, ac: 14,
      attributes: { Combat: 8, Endurance: 9, Wit: 6 },
      inventory: ['Broadsword (Combat 8)', 'Chainmail Hauberk', 'Rations (5 days)', 'Map of the Northlands'],
      skills: ['Wilderness Tracking', 'Mounted Combat', 'Intimidation']
    }
  },
  'CAMPFIRE STORY': {
    id: 'campfire-story',
    name: 'CAMPFIRE STORY',
    genre: 'Atmospheric Solo Folk Horror',
    dice_system: 'd6 / Story Prompts',
    resolution: 'pbta-2d6',
    check_dice: '2d6',
    dice_config: {
      mode: 'pbta-2d6',
      dice: '2d6',
      roll_under: false,
      target_label: '2d6 + Stat',
      bands: [
        { min: 10, outcome: 'Full Success' },
        { min: 7, max: 9, outcome: 'Partial Success (complication)' },
        { max: 6, outcome: 'Miss / Threat advances' }
      ],
      crit_rule: '12 is an extraordinary revelation',
      fumble_rule: '2 is an immediate calamity',
      prompt_directive: 'Campfire Story uses a 2d6 PbtA resolution: roll 2d6 + relevant stat modifier. 10+ is Full Success; 7-9 is Partial Success with a dread complication; 6 or less is a Miss advancing the threat. Always frame checks around this 10+ / 7-9 / 6- triad.'
    },
    trackers: [
      { name: 'Hearth Embers', min: 0, max: 10, start: 8, about: 'Warmth and firelight keeping the nocturnal dark from rushing in' },
      { name: 'Courage', min: 0, max: 10, start: 7, about: 'Mental resolve to witness uncanny revelations without succumbing' },
      { name: 'Dread', min: 0, max: 10, start: 1, about: 'Creeping supernatural terror closing in around the clearing' }
    ],
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
    resolution: 'sum',
    check_dice: '1d6',
    dice_config: {
      mode: 'sum',
      dice: '1d6',
      roll_under: false,
      target_label: 'Fate Card / 1d6',
      prompt_directive: 'Doom Pilgrim resolves events through Fate Card draws and 1d6 checks against challenge entries.'
    },
    trackers: [
      { name: 'Blood', min: 0, max: 14, start: 14, about: 'Physical vitality; bleeding out upon the stones causes death' },
      { name: 'Soul', min: 0, max: 10, start: 10, about: 'Spiritual purity resisting the creeping demonic corruption' },
      { name: 'Guilt', min: 0, max: 10, start: 2, about: 'Sins committed along the pilgrimage trail that hinder prayers' },
      { name: 'Fate', min: 0, max: 5, start: 3, about: 'Divine favor tokens spent to redraw perilous fate cards' }
    ],
    description: 'A dark, punishing solo pilgrimage through ruined sanctuaries, cursed catacombs, and forsaken lands where faith and steel battle creeping doom.',
    character_template: {
      role_or_class: 'Penitent Pilgrim',
      hp: 14, max_hp: 14, ac: 12,
      attributes: { Might: 3, Faith: 4, Cunning: 2 },
      inventory: ['Spiked Flail', 'Sanctified Relic', 'Dried Rations', 'Flask of Holy Oil'],
      skills: ['Banish Unclean', 'Pain Resistance', 'Ancient Inscriptions']
    }
  },
  'Ker Nathalas': {
    id: 'ker-nethalas',
    name: 'Ker Nethalas: Into the Midnight Throne',
    genre: 'Solo Necro-Labyrinth Dungeon Crawl',
    dice_system: 'd100',
    resolution: 'd100-under',
    check_dice: '1d100',
    hp_label: 'Health',
    defence_label: 'Torso Prot',
    dice_config: {
      mode: 'd100-under',
      dice: '1d100',
      roll_under: true,
      target_label: 'Target Score ≤',
      crit_rule: '01 or any matched doubles (11, 22, 33...) ≤ target (also marks skill with [✓] for permanent advancement check at next Camp)',
      fumble_rule: '100 or matched doubles (66, 77, 88, 99) > target (rolls on Player/Monster Fumble Table d10)',
      prompt_directive: 'Ker Nethalas uses a d100 percentile roll-under system. Checks test 1d100 against a target skill or attribute score (typically 20-65). A roll EQUAL TO OR LOWER than target is a SUCCESS; HIGHER is a FAILURE. Any matched doubles (11, 22, 33...) mark that skill with [✓] for improvement at Camp (where rolling > skill adds +1d4%, and rolling <= skill still adds +1%, up to 80%). CORE CONCEPT: You play as a condemned, executed outcast who miraculously survives and must explore the endless, grim tunnels of the underground necropolis known as Ker Nethalas. HARD BEGINNINGS (p. 243): Awakening in rags among corpses inflicts D6 damage, D4 Sanity loss, and +1 Exhaustion. STARTING ATTRIBUTES & RESISTANCES: Toughness starts at 2d6+20 (or 3d6+20, range 22-38), Health is d6+10 (11-16), Sanity is d6+10 (11-16), Aether is d6+8 (10-14, replenishes upon entering new room). Primary stats include Mind (formerly Awareness) and Body (formerly Athletics). Passive Resistances: Endurance (40 in one, 20 in other two), Resolve, Spellward. COMBAT & DAMAGE POOL: Combat attacks are Opposed: Attacker gets +10 to skill (upper hand). Defender dodges (vs Agility/Dodge) or parries (Parrying weapon or Shield only!). Both roll d100 under skill; higher roll under skill wins. If Defender wins, roll on the Player Defensive Move Table (1d10, p. 78) or Monster Defensive Move Table. If both sides fail, defender suffers 1 unavoidable damage! WEAPON SPEED: Weapon speed is subtracted directly from the opponent\'s Combat Skill (effective target = opponent Combat Skill - weapon speed). DAMAGE POOL: The old damage dealt table is removed! All non-magical weapons deal 1d6 damage; attacker gathers all damage dice into a Damage Pool and CHOOSES A SINGLE RESULT to apply. Fixed modifiers apply to the chosen die. Player can spend 2 Exhaustion for +1 melee damage. UNARMED COMBAT: Deals 1d4 Bludgeoning damage with NO starting skill bonus. HIT LOCATIONS & WEAK SPOTS: Hits roll 1d20 on the target anatomy table (Humanoid: 1-3 R.Leg, 4-6 L.Leg, 7-9 Abdomen, 10-12 Chest, 13-15 L.Arm, 16-18 R.Arm, 19-20 Head). Striking a Weak Spot (Head 19-20) is an automatic Critical Strike! Intentional weak spot targeting requires Disadvantage. LEVEL ADAPTATION (p. 131): All creatures scale with player character level (⅃), gaining +Health, +Combat Skill, and new Traits at levels 5 and 10. CREATURE TRAITS (p. 132): Alert, Frightening (-2 Sanity on failed Resolve), Horrifying (-4 Sanity on failed Resolve), Pack (+5 Combat Skill per living ally), Penetrating (X), Ruthlessness (X extra turns), Savage (cannot parry, must dodge), Swift (ignores reaction penalties), Venomous (Endurance check or Poisoned 1). RECOVERY & SURVIVAL: Concluding combat restores ONLY D4 Toughness immediately (+50 XP); full Toughness resets ONLY at Camp Rest. Out of combat, Bandages + Medicine heals D4 Toughness once per room. BREATHER: 10 mins, recovers D10+2 Toughness, 1 Health, -2 Exhaustion, costs 5 Light and steps Tension Die down 1 stage. CAMP REST: Consumes 1 Ration, requires a Camp Check (1d20 >= 12+; fail triggers encounter and halves benefits); recovers full Toughness, 1 Health, D4 Sanity, -10 Exhaustion. TENSION DIE: Usage Die chain (D8 -> D6 -> D4). Moving rooms or making noise tests Tension; rolling 1-2 steps it down; rolling 1-2 on D4 triggers a roll on the Growing Darkness Table (1d100) and resets Tension to D8. Entering a new room drops Light by 1 (torches/lamps last 20 rooms) and restores Aether to maximum. CORE EXPLORATION CONSTRAINTS: 1. Lighting a torch/lantern with tinder, drinking water, bandaging outside combat, or examining open chambers is an AUTOMATIC SUCCESS (never ask for a check!). 2. Scavenging/searching is strictly limited to EXACTLY ONE roll per room or encounter.'
    },
    trackers: [
      { name: 'Toughness', min: 0, max: 38, start: 27, about: 'Superficial buffer pool (starts 2d6+20 / 3d6+20); absorbs damage before Health; recovers D4 immediately after combat; recovers fully only at Camp Rest or via Bandages' },
      { name: 'Aether', min: 0, max: 14, start: 12, about: 'Mana pool for spells & Masteries (starts d6+8); completely replenishes when entering each new room' },
      { name: 'Light', min: 0, max: 20, start: 20, about: 'Torch/lantern fuel (starts at 20 rooms; candles 10). Light 0 inflicts Blinded (-Disadvantage) and Sanity checks upon room entry' },
      { name: 'Tension Die', min: 4, max: 8, start: 8, about: 'Usage Die chain (D8 -> D6 -> D4); rolling 1-2 steps down; rolling 1-2 on D4 triggers Growing Darkness (1d100) and resets to D8' },
      { name: 'Sanity', min: 0, max: 16, start: 14, about: 'Mental endurance (starts d6+10); reaching 0 forces an immediate roll on the Madness Table (d10)' },
      { name: 'Exhaustion', min: 0, max: 25, start: 1, about: 'Fatigue (starts at 1 with Hard Beginnings): 0-10 nominal, 11-15 healing halved, 16-20 Disadvantage, 21+ death. Spend 2 for +1 melee damage' },
      { name: 'The Rot', min: 0, max: 8, start: 0, about: 'Necrotic infection: 8 canonical stages (Stage 1 Necrotic immune/Holy vuln, Stage 2 max Toughness halved ... Stage 8 lost to abomination)' },
      { name: 'XP', min: 0, max: 1000, start: 0, about: 'Experience points (1,000 XP unlocks +1 Ability Point + choice of 8 permanent stat bonuses; +10 door/trap/book, +50 encounter/domain, +200 Overseer)' }
    ],
    description: 'You play as a condemned, executed outcast who miraculously survives and awakens in rags among rotting corpses in the underground necropolis of Ker Nethalas. Explore endless grim tunnels, scavenge remnants, and delve towards the Midnight Throne.',
    character_template: {
      role_or_class: 'Condemned Outcast Survivor',
      hp: 14, max_hp: 16, ac: 1,
      attributes: { Body: 50, Mind: 45, Agility: 45, Strength: 45, Endurance: 40, Resolve: 20, Spellward: 20 },
      inventory: ['Rusty Cleaver (1d6, Speed 0)', 'Tattered Rags (Armor 0)', 'Flint & Tinder', 'Torch x2', 'Bone Dagger (1d6, Speed 2, Parrying)', 'Rations x1'],
      skills: ['Slashing Weapons (45%)', 'Dodge (40%)', 'Perception (40%)', 'Stealth (45%)', 'Scavenge (40%)', 'Body (10%)', 'Unarmed Combat (10%)']
    }
  },
  'Last Days Zombie Apocalypse': {
    id: 'last-days-zombie-apocalypse',
    name: 'Last Days: Zombie Apocalypse',
    genre: 'Tactical Post-Apocalyptic Skirmish & Solo Campaign',
    dice_system: 'd6',
    resolution: 'sum',
    check_dice: '1d6',
    dice_config: {
      mode: 'sum',
      dice: '1d6',
      roll_under: false,
      target_label: '1d6 Target',
      prompt_directive: 'Last Days resolves contested tests and firearm/CQC checks using six-sided dice (1d6) against target difficulty numbers or opposed roll-offs.'
    },
    trackers: [
      { name: 'Ammo', min: 0, max: 30, start: 12, about: 'Rounds remaining for shotguns, rifles, and pistols' },
      { name: 'Supplies', min: 0, max: 50, start: 8, about: 'Canned food, antibiotics, and construction materials' },
      { name: 'Refuge Defense', min: 0, max: 20, start: 10, about: 'Structural strength of barricades protecting your shelter' },
      { name: 'Noise', min: 0, max: 10, start: 0, about: 'Sound tokens generated; attracts roaming undead toward your position' }
    ],
    description: 'Lead a small group of desperate survivors through the ruins of civilisation. Fortify your refuge, scrounge supplies, and fend off hordes and rival scavengers.',
    character_template: {
      role_or_class: 'Refuge Leader / Scavenger',
      hp: 12, max_hp: 12, ac: 12,
      attributes: { Melee: 3, Shooting: 4, Agility: 3, Resilience: 4, Leadership: 4 },
      inventory: ['Hunting Shotgun (6 shells)', 'Machete', 'Field Radio', 'First Aid Kit'],
      skills: ['Barricade Construction', 'Scavenging', 'Inspiring Shout']
    }
  },
  'Ironsworn': {
    id: 'ironsworn',
    name: 'Ironsworn',
    genre: 'Bleak Low-Fantasy Solo Delve',
    dice_system: '1d6 Action + 2d10 Challenge Dice',
    resolution: 'ironsworn',
    check_dice: '1d6 + 2d10',
    dice_config: {
      mode: 'ironsworn',
      dice: '1d6 + 2d10',
      roll_under: false,
      target_label: 'vs Challenge Dice',
      crit_rule: 'Match on challenge dice with Strong Hit',
      fumble_rule: 'Match on challenge dice with Miss',
      prompt_directive: 'Ironsworn resolves actions through Moves using an Action Roll: 1d6 + stat (action score, max 10) compared against two separate 1d10 challenge dice. Beating both is a Strong Hit; beating one is a Weak Hit; beating neither is a Miss. Matching challenge dice trigger a dramatic twist.'
    },
    trackers: [
      { name: 'Momentum', min: -6, max: 10, start: 2, about: 'Tactical and narrative momentum. Burn positive momentum on strong hits to cancel challenge dice' },
      { name: 'Health', min: 0, max: 5, start: 5, about: 'Physical endurance; 0 health triggers Endure Harm' },
      { name: 'Spirit', min: 0, max: 5, start: 5, about: 'Mental and emotional fortitude; 0 spirit triggers Endure Stress' },
      { name: 'Supply', min: 0, max: 5, start: 5, about: 'Provisions, gear, and travelling resources; 0 supply triggers Out of Supply' }
    ],
    description: 'A perilous, sworn quest across the rugged, wind-carved Ironlands. Swear sacred iron vows, brave the wild, and carve your legend.',
    character_template: {
      role_or_class: 'Ironlander Sworn',
      hp: 5, max_hp: 5, ac: 10,
      attributes: { Edge: 2, Heart: 3, Iron: 2, Shadow: 1, Wits: 2 },
      inventory: ['Iron Spear', 'Round Shield', 'Warm Furs', 'Rations (5 supply)'],
      skills: ['Strike', 'Clash', 'Endure Harm', 'Swear an Iron Vow']
    }
  },
  'Ironsworn: Starforged': {
    id: 'ironsworn-starforged',
    name: 'Ironsworn: Starforged',
    genre: 'Sci-Fi Solo Space Opera',
    dice_system: '1d6 Action + 2d10 Challenge Dice',
    resolution: 'ironsworn',
    check_dice: '1d6 + 2d10',
    dice_config: {
      mode: 'ironsworn',
      dice: '1d6 + 2d10',
      roll_under: false,
      target_label: 'vs Challenge Dice',
      crit_rule: 'Match on challenge dice with Strong Hit',
      fumble_rule: 'Match on challenge dice with Miss',
      prompt_directive: 'Starforged uses the 1d6 + stat vs two 1d10 challenge dice system. Beating both is Strong Hit, beating one is Weak Hit, beating neither is Miss. Matches trigger dramatic sci-fi twists.'
    },
    trackers: [
      { name: 'Momentum', min: -6, max: 10, start: 2, about: 'Drive and tactical advantage; burn momentum to turn failures into strong hits' },
      { name: 'Health', min: 0, max: 5, start: 5, about: 'Physical condition' },
      { name: 'Spirit', min: 0, max: 5, start: 5, about: 'Mental grit and sanity' },
      { name: 'Supply', min: 0, max: 5, start: 5, about: 'Reactor fuel, rations, and replacement components' },
      { name: 'Integrity', min: 0, max: 5, start: 5, about: 'Starship hull and life support system condition' }
    ],
    description: 'Venture into the perilous Forge—a wild galaxy of forgotten ruins, starships, and sworn vows among distant stars.',
    character_template: {
      role_or_class: 'Starship Nomad',
      hp: 5, max_hp: 5, ac: 10,
      attributes: { Edge: 3, Heart: 2, Iron: 1, Shadow: 2, Wits: 2 },
      inventory: ['Blaster Pistol', 'Armored Flight Suit', 'Personal Terminal', 'Survey Scanner'],
      skills: ['Enter the Fray', 'Gain Ground', 'Withstand Damage', 'Face Danger']
    }
  },
  'Thousand Year Old Vampire': {
    id: 'thousand-year-old-vampire',
    name: 'Thousand Year Old Vampire',
    genre: 'Gothic Horror Solo Journaling',
    dice_system: '1d10 - 1d6',
    resolution: 'sum',
    check_dice: '1d10 - 1d6',
    dice_config: {
      mode: 'sum',
      dice: '1d10 - 1d6',
      roll_under: false,
      target_label: 'Prompt Jump',
      prompt_directive: 'Thousand Year Old Vampire navigates memory prompts using 1d10 - 1d6 to step forward or backward through diary entries, causing mortal memories and resources to strike out or transform.'
    },
    trackers: [
      { name: 'Memories', min: 0, max: 5, start: 5, about: 'Active memory clusters remaining before losing human identity' },
      { name: 'Skills', min: 0, max: 10, start: 3, about: 'Practiced arts surviving across centuries' },
      { name: 'Resources', min: 0, max: 10, start: 3, about: 'Accumulated wealth, estates, and historical heirlooms' },
      { name: 'Characters', min: 0, max: 10, start: 3, about: 'Living mortals you know or prey upon' }
    ],
    description: 'Chronicle centuries of darkness, eternal wandering, fading memories, and loss as an ancient immortal vampire.',
    character_template: {
      role_or_class: 'Ancient Undead',
      hp: 10, max_hp: 10, ac: 10,
      attributes: { Age: 24, Centuries: 1, Humanity: 6 },
      inventory: ['Signet Ring', 'Vellum Journal', 'Lock of Hair', 'Silver Dagger'],
      skills: ['Blood Thirst', 'Fading Memory', 'Ancient Dialects']
    }
  },
  'Thousand Year Old Campfire': {
    id: 'thousand-year-old-campfire',
    name: 'Thousand Year Old Campfire',
    genre: 'Contemplative Solo Journaling RPG',
    dice_system: 'd10 / d6',
    resolution: 'sum',
    check_dice: '1d6',
    dice_config: {
      mode: 'sum',
      dice: '1d6',
      roll_under: false,
      target_label: '1d6 Strata',
      prompt_directive: 'Thousand Year Old Campfire navigates archaeological strata using 1d6, 2d6, and 3d6 rolls to determine soil depth and find entries.'
    },
    trackers: [
      { name: 'Soil Strata', min: 0, max: 20, start: 1, about: 'Depth of current archaeological excavation layer' },
      { name: 'Memories', min: 0, max: 10, start: 3, about: 'Recovered prehistoric campfire stories and oral traditions' },
      { name: 'Relics', min: 0, max: 10, start: 2, about: 'Excavated flint tools, carved bones, and ancient charcoal' }
    ],
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
    resolution: 'd20',
    check_dice: '1d20',
    dice_config: {
      mode: 'd20',
      dice: '1d20',
      roll_under: false,
      target_label: 'DC ≥',
      crit_rule: 'Natural 20 is a Critical Success',
      fumble_rule: 'Natural 1 is a Critical Failure',
      prompt_directive: 'D&D 5th Edition resolves checks using 1d20 + ability modifier + proficiency against a Difficulty Class (DC 10-25). Rolling at or above the DC is a SUCCESS; below is a FAILURE. Natural 20 is a Critical Triumph, natural 1 is a Critical Mishap.'
    },
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
 * Returns the exact dice and rules resolution configuration for any ruleset or metadata profile.
 */
export function getDiceConfig(rulesetOrProfile = {}) {
  const meta = rulesetOrProfile?.metadata || rulesetOrProfile || {};
  if (meta.dice_config && meta.dice_config.mode) return meta.dice_config;

  const id = String(meta.id || rulesetOrProfile?.id || '').toLowerCase();
  const resolution = String(meta.resolution || '').toLowerCase();
  const diceSys = String(meta.dice_system || meta.check_dice || '').toLowerCase();

  // 1. Percentile / d100 Roll-Under (e.g. Ker Nethalas)
  if (resolution === 'd100-under' || (/d100/.test(diceSys) && !/d20/.test(diceSys)) || id.includes('nethalas') || id.includes('nathalas')) {
    return {
      mode: 'd100-under',
      dice: '1d100',
      roll_under: true,
      target_label: 'Target Score ≤',
      crit_rule: '01 or matched doubles ≤ target',
      fumble_rule: '100 or matched doubles > target',
      prompt_directive: 'Ker Nethalas uses a d100 percentile roll-under system. Checks test 1d100 against a target skill or attribute score (typically 25-60). A roll EQUAL TO OR LOWER than the target score is a SUCCESS. A roll HIGHER than the target is a FAILURE. Doubles (11, 22, 33...) under target are Critical Successes; 100 or doubles over target are Fumbles.'
    };
  }

  // 2. Ironsworn / Starforged Challenge Dice
  if (resolution === 'ironsworn' || id.includes('ironsworn') || id.includes('starforged')) {
    return {
      mode: 'ironsworn',
      dice: '1d6 + 2d10',
      roll_under: false,
      target_label: 'vs Challenge Dice',
      crit_rule: 'Match on challenge dice with Strong Hit',
      fumble_rule: 'Match on challenge dice with Miss',
      prompt_directive: 'Ironsworn resolves actions through Moves using an Action Roll: 1d6 + stat (action score, max 10) compared against two separate 1d10 challenge dice. Beating both is a Strong Hit; beating one is a Weak Hit; beating neither is a Miss. Matching challenge dice trigger an extraordinary dramatic twist.'
    };
  }

  // 3. Dice Pool (Alien RPG / Year Zero)
  if (resolution === 'd6-pool' || /pool/.test(diceSys) || id.includes('alien')) {
    return {
      mode: 'd6-pool',
      dice: 'd6',
      roll_under: false,
      pool_success: meta.pool_success || 6,
      has_stress_dice: id.includes('alien'),
      target_label: 'Pool 6s',
      crit_rule: 'Multiple 6s grant bonus stunts or extra damage',
      fumble_rule: 'Any 1 on Stress die triggers Panic check',
      prompt_directive: 'Alien RPG uses a d6 dice pool mechanic (Base Dice + Skill + Stress Dice). Any die rolling a 6 is a success; multiple 6s grant stunts or bonus damage. Any 1 on a Stress die triggers an immediate Panic check.'
    };
  }

  // 4. PbtA 2d6 (Campfire Story)
  if (id.includes('campfire-story') || (resolution === 'pbta-2d6') || (id.includes('campfire') && !id.includes('thousand'))) {
    return {
      mode: 'pbta-2d6',
      dice: '2d6',
      roll_under: false,
      target_label: '2d6 + Stat',
      bands: [
        { min: 10, outcome: 'Full Success' },
        { min: 7, max: 9, outcome: 'Partial Success (complication)' },
        { max: 6, outcome: 'Miss / Threat advances' }
      ],
      crit_rule: '12 is an extraordinary revelation',
      fumble_rule: '2 is an immediate calamity',
      prompt_directive: 'Campfire Story uses a 2d6 PbtA resolution: roll 2d6 + relevant stat modifier. 10+ is Full Success; 7-9 is Partial Success with a dread complication; 6 or less is a Miss advancing the threat. Frame checks around this 10+ / 7-9 / 6- triad.'
    };
  }

  // 5. Barbarian Prince (2d6 / 1d6 sum against table numbers)
  if (id.includes('barbarian-prince')) {
    return {
      mode: 'sum',
      dice: '2d6',
      roll_under: false,
      target_label: '2d6 Target',
      crit_rule: 'Natural 12 is a decisive triumph',
      fumble_rule: 'Natural 2 is a dire stumble',
      prompt_directive: 'Barbarian Prince resolves checks using 2d6 (or 1d6 for specific events) compared against combat or survival targets from the event tables. Higher is better.'
    };
  }

  // 6. Last Days: Zombie Apocalypse (1d6 checks)
  if (id.includes('last-days')) {
    return {
      mode: 'sum',
      dice: '1d6',
      roll_under: false,
      target_label: '1d6 Target',
      crit_rule: 'Natural 6 is a clean hit / critical success',
      fumble_rule: 'Natural 1 is a jam / critical failure',
      prompt_directive: 'Last Days: Zombie Apocalypse uses six-sided dice (1d6) for skill and combat checks. Tests are rolled on 1d6 + modifier against target numbers (typically 4-6). Rolling 6 is a success; rolling 1 is a weapon jam or mishap.'
    };
  }

  // 7. Thousand Year Old Vampire / Thousand Year Old Campfire (1d10 - 1d6 prompt navigation)
  if (id.includes('vampire') || id.includes('thousand-year-old')) {
    const isVampire = id.includes('vampire');
    return {
      mode: 'sum',
      dice: isVampire ? '1d10 - 1d6' : '1d6',
      roll_under: false,
      target_label: isVampire ? 'Prompt Navigation (1d10 - 1d6)' : '1d6 Strata',
      prompt_directive: isVampire
        ? 'Thousand Year Old Vampire navigates memory prompts using 1d10 - 1d6 to step forward or backward through diary entries, causing mortal memories and resources to strike out or transform.'
        : 'Thousand Year Old Campfire navigates archaeological strata using 1d6 rolls to excavate deeper layers and uncover lost relics and faded memories.'
    };
  }

  // 8. Doom Pilgrim (Cards / 1d6)
  if (id.includes('doom-pilgrim')) {
    return {
      mode: 'sum',
      dice: '1d6',
      roll_under: false,
      target_label: 'Fate Card / 1d6',
      prompt_directive: 'Doom Pilgrim navigates doom, sanctuaries, and encounters via Fate Card draws and 1d6 checks against challenge entries.'
    };
  }

  // 9. Default / d20 Roll-High (D&D 5e, Across a Thousand Dead Worlds)
  return {
    mode: 'd20',
    dice: '1d20',
    roll_under: false,
    target_label: 'DC ≥',
    crit_rule: 'Natural 20 is a Critical Success',
    fumble_rule: 'Natural 1 is a Critical Failure',
    prompt_directive: 'This game resolves checks with 1d20 + ability modifier against a Difficulty Class (DC 10-25). Rolling at or above the DC is a SUCCESS; rolling below is a FAILURE. A natural 20 is a Critical Triumph, a natural 1 is a Critical Mishap.'
  };
}

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

export const RULESET_READINESS = {
  'ker-nethalas': {
    status: 'ready',
    percentage: 100,
    label: '100% Rulebook Verified & Ready',
    badge: '100% Verified',
    summary: 'Full necropolis rulebook ingested. Procedural exploration, tension die, camp check, hit locations & piecemeal armour verified.',
    checklist: [
      { name: 'Core Rulebook Ingestion & Grounding', done: true },
      { name: 'Hard Beginnings & Starting Vitals', done: true },
      { name: 'Opposed Combat & Damage Pool Selection', done: true },
      { name: 'Piecemeal Armour Mannequin & Hit Locations', done: true },
      { name: 'Procedural Exploration Turn & Tension Die Chain', done: true },
      { name: '10-Minute Breather & Camp Rest Check', done: true },
      { name: 'Necrotic Rot Stages & Permanent Skill Advancement', done: true }
    ]
  },
  'ironsworn': {
    status: 'in_development',
    percentage: 75,
    label: '75% Prepared · Core Moves Ingested',
    badge: 'In Development',
    summary: '2d6 vs d6 challenge resolution and vows ready. Asset cards and advanced move triggers undergoing QA.',
    checklist: [
      { name: 'Core 2d6 Challenge Resolution', done: true },
      { name: 'Momentum & Vow Trackers', done: true },
      { name: 'Move Tables Ingested', done: true },
      { name: 'Asset Cards Automation', done: false },
      { name: 'Rulebook Accuracy QA Check', done: false }
    ]
  },
  'ironsworn-starforged': {
    status: 'in_development',
    percentage: 70,
    label: '70% Prepared · In Development',
    badge: 'In Development',
    summary: 'Sci-fi move matrices and sector generation indexed. Starship assets undergoing QA.',
    checklist: [
      { name: 'Core Starforged Resolution', done: true },
      { name: 'Sector & Planet Generation', done: true },
      { name: 'Starship Assets & Upgrades', done: false },
      { name: 'Rulebook Accuracy QA Check', done: false }
    ]
  },
  'alien-rpg': {
    status: 'in_development',
    percentage: 50,
    label: '50% Prepared · Stress Dice Ready',
    badge: 'In Development',
    summary: 'Base + Stress d6 pool and Panic triggers ready. D66 critical injuries and xenomorph attacks in QA.',
    checklist: [
      { name: 'd6 Pool & Stress Die Engine', done: true },
      { name: 'Panic Check Triggers', done: true },
      { name: 'D66 Critical Injury Tables', done: false },
      { name: 'Xenomorph Signature Attacks & Stealth Zones', done: false },
      { name: 'Rulebook Accuracy QA Check', done: false }
    ]
  },
  'across-a-thousand-dead-worlds': {
    status: 'in_development',
    percentage: 40,
    label: '40% Prepared · In Development',
    badge: 'In Development',
    summary: 'Rules & setting indexed. Derelict site exploration tables and EVA suit breach in QA.',
    checklist: [
      { name: 'd20 / d100 Resolution Profile', done: true },
      { name: 'Oxygen & Morale Trackers', done: true },
      { name: 'Derelict Site Exploration Tables', done: false },
      { name: 'Rulebook Accuracy QA Check', done: false }
    ]
  },
  'barbarian-prince': {
    status: 'in_development',
    percentage: 35,
    label: '35% Prepared · In Development',
    badge: 'In Development',
    summary: 'Hex-crawl concept mapped. 70-day calendar and numbered event paragraphs in QA.',
    checklist: [
      { name: '2d6 Resolution Profile', done: true },
      { name: '500 Gold / 70 Days Trackers', done: true },
      { name: 'Numbered Event Book Automation', done: false },
      { name: 'Rulebook Accuracy QA Check', done: false }
    ]
  },
  'doom-pilgrim': {
    status: 'in_development',
    percentage: 40,
    label: '40% Prepared · In Development',
    badge: 'In Development',
    summary: 'Fate draw structure indexed. Card deck simulation and penitence trials in QA.',
    checklist: [
      { name: 'Blood, Soul & Guilt Trackers', done: true },
      { name: '3-Card Fate Draw Automation', done: false },
      { name: 'Rulebook Accuracy QA Check', done: false }
    ]
  },
  'campfire-story': {
    status: 'in_development',
    percentage: 30,
    label: '30% Prepared · In Development',
    badge: 'In Development',
    summary: 'Folk horror PbtA prompt bands mapped. Ember passing and campfire dread cycle in QA.',
    checklist: [
      { name: '2d6 PbtA Bands (10+ / 7-9 / 6-)', done: true },
      { name: 'Ember & Dread Trackers', done: true },
      { name: 'Ember-Passing Narrative Engine', done: false },
      { name: 'Rulebook Accuracy QA Check', done: false }
    ]
  },
  'last-days-zombie-apocalypse': {
    status: 'in_development',
    percentage: 35,
    label: '35% Prepared · In Development',
    badge: 'In Development',
    summary: 'Skirmish profile indexed. Zombie spawn tables and noise generation in QA.',
    checklist: [
      { name: 'Skirmish Stat Profile', done: true },
      { name: 'Noise & Zombie Spawn Cycle', done: false },
      { name: 'Scavenge Encounter Tables', done: false },
      { name: 'Rulebook Accuracy QA Check', done: false }
    ]
  },
  'thousand-year-old-vampire': {
    status: 'in_development',
    percentage: 45,
    label: '45% Prepared · In Development',
    badge: 'In Development',
    summary: 'Journal prompt structure indexed. Memory strike-through and prompt decay engine in QA.',
    checklist: [
      { name: 'Journal Prompt Tables', done: true },
      { name: 'Memory & Diary Strike-Through Engine', done: false },
      { name: 'Rulebook Accuracy QA Check', done: false }
    ]
  },
  'thousand-year-old-campfire': {
    status: 'in_development',
    percentage: 35,
    label: '35% Prepared · In Development',
    badge: 'In Development',
    summary: 'Archaeological prompt structure indexed. Strata layer tracking in QA.',
    checklist: [
      { name: 'Prompt Tables', done: true },
      { name: 'Strata Layer Progression', done: false },
      { name: 'Rulebook Accuracy QA Check', done: false }
    ]
  }
};

export function getRulesetReadiness(rulesetId) {
  return RULESET_READINESS[rulesetId] || {
    status: 'in_development',
    percentage: 25,
    label: '25% Prepared · In Development',
    badge: 'In Development',
    summary: 'Rulebook indexed. Game-specific automations and rulebook accuracy check pending.',
    checklist: [
      { name: 'Rulebook Ingestion', done: true },
      { name: 'Dice Resolution Profile', done: false },
      { name: 'Rulebook Accuracy QA Check', done: false }
    ]
  };
}

export function getRulesets() {
  const rows = db.prepare('SELECT * FROM dnd_rulesets ORDER BY name ASC').all();
  if (!rows.length) {
    return scanDndLibrary();
  }
  return rows.map((r) => {
    try { r.metadata = JSON.parse(r.metadata_json || '{}'); } catch { r.metadata = {}; }
    r.dice_config = getDiceConfig(r);
    r.metadata.dice_config = r.dice_config;
    r.readiness = getRulesetReadiness(r.id);
    r.metadata.readiness = r.readiness;
    return r;
  });
}

export function getRuleset(id) {
  const row = db.prepare('SELECT * FROM dnd_rulesets WHERE id = ?').get(id);
  if (!row) return null;
  try { row.metadata = JSON.parse(row.metadata_json || '{}'); } catch { row.metadata = {}; }
  row.dice_config = getDiceConfig(row);
  row.metadata.dice_config = row.dice_config;
  row.readiness = getRulesetReadiness(row.id);
  row.metadata.readiness = row.readiness;
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
      attributes_json, inventory_json, spells_or_skills_json, notes, avatar_url, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, String(pick(body, 'name') || 'Hero of the Realm'), String(pick(body, 'rulesetId', 'ruleset_id') || 'dnd-5e-solo'),
    String(pick(body, 'roleOrClass', 'role_or_class') || 'Adventurer'), Number(pick(body, 'level')) || 1,
    Number(pick(body, 'hp')) || maxHp, maxHp, Number(pick(body, 'ac')) || 10,
    JSON.stringify(pick(body, 'attributes') || {}), JSON.stringify(pick(body, 'inventory') || []),
    JSON.stringify(pick(body, 'spellsOrSkills', 'spells_or_skills', 'skills') || []),
    String(pick(body, 'notes', 'backstory') || ''),
    pick(body, 'avatarUrl', 'avatar_url') || null,
    now, now
  );
  const extra = {};
  if (Array.isArray(body.trackers) && body.trackers.length) extra.trackers = body.trackers;
  if (Array.isArray(body.progress) && body.progress.length) extra.progress = body.progress;
  if (Array.isArray(body.masteries) && body.masteries.length) extra.masteries = body.masteries;
  if (Object.keys(extra).length) return updateCharacter(id, extra);
  return getCharacter(id);
}

export function getCharacters(owner = null) {
  const rows = db.prepare(`
    SELECT ch.*, c.id as campaign_id, c.title as campaign_title, c.ruleset_id, r.name as ruleset_name, r.genre
    FROM dnd_characters ch
    LEFT JOIN dnd_campaigns c ON c.character_id = ch.id
    LEFT JOIN dnd_rulesets r ON c.ruleset_id = r.id
    WHERE (c.owner IS ? OR c.id IS NULL)
    ORDER BY ch.updated_at DESC
  `).all(owner);
  rows.forEach((r) => {
    try { r.attributes = JSON.parse(r.attributes_json || '{}'); } catch { r.attributes = {}; }
    try { r.inventory = JSON.parse(r.inventory_json || '[]'); } catch { r.inventory = []; }
    try { r.spells_or_skills = JSON.parse(r.spells_or_skills_json || '[]'); } catch { r.spells_or_skills = []; }
    try { r.trackers = JSON.parse(r.trackers_json || '[]'); } catch { r.trackers = []; }
    try { r.progress = JSON.parse(r.progress_json || '[]'); } catch { r.progress = []; }
    try { r.masteries = JSON.parse(r.masteries_json || '[]'); } catch { r.masteries = []; }
  });
  return rows;
}

export function getCharacter(id) {
  const r = db.prepare('SELECT * FROM dnd_characters WHERE id = ?').get(id);
  if (!r) return null;
  try { r.attributes = JSON.parse(r.attributes_json || '{}'); } catch { r.attributes = {}; }
  try { r.inventory = JSON.parse(r.inventory_json || '[]'); } catch { r.inventory = []; }
  try { r.spells_or_skills = JSON.parse(r.spells_or_skills_json || '[]'); } catch { r.spells_or_skills = []; }
  try { r.trackers = JSON.parse(r.trackers_json || '[]'); } catch { r.trackers = []; }
  try { r.progress = JSON.parse(r.progress_json || '[]'); } catch { r.progress = []; }
  try { r.masteries = JSON.parse(r.masteries_json || '[]'); } catch { r.masteries = []; }
  return r;
}

export function updateCharacter(id, updates = {}) {
  const c = getCharacter(id);
  if (!c) throw new Error('Character not found');
  const val = (v, fallback) => (v !== undefined ? v : fallback);
  const maxHp = Number(val(pick(updates, 'maxHp', 'max_hp'), c.max_hp));
  const hp = Math.max(0, Math.min(maxHp, Number(val(pick(updates, 'hp'), c.hp))));
  const avatarUrl = val(pick(updates, 'avatarUrl', 'avatar_url'), c.avatar_url);
  db.prepare(`
    UPDATE dnd_characters SET
      name = ?, role_or_class = ?, hp = ?, max_hp = ?, ac = ?, level = ?, attributes_json = ?,
      inventory_json = ?, spells_or_skills_json = ?, notes = ?, avatar_url = ?, updated_at = ?
    WHERE id = ?
  `).run(
    String(val(pick(updates, 'name'), c.name)), String(val(pick(updates, 'roleOrClass', 'role_or_class'), c.role_or_class)),
    hp, maxHp, Number(val(pick(updates, 'ac'), c.ac)), Number(val(pick(updates, 'level'), c.level)),
    JSON.stringify(val(pick(updates, 'attributes'), c.attributes)), JSON.stringify(val(pick(updates, 'inventory'), c.inventory)),
    JSON.stringify(val(pick(updates, 'spellsOrSkills', 'spells_or_skills', 'skills'), c.spells_or_skills)),
    String(val(pick(updates, 'notes', 'backstory'), c.notes || '')),
    avatarUrl,
    new Date().toISOString(), id
  );
  if (Array.isArray(updates.trackers)) {
    const clean = updates.trackers.map((t) => ({ name: String(t.name), min: Number(t.min) || 0, max: Number(t.max) || 10, value: Math.max(Number(t.min) || 0, Math.min(Number(t.max) || 10, Number(t.value) || 0)), about: t.about || '' }));
    db.prepare('UPDATE dnd_characters SET trackers_json = ? WHERE id = ?').run(JSON.stringify(clean), id);
  }
  if (Array.isArray(updates.progress)) {
    const clean = updates.progress.filter((p) => p && p.name).map((p) => ({ name: String(p.name).slice(0, 120), rank: RANK_TICKS[String(p.rank || '').toLowerCase()] ? String(p.rank).toLowerCase() : 'dangerous', ticks: Math.max(0, Math.min(40, Number(p.ticks) || 0)), done: Boolean(p.done) }));
    db.prepare('UPDATE dnd_characters SET progress_json = ? WHERE id = ?').run(JSON.stringify(clean), id);
  }
  if (Array.isArray(updates.masteries)) {
    db.prepare('UPDATE dnd_characters SET masteries_json = ? WHERE id = ?').run(JSON.stringify(updates.masteries), id);
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
      r.name as ruleset_name, r.genre, ch.name as character_name, ch.role_or_class as character_class, ch.hp, ch.max_hp, ch.avatar_url as character_avatar
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
  const ruleset = c.ruleset_id ? getRuleset(c.ruleset_id) : null;
  const dice_config = ruleset?.dice_config || getDiceConfig(ruleset);
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
  return { ...c, dice_config, books, story_so_far: c.notes || '', character, turns };
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

export function deleteCharacter(id) {
  const camps = db.prepare('SELECT id FROM dnd_campaigns WHERE character_id = ?').all(id);
  for (const camp of camps) {
    db.prepare('DELETE FROM dnd_turns WHERE campaign_id = ?').run(camp.id);
    db.prepare('DELETE FROM dnd_campaigns WHERE id = ?').run(camp.id);
  }
  db.prepare('DELETE FROM dnd_characters WHERE id = ?').run(id);
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
  const target = Number(body.dc != null ? body.dc : body.target) || null;
  const isUnder = Boolean(body.under);
  const total = kept + mod;
  const success = target !== null
    ? (isUnder ? total <= target : total >= target)
    : null;
  const isCrit = sides === 20
    ? (kept === 20)
    : sides === 100
      ? (isUnder ? (kept === 1 || (target !== null && kept <= target && kept % 11 === 0)) : (kept >= 95))
      : false;
  const isFumble = sides === 20
    ? (kept === 1)
    : sides === 100
      ? (isUnder ? (kept === 100 || (target !== null && kept > target && kept % 11 === 0)) : (kept <= 5))
      : false;

  return {
    formula: `${n}d${sides}${mod ? (mod > 0 ? `+${mod}` : mod) : ''}`, label: body.label || null,
    rolls, secondRoll, advantage: Boolean(advantage), disadvantage: Boolean(disadvantage), modifier: mod,
    kept, total, dc: target, under: isUnder,
    success,
    isCrit, isFumble,
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
    progress_changes: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, rank: { type: 'STRING', enum: ['troublesome', 'dangerous', 'formidable', 'extreme', 'epic'] }, marks: { type: 'INTEGER' }, fulfilled: { type: 'BOOLEAN' } }, required: ['name'] } },
    tracker_changes: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, change: { type: 'INTEGER' } }, required: ['name', 'change'] } },
    adversaries: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          name: { type: 'STRING' },
          hp: { type: 'INTEGER' },
          max_hp: { type: 'INTEGER' },
          ac: { type: 'INTEGER' },
          attack: { type: 'STRING' },
          special: { type: 'STRING' },
          status: { type: 'STRING' },
          defeated: { type: 'BOOLEAN' },
          just_damaged: { type: 'BOOLEAN' }
        },
        required: ['name', 'hp', 'defeated']
      }
    },
    adversary: {
      type: 'OBJECT',
      properties: {
        active: { type: 'BOOLEAN' },
        name: { type: 'STRING' },
        hp: { type: 'INTEGER' },
        max_hp: { type: 'INTEGER' },
        ac: { type: 'INTEGER' },
        attack: { type: 'STRING' },
        special: { type: 'STRING' },
        status: { type: 'STRING' },
        defeated: { type: 'BOOLEAN' },
        just_damaged: { type: 'BOOLEAN' }
      },
      required: ['active']
    },
  },
  required: ['scene_title', 'narrative', 'situation', 'options', 'check', 'hp_change', 'mood', 'atmosphere', 'adversary'],
};

const DND_TURN_MODEL = process.env.DND_SOLO_MODEL || 'gemini-2.5-flash';
const model = (temperature = 0.85, schema = null, modelName = DND_TURN_MODEL) => new GoogleGenerativeAI(config.geminiApiKey).getGenerativeModel({
  model: modelName,
  generationConfig: {
    temperature,
    maxOutputTokens: 2048,
    thinkingConfig: { thinkingBudget: 0 },
    ...(schema ? { responseMimeType: 'application/json', responseSchema: schema } : {})
  },
});

function sheetText(ch) {
  if (!ch) return 'No character sheet.';
  const isKerNethalas = ch.ruleset_id === 'ker-nethalas' || /ker[\s_-]*n[ea]thalas/i.test(ch.ruleset_id || '');
  const armourDesc = isKerNethalas
    ? 'Piecemeal Armour: Torso Prot 3 (Corroded Iron Breastplate, Integrity d10, -20% Dodge/Stealth penalty) | Head Prot 0 | Arms Prot 0 | Legs Prot 0'
    : `AC ${ch.ac}`;
  return `Name: ${ch.name} | Class/role: ${ch.role_or_class || 'Adventurer'} | Level ${ch.level} | HP ${ch.hp}/${ch.max_hp} | ${armourDesc}
Attributes: ${Object.entries(ch.attributes || {}).map(([k, v]) => `${k} ${v}`).join(', ')}
Kit: ${(ch.inventory || []).join('; ') || 'nothing'}${(ch.progress || []).length ? `\nProgress tracks: ${ch.progress.map((p) => `${p.name} (${p.rank}, ${Math.floor(p.ticks / 4)}/10 boxes${p.done ? ', fulfilled' : ''})`).join('; ')}` : ''}${(ch.trackers || []).length ? `\nTrackers: ${ch.trackers.map((t) => `${t.name} ${t.value} (${t.min} to ${t.max})`).join(', ')}` : ''}
Skills & abilities: ${(ch.spells_or_skills || []).join('; ') || 'none'}${ch.notes ? `\nBackstory: ${ch.notes}` : ''}`;
}

const RULES = `HOW YOU RUN THE GAME:
- You are Rindewind, an ancient wizard-chronicler acting as Dungeon Master for a solo player, Simon. Write in British English: vivid, sensory, atmospheric - shadow, smell, sound, dread. 2-3 short, punchy paragraphs of narrative (100-140 words total). No headings, no bullet points, no markdown bold/italics, no lists of options inside the narrative.
- Run the chosen system's authentic vocabulary and tone faithfully. Never decide the player's actions or feelings for him.
- Ask for a check (check.needed true) strictly when the outcome is genuinely uncertain, perilous, and failure carries immediate physical danger. Give the check a short label, the attribute from his sheet it uses, the dice, and a fair target for the system.
- AUTOMATIC SUCCESS (check.needed false): Routine inventory and non-combat survival actions MUST ALWAYS SUCCEED AUTOMATICALLY without calling for a dice roll.
- ONE SCAVENGE PER ROOM: In dungeon crawlers (Ker Nethalas), the hero is strictly permitted EXACTLY ONE scavenge/search roll per room.
- FATE DICE (when given) are real rolls: whenever the moment calls for a random table or encounter, use them in order.`;

// In-memory speculative cache
const speculativeCache = new Map();

function normalizeActionKey(action = '') {
  return String(action || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function makeCacheKey(campaignId, turnNumber, action, outcome = '') {
  return `${campaignId}:${turnNumber}:${normalizeActionKey(action)}:${outcome ? normalizeActionKey(outcome) : 'none'}`;
}

function pruneSpeculativeCache() {
  const now = Date.now();
  if (speculativeCache.size > 50) {
    for (const [k, v] of speculativeCache.entries()) {
      if (now - (v.created || 0) > 10 * 60 * 1000) {
        speculativeCache.delete(k);
      }
    }
  }
}

// Background speculative pre-generation: disabled by default to eliminate ~80% discarded API calls!
const ENABLE_SPECULATIVE_PREGEN = process.env.ENABLE_SPECULATIVE_PREGEN === 'true';

async function scheduleSpeculativePreGen(campaignId, turnNumber, lastOut) {
  if (!ENABLE_SPECULATIVE_PREGEN) return; // 80% immediate cost reduction
  if (!lastOut?.options?.length) return;
  pruneSpeculativeCache();

  const campaign = getCampaign(campaignId);
  if (!campaign) return;

  for (const opt of (lastOut.options || []).slice(0, 3)) {
    const key = makeCacheKey(campaignId, turnNumber, opt, 'none');
    if (!speculativeCache.has(key)) {
      const p = generateTurn(campaign, { playerAction: opt })
        .then((res) => ({ ...res, created: Date.now() }))
        .catch((err) => {
          speculativeCache.delete(key);
          return null;
        });
      speculativeCache.set(key, p);
    }
  }

  if (lastOut.check?.needed) {
    const lastAction = campaign.turns[campaign.turns.length - 1]?.player_action || 'Action';
    const sKey = makeCacheKey(campaignId, turnNumber, lastAction, 'success');
    const fKey = makeCacheKey(campaignId, turnNumber, lastAction, 'failure');
    if (!speculativeCache.has(sKey)) {
      const sp = generateTurn(campaign, {
        playerAction: lastAction,
        diceRoll: { formula: lastOut.check.dice || '1d100', success: true, outcome: 'SUCCESS' }
      }).then((res) => ({ ...res, created: Date.now() })).catch(() => null);
      speculativeCache.set(sKey, sp);
    }
    if (!speculativeCache.has(fKey)) {
      const fp = generateTurn(campaign, {
        playerAction: lastAction,
        diceRoll: { formula: lastOut.check.dice || '1d100', success: false, outcome: 'FAILURE' }
      }).then((res) => ({ ...res, created: Date.now() })).catch(() => null);
      speculativeCache.set(fKey, fp);
    }
  }
}

// Deterministic Game Rules Engine: resolves arithmetic, damage, hit locations, and state
// in JavaScript BEFORE asking the model to write prose, ensuring 100% rules accuracy and
// freeing Gemini Flash to dedicate its entire capacity to archaic, atmospheric British English prose.
export function resolveDeterministicMechanics(campaign, { playerAction = '', diceRoll = null, adversary = null } = {}) {
  const isKerNethalas = campaign.ruleset_id === 'ker-nethalas' || campaign.ruleset_name?.toLowerCase().includes('ker nethalas');
  const character = campaign.character || {};
  const lastTurn = campaign.turns[campaign.turns.length - 1];
  const lastState = lastTurn?.scene_state || {};
  const rawAdvs = Array.isArray(lastState.adversaries) && lastState.adversaries.length
    ? lastState.adversaries
    : (lastState.adversary?.name ? [lastState.adversary] : []);
  const activeAdversaries = rawAdvs.filter((a) => a && (a.active !== false) && !a.defeated && (Number(a.hp) > 0 || a.hp === undefined));
  let targetAdv = adversary ? activeAdversaries.find((a) => a.id === adversary.id || a.name === adversary.name) : activeAdversaries[0];
  if (!targetAdv && activeAdversaries.length) targetAdv = activeAdversaries[0];

  const facts = [];
  let hp_change = 0;
  const tracker_changes = [];
  const items_gained = [];
  const items_lost = [];
  let updatedAdversaries = [...rawAdvs];

  const lowAction = String(playerAction).toLowerCase();
  const isCombatAction = /attack|strike|hit|shoot|blade|sword|dagger|cleaver|slash|stab|parry|dodge|guard|cast|fight|cleave|smash|crush|swing|bash|thrust|cut/.test(lowAction);
  const isMovement = /move|door|corridor|room|advance|descend|portal|gate|exit|chamber|step|crawl|enter/.test(lowAction);
  const isScavenge = /search|scavenge|inspect|loot|forage|chest|remains|corpse/.test(lowAction);
  const isRest = /rest|camp|bandage|heal|breather|sleep/.test(lowAction);

  // If there are no active adversaries recorded from last turn, but the player action is an attack or foe was mentioned
  if (!targetAdv && isCombatAction) {
    const enemyMatch = String(playerAction).match(/(?:nearest|the|a|an)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)\s+(?:with|before|as|to)/i)
      || String(lastState.situation || '').match(/(?:crawlers|crawler|swarm|horror|abomination|ghoul|skeleton|beast|fiend|vermin)/i);
    const foeName = enemyMatch ? (enemyMatch[1] || enemyMatch[0]) : 'Chitinous Crawler';
    const capFoe = foeName.charAt(0).toUpperCase() + foeName.slice(1);
    targetAdv = {
      id: `adv_dyn_${Date.now()}`,
      name: capFoe,
      hp: 10,
      max_hp: 10,
      ac: 1,
      attack: 'Barbed Claws',
      special: '',
      status: 'Engaged',
      defeated: false,
      active: true
    };
    updatedAdversaries.push(targetAdv);
  }

  // 1. Resolve combat mechanics if diceRoll is provided or attack made
  if (targetAdv && (isCombatAction || diceRoll)) {
    if (diceRoll) {
      const isSuccess = diceRoll.success === true || diceRoll.outcome === 'SUCCESS' || diceRoll.outcome === 'CRITICAL TRIUMPH' ||
        (diceRoll.dc != null && (diceRoll.under ? diceRoll.total <= diceRoll.dc : diceRoll.total >= diceRoll.dc));
      
      if (isSuccess) {
        // Hit landed! Determine location & damage
        let locName = 'Chest';
        let locProt = isKerNethalas ? (targetAdv.ac != null && targetAdv.ac < 10 ? targetAdv.ac : 1) : 0;
        let isCrit = Boolean(diceRoll.isCrit || diceRoll.outcome === 'CRITICAL TRIUMPH');

        if (isKerNethalas) {
          // Anatomy d20: 1-3 R.Leg, 4-6 L.Leg, 7-9 Abdomen, 10-12 Chest, 13-15 L.Arm, 16-18 R.Arm, 19-20 Head
          const locRoll = Math.floor(Math.random() * 20) + 1;
          if (locRoll <= 3) { locName = 'Right Leg'; locProt = 0; }
          else if (locRoll <= 6) { locName = 'Left Leg'; locProt = 0; }
          else if (locRoll <= 9) { locName = 'Abdomen'; locProt = targetAdv.ac != null && targetAdv.ac < 10 ? targetAdv.ac : 1; }
          else if (locRoll <= 12) { locName = 'Chest'; locProt = targetAdv.ac != null && targetAdv.ac < 10 ? targetAdv.ac : 1; }
          else if (locRoll <= 15) { locName = 'Left Arm'; locProt = 0; }
          else if (locRoll <= 18) { locName = 'Right Arm'; locProt = 0; }
          else { locName = 'Head (Weak Spot)'; locProt = 0; isCrit = true; }
        }

        // Damage calculation: 1d6 weapon damage + crit bonus
        const baseDmg = Math.floor(Math.random() * 6) + 1 + (isCrit ? 3 : 0);
        const netDmg = Math.max(1, baseDmg - locProt);
        const prevHp = Number(targetAdv.hp ?? 10);
        const newHp = Math.max(0, prevHp - netDmg);
        const isDefeated = newHp <= 0;

        facts.push(`Hero struck ${targetAdv.name} on the ${locName} for ${netDmg} net damage (${baseDmg} weapon damage minus ${locProt} location protection).`);
        facts.push(`${targetAdv.name} HP reduced from ${prevHp} to ${newHp}/${targetAdv.max_hp || 10}${isDefeated ? ' (SLAIN / DEFEATED)' : ' (Bloodied)'}.`);

        // Update adversary in list
        updatedAdversaries = updatedAdversaries.map((a) => {
          if (a.id === targetAdv.id || a.name === targetAdv.name) {
            return {
              ...a,
              hp: newHp,
              defeated: isDefeated,
              status: isDefeated ? 'Slain' : (newHp <= (a.max_hp || 10) / 2 ? 'Bloodied' : 'Engaged'),
              just_damaged: true
            };
          }
          return a;
        });

        // Post-combat recovery if foe is defeated
        if (isDefeated) {
          const recToughness = Math.floor(Math.random() * 4) + 1;
          facts.push(`Combat victory: +50 XP awarded; adrenaline surge recovers +${recToughness} Toughness buffer.`);
          tracker_changes.push({ name: 'XP', change: 50 });
          tracker_changes.push({ name: 'Toughness', change: recToughness });
        }
      } else {
        facts.push(`Attack missed or was parried by ${targetAdv.name}; no damage dealt to enemy.`);
        // Adversary counter-attack pressure on failure
        if (Math.random() < 0.6) {
          const advDmg = Math.floor(Math.random() * 3) + 1;
          hp_change = -advDmg;
          facts.push(`${targetAdv.name} counter-attacks during the opening, dealing ${advDmg} damage to your defenses.`);
        }
      }
    }
  }

  // 2. Room movement / exploration facts
  if (isMovement) {
    tracker_changes.push({ name: 'Light', change: -1 });
    facts.push(`Traversing into new chamber/domain: Torch/Lantern Light consumed by -1 room.`);
    if (isKerNethalas) {
      facts.push(`Aether pool completely replenished upon entering the new chamber.`);
      const tensionRoll = Math.floor(Math.random() * 6) + 1;
      if (tensionRoll <= 2) {
        facts.push(`Ancient stone groans in the deep; Tension Die step down triggered.`);
      }
    }
  }

  // 3. Resting / healing
  if (isRest && lowAction.includes('bandage')) {
    const healAmount = Math.floor(Math.random() * 4) + 1;
    tracker_changes.push({ name: 'Toughness', change: healAmount });
    items_lost.push('Bandages');
    facts.push(`Bandages applied to staunch bleeding: restored +${healAmount} Toughness; 1 Bandages consumed.`);
  }

  // 4. Looting & item acquisition from action or situation
  const isLootAction = /(?:take|pick up|grab|snatch|loot|collect|pocket|stow|retrieve|gather|acquire|pouch)\b/i.test(playerAction);
  if (isLootAction) {
    const cleanItem = (str) => String(str || '').replace(/^(the|a|an|both|all|some)\s+/i, '').trim();
    // Direct match: e.g. "Snatch the obsidian shard and viscera-urn quickly"
    const match = playerAction.match(/(?:take|pick up|grab|snatch|loot|collect|pocket|stow|retrieve|gather|acquire|pouch)\s+(?:the\s+)?(.+?)(?:\s+(?:quickly|carefully|quietly|hurriedly|into|from|and escape|$))/i);
    if (match) {
      const raw = match[1].trim();
      const parts = raw.split(/\s+and\s+|\s*,\s*/);
      for (const p of parts) {
        const c = cleanItem(p);
        if (c && c.length > 2 && !['it', 'them', 'both', 'all', 'everything', 'items', 'relics', 'treasures', 'loot'].includes(c.toLowerCase())) {
          items_gained.push(c.charAt(0).toUpperCase() + c.slice(1));
        }
      }
    }

    // Pronoun or general reference fallback: e.g. "Snatch both relics quickly", look at situation
    if (!items_gained.length && /(?:both|them|all|everything|items|relics|treasures|loot)\b/i.test(playerAction) && lastState.situation) {
      const sitMatch = lastState.situation.match(/(?:yielded|found|revealed|contains|contained|uncovered|holding)\s+(?:an?|the)?\s*([^.,;]+)/i);
      if (sitMatch) {
        const sitParts = sitMatch[1].split(/\s+and\s+|\s*,\s*/);
        for (const sp of sitParts) {
          const c = cleanItem(sp);
          if (c && c.length > 2) {
            items_gained.push(c.charAt(0).toUpperCase() + c.slice(1));
          }
        }
      }
    }

    if (items_gained.length) {
      facts.push(`Hero acquired items into inventory: ${items_gained.join(', ')}.`);
    }
  }

  return {
    facts,
    factsString: facts.length ? `VERIFIED MECHANICAL FACTS (DETERMINISTICALLY RESOLVED IN CODE):\n${facts.map((f) => `- ${f}`).join('\n')}\n` : '',
    hp_change,
    tracker_changes,
    items_gained,
    items_lost,
    updatedAdversaries
  };
}

export async function generateTurnStream(campaign, { playerAction, diceRoll, oracleResult, opening = false, adversary = null }, onToken = null) {
  const ruleset = getRuleset(campaign.ruleset_id);
  const profile = ruleset?.metadata || {};
  const lastState = campaign.turns[campaign.turns.length - 1]?.scene_state || {};
  const inPlay = (profile.files || []).filter((f) => (campaign.books || []).includes(f.id) && f.role && f.role !== 'core' && f.role !== 'sheet');

  // Pre-calculate deterministic mechanics
  const mech = opening ? { facts: [], factsString: '', hp_change: 0, tracker_changes: [], items_gained: [], items_lost: [], updatedAdversaries: [] }
    : resolveDeterministicMechanics(campaign, { playerAction, diceRoll, adversary });

  // 1. Authoritative Rules Digest & Extracted Rulebook Tone
  const systemConfig = getGameSystemConfig(campaign.ruleset_id);
  const rawLastAdvs = mech.updatedAdversaries?.length ? mech.updatedAdversaries : (Array.isArray(lastState.adversaries) && lastState.adversaries.length
    ? lastState.adversaries
    : (lastState.adversary?.name ? [lastState.adversary] : []));
  const activeAdversaries = rawLastAdvs.filter((a) => a && (a.active !== false) && !a.defeated && (Number(a.hp) > 0 || a.hp === undefined));
  const lastAdversary = activeAdversaries[0] || null;
  const inCombat = activeAdversaries.length > 0 || /attack|strike|hit|shoot|blade|sword|dagger|cleaver|damage|wound|fight|kill|enemy|beast|crawler|monster|shield|parry|dodge|guard|combat|round/.test(`${playerAction || ''} ${lastState.situation || ''}`);
  const digestCards = selectRulesForSituation(campaign.ruleset_id, {
    playerAction,
    situation: lastState.situation,
    check: lastState.check,
    inCombat
  });

  let rulesSection = '';
  let activeRulesPassages = [];

  if (digestCards.length) {
    rulesSection = formatRulesDigestForPrompt(digestCards, systemConfig);
    activeRulesPassages = digestCards.map((c) => {
      const matchedFile = (profile.files || []).find((f) =>
        (f.filename || '').toLowerCase().includes(c.book_title.toLowerCase().split(':')[0]) ||
        (c.book_title || '').toLowerCase().includes((f.filename || '').replace(/\.pdf$/i, '').toLowerCase())
      );
      return {
        id: matchedFile ? matchedFile.id : c.id,
        book: c.book_title,
        page: c.page_num,
        title: c.title
      };
    });
  } else {
    const passages = await searchRules(ruleset, opening
      ? `${campaign.ruleset_name}: starting an adventure, the first scene, setting up a solo game ${campaign.setting || ''}`
      : `${playerAction}. ${lastState.situation || ''} ${lastState.check?.label || ''} ${diceRoll?.label || ''}`, 5, campaign.books?.length ? campaign.books : null);
    if (passages.length) {
      rulesSection = `RULES FROM HIS BOOKS:\n${passagesText(passages)}`;
      activeRulesPassages = passages;
    }
  }

  const fate = fateDice();
  // Trimming recent turn history from 8 down to 3 turns saves ~1,200 tokens per turn!
  const recent = campaign.turns.slice(-3).map((t) => {
    if (t.turn_number === 0) return `Opening scene:\n${t.dm_narrative}`;
    const dr = t.dice_rolls?.[0];
    const rollSummary = dr
      ? ` [rolled ${dr.label || dr.formula}: ${dr.total}${dr.dc ? (dr.under ? ` vs target ${dr.dc} (roll under)` : ` vs DC ${dr.dc}`) : ''}${dr.outcome ? ` => ${dr.outcome}` : dr.success === true ? ' => SUCCESS' : dr.success === false ? ' => FAILURE' : ''}]`
      : '';
    return `Turn ${t.turn_number} - Simon: ${t.player_action}${rollSummary}\nDM: ${t.dm_narrative}`;
  }).join('\n\n');
  const lastCheck = campaign.turns[campaign.turns.length - 1]?.scene_state?.check;

  let roll = '';
  if (diceRoll) {
    if (diceRoll.outcome) {
      roll = `HE ROLLED${diceRoll.label ? ` for ${diceRoll.label}` : ''}: ${diceRoll.formula} - ${diceRoll.detail || ''} => ${diceRoll.outcome}. Honour this outcome exactly.`;
    } else {
      const isUnder = Boolean(diceRoll.under) || profile.resolution === 'd100-under' || /d100/i.test(diceRoll.formula || '');
      const targetNum = diceRoll.dc ?? lastCheck?.dc ?? null;
      let outcomeStr = '';
      if (diceRoll.isCrit) outcomeStr = 'CRITICAL TRIUMPH';
      else if (diceRoll.isFumble) outcomeStr = 'CRITICAL MISHAP (FUMBLE)';
      else if (diceRoll.success === true) outcomeStr = 'SUCCESS';
      else if (diceRoll.success === false) outcomeStr = 'FAILURE';
      else if (targetNum !== null) {
        outcomeStr = (isUnder ? diceRoll.total <= targetNum : diceRoll.total >= targetNum) ? 'SUCCESS' : 'FAILURE';
      }
      const targetDesc = targetNum !== null
        ? (isUnder ? `against target score ${targetNum} (roll equal to or under ${targetNum} to succeed)` : `against DC ${targetNum} (roll equal to or above ${targetNum} to succeed)`)
        : '';
      const verdict = outcomeStr ? ` => OUTCOME: ${outcomeStr}` : '';
      roll = `HE ROLLED${diceRoll.label ? ` for ${diceRoll.label}` : ''}: ${diceRoll.formula} = ${diceRoll.total}${diceRoll.rolls ? ` (dice [${[...diceRoll.rolls, ...(diceRoll.secondRoll != null ? [diceRoll.secondRoll] : [])].join(', ')}]${diceRoll.advantage ? ', advantage' : diceRoll.disadvantage ? ', disadvantage' : ''})` : ''} ${targetDesc}${verdict}. Honour this outcome faithfully in the narrative.`;
    }
  }
  const oracle = oracleResult ? `THE ORACLE: he asked "${oracleResult.question}" (odds ${oracleResult.odds}) and fate answered "${oracleResult.outcome}". That answer is true in the world - weave it in.` : '';
  const diceConfig = ruleset?.dice_config || getDiceConfig(ruleset);

  const prompt = `${RULES}

SYSTEM: ${campaign.ruleset_name || 'Solo RPG'} - ${campaign.genre || 'fantasy'}. Dice: ${campaign.dice_system || diceConfig.dice || 'd20'}.
RULES RESOLUTION & DICE FOR THIS GAME:
- Mode: ${diceConfig.mode}
- Default Roll: ${diceConfig.dice} (${diceConfig.roll_under ? 'Roll UNDER target score' : 'Roll HIGHER or EQUAL to DC'})
- Target Metric: ${diceConfig.target_label || 'Target'}
CAMPAIGN: "${campaign.title}". ${campaign.setting ? `Premise: ${campaign.setting}` : ''}

HIS SHEET:
${sheetText(campaign.character)}
${campaign.notes ? `\nTHE STORY SO FAR:\n${campaign.notes}\n` : ''}
${rulesSection ? `${rulesSection}\n\n` : ''}FATE DICE: d6 ${fate.d6.join(', ')}; d8 ${fate.d8}; d10 ${fate.d10}; d12 ${fate.d12}; d20 ${fate.d20.join(', ')}; d66 ${fate.d66}; d100 ${fate.d100.join(', ')}.

${activeAdversaries.length ? `CURRENT FOES IN ENCOUNTER:
${activeAdversaries.map((a, i) => `${i + 1}. ${a.name} - HP: ${a.hp}/${a.max_hp} | Defence/Armor: ${a.ac} | Status: ${a.status || 'Engaged'}`).join('\n')}\n` : ''}
${mech.factsString}
${opening ? `Write the OPENING SCENE: set the scene and drop him straight into the first moment of the adventure with a hook${campaign.setting ? ' that follows the premise' : ''}. Nothing has happened to him yet (hp_change 0, no items).` : `RECENT TURNS:\n${recent}\n\nWHAT HE DOES NOW: "${playerAction}"\n${roll}\n${oracle}`}

LITERARY DIRECTIVE:
You are completely freed from calculating arithmetic, armour equations, or rule numbers: all mechanical outcomes have already been verified in code above. Honour them faithfully in your prose.
Dedicate 100% of your focus to writing evocative, atmospheric British English prose without schema handcuffs. Write 2-3 vivid, punchy paragraphs (100-140 words total).
Immediately after the narrative, on a new line output:
<<<STATE>>>
{
  "scene_title": "Short evocative title",
  "situation": "One sentence on the current tactical situation",
  "options": ["Short imperative action 1", "Short imperative action 2", "Short imperative action 3"],
  "items_gained": ["Exact item name if hero took or found an item"],
  "check": {
    "needed": false, // Set to true whenever the situation or options require a dice test/attack roll!
    "label": "The Attack Check / Athletic Check",
    "attribute": "Shafted Weapons / Brawn / Agility",
    "dc": 45,
    "under": true,
    "why": "Drive your pickaxe into the crawler before it strikes"
  },
  "adversaries": [
    // Include whenever hostile enemies/monsters appear or are active in combat:
    { "name": "Monster Name", "hp": 10, "max_hp": 10, "ac": 1, "attack": "Barbed Mandibles", "defeated": false }
  ],
  "mood": "tense",
  "atmosphere": "dungeon"
}
<<</STATE>>>
NOTE: If enemies are attacking or present in the scene, you MUST include them in "adversaries" AND set "check.needed" to true if a defensive test or attack is called for.`;

  const stream = model(0.85, null).generateContentStream(prompt);
  let streamedNarrative = '';
  let fullAccumulated = '';
  let stateStarted = false;
  let buffer = '';

  for await (const chunk of stream) {
    const t = chunk.text();
    fullAccumulated += t;

    if (stateStarted) continue;

    buffer += t;
    const tagMatch = buffer.match(/<<<STATE>>>|```json/i);
    if (tagMatch) {
      const tagIdx = tagMatch.index;
      const narrativePiece = buffer.slice(0, tagIdx);
      if (narrativePiece) {
        streamedNarrative += narrativePiece;
        if (onToken) onToken(narrativePiece);
      }
      stateStarted = true;
      buffer = '';
    } else {
      // Check if buffer ends with a prefix of "<<<STATE>>>" or "```json" so we don't stream partial tags
      const stateTag = '<<<STATE>>>';
      const jsonTag = '```json';
      let holdIdx = -1;

      for (let i = stateTag.length - 1; i >= 1; i--) {
        if (buffer.toLowerCase().endsWith(stateTag.slice(0, i).toLowerCase())) {
          holdIdx = buffer.length - i;
          break;
        }
      }
      if (holdIdx === -1) {
        for (let i = jsonTag.length - 1; i >= 1; i--) {
          if (buffer.toLowerCase().endsWith(jsonTag.slice(0, i).toLowerCase())) {
            holdIdx = buffer.length - i;
            break;
          }
        }
      }

      if (holdIdx !== -1) {
        const safe = buffer.slice(0, holdIdx);
        if (safe) {
          streamedNarrative += safe;
          if (onToken) onToken(safe);
        }
        buffer = buffer.slice(holdIdx);
      } else {
        streamedNarrative += buffer;
        if (onToken) onToken(buffer);
        buffer = '';
      }
    }
  }

  // Parse state block
  let parsedState = {};
  const stateMatch = fullAccumulated.match(/<<<STATE>>>([\s\S]*?)(?:<<<[/]STATE>>>|$)/i) || fullAccumulated.match(/```json([\s\S]*?)```/i);
  if (stateMatch) {
    try {
      parsedState = JSON.parse(stateMatch[1].trim());
    } catch (e) {
      const jsonObj = stateMatch[1].match(/\{[\s\S]*\}/);
      if (jsonObj) {
        try { parsedState = JSON.parse(jsonObj[0]); } catch {}
      }
    }
  }

  // Ensure any leaked state marker is stripped from narrative regardless of stream status
  const rawNarrative = (streamedNarrative || fullAccumulated).split(/<<<STATE>>>|```json/i)[0];
  const narrative = rawNarrative
    .replace(/\*\*?|__|^#+\s*/gm, '')
    .trim();

  const out = {
    scene_title: String(parsedState.scene_title || (opening ? 'The Awakening' : 'In the Depths')).slice(0, 100),
    narrative: narrative || 'The torch flickers in the oppressive dark.',
    situation: String(parsedState.situation || 'You steady your grip and peer into the gloomy corridor.').slice(0, 300),
    options: (parsedState.options || ['Press forward deeper into the gloom', 'Examine the stonework for traps', 'Prepare weapon and watch the rear']).filter(Boolean).slice(0, 3),
    check: parsedState.check?.needed ? {
      needed: true,
      label: parsedState.check.label || 'Check',
      attribute: parsedState.check.attribute || '',
      dice: /^\d*d\d+$/i.test(parsedState.check.dice || '') ? parsedState.check.dice.toLowerCase() : (diceConfig.dice || '1d20'),
      dc: Number(parsedState.check.dc) || null,
      under: Boolean(diceConfig.roll_under),
      why: parsedState.check.why || ''
    } : { needed: false },
    mood: MOODS.includes(parsedState.mood) ? parsedState.mood : 'neutral',
    atmosphere: ATMOSPHERES.includes(parsedState.atmosphere) ? parsedState.atmosphere : null,
    hp_change: mech.hp_change || 0,
    items_gained: [...(mech.items_gained || []), ...(parsedState.items_gained || [])],
    items_lost: [...(mech.items_lost || []), ...(parsedState.items_lost || [])],
    tracker_changes: mech.tracker_changes || [],
    progress_changes: parsedState.progress_changes || [],
    rules: activeRulesPassages.slice(0, 4),
    tables_rolled: (parsedState.tables_rolled || []).filter(Boolean).slice(0, 4)
  };

  // Normalise adversaries
  const isKN = campaign.ruleset_id === 'ker-nethalas' || profile?.id === 'ker-nethalas';
  const cleanStatus = (defeated, rawStatus, curHp, maxHp) => {
    if (defeated) return 'Slain';
    if (!rawStatus) return curHp <= maxHp / 2 ? 'Bloodied' : 'Engaged';
    const trimmed = String(rawStatus).trim();
    const clause = trimmed.split(/[,;.—]/)[0].trim();
    if (clause.length <= 25) return clause;
    return clause.slice(0, 25);
  };
  const cleanAc = (rawAc, prevAc) => {
    let val = Number(rawAc ?? prevAc ?? (isKN ? 1 : 10));
    if (isKN && val >= 10) val = 1;
    return val;
  };

  const narrativeSlain = /sags limp|rattling death|falls lifeless|collapses dead|slain|destroying it|draws its last breath|corpse hits the floor|death-whistle/i.test(out.narrative || '');
  let advList = [];
  const baseAdvs = mech.updatedAdversaries?.length ? mech.updatedAdversaries : (parsedState.adversaries || activeAdversaries);

  if (Array.isArray(baseAdvs) && baseAdvs.length) {
    advList = baseAdvs.map((adv, idx) => {
      const prev = activeAdversaries.find((a) => a.name?.toLowerCase() === adv.name?.toLowerCase() || a.id === adv.id) || activeAdversaries[idx] || {};
      let curHp = Math.max(0, Number(adv.hp ?? prev.hp ?? 10));
      const maxHp = Math.max(1, Number(adv.max_hp || prev.max_hp || curHp || 10));
      let defeated = Boolean(adv.defeated || curHp <= 0 || (narrativeSlain && (adv.just_damaged || baseAdvs.length === 1)));
      if (defeated) curHp = 0;
      return {
        id: adv.id || prev.id || `adv_${idx}_${Date.now()}`,
        name: String(adv.name || prev.name || 'Adversary').slice(0, 80),
        hp: curHp,
        max_hp: maxHp,
        ac: cleanAc(adv.ac, prev.ac),
        attack: String(adv.attack || prev.attack || '').slice(0, 100),
        special: String(adv.special || prev.special || '').slice(0, 120),
        status: cleanStatus(defeated, adv.status, curHp, maxHp),
        defeated,
        just_damaged: Boolean(adv.just_damaged || (prev.hp !== undefined && curHp < prev.hp))
      };
    });
  }

  if (advList.length) {
    out.adversaries = advList;
    out.adversary = advList.find((a) => a.just_damaged) || advList.find((a) => !a.defeated) || advList[0];
    out.adversary.active = true;
  } else {
    out.adversaries = [];
    out.adversary = { active: false };
  }

  return out;
}

export async function generateTurn(campaign, params) {
  return generateTurnStream(campaign, params, null);
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
  // progress tracks: open, mark by rank, fulfil
  before.progress = character.progress;
  const marked = [];
  let progress = [...(character.progress || [])];
  for (const pc of out.progress_changes || []) {
    const i = progress.findIndex((p) => p.name.toLowerCase() === String(pc.name).toLowerCase());
    if (i < 0) {
      if (!pc.name) continue;
      progress.push({ name: String(pc.name), rank: pc.rank || 'dangerous', ticks: 0, done: false });
      marked.push({ name: pc.name, rank: pc.rank || 'dangerous', made: true, ticks: 0 });
      continue;
    }
    const p = progress[i];
    const add = Math.max(0, Number(pc.marks) || 0) * (RANK_TICKS[p.rank] || 4);
    const next = { ...p, ticks: Math.min(40, p.ticks + add), done: p.done || Boolean(pc.fulfilled) };
    if (add || next.done !== p.done) marked.push({ name: p.name, ticks: next.ticks - p.ticks, done: next.done && !p.done });
    progress[i] = next;
  }
  updateCharacter(character.id, { hp, inventory: inv, trackers, progress });
  return { before, applied: { hp: hp - character.hp, gained, lost, trackers: moved, progress: marked } };
}

function saveTurn(campaignId, number, playerAction, out, diceRoll, oracleResult, sheet) {
  db.prepare(`
    INSERT INTO dnd_turns (campaign_id, turn_number, player_action, dm_narrative, dice_rolls_json, scene_state_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(campaignId, number, playerAction, out.narrative, JSON.stringify(diceRoll ? [diceRoll] : []), JSON.stringify({
    scene_title: out.scene_title, situation: out.situation, options: out.options, check: out.check, mood: out.mood,
    atmosphere: out.atmosphere, oracle: oracleResult || null, applied: sheet.applied, before: sheet.before,
    rules: out.rules || [], tables_rolled: out.tables_rolled || [], soundscape: out.soundscape || null,
    adversary: out.adversary || null,
  }));
  db.prepare('UPDATE dnd_campaigns SET turn_count = ?, current_scene = ?, updated_at = ? WHERE id = ?')
    .run(number, out.situation || out.narrative.slice(0, 300), new Date().toISOString(), campaignId);
}

// Every 6 turns the story so far is re-written from the last summary and the turns since (in the background)
// Default OFF to prevent unnecessary token consumption and API costs.
const SUMMARY_EVERY = 6;
async function refreshStorySoFar(campaignId) {
  if (!isChronicleCompactionEnabled(campaignId)) return;
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
  const avatarUrl = ch.avatarUrl || ch.avatar_url || body.avatarUrl || body.avatar_url || null;
  const character = createCharacter({
    rulesetId, name: ch.name || body.characterName || 'Hero of the Realm',
    roleOrClass: ch.roleOrClass || tpl.role_or_class, hp: ch.maxHp || tpl.max_hp || tpl.hp, maxHp: ch.maxHp || tpl.max_hp || tpl.hp, ac: ch.ac || tpl.ac,
    attributes: ch.attributes || tpl.attributes, inventory: ch.inventory || tpl.inventory, spellsOrSkills: ch.skills || tpl.skills, notes: ch.backstory || '',
    avatarUrl,
    trackers: (ruleset?.metadata?.trackers || []).map((t) => ({ name: t.name, min: t.min, max: t.max, value: t.start ?? t.min, about: t.about || '' })),
  });
  if (character.trackers?.length === 0 && (ruleset?.metadata?.trackers || []).length) updateCharacter(character.id, { trackers: ruleset.metadata.trackers.map((t) => ({ name: t.name, min: t.min, max: t.max, value: t.start ?? t.min, about: t.about || '' })) });

  // If no avatar was supplied but details/concept or likeness was given, generate avatar in background
  if (!avatarUrl && (body.characterDetails || body.details || body.concept || ch.details || ch.concept || body.referenceImage)) {
    generateHeroAvatar({
      name: character.name,
      roleOrClass: character.role_or_class,
      ruleset,
      concept: ch.concept || body.concept || '',
      details: body.characterDetails || body.details || ch.details || '',
      backstory: character.notes || '',
      premise: body.premise || body.setting || '',
      referenceImage: body.referenceImage || null
    }).then((res) => {
      if (res?.avatarUrl) updateCharacter(character.id, { avatarUrl: res.avatarUrl });
    }).catch((e) => console.warn('[DndSolo] Background avatar generation failed:', e.message));
  }
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
    scheduleSpeculativePreGen(id, 0, out).catch(() => {});
  } catch (err) {
    deleteCampaign(id);
    throw err;
  }
  return getCampaign(id);
}

export async function processDmTurnStream({ campaignId, playerAction, diceRoll = null, oracleResult = null, adversary = null }, onToken = null) {
  const campaign = getCampaign(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  if (adversary && campaign.turns.length) {
    const last = campaign.turns[campaign.turns.length - 1];
    if (last.scene_state) {
      last.scene_state.adversary = { ...(last.scene_state.adversary || {}), ...adversary };
      db.prepare('UPDATE dnd_turns SET scene_state_json = ? WHERE id = ?').run(JSON.stringify(last.scene_state), last.id);
    }
  }

  const currentTurnCount = campaign.turns.length ? Math.max(...campaign.turns.map((t) => t.turn_number)) : 0;
  const outcomeKey = diceRoll?.outcome || (diceRoll?.success === true ? 'success' : diceRoll?.success === false ? 'failure' : '');
  const cacheKey = makeCacheKey(campaignId, currentTurnCount, playerAction, outcomeKey);

  let out = null;
  if (!onToken && speculativeCache.has(cacheKey)) {
    try {
      const cached = await speculativeCache.get(cacheKey);
      if (cached && cached.narrative) {
        out = cached;
        speculativeCache.delete(cacheKey);
      }
    } catch (err) {
      console.warn('[DndSolo] Speculative cache hit failed, generating fresh:', err.message);
    }
  }

  if (!out) {
    out = await generateTurnStream(campaign, { playerAction, diceRoll, oracleResult, adversary }, onToken);
  }

  const prevSound = [...campaign.turns].reverse().find((t) => t.scene_state?.soundscape)?.scene_state.soundscape || null;
  const rs = getRuleset(campaign.ruleset_id);
  out.soundscape = await pickSoundscape({ title: out.scene_title, situation: out.situation, narrative: out.narrative, atmosphere: out.atmosphere, genre: rs?.metadata?.genre || rs?.genre || campaign.genre }, prevSound).catch(() => prevSound);
  const sheet = applyToSheet(campaign.character, out);
  const number = currentTurnCount + 1;
  saveTurn(campaignId, number, playerAction, out, diceRoll, oracleResult, sheet);
  if (number % SUMMARY_EVERY === 0 && isChronicleCompactionEnabled(campaignId)) {
    refreshStorySoFar(campaignId).catch((e) => console.warn('[DndSolo] story so far:', e.message));
  }

  // Gated: disabled by default to eliminate ~80% discarded background API calls
  scheduleSpeculativePreGen(campaignId, number, out).catch(() => {});

  return getCampaign(campaignId);
}

export async function processDmTurn(params) {
  return processDmTurnStream(params, null);
}

// Update the active adversary in the campaign's current turn
export function updateCampaignAdversary(campaignId, updates = {}) {
  const c = getCampaign(campaignId);
  if (!c) throw new Error('Campaign not found');
  const last = c.turns[c.turns.length - 1];
  if (!last) throw new Error('No turns in campaign');
  const state = last.scene_state || {};
  let currentAdv = state.adversary || { active: true };
  let adversaries = Array.isArray(state.adversaries) ? [...state.adversaries] : [];

  if (updates.id && adversaries.length) {
    adversaries = adversaries.map((a) => {
      if (a.id === updates.id || a.name === updates.name) {
        const mergedA = { ...a, ...updates };
        if (mergedA.hp !== undefined) {
          mergedA.hp = Math.max(0, Math.min(Number(mergedA.max_hp) || 20, Number(mergedA.hp) || 0));
          if (mergedA.hp <= 0) {
            mergedA.defeated = true;
            mergedA.status = 'Slain';
          }
        }
        return mergedA;
      }
      return a;
    });
    state.adversaries = adversaries;
    currentAdv = adversaries.find((a) => a.id === updates.id) || currentAdv;
  }

  const merged = { ...currentAdv, ...updates };
  if (merged.hp !== undefined) {
    merged.hp = Math.max(0, Math.min(Number(merged.max_hp) || 20, Number(merged.hp) || 0));
    if (merged.hp <= 0) {
      merged.defeated = true;
      merged.status = 'Slain';
    }
  }
  state.adversary = merged;
  if (!state.adversaries || !state.adversaries.length) {
    state.adversaries = [merged];
  } else if (!updates.id) {
    state.adversaries[0] = merged;
  }

  db.prepare('UPDATE dnd_turns SET scene_state_json = ? WHERE id = ?')
    .run(JSON.stringify(state), last.id);
  return getCampaign(campaignId);
}

// Take back the last turn: the sheet goes back to how it was before it
export function undoLastTurn(campaignId) {
  const c = getCampaign(campaignId);
  if (!c) throw new Error('Campaign not found');
  speculativeCache.clear();
  const last = c.turns[c.turns.length - 1];
  if (!last || last.turn_number === 0) throw new Error('There is nothing to take back.');
  const before = last.scene_state?.before;
  if (before && c.character) updateCharacter(c.character.id, { hp: before.hp, inventory: before.inventory, ...(before.trackers ? { trackers: before.trackers } : {}), ...(before.progress ? { progress: before.progress } : {}) });
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
