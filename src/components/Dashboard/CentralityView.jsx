import React, { useState } from 'react';
import { Info, Sparkles, TrendingUp, Link2, PlusCircle, CheckCircle } from 'lucide-react';

/**
 * CentralityView Component
 * Renders a scatterplot mapping node degrees vs. usage frequency, accompanied by an analytics detail recommendations panel
 */
export default function CentralityView({ theme = 'dark', focusedNodeId = null }) {
  const isDark = theme !== 'light';
  const [selectedNodeId, setSelectedNodeId] = useState('pm');
  const [establishedLinks, setEstablishedLinks] = useState([]);

  // Mapped standard node IDs to Centrality node IDs
  const getCentralityMappedId = (stdId) => {
    if (!stdId) return null;
    const s = stdId.toLowerCase();
    if (s.includes('pm') || s.includes('project')) {
      if (s.includes('uk')) return 'uk_pm';
      return 'pm';
    }
    if (s.includes('cost') && s.includes('commercial')) return 'ccm';
    if (s.includes('risk')) return 'risk';
    if (s.includes('planning') || s.includes('cost')) return 'cost_plan';
    if (s.includes('digital')) return 'digital';
    if (s.includes('apac')) return 'apac';
    if (s.includes('insolvency')) return 'insolvency';
    return null;
  };

  const mappedFocusId = getCentralityMappedId(focusedNodeId);
  const activeSelectedId = mappedFocusId || selectedNodeId;

  // Plot data with correct metadata variant colors and types
  const chartNodes = [
    { id: 'pm', label: 'Project Management', degree: 9, freq: 92, color: '#1E4479', type: 'CONCEPT', desc: 'Central governance node anchoring regional variants and core BOK project rules.' },
    { id: 'ccm', label: 'Cost & Commercial', degree: 8, freq: 88, color: '#1E4479', type: 'CONCEPT', desc: 'Core commercial delivery hub mapping estimation metrics and cost planning.' },
    { id: 'uk_pm', label: 'UK Project Management', degree: 5, freq: 78, color: '#D55c17', type: 'VARIANT', desc: 'United Kingdom regional variant mapping to specialized local PM structures.' },
    { id: 'risk', label: 'Risk Management', degree: 7, freq: 72, color: '#0090DC', type: 'PROCEDURE', desc: 'Body of Knowledge guide defining risk registers and evaluation frameworks.' },
    { id: 'cost_plan', label: 'Cost Planning', degree: 6, freq: 65, color: '#0090DC', type: 'PROCEDURE', desc: 'NRM1/NRM2 aligned estimating models and cost control methods.' },
    { id: 'digital', label: 'Digital Performance', degree: 4, freq: 50, color: '#1E4479', type: 'CONCEPT', desc: 'Global digital capability mapping technological services & smart tools.' },
    { id: 'apac', label: 'APAC Regional Hub', degree: 3, freq: 35, color: '#D55c17', type: 'VARIANT', desc: 'Asia-Pacific regional structure bridging local segments and tender rules.' },
    { id: 'insolvency', label: 'Insolvency Mgmt', degree: 2, freq: 15, color: '#0090DC', type: 'PROCEDURE', desc: 'BOK guidelines relating to supplier bankruptcy recovery and commercial protection.' },
  ];

  // Recommendations for the selected node
  const recommendations = {
    pm: [
      { targetId: 'risk', targetLabel: 'Risk Management', reason: 'High semantic alignment in BOK project execution logs.', strength: '94%' },
      { targetId: 'cost_plan', targetLabel: 'Cost Planning', reason: 'BOK planning standards frequently co-occur in PM drafts.', strength: '86%' },
    ],
    ccm: [
      { targetId: 'cost_plan', targetLabel: 'Cost Planning', reason: 'Authoritative commercial requirement for cost estimation benchmarks.', strength: '98%' },
      { targetId: 'insolvency', targetLabel: 'Insolvency Mgmt', reason: 'Crucial commercial liability guidance for supply chain disruptions.', strength: '78%' },
    ],
    uk_pm: [
      { targetId: 'risk', targetLabel: 'Risk Management', reason: 'Connects UK variant to national risk register guidelines.', strength: '82%' },
    ],
    risk: [
      { targetId: 'pm', targetLabel: 'Project Management', reason: 'Core governance anchor for risk evaluation frameworks.', strength: '94%' },
    ],
    cost_plan: [
      { targetId: 'ccm', targetLabel: 'Cost & Commercial', reason: 'Primary commercial delivery methodology mapping.', strength: '98%' },
    ],
    digital: [
      { targetId: 'cost_plan', targetLabel: 'Cost Planning', reason: 'Enables digital BIM-to-estimating models automation.', strength: '75%' },
    ],
    apac: [
      { targetId: 'insolvency', targetLabel: 'Insolvency Mgmt', reason: 'Protects APAC region against local contractor insolvencies.', strength: '70%' },
    ],
    insolvency: [
      { targetId: 'ccm', targetLabel: 'Cost & Commercial', reason: 'Bridges commercial recovery guides to quantity surveying services.', strength: '78%' },
    ]
  };

  const activeNode = chartNodes.find(n => n.id === activeSelectedId) || chartNodes[0];
  const activeRecs = recommendations[activeNode.id] || [];

  const handleEstablishLink = (targetId) => {
    const linkId = `${activeNode.id}-${targetId}`;
    if (establishedLinks.includes(linkId)) {
      setEstablishedLinks(establishedLinks.filter(id => id !== linkId));
    } else {
      setEstablishedLinks([...establishedLinks, linkId]);
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
            <h3 className="text-sm font-bold tracking-tight">Depth and Connection Analytics</h3>
          </div>
          <p className="text-[11px] text-slate-400 max-w-xl">
            Plotted by connection degree (influence) vs. tag usage frequency. Click on nodes to review connection recommendations.
          </p>
        </div>
        <div className="flex gap-2">
          <div className={`px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
            isDark ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            <TrendingUp size={11} className="text-amber-400" />
            <span>Connection Optimiser</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Scatterplot on Left, Panel on Right */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-6 min-h-[350px]">
        {/* Scatterplot */}
        <div className="lg:col-span-3 flex flex-col border border-white/5 rounded-xl p-4 bg-slate-950/20 relative">
          <div className="absolute top-2 right-4 text-[8px] uppercase tracking-widest text-slate-500 font-bold">
            centrality map
          </div>
          
          <div className="flex-1 w-full relative min-h-[250px]">
            {/* Grid Lines */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none py-4 border-b border-l border-white/10">
              <div className="w-full border-t border-white/5 h-0"></div>
              <div className="w-full border-t border-white/5 h-0"></div>
              <div className="w-full border-t border-white/5 h-0"></div>
              <div className="w-full border-t border-white/5 h-0"></div>
            </div>
            
            {/* Plotted Node Points */}
            {chartNodes.map(node => {
              // Map degree 0-10 to left 10%-90%
              const left = 10 + (node.degree / 10) * 80;
              // Map freq 0-100 to bottom 10%-90%
              const bottom = 10 + (node.freq / 100) * 80;
              const isSelected = selectedNodeId === node.id;

              return (
                <button
                  key={node.id}
                  onClick={() => setSelectedNodeId(node.id)}
                  className="absolute cursor-pointer transition-all duration-300 active:scale-95 group focus:outline-none z-10"
                  style={{
                    left: `${left}%`,
                    bottom: `${bottom}%`,
                    transform: 'translate(-50%, 50%)'
                  }}
                >
                  {/* Outer glow ring */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300"
                    style={{
                      background: isSelected ? `${node.color}22` : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isSelected ? `${node.color}cc` : 'rgba(255,255,255,0.1)'}`,
                      boxShadow: isSelected ? `0 0 15px ${node.color}44` : 'none',
                    }}
                  >
                    {/* Inner dot */}
                    <div
                      className="w-3.5 h-3.5 rounded-full transition-transform duration-300 group-hover:scale-125"
                      style={{ background: node.color }}
                    />
                  </div>
                  
                  {/* Floating Label */}
                  <span
                    className={`absolute left-11 top-1/2 -translate-y-1/2 whitespace-nowrap text-[9px] font-black tracking-wide px-2 py-0.5 rounded-md border backdrop-blur-md transition-all duration-300 ${
                      isSelected
                        ? 'bg-slate-900 border-white/20 text-white'
                        : 'bg-slate-900/60 border-white/5 text-slate-400 group-hover:text-slate-200'
                    }`}
                  >
                    {node.label}
                  </span>
                </button>
              );
            })}

            {/* Axes Labels */}
            <div className="absolute bottom-2 right-2 text-[8px] font-black uppercase text-slate-500 tracking-wider">
              Degree Centrality (Connections) →
            </div>
            <div className="absolute top-2 left-2 text-[8px] font-black uppercase text-slate-500 tracking-wider rotate-90 origin-top-left translate-x-2">
              Usage Frequency (Volume) →
            </div>
          </div>
        </div>

        {/* Analytics Detail Recommendation Panel (With raised font size) */}
        <div className={`lg:col-span-2 rounded-xl border p-5 flex flex-col justify-between backdrop-blur-xl ${
          isDark ? 'bg-slate-900/40 border-white/5' : 'bg-slate-50 border-slate-200'
        }`}>
          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-3.5 mb-3.5">
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">Node Profile</span>
                <h4 className="text-base font-bold" style={{ color: activeNode.color }}>{activeNode.label}</h4>
              </div>
              <span className="px-2.5 py-0.8 text-[10px] font-black tracking-widest uppercase rounded bg-white/5 border border-white/10 text-slate-300">
                {activeNode.type}
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed mb-5">{activeNode.desc}</p>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-3.5 mb-5.5">
              <div className="p-2.5 border border-white/5 rounded-lg bg-slate-950/20 text-center">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">degree</span>
                <span className="text-sm font-black text-white">{activeNode.degree} <span className="text-xs text-slate-500">/ 10</span></span>
              </div>
              <div className="p-2.5 border border-white/5 rounded-lg bg-slate-950/20 text-center">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">usage frequency</span>
                <span className="text-sm font-black text-white">{activeNode.freq}%</span>
              </div>
            </div>

            {/* Recommendation list */}
            <div className="space-y-3.5">
              <h5 className="text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-2 mb-2.5">
                <Link2 size={12} className="text-brand-cyan" />
                <span>Connection Recommendations</span>
              </h5>
              
              {activeRecs.length === 0 ? (
                <div className="text-xs text-slate-500 italic p-3.5 text-center border border-dashed border-white/5 rounded-lg">
                  No additional links recommended for this node.
                </div>
              ) : (
                activeRecs.map(rec => {
                  const linkId = `${activeNode.id}-${rec.targetId}`;
                  const isEstablished = establishedLinks.includes(linkId);

                  return (
                    <div key={rec.targetId} className="p-3.5 border border-white/5 rounded-lg bg-slate-950/10 flex items-start justify-between gap-3.5 text-xs leading-relaxed">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-xs">{rec.targetLabel}</span>
                          <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 text-[9px] font-bold">
                            {rec.strength} strength
                          </span>
                        </div>
                        <p className="text-slate-400 text-[10px]">{rec.reason}</p>
                      </div>
                      
                      <button
                        onClick={() => handleEstablishLink(rec.targetId)}
                        className={`p-1.5 rounded-lg transition-all active:scale-95 cursor-pointer flex-shrink-0 ${
                          isEstablished
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/35 hover:bg-brand-cyan/30'
                        }`}
                      >
                        {isEstablished ? <CheckCircle size={13} /> : <PlusCircle size={13} />}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-5 border-t border-white/5 pt-3.5 text-[10px] text-slate-500 text-right uppercase tracking-wider font-semibold">
            Connection Optimiser v0.1
          </div>
        </div>
      </div>
    </div>
  );
}
