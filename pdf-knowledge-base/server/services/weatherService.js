import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSetting, setSetting } from '../db/database.js';

// Weather (/ims/weather): Open-Meteo forecasts (free, no key; for the UK its best-match model blends the
// Met Office UKV), turned into facts Ims can describe honestly. Everything is worked out from the HOURLY
// forecast for the hours still to come - Open-Meteo's daily weather code is the worst hour of the whole
// day, so a little drizzle before dawn made a dry, sunny day read as "Light drizzle, 100% chance of rain".
// Rain is graded by how much actually falls (mm per hour) and how likely it is, and each grade comes with
// the words Ims may and may not use for it, so light drizzle is never "chucking it down".
// Home (Leeds unless changed) is the default everywhere and is what the day report uses; other places can be
// saved by name on the Weather page so Ims can be asked about them, and any day up to 16 days ahead can be
// asked for ("tomorrow", "in a week", "a fortnight on Saturday" - Gemini turns those into days_ahead).
// Used by Ims's getWeather tool, the day report, the desk footer, the run planner and the Weather page.

const WMO = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Freezing fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Light freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Light freezing rain', 67: 'Heavy freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light showers', 81: 'Showers', 82: 'Violent showers', 85: 'Light snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
};

const DEFAULT_HOME = { name: 'Leeds', region: 'West Yorkshire', country: 'United Kingdom', latitude: 53.8008, longitude: -1.5491 };
const HOME_KEY = 'weather_home';
const PLACES_KEY = 'weather_places';
const CACHE_TTL_MS = 10 * 60 * 1000;
const FORECAST_DAYS = 16; // Open-Meteo's furthest forecast
const UA = { 'User-Agent': 'IMS-Desktop-Voice-Terminal/1.0' };
const NORMALS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'weather_normals');
const NORMAL_YEARS = 10;
const cache = new Map();

const mph = (kmh) => Math.round((kmh ?? 0) * 0.621371);
const r1 = (n) => Math.round((n ?? 0) * 10) / 10;
const compass = (deg) => (deg == null ? 'variable'
  : ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.floor(deg / 22.5 + 0.5) % 16]);

// ---- home location ----

export function getHome() {
  try { return { ...DEFAULT_HOME, ...JSON.parse(getSetting(HOME_KEY) || '{}') }; } catch { return { ...DEFAULT_HOME }; }
}

// A saved place becomes home exactly as saved (no new look-up that could land somewhere else); anything else is
// looked up. The old home moves into the saved places, so it can be kept or deleted there.
export async function setHome(query) {
  const q = String(query || '').trim();
  const saved = listPlaces().find((p) => p.name.toLowerCase() === q.toLowerCase());
  const loc = saved || await geocode(q, { strict: true });
  const old = getHome();
  const places = listPlaces().filter((p) => p.name.toLowerCase() !== loc.name.toLowerCase() && p.name.toLowerCase() !== old.name.toLowerCase());
  if (old.name.toLowerCase() !== loc.name.toLowerCase()) places.push(old);
  setSetting(PLACES_KEY, JSON.stringify(places));
  setSetting(HOME_KEY, JSON.stringify(loc));
  cache.clear();
  return loc;
}

// Saved places other than home, for "what's it like in York?" without spelling out where York is.
export function listPlaces() {
  try { return JSON.parse(getSetting(PLACES_KEY) || '[]'); } catch { return []; }
}

export async function addPlace(query) {
  const loc = await geocode(query, { strict: true, saved: false });
  const places = listPlaces().filter((p) => p.name.toLowerCase() !== loc.name.toLowerCase());
  places.push(loc);
  setSetting(PLACES_KEY, JSON.stringify(places));
  return loc;
}

export function removePlace(name) {
  const places = listPlaces().filter((p) => p.name.toLowerCase() !== String(name).toLowerCase());
  setSetting(PLACES_KEY, JSON.stringify(places));
  return places;
}

async function geocode(query, { strict = false, saved = true } = {}) {
  const q = String(query || '').trim();
  if (!q || /^(home|here|local)$/i.test(q)) return getHome();
  if (saved) {
    const home = getHome();
    const match = [home, ...listPlaces()].find((p) => p.name.toLowerCase() === q.toLowerCase());
    if (match) return match;
  }
  // "53.80,-1.55" - the run planner passes a route's start point
  const ll = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (ll) return { name: 'Route start', region: '', country: '', latitude: Number(ll[1]), longitude: Number(ll[2]) };
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`, { headers: UA });
    if (!res.ok) throw new Error(`geocoding returned HTTP ${res.status}`);
    const m = (await res.json()).results?.[0];
    if (m) return { name: m.name, region: m.admin1 || m.admin2 || '', country: m.country || '', latitude: m.latitude, longitude: m.longitude };
    if (strict) throw new Error(`Couldn't find a place called "${q}".`);
  } catch (err) {
    if (strict) throw err;
    console.warn(`[Weather] Geocoding "${q}" failed (${err.message}), using home.`);
  }
  return getHome();
}

// ---- grading ----

const isDrizzle = (c) => c >= 51 && c <= 57;
const isSnow = (c) => (c >= 71 && c <= 77) || c === 85 || c === 86;
const isShower = (c) => c >= 80 && c <= 86;
const isThunder = (c) => c >= 95;
const isWetCode = (c) => c >= 51;

