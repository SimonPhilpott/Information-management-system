// Run planner: Routes - every route as a card with its line drawn and its hills beneath, searchable and
// filtered by distance, kind and source; open one for its map, climbs and your runs there, and plan it. Adding a
// route (Komoot, GPX, a link) is the green button in the bottom right, opening the classic panel in a sheet, so every
// import and sync works as now. (The route finder was taken off on 24 Oct, Simon.)
import React, { useEffect, useMemo, useState } from 'react';
import RouteMapArt from './RouteMapArt';
import { Icon, IconButton, Btn, FilterChip, useMenu, Menu } from '../HomebrewBeta/ui';
import { dist } from '../../utils/units';
import { ElevationProfile } from './classicPieces';

// ---- the route shapes for the cards: fetched once for the whole list ----
let previewStore = null;
const listeners = new Set();
function loadPreviews(force = false) {
  if (previewStore && !force) return;
  previewStore = previewStore || {};
  fetch('/api/planner/routes/previews', { credentials: 'same-origin' }).then((r) => r.json()).then((d) => {
    if (!d.success) return;
    previewStore = Object.fromEntries(d.previews.map((p) => [p.id, p]));
    listeners.forEach((f) => f());
  }).catch(() => {});
}
function usePreview(id) {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); listeners.add(f); loadPreviews(); return () => listeners.delete(f); }, []);
  return previewStore?.[id] || null;
}

// the route on its map, its line drawing itself in as the card comes into view, over its hills
export function RouteArt({ id, small = false }) {
  const p = usePreview(id);
  if (!p?.line?.length) return <span className={`rpb-art ${small ? 'small' : ''}`} aria-hidden="true" />;
  return <RouteMapArt path={p.line} hills={p.hills} W={320} H={small ? 120 : 150} className={`rpb-art ${small ? 'small' : ''}`} />;
}

const BANDS = [['short', ['Under 5 km', 'Under 3 mi'], (k) => k < 5], ['mid', ['5 to 10 km', '3 to 6 mi'], (k) => k >= 5 && k < 10], ['long', ['10 to 15 km', '6 to 9 mi'], (k) => k >= 10 && k < 15], ['xl', ['15 km and over', '9 mi and over'], (k) => k >= 15]];
const SORTS = [['new', 'Newest first'], ['name', 'Name'], ['short', 'Shortest'], ['long', 'Longest'], ['flat', 'Flattest'], ['hilly', 'Hilliest']];

