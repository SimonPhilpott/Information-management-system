// Run planner: Add a route - the green button on Routes opens this (24 Oct, Simon: "a popup window to access
// those features, and give it a name to be added to the list of routes"). Three ways in, the same requests as the
// classic page: a GPX file, a Komoot tour link, or a tour from your Komoot account (completed or saved). Whatever
// you call it is the name in your list (a Komoot re-import keeps your name).
import React, { useRef, useState } from 'react';
import { Icon, IconButton, Btn, Sheet, TextField, Segmented, useSnack } from '../HomebrewBeta/ui';
import { dist, elev, elevUnit } from '../../utils/units';
import { Banner } from './PlanSection';

export default function AddRoute({ open, onClose, rp, onAdded, start = 'file' }) {
  const snack = useSnack();
  const [how, setHow] = useState(start);
  React.useEffect(() => { if (open) setHow(start); }, [open, start]);
  const [name, setName] = useState('');
  const [file, setFile] = useState(null);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState(null);
  const [switching, setSwitching] = useState(false);
  const [creds, setCreds] = useState({ email: '', password: '' });
  const [type, setType] = useState('recorded');
  const [tours, setTours] = useState(null);
  const [q, setQ] = useState('');
  const fileRef = useRef(null);
  const k = rp.komoot || {};

  const done = async (route) => {
    let r = route;
    // your name for it, if you gave one
    if (name.trim() && name.trim() !== r.name) { try { r = (await rp.send(`/api/planner/routes/${r.id}`, 'PATCH', { name: name.trim() })).route || r; } catch { /* keeps its own name */ } }
    await rp.loadAll();
    snack(`Added ${r.name}: ${dist(r.distanceKm, rp.units, 1)} ${rp.units}.`, { action: { label: 'Open it', onClick: () => onAdded?.(r) } });
    setName(''); setFile(null); setLink('');
    onClose();
  };
  const run = async (key, fn) => { setBusy(key); setErr(null); try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(''); } };

  const addFile = () => run('file', async () => {
    const d = await rp.send('/api/planner/routes/gpx', 'POST', { gpx: await file.text(), name: name.trim() || file.name.replace(/\.gpx$/i, '') });
    await done(d.route);
  });
  const addLink = () => run('link', async () => { const d = await rp.send('/api/planner/routes/komoot-link', 'POST', { link: link.trim() }); await done(d.route); });
  const connect = () => run('connect', async () => {
    const d = await rp.send('/api/planner/komoot/connect', 'POST', creds);
    rp.setKomoot(d); setCreds({ email: '', password: '' }); setSwitching(false); setTours(null);
    snack(`Komoot connected${d.email ? ` as ${d.email}` : ''}.`);
  });
  const load = (t) => run('tours', async () => { setType(t); setTours((await rp.call(`/api/planner/komoot/tours?type=${t}`)).tours || []); });
  const importTour = (t) => run(`t${t.id}`, async () => { const d = await rp.send('/api/planner/komoot/import', 'POST', { tourId: t.id }); await done(d.route); });
  const disconnect = () => run('disconnect', async () => { await rp.send('/api/planner/komoot/disconnect', 'POST'); setTours(null); await rp.loadAll(); });

  const shown = (tours || []).filter((t) => !q.trim() || String(t.name).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Sheet open={open} onClose={onClose} title="Add a route" wideWidth="680px">
      <div className="rpb-addroute">
        <TextField label="Call it (optional)" value={name} onChange={setName} help="The name it has in your list of routes. Leave it blank to keep the route's own name." />
        <Segmented label="Where it comes from" value={how} onChange={(v) => { setHow(v); setErr(null); }} options={[['file', 'A GPX file'], ['link', 'A Komoot link'], ['komoot', 'Your Komoot']]} />
        {err && <Banner tone="warn" title="That didn't work">{err}</Banner>}

        {how === 'file' && (
          <div className="rpb-addpane">
            <p className="muted">From Komoot, Strava, Garmin or anywhere else that exports GPX. In Komoot: open the tour, then Share, then Export as GPX.</p>
            <input ref={fileRef} type="file" accept=".gpx,application/gpx+xml,text/xml" hidden onChange={(e) => { const f = e.target.files?.[0] || null; setFile(f); if (f && !name.trim()) setName(f.name.replace(/\.gpx$/i, '')); }} />
            <div className="rpb-acts start">
              <Btn kind="tonal" icon="upload" onClick={() => fileRef.current?.click()}>{file ? file.name.slice(0, 36) : 'Choose the file'}</Btn>
              <Btn icon="add" busy={busy === 'file'} disabled={!file} onClick={addFile}>Add it</Btn>
            </div>
          </div>
        )}

        {how === 'link' && (
          <div className="rpb-addpane">
            <p className="muted">Paste the tour's link from Komoot. Any tour link works while your Komoot account is connected.</p>
            <TextField label="Komoot link" value={link} onChange={setLink} inputMode="url" placeholder="https://www.komoot.com/tour/…" />
            <div className="rpb-acts start"><Btn icon="add" busy={busy === 'link'} disabled={!/komoot\./i.test(link)} onClick={addLink}>Add it</Btn></div>
          </div>
        )}

        {how === 'komoot' && (
          <div className="rpb-addpane">
            {k.connected && !switching ? (
              <>
                <div className="rpb-runrow">
                  <span className="txt"><b>Connected to Komoot</b><span className="muted">{k.email || ''}</span></span>
                  <a className="btn text sl" href="https://www.komoot.com/tours" target="_blank" rel="noreferrer"><Icon n="open" size={18} />Open Komoot</a>
                  <Btn kind="text" onClick={() => setSwitching(true)}>Switch account</Btn>
                  <IconButton icon="linkoff" label="Disconnect Komoot" onClick={disconnect} />
                </div>
                <Segmented label="Which tours" value={tours ? type : ''} onChange={load} options={[['recorded', 'Completed'], ['planned', 'Saved']]} />
                {busy === 'tours' && <p className="muted">Fetching your tours…</p>}
                {tours && (
                  <>
                    <div className="search"><Icon n="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${tours.length} tours`} aria-label="Search your tours" /></div>
                    <div className="rpb-tours">
                      {!shown.length && <p className="muted">No tours match.</p>}
                      {shown.slice(0, 80).map((t) => (
                        <div key={t.id} className="rpb-card rpb-runrow">
                          <span className="txt"><b>{t.name}</b><span className="muted">{t.sport} · {t.distanceKm != null ? `${dist(t.distanceKm, rp.units, 1)} ${rp.units}` : '?'}{t.gainM != null ? ` · ${elev(t.gainM, rp.units)} ${elevUnit(rp.units)} up` : ''}</span></span>
                          <a className="ib sl" href={`https://www.komoot.com/tour/${t.id}`} target="_blank" rel="noreferrer" aria-label={`Open ${t.name} on Komoot`}><Icon n="open" /></a>
                          <Btn kind="tonal" icon="add" busy={busy === `t${t.id}`} onClick={() => importTour(t)}>Add</Btn>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <p className="muted">{switching ? `Sign in to the other account. ${k.email || 'The current one'} stays connected until this one signs in.` : 'Sign in once with your Komoot account to pick from your completed and saved tours.'}</p>
                <TextField label="Komoot email" type="email" value={creds.email} onChange={(v) => setCreds({ ...creds, email: v })} autoComplete="off" />
                <TextField label="Komoot password" type="password" value={creds.password} onChange={(v) => setCreds({ ...creds, password: v })} autoComplete="new-password" />
                <div className="rpb-acts start">
                  {switching && <Btn kind="text" onClick={() => setSwitching(false)}>Cancel</Btn>}
                  <Btn icon="link" busy={busy === 'connect'} disabled={!creds.email || !creds.password} onClick={connect}>{switching ? 'Switch to this account' : 'Connect'}</Btn>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
