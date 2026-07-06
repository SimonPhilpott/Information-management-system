const fs = require('fs');
const path = require('path');

const authorityFilePath = path.join(__dirname, '../src/data/mesh_authority.js');
const authorityJsonFilePath = path.join(__dirname, '../src/data/mesh_authority.json');

const fileContent = fs.readFileSync(authorityFilePath, 'utf8');

// Parse nodes
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

// 1. Correct UK capability variants parenting structure
nodes = nodes.map(n => {
  if (n.id === 'uki_pm') {
    return { ...n, parentId: 'srv_pm', secondaryLinks: ['loc_uk'] };
  }
  if (n.id === 'uki_ccm') {
    return { ...n, parentId: 'srv_ccm', secondaryLinks: ['loc_uk'] };
  }
  if (n.id === 'uki_dig') {
    return { ...n, parentId: 'srv_dig', secondaryLinks: ['loc_uk'] };
  }
  return n;
});

// 2. Define RIBA nodes
const ribaNodes = [
  {
    "id": "pat_riba",
    "type": "PATTERN",
    "title": "RIBA",
    "parentId": "uki_pm"
  },
  {
    "id": "proc_riba_0",
    "type": "PROCEDURE",
    "title": "RIBA 0: Strategic Definition",
    "parentId": "pat_riba"
  },
  {
    "id": "proc_riba_1",
    "type": "PROCEDURE",
    "title": "RIBA 1: Preparation and briefing",
    "parentId": "pat_riba"
  },
  {
    "id": "proc_riba_2",
    "type": "PROCEDURE",
    "title": "RIBA 2: Concept design",
    "parentId": "pat_riba"
  },
  {
    "id": "proc_riba_3",
    "type": "PROCEDURE",
    "title": "RIBA 3: Spatial co-ordination",
    "parentId": "pat_riba"
  },
  {
    "id": "proc_riba_4",
    "type": "PROCEDURE",
    "title": "RIBA 4: Technical design",
    "parentId": "pat_riba"
  },
  {
    "id": "proc_riba_5",
    "type": "PROCEDURE",
    "title": "RIBA 5: Manufacturing and construction",
    "parentId": "pat_riba"
  },
  {
    "id": "proc_riba_6",
    "type": "PROCEDURE",
    "title": "RIBA 6: Handover",
    "parentId": "pat_riba"
  },
  {
    "id": "proc_riba_7",
    "type": "PROCEDURE",
    "title": "RIBA 7: Occupation",
    "parentId": "pat_riba"
  }
];

// 3. Define Internal process items and groups
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

const internalProcessNode = {
  id: "pat_int_proc",
  type: "PATTERN",
  title: "Internal process",
  parentId: "uki_pm"
};

const internalProcessNodes = [internalProcessNode];

// Intelligent matching function
const findBokNode = (title) => {
  const cleanTitle = title.toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9\s]/g, '');
  const words = cleanTitle.split(/\s+/).filter(w => w.length > 2);

  // First check: exact or very close BOK match
  let matched = nodes.find(n => {
    if (!n.id.startsWith('bok_')) return false;
    const t = n.title.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9\s]/g, '').trim();
    return t === cleanTitle;
  });
  if (matched) return matched;

  // Second check: check special mappings (e.g. BIM -> BIM and information management)
  if (cleanTitle === 'bim') {
    const bimNode = nodes.find(n => n.id === 'bok_bim_and_information_management');
    if (bimNode) return bimNode;
  }
  if (cleanTitle.includes('sustainability')) {
    const susNode = nodes.find(n => n.id === 'bok_sustainability_consulting');
    if (susNode) return susNode;
  }
  if (cleanTitle.includes('health') && cleanTitle.includes('safety')) {
    const hsNode = nodes.find(n => n.id === 'bok_cdm_principal_designer_and_construction_health_and_safety');
    if (hsNode) return hsNode;
  }
  if (cleanTitle.includes('handover') || cleanTitle.includes('close')) {
    const hoNode = nodes.find(n => n.id === 'bok_project_handover_and_close');
    if (hoNode) return hoNode;
  }
  if (cleanTitle.includes('readiness') || cleanTitle.includes('transition')) {
    const orNode = nodes.find(n => n.id === 'bok_operational_readiness_and_transition');
    if (orNode) return orNode;
  }

  // Third check: substring containing check (BOK node title contains the query title or vice versa)
  matched = nodes.find(n => {
    if (!n.id.startsWith('bok_')) return false;
    const t = n.title.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9\s]/g, '').trim();
    return t.includes(cleanTitle) || cleanTitle.includes(t);
  });
  if (matched) return matched;

  // Fourth check: word overlap (e.g., "Outline procurement and contract strategy" -> matches "procurement and contract strategy")
  matched = nodes.find(n => {
    if (!n.id.startsWith('bok_')) return false;
    const t = n.title.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9\s]/g, '').trim();
    // Count how many words overlap
    const tWords = t.split(/\s+/).filter(w => w.length > 2);
    const overlap = words.filter(w => tWords.includes(w)).length;
    return overlap >= 2 && overlap >= words.length - 1;
  });
  return matched;
};

// Process groups
groups.forEach(g => {
  const groupNode = {
    id: g.id,
    type: "PROCEDURE",
    title: g.title,
    parentId: "pat_int_proc",
    secondaryLinks: []
  };

  g.items.forEach(itemName => {
    const existingBok = findBokNode(itemName);
    if (existingBok) {
      console.log(`Matched item "${itemName}" to BOK node: ${existingBok.id} ("${existingBok.title}")`);
      if (!groupNode.secondaryLinks.includes(existingBok.id)) {
        groupNode.secondaryLinks.push(existingBok.id);
      }
    } else {
      // Create new procedure node
      const itemId = `proc_${g.id.replace('proc_', '')}_${itemName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
      if (!internalProcessNodes.some(n => n.id === itemId)) {
        console.log(`No BOK match found for "${itemName}". Creating procedure node: ${itemId}`);
        internalProcessNodes.push({
          id: itemId,
          type: "PROCEDURE",
          title: itemName,
          parentId: g.id
        });
      }
    }
  });

  if (groupNode.secondaryLinks.length === 0) {
    delete groupNode.secondaryLinks;
  }

  internalProcessNodes.push(groupNode);
});

// Insert RIBA and Internal process nodes right after uki_pm entry
const ukiPmIndex = nodes.findIndex(n => n.id === 'uki_pm');
if (ukiPmIndex === -1) {
  console.error('Could not find uki_pm insertion anchor');
  process.exit(1);
}

nodes.splice(ukiPmIndex + 1, 0, ...ribaNodes, ...internalProcessNodes);

// Write back to files
const newJsContent = `export const MESHES = ${JSON.stringify(nodes, null, 2)};\n`;
fs.writeFileSync(authorityFilePath, newJsContent, 'utf8');
fs.writeFileSync(authorityJsonFilePath, JSON.stringify(nodes, null, 2) + '\n', 'utf8');

console.log(`Successfully completed BOK-first replacement run.`);
