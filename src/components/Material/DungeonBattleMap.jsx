// Procedural Tabletop Dungeon Battlemap for Ker Nethalas & Solo Delving
// Procedurally generated in the authentic hand-drawn Mike Schley / Dyson Logos style
import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Icon, Btn } from '../HomebrewBeta/ui';

// Deterministic PRNG for stable procedural room layouts
function sfc32(a, b, c, d) {
  return function() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = c << 21 | c >>> 11;
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
}

function hashString(str = '') {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ ch, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ ch, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ ch, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ ch, 2716044179);
  }
  return sfc32(h1, h2, h3, h4);
}

// Generate organic cavern polygon with craggy rock variations
function generateCavernPolygon(cx, cy, rw, rh, rand) {
  const numPoints = 24;
  const pts = [];
  const seed = rand() * 100;
  
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    // Multi-frequency harmonic rock deformers
    const harm1 = Math.sin(angle * 3 + seed) * 0.16;
    const harm2 = Math.cos(angle * 5 + seed * 1.6) * 0.10;
    const harm3 = Math.sin(angle * 7 + seed * 2.8) * 0.05;
    const jitter = (rand() - 0.5) * 0.06;
    
    const radW = (rw / 2) * (1 + harm1 + harm2 + harm3 + jitter);
    const radH = (rh / 2) * (1 + harm1 - harm2 + harm3 - jitter);
    
    const px = cx + Math.cos(angle) * radW;
    const py = cy + Math.sin(angle) * radH;
    pts.push([px, py]);
  }
  return pts;
}

// Generate rectangular masonry room polygon
function generateRectPolygon(cx, cy, rw, rh) {
  const hw = rw / 2;
  const hh = rh / 2;
  return [
    [cx - hw, cy - hh],
    [cx + hw, cy - hh],
    [cx + hw, cy + hh],
    [cx - hw, cy + hh],
  ];
}

// Convert points array to smooth SVG path
function polygonToSvgPath(pts, closed = true) {
  if (!pts || pts.length < 2) return '';
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length; i++) {
    const curr = pts[i];
    const next = pts[(i + 1) % pts.length];
    const mx = ((curr[0] + next[0]) / 2).toFixed(1);
    const my = ((curr[1] + next[1]) / 2).toFixed(1);
    d += ` Q ${curr[0].toFixed(1)} ${curr[1].toFixed(1)} ${mx} ${my}`;
  }
  if (closed) d += ' Z';
  return d;
}

// Generate Mike Schley / Dyson Logos perpendicular wall feathering (hatching)
function generateWallHatching(pts, rand) {
  const hatches = [];
  const step = 6; // distance along wall per hatch mark
  
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    
    const nx = -dy / len; // outward normal
    const ny = dx / len;
    
    const count = Math.max(1, Math.floor(len / step));
    for (let c = 0; c <= count; c++) {
      const t = c / count;
      const ox = p1[0] + dx * t;
      const oy = p1[1] + dy * t;
      
      // Variable hatch stroke length with jitter
      const hatchLen = 11 + rand() * 7;
      const angleJitter = (rand() - 0.5) * 0.25;
      
      const cosA = Math.cos(angleJitter);
      const sinA = Math.sin(angleJitter);
      const rnx = nx * cosA - ny * sinA;
      const rny = nx * sinA + ny * cosA;
      
      const ex = ox + rnx * hatchLen;
      const ey = oy + rny * hatchLen;
      
      hatches.push({ x1: ox, y1: oy, x2: ex, y2: ey });
    }
  }
  return hatches;
}

