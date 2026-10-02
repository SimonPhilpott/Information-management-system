import crypto from 'crypto';
import db, { getSetting, setSetting } from '../db/database.js';
import { createEvent, deleteEvent, getEventsOn, refreshEvents } from './calendarService.js';
import { getRoute } from './routeService.js';
import config from '../config.js';
import { createSession, startSession, endPendingSession, recordIntakeFromPhone } from './runLearningService.js';

// "Send to my phone" for the Run Planner: the run's carb and water stops as Google Calendar events, each
// with a notification exactly on time, so the phone (and any watch mirroring it) buzzes mid-run even with
// the screen off - a web page's own timers stop when the phone locks. A Start event carries the Komoot
// link (opens the route in the Komoot app) and a Finish event the refuelling. Sending again replaces the
// last set; only events made here are ever deleted.

const KEY = 'run_alert_events';
const SETTINGS_KEY = 'run_alert_settings';

// How alerts reach the phone: Google Calendar events, and/or a request to a Tasker task. The Tasker URL is a
// template - Tasker's own HTTP Request event on the phone (same Wi-Fi), or a Join push URL (works anywhere).
// Placeholders: {start_in} minutes until the run starts, {minutes} stop minutes "15,35", {messages} the
// matching messages split by "|", {interval} and {repeats} when the stops are evenly spaced (else 0),
// {route}. With no placeholders the values are added as query parameters.
const DEFAULT_SETTINGS = { calendar: true, tasker: false, taskerUrl: '', taskerStopUrl: '', push: false, pushServer: 'https://ntfy.sh', pushTopic: '', alertStyle: 'sound' };

