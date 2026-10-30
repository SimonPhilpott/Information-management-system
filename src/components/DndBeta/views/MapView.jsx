// The Domain map: drawn by dyson.js, pannable and zoomable, with its key. `compact` is the small map in the side
// panel, which only follows your token and opens the full map when tapped.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as E from '../kn/engine';
import { drawMap, drawBadgeIcon, CELL } from '../dyson';
import Ico from '../ui/Ico';

export default function MapView({ game, onDoor, onMove, camps, compact, onOpen, height }) {
  const ref = useRef(null), vp = useRef(null), hits = useRef(null);
  const [zoom, setZoom] = useState(compact ? 0.5 : 0.85);
  const [legend, setLegend] = useState(!compact);
  const drag = useRef(null);
  const here = E.here(game);
  const draw = useCallback(() => {
    if (!ref.current) return;
    hits.current = drawMap(ref.current, game, { camps, dpr: Math.min(2, window.devicePixelRatio || 1.5) });
    ref.current.style.width = `${hits.current.W * zoom}px`; ref.current.style.height = `${hits.current.H * zoom}px`;
  }, [game, camps, zoom]);
  useEffect(() => { draw(); }, [draw]);
  useEffect(() => { document.fonts?.ready?.then(() => draw()); }, [draw]);
  // bring a point (your token, or a place picked from the key) to the middle of the view
  const focus = useRef(null);
  const centre = useCallback((pt, smooth = true) => { const el = vp.current; if (!pt || !el) return; el.scrollTo({ left: pt.x * zoom - el.clientWidth / 2, top: pt.y * zoom - el.clientHeight / 2, behavior: smooth ? 'smooth' : 'auto' }); }, [zoom]);
  const findMe = useCallback((smooth = true) => { focus.current = null; centre(hits.current?.here, smooth); }, [centre]);
  useEffect(() => { focus.current = null; }, [game.here]);
  useEffect(() => { if (focus.current) centre(focus.current); else centre(hits.current?.here, !compact); }, [game.here, game.pieces.length, zoom, compact]); // eslint-disable-line react-hooks/exhaustive-deps
  // the key: each tap jumps to the next place with that mark, zoomed in by half
  const turn = useRef({});
  const [picked, setPicked] = useState(null);
  const marksOf = (kind) => (kind === 'token' ? (hits.current?.here ? [hits.current.here] : []) : (hits.current?.marks || []).filter((m) => m.kind === kind));
  const pick = (kind) => {
    const list = marksOf(kind); if (!list.length) { setPicked({ kind, n: 0, of: 0 }); return; }
    const i = ((turn.current[kind] ?? -1) + 1) % list.length; turn.current[kind] = i;
    focus.current = list[i]; setPicked({ kind, n: i + 1, of: list.length });
    const z = Math.min(1.6, +(Math.max(zoom, (compact ? 0.5 : 0.85) * 1.5)).toFixed(2));
    if (z !== zoom) setZoom(z); else centre(list[i]);
  };
  const click = (e) => {
    if (compact) { onOpen?.(); return; }
    if (drag.current?.moved) return;
    const r = ref.current.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * hits.current.W, y = (e.clientY - r.top) / r.height * hits.current.H;
    const d = hits.current.doors.find((q) => q.piece === here.id && Math.hypot(q.x - x, q.y - y) < q.r * 1.1);
    if (d) { onDoor?.(d.id); return; }
    const room = hits.current.rooms.find((q) => Math.hypot(q.x - x, q.y - y) < CELL * 2.2);
    if (room && room.id !== here.id) onMove?.(room.id);
  };
  const down = (e) => { if (compact) return; drag.current = { x: e.clientX, y: e.clientY, sl: vp.current.scrollLeft, st: vp.current.scrollTop, moved: false }; };
  const move = (e) => { const d = drag.current; if (!d || !(e.buttons & 1)) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.abs(dx) + Math.abs(dy) > 6) d.moved = true; if (d.moved) { vp.current.scrollLeft = d.sl - dx; vp.current.scrollTop = d.st - dy; } };
  return (
    <section className={`dbt-map ${compact ? 'compact' : ''}`} aria-label="Map of the Domain">
      <div className="dbt-map-vp" ref={vp} style={height ? { height } : undefined} onPointerDown={down} onPointerMove={move} onPointerUp={() => setTimeout(() => { drag.current = null; }, 0)}>
        <canvas ref={ref} onClick={click} role="img" aria-label={`Map with ${game.pieces.length} places`} />
      </div>
      {compact ? (
        <button type="button" className="dbt-map-open" onClick={onOpen}><Ico n="map" size={16} /> Open the map</button>
      ) : (
        <>
          <div className="dbt-map-tools">
            <button type="button" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.15).toFixed(2)))} aria-label="Zoom out" title="Zoom out">−</button>
            <button type="button" onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)))} aria-label="Zoom in" title="Zoom in">+</button>
            <button type="button" className="findme" onClick={() => findMe(true)} aria-label="Jump to where you are" title="Jump to where you are"><Ico n="target" size={20} /></button>
            <button type="button" onClick={() => setLegend((v) => !v)} aria-expanded={legend} aria-label="Map key" title="Map key"><Ico n="info" size={18} /></button>
          </div>
          {legend && <Legend onPick={pick} picked={picked} count={(k) => marksOf(k).length} />}
        </>
      )}
    </section>
  );
}
const KEY = [['token', 'You'], ['start', 'Where it began'], ['q', 'Unexplored door: tap to go through'], ['fight', 'A fight waits'], ['camp', 'A sensible camp (gold dot: one way in)'], ['chest', 'Not searched yet'], ['lair', "The Overseer's lair"], ['exit', 'The way out of the Domain'], ['event', 'An event not yet seen']];
function Legend({ onPick, picked, count }) {
  return (
    <ul className="dbt-legend">{KEY.map(([k, label]) => { const n = count(k); const on = picked?.kind === k; return (
      <li key={k}><button type="button" className={`${on ? 'on' : ''} ${n ? '' : 'none'}`} onClick={() => onPick(k)} title={n ? `Show ${n > 1 ? `each of the ${n}` : 'it'} on the map` : 'None on the map yet'}>
        <LegendIcon kind={k} /><span>{label}</span><em>{on && picked.of ? `${picked.n} of ${picked.of}` : n || '–'}</em></button></li>
    ); })}</ul>
  );
}
function LegendIcon({ kind }) { const r = useRef(null); useEffect(() => { if (r.current) drawBadgeIcon(r.current, kind); }, [kind]); return <canvas ref={r} width="44" height="44" aria-hidden="true" />; }
