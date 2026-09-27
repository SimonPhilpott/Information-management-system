import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CardHover from './CardHover';
import VoiceNoteButton, { addBullet } from './VoiceNote';
import CampaignMap, { ScrollRollers } from './CampaignMap';
import Chronicle, { useChronicle } from './Chronicle';
import { Plus, ChevronLeft, Trash2, Flag, Skull, Gift, ScrollText, Swords, Save, X, Undo2, ImagePlus, Crop, Pencil } from 'lucide-react';

// Campaigns (/campaigns/lotr, /campaigns/lotr/<id>): LOTR LCG campaign tracking shared by
// everyone in the deck builder - players and their decks, fallen heroes, scenarios played and scores,
// boons and burdens (campaign cards come from RingsDB), threat penalty and written notes.
// Built as a general tracker; extra rules for a particular campaign can be added as they're needed.

async function api(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.success === false) throw new Error(d.error || `Request failed (${res.status})`);
  return d;
}
const SPHERE = { leadership: '#a855f7', tactics: '#ef4444', spirit: '#3b82f6', lore: '#22c55e', neutral: '#94a3b8', baggins: '#eab308', fellowship: '#f97316' };

// Which products' campaign cards a campaign type usually draws on (the card picker starts there).
const KIND_PACKS = {
  'The Lord of the Rings saga': ['The Black Riders', 'The Road Darkens', 'The Treason of Saruman', 'The Land of Shadow', 'The Flame of the West', 'The Mountain of Fire'],
  'The Hobbit saga': ['Over Hill and Under Hill', 'On the Doorstep'],
  'Revised Core Set campaign': ['Revised Core Set'],
  'The Dark of Mirkwood campaign': ['The Dark of Mirkwood'],
  'Angmar Awakened campaign': ['Angmar Awakened Campaign Expansion'],
  'Dream-chaser campaign': ['Dream-chaser Campaign Expansion'],
  'Ered Mithrin campaign': ['Ered Mithrin Campaign Expansion'],
};

// The scenarios each campaign type is played with (RingsDB pack names), in play order.
const KIND_SCENARIO_PACKS = {
  'The Lord of the Rings saga': ['The Black Riders', 'The Road Darkens', 'The Treason of Saruman', 'The Land of Shadow', 'The Flame of the West', 'The Mountain of Fire', 'The Old Forest', 'Fog on the Barrow-downs', 'The Ruins of Belegost', 'Murder at the Prancing Pony'],
  'The Hobbit saga': ['Over Hill and Under Hill', 'On the Doorstep'],
  'Revised Core Set campaign': ['Core Set'],
  'The Dark of Mirkwood campaign': ['The Dark of Mirkwood'],
  'Angmar Awakened campaign': ['The Lost Realm', 'The Wastes of Eriador', 'Escape from Mount Gram', 'Across the Ettenmoors', 'The Treachery of Rhudaur', 'The Battle of Carn Dûm', 'The Dread Realm'],
  'Dream-chaser campaign': ['The Grey Havens', 'Flight of the Stormcaller', 'The Thing in the Depths', 'Temple of the Deceived', 'The Drowned Ruins', 'A Storm on Cobas Haven', 'The City of Corsairs'],
  'Ered Mithrin campaign': ['The Wilds of Rhovanion', 'The Withered Heath', 'Roam Across Rhovanion', 'Fire in the Night', 'The Ghost of Framsburg', 'Mount Gundabad', 'The Fate of Wilderland'],
  'Haradrim campaign': ['The Sands of Harad', 'The Mûmakil', 'Race Across Harad', 'Beneath the Sands', 'The Black Serpent', 'The Dungeons of Cirith Gurat', 'The Crossings of Poros'],
  'Dwarrowdelf campaign': ['Khazad-dûm', 'The Redhorn Gate', 'Road to Rivendell', 'The Watcher in the Water', 'The Long Dark', 'Foundations of Stone', 'Shadow and Flame'],
  'Against the Shadow campaign': ['Heirs of Númenor', "The Steward's Fear", 'The Drúadan Forest', 'Encounter at Amon Dîn', 'Assault on Osgiliath', 'The Blood of Gondor', 'The Morgul Vale'],
  'The Ring-maker campaign': ['The Voice of Isengard', 'The Dunland Trap', 'The Three Trials', 'Trouble in Tharbad', 'The Nîn-in-Eilph', "Celebrimbor's Secret", 'The Antlered Crown'],
  'Vengeance of Mordor campaign': ['A Shadow in the East', 'Wrath and Ruin', 'The City of Ulfast', 'Challenge of the Wainriders', 'Under the Ash Mountains', 'The Land of Sorrow', 'The Fortress of Nurn'],
};
// The campaign's road on the map: its scenarios in play order. The Lord of the Rings saga's road runs
// through its six boxes; its print-on-demand extras show as pins only when played.
const ROUTE_PACK_COUNT = { 'The Lord of the Rings saga': 6 };
function campaignRoute(scenarios, c) {
  const packs = KIND_SCENARIO_PACKS[c.kind];
  if (!packs) return c.scenarios.map((s) => s.name).filter((n, i, a) => a.indexOf(n) === i);
  const main = packs.slice(0, ROUTE_PACK_COUNT[c.kind] || packs.length);
  return scenarios.filter((x) => main.includes(x.pack)).sort((a, b) => main.indexOf(a.pack) - main.indexOf(b.pack)).map((x) => x.name);
}

// Scenarios for a campaign, grouped by set in play order (all of them for a custom campaign, or on request).
function scenarioGroups(scenarios, kind, showAll) {
  const packs = KIND_SCENARIO_PACKS[kind];
  const list = !packs || showAll ? scenarios : scenarios.filter((x) => packs.includes(x.pack)).sort((a, b) => packs.indexOf(a.pack) - packs.indexOf(b.pack));
  const groups = [];
  for (const x of list) {
    const label = x.community ? `Community (ALeP): ${x.pack.replace(/^ALeP - /, '')}` : x.pack;
    if (!groups.length || groups[groups.length - 1][0] !== label) groups.push([label, []]);
    groups[groups.length - 1][1].push(x);
  }
  return groups;
}

