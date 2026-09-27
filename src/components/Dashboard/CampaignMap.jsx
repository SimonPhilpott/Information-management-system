import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Move, MapPin } from 'lucide-react';

// The campaign map: every scenario of the campaign as a pushpin on Middle-earth, joined by the road in
// play order. Won scenarios and the road between them light up gold (drawn in on load, with a
// traveller moving to the latest win); lost ones are red; the rest are waiting. Hover (or tap) a pin
// for each play - date, result, score, the decks used - and the boons and burdens earned there.
// Map: "Map of Middle-Earth" by k1tesurfen, CC BY-SA 4.0, via Wikimedia Commons.

// Each game's map; pins are stored as % of the map's width / height.
const MAPS = {
  lotr: { src: '/maps/middle-earth.svg', w: 3200, h: 2400, alt: 'Map of Middle-earth', beyond: 'Beyond the map',
    credit: <>Map: <a className="underline" href="https://commons.wikimedia.org/wiki/File:Map_of_Middle-Earth.svg" target="_blank" rel="noreferrer">"Map of Middle-Earth" by k1tesurfen</a>, CC BY-SA 4.0</> },
  // Arkham Horror: several maps (the server lists them with the pins) - this is the one shown until they arrive
  ahlcg: { id: 'arkham', name: 'Arkham', src: '/maps/arkham.jpg', w: 4320, h: 5616, credit: 'HD Arkham map (fan-made, shared on Reddit)' },
};
const W = 100;

// Old, worn paper: the edge is a rectangle roughed up with fractal noise - a slow wander, then a fine fray -
// with a few nicks and one or two deeper tears, the same for a map every time. The paper just inside the edge
// is browned and darker where it's torn, like a map that has been folded, handled and left in a damp drawer.
// Drawn at the map's own proportions (so nothing is stretched) and in % of it, so it scales with the zoom.
function wornPaper(seed, w, h) {
  let n = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((n = (n * 1664525 + 1013904223) >>> 0) / 4294967296);
  const W = 1000, H = Math.round((1000 * h) / w), m = 16;
  // the outline, walked round clockwise, with nicks and tears bitten into it
  const pts = [];
  const side = (x0, y0, x1, y1, ix, iy) => {
    const len = Math.hypot(x1 - x0, y1 - y0), steps = Math.round(len / 6);
    const bites = [];
    const count = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < count; k++) { const deep = rnd() < 0.3; bites.push({ at: 0.08 + rnd() * 0.84, half: (deep ? 14 + rnd() * 16 : 5 + rnd() * 8) / len, depth: deep ? 16 + rnd() * 22 : 5 + rnd() * 7 }); }
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      let d = 0;
      for (const b of bites) { const u = Math.abs(t - b.at) / b.half; if (u < 1) d = Math.max(d, b.depth * (1 - u) ** 1.4 * (0.75 + rnd() * 0.25)); }
      pts.push([x0 + (x1 - x0) * t + ix * d, y0 + (y1 - y0) * t + iy * d]);
    }
  };
  // the corners are worn round, a little differently each
  const r = () => 6 + rnd() * 14;
  const [a, b, c, d] = [r(), r(), r(), r()];
  side(m + a, m, W - m - b, m, 0, 1);
  side(W - m, m + b, W - m, H - m - c, -1, 0);
  side(W - m - c, H - m, m + d, H - m, 0, -1);
  side(m, H - m - d, m, m + a, 1, 0);
  const path = `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`;
  const s1 = Math.floor(rnd() * 900), s2 = Math.floor(rnd() * 900);
  const rough = `<filter id='r' x='-5%' y='-5%' width='110%' height='110%'>
    <feTurbulence type='fractalNoise' baseFrequency='0.022' numOctaves='3' seed='${s1}' result='a'/>
    <feDisplacementMap in='SourceGraphic' in2='a' scale='18' xChannelSelector='R' yChannelSelector='G' result='b'/>
    <feTurbulence type='fractalNoise' baseFrequency='0.45' numOctaves='2' seed='${s2}' result='f'/>
    <feDisplacementMap in='b' in2='f' scale='4.5' xChannelSelector='R' yChannelSelector='G'/></filter>`;
  const svg = (body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}' preserveAspectRatio='none'>${body}</svg>`)}")`;
  return {
    mask: svg(`<defs>${rough}</defs><path d='${path}' fill='#000' filter='url(#r)'/>`),
    // browning along the edge: a soft dark band hugging the torn edge, a stronger scorch right at it, and
    // a few faint damp stains creeping in
    edge: svg(`<defs>${rough}<filter id='s' x='-10%' y='-10%' width='120%' height='120%'><feGaussianBlur stdDeviation='14'/></filter><filter id='t' x='-10%' y='-10%' width='120%' height='120%'><feGaussianBlur stdDeviation='3'/></filter>
      <filter id='d'><feTurbulence type='fractalNoise' baseFrequency='0.012' numOctaves='3' seed='${s2}'/><feColorMatrix values='0 0 0 0 .36  0 0 0 0 .23  0 0 0 0 .08  0 0 0 -2.2 1.25'/></filter></defs>
      <g filter='url(#s)'><g filter='url(#r)'><path d='${path}' fill='none' stroke='rgb(92,58,22)' stroke-opacity='.38' stroke-width='55'/></g></g>
      <g filter='url(#t)'><g filter='url(#r)'><path d='${path}' fill='none' stroke='rgb(60,36,12)' stroke-opacity='.5' stroke-width='10'/></g></g>
      <rect width='${W}' height='${H}' filter='url(#d)' opacity='.08'/>`),
  };
}

