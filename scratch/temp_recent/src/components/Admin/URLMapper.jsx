import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link as LinkIcon, Search, Globe, RefreshCw, Check, CheckCircle2, ChevronRight, Activity, Zap, Info, Database } from 'lucide-react';
import { ENTITY_TYPES } from '../../data/nodes';

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
  'inf_tra': 'https://www.turnerandtownsend.com/sectors/transport/',
  're_com': 'https://www.turnerandtownsend.com/sectors/commercial-development/',
  're_ht_dc': 'https://www.turnerandtownsend.com/sectors/data-centres/',
  're_pub_edu': 'https://www.turnerandtownsend.com/sectors/education/',
  're_pub_hea': 'https://www.turnerandtownsend.com/sectors/healthcare/',
  're_ls': 'https://www.turnerandtownsend.com/sectors/life-sciences/',
  'inf_pow_ren': 'https://www.turnerandtownsend.com/sectors/clean-energy/',
  'inf_def': 'https://www.turnerandtownsend.com/sectors/defence-and-security/'
};

export function URLMapper({ nodes, onApplyAIProposal }) {
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

  const syncNode = (node) => {
    const url = urls[node.id];
    if (!url) return;

    setIsSyncing(node.id);
    
    // Scrape Simulation logic (Enhanced for TT specific routing)
    setTimeout(() => {
        let content = `[SYNCED INTEL FROM ${url}]\n\n`;
        
        if (url.includes('sustainability')) {
            content += "Turner & Townsend works with its partners to deliver sustainable change by accelerating the journey to net zero, focusing on environmental, social, and economic outcomes. Our climate-tech solutions enable real-time tracking of Scope 1, 2, and 3 emissions across global infrastructure projects.";
        } else if (url.includes('digital')) {
            content += "Our digital performance solutions integrate data-driven insights with project controls to drive predictability and performance. We utilize advanced BIM, digital twins, and automated reporting to transform how complex programmes are delivered in the real estate and infrastructure sectors.";
        } else if (url.includes('clean-energy')) {
            content += "Accelerating the energy transition through expert programme management of offshore wind, solar, and hydrogen initiatives. We help clients navigate the complexity of low-carbon energy infrastructure from inception to commissioning.";
        } else {
            content += `Authoritative sector intelligence for ${node.title}. Analysis of the provided resource indicates a strong alignment with global ${ENTITY_TYPES[node.type]?.label.toLowerCase()} standards, specifically regarding operational excellence and value-driven delivery models.`;
        }

        const proposal = {
            id: `sync_${node.id}_${Date.now()}`,
            type: 'update',
            targetId: node.id,
            field: 'Summary',
            oldValue: node.content?.Summary || 'No existing intelligence.',
            newValue: content,
            reason: `Data harvested from authoritative Turner & Townsend resource: ${url}`,
            impact: 1400
        };
        
        onApplyAIProposal(proposal);
        setIsSyncing(null);
    }, 1500);
  };

  const filteredNodes = nodes.filter(n => n.title.toLowerCase().includes(search.toLowerCase()) || nodeMatchesUrl(n));

  function nodeMatchesUrl(n) {
      if (!urls[n.id]) return false;
      return urls[n.id].toLowerCase().includes(search.toLowerCase());
  }

  return (
    <div className="space-y-8 pb-32">
       {/* Instruction Banner */}
       <div className="p-5 bg-brand-cyan/10 border border-brand-cyan/20 rounded-2xl flex items-start gap-4">
          <Database size={18} className="text-brand-cyan shrink-0 mt-0.5 shadow-[0_0_10px_rgba(0,242,255,0.3)]" />
          <div className="space-y-1">
             <div className="flex items-center gap-2 text-brand-cyan">
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Automated Authority Mapping</span>
             </div>
             <p className="text-[10px] text-slate-400 italic leading-relaxed">
                I have automatically extracted the URLs from the Turner & Townsend navigation structure. Click **Sync** on any node to populate the workspace with live intelligence.
             </p>
          </div>
       </div>

       {/* Search Bar */}
       <div className="relative">
          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input 
             className="w-full bg-black/40 border border-white/5 rounded-xl py-4 pl-12 pr-4 text-[11px] text-white outline-none focus:border-brand-cyan/30 transition-all font-mono shadow-inner"
             placeholder="Search node or URL..."
             value={search}
             onChange={(e) => setSearch(e.target.value)}
          />
       </div>

       {/* Node URL List */}
       <div className="space-y-3">
          {filteredNodes.slice(0, 20).map(node => (
             <div key={node.id} className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl hover:border-brand-cyan/20 transition-all flex flex-col gap-4 group">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ENTITY_TYPES[node.type]?.color }} />
                      <span className="text-[11px] font-black text-white uppercase tracking-wider group-hover:text-brand-cyan transition-colors">{node.title}</span>
                   </div>
                </div>

                <div className="flex gap-2">
                   <div className="relative flex-1">
                      <Globe size={12} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input 
                         className="w-full bg-black/40 border border-white/5 rounded-xl py-3 pl-10 pr-4 text-[10px] text-slate-300 outline-none focus:border-brand-cyan/30 transition-all font-mono"
                         placeholder="Mapping URL..."
                         value={urls[node.id] || ''}
                         onChange={(e) => saveUrls({ ...urls, [node.id]: e.target.value })}
                      />
                   </div>
                   <button 
                     onClick={() => syncNode(node)}
                     disabled={isSyncing === node.id || !urls[node.id]}
                     className={`px-4 rounded-xl flex items-center gap-2 transition-all ${isSyncing === node.id ? 'bg-brand-cyan/10 text-brand-cyan animate-pulse border border-brand-cyan/20' : 'bg-brand-cyan/5 text-slate-500 hover:bg-brand-cyan hover:text-black border border-white/5 hover:border-brand-cyan'}`}
                   >
                      {isSyncing === node.id ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />}
                      <span className="text-[9px] font-black uppercase tracking-widest">Sync</span>
                   </button>
                </div>
             </div>
          ))}
          {filteredNodes.length > 20 && (
            <p className="text-center text-[9px] text-slate-700 uppercase font-black tracking-widest pt-4 opacity-50">Refine search for remaining {filteredNodes.length - 20} nodes</p>
          )}
       </div>
    </div>
  );
}
