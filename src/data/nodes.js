export const ENTITY_TYPES = {
  CONCEPT: { label: 'Concept', color: '#00f2ff', prompt: 'e.g. Infrastructure Transformation Strategy' },
  DEFINITION: { label: 'Definition', color: '#00ff9d', prompt: 'e.g. Definition of "Operational Readiness"' },
  PROCEDURE: { label: 'Procedure', color: '#ffe600', prompt: 'e.g. Risk Assessment Procedure' },
  PATTERN: { label: 'Pattern', color: '#ff007a', prompt: 'e.g. Modular Delivery Pattern' },
  SCENARIO: { label: 'Scenario', color: '#bd00ff', prompt: 'e.g. Impact Scenario: Decarbonization' },
  VARIANT: { label: 'Variant', color: '#ffffff', prompt: 'e.g. Variant for North American Standards' }
};

export const SCHEMAS = {
  CONCEPT: [{ name: 'Summary' }, { name: 'Purpose' }, { name: 'Strategic Alignment' }],
  DEFINITION: [{ name: 'Core Definition' }, { name: 'Source' }, { name: 'Usage Terms' }],
  PROCEDURE: [{ name: 'Preconditions' }, { name: 'Step-by-Step' }, { name: 'Governance Checks' }],
  PATTERN: [{ name: 'Structural Logic' }, { name: 'Repeatability' }, { name: 'Reference Assets' }],
  SCENARIO: [{ name: 'Actors' }, { name: 'Variables' }, { name: 'Projected Outcome' }],
  VARIANT: [{ name: 'Regional Deviation' }, { name: 'Compliance Reason' }, { name: 'Local Adaptations' }]
};