export default function Routes({ rp, selectedId, onOpen, compact }) {
  const [q, setQ] = useState('');
  const [band, setBand] = useState('');
  const [source, setSource] = useState('');
  const [loops, setLoops] = useState(false);
  const [sort, setSort] = useState(() => { try { return localStorage.getItem('rpb_sort') || 'new'; } catch { return 'new'; } });
  const sortMenu = useMenu();
  useEffect(() => { loadPreviews(true); }, [rp.routes.length]);
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); listeners.add(f); return () => listeners.delete(f); }, []);

  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const b = BANDS.find(([k]) => k === band);
    const l = rp.routes.filter((r) => (!words.length || words.every((w) => r.name.toLowerCase().includes(w)))
      && (!b || b[2](r.distanceKm)) && (!source || r.source === source) && (!loops || previewStore?.[r.id]?.loop));
    const by = { name: (a, z) => a.name.localeCompare(z.name), short: (a, z) => a.distanceKm - z.distanceKm, long: (a, z) => z.distanceKm - a.distanceKm, flat: (a, z) => (a.gainM || 0) - (z.gainM || 0), hilly: (a, z) => (z.gainM || 0) - (a.gainM || 0) }[sort];
    return by ? [...l].sort(by) : l;
  }, [rp.routes, q, band, source, loops, sort, previewStore]); // eslint-disable-line react-hooks/exhaustive-deps
  const sources = [...new Set(rp.routes.map((r) => r.source))];
  const filtered = Boolean(band || source || loops || q);
  const keepSort = (v) => { setSort(v); try { localStorage.setItem('rpb_sort', v); } catch { /* fine */ } };

  return (
    <div className="gutter" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 24 }}>
      <div className="search">
        <Icon n="search" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${rp.routes.length} routes`} aria-label="Search routes" />
        {q && <IconButton icon="close" label="Clear the search" onClick={() => setQ('')} />}
      </div>
      <div className="chips wrap">
        <button type="button" className="chip sl" onClick={sortMenu.show} aria-haspopup="menu">{SORTS.find(([k]) => k === sort)?.[1]}<Icon n="down" size={18} /></button>
        <FilterChip on={loops} onClick={() => setLoops(!loops)}>Loops</FilterChip>
        {BANDS.map(([k, l]) => <FilterChip key={k} on={band === k} onClick={() => setBand(band === k ? '' : k)}>{l[rp.units === 'mi' ? 1 : 0]}</FilterChip>)}
        {sources.length > 1 && sources.map((s) => <FilterChip key={s} on={source === s} onClick={() => setSource(source === s ? '' : s)}>{s === 'komoot' ? 'Komoot' : s === 'gpx' ? 'GPX' : s}</FilterChip>)}
        {filtered && <button type="button" className="chip sl clear-btn" onClick={() => { setQ(''); setBand(''); setSource(''); setLoops(false); }}><Icon n="close" size={18} />Clear</button>}
      </div>

      {list.length ? (
        <div className={`rpb-grid ${compact ? 'one' : ''}`}>
          {list.map((r, i) => (
            <a key={r.id} href={`/ims/runplanner/routes/${r.id}`} className={`rpb-rcard sl ${selectedId === r.id ? 'sel' : ''} ${String(rp.routeId) === String(r.id) ? 'chosen' : ''}`}
              style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
              onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); onOpen(r); }}>
              <RouteArt id={r.id} />
              {String(rp.routeId) === String(r.id) && <span className="today-pill"><Icon n="sun" size={16} />Today</span>}
              <span className="info">
                <span className="nm">{r.name}</span>
                <span className="tags">
                  <span className="tag">{dist(r.distanceKm, rp.units, 1)} {rp.units}</span>
                  {r.gainM != null && <span className="tag"><Icon n="terrain" size={16} />{Math.round(r.gainM)} m</span>}
                  {previewStore?.[r.id]?.loop && <span className="tag">Loop</span>}
                  <span className="tag quiet">{r.source === 'komoot' ? 'Komoot' : r.source === 'gpx' ? 'GPX' : r.source}</span>
                </span>
              </span>
            </a>
          ))}
        </div>
      ) : (
        <div className="rpb-card rpb-empty"><Icon n="route" size={28} /><p>{rp.routes.length ? 'No routes match. Try fewer filters.' : 'No routes yet. Add one from Komoot or a GPX file.'}</p></div>
      )}

      <Menu anchor={sortMenu.anchor} open={sortMenu.open} onClose={sortMenu.close} items={SORTS.map(([k, l]) => ({ label: l, icon: sort === k ? 'check' : 'blank', onClick: () => keepSort(k) }))} />
    </div>
  );
}

// ---- one route: its map, its hills, your runs on it, and Plan this run ----
export function RouteDetail({ rp, route, backIcon, onBack, onPlan }) {
  const [full, setFull] = useState(null);
  const [hist, setHist] = useState(null);
  const id = route?.id;
  useEffect(() => {
    if (!id) return undefined;
    let live = true;
    setFull(null); setHist(null);
    rp.call(`/api/planner/routes/${id}`).then((d) => { if (live) setFull(d.route); }).catch(() => {});
    rp.call(`/api/planner/routes/${id}/history`).then((d) => { if (live) setHist(d); }).catch(() => {});
    return () => { live = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!route) return <div className="topbar"><IconButton icon={backIcon} label="Back" onClick={onBack} /></div>;
  const chosen = String(rp.routeId) === String(route.id);
  const runLine = (name, r) => r && <span key={name}><b>{name}</b>{r.minutes ? `${Math.round(r.minutes)} min` : ''}{r.day || r.date ? `, ${new Date(r.day || r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="topbar">
        <IconButton icon={backIcon} label={backIcon === 'close' ? 'Close' : 'Back'} onClick={onBack} />
        <span className="title">{route.name}</span>
        <a className="ib sl" href={`/api/planner/routes/${route.id}/gpx`} aria-label="Download the GPX file" title="Download the GPX file"><Icon n="download" /></a>
        <IconButton icon="del" label="Delete this route" onClick={async () => { await rp.removeRoute(route); if (!rp.routes.some((r) => r.id === route.id)) onBack(); }} />
      </div>
      <div className="scroll">
        <div className="gutter" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 32 }}>
          <div className="props">
            <span className="tag">{dist(route.distanceKm, rp.units, 2)} {rp.units}</span>
            {route.gainM != null && <span className="tag"><Icon n="terrain" size={16} />{Math.round(route.gainM)} m up</span>}
            {route.lossM != null && <span className="tag">{Math.round(route.lossM)} m down</span>}
            {route.minEle != null && <span className="tag">{Math.round(route.minEle)} to {Math.round(route.maxEle)} m high</span>}
            <span className="tag quiet">{route.source === 'komoot' ? 'Komoot' : route.source === 'gpx' ? 'GPX' : route.source}</span>
          </div>
          <div className="rpb-acts start">
            <Btn icon={chosen ? 'check' : 'run'} onClick={() => onPlan(route.id)}>{chosen ? 'Planned for today: open the plan' : 'Plan this run'}</Btn>
          </div>
          <div className="rpb-mapbox">{full?.path?.length > 1
            ? <RouteMapArt key={full.id} path={full.path} route={full} units={rp.units} W={640} H={400} pad={40} zoomable label={`Map of ${full.name}`} className="big" />
            : <RouteArt id={route.id} />}</div>
          {full?.hasElevation && <section><h2 className="rpb-h2">The climbs</h2><div className="rpb-card" style={{ padding: 12 }}><ElevationProfile route={full} units={rp.units} /></div></section>}
          <section>
            <h2 className="rpb-h2">Your runs here</h2>
            {hist?.count > 0 ? (
              <div className="kv rpb-kv">
                <span><b>Runs</b>{hist.count}</span>
                {runLine('Last', hist.last)}
                {runLine('Fastest', hist.fastest)}
                {runLine('Slowest', hist.slowest)}
                {hist.expectedCurrentTimeMin && <span><b>At today's fitness</b>about {Math.round(hist.expectedCurrentTimeMin)} min</span>}
              </div>
            ) : <p className="muted">{hist ? 'You haven\'t run this route yet.' : 'Looking up your runs…'}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
