import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronDown, Search, Database, RefreshCw, Layers, Trash2, RotateCcw, Box, Palette, Info, Zap, Link2, CheckCircle2, Globe } from 'lucide-react';
import { ENTITY_TYPES } from '../../data/nodes';
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
        className="flex items-center gap-2 py-1.5 px-3 rounded-lg cursor-pointer transition-colors hover:bg-[var(--glass-border)] group"
        style={{ paddingLeft: `${level * 16 + 12}px` }}
        onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setIsOpen(!isOpen);
            onSelect(node);
        }}
      >
        <div className="w-4 h-4 flex items-center justify-center">
            {hasChildren ? (
                isOpen ? <ChevronDown size={12} className="text-[var(--text-muted)]" /> : <ChevronRight size={12} className="text-[var(--text-muted)]" />
            ) : (
                <div className="w-1.5 h-px bg-[var(--glass-border)]" />
            )}
        </div>
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color }} />
        <span className="text-[11px] font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] truncate">{node.title}</span>
      </div>
      
      {hasChildren && isOpen && (
        <div className="border-l border-[var(--glass-border)] ml-4">
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
  theme,
  onClose, 
  onFocusNode, 
  onRestoreNode, 
  onReset, 
  onBackup, 
  layoutRules, 
  setLayoutRules, 
  applyLayout,
  onApplyAIProposal,
  onReviewSync
}) => {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupStatus, setBackupStatus] = useState(null); // 'success' | 'error' | null
  const [hoveredFeature, setHoveredFeature] = useState(null);

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('tree'); // 'tree' | 'bin' | 'defs' | 'ingest' | 'map'
  const rootNodes = nodes.filter(n => !n.parentId);

  // Cloudflare Tunnel State
  const [tunnelState, setTunnelState] = useState({
    status: 'disconnected',
    url: '',
    error: '',
    logs: []
  });
  const [isTunnelActionLoading, setIsTunnelActionLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || activeTab !== 'sharing') return;

    let active = true;
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/tunnel/status');
        const data = await res.json();
        if (active) {
          setTunnelState(data);
        }
      } catch (err) {
        console.error('Error fetching tunnel status:', err);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isOpen, activeTab]);

  const handleToggleTunnel = async () => {
    setIsTunnelActionLoading(true);
    const isRunning = tunnelState.status === 'connected' || tunnelState.status === 'connecting';
    const endpoint = isRunning ? '/api/tunnel/stop' : '/api/tunnel/start';
    
    try {
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      setTunnelState(prev => ({
        ...prev,
        status: data.status,
        url: data.url || prev.url
      }));
    } catch (err) {
      console.error('Error toggling tunnel:', err);
    } finally {
      setIsTunnelActionLoading(false);
    }
  };

  const filteredNodes = search 
    ? nodes.filter(n => n.title.toLowerCase().includes(search.toLowerCase()))
    : [];

  return (
    <div className="fixed inset-0 z-[70000] flex items-center justify-center p-6 pointer-events-auto">
      {/* Centered Modal Overlay */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-[30px]" 
        onClick={onClose} 
      />

      {/* Centered Modal Container */}
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 220 }}
        className="relative w-full max-w-6xl h-[85vh] rounded-[var(--radius-xl)] shadow-2xl flex flex-col overflow-hidden border border-[var(--glass-border)] bg-[var(--bg-secondary)] backdrop-blur-[40px] z-10 text-[var(--text-primary)]"
        onMouseDown={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="p-6 border-b border-[var(--glass-border)] flex justify-between items-center bg-[var(--bg-elevated)]/30">
            <div className="flex flex-col">
                <div className="flex items-center gap-3">
                    <Layers size={16} className="text-[var(--accent-cyan)]" />
                    <h2 className="text-lg font-bold italic tracking-tight text-[var(--text-primary)]">Admin Panel</h2>
                </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-[var(--glass-border)] rounded-full transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={22} /></button>
        </div>

        {/* Tab Selector Mode Switcher */}
        <div className="px-6 py-4 border-b border-[var(--glass-border)] bg-[var(--bg-secondary)]/50">
           <div className="mode-switcher p-1 rounded-full flex gap-1 bg-[var(--bg-tertiary)] border border-[var(--glass-border)] w-full overflow-x-auto scrollbar-none" style={{ maxWidth: 'none' }}>
              <div 
                onClick={() => setActiveTab('tree')}
                className={`mode-item ${activeTab === 'tree' ? 'active' : ''}`}
              >
                <Layers size={14} />
                <span>Hierarchy</span>
              </div>
              <div 
                onClick={() => setActiveTab('map')}
                className={`mode-item ${activeTab === 'map' ? 'active' : ''}`}
              >
                <Link2 size={14} />
                <span>Map URLs</span>
              </div>
              <div 
                onClick={() => setActiveTab('ingest')}
                className={`mode-item ${activeTab === 'ingest' ? 'active' : ''}`}
              >
                <Database size={14} />
                <span>Ingest</span>
              </div>
              <div 
                onClick={() => setActiveTab('sharing')}
                className={`mode-item ${activeTab === 'sharing' ? 'active' : ''}`}
              >
                <Globe size={14} />
                <span>External Share</span>
              </div>
              <div 
                onClick={() => setActiveTab('defs')}
                className={`mode-item ${activeTab === 'defs' ? 'active' : ''}`}
              >
                <Info size={14} />
                <span>Node Definitions</span>
              </div>
              <div 
                onClick={() => setActiveTab('bin')}
                className={`mode-item ${activeTab === 'bin' ? 'active' : ''}`}
                style={activeTab === 'bin' ? { background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#ef4444' } : {}}
              >
                <Trash2 size={14} />
                <span>Deleted</span>
              </div>
              <div 
                onClick={() => setActiveTab('system')}
                className={`mode-item ${activeTab === 'system' ? 'active' : ''}`}
              >
                <Box size={14} />
                <span>Structure</span>
              </div>
              <div 
                onClick={() => setActiveTab('spatial')}
                className={`mode-item ${activeTab === 'spatial' ? 'active' : ''}`}
              >
                <Zap size={14} />
                <span>Spatial Logic</span>
              </div>
           </div>
        </div>

        {(activeTab === 'tree' || activeTab === 'bin') && (
            <div className="p-6 space-y-4">
                <div className="relative">
                    <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input 
                        className="w-full bg-[var(--bg-elevated)] border border-[var(--glass-border)] rounded-xl py-4 pl-12 pr-4 text-xs focus:border-brand-cyan/40 outline-none transition-all placeholder:text-[var(--text-muted)] text-[var(--text-primary)]"
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
                            backupStatus === 'success' ? 'bg-[var(--accent-emerald)]/20 border-[var(--accent-emerald)]/50 text-[var(--accent-emerald)]' :
                            backupStatus === 'error' ? 'bg-[var(--status-red)]/20 border-[var(--status-red)]/50 text-[var(--status-red)]' :
                            'bg-[var(--bg-elevated)] border border-[var(--glass-border)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] hover:border-[var(--glass-border-hover)] hover:shadow-[var(--shadow-glow)]'
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
                        className="py-3 rounded-xl border border-[var(--glass-border)] hover:border-red-500/30 bg-[var(--bg-elevated)] hover:bg-red-500/10 text-[9px] font-bold text-[var(--text-muted)] hover:text-red-400 uppercase tracking-widest transition-all flex items-center justify-center gap-2"
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
                        className="py-3 rounded-xl border border-[var(--glass-border)] hover:border-brand-cyan/30 bg-[var(--bg-elevated)] hover:bg-brand-cyan/10 text-[9px] font-bold text-[var(--text-muted)] hover:text-[var(--accent-cyan)] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                    >
                        <RefreshCw size={12} />
                        Sync Source
                    </button>
                    </div>
                </div>
                )}

                <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg-elevated)] rounded-xl border border-[var(--glass-border)] mt-2">
                <span className="text-[9px] font-bold text-[var(--text-secondary)] uppercase">Total Entities</span>
                <span className="text-[11px] font-mono font-bold text-[var(--accent-cyan)]">{nodes.length} Items</span>
                </div>

            </div>
        )}

        <div className="flex-1 overflow-auto custom-scrollbar p-6 space-y-8">
            <AnimatePresence mode="wait">
              {activeTab === 'spatial' ? (
                 <motion.div key="spatial-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[var(--text-secondary)] space-y-6 text-sm leading-relaxed pb-20">
                    <div className="bg-[var(--accent-cyan)]/5 border border-[var(--accent-cyan)]/20 rounded-xl p-6">
                       <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2 italic tracking-tight">HIVE:MESH Volumetric Architecture</h3>
                       <p className="text-[var(--accent-cyan)]/80">Designing a 3D space for plotting radial relationship diagrams involves moving away from the traditional Cartesian grid (X, Y, Z) and instead thinking in terms of spherical coordinates and hierarchical orbits.</p>
                       <p className="mt-4">In this kind of visualization—often referred to as a 3D radial tree or a 3D force-directed graph—the structural layout is built around a central focal point, and relationships radiate outward in three dimensions.</p>
                    </div>

                    <div className="space-y-6 pl-2 pr-4">
                       <div>
                          <h4 className="text-md font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2"><div className="w-1.5 h-1.5 bg-[var(--accent-cyan)] rounded-full"/>1. The Coordinate System: Spherical Geometry</h4>
                          <p className="mb-2">To plot items radially in 3D space, you calculate their positions using three values:</p>
                          <ul className="list-disc pl-6 space-y-2 text-[var(--text-secondary)]">
                             <li><strong className="text-[var(--text-primary)]">Radius (r):</strong> The distance from the center. In a relationship diagram, the radius typically represents the hierarchical depth or "degrees of separation" from the central topic.</li>
                             <li><strong className="text-[var(--text-primary)]">Polar Angle:</strong> The vertical tilt (like latitude on a globe).</li>
                             <li><strong className="text-[var(--text-primary)]">Azimuthal Angle (f):</strong> The horizontal rotation around the center (like longitude on a globe).</li>
                          </ul>
                          <p className="mt-3 text-[var(--text-muted)]">By translating these spherical coordinates back into 3D space, you form concentric, invisible "shells" or spheres around the origin where your data points will live.</p>
                       </div>

                       <div>
                          <h4 className="text-md font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2"><div className="w-1.5 h-1.5 bg-[var(--accent-cyan)] rounded-full"/>2. Plotting the Entities (Nodes)</h4>
                          <ul className="list-disc pl-6 space-y-2 text-[var(--text-secondary)]">
                             <li><strong className="text-[var(--text-primary)]">The Central Hub:</strong> The core concept or root node is plotted at the exact origin of the 3D space <code className="bg-[var(--bg-elevated)] border border-[var(--glass-border)] px-1.5 py-0.5 rounded font-mono text-[var(--text-primary)]">0, 0, 0</code>.</li>
                             <li><strong className="text-[var(--text-primary)]">Concentric Layers:</strong> First-degree connections are plotted on the smallest inner sphere. Second-degree connections are plotted on a larger, outer sphere, and so on.</li>
                             <li><strong className="text-[var(--text-primary)]">Spatial Distribution:</strong> To prevent nodes from overlapping on these spherical shells, algorithms (like the Fibonacci lattice or force-directed repulsion) are used to evenly distribute the points across the surface area of their respective orbital layers.</li>
                          </ul>
                       </div>

                       <div>
                          <h4 className="text-md font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2"><div className="w-1.5 h-1.5 bg-[var(--accent-cyan)] rounded-full"/>3. Plotting the Relationships (Connecting Lines)</h4>
                          <p className="mb-2">Connecting lines (edges) are crucial for showing the web of relationships. In a 3D space, plotting lines requires specific techniques to avoid visual clutter:</p>
                          <ul className="list-disc pl-6 space-y-2 text-[var(--text-secondary)]">
                             <li><strong className="text-[var(--text-primary)]">Hierarchical Links:</strong> These lines connect the central hub to the first layer, and the first layer to the second layer. They form the "spokes" of the radial design.</li>
                             <li><strong className="text-[var(--text-primary)]">Lateral Links:</strong> These lines connect nodes that exist on the same spherical layer (e.g., two related sub-topics that share the same parent).</li>
                             <li><strong className="text-[var(--text-primary)]">Arcing vs. Straight Lines:</strong> While straight lines are computationally cheaper, 3D diagrams often use Bezier curves (arcing lines) for connections. If you draw straight lines between two nodes on opposite sides of a sphere, the line cuts right through the center, creating a messy core. Arcing the lines so they curve along the surface of the imaginary sphere keeps the center hollow and readable.</li>
                          </ul>
                       </div>

                       <div>
                          <h4 className="text-md font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2"><div className="w-1.5 h-1.5 bg-[var(--accent-cyan)] rounded-full"/>4. Navigational Mechanics</h4>
                          <p className="mb-2">Because 3D space suffers from occlusion (nodes in the front blocking nodes in the back), the space must inherently support interaction:</p>
                          <ul className="list-disc pl-6 space-y-2 text-[var(--text-secondary)]">
                             <li><strong className="text-[var(--text-primary)]">Orbit Controls:</strong> The camera must be able to pan and rotate 360 degrees around the central origin.</li>
                             <li><strong className="text-[var(--text-primary)]">Depth Filtering:</strong> The ability to hide outer layers or fade out unselected branches, allowing the user to focus on a specific structural path without getting overwhelmed by the "hairball" effect of too many crossing lines.</li>
                          </ul>
                       </div>
                    </div>
                 </motion.div>
              ) : activeTab === 'sharing' ? (
                 <motion.div key="sharing-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6 pb-20">
                    <div className="bg-[var(--accent-cyan)]/5 border border-[var(--accent-cyan)]/25 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                       <div className="space-y-1">
                          <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                            <Globe size={16} className="text-[var(--accent-cyan)]" />
                            <span>Public Sharing Engine</span>
                          </h3>
                          <p className="text-[11px] text-[var(--text-secondary)]">Expose this Information Management System externally using your persistent, custom ngrok static domain.</p>
                       </div>
                       
                       <button 
                         onClick={handleToggleTunnel}
                         disabled={isTunnelActionLoading}
                         className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 ${
                           tunnelState.status === 'connected' ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white' :
                           tunnelState.status === 'connecting' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 cursor-wait' :
                           'bg-[var(--accent-cyan)]/10 border-[var(--accent-cyan)]/30 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)] hover:text-black'
                         }`}
                       >
                         {isTunnelActionLoading || tunnelState.status === 'connecting' ? (
                           <RefreshCw size={14} className="animate-spin" />
                         ) : (
                           <Globe size={14} />
                         )}
                         <span>
                           {tunnelState.status === 'connected' ? 'Disconnect ngrok Tunnel' :
                            tunnelState.status === 'connecting' ? 'Connecting...' :
                            'Launch ngrok Tunnel'}
                         </span>
                       </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                       <div className="md:col-span-1 p-6 bg-[var(--bg-elevated)] border border-[var(--glass-border)] rounded-2xl space-y-4">
                          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-muted)]">Tunnel Status</h4>
                          
                          <div className="space-y-3">
                             <div className="flex justify-between items-center text-xs">
                                <span className="text-[var(--text-secondary)]">Status</span>
                                <span className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase font-mono ${
                                  tunnelState.status === 'connected' ? 'bg-emerald-500/10 text-emerald-400' :
                                  tunnelState.status === 'connecting' ? 'bg-amber-500/10 text-amber-500' :
                                  tunnelState.status === 'error' ? 'bg-red-500/10 text-red-500' :
                                  'bg-black/40 text-[var(--text-muted)]'
                                }`}>
                                  {tunnelState.status}
                                </span>
                             </div>

                             {tunnelState.status === 'connected' && tunnelState.url && (
                                <div className="space-y-2 pt-2 border-t border-[var(--glass-border)]">
                                   <span className="text-[10px] text-[var(--text-muted)] block font-bold">Public Address</span>
                                   <div className="flex items-center gap-1.5 p-2 bg-black/40 border border-[var(--glass-border)] rounded-lg">
                                      <input 
                                        type="text" 
                                        readOnly 
                                        value={tunnelState.url}
                                        className="bg-transparent border-none text-[10px] font-mono text-[var(--accent-cyan)] outline-none flex-1 min-w-0"
                                      />
                                      <button 
                                        onClick={() => {
                                          navigator.clipboard.writeText(tunnelState.url);
                                          alert('Copied tunnel URL to clipboard!');
                                        }}
                                        className="p-1 hover:bg-white/5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                                        title="Copy Public URL"
                                      >
                                         <CheckCircle2 size={12} className="text-emerald-400" />
                                      </button>
                                   </div>
                                </div>
                             )}

                             {tunnelState.error && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-[10px] text-red-500 leading-normal">
                                   <strong>Launch Failure:</strong> {tunnelState.error}
                                </div>
                             )}
                          </div>
                       </div>

                       <div className="md:col-span-2 p-6 bg-[var(--bg-elevated)] border border-[var(--glass-border)] rounded-2xl flex flex-col min-h-[260px]">
                          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-muted)] mb-3">Tunnel System Logs</h4>
                          <div className="flex-1 bg-black/40 border border-[var(--glass-border)] rounded-xl p-4 font-mono text-[10px] text-[var(--text-secondary)] overflow-y-auto space-y-1.5 custom-scrollbar min-h-[160px] max-h-[220px]">
                             {tunnelState.logs && tunnelState.logs.length > 0 ? (
                               tunnelState.logs.map((log, index) => (
                                 <div key={index} className="whitespace-pre-wrap leading-relaxed border-b border-white/[0.02] pb-1 font-mono">{log}</div>
                               ))
                             ) : (
                               <div className="text-[var(--text-muted)] italic text-center py-10">Waiting for tunnel session initialization...</div>
                             )}
                          </div>
                       </div>
                    </div>
                 </motion.div>
              ) : activeTab === 'ingest' ? (
                 <motion.div key="ingest-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <ImportManager nodes={nodes} onApplyChanges={onApplyAIProposal} />
                 </motion.div>
              ) : activeTab === 'map' ? (
                 <motion.div key="map-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <URLMapper nodes={nodes} onReviewSync={onReviewSync} />
                 </motion.div>
              ) : activeTab === 'defs' ? (
                 <motion.div key="defs-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6 pb-32">
                    <div className="p-4 bg-[var(--accent-cyan)]/10 border border-[var(--accent-cyan)]/20 rounded-xl mb-4">
                       <div className="flex items-center gap-2 text-[var(--accent-cyan)] mb-1">
                          <Info size={14} />
                          <span className="text-[10px] font-black uppercase tracking-widest">Architectural Guidance</span>
                       </div>
                       <p className="text-[10px] text-[var(--text-secondary)] italic leading-relaxed">
                          Define the semantic meaning of each node type. These descriptions will be used to train the AI agent for dynamic hierarchy expansion.
                       </p>
                    </div>

                    {Object.entries(ENTITY_TYPES).map(([key, config]) => (
                      <div key={key} className="space-y-4 p-6 bg-[var(--bg-elevated)]/50 border border-[var(--glass-border)] rounded-2xl shadow-lg">
                         <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                               <div className="w-3 h-3 rounded-full" style={{ backgroundColor: config.color }} />
                               <span className="text-[11px] font-black text-[var(--text-primary)] uppercase tracking-wider">{config.label}</span>
                            </div>
                            <span className="text-[8px] font-mono text-[var(--text-muted)] tracking-tighter">TYPE_ID: {key}</span>
                         </div>
                         
                         {config.guidance && (
                            <div className="pl-6 border-l border-[var(--glass-border)] space-y-1">
                                {config.guidance.split('\n').map((line, i) => (
                                  <p key={i} className="text-[9px] text-[var(--text-secondary)] uppercase font-black leading-tight tracking-tighter">{line}</p>
                               ))}
                            </div>
                         )}

                         <textarea 
                            className="w-full bg-[var(--bg-elevated)] border border-[var(--glass-border)] rounded-xl p-4 text-[11px] text-[var(--text-primary)] min-h-[100px] outline-none focus:border-brand-cyan/30 transition-all placeholder:text-[var(--text-muted)] placeholder:italic"
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
                     <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest block border-b border-[var(--glass-border)] pb-2">Mesh Hierarchy</span>
                     {search ? (
                       <div className="space-y-1">
                           {filteredNodes.length > 0 ? filteredNodes.map(n => (
                               <div 
                                   key={n.id} 
                                   onClick={() => onFocusNode(n)}
                                   className="flex items-center gap-3 py-3 px-4 rounded-xl hover:bg-[var(--bg-elevated)] cursor-pointer border border-transparent hover:border-[var(--glass-border)] transition-all active:scale-[0.98]"
                               >
                                    <div className="w-2 h-2 rounded-full shadow-[0_0_10px_currentColor]" style={{ backgroundColor: ENTITY_TYPES[n.type]?.color, color: ENTITY_TYPES[n.type]?.color }} />
                                    <span className="text-[11px] font-bold text-[var(--text-primary)]">{n.title}</span>
                                </div>
                           )) : (
                               <div className="p-10 text-center text-[var(--text-muted)] text-[10px] italic">No relational matches found.</div>
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
                     <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest block border-b border-[var(--glass-border)] pb-2">HIVE:MESH User Guide</span>
                     
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
                           <div key={f.cat} className="p-3 bg-[var(--bg-elevated)] rounded-xl border border-[var(--glass-border)] space-y-3">
                              <div className="text-[8px] font-black text-[var(--accent-cyan)] mb-2 uppercase tracking-tighter bg-[var(--accent-cyan)]/5 px-2 py-1 rounded-md inline-block">{f.cat}</div>
                              <div className="flex flex-wrap gap-2">
                                 {f.items.map(i => (
                                     <div 
                                       key={i.n} 
                                       onMouseEnter={() => setHoveredFeature(i)}
                                       onMouseLeave={() => setHoveredFeature(null)}
                                       className="text-[9px] text-[var(--text-secondary)] bg-[var(--bg-primary)] px-2.5 py-1.5 rounded-lg cursor-help hover:bg-[var(--accent-cyan)]/10 hover:text-[var(--accent-cyan)] hover:border-[var(--accent-cyan)]/30 transition-all border border-[var(--glass-border)] font-bold"
                                     >
                                       {i.n}
                                     </div>
                                 ))}
                              </div>
                           </div>
                         ))}
                     </div>
                  </div>

                  {/* System Configuration */}
                  <div className="space-y-4">
                     <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest block border-b border-[var(--glass-border)] pb-2">Configuration</span>
                     <div className="space-y-2">
                        <div className="flex justify-between text-[11px] p-4 border border-[var(--glass-border)] rounded-xl bg-[var(--bg-elevated)] italic">
                           <span className="text-[var(--text-muted)]">backup_path</span>
                           <span className="text-[var(--accent-cyan)] font-bold truncate max-w-[200px]">D:/backups/...</span>
                        </div>
                        <div className="flex justify-between text-[11px] p-4 border border-[var(--glass-border)] rounded-xl bg-[var(--bg-elevated)] italic">
                           <span className="text-[var(--text-muted)]">engine_status</span>
                           <span className="text-[var(--accent-cyan)] font-bold">Fluid (60fps)</span>
                        </div>
                     </div>
                  </div>
                </motion.div>
              ) : activeTab === 'system' ? (
                <motion.div key="system-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8 pb-32">
                   <div className="space-y-4">
                      <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest block border-b border-[var(--glass-border)] pb-2">Core System Architecture</span>
                      
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
                           <div key={group.cat} className="p-4 bg-[var(--bg-elevated)] rounded-xl border border-[var(--glass-border)] space-y-3">
                              <div className="text-[8px] font-black text-[var(--accent-cyan)] uppercase tracking-widest">{group.cat}</div>
                              <div className="flex flex-col gap-1.5">
                                 {group.files.map(f => (
                                   <div 
                                     key={f.n}
                                     onMouseEnter={() => setHoveredFeature(f)}
                                     onMouseLeave={() => setHoveredFeature(null)}
                                     className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-[var(--bg-elevated)] border border-transparent hover:border-[var(--glass-border)] transition-all group cursor-help"
                                   >
                                      <Box size={14} className="text-[var(--text-muted)] group-hover:text-[var(--accent-cyan)] transition-colors" />
                                      <span className="text-[11px] font-bold text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">{f.n}</span>
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
                            <div key={n.id} className="flex items-center justify-between p-4 bg-[var(--bg-elevated)] border border-[var(--glass-border)] rounded-2xl group hover:border-[var(--glass-border-hover)] transition-all">
                               <div className="flex items-center gap-3">
                                  <div className="w-2 h-2 rounded-full opacity-50" style={{ backgroundColor: ENTITY_TYPES[n.type]?.color }} />
                                  <div className="flex flex-col">
                                     <span className="text-[11px] font-bold text-[var(--text-primary)] group-hover:text-[var(--text-primary)] transition-colors">{n.title}</span>
                                     <span className="text-[8px] uppercase tracking-widest text-[var(--text-muted)] font-black">{ENTITY_TYPES[n.type]?.label}</span>
                                  </div>
                                </div>
                               <button 
                                 onClick={() => onRestoreNode(n.id)}
                                 className="p-2.5 bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)] hover:text-white transition-all rounded-lg flex items-center gap-2 text-[8px] font-black uppercase border border-[var(--accent-cyan)]/25"
                                >
                                  <RotateCcw size={14} />
                                  Restore
                               </button>
                            </div>
                         ))}
                      </div>
                   ) : (
                      <div className="h-64 flex flex-col items-center justify-center text-[var(--text-muted)]">
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
                   className="absolute bottom-20 left-6 right-6 p-5 bg-[var(--bg-tertiary)] border border-[var(--glass-border)] rounded-2xl shadow-2xl z-50 pointer-events-none"
                >
                   <div className="flex items-center gap-2 mb-2">
                     <Info size={10} className="text-[var(--accent-cyan)]" />
                     <span className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--accent-cyan)]">{hoveredFeature.n}</span>
                   </div>
                   <p className="text-[11px] text-[var(--text-primary)] leading-relaxed italic">{hoveredFeature.d}</p>
                </motion.div>
              )}
            </AnimatePresence>
        </div>

        <div className="p-8 border-t border-[var(--glass-border)] bg-[var(--bg-elevated)]/50 text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-[0.3em] text-center">
            Mesh App Version: 1.4.0
        </div>
      </motion.div>
    </div>
  );
};