// The rain levels, mildest first, with the words that fit each. Ims is handed the matching set.
export const RAIN_WORDS = {
  dry: {
    use: ['dry', 'staying dry', 'no rain about'],
    avoid: ['rain', 'drizzle', 'showers', 'spitting', 'damp', 'wet', 'chucking it down', 'tipping it down', 'siling it down', 'pouring'],
  },
  chance: {
    use: ['small chance of a shower', 'might catch a spot', 'probably staying dry'],
    avoid: ['rainy', 'wet day', 'chucking it down', 'tipping it down', 'siling it down', 'pouring', 'heavy rain', 'downpour'],
  },
  light: {
    use: ['a bit of drizzle', 'spitting', 'a few spots', 'a bit damp', 'light rain'],
    avoid: ['chucking it down', 'tipping it down', 'siling it down', 'pouring', 'heavy rain', 'downpour', 'torrential', 'soaking'],
  },
  moderate: {
    use: ['proper rain', 'a wet one', 'steady rain', 'take a brolly'],
    avoid: ['chucking it down', 'siling it down', 'torrential', 'drizzle', 'spitting', 'a few spots'],
  },
  heavy: {
    use: ['chucking it down', 'siling it down', 'tipping it down', 'heavy rain', 'downpours'],
    avoid: ['drizzle', 'spitting', 'a few spots', 'a bit damp'],
  },
};

// How wet a run of hours is: the level, its kind (rain/drizzle/showers/snow/thunder), the chance and when.
function gradeRain(hours) {
  if (!hours.length) return { level: 'dry', chance: 0, mm: 0 };
  const mm = r1(hours.reduce((n, h) => n + (h.mm || 0), 0));
  const peak = Math.max(...hours.map((h) => h.mm || 0));
  // Beyond about a week Open-Meteo gives no probability, only amounts - go by those (chance is then null).
  const known = hours.some((h) => h.prob != null);
  const chance = known ? Math.max(...hours.map((h) => h.prob ?? 0)) : null;
  // an hour counts as wet when the model puts real rain in it AND it's more likely than not
  const wet = known ? hours.filter((h) => (h.mm >= 0.1 || isWetCode(h.code)) && (h.prob ?? 0) >= 50) : hours.filter((h) => h.mm >= 0.2);
  let level;
  if (!known) level = mm < 0.5 ? 'dry' : !wet.length ? 'chance' : null;
  else if (chance < 20 && mm < 0.2) level = 'dry';
  else if (!wet.length) level = chance < 20 && mm < 1 ? 'dry' : 'chance';
  if (level) { /* settled above */ } else if (peak >= 4 || wet.some((h) => h.code === 65 || h.code === 82)) level = 'heavy';
  else if (peak >= 1 || wet.some((h) => h.code === 63 || h.code === 81)) level = 'moderate';
  else level = 'light';
  const codes = (wet.length ? wet : hours.filter((h) => isWetCode(h.code))).map((h) => h.code);
  const kind = codes.some(isThunder) ? 'thunder' : codes.some(isSnow) ? 'snow' : codes.length && codes.every(isDrizzle) ? 'drizzle'
    : codes.some(isShower) ? 'showers' : 'rain';
  return { level, kind: level === 'dry' ? null : kind, chance, mm, wetHours: wet.length, from: wet[0]?.hour ?? null, until: wet.at(-1)?.hour ?? null };
}

function gradeSky(hours) {
  const day = hours.filter((h) => h.isDay);
  const pool = day.length ? day : hours;
  if (!pool.length) return { sky: 'unknown', words: 'unknown' };
  const count = (fn) => pool.filter((h) => fn(h.code)).length / pool.length;
  const clear = count((c) => c <= 1), part = count((c) => c === 2), fog = count((c) => c === 45 || c === 48);
  const night = !day.length;
  if (fog >= 0.4) return { sky: 'fog', words: 'foggy' };
  if (clear >= 0.6) return { sky: 'clear', words: night ? 'clear' : 'sunny' };
  if (clear + part >= 0.6) return { sky: 'partly', words: night ? 'some cloud' : 'sunny spells' };
  if (clear + part >= 0.3) return { sky: 'mostly-cloudy', words: night ? 'mostly cloudy' : 'cloudy with some brighter spells' };
  return { sky: 'cloudy', words: 'cloudy and grey' };
}

function gradeWind(hours) {
  const wind = Math.max(0, ...hours.map((h) => h.windMph));
  const gust = Math.max(0, ...hours.map((h) => h.gustMph));
  const words = gust >= 55 ? 'gale-force gusts' : gust >= 45 ? 'very windy' : gust >= 35 || wind >= 20 ? 'blustery'
    : wind >= 12 ? 'breezy' : wind >= 6 ? 'a gentle breeze' : 'light winds';
  return { windMph: wind, gustMph: gust, words };
}

const tempWords = (max) => (max <= 2 ? 'freezing' : max <= 7 ? 'cold' : max <= 12 ? 'cool' : max <= 17 ? 'mild' : max <= 23 ? 'warm' : 'hot');

