// Homebrew (beta): addresses, data calls, filters and the reading of a brew's state (how active it is, what to do
// next). Uses the same /api/homebrew service as the classic portal - only the page is new.
import { COLOUR_TILE, colourOf, sweetOf, strengthOf, famKey, slug, STATUS_WORD, ingredientHits, wantedOf } from './brewData';

// Where Homebrew lives: /ims/homebrew inside IMS, or the root of its own site when it runs as the standalone app
// (the Homebrew repo sets VITE_HOMEBREW_BASE to '' and VITE_HOMEBREW_STANDALONE to 1)
export const BASE = import.meta.env?.VITE_HOMEBREW_BASE ?? '/ims/homebrew';
export const STANDALONE = import.meta.env?.VITE_HOMEBREW_STANDALONE === '1';
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---- addresses: every screen has its own, so Android's back gesture and new tabs work ----
// /ims/homebrew                  My brews
// /ims/homebrew/recipes          Recipe book
// /ims/homebrew/find             Find by ingredient
// /ims/homebrew/favourites       Favourites
// /ims/homebrew/tools            Brewing tools (calculators)
// /ims/homebrew/recipe/412-broom-wine[/edit]   a recipe (or its edit form)
// /ims/homebrew/brew/1016-apple-pie-cider[/edit]
// /ims/homebrew/new/recipe | /new/brew          the new-recipe / new-brew form
export const DESTS = ['brews', 'recipes', 'find', 'favourites', 'tools'];
export function parsePath(p) {
  // (the beta's old /ims/homebrew-beta addresses open the same screens)
  const rest = String(p || '').replace(BASE ? new RegExp(`^${escRe(BASE)}(-beta)?`) : /^/, '').replace(/\/+$/, '');
  let m = rest.match(/^\/(recipe|brew)\/(\d+)[^/]*(\/edit)?/);
  if (m) return { dest: m[1] === 'recipe' ? 'recipes' : 'brews', id: Number(m[2]), edit: Boolean(m[3]), create: null };
  m = rest.match(/^\/new\/(recipe|brew)/);
  if (m) return { dest: m[1] === 'recipe' ? 'recipes' : 'brews', id: null, edit: false, create: m[1] };
  m = rest.match(/^\/(recipes|find|favourites|tools|admin)/);
  return { dest: m ? m[1] : 'brews', id: null, edit: false, create: null };
}
export function pathFor({ dest, item, edit, create }) {
  if (create) return `${BASE}/new/${create}`;
  if (item) return `${BASE}/${item.isRecipe ? 'recipe' : 'brew'}/${item.id}${slug(item.name) ? `-${slug(item.name)}` : ''}${edit ? '/edit' : ''}`;
  return dest && dest !== 'brews' ? `${BASE}/${dest}` : BASE || '/';
}

// ---- the service ----
export async function api(url, method = 'GET', body) {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.success === false) throw new Error(d.error || 'That didn\'t work. Try again.');
  return d;
}

// ---- dates ----
const DAY = 86400000;
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
// "today", "yesterday", "Sunday" (this week), else "12 Oct"
export function relDay(t) {
  if (!t) return '';
  const diff = Math.round((dayStart(Date.now()) - dayStart(t)) / DAY);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff > 1 && diff < 7) return new Date(t).toLocaleDateString('en-GB', { weekday: 'long' });
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
export const shortDate = (s) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: new Date(s).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) : '');
export const timeOf = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

// ---- how lively a ferment is, for the bubbles: from the last two gravity readings (points a day), else from how
// much of the sugar has gone, else from how long it has been going ----
export function readingsOf(b) {
  return (b?.logs || []).filter((l) => l.gravity).sort((x, y) => x.at - y.at);
}
export function activityOf(b) {
  if (!b || b.status !== 'fermenting') return 'still';
  const r = readingsOf(b);
  if (r.length >= 2) {
    const [a, z] = r.slice(-2);
    const days = Math.max(0.25, (z.at - a.at) / DAY);
    const rate = ((a.gravity - z.gravity) * 1000) / days;
    return rate >= 2 ? 'vigorous' : rate >= 0.4 ? 'slowing' : 'still';
  }
  const att = b.calc?.attenuation;
  if (att != null) return att < 65 ? 'vigorous' : att < 92 ? 'slowing' : 'still';
  const d = b.calc?.daysSinceStart;
  return d == null || d <= 10 ? 'vigorous' : 'slowing';
}
export const ACTIVITY_WORD = { vigorous: 'Fermenting hard', slowing: 'Slowing down', still: 'Looks finished' };

// when the brew moved into its current stage: the last "… → Clearing" note in the log, else its dates
function enteredStage(b) {
  const word = STATUS_WORD[b.status];
  const note = [...(b.logs || [])].reverse().find((l) => l.kind === 'note' && l.text && l.text.endsWith(`→ ${word}`));
  if (note) return note.at;
  if (b.status === 'bottled' && b.bottledOn) return new Date(b.bottledOn).getTime();
  if (b.startedOn) return new Date(b.startedOn).getTime();
  return b.updatedAt || null;
}

