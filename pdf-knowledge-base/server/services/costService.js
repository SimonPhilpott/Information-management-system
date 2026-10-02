// Costs (Phase 4 addition): everything IMS costs to run, in one place.
//
//  - Gemini API: measured. Every call's real token counts are logged (geminiClient.js, Live voice
//    sessions in index.js) and priced here from the editable price table, so changing a price
//    re-prices history. Tokens on a model with no price set are shown, not guessed.
//  - Subscriptions and other services: a list kept in settings ('fixed_costs'), pre-filled with
//    what this project is known to lean on. Amounts start as typical list prices marked
//    "estimate" until confirmed against a real bill; free services are listed too, so the whole
//    picture is visible.
//
// Note on the Google AI Pro subscription: it pays for the Gemini app (and Google One storage) -
// it does not cover Gemini API calls, which are billed to the Google Cloud project behind
// GEMINI_API_KEY (or free, within limits, on the API's free tier).
import db from '../db/database.js';
import { getPrices } from './usageService.js';
import { SERVICES } from './modelRegistry.js';

const SERVICE_LABEL = Object.fromEntries(SERVICES.map((s) => [s.key, s.label]));
// operations logged before the Model Switcher existed
const LEGACY = { chat: 'chat', embedding: 'embedding', topic_extraction: 'library', 'ims-fallback': 'imsHelpers', image_generation: 'image' };

const DEFAULT_FIXED = [
  { id: 'google-ai-pro', name: 'Google AI Pro', provider: 'Google', category: 'Subscription', amount: 18.99, currency: 'GBP', period: 'month', estimated: true,
    usedFor: 'The Gemini app and Google One storage (Drive holds the PDF library). Does not pay for Gemini API calls - those are below.' },
  { id: 'heroku-nightscout', name: 'Nightscout hosting', provider: 'Heroku', category: 'Hosting', amount: 5, currency: 'USD', period: 'month', estimated: true,
    usedFor: 'Runs your Nightscout site (glucose, treatments, devicestatus) - Eco dyno list price.' },
  { id: 'nightscout-db', name: 'Nightscout database', provider: 'MongoDB Atlas', category: 'Hosting', amount: 0, currency: 'GBP', period: 'month', estimated: true,
    usedFor: 'Nightscout\'s database - free M0 tier unless you upgraded.' },
  { id: 'ring-protect', name: 'Ring Protect', provider: 'Ring', category: 'Subscription', amount: 4.99, currency: 'GBP', period: 'month', estimated: true,
    usedFor: 'Doorbell video recordings and history (the Recordings gallery needs a plan).' },
  { id: 'ngrok', name: 'ngrok tunnel', provider: 'ngrok', category: 'Hosting', amount: 0, currency: 'GBP', period: 'month', estimated: true,
    usedFor: 'The static domain that lets your phone reach IMS from outside - free plan unless you pay for one.' },
  { id: 'strava', name: 'Strava', provider: 'Strava', category: 'Subscription', amount: 0, currency: 'GBP', period: 'month', estimated: true,
    usedFor: 'Run history for the Run Planner - the API is free; add your subscription here if you have one.' },
  { id: 'komoot', name: 'Komoot', provider: 'Komoot', category: 'Subscription', amount: 0, currency: 'GBP', period: 'month', estimated: true,
    usedFor: 'Routes for the Run Planner - add Premium here if you have it.' },
  { id: 'github', name: 'GitHub', provider: 'GitHub', category: 'Free service', amount: 0, currency: 'GBP', period: 'month', estimated: false,
    usedFor: 'Code repository and the Code Best Practices scans (free plan).' },
  { id: 'google-apis', name: 'Google Drive, Calendar & Gmail APIs', provider: 'Google', category: 'Free service', amount: 0, currency: 'GBP', period: 'month', estimated: false,
    usedFor: 'PDF library sync, calendar and email - free within normal use.' },
  { id: 'open-meteo', name: 'Open-Meteo', provider: 'Open-Meteo', category: 'Free service', amount: 0, currency: 'GBP', period: 'month', estimated: false,
    usedFor: 'Weather forecasts, history and geocoding (free for non-commercial use).' },
  { id: 'bbc', name: 'BBC News feeds', provider: 'BBC', category: 'Free service', amount: 0, currency: 'GBP', period: 'month', estimated: false, usedFor: 'News for the day report.' },
  { id: 'osm', name: 'OpenStreetMap', provider: 'OpenStreetMap', category: 'Free service', amount: 0, currency: 'GBP', period: 'month', estimated: false, usedFor: 'Maps and place lookups (Nominatim).' },
  { id: 'ntfy', name: 'ntfy', provider: 'ntfy.sh', category: 'Free service', amount: 0, currency: 'GBP', period: 'month', estimated: false, usedFor: 'Run plan pushes to your phone.' },
  { id: 'card-dbs', name: 'RingsDB, ArkhamDB, Hall of Beorn, BoardGameGeek', provider: 'Community', category: 'Free service', amount: 0, currency: 'GBP', period: 'month', estimated: false, usedFor: 'Card data, decks and the board game collection.' },
  { id: 'off', name: 'Open Food Facts', provider: 'Open Food Facts', category: 'Free service', amount: 0, currency: 'GBP', period: 'month', estimated: false, usedFor: 'Barcode carb lookups.' },
];

