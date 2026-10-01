import { Router } from 'express';
import { globalSearch } from '../services/globalSearchService.js';

// GET /api/search?q=... - the Command Palette's search across every service.
const router = Router();
router.get('/', async (req, res) => {
  try { res.json({ success: true, ...(await globalSearch(req.query.q)) }); } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});
export default router;
