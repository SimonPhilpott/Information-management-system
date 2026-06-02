import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ENTITY_TYPES } from '../../data/nodes';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Layers } from 'lucide-react';

/**
 * SunburstCanvas — Interactive radial hierarchy chart for the HIVE:MESH knowledge graph.
 *
 * Interaction model:
 *  • Scroll wheel        → zoom in / out anchored to cursor position
 *  • Right-click drag    → pan the chart
 *  • Left-click a slice  → drill down into that sub-tree
 *  • Click centre ring / ZOOM OUT button → navigate one level back up
 *
 * Colour model:
 *  • Depth 0 (root)      → almost invisible fill, subtle glow ring
 *  • Depth 1+            → entity-type colours at decreasing opacity per depth ring,
 *                          separated by high-contrast separator strokes that
 *                          automatically adapt to the active light/dark theme.
 */
export const SunburstCanvas = ({
  // meshRef / view kept in signature for API compatibility but NOT used —
  // this component manages its own pan/zoom transform independently.
  meshRef,
  view,
  nodes = [],
  onSelectNode,
  theme = 'dark',
}) => {
  const isDark      = theme !== 'light';
  const bgColor     = isDark ? '#000000' : '#ece8dd';
  const textColor   = isDark ? 'text-white' : 'text-[#2E2B27]';
  const mutedColor  = isDark ? 'text-slate-400' : 'text-[#6A645D]';
  const borderCol   = isDark ? 'border-white/10' : 'border-[#2E2B27]/15';

  // ── Local state ─────────────────────────────────────────────────────────────
  const [focusNodeId, setFocusNodeId] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [tooltipPos, setTooltipPos]   = useState({ x: 0, y: 0 });

  /** Self-contained SVG pan / zoom transform — independent of App-level view */
  const [svgTransform, setSvgTransform] = useState({ x: 0, y: 0, scale: 1 });

  /**
   * Keep a ref in sync with state so pan-start can always read the latest
   * transform value without needing it in a closure / dependency array.
   */
  const svgTransformRef = useRef({ x: 0, y: 0, scale: 1 });
  svgTransformRef.current = svgTransform;

  const containerRef = useRef(null); // The chart column <div>
  const isPanning    = useRef(false);
  const panStartRef  = useRef({ mouseX: 0, mouseY: 0, startX: 0, startY: 0 });

  const rootId        = 'tt_group';
  const currentRootId = focusNodeId || rootId;

  // ── Wheel zoom — anchored to cursor ─────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e) => {
      e.preventDefault();
      const rect   = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const factor = Math.exp(e.deltaY * -0.0012);

      setSvgTransform(prev => {
        const newScale = Math.min(Math.max(prev.scale * factor, 0.12), 8);
        const ratio    = newScale / prev.scale;
        return {
          x:     mouseX - (mouseX - prev.x) * ratio,
          y:     mouseY - (mouseY - prev.y) * ratio,
          scale: newScale,
        };
      });
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
      startX: svgTransformRef.current.x,
      startY: svgTransformRef.current.y,
    };
  };

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!isPanning.current) return;
      const dx = e.clientX - panStartRef.current.mouseX;
      const dy = e.clientY - panStartRef.current.mouseY;
      setSvgTransform(prev => ({
        ...prev,
        x: panStartRef.current.startX + dx,
        y: panStartRef.current.startY + dy,
      }));
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
      if (!node.children?.length) { node.value = 1; return 1; }
      const sum = node.children.reduce((acc, child) => acc + addWeights(child), 0);
      node.value = sum;
      return sum;
    };

    addWeights(tree);
    return tree;
  }, [nodes, currentRootId]);

  // ── Angle assignment ─────────────────────────────────────────────────────────
  const flatSlices = useMemo(() => {
    if (!treeData) return [];
    const slices = [];

    /**
     * Each depth-1 segment establishes a "sector colour" derived from its
     * entity type. That colour is passed down to every descendant so that
     * nodes in the same branch share a common hue — making relationships
     * visually obvious at a glance. Opacity decreases with depth so the
     * hierarchy reads like a gentle gradient from vivid → whisper.
     */
    const assignAngles = (node, startAngle = 0, endAngle = 2 * Math.PI, depth = 0, sectorColor = null) => {
      // At depth 1 the node anchors the sector hue; children inherit it.
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
  const ringWidth       = 75;

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
            d:     `M ${p1.x} ${p1.y} Q ${ctrlX} ${ctrlY} ${p2.x} ${p2.y}`,
            color: (ENTITY_TYPES[slice.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT).color,
          });
        }
      });
    });
    return paths;
  }, [flatSlices, sliceCenters]);

  // ── Colour helpers ───────────────────────────────────────────────────────────
  /**
   * Faint background tints that fade with depth — enough to show which
   * branch a node belongs to without obscuring the premium black / parchment
   * background. On hover the fill lifts to show the node's own entity colour.
   *
   * Depth 1 (inner ring) → most visible (anchors the sector hue).
   * Each additional ring loses ~25 % opacity so outer nodes whisper their colour.
   */
  const getFillOpacity = (depth, isHovered) => {
    if (depth === 0) return isDark ? 0.04 : 0.07;
    if (isHovered)   return isDark ? 0.72 : 0.82;
    // Faint, hierarchy-aware background tints
    const darkLevels  = [0.22, 0.16, 0.12, 0.09, 0.07];
    const lightLevels = [0.28, 0.21, 0.15, 0.11, 0.08];
    const table       = isDark ? darkLevels : lightLevels;
    return table[Math.min(depth - 1, table.length - 1)];
  };

  /**
   * Separator stroke between adjacent slices.
   * Dark theme → almost-black hairline so colours feel like self-contained cells.
   * Light theme → white hairline on the warm background for crisp separation.
   */
  const separatorStroke = isDark
    ? 'rgba(8, 12, 20, 0.92)'
    : 'rgba(255, 255, 255, 0.92)';

  // ── Interaction handlers ─────────────────────────────────────────────────────
  const handleSliceClick = (slice) => {
    if (slice.depth === 0) {
      const node = nodes.find(n => n.id === currentRootId);
      if (node?.parentId) setFocusNodeId(node.parentId);
      else if (currentRootId !== rootId) setFocusNodeId(null);
    } else {
      if (slice.children?.length) setFocusNodeId(slice.id);
      if (onSelectNode) onSelectNode(slice);
    }
  };

  /**
   * Track mouse position relative to the chart column div so the tooltip
   * never escapes the visible container and auto-flips near edges.
   */
  const handleSliceMouseMove = (e, slice) => {
    if (isPanning.current) return;
    if (containerRef.current) {
      const bounds = containerRef.current.getBoundingClientRect();
      let tipX = e.clientX - bounds.left + 20;
      let tipY = e.clientY - bounds.top  + 20;
      // Flip left if near right edge
      if (tipX + 240 > bounds.width)  tipX = e.clientX - bounds.left - 252;
      // Flip up if near bottom edge
      if (tipY + 220 > bounds.height) tipY = e.clientY - bounds.top  - 228;
      setTooltipPos({ x: tipX, y: tipY });
    }
    setHoveredNode(slice);
  };

  const activeFocusNode = nodes.find(n => n.id === currentRootId);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div
      className="w-full h-full flex flex-col md:flex-row relative select-none"
      style={{ background: bgColor }}
      onContextMenu={e => e.preventDefault()}
    >
      {/* ── Sunburst chart column ──────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 relative flex items-center justify-center p-4 overflow-hidden"
        onMouseDown={handleContainerMouseDown}
      >
        {/* ZOOM OUT breadcrumb */}
        {currentRootId !== rootId && (
          <button
            onClick={() => {
              const p = nodes.find(n => n.id === currentRootId)?.parentId;
              setFocusNodeId(p === rootId ? null : p);
            }}
            className={`absolute top-6 left-6 z-10 px-3 py-1.5 rounded-lg border flex items-center gap-1.5 text-[10px] font-black tracking-wider transition-all active:scale-95 ${
              isDark
                ? 'bg-black/40 border-white/10 hover:bg-white/5 text-brand-cyan'
                : 'bg-[#ece8dd]/80 border-[#2E2B27]/20 hover:bg-[#2E2B27]/5 text-[#0891B2]'
            }`}
          >
            <ArrowLeft size={12} />
            <span>ZOOM OUT</span>
          </button>
        )}

        {/* Pan / zoom transformable wrapper */}
        <div
          className="w-full h-full flex items-center justify-center origin-top-left will-change-transform"
          style={{ transform: `translate3d(${svgTransform.x}px, ${svgTransform.y}px, 0) scale(${svgTransform.scale})` }}
        >
          <svg
            viewBox="0 0 900 800"
            className="w-full max-h-[85vh] filter drop-shadow-3xl"
            onMouseLeave={() => setHoveredNode(null)}
          >
            {/* Concentric guide rings */}
            <circle cx={cx} cy={cy} r={innerBaseRadius}             fill="none" stroke={isDark ? 'rgba(0,242,255,0.05)'  : 'rgba(78,90,71,0.08)'}  strokeWidth={1} />
            <circle cx={cx} cy={cy} r={innerBaseRadius + ringWidth}   fill="none" stroke={isDark ? 'rgba(0,242,255,0.03)'  : 'rgba(78,90,71,0.05)'}  strokeWidth={1} />
            <circle cx={cx} cy={cy} r={innerBaseRadius + 2 * ringWidth} fill="none" stroke={isDark ? 'rgba(0,242,255,0.015)' : 'rgba(78,90,71,0.03)'}  strokeWidth={1} />

            {/* Slice fills — sector colour for grouping, entity colour for hover */}
            <g>
              {flatSlices.map(slice => {
                const { r0, r1 } = getRadius(slice.depth);
                const pathD = getArcPath(r0, r1, slice.startAngle, slice.endAngle);

                // entityColor: this node's own type — used for hover glow only
                const entityColor = (ENTITY_TYPES[slice.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT).color;

                // sectorColor: the inherited depth-1 ancestor hue — used for the
                // faint background fill so all related nodes share the same tint.
                const fillColor = slice.sectorColor || entityColor;

                const isHov  = hoveredNode?.id === slice.id;
                const fillOp = getFillOpacity(slice.depth, isHov);

                // On hover, lift the fill with the node's own entity colour for precision.
                const activeFill = isHov ? entityColor : fillColor;

                return (
                  <path
                    key={`slice-${slice.id}`}
                    d={pathD}
                    fill={activeFill}
                    fillOpacity={fillOp}
                    stroke={separatorStroke}
                    strokeWidth={isHov ? 1.5 : 0.9}
                    className="transition-all duration-200 cursor-pointer"
                    onClick={() => handleSliceClick(slice)}
                    onMouseMove={e => handleSliceMouseMove(e, slice)}
                  />
                );
              })}
            </g>

            {/* Hovered ring highlight — rendered on top for crisp glow */}
            {hoveredNode && (() => {
              const slice      = hoveredNode;
              const { r0, r1 } = getRadius(slice.depth);
              const pathD      = getArcPath(r0, r1, slice.startAngle, slice.endAngle);
              const color      = (ENTITY_TYPES[slice.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT).color;
              return (
                <path
                  d={pathD}
                  fill="none"
                  stroke={color}
                  strokeWidth={2.5}
                  strokeOpacity={0.85}
                  pointerEvents="none"
                />
              );
            })()}

            {/* Glowing transverse / secondary links */}
            <g pointerEvents="none">
              {secondaryPaths.map(p => (
                <path
                  key={p.id}
                  d={p.d}
                  fill="none"
                  stroke={p.color}
                  strokeWidth={1.5}
                  strokeDasharray="4,4"
                  strokeOpacity={0.45}
                  className="animate-pulse"
                />
              ))}
            </g>

            {/* Ring labels */}
            <g pointerEvents="none">
              {flatSlices.map(slice => {
                if (slice.depth === 0) {
                  return (
                    <text
                      key={`label-${slice.id}`}
                      x={cx} y={cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={isDark ? '#ffffff' : '#2E2B27'}
                      opacity={0.9}
                      style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}
                    >
                      {slice.title.length > 20 ? slice.title.substring(0, 18) + '…' : slice.title}
                    </text>
                  );
                }

                const { r0, r1 } = getRadius(slice.depth);
                const theta      = (slice.startAngle + slice.endAngle) / 2;
                const sweep      = slice.endAngle - slice.startAngle;
                if (sweep < 0.12) return null;

                const rm     = (r0 + r1) / 2;
                const lx     = cx + rm * Math.cos(theta);
                const ly     = cy + rm * Math.sin(theta);
                let rotDeg   = (theta * 180) / Math.PI;
                if (rotDeg > 90 && rotDeg < 270) rotDeg += 180;

                return (
                  <text
                    key={`label-${slice.id}`}
                    x={lx} y={ly}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${rotDeg}, ${lx}, ${ly})`}
                    fill={isDark ? 'rgba(255,255,255,0.90)' : 'rgba(46,43,39,0.93)'}
                    style={{ fontSize: '7px', fontWeight: 700, letterSpacing: '0.02em' }}
                  >
                    {slice.title.length > 15 ? slice.title.substring(0, 13) + '…' : slice.title}
                  </text>
                );
              })}
            </g>
          </svg>
        </div>

        {/* ── Floating glassmorphic tooltip ──────────────────────────────────── */}
        <AnimatePresence>
          {hoveredNode && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.12 }}
              className={`absolute pointer-events-none p-3 backdrop-blur-xl border rounded-[14px] shadow-3xl w-56 flex flex-col gap-1.5 text-left z-[500] ${
                isDark
                  ? 'bg-black/80 border-white/10'
                  : 'bg-[#ece8dd]/95 border-[#2E2B27]/15'
              }`}
              style={{ left: tooltipPos.x, top: tooltipPos.y }}
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
                {hoveredNode.content?.['Definition Summary'] || 'Hierarchy category branch.'}
              </p>
              {hoveredNode.children?.length > 0 && (
                <div className={`border-t pt-1.5 mt-0.5 flex justify-between items-center text-[7px] font-bold uppercase tracking-wider ${
                  isDark ? 'border-white/5 text-brand-cyan/80' : 'border-[#2E2B27]/10 text-[#0891B2]'
                }`}>
                  <span>Contains</span>
                  <span>{hoveredNode.children.length} branches</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Right sidebar ──────────────────────────────────────────────────── */}
      <div className={`w-full md:w-80 border-t md:border-t-0 md:border-l ${borderCol} p-6 flex flex-col gap-6`}
           style={{ background: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.18)' }}>

        {/* Active perspective */}
        <div className="flex flex-col gap-1.5">
          <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${isDark ? 'text-brand-cyan' : 'text-[#0891B2]'}`}>
            Active Perspective
          </span>
          <h2 className={`text-xl font-bold tracking-tighter leading-none ${textColor}`}>
            {activeFocusNode?.title || 'Turner & Townsend Group'}
          </h2>
          <p className={`text-[10px] ${mutedColor} leading-relaxed`}>
            {activeFocusNode?.content?.['Definition Summary'] || 'Exploring the global organisational framework and strategic service segments.'}
          </p>
        </div>

        {/* Stats */}
        <div className={`flex flex-col gap-3 p-4 rounded-2xl border ${borderCol}`}
             style={{ background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)' }}>
          <div className="flex justify-between items-center">
            <span className={`text-[9px] font-bold ${mutedColor}`}>Total Branch Elements</span>
            <span className={`font-mono text-xs font-bold ${textColor}`}>{treeData?.value || 0}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className={`text-[9px] font-bold ${mutedColor}`}>Category Level Depth</span>
            <span className={`font-mono text-xs font-bold ${textColor}`}>
              {flatSlices.reduce((max, s) => Math.max(max, s.depth), 0)} Layers
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className={`text-[9px] font-bold ${mutedColor}`}>Active Secondary Links</span>
            <span className={`font-mono text-xs font-bold ${textColor}`}>{secondaryPaths.length} Nodes</span>
          </div>
        </div>

        {/* Interactivity guide */}
        <div className="flex-1 flex flex-col gap-3 justify-end">
          <div className={`flex items-start gap-3 p-3.5 rounded-2xl border ${borderCol}`}
               style={{ background: isDark ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.04)' }}>
            <Layers className={`shrink-0 mt-0.5 ${isDark ? 'text-brand-cyan' : 'text-[#0891B2]'}`} size={15} />
            <div className="flex flex-col gap-2">
              <span className={`text-[9px] font-bold ${textColor} uppercase tracking-tight`}>
                Interactivity Guide
              </span>
              <ul className={`flex flex-col gap-1.5 text-[9px] ${mutedColor} leading-snug`}>
                <li>
                  <span className={`font-bold ${isDark ? 'text-brand-cyan' : 'text-[#0891B2]'}`}>Scroll wheel</span>
                  {' '}— zoom in / out at cursor
                </li>
                <li>
                  <span className={`font-bold ${isDark ? 'text-brand-cyan' : 'text-[#0891B2]'}`}>Right-click drag</span>
                  {' '}— pan the chart
                </li>
                <li>
                  <span className={`font-bold ${isDark ? 'text-brand-cyan' : 'text-[#0891B2]'}`}>Click a slice</span>
                  {' '}— drill down into that branch
                </li>
                <li>
                  <span className={`font-bold ${isDark ? 'text-brand-cyan' : 'text-[#0891B2]'}`}>Click centre</span>
                  {' '}/ <span className={`font-bold ${isDark ? 'text-brand-cyan' : 'text-[#0891B2]'}`}>ZOOM OUT</span>
                  {' '}— go up one level
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
