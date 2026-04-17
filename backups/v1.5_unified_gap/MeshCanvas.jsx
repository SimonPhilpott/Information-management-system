import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ENTITY_TYPES, SCHEMAS } from '../../data/nodes';

export const MeshCanvas = ({ 
  nodes, 
  view, 
  layoutRules = { directionalLocking: true, unifiedSyncPoints: true },
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
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    const absDX = Math.abs(dx);
    const absDY = Math.abs(dy);

    if (!layoutRules.directionalLocking) {
       // Original flexible fallback logic
       const isBelow = dy > absDX * 1.5;
       const isLeft = dx < -50; 
       if (isBelow) return { start: { x: p.x + NODE_W / 2, y: p.y + NODE_H, dir: 'V' }, end: { x: c.x + NODE_W / 2, y: c.y } };
       else if (isLeft) return { start: { x: p.x, y: p.y + NODE_H / 2, dir: 'H' }, end: { x: c.x + NODE_W, y: c.y + NODE_H / 2 } };
       else return { start: { x: p.x + NODE_W, y: p.y + NODE_H / 2, dir: 'H' }, end: { x: c.x, y: c.y + NODE_H / 2 } };
    }

    // Apply unified sync points - exact center ports
    const dir = c.branchDir || 'Right'; // Fallback to Right if untagged
    
    if (dir === 'Right') {
       return { start: { x: p.x + NODE_W, y: p.y + NODE_H / 2, dir: 'H' }, end: { x: c.x, y: c.y + NODE_H / 2, dir: 'H' } };
    } else if (dir === 'Left') {
       return { start: { x: p.x, y: p.y + NODE_H / 2, dir: 'H' }, end: { x: c.x + NODE_W, y: c.y + NODE_H / 2, dir: 'H' } };
    } else if (dir === 'Down') {
       return { start: { x: p.x + NODE_W / 2, y: p.y + NODE_H, dir: 'V' }, end: { x: c.x + NODE_W / 2, y: c.y, dir: 'V' } };
    } else if (dir === 'Up') {
       return { start: { x: p.x + NODE_W / 2, y: p.y, dir: 'V' }, end: { x: c.x + NODE_W / 2, y: c.y + NODE_H, dir: 'V' } };
    } else if (dir === 'VerticalList') {
       return { start: { x: p.x + 10, y: p.y + NODE_H / 2, dir: 'V' }, end: { x: c.x, y: c.y + NODE_H / 2, dir: 'H' } };
    }

    // Default Fallback
    return { start: { x: p.x + NODE_W, y: p.y + NODE_H / 2, dir: 'H' }, end: { x: c.x, y: c.y + NODE_H / 2, dir: 'H' } };
  };

  const getPath = (start, end) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    // Internalized Premium Tension Constants (Locked Aesthetic)
    const BASE_TENSION = 0.45;
    const OVERLAP_TENSION = 0.8;
    const OVERLAP_THRESHOLD = 250;
    const BIAS_STRENGTH = 0.001;

    if (start.dir === 'H') {
      const baseTension = dx * BASE_TENSION;
      const threshold = OVERLAP_THRESHOLD;
      
      if (Math.abs(dy) > threshold) {
          const superTension = dx * OVERLAP_TENSION; 
          const shiftBias = Math.min(0.65, (Math.abs(dy) - threshold) * BIAS_STRENGTH); 
          
          const exitTension = superTension * (0.5 + shiftBias);
          const entryTension = superTension * (0.5 - (shiftBias * 0.2)); 
          
          return `M ${start.x} ${start.y} C ${start.x + exitTension} ${start.y}, ${end.x - entryTension} ${end.y}, ${end.x} ${end.y}`;
      }
      return `M ${start.x} ${start.y} C ${start.x + baseTension} ${start.y}, ${end.x - baseTension} ${end.y}, ${end.x} ${end.y}`;
    } else {
      const baseTension = dy * BASE_TENSION;
      const threshold = OVERLAP_THRESHOLD;

      if (Math.abs(dx) > threshold) {
          const superTension = dy * OVERLAP_TENSION;
          const shiftBias = Math.min(0.65, (Math.abs(dx) - threshold) * BIAS_STRENGTH); 
          
          const exitTension = superTension * (0.5 + shiftBias);
          const entryTension = superTension * (0.5 - (shiftBias * 0.2)); 
          
          return `M ${start.x} ${start.y} C ${start.x} ${start.y + exitTension}, ${end.x} ${end.y - entryTension}, ${end.x} ${end.y}`;
      }
      return `M ${start.x} ${start.y} C ${start.x} ${start.y + baseTension}, ${end.x} ${end.y - baseTension}, ${end.x} ${end.y}`;
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
      setHoveredNodeId(null);
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
                const pathData = getPath(start, end);
                const lid = `${parent.id}-${node.id}`;
                const isHovered = lid === hoveredLinkId;
                links.push(
                    <g key={lid} className="group cursor-pointer">
                        <path d={pathData} fill="none" stroke="transparent" strokeWidth={30} 
                          onMouseEnter={() => { 
                            setHoveredLinkId(lid); 
                            setHoveredLinkData({ 
                                from: parent.title, 
                                to: node.title, 
                                fromType: parent.type,
                                toType: node.type,
                                type: 'Structural Thread' 
                            }); 
                          }} 
                          onMouseLeave={() => { setHoveredLinkId(null); setHoveredLinkData(null); }} 
                          onClick={() => onLinkClick(node.id)} className="pointer-events-auto" />
                        <path d={pathData} fill="none" stroke={color} strokeWidth={isHovered ? 2 : 1} strokeOpacity={isHovered ? 0.8 : 0.3} className="transition-all duration-300" />
                        <path d={pathData} fill="none" stroke={color} strokeWidth={isHovered ? 4 / view.scale : 2 / view.scale} strokeOpacity={isHovered ? 0.6 : 0.3} className="connection-pulse opacity-20 dark:opacity-100" style={{ filter: 'url(#meshglow)' }} />
                    </g>
                );
            }
          }
          if (node.secondaryLinks) {
            node.secondaryLinks.forEach((targetId, idx) => {
                const target = nodes.find(n => n.id === targetId);
                if (target) {
                    const { start, end } = getAnchors(node, target);
                    const pathData = getPath(start, end);
                    const lid = `${node.id}-sec-${targetId}`;
                    const isHovered = lid === hoveredLinkId;
                    links.push(
                        <g key={lid} className="group cursor-pointer">
                           <path d={pathData} fill="none" stroke="transparent" strokeWidth={30} 
                              onMouseEnter={() => { 
                                setHoveredLinkId(lid); 
                                setHoveredLinkData({ 
                                    from: node.title, 
                                    to: target.title, 
                                    fromType: node.type,
                                    toType: target.type,
                                    type: 'Transverse Thread' 
                                }); 
                              }} 
                              onMouseLeave={() => { setHoveredLinkId(null); setHoveredLinkData(null); }} onClick={() => onLinkClick(target.id)} className="pointer-events-auto" />
                           <path d={pathData} fill="none" stroke={isHovered ? "#00f0ff" : "currentColor"} strokeWidth={isHovered ? 2 / view.scale : 1 / view.scale} strokeOpacity={isHovered ? 0.8 : 0.4} strokeDasharray={isHovered ? "none" : "5,5"} className="transition-all duration-300 text-slate-400 dark:text-white" />
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
            drag="true"
            className={`absolute w-56 p-1 cursor-move touch-none ${draggedNodeId === node.id ? 'z-50' : 'transition-all duration-500 z-20'} ${isDimmed ? 'opacity-20 scale-95 blur-[2px]' : 'opacity-100 scale-100'}`} 
            style={{ left: node.x, top: node.y }}
          >
            <div 
              className={`border-t-2 rounded-lg p-4 shadow-xl relative transition-all ${draggedNodeId === node.id ? 'scale-105 shadow-brand-cyan/20' : ''} ${isRelated && node.id !== hoveredNodeId ? 'ring-2 ring-white/20' : ''}`} 
              style={{ 
                borderTopColor: color, 
                backgroundColor: 'var(--node-bg)',
                border: '1px solid var(--node-border)',
                borderTop: `3px solid ${color}`,
                backdropFilter: 'blur(10px)',
                boxShadow: completeness > 0 ? `0 10px 30px rgba(0,0,0,0.05), 0 0 ${15 * completeness}px ${color}${Math.floor(completeness * 60).toString(16).padStart(2, '0')}` : 'none' 
              }}
            >
              <div 
                className="absolute top-1 right-1 flex gap-1 opacity-60 hover:opacity-100 transition-opacity z-50 pointer-events-auto"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onMouseEnter={(e) => { e.stopPropagation(); setHoveredNodeId(null); }}
                onMouseLeave={(e) => { e.stopPropagation(); setHoveredNodeId(node.id); }}
              >
                <button 
                  className="p-1 hover:bg-white/20 rounded cursor-pointer bg-white/5 border border-white/10 transition-colors"
                  onClick={(e) => { e.stopPropagation(); setHoveredNodeId(null); onAddOffshoot(node.id); }}
                  title="Add Connected Offshoot"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                </button>
                <button 
                  className="p-1 hover:bg-white/20 rounded cursor-pointer bg-white/5 border border-white/10 transition-colors"
                  onClick={(e) => { e.stopPropagation(); setHoveredNodeId(null); onResetPosition(node.id); }}
                  title="Restore Original Position"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                </button>
              </div>

              <div className="flex items-center gap-1.5 mb-2 pointer-events-none">
                 <div className="w-1 h-3 rounded-full shadow-[0_0_10px_currentColor] animate-pulse" style={{ backgroundColor: color, color: color }} />
                 <span className="text-[9px] font-bold tracking-[0.1em] text-slate-500">{config.label}</span>
              </div>
              <h3 className="font-bold text-white leading-tight tracking-tight mb-3 pointer-events-none italic" style={{ fontSize: isLODLow ? '22px' : '13px' }}>{node.title}</h3>
            </div>
          </div>
        );
      })}
    </div>
  );
};