async function api(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.success === false) throw new Error(d.error || `Request failed (${res.status})`);
  return d;
}

// Smooth road through the points (Catmull-Rom as cubic Béziers).
function roadPath(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)}, ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

// A little parchment scroll: where it is, and a paragraph of its history, in italic.
export function ScrollRollers({ children }) {
  const roller = { height: 9, borderRadius: 5, background: 'linear-gradient(180deg, #8a6a3c, #c9a66b 45%, #7a5a2e)', boxShadow: '0 1px 3px rgba(0,0,0,.35)' };
  return (
    <div>
      <div style={roller} />
      <div style={{ background: 'linear-gradient(90deg, #e9d6a8, #f6ead0 8%, #f8eed8 50%, #f6ead0 92%, #e9d6a8)', color: '#3b2a14', padding: '18px 26px', borderLeft: '1px solid #d9c08a', borderRight: '1px solid #d9c08a' }}>{children}</div>
      <div style={roller} />
    </div>
  );
}

function Scroll({ entry }) {
  const roller = { height: 7, borderRadius: 4, background: 'linear-gradient(180deg, #8a6a3c, #c9a66b 45%, #7a5a2e)', boxShadow: '0 1px 2px rgba(0,0,0,.35)' };
  return (
    <div className="my-2 mx-[-2px]">
      <div style={roller} />
      <div style={{ background: 'linear-gradient(90deg, #e9d6a8, #f6ead0 12%, #f8eed8 50%, #f6ead0 88%, #e9d6a8)', color: '#3b2a14', padding: '8px 12px', borderLeft: '1px solid #d9c08a', borderRight: '1px solid #d9c08a', fontFamily: '"DM Serif Display", Georgia, serif' }}>
        {entry ? <>
          <div style={{ fontSize: 12, letterSpacing: '.04em', textAlign: 'center', marginBottom: 4 }}>~ {entry.place} ~</div>
          <p style={{ fontStyle: 'italic', fontSize: 11.5, lineHeight: 1.45, fontFamily: 'Georgia, serif' }}>{entry.lore}</p>
        </> : <p style={{ fontStyle: 'italic', fontSize: 11, textAlign: 'center', fontFamily: 'Georgia, serif', opacity: .7 }}>Consulting the archives of Minas Tirith...</p>}
      </div>
      <div style={roller} />
    </div>
  );
}

