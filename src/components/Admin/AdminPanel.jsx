import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, ChevronRight, ChevronDown, Search, Database, RefreshCw, Layers } from 'lucide-react';
import { ENTITY_TYPES } from '../../data/nodes';

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

export const AdminPanel = ({ nodes, isOpen, onClose, onFocusNode, onReset }) => {
  const [search, setSearch] = useState('');
  const rootNodes = nodes.filter(n => !n.parentId);

  const filteredNodes = search 
    ? nodes.filter(n => n.title.toLowerCase().includes(search.toLowerCase()))
    : [];

  return (
    <motion.div 
      initial={{ x: '100%' }} animate={{ x: isOpen ? 0 : '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed top-0 right-0 h-full w-[450px] bg-[#08090d]/98 backdrop-blur-3xl border-l border-white/10 z-[60000] shadow-[-20px_0_100px_black] flex flex-col"
    >
        <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/2">
            <div className="flex flex-col">
                <div className="flex items-center gap-3">
                    <Layers size={16} className="text-brand-cyan" />
                    <h2 className="text-lg font-black uppercase tracking-tighter italic text-white">Logic_<span className="text-brand-cyan">TREES</span></h2>
                </div>
                <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest mt-1 ml-7">Enterprise Schema Navigator</span>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors text-slate-400 hover:text-white"><X size={24} /></button>
        </div>

        <div className="p-6 space-y-4">
            <div className="relative">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                    className="w-full bg-black/40 border border-white/5 rounded-xl py-4 pl-12 pr-4 text-xs focus:border-brand-cyan/40 outline-none transition-all placeholder:text-slate-700"
                    placeholder="Search node index..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>
            <button 
                onClick={onReset}
                className="w-full py-3 bg-white/2 border border-white/5 rounded-lg flex items-center justify-center gap-2 text-[8px] font-black uppercase tracking-widest text-[#556] hover:text-brand-cyan hover:border-brand-cyan/20 transition-all"
            >
                <RefreshCw size={10} />
                Restore Master Baseline
            </button>
        </div>

        <div className="flex-1 overflow-auto custom-scrollbar p-6 space-y-1">
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

        <div className="p-8 border-t border-white/5 bg-black/40 text-[8px] text-slate-600 font-bold uppercase tracking-[0.3em] text-center">
            System Instance:_T&T_GA01
        </div>
    </motion.div>
  );
};
