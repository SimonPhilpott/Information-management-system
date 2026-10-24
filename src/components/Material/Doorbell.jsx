// Doorbell in the IMS design (24 Oct 2026): the Ring doorbell. Live - the camera's latest picture (take a new one
// with the button in the bottom right, or keep it refreshing), the connection and battery, test the bell or motion,
// and what happened recently; Recordings - the cloud clips to play or download; Settings - which alerts Ims
// announces, reconnecting, and the Ring sign-in token. The same /api/doorbell requests and live updates as before
// (Dashboard/DoorbellPortal.jsx); the chime and Ims's announcement are in doorbellSound.js.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ServicePage, { ItemCard, Empty, Fab } from './ServicePage';
import { Icon, IconButton, Btn, Sheet, TextArea, Tabs, FilterChip, useSnack, Spinner } from '../HomebrewBeta/ui';
import { useSystemEvents } from '../../hooks/useSystemEvents';
import { playWebChime, announceAlert, markTestChime } from './doorbellSound';

const ago = (ms) => { if (!ms) return 'never'; const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
const at = (ms) => new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const KIND = { ding: ['Someone rang the bell', 'doorbell'], motion: ['Movement', 'camera'] };

function Body() {
  const snack = useSnack();
  const [tab, setTab] = useState('live');
  const [status, setStatus] = useState(null);
  const [events, setEvents] = useState([]);
  const [recs, setRecs] = useState(null);
  const [filter, setFilter] = useState('all');
  const [settings, setSettings] = useState({ dingEnabled: true, motionEnabled: true });
  const [snap, setSnap] = useState({});
  const [snapAt, setSnapAt] = useState({});
  const [snapBusy, setSnapBusy] = useState({});
  const [auto, setAuto] = useState(false);
  const [testing, setTesting] = useState('');
  const [busy, setBusy] = useState('');
  const [video, setVideo] = useState(null); // { rec, url }
  const [tokenOpen, setTokenOpen] = useState(false);
  const [token, setToken] = useState('');
  const autoRef = useRef(null);

  const fetchStatus = useCallback(async () => { try { const r = await fetch('/api/doorbell/status'); if (r.ok) setStatus(await r.json()); } catch { /* keeps the last */ } }, []);
  const fetchSettings = useCallback(async () => { try { const r = await fetch('/api/doorbell/settings'); if (r.ok) { const d = await r.json(); setSettings({ dingEnabled: d.dingEnabled !== false, motionEnabled: d.motionEnabled !== false }); } } catch { /* keeps */ } }, []);
  const fetchEvents = useCallback(async () => { try { const r = await fetch('/api/doorbell/events?limit=30'); if (r.ok) setEvents((await r.json()).events || []); } catch { /* keeps */ } }, []);
  const fetchRecs = useCallback(async () => { try { const r = await fetch('/api/doorbell/recordings?limit=40'); if (r.ok) setRecs((await r.json()).events || []); else setRecs((x) => x || []); } catch { setRecs((x) => x || []); } }, []);
  const snapshot = useCallback(async (id) => {
    if (!id) return;
    setSnapBusy((b) => ({ ...b, [id]: true }));
    try {
      const r = await fetch(`/api/doorbell/snapshot/${id}?t=${Date.now()}`);
      if (!r.ok) throw new Error('The camera didn\'t send a picture.');
      const url = URL.createObjectURL(await r.blob());
      setSnap((s) => ({ ...s, [id]: url }));
      setSnapAt((s) => ({ ...s, [id]: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }));
    } catch (e) { snack(e.message, { error: true }); } finally { setSnapBusy((b) => ({ ...b, [id]: false })); }
  }, [snack]);

  // live: the bell or motion, as it happens
  useSystemEvents('doorbell:ding', (alert) => {
    fetchStatus(); fetchEvents(); fetchRecs();
    if (alert?.event) {
      const muted = alert.event === 'ding' ? !settings.dingEnabled : !settings.motionEnabled;
      if (!muted) announceAlert(alert);
      snack(`${alert.event === 'ding' ? 'Someone\'s at the door' : 'Movement'}: ${alert.cameraName}${alert.phrase ? `. ${alert.phrase}` : ''}`);
      if (alert.cameraId) snapshot(alert.cameraId);
    }
  }, [fetchStatus, fetchEvents, fetchRecs, snapshot, settings]);
  useSystemEvents('doorbell:cleared', () => { fetchStatus(); }, [fetchStatus]);
  useEffect(() => { fetchStatus(); fetchEvents(); fetchRecs(); fetchSettings(); const t = setInterval(() => { fetchStatus(); fetchEvents(); }, 60000); return () => clearInterval(t); }, [fetchStatus, fetchEvents, fetchRecs, fetchSettings]);
  const cam = status?.cameras?.[0];
  useEffect(() => { if (cam && !snap[cam.id] && !snapBusy[cam.id]) snapshot(cam.id); }, [cam]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (auto && cam) autoRef.current = setInterval(() => snapshot(cam.id), 5000);
    return () => { if (autoRef.current) { clearInterval(autoRef.current); autoRef.current = null; } };
  }, [auto, cam, snapshot]);

  const toggle = async (key) => {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    try { const r = await fetch('/api/doorbell/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) }); if (r.ok) snack(`${key === 'dingEnabled' ? 'The bell' : 'Movement'}: Ims ${next[key] ? 'will' : 'won\'t'} announce it.`); } catch { snack('That didn\'t save.', { error: true }); }
  };
  const reconnect = async () => {
    setBusy('reconnect');
    try { const d = await (await fetch('/api/doorbell/reconnect', { method: 'POST' })).json(); snack(d.success ? 'Reconnected to Ring.' : d.lastError || 'It didn\'t reconnect.', { error: !d.success }); await fetchStatus(); } catch (e) { snack(e.message, { error: true }); } finally { setBusy(''); }
  };
  const saveToken = async () => {
    setBusy('token');
    try {
      const d = await (await fetch('/api/doorbell/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token.trim() }) })).json();
      if (!d.success) throw new Error(d.error || 'Ring didn\'t accept that token.');
      snack('Ring token checked and saved.'); setTokenOpen(false); setToken(''); fetchStatus(); fetchEvents(); fetchRecs();
    } catch (e) { snack(e.message, { error: true }); } finally { setBusy(''); }
  };
  const test = async (type) => {
    setTesting(type);
    try {
      playWebChime(type); markTestChime();
      const d = await (await fetch('/api/doorbell/test-alert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventType: type, cameraName: 'Front Door' }) })).json();
      if (!d.success) throw new Error(d.error || 'The test didn\'t run.');
      announceAlert(d.alert); snack(`Test ${type === 'ding' ? 'bell' : 'movement'}: chime and Ims's voice played.`);
      fetchStatus(); fetchEvents(); fetchRecs();
    } catch (e) { snack(e.message, { error: true }); } finally { setTesting(''); }
  };
  const play = async (rec) => {
    setVideo({ rec, url: null });
    try { const r = await fetch(`/api/doorbell/recordings/${rec.id}/url`); if (r.ok) { const d = await r.json(); setVideo((v) => (v?.rec.id === rec.id ? { ...v, url: d.url } : v)); } } catch { /* the stream works without it */ }
  };

  const connected = status?.status === 'connected';
  const shown = (recs || []).filter((r) => filter === 'all' || (filter === 'person' ? r.personDetected : r.kind === filter));
  return (
    <>
      {status && !connected && (
        <div className="imsm-banner"><Icon n="info" size={20} /><span style={{ flex: 1 }}>{status.configured ? `Not connected to Ring${status.lastError ? `: ${status.lastError}` : ''}.` : 'Ring isn\'t set up yet. Add your Ring token in Settings.'}</span>
          {status.configured ? <Btn busy={busy === 'reconnect'} onClick={reconnect}>Reconnect</Btn> : <Btn onClick={() => setTokenOpen(true)}>Add the token</Btn>}</div>
      )}
      <Tabs value={tab} onChange={setTab} tabs={[['live', 'Live', 'camera'], ['recordings', recs ? `Recordings (${recs.length})` : 'Recordings', 'play'], ['settings', 'Settings', 'tune']]} />

      {tab === 'live' && (
        <>
          {!status ? <div className="imsm-empty"><Spinner /></div> : (
            <div className="imsm-door">
              <section className="imsm-card shot">
                <div className="frame">
                  {cam && snap[cam.id] ? <img src={snap[cam.id]} alt={`The latest picture from ${cam.name}`} /> : <div className="none">{snapBusy[cam?.id] ? <Spinner /> : <><Icon n="camera" size={40} /><span>No picture yet</span></>}</div>}
                  {cam && snapAt[cam.id] && <span className="stamp">{cam.name} · {snapAt[cam.id]}</span>}
                </div>
                <label className="imsm-row" style={{ cursor: 'pointer' }}><span className="imsm-switch"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /><i /></span>Keep it refreshing (every 5 seconds)</label>
              </section>
              <div className="side">
                <section className="imsm-card">
                  <h3>{cam?.name || 'The doorbell'}</h3>
                  <div className="chips wrap">
                    <span className={`tag ${connected ? 'good' : 'bad'}`}>{connected ? 'Connected' : 'Not connected'}</span>
                    {cam?.batteryLevel != null && <span className={`tag ${cam.batteryLevel < 20 ? 'bad' : cam.batteryLevel < 40 ? 'warn' : ''}`}>Battery {cam.batteryLevel}%</span>}
                  </div>
                  <p className="muted" style={{ margin: 0 }}>Last ring {ago(status.lastDingTime)}. Last movement {ago(status.lastMotionTime)}.</p>
                  <div className="imsm-row">
                    <Btn kind="tonal" icon="doorbell" busy={testing === 'ding'} onClick={() => test('ding')}>Test the bell</Btn>
                    <Btn kind="tonal" icon="camera" busy={testing === 'motion'} onClick={() => test('motion')}>Test movement</Btn>
                  </div>
                </section>
                <section className="imsm-card">
                  <h3>Recently</h3>
                  {!events.length ? <p className="muted" style={{ margin: 0 }}>Nothing yet.</p> : (
                    <div className="imsm-timeline">
                      {events.slice(0, 12).map((e) => <div key={e.id} className="ev"><span className="when">{at(e.created_at)}</span><span className="what">{(KIND[e.event_type] || [e.event_type])[0]}</span><span>{e.camera_name}{e.battery_level != null ? <span className="muted"> · {e.battery_level}%</span> : null}</span></div>)}
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'recordings' && (
        <>
          <div className="chips wrap">
            {[['all', 'Everything'], ['ding', 'The bell'], ['motion', 'Movement'], ['person', 'A person']].map(([k, l]) => <FilterChip key={k} on={filter === k} onClick={() => setFilter(k)}>{l}</FilterChip>)}
          </div>
          {recs == null ? <div className="imsm-empty"><Spinner /></div> : !shown.length ? <Empty icon="play" title="No recordings" /> : (
            <div className="imsm-list">
              {shown.map((r) => (
                <ItemCard key={r.id} icon={(KIND[r.kind] || KIND.motion)[1]} tone={r.kind === 'ding' ? '' : 'quiet'} title={(KIND[r.kind] || [r.kind])[0]} meta={`${r.cameraName}, ${r.dateFormatted} at ${r.timeFormatted}`}
                  tags={<>{r.personDetected && <span className="tag good">A person</span>}{r.recordingStatus && r.recordingStatus !== 'ready' && <span className="tag quiet">{r.recordingStatus}</span>}</>} onClick={() => play(r)}>
                  <IconButton icon="play" label="Play it" onClick={() => play(r)} />
                </ItemCard>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'settings' && (
        <>
          <section className="imsm-card">
            <h3>What Ims announces</h3>
            <label className="imsm-row" style={{ cursor: 'pointer' }}><span className="imsm-switch"><input type="checkbox" checked={settings.dingEnabled} onChange={() => toggle('dingEnabled')} /><i /></span>When someone rings the bell</label>
            <label className="imsm-row" style={{ cursor: 'pointer' }}><span className="imsm-switch"><input type="checkbox" checked={settings.motionEnabled} onChange={() => toggle('motionEnabled')} /><i /></span>When the camera sees movement</label>
            <p className="muted" style={{ margin: 0 }}>With the Box-3's top button on mute (Ims's silent mode), nothing is announced.</p>
          </section>
          <section className="imsm-card">
            <h3>Ring</h3>
            <p className="muted" style={{ margin: 0 }}>{status?.configured ? `Signed in to Ring, ${status.cameraCount || 0} camera${status?.cameraCount === 1 ? '' : 's'}.` : 'Not set up yet.'}</p>
            <div className="imsm-row"><Btn kind="tonal" icon="sync" busy={busy === 'reconnect'} onClick={reconnect}>Reconnect</Btn><Btn kind="tonal" icon="edit" onClick={() => setTokenOpen(true)}>Change the Ring token</Btn></div>
          </section>
        </>
      )}

      <Sheet open={Boolean(video)} onClose={() => setVideo(null)} title={video ? `${(KIND[video.rec.kind] || [video.rec.kind])[0]}, ${video.rec.dateFormatted} at ${video.rec.timeFormatted}` : ''} wideWidth="860px"
        footer={video?.url ? <div className="imsm-row end"><a className="btn tonal sl" href={video.url} download={`ring_${video.rec.id}.mp4`} target="_blank" rel="noreferrer"><Icon n="download" size={18} />Download</a></div> : null}>
        {video && (
          <video key={video.rec.id} controls autoPlay playsInline src={`/api/doorbell/recordings/${video.rec.id}/video`} style={{ width: '100%', borderRadius: 16, background: '#000' }}>
            {video.url && <source src={video.url} type="video/mp4" />}
          </video>
        )}
      </Sheet>
      <Sheet open={tokenOpen} onClose={() => setTokenOpen(false)} title="The Ring sign-in token"
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setTokenOpen(false)}>Cancel</Btn><Btn icon="check" busy={busy === 'token'} disabled={!token.trim()} onClick={saveToken}>Check and save</Btn></div>}>
        <div className="imsm-form">
          <p style={{ margin: 0 }}>Make one with Ring's own tool, in a terminal:</p>
          <code className="imsm-code">npx -p ring-client-api ring-auth-cli</code>
          <p className="muted" style={{ margin: 0 }}>Sign in with your Ring email, password and the code Ring sends, then paste what it gives you here.</p>
          <TextArea label="The token" rows={4} value={token} onChange={setToken} />
        </div>
      </Sheet>
      {tab === 'live' && cam && <Fab label="New picture" icon="camera" onClick={() => snapshot(cam.id)} disabled={snapBusy[cam.id]} />}
    </>
  );
}

export default function Doorbell({ theme = 'light', onThemeToggle, setCurrentPath }) {
  return (
    <ServicePage title="Doorbell" icon="doorbell" accent="orange" theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} wide sub="The Ring doorbell: the camera, what happened, and what Ims announces.">
      <Body />
    </ServicePage>
  );
}
