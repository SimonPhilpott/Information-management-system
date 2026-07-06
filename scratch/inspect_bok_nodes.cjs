const fs = require('fs');
const path = require('path');

const authorityFilePath = path.join(__dirname, '../src/data/mesh_authority.js');
const fileContent = fs.readFileSync(authorityFilePath, 'utf8');

const arrayStart = fileContent.indexOf('[');
const arrayEnd = fileContent.lastIndexOf(']');
const rawArray = fileContent.substring(arrayStart, arrayEnd + 1);

let nodes = [];
try {
  nodes = new Function(`return ${rawArray}`)();
} catch (e) {
  console.error('Failed to parse nodes', e);
  process.exit(1);
}

const boks = nodes.filter(n => n.id.startsWith('bok_'));
console.log('BOK Nodes found:', boks.length);
boks.forEach(b => {
  console.log(`- ${b.id}: "${b.title}"`);
});
