import { google } from 'googleapis';
import db, { getSetting, setSetting } from '../db/database.js';
import { getAuthenticatedClient } from './driveService.js';
import { scheduleItem } from './remindersService.js';

// Google Calendar for Ims: reads the user's events (bin-day style noise
// filtered out before anything else sees them), runs user-defined rules on
// them (show an icon on the device, or set a reminder), and lets the user add
// events - including from a reminder. Events are cached for a few minutes and
// only the cache is read when pushing to the device, so nothing here blocks it.
const TZ = 'Europe/London';
const CACHE_MS = 5 * 60 * 1000;
const WINDOW_DAYS = 30;

db.exec(`
  CREATE TABLE IF NOT EXISTS calendar_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    match_text TEXT NOT NULL,
    days_before INTEGER NOT NULL DEFAULT 0,
    action TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    slot TEXT,
    remind_minutes INTEGER,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS calendar_rule_fires (
    rule_id INTEGER NOT NULL,
    event_key TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (rule_id, event_key)
  );
  CREATE TABLE IF NOT EXISTS calendar_links (
    item_id INTEGER PRIMARY KEY,
    event_id TEXT NOT NULL,
    calendar_id TEXT NOT NULL,
    link TEXT,
    created_at INTEGER NOT NULL
  );
`);

// Seed the rules for pod changes and sensor starts once. Editable on /ims/calendar.
if (!db.prepare('SELECT COUNT(*) AS n FROM calendar_rules').get().n && getSetting('calendar_rules_seeded') !== '1') {
  const ins = db.prepare(`INSERT INTO calendar_rules (name, match_text, days_before, action, icon, color, slot, created_at) VALUES (?, ?, ?, 'icon', ?, ?, ?, ?)`);
  const now = Date.now();
  ins.run('Pod change', 'Change pod', 0, 'pod', 'white', 'below', now);
  ins.run('Sensor starts today', 'Activate sensor', 0, 'sensor', 'white', 'above', now);
  ins.run('Sensor starts tomorrow', 'Activate sensor', 1, 'sensor', 'orange', 'above', now);
  setSetting('calendar_rules_seeded', '1');
}

// Second seed (added later): prescription / Libre-order days show the prescription icon.
if (getSetting('calendar_rules_seeded_v2') !== '1') {
  const ins = db.prepare(`INSERT INTO calendar_rules (name, match_text, days_before, action, icon, color, slot, created_at) VALUES (?, ?, 0, 'icon', 'prescription', 'white', 'lower', ?)`);
  const now = Date.now();
  ins.run('Order more Libres', 'order more libre', now);
  ins.run('Prescription', 'prescription', now);
  setSetting('calendar_rules_seeded_v2', '1');
}

const readJson = (key, fallback) => { try { const v = getSetting(key); return v ? JSON.parse(v) : fallback; } catch (_) { return fallback; } };
const DEFAULT_EXCLUDES = ['bin', 'bins', 'recycling', 'refuse', 'garden waste'];

export const getSettingsView = () => ({
  calendarIds: readJson('calendar_ids', ['primary']),
  excludeWords: readJson('calendar_exclude_words', DEFAULT_EXCLUDES),
});

export function saveSettings({ calendarIds, excludeWords }) {
  if (Array.isArray(calendarIds) && calendarIds.length) setSetting('calendar_ids', JSON.stringify(calendarIds.map(String)));
  if (Array.isArray(excludeWords)) setSetting('calendar_exclude_words', JSON.stringify(excludeWords.map((w) => String(w).trim()).filter(Boolean)));
  cache.at = 0;
  return getSettingsView();
}

