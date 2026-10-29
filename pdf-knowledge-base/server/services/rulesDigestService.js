import db from '../db/database.js';
import { GoogleGenerativeAI } from './geminiClient.js';
import config from '../config.js';
import { getModelFor } from './modelRegistry.js';

// In-memory cache of compiled rules digests: ruleset_id -> Array<Card>
const digestCache = new Map();

// High-fidelity Game System Configurations extracted directly from the core rulebooks.
// Provides basic system rules, key resource trackers, authentic tone, sensory palette,
// rulebook lexicon, and fluid pacing rules to ensure zero hesitation and maximum immersion.
export const GAME_SYSTEM_CONFIGS = {
  'ker-nethalas': {
    id: 'ker-nethalas',
    name: 'Ker Nethalas: Into the Midnight Throne',
    system_family: 'D100 Percentile Roll-Under',
    book_title: 'Ker Nethalas: Into the Midnight Throne',
    core_mechanics: {
      dice: '1d100',
      roll_under: true,
      target_score: 'Relevant Skill or Attribute (20-65)',
      crit_triumph: '01 or matched doubles (11, 22, 33...) <= Target (also marks skill with [✓] for permanent advancement check at next Camp)',
      crit_fumble: '100 or matched doubles (66, 77, 88, 99) > Target (triggers roll on Player/Monster Fumble Table d10)',
      initiative: 'Determined at start of combat: compare Survivor Perception vs Opponent Mind score (formerly Awareness).',
      action_economy: '1 Standard Action (attack, cast spell/Mastery, use backpack item, disengage) + Free Actions (belt quickslots, drop item) + Reactions (Dodge vs Agility, Parry vs Combat Skill with Parrying weapon or Shield). Cumulative -20% penalty for each additional reaction in the same round.',
      opposed_combat: 'Attacker and Defender both roll 1d100. Attacker gains +10 to skill (upper hand). To land a blow, roll <= skill and HIGHER than defender\'s roll (blackjack roll-under). If defender wins, roll on Defensive Move Table (1d10). If both fail, defender suffers 1 unavoidable damage.',
      weapon_speed: 'Weapon speed is subtracted directly from opponent\'s Combat Skill (effective target = opponent Combat Skill - weapon speed).',
      damage_pool: 'The old damage dealt table is removed! Attacker rolls multiple damage dice (weapon 1d6 + bonus dice) into a Damage Pool and CHOOSES A SINGLE RESULT to apply. Fixed modifiers apply to chosen die.',
      unarmed_combat: 'Deals 1d4 Bludgeoning damage with NO starting skill bonus.',
      hit_locations: 'Roll 1d20 on target Anatomy Table. Humanoid: 1-3 R.Leg, 4-6 L.Leg, 7-9 Abdomen, 10-12 Chest, 13-15 L.Arm, 16-18 R.Arm, 19-20 Head (Weak Spot). Weak Spot hit is an automatic Critical Strike. Attacking Weak Spot intentionally requires Disadvantage.',
      level_adaptation: 'Creatures scale with Character Level (⅃), gaining +Health, +Combat Skill, and new Traits at levels 5 and 10.',
      critical_mitigation: 'Sunder Option: Sacrificing and permanently destroying equipped shield or weapon completely negates and absorbs an incoming critical hit.'
    },
    trackers: {
      toughness: 'Superficial damage buffer pool (starts 2d6+20 or 3d6+20, range 22-38). Absorbs incoming damage after armor. Recovers D4 immediately after combat; recovers fully only at Camp Rest or via Bandages.',
      health: 'Physical vitality (starts d6+10, range 11-16). 0 = permanent death.',
      sanity: 'Mental fortitude (starts d6+10, range 11-16). Trauma and horrors deplete Sanity; reaching 0 forces an immediate roll on the Madness Table (1d10).',
      aether: 'Magical/psychic power pool (starts d6+8, range 10-14). Powers spells and Mastery abilities. Completely replenishes to maximum every time the survivor enters a new room.',
      light: 'Torch/lantern fuel (starts at 20 rooms; candles 10). Depletes by 1 per room traversed. Light 0 inflicts Blinded condition (-Disadvantage) and forces Resolve check each room or lose 1 Sanity.',
      tension_die: 'Usage Die chain (D8 -> D6 -> D4). Moving rooms or making noise steps it down on 1-2. Rolling 1-2 on D4 triggers a permanent Growing Darkness Domain Event (1d100) and resets to D8.',
      exhaustion: 'Fatigue points (starts at 1 with Hard Beginnings): 0-10 nominal, 11-15 healing halved, 16-20 Disadvantage on all checks, 21+ death. Spend 2 for +1 melee damage. Reduced by -1 (Ration), -2 (Breather), -10 (Camp).',
      rot: 'The Rot: 8 canonical infection stages (Stage 1 Necrotic immune/Holy vuln, Stage 2 max Toughness halved ... Stage 8 lost to abomination).',
      xp: 'Experience points (0-1000). 1,000 XP unlocks +1 Ability Point + choice of 8 permanent stat bonuses. Awards: +10 door/trap/book, +50 combat/new Domain, +200 Overseer boss.'
    },
    tone_and_atmosphere: {
      mood: 'Oppressive, claustrophobic, bleak necro-labyrinth; suffocating cosmic decay, lethal survival horror.',
      prose_style: 'Visceral, gritty, and direct. Second-person imperative. No whimsical fantasy or light-hearted banter. Victories are narrow and costly.',
      sensory_palette: [
        'Smell of stagnant briny water, decaying bone marrow, and guttering tallow torches',
        'Faint skittering of chitinous limbs across damp calcified flagstones',
        'Cold, calcified condensation dripping from vaulted sepulchral ceilings',
        'Scraping of rusted iron blades and rattling chains in ancient dark crypts'
      ],
      authentic_lexicon: [
        'Domain of Vaelor', 'Midnight Throne', 'Dyxemis', 'The Rot', 'Chitinous Crawlers',
        'Ossuary', 'Sepulchre', 'Reliquary', 'Flesh-Carver', 'Rot Knight', 'Tallow',
        'Necropolis', 'Calcified', 'Tenebrous', 'Sarcophagus', 'Toughness Buffer', 'Aether'
      ],
      pacing_guidelines: 'Keep narration between 100 and 140 words (2 punchy paragraphs). Describe lighting and sound immediately, force urgent survival decisions, and provide 3 distinct actionable choices.'
    }
  },
  'alien-rpg': {
    id: 'alien-rpg',
    name: 'Alien RPG (Heart of Darkness & Building Better Worlds)',
    system_family: 'Year Zero D6 Dice Pool',
    book_title: 'Alien RPG Core Rulebook',
    core_mechanics: {
      dice: 'D6 Dice Pool (Base Dice + Skill + Stress Dice)',
      roll_under: false,
      pool_success: 6,
      panic_trigger: 'Any 1 rolled on a Stress Die triggers an immediate Panic Roll (1d6 + current Stress).'
    },
    trackers: {
      stress: 'Stress starts at 0 and climbs with horrors, pushed rolls, and trauma. Increases dice pool but heightens panic risk.',
      oxygen: 'Air supply units; depleted during heavy exertion or suit punctures.',
      power: 'Power cells for motion trackers, pulse rifles, and maintenance tools.'
    },
    tone_and_atmosphere: {
      mood: 'Industrial retro-futurism, corporate nihilism, claustrophobic dread, sudden lethal violence.',
      prose_style: 'Staccato, urgent, sensory. Focus on mechanical failure, clinical readouts, and primal terror.',
      sensory_palette: [
        'Rhythmic click-ping of a motion tracker picking up closing signatures',
        'Hiss of pressurized steam and acrid reek of melting conduits',
        'Amber strobe of rotating emergency klaxons through industrial grates',
        'Cold sweat inside a damp environmental suit; metallic taste of recycled oxygen'
      ],
      authentic_lexicon: [
        'Weyland-Yutani', 'Xenomorph', 'Facehugger', 'Motion Tracker', 'Pulse Rifle',
        'Airlock', 'Synthetics', 'Acid Blood', 'Cryo-tube', 'Decompression', 'Panic Level'
      ],
      pacing_guidelines: 'Fast, breathless pacing. Escalate tension rapidly; every encounter with an organism is potentially fatal.'
    }
  },
  'ironsworn': {
    id: 'ironsworn',
    name: 'Ironsworn & Starforged',
    system_family: 'Action Roll vs Challenge Dice',
    book_title: 'Ironsworn Core Rulebook',
    core_mechanics: {
      dice: '1d6 Action Die + Stat vs two separate 1d10 Challenge Dice',
      roll_under: false,
      strong_hit: 'Action score beats BOTH Challenge Dice.',
      weak_hit: 'Action score beats ONE Challenge Die.',
      miss: 'Action score beats NEITHER Challenge Die (Pay the Price).',
      match_twist: 'Matching challenge dice trigger an unexpected dramatic twist or complication.'
    },
    trackers: {
      momentum: 'Ranges from -6 to +10. Burn momentum to cancel challenge dice on a critical move.',
      health_spirit: 'Physical resilience (Health) and mental fortitude (Spirit).',
      progress: 'Ten-box progress tracks for Vows, Journeys, and Combat.'
    },
    tone_and_atmosphere: {
      mood: 'Bleak, mythic low fantasy; harsh windswept peninsulas, ancient iron oaths, solitary perseverance.',
      prose_style: 'Sparse, evocative, dignified prose. Honor, hardship, and folklore over showy magic.',
      sensory_palette: [
        'Biting gale carrying sea spray and ash over barren heathland',
        'Cold touch of iron vellum and hearth embers glowing low in turf longhouses',
        'Howl of beasts across the trackless snowfields'
      ],
      authentic_lexicon: [
        'Iron Vow', 'Firstborn', 'Skerry', 'Hollows', 'Havens', 'Barrier', 'Pay the Price', 'Sworn'
      ],
      pacing_guidelines: 'Frame moves around the core triad: strong hit / weak hit with cost / miss with price.'
    }
  },
  'across-a-thousand-dead-worlds': {
    id: 'across-a-thousand-dead-worlds',
    name: 'Across a Thousand Dead Worlds',
    system_family: 'D20 DC Target Resolution',
    book_title: 'Across a Thousand Dead Worlds',
    core_mechanics: {
      dice: '1d20 + Attribute modifier vs DC (typically 10-25)',
      roll_under: false,
      crit_triumph: 'Natural 20',
      crit_fumble: 'Natural 1'
    },
    trackers: {
      oxygen: 'EVA air tanks depleted by exertion or environment hazards.',
      morale: 'Psychological stability amidst dead alien hulks and derelicts.'
    },
    tone_and_atmosphere: {
      mood: 'Cosmic loneliness, desolate archaeological horror, corporate scavenging, alien ruins.',
      prose_style: 'Clinical yet eerie; salvage logs and desolate wonder in deep space.',
      sensory_palette: [
        'Dead silence of the void punctuated by suit radio static and heavy breathing',
        'Phosphorescent glow of unknown alien alloys in the hold of a drifting hulk'
      ],
      authentic_lexicon: [
        'Scavenger', 'Derelict', 'Karman line', 'Xeno-artefact', 'Hull breach', 'Morale check'
      ],
      pacing_guidelines: 'Keep salvage decisions tactile, risky, and resource-dependent.'
    }
  },
  'ironsworn-starforged': {
    id: 'ironsworn-starforged',
    name: 'Ironsworn: Starforged',
    system_family: 'Action Roll vs Challenge Dice',
    book_title: 'Ironsworn: Starforged Core Rulebook',
    core_mechanics: {
      dice: '1d6 Action Die + Stat vs two separate 1d10 Challenge Dice',
      roll_under: false,
      strong_hit: 'Action score beats BOTH Challenge Dice.',
      weak_hit: 'Action score beats ONE Challenge Die.',
      miss: 'Action score beats NEITHER Challenge Die (Pay the Price).',
      match_twist: 'Matching challenge dice trigger an unexpected sci-fi dramatic twist.'
    },
    trackers: {
      momentum: 'Ranges from -6 to +10. Burn momentum on strong hits to reset to base.',
      health_spirit: 'Physical vitality (Health 0-5) and resolve (Spirit 0-5).',
      supply: 'Starship fuel, food, and ordnance (Supply 0-5).',
      starship_integrity: 'Hull and ship systems status (Integrity 0-5).'
    },
    tone_and_atmosphere: {
      mood: 'Sprawling sci-fi space western, perilous uncharted space, precursor vaults, solitary oaths.',
      prose_style: 'Evocative, cinematic, grounded science-fiction. Focus on vast silence, reactor hums, and iron resolve.',
      sensory_palette: [
        'Hum of the sub-light drive and rattle of micro-meteorites against the canopy',
        'Stark glare of an uncharted pulsar through polarized viewports',
        'Cold hiss of decompression seals opening onto forgotten orbital stations'
      ],
      authentic_lexicon: [
        'Iron Vow', 'Forge', 'Passage', 'Sector', 'Precursor', 'Derelict', 'Pay the Price', 'Sworn'
      ],
      pacing_guidelines: 'Frame moves around the core triad: strong hit / weak hit with cost / miss with price.'
    }
  },
  'barbarian-prince': {
    id: 'barbarian-prince',
    name: 'Barbarian Prince',
    system_family: '2d6 Combat Differential & Hex Navigation',
    book_title: 'Barbarian Prince Rules Book',
    core_mechanics: {
      dice: '2d6 (or 1d6 for events)',
      roll_under: false,
      combat_resolution: 'Attacker Combat minus Defender Combat gives combat differential column; roll 2d6 on Combat Table to inflict Wounds.'
    },
    trackers: {
      gold: 'Gold Pieces accumulated (Goal: 500 GP to raise an army and reclaim throne).',
      food: 'Rations available. 1 food consumed per day; starvation inflicts combat penalties.',
      days_left: 'Countdown from 70 days before the usurper consolidates rule.',
      followers: 'Hired mercenaries, guides, and loyal northland retainers.'
    },
    tone_and_atmosphere: {
      mood: 'Classic heroic sword and sorcery; rugged northern steppes, ancient temples, ruined citadels, treacherous wilderness.',
      prose_style: 'Stirring, adventurous, legendary. Heroic grit and wilderness survival.',
      sensory_palette: [
        'Chilling mountain wind carrying howling wolves across pine-clad ridges',
        'Clink of ancient gold coins discovered beneath mossy megaliths',
        'Ring of cold steel blades clashing in overgrown ruined courtyards'
      ],
      authentic_lexicon: [
        'Cal Arath', 'Northlands', 'Usurper', 'Hex', 'Combat Rating', 'Wounds', 'True Heir', 'Hired Guard'
      ],
      pacing_guidelines: 'Track each day of travel, enforce food and wilderness hazards, and make combat decisive.'
    }
  },
  'last-days-zombie-apocalypse': {
    id: 'last-days-zombie-apocalypse',
    name: 'Last Days: Zombie Apocalypse',
    system_family: '1d6 Skirmish & Survival Resolution',
    book_title: 'Last Days: Zombie Apocalypse Core Book',
    core_mechanics: {
      dice: '1d6',
      roll_under: false,
      target_resolution: 'Roll 1d6 + Stat against target numbers (typically 4-6). Natural 6 is a clean hit; Natural 1 is a jam/stumble.',
      noise_mechanic: 'Firearms and loud actions generate Noise Tokens; zombies spawn and rush toward the sound.'
    },
    trackers: {
      ammo: 'Rounds remaining for rifles, shotguns, and pistols.',
      supplies: 'Canned food, fuel, medicine, and repair materials.',
      refuge_defense: 'Barricade structural integrity protecting survivors during night raids.',
      noise: 'Current sound level alerting the surrounding undead.'
    },
    tone_and_atmosphere: {
      mood: 'Desperate post-apocalyptic survival, tactical tension, claustrophobic urban decay, dwindling resources.',
      prose_style: 'Tense, gritty, grounded. Focus on ticking clocks, spent bullet casings, and moaning hordes.',
      sensory_palette: [
        'Rattle of chain-link fences shaking under decaying hands',
        'Acrid tang of gunpowder and cordite in a rain-slicked alleyway',
        'Dry click of an empty firearm chamber when an infected lunges'
      ],
      authentic_lexicon: [
        'Refuge', 'Scavenge', 'Noise Token', 'Infected', 'Shambler', 'Headshot', 'Barricade', 'Supply Run'
      ],
      pacing_guidelines: 'Escalate noise and pressure with every aggressive action; force scavenge vs combat choices.'
    }
  },
  'campfire-story': {
    id: 'campfire-story',
    name: 'CAMPFIRE STORY',
    system_family: 'PbtA 2d6 Move Triad',
    book_title: 'Campfire Story Rules',
    core_mechanics: {
      dice: '2d6 + Stat',
      roll_under: false,
      strong_hit: '10+ Full Success: the story reveals truth without consequence.',
      weak_hit: '7-9 Partial Success: truth revealed, but Dread climbs or a complication manifests.',
      miss: '6 or less Miss: Dread advances, darkness closes in, or calamity strikes.'
    },
    trackers: {
      hearth_embers: 'Warmth and flame level keeping the darkness from rushing in.',
      courage: 'Inner fortitude to face the uncanny without fleeing.',
      dread: 'Mounting psychological terror as nocturnal horrors encircle the clearing.'
    },
    tone_and_atmosphere: {
      mood: 'Intimate folk horror, rural legends, flickering firelight, supernatural dread.',
      prose_style: 'Hushed, poetic, unsettling. Low murmurs by dying embers.',
      sensory_palette: [
        'Crackling spit of pine sap and glowing embers swirling into pitch black skies',
        'Twig snapping just beyond the ring of lantern light in the deep woods',
        'Breath condensing in sudden unnatural freezing cold'
      ],
      authentic_lexicon: [
        'Embers', 'The Clearing', 'Dread', 'Nocturnal', 'Rural Legend', 'Shadows', 'Folk Tale'
      ],
      pacing_guidelines: 'Keep narration hushed and eerie; frame moves around the 10+ / 7-9 / 6- triad.'
    }
  },
  'doom-pilgrim': {
    id: 'doom-pilgrim',
    name: 'Doom Pilgrim',
    system_family: 'Fate Card Deck & 1d6 Checks',
    book_title: 'Doom Pilgrim Core Rules',
    core_mechanics: {
      dice: 'Fate Card Draws & 1d6',
      roll_under: false,
      card_resolution: 'Draw Fate Cards to dictate terrain, trials, and encounter hazards; roll 1d6 against pilgrimage trials.'
    },
    trackers: {
      blood: 'Physical vitality and wound resilience.',
      soul: 'Spiritual purity resisting creeping demonic corruption.',
      guilt: 'Sins hindering divine intervention and miracles.',
      fate: 'Omen tokens spent to redraw perilous fate cards.'
    },
    tone_and_atmosphere: {
      mood: 'Bleak grimdark medieval pilgrimage, flagellants, crumbling cathedrals, demonic ruin.',
      prose_style: 'Austere, solemn, religiously devout. Iron and scripture.',
      sensory_palette: [
        'Heavy scent of myrrh, sulfur, and unwashed penitent coarse wool',
        'Echoing toll of distant iron bells over desolate plague-ridden moorland',
        'Flicker of wax candles illuminating weeping stone iconographies'
      ],
      authentic_lexicon: [
        'Pilgrim', 'Penance', 'Creeping Doom', 'Fate Card', 'Sanctuary', 'Relic', 'The Scourge'
      ],
      pacing_guidelines: 'Every pilgrimage step is costly; force sacrifices between blood, soul, and guilt.'
    }
  },
  'thousand-year-old-vampire': {
    id: 'thousand-year-old-vampire',
    name: 'Thousand Year Old Vampire',
    system_family: '1d10 - 1d6 Prompt Navigation',
    book_title: 'Thousand Year Old Vampire',
    core_mechanics: {
      dice: '1d10 - 1d6',
      roll_under: false,
      memory_rule: 'Record Experiences in 5 Memory slots (3 Experiences per Memory). When full, old Memories must be struck through and lost to oblivion.'
    },
    trackers: {
      memories: 'Remaining active memory clusters before mortal identity fades.',
      skills: 'Practical talents surviving the passage of centuries.',
      resources: 'Stashes of gold, properties, and heirloom relics.',
      characters: 'Mortals loved or consumed (who age and die while you endure).'
    },
    tone_and_atmosphere: {
      mood: 'Gothic tragedy, melancholy, eternal loneliness, horrifying predatory hunger.',
      prose_style: 'Introspective, historical, elegiac diary prose.',
      sensory_palette: [
        'Faded scent of dried lavender pressed between vellum pages from three centuries ago',
        'Cold, iron taste of blood under moonlit cathedral arches',
        'Flickering candlelight reflecting in mirrors where no face appears'
      ],
      authentic_lexicon: [
        'Experience', 'Memory', 'Struck Through', 'Immortal Mark', 'Predator', 'Oblivion', 'Lost Century'
      ],
      pacing_guidelines: 'Focus on the tragedy of forgotten humanity, lost loves, and the inexorable passage of time.'
    }
  },
  'thousand-year-old-campfire': {
    id: 'thousand-year-old-campfire',
    name: 'Thousand Year Old Campfire',
    system_family: 'Archaeological Strata Navigation (1d6 / 2d6)',
    book_title: 'Thousand Year Old Campfire Journal',
    core_mechanics: {
      dice: '1d6, 2d6, or 3d6',
      roll_under: false,
      strata_resolution: 'Roll dice to excavate deeper archaeological strata and uncover prehistoric hearths.'
    },
    trackers: {
      strata_depth: 'Depth of current excavation layer (centuries in the past).',
      relics: 'Preserved stone tools, carved bone amulets, and hearth charcoal.',
      memories: 'Evolving records of communal storytelling across epochs.'
    },
    tone_and_atmosphere: {
      mood: 'Contemplative archaeological wonder, deep time, prehistoric survival, primordial connection.',
      prose_style: 'Poetic, observational, quiet and reverent.',
      sensory_palette: [
        'Damp earth smelling of crushed clay and ancient charcoal',
        'Smooth touch of river-polished flint flaked forty generations ago',
        'Ghostly warmth of an ash pit uncovered beneath meters of sediment'
      ],
      authentic_lexicon: [
        'Strata', 'Excavation', 'Hearth', 'Petroglyph', 'Flint', 'Sediment', 'Epoch'
      ],
      pacing_guidelines: 'Move deliberately through soil layers, uncovering echoes of forgotten peoples.'
    }
  }
};

