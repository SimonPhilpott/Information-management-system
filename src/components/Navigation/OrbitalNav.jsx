import React, { useRef, useMemo, useEffect } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { Compass, Map as MapIcon, Palette } from 'lucide-react';
import { ENTITY_TYPES } from '../../data/nodes';

export const OrbitalNav = ({ nodes, view, stickPos, setStickPos, onOpenAdmin, onOpenAppearance, onMinimapJump, showMinimap = true, projectionMode = '2d', theme = 'dark' }) => {
  const mapRef = useRef(null);
  const stickRefLocal = useRef({ dragging: false });

  const stickX = useMotionValue(0);
  const stickY = useMotionValue(0);
  const springConfig = { damping: 15, stiffness: 120 };
  const smoothX = useSpring(stickX, springConfig);
  const smoothY = useSpring(stickY, springConfig);

  const bounds = useMemo(() => {
    if (!nodes?.length) return { minX: 0, maxX: 100, minY: 0, maxY: 100 };
    return nodes.reduce((acc, n) => ({
        minX: Math.min(acc.minX, n.x),
        maxX: Math.max(acc.maxX, n.x + 224),
        minY: Math.min(acc.minY, n.y),
        maxY: Math.max(acc.maxY, n.y + 100)
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  }, [nodes]);

  const worldW = bounds.maxX - bounds.minX || 1;
  const worldH = bounds.maxY - bounds.minY || 1;
  const padding = 200;
  const mapScale = Math.min(208 / (worldW + padding), 148 / (worldH + padding));

  const vw = window.innerWidth / (view?.scale || 1);
  const vh = window.innerHeight / (view?.scale || 1);
  const vx = -(view?.x || 0) / (view?.scale || 1);
  const vy = -(view?.y || 0) / (view?.scale || 1);

  const handleMapAction = (e) => {
    if (!mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const clickX = (e.clientX - rect.left - 4) / mapScale + bounds.minX - padding/4;
    const clickY = (e.clientY - rect.top - 4) / mapScale + bounds.minY - padding/4;
    onMinimapJump(clickX, clickY);
  };

  useEffect(() => {
    if (!stickRefLocal.current.dragging) {
      stickX.set(stickPos.x * 0.9);
      stickY.set(stickPos.y * 0.9);
    }
  }, [stickPos.x, stickPos.y]);

  const isLight = theme === 'light';

  // Calculate viewport boundaries in canvas pixels relative to the minimap
  const rectLeft = (vx - bounds.minX + padding/4) * mapScale;
  const rectTop = (vy - bounds.minY + padding/4) * mapScale;
  const rectWidth = vw * mapScale;
  const rectHeight = vh * mapScale;

  return (
    <div 
      className="absolute top-10 flex gap-6 items-start z-[2001]"
      style={{ right: projectionMode === '2d' ? '10px' : projectionMode === 'sunburst' ? '330px' : '254px' }}
    >
      <div className="flex flex-col gap-3">
        <button 
          onClick={onOpenAppearance} 
          title="Graph Appearance" 
          className={`w-12 h-12 flex items-center justify-center transition-all active:scale-95 group rounded-xl border ${
            isLight 
              ? 'bg-[#EDE5D8]/80 border-[#2E2B27]/15 text-[#6A645D] hover:text-[#0891B2] hover:bg-[#2E2B27]/5' 
              : 'bg-black/40 border-white/5 text-slate-500 hover:text-brand-cyan hover:bg-white/5'
          }`}
        >
           <Palette size={20} className="group-hover:scale-110 transition-transform" />
        </button>
      </div>

      {showMinimap && projectionMode === '2d' && (
        <div 
          ref={mapRef} onMouseDown={handleMapAction} onMouseMove={(e) => e.buttons === 1 && handleMapAction(e)}
          className="w-[220px] h-[160px] overflow-hidden relative cursor-crosshair group shadow-2xl p-1 rounded-2xl transition-all duration-300"
          style={{
            background: isLight ? 'rgba(244, 239, 229, 0.85)' : 'rgba(10, 15, 25, 0.8)',
            backdropFilter: 'blur(20px)',
            border: isLight ? '1px solid rgba(46, 43, 39, 0.15)' : '1px solid rgba(0, 242, 255, 0.15)',
            boxShadow: isLight ? '0 12px 32px rgba(46, 43, 39, 0.15)' : '0 12px 32px rgba(0, 0, 0, 0.5)',
            borderRadius: '16px'
          }}
        >
          {/* Top-left premium Minimap label badge */}
          <div 
            className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest pointer-events-none z-10"
            style={{
              background: isLight ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)',
              border: isLight ? '1px solid rgba(46, 43, 39, 0.1)' : '1px solid rgba(255, 255, 255, 0.05)',
              color: isLight ? '#6E6C68' : '#94a3b8'
            }}
          >
            Minimap
          </div>

          {/* Exact canvas-layer overlay background mapping to 3D minimap */}
          <div 
            className="absolute inset-0 pointer-events-none" 
            style={{ backgroundColor: isLight ? 'rgba(244, 239, 229, 0.5)' : 'rgba(8, 12, 20, 0.4)' }}
          />

          {/* Connection Lines Layer (matching the 3D canvas connections style exactly) */}
          <svg className="absolute inset-0 pointer-events-none" width={220} height={160} viewBox="0 0 220 160" style={{ overflow: 'visible' }}>
            {nodes?.map(n => {
              if (!n.parentId) return null;
              const parent = nodes.find(pn => pn.id === n.parentId);
              if (!parent) return null;

              // Center coordinates in pixels for parent and child
              const pX = (parent.x + 112 - bounds.minX + padding/4) * mapScale;
              const pY = (parent.y + 50 - bounds.minY + padding/4) * mapScale;
              const cX = (n.x + 112 - bounds.minX + padding/4) * mapScale;
              const cY = (n.y + 50 - bounds.minY + padding/4) * mapScale;

              return (
                <line 
                  key={`line-${parent.id}-${n.id}`}
                  x1={pX} 
                  y1={pY} 
                  x2={cX} 
                  y2={cY} 
                  stroke={isLight ? 'rgba(46, 43, 39, 0.25)' : 'rgba(255, 255, 255, 0.18)'}
                  strokeWidth={0.75}
                />
              );
            })}
          </svg>

          {/* Pre-calculated Node Dots Container (1:1 sharp pixel rendering) */}
          <div className="absolute inset-0 pointer-events-none">
            {nodes?.map(n => {
              const nodeColor = ENTITY_TYPES[n.type?.toUpperCase()]?.color || (isLight ? '#0891B2' : '#00f2ff');
              const isRoot = n.depth === 0;
              const radius = isRoot ? 3.5 : 2;
              const diameter = radius * 2;
              
              // Center coordinates in pixels
              const cx = (n.x + 112 - bounds.minX + padding/4) * mapScale;
              const cy = (n.y + 50 - bounds.minY + padding/4) * mapScale;

              return (
                <div 
                  key={n.id} 
                  className="absolute opacity-95" 
                  style={{ 
                    left: `${cx - radius}px`, 
                    top: `${cy - radius}px`, 
                    width: `${diameter}px`,
                    height: `${diameter}px`,
                    backgroundColor: nodeColor, 
                    borderRadius: '50%',
                    border: isLight ? '0.5px solid rgba(46, 43, 39, 0.3)' : '0.5px solid rgba(255, 255, 255, 0.4)',
                    boxShadow: isLight ? `0 0 4px ${nodeColor}20` : `0 0 6px ${nodeColor}40`
                  }} 
                />
              );
            })}
          </div>

          {/* Viewport boundary overlay layer (non-scaled sharp borders matching 3D minimap exactly) */}
          <div className="absolute inset-1 pointer-events-none overflow-hidden rounded-xl">
            <div 
              className="absolute pointer-events-none transition-none" 
              style={{ 
                left: `${rectLeft}px`, 
                top: `${rectTop}px`, 
                width: `${rectWidth}px`, 
                height: `${rectHeight}px`,
                border: '1.5px solid #899981',
                borderRadius: '4px'
              }} 
            >
              <div 
                className="absolute border-dashed"
                style={{ 
                  inset: '-1.5px',
                  border: `1.5px dashed ${isLight ? '#0891B2' : '#00f2ff'}`,
                  borderRadius: '4px'
                }}
              />
            </div>
          </div>

          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity z-10">
             <MapIcon size={12} className={isLight ? 'text-[#0891B2]' : 'text-brand-cyan'} />
             <span className={`text-[8px] font-black uppercase tracking-widest ${isLight ? 'text-[#4A443F]' : 'text-slate-400'}`}>Global Scope</span>
          </div>
        </div>
      )}
    </div>
  );
};
