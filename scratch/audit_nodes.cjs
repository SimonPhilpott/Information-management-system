/**
 * audit_nodes.cjs
 * Produces a structured node type audit across all three data files.
 */
const fs = require('fs');
const path = require('path');

// ─── Type definitions (mirroring nodes.js) ───────────────────────────────────
const TYPE_RULES = {
  // ROOT-LEVEL ORGANISATION
  CONCEPT:   'Broad services, capabilities, categories — the WHAT. Strategic parents.',
  PATTERN:   'Repeatable delivery models, sector frameworks, operating archetypes.',
  PROCEDURE: 'Step-by-step workflows, chronological methods, deliverable chains.',
  VARIANT:   'Regional/legal/client overrides, local exceptions, contextual deviations.',
  SCENARIO:  'Episodic case studies, stress tests, risk-event mitigation plans.',
  RULE:      'Strict inviolable constraints — regulatory, contractual, safety hard-limits.',
};

// ─── Semantic audit function ──────────────────────────────────────────────────
const audit = (node) => {
  const id    = node.id   || '';
  const title = node.title || '';
  const curr  = node.type  || 'CONCEPT';
  const pid   = node.parentId || '';

  // REGION / LOCATION nodes
  if (id.startsWith('reg_') || id.startsWith('loc_')) {
    // Super-regions and regions are structural groupings → CONCEPT
    if (id.startsWith('reg_'))   return { proposed: 'CONCEPT',   reason: 'Structural geographic grouping — the WHAT of regional coverage.' };
    // Country offices are contextual overrides / localisations → VARIANT
    if (id.startsWith('loc_'))   return { proposed: 'VARIANT',   reason: 'Contextual country-level office node — geographic override of standards.' };
  }

  // BOK (Body of Knowledge) nodes
  if (id.startsWith('bok_')) {
    const t = title.toLowerCase();
    // If it's a delivery method, process or step sequence → PROCEDURE
    if (/programme delivery|project delivery|procurement lifecycle|cost reporting|stage [0-9]|planning|set.?up|delivery|commissioning|handover|execution/i.test(t))
      return { proposed: 'PROCEDURE', reason: 'Represents an execution method or step-sequence delivery process.' };
    // If it's a standard, regulation or compliance → RULE
    if (/regulation|standard|compliance|certification|requirement|governance|control|policy|mandate|limit|threshold|assurance|nec|jct|fidic|aia|pfi|ppp|iso [0-9]|bs [0-9]/i.test(t))
      return { proposed: 'RULE',      reason: 'Represents a binding standard, regulatory framework, or compliance constraint.' };
    // If it's a sector-specific delivery framework or template → PATTERN
    if (/framework|model|methodology|approach|guide|template|blueprint|archetype|strategy/i.test(t))
      return { proposed: 'PATTERN',   reason: 'Represents a reusable delivery archetype or sector template.' };
    // Net zero specific strategy/roadmap → PATTERN
    if (/net zero strategy|roadmap|capital planning|sustainable procurement|carbon accounting|esg reporting|maturity assessment/i.test(t))
      return { proposed: 'PATTERN',   reason: 'Structured strategic framework or reusable model for net zero delivery.' };
    // Net zero programme delivery → PROCEDURE
    if (/net zero programme delivery|net zero project diagnostic|net zero programme set.?up/i.test(t))
      return { proposed: 'PROCEDURE', reason: 'Operational programme delivery workflow.' };
    // Risk, contingency, inflation, disruption → SCENARIO
    if (/risk|contingency|inflation|disruption|scenario|stress|flex|force majeure|crisis/i.test(t))
      return { proposed: 'SCENARIO',  reason: 'Episodic risk/stress event requiring bespoke mitigation logic.' };
    // Everything else under bok_root is CONCEPT (high-level capability definition)
    return { proposed: 'CONCEPT', reason: 'High-level professional service capability — core WHAT definition.' };
  }

  // SERVICE nodes (srv_)
  if (id.startsWith('srv_')) {
    return { proposed: 'CONCEPT', reason: 'Top-level service capability — defines WHAT the firm offers.' };
  }

  // PATTERN / DELIVERY MODEL nodes (pat_)
  if (id.startsWith('pat_')) {
    return { proposed: 'PATTERN', reason: 'Sector-specific delivery model or operating archetype.' };
  }

  // PROCEDURE nodes (prc_)
  if (id.startsWith('prc_')) {
    return { proposed: 'PROCEDURE', reason: 'Step-by-step workflow or delivery procedure.' };
  }

  // VARIANT nodes (var_)
  if (id.startsWith('var_')) {
    return { proposed: 'VARIANT', reason: 'Legal/regulatory/regional override of standard methodology.' };
  }

  // SCENARIO nodes (scn_)
  if (id.startsWith('scn_')) {
    return { proposed: 'SCENARIO', reason: 'Risk event scenario or stress-test mitigation plan.' };
  }

  // UK/regional service variants (uki_, usa_, etc.)
  if (/^(uki|usa|can|eur|me|afr|apac|la|anz|asia)_/.test(id)) {
    // These are region-specific variants of service offerings → VARIANT
    return { proposed: 'VARIANT', reason: 'Regionalised service variant — contextual override of global standard.' };
  }

  // BUS root nodes
  if (id === 'bus_root' || id === 'tt_group' || id === 'cap_root' || id === 'seg_inf' || id === 'seg_re' || id === 'reg_root') {
    return { proposed: 'CONCEPT', reason: 'Root organisational entity — defines WHAT the node cluster represents.' };
  }

  // Return unchanged with reason
  return { proposed: curr, reason: 'Current type is semantically correct.' };
};

// ─── Load all nodes ───────────────────────────────────────────────────────────
const maPath = path.join(__dirname, '..', 'src', 'data', 'mesh_authority.js');
const maText = fs.readFileSync(maPath, 'utf8');
const maMatch = maText.match(/export const MESHES\s*=\s*(\[[\s\S]*?\]);/);
const allNodes = eval(maMatch[1]);

// ─── Run audit ────────────────────────────────────────────────────────────────
const results = allNodes.map(node => {
  const { proposed, reason } = audit(node);
  const changed = proposed !== node.type;
  return {
    id:       node.id,
    title:    node.title,
    current:  node.type || 'CONCEPT',
    proposed,
    changed,
    reason,
    parentId: node.parentId,
  };
});

const changes    = results.filter(r => r.changed);
const unchanged  = results.filter(r => !r.changed);

// ─── Output JSON for the report ───────────────────────────────────────────────
const output = {
  summary: {
    total:     results.length,
    changed:   changes.length,
    unchanged: unchanged.length,
    byProposedType: {},
    byCurrentType:  {},
  },
  changes,
  unchanged: unchanged.slice(0, 20), // limit for brevity
};

results.forEach(r => {
  output.summary.byProposedType[r.proposed] = (output.summary.byProposedType[r.proposed] || 0) + 1;
  output.summary.byCurrentType[r.current]   = (output.summary.byCurrentType[r.current]   || 0) + 1;
});

fs.writeFileSync(path.join(__dirname, 'audit_results.json'), JSON.stringify(output, null, 2));
console.log('Audit complete. Written to scratch/audit_results.json');
console.log('Total nodes:', results.length);
console.log('Changes proposed:', changes.length);
console.log('\nChanges by proposed type:', output.summary.byProposedType);