// ---- London date helpers ---------------------------------------------------
const partsFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function londonParts(ms) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
const todayStr = () => londonParts(Date.now()).date;
// Calendar-day arithmetic on YYYY-MM-DD strings (UTC maths is exact for whole days).
const addDays = (dateStr, n) => { const d = new Date(`${dateStr}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ---- filtering -------------------------------------------------------------
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function isExcluded(title, calendarName = '') {
  const words = getSettingsView().excludeWords;
  const hay = `${title} ${calendarName}`;
  return words.some((w) => new RegExp(`(^|[^a-z0-9])${escapeRe(w)}([^a-z0-9]|$)`, 'i').test(hay));
}

// ---- fetching --------------------------------------------------------------
const cache = { at: 0, events: [], hidden: 0, error: null, needsReconnect: false, connected: false };

function friendlyError(err) {
  const msg = err?.errors?.[0]?.message || err?.message || String(err);
  const code = err?.code || err?.response?.status;
  const notEnabled = /has not been used|is disabled|accessNotConfigured/i.test(msg);
  const scope = code === 403 && /insufficient|scope/i.test(msg);
  return {
    message: notEnabled ? 'The Google Calendar API is not switched on for your Google Cloud project yet. Enable "Google Calendar API" in the Cloud console, then try again.'
      : scope || code === 401 ? 'Ims does not have permission to use your calendar yet. Press "Connect Google Calendar" to grant it.'
      : msg,
    needsReconnect: Boolean(scope || code === 401),
    notEnabled,
  };
}

function normalise(e, calendarId, calendarName) {
  const allDay = Boolean(e.start?.date);
  const startMs = allDay ? new Date(`${e.start.date}T00:00:00Z`).getTime() : new Date(e.start.dateTime).getTime();
  const date = allDay ? e.start.date : londonParts(startMs).date;
  let endDate = date;
  if (allDay && e.end?.date) endDate = addDays(e.end.date, -1); // Google's all-day end is exclusive
  else if (!allDay && e.end?.dateTime) endDate = londonParts(new Date(e.end.dateTime).getTime()).date;
  return {
    id: e.id, calendarId, calendarName,
    title: e.summary || '(no title)', allDay, date, endDate,
    time: allDay ? null : londonParts(startMs).time,
    endTime: allDay || !e.end?.dateTime ? null : londonParts(new Date(e.end.dateTime).getTime()).time,
    startMs, location: e.location || null, link: e.htmlLink || null,
  };
}

export async function refreshEvents({ force = false } = {}) {
  if (!force && Date.now() - cache.at < CACHE_MS) return cache;
  const auth = getAuthenticatedClient();
  if (!auth) { Object.assign(cache, { at: Date.now(), connected: false, events: [], error: 'Sign in with Google first.', needsReconnect: true }); return cache; }
  try {
    const cal = google.calendar({ version: 'v3', auth });
    const { calendarIds } = getSettingsView();
    const from = addDays(todayStr(), -1);
    const to = addDays(todayStr(), WINDOW_DAYS);
    const all = [];
    let hidden = 0;
    for (const calendarId of calendarIds) {
      let calendarName = calendarId;
      try { calendarName = (await cal.calendarList.get({ calendarId })).data.summary || calendarId; } catch (_) { /* name is only used for filtering */ }
      const res = await cal.events.list({
        calendarId, timeMin: `${from}T00:00:00Z`, timeMax: `${to}T00:00:00Z`,
        singleEvents: true, orderBy: 'startTime', maxResults: 250,
      });
      for (const e of res.data.items || []) {
        if (e.status === 'cancelled' || !(e.start?.date || e.start?.dateTime)) continue;
        const ev = normalise(e, calendarId, calendarName);
        if (isExcluded(ev.title, calendarName)) { hidden++; continue; }
        all.push(ev);
      }
    }
    all.sort((a, b) => a.startMs - b.startMs);
    Object.assign(cache, { at: Date.now(), events: all, hidden, error: null, needsReconnect: false, connected: true });
    applyReminderRules(all);
  } catch (err) {
    const f = friendlyError(err);
    console.error('[Calendar] refresh failed:', err.message);
    // Keep the last good events, so a brief outage does not blank the device icons.
    Object.assign(cache, { at: Date.now() - CACHE_MS + 30000, error: f.message, needsReconnect: f.needsReconnect, notEnabled: f.notEnabled, connected: false });
  }
  return cache;
}

export const getCachedStatus = () => ({ connected: cache.connected, error: cache.error, needsReconnect: cache.needsReconnect, notEnabled: Boolean(cache.notEnabled), hiddenCount: cache.hidden, fetchedAt: cache.at || null });

export async function listCalendars() {
  const auth = getAuthenticatedClient();
  if (!auth) throw new Error('Sign in with Google first.');
  try {
    const res = await google.calendar({ version: 'v3', auth }).calendarList.list();
    return (res.data.items || []).map((c) => ({ id: c.id, name: c.summary, primary: Boolean(c.primary) }));
  } catch (err) { throw new Error(friendlyError(err).message); }
}

// Events for the next `days` days from today (cached list).
export async function getUpcomingEvents(days = 14) {
  await refreshEvents();
  const from = todayStr(), to = addDays(from, days);
  return cache.events.filter((e) => e.endDate >= from && e.date <= to);
}

export const getEventsOn = (dateStr) => cache.events.filter((e) => e.date <= dateStr && e.endDate >= dateStr);

// ---- rules -----------------------------------------------------------------
const ruleRow = (r) => ({ id: r.id, name: r.name, matchText: r.match_text, daysBefore: r.days_before, action: r.action, icon: r.icon, color: r.color, slot: r.slot, remindMinutes: r.remind_minutes, enabled: Boolean(r.enabled) });
export const listRules = () => db.prepare('SELECT * FROM calendar_rules ORDER BY id').all().map(ruleRow);

const ICONS = ['pod', 'sensor', 'prescription'];
const COLORS = ['white', 'orange'];
// Each icon has one fixed place on the device, right of the face around the glucose reading.
const SLOT_FOR = { sensor: 'above', pod: 'below', prescription: 'lower' };

function checkRule(r) {
  if (!String(r.name || '').trim()) throw new Error('Give the rule a name.');
  if (!String(r.matchText || '').trim()) throw new Error('Say which event titles the rule applies to.');
  const days = Number(r.daysBefore ?? 0);
  if (!Number.isInteger(days) || days < 0 || days > 14) throw new Error('"Days before" must be a whole number from 0 to 14.');
  if (r.action === 'icon') {
    if (!ICONS.includes(r.icon)) throw new Error('Pick an icon.');
    if (!COLORS.includes(r.color)) throw new Error('Pick an icon colour.');
  } else if (r.action === 'remind') {
    const m = Number(r.remindMinutes ?? 0);
    if (!Number.isInteger(m) || m < 0 || m > 7 * 24 * 60) throw new Error('Minutes before must be a whole number.');
  } else throw new Error('Unknown rule action.');
  return days;
}

export function addRule(r) {
  const days = checkRule(r);
  const info = db.prepare(`INSERT INTO calendar_rules (name, match_text, days_before, action, icon, color, slot, remind_minutes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(r.name.trim(), r.matchText.trim(), days, r.action, r.action === 'icon' ? r.icon : null, r.action === 'icon' ? r.color : null, r.action === 'icon' ? SLOT_FOR[r.icon] : null, r.action === 'remind' ? Number(r.remindMinutes || 0) : null, Date.now());
  cache.at = 0;
  return ruleRow(db.prepare('SELECT * FROM calendar_rules WHERE id = ?').get(info.lastInsertRowid));
}

export function updateRule(id, r) {
  const existing = db.prepare('SELECT * FROM calendar_rules WHERE id = ?').get(id);
  if (!existing) throw new Error('Rule not found.');
  const merged = { ...ruleRow(existing), ...r };
  const days = checkRule(merged);
  db.prepare(`UPDATE calendar_rules SET name = ?, match_text = ?, days_before = ?, action = ?, icon = ?, color = ?, slot = ?, remind_minutes = ?, enabled = ? WHERE id = ?`)
    .run(merged.name.trim(), merged.matchText.trim(), days, merged.action, merged.action === 'icon' ? merged.icon : null, merged.action === 'icon' ? merged.color : null, merged.action === 'icon' ? SLOT_FOR[merged.icon] : null, merged.action === 'remind' ? Number(merged.remindMinutes || 0) : null, merged.enabled ? 1 : 0, id);
  cache.at = 0;
  return ruleRow(db.prepare('SELECT * FROM calendar_rules WHERE id = ?').get(id));
}

export function deleteRule(id) {
  db.prepare('DELETE FROM calendar_rule_fires WHERE rule_id = ?').run(id);
  return db.prepare('DELETE FROM calendar_rules WHERE id = ?').run(id).changes > 0;
}

const titleMatches = (ev, rule) => ev.title.toLowerCase().includes(rule.matchText.toLowerCase());

// The icons the device should show right now, worked out from the cached events
// and the enabled icon rules. Two rules can want the same slot (sensor today and
// sensor tomorrow): the nearer day wins, so "today" (white) beats "tomorrow" (orange).
export function getDeviceIcons() {
  const today = todayStr();
  const bySlot = {};
  for (const rule of listRules().filter((r) => r.enabled && r.action === 'icon')) {
    const target = addDays(today, rule.daysBefore); // events starting on this date trigger the rule today
    const hit = cache.events.some((ev) => titleMatches(ev, rule) && (rule.daysBefore === 0 ? ev.date <= today && ev.endDate >= today : ev.date === target));
    if (!hit) continue;
    const cur = bySlot[rule.icon];
    if (!cur || rule.daysBefore < cur.daysBefore) bySlot[rule.icon] = { icon: rule.icon, color: rule.color, slot: rule.slot, daysBefore: rule.daysBefore };
  }
  return Object.values(bySlot).map(({ icon, color, slot }) => ({ icon, color, slot }));
}

// 'remind' rules turn matching events into ordinary Ims reminders, once each.
function applyReminderRules(events) {
  const rules = listRules().filter((r) => r.enabled && r.action === 'remind');
  const now = Date.now();
  for (const rule of rules) {
    for (const ev of events) {
      if (!titleMatches(ev, rule)) continue;
      const key = `${ev.calendarId}:${ev.id}:${ev.date}${ev.time || ''}`;
      if (db.prepare('SELECT 1 FROM calendar_rule_fires WHERE rule_id = ? AND event_key = ?').get(rule.id, key)) continue;
      try {
        const label = `${ev.title}${ev.time ? ` at ${ev.time}` : ''}`;
        if (ev.allDay) {
          const day = addDays(ev.date, -rule.daysBefore);
          if (day < todayStr() || (day === todayStr() && londonParts(now).time >= '08:00')) continue;
          scheduleItem({ type: 'reminder', label, time: '08:00', date: day });
        } else {
          const fireMs = ev.startMs - rule.remindMinutes * 60000;
          if (fireMs <= now + 30000) continue;
          scheduleItem({ type: 'reminder', label, whenSeconds: Math.round((fireMs - now) / 1000) });
        }
        db.prepare('INSERT INTO calendar_rule_fires (rule_id, event_key, created_at) VALUES (?, ?, ?)').run(rule.id, key, now);
        console.log(`[Calendar] Rule "${rule.name}" set a reminder for "${label}"`);
      } catch (err) { console.error(`[Calendar] Rule "${rule.name}" could not set a reminder:`, err.message); }
    }
  }
}

// ---- writing ---------------------------------------------------------------
function calendarApi() {
  const auth = getAuthenticatedClient();
  if (!auth) throw new Error('Sign in with Google first.');
  return google.calendar({ version: 'v3', auth });
}

const validDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const validTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || ''));

