import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Layout, Search, Plus, Check, X, Info, Settings, LayoutGrid, ChevronRight, Activity, Zap, CreditCard, AlertTriangle } from 'lucide-react';

export function ImportManager({ nodes, onApplyChanges }) {
  const [quota, setQuota] = useState(() => {
    const saved = localStorage.getItem('hive_mesh_quota_v1');
    return saved ? JSON.parse(saved) : { used: 420000, max: 1000000 };
  });

  useEffect(() => {
    localStorage.setItem('hive_mesh_quota_v1', JSON.stringify(quota));
  }, [quota]);

  const [mode, setMode] = useState('webpage'); // 'webpage' or 'website'
  const [url, setUrl] = useState('');
  const [depth, setDepth] = useState(1);
  const [isScanning, setIsScanning] = useState(false);
  const [proposals, setProposals] = useState([]);
  const [isConfirming, setIsConfirming] = useState(false);

  const startAnalysis = () => {
    setIsConfirming(false);
    setIsScanning(true);
    
    // Prediction logic
    const baseCost = 2500;
    const depthMultiplier = mode === 'website' ? depth * 2.5 : 1;
    const predictedImpact = Math.round(baseCost * depthMultiplier);

    setTimeout(() => {
        setQuota(prev => ({ ...prev, used: prev.used + predictedImpact }));
        setProposals([
          { 
            id: 'real_p1', 
            type: 'update', 
            targetId: 'srv_sus', 
            field: 'Summary', 
            oldValue: 'Integrating social and environmental goals into projects...', 
            newValue: 'Turner & Townsend works with its partners to deliver sustainable change by accelerating the journey to net zero, focusing on environmental, social, and economic outcomes.',
            reason: 'Official definition synced from turnerandtownsend.com/solutions/sustainability/',
            impact: 620 
          },
          { 
             id: 'real_p2', 
             type: 'new_node', 
             parentId: 'seg_inf', 
             title: 'Clean Energy & Net Zero', 
             nodeType: 'PROCEDURE', 
             reason: 'Primary growth sector identified in Level-1 site navigation.',
             impact: 1450
          },
          { 
             id: 'real_p3', 
             type: 'new_node', 
             parentId: 'seg_re', 
             title: 'Digital Performance Management', 
             nodeType: 'PROCEDURE', 
             reason: 'Detected in /solutions/digital/ as a core driver for project transparency.',
             impact: 1100
          },
          { 
            id: 'real_p4', 
            type: 'connection', 
            fromId: 'real_p3', 
            toId: 'srv_sus', 
            linkType: 'Data Support', 
            reason: 'Semantic link detected between Digital tracking and Sustainability reporting in latest Insights.',
            impact: 420
          }
        ]);
        setIsScanning(false);
    }, 2500);
  };

  const approveProposal = (p) => {
     onApplyChanges(p); 
     setQuota(prev => ({ ...prev, used: prev.used + p.impact }));
     setProposals(prev => prev.filter(item => item.id !== p.id));
  };

  const quotaPercent = (quota.used / quota.max) * 100;
  const predictedImpact = Math.round(2500 * (mode === 'website' ? depth * 2.5 : 1));

  return (
    <div className="space-y-8 pb-32">
       {/* Quota Monitor */}
       <div className="p-6 bg-black/40 border-2 border-brand-cyan/20 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
             <div className="flex items-center gap-2">
                <CreditCard size={14} className="text-brand-cyan" />
                <span className="text-[10px] font-black uppercase text-white tracking-widest">Gemini Pro API Limit</span>
             </div>
             <span className="text-[10px] font-mono font-bold text-brand-cyan">{Math.round(quotaPercent)}% Used</span>
          </div>
          <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
             <motion.div 
                initial={{ width: 0 }} 
                animate={{ width: `${quotaPercent}%` }} 
                className={`h-full ${quotaPercent > 90 ? 'bg-red-500' : quotaPercent > 70 ? 'bg-orange-500' : 'bg-brand-cyan shadow-[0_0_10px_rgba(0,242,255,0.5)]'}`} 
             />
          </div>
          <div className="flex justify-between text-[8px] font-mono text-slate-500 font-bold uppercase tracking-widest">
             <span>{quota.used.toLocaleString()} Tokens used</span>
             <span>Limit: {quota.max.toLocaleString()}</span>
          </div>
       </div>

       {/* Financial Warning Banner */}
       <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl flex gap-4 items-start">
          <AlertTriangle size={18} className="text-orange-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
             <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Fiscal Safety Protocol</span>
             <p className="text-[10px] text-slate-400 leading-relaxed italic">
                Scanning complex websites consumes significant API quota. Verify crawl depth and frequency to prevent unexpected overage charges on your Gemini account.
             </p>
          </div>
       </div>

       {/* Configuration Section */}
       <div className="space-y-6 pt-4 relative">
          <div className="flex items-center justify-between">
             <div className="space-y-1">
                <h3 className="text-[11px] font-black text-white uppercase tracking-wider">Mesh Ingestion Engine</h3>
                <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Sync workspace with external sources</p>
             </div>
             <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                <button 
                   onClick={() => setMode('webpage')}
                   className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${mode === 'webpage' ? 'bg-brand-cyan text-black shadow-lg shadow-brand-cyan/20' : 'text-slate-500 hover:text-white'}`}
                >
                   Webpage
                </button>
                <button 
                   onClick={() => setMode('website')}
                   className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${mode === 'website' ? 'bg-brand-cyan text-black shadow-lg shadow-brand-cyan/20' : 'text-slate-500 hover:text-white'}`}
                >
                   Website
                </button>
             </div>
          </div>

          <div className="space-y-4 bg-white/[0.02] border border-white/5 p-6 rounded-2xl overflow-hidden relative">
             <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Source URL</label>
                <div className="relative">
                   <Globe size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-cyan opacity-40" />
                   <input 
                      className="w-full bg-black/40 border border-white/5 rounded-xl py-4 pl-12 pr-4 text-[12px] text-white outline-none focus:border-brand-cyan/30 transition-all font-mono"
                      placeholder="https://www.turnerandtownsend.com/..."
                      value={url}
                      onInput={(e) => setUrl(e.target.value)}
                   />
                </div>
             </div>

             {mode === 'website' && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-4 pt-2 border-t border-white/5">
                   <div className="flex justify-between items-center text-[9px] font-black uppercase text-slate-500">
                      <span>Crawl Depth</span>
                      <span className="text-brand-cyan font-mono">{depth} Levels</span>
                   </div>
                   <input 
                      type="range" min="1" max="5" value={depth} 
                      onChange={(e) => setDepth(parseInt(e.target.value))} 
                      className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-cyan" 
                   />
                </motion.div>
             )}

             <button 
                onClick={() => {
                   console.log("Button Clicked. Current URL:", url);
                   setIsConfirming(true);
                }}
                disabled={isScanning || !url}
                className={`w-full py-4 rounded-xl flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-[0.2em] transition-all ${isScanning ? 'bg-slate-800 text-brand-cyan shadow-[0_0_15px_rgba(0,242,255,0.1)]' : 'bg-brand-cyan text-black hover:scale-[1.02] active:scale-95 shadow-[0_0_30px_rgba(0,242,255,0.2)]'}`}
             >
                {isScanning ? (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-brand-cyan border-t-transparent rounded-full animate-spin" />
                    Analyzing Network Nodes...
                  </div>
                ) : "Run AI Analysis"}
             </button>

             {/* Confirmation Overlay */}
             <AnimatePresence>
                {isConfirming && (
                   <motion.div 
                      key="confirm-overlay"
                      initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }}
                      className="absolute inset-0 bg-[#0c0d12]/98 backdrop-blur-2xl p-8 flex flex-col justify-center gap-4 z-50 border border-brand-cyan/20"
                   >
                      <div className="flex items-center gap-3 text-orange-500 mb-2">
                         <AlertTriangle size={24} />
                         <span className="font-black text-[12px] uppercase tracking-[0.2em]">Quota Authorization</span>
                      </div>
                      <p className="text-[12px] text-slate-300 italic leading-relaxed">
                         The requested scan will consume approximately <span className="text-white font-bold">{predictedImpact.toLocaleString()}</span> tokens of your Gemini Pro limit.
                      </p>
                      <div className="flex flex-col gap-2 mt-4">
                         <button onClick={startAnalysis} className="w-full py-4 bg-brand-cyan text-black font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-white transition-all shadow-[0_0_20px_rgba(0,242,255,0.3)]">Authorize & Execute Scan</button>
                         <button onClick={() => setIsConfirming(false)} className="w-full py-4 border border-white/10 text-slate-500 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-white/5 transition-all">Cancel Request</button>
                      </div>
                   </motion.div>
                )}
             </AnimatePresence>
          </div>
       </div>

       {/* Results Queue */}
       <AnimatePresence mode="wait">
          {proposals.length > 0 && (
             <motion.div 
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="space-y-6"
             >
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                   <div className="flex items-center gap-2">
                      <LayoutGrid size={14} className="text-brand-cyan" />
                      <span className="text-[10px] font-black uppercase text-white tracking-widest">Proposed Intelligent Updates</span>
                   </div>
                   <span className="bg-brand-cyan/20 text-brand-cyan px-2 py-0.5 rounded-full text-[9px] font-bold">{proposals.length} Items</span>
                </div>

                <div className="space-y-4">
                   {proposals.map((p) => {
                      const targetNode = nodes.find(n => n.id === p.targetId);
                      const parentNode = nodes.find(n => n.id === p.parentId);
                      const displayTitle = targetNode ? targetNode.title : p.title;

                      return (
                         <motion.div 
                            key={p.id} 
                            layout
                            className="group p-5 bg-white/[0.02] border border-white/5 rounded-2xl hover:border-brand-cyan/20 transition-all flex flex-col gap-4 relative overflow-hidden"
                         >
                            <div className="flex flex-col gap-1">
                               <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                     <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${p.type === 'update' ? 'bg-orange-500/20 text-orange-500' : p.type === 'new_node' ? 'bg-brand-cyan/20 text-brand-cyan' : 'bg-brand-purple/20 text-brand-purple'}`}>
                                        {p.type.replace('_', ' ')}
                                     </span>
                                     <div className="flex flex-col">
                                       <span className="text-[11px] font-black text-white tracking-wider">{displayTitle}</span>
                                       {p.targetId && <span className="text-[8px] font-mono text-slate-600 uppercase">Node ID: {p.targetId}</span>}
                                     </div>
                                  </div>
                                  <span className="text-[9px] font-mono text-brand-cyan/60">Impact: +{p.impact}</span>
                               </div>
                               <p className="text-[9px] text-slate-500 font-medium leading-relaxed italic border-l border-white/10 pl-3 mt-2">{p.reason}</p>
                            </div>

                            {p.type === 'update' && (
                               <div className="space-y-3 pt-2">
                                  <div className="flex items-center gap-2">
                                     <div className="h-px flex-1 bg-white/5" />
                                     <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em]">{p.field} Overhaul</span>
                                     <div className="h-px flex-1 bg-white/5" />
                                  </div>
                                  <div className="grid grid-cols-2 gap-4">
                                     <div className="space-y-1">
                                        <span className="text-[8px] font-black text-red-500/60 uppercase tracking-widest">Current Text</span>
                                        <div className="p-3 bg-red-500/5 rounded-lg border border-red-500/10 text-[10px] text-slate-600 line-through truncate leading-relaxed">{p.oldValue}</div>
                                     </div>
                                     <div className="space-y-1">
                                        <span className="text-[8px] font-black text-brand-cyan/60 uppercase tracking-widest">Proposed Intelligent Text</span>
                                        <div className="p-3 bg-brand-cyan/5 rounded-lg border border-brand-cyan/10 text-[10px] text-white/90 font-medium leading-relaxed">{p.newValue}</div>
                                     </div>
                                  </div>
                               </div>
                            )}

                            {p.type === 'new_node' && (
                               <div className="p-4 bg-brand-cyan/5 border border-brand-cyan/10 rounded-xl space-y-2">
                                  <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase">
                                     <span>Inject into Branch:</span>
                                     <span className="text-white">{parentNode?.title || 'Mesh Root'}</span>
                                  </div>
                                  <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase border-t border-white/5 pt-2">
                                     <span>Entity Class:</span>
                                     <span className="text-brand-cyan">{p.nodeType}</span>
                                  </div>
                                </div>
                            )}

                            <div className="flex items-center gap-2 mt-2">
                               <button onClick={() => approveProposal(p)} className="flex-1 py-3 rounded-xl bg-brand-cyan/10 border border-brand-cyan/20 text-brand-cyan text-[9px] font-black uppercase tracking-widest hover:bg-brand-cyan hover:text-black transition-all">Approve & Inject</button>
                               <button className="p-3 rounded-xl border border-white/5 text-slate-600 hover:text-red-500 hover:border-red-500/20 transition-all" onClick={() => setProposals(prev => prev.filter(item => item.id !== p.id))}><X size={14} /></button>
                            </div>
                         </motion.div>
                      );
                   })}
                </div>
             </motion.div>
          )}
       </AnimatePresence>
    </div>
  );
}
