import React, { useState } from 'react';
import { Info, Sparkles } from 'lucide-react';

/**
 * RadialWheelView Component
 * Renders an interactive SVG-based radial dependency wheel representing cross-mesh relations
 */
export default function RadialWheelView({ theme = 'dark', focusedNodeId = null }) {
  const isDark = theme !== 'light';
  const [hoveredNode, setHoveredNode] = useState(null);

  // Mapped standard node IDs to Radial node IDs
  const getRadialMappedId = (stdId) => {
    if (!stdId) return null;
    const s = stdId.toLowerCase();
    if (s.includes('pm') || s.includes('project')) return 'n1';
    if (s.includes('planning') || s.includes('cost')) return 'n2';
    if (s.includes('risk')) return 'n3';
    if (s.includes('procurement')) return 'n4';
    if (s.includes('tender') || s.includes('bidding')) return 'n5';
    if (s.includes('uk') || s.includes('uki')) return 'n6';
    if (s.includes('usa') || s.includes('states')) return 'n7';
    if (s.includes('emea')) return 'n8';
    if (s.includes('apac')) return 'n9';
    if (s.includes('real estate') || s.includes('seg_re')) return 'n10';
    if (s.includes('infrastructure') || s.includes('seg_inf')) return 'n11';
    if (s.includes('energy') || s.includes('resources')) return 'n12';
    if (s.includes('digital') || s.includes('cap_digital')) return 'n13';
    if (s.includes('advisory')) return 'n14';
    if (s.includes('cost & commercial')) return 'n15';
    if (s.includes('insolvency')) return 'n16';
    return null;
  };

  const mappedFocusId = getRadialMappedId(focusedNodeId);

  // 16 nodes arranged on a circle with correct metadata types and variant colors
  const nodes = [
    { id: 'n1', label: 'Project Management', angle: 0, color: '#1E4479', type: 'CONCEPT' },
    { id: 'n2', label: 'Cost Planning', angle: 22.5, color: '#0090DC', type: 'PROCEDURE' },
    { id: 'n3', label: 'Risk Management', angle: 45, color: '#0090DC', type: 'PROCEDURE' },
    { id: 'n4', label: 'Procurement Strategy', angle: 67.5, color: '#0090DC', type: 'PROCEDURE' },
    { id: 'n5', label: 'Tender Management', angle: 90, color: '#0090DC', type: 'PROCEDURE' },
    { id: 'n6', label: 'United Kingdom', angle: 112.5, color: '#D55c17', type: 'VARIANT' },
    { id: 'n7', label: 'United States', angle: 135, color: '#D55c17', type: 'VARIANT' },
    { id: 'n8', label: 'EMEA', angle: 157.5, color: '#D55c17', type: 'VARIANT' },
    { id: 'n9', label: 'APAC', angle: 180, color: '#D55c17', type: 'VARIANT' },
    { id: 'n10', label: 'Real Estate', angle: 202.5, color: '#00A000', type: 'PATTERN' },
    { id: 'n11', label: 'Infrastructure', angle: 225, color: '#00A000', type: 'PATTERN' },
    { id: 'n12', label: 'Energy & Resources', angle: 247.5, color: '#00A000', type: 'PATTERN' },
    { id: 'n13', label: 'Digital Performance', angle: 270, color: '#1E4479', type: 'CONCEPT' },
    { id: 'n14', label: 'Programme Advisory', angle: 292.5, color: '#1E4479', type: 'CONCEPT' },
    { id: 'n15', label: 'Cost & Commercial', angle: 315, color: '#1E4479', type: 'CONCEPT' },
    { id: 'n16', label: 'Insolvency Mgmt', angle: 337.5, color: '#0090DC', type: 'PROCEDURE' },
  ];

  // Dependencies (connections)
  const connections = [
    { from: 'n1', to: 'n6', weight: 3 },
    { from: 'n1', to: 'n7', weight: 2 },
    { from: 'n1', to: 'n3', weight: 4 },
    { from: 'n15', to: 'n6', weight: 4 },
    { from: 'n15', to: 'n7', weight: 3 },
    { from: 'n15', to: 'n2', weight: 5 },
    { from: 'n15', to: 'n16', weight: 2 },
    { from: 'n14', to: 'n6', weight: 3 },
    { from: 'n14', to: 'n8', weight: 2 },
    { from: 'n13', to: 'n7', weight: 3 },
    { from: 'n13', to: 'n9', weight: 2 },
    { from: 'n6', to: 'n10', weight: 3 },
    { from: 'n6', to: 'n11', weight: 4 },
    { from: 'n7', to: 'n10', weight: 3 },
    { from: 'n7', to: 'n12', weight: 4 },
    { from: 'n6', to: 'n3', weight: 5 },
    { from: 'n6', to: 'n2', weight: 4 },
    { from: 'n7', to: 'n2', weight: 3 },
    { from: 'n8', to: 'n5', weight: 3 },
    { from: 'n9', to: 'n5', weight: 2 },
  ];

  const radius = 135;
  const centerX = 200;
  const centerY = 200;

  // Convert polar coordinates to Cartesian
  const getCoords = (angle, r = radius) => {
    const rad = (angle - 90) * (Math.PI / 180);
    return {
      x: centerX + r * Math.cos(rad),
      y: centerY + r * Math.sin(rad)
    };
  };

  const activeDisplayNodeId = hoveredNode || mappedFocusId;

  return (
    <div className={`p-6 rounded-2xl border flex flex-col h-full ${
      isDark ? 'bg-slate-900/60 border-white/5 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
    }`}>
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2 py-0.5 text-[8px] font-black tracking-widest uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md">
              Beta View
            </span>
            <h3 className="text-sm font-bold tracking-tight">Radial Dependency Wheel</h3>
          </div>
          <p className="text-[11px] text-slate-400 max-w-xl">
            Displays structural connectivity dependencies. Hovering a node highlights all its cross-boundary references.
          </p>
        </div>
        <div className="flex gap-2">
          <div className={`px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
            isDark ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            <Sparkles size={11} className="text-amber-400 animate-pulse" />
            <span>Circular Connection Map</span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-[380px] w-full flex items-center justify-center relative">
        <div className="w-[500px] h-[400px] flex items-center justify-center">
          <svg viewBox="0 0 400 400" className="w-full h-full select-none">
            {/* Connection paths */}
            <g>
              {connections.map((conn, idx) => {
                const nodeFrom = nodes.find(n => n.id === conn.from);
                const nodeTo = nodes.find(n => n.id === conn.to);
                if (!nodeFrom || !nodeTo) return null;

                const p1 = getCoords(nodeFrom.angle);
                const p2 = getCoords(nodeTo.angle);

                const isHighlighted = activeDisplayNodeId === conn.from || activeDisplayNodeId === conn.to;
                const isAnyHovered = activeDisplayNodeId !== null;

                // Draw curve towards center
                const pathData = `M ${p1.x} ${p1.y} Q ${centerX} ${centerY} ${p2.x} ${p2.y}`;

                return (
                  <path
                    key={`connection-${idx}`}
                    d={pathData}
                    fill="none"
                    stroke={isHighlighted ? nodeFrom.color : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)')}
                    strokeWidth={isHighlighted ? conn.weight + 0.5 : conn.weight - 0.5}
                    className="pointer-events-none"
                    style={{
                      opacity: isHighlighted ? 0.9 : (isAnyHovered ? 0.05 : 0.45),
                      filter: isHighlighted ? `drop-shadow(0 0 4px ${nodeFrom.color}77)` : 'none',
                      transition: 'opacity 0.35s ease, filter 0.35s ease, stroke-width 0.35s ease'
                    }}
                  />
                );
              })}
            </g>

            {/* Inner Center HUD Panel */}
            <circle
              cx={centerX}
              cy={centerY}
              r={55}
              fill={isDark ? '#0f172a' : '#f8fafc'}
              stroke={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}
              strokeWidth={1}
              className="shadow-xl"
            />
            {activeDisplayNodeId ? (
              (() => {
                const hn = nodes.find(n => n.id === activeDisplayNodeId);
                const connCount = connections.filter(c => c.from === activeDisplayNodeId || c.to === activeDisplayNodeId).length;
                return (
                  <g>
                    <text
                      x={centerX}
                      y={centerY - 12}
                      textAnchor="middle"
                      fill={hn.color}
                      className="text-[8px] font-black uppercase tracking-wider"
                    >
                      {hn.type}
                    </text>
                    <text
                      x={centerX}
                      y={centerY + 6}
                      textAnchor="middle"
                      fill={isDark ? '#f8fafc' : '#0f172a'}
                      className="text-[12px] font-black"
                    >
                      {connCount} Connections
                    </text>
                    <text
                      x={centerX}
                      y={centerY + 20}
                      textAnchor="middle"
                      fill="#94a3b8"
                      className="text-[7px] uppercase tracking-widest font-black"
                    >
                      Active links
                    </text>
                  </g>
                );
              })()
            ) : (
              <g>
                <text
                  x={centerX}
                  y={centerY - 8}
                  textAnchor="middle"
                  fill="#94a3b8"
                  className="text-[8px] font-black uppercase tracking-wider"
                >
                  Centrality
                </text>
                <text
                  x={centerX}
                  y={centerY + 8}
                  textAnchor="middle"
                  fill={isDark ? '#f8fafc' : '#0f172a'}
                  className="text-[11px] font-black"
                >
                  Hover Node
                </text>
                <text
                  x={centerX}
                  y={centerY + 20}
                  textAnchor="middle"
                  fill="#94a3b8"
                  className="text-[7px] uppercase tracking-widest font-black"
                >
                  To analyse
                </text>
              </g>
            )}

            {/* Perimeter Nodes */}
            <g>
              {nodes.map(node => {
                const pos = getCoords(node.angle);
                const labelPos = getCoords(node.angle, radius + 15);
                const isHovered = activeDisplayNodeId === node.id;
                const isAnyHovered = activeDisplayNodeId !== null;

                // Calculate label angle rotation
                let rotAngle = node.angle;
                let textAnchor = 'start';
                if (rotAngle > 180) {
                  rotAngle -= 180;
                  textAnchor = 'end';
                }

                return (
                  <g key={node.id}>
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={isHovered ? 6 : 4}
                      fill={node.color}
                      onMouseEnter={() => setHoveredNode(node.id)}
                      onMouseLeave={() => setHoveredNode(null)}
                      className="transition-all duration-200 cursor-pointer"
                      style={{
                        opacity: isHovered ? 1 : (isAnyHovered ? 0.3 : 0.8),
                        filter: isHovered ? `drop-shadow(0 0 6px ${node.color})` : 'none'
                      }}
                    />
                    <text
                      x={labelPos.x}
                      y={labelPos.y + 3}
                      textAnchor={textAnchor}
                      transform={`rotate(${node.angle > 180 ? node.angle - 270 : node.angle - 90}, ${labelPos.x}, ${labelPos.y})`}
                      fill={isHovered ? node.color : (isDark ? '#cbd5e1' : '#334155')}
                      onMouseEnter={() => setHoveredNode(node.id)}
                      onMouseLeave={() => setHoveredNode(null)}
                      className="text-[8px] font-black tracking-wide cursor-pointer transition-colors duration-200"
                      style={{
                        opacity: isHovered ? 1 : (isAnyHovered ? 0.35 : 0.75),
                      }}
                    >
                      {node.label}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </div>

      <div className={`mt-4 p-3 rounded-xl border flex items-start gap-2.5 text-[10px] leading-relaxed ${
        isDark ? 'bg-slate-900/40 border-white/5 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
      }`}>
        <Info size={14} className="text-brand-cyan flex-shrink-0 mt-0.5" />
        <div>
          Hover over nodes on the perimeter to isolate dependencies. This radial map showcases connections across corporate domains, highlighting variants and regional integrations.
        </div>
      </div>
    </div>
  );
}
