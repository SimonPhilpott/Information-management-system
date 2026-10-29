// Device Health in the IMS design (24 Oct 2026): the desk unit (ESP32-S3-BOX-3) live: whether it's online, each of
// its parts, Wi-Fi, memory, uptime and reconnects with their trends, processor load per core, firmware built and sent
// over Wi-Fi, and the live console. Update the desk is the button in the bottom right. The same /api/device-health
// requests and log stream as before (Dashboard/DeviceHealthPortal.jsx).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ServicePage, { Fab } from './ServicePage';
import { Icon, IconButton, Btn, TextField, FilterChip, Confirm, useSnack, Spinner } from '../HomebrewBeta/ui';

const FILTERS = [['all', 'Everything'], ['device', 'Desk'], ['camera', 'Camera'], ['ota', 'Updates'], ['build', 'Builds'], ['server', 'Server']];
const SHORTCUTS = [['status', 'status'], ['heap', 'heap'], ['reboot', 'reboot'], ['camera on', 'camera on'], ['camera off', 'camera off'], ['flash usb', 'flash usb (COM3)']];

function uptime(s) {
  if (s == null || Number.isNaN(s)) return '–';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} d ${h} h ${m} min`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min ${Math.floor(s % 60)} s`;
}
function bytes(b) {
  if (b == null || Number.isNaN(b)) return '–';
  if (b >= 1048576) return `${(b / 1048576).toFixed(2)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}

function Spark({ data = [], tone = 'primary' }) {
  const v = (data || []).map((d) => Number(d) || 0);
  if (v.length < 2) return <span className="imsm-spark empty">no trend yet</span>;
  const min = Math.min(...v), max = Math.max(...v), range = max - min || 1, w = 120, h = 32;
  const y = (x) => h - ((x - min) / range) * (h - 6) - 3;
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${y(x).toFixed(1)}`).join(' ');
  return (
    <svg className={`imsm-spark ${tone}`} viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <polyline points={pts} fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={w} cy={y(v[v.length - 1])} r="3.5" />
    </svg>
  );
}

function Core({ pct, label }) {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  const r = 36, c = 2 * Math.PI * r;
  const tone = v >= 85 ? 'bad' : v >= 60 ? 'mid' : 'good';
  return (
    <div className={`imsm-core ${tone}`}>
      <svg viewBox="0 0 92 92" width="92" height="92">
        <circle cx="46" cy="46" r={r} className="tr" fill="none" strokeWidth="10" />
        <circle cx="46" cy="46" r={r} className="fg" fill="none" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 46 46)" />
        <text x="46" y="52" textAnchor="middle">{pct == null ? '–' : `${v}%`}</text>
      </svg>
      <small>{label}</small>
    </div>
  );
}

