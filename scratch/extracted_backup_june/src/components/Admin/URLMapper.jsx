import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link as LinkIcon, Search, Globe, RefreshCw, Check, CheckCircle2, ChevronRight, Activity, Zap, Info, Database } from 'lucide-react';
import { ENTITY_TYPES, SCHEMAS } from '../../data/nodes';

const AUTHORITATIVE_TT_MAP = {
  'tt_group': 'https://www.turnerandtownsend.com/',
  'reg_root': 'https://www.turnerandtownsend.com/locations/',
  'seg_inf': 'https://www.turnerandtownsend.com/sectors/',
  'seg_re': 'https://www.turnerandtownsend.com/sectors/',
  'cap_root': 'https://www.turnerandtownsend.com/solutions/',
  'srv_pm': 'https://www.turnerandtownsend.com/solutions/project-management/',
  'srv_ccm': 'https://www.turnerandtownsend.com/solutions/cost-and-commercial-management/',
  'srv_pa': 'https://www.turnerandtownsend.com/solutions/programme-advisory/',
  'srv_psc': 'https://www.turnerandtownsend.com/solutions/procurement-and-supply-chain/',
  'srv_dig': 'https://www.turnerandtownsend.com/solutions/digital/',
  'srv_sus': 'https://www.turnerandtownsend.com/solutions/sustainability/',
  'srv_am': 'https://www.turnerandtownsend.com/solutions/asset-and-building-consultancy/',
  'srv_bc': 'https://www.turnerandtownsend.com/solutions/asset-and-building-consultancy/',
  'srv_cm': 'https://www.turnerandtownsend.com/solutions/construction-management/',
  'inf_tra': 'https://www.turnerandtownsend.com/sectors/transport/',
  're_comm': 'https://www.turnerandtownsend.com/sectors/commercial-development/',
  're_dc': 'https://www.turnerandtownsend.com/sectors/data-centres/',
  're_edu': 'https://www.turnerandtownsend.com/sectors/education/',
  're_health': 'https://www.turnerandtownsend.com/sectors/healthcare/',
  're_ls': 'https://www.turnerandtownsend.com/sectors/life-sciences/',
  'enr_clean': 'https://www.turnerandtownsend.com/sectors/clean-energy/',
  'inf_def': 'https://www.turnerandtownsend.com/sectors/defence-and-security/',
  'inf_ports': 'https://www.turnerandtownsend.com/sectors/ports-and-marine/',
  'inf_water': 'https://www.turnerandtownsend.com/sectors/water/',
  'inf_highways': 'https://www.turnerandtownsend.com/sectors/roads-and-highways/',
  'enr_mining': 'https://www.turnerandtownsend.com/sectors/mining-and-metals/',
  'enr_td': 'https://www.turnerandtownsend.com/sectors/power-transmission-and-distribution/',
  're_sports': 'https://www.turnerandtownsend.com/sectors/sports-and-venues/',
  're_tall': 'https://www.turnerandtownsend.com/sectors/tall-buildings/',
  're_corp': 'https://www.turnerandtownsend.com/sectors/corporate-occupier/',
  're_retail': 'https://www.turnerandtownsend.com/sectors/retail/'
};

