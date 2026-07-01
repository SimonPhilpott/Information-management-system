import React, { useState, useMemo, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { SunburstCanvas } from '../KnowledgeMesh/SunburstCanvas';
import { SpatialCanvas } from '../KnowledgeMesh/SpatialCanvas';
import { ENTITY_TYPES } from '../../data/nodes';
import { IntelligenceDrawer, RichTaggingEditor, IMPORTANCE_TIERS } from '../Editor/IntelligenceDrawer';
import { 
  Home, 
  Layers, 
  Search, 
  Activity, 
  Database, 
  HelpCircle, 
  GitBranch, 
  Compass,
  ArrowRight,
  ArrowLeft,
  Sun,
  Moon,
  Info,
  Cpu,
  Zap,
  Shield
} from 'lucide-react';

export default function DemoPortal({ 
  nodes = [], 
  theme = 'dark', 
  onThemeToggle,
  currentPath = '/demo',
  setCurrentPath
}) {
  const isDark = theme === 'dark';
  
  // Derive initial tab from path
  const getTabFromPath = (path) => {
    if (path === '/demo/structuredview') {
      return 'structure';
    }
    if (path === '/demo/spatialview') {
      return 'spatial';
    }
    if (path === '/demo/tagger') {
      return 'tagger';
    }
    return 'dashboard';
  };

  const [activeTab, setActiveTab] = useState(() => getTabFromPath(currentPath));

  // Sync tab if path changes externally (like popstate)
  useEffect(() => {
    const tab = getTabFromPath(currentPath);
    if (tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [currentPath]);

  // Handler to change tab and update URL
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    let newPath = '/demo/dashboard';
    if (tab === 'structure') {
      newPath = '/demo/structuredview';
    } else if (tab === 'spatial') {
      newPath = '/demo/spatialview';
    } else if (tab === 'tagger') {
      newPath = '/demo/tagger';
    }
    if (newPath !== currentPath) {
      window.history.pushState(null, '', newPath);
      if (setCurrentPath) {
        setCurrentPath(newPath);
      }
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);

  // States for Tagger Section
  const [editorText, setEditorText] = useState('');
  const [taggerLinks, setTaggerLinks] = useState([]);
  const [activeTooltip, setActiveTooltip] = useState(null);

  const handleToggleConnectionTagger = (id) => {
    setTaggerLinks(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Local state for nodes so updates in the editor are reflected instantly
  const [localNodes, setLocalNodes] = useState(nodes);
  
  useEffect(() => {
    setLocalNodes(nodes);
  }, [nodes]);

  // Intelligence Drawer states
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingNode, setEditingNode] = useState(null);
  const [currentType, setCurrentType] = useState('CONCEPT');
  const [formData, setFormData] = useState({ title: '', content: {}, tier: 3 });
  const [showLabels, setShowLabels] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);

  // Custom entity types configuration for the demo portal
  const demoEntityTypes = useMemo(() => {
    return {
      CONCEPT: { ...ENTITY_TYPES.CONCEPT, color: '#1E4479' },     // Blue
      PATTERN: { ...ENTITY_TYPES.PATTERN, color: '#00A000' },     // Green
      PROCEDURE: { ...ENTITY_TYPES.PROCEDURE, color: '#0090DC' }, // Cyan
      VARIANT: { ...ENTITY_TYPES.VARIANT, color: '#D55c17' },     // Orange
      SCENARIO: { ...ENTITY_TYPES.SCENARIO, color: '#505a60' },   // Grey
      MUSHROOM: { color: '#F2eee7' }
    };
  }, []);

  // 1. Calculate Analytics
  const stats = useMemo(() => {
    const total = localNodes.length;
    const concepts = localNodes.filter(n => n.type?.toUpperCase() === 'CONCEPT').length;
    const procedures = localNodes.filter(n => n.type?.toUpperCase() === 'PROCEDURE').length;
    const patterns = localNodes.filter(n => n.type?.toUpperCase() === 'PATTERN').length;
    return { total, concepts, procedures, patterns };
  }, [localNodes]);

  // 2. Search & Filter
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return localNodes.slice(0, 10);
    const q = searchQuery.toLowerCase();
    return localNodes.filter(n => 
      n.title.toLowerCase().includes(q) || 
      n.id.toLowerCase().includes(q) ||
      (n.content && Object.values(n.content).some(val => 
        typeof val === 'string' && val.toLowerCase().includes(q)
      ))
    ).slice(0, 10);
  }, [searchQuery, localNodes]);

  const handleNodeClick = (node) => {
    setSelectedNode(node);
  };

  const handleOpenDrawer = (node) => {
    setSelectedNode(node);
    setIsEditorOpen(true);
    setEditingNode(node);
    setCurrentType(node.type || 'CONCEPT');
    setFormData({
      title: node.title,
      content: node.content || {},
      tier: node.tier || 3
    });
  };

  const handleSaveNode = (updatedFields) => {
    if (editingNode) {
      const updatedNode = { 
        ...editingNode, 
        ...updatedFields, 
        title: formData.title, 
        type: currentType, 
        tier: formData.tier || 3 
      };
      setLocalNodes(prev => prev.map(n => n.id === editingNode.id ? updatedNode : n));
      setSelectedNode(updatedNode);
    }
    setIsEditorOpen(false);
  };

  const handleDeleteNode = (id) => {
    setLocalNodes(prev => prev.filter(n => n.id !== id));
    setIsEditorOpen(false);
    if (selectedNode?.id === id) {
      setSelectedNode(null);
    }
  };

  const handleToggleConnection = (targetId) => {
    if (!editingNode) return;
    setLocalNodes(prev => prev.map(n => {
      if (n.id === editingNode.id) {
        const links = n.secondaryLinks || [];
        const updatedLinks = links.includes(targetId)
          ? links.filter(id => id !== targetId)
          : [...links, targetId];
        return { ...n, secondaryLinks: updatedLinks };
      }
      return n;
    }));
  };

  return (
    <div className={`min-h-screen w-full flex flex-col font-sans transition-colors duration-500 ${
      isDark ? 'bg-[#030712] text-[#f3f4f6]' : 'bg-[#f4efed] text-[#1f2937]'
    }`}>
      {/* Premium Top Navigation Bar */}
      <header className={`px-6 py-4 flex items-center justify-between border-b backdrop-blur-xl sticky top-0 z-50 transition-colors duration-300 ${
        isDark ? 'bg-[#030712]/80 border-white/5' : 'bg-[#f4efed]/80 border-[#2E2B27]/10'
      }`}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-brand-cyan to-indigo-500 shadow-[0_0_15px_rgba(0,242,255,0.25)]">
            <Activity size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight leading-none uppercase">
              Simon Philpott IMS
            </h1>
            <span className="text-[9px] font-bold tracking-[0.2em] text-slate-500 uppercase">
              Simplified Demo Portal
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className={`flex items-center gap-1.5 p-1 rounded-xl border ${
          isDark ? 'bg-white/5 border-white/5' : 'bg-[#2E2B27]/5 border-[#2E2B27]/10'
        }`}>
          <button 
            onClick={() => handleTabChange('dashboard')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wider uppercase transition-all flex items-center gap-2 active:scale-[0.98] ${
              activeTab === 'dashboard'
                ? (isDark ? 'bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/25' : 'bg-[#899981]/20 text-[#4E5A47] border border-[#899981]/30')
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Home size={13} />
            <span>Dashboard</span>
          </button>
          <button 
            onClick={() => handleTabChange('structure')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wider uppercase transition-all flex items-center gap-2 active:scale-[0.98] ${
              activeTab === 'structure'
                ? (isDark ? 'bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/25' : 'bg-[#899981]/20 text-[#4E5A47] border border-[#899981]/30')
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Layers size={13} />
            <span>Structure View</span>
          </button>
          <button 
            onClick={() => handleTabChange('spatial')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wider uppercase transition-all flex items-center gap-2 active:scale-[0.98] ${
              activeTab === 'spatial'
                ? (isDark ? 'bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/25' : 'bg-[#899981]/20 text-[#4E5A47] border border-[#899981]/30')
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <GitBranch size={13} />
            <span>Spatial Graph</span>
          </button>
          <button 
            onClick={() => handleTabChange('tagger')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wider uppercase transition-all flex items-center gap-2 active:scale-[0.98] ${
              activeTab === 'tagger'
                ? (isDark ? 'bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/25' : 'bg-[#899981]/20 text-[#4E5A47] border border-[#899981]/30')
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Zap size={13} />
            <span>Interactive Tagger</span>
          </button>
        </div>

        {/* System Theme Toggles / Control */}
        <div className="flex items-center gap-2">
          <button 
            onClick={onThemeToggle}
            className={`p-2 rounded-xl border transition-all active:scale-[0.98] ${
              isDark ? 'bg-white/5 border-white/10 text-brand-cyan hover:bg-white/10' : 'bg-[#2E2B27]/5 border-[#2E2B27]/10 text-slate-700 hover:bg-[#2E2B27]/10'
            }`}
            title="Toggle theme"
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <a
            href="/"
            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-[0.98] ${
              isDark 
                ? 'bg-gradient-to-r from-brand-cyan to-cyan-500 text-black hover:brightness-110' 
                : 'bg-gradient-to-r from-[#4E5A47] to-[#899981] text-white hover:brightness-110'
            }`}
          >
            Full Portal
          </a>
        </div>
      </header>

      {/* Main Content Area */}
      <main className={activeTab === 'dashboard' || activeTab === 'tagger'
        ? "flex-1 w-full max-w-7xl mx-auto p-6 flex flex-col gap-6" 
        : "h-[calc(100vh-76px)] w-full flex flex-col relative"
      }>
        {activeTab === 'dashboard' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Full Width Column: Node Classifications & Importance Tiers Descriptions matching drawer styling */}
            <div className="lg:col-span-3 flex flex-col gap-6 max-h-[82vh] overflow-y-auto pr-3 scrollbar-thin pb-12">
              
              {/* Node classifications section */}
              <div className="space-y-4">
                <label className="text-sm font-semibold flex items-center gap-2 text-slate-500 uppercase tracking-wider">
                  <Info size={14} />
                  Branch Classification
                </label>
 
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {Object.entries(ENTITY_TYPES).map(([key, config]) => {
                    const savedDesc = localStorage.getItem(`hive_def_desc_${key}`) || config.description || '';
                    const savedMapping = localStorage.getItem(`hive_def_mapping_${key}`) || config.mappingSummary || '';
                    const savedExamples = localStorage.getItem(`hive_def_examples_${key}`) || config.examples || '';
                    
                    return (
                      <div 
                        key={key} 
                        style={{
                          borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.1)',
                          backgroundColor: isDark ? 'rgba(30, 41, 59, 0.3)' : 'rgba(255, 255, 255, 0.8)',
                          backdropFilter: 'blur(12px)'
                        }}
                        className="group relative p-5 border-2 rounded-xl flex flex-col gap-2 transition-all text-left hover:border-slate-500/50"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
                          <span 
                            className="text-sm font-semibold transition-colors" 
                            style={{ color: config.color }}
                          >
                            {config.label}
                          </span>
                        </div>
                        <p className={`text-[13px] leading-relaxed font-light ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{savedDesc}</p>
                        
                        {config.mappingTitle && (
                          <div className={`mt-2 pt-2 border-t flex flex-col gap-2 text-[11px] select-none ${isDark ? 'border-white/5 text-slate-400' : 'border-black/5 text-slate-600'}`}>
                            <div 
                              className="relative cursor-help w-fit"
                              onMouseEnter={() => setActiveTooltip(`mapping-${key}`)}
                              onMouseLeave={() => setActiveTooltip(null)}
                            >
                              <span className={`font-medium underline decoration-dotted hover:text-inherit ${isDark ? 'decoration-slate-500/50' : 'decoration-slate-400'}`}>
                                Mapping: {config.mappingTitle}
                              </span>
                              {activeTooltip === `mapping-${key}` && (
                                <div className={`absolute z-[9999] bottom-full mb-2 w-80 p-4 rounded-xl border border-[#27272a]/80 bg-[#18181b]/95 text-sm text-slate-200 shadow-2xl backdrop-blur-md transition-all duration-300 ${(key === 'procedure' || key === 'rule') ? 'right-0' : 'left-0'}`}>
                                  <div className="font-semibold text-sm mb-1" style={{ color: config.color }}>Mapping Summary</div>
                                  <div className="leading-relaxed font-normal">{savedMapping}</div>
                                </div>
                              )}
                            </div>
                            
                            {config.aiUtility && (
                              <div 
                                className="relative cursor-help flex items-center gap-1.5 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 w-fit hover:bg-emerald-500/20"
                                onMouseEnter={() => setActiveTooltip(`ai-${key}`)}
                                onMouseLeave={() => setActiveTooltip(null)}
                              >
                                <Cpu size={11} />
                                <span>AI Utility</span>
                                {activeTooltip === `ai-${key}` && (
                                  <div className={`absolute z-[9999] bottom-full mb-2 w-80 p-4 rounded-xl border border-[#27272a]/80 bg-[#18181b]/95 text-sm text-slate-200 shadow-2xl backdrop-blur-md transition-all duration-300 ${(key === 'procedure' || key === 'rule') ? 'right-0' : 'left-0'}`}>
                                    <div className="font-semibold text-sm text-emerald-400 mb-1 flex items-center gap-1.5">
                                      <Cpu size={12} />
                                      AI Prompt Value & Utility
                                    </div>
                                    <div className="leading-relaxed font-normal">{config.aiUtility}</div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
 
              {/* Importance Tiers section */}
              <div className="space-y-4 pt-0 border-t border-white/5">
                <label className="text-sm font-semibold flex items-center gap-2 text-slate-500 uppercase tracking-wider">
                  <Shield size={14} />
                  Importance Tier
                </label>
 
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  {IMPORTANCE_TIERS.map((tier) => {
                    const savedDesc = localStorage.getItem(`hive_tier_desc_${tier.id}`) || tier.description || '';
                    const savedMapping = localStorage.getItem(`hive_tier_mapping_${tier.id}`) || tier.mappingSummary || '';
                    const savedExamples = localStorage.getItem(`hive_tier_examples_${tier.id}`) || '';
 
                    return (
                      <div 
                        key={tier.id} 
                        style={{
                          borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.1)',
                          backgroundColor: isDark ? 'rgba(30, 41, 59, 0.3)' : 'rgba(255, 255, 255, 0.8)',
                          backdropFilter: 'blur(12px)',
                          zIndex: (activeTooltip === `tier-mapping-${tier.id}` || activeTooltip === `tier-ai-${tier.id}`) ? 50 : 1
                        }}
                        className="group relative p-5 border-2 rounded-xl flex flex-col gap-2 transition-all text-left hover:border-slate-500/50 hover:z-[40]"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tier.color }} />
                          <span 
                            className="text-sm font-semibold transition-colors" 
                            style={{ color: tier.color }}
                          >
                            {tier.label}
                          </span>
                          <span className="text-[10px] font-mono opacity-50 ml-auto" style={{ color: tier.color }}>
                            T{tier.id}
                          </span>
                        </div>
                        <p className={`text-[13px] leading-relaxed font-light ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{savedDesc}</p>
                        
                        {tier.mappingTitle && (
                          <div className={`mt-auto pt-2 border-t flex flex-col gap-2 text-[11px] select-none ${isDark ? 'border-white/5 text-slate-400' : 'border-black/5 text-slate-600'}`}>
                            <div 
                              className="relative cursor-help w-fit"
                              onMouseEnter={() => setActiveTooltip(`tier-mapping-${tier.id}`)}
                              onMouseLeave={() => setActiveTooltip(null)}
                            >
                              <span className={`font-medium underline decoration-dotted hover:text-inherit ${isDark ? 'decoration-slate-500/50' : 'decoration-slate-400'}`}>
                                Mapping: {tier.mappingTitle}
                              </span>
                              {activeTooltip === `tier-mapping-${tier.id}` && (
                                <div className={`absolute z-[9999] bottom-full mb-2 w-80 p-4 rounded-xl border border-[#27272a]/80 bg-[#18181b]/95 text-sm text-slate-200 shadow-2xl backdrop-blur-md transition-all duration-300 ${tier.id >= 4 ? 'right-0' : 'left-0'}`}>
                                  <div className="font-semibold text-sm mb-1" style={{ color: tier.color }}>Mapping Summary</div>
                                  <div className="leading-relaxed font-normal">{savedMapping}</div>
                                </div>
                              )}
                            </div>
                            
                            {tier.aiUtility && (
                              <div 
                                className="relative cursor-help flex items-center gap-1.5 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 w-fit hover:bg-emerald-500/20"
                                onMouseEnter={() => setActiveTooltip(`tier-ai-${tier.id}`)}
                                onMouseLeave={() => setActiveTooltip(null)}
                              >
                                <Cpu size={11} />
                                <span>AI Utility</span>
                                {activeTooltip === `tier-ai-${tier.id}` && (
                                  <div className={`absolute z-[9999] bottom-full mb-2 w-80 p-4 rounded-xl border border-[#27272a]/80 bg-[#18181b]/95 text-sm text-slate-200 shadow-2xl backdrop-blur-md transition-all duration-300 ${tier.id >= 4 ? 'right-0' : 'left-0'}`}>
                                    <div className="font-semibold text-sm text-emerald-400 mb-1 flex items-center gap-1.5">
                                      <Cpu size={12} />
                                      AI Prompt Value & Utility
                                    </div>
                                    <div className="leading-relaxed font-normal">{tier.aiUtility}</div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>
        ) : activeTab === 'structure' ? (
          /* Embedded Sunburst View */
          <div className="flex-1 w-full flex flex-col relative overflow-hidden">
            <SunburstCanvas 
              nodes={localNodes}
              selectedNode={selectedNode}
              onSelectNode={(node) => {
                setSelectedNode(node);
              }}
              theme={theme}
              onThemeToggle={onThemeToggle}
              entityTypes={demoEntityTypes}
            />
          </div>
        ) : activeTab === 'spatial' ? (
          /* Embedded Spatial Graph View */
          <div className="flex-1 w-full flex flex-col relative overflow-hidden">
            {/* Float control overlay for toggling labels & heatmap */}
            <div className="absolute top-4 left-4 z-50 flex items-center gap-2 pointer-events-auto">
              <button
                onClick={() => setShowLabels(!showLabels)}
                className={`px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all duration-200 cursor-pointer active:scale-95 shadow-md flex items-center gap-1.5 ${
                  showLabels
                    ? (isDark ? 'bg-brand-cyan/20 border-brand-cyan/40 text-brand-cyan shadow-[0_0_10px_rgba(0,242,255,0.15)]' : 'bg-[#899981]/25 border-[#899981]/50 text-[#4E5A47]')
                    : (isDark ? 'bg-slate-900/80 border-white/10 text-slate-400 hover:text-white' : 'bg-white/80 border-black/10 text-slate-600 hover:text-black')
                }`}
              >
                <span>Labels: {showLabels ? 'ON' : 'OFF'}</span>
              </button>
              <button
                onClick={() => setShowHeatmap(!showHeatmap)}
                className={`px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all duration-200 cursor-pointer active:scale-95 shadow-md flex items-center gap-1.5 ${
                  showHeatmap
                    ? (isDark ? 'bg-orange-500/20 border-orange-500/40 text-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.15)]' : 'bg-orange-500/15 border-orange-500/30 text-orange-700')
                    : (isDark ? 'bg-slate-900/80 border-white/10 text-slate-400 hover:text-white' : 'bg-white/80 border-black/10 text-slate-600 hover:text-black')
                }`}
              >
                <span>Heatmap: {showHeatmap ? 'ON' : 'OFF'}</span>
              </button>
            </div>
            <SpatialCanvas 
              nodes={localNodes}
              selectedNode={selectedNode}
              onSelectNode={(node) => {
                setSelectedNode(node);
              }}
              hoveredNodeId={hoveredNodeId}
              setHoveredNodeId={setHoveredNodeId}
              theme={theme}
              showLabels={showLabels}
              showHeatmap={showHeatmap}
              labelStyle="standard"
              onZoomChange={() => {}}
              onCoordsChange={() => {}}
              setIs3DInteracting={() => {}}
              layoutRules={{
                childGap: 50,
                parentDistance: 400,
                siblingMultiplier: 0.32
              }}
            />
          </div>
        ) : (
          /* Interactive Tagger Section */
          <div className="flex-1 w-full flex flex-col gap-6">
            <div className={`p-6 rounded-3xl border backdrop-blur-xl flex flex-col gap-6 ${
              isDark ? 'bg-white/5 border-white/5' : 'bg-white/60 border-[#2E2B27]/10'
            }`}>
              <div className="flex flex-col gap-1.5">
                <h2 className="text-xl font-black tracking-tight uppercase flex items-center gap-2">
                  <Zap size={18} className={isDark ? 'text-brand-cyan' : 'text-[#4E5A47]'} />
                  <span>Interactive Link-to-Node Editor</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Type or paste content here. When you type keywords matching tags in the Turner & Townsend Term store, they will automatically format with a dotted box. Click Connect to instantly add the term to the metadata for the page.
                </p>
              </div>

              {/* Rich Tagging Editor Container */}
              <div className="rounded-2xl overflow-hidden border border-white/5 p-1 bg-white">
                <RichTaggingEditor
                  value={editorText}
                  onChange={setEditorText}
                  nodes={localNodes}
                  onToggleConnection={handleToggleConnectionTagger}
                  currentSecondaryLinks={taggerLinks}
                  theme={theme}
                  placeholder="Type or paste your text"
                />
              </div>

              {/* Active Connections HUD */}
              <div className="flex flex-col gap-3 pt-2">
                <h3 className="text-xs font-black tracking-widest uppercase text-slate-500">
                  Active tag term connection in the text ({taggerLinks.length})
                </h3>
                {taggerLinks.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No node connections established yet. Type a matching node name to see match suggestions.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {taggerLinks.map(id => {
                      const node = localNodes.find(n => n.id === id);
                      if (!node) return null;
                      const color = demoEntityTypes[node.type?.toUpperCase()]?.color || '#505a60';
                      return (
                        <div
                          key={id}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all"
                          style={{
                            borderColor: `${color}88`,
                            background: `${color}15`,
                            color: color
                          }}
                        >
                          <span>{node.title}</span>
                          <button
                            onClick={() => handleToggleConnectionTagger(id)}
                            className="hover:text-red-500 font-extrabold ml-1 transition-colors"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Render the premium Intelligence Drawer overlay */}
      <AnimatePresence>
        {isEditorOpen && (
          <IntelligenceDrawer 
            key={editingNode?.id || 'new'}
            isOpen={isEditorOpen} 
            theme={theme}
            onClose={() => setIsEditorOpen(false)} 
            nodes={localNodes} 
            editingNode={editingNode} 
            currentType={currentType} 
            setCurrentType={setCurrentType} 
            formData={formData} 
            setFormData={setFormData} 
            onSelectNode={handleOpenDrawer} 
            onSave={handleSaveNode}
            onDeleteNode={handleDeleteNode}
            onToggleConnection={handleToggleConnection}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
