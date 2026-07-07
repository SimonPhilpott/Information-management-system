import React, { useState, useMemo, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { SunburstCanvas } from '../KnowledgeMesh/SunburstCanvas';
import { SpatialCanvas } from '../KnowledgeMesh/SpatialCanvas';
import { ENTITY_TYPES } from '../../data/nodes';
import { IntelligenceDrawer, RichTaggingEditor, IMPORTANCE_TIERS } from '../Editor/IntelligenceDrawer';
import SankeyView from './SankeyView';
import RadialWheelView from './RadialWheelView';
import CentralityView from './CentralityView';
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
  Shield,
  ChevronDown
} from 'lucide-react';

export default function DemoPortal({ 
  nodes = [], 
  theme = 'dark', 
  onThemeToggle,
  currentPath = '/demo',
  setCurrentPath
}) {
  const isDark = theme === 'dark';
  
  const [showBetaDropdown, setShowBetaDropdown] = useState(false);

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
    if (path === '/demo/sankey') {
      return 'beta-sankey';
    }
    if (path === '/demo/radial') {
      return 'beta-radial';
    }
    if (path === '/demo/centrality') {
      return 'beta-centrality';
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
    } else if (tab === 'beta-sankey') {
      newPath = '/demo/sankey';
    } else if (tab === 'beta-radial') {
      newPath = '/demo/radial';
    } else if (tab === 'beta-centrality') {
      newPath = '/demo/centrality';
    }
    if (newPath !== currentPath) {
      window.history.pushState(null, '', newPath);
      if (setCurrentPath) {
        setCurrentPath(newPath);
      }
    }
  };

  // Local state for nodes so updates in the editor are reflected instantly
  const [localNodes, setLocalNodes] = useState(nodes);
  
  useEffect(() => {
    setLocalNodes(nodes);
  }, [nodes]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBetaNodeId, setSelectedBetaNodeId] = useState('srv_pm');
  const [betaSearchQuery, setBetaSearchQuery] = useState('');
  const [showBetaSuggestions, setShowBetaSuggestions] = useState(false);

  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);

  // States for Tagger Section
  const [editorText, setEditorText] = useState('');
  const [taggerLinks, setTaggerLinks] = useState([]);
  const [activeTooltip, setActiveTooltip] = useState(null);
  const [ignoredNodeIds, setIgnoredNodeIds] = useState([]);

  // Reset ignored tags when text is cleared
  useEffect(() => {
    if (!editorText) {
      setIgnoredNodeIds([]);
    }
  }, [editorText]);

  const handleToggleConnectionTagger = (id) => {
    setTaggerLinks(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Parse all tag IDs from the editor text (both promoted and linked)
  const textTagIds = useMemo(() => {
    const ids = [];
    const regex = /\[\[(.*?)\|(.*?)\]\]/g;
    let match;
    while ((match = regex.exec(editorText || '')) !== null) {
      ids.push(match[1]);
    }
    return Array.from(new Set(ids));
  }, [editorText]);

  const handleRemoveTagConnection = (id) => {
    // Revert [[id|Title]] to just Title inside editorText
    const node = localNodes.find(n => n.id === id);
    if (node) {
      const escapedTitle = node.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\[\\[${id}\\|(${escapedTitle})\\]\\]`, 'gi');
      const newEditorText = editorText.replace(regex, '$1');
      setEditorText(newEditorText);
      // Remember this node as ignored for auto-tagging
      if (!ignoredNodeIds.includes(id)) {
        setIgnoredNodeIds(prev => [...prev, id]);
      }
    }
    
    // Also remove from active connections
    if (taggerLinks.includes(id)) {
      handleToggleConnectionTagger(id);
    }
  };

  // Find ignored nodes whose titles are still present in editorText
  const ignoredMatchesInText = useMemo(() => {
    return ignoredNodeIds.filter(id => {
      const node = localNodes.find(n => n.id === id);
      if (!node) return false;
      const escapedTitle = node.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?<!\\[\\[)(?<!\\|)\\b(${escapedTitle})\\b(?!\\]\\])(?!\\|)`, 'i');
      return regex.test(editorText || '');
    });
  }, [ignoredNodeIds, editorText, localNodes]);

  const handleRelinkTag = (id) => {
    const node = localNodes.find(n => n.id === id);
    if (node && editorText) {
      const escapedTitle = node.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?<!\\[\\[)(?<!\\|)\\b(${escapedTitle})\\b(?!\\]\\])(?!\\|)`, 'i');
      const newEditorText = editorText.replace(regex, `[[${id}|$1]]`);
      setEditorText(newEditorText);
      
      // Remove from ignored
      setIgnoredNodeIds(prev => prev.filter(x => x !== id));
      
      // Add back to active connections
      if (!taggerLinks.includes(id)) {
        setTaggerLinks(prev => [...prev, id]);
      }
    }
  };



  useEffect(() => {
    if (!betaSearchQuery.trim()) return;
    const match = localNodes.find(n => n.title.toLowerCase() === betaSearchQuery.trim().toLowerCase());
    if (match) {
      setSelectedBetaNodeId(match.id);
    }
  }, [betaSearchQuery, localNodes]);

  // Intelligence Drawer states
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingNode, setEditingNode] = useState(null);
  const [currentType, setCurrentType] = useState('CONCEPT');
  const [formData, setFormData] = useState({ title: '', content: {}, tier: 3 });
  const [showLabels, setShowLabels] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showTierList, setShowTierList] = useState(false);

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

  const filteredBetaNodes = useMemo(() => {
    if (!betaSearchQuery.trim()) return [];
    const q = betaSearchQuery.toLowerCase();
    return localNodes.filter(n => 
      n.title.toLowerCase().includes(q) || 
      n.id.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [betaSearchQuery, localNodes]);

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

          {/* Beta Views Dropdown Tab */}
          <div className="relative">
            <button 
              onClick={() => setShowBetaDropdown(!showBetaDropdown)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wider uppercase transition-all flex items-center gap-1.5 active:scale-[0.98] ${
                activeTab.startsWith('beta-')
                  ? (isDark ? 'bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/25' : 'bg-[#899981]/20 text-[#4E5A47] border border-[#899981]/30')
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Compass size={13} />
              <span>
                {activeTab === 'beta-sankey' ? 'Sankey Flow' :
                 activeTab === 'beta-radial' ? 'Radial Wheel' :
                 activeTab === 'beta-centrality' ? 'Connection Analytics' :
                 'Beta Views'}
              </span>
              <ChevronDown size={11} className={`transition-transform duration-200 ${showBetaDropdown ? 'rotate-180' : ''}`} />
            </button>
            
            {showBetaDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowBetaDropdown(false)} />
                <div className={`absolute top-full right-0 mt-1.5 w-44 rounded-xl border p-1 z-50 backdrop-blur-xl shadow-2xl flex flex-col gap-0.5 ${
                  isDark ? 'bg-slate-950/90 border-white/10 text-slate-200' : 'bg-white/95 border-slate-200 text-slate-800'
                }`}>
                  <button
                    onClick={() => {
                      handleTabChange('beta-sankey');
                      setShowBetaDropdown(false);
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer ${
                      activeTab === 'beta-sankey'
                        ? (isDark ? 'bg-brand-cyan/15 text-brand-cyan' : 'bg-[#899981]/15 text-[#4E5A47]')
                        : (isDark ? 'hover:bg-white/5' : 'hover:bg-slate-100')
                    }`}
                  >
                    Sankey Flow Chart
                  </button>
                  <button
                    onClick={() => {
                      handleTabChange('beta-radial');
                      setShowBetaDropdown(false);
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer ${
                      activeTab === 'beta-radial'
                        ? (isDark ? 'bg-brand-cyan/15 text-brand-cyan' : 'bg-[#899981]/15 text-[#4E5A47]')
                        : (isDark ? 'hover:bg-white/5' : 'hover:bg-slate-100')
                    }`}
                  >
                    Radial Connection Wheel
                  </button>
                  <button
                    onClick={() => {
                      handleTabChange('beta-centrality');
                      setShowBetaDropdown(false);
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer ${
                      activeTab === 'beta-centrality'
                        ? (isDark ? 'bg-brand-cyan/15 text-brand-cyan' : 'bg-[#899981]/15 text-[#4E5A47]')
                        : (isDark ? 'hover:bg-white/5' : 'hover:bg-slate-100')
                    }`}
                  >
                    Connection Analytics
                  </button>
                </div>
              </>
            )}
          </div>
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
              <button
                onClick={() => setShowTierList(!showTierList)}
                className={`px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all duration-200 cursor-pointer active:scale-95 shadow-md flex items-center gap-1.5 ${
                  showTierList
                    ? (isDark ? 'bg-brand-cyan/20 border-brand-cyan/40 text-brand-cyan shadow-[0_0_10px_rgba(0,242,255,0.15)]' : 'bg-[#899981]/25 border-[#899981]/50 text-[#4E5A47]')
                    : (isDark ? 'bg-slate-900/80 border-white/10 text-slate-400 hover:text-white' : 'bg-white/80 border-black/10 text-slate-600 hover:text-black')
                }`}
              >
                <span>Tier: {showTierList ? 'ON' : 'OFF'}</span>
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
              showTierList={showTierList}
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
        ) : activeTab.startsWith('beta-') ? (
          <div className="flex-1 w-full flex flex-col relative overflow-hidden">
            {/* Shared Search Selector for Beta Views */}
            <div className={`px-6 py-3 border-b flex items-center justify-between z-30 relative ${
              isDark ? 'bg-slate-900/40 border-white/5' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center gap-3 w-full max-w-md relative">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 whitespace-nowrap">
                  Focused Node:
                </span>
                
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={betaSearchQuery}
                    onChange={(e) => {
                      setBetaSearchQuery(e.target.value);
                      setShowBetaSuggestions(true);
                    }}
                    onFocus={() => setShowBetaSuggestions(true)}
                    placeholder={
                      localNodes.find(n => n.id === selectedBetaNodeId)?.title || "Search node to focus..."
                    }
                    className={`w-full px-3 py-1.5 rounded-xl border text-xs focus:outline-none transition-all ${
                      isDark 
                        ? 'bg-slate-950/60 border-white/10 text-white focus:border-brand-cyan/40 placeholder-slate-400' 
                        : 'bg-white border-slate-200 text-slate-800 focus:border-[#4E5A47] placeholder-slate-500'
                    }`}
                  />
                  
                  {showBetaSuggestions && filteredBetaNodes.length > 0 && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowBetaSuggestions(false)} />
                      <div className={`absolute top-full left-0 right-0 mt-1.5 max-h-60 overflow-y-auto rounded-xl border p-1 z-50 backdrop-blur-xl shadow-2xl flex flex-col gap-0.5 ${
                        isDark ? 'bg-slate-950/95 border-white/10 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
                      }`}>
                        {filteredBetaNodes.map(node => (
                          <button
                            key={node.id}
                            onClick={() => {
                              setSelectedBetaNodeId(node.id);
                              setBetaSearchQuery('');
                              setShowBetaSuggestions(false);
                            }}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-between ${
                              selectedBetaNodeId === node.id
                                ? (isDark ? 'bg-brand-cyan/15 text-brand-cyan' : 'bg-[#899981]/15 text-[#4E5A47]')
                                : (isDark ? 'hover:bg-white/5' : 'hover:bg-slate-100')
                            }`}
                          >
                            <span className="truncate">{node.title}</span>
                            <span 
                              className="text-[8px] px-1.5 py-0.2 rounded border uppercase tracking-wider font-semibold flex-shrink-0"
                              style={{
                                borderColor: `${demoEntityTypes[node.type?.toUpperCase()]?.color || '#ccc'}40`,
                                color: demoEntityTypes[node.type?.toUpperCase()]?.color || '#ccc',
                                background: `${demoEntityTypes[node.type?.toUpperCase()]?.color || '#ccc'}10`
                              }}
                            >
                              {node.type}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Active Focus:
                </span>
                <span 
                  className="px-2.5 py-0.8 text-[9px] font-black uppercase tracking-wider rounded border"
                  style={{
                    borderColor: `${demoEntityTypes[localNodes.find(n => n.id === selectedBetaNodeId)?.type?.toUpperCase()]?.color || '#00f2ff'}40`,
                    color: demoEntityTypes[localNodes.find(n => n.id === selectedBetaNodeId)?.type?.toUpperCase()]?.color || '#00f2ff',
                    background: `${demoEntityTypes[localNodes.find(n => n.id === selectedBetaNodeId)?.type?.toUpperCase()]?.color || '#00f2ff'}10`
                  }}
                >
                  {localNodes.find(n => n.id === selectedBetaNodeId)?.title || 'None'}
                </span>
              </div>
            </div>

            {/* Embedded Sub-views */}
            <div className="flex-1 w-full relative overflow-hidden">
              {activeTab === 'beta-sankey' && (
                <SankeyView theme={theme} focusedNodeId={selectedBetaNodeId} nodes={localNodes} />
              )}
              {activeTab === 'beta-radial' && (
                <RadialWheelView theme={theme} focusedNodeId={selectedBetaNodeId} />
              )}
              {activeTab === 'beta-centrality' && (
                <CentralityView theme={theme} focusedNodeId={selectedBetaNodeId} />
              )}
            </div>
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
              <div className="rounded-2xl relative overflow-visible border border-white/5 p-1 bg-white">
                <RichTaggingEditor
                  value={editorText}
                  onChange={setEditorText}
                  nodes={localNodes}
                  onToggleConnection={handleToggleConnectionTagger}
                  currentSecondaryLinks={taggerLinks}
                  theme={theme}
                  placeholder="Type or paste your text"
                  ignoredNodeIds={ignoredNodeIds}
                />
              </div>

              {/* Active Connections HUD */}
              <div className="flex flex-col gap-3 pt-2">
                <h3 className="text-xs font-black tracking-widest uppercase text-slate-500">
                  Active tag term connection in the text ({textTagIds.length})
                </h3>
                {textTagIds.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No node connections established yet. Type a matching node name to see match suggestions.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {textTagIds.map(id => {
                      const node = localNodes.find(n => n.id === id);
                      if (!node) return null;
                      const isLinked = taggerLinks.includes(id);
                      const color = demoEntityTypes[node.type?.toUpperCase()]?.color || '#505a60';
                      return (
                        <div
                          key={id}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all"
                          style={{
                            borderColor: isLinked ? `${color}88` : `${color}44`,
                            borderStyle: isLinked ? 'solid' : 'dashed',
                            background: isLinked ? `${color}15` : 'transparent',
                            color: isLinked ? color : `${color}b0`
                          }}
                        >
                          <span className="flex items-center gap-1.5 select-none">
                            {node.title}
                            {!isLinked && <span className="text-[10px] font-normal opacity-60">(Promoted)</span>}
                          </span>
                          <button
                            onClick={() => handleRemoveTagConnection(id)}
                            className="hover:text-red-500 font-extrabold ml-1 transition-colors cursor-pointer"
                            title="Remove tag reference"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Relink HUD for dismissed matches */}
                {ignoredMatchesInText.length > 0 && (
                  <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-slate-500/10">
                    <h4 className="text-[10px] font-black tracking-widest uppercase text-slate-400">
                      Dismissed tags in text (click + to restore link)
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {ignoredMatchesInText.map(id => {
                        const node = localNodes.find(n => n.id === id);
                        if (!node) return null;
                        const color = demoEntityTypes[node.type?.toUpperCase()]?.color || '#505a60';
                        return (
                          <div
                            key={id}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-dashed text-xs font-bold opacity-60 hover:opacity-100 transition-all"
                            style={{
                              borderColor: `${color}44`,
                              color: `${color}b0`,
                              background: `${color}05`
                            }}
                          >
                            <span>{node.title}</span>
                            <button
                              onClick={() => handleRelinkTag(id)}
                              className="hover:text-green-500 hover:scale-115 font-black ml-1.5 transition-all cursor-pointer text-sm"
                              title="Restore tag link connection"
                            >
                              +
                            </button>
                          </div>
                        );
                      })}
                    </div>
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
