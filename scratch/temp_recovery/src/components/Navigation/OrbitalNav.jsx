import React, { useRef, useMemo, useEffect } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { Compass, Map as MapIcon, Settings, Palette, RefreshCw } from 'lucide-react';
import { ENTITY_TYPES } from '../../data/nodes';

export const OrbitalNav = ({ nodes, view, setView, stickPos, setStickPos, onOpenAdmin, onOpenAppearance, onResetLayout, onMinimapJump }) => {
  const mapRef = useRef(null);
  
  const tickRef = useRef(null);

  // High-fidelity spring for center-return inertia
  const stickX = useMotionValue(0);
  const stickY = useMotionValue(0);
  const springConfig = { damping: 15, stiffness: 120 };
  const smoothX = useSpring(stickX, springConfig);
  const smoothY = useSpring(stickY, springConfig);

  const stickRefLocal = useRef({ dragging: false });

  useEffect(() => {
    // EXTERNAL SYNC: Allow hardware keys to move the visual thumbstick
    if (!stickRefLocal.current.dragging) {
      stickX.set(stickPos.x * 0.9);
      stickY.set(stickPos.y * 0.9);
    }
  }, [stickPos.x, stickPos.y, stickPos.active]);

  // Calculate bounding box of all nodes to ensure 100% visibility in Global Scope
  const bounds = useMemo(() => {
    if (!nodes.length) return { minX: 0, maxX: 100, minY: 0, maxY: 100 };
    return nodes.reduce((acc, n) => ({
        minX: Math.min(acc.minX, n.x),
        maxX: Math.max(acc.maxX, n.x + 224),
        minY: Math.min(acc.minY, n.y),
        maxY: Math.max(acc.maxY, n.y + 100)
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  }, [nodes]);

  const worldW = bounds.maxX - bounds.minX;
  const worldH = bounds.maxY - bounds.minY;
  const padding = 200; // Buffer space
  
  const mapScale = Math.min(180 / (worldW + padding), 130 / (worldH + padding));

  const vw = window.innerWidth / view.scale;
  const vh = window.innerHeight / view.scale;
  const vx = -view.x / view.scale;
  const vy = -view.y / view.scale;

  const handleMapAction = (e) => {
    if (!mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const clickX = (e.clientX - rect.left - 4) / mapScale + bounds.minX - padding/4;
    const clickY = (e.clientY - rect.top - 4) / mapScale + bounds.minY - padding/4;
    
    onMinimapJump(clickX, clickY);
  };

  const handleDrag = (e) => {
    if (e.buttons !== 1) return;
    handleMapAction(e);
  };

  return (
    <div className="absolute top-10 right-10 flex gap-6 items-start z-[1000]">
      <div className="flex flex-col gap-3">
        <button 
           onClick={onOpenAdmin}
           title="Admin Panel"
           className="w-12 h-12 glass-panel border-white/5 flex items-center justify-center text-slate-500 hover:text-brand-cyan hover:border-brand-cyan/20 transition-all active:scale-95 group"
        >
           <Settings size={20} className="group-hover:rotate-90 transition-transform duration-500" />
        </button>

        <button 
           onClick={onOpenAppearance}
           title="Mesh Appearance"
           className="w-12 h-12 glass-panel border-white/5 flex items-center justify-center text-slate-500 hover:text-brand-cyan hover:border-brand-cyan/20 transition-all active:scale-95 group"
        >
           <Palette size={20} className="group-hover:scale-110 transition-transform" />
        </button>
      </div>

      {/* Adaptive Global Scope: Self-scaling to fit the massive XML structure */}
      <div 
        ref={mapRef}
        onMouseDown={handleMapAction}
        onMouseMove={handleDrag}
        className="w-48 h-36 glass-panel border-white/10 overflow-hidden relative cursor-crosshair group shadow-2xl p-1"
      >
        <div className="absolute inset-0 bg-brand-cyan/5 -z-10" />
        <div 
            className="relative w-full h-full origin-top-left pointer-events-none"
            style={{ 
                transform: `scale(${mapScale}) translate(${-bounds.minX + padding/4}px, ${-bounds.minY + padding/4}px)` 
            }}
        >
            {nodes.map(n => {
                const color = ENTITY_TYPES[n.type?.toUpperCase()]?.color || '#00f2ff';
                return (
                    <div 
                        key={n.id} 
                        className="absolute w-40 h-32 rounded-lg opacity-80" 
                        style={{ left: n.x, top: n.y, backgroundColor: color, boxShadow: `0 0 50px ${color}` }} 
                    />
                );
            })}
            {/* Viewport Indicator */}
            <div 
               className="absolute border-[8px] border-slate-400/50 dark:border-white bg-brand-cyan/5 pointer-events-none transition-none shadow-[0_0_100px_black]"
               style={{ left: vx, top: vy, width: vw, height: vh }}
            />
        </div>
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
           <MapIcon size={12} className="text-brand-cyan" />
        </div>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="relative w-28 h-28 rounded-full border border-white/10 flex items-center justify-center bg-black/60 shadow-inner group">
           <div className="absolute inset-0 rounded-full border border-brand-cyan/5 group-hover:scale-110 transition-transform animate-pulse" />
           <motion.div 
             style={{ x: smoothX, y: smoothY }}
             className="w-14 h-14 rounded-full border-2 border-brand-cyan bg-brand-cyan/20 flex items-center justify-center cursor-move shadow-[0_0_30px_rgba(0,242,255,0.4)] relative z-10"
             drag dragConstraints={{ left: -40, right: 40, top: -40, bottom: 40 }} dragElastic={0}
             onDragStart={() => {
                stickRefLocal.current.dragging = true;
                setStickPos(prev => ({ ...prev, active: true }));
             }}
             onDrag={(e, info) => { 
                stickX.set(info.offset.x); 
                stickY.set(info.offset.y); 
                // Pass raw offset to parent game loop
                setStickPos(prev => ({ ...prev, x: info.offset.x, y: info.offset.y }));
             }} 
             onDragEnd={() => { 
                stickRefLocal.current.dragging = false;
                stickX.set(0); 
                stickY.set(0); 
                setStickPos({ x: 0, y: 0, active: false });
             }}
           >
             <Compass size={18} className="text-brand-cyan" />
           </motion.div>
        </div>
        <span className="text-[7px] font-black text-slate-600 uppercase tracking-[0.4em] opacity-60">Orbital_Nav</span>
      </div>
    </div>
  );
};
