export const MESHES = [
  { "id": "tt_group", "type": "CONCEPT", "title": "Turner & Townsend Group", "content": { "Definition Summary": "Global professional services firm specialising in programme, project and cost management." } },

  // --- OUR BUSINESS (CONCEPT - Left) ---
  { "id": "bus_root", "type": "CONCEPT", "title": "Our Business", "parentId": "tt_group" },
  { "id": "bus_strat", "type": "PATTERN", "title": "Strategic Plan 2025-2030", "parentId": "bus_root" },
  { "id": "bus_ann", "type": "PATTERN", "title": "Annual Review & Performance", "parentId": "bus_root" },

  // --- WINNING NEW WORK (CONCEPT - Left) ---
  { "id": "win_root", "type": "CONCEPT", "title": "Winning New Work", "parentId": "tt_group" },
  { "id": "win_bid", "type": "PATTERN", "title": "Bid Management & Excellence", "parentId": "win_root" },
  { "id": "win_bd", "type": "PATTERN", "title": "Business Development Strategy", "parentId": "win_root" },
  { "id": "bus_win", "type": "PROCEDURE", "title": "The Winning Way Workflow", "parentId": "win_bid" },

  // --- OPERATIONS & SUPPORT (CONCEPT - Left) ---
  { "id": "ops_root", "type": "CONCEPT", "title": "Operations & Support Services", "parentId": "tt_group" },
  { "id": "ops_it", "type": "PATTERN", "title": "IT & Technology Services", "parentId": "ops_root" },
  { "id": "ops_fm", "type": "PATTERN", "title": "Facilities Management", "parentId": "ops_root" },
  { "id": "ops_hr", "type": "PATTERN", "title": "Human Resources & Payroll", "parentId": "ops_root" },
  { "id": "ops_fin", "type": "PATTERN", "title": "Finance & Internal Audit", "parentId": "ops_root" },

  // --- GOVERNANCE & CULTURE (CONCEPT - Bottom) ---
  { "id": "gov_root", "type": "CONCEPT", "title": "Governance & Culture", "parentId": "tt_group" },
  { "id": "gov_hsw", "type": "PATTERN", "title": "Health, Safety & Wellbeing", "parentId": "gov_root" },
  { "id": "gov_dei", "type": "PATTERN", "title": "Diversity, Equity & Inclusion", "parentId": "gov_root" },
  { "id": "gov_risk", "type": "PATTERN", "title": "Risk & Compliance", "parentId": "gov_root" },
  { "id": "gov_legal", "type": "PATTERN", "title": "Legal & General Counsel", "parentId": "gov_root" },

  // --- GLOBAL CAPABILITIES (CONCEPT - Right) ---
  { "id": "cap_root", "type": "CONCEPT", "title": "Global Capabilities", "parentId": "tt_group" },
  { "id": "srv_pm", "type": "CONCEPT", "title": "Project Management", "parentId": "cap_root" },
  { "id": "srv_ccm", "type": "CONCEPT", "title": "Cost & Commercial Management", "parentId": "cap_root" },
  { "id": "srv_pa", "type": "CONCEPT", "title": "Programme Advisory", "parentId": "cap_root" },
  { "id": "srv_psc", "type": "CONCEPT", "title": "Procurement & Supply Chain", "parentId": "cap_root" },
  { "id": "srv_dig", "type": "CONCEPT", "title": "Digital Performance", "parentId": "cap_root" },
  { "id": "srv_sus", "type": "CONCEPT", "title": "Sustainability", "parentId": "cap_root" },
  { "id": "srv_am", "type": "CONCEPT", "title": "Asset Management", "parentId": "cap_root" },
  { "id": "srv_bc", "type": "CONCEPT", "title": "Building Consultancy", "parentId": "cap_root" },

  // --- OUR REGIONS (CONCEPT - Top) ---
  { "id": "reg_root", "type": "CONCEPT", "title": "Our Regions", "parentId": "tt_group" },
  { "id": "reg_uki", "type": "CONCEPT", "title": "UK & Ireland", "parentId": "reg_root" },
  { "id": "loc_uk", "type": "VARIANT", "title": "United Kingdom", "parentId": "reg_uki" },
  { "id": "loc_ire", "type": "VARIANT", "title": "Republic of Ireland", "parentId": "reg_uki" },
  { "id": "uki_pm", "type": "VARIANT", "title": "UK Project Management", "parentId": "loc_uk", "secondaryLinks": ["srv_pm"] },
  { "id": "uki_ccm", "type": "VARIANT", "title": "UK Cost & Commercial Management", "parentId": "loc_uk", "secondaryLinks": ["srv_ccm"] },
  { "id": "uki_dig", "type": "VARIANT", "title": "UK Digital Performance", "parentId": "loc_uk", "secondaryLinks": ["srv_dig"] },
  { "id": "reg_ame", "type": "CONCEPT", "title": "Americas", "parentId": "reg_root" },
  { "id": "loc_usa", "type": "VARIANT", "title": "United States", "parentId": "reg_ame" },
  { "id": "loc_can", "type": "VARIANT", "title": "Canada", "parentId": "reg_ame" },
  { "id": "loc_arg", "type": "VARIANT", "title": "Argentina", "parentId": "reg_ame" },
  { "id": "loc_bra", "type": "VARIANT", "title": "Brazil", "parentId": "reg_ame" },
  { "id": "loc_mex", "type": "VARIANT", "title": "Mexico", "parentId": "reg_ame" },
  { "id": "reg_asia", "type": "CONCEPT", "title": "Asia", "parentId": "reg_root" },
  { "id": "loc_china", "type": "VARIANT", "title": "Greater China", "parentId": "reg_asia" },
  { "id": "loc_ind", "type": "VARIANT", "title": "India", "parentId": "reg_asia" },
  { "id": "loc_sin", "type": "VARIANT", "title": "Singapore", "parentId": "reg_asia" },
  { "id": "reg_eur", "type": "CONCEPT", "title": "Europe", "parentId": "reg_root" },
  { "id": "loc_ger", "type": "VARIANT", "title": "Germany", "parentId": "reg_eur" },
  { "id": "loc_fra", "type": "VARIANT", "title": "France", "parentId": "reg_eur" },
  { "id": "reg_me", "type": "CONCEPT", "title": "Middle East", "parentId": "reg_root" },
  { "id": "loc_ksa", "type": "VARIANT", "title": "Kingdom of Saudi Arabia", "parentId": "reg_me" },
  { "id": "loc_uae", "type": "VARIANT", "title": "United Arab Emirates", "parentId": "reg_me" },
  { "id": "reg_anz", "type": "CONCEPT", "title": "Australia & New Zealand", "parentId": "reg_root" },
  { "id": "loc_aus", "type": "VARIANT", "title": "Australia", "parentId": "reg_anz" },
  { "id": "reg_afr", "type": "CONCEPT", "title": "Africa", "parentId": "reg_root" },
  { "id": "loc_saf", "type": "VARIANT", "title": "South Africa", "parentId": "reg_afr" },

  // --- OUR SEGMENTS (CONCEPT - Bottom) ---
  { "id": "seg_root", "type": "CONCEPT", "title": "Our Segments", "parentId": "tt_group" },
  { "id": "seg_re", "type": "PATTERN", "title": "Real Estate", "parentId": "seg_root" },
  { "id": "re_health", "type": "PATTERN", "title": "Healthcare", "parentId": "seg_re" },
  { "id": "re_dc", "type": "PATTERN", "title": "Data Centres", "parentId": "seg_re" },
  { "id": "re_edu", "type": "PATTERN", "title": "Education", "parentId": "seg_re" },
  { "id": "re_comm", "type": "PATTERN", "title": "Commercial", "parentId": "seg_re" },
  { "id": "re_ind", "type": "PATTERN", "title": "Industrial and Logistics", "parentId": "seg_re" },
  { "id": "re_pub", "type": "PATTERN", "title": "Public Sector", "parentId": "seg_re" },
  { "id": "seg_inf", "type": "PATTERN", "title": "Infrastructure", "parentId": "seg_root" },
  { "id": "inf_tra", "type": "PATTERN", "title": "Transport (Aviation, Rail, Road)", "parentId": "seg_inf" },
  { "id": "inf_def", "type": "PATTERN", "title": "Defense", "parentId": "seg_inf" },
  { "id": "seg_enr", "type": "PATTERN", "title": "Energy & Natural Resources", "parentId": "seg_root" },
  { "id": "enr_clean", "type": "PATTERN", "title": "Clean Energy / Decarbonization", "parentId": "seg_enr" },
  { "id": "enr_oil", "type": "PATTERN", "title": "Conventional Energy (Oil & Gas)", "parentId": "seg_enr" },

  // --- PROCEDURES & SCENARIOS ---
  { "id": "prc_riba3", "type": "PROCEDURE", "title": "RIStage 3 Cost Planning", "parentId": "uki_ccm", "secondaryLinks": ["re_health"] },
  { "id": "prc_rail_est", "type": "PROCEDURE", "title": "Rail Network Estimating", "parentId": "inf_tra", "secondaryLinks": ["uki_ccm"] },
  { "id": "scn_delay", "type": "SCENARIO", "title": "Supply Chain Disruption Mitigation", "parentId": "srv_psc", "secondaryLinks": ["uki_pm", "inf_tra"] }
];