// Built-in foundational rules digests for key systems in Simon's library.
// Every card includes rich contextual triggers, concrete step-by-step procedures,
// explicit outcomes, and source page citations.
const SEED_DIGESTS = {
  'ker-nethalas': [
    {
      id: 'kn-core-resolution',
      ruleset_id: 'ker-nethalas',
      category: 'core',
      title: 'D100 Roll-Under Core Resolution',
      trigger_when: 'Whenever the player attempts any uncertain physical, mental, or skill check (Body, Endurance, Resolve, Scavenge, Lore, Stealth)',
      procedure: '1. Identify the relevant Skill or Attribute value on the character sheet (typically 20-65).\n2. Roll 1d100.\n3. Roll <= Target is a SUCCESS. Roll > Target is a FAILURE.\n4. Any Matched Doubles (11, 22, 33, 44, 55, 66, 77, 88, 99) mark that Skill for Improvement [✓] at Camp, regardless of whether the check was a success or failure!\n5. Critical Triumph: Roll of 01 or any matched double <= Target.\n6. Critical Mishap (Fumble): Roll of 100 or any matched double > Target (rolls on the Fumbles Table d10).',
      outcomes: {
        success: 'Action succeeds cleanly without complication.',
        failure: 'Action fails; narrative tension rises or a hazard triggers.',
        crit_triumph: 'Maximum success; mark skill for advancement and gain immediate tactical advantage.',
        crit_fumble: 'Severe complication: roll on the Player Fumble Table (weapon dropped, gear shattered, or prone).'
      },
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 70
    },
    {
      id: 'kn-combat-sequence',
      ruleset_id: 'ker-nethalas',
      category: 'combat',
      title: 'Melee & Ranged Attack Procedure',
      trigger_when: 'Whenever the player attacks an enemy, or an enemy attacks the player in melee or at range',
      procedure: '1. Attacker rolls 1d100 against weapon/combat skill with +10 bonus (Attacker has the upper hand).\n2. Defender simultaneously rolls 1d100 to defend (Dodge vs Agility, or Parry with Combat Skill if wielding a Parrying weapon or Shield).\n3. Blackjack Rule: Combatant rolling higher while <= skill wins the exchange.\n4. Defender Win: If defender rolls higher under skill, they deflect the blow and roll on the Player or Monster Defensive Move Table (1d10, p. 78).\n5. Both Fail: If both combatants roll > skill, the defender suffers 1 unavoidable damage.\n6. Damage Pool: Non-magical weapons deal 1d6 base damage. When rolling multiple damage dice (Damage Pool), only ONE chosen die applies to damage! Player may spend 2 Exhaustion for +1 damage on a hit.\n7. Hit Location: Roll 1d20 on target Anatomy Table (Humanoid: 1-3 R.Leg, 4-6 L.Leg, 7-9 Abdomen, 10-12 Chest, 13-15 L.Arm, 16-18 R.Arm, 19-20 Head Weak Spot).',
      outcomes: {
        hit: 'Subtract location Protection from weapon damage; excess hits Toughness first, remainder hits Health.',
        defended: 'Attack deflected; defender rolls on Defensive Move Table.',
        both_failed: 'Defender suffers 1 unavoidable damage.'
      },
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 75
    },
    {
      id: 'kn-defensive-moves',
      ruleset_id: 'ker-nethalas',
      category: 'combat',
      title: 'Defensive Reactions: Dodge, Parry & Defensive Moves Table',
      trigger_when: 'When an enemy lands a hit on the player character, or player fends off an attack during combat',
      procedure: '1. Parry Constraint: A player can ONLY Parry if their equipped weapon has the Parrying trait, or if equipped with a Shield. Otherwise, they MUST use Dodge.\n2. Cumulative Reaction Penalty: 1st reaction is at full skill; each additional reaction in the same round incurs cumulative -20% penalty.\n3. Player Defensive Move Table (1d10, rolled when player wins defensive opposed roll):\n   1: Next attack gains +10.\n   2: Opponent Armor -1 in struck location until end of combat.\n   3: Opponent receives Bleeding (1).\n   4: Immune to all conditions until next turn.\n   5: Opponent immediately suffers 1 Piercing damage ignoring Armor.\n   6: +D6 damage to Damage Pool for next attack.\n   7: Gain Advantage on next attack.\n   8: Opponent next defensive check at -20.\n   9: Recover 2 Toughness.\n   10: Next attack doesn\'t suffer Disadvantage when targeting Weak Spot.\n4. Monster Defensive Move Table (1d10): Monster gains +10 attack, shreds player armor -1, inflicts Bleeding, recovers d4 Health, or gets an extra turn on 10.',
      outcomes: {
        player_defended: 'Roll 1d10 on Player Defensive Move Table for immediate tactical bonus.',
        monster_defended: 'Monster rolls 1d10 on Monster Defensive Move Table.'
      },
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 78
    },
    {
      id: 'kn-armor-wounds',
      ruleset_id: 'ker-nethalas',
      category: 'combat',
      title: 'Armor Protection, Toughness vs Health & Integrity Degradation',
      trigger_when: 'Resolving incoming physical, puncture, or slashing damage, and post-combat armor durability',
      procedure: '1. Incoming damage is reduced by equipped Armor Protection on the struck body location (Protection 1-3).\n2. Remaining damage depletes Toughness buffer first (superficial cuts and stamina).\n3. Once Toughness reaches 0, excess damage penetrates directly to Health. At 0 Health, character dies permanently (or uses Optional Forgiving Death rule: lose 2 Masteries, wake with 2d6 Health/Sanity).\n4. Post-Combat Toughness Recovery: Characters recover ONLY D4 Toughness immediately after a fight concludes! Full Toughness resets ONLY at Camp Rest.\n5. Armor Integrity: After any combat where armor absorbed hits, roll its Integrity Die (D12 -> D10 -> D8 -> D6 -> D4). Rolling 1-2 degrades the die 1 step. Rolling 1-2 on D4 permanently destroys the piece.',
      outcomes: {
        toughness_absorbed: 'Absorbed by Toughness buffer; +d4 recovered post-combat.',
        health_lost: 'Severe wound; requires Camp Rest or magic to heal.',
        integrity_tested: 'Roll integrity die on 1-2 degradation.'
      },
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 82
    },
    {
      id: 'kn-light-darkness',
      ruleset_id: 'ker-nethalas',
      category: 'survival',
      title: 'Light Tracker, Torches, Lamps & Pitch Darkness Penalties',
      trigger_when: 'Lighting a light source, traversing rooms, taking breathers, or fighting in underground catacombs',
      procedure: '1. Lighting a Torch / Lamp: AUTOMATIC SUCCESS (requires flint and tinder / fuel; NEVER roll a check for lighting outside combat).\n2. Light Fuel: Standard Torch or Lamp lasts for 20 rooms (Candle lasts 10 rooms). Each room entered consumes 1 Light. Lamp combat setting down costs 1 Standard Action.\n3. Pitch Darkness (Light = 0): Character suffers the Blinded condition (Disadvantage on all skill checks except Reason; cannot target Weak Spots or use Mastery abilities) AND must pass a Resolve check entering every room or lose 1 Sanity.',
      outcomes: {
        well_lit: 'Normal vision; clues and hazards visible.',
        pitch_black: 'Blinded condition; Resolve checks every room to prevent Sanity loss.'
      },
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 96
    },
    {
      id: 'kn-tension-wandering',
      ruleset_id: 'ker-nethalas',
      category: 'exploration',
      title: 'Tension Die Usage Chain (D8 -> D6 -> D4) & Growing Darkness',
      trigger_when: 'Entering a new chamber, making loud noise, forcing heavy doors, or lingering to search',
      procedure: '1. Tension Die starts at D8. Whenever the character enters a room or makes noise, roll the Tension Die.\n2. On a roll of 1-2, the Tension Die drops one stage down the Usage Chain: D8 -> D6 -> D4.\n3. Rolling 1-2 on the D4 triggers a roll on the Growing Darkness Table (1d100, p. 120-122) and resets the Tension Die back to D8!\n4. Growing Darkness events apply permanent Domain-wide curses and hazards that remain active in that Domain until abandoned.',
      outcomes: {
        stable: 'Roll 3+ on Tension Die; die remains at current stage.',
        stepped_down: 'Roll 1-2; die drops to next lower step.',
        growing_darkness: 'Roll 1-2 on D4; roll 1d100 on Growing Darkness table and reset to D8.'
      },
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 120
    },
    {
      id: 'kn-scavenging-debris',
      ruleset_id: 'ker-nethalas',
      category: 'exploration',
      title: 'Scavenging Corpses, Chests & Debris (One Roll Per Room Limit)',
      trigger_when: 'Searching defeated foes, fallen adventurers, stone sarcophagi, or ancient chests',
      procedure: '1. Rule of One: A room or encounter area may strictly be scavenged/searched ONCE. Once searched (success or fail), all salvage in the room is depleted and cannot be re-rolled.\n2. Scavenge Check: Roll 1d100 vs Scavenge skill. On success, roll on Scavenging Table (p. 116). Critical triumph rolls on Spoils table.\n3. Deep Search for Containers: Once per room, player may make a deep search for hidden containers. Cost: immediately make a Tension Die check and accrue 2 Exhaustion. Roll 1d10: 1-5 empty, 6-10 roll on Container Loot Table (p. 220).',
      outcomes: {
        success: 'Gain craft supplies, coins, or rations.',
        deep_search: 'Accrue 2 Exhaustion and test Tension to search for container relics.'
      },
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 114
    },
    {
      id: 'kn-breather-camp',
      ruleset_id: 'ker-nethalas',
      category: 'survival',
      title: 'Taking a Breather & Setting Camp (The Camp Check 12+)',
      trigger_when: 'Halting to rest, bandage wounds, craft, or sleep in a secured catacomb chamber',
      procedure: '1. Taking a Breather (10 mins): Recover D10+2 Toughness, 1 Health, and reduce Exhaustion by 2. Cost: Light reduced by 5, and Tension Die drops down 1 stage.\n2. Setting Camp: Consumes 1x Ration (without ration, camping benefits halved). Base benefits: Full Toughness restored, 1 Health healed, D4 Sanity recovered, -10 Exhaustion.\n3. The Camp Check: Roll 1d20 after completing all Camp Activities. Result of 12+ means safe rest! Failure (<12) triggers an immediate Encounter roll (p. 133) and halves all camping benefits.\n4. Camp Activities (Exhaustion & Check Modifiers):\n   - Barricade: Spend 1x Crafting Supplies (+1 Exh, +5 to Camp Check).\n   - Sleep: Do nothing else (-5 Exh, +1 extra Health, +2 to Camp Check).\n   - Repair: Spend 2x Crafting Supplies to fix broken weapon or step Armor Integrity up 1 die (+2 Exh, -2 to Camp Check).\n   - Cooking: 1x Ingredient -> 1x Ration (+1 Exh, -1 to Camp Check).\n   - Craft Bandages / Oil / Lockpicks / Torches: (+1 Exh, -1 to -2 to Camp Check).\n   - Heal Condition: Spend 1 Bandage per condition (+1 Exh, no check needed).\n   - Attune: Spend 1 Attunement Crystal to unlock magic item properties (+1 Exh per item).\n   - Skill Improvement: Roll 1d100 for each marked skill [✓]; roll > skill adds +d4%, roll <= skill adds +1%.',
      outcomes: {
        safe_camp: 'Camp check 12+ passed; full benefits applied cleanly.',
        ambushed_camp: 'Camp check failed (<12); monster encounter rolls and rest benefits halved.'
      },
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 123
    },
    {
      id: 'kn-rot-infection',
      ruleset_id: 'ker-nethalas',
      category: 'survival',
      title: 'The Rot: 8 Canonical Infection Stages',
      trigger_when: 'Wounded by undead, wading through necrotic sludge, or exposed to miasmic crypt vapors',
      procedure: '1. Exposure forces immediate Endurance check (1d100 <= Endurance) to resist contagion.\n2. If infected, each rest forces an Endurance check or The Rot advances one stage:\n   - Stage 1: Immune to Necrotic damage, but Vulnerable to Holy damage.\n   - Stage 2: Maximum Toughness buffer is reduced by half.\n   - Stage 3: Skin becomes black as charcoal; gains Darkvision (no lightsource needed!).\n   - Stage 4: Ravenous; requires 2x Rations to remove 1 Exhaustion.\n   - Stage 5: Flesh knits itself; recovers +D4 Health each time you Set Camp.\n   - Stage 6: Nervous system decay; Disadvantage on all weapon skills, Dodge, Body, Acrobatics.\n   - Stage 7: Immune to the effects of Exhaustion.\n   - Stage 8: Rot overtakes the mind; character is permanently lost as an abomination.',
      outcomes: {
        resisted: 'Immune system holds off the contagion.',
        advanced: 'Advance Rot Tracker to next stage and apply exact stage mutations.'
      },
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 87
    },
    {
      id: 'kn-initiative-action-economy',
      ruleset_id: 'ker-nethalas',
      category: 'combat',
      title: 'Initiative, Action Economy, Weapon Speed & Belt Quickslots',
      trigger_when: 'At the start of combat, or managing actions in a combat round',
      procedure: '1. Initiative: Compare Survivor Perception vs Opponent Mind score (or roll 1d100 <= Perception). Surprise ambushes award automatic initiative and +20% to attack.\n2. Action Economy:\n   - 1 Standard Action: Attack, cast Mastery ability, use backpack item, or Disengage/Flee (Dodge check).\n   - Free Actions (1 per round): Draw/use item from Belt Quickslot, drop item, speak words.\n   - Reactions: Dodge or Parry (Parrying weapon/shield only). 1st reaction at full skill, each subsequent reaction at cumulative -20%.\n3. Weapon Speed: Every weapon has a Speed rating subtracted directly from the opponent\'s Combat Skill when attacking.',
      outcomes: {
        initiative_won: 'Survivor acts first with Standard Action.',
        belt_used: 'Item from belt quickslot consumed as Free Action.'
      },
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 72
    },
    {
      id: 'kn-hit-locations-damage',
      ruleset_id: 'ker-nethalas',
      category: 'combat',
      title: 'D20 Hit Locations, Weak Spots & Critical Strikes',
      trigger_when: 'When an attack successfully hits a target',
      procedure: '1. Hit Location (D20 roll on target anatomy table):\n   - Humanoid: 1-3 Right Leg, 4-6 Left Leg, 7-9 Abdomen, 10-12 Chest, 13-15 Left Arm, 16-18 Right Arm, 19-20 Head (Weak Spot).\n   - Other tables: Arachnid, Winged Biped, Insectoid, Quadruped, Serpentoid.\n2. Weak Spot: Striking a Weak Spot (Head 19-20 for Humanoid) is an AUTOMATIC Critical Strike!\n3. Intentional Weak Spot Targeting: Player can deliberately declare an attack targeting a Weak Spot by making the attack check with Disadvantage.\n4. Damage Resolution: Deduct location Armor Protection first; remaining damage depletes Toughness buffer; excess hits Health.',
      outcomes: {
        weak_spot_struck: 'Automatic Critical Strike: double damage die and flat modifiers.',
        location_armored: 'Location armor absorbs its flat Protection rating.'
      },
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 80
    },
    {
      id: 'kn-piecemeal-armour-protection',
      ruleset_id: 'ker-nethalas',
      category: 'equipment',
      title: 'Piecemeal Armour, Protection Rating & Integrity Dice Chains',
      trigger_when: 'Equipping armour, taking hits to locations, or checking post-combat durability',
      procedure: '1. Protection Values (Flat Damage Absorption):\n   - Cloth / Soft Leather: Protection 1 (Integrity d6-d8, Maneuverability -5%)\n   - Rigid Leather / Mail / Scale: Protection 2 (Integrity d8-d10, Maneuverability -10% to -15%)\n   - Plate (Breastplate / Cuirass): Protection 3 (Integrity d12, Maneuverability -20%)\n2. Location Specific: Breastplate absorbs 3 damage ONLY on Torso hits (Chest/Abdomen). Unarmoured limbs take full damage.\n3. Post-Combat Integrity Test: After any combat where armor absorbed hits, roll its Integrity Die (D12 -> D10 -> D8 -> D6 -> D4). Rolling 1-2 steps down die chain; rolling 1-2 on D4 permanently destroys the piece.\n4. Repair: Camp Repair activity (2x Crafting Supplies) steps Integrity up by one die type.',
      outcomes: {
        torso_protected: 'Breastplate absorbs 3 incoming damage from any Torso strike.',
        integrity_degraded: 'Rolled 1-2 on Integrity die; piece degrades until repaired at Camp.'
      },
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 210
    },
    {
      id: 'kn-critical-mitigation',
      ruleset_id: 'ker-nethalas',
      category: 'combat',
      title: 'Critical Hits & Weapon/Shield Sunder (Panic Option)',
      trigger_when: 'When an enemy scores a Critical Hit (01 or matched doubles under skill)',
      procedure: '1. Enemy Critical Hit: Bypasses armor completely and inflicts double weapon damage directly to Health.\n2. Sunder Panic Option: The player may immediately declare their equipped shield or weapon is sacrificed to block the fatal strike.\n3. The sacrificed item is permanently destroyed and removed from inventory, but completely absorbs and negates all damage from the critical hit.',
      outcomes: {
        crit_taken: 'Devastating double damage directly against Health.',
        gear_sacrificed: 'Shield/weapon destroyed; hero escapes all damage unscathed.'
      },
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 80
    },
    {
      id: 'kn-aether-magic',
      ruleset_id: 'ker-nethalas',
      category: 'magic',
      title: 'Aether Pool, Spells & Mastery Powers',
      trigger_when: 'Casting spells, invoking supernatural Masteries, or entering a new room',
      procedure: '1. Aether Pool: Mana resource (starts at 10) used to power Mastery abilities.\n2. Sustained Abilities: Reduce max Aether while maintained until dismissed.\n3. Room Transition Replenishment: Every single time the Survivor enters a new room or corridor, the Aether pool COMPLETELY REPLENISHES to maximum!',
      outcomes: {
        spell_cast: 'Aether deducted; supernatural effect manifests immediately.',
        room_entered: 'Aether pool automatically restores to maximum.'
      },
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 22
    },
    {
      id: 'kn-toughness-buffer',
      ruleset_id: 'ker-nethalas',
      category: 'survival',
      title: 'Toughness Regeneration vs Permanent Health Loss',
      trigger_when: 'Resolving incoming damage or concluding a combat encounter',
      procedure: '1. Health: Absolute physical life (10-16). Rolled at creation, 0 = permanent death.\n2. Toughness: Superficial combat buffer (10-20). Incoming damage absorbs into Toughness before touching Health.\n3. Post-Combat Recovery: Finishing combat restores ONLY D4 Toughness immediately! Toughness does NOT reset to 100% full between rooms without Camp Rest or Bandages + Medicine (D4 once per room).',
      outcomes: {
        combat_ended: 'Recover D4 Toughness immediately.',
        camp_rest: 'Full Toughness reset occurs upon safe Camp Rest.'
      },
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 86
    },
    {
      id: 'kn-xp-advancement',
      ruleset_id: 'ker-nethalas',
      category: 'advancement',
      title: 'Experience Points (XP) Awards & Level Up Benefits',
      trigger_when: 'Defeating foes, overcoming hazards, exploring domains, or reaching 1,000 XP',
      procedure: '1. XP Awards:\n   - Opening locked door or container (any method): +10 XP\n   - Dismantling trap: +10 XP\n   - Finding Lore Book: +10 XP\n   - Entering new Domain: +50 XP\n   - Defeating regular Combat Encounter: +50 XP\n   - Defeating Domain Overseer: +200 XP\n2. Leveling Up at 1,000 XP: Grants +1 Ability Point down Mastery tree (Tier 1-5) PLUS player choice of one permanent buff:\n   - +D4 Health\n   - +D6 Toughness\n   - +D4 Sanity\n   - +D6 Aether\n   - +D6 damage (Slashing, Bludgeoning, or Piercing) to Damage Pool\n   - +1 damage to an existing Ability\n   - +5 to any Skill\n   - +5 to Endurance, Resolve, and Spellward.',
      outcomes: {
        xp_awarded: 'Increase XP tracker by the awarded amount.',
        level_up: 'At 1,000 XP, unlock +1 Ability Point + choice of 8 permanent stat bonuses.'
      },
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 62
    },
    {
      id: 'kn-skill-doubles-advancement',
      ruleset_id: 'ker-nethalas',
      category: 'advancement',
      title: 'Skill Advancement via Doubles & Camp Improvement Rolls',
      trigger_when: 'Rolling matched doubles on any d100 skill check or taking a Camp Rest',
      procedure: '1. Marking Doubles: Whenever you roll matched doubles (11, 22, 33...) on ANY skill check (success OR failure), mark that Skill for Improvement [✓].\n2. Camp Improvement Check: While at Camp, roll 1d100 for each marked skill:\n   - If roll is HIGHER than current score: Skill increases permanently by +D4% (up to 80%).\n   - If roll is EQUAL OR LOWER: Skill STILL increases permanently by +1% (up to 80%)!\n3. Erase all advancement marks after camp checks are completed.',
      outcomes: {
        skill_marked: 'Mark [✓] beside skill on sheet.',
        camp_improvement: 'Skill increases by +d4% (if > score) or +1% (if <= score).'
      },
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 62
    },
    {
      id: 'kn-growing-darkness',
      ruleset_id: 'ker-nethalas',
      category: 'table',
      title: 'Growing Darkness Table (Domain Cataclysms)',
      trigger_when: 'When the Tension Die rolls 1-2 on D4, resetting the Tension Die back to D8',
      procedure: 'Roll 1d100 on the Growing Darkness Table (p. 120-122). Effects accumulate and permanently affect the current Domain:\n01-02: Choir of howls; Animal opponents +10 Combat Skill.\n03-04: Shadows lengthen; Resolve check or lose 1 Sanity per active Growing Darkness event.\n05-06: Wounds resonate; if not fully healed, receive D6 Psychic damage.\n07-08: Losing grip; if Sanity not max, automatically lose 1 Sanity.\n09-10: Spirit drained; reduce max Aether by D4.\n11-12: Choking air; reduce max Toughness by D6.\n13-14: Chilling wind; Elemental opponents +10 Combat Skill.\n15-16: Stalkers closing; Taking a Breather drops Tension and forces immediate Tension check.\n17-18: Shaking hands; Camp Check reduced by -1.\n19-20: Unfathomable dread; cannot Attune at Camp.\n21-22: Spirit weakened; Spellward reduced by -10.',
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 120
    },
    {
      id: 'kn-domain-overseer-influence',
      ruleset_id: 'ker-nethalas',
      category: 'exploration',
      title: 'Domain Overseer Influence, Lair Checks & Domain Exits',
      trigger_when: 'Entering a new Domain, placing rooms, or searching for the Overseer and Domain Exit',
      procedure: '1. Start of Domain: Roll Overseer (p. 179) and roll Overseer Influence (1d10, p. 100). All creatures in the Domain gain this buff until the Overseer is slain (1 Tough/Immune to Crits, 2 Vital +d6 Health per 5L, 3 Frenzied +1 dmg, 4 Skilled +10 skill, 5 Magebane +10 magic res, 6 Resistant to 1 damage type, 7 Corrupting 5+ dmg forces Sanity check, 8 Unstable explodes for 1 arcane dmg, 9 Alert +20 Mind, 10 Piercing).\n2. Lair Check: Each room placed rolls a D10 Usage Die. Rolling 1-2 steps it down (D10 -> D8 -> D6 -> D4). Rolling 1-2 on D4 (or room 15) reveals the Overseer\'s Lair!\n3. Domain Exit Check: Once Lair is located, each new room rolls a D8 Usage Die. Rolling 1-2 on D4 discovers the Domain Exit to the next domain.',
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 98
    },
    {
      id: 'kn-player-monster-fumbles',
      ruleset_id: 'ker-nethalas',
      category: 'combat',
      title: 'Combat Fumbles Tables (Player & Monster)',
      trigger_when: 'When rolling doubles over combat skill or rolling 100 on an attack or weapon action',
      procedure: '1. Player Fumble Table (1d10, p. 84):\n   1: Drop weapon; spend next turn retrieving/drawing new weapon.\n   2: Weapon wedged deep in wall/floor; Standard Action Body check to retrieve.\n   3: Weapon smashes stone; non-magical weapon breaks in half (repairable at Camp).\n   4: Belt item breaks; make Belt Check (1d4).\n   5: Drained; lose D8 Aether (or 1 Piercing damage).\n   6: Trip and fall; Prone (Standard Action to stand).\n   7: Slam head; Prone and Dazed (2).\n   8: Attack strikes random ally (or self if alone).\n   9: Strike yourself with a normal attack.\n   10: Severe self-harm; receive a Critical Strike from own weapon!\n2. Monster Fumbles (1d10, p. 85): Monster at -20 attack, Stunned, Restrained, grants player Advantage, trips Prone, or strikes itself.',
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 84
    },
    {
      id: 'kn-exhaustion-tiers',
      ruleset_id: 'ker-nethalas',
      category: 'survival',
      title: 'Exhaustion Penalties & Combat Expenditure',
      trigger_when: 'Accruing fatigue from delving, events, deep container searches, or spending exhaustion in combat',
      procedure: '1. Exhaustion Accumulation:\n   - 0-10: Nominal (heavy breathing and sweating; no penalties).\n   - 11-15: Healing halved from all sources (potions, camp, rest).\n   - 16-20: Disadvantage on ALL skill and combat checks!\n   - 21+: Lethal collapse; character dies of physical exhaustion.\n2. Combat Boost: PC can spend 2 Exhaustion on a successful melee strike for +1 flat damage.\n3. Reduction: -1 Exhaustion per Ration consumed; -2 Exhaustion per Breather; -10 Exhaustion per Camp Rest.',
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 90
    },
    {
      id: 'kn-sanity-madness',
      ruleset_id: 'ker-nethalas',
      category: 'survival',
      title: 'Sanity Loss & The Madness Table',
      trigger_when: 'When a character\'s Sanity drops to 0 from horrors, pitch darkness, or corrupted altars',
      procedure: 'When Sanity reaches 0, character suffers an acute psychotic episode. Roll 1d10 on the Madness Table (p. 91):\n1: Mind breaks completely; character is permanently lost/dead.\n2: Mind in shambles; all future Madness rolls suffer -1 (cumulative).\n3: Physical strain; reduce max Toughness by -1 (cumulative).\n4: Paranoia; each future Sanity loss inflicts an extra -1 (cumulative).\n5: Hasty panic; Scavenging becomes Demanding (-10).\n6: Despair; all Resolve checks become Demanding (-10).\n7: Memory fog; earn 10 less XP from all sources.\n8: Traumatic block; reduce a skill of choice by -10.\n9: Tremors; reduce attack skills by -5.\n10: Cathartic breakthrough; immediately recover D4 Sanity and clear temporary madness.',
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 91
    },
    {
      id: 'kn-potion-aging',
      ruleset_id: 'ker-nethalas',
      category: 'equipment',
      title: 'Potion Identification & Potion Aging Table',
      trigger_when: 'Discovering an ancient potion or consuming an unidentified concoction',
      procedure: '1. Identification: Unidentified potions require a Medicine check to recognize. Otherwise, player must drink blind to discover its nature.\n2. Potion Aging Table (1d20, rolled after identifying potion, p. 126):\n   1-2: Turned to poison! Pass Endurance check or become Poisoned (1).\n   3-4: Highly unstable; explodes on opening for 2D4 Force damage!\n   5-6: Completely inert; no effect.\n   7-10: Degraded; duration and efficacy halved (50%).\n   11-17: Works exactly as originally intended.\n   18-19: Refined by centuries; duration +50% and efficacy doubled!\n   20: Alchemical perfection; effects become PERMANENT!',
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 126
    },
    {
      id: 'kn-belt-quickslots',
      ruleset_id: 'ker-nethalas',
      category: 'equipment',
      title: 'Belt Quickslots & Belt Damage Checks',
      trigger_when: 'Equipping a belt, accessing items in combat, or suffering violent impact fumbles',
      procedure: '1. Quickslots: An equipped Belt provides 4 quickslots.\n2. Free Action: Drawing or consuming any item stored in a Belt Quickslot (potion, bandage, throwing blade, torch) is a Free Action in combat!\n3. Belt Check: Certain hazards, falls, or Fumble table results force a Belt Check. Roll 1d4: the item stored in that numbered belt slot is crushed or destroyed.',
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 212
    },
    {
      id: 'kn-damage-pool-weapon-speed',
      ruleset_id: 'ker-nethalas',
      category: 'combat',
      title: 'Reworked Combat: Damage Pool & Weapon Speed Deduction',
      trigger_when: 'Calculating attack chances, dealing damage with weapons or spells, or making unarmed strikes',
      procedure: '1. Damage Pool: The old damage dealt table is completely removed! All non-magical weapons deal 1d6 damage. When an attack hits, the attacker gathers all damage dice granted by weapon, Masteries, and situational bonuses into a Damage Pool and rolls them all together, CHOOSING A SINGLE RESULT to apply.\n2. Fixed Modifiers: Fixed numerical bonuses (+1, +2, etc.) are applied to the single chosen die.\n3. Weapon Speed: Every weapon has a Speed rating subtracted directly from the opponent\'s Combat Skill (effective opponent target = opponent Combat Skill - weapon speed).\n4. Unarmed Combat: Deals 1d4 Bludgeoning damage with NO starting skill bonus.\n5. Exhaustion Boost: After a successful melee attack hits, the player may spend 2 Exhaustion to deal +1 additional flat damage.',
      outcomes: {
        damage_applied: 'Only one chosen die from the Damage Pool is inflicted.',
        speed_deducted: 'Opponent combat skill lowered by weapon speed rating.'
      },
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 81
    },
    {
      id: 'kn-level-adaptation-stat-blocks',
      ruleset_id: 'ker-nethalas',
      category: 'combat',
      title: 'Creature Stat Blocks & Level Adaptation (⅃) Scaling',
      trigger_when: 'Preparing a combat encounter against any creature or boss',
      procedure: '1. Stat Block Categories: Body, Mind, Combat Skill, Endurance, Health, Hit Location (with Weak Spot), Level Adaptation, Magic Resistance, Number, Spoils, Traits, Type.\n2. Level Adaptation: Opponents scale directly with character level (⅃). When facing a combat encounter, apply all cumulative changes in the creature\'s Level Adaptation entry (e.g. +Health and +Combat Skill per level, plus new Traits gained at level 5 and level 10).\n3. Defense Tags: Physical actions require weapon skill or Dodge; Magical actions require a Spellward check.',
      outcomes: {
        scaled_opponent: 'Opponent HP and Combat Skill increased according to hero level ⅃.'
      },
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 131
    },
    {
      id: 'kn-creature-traits-bestiary',
      ruleset_id: 'ker-nethalas',
      category: 'combat',
      title: 'Creature Traits & Complete Bestiary Catalogue (pp. 131-203)',
      trigger_when: 'Resolving monster abilities, traits, surprise, or looking up encounters in the Necropolis',
      procedure: '1. Core Creature Traits:\n   - Alert: Cannot be surprised in any way.\n   - Frightening: Single Resolve check for group at combat start; failure inflicts 2 Sanity loss.\n   - Horrifying: Single Resolve check for group at combat start; failure inflicts 4 Sanity loss.\n   - Pack: +5 Combat Skill for each other similar pack creature alive in room.\n   - Penetrating (X): Attacks ignore X armor points.\n   - Ruthlessness (X): Acts X additional turns per round (Stunned condition removes actions).\n   - Savage: Cannot be parried; must use Dodge skill to avoid.\n   - Swift: Ignores all reaction negative modifiers.\n   - Venomous: Wounds force Endurance check or gain Poisoned (1).\n2. Bestiary Directory (pp. 136-203):\n   - Table A: Abyssal Vexator (136), Amalgam (137), Armor Construct (138), Astral Beast (139), Bladewings (140), Bloodstalker (141), Blightfang Rats (142), Bone Golem (143), Bone Spiders (144), Cavebound Leech (145), Corpse Ants (146), Death Sage (147), Desiccated Cryptguards (148), Dwerax (149), Fangvine (150), Flayed Knight (151), Flesh Eater (152), Fleshmelt Slime (153), Giant Spider (154), Hive Larvae (155), Hive Warrior (156), Hollow Shambler (157).\n   - Table B: Living Moss (158), Necropede (159), Netheriend (160), Plaguebringer (161), Pyreborn (162), Ratkin Marauders (163), Razorjaw (164), Reanimated Homunculus (165), Rotwalkers (166), Skeletal Horrors (167), Stone Warden (168), Swarmer (169), Tomb Crawler (170), Umbra Fiend (171), Unfettered Familiar (172), Vaelorian Magus (173), Vinekin (174), Voidweaver (175), Vorleg (176), Wraithskull (177), Wrath Elemental (178).\n   - Domain Overseers (pp. 179-199): Carnage Devourer (180), Dreadlord (182), Glacial Burrower (184), Gorehoof (186), Infernal Archon (188), Infernal Tormentor (190), Pyroclasmic Possessor (192), Veilshifter (194), Venomcloud Siren (196), Zephyrous Shadow (198).\n   - Mastery Minions (pp. 200-203): Arcane Companion (200), Fire Elemental (201), Frost Elemental (201), Skeleton (202), Wight (203).',
      outcomes: {
        trait_resolved: 'Special trait behavior applied accurately in combat.'
      },
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 132
    },
    {
      id: 'kn-hard-beginnings-first-domain',
      ruleset_id: 'ker-nethalas',
      category: 'exploration',
      title: 'Hard Beginnings & The First Domain (The Corpse Pits)',
      trigger_when: 'Starting a new campaign, awakening in the necropolis, or delving into Domain 1',
      procedure: '1. Core Concept: You play as a condemned, executed outcast who miraculously survives and awakens in rags among rotting corpses in the underground necropolis of Ker Nethalas.\n2. Hard Beginnings (p. 243): Awakening in dire circumstances inflicts starting disadvantages:\n   - D6 damage (depletes Toughness buffer first, then Health)\n   - D4 Sanity loss\n   - +1 Exhaustion\n3. The First Domain (The Corpse Pits, p. 243-244): Fixed starter dungeon map with unique Combat Encounters table. Tension Die checks made every room. All doors mapped. Explore thoroughly before facing Overseer.',
      outcomes: {
        hard_start_applied: 'Apply D6 damage, D4 Sanity loss, and +1 Exhaustion at turn 0.'
      },
      book_title: 'Ker Nethalas: Into the Midnight Throne',
      page_num: 243
    }
  ],
  'alien-rpg': [
    {
      id: 'alien-core-pool',
      ruleset_id: 'alien-rpg',
      category: 'core',
      title: 'D6 Dice Pool Resolution (Base & Stress Dice)',
      trigger_when: 'Whenever a character performs an action under pressure or tests a skill',
      procedure: '1. Assemble dice pool: Base Dice (Attribute + Skill) + Stress Dice (current Stress level).\n2. Roll all dice.\n3. Any 6 rolled is a SUCCESS. Multiple 6s generate Bonus Stunts.\n4. Panic Check: If ANY Stress Die rolls a 1 (Facehugger symbol), the character panics! Roll 1d6 + current Stress on the Panic Table immediately.',
      outcomes: {
        success: 'At least one 6 rolled: action succeeds.',
        failure: 'No 6s rolled: action fails or requires pushing the roll.',
        panic: 'A 1 rolled on a Stress Die: trigger immediate Panic Table check.'
      },
      book_title: 'Alien RPG Core Rulebook',
      page_num: 58
    },
    {
      id: 'alien-panic-table',
      ruleset_id: 'alien-rpg',
      category: 'table',
      title: 'Panic Roll & Breakdown Table',
      trigger_when: 'Triggered when a 1 is rolled on any Stress Die during a check',
      procedure: 'Roll 1d6 + current Stress score:\n1-6: Keeping it Together (Action succeeds, Stress +1).\n7: Nervous Twitch (All nearby characters gain +1 Stress).\n8: Tremble (Cannot run or use items for 1 round).\n9: Drop Item (Drop equipped weapon or item).\n10: Freeze (Frozen in terror for 1 round).\n11: Seek Cover (Must flee into closest hiding place).\n12: Scream (Scream loudly, alerting all hostiles in the sector).\n13+: Berserk / Catatonic (Attack closest organism or collapse into fetal position).',
      book_title: 'Alien RPG Core Rulebook',
      page_num: 62
    },
    {
      id: 'alien-xenomorph-attacks',
      ruleset_id: 'alien-rpg',
      category: 'combat',
      title: 'Xenomorph Signature Attacks & Acid Splash',
      trigger_when: 'When a Xenomorph or Neomorph attacks in close combat',
      procedure: '1. Xenomorphs do not make regular attack rolls; roll 1d6 on their specific Signature Attack Table (Tail Spike, Headbite, Pounce, Acid Spray).\n2. Acid Splash: When a Xenomorph takes physical damage from piercing or slashing attacks, anyone in close range must roll Mobility or take Acid damage.',
      book_title: 'Alien RPG Core Rulebook',
      page_num: 88
    },
    {
      id: 'alien-armor-criticals',
      ruleset_id: 'alien-rpg',
      category: 'combat',
      title: 'Armor Rating & Critical Injuries (D66)',
      trigger_when: 'When taking damage or when Health is reduced to 0 (Broken state)',
      procedure: '1. Armor rolls D6 pool equal to Armor Rating; each 6 rolled cancels 1 point of incoming damage.\n2. When reduced to 0 Health: The character is Broken. Roll D66 on the Critical Injury Table (from winded to severed limbs to fatal trauma).',
      book_title: 'Alien RPG Core Rulebook',
      page_num: 96
    }
  ],
  'ironsworn': [
    {
      id: 'ironsworn-action-roll',
      ruleset_id: 'ironsworn',
      category: 'core',
      title: 'Action Roll (1d6 Action Die + Stat vs 2d10 Challenge Dice)',
      trigger_when: 'Whenever an Ironsworn move calls for an Action Roll',
      procedure: '1. Roll 1d6 (Action Die) and add the relevant Stat (1-4) plus any adds. Max action score is 10.\n2. Roll 2d10 (Challenge Dice) separately.\n3. Compare Action Score against EACH Challenge Die.\n4. Strong Hit: Action Score beats BOTH Challenge Dice.\n5. Weak Hit: Action Score beats ONE Challenge Die.\n6. Miss: Action Score does not beat either Challenge Die.\n7. Match: If the two d10s roll the identical number, an unexpected twist occurs.',
      outcomes: {
        strong_hit: 'Complete success as described in the move; gain momentum.',
        weak_hit: 'Success with a cost, compromise, or complication.',
        miss: 'Failure; Pay the Price. The GM or fate inflicts harm, stress, or a setback.'
      },
      book_title: 'Ironsworn Core Rulebook',
      page_num: 8
    },
    {
      id: 'ironsworn-pay-the-price',
      ruleset_id: 'ironsworn',
      category: 'table',
      title: 'Pay the Price (Complications Table)',
      trigger_when: 'Triggered whenever an action roll results in a Miss',
      procedure: 'Roll 1d100 on Pay the Price:\n01-05: A person or community you care about is exposed to peril.\n06-15: You are separated from something or someone.\n16-25: Your action has an unintended effect.\n26-35: Something of value is lost or destroyed.\n36-45: The current situation worsens dramatically.\n46-55: A new danger or foe reveals itself.\n56-65: It causes immediate physical harm (Endure Harm).\n66-75: It causes immediate mental strain or terror (Endure Stress).\n76-85: It wastes resources (Sacrifice Resources).\n86-90: It forces a difficult choice.\n91-95: A sudden turn of events changes everything.\n96-100: Roll twice on this table and apply both.',
      book_title: 'Ironsworn Core Rulebook',
      page_num: 18
    }
  ],
  'across-a-thousand-dead-worlds': [
    {
      id: 'atdw-core-d20',
      ruleset_id: 'across-a-thousand-dead-worlds',
      category: 'core',
      title: 'D20 DC Target Resolution',
      trigger_when: 'Testing scavenger skills, maneuvering derelict ships, or firing weapons',
      procedure: '1. Roll 1d20 + relevant Attribute modifier against the target DC (typically DC 10-25).\n2. Equal to or higher than DC is a SUCCESS.\n3. Natural 20 is a Critical Triumph; Natural 1 is a Critical Mishap.\n4. Monitor Oxygen and Morale trackers after high-stress checks.',
      book_title: 'Across a Thousand Dead Worlds',
      page_num: 45
    },
    {
      id: 'atdw-oxygen-hazards',
      ruleset_id: 'across-a-thousand-dead-worlds',
      category: 'survival',
      title: 'Oxygen Depletion & Hull Breaches',
      trigger_when: 'Exploring unpressurized compartments, vacuum zones, or damaged bulkheads',
      procedure: '1. Each hour of exploration consumes 1 Oxygen point.\n2. In vacuum, suit puncture causes rapid decompression: must make DC 14 Scavenge check to patch or take 1d6 damage per turn.\n3. At 0 Oxygen: Suffocation begins; lose 1d4 Health each round until air restored.',
      book_title: 'Across a Thousand Dead Worlds',
      page_num: 68
    }
  ],
  'ironsworn-starforged': [
    {
      id: 'sf-core-action-roll',
      ruleset_id: 'ironsworn-starforged',
      category: 'core',
      title: 'Action Roll (1d6 Action Die + Stat vs 2d10 Challenge Dice)',
      trigger_when: 'Whenever making an active Move in Starforged',
      procedure: '1. Roll 1d6 Action Die and add the relevant Stat (1-4) plus any adds. Maximum Action Score is 10.\n2. Roll 2d10 Challenge Dice separately.\n3. Compare Action Score against EACH Challenge Die.\n4. Strong Hit: Beats BOTH challenge dice. Complete success.\n5. Weak Hit: Beats ONE challenge die. Success with cost/compromise.\n6. Miss: Beats NEITHER challenge die. Suffer a negative consequence (Pay the Price).\n7. Match on Challenge Dice: Triggers a narrative twist or dramatic revelation.',
      outcomes: {
        strong_hit: 'Action succeeds cleanly; gain momentum or achieve objective.',
        weak_hit: 'Action succeeds with compromise; burn resource or gain partial reward.',
        miss: 'Failure; Pay the Price. Suffer harm, stress, or crisis.'
      },
      book_title: 'Ironsworn: Starforged Core Rulebook',
      page_num: 32
    },
    {
      id: 'sf-trackers-momentum',
      ruleset_id: 'ironsworn-starforged',
      category: 'survival',
      title: 'Momentum, Resources & Starship Integrity',
      trigger_when: 'Managing sci-fi resources, suffering damage, or burning momentum',
      procedure: '1. Momentum (-6 to +10): When you have positive momentum, you can Burn Momentum to cancel challenge dice below your momentum score, turning a Miss or Weak Hit into a Strong Hit. Then reset momentum to +2.\n2. Health & Spirit (0-5): Physical resilience and emotional resolve.\n3. Supply (0-5): Rations, reactor fuel, spare parts, and ammunition.\n4. Starship Integrity (0-5): Hull plating and drive systems condition.',
      outcomes: {
        momentum_burned: 'Convert check into Strong Hit; reset momentum to +2.',
        supply_depleted: 'At 0 Supply: All moves suffer -1 penalty.',
        ship_damaged: 'Hull breaches require Withstand Damage and emergency repairs.'
      },
      book_title: 'Ironsworn: Starforged Core Rulebook',
      page_num: 48
    },
    {
      id: 'sf-pay-the-price',
      ruleset_id: 'ironsworn-starforged',
      category: 'table',
      title: 'Pay the Price (Sci-Fi Complications Table)',
      trigger_when: 'Whenever a Starforged move results in a Miss',
      procedure: 'Roll 1d100 on Pay the Price:\n01-05: A friendly contact or allied faction is exposed to peril.\n06-15: You are isolated or adrift in vacuum/derelict.\n16-25: Machine or reactor malfunction occurs.\n26-35: Precious cargo, gear, or data is destroyed.\n36-45: Hostile ship or predator detects your drive signature.\n46-55: Physical injury or suit leak (Endure Harm).\n56-65: Cosmic terror or crew stress (Endure Stress).\n66-75: Depletes fuel or reactor cells (Sacrifice Resources).\n76-85: Starship takes direct damage (Withstand Damage).\n86-95: A sudden spatial anomaly or pirate ambush intervenes.\n96-100: Roll twice and apply both catastrophic outcomes.',
      book_title: 'Ironsworn: Starforged Core Rulebook',
      page_num: 60
    }
  ],
  'barbarian-prince': {
    id: 'bp-combat-differential',
    ruleset_id: 'barbarian-prince',
    category: 'combat',
    title: '2d6 Combat Differential Resolution',
    trigger_when: 'Resolving melee combat between Prince Cal Arath and enemies',
    procedure: '1. Calculate Combat Rating difference: Attacker Combat minus Defender Combat.\n2. Find the differential column on the Combat Results Table (-4 or less to +4 or more).\n3. Roll 2d6 on the CRT to determine Wounds inflicted.\n4. Subtract Wounds directly from the target Endurance/HP.\n5. Prince or follower reaches 0 Endurance: character perishes.',
    outcomes: {
      wounds_dealt: 'Inflict rolled wounds against target endurance.',
      kill: 'Enemy defeated and cleared from hex.',
      retinue_loss: 'Hired followers slain; prince fights solo.'
    },
    book_title: 'Barbarian Prince Rules Book',
    page_num: 12
  },
  'barbarian-prince': [
    {
      id: 'bp-combat-differential',
      ruleset_id: 'barbarian-prince',
      category: 'combat',
      title: '2d6 Combat Differential Resolution',
      trigger_when: 'Resolving melee combat between Prince Cal Arath and enemies',
      procedure: '1. Calculate Combat Rating difference: Attacker Combat minus Defender Combat.\n2. Find the differential column on the Combat Results Table (-4 or less to +4 or more).\n3. Roll 2d6 on the CRT to determine Wounds inflicted.\n4. Subtract Wounds directly from target Endurance/HP.\n5. Reaching 0 Endurance: character perishes.',
      outcomes: {
        wounds_dealt: 'Inflict rolled wounds against target endurance.',
        kill: 'Enemy defeated; loot hex spoils.'
      },
      book_title: 'Barbarian Prince Rules Book',
      page_num: 12
    },
    {
      id: 'bp-hex-exploration',
      ruleset_id: 'barbarian-prince',
      category: 'exploration',
      title: 'Hex Movement, Food & Lost in the Wilds',
      trigger_when: 'Moving between wilderness hexes or taking a daily rest',
      procedure: '1. Moving into a new hex takes 1 full Day.\n2. Food Consumption: 1 Food ration is consumed every day. If Food reaches 0, suffer starvation (-2 to all Combat rolls).\n3. Lost Check: When entering swamps, forests, or mountains, roll 1d6 vs guide skill. On 1-2, the party is Lost and wanders into random adjacent hex.\n4. Foraging: Spend 1 day to roll 1d6 vs Wit to hunt/forage 1d3 food.',
      outcomes: {
        moved_safely: 'Enter destination hex; encounter check rolled.',
        lost: 'Wander off course; lose 1 day and food.',
        starving: 'Food 0: party suffers physical exhaustion and combat penalties.'
      },
      book_title: 'Barbarian Prince Rules Book',
      page_num: 16
    },
    {
      id: 'bp-victory-throne',
      ruleset_id: 'barbarian-prince',
      category: 'advancement',
      title: '70-Day Countdown & 500 GP True Heir Victory',
      trigger_when: 'Tracking campaign timeline or hiring northland armies',
      procedure: '1. Time Limit: You have exactly 70 Days to reclaim your throne before the usurper executes loyal nobles.\n2. Victory Condition: Raise 500 Gold Pieces (GP) from dungeons, ancient ruins, and noble gifts, then return to the Royal Capital to hire an army.\n3. Securing ancient heirlooms (Crown of the North, Banner of Arath) rallies free tribes without paying gold.',
      outcomes: {
        gold_gained: 'Advance Gold tracker toward 500 GP.',
        victory: 'Reclaim ancestral throne and banish usurper.',
        time_expired: '70 days elapse; usurper consolidates throne; campaign lost.'
      },
      book_title: 'Barbarian Prince Rules Book',
      page_num: 20
    }
  ],
  'last-days-zombie-apocalypse': [
    {
      id: 'ld-core-check',
      ruleset_id: 'last-days-zombie-apocalypse',
      category: 'core',
      title: '1d6 Target Resolution & Zombie Noise Tokens',
      trigger_when: 'Firing weapons, fighting in close quarters, or searching buildings',
      procedure: '1. Roll 1d6 + Skill modifier against target difficulty (typically 4-6).\n2. Roll >= Target is a SUCCESS. Natural 6 is a clean hit; Natural 1 is a jam or stumble.\n3. Noise Mechanics: Firing a firearm or forcing doors adds Noise Tokens to the scene.\n4. Every Noise Token rolled on 1d6 summons a wandering zombie directly toward the noise source.',
      outcomes: {
        success: 'Target struck or search succeeds.',
        noise_triggered: 'Gunfire alerts roaming undead; zombies spawn on perimeter.'
      },
      book_title: 'Last Days: Zombie Apocalypse Core Book',
      page_num: 24
    },
    {
      id: 'ld-scavenging-refuge',
      ruleset_id: 'last-days-zombie-apocalypse',
      category: 'survival',
      title: 'Scavenging Supplies & Refuge Defense',
      trigger_when: 'Searching abandoned stores, hospitals, or reinforcing Refuge',
      procedure: '1. Scavenge: Test Scavenge skill (1d6). Success yields 1d3 food, medical supplies, or ammo.\n2. Refuge Defense: Spend supplies to fortify Refuge Barricades (Defense 0-20).\n3. Night Raids: Each night, test Refuge Defense vs Wandering Horde attack.',
      outcomes: {
        supplies_found: 'Gain vital ammo, fuel, or antibiotics.',
        barricade_breached: 'Defense reaches 0; zombies penetrate survivor quarters.'
      },
      book_title: 'Last Days: Zombie Apocalypse Core Book',
      page_num: 38
    }
  ],
  'campfire-story': [
    {
      id: 'cs-core-pbta',
      ruleset_id: 'campfire-story',
      category: 'core',
      title: '2d6 PbtA Move Triad (10+ / 7-9 / 6-)',
      trigger_when: 'Telling a dark tale, listening into the woods, or confronting eerie lore',
      procedure: '1. Roll 2d6 + relevant Stat (Courage, Perception, Intuition, Sanity).\n2. 10+ Full Success: Reveal the mystery cleanly; the campfire burns bright.\n3. 7-9 Partial Success: Truth revealed, but Dread increases by +1 or embers dwindle.\n4. 6 or less Miss: Calamity strikes; nocturnal entity draws close; Dread +2.',
      outcomes: {
        full_success: 'Story advances without complication.',
        partial_success: 'Success with a chilling price or rising dread.',
        miss: 'Threat advances; something rustles in the dark.'
      },
      book_title: 'Campfire Story Rules',
      page_num: 6
    },
    {
      id: 'cs-embers-dread',
      ruleset_id: 'campfire-story',
      category: 'survival',
      title: 'Hearth Embers vs Rising Dread',
      trigger_when: 'Managing fire fuel or resisting nocturnal folk terror',
      procedure: '1. Hearth Embers (0-10): Fuel keeping the encroaching darkness away. Decreases by 1 each scene or failed check.\n2. If Embers reach 0: Fire dies out; pitch darkness envelopes the clearing.\n3. Dread (0-10): Psychological fear. When Dread reaches 10, the storyteller breaks into panic.',
      outcomes: {
        fire_stoked: 'Embers replenished; woods held at bay.',
        panic_breakdown: 'Dread maxed; survivor flees into cursed woods.'
      },
      book_title: 'Campfire Story Rules',
      page_num: 14
    }
  ],
  'doom-pilgrim': [
    {
      id: 'dp-fate-cards',
      ruleset_id: 'doom-pilgrim',
      category: 'core',
      title: 'Fate Card Draws & 1d6 Pilgrimage Trials',
      trigger_when: 'Advancing the pilgrimage or facing cursed sanctuaries',
      procedure: '1. Draw a Fate Card to determine the trial, omen, or demonic obstacle.\n2. Resolve the trial with a 1d6 check + relevant Stat (Might, Faith, Cunning).\n3. Rolling 4-6 is a TRIUMPH; rolling 1-3 is a DOOM AFFLICTION (Blood or Soul lost).\n4. Spend Fate Omen tokens to discard and redraw catastrophic cards.',
      outcomes: {
        trial_passed: 'Advance along the pilgrim trail; gain Divine Favor.',
        doom_affliction: 'Suffer bleeding wounds or creeping spiritual corruption.'
      },
      book_title: 'Doom Pilgrim Core Rules',
      page_num: 10
    },
    {
      id: 'dp-blood-soul-guilt',
      ruleset_id: 'doom-pilgrim',
      category: 'survival',
      title: 'Blood, Soul Purity & Guilt Burden',
      trigger_when: 'Suffering demonic attacks or seeking holy absolution',
      procedure: '1. Blood (0-14): Physical health. Reaching 0 means death on the stones.\n2. Soul (0-10): Purity. Reaching 0 turns the pilgrim into a howling fiend.\n3. Guilt (0-10): Sins committed on the road. High Guilt penalizes Faith checks.\n4. Penance: Spend a night in prayer to purge Guilt at cost of 1d4 Blood.',
      outcomes: {
        penance_paid: 'Purge Guilt; restore inner peace.',
        damned: 'Soul reaches 0; pilgrim falls to the Creeping Doom.'
      },
      book_title: 'Doom Pilgrim Core Rules',
      page_num: 22
    }
  ],
  'thousand-year-old-vampire': [
    {
      id: 'tyov-prompt-nav',
      ruleset_id: 'thousand-year-old-vampire',
      category: 'core',
      title: 'Chronological Prompt Navigation (1d10 - 1d6)',
      trigger_when: 'Stepping forward or backward through vampire diary prompts',
      procedure: '1. Roll 1d10 and 1d6. Subtract the d6 from the d10 (result ranges from -5 to +9).\n2. Move to current prompt number + the rolled result (if result is 0 or negative, you revisit past epochs).\n3. Read the prompt entry and record a new Experience.',
      outcomes: {
        forward: 'Advance centuries into the future; world transforms around you.',
        backward: 'Revisit a past location or consequence from centuries prior.'
      },
      book_title: 'Thousand Year Old Vampire',
      page_num: 8
    },
    {
      id: 'tyov-memory-strikes',
      ruleset_id: 'thousand-year-old-vampire',
      category: 'survival',
      title: '5 Memory Slots & Oblivion Strikes',
      trigger_when: 'Recording a new Experience when Memory slots are full',
      procedure: '1. You have exactly 5 Memory slots, each holding up to 3 Experiences.\n2. When all 5 slots are full and a new Experience must be recorded: You must strike out an entire existing Memory.\n3. Struck-out memories are permanently forgotten—mortal parents, first loves, human names fade forever into haze.\n4. You may transfer 1 Memory to a Diary to preserve it; but diaries can be stolen, burned, or rotted away.',
      outcomes: {
        experience_recorded: 'Document historical moment in journal.',
        oblivion_strike: 'Mortal past struck through; humanity erodes further.'
      },
      book_title: 'Thousand Year Old Vampire',
      page_num: 16
    }
  ],
  'thousand-year-old-campfire': [
    {
      id: 'tyoc-archaeology-strata',
      ruleset_id: 'thousand-year-old-campfire',
      category: 'core',
      title: 'Archaeological Strata Excavation (1d6 / 2d6)',
      trigger_when: 'Digging through soil horizons to uncover ancient hearths',
      procedure: '1. Roll 1d6 or 2d6 to determine depth excavated into the sediment.\n2. Cross-reference depth with archaeological soil horizons (Bronze Age, Neolithic, Paleolithic).\n3. Record relics discovered (flint scrapers, animal bone carvings, charcoal residues).',
      outcomes: {
        strata_uncovered: 'Excavate older layer; discover forgotten tribal artifacts.',
        deep_hearth: 'Uncover hearth charcoal from 10,000 years ago.'
      },
      book_title: 'Thousand Year Old Campfire Journal',
      page_num: 12
    }
  ]
};

