/**
 * fix_regions.cjs
 * Fixes the region node hierarchy in mesh_authority.js and nodes.js.
 *
 * mesh_authority.js:
 *  - Re-parent reg_la -> reg_americas
 *  - Re-parent reg_afr -> reg_emea
 *  - Re-parent reg_me  -> reg_emea
 *  - Remove reg_asia (replaced by reg_n_asia / reg_s_asia)
 *  - Re-parent reg_anz -> reg_apac
 *  - Re-parent loc_china, loc_ind, loc_sin from reg_asia -> reg_n_asia / reg_s_asia
 *
 * nodes.js:
 *  - Replace old flat region block with full super-region tree
 */

const fs = require('fs');
const path = require('path');

// ─── 1. Fix mesh_authority.js ────────────────────────────────────────────────

const maPath = path.join(__dirname, '..', 'src', 'data', 'mesh_authority.js');
let maText = fs.readFileSync(maPath, 'utf8');

// Re-parent reg_la  (Latin America → Americas)
maText = maText.replace(
  /"id": "reg_la",\s*"type": "CONCEPT",\s*"title": "Latin America",\s*"parentId": "reg_root"/,
  '"id": "reg_la",\n    "type": "CONCEPT",\n    "title": "Latin America",\n    "parentId": "reg_americas"'
);

// Re-parent reg_afr (Africa → EMEA)
maText = maText.replace(
  /"id": "reg_afr",\s*"type": "CONCEPT",\s*"title": "Africa",\s*"parentId": "reg_root"/,
  '"id": "reg_afr",\n    "type": "CONCEPT",\n    "title": "Africa",\n    "parentId": "reg_emea"'
);

// Re-parent reg_me  (Middle East → EMEA)
maText = maText.replace(
  /"id": "reg_me",\s*"type": "CONCEPT",\s*"title": "Middle East",\s*"parentId": "reg_root"/,
  '"id": "reg_me",\n    "type": "CONCEPT",\n    "title": "Middle East",\n    "parentId": "reg_emea"'
);

// Re-parent reg_anz (ANZ → APAC)
maText = maText.replace(
  /"id": "reg_anz",\s*"type": "CONCEPT",\s*"title": "Australia and New Zealand",\s*"parentId": "reg_root"/,
  '"id": "reg_anz",\n    "type": "CONCEPT",\n    "title": "Australia and New Zealand",\n    "parentId": "reg_apac"'
);

// Remove reg_asia entry (it is replaced by reg_n_asia / reg_s_asia)
// The entry looks like:  {\n    "id": "reg_asia", ... "parentId": "reg_root"\n  },
maText = maText.replace(
  /,?\s*\{\s*"id": "reg_asia",\s*"type": "CONCEPT",\s*"title": "Asia",\s*"parentId": "reg_root"\s*\}/,
  ''
);

// Fix loc_china → reg_n_asia  (Greater China is North Asia)
maText = maText.replace(
  /"id": "loc_china",\s*"type": "VARIANT",\s*"title": "Greater China",\s*"parentId": "reg_asia"/,
  '"id": "loc_china",\n    "type": "VARIANT",\n    "title": "Greater China",\n    "parentId": "reg_n_asia"'
);

// Fix loc_ind → reg_s_asia (India is South Asia)
maText = maText.replace(
  /"id": "loc_ind",\s*"type": "VARIANT",\s*"title": "India",\s*"parentId": "reg_asia"/,
  '"id": "loc_ind",\n    "type": "VARIANT",\n    "title": "India",\n    "parentId": "reg_s_asia"'
);

// Fix loc_sin → reg_s_asia (Singapore is South Asia)
maText = maText.replace(
  /"id": "loc_sin",\s*"type": "VARIANT",\s*"title": "Singapore",\s*"parentId": "reg_asia"/,
  '"id": "loc_sin",\n    "type": "VARIANT",\n    "title": "Singapore",\n    "parentId": "reg_s_asia"'
);

fs.writeFileSync(maPath, maText, 'utf8');
console.log('✅ mesh_authority.js — region parents fixed');

// ─── 2. Fix nodes.js ─────────────────────────────────────────────────────────

const nodesPath = path.join(__dirname, '..', 'src', 'data', 'nodes.js');
let nodesText = fs.readFileSync(nodesPath, 'utf8');

// Replace old flat region block with the full super-region tree.
// Old block (lines 143-147):
//   { id: 'reg_root', type: 'CONCEPT', title: 'Our Regions', parentId: 'tt_group' },
//   { id: 'reg_uki', type: 'VARIANT', title: 'UK & Ireland', parentId: 'reg_root' },
//   { id: 'reg_na', type: 'VARIANT', title: 'North America', parentId: 'reg_root' },
//   { id: 'reg_eur', type: 'VARIANT', title: 'Europe', parentId: 'reg_root' },