// Each campaign's own banner: upload an image, then set how tall it shows and which part of it.
export function CampaignBanner({ c, ui, edit, setC, toast }) {
  const [cropping, setCropping] = useState(false);
  const [h, setH] = useState(c.banner?.height || 180);
  const [pos, setPos] = useState(c.banner?.pos ?? 50);
  useEffect(() => { setH(c.banner?.height || 180); setPos(c.banner?.pos ?? 50); }, [c.banner?.url]); // eslint-disable-line react-hooks/exhaustive-deps
  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const res = await fetch(`/api/decks/campaigns/${c.id}/banner`, { method: 'POST', headers: { 'Content-Type': file.type || 'image/jpeg' }, body: file });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Upload failed.');
      setC(d.campaign); setCropping(true); toast('Image uploaded - set the height and position.');
    } catch (err) { toast(err.message, 'error'); }
  };
  const saveCrop = async () => {
    try { const d = await api(`/api/decks/campaigns/${c.id}`, { method: 'PUT', body: { bannerHeight: h, bannerPos: pos } }); setC(d.campaign); setCropping(false); toast('Banner saved.'); } catch (err) { toast(err.message, 'error'); }
  };
  const remove = async () => {
    if (!window.confirm('Remove this campaign\'s image?')) return;
    try { const d = await api(`/api/decks/campaigns/${c.id}/banner`, { method: 'DELETE' }); setC(d.campaign); setCropping(false); } catch (err) { toast(err.message, 'error'); }
  };
  const picker = (label) => (
    <label className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ${ui.soft}`}>
      <ImagePlus size={13} /> {label}
      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={upload} />
    </label>
  );
  if (!c.banner) return edit ? <div className="flex">{picker('Add a campaign image')}</div> : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <img src={c.banner.url} alt="" className="w-full rounded-2xl object-cover" style={{ height: h, objectPosition: `50% ${pos}%` }} />
        {edit && !cropping && (
          <div className="absolute top-2 right-2 flex gap-1.5">
            <button onClick={() => setCropping(true)} className="px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-black/60 text-white"><Crop size={13} /> Crop</button>
          </div>
        )}
      </div>
      {edit && cropping && (
        <div className={`rounded-xl border p-3 flex flex-col gap-2 ${ui.row}`}>
          <label className="flex items-center gap-3 text-xs"><span className="w-20 font-bold">Height</span>
            <input type="range" min="60" max="600" value={h} onChange={(e) => setH(Number(e.target.value))} className="flex-1" /><span className="w-12 text-right">{h}px</span></label>
          <label className="flex items-center gap-3 text-xs"><span className="w-20 font-bold">Show</span>
            <input type="range" min="0" max="100" value={pos} onChange={(e) => setPos(Number(e.target.value))} className="flex-1" /><span className="w-12 text-right">{pos === 0 ? 'top' : pos === 100 ? 'bottom' : `${pos}%`}</span></label>
          <div className="flex flex-wrap gap-2">
            <button onClick={saveCrop} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${ui.primary}`}>Save</button>
            <button onClick={() => { setH(c.banner.height); setPos(c.banner.pos); setCropping(false); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${ui.soft}`}>Cancel</button>
            {picker('Change image')}
            <button onClick={remove} className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-500">Remove image</button>
          </div>
        </div>
      )}
    </div>
  );
}

// The official LOTR LCG rulebooks in the PDF library: import (owner) and progress for everyone.
// What each game's rulebook panel and rule checker say about the books.
const RULEBOOK_TEXT = {
  lotr: { folder: 'LOTR LCG', books: 'Learn to Play, the Rules Reference, the FAQ, and every saga, campaign and scenario rulesheet', example: 'e.g. Can I play an event during the combat phase? What does Surge do?' },
  ahlcg: { folder: 'Arkham Horror LCG', books: 'Learn to Play, the Rules Reference, the new Rulebook and Campaign Guide, and every campaign guide, investigator rules and scenario rules', example: 'e.g. When does an investigator take trauma? How does Surge work? Can I parley with an Elite enemy?' },
};

export function Rulebooks({ ui, toast, game = 'lotr' }) {
  const [st, setSt] = useState(null);
  const [me, setMe] = useState(null);
  const timer = React.useRef(null);
  const load = useCallback(async () => {
    try {
      const d = await api(`/api/decks/campaigns/rulebooks/status?game=${game}`);
      setSt(d);
      clearTimeout(timer.current);
      if (d.job.state === 'running' || d.library.active) timer.current = setTimeout(load, 2500);
    } catch (_) { /* ignore */ }
  }, []);
  useEffect(() => { load(); api('/api/decks/me').then(setMe).catch(() => {}); return () => clearTimeout(timer.current); }, [load]);
  if (!st) return null;
  const running = st.job.state === 'running';
  const start = async () => { try { await api(`/api/decks/campaigns/rulebooks/import?game=${game}`, { method: 'POST' }); toast('Fetching the rulebooks...'); load(); } catch (err) { toast(err.message, 'error'); } };
  const Bar = ({ label, done, total }) => (
    <div>
      <div className="flex justify-between text-[11px] mb-1"><span className="font-semibold truncate">{label}</span><span className={ui.muted}>{done} / {total}</span></div>
      <div className="h-2 rounded-full bg-slate-500/15 overflow-hidden"><div className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
    </div>
  );
  const idx = st.library.index;
  return (
    <div className={ui.panel}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xs font-black uppercase tracking-wider flex-1 flex items-center gap-2"><ScrollText size={14} className="opacity-60" /> Rulebooks</h2>
        <span className={`text-xs ${ui.muted}`}>{st.indexed} of {st.expected} indexed</span>
        {me?.isOwner && !running && !st.library.active && (
          <button onClick={start} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${ui.primary}`}>{st.inLibrary ? 'Check for missing rulebooks' : 'Download and index the rulebooks'}</button>
        )}
      </div>
      <p className={`text-xs mt-1 ${ui.muted}`}>The official Fantasy Flight Games rules - {RULEBOOK_TEXT[game].books} - kept in your library under Rulebooks / {RULEBOOK_TEXT[game].folder}. Rule checks on each campaign search the core rules plus that campaign's own.</p>
      {(running || st.library.active) && (
        <div className="flex flex-col gap-2 mt-3">
          {running && <Bar label={`${st.job.phase}${st.job.current ? ` - ${st.job.current}` : ''}`} done={st.job.done} total={st.job.total} />}
          {st.library.sync.active && <Bar label={`Library sync: ${st.library.sync.phase || 'checking Drive'}`} done={st.library.sync.current || 0} total={st.library.sync.total || 0} />}
          {idx.active && <Bar label={idx.phase || 'Indexing'} done={idx.current} total={idx.total} />}
        </div>
      )}
      {st.job.errors?.length > 0 && <details className="mt-2 text-xs text-amber-500"><summary>{st.job.errors.length} problem{st.job.errors.length === 1 ? '' : 's'}</summary>{st.job.errors.map((e) => <div key={e}>{e}</div>)}</details>}
      {st.failed.length > 0 && <details className="mt-2 text-xs text-red-500"><summary>{st.failed.length} failed to index</summary>{st.failed.map((f) => <div key={f.filename}>{f.filename}: {f.error}</div>)}</details>}
    </div>
  );
}

