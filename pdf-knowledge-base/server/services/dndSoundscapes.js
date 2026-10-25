// Tabletop Audio's soundscapes for the D&D Solo DM (25 Oct 2026, Simon: "those soundscapes are bloody awful. Surely
// there are better ones in the free D&D resources site we're using"). Tim Cross publishes his catalogue
// (tabletopaudio.com/tta_data - 500+ ten-minute tabletop soundscapes, free to stream); the browser can't read it
// across sites, so it's fetched here, kept for a day, and handed to the page. Each turn the scene gets the track that
// fits it best - by the scene's own words against each track's title, tags and blurb, in the game's genre - and a
// playing track is only changed for one that fits clearly better, so the music doesn't hop about every turn.
const FEED = 'https://tabletopaudio.com/tta_data';
let cache = { at: 0, tracks: [] };

export async function catalogue() {
  if (cache.tracks.length && Date.now() - cache.at < 24 * 3600000) return cache.tracks;
  try {
    const res = await fetch(FEED, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    const tracks = (d.tracks || []).filter((t) => t.link).map((t) => ({
      key: t.key, title: t.track_title, link: t.link, image: t.small_image || t.large_image || '',
      genres: (t.track_genre || []).flatMap((g) => String(g).split(/,\s*/)).map((g) => g.trim().toLowerCase()),
      tags: (t.tags || []).map((x) => String(x).toLowerCase()), flavor: t.flavor_text || '', type: t.track_type || '',
    }));
    if (tracks.length) cache = { at: Date.now(), tracks };
  } catch (err) {
    console.warn('[Soundscapes] catalogue not reached:', err.message);
  }
  return cache.tracks;
}

const STOP = new Set('the a an and or of to in on at by for with from into you your his her their its is are was were be been it as that this these those he she they them we our not no but so then there here what which who when where while than up down out over under about through after before again more most some any each just very only own same such can will would could should shall may might must do does did have has had i me my'.split(' '));
const words = (t) => String(t || '').toLowerCase().replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter((w) => w.length > 2 && !STOP.has(w));
const GENRE_OF = (g) => (/sci|space|cyber|alien|star/i.test(g) ? 'scifi' : /horror|dread|zombie|undead|grim|dark/i.test(g) ? 'horror' : /histor/i.test(g) ? 'historical' : 'fantasy');
const ATMOS = { dungeon: ['dungeon', 'crypt', 'cave', 'tomb'], campfire: ['campfire', 'camp', 'night', 'forest'], tavern: ['tavern', 'inn', 'town'], scifi: ['ship', 'space', 'derelict', 'station'], storm: ['storm', 'rain', 'thunder', 'wind'] };

function score(t, bag, genre) {
  const hay = new Set([...t.tags.flatMap(words), ...words(t.title), ...words(t.flavor)]);
  let s = 0;
  for (const [w, n] of bag) if (hay.has(w)) s += n * (t.tags.some((x) => x.includes(w)) ? 2 : 1);
  if (t.genres.includes(genre)) s *= 1.6; else if (genre !== 'fantasy' && t.genres.includes('fantasy')) s *= 0.6;
  if (/music/.test(t.type) && !/ambience/.test(t.type)) s *= 0.8; // the narrator reads over it: ambience first
  return s;
}

// { title, situation, narrative, atmosphere, genre } and the track playing now -> the track for this scene (or null)
export async function pickSoundscape({ title, situation, narrative, atmosphere, genre }, current = null) {
  const tracks = await catalogue();
  if (!tracks.length) return current;
  const bag = new Map();
  const add = (text, weight) => { for (const w of words(text)) bag.set(w, (bag.get(w) || 0) + weight); };
  add(title, 3); add(situation, 2); add(String(narrative || '').slice(0, 900), 1); add((ATMOS[atmosphere] || []).join(' '), 2);
  const g = GENRE_OF(genre || '');
  let best = null, bestScore = 0;
  for (const t of tracks) { const s = score(t, bag, g); if (s > bestScore) { best = t; bestScore = s; } }
  if (!best) return current;
  if (current) {
    const cur = tracks.find((t) => t.key === current.key);
    if (cur && score(cur, bag, g) * 1.5 >= bestScore) return current; // keep the music unless the new one is clearly better
  }
  return { key: best.key, title: best.title, link: best.link, image: best.image };
}
