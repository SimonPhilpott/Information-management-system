import React, { useState, useMemo } from 'react';
import { Layers, Activity, Sparkles, Circle } from 'lucide-react';
import { MESHES } from '../../data/mesh_authority';

/**
 * ChromaticSpokeView Component
 * Renders a clean light-theme radial spectrum bubble visualization based on Image 2 (Adobe Stock #320658537).
 * Features multi-hue angular spokes, variable-sized translucent node bubbles, and concentric range rings.
 */
export default function ChromaticSpokeView({ theme = 'light', focusedNodeId = null, nodes = null }) {
  const isDark = theme === 'dark';
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedDomain, setSelectedDomain] = useState('ALL');

  // Vibrant spectrum color palette per domain ray (Image 2 style chromatic wheel)
  const spokeColors = [
    '#ef4444', // Red
    '#f97316', // Orange
    '#eab308', // Yellow
    '#84cc16', // Lime
    '#10b981', // Emerald
    '#06b6d4', // Cyan
    '#3b82f6', // Blue
    '#6366f1', // Indigo
    '#a855f7', // Purple
    '#ec4899', // Pink
  ];

  // Group live Graph Database nodes into 10 angular spokes
  const spokeData = useMemo(() => {
    const rawNodes = (nodes && nodes.length > 0) ? nodes : MESHES;
    const activeNodes = rawNodes.slice(0, 160);
    const numSpokes = 10;
    
    return activeNodes.map((node, index) => {
      const spokeIndex = index % numSpokes;
      const angle = (spokeIndex * (360 / numSpokes)) % 360;
      const radians = (angle - 90) * (Math.PI / 180);
      
      // Radius position along the spoke (90px to 330px)
      const step = Math.floor(index / numSpokes);
      const radius = 90 + step * 24 + ((index * 3) % 12);
      
      const x = Math.cos(radians) * radius;
      const y = Math.sin(radians) * radius;
      
      // Bubble sizing directly maps to importance Tier (T1 Critical = largest bubble, T5 Info = smallest)
      const tierStr = node.tier || 'T3';
      const tierWeight = tierStr === 'T1' ? 20 : tierStr === 'T2' ? 16 : tierStr === 'T3' ? 12 : tierStr === 'T4' ? 9 : 6;
      const bubbleRadius = tierWeight;
      
      const spokeColor = spokeColors[spokeIndex];

      return {
        ...node,
        spokeIndex,
        angle,
        radius,
        x,
        y,
        bubbleRadius,
        spokeColor,
        tier: node.tier || `T${(index % 5) + 1}`
      };
    });
  }, []);

  const filteredNodes = useMemo(() => {
    if (selectedDomain === 'ALL') return spokeData;
    const domainIdx = parseInt(selectedDomain, 10);
    return spokeData.filter(n => n.spokeIndex === domainIdx);
  }, [spokeData, selectedDomain]);

  const activeFocusNode = spokeData.find(n => n.id === focusedNodeId) || hoveredNode;

  return (
    <div className={`w-full h-full flex flex-col relative overflow-hidden font-sans ${
      isDark ? 'bg-slate-950 text-slate-100' : 'bg-[#fcfcfd] text-slate-800'
    }`}>
      {/* Header Bar */}
      <div className={`px-6 py-4 border-b flex items-center justify-between z-10 ${
        isDark ? 'border-white/10 bg-slate-900/60 backdrop-blur-md' : 'border-slate-200 bg-white/80 backdrop-blur-md'
      }`}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-pink-500/10 border border-pink-500/30 text-pink-500">
            <Activity size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black tracking-wider uppercase text-slate-800 dark:text-white">
                Chromatic Spoke Spectrum
              </h2>
              <span className="px-2 py-0.5 rounded text-[9px] font-black tracking-widest bg-pink-500/10 text-pink-600 border border-pink-500/20 uppercase">
                Big Data Cluster Wheel
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Multi-color radial spoke distribution with scaled translucent data density bubbles.
            </p>
          </div>
        </div>

        {/* Spoke Selector Pills */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-white/10">
          <button
            onClick={() => setSelectedDomain('ALL')}
            className={`px-2.5 py-1 rounded-lg text-[9.5px] font-black tracking-wider uppercase transition-all ${
              selectedDomain === 'ALL'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-md'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            All Rays
          </button>
          {spokeColors.map((color, i) => (
            <button
              key={i}
              onClick={() => setSelectedDomain(String(i))}
              className="w-5 h-5 rounded-full flex items-center justify-center transition-transform hover:scale-125"
              style={{
                background: color,
                opacity: selectedDomain === 'ALL' || selectedDomain === String(i) ? 1 : 0.25
              }}
              title={`Ray Sector ${i + 1}`}
            />
          ))}
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <svg className="w-full h-full max-w-[850px] max-h-[850px] overflow-visible" viewBox="-350 -350 700 700">
          {/* Concentric Radial Range Rings with Axis Numbers (Image 2 style) */}
          {[100, 160, 220, 280, 340].map((radius, idx) => (
            <g key={radius}>
              <circle
                cx="0"
                cy="0"
                r={radius}
                fill="none"
                stroke={isDark ? "#ffffff" : "#000000"}
                strokeOpacity={isDark ? 0.08 : 0.06}
                strokeWidth="1"
                strokeDasharray="2 4"
              />
              {/* Range Scale Label */}
              <text
                x="6"
                y={-radius}
                fill={isDark ? "#94a3b8" : "#64748b"}
                fontSize="9"
                fontWeight="700"
                fillOpacity="0.5"
                className="font-mono"
              >
                {radius}
              </text>
            </g>
          ))}

          {/* 10 Spoke Ray Lines */}
          {Array.from({ length: 10 }).map((_, i) => {
            const angle = (i * 36) - 90;
            const rad = angle * (Math.PI / 180);
            const x2 = Math.cos(rad) * 350;
            const y2 = Math.sin(rad) * 350;
            const spokeColor = spokeColors[i];

            return (
              <g key={i}>
                <line
                  x1="0"
                  y1="0"
                  x2={x2}
                  y2={y2}
                  stroke={spokeColor}
                  strokeOpacity="0.2"
                  strokeWidth="1.5"
                />
                {/* Dotted extension ticks at tip */}
                <circle cx={x2} cy={y2} r="2" fill={spokeColor} fillOpacity="0.8" />
              </g>
            );
          })}

          {/* Data Bubbles per Spoke */}
          {filteredNodes.map((n) => {
            const isHovered = hoveredNode?.id === n.id;
            const isFocused = focusedNodeId === n.id;
            const isHighlighted = isHovered || isFocused;

            return (
              <g
                key={n.id}
                className="cursor-pointer transition-all duration-300"
                onMouseEnter={() => setHoveredNode(n)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {/* Translucent Main Bubble */}
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.bubbleRadius * (isHighlighted ? 1.3 : 1)}
                  fill={n.spokeColor}
                  fillOpacity={isHighlighted ? 0.85 : 0.45}
                  stroke={n.spokeColor}
                  strokeWidth={isHighlighted ? 2.5 : 1}
                  strokeOpacity={0.9}
                />

                {/* Inner Core Accent Dot */}
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={isHighlighted ? 4 : 2}
                  fill="#ffffff"
                  fillOpacity={0.9}
                />

                {/* Pulsing ring on highlight */}
                {isHighlighted && (
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.bubbleRadius + 8}
                    fill="none"
                    stroke={n.spokeColor}
                    strokeWidth="1.5"
                    className="animate-ping"
                  />
                )}
              </g>
            );
          })}

          {/* Clean White/Dark Center Hub */}
          <circle
            cx="0"
            cy="0"
            r="44"
            fill={isDark ? "#0f172a" : "#ffffff"}
            stroke={isDark ? "#334155" : "#e2e8f0"}
            strokeWidth="3"
            className="shadow-xl"
          />
          <text
            x="0"
            y="-4"
            fill={isDark ? "#f8fafc" : "#0f172a"}
            fontSize="11"
            fontWeight="900"
            letterSpacing="0.1em"
            textAnchor="middle"
            className="uppercase"
          >
            BIG DATA
          </text>
          <text
            x="0"
            y="10"
            fill="#ec4899"
            fontSize="7.5"
            fontWeight="800"
            letterSpacing="0.08em"
            textAnchor="middle"
            className="uppercase font-mono"
          >
            SPECTRUM SPOKE
          </text>
        </svg>
      </div>

      {/* Floating Inspector Panel for Hovered/Focused Node */}
      {activeFocusNode && (
        <div className={`absolute bottom-6 right-6 w-80 p-4 rounded-2xl border shadow-2xl z-20 flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 ${
          isDark ? 'bg-slate-900/95 border-white/10 text-slate-100' : 'bg-white/95 border-slate-200 text-slate-900'
        }`}>
          <div className="flex items-center justify-between">
            <span
              className="px-2 py-0.5 rounded text-[9px] font-black tracking-wider uppercase"
              style={{
                background: `${activeFocusNode.spokeColor}20`,
                color: activeFocusNode.spokeColor,
                border: `1px solid ${activeFocusNode.spokeColor}40`
              }}
            >
              {activeFocusNode.type}
            </span>
            <span className="text-[10px] font-mono text-slate-400 font-bold">
              ID: {activeFocusNode.id}
            </span>
          </div>

          <h3 className="text-sm font-extrabold leading-snug">
            {activeFocusNode.title}
          </h3>

          <p className="text-[11px] text-slate-500 dark:text-slate-300 leading-relaxed">
            {activeFocusNode.content?.['Definition Summary'] || 
             activeFocusNode.content?.Description || 
             "Node positioned on chromatic spoke ray within the Graph Database."}
          </p>

          <div className="mt-1 pt-2 border-t border-slate-200 dark:border-white/10 flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400">
            <span>Spoke Sector: #{activeFocusNode.spokeIndex + 1}</span>
            <span>Density Size: {Math.round(activeFocusNode.bubbleRadius * 2)}px</span>
            <span className="font-bold text-pink-500">{activeFocusNode.tier}</span>
          </div>
        </div>
      )}
    </div>
  );
}
