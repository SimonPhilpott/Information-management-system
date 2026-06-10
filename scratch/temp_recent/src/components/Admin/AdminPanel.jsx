import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronDown, Search, Database, RefreshCw, Layers, Trash2, RotateCcw, Box, Palette, Info, Zap, Link2, CheckCircle2 } from 'lucide-react';
import { ENTITY_TYPES } from '../../data/nodes';
import { useTheme, THEMES } from '../../ThemeContext';
import { ImportManager } from './ImportManager';
import { URLMapper } from './URLMapper';

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

export const AdminPanel = ({ 
  nodes, 
  deletedNodes = [], 
  isOpen, 
  onClose, 
  onFocusNode, 
  onRestoreNode, 
  onReset, 
  onBackup, 
  layoutRules, 
  setLayoutRules, 
  applyLayout,
  onApplyAIProposal
}) => {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupStatus, setBackupStatus] = useState(null); // 'success' | 'error' | null
  const [hoveredFeature, setHoveredFeature] = useState(null);

  const { theme, setTheme } = useTheme();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('tree'); // 'tree' | 'bin' | 'defs' | 'ingest' | 'map'
  const rootNodes = nodes.filter(n => !n.parentId);

  const filteredNodes = search 
    ? nodes.filter(n => n.title.toLowerCase().includes(search.toLowerCase()))
    : [];

  return (
    <motion.div 
      initial={{ x: '100%' }} animate={{ x: isOpen ? 0 : '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed top-0 right-0 h-full w-[66vw] backdrop-blur-3xl border-l border-white/10 z-[70000] flex flex-col"
      onMouseDown={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
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
        <div className="px-8 pt-6 flex gap-6 border-b border-white/5 bg-white/1 overflow-x-auto no-scrollbar">
           <button 
             onClick={() => setActiveTab('tree')}
             className={`pb-4 text-[10px] font-black uppercase tracking-widest transition-all relative shrink-0 ${activeTab === 'tree' ? 'text-brand-cyan' : 'text-slate-600 hover:text-slate-400'}`}
           >
             Hierarchy
             {activeTab === 'tree' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-cyan" />}
           </button>
           <button 
             onClick={() => setActiveTab('map')}
             className={`pb-4 text-[10px] font-black uppercase tracking-widest transition-all relative shrink-0 ${activeTab === 'map' ? 'text-brand-cyan' : 'text-slate-600 hover:text-slate-400'}`}
           >
             Map URLs
             {activeTab === 'map' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-cyan" />}
           </button>
           <button 
             onClick={() => setActiveTab('ingest')}
             className={`pb-4 text-[10px] font-black uppercase tracking-widest transition-all relative shrink-0 flex items-center gap-2 ${activeTab === 'ingest' ? 'text-brand-cyan' : 'text-slate-600 hover:text-slate-400'}`}
           >
             Ingest
             <Zap size={10} className={activeTab === 'ingest' ? 'text-brand-cyan' : 'text-slate-600'} />
             {activeTab === 'ingest' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-cyan" />}
           </button>
           <button 
             onClick={() => setActiveTab('defs')}
             className={`pb-4 text-[10px] font-black uppercase tracking-widest transition-all relative shrink-0 ${activeTab === 'defs' ? 'text-brand-cyan' : 'text-slate-600 hover:text-slate-400'}`}
           >
             Node Definitions
             {activeTab === 'defs' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-cyan" />}
           </button>
           <button 
             onClick={() => setActiveTab('bin')}
             className={`pb-4 text-[10px] font-black uppercase tracking-widest transition-all relative shrink-0 flex items-center gap-2 ${activeTab === 'bin' ? 'text-red-500' : 'text-slate-600 hover:text-slate-400'}`}
           >
             Deleted
             {activeTab === 'bin' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500" />}
           </button>
           <button 
             onClick={() => setActiveTab('system')}
             className={`pb-4 text-[10px] font-black uppercase tracking-widest transition-all relative shrink-0 flex items-center gap-2 ${activeTab === 'system' ? 'text-brand-cyan' : 'text-slate-600 hover:text-slate-400'}`}
           >
             Project Structure
             {activeTab === 'system' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-cyan" />}
           </button>
           <button 
             onClick={() => setActiveTab('spatial')}
             className={`pb-4 text-[10px] font-black uppercase tracking-widest transition-all relative shrink-0 flex items-center gap-2 ${activeTab === 'spatial' ? 'text-brand-cyan' : 'text-slate-600 hover:text-slate-400'}`}
           >
             Spatial Logic
             {activeTab === 'spatial' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-cyan" />}
           </button>
        </div>

        {(activeTab === 'tree' || activeTab === 'bin') && (
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
                <div className="flex flex-col gap-2">
                    <button 
                        disabled={isBackingUp}
                        onClick={async () => {
                            setIsBackingUp(true);
                            setBackupStatus(null);
                            try {
                                await onBackup();
                                setBackupStatus('success');
                                setTimeout(() => setBackupStatus(null), 3000);
                            } catch (e) {
                                setBackupStatus('error');
                                setTimeout(() => setBackupStatus(null), 3000);
                            } finally {
                                setIsBackingUp(false);
                            }
                        }}
                        className={`w-full py-4 rounded-xl flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all border ${
                            backupStatus === 'success' ? 'bg-green-500/20 border-green-500/50 text-green-400' :
                            backupStatus === 'error' ? 'bg-red-500/20 border-red-500/50 text-red-100' :
                            'bg-brand-purple/10 border-brand-purple/20 text-brand-purple hover:bg-brand-purple/20 hover:border-brand-purple/40 shadow-[0_0_20px_rgba(191,0,255,0.1)]'
                        }`}
                    >
                        {isBackingUp ? (
                            <RefreshCw size={12} className="animate-spin" />
                        ) : backupStatus === 'success' ? (
                            <CheckCircle2 size={12} /> 
                        ) : (
                            <Database size={12} />
                        )}
                        {isBackingUp ? 'Processing Archival...' : 
                        backupStatus === 'success' ? 'Snapshot Secured' : 
                        backupStatus === 'error' ? 'Archival Failed' : 
                        'Save Stable Recovery Point'}
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                    <button 
                        onClick={onReset}
                        className="py-3 rounded-xl border border-white/5 hover:border-red-500/30 bg-white/2 hover:bg-red-500/10 text-[9px] font-bold text-slate-500 hover:text-red-400 uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                    >
                        <RotateCcw size={12} />
                        Reset Layout
                    </button>
                    <button 
                        onClick={() => {
                            if (window.confirm('Sync with Source File? This will inject missing nodes from the source.')) {
                                onReset();
                            }
                        }}
                        className="py-3 rounded-xl border border-white/5 hover:border-brand-cyan/30 bg-white/2 hover:bg-brand-cyan/10 text-[9px] font-bold text-slate-500 hover:text-brand-cyan uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                    >
                        <RefreshCw size={12} />
                        Sync Source
                    </button>
                    </div>
                </div>
                )}

                <div className="flex items-center justify-between px-2 py-1 bg-brand-cyan/5 rounded-[8px] border border-brand-cyan/10 mt-2">
                <span className="text-[8px] font-black text-brand-cyan/60 uppercase">Total Entities</span>
                <span className="text-[10px] font-mono font-bold text-brand-cyan">{nodes.length} Items</span>
                </div>

            </div>
        )}

        <div className="flex-1 overflow-auto custom-scrollbar p-6 space-y-8">
            <AnimatePresence mode="wait">
              {activeTab === 'spatial' ? (
                 <motion.div key="spatial-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-slate-300 space-y-6 text-sm leading-relaxed pb-20">
                    <div className="bg-brand-cyan/5 border border-brand-cyan/20 rounded-xl p-6">
                       <h3 className="text-lg font-bold text-white mb-2 italic tracking-tight">HIVE:MESH Volumetric Architecture</h3>
                       <p className="text-brand-cyan/80">Designing a 3D space for plotting radial relationship diagrams involves moving away from the traditional Cartesian grid (X, Y, Z) and instead thinking in terms of spherical coordinates and hierarchical orbits.</p>
                       <p className="mt-4">In this kind of visualization—often referred to as a 3D radial tree or a 3D force-directed graph—the structural layout is built around a central focal point, and relationships radiate outward in three dimensions.</p>
                    </div>

                    <div className="space-y-6 pl-2 pr-4">
                       <div>
                          <h4 className="text-md font-bold text-white mb-3 flex items-center gap-2"><div className="w-1.5 h-1.5 bg-brand-cyan rounded-full"/>1. The Coordinate System: Spherical Geometry</h4>
                          <p className="mb-2">To plot items radially in 3D space, you calculate their positions using three values:</p>
                          <ul className="list-disc pl-6 space-y-2 text-slate-400">
                             <li><strong className="text-white">Radius (r):</strong> The distance from the center. In a relationship diagram, the radius typically represents the hierarchical depth or "degrees of separation" from the central topic.</li>
                             <li><strong className="text-white">Polar Angle (θ):</strong> The vertical tilt (like latitude on a globe).</li>
                             <li><strong className="text-white">Azimuthal Angle (φ):</strong> The horizontal rotation around the center (like longitude on a globe).</li>
                          </ul>
                          <p className="mt-3 text-slate-400">By translating these spherical coordinates back into 3D space, you form concentric, invisible "shells" or spheres around the origin where your data points will live.</p>
                       </div>

                       <div>
                          <h4 className="text-md font-bold text-white mb-3 flex items-center gap-2"><div className="w-1.5 h-1.5 bg-brand-cyan rounded-full"/>2. Plotting the Entities (Nodes)</h4>
                          <ul className="list-disc pl-6 space-y-2 text-slate-400">
                             <li><strong className="text-white">The Central Hub:</strong> The core concept or root node is plotted at the exact origin of the 3D space <code className="bg-white/10 px-1 rounded">0, 0, 0</code>.</li>
                             <li><strong className="text-white">Concentric Layers:</strong> First-degree connections are plotted on the smallest inner sphere. Second-degree connections are plotted on a larger, outer sphere, and so on.</li>
                             <li><strong className="text-white">Spatial Distribution:</strong> To prevent nodes from overlapping on these spherical shells, algorithms (like the Fibonacci lattice or force-directed repulsion) are used to evenly distribute the points across the surface area of their respective orbital layers.</li>
                          </ul>
                       </div>

                       <div>
                          <h4 className="text-md font-bold text-white mb-3 flex items-center gap-2"><div className="w-1.5 h-1.5 bg-brand-cyan rounded-full"/>3. Plotting the Relationships (Connecting Lines)</h4>
                          <p className="mb-2">Connecting lines (edges) are crucial for showing the web of relationships. In a 3D space, plotting lines requires specific techniques to avoid visual clutter:</p>
                          <ul className="list-disc pl-6 space-y-2 text-slate-400">
                             <li><strong className="text-white">Hierarchical Links:</strong> These lines connect the central hub to the first layer, and the first layer to the second layer. They form the "spokes" of the radial design.</li>
                             <li><strong className="text-white">Lateral Links:</strong> These lines connect nodes that exist on the same spherical layer (e.g., two related sub-topics that share the same parent).</li>
                             <li><strong className="text-white">Arcing vs. Straight Lines:</strong> While straight lines are computationally cheaper, 3D diagrams often use Bezier curves (arcing lines) for connections. If you draw straight lines between two nodes on opposite sides of a sphere, the line cuts right through the center, creating a messy core. Arcing the lines so they curve along the surface of the imaginary sphere keeps the center hollow and readable.</li>
                          </ul>
                       </div>

                       <div>
                          <h4 className="text-md font-bold text-white mb-3 flex items-center gap-2"><div className="w-1.5 h-1.5 bg-brand-cyan rounded-full"/>4. Navigational Mechanics</h4>
                          <p className="mb-2">Because 3D space suffers from occlusion (nodes in the front blocking nodes in the back), the space must inherently support interaction:</p>
                          <ul className="list-disc pl-6 space-y-2 text-slate-400">
                             <li><strong className="text-white">Orbit Controls:</strong> The camera must be able to pan and rotate 360 degrees around the central origin.</li>
                             <li><strong className="text-white">Depth Filtering:</strong> The ability to hide outer layers or fade out unselected branches, allowing the user to focus on a specific structural path without getting overwhelmed by the "hairball" effect of too many crossing lines.</li>
                          </ul>
                       </div>
                    </div>
                 </motion.div>
              ) : activeTab === 'ingest' ? (
                 <motion.div key="ingest-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <ImportManager nodes={nodes} onApplyChanges={onApplyAIProposal} />
                 </motion.div>
              ) : activeTab === 'map' ? (
                 <motion.div key="map-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <URLMapper nodes={nodes} onApplyAIProposal={onApplyAIProposal} />
                 </motion.div>
              ) : activeTab === 'defs' ? (
                <motion.div key="defs-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6 pb-32">
                   <div className="p-4 bg-brand-cyan/10 border border-brand-cyan/20 rounded-xl mb-4">
                      <div className="flex items-center gap-2 text-brand-cyan mb-1">
                         <Info size={14} />
                         <span className="text-[10px] font-black uppercase tracking-widest">Architectural Guidance</span>
                      </div>
                      <p className="text-[10px] text-slate-400 italic leading-relaxed">
                         Define the semantic meaning of each node type. These descriptions will be used to train the AI agent for dynamic hierarchy expansion.
                      </p>
                   </div>

                   {Object.entries(ENTITY_TYPES).map(([key, config]) => (
                     <div key={key} className="space-y-4 p-6 bg-white/[0.02] border border-white/5 rounded-2xl shadow-lg">
                        <div className="flex items-center justify-between">
                           <div className="flex items-center gap-3">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: config.color }} />
                              <span className="text-[11px] font-black text-white uppercase tracking-wider">{config.label}</span>
                           </div>
                           <span className="text-[8px] font-mono text-slate-600 tracking-tighter">TYPE_ID: {key}</span>
                        </div>
                        
                        {config.guidance && (
                           <div className="pl-6 border-l border-white/5 space-y-1">
                              {config.guidance.split('\n').map((line, i) => (
                                 <p key={i} className="text-[9px] text-slate-500 uppercase font-black leading-tight tracking-tighter">{line}</p>
                              ))}
                           </div>
                        )}

                        <textarea 
                           className="w-full bg-black/40 border border-white/5 rounded-xl p-4 text-[11px] text-slate-300 min-h-[100px] outline-none focus:border-brand-cyan/30 transition-all placeholder:text-slate-700 placeholder:italic"
                           placeholder={config.examples || "Enter custom protocol..."}
                           defaultValue={""} 
                           onBlur={(e) => {
                               console.log(`Updated ${key} definition:`, e.target.value);
                           }}
                        />
                     </div>
                   ))}
                </motion.div>
              ) : activeTab === 'tree' ? (
                <motion.div key="tree-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8 pb-32">
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

                  {/* Feature Blueprint */}
                  <div className="space-y-4">
                     <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block border-b border-white/5 pb-2">HIVE:MESH User Guide</span>
                     
                     <div className="grid grid-cols-1 gap-1.5">
                        {[
                          { 
                            cat: 'The Map', 
                            items: [
                              { n: 'Smooth Motion', d: 'Panning and zooming feels natural and fluid, like a high-end map app.' },
                              { n: '8-Way Pilot', d: 'Fly through the map in any direction using your keyboard or the circular thumbstick.' },
                              { n: 'Auto-Centering', d: 'Stops you from wandering off into empty space by keeping items in view.' },
                              { n: 'Viewport Lock', d: 'Persists your camera position across sessions, ensuring you never lose your place.' }
                            ] 
                          },
                          { 
                            cat: 'The Tools', 
                            items: [
                              { n: 'Instant Backup', d: 'Saves a complete, secure snapshot of all files and folders to your computer in one click.' },
                              { n: 'Focus Mode', d: 'Dims and blurs unrelated items so you can focus on a specific node and its connections.' },
                              { n: 'Mini-map', d: 'A small preview window that lets you "scrub" across the entire enterprise structure.' },
                              { n: 'Structural Audit', d: 'Analyze the deep file architecture and system dependencies directly from the Admin Panel.' }
                            ] 
                          },
                          { 
                            cat: 'Knowledge', 
                            items: [
                              { n: 'Smart Link Tagging', d: 'Link nodes together instantly just by typing their name in brackets inside the description.' },
                              { n: 'Entity Promotion', d: 'Automatically turns regular text into interactive, clickable nodes with one tap.' },
                              { n: 'Connection Control', d: 'Turn relationship lines on or off directly from the text descriptions.' },
                              { n: 'Reparenting', d: 'Move entire branches of the hierarchy instantly using the Move icon.' }
                            ] 
                          },
                          { 
                            cat: 'Safety', 
                            items: [
                              { n: 'Waste Bin', d: 'Safely recover items you’ve deleted. Nothing is truly gone until you empty the bin.' },
                              { n: 'Hierarchy Audit', d: 'See at a glance where every node belongs in the hierarchy or transverse links.' },
                              { n: 'Live Auto-Save', d: 'Your changes are synced the moment you make them, protecting against crashes.' },
                              { n: 'Collision Elasticity', d: 'Radial layout engine that prevents node overlaps while allowing dense compaction.' }
                            ] 
                          }
                        ].map(f => (
                           <div key={f.cat} className="p-3 bg-white/[0.02] rounded-xl border border-white/5 space-y-3">
                              <div className="text-[8px] font-black text-brand-cyan mb-2 uppercase tracking-tighter bg-brand-cyan/5 px-2 py-1 rounded-md inline-block">{f.cat}</div>
                              <div className="flex flex-wrap gap-2">
                                 {f.items.map(i => (
                                     <div 
                                       key={i.n} 
                                       onMouseEnter={() => setHoveredFeature(i)}
                                       onMouseLeave={() => setHoveredFeature(null)}
                                       className="text-[9px] text-slate-400 bg-white/5 px-2.5 py-1.5 rounded-lg cursor-help hover:bg-brand-cyan/20 hover:text-brand-cyan hover:border-brand-cyan/40 transition-all border border-white/5 font-bold"
                                     >
                                       {i.n}
                                     </div>
                                 ))}
                              </div>
                           </div>
                         ))}旋旋)}
                     </div>
                  </div>

                  {/* System Configuration */}
                  <div className="space-y-4">
                     <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block border-b border-white/5 pb-2">Configuration</span>
                     <div className="space-y-2">
                        <div className="flex justify-between text-[11px] p-4 border border-white/5 rounded-xl bg-black/20 italic">
                           <span className="text-slate-500">backup_path</span>
                           <span className="text-brand-cyan font-bold truncate max-w-[200px]">D:/backups/...</span>
                        </div>
                        <div className="flex justify-between text-[11px] p-4 border border-white/5 rounded-xl bg-black/20 italic">
                           <span className="text-slate-500">engine_status</span>
                           <span className="text-brand-cyan font-bold">Fluid (60fps)</span>
                        </div>
                     </div>
                  </div>
                </motion.div>
              ) : activeTab === 'system' ? (
                <motion.div key="system-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8 pb-32">
                   <div className="space-y-4">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block border-b border-white/5 pb-2">Core System Architecture</span>
                      
                      <div className="grid grid-cols-1 gap-2">
                         {[
                           { 
                             cat: 'Application Core', 
                             files: [
                               { n: 'App.jsx', d: 'The System Brain. Orchestrates state management, the radial layout engine, and viewport transitions.' },
                               { n: 'index.css', d: 'The Aesthetic Core. Defines the design system tokens, glassmorphic effects, and motion physics.' },
                               { n: 'ThemeContext.jsx', d: 'Theme Provider. Persists user interface preferences and color identity across the component tree.' }
                             ] 
                           },
                           { 
                             cat: 'Mesh & Canvas', 
                             files: [
                               { n: 'MeshCanvas.jsx', d: 'The Interaction Engine. High-performance canvas renderer for enterprise hierarchy and connection physics.' },
                               { n: 'OrbitalNav.jsx', d: 'The Spatial Pilot. Implements HUD-based thumbstick controls and map-scale navigation.' }
                             ] 
                           },
                           { 
                             cat: 'Knowledge Intelligence', 
                             files: [
                               { n: 'IntelligenceDrawer.jsx', d: 'The Knowledge Forge. Rich-text editor for node semantic metadata and hierarchical tagging.' },
                               { n: 'AdminPanel.jsx', d: 'Architectural Controller. Provides tools for hierarchy auditing, data sync, and system archival.' }
                             ] 
                           },
                           { 
                             cat: 'Data Fabric', 
                             files: [
                               { n: 'mesh_authority.js', d: 'The Golden Source. Authoritative enterprise hierarchy definition in JavaScript format.' },
                               { n: 'nodes.js', d: 'Entity Blueprints. Defines the internal schema and visual identity for all node types.' }
                             ] 
                           }
                         ].map(group => (
                           <div key={group.cat} className="p-4 bg-white/[0.02] rounded-xl border border-white/5 space-y-3">
                              <div className="text-[8px] font-black text-brand-cyan uppercase tracking-widest">{group.cat}</div>
                              <div className="flex flex-col gap-1.5">
                                 {group.files.map(f => (
                                   <div 
                                     key={f.n}
                                     onMouseEnter={() => setHoveredFeature(f)}
                                     onMouseLeave={() => setHoveredFeature(null)}
                                     className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/5 transition-all group cursor-help"
                                   >
                                      <Box size={14} className="text-slate-700 group-hover:text-brand-cyan transition-colors" />
                                      <span className="text-[11px] font-bold text-slate-400 group-hover:text-white">{f.n}</span>
                                   </div>
                                 ))}
                              </div>
                           </div>
                         ))}
                      </div>
                   </div>
                </motion.div>
              ) : (
                <motion.div key="bin-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                   {deletedNodes.length > 0 ? (
                      <div className="space-y-3 pb-32">
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

            {/* Side-Car Help Pane */}
            <AnimatePresence>
              {hoveredFeature && (
                <motion.div 
                   initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                   className="absolute bottom-20 left-6 right-6 p-5 bg-slate-900/90 backdrop-blur-3xl border border-brand-cyan/20 rounded-2xl shadow-2xl z-50 pointer-events-none"
                >
                   <div className="flex items-center gap-2 mb-2">
                     <Info size={10} className="text-brand-cyan" />
                     <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-cyan">{hoveredFeature.n}</span>
                   </div>
                   <p className="text-[11px] text-slate-300 leading-relaxed italic">{hoveredFeature.d}</p>
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