// Initialize seed digest cards into SQLite using INSERT OR REPLACE
export function initRulesDigest() {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO dnd_rules_digest (id, ruleset_id, category, title, trigger_when, procedure, outcomes_json, table_data_json, book_title, page_num)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const [rulesetId, cards] of Object.entries(SEED_DIGESTS)) {
      for (const c of cards) {
        insert.run(
          c.id,
          rulesetId,
          c.category,
          c.title,
          c.trigger_when,
          c.procedure,
          JSON.stringify(c.outcomes || {}),
          c.table_data ? JSON.stringify(c.table_data) : null,
          c.book_title || 'Core Rules',
          c.page_num || 1
        );
      }
    }
  });

  try {
    tx();
  } catch (err) {
    console.warn('[RulesDigest] init error:', err.message);
  }
}

// Retrieve the game system configuration (rules, tone, sensory palette, lexicon, pacing)
export function getGameSystemConfig(rulesetId) {
  const normalizedId = String(rulesetId || '').toLowerCase();
  for (const [key, cfg] of Object.entries(GAME_SYSTEM_CONFIGS)) {
    if (normalizedId === key || normalizedId.includes(key) || key.includes(normalizedId)) {
      return cfg;
    }
  }
  return null;
}

// Retrieve all digest cards for a ruleset (cached in memory for 0ms lookup)
export function getRulesDigest(rulesetId) {
  const normalizedId = String(rulesetId || '').toLowerCase();
  // Match by exact key or substring (e.g. 'ker-nethalas' matches 'ker-nethalas-solo')
  let matchedKey = normalizedId;
  for (const k of Object.keys(SEED_DIGESTS)) {
    if (normalizedId === k || normalizedId.includes(k) || k.includes(normalizedId)) {
      matchedKey = k;
      break;
    }
  }

  if (digestCache.has(matchedKey)) {
    return digestCache.get(matchedKey);
  }

  const rows = db.prepare(`
    SELECT id, ruleset_id, category, title, trigger_when, procedure, outcomes_json, table_data_json, book_title, page_num
    FROM dnd_rules_digest
    WHERE ruleset_id = ? OR ruleset_id = ?
    ORDER BY category, page_num
  `).all(matchedKey, rulesetId);

  const parsed = rows.map((r) => {
    let outcomes = {}, tableData = null;
    try { outcomes = JSON.parse(r.outcomes_json || '{}'); } catch { /* ignore */ }
    try { tableData = r.table_data_json ? JSON.parse(r.table_data_json) : null; } catch { /* ignore */ }
    return {
      id: r.id,
      category: r.category,
      title: r.title,
      trigger_when: r.trigger_when,
      procedure: r.procedure,
      outcomes,
      table_data: tableData,
      book_title: r.book_title,
      page_num: r.page_num,
    };
  });

  digestCache.set(matchedKey, parsed);
  return parsed;
}

