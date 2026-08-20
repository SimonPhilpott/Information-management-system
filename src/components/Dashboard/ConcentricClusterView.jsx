import React, { useState, useMemo } from 'react';
import { Database } from 'lucide-react';
import { MESHES } from '../../data/mesh_authority';

/**
 * ConcentricClusterView Component
 * Renders a dark-theme polar/concentric cluster graph based on Image 1 (Adobe Stock #248681792).
 * Features nested orbital rings (360-degree ticks, polar scatter nodes, radial stems, interactive hover tooltips).
 */
export default function ConcentricClusterView({ theme = 'dark', focusedNodeId = null, nodes = null }) {
  const isDark = theme !== 'light';
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('ALL');

  // Map live Graph Database nodes to radial/polar coordinates across concentric rings
  const polarData = useMemo(() => {
    const rawNodes = (nodes && nodes.length > 0) ? nodes : MESHES;
    const activeNodes = rawNodes.slice(0, 160);
    const types = ['CONCEPT', 'PATTERN', 'PROCEDURE', 'RULE', 'VARIANT', 'SCENARIO'];
    
    return activeNodes.map((node, index) => {
      // Angular placement grouped by category sector & parent hierarchy
      const typeIdx = types.indexOf(node.type?.toUpperCase()) !== -1 ? types.indexOf(node.type?.toUpperCase()) : (index % 6);
      const sectorBaseAngle = typeIdx * 60;
      const angle = (sectorBaseAngle + (index * 17) % 55) % 360;
      const radians = (angle - 90) * (Math.PI / 180);
      
      // Ring Radius maps directly to Importance Tier (T1 Critical = innermost ring, T5 = outermost)
      const tierNum = parseInt((node.tier || 'T3').replace('T', ''), 10) || 3;
      const radius = 80 + (tierNum - 1) * 48 + ((index * 5) % 18);
      
      const x = Math.cos(radians) * radius;
      const y = Math.sin(radians) * radius;

      const outerStemLength = 15 + ((index * 13) % 45);

      return {
        ...node,
        angle,
        radius,
        x,
        y,
        outerStemLength,
        typeIdx,
        type: node.type ? node.type.toUpperCase() : types[typeIdx],
        tier: node.tier || `T${tierNum}`
      };
    });
  }, [nodes]);

  const typeColors = {
    CONCEPT: '#00f2ff',
    PATTERN: '#a855f7',
    PROCEDURE: '#f97316',
    RULE: '#22c55e',
    VARIANT: '#64748b',
    SCENARIO: '#ef4444'
  };

  const filteredNodes = useMemo(() => {
    if (selectedTypeFilter === 'ALL') return polarData;
    return polarData.filter(n => n.type === selectedTypeFilter);
  }, [polarData, selectedTypeFilter]);

  const activeFocusNode = polarData.find(n => n.id === focusedNodeId) || hoveredNode;

  return (
    <div className={`w-full h-full flex flex-col relative overflow-hidden font-sans ${
      isDark ? 'bg-[#060c16] text-slate-100' : 'bg-[#0a1526] text-slate-100'
    }`}>
      {/* Top Header Bar */}
      <div className="px-6 py-4 border-b border-cyan-500/20 bg-slate-950/60 backdrop-blur-md flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Database size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black tracking-wider uppercase text-cyan-400">
                Concentric Cluster Analyzer
              </h2>
              <span className="px-2 py-0.5 rounded text-[9px] font-black tracking-widest bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 uppercase">
                Polar Orbit Engine
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              High-density radial node cluster visualization with 360° coordinate ticks &amp; multi-orbit hierarchy.
            </p>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-white/10">
          {['ALL', 'CONCEPT', 'PATTERN', 'PROCEDURE', 'RULE', 'VARIANT', 'SCENARIO'].map(type => (
            <button
              key={type}
              onClick={() => setSelectedTypeFilter(type)}
              className={`px-2.5 py-1 rounded-lg text-[9.5px] font-black tracking-wider uppercase transition-all ${
                selectedTypeFilter === type
                  ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <svg className="w-full h-full max-w-[850px] max-h-[850px] overflow-visible" viewBox="-350 -350 700 700">
          <defs>
            {/* Cyan Radial Glow */}
            <radialGradient id="centerGlow" cx="0%" cy="0%" r="50%">
              <stop offset="0%" stopColor="#00f2ff" stopOpacity="0.25" />
              <stop offset="60%" stopColor="#00f2ff" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#060c16" stopOpacity="0" />
            </radialGradient>
            <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background Ambient Radial Glow */}
          <circle cx="0" cy="0" r="320" fill="url(#centerGlow)" />

          {/* Concentric Orbital Ring Guides */}
          {[90, 128, 166, 204, 242, 280, 318].map((radius, idx) => (
            <g key={radius}>
              <circle
                cx="0"
                cy="0"
                r={radius}
                fill="none"
                stroke="#00f2ff"
                strokeOpacity={0.12 - idx * 0.015}
                strokeWidth={idx === 5 ? 1.5 : 1}
                strokeDasharray={idx % 2 === 1 ? "3 3" : "none"}
              />
            </g>
          ))}

          {/* Radial Axis Rays (Degree Dividers every 30 deg) */}
          {Array.from({ length: 12 }).map((_, i) => {
            const deg = i * 30;
            const rad = (deg - 90) * (Math.PI / 180);
            const x2 = Math.cos(rad) * 335;
            const y2 = Math.sin(rad) * 335;
            return (
              <g key={deg}>
                <line
                  x1="0"
                  y1="0"
                  x2={x2}
                  y2={y2}
                  stroke="#00f2ff"
                  strokeOpacity="0.08"
                  strokeWidth="1"
                />
                {/* Degree Label Ticks */}
                <text
                  x={Math.cos(rad) * 300}
                  y={Math.sin(rad) * 300}
                  fill="#00f2ff"
                  fillOpacity="0.4"
                  fontSize="8"
                  fontWeight="800"
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="font-mono"
                >
                  {String(deg).padStart(3, '0')}°
                </text>
              </g>
            );
          })}

          {/* Outer Perimeter Spike Stems (Image 1 Style Header/Spikes) */}
          {Array.from({ length: 72 }).map((_, i) => {
            const deg = i * 5;
            const rad = (deg - 90) * (Math.PI / 180);
            const rInner = 320;
            const length = 8 + ((i * 17) % 24);
            const rOuter = rInner + length;

            const x1 = Math.cos(rad) * rInner;
            const y1 = Math.sin(rad) * rInner;
            const x2 = Math.cos(rad) * rOuter;
            const y2 = Math.sin(rad) * rOuter;

            return (
              <g key={i}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#00f2ff"
                  strokeOpacity={i % 3 === 0 ? "0.4" : "0.15"}
                  strokeWidth={i % 3 === 0 ? "1.5" : "1"}
                />
                {i % 3 === 0 && (
                  <circle
                    cx={x2}
                    cy={y2}
                    r="1.5"
                    fill="#00f2ff"
                    fillOpacity="0.6"
                  />
                )}
              </g>
            );
          })}

          {/* Node Clusters & Spoke Dots */}
          {filteredNodes.map((n) => {
            const color = typeColors[n.type] || '#00f2ff';
            const isHovered = hoveredNode?.id === n.id;
            const isFocused = focusedNodeId === n.id;
            const isHighlighted = isHovered || isFocused;

            return (
              <g
                key={n.id}
                className="cursor-pointer transition-transform duration-200"
                onMouseEnter={() => setHoveredNode(n)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {/* Stem line from origin to node */}
                <line
                  x1="0"
                  y1="0"
                  x2={n.x}
                  y2={n.y}
                  stroke={color}
                  strokeOpacity={isHighlighted ? "0.6" : "0.1"}
                  strokeWidth={isHighlighted ? "1.5" : "0.75"}
                  strokeDasharray={isHighlighted ? "none" : "2 2"}
                />

                {/* Node Circle */}
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={isHighlighted ? 6 : 3.5}
                  fill={color}
                  fillOpacity={isHighlighted ? 1 : 0.75}
                  filter={isHighlighted ? "url(#nodeGlow)" : "none"}
                />

                {/* Outer Ring on Focus/Hover */}
                {isHighlighted && (
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r="11"
                    fill="none"
                    stroke={color}
                    strokeWidth="1.5"
                    className="animate-ping"
                  />
                )}
              </g>
            );
          })}

          {/* Center Hub Core */}
          <circle cx="0" cy="0" r="48" fill="#030712" stroke="#00f2ff" strokeWidth="2" filter="url(#nodeGlow)" />
          <circle cx="0" cy="0" r="42" fill="none" stroke="#00f2ff" strokeWidth="1" strokeDasharray="4 2" />
          <text
            x="0"
            y="-4"
            fill="#ffffff"
            fontSize="12"
            fontWeight="900"
            letterSpacing="0.12em"
            textAnchor="middle"
            className="uppercase"
          >
            DATA
          </text>
          <text
            x="0"
            y="10"
            fill="#00f2ff"
            fontSize="8"
            fontWeight="800"
            letterSpacing="0.08em"
            textAnchor="middle"
            className="uppercase font-mono"
          >
            CONCENTRIC GRAPH
          </text>
        </svg>
      </div>

      {/* Floating Inspector Panel for Hovered/Focused Node */}
      {activeFocusNode && (
        <div className="absolute bottom-6 right-6 w-80 p-4 rounded-2xl bg-slate-950/90 border border-cyan-500/30 backdrop-blur-xl shadow-2xl z-20 flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between">
            <span
              className="px-2 py-0.5 rounded text-[9px] font-black tracking-wider uppercase"
              style={{
                background: `${typeColors[activeFocusNode.type]}20`,
                color: typeColors[activeFocusNode.type],
                border: `1px solid ${typeColors[activeFocusNode.type]}40`
              }}
            >
              {activeFocusNode.type}
            </span>
            <span className="text-[10px] font-mono text-slate-400 font-bold">
              ID: {activeFocusNode.id}
            </span>
          </div>

          <h3 className="text-sm font-extrabold text-white leading-snug">
            {activeFocusNode.title}
          </h3>

          <p className="text-[11px] text-slate-300 leading-relaxed">
            {activeFocusNode.content?.['Definition Summary'] || 
             activeFocusNode.content?.Description || 
             "Node positioned on polar coordinate orbit within the Graph Database."}
          </p>

          <div className="mt-1 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span>Radius: {Math.round(activeFocusNode.radius)}px</span>
            <span>Angle: {Math.round(activeFocusNode.angle)}°</span>
            <span className="text-cyan-400 font-bold">{activeFocusNode.tier}</span>
          </div>
        </div>
      )}
    </div>
  );
}
