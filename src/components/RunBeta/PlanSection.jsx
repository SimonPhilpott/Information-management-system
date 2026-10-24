// Run planner: the run plan, in the beta's own design (24 Oct, Simon: the classic panel "doesn't seem to have
// had any work done to it"). The same plan and the same adjusters as the classic page - time, pace, every carb stop,
// dragging on the chart - laid out as Material cards: the numbers first, anything to act on as banners, the chart,
// the carb stops as cards you can change, then the detail (rulebook, settings, what-ifs, how it was worked out)
// folded away until you want it. Sending it is the floating button in the bottom right (RunBeta.jsx).
import React, { useState } from 'react';
import { Icon, IconButton, Btn } from '../HomebrewBeta/ui';
import { dist, paceText, elev, elevUnit } from '../../utils/units';
import { SavedRoutePlans } from '../Dashboard/RunPlanner/SavedPlans';
import { printRunReport } from '../Dashboard/RunPlanner/printRunReport';
import { RunTrack, Moments } from './Timeline';
import RouteMapArt from './RouteMapArt';

const hm = (min) => (min == null ? '–' : min >= 60 ? `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min` : `${Math.round(min)} min`);
const clock = (ms) => new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });

export function Banner({ tone = 'info', title, children, actions, icon }) {
  const ic = icon || { good: 'check', info: 'info', warn: 'bell', stop: 'blood' }[tone];
  return (
    <div className={`rpb-banner ${tone}`} role={tone === 'warn' || tone === 'stop' ? 'alert' : 'status'}>
      <span className="bic"><Icon n={ic} size={20} /></span>
      <div className="btx">
        {title && <b>{title}</b>}
        {children && <p>{children}</p>}
      </div>
      {actions && <div className="bact">{actions}</div>}
    </div>
  );
}

// a number with − and + beside it
function Stepper({ onDown, onUp, downLabel, upLabel }) {
  return (
    <span className="rpb-stepper">
      <IconButton icon="remove" label={downLabel} onClick={onDown} />
      <IconButton icon="add" label={upLabel} onClick={onUp} />
    </span>
  );
}

function Stat({ icon, k, v, sub, tone = '', children }) {
  return (
    <div className={`rpb-stat ${tone}`}>
      <span className="k"><Icon n={icon} size={16} />{k}</span>
      <span className="v">{v}</span>
      {sub && <span className="s">{sub}</span>}
      {children}
    </div>
  );
}

function Fold({ icon, title, children, open = false }) {
  return (
    <details className="rpb-fold" open={open}>
      <summary><Icon n={icon} size={20} /><span>{title}</span><Icon n="down" size={22} /></summary>
      <div className="fb">{children}</div>
    </details>
  );
}

