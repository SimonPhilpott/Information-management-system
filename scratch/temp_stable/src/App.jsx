import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { ENTITY_TYPES, SCHEMAS, INITIAL_NODES } from './data/nodes';
import { MeshCanvas } from './components/KnowledgeMesh/MeshCanvas';
import { OrbitalNav } from './components/Navigation/OrbitalNav';
import { StatusSidebars } from './components/Dashboard/StatusSidebars';
import { IntelligenceDrawer } from './components/Editor/IntelligenceDrawer';
import { AdminPanel } from './components/Admin/AdminPanel';
import { AnimatePresence, motion, animate } from 'framer-motion';
import { Activity, Link as LinkIcon, Cpu, ArrowDown, Network, GitMerge } from 'lucide-react';

export default function App() {
  const resetLayout = () => {
    if (window.confirm('This will permanently reset all node positions to the authoritative structural layout. Proceed?')) {
      localStorage.removeItem('hive_mesh_v1.5_full');
      window.location.reload();
    }
  };

  // CHECK FOR EMERGENCY RESET PARAM
  useEffect(() => {
    if (window.location.search.includes('reset=true')) {
      localStorage.clear();
      window.location.href = window.location.pathname;
    }
  }, []);

  const [nodes, setNodes] = useState(() => {
    try {
      const stored = localStorage.getItem('hive_mesh_v1.5_full');
      const data = stored ? JSON.parse(stored) : INITIAL_NODES;
      if (!Array.isArray(data) || data.length < 30) return INITIAL_NODES.map(n => ({ ...n, ox: n.x, oy: n.y }));
      return data.map(n => ({ ...n, ox: n.ox ?? n.x, oy: n.oy ?? n.y }));
    } catch { return INITIAL_NODES.map(n => ({ ...n, ox: n.x, oy: n.y })); }
  });

  const [deletedNodes, setDeletedNodes] = useState(() => {
    try {
      const stored = localStorage.getItem('hive_mesh_waste_bin');
      const data = stored ? JSON.parse(stored) : [];
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  });

  const [layoutRules, setLayoutRules] = useState(() => {
    try {
      const saved = localStorage.getItem('hive_mesh_rules_v1.5');
      const data = saved ? JSON.parse(saved) : null;
      if (!data || typeof data !== 'object') throw new Error('Invalid config');
      return { 
         childGap: data.childGap ?? 10,
         parentDistance: data.parentDistance ?? 200,
         connectionTension: data.connectionTension ?? 65,
         layoutStyle: data.layoutStyle ?? 'radial',
         directionalLocking: data.directionalLocking ?? true,
         unifiedSyncPoints: data.unifiedSyncPoints ?? true
      };
    } catch {
      return { 
         childGap: 10, parentDistance: 200, connectionTension: 65,
         layoutStyle: 'radial', directionalLocking: true, unifiedSyncPoints: true
      };
    }
  });

  useEffect(() => {
    try { localStorage.setItem('hive_mesh_rules_v1.5', JSON.stringify(layoutRules)); } catch (e) { console.error(e); }
  }, [layoutRules]);

  useEffect(() => {
    try { localStorage.setItem('hive_mesh_v1.5_full', JSON.stringify(nodes)); } catch (e) { console.error(e); }
  }, [nodes]);

  useEffect(() => {
    try { localStorage.setItem('hive_mesh_waste_bin', JSON.stringify(deletedNodes)); } catch (e) { console.error(e); }
  }, [deletedNodes]);

  const [view, setView] = useState({ x: 0, y: 0, scale: 0.8 });
  const [dragType, setDragType] = useState(null);
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
  const [stickPos, setStickPos] = useState({ x: 0, y: 0, active: false });
  
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [hoveringNodeId, setHoveringNodeId] = useState(null);
  const hoverTimeout = useRef(null);

  const handleHoverNode = (id) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    if (id) setHoveredNodeId(id);
    else {
      hoverTimeout.current = setTimeout(() => {
        setHoveredNodeId(null);
      }, 100);
    }
  };

  const [hoveredLinkId, setHoveredLinkId] = useState(null);
  const [hoveredLinkData, setHoveredLinkData] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const [selectedNode, setSelectedNode] = useState(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  const [editingNode, setEditingNode] = useState(null);
  const [tipHeight, setTipHeight] = useState(400);
  const tipRef = useRef(null);
  const [activeParentId, setActiveParentId] = useState(null);
  const [currentType, setCurrentType] = useState('CONCEPT');
  const [formData, setFormData] = useState({ title: '', content: {} });

  const containerRef = useRef(null);
  const requestRef = useRef();
  const stickRef = useRef({ x: 0, y: 0, active: false });
  const velocityRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleGlobalMouse = (e) => setMousePos({ x: e.clientX, y: e.clientY });
    
    const handleGlobalKey = (e) => {
      // Ignore if typing in input
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
      
      let nx = 0; let ny = 0; let active = true;
      const speed = 45;
      const diag = 32;

      switch(e.code) {
        case 'ArrowUp': case 'Numpad8': ny = -speed; break;
        case 'ArrowDown': case 'Numpad2': ny = speed; break;
        case 'ArrowLeft': case 'Numpad4': nx = -speed; break;
        case 'ArrowRight': case 'Numpad6': nx = speed; break;
        case 'Numpad7': nx = -diag; ny = -diag; break;
        case 'Numpad9': nx = diag; ny = -diag; break;
        case 'Numpad1': nx = -diag; ny = diag; break;
        case 'Numpad3': nx = diag; ny = diag; break;
        default: active = false;
      }

      if (active) {
        setStickPos({ x: nx, y: ny, active: true });
      }
    };

    const handleGlobalKeyUp = (e) => {
      const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Numpad8', 'Numpad2', 'Numpad4', 'Numpad6', 'Numpad7', 'Numpad9', 'Numpad1', 'Numpad3'];
      if (keys.includes(e.code)) {
        setStickPos({ x: 0, y: 0, active: false });
      }
    };

    window.addEventListener('mousemove', handleGlobalMouse);
    window.addEventListener('keydown', handleGlobalKey);
    window.addEventListener('keyup', handleGlobalKeyUp);
    
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouse);
      window.removeEventListener('keydown', handleGlobalKey);
      window.removeEventListener('keyup', handleGlobalKeyUp);
    };
  }, []);

  const panRef = useRef(null);

  const centerOnNode = (node) => {
    if (!node) return;
    const targetScale = 0.8;
    const targetX = window.innerWidth / 2 - (node.x + 112) * targetScale;
    const targetY = window.innerHeight / 2 - (node.y + 50) * targetScale;

    // Stop active manual pilot if we are starting a cinematic glide
    velocityRef.current = { x: 0, y: 0 };
    
    // Track start values from current view state
    const startPos = { x: view.x, y: view.y, scale: view.scale };
    let startTime = null;

    if (panRef.current) cancelAnimationFrame(panRef.current);

    const panStep = (timestamp) => {
       if (!startTime) startTime = timestamp;
       const progress = Math.min((timestamp - startTime) / 800, 1);
       
       const ease = progress < 0.5 
         ? 8 * progress * progress * progress * progress 
         : 1 - Math.pow(-2 * progress + 2, 4) / 2;

       setView(v => {
         const nv = {
           ...v,
           x: startPos.x + (targetX - startPos.x) * ease,
           y: startPos.y + (targetY - startPos.y) * ease,
           scale: startPos.scale + (targetScale - startPos.scale) * ease
         };
         return constrainView(nv, nodes);
       });

       if (progress < 1) panRef.current = requestAnimationFrame(panStep);
       else panRef.current = null;
    };

    panRef.current = requestAnimationFrame(panStep);
    setSelectedNode(node);
  };

  useEffect(() => {
    const rootNode = nodes.find(n => n.id === 'tt_group') || nodes[0];
    if (rootNode) centerOnNode(rootNode);
  }, []);

  const applyLayout = (rules) => {
      let newNodes = [...nodes];
      const roots = newNodes.filter(n => !n.parentId);
      
      const siblingGap = rules.childGap ?? 10;
      const vSpacing = 100 + siblingGap;
      const hSpacing = 224 + siblingGap;
      const expansionJump = rules.parentDistance ?? 200;

      const layoutQuadrant = (nodeId, dir, depth, offX, offY, visited = new Set()) => {
         if (visited.has(nodeId) || depth > 50) return 0;
         visited.add(nodeId);
         const node = newNodes.find(n => n.id === nodeId);
         if (!node) return 0;
         const children = newNodes.filter(n => n.parentId === nodeId);
         
         let span = 0;
         if (children.length === 0) span = 1; else children.forEach(child => {
             if (dir === 'Right' || dir === 'Left') span += layoutQuadrant(child.id, dir, depth + 1, offX, offY + span * vSpacing, visited);
             else span += layoutQuadrant(child.id, dir, depth + 1, offX + span * hSpacing, offY, visited);
         });

         if (dir === 'Right') { node.x = offX + (depth * (224 + expansionJump)); node.y = children.length > 0 ? offY + ((span - 1) * vSpacing) / 2 : offY; }
         else if (dir === 'Left') { node.x = offX - (depth * (224 + expansionJump)); node.y = children.length > 0 ? offY + ((span - 1) * vSpacing) / 2 : offY; }
         else if (dir === 'Down') { node.x = children.length > 0 ? offX + ((span - 1) * hSpacing) / 2 : offX; node.y = offY + (depth * (100 + expansionJump)); }
         else if (dir === 'Up') { node.x = children.length > 0 ? offX + ((span - 1) * hSpacing) / 2 : offX; node.y = offY - (depth * (100 + expansionJump)); }

         node.branchDir = dir; node.ox = node.x; node.oy = node.y;
         return span || 1;
      };

      roots.forEach(root => {
         root.x = 2000; root.y = 2000; root.ox = 2000; root.oy = 2000;
         if (rules.layoutStyle === 'horizontal_lr') { layoutQuadrant(root.id, 'Right', 0, 2000, 2000); return; }

         const chs = newNodes.filter(n => n.parentId === root.id);
         const topChs = chs.filter(c => c.title.includes('Regions'));
         const leftChs = chs.filter(c => c.title.includes('Business'));
         const rightChs = chs.filter(c => c.title.includes('Capabilities'));
         const botChs = chs.filter(c => !topChs.includes(c) && !leftChs.includes(c) && !rightChs.includes(c));

         const getSpan = (list) => {
            let total = 0;
            list.forEach(c => {
               const walk = (nid, seen = new Set()) => {
                  if (seen.has(nid) || seen.size > 50) return 0; seen.add(nid);
                  const cc = newNodes.filter(n => n.parentId === nid);
                  if (cc.length === 0) return 1;
                  let s = 0; cc.forEach(ch => { s += walk(ch.id, seen); });
                  return s;
               };
               total += walk(c.id);
            });
            return total;
         };

         const tS = getSpan(topChs); const bS = getSpan(botChs);
         const lS = getSpan(leftChs); const rS = getSpan(rightChs);

         const project = (d, dist, list, span) => {
            const coords = new Map();
            const run = (nid, dt, dep, ox, oy, seen = new Set()) => {
               if (seen.has(nid) || seen.size > 50) return 0; seen.add(nid);
               const n = newNodes.find(node => node.id === nid);
               if (!n) return 0;
               const cc = newNodes.filter(node => node.parentId === nid);
               let s = 0;
               if (cc.length === 0) s = 1; else cc.forEach(ch => {
                  if (dt === 'Right' || dt === 'Left') s += run(ch.id, dt, dep + 1, ox, oy + s * vSpacing, seen);
                  else s += run(ch.id, dt, dep + 1, ox + s * hSpacing, oy, seen);
               });
               let nx, ny;
               if (dt === 'Right') { nx = ox + (dep * (224 + dist)); ny = cc.length > 0 ? oy + ((s - 1) * vSpacing) / 2 : oy; }
               else if (dt === 'Left') { nx = ox - (dep * (224 + dist)); ny = cc.length > 0 ? oy + ((s - 1) * vSpacing) / 2 : oy; }
               else if (dt === 'Down') { nx = cc.length > 0 ? ox + ((s - 1) * hSpacing) / 2 : ox; ny = oy + (dep * (100 + dist)); }
               else if (dt === 'Up') { nx = cc.length > 0 ? ox + ((s - 1) * hSpacing) / 2 : ox; ny = oy - (dep * (100 + dist)); }
               coords.set(nid, { x: nx, y: ny }); return s;
            };
            let cx = root.x - Math.max(0, (span - 1) * hSpacing / 2);
            let cy = root.y - Math.max(0, (span - 1) * vSpacing / 2);
            if (d === 'Up' || d === 'Down') list.forEach(c => { cx += run(c.id, d, 1, cx, root.y) * hSpacing; });
            else list.forEach(c => { cy += run(c.id, d, 1, root.x, cy) * vSpacing; });
            return coords;
         };

         newNodes.forEach(n => { if (n.id !== root.id) { n.x = 0; n.y = 0; } });
         const resolve = (d, list, s) => {
            const p = project(d, expansionJump, list, s);
            p.forEach((pos, id) => { const n = newNodes.find(no => no.id === id); if (n) { n.x = pos.x; n.y = pos.y; n.ox = pos.x; n.oy = pos.y; n.branchDir = d; } });
         };
         resolve('Left', leftChs, lS); resolve('Right', rightChs, rS); resolve('Up', topChs, tS); resolve('Down', botChs, bS);
         root.branchDir = null;
      });

      setNodes(newNodes);
  };

  const constrainView = (v, currentNodes) => {
    if (!currentNodes || currentNodes.length === 0) return v;
    
    let minX = Infinity; let maxX = -Infinity;
    let minY = Infinity; let maxY = -Infinity;
    for (let i = 0; i < currentNodes.length; i++) {
        const n = currentNodes[i];
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
    }

    const padding = 300;
    const bMinX = minX - padding; const bMaxX = maxX + padding + 224;
    const bMinY = minY - padding; const bMaxY = maxY + padding + 100;

    const worldX = (window.innerWidth / 2 - v.x) / (v.scale || 1);
    const worldY = (window.innerHeight / 2 - v.y) / (v.scale || 1);

    let resX = v.x; let resY = v.y;
    
    if (worldX < bMinX) resX = window.innerWidth / 2 - bMinX * v.scale;
    else if (worldX > bMaxX) resX = window.innerWidth / 2 - bMaxX * v.scale;
    
    if (worldY < bMinY) resY = window.innerHeight / 2 - bMinY * v.scale;
    else if (worldY > bMaxY) resY = window.innerHeight / 2 - bMaxY * v.scale;

    return { ...v, x: resX, y: resY };
  };

  const animate = () => {
    const { x: sx, y: sy, active: isStickActive } = stickRef.current;
    
    // Interrupt cinematic pan if manual control detected
    if (isStickActive && (Math.abs(sx) > 1 || Math.abs(sy) > 1)) {
        if (panRef.current) {
            cancelAnimationFrame(panRef.current);
            panRef.current = null;
        }
    }
    
    // Tightened Velocity Engine: Reduced "skid" and increased start responsiveness
    const pilotDamping = isStickActive ? 0.2 : 0.15; 
    velocityRef.current.x += (sx - velocityRef.current.x) * pilotDamping;
    velocityRef.current.y += (sy - velocityRef.current.y) * pilotDamping;

    // Use a fixed frame-delta for consistent buttery feel across refresh rates
    const vx = velocityRef.current.x;
    const vy = velocityRef.current.y;

    if (Math.abs(vx) > 0.005 || Math.abs(vy) > 0.005) {
      setView(v => {
        const meshWidth = 2000;
        const speed = (12 + meshWidth / 1000) / v.scale;
        const nv = { ...v, x: v.x - (vx * (speed / 40)), y: v.y - (vy * (speed / 40)) };
        return constrainView(nv, nodes);
      });
    }
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => { stickRef.current = stickPos; }, [stickPos]);
  useEffect(() => { requestRef.current = requestAnimationFrame(animate); return () => cancelAnimationFrame(requestRef.current); }, []);

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = Math.exp(e.deltaY * -0.001);
    setView(v => {
      const ns = Math.min(Math.max(v.scale * factor, 0.1), 3);
      const ratio = ns / v.scale;
      const nv = { x: e.clientX - (e.clientX - v.x) * ratio, y: e.clientY - (e.clientY - v.y) * ratio, scale: ns };
      return constrainView(nv, nodes);
    });
  };

  const handleMouseDown = (e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('[drag]')) return;
    if (e.button === 0) setDragType('pan');
    if (e.button === 2) { e.preventDefault(); setDragType('zoom'); }
    setIsEditorOpen(false); setIsAdminOpen(false);
    setLastPos({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    const mm = (e) => {
      if (!dragType) return;
      const dx = e.clientX - lastPos.x; const dy = e.clientY - lastPos.y;
      if (dragType === 'pan') setView(v => constrainView({ ...v, x: v.x + dx, y: v.y + dy }, nodes));
      setLastPos({ x: e.clientX, y: e.clientY });
    };
    const mu = () => setDragType(null);
    if (dragType) { window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu); }
    return () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
  }, [dragType, lastPos, nodes]);

  useLayoutEffect(() => {
    if (hoveredNodeId && tipRef.current) {
      setTipHeight(tipRef.current.offsetHeight);
    }
  }, [hoveredNodeId, nodes]);

  const getTipPos = (tw, th) => {
    let nx = mousePos.x + 35; 
    let ny = mousePos.y + 10;
    
    // Horizontal edge protection
    if (nx + tw > window.innerWidth - 30) nx = mousePos.x - tw - 35;
    
    // Vertical edge protection: Flip to top if in bottom half or if overflowing
    const overflowBottom = ny + th > window.innerHeight - 30;
    const isBottomHalf = mousePos.y > window.innerHeight * 0.55;
    
    if (isBottomHalf || overflowBottom) {
      ny = mousePos.y - th - 10;
    }
    
    return { x: Math.max(15, nx), y: Math.max(15, ny) };
  };

  return (
    <div className="flex h-screen p-8 gap-8 antialiased overflow-hidden select-none relative bg-[#020617]">
      <div className="fixed inset-0 pointer-events-none opacity-30">
        <div className="absolute top-0 right-1/4 w-[900px] h-[900px] bg-brand-cyan/20 blur-[180px] rounded-full -translate-y-1/2" />
        <div className="absolute bottom-0 left-1/4 w-[700px] h-[700px] bg-brand-purple/20 blur-[150px] rounded-full translate-y-1/2" />
      </div>

      <div className="fixed inset-0 pointer-events-none z-[1000000]">
          <AnimatePresence mode="wait">
            {(hoveredNodeId && !isDraggingNode) && (
              <motion.div 
                   ref={tipRef}
                   initial={{ opacity: 0, scale: 0.95 }} 
                   animate={{ opacity: 1, scale: 1 }} 
                   exit={{ opacity: 0, scale: 0.95 }} 
                   className="fixed backdrop-blur-3xl border border-white/10 p-6 rounded-3xl w-[448px] border-t-4 bg-black/85 shadow-3xl z-[2000000] flex flex-col pointer-events-auto" 
                   onMouseEnter={() => { if (hoverTimeout.current) clearTimeout(hoverTimeout.current); }}
                   onMouseLeave={() => handleHoverNode(null)}
                   style={{ 
                     left: getTipPos(448, tipHeight).x, 
                     top: getTipPos(448, tipHeight).y, 
                     borderTopColor: ENTITY_TYPES[nodes.find(n => n.id === hoveredNodeId)?.type]?.color 
                   }}>
                 <div className="flex items-center gap-2 mb-4"><Activity size={12} className="text-brand-cyan" /><span className="text-[10px] font-bold tracking-[0.1em] text-brand-cyan uppercase">Extract</span></div>
                 <h4 className="text-white font-bold text-base mb-2 italic tracking-tight">{nodes.find(n => n.id === hoveredNodeId)?.title}</h4>
                 <p className="text-[13px] text-slate-300 leading-relaxed italic mb-5 border-b border-white/5 pb-5">{nodes.find(n => n.id === hoveredNodeId)?.content?.Summary || 'Tactical metadata pending...'}</p>
                 <div className="flex flex-col gap-3 min-h-0">
                    <span className="text-[10px] font-bold text-slate-500 tracking-wider block">Relationships</span>
                    <div className="flex flex-col gap-2 pr-2 overflow-y-auto max-h-[60vh] custom-scrollbar pointer-events-auto">
                      {(() => {
                        const h = nodes.find(n => n.id === hoveredNodeId); if (!h) return null;
                        const rels = [];
                        if (h.parentId) { const p = nodes.find(n => n.id === h.parentId); if (p) rels.push({ n: p, l: 'Parent' }); }
                        nodes.filter(n => n.parentId === h.id).forEach(c => rels.push({ n: c, l: 'Child' }));
                        (h.secondaryLinks || []).forEach(sid => { const s = nodes.find(n => n.id === sid); if (s) rels.push({ n: s, l: 'Transverse' }); });
                        nodes.filter(n => (n.secondaryLinks || []).includes(h.id)).forEach(n => rels.push({ n, l: 'Origin' }));
                        return rels.map((r, i) => (
                           <div key={i} className="px-3 py-2.5 rounded-xl border border-white/5 bg-white/[0.01] flex items-center justify-between pointer-events-auto" style={{ borderLeft: `3px solid ${ENTITY_TYPES[r.n.type]?.color}` }}>
                              <div className="flex flex-col"><span className="text-[8px] font-black uppercase tracking-tighter text-slate-500 mb-0.5">{ENTITY_TYPES[r.n.type]?.label}</span><span className="text-[12px] font-bold text-white/90 italic truncate max-w-[200px]">{r.n.title}</span></div>
                              <div className="text-[8px] font-black px-2 py-1 rounded-md italic uppercase tracking-widest leading-none border shrink-0 ml-4" style={{ color: ENTITY_TYPES[r.n.type]?.color, borderColor: `${ENTITY_TYPES[r.n.type]?.color}30` }}>{r.l}</div>
                           </div>
                        ));
                      })()}
                    </div>
                 </div>
               </motion.div>
            )}

            {(hoveredLinkData && !isDraggingNode) && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="fixed backdrop-blur-3xl border border-white/10 p-6 rounded-3xl w-[448px] border-t-4 bg-black/85 shadow-3xl z-[2000000] flex flex-col border-t-brand-cyan"
                style={{ left: getTipPos(448, 300).x, top: getTipPos(448, 300).y }}
              >
                <div className="flex items-center gap-2 mb-4"><LinkIcon size={12} className="text-brand-cyan" /><span className="text-[10px] font-bold tracking-[0.1em] text-brand-cyan uppercase">Link Logic</span></div>
                
                <div className="flex flex-col gap-1">
                  {/* From Entity */}
                  <div className="px-4 py-3 rounded-xl border border-white/5 bg-white/[0.02] flex items-center justify-between" style={{ borderLeft: `3px solid ${ENTITY_TYPES[hoveredLinkData.fromType?.toUpperCase()]?.color || '#00f2ff'}` }}>
                     <div className="flex flex-col">
                        <span className="text-[8px] font-black uppercase tracking-tighter text-slate-500 mb-0.5">{hoveredLinkData.fromType}</span>
                        <span className="text-[13px] font-bold text-white/90 italic">{hoveredLinkData.from}</span>
                     </div>
                     <div className="text-[8px] font-black px-2 py-1 rounded-md italic uppercase tracking-widest leading-none border border-brand-cyan/20 text-brand-cyan">Source</div>
                  </div>

                  {/* Flow Arrow */}
                  <div className="py-1 flex justify-center">
                     <div className="w-px h-3 bg-gradient-to-b from-brand-cyan to-transparent relative">
                        <ArrowDown size={10} className="absolute -bottom-1 -left-[4.5px] text-brand-cyan opacity-40" />
                     </div>
                  </div>

                  {/* To Entity */}
                  <div className="px-4 py-3 rounded-xl border border-white/5 bg-white/[0.02] flex items-center justify-between" style={{ borderLeft: `3px solid ${ENTITY_TYPES[hoveredLinkData.toType?.toUpperCase()]?.color || '#00f2ff'}` }}>
                     <div className="flex flex-col">
                        <span className="text-[8px] font-black uppercase tracking-tighter text-slate-500 mb-0.5">{hoveredLinkData.toType}</span>
                        <span className="text-[13px] font-bold text-white/90 italic">{hoveredLinkData.to}</span>
                     </div>
                     <div className="text-[8px] font-black px-2 py-1 rounded-md italic uppercase tracking-widest leading-none border border-slate-700 text-slate-400">Target</div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/5 flex justify-center">
                    <span className="text-[10px] font-bold text-brand-cyan/80 bg-brand-cyan/5 px-3 py-1.5 rounded-full italic tracking-tight">{hoveredLinkData.type}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
      </div>

      <StatusSidebars nodes={nodes} isCollapsed={isSidebarCollapsed} onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)} selectedNode={selectedNode} onNodeSearch={centerOnNode} />

      <section ref={containerRef} className="flex-1 relative overflow-hidden rounded-3xl border border-white/5 shadow-2xl bg-black/20" onMouseDown={handleMouseDown} onContextMenu={(e) => e.preventDefault()} onWheel={handleWheel}>
        <AnimatePresence>
          {isAppearanceOpen && (
            <motion.div 
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="absolute top-8 left-8 z-[100] flex flex-col gap-3" 
              onMouseDown={e => e.stopPropagation()}
            >
               <div className="flex flex-col gap-1 p-3 bg-black/60 backdrop-blur-xl rounded-[16px] border border-white/10 shadow-3xl w-64 relative">
                  <button 
                    onClick={() => setIsAppearanceOpen(false)}
                    className="absolute top-3 right-3 p-1 hover:bg-white/5 rounded-full transition-colors text-slate-500 hover:text-white"
                  >
                    <ArrowDown size={14} className="rotate-45" /> {/* Using ArrowDown as a cross shorthand or I can just import X */}
                  </button>
                  <span className="text-[9px] font-black tracking-tighter text-slate-400 uppercase mb-3 text-center">Mesh Appearance</span>
                  <div className="flex flex-col gap-4 px-1 mb-4">
                     <div className="flex flex-col gap-1.5"><div className="flex justify-between items-center text-[9px] font-bold text-brand-cyan/80"><span>CHILD GAP</span><span className="text-white font-mono">{layoutRules.childGap}px</span></div><input type="range" min="0" max="150" value={layoutRules.childGap} onChange={(e) => { const u = { ...layoutRules, childGap: parseInt(e.target.value) }; setLayoutRules(u); applyLayout(u); }} className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-cyan" /></div>
                     <div className="flex flex-col gap-1.5"><div className="flex justify-between items-center text-[9px] font-bold text-brand-cyan/80"><span>PARENT DISTANCE</span><span className="text-white font-mono">{layoutRules.parentDistance}px</span></div><input type="range" min="100" max="1000" value={layoutRules.parentDistance} onChange={(e) => { const u = { ...layoutRules, parentDistance: parseInt(e.target.value) }; setLayoutRules(u); applyLayout(u); }} className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-cyan" /></div>
                     <div className="flex flex-col gap-1.5"><div className="flex justify-between items-center text-[9px] font-bold text-brand-cyan/80"><span>TENSION</span><span className="text-white font-mono">{layoutRules.connectionTension}%</span></div><input type="range" min="10" max="100" value={layoutRules.connectionTension} onChange={(e) => { const u = { ...layoutRules, connectionTension: parseInt(e.target.value) }; setLayoutRules(u); applyLayout(u); }} className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-cyan" /></div>
                  </div>
                  <div className="flex gap-1 justify-center border-t border-white/5 pt-3 mt-1">
                    {[ { id: 'radial', icon: Network }, { id: 'horizontal_lr', icon: GitMerge } ].map(opt => {
                       const isActive = layoutRules.layoutStyle === opt.id;
                       return (
                         <button key={opt.id} onClick={() => { const isR = opt.id === 'radial'; const r = { ...layoutRules, layoutStyle: opt.id, childGap: isR ? 10 : layoutRules.childGap, parentDistance: isR ? 200 : layoutRules.parentDistance }; setLayoutRules(r); applyLayout(r); }} className={`w-8 h-8 flex items-center justify-center rounded-[8px] transition-all ${isActive ? 'bg-brand-cyan/20 border border-brand-cyan/20' : 'hover:bg-white/5'}`}><opt.icon size={14} className={isActive ? 'text-brand-cyan' : 'text-slate-500'} /></button>
                       );
                    })}
                  </div>
               </div>
            </motion.div>
          )}
        </AnimatePresence>

        <MeshCanvas 
           nodes={nodes} view={view} layoutRules={layoutRules} hoveredNodeId={hoveredNodeId} setHoveredNodeId={handleHoverNode}
           hoveredLinkId={hoveredLinkId} setHoveredLinkId={setHoveredLinkId} setHoveredLinkData={setHoveredLinkData} isMovingMesh={!!dragType}
           onSelectNode={(n) => { setSelectedNode(n); setIsEditorOpen(true); setEditingNode(n); setCurrentType(n.type); setFormData({ title: n.title, content: n.content || {} }); }} 
           onAddOffshoot={(id) => { setActiveParentId(id); setIsEditorOpen(true); setEditingNode(null); setCurrentType(''); setFormData({ title: '[NEW_ENTITY_SPEC]', content: {} }); }} 
           onNodeDrag={(id, dx, dy) => setNodes(prev => prev.map(n => n.id === id ? { ...n, x: n.x + dx, y: n.y + dy } : n))}
           onNodeDragEnd={(id) => setNodes(prev => prev.map(n => n.id === id ? { ...n, ox: n.x, oy: n.y } : n))}
           onResetPosition={(id) => setNodes(prev => prev.map(n => n.id === id ? { ...n, x: n.ox, y: n.oy } : n))}
           onLinkClick={(cid, pid) => { 
             setHoveredLinkId(null); 
             const targetId = (selectedNode?.id === cid) ? pid : cid;
             centerOnNode(nodes.find(n => n.id === targetId)); 
           }}
        />
        <OrbitalNav nodes={nodes} view={view} setView={setView} stickPos={stickPos} setStickPos={setStickPos} onOpenAdmin={() => setIsAdminOpen(true)} onOpenAppearance={() => setIsAppearanceOpen(!isAppearanceOpen)} onResetLayout={resetLayout} />
      </section>

      <AnimatePresence>
        {isEditorOpen && (
          <IntelligenceDrawer isOpen={isEditorOpen} onClose={() => setIsEditorOpen(false)} nodes={nodes} editingNode={editingNode} currentType={currentType} setCurrentType={setCurrentType} formData={formData} setFormData={setFormData} onSave={(u) => { if (editingNode) setNodes(prev => prev.map(n => n.id === editingNode.id ? { ...n, ...u, title: formData.title, type: currentType } : n)); else { const id = `node_${Date.now()}`; const p = nodes.find(n => n.id === activeParentId); const nn = { id, parentId: activeParentId, x: p ? p.x + 300 : 1000, y: p ? p.y + 100 : 500, title: formData.title, type: currentType, content: formData.content, ox: p ? p.x + 300 : 1000, oy: p ? p.y + 100 : 500 }; setNodes(prev => [...prev, nn]); } setIsEditorOpen(false); }} onToggleConnection={(tid) => { if (!editingNode) return; setNodes(prev => prev.map(n => (n.id === editingNode.id) ? { ...n, secondaryLinks: (n.secondaryLinks || []).includes(tid) ? n.secondaryLinks.filter(l => l !== targetId) : [...links, targetId] } : n)); }} onDeleteNode={(nid) => { setDeletedNodes(prev => [...prev, nodes.find(n => n.id === nid)]); setNodes(prev => prev.filter(n => n.id !== nid)); setIsEditorOpen(false); }} />
        )}
        {isAdminOpen && (
          <AdminPanel nodes={nodes} deletedNodes={deletedNodes} isOpen={isAdminOpen} onClose={() => setIsAdminOpen(false)} onFocusNode={(n) => { centerOnNode(n); setIsEditorOpen(true); }} onRestoreNode={(nid) => { const r = deletedNodes.find(n => n.id === nid); if (r) { setNodes(prev => [...prev, r]); setDeletedNodes(prev => prev.filter(n => n.id !== nid)); } }} onReset={resetLayout} layoutRules={layoutRules} setLayoutRules={setLayoutRules} applyLayout={applyLayout} />
        )}
      </AnimatePresence>
    </div>
  );
}
