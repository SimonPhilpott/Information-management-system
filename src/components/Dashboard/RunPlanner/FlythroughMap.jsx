import React, { useMemo } from 'react';

// The Flythrough's map: the route over OpenStreetMap tiles, coloured by gradient like the planner's map, with
// the runner's position moving with the replay, the stretch already covered drawn bold, and the carb stops as
// pills. Click a point on the route to jump the replay there. Compact, to sit beside the chart.

const hav = (a, b) => {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b[0] - a[0]) * toR, dLng = (b[1] - a[1]) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};
const gradeColour = (g) => (g >= 6 ? '#ef4444' : g >= 2.5 ? '#f59e0b' : g <= -2.5 ? '#38bdf8' : '#22c55e');
const gradeAtKm = (profile, km) => {
  if (!profile?.length) return 0;
  let best = profile[0];
  for (const p of profile) { if (p[0] <= km) best = p; else break; }
  return best[2];
};

export default function FlythroughMap({ route, runnerKm = 0, stops = [], finished = false, onSeekKm = null }) {
  const view = useMemo(() => {
    const path = route?.path;
    if (!path || path.length < 2) return null;
    const lats = path.map((p) => p[0]), lngs = path.map((p) => p[1]);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const X = (lng, z) => ((lng + 180) / 360) * 256 * 2 ** z;
    const Y = (lat, z) => { const s = Math.sin((lat * Math.PI) / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z; };
    const W = 400, H = 400;
    let z = 17;
    for (; z > 9; z--) { if (X(maxLng, z) - X(minLng, z) <= W - 50 && Y(minLat, z) - Y(maxLat, z) <= H - 50) break; }
    const cx = (X(minLng, z) + X(maxLng, z)) / 2, cy = (Y(minLat, z) + Y(maxLat, z)) / 2;
    const ox = cx - W / 2, oy = cy - H / 2;
    const tiles = [];
    const n = 2 ** z;
    for (let ty = Math.floor(oy / 256); ty <= Math.floor((oy + H) / 256); ty++) {
      for (let tx = Math.floor(ox / 256); tx <= Math.floor((ox + W) / 256); tx++) {
        if (ty < 0 || ty >= n) continue;
        tiles.push({ key: `${z}-${tx}-${ty}`, url: `https://tile.openstreetmap.org/${z}/${((tx % n) + n) % n}/${ty}.png`, x: tx * 256 - ox, y: ty * 256 - oy });
      }
    }
    const pts = path.map((p) => [X(p[1], z) - ox, Y(p[0], z) - oy]);
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + hav(path[i - 1], path[i]));
    const total = cum[cum.length - 1] || 1;
    const kmScale = (route.distanceKm || total / 1000) / total; // metres along the path -> route km
    const segs = pts.slice(1).map((p, i) => ({ a: pts[i], b: p, colour: gradeColour(gradeAtKm(route.profile, cum[i] * kmScale)) }));
    // a point (and how far along the path) at a given route km
    const at = (km) => {
      const target = Math.max(0, Math.min(total, km / kmScale));
      let i = cum.findIndex((c) => c >= target);
      if (i <= 0) return { p: pts[0], i: 0 };
      const f = (target - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
      return { p: [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f], i };
    };
    const kmAtPoint = (x, y) => {
      let best = 0, bd = Infinity;
      pts.forEach((p, i) => { const d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < bd) { bd = d; best = i; } });
      return { km: cum[best] * kmScale, dist: Math.sqrt(bd) };
    };
    const loop = hav(path[0], path[path.length - 1]) < 200;
    return { W, H, tiles, pts, segs, at, kmAtPoint, loop };
  }, [route]);

  if (!view) return <div className="h-full min-h-[160px] rounded-xl border border-dashed border-slate-500/40 p-4 grid place-items-center text-center text-xs text-slate-500">No map saved for this route.</div>;
  const runner = view.at(runnerKm);
  const done = [...view.pts.slice(0, runner.i), runner.p].map((p) => p.join(',')).join(' ');
  const onClick = (e) => {
    if (!onSeekKm) return;
    const svg = e.currentTarget;
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * view.W, y = ((e.clientY - r.top) / r.height) * view.H;
    const hit = view.kmAtPoint(x, y);
    if (hit.dist <= 22) onSeekKm(hit.km);
  };
  return (
    <div className="rounded-xl overflow-hidden border border-black/10 relative h-full">
      <svg viewBox={`0 0 ${view.W} ${view.H}`} className="w-full h-full block bg-slate-200" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Map of ${route.name}`}
        onClick={onClick} style={{ cursor: onSeekKm ? 'pointer' : undefined }}>
        {view.tiles.map((t) => <image key={t.key} href={t.url} x={t.x} y={t.y} width="256" height="256" />)}
        <polyline points={view.pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#fff" strokeWidth="8" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
        {view.segs.map((s, i) => <line key={i} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={s.colour} strokeWidth="4" strokeLinecap="round" opacity="0.75" />)}
        {/* the stretch already run */}
        <polyline points={done} fill="none" stroke="#0ea5e9" strokeWidth="5.5" strokeLinejoin="round" strokeLinecap="round" />
        {stops.map((s, i) => {
          const p = view.at(s.km).p;
          return (
            <g key={i}>
              <rect x={p[0] - 15} y={p[1] - 22} width="30" height="13" rx="6" fill="#f59e0b" stroke="#fff" strokeWidth="1" />
              <text x={p[0]} y={p[1] - 12.5} fontSize="9" fontWeight="900" textAnchor="middle" fill="#1c1917">{s.grams} g</text>
              <circle cx={p[0]} cy={p[1]} r="3.5" fill="#f59e0b" stroke="#fff" strokeWidth="1.5" />
            </g>
          );
        })}
        <circle cx={view.pts[0][0]} cy={view.pts[0][1]} r="6" fill="#22c55e" stroke="#fff" strokeWidth="2" />
        {!view.loop && <rect x={view.pts[view.pts.length - 1][0] - 5} y={view.pts[view.pts.length - 1][1] - 5} width="10" height="10" fill="#ef4444" stroke="#fff" strokeWidth="2" />}
        {/* the runner */}
        <circle cx={runner.p[0]} cy={runner.p[1]} r="13" fill={finished ? '#a855f7' : '#0ea5e9'} fillOpacity="0.25" />
        <circle cx={runner.p[0]} cy={runner.p[1]} r="7" fill={finished ? '#a855f7' : '#0ea5e9'} stroke="#fff" strokeWidth="2.5" />
        <text x="5" y={view.H - 5} fontSize="9" fill="#334155">(c) OpenStreetMap contributors</text>
      </svg>
    </div>
  );
}
