// Room and corridor shapes for the beta map. The book's Room & Corridor Shape table (p. 97) is a page of 100 tile
// pictures: 1-25 are corridors, 26-100 are rooms. The art is not reproduced here. Each D100 result picks one of
// these shape families instead, built from grid cells, so the same roll always gives the same kind of space.
//
// A piece is { family, cells: [[x,y]], pillars: [[x,y]], noExit: ['x,y'], ends: [{x,y,dir}]|null, w, h }
// with cells starting at 0,0. dir: 0 north, 1 east, 2 south, 3 west.

export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const opposite = (d) => (d + 2) % 4;

// seeded random numbers, so a shape is stable
export function rng(seed) {
  let a = seed | 0;
  const f = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}
export const hash2 = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

const fromFn = (w, h, fn) => { const cells = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (fn(x, y)) cells.push([x, y]); return cells; };
const done = (family, cells, extra = {}) => {
  const minX = Math.min(...cells.map((c) => c[0])), minY = Math.min(...cells.map((c) => c[1]));
  const norm = cells.map(([x, y]) => [x - minX, y - minY]);
  const sh = (l) => (l || []).map(([x, y]) => [x - minX, y - minY]);
  return {
    family, cells: norm, w: Math.max(...norm.map((c) => c[0])) + 1, h: Math.max(...norm.map((c) => c[1])) + 1,
    pillars: sh(extra.pillars), noExit: (extra.noExit || []).map((k) => { const [x, y] = k.split(',').map(Number); return `${x - minX},${y - minY}`; }),
    ends: extra.ends ? extra.ends.map((e) => ({ x: e.x - minX, y: e.y - minY, dir: e.dir })) : null, cave: !!extra.cave,
  };
};

// ---- corridors (D100 1-25) ----
function corridor(roll, r) {
  const len = r.int(4, 9);
  const horiz = r() < 0.5;
  const line = (n, wide) => { const c = []; for (let i = 0; i < n; i++) for (let k = 0; k < (wide ? 2 : 1); k++) c.push(horiz ? [i, k] : [k, i]); return c; };
  if (roll <= 8) { // straight
    const cells = line(len, false);
    return done('corridor', cells, { ends: horiz ? [{ x: 0, y: 0, dir: 3 }, { x: len - 1, y: 0, dir: 1 }] : [{ x: 0, y: 0, dir: 0 }, { x: 0, y: len - 1, dir: 2 }] });
  }
  if (roll <= 12) { // wide hall
    const cells = line(len, true);
    return done('corridor', cells, { ends: horiz ? [{ x: 0, y: 0, dir: 3 }, { x: 0, y: 1, dir: 3 }, { x: len - 1, y: 0, dir: 1 }, { x: len - 1, y: 1, dir: 1 }] : [{ x: 0, y: 0, dir: 0 }, { x: 1, y: 0, dir: 0 }, { x: 0, y: len - 1, dir: 2 }, { x: 1, y: len - 1, dir: 2 }] });
  }
  if (roll <= 17) { // bend
    const a = r.int(3, 5), b = r.int(3, 5);
    const cells = [...Array(a)].map((_, i) => [i, 0]).concat([...Array(b)].map((_, i) => [a - 1, i + 1]));
    return done('corridor', cells, { ends: [{ x: 0, y: 0, dir: 3 }, { x: a - 1, y: b, dir: 2 }] });
  }
  if (roll <= 20) { // tee
    const a = r.int(2, 3), s = r.int(3, 4);
    const cells = [...Array(a * 2 + 1)].map((_, i) => [i, 0]).concat([...Array(s)].map((_, i) => [a, i + 1]));
    return done('corridor', cells, { ends: [{ x: 0, y: 0, dir: 3 }, { x: a * 2, y: 0, dir: 1 }, { x: a, y: s, dir: 2 }] });
  }
  if (roll <= 22) { // crossing
    const a = r.int(2, 3);
    const cells = [...Array(a * 2 + 1)].map((_, i) => [i, a]).concat([...Array(a * 2 + 1)].map((_, i) => [a, i]).filter(([x, y]) => y !== a));
    return done('corridor', cells, { ends: [{ x: 0, y: a, dir: 3 }, { x: a * 2, y: a, dir: 1 }, { x: a, y: 0, dir: 0 }, { x: a, y: a * 2, dir: 2 }] });
  }
  // zigzag
  const cells = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [3, 2], [4, 2], [4, 3], [4, 4], [5, 4], [6, 4]];
  return done('corridor', cells, { ends: [{ x: 0, y: 0, dir: 3 }, { x: 6, y: 4, dir: 1 }] });
}

