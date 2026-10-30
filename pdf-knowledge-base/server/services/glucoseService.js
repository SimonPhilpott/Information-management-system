import db, { getSetting, setSetting } from '../db/database.js';
import eventBus from './eventBus.js';
import logger from './loggerService.js';
/**
 * Nightscout Blood Glucose Monitoring Service for IMS
 * Polls Nightscout API every 60 seconds and extracts blood glucose (mmol/L) and trend direction.
 * Endpoint: https://simon-philpott-nightscout.herokuapp.com/api/v2/properties.json
 */

const NIGHTSCOUT_URL = 'https://simon-philpott-nightscout.herokuapp.com/api/v2/properties.json';
const POLL_INTERVAL_MS = 60 * 1000; // 1 minute

let cachedGlucose = {
  value: '--',
  numericValue: null,
  direction: 'Flat',
  range: 'unknown',
  colorHex: '#8C96AF',
  colorRgb: { r: 140, g: 150, b: 175 },
  timestamp: 0,
  stale: true,
  delta: '',
  dbPct: null
};

let pollTimer = null;
const listeners = new Set();
let lastT1DAlertTime = 0;
// Simon can switch each glucose phone alert off (30 Oct 2026); both stay on until he does
const ALERT_KEY = 'glucose_phone_alerts';
export function getGlucoseAlertSettings() {
  let s = {}; try { s = JSON.parse(getSetting(ALERT_KEY) || '{}'); } catch (_) { /* default */ }
  return { hypo: s.hypo !== false, falling: s.falling !== false };
}
export function setGlucoseAlertSettings(next = {}) {
  const cur = getGlucoseAlertSettings();
  const s = { hypo: typeof next.hypo === 'boolean' ? next.hypo : cur.hypo, falling: typeof next.falling === 'boolean' ? next.falling : cur.falling };
  setSetting(ALERT_KEY, JSON.stringify(s)); logger.info('Glucose', `Phone alerts: hypo ${s.hypo ? 'on' : 'off'}, falling ${s.falling ? 'on' : 'off'}`);
  return s;
}
let lastAlertLevel = null;

async function checkT1DPhoneAlert(g) {
  if (!g || g.numericValue == null || isNaN(g.numericValue)) return;
  const now = Date.now();
  const val = g.numericValue;
  const dir = g.direction || 'Flat';

  // 1. Hypo alert (< 4.0 mmol/L)
  const alerts = getGlucoseAlertSettings();
  if (val < 4.0) {
    if (alerts.hypo && (now - lastT1DAlertTime > 15 * 60 * 1000 || lastAlertLevel !== 'low')) {
      lastT1DAlertTime = now;
      lastAlertLevel = 'low';
      try {
        const { pushPhoneNotification } = await import('./runAlertsService.js');
        await pushPhoneNotification({
          title: `🩸 Hypo Warning: ${val.toFixed(1)} mmol/L (${dir})`,
          message: `Blood glucose is below 4.0 mmol/L. Fast-acting carbs recommended.`,
          tags: 'candy,warning',
          priority: 5,
          alarm: true,
          click: 'ims-dock://open',
          actions: 'view, Open Side Dock, ims-dock://open'
        });
      } catch (_) {}
    }
    return;
  }

  // 2. Rapid drop alert (e.g. SingleDown, DoubleDown with val < 6.0)
  const isRapidDrop = (dir === 'SingleDown' || dir === 'DoubleDown' || dir === 'FortyFiveDown') && val < 6.0;
  if (isRapidDrop) {
    if (alerts.falling && now - lastT1DAlertTime > 20 * 60 * 1000) {
      lastT1DAlertTime = now;
      lastAlertLevel = 'dropping';
      try {
        const { pushPhoneNotification } = await import('./runAlertsService.js');
        await pushPhoneNotification({
          title: `🩸 Glucose Falling: ${val.toFixed(1)} mmol/L (${dir})`,
          message: `Glucose is descending rapidly below 6.0 mmol/L. Check trend or take pre-emptive carbs.`,
          tags: 'candy,chart_with_downwards_trend',
          priority: 4,
          click: 'ims-dock://open',
          actions: 'view, Open Side Dock, ims-dock://open'
        });
      } catch (_) {}
    }
    return;
  }

  if (val >= 4.5 && (dir === 'Flat' || dir === 'FortyFiveUp' || dir === 'SingleUp')) {
    lastAlertLevel = 'nominal';
  }
}

/**
 * Determine range classification and colour based on mmol/L value
 * - Below 4.0: Low / Red (#FF4757)
 * - 4.0 - 7.5: In Range / Green (#2ED573)
 * - Above 7.5: High / Yellow (#FFB84D)
 */
export function classifyGlucose(numVal) {
  if (numVal === null || isNaN(numVal)) {
    return { range: 'unknown', colorHex: '#8C96AF', r: 140, g: 150, b: 175 };
  }
  if (numVal < 4.0) {
    return { range: 'low', colorHex: '#FF4757', r: 255, g: 71, b: 87 };
  }
  if (numVal <= 7.5) {
    return { range: 'in_range', colorHex: '#2ED573', r: 46, g: 213, b: 115 };
  }
  return { range: 'high', colorHex: '#FFB84D', r: 255, g: 184, b: 77 };
}

