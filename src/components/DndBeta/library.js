// The games in the D&D folder, each dressed like its own rulebook (cover from public/kn/covers, made by
// scripts/extract_game_covers.py; a typeface close to its logo; its colours), and its books sorted by what they are.
// The files come from /api/dnd/beta/library (a listing only: nothing is indexed). `kind` per book:
// core, expansion (extends the game), setting (another setting or a related game on the same rules), campaign,
// supplement, reference (quick starts, player references), aid (sheets, cards, trackers), map, print.
export const KINDS = [
  ['core', 'Core rules', 'core'], ['expansion', 'Expansions', 'expansion'], ['setting', 'Settings & related games', 'setting'],
  ['campaign', 'Campaigns & adventures', 'campaign'], ['supplement', 'Supplements', 'supplement'], ['reference', 'References & quick starts', 'reference'],
  ['aid', 'Sheets, cards & play aids', 'aid'], ['map', 'Maps & tokens', 'map'], ['print', 'Print versions', 'print'],
];

// generic sorting when a game has no rule for a file
const GENERIC = [
  [/\.zip$|maps?\b|tokens?|battle ?maps?|grid/i, 'map'],
  [/sheet|roster|tracker|tracking|counters?|form\b|log ?sheet|tent|pre-?gens?|playbook|handout/i, 'aid'],
  [/quick ?start|quick ?reference|reference|overview|basic rules|srd|errata|cheat/i, 'reference'],
  [/print|duplex|single pages|tuckbox/i, 'print'],
];

