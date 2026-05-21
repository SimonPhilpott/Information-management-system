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

    let targetPos = new THREE.Vector3(0, 0, 0);
    let idealPos = new THREE.Vector3(0, 0, 7500);

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

function MiniMap({ spatialNodes, camera, controls }) {
  const canvasRef = useRef(null);
  const nodesRef = useRef(spatialNodes);
  useEffect(() => { nodesRef.current = spatialNodes; }, [spatialNodes]);

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
      ctx.fillStyle = 'rgba(8, 12, 20, 0.4)';
      ctx.fillRect(0, 0, CW, CH);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
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

      projectedNodes.forEach(n => {
        const [nx, ny] = toCanvas(n.cx, n.cy);
        const config = ENTITY_TYPES[n.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT || { color: '#ffffff' };
        ctx.fillStyle = config.color;
        ctx.beginPath(); ctx.arc(nx, ny, n.depth === 0 ? 3.5 : 2, 0, Math.PI * 2); ctx.fill();
      });

      const dist = camera.position.distanceTo(target);
      const halfHeight = Math.tan(camera.fov * Math.PI / 360) * dist;
      const halfWidth = halfHeight * (window.innerWidth / window.innerHeight);
      const localTarget = target.clone().applyMatrix4(camera.matrixWorldInverse);
      const [rLeft, rTop] = toCanvas(localTarget.x - halfWidth, localTarget.y + halfHeight);
      const [rRight, rBottom] = toCanvas(localTarget.x + halfWidth, localTarget.y - halfHeight);
      ctx.strokeStyle = '#00f2ff';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]); ctx.strokeRect(rLeft, rTop, rRight - rLeft, rBottom - rTop); ctx.setLineDash([]);
    };
    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [camera, controls]);

  return (
    <div className="absolute top-10 right-10 z-[2000] minimap-container" style={{ width: '220px', height: '160px', background: 'rgba(10, 15, 25, 0.8)', backdropFilter: 'blur(20px)', border: '1px solid rgba(0, 242, 255, 0.15)', borderRadius: '16px', overflow: 'hidden' }}>
      <canvas ref={canvasRef} width={220} height={160} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

const CanvasTexturePillLabel = React.memo(({ title, isRoot, isSelected }) => {
  const textureData = useMemo(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const oversample = 2;
    const fontSize = (isRoot ? 48 : 34) * oversample;
    const safeName = (title || 'Unnamed').toUpperCase();
    context.font = `bold ${fontSize}px "Inter", sans-serif`;
    const metrics = context.measureText(safeName);
    const w = metrics.width + 80 * oversample;
    const h = fontSize + 48 * oversample;
    canvas.width = w; canvas.height = h;
    context.beginPath(); context.roundRect(0, 0, w, h, h / 2);
    context.fillStyle = isSelected ? 'rgba(0, 242, 255, 0.95)' : 'rgba(10, 15, 25, 0.9)';
    context.fill();
    context.lineWidth = 3 * oversample;
    context.strokeStyle = isSelected ? '#00f2ff' : (isRoot ? '#ffffff' : '#899981');
    context.stroke();
    context.font = `bold ${fontSize}px "Inter", sans-serif`;
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillStyle = isSelected ? '#000000' : '#ffffff';
    context.fillText(safeName, w / 2, h / 2);
    const texture = new THREE.CanvasTexture(canvas);
    return { texture, width: w, height: h, oversample };
  }, [title, isRoot, isSelected]);

  useEffect(() => { return () => textureData.texture.dispose(); }, [textureData]);
  const scale = isRoot ? 3.0 : 2.2;
  return (
    <sprite renderOrder={100} scale={[(textureData.width / (textureData.oversample * 10)) * scale * 10, (textureData.height / (textureData.oversample * 10)) * scale * 10, 1]}>
      <spriteMaterial attach="material" map={textureData.texture} transparent={true} alphaTest={0.1} />
    </sprite>
  );
});

