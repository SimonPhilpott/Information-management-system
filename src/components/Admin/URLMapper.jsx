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

  const syncNode = async (node) => {
    const url = urls[node.id];
    if (!url) return;

    setIsSyncing(node.id);
    try {
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
      const proposal = {
        id: `sync_${node.id}_${Date.now()}`,
        type: 'update',
        targetId: node.id,
        field: 'Summary',
        oldValue: node.content?.Summary || 'No existing intelligence.',
        newValue: data.content,
        reason: `Data dynamically harvested from authoritative resource: ${url}`,
        impact: 1400
      };
      
      onApplyAIProposal(proposal);
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