export async function createEvent({ title, date, time, durationMinutes = 30, description, location, calendarId }) {
  if (!String(title || '').trim()) throw new Error('The event needs a title.');
  if (!validDate(date)) throw new Error('The event needs a date (YYYY-MM-DD).');
  if (time && !validTime(time)) throw new Error('The time must be HH:MM (24-hour).');
  const calId = calendarId || getSettingsView().calendarIds[0] || 'primary';
  const body = { summary: String(title).trim(), description: description || undefined, location: location || undefined };
  if (time) {
    // Send London wall time with an explicit zone so Google handles BST/GMT itself.
    const [h, m] = time.split(':').map(Number);
    const endTotal = h * 60 + m + Math.max(5, Number(durationMinutes) || 30);
    const endDate = endTotal >= 1440 ? addDays(date, 1) : date;
    const et = endTotal % 1440;
    const endTime = `${String(Math.floor(et / 60)).padStart(2, '0')}:${String(et % 60).padStart(2, '0')}`;
    body.start = { dateTime: `${date}T${time}:00`, timeZone: TZ };
    body.end = { dateTime: `${endDate}T${endTime}:00`, timeZone: TZ };
  } else {
    body.start = { date };
    body.end = { date: addDays(date, 1) };
  }
  try {
    const res = await calendarApi().events.insert({ calendarId: calId, requestBody: body });
    cache.at = 0;
    return normalise(res.data, calId, calId);
  } catch (err) { throw new Error(friendlyError(err).message); }
}

