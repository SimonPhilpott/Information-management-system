import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ENTITY_TYPES } from '../../data/nodes';
import { Network, Plus, RotateCcw, Activity, GitPullRequest, Search, Copy, Check, X, ListOrdered } from 'lucide-react';

const getSearchSummaryPath = (matchingNodes, allNodes) => {
  if (matchingNodes.length === 0) return '';
  
  const paths = matchingNodes.map(node => {
    const p = [];
    let curr = node;
    while (curr) {
      p.unshift(curr.id);
      curr = curr.parentId ? allNodes.find(n => n.id === curr.parentId) : null;
    }
    return p;
  });
  
  const tree = {};
  paths.forEach(p => {
    let currentLevel = tree;
    p.forEach(id => {
      if (!currentLevel[id]) {
        currentLevel[id] = {};
      }
      currentLevel = currentLevel[id];
    });
  });
  
  const serialize = (node) => {
    const keys = Object.keys(node);
    if (keys.length === 0) return '';
    if (keys.length === 1) {
      const childStr = serialize(node[keys[0]]);
      return childStr ? `${keys[0]} > ${childStr}` : keys[0];
    }
    const branches = keys.map(k => {
      const childStr = serialize(node[k]);
      return childStr ? `${k} > {${childStr}}` : k;
    });
    return `{${branches.join(', ')}}`;
  };
  
  return serialize(tree);
};