// Words for every other kind of weather, by how strong it is - Ims is given the band that fits and the
// words that would overstate (or understate) it. Strong phrases only ever go with strong weather.
// The Weather page shows all of these under "Weather phrases".
const STRONG_HEAT = ['roasting', 'sweltering', 'scorchio', 'heatwave', 'red hot'];
const STRONG_COLD = ['brass monkeys', 'bitter', 'perishing', 'freezing'];
export const TEMP_BANDS = [
  { max: -5, band: 'bitterly cold', when: 'top of -5°C or below', use: ['perishing', 'bitterly cold', 'brass monkeys', 'cold enough to freeze your ears off'], avoid: ['mild', 'fresh', ...STRONG_HEAT] },
  { max: 2, band: 'freezing', when: 'top of 2°C or below', use: ['brass monkeys', 'freezing', 'bitter', 'proper cold - hat and gloves'], avoid: ['mild', 'fresh', ...STRONG_HEAT] },
  { max: 7, band: 'cold', when: 'top of 3-7°C', use: ['nithering', 'parky', 'cold - big coat weather'], avoid: ['brass monkeys', 'perishing', 'mild', ...STRONG_HEAT] },
  { max: 12, band: 'cool', when: 'top of 8-12°C', use: ['a bit fresh', 'parky', 'jacket weather'], avoid: [...STRONG_COLD, 'nithering', 'warm', ...STRONG_HEAT] },
  { max: 18, band: 'mild', when: 'top of 13-18°C', use: ['mild', 'pleasant', 'not bad at all'], avoid: [...STRONG_COLD, 'nithering', ...STRONG_HEAT] },
  { max: 24, band: 'warm', when: 'top of 19-24°C', use: ['warm', 'grand', 'a lovely day', 't-shirt weather'], avoid: [...STRONG_COLD, 'nithering', 'parky', 'sweltering', 'heatwave', 'scorchio'] },
  { max: 29, band: 'hot', when: 'top of 25-29°C', use: ['hot', 'roasting', 'red hot', 'proper summer'], avoid: [...STRONG_COLD, 'nithering', 'parky', 'fresh'] },
  { max: Infinity, band: 'extreme heat', when: 'top of 30°C or more', use: ['sweltering', 'scorchio', 'a proper heatwave', "too hot to be out in t'middle o' t'day - shade and plenty to drink"], avoid: [...STRONG_COLD, 'nithering', 'parky', 'fresh'] },
];
// gust = the strongest gust (mph) the band goes up to
export const WIND_BANDS = [
  { gust: 12, band: 'calm', when: 'gusts under 12 mph', use: ['still', 'barely a breath of wind'], avoid: ['windy', 'blowing a gale', 'blowing a hoolie', 'blowy'] },
  { gust: 25, band: 'breeze', when: 'gusts 12-24 mph', use: ['a bit of a breeze', 'a gentle breeze'], avoid: ['windy', 'blowing a gale', 'blowing a hoolie', 'storm'] },
  { gust: 35, band: 'breezy', when: 'gusts 25-34 mph', use: ['breezy', 'a fair breeze'], avoid: ['blowing a gale', 'blowing a hoolie', 'storm', 'still'] },
  { gust: 45, band: 'blustery', when: 'gusts 35-44 mph', use: ['blowy', 'blustery', 'windy'], avoid: ['blowing a hoolie', 'storm', 'still', 'calm'] },
  { gust: 55, band: 'very windy', when: 'gusts 45-54 mph', use: ['blowing a gale', 'very windy', 'hang on to your hat'], avoid: ['still', 'calm', 'a gentle breeze'] },
  { gust: 70, band: 'gales', when: 'gusts 55-69 mph', use: ['blowing a hoolie', 'gale-force gusts', 'tie the bins down'], avoid: ['still', 'calm', 'breezy', 'a gentle breeze'] },
  { gust: Infinity, band: 'storm', when: 'gusts of 70 mph or more', use: ['storm-force gusts', 'a proper storm', 'blowing a hoolie - stay in if you can'], avoid: ['still', 'calm', 'breezy', 'blowy'] },
];
export const OTHER_WORDS = {
  fog: { when: 'fog for much of the day', use: ['foggy', 'murky', "thick fog - you'll not see t'end o' t'street"], note: 'Fog - worth mentioning for driving or running.' },
  frost: { when: 'a low of 0°C or below', use: ['a frost', 'icy first thing', 'scrape the car'], note: 'A frost overnight or first thing.' },
  snow_light: { when: 'light snow', use: ['a few flakes', 'a dusting of snow'], note: 'Light snow.' },
  snow_moderate: { when: 'steady snow', use: ['proper snow', 'snow settling'], note: 'Snow that may settle.' },
  snow_heavy: { when: 'heavy snow', use: ['a right good dumping of snow', 'snowed in'], note: 'Heavy snow - travel may be hit.' },
  thunder: { when: 'thunderstorms forecast', use: ['thunder and lightning', 'a right storm', 'thundery'], note: 'Thunder about - stay off the tops and out of open fields.' },
  sun: { when: 'UV index 6 or more', use: ['suncream weather', 'strong sun'], note: 'High UV - suncream if out for long.' },
  muggy: { when: '20°C or more and humid', use: ['close', 'muggy', 'sticky'], note: 'Humid and warm - it will feel close.' },
};

function weatherLanguage({ maxC, minC, gustMph, rain, sky, uv, humidity }) {
  const temp = TEMP_BANDS.find((b) => maxC <= b.max);
  const wind = WIND_BANDS.find((b) => gustMph < b.gust) || WIND_BANDS.at(-1);
  const extras = [];
  const add = (kind) => extras.push({ kind, use: OTHER_WORDS[kind].use, note: OTHER_WORDS[kind].note });
  if (sky?.sky === 'fog') add('fog');
  if (minC != null && minC <= 0) add('frost');
  if (rain?.kind === 'snow' && ['light', 'moderate', 'heavy'].includes(rain.level)) add(`snow_${rain.level}`);
  if (rain?.kind === 'thunder' && rain.level !== 'dry') add('thunder');
  if (uv >= 6) add('sun');
  if (maxC >= 20 && humidity >= 75) add('muggy');
  const rw = RAIN_WORDS[rain?.level || 'dry'];
  return {
    rain: { level: rain?.level || 'dry', use: rw.use, avoid: rw.avoid },
    temperature: { band: temp.band, use: temp.use, avoid: temp.avoid },
    wind: { band: wind.band, use: wind.use, avoid: wind.avoid },
    extras,
  };
}

// ---- what's usual: the same dates (within a week either side) over the last ten years at this place ----