// Push notifications (ntfy): IMS queues each stop and pushes it at the right minute, from the always-on PC,
// so it reaches the phone anywhere (mobile data). The ntfy app shows it - urgent, so it sounds and a
// Garmin mirrors it - and a Tasker profile on the notification can loop an alarm until it's dismissed
// (phone or watch). The topic is a long random name: on the public server, knowing it is the only key.
db.exec(`CREATE TABLE IF NOT EXISTS run_push_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT, due_at INTEGER NOT NULL, title TEXT NOT NULL, message TEXT, tags TEXT, sent_at INTEGER, error TEXT
)`);
// each reminder can carry its own buttons (Taken / Skipped) and tap target
try { db.exec('ALTER TABLE run_push_queue ADD COLUMN actions TEXT'); } catch (_) { /* already there */ }
try { db.exec('ALTER TABLE run_push_queue ADD COLUMN click TEXT'); } catch (_) { /* already there */ }
// the run being sent / run now (runLearningService session), so clearing alerts can cancel one that never began
const SESSION_KEY = 'run_session_current';
export function getAlertSettings() { try { return { ...DEFAULT_SETTINGS, ...JSON.parse(getSetting(SETTINGS_KEY) || '{}') }; } catch { return { ...DEFAULT_SETTINGS }; } }
export function saveAlertSettings(input = {}) {
  const cur = getAlertSettings();
  const url = (u) => { const t = String(u || '').trim(); if (t && !/^https?:\/\//i.test(t)) throw new Error('Tasker URLs must start with http:// or https://'); return t; };
  const next = {
    calendar: input.calendar !== undefined ? Boolean(input.calendar) : cur.calendar,
    tasker: input.tasker !== undefined ? Boolean(input.tasker) : cur.tasker,
    taskerUrl: input.taskerUrl !== undefined ? url(input.taskerUrl) : cur.taskerUrl,
    taskerStopUrl: input.taskerStopUrl !== undefined ? url(input.taskerStopUrl) : cur.taskerStopUrl,
    push: input.push !== undefined ? Boolean(input.push) : cur.push,
    pushServer: input.pushServer !== undefined ? (url(input.pushServer) || 'https://ntfy.sh').replace(/\/+$/, '') : cur.pushServer,
    // made up once, the first time push is used; can be changed (e.g. to start afresh)
    pushTopic: input.pushTopic !== undefined ? String(input.pushTopic).trim().replace(/[^\w-]/g, '').slice(0, 64) : cur.pushTopic,
    // sound or vibrate until dismissed: two ntfy topics, each set up on the phone with its own alert
    alertStyle: input.alertStyle !== undefined ? (input.alertStyle === 'vibrate' ? 'vibrate' : 'sound') : cur.alertStyle,
  };
  if (next.push && !next.pushTopic) next.pushTopic = `ims-run-${crypto.randomBytes(9).toString('hex')}`;
  setSetting(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

function fillUrl(template, values) {
  const enc = (v) => encodeURIComponent(String(v ?? ''));
  if (/\{\w+\}/.test(template)) return template.replace(/\{(\w+)\}/g, (_, k) => enc(values[k]));
  const u = new URL(template);
  for (const [k, v] of Object.entries(values)) u.searchParams.set(k, String(v ?? ''));
  return u.toString();
}
async function pushNow({ title, message, tags, priority = 5, actions = null, click = null, alarm = false }) {
  const st = getAlertSettings();
  if (!st.pushTopic) throw new Error('No push topic yet - turn push on first.');
  // Only the alarm reminders (take carbs / water, refuel) follow the Sound / Vibrate choice - the vibrate-only
  // topic is the main one with "-buzz" on the end. Route, Ready, Timer started and the like always use the main topic.
  const topic = alarm && st.alertStyle === 'vibrate' ? `${st.pushTopic}-buzz` : st.pushTopic;
  const res = await fetch(`${st.pushServer}/${topic}`, {
    method: 'POST', body: message || title, signal: AbortSignal.timeout(15000),
    // Title, urgent priority (sound, long vibration, shown on the watch), tags become emoji in ntfy
    headers: {
      Title: Buffer.from(title).toString('latin1') === title ? title : encodeURIComponent(title), Priority: String(priority), Tags: tags || 'running',
      ...(actions ? { Actions: actions } : {}), ...(click ? { Click: click } : {}),
    },
  });
  if (!res.ok) throw new Error(`ntfy answered ${res.status}`);
}

// The pre-run "Your route" notification: tapping it (or Open in Komoot) opens the route in the Komoot app,
// ready to navigate. Sent when the run is sent, before the start - only for Komoot routes.
async function pushRouteLink({ name, komoot, distanceKm = null, durationMin = null }) {
  if (!komoot) return false;
  await pushNow({
    title: `Your route: ${name}`,
    message: `Tap to open it in Komoot${distanceKm ? ` - ${distanceKm} km` : ''}${durationMin ? `, about ${Math.round(durationMin)} min` : ''}.`,
    tags: 'world_map', priority: 3, click: komoot, actions: `view, Open in Komoot, ${komoot}`,
  });
  return true;
}

// queued reminders that are alarms (they follow Sound / Vibrate); others are information
const ALARM_TAGS = new Set(['candy', 'droplet', 'checkered_flag']);

// Every 10 seconds: push whatever has come due.
// Run by the scheduler ('run_push_queue_tick' in index.js).
export async function tickRunPushQueue() {
    const due = db.prepare('SELECT * FROM run_push_queue WHERE sent_at IS NULL AND due_at <= ? ORDER BY due_at LIMIT 5').all(Date.now());
    for (const p of due) {
      try { await pushNow({ ...p, actions: p.actions || null, click: p.click || null, alarm: ALARM_TAGS.has(p.tags) }); db.prepare('UPDATE run_push_queue SET sent_at = ?, error = NULL WHERE id = ?').run(Date.now(), p.id); }
      catch (err) {
        // keep trying for 2 minutes; after that a stop is too late to be useful
        if (Date.now() - p.due_at > 120000) db.prepare('UPDATE run_push_queue SET sent_at = ?, error = ? WHERE id = ?').run(Date.now(), err.message, p.id);
      }
    }
    return { sent: due.length };
}
let pushTicker = null;
export function startRunPushQueue() {
  if (pushTicker) return;
  pushTicker = setInterval(() => { tickRunPushQueue().catch(() => {}); }, 10000);
}

export async function testPush() {
  // the test is an alarm, so it checks the topic and the sound / vibrate set-up the reminders will use
  await pushNow({ title: 'IMS run test', message: 'If you can read this, run reminders will reach you. Dismiss it to check the alert stops.', tags: 'white_check_mark', alarm: true });
  const st = getAlertSettings();
  return { topic: st.alertStyle === 'vibrate' ? `${st.pushTopic}-buzz` : st.pushTopic, style: st.alertStyle };
}

async function callTasker(url) {
  const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`the phone answered ${res.status}`);
  return (await res.text()).slice(0, 200);
}

// The run's stops for Tasker: their minutes from the start, what to take at each, and - for a simple
// "every X minutes, Y times" task - the interval and repeat count when the stops happen to be evenly spaced.
function taskerValues({ list, startInMin, name }) {
  const during = list.filter((x) => x.minute > 0);
  const gaps = during.map((x, i) => x.minute - (i ? during[i - 1].minute : 0));
  const even = gaps.length > 0 && gaps.every((g) => g === gaps[0]);
  const what = (x) => [x.grams ? `${x.grams} g carbs` : '', x.ml ? `${x.ml} ml water` : ''].filter(Boolean).join(' + ');
  return {
    start_in: Math.max(0, Math.round(startInMin)),
    minutes: during.map((x) => x.minute).join(','),
    messages: during.map((x) => `${what(x)}${x.km != null ? ` (${x.km} km)` : ''}`).join('|'),
    interval: even ? gaps[0] : 0,
    repeats: even ? gaps.length : 0,
    route: name,
  };
}
const RUN_EVENT = /\b(run|runs|running|jog|jogging|parkrun|long run|tempo|intervals)\b/i;
const londonParts = (ms) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${String(Number(p.hour) % 24).padStart(2, '0')}:${p.minute}` };
};
const addMinutes = (date, time, mins) => {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + Math.floor(total / 1440));
  const t = ((total % 1440) + 1440) % 1440;
  return { date: d.toISOString().slice(0, 10), time: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` };
};

const londonOffset = (day) => {
  const probe = new Date(`${day}T12:00:00Z`);
  const local = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(probe);
  const diff = Number(local) - 12;
  return diff === 1 ? '+01:00' : '+00:00';
};

function saved() { try { return JSON.parse(getSetting(KEY) || 'null'); } catch { return null; } }

// Today's run in the calendar (its start time), to offer as the start.
export async function suggestedStart() {
  const today = londonParts(Date.now()).date;
  await refreshEvents().catch(() => {});
  const run = getEventsOn(today).filter((e) => RUN_EVENT.test(e.title) && e.time && !/^(🏃|🍬|💧|🏁)/u.test(e.title)).sort((a, b) => a.startMs - b.startMs)[0];
  return { today, calendarRun: run ? { title: run.title, time: run.time } : null, now: londonParts(Date.now() + 2 * 60000).time };
}

export function alertStatus() { return saved(); }

export async function clearRunAlerts({ stopTasker = true, keepSessionId = null } = {}) {
  const s = saved();
  const sid = Number(getSetting(SESSION_KEY)) || null;
  if (sid && sid !== keepSessionId) { endPendingSession(sid); setSetting(SESSION_KEY, ''); }
  let removed = 0, taskerStopped = null;
  for (const e of s?.events || []) { try { await deleteEvent(e.calendarId, e.id); removed++; } catch { /* already gone */ } }
  const st = getAlertSettings();
  if (stopTasker && s?.tasker?.ok && st.tasker && st.taskerStopUrl) {
    try { await callTasker(st.taskerStopUrl); taskerStopped = true; } catch (err) { taskerStopped = err.message; }
  }
  const unsent = db.prepare('DELETE FROM run_push_queue WHERE sent_at IS NULL').run().changes;
  setSetting(KEY, 'null');
  return { removed, taskerStopped, pushesCancelled: unsent };
}

export async function testTasker() {
  const st = getAlertSettings();
  if (!st.taskerUrl) throw new Error('Add your Tasker URL first.');
  const url = fillUrl(st.taskerUrl, { start_in: 0, minutes: '1', messages: 'Test from IMS - dismiss me', interval: 1, repeats: 1, route: 'Test' });
  return { url, reply: await callTasker(url) };
}

/**
 * @param {object} o
 * @param {string} [o.date] YYYY-MM-DD (default today, London)
 * @param {string} o.time HH:MM start (London)
 * @param {number} [o.routeId]
 * @param {string} [o.routeName]
 * @param {number} o.durationMin
 * @param {{minute:number, grams?:number, ml?:number, km?:number, withCarbs?:boolean}[]} o.stops carb and water stops, merged by minute
 * @param {number} [o.postCarbs]
 */
export async function sendRunAlerts({ date, time, routeId = null, routeName = '', durationMin, stops = [], postCarbs = 0, refuelG = 0, startAtMs = null, plan = null, test = false, sessionId = null, sessionToken = null, sessionIntakes = null }) {
  // started from the phone: the exact moment the Start button was tapped
  if (startAtMs) { const lp = londonParts(startAtMs); date = lp.date; time = lp.time; }
  if (!/^\d{2}:\d{2}$/.test(String(time || ''))) throw new Error('Choose a start time.');
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : londonParts(Date.now()).date;
  const st = getAlertSettings();
  if (!st.calendar && !(st.tasker && st.taskerUrl) && !(st.push && st.pushTopic)) throw new Error('Turn on push notifications, Tasker or calendar alerts first.');
  await clearRunAlerts({ stopTasker: false, keepSessionId: sessionId }); // a new run replaces the Tasker timer on the phone anyway
  const route = routeId ? getRoute(Number(routeId)) : null;
  const name = route?.name || routeName || 'Run';
  const komoot = route?.source === 'komoot' && route.externalId ? `https://www.komoot.com/tour/${route.externalId}` : null;
  const list = [...stops].filter((x) => x.minute >= 0 && (x.grams || x.ml)).sort((a, b) => a.minute - b.minute);
  // the run-learning session: the plan as sent, and a record per stop for Taken / Skipped
  const startAt = startAtMs || Date.parse(`${addMinutes(day, time, 0).date}T${time}:00${londonOffset(day)}`);
  let session = sessionId ? { id: sessionId, token: sessionToken, intakes: sessionIntakes || [] } : null;
  if (session) startSession(session.id, startAt);
  else session = createSession({ routeId: route?.id ?? null, routeName: name, plan, stops: list, test, startedAt: startAt, status: startAtMs ? 'started' : 'scheduled' });
  setSetting(SESSION_KEY, String(session.id));
  const intakeAt = new Map((session.intakes || []).map((x) => [x.minute, x.id]));
  const base = publicBase();
  // Taken / Skipped on a reminder: tapping either records it (carbs taken also go to Nightscout) and dismisses it
  const intakeActions = (minute) => {
    const iid = intakeAt.get(minute);
    if (!base || !iid || !session.token) return null;
    const u = `${base}/api/run-start/log/${session.token}/${iid}`;
    return [`http, Taken, ${u}/taken, method=POST, headers.ngrok-skip-browser-warning=1, clear=true`, `http, Skipped, ${u}/skipped, method=POST, headers.ngrok-skip-browser-warning=1, clear=true`].join('; ');
  };
  const plain = list.map((x) => `${x.minute === 0 ? 'Start' : `${x.minute} min`}: ${[x.grams ? `${x.grams} g carbs` : '', x.ml ? `${x.ml} ml water` : ''].filter(Boolean).join(' + ')}`).join('\n');
  const events = [];
  const make = async (mins, title, description, popup = 0, duration = 5) => {
    if (!st.calendar) return; // calendar alerts switched off
    const at = addMinutes(day, time, mins);
    const ev = await createEvent({ title, date: at.date, time: at.time, durationMinutes: duration, description, popupMinutes: popup });
    events.push({ id: ev.id, calendarId: ev.calendarId, title, date: at.date, time: at.time });
  };
  // Start: the route link and the whole plan; a reminder 10 minutes before as well
  const startStop = list.find((x) => x.minute === 0);
  await make(0, `🏃 Start: ${name}${startStop ? ` - ${[startStop.grams ? `${startStop.grams} g carbs` : '', startStop.ml ? `${startStop.ml} ml water` : ''].filter(Boolean).join(' + ')}` : ''}`,
    `${komoot ? `Open the route in Komoot: ${komoot}\n\n` : ''}Run plan (${Math.round(durationMin)} min):\n${plain}${postCarbs || refuelG ? `\nAfter: ${refuelG || postCarbs} g carbs to refuel` : ''}\n\nSent from the IMS Run Planner.`, 10, Math.max(5, Math.round(durationMin)));
  for (const x of list.filter((s) => s.minute > 0)) {
    const what = [x.grams ? `${x.grams} g carbs` : '', x.ml ? `${x.ml} ml water` : ''].filter(Boolean).join(' + ');
    await make(x.minute, `${x.grams ? '🍬' : '💧'} ${what}${x.km != null ? ` · ${x.km} km` : ''}`, `Minute ${x.minute} of your run${x.km != null ? `, about ${x.km} km in` : ''}.`);
  }
  if (postCarbs || refuelG) await make(Math.round(durationMin), `🏁 Finish - ${refuelG || postCarbs} g carbs to refuel`, 'Within the hour after: refuel muscle glycogen, with some protein.');
  // Tasker on the phone: one request with the stops; it waits in the background and alarms at each
  let tasker = null;
  if (st.tasker && st.taskerUrl) {
    const [h, m] = time.split(':').map(Number);
    const now = londonParts(Date.now());
    const [nh, nm] = now.time.split(':').map(Number);
    const startInMin = day === now.date ? (h * 60 + m) - (nh * 60 + nm) : (h * 60 + m) + 1440 - (nh * 60 + nm);
    const values = taskerValues({ list, startInMin, name });
    try { const reply = await callTasker(fillUrl(st.taskerUrl, values)); tasker = { ok: true, values, reply }; }
    catch (err) { tasker = { ok: false, values, error: `Tasker did not answer (${err.message}) - is the phone on the same Wi-Fi with the Tasker profile on?` }; }
  }
  // push notifications: queued here, pushed at each minute by startRunPushQueue
  let push = null;
  if (st.push && st.pushTopic) {
    // pre-run route link straight away - not when the run is being started from the Ready notification
    if (!startAtMs) { try { await pushRouteLink({ name, komoot, distanceKm: route?.distanceKm, durationMin }); } catch { /* reminders still go */ } }
    const startMs = startAtMs || Date.parse(`${addMinutes(day, time, 0).date}T${time}:00${londonOffset(day)}`);
    const ins = db.prepare('INSERT INTO run_push_queue (due_at, title, message, tags, actions) VALUES (?, ?, ?, ?, ?)');
    const queued = [];
    const what = (x) => [x.grams ? `${x.grams} g carbs` : '', x.ml ? `${x.ml} ml water` : ''].filter(Boolean).join(' + ');
    const q = (mins, title, message, tags, actions = null) => { ins.run(startMs + mins * 60000, title, message, tags, actions); queued.push({ minute: mins, title }); };
    const startStop = list.find((x) => x.minute === 0);
    if (!startAtMs) q(-2, `Run in 2 minutes: ${name}`, `${startStop ? `Take ${what(startStop)} as you set off. ` : ''}${komoot ? `Route: ${komoot}` : ''}`.trim(), 'running', startStop ? intakeActions(0) : null);
    for (const x of list.filter((s2) => s2.minute > 0)) q(x.minute, `IMS Run: ${what(x)}`, `Minute ${x.minute}${x.km != null ? `, about ${x.km} km in` : ''}. Tap Taken or Skipped so IMS can learn.`, x.grams ? 'candy' : 'droplet', intakeActions(x.minute));
    if (postCarbs || refuelG) q(Math.round(durationMin), `IMS Run: finished - ${refuelG || postCarbs} g carbs to refuel`, 'Within the hour, with some protein.', 'checkered_flag');
    push = { ok: true, topic: st.pushTopic, queued };
  }
  const out = { sentAt: Date.now(), date: day, time, routeName: name, komoot, events, tasker, push, sessionId: session.id };
  setSetting(KEY, JSON.stringify(out));
  return out;
}

// The route as a GPX file, for watches and apps that don't use Komoot.
export function routeGpx(routeId) {
  const route = getRoute(Number(routeId));
  if (!route?.path?.length) throw new Error('Route not found.');
  const esc = (t) => String(t).replace(/[<&>"]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;', '"': '&quot;' }[c]));
  const pts = route.path.map(([lat, lon]) => `      <trkpt lat="${lat}" lon="${lon}"></trkpt>`).join('\n');
  return { name: route.name, gpx: `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="IMS Run Planner" xmlns="http://www.topografix.com/GPX/1/1">\n  <trk>\n    <name>${esc(route.name)}</name>\n    <trkseg>\n${pts}\n    </trkseg>\n  </trk>\n</gpx>\n` };
}

// ---- "Ready when you are": start the timer from the phone ----
// Sending with start "when I tap Start" doesn't fix a time: IMS pushes one notification now with a Start run
// button (and Open route, Cancel). Tapping Start - on the phone, or the watch if it shows notification
// actions - calls IMS through the public ngrok address with a one-time token, and everything (pushes,
// Tasker, calendar) is timed from that moment. The token is the only key, and it lapses after 12 hours.
const ARM_KEY = 'run_armed';
const ARM_TTL = 12 * 3600000;
const publicBase = () => (config.ngrok?.domain ? `https://${config.ngrok.domain}` : null);
export const armedRun = () => { try { const a = JSON.parse(getSetting(ARM_KEY) || 'null'); return a && Date.now() - a.armedAt < ARM_TTL ? a : null; } catch { return null; } };

export async function armRun(payload) {
  const st = getAlertSettings();
  if (!st.push || !st.pushTopic) throw new Error('Turn on push notifications - the Start button arrives as one.');
  const base = publicBase();
  if (!base) throw new Error('IMS needs its public address (NGROK_DOMAIN) for the phone to reach the Start button.');
  await clearRunAlerts();
  const token = crypto.randomBytes(16).toString('hex');
  const route = payload.routeId ? getRoute(Number(payload.routeId)) : null;
  const name = route?.name || payload.routeName || 'Run';
  const komoot = route?.source === 'komoot' && route.externalId ? `https://www.komoot.com/tour/${route.externalId}` : null;
  // the run-learning session is made now and started when Start is tapped; it keeps the plan
  const list = [...(payload.stops || [])].filter((x) => x.minute >= 0 && (x.grams || x.ml)).sort((a, b) => a.minute - b.minute);
  const session = createSession({ routeId: route?.id ?? null, routeName: name, plan: payload.plan || null, stops: list, test: Boolean(payload.test), status: 'armed' });
  setSetting(SESSION_KEY, String(session.id));
  const { plan: _plan, ...rest } = payload;
  setSetting(ARM_KEY, JSON.stringify({ token, armedAt: Date.now(), payload: { ...rest, sessionId: session.id, sessionToken: session.token, sessionIntakes: session.intakes }, name, komoot }));
  const startStop = (payload.stops || []).find((x) => x.minute === 0);
  const what = (x) => [x.grams ? `${x.grams} g carbs` : '', x.ml ? `${x.ml} ml water` : ''].filter(Boolean).join(' + ');
  const url = `${base}/api/run-start/${token}`;
  // ntfy action buttons: http actions are sent by the ntfy app itself; the ngrok header skips its browser page
  const actions = [
    // clear=false throughout: the notification stays until it's swiped away
    `http, Start run, ${url}, method=POST, headers.ngrok-skip-browser-warning=1, clear=false`,
    komoot ? `view, Open route, ${komoot}, clear=false` : null,
    `http, Cancel, ${url}/cancel, method=POST, headers.ngrok-skip-browser-warning=1, clear=false`,
  ].filter(Boolean).join('; ');
  // No separate "Your route" notification here: Android groups notifications from one topic, which hides the
  // buttons - so the Ready notification carries it all (tap it or Open route for Komoot, Start run, Cancel).
  await pushNow({
    title: `Ready when you are: ${name}`,
    message: `Tap Start run as you set off - the reminders are timed from then.${startStop ? ` Take ${what(startStop)} as you go.` : ''}${komoot ? ' Open route opens it in Komoot.' : ''}`,
    tags: 'running', priority: 4, actions, click: komoot,
  });
  return { armed: true, name, komoot, expiresAt: Date.now() + ARM_TTL, sessionId: session.id };
}

// The Ready notification stays on screen (only a swipe dismisses it), so its buttons can be pressed again:
// Start after starting is a no-op, and Cancel after starting stops that run's remaining reminders.
const STARTED_KEY = 'run_started_token';
export async function startArmedRun(token) {
  const a = armedRun();
  if ((!a || token !== a.token) && token && getSetting(STARTED_KEY) === token) return { alreadyStarted: true };
  if (!a || !token || token !== a.token) {
    // an older Ready notification (they stay until swiped): say so on the phone rather than fail with an error
    try { await pushNow({ title: 'That Start button is out of date', message: 'A newer run was sent since - use the newest "Ready when you are" notification, and swipe the old ones away.', tags: 'warning', priority: 4 }); } catch { /* nothing more to do */ }
    return { stale: true };
  }
  setSetting(ARM_KEY, 'null'); // one use
  setSetting(STARTED_KEY, token);
  const out = await sendRunAlerts({ ...a.payload, startAtMs: Date.now() });
  const startIntake = (a.payload.sessionIntakes || []).find((x) => x.minute === 0);
  if (startIntake && a.payload.sessionToken) { try { await recordIntakeFromPhone(a.payload.sessionToken, startIntake.id, 'taken'); } catch { /* can be marked later */ } }
  const first = (a.payload.stops || []).filter((x) => x.minute > 0)[0];
  try {
    await pushNow({ title: `Timer started: ${a.name}`, message: first ? `First reminder at ${first.minute} min.` : 'No stops during this run.', tags: 'stopwatch', priority: 3, click: a.komoot });
  } catch { /* the reminders are queued regardless */ }
  return out;
}

export async function cancelArmedRun(token) {
  const a = armedRun();
  // after Start: stop the run that this notification started
  if ((!a || token !== a.token) && token && getSetting(STARTED_KEY) === token) {
    setSetting(STARTED_KEY, '');
    const out = await clearRunAlerts();
    try { await pushNow({ title: 'Run reminders stopped', message: 'No more reminders for this run.', tags: 'no_entry', priority: 3 }); } catch { /* stopped regardless */ }
    return { cancelled: true, ...out };
  }
  if (!a || token !== a.token) return { stale: true }; // an old notification: nothing of it is still running
  setSetting(ARM_KEY, 'null');
  if (a.payload?.sessionId) endPendingSession(a.payload.sessionId);
  return { cancelled: true };
}
