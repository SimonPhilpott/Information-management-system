import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, RotateCw, Repeat, ArrowLeftRight, Copy, Trash2, Check, Route as RouteIcon, RefreshCw, ExternalLink, Download, Undo2 } from 'lucide-react';
import { dist, paceText, elev, elevUnit, KM_PER_MI } from '../../../utils/units';

// Run Planner tab 2: find a saved route by shape (loop / there and back), a distance range and a run-time
// range, then "Plan this run" hands it to tab 1. Run times are how long the user took the last time they
// ran each route (their Strava runs matched to it), or an estimate from current fitness when they never
// have. Below it: routes saved more than once. Komoot saved routes are imported first so both can use them.

const SHAPES = [
  ['any', 'Any shape', RouteIcon],
  ['loop', 'Loop', Repeat],
  ['out-and-back', 'There and back', ArrowLeftRight],
];
const hm = (min) => (min == null ? '-' : min >= 60 ? `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min` : `${Math.round(min)} min`);
const ukDate = (day) => (day ? new Date(`${day}T12:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const komootLink = (r) => (r.source === 'komoot' && r.externalId ? `https://www.komoot.com/tour/${r.externalId}` : null);

// A small OpenStreetMap map of the route: the line, a green start, and an arrow showing which way round.
function MiniRouteMap({ path, isDark }) {
  const view = React.useMemo(() => {
    if (!path || path.length < 2) return null;
    const W = 320, H = 170, pad = 22;
    const lats = path.map((p) => p[0]), lngs = path.map((p) => p[1]);
    const X = (lng, z) => ((lng + 180) / 360) * 256 * 2 ** z;
    const Y = (lat, z) => { const sn = Math.sin((lat * Math.PI) / 180); return (0.5 - Math.log((1 + sn) / (1 - sn)) / (4 * Math.PI)) * 256 * 2 ** z; };
    const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
    let z = 16;
    for (; z > 9; z--) if (X(maxLng, z) - X(minLng, z) <= W - pad * 2 && Y(minLat, z) - Y(maxLat, z) <= H - pad * 2) break;
    const ox = (X(minLng, z) + X(maxLng, z)) / 2 - W / 2, oy = (Y(minLat, z) + Y(maxLat, z)) / 2 - H / 2;
    const n = 2 ** z, tiles = [];
    for (let ty = Math.floor(oy / 256); ty <= Math.floor((oy + H) / 256); ty++) {
      for (let tx = Math.floor(ox / 256); tx <= Math.floor((ox + W) / 256); tx++) {
        if (ty >= 0 && ty < n) tiles.push({ key: `${tx}-${ty}`, url: `https://tile.openstreetmap.org/${z}/${((tx % n) + n) % n}/${ty}.png`, x: tx * 256 - ox, y: ty * 256 - oy });
      }
    }
    const pts = path.map((p) => [X(p[1], z) - ox, Y(p[0], z) - oy]);
    // direction arrow about an eighth of the way round
    const k = Math.max(1, Math.floor(pts.length / 8));
    const [a, b] = [pts[k - 1], pts[Math.min(pts.length - 1, k + 1)]];
    return { W, H, tiles, pts, arrow: { x: pts[k][0], y: pts[k][1], deg: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI } };
  }, [path]);
  if (!view) return null;
  return (
    <div className={`relative mt-3 rounded-lg overflow-hidden border ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`} style={{ aspectRatio: `${view.W} / ${view.H}` }}>
      <svg viewBox={`0 0 ${view.W} ${view.H}`} className="absolute inset-0 w-full h-full" aria-label="Route map">
        {view.tiles.map((t) => <image key={t.key} href={t.url} x={t.x} y={t.y} width="256" height="256" />)}
        <rect width={view.W} height={view.H} fill={isDark ? 'rgba(2,6,23,0.25)' : 'rgba(255,255,255,0.1)'} />
        <polyline points={view.pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#fff" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={view.pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#e11d48" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
        <g transform={`translate(${view.arrow.x},${view.arrow.y}) rotate(${view.arrow.deg})`}><path d="M-5,-4 L5,0 L-5,4 Z" fill="#e11d48" stroke="#fff" strokeWidth="1" /></g>
        <circle cx={view.pts[0][0]} cy={view.pts[0][1]} r="5" fill="#10b981" stroke="#fff" strokeWidth="2" />
      </svg>
      <span className="absolute bottom-0 right-0 text-[8px] px-1 bg-white/80 text-slate-700">© OpenStreetMap</span>
    </div>
  );
}

// Two thumbs on one track: [low, high] between min and max.
function RangeSlider({ min, max, step, value, onChange, format, isDark, label }) {
  const [lo, hi] = value;
  const pct = (v) => ((v - min) / (max - min || 1)) * 100;
  const thumb = 'absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-emerald-500 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:cursor-pointer';
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-bold mb-2">
        <span className={isDark ? 'text-slate-300' : 'text-[#2E2B27]'}>{label}</span>
        <span className="text-emerald-500">{format(lo)} - {format(hi)}{lo === min && hi === max ? ' (any)' : ''}</span>
      </div>
      <div className="relative h-5">
        <div className={`absolute top-1/2 -translate-y-1/2 h-1.5 w-full rounded-full ${isDark ? 'bg-white/10' : 'bg-[#2E2B27]/10'}`} />
        <div className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%` }} />
        <input type="range" aria-label={`${label} minimum`} min={min} max={max} step={step} value={lo} onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])} className={thumb} />
        <input type="range" aria-label={`${label} maximum`} min={min} max={max} step={step} value={hi} onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])} className={thumb} />
      </div>
    </div>
  );
}

export default function RunRouteFinderTab({ call, send, units, isDark, panel, label, btn, ghost, onUseRoute, onDeleteRoute, showToast, komootConnected }) {
  const [shape, setShape] = useState('any');
  const [bounds, setBounds] = useState(null); // { maxKm, maxMinutes } from the routes themselves
  const [kmRange, setKmRange] = useState(null); // in the display unit
  const [minRange, setMinRange] = useState(null);
  const [result, setResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [dupes, setDupes] = useState(null);
  const [sync, setSync] = useState(null);
  const muted = isDark ? 'text-slate-400' : 'text-[#6A645D]';
  const maxDist = bounds ? Math.ceil(units === 'mi' ? bounds.maxKm / KM_PER_MI : bounds.maxKm) : 0;
  const seq = useRef(0);

  const search = useCallback(async () => {
    const q = new URLSearchParams({ shape });
    // an end left at the slider's limit means "no limit" (so routes without a time aren't dropped)
    if (kmRange && bounds) {
      const toKmVal = (v) => (units === 'mi' ? v * KM_PER_MI : v);
      if (kmRange[0] > 0) q.set('minKm', String(toKmVal(kmRange[0])));
      if (kmRange[1] < maxDist) q.set('maxKm', String(toKmVal(kmRange[1])));
    }
    if (minRange && bounds) {
      if (minRange[0] > 0) q.set('minMinutes', String(minRange[0]));
      if (minRange[1] < bounds.maxMinutes) q.set('maxMinutes', String(minRange[1]));
    }
    const mine = ++seq.current;
    setSearching(true);
    try {
      const r = await call(`/api/planner/routes/find?${q}`);
      if (mine !== seq.current) return;
      setResult(r);
      if (!bounds && r.bounds) {
        setBounds(r.bounds);
        const md = Math.ceil(units === 'mi' ? r.bounds.maxKm / KM_PER_MI : r.bounds.maxKm);
        setKmRange([0, md]);
        setMinRange([0, r.bounds.maxMinutes]);
      }
    } catch (err) { showToast?.(err.message, 'error'); } finally { if (mine === seq.current) setSearching(false); }
  }, [call, shape, kmRange, minRange, bounds, maxDist, units, showToast]);

  const loadDupes = useCallback(async () => {
    try { setDupes(await call('/api/planner/routes/duplicates')); } catch (err) { showToast?.(err.message, 'error'); }
  }, [call, showToast]);
  const loadSync = useCallback(async () => {
    if (!komootConnected) return null;
    try { const s = await call('/api/planner/komoot/sync'); setSync(s); return s; } catch { return null; }
  }, [call, komootConnected]);

  // while descriptions are being worked out in the background, check back every few seconds
  useEffect(() => {
    if (!result?.describing) return undefined;
    const t = setTimeout(search, 5000);
    return () => clearTimeout(t);
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  // search again shortly after the sliders stop moving
  useEffect(() => { const t = setTimeout(search, 350); return () => clearTimeout(t); }, [search]);
  useEffect(() => { loadDupes(); loadSync(); }, [loadDupes, loadSync]);
  // when the unit changes, start the distance slider afresh in the new unit
  useEffect(() => { if (bounds) setKmRange([0, Math.ceil(units === 'mi' ? bounds.maxKm / KM_PER_MI : bounds.maxKm)]); }, [units]); // eslint-disable-line react-hooks/exhaustive-deps

  // follow a Komoot import while it runs
  const importing = sync?.job && !sync.job.finishedAt;
  useEffect(() => {
    if (!importing) return undefined;
    const t = setInterval(async () => {
      const s = await loadSync();
      if (s?.job?.finishedAt) { setBounds(null); search(); loadDupes(); showToast?.(`Imported ${s.job.added} Komoot route${s.job.added === 1 ? '' : 's'}${s.job.failed.length ? ` (${s.job.failed.length} failed)` : ''}`); }
    }, 2500);
    return () => clearInterval(t);
  }, [importing]); // eslint-disable-line react-hooks/exhaustive-deps

  const startImport = async () => {
    try { const r = await send('/api/planner/komoot/sync', 'POST'); setSync((s) => ({ ...s, job: r.job })); } catch (err) { showToast?.(err.message, 'error'); }
  };

  const remove = async (r) => {
    await onDeleteRoute?.(r);
    await Promise.all([search(), loadDupes()]);
  };

  const pill = (active) => `px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all ${
    active ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-transparent' : isDark ? 'border-white/10 text-slate-300 hover:bg-white/5' : 'border-[#2E2B27]/15 text-[#2E2B27] hover:bg-[#2E2B27]/5'}`;
  const sourceLabel = (r) => (r.source === 'komoot' ? `Komoot${r.account ? ` (${r.account})` : ''}` : r.source.toUpperCase());

  return (
    <div className="flex flex-col gap-4">
      {/* Komoot saved routes -> the finder */}
      {komootConnected && sync && !sync.error && (sync.missing > 0 || importing) && (
        <div className={`${panel} flex flex-wrap items-center gap-3`}>
          <Download size={16} className="text-emerald-500" />
          <div className="flex-1 min-w-[200px] text-xs">
            {importing ? (
              <>
                <div className="font-bold">Importing Komoot saved routes - {sync.job.done} of {sync.job.total}{sync.job.current ? `: ${sync.job.current}` : ''}</div>
                <div className={`h-1.5 mt-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-slate-200'}`}><div className="h-full bg-emerald-500 transition-all" style={{ width: `${(sync.job.done / Math.max(1, sync.job.total)) * 100}%` }} /></div>
              </>
            ) : (
              <span><b>{sync.missing}</b> of your {sync.saved} Komoot saved routes ({sync.account}) aren't in the finder yet.</span>
            )}
          </div>
          {!importing && <button onClick={startImport} className={btn}><Download size={13} /> Import all</button>}
        </div>
      )}

      {/* finder */}
      <div className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-sm font-black uppercase tracking-wide flex items-center gap-2"><Search size={16} className="text-emerald-500" /> Route finder</h3>
          {komootConnected && sync && !sync.missing && !importing && sync.saved != null && (
            <span className={`text-[11px] flex items-center gap-1.5 ${muted}`}><Check size={12} className="text-emerald-500" /> All {sync.saved} Komoot saved routes included
              <button onClick={() => { loadSync(); }} className="p-1 rounded hover:bg-white/10" title="Check Komoot for new saved routes"><RefreshCw size={11} /></button></span>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-5 items-end">
          <div>
            <span className={label}>Shape</span>
            <div className="flex flex-wrap gap-1.5">
              {SHAPES.map(([k, name, icon]) => { const Icon = icon; return <button key={k} onClick={() => setShape(k)} className={pill(shape === k)}><Icon size={13} /> {name}</button>; })}
            </div>
          </div>
          {bounds && kmRange && (
            <RangeSlider label="Distance" min={0} max={maxDist} step={0.5} value={kmRange} onChange={setKmRange} isDark={isDark} format={(v) => `${v} ${units}`} />
          )}
          {bounds && minRange && (
            <RangeSlider label="Time of run" min={0} max={bounds.maxMinutes} step={5} value={minRange} onChange={setMinRange} isDark={isDark} format={(v) => hm(v)} />
          )}
        </div>
        <p className={`text-[11px] mt-3 ${muted}`}>Time of run is how long you took the last time you ran each route (from your activities), or an estimate from your current fitness if you never have. Leave a slider at its ends for any.</p>

        <div className="mt-5">
          <div className={`text-xs mb-2 flex items-center gap-2 ${muted}`}>
            {searching && <RotateCw size={12} className="animate-spin" />}
            {result ? `${result.count} of ${result.total} saved route${result.total === 1 ? '' : 's'} match.` : 'Matching your routes against your runs - the first time takes a few seconds...'}
          </div>
          {result && (
            <div className="grid gap-3 md:grid-cols-2">
              {result.routes.map((r) => (
                <div key={r.id} className={`rounded-xl border p-4 ${isDark ? 'border-white/10 bg-slate-950/40' : 'border-[#2E2B27]/10 bg-[#FAF7F2]'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate" title={r.name}>{r.name}</div>
                      <div className={`text-[11px] ${muted}`}>{r.shapeLabel} · from {sourceLabel(r)}
                        {komootLink(r) && <a href={komootLink(r)} target="_blank" rel="noreferrer" className="ml-1.5 inline-flex items-center gap-0.5 text-sky-500 hover:underline">Komoot <ExternalLink size={10} /></a>}</div>
                    </div>
                    <button onClick={() => onUseRoute?.(r.id)} className={btn} title="Open this route in the Run Planner">Plan this run</button>
                  </div>
                  <MiniRouteMap path={r.mapPath} isDark={isDark} />
                  <p className="text-xs mt-2 leading-relaxed">{r.description || <span className={`italic ${muted}`}>{r.description === '' ? 'No road names found for this route.' : 'Working out the description...'}</span>}</p>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                    <div><div className={muted}>Distance</div><div className="font-black">{dist(r.distanceKm, units, 2)} {units}</div></div>
                    <div><div className={muted}>Climb</div><div className="font-black">{elev(r.gainM, units)} {elevUnit(units)} up</div><div className={`text-[10px] ${muted}`}>{elev(r.lossM, units)} {elevUnit(units)} down</div></div>
                    <div><div className={muted}>Altitude</div><div className="font-black">{elev(r.minEle, units)}-{elev(r.maxEle, units)} {elevUnit(units)}</div></div>
                    <div><div className={muted}>Last run</div><div className="font-black">{r.lastRun ? hm(r.lastRun.minutes) : 'Never'}</div><div className={`text-[10px] ${muted}`}>{r.lastRun ? `${ukDate(r.lastRun.day)} · ${paceText(r.lastRun.paceMinPerKm, units)} /${units}` : ''}</div></div>
                    <div><div className={muted}>Runs</div><div className="font-black">{r.runCount}</div>{r.fastestMinutes != null && <div className={`text-[10px] ${muted}`}>best {hm(r.fastestMinutes)}</div>}</div>
                    <div><div className={muted}>Expect now</div><div className="font-black">{hm(r.expectedMinutes)}</div><div className={`text-[10px] ${muted}`}>{r.climbPerKm != null ? `${elev(r.climbPerKm * (units === 'mi' ? KM_PER_MI : 1), units)} ${elevUnit(units)} climb per ${units}` : ''}</div></div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {result && !result.routes.length && <p className={`text-xs ${muted}`}>Nothing matches - widen the sliders or pick another shape.</p>}
        </div>
      </div>

      {/* duplicates */}
      <div className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h3 className="text-sm font-black uppercase tracking-wide flex items-center gap-2"><Copy size={16} className="text-amber-500" /> Duplicate routes</h3>
          <button onClick={loadDupes} className={ghost}><RotateCw size={13} /> Check again</button>
        </div>
        <p className={`text-[11px] mb-3 ${muted}`}>Saved routes that are the same line on the map, run the same way round (lengths within 3%, each lying on the other), whatever they are called. The oldest in each group is marked to keep. Deleting removes the copy from IMS only - to tidy Komoot itself, open the route there.</p>
        {!dupes && <p className={`text-xs ${muted}`}>Comparing routes...</p>}
        {dupes && !dupes.groups.length && <p className="text-xs flex items-center gap-1.5 text-emerald-500"><Check size={14} /> No duplicates among your {dupes.routes} saved routes.</p>}
        {dupes?.groups.map((g, gi) => (
          <div key={g[0].id} className={`rounded-xl border p-3 mb-2 ${isDark ? 'border-amber-500/20 bg-amber-500/5' : 'border-amber-600/20 bg-amber-50'}`}>
            <div className="text-xs font-bold mb-2">Group {gi + 1}: {g.length} copies · {dist(g[0].distanceKm, units, 2)} {units}, {elev(g[0].gainM, units)} {elevUnit(units)} up</div>
            {g.map((r, i) => (
              <div key={r.id} className="flex items-center justify-between gap-2 text-xs py-1">
                <span className="truncate">
                  <span className="font-semibold">{r.name}</span>
                  <span className={muted}> · {sourceLabel(r)} · saved {new Date(r.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  {komootLink(r) && <a href={komootLink(r)} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg text-sky-500 hover:bg-sky-500/10" title="Open in Komoot"><ExternalLink size={13} /></a>}
                  {i === 0
                    ? <span className="text-[10px] font-bold text-emerald-500 px-1">KEEP</span>
                    : <button onClick={() => remove(r)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10" title="Delete this copy from IMS"><Trash2 size={13} /></button>}
                </span>
              </div>
            ))}
          </div>
        ))}
        {dupes?.groups.length > 0 && <p className={`text-[11px] ${muted}`}>{dupes.duplicates} extra cop{dupes.duplicates === 1 ? 'y' : 'ies'} in all. Deleting asks first.</p>}

        {dupes?.reverses?.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-bold mb-1 flex items-center gap-1.5"><Undo2 size={13} className="text-sky-500" /> Same line, opposite direction (not duplicates)</div>
            <p className={`text-[11px] mb-2 ${muted}`}>These cover the same ground but the other way round, so the hills come in a different order.</p>
            {dupes.reverses.map(([a, b]) => (
              <div key={`${a.id}-${b.id}`} className="text-xs py-0.5">{a.name} <span className={muted}>↔</span> {b.name}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
