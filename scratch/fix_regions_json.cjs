/**
 * fix_regions_json.cjs
 * Fixes mesh_authority.json region hierarchy to match mesh_authority.js.
 */

const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '..', 'src', 'data', 'mesh_authority.json');
let data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// Remove obsolete nodes
const obsoleteIds = ['reg_ame', 'reg_asia'];
data = data.filter(n => !obsoleteIds.includes(n.id));

// Fix parentIds
const fixes = {
  'reg_me':  'reg_emea',
  'reg_anz': 'reg_apac',
  'reg_afr': 'reg_emea',
  'reg_la':  'reg_americas',
};

for (const node of data) {
  if (fixes[node.id]) {
    node.parentId = fixes[node.id];
  }
}

// Ensure EMEA, Americas, APAC super-region nodes exist (add if missing)
const ensureNode = (id, title, parentId) => {
  if (!data.find(n => n.id === id)) {
    data.splice(data.findIndex(n => n.id === 'reg_root') + 1, 0, {
      id, type: 'CONCEPT', title, parentId
    });
    console.log(`  ➕ Added ${id}`);
  }
};

ensureNode('reg_emea',     'EMEA',      'reg_root');
ensureNode('reg_americas', 'Americas',  'reg_root');
ensureNode('reg_apac',     'APAC',      'reg_root');
ensureNode('reg_uki',      'UK & Ireland', 'reg_emea');
ensureNode('reg_eur',      'Europe',    'reg_emea');
ensureNode('reg_usa',      'USA',       'reg_americas');
ensureNode('reg_can_reg',  'Canada',    'reg_americas');
ensureNode('reg_n_asia',   'North Asia','reg_apac');
ensureNode('reg_s_asia',   'South Asia','reg_apac');

// Write back
fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');
console.log(`✅ mesh_authority.json fixed: ${data.length} nodes`);

// Validate
const ids = data.map(n => n.id);
const dups = ids.filter((id, i) => ids.indexOf(id) !== i);
console.log(`  Duplicates: ${dups.length ? dups.join(', ') : 'none'}`);

const checks = [
  { id: 'reg_me',  expected: 'reg_emea' },
  { id: 'reg_afr', expected: 'reg_emea' },
  { id: 'reg_anz', expected: 'reg_apac' },
  { id: 'reg_la',  expected: 'reg_americas' },
  { id: 'reg_emea', expected: 'reg_root' },
  { id: 'reg_americas', expected: 'reg_root' },
  { id: 'reg_apac', expected: 'reg_root' },
];
for (const { id, expected } of checks) {
  const node = data.find(n => n.id === id);
  if (!node) { console.log(`  ❌ ${id} — NOT FOUND`); continue; }
  const ok = node.parentId === expected;
  console.log(`  ${ok ? '✅' : '❌'} ${id} → ${node.parentId}`);
}
