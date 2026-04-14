import React from 'react';
import { motion } from 'framer-motion';
import { X, ChevronRight, Save, Trash2, Cpu } from 'lucide-react';
import { ENTITY_TYPES, SCHEMAS } from '../../data/nodes';

export const IntelligenceDrawer = ({ 
  isOpen, 
  onClose, 
  editingNode, 
  currentType, 
  setCurrentType, 
  formData, 
  setFormData, 
  onSave 
}) => {
  return (
    <motion.div 
      initial={{ x: '100%' }} animate={{ x: isOpen ? 0 : '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }} 
      className="fixed top-0 right-0 h-full w-[650px] bg-[#0c0d12]/98 backdrop-blur-3xl border-l border-white/10 z-[50000] shadow-[-20px_0_60px_rgba(0,0,0,0.8)] flex flex-col"
    >
       {/* Header */}
       <div className="p-12 border-b border-white/5 flex justify-between items-center shrink-0">
          <div className="flex flex-col">
             <div className="flex items-center gap-3">
                <Cpu size={18} className="text-brand-cyan" />
                <h2 className="text-2xl font-black uppercase italic tracking-tighter">Protocol_<span className="text-brand-cyan">DRAWER</span></h2>
             </div>
             <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1.5 ml-7">Refining Relational Logic Unit</span>
          </div>
          <button onClick={onClose} className="p-4 hover:bg-white/5 rounded-full text-slate-400 hover:text-white transition-all"><X size={32} /></button>
       </div>
       
       <div className="flex-1 overflow-auto p-12 custom-scrollbar">
          <div className="space-y-12">
             {/* Title Input */}
             <div className="space-y-4">
                <label className="text-[9px] font-black text-brand-cyan uppercase tracking-widest">Architectural Label</label>
                <input 
                   className="cyber-input text-2xl font-black border-white/5 italic bg-transparent w-full" 
                   value={formData.title} 
                   onChange={(e) => setFormData({ ...formData, title: e.target.value })} 
                   placeholder="Enter designation..."
                />
             </div>
             
             {/* Type Selector */}
             <div className="grid grid-cols-2 gap-4">
                {Object.entries(ENTITY_TYPES).map(([k,v]) => (
                  <button 
                    key={k} 
                    onClick={() => setCurrentType(k)} 
                    className={`p-4 border-2 rounded-xl flex items-center gap-3 transition-all ${currentType === k ? 'border-brand-cyan bg-brand-cyan/10' : 'border-white/5 opacity-40 hover:opacity-100'}`}
                  >
                     <div className="w-2 h-2 rounded-full" style={{ backgroundColor: v.color }} />
                     <span className="text-[9px] font-black uppercase tracking-widest">{v.label}</span>
                  </button>
                ))}
             </div>
             
             {/* Schema Fields */}
             <div className="space-y-8 pt-8 border-t border-white/5">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-4 italic">Metadata_Fields</label>
                {SCHEMAS[currentType]?.map(f => (
                  <div key={f.name} className="space-y-3">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{f.name}</label>
                     <textarea 
                        className="cyber-input min-h-[160px] text-[13px] leading-relaxed p-6 border-white/5 bg-white/5 rounded-xl hover:border-white/10 focus:border-brand-cyan/40 transition-all outline-none resize-none" 
                        value={formData.content?.[f.name] || ''} 
                        onChange={(e) => setFormData({...formData, content: {...formData.content, [f.name]: e.target.value}})} 
                        placeholder={`Initialize ${f.name.toLowerCase()} logic...`} 
                     />
                  </div>
                ))}
             </div>
          </div>
       </div>
       
       {/* Actions */}
       <div className="p-10 border-t border-white/10 flex justify-end gap-6 bg-black/40">
          <button onClick={onClose} className="text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-white transition-colors">Terminate_Cycle</button>
          <button onClick={onSave} className="cyber-button px-24 py-5 shadow-[0_0_30px_rgba(0,242,255,0.2)] flex items-center gap-3">
             <Save size={16} />
             <span>Commit to Mesh</span>
          </button>
       </div>
    </motion.div>
  );
};
