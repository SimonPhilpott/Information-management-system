import React, { useState, useEffect, useRef } from 'react';
import { ENTITY_TYPES, SCHEMAS, INITIAL_NODES } from './data/nodes';
import { MeshCanvas } from './components/KnowledgeMesh/MeshCanvas';
import { OrbitalNav } from './components/Navigation/OrbitalNav';
import { StatusSidebars } from './components/Dashboard/StatusSidebars';
import { IntelligenceDrawer } from './components/Editor/IntelligenceDrawer';
import { AdminPanel } from './components/Admin/AdminPanel';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Link as LinkIcon, Cpu, ArrowDown, Network, GitMerge, AlignLeft, AlignVerticalSpaceAround } from 'lucide-react';

export default function App() {
  const resetLayout = () => {
    if (window.confirm('This will permanently reset all node positions to the authoritative structural layout. Proceed?')) {
      localStorage.removeItem('hive_mesh_v1.2');
      window.location.reload();
    }
  };

  const [nodes, setNodes] = useState(() => {
    try {
      const stored = localStorage.getItem('hive_mesh_v1.2');
      const data = stored ? JSON.parse(stored) : INITIAL_NODES;
      return data.map(n => ({ ...n, ox: n.ox ?? n.x, oy: n.oy ?? n.y }));
    } catch { return INITIAL_NODES.map(n => ({ ...n, ox: n.x, oy: n.y })); }
  });

  const [deletedNodes, setDeletedNodes] = useState(() => {
    try {
      const stored = localStorage.getItem('hive_mesh_waste_bin');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const [layoutRules, setLayoutRules] = useState(() => {
    const saved = localStorage.getItem('hive_mesh_rules_v1.5');
    return saved ? JSON.parse(saved) : { 
       childGap: 20,
       parentDistance: 450,
       layoutStyle: 'radial',
       directionalLocking: true,
       unifiedSyncPoints: true
    };
  });

  useEffect(() => {
    localStorage.setItem('hive_mesh_rules_v1.5', JSON.stringify(layoutRules));
  }, [layoutRules]);

  const [view, setView] = useState({ x: 0, y: 0, scale: 0.8 });
  const [dragType, setDragType] = useState(null);
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
  const [stickPos, setStickPos] = useState({ x: 0, y: 0 });
  
  // GLOBAL HUD STATE
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [hoveredLinkId, setHoveredLinkId] = useState(null);
  const [hoveredLinkData, setHoveredLinkData] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const [selectedNode, setSelectedNode] = useState(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  const [editingNode, setEditingNode] = useState(null);
  const [activeParentId, setActiveParentId] = useState(null);
  const [currentType, setCurrentType] = useState('CONCEPT');
  const [formData, setFormData] = useState({ title: '', content: {} });

  const containerRef = useRef(null);
  const requestRef = useRef();
  const stickRef = useRef({ x: 0, y: 0 });
  const draggedNodeIdRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('hive_mesh_v1.2', JSON.stringify(nodes));
  }, [nodes]);

  useEffect(() => {
    localStorage.setItem('hive_mesh_waste_bin', JSON.stringify(deletedNodes));
  }, [deletedNodes]);

  useEffect(() => {
    const handleGlobalMouse = (e) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handleGlobalMouse);
    return () => window.removeEventListener('mousemove', handleGlobalMouse);
  }, []);

  useEffect(() => {
    const rootNode = nodes.find(n => n.id === 'tt_group') || nodes[0];
    if (rootNode) centerOnNode(rootNode);
  }, []);

  const centerOnNode = (node) => {
    const scale = 0.8;
    const centerX = window.innerWidth / 2 - (node.x + 112) * scale;
    const centerY = window.innerHeight / 2 - (node.y + 50) * scale;
    setView({ x: centerX, y: centerY, scale });
    setSelectedNode(node);
  };

  const applyLayout = (rules) => {
     let newNodes = [...nodes];
     const roots = newNodes.filter(n => !n.parentId);
     
      // SPACE B: Unified Sibling Gap
      const siblingGap = rules.childGap ?? 20;
      const vSpacing = 100 + siblingGap;
      const hSpacing = 224 + siblingGap;
      
      // SPACE A: Master Expansion Displacement
      const expansionJump = rules.parentDistance ?? 450;

      // Recursive quadrant layout
      const layoutQuadrant = (nodeId, dir, depth, offX, offY) => {
         const node = newNodes.find(n => n.id === nodeId);
         if (!node) return 0;
         const children = newNodes.filter(n => n.parentId === nodeId);
         
         if (dir === 'VerticalList') {
             let listSpan = 1;
             children.forEach(child => {
                 listSpan += layoutQuadrant(child.id, dir, depth + 1, offX + 100, offY + listSpan * vSpacing);
             });
             node.x = offX;
             node.y = offY;
             node.ox = node.x; node.oy = node.y;
             return listSpan;
         }

         let span = 0;
         if (children.length === 0) {
             span = 1;
         } else {
             children.forEach(child => {
                 if (dir === 'Right' || dir === 'Left') {
                     span += layoutQuadrant(child.id, dir, depth + 1, offX, offY + span * vSpacing);
                 } else {
                     span += layoutQuadrant(child.id, dir, depth + 1, offX + span * hSpacing, offY);
                 }
             });
         }

         if (dir === 'Right') {
             node.x = offX + (depth * (224 + expansionJump));
             node.y = children.length > 0 ? offY + ((span - 1) * vSpacing) / 2 : offY;
         } else if (dir === 'Left') {
             node.x = offX - (depth * (224 + expansionJump));
             node.y = children.length > 0 ? offY + ((span - 1) * vSpacing) / 2 : offY;
         } else if (dir === 'Down') {
             node.x = children.length > 0 ? offX + ((span - 1) * hSpacing) / 2 : offX;
             node.y = offY + (depth * (100 + expansionJump));
         } else if (dir === 'Up') {
             node.x = children.length > 0 ? offX + ((span - 1) * hSpacing) / 2 : offX;
             node.y = offY - (depth * (100 + expansionJump));
         }

         node.branchDir = dir;
         node.ox = node.x; node.oy = node.y;
         return span || 1;
      };

      roots.forEach((root) => {
         root.x = 2000; root.y = 2000; root.ox = 2000; root.oy = 2000;
         
         if (rules.layoutStyle === 'horizontal_lr') {
            layoutQuadrant(root.id, 'Right', 0, 2000, 2000);
            return;
         }
         if (rules.layoutStyle === 'vertical_tb') {
            layoutQuadrant(root.id, 'Down', 0, 2000, 2000); 
            return;
         }
         if (rules.layoutStyle === 'tree') {
            layoutQuadrant(root.id, 'VerticalList', 0, 2000, 2000); 
            return;
         }
         
         const children = newNodes.filter(n => n.parentId === root.id);
         const topChildren = children.filter(c => c.title.includes('Regions'));
         const leftChildren = children.filter(c => c.title.includes('Business'));
         const rightChildren = children.filter(c => c.title.includes('Capabilities'));
         const bottomChildren = children.filter(c => !topChildren.includes(c) && !leftChildren.includes(c) && !rightChildren.includes(c));

         const getAggSpan = (childList, dir) => {
            let total = 0;
            childList.forEach(c => {
               const nodesCopy = nodes.map(n => ({...n}));
               const layoutQuadrantCopy = (nodeId, dType) => {
                  const children = nodesCopy.filter(n => n.parentId === nodeId);
                  if (children.length === 0) return 1;
                  let s = 0;
                  children.forEach(ch => { s += layoutQuadrantCopy(ch.id, dType); });
                  return s;
               };
               total += layoutQuadrantCopy(c.id, dir);
            });
            return total;
         };

         const topSpan = getAggSpan(topChildren, 'Up');
         const bottomSpan = getAggSpan(bottomChildren, 'Down');
         const leftSpan = getAggSpan(leftChildren, 'Left');
         const rightSpan = getAggSpan(rightChildren, 'Right');

         let topX = root.x - Math.max(0, (topSpan - 1) * hSpacing / 2);
         topChildren.forEach(c => { topX += layoutQuadrant(c.id, 'Up', 1, topX, root.y) * hSpacing; });

         let leftY = root.y - Math.max(0, (leftSpan - 1) * vSpacing / 2);
         leftChildren.forEach(c => { leftY += layoutQuadrant(c.id, 'Left', 1, root.x, leftY) * vSpacing; });

         let rightY = root.y - Math.max(0, (rightSpan - 1) * vSpacing / 2);
         rightChildren.forEach(c => { rightY += layoutQuadrant(c.id, 'Right', 1, root.x, rightY) * vSpacing; });

         let currentX = root.x - Math.max(0, (bottomSpan - 1) * hSpacing / 2);
         bottomChildren.forEach(c => { currentX += layoutQuadrant(c.id, 'Down', 1, currentX, root.y) * hSpacing; });
         
         root.branchDir = null; // Root is center
      });

     setNodes(newNodes);
     localStorage.setItem('hive_mesh_v1.2', JSON.stringify(newNodes));
  };

  const animate = () => {
    const { x: sx, y: sy } = stickRef.current;
    if (sx !== 0 || sy !== 0) {
      setView(v => ({...v, x: v.x - (sx * (14/v.scale)), y: v.y - (sy * (14/v.scale)) }));
    }
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    stickRef.current = stickPos;
  }, [stickPos]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, []);

  const applyZoomAt = (mx, my, factor) => {
    setView(v => {
      const newScale = Math.min(Math.max(v.scale * factor, 0.1), 3);
      const zoomRatio = newScale / v.scale;
      return { x: mx - (mx - v.x) * zoomRatio, y: my - (my - v.y) * zoomRatio, scale: newScale };
    });
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = Math.exp(e.deltaY * -0.001);
    applyZoomAt(e.clientX, e.clientY, factor);
  };

  const handleMouseDown = (e) => {
    const isInteracting = e.target.closest('button') || e.target.closest('input') || e.target.closest('[drag]');
    if (isInteracting) return;

    if (e.button === 0) setDragType('pan');
    if (e.button === 2) { e.preventDefault(); setDragType('zoom'); }
    
    if (isEditorOpen) setIsEditorOpen(false);
    if (isAdminOpen) setIsAdminOpen(false);
    
    setLastPos({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e) => {
      if (!dragType) return;
      const dx = e.clientX - lastPos.x;
      const dy = e.clientY - lastPos.y;
      
      if (dragType === 'pan') {
        setView(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
      } else if (dragType === 'zoom') {
        applyZoomAt(e.clientX, e.clientY, 1 - dy * 0.005);
      }
      
      setLastPos({ x: e.clientX, y: e.clientY });
    };

    const handleGlobalMouseUp = () => {
      setDragType(null);
    };

    if (dragType) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [dragType, lastPos]);

  const getTooltipPos = (tw, th) => {
    const safeH = th === 450 ? 550 : th || 300; 
    const safeW = tw || 450;

    let nx = mousePos.x + 35;
    let ny = mousePos.y + 10;

    if (nx + safeW > window.innerWidth - 30) nx = mousePos.x - safeW - 35;

    const threshold = window.innerHeight * 0.6;
    if (mousePos.y > threshold) {
      ny = mousePos.y - safeH - 10;
    } else {
      if (ny + safeH > window.innerHeight - 30) {
        ny = window.innerHeight - safeH - 30;
      }
    }

    if (ny < 15) ny = 15;
    if (nx < 15) nx = 15;

    return { x: nx, y: ny };
  };

  const updateRules = (newRules) => {
    const updated = { ...layoutRules, ...newRules };
    setLayoutRules(updated);
    applyLayout(updated);
  };

  return (
    <div className="flex h-screen p-8 gap-8 antialiased overflow-hidden select-none relative">
      <div className="fixed inset-0 pointer-events-none opacity-30">
        <div className="absolute top-0 right-1/4 w-[900px] h-[900px] bg-brand-cyan/20 blur-[180px] rounded-full -translate-y-1/2" />
        <div className="absolute bottom-0 left-1/4 w-[700px] h-[700px] bg-brand-purple/20 blur-[150px] rounded-full translate-y-1/2" />
      </div>

      <div className="fixed inset-0 pointer-events-none z-[1000000]">
          <AnimatePresence mode="wait">
            {(hoveredNodeId && !isDraggingNode) && (
              <motion.div
                key={`hud-node-${hoveredNodeId}`}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="fixed backdrop-blur-3xl border border-white/10 p-6 rounded-3xl w-[448px] pointer-events-none border-t-4"
                style={{ 
                    backgroundColor: 'var(--bg-overlay)',
                    boxShadow: '0 40px 120px rgba(0,0,0,0.5)',
                    left: getTooltipPos(448, 200 + (nodes.filter(n => n.parentId === hoveredNodeId || n.secondaryLinks?.includes(hoveredNodeId)).length * 60)).x, 
                    top: getTooltipPos(448, 200 + (nodes.filter(n => n.parentId === hoveredNodeId || n.secondaryLinks?.includes(hoveredNodeId)).length * 60)).y, 
                    borderTopColor: ENTITY_TYPES[nodes.find(n => n.id === hoveredNodeId)?.type]?.color 
                }}
              >
                 <div className="flex items-center gap-2 mb-4">
                    <Activity size={12} className="text-brand-cyan" />
                    <span className="text-[10px] font-bold tracking-[0.1em] text-brand-cyan">Operational Extract</span>
                 </div>
                 <h4 className="text-white font-bold text-base mb-2 italic tracking-tight">{nodes.find(n => n.id === hoveredNodeId).title}</h4>
                 <p className="text-[13px] text-slate-300 leading-relaxed italic mb-5 font-light border-b border-white/5 pb-5">
                   {nodes.find(n => n.id === hoveredNodeId).content?.Summary || 'Tactical metadata pending induction...'}
                 </p>
                 
                 <div className="space-y-4">
                    <span className="text-[10px] font-bold text-slate-500 tracking-wider block mb-2">Relationships</span>
                    {(() => {
                        const hNode = nodes.find(n => n.id === hoveredNodeId);
                        const connections = [];
                        
                        if (hNode.parentId) {
                           const p = nodes.find(n => n.id === hNode.parentId);
                           if (p) connections.push({ node: p, label: 'Parent' });
                        }
                        nodes.filter(n => n.parentId === hoveredNodeId).forEach(c => {
                           connections.push({ node: c, label: 'Child' });
                        });
                        if (hNode.secondaryLinks) {
                           hNode.secondaryLinks.forEach(sid => {
                              const s = nodes.find(n => n.id === sid);
                              if (s) connections.push({ node: s, label: 'Transverse' });
                           });
                        }
                        nodes.filter(n => n.secondaryLinks?.includes(hoveredNodeId)).forEach(n => {
                           connections.push({ node: n, label: 'Origin' });
                        });

                        if (connections.length === 0) return <span className="text-[9px] text-slate-700 italic">No established threads detected.</span>;

                        return (
                          <div className="grid grid-cols-1 gap-2 pr-2 overflow-y-auto custom-scrollbar">
                             {connections.map((c, i) => (
                                <div key={i} className="px-3 py-2.5 rounded-xl border border-white/5 bg-white/[0.01] flex items-center justify-between group" style={{ borderLeft: `3px solid ${ENTITY_TYPES[c.node.type]?.color}` }}>
                                   <div className="flex flex-col">
                                      <span className="text-[8px] font-black uppercase tracking-tighter text-slate-500 mb-0.5">
                                         {c.label === 'Parent' ? 'PARENT ' : ''}{ENTITY_TYPES[c.node.type]?.label}
                                      </span>
                                      <span className="text-[12px] font-bold text-white/90 tracking-tight leading-none italic">{c.node.title}</span>
                                   </div>
                                   <div 
                                     className="text-[8px] font-black px-2 py-1 rounded-md italic uppercase tracking-widest leading-none border" 
                                     style={{ 
                                       backgroundColor: `${ENTITY_TYPES[c.node.type]?.color}15`, 
                                       color: ENTITY_TYPES[c.node.type]?.color,
                                       borderColor: `${ENTITY_TYPES[c.node.type]?.color}30`
                                     }}
                                   >
                                      {c.label}
                                   </div>
                                </div>
                             ))}
                          </div>
                        );
                    })()}
                 </div>
              </motion.div>
            )}

            {hoveredLinkId && hoveredLinkData && (
              <motion.div
                key="hud-link"
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="fixed backdrop-blur-3xl border border-brand-cyan p-7 rounded-2xl z-[1000001] pointer-events-none min-w-[450px] w-max max-w-[700px]"
                style={{ backgroundColor: 'var(--bg-overlay)', boxShadow: '0 30px 90px rgba(0,0,0,0.4)', left: getTooltipPos(450, 300).x, top: getTooltipPos(450, 300).y, borderLeftWidth: '8px' }}
              >
                 <div className="flex items-center gap-3 mb-6 font-bold tracking-tight text-[11px]">
                    <LinkIcon size={14} className="text-brand-cyan" />
                    <span className="text-brand-cyan uppercase tracking-[0.2em]">{hoveredLinkData.type}</span>
                 </div>
                 
                 <div className="flex flex-col gap-2">
                    <div className="px-3 py-2.5 rounded-xl border border-white/5 bg-white/[0.01] flex items-center justify-between relative group">
                       <div className="absolute left-0 top-2 bottom-2 w-1 rounded-full" style={{ backgroundColor: ENTITY_TYPES[hoveredLinkData.fromType?.toUpperCase()]?.color }} />
                       <div className="flex flex-col pl-2">
                          <span className="text-[8px] font-black uppercase tracking-tighter text-slate-500 mb-0.5">
                             {hoveredLinkData.type === 'Structural Thread' ? 'PARENT ' : ''}{ENTITY_TYPES[hoveredLinkData.fromType?.toUpperCase()]?.label}
                          </span>
                          <span className="text-[14px] font-bold text-white tracking-tight leading-none italic">{hoveredLinkData.from}</span>
                       </div>
                       <div className="text-[8px] font-black text-slate-700 bg-white/5 px-2 py-1 rounded-md italic uppercase tracking-widest">
                          {hoveredLinkData.type === 'Structural Thread' ? 'PARENT' : 'ORIGIN'}
                       </div>
                    </div>

                    <div className="flex items-center justify-center -my-1">
                       <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                          <ArrowDown size={14} className="text-slate-600" />
                       </div>
                    </div>

                    <div className="px-3 py-2.5 rounded-xl border border-white/5 bg-white/[0.01] flex items-center justify-between relative group">
                       <div className="absolute left-0 top-2 bottom-2 w-1 rounded-full" style={{ backgroundColor: ENTITY_TYPES[hoveredLinkData.toType?.toUpperCase()]?.color }} />
                       <div className="flex flex-col pl-2">
                          <span className="text-[8px] font-black uppercase tracking-tighter text-slate-500 mb-0.5">
                             {ENTITY_TYPES[hoveredLinkData.toType?.toUpperCase()]?.label}
                          </span>
                          <span className="text-[14px] font-bold text-white tracking-tight leading-none italic">{hoveredLinkData.to}</span>
                       </div>
                       <div className="text-[8px] font-black text-slate-700 bg-white/5 px-2 py-1 rounded-md italic uppercase tracking-widest leading-none">
                          {hoveredLinkData.type === 'Structural Thread' ? 'CHILD' : 'TARGET'}
                       </div>
                    </div>
                 </div>
                 
                 <div className="text-[9px] text-slate-500 mt-8 font-bold tracking-widest leading-none border-t border-white/5 pt-4 italic">Click thread to focus destination</div>
              </motion.div>
            )}
          </AnimatePresence>
      </div>

      <StatusSidebars nodes={nodes} isCollapsed={isSidebarCollapsed} onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)} selectedNode={selectedNode} />

      <section 
        ref={containerRef}
        style={{ backgroundColor: 'var(--bg-matrix)' }}
        className="flex-1 relative overflow-hidden rounded-3xl border border-white/5 shadow-2xl"
        onMouseDown={handleMouseDown} onContextMenu={(e) => e.preventDefault()}
        onWheel={handleWheel}
      >
        
        <div className="absolute top-8 left-8 z-[100] flex flex-col gap-3" onMouseDown={e => e.stopPropagation()}>
           <div className="flex items-center gap-1.5 px-3 py-2 bg-black/40 backdrop-blur-md rounded-xl border border-white/5 shadow-2xl">
              <div className="flex items-center justify-center w-6 h-6 rounded bg-brand-cyan/10">
                 <Network size={12} className="text-brand-cyan" />
              </div>
              <div className="flex flex-col pr-2">
                 <span className="text-[7px] font-black tracking-widest text-brand-cyan/70 uppercase">Macro-Structure</span>
                 <span className="text-[10px] font-bold text-white tracking-tight leading-none uppercase">{layoutRules.layoutStyle.replace('_lr','').replace('_tb','').replace('_',' ')}</span>
              </div>
           </div>
           
            <div className="flex flex-col gap-1 p-3 bg-black/60 backdrop-blur-xl rounded-[16px] border border-white/10 shadow-3xl w-64">
              <div className="flex justify-between items-center px-1 mb-3 border-b border-white/5 pb-2">
                 <span className="text-[9px] font-black tracking-tighter text-slate-400 uppercase">Visual Governance Engine</span>
              </div>
              
              <div className="flex flex-col gap-4 px-1 mb-4">
                 <div className="flex flex-col gap-1.5">
                   <div className="flex justify-between items-center text-[9px] font-bold text-brand-cyan/80">
                      <span>CHILD GAP (B)</span>
                      <span className="text-white font-mono">{layoutRules.childGap}px</span>
                   </div>
                   <input type="range" min="0" max="150" step="1"
                          className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-cyan"
                          value={layoutRules.childGap}
                          onChange={(e) => updateRules({ childGap: parseInt(e.target.value) })} />
                 </div>

                 <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-[9px] font-bold text-brand-cyan/80">
                      <span>PARENT DISTANCE (A)</span>
                      <span className="text-white font-mono">{layoutRules.parentDistance}px</span>
                    </div>
                    <input type="range" min="100" max="1000" step="10"
                           className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-cyan"
                           value={layoutRules.parentDistance}
                           onChange={(e) => updateRules({ parentDistance: parseInt(e.target.value) })} />
                 </div>
              </div>

              <div className="flex gap-1 justify-center border-t border-white/5 pt-3 mt-1">
                {[
                  { id: 'radial', icon: Network, label: '360° Radial Star' },
                  { id: 'horizontal_lr', icon: AlignLeft, label: 'Horizontal Path' },
                  { id: 'vertical_tb', icon: AlignVerticalSpaceAround, label: 'Vertical Pillar' },
                  { id: 'tree', icon: GitMerge, label: 'Organization Comb' }
                ].map(opt => {
                   const isActive = layoutRules.layoutStyle === opt.id;
                   return (
                     <button 
                       key={opt.id}
                       onClick={() => {
                          const newRules = { ...layoutRules, layoutStyle: opt.id, radialExpansion: opt.id === 'radial', directionalLocking: true };
                          setLayoutRules(newRules);
                          applyLayout(newRules);
                       }}
                       title={opt.label}
                       className={`w-8 h-8 flex items-center justify-center rounded-[8px] transition-all group ${isActive ? 'bg-brand-cyan/20 border border-brand-cyan/20 shadow-[inset_0_0_15px_rgba(0,242,255,0.2)]' : 'border border-transparent hover:bg-white/5'}`}
                     >
                       <opt.icon size={14} className={isActive ? 'text-brand-cyan' : 'text-slate-500 group-hover:text-white transition-colors'} />
                     </button>
                   );
                })}
              </div>
            </div>
        </div>

        <MeshCanvas 
           nodes={nodes} view={view} layoutRules={layoutRules}
           hoveredNodeId={hoveredNodeId} setHoveredNodeId={setHoveredNodeId}
           hoveredLinkId={hoveredLinkId} setHoveredLinkId={setHoveredLinkId} setHoveredLinkData={setHoveredLinkData}
           onSelectNode={(n) => { setSelectedNode(n); setIsEditorOpen(true); setEditingNode(n); setCurrentType(n.type); setFormData({ title: n.title, content: n.content || {} }); }} 
           onAddOffshoot={(id) => { setActiveParentId(id); setIsEditorOpen(true); setEditingNode(null); setCurrentType(''); setFormData({ title: '[NEW_ENTITY_SPEC]', content: {} }); }} 
           onNodeDrag={(id, dx, dy) => { 
             setIsDraggingNode(true);
             draggedNodeIdRef.current = id; 
             setNodes(prev => {
                const node = prev.find(n => n.id === id);
                if (!node) return prev;
                const nx = node.x + dx;
                const ny = node.y + dy;
                return prev.map(n => n.id === id ? { ...n, x: nx, y: ny } : n);
             });
           }}
           onNodeDragEnd={(id) => {
             setIsDraggingNode(false);
             draggedNodeIdRef.current = null;
             setNodes(prev => prev.map(n => n.id === id ? { ...n, ox: n.x, oy: n.y } : n));
           }}
           onResetPosition={(id) => {
             setNodes(prev => prev.map(n => n.id === id ? { ...n, x: n.ox, y: n.oy } : n));
           }}
           onLinkClick={(tid) => { 
             setHoveredLinkId(null);
             const t = nodes.find(n => n.id === tid); 
             if (t) centerOnNode(t); 
           }}
        />
        <OrbitalNav nodes={nodes} view={view} setView={setView} stickPos={stickPos} setStickPos={setStickPos} onOpenAdmin={() => setIsAdminOpen(true)} onResetLayout={resetLayout} />
      </section>

      <AnimatePresence>
        {isEditorOpen && (
          <IntelligenceDrawer 
            isOpen={isEditorOpen} onClose={() => setIsEditorOpen(false)} nodes={nodes}
            editingNode={editingNode} currentType={currentType} setCurrentType={setCurrentType} 
            formData={formData} setFormData={setFormData} 
            onSave={(updatedData) => {
              if (editingNode) {
                setNodes(prev => prev.map(n => n.id === editingNode.id ? { ...n, ...updatedData, title: formData.title, type: currentType } : n));
              } else {
                const newId = `node_${Date.now()}`;
                 const parent = nodes.find(n => n.id === activeParentId);
                 const newNode = {
                   id: newId, parentId: activeParentId, x: parent ? parent.x + 300 : 1000, y: parent ? parent.y + 100 : 500,
                   title: formData.title, type: currentType, content: formData.content,
                   ox: parent ? parent.x + 300 : 1000, oy: parent ? parent.y + 100 : 500
                 };
                setNodes(prev => [...prev, { ...newNode, ox: newNode.x, oy: newNode.y }]);
              }
              setIsEditorOpen(false);
            }}
            onToggleConnection={(targetId) => {
               if (!editingNode) return;
               setNodes(prev => prev.map(n => {
                  if (n.id !== editingNode.id) return n;
                  const links = n.secondaryLinks || [];
                  const exists = links.includes(targetId);
                  return { ...n, secondaryLinks: exists ? links.filter(l => l !== targetId) : [...links, targetId] };
               }));
            }}
            onDeleteNode={(nodeId) => {
               const nodeToDelete = nodes.find(n => n.id === nodeId);
               if (!nodeToDelete) return;
               setDeletedNodes(prev => [...prev, nodeToDelete]);
               setNodes(prev => prev.filter(n => n.id !== nodeId).map(n => ({
                    ...n, secondaryLinks: (n.secondaryLinks || []).filter(l => l !== nodeId),
                    parentId: n.parentId === nodeId ? null : n.parentId
               })));
               setIsEditorOpen(false);
            }}
          />
        )}
        {isAdminOpen && (
          <AdminPanel 
            nodes={nodes} deletedNodes={deletedNodes}
            isOpen={isAdminOpen} onClose={() => setIsAdminOpen(false)} 
            onFocusNode={(n) => { 
                centerOnNode(n); setEditingNode(n); setCurrentType(n.type); 
                setFormData({ title: n.title, content: n.content || {} }); setIsEditorOpen(true); 
            }} 
            onRestoreNode={(nodeId) => {
               const nodeToRestore = deletedNodes.find(n => n.id === nodeId);
               if (!nodeToRestore) return;
               setNodes(prev => [...prev, nodeToRestore]);
               setDeletedNodes(prev => prev.filter(n => n.id !== nodeId));
            }}
            onReset={() => { 
              localStorage.removeItem('hive_mesh_v1.2'); 
              localStorage.removeItem('hive_mesh_waste_bin');
              window.location.reload(); 
            }} 
            layoutRules={layoutRules}
            setLayoutRules={setLayoutRules}
            applyLayout={applyLayout}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
