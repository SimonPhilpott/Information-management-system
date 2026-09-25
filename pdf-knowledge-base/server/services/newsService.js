import db, { getSetting, setSetting } from '../db/database.js';
import config from '../config.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// News and interests for Ims: built-in BBC News feeds by topic, plus any sources the user adds on
// /ims/news. A source can be an RSS/Atom feed or an ordinary web page - for a page, IMS looks for
// the site's own feed first and otherwise takes the headlines off the page.
const BBC = {
  top: 'https://feeds.bbci.co.uk/news/rss.xml',
  uk: 'https://feeds.bbci.co.uk/news/uk/rss.xml',
  world: 'https://feeds.bbci.co.uk/news/world/rss.xml',
  local: 'https://feeds.bbci.co.uk/news/england/leeds_and_west_yorkshire/rss.xml',
  technology: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
  science: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
  health: 'https://feeds.bbci.co.uk/news/health/rss.xml',
  business: 'https://feeds.bbci.co.uk/news/business/rss.xml',
  sport: 'https://feeds.bbci.co.uk/sport/rss.xml',
  entertainment: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml',
};
export const NEWS_TOPICS = Object.keys(BBC);

db.exec(`CREATE TABLE IF NOT EXISTS news_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, url TEXT NOT NULL UNIQUE, feed_url TEXT,
  kind TEXT NOT NULL DEFAULT 'feed', in_report INTEGER NOT NULL DEFAULT 1, added_at INTEGER NOT NULL,
  last_ok INTEGER, last_error TEXT
)`);
try { db.exec('ALTER TABLE news_sources ADD COLUMN weight INTEGER NOT NULL DEFAULT 3'); } catch (_) { /* already there */ }
try { db.exec("ALTER TABLE news_sources ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'"); } catch (_) { /* already there */ }
// Optional per-source filter: {"libraryOnly": true, "genres": ["metal", "rock"]} keeps only stories
// naming a band from the MUZAK collection whose genre matches one of the words.
try { db.exec("ALTER TABLE news_sources ADD COLUMN filter TEXT NOT NULL DEFAULT '{}'"); } catch (_) { /* already there */ }
if (!db.prepare('SELECT COUNT(*) AS n FROM news_sources').get().n) {
  const ins = db.prepare('INSERT INTO news_sources (name, url, feed_url, kind, in_report, added_at) VALUES (?, ?, ?, ?, 1, ?)');
  ins.run('BBC News - top stories', 'https://www.bbc.co.uk/news', BBC.top, 'feed', Date.now());
  ins.run('BBC News - Leeds and West Yorkshire', 'https://www.bbc.co.uk/news/england/leeds_and_west_yorkshire', BBC.local, 'feed', Date.now());
}

