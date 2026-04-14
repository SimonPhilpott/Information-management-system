import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ENTITY_TYPES } from '../../data/nodes';

export const MeshCanvas = ({ 
  nodes, 
  view, 
  onSelectNode, 
  onAddOffshoot, 
  hoveredNodeId, 
  setHoveredNodeId,
  hoveredLinkId,
  setHoveredLinkId,
  setHoveredLinkData,
  onNodeDrag,
  onNodeDragEnd,
  onResetPosition,
  onLinkClick
}) => {
  const NODE_W = 224;
  const NODE_H = 100;
  const [draggedNodeId, setDraggedNodeId] = useState(null);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [hasMovedDuringDrag, setHasMovedDuringDrag] = useState(false);

  const calculateCompleteness = (node) => {
    const typeKey = node.type?.toUpperCase() || 'CONCEPT';
    const fields = SCHEMAS[typeKey] || SCHEMAS.CONCEPT;
    const filledFields = fields.filter(f => node.content && node.content[f.name] && node.content[f.name].trim().length > 0).length;
    return filledFields / fields.length;
  };

  const getAnchors = (p, c) => {
    const pCenter = { x: p.x + NODE_W / 2, y: p.y + NODE_H / 2 };
    const cCenter = { x: c.x + NODE_W / 2, y: c.y + NODE_H / 2 };
    const dx = cCenter.x - pCenter.x;
    const dy = cCenter.y - pCenter.y;
    if (Math.abs(dy) > Math.abs(dx) * 0.8) {
      if (dy > 0) return { start: { x: pCenter.x, y: p.y + NODE_H }, end: { x: cCenter.x, y: c.y } };
      return { start: { x: pCenter.x, y: p.y }, end: { x: cCenter.x, y: c.y + NODE_H } };
    } else {
      if (dx > 0) return { start: { x: p.x + NODE_W, y: pCenter.y }, end: { x: c.x, y: cCenter.y } };
      return { start: { x: p.x, y: pCenter.y }, end: { x: c.x + NODE_W, y: cCenter.y } };
    }
  };

  const handlePointerDown = (e, id) => {
    e.stopPropagation();
    setDraggedNodeId(id);
    setDragStartPos({ x: e.clientX, y: e.clientY });
    setHasMovedDuringDrag(false);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e, id) => {
    if (draggedNodeId !== id) return;
    const dx = (e.clientX - dragStartPos.x) / view.scale;
    const dy = (e.clientY - dragStartPos.y) / view.scale;
    
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) setHasMovedDuringDrag(true);
    onNodeDrag(id, dx, dy);
    
    // We update the dragStartPos to the current cursor position after applying the delta
    // so that the next movement call only gets the NEW delta.
    setDragStartPos({ x: e.clientX, y: e.clientY });
  };

  const handlePointerUp = (e, node) => {
    setDraggedNodeId(null);
    onNodeDragEnd(draggedNodeId);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!hasMovedDuringDrag) {
      onSelectNode(node);
    }
  };

  return (
    <div className="absolute inset-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: '0 0' }}>
      <svg className="absolute top-0 left-0 w-full h-full overflow-visible z-0">
        <defs><filter id="meshglow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5" result="blur" /><feComposite in="SourceGraphic" in2="blur" operator="over" /></filter></defs>
        {nodes.map(node => {
          const links = [];
          if (node.parentId) {
            const parent = nodes.find(n => n.id === node.parentId);
            if (parent) {
                const { start, end } = getAnchors(parent, node);
                const color = ENTITY_TYPES[node.type?.toUpperCase()]?.color || '#fff';
                const cp1x = start.x + (end.x - start.x) / 2;
                const pathData = `M ${start.x} ${start.y} C ${cp1x} ${start.y}, ${cp1x} ${end.y}, ${end.x} ${end.y}`;
                const lid = `${parent.id}-${node.id}`;
                const isHovered = lid === hoveredLinkId;
                links.push(
                    <g key={lid} className="group cursor-pointer">
                        <path d={pathData} fill="none" stroke="transparent" strokeWidth={30} 
                          onMouseEnter={() => { setHoveredLinkId(lid); setHoveredLinkData({ from: parent.title, to: node.title, type: 'Inherited Logic' }); }} 
                          onMouseLeave={() => { setHoveredLinkId(null); setHoveredLinkData(null); }} 
                          onClick={() => onLinkClick(node.id)} className="pointer-events-auto" />
                        <path d={pathData} fill="none" stroke={color} strokeWidth={isHovered ? 2 : 1} strokeOpacity={isHovered ? 0.8 : 0.15} className="transition-all duration-300" />
                        <path d={pathData} fill="none" stroke={color} strokeWidth={isHovered ? 4 / view.scale : 2 / view.scale} strokeOpacity={isHovered ? 0.6 : 0.3} className="connection-pulse" style={{ filter: 'url(#meshglow)' }} />
                    </g>
                );
            }
          }
          if (node.secondaryLinks) {
            node.secondaryLinks.forEach((targetId, idx) => {
                const target = nodes.find(n => n.id === targetId);
                if (target) {
                    const { start, end } = getAnchors(node, target);
                    const pathData = `M ${start.x} ${start.y} Q ${(start.x + end.x)/2} ${(start.y + end.y)/2 - 80}, ${end.x} ${end.y}`;
                    const lid = `${node.id}-sec-${targetId}`;
                    const isHovered = lid === hoveredLinkId;
                    links.push(
                        <g key={lid} className="group cursor-pointer">
                           <path d={pathData} fill="none" stroke="transparent" strokeWidth={30} 
                              onMouseEnter={() => { setHoveredLinkId(lid); setHoveredLinkData({ from: node.title, to: target.title, type: 'Strategic Integration' }); }} 
                              onMouseLeave={() => { setHoveredLinkId(null); setHoveredLinkData(null); }} onClick={() => onLinkClick(target.id)} className="pointer-events-auto" />
                           <path d={pathData} fill="none" stroke={isHovered ? "#00f0ff" : "#fff"} strokeWidth={isHovered ? 2 / view.scale : 1 / view.scale} strokeOpacity={isHovered ? 0.8 : 0.15} strokeDasharray={isHovered ? "none" : "5,5"} className="transition-all duration-300" />
                        </g>
                    );
                }
            });
          }
          return links;
        })}
      </svg>

      {nodes.map(node => {
        const config = ENTITY_TYPES[node.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT;
        const color = config.color;
        const isLODLow = view.scale < 0.45;
        
        // Impact Analysis: Determine if this node is related to the hovered node
        let isRelated = false;
        let isDimmed = false;
        if (hoveredNodeId) {
            if (node.id === hoveredNodeId) isRelated = true;
            else {
                const hoveredNode = nodes.find(n => n.id === hoveredNodeId);
                // Child of hovered
                if (node.parentId === hoveredNodeId) isRelated = true;
                // Parent of hovered
                if (hoveredNode && hoveredNode.parentId === node.id) isRelated = true;
                // Secondary link
                if (hoveredNode && hoveredNode.secondaryLinks?.includes(node.id)) isRelated = true;
                if (node.secondaryLinks?.includes(hoveredNodeId)) isRelated = true;
                
                if (!isRelated) isDimmed = true;
            }
        }

        let filled = 0; if (node.content) { Object.values(node.content).forEach(v => { if(v && v.trim()) filled++; }); }
        const completeness = filled / 3;

        return (
          <div 
            key={node.id} 
            onPointerDown={(e) => handlePointerDown(e, node.id)} 
            onPointerMove={(e) => handlePointerMove(e, node.id)} 
            onPointerUp={(e) => handlePointerUp(e, node)} 
            onMouseEnter={() => setHoveredNodeId(node.id)} 
            onMouseLeave={() => setHoveredNodeId(null)} 
            className={`absolute w-56 p-1 z-20 cursor-move touch-none transition-all duration-500 ${isDimmed ? 'opacity-20 scale-95 blur-[2px]' : 'opacity-100 scale-100'}`} 
            style={{ left: node.x, top: node.y, zIndex: isRelated ? 50 : 20 }}
          >
            <div 
              className={`bg-[#0c0d12]/98 border-t-2 rounded-lg p-5 shadow-2xl relative transition-all ${draggedNodeId === node.id ? 'scale-105 shadow-brand-cyan/20' : ''} ${isRelated && node.id !== hoveredNodeId ? 'ring-2 ring-white/20' : ''}`} 
              style={{ 
                borderTopColor: color, 
                boxShadow: completeness > 0 ? `0 0 ${20 * completeness}px ${color}${Math.floor(completeness * 100).toString(16).padStart(2, '0')}` : 'none' 
              }}
            >
              <div 
                className="absolute top-4 right-4 opacity-40 hover:opacity-100 transition-opacity z-30"
                onMouseEnter={(e) => { e.stopPropagation(); setHoveredNodeId(null); }}
                onMouseLeave={(e) => { e.stopPropagation(); setHoveredNodeId(node.id); }}
              >
                <div 
                  className="p-1.5 hover:bg-white/20 rounded-md cursor-pointer bg-white/5 border border-white/10 transition-colors"
                  onClick={(e) => { e.stopPropagation(); onResetPosition(node.id); }}
                  title="Restore Original Position"
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                </div>
              </div>

              <div className="flex items-center gap-1.5 mb-2 pointer-events-none">
                 <div className="w-1 h-3 rounded-full shadow-[0_0_10px_currentColor] animate-pulse" style={{ backgroundColor: color, color: color }} />
                 <span className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-500">{config.label}</span>
              </div>
              <h3 className="font-black text-white leading-tight tracking-tight mb-3 pointer-events-none italic uppercase" style={{ fontSize: isLODLow ? '22px' : '13px' }}>{node.title}</h3>
              {!isLODLow && (
                <div className="space-y-2">
                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full transition-all duration-1000" style={{ width: `${completeness * 100}%`, backgroundColor: color }} />
                    </div>
                    <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onAddOffshoot(node.id); }} className="text-[8px] w-full py-2 bg-brand-cyan/5 hover:bg-brand-cyan/10 border border-brand-cyan/20 transition-all rounded font-black uppercase tracking-widest text-brand-cyan">Context_Link</button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
