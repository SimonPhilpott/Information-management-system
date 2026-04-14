import React from 'react';
import { motion } from 'framer-motion';
import { PanelLeftClose, PanelLeft, Database, Network, Cpu } from 'lucide-react';
import { ENTITY_TYPES, SCHEMAS } from '../../data/nodes';

export const StatusSidebars = ({ nodes, isCollapsed, onToggle, selectedNode }) => {
  return (
    <div className={`flex flex-col gap-8 transition-all duration-500 ease-in-out z-[1000] h-full ${isCollapsed ? 'w-20' : 'w-96'}`}>
      {/* Re-Branded Header: Removal of 'HIVE' */}
      <div className="glass-panel px-8 py-5 border-white/10 flex items-center justify-between shrink-0">
         <div className={`items-center gap-4 ${isCollapsed ? 'hidden' : 'flex'}`}>
            <motion.div 
               animate={{ rotate: 45, scale: [1, 1.1, 1] }} 
               transition={{ duration: 5, repeat: Infinity }}
               className="w-6 h-6 border-2 border-brand-cyan flex items-center justify-center p-1 shadow-[0_0_15px_rgba(0,242,255,0.4)]"
            >
               <div className="w-full h-full bg-brand-cyan/20" />
            </motion.div>
            <h1 className="text-2xl font-black italic uppercase leading-none tracking-tighter text-white">
               T&T_<span className="text-brand-cyan">MESH</span>
            </h1>
         </div>
         <button onClick={onToggle} className="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-500 hover:text-white">
            {isCollapsed ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
         </button>
      </div>

      {!isCollapsed && (
        <div className="flex flex-col gap-6 flex-1 min-h-0">
          <div className="glass-panel p-6 flex flex-col gap-4 border-l-2 border-brand-cyan">
             <div className="flex items-center gap-2 mb-2">
                <Network size={14} className="text-brand-cyan" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-cyan">Spatial_Analytics</span>
             </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/2 p-4 rounded-xl border border-white/5">
                   <span className="text-[8px] font-black uppercase text-slate-600 tracking-widest leading-none block mb-2">Node Density</span>
                   <p className="text-xl font-black text-white tracking-tighter">{nodes.length}</p>
                </div>
                <div className="bg-white/2 p-4 rounded-xl border border-white/5">
                   <span className="text-[8px] font-black uppercase text-slate-600 tracking-widest leading-none block mb-2">Health Index</span>
                   <p className="text-xl font-black text-emerald-400 tracking-tighter">NOMINAL</p>
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
                 <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white grow truncate">{selectedNode.title}</span>
              </div>
              <div className="space-y-6 overflow-auto custom-scrollbar pr-2 relative z-10">
                 {SCHEMAS[selectedNode.type]?.map(field => (
                   <div key={field.name} className="space-y-2 group">
                      <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest group-hover:text-brand-cyan transition-colors italic">{field.name}</label>
                      <p className="text-[12px] text-slate-300 leading-relaxed font-light">{selectedNode.content?.[field.name] || 'Pending logic capture...'}</p>
                   </div>
                 ))}
              </div>
            </div>
          ) : (
            <div className="glass-panel p-8 flex-1 flex flex-col items-center justify-center text-center opacity-30 border-dashed">
               <Database size={32} className="mb-4 text-slate-600" />
               <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 italic">Structural Hold<br/>Awaiting node focus</p>
            </div>
          )}

          <div className="glass-panel p-6 shrink-0 border-white/5 bg-black/40">
             <div className="flex justify-between items-center mb-4">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 italic">Sync Status</span>
                <div className="flex items-center gap-1.5">
                   <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                   <span className="text-[9px] font-bold text-emerald-500 tracking-tighter">DATA:READY</span>
                </div>
             </div>
             <div className="h-0.5 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                   animate={{ width: ['40%', '95%', '70%', '100%'] }}
                   transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
                   className="h-full bg-brand-cyan shadow-[0_0_10px_rgba(0,242,255,1)]"
                />
             </div>
          </div>
        </div>
      )}
    </div>
  );
};
