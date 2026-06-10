import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Globe, RefreshCw, ChevronRight, ChevronDown, Zap, Database, Plus } from 'lucide-react';
import { ENTITY_TYPES, SCHEMAS } from '../../data/nodes';

const AUTHORITATIVE_TT_MAP = {
  'bus_ann': '',
  'bus_root': '',
  'bus_strat': '',
  'bus_win': '',
  'cap_root': '',
  'enr_clean': '',
  'enr_mining': '',
  'enr_oil': '',
  'enr_td': '',
  'gov_dei': '',
  'gov_hsw': '',
  'gov_legal': '',
  'gov_risk': 'https://turntown.sharepoint.com/sites/GRM',
  'gov_root': '',
  'inf_def': '',
  'inf_highways': '',
  'inf_ports': '',
  'inf_tra': '',
  'inf_water': '',
  'loc_arg': '',
  'loc_aus': '',
  'loc_bra': '',
  'loc_can': '',
  'loc_china': '',
  'loc_fra': '',
  'loc_ger': '',
  'loc_ind': '',
  'loc_ire': '',
  'loc_ksa': '',
  'loc_mex': '',
  'loc_saf': '',
  'loc_sin': '',
  'loc_uae': '',
  'loc_uk': '',
  'loc_usa': '',
  'ops_fin': '',
  'ops_fm': 'https://turntown.sharepoint.com/sites/FACILITIES',
  'ops_hr': 'https://turntown.sharepoint.com/sites/HR-ANZ',
  'ops_it': 'https://turntown.sharepoint.com/sites/IT',
  'ops_km': 'https://turntown.sharepoint.com/sites/KM',
  'ops_root': '',
  'prc_rail_est': '',
  'prc_riba3': '',
  're_comm': '',
  're_corp': '',
  're_dc': '',
  're_edu': '',
  're_health': '',
  're_ind': '',
  're_ls': '',
  're_pub': '',
  're_retail': '',
  're_sports': '',
  're_tall': '',
  'reg_afr': '',
  'reg_anz': 'https://turntown.sharepoint.com/sites/GBG/SitePages/Australia-BG.aspx',
  'reg_asia': 'https://turntown.sharepoint.com/sites/GBG/SitePages/Asia-BG.aspx',
  'reg_eur': '',
  'reg_la': '',
  'reg_me': '',
  'reg_na': 'https://turntown.sharepoint.com/sites/NAM',
  'reg_root': '',
  'reg_uki': 'https://turntown.sharepoint.com/sites/RBG/SitePages/UK-Business-Generation.aspx',
  'scn_delay': '',
  'seg_enr': '',
  'seg_inf': '',
  'seg_re': '',
  'seg_root': '',
  'srv_am': '',
  'srv_bc': '',
  'srv_ccm': '',
  'srv_cm': '',
  'srv_dig': '',
  'srv_pa': '',
  'srv_pm': '',
  'srv_psc': 'https://turntown.sharepoint.com/sites/FWORK',
  'srv_sus': 'https://turntown.sharepoint.com/sites/Net-Zero',
  'tt_group': 'https://turntown.sharepoint.com/sites/ABOUT-US',
  'uki_ccm': '',
  'uki_dig': '',
  'uki_pm': '',
  'win_bd': '',
  'win_bid': 'https://turntown.sharepoint.com/sites/B2W/SitePages/Ourbidtowinprocess.aspx',
  'win_root': 'https://turntown.sharepoint.com/sites/B2W'
};

const MOCK_SUB_NAV = {
  'fwork': [
    { title: 'Framework Agreements', url: '/sites/FWORK/Agreements', type: 'CONCEPT' },
    { title: 'Pre-qualification Templates', url: '/sites/FWORK/PreQualTemplates', type: 'PROCEDURE' },
    { title: 'Compliance Guidelines', url: '/sites/FWORK/Compliance', type: 'PATTERN' }
  ],
  'b2w': [
    { title: 'Bid Proposals Library', url: '/sites/B2W/Proposals', type: 'CONCEPT' },
    { title: 'Win-Loss Analysis Reports', url: '/sites/B2W/WinLoss', type: 'PATTERN' },
    { title: 'Executive Summaries Toolkit', url: '/sites/B2W/SummariesToolkit', type: 'PROCEDURE' }
  ],
  'about-us': [
    { title: 'Our History & Heritage', url: '/sites/ABOUT-US/History', type: 'CONCEPT' },
    { title: 'Executive Leadership Team', url: '/sites/ABOUT-US/Leadership', type: 'CONCEPT' },
    { title: 'Global Vision & Values', url: '/sites/ABOUT-US/VisionValues', type: 'PATTERN' }
  ],
  'cr': [
    { title: 'Corporate Social Responsibility Reports', url: '/sites/CR/Reports', type: 'PATTERN' },
    { title: 'Sustainability Targets 2030', url: '/sites/CR/SustainabilityTargets', type: 'PATTERN' },
    { title: 'Community Outreach Initiatives', url: '/sites/CR/CommunityOutreach', type: 'SCENARIO' }
  ],
  'offices': [
    { title: 'London Office Hub', url: '/sites/Offices/London', type: 'VARIANT' },
    { title: 'New York Regional Office', url: '/sites/Offices/NewYork', type: 'VARIANT' },
    { title: 'Sydney Operations Base', url: '/sites/Offices/Sydney', type: 'VARIANT' }
  ],
  'sv-projman': [
    { title: 'Governance', url: '/sites/SV-PROJMAN/Governance', type: 'CONCEPT' },
    { title: 'Bidding and appointment', url: '/sites/SV-PROJMAN/Bidding-appointment', type: 'PROCEDURE' },
    { title: 'Managing commissions', url: '/sites/SV-PROJMAN/Managing-commissions', type: 'PROCEDURE' },
    { title: 'Delivering your project', url: '/sites/SV-PROJMAN/Delivering-project', type: 'CONCEPT' },
    { title: 'Our service delivery ADD model (Global)', url: '/sites/SV-PROJMAN/ADD-model-global', type: 'PATTERN' },
    { title: 'Our Real estate process model (Global)', url: '/sites/SV-PROJMAN/RE-model-global', type: 'PATTERN' },
    { title: 'Our Infrastructure process model (Global)', url: '/sites/SV-PROJMAN/Infra-model-global', type: 'PATTERN' },
    { title: 'Unsere ADD Methodik (Germany)', url: '/sites/SV-PROJMAN/ADD-methodik-germany', type: 'PATTERN' },
    { title: 'Unser Prozess (Germany)', url: '/sites/SV-PROJMAN/Prozess-germany', type: 'PATTERN' },
    { title: 'Business systems', url: '/sites/SV-PROJMAN/Business-systems', type: 'CONCEPT' }
  ]
};

