import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Environment, Line, Billboard } from '@react-three/drei';
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
        console.warn('[InstancedSpatialCanvas] Disposal Traversal Warning:', e);
      }
    };
  }, [scene]);
  return null;
};

const RefConnector = ({ setCamera, setControls }) => {
  const { camera, controls } = useThree();
  useEffect(() => { if (camera) setCamera(camera); }, [camera, setCamera]);
  useFrame(() => { if (controls) setControls(controls); });
  return null;
};

const CameraController = ({ targetNode, spatialNodes }) => {
  const { camera, controls } = useThree();
  const isCanceledRef = useRef(false);
  
  useEffect(() => { isCanceledRef.current = false; }, [targetNode]);

  useEffect(() => {
    if (!controls) return;

    let targetPos = new THREE.Vector3(-2236, -2205, 1871);
    let idealPos = new THREE.Vector3(-2236, -2205, 19771); // Default: ZOOM:-123, X:-2236, Y:-2205, Z:1871

    if (targetNode) {
      targetPos.set(targetNode.z_x || 0, targetNode.z_y || 0, targetNode.z_z || 0);
      const approachRadius = targetNode.depth === 0 ? 5000 : 2500;
      const cameraOffset = targetPos.clone().normalize().multiplyScalar(approachRadius); 
      if (cameraOffset.length() === 0) cameraOffset.set(0, 0, approachRadius);
      idealPos = targetPos.clone().add(cameraOffset);
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

/** Pivots the OrbitControls target to the 3D point under the cursor on rotation start */
const CursorPivot = () => {
  const { camera, controls, gl, scene } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const mouse = useMemo(() => new THREE.Vector2(), []);

  useEffect(() => {
    if (!controls) return;

    const handlePointerDown = (e) => {
      if (e.button !== 2 && e.button !== 1) return;

      const rect = gl.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.set(camera.position, new THREE.Vector3(mouse.x, mouse.y, 0.5).unproject(camera).sub(camera.position).normalize());

      const hits = raycaster.intersectObjects(scene.children, true);
      let point = null;

      if (hits.length > 0) {
        point = hits[0].point;
      } else {
        const plane = new THREE.Plane();
        const targetDir = new THREE.Vector3().subVectors(controls.target, camera.position).normalize();
        plane.setFromNormalAndCoplanarPoint(targetDir, controls.target);
        const intersection = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(plane, intersection)) {
          point = intersection;
        }
      }

      if (point) {
        controls.target.lerp(point, 0.6);
        controls.update();
      }
    };

    gl.domElement.addEventListener('pointerdown', handlePointerDown);
    return () => gl.domElement.removeEventListener('pointerdown', handlePointerDown);
  }, [camera, controls, gl, scene, raycaster, mouse]);

  return null;
};

function MiniMap({ spatialNodes, camera, controls, theme = 'dark' }) {
  const canvasRef = useRef(null);
  const nodesRef = useRef(spatialNodes);
  useEffect(() => { nodesRef.current = spatialNodes; }, [spatialNodes]);

  const isLight = theme === 'light';

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

      const projectedNodes = nodes.map(n => {
        const wp = new THREE.Vector3(n.z_x || 0, n.z_y || 0, n.z_z || 0);
        const cp = wp.applyMatrix4(camera.matrixWorldInverse);
        return { id: n.id, parentId: n.parentId, depth: n.depth, type: n.type, cx: cp.x, cy: cp.y };
      });

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      projectedNodes.forEach(cp => {
        minX = Math.min(minX, cp.cx); maxX = Math.max(maxX, cp.cx);
        minY = Math.min(minY, cp.cy); maxY = Math.max(maxY, cp.cy);
      });

      const pad = 25;
      const scale = Math.min((CW - pad * 2) / (maxX - minX || 100), (CH - pad * 2) / (maxY - minY || 100));
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;

      const toCanvas = (wx, wy) => [CW / 2 + (wx - cx) * scale, CH / 2 - (wy - cy) * scale];
      ctx.clearRect(0, 0, CW, CH);
      
      // Draw background
      ctx.fillStyle = isLight ? 'rgba(244, 239, 229, 0.5)' : 'rgba(8, 12, 20, 0.4)';
      ctx.fillRect(0, 0, CW, CH);

      // Connections
      ctx.strokeStyle = isLight ? 'rgba(46, 43, 39, 0.15)' : 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 0.5;
      projectedNodes.forEach(n => {
        if (n.parentId) {
          const parent = projectedNodes.find(pn => pn.id === n.parentId);
          if (parent) {
            const [sx, sy] = toCanvas(parent.cx, parent.cy);
            const [tx, ty] = toCanvas(n.cx, n.cy);
            ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke();
          }
        }
      });

      // Nodes
      projectedNodes.forEach(n => {
        const [nx, ny] = toCanvas(n.cx, n.cy);
        const config = ENTITY_TYPES[n.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT || { color: '#ffffff' };
        ctx.fillStyle = config.color;
        ctx.beginPath(); ctx.arc(nx, ny, n.depth === 0 ? 3.5 : 2, 0, Math.PI * 2); ctx.fill();

        // Border outline for ALL nodes (reversing dynamically to guarantee high contrast)
        ctx.strokeStyle = isLight ? 'rgba(46, 43, 39, 0.3)' : 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      });

      const dist = camera.position.distanceTo(target);
      const halfHeight = Math.tan(camera.fov * Math.PI / 360) * dist;
      const halfWidth = halfHeight * (window.innerWidth / window.innerHeight);
      const localTarget = target.clone().applyMatrix4(camera.matrixWorldInverse);
      const [rLeft, rTop] = toCanvas(localTarget.x - halfWidth, localTarget.y + halfHeight);
      const [rRight, rBottom] = toCanvas(localTarget.x + halfWidth, localTarget.y - halfHeight);
      
      const primaryAccent = isLight ? '#0891B2' : '#00f2ff';
      const secondaryAccent = '#899981';

      // 1. Draw solid secondary (sage green) accent rectangle first
      ctx.strokeStyle = secondaryAccent;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rLeft, rTop, rRight - rLeft, rBottom - rTop);

      // 2. Draw dashed primary accent rectangle on top
      ctx.strokeStyle = primaryAccent;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(rLeft, rTop, rRight - rLeft, rBottom - rTop);
      ctx.setLineDash([]);
    };
    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [camera, controls, theme, isLight]);

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
      className="absolute top-10 z-[2000] minimap-container"
      style={{
        right: '10px',
        width: '220px',
        height: '160px',
        background: isLight ? 'rgba(244, 239, 229, 0.85)' : 'rgba(10, 15, 25, 0.8)',
        backdropFilter: 'blur(20px)',
        border: isLight ? '1px solid rgba(46, 43, 39, 0.15)' : '1px solid rgba(0, 242, 255, 0.15)',
        borderRadius: '16px',
        boxShadow: isLight ? '0 12px 32px rgba(46, 43, 39, 0.15)' : '0 12px 32px rgba(0,0,0,0.5)',
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
        className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest pointer-events-none"
        style={{
          background: isLight ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)',
          border: isLight ? '1px solid rgba(46, 43, 39, 0.1)' : '1px solid rgba(255, 255, 255, 0.05)',
          color: isLight ? '#6E6C68' : '#94a3b8'
        }}
      >
        Minimap
      </div>
    </div>
  );
}

const CanvasTexturePillLabel = React.memo(({ title, isRoot, isSelected, isDark = true, nodeColor = '#899981' }) => {
  const textureData = useMemo(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const oversample = 2;
    const fontSize = (isRoot ? 48 : 34) * oversample;
    const safeName = (title || 'Unnamed').toUpperCase();
    const strokeW = 3 * oversample;
    const halfStroke = strokeW / 2;
    context.font = `bold ${fontSize}px "Inter", sans-serif`;
    const metrics = context.measureText(safeName);
    const innerW = metrics.width + 80 * oversample;
    const innerH = fontSize + 48 * oversample;
    canvas.width = innerW + strokeW; canvas.height = innerH + strokeW;
    context.beginPath(); context.roundRect(halfStroke, halfStroke, innerW, innerH, innerH / 2);
    context.fillStyle = isSelected
      ? 'rgba(0, 242, 255, 0.95)'
      : isDark ? 'rgba(10, 15, 25, 0.9)' : 'rgba(240, 244, 248, 0.95)';
    context.fill();
    context.lineWidth = strokeW;
    context.strokeStyle = isSelected ? '#00f2ff' : nodeColor;
    context.stroke();
    context.font = `bold ${fontSize}px "Inter", sans-serif`;
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillStyle = isSelected ? '#000000' : (isDark ? '#ffffff' : '#0a0f1a');
    context.fillText(safeName, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    return { texture, width: canvas.width, height: canvas.height, oversample };
  }, [title, isRoot, isSelected, isDark, nodeColor]);

  useEffect(() => { return () => textureData.texture.dispose(); }, [textureData]);
  const scale = isRoot ? 3.0 : 2.2;
  return (
    <sprite renderOrder={100} scale={[(textureData.width / (textureData.oversample * 10)) * scale * 10, (textureData.height / (textureData.oversample * 10)) * scale * 10, 1]}>
      <spriteMaterial attach="material" map={textureData.texture} transparent={true} alphaTest={0.1} />
    </sprite>
  );
});

const InstancedNodes = ({ spatialNodes, onSelectNode, hoveredNodeId, setHoveredNodeId, selectedNode, layoutRules }) => {
  const meshRef = useRef();
  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);
  const tempPos = useMemo(() => new THREE.Vector3(), []);
  const tempScale = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    if (!meshRef.current) return;
    const beta = true;
    spatialNodes.forEach((node, i) => {
      const isHovered = hoveredNodeId === node.id;
      const isSelected = selectedNode?.id === node.id;
      const s = isSelected ? (1.8 + Math.sin(state.clock.elapsedTime * 6) * 0.15) : (isHovered ? 1.4 : 1.0);
      const centralityScale = beta ? (0.85 + Math.min(node.degree || 0, 8) * 0.12) : 1.0;
      const finalScale = s * centralityScale;
      tempPos.set(node.z_x || 0, node.z_y || 0, node.z_z || 0);
      tempScale.set(finalScale, finalScale, finalScale);
      tempMatrix.compose(tempPos, new THREE.Quaternion(), tempScale);
      meshRef.current.setMatrixAt(i, tempMatrix);
      const config = ENTITY_TYPES[node.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT;
      tempColor.set(config.color);
      if (isHovered || isSelected) tempColor.multiplyScalar(2.0);
      meshRef.current.setColorAt(i, tempColor);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  const handlePointerMove = useCallback((e) => {
    e.stopPropagation();
    if (e.instanceId !== undefined && spatialNodes[e.instanceId]) setHoveredNodeId(spatialNodes[e.instanceId].id);
  }, [spatialNodes, setHoveredNodeId]);

  return (
    <instancedMesh ref={meshRef} args={[null, null, spatialNodes.length]} onPointerMove={handlePointerMove} onPointerOut={() => setHoveredNodeId(null)} onClick={(e) => { e.stopPropagation(); if (e.instanceId !== undefined) onSelectNode(spatialNodes[e.instanceId]); }}>
      <sphereGeometry args={[100, 16, 16]} />
      <meshStandardMaterial roughness={0.1} metalness={0.8} />
    </instancedMesh>
  );
};

const ZoomTracker = ({ onZoomChange, onCoordsChange }) => {
  const { camera, controls } = useThree();
  const lastZoomRef = useRef(null);
  const lastCoordsRef = useRef({ x: null, y: null, z: null });

  useFrame(() => {
    if (!controls) return;
    const distance = camera.position.distanceTo(controls.target);
    const zoomVal = Math.round((7500 - distance) / 100);
    if (zoomVal !== lastZoomRef.current) {
      lastZoomRef.current = zoomVal;
      onZoomChange(zoomVal);
    }

    const tx = Math.round(controls.target.x);
    const ty = Math.round(controls.target.y);
    const tz = Math.round(controls.target.z);
    if (tx !== lastCoordsRef.current.x || ty !== lastCoordsRef.current.y || tz !== lastCoordsRef.current.z) {
      lastCoordsRef.current = { x: tx, y: ty, z: tz };
      onCoordsChange({ x: tx, y: ty, z: tz });
    }
  });

  return null;
};

export const InstancedSpatialCanvas = ({ nodes = [], onSelectNode, hoveredNodeId, setHoveredNodeId, selectedNode, onOpenDrawer, onZoomChange, onCoordsChange, theme = 'dark', setIs3DInteracting, layoutRules }) => {
  const isDark = theme !== 'light';
  const bgColor = isDark ? '#000000' : '#ece8dd';
  const [cameraInstance, setCameraInstance] = useState(null);
  const [controlsInstance, setControlsInstance] = useState(null);

  const spatialNodes = useMemo(() => {
    const processed = [];
    const seen = new Set();
    const beta = true;

    // Helper to calculate the cumulative weight (size) of a subtree recursively
    const getSubtreeWeight = (nodeId) => {
      const children = nodes.filter(n => n.parentId === nodeId);
      if (children.length === 0) return 1;
      return 1 + children.reduce((acc, child) => acc + getSubtreeWeight(child.id), 0);
    };

    const walk = (nid, depth = 0, thetaRange = [0, Math.PI * 2], phiRange = [0.2, Math.PI - 0.2], parentChildCount = 1, parentRadius = 0) => {
      if (seen.has(nid)) return;
      const node = nodes.find(n => n.id === nid);
      if (!node) return;
      seen.add(nid);

      // Distance from center
      let radius;
      if (beta) {
        radius = parentRadius;
      } else {
        // Original grid radius
        const baseDistance = (layoutRules?.parentDistance ?? 400) * 4.5;
        const gapOffset = (layoutRules?.childGap ?? 50) * 10.0;
        radius = depth === 0 ? 0 : baseDistance + gapOffset + (depth - 1) * (baseDistance * 0.9 + gapOffset);
      }

      const theta = (thetaRange[0] + thetaRange[1]) / 2;
      const phi = (phiRange[0] + phiRange[1]) / 2;
      
      const z_x = radius * Math.sin(phi) * Math.cos(theta);
      const z_y = radius * Math.sin(phi) * Math.sin(theta);
      const z_z = radius * Math.cos(phi);

      // Calculate topological degree centrality
      const parentLinkCount = node.parentId ? 1 : 0;
      const childrenLinkCount = nodes.filter(n => n.parentId === node.id).length;
      const secondaryLinkCount = (node.secondaryLinks || []).length;
      const totalDegree = parentLinkCount + childrenLinkCount + secondaryLinkCount;

      processed.push({ ...node, z_x, z_y, z_z, depth, degree: totalDegree });

      const children = nodes.filter(n => n.parentId === nid);
      if (children.length > 0) {
        if (beta) {
          // PROPORTIONAL WEIGHTED & EQUAL FANNING MIXED ALLOCATION
          const gapVal = layoutRules?.childGap ?? 50;
          const N = children.length;
          const cols = Math.ceil(Math.sqrt(N));
          const rows = Math.ceil(N / cols);
          
          // Dynamic sector opening: span fraction opens extremely wide by default to spread out siblings laterally
          const spanFraction = Math.min(1.3, 0.85 + (gapVal / 150) * 0.4); 
          const tSpan = (thetaRange[1] - thetaRange[0]) * spanFraction;
          const pSpan = (phiRange[1] - phiRange[0]) * spanFraction;
          const startT = theta - tSpan / 2;
          const startP = phi - pSpan / 2;

          // DYNAMIC SAFESPACING: Calculate step size to guarantee zero sibling billboard overlaps
          const deltaTheta = tSpan / Math.max(1, cols);
          const deltaPhi = pSpan / Math.max(1, rows);
          
          const safeHorizontal = 550; 
          const safeVertical = 220;
          
          const rSafeH = safeHorizontal / Math.max(0.01, deltaTheta);
          const rSafeV = safeVertical / Math.max(0.01, deltaPhi);
          const dynamicRadiusStep = Math.max(rSafeH, rSafeV);
          
          // SIGNIFICANTLY REDUCED parent-child radial distance
          const baseDistance = (layoutRules?.parentDistance ?? 400) * 3.5; 
          const minStep = baseDistance * 0.6; 
          const maxStep = baseDistance * 2.2; 
          const finalDefaultStep = Math.min(maxStep, Math.max(minStep, dynamicRadiusStep));
          
          // Compact slider global adder to keep parent-child lines short and crisp
          const gapAdder = gapVal * 3.5; 
          
          let childForwardStep;
          if (depth === 0) {
            // Majestic central globe radial jump to establish wide central space
            childForwardStep = 4500 + gapVal * 12.0;
          } else {
            childForwardStep = finalDefaultStep + gapAdder;
          }

          const childWeights = children.map(child => ({
            child,
            weight: getSubtreeWeight(child.id)
          }));
          const totalWeight = childWeights.reduce((acc, cw) => acc + cw.weight, 0);

          // Force dynamic blending: equal-spread is dominant by default to fan nodes out laterally
          const baseAlpha = Math.max(0.05, 0.5 - (gapVal / 150) * 0.4);
          const alpha = Math.max(0.02, baseAlpha - Math.max(0, N - 3) * 0.05);

          let currentTheta = startT;
          const pStep = pSpan / Math.max(1, rows);

          childWeights.forEach((cw, i) => {
            const proportionalPart = (cw.weight / totalWeight) * tSpan * alpha;
            const equalPart = (1.0 / N) * tSpan * (1.0 - alpha);
            const thetaFraction = proportionalPart + equalPart;
            
            const row = Math.floor(i / cols);
            const childPhiRange = [startP + row * pStep, startP + (row + 1) * pStep];
            
            walk(cw.child.id, depth + 1, [currentTheta, currentTheta + thetaFraction], childPhiRange, N, radius + childForwardStep);
            currentTheta += thetaFraction;
          });
        } else {
          // ORIGINAL EQUAL GRID ALLOCATION
          const tSpan = (thetaRange[1] - thetaRange[0]) * 0.85;
          const pSpan = (phiRange[1] - phiRange[0]) * 0.85;
          const startT = theta - tSpan / 2;
          const startP = phi - pSpan / 2;

          const N = children.length;
          const cols = Math.ceil(Math.sqrt(N));
          const rows = Math.ceil(N / cols);
          const pStep = pSpan / Math.max(1, rows);

          children.forEach((child, i) => {
            const row = Math.floor(i / cols);
            const col = i % cols;
            const itemsInThisRow = (row === rows - 1 && N % cols !== 0) ? N % cols : cols;
            const dynamicTStep = tSpan / itemsInThisRow;
            
            walk(child.id, depth + 1, [startT + col * dynamicTStep, startT + (col + 1) * dynamicTStep], [startP + row * pStep, startP + (row + 1) * pStep], N, radius + 2000);
          });
        }
      }
    };

    const roots = nodes.filter(n => !n.parentId);
    if (roots.length > 0) {
      if (beta) {
        const rootWeights = roots.map(r => ({
          root: r,
          weight: getSubtreeWeight(r.id)
        }));
        const totalRootWeight = rootWeights.reduce((acc, rw) => acc + rw.weight, 0);

        let currentTheta = 0;
        rootWeights.forEach(rw => {
          const thetaFraction = (rw.weight / totalRootWeight) * (Math.PI * 2);
          walk(rw.root.id, 0, [currentTheta, currentTheta + thetaFraction], [0.15, Math.PI - 0.15], roots.length, 0);
          currentTheta += thetaFraction;
        });
      } else {
        roots.forEach((root, i) => {
          const step = (Math.PI * 2) / roots.length;
          walk(root.id, 0, [i * step, (i + 1) * step], [0.4, Math.PI - 0.4], roots.length);
        });
      }
    }
    return processed;
  }, [nodes, layoutRules]);

  const links = useMemo(() => {
    const l = []; spatialNodes.forEach(node => {
      if (node.parentId) {
        const p = spatialNodes.find(n => n.id === node.parentId);
        if (p) l.push({ key: `link-${p.id}-${node.id}`, from: p, to: node, color: (ENTITY_TYPES[node.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT).color });
      }
    });
    return l;
  }, [spatialNodes]);

  return (
    <div className="w-full h-full relative" style={{ background: bgColor }}>
      <Canvas camera={{ position: [-2236, -2205, 19771], fov: 35, near: 100, far: 1000000 }}>
        <WebGLMemoryDisposer />
        <RefConnector setCamera={setCameraInstance} setControls={setControlsInstance} />
        <ZoomTracker onZoomChange={onZoomChange} onCoordsChange={onCoordsChange} />
        <color attach="background" args={[bgColor]} />
        <ambientLight intensity={1.5} />
        <pointLight position={[10000, 10000, 10000]} intensity={2} />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        <OrbitControls 
          makeDefault enableDamping dampingFactor={0.2} 
          target={[-2236, -2205, 1871]} 
          onStart={() => setIs3DInteracting && setIs3DInteracting(true)}
          onEnd={() => setIs3DInteracting && setIs3DInteracting(false)}
        />
        <CursorPivot />
        <CameraController targetNode={selectedNode ? spatialNodes.find(n => n.id === selectedNode.id) : null} spatialNodes={spatialNodes} />
        <InstancedNodes spatialNodes={spatialNodes} onSelectNode={onSelectNode} hoveredNodeId={hoveredNodeId} setHoveredNodeId={setHoveredNodeId} selectedNode={selectedNode} layoutRules={layoutRules} />
        {spatialNodes.filter(n => n.depth <= 2 || hoveredNodeId === n.id || selectedNode?.id === n.id).map(node => (
          <Billboard key={`label-${node.id}`} position={[node.z_x, node.z_y + 280, node.z_z + 50]} onPointerOver={() => setHoveredNodeId(node.id)}>
            <CanvasTexturePillLabel title={node.title} isRoot={node.depth === 0} isSelected={selectedNode?.id === node.id} isDark={isDark} nodeColor={(ENTITY_TYPES[node.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT).color} />
          </Billboard>
        ))}
        {links.map(link => (
          <Line key={link.key} points={[new THREE.Vector3(link.from.z_x || 0, link.from.z_y || 0, link.from.z_z || 0), new THREE.Vector3(link.to.z_x || 0, link.to.z_y || 0, link.to.z_z || 0)]} color={link.color} lineWidth={0.5} opacity={0.15} transparent depthWrite={false} />
        ))}
        <Environment preset="night" />
      </Canvas>
      {cameraInstance && controlsInstance && <MiniMap spatialNodes={spatialNodes} camera={cameraInstance} controls={controlsInstance} theme={theme} />}
    </div>
  );
};
