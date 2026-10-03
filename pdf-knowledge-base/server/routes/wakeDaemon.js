import { Router } from 'express';
import { wakeDaemonService } from '../services/wakeDaemonService.js';

const router = Router();
const fail = (res, err, code = 500) => res.status(code).json({ success: false, error: err.message });

// Telemetry & health status endpoint
router.get('/status', (req, res) => {
  try {
    res.json({
      success: true,
      status: wakeDaemonService.getDaemonStatus()
    });
  } catch (err) {
    fail(res, err);
  }
});

// Detailed activity log stream endpoint
router.get('/logs', (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query?.limit || 50)));
    res.json({
      success: true,
      logs: wakeDaemonService.getRecentLogs(limit)
    });
  } catch (err) {
    fail(res, err);
  }
});

// Manual reset / force standby endpoint
router.post('/reset', (req, res) => {
  try {
    wakeDaemonService.forceStandby('manual_user_reset');
    res.json({
      success: true,
      message: 'Wake daemon reset to STANDBY',
      status: wakeDaemonService.getDaemonStatus()
    });
  } catch (err) {
    fail(res, err);
  }
});

// Auto-recovery / health watchdog heal endpoint
router.post('/recover', (req, res) => {
  try {
    const result = wakeDaemonService.autoRecover();
    res.json({
      success: true,
      message: result.recovered ? 'Wake daemon self-healed stuck state' : 'Wake daemon is healthy',
      ...result
    });
  } catch (err) {
    fail(res, err);
  }
});

// Trigger touch-to-talk from web interface
router.post('/touch', (req, res) => {
  try {
    wakeDaemonService.notifyTouchToTalk(req.body?.source || 'web');
    res.json({
      success: true,
      message: 'Touch-to-talk initiated',
      status: wakeDaemonService.getDaemonStatus()
    });
  } catch (err) {
    fail(res, err);
  }
});

export default router;
