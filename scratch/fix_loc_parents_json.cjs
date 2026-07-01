/**
 * fix_loc_parents_json.cjs
 * Fixes dangling parentId references in mesh_authority.json after removing reg_ame / reg_asia.
 */

const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '..', 'src', 'data', 'mesh_authority.json');
let data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// Locations that were under reg_ame (old Americas) → move to reg_la (Latin America)
// Argentina and Brazil are Latin American countries
const ameToLa = ['loc_arg', 'loc_bra'];
for (const node of data) {
  if (ameToLa.includes(node.id)) {
    node.parentId = 'reg_la';
    console.log(`  Fixed ${node.id} → reg_la`);
  }
}

// Locations that were under reg_asia → re-assign correctly
// Greater China, Japan, Korea, Taiwan → reg_n_asia
// India, Singapore, Indonesia, Malaysia, Philippines, Thailand, Vietnam → reg_s_asia
const northAsia = ['loc_china', 'loc_jpn', 'loc_kor', 'loc_twn'];
const southAsia = ['loc_ind', 'loc_sin', 'loc_idn', 'loc_mys', 'loc_phl', 'loc_tha', 'loc_vnm'];

for (const node of data) {
  if (northAsia.includes(node.id) && node.parentId === 'reg_asia') {
    node.parentId = 'reg_n_asia';
    console.log(`  Fixed ${node.id} → reg_n_asia`);
  }
  if (southAsia.includes(node.id) && node.parentId === 'reg_asia') {
    node.parentId = 'reg_s_asia';
    console.log(`  Fixed ${node.id} → reg_s_asia`);
  }
}

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');
console.log(`✅ mesh_authority.json updated: ${data.length} nodes`);