// One ruling: the answer, then each rule it rests on - book and page (opens the page itself) and the
// rule's own words.
export function RuleAnswer({ r, ui }) {
  return (
    <div className={`rounded-xl border p-3 ${ui.row}`}>
      <div className="text-sm font-semibold">{r.question}</div>
      <div className={`text-[11px] ${ui.muted}`}>{r.byName}{r.scenarioName ? ` · ${r.scenarioName}` : ''} · {new Date(r.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}{r.confident === false ? ' · the rulebooks may not fully cover this' : ''}</div>
      <p className="text-sm mt-2 whitespace-pre-line">{r.answer}</p>
      {(r.sources || []).length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {r.sources.map((x, i) => (
            <div key={i} className={`text-xs border-l-2 border-emerald-500/50 pl-2 ${ui.muted}`}>
              {x.quote && <div className="italic">"{x.quote}"</div>}
              <div className="font-semibold">
                {x.driveFileId && x.page
                  ? <a href={`/api/decks/campaigns/rulebooks/pdf/${x.driveFileId}#page=${x.page}`} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-emerald-500">{x.book}, page {x.page}</a>
                  : <>{x.book}{x.page ? `, page ${x.page}` : ''}</>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Rule check from the Campaigns page: any rules question, answered from every rulebook. Shared by everyone.
export function GeneralRuleCheck({ ui, toast, game = 'lotr' }) {
  const [checks, setChecks] = useState([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  useEffect(() => { api(`/api/decks/campaigns/rules?game=${game}`).then((d) => setChecks(d.checks)).catch(() => {}); }, [game]);
  const ask = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try { const d = await api(`/api/decks/campaigns/rules?game=${game}`, { method: 'POST', body: { question: q } }); setChecks(d.checks); setQ(''); }
    catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className={ui.panel}>
      <h2 className="text-xs font-black uppercase tracking-wider mb-3 flex items-center gap-2"><ScrollText size={14} className="opacity-60" /> Rule check - every rulebook</h2>
      <div className="flex flex-col sm:flex-row gap-2">
        <input className={`${ui.field} !py-1.5 text-sm`} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()}
          placeholder={RULEBOOK_TEXT[game].example} />
        <button onClick={ask} disabled={busy || !q.trim()} className={`px-4 py-2 rounded-xl text-sm font-bold shrink-0 disabled:opacity-40 ${ui.primary}`}>{busy ? 'Checking...' : 'Check the rules'}</button>
      </div>
      <p className={`text-[11px] mt-1 ${ui.muted}`}>Searches every {RULEBOOK_TEXT[game].folder} rulebook in the library and answers only from them, quoting each rule with its book and page (click one to open the rulebook at that page). For a question about the scenario you're playing, use the rule check on that campaign.</p>
      <div className="flex flex-col gap-3 mt-3">
        {(more ? checks : checks.slice(0, 3)).map((r) => <RuleAnswer key={r.id} r={r} ui={ui} />)}
        {checks.length > 3 && <button onClick={() => setMore(!more)} className={`self-start text-xs font-bold ${ui.muted}`}>{more ? 'Show fewer' : `Show all ${checks.length} earlier questions`}</button>}
      </div>
    </div>
  );
}

// Rule check for this campaign: core rules + the campaign's rules + the rulesheet of the scenario being
// played (the next one on the campaign's road, unless another is chosen).
export function RuleCheck({ ui, c, scenarios, setC, toast, section }) {
  const route = scenarios.filter((x) => (c.game === 'ahlcg' ? x.pack === c.kind : (KIND_SCENARIO_PACKS[c.kind] || []).includes(x.pack)));
  const won = new Set(c.scenarios.filter((s) => s.result === 'won').map((s) => s.name));
  const current = route.find((x) => !won.has(x.name))?.name || c.scenarios[c.scenarios.length - 1]?.name || '';
  const [q, setQ] = useState('');
  const [scen, setScen] = useState(current);
  useEffect(() => { if (!scen && current) setScen(current); }, [current]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    if (!q.trim()) return;
    const s = scenarios.find((x) => x.name === scen);
    setBusy(true);
    try { const d = await api(`/api/decks/campaigns/${c.id}/rules`, { method: 'POST', body: { question: q, scenarioName: s?.name || null, scenarioPack: s?.pack || null } }); setC(d.campaign); setQ(''); }
    catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className={ui.panel}>
      <h2 className={section}><ScrollText size={14} className="opacity-60" /> Rule check</h2>
      <div className="flex flex-col sm:flex-row gap-2">
        <select className={`${ui.field} sm:!w-64 !py-1.5 text-sm`} value={scen} onChange={(e) => setScen(e.target.value)} title="The scenario being played">
          <option value="">Any scenario</option>
          {(route.length ? route : scenarios).map((x) => <option key={x.id} value={x.name}>{x.name}{x.name === current ? ' (playing now)' : won.has(x.name) ? ' ✓' : ''}</option>)}
        </select>
        <input className={`${ui.field} !py-1.5 text-sm`} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()}
          placeholder="e.g. Does a hero with a boon attached keep it if the hero falls?" />
        <button onClick={ask} disabled={busy || !q.trim()} className={`px-4 py-2 rounded-xl text-sm font-bold shrink-0 disabled:opacity-40 ${ui.primary}`}>{busy ? 'Checking...' : 'Check the rules'}</button>
      </div>
      <p className={`text-[11px] mt-1 ${ui.muted}`}>Searches the core rules (Learn to Play, Rules Reference, FAQ) plus {c.kind || 'this campaign'}'s rules{scen ? ` and ${scen}'s rulesheet` : ''}, and answers only from them, with the book and page.</p>
      <div className="flex flex-col gap-3 mt-3">
        {(c.ruleChecks || []).map((r) => <RuleAnswer key={r.id} r={r} ui={ui} />)}
      </div>
    </div>
  );
}

// Everything played across every campaign: one map of the whole journey (in the order it was played)
// and the overall progress through the game's scenarios, by set and by player.
// Works for either game: Arkham's scenarios are grouped by campaign, and its map is Arkham.
export function OverallJourney({ ui, toast, list, game = 'lotr' }) {
  const arkham = game === 'ahlcg';
  const [scenarios, setScenarios] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [showMine, setShowMine] = useState(true);
  useEffect(() => { api(`/api/decks/campaigns/scenarios?game=${game}`).then((d) => setScenarios(d.scenarios)).catch(() => {}); }, [game]);
  const plays = useMemo(() => list.flatMap((c) => c.scenarios.map((s) => ({ ...s, campaign: c.name })))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id))), [list]);
  if (!plays.length || !scenarios.length) return null;
  const journey = plays.map((p) => p.name).filter((n, i, a) => a.indexOf(n) === i);
  const beaten = new Set(plays.filter((p) => p.result === 'won').map((p) => p.name));
  const official = scenarios.filter((x) => !x.community);
  const packOf = Object.fromEntries(scenarios.map((x) => [x.name, x.pack]));
  const everyone = {};
  for (const c of list) for (const s of c.scenarios) for (const d of s.decks || []) {
    const e = (everyone[d.email] ||= { name: d.name, plays: 0, wins: 0 });
    e.plays++; if (s.result === 'won') e.wins++;
  }
  const sets = [];
  for (const x of official) {
    let g = sets.find((y) => y.pack === x.pack);
    if (!g) sets.push(g = { pack: x.pack, total: 0, won: 0 });
    g.total++; if (beaten.has(x.name)) g.won++;
  }
  const started = sets.filter((g) => g.won > 0 || plays.some((p) => packOf[p.name] === g.pack));
  const complete = list.filter((c) => {
    if (arkham) { const need = scenarios.filter((x) => x.pack === c.kind); return need.length && need.every((x) => c.scenarios.some((s) => s.name === x.name && s.result === 'won')); }
    const packs = KIND_SCENARIO_PACKS[c.kind]; if (!packs) return false; const need = scenarios.filter((x) => packs.slice(0, ROUTE_PACK_COUNT[c.kind] || packs.length).includes(x.pack)); return need.length && need.every((x) => c.scenarios.some((s) => s.name === x.name && s.result === 'won')); }).length;
  const merged = { scenarios: plays, cards: list.flatMap((c) => c.cards.map((x) => ({ ...x }))), players: list.flatMap((c) => c.players).filter((p, i, a) => a.findIndex((q) => q.email === p.email) === i) };
  const officialBeaten = official.filter((x) => beaten.has(x.name)).length;
  return (
    <>
      <div className={ui.panel}>
        <h2 className="text-xs font-black uppercase tracking-wider mb-3">Across all your campaigns</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[[arkham ? 'Scenarios completed' : 'Scenarios beaten', `${officialBeaten} / ${official.length}`], ['Games played', plays.length], ['Win rate', `${Math.round((plays.filter((p) => p.result === 'won').length / plays.length) * 100)}%`], ['Campaigns', list.length], ['Campaigns finished', complete]].map(([k, v]) => (
            <div key={k} className={`rounded-xl p-3 ${ui.soft}`}><div className="text-lg font-black">{v}</div><div className={`text-[11px] ${ui.muted}`}>{k}</div></div>
          ))}
        </div>
        <div className="h-2.5 rounded-full bg-slate-500/15 overflow-hidden mt-3"><div className="h-full" style={{ width: `${(officialBeaten / official.length) * 100}%`, background: 'linear-gradient(90deg, #d4a017, #f5c542)' }} /></div>
        {Object.keys(everyone).length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {Object.values(everyone).map((e) => <span key={e.name} className={`px-3 py-1.5 rounded-lg text-xs ${ui.soft}`}><b>{e.name}</b> · {e.plays} played · {e.wins} won</span>)}
          </div>
        )}
        {started.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-1.5 mt-4">
            {started.map((g) => (
              <div key={g.pack} className="text-xs">
                <div className="flex justify-between"><span className="truncate font-semibold">{g.pack}</span><span className={ui.muted}>{g.won}/{g.total}</span></div>
                <div className="h-1.5 rounded-full bg-slate-500/15 overflow-hidden"><div className="h-full" style={{ width: `${(g.won / g.total) * 100}%`, background: g.won === g.total ? '#f5c542' : '#3f9b3a' }} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-x-5 gap-y-1 -mb-3">
        <label className={`text-xs flex items-center gap-2 ${ui.muted}`}><input type="checkbox" checked={showMine} onChange={(e) => setShowMine(e.target.checked)} /> Show the campaign scenarios</label>
        <label className={`text-xs flex items-center gap-2 ${ui.muted}`}><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> {arkham ? 'Show every scenario (on every map)' : 'Show every scenario in Middle-earth'}</label>
      </div>
      <CampaignMap c={merged} ui={ui} game={game} allMaps={arkham} route={showMine ? journey : []} showPlayed={showMine} packOf={packOf} byCode={{}} edit={false} toast={toast}
        extras={showAll ? official.map((x) => x.name) : []} title={arkham ? 'Your investigations' : 'Your journey through Middle-earth'}
        summary={arkham ? `${beaten.size} cases closed · ${journey.length} investigated` : `${beaten.size} places conquered · ${journey.length} visited`} />
    </>
  );
}

// The Arkham Horror LCG tab, while its campaigns are being built: the rulebooks and the rule checker.
export function ArkhamHome({ ui, toast }) {
  return (
    <>
      <div className={ui.panel}>
        <h2 className="text-xs font-black uppercase tracking-wider mb-1">Arkham Horror: The Card Game</h2>
        <p className={`text-sm ${ui.muted}`}>Campaign tracking for Arkham - investigators, trauma, experience, the chaos bag, the campaign log and a chronicle read by the narrator - is on its way. The rulebooks and rule checks are ready now.</p>
      </div>
      <Rulebooks ui={ui} toast={toast} game="ahlcg" />
      <GeneralRuleCheck ui={ui} toast={toast} game="ahlcg" />
    </>
  );
}

export function CampaignList({ ui, toast, go }) {
  const [list, setList] = useState([]);
  const [opts, setOpts] = useState(null);
  const [decks, setDecks] = useState([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', kind: 'The Lord of the Rings saga', players: {} });
  const load = useCallback(() => api('/api/decks/campaigns').then((d) => setList(d.campaigns)).catch((err) => toast(err.message, 'error')), [toast]);
  useEffect(() => {
    load();
    api('/api/decks/campaigns/options').then((o) => { setOpts(o); setDraft((d) => ({ ...d, players: { [o.me]: { on: true, deckId: '' } } })); }).catch(() => {});
    api('/api/decks/lotr/decks').then((d) => setDecks(d.decks)).catch(() => {});
  }, [load]);
  const create = async () => {
    const players = Object.entries(draft.players).filter(([, v]) => v.on).map(([email, v]) => ({ email, deckId: v.deckId || null }));
    try { const d = await api('/api/decks/campaigns', { method: 'POST', body: { name: draft.name, kind: draft.kind, players } }); go(`/campaigns/lotr/${d.campaign.id}`); } catch (err) { toast(err.message, 'error'); }
  };
  return (
    <>
      <div className={ui.panel}>
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-black uppercase tracking-wider flex-1 flex items-center gap-2"><Flag size={14} className="opacity-60" /> Campaigns ({list.length})</h2>
          {!adding && <button onClick={() => setAdding(true)} className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${ui.primary}`}><Plus size={15} /> New campaign</button>}
        </div>
        {adding && opts && (
          <div className={`mt-4 rounded-xl border p-4 flex flex-col gap-3 ${ui.row}`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input className={ui.field} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Campaign name, e.g. Fellowship run 2026" autoFocus />
              <select className={ui.field} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                {opts.kinds.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-wider mb-2">Players and their decks</div>
              {opts.people.map((p) => {
                const v = draft.players[p.email] || { on: false, deckId: '' };
                const theirs = decks.filter((d) => d.owner === p.email);
                return (
                  <div key={p.email} className="flex flex-wrap items-center gap-2 py-1">
                    <label className="flex items-center gap-2 text-sm w-48"><input type="checkbox" checked={v.on} onChange={(e) => setDraft({ ...draft, players: { ...draft.players, [p.email]: { ...v, on: e.target.checked } } })} /> {p.name}</label>
                    {v.on && (
                      <select className={`${ui.field} !w-auto !py-1.5 text-xs`} value={v.deckId} onChange={(e) => setDraft({ ...draft, players: { ...draft.players, [p.email]: { ...v, deckId: e.target.value } } })}>
                        <option value="">Deck - choose later</option>
                        {theirs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button onClick={create} disabled={!draft.name.trim()} className={`px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-40 ${ui.primary}`}>Start campaign</button>
              <button onClick={() => setAdding(false)} className={`px-4 py-2 rounded-xl text-sm font-bold ${ui.soft}`}>Cancel</button>
            </div>
          </div>
        )}
        {!list.length && !adding && <p className={`text-sm text-center py-8 ${ui.muted}`}>No campaigns yet - start one to track scenarios, boons, burdens, fallen heroes and notes.</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          {list.map((c) => (
            <button key={c.id} onClick={() => go(`/campaigns/lotr/${c.id}`)} className={`text-left rounded-xl border overflow-hidden hover:brightness-95 ${ui.row}`}>
              {c.banner && <img src={c.banner.url} alt="" className="w-full h-24 object-cover" style={{ objectPosition: `50% ${c.banner.pos}%` }} />}
              <div className="p-4">
              <div className="font-bold text-[15px]">{c.name}</div>
              <div className={`text-xs ${ui.muted}`}>{c.kind || 'Campaign'} · {c.players.map((p) => p.name).join(' & ')}</div>
              <div className={`text-xs mt-2 ${ui.muted}`}>
                {c.played} scenario{c.played === 1 ? '' : 's'} played ({c.won} won) · score {c.totalScore}
                · {c.cards.filter((x) => x.kind === 'boon' && !x.removed).length} boons · {c.cards.filter((x) => x.kind === 'burden' && !x.removed).length} burdens
              </div>
              </div>
            </button>
          ))}
        </div>
      </div>
      <OverallJourney ui={ui} toast={toast} list={list} />
      <Rulebooks ui={ui} toast={toast} />
      <GeneralRuleCheck ui={ui} toast={toast} />
    </>
  );
}

// The tale of a completed campaign: written once when the last scenario is beaten (and on request).
function CampaignTale({ c, ui, edit, complete, setC, toast }) {
  const [writing, setWriting] = useState(false);
  const ep = c.epilogue;
  const watch = useCallback(async () => {
    setWriting(true);
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      try {
        const d = await api(`/api/decks/campaigns/${c.id}/epilogue`);
        if (!d.writing) { setC((x) => ({ ...x, epilogue: d.epilogue })); break; }
      } catch (_) { break; }
    }
    setWriting(false);
  }, [c.id, setC]);
  const write = useCallback(async () => {
    try { await api(`/api/decks/campaigns/${c.id}/epilogue`, { method: 'POST' }); watch(); } catch (err) { toast(err.message, 'error'); }
  }, [c.id, watch, toast]);
  // First time the campaign is complete: write it straight away.
  useEffect(() => { if (complete && edit && !ep) write(); }, [complete]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!complete && !ep?.story) return null;
  return (
    <div className="flex flex-col gap-2">
      <ScrollRollers>
        {ep?.story ? <>
          <div style={{ fontFamily: '"DM Serif Display", Georgia, serif', fontSize: 22, textAlign: 'center', letterSpacing: '.02em' }}>{ep.title || `The Tale of ${c.name}`}</div>
          <div style={{ textAlign: 'center', opacity: .6, margin: '2px 0 12px', letterSpacing: '.3em' }}>~ ❦ ~</div>
          {ep.story.split(/\n+/).filter(Boolean).map((para, i) => (
            <p key={i} style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 15, lineHeight: 1.65, marginBottom: 10, textIndent: i ? '1.4em' : 0 }}>{para}</p>
          ))}
        </> : (
          <p style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', textAlign: 'center' }}>{ep?.error ? `The chronicler's quill failed: ${ep.error}` : 'The chronicler is writing the tale of your campaign...'}</p>
        )}
      </ScrollRollers>
      {edit && complete && (
        <div className="flex justify-end">
          <button onClick={write} disabled={writing} className={`px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50 ${ui.soft}`}>{writing ? 'Writing...' : ep?.story ? 'Write a new version of the tale' : 'Write the tale'}</button>
        </div>
      )}
    </div>
  );
}

export function CampaignDetail({ id, ui, toast, go }) {
  const [c, setC] = useState(null);
  const [decks, setDecks] = useState([]);
  const [cards, setCards] = useState(null);       // full card list, for hero names
  const [campCards, setCampCards] = useState([]); // campaign cards (boons/burdens)
  const [scenarios, setScenarios] = useState([]);
  const [opts, setOpts] = useState(null);
  const load = useCallback(() => api(`/api/decks/campaigns/${id}`).then((d) => setC(d.campaign)).catch((err) => toast(err.message, 'error')), [id, toast]);
  useEffect(() => {
    load();
    api('/api/decks/lotr/decks').then((d) => setDecks(d.decks)).catch(() => {});
    api('/api/decks/lotr/cards').then(setCards).catch(() => {});
    api('/api/decks/campaigns/cards').then((d) => setCampCards(d.cards)).catch(() => {});
    api('/api/decks/campaigns/scenarios').then((d) => setScenarios(d.scenarios)).catch(() => {});
    api('/api/decks/campaigns/options').then(setOpts).catch(() => {});
  }, [load]);
  const byCode = useMemo(() => Object.fromEntries((cards?.cards || []).map((x) => [x.code, x])), [cards]);
  const chron = useChronicle(c, Boolean(c?.canEdit));
  if (!c) return <div className={`text-center py-16 ${ui.muted}`}>Loading campaign...</div>;
  const call = async (url, method, body) => { try { const d = await api(`/api/decks/campaigns/${id}${url}`, { method, body }); if (d.campaign) setC(d.campaign); return d; } catch (err) { toast(err.message, 'error'); return null; } };
  const edit = c.canEdit;
  const setPlayers = (players) => call('', 'PUT', { players: players.map(({ email, deckId, fallen, fallenIn }) => ({ email, deckId, fallen, fallenIn })) });
  const section = 'text-xs font-black uppercase tracking-wider mb-3 flex items-center gap-2';
  const nameOf = (email) => c.players.find((p) => p.email === email)?.name || email;

  return (
    <>
      <CampaignBanner c={c} ui={ui} edit={edit} setC={setC} toast={toast} />
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => go('/campaigns/lotr')} className={`px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1 ${ui.soft}`}><ChevronLeft size={15} /> Campaigns</button>
        <input className={`${ui.field} !w-auto flex-1 min-w-[12rem] font-bold text-base`} defaultValue={c.name} readOnly={!edit} onBlur={(e) => edit && e.target.value !== c.name && call('', 'PUT', { name: e.target.value })} />
        <select className={`${ui.field} !w-auto`} value={c.kind || ''} disabled={!edit} onChange={(e) => call('', 'PUT', { kind: e.target.value })}>
          {(opts?.kinds || [c.kind]).map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      {!edit && <p className={`text-xs ${ui.muted}`}>You're viewing {c.createdByName}'s campaign - only its players can change it.</p>}

      {/* summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[['Scenarios played', c.scenarios.length], ['Won', c.scenarios.filter((s) => s.result === 'won').length], ['Campaign score', c.totalScore],
          ['Boons / burdens', `${c.cards.filter((x) => x.kind === 'boon' && !x.removed).length} / ${c.cards.filter((x) => x.kind === 'burden' && !x.removed).length}`]].map(([k, v]) => (
          <div key={k} className={`rounded-xl p-3 ${ui.soft}`}><div className="text-lg font-black">{v}</div><div className={`text-[11px] ${ui.muted}`}>{k}</div></div>
        ))}
        <label className={`rounded-xl p-3 ${ui.soft}`}>
          <input type="number" min="0" className="w-full bg-transparent text-lg font-black outline-none" value={c.threatPenalty} disabled={!edit} onChange={(e) => call('', 'PUT', { threatPenalty: e.target.value })} />
          <div className={`text-[11px] ${ui.muted}`}>Threat penalty</div>
        </label>
      </div>

      {scenarios.length > 0 && (() => {
        const route = campaignRoute(scenarios, c);
        const complete = Boolean(KIND_SCENARIO_PACKS[c.kind]) && route.length > 0 && route.every((n) => c.scenarios.some((s) => s.name === n && s.result === 'won'));
        return <CampaignTale c={c} ui={ui} edit={edit} complete={complete} setC={setC} toast={toast} />;
      })()}
      {c.scenarios.length > 0 && <Chronicle c={c} chron={chron} byCode={byCode} setC={setC} toast={toast} />}
      {scenarios.length > 0 && <CampaignMap c={c} ui={ui} route={campaignRoute(scenarios, c)} packOf={Object.fromEntries(scenarios.map((x) => [x.name, x.pack]))} byCode={byCode} edit={edit} toast={toast} chronicle={chron?.chapters} />}
      <Players ui={ui} c={c} edit={edit} decks={decks} byCode={byCode} setPlayers={setPlayers} section={section} go={go} />
      <ScenarioLog ui={ui} c={c} edit={edit} scenarios={scenarios} call={call} section={section} campCards={campCards} byCode={byCode} />
      <RuleCheck ui={ui} c={c} scenarios={scenarios} setC={setC} toast={toast} section={section} />
      <CampaignCards ui={ui} c={c} edit={edit} campCards={campCards} scenarios={scenarios} byCode={byCode} call={call} section={section} nameOf={nameOf} />
      <Notes ui={ui} c={c} edit={edit} call={call} section={section} me={opts?.me} />

      {edit && (() => {
        // Deleting needs every player to click Delete; the page shows who has so far.
        const voted = c.deleteVotes || [];
        const mine = voted.some((v) => v.email === opts?.me);
        const vote = async (yes) => {
          if (yes && !window.confirm(voted.length + 1 >= c.players.length ? `You're the last player to agree - "${c.name}" will be deleted for good.` : `Vote to delete "${c.name}"? It's deleted once every player has voted.`)) return;
          try {
            const d = await api(`/api/decks/campaigns/${c.id}/delete-vote`, { method: yes ? 'POST' : 'DELETE' });
            if (d.deleted) { toast('Campaign deleted.'); go('/campaigns/lotr'); } else setC(d.campaign);
          } catch (err) { toast(err.message, 'error'); }
        };
        return (
          <div className="flex flex-wrap items-center justify-end gap-3">
            {voted.length > 0 && <span className="text-xs text-red-500">Delete votes {voted.length} of {c.players.length}: {voted.map((v) => v.name).join(', ')}</span>}
            {mine
              ? <button onClick={() => vote(false)} className={`px-4 py-2 rounded-xl text-sm font-bold ${ui.soft}`}>Take back my delete vote</button>
              : <button onClick={() => vote(true)} className="px-4 py-2 rounded-xl text-sm font-bold text-red-500 flex items-center gap-2"><Trash2 size={15} /> Delete campaign</button>}
          </div>
        );
      })()}
    </>
  );
}

function Players({ ui, c, edit, decks, byCode, setPlayers, section, go }) {
  const update = (email, patch) => setPlayers(c.players.map((p) => (p.email === email ? { ...p, ...patch } : p)));
  // A hero marked as fallen fell in the scenario played most recently - that chapter tells of it, and they
  // get an epitaph on the Roll of the Fallen.
  const latest = [...c.scenarios].sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`)).pop()?.name || null;
  const toggleFallen = (p, code) => {
    const down = !p.fallen?.includes(code);
    const fallenIn = { ...(p.fallenIn || {}) };
    if (down) fallenIn[code] = latest; else delete fallenIn[code];
    update(p.email, { fallen: down ? [...(p.fallen || []), code] : p.fallen.filter((x) => x !== code), fallenIn });
  };
  return (
    <div className={ui.panel}>
      <h2 className={section}><Swords size={14} className="opacity-60" /> Players</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {c.players.map((p) => {
          const theirs = decks.filter((d) => d.owner === p.email);
          const boons = c.cards.filter((x) => x.to === p.email && !x.removed);
          return (
            <div key={p.email} className={`rounded-xl border p-3 ${ui.row}`}>
              <div className="flex items-center gap-2">
                <b className="text-sm sm:flex-1 shrink-0">{p.name}</b>
                <select className={`${ui.field} !w-auto flex-1 sm:flex-none min-w-0 sm:max-w-[16rem] !py-1 text-xs`} value={p.deckId || ''} disabled={!edit} onChange={(e) => update(p.email, { deckId: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">No deck chosen</option>
                  {theirs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                {p.deckId && <button onClick={() => go(`/campaigns/lotr/decks/${p.deckId}`)} className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 ${ui.soft}`} title="Open this deck">View deck</button>}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(p.deckHeroes || []).map((code) => {
                  const h = byCode[code]; const fallen = p.fallen?.includes(code);
                  return (
                    <button key={code} disabled={!edit} onClick={() => toggleFallen(p, code)} aria-label={fallen ? `${h?.name || code} has fallen - tap to bring back` : `${h?.name || code} - tap if this hero falls`}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 ${fallen ? 'bg-red-500/15 text-red-500 line-through' : 'text-white'}`} style={fallen ? {} : { background: SPHERE[h?.sphere] || '#64748b' }}>
                      {fallen && <Skull size={11} />}<CardHover card={h}>{h?.name || code}</CardHover>
                    </button>
                  );
                })}
                {!p.deckHeroes?.length && <span className={`text-xs ${ui.muted}`}>Choose a deck to see its heroes.</span>}
              </div>
              {edit && p.deckHeroes?.length > 0 && <div className={`text-[10px] mt-1 ${ui.muted}`}>Tap a hero if they fall; tap again to bring them back.</div>}
              {(p.fallen || []).filter((f) => !(p.deckHeroes || []).includes(f)).length > 0 && (
                <div className="text-[11px] mt-1 text-red-500">Also fallen: {p.fallen.filter((f) => !(p.deckHeroes || []).includes(f)).map((f) => byCode[f]?.name || f).join(', ')}</div>
              )}
              {boons.length > 0 && <div className={`text-[11px] mt-2 ${ui.muted}`}>Campaign cards in this deck: {boons.map((b) => `${b.name}${b.hero ? ` (on ${byCode[b.hero]?.name || b.hero})` : ''}`).join(', ')}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// A play's date and time: now, in this device's own time, as the default when logging one.
const nowParts = () => { const n = new Date(), p = (x) => String(x).padStart(2, '0'); return { date: `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`, time: `${p(n.getHours())}:${p(n.getMinutes())}` }; };
export const playWhen = (s) => `${new Date(`${s.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}${s.time ? `, ${s.time}` : ''}`;
export const WhenInput = ({ ui, value, onChange, className = '' }) => (
  <input type="datetime-local" className={`${ui.field} !py-1.5 text-sm ${className}`} value={`${value.date}T${value.time || '00:00'}`}
    onChange={(e) => { const [date, time] = e.target.value.split('T'); if (date) onChange({ date, time: time || null }); }} />
);

// After a win: the campaign cards that scenario's product holds, to tick the ones earned and say whose
// deck (or the encounter deck) each goes into - with what the scenario's rulesheet says it awards.
function RewardsPanel({ ui, c, campCards, scen, call, onClose }) {
  const cards = campCards.filter((x) => x.pack === scen.pack);
  const already = new Set(c.cards.filter((x) => x.fromScenario === scen.name).map((x) => x.code));
  const [pick, setPick] = useState({}); // code -> { kind, to }
  const [rules, setRules] = useState({ loading: true });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`/api/decks/campaigns/${c.id}/rewards`, { method: 'POST', body: { scenarioName: scen.name, scenarioPack: scen.pack } })
      .then((d) => setRules(d)).catch((err) => setRules({ error: err.message }));
  }, [scen.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (x) => setPick((p) => {
    if (p[x.code]) { const { [x.code]: _, ...rest } = p; return rest; }
    const kind = x.kind === 'campaign' ? 'boon' : x.kind;
    return { ...p, [x.code]: { kind, to: kind === 'burden' ? 'encounter' : (c.players[0]?.email || 'encounter') } };
  });
  const set = (code, patch) => setPick((p) => ({ ...p, [code]: { ...p[code], ...patch } }));
  const add = async () => {
    setBusy(true);
    for (const [code, v] of Object.entries(pick)) {
      const card = cards.find((x) => x.code === code);
      await call('/cards', 'POST', { code, name: card.name, kind: v.kind, to: v.to, fromScenario: scen.name });
    }
    setBusy(false);
    onClose();
  };
  const n = Object.keys(pick).length;
  return (
    <div className={`mt-3 rounded-xl border p-3 flex flex-col gap-2 ${ui.row}`}>
      <div className="flex items-center gap-2"><Gift size={15} className="text-emerald-500" /><b className="text-sm flex-1">Campaign cards from {scen.name}</b><button onClick={onClose} className={`p-1 rounded ${ui.soft}`}><X size={13} /></button></div>
      <div className={`text-xs rounded-lg p-2 ${ui.soft}`}>
        {rules.loading ? <span className="italic">Checking what the rulesheet says this scenario awards...</span>
          : rules.error ? <span className="italic">The rulesheet for this scenario isn't in the indexed rulebooks yet - tick what the scenario's resolution told you to add.</span>
          : <><b>The rules say: </b>{rules.answer}{rules.sources?.length ? <span className={ui.muted}> ({rules.sources.map((x) => `${x.book}${x.page ? ` p.${x.page}` : ''}`).join('; ')})</span> : null}</>}
      </div>
      {!cards.length ? <p className={`text-xs ${ui.muted}`}>{scen.pack ? `${scen.pack} has no campaign cards of its own` : 'No product found for this scenario'} - add any from the Campaign cards section below.</p> : (
        <div className="flex flex-col gap-1.5">
          {cards.map((x) => {
            const v = pick[x.code];
            const got = already.has(x.code);
            return (
              <div key={x.code} className={`flex flex-wrap items-center gap-2 text-sm ${got ? 'opacity-50' : ''}`}>
                <input type="checkbox" disabled={got} checked={got || Boolean(v)} onChange={() => toggle(x)} />
                <CardHover card={x} className="font-semibold">{x.name}</CardHover>
                {got && <span className={`text-xs ${ui.muted}`}>already added</span>}
                {v && <>
                  <select className={`${ui.field} !w-auto !py-1 text-xs`} value={v.kind} onChange={(e) => set(x.code, { kind: e.target.value })}><option value="boon">boon</option><option value="burden">burden</option><option value="campaign">campaign</option></select>
                  <select className={`${ui.field} !w-auto !py-1 text-xs`} value={v.to} onChange={(e) => set(x.code, { to: e.target.value })}>
                    {c.players.map((p) => <option key={p.email} value={p.email}>{p.name}'s deck</option>)}
                    <option value="encounter">the encounter deck</option>
                  </select>
                </>}
              </div>
            );
          })}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={add} disabled={!n || busy} className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-40 ${ui.primary}`}><Gift size={14} /> {busy ? 'Adding...' : `Add ${n || ''} card${n === 1 ? '' : 's'}`}</button>
        <button onClick={onClose} className={`px-4 py-2 rounded-xl text-sm font-bold ${ui.soft}`}>None earned</button>
      </div>
    </div>
  );
}

function ScenarioLog({ ui, c, edit, scenarios, call, section, campCards = [] }) {
  const [rewards, setRewards] = useState(null); // { name, pack } - the win whose cards are being added
  const packOfScen = (name) => scenarios.find((x) => x.name === name)?.pack || null;
  const [showAll, setShowAll] = useState(false);
  const groups = scenarioGroups(scenarios, c.kind, showAll);
  const filtered = Boolean(KIND_SCENARIO_PACKS[c.kind]);
  const blank = () => ({ scenarioId: '', name: '', result: 'won', difficulty: 'normal', score: '', ...nowParts(), notes: '' });
  const [d, setD] = useState(blank);
  const [open, setOpen] = useState(false);
  const save = async () => {
    if (await call('/scenarios', 'POST', d)) {
      if (d.result === 'won') setRewards({ name: d.name, pack: packOfScen(d.name) });
      setD(blank()); setOpen(false);
    }
  };
  // Editing a play (when it was played, notable moments) re-saves it; the chronicle rewrites that chapter.
  const [editing, setEditing] = useState(null); // { id, notes, date, time }
  const saveEdit = async (s) => { if (await call('/scenarios', 'POST', { ...s, notes: editing.notes, date: editing.date, time: editing.time })) setEditing(null); };
  return (
    <div className={ui.panel}>
      <div className="flex items-center"><h2 className={`${section} flex-1 !mb-0`}><ScrollText size={14} className="opacity-60" /> Scenarios played</h2>
        {edit && !open && <button onClick={() => { setD(blank()); setOpen(true); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${ui.soft}`}><Plus size={13} /> Log a scenario</button>}</div>
      {open && (
        <div className={`mt-3 rounded-xl border p-3 grid grid-cols-1 sm:grid-cols-6 gap-2 ${ui.row}`}>
          <select className={`${ui.field} sm:col-span-3 !py-1.5 text-sm`} value={d.scenarioId} onChange={(e) => { const s = scenarios.find((x) => String(x.id) === e.target.value); setD({ ...d, scenarioId: e.target.value, name: s?.name || '' }); }}>
            <option value="">Choose the scenario...</option>
            {groups.map(([label, xs]) => (
              <optgroup key={label} label={label}>
                {xs.map((s) => <option key={s.id} value={s.id}>{s.name}{s.owned ? ' ✓' : ''}</option>)}
              </optgroup>
            ))}
          </select>
          {filtered && (
            <label className={`sm:col-span-6 flex items-center gap-2 text-xs ${ui.muted}`}>
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show scenarios from outside {c.kind} (✓ = a pack you own)
            </label>
          )}
          <select className={`${ui.field} !py-1.5 text-sm`} value={d.result} onChange={(e) => setD({ ...d, result: e.target.value })}><option value="won">Won</option><option value="lost">Lost</option></select>
          <select className={`${ui.field} !py-1.5 text-sm`} value={d.difficulty} onChange={(e) => setD({ ...d, difficulty: e.target.value })}><option>easy</option><option>normal</option><option>nightmare</option></select>
          <input className={`${ui.field} !py-1.5 text-sm`} type="number" value={d.score} onChange={(e) => setD({ ...d, score: e.target.value })} placeholder="Score" />
          <WhenInput ui={ui} className="sm:col-span-2" value={d} onChange={(w) => setD({ ...d, ...w })} />
          <div className="sm:col-span-4 flex gap-2">
            <textarea rows={2} className={`${ui.field} flex-1 !py-1.5 text-sm min-h-[8rem] sm:min-h-0`} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="Notable moments - they're written into the chronicle..." />
            <VoiceNoteButton ui={ui} campaignId={c.id} onText={(t) => setD((x) => ({ ...x, notes: addBullet(x.notes, t) }))} />
          </div>
          <div className="sm:col-span-6 flex gap-2">
            <button onClick={save} disabled={!d.name} className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-40 ${ui.primary}`}><Save size={14} /> Save</button>
            <button onClick={() => setOpen(false)} className={`px-4 py-2 rounded-xl text-sm font-bold ${ui.soft}`}>Cancel</button>
          </div>
        </div>
      )}
      {rewards && edit && <RewardsPanel ui={ui} c={c} campCards={campCards} scen={rewards} call={call} onClose={() => setRewards(null)} />}
      {!c.scenarios.length ? <p className={`text-sm mt-3 ${ui.muted}`}>Nothing played yet.</p> : (
        <div className="flex flex-col gap-1.5 mt-3">
          {c.scenarios.map((s, i) => (
            <div key={s.id} className={`rounded-xl border px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm ${ui.row}`}>
              <span className={`w-5 text-xs ${ui.muted}`}>{i + 1}.</span>
              <b className="flex-1 min-w-[10rem]">{s.name}</b>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${s.result === 'won' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-red-500/15 text-red-500'}`}>{s.result}</span>
              <span className={`text-xs ${ui.muted}`}>{s.difficulty} · score {s.score ?? '-'} · {playWhen(s)}</span>
              {edit && <button onClick={() => setEditing(editing?.id === s.id ? null : { id: s.id, notes: s.notes || '', date: s.date, time: s.time || null })} className={`p-1 rounded ${ui.soft}`} title="Edit when it was played and the notable moments"><Pencil size={12} /></button>}
              {edit && s.result === 'won' && <button onClick={() => setRewards({ name: s.name, pack: packOfScen(s.name) })} className={`p-1 rounded ${ui.soft}`} title="Campaign cards earned here"><Gift size={12} /></button>}
              {edit && <button onClick={() => call(`/scenarios/${s.id}`, 'DELETE')} className={`p-1 rounded ${ui.soft}`} title="Remove"><X size={12} /></button>}
              {editing?.id === s.id ? (
                <div className="basis-full pl-8 flex flex-col gap-1.5">
                  <label className={`text-xs flex flex-wrap items-center gap-2 ${ui.muted}`}>Played <WhenInput ui={ui} className="!w-auto" value={editing} onChange={(w) => setEditing({ ...editing, ...w })} /></label>
                  <div className="flex gap-2">
                    <textarea rows={3} autoFocus className={`${ui.field} flex-1 !py-1.5 text-sm min-h-[8rem] sm:min-h-0`} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="Notable moments - a hero's great deed, a narrow escape, a choice made... The chronicle's chapter is rewritten to include them." />
                    <VoiceNoteButton ui={ui} campaignId={c.id} onText={(t) => setEditing((x) => ({ ...x, notes: addBullet(x.notes, t) }))} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(s)} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${ui.primary}`}><Save size={12} /> Save</button>
                    <button onClick={() => setEditing(null)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${ui.soft}`}>Cancel</button>
                  </div>
                </div>
              ) : s.notes && <div className={`basis-full text-xs pl-8 whitespace-pre-line ${ui.muted}`}><b>Notable moments:</b> {s.notes}</div>}
            </div>
          ))}
          <div className="text-xs text-right font-bold mt-1">Campaign total: {c.totalScore}</div>
        </div>
      )}
    </div>
  );
}

function CampaignCards({ ui, c, edit, campCards, scenarios, byCode, call, section, nameOf }) {
  const packs = useMemo(() => [...new Set(campCards.map((x) => x.pack))], [campCards]);
  const kindPacks = KIND_PACKS[c.kind] || [];
  const [pack, setPack] = useState('');
  const [open, setOpen] = useState(false);
  // Starts on the scenario just played; the card list follows it.
  const lastPlayed = c.scenarios[c.scenarios.length - 1]?.name || '';
  const blank = { code: '', kind: 'boon', to: c.players[0]?.email || 'encounter', hero: '', fromScenario: lastPlayed, note: '' };
  const [d, setD] = useState(blank);
  // Cards from the pack the chosen scenario comes in (the sagas); for the campaign expansions, whose
  // cards come in their own box, the campaign type's box. A pack can be picked by hand instead.
  const scenPack = scenarios.find((x) => x.name === d.fromScenario)?.pack;
  const autoPacks = scenPack && campCards.some((x) => x.pack === scenPack) ? [scenPack] : kindPacks;
  const shown = campCards.filter((x) => (pack ? x.pack === pack : !autoPacks.length || autoPacks.includes(x.pack)));
  const chosen = campCards.find((x) => x.code === d.code);
  const player = c.players.find((p) => p.email === d.to);
  const save = async () => {
    if (!chosen) return;
    if (await call('/cards', 'POST', { ...d, name: chosen.name, kind: d.kind })) { setD(blank); setOpen(false); }
  };
  const group = (list) => list.map((x) => (
    <div key={x.id} className={`rounded-xl border px-3 py-2 flex flex-wrap items-center gap-2 text-sm ${ui.row} ${x.removed ? 'opacity-50' : ''}`}>
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${x.kind === 'boon' ? 'bg-emerald-500/15 text-emerald-500' : x.kind === 'burden' ? 'bg-red-500/15 text-red-500' : 'bg-slate-500/15 text-slate-500'}`}>{x.kind}</span>
      <b className={x.removed ? 'line-through' : ''}>{x.name}</b>
      <span className={`text-xs ${ui.muted} flex-1`}>
        {x.to === 'encounter' ? 'encounter deck' : `${nameOf(x.to)}'s deck`}{x.hero ? ` · on ${byCode[x.hero]?.name || x.hero}` : ''}{x.fromScenario ? ` · from ${x.fromScenario}` : ''}{x.note ? ` · ${x.note}` : ''}
      </span>
      {edit && <>
        <button onClick={() => call('/cards', 'POST', { ...x, removed: !x.removed })} title={x.removed ? 'Back in play' : 'Used up / removed'} className={`p-1 rounded ${ui.soft}`}>{x.removed ? <Undo2 size={12} /> : <X size={12} />}</button>
        <button onClick={() => call(`/cards/${x.id}`, 'DELETE')} title="Delete" className="p-1 rounded text-red-400"><Trash2 size={12} /></button>
      </>}
    </div>
  ));
  return (
    <div className={ui.panel}>
      <div className="flex items-center"><h2 className={`${section} flex-1 !mb-0`}><Gift size={14} className="opacity-60" /> Boons and burdens</h2>
        {edit && !open && <button onClick={() => { setD(blank); setPack(''); setOpen(true); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${ui.soft}`}><Plus size={13} /> Add a campaign card</button>}</div>
      {open && (
        <div className={`mt-3 rounded-xl border p-3 flex flex-col gap-2 ${ui.row}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select className={`${ui.field} !py-1.5 text-sm`} value={pack} onChange={(e) => { setPack(e.target.value); setD({ ...d, code: '' }); }}>
              <option value="">{autoPacks.length ? `From ${autoPacks.length === 1 ? autoPacks[0] : c.kind}` : 'All campaign cards'}</option>
              {packs.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className={`${ui.field} !py-1.5 text-sm`} value={d.code} onChange={(e) => { const x = campCards.find((y) => y.code === e.target.value); setD({ ...d, code: e.target.value, kind: x?.kind === 'burden' ? 'burden' : x?.kind === 'boon' ? 'boon' : d.kind }); }}>
              <option value="">Choose the card...</option>
              {shown.map((x) => <option key={x.code} value={x.code}>{x.name} ({x.pack})</option>)}
            </select>
          </div>
          {chosen && <div className={`text-xs rounded-lg p-2 ${ui.soft}`}><b>{chosen.name}</b>{chosen.traits ? ` · ${chosen.traits}` : ''} - {chosen.text}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <select className={`${ui.field} !py-1.5 text-sm`} value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value })}><option value="boon">Boon</option><option value="burden">Burden</option><option value="campaign">Other campaign card</option></select>
            <select className={`${ui.field} !py-1.5 text-sm`} value={d.to} onChange={(e) => setD({ ...d, to: e.target.value, hero: '' })}>
              {c.players.map((p) => <option key={p.email} value={p.email}>{p.name}'s deck</option>)}
              <option value="encounter">Encounter deck</option>
            </select>
            <select className={`${ui.field} !py-1.5 text-sm`} value={d.hero} onChange={(e) => setD({ ...d, hero: e.target.value })} disabled={!player}>
              <option value="">Not attached to a hero</option>
              {(player?.deckHeroes || []).map((h) => <option key={h} value={h}>On {byCode[h]?.name || h}</option>)}
            </select>
            <select className={`${ui.field} !py-1.5 text-sm`} value={d.fromScenario} onChange={(e) => setD({ ...d, fromScenario: e.target.value })}>
              <option value="">Earned in...</option>
              {c.scenarios.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>
          <input className={`${ui.field} !py-1.5 text-sm`} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder="Note (optional)" />
          <div className="flex gap-2">
            <button onClick={save} disabled={!chosen} className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-40 ${ui.primary}`}><Save size={14} /> Add</button>
            <button onClick={() => setOpen(false)} className={`px-4 py-2 rounded-xl text-sm font-bold ${ui.soft}`}>Cancel</button>
          </div>
        </div>
      )}
      {!c.cards.length ? <p className={`text-sm mt-3 ${ui.muted}`}>No campaign cards yet.</p> : (
        <div className="flex flex-col gap-3 mt-3">
          {c.players.map((p) => { const mine = c.cards.filter((x) => x.to === p.email); return mine.length ? <div key={p.email}><div className="text-[11px] font-black uppercase tracking-wider mb-1">{p.name}'s deck</div><div className="flex flex-col gap-1.5">{group(mine)}</div></div> : null; })}
          {c.cards.some((x) => x.to === 'encounter') && <div><div className="text-[11px] font-black uppercase tracking-wider mb-1">Encounter deck</div><div className="flex flex-col gap-1.5">{group(c.cards.filter((x) => x.to === 'encounter'))}</div></div>}
        </div>
      )}
    </div>
  );
}

export function Notes({ ui, c, edit, call, section, me }) {
  const [text, setText] = useState('');
  const add = async () => { if (text.trim() && await call('/notes', 'POST', { text })) setText(''); };
  return (
    <div className={ui.panel}>
      <h2 className={section}><ScrollText size={14} className="opacity-60" /> Notes</h2>
      {edit && (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end mb-3">
          <textarea className={`${ui.field} flex-1 min-h-[10rem] sm:min-h-0`} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Anything to remember - campaign log entries, decisions, what to try next time... or tap the mic and say it." />
          <div className="flex gap-2 items-stretch">
            <VoiceNoteButton ui={ui} campaignId={c.id} onText={(t) => setText((x) => addBullet(x, t))} />
            <button onClick={add} disabled={!text.trim()} className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold shrink-0 disabled:opacity-40 ${ui.primary}`}>Add note</button>
          </div>
        </div>
      )}
      {!c.notes.length ? <p className={`text-sm ${ui.muted}`}>No notes yet.</p> : c.notes.map((n) => (
        <div key={n.id} className="py-2 border-b border-slate-500/10 last:border-0">
          <div className={`text-[11px] ${ui.muted} flex items-center gap-2`}>{n.byName} · {new Date(n.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            {edit && n.by === me && <button onClick={() => call(`/notes/${n.id}`, 'DELETE')} className="ml-auto text-red-400"><X size={12} /></button>}</div>
          <p className="text-sm whitespace-pre-line">{n.text}</p>
        </div>
      ))}
    </div>
  );
}
