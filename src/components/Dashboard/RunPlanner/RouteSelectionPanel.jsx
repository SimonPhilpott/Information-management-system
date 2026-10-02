import React from 'react';
import { Mountain, RotateCw, Upload, Link2, Download, Unlink, ExternalLink, Trash2 } from 'lucide-react';
import { dist, elev, elevUnit } from '../../../utils/units';

// Route Selection, on the Route Finder tab: pick a saved route (or just a distance), add a GPX, paste a Komoot
// link, or bring routes in from your Komoot account. The chosen route is what the Run Planner plans.
export default function RouteSelectionPanel({
  panel, label, field, btn, ghost, isDark, units, routes, routeId, setRouteId, form, setForm, selected, removeRoute,
  fileRef, addGpx, busy, kForm, setKForm, addLink, komoot, loadTours, tours, tourType, tourSearch, setTourSearch,
  importTour, connectKomoot, send, setTours, loadAll,
}) {
  const [switching, setSwitching] = React.useState(false);
  return (
        <div className={panel}>
          <h2 className={`text-xs font-black uppercase tracking-wider mb-3 flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-[#2E2B27]'}`}>
            <Mountain size={13} className="text-emerald-500" />
            Route Selection
          </h2>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <select className={field} value={routeId} onChange={(e) => setRouteId(e.target.value)}>
              <option value="">No route - just a distance</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} - {dist(r.distanceKm, units)} {units}, {elev(r.gainM, units)} {elevUnit(units)} up
                </option>
              ))}
            </select>
            {!routeId && (
              <input
                className={`${field} sm:!w-40`}
                type="number"
                min="1"
                step="0.5"
                value={form.distanceKm}
                onChange={(e) => setForm({ ...form, distanceKm: e.target.value })}
                placeholder={units}
              />
            )}
          </div>

          {selected && (
            <div className={`flex flex-wrap items-center gap-2 text-[11px] mb-3 ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
              <span>
                {dist(selected.distanceKm, units)} {units} - {elev(selected.gainM, units)} {elevUnit(units)} up / {elev(selected.lossM, units)} {elevUnit(units)} down - {elev(selected.minEle, units)}-{elev(selected.maxEle, units)} {elevUnit(units)} altitude - from {selected.source}
              </span>
              {!selected.hasElevation && <span className="text-amber-500">Auto-enriching elevation profile from Open-Meteo...</span>}
              <button onClick={() => removeRoute(selected)} className="ml-auto text-red-400 flex items-center gap-1">
                <Trash2 size={12} />
                Delete
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <label className={label}>Add a GPX file</label>
              <input ref={fileRef} type="file" accept=".gpx,application/gpx+xml,text/xml" className="hidden" onChange={(e) => addGpx(e.target.files?.[0])} />
              <button onClick={() => fileRef.current?.click()} disabled={busy === 'gpx'} className={ghost}>
                {busy === 'gpx' ? <RotateCw size={13} className="animate-spin" /> : <Upload size={13} />} Choose file
              </button>
              <p className={`text-[10px] mt-1.5 ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>In Komoot: open the tour, then Share / Export as GPX.</p>
            </div>
            <div>
              <label className={label}>Or paste a Komoot tour link</label>
              <div className="flex gap-2">
                <input className={field} value={kForm.link} onChange={(e) => setKForm({ ...kForm, link: e.target.value })} placeholder="https://www.komoot.com/tour/..." />
                <button onClick={addLink} disabled={!kForm.link.trim() || busy === 'link'} className={ghost}>
                  <Link2 size={13} />
                </button>
              </div>
              <p className={`text-[10px] mt-1.5 ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>Any tour link works while your account is connected.</p>
            </div>
            <div>
              <label className={label}>Or connect your Komoot account</label>
              {komoot.connected && !switching ? (
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-[11px] text-emerald-500 font-bold">Connected{komoot.email ? ` (${komoot.email})` : ''}</span>
                  <button onClick={() => loadTours('recorded')} disabled={busy === 'tours'} className={btn} title="Your completed activities on Komoot">
                    {busy === 'tours' ? <RotateCw size={13} className="animate-spin" /> : <Download size={13} />} Completed routes
                  </button>
                  <a href="https://www.komoot.com/tours" target="_blank" rel="noreferrer" className={ghost}>
                    <ExternalLink size={13} /> Open Komoot
                  </a>
                  <button onClick={() => loadTours('planned')} disabled={busy === 'tours'} className={ghost}>
                    <Download size={13} /> Saved routes
                  </button>
                  <button onClick={() => { setKForm({ ...kForm, email: '', password: '' }); setSwitching(true); }} className={ghost} title="Sign in to a different Komoot account">
                    <RotateCw size={13} /> Switch account
                  </button>
                  <button onClick={async () => { await send('/api/planner/komoot/disconnect', 'POST'); setTours(null); loadAll(); }} className={ghost} title="Disconnect Komoot">
                    <Unlink size={13} />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {switching && (
                    <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-[#6A645D]'}`}>
                      Sign in to the other Komoot account. {komoot.email} stays connected until this one signs in. Routes you have already imported stay in Saved routes.
                    </p>
                  )}
                  <input className={field} value={kForm.email} onChange={(e) => setKForm({ ...kForm, email: e.target.value })} placeholder="Komoot email" autoComplete="off" />
                  <input className={field} type="password" value={kForm.password} onChange={(e) => setKForm({ ...kForm, password: e.target.value })} placeholder="Komoot password" autoComplete="new-password" />
                  <div className="flex gap-2">
                    <button onClick={async () => { const ok = await connectKomoot(); if (ok !== false && switching) { setSwitching(false); setTours(null); loadTours('planned'); } }} disabled={!kForm.email || !kForm.password || busy === 'komoot'} className={btn}>
                      {busy === 'komoot' ? <RotateCw size={13} className="animate-spin" /> : <Link2 size={13} />}{switching ? 'Switch to this account' : 'Connect'}
                    </button>
                    {switching && <button onClick={() => setSwitching(false)} className={ghost}>Cancel</button>}
                  </div>
                </div>
              )}
            </div>
          </div>

          {tours && (
            <div className="mt-4 max-h-72 overflow-y-auto flex flex-col gap-1.5">
              <div className="flex items-center gap-3 mb-1 sticky top-0 py-1" style={{ background: isDark ? '#0f172a' : '#FAF7F2' }}>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'opacity-70 text-slate-300' : 'text-[#2E2B27]'}`}>
                  {tourType === 'recorded' ? 'Completed routes' : 'Saved routes'} ({tours.length})
                </span>
                <input className={`${field} !w-56`} value={tourSearch} onChange={(e) => setTourSearch(e.target.value)} placeholder="Search by name..." />
              </div>
              {tours.length === 0 ? (
                <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>Nothing found here - try the other list.</p>
              ) : (
                tours
                  .filter((t) => !tourSearch.trim() || String(t.name).toLowerCase().includes(tourSearch.trim().toLowerCase()))
                  .map((t) => (
                    <div key={t.id} className={`flex items-center gap-3 p-2 rounded-lg border text-xs ${isDark ? 'border-white/5' : 'border-[#2E2B27]/10 bg-white/60'}`}>
                      <div className="min-w-0 flex-1">
                        <div className={`font-bold truncate ${isDark ? '' : 'text-[#2E2B27]'}`}>{t.name}</div>
                        <div className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-[#6A645D]'}`}>
                          {t.sport} - {t.distanceKm != null ? dist(t.distanceKm, units) : '?'} {units}
                          {t.gainM != null ? ` - ${elev(t.gainM, units)} ${elevUnit(units)} up` : ''}
                        </div>
                      </div>
                      <a href={`https://www.komoot.com/tour/${t.id}`} target="_blank" rel="noreferrer" className={ghost}>
                        <ExternalLink size={12} />
                      </a>
                      <button onClick={() => importTour(t.id)} disabled={busy === `t${t.id}`} className={ghost}>
                        {busy === `t${t.id}` ? <RotateCw size={12} className="animate-spin" /> : <Download size={12} />} Use
                      </button>
                    </div>
                  ))
              )}
            </div>
          )}
        </div>
  );
}