const getDiscoveredItemsForUrl = (url) => {
  const lowercase = url.toLowerCase();
  for (const [key, items] of Object.entries(MOCK_SUB_NAV)) {
    if (lowercase.includes(key)) {
      return items.map((it, idx) => ({ ...it, url: getAbsoluteUrl(it.url), id: `discovered_${key}_${idx}`, checked: true }));
    }
  }
  return [
    { id: 'discovered_fallback_0', title: `${url.split('/').pop() || 'Site'} Documents`, url: getAbsoluteUrl(`${url}/documents`), type: 'CONCEPT', checked: true },
    { id: 'discovered_fallback_1', title: `${url.split('/').pop() || 'Site'} SOP Guidelines`, url: getAbsoluteUrl(`${url}/sop`), type: 'PROCEDURE', checked: true },
    { id: 'discovered_fallback_2', title: `${url.split('/').pop() || 'Site'} Collaboration board`, url: getAbsoluteUrl(`${url}/collab`), type: 'VARIANT', checked: true }
  ];
};

const getAbsoluteUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const base = 'https://turntown.sharepoint.com';
  if (url.startsWith('/')) return `${base}${url}`;
  return `${base}/${url}`;
};

const MapperTreeItem = ({ node, nodes, urls, onSaveUrls, onSync, onScan, isSyncing, level = 0 }) => {
  const children = nodes.filter(n => n.parentId === node.id && n.visible !== false);
  const hasChildren = children.length > 0;
  const [isOpen, setIsOpen] = useState(level < 1);
  const config = ENTITY_TYPES[node.type] || ENTITY_TYPES.CONCEPT;

  const rawUrl = urls[node.id] || '';
  const absoluteUrl = getAbsoluteUrl(rawUrl);

  return (
    <div className="select-none mb-1">
      <div 
        className="py-2 px-3 bg-[var(--bg-secondary)]/50 border border-[var(--glass-border)] rounded-xl hover:border-[var(--accent-indigo)]/30 transition-all flex items-center justify-between gap-3 group shadow-sm text-[11px]"
        style={{ marginLeft: `${level * 12}px` }}
      >
        <div className="flex items-center gap-2 min-w-[200px] shrink-0 cursor-pointer" onClick={() => hasChildren && setIsOpen(!isOpen)}>
           <div className="w-3.5 h-3.5 flex items-center justify-center">
               {hasChildren ? (
                   isOpen ? <ChevronDown size={10} className="text-[var(--text-muted)]" /> : <ChevronRight size={10} className="text-[var(--text-muted)]" />
               ) : (
                   <div className="w-1 h-px bg-[var(--glass-border)]" />
               )}
           </div>
           <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color }} />
           <span className="font-extrabold text-[10px] text-[var(--text-primary)] uppercase tracking-wider truncate max-w-[150px]" title={node.title}>{node.title}</span>
        </div>

        <div className="flex-1 flex items-center gap-2 min-w-0">
           <Globe size={10} className="text-[var(--text-muted)] shrink-0" />
           <input 
              className="flex-1 bg-[var(--bg-primary)] border border-[var(--glass-border)] rounded-lg py-1 px-2.5 text-[10px] text-[var(--text-secondary)] outline-none focus:border-[var(--accent-indigo)]/40 transition-all font-mono min-w-0"
              placeholder="Mapping URL..."
              value={rawUrl}
              onChange={(e) => onSaveUrls(node.id, e.target.value)}
              title={rawUrl ? `Absolute: ${absoluteUrl}` : ''}
           />
        </div>

        <div className="flex items-center gap-1 shrink-0">
           {rawUrl && (
             <a 
               href={absoluteUrl}
               target="_blank"
               rel="noopener noreferrer"
               className="py-1 px-2 rounded bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)] hover:bg-[var(--accent-indigo)] hover:text-white transition-all text-[8px] font-black uppercase border-none cursor-pointer no-underline flex items-center justify-center"
             >
                Open
             </a>
           )}
           <button 
             onClick={() => onSync(node)}
             disabled={isSyncing === node.id || !rawUrl}
             className={`py-1 px-2 rounded bg-[var(--accent-indigo)]/10 text-[var(--text-secondary)] hover:bg-[var(--accent-indigo)] hover:text-white transition-all text-[8px] font-black uppercase border-none cursor-pointer`}
           >
              {isSyncing === node.id ? 'Syncing...' : 'Content Sync'}
           </button>
           <button 
             onClick={() => onScan(node)}
             disabled={!rawUrl}
             className="py-1 px-2 rounded bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)] hover:text-white transition-all border-none cursor-pointer text-[8px] font-black uppercase"
           >
              Nav Scan
           </button>
        </div>
      </div>

      {hasChildren && isOpen && (
        <div className="mt-1">
          {children.map(child => (
            <MapperTreeItem 
              key={child.id} 
              node={child} 
              nodes={nodes} 
              urls={urls} 
              onSaveUrls={onSaveUrls} 
              onSync={onSync} 
              onScan={onScan} 
              isSyncing={isSyncing}
              level={level + 1} 
            />
          ))}
        </div>
      )}
    </div>
  );
};

