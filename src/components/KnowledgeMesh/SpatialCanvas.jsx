import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Stars, Environment, Line, Text, Billboard, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { ENTITY_TYPES } from '../../data/nodes';
import { motion, AnimatePresence } from 'framer-motion';
import { MoveRight, Zap, Activity } from 'lucide-react';

const NodeLabel = React.memo(({ node, config, isHovered, onHover, onClick, isSelected, showLabels, labelStyle }) => {
  const containerRef = useRef();
  const { camera } = useThree();
  const worldPos = useMemo(() => new THREE.Vector3(node.z_x, node.z_y, node.z_z), [node.z_x, node.z_y, node.z_z]);
  const [isVisible, setIsVisible] = useState(true);
  const frameCount = useRef(0);
  const isActive = isHovered;

  const [uHover, setUHover] = useState(0);

  useFrame((state, delta) => {
    // 1. Throttled culling check (once every 6 frames)
    if (frameCount.current % 6 === 0) {
      const dist = camera.position.distanceTo(worldPos);
      const visible = dist < 22000;
      if (visible !== isVisible) setIsVisible(visible);
    }
    
    // 2. Smooth Lerp for Node Hover & Scale
    const targetHover = isActive ? 1.0 : 0.0;
    const nextHover = THREE.MathUtils.lerp(uHover, targetHover, delta * 4.0);
    if (Math.abs(nextHover - uHover) > 0.001) setUHover(nextHover);

    if (isActive && containerRef.current) {
      const dist = camera.position.distanceTo(worldPos);
      const scale = Math.max(0.4, Math.min(1.0, 15000 / dist)) * (0.95 + uHover * 0.05);
      containerRef.current.style.transform = `translate(-50%, -50%) scale(${scale})`;
      containerRef.current.style.opacity = uHover.toString();
      containerRef.current.style.pointerEvents = uHover > 0.1 ? 'auto' : 'none';
    }
    
    frameCount.current++;
  });

  const hoverTimeout = useRef();
  const handlePointerOver = (e) => {
    e.stopPropagation();
    hoverTimeout.current = setTimeout(() => onHover(node.id), 120);
  };
  const handlePointerOut = (e) => {
    e.stopPropagation();
    clearTimeout(hoverTimeout.current);
    onHover(null);
  };

  const [clickCount, setClickCount] = useState(0);

  return (
    <group 
      renderOrder={999}
      onPointerOver={(e) => { e.stopPropagation(); onHover(node.id); }}
      onPointerOut={handlePointerOut} 
      onClick={(e) => { 
        e.stopPropagation(); 
        onClick(node);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (onOpenDrawer) onOpenDrawer(node); 
      }}
    >
      {isActive && (
        <Html position={[0, 0, 0]} center ref={containerRef} style={{ pointerEvents: 'none', transition: 'opacity 0.2s' }}>
           <div className="w-[448px] glass-panel border-t-4 p-8 flex flex-col shadow-3xl pointer-events-auto" style={{ borderTopColor: config.color, backgroundColor: 'rgba(5, 5, 15, 0.95)' }}>
             <div className="flex items-center gap-2 mb-4">
               <Activity size={12} className="text-brand-cyan" />
               <span className="text-[10px] font-bold tracking-[0.1em] text-brand-cyan uppercase">Intelligence Pulse</span>
             </div>
             
             <div className="flex flex-col mb-6">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1.5">{config.label}</span>
                <h4 className="text-white font-bold text-4xl italic tracking-tighter leading-none">{node.title}</h4>
             </div>

             <p className="text-[14px] text-slate-300 leading-relaxed italic mb-8 border-b border-white/5 pb-8">
               {node.content?.['Definition Summary'] || node.content?.Summary || 'No structural summary available for this sector.'}
             </p>

             <div className="flex flex-col gap-4">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Metadata Fabric</span>
                <div className="grid grid-cols-2 gap-4">
                   <div className="flex flex-col gap-1 p-3 rounded-xl bg-white/5 border border-white/5">
                      <span className="text-[8px] font-bold text-slate-500 uppercase">Sector Status</span>
                      <span className="text-[11px] font-bold text-brand-cyan uppercase">Operational</span>
                   </div>
                   <div className="flex flex-col gap-1 p-3 rounded-xl bg-white/5 border border-white/5">
                      <span className="text-[8px] font-bold text-slate-500 uppercase">Sync Level</span>
                      <span className="text-[11px] font-bold text-brand-purple uppercase">LOD High</span>
                   </div>
                </div>
             </div>

             <div className="mt-8 pt-6 border-t border-white/5 flex justify-between items-center text-slate-500">
                <div className="flex items-center gap-2">
                   <Zap size={10} />
                   <span className="text-[9px] font-bold uppercase tracking-widest font-mono">ID: {node.id.split('_').pop()}</span>
                </div>
                <div className="text-[9px] font-bold uppercase tracking-widest italic group-hover:text-brand-cyan transition-colors">Double Click to Edit</div>
             </div>
           </div>
        </Html>
      )}
      {/* 1. NATIVE WEBGL PILL */}
      {showLabels && labelStyle === 'pill' && isVisible && (
        <Billboard>
          {(() => {
             const pillWidth = node.title.length * 28 + 120;
             const pillHeight = 100;
             return (
               <mesh position={[0, 0, -1]}>
                 <planeGeometry args={[pillWidth, pillHeight]} />
                 <shaderMaterial
                   transparent
                   depthTest={true}
                   depthWrite={true}
                   uniforms={{
                     color: { value: new THREE.Color(config.color) },
                     bgColor: { value: new THREE.Color("#050510") },
                     aspect: { value: pillWidth / pillHeight }
                   }}
                   vertexShader={`
                     varying vec2 vUv;
                     void main() {
                         vUv = uv;
                         gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                     }
                   `}
                   fragmentShader={`
                     uniform vec3 color;
                     uniform vec3 bgColor;
                     uniform float aspect;
                     varying vec2 vUv;
 
                      float sdRoundedBox(vec2 p, vec2 b, float r) {
                          vec2 q = abs(p) - b + r;
                          return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
                      }
 
                      void main() {
                          vec2 p = (vUv * 2.0 - 1.0) * vec2(aspect, 1.0);
                          float radius = 0.9;
                          float d = sdRoundedBox(p, vec2(aspect, 1.0), radius);
                          
                          if (d > 0.0) discard;
                          
                          float borderThickness = 0.12;
                          float borderMask = smoothstep(-borderThickness, -borderThickness + 0.02, d);
                          vec3 finalColor = mix(bgColor, color, borderMask);
                          
                          gl_FragColor = vec4(finalColor, borderMask > 0.01 ? 1.0 : 0.4);
                      }
                    `}
                  />
                </mesh>
              );
           })()}
           <Text
              position={[0, 0, 1]} 
              fontSize={42}
              color="#ffffff"
              anchorX="center" anchorY="middle"
              fillOpacity={1.0}
              fontWeight={800}
              font="https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/dmserifdisplay/DMSerifDisplay-Regular.ttf"
              depthTest={false}
            >
              {node.title}
           </Text>
        </Billboard>
      )}

      {/* 2. STRATEGIC TEXT */}
      {showLabels && labelStyle === 'standard' && isVisible && (
        <Billboard>
            <Text
              position={[0, 0, 0]} 
              fontSize={42}
              color={config.color}
              anchorX="center" anchorY="middle"
              fillOpacity={1.0}
              fontWeight={800}
              font="https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/dmserifdisplay/DMSerifDisplay-Regular.ttf"
              outlineWidth={0}
              depthTest={false}
            >
              {node.title}
            </Text>
        </Billboard>
      )}
    </group>
  );
});