const oldBlock = `  // --- REGIONS (North) ---
  { id: 'reg_root', type: 'CONCEPT', title: 'Our Regions', parentId: 'tt_group' },
  { id: 'reg_uki', type: 'VARIANT', title: 'UK & Ireland', parentId: 'reg_root' },
  { id: 'reg_na', type: 'VARIANT', title: 'North America', parentId: 'reg_root' },
  { id: 'reg_eur', type: 'VARIANT', title: 'Europe', parentId: 'reg_root' },`;

const newBlock = `  // --- REGIONS ---
  { id: 'reg_root', type: 'CONCEPT', title: 'Our Regions', parentId: 'tt_group' },

  // EMEA Super-Region
  { id: 'reg_emea', type: 'CONCEPT', title: 'EMEA', parentId: 'reg_root' },
  { id: 'reg_uki', type: 'CONCEPT', title: 'UK & Ireland', parentId: 'reg_emea' },
  { id: 'reg_eur', type: 'CONCEPT', title: 'Europe', parentId: 'reg_emea' },
  { id: 'reg_me', type: 'CONCEPT', title: 'Middle East', parentId: 'reg_emea' },
  { id: 'reg_afr', type: 'CONCEPT', title: 'Africa', parentId: 'reg_emea' },

  // Americas Super-Region
  { id: 'reg_americas', type: 'CONCEPT', title: 'Americas', parentId: 'reg_root' },
  { id: 'reg_usa', type: 'CONCEPT', title: 'USA', parentId: 'reg_americas' },
  { id: 'reg_can_reg', type: 'CONCEPT', title: 'Canada', parentId: 'reg_americas' },
  { id: 'reg_la', type: 'CONCEPT', title: 'Latin America', parentId: 'reg_americas' },

  // APAC Super-Region
  { id: 'reg_apac', type: 'CONCEPT', title: 'APAC', parentId: 'reg_root' },
  { id: 'reg_n_asia', type: 'CONCEPT', title: 'North Asia', parentId: 'reg_apac' },
  { id: 'reg_s_asia', type: 'CONCEPT', title: 'South Asia', parentId: 'reg_apac' },
  { id: 'reg_anz', type: 'CONCEPT', title: 'Australia & New Zealand', parentId: 'reg_apac' },`;

if (nodesText.includes(oldBlock)) {
  nodesText = nodesText.replace(oldBlock, newBlock);
  fs.writeFileSync(nodesPath, nodesText, 'utf8');
  console.log('✅ nodes.js — super-region structure inserted');
} else {
  console.error('❌ nodes.js — could not find old region block to replace');
  console.log('Looking for pattern...');
  const idx = nodesText.indexOf("// --- REGIONS (North) ---");
  if (idx !== -1) {
    console.log('Found region comment at index', idx);
    console.log('Context:', nodesText.substring(idx, idx + 400));
  }
}

// ─── 3. Validate ─────────────────────────────────────────────────────────────
console.log('\n--- Validation ---');

// Re-read and eval mesh_authority.js
const maFinal = fs.readFileSync(maPath, 'utf8');
const maMatch = maFinal.match(/export const MESHES\s*=\s*(\[[\s\S]*?\]);/);
if (maMatch) {
  try {
    const data = eval(maMatch[1]);
    const ids = data.map(n => n.id);
    const dups = ids.filter((id, i) => ids.indexOf(id) !== i);
    console.log(`mesh_authority.js: ${data.length} nodes, ${dups.length} duplicates`);
    if (dups.length) console.log('  Duplicates:', dups);

    // Check region parenting
    const checks = [
      { id: 'reg_la', expected: 'reg_americas' },
      { id: 'reg_afr', expected: 'reg_emea' },
      { id: 'reg_me', expected: 'reg_emea' },
      { id: 'reg_anz', expected: 'reg_apac' },
      { id: 'reg_emea', expected: 'reg_root' },
      { id: 'reg_americas', expected: 'reg_root' },
      { id: 'reg_apac', expected: 'reg_root' },
      { id: 'loc_china', expected: 'reg_n_asia' },
      { id: 'loc_ind', expected: 'reg_s_asia' },
      { id: 'loc_sin', expected: 'reg_s_asia' },
    ];

    for (const { id, expected } of checks) {
      const node = data.find(n => n.id === id);
      if (!node) { console.log(`  ❌ ${id} — NOT FOUND`); continue; }
      const ok = node.parentId === expected;
      console.log(`  ${ok ? '✅' : '❌'} ${id} → ${node.parentId} (expected: ${expected})`);
    }

    const hasRegAsia = data.some(n => n.id === 'reg_asia');
    console.log(`  ${hasRegAsia ? '❌ reg_asia still exists!' : '✅ reg_asia removed'}`);
  } catch (e) {
    console.error('  ❌ mesh_authority.js parse error:', e.message);
  }
}
