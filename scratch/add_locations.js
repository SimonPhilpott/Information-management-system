import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Define the super regions structure (common to nodes and meshes)
const superRegions = [
  // EMEA
  { id: "reg_emea", type: "CONCEPT", title: "EMEA", parentId: "reg_root" },
  { id: "reg_uki", type: "CONCEPT", title: "UK & Ireland", parentId: "reg_emea" },
  { id: "reg_eur", type: "CONCEPT", title: "Europe", parentId: "reg_emea" },
  { id: "reg_me", type: "CONCEPT", title: "Middle East", parentId: "reg_emea" },
  { id: "reg_afr", type: "CONCEPT", title: "Africa", parentId: "reg_emea" },

  // Americas
  { id: "reg_americas", type: "CONCEPT", title: "Americas", parentId: "reg_root" },
  { id: "reg_la", type: "CONCEPT", title: "Latin America", parentId: "reg_americas" },
  { id: "reg_usa", type: "CONCEPT", title: "USA", parentId: "reg_americas" },
  { id: "reg_can_reg", type: "CONCEPT", title: "Canada", parentId: "reg_americas" },

  // APAC
  { id: "reg_apac", type: "CONCEPT", title: "APAC", parentId: "reg_root" },
  { id: "reg_n_asia", type: "CONCEPT", title: "North Asia", parentId: "reg_apac" },
  { id: "reg_s_asia", type: "CONCEPT", title: "South Asia", parentId: "reg_apac" },
  { id: "reg_anz", type: "CONCEPT", title: "Australia & New Zealand", parentId: "reg_apac" }
];

const newLocations = [
  // Asia - Pacific
  { id: "loc_idn", type: "VARIANT", title: "Indonesia", parentId: "reg_s_asia" },
  { id: "loc_jpn", type: "VARIANT", title: "Japan", parentId: "reg_n_asia" },
  { id: "loc_kor", type: "VARIANT", title: "Korea", parentId: "reg_n_asia" },
  { id: "loc_mys", type: "VARIANT", title: "Malaysia", parentId: "reg_s_asia" },
  { id: "loc_nzl", type: "VARIANT", title: "New Zealand", parentId: "reg_anz" },
  { id: "loc_phl", type: "VARIANT", title: "Philippines", parentId: "reg_s_asia" },
  { id: "loc_twn", type: "VARIANT", title: "Taiwan", parentId: "reg_n_asia" },
  { id: "loc_tha", type: "VARIANT", title: "Thailand", parentId: "reg_s_asia" },
  { id: "loc_vnm", type: "VARIANT", title: "Vietnam", parentId: "reg_s_asia" },

  // Europe
  { id: "loc_aut", type: "VARIANT", title: "Austria", parentId: "reg_eur" },
  { id: "loc_bel", type: "VARIANT", title: "Belgium", parentId: "reg_eur" },
  { id: "loc_bgr", type: "VARIANT", title: "Bulgaria", parentId: "reg_eur" },
  { id: "loc_hrv", type: "VARIANT", title: "Croatia", parentId: "reg_eur" },
  { id: "loc_cze", type: "VARIANT", title: "Czech Republic", parentId: "reg_eur" },
  { id: "loc_dnk", type: "VARIANT", title: "Denmark", parentId: "reg_eur" },
  { id: "loc_fin", type: "VARIANT", title: "Finland", parentId: "reg_eur" },
  { id: "loc_grc", type: "VARIANT", title: "Greece", parentId: "reg_eur" },
  { id: "loc_hun", type: "VARIANT", title: "Hungary", parentId: "reg_eur" },
  { id: "loc_ita", type: "VARIANT", title: "Italy", parentId: "reg_eur" },
  { id: "loc_lux", type: "VARIANT", title: "Luxembourg", parentId: "reg_eur" },
  { id: "loc_nor", type: "VARIANT", title: "Norway", parentId: "reg_eur" },
  { id: "loc_pol", type: "VARIANT", title: "Poland", parentId: "reg_eur" },
  { id: "loc_prt", type: "VARIANT", title: "Portugal", parentId: "reg_eur" },
  { id: "loc_rou", type: "VARIANT", title: "Romania", parentId: "reg_eur" },
  { id: "loc_srb", type: "VARIANT", title: "Serbia", parentId: "reg_eur" },
  { id: "loc_svk", type: "VARIANT", title: "Slovakia", parentId: "reg_eur" },
  { id: "loc_esp", type: "VARIANT", title: "Spain", parentId: "reg_eur" },
  { id: "loc_swe", type: "VARIANT", title: "Sweden", parentId: "reg_eur" },
  { id: "loc_che", type: "VARIANT", title: "Switzerland", parentId: "reg_eur" },
  { id: "loc_nld", type: "VARIANT", title: "The Netherlands", parentId: "reg_eur" },
  { id: "loc_tur", type: "VARIANT", title: "Türkiye", parentId: "reg_eur" },

  // Middle East
  { id: "loc_egy", type: "VARIANT", title: "Egypt", parentId: "reg_me" },
  { id: "loc_qat", type: "VARIANT", title: "Qatar", parentId: "reg_me" },

  // Latin America
  { id: "loc_chl", type: "VARIANT", title: "Chile", parentId: "reg_la" },
  { id: "loc_col", type: "VARIANT", title: "Colombia", parentId: "reg_la" },
  { id: "loc_per", type: "VARIANT", title: "Peru", parentId: "reg_la" },
  { id: "loc_ury", type: "VARIANT", title: "Uruguay", parentId: "reg_la" },

  // Africa
  { id: "loc_bwa", type: "VARIANT", title: "Botswana", parentId: "reg_afr" },
  { id: "loc_ken", type: "VARIANT", title: "Kenya", parentId: "reg_afr" },
  { id: "loc_moz", type: "VARIANT", title: "Mozambique", parentId: "reg_afr" },
  { id: "loc_nga", type: "VARIANT", title: "Nigeria", parentId: "reg_afr" },
  { id: "loc_rwa", type: "VARIANT", title: "Rwanda", parentId: "reg_afr" },
  { id: "loc_tza", type: "VARIANT", title: "Tanzania", parentId: "reg_afr" },
  { id: "loc_uga", type: "VARIANT", title: "Uganda", parentId: "reg_afr" },
  { id: "loc_zmb", type: "VARIANT", title: "Zambia", parentId: "reg_afr" },
  { id: "loc_zwe", type: "VARIANT", title: "Zimbabwe", parentId: "reg_afr" }
];

