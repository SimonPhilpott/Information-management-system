import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ENTITY_TYPES } from '../../data/nodes';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Layers, Search, Copy, Check, X, ListOrdered } from 'lucide-react';

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

/**
 * SunburstCanvas — Interactive radial hierarchy chart for the knowledge graph.
 *
 * Interaction model:
 *  • Scroll wheel        → zoom in / out anchored to cursor (via SVG viewBox — no CSS scale blur)
 *  • Right-click drag    → pan the chart
 *  • Single-click slice  → drill down into that sub-tree
 *  • Double-click slice  → open the node information panel
 *  • Click centre / ZOOM OUT → navigate one level back up
 *
 * Zoom is intentionally implemented through SVG viewBox manipulation, NOT CSS transform.
 * This ensures SVG text is always re-rasterised at device-pixel resolution so labels
 * remain perfectly sharp regardless of zoom level.
 */
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

export const SunburstCanvas = ({
  meshRef,      // API-compat only — not used; component owns its own pan/zoom
  view,         // API-compat only — not used
  nodes = [],
  onSelectNode,
  onAddOffshoot,
  theme = 'dark',
  onThemeToggle,
}) => {
  const isDark     = theme !== 'light';
  const bgColor    = isDark ? '#000000' : '#ece8dd';
  const textColor  = isDark ? 'text-white' : 'text-[#2E2B27]';
  const mutedColor = isDark ? 'text-slate-400' : 'text-[#6A645D]';
  const borderCol  = isDark ? 'border-white/10' : 'border-[#2E2B27]/15';

  // ── Local state ─────────────────────────────────────────────────────────────
  const [focusNodeId, setFocusNodeId] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
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

  /**
   * SVG viewport — defines which region of the 900×800 SVG coordinate space is visible.
   * Zoom is achieved by shrinking/growing this region, pan by translating it.
   * Because the viewBox is changed (not CSS scale), the browser re-rasterises at
   * native resolution → text stays sharp at every zoom level.
   */
  const DEFAULT_VP = { x: 0, y: 0, w: 900, h: 800 };
  const [viewport, setViewport] = useState(DEFAULT_VP);

  // Ref mirrors state so event callbacks always see the latest value without
  // needing to be recreated on every state change.
  const viewportRef = useRef(DEFAULT_VP);
  viewportRef.current = viewport;

  const svgRef       = useRef(null);
  const containerRef = useRef(null);
  const isPanning    = useRef(false);
  const panStartRef  = useRef({ mouseX: 0, mouseY: 0, startX: 0, startY: 0, vpW: 900, vpH: 800 });

  // Double-click discrimination
  const clickTimerRef     = useRef(null);
  const DBLCLICK_DELAY_MS = 260;

  const rootId        = 'tt_group';
  const currentRootId = focusNodeId || rootId;

  /** Clamp the viewport to reasonable zoom limits. */
  const clampVp = (vp) => ({
    x: vp.x,
    y: vp.y,
    w: Math.min(Math.max(vp.w, 80),  9000),
    h: Math.min(Math.max(vp.h, 70),  8000),
  });

  const resetViewport = () => {
    viewportRef.current = DEFAULT_VP;
    setViewport(DEFAULT_VP);
  };

  // ── Wheel zoom anchored to cursor ────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const vp   = viewportRef.current;

      // Cursor in SVG-coordinate space
      const svgCursorX = vp.x + (e.clientX - rect.left)  / rect.width  * vp.w;
      const svgCursorY = vp.y + (e.clientY - rect.top)   / rect.height * vp.h;

      // factor > 1 → zoom out (bigger viewport), factor < 1 → zoom in (smaller viewport)
      const factor = Math.exp(e.deltaY * 0.001);
      const newW   = vp.w * factor;
      const newH   = vp.h * factor;
      const ratio  = newW / vp.w;

      const newVp = clampVp({
        x: svgCursorX - (svgCursorX - vp.x) * ratio,
        y: svgCursorY - (svgCursorY - vp.y) * ratio,
        w: newW,
        h: newH,
      });

      viewportRef.current = newVp;
      setViewport(newVp);
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  // ── Right-mouse-button pan ───────────────────────────────────────────────────
  const handleContainerMouseDown = (e) => {
    if (e.button !== 2) return;
    e.preventDefault();
    isPanning.current = true;
    if (containerRef.current) containerRef.current.style.cursor = 'grabbing';
    panStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: viewportRef.current.x,
      startY: viewportRef.current.y,
      vpW:    viewportRef.current.w,
      vpH:    viewportRef.current.h,
    };
  };

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!isPanning.current) return;
      const svg = svgRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const { mouseX, mouseY, startX, startY, vpW, vpH } = panStartRef.current;

      // Pixel delta → SVG-coordinate delta (negate: drag right → viewport shifts left)
      const dx = -((e.clientX - mouseX) / rect.width)  * vpW;
      const dy = -((e.clientY - mouseY) / rect.height) * vpH;

      const newVp = { ...viewportRef.current, x: startX + dx, y: startY + dy };
      viewportRef.current = newVp;
      setViewport(newVp);
    };

    const onMouseUp = (e) => {
      if (e.button === 2) {
        isPanning.current = false;
        if (containerRef.current) containerRef.current.style.cursor = '';
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
    };
  }, []);

  // ── Tree building ────────────────────────────────────────────────────────────
  const treeData = useMemo(() => {
    const buildSubtree = (nodeId) => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return null;
      const children = nodes.filter(n => n.parentId === nodeId);
      return { ...node, children: children.map(c => buildSubtree(c.id)).filter(Boolean) };
    };

    const tree = buildSubtree(currentRootId);
    if (!tree) return null;

    const addWeights = (node) => {
      if (!node.children?.length) { node.value = 1.6; return 1.6; }
      const sum = node.children.reduce((acc, c) => acc + addWeights(c), 0);
      node.value = sum;
      return sum;
    };

    addWeights(tree);
    return tree;
  }, [nodes, currentRootId]);

  // ── Angle assignment with sector-colour inheritance ──────────────────────────
  const flatSlices = useMemo(() => {
    if (!treeData) return [];
    const slices = [];

    /**
     * Each depth-1 node anchors a "sector colour" from its entity type.
     * All descendants inherit it so nodes in the same branch share a hue —
     * visual relationships at a glance. Opacity decreases with depth.
     */
    const assignAngles = (node, startAngle = 0, endAngle = 2 * Math.PI, depth = 0, sectorColor = null) => {
      const mySectorColor = depth === 1
        ? (ENTITY_TYPES[node.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT).color
        : sectorColor;

      slices.push({ ...node, startAngle, endAngle, depth, sectorColor: mySectorColor });

      if (node.children?.length) {
        let cur = startAngle;
        const span = endAngle - startAngle;
        node.children.forEach(child => {
          const fraction = (child.value / node.value) * span;
          assignAngles(child, cur, cur + fraction, depth + 1, mySectorColor);
          cur += fraction;
        });
      }
    };

    assignAngles(treeData, 0, 2 * Math.PI, 0, null);
    return slices;
  }, [treeData]);

  // ── SVG geometry ─────────────────────────────────────────────────────────────
  const cx              = 450;
  const cy              = 400;
  const innerBaseRadius = 100;
  // Rings sized to contain multi-word labels without clipping
  const ringWidth       = 130;

  const getRadius = (depth) => {
    if (depth === 0) return { r0: 0, r1: innerBaseRadius };
    const r0 = innerBaseRadius + (depth - 1) * ringWidth;
    return { r0, r1: r0 + ringWidth };
  };

  const getArcPath = (r0, r1, startA, endA) => {
    let angleDiff = endA - startA;
    if (angleDiff >= 2 * Math.PI - 0.001) angleDiff = 2 * Math.PI - 0.001;
    const eA = startA + angleDiff;

    const x0o = cx + r1 * Math.cos(startA); const y0o = cy + r1 * Math.sin(startA);
    const x1o = cx + r1 * Math.cos(eA);     const y1o = cy + r1 * Math.sin(eA);
    const x0i = cx + r0 * Math.cos(startA); const y0i = cy + r0 * Math.sin(startA);
    const x1i = cx + r0 * Math.cos(eA);     const y1i = cy + r0 * Math.sin(eA);
    const la  = angleDiff > Math.PI ? 1 : 0;

    if (r0 === 0) {
      if (angleDiff >= 2 * Math.PI - 0.01)
        return `M ${cx} ${cy} m -${r1} 0 a ${r1} ${r1} 0 1 0 ${2 * r1} 0 a ${r1} ${r1} 0 1 0 -${2 * r1} 0`;
      return `M ${cx} ${cy} L ${x0o} ${y0o} A ${r1} ${r1} 0 ${la} 1 ${x1o} ${y1o} Z`;
    }

    if (angleDiff >= 2 * Math.PI - 0.01)
      return `M ${cx - r1} ${cy} a ${r1} ${r1} 0 1 0 ${2 * r1} 0 a ${r1} ${r1} 0 1 0 -${2 * r1} 0 M ${cx - r0} ${cy} a ${r0} ${r0} 0 1 0 ${2 * r0} 0 a ${r0} ${r0} 0 1 0 -${2 * r0} 0`;

    return `M ${x0i} ${y0i} L ${x0o} ${y0o} A ${r1} ${r1} 0 ${la} 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${r0} ${r0} 0 ${la} 0 ${x0i} ${y0i} Z`;
  };

  // ── Slice centres for secondary links ────────────────────────────────────────
  const sliceCenters = useMemo(() => {
    const centers = {};
    flatSlices.forEach(slice => {
      const { r0, r1 } = getRadius(slice.depth);
      const theta = (slice.startAngle + slice.endAngle) / 2;
      const rm    = slice.depth === 0 ? 0 : (r0 + r1) / 2;
      centers[slice.id] = { x: cx + rm * Math.cos(theta), y: cy + rm * Math.sin(theta) };
    });
    return centers;
  }, [flatSlices]);

  // ── Secondary transverse links ───────────────────────────────────────────────
  const secondaryPaths = useMemo(() => {
    const paths = [];
    flatSlices.forEach(slice => {
      (slice.secondaryLinks || []).forEach(targetId => {
        if (sliceCenters[slice.id] && sliceCenters[targetId]) {
          const p1    = sliceCenters[slice.id];
          const p2    = sliceCenters[targetId];
          const ctrlX = (p1.x + p2.x) / 2 * 0.5 + cx * 0.5;
          const ctrlY = (p1.y + p2.y) / 2 * 0.5 + cy * 0.5;
          paths.push({
            id:    `sec-${slice.id}-${targetId}`,
            fromId: slice.id,
            toId:   targetId,
            d:     `M ${p1.x} ${p1.y} Q ${ctrlX} ${ctrlY} ${p2.x} ${p2.y}`,
            color: (ENTITY_TYPES[slice.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT).color,
          });
        }
      });
    });
    return paths;
  }, [flatSlices, sliceCenters]);

  // ── Search Logic & Memos ───────────────────────────────────────────────────
  const selectedNode = useMemo(() => nodes.find(n => n.id === focusNodeId), [focusNodeId, nodes]);

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
    if (!flatSlices || flatSlices.length === 0) return [];
    
    const q = searchQuery.toLowerCase().trim();
    const matching = q 
      ? flatSlices.filter(n => 
          n.title.toLowerCase().includes(q) || 
          n.id.toLowerCase().includes(q) ||
          (n.content && Object.values(n.content).some(val => 
            typeof val === 'string' && val.toLowerCase().includes(q)
          ))
        )
      : flatSlices;

    const refNode = (selectedNode && matching.some(n => n.id === selectedNode.id))
      ? selectedNode
      : matching[0];

    const primaryNode = flatSlices.find(n => n.id === 'tt_group') || { id: 'tt_group' };

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
      const p1 = sliceCenters[n1.id] || { x: 0, y: 0 };
      const p2 = sliceCenters[n2.id] || { x: 0, y: 0 };
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
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
  }, [searchQuery, flatSlices, selectedNode, sliceCenters]);

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
    if (focusNodeId) {
      const node = nodes.find(n => n.id === focusNodeId);
      if (node) {
        setSearchQuery(node.title);
        setActiveSearchQuery('');
      }
    } else {
      setSearchQuery('');
      setActiveSearchQuery('');
    }
  }, [focusNodeId, nodes]);

  // ── Colour helpers ───────────────────────────────────────────────────────────
  /**
   * Depth-aware background tints — visible enough to show grouping while fading
   * outward so hierarchy is encoded in intensity.
   * Inner ring (~42 % on dark) → outermost ring (~13 %).
   */
  const getFillOpacity = (depth, isHovered) => {
    if (depth === 0) return isDark ? 0.02 : 0.04;
    if (isHovered)   return isDark ? 0.45 : 0.50;
    const darkLevels  = [0.18, 0.14, 0.10, 0.07, 0.05];
    const lightLevels = [0.22, 0.17, 0.12, 0.08, 0.06];
    const table       = isDark ? darkLevels : lightLevels;
    return table[Math.min(depth - 1, table.length - 1)];
  };

  /** Separator hairline: near-black on dark bg, near-white on light bg. */
  const separatorStroke = isDark ? 'rgba(8,12,20,0.92)' : 'rgba(255,255,255,0.92)';

  // ── Click handling — single vs double ────────────────────────────────────────
  /**
   * A 260 ms timer discriminates single from double clicks.
   * • Single click → navigate into the selected sub-tree (drill down).
   * • Double click → open the node information / detail panel.
   */
  const handleSliceClick = (e, slice) => {
    if (isPanning.current) return; // Ignore clicks that ended a pan

    if (clickTimerRef.current) {
      // Second click arrived before timer — it's a double-click
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      if (onSelectNode) onSelectNode(slice);
      return;
    }

    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;

      // Navigate
      if (slice.depth === 0) {
        const node = nodes.find(n => n.id === currentRootId);
        if (node?.parentId) setFocusNodeId(node.parentId);
        else if (currentRootId !== rootId) setFocusNodeId(null);
        resetViewport();
      } else if (slice.children?.length) {
        setFocusNodeId(slice.id);
        resetViewport();
      } else {
        // Leaf node: open intelligence drawer immediately on single click
        if (onSelectNode) onSelectNode(slice);
      }
    }, DBLCLICK_DELAY_MS);
  };

  // ── Tooltip tracking ─────────────────────────────────────────────────────────
  const handleSliceMouseMove = (e, slice) => {
    if (isPanning.current) return;
    if (containerRef.current) {
      const bounds = containerRef.current.getBoundingClientRect();
      let tipX = e.clientX - bounds.left + 20;
      let tipY = e.clientY - bounds.top  + 20;
      if (tipX + 240 > bounds.width)  tipX = e.clientX - bounds.left - 252;
      if (tipY + 220 > bounds.height) tipY = e.clientY - bounds.top  - 228;
      
      const el = document.getElementById('sunburst-tooltip');
      if (el) {
        el.style.left = `${tipX}px`;
        el.style.top = `${tipY}px`;
      }
    }
    if (hoveredNode?.id !== slice.id) {
      setHoveredNode(slice);
    }
  };

  const activeFocusNode = nodes.find(n => n.id === currentRootId);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div
      className="w-full h-full flex flex-col md:flex-row relative select-none"
      style={{ background: bgColor }}
      onContextMenu={e => e.preventDefault()}
    >
      {/* ── Chart column ─────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        onMouseDown={handleContainerMouseDown}
      >
        {/* ZOOM OUT button */}
        {currentRootId !== rootId && (
          <button
            onClick={() => {
              const p = nodes.find(n => n.id === currentRootId)?.parentId;
              setFocusNodeId(p === rootId ? null : p);
              resetViewport();
            }}
            className={`absolute top-8 left-[250px] z-[100] px-3 py-1.5 rounded-lg border flex items-center gap-1.5 text-[10px] font-black tracking-wider transition-all active:scale-95 ${
              isDark
                ? 'bg-black/40 border-white/10 hover:bg-white/5 text-brand-cyan'
                : 'bg-[#ece8dd]/80 border-[#2E2B27]/20 hover:bg-[#2E2B27]/5 text-[#0891B2]'
            }`}
          >
            <ArrowLeft size={12} />
            <span>ZOOM OUT</span>
          </button>
        )}

        {/*
          The SVG uses viewBox for zoom/pan — NOT a CSS transform wrapper.
          This keeps all text rendered as vectors at the true device resolution
          so labels stay perfectly sharp at every zoom level.
        */}
        <svg
          ref={svgRef}
          viewBox={`${viewport.x} ${viewport.y} ${viewport.w} ${viewport.h}`}
          className="w-full h-full fill-current"
          preserveAspectRatio="xMidYMid meet"
          onMouseLeave={() => setHoveredNode(null)}
        >
          {/* Concentric guide rings */}
          <circle cx={cx} cy={cy} r={innerBaseRadius}               style={{ fill: 'none', stroke: isDark ? 'rgba(0,242,255,0.05)'  : 'rgba(78,90,71,0.08)',  strokeWidth: 0.5 }} />
          <circle cx={cx} cy={cy} r={innerBaseRadius + ringWidth}     style={{ fill: 'none', stroke: isDark ? 'rgba(0,242,255,0.03)'  : 'rgba(78,90,71,0.05)',  strokeWidth: 0.5 }} />
          <circle cx={cx} cy={cy} r={innerBaseRadius + 2 * ringWidth} style={{ fill: 'none', stroke: isDark ? 'rgba(0,242,255,0.015)' : 'rgba(78,90,71,0.03)',  strokeWidth: 0.5 }} />

          {/* Slice fills — sector colour for grouping, entity colour on hover.
               IMPORTANT: fill is set via style (not SVG attribute) so it beats
               Tailwind Preflight's `svg { fill: currentColor }` rule. */}
          <g>
            {/* 1. Render all outer rings (depth > 0) first */}
            {flatSlices.filter(s => s.depth > 0).map(slice => {
              const { r0, r1 } = getRadius(slice.depth);
              const pathD = getArcPath(r0, r1, slice.startAngle, slice.endAngle);
              const entityColor = (ENTITY_TYPES[slice.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT).color;
              const isHov      = hoveredNode?.id === slice.id;
              let fillOp       = getFillOpacity(slice.depth, isHov);
              const activeFill = entityColor;

              let isDimmed = false;
              if (matchingNodeIds) {
                isDimmed = !matchingNodeIds.has(slice.id);
              }

              if (isDimmed) {
                fillOp = fillOp * 0.15;
              } else if (matchingNodeIds) {
                fillOp = Math.min(1.0, fillOp * 2.2 + 0.2);
              }

              return (
                <path
                  key={`slice-${slice.id}`}
                  d={pathD}
                  fillRule="evenodd"
                  style={{
                    fill:        activeFill,
                    fillOpacity: fillOp,
                    stroke:      separatorStroke,
                    strokeWidth: isHov ? 1.5 : 0.9,
                    transition:  'fill 0.15s, fill-opacity 0.15s',
                    cursor:      'pointer',
                    fillRule:    'evenodd',
                  }}
                  onClick={e => handleSliceClick(e, slice)}
                  onMouseMove={e => handleSliceMouseMove(e, slice)}
                />
              );
            })}

            {/* 2. Render center hub (depth === 0) on top of outer rings */}
            {flatSlices.filter(s => s.depth === 0).map(slice => {
              const entityColor = (ENTITY_TYPES[slice.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT).color;
              const isHov      = hoveredNode?.id === slice.id;
              let fillOp       = getFillOpacity(slice.depth, isHov);
              const activeFill = entityColor;

              let isDimmed = false;
              if (matchingNodeIds) {
                isDimmed = !matchingNodeIds.has(slice.id);
              }

              if (isDimmed) {
                fillOp = fillOp * 0.15;
              } else if (matchingNodeIds) {
                fillOp = Math.min(1.0, fillOp * 2.2 + 0.2);
              }

              return (
                <circle
                  key={`slice-${slice.id}`}
                  cx={cx}
                  cy={cy}
                  r={innerBaseRadius}
                  style={{
                    fill:        activeFill,
                    fillOpacity: fillOp,
                    stroke:      separatorStroke,
                    strokeWidth: isHov ? 1.5 : 0.9,
                    transition:  'fill 0.15s, fill-opacity 0.15s',
                    cursor:      'pointer',
                  }}
                  onClick={e => handleSliceClick(e, slice)}
                  onMouseMove={e => handleSliceMouseMove(e, slice)}
                />
              );
            })}
          </g>

           {/* Hover edge glow and '+' offshoot button on outer edge */}
           {hoveredNode && (() => {
             const slice = flatSlices.find(s => s.id === hoveredNode.id);
             if (!slice) return null;
             const { r0, r1 } = getRadius(slice.depth);
             const pathD = getArcPath(r0, r1, slice.startAngle, slice.endAngle);
             const color = (ENTITY_TYPES[slice.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT).color;

             // Calculate '+' button coordinates on the outer edge of the slice
             const midAngle = (slice.startAngle + slice.endAngle) / 2;
             const buttonX = cx + r1 * Math.cos(midAngle);
             const buttonY = cy + r1 * Math.sin(midAngle);

             return (
               <g>
                 {/* Edge Glow */}
                 <path d={pathD} style={{ fill: 'none', stroke: color, strokeWidth: 2, strokeOpacity: 0.9 }} pointerEvents="none" />
                 
                 {/* Offshoot Button (only on non-root nodes) */}
                 {slice.depth > 0 && (
                   <g 
                     className="cursor-pointer group"
                     onClick={(e) => {
                       e.stopPropagation();
                       if (onAddOffshoot) {
                         onAddOffshoot(slice.id);
                       }
                     }}
                   >
                     {/* Background circle with drop shadow and hover scaling */}
                     <circle 
                       cx={buttonX} 
                       cy={buttonY} 
                       r={7.5} 
                       style={{ 
                         fill: isDark ? '#111318' : '#ffffff', 
                         stroke: color, 
                         strokeWidth: 1.5,
                         filter: 'drop-shadow(0px 1px 3px rgba(0,0,0,0.4))',
                         transformOrigin: `${buttonX}px ${buttonY}px`,
                         transition: 'transform 0.2s ease'
                       }} 
                       className="group-hover:scale-125"
                     />
                     {/* Plus sign lines */}
                     <line 
                       x1={buttonX - 3} y1={buttonY} x2={buttonX + 3} y2={buttonY} 
                       style={{ 
                         stroke: color, 
                         strokeWidth: 1.5,
                         transformOrigin: `${buttonX}px ${buttonY}px`,
                         transition: 'transform 0.2s ease'
                       }} 
                       className="group-hover:scale-125"
                     />
                     <line 
                       x1={buttonX} y1={buttonY - 3} x2={buttonX} y2={buttonY + 3} 
                       style={{ 
                         stroke: color, 
                         strokeWidth: 1.5,
                         transformOrigin: `${buttonX}px ${buttonY}px`,
                         transition: 'transform 0.2s ease'
                       }} 
                       className="group-hover:scale-125"
                     />
                   </g>
                 )}
               </g>
             );
           })()}

          {/* Secondary transverse links */}
          <g pointerEvents="none">
            {secondaryPaths.map(p => {
              let opacity = 0.45;
              if (selectedNode) {
                const isLinkConnected = p.fromId === selectedNode.id || p.toId === selectedNode.id;
                opacity = isLinkConnected ? 0.75 : 0.05;
              } else if (matchingNodeIds) {
                const bothMatch = matchingNodeIds.has(p.fromId) && matchingNodeIds.has(p.toId);
                opacity = bothMatch ? 0.75 : 0.05;
              }
              return (
                <path key={p.id} d={p.d} style={{ fill: 'none', stroke: p.color, strokeWidth: 1.5, strokeDasharray: '4,4', strokeOpacity: opacity }} />
              );
            })}
          </g>

          {/* Labels — rotated tspan text centred in each arc slice */}
          <g pointerEvents="none">
            {flatSlices.map(slice => {
              const wrapLabel = (title, maxChars) => {
                if (title.length <= maxChars) return [title];
                const words = title.split(' ');
                const lines = [''];
                words.forEach(w => {
                  const candidate = lines[lines.length - 1]
                    ? lines[lines.length - 1] + ' ' + w
                    : w;
                  if (candidate.length > maxChars && lines[lines.length - 1]) {
                    lines.push(w);
                  } else {
                    lines[lines.length - 1] = candidate;
                  }
                });
                return lines.slice(0, 5);
              };

              const fillStyle = { fill: isDark ? 'rgba(255,255,255,0.92)' : 'rgba(46,43,39,0.94)' };
              const LINE_H    = 8.5;

              // ── Centre hub label ─────────────────────────────────────────
              if (slice.depth === 0) {
                const lines = wrapLabel(slice.title, 14);
                return (
                  <text
                    key={`lbl-${slice.id}`}
                    x={cx} y={cy}
                    textAnchor="middle" dominantBaseline="middle"
                    style={{ ...fillStyle, fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', pointerEvents: 'none' }}
                  >
                    {lines.map((line, i) => (
                      <tspan key={i} x={cx} dy={i === 0 ? `${-(lines.length - 1) * LINE_H / 2}` : `${LINE_H}`}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                );
              }

              // ── Arc slice labels ─────────────────────────────────────────
              const { r0, r1 } = getRadius(slice.depth);
              const theta  = (slice.startAngle + slice.endAngle) / 2;
              const sweep  = slice.endAngle - slice.startAngle;

              // Arc length available along the mid-radius
              const rm     = (r0 + r1) / 2;
              const arcLen = rm * sweep;
              if (arcLen < 8) return null;   // too tiny to label

              const lx     = cx + rm * Math.cos(theta);
              const ly     = cy + rm * Math.sin(theta);

              // Rotate so text runs radially outward; flip in lower half so it's never upside-down
              let rotDeg = (theta * 180) / Math.PI;
              if (rotDeg > 90 && rotDeg < 270) rotDeg += 180;

              // Chars that fit across the ring width (radial direction after rotation)
              // ringWidth is the radial depth; at 7px font ~0.55× char width ratio
              const fontSize = Math.max(5.5, Math.min(7.5, arcLen / 2.2));
              const charsPerLine = Math.max(5, Math.floor(ringWidth / (fontSize * 0.56)));

              const lines = wrapLabel(slice.title, charsPerLine);

              return (
                <text
                  key={`lbl-${slice.id}`}
                  x={lx} y={ly}
                  textAnchor="middle" dominantBaseline="middle"
                  transform={`rotate(${rotDeg}, ${lx}, ${ly})`}
                  style={{ ...fillStyle, fontSize: `${fontSize}px`, fontWeight: 700, letterSpacing: '0.01em' }}
                >
                  {lines.map((line, i) => (
                    <tspan
                      key={i}
                      x={lx}
                      dy={i === 0 ? `${-(lines.length - 1) * LINE_H / 2}` : `${LINE_H}`}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
              );
            })}
          </g>
        </svg>

        {/* Floating tooltip — positioned in screen space relative to containerRef */}
        <AnimatePresence>
          {hoveredNode && (
            <motion.div
              id="sunburst-tooltip"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.12 }}
              className={`absolute pointer-events-none p-3 backdrop-blur-xl border rounded-[14px] shadow-3xl w-56 flex flex-col gap-1.5 text-left z-[500] ${
                isDark ? 'bg-black/80 border-white/10' : 'bg-[#ece8dd]/95 border-[#2E2B27]/15'
              }`}
              style={{ left: '-9999px', top: '-9999px' }}
            >
              <div className="flex justify-between items-center">
                <span
                  className="text-[7.5px] font-black uppercase tracking-[0.15em] px-1.5 py-0.5 rounded border"
                  style={{
                    color:           (ENTITY_TYPES[hoveredNode.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT).color,
                    borderColor:     `${(ENTITY_TYPES[hoveredNode.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT).color}30`,
                    backgroundColor: `${(ENTITY_TYPES[hoveredNode.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT).color}10`,
                  }}
                >
                  {hoveredNode.type}
                </span>
                <span className={`text-[7px] font-mono ${mutedColor}`}>DEPTH {hoveredNode.depth}</span>
              </div>
              <h4 className={`text-xs font-black tracking-tight leading-snug ${textColor}`}>
                {hoveredNode.title}
              </h4>
              <p className={`text-[9.5px] leading-normal font-medium ${mutedColor}`}>
                {getShortSummary(hoveredNode.content?.['Definition Summary']) || hoveredNode.content?.Summary || 'Hierarchy category branch.'}
              </p>
              {hoveredNode.children?.length > 0 ? (
                <div className={`border-t pt-1.5 mt-0.5 flex justify-between items-center text-[7px] font-bold uppercase tracking-wider ${
                  isDark ? 'border-white/5 text-brand-cyan/80' : 'border-[#2E2B27]/10 text-[#0891B2]'
                }`}>
                  <span>Single-click to drill in</span>
                  <span>{hoveredNode.children.length} branches</span>
                </div>
              ) : (
                <div className={`border-t pt-1.5 mt-0.5 text-[7px] font-bold uppercase tracking-wider ${
                  isDark ? 'border-white/5 text-slate-500' : 'border-[#2E2B27]/10 text-[#6A645D]'
                }`}>
                  Double-click to open details
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

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

      {/* ── Right sidebar — premium glassmorphic panel ─────────────────── */}
      <div
        className={`w-full md:w-80 border-t md:border-t-0 md:border-l ${borderCol} flex flex-col gap-4 overflow-y-auto`}
        style={{
          background:    isDark ? 'rgba(4,8,18,0.70)' : 'rgba(244,239,229,0.80)',
          backdropFilter: 'blur(20px)',
          paddingTop: '40px', // clears left-sidebar overlay zone
          paddingLeft: '20px',
          paddingRight: '20px',
          paddingBottom: '20px',
        }}
      >
        {/* ── Hero: Active node card ─── */}
        {(() => {
          const nodeColor = activeFocusNode
            ? (ENTITY_TYPES[activeFocusNode.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT).color
            : (isDark ? '#00F2FF' : '#0891B2');

          return (
            <div
              className={`relative overflow-hidden rounded-2xl border p-5 flex flex-col gap-2`}
              style={{
                borderColor: `${nodeColor}25`,
                background:  isDark
                  ? `linear-gradient(135deg, rgba(4,8,18,0.9) 0%, rgba(${nodeColor.replace('#','').match(/.{2}/g).map(h=>parseInt(h,16)).join(',')},0.06) 100%)`
                  : `linear-gradient(135deg, rgba(255,255,255,0.6) 0%, rgba(${nodeColor.replace('#','').match(/.{2}/g).map(h=>parseInt(h,16)).join(',')},0.04) 100%)`,
              }}
            >
              {/* Radial glow accent */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: `radial-gradient(circle at 20% 30%, ${nodeColor}14, transparent 70%)` }}
              />

              {/* Type badge + label */}
              <div className="flex items-center justify-between gap-2 relative">
                <span
                  className="text-[7px] font-black uppercase tracking-[0.18em] px-2 py-0.5 rounded-full border"
                  style={{ color: nodeColor, borderColor: `${nodeColor}35`, background: `${nodeColor}12` }}
                >
                  {activeFocusNode?.type || 'Organisation'}
                </span>
                <span
                  className="text-[7px] font-black uppercase tracking-[0.18em]"
                  style={{ color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(46,43,39,0.35)' }}
                >
                  Active Perspective
                </span>
              </div>

              {/* Title */}
              <h2
                className="text-lg font-black tracking-tight leading-tight relative"
                style={{ color: isDark ? '#ffffff' : '#1a1713' }}
              >
                {activeFocusNode?.title || 'Turner & Townsend Group'}
              </h2>

              {/* Description */}
              <p
                className="text-[9.5px] leading-relaxed relative"
                style={{ color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(46,43,39,0.60)' }}
              >
                {activeFocusNode?.content?.['Definition Summary']
                  || 'Exploring the global organisational framework and strategic service segments.'}
              </p>
            </div>
          );
        })()}

        {/* ── Stats grid ─── */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Nodes', value: flatSlices.length },
            { label: 'Layers', value: flatSlices.reduce((m, s) => Math.max(m, s.depth), 0) },
            { label: 'Links', value: secondaryPaths.length },
          ].map(stat => (
            <div
              key={stat.label}
              className={`flex flex-col items-center justify-center p-3 rounded-xl border gap-0.5`}
              style={{
                borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(46,43,39,0.10)',
                background:  isDark ? 'rgba(255,255,255,0.03)' : 'rgba(46,43,39,0.03)',
              }}
            >
              <span
                className="text-2xl font-black tracking-tighter leading-none"
                style={{ color: isDark ? '#ffffff' : '#1a1713' }}
              >
                {stat.value}
              </span>
              <span
                className="text-[7.5px] font-bold uppercase tracking-wider"
                style={{ color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(46,43,39,0.45)' }}
              >
                {stat.label}
              </span>
            </div>
          ))}
        </div>

        {/* ── Interactivity guide ─── */}
        <div className="flex-1 flex flex-col justify-end gap-2 pt-2">
          <div
            className={`rounded-2xl border p-4`}
            style={{
              borderColor: isDark ? 'rgba(0,242,255,0.10)' : 'rgba(46,43,39,0.10)',
              background:  isDark ? 'rgba(0,242,255,0.03)' : 'rgba(46,43,39,0.03)',
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Layers size={13} style={{ color: isDark ? '#00F2FF' : '#0891B2', flexShrink: 0 }} />
              <span
                className="text-[8px] font-black uppercase tracking-[0.15em]"
                style={{ color: isDark ? '#00F2FF' : '#0891B2' }}
              >
                Interactivity Guide
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {[
                { key: 'Scroll wheel',    desc: 'zoom in / out at cursor' },
                { key: 'Right-click',     desc: 'hold + drag to pan' },
                { key: 'Single click',    desc: 'drill into branch' },
                { key: 'Double click',    desc: 'open node details' },
                { key: 'ZOOM OUT',        desc: 'navigate up one level' },
              ].map(item => (
                <li key={item.key} className="flex items-baseline gap-1.5 text-[9px]">
                  <span
                    className="font-bold shrink-0"
                    style={{ color: isDark ? '#00F2FF' : '#0891B2' }}
                  >
                    {item.key}
                  </span>
                  <span style={{ color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(46,43,39,0.55)' }}>
                    — {item.desc}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