const UA = 'Mozilla/5.0 (compatible; IMS/1.0; personal news reader)';
const cache = new Map();
const decode = (t) => String(t || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;|&#8217;|&rsquo;/g, "'").replace(/&#8216;|&lsquo;/g, "'")
  .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"').replace(/&#8211;|&ndash;/g, '-').replace(/&#8212;|&mdash;/g, '-').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, ' ').trim();
const SKIP = /^(watch|listen|in pictures|video|live)\b/i;

async function get(url) {
  // Redirects are followed by hand with a cookie jar: some sites (nature.com) bounce every
  // visitor through a login server that sets a cookie, and without it they loop forever.
  let res;
  const jar = new Map();
  let current = url;
  try {
    for (let hop = 0; hop < 10; hop++) {
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      res = await fetch(current, { signal: AbortSignal.timeout(15000), redirect: 'manual',
        headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, text/xml, text/html;q=0.9, */*;q=0.5', ...(cookie ? { Cookie: cookie } : {}) } });
      for (const c of res.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const i = kv.indexOf('='); if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim()); }
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) { current = new URL(loc, current).toString(); continue; }
      break;
    }
  } catch (err) {
    throw new Error(`Couldn't reach ${new URL(url).hostname} - check the address.`);
  }
  if (res.status >= 300 && res.status < 400) throw new Error(`${new URL(url).hostname} kept redirecting - try the site's RSS feed instead.`);
  Object.defineProperty(res, 'finalUrl', { value: current });
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`);
  return { text: await res.text(), type: res.headers.get('content-type') || '', finalUrl: res.finalUrl || url };
}

const isFeed = (text) => /<rss[\s>]|<feed[\s>][\s\S]*?xmlns="http:\/\/www\.w3\.org\/2005\/Atom"|<rdf:RDF/i.test(text.slice(0, 3000));

function parseFeed(xml) {
  const title = decode((xml.match(/<channel[^>]*>[\s\S]*?<title>([\s\S]*?)<\/title>/) || xml.match(/<feed[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]);
  const blocks = [...xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  const entries = blocks.length ? blocks : [...xml.matchAll(/<entry[\s>]([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  const tag = (b, names) => { for (const n of names) { const m = b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`)); if (m) return m[1]; } return ''; };
  const items = entries.map((b) => {
    const linkAttr = (b.match(/<link[^>]*href="([^"]+)"/) || [])[1];
    const when = tag(b, ['pubDate', 'published', 'updated', 'dc:date']);
    return {
      headline: decode(tag(b, ['title'])),
      summary: decode(tag(b, ['description', 'summary', 'content:encoded', 'content'])).slice(0, 300),
      link: decode(tag(b, ['link'])) || linkAttr || '',
      published: when ? Date.parse(decode(when)) || null : null,
    };
  }).filter((i) => i.headline && !SKIP.test(i.headline));
  return { title, items };
}

function findFeedLink(html, base) {
  const m = [...html.matchAll(/<link[^>]+>/gi)].map((x) => x[0])
    .find((t) => /rel=["']?alternate/i.test(t) && /type=["']?application\/(rss|atom)\+xml/i.test(t));
  const href = m && (m.match(/href=["']([^"']+)["']/i) || [])[1];
  return href ? new URL(decode(href), base).toString() : null;
}

// Headlines straight off a page: links inside h1-h3, then any long link text as a fallback.
function parsePage(html, base) {
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  const clean = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>/gi, ' ');
  const seen = new Set();
  const items = [];
  const push = (text, href) => {
    const t = decode(text);
    if (t.length < 25 || t.length > 180 || seen.has(t) || SKIP.test(t)) return;
    seen.add(t);
    let link = '';
    try { link = href ? new URL(decode(href), base).toString() : ''; } catch (_) { /* bad href */ }
    items.push({ headline: t, summary: '', link, published: null });
  };
  for (const m of clean.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const a = m[1].match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    push(a ? a[2] : m[1], a ? a[1] : null);
    if (items.length >= 15) break;
  }
  if (items.length < 4) for (const m of clean.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) { push(m[2], m[1]); if (items.length >= 15) break; }
  const desc = decode((html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i) || [])[1]);
  return { title, description: desc, items };
}

// When a page blocks IMS or has no readable headlines, try where sites usually keep their feed.
async function guessFeed(url) {
  const u = new URL(url);
  const tries = /(^|\.)reddit\.com$/.test(u.hostname)
    ? [`${u.origin}${u.pathname.replace(/\/$/, '')}/.rss`]
    : [...new Set([`${u.origin}${u.pathname.replace(/\/$/, '')}/feed`, `${u.origin}${u.pathname.replace(/\/$/, '')}/rss`, `${u.origin}/feed`, `${u.origin}/rss`, `${u.origin}/rss.xml`, `${u.origin}/feed.xml`, `${u.origin}/atom.xml`, `${u.origin}/index.xml`, `${u.origin}/${u.hostname.replace(/^www\./, '').split('.')[0]}.rss`])];
  for (const t of tries) {
    try {
      const r = await get(t);
      if (isFeed(r.text)) { const f = parseFeed(r.text); if (f.items.length) return { kind: 'feed', feedUrl: r.finalUrl, name: f.title, items: f.items }; }
    } catch (_) { /* next */ }
  }
  return null;
}

// Work out what a URL is: a feed, a page with a feed, or just a page.
async function inspect(url) {
  let page;
  try { page = await get(url); } catch (err) {
    const g = await guessFeed(url);
    if (g) return g;
    throw /answered 40[13]/.test(err.message) ? new Error(`${new URL(url).hostname} blocks automated readers and has no public feed IMS could find. If the site has an RSS link, paste that instead.`) : err;
  }
  if (isFeed(page.text)) { const f = parseFeed(page.text); return { kind: 'feed', feedUrl: page.finalUrl, name: f.title, items: f.items }; }
  const feedUrl = findFeedLink(page.text, page.finalUrl);
  if (feedUrl) {
    try {
      const feed = await get(feedUrl);
      if (isFeed(feed.text)) { const f = parseFeed(feed.text); if (f.items.length) return { kind: 'feed', feedUrl, name: f.title || parsePage(page.text, page.finalUrl).title, items: f.items }; }
    } catch (_) { /* fall back to the page */ }
  }
  const p = parsePage(page.text, page.finalUrl);
  if (p.items.length < 3) {
    const g = await guessFeed(url);
    if (g) return { ...g, name: g.name || (/challenge|javascript/i.test(p.title) ? new URL(url).hostname.replace(/^www\./, '') : p.title) };
    if (/client challenge|enable javascript|checking your browser|just a moment|verify you are human|security check|captcha|are you a robot/i.test(p.title + page.text.slice(0, 4000))) {
      throw new Error(`${new URL(url).hostname} only shows its page to a real browser (an anti-bot check), and IMS couldn't find its RSS feed. Look for an RSS link on the site and paste that instead.`);
    }
  }
  return { kind: 'page', feedUrl: null, name: p.title, items: p.items };
}

async function itemsFor(src) {
  const key = src.feed_url || src.url;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 20 * 60000) return hit.items;
  let items;
  try {
    if (src.kind === 'feed' && src.feed_url) items = parseFeed((await get(src.feed_url)).text).items;
    else { const page = await get(src.url); items = parsePage(page.text, page.finalUrl).items; }
    if (src.id) db.prepare('UPDATE news_sources SET last_ok = ?, last_error = NULL WHERE id = ?').run(Date.now(), src.id);
  } catch (err) {
    if (src.id) db.prepare('UPDATE news_sources SET last_error = ? WHERE id = ?').run(err.message, src.id);
    throw err;
  }
  cache.set(key, { at: Date.now(), items });
  return items;
}

const fresh = (i) => !i.published || Date.now() - i.published < 36 * 3600000;

// A source's stories with its filter applied (see the filter column above). Hoisted functions
// below provide the artist matching.
async function filteredItems(src) {
  const items = await itemsFor(src);
  const f = parseFilter(src.filter);
  if (!f.libraryOnly) return items;
  const genres = (f.genres || []).map((g) => g.toLowerCase());
  const matchers = artistMatchers().filter((m) => !genres.length || genres.some((g) => (m.genre || '').toLowerCase().includes(g)));
  const kept = items.map((i) => {
    const m = bestArtistMatch(matchers, i.headline) || bestArtistMatch(matchers, `${i.headline} ${i.summary || ''}`);
    return m ? { ...i, artist: m.artist } : null;
  }).filter(Boolean);
  // Tours only count if they come to the UK (see tourPlace); other news about the bands stays.
  const placed = await Promise.all(kept.map(async (i) => {
    if (!TOUR_RX.test(`${i.headline} ${i.summary || ''}`)) return i;
    const where = await tourPlace(i);
    return where.tier ? { ...i, where } : null;
  }));
  return placed.filter(Boolean);
}

// ---- sources the user manages ------------------------------------------------------------------------
const parseTags = (t) => { try { const a = JSON.parse(t || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
const cleanTags = (tags) => [...new Set((Array.isArray(tags) ? tags : String(tags || '').split(','))
  .map((t) => String(t).trim().toLowerCase().replace(/[^a-z0-9&+' -]/g, '').replace(/\s+/g, ' ')).filter((t) => t && t.length <= 30))].slice(0, 12);
const parseFilter = (f) => { try { const o = JSON.parse(f || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };
const present = (r) => ({ id: r.id, name: r.name, url: r.url, feedUrl: r.feed_url, kind: r.kind, inReport: Boolean(r.in_report), weight: r.weight ?? 3, tags: parseTags(r.tags), filter: parseFilter(r.filter), lastOk: r.last_ok, lastError: r.last_error });

// Short tags for what a source covers ("heavy metal", "album reviews", "space"), from its name,
// address and recent headlines. Editable on the page; Ims uses them to pick sources for a topic.
async function suggestTags(name, url, items) {
  try {
    const model = new GoogleGenerativeAI(config.gemini.apiKey).getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } });
    const prompt = `A news source: "${name}" (${url}). Recent headlines:\n${items.slice(0, 12).map((i) => `- ${i.headline}`).join('\n')}\n\nGive 3 to 6 short lowercase tags (1-3 words each) describing the kind of news and topics found there, most useful first, e.g. ["heavy metal", "album reviews", "music news"]. Reply with a JSON array of strings only.`;
    return cleanTags(JSON.parse((await model.generateContent(prompt)).response.text()));
  } catch (err) {
    console.warn('[News] Tag suggestion failed:', err.message);
    return [];
  }
}

export async function autoTagSource(id) {
  const row = db.prepare('SELECT * FROM news_sources WHERE id = ?').get(Number(id));
  if (!row) throw new Error('Source not found.');
  let items = [];
  try { items = await itemsFor(row); } catch (_) { /* tag from name and address alone */ }
  const tags = await suggestTags(row.name, row.url, items);
  if (tags.length) db.prepare('UPDATE news_sources SET tags = ? WHERE id = ?').run(JSON.stringify(tags), row.id);
  return present(db.prepare('SELECT * FROM news_sources WHERE id = ?').get(row.id));
}

// Sources added before tags existed get theirs once, in the background.
setTimeout(async () => {
  for (const r of db.prepare("SELECT id FROM news_sources WHERE tags IS NULL OR tags = '[]'").all()) {
    try { await autoTagSource(r.id); } catch (_) { /* try again next start */ }
  }
}, 20000);
export const listSources = () => db.prepare('SELECT * FROM news_sources ORDER BY weight DESC, id').all().map(present);
// How many items a source gets in the report, by how much it matters (1-5).
const REPORT_ITEMS = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 4 };

function normaliseUrl(url) {
  let u;
  try { u = new URL(String(url || '').trim().replace(/^(?!https?:\/\/)/i, 'https://')); } catch { throw new Error('That is not a web address.'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http and https addresses.');
  return u;
}

export async function addSource({ url, name, weight, filter }) {
  const u = normaliseUrl(url);
  if (db.prepare('SELECT id FROM news_sources WHERE url = ?').get(u.toString())) throw new Error('That source is already on the list.');
  const info = await inspect(u.toString());
  if (!info.items.length) throw new Error('Could not find any headlines at that address - try the site\'s news page or its RSS feed.');
  const w = Math.max(1, Math.min(5, Math.round(Number(weight) || 3)));
  const r = db.prepare('INSERT INTO news_sources (name, url, feed_url, kind, in_report, weight, added_at, last_ok) VALUES (?, ?, ?, ?, 1, ?, ?, ?)')
    .run((String(name || '').trim() || info.name || u.hostname).slice(0, 80), u.toString(), info.feedUrl, info.kind, w, Date.now(), Date.now());
  cache.set(info.feedUrl || u.toString(), { at: Date.now(), items: info.items });
  const tags = await suggestTags(String(name || '').trim() || info.name || u.hostname, u.toString(), info.items);
  if (tags.length) db.prepare('UPDATE news_sources SET tags = ? WHERE id = ?').run(JSON.stringify(tags), r.lastInsertRowid);
  if (filter) db.prepare('UPDATE news_sources SET filter = ? WHERE id = ?').run(JSON.stringify({ libraryOnly: Boolean(filter.libraryOnly), genres: cleanTags(filter.genres || []) }), r.lastInsertRowid);
  return { source: present(db.prepare('SELECT * FROM news_sources WHERE id = ?').get(r.lastInsertRowid)), items: info.items.slice(0, 8) };
}

export async function updateSource(id, { name, inReport, weight, url, tags, filter }) {
  const row = db.prepare('SELECT * FROM news_sources WHERE id = ?').get(Number(id));
  if (!row) throw new Error('Source not found.');
  if (url !== undefined && String(url).trim() && String(url).trim() !== row.url) {
    const u = normaliseUrl(url);
    if (db.prepare('SELECT id FROM news_sources WHERE url = ? AND id != ?').get(u.toString(), row.id)) throw new Error('Another source already uses that address.');
    const info = await inspect(u.toString());
    if (!info.items.length) throw new Error('Could not find any headlines at that address - the old one is kept.');
    cache.delete(row.feed_url || row.url);
    db.prepare('UPDATE news_sources SET url = ?, feed_url = ?, kind = ?, last_ok = ?, last_error = NULL WHERE id = ?').run(u.toString(), info.feedUrl, info.kind, Date.now(), row.id);
    cache.set(info.feedUrl || u.toString(), { at: Date.now(), items: info.items });
  }
  if (weight !== undefined) db.prepare('UPDATE news_sources SET weight = ? WHERE id = ?').run(Math.max(1, Math.min(5, Math.round(Number(weight) || 3))), row.id);
  if (tags !== undefined) db.prepare('UPDATE news_sources SET tags = ? WHERE id = ?').run(JSON.stringify(cleanTags(tags)), row.id);
  if (filter !== undefined) {
    const f = { libraryOnly: Boolean(filter?.libraryOnly), genres: cleanTags(filter?.genres || []) };
    db.prepare('UPDATE news_sources SET filter = ? WHERE id = ?').run(JSON.stringify(f), row.id);
  }
  if (name !== undefined && String(name).trim()) db.prepare('UPDATE news_sources SET name = ? WHERE id = ?').run(String(name).trim().slice(0, 80), row.id);
  if (inReport !== undefined) db.prepare('UPDATE news_sources SET in_report = ? WHERE id = ?').run(inReport ? 1 : 0, row.id);
  return present(db.prepare('SELECT * FROM news_sources WHERE id = ?').get(row.id));
}
export const deleteSource = (id) => db.prepare('DELETE FROM news_sources WHERE id = ?').run(Number(id)).changes > 0;

export async function sourceItems(id) {
  const row = db.prepare('SELECT * FROM news_sources WHERE id = ?').get(Number(id));
  if (!row) throw new Error('Source not found.');
  return (await filteredItems(row)).slice(0, 10);
}

// ---- no repeats --------------------------------------------------------------------------------------
// The same story often turns up on several sources with different wording. Two items count as the
// same story when their headlines share most of their key words (or headline + opening of the
// summary do). Ims also remembers what it has already told the user today, so a later news request
// or day report brings new stories rather than the morning's again.
const STOP = new Set('the a an and or but of to in on at for from by with as is are was were be been has have had it its this that these those after before over under into about new says say said how why what who when where will would could can may more most than not no up out off amid against between during latest live news report reports update'.split(' '));
const keyWords = (t) => new Set(String(t || '').toLowerCase().replace(/[’'`]/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(' ')
  .filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(ings|ing|ed|es|s)$/, '')).filter((w) => w.length > 2));
const overlap = (A, B) => { let n = 0; for (const w of A) if (B.has(w)) n++; return { n, small: Math.min(A.size, B.size) }; };
function sameStory(a, b) {
  const h = overlap(a.hw, b.hw);
  if (h.small >= 2 && ((h.n >= 3 && h.n / h.small >= 0.5) || (h.small <= 3 && h.n === h.small))) return true;
  const f = overlap(a.fw, b.fw);
  return f.n >= 5 && f.n / f.small >= 0.45;
}
const withWords = (i) => ({ ...i, hw: keyWords(i.headline), fw: keyWords(`${i.headline} ${String(i.summary || '').slice(0, 160)}`) });
const strip = ({ hw, fw, ...rest }) => rest;

const TOLD_KEY = 'news_told_today';
const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
function toldToday() {
  try { const t = JSON.parse(getSetting(TOLD_KEY) || 'null'); return t && t.day === todayKey() ? t.items.map((x) => withWords(x)) : []; } catch { return []; }
}
function markTold(items) {
  const prev = toldToday().map(strip);
  const next = [...prev, ...items.map((i) => ({ headline: i.headline, summary: String(i.summary || '').slice(0, 160) }))].slice(-150);
  setSetting(TOLD_KEY, JSON.stringify({ day: todayKey(), items: next }));
}

// Picks up to `limit(src)` distinct stories per source, best sources first, skipping anything
// already picked from another source or already told today; notes where else each story appeared.
async function pickStories(sources, limit) {
  const told = toldToday();
  const candidates = [];
  for (const src of sources) {
    try { candidates.push({ src, items: (await filteredItems(src)).filter(fresh).map(withWords) }); }
    catch (err) { console.warn(`[News] ${src.name} failed:`, err.message); }
  }
  const chosen = [];
  let skippedTold = 0;
  for (const { src, items } of candidates) {
    let n = 0;
    for (const i of items) {
      if (n >= limit(src)) break;
      if (told.some((t) => sameStory(t, i))) { skippedTold++; continue; }
      const dup = chosen.find((c) => sameStory(c, i));
      if (dup) { if (!dup.alsoIn.includes(src.name) && dup.source !== src.name) dup.alsoIn.push(src.name); continue; }
      chosen.push({ ...i, source: src.name, importance: src.weight ?? 3, alsoIn: [] });
      n++;
    }
  }
  // Record other sources carrying a chosen story even when it wasn't picked from them.
  for (const { src, items } of candidates) for (const i of items) {
    const c = chosen.find((x) => x.source !== src.name && sameStory(x, i));
    if (c && !c.alsoIn.includes(src.name)) c.alsoIn.push(src.name);
  }
  return { stories: chosen.map((c) => { const o = strip(c); if (!o.alsoIn.length) delete o.alsoIn; return o; }), skippedTold };
}

// ---- what Ims and the report use ----------------------------------------------------------------------
// The report: a few fresh stories from each source marked "in report". More important sources
// (weight 1-5) get more stories and come first. No story appears twice.
export async function getReportNews() {
  const sources = db.prepare('SELECT * FROM news_sources WHERE in_report = 1 ORDER BY weight DESC, id').all();
  const { stories } = await pickStories(sources, (src) => REPORT_ITEMS[src.weight ?? 3] ?? 2);
  markTold(stories);
  return stories;
}

// On request: news about something ("heavy metal", "space"), one of the user's sources by name,
// all of their sources, or a BBC topic.
const topicWords = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/s$/, ''));
function sourcesAbout(about, all) {
  const words = topicWords(about);
  if (!words.length) return [];
  return all.map((s) => {
    const hay = `${s.name} ${parseTags(s.tags).join(' ')}`.toLowerCase();
    const hits = words.filter((w) => hay.includes(w)).length;
    return { s, score: hits / words.length };
  }).filter((x) => x.score >= 0.5).sort((a, b) => b.score - a.score || (b.s.weight ?? 3) - (a.s.weight ?? 3)).map((x) => x.s);
}

export async function getNews({ topic, source, about, tours } = {}) {
  if (tours) {
    const found = (await getTourNews({ days: 14, includeTold: true })).slice(0, 8);
    markTold(found);
    return { tours: found.map((t) => ({ artist: t.artist, headline: t.headline, summary: t.summary, source: t.source, playing: t.places })),
      note: found.length ? 'Only UK dates are included. Lead with Leeds, Sheffield, Manchester or York, then the rest of the north; London is a maybe for them.' : 'No UK tour news for bands in their library in the last two weeks - say so.' };
  }
  const all = db.prepare('SELECT * FROM news_sources ORDER BY weight DESC, id').all();
  let sources, label, filterWords = null;
  if (about) {
    sources = sourcesAbout(about, all).slice(0, 6);
    if (sources.length) label = `sources tagged for "${about}"`;
    else { sources = all.slice(0, 10); filterWords = topicWords(about); label = `headlines mentioning "${about}" across all sources`; }
  } else if (source) {
    const q = String(source).toLowerCase();
    sources = q === 'all' || q === 'mine' ? all : all.filter((s) => s.name.toLowerCase().includes(q) || s.url.toLowerCase().includes(q) || parseTags(s.tags).some((t) => t.includes(q)));
    if (!sources.length) return { error: `No news source called "${source}". Sources: ${all.map((s) => s.name).join('; ')}` };
    sources = sources.slice(0, 8);
  } else {
    const t = NEWS_TOPICS.includes(topic) ? topic : 'top';
    sources = [{ name: `BBC News (${t})`, kind: 'feed', feed_url: BBC[t], url: BBC[t], weight: 3 }];
    label = `BBC News (${t})`;
  }
  const perSource = (src) => (sources.length > 1 ? Math.max(2, REPORT_ITEMS[src.weight ?? 3] ?? 2) : 6);
  let { stories, skippedTold } = await pickStories(sources, filterWords ? () => 50 : perSource);
  if (filterWords) {
    stories = stories.filter((st) => { const hay = `${st.headline} ${st.summary || ''}`.toLowerCase(); return filterWords.some((w) => hay.includes(w)); }).slice(0, 8);
  }
  markTold(stories);
  return {
    ...(label ? { source: label } : {}),
    items: stories,
    ...(about && !stories.length ? { nothingFound: `Nothing about "${about}" in their sources right now - say so, and mention they can add a source for it on the News Sources page.` } : {}),
    ...(skippedTold ? { note: `${skippedTold} stor${skippedTold === 1 ? 'y was' : 'ies were'} left out because you already told the user today.` } : {}),
    ...(!stories.length && skippedTold ? { nothingNew: 'Nothing new since you last went through the news today - say so.' } : {}),
  };
}

// For Ims's instructions: every source with its tags.
export const describeSources = () => db.prepare('SELECT name, tags FROM news_sources ORDER BY weight DESC, id').all()
  .map((r) => `${r.name}${parseTags(r.tags).length ? ` (${parseTags(r.tags).join(', ')})` : ''}`);

export const sourceNames = () => db.prepare('SELECT name FROM news_sources ORDER BY id').all().map((r) => r.name);

// ---- tour news for bands in the music library ---------------------------------------------------------
// Tour stories (new tours, dates, headline shows, festival slots) from any of the user's sources
// are matched against the artists in their MUZAK library. Matches that mention Leeds, Sheffield,
// Manchester or York (read from the article itself, not just the headline) come first.
import { getArtistList } from './musicScanService.js';

const TOUR_RX = /\b(tour|tours|touring|tour dates|live dates|uk dates|european dates|headline shows?|headlining|co-headlin\w*|festival|announces? .{0,30}dates|shows? in|arena run|gig|gigs|line-?up|to headline|headliners?|fest)\b/i;
export const HOME_TOWNS = [
  ['Leeds', /\bleeds\b/i], ['Sheffield', /\bsheffield\b/i], ['Manchester', /\bmanchester\b/i], ['York', /(?<!new\s)\byork\b/i],
];
const COMMON = new Set(('live down low air pet rush yes heart tool echo kiss love war time gone home alive cure muse free life dead death doom black white red blue ' +
  'gold light night day sun moon star fire ice storm rain wind earth stone iron steel glass wolf bear lion hope fear pain rage wrath grief sleep dream ' +
  'ghost spirit soul mind body blood bone skull king queen god gods devil angel heaven hell world end void chaos order power force reign ruin return ' +
  'rise fall burn run fly high deep dark cold warm new old big little great last first one two three four five six seven eight nine ten live').split(' '));
const escRx = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let artistCache = { at: 0, list: [] };
function artistMatchers() {
  if (Date.now() - artistCache.at < 10 * 60000 && artistCache.list.length) return artistCache.list;
  const out = [];
  let artists = [];
  try { artists = getArtistList(); } catch (_) { artists = []; }
  for (const a of artists) {
    if ((a.genre || '').toLowerCase() === 'bullshit') continue; // the user's own label for compilations
    const names = [...new Set([a.mbName, a.name, ...(a.aliases || [])].filter(Boolean).map((n) => n.trim()).filter((n) => n.length >= 2 && !/various|soundtrack|christmas|\[|\(\d/i.test(n)))];
    for (const n of names) {
      const words = n.split(/\s+/);
      const lower = n.toLowerCase();
      let re;
      if (words.length === 1 && (COMMON.has(lower) || n.length <= 4)) {
        if (lower === 'live' || n.length < 3) continue;
        re = new RegExp(`(?<![A-Za-z0-9])(${escRx(n)}|${escRx(n.toUpperCase())})(?![A-Za-z0-9])`); // exact case only
      } else if (n.length < 8) {
        re = new RegExp(`(?<![A-Za-z0-9])(${escRx(n)}|${escRx(n.toUpperCase())})(?![A-Za-z0-9])`);
      } else {
        re = new RegExp(`(?<![A-Za-z0-9])${escRx(n)}(?![A-Za-z0-9])`, 'i');
      }
      out.push({ artist: a.mbName || a.name, genre: a.genre || '', re, name: n, strict: words.length === 1 && (COMMON.has(lower) || n.length < 8) });
    }
  }
  artistCache = { at: Date.now(), list: out };
  return out;
}

// The longest matching library name wins; a short one-word name only counts when it stands alone,
// not as part of a longer proper name ("ALEX LIFESON" is not the artist ALEX).
function bestArtistMatch(matchers, text) {
  let best = null;
  for (const m of matchers) {
    const hit = m.re.exec(text);
    if (!hit) continue;
    if (m.strict) {
      const before = text.slice(0, hit.index), after = text.slice(hit.index + hit[0].length);
      const nextWord = (after.match(/^\s+([A-Z][A-Za-z'’-]*)/) || [])[1] || '';
      const prevWord = (before.match(/([A-Z][A-Za-z'’-]*)\s+$/) || [])[1] || '';
      const allCaps = (w) => w.length > 1 && w === w.toUpperCase();
      if (allCaps(hit[0])) {
        // Written in capitals, the way Blabbermouth and others write band names ("Touring With RUSH
        // Again"): counts unless it runs into another all-caps word ("ALEX LIFESON").
        if (allCaps(nextWord) || allCaps(prevWord)) continue;
      } else if (nextWord || prevWord) {
        // Written normally: part of a longer capitalised phrase ("Wacken Open Air", "Lay Me Down") isn't the band.
        continue;
      }
    }
    // The band named first wins (the story is usually about them); ties go to the longer name.
    if (!best || hit.index < best.index || (hit.index === best.index && m.name.length > best.name.length)) best = { ...m, index: hit.index };
  }
  return best;
}

const articleCache = new Map();
async function articleText(link) {
  if (!link) return '';
  const hit = articleCache.get(link);
  if (hit && Date.now() - hit.at < 6 * 3600000) return hit.text;
  let text = '';
  try {
    const page = await get(link);
    text = page.text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 60000);
  } catch (_) { /* headline and summary only */ }
  articleCache.set(link, { at: Date.now(), text });
  return text;
}

// All tour stories about library bands, newest first, home-town ones at the top.
// Where a tour is playing, read from the headline, summary and the article itself.
// tier 1 = a home city (Leeds, Sheffield, Manchester, York), 2 = elsewhere in the north of England,
// 3 = London (a maybe), 4 = a UK tour with no cities named yet, 0 = not coming to the UK.
const NORTH = ['Bradford', 'Wakefield', 'Huddersfield', 'Halifax', 'Harrogate', 'Hull', 'Scarborough', 'Doncaster', 'Rotherham', 'Barnsley',
  'Newcastle', 'Gateshead', 'Sunderland', 'Middlesbrough', 'Durham', 'Carlisle', 'Liverpool', 'Preston', 'Lancaster', 'Blackpool', 'Bolton',
  'Wigan', 'Warrington', 'Stockport', 'Salford', 'Leeds Festival', 'Damnation Festival'];
const UK_RX = /\b(uk|u\.k\.|united kingdom|britain|british|england|scotland|wales|uk\s*(?:&|and)\s*ireland)\b/i;
// UK festivals by name (the northern ones - Leeds Festival, Damnation - are in NORTH above).
const UK_FESTIVALS = /\b(bloodstock|download festival|download 20\d\d|arctangent|radar festival|tech-fest|slam dunk|hammerfest|uprising festival|mammothfest|incineration fest|temples festival|reading festival|2000trees)\b/i;
async function tourPlace(i) {
  const body = `${i.headline} ${i.summary || ''} ${await articleText(i.link)}`;
  const home = HOME_TOWNS.filter(([, re]) => re.test(body)).map(([town]) => town);
  if (home.length) return { tier: 1, places: home };
  const north = NORTH.filter((c) => new RegExp(`\\b${c}\\b`, 'i').test(body));
  if (north.length) return { tier: 2, places: north.slice(0, 3) };
  if (/\blondon\b/i.test(body)) return { tier: 3, places: ['London'] };
  const fest = body.match(UK_FESTIVALS);
  if (fest) return { tier: 4, places: [`${fest[0].replace(/\b\w/g, (c) => c.toUpperCase())} (UK festival)`] };
  if (UK_RX.test(`${i.headline} ${i.summary || ''}`)) return { tier: 4, places: ['UK (cities not listed)'] };
  return { tier: 0, places: [] };
}

export async function getTourNews({ days = 4, includeTold = false } = {}) {
  const matchers = artistMatchers();
  if (!matchers.length) return [];
  const told = includeTold ? [] : toldToday();
  const found = [];
  const seen = new Set();
  for (const src of db.prepare('SELECT * FROM news_sources ORDER BY weight DESC, id').all()) {
    let items = [];
    try { items = await filteredItems(src); } catch (_) { continue; }
    const tourSource = parseTags(src.tags).some((t) => /tour|gig|concert|live music/.test(t));
    for (const i of items) {
      if (i.published && Date.now() - i.published > days * 86400000) continue;
      const text = `${i.headline} ${i.summary || ''}`;
      if (!tourSource && !TOUR_RX.test(text)) continue;
      if (tourSource && !TOUR_RX.test(text) && !/\b(dates?|shows?|live)\b/i.test(text)) continue;
      const m = bestArtistMatch(matchers, i.headline) || bestArtistMatch(matchers, text); // the headline's band first
      if (!m) continue;
      const w = withWords(i);
      if (seen.has(i.headline) || found.some((f) => sameStory(f, w)) || told.some((t) => sameStory(t, w))) continue;
      seen.add(i.headline);
      found.push({ ...w, artist: m.artist, source: src.name, link: i.link, where: i.where });
    }
  }
  // Where are they playing? Only UK dates count; home cities first, then the north, London, other UK.
  const placed = await Promise.all(found.slice(0, 40).map(async (f) => ({ ...f, where: f.where || await tourPlace(f) })));
  return placed.filter((f) => f.where.tier).map(strip)
    .map((f) => ({ ...f, near: f.where.tier === 1 ? f.where.places : [], places: f.where.places, tier: f.where.tier }))
    .sort((a, b) => a.tier - b.tier || (b.published || 0) - (a.published || 0));
}

export async function tourNewsForReport() {
  const tours = (await getTourNews()).slice(0, 5);
  markTold(tours);
  return tours;
}
