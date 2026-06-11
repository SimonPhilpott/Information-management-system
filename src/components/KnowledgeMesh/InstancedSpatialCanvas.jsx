import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Environment, Line, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { ENTITY_TYPES } from '../../data/nodes';
import { Search, Copy, Check, X, ListOrdered } from 'lucide-react';

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
    let idealPos = new THREE.Vector3(-2236, -2205, 19771);

    if (targetNode && spatialNodes && spatialNodes.length > 0) {
      const connectedNodes = spatialNodes.filter(n => {
        if (n.id === targetNode.id) return true;
        if (n.id === targetNode.parentId) return true;
        if (n.parentId === targetNode.id) return true;
        if (targetNode.secondaryLinks && targetNode.secondaryLinks.includes(n.id)) return true;
        if (n.secondaryLinks && n.secondaryLinks.includes(targetNode.id)) return true;
        
        let curr = targetNode;
        while (curr && curr.parentId) {
          if (n.id === curr.parentId) return true;
          curr = spatialNodes.find(pn => pn.id === curr.parentId);
        }
        return false;
      });

      if (connectedNodes.length > 0) {
        const center = new THREE.Vector3();
        connectedNodes.forEach(n => {
          center.add(new THREE.Vector3(n.z_x || 0, n.z_y || 0, n.z_z || 0));
        });
        center.divideScalar(connectedNodes.length);
        targetPos.copy(center);

        let maxDist = 0;
        connectedNodes.forEach(n => {
          const pos = new THREE.Vector3(n.z_x || 0, n.z_y || 0, n.z_z || 0);
          const d = pos.distanceTo(center);
          if (d > maxDist) maxDist = d;
        });

        const sphereRadius = Math.max(maxDist, 1200);
        const fovRad = (camera.fov * Math.PI) / 360;
        const fitDist = (sphereRadius / Math.sin(fovRad)) + 1200;

        const viewDir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
        if (viewDir.length() === 0) viewDir.set(0, 0, 1);
        idealPos.copy(center).addScaledVector(viewDir, fitDist);
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

const labelTextureCache = new Map();

const CanvasTexturePillLabel = React.memo(({ title, isRoot, isSelected, isDark = true, nodeColor = '#899981', isDimmed = false }) => {
  const textureData = useMemo(() => {
    const key = `pill_inst_${title}_${isRoot}_${isSelected}_${isDark}_${nodeColor}`;
    if (labelTextureCache.has(key)) {
      return labelTextureCache.get(key);
    }

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
    const res = { texture, width: canvas.width, height: canvas.height, oversample };
    labelTextureCache.set(key, res);
    return res;
  }, [title, isRoot, isSelected, isDark, nodeColor]);

  const scale = isRoot ? 3.0 : 2.2;
  return (
    <sprite renderOrder={100} scale={[(textureData.width / (textureData.oversample * 10)) * scale * 10, (textureData.height / (textureData.oversample * 10)) * scale * 10, 1]}>
      <spriteMaterial attach="material" map={textureData.texture} transparent={true} alphaTest={0.1} opacity={isDimmed ? 0.15 : 1.0} />
    </sprite>
  );
});

const InstancedNodes = ({ spatialNodes, onSelectNode, hoveredNodeId, setHoveredNodeId, selectedNode, layoutRules, connectedNodeIds, matchingNodeIds }) => {
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
      const isNodeConnected = selectedNode 
        ? connectedNodeIds.has(node.id) 
        : (matchingNodeIds ? matchingNodeIds.has(node.id) : true);
      
      let s = isSelected ? (1.8 + Math.sin(state.clock.elapsedTime * 6) * 0.15) : (isHovered ? 1.4 : 1.0);
      if (!isNodeConnected) {
        s = 0.25;
      }
      
      const centralityScale = beta ? (0.85 + Math.min(node.degree || 0, 8) * 0.12) : 1.0;
      const finalScale = s * centralityScale;
      tempPos.set(node.z_x || 0, node.z_y || 0, node.z_z || 0);
      tempScale.set(finalScale, finalScale, finalScale);
      tempMatrix.compose(tempPos, new THREE.Quaternion(), tempScale);
      meshRef.current.setMatrixAt(i, tempMatrix);
      const config = ENTITY_TYPES[node.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT;
      
      if (!isNodeConnected) {
        tempColor.set(config.color).multiplyScalar(0.12);
      } else {
        tempColor.set(config.color);
        if (isHovered || isSelected) tempColor.multiplyScalar(2.0);
      }
      
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

const getSearchSummaryPath = (matchingNodes, allNodes) => {
  if (matchingNodes.length === 0) return '';
  
  const paths = matchingNodes.map(node => {
    const p = [];
    let curr = node;
    while (curr) {
      p.unshift(curr.id);
      curr = curr.parentId ? allNodes.find(n => n.id === curr.parentId) : null;
    }
    return p;
  });
  
  const tree = {};
  paths.forEach(p => {
    let currentLevel = tree;
    p.forEach(id => {
      if (!currentLevel[id]) {
        currentLevel[id] = {};
      }
      currentLevel = currentLevel[id];
    });
  });
  
  const serialize = (node) => {
    const keys = Object.keys(node);
    if (keys.length === 0) return '';
    if (keys.length === 1) {
      const childStr = serialize(node[keys[0]]);
      return childStr ? `${keys[0]} > ${childStr}` : keys[0];
    }
    const branches = keys.map(k => {
      const childStr = serialize(node[k]);
      return childStr ? `${k} > {${childStr}}` : k;
    });
    return `{${branches.join(', ')}}`;
  };
  
  return serialize(tree);
};

export const InstancedSpatialCanvas = ({ nodes = [], onSelectNode, hoveredNodeId, setHoveredNodeId, selectedNode, onOpenDrawer, onZoomChange, onCoordsChange, theme = 'dark', setIs3DInteracting, layoutRules }) => {
  const isDark = theme !== 'light';
  const bgColor = isDark ? '#000000' : '#ece8dd';
  const [cameraInstance, setCameraInstance] = useState(null);
  const [controlsInstance, setControlsInstance] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showTierList, setShowTierList] = useState(false);

  const searchRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (selectedNode) {
      setSearchQuery(selectedNode.title);
      setActiveSearchQuery('');
    } else {
      setSearchQuery('');
      setActiveSearchQuery('');
    }
  }, [selectedNode]);

  const handleSearchChange = (val) => {
    setSearchQuery(val);
    setShowSuggestions(true);
    if (!val.trim()) {
      setActiveSearchQuery('');
    }
    
    // Check if it's a pasted thumbprint
    if (val.includes('>')) {
      const parts = val.split('>');
      if (parts.length > 1) {
        const targetPart = parts[1].split(':')[0].trim();
        const found = nodes.find(n => n.id === targetPart || n.title.toLowerCase() === targetPart.toLowerCase());
        if (found) {
          onSelectNode(found);
          setSearchQuery(found.title);
          setActiveSearchQuery('');
          setShowSuggestions(false);
        }
      }
    }
  };

  const suggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return nodes.filter(n => 
      n.title.toLowerCase().includes(q) || 
      n.id.toLowerCase().includes(q) ||
      (n.content && Object.values(n.content).some(val => 
        typeof val === 'string' && val.toLowerCase().includes(q)
      ))
    ).slice(0, 8);
  }, [searchQuery, nodes]);

  const copyToClipboard = () => {
    if (!thumbprint) return;
    navigator.clipboard.writeText(thumbprint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const connectedNodeIds = useMemo(() => {
    if (!selectedNode) return new Set();
    const set = new Set();
    set.add(selectedNode.id);

    // Walk up ancestry
    let curr = nodes.find(n => n.id === selectedNode.id);
    while (curr && curr.parentId) {
      set.add(curr.parentId);
      curr = nodes.find(n => n.id === curr.parentId);
    }

    // Add children
    nodes.forEach(n => {
      if (n.parentId === selectedNode.id) {
        set.add(n.id);
      }
    });

    // Add secondary links (outgoing)
    if (selectedNode.secondaryLinks) {
      selectedNode.secondaryLinks.forEach(id => set.add(id));
    }

    // Add secondary links (incoming)
    nodes.forEach(n => {
      if (n.secondaryLinks && n.secondaryLinks.includes(selectedNode.id)) {
        set.add(n.id);
      }
    });

    return set;
  }, [selectedNode, nodes]);

  const matchingNodeIds = useMemo(() => {
    if (!activeSearchQuery?.trim()) return null;
    const q = activeSearchQuery.toLowerCase().trim();
    return new Set(
      nodes
        .filter(n => 
          n.title.toLowerCase().includes(q) || 
          n.id.toLowerCase().includes(q) ||
          (n.content && Object.values(n.content).some(val => 
            typeof val === 'string' && val.toLowerCase().includes(q)
          ))
        )
        .map(n => n.id)
    );
  }, [activeSearchQuery, nodes]);

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

    const walk = (nid, depth = 0, parentPos = new THREE.Vector3(0, 0, 0), dir = new THREE.Vector3(0, 0, 1)) => {
      if (seen.has(nid)) return;
      const node = nodes.find(n => n.id === nid);
      if (!node) return;
      seen.add(nid);

      const gapVal = layoutRules?.childGap ?? 50;
      const parentDistanceVal = layoutRules?.parentDistance ?? 400;

      let pos;
      if (depth === 0) {
        pos = new THREE.Vector3(0, 0, 0);
      } else {
        // Parent-child step scales down slightly with depth to keep tree compact,
        // and incorporates parentDistance + childGap sliders.
        const step = (parentDistanceVal * 2.8) * Math.pow(0.85, depth - 1) + gapVal * 6.0;
        pos = parentPos.clone().addScaledVector(dir, step);
      }

      let z_x = pos.x;
      let z_y = pos.y;
      let z_z = pos.z;

      if (layoutRules?.generativeMode === 'terrain') {
        z_y = 2000 - depth * 1800;
        z_x = pos.x * 1.6;
        z_z = pos.z * 1.6;
      }

      // Centrality
      const parentLinkCount = node.parentId ? 1 : 0;
      const childrenLinkCount = nodes.filter(n => n.parentId === node.id).length;
      const secondaryLinkCount = (node.secondaryLinks || []).length;
      const totalDegree = parentLinkCount + childrenLinkCount + secondaryLinkCount;

      processed.push({ ...node, z_x, z_y, z_z, depth, degree: totalDegree });

      const children = nodes.filter(n => n.parentId === nid);
      const N = children.length;
      if (N > 0) {
        if (depth === 0) {
          // ── FIBONACCI SPHERE DISTRIBUTION FOR TIER 1 ──
          // Distribute root children uniformly in all 3D directions around the central hub (0,0,0)
          const offset = 2.0 / N;
          const increment = Math.PI * (3.0 - Math.sqrt(5.0)); // golden angle
          
          children.forEach((child, i) => {
            const y = ((i * offset) - 1.0) + (offset / 2.0);
            const r = Math.sqrt(1.0 - y * y);
            const phi = i * increment;
            const x = Math.cos(phi) * r;
            const z = Math.sin(phi) * r;
            
            const childDir = new THREE.Vector3(x, y, z).normalize();
            walk(child.id, depth + 1, pos, childDir);
          });
        } else {
          // ── DYNAMIC CONE FANNING FOR TIER 2+ ──
          // Calculate orthogonal vectors to define fanning disk around parent line
          let u = new THREE.Vector3();
          let v = new THREE.Vector3();
          if (Math.abs(dir.x) < 0.9) {
            u.set(1, 0, 0).cross(dir).normalize();
          } else {
            u.set(0, 1, 0).cross(dir).normalize();
          }
          v.copy(dir).cross(u).normalize();

          // Scale cone angle dynamically with number of siblings N to prevent wide spacing on small branches
          const baseConeAngle = Math.min(0.85, 0.18 + N * 0.035);
          const coneAngle = baseConeAngle + (gapVal / 150) * 0.3; 

          children.forEach((child, i) => {
            let childDir = new THREE.Vector3();
            if (N === 1) {
              childDir.copy(dir);
            } else {
              // Distribute children in a cone around dir
              const theta = (2 * Math.PI * i) / N;
              const cosA = Math.cos(coneAngle);
              const sinA = Math.sin(coneAngle);
              childDir.copy(dir).multiplyScalar(cosA)
                .addScaledVector(u, sinA * Math.cos(theta))
                .addScaledVector(v, sinA * Math.sin(theta))
                .normalize();
            }
            walk(child.id, depth + 1, pos, childDir);
          });
        }
      }
    };

    const roots = nodes.filter(n => !n.parentId);
    if (roots.length > 0) {
      roots.forEach((root, i) => {
        walk(root.id, 0, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1));
      });
    }
    return processed;
  }, [nodes, layoutRules]);

  const getSortedTierList = useMemo(() => {
    if (!spatialNodes || spatialNodes.length === 0) return [];
    
    const q = searchQuery.toLowerCase().trim();
    let matching = [];
    const activeTargets = [];
    if (selectedNode) {
      activeTargets.push(selectedNode);
    }
    if (q) {
      spatialNodes.forEach(n => {
        const isMatch = n.title.toLowerCase().includes(q) || 
                        n.id.toLowerCase().includes(q) ||
                        (n.content && Object.values(n.content).some(val => 
                          typeof val === 'string' && val.toLowerCase().includes(q)
                        ));
        if (isMatch && !activeTargets.some(t => t.id === n.id)) {
          activeTargets.push(n);
        }
      });
    }

    if (activeTargets.length > 0) {
      const relevantSet = new Set();
      activeTargets.forEach(m => {
        relevantSet.add(m.id);
        
        let curr = m;
        while (curr) {
          relevantSet.add(curr.id);
          curr = curr.parentId ? spatialNodes.find(n => n.id === curr.parentId) : null;
        }
        
        const addChildren = (parentId) => {
          spatialNodes.forEach(n => {
            if (n.parentId === parentId && !relevantSet.has(n.id)) {
              relevantSet.add(n.id);
              addChildren(n.id);
            }
          });
        };
        addChildren(m.id);
        
        if (m.secondaryLinks) {
          m.secondaryLinks.forEach(sid => relevantSet.add(sid));
        }
        spatialNodes.forEach(n => {
          if (n.secondaryLinks && n.secondaryLinks.includes(m.id)) {
            relevantSet.add(n.id);
          }
        });
      });
      matching = spatialNodes.filter(n => relevantSet.has(n.id));
    } else {
      matching = spatialNodes;
    }

    const refNode = (selectedNode && matching.some(n => n.id === selectedNode.id))
      ? selectedNode
      : matching[0];

    const primaryNode = spatialNodes.find(n => n.id === 'tt_group') || { z_x: 0, z_y: 0, z_z: 0 };

    const getTier = (type) => {
      const t = type?.toUpperCase() || '';
      if (t === 'CONCEPT') return 1;
      if (t === 'PROCEDURE') return 2;
      if (t === 'PATTERN') return 3;
      if (t === 'VARIANT') return 4;
      if (t === 'SCENARIO') return 5;
      return 5;
    };

    const getDistance = (n1, n2) => {
      const dx = (n1.z_x || 0) - (n2.z_x || 0);
      const dy = (n1.z_y || 0) - (n2.z_y || 0);
      const dz = (n1.z_z || 0) - (n2.z_z || 0);
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };

    const mapped = matching.map(n => {
      const d1 = refNode ? getDistance(n, refNode) : 0;
      const d2 = getDistance(n, primaryNode);
      const tier = getTier(n.type);
      return { ...n, d1, d2, tier };
    });

    mapped.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.d1 !== b.d1) return a.d1 - b.d1;
      return a.d2 - b.d2;
    });

    return mapped;
  }, [searchQuery, spatialNodes, selectedNode]);

  const groupedTiers = useMemo(() => {
    const groups = {
      1: { name: 'Tier 1: Concepts', color: ENTITY_TYPES.CONCEPT?.color || '#a3e635', nodes: [] },
      2: { name: 'Tier 2: Procedures', color: ENTITY_TYPES.PROCEDURE?.color || '#60a5fa', nodes: [] },
      3: { name: 'Tier 3: Patterns', color: ENTITY_TYPES.PATTERN?.color || '#fb7185', nodes: [] },
      4: { name: 'Tier 4: Variants', color: ENTITY_TYPES.VARIANT?.color || '#c084fc', nodes: [] },
      5: { name: 'Tier 5: Scenarios', color: ENTITY_TYPES.SCENARIO?.color || '#f472b6', nodes: [] }
    };
    
    getSortedTierList.forEach(node => {
      const tier = node.tier;
      if (groups[tier]) {
        groups[tier].nodes.push(node);
      }
    });
    
    return Object.values(groups).filter(g => g.nodes.length > 0);
  }, [getSortedTierList]);

  const topMatchNode = useMemo(() => {
    if (selectedNode) return selectedNode;
    if (!activeSearchQuery?.trim() || getSortedTierList.length === 0) return null;
    return getSortedTierList[0];
  }, [selectedNode, activeSearchQuery, getSortedTierList]);

  const thumbprint = useMemo(() => {
    if (selectedNode) {
      const node = selectedNode;
      const path = [];
      let curr = node;
      while (curr) {
        path.unshift(curr.id);
        curr = curr.parentId ? nodes.find(n => n.id === curr.parentId) : null;
      }
      const ancestryPath = path.slice(0, -1).join('/');
      const targetId = node.id;
      const secondary = (node.secondaryLinks || [])
        .filter(id => id !== node.parentId)
        .sort()
        .join(', ');
      
      return ancestryPath 
        ? `${ancestryPath} > ${targetId}${secondary ? ` : {${secondary}}` : ''}`
        : `${targetId}${secondary ? ` : {${secondary}}` : ''}`;
    } else if (activeSearchQuery?.trim() && matchingNodeIds && matchingNodeIds.size > 0) {
      const matched = nodes.filter(n => matchingNodeIds.has(n.id));
      return getSearchSummaryPath(matched, nodes);
    }
    return '';
  }, [selectedNode, activeSearchQuery, matchingNodeIds, nodes]);

  const links = useMemo(() => {
    const l = [];
    const seen = new Set();
    spatialNodes.forEach(node => {
      if (node.parentId) {
        const p = spatialNodes.find(n => n.id === node.parentId);
        if (p) {
          const lKey = `link-${p.id}-${node.id}`;
          l.push({ key: lKey, from: p, to: node, type: 'parent', color: (ENTITY_TYPES[node.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT).color });
          seen.add(lKey);
        }
      }
      (node.secondaryLinks || []).forEach(sid => {
        const target = spatialNodes.find(n => n.id === sid);
        if (target) {
          const lKey = `link-sec-${node.id}-${target.id}`;
          if (!seen.has(lKey)) {
            const secondaryColor = isDark ? '#ffffff' : '#2E2B27';
            l.push({ key: lKey, from: node, to: target, type: 'secondary', color: secondaryColor });
            seen.add(lKey);
          }
        }
      });
    });
    return l;
  }, [spatialNodes, isDark]);

  return (
    <div className="w-full h-full relative animate-fade-in" style={{ background: bgColor }}>
      {/* Search Bar & Thumbprint Overlay */}
      <div 
        ref={searchRef}
        className="absolute top-8 left-1/2 -translate-x-1/2 z-[2000] flex flex-col items-center gap-2 pointer-events-auto"
        style={{ width: '420px' }}
      >
        {/* Search Bar Input Container */}
        <div 
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-300"
          style={{
            background: isDark ? 'rgba(10, 15, 25, 0.75)' : 'rgba(244, 239, 229, 0.85)',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(46, 43, 39, 0.15)',
            backdropFilter: 'blur(20px)',
            boxShadow: isDark ? '0 8px 32px rgba(0, 0, 0, 0.4)' : '0 8px 32px rgba(46, 43, 39, 0.1)'
          }}
        >
          <Search size={16} className={isDark ? 'text-slate-400' : 'text-[#6A645D]'} />
          <input
            type="text"
            className="flex-1 bg-transparent border-none outline-none font-sans text-xs"
            style={{
              color: isDark ? '#ffffff' : '#2E2B27',
            }}
            placeholder="Search nodes or paste thumbprint..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => {
              setShowSuggestions(true);
              setShowTierList(false);
            }}
            onClick={() => {
              setShowSuggestions(true);
              setShowTierList(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSelectNode(null);
                setShowTierList(false);
                setShowSuggestions(false);
                setActiveSearchQuery(searchQuery);
              }
            }}
          />
          {searchQuery && (
            <button 
              onClick={() => {
                setSearchQuery('');
                setActiveSearchQuery('');
                onSelectNode(null);
                setShowSuggestions(false);
                setShowTierList(false);
              }}
              className="p-0.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white"
            >
              <X size={14} />
            </button>
          )}
          <button 
            onClick={() => {
              setShowTierList(!showTierList);
              setShowSuggestions(false);
            }}
            className={`p-1 rounded transition-colors ${showTierList ? (isDark ? 'bg-white/20 text-[#00f2ff]' : 'bg-black/10 text-cyan-600') : 'text-slate-400 hover:text-white'}`}
            title="Toggle Node Tier Listing"
          >
            <ListOrdered size={16} />
          </button>
        </div>

        {/* Tier List Dropdown */}
        {showTierList && (
          <div 
            className="w-full max-h-80 overflow-y-auto rounded-xl border mt-1 flex flex-col gap-3 p-3 transition-all duration-300 scrollbar-thin"
            style={{
              background: isDark ? 'rgba(10, 15, 25, 0.95)' : 'rgba(244, 239, 229, 0.95)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(46, 43, 39, 0.15)',
              backdropFilter: 'blur(25px)',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)'
            }}
          >
            {groupedTiers.length === 0 ? (
              <div className="text-xs text-center text-slate-400 py-2">No matching nodes</div>
            ) : (
              groupedTiers.map((group) => (
                <div key={group.name} className="flex flex-col gap-1">
                  <div 
                    className="text-[10px] uppercase font-bold tracking-wider px-1 py-0.5 border-b pb-1"
                    style={{
                      color: group.color,
                      borderColor: `${group.color}30`
                    }}
                  >
                    {group.name}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {group.nodes.map((node) => (
                      <button
                        key={node.id}
                        onClick={() => {
                          onSelectNode(node);
                          setSearchQuery(node.title);
                          setShowTierList(false);
                        }}
                        className="w-full px-2 py-1.5 rounded text-left text-xs transition-colors flex items-center justify-between"
                        style={{
                          color: isDark ? '#e2e8f0' : '#2E2B27',
                          background: 'transparent',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(46, 43, 39, 0.05)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <span className="font-medium truncate mr-2">{node.title}</span>
                        {node.d1 !== undefined && (
                          <span className="text-[9px] text-slate-500 font-mono flex-shrink-0">
                            {node.d1 > 0 ? `d: ${Math.round(node.d1)}` : 'focal'}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Suggestion Dropdown */}
        {showSuggestions && !showTierList && suggestions.length > 0 && (
          <div 
            className="w-full max-h-60 overflow-y-auto rounded-xl border mt-1 flex flex-col gap-0.5 p-1 transition-all duration-300 scrollbar-thin"
            style={{
              background: isDark ? 'rgba(10, 15, 25, 0.95)' : 'rgba(244, 239, 229, 0.95)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(46, 43, 39, 0.15)',
              backdropFilter: 'blur(25px)',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)'
            }}
          >
            {suggestions.map((node) => {
              const config = ENTITY_TYPES[node.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT;
              return (
                <button
                  key={node.id}
                  onClick={() => {
                    onSelectNode(node);
                    setSearchQuery(node.title);
                    setShowSuggestions(false);
                  }}
                  className="w-full px-3 py-2 rounded-lg text-left text-xs transition-colors flex items-center justify-between"
                  style={{
                    color: isDark ? '#e2e8f0' : '#2E2B27',
                    background: 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(46, 43, 39, 0.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <span className="font-medium truncate mr-2">{node.title}</span>
                  <span 
                    className="text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-wider font-semibold flex-shrink-0"
                    style={{
                      borderColor: `${config.color}40`,
                      color: config.color,
                      background: `${config.color}10`
                    }}
                  >
                    {node.type}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Thumbprint Display */}
        {topMatchNode && thumbprint && (
          <div 
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-mono tracking-wider transition-all duration-300"
            style={{
              background: isDark ? 'rgba(10, 15, 25, 0.5)' : 'rgba(244, 239, 229, 0.6)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(46, 43, 39, 0.1)',
              color: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(46, 43, 39, 0.8)',
              backdropFilter: 'blur(10px)'
            }}
          >
            <span className="truncate max-w-[340px]" title={thumbprint}>
              {thumbprint}
            </span>
            <button 
              onClick={copyToClipboard}
              className="p-1 rounded hover:bg-white/10 transition-colors text-slate-400 hover:text-white flex items-center gap-1"
              title="Copy Thumbprint"
            >
              {copied ? (
                <Check size={10} className="text-emerald-400" />
              ) : (
                <Copy size={10} />
              )}
            </button>
          </div>
        )}
      </div>

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
        <InstancedNodes spatialNodes={spatialNodes} onSelectNode={onSelectNode} hoveredNodeId={hoveredNodeId} setHoveredNodeId={setHoveredNodeId} selectedNode={selectedNode} layoutRules={layoutRules} connectedNodeIds={connectedNodeIds} matchingNodeIds={matchingNodeIds} />
        {spatialNodes.filter(n => n.depth <= 2 || hoveredNodeId === n.id || selectedNode?.id === n.id || connectedNodeIds.has(n.id) || (matchingNodeIds && matchingNodeIds.has(n.id))).map(node => {
          const isNodeDimmed = selectedNode 
            ? !connectedNodeIds.has(node.id) 
            : (matchingNodeIds ? !matchingNodeIds.has(node.id) : false);
          return (
            <Billboard key={`label-${node.id}`} position={[node.z_x, node.z_y + 280, node.z_z + 50]} onPointerOver={() => setHoveredNodeId(node.id)}>
              <CanvasTexturePillLabel title={node.title} isRoot={node.depth === 0} isSelected={selectedNode?.id === node.id} isDark={isDark} nodeColor={(ENTITY_TYPES[node.type?.toUpperCase()] || ENTITY_TYPES.CONCEPT).color} isDimmed={isNodeDimmed} />
            </Billboard>
          );
        })}
        {links.map(link => {
          const isLinkConnected = selectedNode && (link.from.id === selectedNode.id || link.to.id === selectedNode.id);
          const isLinkDimmed = selectedNode 
            ? !isLinkConnected 
            : (matchingNodeIds ? !(matchingNodeIds.has(link.from.id) && matchingNodeIds.has(link.to.id)) : false);
          const isMycelium = layoutRules?.generativeMode === 'mycelium';
          
          const lineThickness = isMycelium ? (isLinkConnected ? 4.5 : 2.0) : (isLinkConnected ? 2.5 : (link.type === 'secondary' ? 0.3 : 0.6));
          const lineOpacity = isLinkDimmed ? 0.02 : (isLinkConnected ? 1.0 : (link.type === 'secondary' ? 0.08 : 0.18));

          let points = [
            new THREE.Vector3(link.from.z_x || 0, link.from.z_y || 0, link.from.z_z || 0),
            new THREE.Vector3(link.to.z_x || 0, link.to.z_y || 0, link.to.z_z || 0)
          ];
          if (isMycelium || link.type === 'secondary') {
            const vStart = points[0];
            const vEnd = points[1];
            const mid = new THREE.Vector3().lerpVectors(vStart, vEnd, 0.5);
            if (mid.length() > 0.1) {
              mid.normalize().multiplyScalar(Math.max(vStart.length(), vEnd.length(), 500) * 1.4);
            } else {
              mid.set(0, 0, 1).multiplyScalar(Math.max(vStart.length(), vEnd.length(), 1000) * 1.4);
            }
            const curve = new THREE.QuadraticBezierCurve3(vStart, mid, vEnd);
            points = curve.getPoints(isMycelium ? 32 : 16);
          }

          return (
            <Line key={link.key} points={points} color={link.color} lineWidth={lineThickness} opacity={lineOpacity} transparent depthWrite={false} />
          );
        })}
        
        {layoutRules?.generativeMode === 'terrain' && (
          <gridHelper args={[150000, 80, isDark ? '#00f2ff' : '#0891B2', isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)']} position={[0, -9000, 0]} transparent opacity={0.35} />
        )}
        
        <Environment preset="night" />
      </Canvas>
      {cameraInstance && controlsInstance && <MiniMap spatialNodes={spatialNodes} camera={cameraInstance} controls={controlsInstance} theme={theme} />}
    </div>
  );
};