export default function PlanSection({ rp, phone, dark, waitingFor }) {
  const [showLive, setShowLive] = useState(false);
  const [probe, setProbe] = useState(null); // the minute under your finger on the track, shown on the map too
  const sent = phone.sent;
  const viewingSent = Boolean(sent?.chart && !showLive);
  const p = viewingSent ? sent.chart : rp.plan;
  const u = rp.units;
  const editable = !viewingSent;

  if (!p) return <div className="rpb-card rpb-empty"><Icon n="route" size={28} /><p>{waitingFor}</p></div>;
  const pred = p.plan.predicted;
  const low = pred.minDuring < p.settings.floor;
  const stops = p.plan.stops || [];
  const guide = p.guideline?.[p.guideline.usedRange];

  return (
    <div className="rpb-plan">
      {sent?.chart && (viewingSent ? (
        <Banner tone="good" icon="phone" title={`Sent at ${clock(sent.createdAt)}: this is what your phone is following${sent.routeName ? ` (${sent.routeName})` : ''}`}
          actions={<Btn kind="tonal" onClick={() => setShowLive(true)}>Show the live plan</Btn>}>
          {sent.waitingForTap ? 'Timed from when you tap Start run: ' : 'Reminders: '}
          {sent.reminders.map((r) => `${r.grams ? `${r.grams} g` : `${r.ml} ml water`} at ${r.minute === 0 ? 'the start' : `${r.minute} min`}${r.at ? ` (${clock(r.at)})` : ''}`).join(', ')}. Changes here aren't sent unless you send again.
        </Banner>
      ) : (
        <Banner tone="info" icon="phone" title="The live plan, not what your phone is following" actions={<Btn kind="tonal" onClick={() => setShowLive(false)}>Back to the sent plan</Btn>}>
          Your phone is following the plan sent at {clock(sent.createdAt)}. Send to my phone sends this one instead.
        </Banner>
      ))}

      {/* the numbers */}
      <div className="rpb-stats">
        <Stat icon="timer" k="Time" v={hm(p.run.durationMin)} sub={`${dist(p.run.distanceKm, u, 2)} ${u}, ${elev(p.run.gainM || 0, u)} ${elevUnit(u)} up, ${p.run.kcal} kcal`}>
          {editable && rp.stepTime && <Stepper onDown={() => rp.stepTime(-2)} onUp={() => rp.stepTime(2)} downLabel="2 minutes faster" upLabel="2 minutes slower" />}
        </Stat>
        <Stat icon="run" k="Pace" v={<>{paceText(p.inputs.averagePaceMinPerKm, u)}<small>/{u}</small></>}
          sub={p.inputs.paceEffortFactor && Math.abs(p.inputs.paceEffortFactor - 1) >= 0.02 ? `Effort ${p.inputs.paceEffortFactor > 1 ? '+' : ''}${Math.round((p.inputs.paceEffortFactor - 1) * 100)}% from the pace` : 'Your average, adjusted for the hills'}>
          {editable && rp.stepPace && <Stepper onDown={() => rp.stepPace(-5)} onUp={() => rp.stepPace(5)} downLabel={`5 seconds per ${u} faster`} upLabel={`5 seconds per ${u} slower`} />}
        </Stat>
        <Stat icon="food" k="Carbs" tone="carbs" v={<>{p.plan.totalCarbs}<small>g</small></>} sub={`${p.plan.carbsPerHour} g an hour${guide ? ` (guidance ${guide[0]} to ${guide[1]})` : ''}`}>
          {editable && rp.stepCarbs && stops.length > 0 && <Stepper onDown={() => rp.stepCarbs(-5)} onUp={() => rp.stepCarbs(5)} downLabel="5 g less in all, shared across the stops" upLabel="5 g more in all, shared across the stops" />}
        </Stat>
        <Stat icon="blood" k="Glucose" tone={low ? 'low' : 'ok'} v={<>{p.inputs.startBg}<span className="to">→</span>{pred.minDuring}<span className="to">→</span>{pred.endBg}</>}
          sub={`Start, lowest, finish. Lowest after: ${pred.minAfter}. With no carbs: ${pred.minWithoutCarbs}`} />
        <Stat icon="cup" k="Drink" tone="water" v={p.hydration?.drinkToThirst ? 'To thirst' : <>{p.hydration?.needMl}<small>ml</small></>}
          sub={p.hydration?.drinkToThirst ? `A mouthful at each carb stop. Sweat ${p.hydration?.lossPct}% of your weight` : `${(p.drinks || []).filter((dk) => dk.minute > 0).length} drinks. Sweat ${p.hydration?.lossPct}%`} />
      </div>

      {/* anything to act on */}
      {(p.warnings || []).map((w) => {
        const [head, ...rest] = w.split(': ');
        const titled = rest.length && head.length < 40;
        return <Banner key={w} tone={/below|DO NOT|ketones|treat the low/i.test(w) ? 'stop' : 'warn'} title={titled ? head : w}>{titled ? rest.join(': ') : null}</Banner>;
      })}
      {rp.carbChange && editable && (
        <Banner tone="warn" title={rp.carbChange.fromTotal === rp.carbChange.toTotal ? 'Your carb stops changed' : `Your carb stops changed: ${rp.carbChange.fromTotal} g to ${rp.carbChange.toTotal} g`}
          actions={<><Btn kind="text" onClick={() => rp.setCarbChange(null)}>Use the new plan</Btn><Btn kind="tonal" onClick={rp.keepPreviousStops}>Keep my previous stops</Btn></>}>
          Was {rp.carbChange.from}; now {rp.carbChange.to}. Why: {rp.carbChange.reasons.length ? rp.carbChange.reasons.join('; ') : 'the plan was worked out again with the latest readings'}.
          {rp.carbChange.lowest != null && rp.carbChange.toTotal < rp.carbChange.fromTotal ? ` Without the extra carbs you stay at ${rp.carbChange.lowest} or above. Keep them if you'd rather carry them.` : ''}
        </Banner>
      )}
      {p.learning?.applied?.length > 0 && <Banner tone="info" icon="school" title="Learned from your runs">{p.learning.applied.map((x) => x.text).join(' · ')}</Banner>}

      {/* the run, start to finish (Option C), and stop by stop beneath it (Option D) */}
      <section className="rpb-card rpb-chartcard">
        <div className="hd">
          <h3>The run, start to finish</h3>
          <span className="grow" />
          {editable && rp.hasCustomTiming && <Btn kind="text" icon="sync" onClick={rp.resetTiming}>Back to the planned times</Btn>}
          <IconButton icon="print" label="Print or save as PDF" onClick={() => printRunReport({ plan: p, units: u })} />
        </div>
        <div className={rp.routeFull?.path?.length > 1 ? 'rpb-withmap' : ''}>
          <RunTrack plan={p} units={u} onProbe={setProbe} />
          {rp.routeFull?.path?.length > 1 && (() => {
            const kmAt = (m) => { let best = null; for (const e of p.elevation || []) { if (e[0] > m) break; best = e; } return best ? best[1] : 0; };
            return <RouteMapArt key={rp.routeFull.id} path={rp.routeFull.path} route={rp.routeFull} units={u} W={360} H={360} pad={30} label={`Map of ${rp.routeFull.name}`}
              markers={(p.plan.stops || []).map((st) => ({ km: st.km ?? kmAt(st.minute), label: `${st.grams} g` }))} progressKm={probe != null ? kmAt(probe) : null} zoomable />;
          })()}
        </div>
      </section>
      <section className="rpb-card rpb-chartcard">
        <div className="hd"><h3>Stop by stop</h3><span className="muted">{editable ? "Change a stop's minute or grams right here." : 'The plan as sent.'}</span></div>
        <Moments plan={p} units={u} editable={editable} rp={rp} />
        {!stops.some((s) => s.minute > 0) && <Banner tone="warn" title="No carbs during the run">Your rule is at least one carb stop while you're running. Add one above.</Banner>}
      </section>

      <div className="rpb-acts start">
        <Btn kind="tonal" icon="check" busy={phone.busy === 'save'} onClick={async () => { try { await phone.saveOnly(); rp.showToast('Plan saved. You can match it to your Strava run in Learning.'); } catch (e) { rp.showToast(e.message, 'error'); } }}>Save plan only</Btn>
      </div>

      {/* the detail, folded away */}
      <div className="rpb-folds">
        <Fold icon="chart" title="The detailed chart: glucose, water, insulin and the course">
          <p className="muted">{viewingSent ? 'The plan as sent. Show the live plan to change it.' : 'Drag a carb stop along the run to change when you take it.'}</p>
          <RunTrack plan={p} units={u} detail onMoveStop={editable ? rp.moveStop : null} />
        </Fold>
        {p.rulebook?.checks?.length > 0 && (
          <Fold icon="book" title={`Your rulebook and targets${p.rulebook.checks.some((c) => !c.ok) ? ` (${p.rulebook.checks.filter((c) => !c.ok).length} to look at)` : ': all followed'}`} open={p.rulebook.checks.some((c) => !c.ok)}>
            {p.preRun?.rulebook?.trendWords && <p className="muted">Planned from your current reading, {p.preRun.rulebook.trendWords}.</p>}
            <ul className="rpb-checks">
              {p.rulebook.checks.map((c) => <li key={c.rule} className={c.ok ? 'ok' : 'look'}><Icon n={c.ok ? 'check' : 'info'} size={18} /><span><b>{c.rule}:</b> {c.text}</span></li>)}
            </ul>
          </Fold>
        )}
        <Fold icon="chart" title="Insulin and carb settings">
          <div className="kv rpb-kv">
            <span><b>Insulin sensitivity</b>{p.settings.isf} mmol/L per unit</span>
            <span><b>Carb ratio</b>{p.settings.cr} g per unit</span>
            <span><b>1 g of carbs</b>about {p.settings.mmolPerGram} mmol/L</span>
            <span><b>While running</b>insulin {p.inputs.sensMult}× stronger{p.settings.insulinBoost > 1 ? `, ×${p.settings.insulinBoost} from recent training` : ''}</span>
            <span><b>On board at the start</b>{p.inputs.iob} U{p.inputs.cob ? `, ${p.inputs.cob} g carbs` : ''}</span>
          </div>
          <p className="muted">From your AAPS loop settings.</p>
        </Fold>
        {(p.startScenarios?.length > 0 || p.iobScenarios?.length > 0) && (
          <Fold icon="tune" title="What if you started differently">
            <div className="rpb-whatif">
              {[['If you started at a different glucose', 'Start', p.startScenarios, (s) => s.startBg], ['If you had different insulin on board', 'On board', p.iobScenarios, (s) => `${s.iob} U`]].map(([t, first, rows, key]) => rows?.length > 0 && (
                <div key={t}>
                  <h4>{t}</h4>
                  <table>
                    <thead><tr><th>{first}</th><th>Carbs</th><th>At the start</th><th>Lowest</th></tr></thead>
                    <tbody>{rows.map((s) => <tr key={key(s)}><td>{key(s)}</td><td>{s.totalCarbs} g</td><td>{s.carbsAtStart} g</td><td className={s.minBg < (p.settings?.floor || 4) ? 'low' : 'ok'}>{s.minBg}</td></tr>)}</tbody>
                  </table>
                </div>
              ))}
            </div>
          </Fold>
        )}
        {p.basis && (
          <Fold icon="info" title="How this was worked out">
            <p>Each minute, glucose falls with insulin action (your {p.inputs?.iob} U on board over a 3-hour curve, times your sensitivity of {p.settings?.isf} mmol/L per unit, made {p.inputs?.sensMult}× stronger during the run) and with exercise uptake ({p.inputs?.kEx} mmol/L an hour, scaled by effort, the hills and the weather), and rises with carbs ({p.settings?.cr} g per unit, so about {p.settings?.mmolPerGram} mmol/L a gram, absorbed over about 20 minutes). Stops are placed so the estimate stays at least 1 mmol/L above your {p.settings?.floor} floor, and off steep climbs where possible. Your loop also reacts (temp basals), which this leaves out, so the estimate is on the cautious side.</p>
            <p>{p.basis.personalFitted ? `Exercise uptake was fitted from ${p.basis.personalRuns} of your matched runs.` : `Not personalised yet: ${p.basis.personalRuns} of your runs are matched with glucose data, and 4 are needed.`}{p.basis.assumed?.length > 0 && ` Assumed: ${p.basis.assumed.join('; ')}.`}</p>
            {p.sources?.length > 0 && <ul className="rpb-sources">{p.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}<Icon n="open" size={16} /></a></li>)}</ul>}
          </Fold>
        )}
      </div>

      <div className="rpb-legacy"><SavedRoutePlans routeId={(rp.plan || p)?.inputs?.routeId} isDark={dark} units={u} card="rpb-panel" muted="muted" refreshKey={phone.version} /></div>
    </div>
  );
}