export function URLMapper({ nodes, onReviewSync }) {
  const [search, setSearch] = useState('');
  const [urls, setUrls] = useState(() => {
    const saved = localStorage.getItem('hive_mesh_node_urls');
    // Pre-seed with authoritative map if no user data exists
    return saved ? JSON.parse(saved) : AUTHORITATIVE_TT_MAP;
  });
  const [isSyncing, setIsSyncing] = useState(null); // nodeId

  const saveUrls = (newUrls) => {
    setUrls(newUrls);
    localStorage.setItem('hive_mesh_node_urls', JSON.stringify(newUrls));
  };

  const syncNode = async (node) => {
    const url = urls[node.id];
    if (!url) return;

    setIsSyncing(node.id);
    try {
      // 1. Fetch raw text scraping from the authoritative URL resource
      const response = await fetch('/api/graph/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url,
          nodeTitle: node.title,
          nodeType: node.type
        })
      });

      if (!response.ok) {
        throw new Error(`Sync failed with status: ${response.status}`);
      }

      const data = await response.json();
      const scrapedText = data.content;

      // 2. Perform AI Decomposition & Refinement based on target node type's schema fields and existing content
      const schemaFields = SCHEMAS[node.type] || [];
      const fieldsList = schemaFields.map(f => f.name);
      const existingContent = node.content || {};

      const aiPrompt = `You are a structured data integration and refinement assistant for the HIVE:MESH graph.
We have just scraped new content from a web page:
URL: ${url}

Scraped Content:
${scrapedText}

The node currently has the following existing structured content in its schema fields:
${JSON.stringify(existingContent, null, 2)}

Your task is to merge, refine, and improve the existing content using the newly scraped content.
Specifically:
1. Review the existing text and the new scraped text to merge them into a single comprehensive set of fields.
2. Preserve and improve all valid existing information. Do not drop key facts or user edits already present.
3. Integrate the new details from the scraped content seamlessly into the appropriate schema fields.
4. The exact schema fields to output are: ${JSON.stringify(fieldsList)}.
5. Keep the source formatting as much as possible (e.g., bold text, bullet points, headers, numbered lists).
6. Output ONLY a valid JSON object mapping each schema field name to its corresponding merged and improved text. Do not add any conversational prefaces or explanations.`;

      const aiResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: aiPrompt,
          model: 'flash',
          appMode: 'general'
        })
      });

      if (!aiResponse.ok) {
        throw new Error(`AI Decomposition failed: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      const aiResponseText = aiData.response;

      // 3. Parse decomposed fields with safe JSON matching
      let decomposedContent = {};
      try {
        const jsonMatch = aiResponseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          decomposedContent = JSON.parse(jsonMatch[0]);
        } else {
          decomposedContent = JSON.parse(aiResponseText);
        }
      } catch (e) {
        console.error("Failed to parse AI JSON response, falling back to raw distribution", e);
        if (fieldsList.length > 0) {
          decomposedContent[fieldsList[0]] = scrapedText;
        }
      }

      // Add the source URL indicator to the first field for transparency
      const firstField = fieldsList[0] || 'Definition Summary';
      if (decomposedContent[firstField]) {
        decomposedContent[firstField] = `[SYNCED INTEL FROM ${url}]\n\n` + decomposedContent[firstField];
      }

      // 4. Open the review drawer with pre-seeded decomposed fields
      if (onReviewSync) {
        onReviewSync(node, decomposedContent);
      }
    } catch (err) {
      console.error('[SyncNode] ERROR:', err);
    } finally {
      setIsSyncing(null);
    }
  };

  const filteredNodes = nodes.filter(n => n.title.toLowerCase().includes(search.toLowerCase()) || nodeMatchesUrl(n));

  function nodeMatchesUrl(n) {
      if (!urls[n.id]) return false;
      return urls[n.id].toLowerCase().includes(search.toLowerCase());
  }

  return (
    <div className="space-y-8 pb-32">
       {/* Instruction Banner */}
       <div className="p-5 bg-[var(--accent-indigo)]/10 border border-[var(--accent-indigo)]/20 rounded-2xl flex items-start gap-4">
          <Database size={18} className="text-[var(--accent-indigo)] shrink-0 mt-0.5" />
          <div className="space-y-1">
             <div className="flex items-center gap-2 text-[var(--accent-indigo)]">
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Automated Authority Mapping</span>
             </div>
             <p className="text-[10px] text-[var(--text-muted)] italic leading-relaxed">
                I have automatically extracted the URLs from the Turner & Townsend navigation structure. Click **Sync** on any node to populate the workspace with live intelligence.
             </p>
          </div>
       </div>

       {/* Search Bar */}
       <div className="relative">
          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input 
             className="w-full bg-[var(--bg-primary)] border border-[var(--glass-border)] rounded-xl py-4 pl-12 pr-4 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-indigo)]/40 transition-all font-mono shadow-inner"
             placeholder="Search node or URL..."
             value={search}
             onChange={(e) => setSearch(e.target.value)}
          />
       </div>

       {/* Node URL List */}
       <div className="space-y-3">
          {filteredNodes.slice(0, 20).map(node => (
             <div key={node.id} className="p-5 bg-[var(--bg-secondary)] border border-[var(--glass-border)] rounded-2xl hover:border-[var(--accent-indigo)]/30 transition-all flex flex-col gap-4 group shadow-sm">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ENTITY_TYPES[node.type]?.color }} />
                      <span className="text-[11px] font-black text-[var(--text-primary)] uppercase tracking-wider group-hover:text-[var(--accent-indigo)] transition-colors">{node.title}</span>
                   </div>
                </div>

                <div className="relative w-full flex items-center">
                   <Globe size={12} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                   <input 
                      className="w-full bg-[var(--bg-primary)] border border-[var(--glass-border)] rounded-xl py-3.5 pl-10 pr-24 text-[10px] text-[var(--text-secondary)] outline-none focus:border-[var(--accent-indigo)]/40 transition-all font-mono"
                      placeholder="Mapping URL..."
                      value={urls[node.id] || ''}
                      onChange={(e) => saveUrls({ ...urls, [node.id]: e.target.value })}
                   />
                   <button 
                     onClick={() => syncNode(node)}
                     disabled={isSyncing === node.id || !urls[node.id]}
                     className={`absolute right-1.5 top-1/2 -translate-y-1/2 py-2 px-4 rounded-lg flex items-center gap-1.5 transition-all border-none cursor-pointer ${isSyncing === node.id ? 'bg-[var(--accent-indigo)]/25 text-[var(--accent-indigo)] animate-pulse' : 'bg-[var(--accent-indigo)]/10 text-[var(--text-secondary)] hover:bg-[var(--accent-indigo)] hover:text-white hover:shadow-[var(--shadow-glow)]'}`}
                   >
                      {isSyncing === node.id ? <RefreshCw size={10} className="animate-spin" /> : <Zap size={10} />}
                      <span className="text-[9px] font-black uppercase tracking-widest">Sync</span>
                   </button>
                </div>
             </div>
          ))}
          {filteredNodes.length > 20 && (
            <p className="text-center text-[9px] text-[var(--text-muted)] uppercase font-black tracking-widest pt-4 opacity-50">Refine search for remaining {filteredNodes.length - 20} nodes</p>
          )}
       </div>
    </div>
  );
}
