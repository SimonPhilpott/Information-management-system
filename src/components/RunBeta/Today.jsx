// Run planner: Today - the verdict first (go, eat first or wait, worked out from your glucose, insulin and carbs
// on board and Garmin's night), the numbers behind it as tiles, the chosen route, then the run plan itself.
import React, { useEffect, useState } from 'react';
import { Icon, Btn, Sheet, TextField } from '../HomebrewBeta/ui';
import PlanSection from './PlanSection';
import TrainingLoad from './TrainingLoad';
import { dist } from '../../utils/units';
import RunMissionControlTab from '../Dashboard/RunPlanner/RunMissionControlTab';
import { RouteMap, ElevationProfile, DemandCard } from './classicPieces';
import { Legacy } from './legacy';
import { RouteArt } from './Routes';

const VERDICT = {
  go: { word: 'Ready to run', icon: 'check', tone: 'go' },
  eat_first: { word: 'Eat first', icon: 'food', tone: 'eat' },
  wait: { word: 'Wait a little', icon: 'timer', tone: 'wait' },
};
const ARROW = { DoubleUp: '⇈', SingleUp: '↑', FortyFiveUp: '↗', Flat: '→', FortyFiveDown: '↘', SingleDown: '↓', DoubleDown: '⇊' };
const ARROW_WORD = { DoubleUp: 'rising fast', SingleUp: 'rising', FortyFiveUp: 'rising slowly', Flat: 'steady', FortyFiveDown: 'falling slowly', SingleDown: 'falling', DoubleDown: 'falling fast' };
const bgTone = (bg) => (bg == null ? '' : bg < 4 ? 'low' : bg > 10 ? 'high' : 'ok');

function Tile({ k, v, unit, sub, tone = '', icon }) {
  return (
    <div className={`rpb-tile ${tone}`}>
      <span className="k">{icon && <Icon n={icon} size={16} />}{k}</span>
      <span className="v">{v ?? '–'}{v != null && unit && <small>{unit}</small>}</span>
      {sub && <span className="s">{String(sub).charAt(0).toUpperCase() + String(sub).slice(1)}</span>}
    </div>
  );
}

