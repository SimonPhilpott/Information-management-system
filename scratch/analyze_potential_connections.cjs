const fs = require('fs');
const path = require('path');

// Read mesh_authority.js content
const authorityFilePath = path.join(__dirname, '../src/data/mesh_authority.js');
const fileContent = fs.readFileSync(authorityFilePath, 'utf8');

// Simple regex extraction of the array
const arrayStart = fileContent.indexOf('[');
const arrayEnd = fileContent.lastIndexOf(']');
const rawArray = fileContent.substring(arrayStart, arrayEnd + 1);

// Safely evaluate or parse the array
let nodes = [];
try {
  // Use Function constructor since it's a JS module export
  nodes = new Function(`return ${rawArray}`)();
} catch (e) {
  console.error('Failed to parse nodes array', e);
  process.exit(1);
}

// Find existing links
const nodeMap = new Map(nodes.map(n => [n.id, n]));

const areLinked = (n1, n2) => {
  if (n1.parentId === n2.id || n2.parentId === n1.id) return true;
  if (n1.secondaryLinks && n1.secondaryLinks.includes(n2.id)) return true;
  if (n2.secondaryLinks && n2.secondaryLinks.includes(n1.id)) return true;
  return false;
};

// Helper to extract keywords
const getKeywords = (title) => {
  return title.toLowerCase()
    .replace(/[&,]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !['and', 'our', 'the', 'for', 'with', 'new'].includes(w));
};

const recommendations = [];

for (let i = 0; i < nodes.length; i++) {
  const n1 = nodes[i];
  const n1Keywords = getKeywords(n1.title);
  
  for (let j = i + 1; j < nodes.length; j++) {
    const n2 = nodes[j];
    
    // Skip if already linked
    if (areLinked(n1, n2)) continue;
    
    let score = 0;
    const reasons = [];
    
    // Rule 1: Shared keywords
    const n2Keywords = getKeywords(n2.title);
    const sharedWords = n1Keywords.filter(w => n2Keywords.includes(w));
    if (sharedWords.length > 0) {
      score += sharedWords.length * 35;
      reasons.push(`Shared terminology: "${sharedWords.join(', ')}"`);
    }
    
    // Rule 2: Shared Parent (Siblings)
    if (n1.parentId && n1.parentId === n2.parentId) {
      score += 25;
      reasons.push('Sibling nodes under same parent category');
    }
    
    // Rule 3: Regional context linking variant to standard node or sibling variant
    const isN1Regional = n1.id.startsWith('uki_') || n1.id.includes('uk') || n1.title.toLowerCase().includes('uk');
    const isN2Regional = n2.id.startsWith('uki_') || n2.id.includes('uk') || n2.title.toLowerCase().includes('uk');
    
    // UK Capability Alignments
    if (isN1Regional && !isN2Regional) {
      const standardId = n1.parentId; // e.g. srv_pm
      if (standardId === n2.id || n2.parentId === standardId) {
        score += 30;
        reasons.push('UK Variant to standard Capability alignment');
      }
    } else if (isN2Regional && !isN1Regional) {
      const standardId = n2.parentId;
      if (standardId === n1.id || n1.parentId === standardId) {
        score += 30;
        reasons.push('Standard Capability to UK Variant alignment');
      }
    }
    
    // Rule 4: Type Cohesion (e.g. Concept and related Procedure or Procedure to Pattern)
    if (
      (n1.type === 'CONCEPT' && n2.type === 'PROCEDURE') ||
      (n1.type === 'PROCEDURE' && n2.type === 'CONCEPT') ||
      (n1.type === 'PROCEDURE' && n2.type === 'PATTERN') ||
      (n1.type === 'PATTERN' && n2.type === 'PROCEDURE')
    ) {
      score += 10;
      reasons.push(`Cross-tier connection (${n1.type} to ${n2.type})`);
    }
    
    if (score >= 25) {
      recommendations.push({
        nodeA: n1,
        nodeB: n2,
        score,
        reasons
      });
    }
  }
}

// Sort by score descending
recommendations.sort((a, b) => b.score - a.score);

// Output Markdown Report
let mdReport = `# Potential Connections Report\n\n`;
mdReport += `This report outlines all potential connections that could be established between existing nodes in the Knowledge Mesh database. Recommendations are graded based on terminology similarity, shared parent groupings, and regional/capability variant structures.\n\n`;

mdReport += `## Summary Statistics\n`;
mdReport += `- Total Nodes: **${nodes.length}**\n`;
mdReport += `- Suggested Potential Links: **${recommendations.length}**\n\n`;

mdReport += `## Top Recommended Connections\n\n`;
mdReport += `| Node A | Node B | Score | Relationship Reasoning |\n`;
mdReport += `| :--- | :--- | :---: | :--- |\n`;

recommendations.forEach(rec => {
  mdReport += `| **${rec.nodeA.title}** (${rec.nodeA.type}) | **${rec.nodeB.title}** (${rec.nodeB.type}) | \`${rec.score} pts\` | ${rec.reasons.join(', ')} |\n`;
});

fs.writeFileSync(path.join(__dirname, '../potential_connections_report.md'), mdReport);
console.log('Successfully generated potential_connections_report.md');