export const MeshCanvas = ({ 
  meshRef,
  nodes, 
  view, 
  layoutRules, 
  hoveredNodeId, 
  setHoveredNodeId, 
  hoveredLinkId, 
  setHoveredLinkId, 
  setHoveredLinkData, 
  onSelectNode, 
  onAddOffshoot, 
  onNodeDrag, 
  onNodeDragEnd, 
  onStartReparent, 
  onLinkClick,
  isMovingMesh,
  isSidebarOpen,
  movingNodeId,
  projectionMode = '2d',
  theme = 'dark',
  selectedNode = null
}) => {
  const isDark = theme !== 'light';
  const NODE_W = 224;
  const NODE_H = 100;
  
  const [draggedNodeId, setDraggedNodeId] = useState(null);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [hasMovedDuringDrag, setHasMovedDuringDrag] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showTierList, setShowTierList] = useState(false);

  const searchRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const thumbprintPlaceholder = null;

  const copyToClipboard = () => {
    if (!thumbprint) return;
    navigator.clipboard.writeText(thumbprint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSearchChange = (val) => {
    setSearchQuery(val);
    setShowSuggestions(true);
    if (!val.trim()) {
      setActiveSearchQuery('');
    }
    
    // Check if it's a pasted thumbprint
    if (val.includes('>')) {
      const parts = val.split('>');
      if (parts.length > 1) {
        const targetPart = parts[1].split(':')[0].trim();
        const found = nodes.find(n => n.id === targetPart || n.title.toLowerCase() === targetPart.toLowerCase());
        if (found) {
          onSelectNode(found);
          setSearchQuery(found.title);
          setActiveSearchQuery('');
          setShowSuggestions(false);
        }
      }
    }
  };

  const suggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return nodes.filter(n => 
      n.title.toLowerCase().includes(q) || 
      n.id.toLowerCase().includes(q) ||
      (n.content && Object.values(n.content).some(val => 
        typeof val === 'string' && val.toLowerCase().includes(q)
      ))
    ).slice(0, 8);
  }, [searchQuery, nodes]);

  const matchingNodeIds = useMemo(() => {
    if (!activeSearchQuery?.trim()) return null;
    const q = activeSearchQuery.toLowerCase().trim();
    return new Set(
      nodes
        .filter(n => 
          n.title.toLowerCase().includes(q) || 
          n.id.toLowerCase().includes(q) ||
          (n.content && Object.values(n.content).some(val => 
            typeof val === 'string' && val.toLowerCase().includes(q)
          ))
        )
        .map(n => n.id)
    );
  }, [activeSearchQuery, nodes]);

  const getSortedTierList = useMemo(() => {
    if (!nodes || nodes.length === 0) return [];
    
    const q = searchQuery.toLowerCase().trim();
    let matching = [];
    const activeTargets = [];
    if (selectedNode) {
      activeTargets.push(selectedNode);
    }
    if (q) {
      nodes.forEach(n => {
        const isMatch = n.title.toLowerCase().includes(q) || 
                        n.id.toLowerCase().includes(q) ||
                        (n.content && Object.values(n.content).some(val => 
                          typeof val === 'string' && val.toLowerCase().includes(q)
                        ));
        if (isMatch && !activeTargets.some(t => t.id === n.id)) {
          activeTargets.push(n);
        }
      });
    }

    if (activeTargets.length > 0) {
      const relevantSet = new Set();
      activeTargets.forEach(m => {
        relevantSet.add(m.id);
        
        let curr = m;
        while (curr) {
          relevantSet.add(curr.id);
          curr = curr.parentId ? nodes.find(n => n.id === curr.parentId) : null;
        }
        
        const addChildren = (parentId) => {
          nodes.forEach(n => {
            if (n.parentId === parentId && !relevantSet.has(n.id)) {
              relevantSet.add(n.id);
              addChildren(n.id);
            }
          });
        };
        addChildren(m.id);
        
        if (m.secondaryLinks) {
          m.secondaryLinks.forEach(sid => relevantSet.add(sid));
        }
        nodes.forEach(n => {
          if (n.secondaryLinks && n.secondaryLinks.includes(m.id)) {
            relevantSet.add(n.id);
          }
        });
      });
      matching = nodes.filter(n => relevantSet.has(n.id));
    } else {
      matching = nodes;
    }

    const refNode = (selectedNode && matching.some(n => n.id === selectedNode.id))
      ? selectedNode
      : matching[0];

    const primaryNode = nodes.find(n => n.id === 'tt_group') || { id: 'tt_group' };

    const getTier = (type) => {
      const t = type?.toUpperCase() || '';
      if (t === 'CONCEPT') return 1;
      if (t === 'PROCEDURE') return 2;
      if (t === 'PATTERN') return 3;
      if (t === 'VARIANT') return 4;
      if (t === 'SCENARIO') return 5;
      return 5;
    };

    const getDistance = (n1, n2) => {
      const dx = (n1.x || 0) - (n2.x || 0);
      const dy = (n1.y || 0) - (n2.y || 0);
      return Math.sqrt(dx * dx + dy * dy);
    };

    const mapped = matching.map(n => {
      const d1 = refNode ? getDistance(n, refNode) : 0;
      const d2 = getDistance(n, primaryNode);
      const tier = getTier(n.type);
      return { ...n, d1, d2, tier };
    });

    mapped.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.d1 !== b.d1) return a.d1 - b.d1;
      return a.d2 - b.d2;
    });

    return mapped;
  }, [searchQuery, nodes, selectedNode]);

  const groupedTiers = useMemo(() => {
    const groups = {
      1: { name: 'Tier 1: Concepts', color: ENTITY_TYPES.CONCEPT?.color || '#a3e635', nodes: [] },
      2: { name: 'Tier 2: Procedures', color: ENTITY_TYPES.PROCEDURE?.color || '#60a5fa', nodes: [] },
      3: { name: 'Tier 3: Patterns', color: ENTITY_TYPES.PATTERN?.color || '#fb7185', nodes: [] },
      4: { name: 'Tier 4: Variants', color: ENTITY_TYPES.VARIANT?.color || '#c084fc', nodes: [] },
      5: { name: 'Tier 5: Scenarios', color: ENTITY_TYPES.SCENARIO?.color || '#f472b6', nodes: [] }
    };
    
    getSortedTierList.forEach(node => {
      const tier = node.tier;
      if (groups[tier]) {
        groups[tier].nodes.push(node);
      }
    });
    
    return Object.values(groups).filter(g => g.nodes.length > 0);
  }, [getSortedTierList]);

  const topMatchNode = useMemo(() => {
    if (selectedNode) return selectedNode;
    if (!activeSearchQuery?.trim() || getSortedTierList.length === 0) return null;
    return getSortedTierList[0];
  }, [selectedNode, activeSearchQuery, getSortedTierList]);

  const thumbprint = useMemo(() => {
    if (selectedNode) {
      const node = selectedNode;
      const path = [];
      let curr = node;
      while (curr) {
        path.unshift(curr.id);
        curr = curr.parentId ? nodes.find(n => n.id === curr.parentId) : null;
      }
      const ancestryPath = path.slice(0, -1).join('/');
      const targetId = node.id;
      const secondary = (node.secondaryLinks || [])
        .filter(id => id !== node.parentId)
        .sort()
        .join(', ');
      
      return ancestryPath 
        ? `${ancestryPath} > ${targetId}${secondary ? ` : {${secondary}}` : ''}`
        : `${targetId}${secondary ? ` : {${secondary}}` : ''}`;
    } else if (activeSearchQuery?.trim() && matchingNodeIds && matchingNodeIds.size > 0) {
      const matched = nodes.filter(n => matchingNodeIds.has(n.id));
      return getSearchSummaryPath(matched, nodes);
    }
    return '';
  }, [selectedNode, activeSearchQuery, matchingNodeIds, nodes]);

  useEffect(() => {
    if (selectedNode) {
      setSearchQuery(selectedNode.title);
      setActiveSearchQuery('');
    } else {
      setSearchQuery('');
      setActiveSearchQuery('');
    }
  }, [selectedNode]);

  // Connection Engine: Generates premium spline paths with dynamic tension
  const getPath = (start, end, node) => {
    if (!start || !end || isNaN(start.x) || isNaN(start.y) || isNaN(end.x) || isNaN(end.y)) return '';
    const sx = start.x + NODE_W / 2;
    const sy = start.y + NODE_H / 2;
    const tx = end.x + NODE_W / 2;
    const ty = end.y + NODE_H / 2;

    const dx = tx - sx;
    const dy = ty - sy;

    const tensionScalar = (layoutRules.connectionTension ?? 65) / 100;
    const BASE_TENSION = tensionScalar; 

    // Safety for zero distance
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return `M ${sx} ${sy} L ${tx} ${ty}`;

    const useVertical = node.branchDir === 'Up' || node.branchDir === 'Down' || layoutRules.layoutStyle === 'vertical_tb';

    if (useVertical) {
      const cp1y = sy + (dy * BASE_TENSION);
      const cp2y = ty - (dy * BASE_TENSION);
      return `M ${sx} ${sy} C ${sx} ${cp1y}, ${tx} ${cp2y}, ${tx} ${ty}`;
    } else {
      const cp1x = sx + (dx * BASE_TENSION);
      const cp2x = tx - (dx * BASE_TENSION);
      return `M ${sx} ${sy} C ${cp1x} ${sy}, ${cp2x} ${ty}, ${tx} ${ty}`;
    }
  };

  const handlePointerDown = (e, id) => {
    if (isSidebarOpen) return; // Nuclear Block: Prevent node interaction if sidebar is active
    e.stopPropagation();
    setDraggedNodeId(id);
    setDragStartPos({ x: e.clientX, y: e.clientY });
    setHasMovedDuringDrag(false);
  };

  const handlePointerMove = (e, id) => {
    // Manual Repositioning Locked: Use 'Move Node' icon for hierarchical restructuring
    /*
    if (draggedNodeId !== id || isSidebarOpen) return;
    
    const dx = (e.clientX - dragStartPos.x) / view.scale;
    const dy = (e.clientY - dragStartPos.y) / view.scale;
    
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) setHasMovedDuringDrag(true);
    onNodeDrag(id, dx, dy);
    setDragStartPos({ x: e.clientX, y: e.clientY });
    */
  };

  const handlePointerUp = (e, node) => {
    if (draggedNodeId === node.id) {
      if (!hasMovedDuringDrag) onSelectNode(node);
      onNodeDragEnd(node.id);
    }
    setDraggedNodeId(null);
  };

  return (
    <div className={`absolute inset-0 ${projectionMode === '3d' ? 'mesh-3d-scene' : ''}`}>
      <div 
           ref={meshRef}
           className={`absolute inset-0 origin-top-left will-change-transform ${projectionMode === '3d' ? 'mesh-3d-layer' : ''}`}
           style={{ 
               transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
               backfaceVisibility: 'hidden',
               transformStyle: 'preserve-3d'
           }}>
      
      <svg className="absolute inset-0 w-[5000px] h-[5000px] pointer-events-none overflow-visible">
        <defs>
          <filter id="meshglow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {nodes.map(node => {
            if (!node.parentId) return null;
            const parent = nodes.find(n => n.id === node.parentId);
            if (!parent) return null;

            const pathData = getPath(parent, node, node);
            let color = ENTITY_TYPES[node.type?.toUpperCase()]?.color || '#00f2ff';
            if (!isDark && (node.type?.toUpperCase() === 'VARIANT' || node.type?.toUpperCase() === 'CONCEPT')) color = '#000000';
            const lid = `link-${parent.id}-${node.id}`;
            const isHovered = hoveredLinkId === lid;
            
            // Relational Focus Logic: Dim unrelated links when a node is hovered or a query matches
            let isFocused = true;
            let isUnrelatedDim = false;
            if (hoveredNodeId) {
                isFocused = (parent.id === hoveredNodeId || node.id === hoveredNodeId);
                if (!isFocused) isUnrelatedDim = true;
            } else if (matchingNodeIds) {
                isFocused = (matchingNodeIds.has(parent.id) && matchingNodeIds.has(node.id));
                if (!isFocused) isUnrelatedDim = true;
            }

            return (
                <g key={lid} className={`group cursor-pointer transition-all duration-500 ${isUnrelatedDim ? 'opacity-5 blur-[1px]' : 'opacity-100'} ${projectionMode === '3d' ? 'link-3d' : ''}`}>
                    {/* Visual Base Layer */}
                    <motion.path 
                      d={pathData} 
                      fill="none" 
                      className="pointer-events-none"
                      animate={{ 
                        stroke: color,
                        strokeWidth: isHovered ? 2 : 1,
                        strokeOpacity: isHovered ? 0.8 : 0.3
                      }}
                      transition={{ duration: 0.4, ease: "easeInOut" }}
                    />

                    {/* Kinetic Pulse Layer */}
                    <motion.path 
                      d={pathData} 
                      fill="none" 
                      stroke={color} 
                      className={`pointer-events-none connection-pulse ${isMovingMesh ? '' : 'animate-pulse'}`}
                      animate={{ 
                        strokeWidth: isHovered ? (4 / view.scale) : (2 / view.scale),
                        strokeOpacity: isHovered ? 0.6 : 0.2
                      }}
                      transition={{ duration: 0.4, ease: "easeInOut" }}
                      style={{ filter: 'url(#meshglow)' }} 
                    />

                    {/* Top-Level Invisible Hit Area */}
                    <path d={pathData} fill="none" stroke="transparent" strokeWidth={30} 
                      className="pointer-events-auto"
                      onMouseEnter={() => { 
                        if (!isMovingMesh && !isSidebarOpen) {
                            setHoveredLinkId(lid); 
                            setHoveredLinkData({ 
                                from: parent.title, to: node.title, 
                                fromType: parent.type, toType: node.type,
                                type: 'Structural Thread' 
                            }); 
                        }
                      }} 
                      onMouseLeave={() => { if (!isMovingMesh) { setHoveredLinkId(null); setHoveredLinkData(null); } }} 
                      onClick={(e) => { e.stopPropagation(); onLinkClick(node.id, parent.id); }} 
                    />
                </g>
            );
        })}

        {nodes.filter(n => n.secondaryLinks?.length).map(node => 
            node.secondaryLinks.filter(tid => tid !== node.parentId && nodes.find(n => n.id === tid)?.parentId !== node.id).map(targetId => {
                const target = nodes.find(n => n.id === targetId);
                if (!target) return null;
                const pathData = getPath(node, target, target);
                const lid = `secondary-${node.id}-${targetId}`;
                const isHovered = hoveredLinkId === lid;

                let isFocused = true;
                let isUnrelatedDim = false;
                if (hoveredNodeId) {
                    isFocused = (node.id === hoveredNodeId || target.id === hoveredNodeId);
                    if (!isFocused) isUnrelatedDim = true;
                } else if (matchingNodeIds) {
                    isFocused = (matchingNodeIds.has(node.id) && matchingNodeIds.has(targetId));
                    if (!isFocused) isUnrelatedDim = true;
                }

                return (
                    <g key={lid} className={`group cursor-pointer transition-all duration-500 ${isUnrelatedDim ? 'opacity-5 blur-[1px]' : 'opacity-100'}`}>
                       <motion.path 
                         d={pathData} 
                         fill="none" 
                         className="pointer-events-none"
                         animate={{ 
                           stroke: isHovered ? "#00f0ff" : "#64748b",
                           strokeWidth: isHovered ? 2 / view.scale : 1 / view.scale,
                           strokeOpacity: isHovered ? 0.9 : 0.4,
                           strokeDasharray: isHovered ? "0,0" : "5,5"
                         }}
                         transition={{ duration: 0.4, ease: "easeInOut" }}
                       />
                       <path d={pathData} fill="none" stroke="transparent" strokeWidth={30} 
                          className="pointer-events-auto"
                          onMouseEnter={() => { 
                            if (!isMovingMesh) {
                                const config = ENTITY_TYPES[node.type?.toUpperCase()] || ENTITY_TYPES.TAXONOMY || { color: '#ffffff' };
                                setHoveredLinkId(lid); 
                                setHoveredLinkData({ 
                                    from: node.title, to: target.title, 
                                    fromType: node.type, toType: target.type,
                                    type: 'Transverse Thread' 
                                }); 
                            }
                          }} 
                          onMouseLeave={() => { if (!isMovingMesh) { setHoveredLinkId(null); setHoveredLinkData(null); } }} onClick={() => onLinkClick(target.id, node.id)} />
                    </g>
                );
            })
        )}
      </svg>

      {nodes.map(node => {
        const config = ENTITY_TYPES[node.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT;
        let color = config.color;
        if (!isDark && (node.type?.toUpperCase() === 'VARIANT' || node.type?.toUpperCase() === 'CONCEPT')) color = '#000000';
        
        // VIEWPORT CULLING: Only render if reasonably close to the screen center
        // This is a rough estimation to keep performance high without complex math
        const worldCX = (window.innerWidth / 2 - view.x) / view.scale;
        const worldCY = (window.innerHeight / 2 - view.y) / view.scale;
        const dist = Math.sqrt(Math.pow(node.x - worldCX, 2) + Math.pow(node.y - worldCY, 2));
        const visibleRange = (Math.max(window.innerWidth, window.innerHeight) / view.scale) * 1.5;
        if (dist > visibleRange && !isMovingMesh) return null;

        let isRelated = false;
        let isDimmed = false;
        if (hoveredNodeId) {
            if (node.id === hoveredNodeId) isRelated = true;
            else {
                const hNode = nodes.find(n => n.id === hoveredNodeId);
                if (node.parentId === hoveredNodeId) isRelated = true;
                if (hNode && hNode.parentId === node.id) isRelated = true;
                if (hNode && hNode.secondaryLinks?.includes(node.id)) isRelated = true;
                if (node.secondaryLinks?.includes(hoveredNodeId)) isRelated = true;
                if (!isRelated) isDimmed = true;
            }
        } else if (matchingNodeIds) {
            if (!matchingNodeIds.has(node.id)) {
                isDimmed = true;
            }
        }

        return (
          <div 
            key={node.id}
            onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, node.id); }} 
            onPointerMove={(e) => { e.stopPropagation(); handlePointerMove(e, node.id); }} 
            onPointerUp={(e) => { e.stopPropagation(); handlePointerUp(e, node); }} 
            onMouseEnter={() => { if (!isMovingMesh && !draggedNodeId && !isSidebarOpen) setHoveredNodeId(node.id); }} 
            onMouseLeave={() => { if (!isMovingMesh) setHoveredNodeId(null); }} 
            className={`absolute w-56 p-1 cursor-move touch-none will-change-transform ${draggedNodeId === node.id ? 'z-50' : 'transition-[opacity,transform,filter] duration-500 z-20'} ${isDimmed ? 'opacity-20 scale-95 blur-[2px]' : 'opacity-100 scale-100'} ${projectionMode === '3d' ? 'node-3d-tilt' : ''}`} 
            style={{ 
                transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
                backfaceVisibility: 'hidden',
                transformStyle: 'preserve-3d'
            }}
          >
            <div className={`relative glass-panel overflow-hidden border-l-4 group-hover:shadow-[0_0_30px_rgba(255,255,255,0.05)] transition-all duration-500 rounded-xl ${movingNodeId === node.id ? 'ring-2 ring-brand-cyan ring-offset-4 ring-offset-black animate-pulse shadow-[0_0_30px_rgba(0,240,255,0.4)]' : ''}`}
                 style={{ 
                   borderLeftColor: color, 
                   background: isDark ? 'rgba(10, 15, 20, 0.8)' : 'var(--gradient-primary)' 
                 }}>
              
              {movingNodeId === node.id && (
                <div className="absolute top-0 left-0 right-0 py-1 bg-brand-cyan text-black text-[7px] font-black uppercase tracking-widest text-center">
                   Select New Parent Node
                </div>
              )}
                <div 
                  className="p-4 relative z-10 transition-opacity duration-300 rounded-xl" 
                  style={{ 
                    opacity: layoutRules.showLabels ? 1 : 0.2,
                    background: isDark ? 'transparent' : 'rgba(0, 0, 0, 0.2)'
                  }}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                       <div className="p-1.5 rounded-md bg-white/10 backdrop-blur-md">
                         <config.icon size={12} style={{ color: isDark ? color : '#FFFFFF' }} className="shrink-0" />
                       </div>
                       {layoutRules.showLabels && (
                         <span className="text-[8px] font-black uppercase tracking-[0.2em] truncate text-white">{config.label}</span>
                       )}
                    </div>
                  </div>
                  {layoutRules.showLabels && (
                    <h3 className="text-[13px] font-bold leading-tight mb-1 italic tracking-tight text-white">{node.title}</h3>
                  )}
                </div>

              <div 
                className="absolute top-1 right-1 flex gap-1 opacity-60 hover:opacity-100 transition-opacity z-50 pointer-events-auto"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseEnter={(e) => { e.stopPropagation(); if (!isMovingMesh) setHoveredNodeId(null); }}
                onMouseLeave={(e) => { e.stopPropagation(); if (!isMovingMesh) setHoveredNodeId(node.id); }}
              >
                <button 
                  className={`p-1 rounded cursor-pointer border transition-all ${isDark ? 'hover:bg-white/20 bg-white/5 border-white/10' : 'hover:bg-black/10 bg-black/5 border-black/10'}`} 
                  onClick={(e) => { e.stopPropagation(); onAddOffshoot(node.id); }}
                >
                  <Plus size={10} className={isDark ? 'text-white' : 'text-black'} />
                </button>
                <button 
                  className={`p-1 rounded cursor-pointer border transition-all ${movingNodeId === node.id ? 'bg-brand-cyan border-brand-cyan text-black' : (isDark ? 'hover:bg-white/20 bg-white/5 border-white/10 text-white' : 'hover:bg-black/10 bg-black/5 border-black/10 text-black')}`} 
                  onClick={(e) => { e.stopPropagation(); onStartReparent(node.id); }}
                  title="Move/Reparent Node"
                >
                  <GitPullRequest size={10} />
                </button>
              </div>
            </div>
          </div>
        );
      })}
      </div>

      {/* Search Bar & Thumbprint Overlay */}
      <div 
        ref={searchRef}
        className="absolute top-8 left-1/2 -translate-x-1/2 z-[2000] flex flex-col items-center gap-2 pointer-events-auto"
        style={{ width: '420px' }}
      >
        {/* Search Bar Input Container */}
        <div 
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-300"
          style={{
            background: isDark ? 'rgba(10, 15, 25, 0.75)' : 'rgba(244, 239, 229, 0.85)',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(46, 43, 39, 0.15)',
            backdropFilter: 'blur(20px)',
            boxShadow: isDark ? '0 8px 32px rgba(0, 0, 0, 0.4)' : '0 8px 32px rgba(46, 43, 39, 0.1)'
          }}
        >
          <Search size={16} className={isDark ? 'text-slate-400' : 'text-[#6A645D]'} />
          <input
            type="text"
            className="flex-1 bg-transparent border-none outline-none font-sans text-xs"
            style={{
              color: isDark ? '#ffffff' : '#2E2B27',
            }}
            placeholder="Search nodes or paste thumbprint..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => {
              setShowSuggestions(true);
              setShowTierList(false);
            }}
            onClick={() => {
              setShowSuggestions(true);
              setShowTierList(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSelectNode(null);
                setShowTierList(false);
                setShowSuggestions(false);
                setActiveSearchQuery(searchQuery);
              }
            }}
          />
          {searchQuery && (
            <button 
              onClick={() => {
                setSearchQuery('');
                setActiveSearchQuery('');
                onSelectNode(null);
                setShowSuggestions(false);
                setShowTierList(false);
              }}
              className="p-0.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white"
            >
              <X size={14} />
            </button>
          )}
          <button 
            onClick={() => {
              setShowTierList(!showTierList);
              setShowSuggestions(false);
            }}
            className={`p-1 rounded transition-colors ${showTierList ? (isDark ? 'bg-white/20 text-[#00f2ff]' : 'bg-black/10 text-cyan-600') : 'text-slate-400 hover:text-white'}`}
            title="Toggle Node Tier Listing"
          >
            <ListOrdered size={16} />
          </button>
        </div>

        {/* Tier List Dropdown */}
        {showTierList && (
          <div 
            className="w-full max-h-80 overflow-y-auto rounded-xl border mt-1 flex flex-col gap-3 p-3 transition-all duration-300 scrollbar-thin"
            style={{
              background: isDark ? 'rgba(10, 15, 25, 0.95)' : 'rgba(244, 239, 229, 0.95)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(46, 43, 39, 0.15)',
              backdropFilter: 'blur(25px)',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)'
            }}
          >
            {groupedTiers.length === 0 ? (
              <div className="text-xs text-center text-slate-400 py-2">No matching nodes</div>
            ) : (
              groupedTiers.map((group) => (
                <div key={group.name} className="flex flex-col gap-1">
                  <div 
                    className="text-[10px] uppercase font-bold tracking-wider px-1 py-0.5 border-b pb-1"
                    style={{
                      color: group.color,
                      borderColor: `${group.color}30`
                    }}
                  >
                    {group.name}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {group.nodes.map((node) => (
                      <button
                        key={node.id}
                        onClick={() => {
                          onSelectNode(node);
                          setSearchQuery(node.title);
                          setActiveSearchQuery('');
                          setShowTierList(false);
                        }}
                        className="w-full px-2 py-1.5 rounded text-left text-xs transition-colors flex items-center justify-between"
                        style={{
                          color: isDark ? '#e2e8f0' : '#2E2B27',
                          background: 'transparent',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(46, 43, 39, 0.05)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <span className="font-medium truncate mr-2">{node.title}</span>
                        {node.d1 !== undefined && (
                          <span className="text-[9px] text-slate-500 font-mono flex-shrink-0">
                            {node.d1 > 0 ? `d: ${Math.round(node.d1)}` : 'focal'}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Suggestion Dropdown */}
        {showSuggestions && !showTierList && suggestions.length > 0 && (
          <div 
            className="w-full max-h-60 overflow-y-auto rounded-xl border mt-1 flex flex-col gap-0.5 p-1 transition-all duration-300 scrollbar-thin"
            style={{
              background: isDark ? 'rgba(10, 15, 25, 0.95)' : 'rgba(244, 239, 229, 0.95)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(46, 43, 39, 0.15)',
              backdropFilter: 'blur(25px)',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)'
            }}
          >
            {suggestions.map((node) => {
              const config = ENTITY_TYPES[node.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT;
              return (
                <button
                  key={node.id}
                  onClick={() => {
                    onSelectNode(node);
                    setSearchQuery(node.title);
                    setActiveSearchQuery('');
                    setShowSuggestions(false);
                  }}
                  className="w-full px-3 py-2 rounded-lg text-left text-xs transition-colors flex items-center justify-between"
                  style={{
                    color: isDark ? '#e2e8f0' : '#2E2B27',
                    background: 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(46, 43, 39, 0.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <span className="font-medium truncate mr-2">{node.title}</span>
                  <span 
                      className="text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-wider font-semibold flex-shrink-0"
                      style={{
                        borderColor: `${config.color}40`,
                        color: config.color,
                        background: `${config.color}10`
                      }}
                    >
                      {node.type}
                    </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Thumbprint Display */}
        {topMatchNode && thumbprint && (
          <div 
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-mono tracking-wider transition-all duration-300"
            style={{
              background: isDark ? 'rgba(10, 15, 25, 0.5)' : 'rgba(244, 239, 229, 0.6)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(46, 43, 39, 0.1)',
              color: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(46, 43, 39, 0.8)',
              backdropFilter: 'blur(10px)'
            }}
          >
            <span className="truncate max-w-[340px]" title={thumbprint}>
              {thumbprint}
            </span>
            <button 
              onClick={copyToClipboard}
              className="p-1 rounded hover:bg-white/10 transition-colors text-slate-400 hover:text-white flex items-center gap-1"
              title="Copy Thumbprint"
            >
              {copied ? (
                <Check size={10} className="text-emerald-400" />
              ) : (
                <Copy size={10} />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
