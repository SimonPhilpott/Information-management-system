import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
import { SunburstCanvas } from './components/KnowledgeMesh/SunburstCanvas';
import { AnimatePresence, motion, animate } from 'framer-motion';
import { Activity, Link as LinkIcon, Cpu, ArrowDown, Network, GitMerge, Box, Layers, Type, Globe, Aperture, Maximize2, Minimize2 } from 'lucide-react';

import { useAppLogic } from './hooks/useAppLogic';
import OnboardingSetup from './components/Dashboard/OnboardingSetup';
import { checkIsEntertainment } from './utils/contentFilter';

const getShortSummary = (text) => {
  if (!text) return '';
  // Strip HTML tags, replacing them with a space to prevent words from sticking together
  let cleanText = text.replace(/<[^>]*>/g, ' ');
  // Decode common HTML entities
  cleanText = cleanText
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  // Strip synced metadata header
  cleanText = cleanText.replace(/^\[SYNCED INTEL FROM [^\]]+\]\s*/i, '');
  // Normalize whitespaces
  cleanText = cleanText.replace(/\s+/g, ' ').trim();
  
  const sentences = cleanText.match(/[^.!?]+[.!?]+(\s|$)/g);
  if (!sentences || sentences.length <= 2) return cleanText;
  return sentences.slice(0, 2).join('').trim();
};

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

  const [typesVersion, setTypesVersion] = useState(0);
  const handleAddEntityType = (newTypeKey, newTypeConfig, newSchemaFields) => {
    try {
      const savedTypes = localStorage.getItem('hive_graph_custom_entity_types');
      const customTypes = savedTypes ? JSON.parse(savedTypes) : {};
      customTypes[newTypeKey] = newTypeConfig;
      localStorage.setItem('hive_graph_custom_entity_types', JSON.stringify(customTypes));

      const savedSchemas = localStorage.getItem('hive_graph_custom_schemas');
      const customSchemas = savedSchemas ? JSON.parse(savedSchemas) : {};
      customSchemas[newTypeKey] = newSchemaFields;
      localStorage.setItem('hive_graph_custom_schemas', JSON.stringify(customSchemas));

      ENTITY_TYPES[newTypeKey] = {
        ...newTypeConfig,
        icon: Database
      };
      SCHEMAS[newTypeKey] = newSchemaFields;

      setTypesVersion(prev => prev + 1);
    } catch (e) {
      console.error('Failed to add custom type:', e);
    }
  };

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
    const savedNodes = saved ? JSON.parse(saved) : [];
    
    const uniqueMap = new Map();
    // 1. Seed with authoritative node set from file
    MESH_JSON_AUTHORITY.forEach(n => { if (n && n.id) uniqueMap.set(n.id, { ...n, visible: n.visible !== false }); });
    // 2. Overwrite/merge with user saved state (preserving user visibility updates)
    savedNodes.forEach(n => {
      if (n && n.id) {
        const existing = uniqueMap.get(n.id);
        if (existing) {
          uniqueMap.set(n.id, { 
            ...n, 
            parentId: existing.parentId, 
            secondaryLinks: existing.secondaryLinks,
            title: existing.title,
            type: existing.type
          });
        } else {
          uniqueMap.set(n.id, n);
        }
      }
    });
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
    return nodes.filter(n => !isEntertainment(n) && n.visible !== false);
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
         childGap: data.childGap ?? 60,
         parentDistance: data.parentDistance ?? 700,
         connectionTension: data.connectionTension ?? 60,
         layoutStyle: data.layoutStyle ?? 'radial',
         projectionMode: data.projectionMode === 'instanced_3d' ? 'spatial_3d' : (data.projectionMode ?? '2d'),
         directionalLocking: data.directionalLocking ?? true,
         unifiedSyncPoints: data.unifiedSyncPoints ?? true,
         showLabels: data.showLabels ?? true,
         labelStyle: data.labelStyle ?? 'standard',
         betaLayout: true
      };
    } catch {
      return { 
         childGap: 60, parentDistance: 700, connectionTension: 60,
         layoutStyle: 'radial', projectionMode: 'spatial_3d', directionalLocking: true, unifiedSyncPoints: true,
         showLabels: true, labelStyle: 'standard', betaLayout: true
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
    return saved ? JSON.parse(saved) : { x: -50, y: -331, scale: 0.36 };
  });
  const [zoom3D, setZoom3D] = useState(0);
  const [coords3D, setCoords3D] = useState({ x: 0, y: 0, z: 0 });
  const viewRef = useRef(view);
  
  useEffect(() => {
    localStorage.setItem('hive_mesh_viewport_v1', JSON.stringify(view));
  }, [view]);

  const meshRef = useRef(null);
  const [dragType, setDragType] = useState(null);
  const [is3DInteracting, setIs3DInteracting] = useState(false);
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

  const handleHoverNode = useCallback((id) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    
    // INTERACTION LOCK: Block hover extraction if dragging/interacting is in progress
    if ((!!dragType || isDraggingNode || is3DInteracting) && id) {
       setHoveredNodeId(null);
       return;
     }

    if (id) setHoveredNodeId(id);
    else {
      hoverTimeout.current = setTimeout(() => {
        setHoveredNodeId(null);
      }, 80);
    }
  }, [dragType, isDraggingNode, is3DInteracting]);

  const handleSelectNode = useCallback((n) => {
    setSelectedNode(n);
  }, []);

  const handleOpenDrawer = useCallback((n) => {
    setSelectedNode(n); 
    setIsEditorOpen(true); 
    setIsAdminOpen(false);
    setEditingNode(n); 
    setCurrentType(n.type); 
    setFormData({ title: n.title, content: n.content || {}, tier: n.tier || 3 }); 
  }, []);

  const [hoveredLinkId, setHoveredLinkId] = useState(null);
  const [hoveredLinkData, setHoveredLinkData] = useState(null);

  useEffect(() => {
    if (dragType || is3DInteracting) {
      setHoveredNodeId(null);
      setHoveredLinkId(null);
      setHoveredLinkData(null);
    }
  }, [dragType, is3DInteracting]);

  const [movingNodeId, setMovingNodeId] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  const [editingNode, setEditingNode] = useState(null);
  const [activeParentId, setActiveParentId] = useState(null);
  const [currentType, setCurrentType] = useState('CONCEPT');
  const [formData, setFormData] = useState({ title: '', content: {}, tier: 3 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef(null);
  const requestRef = useRef();
  const stickRef = useRef({ x: 0, y: 0, active: false });
  const velocityRef = useRef({ x: 0, y: 0 });

  /** Toggles the graph container between fullscreen and windowed mode. */
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const pressedKeys = useRef(new Set());

  useEffect(() => {
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

    window.addEventListener('keydown', handleGlobalKey);
    window.addEventListener('keyup', handleGlobalKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleGlobalKey);
      window.removeEventListener('keyup', handleGlobalKeyUp);
    };
  }, []);

  useEffect(() => {
    if (!hoveredNodeId && !hoveredLinkData) return;

    const handleTooltipMove = (e) => {
      const el = document.getElementById('mesh-tooltip');
      if (el) {
        const tw = 360;
        const th = el.offsetHeight || 300;
        let nx = e.clientX + 35;
        let ny = e.clientY + 10;
        if (nx + tw > window.innerWidth - 30) nx = e.clientX - tw - 35;
        const overflowBottom = ny + th > window.innerHeight - 30;
        const isBottomHalf = e.clientY > window.innerHeight * 0.55;
        if (isBottomHalf || overflowBottom) ny = e.clientY - th - 10;
        el.style.left = `${Math.max(15, nx)}px`;
        el.style.top = `${Math.max(15, ny)}px`;
      }
    };

    window.addEventListener('mousemove', handleTooltipMove);
    return () => {
      window.removeEventListener('mousemove', handleTooltipMove);
    };
  }, [hoveredNodeId, hoveredLinkData]);

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

  const handleReviewSync = (node, decomposedContent) => {
    setSelectedNode(node);
    setEditingNode(node);
    setCurrentType(node.type);
    setFormData({
      title: node.title,
      content: decomposedContent,
      tier: node.tier || 3
    });
    setIsEditorOpen(true);
    setIsAdminOpen(false);
  };

  useEffect(() => {
    // STATE INTEGRITY CHECK: Purge any accidental NaN values and clear Real Estate content for testing
    setNodes(prev => prev.map(n => {
      if (n.id === 'seg_re') {
        return {
          ...n,
          content: {},
          x: isNaN(n.x) ? 2000 : n.x,
          y: isNaN(n.y) ? 2000 : n.y,
          ox: isNaN(n.ox) ? 2000 : n.ox,
          oy: isNaN(n.oy) ? 2000 : n.oy
        };
      }
      return {
        ...n,
        x: isNaN(n.x) ? 2000 : n.x,
        y: isNaN(n.y) ? 2000 : n.y,
        ox: isNaN(n.ox) ? 2000 : n.ox,
        oy: isNaN(n.oy) ? 2000 : n.oy
      };
    }));

    // MANDATORY INITIAL LAYOUT: Ensure authoritative spacing on cold boot
    applyLayout(layoutRules);

    // REMOVED AUTO-CENTERING ON MOUNT TO PRESERVE DEFAULT/SAVED VIEWPORT STATE
    /*
    const rootNode = nodes.find(n => n.id === 'tt_group') || nodes[0];
    if (rootNode) {
       setTimeout(() => centerOnNode(rootNode), 100);
    }
    */
  }, []);

  // REMOVED AUTO-CENTERING ON PROJECTION MODE CHANGE TO PRESERVE DEFAULT/SAVED VIEWPORT STATE
  /*
  useEffect(() => {
    if (layoutRules.projectionMode === '2d') {
      const rootNode = nodes.find(n => n.id === 'tt_group') || nodes[0];
      if (rootNode) {
        setTimeout(() => centerOnNode(rootNode), 100);
      }
    }
  }, [layoutRules.projectionMode]);
  */

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
    // SunburstCanvas registers its own passive:false wheel handler on its container.
    if (layoutRules.projectionMode === 'spatial_3d' || layoutRules.projectionMode === 'sunburst') return;
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

    // SunburstCanvas manages its own right-click pan and wheel zoom independently.
    if (layoutRules.projectionMode === 'sunburst') return;

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

  const nodeTipPos = { x: -9999, y: -9999 };
  const linkTipPos = { x: -9999, y: -9999 };

  return (
    <>
      <div className="fixed inset-0 pointer-events-none z-[1000000]">
        <AnimatePresence mode="wait">
          {(state.showGraph && hoveredNodeId && !isDraggingNode && !dragType && !is3DInteracting && activeDisplayNode) && (
            <motion.div 
              id="mesh-tooltip"
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              className={`fixed glass-panel border rounded-[16px] p-5 flex flex-col shadow-lg z-[2000] pointer-events-none ${
                state.theme === 'light' ? 'border-[#2E2B27]/15' : 'border-white/10'
              }`}
              style={{ 
                left: nodeTipPos.x, 
                top: nodeTipPos.y,
                width: '360px',
                backgroundColor: state.theme === 'light' ? 'rgba(244, 239, 229, 0.98)' : 'rgba(10, 15, 25, 0.98)' 
              }}
            >
              <div className="flex items-center gap-1.5 mb-3">
                <Activity size={10} className={state.theme === 'light' ? 'text-[#0891B2]' : 'text-brand-cyan'} />
                <span className={`text-[9px] font-bold tracking-[0.1em] uppercase transition-colors duration-300 ${state.theme === 'light' ? 'text-[#0891B2]' : 'text-brand-cyan'}`}>Information Summary</span>
              </div>
              
              <div className="flex flex-col mb-3" style={{ borderLeft: `3px solid ${ENTITY_TYPES[activeDisplayNode.type?.toUpperCase()]?.color || '#00f2ff'}`, paddingLeft: '12px' }}>
                 <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500 mb-0.5">{activeDisplayNode.type}</span>
                 <h4 className={`font-bold text-xl italic tracking-tight leading-snug transition-colors duration-300 ${state.theme === 'light' ? 'text-[#2E2B27]' : 'text-white'}`}>{activeDisplayNode.title}</h4>
              </div>
 
              <p className={`text-[12px] leading-relaxed italic mb-4 border-b pb-4 transition-colors duration-300 ${state.theme === 'light' ? 'text-[#4A443F] border-[#2E2B27]/10' : 'text-slate-300 border-white/5'}`}>
                {getShortSummary(activeDisplayNode.content?.Summary || activeDisplayNode.content?.['Definition Summary']) || 'Analytical breakdown in progress...'}
              </p>
 
              <div className="flex flex-col gap-3">
                 <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Connected Nodes</span>
                 <div className="flex flex-col gap-1.5">
                    {nodes.filter(n => n.parentId === activeDisplayNode.id || activeDisplayNode.parentId === n.id).slice(0, 5).map(rel => (
                       <div key={rel.id} className={`flex items-center justify-between p-2.5 rounded-lg border transition-all duration-300 ${state.theme === 'light' ? 'bg-black/[0.03] border-[#2E2B27]/10' : 'bg-white/5 border border-white/5'}`}>
                          <div className="flex flex-col">
                             <span className="text-[7px] font-bold text-slate-500 uppercase">{rel.type}</span>
                             <span className={`text-[10px] font-bold italic transition-colors duration-300 ${state.theme === 'light' ? 'text-[#2E2B27]' : 'text-white'}`}>{rel.title}</span>
                          </div>
                          <span className={`text-[7px] font-black uppercase border px-1.5 py-0.5 rounded transition-all duration-300 ${state.theme === 'light' ? 'text-[#0891B2] border-[#0891B2]/30 bg-[#0891B2]/5' : 'text-brand-cyan border-brand-cyan/30'}`}>{rel.parentId === activeDisplayNode.id ? 'Child' : 'Parent'}</span>
                       </div>
                    ))}
                 </div>
              </div>
 
              <div className={`mt-4 pt-3 border-t flex justify-between items-center text-slate-500 transition-colors duration-300 ${state.theme === 'light' ? 'border-[#2E2B27]/10' : 'border-white/5'}`}>
                 <div className="text-[8px] font-bold uppercase tracking-widest italic">Double Click to Inspect Details</div>
              </div>
            </motion.div>
          )}
 
          {(state.showGraph && hoveredLinkData && !isDraggingNode && !dragType && !is3DInteracting) && (
            <motion.div 
              id="mesh-tooltip"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className={`fixed glass-panel p-4 w-[360px] border rounded-[16px] shadow-lg z-[2000000] pointer-events-none flex flex-col ${
                state.theme === 'light' 
                  ? 'border-[#2E2B27]/15' 
                  : 'border-white/10'
              }`}
              style={{ 
                left: linkTipPos.x, 
                top: linkTipPos.y,
                backgroundColor: state.theme === 'light' ? 'rgba(244, 239, 229, 0.98)' : 'rgba(10, 15, 25, 0.98)'
              }}
            >
              <div className="flex items-center gap-1.5 mb-3">
                <LinkIcon size={10} className={state.theme === 'light' ? 'text-[#0891B2]' : 'text-brand-cyan'} />
                <span className={`text-[9px] font-bold tracking-[0.1em] uppercase transition-colors duration-300 ${state.theme === 'light' ? 'text-[#0891B2]' : 'text-brand-cyan'}`}>Connection Details</span>
              </div>
              
              <div className="flex flex-col gap-0.5">
                {/* From Entity */}
                <div className={`px-3 py-2 rounded-lg border flex items-center justify-between transition-all duration-300 ${state.theme === 'light' ? 'border-[#2E2B27]/10 bg-black/[0.03]' : 'border-white/5 bg-white/[0.02]'}`} style={{ borderLeft: `3px solid ${ENTITY_TYPES[hoveredLinkData.fromType?.toUpperCase()]?.color || '#00f2ff'}` }}>
                   <div className="flex flex-col">
                      <span className="text-[7px] font-black uppercase tracking-tighter text-slate-500 mb-0.5">{hoveredLinkData.fromType}</span>
                      <span className={`text-[11px] font-bold italic transition-colors duration-300 ${state.theme === 'light' ? 'text-[#2E2B27]' : 'text-white/90'}`}>{hoveredLinkData.from}</span>
                   </div>
                   <div className={`text-[7px] font-black px-1.5 py-0.5 rounded-md italic uppercase tracking-widest leading-none border transition-all duration-300 ${state.theme === 'light' ? 'border-[#0891B2]/30 text-[#0891B2]' : 'border-brand-cyan/20 text-brand-cyan'}`}>Start</div>
                </div>

                {/* Flow Arrow */}
                <div className="py-0.5 flex justify-center">
                   <div className={`w-px h-2.5 bg-gradient-to-b ${state.theme === 'light' ? 'from-[#0891B2]' : 'from-brand-cyan'} to-transparent relative`}>
                      <ArrowDown size={8} className={`absolute -bottom-1 -left-[3.5px] opacity-40 transition-colors duration-300 ${state.theme === 'light' ? 'text-[#0891B2]' : 'text-brand-cyan'}`} />
                   </div>
                </div>

                {/* To Entity */}
                <div className={`px-3 py-2 rounded-lg border flex items-center justify-between transition-all duration-300 ${state.theme === 'light' ? 'border-[#2E2B27]/10 bg-black/[0.03]' : 'border-white/5 bg-white/[0.02]'}`} style={{ borderLeft: `3px solid ${ENTITY_TYPES[hoveredLinkData.toType?.toUpperCase()]?.color || '#00f2ff'}` }}>
                   <div className="flex flex-col">
                      <span className="text-[7px] font-black uppercase tracking-tighter text-slate-500 mb-0.5">{hoveredLinkData.toType}</span>
                      <span className={`text-[11px] font-bold italic transition-colors duration-300 ${state.theme === 'light' ? 'text-[#2E2B27]' : 'text-white/90'}`}>{hoveredLinkData.to}</span>
                   </div>
                   <div className={`text-[7px] font-black px-1.5 py-0.5 rounded-md italic uppercase tracking-widest leading-none border transition-all duration-300 ${state.theme === 'light' ? 'border-[#0891B2]/30 text-[#0891B2]' : 'border-brand-cyan/20 text-brand-cyan'}`}>End</div>
                </div>

                <div className={`mt-3 pt-3 border-t flex justify-center transition-colors duration-300 ${state.theme === 'light' ? 'border-[#2E2B27]/10' : 'border-white/5'}`}>
                   <span className={`text-[9px] font-bold px-2.5 py-1 rounded-full italic tracking-tight transition-all duration-300 ${state.theme === 'light' ? 'text-[#0891B2] bg-[#0891B2]/5' : 'text-brand-cyan/80 bg-brand-cyan/5'}`}>{hoveredLinkData.type}</span>
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
        onOpenGraph={() => actions.setShowGraph(!state.showGraph)}
        showGraph={state.showGraph}
      >
        {state.showGraph ? (
          <section 
            ref={containerRef} 
            className={`flex-1 relative overflow-hidden rounded-3xl border border-white/5 shadow-2xl transition-all duration-700 ${(isAdminOpen || isEditorOpen) && layoutRules.projectionMode !== 'sunburst' ? 'pointer-events-none grayscale-[0.4] opacity-80' : 'pointer-events-auto'}`}
            style={{ height: '100%', background: layoutRules.projectionMode === '2d' ? (state.theme === 'light' ? '#ece8dd' : '#000000') : (state.theme === 'light' ? 'rgba(236,232,221,0.4)' : 'rgba(0,0,0,0.2)') }}
            onMouseDown={handleMouseDown} 
            onContextMenu={(e) => e.preventDefault()} 
            onWheel={layoutRules.projectionMode === 'spatial_3d' ? undefined : handleWheel}
          >
            {/* Top Left Spatial Graph Controls Toolbar */}
            <div 
              className={`absolute top-8 left-8 z-[100] flex items-center gap-1.5 p-1 backdrop-blur-xl rounded-[12px] shadow-3xl pointer-events-auto transition-all duration-300 ${
                state.theme === 'light' 
                  ? 'bg-[#EDE5D8]/80 border border-[#2E2B27]/15' 
                  : 'bg-black/60 border border-white/10'
              }`}
              onMouseDown={e => e.stopPropagation()}
            >
              {/* Radial (2D) */}
              <button 
                onClick={() => {
                  setSelectedNode(null);
                  const r = { ...layoutRules, projectionMode: '2d', layoutStyle: 'radial', childGap: 10, parentDistance: 200 };
                  setLayoutRules(r);
                  applyLayout(r);
                  
                  // Force Zoom & Position reset
                  const nv = { x: -50, y: -331, scale: 0.36 };
                  viewRef.current = nv;
                  setView(nv);
                  if (meshRef.current) {
                    meshRef.current.style.transform = `translate3d(${nv.x}px, ${nv.y}px, 0) scale(${nv.scale})`;
                  }
                }}
                className={`w-8 h-8 flex items-center justify-center rounded-[8px] transition-all active:scale-[0.95] ${
                  (layoutRules.projectionMode === '2d' && layoutRules.layoutStyle === 'radial') 
                    ? (state.theme === 'light' 
                        ? 'bg-[#899981]/25 border border-[#899981]/40 text-[#4E5A47]' 
                        : 'bg-brand-cyan/20 border border-brand-cyan/20 text-brand-cyan') 
                    : (state.theme === 'light' 
                        ? 'text-[#6A645D] hover:bg-[#2E2B27]/5 hover:text-[#2E2B27]' 
                        : 'text-slate-500 hover:bg-white/5 hover:text-white')
                }`}
                title="radial"
              >
                <Network size={14} />
              </button>

              {/* Horizontal LR (2D) */}
              <button 
                onClick={() => {
                  setSelectedNode(null);
                  const r = { ...layoutRules, projectionMode: '2d', layoutStyle: 'horizontal_lr' };
                  setLayoutRules(r);
                  applyLayout(r);
                  
                  // Force Zoom & Position reset
                  const nv = { x: -258, y: -1242, scale: 0.36 };
                  viewRef.current = nv;
                  setView(nv);
                  if (meshRef.current) {
                    meshRef.current.style.transform = `translate3d(${nv.x}px, ${nv.y}px, 0) scale(${nv.scale})`;
                  }
                }}
                className={`w-8 h-8 flex items-center justify-center rounded-[8px] transition-all active:scale-[0.95] ${
                  (layoutRules.projectionMode === '2d' && layoutRules.layoutStyle === 'horizontal_lr') 
                    ? (state.theme === 'light' 
                        ? 'bg-[#899981]/25 border border-[#899981]/40 text-[#4E5A47]' 
                        : 'bg-brand-cyan/20 border border-brand-cyan/20 text-brand-cyan') 
                    : (state.theme === 'light' 
                        ? 'text-[#6A645D] hover:bg-[#2E2B27]/5 hover:text-[#2E2B27]' 
                        : 'text-slate-500 hover:bg-white/5 hover:text-white')
                }`}
                title="horizontal_lr"
              >
                <GitMerge size={14} />
              </button>

              <div className={`w-px h-4 mx-0.5 self-center transition-colors duration-300 ${
                state.theme === 'light' ? 'bg-[#2E2B27]/15' : 'bg-white/10'
              }`} />

              {/* Spatial 3D (3D) */}
              <button 
                onClick={() => {
                  setSelectedNode(null);
                  setLayoutRules({ ...layoutRules, projectionMode: 'spatial_3d', parentDistance: 700, childGap: 60 });
                }}
                className={`w-8 h-8 flex items-center justify-center rounded-[8px] transition-all active:scale-[0.95] ${
                  layoutRules.projectionMode === 'spatial_3d' 
                    ? (state.theme === 'light' 
                        ? 'bg-[#899981]/25 border border-[#899981]/40 text-[#4E5A47]' 
                        : 'bg-brand-cyan/20 border border-brand-cyan/20 text-brand-cyan') 
                    : (state.theme === 'light' 
                        ? 'text-[#6A645D] hover:bg-[#2E2B27]/5 hover:text-[#2E2B27]' 
                        : 'text-slate-500 hover:bg-white/5 hover:text-white')
                }`}
                title="spatial_3d"
              >
                <Box size={14} />
              </button>

              {/* Sunburst Projection (Sunburst) */}
              <button 
                onClick={() => {
                  setSelectedNode(null);
                  setLayoutRules({ ...layoutRules, projectionMode: 'sunburst' });
                  
                  // Force Zoom & Position reset for Sunburst View
                  const nv = { x: 0, y: 0, scale: 1.0 };
                  viewRef.current = nv;
                  setView(nv);
                  if (meshRef.current) {
                    meshRef.current.style.transform = `translate3d(${nv.x}px, ${nv.y}px, 0) scale(${nv.scale})`;
                  }
                }}
                className={`w-8 h-8 flex items-center justify-center rounded-[8px] transition-all active:scale-[0.95] ${
                  layoutRules.projectionMode === 'sunburst' 
                    ? (state.theme === 'light' 
                        ? 'bg-[#899981]/25 border border-[#899981]/40 text-[#4E5A47]' 
                        : 'bg-brand-cyan/20 border border-brand-cyan/20 text-brand-cyan') 
                    : (state.theme === 'light' 
                        ? 'text-[#6A645D] hover:bg-[#2E2B27]/5 hover:text-[#2E2B27]' 
                        : 'text-slate-500 hover:bg-white/5 hover:text-white')
                }`}
                title="Sunburst View"
              >
                {/* Aperture icon — camera-iris radial pattern mirrors the sunburst rings */}
                <Aperture size={14} />
              </button>

              <div className={`w-px h-4 mx-0.5 self-center transition-colors duration-300 ${
                state.theme === 'light' ? 'bg-[#2E2B27]/15' : 'bg-white/10'
              }`} />

              {/* Fullscreen Toggle */}
              <button 
                onClick={toggleFullscreen}
                className={`w-8 h-8 flex items-center justify-center rounded-[8px] transition-all active:scale-[0.95] ${
                  isFullscreen 
                    ? (state.theme === 'light' 
                        ? 'bg-[#899981]/25 border border-[#899981]/40 text-[#4E5A47]' 
                        : 'bg-brand-cyan/20 border border-brand-cyan/20 text-brand-cyan') 
                    : (state.theme === 'light' 
                        ? 'text-[#6A645D] hover:bg-[#2E2B27]/5 hover:text-[#2E2B27]' 
                        : 'text-slate-500 hover:bg-white/5 hover:text-white')
                }`}
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </div>

            <AnimatePresence>
              {isAppearanceOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-20 left-8 z-[100] flex flex-col gap-3 pointer-events-auto" 
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
                      <div className="flex flex-col gap-4 px-1 mb-1">
                         <div className="flex flex-col gap-1.5"><div className="flex justify-between items-center text-[9px] font-bold text-brand-cyan/80"><span>CHILD GAP</span><span className="text-white font-mono">{layoutRules.childGap}px</span></div><input type="range" min="0" max="150" value={layoutRules.childGap} onChange={(e) => { const u = { ...layoutRules, childGap: parseInt(e.target.value) }; setLayoutRules(u); applyLayout(u); }} className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-cyan" /></div>
                         <div className="flex flex-col gap-1.5"><div className="flex justify-between items-center text-[9px] font-bold text-brand-cyan/80"><span>PARENT DISTANCE</span><span className="text-white font-mono">{layoutRules.parentDistance}px</span></div><input type="range" min="100" max="1000" value={layoutRules.parentDistance} onChange={(e) => { const u = { ...layoutRules, parentDistance: parseInt(e.target.value) }; setLayoutRules(u); applyLayout(u); }} className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-cyan" /></div>
                         <div className="flex flex-col gap-1.5"><div className="flex justify-between items-center text-[9px] font-bold text-brand-cyan/80"><span>TENSION</span><span className="text-white font-mono">{layoutRules.connectionTension}%</span></div><input type="range" min="10" max="100" value={layoutRules.connectionTension} onChange={(e) => { const u = { ...layoutRules, connectionTension: parseInt(e.target.value) }; setLayoutRules(u); applyLayout(u); }} className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-cyan" /></div>
                         
                           <div className="flex gap-1 justify-center border-t border-white/5 pt-3 mt-1">
                              <button 
                                onClick={() => setLayoutRules({ ...layoutRules, showLabels: !layoutRules.showLabels })} 
                                className={`px-3 py-1.5 text-[9px] font-black tracking-wider rounded-lg border transition-all flex items-center gap-1.5 w-full justify-center ${layoutRules.showLabels ? 'bg-brand-cyan/20 border-brand-cyan/30 text-brand-cyan' : 'border-white/10 text-slate-500 hover:bg-white/5 hover:text-white'}`}
                                title="Toggle Labels"
                              >
                                <Type size={12} />
                                <span>SHOW LABELS</span>
                              </button>
                          </div>
                      </div>
                   </div>
                </motion.div>
              )}
            </AnimatePresence>
            {layoutRules.projectionMode === 'sunburst' ? (
              <SunburstCanvas 
                meshRef={meshRef}
                view={view}
                nodes={filteredNodes}
                onSelectNode={(n) => { 
                    setSelectedNode(n); 
                    setIsEditorOpen(true); 
                    setIsAdminOpen(false);
                    setEditingNode(n); 
                    setCurrentType(n.type); 
                    setFormData({ title: n.title, content: n.content || {}, tier: n.tier || 3 }); 
                }}
                onAddOffshoot={(id) => {
                    setActiveParentId(id);
                    setIsEditorOpen(true);
                    setEditingNode(null);
                    setCurrentType('CONCEPT');
                    setFormData({ title: '[NEW_ENTITY_SPEC]', content: {}, tier: 3 });
                }}
                theme={state.theme}
                onThemeToggle={actions.toggleTheme}
              />
            ) : layoutRules.projectionMode === 'spatial_3d' ? (
              <SpatialCanvas 
                nodes={filteredNodes}
                onSelectNode={handleSelectNode}
                onOpenDrawer={handleOpenDrawer}
                hoveredNodeId={hoveredNodeId}
                setHoveredNodeId={handleHoverNode}
                selectedNode={selectedNode}
                showLabels={layoutRules.showLabels}
                labelStyle={layoutRules.labelStyle}
                hoveredLinkData={hoveredLinkData}
                setHoveredLinkData={setHoveredLinkData}
                onZoomChange={setZoom3D}
                onCoordsChange={setCoords3D}
                theme={state.theme}
                setIs3DInteracting={setIs3DInteracting}
                layoutRules={layoutRules}
              />
            ) : layoutRules.projectionMode === 'instanced_3d' ? (
              <InstancedSpatialCanvas 
                nodes={filteredNodes}
                onSelectNode={handleOpenDrawer}
                hoveredNodeId={hoveredNodeId}
                setHoveredNodeId={handleHoverNode}
                selectedNode={selectedNode}
                onOpenDrawer={handleOpenDrawer}
                onZoomChange={setZoom3D}
                onCoordsChange={setCoords3D}
                theme={state.theme}
                setIs3DInteracting={setIs3DInteracting}
                layoutRules={layoutRules}
              />
            ) : (
              <MeshCanvas 
                meshRef={meshRef}
                nodes={filteredNodes} view={view} layoutRules={layoutRules} hoveredNodeId={hoveredNodeId} setHoveredNodeId={handleHoverNode}
                hoveredLinkId={hoveredLinkId} setHoveredLinkId={setHoveredLinkId} setHoveredLinkData={setHoveredLinkData} 
                isMovingMesh={!!dragType} isSidebarOpen={isAdminOpen || isEditorOpen}
                movingNodeId={movingNodeId}
                selectedNode={selectedNode}
                onSelectNode={(n) => { 
                    if (movingNodeId) {
                        if (n.id === movingNodeId) { setMovingNodeId(null); return; }
                        const updatedNodes = nodes.map(node => node.id === movingNodeId ? { ...node, parentId: n.id } : node);
                        setNodes(updatedNodes);
                        setMovingNodeId(null);
                        applyLayout(layoutRules, updatedNodes);
                        return;
                    }
                    setSelectedNode(n); setIsEditorOpen(true); setEditingNode(n); setCurrentType(n.type); setFormData({ title: n.title, content: n.content || {}, tier: n.tier || 3 }); 
                }} 
                onAddOffshoot={(id) => { setActiveParentId(id); setIsEditorOpen(true); setEditingNode(null); setCurrentType('CONCEPT'); setFormData({ title: '[NEW_ENTITY_SPEC]', content: {}, tier: 3 }); }} 
                onNodeDrag={(id, dx, dy) => setNodes(prev => prev.map(n => n.id === id ? { ...n, x: n.x + dx, y: n.y + dy } : n))}
                onNodeDragEnd={(id) => setNodes(prev => prev.map(n => n.id === id ? { ...n, ox: n.x, oy: n.y } : n))}
                onStartReparent={(id) => setMovingNodeId(id)}
                onLinkClick={(cid, pid) => { 
                    setHoveredLinkId(null); 
                    const targetId = (selectedNode?.id === cid) ? pid : cid;
                    centerOnNode(nodes.find(n => n.id === targetId)); 
                }}
                projectionMode={layoutRules.projectionMode}
                theme={state.theme}
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
              theme={state.theme}
            />

            {/* Viewport Relative Zoom Indicator HUD — hidden in sunburst mode where it overlaps the interactivity guide */}
            {layoutRules.projectionMode !== 'sunburst' && (
            <div 
              className={`absolute bottom-6 right-6 z-[1000] px-4 py-2.5 rounded-xl flex flex-col gap-1.5 shadow-2xl pointer-events-none select-none font-mono text-[10px] tracking-wider uppercase transition-all duration-300 ${
                state.theme === 'light' 
                  ? 'border border-[#2E2B27]/15 text-[#0891B2]' 
                  : 'border border-brand-cyan/20 text-brand-cyan'
              }`}
              style={{
                background: state.theme === 'light' ? 'rgba(244, 239, 229, 0.85)' : 'rgba(10, 15, 25, 0.75)',
                backdropFilter: 'blur(12px)',
                boxShadow: state.theme === 'light' ? '0 8px 32px rgba(46, 43, 39, 0.15)' : '0 8px 32px rgba(0, 0, 0, 0.4)'
              }}
            >
              <div className="flex items-center justify-between gap-4">
                <span className="opacity-60">ZOOM:</span>
                <span className={`font-black ${state.theme === 'light' ? 'text-[#2E2B27]' : 'text-white'}`}>
                  {(() => {
                    const val = layoutRules.projectionMode === '2d' 
                      ? Math.round((view.scale - 0.8) * 100) 
                      : zoom3D;
                    return (val > 0 ? '+' : '') + val;
                  })()}
                </span>
              </div>
              <div className={`h-px my-0.5 ${state.theme === 'light' ? 'bg-[#2E2B27]/10' : 'bg-brand-cyan/10'}`} />
              <div className="flex items-center gap-3 text-[9px] opacity-80">
                {layoutRules.projectionMode === '2d' ? (
                  <>
                    <span>X: <span className={state.theme === 'light' ? 'text-[#2E2B27] font-bold' : 'text-white font-bold'}>{Math.round(view.x)}</span></span>
                    <span>Y: <span className={state.theme === 'light' ? 'text-[#2E2B27] font-bold' : 'text-white font-bold'}>{Math.round(view.y)}</span></span>
                  </>
                ) : (
                  <>
                    <span>X: <span className={state.theme === 'light' ? 'text-[#2E2B27] font-bold' : 'text-white font-bold'}>{Math.round(coords3D.x)}</span></span>
                    <span>Y: <span className={state.theme === 'light' ? 'text-[#2E2B27] font-bold' : 'text-white font-bold'}>{Math.round(coords3D.y)}</span></span>
                    <span>Z: <span className={state.theme === 'light' ? 'text-[#2E2B27] font-bold' : 'text-white font-bold'}>{Math.round(coords3D.z)}</span></span>
                  </>
                )}
              </div>
            </div>
            )} {/* end sunburst HUD conditional */}
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
             theme={state.theme}
             onClose={() => setIsEditorOpen(false)} 
             nodes={nodes} 
             editingNode={editingNode} 
             currentType={currentType} 
             setCurrentType={setCurrentType} 
             formData={formData} 
             setFormData={setFormData} 
             onSave={(u) => { 
                if (editingNode) {
                    const updatedNode = { ...editingNode, ...u, title: formData.title, type: currentType, tier: formData.tier || 3 };
                    setNodes(prev => prev.map(n => n.id === editingNode.id ? updatedNode : n)); 
                    setSelectedNode(updatedNode);
                 } else { 
                    const id = `node_${Date.now()}`; 
                    const p = nodes.find(n => n.id === activeParentId); 
                    const nn = { id, parentId: activeParentId, x: p ? p.x + 300 : 1000, y: p ? p.y + 100 : 500, title: formData.title, type: currentType, content: formData.content, tier: formData.tier || 3, ox: p ? p.x + 300 : 1000, oy: p ? p.y + 100 : 500 }; 
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
             onUpdateNodes={setNodes} 
             onAddEntityType={handleAddEntityType}
             deletedNodes={deletedNodes} 
             isOpen={isAdminOpen} 
             theme={state.theme}
             onClose={() => setIsAdminOpen(false)} 
             onFocusNode={(n) => { 
                centerOnNode(n); 
                setEditingNode(n); 
                setCurrentType(n.type); 
                setFormData({ title: n.title, content: n.content || {}, tier: n.tier || 3 });
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
             onReviewSync={handleReviewSync}
           />
         )}
      </AnimatePresence>
    </>
  );
}
