import { Router } from 'express';
import { requireSession } from '../middleware/requireSession.js';
import {
  refreshEvents, getCachedStatus, getUpcomingEvents, listCalendars, getSettingsView, saveSettings,
  listRules, addRule, updateRule, deleteRule, createEvent, deleteEvent, addReminderToCalendar, getCalendarLinks, getDeviceIcons,
} from '../services/calendarService.js';
import { pushScheduleNow } from '../services/deviceBus.js';

const router = Router();

// Your calendar is personal: every route needs THIS browser signed in with the approved Google account.
router.use(requireSession);

const fail = (res, err, code = 400) => res.status(code).json({ error: err.message });

router.get('/', async (req, res) => {
  const days = Math.max(1, Math.min(30, Number(req.query.days) || 14));
  await refreshEvents({ force: req.query.refresh === '1' });
  res.json({ success: true, status: getCachedStatus(), settings: getSettingsView(), events: await getUpcomingEvents(days), deviceIcons: getDeviceIcons() });
});

router.get('/calendars', async (req, res) => {
  try { res.json({ success: true, calendars: await listCalendars() }); } catch (err) { fail(res, err); }
});

router.put('/settings', (req, res) => {
  try { res.json({ success: true, settings: saveSettings(req.body || {}) }); } catch (err) { fail(res, err); }
});

router.get('/rules', (req, res) => res.json({ success: true, rules: listRules() }));

router.post('/rules', (req, res) => {
  try { const rule = addRule(req.body || {}); pushScheduleNow(); res.json({ success: true, rule }); } catch (err) { fail(res, err); }
});

router.put('/rules/:id', (req, res) => {
  try { const rule = updateRule(Number(req.params.id), req.body || {}); pushScheduleNow(); res.json({ success: true, rule }); } catch (err) { fail(res, err); }
});

router.delete('/rules/:id', (req, res) => {
  if (!deleteRule(Number(req.params.id))) return fail(res, new Error('Rule not found.'), 404);
  pushScheduleNow();
  res.json({ success: true });
});

router.post('/events', async (req, res) => {
  try { res.json({ success: true, event: await createEvent(req.body || {}) }); } catch (err) { fail(res, err); }
});

router.delete('/events/:calendarId/:eventId', async (req, res) => {
  try { await deleteEvent(req.params.calendarId, req.params.eventId); res.json({ success: true }); } catch (err) { fail(res, err); }
});

router.get('/links', (req, res) => res.json({ success: true, links: getCalendarLinks() }));

router.post('/from-reminder/:id', async (req, res) => {
  try { res.json({ success: true, ...(await addReminderToCalendar(Number(req.params.id))) }); } catch (err) { fail(res, err); }
});

export default router;
