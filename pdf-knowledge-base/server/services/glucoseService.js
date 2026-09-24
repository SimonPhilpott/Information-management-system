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
  delta: ''
};

let pollTimer = null;
const listeners = new Set();

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
      console.warn(`[Glucose] HTTP error ${res.status} from Nightscout: ${res.statusText}`);
      return cachedGlucose;
    }

    const data = await res.json();
    if (!data || !data.bgnow) {
      console.warn('[Glucose] Missing bgnow in Nightscout response');
      return cachedGlucose;
    }

    const sgvs = data.bgnow.sgvs;
    if (!Array.isArray(sgvs) || sgvs.length === 0) {
      console.warn('[Glucose] No sgvs readings found in bgnow');
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
      delta: deltaDisplay
    };

    console.log(`[Glucose] Updated: ${cachedGlucose.value} mmol/L (${cachedGlucose.direction}, ${cachedGlucose.range}) [delta: ${deltaDisplay}]`);

    // Notify all registered listeners (e.g. WebSocket pusher)
    for (const listener of listeners) {
      try {
        listener(cachedGlucose);
      } catch (err) {
        console.error('[Glucose] Error in listener callback:', err.message);
      }
    }

    return cachedGlucose;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('[Glucose] Request to Nightscout timed out (7s)');
    } else {
      console.error('[Glucose] Fetch error:', err.message);
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

export default {
  startGlucosePoller,
  onGlucoseUpdate,
  getGlucoseData,
  fetchGlucose,
  classifyGlucose
};