async function loadNormals(loc) {
  const file = path.join(NORMALS_DIR, `${loc.latitude.toFixed(2)}_${loc.longitude.toFixed(2)}.json`);
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - saved.at < 180 * 86400000) return saved.days;
  } catch { /* not fetched yet */ }
  const end = new Date(); end.setDate(end.getDate() - 7);
  const start = new Date(end); start.setFullYear(start.getFullYear() - NORMAL_YEARS);
  const iso = (x) => x.toISOString().slice(0, 10);
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${loc.latitude}&longitude=${loc.longitude}&start_date=${iso(start)}&end_date=${iso(end)}`
    + '&daily=temperature_2m_max,temperature_2m_min,snowfall_sum,wind_gusts_10m_max&timezone=auto';
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`archive returned HTTP ${res.status}`);
  const a = (await res.json()).daily;
  // [MM-DD, max °C, min °C, snow cm, gust km/h]
  const days = a.time.map((t, i) => [t.slice(5), a.temperature_2m_max[i], a.temperature_2m_min[i], a.snowfall_sum[i], a.wind_gusts_10m_max[i]]);
  fs.mkdirSync(NORMALS_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ at: Date.now(), location: loc.name, days }));
  return days;
}

const dayOfYear = (mmdd) => { const [m, d] = mmdd.split('-').map(Number); return Math.round((Date.UTC(2001, m - 1, d) - Date.UTC(2001, 0, 1)) / 86400000); };
const stats = (xs) => {
  const v = xs.filter((x) => x != null);
  const mean = v.reduce((a, b) => a + b, 0) / (v.length || 1);
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length || 1));
  return { mean, sd, max: Math.max(...v), min: Math.min(...v), n: v.length };
};
const seasonName = (date) => {
  const [m, d] = date.slice(5).split('-').map(Number);
  return `${d <= 10 ? 'early' : d <= 20 ? 'mid' : 'late'} ${new Date(Date.UTC(2001, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })}`;
};

// What stands out about a day compared with the same time of year - null when it's ordinary.
function unusualFor(day, normals) {
  if (!normals?.length || day.max_temp_c == null) return null;
  const doy = dayOfYear(day.date.slice(5));
  const near = normals.filter(([md]) => { const k = Math.abs(dayOfYear(md) - doy); return Math.min(k, 365 - k) <= 7; });
  if (near.length < 30) return null;
  const hi = stats(near.map((x) => x[1])), lo = stats(near.map((x) => x[2])), gust = stats(near.map((x) => x[4]));
  const snowDays = near.filter((x) => (x[3] || 0) > 0).length / near.length;
  const when = seasonName(day.date);
  const notes = [];
  const dHi = day.max_temp_c - hi.mean, dLo = day.min_temp_c - lo.mean;
  const usual = `the usual top for ${when} is about ${Math.round(hi.mean)}°C`;
  if (day.max_temp_c > hi.max) notes.push({ kind: 'record-warm', text: `Warmer than any ${when} day in the last ${NORMAL_YEARS} years (${usual}).` });
  else if (dHi >= Math.max(4, 1.5 * hi.sd)) notes.push({ kind: 'warm', text: `About ${Math.round(dHi)}°C warmer than normal (${usual}).` });
  if (day.max_temp_c < hi.min) notes.push({ kind: 'record-cold', text: `Colder by day than any ${when} day in the last ${NORMAL_YEARS} years (${usual}).` });
  else if (dHi <= -Math.max(4, 1.5 * hi.sd)) notes.push({ kind: 'cold', text: `About ${Math.round(-dHi)}°C colder than normal (${usual}).` });
  if (!notes.length && dLo >= Math.max(4, 1.5 * lo.sd)) notes.push({ kind: 'warm-night', text: `A very mild night for ${when} - about ${Math.round(dLo)}°C above the usual low of ${Math.round(lo.mean)}°C.` });
  if (day.min_temp_c <= 0 && lo.mean >= 5) notes.push({ kind: 'early-frost', text: `A frost is unusual for ${when} (lows are normally about ${Math.round(lo.mean)}°C).` });
  if (day.rain_kind === 'snow' && !['dry', 'chance'].includes(day.rain_level) && snowDays < 0.03) notes.push({ kind: 'unseasonal-snow', text: `Snow is rare in ${when} here (${Math.round(snowDays * 100)}% of days in the last ${NORMAL_YEARS} years).` });
  if (gust.n && day.gust_max_mph >= 40 && day.gust_max_mph * 1.609 > gust.mean + 2 * gust.sd) notes.push({ kind: 'windy', text: `Much windier than usual for ${when}.` });
  if (!notes.length) return null;
  return { notes, normal_high_c: Math.round(hi.mean), normal_low_c: Math.round(lo.mean), years: NORMAL_YEARS };
}

// The kind of remark that suits each unusual turn - Ims makes up his own words, fresh each time.
export const UNUSUAL_PROMPTS = {
  'record-warm': { label: 'Record warmth for the time of year', how: 'Remark that it is the warmest for the time of year in years - an Indian summer, or summer refusing to leave - in fresh words of his own.', example: "Warmest start to October I can remember - summer's forgotten to go home." },
  warm: { label: 'Warm for the time of year', how: 'Remark that it is properly warm for the time of year, in fresh words rather than a stock phrase.', example: "Twenty degrees in October? Somebody's left t'oven door open." },
  'record-cold': { label: 'Record cold for the time of year', how: 'Remark that it is the coldest for the time of year in years, in fresh, dry words.', example: "Coldest I've seen it this time of year in a decade - even t'pigeons have gone indoors." },
  cold: { label: 'Cold for the time of year', how: 'Remark that it is cold for the time of year (a blackthorn winter in spring, or winter turning up early in autumn), fresh words not a stock phrase.', example: "Winter's turned up a month early and not even wiped its feet." },
  'warm-night': { label: 'A very mild night', how: 'Mention that the night is unusually mild for the time of year.', example: "Barely needs a duvet tonight, and it's nearly November." },
  'early-frost': { label: 'Frost out of season', how: 'Remark that a frost is early (or late) for the time of year, in fresh words.', example: "A frost already? The garden's not been told." },
  'unseasonal-snow': { label: 'Snow out of season', how: 'Make something of snow turning up when it has no business being here, in fresh words.', example: "Snow in April. Yorkshire's having a laugh." },
  windy: { label: 'Much windier than usual', how: 'Remark that it is a lot windier than usual for the time of year.', example: "Windiest it's been round here for this time of year - hang on to your bins." },
};

// Everything the Weather page lists under "Weather phrases".
export const phrasebook = () => ({
  rain: Object.entries(RAIN_WORDS).map(([level, w]) => ({ level, ...w })),
  temperature: TEMP_BANDS.map(({ band, when, use, avoid }) => ({ band, when, use, avoid })),
  wind: WIND_BANDS.map(({ band, when, use, avoid }) => ({ band, when, use, avoid })),
  other: Object.entries(OTHER_WORDS).map(([kind, w]) => ({ kind, ...w })),
  unusual: Object.entries(UNUSUAL_PROMPTS).map(([kind, u]) => ({ kind, ...u })),
});

const RAIN_SENTENCE = {
  dry: () => 'dry',
  chance: (g) => `${g.chance == null || g.chance < 40 ? 'small' : 'some'} chance of a ${g.kind === 'snow' ? 'snow shower' : 'shower'}${g.chance == null ? '' : ` (${g.chance}%)`}`,
  light: (g) => ({ drizzle: 'light drizzle', showers: 'a few light showers', snow: 'light snow', thunder: 'a chance of thunder' }[g.kind] || 'light rain'),
  moderate: (g) => ({ showers: 'showers', snow: 'snow', thunder: 'thundery showers' }[g.kind] || 'steady rain'),
  heavy: (g) => ({ showers: 'heavy showers', snow: 'heavy snow', thunder: 'thunderstorms' }[g.kind] || 'heavy rain'),
};

function rainText(g) {
  let s = RAIN_SENTENCE[g.level](g);
  if (g.level !== 'dry' && g.level !== 'chance') {
    s += ` (${g.chance == null ? '' : `${g.chance}% chance, `}about ${g.mm} mm`;
    if (g.from != null) s += g.from === g.until ? ` around ${g.from}:00` : `, mainly ${g.from}:00-${g.until + 1}:00`;
    s += ')';
  }
  return s;
}

// One plain-English line for a stretch of hours, e.g. "sunny spells, dry, 14-18°C, a gentle breeze (gusts to 21 mph)".
function describeHours(hours, { conditions = true, temps = true, rain = true, wind = true } = {}) {
  const sky = gradeSky(hours), g = gradeRain(hours), w = gradeWind(hours);
  const t = hours.map((h) => h.temp);
  const parts = [];
  if (conditions) parts.push(sky.words);
  if (rain) parts.push(rainText(g));
  if (temps) parts.push(`${Math.round(Math.min(...t))}-${Math.round(Math.max(...t))}°C`);
  if (wind) parts.push(`${w.words}${w.gustMph >= 25 ? ` (gusts to ${w.gustMph} mph)` : ''}`);
  return { text: parts.join(', '), sky, rain: g, wind: w, minC: Math.round(Math.min(...t)), maxC: Math.round(Math.max(...t)) };
}

function dayLabel(sky, g) {
  if (g.level === 'dry') return { clear: 'Sunny', partly: 'Sunny spells', 'mostly-cloudy': 'Mostly cloudy', cloudy: 'Cloudy', fog: 'Foggy' }[sky.sky] || 'Dry';
  if (g.level === 'chance') return `${sky.sky === 'clear' || sky.sky === 'partly' ? 'Sunny spells' : 'Cloudy'}, chance of a shower`;
  return RAIN_SENTENCE[g.level](g).replace(/^./, (c) => c.toUpperCase());
}

function iconFor(sky, g, isDay = true) {
  if (g.level === 'heavy' || g.level === 'moderate') return g.kind === 'thunder' ? 'storm' : g.kind === 'snow' ? 'snow' : 'heavy-rain';
  if (g.level === 'light') return g.kind === 'snow' ? 'snow' : g.kind === 'thunder' ? 'storm' : g.kind === 'drizzle' ? 'drizzle' : 'rain';
  if (sky.sky === 'fog') return 'fog';
  if (sky.sky === 'clear') return isDay ? 'sun' : 'moon';
  if (sky.sky === 'partly' || sky.sky === 'mostly-cloudy') return isDay ? 'partly' : 'partly-night';
  return 'cloud';
}

const hourIcon = (h) => iconFor(gradeSky([h]), gradeRain([h]), h.isDay);

const PERIODS = [['Morning', 6, 12], ['Afternoon', 12, 18], ['Evening', 18, 24]];

// ---- "sounds something like": the Weather page's preview of how Ims might put it ----
// Built from the same phrasebook Ims is given (RAIN_WORDS, TEMP_BANDS, WIND_BANDS), choosing a different
// phrase per period and day so it reads naturally. Shown on the page only - never handed to Ims, or he'd
// recite it word for word instead of saying it his own way.

const SKY_SAY = {
  clear: ['sunny', 'blue skies', 'plenty of sun'], partly: ['sunny spells', 'sun and a bit o\' cloud', 'bright wi\' some cloud'],
  'mostly-cloudy': ['mostly cloudy wi\' the odd bright bit', 'cloudy but brightening now and then'], cloudy: ['grey', 'cloudy', 'dull and grey'],
  fog: ['murky', 'foggy'],
};
const SKY_SAY_NIGHT = { clear: ['clear', 'clear skies'], partly: ['a bit o\' cloud', 'partly cloudy'], 'mostly-cloudy': ['mostly cloudy'], cloudy: ['cloudy'], fog: ['foggy', 'murky'] };
const UNUSUAL_SAY = {
  'record-warm': 'warmest for the time o\' year in a good while, that', warm: 'and that\'s warm for the time o\' year, mind',
  'record-cold': 'coldest for the time o\' year in a long while', cold: 'cold for the time o\' year, that',
  'warm-night': 'a right mild night for the time o\' year', 'early-frost': 'a frost, and it\'s early for one', 'unseasonal-snow': 'snow, and it\'s no business being here yet',
  windy: 'a lot windier than usual for the time o\' year',
};
const seedOf = (str) => [...str].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
const pick = (list, seed, k = 0) => list[(seed + k) % list.length];
const hour12 = (h) => `${h % 12 || 12}${h < 12 ? ' in the morning' : h < 17 ? '' : ' at night'}`.replace(/^(\d+)$/, '$1 o\'clock');

function sayHours(hours, lead, seed, unusual) {
  if (!hours.length) return '';
  const sky = gradeSky(hours), g = gradeRain(hours), w = gradeWind(hours);
  const night = !hours.some((h) => h.isDay);
  const maxC = Math.round(Math.max(...hours.map((h) => h.temp)));
  const temp = TEMP_BANDS.find((b) => maxC <= b.max);
  const windBand = WIND_BANDS.find((b) => w.gustMph < b.gust) || WIND_BANDS.at(-1);
  const skyWord = g.level === 'dry' || g.level === 'chance' ? pick((night ? SKY_SAY_NIGHT : SKY_SAY)[sky.sky] || ['cloudy'], seed) : null;
  let rain = pick(RAIN_WORDS[g.level].use, seed, 1);
  if (g.level === 'chance' && g.chance != null) rain += /shower/.test(rain) ? `, about ${g.chance} per cent` : ` - ${g.chance} per cent chance of a shower`;
  if (['light', 'moderate', 'heavy'].includes(g.level) && g.from != null) rain += ` from about ${hour12(g.from)}`;
  const tempWord = pick(temp.use, seed, 2);
  const windWord = pick(windBand.use, seed, 3);
  const windBit = /^(a |barely)/.test(windWord) ? `wi' ${windWord}` : `and ${windWord}`;
  const gusts = w.gustMph >= 30 ? ` - gusts up to ${w.gustMph}` : '';
  const parts = [skyWord, `${maxC} degrees and ${tempWord}`, rain].filter(Boolean);
  let line = `${lead}, ${parts.join(', ')}, ${windBit}${gusts}`;
  if (unusual?.notes?.length) line += ` - ${UNUSUAL_SAY[unusual.notes[0].kind] || 'not what you\'d expect for the time o\' year'}`;
  return `${line}.`;
}

