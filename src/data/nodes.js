import { Layout, Globe, Settings, Database, Activity, Target, Shield, Droplets, Truck, Zap, Building, GraduationCap, Microscope, ShoppingCart, Trophy, Cpu, Wind, Flame, ZapOff, HardHat, Briefcase, Heart, BookOpen } from 'lucide-react';

export const ENTITY_TYPES = {
  CONCEPT: { 
    label: 'Concept', color: '#00f2ff', icon: Layout, 
    description: 'Corporate definitions: High-level building blocks of the business.',
    guidance: 'WHAT IT MEANS: Broad services or major capabilities. They define WHAT we do, not HOW.\nROLE: Strategic parents (e.g., Cost Management, Net Zero).',
    examples: 'EXAMPLES: Project Management, Digital Transformation, Infrastructure.'
  },
  PATTERN: { 
    label: 'Pattern', color: '#ff007a', icon: Globe, 
    description: 'The Archetypes and frameworks: A repeatable model applied across business knowledge.',
    guidance: 'WHAT IT MEANS: The "Standard Operating Model" before customization.\nROLE: Sector-specific frameworks (e.g., Data Centre Delivery Model).',
    examples: 'EXAMPLES: Healthcare Campus Framework, Standard Supply Chain Setups.'
  },
  PROCEDURE: { 
    label: 'Procedure', color: '#ffe600', icon: Settings, 
    description: 'The Workflows: Chronological, step-by-step methods.',
    guidance: 'WHAT IT MEANS: Where the actual work happens.\nROLE: Detailed workflows (e.g., RIBA Stage 3, Risk Workshops).',
    examples: 'EXAMPLES: Estimating Guidelines, Procurement Lifecycles, Cost Reporting.'
  },
  VARIANT: { 
    label: 'Variant', color: '#ffffff', icon: Target, 
    description: 'The Localisations and exceptions: Regional, framework or client-specific deviations.',
    guidance: 'WHAT IT MEANS: Used when regional, legal, or client rules override the standard.\nROLE: Exceptions (e.g., UK JCT vs US AIA).',
    examples: 'EXAMPLES: UK Public Contract Regulations, "The Shell Way".'
  },
  SCENARIO: { 
    label: 'Scenario', color: '#bd00ff', icon: Activity, 
    description: 'Our best practice: Hypothetical or real life examples of the Concepts, Patterns, Procedures and Variants.',
    guidance: 'WHAT IT MEANS: How the standard workflow must flex under specific risk events.\nROLE: Mitigation plans (e.g., High Inflation, Supply Chain Collapse).',
    examples: 'EXAMPLES: Rapid-timeline Adjustments, Material Delay Mitigation.'
  }
};

export const SCHEMAS = {
  CONCEPT: [
    { name: 'Definition Summary' }, 
    { name: 'Strategic Major Capabilities' }, 
    { name: 'Core Service Scope' }
  ],
  PATTERN: [
    { name: 'Definition Summary' }, 
    { name: 'Standard Operating Model' }, 
    { name: 'Sector-Specific Delivery Framework' }
  ],
  PROCEDURE: [
    { name: 'Definition Summary' }, 
    { name: 'Step-By-Step Workflow Logic' }, 
    { name: 'Mandated Deliverables/Guidelines' }
  ],
  VARIANT: [
    { name: 'Definition Summary' }, 
    { name: 'Localization / Exception Details' }, 
    { name: 'Regional/Client Deviation Logic' }
  ],
  SCENARIO: [
    { name: 'Definition Summary' }, 
    { name: 'Stress Test Parameters (The "What If")' }, 
    { name: 'Mitigation & Flex Logic' }
  ]
};

export const INITIAL_NODES = [
  // --- ROOT ---
  { id: 'tt_group', x: 2000, y: 2000, type: 'CONCEPT', title: 'Turner & Townsend Group Limited', content: { 'Definition Summary': 'Global professional services firm specialising in programme, project and cost management.' } },

  // --- EXAMPLE FLOW: HOSPITAL IN LONDON ---
  { id: 'srv_pm', type: 'CONCEPT', title: 'Project Management', parentId: 'tt_group' },
  { id: 'pat_health', type: 'PATTERN', title: 'Healthcare Delivery Model', parentId: 'srv_pm' },
  { id: 'prc_riba3', type: 'PROCEDURE', title: 'RIBA Stage 3 Cost Planning', parentId: 'pat_health' },
  { id: 'var_ukreg', type: 'VARIANT', title: 'UK Public Contract Regulations 2015', parentId: 'prc_riba3' },
  { id: 'scn_delay', type: 'SCENARIO', title: 'Supply Chain Disruption Mitigation', parentId: 'prc_riba3' },

  // --- REGIONS (North) ---
  { id: 'reg_root', type: 'CONCEPT', title: 'Our Regions', parentId: 'tt_group' },
  { id: 'reg_uki', type: 'VARIANT', title: 'UK & Ireland', parentId: 'reg_root' },
  { id: 'reg_na', type: 'VARIANT', title: 'North America', parentId: 'reg_root' },
  { id: 'reg_eur', type: 'VARIANT', title: 'Europe', parentId: 'reg_root' },

  // --- SECTORS (South-West) ---
  { id: 'seg_inf', type: 'CONCEPT', title: 'Infrastructure', parentId: 'tt_group' },
  { id: 'inf_tra', type: 'PATTERN', title: 'Transport Framework', parentId: 'seg_inf' },
  { id: 'inf_tra_rail', type: 'PROCEDURE', title: 'Rail Network Estimating', parentId: 'inf_tra' },

  // --- REAL ESTATE (South-East) ---
  { id: 'seg_re', type: 'CONCEPT', title: 'Real Estate', parentId: 'tt_group' },
  { id: 're_ht_dc', type: 'PATTERN', title: 'Data Centre Delivery Model', parentId: 'seg_re' },
  { id: 're_ht_dc_proc', type: 'PROCEDURE', title: 'DC Capacity Procurement', parentId: 're_ht_dc' },

  // --- GLOBAL CAPABILITIES (East) ---
  { id: 'cap_root', type: 'CONCEPT', title: 'Global Capabilities', parentId: 'tt_group' },
  { id: 'cap_nz', type: 'CONCEPT', title: 'Net Zero Transformation', parentId: 'cap_root' },
  { id: 'cap_digital', type: 'CONCEPT', title: 'Digital Performance', parentId: 'cap_root' }
];
