import { Layout, Globe, Settings, Database, Activity, Target, Shield, Droplets, Truck, Zap, Building, GraduationCap, Microscope, ShoppingCart, Trophy, Cpu, Wind, Flame, ZapOff, HardHat, Briefcase, Heart, BookOpen } from 'lucide-react';

export const ENTITY_TYPES = {
  CONCEPT: { 
    label: 'Concept', color: '#00f2ff', icon: Layout, 
    description: 'High-level strategic theme or functional bucket.',
    guidance: 'WHAT IT IS: A high-level strategic theme or guiding principle.\nROLE: Usually acts as a Parent Node or hub organizing sectors.',
    examples: 'EXAMPLE: Infrastructure Transformation or Digital Performance.'
  },
  DEFINITION: { 
    label: 'Definition', color: '#00ff9d', icon: Database, 
    description: 'Formal terminology and glossary items.',
    guidance: 'WHAT IT IS: A formal statement of meaning or technical term.\nROLE: Typically a Leaf Node specifying exact meaning.',
    examples: 'EXAMPLE: Scope 3 Emissions or Operational Readiness.'
  },
  PROCEDURE: { 
    label: 'Procedure', color: '#ffe600', icon: Settings, 
    description: 'Step-by-step methods and workflows.',
    guidance: 'WHAT IT IS: A step-by-step methodology or mandated workflow.\nROLE: Describes "How we do it" as part of a chain.',
    examples: 'EXAMPLE: Risk Mitigation Workflow or Tender Approval.'
  },
  PATTERN: { 
    label: 'Pattern', color: '#ff007a', icon: Globe, 
    description: 'Repeatable delivery models and archetypes.',
    guidance: 'WHAT IT IS: A repeatable delivery model or structural template.\nROLE: Reusable components that appear across multiple concepts.',
    examples: 'EXAMPLE: Hub-and-Spoke Delivery or Modular Construction.'
  },
  SCENARIO: { 
    label: 'Scenario', color: '#bd00ff', icon: Activity, 
    description: 'Hypothetical use-cases and stress tests.',
    guidance: 'WHAT IT IS: A hypothetical use-case or specific transactional event.\nROLE: Illustrative nodes used to validate patterns.',
    examples: 'EXAMPLE: Sudden Market Downturn response.'
  },
  VARIANT: { 
    label: 'Variant', color: '#ffffff', icon: Target, 
    description: 'Regional adaptations and deviations.',
    guidance: 'WHAT IT IS: A regional adaptation or local standard deviation.\nROLE: Secondary versions of existing nodes (e.g. UK vs US).',
    examples: 'EXAMPLE: UK HSE Standards vs OSHA Compliance.'
  }
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
  { id: 'reg_root', type: 'CONCEPT', title: 'Our Regions', parentId: 'tt_group' },
  { id: 'reg_uki', type: 'VARIANT', title: 'UK & Ireland', parentId: 'reg_root' },
  { id: 'reg_na', type: 'VARIANT', title: 'North America', parentId: 'reg_root' },
  { id: 'reg_eur', type: 'VARIANT', title: 'Europe', parentId: 'reg_root' },
  { id: 'reg_me', type: 'VARIANT', title: 'Middle East', parentId: 'reg_root' },
  { id: 'reg_afr', type: 'VARIANT', title: 'Africa', parentId: 'reg_root' },
  { id: 'reg_asa', type: 'VARIANT', title: 'Asia', parentId: 'reg_root' },
  { id: 'reg_anz', type: 'VARIANT', title: 'Australia & New Zealand', parentId: 'reg_root' },
  { id: 'reg_lat', type: 'VARIANT', title: 'Latin America', parentId: 'reg_root' },

  // --- INFRASTRUCTURE (South-West) ---
  { id: 'seg_inf', type: 'CONCEPT', title: 'Infrastructure', parentId: 'tt_group' },
  // Defence
  { id: 'inf_def', type: 'PATTERN', title: 'Defence', parentId: 'seg_inf' },
  { id: 'inf_def_strat', type: 'PROCEDURE', title: 'Defence Strategy', parentId: 'inf_def' },
  { id: 'inf_def_deliv', type: 'PROCEDURE', title: 'Defence Delivery', parentId: 'inf_def' },
  { id: 'inf_def_mod', type: 'PROCEDURE', title: 'MOD Operations', parentId: 'inf_def' },
  // Environment
  { id: 'inf_env', type: 'PATTERN', title: 'Environment', parentId: 'seg_inf' },
  { id: 'inf_env_water', type: 'PROCEDURE', title: 'Water Management', parentId: 'inf_env' },
  { id: 'inf_env_waste', type: 'PROCEDURE', title: 'Waste & Circularity', parentId: 'inf_env' },
  { id: 'inf_env_decarb', type: 'PROCEDURE', title: 'Net Zero Carbon', parentId: 'inf_env' },
  // Transport
  { id: 'inf_tra', type: 'PATTERN', title: 'Transport', parentId: 'seg_inf' },
  { id: 'inf_tra_rail', type: 'PROCEDURE', title: 'Rail Networks', parentId: 'inf_tra' },
  { id: 'inf_tra_avi', type: 'PROCEDURE', title: 'Aviation', parentId: 'inf_tra' },
  { id: 'inf_tra_high', type: 'PROCEDURE', title: 'Highways & Road', parentId: 'inf_tra' },
  // Power
  { id: 'inf_pow', type: 'PATTERN', title: 'Power & Utilities', parentId: 'seg_inf' },
  { id: 'inf_pow_nuc', type: 'PROCEDURE', title: 'Nuclear', parentId: 'inf_pow' },
  { id: 'inf_pow_ren', type: 'PROCEDURE', title: 'Renewables', parentId: 'inf_pow' },

  // --- REAL ESTATE (South-East) ---
  { id: 'seg_re', type: 'CONCEPT', title: 'Real Estate', parentId: 'tt_group' },
  // Commercial
  { id: 're_com', type: 'PATTERN', title: 'Commercial', parentId: 'seg_re' },
  { id: 're_com_off', type: 'PROCEDURE', title: 'Office Space', parentId: 're_com' },
  { id: 're_com_ret', type: 'PROCEDURE', title: 'Retail & Leisure', parentId: 're_com' },
  // Public
  { id: 're_pub', type: 'PATTERN', title: 'Public Sector', parentId: 'seg_re' },
  { id: 're_pub_edu', type: 'PROCEDURE', title: 'Education', parentId: 're_pub' },
  { id: 're_pub_hea', type: 'PROCEDURE', title: 'Healthcare', parentId: 're_pub' },
  // Life Sciences
  { id: 're_ls', type: 'PATTERN', title: 'Life Sciences', parentId: 'seg_re' },
  { id: 're_ls_lab', type: 'PROCEDURE', title: 'Laboratory Design', parentId: 're_ls' },
  // Hi-Tech
  { id: 're_ht', type: 'PATTERN', title: 'Hi-Tech', parentId: 'seg_re' },
  { id: 're_ht_dc', type: 'PROCEDURE', title: 'Data Centres', parentId: 're_ht' },

  // --- CAPABILITIES (East) ---
  { id: 'cap_root', type: 'CONCEPT', title: 'Our Capabilities', parentId: 'tt_group' },
  { id: 'srv_pm', type: 'PROCEDURE', title: 'Project Management', parentId: 'cap_root' },
  { id: 'srv_pm_uk', type: 'PROCEDURE', title: 'Project Management UK', parentId: 'srv_pm', secondaryLinks: ['reg_uki'] },
  { id: 'srv_ccm', type: 'PROCEDURE', title: 'Cost & Commercial Management', parentId: 'cap_root' },
  { id: 'srv_ccm_uk', type: 'PROCEDURE', title: 'Cost & Commercial Management UK', parentId: 'srv_ccm', secondaryLinks: ['reg_uki'] },
  { id: 'srv_pa', type: 'PROCEDURE', title: 'Programme Advisory', parentId: 'cap_root' },
  { id: 'srv_psc', type: 'PROCEDURE', title: 'Procurement & Supply Chain', parentId: 'cap_root' },
  { id: 'srv_dig', type: 'PROCEDURE', title: 'Digital Performance', parentId: 'cap_root' },
  { id: 'srv_sus', type: 'PROCEDURE', title: 'Sustainability', parentId: 'cap_root' },
  { id: 'srv_am', type: 'PROCEDURE', title: 'Asset Management', parentId: 'cap_root' },

  // --- OUR BUSINESS (West) ---
  { id: 'bus_root', type: 'CONCEPT', title: 'Our Business', parentId: 'tt_group' },
  { id: 'bus_win', type: 'PROCEDURE', title: 'Winning New Work', parentId: 'bus_root' },
  { id: 'bus_win_ukbg', type: 'PROCEDURE', title: 'UK Business Generation', parentId: 'bus_win', secondaryLinks: ['reg_uki'] },
  { id: 'bus_win_ukbtw', type: 'DEFINITION', title: 'UK Bid to win knowledge', parentId: 'bus_win', secondaryLinks: ['reg_uki'] },
  { id: 'bus_shq', type: 'PROCEDURE', title: 'Health, Safety & Quality', parentId: 'bus_root' },
  { id: 'bus_per', type: 'PROCEDURE', title: 'People & Culture', parentId: 'bus_root' },
  { id: 'bus_per_rec', type: 'CONCEPT', title: 'Recruitment', parentId: 'bus_per' },
  { id: 'bus_per_tta', type: 'CONCEPT', title: 'Technical training academy (TTA)', parentId: 'bus_per' },
  { id: 'bus_fin', type: 'PROCEDURE', title: 'Finance & Legal', parentId: 'bus_root' },
  { id: 'bus_fin_mbr', type: 'PROCEDURE', title: 'Managing business risk', parentId: 'bus_fin' }
];