// ---- fetch ----

async function fetchForecast(loc) {
  const key = `${loc.latitude.toFixed(3)},${loc.longitude.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&timezone=auto&forecast_days=${FORECAST_DAYS}`
    + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m'
    + '&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day,uv_index'
    + '&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max';
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`Open-Meteo returned HTTP ${res.status}`);
  const data = await res.json();
  cache.set(key, { at: Date.now(), data });
  return data;
}

/**
 * Current weather, the rest of today in periods, and a forecast for the coming days, with a
 * description Ims must stick to.
 * @param {object} o
 * @param {string} [o.location] place name or "lat,lon"; blank = home (Leeds unless changed on /ims/weather)
 * @param {number} [o.days] days of forecast to return (1-8, default 2)
 * @param {boolean} [o.hourly] include the next 48 hours, hour by hour (the Weather page)
 * @param {number} [o.days_ahead] a single day to report on: 0 today, 1 tomorrow, 7 a week today, 14 a fortnight
 * @param {string} [o.date] the same as a YYYY-MM-DD date
 */
export async function getWeather({ location = '', days = 2, hourly = false, days_ahead, date } = {}) {
  const n = Math.min(Math.max(parseInt(days, 10) || 2, 1), FORECAST_DAYS);
  const loc = await geocode(location);
  const label = [loc.name, loc.region, loc.country].filter(Boolean).join(', ');
  try {
    const d = await fetchForecast(loc);
    const H = d.hourly;
    const hours = H.time.map((time, i) => ({
      time, date: time.slice(0, 10), hour: Number(time.slice(11, 13)),
      temp: H.temperature_2m[i], feels: H.apparent_temperature[i], prob: H.precipitation_probability[i] ?? null,
      mm: H.precipitation[i] ?? 0, code: H.weather_code[i] ?? 0, windMph: mph(H.wind_speed_10m[i]), gustMph: mph(H.wind_gusts_10m[i]),
      windDir: compass(H.wind_direction_10m[i]), isDay: Boolean(H.is_day[i]), uv: H.uv_index[i] ?? 0,
    }));
    const c = d.current;
    const nowKey = c.time.slice(0, 13);
    const nowIdx = Math.max(0, hours.findIndex((h) => h.time.slice(0, 13) === nowKey));
    const today = c.time.slice(0, 10);
    const ahead = hours.slice(nowIdx);
    const restOfToday = ahead.filter((h) => h.date === today);

    // now - the current code can say drizzle when nothing is falling; go by what's measured
    let nowCondition = WMO[c.weather_code] || 'Overcast';
    if (isWetCode(c.weather_code) && !(c.precipitation > 0) && (hours[nowIdx]?.prob ?? 0) < 50) nowCondition = 'Overcast';
    const current = {
      temperature_c: Math.round(c.temperature_2m), feels_like_c: Math.round(c.apparent_temperature), condition: nowCondition,
      precipitation_mm: c.precipitation ?? 0, humidity_percent: c.relative_humidity_2m ?? 0,
      wind_speed_kmh: Math.round(c.wind_speed_10m ?? 0), wind_speed_mph: mph(c.wind_speed_10m), gust_mph: mph(c.wind_gusts_10m),
      wind_direction: compass(c.wind_direction_10m), is_daylight: Boolean(c.is_day),
    };

    // the rest of today, by period, plus overnight into tomorrow
    const periods = [];
    for (const [name, from, to] of PERIODS) {
      const hs = restOfToday.filter((h) => h.hour >= from && h.hour < to);
      if (hs.length) periods.push({ name, from: `${String(Math.max(from, hs[0].hour)).padStart(2, '0')}:00`, to: `${String(to % 24).padStart(2, '0')}:00`, ...describeHours(hs) });
    }
    const overnight = ahead.filter((h) => h.date > today).slice(0, 6);
    if (overnight.length) periods.push({ name: 'Overnight', from: '00:00', to: '06:00', ...describeHours(overnight) });

    // each day: daytime hours (07:00-21:00), or what's left of them today
    const dates = d.daily.time.filter((x, i) => x >= today && d.daily.temperature_2m_max[i] != null);
    const dayFor = (date, i) => {
      const di = d.daily.time.indexOf(date);
      const all = hours.filter((h) => h.date === date);
      let span = all.filter((h) => h.hour >= 7 && h.hour <= 21);
      if (date === today) span = restOfToday.length ? restOfToday : all.slice(-1);
      const sky = gradeSky(span), g = gradeRain(span), w = gradeWind(span);
      return {
        date, is_today: date === today, condition: dayLabel(sky, g), icon: iconFor(sky, g, true),
        max_temp_c: Math.round(d.daily.temperature_2m_max[di]), min_temp_c: Math.round(d.daily.temperature_2m_min[di]),
        rain_level: g.level, rain_kind: g.kind, rain_probability_percent: g.chance, rain_total_mm: g.mm,
        rain_from: g.from != null ? `${String(g.from).padStart(2, '0')}:00` : null,
        wind_max_mph: w.windMph, gust_max_mph: w.gustMph, wind_words: w.words,
        sunrise: d.daily.sunrise[di]?.slice(11, 16) || null, sunset: d.daily.sunset[di]?.slice(11, 16) || null,
        uv_max: Math.round(d.daily.uv_index_max[di] ?? 0),
        summary: describeHours(span).text, feel: tempWords(Math.round(d.daily.temperature_2m_max[di])),
        ...(i === 0 ? { covers: date === today ? 'rest of today' : 'day' } : {}),
        language: weatherLanguage({ maxC: Math.round(d.daily.temperature_2m_max[di]), minC: Math.round(d.daily.temperature_2m_min[di]), gustMph: w.gustMph, rain: g, sky, uv: d.daily.uv_index_max[di] ?? 0, humidity: 0 }),
        days_ahead: i, reliability: i <= 3 ? 'good' : i <= 7 ? 'fair' : 'rough guide only',
      };
    };
    let normals = null;
    try { normals = await loadNormals(loc); } catch (err) { console.warn('[Weather] No seasonal normals:', err.message); }
    const withUnusual = (day) => {
      const u = unusualFor(day, normals);
      return u ? { ...day, unusual: { ...u, how_to_mention: u.notes.map((x) => UNUSUAL_PROMPTS[x.kind]?.how).filter(Boolean).join(' ') } } : day;
    };
    const forecast = dates.slice(0, n).map((x, i) => withUnusual(dayFor(x, i)));

    // one particular day, asked for by how far ahead it is or its date
    let requested = null;
    const wantAhead = date ? Math.round((new Date(`${date}T12:00`) - new Date(`${today}T12:00`)) / 86400000) : days_ahead != null && days_ahead !== '' ? Number(days_ahead) : null;
    if (wantAhead != null && Number.isFinite(wantAhead)) {
      if (wantAhead < 0) requested = { error: 'That day has already gone.' };
      else if (wantAhead >= dates.length) requested = { error: `Forecasts only go ${dates.length - 1} days ahead (to ${dates.at(-1)}), so there's nothing for that day yet.` };
      else requested = withUnusual(dayFor(dates[wantAhead], wantAhead));
    }

    const todayRain = gradeRain(restOfToday);
    const description = {
      now: `${current.temperature_c}°C (feels like ${current.feels_like_c}°C), ${current.condition.toLowerCase()}, wind ${current.wind_speed_mph} mph ${current.wind_direction}.`,
      rest_of_today: periods.filter((p) => p.name !== 'Overnight').map((p) => `${p.name}: ${p.text}.`).join(' ') || 'The day is nearly over.',
      tonight: periods.find((p) => p.name === 'Overnight') ? `Overnight: ${periods.find((p) => p.name === 'Overnight').text}.` : '',
      tomorrow: forecast[1] ? `Tomorrow: ${forecast[1].summary}.` : '',
      outlook: forecast.slice(2).map((f) => `${new Date(`${f.date}T12:00`).toLocaleDateString('en-GB', { weekday: 'long' })}: ${f.condition.toLowerCase()}, ${f.min_temp_c}-${f.max_temp_c}°C`).join('; '),
      rain_level_today: todayRain.level,
      // words that fit the rest of today (rain, temperature, wind, plus fog/frost/snow/thunder/sun/muggy when
      // they apply); each forecast day carries its own set
      language_today: weatherLanguage({
        maxC: Math.round(Math.max(...(restOfToday.length ? restOfToday : hours.slice(nowIdx, nowIdx + 1)).map((h) => h.temp))),
        minC: forecast[0]?.min_temp_c, gustMph: gradeWind(restOfToday.length ? restOfToday : hours.slice(nowIdx, nowIdx + 1)).gustMph,
        rain: todayRain, sky: gradeSky(restOfToday), uv: forecast[0]?.uv_max ?? 0, humidity: current.humidity_percent,
      }),
      unusual_today: forecast[0]?.unusual || null,
      rules: 'Describe the weather ONLY from these facts, in your own Yorkshire words. "rest_of_today" covers only the hours still to come - '
        + 'rain that has already fallen is over and must not be talked about as coming. Match how strongly you describe rain to its level '
        + '(dry < chance < light < moderate < heavy): drizzle or light rain is never "chucking it down" - save that, "siling it down" and the like for heavy rain. '
        + 'If a period is dry, say it is dry. A small chance of a shower is a small chance, not a wet day. Temperatures in °C, wind in mph. Never invent weather that is not here. '
        + 'If requested_day is given, answer about that day; when its reliability is "rough guide only" (more than a week off), say it is only a rough guide that far ahead. '
        + 'Pick your words from the matching "language" set (language_today, or the day\'s own): its "use" words or your own of the same strength, never its "avoid" words. '
        + 'The strongest phrases (roasting, brass monkeys, blowing a hoolie, chucking it down) are only for weather that really is that strong. '
        + 'When a day has "unusual", say what is unusual about it for the time of year with a fresh remark of your own, following how_to_mention - never the same line twice.',
    };

    const payload = {
      location: label, is_home: loc.latitude === getHome().latitude && loc.longitude === getHome().longitude, coordinates: { latitude: loc.latitude, longitude: loc.longitude },
      source: 'Open-Meteo (best-match model; Met Office UKV over the UK)', updated: c.time,
      ...(requested ? { requested_day: requested } : {}),
      description, current, periods: periods.map(({ sky, rain, wind, ...p }) => ({ ...p, rain_level: rain.level, rain_probability_percent: rain.chance })),
      today: forecast[0] ? {
        date: forecast[0].date, condition: forecast[0].condition, max_temp_c: forecast[0].max_temp_c, min_temp_c: forecast[0].min_temp_c,
        rain_probability_percent: todayRain.chance, rain_total_mm: todayRain.mm, rain_level: todayRain.level, covers: 'rest of today',
      } : null,
      forecast,
    };
    // the Yorkshire-style retelling: shown on the Weather page, and given to Ims as the style to speak in
      const leads = { Morning: 'This morning', Afternoon: 'This afternoon', Evening: 'This evening', Overnight: 'Overnight' };
      const byPeriod = (_name, from, to) => restOfToday.filter((h) => h.hour >= from && h.hour < to);
      // one day seed, stepped per period, so neighbouring periods don't repeat the same phrase
      const daySeed = seedOf(today);
      const restSay = PERIODS.map(([name, from, to], i) => sayHours(byPeriod(name, from, to), leads[name], daySeed + i)).filter(Boolean);
      const tomorrowHours = hours.filter((h) => h.date === dates[1] && h.hour >= 7 && h.hour <= 21);
      payload.sounds_like = {
        rest_of_today: restSay.join(' '),
        tonight: sayHours(overnight, leads.Overnight, daySeed + 3),
        tomorrow: sayHours(tomorrowHours, 'Tomorrow', seedOf(`${dates[1]}day`), forecast[1]?.unusual),
      };
      if (forecast[0]?.unusual && restSay.length) {
        payload.sounds_like.rest_of_today = restSay.join(' ').replace(/\.$/, ` - ${UNUSUAL_SAY[forecast[0].unusual.notes[0].kind] || 'not what you\'d expect for the time o\' year'}.`);
      }
    // a particular day asked for ("a week on Saturday") gets its own example
    if (requested && !requested.error) {
      const dayName = new Date(`${requested.date}T12:00`).toLocaleDateString('en-GB', { weekday: 'long' });
      const lead = requested.days_ahead === 0 ? 'Today' : requested.days_ahead === 1 ? 'Tomorrow' : `On ${dayName}`;
      payload.sounds_like.requested_day = sayHours(hours.filter((h) => h.date === requested.date && h.hour >= 7 && h.hour <= 21), lead, seedOf(`${requested.date}req`), requested.unusual);
    }
    // Ims: the facts above are plain English for accuracy - he must retell them in dialect, never read them out
    payload.how_to_speak = 'Do NOT read the description lines out as written - they are plain-English facts. Retell them the way a Yorkshireman would, in broad Yorkshire dialect and your own words, keeping exactly the same strength of weather. '
      + `Say it something like this (vary the words every time; this is the style, not a script): "${payload.sounds_like.requested_day || [payload.sounds_like.rest_of_today, payload.sounds_like.tomorrow].filter(Boolean).join(' ')}"`;
    if (hourly) {
      payload.hourly = ahead.slice(0, 48).map((h) => ({
        time: h.time, hour: h.hour, date: h.date, icon: hourIcon(h), condition: WMO[h.code] || '', temp_c: Math.round(h.temp),
        feels_like_c: Math.round(h.feels), rain_probability_percent: h.prob, rain_mm: r1(h.mm),
        wind_mph: h.windMph, gust_mph: h.gustMph, wind_direction: h.windDir, uv: Math.round(h.uv), is_day: h.isDay,
      }));
    }
    // the speaking instruction first, so it is read before the facts
    const { how_to_speak: speak, ...rest } = payload;
    return { how_to_speak: speak, ...rest };
  } catch (err) {
    console.error('[Weather] Failed:', err.message);
    return {
      location: label,
      error: `Could not get the forecast just now: ${err.message}`,
      fallback: "Tell the user you couldn't get the forecast just now. Do not guess, and never invent any weather.",
    };
  }
}

export default { getWeather, getHome, setHome, listPlaces, addPlace, removePlace, phrasebook };