// ---- Next up: the one thing each brew on the go needs, most pressing first ----
// kind: 'move' (to the next stage), 'log' (a reading), 'taste' (a tasting), 'open'
export function nextJobs(brews) {
  const jobs = [];
  for (const b of brews) {
    if (b.status === 'planning') {
      jobs.push({ brew: b, rank: 2, kind: 'move', to: 'fermenting', action: 'Pitch the yeast', title: `Start ${b.name}`, detail: 'When it\'s mixed, pitch the yeast. Ims will set the nutrient reminders.' });
    } else if (b.status === 'fermenting') {
      const r = readingsOf(b);
      const last = r[r.length - 1];
      const act = activityOf(b);
      const sinceRead = last ? (Date.now() - last.at) / DAY : Infinity;
      if (act === 'still' && r.length >= 2) {
        jobs.push({ brew: b, rank: 1, kind: 'move', to: 'conditioning', action: 'Move to clearing', title: `${b.name} looks finished`, detail: `Gravity has held at ${Number(last.gravity).toFixed(3)}. Time to rack it and let it clear.` });
      } else if (!last) {
        jobs.push({ brew: b, rank: 1, kind: 'log', action: 'Log reading', title: `Take a first reading of ${b.name}`, detail: b.startedOn ? `It started ${relDay(new Date(b.startedOn).getTime())}. A reading gives the strength so far.` : 'A reading gives the strength so far.' });
      } else if (sinceRead >= 3) {
        jobs.push({ brew: b, rank: 1, kind: 'log', action: 'Log reading', title: `Take a gravity reading of ${b.name}`, detail: `Last one was ${Number(last.gravity).toFixed(3)}, ${relDay(last.at)}.` });
      }
    } else if (b.status === 'conditioning') {
      const since = enteredStage(b);
      const days = since ? Math.floor((Date.now() - since) / DAY) : null;
      if (days != null && days >= 21) jobs.push({ brew: b, rank: 3, kind: 'move', to: 'bottled', action: 'Bottle it', title: `Bottle ${b.name}?`, detail: `It's been clearing for ${days} days.` });
    } else if (b.status === 'bottled') {
      const since = b.bottledOn ? new Date(b.bottledOn).getTime() : enteredStage(b);
      const days = since ? Math.floor((Date.now() - since) / DAY) : null;
      if (days != null && days >= 14 && !(b.tastings || []).length) jobs.push({ brew: b, rank: 4, kind: 'taste', action: 'Add tasting', title: `Try ${b.name}`, detail: `Bottled ${days} days ago. Note how it tastes so you can see it change.` });
    }
  }
  return jobs.sort((x, y) => x.rank - y.rank);
}

// ---- filters ----
export const EMPTY_FILTERS = { cat: 'all', sweets: [], acids: [], fizzes: [], flavs: [], abv: null, fav: false, q: '' };
export const inTile = (b, id) => id === 'all' || b.category === id || (COLOUR_TILE[id] && colourOf(b) === COLOUR_TILE[id]);
const TASTE = {
  sweet: (f, b) => !f.sweets.length || f.sweets.includes(sweetOf(b)),
  acid: (f, b) => !f.acids.length || f.acids.includes(b.acidity),
  fizz: (f, b) => !f.fizzes.length || f.fizzes.includes(b.fizz),
  flav: (f, b) => f.flavs.every((x) => (b.flavours || []).includes(x)),
};
export const tagsOk = (f, b, skip) => Object.entries(TASTE).every(([k, ok]) => k === skip || ok(f, b));
export const strengthOk = (f, b) => { if (!f.abv) return true; const v = strengthOf(b); return v != null && v >= f.abv[0] && v <= f.abv[1]; };
// plain search: name, family, style, book and ingredient names
export function searchText(b) {
  return [b.name, b.family, b.variant, b.style, b.sourceName, ...withAlso(b.ingredients).map((g) => g.name)].filter(Boolean).join(' | ').toLowerCase();
}
export const matchesQuery = (q, b, text) => {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  return !words.length || words.every((w) => (text || searchText(b)).includes(w));
};
export function passes(f, b, { skip, text } = {}) {
  return inTile(b, f.cat) && (!f.fav || b.favourite) && tagsOk(f, b, skip) && strengthOk(f, b) && matchesQuery(f.q, b, text);
}
export const filterCount = (f) => (f.cat !== 'all' ? 1 : 0) + f.sweets.length + f.acids.length + f.fizzes.length + f.flavs.length + (f.abv ? 1 : 0);

