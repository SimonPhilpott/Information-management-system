import React, { useRef, useMemo, useEffect } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { Compass, Map as MapIcon, Settings, Palette } from 'lucide-react';
import { ENTITY_TYPES } from '../../data/nodes';

export const OrbitalNav = ({ nodes, view, stickPos, setStickPos, onOpenAdmin, onOpenAppearance, onMinimapJump, showMinimap = true, projectionMode = '2d' }) => {
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
  const mapScale = Math.min(180 / (worldW + padding), 130 / (worldH + padding));

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

  return (
    <div className="absolute top-10 right-10 flex gap-6 items-start z-[1000]">
      <div className="flex flex-col gap-3">
        <button onClick={onOpenAdmin} title="Admin Panel" className="w-12 h-12 glass-panel border-white/5 flex items-center justify-center text-slate-500 hover:text-brand-cyan transition-all active:scale-95 group">
           <Settings size={20} className="group-hover:rotate-90 transition-transform duration-500" />
        </button>
        <button onClick={onOpenAppearance} title="Mesh Appearance" className="w-12 h-12 glass-panel border-white/5 flex items-center justify-center text-slate-500 hover:text-brand-cyan transition-all active:scale-95 group">
           <Palette size={20} className="group-hover:scale-110 transition-transform" />
        </button>
      </div>

      {showMinimap && (
        <div 
          ref={mapRef} onMouseDown={handleMapAction} onMouseMove={(e) => e.buttons === 1 && handleMapAction(e)}
          className="w-48 h-36 glass-panel border-white/10 overflow-hidden relative cursor-crosshair group shadow-2xl p-1"
        >
          <div className="absolute inset-0 bg-brand-cyan/5 -z-10" />
          <div className="relative w-full h-full origin-top-left pointer-events-none" style={{ transform: `scale(${mapScale}) translate(${-bounds.minX + padding/4}px, ${-bounds.minY + padding/4}px)` }}>
              {nodes?.map(n => (
                <div key={n.id} className="absolute w-40 h-32 rounded-lg opacity-80" style={{ left: n.x, top: n.y, backgroundColor: ENTITY_TYPES[n.type?.toUpperCase()]?.color || '#00f2ff', boxShadow: `0 0 50px ${ENTITY_TYPES[n.type?.toUpperCase()]?.color || '#00f2ff'}` }} />
              ))}
              <div className="absolute border-[8px] border-slate-400/50 dark:border-white bg-brand-cyan/5 pointer-events-none transition-none shadow-[0_0_100px_black]" style={{ left: vx, top: vy, width: vw, height: vh }} />
          </div>
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
             <MapIcon size={12} className="text-brand-cyan" />
             <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Global Scope</span>
          </div>
        </div>
      )}
    </div>
  );
};