// ---- rooms (D100 26-100) ----
function room(roll, r) {
  const f = (n) => roll <= n;
  if (f(36)) { const w = r.int(4, 7), h = r.int(3, 5); return done('chamber', fromFn(w, h, () => true)); }
  if (f(42)) { // notched
    const w = r.int(5, 7), h = r.int(5, 6), n = r.int(1, 2);
    return done('notched', fromFn(w, h, (x, y) => !((x < n && y < n) || (x >= w - n && y < n) || (x < n && y >= h - n) || (x >= w - n && y >= h - n && r() < 2))));
  }
  if (f(48)) { const s = r.pick([5, 6, 7]); const c = s >= 7 ? 2 : 1; return done('octagon', fromFn(s, s, (x, y) => !(x + y < c || (s - 1 - x) + y < c || x + (s - 1 - y) < c || (s - 1 - x) + (s - 1 - y) < c))); }
  if (f(54)) { const rad = r.pick([2, 3]); const s = rad * 2 + 1; return done('round', fromFn(s, s, (x, y) => (x - rad) ** 2 + (y - rad) ** 2 <= rad * rad + 0.6)); }
  if (f(58)) { // ring with a central pier
    const rad = 3, s = 7;
    return done('ring', fromFn(s, s, (x, y) => { const d = (x - rad) ** 2 + (y - rad) ** 2; return d <= rad * rad + 0.6 && d > 1.2; }));
  }
  if (f(63)) { const a = r.pick([1, 3]); const s = a === 1 ? 5 : 7; const m = (s - a) / 2; return done('cross', fromFn(s, s, (x, y) => (x >= m && x < m + a) || (y >= m && y < m + a))); }
  if (f(68)) { const w = r.int(5, 7), h = r.int(5, 7), t = r.int(2, 3); return done('ell', fromFn(w, h, (x, y) => x < t || y >= h - t)); }
  if (f(72)) { return done('tee', fromFn(7, 6, (x, y) => y < 2 || (x >= 2 && x <= 4))); }
  if (f(82)) { // pillared hall with alcoves (the Dyson crypt look)
    const n = r.int(3, 5), w = n * 2 + 3, noExit = [], pillars = [];
    const cells = fromFn(w, 7, (x, y) => {
      if (y >= 2 && y <= 4) return true;
      if (x === 0 || x === w - 1) return y >= 1 && y <= 5 && false;
      return x % 2 === 1 && x >= 1 && x <= w - 2;
    });
    for (let x = 1; x <= w - 2; x += 2) for (const y of [0, 1, 5, 6]) noExit.push(`${x},${y}`);
    for (let x = 2; x <= w - 3; x += 2) { pillars.push([x, 2], [x, 4]); }
    const out = done('crypt', cells, { pillars, noExit });
    out.alcoves = n; return out;
  }
  if (f(88)) { // nave with an apse
    const cells = fromFn(5, 9, (x, y) => (y >= 2) || (x >= 1 && x <= 3 && y >= 1) || (x === 2 && y === 0));
    return done('chapel', cells);
  }
  if (f(95)) { // cave: a blob grown by a random walk
    const s = 9, set = new Set(), walk = [[4, 4]];
    let x = 4, y = 4;
    for (let i = 0; i < r.int(26, 38); i++) { set.add(`${x},${y}`); const d = DIRS[r.int(0, 3)]; x = Math.max(1, Math.min(s - 2, x + d[0])); y = Math.max(1, Math.min(s - 2, y + d[1])); if (r() < 0.2) { x = 4; y = 4; } }
    const cells = [...set].map((k) => k.split(',').map(Number));
    walk.length = 0;
    return done('cave', cells, { cave: true });
  }
  if (f(98)) { // two chambers joined by a neck
    const cells = fromFn(11, 3, (x, y) => x < 3 || x > 7 || (y === 1 && x >= 3 && x <= 7));
    return done('dumbbell', cells);
  }
  return done('stepped', fromFn(7, 6, (x, y) => y >= Math.floor(x * 0.8)));
}

export function buildShape(roll, seed) {
  const r = rng(seed);
  return roll <= 25 ? corridor(roll, r) : room(roll, r);
}

// where a door could go: [{x, y, dir}] on the piece's own cells
export function exitCandidates(piece) {
  const set = new Set(piece.cells.map(([x, y]) => `${x},${y}`));
  if (piece.ends) return piece.ends.filter((e) => set.has(`${e.x},${e.y}`));
  const out = [];
  for (const [x, y] of piece.cells) {
    if (piece.noExit.includes(`${x},${y}`)) continue;
    DIRS.forEach(([dx, dy], dir) => { if (!set.has(`${x + dx},${y + dy}`)) out.push({ x, y, dir }); });
  }
  return piece.cave ? out.filter((_, i) => i % 3 === 0) : out;
}
