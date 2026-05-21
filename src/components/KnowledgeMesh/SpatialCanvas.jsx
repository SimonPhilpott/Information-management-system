import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Line, Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { ENTITY_TYPES } from '../../data/nodes';

const WebGLMemoryDisposer = () => {
  const { scene } = useThree();

  useEffect(() => {
    return () => {
      try {
        scene.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
            else obj.material.dispose();
          }
        });
      } catch (e) {
        console.warn('[SpatialCanvas] Disposal Traversal Warning:', e);
      }
    };
  }, [scene]);

  return null;
};

const RefConnector = ({ setCamera, setControls }) => {
  const { camera, controls } = useThree();
  
  useEffect(() => {
    if (camera) setCamera(camera);
  }, [camera, setCamera]);

  useFrame(() => {
    if (controls) setControls(controls);
  });

  return null;
};

function MiniMap({ spatialNodes, camera, controls }) {
  const canvasRef = useRef(null);
  const nodesRef = useRef(spatialNodes);
  
  useEffect(() => {
    nodesRef.current = spatialNodes;
  }, [spatialNodes]);

  useEffect(() => {
    let animationFrameId;
    
    const render = () => {
      animationFrameId = requestAnimationFrame(render);

      const canvas = canvasRef.current;
      if (!canvas || !camera || !controls) return;
      const ctx = canvas.getContext('2d');
      const CW = canvas.width;
      const CH = canvas.height;
      
      const target = controls.target;
      const nodes = nodesRef.current || [];
      if (!nodes.length) return;

      // Project all nodes into camera's local space (X = right, Y = up, Z = deep)
      const projectedNodes = nodes.map(n => {
        const wp = new THREE.Vector3(n.z_x || 0, n.z_y || 0, n.z_z || 0);
        const cp = wp.applyMatrix4(camera.matrixWorldInverse);
        return {
          id: n.id,
          parentId: n.parentId,
          depth: n.depth,
          type: n.type,
          cx: cp.x,
          cy: cp.y,
          cz: cp.z
        };
      });

      // Calculate camera-space bounding box of projected nodes
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      projectedNodes.forEach(cp => {
        minX = Math.min(minX, cp.cx);
        maxX = Math.max(maxX, cp.cx);
        minY = Math.min(minY, cp.cy);
        maxY = Math.max(maxY, cp.cy);
      });

      const pad = 25;
      const worldW = maxX - minX || 100;
      const worldH = maxY - minY || 100;
      
      // Compute fit scale
      const scale = Math.min((CW - pad * 2) / worldW, (CH - pad * 2) / worldH);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      
      const toCanvas = (wx, wy) => [
        CW / 2 + (wx - cx) * scale,
        CH / 2 - (wy - cy) * scale // Invert Y for standard canvas orientation
      ];

      ctx.clearRect(0, 0, CW, CH);

      // Draw premium glassmorphic background styling
      ctx.fillStyle = 'rgba(8, 12, 20, 0.4)';
      ctx.fillRect(0, 0, CW, CH);

      // Draw connection lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 0.5;
      projectedNodes.forEach(n => {
        if (n.parentId) {
          const parent = projectedNodes.find(pn => pn.id === n.parentId);
          if (parent) {
            const [sx, sy] = toCanvas(parent.cx, parent.cy);
            const [tx, ty] = toCanvas(n.cx, n.cy);
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(tx, ty);
            ctx.stroke();
          }
        }
      });

      // Draw projected nodes with correct category colors
      projectedNodes.forEach(n => {
        const [nx, ny] = toCanvas(n.cx, n.cy);
        const nodeType = n.type?.toUpperCase() || 'CONCEPT';
        const config = ENTITY_TYPES[nodeType] || ENTITY_TYPES.CONCEPT || { color: '#ffffff' };
        
        ctx.fillStyle = config.color;
        ctx.beginPath();
        
        // Depth cueing: larger nodes for roots/subjects
        const radius = n.depth === 0 ? 3.5 : 2;
        ctx.arc(nx, ny, radius, 0, Math.PI * 2);
        ctx.fill();

        // Border outline for roots/subjects
        if (n.depth === 0) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      });

      // Draw viewport rectangle in camera-space local coordinates
      const dist = camera.position.distanceTo(target);
      const fov = camera.fov * (Math.PI / 180);
      const halfHeight = Math.tan(fov / 2) * dist;
      const aspect = window.innerWidth / window.innerHeight;
      const halfWidth = halfHeight * aspect;

      // Project target point
      const localTarget = target.clone().applyMatrix4(camera.matrixWorldInverse);

      const [rLeft, rTop] = toCanvas(localTarget.x - halfWidth, localTarget.y + halfHeight);
      const [rRight, rBottom] = toCanvas(localTarget.x + halfWidth, localTarget.y - halfHeight);

      ctx.strokeStyle = '#00f2ff';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(rLeft, rTop, rRight - rLeft, rBottom - rTop);
      ctx.setLineDash([]);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [camera, controls]);

  const isDragging = useRef(false);
  const lastMousePos = useRef(null);

  const handleMouseDown = (e) => {
    isDragging.current = false;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e) => {
    if (!lastMousePos.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    const threshold = 3;
    if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
      isDragging.current = true;
    }
    if (!isDragging.current) return;
    
    // Scale delta based on minimap fitting factor
    const CW = 220;
    const CH = 160;
    
    // Re-calculate mapping context
    const nodes = nodesRef.current || [];
    const projectedNodes = nodes.map(n => {
        const wp = new THREE.Vector3(n.z_x || 0, n.z_y || 0, n.z_z || 0);
        const cp = wp.applyMatrix4(camera.matrixWorldInverse);
        return { cx: cp.x, cy: cp.y };
    });
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    projectedNodes.forEach(cp => {
        minX = Math.min(minX, cp.cx); maxX = Math.max(maxX, cp.cx);
        minY = Math.min(minY, cp.cy); maxY = Math.max(maxY, cp.cy);
    });
    const currentScale = Math.min((CW - 50) / (maxX - minX || 100), (CH - 50) / (maxY - minY || 100));

    if (!currentScale || isNaN(currentScale)) return;
    
    const dx_world = dx / currentScale;
    const dy_world = -dy / currentScale;

    const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const localY = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

    const panVector = localX.clone().multiplyScalar(-dx_world).add(localY.clone().multiplyScalar(-dy_world));
    
    camera.position.add(panVector);
    controls.target.add(panVector);
    controls.update();

    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  return (
    <div
      className="absolute top-10 right-10 z-[2000] minimap-container"
      style={{
        width: '220px',
        height: '160px',
        background: 'rgba(10, 15, 25, 0.8)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(0, 242, 255, 0.15)',
        borderRadius: '16px',
        boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        overflow: 'hidden',
        cursor: 'crosshair',
        pointerEvents: 'auto'
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={() => { lastMousePos.current = null; }}
    >
      <canvas ref={canvasRef} width={220} height={160} style={{ width: '100%', height: '100%' }} />
      <div 
        className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/40 border border-white/5 rounded text-[8px] font-black uppercase tracking-widest text-slate-400 pointer-events-none"
      >
        Minimap
      </div>
    </div>
  );
}

const CanvasTextureLabel = React.memo(({ title, isSubject, scale = 1.0 }) => {
  const textureData = useMemo(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const oversample = 2;
    const baseFontSize = isSubject ? 48 : 34;
    const fontSize = baseFontSize * oversample * scale;
    const safeName = title || 'Unnamed';
    
    context.font = `bold ${fontSize}px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    const metrics = context.measureText(safeName);
    const textWidth = metrics.width;
    const padding = 20 * oversample;
    
    canvas.width = textWidth + padding;
    canvas.height = fontSize + padding;
    
    context.font = `bold ${fontSize}px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    context.shadowColor = 'rgba(0, 0, 0, 0.9)';
    context.shadowBlur = 4 * oversample;
    
    context.fillStyle = '#FFFFFF';
    context.fillText(safeName, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    
    return { texture, width: canvas.width, height: canvas.height, oversample };
  }, [title, isSubject, scale]);

  useEffect(() => {
    return () => {
      if (textureData.texture) {
        textureData.texture.dispose();
      }
    };
  }, [textureData]);

  const scaleFactor = isSubject ? 2.5 : 1.8;
  const widthVal = (textureData.width / (textureData.oversample * 10)) * scaleFactor * 10;
  const heightVal = (textureData.height / (textureData.oversample * 10)) * scaleFactor * 10;

  return (
    <sprite renderOrder={999} scale={[widthVal, heightVal, 1]}>
      <spriteMaterial
        attach="material"
        map={textureData.texture}
        transparent={true}
        alphaTest={0.1}
        opacity={1.0}
        depthTest={true}
        depthWrite={true}
        sizeAttenuation={true}
      />
    </sprite>
  );
});
const CanvasTexturePillLabel = React.memo(({ title, isSubject, isSelected, scale = 1.0 }) => {
  const textureData = useMemo(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const oversample = 2;
    const fontSize = (isSubject ? 48 : 34) * oversample * scale;
    const safeName = (title || 'Unnamed').toUpperCase();
    context.font = `bold ${fontSize}px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    const metrics = context.measureText(safeName);
    const w = metrics.width + 80 * oversample;
    const h = fontSize + 48 * oversample;
    canvas.width = w; canvas.height = h;
    
    context.beginPath(); context.roundRect(0, 0, w, h, h / 2);
    context.fillStyle = isSelected ? 'rgba(0, 242, 255, 0.95)' : 'rgba(10, 15, 25, 0.9)';
    context.fill();
    context.lineWidth = 3 * oversample;
    context.strokeStyle = isSelected ? '#00f2ff' : (isSubject ? '#ffffff' : '#899981');
    context.stroke();
    
    context.font = `bold ${fontSize}px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillStyle = isSelected ? '#000000' : '#ffffff';
    context.fillText(safeName, w / 2, h / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return { texture, width: w, height: h, oversample };
  }, [title, isSubject, isSelected, scale]);

  useEffect(() => { return () => textureData.texture.dispose(); }, [textureData]);
  
  const scaleFactor = isSubject ? 2.5 : 1.8;
  const widthVal = (textureData.width / (textureData.oversample * 10)) * scaleFactor * 10;
  const heightVal = (textureData.height / (textureData.oversample * 10)) * scaleFactor * 10;
  
  return (
    <sprite renderOrder={999} scale={[widthVal, heightVal, 1]}>
      <spriteMaterial attach="material" map={textureData.texture} transparent={true} alphaTest={0.1} />
    </sprite>
  );
});

const NodeLabel = React.memo(({ node, isHovered, onHover, onClick, showLabels, labelStyle, onOpenDrawer }) => {
  const [uHover, setUHover] = useState(0);

  useFrame((state, delta) => {
    const targetHover = isHovered ? 1.0 : 0.0;
    const nextHover = THREE.MathUtils.lerp(uHover, targetHover, delta * 4.0);
    if (Math.abs(nextHover - uHover) > 0.001) setUHover(nextHover);
  });

  return (
    <group 
      renderOrder={999}
      onPointerOver={(e) => { e.stopPropagation(); onHover(node.id); }}
      onPointerOut={() => onHover(null)} 
      onClick={(e) => { 
        e.stopPropagation(); 
        onClick(node);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (onOpenDrawer) onOpenDrawer(node); 
      }}
    >
      {showLabels && labelStyle === 'standard' && (
        <Billboard>
          <CanvasTextureLabel 
            title={node.title} 
            isSubject={node.depth === 0} 
            scale={1.0} 
          />
        </Billboard>
      )}
      {showLabels && labelStyle === 'pill' && (
        <Billboard>
          <CanvasTexturePillLabel 
            title={node.title} 
            isSubject={node.depth === 0} 
            isSelected={isHovered}
            scale={1.0}
          />
        </Billboard>
      )}
    </group>
  );
});

const NeuralLine = React.memo(({ start, end, color, isHovered, isSecondary = false, isActivePath = false, hoveredNodeId, setHoveredLinkData }) => {
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
      
      const targetHover = active ? 1.0 : 0.0;
      const currentHover = materialRef.current.uniforms.uHover.value;
      materialRef.current.uniforms.uHover.value = THREE.MathUtils.lerp(currentHover, targetHover, delta * 3.5);

      const targetActive = isActivePath ? 1.0 : 0.0;
      const currentActive = materialRef.current.uniforms.uActive.value;
      materialRef.current.uniforms.uActive.value = THREE.MathUtils.lerp(currentActive, targetActive, delta * 3.5);
      
      if (materialRef.current.uniforms.color.value.getHex() !== new THREE.Color(color).getHex()) {
          materialRef.current.uniforms.color.value.set(color);
      }
    }
  });

  const points = useMemo(() => {
    const vStart = new THREE.Vector3(start.z_x || 0, start.z_y || 0, start.z_z || 0);
    const vEnd = new THREE.Vector3(end.z_x || 0, end.z_y || 0, end.z_z || 0);
    
    if (vStart.distanceTo(vEnd) < 1) return [vStart, vEnd];

    if (isSecondary) {
      const mid = new THREE.Vector3().lerpVectors(vStart, vEnd, 0.5);
      // Transverse threads bow outwards more significantly
      if (mid.length() > 0.1) {
         mid.normalize().multiplyScalar(Math.max(vStart.length(), vEnd.length(), 500) * 1.4);
      } else {
         mid.set(0, 0, 1).multiplyScalar(Math.max(vStart.length(), vEnd.length(), 1000) * 1.4);
      }
      const curve = new THREE.QuadraticBezierCurve3(vStart, mid, vEnd);
      return curve.getPoints(16);
    } else {
      // Primary structural lines are clean, direct, straight lines
      return [vStart, vEnd];
    }
  }, [start, end, isSecondary]);

  const handlePointerOver = (e) => {
    if (hoveredNodeId) return;
    e.stopPropagation();
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
  };

  const handlePointerOut = (e) => {
    e.stopPropagation();
    setLineHovered(false);
    if (setHoveredLinkData) setHoveredLinkData(null);
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
        onPointerOut={handlePointerOut}
      />
    </group>
  );
});

const NeuralMesh = ({ onSelectNode, hoveredNodeId, setHoveredNodeId, selectedNode, spatialNodes, showLabels, labelStyle, setHoveredLinkData, onOpenDrawer }) => {
  const meshGroup = useRef();
  
  useFrame((state, delta) => {
    const isInteracting = selectedNode || hoveredNodeId;
    
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
            isActivePath={activePathIds.has(link.from.id) && activePathIds.has(link.to.id)}
            hoveredNodeId={hoveredNodeId}
            setHoveredLinkData={setHoveredLinkData}
          />
        ))}

        {spatialNodes.map(node => {
          return (
            <group key={`node-${node.id}`} position={[node.z_x, node.z_y, node.z_z]}>
                <NodeLabel 
                  node={node} isHovered={hoveredNodeId === node.id} 
                  onHover={setHoveredNodeId} onClick={onSelectNode}
                  showLabels={showLabels}
                  labelStyle={labelStyle}
                  onOpenDrawer={onOpenDrawer}
                />
            </group>
          );
        })}
      </group>
    </group>
  );
};

