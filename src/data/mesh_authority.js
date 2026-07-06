export const MESHES = [
  {
    "id": "tt_group",
    "type": "CONCEPT",
    "title": "Turner & Townsend Group",
    "content": {
      "Definition Summary": "Global professional services firm specialising in programme, project and cost management."
    }
  },
  {
    "id": "bus_root",
    "type": "CONCEPT",
    "title": "Our Business",
    "parentId": "tt_group"
  },
  {
    "id": "bus_strat",
    "type": "PATTERN",
    "title": "Strategic Plan 2025-2030",
    "parentId": "bus_root"
  },
  {
    "id": "bus_ann",
    "type": "PATTERN",
    "title": "Annual Review & Performance",
    "parentId": "bus_root"
  },
  {
    "id": "win_root",
    "type": "CONCEPT",
    "title": "Winning New Work",
    "parentId": "tt_group"
  },
  {
    "id": "win_bid",
    "type": "PATTERN",
    "title": "Bid Management & Excellence",
    "parentId": "win_root"
  },
  {
    "id": "win_bd",
    "type": "PATTERN",
    "title": "Business Development Strategy",
    "parentId": "win_root"
  },
  {
    "id": "bus_win",
    "type": "PROCEDURE",
    "title": "The Winning Way Workflow",
    "parentId": "win_bid"
  },
  {
    "id": "ops_root",
    "type": "CONCEPT",
    "title": "Operations & Support Services",
    "parentId": "tt_group"
  },
  {
    "id": "ops_it",
    "type": "PATTERN",
    "title": "IT & Technology Services",
    "parentId": "ops_root"
  },
  {
    "id": "ops_fm",
    "type": "PATTERN",
    "title": "Facilities Management",
    "parentId": "ops_root"
  },
  {
    "id": "ops_hr",
    "type": "PATTERN",
    "title": "Human Resources & Payroll",
    "parentId": "ops_root"
  },
  {
    "id": "ops_fin",
    "type": "PATTERN",
    "title": "Finance & Internal Audit",
    "parentId": "ops_root"
  },
  {
    "id": "gov_root",
    "type": "CONCEPT",
    "title": "Governance & Culture",
    "parentId": "tt_group"
  },
  {
    "id": "gov_hsw",
    "type": "PATTERN",
    "title": "Health, Safety & Wellbeing",
    "parentId": "gov_root"
  },
  {
    "id": "gov_dei",
    "type": "PATTERN",
    "title": "Diversity, Equity & Inclusion",
    "parentId": "gov_root"
  },
  {
    "id": "gov_risk",
    "type": "PATTERN",
    "title": "Risk & Compliance",
    "parentId": "gov_root"
  },
  {
    "id": "gov_legal",
    "type": "PATTERN",
    "title": "Legal & General Counsel",
    "parentId": "gov_root"
  },
  {
    "id": "cap_root",
    "type": "CONCEPT",
    "title": "Global Capabilities",
    "parentId": "tt_group"
  },
  {
    "id": "srv_pm",
    "type": "CONCEPT",
    "title": "Project Management",
    "parentId": "cap_root"
  },
  {
    "id": "srv_ccm",
    "type": "CONCEPT",
    "title": "Cost & Commercial Management",
    "parentId": "cap_root"
  },
  {
    "id": "srv_pa",
    "type": "CONCEPT",
    "title": "Programme Advisory",
    "parentId": "cap_root"
  },
  {
    "id": "srv_psc",
    "type": "CONCEPT",
    "title": "Procurement & Supply Chain",
    "parentId": "cap_root"
  },
  {
    "id": "srv_dig",
    "type": "CONCEPT",
    "title": "Digital Performance",
    "parentId": "cap_root"
  },
  {
    "id": "srv_sus",
    "type": "CONCEPT",
    "title": "Sustainability",
    "parentId": "cap_root"
  },
  {
    "id": "srv_am",
    "type": "CONCEPT",
    "title": "Asset Management",
    "parentId": "cap_root"
  },
  {
    "id": "srv_bc",
    "type": "CONCEPT",
    "title": "Building Consultancy",
    "parentId": "cap_root"
  },
  {
    "id": "reg_root",
    "type": "CONCEPT",
    "title": "Our Regions",
    "parentId": "tt_group"
  },
  {
    "id": "loc_uk",
    "type": "VARIANT",
    "title": "United Kingdom",
    "parentId": "reg_uki"
  },
  {
    "id": "loc_ire",
    "type": "VARIANT",
    "title": "Republic of Ireland",
    "parentId": "reg_uki"
  },
  {
    "id": "uki_pm",
    "type": "VARIANT",
    "title": "UK Project Management",
    "parentId": "srv_pm",
    "secondaryLinks": [
      "loc_uk"
    ]
  },
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
  },
  {
    "id": "uki_ccm",
    "type": "VARIANT",
    "title": "UK Cost & Commercial Management",
    "parentId": "srv_ccm",
    "secondaryLinks": [
      "loc_uk"
    ]
  },
  {
    "id": "uki_dig",
    "type": "VARIANT",
    "title": "UK Digital Performance",
    "parentId": "srv_dig",
    "secondaryLinks": [
      "loc_uk"
    ]
  },
  {
    "id": "loc_usa",
    "type": "VARIANT",
    "title": "United States",
    "parentId": "reg_usa"
  },
  {
    "id": "loc_can",
    "type": "VARIANT",
    "title": "Canada",
    "parentId": "reg_can_reg"
  },
  {
    "id": "loc_arg",
    "type": "VARIANT",
    "title": "Argentina",
    "parentId": "reg_la"
  },
  {
    "id": "loc_bra",
    "type": "VARIANT",
    "title": "Brazil",
    "parentId": "reg_la"
  },
  {
    "id": "loc_mex",
    "type": "VARIANT",
    "title": "Mexico",
    "parentId": "reg_la"
  },
  {
    "id": "loc_china",
    "type": "VARIANT",
    "title": "Greater China",
    "parentId": "reg_n_asia"
  },
  {
    "id": "loc_ind",
    "type": "VARIANT",
    "title": "India",
    "parentId": "reg_s_asia"
  },
  {
    "id": "loc_sin",
    "type": "VARIANT",
    "title": "Singapore",
    "parentId": "reg_s_asia"
  },
  {
    "id": "loc_ger",
    "type": "VARIANT",
    "title": "Germany",
    "parentId": "reg_eur"
  },
  {
    "id": "loc_fra",
    "type": "VARIANT",
    "title": "France",
    "parentId": "reg_eur"
  },
  {
    "id": "reg_me",
    "type": "CONCEPT",
    "title": "Middle East",
    "parentId": "reg_emea"
  },
  {
    "id": "loc_ksa",
    "type": "VARIANT",
    "title": "Kingdom of Saudi Arabia",
    "parentId": "reg_me"
  },
  {
    "id": "loc_uae",
    "type": "VARIANT",
    "title": "United Arab Emirates",
    "parentId": "reg_me"
  },
  {
    "id": "reg_anz",
    "type": "CONCEPT",
    "title": "Australia & New Zealand",
    "parentId": "reg_apac"
  },
  {
    "id": "loc_aus",
    "type": "VARIANT",
    "title": "Australia",
    "parentId": "reg_anz"
  },
  {
    "id": "reg_afr",
    "type": "CONCEPT",
    "title": "Africa",
    "parentId": "reg_emea"
  },
  {
    "id": "loc_saf",
    "type": "VARIANT",
    "title": "South Africa",
    "parentId": "reg_afr"
  },
  {
    "id": "seg_root",
    "type": "CONCEPT",
    "title": "Our Segments",
    "parentId": "tt_group"
  },
  {
    "id": "seg_re",
    "type": "CONCEPT",
    "title": "Real Estate",
    "parentId": "seg_root"
  },
  {
    "id": "re_health",
    "type": "PATTERN",
    "title": "Healthcare",
    "parentId": "seg_re"
  },
  {
    "id": "re_dc",
    "type": "PATTERN",
    "title": "Data Centres",
    "parentId": "seg_re"
  },
  {
    "id": "re_edu",
    "type": "PATTERN",
    "title": "Education",
    "parentId": "seg_re"
  },
  {
    "id": "re_comm",
    "type": "PATTERN",
    "title": "Commercial",
    "parentId": "seg_re"
  },
  {
    "id": "re_ind",
    "type": "PATTERN",
    "title": "Industrial and Logistics",
    "parentId": "seg_re"
  },
  {
    "id": "re_pub",
    "type": "PATTERN",
    "title": "Public Sector",
    "parentId": "seg_re"
  },
  {
    "id": "seg_inf",
    "type": "CONCEPT",
    "title": "Infrastructure",
    "parentId": "seg_root"
  },
  {
    "id": "inf_tra",
    "type": "PATTERN",
    "title": "Transport (Aviation, Rail, Road)",
    "parentId": "seg_inf"
  },
  {
    "id": "inf_def",
    "type": "PATTERN",
    "title": "Defense",
    "parentId": "seg_inf"
  },
  {
    "id": "seg_enr",
    "type": "PATTERN",
    "title": "Energy & Natural Resources",
    "parentId": "seg_root"
  },
  {
    "id": "enr_clean",
    "type": "PATTERN",
    "title": "Clean Energy / Decarbonization",
    "parentId": "seg_enr"
  },
  {
    "id": "enr_oil",
    "type": "PATTERN",
    "title": "Conventional Energy (Oil & Gas)",
    "parentId": "seg_enr"
  },
  {
    "id": "prc_riba3",
    "type": "PROCEDURE",
    "title": "RIBA Stage 3 Cost Planning",
    "parentId": "uki_ccm",
    "secondaryLinks": [
      "re_health"
    ]
  },
  {
    "id": "ccm_interim_valuations",
    "type": "PROCEDURE",
    "title": "Interim valuations",
    "parentId": "uki_ccm",
    "secondaryLinks": [
      "bok_contract_management",
      "bok_contract_administration"
    ]
  },
  {
    "id": "ccm_final_account",
    "type": "PROCEDURE",
    "title": "Final account",
    "parentId": "uki_ccm"
  },
  {
    "id": "ccm_insolvency_management",
    "type": "PROCEDURE",
    "title": "Insolvency management",
    "parentId": "uki_ccm",
    "secondaryLinks": [
      "bok_claims_management",
      "bok_dispute_resolution"
    ]
  },
  {
    "id": "ccm_claims_management",
    "type": "PROCEDURE",
    "title": "Claims management",
    "parentId": "uki_ccm",
    "secondaryLinks": [
      "bok_claims_management",
      "bok_dispute_resolution"
    ]
  },
  {
    "id": "ccm_insurance_reinstatement",
    "type": "PROCEDURE",
    "title": "Insurance reinstatement",
    "parentId": "uki_ccm"
  },
  {
    "id": "ccm_take_to_market",
    "type": "PROCEDURE",
    "title": "Take to market",
    "parentId": "uki_ccm"
  },
  {
    "id": "ccm_knowledge_data_insight",
    "type": "PROCEDURE",
    "title": "Knowledge, data and insight",
    "parentId": "uki_ccm",
    "secondaryLinks": [
      "bok_management_information_and_reporting"
    ]
  },
  {
    "id": "ccm_our_approach",
    "type": "PROCEDURE",
    "title": "Our approach",
    "parentId": "uki_ccm"
  },
  {
    "id": "ccm_preface",
    "type": "PROCEDURE",
    "title": "Preface",
    "parentId": "uki_ccm"
  },
  {
    "id": "ccm_getting_started",
    "type": "PROCEDURE",
    "title": "Getting started",
    "parentId": "uki_ccm"
  },
  {
    "id": "ccm_order_of_cost_estimate",
    "type": "PROCEDURE",
    "title": "Order of cost estimate",
    "parentId": "uki_ccm",
    "secondaryLinks": [
      "bok_cost_estimating",
      "bok_capex_opex_and_lifecycle_estimating"
    ]
  },
  {
    "id": "ccm_benchmarking",
    "type": "PROCEDURE",
    "title": "Benchmarking",
    "parentId": "uki_ccm",
    "secondaryLinks": [
      "bok_cost_benchmarking"
    ]
  },
  {
    "id": "ccm_value_engineering",
    "type": "PROCEDURE",
    "title": "Value engineering and value management",
    "parentId": "uki_ccm",
    "secondaryLinks": [
      "bok_value_engineering",
      "bok_value_management"
    ]
  },
  {
    "id": "ccm_risk_management",
    "type": "PROCEDURE",
    "title": "Risk management",
    "parentId": "uki_ccm",
    "secondaryLinks": [
      "bok_risk_management"
    ]
  },
  {
    "id": "ccm_cost_planning",
    "type": "PROCEDURE",
    "title": "Cost planning",
    "parentId": "uki_ccm",
    "secondaryLinks": [
      "bok_cost_planning_and_engineering"
    ]
  },
  {
    "id": "ccm_procurement_contract_strategy",
    "type": "PROCEDURE",
    "title": "Procurement and contract strategy",
    "parentId": "uki_ccm",
    "secondaryLinks": [
      "bok_procurement_and_contract_strategy"
    ]
  },
  {
    "id": "ccm_tender_management_evaluation",
    "type": "PROCEDURE",
    "title": "Tender management and evaluation",
    "parentId": "uki_ccm",
    "secondaryLinks": [
      "bok_tender_evaluation",
      "bok_procurement_management"
    ]
  },
  {
    "id": "ccm_contract_setup",
    "type": "PROCEDURE",
    "title": "Contract setup",
    "parentId": "uki_ccm",
    "secondaryLinks": [
      "bok_contract_management",
      "bok_contract_administration"
    ]
  },
  {
    "id": "ccm_project_cost_control",
    "type": "PROCEDURE",
    "title": "Project cost control",
    "parentId": "uki_ccm",
    "secondaryLinks": [
      "bok_cost_control"
    ]
  },
  {
    "id": "prc_rail_est",
    "type": "PROCEDURE",
    "title": "Rail Network Estimating",
    "parentId": "inf_tra",
    "secondaryLinks": [
      "uki_ccm"
    ]
  },
  {
    "id": "scn_delay",
    "type": "SCENARIO",
    "title": "Supply Chain Disruption Mitigation",
    "parentId": "srv_psc",
    "secondaryLinks": [
      "uki_pm",
      "inf_tra"
    ]
  },
  {
    "id": "reg_emea",
    "type": "CONCEPT",
    "title": "EMEA",
    "parentId": "reg_root"
  },
  {
    "id": "reg_uki",
    "type": "CONCEPT",
    "title": "UK & Ireland",
    "parentId": "reg_emea"
  },
  {
    "id": "reg_eur",
    "type": "CONCEPT",
    "title": "Europe",
    "parentId": "reg_emea"
  },
  {
    "id": "reg_americas",
    "type": "CONCEPT",
    "title": "Americas",
    "parentId": "reg_root"
  },
  {
    "id": "reg_la",
    "type": "CONCEPT",
    "title": "Latin America",
    "parentId": "reg_americas"
  },
  {
    "id": "reg_usa",
    "type": "CONCEPT",
    "title": "USA",
    "parentId": "reg_americas"
  },
  {
    "id": "reg_can_reg",
    "type": "CONCEPT",
    "title": "Canada",
    "parentId": "reg_americas"
  },
  {
    "id": "reg_apac",
    "type": "CONCEPT",
    "title": "APAC",
    "parentId": "reg_root"
  },
  {
    "id": "reg_n_asia",
    "type": "CONCEPT",
    "title": "North Asia",
    "parentId": "reg_apac"
  },
  {
    "id": "reg_s_asia",
    "type": "CONCEPT",
    "title": "South Asia",
    "parentId": "reg_apac"
  },
  {
    "id": "loc_idn",
    "type": "VARIANT",
    "title": "Indonesia",
    "parentId": "reg_s_asia"
  },
  {
    "id": "loc_jpn",
    "type": "VARIANT",
    "title": "Japan",
    "parentId": "reg_n_asia"
  },
  {
    "id": "loc_kor",
    "type": "VARIANT",
    "title": "Korea",
    "parentId": "reg_n_asia"
  },
  {
    "id": "loc_mys",
    "type": "VARIANT",
    "title": "Malaysia",
    "parentId": "reg_s_asia"
  },
  {
    "id": "loc_nzl",
    "type": "VARIANT",
    "title": "New Zealand",
    "parentId": "reg_anz"
  },
  {
    "id": "loc_phl",
    "type": "VARIANT",
    "title": "Philippines",
    "parentId": "reg_s_asia"
  },
  {
    "id": "loc_twn",
    "type": "VARIANT",
    "title": "Taiwan",
    "parentId": "reg_n_asia"
  },
  {
    "id": "loc_tha",
    "type": "VARIANT",
    "title": "Thailand",
    "parentId": "reg_s_asia"
  },
  {
    "id": "loc_vnm",
    "type": "VARIANT",
    "title": "Vietnam",
    "parentId": "reg_s_asia"
  },
  {
    "id": "loc_aut",
    "type": "VARIANT",
    "title": "Austria",
    "parentId": "reg_eur"
  },
  {
    "id": "loc_bel",
    "type": "VARIANT",
    "title": "Belgium",
    "parentId": "reg_eur"
  },
  {
    "id": "loc_bgr",
    "type": "VARIANT",
    "title": "Bulgaria",
    "parentId": "reg_eur"
  },
  {
    "id": "loc_hrv",
    "type": "VARIANT",
    "title": "Croatia",
    "parentId": "reg_eur"
  },
  {
    "id": "loc_cze",
    "type": "VARIANT",
    "title": "Czech Republic",
    "parentId": "reg_eur"
  },
  {
    "id": "loc_dnk",
    "type": "VARIANT",
    "title": "Denmark",
    "parentId": "reg_eur"
  },
  {
    "id": "loc_fin",
    "type": "VARIANT",
    "title": "Finland",
    "parentId": "reg_eur"
  },
  {
    "id": "loc_grc",
    "type": "VARIANT",
    "title": "Greece",
    "parentId": "reg_eur"
  },
  {
    "id": "loc_hun",
    "type": "VARIANT",
    "title": "Hungary",
    "parentId": "reg_eur"
  },
  {
    "id": "loc_ita",
    "type": "VARIANT",
    "title": "Italy",
    "parentId": "reg_eur"
  },
  {
    "id": "loc_lux",
    "type": "VARIANT",
    "title": "Luxembourg",
    "parentId": "reg_eur"
  },
  {
    "id": "loc_nor",
    "type": "VARIANT",
    "title": "Norway",
    "parentId": "reg_eur"
  },
  {
    "id": "loc_pol",
    "type": "VARIANT",
    "title": "Poland",
    "parentId": "reg_eur"
  },
  {
    "id": "loc_prt",
    "type": "VARIANT",
    "title": "Portugal",
    "parentId": "reg_eur"
  },
  {
    "id": "loc_rou",
    "type": "VARIANT",
    "title": "Romania",
    "parentId": "reg_eur"
  },
  {
    "id": "loc_srb",
    "type": "VARIANT",
    "title": "Serbia",
    "parentId": "reg_eur"
  },
  {
    "id": "loc_svk",
    "type": "VARIANT",
    "title": "Slovakia",
    "parentId": "reg_eur"
  },
  {
    "id": "loc_esp",
    "type": "VARIANT",
    "title": "Spain",
    "parentId": "reg_eur"
  },
  {
    "id": "loc_swe",
    "type": "VARIANT",
    "title": "Sweden",
    "parentId": "reg_eur"
  },
  {
    "id": "loc_che",
    "type": "VARIANT",
    "title": "Switzerland",
    "parentId": "reg_eur"
  },
  {
    "id": "loc_nld",
    "type": "VARIANT",
    "title": "The Netherlands",
    "parentId": "reg_eur"
  },
  {
    "id": "loc_tur",
    "type": "VARIANT",
    "title": "Türkiye",
    "parentId": "reg_eur"
  },
  {
    "id": "loc_egy",
    "type": "VARIANT",
    "title": "Egypt",
    "parentId": "reg_me"
  },
  {
    "id": "loc_qat",
    "type": "VARIANT",
    "title": "Qatar",
    "parentId": "reg_me"
  },
  {
    "id": "loc_chl",
    "type": "VARIANT",
    "title": "Chile",
    "parentId": "reg_la"
  },
  {
    "id": "loc_col",
    "type": "VARIANT",
    "title": "Colombia",
    "parentId": "reg_la"
  },
  {
    "id": "loc_per",
    "type": "VARIANT",
    "title": "Peru",
    "parentId": "reg_la"
  },
  {
    "id": "loc_ury",
    "type": "VARIANT",
    "title": "Uruguay",
    "parentId": "reg_la"
  },
  {
    "id": "loc_bwa",
    "type": "VARIANT",
    "title": "Botswana",
    "parentId": "reg_afr"
  },
  {
    "id": "loc_ken",
    "type": "VARIANT",
    "title": "Kenya",
    "parentId": "reg_afr"
  },
  {
    "id": "loc_moz",
    "type": "VARIANT",
    "title": "Mozambique",
    "parentId": "reg_afr"
  },
  {
    "id": "loc_nga",
    "type": "VARIANT",
    "title": "Nigeria",
    "parentId": "reg_afr"
  },
  {
    "id": "loc_rwa",
    "type": "VARIANT",
    "title": "Rwanda",
    "parentId": "reg_afr"
  },
  {
    "id": "loc_tza",
    "type": "VARIANT",
    "title": "Tanzania",
    "parentId": "reg_afr"
  },
  {
    "id": "loc_uga",
    "type": "VARIANT",
    "title": "Uganda",
    "parentId": "reg_afr"
  },
  {
    "id": "loc_zmb",
    "type": "VARIANT",
    "title": "Zambia",
    "parentId": "reg_afr"
  },
  {
    "id": "loc_zwe",
    "type": "VARIANT",
    "title": "Zimbabwe",
    "parentId": "reg_afr"
  }
];