export default function Today({ rp, phone, selected, dark, onPickRoute, onOpenRoute }) {
  const [editing, setEditing] = useState(false);
  const n = rp.now?.now;
  // the verdict - asked again whenever the glucose or the run changes
  const [ready, setReady] = useState(null);
  const minutes = rp.plan?.plan?.run?.durationMin || 60;
  useEffect(() => {
    if (!n?.bgFresh) { setReady(null); return; }
    const q = new URLSearchParams({ bg: n.bg, direction: n.direction || 'Flat', iob: n.iob ?? 0, cob: n.cob ?? 0, sessionType: 'run', durationMin: Math.round(minutes), intensity: rp.form.intensity || 'steady' });
    let live = true;
    rp.call(`/api/planner/readiness?${q}`).then((d) => { if (live) setReady(d.readiness); }).catch(() => {});
    return () => { live = false; };
  }, [n?.bg, n?.iob, n?.cob, n?.direction, minutes, rp.form.intensity]); // eslint-disable-line react-hooks/exhaustive-deps
  const v = VERDICT[ready?.status] || null;
  const gm = ready?.garmin;

  return (
    <div className="rpb-today">
      <div className="gutter" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* the verdict */}
        <section className={`rpb-verdict ${v?.tone || 'none'}`} aria-live="polite">
          <div className="top">
            <span className="vic"><Icon n={v?.icon || 'info'} size={28} /></span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2>{v ? v.word : n?.bgFresh === false ? 'No fresh glucose' : 'Checking…'}</h2>
              <p>{ready ? [
                ready.recommendedCarbsGrams ? `Take ${ready.recommendedCarbsGrams} g before you set off.` : 'No carbs needed before you set off.',
                ready.delayMinutes ? `Give it ${ready.delayMinutes} min first.` : '',
              ].filter(Boolean).join(' ') : n?.bgFresh === false ? 'There\'s no recent reading from the sensor. Type your numbers into the plan below.' : 'Reading your glucose and insulin…'}</p>
            </div>
            <Btn kind="text" icon="sync" onClick={() => rp.useCurrent()} aria-label="Read the latest glucose again">Refresh</Btn>
          </div>
          {ready?.recommendedCarbsGrams > 0 && rp.plan && (
            <div className="rpb-acts start" style={{ marginTop: 12 }}>
              <Btn kind="tonal" icon="add" onClick={() => rp.stepCarbs(ready.recommendedCarbsGrams)}>Add {ready.recommendedCarbsGrams} g to the plan</Btn>
            </div>
          )}
          {ready?.advisoryBullets?.length > 0 && <ul>{ready.advisoryBullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
        </section>

        {/* the numbers behind it */}
        <div className="rpb-tiles">
          <Tile k="Glucose" icon="blood" tone={bgTone(n?.bg)} v={n?.bg != null ? <>{n.bg} <span className="arrow" aria-label={ARROW_WORD[n.direction] || ''}>{ARROW[n.direction] || ''}</span></> : null} unit="mmol/L"
            sub={n?.bg != null ? `${ARROW_WORD[n.direction] || 'trend unknown'}, ${n.bgMinutesAgo} min ago` : null} />
          <Tile k="Insulin on board" icon="chart" v={n?.iob != null ? Number(n.iob).toFixed(1) : null} unit="u" sub={n?.lastBolusUnits ? `last bolus ${n.lastBolusUnits} u, ${n.lastBolusMinutesAgo} min ago` : null} />
          <Tile k="Carbs on board" icon="leaf" v={n?.cob != null ? Math.round(n.cob) : null} unit="g" sub={n?.carbsLast3h != null ? `${n.carbsLast3h} g in the last 3 hours` : null} />
          {gm && (gm.sleepScore != null || gm.bodyBatteryWake != null) && (
            <Tile k="Last night" icon="moon" v={gm.sleepScore ?? null} unit={gm.sleepScore != null ? 'sleep' : ''}
              sub={[gm.bodyBatteryWake != null && `body battery ${gm.bodyBatteryWake}`, gm.hrvStatus && `HRV ${String(gm.hrvStatus).toLowerCase()}`].filter(Boolean).join(', ')} />
          )}
        </div>

        <div className="rpb-acts start" style={{ marginTop: -4 }}>
          <Btn kind="text" icon="edit" onClick={() => setEditing(true)}>Plan with different numbers</Btn>
        </div>

        {/* the chosen route */}
        {selected ? (
          <div className="rpb-card rpb-chosen">
            <button type="button" className="open sl" onClick={() => onOpenRoute(selected)} aria-label={`Open ${selected.name}`}>
            <RouteArt id={selected.id} small />
            <span className="txt">
              <span className="t-ts muted">Today's route</span>
              <span className="nm">{selected.name}</span>
              <span className="tags">
                <span className="tag">{dist(selected.distanceKm, rp.units, 2)} {rp.units}</span>
                {selected.gainM != null && <span className="tag"><Icon n="terrain" size={16} />{Math.round(selected.gainM)} m</span>}
              </span>
            </span>
            </button>
            <Btn kind="text" onClick={onPickRoute}>Change</Btn>
          </div>
        ) : (
          <div className="rpb-card rpb-empty">
            <Icon n="route" size={28} />
            <p>Choose a route and the plan works out the time, the carb stops and the water for it.</p>
            <Btn icon="route" onClick={onPickRoute}>Choose a route</Btn>
          </div>
        )}
      </div>

      {/* the plan: the beta's own design */}
      <div className="gutter" style={{ paddingTop: 20 }}>
        <h2 className="rpb-h2">Your run plan</h2>
        <p className="muted rpb-lead">Change the time, the pace or the carbs and the plan follows. Send it to your phone with the button in the corner.</p>
        <PlanSection rp={rp} phone={phone} dark={dark}
          waitingFor={!selected && !(Number(rp.form.distanceKm) > 0) ? 'Choose a route, or enter a distance, to start your run plan.' : 'Working out your run plan…'} />
      </div>

      {/* training load and recovery, in the beta's design */}
      <div className="gutter" style={{ paddingTop: 8 }}><TrainingLoad units={rp.units} /></div>

      {/* the route, the gauges and the weather: the classic panels, restyled */}
      <Legacy title="The run" lead="What the route asks of you, your training and the weather on the way.">
        {(c) => (
          <RunMissionControlTab
            routeFull={rp.routeFull} routeHistory={rp.routeHistory} demand={rp.demand} routes={rp.routes} routeId={rp.routeId} setRouteId={rp.setRouteId}
            selected={selected} removeRoute={rp.removeRoute} fileRef={rp.fileRef} addGpx={rp.addGpx} kForm={rp.kForm} setKForm={rp.setKForm} addLink={rp.addLink}
            komoot={rp.komoot} loadTours={rp.loadTours} tours={rp.tours} tourType={rp.tourType} tourSearch={rp.tourSearch} setTourSearch={rp.setTourSearch}
            importTour={rp.importTour} connectKomoot={rp.connectKomoot} send={rp.send} setTours={rp.setTours} loadAll={rp.loadAll}
            form={rp.form} setForm={rp.setForm} setPaceTouched={rp.setPaceTouched} goals={rp.goals} goalId={rp.goalId} pickGoal={rp.pickGoal} goal={rp.goal}
            now={rp.now} useCurrent={rp.useCurrent} estimate={rp.estimate} plan={rp.plan} originalBaseline={rp.originalBaseline}
            stepTime={rp.stepTime} stepPace={rp.stepPace} stepCarbs={rp.stepCarbs} stepStopCarbs={rp.stepStopCarbs} moveStop={rp.moveStop} addStop={rp.addStop} removeStop={rp.removeStop}
            carbChange={rp.carbChange} keepPreviousStops={rp.keepPreviousStops} dismissCarbChange={() => rp.setCarbChange(null)} moveDrink={rp.moveDrink}
            resetTiming={rp.resetTiming} hasCustomTiming={rp.hasCustomTiming}
            timeEditFocus={rp.timeEditFocus} setTimeEditFocus={rp.setTimeEditFocus} timeEditDraft={rp.timeEditDraft} setTimeEditDraft={rp.setTimeEditDraft}
            paceEditFocus={rp.paceEditFocus} setPaceEditFocus={rp.setPaceEditFocus} paceEditDraft={rp.paceEditDraft} setPaceEditDraft={rp.setPaceEditDraft}
            carbsEditFocus={rp.carbsEditFocus} setCarbsEditFocus={rp.setCarbsEditFocus} carbsEditDraft={rp.carbsEditDraft} setCarbsEditDraft={rp.setCarbsEditDraft}
            RouteMap={RouteMap} ElevationProfile={ElevationProfile} DemandCard={DemandCard}
            chip={(l, val, tone) => <div className="rpb-chipstat"><span>{l}</span><b className={tone || ''}>{val ?? '-'}</b></div>}
            busy={rp.busy} units={rp.units} isDark={dark} panel={c.panel} label={c.label} field={c.field} btn={c.btn} ghost={c.ghost} targets={rp.targets} hideNow hidePlan hideLoad
          />
        )}
      </Legacy>

      {/* your own numbers in place of the sensor's */}
      <Sheet open={editing} onClose={() => setEditing(false)} title="Plan with different numbers"
        footer={<div className="rpb-acts"><Btn kind="text" onClick={() => { rp.useCurrent(); setEditing(false); }}>Use my current readings</Btn><Btn onClick={() => setEditing(false)}>Done</Btn></div>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p className="muted" style={{ margin: 0 }}>The plan follows these as you type. Use my current readings puts the sensor's back.</p>
          <TextField label="Glucose at the start (mmol/L)" type="number" inputMode="decimal" step="0.1" value={rp.form.startBg} onChange={(v) => rp.setForm({ ...rp.form, startBg: v })} />
          <TextField label="Insulin on board (u)" type="number" inputMode="decimal" step="0.1" value={rp.form.iob} onChange={(v) => rp.setForm({ ...rp.form, iob: v })} />
          <TextField label="Carbs on board (g)" type="number" inputMode="numeric" value={rp.form.cob} onChange={(v) => rp.setForm({ ...rp.form, cob: v })} />
          <TextField label="Minutes since your last bolus" type="number" inputMode="numeric" value={rp.form.minutesSinceBolus} onChange={(v) => rp.setForm({ ...rp.form, minutesSinceBolus: v })} />
        </div>
      </Sheet>
    </div>
  );
}
