// Draws the Domain map in the style of a Dyson Logos dungeon: black ink on white, a hand-wobbled wall line with a grey
// shadow, bands of crossed hatching around every wall, grey mottling, a faint 5 ft grid on the floors, and small line
// icons for what is in each room (pillars, altars, sarcophagi, statues ...). Game icons (fight, camp, door ...) sit on
// top as ink badges. Everything is seeded by the cell position, so a redraw never changes the picture.
import { DIRS, hash2 } from './kn/shapes';

export const CELL = 28;
const PAPER = '#f8f5ee', INK = '#16130f', GRID = '#b5ae9f', SHADOW = 'rgba(40,36,30,.34)', MOTTLE = 'rgba(70,66,58,';

const k = (x, y) => `${x},${y}`;
const jit = (x, y, s, amt) => [(hash2(x, y, s) - 0.5) * amt, (hash2(y, x, s + 9) - 0.5) * amt];

export function mapBounds(pieces, pad = 4) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pieces) for (const [x, y] of p.cells) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}

// ---- the icon set drawn inside rooms. (cx, cy) is the centre in pixels, u is one cell ----
const ICONS = {
  altar(c, cx, cy, u) { c.strokeRect(cx - u * .42, cy - u * .28, u * .84, u * .56); c.beginPath(); c.moveTo(cx - u * .42, cy); c.lineTo(cx + u * .42, cy); c.stroke(); c.beginPath(); c.arc(cx, cy, u * .09, 0, 7); c.fill(); },
  tombs(c, cx, cy, u) { for (const o of [-1, 1]) { c.beginPath(); c.moveTo(cx + o * u * .34 - u * .13, cy - u * .36); c.lineTo(cx + o * u * .34 + u * .13, cy - u * .36); c.lineTo(cx + o * u * .34 + u * .17, cy + u * .36); c.lineTo(cx + o * u * .34 - u * .17, cy + u * .36); c.closePath(); c.stroke(); } },
  statue(c, cx, cy, u) { c.beginPath(); c.arc(cx, cy, u * .3, 0, 7); c.stroke(); c.beginPath(); c.moveTo(cx - u * .18, cy); c.lineTo(cx + u * .18, cy); c.moveTo(cx, cy - u * .18); c.lineTo(cx, cy + u * .18); c.stroke(); },
  pool(c, cx, cy, u) { c.beginPath(); c.ellipse(cx, cy, u * .7, u * .45, 0, 0, 7); c.stroke(); c.beginPath(); for (let i = -1; i <= 1; i++) { c.moveTo(cx - u * .4, cy + i * u * .14); c.quadraticCurveTo(cx - u * .2, cy + i * u * .14 - u * .07, cx, cy + i * u * .14); c.quadraticCurveTo(cx + u * .2, cy + i * u * .14 + u * .07, cx + u * .4, cy + i * u * .14); } c.stroke(); },
  growth(c, cx, cy, u) { c.beginPath(); c.moveTo(cx, cy + u * .35); c.lineTo(cx, cy - u * .1); for (const a of [-.9, -.3, .4, 1]) { c.moveTo(cx, cy + u * (.1 - Math.abs(a) * .1)); c.lineTo(cx + Math.sin(a * 1.4) * u * .38, cy - u * .32 + Math.abs(a) * u * .1); } c.stroke(); },
  chains(c, cx, cy, u) { for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(cx - u * .3 + i * u * .2, cy + (i % 2) * u * .08, u * .09, u * .05, 0.4, 0, 7); c.stroke(); } },
  throne(c, cx, cy, u) { c.strokeRect(cx - u * .24, cy - u * .1, u * .48, u * .34); c.strokeRect(cx - u * .24, cy - u * .36, u * .48, u * .2); },
  shelves(c, cx, cy, u) { c.strokeRect(cx - u * .5, cy - u * .22, u, u * .44); c.beginPath(); for (let i = -2; i <= 2; i++) { c.moveTo(cx + i * u * .17, cy - u * .22); c.lineTo(cx + i * u * .17, cy + u * .22); } c.stroke(); },
  lab(c, cx, cy, u) { c.strokeRect(cx - u * .42, cy - u * .22, u * .84, u * .44); c.beginPath(); c.arc(cx - u * .18, cy, u * .1, 0, 7); c.arc(cx + u * .16, cy, u * .07, 0, 7); c.stroke(); },
  bones(c, cx, cy, u) { c.beginPath(); for (const [dx, dy, a] of [[-.25, -.1, .5], [.18, .12, -.4], [.0, -.3, 1.2], [-.15, .25, -1]]) { const x = cx + dx * u, y = cy + dy * u, l = u * .18; c.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); } c.stroke(); c.beginPath(); c.arc(cx + u * .1, cy - u * .05, u * .1, 0, 7); c.stroke(); },
  rubble(c, cx, cy, u) { for (const [dx, dy, r] of [[-.3, 0, .16], [.1, -.2, .13], [.25, .15, .18], [-.05, .25, .11]]) { c.beginPath(); c.moveTo(cx + (dx - r) * u, cy + dy * u); c.lineTo(cx + dx * u, cy + (dy - r) * u); c.lineTo(cx + (dx + r) * u, cy + dy * u); c.lineTo(cx + dx * u, cy + (dy + r * .8) * u); c.closePath(); c.stroke(); } },
  pillars(c, cx, cy, u) { for (const o of [-1, 1]) { c.beginPath(); c.arc(cx + o * u * .32, cy, u * .17, 0, 7); c.fillStyle = PAPER; c.fill(); c.stroke(); } },
  table(c, cx, cy, u) { c.strokeRect(cx - u * .4, cy - u * .2, u * .8, u * .4); c.beginPath(); c.moveTo(cx - u * .4, cy - u * .08); c.lineTo(cx + u * .4, cy - u * .08); c.stroke(); },
  brazier(c, cx, cy, u) { c.beginPath(); c.arc(cx, cy, u * .2, 0, 7); c.stroke(); c.beginPath(); c.moveTo(cx, cy - u * .1); c.quadraticCurveTo(cx + u * .12, cy - u * .02, cx, cy + u * .12); c.quadraticCurveTo(cx - u * .12, cy - u * .02, cx, cy - u * .1); c.stroke(); },
};

