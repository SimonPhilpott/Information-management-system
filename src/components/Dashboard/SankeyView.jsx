import React, { useState } from 'react';
import { Info, Sparkles } from 'lucide-react';

/**
 * SankeyView Component
 * Renders an interactive SVG-based Sankey diagram representing relationship flows
 */
export default function SankeyView({ theme = 'dark', focusedNodeId = null, nodes = [] }) {
  const isDark = theme !== 'light';
  const [hoveredPath, setHoveredPath] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [tooltipData, setTooltipData] = useState(null);

  // Mapped standard node IDs to Sankey node IDs
  const getSankeyMappedId = (stdId) => {
    if (!stdId) return null;
    const s = stdId.toLowerCase();
    if (s.includes('pm') || s.includes('project')) return 'l_pm';
    if (s.includes('cost') && s.includes('commercial')) return 'l_ccm';
    if (s.includes('advisory') || s.includes('programme')) return 'l_pa';
    if (s.includes('digital')) return 'l_dp';
    
    if (s.includes('uk') || s.includes('uki')) return 'm_uk';
    if (s.includes('usa') || s.includes('states')) return 'm_us';
    if (s.includes('emea')) return 'm_emea';
    if (s.includes('apac')) return 'm_apac';
    
    if (s.includes('risk')) return 'r_risk';
    if (s.includes('planning') || s.includes('cost')) return 'r_cost';
    if (s.includes('procurement')) return 'r_proc';
    if (s.includes('tender') || s.includes('bidding')) return 'r_tend';
    if (s.includes('insolvency')) return 'r_insol';
    return null;
  };

  const getStandardIdFromSankeyId = (sankeyId) => {
    switch (sankeyId) {
      case 'l_pm': return 'srv_pm';
      case 'l_ccm': return 'srv_ccm';
      case 'l_pa': return 'srv_pa';
      case 'l_dp': return 'srv_dig';
      
      case 'm_uk': return 'loc_uk';
      case 'm_us': return 'loc_usa';
      case 'm_emea': return 'reg_emea';
      case 'm_apac': return 'reg_apac';
      
      case 'r_risk': return 'bok_risk_management';
      case 'r_cost': return 'bok_cost_planning_and_engineering';
      case 'r_proc': return 'bok_procurement_and_contract_strategy';
      case 'r_tend': return 'bok_tender_evaluation';
      case 'r_insol': return 'bok_insolvency_management';
      default: return null;
    }
  };

  const getReferenceCount = (sankeyId) => {
    if (!nodes || nodes.length === 0) return 0;
    const stdId = getStandardIdFromSankeyId(sankeyId);
    if (!stdId) return 0;
    
    const dbNode = nodes.find(n => n.id === stdId);
    const outgoing = dbNode && dbNode.secondaryLinks ? dbNode.secondaryLinks.length : 0;
    const incoming = nodes.filter(n => n.secondaryLinks && n.secondaryLinks.includes(stdId)).length;
    
    return outgoing + incoming;
  };

  const mappedFocusId = getSankeyMappedId(focusedNodeId);

  // Nodes configuration
  const leftNodes = [
    { id: 'l_pm', label: 'Project Management', y: 30, h: 60, color: '#1E4479' },
    { id: 'l_ccm', label: 'Cost & Commercial', y: 110, h: 80, color: '#1E4479' },
    { id: 'l_pa', label: 'Programme Advisory', y: 210, h: 50, color: '#1E4479' },
    { id: 'l_dp', label: 'Digital Performance', y: 280, h: 40, color: '#1E4479' },
  ];

  const midNodes = [
    { id: 'm_uk', label: 'United Kingdom', y: 30, h: 100, color: '#D55c17' },
    { id: 'm_us', label: 'United States', y: 150, h: 60, color: '#D55c17' },
    { id: 'm_emea', label: 'EMEA', y: 230, h: 50, color: '#D55c17' },
    { id: 'm_apac', label: 'APAC', y: 295, h: 30, color: '#D55c17' },
  ];

  const rightNodes = [
    { id: 'r_risk', label: 'Risk Management', y: 30, h: 50, color: '#0090DC' },
    { id: 'r_cost', label: 'Cost Planning', y: 95, h: 70, color: '#0090DC' },
    { id: 'r_proc', label: 'Procurement Strategy', y: 180, h: 50, color: '#0090DC' },
    { id: 'r_tend', label: 'Tender Management', y: 245, h: 40, color: '#0090DC' },
    { id: 'r_insol', label: 'Insolvency Mgmt', y: 300, h: 25, color: '#0090DC' },
  ];

  // Links configuration (flows)
  const links = [
    // Left to Mid
    { id: 'l1', from: 'l_pm', to: 'm_uk', fromY: 45, fromH: 30, toY: 45, toH: 30, vol: '64%', label: 'PM to UK regional authority mapping', flow: '42.5 k/mo', color: '#1E4479' },
    { id: 'l2', from: 'l_pm', to: 'm_us', fromY: 75, fromH: 15, toY: 160, toH: 15, vol: '32%', label: 'PM to US commercial delivery', flow: '21.0 k/mo', color: '#1E4479' },
    { id: 'l3', from: 'l_ccm', to: 'm_uk', fromY: 120, fromH: 40, toY: 85, toH: 40, vol: '80%', label: 'CCM core UK quantity surveying standards', flow: '68.4 k/mo', color: '#1E4479' },
    { id: 'l4', from: 'l_ccm', to: 'm_us', fromY: 160, fromH: 25, toY: 180, toH: 25, vol: '45%', label: 'CCM US estimating metrics', flow: '38.0 k/mo', color: '#1E4479' },
    { id: 'l5', from: 'l_ccm', to: 'm_emea', fromY: 185, fromH: 15, toY: 240, toH: 15, vol: '18%', label: 'CCM EMEA infrastructure advice', flow: '12.2 k/mo', color: '#1E4479' },
    { id: 'l6', from: 'l_pa', to: 'm_uk', fromY: 220, fromH: 30, toY: 125, toH: 30, vol: '60%', label: 'Advisory UK estate framework guidance', flow: '24.5 k/mo', color: '#1E4479' },
    { id: 'l7', from: 'l_pa', to: 'm_emea', fromY: 250, fromH: 20, toY: 255, toH: 20, vol: '40%', label: 'Advisory Europe strategy flows', flow: '18.1 k/mo', color: '#1E4479' },
    { id: 'l8', from: 'l_dp', to: 'm_us', fromY: 290, fromH: 20, toY: 205, toH: 20, vol: '50%', label: 'Digital Hub US system integrations', flow: '19.4 k/mo', color: '#1E4479' },
    { id: 'l9', from: 'l_dp', to: 'm_apac', fromY: 310, fromH: 20, toY: 300, toH: 20, vol: '50%', label: 'Digital Hub APAC smart city guidance', flow: '16.5 k/mo', color: '#1E4479' },

    // Mid to Right
    { id: 'l10', from: 'm_uk', to: 'r_risk', fromY: 45, fromH: 35, toY: 45, toH: 35, vol: '72%', label: 'UK localized risk management guidelines', flow: '52.0 k/mo', color: '#D55c17' },
    { id: 'l11', from: 'm_uk', to: 'r_cost', fromY: 80, fromH: 45, toY: 105, toH: 45, vol: '88%', label: 'UK NRM1 & NRM2 cost planning models', flow: '76.2 k/mo', color: '#D55c17' },
    { id: 'l12', from: 'm_uk', to: 'r_proc', fromY: 125, fromH: 20, toY: 190, toH: 20, vol: '40%', label: 'UK JCT/NEC contract frameworks', flow: '18.0 k/mo', color: '#D55c17' },
    { id: 'l13', from: 'm_us', to: 'r_cost', fromY: 160, fromH: 25, toY: 150, toH: 25, vol: '55%', label: 'US estimating standards & cost metrics', flow: '32.1 k/mo', color: '#D55c17' },
    { id: 'l14', from: 'm_us', to: 'r_proc', fromY: 185, fromH: 30, toY: 210, toH: 30, vol: '65%', label: 'US AIA procurement guidelines', flow: '34.0 k/mo', color: '#D55c17' },
    { id: 'l15', from: 'm_emea', to: 'r_risk', fromY: 235, fromH: 15, toY: 80, toH: 15, vol: '30%', label: 'EMEA regional risk profiles', flow: '14.0 k/mo', color: '#D55c17' },
    { id: 'l16', from: 'm_emea', to: 'r_tend', fromY: 250, fromH: 30, toY: 255, toH: 30, vol: '60%', label: 'EMEA public procurement rules', flow: '22.4 k/mo', color: '#D55c17' },
    { id: 'l17', from: 'm_apac', to: 'r_tend', fromY: 300, fromH: 10, toY: 285, toH: 10, vol: '33%', label: 'APAC bidding and tender standards', flow: '9.0 k/mo', color: '#D55c17' },
    { id: 'l18', from: 'm_apac', to: 'r_insol', fromY: 310, fromH: 15, toY: 305, toH: 15, vol: '50%', label: 'APAC builder insolvency strategies', flow: '12.0 k/mo', color: '#D55c17' }
  ];

  const handleMouseMove = (e, link) => {
    if (containerRef.current) {
      const bounds = containerRef.current.getBoundingClientRect();
      let x = e.clientX - bounds.left + 15;
      let y = e.clientY - bounds.top + 15;
      
      // Prevent overflow
      if (x + 240 > bounds.width) {
        x = e.clientX - bounds.left - 250;
      }
      if (y + 130 > bounds.height) {
        y = e.clientY - bounds.top - 145;
      }
      
      setTooltipPos({ x, y });
      setTooltipData(link);
    }
  };

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
            <h3 className="text-sm font-bold tracking-tight">Sankey Relationship Flow</h3>
          </div>
          <p className="text-[11px] text-slate-400 max-w-xl">
            Visualises structural mapping density and flow volume from left-hand primary corporate capabilities down to regions and connected BOK guidelines.
          </p>
        </div>
        <div className="flex gap-2">
          <div className={`px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
            isDark ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            <Sparkles size={11} className="text-amber-400 animate-pulse" />
            <span>Interactive Flow Simulation</span>
          </div>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 min-h-[380px] w-full relative flex items-center justify-center">
        <svg viewBox="0 0 800 400" className="w-full h-full max-h-[380px] select-none">
          <defs>
            {links.map(link => {
              const fromNode = leftNodes.find(n => n.id === link.from) || midNodes.find(n => n.id === link.from);
              const toNode = midNodes.find(n => n.id === link.to) || rightNodes.find(n => n.id === link.to);
              if (!fromNode || !toNode) return null;
              return (
                <linearGradient key={`grad-${link.id}`} id={`grad-${link.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={fromNode.color} stopOpacity="0.4" />
                  <stop offset="100%" stopColor={toNode.color} stopOpacity="0.4" />
                </linearGradient>
              );
            })}
          </defs>

          <g>
            {links.map(link => {
              const isLeftFlow = link.from.startsWith('l_');
              const startX = isLeftFlow ? 100 : 440;
              const endX = isLeftFlow ? 360 : 700;
              const startY = link.fromY;
              const endY = link.toY;
              const height = link.fromH;

              const dx = (endX - startX) * 0.45;
              const pathData = `M ${startX} ${startY + height/2}
                                C ${startX + dx} ${startY + height/2},
                                  ${endX - dx} ${endY + height/2},
                                  ${endX} ${endY + height/2}`;

              const isHovered = hoveredPath === link.id;
              const isFocused = mappedFocusId && (link.from === mappedFocusId || link.to === mappedFocusId);
              const isHighlighted = isHovered || isFocused;
              const isAnyHighlightActive = hoveredPath !== null || !!mappedFocusId;

              return (
                <path
                  key={link.id}
                  d={pathData}
                  fill="none"
                  stroke={`url(#grad-${link.id})`}
                  strokeWidth={height}
                  onMouseEnter={() => setHoveredPath(link.id)}
                  onMouseLeave={() => { setHoveredPath(null); setTooltipData(null); }}
                  onMouseMove={(e) => handleMouseMove(e, link)}
                  className="cursor-pointer"
                  style={{
                    opacity: isHighlighted ? 0.95 : (isAnyHighlightActive ? 0.12 : 0.55),
                    filter: isHighlighted ? 'drop-shadow(0 0 6px rgba(255,255,255,0.15))' : 'none',
                    transition: 'opacity 0.35s ease, filter 0.35s ease, stroke-width 0.35s ease'
                  }}
                />
              );
            })}
          </g>

          <g>
            {leftNodes.map(node => (
              <g key={node.id}>
                <rect
                  x={85}
                  y={node.y}
                  width={15}
                  height={node.h}
                  rx={3}
                  fill={node.color}
                  className="shadow-lg"
                />
                <text
                  x={75}
                  y={node.y + node.h/2 + 4}
                  textAnchor="end"
                  fill={isDark ? '#cbd5e1' : '#334155'}
                  className="text-[10px] font-black tracking-wide"
                >
                  {node.label}
                </text>
              </g>
            ))}
          </g>

          <g>
            {midNodes.map(node => (
              <g key={node.id}>
                <rect
                  x={360}
                  y={node.y}
                  width={80}
                  height={node.h}
                  rx={4}
                  fill={isDark ? 'rgba(30, 41, 59, 0.9)' : 'rgba(241, 245, 249, 0.9)'}
                  stroke={node.color}
                  strokeWidth={1.5}
                  className="shadow-md"
                />
                <text
                  x={400}
                  y={node.y + node.h/2 + 4}
                  textAnchor="middle"
                  fill={isDark ? '#cbd5e1' : '#334155'}
                  className="text-[9px] font-black tracking-wide"
                >
                  {node.label}
                </text>
              </g>
            ))}
          </g>

          <g>
            {rightNodes.map(node => (
              <g key={node.id}>
                <rect
                  x={700}
                  y={node.y}
                  width={15}
                  height={node.h}
                  rx={3}
                  fill={node.color}
                  className="shadow-lg"
                />
                <text
                  x={725}
                  y={node.y + node.h/2 + 4}
                  textAnchor="start"
                  fill={isDark ? '#cbd5e1' : '#334155'}
                  className="text-[10px] font-black tracking-wide"
                >
                  {node.label}
                </text>
              </g>
            ))}
          </g>
        </svg>

        {/* Premium connection summary box using the main app hover box look/style */}
        <AnimatePresence>
          {tooltipData && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.12 }}
              className={`absolute pointer-events-none p-4 backdrop-blur-xl border rounded-[14px] shadow-3xl w-64 flex flex-col gap-1.5 text-left z-[500] ${
                isDark ? 'bg-black/80 border-white/10 text-white' : 'bg-[#ece8dd]/95 border-[#2E2B27]/15 text-slate-800'
              }`}
              style={{
                top: tooltipPos.y,
                left: tooltipPos.x,
              }}
            >
              {/* Radial glow accent */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: `radial-gradient(circle at 20% 30%, ${tooltipData.color || '#00f2ff'}14, transparent 70%)` }}
              />

              <div className="flex justify-between items-center border-b pb-1.5 mb-0.5 border-white/10 relative">
                <span 
                  className="text-[7.5px] font-black uppercase tracking-[0.15em] px-1.5 py-0.5 rounded border"
                  style={{ 
                    color: tooltipData.color || '#00f2ff', 
                    borderColor: `${tooltipData.color || '#00f2ff'}30`, 
                    background: `${tooltipData.color || '#00f2ff'}10` 
                  }}
                >
                  Mesh Connection
                </span>
                <span 
                  className="text-[7.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{
                    color: tooltipData.color || '#00f2ff',
                    background: `${tooltipData.color || '#00f2ff'}20`
                  }}
                >
                  {tooltipData.vol} Strength
                </span>
              </div>
              <h4 className="text-xs font-black tracking-tight leading-snug relative">
                {tooltipData.label}
              </h4>
              <div className="flex flex-col gap-1 mt-1.5 pt-1.5 border-t border-white/10 text-[9px] text-slate-400 relative">
                <div className="flex justify-between items-center">
                  <span>Source References:</span>
                  <span className="font-bold text-brand-cyan">{getReferenceCount(tooltipData.from)} Connections</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Target References:</span>
                  <span className="font-bold text-amber-400">{getReferenceCount(tooltipData.to)} Connections</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={`mt-4 p-3 rounded-xl border flex items-start gap-2.5 text-[10px] leading-relaxed ${
        isDark ? 'bg-slate-900/40 border-white/5 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
      }`}>
        <Info size={14} className="text-brand-cyan flex-shrink-0 mt-0.5" />
        <div>
          Hover over the curved flow paths to inspect mapping connection details. This layout makes it easy to spot where capabilities are under-mapped to specific regions or where guidelines need updating.
        </div>
      </div>
    </div>
  );
}

