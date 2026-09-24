import { Router } from 'express';
import { listBirthdays, addBirthday, updateBirthday, deleteBirthday, restoreBirthday, getArchivedBirthdays, getRecentlyPassedBirthdays } from '../services/birthdayService.js';

// No direct WS push to hardware here (would need a circular import back to
// index.js, which owns the hardware socket) - the existing 15s schedule-poll
// in index.js already unconditionally re-pushes full footer status every
// tick, so a web edit here reaches the device within 15s regardless.
const router = Router();

router.get('/', (req, res) => {
  try {
    res.json({ success: true, birthdays: listBirthdays() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deleted birthdays, plus the ones that have recently passed (last 30 days).
router.get('/archive', (req, res) => {
  try {
    res.json({ success: true, deleted: getArchivedBirthdays(), recentlyPassed: getRecentlyPassedBirthdays(Number(req.query.days) || 30) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/restore', (req, res) => {
  try {
    if (!restoreBirthday(Number(req.params.id))) return res.status(404).json({ error: 'Archived birthday not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const birthday = addBirthday(req.body || {});
    res.json({ success: true, birthday });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const birthday = updateBirthday(Number(req.params.id), req.body || {});
    res.json({ success: true, birthday });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const deleted = deleteBirthday(Number(req.params.id));
    if (!deleted) return res.status(404).json({ error: 'Birthday not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
