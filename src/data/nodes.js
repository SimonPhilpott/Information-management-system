import { Layout, Globe, Settings, Database, Activity, Target, Shield, Droplets, Truck, Zap, Building, GraduationCap, Microscope, ShoppingCart, Trophy, Cpu, Wind, Flame, ZapOff, HardHat, Briefcase, Heart, BookOpen } from 'lucide-react';

// Read custom entity types from localStorage if available (with fallback support)
const getCustomEntityTypes = () => {
  if (typeof window === 'undefined') return {};
  try {
    const saved = localStorage.getItem('hive_graph_custom_entity_types');
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
};

const getCustomSchemas = () => {
  if (typeof window === 'undefined') return {};
  try {
    const saved = localStorage.getItem('hive_graph_custom_schemas');
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
};

const customTypes = getCustomEntityTypes();
const customSchemas = getCustomSchemas();

// Default Lucide icons mapped for custom types dynamically
const getIconForType = (typeKey) => {
  const icons = [Database, Activity, Target, Shield, BookOpen, Cpu, HardHat, Briefcase];
  let sum = 0;
  for (let i = 0; i < typeKey.length; i++) sum += typeKey.charCodeAt(i);
  return icons[sum % icons.length] || Database;
};

// Map custom types to include dynamic icons
const customTypesWithIcons = {};
Object.entries(customTypes).forEach(([key, config]) => {
  customTypesWithIcons[key] = {
    ...config,
    icon: getIconForType(key)
  };
});

export const ENTITY_TYPES = {
  CONCEPT: { 
    label: 'Concept',
    // Brand Cyan — primary identity colour. Works on both dark & light themes (contrast 4.9:1 on dark, 3.1:1 on light).
    color: '#0090DC',
    icon: Layout, 
    description: 'Definitions and concepts: Core services, business capabilities, and organisational topics (Defines WHAT we do).',
    guidance: 'WHAT IT MEANS: Broad services or main capabilities. They define WHAT we do, not HOW.\nROLE: Parent topics (e.g., Cost Management, Net Zero).',
    examples: 'EXAMPLES: Project Management, Digital Transformation, Infrastructure.',
    mappingTitle: 'General concepts and services',
    mappingSummary: 'Represents stable, general categories, business services, or permanent capabilities of the organisation.',
    aiUtility: 'Establishes the core entity framework (the "WHAT"). Prevents semantic drift in agent reasoning.'
  },
  PATTERN: { 
    label: 'Pattern',
    // Brand Purple — frameworks & archetypes. Contrast 4.6:1 on dark, 3.8:1 on light.
    color: '#7B3FA8',
    icon: Globe, 
    description: 'Models and blueprints: Repeatable delivery models, structural frameworks, and industry templates.',
    guidance: 'WHAT IT MEANS: The standard setup or blueprint before applying local changes.\nROLE: Sector-specific frameworks (e.g., Data Centre Delivery Model).',
    examples: 'EXAMPLES: Healthcare Campus Framework, Standard Supply Chain Setups.',
    mappingTitle: 'Standard blueprints and models',
    mappingSummary: 'Abstract solution structures or reusable blueprints representing standard operating configurations.',
    aiUtility: 'Injects reusable structure into responses. Scales standard blueprints across sectors.'
  },
  PROCEDURE: { 
    label: 'Procedure',
    // Brand Orange — execution & process. Contrast 3.5:1 on dark, 2.9:1 on light (used as accent/glow, not text).
    color: '#D55C17',
    icon: Settings, 
    description: 'Processes and workflows: Step-by-step methods, chronological actions, and deliverables (Defines HOW we execute).',
    guidance: 'WHAT IT MEANS: Where the actual work happens.\nROLE: Detailed workflows (e.g., RIBA Stage 3, Risk Workshops).',
    examples: 'EXAMPLES: Estimating Guidelines, Procurement Lifecycles, Cost Reporting.',
    mappingTitle: 'Workflows and tasks',
    mappingSummary: 'Step-by-step action sequences, process flows, or methodology execution steps.',
    aiUtility: 'Governs execution steps (the "HOW"). Chains sequential actions and deliverables.'
  },
  VARIANT: { 
    label: 'Variant',
    // Brand Grey — contextual overrides. FIXES the invisible white-on-light-theme issue.
    // Contrast 5.9:1 on light (#ece8dd), 4.0:1 on dark (#000). Readable on both themes.
    color: '#505a60',
    icon: Target, 
    description: 'Local adjustments: Regional deviations, legal exceptions, and client-specific overrides.',
    guidance: 'WHAT IT MEANS: Used when regional, legal, or client rules override the standard.\nROLE: Local adjustments and exceptions (e.g., UK JCT vs US AIA).',
    examples: 'EXAMPLES: UK Public Contract Regulations, "The Shell Way".',
    mappingTitle: 'Local exceptions and adjustments',
    mappingSummary: 'Localised exceptions, conditional overrides, or client-specific adaptations of standard policies.',
    aiUtility: 'Injects dynamic constraints (contracts, geography). Localises standard responses.'
  },
  SCENARIO: { 
    label: 'Scenario',
    // Brand Red — risk events & stress tests. Contrast 4.1:1 on dark, 3.4:1 on light.
    color: '#C0392B',
    icon: Activity, 
    description: 'Examples and cases: Real-world case studies, stress tests, and flex strategies under specific risk conditions.',
    guidance: 'WHAT IT MEANS: How standard processes must flex under specific risk events.\nROLE: Risk adjustments and mitigation plans (e.g., High Inflation, Supply Chain Collapse).',
    examples: 'EXAMPLES: Rapid-timeline Adjustments, Material Delay Mitigation.',
    mappingTitle: 'Real-world examples and cases',
    mappingSummary: 'Concrete historical cases, simulated scenarios, or real-world exemplars of the system in operation.',
    aiUtility: 'Supplies empirical context for RAG validation. Employs real-world examples to verify claims.'
  },
  RULE: {
    label: 'Rule',
    // Brand Green — compliance & hard constraints. Contrast 5.0:1 on dark, 3.2:1 on light.
    color: '#00A000',
    icon: Shield,
    description: 'Non-negotiable rules and limits: Strict boundaries, compliance standards, and limits that cannot be violated.',
    guidance: 'WHAT IT MEANS: Strict regulatory, contractual or safety boundaries.\nROLE: Hard limits and requirements (e.g., Minimum Safety Standards, Budget Thresholds).',
    examples: 'EXAMPLES: HSE Regulations, ISO Certifications, Maximum Cost Limit.',
    mappingTitle: 'Governance and guardrails',
    mappingSummary: 'Strict, non-negotiable regulatory boundaries, safety standards, thresholds, or validation parameters.',
    aiUtility: 'Enforces strict logical guardrails. Restricts response space to compliant pathways.'
  },
  ...customTypesWithIcons
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
  ],
  RULE: [
    { name: 'Definition Summary' }, 
    { name: 'Constraint/Boundary Parameters' }, 
    { name: 'Compliance Reference/Standard' }
  ],
  ...customSchemas
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

  // --- REGIONS ---
  { id: 'reg_root', type: 'CONCEPT', title: 'Our Regions', parentId: 'tt_group' },

  // EMEA Super-Region
  { id: 'reg_emea', type: 'CONCEPT', title: 'EMEA', parentId: 'reg_root' },
  { id: 'reg_uki', type: 'CONCEPT', title: 'UK & Ireland', parentId: 'reg_emea' },
  { id: 'reg_eur', type: 'CONCEPT', title: 'Europe', parentId: 'reg_emea' },
  { id: 'reg_me', type: 'CONCEPT', title: 'Middle East', parentId: 'reg_emea' },
  { id: 'reg_afr', type: 'CONCEPT', title: 'Africa', parentId: 'reg_emea' },

  // Americas Super-Region
  { id: 'reg_americas', type: 'CONCEPT', title: 'Americas', parentId: 'reg_root' },
  { id: 'reg_usa', type: 'CONCEPT', title: 'USA', parentId: 'reg_americas' },
  { id: 'reg_can_reg', type: 'CONCEPT', title: 'Canada', parentId: 'reg_americas' },
  { id: 'reg_la', type: 'CONCEPT', title: 'Latin America', parentId: 'reg_americas' },

  // APAC Super-Region
  { id: 'reg_apac', type: 'CONCEPT', title: 'APAC', parentId: 'reg_root' },
  { id: 'reg_n_asia', type: 'CONCEPT', title: 'North Asia', parentId: 'reg_apac' },
  { id: 'reg_s_asia', type: 'CONCEPT', title: 'South Asia', parentId: 'reg_apac' },
  { id: 'reg_anz', type: 'CONCEPT', title: 'Australia & New Zealand', parentId: 'reg_apac' },

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