// ---- sorting and grouping into cards (a drink with versions from several books is one card) ----
export const RECIPE_SORTS = [['name-asc', 'Name, A to Z'], ['name-desc', 'Name, Z to A'], ['abv-desc', 'Strongest first'], ['abv-asc', 'Weakest first'], ['type', 'Type of drink'], ['rating', 'Best rated'], ['yield-desc', 'Biggest batch']];
export const BREW_SORTS = [['started-desc', 'Started, newest'], ['started-asc', 'Started, oldest'], ['name', 'Name, A to Z'], ['status', 'Stage'], ['rating', 'Best rated']];
const nameOf = (c) => (c.members.length > 1 ? c.rep.family : c.rep.name) || '';
export function groupCards(list, isRecipes) {
  if (!isRecipes) return list.map((b) => ({ key: String(b.id), members: [b], rep: b }));
  const byKey = new Map();
  for (const b of list) { const k = famKey(b); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(b); }
  return [...byKey.entries()].map(([key, members]) => ({ key, members, rep: members.find((m) => m.favourite) || members[0] }));
}
export function sortCards(cards, sort, catLabel) {
  const by = {
    'name-asc': (a, b) => nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' }),
    'name-desc': (a, b) => nameOf(b).localeCompare(nameOf(a), undefined, { sensitivity: 'base' }),
    'abv-desc': (a, b) => (strengthOf(b.rep) ?? -1) - (strengthOf(a.rep) ?? -1) || nameOf(a).localeCompare(nameOf(b)),
    'abv-asc': (a, b) => (strengthOf(a.rep) ?? 999) - (strengthOf(b.rep) ?? 999) || nameOf(a).localeCompare(nameOf(b)),
    type: (a, b) => (catLabel(a.rep.category) || '').localeCompare(catLabel(b.rep.category) || '') || nameOf(a).localeCompare(nameOf(b)),
    rating: (a, b) => (b.rep.rating || 0) - (a.rep.rating || 0) || nameOf(a).localeCompare(nameOf(b)),
    'yield-desc': (a, b) => (Number(b.rep.batchLitres) || 0) - (Number(a.rep.batchLitres) || 0) || nameOf(a).localeCompare(nameOf(b)),
    'started-desc': (a, b) => (b.rep.startedOn || '').localeCompare(a.rep.startedOn || '') || (b.rep.createdAt || 0) - (a.rep.createdAt || 0),
    'started-asc': (a, b) => (a.rep.startedOn || '9999').localeCompare(b.rep.startedOn || '9999') || (a.rep.createdAt || 0) - (b.rep.createdAt || 0),
    name: (a, b) => nameOf(a).localeCompare(nameOf(b)),
    status: (a, b) => ({ fermenting: 1, conditioning: 2, planning: 3, bottled: 4, finished: 5 }[a.rep.status] || 9) - ({ fermenting: 1, conditioning: 2, planning: 3, bottled: 4, finished: 5 }[b.rep.status] || 9),
  }[sort];
  return by ? [...cards].sort(by) : cards;
}

// ---- the ingredient finder: what you can make with what you've got ----
// a line's alternatives ("Corn (or rice)", also: Rice) count as ingredients of the recipe too
export const withAlso = (ings) => (ings || []).flatMap((g) => [g, ...(Array.isArray(g.also) ? g.also.map((a) => ({ ...g, name: a })) : [])]);
export function findMatches(list, words) {
  return list.map((b) => ({ b, ...ingredientHits({ ...b, ingredients: withAlso(b.ingredients) }, words) })).filter((x) => x.n > 0)
    .sort((x, y) => y.n - x.n || (y.hits[0]?.type === 'fruit') - (x.hits[0]?.type === 'fruit') || x.b.name.localeCompare(y.b.name));
}
export { wantedOf };

export const ACTIVE = ['planning', 'fermenting', 'conditioning'];

// Move a brew on (or back) a stage, as the classic portal does: the move goes in the log first (a log entry on a
// planned brew starts it off by itself, so the status is set after it), and an empty start or bottling date is
// filled in with today.
export async function moveBrew(brew, status) {
  const body = { status };
  if (status === 'fermenting' && !brew.startedOn) body.startedOn = today();
  if (status === 'bottled' && !brew.bottledOn) body.bottledOn = today();
  await api(`/api/homebrew/${brew.id}/logs`, 'POST', { kind: 'note', text: `${STATUS_WORD[brew.status] || brew.status} → ${STATUS_WORD[status]}` });
  const d = await api(`/api/homebrew/${brew.id}`, 'PUT', body);
  return d.brew;
}
// the nutrient doses (24, 48 and 72 hours, and a 1/3-break check on day 6) and each method step still to come
export async function pitchReminders(brew) {
  const n = (await api(`/api/homebrew/${brew.id}/nutrient-reminders`, 'POST', {})).reminders?.length || 0;
  let steps = 0;
  try { steps = (await api(`/api/homebrew/${brew.id}/step-reminders`, 'POST', { justPitched: true })).reminders.length; } catch (_) { /* no method steps to time */ }
  return { n, steps };
}