export default function DungeonBattleMap({
  exploredRooms = [],
  currentRoom = null,
  availableDirections = [],
  hero = null,
  campaignTitle = 'Catacombs of Ker Nethalas',
  turnCount = 1,
  onSelectDirection,
  onTakeBreather,
}) {
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [activePopover, setActivePopover] = useState(null);

  // Procedural spatial layout computation
  const dungeonData = useMemo(() => {
    if (!exploredRooms.length) {
      return { rooms: [], corridors: [], bounds: { minX: 0, minY: 0, maxX: 1200, maxY: 900 } };
    }

    const rooms = [];
    const corridors = [];
    const GRID_SPACING = 240;
    const occupied = new Map(); // "col,row" -> room

    // Start chamber at center grid (3, 3)
    let curCol = 3;
    let curRow = 3;

    exploredRooms.forEach((room, idx) => {
      const rand = hashString(room.id || room.name || `room_${idx}`);
      
      // Determine chamber classification from sensory description & title
      const text = `${room.name} ${room.title || ''} ${room.desc || ''}`.toLowerCase();
      const isCavern = /cave|cavern|chasm|descent|maw|hollow|rough|cleft|grotto/i.test(text);
      const hasWater = /water|stream|pool|sluice|lake|cistern|flooded|sunken/i.test(text);
      const isCrypt = /crypt|sepulchre|tomb|sarcophagus|burial|vault|bones/i.test(text);
      const isTemple = /nave|temple|sanctuary|altar|chapel|reliquary|pillar/i.test(text);
      const hasBarrels = /store|supply|barrel|crate|cellar/i.test(text);
      const hasBeds = /barrack|quarters|bunk|camp|rest/i.test(text);

      const rw = isCavern ? (145 + Math.floor(rand() * 40)) : (isTemple ? 170 : 135);
      const rh = isCavern ? (120 + Math.floor(rand() * 35)) : (isTemple ? 135 : 115);

      if (idx > 0) {
        // Determine directional branch
        const dirHint = (room.name + ' ' + (room.desc || '')).toLowerCase();
        let targetCol = curCol;
        let targetRow = curRow;

        if (/north|upward|ahead|deeper/i.test(dirHint)) targetRow -= 1;
        else if (/south|backtrack|retreat|descent/i.test(dirHint)) targetRow += 1;
        else if (/east|right/i.test(dirHint)) targetCol += 1;
        else if (/west|left/i.test(dirHint)) targetCol -= 1;
        else {
          // Circular snake branching if no explicit direction
          const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
          const dir = directions[idx % 4];
          targetCol += dir[0];
          targetRow += dir[1];
        }

        // Avoid collision
        let attempts = 0;
        while (occupied.has(`${targetCol},${targetRow}`) && attempts < 8) {
          targetCol += (attempts % 2 === 0 ? 1 : -1);
          if (attempts > 3) targetRow += 1;
          attempts++;
        }

        curCol = targetCol;
        curRow = targetRow;
      }

      occupied.set(`${curCol},${curRow}`, idx);

      const cx = curCol * GRID_SPACING + 180;
      const cy = curRow * GRID_SPACING + 160;

      // Generate polygon points
      const pts = isCavern
        ? generateCavernPolygon(cx, cy, rw, rh, rand)
        : generateRectPolygon(cx, cy, rw, rh);

      // Generate Mike Schley perpendicular wall feathering
      const wallHatches = generateWallHatching(pts, rand);

      // Water feature inside chamber
      let waterPts = null;
      if (hasWater) {
        waterPts = generateCavernPolygon(cx + 8, cy + 12, rw * 0.58, rh * 0.45, rand);
      }

      // Pillars placement for temples & crypts
      const pillars = [];
      if ((isTemple || isCrypt) && !isCavern) {
        const offsetW = rw / 2 - 22;
        const offsetH = rh / 2 - 20;
        pillars.push({ x: cx - offsetW, y: cy - offsetH });
        pillars.push({ x: cx + offsetW, y: cy - offsetH });
        pillars.push({ x: cx - offsetW, y: cy + offsetH });
        pillars.push({ x: cx + offsetW, y: cy + offsetH });
      }

      // Sarcophagi in crypts
      const sarcophagi = [];
      if (isCrypt) {
        sarcophagi.push({ x: cx - 18, y: cy - 10, w: 36, h: 20 });
      }

      // Barrels in storerooms
      const barrels = [];
      if (hasBarrels) {
        barrels.push({ x: cx - rw / 2 + 18, y: cy - rh / 2 + 18, r: 6 });
        barrels.push({ x: cx - rw / 2 + 30, y: cy - rh / 2 + 16, r: 5.5 });
        barrels.push({ x: cx - rw / 2 + 20, y: cy - rh / 2 + 30, r: 6 });
      }

      // Connect with previous room via corridor
      if (idx > 0) {
        const prev = rooms[idx - 1];
        const midX = (prev.cx + cx) / 2;
        const midY = (prev.cy + cy) / 2;
        
        corridors.push({
          id: `corr_${prev.id}_${room.id}`,
          from: { x: prev.cx, y: prev.cy },
          to: { x: cx, y: cy },
          mid: { x: midX, y: midY },
        });
      }

      rooms.push({
        ...room,
        cx,
        cy,
        rw,
        rh,
        pts,
        pathD: polygonToSvgPath(pts),
        wallHatches,
        isCavern,
        hasWater,
        waterPts,
        waterPathD: waterPts ? polygonToSvgPath(waterPts) : null,
        isCrypt,
        isTemple,
        pillars,
        sarcophagi,
        barrels,
        hasBeds,
      });
    });

    // Compute bounding canvas box with breathing margins
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    rooms.forEach((r) => {
      minX = Math.min(minX, r.cx - r.rw / 2 - 120);
      minY = Math.min(minY, r.cy - r.rh / 2 - 120);
      maxX = Math.max(maxX, r.cx + r.rw / 2 + 120);
      maxY = Math.max(maxY, r.cy + r.rh / 2 + 120);
    });

    minX = Math.floor(Math.min(minX, 0));
    minY = Math.floor(Math.min(minY, 0));
    maxX = Math.ceil(Math.max(maxX, 1200));
    maxY = Math.ceil(Math.max(maxY, 900));

    return {
      rooms,
      corridors,
      bounds: { minX, minY, maxX, maxY },
    };
  }, [exploredRooms]);

  const { rooms, corridors, bounds } = dungeonData;
  const mapWidth = bounds.maxX - bounds.minX;
  const mapHeight = bounds.maxY - bounds.minY;

  // Center viewport on current room
  const centerOnHero = useCallback(() => {
    const cur = rooms.find((r) => r.isCurrent) || rooms[rooms.length - 1];
    if (!cur || !containerRef.current) {
      setPan({ x: 0, y: 0 });
      setZoom(1);
      return;
    }

    const { clientWidth, clientHeight } = containerRef.current;
    const targetZoom = 1.15;
    const targetX = (clientWidth / 2) - ((cur.cx - bounds.minX) * targetZoom);
    const targetY = (clientHeight / 2) - ((cur.cy - bounds.minY) * targetZoom);

    setZoom(targetZoom);
    setPan({ x: targetX, y: targetY });
  }, [rooms, bounds.minX, bounds.minY]);

  useEffect(() => {
    if (rooms.length > 0) {
      centerOnHero();
    }
  }, [rooms.length, centerOnHero]);

  // Pan & zoom handlers
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const onMouseMove = (e) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const onMouseUp = () => setIsDragging(false);

  const onWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom((z) => Math.max(0.45, Math.min(2.8, z * factor)));
  };

  const curRoom = rooms.find((r) => r.isCurrent);

  return (
    <div className="imsd-battlemap-container">
      {/* Top Map Toolbar */}
      <div className="dungeon-map-toolbar">
        <div className="dungeon-map-toolbar-left">
          <span className="dungeon-map-title">{campaignTitle}</span>
          <span className="dungeon-map-badge">{exploredRooms.length} Chambers Explored</span>
        </div>
        <div className="dungeon-map-toolbar-right">
          <button type="button" className="dungeon-tool-btn" onClick={() => setZoom((z) => Math.min(2.8, z + 0.25))} title="Zoom In">+</button>
          <button type="button" className="dungeon-tool-btn" onClick={() => setZoom((z) => Math.max(0.45, z - 0.25))} title="Zoom Out">&minus;</button>
          <button type="button" className="dungeon-tool-btn" onClick={centerOnHero} title="Center on Hero">🎯 Hero</button>
        </div>
      </div>

      {/* Main Drag-Pan Viewport */}
      <div
        ref={containerRef}
        className={`dungeon-viewport ${isDragging ? 'grabbing' : ''}`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      >
        <svg
          className="dungeon-battlemap-svg"
          width={mapWidth * zoom}
          height={mapHeight * zoom}
          viewBox={`${bounds.minX} ${bounds.minY} ${mapWidth} ${mapHeight}`}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px)`,
          }}
        >
          <defs>
            {/* 10-foot square tabletop battlemap grid */}
            <pattern id="schleyBattleGrid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(135, 110, 80, 0.32)" strokeWidth="0.8" />
            </pattern>

            {/* Mottled stone noise/parchment background pattern */}
            <pattern id="parchmentTexture" width="120" height="120" patternUnits="userSpaceOnUse">
              <rect width="120" height="120" fill="#bba98e" />
              <path d="M 0,30 Q 30,25 60,32 T 120,28" stroke="rgba(80, 60, 40, 0.08)" fill="none" strokeWidth="2" />
              <path d="M 10,75 Q 40,85 80,72 T 120,78" stroke="rgba(80, 60, 40, 0.08)" fill="none" strokeWidth="2" />
              <circle cx="45" cy="45" r="18" fill="rgba(60, 45, 30, 0.05)" />
              <circle cx="95" cy="95" r="14" fill="rgba(60, 45, 30, 0.05)" />
            </pattern>

            {/* Ambient Occlusion Wall Drop Shadow */}
            <filter id="schleyWallShadow" x="-15%" y="-15%" width="130%" height="130%">
              <feDropShadow dx="3" dy="4" stdDeviation="4.5" floodColor="#181109" floodOpacity="0.75" />
            </filter>

            {/* Interactive Badge Drop Shadow */}
            <filter id="schleyBadgeGlow" x="-25%" y="-25%" width="150%" height="150%">
              <feDropShadow dx="0" dy="2.5" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.75" />
            </filter>

            {/* Water Glow & Shading */}
            <filter id="schleyWaterGlow" x="-15%" y="-15%" width="130%" height="130%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#38bdf8" floodOpacity="0.5" />
            </filter>

            {/* Delver Torch Halo */}
            <radialGradient id="schleyTorchGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fff2cc" stopOpacity="0.45" />
              <stop offset="65%" stopColor="#f59e0b" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </radialGradient>

            <clipPath id="heroTokenClip">
              <circle cx="0" cy="0" r="14" />
            </clipPath>
          </defs>

          {/* 1. Antiqued Stone Parchment Canvas Bedrock */}
          <rect
            x={bounds.minX}
            y={bounds.minY}
            width={mapWidth}
            height={mapHeight}
            fill="url(#parchmentTexture)"
          />

          {/* Double Inked Outer Map Border with Filigree Corners */}
          <rect
            x={bounds.minX + 16}
            y={bounds.minY + 16}
            width={mapWidth - 32}
            height={mapHeight - 32}
            fill="none"
            stroke="#2b1a0d"
            strokeWidth="3.5"
          />
          <rect
            x={bounds.minX + 22}
            y={bounds.minY + 22}
            width={mapWidth - 44}
            height={mapHeight - 44}
            fill="none"
            stroke="#5c3e21"
            strokeWidth="1.2"
          />

          {/* 2. Corridors Connecting Explored Chambers */}
          <g className="schley-corridors">
            {corridors.map((c) => {
              return (
                <g key={c.id}>
                  {/* Thick stone corridor trench */}
                  <path
                    d={`M ${c.from.x} ${c.from.y} L ${c.mid.x} ${c.from.y} L ${c.mid.x} ${c.to.y} L ${c.to.x} ${c.to.y}`}
                    fill="none"
                    stroke="#1c1208"
                    strokeWidth="32"
                    strokeLinecap="square"
                    filter="url(#schleyWallShadow)"
                  />
                  {/* Paved floor trench */}
                  <path
                    d={`M ${c.from.x} ${c.from.y} L ${c.mid.x} ${c.from.y} L ${c.mid.x} ${c.to.y} L ${c.to.x} ${c.to.y}`}
                    fill="none"
                    stroke="#ede3ce"
                    strokeWidth="26"
                    strokeLinecap="square"
                  />
                  {/* Interior battlemap grid lines in corridor */}
                  <path
                    d={`M ${c.from.x} ${c.from.y} L ${c.mid.x} ${c.from.y} L ${c.mid.x} ${c.to.y} L ${c.to.x} ${c.to.y}`}
                    fill="none"
                    stroke="rgba(135, 110, 80, 0.4)"
                    strokeWidth="1.2"
                    strokeDasharray="4,6"
                  />
                  {/* Doorway threshold mark */}
                  <rect
                    x={c.mid.x - 5}
                    y={c.mid.y - 7}
                    width="10"
                    height="14"
                    fill="#634327"
                    stroke="#231407"
                    strokeWidth="1"
                  />
                </g>
              );
            })}
          </g>

          {/* 3. The Distinctive Mike Schley Walls: Perpendicular Feathering Hatches */}
          <g className="schley-wall-feathering" pointerEvents="none">
            {rooms.map((room) => (
              <g key={`hatch_${room.id}`}>
                {room.wallHatches.map((h, hi) => (
                  <line
                    key={hi}
                    x1={h.x1}
                    y1={h.y1}
                    x2={h.x2}
                    y2={h.y2}
                    stroke="#26170b"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    opacity="0.85"
                  />
                ))}
              </g>
            ))}
          </g>

          {/* 4. Excavated Chamber Floors with Ambient Shadow & Grid */}
          <g className="schley-chambers">
            {rooms.map((room, idx) => {
              const isSelected = selectedRoomId === room.id || (!selectedRoomId && room.isCurrent);
              const isCurrent = room.isCurrent;

              return (
                <g
                  key={room.id}
                  className={`schley-chamber-group ${isCurrent ? 'current' : ''} ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedRoomId(room.id)}
                >
                  {/* Heavy outer wall boundary line */}
                  <path
                    d={room.pathD}
                    fill="#ede3ce"
                    stroke={isCurrent ? '#d4a359' : '#1c1208'}
                    strokeWidth={isCurrent ? '4' : '3'}
                    filter="url(#schleyWallShadow)"
                  />

                  {/* 10-foot square grid overlay inside room */}
                  <path
                    d={room.pathD}
                    fill="url(#schleyBattleGrid)"
                    pointerEvents="none"
                  />

                  {/* Warm torchlight illumination overlay */}
                  <ellipse
                    cx={room.cx}
                    cy={room.cy}
                    rx={room.rw * 0.65}
                    ry={room.rh * 0.65}
                    fill="url(#schleyTorchGlow)"
                    pointerEvents="none"
                  />

                  {/* Subterranean Water Body with Concentric Bathymetric Ripples */}
                  {room.hasWater && room.waterPathD && (
                    <g className="schley-water-feature" filter="url(#schleyWaterGlow)">
                      {/* Base water pool */}
                      <path
                        d={room.waterPathD}
                        fill="#7dd3fc"
                        fillOpacity="0.45"
                        stroke="#0284c7"
                        strokeWidth="1.8"
                      />
                      {/* Concentric ripple 1 */}
                      <path
                        d={room.waterPathD}
                        fill="none"
                        stroke="rgba(240, 249, 255, 0.65)"
                        strokeWidth="1.2"
                        strokeDasharray="5,6"
                        transform={`scale(0.85) translate(${room.cx * 0.17}, ${room.cy * 0.17})`}
                      />
                      {/* Concentric ripple 2 */}
                      <path
                        d={room.waterPathD}
                        fill="none"
                        stroke="rgba(240, 249, 255, 0.5)"
                        strokeWidth="1"
                        strokeDasharray="3,5"
                        transform={`scale(0.68) translate(${room.cx * 0.47}, ${room.cy * 0.47})`}
                      />
                    </g>
                  )}

                  {/* Architectural Stone Pillars (Circle on square base) */}
                  {room.pillars.map((p, pi) => (
                    <g key={pi} className="schley-pillar" pointerEvents="none">
                      <rect x={p.x - 7} y={p.y - 7} width="14" height="14" fill="#a89379" stroke="#362211" strokeWidth="1" />
                      <circle cx={p.x} cy={p.y} r="5" fill="#f5ede0" stroke="#241509" strokeWidth="1.4" />
                    </g>
                  ))}

                  {/* Sarcophagus Plinths in Crypts */}
                  {room.sarcophagi.map((s, si) => (
                    <g key={si} className="schley-sarcophagus" pointerEvents="none">
                      <rect x={s.x} y={s.y} width={s.w} height={s.h} rx="2" fill="#8f775c" stroke="#26160a" strokeWidth="1.5" />
                      <rect x={s.x + 3} y={s.y + 3} width={s.w - 6} height={s.h - 6} rx="1" fill="#ded2bc" stroke="#4a341e" strokeWidth="1" />
                    </g>
                  ))}

                  {/* Wooden Barrels */}
                  {room.barrels.map((b, bi) => (
                    <circle key={bi} cx={b.x} cy={b.y} r={b.r} fill="#825a36" stroke="#2b1a0e" strokeWidth="1.2" pointerEvents="none" />
                  ))}

                  {/* Chamber Header Banner with Room Index & Name */}
                  <g transform={`translate(${room.cx}, ${room.cy - room.rh / 2 + 18})`} filter="url(#schleyBadgeGlow)">
                    <rect
                      x="-60"
                      y="-11"
                      width="120"
                      height="22"
                      rx="11"
                      fill={isCurrent ? '#451a03' : '#23160a'}
                      stroke={isCurrent ? '#facc15' : '#8c6d46'}
                      strokeWidth={isCurrent ? '2' : '1.2'}
                    />
                    <text x="-44" y="4" className="schley-room-badge-idx">#{idx + 1}</text>
                    <text x="6" y="4" textAnchor="middle" className="schley-room-badge-name">
                      {room.name.length > 13 ? `${room.name.slice(0, 12)}…` : room.name}
                    </text>
                  </g>

                  {/* Interactive Wax-Seal Buttons (🔥 Torch, 💀 Skull, ⛺ Camp) */}
                  <g transform={`translate(${room.cx - 36}, ${room.cy + 10})`} filter="url(#schleyBadgeGlow)">
                    {/* Torch Button (Chamber Survey & Sensory Lore) */}
                    <g
                      className="dungeon-interactive-btn torch"
                      onMouseEnter={() => setActivePopover({ type: 'torch', roomId: room.id, title: room.name, content: room.desc, fullDesc: room.fullDesc, turns: room.turns })}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActivePopover((cur) => cur?.roomId === room.id && cur?.type === 'torch' ? null : { type: 'torch', roomId: room.id, title: room.name, content: room.desc, fullDesc: room.fullDesc, turns: room.turns, pinned: true });
                      }}
                      title="Inspect Chamber (Torch Survey)"
                    >
                      <circle cx="12" cy="12" r="11" className="badge-bg torch" />
                      <text x="12" y="16" textAnchor="middle" className="badge-icon">🔥</text>
                    </g>

                    {/* Skull Button (Defeated Foes List) */}
                    {room.kills.length > 0 && (
                      <g
                        className="dungeon-interactive-btn skull"
                        transform="translate(26, 0)"
                        onMouseEnter={() => setActivePopover({ type: 'skull', roomId: room.id, title: `${room.kills.length} Slain in ${room.name}`, kills: room.kills })}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivePopover((cur) => cur?.roomId === room.id && cur?.type === 'skull' ? null : { type: 'skull', roomId: room.id, title: `${room.kills.length} Slain in ${room.name}`, kills: room.kills, pinned: true });
                        }}
                        title={`Slain Foes: ${room.kills.map((k) => k.name).join(', ')}`}
                      >
                        <circle cx="12" cy="12" r="11" className="badge-bg skull" />
                        <text x="12" y="16" textAnchor="middle" className="badge-icon">💀</text>
                        {room.kills.length > 1 && (
                          <circle cx="19" cy="5" r="4.5" fill="#f87171" stroke="#450a0a" strokeWidth="1" />
                        )}
                      </g>
                    )}

                    {/* Camp Button (Bivouac & Breather Rest) */}
                    {room.isCampable && (
                      <g
                        className="dungeon-interactive-btn camp"
                        transform={`translate(${room.kills.length > 0 ? 52 : 26}, 0)`}
                        onMouseEnter={() => setActivePopover({ type: 'camp', roomId: room.id, title: `Bivouac: ${room.name}`, content: room.campReason, isCurrent })}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivePopover((cur) => cur?.roomId === room.id && cur?.type === 'camp' ? null : { type: 'camp', roomId: room.id, title: `Bivouac: ${room.name}`, content: room.campReason, isCurrent, pinned: true });
                        }}
                        title="Suitable for Camping / Rest"
                      >
                        <circle cx="12" cy="12" r="11" className="badge-bg camp" />
                        <text x="12" y="16" textAnchor="middle" className="badge-icon">⛺</text>
                      </g>
                    )}
                  </g>

                  {/* Current Location: Concentric Pulsing Gold Beacon Rings & Hero Token */}
                  {isCurrent && (
                    <g className="dungeon-hero-beacon" transform={`translate(${room.cx}, ${room.cy - 12})`}>
                      <circle cx="0" cy="0" r="28" className="beacon-pulse-ring" />
                      <circle cx="0" cy="0" r="16" className="beacon-hero-disc" />
                      {hero?.avatar_url ? (
                        <image
                          href={hero.avatar_url}
                          x="-14"
                          y="-14"
                          width="28"
                          height="28"
                          clipPath="url(#heroTokenClip)"
                          preserveAspectRatio="xMidYMid slice"
                        />
                      ) : (
                        <text x="0" y="5" textAnchor="middle" fontSize="14">🛡️</text>
                      )}
                      <g transform="translate(0, 24)" filter="url(#schleyBadgeGlow)">
                        <rect x="-30" y="-7" width="60" height="14" rx="7" className="beacon-hero-tag-bg" />
                        <text x="0" y="3.5" textAnchor="middle" className="beacon-hero-tag-text">HERE NOW</text>
                      </g>
                    </g>
                  )}
                </g>
              );
            })}
          </g>

          {/* 5. Ornate Gothic Compass Rose (Top-Right) */}
          <g transform={`translate(${bounds.maxX - 90}, ${bounds.minY + 90})`} className="dungeon-compass-rose" pointerEvents="none">
            <circle cx="0" cy="0" r="42" fill="rgba(240, 230, 210, 0.9)" stroke="#4a3520" strokeWidth="2" />
            <circle cx="0" cy="0" r="38" fill="none" stroke="rgba(140, 95, 40, 0.4)" strokeWidth="1" strokeDasharray="2,3" />
            {/* North Point */}
            <polygon points="0,-36 6,-8 0,-14" fill="#8b2626" />
            <polygon points="0,-36 -6,-8 0,-14" fill="#4a1515" />
            {/* South Point */}
            <polygon points="0,36 6,8 0,14" fill="#a07d4b" />
            <polygon points="0,36 -6,8 0,14" fill="#5c4424" />
            {/* East Point */}
            <polygon points="36,0 8,6 14,0" fill="#a07d4b" />
            <polygon points="36,0 8,-6 14,0" fill="#5c4424" />
            {/* West Point */}
            <polygon points="-36,0 -8,6 -14,0" fill="#a07d4b" />
            <polygon points="-36,0 -8,-6 -14,0" fill="#5c4424" />
            <text x="0" y="-20" textAnchor="middle" className="compass-n-text">N</text>
          </g>

          {/* 6. Hand-Drawn Cartouche Plaque (Bottom-Left) */}
          <g transform={`translate(${bounds.minX + 35}, ${bounds.maxY - 75})`} className="dungeon-cartouche" pointerEvents="none">
            <rect x="0" y="0" width="310" height="54" rx="4" fill="rgba(245, 237, 222, 0.95)" stroke="#4a3520" strokeWidth="2" filter="url(#schleyWallShadow)" />
            <rect x="3" y="3" width="304" height="48" rx="2" fill="none" stroke="rgba(140, 95, 40, 0.5)" strokeWidth="1" />
            <text x="12" y="22" className="cartouche-title">KER NETHALAS · VAELORIAN DOMAIN</text>
            <text x="12" y="40" className="cartouche-sub">Turn {turnCount} · 1 Square = 10 Feet · Explored Chambers: {exploredRooms.length}</text>
          </g>

          {/* 7. Classic Tabletop Legend Box (Bottom-Right) */}
          <g transform={`translate(${bounds.maxX - 195}, ${bounds.maxY - 145})`} className="dungeon-legend-box" pointerEvents="none">
            <rect x="0" y="0" width="165" height="125" rx="4" fill="rgba(245, 237, 222, 0.95)" stroke="#4a3520" strokeWidth="2" filter="url(#schleyWallShadow)" />
            <rect x="3" y="3" width="159" height="119" rx="2" fill="none" stroke="rgba(140, 95, 40, 0.45)" strokeWidth="1" />
            <text x="12" y="20" className="legend-head">MAP LEGEND</text>
            <text x="12" y="38" className="legend-item"><tspan fill="#d4a359">📍</tspan> Current Location</text>
            <text x="12" y="55" className="legend-item"><tspan fill="#d4a359">🔥</tspan> Torch / Description</text>
            <text x="12" y="72" className="legend-item"><tspan fill="#f87171">💀</tspan> Slain Foes</text>
            <text x="12" y="89" className="legend-item"><tspan fill="#34d399">⛺</tspan> Safe Bivouac</text>
            <text x="12" y="106" className="legend-item"><tspan fill="#38bdf8">💧</tspan> Subterranean Sluice</text>
          </g>
        </svg>

        {/* Floating Chamber Survey Popover Card */}
        {activePopover && (
          <div
            className={`dungeon-map-popover ${activePopover.type}`}
            style={{
              position: 'absolute',
              top: '60px',
              left: '18px',
              maxWidth: '340px',
              zIndex: 50,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="popover-head">
              <b>
                {activePopover.type === 'torch' && '🔥 Chamber Survey'}
                {activePopover.type === 'skull' && '💀 Slain Foes'}
                {activePopover.type === 'camp' && '⛺ Camping Assessment'}
              </b>
              <button type="button" className="popover-close" onClick={() => setActivePopover(null)}>&times;</button>
            </div>

            {activePopover.type === 'torch' && (
              <div className="popover-body">
                <span className="popover-room-name">{activePopover.title}</span>
                <p className="popover-desc">{activePopover.content}</p>
                {activePopover.fullDesc && activePopover.fullDesc !== activePopover.content && (
                  <p className="popover-full">{activePopover.fullDesc}</p>
                )}
                {activePopover.turns && (
                  <small className="popover-meta">Explored on Turns: {activePopover.turns.join(', ')}</small>
                )}
              </div>
            )}

            {activePopover.type === 'skull' && (
              <div className="popover-body">
                <span className="popover-room-name">{activePopover.title}</span>
                <ul className="popover-kill-list">
                  {activePopover.kills?.map((k, ki) => (
                    <li key={ki}>
                      <span className="kill-name">{k.name}</span>
                      <span className="kill-meta">(Turn {k.turn} · {k.hp ? `${k.hp} Max HP` : 'Slain'})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {activePopover.type === 'camp' && (
              <div className="popover-body">
                <span className="popover-room-name">{activePopover.title}</span>
                <p className="popover-camp-reason">{activePopover.content}</p>
                {activePopover.isCurrent && onTakeBreather && (
                  <div className="popover-camp-action">
                    <Btn kind="tonal" onClick={onTakeBreather}>
                      Take a Breather (Rest Here)
                    </Btn>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Available Directions Footer Bar */}
      <div className="dungeon-map-directions-footer">
        <div className="directions-bar-head">
          <span className="pin-loc"><Icon n="place" size={14} /> Current Chamber: <b>{currentRoom ? currentRoom.name : 'Unknown Subterrane'}</b></span>
          <span className="directions-hint">Select a direction to venture onward:</span>
        </div>
        <div className="directions-bar-cards">
          {availableDirections.length ? (
            availableDirections.map((dir) => (
              <button
                key={dir.id}
                type="button"
                className="dungeon-dir-pill sl"
                onClick={() => onSelectDirection?.(dir.raw)}
                title={`Venture ${dir.dir}: "${dir.text}"`}
              >
                <span className={`dir-icon-badge ${dir.tag.toLowerCase()}`}>
                  <Icon n={dir.icon} size={13} />
                  <span>{dir.dir}</span>
                </span>
                <span className="dir-pill-text">{dir.text}</span>
                <span className="dir-pill-arrow">&rarr;</span>
              </button>
            ))
          ) : (
            <span className="muted" style={{ fontStyle: 'italic', fontSize: '13px' }}>
              No immediate corridors available; search the stonework or consult Rindewind.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