const NeuralLine = React.memo(({ start, end, color, isHovered, isSecondary = false, hoveredLinkData, setHoveredLinkData, isActivePath = false, hoveredNodeId }) => {
  const lineRef = useRef();
  const [lineHovered, setLineHovered] = useState(false);
  const materialRef = useRef();

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.color.value.set(color);
    }
  }, [color]);

  useFrame((state, delta) => {
    if (materialRef.current) {
      const active = isHovered || lineHovered;
      materialRef.current.uniforms.time.value += delta * (active ? 2.5 : 1.2);
      
      // Multi-Step Radiance Transition (Cinematic Fade)
      const targetHover = active ? 1.0 : 0.0;
      const currentHover = materialRef.current.uniforms.uHover.value;
      materialRef.current.uniforms.uHover.value = THREE.MathUtils.lerp(
        currentHover,
        targetHover,
        delta * 3.5 // Eased transition
      );

      // Active Path Transition (The "Lighting Up" Logic)
      const targetActive = isActivePath ? 1.0 : 0.0;
      const currentActive = materialRef.current.uniforms.uActive.value;
      materialRef.current.uniforms.uActive.value = THREE.MathUtils.lerp(
        currentActive,
        targetActive,
        delta * 3.5 // Eased transition
      );
      
      // Update color only if changed to avoid uniform overhead
      if (materialRef.current.uniforms.color.value.getHex() !== new THREE.Color(color).getHex()) {
          materialRef.current.uniforms.color.value.set(color);
      }
    }
  });

  const points = useMemo(() => {
    const vStart = new THREE.Vector3(start.z_x || 0, start.z_y || 0, start.z_z || 0);
    const vEnd = new THREE.Vector3(end.z_x || 0, end.z_y || 0, end.z_z || 0);
    
    if (vStart.distanceTo(vEnd) < 1) return [vStart, vEnd];

    const mid = new THREE.Vector3().lerpVectors(vStart, vEnd, 0.5);
    
    if (isSecondary) {
      if (mid.length() > 0.1) {
         mid.normalize().multiplyScalar(Math.max(vStart.length(), vEnd.length(), 500) * 1.4);
      } else {
         mid.set(0, 0, 1).multiplyScalar(Math.max(vStart.length(), vEnd.length(), 1000) * 1.4);
      }
    } else {
      if (mid.length() > 0.1) {
         const naturalLength = mid.length();
         mid.normalize().multiplyScalar(naturalLength * 1.05);
      }
    }
    
    const curve = new THREE.QuadraticBezierCurve3(vStart, mid, vEnd);
    return curve.getPoints(16);
  }, [start, end, isSecondary]);

  const midPoint = points[Math.floor(points.length / 2)];
  const [hoverPoint, setHoverPoint] = useState(midPoint);

  const hoverTimeout = useRef();
  const leaveTimeout = useRef();

  const handlePointerOver = (e) => {
    if (hoveredNodeId) return;
    e.stopPropagation();
    if (leaveTimeout.current) clearTimeout(leaveTimeout.current);
    setHoverPoint(e.point);
    hoverTimeout.current = setTimeout(() => {
      setLineHovered(true);
      if (setHoveredLinkData) {
        setHoveredLinkData({
          from: start.title,
          fromType: start.type,
          to: end.title,
          toType: end.type,
          type: isSecondary ? 'Transverse Thread' : 'Structural Pipeline'
        });
      }
    }, 120);
  };

  const handlePointerMove = (e) => {
    if (hoveredNodeId) return;
    e.stopPropagation();
    setHoverPoint(e.point);
  };

  const handlePointerOut = (e) => {
    e.stopPropagation();
    clearTimeout(hoverTimeout.current);
    leaveTimeout.current = setTimeout(() => {
      setLineHovered(false);
      if (setHoveredLinkData) setHoveredLinkData(null);
    }, 150);
  };

  return (
    <group renderOrder={1}>
      <Line
        points={points}
        color={color}
        lineWidth={isActivePath ? 4.5 : (isHovered ? 3.5 : (isSecondary ? 0.8 : 2.2))}
        transparent
        depthTest={true}
        renderOrder={1}
        opacity={(isHovered || isActivePath) ? 1.0 : (isSecondary ? 0.2 : 0.4)}
      >
        <shaderMaterial
          ref={materialRef}
          transparent
          uniforms={{
            color: { value: new THREE.Color(color) },
            time: { value: 0 },
            isSecondary: { value: isSecondary ? 1.0 : 0.0 },
            uActive: { value: 0.0 },
            uHover: { value: 0.0 }
          }}
          vertexShader={`
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            uniform vec3 color;
            uniform float time;
            uniform float isSecondary;
            uniform float uActive;
            uniform float uHover;
            varying vec2 vUv;

            void main() {
              float combinedFocus = max(uActive, uHover);
              float pulseSpeed = mix(2.5, 5.0, combinedFocus);
              float pulseWidth = mix(0.4, 0.8, combinedFocus);
              
              float dist = fract((vUv.x * 12.0) - (time * pulseSpeed));
              float pulse = smoothstep(0.0, 0.5, dist) * smoothstep(1.0, 0.5, dist);
              pulse = pow(pulse, 3.0);
              
              float baseAlpha = isSecondary > 0.5 ? 0.2 : 0.4;
              float finalAlpha = mix(baseAlpha, 1.0, combinedFocus);

              // Cinematic color elevation
              vec3 baseColor = color * (mix(1.5, 3.0, combinedFocus));
              vec3 glowColor = color * (mix(4.0, 10.0, combinedFocus));
              
              vec3 finalColor = mix(baseColor, glowColor, pulse);
              gl_FragColor = vec4(finalColor, finalAlpha);
            }
          `}
        />
      </Line>
      <Line
        points={points}
        lineWidth={80}
        transparent
        opacity={0}
        colorWrite={false}
        depthWrite={false}
        onPointerOver={handlePointerOver}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
      />
    </group>
  );
});

