import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import { 
  X, Compass, Settings2, Layers, Search,
  Zap, AlertCircle, ZoomIn, ZoomOut, Maximize2, Activity, Database,
  Briefcase, Settings, Eye, EyeOff, Globe, ShieldCheck, Scale,
  Minimize2, Move, Sun, Moon, Palette, Menu, Box
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- STYLING CONSTANTS ---
const COLORS = {
  subject: '#899981',       // Sage
  book: '#6366F1',          // Indigo
  linkDiscovery: '#EF4444', // Red — AI Lateral Connections
  linkSemantic: '#F59E0B',  // Orange — Document Semantic Links
  linkHierarchy: '#3B82F6', // Blue — Subject Folder Structure
  linkCategory: '#22C55E',  // Green — Document-to-Subject Links
  linkThematic: '#94A3B8',  // Slate — Concept Cluster Links
  bg: '#F1EFE9',
  text: '#2C2C2C'
};

/**
 * Hardened & High-Performance MeshCanvas
 * Uses Canvas Sprites for labels to ensure stability and speed.
 */
export default function MeshCanvas({ onClose, chatTone = 'friendly' }) {
  const fgRef = useRef();
  const hasInteractedRef = useRef(false);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subjectDepth, setSubjectDepth] = useState(3); // 1 to 6 (default: 3)
  const [nodeSpacing, setNodeSpacing] = useState(300); // Default to Normal
  const [hoverNode, setHoverNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [shouldRenderGraph, setShouldRenderGraph] = useState(false);
  const [mountKey, setMountKey] = useState(0);
  const [graphTheme, setGraphTheme] = useState('light'); // 'light' or 'dark'
  const [showDocumentNodes, setShowDocumentNodes] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ stage: '', percent: 0, visible: false });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [galaxyMode, setGalaxyMode] = useState(false);

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (windowWidth <= 768) {
      setIsSidebarOpen(false);
    } else {
      setIsSidebarOpen(true);
    }
  }, [windowWidth]);
  
  const [visibleLinkTypes, setVisibleLinkTypes] = useState({
    hierarchy: true,
    category: true,
    discovery: false,
    semantic: false,
    thematic: false
  });
  
  const [professionalFocus, setProfessionalFocus] = useState(true);
  
  const [showStylePopout, setShowStylePopout] = useState(false);
  const [graphStyles, setGraphStyles] = useState({
    subjectColor: COLORS.subject,
    bookColor: COLORS.book,
    nodeScale: 2,
    labelScale: 1,
    labelColor: '#000000', // Pure Black for light mode
    labelFontSize: 112,
    linkWidth: 10,
    linkColor: COLORS.linkSemantic,
    particleSpeed: 0.002,
    particleWidth: 2,
    particleCount: 6,
    bgType: 'solid', // solid, radial, linear
    bgColor1: '#FFFFFF',
    bgColor2: '#F1EFE9'
  });
  
  const searchRef = useRef(null);
  
  // Responsive header state
  const [teleportedIds, setTeleportedIds] = useState([]);
  const topbarRef = useRef(null);
  const toolWidthsRef = useRef({
    logo: 220,
    sensitivity: 240,
    expansion: 200,
    close: 48
  });

  // Sync professionalFocus with chatTone
  useEffect(() => {
    setProfessionalFocus(chatTone === 'professional');
  }, [chatTone]);

  // Fetch Data (once on mount or when subjectSource changes)
  // Always fetch with folder source
  useEffect(() => {
    console.log('[MeshCanvas] Initiating data fetch');
    
    setSubjectDepth(3);

    let isMounted = true;
    setLoading(true);
    setShouldRenderGraph(false);
    setLoadingProgress({ stage: 'Loading graph data...', percent: 10, visible: true });

    fetch(`/api/graph/data?subjectSource=folder`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setLoadingProgress({ stage: 'Processing nodes...', percent: 40, visible: true });
        return res.json();
      })
      .then(data => {
        if (!isMounted) return;
        setGraphData(data);
        setLoading(false);
        const nodeCount = data.nodes.length;
        const isHigh = nodeCount > 500;
        setLoadingProgress({ stage: isHigh ? `Building ${nodeCount} nodes...` : 'Applying filters...', percent: 60, visible: true });
        
        setTimeout(() => {
          if (!isMounted) return;
          setLoadingProgress({ stage: isHigh ? 'Laying out connections...' : 'Finalizing...', percent: 80, visible: true });
        }, 200);
        
        setMountKey(prev => prev + 1);
        setTimeout(() => {
          if (!isMounted) return;
          setShouldRenderGraph(true);
          setLoadingProgress({ stage: '', percent: 100, visible: false });
        }, isHigh ? 600 : 400);
      })
      .catch(err => {
        console.error('[MeshCanvas] Fetch error:', err);
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { 
      isMounted = false; 
      // Explicitly clean up graph resources on unmount or source change
      if (fgRef.current) {
        try {
          const scene = fgRef.current.scene();
          scene.traverse(obj => {
            if (obj.userData?.texture) obj.userData.texture.dispose();
            if (obj.userData?.material) obj.userData.material.dispose();
            if (obj.userData?.meshMaterial) obj.userData.meshMaterial.dispose();
            if (obj.userData?.meshGeometry) obj.userData.meshGeometry.dispose();
          });
        } catch (e) {
          console.warn('[MeshCanvas] Cleanup error:', e);
        }
      }
    };
  }, []);

  // Intersection of active visibility toggles
  const filteredLinks = useMemo(() => {
    return graphData.links.filter(l => 
      visibleLinkTypes[l.type]
    );
  }, [graphData.links, visibleLinkTypes]);

  const allTopics = useMemo(() => {
    const topicSet = new Set();
    graphData.nodes.forEach(node => {
      if (node.type === 'book' && Array.isArray(node.topics)) {
        node.topics.forEach(t => topicSet.add(t.toLowerCase().trim()));
      }
      if (node.type === 'subject' && node.name) {
        topicSet.add(node.name.toLowerCase().trim());
      }
    });
    return Array.from(topicSet).sort();
  }, [graphData.nodes]);

  const subjectsForGalaxy = useMemo(() => {
    return Array.from(new Set(graphData.nodes.filter(n => n.type === 'subject').map(n => n.name)));
  }, [graphData.nodes]);

  const angleStep = useMemo(() => (2 * Math.PI) / (subjectsForGalaxy.length || 1), [subjectsForGalaxy]);

  const getGalaxyTarget = useCallback((node) => {
    let subj = node.type === 'subject' ? node.name : node.subject;
    let index = subjectsForGalaxy.indexOf(subj);
    if (index === -1) index = 0;
    const radius = 300 + subjectsForGalaxy.length * 120;
    return {
      x: Math.cos(index * angleStep) * radius,
      y: Math.sin(index * angleStep) * radius,
      z: (index % 2 === 0 ? 1 : -1) * (radius / 3)
    };
  }, [subjectsForGalaxy, angleStep]);

  const globalGravityForce = useCallback((alpha) => {
    graphData.nodes.forEach(node => {
      if (node.vx !== undefined) {
        node.vx += (-node.x) * 0.15 * alpha;
        node.vy += (-node.y) * 0.15 * alpha;
        node.vz += (-node.z) * 0.15 * alpha;
      }
    });
  }, [graphData.nodes]);

  const topicSuggestions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q || selectedTopic) return [];
    return allTopics.filter(t => t.includes(q)).slice(0, 12);
  }, [searchQuery, allTopics, selectedTopic]);

  const focusedNodeIds = useMemo(() => {
    if (!selectedTopic) return null;
    const q = selectedTopic.toLowerCase().trim();
    const ids = new Set();

    graphData.nodes.forEach(node => {
      if (node.type === 'book') {
        const inTopics = Array.isArray(node.topics) && node.topics.some(t => t.toLowerCase().trim() === q);
        const inSubject = node.subject && node.subject.toLowerCase().includes(q);
        const inName = node.name && node.name.toLowerCase().includes(q);
        if (inTopics || inSubject || inName) ids.add(node.id);
      }
      if (node.type === 'subject') {
        const inName = node.name && node.name.toLowerCase().includes(q);
        const inFull = node.fullName && node.fullName.toLowerCase().includes(q);
        if (inName || inFull) ids.add(node.id);
      }
    });

    graphData.links.forEach(link => {
      const srcId = link.source?.id ?? link.source;
      const tgtId = link.target?.id ?? link.target;
      if (ids.has(srcId)) ids.add(tgtId);
      if (ids.has(tgtId)) ids.add(srcId);
    });

    return ids;
  }, [selectedTopic, graphData.nodes, graphData.links]);

  const graphDataMemo = useMemo(() => {
    if (!graphData.nodes.length) return { nodes: [], links: [] };

    let visibleNodes = graphData.nodes.filter(n => {
      if (professionalFocus && n.isEntertainment) return false;
      if (!showDocumentNodes && n.type === 'book') return false;
      if (focusedNodeIds && !focusedNodeIds.has(n.id)) return false;

      // Subject Depth Level Filtering (TOC progressive disclosure & Folder filtering)
      if (n.type === 'toc_item') {
        // Always render top-level chapters (level 0) for context
        if (n.tocLevel === 0) return true;

        // For nested levels (level >= 1), only display them for the active/focused book
        const activeDocId = selectedNode?.documentId || (selectedNode?.type === 'book' ? selectedNode?.id : null);
        
        if (activeDocId && n.documentId === activeDocId) {
          if (n.tocLevel !== undefined && n.tocLevel > (subjectDepth - 1)) return false;
          return true;
        }
        return false;
      }
      
      if (n.type === 'subject') {
        if (n.level !== undefined && n.level > (subjectDepth - 1)) return false;
      }

      return true;
    });

    if (professionalFocus && showDocumentNodes) {
      const anchorBookIds = new Set(
        graphData.nodes
          .filter(n => n.type === 'book')
          .filter(n => !n.isEntertainment)
          .map(n => n.id)
      );

      const validSubjectIds = new Set();
      graphData.links.forEach(l => {
        const srcId = l.source?.id ?? l.source;
        const tgtId = l.target?.id ?? l.target;
        if (anchorBookIds.has(srcId)) validSubjectIds.add(tgtId);
        if (anchorBookIds.has(tgtId)) validSubjectIds.add(srcId);
      });

      visibleNodes = visibleNodes.filter(n => 
        n.type !== 'subject' && n.type !== 'toc_item' || validSubjectIds.has(n.id)
      );
    }

    const visibleIds = new Set(visibleNodes.map(n => n.id));
    const visibleLinks = filteredLinks.filter(link => {
      const srcId = link.source?.id ?? link.source;
      const tgtId = link.target?.id ?? link.target;
      return visibleIds.has(srcId) && visibleIds.has(tgtId);
    });

    return { nodes: visibleNodes, links: visibleLinks };
  }, [graphData, showDocumentNodes, professionalFocus, filteredLinks, focusedNodeIds, subjectDepth, selectedNode]);



  const clusterPullForce = useCallback((alpha) => {
    if (!graphDataMemo.nodes.length) return;
    const visibleRatio = graphDataMemo.nodes.length / Math.max(graphData.nodes.length, 1);
    const pullStrength = Math.max(0, 0.6 - (visibleRatio * 0.6));
    
    graphDataMemo.nodes.forEach(node => {
      if (node.vx !== undefined) {
        node.vx += (-node.x) * pullStrength * alpha;
        node.vy += (-node.y) * pullStrength * alpha;
        node.vz += (-node.z) * pullStrength * alpha;
      }
    });
  }, [graphDataMemo.nodes, graphData.nodes.length]);

  useEffect(() => {
    if (!focusedNodeIds || !fgRef.current || !shouldRenderGraph) return;
    const timer = setTimeout(() => {
      if (hasInteractedRef.current) return;
      try { fgRef.current.zoomToFit(1200, 250); } catch (_) {}
    }, 1200);
    return () => clearTimeout(timer);
  }, [focusedNodeIds, shouldRenderGraph]);

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (fgRef.current && shouldRenderGraph) {
      const fg = fgRef.current;
      
      // Only proceed if the d3 simulation is initialized
      if (typeof fg.d3Force !== 'function') return;
      
      const scene = fg.scene();
      if (scene) {
        scene.background = null;
        scene.children = scene.children.filter(c => !(c instanceof THREE.Light));
        const ambient = new THREE.AmbientLight(0xffffff, graphTheme === 'dark' ? 0.6 : 3.0);
        scene.add(ambient);
        const dir = new THREE.DirectionalLight(0xffffff, graphTheme === 'dark' ? 0.8 : 3.5);
        dir.position.set(100, 100, 100);
        scene.add(dir);
      }

      const controls = fg.controls();
      if (controls) {
        controls.enableRotate = true;
        controls.enableZoom = true;
        controls.enablePan = true;
        controls.touches = {
          ONE: THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN
        };
      }

      const charge = fg.d3Force('charge');
      const logCharge = Math.log(nodeSpacing + 10) * 8000;
      const chargeStrength = -5000 - logCharge;
      if (charge) charge.strength(chargeStrength);
      
      const link = fg.d3Force('link');
      if (link) {
        link.distance(l => {
          const base = 30 + (nodeSpacing * 0.3);
          return l.type === 'hierarchy' ? base * 0.6 : base * 1.6;
        });
      }

      const center = fg.d3Force('center');
      if (center) center.strength(galaxyMode ? 0.25 : 0.10); 

      fg.d3Force('globalGravity', globalGravityForce);
      if (galaxyMode) {
        fg.d3Force('galaxy', clusterPullForce);
        if (charge) charge.strength(chargeStrength * 0.5);
      } else {
        fg.d3Force('galaxy', null); 
      }

      try {
        // Force settings are updated above; graphData changes auto-reheat the simulation
      } catch(e) {}
    }
  }, [shouldRenderGraph, mountKey, nodeSpacing, galaxyMode, graphDataMemo, graphTheme, globalGravityForce, clusterPullForce]);

  useEffect(() => {
    if (!fgRef.current || !shouldRenderGraph) return;
    const fg = fgRef.current;
    
    const controls = fg.controls();
    if (controls) {
      controls.enableRotate = true;
      controls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN
      };
    }
    setTimeout(() => {
      fg.zoomToFit(1200, 150);
    }, 100);
  }, [shouldRenderGraph]);

  useEffect(() => {
    if (!fgRef.current || !shouldRenderGraph || !graphDataMemo.nodes.length) return;
    const fg = fgRef.current;
    const hasPositions = graphDataMemo.nodes.some(n => n.x !== 0 || n.y !== 0);
    if (!hasPositions) return;

    hasInteractedRef.current = false;

    const timer = setTimeout(() => {
      if (hasInteractedRef.current) return;
      try { fg.zoomToFit(1200, 150); } catch (e) {}
    }, 2500);
    return () => clearTimeout(timer);
  }, [subjectDepth, nodeSpacing, showDocumentNodes, professionalFocus, selectedTopic, graphDataMemo.nodes.length, shouldRenderGraph, isSidebarOpen, windowWidth]);

  useEffect(() => {
    if (fgRef.current && graphDataMemo.nodes) {
      const query = searchQuery.toLowerCase().trim();
      graphDataMemo.nodes.forEach(node => {
        if (node.__threeObj) {
          const isMatch = selectedTopic ? true : !query ||
              (node.name && node.name.toLowerCase().includes(query)) ||
              (node.subject && node.subject.toLowerCase().includes(query)) ||
              (Array.isArray(node.topics) && node.topics.some(t => t.toLowerCase().includes(query)));

          const targetOpacity = isMatch ? 0.9 : 0.05;
          node.__threeObj.children.forEach(child => {
            if (child.material) {
              const isSprite = child.type === 'Sprite';
              child.material.opacity = isSprite ? 1.0 : targetOpacity;
              child.material.transparent = true;
              if (isSprite) {
                child.material.alphaTest = 0.1;
                child.material.depthTest = true;
                child.material.depthWrite = true;
              }
              child.material.needsUpdate = true;
            }
          });
        }
      });
    }
  }, [searchQuery, selectedTopic, graphDataMemo.nodes, shouldRenderGraph]);

  useEffect(() => {
    if (!topbarRef.current) return;
    const checkOverflow = () => {
      const topbar = topbarRef.current;
      if (!topbar) return;
      const topbarRect = topbar.getBoundingClientRect();
      if (topbarRect.width <= 0) return;
      const padding = 48;
      const availableWidth = topbarRect.width - padding;
      const widths = toolWidthsRef.current;
      let totalNeeded = widths.logo + widths.close + 32;
      let toTeleport = [];
      if (totalNeeded + widths.sensitivity + widths.expansion > availableWidth) {
        toTeleport.push('expansion');
        if (totalNeeded + widths.sensitivity > availableWidth) toTeleport.push('sensitivity');
      }
      setTeleportedIds(prev => JSON.stringify(toTeleport.sort()) !== JSON.stringify([...prev].sort()) ? toTeleport : prev);
    };
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(topbarRef.current);
    checkOverflow();
    return () => observer.disconnect();
  }, []);

  const handleWheel = useCallback((e) => {
    if (fgRef.current) {
      if (e.target.closest && e.target.closest('.minimap-container')) return;
      const camera = fgRef.current.camera();
      const controls = fgRef.current.controls();
      if (!camera || !controls) return;
      e.stopPropagation();
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const speed = e.deltaY * -0.5;
      camera.position.addScaledVector(dir, speed);
      controls.target.addScaledVector(dir, speed);
      controls.update();
    }
  }, []);

  const nodeThreeObject = useCallback(node => {
    const isSubject = node.type === 'subject';
    const isTocItem = node.type === 'toc_item';
    const totalNodes = graphDataMemo.nodes.length;
    
    // Adaptive Label Rendering: Render labels only for hovered/selected nodes,
    // or when the overall graph density is low/moderate. This prevents
    // GPU canvas texture exhaustion and keeps the frame rate silky smooth.
    const isHoveredOrSelected = (node.id === hoverNode?.id) || (node.id === selectedNode?.id);
    let shouldShowLabel = isHoveredOrSelected;
    
    if (!shouldShowLabel) {
      if (totalNodes < 150) {
        shouldShowLabel = true; // Show all labels when density is very low
      } else if (isSubject && totalNodes < 400) {
        shouldShowLabel = true; // Show subject labels when moderately low
      } else if (isTocItem && node.tocLevel === 0 && totalNodes < 300) {
        shouldShowLabel = true; // Show root chapters if total count is moderate
      }
    }

    try {
      const group = new THREE.Group();
      const isHovered = hoverNode && hoverNode.id === node.id;
      const isSelected = selectedNode && selectedNode.id === node.id;

      const size = isSubject ? 4 : (isTocItem ? 1.5 : 2.5);
      
      const segments = totalNodes > 2000 ? 6 : 12;
      const geo = new THREE.SphereGeometry(size, segments, segments);
      const mat = new THREE.MeshBasicMaterial({
        color: isSubject ? '#899981' : (isTocItem ? '#D97706' : '#6366F1'),
        transparent: true,
        opacity: 0.85
      });
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);

      if (shouldShowLabel) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const oversample = 2;
        const baseFontSize = isSubject ? (graphStyles.labelFontSize * 1.4) : graphStyles.labelFontSize;
        const fontSize = baseFontSize * oversample * graphStyles.labelScale;
        const safeName = node.name || 'Unnamed';
        
        context.font = `bold ${fontSize}px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        const metrics = context.measureText(safeName);
        const textWidth = metrics.width;
        const padding = 20 * oversample;
        
        canvas.width = textWidth + padding;
        canvas.height = fontSize + padding;
        
        context.font = `bold ${fontSize}px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        const isDark = graphTheme === 'dark';
        
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.shadowColor = isDark ? 'rgba(0, 0, 0, 0.9)' : 'rgba(241, 239, 233, 0.9)';
        context.shadowBlur = 4 * oversample;
        context.fillStyle = isDark ? '#FFFFFF' : '#000000';
        context.fillText(safeName, canvas.width / 2, canvas.height / 2);
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = 4; // Reduced from 16 for performance
        texture.needsUpdate = true;
        
        const spriteMaterial = new THREE.SpriteMaterial({ 
          map: texture, 
          transparent: true, 
          alphaTest: 0.1, 
          opacity: 1.0, 
          depthTest: true, 
          depthWrite: true, 
          sizeAttenuation: true 
        });
        
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.renderOrder = 999;
        const gap = isSubject ? 48 : 36;
        sprite.position.set(0, size + gap, 0);
        const scaleFactor = isSubject ? 0.24 : 0.18;
        sprite.scale.set((canvas.width / (oversample * 10)) * scaleFactor * 10, (canvas.height / (oversample * 10)) * scaleFactor * 10, 1);
        group.add(sprite);

        // Store references for disposal
        group.userData = { 
          texture, 
          material: spriteMaterial, 
          meshMaterial: mat, 
          meshGeometry: geo 
        };
      } else {
        group.userData = { 
          meshMaterial: mat, 
          meshGeometry: geo 
        };
      }

      return group;
    } catch (err) {
      console.error('[MeshCanvas] Node render error:', err);
      return new THREE.Mesh(new THREE.BoxGeometry(5,5,5), new THREE.MeshBasicMaterial({color: 'red'}));
    }
  }, [graphStyles, graphTheme, graphDataMemo.nodes.length, hoverNode, selectedNode]);

  return (
    <div className="fixed inset-0 z-[10000] app-layout bg-bg-primary">
      {/* Mobile overlay */}
      {isSidebarOpen && windowWidth <= 768 && (
        <div
          className="mobile-overlay"
          onClick={() => setIsSidebarOpen(false)}
          style={{ zIndex: 9000 }}
        />
      )}
      <header className="app-topbar" ref={topbarRef}>
        <div className="app-topbar-left">
          <div className="app-logo">
            <Compass className="app-logo-icon" size={20} />
            <span className="logo-text">Spatial Knowledge Graph</span>
          </div>
          <button className="mobile-toggle-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ marginLeft: '8px', display: 'flex' }}>
            <Menu size={20} />
          </button>
        </div>
        <div className="app-topbar-center" style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          {!teleportedIds.includes('sensitivity') && (
            <div className="flex items-center gap-4 px-4 py-2.5 bg-white/40 backdrop-blur-md rounded-2xl border border-[#899981]/15 shadow-sm hover:border-[#899981]/25 transition-all" style={{ minWidth: '320px' }}>
              <span className="text-[11px] font-black uppercase tracking-wider text-text-secondary whitespace-nowrap flex items-center gap-1.5">
                <Compass size={14} className="text-[#899981]" />
                Subject depth
              </span>
              <input 
                type="range" 
                min="1" 
                max="6" 
                step="1"
                value={subjectDepth} 
                onChange={e => setSubjectDepth(parseInt(e.target.value))} 
                className="flex-1 w-full subject-depth-slider cursor-pointer accent-[#899981]" 
              />
              <span className="px-2.5 py-0.5 text-[9px] font-black tracking-widest text-white bg-gradient-to-r from-[#899981] to-[#6A7A62] rounded-full shadow-sm select-none" style={{ background: 'var(--gradient-primary)', minWidth: '48px', textAlign: 'center' }}>
                Lvl {subjectDepth}
              </span>
            </div>
          )}
          {!teleportedIds.includes('expansion') && (
            <div className="flex items-center gap-4 px-4 py-2.5 bg-white/40 backdrop-blur-md rounded-2xl border border-[#899981]/15 shadow-sm hover:border-[#899981]/25 transition-all" style={{ minWidth: '260px' }}>
              <span className="text-[11px] font-black uppercase tracking-wider text-text-secondary whitespace-nowrap flex items-center gap-1.5">
                <Maximize2 size={14} className="text-[#899981]" />
                Node distance
              </span>
              <input 
                type="range" 
                min="20" 
                max="1000" 
                step="10"
                value={nodeSpacing} 
                onChange={e => setNodeSpacing(parseInt(e.target.value))} 
                className="flex-1 w-full subject-depth-slider cursor-pointer accent-[#899981]" 
              />
              <span className="px-2.5 py-0.5 text-[9px] font-black tracking-widest text-white bg-gradient-to-r from-[#899981] to-[#6A7A62] rounded-full shadow-sm select-none" style={{ background: 'var(--gradient-primary)', minWidth: '68px', textAlign: 'center' }}>
                {nodeSpacing <= 60 ? 'Tight' : nodeSpacing <= 200 ? 'Compact' : nodeSpacing <= 450 ? 'Normal' : nodeSpacing <= 800 ? 'Wide' : 'Distant'}
              </span>
            </div>
          )}
          {/* Galaxy mode disabled
          <div className="mode-switcher" style={{ marginLeft: '12px' }}>
                {[
                  { val: true,  label: 'Cluster', icon: Layers },
                  { val: false, label: 'Static',  icon: Database }
                ].map(opt => (
                  <div key={String(opt.val)} className={`mode-item ${galaxyMode === opt.val ? 'active' : ''}`} onClick={() => setGalaxyMode(opt.val)}>
                    <opt.icon size={13} strokeWidth={2.5} />
                    <span>{opt.label}</span>
                  </div>
                ))}
              </div>
          */}
        </div>
        <div className="app-topbar-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => setShowStylePopout(!showStylePopout)} className={`global-close-btn ${showStylePopout ? 'active-palette' : ''}`} style={{ background: showStylePopout ? 'var(--accent-primary)' : 'transparent', color: showStylePopout ? 'white' : 'var(--text-secondary)' }} title="Graph Styling">
            <Palette size={18} />
          </button>
          <button onClick={onClose} className="global-close-btn" title="Close Spatial Graph">
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="app-main" style={{ width: '100vw', maxWidth: '100vw', display: 'flex', overflow: 'hidden' }}>
        <div 
          className={`sidebar-wrapper ${isSidebarOpen ? 'mobile-open' : ''}`} 
          style={{ 
            width: '260px', 
            flex: '0 0 260px', 
            borderRight: '1px solid var(--glass-border)', 
            overflow: 'hidden',
            zIndex: windowWidth <= 768 ? 9500 : undefined
          }}
        >
          <aside className="sidebar" style={{ width: '100%', overflowY: 'auto' }}>
            <div className="sidebar-section" style={{ paddingTop: '16px', marginBottom: '16px' }}>

              <button onClick={() => {
                const newTheme = graphTheme === 'light' ? 'dark' : 'light';
                setGraphTheme(newTheme);
                setGraphStyles(prev => ({ ...prev, labelColor: newTheme === 'light' ? '#000000' : '#FFFFFF', bgColor1: newTheme === 'light' ? '#FFFFFF' : '#1C1917', bgColor2: newTheme === 'light' ? '#F1EFE9' : '#0C0A09' }));
              }} className="mode-item" style={{ width: '100%', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: 'var(--text-primary)', marginBottom: '20px' }}>
                {graphTheme === 'light' ? <Moon size={16} className="text-accent" /> : <Sun size={16} className="text-accent" />}
                <span style={{ fontSize: '12px', fontWeight: 600 }}>{graphTheme === 'light' ? 'Night Mode' : 'Day Mode'}</span>
              </button>
              <div className="sidebar-label" style={{ marginBottom: '16px', fontSize: '10px', opacity: 0.6, letterSpacing: '1.5px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}>
                <Settings size={14} className="text-accent" />
                <span>Spatial graph filters</span>
              </div>
              <div ref={searchRef} style={{ width: '100%', marginBottom: '20px', position: 'relative' }}>
                {selectedTopic && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--gradient-primary)', color: 'white', borderRadius: 'var(--radius-full)', padding: '4px 10px 4px 12px', fontSize: '11px', fontWeight: 700, marginBottom: '8px', maxWidth: '100%' }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedTopic}</span>
                    <button onClick={() => { setSelectedTopic(null); setSearchQuery(''); }} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '0', lineHeight: 1, flexShrink: 0 }} title="Clear topic filter"><X size={12} /></button>
                  </div>
                )}
                <div className="catalog-search" style={{ width: '100%' }}>
                  <Search size={14} />
                  <input type="text" placeholder={selectedTopic ? 'Topic active — clear to search again' : 'Filter by topic…'} value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setSelectedTopic(null); setShowSuggestions(true); }} onFocus={() => setShowSuggestions(true)} className="w-full" disabled={!!selectedTopic} />
                </div>
                <AnimatePresence>
                  {showSuggestions && topicSuggestions.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9000, background: 'var(--bg-primary)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', marginTop: '4px', maxHeight: '260px', overflowY: 'auto' }}>
                      {topicSuggestions.map(topic => (
                        <button key={topic} onMouseDown={e => { e.preventDefault(); setSelectedTopic(topic); setSearchQuery(''); setShowSuggestions(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', borderBottom: '1px solid var(--glass-border)', cursor: 'pointer', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', transition: 'background 0.1s, color 0.1s' }} onMouseEnter={e => { e.currentTarget.style.background = 'var(--glass-bg-light)'; e.currentTarget.style.color = 'var(--text-primary)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>{topic}</button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {teleportedIds.includes('sensitivity') && (
                  <div style={{ marginBottom: 'var(--space-md)', padding: '0 4px' }}>
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-[11px] font-bold text-text-secondary flex items-center gap-1.5 uppercase tracking-wider">
                        <Compass size={12} className="text-[#899981]" />
                        Subject depth
                      </span>
                      <span className="text-[10px] font-black text-white bg-gradient-to-r from-[#899981] to-[#6A7A62] px-2 py-0.5 rounded-full" style={{ background: 'var(--gradient-primary)', minWidth: '48px', textAlign: 'center' }}>
                        Lvl {subjectDepth}
                      </span>
                    </div>
                    <div className="flex items-center w-full px-3 py-3.5 bg-[#EDE5D8]/40 rounded-xl border border-[#899981]/10">
                      <input 
                        type="range" 
                        min="1" 
                        max="6" 
                        step="1"
                        value={subjectDepth} 
                        onChange={e => setSubjectDepth(parseInt(e.target.value))} 
                        className="w-full subject-depth-slider cursor-pointer accent-[#899981]" 
                      />
                    </div>
                  </div>
                )}
{teleportedIds.includes('expansion') && (
                  <div>
                    <div className="flex justify-between text-[11px] font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
                      <span className="flex items-center gap-1.5"><Maximize2 size={12} /> Node distance</span>
                      <span className="text-[10px] font-black text-white bg-gradient-to-r from-[#899981] to-[#6A7A62] px-2 py-0.5 rounded-full" style={{ background: 'var(--gradient-primary)', minWidth: '68px', textAlign: 'center' }}>
                        {nodeSpacing <= 60 ? 'Tight' : nodeSpacing <= 200 ? 'Compact' : nodeSpacing <= 450 ? 'Normal' : nodeSpacing <= 800 ? 'Wide' : 'Distant'}
                      </span>
                    </div>
                    <div className="flex items-center w-full px-3 py-3.5 bg-[#EDE5D8]/40 rounded-xl border border-[#899981]/10">
                      <input 
                        type="range" 
                        min="20" 
                        max="1000" 
                        step="10"
                        value={nodeSpacing} 
                        onChange={e => setNodeSpacing(parseInt(e.target.value))} 
                        className="w-full subject-depth-slider cursor-pointer accent-[#899981]" 
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="sidebar-section" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px', display: 'flex', flexDirection: 'column', alignItems: 'stretch', width: '100%', marginBottom: '24px' }}>
              <div className="sidebar-label" style={{ marginBottom: '16px', fontSize: '10px', opacity: 0.6, letterSpacing: '1.5px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800 }}><Layers size={14} className="text-accent" /><span>Visibility Controls</span></div>
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                  <div className="control-group" style={{ overflow: 'visible' }}>
                    <div className="mode-switcher skg-sidebar-force-full" style={{ width: '100%', display: 'flex', gap: '4px' }}>
                      <div
                        className={`mode-item ${professionalFocus ? 'active' : ''}`}
                        onClick={() => setProfessionalFocus(true)}
                        style={{ flex: 1 }}
                      >
                        <Briefcase size={13} strokeWidth={2.5} />
                        <span>Professional</span>
                      </div>
                      <div
                        className={`mode-item ${!professionalFocus ? 'active' : ''}`}
                        onClick={() => setProfessionalFocus(false)}
                        style={{ flex: 1 }}
                      >
                        <Globe size={13} strokeWidth={2.5} />
                        <span>All</span>
                      </div>
                    </div>
                  </div>
                  <div className="control-group">
                    <div className="mode-switcher skg-sidebar-force-full" style={{ width: '100%', display: 'flex' }}>
                      <div className={`mode-item ${showDocumentNodes ? 'active' : ''}`} onClick={() => { setShowDocumentNodes(true); setVisibleLinkTypes(p => ({ ...p, category: true })); }} style={{ flex: 1 }}><Eye size={13} strokeWidth={2.5} /><span>Show PDF</span></div>
                      <div className={`mode-item ${!showDocumentNodes ? 'active' : ''}`} onClick={() => setShowDocumentNodes(false)} style={{ flex: 1 }}><EyeOff size={13} strokeWidth={2.5} /><span>Hide</span></div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  {[ { id: 'hierarchy', label: 'Folder structure', color: COLORS.linkHierarchy }, { id: 'category', label: 'Doc-to-subject', color: COLORS.linkCategory }, { id: 'discovery', label: 'AI lateral', color: COLORS.linkDiscovery }, { id: 'semantic', label: 'Semantic links', color: COLORS.linkSemantic }, { id: 'thematic', label: 'Thematic links', color: COLORS.linkThematic } ].map(type => {
                    const isOn = visibleLinkTypes[type.id];
                    return (
                      <div key={type.id} className="control-group">
                        <div className="mode-switcher skg-sidebar-force-full" style={{ width: '100%', display: 'flex' }}>
                          <div className={`mode-item ${isOn ? 'active' : ''}`} onClick={() => { setVisibleLinkTypes(p => ({ ...p, [type.id]: true })); if (type.id === 'semantic' || type.id === 'discovery' || type.id === 'category') setShowDocumentNodes(true); }} style={{ flex: 1, ...(isOn ? { background: `linear-gradient(135deg, ${type.color} 0%, color-mix(in srgb, ${type.color}, black 20%) 100%)`, color: 'white', boxShadow: `0 0 15px ${type.color}40` } : {}) }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isOn ? 'white' : type.color, boxShadow: `0 0 8px ${isOn ? 'rgba(255,255,255,0.5)' : type.color + '80'}` }} />
                              <span>{type.label}</span>
                            </div>
                          </div>
                          <div className={`mode-item ${!isOn ? 'active' : ''}`} onClick={() => setVisibleLinkTypes(p => ({ ...p, [type.id]: false }))} style={{ flex: 1 }}><EyeOff size={13} strokeWidth={2.5} /><span>Hide</span></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>
        </div>
        <div className="main-content-wrapper" style={{ display: 'flex', flex: '1 1 0%', minWidth: 0, maxWidth: '100%', overflow: 'hidden', height: '100%', position: 'relative' }}>
          <div className="flex-1 relative bg-white z-10" onWheel={handleWheel}>
          {(loading || !shouldRenderGraph) && loadingProgress.visible && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#FBF9F7]/90">
              <div className="flex flex-col items-center gap-3" style={{ width: '300px' }}>
                <div className="w-12 h-12 border-4 border-[#899981] border-t-transparent rounded-full animate-spin" />
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[#899981]">{loadingProgress.stage || 'Loading...'}</p>
                <div className="w-full h-1.5 bg-[#899981]/10 rounded-full overflow-hidden mt-1" style={{ background: 'color-mix(in srgb, var(--accent-indigo), transparent 90%)' }}>
                  <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${loadingProgress.percent}%`, background: 'linear-gradient(90deg, #899981 0%, #6366F1 100%)' }} />
                </div>
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-white p-12 text-center">
              <div>
                <AlertCircle className="mx-auto text-red-500 mb-6" size={48} />
                <h3 className="text-xl font-black mb-2 uppercase tracking-tight">Render Failure</h3>
                <p className="text-sm text-[#899981] font-medium italic mb-8">{error}</p>
              </div>
            </div>
          )}
          {shouldRenderGraph && graphData.nodes.length > 0 && (
            <div 
              style={{ position: 'absolute', inset: 0, background: graphStyles.bgType === 'solid' ? graphStyles.bgColor1 : graphStyles.bgType === 'radial' ? `radial-gradient(circle at center, ${graphStyles.bgColor1} 0%, ${graphStyles.bgColor2} 100%)` : `linear-gradient(180deg, ${graphStyles.bgColor1} 0%, ${graphStyles.bgColor2} 100%)`, transition: 'background 0.5s ease' }}
              onMouseDown={() => { hasInteractedRef.current = true; }}
              onTouchStart={() => { hasInteractedRef.current = true; }}
              onWheel={() => { hasInteractedRef.current = true; }}
            >
              <ForceGraph3D
                key={`spatial-graph-3d-${mountKey}-${nodeSpacing}`}
                ref={fgRef}
                graphData={graphDataMemo}
                nodeThreeObject={nodeThreeObject}
                nodeThreeObjectExtend={false}
                nodeColor={null}
                linkCurvature={0}
                nodeLabel={n => n.type === 'subject' ? n.fullName : n.type === 'toc_item' ? n.fullName : `${n.name}\n[${n.subject || 'No Subject'}]`}
                nodeVal={n => n.type === 'subject' ? 40 : n.type === 'toc_item' ? 12 : 10}
                nodeResolution={graphDataMemo.nodes.length > 500 ? 8 : 20}
                linkDirectionalParticles={l => { if (graphDataMemo.nodes.length > 500) return 0; const isRelated = selectedNode && (l.source.id === selectedNode.id || l.target.id === selectedNode.id); return isRelated ? 6 : (graphStyles.linkWidth > 1 ? graphStyles.particleCount : 0); }}
                linkDirectionalParticleWidth={l => { if (graphDataMemo.nodes.length > 500) return 0; const isRelated = selectedNode && (l.source.id === selectedNode.id || l.target.id === selectedNode.id); return isRelated ? graphStyles.linkWidth * 2.5 : graphStyles.linkWidth; }}
                linkDirectionalParticleSpeed={graphStyles.particleSpeed}
                linkDirectionalParticleColor={link => { const map = { hierarchy: COLORS.linkHierarchy, category: COLORS.linkCategory, discovery: COLORS.linkDiscovery, semantic: COLORS.linkSemantic, thematic: COLORS.linkSemantic }; return map[link.type] || COLORS.linkSemantic; }}
                linkWidth={l => { const isRelated = selectedNode && (l.source.id === selectedNode.id || l.target.id === selectedNode.id); const baseWidth = graphDataMemo.nodes.length > 500 ? 30 : graphStyles.linkWidth; return isRelated ? baseWidth * 2.5 : baseWidth; }}
                linkColor={l => { const isRelated = selectedNode && (l.source.id === selectedNode.id || l.target.id === selectedNode.id); if (isRelated) return '#6366F1'; if (graphStyles.linkColor !== '#F59E0B') return graphStyles.linkColor; const map = { hierarchy: COLORS.linkHierarchy, category: COLORS.linkCategory, discovery: COLORS.linkDiscovery, semantic: COLORS.linkSemantic, thematic: COLORS.linkSemantic }; return map[l.type] || COLORS.linkSemantic; }}
                linkHoverPrecision={15}
                backgroundColor="rgba(0,0,0,0)"
                showNavInfo={false}
                controlType="orbit"
                onNodeHover={setHoverNode}
                onNodeClick={node => {
                  if (selectedNode && selectedNode.id === node.id) {
                    setSelectedNode(null);
                  } else {
                    setSelectedNode(node);
                    fgRef.current?.cameraPosition({ x: node.x * 2, y: node.y * 2, z: node.z * 2 }, node, 1000);
                  }
                }}
                onBackgroundClick={() => setSelectedNode(null)}
                enableNodeDrag={false}
                warmupTicks={graphDataMemo.nodes.length > 500 ? 100 : 0}
                cooldownTicks={graphDataMemo.nodes.length > 500 ? 30 : 40}
                onEngineStop={() => {
                  if (loadingProgress.visible) setLoadingProgress({ stage: '', percent: 100, visible: false });
                }}
              />
            </div>
          )}
          <AnimatePresence>{showStylePopout && ( <StylePopout styles={graphStyles} setStyles={setGraphStyles} onClose={() => setShowStylePopout(false)} /> )}</AnimatePresence>
          {windowWidth > 768 && <MiniMap graphData={graphDataMemo} fgRef={fgRef} />}
            <div className="absolute bottom-10 right-10 z-[100] pointer-events-none">
              <div className="px-5 py-2.5 bg-white/90 backdrop-blur-xl rounded-full border border-[#899981]/20 flex items-center gap-6 shadow-xl" style={{ width: 'max-content', maxWidth: '100%' }}>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#899981] flex items-center gap-2.5"><span className="w-2 h-2 rounded-full bg-[#899981]/40 animate-pulse"></span>Left Click: Rotate</span>
                <div className="w-px h-3 bg-[#899981]/20"></div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#899981] flex items-center gap-2.5"><span className="w-2 h-2 rounded-full bg-[#899981]/40"></span>Right Click: Pan</span>
                <div className="w-px h-3 bg-[#899981]/20"></div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#899981] flex items-center gap-2.5"><span className="w-2 h-2 rounded-full bg-[#899981]/40"></span>Scroll: Zoom</span>
              </div>
            </div>
          <div className="absolute bottom-10 left-10 flex gap-6 z-20">
            <div className="px-4 py-2 bg-white/80 backdrop-blur-md rounded-xl border border-[#899981]/10 flex items-center gap-3"><Activity size={14} className="text-[#899981]" /><span className="text-[10px] font-black uppercase tracking-widest text-[#899981]">Nodes: {graphDataMemo.nodes.length}</span></div>
            <div className="px-4 py-2 bg-white/80 backdrop-blur-md rounded-xl border border-[#899981]/10 flex items-center gap-3"><Database size={14} className="text-[#899981]" /><span className="text-[10px] font-black uppercase tracking-widest text-[#899981]">Links: {graphDataMemo.links.length}</span></div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniMap({ graphData, fgRef }) {
  const canvasRef = useRef(null);
  const graphDataRef = useRef(graphData);
  const mapStateRef = useRef({ scale: 1, centerX: 0, centerY: 0, width: 360, height: 280 });
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // Keep graphDataRef current on every render
  graphDataRef.current = graphData;

  useEffect(() => {
    let animationFrameId;
    const render = () => {
      // Schedule next frame immediately so the loop doesn't die on early returns during init
      animationFrameId = requestAnimationFrame(render);

      const canvas = canvasRef.current;
      const fg = fgRef.current;
      if (!canvas || !fg) return;
      const ctx = canvas.getContext('2d');
      const CW = canvas.width, CH = canvas.height;
      const camera = fg.camera();
      const controls = fg.controls();
      if (!camera || !controls) return;
      const target = controls.target;
      // Read from graphDataRef so we always get the latest node positions
      const gd = graphDataRef.current;
      if (!gd) return;
      const nodes = gd.nodes || [];
      if (!nodes.length) return;
      const links = gd.links || [];

      // Compute world bounds
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      nodes.forEach(n => { if (n.x == null || n.y == null) return; minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y); });
      const pad = 40;
      const worldW = maxX - minX || 100;
      const worldH = maxY - minY || 100;
      const scale = Math.min((CW - pad * 2) / worldW, (CH - pad * 2) / worldH);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      mapStateRef.current = { scale, centerX: cx, centerY: cy, width: CW, height: CH };

      // Coordinate transform: world → canvas
      const toCanvas = (wx, wy) => [
        CW / 2 + (wx - cx) * scale,
        CH / 2 + (wy - cy) * scale
      ];

      ctx.clearRect(0, 0, CW, CH);

      // Draw links
      ctx.strokeStyle = 'rgba(137, 153, 129, 0.12)';
      ctx.lineWidth = 0.5;
      links.forEach(l => {
        const s = typeof l.source === 'object' ? l.source : nodes.find(n => n.id === l.source);
        const t = typeof l.target === 'object' ? l.target : nodes.find(n => n.id === l.target);
        if (s && t) {
          const [sx, sy] = toCanvas(s.x, s.y);
          const [tx, ty] = toCanvas(t.x, t.y);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(tx, ty);
          ctx.stroke();
        }
      });

      // Draw nodes
      nodes.forEach(n => {
        const [nx, ny] = toCanvas(n.x, n.y);
        ctx.fillStyle = n.type === 'subject' ? '#899981' : '#6366F1';
        ctx.beginPath();
        ctx.arc(nx, ny, n.type === 'subject' ? 2.5 : 1.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw viewport rectangle — axis-aligned, proportional to camera distance
      const dist = camera.position.distanceTo(target);
      const fov = camera.fov * (Math.PI / 180);
      const halfView = Math.tan(fov / 2) * dist;
      const aspect = window.innerWidth / window.innerHeight;
      const vx = halfView * aspect;
      const vy = halfView;

      const [rLeft, rTop] = toCanvas(target.x - vx, target.y - vy);
      const [rRight, rBottom] = toCanvas(target.x + vx, target.y + vy);

      ctx.strokeStyle = 'rgba(137, 153, 129, 0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(rLeft, rTop, rRight - rLeft, rBottom - rTop);
      ctx.setLineDash([]);
    };
    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [graphData, fgRef]);

  const getCanvasPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const CW = canvasRef.current.width, CH = canvasRef.current.height;
    return { x: (e.clientX - rect.left) / rect.width * CW, y: (e.clientY - rect.top) / rect.height * CH };
  };

  const canvasToWorld = (cx, cy) => {
    const { scale, centerX, centerY } = mapStateRef.current;
    return { x: (cx - 180) / scale + centerX, y: (cy - 140) / scale + centerY };
  };

  const handleMouseDown = (e) => {
    isDragging.current = false;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e) => {
    if (!lastMousePos.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    const threshold = 3;
    if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
      isDragging.current = true;
    }
    if (!isDragging.current) return;
    const { scale } = mapStateRef.current;
    if (!scale || isNaN(scale)) return;
    const fg = fgRef.current;
    const camera = fg.camera();
    const controls = fg.controls();
    if (!camera || !controls) return;
    const dx_world = -dx / scale;
    const dy_world = -dy / scale;
    controls.target.x += dx_world;
    controls.target.y += dy_world;
    camera.position.x += dx_world;
    camera.position.y += dy_world;
    controls.update();
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    lastMousePos.current = null;
  };

  const handleClick = (e) => {
    if (isDragging.current) return;
    const pos = getCanvasPos(e);
    const world = canvasToWorld(pos.x, pos.y);
    const fg = fgRef.current;
    const camera = fg.camera();
    const controls = fg.controls();
    if (!camera || !controls) return;
    const offset = camera.position.clone().sub(controls.target);
    const newTarget = new THREE.Vector3(world.x, world.y, 0);
    fg.cameraPosition(newTarget.clone().add(offset), newTarget, 600);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const fg = fgRef.current;
    const camera = fg.camera();
    const controls = fg.controls();
    if (!camera || !controls) return;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const zoomFactor = e.deltaY > 0 ? 1.15 : 0.87;
    const newDist = camera.position.distanceTo(controls.target) * zoomFactor;
    const clampedDist = Math.max(50, Math.min(5000, newDist));
    dir.multiplyScalar(clampedDist);
    camera.position.copy(controls.target).add(dir);
    controls.update();
  };

  return (
    <div
      className="fixed top-0 right-0 z-[5000] minimap-container"
      style={{ width: '360px', height: '280px', background: 'rgba(241, 239, 233, 0.85)', backdropFilter: 'blur(30px)', borderLeft: '1px solid rgba(137, 153, 129, 0.2)', borderBottom: '1px solid rgba(137, 153, 129, 0.2)', boxShadow: '-10px 10px 40px rgba(0,0,0,0.15)', overflow: 'hidden', cursor: 'crosshair', pointerEvents: 'auto' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
      onWheel={handleWheel}
    >
      <canvas ref={canvasRef} width={360} height={280} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

function StylePopout({ styles, setStyles, onClose }) {
  const [activeTab, setActiveTab] = useState('nodes');
  const updateStyle = (key, val) => setStyles(prev => ({ ...prev, [key]: val }));
  const sections = [ { id: 'nodes', label: 'Nodes', icon: Activity }, { id: 'labels', label: 'Labels', icon: TypeIcon }, { id: 'links', label: 'Links', icon: Layers }, { id: 'bg', label: 'Stage', icon: Globe } ];

  return (
    <motion.div initial={{ opacity: 0, x: 20, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 20, scale: 0.95 }} className="styling-popout" style={{ position: 'absolute', top: '20px', right: '300px', zIndex: 20000, width: '420px', background: '#F1EFE9', borderRadius: '2.5rem', border: '1px solid rgba(46, 43, 39, 0.1)', boxShadow: '0 20px 60px rgba(46, 43, 39, 0.18), 0 8px 24px rgba(46, 43, 39, 0.10)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '28px 28px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: '#F1EFE9', borderBottom: '1px solid rgba(46, 43, 39, 0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '16px', background: 'rgba(137, 153, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#899981' }}><Settings size={22} /></div>
          <div>
            <div style={{ fontWeight: 900, fontSize: '22px', letterSpacing: '-0.03em', color: '#2E2B27', lineHeight: 1.1 }}>Graph Styling</div>
            <div style={{ fontWeight: 700, fontSize: '10px', letterSpacing: '0.12em', color: 'rgba(46, 43, 39, 0.45)', textTransform: 'uppercase', marginTop: '3px' }}>Core Interface v1.0.4</div>
          </div>
        </div>
        <button onClick={onClose} style={{ padding: '8px', borderRadius: '50%', background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(46, 43, 39, 0.35)', transition: 'all 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(46,43,39,0.06)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><X size={20} /></button>
      </div>
      <div style={{ padding: '16px 28px 20px', background: '#F1EFE9' }}>
        <div style={{ display: 'flex', width: '100%', background: '#EDE5D8', padding: '4px', borderRadius: '9999px', border: '1px solid rgba(46, 43, 39, 0.1)', gap: '2px' }}>
          {sections.map(sec => (
            <button key={sec.id} onClick={() => setActiveTab(sec.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', padding: '9px 14px', borderRadius: '9999px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', border: 'none', transition: 'all 0.18s ease', background: activeTab === sec.id ? 'linear-gradient(135deg, #899981 0%, #6A7A62 100%)' : 'transparent', color: activeTab === sec.id ? 'white' : 'rgba(46, 43, 39, 0.55)', boxShadow: activeTab === sec.id ? '0 0 20px rgba(137, 153, 129, 0.3)' : 'none', whiteSpace: 'nowrap' }}>
              <sec.icon size={13} /><span>{sec.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: '0 28px 28px', maxHeight: '400px', overflowY: 'auto' }} className="custom-scrollbar">
        {activeTab === 'nodes' && ( <div className="space-y-8 pt-4"> <ControlGroup label="Subject Node Color"><input type="color" value={styles.subjectColor} onChange={e => updateStyle('subjectColor', e.target.value)} className="w-full h-12 rounded-xl cursor-pointer border-none p-0 bg-transparent" /></ControlGroup> <ControlGroup label="Document Node Color"><input type="color" value={styles.bookColor} onChange={e => updateStyle('bookColor', e.target.value)} className="w-full h-12 rounded-xl cursor-pointer border-none p-0 bg-transparent" /></ControlGroup> <ControlGroup label="Node Scale" value={`${Math.round(styles.nodeScale * 100)}%`}><input type="range" min="0.2" max="3" step="0.1" value={styles.nodeScale} onChange={e => updateStyle('nodeScale', parseFloat(e.target.value))} className="w-full accent-[#899981]" /></ControlGroup> </div> )}
        {activeTab === 'labels' && ( <div className="space-y-8 pt-4"> <ControlGroup label="Label Color"><input type="color" value={styles.labelColor} onChange={e => updateStyle('labelColor', e.target.value)} className="w-full h-12 rounded-xl cursor-pointer border-none p-0 bg-transparent" /></ControlGroup> <ControlGroup label="Base Font Size" value={`${styles.labelFontSize}pt`}><input type="range" min="20" max="120" step="1" value={styles.labelFontSize} onChange={e => updateStyle('labelFontSize', parseInt(e.target.value))} className="w-full accent-[#899981]" /></ControlGroup> <ControlGroup label="Label Scale" value={`${Math.round(styles.labelScale * 100)}%`}><input type="range" min="0.5" max="3" step="0.1" value={styles.labelScale} onChange={e => updateStyle('labelScale', parseFloat(e.target.value))} className="w-full accent-[#899981]" /></ControlGroup> </div> )}
        {activeTab === 'links' && ( <div className="space-y-8 pt-4"> <ControlGroup label="Connection Color"><input type="color" value={styles.linkColor} onChange={e => updateStyle('linkColor', e.target.value)} className="w-full h-12 rounded-xl cursor-pointer border-none p-0 bg-transparent" /></ControlGroup> <ControlGroup label="Thickness" value={`${styles.linkWidth}px`}><input type="range" min="0.1" max="30" step="0.5" value={styles.linkWidth} onChange={e => updateStyle('linkWidth', parseFloat(e.target.value))} className="w-full accent-[#899981]" /></ControlGroup> <div className="pt-6 border-t border-[#2E2B27]/10"><span className="text-[10px] uppercase tracking-[0.2em] font-black text-[#2E2B27]/30 block mb-6">Physics Animation</span><ControlGroup label="Particle Speed"><input type="range" min="0" max="0.02" step="0.001" value={styles.particleSpeed} onChange={e => updateStyle('particleSpeed', parseFloat(e.target.value))} className="w-full accent-[#899981]" /></ControlGroup></div> </div> )}
        {activeTab === 'bg' && ( <div className="space-y-8 pt-4"> <ControlGroup label="Stage Background"><div className="flex gap-1 p-1 bg-[#2E2B27]/5 rounded-xl">{['solid', 'radial', 'linear'].map(m => ( <button key={m} onClick={() => updateStyle('bgType', m)} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${styles.bgType === m ? 'bg-white shadow-sm text-[#899981]' : 'text-[#2E2B27]/40 hover:text-[#2E2B27]/60'}`}>{m}</button> ))}</div></ControlGroup> <ControlGroup label="Primary Color"><input type="color" value={styles.bgColor1} onChange={e => updateStyle('bgColor1', e.target.value)} className="w-full h-12 rounded-xl cursor-pointer border-none p-0 bg-transparent" /></ControlGroup> {styles.bgType !== 'solid' && ( <ControlGroup label="Secondary Color"><input type="color" value={styles.bgColor2} onChange={e => updateStyle('bgColor2', e.target.value)} className="w-full h-12 rounded-xl cursor-pointer border-none p-0 bg-transparent" /></ControlGroup> )} </div> )}
      </div>
      <div style={{ padding: '20px 28px 28px', background: '#EDE5D8', borderTop: '1px solid rgba(46, 43, 39, 0.08)' }}>
        <button onClick={() => setStyles({ subjectColor: '#899981', bookColor: '#6366F1', nodeScale: 1, labelScale: 1, labelColor: '#2E2B27', labelFontSize: 112, linkWidth: 10, linkColor: '#F59E0B', particleSpeed: 0.002, particleWidth: 2, particleCount: 6, bgType: 'solid', bgColor1: '#F1EFE9', bgColor2: '#FBF9F7' })} style={{ width: '100%', padding: '14px', fontSize: '11px', fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#899981', background: 'transparent', borderRadius: '14px', border: '1px solid rgba(137, 153, 129, 0.3)', cursor: 'pointer', transition: 'all 0.18s' }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(137,153,129,0.1)'; e.currentTarget.style.borderColor = 'rgba(137,153,129,0.5)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(137,153,129,0.3)'; }}>Reset to Factory Defaults</button>
      </div>
    </motion.div>
  );
}

function ControlGroup({ label, children, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(46, 43, 39, 0.55)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
        {value && ( <span style={{ fontSize: '11px', fontWeight: 900, fontFamily: 'monospace', color: '#899981', background: 'rgba(137, 153, 129, 0.1)', padding: '2px 8px', borderRadius: '6px' }}>{value}</span> )}
      </div>
      {children}
    </div>
  );
}

function TypeIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7V4h16v3M9 20h6M12 4v16" />
    </svg>
  );
}