function readJson(key, fallback) {
  try { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key); return r ? JSON.parse(r.value) : fallback; } catch { return fallback; }
}
function writeJson(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
}

export const getFixedCosts = () => readJson('fixed_costs', DEFAULT_FIXED);
export const getUsdToGbp = () => Number(readJson('usd_to_gbp', 0.75)) || 0.75;

export function saveFixedCosts(list) {
  if (!Array.isArray(list)) throw new Error('Expected a list');
  const clean = list.map((c, i) => ({
    id: String(c.id || `custom-${Date.now()}-${i}`).slice(0, 60),
    name: String(c.name || 'Unnamed').slice(0, 80), provider: String(c.provider || '').slice(0, 60),
    category: String(c.category || 'Subscription').slice(0, 30), amount: Math.max(0, Number(c.amount) || 0),
    currency: c.currency === 'USD' ? 'USD' : 'GBP', period: c.period === 'year' ? 'year' : 'month',
    estimated: !!c.estimated, usedFor: String(c.usedFor || '').slice(0, 300),
  }));
  writeJson('fixed_costs', clean);
  return clean;
}

export function savePrices(prices, usdToGbp) {
  const custom = readJson('model_prices', {});
  for (const [model, p] of Object.entries(prices || {})) {
    if (p == null) { delete custom[model]; continue; }
    custom[model] = { input: Math.max(0, Number(p.input) || 0), output: Math.max(0, Number(p.output) || 0) };
  }
  writeJson('model_prices', custom);
  if (usdToGbp != null) writeJson('usd_to_gbp', Math.max(0.1, Math.min(2, Number(usdToGbp) || 0.75)));
  return { prices: getPrices(), usdToGbp: getUsdToGbp() };
}

function range(period) {
  const now = new Date();
  const start = (y, m, d = 1) => new Date(Date.UTC(y, m, d));
  if (period === 'lastMonth') return { from: start(now.getUTCFullYear(), now.getUTCMonth() - 1), to: start(now.getUTCFullYear(), now.getUTCMonth()), label: 'Last month' };
  if (period === '30d') return { from: new Date(Date.now() - 30 * 86400000), to: now, label: 'Last 30 days' };
  if (period === '7d') return { from: new Date(Date.now() - 7 * 86400000), to: now, label: 'Last 7 days' };
  return { from: start(now.getUTCFullYear(), now.getUTCMonth()), to: now, label: 'This month' };
}
const sqlTime = (d) => d.toISOString().replace('T', ' ').slice(0, 19);