const NeuralMesh = ({ nodes, onSelectNode, hoveredNodeId, setHoveredNodeId, selectedNode, spatialNodes, showLabels, labelStyle, hoveredLinkData, setHoveredLinkData, onOpenDrawer }) => {
  const meshGroup = useRef();
  
  useFrame((state, delta) => {
    const isInteracting = selectedNode || hoveredNodeId || hoveredLinkData;
    
    if (meshGroup.current && !isInteracting) {
      meshGroup.current.rotation.y += delta * 0.05; 
      meshGroup.current.rotation.z += delta * 0.01;
    }
  });

  const activePathIds = useMemo(() => {
    if (!selectedNode) return new Set();
    const path = new Set([selectedNode.id]);
    let curr = spatialNodes.find(n => n.id === selectedNode.id);
    while (curr && curr.parentId) {
      path.add(curr.parentId);
      curr = spatialNodes.find(n => n.id === curr.parentId);
    }
    return path;
  }, [selectedNode, spatialNodes]);

  const links = useMemo(() => {
    const l = [];
    const seen = new Set();
    spatialNodes.forEach(node => {
      if (node.parentId) {
        const p = spatialNodes.find(n => n.id === node.parentId);
        if (p) {
          const lKey = `h-${p.id}-${node.id}`;
          if (!seen.has(lKey)) {
            const childColor = ENTITY_TYPES[node.type?.toUpperCase()]?.color || '#00f2ff';
            l.push({ key: lKey, from: p, to: node, type: 'parent', color: childColor });
            seen.add(lKey);
          }
        }
      }
      (node.secondaryLinks || []).forEach(sid => {
        const target = spatialNodes.find(n => n.id === sid);
        if (target) {
          const lKey = `s-${node.id}-${target.id}`;
          if (!seen.has(lKey)) {
            l.push({ key: lKey, from: node, to: target, type: 'secondary', color: '#444455' });
            seen.add(lKey);
          }
        }
      });
    });
    return l;
  }, [spatialNodes]);

  return (
    <group ref={meshGroup}>
      <group>
        {links.map((link) => (
          <NeuralLine 
            key={`l-${link.key}-${link.color}`} 
            start={link.from} 
            end={link.to} 
            color={link.color} 
            isHovered={hoveredNodeId === link.from.id || hoveredNodeId === link.to.id}
            isSecondary={link.type === 'secondary'}
            hoveredLinkData={hoveredLinkData}
            setHoveredLinkData={setHoveredLinkData}
            isActivePath={activePathIds.has(link.from.id) && activePathIds.has(link.to.id)}
            hoveredNodeId={hoveredNodeId}
          />
        ))}

        {spatialNodes.map(node => {
          const config = ENTITY_TYPES[node.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT;
          const isSelected = selectedNode?.id === node.id;
          const isHovered = hoveredNodeId === node.id;
          
          return (
            <group key={`node-${node.id}`} position={[node.z_x, node.z_y, node.z_z]}>
                <NodeLabel 
                  node={node} config={config} isHovered={isHovered} 
                  onHover={setHoveredNodeId} onClick={onSelectNode} isSelected={isSelected}
                  showLabels={showLabels}
                  labelStyle={labelStyle}
                  isActivePath={activePathIds.has(node.id)}
                  onOpenDrawer={onOpenDrawer}
                />
            </group>
          );
        })}
      </group>
    </group>
  );
};

const CameraController = ({ targetNode }) => {
  const { camera, controls } = useThree();
  const [isCanceled, setIsCanceled] = useState(false);
  
  useEffect(() => { setIsCanceled(false); }, [targetNode]);

  useEffect(() => {
    if (!targetNode || !controls || isCanceled) return;
    
    const targetPos = new THREE.Vector3(targetNode.z_x, targetNode.z_y, targetNode.z_z);
    
    const approachRadius = targetNode.depth === 0 ? 5000 : 2500;
    const cameraOffset = targetPos.clone().normalize().multiplyScalar(approachRadius); 
    if (cameraOffset.length() === 0) cameraOffset.set(0, 0, approachRadius);
    
    const idealPos = targetPos.clone().add(cameraOffset);
    
    const onIntervene = () => setIsCanceled(true);
    controls.addEventListener('start', onIntervene);

    let frameId;
    const animate = () => {
       if (isCanceled) return;
       camera.position.lerp(idealPos, 0.05);
       controls.target.lerp(targetPos, 0.08);
       controls.update();
       if (camera.position.distanceTo(idealPos) > 10) frameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
       cancelAnimationFrame(frameId);
       controls.removeEventListener('start', onIntervene);
    };
  }, [targetNode, camera, controls, isCanceled]);

  return null;
};

export const SpatialCanvas = ({ nodes, onSelectNode, hoveredNodeId, setHoveredNodeId, selectedNode, showLabels, labelStyle, hoveredLinkData, setHoveredLinkData, onOpenDrawer }) => {
  const spatialNodes = useMemo(() => {
    const processed = [];
    const seen = new Set();

    const walk = (nid, depth = 0, thetaRange = [0, Math.PI * 2], phiRange = [0.2, Math.PI - 0.2]) => {
      if (seen.has(nid)) return;
      const node = nodes.find(n => n.id === nid);
      if (!node) return;
      seen.add(nid);

      // BALANCED RADIAL SHELLS
      const radius = depth === 0 ? 0 : 2000 + (depth - 1) * 1800;
      
      // Calculate geometric center of this node's assigned heavenly real estate
      const theta = (thetaRange[0] + thetaRange[1]) / 2;
      const phi = (phiRange[0] + phiRange[1]) / 2;
      
      const z_x = radius * Math.sin(phi) * Math.cos(theta);
      const z_y = radius * Math.sin(phi) * Math.sin(theta);
      const z_z = radius * Math.cos(phi);

      processed.push({ ...node, z_x, z_y, z_z, depth });

      const children = nodes.filter(n => n.parentId === nid);
      if (children.length > 0) {
        // Constriction factor to create 'breathing room' between disparate constellations
        const tSpan = (thetaRange[1] - thetaRange[0]) * 0.85;
        const pSpan = (phiRange[1] - phiRange[0]) * 0.85;
        
        const startT = theta - tSpan / 2;
        const startP = phi - pSpan / 2;

        const N = children.length;
        
        // DYNAMIC SPHERICAL PATCH GRIDDING
        // We split the available surface area into horizontal and vertical slices
        const cols = Math.ceil(Math.sqrt(N));
        const rows = Math.ceil(N / cols);
        
        const pStep = pSpan / rows;

        children.forEach((child, i) => {
          const row = Math.floor(i / cols);
          const col = i % cols;
          
          // Auto-center incomplete final rows
          const itemsInThisRow = (row === rows - 1 && N % cols !== 0) ? N % cols : cols;
          const dynamicTStep = tSpan / itemsInThisRow;
          
          const c_tStart = startT + col * dynamicTStep;
          const c_tEnd = startT + (col + 1) * dynamicTStep;

          const c_pStart = startP + row * pStep;
          const c_pEnd = startP + (row + 1) * pStep;

          walk(child.id, depth + 1, [c_tStart, c_tEnd], [c_pStart, c_pEnd]);
        });
      }
    };

    const roots = nodes.filter(n => !n.parentId);
    roots.forEach((root, i) => {
      const step = (Math.PI * 2) / roots.length;
      walk(root.id, 0, [i * step, (i + 1) * step], [0.4, Math.PI - 0.4]);
    });

    nodes.forEach(n => {
      if (!seen.has(n.id)) {
        processed.push({ ...n, z_x: (Math.random() - 0.5) * 5000, z_y: (Math.random() - 0.5) * 5000, z_z: -1000, depth: 0 });
      }
    });

    return processed;
  }, [nodes]);

  const activeSpatialNode = useMemo(() => 
    selectedNode ? spatialNodes.find(n => n.id === selectedNode.id) : null
  , [selectedNode, spatialNodes]);

  return (
    <div className="w-full h-full bg-black relative">
      <Canvas shadows camera={{ position: [0, 0, 8500], fov: 32, near: 10, far: 500000 }} dpr={[1, 2]}>
        <color attach="background" args={['#000000']} />
        
        <ambientLight intensity={2.5} />
        <directionalLight position={[10000, 10000, 10000]} intensity={3.0} color="#00f2ff" />
        <directionalLight position={[-10000, -10000, 5000]} intensity={1.5} color="#ffffff" />
        
        <OrbitControls 
          makeDefault enableDamping dampingFactor={0.05} rotateSpeed={0.5}
          maxDistance={150000} minDistance={100}
        />
        
        <CameraController targetNode={activeSpatialNode} />
        <NeuralMesh 
          nodes={nodes} 
          onSelectNode={onSelectNode} 
          hoveredNodeId={hoveredNodeId} 
          setHoveredNodeId={setHoveredNodeId} 
          selectedNode={selectedNode} 
          spatialNodes={spatialNodes}
          showLabels={showLabels}
          labelStyle={labelStyle}
          hoveredLinkData={hoveredLinkData}
          setHoveredLinkData={setHoveredLinkData}
          onOpenDrawer={onOpenDrawer}
        />
        
        <Environment preset="night" />
      </Canvas>
    </div>
  );
};
