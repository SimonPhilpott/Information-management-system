import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronDown, Search, Database, RefreshCw, Layers, Trash2, RotateCcw, Box, Palette, Info, Zap, Link2, CheckCircle2, Globe, History, Shield, Sparkles, Cpu, Mic, Radio, Check, Terminal } from 'lucide-react';
import { ENTITY_TYPES } from '../../data/nodes';
import { ImportManager } from './ImportManager';
import { URLMapper } from './URLMapper';
import { RulebookScraper } from './RulebookScraper';
import { IMPORTANCE_TIERS } from '../Editor/IntelligenceDrawer';
import { Tooltip } from '../Dashboard/CursorHover';
import { useDraggableScroll } from '../../hooks/useDraggableScroll';

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
          {children.map((child, idx) => (
            <TreeItem key={`node-${child.id || 'c'}-${level + 1}-${idx}`} node={child} nodes={nodes} level={level + 1} onSelect={onSelect} />
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
  onReviewSync,
  onGetMeshBackups,
  onCreateMeshBackup,
  onRestoreMeshBackup
}) => {
  const { scrollRef, isDragging, handlers } = useDraggableScroll();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupStatus, setBackupStatus] = useState(null); // 'success' | 'error' | null
  const [hoveredFeature, setHoveredFeature] = useState(null);

  const [meshBackups, setMeshBackups] = useState([]);
  const [isMeshBackingUp, setIsMeshBackingUp] = useState(false);
  const [meshBackupStatus, setMeshBackupStatus] = useState(null);
  const [previewingBackup, setPreviewingBackup] = useState(null);

  const loadMeshBackups = async () => {
    if (!onGetMeshBackups) return;
    try {
      const data = await onGetMeshBackups();
      setMeshBackups(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadMeshBackups();
    }
  }, [isOpen]);

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

  // Spatial Simulator Playground states
  const [pgParentDistance, setPgParentDistance] = useState(65);
  const [pgChildGap, setPgChildGap] = useState(45);
  const [pgSiblingMultiplier, setPgSiblingMultiplier] = useState(0.35);
  const [pgConnectionTension, setPgConnectionTension] = useState(60);

  useEffect(() => {
    if (!isOpen || activeTab !== 'sharing') return;

    // Detect if we are already being accessed via the ngrok tunnel.
    // If so, the tunnel is clearly active even if the API endpoint returns
    // 'disconnected' (e.g. because the API call is being proxied through ngrok
    // and the local server's state was reset).
    const NGROK_DOMAIN = 'ngrok-free.app';
    const isAccessedViaNgrok = window.location.hostname.includes(NGROK_DOMAIN) ||
                                window.location.hostname.includes('ngrok.io');

    let active = true;
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/tunnel/status');
        const data = await res.json();
        if (active) {
          // If the API says disconnected but we are on the ngrok URL, override
          // the status to connected so the UI accurately reflects reality.
          if (isAccessedViaNgrok && data.status === 'disconnected') {
            setTunnelState(prev => ({
              ...data,
              status: 'connected',
              url: data.url || window.location.origin,
            }));
          } else {
            setTunnelState(data);
          }
        }
      } catch (err) {
        // If the API call fails entirely but we're on ngrok, still show connected.
        if (active && isAccessedViaNgrok) {
          setTunnelState(prev => ({
            ...prev,
            status: 'connected',
            url: prev.url || window.location.origin,
          }));
        } else {
          console.error('Error fetching tunnel status:', err);
        }
      }
    };

    // Also seed connected state immediately if accessed via ngrok —
    // avoids the flash of 'disconnected' while the first fetch resolves.
    if (isAccessedViaNgrok) {
      setTunnelState(prev => ({
        ...prev,
        status: 'connected',
        url: prev.url || window.location.origin,
      }));
    }

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
        className="relative w-[calc(100vw-100px)] h-[calc(100vh-100px)] max-w-none rounded-[var(--radius-xl)] shadow-2xl flex flex-col overflow-hidden border border-[var(--glass-border)] bg-[var(--bg-secondary)] backdrop-blur-[40px] z-10 text-[var(--text-primary)]"
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
            <div 
               ref={scrollRef}
               {...handlers}
               className="mode-switcher p-1 rounded-full flex gap-1 bg-[var(--bg-tertiary)] border border-[var(--glass-border)] w-full overflow-x-auto scrollbar-none" 
               style={{ 
                 maxWidth: 'none',
                 cursor: isDragging ? 'grabbing' : 'grab',
                 userSelect: 'none'
               }}
            >
               <div 
                 onClick={() => !isDragging && setActiveTab('features')}
                 className={`mode-item ${activeTab === 'features' ? 'active' : ''}`}
                 style={activeTab === 'features' ? { background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.35)', color: '#c084fc' } : {}}
               >
                 <Sparkles size={14} />
                 <span>Features</span>
               </div>
               <div 
                 onClick={() => !isDragging && setActiveTab('tree')}
                 className={`mode-item ${activeTab === 'tree' ? 'active' : ''}`}
               >
                 <Layers size={14} />
                 <span>Hierarchy</span>
               </div>
               <div 
                 onClick={() => !isDragging && setActiveTab('map')}
                 className={`mode-item ${activeTab === 'map' ? 'active' : ''}`}
               >
                 <Link2 size={14} />
                 <span>Map URLs</span>
               </div>
               <div 
                 onClick={() => !isDragging && setActiveTab('ingest')}
                 className={`mode-item ${activeTab === 'ingest' ? 'active' : ''}`}
               >
                 <Database size={14} />
                 <span>Ingest</span>
               </div>
               <div 
                 onClick={() => !isDragging && setActiveTab('scraper')}
                 className={`mode-item ${activeTab === 'scraper' ? 'active' : ''}`}
                 style={activeTab === 'scraper' ? { background: 'rgba(6, 182, 212, 0.15)', border: '1px solid rgba(6, 182, 212, 0.25)', color: '#06b6d4' } : {}}
               >
                 <Terminal size={14} />
                 <span>Rulebooks</span>
               </div>
               <div 
                 onClick={() => !isDragging && setActiveTab('sharing')}
                 className={`mode-item ${activeTab === 'sharing' ? 'active' : ''}`}
               >
                 <Globe size={14} />
                 <span>External Share</span>
               </div>
               <div 
                 onClick={() => !isDragging && setActiveTab('defs')}
                 className={`mode-item ${activeTab === 'defs' ? 'active' : ''}`}
               >
                 <Info size={14} />
                 <span>Node Definitions</span>
               </div>
               <div 
                 onClick={() => !isDragging && setActiveTab('bin')}
                 className={`mode-item ${activeTab === 'bin' ? 'active' : ''}`}
                 style={activeTab === 'bin' ? { background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.25)', color: '#ef4444' } : {}}
               >
                 <Trash2 size={14} />
                 <span>Deleted</span>
               </div>
               <div 
                 onClick={() => !isDragging && setActiveTab('system')}
                 className={`mode-item ${activeTab === 'system' ? 'active' : ''}`}
               >
                 <Box size={14} />
                 <span>Structure</span>
               </div>
               <div 
                 onClick={() => !isDragging && setActiveTab('spatial')}
                 className={`mode-item ${activeTab === 'spatial' ? 'active' : ''}`}
               >
                 <Zap size={14} />
                 <span>Spatial Logic</span>
               </div>
               <div 
                 onClick={() => !isDragging && setActiveTab('checkpoints')}
                 className={`mode-item ${activeTab === 'checkpoints' ? 'active' : ''}`}
                 style={activeTab === 'checkpoints' ? { background: 'rgba(6, 182, 212, 0.15)', border: '1px solid rgba(6, 182, 212, 0.25)', color: '#06b6d4' } : {}}
               >
                 <History size={14} />
                 <span>Checkpoints</span>
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
                    <div className="bg-[var(--accent-cyan)]/5 border border-[var(--accent-cyan)]/25 rounded-xl p-6">
                       <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2 italic tracking-tight">IMS Graph Engine: Spatial Physics & Layout Simulator</h3>
                       <p className="text-[var(--accent-cyan)]/90">
                         This interactive playground simulates the layout physics of the multi-projection spatial engines. Adjust the sliders below to visualize how the coordinate system transforms spherical orbits, distributes sibling nodes, and shapes connection tension curves.
                       </p>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start pl-2 pr-4">
                       {/* LEFT PANEL: Variables, Sliders & Math */}
                       <div className="xl:col-span-6 space-y-6">
                          
                          {/* Interactive Sliders */}
                          <div className="p-6 bg-[var(--bg-elevated)] border border-[var(--glass-border)] rounded-2xl space-y-6">
                             <h4 className="text-xs font-black uppercase tracking-widest text-[var(--text-primary)] border-b border-[var(--glass-border)] pb-2 flex items-center gap-2">
                                <Zap size={12} className="text-[var(--accent-cyan)]" /> Layout Physics Controls
                             </h4>

                             {/* Slider: Parent Distance */}
                             <div className="space-y-2">
                                <div className="flex justify-between items-center text-xs">
                                   <span className="font-bold text-[var(--text-primary)] font-mono">parentDistance (d)</span>
                                   <span className="text-[var(--accent-cyan)] font-mono font-bold bg-[var(--accent-cyan)]/10 px-2 py-0.5 rounded">{pgParentDistance}px</span>
                                </div>
                                <input 
                                   type="range" 
                                   min="30" 
                                   max="120" 
                                   value={pgParentDistance} 
                                   onChange={(e) => setPgParentDistance(Number(e.target.value))}
                                   className="w-full h-1 bg-[var(--glass-border)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-cyan)] outline-none"
                                />
                                <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                                   <strong>Level Spacing:</strong> Sets how far child nodes are pushed away from their parent folders. Widen this if you want a more spread-out tree.
                                </p>
                             </div>

                             {/* Slider: Child Gap */}
                             <div className="space-y-2">
                                <div className="flex justify-between items-center text-xs">
                                   <span className="font-bold text-[var(--text-primary)] font-mono">childGap (g)</span>
                                   <span className="text-[var(--accent-cyan)] font-mono font-bold bg-[var(--accent-cyan)]/10 px-2 py-0.5 rounded">{pgChildGap}°</span>
                                </div>
                                <input 
                                   type="range" 
                                   min="15" 
                                   max="90" 
                                   value={pgChildGap} 
                                   onChange={(e) => setPgChildGap(Number(e.target.value))}
                                   className="w-full h-1 bg-[var(--glass-border)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-cyan)] outline-none"
                                />
                                <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                                   <strong>Fanning Angle:</strong> Controls the angle/spread between sibling items. A higher angle fans them out widely, while a smaller angle clusters them tightly.
                                </p>
                             </div>

                             {/* Slider: Sibling Multiplier */}
                             <div className="space-y-2">
                                <div className="flex justify-between items-center text-xs">
                                   <span className="font-bold text-[var(--text-primary)] font-mono">siblingMultiplier (s)</span>
                                   <span className="text-[var(--accent-cyan)] font-mono font-bold bg-[var(--accent-cyan)]/10 px-2 py-0.5 rounded">{(pgSiblingMultiplier).toFixed(2)}x</span>
                                </div>
                                <input 
                                   type="range" 
                                   min="10" 
                                   max="80" 
                                   value={pgSiblingMultiplier * 100} 
                                   onChange={(e) => setPgSiblingMultiplier(Number(e.target.value) / 100)}
                                   className="w-full h-1 bg-[var(--glass-border)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-cyan)] outline-none"
                                />
                                <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                                   <strong>Extra Overlap Cushion:</strong> Adds a spacing buffer between neighboring text labels to make sure names don't write over each other.
                                </p>
                             </div>

                             {/* Slider: Connection Tension */}
                             <div className="space-y-2">
                                <div className="flex justify-between items-center text-xs">
                                   <span className="font-bold text-[var(--text-primary)] font-mono">connectionTension (t)</span>
                                   <span className="text-[var(--accent-cyan)] font-mono font-bold bg-[var(--accent-cyan)]/10 px-2 py-0.5 rounded">{pgConnectionTension}%</span>
                                </div>
                                <input 
                                   type="range" 
                                   min="0" 
                                   max="100" 
                                   value={pgConnectionTension} 
                                   onChange={(e) => setPgConnectionTension(Number(e.target.value))}
                                   className="w-full h-1 bg-[var(--glass-border)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-cyan)] outline-none"
                                />
                                <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                                   <strong>Line Straightness:</strong> At 100%, links are straight lines. Lowering this bows the lines into smooth, looping arcs to prevent them from cutting through the central hub.
                                </p>
                             </div>
                          </div>

                          {/* Coordinate Math HUD */}
                           <div className="p-6 bg-[var(--bg-elevated)] border border-[var(--glass-border)] rounded-2xl space-y-4">
                              <h4 className="text-xs font-black uppercase tracking-widest text-[var(--text-primary)] border-b border-[var(--glass-border)] pb-2">
                                 Spherical Coordinate Translation Formula
                              </h4>
                              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                 In the 3D radial mesh system, node placements are first calculated as spherical coordinates (a radius $r$, a vertical polar angle $\theta$ representing vertical tilt, and a horizontal azimuthal angle $\phi$ representing horizontal rotation around the center), then mapped to Cartesian 3D coordinates $(X, Y, Z)$ for viewport rendering:
                              </p>
                              <div className="bg-black/40 p-4 rounded-xl border border-[var(--glass-border)] font-mono text-[10px] text-[var(--accent-cyan)] space-y-2">
                                 <div>r = depth * parentDistance <span className="text-[var(--text-muted)]">// Concentric layer radius</span></div>
                                 <div>X = r * sin(θ) * cos(φ)</div>
                                 <div>Y = r * sin(θ) * sin(φ)</div>
                                 <div>Z = r * cos(θ)</div>
                              </div>
                           </div>
                       </div>

                       {/* RIGHT PANEL: Interactive SVG Simulator Canvas */}
                       <div className="xl:col-span-6 space-y-4">
                          <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--glass-border)] rounded-2xl flex flex-col justify-between items-center relative overflow-hidden h-[540px] bg-radial-gradient">
                             {/* Floating HUD info */}
                             <div className="absolute top-4 left-4 z-10 p-3 bg-black/60 border border-[var(--glass-border)] rounded-xl backdrop-blur-md pointer-events-none space-y-1.5 font-mono text-[9px] text-[var(--text-secondary)]">
                                <div className="text-[var(--accent-cyan)] font-bold uppercase tracking-wider text-[10px] mb-1">Simulator HUD</div>
                                <div>Radial Spread Angle: <span className="text-white font-bold">{pgChildGap}°</span></div>
                                <div>Tension Stiffness: <span className="text-white font-bold">{(pgConnectionTension / 100).toFixed(2)}</span></div>
                                <div>Math Mode: <span className="text-[var(--accent-cyan)]">Bezier Orthogonal</span></div>
                             </div>

                             {/* SVG Canvas Simulator */}
                             <svg viewBox="-250 -250 500 500" className="w-full h-full select-none cursor-grab active:cursor-grabbing">
                                {/* Grid rings */}
                                <circle cx="0" cy="0" r={pgParentDistance} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="3,3" />
                                <circle cx="0" cy="0" r={pgParentDistance * 2} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="3,3" />

                                {/* Render Connection Lines first (so nodes stack on top) */}
                                {(() => {
                                   const renderBezierLink = (x1, y1, x2, y2) => {
                                      if (pgConnectionTension === 100) {
                                         return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--accent-cyan)" strokeWidth="1.5" strokeOpacity="0.4" strokeDasharray="3,3" />;
                                      }
                                      // Compute Bezier control point based on connection tension
                                      const mx = (x1 + x2) / 2;
                                      const my = (y1 + y2) / 2;
                                      
                                      // Project control point outwards orthogonally
                                      const dx = x2 - x1;
                                      const dy = y2 - y1;
                                      const len = Math.sqrt(dx*dx + dy*dy);
                                      const ux = -dy / (len || 1);
                                      const uy = dx / (len || 1);
                                      
                                      const tensionFactor = (100 - pgConnectionTension) * 0.45;
                                      const cx = mx + ux * tensionFactor;
                                      const cy = my + uy * tensionFactor;

                                      return <path d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`} fill="none" stroke="var(--accent-cyan)" strokeWidth="1.5" strokeOpacity="0.55" strokeDasharray="3,3" />;
                                   };

                                   // Root (0,0) -> Level 1 (3 children)
                                   const links = [];
                                   const l1Count = 3;
                                   const l2Count = 2; // grandchildren per child

                                   for (let i = 0; i < l1Count; i++) {
                                      // Level 1 positions
                                      const angle1 = (i * 120 * Math.PI) / 180;
                                      const x1 = pgParentDistance * Math.cos(angle1);
                                      const y1 = pgParentDistance * Math.sin(angle1);
                                      
                                      links.push(renderBezierLink(0, 0, x1, y1));

                                      // Level 2 (grandchildren fanning from level 1)
                                      for (let j = 0; j < l2Count; j++) {
                                         const fanOffset = (j === 0 ? -1 : 1) * pgChildGap * (1 + pgSiblingMultiplier) * Math.PI / 180;
                                         const angle2 = angle1 + fanOffset;
                                         const x2 = (pgParentDistance * 2) * Math.cos(angle2);
                                         const y2 = (pgParentDistance * 2) * Math.sin(angle2);

                                         links.push(renderBezierLink(x1, y1, x2, y2));
                                      }
                                   }
                                   return links;
                                })()}

                                {/* Render Nodes & Labels */}
                                {(() => {
                                   const nodes = [];
                                   const l1Count = 3;
                                   const l2Count = 2;

                                   // 1. Root Node
                                   nodes.push(
                                      <g key="root">
                                         <circle cx="0" cy="0" r="10" fill="var(--accent-cyan)" className="animate-pulse shadow-lg" />
                                         <text x="0" y="-18" textAnchor="middle" fill="white" className="text-[10px] font-black uppercase font-sans">Root Hub</text>
                                      </g>
                                   );

                                   // 2. Level 1 & 2
                                   for (let i = 0; i < l1Count; i++) {
                                      const angle1 = (i * 120 * Math.PI) / 180;
                                      const x1 = pgParentDistance * Math.cos(angle1);
                                      const y1 = pgParentDistance * Math.sin(angle1);

                                      nodes.push(
                                         <g key={`l1-${i}`}>
                                            <circle cx={x1} cy={y1} r="7" fill="var(--accent-indigo)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                                            <text x={x1} y={y1 - 12} textAnchor="middle" fill="var(--text-primary)" className="text-[8px] font-bold">Node L1-{i + 1}</text>
                                         </g>
                                      );

                                      for (let j = 0; j < l2Count; j++) {
                                         const fanOffset = (j === 0 ? -1 : 1) * pgChildGap * (1 + pgSiblingMultiplier) * Math.PI / 180;
                                         const angle2 = angle1 + fanOffset;
                                         const x2 = (pgParentDistance * 2) * Math.cos(angle2);
                                         const y2 = (pgParentDistance * 2) * Math.sin(angle2);

                                         nodes.push(
                                            <g key={`l2-${i}-${j}`}>
                                               <circle cx={x2} cy={y2} r="5" fill="var(--bg-elevated)" stroke="var(--accent-cyan)" strokeWidth="1.5" />
                                               <text x={x2} y={y2 + 12} textAnchor="middle" fill="var(--text-muted)" className="text-[7px] font-mono">L2-{i+1}-{j+1}</text>
                                            </g>
                                         );
                                      }
                                   }
                                   return nodes;
                                })()}
                             </svg>
                             <div className="w-full text-center text-[10px] text-[var(--text-muted)] italic pb-2">
                                Live physics simulation rendering coordinate translation, Bezier interpolation, and sibling repulsion.
                             </div>
                          </div>

                          {/* Detailed Mathematical Explanations (Appended Below Playground) */}
                          <div className="border-t border-[var(--glass-border)] pt-8 mt-4 space-y-6">
                             <div>
                                <h4 className="text-md font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                                   <div className="w-1.5 h-1.5 bg-[var(--accent-cyan)] rounded-full"/>
                                   1. How Node Positions Are Calculated (Concentric Orbits)
                                </h4>
                                <p className="mb-2 text-xs text-[var(--text-secondary)] leading-relaxed">
                                   Instead of using a simple flat grid, the layout engine arranges items in circular orbits (concentric layers) fanning outward from the center. The distance of each level from the center is calculated as:
                                </p>
                                <div className="bg-black/30 p-3 rounded-lg border border-[var(--glass-border)] font-mono text-[10px] my-2 text-[var(--accent-cyan)] max-w-md">
                                   radius = depth * parentDistance
                                </div>
                                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                   This places the Root Hub at the exact center (coordinate <code className="font-mono text-xs">0, 0, 0</code>), Level-1 child nodes on a ring at <code className="font-mono text-xs">1 * parentDistance</code>, and Level-2 grandchild nodes on a wider outer ring at <code className="font-mono text-xs">2 * parentDistance</code>. The direction a node points is determined by fanning them out evenly.
                                </p>
                             </div>

                             <div>
                                <h4 className="text-md font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                                   <div className="w-1.5 h-1.5 bg-[var(--accent-cyan)] rounded-full"/>
                                   2. Overlap Prevention (Sibling Spacing)
                                </h4>
                                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                   To ensure text labels don't overlap, the engine calculates a spacing buffer between neighboring items. The angle offset between child nodes is fanned out using:
                                </p>
                                <div className="bg-black/30 p-3 rounded-lg border border-[var(--glass-border)] font-mono text-[10px] my-2 text-[var(--accent-cyan)] max-w-md">
                                   Spread Angle = childGap * (1 + siblingMultiplier)
                                </div>
                                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                   Increasing `siblingMultiplier (s)` widens this angle, pushing neighboring nodes and text labels apart so they stay readable even when there are many items.
                                </p>
                             </div>

                             <div>
                                <h4 className="text-md font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                                   <div className="w-1.5 h-1.5 bg-[var(--accent-cyan)] rounded-full"/>
                                   3. Connection Curves & Tension
                                </h4>
                                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                   To prevent connection lines from crossing straight through the center and cluttering the graph, the engine draws curved paths (Bezier curves). The peak curve height is controlled by `connectionTension`:
                                </p>
                                <div className="bg-black/30 p-3 rounded-lg border border-[var(--glass-border)] font-mono text-[10px] my-2 text-[var(--accent-cyan)] max-w-md">
                                   Curve Depth = (100 - connectionTension) * scale
                                </div>
                                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                   At 100% tension, the curve depth becomes zero (completely straight lines). Reducing the tension pulls the curve outward, bowing the line into a smooth, elegant arc that wraps nicely around the center.
                                </p>
                             </div>
                          </div>
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
              ) : activeTab === 'scraper' ? (
                 <motion.div key="scraper-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <RulebookScraper />
                 </motion.div>
              ) : activeTab === 'map' ? (
                 <motion.div key="map-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <URLMapper nodes={nodes} onReviewSync={onReviewSync} />
                 </motion.div>
              ) : activeTab === 'defs' ? (
                 <motion.div key="defs-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8 pb-32">
                    <div className="p-4 bg-[var(--accent-cyan)]/10 border border-[var(--accent-cyan)]/20 rounded-xl mb-4">
                       <div className="flex items-center gap-2 text-[var(--accent-cyan)] mb-1">
                          <Info size={14} />
                          <span className="text-[10px] font-black uppercase tracking-widest">Architectural & Metadata Guidance</span>
                       </div>
                       <p className="text-[10px] text-[var(--text-secondary)] italic leading-relaxed">
                          Define the semantic meaning of each node type and importance priority tier. These parameters train the AI agent for dynamic RAG hierarchy reasoning.
                       </p>
                    </div>

                    {/* --- NODE TYPE DEFINITIONS SECTION --- */}
                    <div className="space-y-4">
                      <h3 className="text-xs font-black uppercase tracking-[0.15em] text-[var(--text-muted)] border-b border-[var(--glass-border)] pb-2 flex items-center gap-2">
                        <Layers size={12} /> Node Classifications
                      </h3>
                      {Object.entries(ENTITY_TYPES).map(([key, config]) => {
                        const storageKey = `hive_def_desc_${key}`;
                        const savedDesc = localStorage.getItem(storageKey) || config.description || '';
                        const storageExamplesKey = `hive_def_examples_${key}`;
                        const savedExamples = localStorage.getItem(storageExamplesKey) || config.examples || '';
                        const storageMappingKey = `hive_def_mapping_${key}`;
                        const savedMapping = localStorage.getItem(storageMappingKey) || config.mappingSummary || '';

                        return (
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

                             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                  <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Classification Summary</label>
                                  <textarea 
                                     className="w-full bg-[var(--bg-elevated)] border border-[var(--glass-border)] rounded-xl p-3 text-[11px] text-[var(--text-primary)] min-h-[90px] outline-none focus:border-brand-cyan/30 transition-all placeholder:text-[var(--text-muted)] placeholder:italic"
                                     placeholder="Enter class description..."
                                     defaultValue={savedDesc} 
                                     onBlur={(e) => {
                                         localStorage.setItem(storageKey, e.target.value);
                                         config.description = e.target.value;
                                     }}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Mapping Summary</label>
                                  <textarea 
                                     className="w-full bg-[var(--bg-elevated)] border border-[var(--glass-border)] rounded-xl p-3 text-[11px] text-[var(--text-primary)] min-h-[90px] outline-none focus:border-brand-cyan/30 transition-all placeholder:text-[var(--text-muted)] placeholder:italic"
                                     placeholder="Enter mapping details..."
                                     defaultValue={savedMapping} 
                                     onBlur={(e) => {
                                         localStorage.setItem(storageMappingKey, e.target.value);
                                         config.mappingSummary = e.target.value;
                                     }}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Examples</label>
                                  <textarea 
                                     className="w-full bg-[var(--bg-elevated)] border border-[var(--glass-border)] rounded-xl p-3 text-[11px] text-[var(--text-primary)] min-h-[90px] outline-none focus:border-brand-cyan/30 transition-all placeholder:text-[var(--text-muted)] placeholder:italic"
                                     placeholder="Enter real-world examples..."
                                     defaultValue={savedExamples} 
                                     onBlur={(e) => {
                                         localStorage.setItem(storageExamplesKey, e.target.value);
                                         config.examples = e.target.value;
                                     }}
                                  />
                                </div>
                             </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* --- IMPORTANCE TIER DEFINITIONS SECTION --- */}
                    <div className="space-y-4 pt-6">
                      <h3 className="text-xs font-black uppercase tracking-[0.15em] text-[var(--text-muted)] border-b border-[var(--glass-border)] pb-2 flex items-center gap-2">
                        <Palette size={12} /> Importance Tiers
                      </h3>
                      {IMPORTANCE_TIERS.map((tier) => {
                        const storageKey = `hive_tier_desc_${tier.id}`;
                        const savedDesc = localStorage.getItem(storageKey) || tier.description || '';
                        const storageMappingKey = `hive_tier_mapping_${tier.id}`;
                        const savedMapping = localStorage.getItem(storageMappingKey) || tier.mappingSummary || '';
                        const storageExamplesKey = `hive_tier_examples_${tier.id}`;
                        const savedExamples = localStorage.getItem(storageExamplesKey) || '';

                        return (
                          <div key={tier.id} className="space-y-4 p-6 bg-[var(--bg-elevated)]/50 border border-[var(--glass-border)] rounded-2xl shadow-lg">
                             <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                   <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tier.color }} />
                                   <span className="text-[11px] font-black text-[var(--text-primary)] uppercase tracking-wider">{tier.label}</span>
                                </div>
                                <span className="text-[8px] font-mono text-[var(--text-muted)] tracking-tighter">TIER_ID: T{tier.id}</span>
                             </div>

                             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                  <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Tier Summary</label>
                                  <textarea 
                                     className="w-full bg-[var(--bg-elevated)] border border-[var(--glass-border)] rounded-xl p-3 text-[11px] text-[var(--text-primary)] min-h-[90px] outline-none focus:border-brand-cyan/30 transition-all placeholder:text-[var(--text-muted)] placeholder:italic"
                                     placeholder="Enter tier description..."
                                     defaultValue={savedDesc} 
                                     onBlur={(e) => {
                                         localStorage.setItem(storageKey, e.target.value);
                                         tier.description = e.target.value;
                                     }}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Mapping Summary</label>
                                  <textarea 
                                     className="w-full bg-[var(--bg-elevated)] border border-[var(--glass-border)] rounded-xl p-3 text-[11px] text-[var(--text-primary)] min-h-[90px] outline-none focus:border-brand-cyan/30 transition-all placeholder:text-[var(--text-muted)] placeholder:italic"
                                     placeholder="Enter mapping details..."
                                     defaultValue={savedMapping} 
                                     onBlur={(e) => {
                                         localStorage.setItem(storageMappingKey, e.target.value);
                                         tier.mappingSummary = e.target.value;
                                     }}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Examples</label>
                                  <textarea 
                                     className="w-full bg-[var(--bg-elevated)] border border-[var(--glass-border)] rounded-xl p-3 text-[11px] text-[var(--text-primary)] min-h-[90px] outline-none focus:border-brand-cyan/30 transition-all placeholder:text-[var(--text-muted)] placeholder:italic"
                                     placeholder="Enter real-world examples..."
                                     defaultValue={savedExamples} 
                                     onBlur={(e) => {
                                         localStorage.setItem(storageExamplesKey, e.target.value);
                                     }}
                                  />
                                </div>
                             </div>
                          </div>
                        );
                      })}
                    </div>
                 </motion.div>
              ) : activeTab === 'features' ? (
                 <motion.div key="features-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6 pb-32">
                    <div className="flex items-center justify-between border-b border-[var(--glass-border)] pb-3">
                       <div className="flex items-center gap-2.5">
                          <Sparkles size={16} className="text-purple-400" />
                          <span className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)]">Platform Features & Capabilities Registry</span>
                       </div>
                       <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/25">10 Active Core Engines</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       {[
                         {
                           title: 'HNSW Vector Index Acceleration',
                           tag: 'AI & SEMANTIC SEARCH',
                           status: 'ACCELERATED',
                           color: '#06b6d4',
                           description: 'High-performance in-process Hierarchical Navigable Small World (HNSW) vector graph with sub-millisecond similarity lookups and real-time SSE progress streaming.',
                           bullets: [
                             'In-process C++ binding via hnswlib-node for 768-dimensional embeddings',
                             'Real-time SSE progress bar streaming file & vector counters',
                             'Automatic background HNSW graph compilation upon sync and document indexing',
                             'Auto disk persistence loading (hnsw_index.bin & hnsw_meta.json)',
                             'Sub-millisecond query lookups (~1.2ms) with linear search fallback'
                           ]
                         },
                         {
                           title: 'Gemini Live Multimodal Voice Engine',
                           tag: 'AUDIO & CONVERSATION',
                           status: 'LIVE STREAM',
                           color: '#a855f7',
                           description: 'Bidirectional real-time voice streaming with Gemini 3.1 Flash Live, hardware acoustic echo cancellation, and conversational tool calling.',
                           bullets: [
                             'Interactive Lock/Unlock toggle persisting voice choice across sessions',
                             'Robust 180ms jitter lead-time buffer preventing packet underrun pauses',
                             '30-second silence inactivity auto-close watchdog',
                             'extendKeepAlive tool for "hang on" / "wait a moment" pauses',
                             'Natural farewell auto-disconnect for "bye", "take it easy", "goodbye"'
                           ]
                         },
                         {
                           title: 'Port Status & Tunnel Probing Service',
                           tag: 'INFRASTRUCTURE',
                           status: 'OPERATIONAL',
                           color: '#10b981',
                           description: 'Server-side multi-service health checking endpoint at GET /api/port-status ensuring accurate diagnostics locally and over ngrok tunnels.',
                           bullets: [
                             'Vite portStatusPlugin probes ports 6001, 3001, 5173 server-side',
                             'Ngrok tunnel status monitored via agent API (localhost:4040)',
                             'Relative /api/port-status routing works transparently via tunnel',
                             'Proxy bypass rules preventing collision with port 3001 backend',
                             'SyncStatus.jsx polling telemetry indicator in dashboard bottom bar'
                           ]
                         },
                         {
                           title: '3D Spatial Knowledge Graph',
                           tag: 'VISUALISATION',
                           status: 'ACTIVE',
                           color: '#3b82f6',
                           description: '3D network mesh visualizing parent-child organizational hierarchy, secondary transverse links, and interactive entity nodes.',
                           bullets: [
                             'Three.js / React Three Fiber force-directed canvas',
                             'Entity-type coloured pill label borders with depth scaling',
                             'Curved outward-bowing transverse bezier connections',
                             'Top-right 2D minimap navigation control and scrub viewport',
                             'Floating toolbar with projection, layout, and appearance toggles'
                           ]
                         },
                         {
                           title: 'Hierarchical SVG Sunburst Visualisation',
                           tag: 'EXPLORATION',
                           status: 'ACTIVE',
                           color: '#f59e0b',
                           description: 'Interactive concentric nested radial SVG chart showcasing node hierarchy, clicked-based zoom/drill-down, and curved secondary transverse links.',
                           bullets: [
                             'Concentric ring layers (depth 0 to 4) representing entity-type hierarchies',
                             'Proportional sector angular sweep based on subtree weights',
                             'Click-to-zoom interactive drill-down focus pivoting',
                             'Hover glassmorphic metadata cards and title path tooltip popups',
                             'Flipped rotated text labels ensuring zero upside-down rendering'
                           ]
                         },
                         {
                           title: 'SharePoint Portal View',
                           tag: 'ENTERPRISE UI',
                           status: 'ACTIVE',
                           color: '#0284c7',
                           description: 'SharePoint Portal View for the Node Information Panel/Drawer with hierarchical navigation menus and child node inheritance.',
                           bullets: [
                             'Toggle control between Standard View and SharePoint Portal View',
                             'Dynamic deep-blue hierarchical navigation bar with multi-level dropdowns',
                             'Parent node title and node type badge indicators',
                             'Large prominent blue card depicting the node definition summary',
                             'Child node text area cards inheriting descending definitions'
                           ]
                         },
                         {
                           title: 'PDF Research Workspace & RAG',
                           tag: 'KNOWLEDGE BASE',
                           status: 'ACTIVE',
                           color: '#ef4444',
                           description: 'Split-screen document viewer integrating react-pdf for rendering reference sources side-by-side with chat or mesh graph.',
                           bullets: [
                             'Interactive citations opening specific PDF page targets',
                             'Synchronised page transitions with string integer parsing checks',
                             'Drag-resizable split-pane partition using the global layout resizer',
                             'Isolated topic and table of contents outline extraction'
                           ]
                         },
                         {
                           title: 'Topic Discovery & Session Vault',
                           tag: 'RESEARCH WORKSPACE',
                           status: 'ACTIVE',
                           color: '#8b5cf6',
                           description: 'Dedicated control panel managing research sessions, document library categorization and AI synthesis triggers.',
                           bullets: [
                             'Auto-generated session chat logs and conversation vault',
                             'Topic tag filtering and suggested prompts',
                             'Notebook clipboard for pinning references and drive file sync indicator',
                             'Individual and bulk session deletion with double confirmation safeguards'
                           ]
                         },
                         {
                           title: 'Simplified Demo Portal',
                           tag: 'ANALYTICS',
                           status: 'ACTIVE',
                           color: '#ec4899',
                           description: 'Simplified dashboard portal accessible via /demo route with node catalog overview and embedded Sunburst structure view.',
                           bullets: [
                             'Interactive Sankey Flow Chart mapping capability-to-region paths',
                             'Radial Dependency Wheel drawing neon chords between connected nodes',
                             'Centrality Analytics scatterplot plotting degree against frequency',
                             'Beta Views navigation dropdown providing access to experimental visualizations'
                           ]
                         },
                         {
                           title: 'Oatmeal Premium Theme Layout',
                           tag: 'DESIGN SYSTEM',
                           status: 'ACTIVE',
                           color: '#14b8a6',
                           description: 'Premium theme layout wrapping featuring glassmorphism, responsive sidebar layout with resize handles, and GBP regionalisation.',
                           bullets: [
                             'Interactive top header with model selection and cost telemetry',
                             'Dual-sidebar architecture with resize drag boundaries',
                             'Strict British English (en-GB) and GBP (£) regionalisation',
                             'Direct clipboard screenshot and image pasting support into chat prompt'
                           ]
                         }
                       ].map(feat => (
                          <div key={feat.title} className="p-4 bg-[var(--bg-elevated)] rounded-2xl border border-[var(--glass-border)] space-y-3 hover:border-[var(--glass-border-hover)] transition-all">
                             <div className="flex items-start justify-between gap-2">
                                <div className="space-y-0.5">
                                   <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md" style={{ backgroundColor: `${feat.color}15`, color: feat.color, border: `1px solid ${feat.color}30` }}>
                                      {feat.tag}
                                   </span>
                                   <h3 className="text-[12px] font-bold text-[var(--text-primary)] mt-1.5">{feat.title}</h3>
                                </div>
                                <span className="text-[8px] font-mono font-bold px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] border border-[var(--glass-border)] text-[var(--text-secondary)]">
                                   {feat.status}
                                </span>
                             </div>

                             <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">{feat.description}</p>

                             <div className="pt-2 border-t border-[var(--glass-border)] space-y-1.5">
                                {feat.bullets.map((b, idx) => (
                                   <div key={idx} className="flex items-center gap-2 text-[9px] text-[var(--text-muted)]">
                                      <Check size={11} className="text-emerald-400 flex-shrink-0" />
                                      <span>{b}</span>
                                   </div>
                                ))}
                             </div>
                          </div>
                       ))}
                    </div>
                 </motion.div>
               ) : activeTab === 'system' ? (
                 <motion.div key="system-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8 pb-32">
                    <div className="space-y-4">
                       <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest block border-b border-[var(--glass-border)] pb-2">Core System Architecture & Modules</span>
                       
                       <div className="grid grid-cols-1 gap-2">
                          {[
                            { 
                              cat: 'Application Core', 
                              files: [
                                { n: 'App.jsx', d: 'The System Brain. Orchestrates state management, the radial layout engines, and viewport transitions.' },
                                { n: 'index.css', d: 'The Aesthetic Core. Defines design system tokens, glassmorphic effects, and motion physics.' },
                                { n: 'ThemeContext.jsx', d: 'Theme Provider. Persists user interface preferences and color identity across the component tree.' }
                              ] 
                            },
                            { 
                              cat: 'AI, Live Voice & Vector Acceleration', 
                              files: [
                                { n: 'hnswService.js', d: 'In-Process C++ HNSW Vector Graph Engine. Sub-millisecond similarity lookups (~1.2ms) across 41,000+ chunks.' },
                                { n: 'HnswIndexModal.jsx', d: 'Vector Acceleration Dashboard. Real-time Server-Sent Events (SSE) progress bar and index telemetry.' },
                                { n: 'useGeminiLive.js', d: 'Multimodal Live Voice Engine. Real-time bidirectional streaming, VAD anti-stutter, and farewell auto-disconnect.' },
                                { n: 'ChatInterface.jsx', d: 'Chat & Spoken Interaction UI. Includes voice choice locking, prompt actions, and topic synthesis.' }
                              ] 
                            },
                            { 
                              cat: 'Mesh & Canvas Renderers', 
                              files: [
                                { n: 'SunburstCanvas.jsx', d: 'The Sunburst Engine. Primary concentric nested radial layout canvas with custom arc masking.' },
                                { n: 'InstancedSpatialCanvas.jsx', d: 'The 3D Instanced Engine. High-performance GPU-instanced 3D force-directed canvas.' },
                                { n: 'SpatialCanvas.jsx', d: 'The 3D Standard Engine. Force-directed 3D canvas with full node labels and orbital controls.' },
                                { n: 'MeshCanvas.jsx', d: 'The 2D Engine. High-performance 2D canvas with physics-based nodes and lateral links.' },
                                { n: 'OrbitalNav.jsx', d: 'The Spatial Pilot. Implements HUD-based thumbstick controls and map-scale navigation.' }
                              ] 
                            },
                            { 
                              cat: 'Knowledge Intelligence & Infrastructure', 
                              files: [
                                { n: 'IntelligenceDrawer.jsx', d: 'The Knowledge Forge. Rich-text editor for node semantic metadata and hierarchical tagging.' },
                                { n: 'CatalogBrowser.jsx', d: 'Drive Library Explorer. Interactive document catalog and book subject categorization.' },
                                { n: 'SyncStatus.jsx', d: 'Port Health Telemetry. Server-side multi-port status probing and ngrok tunnel health bar.' },
                                { n: 'AdminPanel.jsx', d: 'Architectural Controller. Provides tools for hierarchy auditing, data sync, and system archival.' }
                              ] 
                            },
                            { 
                              cat: 'Data Fabric & Backend Services', 
                              files: [
                                { n: 'vectorStore.js', d: 'Vector Storage & Auto-Indexing Sync. Manages JSON vector files and HNSW invalidation/rebuild.' },
                                { n: 'driveService.js', d: 'Google Drive Sync Fabric. Handles PDF retrieval, background caching, and auto-categorization.' },
                                { n: 'mesh_authority.js', d: 'The Golden Source. Authoritative enterprise hierarchy definition in JavaScript format.' },
                                { n: 'nodes.js', d: 'Entity Blueprints. Defines internal schema and visual identity for all node types.' }
                              ] 
                            }
                          ].map(group => (
                            <div key={group.cat} className="p-4 bg-[var(--bg-elevated)] rounded-xl border border-[var(--glass-border)] space-y-3">
                               <div className="text-[8px] font-black text-[var(--accent-cyan)] uppercase tracking-widest">{group.cat}</div>
                               <div className="flex flex-col gap-1.5">
                                  {group.files.map(f => (
                                    <Tooltip key={f.n} text={f.d}>
                                      <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-[var(--bg-elevated)] border border-transparent hover:border-[var(--glass-border)] transition-all group cursor-help">
                                         <Box size={14} className="text-[var(--text-muted)] group-hover:text-[var(--accent-cyan)] transition-colors" />
                                         <span className="text-[11px] font-bold text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">{f.n}</span>
                                      </div>
                                    </Tooltip>
                                  ))}
                               </div>
                            </div>
                          ))}
                       </div>
                    </div>
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
                                   key={`search-res-${n.id}`} 
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
                        rootNodes.map((root, idx) => (
                            <TreeItem key={`root-${root.id || idx}-${idx}`} node={root} nodes={nodes} onSelect={onFocusNode} />
                        ))
                     )}
                  </div>

                  {/* Feature Blueprint */}
                  <div className="space-y-4">
                     <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest block border-b border-[var(--glass-border)] pb-2">IMS User Guide</span>
                     
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
                              { n: 'Structural Audit', d: 'Analyse the deep file architecture and system dependencies directly from the Admin Panel.' }
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
                                    <Tooltip key={i.n} text={i.d}>
                                      <div className="text-[9px] text-[var(--text-secondary)] bg-[var(--bg-primary)] px-2.5 py-1.5 rounded-lg cursor-help hover:bg-[var(--accent-cyan)]/10 hover:text-[var(--accent-cyan)] hover:border-[var(--accent-cyan)]/30 transition-all border border-[var(--glass-border)] font-bold">
                                        {i.n}
                                      </div>
                                    </Tooltip>
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
                           <span className="text-[var(--accent-cyan)] font-bold truncate max-w-[300px]">d:\Information management system\backups</span>
                        </div>
                        <div className="flex justify-between text-[11px] p-4 border border-[var(--glass-border)] rounded-xl bg-[var(--bg-elevated)] italic">
                           <span className="text-[var(--text-muted)]">hnsw_vector_engine</span>
                           <span className="text-[var(--accent-cyan)] font-bold">In-Process C++ (41,092+ Vectors)</span>
                        </div>
                        <div className="flex justify-between text-[11px] p-4 border border-[var(--glass-border)] rounded-xl bg-[var(--bg-elevated)] italic">
                           <span className="text-[var(--text-muted)]">gemini_live_voice</span>
                           <span className="text-[var(--accent-cyan)] font-bold">Multimodal Live Bidi (180ms Jitter Guard)</span>
                        </div>
                        <div className="flex justify-between text-[11px] p-4 border border-[var(--glass-border)] rounded-xl bg-[var(--bg-elevated)] italic">
                           <span className="text-[var(--text-muted)]">engine_status</span>
                           <span className="text-[var(--accent-cyan)] font-bold">Fluid (60fps)</span>
                        </div>
                     </div>
                  </div>
                </motion.div>
              ) : activeTab === 'checkpoints' ? (
                <motion.div key="checkpoints-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6 pb-32">
                   <div className="space-y-4">
                      <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest block border-b border-[var(--glass-border)] pb-2">Mesh Authority Checkpoints</span>
                      
                      <button 
                          disabled={isMeshBackingUp}
                          onClick={async () => {
                              setIsMeshBackingUp(true);
                              setMeshBackupStatus(null);
                              try {
                                  await onCreateMeshBackup();
                                  setMeshBackupStatus('success');
                                  loadMeshBackups();
                                  setTimeout(() => setMeshBackupStatus(null), 3000);
                              } catch (e) {
                                  setMeshBackupStatus('error');
                                  setTimeout(() => setMeshBackupStatus(null), 3000);
                              } finally {
                                  setIsMeshBackingUp(false);
                              }
                          }}
                          className={`w-full py-4 rounded-xl flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all border ${
                              meshBackupStatus === 'success' ? 'bg-[var(--accent-emerald)]/20 border-[var(--accent-emerald)]/50 text-[var(--accent-emerald)]' :
                              meshBackupStatus === 'error' ? 'bg-[var(--status-red)]/20 border-[var(--status-red)]/50 text-[var(--status-red)]' :
                              'bg-[var(--accent-cyan)]/10 border border-[var(--accent-cyan)]/30 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/25'
                          }`}
                      >
                          {isMeshBackingUp ? (
                              <RefreshCw size={12} className="animate-spin" />
                          ) : meshBackupStatus === 'success' ? (
                              <CheckCircle2 size={12} /> 
                          ) : (
                              <Database size={12} />
                          )}
                          {isMeshBackingUp ? 'Creating Checkpoint...' : 
                          meshBackupStatus === 'success' ? 'Checkpoint Created' : 
                          meshBackupStatus === 'error' ? 'Failed to Create Checkpoint' : 
                          'Create New Mesh Checkpoint'}
                      </button>

                      <div className="space-y-3">
                         {meshBackups.length > 0 ? (
                            meshBackups.map(b => (
                               <div key={b.filename} className="p-4 bg-[var(--bg-elevated)] border border-[var(--glass-border)] rounded-2xl space-y-3 group hover:border-[var(--glass-border-hover)] transition-all">
                                  <div className="flex items-center justify-between">
                                     <div className="flex flex-col">
                                        <span className="text-[11px] font-bold text-[var(--text-primary)]">{new Date(b.timestamp).toLocaleString('en-GB')}</span>
                                        <span className="text-[8px] uppercase tracking-widest text-[var(--text-muted)] font-black truncate max-w-[250px]">{b.filename}</span>
                                     </div>
                                  </div>
                                  
                                  <div className="grid grid-cols-2 gap-2 text-[10px] text-[var(--text-secondary)] border-t border-b border-[var(--glass-border)]/50 py-2">
                                     <div>Nodes: <strong className="text-[var(--text-primary)]">{b.nodeCount}</strong></div>
                                     <div>Connections: <strong className="text-[var(--text-primary)]">{b.connectionCount}</strong></div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                     <button 
                                       onClick={() => setPreviewingBackup(previewingBackup?.filename === b.filename ? null : b)}
                                       className="py-2.5 rounded-xl border border-[var(--glass-border)] hover:bg-[var(--bg-tertiary)] text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] transition-all flex items-center justify-center gap-1.5"
                                     >
                                        <Info size={10} />
                                        {previewingBackup?.filename === b.filename ? 'Hide Details' : 'View Details'}
                                     </button>
                                     <button 
                                       onClick={() => {
                                          if (confirm(`Are you sure you want to restore the backup from ${new Date(b.timestamp).toLocaleString('en-GB')}? This will reload the application.`)) {
                                             onRestoreMeshBackup(b.filename);
                                          }
                                       }}
                                       className="py-2.5 rounded-xl bg-[var(--accent-cyan)]/15 border border-[var(--accent-cyan)]/35 text-[9px] font-black uppercase tracking-widest text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)] hover:text-white transition-all flex items-center justify-center gap-1.5"
                                     >
                                        <RotateCcw size={10} />
                                        Restore
                                     </button>
                                  </div>

                                  {previewingBackup?.filename === b.filename && (
                                     <div className="p-3 bg-[var(--bg-primary)] border border-[var(--glass-border)] rounded-xl text-[10px] space-y-1.5 font-mono text-[var(--text-secondary)] select-text max-h-48 overflow-y-auto">
                                        <div>Checkpoints Info:</div>
                                        <div>• File: {b.filename}</div>
                                        <div>• Saved: {new Date(b.timestamp).toString()}</div>
                                        <div>• Total Registered Nodes: {b.nodeCount}</div>
                                        <div>• Total Relationships: {b.connectionCount}</div>
                                     </div>
                                  )}
                               </div>
                            ))
                         ) : (
                            <div className="h-48 flex flex-col items-center justify-center text-[var(--text-muted)] border border-dashed border-[var(--glass-border)] rounded-2xl">
                               <Database size={24} className="mb-2 opacity-20" />
                               <p className="text-[10px] font-black uppercase tracking-[0.2em] italic">No checkpoints found</p>
                            </div>
                         )}
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
        </div>

        <div className="p-8 border-t border-[var(--glass-border)] bg-[var(--bg-elevated)]/50 text-[9px] text-[var(--text-muted)] font-bold uppercase tracking-[0.3em] text-center">
            Mesh App Version: 1.4.0
        </div>
      </motion.div>
    </div>
  );
};
