import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ENTITY_TYPES } from '../../data/nodes';
import { Network, Plus, RotateCcw, Activity } from 'lucide-react';

export const MeshCanvas = ({ 
  meshRef,
  nodes, 
  view, 
  layoutRules, 
  hoveredNodeId, 
  setHoveredNodeId, 
  hoveredLinkId, 
  setHoveredLinkId, 
  setHoveredLinkData, 
  onSelectNode, 
  onAddOffshoot, 
  onNodeDrag, 
  onNodeDragEnd, 
  onResetPosition, 
  onLinkClick,
  isMovingMesh,
  isSidebarOpen // Passed from App to know if we should block
}) => {
  const NODE_W = 224;
  const NODE_H = 100;
  
  const [draggedNodeId, setDraggedNodeId] = useState(null);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [hasMovedDuringDrag, setHasMovedDuringDrag] = useState(false);

  // Connection Engine: Generates premium spline paths with dynamic tension
  const getPath = (start, end, node) => {
    const sx = start.x + NODE_W / 2;
    const sy = start.y + NODE_H / 2;
    const tx = end.x + NODE_W / 2;
    const ty = end.y + NODE_H / 2;

    const dx = tx - sx;
    const dy = ty - sy;

    const tensionScalar = (layoutRules.connectionTension ?? 65) / 100;
    const BASE_TENSION = tensionScalar; 

    const useVertical = node.branchDir === 'Up' || node.branchDir === 'Down' || layoutRules.layoutStyle === 'vertical_tb';

    if (useVertical) {
      const cp1y = sy + (dy * BASE_TENSION);
      const cp2y = ty - (dy * BASE_TENSION);
      return `M ${sx} ${sy} C ${sx} ${cp1y}, ${tx} ${cp2y}, ${tx} ${ty}`;
    } else {
      const cp1x = sx + (dx * BASE_TENSION);
      const cp2x = tx - (dx * BASE_TENSION);
      return `M ${sx} ${sy} C ${cp1x} ${sy}, ${cp2x} ${ty}, ${tx} ${ty}`;
    }
  };

  const handlePointerDown = (e, id) => {
    if (isSidebarOpen) return; // Nuclear Block: Prevent node interaction if sidebar is active
    e.stopPropagation();
    setDraggedNodeId(id);
    setDragStartPos({ x: e.clientX, y: e.clientY });
    setHasMovedDuringDrag(false);
  };

  const handlePointerMove = (e, id) => {
    if (draggedNodeId !== id) return;
    const dx = (e.clientX - dragStartPos.x) / view.scale;
    const dy = (e.clientY - dragStartPos.y) / view.scale;
    
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) setHasMovedDuringDrag(true);
    onNodeDrag(id, dx, dy);
    setDragStartPos({ x: e.clientX, y: e.clientY });
  };

  const handlePointerUp = (e, node) => {
    if (draggedNodeId === node.id) {
      if (!hasMovedDuringDrag) onSelectNode(node);
      onNodeDragEnd(node.id);
    }
    setDraggedNodeId(null);
  };

  return (
    <div 
         ref={meshRef}
         className="absolute inset-0 origin-top-left will-change-transform"
         style={{ 
             transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
             backfaceVisibility: 'hidden'
         }}>
      
      <svg className="absolute inset-0 w-[5000px] h-[5000px] pointer-events-none overflow-visible">
        <defs>
          <filter id="meshglow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {nodes.map(node => {
            if (!node.parentId) return null;
            const parent = nodes.find(n => n.id === node.parentId);
            if (!parent) return null;

            const pathData = getPath(parent, node, node);
            const color = ENTITY_TYPES[node.type?.toUpperCase()]?.color || '#00f2ff';
            const lid = `link-${parent.id}-${node.id}`;
            const isHovered = hoveredLinkId === lid;
            
            // Relational Focus Logic: Dim unrelated links when a node is hovered
            let isFocused = true;
            let isUnrelatedDim = false;
            if (hoveredNodeId) {
                isFocused = (parent.id === hoveredNodeId || node.id === hoveredNodeId);
                if (!isFocused) isUnrelatedDim = true;
            }

            return (
                <g key={lid} className={`group cursor-pointer transition-all duration-500 ${isUnrelatedDim ? 'opacity-5 blur-[1px]' : 'opacity-100'}`}>
                    <path d={pathData} fill="none" stroke="transparent" strokeWidth={30} 
                      onMouseEnter={() => { 
                        if (!isMovingMesh && !isSidebarOpen) {
                            setHoveredLinkId(lid); 
                            setHoveredLinkData({ 
                                from: parent.title, to: node.title, 
                                fromType: parent.type, toType: node.type,
                                type: 'Structural Thread' 
                            }); 
                        }
                      }} 
                      onMouseLeave={() => { if (!isMovingMesh) { setHoveredLinkId(null); setHoveredLinkData(null); } }} 
                      onClick={(e) => { e.stopPropagation(); onLinkClick(node.id, parent.id); }} className="pointer-events-auto" />
                    <path d={pathData} fill="none" stroke={color} strokeWidth={isHovered ? 2 : 1} strokeOpacity={isHovered ? 0.8 : 0.3} className="transition-all duration-300" />
                    <path d={pathData} fill="none" stroke={color} strokeWidth={isHovered ? 4 / view.scale : 2 / view.scale} strokeOpacity={isHovered ? 0.6 : 0.3} className={`connection-pulse opacity-20 ${isMovingMesh ? '' : 'animate-pulse'}`} style={{ filter: 'url(#meshglow)' }} />
                </g>
            );
        })}

        {nodes.filter(n => n.secondaryLinks?.length).map(node => 
            node.secondaryLinks.map(targetId => {
                const target = nodes.find(n => n.id === targetId);
                if (!target) return null;
                const pathData = getPath(node, target, target);
                const lid = `secondary-${node.id}-${targetId}`;
                const isHovered = hoveredLinkId === lid;

                let isFocused = true;
                let isUnrelatedDim = false;
                if (hoveredNodeId) {
                    isFocused = (node.id === hoveredNodeId || target.id === hoveredNodeId);
                    if (!isFocused) isUnrelatedDim = true;
                }

                return (
                    <g key={lid} className={`group cursor-pointer transition-all duration-500 ${isUnrelatedDim ? 'opacity-5 blur-[1px]' : 'opacity-100'}`}>
                       <path d={pathData} fill="none" stroke="transparent" strokeWidth={30} 
                          onMouseEnter={() => { 
                            if (!isMovingMesh) {
                                setHoveredLinkId(lid); 
                                setHoveredLinkData({ 
                                    from: node.title, to: target.title, 
                                    fromType: node.type, toType: target.type,
                                    type: 'Transverse Thread' 
                                }); 
                            }
                          }} 
                          onMouseLeave={() => { if (!isMovingMesh) { setHoveredLinkId(null); setHoveredLinkData(null); } }} onClick={() => onLinkClick(target.id, node.id)} className="pointer-events-auto" />
                       <path d={pathData} fill="none" stroke={isHovered ? "#00f0ff" : "currentColor"} strokeWidth={isHovered ? 2 / view.scale : 1 / view.scale} strokeOpacity={isHovered ? 0.8 : 0.4} strokeDasharray={isHovered ? "none" : "5,5"} className="transition-all duration-300 text-slate-400 dark:text-white" />
                    </g>
                );
            })
        )}
      </svg>

      {nodes.map(node => {
        const config = ENTITY_TYPES[node.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT;
        const color = config.color;
        
        // VIEWPORT CULLING: Only render if reasonably close to the screen center
        // This is a rough estimation to keep performance high without complex math
        const worldCX = (window.innerWidth / 2 - view.x) / view.scale;
        const worldCY = (window.innerHeight / 2 - view.y) / view.scale;
        const dist = Math.sqrt(Math.pow(node.x - worldCX, 2) + Math.pow(node.y - worldCY, 2));
        const visibleRange = (Math.max(window.innerWidth, window.innerHeight) / view.scale) * 1.5;
        if (dist > visibleRange && !isMovingMesh) return null;

        let isRelated = false;
        let isDimmed = false;
        if (hoveredNodeId) {
            if (node.id === hoveredNodeId) isRelated = true;
            else {
                const hNode = nodes.find(n => n.id === hoveredNodeId);
                if (node.parentId === hoveredNodeId) isRelated = true;
                if (hNode && hNode.parentId === node.id) isRelated = true;
                if (hNode && hNode.secondaryLinks?.includes(node.id)) isRelated = true;
                if (node.secondaryLinks?.includes(hoveredNodeId)) isRelated = true;
                if (!isRelated) isDimmed = true;
            }
        }

        return (
          <div 
            key={node.id}
            onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, node.id); }} 
            onPointerMove={(e) => { e.stopPropagation(); handlePointerMove(e, node.id); }} 
            onPointerUp={(e) => { e.stopPropagation(); handlePointerUp(e, node); }} 
            onMouseEnter={() => { if (!isMovingMesh && !draggedNodeId && !isSidebarOpen) setHoveredNodeId(node.id); }} 
            onMouseLeave={() => { if (!isMovingMesh) setHoveredNodeId(null); }} 
            className={`absolute w-56 p-1 cursor-move touch-none will-change-transform ${draggedNodeId === node.id ? 'z-50' : 'transition-[opacity,transform,filter] duration-500 z-20'} ${isDimmed ? 'opacity-20 scale-95 blur-[2px]' : 'opacity-100 scale-100'}`} 
            style={{ 
                transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
                backfaceVisibility: 'hidden'
            }}
          >
            <div className="relative glass-panel overflow-hidden border-t-2 group-hover:shadow-[0_0_30px_rgba(255,255,255,0.05)] transition-all duration-500 rounded-xl"
                 style={{ borderTopColor: color, backgroundColor: 'rgba(10, 15, 20, 0.8)' }}>
              
              <div className="p-4 relative z-10">
                <div className="flex justify-between items-start mb-2">
                   <div className="flex items-center gap-1.5 overflow-hidden">
                      <config.icon size={10} style={{ color }} className="shrink-0" />
                      <span className="text-[8px] font-black uppercase tracking-[0.2em] truncate opacity-60" style={{ color }}>{config.label}</span>
                   </div>
                </div>
                <h3 className="text-[13px] font-bold text-white/90 leading-tight mb-1 italic tracking-tight">{node.title}</h3>
              </div>

              <div 
                className="absolute top-1 right-1 flex gap-1 opacity-60 hover:opacity-100 transition-opacity z-50 pointer-events-auto"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseEnter={(e) => { e.stopPropagation(); if (!isMovingMesh) setHoveredNodeId(null); }}
                onMouseLeave={(e) => { e.stopPropagation(); if (!isMovingMesh) setHoveredNodeId(node.id); }}
              >
                <button className="p-1 hover:bg-white/20 rounded cursor-pointer bg-white/5 border border-white/10" onClick={(e) => { e.stopPropagation(); onAddOffshoot(node.id); }}>
                  <Plus size={10} className="text-white" />
                </button>
                <button className="p-1 hover:bg-white/20 rounded cursor-pointer bg-white/5 border border-white/10" onClick={(e) => { e.stopPropagation(); onResetPosition(node.id); }}>
                  <RotateCcw size={10} className="text-white" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
