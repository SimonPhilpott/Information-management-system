import { MESHES } from '../src/data/mesh_authority.js';
import { INITIAL_NODES } from '../src/data/nodes.js';
import fs from 'fs';

function validate(nodes, name) {
  console.log(`Validating ${name}...`);
  const ids = new Set();
  const errors = [];
  
  // Check uniqueness
  for (const node of nodes) {
    if (!node.id) {
      errors.push(`Node without ID found: ${JSON.stringify(node)}`);
      continue;
    }
    if (ids.has(node.id)) {
      errors.push(`Duplicate ID: ${node.id}`);
    }
    ids.add(node.id);
  }
  
  // Check parent validity and circular loops
  for (const node of nodes) {
    if (node.parentId) {
      if (!ids.has(node.parentId)) {
        errors.push(`Node ${node.id} has non-existent parentId: ${node.parentId}`);
      }
      
      // Circularity check
      let current = node;
      const path = new Set([node.id]);
      let circular = false;
      while (current.parentId) {
        if (path.has(current.parentId)) {
          circular = true;
          errors.push(`Circular dependency detected: ${Array.from(path).join(' -> ')} -> ${current.parentId}`);
          break;
        }
        path.add(current.parentId);
        const parent = nodes.find(n => n.id === current.parentId);
        if (!parent) break;
        current = parent;
      }
    }
  }

  if (errors.length > 0) {
    console.error(`❌ Validation failed for ${name} with ${errors.length} errors:`);
    errors.forEach(e => console.error('  -', e));
    return false;
  } else {
    console.log(`✅ ${name} is valid! (${nodes.length} nodes)`);
    return true;
  }
}

// Read JSON mesh authority
const jsonContent = fs.readFileSync('src/data/mesh_authority.json', 'utf8');
// Clean up any comments since JSON.parse doesn't support them
const cleanedJson = jsonContent.replace(/\/\/.*/g, '');
const meshesJson = JSON.parse(cleanedJson);

const ok1 = validate(INITIAL_NODES, 'src/data/nodes.js (INITIAL_NODES)');
const ok2 = validate(MESHES, 'src/data/mesh_authority.js (MESHES)');
const ok3 = validate(meshesJson, 'src/data/mesh_authority.json');

if (ok1 && ok2 && ok3) {
  process.exit(0);
} else {
  process.exit(1);
}