const InstancedNodes = ({ spatialNodes, onSelectNode, hoveredNodeId, setHoveredNodeId, selectedNode }) => {
  const meshRef = useRef();
  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);
  const tempPos = useMemo(() => new THREE.Vector3(), []);
  const tempScale = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    if (!meshRef.current) return;
    spatialNodes.forEach((node, i) => {
      const isHovered = hoveredNodeId === node.id;
      const isSelected = selectedNode?.id === node.id;
      const s = isSelected ? (1.8 + Math.sin(state.clock.elapsedTime * 6) * 0.15) : (isHovered ? 1.4 : 1.0);
      tempPos.set(node.z_x || 0, node.z_y || 0, node.z_z || 0);
      tempScale.set(s, s, s);
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

export const InstancedSpatialCanvas = ({ nodes = [], onSelectNode, hoveredNodeId, setHoveredNodeId, selectedNode }) => {
  const [cameraInstance, setCameraInstance] = useState(null);
  const [controlsInstance, setControlsInstance] = useState(null);

  const spatialNodes = useMemo(() => {
    const processed = []; const seen = new Set();
    const walk = (nid, depth = 0, thetaRange = [0, Math.PI * 2], phiRange = [0.2, Math.PI - 0.2]) => {
      if (seen.has(nid)) return;
      const node = nodes.find(n => n.id === nid); if (!node) return;
      seen.add(nid);
      const radius = depth === 0 ? 0 : 2500 + (depth - 1) * 2000;
      const theta = (thetaRange[0] + thetaRange[1]) / 2;
      const phi = (phiRange[0] + phiRange[1]) / 2;
      processed.push({ ...node, z_x: radius * Math.sin(phi) * Math.cos(theta), z_y: radius * Math.sin(phi) * Math.sin(theta), z_z: radius * Math.cos(phi), depth });
      const children = nodes.filter(n => n.parentId === nid);
      if (children.length > 0) {
        const tSpan = (thetaRange[1] - thetaRange[0]) * 0.8;
        const pSpan = (phiRange[1] - phiRange[0]) * 0.8;
        const cols = Math.ceil(Math.sqrt(children.length));
        const rows = Math.ceil(children.length / cols);
        const pStep = pSpan / rows;
        children.forEach((child, i) => {
          const row = Math.floor(i / cols); const col = i % cols;
          const dynamicTStep = tSpan / ((row === rows - 1 && children.length % cols !== 0) ? children.length % cols : cols);
          walk(child.id, depth + 1, [theta - tSpan / 2 + col * dynamicTStep, theta - tSpan / 2 + (col + 1) * dynamicTStep], [phi - pSpan / 2 + row * pStep, phi - pSpan / 2 + (row + 1) * pStep]);
        });
      }
    };
    const roots = nodes.filter(n => !n.parentId);
    roots.forEach((root, i) => walk(root.id, 0, [i * (Math.PI * 2 / Math.max(1, roots.length)), (i + 1) * (Math.PI * 2 / Math.max(1, roots.length))], [0.4, Math.PI - 0.4]));
    return processed;
  }, [nodes]);

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
    <div className="w-full h-full bg-black relative">
      <Canvas camera={{ position: [0, 0, 10000], fov: 35, near: 100, far: 1000000 }}>
        <WebGLMemoryDisposer />
        <RefConnector setCamera={setCameraInstance} setControls={setControlsInstance} />
        <color attach="background" args={['#000000']} />
        <ambientLight intensity={1.5} />
        <pointLight position={[10000, 10000, 10000]} intensity={2} />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        <OrbitControls makeDefault />
        <CameraController targetNode={selectedNode ? spatialNodes.find(n => n.id === selectedNode.id) : null} spatialNodes={spatialNodes} />
        <InstancedNodes spatialNodes={spatialNodes} onSelectNode={onSelectNode} hoveredNodeId={hoveredNodeId} setHoveredNodeId={setHoveredNodeId} selectedNode={selectedNode} />
        {spatialNodes.filter(n => n.depth <= 2 || hoveredNodeId === n.id || selectedNode?.id === n.id).map(node => (
          <Billboard key={`label-${node.id}`} position={[node.z_x, node.z_y + 280, node.z_z + 50]} onPointerOver={() => setHoveredNodeId(node.id)}>
            <CanvasTexturePillLabel title={node.title} isRoot={node.depth === 0} isSelected={selectedNode?.id === node.id} />
          </Billboard>
        ))}
        {links.map(link => (
          <Line key={link.key} points={[new THREE.Vector3(link.from.z_x || 0, link.from.z_y || 0, link.from.z_z || 0), new THREE.Vector3(link.to.z_x || 0, link.to.z_y || 0, link.to.z_z || 0)]} color={link.color} lineWidth={0.5} opacity={0.15} transparent depthWrite={false} />
        ))}
        <Environment preset="night" />
      </Canvas>
      {cameraInstance && controlsInstance && <MiniMap spatialNodes={spatialNodes} camera={cameraInstance} controls={controlsInstance} />}
    </div>
  );
};
