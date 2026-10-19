import db from '../db/database.js';
import { listIdeas } from './devIdeasService.js';
import { getUpcomingEvents } from './calendarService.js';
import { listScheduledItems } from './remindersService.js';

// "What did I get done today?" - the end-of-day wrap-up Ims gives: what got done and started today (background
// tasks, drafts, dev ideas, instructions he carried out), and what's lined up for tomorrow (calendar, alarms and
// reminders). Health and running stay out - those are for the day report.

const tz = 'Europe/London';
const day = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: tz });
const clock = (ms) => new Date(ms).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' });

export async function getDayWrapUp(now = Date.now()) {
  const today = day(now), tomorrow = day(now + 86400000);
  const sinceMidnight = (ms) => ms && day(ms) === today;
  const out = { date: today };

  const tasks = db.prepare('SELECT title, status, kind, created_at, finished_at FROM tasks WHERE created_at > ? OR finished_at > ?').all(now - 2 * 86400000, now - 2 * 86400000);
  out.researchFinished = tasks.filter((t) => t.kind !== 'draft' && t.status === 'done' && sinceMidnight(t.finished_at)).map((t) => t.title);
  out.researchStillRunning = tasks.filter((t) => t.kind !== 'draft' && (t.status === 'queued' || t.status === 'running')).map((t) => t.title);
  out.draftsWritten = tasks.filter((t) => t.kind === 'draft' && sinceMidnight(t.created_at)).map((t) => t.title);

  try {
    const ideas = listIdeas({});
    out.devIdeasAdded = ideas.filter((i) => sinceMidnight(i.createdAt)).map((i) => i.text.slice(0, 140));
    out.devIdeasDone = ideas.filter((i) => i.status === 'done' && sinceMidnight(i.updatedAt)).map((i) => i.text.slice(0, 140));
  } catch (_) { /* none */ }

  try {
    const rows = db.prepare('SELECT instruction, status, last_done_at FROM ims_instructions WHERE last_done_at > ?').all(now - 86400000);
    out.instructionsCarriedOut = rows.filter((r) => sinceMidnight(r.last_done_at)).map((r) => r.instruction);
  } catch (_) { /* none */ }

  try {
    const events = await getUpcomingEvents(2);
    const line = (e) => `${e.allDay ? 'all day' : e.time}${e.endTime && !e.allDay ? `-${e.endTime}` : ''} ${e.title}${e.location ? ` (${e.location})` : ''}`;
    out.calendarRestOfToday = events.filter((e) => e.date === today && (e.allDay || !e.startMs || e.startMs > now)).map(line);
    out.calendarTomorrow = events.filter((e) => e.date <= tomorrow && e.endDate >= tomorrow).map(line);
  } catch (err) { out.calendar = `could not be read (${err.message})`; }

  try {
    out.alarmsAndRemindersTomorrow = listScheduledItems().filter((i) => i.fireAt && day(Date.parse(i.fireAt)) === tomorrow)
      .map((i) => `${i.type} ${clock(Date.parse(i.fireAt))}${i.label ? ` "${i.label}"` : ''}`);
  } catch (_) { /* none */ }

  return out;
}