export default function CampaignMap({ c, ui, route, packOf = {}, byCode, edit, toast, extras = [], title = 'The road so far', summary = null, chronicle = null, showPlayed = true, game = 'lotr', allMaps = false }) {
  const arkham = game === 'ahlcg';
  // Arkham Horror has several maps, as tabs: on the main screen all of them; in a campaign, the ones its
  // scenarios are on - opening on the map of the next scenario to play, unless one's been picked.
  const [maps, setMaps] = useState([MAPS.ahlcg]);
  const [picked, setPicked] = useState(null);
  const [offTip, setOffTip] = useState(null); // a scenario beyond the map, opened from the strip
  const [pins, setPins] = useState({});
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState(null);
  const [moving, setMoving] = useState(false);
  const [drag, setDrag] = useState(null);
  const [runKey, setRunKey] = useState(0); // restarts the road animation
  const svgRef = useRef(null);
  // Zoomed in, the map is dragged about with the mouse (touch scrolls it natively).
  const boxRef = useRef(null);
  const pan = useRef(null); // { x, y, left, top, moved }
  const [panning, setPanning] = useState(false);
  const panStart = (e) => {
    if (zoom <= 1 || moving || e.pointerType !== 'mouse' || e.button !== 0) return;
    const b = boxRef.current;
    pan.current = { x: e.clientX, y: e.clientY, left: b.scrollLeft, top: b.scrollTop, moved: false };
  };
  const panMove = (e) => {
    const p = pan.current;
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (!p.moved && Math.hypot(dx, dy) < 4) return;
    if (!p.moved) { p.moved = true; setPanning(true); setHover(null); }
    boxRef.current.scrollLeft = p.left - dx;
    boxRef.current.scrollTop = p.top - dy;
  };
  const panEnd = () => { if (pan.current) { const moved = pan.current.moved; pan.current = null; setPanning(false); if (moved) pan.justDragged = true; } };

  // Everything to show: the campaign's road, plus anything else they've played.
  const names = useMemo(() => {
    const extra = [...(showPlayed ? c.scenarios.map((s) => s.name) : []), ...extras].filter((n) => !route.includes(n));
    return [...route, ...extra.filter((n, i) => extra.indexOf(n) === i)];
  }, [c.scenarios, route, extras, showPlayed]);
  // Pins are added to what's known, never swapped out - so a slow answer arriving late can't wipe pins
  // that are already showing. Which pins are drawn is decided by names.
  useEffect(() => {
    const want = names.filter((n) => !pins[n]);
    if (!want.length) return;
    let alive = true, tries = 0;
    // Arkham's scenarios are placed in the background the first time - check back while they are
    const load = () => api(`/api/decks/campaigns/map/pins?game=${game}`, { method: 'POST', body: { names: want } })
      .then((d) => { if (!alive) return; setPins((ps) => ({ ...ps, ...d.pins })); if (d.maps?.length) setMaps(d.maps); if (d.pending && ++tries < 30) setTimeout(load, 5000); })
      .catch((err) => toast(err.message, 'error'));
    load();
    return () => { alive = false; };
  }, [names.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lore for each pin: written once in the background, so check back while any are still coming.
  const [lore, setLore] = useState({});
  useEffect(() => {
    let alive = true, tries = 0;
    const load = async () => {
      try {
        const d = await api(`/api/decks/campaigns/map/lore?game=${game}`, { method: 'POST', body: { items: names.map((n) => ({ name: n, pack: packOf[n] || null })) } });
        if (!alive) return;
        setLore(d.lore);
        if (d.pending && ++tries < 30) setTimeout(load, 5000);
      } catch (_) { /* lore is a nice-to-have */ }
    };
    load();
    return () => { alive = false; };
  }, [names.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = (name) => {
    const plays = c.scenarios.filter((s) => s.name === name);
    return { plays, won: plays.some((p) => p.result === 'won'), lost: plays.length > 0 && !plays.some((p) => p.result === 'won') };
  };
  // which map is showing
  const onMap = (name, id) => (arkham ? pins[name]?.at?.[id] : pins[name]?.x != null ? pins[name] : null);
  const tabs = arkham ? maps.filter((m) => allMaps || names.some((n) => onMap(n, m.id))) : [];
  const nextUp = route.find((n) => pins[n] && !status(n).won);
  const latest = [...c.scenarios].sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`)).pop()?.name;
  const autoMap = [nextUp, latest, ...names].map((n) => n && tabs.find((m) => onMap(n, m.id))).find(Boolean)?.id;
  const mapId = arkham ? (tabs.some((m) => m.id === picked) ? picked : autoMap || tabs[0]?.id || 'arkham') : null;
  const M = arkham ? maps.find((m) => m.id === mapId) || maps[0] : MAPS[game] || MAPS.lotr;
  const H = (100 * M.h) / M.w;
  const paper = useMemo(() => (M.ragged ? wornPaper(M.id || M.src, M.w, M.h) : null), [M.ragged, M.id, M.src, M.w, M.h]);
  const mask = paper?.mask;
  const at = (name) => { const p = arkham ? onMap(name, mapId) : pins[name]; return p && p.x != null ? { x: p.x, y: p.y * (H / 100) } : null; };
  const roadPts = route.map(at).filter(Boolean);
  // The gold road runs from the start through every won scenario in order, up to the first gap.
  let done = 0;
  for (const n of route) { if (!at(n)) continue; if (status(n).won) done++; else break; }
  const donePts = roadPts.slice(0, Math.max(done, 0));
  const full = roadPath(roadPts), gold = roadPath(donePts);
  const nextName = route.find((n) => pins[n] && !status(n).won);
  const beyond = names.filter((n) => pins[n]?.offMap);
  const pos = (name) => (arkham ? onMap(name, mapId) : pins[name]);

  // Dragging a pin (players only, in "move pins" mode).
  const toMap = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)), y: Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)) };
  };
  const onMove = (e) => {
    if (!drag) return;
    const p = toMap(e), xy = { x: +p.x.toFixed(2), y: +p.y.toFixed(2) };
    setPins((ps) => ({ ...ps, [drag]: arkham ? { ...ps[drag], at: { ...ps[drag].at, [mapId]: xy } } : { ...ps[drag], ...xy } }));
  };
  const onUp = async () => {
    if (!drag) return;
    const p = pos(drag);
    setDrag(null);
    try { await api(`/api/decks/campaigns/map/pins?game=${game}`, { method: 'PUT', body: { scenario: drag, x: p.x, y: p.y, map: mapId } }); } catch (err) { toast(err.message, 'error'); }
  };

  const tip = hover && at(hover) ? { name: hover, ...status(hover), pos: pos(hover) } : null;
  const earned = (name) => c.cards.filter((x) => x.fromScenario === name);
  // What a scenario's pop-up says: where, the lore, the chronicle's summary, every play, what was earned.
  const card = (x) => (
              <div className={`w-80 rounded-xl border shadow-2xl p-3 text-xs ${ui.isDark ? 'bg-slate-900/95 border-white/10 text-slate-100' : 'bg-white/95 border-slate-200 text-slate-900'}`}>
                {packOf[x.name] && <div className="font-black text-sm">{packOf[x.name].replace(/^The Hobbit: /, '')}</div>}
                <div className={packOf[x.name] ? 'text-sm' : 'font-black text-sm'}>{route.includes(x.name) ? `${route.indexOf(x.name) + 1}. ` : ''}{x.name}</div>
                <div className={`mb-1 ${ui.muted}`}>{x.won ? 'Complete' : x.lost ? 'Not beaten yet' : 'Still ahead'}{pins[x.name]?.place ? ` · ${pins[x.name].place}` : ''}</div>
                <Scroll entry={lore[x.name]} />
                {chronicle?.[x.name]?.summary && (
                  <div className="mb-1.5" style={{ fontFamily: '"IM Fell English", Georgia, serif' }}>
                    <div className="font-bold text-[12px]">{arkham ? 'From the case file' : 'From the chronicle'}: <i>{chronicle[x.name].title}</i></div>
                    <div className="italic text-[12px] leading-snug">{chronicle[x.name].summary}</div>
                  </div>
                )}
                {x.plays.map((p, i) => (
                  <div key={p.id} className="border-t border-slate-500/15 pt-1.5 mt-1.5">
                    <div><b className={p.result === 'won' ? 'text-emerald-500' : 'text-red-500'}>{p.result === 'won' ? 'Won' : 'Lost'}</b> · play {i + 1}{p.campaign ? ` · ${p.campaign}` : ''} · {p.date}{p.time ? ` ${p.time}` : ''} · {arkham ? `${p.resolution ? p.resolution : 'no resolution'}${p.xp != null ? ` · ${p.xp} XP` : ''}` : `${p.difficulty}${p.score !== null && p.score !== undefined ? ` · score ${p.score}` : ''}`}</div>
                    {(p.decks || []).length > 0 && <div className="mt-0.5">{p.decks.map((d) => <div key={d.email}>{d.name}: <b>{d.deckName}</b>{d.heroes?.length ? <span className={ui.muted}> ({d.heroes.map((h) => byCode[h]?.name || h).join(', ')})</span> : null}</div>)}</div>}
                    {p.notes && <div className={`mt-0.5 ${ui.muted}`}>{p.notes}</div>}
                  </div>
                ))}
                {earned(x.name).length > 0 && (
                  <div className="border-t border-slate-500/15 pt-1.5 mt-1.5">
                    <div className="font-bold mb-0.5">Campaign cards from here</div>
                    {earned(x.name).map((x) => (
                      <div key={x.id}><span className={x.kind === 'boon' ? 'text-emerald-500' : x.kind === 'burden' ? 'text-red-500' : ''}>{x.kind}</span> {x.name} - {x.to === 'encounter' ? 'encounter deck' : `${c.players.find((p) => p.email === x.to)?.name || x.to}'s deck`}{x.removed ? ' (used)' : ''}</div>
                    ))}
                  </div>
                )}
                {!x.plays.length && <div className={ui.muted}>Not played yet.</div>}
              </div>
  );

  return (
    <div className={ui.panel}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className="text-xs font-black uppercase tracking-wider flex-1 flex items-center gap-2"><MapPin size={14} className="opacity-60" /> {title}
          <span className={`font-normal normal-case tracking-normal ${ui.muted}`}>{summary || `${done} of ${route.length} scenarios won`}</span></h2>
        <button onClick={() => setRunKey((k) => k + 1)} className={`px-2.5 py-1.5 rounded-lg text-xs font-bold ${ui.soft}`}>Replay journey</button>
        {edit && <button onClick={() => setMoving(!moving)} className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 ${moving ? ui.primary : ui.soft}`}><Move size={13} /> {moving ? 'Done moving' : 'Move pins'}</button>}
        <button onClick={() => setZoom((z) => Math.max(1, z - 0.5))} disabled={zoom <= 1} className={`p-1.5 rounded-lg disabled:opacity-30 ${ui.soft}`}><ZoomOut size={14} /></button>
        <button onClick={() => setZoom((z) => Math.min(4, z + 0.5))} disabled={zoom >= 4} className={`p-1.5 rounded-lg disabled:opacity-30 ${ui.soft}`}><ZoomIn size={14} /></button>
      </div>
      {moving && <p className={`text-xs mb-2 ${ui.muted}`}>Drag any pin to where the scenario really happens - it moves for everyone.</p>}
      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tabs.map((m) => {
            const count = names.filter((n) => onMap(n, m.id)).length;
            const here = nextUp && onMap(nextUp, m.id);
            return (
              <button key={m.id} onClick={() => { setPicked(m.id); setHover(null); setOffTip(null); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${m.id === mapId ? ui.primary : ui.soft}`} title={here ? `${nextUp} - the next to play - is here` : undefined}>
                {m.name}{count > 0 && <span className="opacity-60 font-normal">{count}</span>}{here && <span className="w-2 h-2 rounded-full" style={{ background: '#3f9b3a', boxShadow: '0 0 0 2px #ffd24a' }} />}
              </button>
            );
          })}
        </div>
      )}
      <div ref={boxRef} className={`rounded-xl overflow-auto border border-black/10 ${zoom > 1 ? 'max-h-[85vh]' : ''}`}
        style={{ cursor: zoom > 1 && !moving ? (panning ? 'grabbing' : 'grab') : undefined, userSelect: panning ? 'none' : undefined }}
        onPointerDown={panStart}
        onPointerMove={(e) => { onMove(e); panMove(e); }} onPointerUp={() => { onUp(); panEnd(); }} onPointerLeave={() => { onUp(); panEnd(); }}
        onClickCapture={(e) => { if (pan.justDragged) { pan.justDragged = false; e.stopPropagation(); } }}>
        <div className="relative" style={{ width: `${zoom * 100}%`, aspectRatio: `${M.w} / ${M.h}`, filter: mask ? 'drop-shadow(0 2px 3px rgba(0,0,0,.4))' : undefined }}>
          <div className="absolute inset-0" style={mask ? { WebkitMaskImage: mask, maskImage: mask, WebkitMaskSize: '100% 100%', maskSize: '100% 100%', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat' } : undefined}>
            <img key={M.src} src={M.src} alt={M.alt || `Map of ${M.name}`} className="absolute inset-0 w-full h-full select-none" draggable={false} />
            {paper && <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `${paper.edge}, radial-gradient(ellipse at center, transparent 72%, rgba(80,52,20,.1) 100%)`, backgroundSize: '100% 100%', mixBlendMode: 'multiply' }} />}
          </div>
          <svg ref={svgRef} key={runKey} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full fill-current" style={{ color: 'transparent' }}>
            <style>{`
              .road-all { fill: none; stroke: rgba(60,40,20,.55); stroke-width: .28; stroke-dasharray: .8 .6; }
              .road-gold { fill: none; stroke: #f5c542; stroke-width: .55; stroke-linecap: round; filter: drop-shadow(0 0 .6px #f5c542); stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 3.2s ease-in-out forwards; }
              @keyframes draw { to { stroke-dashoffset: 0; } }
              @keyframes halo { 0% { r: 1.5px; opacity: .95; stroke-width: .5px } 100% { r: 3.6px; opacity: 0; stroke-width: .15px } }
              @keyframes glint { 0%,100% { opacity: 1 } 50% { opacity: .55 } }
              .next-ring { fill: none; stroke: #ffd24a; stroke-width: .55px; filter: drop-shadow(0 0 .7px #ffcc33) drop-shadow(0 0 1.4px #f5b800); animation: glint 1.6s ease-in-out infinite; }
              .next-halo { fill: none; stroke: #ffd24a; animation: halo 1.6s ease-out infinite; }
            `}</style>
            {full && <path d={full} className="road-all" style={{ strokeWidth: 0.28 / zoom, strokeDasharray: `${0.8 / zoom} ${0.6 / zoom}` }} />}
            {gold && <path d={gold} pathLength="1" className="road-gold" style={{ strokeWidth: 0.55 / zoom }} />}
            {gold && donePts.length > 1 && (
              <circle r={0.7 / zoom} style={{ fill: '#fff7d6', filter: 'drop-shadow(0 0 1px #f5c542)' }}>
                <animateMotion dur="3.2s" fill="freeze" path={gold} calcMode="spline" keySplines=".42 0 .58 1" keyTimes="0;1" keyPoints="0;1" />
              </circle>
            )}
            {/* pins (and the road) are scaled back by the zoom, so they stay the same size on screen */}
            {names.map((n) => {
              const p = at(n);
              if (!p) return null;
              const st = status(n);
              const isNext = n === nextName;
              const colour = st.won ? '#f5c542' : isNext ? '#3f9b3a' : '#cdb38a';
              const onRoute = route.includes(n);
              return (
                <g key={n} transform={`translate(${p.x} ${p.y}) scale(${1 / zoom})`} style={{ cursor: moving ? 'grab' : panning ? 'grabbing' : 'pointer' }}
                  onPointerEnter={() => !drag && !pan.current?.moved && setHover(n)} onPointerLeave={() => !drag && setHover((h) => (h === n ? null : h))}
                  onClick={() => setHover((h) => (h === n ? null : n))}
                  onPointerDown={(e) => { if (moving) { e.preventDefault(); setDrag(n); setHover(null); } }}>
                  {n === nextName && <>
                    <circle cy="-2.05" r="1.5" className="next-halo" />
                    <circle cy="-2.05" r="1.75" className="next-ring" />
                  </>}
                  {/* pushpin: needle then head */}
                  <line x1="0" y1="0" x2="0" y2="-1.6" style={{ stroke: '#3b2f22', strokeWidth: '.22' }} />
                  <circle cy="-2.05" r={onRoute ? 1.05 : 0.85} style={{ fill: colour, stroke: st.lost ? '#dc2626' : '#2a2016', strokeWidth: st.lost ? '.32' : '.18', filter: st.won ? 'drop-shadow(0 0 .8px #f5c542)' : 'none' }} />
                  {/* play order on the campaign's road */}
                  {onRoute && <text y="-1.72" textAnchor="middle" style={{ fontSize: '1.05px', fontWeight: 800, fill: isNext ? '#fff' : '#2a2016', fontFamily: 'Inter, sans-serif' }}>{route.indexOf(n) + 1}</text>}
                  {!onRoute && <circle cx="-.3" cy="-2.35" r=".25" style={{ fill: 'rgba(255,255,255,.7)' }} />}
                  <circle r=".22" style={{ fill: '#3b2f22' }} />
                </g>
              );
            })}
          </svg>
          {tip && (
            <div className="absolute z-10 pointer-events-none" style={{ left: `${tip.pos.x}%`, top: `${tip.pos.y}%`, transform: `translate(${tip.pos.x > 60 ? '-105%' : '5%'}, ${tip.pos.y > 55 ? '-105%' : '8%'})` }}>
              {card(tip)}
            </div>
          )}
        </div>
      </div>
      {beyond.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-black uppercase tracking-wider mb-1.5">{arkham ? 'Beyond every map' : M.beyond}</div>
          <div className="flex flex-wrap gap-2">
            {beyond.map((n) => {
              const st = status(n), isNext = n === nextName;
              return (
                <button key={n} onClick={() => setOffTip(offTip === n ? null : n)} className={`px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-2 border ${offTip === n ? 'border-amber-500' : 'border-transparent'} ${ui.soft}`}>
                  <span className="w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center" style={{ background: st.won ? '#f5c542' : isNext ? '#3f9b3a' : '#cdb38a', color: isNext ? '#fff' : '#2a2016', outline: st.lost ? '2px solid #dc2626' : 'none' }}>{route.includes(n) ? route.indexOf(n) + 1 : '•'}</span>
                  <span className="text-left"><b>{n}</b><span className={`block text-[10px] ${ui.muted}`}>{pins[n]?.region || pins[n]?.place}</span></span>
                </button>
              );
            })}
          </div>
          {offTip && pins[offTip] && <div className="mt-2 max-w-md">{card({ name: offTip, ...status(offTip) })}</div>}
        </div>
      )}
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] ${ui.muted}`}>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#f5c542' }} /> completed</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#3f9b3a', boxShadow: '0 0 0 2px #ffd24a' }} /> next to play</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#cdb38a' }} /> still ahead</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border-2 border-red-600" style={{ background: '#cdb38a' }} /> lost, not yet won</span>
        <span className="ml-auto">{typeof M.credit === 'string' ? `Map: ${M.credit}` : M.credit}</span>
      </div>
    </div>
  );
}
