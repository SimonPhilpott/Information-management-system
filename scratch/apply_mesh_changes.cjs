const fs = require('fs');
const path = require('path');

const authorityFilePath = path.join(__dirname, '../src/data/mesh_authority.js');
const authorityJsonFilePath = path.join(__dirname, '../src/data/mesh_authority.json');

const fileContent = fs.readFileSync(authorityFilePath, 'utf8');

// Parse existing nodes
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

// Function to find existing node by title (case-insensitive)
const findExistingNode = (title) => {
  const cleanTitle = title.toLowerCase().trim();
  // Check exact or very close matches
  return nodes.find(n => {
    const nodeTitle = n.title.toLowerCase().trim();
    if (nodeTitle === cleanTitle) return true;
    // Allow slight variations, e.g. "Procurement and contract strategy" matching "Outline procurement and contract strategy"
    if (nodeTitle.includes(cleanTitle) || cleanTitle.includes(nodeTitle)) {
      // Avoid false positives for very short words
      if (nodeTitle.length > 5 && cleanTitle.length > 5) return true;
    }
    return false;
  });
};

// Groups definition
const groups = [
  {
    id: "proc_prep",
    title: "1 Preparation",
    items: [
      "Project start-up",
      "Governance and assurance",
      "Outline procurement and contract strategy",
      "Business case development",
      "Options appraisal",
      "Baseline development",
      "Project brief development",
      "Appointment of consultants",
      "Schedule management",
      "Supply chain strategy",
      "Turnkey / principal delivery"
    ]
  },
  {
    id: "proc_design",
    title: "2 Design",
    items: [
      "Design management",
      "Full procurement strategy",
      "Full contract strategy",
      "Multi discipline team management",
      "Management of statutory consents"
    ]
  },
  {
    id: "proc_pre_contract",
    title: "3 Pre-contract",
    items: [
      "Procurement management",
      "Production information",
      "Contract negotiation and award"
    ]
  },
  {
    id: "proc_construction",
    title: "4 Construction",
    items: [
      "Contract administration",
      "Turnkey / PMC contracts",
      "Contract management",
      "Supply chain management",
      "Testing & commissioning",
      "Project handover & close"
    ]
  },
  {
    id: "proc_use",
    title: "5 Use",
    items: [
      "Operation readiness & transition",
      "Final report",
      "Final account closure",
      "Post project review",
      "Defects management",
      "Peer review"
    ]
  },
  {
    id: "proc_proj_act",
    title: "Project activities",
    items: [
      "Digital action plan",
      "Execution planning",
      "Schedule management",
      "Quality management",
      "Risk management",
      "Project health & safety",
      "Performance reporting",
      "Change control",
      "Project audit",
      "Sustainability",
      "Performance assurance",
      "Document and data management",
      "Lessons learnt",
      "Glossary",
      "BIM",
      "Stakeholder management",
      "Cost control"
    ]
  }
];

// 1. Create the base pattern node
const internalProcessNode = {
  id: "pat_int_proc",
  type: "PATTERN",
  title: "Internal process",
  parentId: "uki_pm"
};

const newNodes = [internalProcessNode];

// Process each group
groups.forEach(g => {
  const groupNode = {
    id: g.id,
    type: "PROCEDURE",
    title: g.title,
    parentId: "pat_int_proc",
    secondaryLinks: []
  };

  g.items.forEach(itemName => {
    const existing = findExistingNode(itemName);
    if (existing) {
      // Node exists, add as secondary link
      if (!groupNode.secondaryLinks.includes(existing.id)) {
        groupNode.secondaryLinks.push(existing.id);
      }
    } else {
      // Node does not exist, create child procedure
      const itemId = `proc_${g.id.replace('proc_', '')}_${itemName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
      // Double check that we don't duplicate newly created node IDs
      if (!newNodes.some(n => n.id === itemId)) {
        newNodes.push({
          id: itemId,
          type: "PROCEDURE",
          title: itemName,
          parentId: g.id
        });
      }
    }
  });

  // Only keep secondaryLinks array if it has elements
  if (groupNode.secondaryLinks.length === 0) {
    delete groupNode.secondaryLinks;
  }

  newNodes.push(groupNode);
});

// Find insertion index in original nodes array (right after RIBA node entries or uki_pm)
const ukiPmIndex = nodes.findIndex(n => n.id === 'proc_riba_7');
if (ukiPmIndex === -1) {
  console.error('Could not find proc_riba_7 insertion anchor node');
  process.exit(1);
}

// Insert new nodes
nodes.splice(ukiPmIndex + 1, 0, ...newNodes);

// Write back to mesh_authority.js
const newJsContent = `export const MESHES = ${JSON.stringify(nodes, null, 2)};\n`;
fs.writeFileSync(authorityFilePath, newJsContent, 'utf8');

// Write back to mesh_authority.json
fs.writeFileSync(authorityJsonFilePath, JSON.stringify(nodes, null, 2) + '\n', 'utf8');

console.log(`Successfully added "Internal process" and ${newNodes.length - 1} sub-items to database files.`);