// Select the most relevant 2-4 authoritative cards for the current game moment in 0ms
export function selectRulesForSituation(rulesetId, { playerAction = '', situation = '', check = null, inCombat = false }) {
  const cards = getRulesDigest(rulesetId);
  if (!cards.length) return [];

  const text = `${playerAction} ${situation} ${check?.label || ''} ${check?.why || ''}`.toLowerCase();
  const selected = [];

  // 1. Core resolution card is always included for baseline mechanics
  const coreCard = cards.find((c) => c.category === 'core');
  if (coreCard) selected.push(coreCard);

  // 2. Combat cards: included if combat keywords detected or explicitly in combat
  const isCombat = inCombat || /attack|strike|hit|shoot|blade|sword|dagger|cleaver|damage|wound|fight|kill|enemy|beast|crawler|monster|shield|parry|dodge|guard|initiative|round|opposed|sunder|armour|armor|breastplate|protection/.test(text);
  if (isCombat) {
    const oppCard = cards.find((c) => c.id === 'kn-opposed-combat-rolls' || c.id === 'kn-combat-sequence');
    if (oppCard && !selected.includes(oppCard)) selected.push(oppCard);
    const hitCard = cards.find((c) => c.id === 'kn-piecemeal-armour-protection' || c.id === 'kn-hit-locations-damage' || c.id === 'kn-armor-wounds');
    if (hitCard && !selected.includes(hitCard) && selected.length < 3) selected.push(hitCard);
    const defCard = cards.find((c) => c.id === 'kn-defensive-moves' || c.id === 'kn-initiative-action-economy' || c.id === 'kn-critical-mitigation');
    if (defCard && !selected.includes(defCard) && selected.length < 4) selected.push(defCard);
  }

  // 3. Aether / Supernatural Mastery cards
  const isMagic = /spell|cast|magic|aether|ether|mastery|incantation|arcane/.test(text);
  if (isMagic) {
    const magicCard = cards.find((c) => c.category === 'magic' || c.id.includes('aether'));
    if (magicCard && !selected.includes(magicCard) && selected.length < 4) selected.push(magicCard);
  }

  // 4. Survival / Camp / Rest / XP advancement
  const isRestOrAdvance = /rest|camp|sleep|heal|breather|bandage|rot|infection|exhaustion|advance|level|xp|experience|overseer|improve|doubles/.test(text);
  if (isRestOrAdvance) {
    const advCard = cards.find((c) => c.category === 'advancement' || c.id.includes('camp') || c.id.includes('toughness'));
    if (advCard && !selected.includes(advCard) && selected.length < 4) selected.push(advCard);
  }

  // 5. Exploration/Loot card: if exploring, searching, picking locks, or managing light
  const isExploration = /search|loot|scavenge|chest|corpse|debris|door|trap|passage|corridor|tunnel|rubble/.test(text);
  if (isExploration && selected.length < 4) {
    const exploreCard = cards.find((c) => c.category === 'exploration');
    if (exploreCard && !selected.includes(exploreCard)) selected.push(exploreCard);
  }

  // 5. Table card: if random tables or events apply
  const tableCard = cards.find((c) => c.category === 'table');
  if (tableCard && !selected.includes(tableCard) && (selected.length < 3 || /table|event|random|what happens|trigger/.test(text))) {
    selected.push(tableCard);
  }

  return selected.slice(0, 4);
}

