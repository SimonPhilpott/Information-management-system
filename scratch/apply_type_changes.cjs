/**
 * apply_type_changes.cjs
 * Applies the approved node type audit changes to mesh_authority.js and mesh_authority.json.
 *
 * Changes approved:
 *  - seg_re, seg_inf: PATTERN → CONCEPT
 *  - BOK nodes: various CONCEPT → PATTERN / PROCEDURE / RULE / SCENARIO
 */

const fs   = require('fs');
const path = require('path');

// ─── Approved change map ──────────────────────────────────────────────────────
const TYPE_CHANGES = {
  // Segment roots
  'seg_re':                                                    'CONCEPT',
  'seg_inf':                                                   'CONCEPT',

  // BOK → PATTERN (12)
  'bok_business_commercial_strategy':                          'PATTERN',
  'bok_business_review_framework':                             'PATTERN',
  'bok_procurement_and_contract_strategy':                     'PATTERN',
  'bok_quality_strategy_and_management':                       'PATTERN',
  'bok_safety_health_and_environmental_strategy_and_management': 'PATTERN',
  'bok_supply_chain_strategy':                                 'PATTERN',
  'bok_target_operating_model':                                'PATTERN',
  'bok_net_zero_strategy_and_roadmap':                         'PATTERN',
  'bok_carbon_accounting':                                     'PATTERN',
  'bok_net_zero_maturity_assessment':                          'PATTERN',
  'bok_disclosure_and_esg_reporting':                          'PATTERN',
  'bok_sustainable_procurement':                               'PATTERN',

  // BOK → PROCEDURE (9)
  'bok_cost_planning_and_engineering':                         'PROCEDURE',
  'bok_execution_planning':                                    'PROCEDURE',
  'bok_project_handover_and_close':                            'PROCEDURE',
  'bok_testing_and_commissioning':                             'PROCEDURE',
  'bok_programme_strategy_and_set_up':                         'PROCEDURE',
  'bok_net_zero_programme_set_up':                             'PROCEDURE',
  'bok_net_zero_capital_planning':                             'PROCEDURE',
  'bok_net_zero_programme_delivery':                           'PROCEDURE',
  'bok_net_zero_project_diagnostic':                           'PROCEDURE',

  // BOK → RULE (8)
  'bok_change_control':                                        'RULE',
  'bok_cost_auditing_and_assurance':                           'RULE',
  'bok_cost_control':                                          'RULE',
  'bok_governance_and_assurance':                              'RULE',
  'bok_performance_assurance':                                 'RULE',
  'bok_programme_assurance':                                   'RULE',
  'bok_requirements_management':                               'RULE',
  'bok_ppp':                                                   'RULE',

  // BOK → SCENARIO (2)
  'bok_risk_management':                                       'SCENARIO',
  'bok_fire_consultancy_and_fire_risk_assessment':             'SCENARIO',
};

console.log(`Applying ${Object.keys(TYPE_CHANGES).length} type changes...\n`);

// ─── 1. Update mesh_authority.js ──────────────────────────────────────────────
const maJsPath = path.join(__dirname, '..', 'src', 'data', 'mesh_authority.js');
let maJsText   = fs.readFileSync(maJsPath, 'utf8');

let jsChanges = 0;
for (const [id, newType] of Object.entries(TYPE_CHANGES)) {
  // Match the JSON-object entry in the JS file – handles both double-quote and unquoted styles.
  // Pattern: "id": "THE_ID",\n  "type": "OLD_TYPE"
  const pattern = new RegExp(
    `("id":\\s*"${id}",\\s*"type":\\s*)"([A-Z]+)"`,
    'g'
  );
  const before = maJsText;
  maJsText = maJsText.replace(pattern, (_, prefix, oldType) => {
    if (oldType !== newType) {
      console.log(`  [JS] ${id}: ${oldType} → ${newType}`);
      jsChanges++;
    }
    return `${prefix}"${newType}"`;
  });
  if (maJsText === before) {
    // Didn't match – try alternate form
    const alt = new RegExp(
      `(id:\\s*['"]${id}['"],\\s*type:\\s*)['"]([A-Z]+)['"]`,
      'g'
    );
    maJsText = maJsText.replace(alt, (_, prefix, oldType) => {
      if (oldType !== newType) {
        console.log(`  [JS-alt] ${id}: ${oldType} → ${newType}`);
        jsChanges++;
      }
      return `${prefix}'${newType}'`;
    });
  }
}

fs.writeFileSync(maJsPath, maJsText, 'utf8');
console.log(`\n✅ mesh_authority.js — ${jsChanges} types updated`);

// ─── 2. Update mesh_authority.json ───────────────────────────────────────────
const maJsonPath = path.join(__dirname, '..', 'src', 'data', 'mesh_authority.json');
const maJson     = JSON.parse(fs.readFileSync(maJsonPath, 'utf8'));

let jsonChanges = 0;
for (const node of maJson) {
  if (TYPE_CHANGES[node.id] && node.type !== TYPE_CHANGES[node.id]) {
    console.log(`  [JSON] ${node.id}: ${node.type} → ${TYPE_CHANGES[node.id]}`);
    node.type = TYPE_CHANGES[node.id];
    jsonChanges++;
  }
}

fs.writeFileSync(maJsonPath, JSON.stringify(maJson, null, 2), 'utf8');
console.log(`✅ mesh_authority.json — ${jsonChanges} types updated`);

// ─── 3. Validate ─────────────────────────────────────────────────────────────
console.log('\n--- Post-change Validation ---');

const maJsVal = fs.readFileSync(maJsPath, 'utf8');
const match   = maJsVal.match(/export const MESHES\s*=\s*(\[[\s\S]*?\]);/);
const data    = eval(match[1]);
const ids     = data.map(n => n.id);
const dups    = ids.filter((id, i) => ids.indexOf(id) !== i);
console.log(`mesh_authority.js: ${data.length} nodes, ${dups.length} duplicates`);

// Spot-check
const checks = Object.entries(TYPE_CHANGES).slice(0, 10);
for (const [id, expected] of checks) {
  const node = data.find(n => n.id === id);
  if (!node) { console.log(`  ❌ ${id} — NOT FOUND`); continue; }
  const ok = node.type === expected;
  console.log(`  ${ok ? '✅' : '❌'} ${id}: ${node.type} (expected: ${expected})`);
}

console.log('\nDone ✓');
