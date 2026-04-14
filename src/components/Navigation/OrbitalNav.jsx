import React, { useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Compass, Map as MapIcon, Settings } from 'lucide-react';
import { ENTITY_TYPES } from '../../data/nodes';

export const OrbitalNav = ({ nodes, view, setView, stickPos, setStickPos, onOpenAdmin }) => {
  const mapRef = useRef(null);
  
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
  
  // Adaptive scale to fit the entire mesh into the Fixed Mini-Map container (192px width)
  const mapScale = Math.min(180 / (worldW + padding), 130 / (worldH + padding));

  const vw = window.innerWidth / view.scale;
  const vh = window.innerHeight / view.scale;
  const vx = -view.x / view.scale;
  const vy = -view.y / view.scale;

  const handleMapAction = (e) => {
    if (!mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    // Center point of the click in "World Space"
    const clickX = (e.clientX - rect.left - 4) / mapScale + bounds.minX - padding/2;
    const clickY = (e.clientY - rect.top - 4) / mapScale + bounds.minY - padding/2;
    
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    setView(prev => ({
      ...prev,
      x: centerX - clickX * prev.scale,
      y: centerY - clickY * prev.scale
    }));
  };

  const handleDrag = (e) => {
    if (e.buttons !== 1) return;
    handleMapAction(e);
  };

  return (
    <div className="absolute top-10 right-10 flex gap-6 items-start z-[1000]">
      <button 
         onClick={onOpenAdmin}
         className="w-12 h-12 glass-panel border-white/5 flex items-center justify-center text-slate-500 hover:text-brand-cyan hover:border-brand-cyan/20 transition-all active:scale-95 group"
      >
         <Settings size={20} className="group-hover:rotate-90 transition-transform duration-500" />
      </button>

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
               className="absolute border-[12px] border-white bg-white/5 pointer-events-none transition-none shadow-[0_0_100px_black]"
               style={{ left: vx, top: vy, width: vw, height: vh }}
            />
        </div>
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
           <MapIcon size={12} className="text-brand-cyan" />
           <span className="text-[8px] font-black uppercase text-brand-cyan tracking-widest leading-none">Global_Scope</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="relative w-28 h-28 rounded-full border border-white/10 flex items-center justify-center bg-black/60 shadow-inner group">
           <div className="absolute inset-0 rounded-full border border-brand-cyan/20 group-hover:scale-110 transition-transform animate-pulse" />
           <motion.div 
             className="w-14 h-14 rounded-full border-2 border-brand-cyan bg-brand-cyan/20 flex items-center justify-center cursor-move shadow-[0_0_30px_rgba(0,242,255,0.4)] relative z-10"
             drag dragConstraints={{ left: -40, right: 40, top: -40, bottom: 40 }} dragElastic={0}
             onDrag={(e, info) => setStickPos({ x: info.offset.x / 40, y: info.offset.y / 40 })} 
             onDragEnd={() => setStickPos({ x: 0, y: 0 })}
           >
             <Compass size={18} className="text-brand-cyan" />
           </motion.div>
        </div>
        <span className="text-[7px] font-black text-slate-600 uppercase tracking-[0.4em] opacity-60">Orbital_Nav</span>
      </div>
    </div>
  );
};
