import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ENTITY_TYPES, SCHEMAS } from './data/nodes';
import { MESHES } from './data/mesh_authority.js';

const MESH_JSON_AUTHORITY = MESHES;
import { MeshCanvas } from './components/KnowledgeMesh/MeshCanvas';
import { OrbitalNav } from './components/Navigation/OrbitalNav';
import Layout from './components/Dashboard/Layout';
import ChatInterface from './components/Dashboard/ChatInterface';
import { IntelligenceDrawer } from './components/Editor/IntelligenceDrawer';
import { AdminPanel } from './components/Admin/AdminPanel';
import { SpatialCanvas } from './components/KnowledgeMesh/SpatialCanvas';
import { InstancedSpatialCanvas } from './components/KnowledgeMesh/InstancedSpatialCanvas';
import { AnimatePresence, motion, animate } from 'framer-motion';
import { Activity, Link as LinkIcon, Cpu, ArrowDown, Network, GitMerge, Box, Layers, Type, Sparkles } from 'lucide-react';

import { useAppLogic } from './hooks/useAppLogic';
import OnboardingSetup from './components/Dashboard/OnboardingSetup';
import { checkIsEntertainment } from './utils/contentFilter';

export default function App() {
  const { state, actions } = useAppLogic();
  const { authStatus, settings, loading } = state;

  // Auth callback check
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success') {
      window.history.replaceState({}, '', '/');
      window.location.reload(); // Refresh to pick up new tokens
    }
  }, []);

  const resetLayout = () => {
    if (window.confirm('WARNING: This will permanently purge ALL changes and reset your workspace to the authoritative NAVXML structure. Proceed?')) {
      localStorage.clear();
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
    // VERSIONED STORAGE KEY: hive_mesh_v13_corporate_hierarchy
    const saved = localStorage.getItem('hive_mesh_v13_corporate_hierarchy');
    const data = saved ? JSON.parse(saved) : MESH_JSON_AUTHORITY;
    
    // STABILITY PASS: Remove duplicates based on ID
    const uniqueMap = new Map();
    data.forEach(n => { if (n && n.id) uniqueMap.set(n.id, n); });
    return Array.from(uniqueMap.values());
  });

  const filteredNodes = useMemo(() => {
    const isEntertainment = (node) => {
      if (!node) return false;
      if (checkIsEntertainment(node.title) || checkIsEntertainment(node.type)) return true;
      // Also check ancestor chain
      let parentId = node.parentId;
      let depth = 0;
      while (parentId && depth < 20) {
        const parent = nodes.find(n => n.id === parentId);
        if (!parent) break;
        if (checkIsEntertainment(parent.title) || checkIsEntertainment(parent.type)) return true;
        parentId = parent.parentId;
        depth++;
      }
      return false;
    };
    return nodes.filter(n => !isEntertainment(n));
  }, [nodes]);

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
         childGap: data.childGap ?? 50,
         parentDistance: data.parentDistance ?? 400,
         connectionTension: data.connectionTension ?? 60,
         layoutStyle: data.layoutStyle ?? 'radial',
         projectionMode: data.projectionMode ?? '2d',
         directionalLocking: data.directionalLocking ?? true,
         unifiedSyncPoints: data.unifiedSyncPoints ?? true,
         showLabels: data.showLabels ?? true,
         labelStyle: data.labelStyle ?? 'standard'
      };
    } catch {
      return { 
         childGap: 50, parentDistance: 400, connectionTension: 60,
         layoutStyle: 'radial', projectionMode: 'instanced_3d', directionalLocking: true, unifiedSyncPoints: true,
         showLabels: true, labelStyle: 'standard'
      };
    }
  });

  useEffect(() => {
    try { localStorage.setItem('hive_mesh_rules_v1.5', JSON.stringify(layoutRules)); } catch (e) { console.error(e); }
  }, [layoutRules]);

  useEffect(() => {
    try { localStorage.setItem('hive_mesh_v13_corporate_hierarchy', JSON.stringify(nodes)); } catch (e) { console.error(e); }
  }, [nodes]);

  useEffect(() => {
    try { localStorage.setItem('hive_mesh_waste_bin', JSON.stringify(deletedNodes)); } catch (e) { console.error(e); }
  }, [deletedNodes]);

  const [view, setView] = useState(() => {
    const saved = localStorage.getItem('hive_mesh_viewport_v1');
    return saved ? JSON.parse(saved) : { x: 0, y: 0, scale: 0.8 };
  });
  const viewRef = useRef(view);
  
  useEffect(() => {
    localStorage.setItem('hive_mesh_viewport_v1', JSON.stringify(view));
  }, [view]);

  const meshRef = useRef(null);
  const [dragType, setDragType] = useState(null);
  const isDraggingNode = false; // Internal tracking
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
  const [stickPos, setStickPos] = useState({ x: 0, y: 0, active: false });
  
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const hoverTimeout = useRef(null);

  const [selectedNode, setSelectedNode] = useState(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);

  const activeDisplayNode = useMemo(() => {
    if (!hoveredNodeId && !selectedNode) return null;
    if (hoveredNodeId) {
        const hovered = nodes.find(n => n.id === hoveredNodeId);
        if (hovered) return hovered;
    }
    return selectedNode;
  }, [nodes, hoveredNodeId, selectedNode]);

  const handleHoverNode = (id) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    
    // INTERACTION LOCK: Block hover extraction if dragging is in progress
    if ((!!dragType || isDraggingNode) && id) {
       setHoveredNodeId(null);
       return;
     }


    if (id) setHoveredNodeId(id);
    else {
      hoverTimeout.current = setTimeout(() => {
        setHoveredNodeId(null);
      }, 80);
    }
  };

  const [hoveredLinkId, setHoveredLinkId] = useState(null);
  const [hoveredLinkData, setHoveredLinkData] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [movingNodeId, setMovingNodeId] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  const [editingNode, setEditingNode] = useState(null);
  const [activeParentId, setActiveParentId] = useState(null);
  const [currentType, setCurrentType] = useState('CONCEPT');
  const [formData, setFormData] = useState({ title: '', content: {} });

  const containerRef = useRef(null);
  const requestRef = useRef();
  const stickRef = useRef({ x: 0, y: 0, active: false });
  const velocityRef = useRef({ x: 0, y: 0 });

  const pressedKeys = useRef(new Set());

  useEffect(() => {
    const handleGlobalMouse = (e) => setMousePos({ x: e.clientX, y: e.clientY });
    
    const updatePilot = () => {
      let nx = 0;
      let ny = 0;
      const speed = 45;
      const diag = 32;

      const keys = pressedKeys.current;
      
      if (keys.has('ArrowUp') || keys.has('Numpad8')) ny -= speed;
      if (keys.has('ArrowDown') || keys.has('Numpad2')) ny += speed;
      if (keys.has('ArrowLeft') || keys.has('Numpad4')) nx -= speed;
      if (keys.has('ArrowRight') || keys.has('Numpad6')) nx += speed;

      if (keys.has('Numpad7')) { nx = -diag; ny = -diag; }
      if (keys.has('Numpad9')) { nx = diag; ny = -diag; }
      if (keys.has('Numpad1')) { nx = -diag; ny = diag; }
      if (keys.has('Numpad3')) { nx = diag; ny = diag; }

      setStickPos({ x: nx, y: ny, active: nx !== 0 || ny !== 0 });
    };

    const handleGlobalKey = (e) => {
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
      pressedKeys.current.add(e.code);
      updatePilot();
    };

    const handleGlobalKeyUp = (e) => {
      pressedKeys.current.delete(e.code);
      updatePilot();
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

  const centerOnPoint = (worldX, worldY) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const targetScale = 0.8;
    const targetX = rect.width / 2 - (worldX) * targetScale;
    const targetY = rect.height / 2 - (worldY) * targetScale;

    velocityRef.current = { x: 0, y: 0 };
    const startPos = { x: viewRef.current.x, y: viewRef.current.y, scale: viewRef.current.scale };
    let startTime = null;

    if (panRef.current) cancelAnimationFrame(panRef.current);

    const panStep = (timestamp) => {
       if (!startTime) startTime = timestamp;
       const progress = Math.min((timestamp - startTime) / 800, 1);
       const ease = progress < 0.5 ? 8 * progress**4 : 1 - Math.pow(-2 * progress + 2, 4) / 2;

       const nv = constrainView({
         x: startPos.x + (targetX - startPos.x) * ease,
         y: startPos.y + (targetY - startPos.y) * ease,
         scale: startPos.scale + (targetScale - startPos.scale) * ease
       }, nodes);
       
       viewRef.current = nv;
       if (meshRef.current) {
         meshRef.current.style.transform = `translate3d(${nv.x}px, ${nv.y}px, 0) scale(${nv.scale})`;
       }

       if (progress < 1) panRef.current = requestAnimationFrame(panStep);
       else { panRef.current = null; setView(nv); }
    };

    panRef.current = requestAnimationFrame(panStep);
  };

  const centerOnNode = (node) => {
    if (!node) return;
    centerOnPoint(node.x + 112, node.y + 50);
    setSelectedNode(node);
  };

  const handleApplyAIProposal = (proposal) => {
    setNodes(prevNodes => {
      let updated = [...prevNodes];
      
      if (proposal.type === 'update') {
          updated = updated.map(n => {
            if (n.id === proposal.targetId) {
                return { ...n, content: { ...n.content, [proposal.field]: proposal.newValue } };
            }
            return n;
          });
      } else if (proposal.type === 'new_node') {
          const parent = prevNodes.find(n => n.id === proposal.parentId);
          const newNode = {
            id: proposal.id || `ai_${Date.now()}`,
            parentId: proposal.parentId,
            title: proposal.title,
            type: proposal.nodeType,
            content: { Summary: proposal.reason },
            x: parent ? parent.x + 300 : 2000,
            y: parent ? parent.y : 2000,
            ox: parent ? parent.x + 300 : 2000,
            oy: parent ? parent.y : 2000,
            secondaryLinks: []
          };
          updated.push(newNode);
      } else if (proposal.type === 'connection') {
          updated = updated.map(n => {
            if (n.id === proposal.fromId) {
                const links = n.secondaryLinks || [];
                if (!links.includes(proposal.toId)) {
                   return { ...n, secondaryLinks: [...links, proposal.toId] };
                }
            }
            return n;
          });
      }

      return updated;
    });

    if (proposal.type === 'new_node' || proposal.type === 'connection') {
        const nextNodes = proposal.type === 'new_node' ? [...nodes, { id: proposal.id || `ai_${Date.now()}`, parentId: proposal.parentId, title: proposal.title, type: proposal.nodeType, content: { Summary: proposal.reason }, x: 2000, y: 2000, ox: 2000, oy: 2000, secondaryLinks: [] }] : nodes;
        setTimeout(() => applyLayout(layoutRules, nextNodes), 100);
    }
  };

  useEffect(() => {
    // STATE INTEGRITY CHECK: Purge any accidental NaN values from storage
    setNodes(prev => prev.map(n => ({
      ...n,
      x: isNaN(n.x) ? 2000 : n.x,
      y: isNaN(n.y) ? 2000 : n.y,
      ox: isNaN(n.ox) ? 2000 : n.ox,
      oy: isNaN(n.oy) ? 2000 : n.oy
    })));

    // MANDATORY INITIAL LAYOUT: Ensure authoritative spacing on cold boot
    applyLayout(layoutRules);

    const rootNode = nodes.find(n => n.id === 'tt_group') || nodes[0];
    if (rootNode) {
       setTimeout(() => centerOnNode(rootNode), 100);
    }
  }, []);

  useEffect(() => {
    if (layoutRules.projectionMode === '2d') {
      const rootNode = nodes.find(n => n.id === 'tt_group') || nodes[0];
      if (rootNode) {
        setTimeout(() => centerOnNode(rootNode), 100);
      }
    }
  }, [layoutRules.projectionMode]);

  const applyLayout = (rules, baseNodes = null) => {
      let newNodes = baseNodes ? [...baseNodes] : [...nodes];
      const roots = newNodes.filter(n => !n.parentId);
      
      const siblingGap = rules.childGap ?? 10;
      const vSpacing = 100 + siblingGap;
      const hSpacing = 224 + siblingGap;
      const expansionJump = rules.parentDistance ?? 200;

      roots.forEach(root => {
         root.x = 2000; root.y = 2000; root.ox = 2000; root.oy = 2000;
         if (rules.layoutStyle === 'horizontal_lr') { 
            const walkLR = (nid, depth, ox, oy, seen = new Set()) => {
               if (seen.has(nid) || seen.size > 1000) return 0; seen.add(nid);
               const n = newNodes.find(no => no.id === nid);
               if (!n) return 0;
               const children = newNodes.filter(no => no.parentId === nid);
               let s = 0; if (children.length === 0) s = 1; else children.forEach(child => { s += walkLR(child.id, depth + 1, ox, oy + s * vSpacing, seen); });
               n.x = ox + (depth * (224 + expansionJump)); n.y = children.length > 0 ? oy + ((s - 1) * vSpacing) / 2 : oy;
               n.ox = n.x; n.oy = n.y; n.branchDir = 'Right'; return s;
            };
            walkLR(root.id, 0, 2000, 2000); return; 
         }

         const chs = newNodes.filter(n => n.parentId === root.id);
         const topChs = chs.filter(c => c.title.includes('Regions'));
         const leftChs = chs.filter(c => c.title.includes('Business') || c.title.includes('Operations'));
         const rightChs = chs.filter(c => c.title.includes('Capabilities'));
         const botChs = chs.filter(c => !topChs.includes(c) && !leftChs.includes(c) && !rightChs.includes(c));

         const getSpan = (list) => {
            let total = 0;
            list.forEach(c => {
               const walk = (nid, seen = new Set()) => {
                  if (seen.has(nid) || seen.size > 1000) return 0; seen.add(nid);
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
            const quadrantDist = dist * 1.2; 
            const run = (nid, dt, dep, ox, oy, seen = new Set()) => {
               if (seen.has(nid) || seen.size > 1000) return 0; seen.add(nid);
               const n = newNodes.find(node => node.id === nid);
               if (!n) return 0;
               const cc = newNodes.filter(node => node.parentId === nid);
               let s = 0;
               if (cc.length === 0) s = 1; else cc.forEach(ch => {
                  if (dt === 'Right' || dt === 'Left') s += run(ch.id, dt, dep + 1, ox, oy + s * vSpacing, seen);
                  else s += run(ch.id, dt, dep + 1, ox + s * hSpacing, oy, seen);
               });
               let nx, ny;
               if (dt === 'Right') { nx = ox + (dep * (224 + quadrantDist)); ny = cc.length > 0 ? oy + ((s - 1) * vSpacing) / 2 : oy; }
               else if (dt === 'Left') { nx = ox - (dep * (224 + quadrantDist)); ny = cc.length > 0 ? oy + ((s - 1) * vSpacing) / 2 : oy; }
               else if (dt === 'Down') { nx = cc.length > 0 ? ox + ((s - 1) * hSpacing) / 2 : ox; ny = oy + (dep * (100 + quadrantDist)); }
               else if (dt === 'Up') { nx = cc.length > 0 ? ox + ((s - 1) * hSpacing) / 2 : ox; ny = oy - (dep * (100 + quadrantDist)); }
               
               if (isNaN(nx)) nx = ox; if (isNaN(ny)) ny = oy;
               coords.set(nid, { x: nx, y: ny }); return s;
            };
            
            let safeSpan = Math.max(1, span);
            let cx = root.x - ((safeSpan - 1) * hSpacing / 2);
            let cy = root.y - ((safeSpan - 1) * vSpacing / 2);
            
            list.forEach(c => {
               if (d === 'Up' || d === 'Down') {
                  const step = run(c.id, d, 1, cx, root.y);
                  cx += step * hSpacing;
               } else {
                  const step = run(c.id, d, 1, root.x, cy);
                  cy += step * vSpacing;
               }
            });
            return coords;
         };

         newNodes.forEach(n => { if (n.id !== root.id) { n.x = 2000; n.y = 2000; } });
         const resolve = (d, list, s) => {
            const p = project(d, expansionJump, list, s);
            p.forEach((pos, id) => { const n = newNodes.find(no => no.id === id); if (n) { n.x = pos.x; n.y = pos.y; n.ox = pos.x; n.oy = pos.y; n.branchDir = d; } });
         };
         resolve('Left', leftChs, lS); resolve('Right', rightChs, rS); resolve('Up', topChs, tS); resolve('Down', botChs, bS);
         root.branchDir = null;
      });

      // COLLISION & CONSTRAINT RESOLUTION PASS (The A/B/C/D Elastic Logic)
      // This ensures nodes stop moving when they hit boundaries while others continue compacting
      const iterations = 20; 
      for (let iter = 0; iter < iterations; iter++) {
        let changed = false;
        
        // 1. Hierarchy Constraints: Ensure children don't crush their parents
        newNodes.forEach(child => {
          if (!child.parentId) return;
          const parent = newNodes.find(p => p.id === child.parentId);
          if (!parent) return;

          const minGapH = 260; // 224 node width + 36 gap
          const minGapV = 130; // 100 node height + 30 gap

          if (child.branchDir === 'Right' && child.x < parent.x + minGapH) { child.x = parent.x + minGapH; changed = true; }
          if (child.branchDir === 'Left' && child.x > parent.x - minGapH) { child.x = parent.x - minGapH; changed = true; }
          if (child.branchDir === 'Down' && child.y < parent.y + minGapV) { child.y = parent.y + minGapV; changed = true; }
          if (child.branchDir === 'Up' && child.y > parent.y - minGapV) { child.y = parent.y - minGapV; changed = true; }
        });

        // 2. Spatial Collision Avoidance: Push unrelated branches apart
        newNodes.forEach(n1 => {
          newNodes.forEach(n2 => {
            if (n1.id === n2.id) return;
            
            const dx = n1.x - n2.x;
            const dy = n1.y - n2.y;
            const adx = Math.abs(dx);
            const ady = Math.abs(dy);

            const padH = 250 + siblingGap * 0.5;
            const padV = 120 + siblingGap * 0.5;

            if (adx < padH && ady < padV) {
               changed = true;
               // Calculate required push to clear the overlap
               const overlapX = padH - adx;
               const overlapY = padV - ady;
               
               // Push along the shallower axis to minimize jitter
               if (overlapX < overlapY || ady < 20) {
                  const pushX = (overlapX * (dx >= 0 ? 1 : -1)) * 0.5;
                  if (n1.parentId) n1.x += pushX;
                  if (n2.parentId) n2.x -= pushX;
               } else {
                  const pushY = (overlapY * (dy >= 0 ? 1 : -1)) * 0.5;
                  if (n1.parentId) n1.y += pushY;
                  if (n2.parentId) n2.y -= pushY;
               }
            }
          });
        });

        if (!changed) break;
      }

      // Final Sync
      newNodes.forEach(n => { n.ox = n.x; n.oy = n.y; });
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

  const animateLoop = () => {
    const { x: sx, y: sy, active: isStickActive } = stickRef.current;
    
    if (isStickActive && (Math.abs(sx) > 1 || Math.abs(sy) > 1)) {
        if (panRef.current) { cancelAnimationFrame(panRef.current); panRef.current = null; }
    }
    
    const pilotDamping = isStickActive ? 0.2 : 0.15; 
    velocityRef.current.x += (sx - velocityRef.current.x) * pilotDamping;
    velocityRef.current.y += (sy - velocityRef.current.y) * pilotDamping;

    const vx = velocityRef.current.x;
    const vy = velocityRef.current.y;

    if (Math.abs(vx) > 0.005 || Math.abs(vy) > 0.005) {
      const v = viewRef.current;
      const meshWidth = 2500;
      const speed = (12 + meshWidth / 1000) / v.scale;
      const nv = constrainView({ 
        ...v, 
        x: v.x - (vx * (speed / 40)), 
        y: v.y - (vy * (speed / 40)) 
      }, nodes);
      
      viewRef.current = nv;
      if (meshRef.current) {
        meshRef.current.style.transform = `translate3d(${nv.x}px, ${nv.y}px, 0) scale(${nv.scale})`;
      }
    }
    requestRef.current = requestAnimationFrame(animateLoop);
  };

  // Sync state back on idle to ensure UI (like minimap) is accurate
  useEffect(() => {
    let timer;
    const sync = () => {
        if (Math.abs(velocityRef.current.x) < 0.01 && Math.abs(velocityRef.current.y) < 0.01 && !panRef.current) {
            setView(viewRef.current);
        }
        timer = setTimeout(sync, 200);
    };
    sync();
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => { stickRef.current = stickPos; }, [stickPos]);
  useEffect(() => { requestRef.current = requestAnimationFrame(animateLoop); return () => cancelAnimationFrame(requestRef.current); }, []);

  const handleWheel = (e) => {
    if (layoutRules.projectionMode === 'spatial_3d') return;
    e.preventDefault();
    const factor = Math.exp(e.deltaY * -0.001);
    const v = viewRef.current;
    const ns = Math.min(Math.max(v.scale * factor, 0.1), 3);
    const ratio = ns / v.scale;
    const nv = constrainView({ 
        x: e.clientX - (e.clientX - v.x) * ratio, 
        y: e.clientY - (e.clientY - v.y) * ratio, 
        scale: ns 
    }, nodes);
    
    viewRef.current = nv;
    if (meshRef.current) {
        meshRef.current.style.transform = `translate3d(${nv.x}px, ${nv.y}px, 0) scale(${nv.scale})`;
    }
    setView(nv); // Wheel zoom needs state sync for node clarity/LOD
  };

  const handleMouseDown = (e) => {
    // BLOCK PANNING IF CLICKING UI ELEMENTS, SIDEBARS, OR FIXED HUD
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('[drag]') || e.target.closest('.fixed')) return;

    if (e.button === 0) setDragType('pan');
    if (e.button === 2) { e.preventDefault(); setDragType('zoom'); }
    
    // Auto-collapse sidebars ONLY when clicking the ACTUAL mesh background
    setIsEditorOpen(false); 
    setIsAdminOpen(false);
    setLastPos({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    const mm = (e) => {
      if (!dragType) return;
      const dx = e.clientX - lastPos.x; const dy = e.clientY - lastPos.y;
      if (dragType === 'pan') {
          const v = viewRef.current;
          const nv = constrainView({ ...v, x: v.x + dx, y: v.y + dy }, nodes);
          viewRef.current = nv;
          if (meshRef.current) {
              meshRef.current.style.transform = `translate3d(${nv.x}px, ${nv.y}px, 0) scale(${nv.scale})`;
          }
      }
      setLastPos({ x: e.clientX, y: e.clientY });
    };
    const mu = () => {
        if (dragType) setView(viewRef.current);
        setDragType(null);
    };
    if (dragType) { window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu); }
    return () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
  }, [dragType, lastPos, nodes]);


  const handleBackup = async () => {
    const res = await fetch('/api/backup');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Backup failed');
    return data;
  };

  const getTipPos = (tw, th) => {
    let nx = mousePos.x + 35; 
    let ny = mousePos.y + 10;
    if (nx + tw > window.innerWidth - 30) nx = mousePos.x - tw - 35;
    const overflowBottom = ny + th > window.innerHeight - 30;
    const isBottomHalf = mousePos.y > window.innerHeight * 0.55;
    if (isBottomHalf || overflowBottom) ny = mousePos.y - th - 10;
    return { x: Math.max(15, nx), y: Math.max(15, ny) };
  };

  if (loading) {
    return (
      <div className="onboarding-overlay flex h-screen w-screen justify-center items-center bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans">
        <div className="flex flex-col items-center">
          <div className="w-10 h-10 border-4 border-accent-indigo border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-[var(--text-secondary)] font-medium animate-pulse">Initializing System...</p>
        </div>
      </div>
    );
  }

  if (!authStatus?.isAuthorized || !settings?.isConfigured) {
    return (
      <OnboardingSetup
        authStatus={authStatus}
        onComplete={() => window.location.reload()}
        API=""
      />
    );
  }

  return (
    <>
      <div className="fixed inset-0 pointer-events-none z-[1000000]">
        <AnimatePresence mode="wait">
          {(state.showMesh && hoveredNodeId && !isDraggingNode && activeDisplayNode) && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              className="absolute z-[2000] pointer-events-none"
              style={{ 
                left: mousePos.x + 20, 
                top: mousePos.y - 20,
                width: '448px'
              }}
            >
              <div className="glass-panel border-t-4 p-8 flex flex-col shadow-3xl" style={{ borderTopColor: ENTITY_TYPES[activeDisplayNode.type?.toUpperCase()]?.color || '#00f2ff', backgroundColor: 'rgba(5, 5, 15, 0.98)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Activity size={12} className="text-brand-cyan" />
                  <span className="text-[10px] font-bold tracking-[0.1em] text-brand-cyan uppercase">Information Summary</span>
                </div>
                
                <div className="flex flex-col mb-6">
                   <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1.5">{activeDisplayNode.type}</span>
                   <h4 className="text-white font-bold text-4xl italic tracking-tighter leading-none">{activeDisplayNode.title}</h4>
                </div>

                <p className="text-[14px] text-slate-300 leading-relaxed italic mb-8 border-b border-white/5 pb-8">
                  {activeDisplayNode.content?.Summary || activeDisplayNode.content?.['Definition Summary'] || 'Analytical breakdown in progress...'}
                </p>

                <div className="flex flex-col gap-4">
                   <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Connected Nodes</span>
                   <div className="flex flex-col gap-2">
                      {nodes.filter(n => n.parentId === activeDisplayNode.id || activeDisplayNode.parentId === n.id).slice(0, 8).map(rel => (
                         <div key={rel.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                            <div className="flex flex-col">
                               <span className="text-[8px] font-bold text-slate-500 uppercase">{rel.type}</span>
                               <span className="text-[11px] font-bold text-white italic">{rel.title}</span>
                            </div>
                            <span className="text-[8px] font-black text-brand-cyan uppercase border border-brand-cyan/30 px-2 py-1 rounded">{rel.parentId === activeDisplayNode.id ? 'Child' : 'Parent'}</span>
                         </div>
                      ))}
                   </div>
                </div>

                <div className="mt-8 pt-6 border-t border-white/5 flex justify-between items-center text-slate-500">
                   <div className="text-[9px] font-bold uppercase tracking-widest italic">Double Click to Inspect Details</div>
                </div>
              </div>
            </motion.div>
          )}

          {(state.showMesh && hoveredLinkData && !isDraggingNode) && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="fixed backdrop-blur-3xl border border-white/10 p-6 rounded-3xl w-[448px] border-t-4 bg-black/85 shadow-3xl z-[2000000] flex flex-col border-t-brand-cyan"
              style={{ left: getTipPos(448, 300).x, top: getTipPos(448, 300).y }}
            >
              <div className="flex items-center gap-2 mb-4"><LinkIcon size={12} className="text-brand-cyan" /><span className="text-[10px] font-bold tracking-[0.1em] text-brand-cyan uppercase">Connection Details</span></div>
              
              <div className="flex flex-col gap-1">
                {/* From Entity */}
                <div className="px-4 py-3 rounded-xl border border-white/5 bg-white/[0.02] flex items-center justify-between" style={{ borderLeft: `3px solid ${ENTITY_TYPES[hoveredLinkData.fromType?.toUpperCase()]?.color || '#00f2ff'}` }}>
                   <div className="flex flex-col">
                      <span className="text-[8px] font-black uppercase tracking-tighter text-slate-500 mb-0.5">{hoveredLinkData.fromType}</span>
                      <span className="text-[13px] font-bold text-white/90 italic">{hoveredLinkData.from}</span>
                   </div>
                   <div className="text-[8px] font-black px-2 py-1 rounded-md italic uppercase tracking-widest leading-none border border-brand-cyan/20 text-brand-cyan">Start</div>
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
                   <div className="text-[8px] font-black px-2 py-1 rounded-md italic uppercase tracking-widest leading-none border border-slate-700 text-slate-400">End</div>
                </div>

                <div className="mt-4 pt-4 border-t border-white/5 flex justify-center">
                  <span className="text-[10px] font-bold text-brand-cyan/80 bg-brand-cyan/5 px-3 py-1.5 rounded-full italic tracking-tight">{hoveredLinkData.type}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Layout
        sessions={state.sessions}
        activeSessionId={state.sessionId}
        onLoadSession={actions.loadSession}
        onDeleteSession={actions.deleteSession}
        onClearHistory={actions.clearAllHistory}
        onNewChat={() => {
          actions.setSessionId(null);
          actions.setMessages([]);
        }}
        subjects={state.subjects}
        selectedSubjects={state.selectedSubjects}
        onSubjectsChange={actions.setSelectedSubjects}
        currentModel={state.currentModel}
        onModelChange={actions.updateModel}
        usage={state.usage}
        topics={state.topics}
        suggestions={state.suggestions}
        onTopicClick={actions.sendMessage}
        onRefreshSuggestions={actions.refreshSuggestions}
        syncStatus={state.syncStatus}
        onSync={actions.triggerSync}
        pdfViewer={state.pdfViewer}
        onOpenPdf={(id, p, f, t) => actions.setPdfViewer(id ? { driveFileId: id, pageNum: p, filename: f, highlightText: t } : null)}
        onClosePdf={() => actions.setPdfViewer(null)}
        settings={state.settings}
        authStatus={state.authStatus}
        onOpenCatalog={() => actions.setShowCatalog(true)}
        onRefineAll={actions.refineAllLibrary}
        onOpenAdmin={() => setIsAdminOpen(true)}
        sidebarWidth={state.sidebarWidth}
        isResizing={state.isResizing}
        onResizeStart={() => actions.setIsResizing(true)}
        topicsWidth={state.topicsWidth}
        isResizingTopics={state.isResizingTopics}
        onTopicsResizeStart={() => actions.setIsResizingTopics(true)}
        onLogin={actions.handleLogin}
        onLogout={actions.handleLogout}
        appMode={state.appMode}
        onModeChange={actions.setAppMode}
        pinnedItems={state.pinnedItems}
        onPin={actions.handlePin}
        chatTone={state.chatTone}
        onToneChange={actions.setChatTone}
        theme={state.theme}
        onThemeToggle={actions.toggleTheme}
        gems={state.gems}
        onActivateGem={actions.activateGem}
        isClearingHistory={state.isClearingHistory}
        showCitations={state.showCitations}
        onToggleCitations={actions.toggleCitations}
        deletingSessionIds={state.deletingSessionIds}
        onClearPins={actions.clearAllPins}
        onOpenMesh={() => actions.setShowMesh(!state.showMesh)}
        showMesh={state.showMesh}
      >
        {state.showMesh ? (
          <section 
            ref={containerRef} 
            className={`flex-1 relative overflow-hidden rounded-3xl border border-white/5 shadow-2xl transition-all duration-700 ${layoutRules.projectionMode === '2d' ? 'bg-black' : 'bg-black/20'} ${isAdminOpen || isEditorOpen ? 'pointer-events-none grayscale-[0.4] opacity-80' : 'pointer-events-auto'}`}
            onMouseDown={handleMouseDown} 
            onContextMenu={(e) => e.preventDefault()} 
            onWheel={layoutRules.projectionMode === 'spatial_3d' ? undefined : handleWheel}
            style={{ height: '100%' }}
          >
            <AnimatePresence>
              {isAppearanceOpen && (
                <motion.div 
                  initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  className="absolute top-8 left-8 z-[100] flex flex-col gap-3 pointer-events-auto" 
                  onMouseDown={e => e.stopPropagation()}
                >
                   <div className="flex flex-col gap-1.5 p-3 bg-black/60 backdrop-blur-xl rounded-[16px] border border-white/10 shadow-3xl w-64 relative">
                      <button 
                        onClick={() => setIsAppearanceOpen(false)}
                        className="absolute top-3 right-3 p-1 hover:bg-white/5 rounded-full transition-colors text-slate-500 hover:text-white"
                      >
                        <ArrowDown size={14} className="rotate-45" />
                      </button>
                      <span className="text-[9px] font-black tracking-tighter text-slate-400 uppercase mb-3 text-center">Mesh Appearance</span>
                      <div className="flex flex-col gap-4 px-1 mb-4">
                         <div className="flex flex-col gap-1.5"><div className="flex justify-between items-center text-[9px] font-bold text-brand-cyan/80"><span>CHILD GAP</span><span className="text-white font-mono">{layoutRules.childGap}px</span></div><input type="range" min="0" max="150" value={layoutRules.childGap} onChange={(e) => { const u = { ...layoutRules, childGap: parseInt(e.target.value) }; setLayoutRules(u); applyLayout(u); }} className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-cyan" /></div>
                         <div className="flex flex-col gap-1.5"><div className="flex justify-between items-center text-[9px] font-bold text-brand-cyan/80"><span>PARENT DISTANCE</span><span className="text-white font-mono">{layoutRules.parentDistance}px</span></div><input type="range" min="100" max="1000" value={layoutRules.parentDistance} onChange={(e) => { const u = { ...layoutRules, parentDistance: parseInt(e.target.value) }; setLayoutRules(u); applyLayout(u); }} className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-cyan" /></div>
                         <div className="flex flex-col gap-1.5"><div className="flex justify-between items-center text-[9px] font-bold text-brand-cyan/80"><span>TENSION</span><span className="text-white font-mono">{layoutRules.connectionTension}%</span></div><input type="range" min="10" max="100" value={layoutRules.connectionTension} onChange={(e) => { const u = { ...layoutRules, connectionTension: parseInt(e.target.value) }; setLayoutRules(u); applyLayout(u); }} className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-cyan" /></div>
                      </div>
                      <div className="flex gap-1 justify-center border-t border-white/5 pt-3 mt-1">
                          <button 
                            onClick={() => setLayoutRules({ ...layoutRules, showLabels: !layoutRules.showLabels })} 
                            className={`w-8 h-8 flex items-center justify-center rounded-[8px] transition-all ${layoutRules.showLabels ? 'bg-brand-cyan/20 border border-brand-cyan/20' : 'hover:bg-white/5'}`}
                            title="Toggle Labels"
                          >
                            <Type size={14} className={layoutRules.showLabels ? 'text-brand-cyan' : 'text-slate-500'} />
                          </button>
                          <button 
                            onClick={() => setLayoutRules({ ...layoutRules, labelStyle: layoutRules.labelStyle === 'pill' ? 'standard' : 'pill' })} 
                            className={`w-8 h-8 flex items-center justify-center rounded-[8px] transition-all ${layoutRules.labelStyle === 'pill' ? 'bg-brand-pink/20 border border-brand-pink/20' : 'hover:bg-white/5'}`}
                            title="Style Labels"
                          >
                            <Sparkles size={14} className={layoutRules.labelStyle === 'pill' ? 'text-brand-pink' : 'text-slate-500'} />
                          </button>
                          <div className="w-px h-4 bg-white/10 mx-1 self-center" />
                         {[ { id: 'radial', icon: Network }, { id: 'horizontal_lr', icon: GitMerge } ].map(opt => {
                            const isActive = layoutRules.layoutStyle === opt.id;
                            return (
                              <button key={opt.id} onClick={() => { const isR = opt.id === 'radial'; const r = { ...layoutRules, layoutStyle: opt.id, childGap: isR ? 10 : layoutRules.childGap, parentDistance: isR ? 200 : layoutRules.parentDistance }; setLayoutRules(r); applyLayout(r); }} className={`w-8 h-8 flex items-center justify-center rounded-[8px] transition-all ${isActive ? 'bg-brand-cyan/20 border border-brand-cyan/20' : 'hover:bg-white/5'}`}><opt.icon size={14} className={isActive ? 'text-brand-cyan' : 'text-slate-500'} /></button>
                            );
                         })}
                         <div className="w-px h-4 bg-white/10 mx-1 self-center" />
                         {[ { id: '2d', icon: Layers }, { id: 'spatial_3d', icon: Box }, { id: 'instanced_3d', icon: Sparkles } ].map(opt => {
                            const isActive = layoutRules.projectionMode === opt.id;
                            const isInstanced = opt.id === 'instanced_3d';
                            return (
                              <button key={opt.id} onClick={() => { setLayoutRules({ ...layoutRules, projectionMode: opt.id }); }} className={`w-8 h-8 flex items-center justify-center rounded-[8px] transition-all ${isActive ? (isInstanced ? 'bg-brand-cyan/20 border border-brand-cyan/20' : 'bg-brand-purple/20 border border-brand-purple/20') : 'hover:bg-white/5'}`} title={isInstanced ? "Three.js Instanced Engine" : opt.id}><opt.icon size={14} className={isActive ? (isInstanced ? 'text-brand-cyan' : 'text-brand-purple') : 'text-slate-500'} /></button>
                            );
                         })}
                      </div>
                   </div>
                </motion.div>
              )}
            </AnimatePresence>
            {layoutRules.projectionMode === 'spatial_3d' ? (
              <SpatialCanvas 
                nodes={filteredNodes}
                onSelectNode={(n) => { setSelectedNode(n); }}
                onOpenDrawer={(n) => { 
                    setSelectedNode(n); 
                    setIsEditorOpen(true); 
                    setIsAdminOpen(false);
                    setEditingNode(n); 
                    setCurrentType(n.type); 
                    setFormData({ title: n.title, content: n.content || {} }); 
                }}
                hoveredNodeId={hoveredNodeId}
                setHoveredNodeId={handleHoverNode}
                selectedNode={selectedNode}
                showLabels={layoutRules.showLabels}
                labelStyle={layoutRules.labelStyle}
                hoveredLinkData={hoveredLinkData}
                setHoveredLinkData={setHoveredLinkData}
              />
            ) : layoutRules.projectionMode === 'instanced_3d' ? (
              <InstancedSpatialCanvas 
                nodes={filteredNodes}
                onSelectNode={(n) => { 
                    setSelectedNode(n); 
                    setIsEditorOpen(true); 
                    setIsAdminOpen(false);
                    setEditingNode(n); 
                    setCurrentType(n.type); 
                    setFormData({ title: n.title, content: n.content || {} }); 
                }}
                hoveredNodeId={hoveredNodeId}
                setHoveredNodeId={handleHoverNode}
                selectedNode={selectedNode}
                onOpenDrawer={(n) => { 
                    setSelectedNode(n); 
                    setIsEditorOpen(true); 
                    setIsAdminOpen(false);
                    setEditingNode(n); 
                    setCurrentType(n.type); 
                    setFormData({ title: n.title, content: n.content || {} }); 
                }}
              />
            ) : (
              <MeshCanvas 
                meshRef={meshRef}
                nodes={filteredNodes} view={view} layoutRules={layoutRules} hoveredNodeId={hoveredNodeId} setHoveredNodeId={handleHoverNode}
                hoveredLinkId={hoveredLinkId} setHoveredLinkId={setHoveredLinkId} setHoveredLinkData={setHoveredLinkData} 
                isMovingMesh={!!dragType} isSidebarOpen={isAdminOpen || isEditorOpen}
                movingNodeId={movingNodeId}
                onSelectNode={(n) => { 
                    if (movingNodeId) {
                        if (n.id === movingNodeId) { setMovingNodeId(null); return; }
                        const updatedNodes = nodes.map(node => node.id === movingNodeId ? { ...node, parentId: n.id } : node);
                        setNodes(updatedNodes);
                        setMovingNodeId(null);
                        applyLayout(layoutRules, updatedNodes);
                        return;
                    }
                    setSelectedNode(n); setIsEditorOpen(true); setEditingNode(n); setCurrentType(n.type); setFormData({ title: n.title, content: n.content || {} }); 
                }} 
                onAddOffshoot={(id) => { setActiveParentId(id); setIsEditorOpen(true); setEditingNode(null); setCurrentType('CONCEPT'); setFormData({ title: '[NEW_ENTITY_SPEC]', content: {} }); }} 
                onNodeDrag={(id, dx, dy) => setNodes(prev => prev.map(n => n.id === id ? { ...n, x: n.x + dx, y: n.y + dy } : n))}
                onNodeDragEnd={(id) => setNodes(prev => prev.map(n => n.id === id ? { ...n, ox: n.x, oy: n.y } : n))}
                onStartReparent={(id) => setMovingNodeId(id)}
                onLinkClick={(cid, pid) => { 
                    setHoveredLinkId(null); 
                    const targetId = (selectedNode?.id === cid) ? pid : cid;
                    centerOnNode(nodes.find(n => n.id === targetId)); 
                }}
                projectionMode={layoutRules.projectionMode}
              />
            )}
            <OrbitalNav 
              nodes={filteredNodes} 
              view={view} 
              stickPos={stickPos} 
              setStickPos={setStickPos} 
              onOpenAdmin={() => setIsAdminOpen(true)} 
              onOpenAppearance={() => setIsAppearanceOpen(!isAppearanceOpen)} 
              onMinimapJump={centerOnPoint}
              showMinimap={true}
              projectionMode={layoutRules.projectionMode} 
            />
          </section>
        ) : (
          <div style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <ChatInterface
              messages={state.messages}
              isTyping={state.isTyping}
              onSendMessage={actions.sendMessage}
              onOpenPdf={(id, p, f, t) => actions.setPdfViewer(id ? { driveFileId: id, pageNum: p, filename: f, highlightText: t } : null)}
              suggestions={state.suggestions}
              onTopicClick={actions.sendMessage}
              appMode={state.appMode}
              onToggleCanvas={(c) => { 
                if (c) actions.setCanvasContent(c); 
                actions.setIsCanvasVisible(prev => !prev); 
              }}
              onOpenCanvas={(c) => {
                if (c) actions.setCanvasContent(c);
                actions.setIsCanvasVisible(true);
              }}
              onPin={actions.handlePin}
              pinnedItems={state.pinnedItems}
              voiceEngine={actions.voiceEngine}
              showCitations={state.showCitations}
            />
          </div>
        )}
      </Layout>

      <AnimatePresence>
         {(isEditorOpen || isAdminOpen) && (
           <motion.div 
             initial={{ opacity: 0 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }}
             className="fixed inset-0 z-[65000] bg-transparent cursor-default select-none pointer-events-auto"
             onMouseDown={e => {
                const isR = e.clientX > window.innerWidth - (window.innerWidth * 0.66);
                if (isR) e.stopPropagation();
                else {
                   setIsEditorOpen(false);
                   setIsAdminOpen(false);
                 }
             }}
             onPointerDown={e => {
                const isR = e.clientX > window.innerWidth - (window.innerWidth * 0.66);
                if (isR) e.stopPropagation();
             }}
           />
         )}
         {isEditorOpen && (
           <IntelligenceDrawer 
             key={editingNode?.id || 'new'}
             isOpen={isEditorOpen} 
             onClose={() => setIsEditorOpen(false)} 
             nodes={nodes} 
             editingNode={editingNode} 
             currentType={currentType} 
             setCurrentType={setCurrentType} 
             formData={formData} 
             setFormData={setFormData} 
             onSave={(u) => { 
                if (editingNode) setNodes(prev => prev.map(n => n.id === editingNode.id ? { ...n, ...u, title: formData.title, type: currentType } : n)); 
                else { 
                   const id = `node_${Date.now()}`; 
                   const p = nodes.find(n => n.id === activeParentId); 
                   const nn = { id, parentId: activeParentId, x: p ? p.x + 300 : 1000, y: p ? p.y + 100 : 500, title: formData.title, type: currentType, content: formData.content, ox: p ? p.x + 300 : 1000, oy: p ? p.y + 100 : 500 }; 
                   setNodes(prev => [...prev, nn]); 
                } 
                setIsEditorOpen(false); 
             }} 
             onToggleConnection={(tid) => { 
                if (!editingNode) return; 
                setNodes(prev => prev.map(n => (n.id === editingNode.id) ? { ...n, secondaryLinks: (n.secondaryLinks || []).includes(tid) ? n.secondaryLinks.filter(l => l !== tid) : [...(n.secondaryLinks || []), tid] } : n)); 
             }} 
             onDeleteNode={(nid) => { 
                setDeletedNodes(prev => [...prev, nodes.find(n => n.id === nid)]); 
                setNodes(prev => prev.filter(n => n.id !== nid)); 
                setIsEditorOpen(false); 
             }} 
           />
         )}
         {isAdminOpen && (
           <AdminPanel 
             nodes={nodes} 
             deletedNodes={deletedNodes} 
             isOpen={isAdminOpen} 
             onClose={() => setIsAdminOpen(false)} 
             onFocusNode={(n) => { 
                centerOnNode(n); 
                setEditingNode(n); 
                setCurrentType(n.type); 
                setFormData({ title: n.title, content: n.content || {} });
                // We keep Admin Panel open now as per user request
                setIsEditorOpen(true); 
             }} 
             onRestoreNode={(nid) => { 
                const r = deletedNodes.find(n => n.id === nid); 
                if (r) { 
                   setNodes(prev => [...prev, r]); 
                   setDeletedNodes(prev => prev.filter(n => n.id !== nid)); 
                } 
             }} 
             onReset={resetLayout} 
             onBackup={handleBackup} 
             layoutRules={layoutRules} 
             setLayoutRules={setLayoutRules} 
             applyLayout={applyLayout} 
             onApplyAIProposal={handleApplyAIProposal}
           />
         )}
      </AnimatePresence>
    </>
  );
}
