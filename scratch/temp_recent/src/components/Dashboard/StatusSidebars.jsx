import React from 'react';
import { motion } from 'framer-motion';
import { PanelLeftClose, PanelLeft, Database, Network, Cpu, Search, X } from 'lucide-react';
import { ENTITY_TYPES, SCHEMAS } from '../../data/nodes';

export const StatusSidebars = ({ nodes, isCollapsed, onToggle, selectedNode, onNodeSearch }) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isSearchFocused, setIsSearchFocused] = React.useState(false);
  const [focusedIndex, setFocusedIndex] = React.useState(-1);

  const filteredNodes = React.useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return nodes.filter(n => 
      n.title?.toLowerCase().includes(q) || 
      n.type?.toLowerCase().includes(q)
    ).slice(0, 8); // Limit for UI performance
  }, [nodes, searchQuery]);

  const handleKeyDown = (e) => {
    if (filteredNodes.length === 0) return;

    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      setFocusedIndex(prev => (prev < filteredNodes.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      setFocusedIndex(prev => (prev > 0 ? prev - 1 : filteredNodes.length - 1));
    } else if (e.key === 'Enter') {
      if (focusedIndex >= 0) {
        onNodeSearch(filteredNodes[focusedIndex]);
        setSearchQuery('');
        setFocusedIndex(-1);
      } else if (filteredNodes.length > 0) {
        onNodeSearch(filteredNodes[0]);
        setSearchQuery('');
      }
    } else if (e.key === 'Escape') {
      setSearchQuery('');
      setFocusedIndex(-1);
    }
  };

  React.useEffect(() => {
    setFocusedIndex(-1);
  }, [searchQuery]);

  return (
    <div className={`flex flex-col gap-8 transition-all duration-500 ease-in-out z-[1000] h-full ${isCollapsed ? 'w-20' : 'w-96'}`}>
      <div className="flex flex-col gap-4">
        <div className="glass-panel px-8 py-5 border-white/10 flex items-center justify-between shrink-0">
           <div className={`items-center gap-4 ${isCollapsed ? 'hidden' : 'flex'}`}>
              <motion.div 
                 animate={{ rotate: 45, scale: [1, 1.1, 1] }} 
                 transition={{ duration: 5, repeat: Infinity }}
                 className="w-6 h-6 border-2 border-brand-cyan flex items-center justify-center p-1"
                 style={{ boxShadow: '0 0 15px rgba(var(--accent-rgb), 0.4)' }}
              >
                 <div className="w-full h-full bg-brand-cyan/20" />
              </motion.div>
              <h1 className="text-2xl font-bold italic leading-none tracking-tight text-white">
                 Mesh
              </h1>
           </div>
           <button onClick={onToggle} className="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-500 hover:text-white">
              {isCollapsed ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
           </button>
        </div>

        {!isCollapsed && (
          <div className="px-1 relative">
            <div className={`glass-panel flex items-center gap-3 px-4 py-3 border-white/5 transition-all duration-300 ${isSearchFocused ? 'border-brand-cyan/30 bg-white/5 ring-1 ring-brand-cyan/20' : ''}`}>
               <Search size={16} className={isSearchFocused ? 'text-brand-cyan' : 'text-slate-500'} />
               <input 
                 type="text" 
                 placeholder="Search nodes..." 
                 className="bg-transparent border-none outline-none text-[13px] text-white grow placeholder:text-slate-700 italic"
                 value={searchQuery}
                 onFocus={() => setIsSearchFocused(true)}
                 onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 onKeyDown={handleKeyDown}
               />
               {searchQuery && (
                 <button onClick={() => setSearchQuery('')} className="text-slate-500 hover:text-white">
                    <X size={14} />
                 </button>
               )}
            </div>

            {/* Live Search Results */}
            <motion.div 
              initial={false}
              animate={{ opacity: searchQuery ? 1 : 0, y: searchQuery ? 0 : -10, display: searchQuery ? 'block' : 'none' }}
              className="absolute top-full left-1 right-1 mt-2 glass-panel border-white/10 overflow-hidden shadow-2xl z-50 bg-black/80 backdrop-blur-2xl"
            >
               <div className="max-h-[300px] overflow-auto custom-scrollbar">
                  {filteredNodes.length > 0 ? (
                    filteredNodes.map((node, idx) => (
                      <button 
                        key={node.id}
                        onClick={() => { onNodeSearch(node); setSearchQuery(''); }}
                        onMouseEnter={() => setFocusedIndex(idx)}
                        className={`w-full px-5 py-3 flex items-center gap-3 text-left group border-b border-white/5 last:border-0 transition-colors ${focusedIndex === idx ? 'bg-brand-cyan/20' : 'hover:bg-brand-cyan/10'}`}
                      >
                         <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ENTITY_TYPES[node.type]?.color }} />
                         <div className="flex flex-col">
                            <span className={`text-[12px] font-bold transition-colors ${focusedIndex === idx ? 'text-brand-cyan' : 'text-white group-hover:text-brand-cyan'}`}>{node.title}</span>
                            <span className="text-[9px] uppercase tracking-wider text-slate-600 font-black">{node.type}</span>
                         </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-5 py-4 text-[11px] text-slate-600 text-center italic font-bold">No localized nodes found</div>
                  )}
               </div>
            </motion.div>
          </div>
        )}
      </div>

      {!isCollapsed && (
        <div className="flex flex-col gap-6 flex-1 min-h-0">
          <div className="glass-panel p-6 flex flex-col gap-4 border-l-2 border-brand-cyan relative overflow-hidden">
             <div className="flex items-center gap-2 mb-2">
                <Network size={14} className="text-brand-cyan" />
                <span className="text-[11px] font-bold tracking-wider text-brand-cyan">Spatial Analytics</span>
             </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/2 p-4 rounded-xl border border-white/5">
                   <span className="text-[10px] font-bold text-slate-600 tracking-wide leading-none block mb-2">Node Density</span>
                   <p className="text-xl font-bold text-white tracking-tight">{nodes.length}</p>
                </div>
                <div className="bg-white/2 p-4 rounded-xl border border-white/5">
                   <span className="text-[10px] font-bold text-slate-600 tracking-wide leading-none block mb-2">Health Index</span>
                   <p className={`text-xl font-bold tracking-tight ${(() => {
                      const isolated = nodes.filter(n => !n.parentId && (!n.secondaryLinks || n.secondaryLinks.length === 0) && n.id !== 'tt_group').length;
                      const ratio = isolated / nodes.length;
                      if (ratio > 0.2) return 'text-orange-400';
                      if (ratio > 0.1) return 'text-yellow-400';
                      return 'text-emerald-400';
                   })()}`}>
                     {(() => {
                        const isolated = nodes.filter(n => !n.parentId && (!n.secondaryLinks || n.secondaryLinks.length === 0) && n.id !== 'tt_group').length;
                        const ratio = isolated / nodes.length;
                        if (ratio > 0.2) return 'At Risk';
                        if (ratio > 0.1) return 'Degraded';
                        return 'Nominal';
                     })()}
                   </p>
                </div>
                <div className="bg-white/2 p-4 rounded-xl border border-white/5">
                   <span className="text-[10px] font-bold text-slate-600 tracking-wide leading-none block mb-2">Transverse Threads</span>
                   <p className="text-xl font-bold text-brand-cyan tracking-tight">
                     {nodes.reduce((acc, n) => acc + (n.secondaryLinks?.length || 0), 0)}
                   </p>
                </div>
                <div className="bg-white/2 p-4 rounded-xl border border-white/5">
                   <span className="text-[10px] font-bold text-slate-600 tracking-wide leading-none block mb-2">Core Hierarchies</span>
                   <p className="text-xl font-bold text-white tracking-tight">
                     {nodes.filter(n => nodes.filter(c => c.parentId === n.id).length > 2).length}
                   </p>
                </div>
             </div>
          </div>

          {selectedNode ? (
            <div className="glass-panel p-6 flex flex-col flex-1 min-h-0 bg-brand-cyan/5 border-l-2 border-brand-cyan relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5 scale-150 rotate-12 pointer-events-none">
                 <Cpu size={120} className="text-brand-cyan" />
              </div>
              <div className="flex items-center gap-2 mb-6 border-b border-white/5 pb-4 relative z-10">
                 <div className="w-1.5 h-1.5 rounded-full shadow-[0_0_10px_currentColor]" style={{ backgroundColor: ENTITY_TYPES[selectedNode.type]?.color, color: ENTITY_TYPES[selectedNode.type]?.color }} />
                 <span className="text-[12px] font-bold tracking-tight text-white grow truncate">{selectedNode.title}</span>
              </div>
              <div className="space-y-6 overflow-auto custom-scrollbar pr-2 relative z-10">
                 {SCHEMAS[selectedNode.type]?.map(field => (
                   <div key={field.name} className="space-y-2 group">
                      <label className="text-[10px] font-bold text-slate-500 transition-colors italic">{field.name}</label>
                      <p className="text-[13px] text-slate-300 leading-relaxed font-light">{selectedNode.content?.[field.name] || 'Pending logic capture...'}</p>
                   </div>
                 ))}
              </div>
            </div>
          ) : (
            <div className="glass-panel p-8 flex-1 flex flex-col items-center justify-center text-center opacity-30 border-dashed">
               <Database size={32} className="mb-4 text-slate-600" />
               <p className="text-[11px] font-bold tracking-wide text-slate-500 italic">Structural Hold<br/>Awaiting node focus</p>
            </div>
          )}

          <div className="glass-panel p-6 shrink-0 border-white/5 bg-black/40">
             <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] font-bold text-slate-600 italic">Sync Status</span>
                <div className="flex items-center gap-1.5">
                   <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                   <span className="text-[10px] font-bold text-emerald-500 tracking-tight">Data:Ready</span>
                </div>
             </div>
             <div className="h-0.5 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                   animate={{ width: ['40%', '95%', '70%', '100%'] }}
                   transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
                   className="h-full bg-brand-cyan"
                   style={{ boxShadow: '0 0 10px rgb(var(--accent-rgb))' }}
                />
             </div>
          </div>
        </div>
      )}
    </div>
  );
};