// Helper to update a nodes array by adding superRegions and newLocations, replacing old regional definitions
function rebuildNodesArray(existingNodes) {
  // Remove old regional definitions (reg_uki, reg_na, reg_eur)
  const filtered = existingNodes.filter(n => n.id !== 'reg_uki' && n.id !== 'reg_na' && n.id !== 'reg_eur');
  
  const result = [];
  filtered.forEach(item => {
    // Deep clone/copy to avoid modifying the original imported object reference
    result.push({ ...item });
  });
  
  // Add superRegions
  superRegions.forEach(sr => {
    if (!result.some(n => n.id === sr.id)) {
      result.push(sr);
    }
  });

  // Add newLocations
  newLocations.forEach(loc => {
    if (!result.some(n => n.id === loc.id)) {
      result.push(loc);
    }
  });

  // Re-parent shifted existing locations
  result.forEach(n => {
    if (n.id === 'loc_usa') n.parentId = 'reg_usa';
    if (n.id === 'loc_can') n.parentId = 'reg_can_reg';
    if (n.id === 'loc_mex') n.parentId = 'reg_la';
  });

  return result;
}

// 1. Update mesh_authority.json
const jsonPath = path.join(__dirname, '../src/data/mesh_authority.json');
if (fs.existsSync(jsonPath)) {
  const content = fs.readFileSync(jsonPath, 'utf8').replace(/\/\/.*$/gm, '');
  const existing = JSON.parse(content);
  const rebuilt = rebuildNodesArray(existing);
  fs.writeFileSync(jsonPath, JSON.stringify(rebuilt, null, 2), 'utf8');
  console.log('✅ Updated mesh_authority.json successfully.');
}

// 2. Update mesh_authority.js
const jsPath = path.join(__dirname, '../src/data/mesh_authority.js');
if (fs.existsSync(jsPath)) {
  const module = await import('../src/data/mesh_authority.js');
  const rebuilt = rebuildNodesArray(module.MESHES);
  const updatedJsContent = `export const MESHES = ${JSON.stringify(rebuilt, null, 2)};\n`;
  fs.writeFileSync(jsPath, updatedJsContent, 'utf8');
  console.log('✅ Updated mesh_authority.js successfully.');
}

// 3. Update nodes.js
const nodesPath = path.join(__dirname, '../src/data/nodes.js');
if (fs.existsSync(nodesPath)) {
  const module = await import('../src/data/nodes.js');
  const rebuilt = rebuildNodesArray(module.INITIAL_NODES);
  
  let content = fs.readFileSync(nodesPath, 'utf8');
  const startTag = 'export const INITIAL_NODES = [';
  const startIndex = content.indexOf(startTag);
  if (startIndex !== -1) {
    const header = content.slice(0, startIndex);
    const updatedContent = header + `export const INITIAL_NODES = ${JSON.stringify(rebuilt, null, 2)};\n`;
    fs.writeFileSync(nodesPath, updatedContent, 'utf8');
    console.log('✅ Updated src/data/nodes.js successfully.');
  }
}
