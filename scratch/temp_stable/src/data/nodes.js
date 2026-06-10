import { Layout, Globe, Settings, Database, Activity, Target, Shield, Droplets, Truck, Zap, Building, GraduationCap, Microscope, ShoppingCart, Trophy, Cpu, Wind, Flame, ZapOff, HardHat, Briefcase, Heart, BookOpen } from 'lucide-react';

export const ENTITY_TYPES = {
  CONCEPT: { label: 'Concept', color: '#00f2ff', icon: Layout, prompt: 'e.g. Infrastructure Transformation Strategy', description: 'Core strategic ideas.' },
  DEFINITION: { label: 'Definition', color: '#00ff9d', icon: Database, prompt: 'e.g. Operational Readiness', description: 'Formal terminology.' },
  PROCEDURE: { label: 'Procedure', color: '#ffe600', icon: Settings, prompt: 'e.g. Risk Assessment', description: 'Step-by-step methods.' },
  PATTERN: { label: 'Pattern', color: '#ff007a', icon: Globe, prompt: 'e.g. Modular Delivery', description: 'Repeatable designs.' },
  SCENARIO: { label: 'Scenario', color: '#bd00ff', icon: Activity, prompt: 'e.g. Impact Scenario', description: 'Simulated outcomes.' },
  VARIANT: { label: 'Variant', color: '#ffffff', icon: Target, prompt: 'e.g. North American Standards', description: 'Regional adaptations.' }
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
  { id: 'tt_group', x: 2000, y: 2000, type: 'CONCEPT', title: 'Turner & Townsend Group Limited', content: { Summary: 'Global professional services firm specializing in programme, project and cost management.' } },

  // --- REGIONS (North) ---
  { id: 'reg_root', x: 2000, y: 1500, type: 'CONCEPT', title: 'Our Regions', parentId: 'tt_group' },
  { id: 'reg_uki', x: 1800, y: 1200, type: 'VARIANT', title: 'UK & Ireland', parentId: 'reg_root' },
  { id: 'reg_na', x: 1900, y: 1200, type: 'VARIANT', title: 'North America', parentId: 'reg_root' },
  { id: 'reg_eur', x: 2000, y: 1200, type: 'VARIANT', title: 'Europe', parentId: 'reg_root' },
  { id: 'reg_me', x: 2100, y: 1200, type: 'VARIANT', title: 'Middle East', parentId: 'reg_root' },
  { id: 'reg_afr', x: 2200, y: 1200, type: 'VARIANT', title: 'Africa', parentId: 'reg_root' },
  { id: 'reg_asa', x: 2300, y: 1200, type: 'VARIANT', title: 'Asia', parentId: 'reg_root' },
  { id: 'reg_anz', x: 2400, y: 1200, type: 'VARIANT', title: 'Australia & New Zealand', parentId: 'reg_root' },
  { id: 'reg_lat', x: 2500, y: 1200, type: 'VARIANT', title: 'Latin America', parentId: 'reg_root' },

  // --- INFRASTRUCTURE (South-West) ---
  { id: 'seg_inf', x: 1500, y: 2600, type: 'CONCEPT', title: 'Infrastructure', parentId: 'tt_group' },
  // Defence
  { id: 'inf_def', x: 1200, y: 2800, type: 'PATTERN', title: 'Defence', parentId: 'seg_inf' },
  { id: 'inf_def_strat', x: 1000, y: 3000, type: 'PROCEDURE', title: 'Defence Strategy', parentId: 'inf_def' },
  { id: 'inf_def_deliv', x: 1100, y: 3000, type: 'PROCEDURE', title: 'Defence Delivery', parentId: 'inf_def' },
  { id: 'inf_def_mod', x: 1200, y: 3000, type: 'PROCEDURE', title: 'MOD Operations', parentId: 'inf_def' },
  // Environment
  { id: 'inf_env', x: 1400, y: 2800, type: 'PATTERN', title: 'Environment', parentId: 'seg_inf' },
  { id: 'inf_env_water', x: 1400, y: 3000, type: 'PROCEDURE', title: 'Water Management', parentId: 'inf_env' },
  { id: 'inf_env_waste', x: 1500, y: 3000, type: 'PROCEDURE', title: 'Waste & Circularity', parentId: 'inf_env' },
  { id: 'inf_env_decarb', x: 1600, y: 3000, type: 'PROCEDURE', title: 'Net Zero Carbon', parentId: 'inf_env' },
  // Transport
  { id: 'inf_tra', x: 1600, y: 2800, type: 'PATTERN', title: 'Transport', parentId: 'seg_inf' },
  { id: 'inf_tra_rail', x: 1700, y: 3000, type: 'PROCEDURE', title: 'Rail Networks', parentId: 'inf_tra' },
  { id: 'inf_tra_avi', x: 1800, y: 3000, type: 'PROCEDURE', title: 'Aviation', parentId: 'inf_tra' },
  { id: 'inf_tra_high', x: 1900, y: 3000, type: 'PROCEDURE', title: 'Highways & Road', parentId: 'inf_tra' },
  // Power
  { id: 'inf_pow', x: 1800, y: 2800, type: 'PATTERN', title: 'Power & Utilities', parentId: 'seg_inf' },
  { id: 'inf_pow_nuc', x: 2000, y: 3000, type: 'PROCEDURE', title: 'Nuclear', parentId: 'inf_pow' },
  { id: 'inf_pow_ren', x: 2100, y: 3000, type: 'PROCEDURE', title: 'Renewables', parentId: 'inf_pow' },

  // --- REAL ESTATE (South-East) ---
  { id: 'seg_re', x: 2500, y: 2600, type: 'CONCEPT', title: 'Real Estate', parentId: 'tt_group' },
  // Commercial
  { id: 're_com', x: 2700, y: 2800, type: 'PATTERN', title: 'Commercial', parentId: 'seg_re' },
  { id: 're_com_off', x: 2700, y: 3000, type: 'PROCEDURE', title: 'Office Space', parentId: 're_com' },
  { id: 're_com_ret', x: 2800, y: 3000, type: 'PROCEDURE', title: 'Retail & Leisure', parentId: 're_com' },
  // Public
  { id: 're_pub', x: 2900, y: 2800, type: 'PATTERN', title: 'Public Sector', parentId: 'seg_re' },
  { id: 're_pub_edu', x: 2900, y: 3000, type: 'PROCEDURE', title: 'Education', parentId: 're_pub' },
  { id: 're_pub_hea', x: 3000, y: 3000, type: 'PROCEDURE', title: 'Healthcare', parentId: 're_pub' },
  // Life Sciences
  { id: 're_ls', x: 3100, y: 2800, type: 'PATTERN', title: 'Life Sciences', parentId: 'seg_re' },
  { id: 're_ls_lab', x: 3100, y: 3000, type: 'PROCEDURE', title: 'Laboratory Design', parentId: 're_ls' },
  // Hi-Tech
  { id: 're_ht', x: 3300, y: 2800, type: 'PATTERN', title: 'Hi-Tech', parentId: 'seg_re' },
  { id: 're_ht_dc', x: 3300, y: 3000, type: 'PROCEDURE', title: 'Data Centres', parentId: 're_ht' },

  // --- CAPABILITIES (East) ---
  { id: 'cap_root', x: 2600, y: 2000, type: 'CONCEPT', title: 'Our Capabilities', parentId: 'tt_group' },
  { id: 'srv_pm', x: 3000, y: 1600, type: 'PROCEDURE', title: 'Project Management', parentId: 'cap_root' },
  { id: 'srv_ccm', x: 3000, y: 1750, type: 'PROCEDURE', title: 'Cost & Commercial Management', parentId: 'cap_root' },
  { id: 'srv_pa', x: 3000, y: 1900, type: 'PROCEDURE', title: 'Programme Advisory', parentId: 'cap_root' },
  { id: 'srv_psc', x: 3000, y: 2050, type: 'PROCEDURE', title: 'Procurement & Supply Chain', parentId: 'cap_root' },
  { id: 'srv_dig', x: 3000, y: 2200, type: 'PROCEDURE', title: 'Digital Performance', parentId: 'cap_root' },
  { id: 'srv_sus', x: 3000, y: 2350, type: 'PROCEDURE', title: 'Sustainability', parentId: 'cap_root' },
  { id: 'srv_am', x: 3000, y: 2500, type: 'PROCEDURE', title: 'Asset Management', parentId: 'cap_root' },

  // --- OUR BUSINESS (West) ---
  { id: 'bus_root', x: 1400, y: 2000, type: 'CONCEPT', title: 'Our Business', parentId: 'tt_group' },
  { id: 'bus_win', x: 1000, y: 1800, type: 'PROCEDURE', title: 'Winning New Work', parentId: 'bus_root' },
  { id: 'bus_shq', x: 1000, y: 2000, type: 'PROCEDURE', title: 'Health, Safety & Quality', parentId: 'bus_root' },
  { id: 'bus_per', x: 1000, y: 2200, type: 'PROCEDURE', title: 'People & Culture', parentId: 'bus_root' },
  { id: 'bus_fin', x: 1000, y: 2400, type: 'PROCEDURE', title: 'Finance & Legal', parentId: 'bus_root' }
];