// Format the selected rules cards and the rulebook tone/vocabulary directives into high-efficiency prompt blocks
export function formatRulesDigestForPrompt(cards, systemConfig = null) {
  const parts = [];

  // 1. Authoritative Rulebook Tone, Vocabulary & Pacing Directives
  if (systemConfig?.tone_and_atmosphere) {
    const t = systemConfig.tone_and_atmosphere;
    parts.push(`RULEBOOK TONE & NARRATIVE STYLE (${systemConfig.name}):
- Atmospheric Mood: ${t.mood}
- Prose Style: ${t.prose_style}
- Sensory Palette (Weave these in): ${t.sensory_palette.join('; ')}
- Authentic Lexicon (Use these exact rulebook terms): ${t.authentic_lexicon.join(', ')}
- Fluid Pacing: ${t.pacing_guidelines}`);
  }

  // 2. Authoritative Quick-Access Rules Cards
  if (cards.length) {
    parts.push(`AUTHORITATIVE RULES DIGEST (Follow these exact procedures from the rulebook in preference to general memory):\n` +
      cards.map((c, i) => `[Rule ${i + 1}: ${c.title} - ${c.book_title} p.${c.page_num}]
- When to Apply: ${c.trigger_when}
- Procedure: ${c.procedure}
${Object.keys(c.outcomes || {}).length ? `- Explicit Outcomes: ${Object.entries(c.outcomes).map(([k, v]) => `${k.toUpperCase()}: ${v}`).join('; ')}` : ''}`
      ).join('\n\n'));
  }

  return parts.join('\n\n');
}

// Invalidate in-memory cache when rules are re-compiled
export function invalidateDigestCache(rulesetId) {
  if (rulesetId) digestCache.delete(rulesetId);
  else digestCache.clear();
}

// Run initial seed insertion
initRulesDigest();