export async function deleteEvent(calendarId, eventId) {
  try { await calendarApi().events.delete({ calendarId, eventId }); cache.at = 0; return true; }
  catch (err) { throw new Error(friendlyError(err).message); }
}

// Put one reminder/alarm on the Google Calendar, once.
export async function addReminderToCalendar(itemId) {
  const item = db.prepare(`SELECT * FROM scheduled_items WHERE id = ?`).get(itemId);
  if (!item) throw new Error('Reminder not found.');
  if (item.type === 'timer') throw new Error('Timers are short countdowns - only alarms and reminders can go on the calendar.');
  const existing = db.prepare('SELECT * FROM calendar_links WHERE item_id = ?').get(itemId);
  if (existing) return { alreadyAdded: true, link: existing.link };
  const when = item.scheduled_for || item.fire_at;
  const p = londonParts(when);
  const ev = await createEvent({ title: item.label || (item.type === 'alarm' ? 'Alarm' : 'Reminder'), date: p.date, time: p.time, durationMinutes: 15 });
  db.prepare('INSERT INTO calendar_links (item_id, event_id, calendar_id, link, created_at) VALUES (?, ?, ?, ?, ?)').run(itemId, ev.id, ev.calendarId, ev.link, Date.now());
  return { alreadyAdded: false, link: ev.link, event: ev };
}

export const getCalendarLinks = () => Object.fromEntries(db.prepare('SELECT item_id, link FROM calendar_links').all().map((r) => [r.item_id, r.link || true]));

// Plain sentence list for Ims (spoken/morning report), London dates.
export function describeEvents(events) {
  return events.map((e) => `${e.title} on ${e.date}${e.time ? ` at ${e.time}` : ' (all day)'}${e.location ? ` at ${e.location}` : ''}`);
}