export function getCosts(period = 'month') {
  const { from, to, label } = range(period);
  const prices = getPrices();
  const fx = getUsdToGbp();
  const rows = db.prepare(`
    SELECT DATE(timestamp) AS day, model, operation, SUM(prompt_tokens) AS input, SUM(completion_tokens) AS output, COUNT(*) AS calls
    FROM token_usage WHERE timestamp >= ? AND timestamp < ? GROUP BY day, model, operation
  `).all(sqlTime(from), sqlTime(to));

  const byService = {}, byModel = {}, byDay = {};
  let usd = 0, unpricedTokens = 0, calls = 0;
  const unpricedModels = new Set();
  for (const r of rows) {
    const p = prices[r.model];
    const cost = p ? (r.input / 1e6) * p.input + (r.output / 1e6) * p.output : 0;
    if (!p) { unpricedTokens += r.input + r.output; unpricedModels.add(r.model); }
    usd += cost; calls += r.calls;
    const key = LEGACY[r.operation] || r.operation || 'other';
    const s = (byService[key] ||= { key, label: SERVICE_LABEL[key] || key, usd: 0, input: 0, output: 0, calls: 0, models: new Set() });
    s.usd += cost; s.input += r.input; s.output += r.output; s.calls += r.calls; s.models.add(r.model);
    const m = (byModel[r.model] ||= { model: r.model, usd: 0, input: 0, output: 0, calls: 0, priced: !!p, price: p || null });
    m.usd += cost; m.input += r.input; m.output += r.output; m.calls += r.calls;
    const d = (byDay[r.day] ||= { day: r.day, usd: 0 });
    d.usd += cost;
  }
  const gbp = (x) => Math.round(x * fx * 100) / 100;
  const fixed = getFixedCosts().map((c) => {
    const monthly = c.period === 'year' ? c.amount / 12 : c.amount;
    return { ...c, monthlyGBP: Math.round((c.currency === 'USD' ? monthly * fx : monthly) * 100) / 100 };
  });
  const fixedMonthlyGBP = Math.round(fixed.reduce((n, c) => n + c.monthlyGBP, 0) * 100) / 100;

  // month projection from the days so far this month
  let projectedApiGBP = null;
  if (period === 'month') {
    const now = new Date();
    const daysIn = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const sofar = Math.max(1, now.getDate() - 1 + now.getHours() / 24);
    projectedApiGBP = gbp((usd / sofar) * daysIn);
  }

  return {
    period, label, from: from.toISOString(), to: to.toISOString(), usdToGbp: fx,
    api: {
      usd: Math.round(usd * 10000) / 10000, gbp: gbp(usd), calls, projectedGBP: projectedApiGBP,
      unpricedTokens, unpricedModels: [...unpricedModels],
      byService: Object.values(byService).map((s) => ({ ...s, models: [...s.models], gbp: gbp(s.usd) })).sort((a, b) => b.usd - a.usd || b.input + b.output - (a.input + a.output)),
      byModel: Object.values(byModel).map((m) => ({ ...m, gbp: gbp(m.usd) })).sort((a, b) => b.usd - a.usd),
      byDay: Object.values(byDay).map((d) => ({ ...d, gbp: gbp(d.usd) })).sort((a, b) => a.day.localeCompare(b.day)),
    },
    fixed, fixedMonthlyGBP,
    monthlyTotalGBP: period === 'month' ? Math.round(((projectedApiGBP || 0) + fixedMonthlyGBP) * 100) / 100 : null,
    prices,
    trackingSince: db.prepare("SELECT MIN(timestamp) AS t FROM token_usage WHERE operation NOT IN ('chat','embedding','topic_extraction')").get()?.t || null,
  };
}

export default { getCosts, getFixedCosts, saveFixedCosts, savePrices, getUsdToGbp };