const TOKEN = '#e3170a'; // you: bright red
// small ink badges for what the game knows about a room
const BADGES = {
  camp(c, x, y, r) { c.beginPath(); c.moveTo(x, y - r * .62); c.lineTo(x + r * .66, y + r * .5); c.lineTo(x - r * .66, y + r * .5); c.closePath(); c.fill(); c.fillStyle = INK; c.beginPath(); c.moveTo(x, y - r * .05); c.lineTo(x + r * .18, y + r * .5); c.lineTo(x - r * .18, y + r * .5); c.closePath(); c.fill(); },
  fight(c, x, y, r) { c.lineWidth = r * .22; c.beginPath(); c.moveTo(x - r * .5, y - r * .5); c.lineTo(x + r * .5, y + r * .5); c.moveTo(x + r * .5, y - r * .5); c.lineTo(x - r * .5, y + r * .5); c.stroke(); },
  skull(c, x, y, r) { c.beginPath(); c.arc(x, y - r * .1, r * .5, 0, 7); c.fill(); c.fillRect(x - r * .28, y + r * .2, r * .56, r * .34); c.fillStyle = INK; c.beginPath(); c.arc(x - r * .2, y - r * .1, r * .13, 0, 7); c.arc(x + r * .2, y - r * .1, r * .13, 0, 7); c.fill(); },
  event(c, x, y, r) { c.font = `700 ${r * 1.5}px "IM Fell English", serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', x, y + r * .06); },
  lair(c, x, y, r) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .28 : r * .68; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fill(); },
  exit(c, x, y, r) { c.lineWidth = r * .16; c.beginPath(); for (let i = 0; i < 4; i++) { const yy = y - r * .5 + i * r * .33; c.moveTo(x - r * .5 + i * r * .1, yy); c.lineTo(x + r * .5, yy); } c.stroke(); },
  chest(c, x, y, r) { c.fillRect(x - r * .5, y - r * .12, r, r * .5); c.beginPath(); c.arc(x, y - r * .12, r * .5, Math.PI, 0); c.fill(); },
  // where the campaign began: a little flag on a pole
  start(c, x, y, r) { c.save(); c.lineWidth = Math.max(1.2, r * .14); c.strokeStyle = c.fillStyle; c.beginPath(); c.moveTo(x - r * .32, y + r * .5); c.lineTo(x - r * .32, y - r * .52); c.stroke(); c.beginPath(); c.moveTo(x - r * .3, y - r * .52); c.lineTo(x + r * .48, y - r * .3); c.lineTo(x - r * .3, y - r * .06); c.closePath(); c.fill(); c.restore(); },
  q(c, x, y, r) { c.font = `700 ${r * 1.5}px "IM Fell English", serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', x, y + r * .06); },
};
function badge(c, kind, x, y, r, fill = INK, glyph = PAPER) {
  c.save(); c.fillStyle = fill; c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.stroke();
  c.fillStyle = glyph; c.strokeStyle = glyph; BADGES[kind](c, x, y, r); c.restore();
}

function roomCentre(p) {
  const mx = p.cells.reduce((s, c) => s + c[0], 0) / p.cells.length, my = p.cells.reduce((s, c) => s + c[1], 0) / p.cells.length;
  // the floor cell closest to the middle
  let best = p.cells[0], bd = 1e9; for (const c of p.cells) { const d = (c[0] - mx) ** 2 + (c[1] - my) ** 2; if (d < bd) { bd = d; best = c; } }
  return best;
}

// returns the hit-test data the screen needs: where each unexplored door and each room sits, in pixels
export function drawMap(canvas, state, opts) {
  const { dpr = 2, camps = {}, seed = state.domain.seed, hereId = state.here, showIcons = true } = opts || {};
  const pieces = state.pieces; const b = mapBounds(pieces, 4);
  const W = (b.x1 - b.x0 + 1) * CELL, H = (b.y1 - b.y0 + 1) * CELL;
  canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  const c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
  const px = (x) => (x - b.x0) * CELL, py = (y) => (y - b.y0) * CELL;
  const floor = new Map(); for (const p of pieces) for (const [x, y] of p.cells) floor.set(k(x, y), p.id);

  // distance (in cells) from each empty cell to the nearest floor, within 5 cells
  const dist = new Map();
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
    if (floor.has(k(x, y))) continue;
    let d = 99; for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) { if (floor.has(k(x + dx, y + dy))) d = Math.min(d, Math.hypot(dx, dy)); }
    if (d < 99) dist.set(k(x, y), d);
  }

  // 1. grey mottling out beyond the hatching (the cloudy patches of the reference)
  for (const [key, d] of dist) {
    const [x, y] = key.split(',').map(Number);
    if (d < 1.6 || d > 5.4) continue;
    const n = hash2(x, y, seed);
    if (n > 0.55) continue;
    const cx = px(x) + hash2(y, x, seed + 1) * CELL, cy = py(y) + hash2(x + 3, y, seed + 2) * CELL;
    const r = CELL * (0.45 + hash2(x, y + 7, seed + 3) * 0.75);
    for (let layer = 0; layer < 2; layer++) {
      c.fillStyle = `${MOTTLE}${(layer ? 0.1 : 0.07 + hash2(x + 9, y, seed + 4) * 0.07).toFixed(2)})`;
      const m = 13, pts = []; for (let i = 0; i < m; i++) { const a = (i / m) * Math.PI * 2, rr = r * (layer ? 0.55 : 1) * (0.72 + hash2(x + i, y + layer, seed + 5) * 0.5); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
      c.beginPath(); c.moveTo((pts[0][0] + pts[m - 1][0]) / 2, (pts[0][1] + pts[m - 1][1]) / 2);
      for (let i = 0; i < m; i++) { const q = pts[i], nx = pts[(i + 1) % m]; c.quadraticCurveTo(q[0], q[1], (q[0] + nx[0]) / 2, (q[1] + nx[1]) / 2); }
      c.closePath(); c.fill();
    }
  }

  // 2. hatching: clusters of crossed strokes, thickest at the wall, thinning with distance
  c.strokeStyle = INK; c.lineCap = 'round';
  for (const [key, d] of dist) {
    if (d > 3.1) continue;
    const [x, y] = key.split(',').map(Number);
    const density = d < 1.2 ? 6.5 : d < 1.9 ? 4.6 : d < 2.5 ? 2.6 : 1.0;
    const n = Math.floor(density + hash2(x, y, seed + 11));
    for (let i = 0; i < n; i++) {
      const cx = px(x) + hash2(x + i, y, seed + 12) * CELL, cy = py(y) + hash2(y + i, x, seed + 13) * CELL;
      const ang = hash2(x, y + i, seed + 14) * Math.PI;
      const len = CELL * (0.2 + hash2(x + i, y + i, seed + 15) * 0.2);
      const strokes = 2 + Math.floor(hash2(x, y + 5 + i, seed + 16) * 2);
      c.lineWidth = d < 1.5 ? 1.6 : 1.2;
      for (let s = 0; s < strokes; s++) {
        const off = (s - (strokes - 1) / 2) * 2.6;
        c.beginPath(); c.moveTo(cx - Math.cos(ang) * len + Math.cos(ang + 1.57) * off, cy - Math.sin(ang) * len + Math.sin(ang + 1.57) * off);
        c.lineTo(cx + Math.cos(ang) * len + Math.cos(ang + 1.57) * off, cy + Math.sin(ang) * len + Math.sin(ang + 1.57) * off); c.stroke();
      }
    }
  }

  // 3. floors
  c.fillStyle = PAPER;
  for (const [key] of floor) { const [x, y] = key.split(',').map(Number); c.fillRect(px(x) - .5, py(y) - .5, CELL + 1, CELL + 1); }
  // faint grid, and cracks and stipple on the caves
  c.strokeStyle = GRID; c.lineWidth = 0.9; c.beginPath();
  for (const p of pieces) for (const [x, y] of p.cells) {
    const X = px(x), Y = py(y);
    if (floor.get(k(x + 1, y)) === p.id) { c.moveTo(X + CELL, Y); c.lineTo(X + CELL, Y + CELL); }
    if (floor.get(k(x, y + 1)) === p.id) { c.moveTo(X, Y + CELL); c.lineTo(X + CELL, Y + CELL); }
    if (floor.get(k(x - 1, y)) !== p.id) { c.moveTo(X, Y); c.lineTo(X, Y + CELL); }
    if (floor.get(k(x, y - 1)) !== p.id) { c.moveTo(X, Y); c.lineTo(X + CELL, Y); }
  }
  c.stroke();
  c.fillStyle = 'rgba(60,56,48,.5)';
  for (const p of pieces) for (const [x, y] of p.cells) { if (hash2(x, y, seed + 31) < (p.cave ? 0.5 : 0.12)) { const [jx, jy] = jit(x, y, seed + 32, CELL * 0.8); c.fillRect(px(x) + CELL / 2 + jx, py(y) + CELL / 2 + jy, 1.6, 1.6); } }
  c.strokeStyle = 'rgba(60,56,48,.55)'; c.lineWidth = 1;
  for (const p of pieces) for (const [x, y] of p.cells) { if (hash2(x, y, seed + 41) < 0.05) { const X = px(x) + hash2(y, x, 5) * CELL, Y = py(y) + hash2(x, y, 6) * CELL; c.beginPath(); c.moveTo(X, Y); c.lineTo(X + 7, Y + 3); c.lineTo(X + 11, Y + 1); c.stroke(); } }

  // 4. walls: a grey shadow, then the inked line with a hand-drawn wobble
  const edges = [];
  for (const p of pieces) for (const [x, y] of p.cells) DIRS.forEach(([dx, dy], dir) => {
    const nid = floor.get(k(x + dx, y + dy)); if (nid === p.id) return;
    edges.push({ x, y, dir, p });
  });
  const door = new Set(); for (const p of pieces) for (const d of p.doors) { door.add(`${d.x},${d.y},${d.dir}`); if (d.to) { const [dx, dy] = DIRS[d.dir]; door.add(`${d.x + dx},${d.y + dy},${(d.dir + 2) % 4}`); } }
  const seg = (e) => {
    const X = px(e.x), Y = py(e.y);
    const pts = e.dir === 0 ? [[X, Y], [X + CELL, Y]] : e.dir === 2 ? [[X, Y + CELL], [X + CELL, Y + CELL]] : e.dir === 3 ? [[X, Y], [X, Y + CELL]] : [[X + CELL, Y], [X + CELL, Y + CELL]];
    return pts.map(([a, bb]) => { const [jx, jy] = jit(Math.round(a), Math.round(bb), seed + 51, 2.6); return [a + jx, bb + jy]; });
  };
  const draw = (colour, width, ox, oy) => {
    c.strokeStyle = colour; c.lineWidth = width; c.lineCap = 'round'; c.beginPath();
    for (const e of edges) {
      if (door.has(`${e.x},${e.y},${e.dir}`) && e.p.doors.some((d) => d.x === e.x && d.y === e.y && d.dir === e.dir && (d.to || d.entry))) continue;
      const [a, bb] = seg(e); c.moveTo(a[0] + ox, a[1] + oy); c.lineTo(bb[0] + ox, bb[1] + oy);
    }
    c.stroke();
  };
  draw(SHADOW, 5, 2.5, 3); draw(INK, 3.6, 0, 0);

  // 5. room contents
  c.lineJoin = 'round';
  for (const p of pieces) {
    c.strokeStyle = INK; c.fillStyle = INK; c.lineWidth = 1.6;
    for (const [x, y] of p.pillars || []) { const X = px(x) + CELL / 2, Y = py(y) + CELL / 2; c.beginPath(); c.arc(X, Y, CELL * .3, 0, 7); c.fillStyle = PAPER; c.fill(); c.stroke(); c.beginPath(); c.arc(X, Y, CELL * .17, 0, 7); c.stroke(); }
    if (p.family === 'ring') { const m = roomCentre({ cells: p.cells }); const X = px(m[0]) + CELL / 2, Y = py(m[1]) + CELL / 2; c.beginPath(); c.arc(X, Y, CELL * .55, 0, 7); c.fillStyle = PAPER; c.fill(); c.lineWidth = 2.4; c.stroke(); c.lineWidth = 1.2; c.beginPath(); c.arc(X, Y, CELL * .32, 0, 7); c.stroke(); }
    if (showIcons && p.tags?.length) {
      const free = p.cells.filter(([x, y]) => !(p.pillars || []).some(([a, bb]) => a === x && bb === y) && !p.doors.some((d) => d.x === x && d.y === y));
      p.tags.slice(0, 2).forEach((tag, i) => {
        if (!ICONS[tag] || !free.length) return;
        const pick = free[Math.floor(hash2(p.cells.length, i, seed + 61) * free.length)];
        const cx = px(pick[0]) + CELL / 2, cy = py(pick[1]) + CELL / 2;
        c.strokeStyle = INK; c.fillStyle = INK; c.lineWidth = 1.5; ICONS[tag](c, cx, cy, CELL);
      });
    }
    if (p.alcoves) { // a sarcophagus in each alcove, like the crypt in the reference
      const ys = p.cells.map((q) => q[1]), top = Math.min(...ys), bot = Math.max(...ys), x0 = Math.min(...p.cells.map((q) => q[0]));
      for (const [x, y] of p.cells) { if ((x - x0) % 2 === 1 &&  (y === top || y === bot) && hash2(x, y, seed + 71) < .8) { c.strokeStyle = INK; c.lineWidth = 1.4; c.fillStyle = PAPER; const X = px(x) + CELL / 2, Y = py(y) + CELL / 2; c.beginPath(); c.moveTo(X - CELL * .2, Y - CELL * .38); c.lineTo(X + CELL * .2, Y - CELL * .38); c.lineTo(X + CELL * .26, Y + CELL * .38); c.lineTo(X - CELL * .26, Y + CELL * .38); c.closePath(); c.fill(); c.stroke(); } }
    }
  }

  // 6. doors
  const hits = { doors: [], rooms: [] };
  for (const p of pieces) for (const d of p.doors) {
    const [dx, dy] = DIRS[d.dir]; const X = px(d.x), Y = py(d.y);
    const horizontalWall = d.dir === 0 || d.dir === 2;
    const mx = X + CELL / 2 + (d.dir === 1 ? CELL / 2 : d.dir === 3 ? -CELL / 2 : 0), my = Y + CELL / 2 + (d.dir === 2 ? CELL / 2 : d.dir === 0 ? -CELL / 2 : 0);
    const open = d.to || d.entry;
    c.save(); c.translate(mx, my); c.strokeStyle = INK; c.fillStyle = PAPER; c.lineWidth = 2;
    if (open) { // a doorway: two jambs and a door leaf
      const w = CELL * .62, t = 5; if (horizontalWall) { c.fillRect(-w / 2, -t, w, t * 2); c.strokeRect(-w / 2, -t, w, t * 2); } else { c.fillRect(-t, -w / 2, t * 2, w); c.strokeRect(-t, -w / 2, t * 2, w); }
    } else if (!d.blocked) { // an unexplored door
      const w = CELL * .62, t = 5; c.fillStyle = '#e8d9b0'; if (horizontalWall) { c.fillRect(-w / 2, -t, w, t * 2); c.strokeRect(-w / 2, -t, w, t * 2); } else { c.fillRect(-t, -w / 2, t * 2, w); c.strokeRect(-t, -w / 2, t * 2, w); }
    }
    c.restore();
    if (!open && !d.blocked) {
      const ox = mx + dx * CELL * .62, oy = my + dy * CELL * .62;
      badge(c, 'q', ox, oy, CELL * .34, '#b8904f', INK);
      hits.doors.push({ id: d.id, x: ox, y: oy, r: CELL * .6, piece: p.id });
      (hits.marks = hits.marks || []).push({ kind: 'q', x: ox, y: oy, piece: p.id });
    }
  }

  // 7. game badges: where the fights are, where a camp would be sensible, lair, exit, the way in
  if (showIcons) for (const p of pieces) {
    const m = roomCentre(p); const X = px(m[0]) + CELL / 2, Y = py(m[1]) + CELL / 2;
    hits.rooms.push({ id: p.id, x: X, y: Y });
    if (p.n && p.cells?.length) { const top = Math.min(...p.cells.map((q) => q[1])); const left = Math.min(...p.cells.filter((q) => q[1] === top).map((q) => q[0])); const tx = px(left) + CELL * .12, ty = py(top) + CELL * .1; c.save(); c.font = `700 ${CELL * .42}px "Cinzel", serif`; c.textAlign = 'left'; c.textBaseline = 'top'; c.lineWidth = 3.5; c.strokeStyle = PAPER; c.strokeText(String(p.n), tx, ty); c.fillStyle = INK; c.fillText(String(p.n), tx, ty); c.restore(); }
    const list = [];
    if (p.start) list.push(['start']);
    if (p.lair) list.push(['lair']);
    if (p.exit) list.push(['exit']);
    if (p.enc) list.push(['fight']);
    else if (p.event?.pending && p.id !== hereId) list.push(['event']);
    if (!p.enc && !p.searched && !p.start) list.push(['chest']);
    if (camps[p.id]) list.push(['camp', camps[p.id]]);
    const r = CELL * .36, gap = r * 2.5;
    list.forEach(([kind, rating], i) => {
      const bx = X + (i - (list.length - 1) / 2) * gap, by = Y + (p.id === hereId ? CELL * .9 : 0);
      (hits.marks = hits.marks || []).push({ kind, x: bx, y: by, piece: p.id });
      if (kind === 'camp') { c.save(); c.setLineDash([3, 3]); c.strokeStyle = INK; c.lineWidth = 1.6; c.fillStyle = PAPER; c.beginPath(); c.arc(bx, by, r * 1.15, 0, 7); c.fill(); c.stroke(); c.setLineDash([]); c.fillStyle = INK; BADGES.camp(c, bx, by, r * 1.15); if (rating === 2) { c.fillStyle = '#b8904f'; c.beginPath(); c.arc(bx + r * 1.0, by - r * 1.0, r * .35, 0, 7); c.fill(); c.stroke(); } c.restore(); }
      else if (kind === 'fight') badge(c, 'fight', bx, by, r * 1.1, '#6e2418', '#fff5e6');
      else if (kind === 'chest') { c.save(); c.fillStyle = INK; c.strokeStyle = PAPER; c.lineWidth = 1.2; BADGES.chest(c, bx, by, r * .9); c.restore(); }
      else badge(c, kind, bx, by, r * 1.05, kind === 'lair' ? '#6e2418' : INK, '#fff5e6');
    });
  }

  // 8. the player token
  const hp = pieces.find((p) => p.id === hereId);
  if (hp) { const m = roomCentre(hp); const X = px(m[0]) + CELL / 2, Y = py(m[1]) + CELL / 2; c.save(); c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = 6; c.fillStyle = TOKEN; c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.arc(X, Y, CELL * .4, 0, 7); c.fill(); c.stroke(); c.restore(); c.fillStyle = '#fff'; c.font = `700 ${CELL * .5}px "Cinzel", serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('✦', X, Y + 1); hits.here = { x: X, y: Y }; }
  hits.W = W; hits.H = H;
  return hits;
}

// a small icon for the legend
export function drawBadgeIcon(canvas, kind) {
  const c = canvas.getContext('2d'), s = canvas.width; c.clearRect(0, 0, s, s);
  if (kind === 'door') { c.fillStyle = '#e8d9b0'; c.strokeStyle = INK; c.lineWidth = 2; c.fillRect(s * .3, s * .12, s * .4, s * .76); c.strokeRect(s * .3, s * .12, s * .4, s * .76); return; }
  if (kind === 'camp') { c.fillStyle = PAPER; c.strokeStyle = INK; c.lineWidth = 1.6; c.setLineDash([3, 3]); c.beginPath(); c.arc(s / 2, s / 2, s * .42, 0, 7); c.fill(); c.stroke(); c.setLineDash([]); c.fillStyle = INK; BADGES.camp(c, s / 2, s / 2, s * .4); return; }
  if (kind === 'token') { c.fillStyle = TOKEN; c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.arc(s / 2, s / 2, s * .36, 0, 7); c.fill(); c.stroke(); return; }
  const fill = kind === 'q' ? '#b8904f' : kind === 'fight' || kind === 'lair' ? '#6e2418' : INK;
  badge(c, kind, s / 2, s / 2, s * .42, fill, kind === 'q' ? INK : '#fff5e6');
}

// a room feature drawn on its own, for the scroll's chapter headings
export function drawFeatureIcon(canvas, tag) {
  const c = canvas.getContext('2d'), s = canvas.width; c.clearRect(0, 0, s, s);
  if (!ICONS[tag]) return;
  c.strokeStyle = INK; c.fillStyle = INK; c.lineWidth = 2.2; c.lineJoin = 'round'; c.lineCap = 'round';
  ICONS[tag](c, s / 2, s / 2, s * 0.9);
}