export const INITIAL_NODES = [
  // --- ROOT ---
  { id: 'tt_group', x: 1000, y: 500, type: 'CONCEPT', title: 'Turner & Townsend Group Limited', content: { Summary: 'Global professional services firm specializing in programme, project and cost management.' } },

  // --- OUR REGIONS (Top Row) ---
  { id: 'reg_root', x: 1000, y: 150, type: 'CONCEPT', title: 'Our Regions', parentId: 'tt_group', content: { Summary: 'Global network of expertise across 60+ countries.' } },
  { id: 'reg_uk', x: 450, y: 50, type: 'VARIANT', title: 'UK (Global Hub)', parentId: 'reg_root' },
  { id: 'reg_na', x: 650, y: -50, type: 'VARIANT', title: 'North America', parentId: 'reg_root' },
  { id: 'reg_la', x: 800, y: -100, type: 'VARIANT', title: 'Latin America', parentId: 'reg_root' },
  { id: 'reg_eu', x: 1000, y: -120, type: 'VARIANT', title: 'Europe', parentId: 'reg_root' },
  { id: 'reg_me', x: 1200, y: -100, type: 'VARIANT', title: 'Middle East', parentId: 'reg_root' },
  { id: 'reg_ap', x: 1350, y: -50, type: 'VARIANT', title: 'Asia Pacific', parentId: 'reg_root' },
  { id: 'reg_anz', x: 1550, y: 50, type: 'VARIANT', title: 'ANZ', parentId: 'reg_root' },
  { id: 'reg_af', x: 1750, y: 150, type: 'VARIANT', title: 'Africa', parentId: 'reg_root' },

  // --- OUR SEGMENTS (Bottom Tier) ---
  { id: 'seg_inf', x: 400, y: 800, type: 'CONCEPT', title: 'Infrastructure (INF)', parentId: 'tt_group' },
  { id: 'seg_re', x: 1000, y: 1000, type: 'CONCEPT', title: 'Real Estate (RE)', parentId: 'tt_group' },
  { id: 'seg_enr', x: 1600, y: 800, type: 'CONCEPT', title: 'Natural Resources (ENR)', parentId: 'tt_group' },

  // --- INFRASTRUCTURE SECTORS ---
  { id: 'inf_def', x: 150, y: 750, type: 'PATTERN', title: 'Defence', parentId: 'seg_inf' },
  { id: 'inf_env', x: 200, y: 950, type: 'PATTERN', title: 'Environment', parentId: 'seg_inf' },
  { id: 'inf_trans', x: 350, y: 1050, type: 'PATTERN', title: 'Transport', parentId: 'seg_inf' },
  { id: 'inf_rail', x: 250, y: 1150, type: 'PATTERN', title: 'Rail Networks', parentId: 'inf_trans' },
  { id: 'inf_aviation', x: 450, y: 1150, type: 'PATTERN', title: 'Aviation', parentId: 'inf_trans' },
  { id: 'inf_util', x: 500, y: 950, type: 'PATTERN', title: 'Utilities', parentId: 'seg_inf' },
  
  // --- REAL ESTATE SECTORS ---
  { id: 're_dc', x: 700, y: 1150, type: 'PATTERN', title: 'Data Centres', parentId: 'seg_re' },
  { id: 're_edu', x: 850, y: 1250, type: 'PATTERN', title: 'Education', parentId: 'seg_re' },
  { id: 're_ls', x: 1000, y: 1300, type: 'PATTERN', title: 'Life Sciences', parentId: 'seg_re' },
  { id: 're_ret', x: 1150, y: 1250, type: 'PATTERN', title: 'Retail', parentId: 'seg_re' },
  { id: 're_slh', x: 1300, y: 1150, type: 'PATTERN', title: 'Sports, Leisure and Hospitality', parentId: 'seg_re' },
  { id: 're_tech', x: 1000, y: 1400, type: 'PATTERN', title: 'Tech Media and Telecoms', parentId: 'seg_re' },

  // --- NATURAL RESOURCES SECTORS ---
  { id: 'enr_clean', x: 1600, y: 1100, type: 'PATTERN', title: 'Clean Energy', parentId: 'seg_enr' },
  { id: 'enr_conv', x: 1800, y: 1000, type: 'PATTERN', title: 'Conventional & Low Carbon', parentId: 'seg_enr' },
  { id: 'enr_trans', x: 2000, y: 900, type: 'PATTERN', title: 'Electricity Transmission', parentId: 'seg_enr' },
  { id: 'enr_min', x: 2100, y: 750, type: 'PATTERN', title: 'Mining', parentId: 'seg_enr' },

  // --- OUR CAPABILITIES / SERVICES ---
  { id: 'cap_root', x: 2100, y: 400, type: 'CONCEPT', title: 'Our Capabilities', parentId: 'tt_group' },
  { id: 'srv_pm', x: 2400, y: 100, type: 'PROCEDURE', title: 'Project Management', parentId: 'cap_root' },
  { id: 'srv_ccm', x: 2400, y: 200, type: 'PROCEDURE', title: 'Cost and Commercial Management', parentId: 'cap_root' },
  { id: 'srv_pa', x: 2400, y: 300, type: 'PROCEDURE', title: 'Programme Advisory', parentId: 'cap_root' },
  { id: 'srv_proc', x: 2400, y: 400, type: 'PROCEDURE', title: 'Procurement and Supply Chain', parentId: 'cap_root' },
  { id: 'srv_digital', x: 2400, y: 500, type: 'PROCEDURE', title: 'Digital Performance', parentId: 'cap_root' },
  { id: 'srv_sust', x: 2400, y: 600, type: 'PROCEDURE', title: 'Sustainability', parentId: 'cap_root' },
  { id: 'srv_am', x: 2400, y: 700, type: 'PROCEDURE', title: 'Asset Management', parentId: 'cap_root' },

  // --- REGIONAL VARIANTS & CROSS-LINKS ---
  { id: 'pm_uk', x: 2800, y: 100, type: 'VARIANT', title: 'Project Management UK', parentId: 'srv_pm', secondaryLinks: ['reg_uk'] },
  { id: 'ccm_uk', x: 2800, y: 200, type: 'VARIANT', title: 'Cost & Commercial UK', parentId: 'srv_ccm', secondaryLinks: ['reg_uk'] },

  // --- OUR BUSINESS (Operations Backbone) ---
  { id: 'bus_root', x: 0, y: 500, type: 'CONCEPT', title: 'Our Business', parentId: 'tt_group' },
  { id: 'winning', x: -300, y: 300, type: 'PROCEDURE', title: 'Winning New Work', parentId: 'bus_root' },
  { id: 'safety', x: -300, y: 500, type: 'PROCEDURE', title: 'Health, Safety and Quality (SHQ)', parentId: 'bus_root' },
  { id: 'working', x: -300, y: 700, type: 'PROCEDURE', title: 'My Working Life', parentId: 'bus_root' }
];