export function URLMapper({ nodes, onUpdateNodes, onReviewSync }) {
  const [search, setSearch] = useState('');
  const [urls, setUrls] = useState(() => {
    // Version sentinel: bump this when AUTHORITATIVE_TT_MAP changes to flush stale localStorage
    const URL_MAP_VERSION = '3';
    const storedVersion = localStorage.getItem('hive_url_map_version');
    if (storedVersion !== URL_MAP_VERSION) {
      // Discard old data – start fresh from the authoritative map
      localStorage.removeItem('hive_graph_node_urls');
      localStorage.removeItem('hive_mesh_node_urls');
      localStorage.setItem('hive_url_map_version', URL_MAP_VERSION);
      return { ...AUTHORITATIVE_TT_MAP };
    }
    const saved = localStorage.getItem('hive_graph_node_urls');
    const parsedSaved = saved ? JSON.parse(saved) : {};
    return { ...AUTHORITATIVE_TT_MAP, ...parsedSaved };
  });
  const [isSyncing, setIsSyncing] = useState(null);

  // Scanner states
  const [scanningNode, setScanningNode] = useState(null);
  const [discoveredItems, setDiscoveredItems] = useState([]);
  const [showScanModal, setShowScanModal] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanSource, setScanSource] = useState(null); // 'live' | 'fallback' | 'mock'
  const [xmlText, setXmlText] = useState('');
  const [isEditingXml, setIsEditingXml] = useState(true);
  const [xmlTab, setXmlTab] = useState('raw'); // 'raw' | 'tree'

  // Connection lookup states
  const [lookups, setLookups] = useState({});
  const [lookupResults, setLookupResults] = useState([]);
  const [activeLookupNodeId, setActiveLookupNodeId] = useState(null);

  const getSuggestedConnections = (itemTitle) => {
    const suggestions = [];
    const titleLower = itemTitle.toLowerCase();
    nodes.forEach(node => {
      if (node.title && node.title.length > 3) {
        const nodeTitleLower = node.title.toLowerCase();
        // Regex word boundary matching to ensure precise tagging (e.g. "Germany" matches "Germany")
        const regex = new RegExp(`\\b${nodeTitleLower.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
        if (regex.test(titleLower)) {
          suggestions.push(node.id);
        }
      }
    });
    return [...new Set(suggestions)];
  };

  const handleLookupSearch = (itemId, searchVal) => {
    setLookups(prev => ({ ...prev, [itemId]: searchVal }));
    if (searchVal.trim().length >= 2) {
      const filtered = nodes.filter(n => n.title.toLowerCase().includes(searchVal.toLowerCase()) && n.id !== scanningNode?.id);
      setLookupResults(filtered.slice(0, 5));
    } else {
      setLookupResults([]);
    }
  };

  const handleAddConnection = (itemId, connId) => {
    setDiscoveredItems(prev => prev.map(it => {
      if (it.id === itemId) {
        const currentConns = it.connections || [];
        if (currentConns.includes(connId)) return it;
        return { ...it, connections: [...currentConns, connId] };
      }
      return it;
    }));
    setLookups(prev => ({ ...prev, [itemId]: '' }));
    setLookupResults([]);
    setActiveLookupNodeId(null);
  };

  const handleRemoveConnection = (itemId, connId) => {
    setDiscoveredItems(prev => prev.map(it => {
      if (it.id === itemId) {
        return { ...it, connections: (it.connections || []).filter(c => c !== connId) };
      }
      return it;
    }));
  };

  const saveUrls = (newUrls) => {
    setUrls(newUrls);
    localStorage.setItem('hive_graph_node_urls', JSON.stringify(newUrls));
  };

  const handleSaveSingleUrl = (nodeId, val) => {
    saveUrls({ ...urls, [nodeId]: val });
  };

  const getNavApiUrl = (baseUrl) => {
    if (!baseUrl) return '';
    let base = baseUrl.trim();
    if (base.endsWith('/')) {
      base = base.slice(0, -1);
    }
    return `${base}/_api/navigation/MenuState?$format=json`;
  };

  const parseNavigationXML = (xmlText) => {
    if (!xmlText) return [];
    
    // Check if user pasted JSON
    const trimmed = xmlText.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const json = JSON.parse(xmlText);
        const items = [];
        const traverse = (obj) => {
          if (!obj) return;
          if (Array.isArray(obj)) {
            obj.forEach(traverse);
          } else if (typeof obj === 'object') {
            const title = obj.Title || obj.title || obj.Label || obj.label || obj.Text || obj.text;
            const url = obj.Url || obj.url || obj.Href || obj.href || obj.SimpleUrl || obj.simpleUrl;
            if (title && title.trim()) {
              items.push({ title: title.trim(), url: (url || '').trim() });
            }
            Object.values(obj).forEach(val => {
              if (typeof val === 'object' && val !== null) {
                traverse(val);
              }
            });
          }
        };
        traverse(json);
        
        // Clean and filter duplicates
        const uniqueItems = [];
        const seen = new Set();
        items.forEach(it => {
          const cleanTitle = it.title.replace(/[\r\n\t]+/g, ' ').trim();
          const cleanUrl = it.url.replace(/[\r\n\t]+/g, '').trim();
          const key = `${cleanTitle.toLowerCase()}||${cleanUrl.toLowerCase()}`;
          if (!seen.has(key) && cleanTitle && cleanTitle.length > 1) {
            seen.add(key);
            uniqueItems.push({
              title: cleanTitle,
              url: cleanUrl
            });
          }
        });
        return uniqueItems;
      } catch (err) {
        console.warn("Pasted content looked like JSON but failed to parse, falling back to XML:", err);
      }
    }

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    const items = [];

    // Strategy 1: Look for <MenuNode> or similar nodes with Title and Url attributes
    const menuNodes = xmlDoc.querySelectorAll("MenuNode, Node, MenuItem, NavigationNode, link");
    menuNodes.forEach(node => {
      const title = node.getAttribute("Title") || 
                    node.getAttribute("title") || 
                    node.getAttribute("Label") || 
                    node.getAttribute("label") ||
                    node.getAttribute("Text") ||
                    node.getAttribute("text");
      const url = node.getAttribute("Url") || 
                  node.getAttribute("url") || 
                  node.getAttribute("Href") || 
                  node.getAttribute("href");
      if (title && title.trim()) {
        items.push({ title: title.trim(), url: (url || '').trim() });
      }
    });

    // Strategy 2: Look for elements with child elements (like XML tags <Title> and <Url>)
    const tags = xmlDoc.querySelectorAll("Entry, entry, Member, member, Properties, properties, element, d\\:element");
    tags.forEach(entry => {
      const titleEl = entry.querySelector("Title, title, Label, label, Text, text, d\\:Title, d\\:title, m\\:Title, m\\:title");
      const urlEl = entry.querySelector("Url, url, Href, href, Link, link, SimpleUrl, simpleurl, d\\:Url, d\\:url, d\\:Href, d\\:href, d\\:SimpleUrl, d\\:simpleurl");
      if (titleEl) {
        const title = titleEl.textContent?.trim();
        const url = urlEl ? urlEl.textContent?.trim() : '';
        if (title && title !== 'Recent') {
          items.push({ title, url });
        }
      }
    });

    // Strategy 3: Regular expression fallback for dirty parsing
    const matches = [...xmlText.matchAll(/(?:Title|title|Label|label|Text|text)="([^"]+)"[^>]+(?:Url|url|Href|href)="([^"]+)"/g)];
    matches.forEach(m => {
      items.push({ title: m[1].trim(), url: m[2].trim() });
    });
    
    const reverseMatches = [...xmlText.matchAll(/(?:Url|url|Href|href)="([^"]+)"[^>]+(?:Title|title|Label|label|Text|text)="([^"]+)"/g)];
    reverseMatches.forEach(m => {
      items.push({ title: m[2].trim(), url: m[1].trim() });
    });

    // Strategy 4: Direct regex matching for child tags inside element blocks (bypasses DOM query namespace issues)
    const elementBlocks = xmlText.split(/<element>|<d:element>/i);
    elementBlocks.forEach(block => {
      const titleMatch = block.match(/<(?:d:)?Title[^>]*>([^<]+)<\/(?:d:)?Title>/i);
      const urlMatch = block.match(/<(?:d:)?(?:SimpleUrl|Url|Href)[^>]*>([^<]+)<\/(?:d:)?(?:SimpleUrl|Url|Href)>/i);
      if (titleMatch) {
        const title = titleMatch[1].trim();
        const url = urlMatch ? urlMatch[1].trim() : '';
        if (title && title !== 'Recent') {
          items.push({ title, url });
        }
      }
    });

    // Clean and filter duplicates
    const uniqueItems = [];
    const seen = new Set();
    items.forEach(it => {
      const cleanTitle = it.title.replace(/[\r\n\t]+/g, ' ').trim();
      const cleanUrl = it.url.replace(/[\r\n\t]+/g, '').trim();
      const key = `${cleanTitle.toLowerCase()}||${cleanUrl.toLowerCase()}`;
      if (!seen.has(key) && cleanTitle && cleanTitle.length > 1) {
        seen.add(key);
        uniqueItems.push({
          title: cleanTitle,
          url: cleanUrl
        });
      }
    });

    return uniqueItems;
  };

  const handleScan = (node) => {
    const url = urls[node.id];
    if (!url) return;
    setScanningNode(node);
    setShowScanModal(true);
    setLookups({});
    setLookupResults([]);
    setActiveLookupNodeId(null);
    setScanSource('xml');
    setXmlTab('raw');
    
    // Load preserved XML from localStorage
    const savedXml = localStorage.getItem('hive_nav_xml_' + node.id) || '';
    setXmlText(savedXml);
    
    if (savedXml.trim()) {
      const parsed = parseNavigationXML(savedXml);
      if (parsed.length > 0) {
        setDiscoveredItems(parsed.map((it, idx) => ({
          ...it,
          url: getAbsoluteUrl(it.url),
          id: `discovered_${idx}`,
          checked: true,
          connections: getSuggestedConnections(it.title),
          type: 'CONCEPT'
        })));
        setIsEditingXml(false); // Show the checklist directly since we have data
        return;
      }
    }
    
    setDiscoveredItems([]);
    setIsEditingXml(true); // Open the XML paste area by default
  };

  const handleProcessXML = () => {
    if (!xmlText.trim()) return;
    setIsScanning(true);
    
    // Preserve in session
    localStorage.setItem('hive_nav_xml_' + scanningNode.id, xmlText);

    setTimeout(() => {
      const parsed = parseNavigationXML(xmlText);
      if (parsed.length > 0) {
        setDiscoveredItems(parsed.map((it, idx) => ({
          ...it,
          url: getAbsoluteUrl(it.url),
          id: `discovered_${idx}`,
          checked: true,
          connections: getSuggestedConnections(it.title),
          type: 'CONCEPT'
        })));
        setIsEditingXml(false);
      } else {
        alert("No navigation nodes could be parsed from the XML. Please make sure it contains valid XML elements with Title and Url values.");
      }
      setIsScanning(false);
    }, 400);
  };

  const handleToggleDiscoveredItem = (itemId) => {
    setDiscoveredItems(prev => prev.map(it => it.id === itemId ? { ...it, checked: !it.checked } : it));
  };

  const handleDiscoveredItemTypeChange = (itemId, type) => {
    setDiscoveredItems(prev => prev.map(it => it.id === itemId ? { ...it, type } : it));
  };

  const handleImportScannedItems = () => {
    const selected = discoveredItems.filter(item => item.checked);
    if (selected.length === 0 || !scanningNode) {
      setShowScanModal(false);
      return;
    }

    const newNodes = selected.map(item => {
      const uniqueId = `node_scanned_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      return {
        id: uniqueId,
        parentId: scanningNode.id,
        title: item.title,
        type: item.type,
        visible: true,
        x: (scanningNode.x || 1000) + (Math.random() * 200 - 100),
        y: (scanningNode.y || 500) + 150 + (Math.random() * 50 - 25),
        content: {},
        secondaryLinks: item.connections || []
      };
    });

    const newUrls = { ...urls };
    newNodes.forEach((node, idx) => {
      newUrls[node.id] = getAbsoluteUrl(selected[idx].url);
    });
    saveUrls(newUrls);

    if (onUpdateNodes) {
      onUpdateNodes(prev => [...prev, ...newNodes]);
    }

    setShowScanModal(false);
  };

  const syncNode = async (node) => {
    const url = urls[node.id];
    if (!url) return;

    setIsSyncing(node.id);
    try {
      const absoluteUrl = getAbsoluteUrl(url);
      const response = await fetch('/api/graph/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: absoluteUrl,
          nodeTitle: node.title,
          nodeType: node.type
        })
      });

      if (!response.ok) {
        throw new Error(`Sync failed with status: ${response.status}`);
      }

      const data = await response.json();
      const scrapedText = data.content;

      const schemaFields = SCHEMAS[node.type] || [];
      const fieldsList = schemaFields.map(f => f.name);
      const firstField = fieldsList[0] || 'Definition Summary';

      const decomposedContent = {
        [firstField]: scrapedText
      };

      if (onReviewSync) {
        onReviewSync(node, decomposedContent);
      }
    } catch (err) {
      console.error('[SyncNode] ERROR:', err);
    } finally {
      setIsSyncing(null);
    }
  };

  // Filter visible nodes that match the search (by title or mapped URL)
  const visibleNodes = nodes.filter(n => n.visible !== false);
  const rootNodes = visibleNodes.filter(n => !n.parentId);

  // If searching, we flatten the matched list. Otherwise, we show the indented tree.
  const isSearching = search.trim().length > 0;
  const filteredFlattenedNodes = isSearching
    ? visibleNodes.filter(n => n.title.toLowerCase().includes(search.toLowerCase()) || (urls[n.id] && urls[n.id].toLowerCase().includes(search.toLowerCase())))
    : [];

  return (
    <>
      {/* Compact toolbar strip — matches Hierarchy tab search bar style */}
      <div className="-mx-6 -mt-6 px-6 py-3 border-b border-[var(--glass-border)] bg-[var(--bg-elevated)]/10 flex items-center justify-between gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            className="w-full bg-[var(--bg-elevated)] border border-[var(--glass-border)] rounded-lg py-2 pl-9 pr-3 text-xs focus:border-[var(--accent-cyan)]/40 outline-none transition-all placeholder:text-[var(--text-muted)] text-[var(--text-primary)]"
            placeholder="Search node or URL..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="text-[11px] font-medium text-[var(--text-secondary)] px-2.5 py-1.5 bg-[var(--bg-tertiary)] border border-[var(--glass-border)] rounded-lg flex items-center gap-1.5 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-indigo)] shadow-[0_0_8px_var(--accent-indigo)]" />
          <span>{visibleNodes.length} Mapped Nodes</span>
        </span>
      </div>

      <div className="space-y-8 pb-32">
       {/* Instruction Banner */}
       <div className="p-5 bg-[var(--accent-indigo)]/10 border border-[var(--accent-indigo)]/20 rounded-2xl flex items-start gap-4">
          <Database size={18} className="text-[var(--accent-indigo)] shrink-0 mt-0.5" />
          <div className="space-y-1">
             <div className="flex items-center gap-2 text-[var(--accent-indigo)]">
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Hierarchical Authority Mapping</span>
             </div>
             <p className="text-[10px] text-[var(--text-muted)] italic leading-relaxed">
                Map nodes to their SharePoint URLs. Use <strong>Scan Nav</strong> to discover sub-navigation links from target sites and import them into the graph.
             </p>
          </div>
       </div>

       {/* Node URL list or tree */}
       <div className="space-y-3">
          {isSearching ? (
             filteredFlattenedNodes.slice(0, 20).map(node => (
                <div key={node.id} className="p-5 bg-[var(--bg-secondary)] border border-[var(--glass-border)] rounded-2xl hover:border-[var(--accent-indigo)]/30 transition-all flex flex-col gap-4 group shadow-sm">
                   <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                         <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ENTITY_TYPES[node.type]?.color }} />
                         <span className="text-[11px] font-black text-[var(--text-primary)] uppercase tracking-wider group-hover:text-[var(--accent-indigo)] transition-colors">{node.title}</span>
                      </div>
                   </div>

                   <div className="flex flex-col gap-2">
                      {urls[node.id] && !urls[node.id].startsWith('http') && (
                        <div className="flex items-center gap-1.5 text-[9px] text-[var(--accent-cyan)] font-mono px-3">
                           <Globe size={8} />
                           <span>Absolute: {getAbsoluteUrl(urls[node.id])}</span>
                        </div>
                      )}
                      <div className="relative w-full flex items-center gap-2">
                         <div className="relative flex-1">
                           <Globe size={12} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                           <input 
                              className="w-full bg-[var(--bg-primary)] border border-[var(--glass-border)] rounded-xl py-3.5 pl-10 pr-4 text-[10px] text-[var(--text-secondary)] outline-none focus:border-[var(--accent-indigo)]/40 transition-all font-mono"
                              placeholder="Mapping URL..."
                              value={urls[node.id] || ''}
                              onChange={(e) => handleSaveSingleUrl(node.id, e.target.value)}
                           />
                         </div>
                         <div className="flex items-center gap-1.5">
                            {urls[node.id] && (
                              <a 
                                href={getAbsoluteUrl(urls[node.id])}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="py-2 px-3 rounded-lg bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)] hover:bg-[var(--accent-indigo)] hover:text-white transition-all text-[9px] font-black uppercase tracking-wider flex items-center gap-1 border-none cursor-pointer no-underline"
                              >
                                 <Globe size={10} />
                                 <span>Open</span>
                              </a>
                            )}
                            <button 
                              onClick={() => syncNode(node)}
                              disabled={isSyncing === node.id || !urls[node.id]}
                              className={`py-2 px-3 rounded-lg flex items-center gap-1 transition-all border-none cursor-pointer text-[9px] font-black uppercase tracking-wider ${isSyncing === node.id ? 'bg-[var(--accent-indigo)]/25 text-[var(--accent-indigo)] animate-pulse' : 'bg-[var(--accent-indigo)]/10 text-[var(--text-secondary)] hover:bg-[var(--accent-indigo)] hover:text-white'}`}
                            >
                              {isSyncing === node.id ? <RefreshCw size={10} className="animate-spin" /> : <Zap size={10} />}
                              <span>Sync</span>
                            </button>
                            <button 
                              onClick={() => handleScan(node)}
                              disabled={!urls[node.id]}
                              className="py-2 px-3 rounded-lg bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)] hover:text-white transition-all border-none cursor-pointer text-[9px] font-black uppercase tracking-wider flex items-center gap-1"
                            >
                              <Search size={10} />
                              <span>Scan Nav</span>
                            </button>
                         </div>
                      </div>
                   </div>
                </div>
             ))
          ) : (
             rootNodes.map(root => (
                <MapperTreeItem 
                  key={root.id} 
                  node={root} 
                  nodes={visibleNodes} 
                  urls={urls} 
                  onSaveUrls={handleSaveSingleUrl} 
                  onSync={syncNode} 
                  onScan={handleScan}
                  isSyncing={isSyncing}
                />
             ))
          )}
          
          {isSearching && filteredFlattenedNodes.length > 20 && (
            <p className="text-center text-[9px] text-[var(--text-muted)] uppercase font-black tracking-widest pt-4 opacity-50">Refine search for remaining {filteredFlattenedNodes.length - 20} nodes</p>
          )}
       </div>

       {/* Scan Sub-site Navigation Approval Modal */}
       <AnimatePresence>
         {showScanModal && scanningNode && (
           <div className="fixed inset-0 z-[80000] flex items-center justify-center p-6">
              <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={() => setShowScanModal(false)} />
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }} 
                exit={{ scale: 0.95, opacity: 0 }}
                className="relative w-full max-w-xl max-h-[70vh] rounded-3xl border border-[var(--glass-border)] bg-[var(--bg-secondary)] backdrop-blur-3xl shadow-2xl z-10 flex flex-col overflow-hidden text-[var(--text-primary)]"
              >
                  {/* Modal Header */}
                  <div className="p-6 border-b border-[var(--glass-border)] flex justify-between items-center bg-[var(--bg-elevated)]/30">
                     <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                           <span className="text-[9px] font-black uppercase tracking-widest text-[var(--accent-cyan)]">Scan Sub-Site Navigation</span>
                           <span className="px-2 py-0.5 text-[7px] font-extrabold uppercase rounded bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/20" title="Scraped via user XML paste">XML Parser</span>
                        </div>
                        <h3 className="text-sm font-bold truncate max-w-[320px] text-[var(--text-primary)]">Discovered in: {scanningNode.title}</h3>
                     </div>
                     <button 
                       onClick={() => setShowScanModal(false)}
                       className="p-1 text-[var(--text-muted)] hover:text-white transition-colors border-none bg-transparent cursor-pointer text-xs font-black uppercase tracking-widest"
                     >
                       Close
                     </button>
                  </div>

                  {/* Discovered Items List / XML Paste box */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                     {isScanning ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                           <RefreshCw size={24} className="animate-spin text-[var(--accent-cyan)]" />
                           <span className="text-[10px] uppercase font-black tracking-widest text-[var(--text-muted)]">Parsing XML data...</span>
                        </div>
                     ) : isEditingXml ? (
                        <div className="flex flex-col gap-4">
                           <div className="flex justify-between items-start gap-4">
                              <p className="text-[10px] text-[var(--text-muted)] leading-relaxed italic">
                                Paste the SharePoint navigation XML response here. The system will parse it and let you choose which nodes to import.
                              </p>
                              
                              <div className="flex gap-2 shrink-0">
                                 <a
                                   href="https://turntown.sharepoint.com"
                                   target="_blank"
                                   rel="noopener noreferrer"
                                   className="px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-white text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap no-underline flex items-center justify-center"
                                   title="Authenticate at root SharePoint site if not logged in"
                                 >
                                   <span>1. Login SP</span>
                                 </a>
                                 <button
                                   onClick={() => {
                                     const navUrl = getNavApiUrl(urls[scanningNode.id]);
                                     if (navUrl) {
                                       window.open(navUrl, '_blank');
                                     }
                                   }}
                                   className="px-3 py-1.5 rounded-lg bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)] hover:bg-[var(--accent-indigo)] hover:text-white border border-[var(--accent-indigo)]/20 text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap"
                                   title="Open navigation menustate API in a new browser tab to view XML"
                                 >
                                   <span>2. Get XML API</span>
                                 </button>
                              </div>
                           </div>
                           {/* Tab Bar */}
                           <div className="flex gap-2 border-b border-[var(--glass-border)] pb-2 mb-2">
                              <button 
                                onClick={() => setXmlTab('raw')}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border cursor-pointer ${xmlTab === 'raw' ? 'bg-[var(--accent-cyan)]/25 border-[var(--accent-cyan)] text-[var(--accent-cyan)]' : 'bg-transparent border-transparent text-[var(--text-muted)] hover:text-white'}`}
                              >
                                RAW Input
                              </button>
                              <button 
                                onClick={() => setXmlTab('tree')}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border cursor-pointer ${xmlTab === 'tree' ? 'bg-[var(--accent-cyan)]/25 border-[var(--accent-cyan)] text-[var(--accent-cyan)]' : 'bg-transparent border-transparent text-[var(--text-muted)] hover:text-white'}`}
                              >
                                Preview Cleaned Tree
                              </button>
                           </div>

                           {xmlTab === 'raw' ? (
                              <textarea
                                value={xmlText}
                                onChange={(e) => {
                                  setXmlText(e.target.value);
                                  localStorage.setItem('hive_nav_xml_' + scanningNode.id, e.target.value);
                                }}
                                placeholder="Paste your SharePoint navigation XML here..."
                                className="w-full h-72 p-4 rounded-xl border border-gray-300 bg-white text-black font-mono text-[10px] leading-relaxed resize-none outline-none focus:border-[var(--accent-cyan)] transition-all placeholder:text-gray-400"
                                spellCheck={false}
                              />
                           ) : (() => {
                              const parsed = parseNavigationXML(xmlText);
                              if (parsed.length === 0) {
                                 return (
                                    <div className="w-full h-72 rounded-xl border border-gray-300 bg-white text-gray-500 font-mono text-[10px] flex items-center justify-center p-6 italic">
                                       No navigation nodes parsed. Please paste raw XML or JSON menu state first in RAW Input tab.
                                    </div>
                                 );
                              }
                              return (
                                 <div className="w-full h-72 p-4 rounded-xl border border-gray-300 bg-white text-black font-mono text-[10px] overflow-y-auto space-y-1">
                                    <div className="text-[9px] font-black text-gray-400 uppercase tracking-wider pb-2 border-b border-gray-100 mb-2 flex justify-between">
                                       <span>Parsed Navigation Tree ({parsed.length} items)</span>
                                       <span className="text-[8px] text-[var(--accent-cyan)] uppercase font-extrabold tracking-widest">Real-Time Parse</span>
                                    </div>
                                    {parsed.map((item, idx) => (
                                       <div key={idx} className="flex items-start gap-1.5 py-0.5 hover:bg-gray-50 transition-colors">
                                          <span className="text-gray-400 select-none font-bold">↳</span>
                                          <div className="flex flex-col min-w-0">
                                             <span className="font-bold text-gray-800">{item.title}</span>
                                             <span className="text-[8px] text-gray-400 truncate max-w-[420px]">{item.url || 'No URL specified (Structural Header)'}</span>
                                          </div>
                                       </div>
                                    ))}
                                 </div>
                              );
                           })()}
                        </div>
                     ) : (
                        <>
                           <div className="flex justify-between items-center border-b border-[var(--glass-border)] pb-3">
                              <p className="text-[10px] text-[var(--text-muted)] leading-relaxed italic">
                                 Select the menu links from the parsed XML that you wish to register as children of **{scanningNode.title}**:
                              </p>
                              <button
                                onClick={() => setIsEditingXml(true)}
                                className="px-2.5 py-1 text-[8px] font-bold uppercase tracking-wider rounded bg-[var(--glass-border)] text-[var(--text-secondary)] hover:text-white transition-all cursor-pointer"
                              >
                                Edit XML
                              </button>
                           </div>
                           <div className="space-y-2">
                              {discoveredItems.map(item => (
                                  <div key={item.id} className="p-4 bg-[var(--bg-primary)] border border-[var(--glass-border)] rounded-xl hover:border-[var(--accent-cyan)]/30 transition-all flex flex-col gap-3">
                                     <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3 min-w-0">
                                           <input 
                                             type="checkbox" 
                                             checked={item.checked} 
                                             onChange={() => handleToggleDiscoveredItem(item.id)}
                                             className="w-4 h-4 rounded border-[var(--glass-border)] bg-[var(--bg-secondary)] text-[var(--accent-cyan)] focus:ring-0 cursor-pointer"
                                           />
                                           <div className="flex flex-col min-w-0">
                                              <span className="text-[11px] font-bold text-[var(--text-primary)] truncate">{item.title}</span>
                                              <span className="text-[9px] font-mono text-[var(--text-muted)] truncate">{getAbsoluteUrl(item.url)}</span>
                                           </div>
                                        </div>

                                        {/* Type selector */}
                                        <select 
                                          value={item.type}
                                          onChange={(e) => handleDiscoveredItemTypeChange(item.id, e.target.value)}
                                          className="bg-[var(--bg-secondary)] border border-[var(--glass-border)] rounded-md text-[9px] px-1.5 py-1 font-bold uppercase tracking-wider text-[var(--text-secondary)] outline-none cursor-pointer shrink-0"
                                        >
                                          {Object.keys(ENTITY_TYPES).map(t => (
                                            <option key={t} value={t}>{ENTITY_TYPES[t]?.label || t}</option>
                                          ))}
                                        </select>
                                     </div>

                                     {/* Connections & Predictive Tagging Section */}
                                     <div className="border-t border-[var(--glass-border)]/50 pt-2 flex flex-col gap-1.5">
                                        <span className="text-[8px] font-black uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1">
                                           <Zap size={8} className="text-[var(--accent-indigo)]" />
                                           <span>Graph Connections</span>
                                        </span>
                                        <div className="flex flex-wrap gap-1.5 items-center">
                                           {item.connections?.map(connId => {
                                              const connNode = nodes.find(n => n.id === connId);
                                              return (
                                                 <span key={connId} className="px-2 py-0.5 rounded bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)] text-[8px] font-black uppercase flex items-center gap-1 border border-[var(--accent-indigo)]/20 shadow-sm">
                                                    <span>{connNode?.title || connId}</span>
                                                    <button 
                                                      onClick={() => handleRemoveConnection(item.id, connId)}
                                                      className="bg-transparent border-none text-[var(--accent-indigo)] hover:text-red-500 cursor-pointer text-[9px] font-black p-0 flex items-center justify-center leading-none"
                                                    >
                                                       ×
                                                    </button>
                                                 </span>
                                              );
                                           })}
                                           
                                           {/* lookup input */}
                                           <div className="relative">
                                              <input 
                                                type="text" 
                                                placeholder="Link entity..." 
                                                value={lookups[item.id] || ''}
                                                onFocus={() => setActiveLookupNodeId(item.id)}
                                                onChange={(e) => handleLookupSearch(item.id, e.target.value)}
                                                className="bg-[var(--bg-secondary)] border border-[var(--glass-border)] rounded-md text-[8px] px-1.5 py-0.5 outline-none placeholder:text-[var(--text-muted)] w-24 focus:w-36 transition-all font-bold text-[var(--text-primary)]"
                                              />
                                              {activeLookupNodeId === item.id && lookupResults.length > 0 && (
                                                 <div className="absolute left-0 bottom-full mb-1 bg-[var(--bg-secondary)] border border-[var(--glass-border)] rounded-xl shadow-2xl z-[90000] py-1 w-44 max-h-28 overflow-y-auto text-[8px] font-bold">
                                                    {lookupResults.map(matchedNode => (
                                                       <div 
                                                         key={matchedNode.id} 
                                                         onClick={() => handleAddConnection(item.id, matchedNode.id)}
                                                         className="px-2.5 py-1.5 hover:bg-[var(--accent-indigo)] hover:text-white cursor-pointer transition-colors truncate text-[var(--text-primary)] border-b border-[var(--glass-border)]/20 last:border-0"
                                                       >
                                                          {matchedNode.title}
                                                       </div>
                                                    ))}
                                                 </div>
                                              )}
                                           </div>
                                        </div>
                                     </div>
                                  </div>
                              ))}
                           </div>
                        </>
                     )}
                  </div>

                  {/* Modal Footer Actions */}
                  <div className="p-6 border-t border-[var(--glass-border)] bg-[var(--bg-elevated)]/30 flex items-center justify-end gap-3">
                     <button 
                       onClick={() => setShowScanModal(false)}
                       className="px-4 py-2.5 rounded-xl border border-[var(--glass-border)] bg-[var(--bg-primary)] text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] hover:text-white transition-all cursor-pointer"
                     >
                       Cancel
                     </button>
                     
                     {isEditingXml ? (
                        <button 
                          onClick={handleProcessXML}
                          disabled={!xmlText.trim()}
                          className={`px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-lg flex items-center gap-1.5 transition-all border-none cursor-pointer ${xmlText.trim() ? 'bg-[var(--accent-cyan)] text-white hover:bg-[var(--accent-cyan)]/80' : 'bg-[var(--glass-border)] text-[var(--text-muted)]/30'}`}
                        >
                          <Search size={12} />
                          <span>Scan XML</span>
                        </button>
                     ) : (
                        <button 
                          onClick={handleImportScannedItems}
                          disabled={discoveredItems.filter(i => i.checked).length === 0}
                          className={`px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-lg flex items-center gap-1.5 transition-all border-none cursor-pointer ${discoveredItems.filter(i => i.checked).length > 0 ? 'bg-[var(--accent-cyan)] text-white hover:bg-[var(--accent-cyan)]/80' : 'bg-[var(--glass-border)] text-[var(--text-muted)]/30'}`}
                        >
                          <Plus size={12} />
                          <span>Import Links</span>
                        </button>
                     )}
                  </div>
              </motion.div>
           </div>
         )}
       </AnimatePresence>
    </div>
    </>
  );
}
