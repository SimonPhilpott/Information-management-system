import React, { useState, useEffect, useRef } from 'react';
import { ENTITY_TYPES, SCHEMAS, INITIAL_NODES } from './data/nodes';
import { MeshCanvas } from './components/KnowledgeMesh/MeshCanvas';
import { OrbitalNav } from './components/Navigation/OrbitalNav';
import { StatusSidebars } from './components/Dashboard/StatusSidebars';
import { IntelligenceDrawer } from './components/Editor/IntelligenceDrawer';
import { AdminPanel } from './components/Admin/AdminPanel';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Link as LinkIcon } from 'lucide-react';

export default function App() {
  const [nodes, setNodes] = useState(() => {
    try {
      const stored = localStorage.getItem('hive_mesh_pdf_ready_v1.0');
      const data = stored ? JSON.parse(stored) : INITIAL_NODES;
      return data.map(n => ({ ...n, ox: n.ox ?? n.x, oy: n.oy ?? n.y }));
    } catch { return INITIAL_NODES.map(n => ({ ...n, ox: n.x, oy: n.y })); }
  });

  const [view, setView] = useState({ x: 0, y: 0, scale: 0.8 });
  const [dragType, setDragType] = useState(null);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
  const [stickPos, setStickPos] = useState({ x: 0, y: 0 });
  
  // GLOBAL HUD STATE
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [hoveredLinkId, setHoveredLinkId] = useState(null);
  const [hoveredLinkData, setHoveredLinkData] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const [selectedNode, setSelectedNode] = useState(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  const [editingNode, setEditingNode] = useState(null);
  const [activeParentId, setActiveParentId] = useState(null);
  const [currentType, setCurrentType] = useState('CONCEPT');
  const [formData, setFormData] = useState({ title: '', content: {} });

  const containerRef = useRef(null);
  const requestRef = useRef();
  const stickRef = useRef({ x: 0, y: 0 });
  const draggedNodeIdRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('hive_mesh_pdf_ready_v1.0', JSON.stringify(nodes));
  }, [nodes]);

  useEffect(() => {
    const handleGlobalMouse = (e) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handleGlobalMouse);
    return () => window.removeEventListener('mousemove', handleGlobalMouse);
  }, []);

  useEffect(() => {
    const rootNode = nodes.find(n => n.id === 'tt_group') || nodes[0];
    if (rootNode) centerOnNode(rootNode);
  }, []);

  const centerOnNode = (node) => {
    const scale = 0.8;
    const centerX = window.innerWidth / 2 - (node.x + 112) * scale;
    const centerY = window.innerHeight / 2 - (node.y + 50) * scale;
    setView({ x: centerX, y: centerY, scale });
    setSelectedNode(node);
  };

  const animate = () => {
    const { x: sx, y: sy } = stickRef.current;
    if (sx !== 0 || sy !== 0) {
      setView(v => ({...v, x: v.x - (sx * (14/v.scale)), y: v.y - (sy * (14/v.scale)) }));
    }
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    stickRef.current = stickPos;
  }, [stickPos]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, []);

  const applyZoomAt = (mx, my, factor) => {
    setView(v => {
      const newScale = Math.min(Math.max(v.scale * factor, 0.1), 3);
      const zoomRatio = newScale / v.scale;
      return { x: mx - (mx - v.x) * zoomRatio, y: my - (my - v.y) * zoomRatio, scale: newScale };
    });
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    applyZoomAt(e.clientX, e.clientY, factor);
  };

  const handleMouseDown = (e) => {
    if (e.target === containerRef.current) {
        if (isEditorOpen) setIsEditorOpen(false);
        if (isAdminOpen) setIsAdminOpen(false);
        if (e.button === 0) setDragType('pan');
        if (e.button === 2) { e.preventDefault(); setDragType('zoom'); }
        setLastPos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e) => {
    if (!dragType) return;
    const dx = e.clientX - lastPos.x;
    const dy = e.clientY - lastPos.y;
    if (dragType === 'pan') setView(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
    else if (dragType === 'zoom') applyZoomAt(e.clientX, e.clientY, 1 - dy * 0.005);
    setLastPos({ x: e.clientX, y: e.clientY });
  };

  const getTooltipPos = (width = 320, height = 200) => {
    let tx = mousePos.x + 20; let ty = mousePos.y + 20;
    if (tx + width > window.innerWidth) tx = mousePos.x - width - 20;
    if (ty + height > window.innerHeight) ty = mousePos.y - height - 20;
    return { x: tx, y: ty };
  };

  return (
    <div className="flex h-screen p-8 gap-8 bg-[#000105] text-slate-100 antialiased overflow-hidden select-none relative font-['Outfit']">
      <div className="fixed inset-0 pointer-events-none opacity-30">
        <div className="absolute top-0 right-1/4 w-[900px] h-[900px] bg-brand-cyan/20 blur-[180px] rounded-full -translate-y-1/2" />
        <div className="absolute bottom-0 left-1/4 w-[700px] h-[700px] bg-brand-purple/20 blur-[150px] rounded-full translate-y-1/2" />
      </div>

      {/* TOP-LEVEL HUD TOOLTIP PORTAL (No scaling/transforms) */}
      <div className="fixed inset-0 pointer-events-none z-[1000000]">
          <AnimatePresence mode="wait">
            {hoveredNodeId && (
              <motion.div
                key={`hud-node-${hoveredNodeId}`}
                initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="fixed bg-[#08090d]/98 backdrop-blur-3xl border border-white/10 p-8 rounded-2xl shadow-[0_40px_120px_black] w-80 pointer-events-none border-t-4"
                style={{ 
                    left: getTooltipPos(320, 200).x, 
                    top: getTooltipPos(320, 200).y, 
                    borderTopColor: ENTITY_TYPES[nodes.find(n => n.id === hoveredNodeId)?.type]?.color 
                }}
              >
                 <div className="flex items-center gap-2 mb-4">
                    <Activity size={12} className="text-brand-cyan" />
                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-brand-cyan">Operational_Extract</span>
                 </div>
                 <h4 className="text-white font-bold text-sm mb-2 italic tracking-tighter">{nodes.find(n => n.id === hoveredNodeId).title}</h4>
                 <p className="text-[12px] text-slate-300 leading-relaxed italic mb-4 font-light">
                   {nodes.find(n => n.id === hoveredNodeId).content?.Summary || 'Protocol metadata pending induction...'}
                 </p>
              </motion.div>
            )}

            {hoveredLinkId && hoveredLinkData && (
              <motion.div
                key="hud-link"
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="fixed bg-slate-900/98 backdrop-blur-3xl border border-brand-cyan p-5 rounded-2xl z-[1000001] shadow-[0_30px_90px_black] pointer-events-none border-l-4 w-96"
                style={{ left: getTooltipPos(384, 100).x, top: getTooltipPos(384, 100).y }}
              >
                 <div className="flex items-center gap-3 mb-2 font-black uppercase tracking-[0.2em] text-[10px]">
                    <LinkIcon size={12} className="text-brand-cyan" />
                    <span className="text-brand-cyan">{hoveredLinkData.type}</span>
                 </div>
                 <p className="text-[13px] text-white font-medium italic">{hoveredLinkData.from} <span className="text-slate-600 not-italic mx-2">→</span> {hoveredLinkData.to}</p>
                 <div className="text-[7px] text-slate-500 mt-3 uppercase font-black tracking-widest leading-none border-t border-white/5 pt-3">Click thread to focus destination</div>
              </motion.div>
            )}
          </AnimatePresence>
      </div>

      <StatusSidebars nodes={nodes} isCollapsed={isSidebarCollapsed} onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)} selectedNode={selectedNode} />

      <section 
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-black/40 rounded-3xl border border-white/5 shadow-2xl"
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={() => setDragType(null)} onMouseLeave={() => setDragType(null)} onContextMenu={(e) => e.preventDefault()}
        onWheel={handleWheel}
      >
        <MeshCanvas 
           nodes={nodes} view={view} 
           hoveredNodeId={hoveredNodeId} setHoveredNodeId={setHoveredNodeId}
           hoveredLinkId={hoveredLinkId} setHoveredLinkId={setHoveredLinkId} setHoveredLinkData={setHoveredLinkData}
           onSelectNode={(n) => { setSelectedNode(n); setIsEditorOpen(true); setEditingNode(n); setCurrentType(n.type); setFormData({ title: n.title, content: n.content || {} }); }} 
           onAddOffshoot={(id) => { setActiveParentId(id); setIsEditorOpen(true); setEditingNode(null); setFormData({ title: '', content: {} }); }} 
           onNodeDrag={(id, dx, dy) => { 
             draggedNodeIdRef.current = id; 
             setNodes(prev => {
                const node = prev.find(n => n.id === id);
                if (!node) return prev;
                const nx = node.x + dx;
                const ny = node.y + dy;
                
                const hasCollision = prev.some(other => {
                    if (other.id === id) return false;
                    // Detect if center-to-center distance is too small for the node boxes (224x100)
                    const dx = Math.abs(nx - other.x);
                    const dy = Math.abs(ny - other.y);
                    return dx < 240 && dy < 120;
                });

                if (hasCollision) return prev;
                return prev.map(n => n.id === id ? { ...n, x: nx, y: ny } : n);
             });
           }}
           onNodeDragEnd={(id) => {
             draggedNodeIdRef.current = null;
           }}
           onResetPosition={(id) => {
             setNodes(prev => prev.map(n => n.id === id ? { ...n, x: n.ox, y: n.oy } : n));
           }}
           onLinkClick={(tid) => { const t = nodes.find(n => n.id === tid); if (t) centerOnNode(t); }}
        />
        <OrbitalNav nodes={nodes} view={view} setView={setView} stickPos={stickPos} setStickPos={setStickPos} onOpenAdmin={() => setIsAdminOpen(true)} />
      </section>

      <AnimatePresence>
        {isEditorOpen && (
          <IntelligenceDrawer isOpen={isEditorOpen} onClose={() => setIsEditorOpen(false)} editingNode={editingNode} currentType={currentType} setCurrentType={setCurrentType} formData={formData} setFormData={setFormData} onSave={() => setIsEditorOpen(false)} />
        )}
        {isAdminOpen && (
          <AdminPanel 
            nodes={nodes} 
            isOpen={isAdminOpen} 
            onClose={() => setIsAdminOpen(false)} 
            onFocusNode={(n) => { 
                centerOnNode(n); 
                setEditingNode(n); 
                setCurrentType(n.type); 
                setFormData({ title: n.title, content: n.content || {} });
                setIsEditorOpen(true); 
            }} 
            onReset={() => { localStorage.removeItem('hive_mesh_pdf_ready_v1.0'); window.location.reload(); }} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
