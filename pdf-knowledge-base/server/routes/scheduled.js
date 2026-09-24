import { Router } from 'express';
import { scheduleItem, listScheduledItems, cancelScheduledItem, updateScheduledItem, getArchivedItems, getScheduleEvents } from '../services/remindersService.js';

// One shared router mounted three times (/api/alarms, /api/timers,
// /api/reminders) rather than three near-identical files - alarms, timers
// and reminders are the same underlying scheduled_items row (see
// remindersService.js), differing only in `type`, which this router pins
// from how it was mounted rather than trusting the request body.
export default function scheduledRouter(type) {
  const router = Router();

  router.get('/', (req, res) => {
    try {
      res.json({ success: true, items: listScheduledItems(type) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Finished items: cancelled, or gone off (acknowledged / unanswered).
  // ?days=30 (0 = all time) & ?search=text
  router.get('/archive', (req, res) => {
    try {
      const days = req.query.days === undefined ? 30 : Number(req.query.days);
      res.json({ success: true, items: getArchivedItems({ type, days, search: req.query.search || '' }) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // The timeline of everything that happened to these items (created, edited,
  // went off, dismissed, cancelled...). ?days=7
  router.get('/events', (req, res) => {
    try {
      const days = Number(req.query.days) || 7;
      res.json({ success: true, events: getScheduleEvents({ type, sinceMs: Date.now() - days * 86400000 }) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/', (req, res) => {
    try {
      const item = scheduleItem({ ...req.body, type });
      res.json({ success: true, item });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.put('/:id', (req, res) => {
    try {
      const item = updateScheduledItem(Number(req.params.id), req.body || {});
      res.json({ success: true, item });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/:id', (req, res) => {
    try {
      const cancelled = cancelScheduledItem(Number(req.params.id));
      if (!cancelled) return res.status(404).json({ error: 'Item not found' });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
