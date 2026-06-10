import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronDown, Search, Database, RefreshCw, Layers, Trash2, RotateCcw, Box, Palette } from 'lucide-react';
import { ENTITY_TYPES } from '../../data/nodes';
import { useTheme, THEMES } from '../../ThemeContext';

const TreeItem = ({ node, nodes, level = 0, onSelect }) => {
  const [isOpen, setIsOpen] = useState(level < 1);
  const children = nodes.filter(n => n.parentId === node.id);
  const hasChildren = children.length > 0;
  const config = ENTITY_TYPES[node.type] || ENTITY_TYPES.CONCEPT;

  return (
    <div className="select-none">
      <div 
        className={`flex items-center gap-2 py-1.5 px-3 rounded-lg cursor-pointer transition-colors hover:bg-white/5 group`}
        style={{ paddingLeft: `${level * 16 + 12}px` }}
        onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setIsOpen(!isOpen);
            onSelect(node);
        }}
      >
        <div className="w-4 h-4 flex items-center justify-center">
            {hasChildren ? (
                isOpen ? <ChevronDown size={12} className="text-slate-500" /> : <ChevronRight size={12} className="text-slate-500" />
            ) : (
                <div className="w-1.5 h-px bg-slate-700" />
            )}
        </div>
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color }} />
        <span className="text-[11px] font-medium text-slate-300 group-hover:text-white truncate">{node.title}</span>
      </div>
      
      {hasChildren && isOpen && (
        <div className="border-l border-white/5 ml-4">
          {children.map(child => (
            <TreeItem key={child.id} node={child} nodes={nodes} level={level + 1} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
};

export const AdminPanel = ({ nodes, deletedNodes = [], isOpen, onClose, onFocusNode, onRestoreNode, onReset, layoutRules, setLayoutRules, applyLayout }) => {
  const { theme, setTheme } = useTheme();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('tree'); // 'tree' or 'bin'
  const rootNodes = nodes.filter(n => !n.parentId);

  const filteredNodes = search 
    ? nodes.filter(n => n.title.toLowerCase().includes(search.toLowerCase()))
    : [];

  return (
    <motion.div 
      initial={{ x: '100%' }} animate={{ x: isOpen ? 0 : '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed top-0 right-0 h-full w-[500px] backdrop-blur-3xl border-l border-white/10 z-[60000] flex flex-col"
      style={{ backgroundColor: 'var(--bg-overlay)', boxShadow: '-20px 0 100px rgba(0,0,0,0.3)' }}
    >
        <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/2">
            <div className="flex flex-col">
                <div className="flex items-center gap-3">
                    <Layers size={16} className="text-brand-cyan" />
                    <h2 className="text-lg font-bold italic tracking-tight text-white">Admin</h2>
                </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors text-slate-400 hover:text-white"><X size={24} /></button>
        </div>

        {/* Theme Selector */}
        <div className="px-8 py-5 border-b border-white/5">
           <div className="flex items-center gap-2 mb-3">
              <Palette size={12} style={{ color: 'rgb(var(--accent-rgb))' }} />
              <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Interface Theme</span>
           </div>
           <div className="grid grid-cols-3 gap-2">
              {THEMES.map(t => (
                <button 
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                    theme === t.id 
                      ? 'border-brand-cyan bg-brand-cyan/10' 
                      : 'border-white/5 hover:border-white/10'
                  }`}
                >
                  <div className="w-full h-6 rounded-lg overflow-hidden" style={{ background: t.preview }} />
                  <span className={`text-[9px] font-bold ${theme === t.id ? 'text-brand-cyan' : 'text-slate-400'}`}>{t.label}</span>
                </button>
              ))}
           </div>
        </div>

        {/* Tab Selector */}
        <div className="px-8 pt-6 flex gap-8 border-b border-white/5 bg-white/1">
           <button 
             onClick={() => setActiveTab('tree')}
             className={`pb-4 text-[11px] font-bold tracking-wider transition-all relative ${activeTab === 'tree' ? 'text-brand-cyan' : 'text-slate-600 hover:text-slate-400'}`}
           >
             Structure Index
             {activeTab === 'tree' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-cyan" />}
           </button>
           <button 
             onClick={() => setActiveTab('bin')}
             className={`pb-4 text-[11px] font-bold tracking-wider transition-all relative flex items-center gap-2 ${activeTab === 'bin' ? 'text-red-500' : 'text-slate-600 hover:text-slate-400'}`}
           >
             Waste Bin
             {deletedNodes.length > 0 && <span className="bg-red-500 text-white px-1.5 py-0.5 rounded-full text-[8px]">{deletedNodes.length}</span>}
             {activeTab === 'bin' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />}
           </button>
        </div>

        <div className="p-6 space-y-4">
            <div className="relative">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                    className="w-full bg-black/40 border border-white/5 rounded-xl py-4 pl-12 pr-4 text-xs focus:border-brand-cyan/40 outline-none transition-all placeholder:text-slate-700 text-white"
                    placeholder={activeTab === 'tree' ? "Search node index..." : "Search deleted items..."}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>
            {activeTab === 'tree' && (
              <button 
                  onClick={onReset}
                  className="w-full py-3 bg-white/2 border border-white/5 rounded-lg flex items-center justify-center gap-2 text-[10px] font-bold tracking-widest text-[#556] hover:text-brand-cyan hover:border-brand-cyan/20 transition-all"
              >
                  <RefreshCw size={10} />
                  Restore Master Baseline
              </button>
            )}

        </div>

        <div className="flex-1 overflow-auto custom-scrollbar p-6 space-y-8">
            <AnimatePresence mode="wait">
              {activeTab === 'tree' ? (
                <motion.div key="tree-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
                  {/* Structure Section */}
                  <div className="space-y-4">
                     <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block border-b border-white/5 pb-2">Mesh Hierarchy</span>
                     {search ? (
                       <div className="space-y-1">
                           {filteredNodes.length > 0 ? filteredNodes.map(n => (
                               <div 
                                   key={n.id} 
                                   onClick={() => onFocusNode(n)}
                                   className="flex items-center gap-3 py-3 px-4 rounded-xl hover:bg-white/5 cursor-pointer border border-transparent hover:border-white/5 transition-all active:scale-[0.98]"
                               >
                                    <div className="w-2 h-2 rounded-full shadow-[0_0_10px_currentColor]" style={{ backgroundColor: ENTITY_TYPES[n.type]?.color, color: ENTITY_TYPES[n.type]?.color }} />
                                    <span className="text-[11px] font-bold text-slate-300">{n.title}</span>
                               </div>
                           )) : (
                               <div className="p-10 text-center text-slate-600 text-[10px] italic">No relational matches found.</div>
                           )}
                       </div>
                     ) : (
                       rootNodes.map(root => (
                           <TreeItem key={root.id} node={root} nodes={nodes} onSelect={onFocusNode} />
                       ))
                     )}
                  </div>



                  <button 
                     onClick={() => applyLayout(layoutRules)}
                     className="w-full mt-2 py-3 bg-brand-cyan/10 border border-brand-cyan/20 rounded-lg flex items-center justify-center gap-2 text-[10px] font-bold tracking-widest text-brand-cyan hover:bg-brand-cyan/20 hover:border-brand-cyan/40 transition-all uppercase shadow-[0_0_15px_rgba(0,242,255,0.1)]"
                  >
                     Execute Global Repositioning
                  </button>

                  {/* Feature Blueprint */}
                  <div className="space-y-4">
                     <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block border-b border-white/5 pb-2">Feature Matrix</span>
                     <div className="grid grid-cols-1 gap-2">
                        {[
                          { cat: 'Spatial', items: ['Persistent Layout Engine', 'Draggable Mesh Nodes', 'Collision Detection', 'LOD Label Optimization'] },
                          { cat: 'Authoring', items: ['Rich Text Editor', 'Predictive Tagging', 'In-Text Connectivity Controls', 'Entity Schemas'] },
                          { cat: 'Relational', items: ['Automatic Hierarchy Lines', 'Secondary Link Overlays', 'Relationship Highlighting'] },
                          { cat: 'Safety', items: ['Auto-Save (Local Storage)', 'Waste Bin & Restoration', 'Deletion Confirmation'] }
                        ].map(f => (
                          <div key={f.cat} className="p-3 bg-white/[0.02] rounded-lg border border-white/5">
                             <div className="text-[8px] font-bold text-brand-cyan mb-2 uppercase">{f.cat}</div>
                             <div className="flex flex-wrap gap-2">
                                {f.items.map(i => <span key={i} className="text-[9px] text-slate-400 bg-white/5 px-2 py-0.5 rounded-full">{i}</span>)}
                             </div>
                          </div>
                        ))}
                     </div>
                  </div>

                  {/* Module Intelligence */}
                  <div className="space-y-4">
                     <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block border-b border-white/5 pb-2">Module Blueprint</span>
                     <div className="space-y-2">
                        <div className="flex justify-between text-[10px] p-3 border border-white/5 rounded-lg bg-black/20 italic">
                           <span className="text-slate-500">core_mesh_engine.jsx</span>
                           <span className="text-brand-cyan font-bold">Spatial Logic</span>
                        </div>
                        <div className="flex justify-between text-[10px] p-3 border border-white/5 rounded-lg bg-black/20 italic">
                           <span className="text-slate-500">relational_intelligence_drawer.jsx</span>
                           <span className="text-brand-cyan font-bold">Metadata / Rich Text</span>
                        </div>
                        <div className="flex justify-between text-[10px] p-3 border border-white/5 rounded-lg bg-black/20 italic">
                           <span className="text-slate-500">admin_control_logic.jsx</span>
                           <span className="text-brand-cyan font-bold">System Management</span>
                        </div>
                     </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="bin-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                   {deletedNodes.length > 0 ? (
                      <div className="space-y-3">
                         {deletedNodes.map(n => (
                            <div key={n.id} className="flex items-center justify-between p-4 bg-white/2 border border-white/5 rounded-2xl group hover:border-white/10 transition-all">
                               <div className="flex items-center gap-3">
                                  <div className="w-2 h-2 rounded-full opacity-50" style={{ backgroundColor: ENTITY_TYPES[n.type]?.color }} />
                                  <div className="flex flex-col">
                                     <span className="text-[11px] font-bold text-slate-300 group-hover:text-white transition-colors">{n.title}</span>
                                     <span className="text-[8px] uppercase tracking-widest text-slate-600 font-black">{ENTITY_TYPES[n.type]?.label}</span>
                                  </div>
                               </div>
                               <button 
                                 onClick={() => onRestoreNode(n.id)}
                                 className="p-2.5 bg-brand-cyan/10 text-brand-cyan hover:bg-brand-cyan hover:text-black transition-all rounded-lg flex items-center gap-2 text-[8px] font-black uppercase"
                               >
                                  <RotateCcw size={14} />
                                  Restore
                               </button>
                            </div>
                         ))}
                      </div>
                   ) : (
                      <div className="h-64 flex flex-col items-center justify-center text-slate-700">
                         <Box size={40} className="mb-4 opacity-20" />
                         <p className="text-[10px] font-black uppercase tracking-[0.2em] italic">Waste Bin Empty</p>
                      </div>
                   )}
                </motion.div>
              )}
            </AnimatePresence>
        </div>

        <div className="p-8 border-t border-white/5 bg-black/40 text-[9px] text-slate-600 font-bold uppercase tracking-[0.3em] text-center">
            Mesh App Version: 1.4.0
        </div>
    </motion.div>
  );
};