/**
 * Fetches the latest properties from Nightscout API
 */
export async function fetchGlucose() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(NIGHTSCOUT_URL, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'IMS-Desktop-Terminal/1.0'
      }
    });
    clearTimeout(timeout);

    if (!res.ok) {
      logger.warn('Glucose', `HTTP error ${res.status} from Nightscout: ${res.statusText}`);
      return cachedGlucose;
    }

    const data = await res.json();
    if (!data || !data.bgnow) {
      logger.warn('Glucose', 'Missing bgnow in Nightscout response');
      return cachedGlucose;
    }

    const sgvs = data.bgnow.sgvs;
    if (!Array.isArray(sgvs) || sgvs.length === 0) {
      logger.warn('Glucose', 'No sgvs readings found in bgnow');
      return cachedGlucose;
    }

    // Pick entry with the latest timestamp mills
    let latest = sgvs[0];
    for (let i = 1; i < sgvs.length; i++) {
      if ((sgvs[i].mills || 0) >= (latest.mills || 0)) {
        latest = sgvs[i];
      }
    }

    let scaledStr = latest.scaled;
    let numeric = null;

    if (scaledStr !== undefined && scaledStr !== null) {
      scaledStr = String(scaledStr).trim();
      numeric = parseFloat(scaledStr);
    } else if (typeof latest.mgdl === 'number') {
      numeric = parseFloat((latest.mgdl / 18.0182).toFixed(1));
      scaledStr = numeric.toFixed(1);
    }

    const direction = latest.direction || 'Flat';
    if (typeof latest.mgdl === 'number' && latest.mills) {
      try {
        db.prepare('INSERT OR IGNORE INTO ns_entries (date, sgv, direction, scaled) VALUES (?, ?, ?, ?)').run(latest.mills, Math.round(latest.mgdl), direction, numeric);
      } catch (_) {
        try {
          db.prepare('INSERT OR IGNORE INTO ns_entries (date, sgv, direction) VALUES (?, ?, ?)').run(latest.mills, Math.round(latest.mgdl), direction);
        } catch (_) { /* table not created yet */ }
      }
    }
    const classification = classifyGlucose(numeric);
    const deltaDisplay = data.delta?.display || '';
    const mills = latest.mills || data.bgnow.mills || Date.now();
    const isStale = (Date.now() - mills) > 15 * 60 * 1000;

    cachedGlucose = {
      value: scaledStr || '--',
      numericValue: numeric,
      direction: direction,
      range: classification.range,
      colorHex: classification.colorHex,
      colorRgb: { r: classification.r, g: classification.g, b: classification.b },
      timestamp: mills,
      stale: isStale,
      delta: deltaDisplay,
      dbPct: (() => { const u = Number(data.dbsize?.details?.dataSize ?? data.dbsize?.totalDataSize), m = Number(data.dbsize?.details?.maxSize); return m > 0 && Number.isFinite(u) ? Math.ceil((u / m) * 1000) / 10 : cachedGlucose.dbPct; })()
    };

    logger.info('Glucose', `Updated: ${cachedGlucose.value} mmol/L (${cachedGlucose.direction}, ${cachedGlucose.range}) [delta: ${deltaDisplay}]`);

    // Broadcast over SSE EventBus for instantaneous UI updates
    try {
      eventBus.broadcast('glucose:update', cachedGlucose);
    } catch (_) {}

    // Evaluate Type 1 Diabetes phone alerts for hypos or downward trends
    checkT1DPhoneAlert(cachedGlucose).catch(() => {});

    // Notify all registered listeners (e.g. WebSocket pusher)
    for (const listener of listeners) {
      try {
        listener(cachedGlucose);
      } catch (err) {
        logger.error('Glucose', `Error in listener callback: ${err.message}`);
      }
    }

    return cachedGlucose;
  } catch (err) {
    if (err.name === 'AbortError') {
      logger.warn('Glucose', 'Request to Nightscout timed out (7s)');
    } else {
      logger.error('Glucose', `Fetch error: ${err.message}`, { error: err.message });
    }
    return cachedGlucose;
  }
}

/**
 * Start the background poller (every 60 seconds)
 */
export function startGlucosePoller(onUpdate) {
  if (onUpdate && typeof onUpdate === 'function') {
    listeners.add(onUpdate);
  }

  if (!pollTimer) {
    // Immediate initial fetch
    fetchGlucose();
    pollTimer = setInterval(fetchGlucose, POLL_INTERVAL_MS);
    console.log('[Glucose] Service initialized - polling every 60 seconds');
  }
}

/**
 * Register a listener for glucose updates
 */
export function onGlucoseUpdate(callback) {
  if (typeof callback === 'function') {
    listeners.add(callback);
  }
  return () => listeners.delete(callback);
}

/**
 * Returns current cached glucose or performs immediate fetch if not populated
 */
export async function getGlucoseData() {
  if (!cachedGlucose.numericValue) {
    return await fetchGlucose();
  }
  return cachedGlucose;
}

export function getCachedGlucose() {
  return cachedGlucose;
}

export default {
  startGlucosePoller,
  onGlucoseUpdate,
  getGlucoseData,
  getCachedGlucose,
  fetchGlucose,
  classifyGlucose
};