export const GAMES = [
  { id: 'ker-nethalas', folder: 'Ker Nathalas', name: 'Ker Nethalas', sub: 'Into the Midnight Throne', genre: 'Solo necro-labyrinth dungeon crawl', font: "'Pirata One', serif", size: '2.3rem',
    bg: '#100b08', accent: '#a83a24', accent2: '#e9b86a', title: '#f6e7c8', beta: true,
    rules: [[/Into the Midnight Throne/i, 'core', 'Into the Midnight Throne (Gravebound)'], [/Quickstart/i, 'reference', 'Quickstart'], [/Processes/i, 'reference', 'Processes flowcharts (Jono)'], [/cards_print/i, 'aid', 'Room and encounter card deck'], [/CharSheet/i, 'aid', 'Character sheet']] },
  { id: 'ironsworn', folder: 'Ironsworn', name: 'Ironsworn', genre: 'Perilous quests in the Ironlands', font: "'Uncial Antiqua', serif", size: '2rem',
    bg: '#0d1012', accent: '#c97a2c', accent2: '#f1c27a', title: '#f4ede0', related: ['ironsworn-starforged'],
    rules: [[/^Ironsworn\.pdf$/i, 'core', 'Ironsworn'], [/Delve/i, 'expansion', 'Delve: perilous expeditions into the depths'], [/Lodestar/i, 'reference', 'Lodestar: a player\'s reference'], [/Starforged/i, 'setting', 'Starforged: the same oaths among the stars'], [/Character-Sheet/i, 'aid', 'Character sheet']] },
  { id: 'alien-rpg', folder: 'Alien RPG', name: 'ALIEN', sub: 'The Roleplaying Game', genre: 'Sci-fi survival horror', font: "'Michroma', sans-serif", size: '1.7rem', track: '.24em',
    bg: '#06090b', accent: '#5fa8a0', accent2: '#a8e0d4', title: '#e8f1f0',
    rules: [[/Building Better Worlds/i, 'expansion', 'Building Better Worlds'], [/Heart of Darkness/i, 'campaign', 'Heart of Darkness (cinematic scenario)']], note: 'The core rulebook is not in the folder.' },
  { id: 'across-a-thousand-dead-worlds', folder: 'Across a Thousand Dead Worlds', name: 'Across a Thousand Dead Worlds', genre: 'Solo deep-space salvage horror', font: "'Exo 2', sans-serif", size: '1.5rem',
    bg: '#0a0610', accent: '#d2385a', accent2: '#f39ab0', title: '#f4e9f4',
    rules: [[/Core Rulebook/i, 'core', 'Core Rulebook'], [/Play Sheets/i, 'aid', 'Play sheets'], [/Battle Maps/i, 'map', 'Battle maps']] },
  { id: 'barbarian-prince', folder: 'Barbarian Prince', name: 'Barbarian Prince', genre: 'Classic solo hex-crawl', font: "'MedievalSharp', serif", size: '1.9rem',
    bg: '#2a2112', accent: '#b38a3c', accent2: '#ecd090', title: '#f6ecd2',
    rules: [[/eventsbook/i, 'core', 'The Events Book'], [/map/i, 'map', 'The map of the Northlands'], [/tracker|items|counters|tracking|travel/i, 'aid', 'Tables, counters and trackers']] },
  { id: 'campfire-story', folder: 'CAMPFIRE STORY', name: 'Campfire Story', genre: 'Folk-horror storytelling', font: "'Amatic SC', cursive", size: '2.4rem',
    bg: '#14100c', accent: '#e27b2c', accent2: '#f7c48a', title: '#fbefdc', rules: [[/CAMPFIRE_STORY/i, 'core', 'Campfire Story']] },
  { id: 'doom-pilgrim', folder: 'Doom Pilgrim', name: 'Doom Pilgrim', genre: 'Grimdark solo pilgrimage with cards', font: "'Grenze Gotisch', serif", size: '2.2rem',
    bg: '#15131a', accent: '#8e8aa4', accent2: '#d9d4ea', title: '#f2f0f7',
    rules: [[/basic rules/i, 'core', 'Basic rules'], [/Alternative rules/i, 'expansion', 'Alternative rules'], [/Rules and Character Sheet Cards/i, 'reference', 'Rules cards'], [/character sheet/i, 'aid', 'Character sheets'], [/Duplex|Tuckbox/i, 'print', 'Print-and-play deck and tuckbox']] },
  { id: 'last-days-zombie-apocalypse', folder: 'Last Days Zombie Apocalypse', name: 'Last Days', sub: 'Zombie Apocalypse', genre: 'Survival-horror skirmish campaigns', font: "'Special Elite', monospace", size: '1.9rem',
    bg: '#1a0d0b', accent: '#c8372a', accent2: '#f0a08a', title: '#f7ece4',
    rules: [[/Seasons/i, 'expansion', 'Seasons'], [/Chaos Theory/i, 'supplement', 'Chaos Theory: random groups'], [/Quick Reference/i, 'reference', 'Quick reference'], [/Roster|Refuge Sheet/i, 'aid', 'Rosters and refuge sheets'], [/Apocalypse \(red\)/i, 'core', 'Last Days: Zombie Apocalypse']] },
  { id: 'thousand-year-old-vampire', folder: '', file: 'Thousand Year Old Vampire.pdf', name: 'Thousand Year Old Vampire', genre: 'A solo journaling game of loss', font: "'Pinyon Script', cursive", size: '2.1rem',
    bg: '#1b1410', accent: '#9e2b2b', accent2: '#e7b3a0', title: '#f7ede2', rules: [[/Thousand Year Old Vampire/i, 'core', 'Thousand Year Old Vampire']] },
  { id: 'thousand-year-old-campfire', folder: 'Thousand Year Old Campfire', name: 'Thousand Year Old Campfire', genre: 'A journaling game of deep time', font: "'Caveat', cursive", size: '2rem',
    bg: '#191410', accent: '#c08a4a', accent2: '#ecd0a2', title: '#f8efe2',
    rules: [[/Single Pages/i, 'print', 'Single-page print'], [/Play Sheet/i, 'aid', 'Play sheets'], [/Campfire\.pdf$/i, 'core', 'Thousand Year Old Campfire']] },
  { id: 'tales-from-the-loop', folder: 'Tales from the loop', name: 'Tales from the Loop', genre: 'Roleplaying in the \'80s that never was', font: "'Jost', sans-serif", size: '1.9rem', track: '.04em',
    bg: '#0f1a22', accent: '#e86a3c', accent2: '#f6c39a', title: '#f4f6f2', isNew: true,
    rules: [[/Rulebook/i, 'core', 'Rulebook'], [/Our Friends The Machines/i, 'campaign', 'Our Friends the Machines & Other Mysteries'], [/Out of Time/i, 'campaign', 'Out of Time'], [/Starter Set/i, 'reference', 'Starter Set rules'], [/Player Overview/i, 'reference', 'Player overview'], [/Playbooks/i, 'aid', 'Playbooks']] },
  { id: 'dnd-5e', folder: 'D&D 5E', name: 'Dungeons & Dragons', sub: '5th Edition', genre: 'The world\'s greatest roleplaying game', font: "'Cinzel Decorative', serif", size: '1.6rem',
    bg: '#1a0808', accent: '#d0282a', accent2: '#f4a08a', title: '#fbefe6', isNew: true,
    rules: [[/^Rulebooks\/Core\//i, 'core', null], [/^Rulebooks\/(Basic Rules|SRD|Errata)/i, 'reference', null], [/^Rulebooks\/Character Sheets|^Table name tents|pre-?gen|CharacterSheet|LogSheet|Character_Options|Backgrounds?/i, 'aid', 'Character sheets, pregens and table tents'],
      [/Unearthed Arcana/i, 'supplement', 'Unearthed Arcana'], [/^Rulebooks\/Supplements/i, 'supplement', null], [/Maps|Tokens|\.zip$/i, 'map', 'Maps and tokens'],
      [/^\d+ ([^/]+)\//, 'campaign', (m) => m[1]], [/^Epic\//i, 'campaign', 'Adventurers League epics']] },
  { id: 'warhammer-fantasy-roleplay', folder: 'Warhammer Fantasy Roleplay - Compilation v1', name: 'Warhammer', sub: 'Fantasy Roleplay', genre: 'A grim world of perilous adventure', font: "'UnifrakturMaguntia', serif", size: '2.1rem',
    bg: '#120e0a', accent: '#b8862c', accent2: '#ecc98a', title: '#f7ecd6', isNew: true,
    rules: [[/Rulebook/i, 'core', 'Rulebook (2nd edition, 2005)'], [/Enemy Within/i, 'campaign', 'The Enemy Within'], [/Scenario/i, 'campaign', 'The Olde Ball Game'], [/Organizations|Sigmar/i, 'supplement', null], [/Character Sheet/i, 'aid', 'Character sheet']] },
];

const clean = (name) => name.replace(/\.(pdf|zip|epub)$/i, '').replace(/[_+]/g, ' ').replace(/^.*?Warhammer Fantasy Roleplay - /i, '').replace(/^Osprey - LDZA - /i, '').replace(/\s+/g, ' ').trim();

// a game's books, grouped by kind and by title (a campaign of twelve modules counts once)
export function sortBooks(game, files) {
  const groups = {};
  for (const f of files) {
    let kind = null, title = null;
    for (const [re, k, t] of game.rules || []) { const m = f.rel.match(re); if (m) { kind = k; title = typeof t === 'function' ? t(m) : t; break; } }
    if (!kind) { const g = GENERIC.find(([re]) => re.test(f.rel)); kind = g ? g[1] : 'supplement'; }
    if (!title) title = clean(f.name);
    groups[kind] = groups[kind] || {};
    (groups[kind][title] = groups[kind][title] || []).push(f);
  }
  return groups;
}
export const FONT_LINK = 'https://fonts.googleapis.com/css2?family=Pirata+One&family=IM+Fell+English:ital@0;1&family=IM+Fell+English+SC&family=Cinzel:wght@500;600;700&family=Cinzel+Decorative:wght@700&family=Uncial+Antiqua&family=Michroma&family=Exo+2:wght@600;700&family=MedievalSharp&family=Amatic+SC:wght@700&family=Grenze+Gotisch:wght@600&family=Special+Elite&family=Jost:wght@500;600&family=Pinyon+Script&family=Caveat:wght@700&family=UnifrakturMaguntia&display=swap';
