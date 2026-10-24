// Run planner: a route drawn on OpenStreetMap, toned to the green theme (rpb-plan.css), with the line drawing
// itself along the route when it comes into view - small on the route cards, large on a route's own page, where the
// line keeps the classic map's colours for flat, climbing, steep and downhill and its numbered distance markers.
import React, { useMemo, useRef, useState } from 'react';
import { useInView, IconButton } from '../HomebrewBeta/ui';
import { KM_PER_MI } from '../../utils/units';

const X = (lng, z) => ((lng + 180) / 360) * 256 * 2 ** z;
const Y = (lat, z) => { const s = Math.sin((lat * Math.PI) / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z; };
const hav = (a, b) => {
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const gradeColour = (g) => (g <= -3 ? '#38bdf8' : g < 3 ? '#22c55e' : g < 6 ? '#f59e0b' : '#ef4444');

// the map's frame: the zoom that fits the route, the tiles to cover it, and the route in the frame's pixels
// zoom: levels in from the fitted view; pan: [x, y] pixels at that zoom, from the route's middle
export function frameFor(path, W, H, pad, maxZ = 16, zoom = 0, pan = [0, 0]) {
  if (!path || path.length < 2) return null;
  const lats = path.map((p) => p[0]), lngs = path.map((p) => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  let z = maxZ;
  for (; z > 9; z--) if (X(maxLng, z) - X(minLng, z) <= W - pad * 2 && Y(minLat, z) - Y(maxLat, z) <= H - pad * 2) break;
  z = Math.min(18, z + zoom);
  const cx = (X(minLng, z) + X(maxLng, z)) / 2 + pan[0], cy = (Y(minLat, z) + Y(maxLat, z)) / 2 + pan[1];
  const ox = cx - W / 2, oy = cy - H / 2, n = 2 ** z;
  const tiles = [];
  for (let ty = Math.floor(oy / 256); ty <= Math.floor((oy + H) / 256); ty++) {
    for (let tx = Math.floor(ox / 256); tx <= Math.floor((ox + W) / 256); tx++) {
      if (ty < 0 || ty >= n) continue;
      tiles.push({ key: `${z}-${tx}-${ty}`, url: `https://tile.openstreetmap.org/${z}/${((tx % n) + n) % n}/${ty}.png`, x: tx * 256 - ox, y: ty * 256 - oy });
    }
  }
  const pts = path.map((p) => [X(p[1], z) - ox, Y(p[0], z) - oy]);
  return { z, tiles, pts, d: `M${pts.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' L')}`, loop: hav(path[0], path[path.length - 1]) < 200 };
}

// markers: [{ km, label }] - carb stops as pills at their distance; progressKm: a runner there, the route drawn to it
export default function RouteMapArt({ path, W = 320, H = 150, pad = 22, route = null, units = 'km', label, className = '', hills = null, zoomable = false, markers = null, progressKm = null }) {
  // zoom in and out with the buttons; once zoomed in, drag to move about (24 Oct, Simon)
  const [zoom, setZoom] = useState(0);
  const [pan, setPan] = useState([0, 0]);
  const [run, setRun] = useState(0); // Play draws the route again
  const drag = useRef(null);
  const zoomBy = (dz) => { const nz = Math.max(0, Math.min(4, zoom + dz)); if (nz === zoom) return; const k = 2 ** (nz - zoom); setPan(([x, y]) => (nz === 0 ? [0, 0] : [x * k, y * k])); setZoom(nz); };
  const svgUnits = (e) => { const r = e.currentTarget.getBoundingClientRect(); return Math.max(W / r.width, H / r.height); };
  const onDown = (e) => { if (!zoomable || !zoom) return; drag.current = { x: e.clientX, y: e.clientY, pan, k: svgUnits(e) }; e.currentTarget.setPointerCapture(e.pointerId); };
  const onMove = (e) => { const d0 = drag.current; if (!d0) return; setPan([d0.pan[0] - (e.clientX - d0.x) * d0.k, d0.pan[1] - (e.clientY - d0.y) * d0.k]); };
  const onUp = () => { drag.current = null; };
  const box = useRef(null);
  const seen = useInView(box, { once: true });
  const id = React.useId().replace(/:/g, '');
  const f = useMemo(() => frameFor(path, W, H, pad, 16, zoom, pan), [path, W, H, pad, zoom, pan]);
  // the large map: the line in the gradient's colours, and a marker each km (or mile)
  const extra = useMemo(() => {
    if (!f || !route?.profile?.length) return null;
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + hav(path[i - 1], path[i]));
    const total = cum[cum.length - 1] || 1;
    const gradeAt = (km) => { let best = route.profile[0]; for (const q of route.profile) { if (q[0] <= km) best = q; else break; } return best[2]; };
    const segs = f.pts.slice(1).map((b, i) => ({ a: f.pts[i], b, c: gradeColour(gradeAt((cum[i] / total) * route.distanceKm)) }));
    const step = units === 'mi' ? KM_PER_MI : 1;
    const count = Math.floor(route.distanceKm / step);
    const every = count > 24 ? 5 : count > 12 ? 2 : 1;
    const marks = [];
    for (let k = every; k <= count; k += every) {
      const i = cum.findIndex((c) => c >= ((k * step) / route.distanceKm) * total);
      if (i > 0) marks.push({ k, at: f.pts[i] });
    }
    return { segs, marks };
  }, [f, route, path, units]);
  // where a distance along the route is on the map, and the route up to it
  const along = useMemo(() => {
    if (!f || !path?.length) return null;
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + hav(path[i - 1], path[i]) / 1000);
    const total = cum[cum.length - 1] || 1;
    const scale = route?.distanceKm ? route.distanceKm / total : 1; // the route's own distance, if it differs a little
    const pointAt = (km) => {
      const d = km / scale;
      const i = cum.findIndex((c) => c >= d);
      if (i <= 0) return { p: f.pts[0], i: 0 };
      const t = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
      const a = f.pts[i - 1], b = f.pts[i];
      return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], i };
    };
    return { pointAt, totalKm: total * scale };
  }, [f, path, route]);
  const progress = useMemo(() => {
    if (!along || progressKm == null) return null;
    const { p, i } = along.pointAt(Math.max(0, Math.min(along.totalKm, progressKm)));
    const done = [...f.pts.slice(0, Math.max(1, i)), p];
    return { p, d: `M${done.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' L')}` };
  }, [along, progressKm, f]);
  const hillPath = useMemo(() => {
    if (!hills || hills.length < 3) return null;
    const lo = Math.min(...hills), hi = Math.max(...hills, lo + 20);
    const hp = hills.map((e, i) => [(i / (hills.length - 1)) * W, H - 4 - ((e - lo) / (hi - lo)) * (H * 0.22)]);
    return `M0 ${H} L${hp.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' L')} L${W} ${H} Z`;
  }, [hills, W, H]);

  return (
    <span ref={box} className={`rpb-map ${className} ${zoom ? 'zoomed' : ''}`} aria-hidden={label ? undefined : 'true'}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label={label}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} style={zoomable && zoom ? { touchAction: 'none', cursor: drag.current ? 'grabbing' : 'grab' } : undefined}>
        {f && f.tiles.map((t) => <image key={t.key} href={t.url} x={t.x} y={t.y} width="256" height="256" />)}
        <rect width={W} height={H} className="wash" />
        {hillPath && <path d={hillPath} className="hills" />}
        {f && (
          <>
            {/* the line draws itself: a mask stroked along the route, uncovering the line as it goes */}
            <defs>
              <mask id={`${id}m`} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
                <path key={run} d={f.d} pathLength="1" className={`reveal ${seen ? 'drawn' : ''}`} style={{ strokeWidth: extra ? 14 : 10 }} />
              </mask>
            </defs>
            <g mask={`url(#${id}m)`}>
              <path d={f.d} className="under" style={extra ? { strokeWidth: 8 } : undefined} />
              {extra ? extra.segs.map((s, i) => <line key={i} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={s.c} strokeWidth="4.5" strokeLinecap="round" />)
                : <path d={f.d} className="line" />}
            </g>
            {extra && !markers && extra.marks.map((m, i) => (
              <g key={`${run}-${m.k}`} className={`mark ${seen ? 'in' : ''}`} style={{ animationDelay: `${0.25 + (i / Math.max(1, extra.marks.length)) * 1.2}s` }}>
                <circle cx={m.at[0]} cy={m.at[1]} r="9" /><text x={m.at[0]} y={m.at[1] + 3.5} textAnchor="middle">{m.k}</text>
              </g>
            ))}
            <circle cx={f.pts[0][0]} cy={f.pts[0][1]} r={extra ? 7 : 5} className="start" />
            {!f.loop && <circle cx={f.pts[f.pts.length - 1][0]} cy={f.pts[f.pts.length - 1][1]} r={extra ? 6 : 4} className={`end ${seen ? 'in' : ''}`} key={`e${run}`} />}
          </>
        )}
        {/* the route drawn as far as the runner, then the runner */}
        {progress && <>
          <path d={progress.d} className="done" />
          <circle cx={progress.p[0]} cy={progress.p[1]} r="13" className="runner-halo" />
          <circle cx={progress.p[0]} cy={progress.p[1]} r="7" className="runner" />
        </>}
        {/* carb stops, as pills at their distance */}
        {along && (markers || []).map((m, i) => {
          const { p } = along.pointAt(m.km || 0);
          return (
            <g key={i} className="mk">
              <circle cx={p[0]} cy={p[1]} r="5" />
              <rect x={p[0] - 22} y={p[1] - 32} width="44" height="22" rx="11" />
              <text x={p[0]} y={p[1] - 17} textAnchor="middle">{m.label}</text>
            </g>
          );
        })}
        {(extra || markers) && <text x="6" y={H - 6} className="osm">© OpenStreetMap contributors</text>}
      </svg>
      {zoomable && (
        <span className="zoom">
          <IconButton icon="play" label="Draw the route again" onClick={() => setRun((n) => n + 1)} />
          <IconButton icon="add" label="Zoom in" onClick={() => zoomBy(1)} disabled={zoom >= 4} />
          <IconButton icon="remove" label="Zoom out" onClick={() => zoomBy(-1)} disabled={zoom <= 0} />
          {zoom > 0 && <IconButton icon="route" label="Show the whole route" onClick={() => { setZoom(0); setPan([0, 0]); }} />}
        </span>
      )}
    </span>
  );
}