function Body() {
  const snack = useSnack();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [follow, setFollow] = useState(true);
  const [cmd, setCmd] = useState('');
  const [running, setRunning] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [portData, setPortData] = useState(null);
  const [restarting, setRestarting] = useState(null);
  const term = useRef(null);

  const loadPorts = useCallback(async () => {
    try {
      const res = await fetch('/api/system/ports');
      if (res.ok) {
        const d = await res.json();
        if (d.success) setPortData(d);
      }
    } catch (_) {}
  }, []);

  const handleRestart = async (target) => {
    setRestarting(target);
    try {
      const res = await fetch(`/api/system/restart/${target}`, { method: 'POST' });
      const d = await res.json();
      snack(d.message || `Restart initiated for ${target}`);
      setTimeout(loadPorts, 3000);
    } catch (e) {
      snack(`Failed: ${e.message}`, { error: true });
    }
    setRestarting(null);
  };

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/device-health?hours=24');
      if (!r.ok) throw new Error(`The server said ${r.status}.`);
      const j = await r.json();
      if (j.success) { setData(j); setError(null); } else setError(j.error || 'The desk\'s health couldn\'t be read.');
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => {
    load();
    loadPorts();
    const t = setInterval(() => { load(); loadPorts(); }, 10000);
    const es = new EventSource('/api/device-health/stream');
    es.onmessage = (ev) => { try { const it = JSON.parse(ev.data); if (it?.line) setLogs((p) => { const n = [...p, it]; return n.length > 2000 ? n.slice(-2000) : n; }); } catch { /* skip a bad line */ } };
    return () => { clearInterval(t); es.close(); };
  }, [load, loadPorts]);
  useEffect(() => { if (follow && term.current) term.current.scrollTop = term.current.scrollHeight; }, [logs, follow]);

  const send = async (c) => {
    const command = (c || cmd).trim();
    if (!command) return;
    setRunning(true);
    try {
      const j = await (await fetch('/api/device-health/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command }) })).json();
      if (!j.success) throw new Error(j.error || 'The command failed.');
      snack(j.message || 'Done.');
      if (!c) setCmd('');
      load();
    } catch (e) { snack(e.message, { error: true }); }
    setRunning(false);
  };
  const cur = data?.current || {};
  const fw = data?.firmware || {};
  const spark = data?.sparklines || {};
  const online = Boolean(data?.isOnline);
  const ota = fw.otaState?.status;
  const update = () => setConfirm({ title: 'Update the desk over Wi-Fi?', body: `The firmware just built is sent to the desk at ${cur.ipAddress || '192.168.1.92'}, and it restarts when it's done.`, okLabel: 'Update it', onOk: () => send('update') });
  const reboot = () => setConfirm({ title: 'Restart the desk?', body: 'It restarts over Wi-Fi and is back in about a minute.', okLabel: 'Restart it', onOk: () => send('reboot') });
  const shown = logs.filter((l) => filter === 'all' || l.type === filter);
  const asText = () => shown.map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.line}`).join('\n');
  const download = () => {
    const url = URL.createObjectURL(new Blob([asText()], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = `box3_terminal_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const rssi = cur.rssi;
  const [wq, wt] = rssi == null ? ['No signal', 'bad'] : rssi > -60 ? ['Excellent', 'good'] : rssi > -70 ? ['Good', 'good'] : rssi > -80 ? ['Fair', 'warn'] : ['Weak', 'bad'];

  if (!data && !error) return <div className="imsm-empty"><Spinner /></div>;
  return (
    <>
      <div className={`imsm-live-dev ${online ? 'on' : 'off'}`}>
        <span className="dot" />
        <span className="txt">
          <b>{online ? 'The desk is online' : 'The desk is offline or asleep'}</b>
          <small>{data?.lastReportSecondsAgo != null ? `Last heard from ${data.lastReportSecondsAgo} s ago` : 'Waiting for it to report in'}{cur.ipAddress ? ` · ${cur.ipAddress}` : ''}</small>
        </span>
        <Btn kind="text" icon="sync" onClick={reboot}>Restart it</Btn>
      </div>
      {error && <div className="imsm-banner"><Icon n="warn" size={22} /><span>{error}</span></div>}

      <h2 className="imsm-h2">Its parts</h2>
      <div className="imsm-subs">
        {(data?.subsystems || []).map((s) => (
          <div key={s.id} className="sub" style={{ '--c': s.color }}>
            <span className="k"><i />{s.name}</span>
            <b>{s.badge}</b>
            <small title={s.detail}>{s.detail}</small>
          </div>
        ))}
      </div>

      <div className="imsm-stats four">
        <div className="imsm-stat"><span className="k"><Icon n="wifi" size={16} />Wi-Fi signal</span><b>{rssi ?? '–'} <small>dBm</small></b><span className="s"><span className={`tag ${wt}`}>{wq}</span></span><Spark data={spark.wifiRssi} /></div>
        <div className="imsm-stat"><span className="k"><Icon n="chart" size={16} />Free memory</span><b>{bytes(cur.freeHeap)}</b><span className="s">Lowest {bytes(cur.minFreeHeap)}; internal RAM free {bytes(cur.intFreeHeap)}</span><Spark data={spark.freeHeap} /></div>
        <div className="imsm-stat"><span className="k"><Icon n="timer" size={16} />Up for</span><b>{uptime(cur.uptimeSec)}</b><span className="s">Start {cur.bootCount || 1}; last restart: {cur.resetReason || 'power on'}</span><Spark data={spark.uptimeSeconds} /></div>
        <div className={`imsm-stat ${cur.reconnectCount ? 'bad' : ''}`}><span className="k"><Icon n="sync" size={16} />Reconnects</span><b>{cur.reconnectCount || 0}</b><span className="s">{cur.audioUnderruns || 0} audio gaps; last error: {cur.lastError || 'none'}</span><Spark data={spark.reconnectCount} tone="bad" /></div>
      </div>

      <section className="imsm-card">
        <div className="imsm-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h3><Icon n="sync" size={20} />IMS Backend Ports & Remote Restarts</h3>
          <Btn kind="tonal" icon="sync" busy={restarting === 'all'} disabled={Boolean(restarting)} onClick={() => handleRestart('all')}>
            {restarting === 'all' ? 'Restarting All…' : 'Restart All Services'}
          </Btn>
        </div>
        <p className="muted" style={{ margin: '4px 0 12px' }}>
          Live status of host background processes. Tapping restart cleanly terminates and rebinds the port on your PC.
        </p>
        <div className="imsm-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
          {(portData?.ports || [
            { id: '6001', name: 'IMS Main UI', port: 6001, status: 'online' },
            { id: '3001', name: 'PDF KB API', port: 3001, status: 'online' },
            { id: '3002', name: 'Hardware Audio', port: 3002, status: 'online' },
            { id: '3003', name: 'Camera HTTP', port: 3003, status: 'online' },
            { id: '3232', name: 'ESP32 OTA', port: 3232, status: 'online' }
          ]).map((p) => (
            <div key={p.id} className={`imsm-stat ${p.status === 'online' ? '' : 'bad'}`}>
              <span className="k">{p.name}</span>
              <b style={{ fontSize: 15 }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: p.status === 'online' ? '#2ed573' : '#ff4757', marginRight: 6 }} />
                Port {p.port}
              </b>
              <span className="s" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span>{p.status === 'online' ? 'Listening' : 'Offline'}</span>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: 'var(--imsm-primary, #4a90e2)', cursor: 'pointer', fontSize: 12, padding: '2px 4px', textDecoration: 'underline' }}
                  disabled={Boolean(restarting)}
                  onClick={() => handleRestart(p.id)}
                >
                  {restarting === p.id ? '…' : '↻ Restart'}
                </button>
              </span>
            </div>
          ))}
          <div className={`imsm-stat ${portData?.ngrok?.status === 'online' ? '' : 'bad'}`}>
            <span className="k">Public Tunnel</span>
            <b style={{ fontSize: 14 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: portData?.ngrok?.status === 'online' ? '#2ed573' : '#ff4757', marginRight: 6 }} />
              simon-ims
            </b>
            <span className="s" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <span>{portData?.ngrok?.status === 'online' ? 'Tunnel Open' : 'Offline'}</span>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--imsm-primary, #4a90e2)', cursor: 'pointer', fontSize: 12, padding: '2px 4px', textDecoration: 'underline' }}
                disabled={Boolean(restarting)}
                onClick={() => handleRestart('ngrok')}
              >
                {restarting === 'ngrok' ? '…' : '↻ Restart'}
              </button>
            </span>
          </div>
        </div>
      </section>

      <section className="imsm-card">
        <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
          <h3><Icon n="tune" size={20} />Processor load</h3>
          <span className="muted">{data?.cpu ? `${Math.max(0, Math.round((Date.now() - data.cpu.at) / 1000))} s ago` : 'Waiting for the desk (it needs the firmware that reports load)'}</span>
        </div>
        <div className="imsm-cpu">
          <div className="cores"><Core pct={data?.cpu?.c0} label="Core 0" /><Core pct={data?.cpu?.c1} label="Core 1" /></div>
          <div className="tasks">
            <span className="lbl">Busiest in the last 5 s</span>
            {!(data?.cpu?.top || []).length ? <p className="muted">Nothing above 1%.</p> : data.cpu.top.map((t) => (
              <div key={t.name} className="task">
                <code title={t.name}>{t.name}</code>
                <small>{t.core == null ? 'either core' : `core ${t.core}`}</small>
                <span className="trk"><i style={{ width: `${Math.min(100, t.pct)}%` }} /></span>
                <b>{t.pct}%</b>
              </div>
            ))}
            {data?.cpu?.history?.length > 1 && (
              <div className="imsm-row" style={{ marginTop: 8 }}>
                <span className="lbl">Last 10 min</span>
                <Spark data={data.cpu.history.map((h) => h.c0)} /><small className="muted">core 0</small>
                <Spark data={data.cpu.history.map((h) => h.c1)} tone="alt" /><small className="muted">core 1</small>
              </div>
            )}
            <p className="muted">Core 0 runs Wi-Fi, the microphone and the speaker. Core 1 runs the main loop (the voice link and the screen) and the camera's USB and upload.</p>
          </div>
        </div>
      </section>

      <section className="imsm-card">
        <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
          <h3><Icon n="bolt" size={20} />Firmware over Wi-Fi</h3>
          <Btn kind="tonal" icon="tune" busy={ota === 'building'} disabled={running || ota === 'building'} onClick={() => send('build')}>{ota === 'building' ? 'Building…' : 'Build the firmware'}</Btn>
        </div>
        {ota && ota !== 'idle' && (
          <div className="imsm-ota">
            <div className="imsm-row" style={{ justifyContent: 'space-between' }}><b>{fw.otaState.message || ota}</b><span>{fw.otaState.progress || 0}%</span></div>
            <span className="trk"><i style={{ width: `${Math.min(100, fw.otaState.progress || 0)}%` }} /></span>
          </div>
        )}
        <div className="imsm-stats">
          <div className="imsm-stat"><span className="k">Built and ready</span><b className="imsm-mono" style={{ fontSize: 20 }}>{fw.builtVersion || 'none'}</b><span className="s">{bytes(fw.binary?.size)} · SHA-256 {fw.binary?.shortHash || 'n/a'}</span></div>
          <div className={`imsm-stat ${fw.canUpdate ? '' : 'bad'}`}><span className="k">Safe to update now?</span><b>{fw.canUpdate ? 'Yes' : 'Not now'}</b><span className="s">{fw.canUpdate ? 'The desk is idle.' : fw.updateBlockedReason || ''}</span></div>
        </div>
        {fw.history?.length > 0 && (
          <details className="imsm-fold" style={{ margin: 0 }}>
            <summary><Icon n="list" size={20} /><span>Past updates ({fw.history.length})</span><Icon n="down" size={22} /></summary>
            <ul className="imsm-log">
              {fw.history.map((h) => (
                <li key={h.id}><span className="t">{new Date(h.timestamp).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span><span className="m">{h.ip} · {h.duration_sec} s · {bytes(h.size_bytes)}</span><span className={`tag ${h.status === 'SUCCESS' ? 'good' : 'bad'}`}>{h.status === 'SUCCESS' ? 'Worked' : 'Failed'}</span></li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="imsm-card">
        <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
          <h3><Icon n="doc" size={20} />Live console</h3>
          <span className="imsm-row" style={{ gap: 0 }}>
            <IconButton icon={follow ? 'pause' : 'play'} label={follow ? 'Stop following the newest' : 'Follow the newest'} onClick={() => setFollow(!follow)} />
            <IconButton icon="copy" label="Copy what's shown" onClick={() => { navigator.clipboard.writeText(asText()); snack('Copied.'); }} />
            <IconButton icon="download" label="Save as a text file" onClick={download} />
            <IconButton icon="del" label="Clear the console" onClick={() => setLogs([])} />
          </span>
        </div>
        <div className="chips wrap">{FILTERS.map(([k, l]) => <FilterChip key={k} on={filter === k} onClick={() => setFilter(k)}>{l}</FilterChip>)}</div>
        <div className="imsm-term" ref={term}>
          {!shown.length ? <p className="wait">Waiting for the desk's log…</p> : shown.map((l) => (
            <div key={l.id} className="ln"><span className="t">{new Date(l.timestamp).toLocaleTimeString('en-GB')}</span><span className={`ty ${l.type}`}>{l.type}</span><span className="m">{l.line}</span></div>
          ))}
        </div>
        <div className="imsm-ask">
          <TextField label="Send a command" value={cmd} onChange={setCmd} disabled={running} className="imsm-mono" onKeyDown={(e) => e.key === 'Enter' && send()} />
          <Btn icon="send" busy={running} disabled={running || !cmd.trim()} onClick={() => send()}>Send</Btn>
        </div>
        <div className="imsm-row">
          <span className="muted">Shortcuts</span>
          {SHORTCUTS.map(([c, l]) => <button key={c} type="button" className="imsm-cmdchip sl" disabled={running} onClick={() => (c === 'reboot' ? reboot() : send(c))}>{l}</button>)}
        </div>
      </section>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      <Fab label={ota === 'flashing' ? 'Updating…' : 'Update the desk'} icon="bolt" disabled={running || !fw.canUpdate || ota === 'flashing'} onClick={update} />
    </>
  );
}

export default function DeviceHealth({ theme = 'light', onThemeToggle, setCurrentPath }) {
  return (
    <ServicePage title="Device Health" icon="monitor" accent="teal" wide theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} sub="The desk unit live: its parts, signal, memory and processor, firmware updates over Wi-Fi, and its console.">
      <Body />
    </ServicePage>
  );
}
