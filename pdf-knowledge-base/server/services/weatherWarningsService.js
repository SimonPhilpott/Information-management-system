// Met Office weather warnings (26 Oct 2026, Simon: "today is this, high winds alert ... find out what for and
// have icons prepared for those alerts"). The forecast (Open-Meteo) carries no warnings, so this reads the Met
// Office's own regional warnings feed - the yellow / amber / red National Severe Weather Warnings for rain,
// thunderstorms, wind, snow, lightning, ice, extreme heat and fog - and keeps the ones that cover home's county
// and are in force now. The Box-3 shows the most serious in its weather pill.
//
// Feed item, e.g.  title: "Yellow warning of wind affecting Yorkshire & Humber"
//   description: "...: East Riding of Yorkshire, ..., West Yorkshire, York valid from 1100 Sat 24 Oct to 2100 Sun 25 Oct"
import { getSetting } from '../db/database.js';

const FEED = 'https://www.metoffice.gov.uk/public/data/PWSCache/WarningsRSS/Region/';
const DEFAULT_REGION = 'yh';             // Yorkshire & Humber
const DEFAULT_AREA = 'West Yorkshire';   // Garforth
const REFRESH_MS = 15 * 60000;
const LEVELS = { red: 3, amber: 2, yellow: 1 };
// the device's symbol for each warning type
const TYPE_KIND = { wind: 'wind', rain: 'rain', thunderstorm: 'storm', thunderstorms: 'storm', lightning: 'storm', snow: 'snow', ice: 'ice', 'extreme heat': 'heat', heat: 'heat', fog: 'fog' };
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

let cache = { at: 0, warnings: [] };

const decode = (t) => String(t || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// "1100 Sat 24 Oct" (UK local time) -> a Date, in the year that puts it nearest now
function ukTime(hhmm, day, mon) {
  const now = new Date();
  const best = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => {
    // the UK offset on that day: GMT, or BST (+1) between late March and late October
    const guess = new Date(Date.UTC(y, MONTHS[mon], Number(day), Number(hhmm.slice(0, 2)), Number(hhmm.slice(2))));
    const off = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'shortOffset' }).formatToParts(guess).find((p) => p.type === 'timeZoneName')?.value || 'GMT';
    const h = Number((off.match(/[+-]\d+/) || ['0'])[0]);
    return new Date(guess.getTime() - h * 3600000);
  });
  return best.sort((a, b) => Math.abs(a - now) - Math.abs(b - now))[0];
}

export function parseWarnings(xml) {
  const items = String(xml || '').split('<item>').slice(1);
  return items.map((it) => {
    const title = decode((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
    const desc = decode((it.match(/<description>([\s\S]*?)<\/description>/) || [])[1]);
    const m = title.match(/^(Red|Amber|Yellow) warning of (.+?) affecting (.+)$/i);
    if (!m) return null;
    const v = desc.match(/valid from (\d{4}) \w{3} (\d{1,2}) (\w{3}) to (\d{4}) \w{3} (\d{1,2}) (\w{3})/i);
    const areas = (desc.split(': ').slice(1).join(': ').split(/ valid from /i)[0] || '').split(',').map((a) => a.trim()).filter(Boolean);
    const type = m[2].toLowerCase();
    return {
      level: m[1].toLowerCase(), type, kind: TYPE_KIND[type] || 'warn', region: m[3], areas,
      from: v ? ukTime(v[1], v[2], v[3]).toISOString() : null, until: v ? ukTime(v[4], v[5], v[6]).toISOString() : null,
      text: `${m[1]} warning of ${type}`, link: decode((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1]),
    };
  }).filter(Boolean);
}

export async function refreshWarnings() {
  const region = getSetting('weather_warning_region') || DEFAULT_REGION;
  const res = await fetch(FEED + encodeURIComponent(region), { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Met Office warnings feed: HTTP ${res.status}`);
  cache = { at: Date.now(), warnings: parseWarnings(await res.text()) };
  return cache.warnings;
}

// The warnings for home's county in force now (most serious first)
export function activeWarnings(now = Date.now()) {
  const area = (getSetting('weather_warning_area') || DEFAULT_AREA).toLowerCase();
  return cache.warnings
    .filter((w) => w.areas.some((a) => a.toLowerCase() === area))
    .filter((w) => (!w.from || Date.parse(w.from) <= now) && (!w.until || Date.parse(w.until) > now))
    .sort((a, b) => (LEVELS[b.level] || 0) - (LEVELS[a.level] || 0));
}

// The one the Box-3 shows: { level, kind, text, until } or null
export function topWarning() {
  const w = activeWarnings()[0];
  return w ? { level: w.level, kind: w.kind, text: w.text, until: w.until } : null;
}

export function startWarningsWatch(onChange) {
  let last = '';
  const tick = () => refreshWarnings().then(() => {
    const key = JSON.stringify(topWarning());
    if (key !== last) { last = key; try { onChange?.(); } catch { /* the push is best effort */ } }
  }).catch((err) => console.warn('[Warnings]', err.message));
  tick();
  return setInterval(tick, REFRESH_MS);
}
