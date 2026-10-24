// Run planner: Runs - the replay in the beta's design (24 Oct, Simon: "the run review chart needs to match the
// new style"). Today's plan, or a run you've looked back on, played along its track: the runner moves along the
// track and on the map (the route drawn up to them), the dials follow, and you can play, pause, change the speed or
// run your finger along the track to jump. The same data as the classic Flythrough (the plan, /api/planner/retro).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, IconButton, Btn, FilterChip, Segmented } from '../HomebrewBeta/ui';
import { RunTrack, RetroTrack } from './Timeline';
import RouteMapArt from './RouteMapArt';
import RunGaugesBar from '../Dashboard/RunPlanner/RunGaugesBar';
import { Banner } from './PlanSection';
import { paceText } from '../../utils/units';

const dayWord = (day) => (day ? new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
const SPEEDS = [['10', '10×'], ['30', '30×'], ['60', '60×'], ['120', '120×']];
const at = (pts, m) => {
  const q = (pts || []).filter((p) => p[1] != null);
  if (!q.length) return null;
  for (let i = 1; i < q.length; i++) if (q[i][0] >= m) { const a = q[i - 1], b = q[i]; return a[1] + (b[1] - a[1]) * ((m - a[0]) / ((b[0] - a[0]) || 1)); }
  return q[q.length - 1][1];
};
// distance, height and the pace just there, from [minute, km, height]
const course = (ele, m) => {
  if (!ele?.length) return { km: 0, height: null, pace: null };
  let i = ele.findIndex((e) => e[0] >= m);
  if (i < 0) i = ele.length - 1;
  const e = ele[Math.max(0, i)];
  const a = ele[Math.max(0, i - 3)], b = ele[Math.min(ele.length - 1, i + 3)];
  const pace = b[1] > a[1] ? (b[0] - a[0]) / (b[1] - a[1]) : null;
  return { km: e[1], height: e[2], pace };
};

export default function Replay({ rp, dark }) {
  const { call } = rp;
  const u = rp.units;
  const [runs, setRuns] = useState([]);
  const [source, setSource] = useState('plan'); // 'plan' or an activity id
  const [retro, setRetro] = useState(null);
  const [route, setRoute] = useState(null);
  const [minute, setMinute] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState('30');
  const last = useRef(null);

  useEffect(() => { call('/api/planner/runs/recent').then((d) => setRuns((d.runs || []).filter((r) => r.status === 'matched' || r.status === 'reviewed'))).catch(() => {}); }, [call]);
  // a past run: its analysis, and its route's map
  useEffect(() => {
    setPlaying(false); setMinute(0);
    if (source === 'plan') { setRetro(null); setRoute(rp.routeFull || null); return; }
    let live = true;
    setRetro(null); setRoute(null);
    call(`/api/planner/retro/${source}`).then(async (d) => {
      if (!live) return;
      setRetro(d);
      const rid = d.session?.routeId || d.analysis?.routeId;
      if (rid) { try { const r = await call(`/api/planner/routes/${rid}`); if (live) setRoute(r.route); } catch { /* no map */ } }
    }).catch(() => live && setRetro({ error: true }));
    return () => { live = false; };
  }, [source, call]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (source === 'plan') setRoute(rp.routeFull || null); }, [rp.routeFull, source]);

  const plan = rp.plan;
  const a = retro?.analysis?.available ? retro.analysis : null;
  const dur = source === 'plan' ? plan?.run?.durationMin : a?.run?.durationMin;
  const ele = source === 'plan' ? plan?.elevation : a?.elevation;

  // playing: the run's minutes go by at the chosen speed
  useEffect(() => {
    if (!playing || !dur) return undefined;
    let raf;
    const tick = (t) => {
      if (last.current != null) {
        const dm = ((t - last.current) / 1000) * (Number(speed) / 60);
        setMinute((m) => { const n = m + dm; if (n >= dur) { setPlaying(false); return dur; } return n; });
      }
      last.current = t;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); last.current = null; };
  }, [playing, speed, dur]);

  const c = course(ele, minute);
  const bg = source === 'plan' ? at(plan?.prediction, minute) : at(a?.actual, minute);
  const markers = useMemo(() => {
    if (source === 'plan') return (plan?.plan?.stops || []).map((s) => ({ km: s.km ?? course(ele, s.minute).km, label: `${s.grams} g` }));
    return (retro?.intakes || []).filter((it) => it.action === 'taken' && it.grams).map((it) => ({ km: course(ele, it.minute ?? 0).km, label: `${it.grams} g` }));
  }, [source, plan, retro, ele]);

  const ready = source === 'plan' ? Boolean(plan) : Boolean(a);
  const mins = Math.floor(minute), secs = Math.round((minute - mins) * 60);
  return (
    <div className="gutter rpb-plan rpb-replay">
      <div className="chips wrap">
        <FilterChip on={source === 'plan'} onClick={() => setSource('plan')} lead={<Icon n="sun" size={18} />}>Today's plan</FilterChip>
        {runs.map((r) => <FilterChip key={r.activityId} on={source === r.activityId} onClick={() => setSource(r.activityId)}>{r.status === 'matched' ? r.routeName || r.name : r.name} · {dayWord(r.day)}</FilterChip>)}
      </div>

      {!ready ? (
        source === 'plan' ? <Banner tone="info" title="No plan yet">Choose a route on Today and its plan plays here.</Banner>
          : retro?.error || (retro && !retro.analysis?.available) ? <Banner tone="info" title="Nothing to replay">{retro?.analysis?.reason || 'This run has no glucose to replay.'}</Banner>
            : <p className="muted">Lining the run up…</p>
      ) : (
        <>
          {/* the dials, following the runner */}
          <div className="rpb-legacy">
            <RunGaugesBar units={u} gainM={route?.gainM || 0} lossM={route?.lossM || 0} bgFloor={rp.targets?.floor || 4.5} bgCeiling={10} targetBg={rp.targets?.startTarget || 8}
              isDark={dark} livePaceSec={c.pace ? c.pace * 60 : null} paceTextVal={c.pace ? paceText(c.pace, u) : undefined} liveElevationM={c.height ?? 0} liveBg={bg ?? 0} isLiveFlythrough />
          </div>

          <section className="rpb-card rpb-chartcard">
            <div className="hd">
              <h3>{source === 'plan' ? 'Your plan, played' : `${a.run.name}, planned and real`}</h3>
              <span className="grow" />
              <span className="rpb-clock">{mins}:{String(secs).padStart(2, '0')} <small>of {Math.round(dur)} min</small></span>
            </div>
            <div className={route?.path?.length > 1 ? 'rpb-withmap' : ''}>
              {source === 'plan'
                ? <RunTrack plan={plan} units={u} playhead={minute} onProbe={(m) => { setPlaying(false); setMinute(m); }} />
                : <RetroTrack a={a} intakes={retro.intakes} units={u} playhead={minute} onProbe={(m) => { setPlaying(false); setMinute(m); }} />}
              {route?.path?.length > 1 && <RouteMapArt key={`${source}-${route.id}`} path={route.path} route={route} units={u} W={360} H={360} pad={30} label={`Map of ${route.name}`} markers={markers} progressKm={c.km} zoomable />}
            </div>
            <div className="rpb-player">
              <IconButton icon={playing ? 'pause' : 'play'} label={playing ? 'Pause' : 'Play'} className="playbtn" onClick={() => { if (!playing && minute >= dur) setMinute(0); setPlaying(!playing); }} />
              <input type="range" min="0" max={Math.round(dur * 10)} value={Math.round(minute * 10)} onChange={(e) => { setPlaying(false); setMinute(Number(e.target.value) / 10); }} aria-label="Where in the run" />
              <Segmented label="Speed" value={speed} onChange={setSpeed} options={SPEEDS} />
              <Btn kind="text" icon="sync" onClick={() => { setMinute(0); setPlaying(false); }}>Start again</Btn>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
