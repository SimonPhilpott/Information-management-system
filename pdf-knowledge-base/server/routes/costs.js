import express from 'express';
import { getCosts, saveFixedCosts, savePrices, saveBudget } from '../services/costService.js';

// Costs: /api/costs
const router = express.Router();

router.get('/', (req, res) => {
  try { res.json({ success: true, ...getCosts(String(req.query.period || 'month')) }); }
  catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.put('/fixed', (req, res) => {
  try { res.json({ success: true, fixed: saveFixedCosts(req.body?.fixed) }); }
  catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// { prices: { model: { input, output } | null }, usdToGbp }
router.put('/prices', (req, res) => {
  try { res.json({ success: true, ...savePrices(req.body?.prices, req.body?.usdToGbp) }); }
  catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

// { capGBP } - monthly Gemini budget in pounds (0 = none)
router.put('/budget', (req, res) => {
  try { res.json({ success: true, capGBP: saveBudget(req.body?.capGBP) }); }
  catch (err) { res.status(400).json({ success: false, error: err.message }); }
});

export default router;