const CameraController = ({ targetNode, spatialNodes }) => {
  const { camera, controls } = useThree();
  const isCanceledRef = useRef(false);
  
  useEffect(() => { isCanceledRef.current = false; }, [targetNode]);

  useEffect(() => {
    if (!controls) return;

    let targetPos = new THREE.Vector3(0, 0, 0);
    let idealPos = new THREE.Vector3(0, 0, 7500); // Perfect default framing matching the 3D screenshot

    if (targetNode) {
      targetPos.set(targetNode.z_x || 0, targetNode.z_y || 0, targetNode.z_z || 0);
      const approachRadius = targetNode.depth === 0 ? 5000 : 2500;
      const cameraOffset = targetPos.clone().normalize().multiplyScalar(approachRadius); 
      if (cameraOffset.length() === 0) cameraOffset.set(0, 0, approachRadius);
      idealPos = targetPos.clone().add(cameraOffset);
    } else if (spatialNodes && spatialNodes.length > 0) {
      const rootNode = spatialNodes.find(n => n.depth === 0) || spatialNodes[0];
      if (rootNode) {
        targetPos.set(rootNode.z_x || 0, rootNode.z_y || 0, rootNode.z_z || 0);
        idealPos.set(targetPos.x, targetPos.y, targetPos.z + 7500);
      }
    }

    const onIntervene = () => { isCanceledRef.current = true; };
    controls.addEventListener('start', onIntervene);

    let frameId;
    const animate = () => {
       if (isCanceledRef.current) return;
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
  }, [targetNode, camera, controls, spatialNodes]);

  return null;
};

export const SpatialCanvas = ({ nodes, onSelectNode, hoveredNodeId, setHoveredNodeId, selectedNode, showLabels, labelStyle, setHoveredLinkData, onOpenDrawer }) => {
  const [cameraInstance, setCameraInstance] = useState(null);
  const [controlsInstance, setControlsInstance] = useState(null);

  const spatialNodes = useMemo(() => {
    const processed = [];
    const seen = new Set();

    const walk = (nid, depth = 0, thetaRange = [0, Math.PI * 2], phiRange = [0.2, Math.PI - 0.2]) => {
      if (seen.has(nid)) return;
      const node = nodes.find(n => n.id === nid);
      if (!node) return;
      seen.add(nid);

      const radius = depth === 0 ? 0 : 2000 + (depth - 1) * 1800;
      const theta = (thetaRange[0] + thetaRange[1]) / 2;
      const phi = (phiRange[0] + phiRange[1]) / 2;
      
      const z_x = radius * Math.sin(phi) * Math.cos(theta);
      const z_y = radius * Math.sin(phi) * Math.sin(theta);
      const z_z = radius * Math.cos(phi);

      processed.push({ ...node, z_x, z_y, z_z, depth });

      const children = nodes.filter(n => n.parentId === nid);
      if (children.length > 0) {
        const tSpan = (thetaRange[1] - thetaRange[0]) * 0.85;
        const pSpan = (phiRange[1] - phiRange[0]) * 0.85;
        const startT = theta - tSpan / 2;
        const startP = phi - pSpan / 2;

        const N = children.length;
        const cols = Math.ceil(Math.sqrt(N));
        const rows = Math.ceil(N / cols);
        const pStep = pSpan / rows;

        children.forEach((child, i) => {
          const row = Math.floor(i / cols);
          const col = i % cols;
          const itemsInThisRow = (row === rows - 1 && N % cols !== 0) ? N % cols : cols;
          const dynamicTStep = tSpan / itemsInThisRow;
          
          walk(child.id, depth + 1, [startT + col * dynamicTStep, startT + (col + 1) * dynamicTStep], [startP + row * pStep, startP + (row + 1) * pStep]);
        });
      }
    };

    const roots = nodes.filter(n => !n.parentId);
    roots.forEach((root, i) => {
      const step = (Math.PI * 2) / roots.length;
      walk(root.id, 0, [i * step, (i + 1) * step], [0.4, Math.PI - 0.4]);
    });
    return processed;
  }, [nodes]);

  return (
    <div className="w-full h-full bg-black relative">
      <Canvas shadows camera={{ position: [0, 0, 8500], fov: 32, near: 10, far: 500000 }}>
        <WebGLMemoryDisposer />
        <RefConnector setCamera={setCameraInstance} setControls={setControlsInstance} />
        <color attach="background" args={['#000000']} />
        
        <ambientLight intensity={2.5} />
        <directionalLight position={[10000, 10000, 10000]} intensity={3.0} color="#00f2ff" />
        
        <OrbitControls 
          makeDefault enableDamping dampingFactor={0.05}
          maxDistance={150000} minDistance={100}
        />
        
        <CameraController targetNode={selectedNode ? spatialNodes.find(n => n.id === selectedNode.id) : null} spatialNodes={spatialNodes} />
        <NeuralMesh onSelectNode={onSelectNode} hoveredNodeId={hoveredNodeId} setHoveredNodeId={setHoveredNodeId} selectedNode={selectedNode} spatialNodes={spatialNodes} showLabels={showLabels} labelStyle={labelStyle} setHoveredLinkData={setHoveredLinkData} onOpenDrawer={onOpenDrawer} />
        
        <Environment preset="night" />
      </Canvas>

      {cameraInstance && controlsInstance && (
        <MiniMap 
          spatialNodes={spatialNodes} 
          camera={cameraInstance} 
          controls={controlsInstance} 
        />
      )}
    </div>
  );
};
