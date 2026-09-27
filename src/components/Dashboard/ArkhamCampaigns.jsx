import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, ChevronLeft, Trash2, ScrollText, Save, X, Pencil, Skull, Brain, HeartCrack, Sparkles, Shuffle, RotateCcw, BookOpen, Users } from 'lucide-react';
import CardHover from './CardHover';
import VoiceNoteButton, { addBullet } from './VoiceNote';
import CampaignMap from './CampaignMap';
import Chronicle, { useChronicle } from './Chronicle';
import { CampaignBanner, Rulebooks, GeneralRuleCheck, RuleCheck, Notes, WhenInput, playWhen, OverallJourney } from './CampaignsView';

// Arkham Horror: The Card Game campaigns (/campaigns/ahlcg, /campaigns/ahlcg/<id>): investigators from
// ArkhamDB decks with their trauma, experience and fate; the chaos bag (from the campaign guide, at the
// campaign's difficulty); the campaign log under the guide's own sections; scenarios with their
// resolutions and experience; the chronicle as an investigator's case notes; the map of Arkham; rule
// checks against the Arkham rulebooks; notes. Separate from the Lord of the Rings tab in every way.

async function api(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.success === false) throw new Error(d.error || `Request failed (${res.status})`);
  return d;
}
const CLASS = { guardian: '#2b80c5', seeker: '#ec8426', rogue: '#107116', mystic: '#4331b9', survivor: '#cc3038', neutral: '#64748b' };
const DIFFICULTIES = ['easy', 'standard', 'hard', 'expert'];
// The chaos bag's tokens, as the page shows them.
const TOKEN = {
  '+1': { t: '+1' }, '0': { t: '0' }, '-1': { t: '-1' }, '-2': { t: '-2' }, '-3': { t: '-3' }, '-4': { t: '-4' }, '-5': { t: '-5' }, '-6': { t: '-6' }, '-7': { t: '-7' }, '-8': { t: '-8' },
  skull: { t: '☠', name: 'Skull', bg: '#4a1f1f' }, cultist: { t: '♆', name: 'Cultist', bg: '#2f3b2a' }, tablet: { t: '⌧', name: 'Tablet', bg: '#3a3325' },
  elder_thing: { t: '✺', name: 'Elder Thing', bg: '#3b2a4a' }, auto_fail: { t: '✖', name: 'Auto-fail', bg: '#7a1111' }, elder_sign: { t: '✦', name: 'Elder Sign', bg: '#1f4a6b' },
  bless: { t: '✚', name: 'Bless', bg: '#8a6d1c' }, curse: { t: '✠', name: 'Curse', bg: '#3b0d2a' }, frost: { t: '❄', name: 'Frost', bg: '#2a5a7a' },
};
// (listed by hand: an object puts number-like keys such as "0" first)
const TOKEN_ORDER = ['+1', '0', '-1', '-2', '-3', '-4', '-5', '-6', '-7', '-8', 'skull', 'cultist', 'tablet', 'elder_thing', 'auto_fail', 'elder_sign', 'bless', 'curse', 'frost'];
const Token = ({ id, size = 34 }) => {
  const k = TOKEN[id] || { t: id };
  return (
    <span title={k.name || id} className="inline-flex items-center justify-center rounded-full font-black shrink-0"
      style={{ width: size, height: size, fontSize: size * (k.name ? 0.52 : 0.4), background: k.bg || '#e7dcc2', color: k.bg ? '#f5ecd6' : '#2b2419', border: '2px solid rgba(0,0,0,.35)', boxShadow: 'inset 0 1px 2px rgba(255,255,255,.25)' }}>{k.t}</span>
  );
};

// ---- the list of campaigns, and starting one ------------------------------------------------------------
export function ArkhamList({ ui, toast, go }) {
  const [list, setList] = useState(null);
  const [opts, setOpts] = useState(null);
  const [decks, setDecks] = useState([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', kind: 'Night of the Zealot', difficulty: 'standard', players: [] });
  const load = useCallback(() => api('/api/decks/campaigns?game=ahlcg').then((d) => setList(d.campaigns)).catch((err) => toast(err.message, 'error')), [toast]);
  useEffect(() => {
    load();
    api('/api/decks/campaigns/options?game=ahlcg').then((o) => { setOpts(o); setDraft((d) => ({ ...d, players: [{ email: o.me, deckId: '' }] })); }).catch(() => {});
    api('/api/decks/ahlcg/decks').then((d) => setDecks(d.decks)).catch(() => {});
  }, [load]);
  const create = async () => {
    if (!draft.name.trim()) return toast('Give the campaign a name.', 'error');
    try {
      const d = await api('/api/decks/campaigns?game=ahlcg', { method: 'POST', body: { name: draft.name, kind: draft.kind, difficulty: draft.difficulty, players: draft.players.filter((p) => p.email).map((p) => ({ email: p.email, deckId: p.deckId || null })) } });
      go(`/campaigns/ahlcg/${d.campaign.id}`);
    } catch (err) { toast(err.message, 'error'); }
  };
  const setPlayer = (i, patch) => setDraft((d) => ({ ...d, players: d.players.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  return (
    <>
      <div className={ui.panel}>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-xs font-black uppercase tracking-wider flex-1 flex items-center gap-2"><BookOpen size={14} className="opacity-60" /> Arkham Horror campaigns</h2>
          {!adding && <button onClick={() => setAdding(true)} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${ui.primary}`}><Plus size={13} /> New campaign</button>}
        </div>
        {adding && (
          <div className={`rounded-xl border p-3 mb-3 grid grid-cols-1 sm:grid-cols-6 gap-2 ${ui.row}`}>
            <input className={`${ui.field} sm:col-span-3`} placeholder="What shall we call this case?" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <select className={`${ui.field} sm:col-span-2`} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
              {(opts?.kinds || []).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <select className={ui.field} value={draft.difficulty} onChange={(e) => setDraft({ ...draft, difficulty: e.target.value })}>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            {draft.players.map((p, i) => (
              <div key={i} className="sm:col-span-6 flex flex-wrap gap-2">
                <select className={`${ui.field} !w-auto`} value={p.email} onChange={(e) => setPlayer(i, { email: e.target.value, deckId: '' })}>
                  {(opts?.people || []).map((x) => <option key={x.email} value={x.email}>{x.name}</option>)}
                </select>
                <select className={`${ui.field} !w-auto flex-1`} value={p.deckId} onChange={(e) => setPlayer(i, { deckId: e.target.value })}>
                  <option value="">Investigator deck (choose later)</option>
                  {decks.filter((d) => d.owner === p.email).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                {i > 0 && <button onClick={() => setDraft((d) => ({ ...d, players: d.players.filter((_, j) => j !== i) }))} className={`p-2 rounded-lg ${ui.soft}`}><X size={14} /></button>}
              </div>
            ))}
            <div className="sm:col-span-6 flex flex-wrap gap-2">
              {draft.players.length < 4 && <button onClick={() => setDraft((d) => ({ ...d, players: [...d.players, { email: (opts?.people || []).find((x) => !d.players.some((p) => p.email === x.email))?.email || opts?.me, deckId: '' }] }))} className={`px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 ${ui.soft}`}><Users size={14} /> Add an investigator</button>}
              <button onClick={create} className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${ui.primary}`}><Save size={14} /> Open the case</button>
              <button onClick={() => setAdding(false)} className={`px-4 py-2 rounded-xl text-sm font-bold ${ui.soft}`}>Cancel</button>
            </div>
            <p className={`sm:col-span-6 text-[11px] ${ui.muted}`}>The chaos bag is taken from the campaign's own guide at the difficulty you pick (the first time a campaign is started, the guide is read - it takes a few seconds).</p>
          </div>
        )}
        {!list ? <p className={`text-sm ${ui.muted}`}>Loading...</p> : !list.length ? <p className={`text-sm text-center py-8 ${ui.muted}`}>No cases open yet - start one to track investigators, trauma, experience, the chaos bag and the campaign log.</p> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map((c) => (
              <button key={c.id} onClick={() => go(`/campaigns/ahlcg/${c.id}`)} className={`text-left rounded-xl border overflow-hidden hover:brightness-95 ${ui.row}`}>
                {c.banner && <img src={c.banner.url} alt="" className="w-full h-24 object-cover" style={{ objectPosition: `50% ${c.banner.pos}%` }} />}
                <div className="p-3">
                  <div className="font-black">{c.name}</div>
                  <div className={`text-xs ${ui.muted}`}>{c.kind} · {c.arkham?.difficulty || 'standard'}</div>
                  <div className="text-xs mt-1">{c.players.map((p) => p.name).join(', ')} · {c.played} played</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {list?.length > 0 && <OverallJourney ui={ui} toast={toast} list={list} game="ahlcg" />}
      <Rulebooks ui={ui} toast={toast} game="ahlcg" />
      <GeneralRuleCheck ui={ui} toast={toast} game="ahlcg" />
    </>
  );
}

// ---- one campaign -----------------------------------------------------------------------------------------
export function ArkhamDetail({ id, ui, toast, go }) {
  const [c, setC] = useState(null);
  const [decks, setDecks] = useState([]);
  const [cards, setCards] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [opts, setOpts] = useState(null);
  const load = useCallback(() => api(`/api/decks/campaigns/${id}`).then((d) => setC(d.campaign)).catch((err) => toast(err.message, 'error')), [id, toast]);
  useEffect(() => {
    load();
    api('/api/decks/ahlcg/decks').then((d) => setDecks(d.decks)).catch(() => {});
    api('/api/decks/ahlcg/cards').then(setCards).catch(() => {});
    api('/api/decks/campaigns/scenarios?game=ahlcg').then((d) => setScenarios(d.scenarios)).catch(() => {});
    api('/api/decks/campaigns/options?game=ahlcg').then(setOpts).catch(() => {});
  }, [load]);
  // the chaos bag and log sections arrive a few seconds after a new campaign (its guide is being read)
  useEffect(() => {
    if (!c || c.arkham?.chaosBag?.length) return undefined;
    const t = setTimeout(load, 5000);
    return () => clearTimeout(t);
  }, [c, load]);
  const byCode = useMemo(() => Object.fromEntries((cards?.cards || []).map((x) => [x.code, x])), [cards]);
  const chron = useChronicle(c, Boolean(c?.canEdit));
  if (!c) return <div className={`text-center py-16 ${ui.muted}`}>Opening the case file...</div>;
  const call = async (url, method, body) => { try { const d = await api(`/api/decks/campaigns/${id}${url}`, { method, body }); if (d.campaign) setC(d.campaign); return d; } catch (err) { toast(err.message, 'error'); return null; } };
  const edit = c.canEdit;
  const section = 'text-xs font-black uppercase tracking-wider mb-3 flex items-center gap-2';
  const route = scenarios.filter((s) => s.pack === c.kind).map((s) => s.name);
  const xpOf = (p) => c.scenarios.filter((s) => (s.decks || []).some((d) => d.email === p.email)).reduce((n, s) => n + (Number(s.xp) || 0), 0) + (p.xpBonus || 0);
  const lost = c.players.filter((p) => p.status && p.status !== 'active').length;

  return (
    <>
      <CampaignBanner c={c} ui={ui} edit={edit} setC={setC} toast={toast} />
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => go('/campaigns/ahlcg')} className={`px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1 ${ui.soft}`}><ChevronLeft size={15} /> Campaigns</button>
        <input className={`${ui.field} !w-auto flex-1 min-w-[12rem] font-bold text-base`} defaultValue={c.name} readOnly={!edit} onBlur={(e) => edit && e.target.value !== c.name && call('', 'PUT', { name: e.target.value })} />
        <select className={`${ui.field} !w-auto`} value={c.kind || ''} disabled={!edit} onChange={(e) => call('', 'PUT', { kind: e.target.value })}>
          {(opts?.kinds || [c.kind]).map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select className={`${ui.field} !w-auto`} value={c.arkham?.difficulty || 'standard'} disabled={!edit} onChange={(e) => call('', 'PUT', { difficulty: e.target.value })} title="Difficulty">
          {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      {!edit && <p className={`text-xs ${ui.muted}`}>You're viewing {c.createdByName}'s case - only its investigators can change it.</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[['Scenarios played', c.scenarios.length], ['Completed', new Set(c.scenarios.filter((s) => s.result === 'won').map((s) => s.name)).size + (route.length ? ` / ${route.length}` : '')],
          ['Experience earned', c.players.reduce((n, p) => n + xpOf(p), 0)], ['Investigators lost', lost]].map(([k, v]) => (
          <div key={k} className={`rounded-xl p-3 ${ui.soft}`}><div className="text-lg font-black">{v}</div><div className={`text-[11px] ${ui.muted}`}>{k}</div></div>
        ))}
      </div>

      {c.scenarios.length > 0 && <Chronicle c={c} chron={chron} byCode={byCode} setC={setC} toast={toast} />}
      {scenarios.length > 0 && <CampaignMap c={c} ui={ui} game="ahlcg" route={route} packOf={Object.fromEntries(scenarios.map((x) => [x.name, x.pack]))} byCode={byCode} edit={edit} toast={toast} chronicle={chron?.chapters} title="The case so far" summary={`${new Set(c.scenarios.filter((s) => s.result === 'won').map((s) => s.name)).size} of ${route.length || '?'} scenarios completed`} />}
      <Investigators ui={ui} c={c} edit={edit} decks={decks} byCode={byCode} call={call} section={section} go={go} xpOf={xpOf} />
      <ChaosBag ui={ui} c={c} edit={edit} call={call} section={section} toast={toast} />
      <CampaignLog ui={ui} c={c} edit={edit} call={call} section={section} />
      <ArkhamScenarioLog ui={ui} c={c} edit={edit} scenarios={scenarios} call={call} section={section} />
      <RuleCheck ui={ui} c={c} scenarios={scenarios} setC={setC} toast={toast} section={section} />
      <Notes ui={ui} c={c} edit={edit} call={call} section={section} me={opts?.me} />
      {edit && (() => {
        const voted = c.deleteVotes || [];
        const mine = voted.some((v) => v.email === opts?.me);
        const vote = async (yes) => {
          if (yes && !window.confirm(voted.length + 1 >= c.players.length ? `You're the last investigator to agree - "${c.name}" will be deleted for good.` : `Vote to delete "${c.name}"? It's deleted once every investigator has voted.`)) return;
          try {
            const d = await api(`/api/decks/campaigns/${c.id}/delete-vote`, { method: yes ? 'POST' : 'DELETE' });
            if (d.deleted) { toast('Case closed and deleted.'); go('/campaigns/ahlcg'); } else setC(d.campaign);
          } catch (err) { toast(err.message, 'error'); }
        };
        return (
          <div className="flex flex-wrap items-center justify-end gap-3">
            {voted.length > 0 && <span className="text-xs text-red-500">Delete votes {voted.length} of {c.players.length}: {voted.map((v) => v.name).join(', ')}</span>}
            {mine ? <button onClick={() => vote(false)} className={`px-4 py-2 rounded-xl text-sm font-bold ${ui.soft}`}>Take back my delete vote</button>
              : <button onClick={() => vote(true)} className="px-4 py-2 rounded-xl text-sm font-bold text-red-500 flex items-center gap-2"><Trash2 size={15} /> Delete campaign</button>}
          </div>
        );
      })()}
    </>
  );
}

// ---- investigators: deck, trauma, experience, fate -------------------------------------------------------
function Investigators({ ui, c, edit, decks, byCode, call, section, go, xpOf }) {
  const latest = [...c.scenarios].sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`)).pop()?.name || null;
  const save = (email, patch) => call('', 'PUT', { players: c.players.map((p) => {
    const q = p.email === email ? { ...p, ...patch } : p;
    return { email: q.email, deckId: q.deckId, fallen: q.fallen, fallenIn: q.fallenIn, physical: q.physical, mental: q.mental, xpBonus: q.xpBonus, xpSpent: q.xpSpent, status: q.status };
  }) });
  // killed or driven insane: they join the lost (with a last word in the case file), in the latest scenario
  const setFate = (p, status) => {
    const inv = (p.deckHeroes || [])[0];
    const gone = status !== 'active' && inv;
    save(p.email, { status, fallen: gone ? [inv] : [], fallenIn: gone ? { [inv]: (p.fallenIn || {})[inv] || latest } : {} });
  };
  const Step = ({ value, onChange, label, icon: Icon, colour }) => (
    <div className="flex items-center gap-1.5">
      {Icon && <Icon size={14} style={{ color: colour }} />}<span className={`text-[11px] ${ui.muted} w-16`}>{label}</span>
      <button disabled={!edit || value <= 0} onClick={() => onChange(value - 1)} className={`w-6 h-6 rounded-md font-black disabled:opacity-30 ${ui.soft}`}>-</button>
      <b className="w-6 text-center">{value}</b>
      <button disabled={!edit} onClick={() => onChange(value + 1)} className={`w-6 h-6 rounded-md font-black disabled:opacity-30 ${ui.soft}`}>+</button>
    </div>
  );
  return (
    <div className={ui.panel}>
      <h2 className={section}><Users size={14} className="opacity-60" /> Investigators</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {c.players.map((p) => {
          const inv = byCode[(p.deckHeroes || [])[0]];
          const earned = xpOf(p), spent = p.xpSpent || 0;
          const status = p.status || 'active';
          return (
            <div key={p.email} className={`rounded-xl border p-3 ${ui.row} ${status !== 'active' ? 'opacity-80' : ''}`}>
              <div className="flex items-center gap-2">
                <b className="text-sm sm:flex-1 shrink-0">{p.name}</b>
                <select className={`${ui.field} !w-auto flex-1 sm:flex-none min-w-0 sm:max-w-[16rem] !py-1 text-xs`} value={p.deckId || ''} disabled={!edit} onChange={(e) => save(p.email, { deckId: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">No deck chosen</option>
                  {decks.filter((d) => d.owner === p.email).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                {p.deckId && <button onClick={() => go(`/campaigns/ahlcg/decks/${p.deckId}`)} className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 ${ui.soft}`}>View deck</button>}
              </div>
              {inv ? (
                <div className="mt-2 rounded-lg px-3 py-2 text-white flex items-center gap-2" style={{ background: CLASS[inv.sphere] || '#64748b' }}>
                  <CardHover card={inv} className="font-black">{inv.name}</CardHover>
                  <span className="text-[11px] opacity-90">{inv.subname ? `${inv.subname} · ` : ''}{inv.sphereName} · health {inv.health} · sanity {inv.sanity}</span>
                  {status !== 'active' && <span className="ml-auto text-[11px] font-black uppercase flex items-center gap-1">{status === 'killed' ? <Skull size={12} /> : <Brain size={12} />}{status}</span>}
                </div>
              ) : <p className={`text-xs mt-2 ${ui.muted}`}>Choose a deck to see the investigator.</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mt-3">
                <Step label="Physical" icon={HeartCrack} colour="#dc2626" value={p.physical || 0} onChange={(v) => save(p.email, { physical: v })} />
                <Step label="Mental" icon={Brain} colour="#7c3aed" value={p.mental || 0} onChange={(v) => save(p.email, { mental: v })} />
                <Step label="XP spent" icon={Sparkles} colour="#d97706" value={spent} onChange={(v) => save(p.email, { xpSpent: v })} />
                <Step label="XP bonus" value={p.xpBonus || 0} onChange={(v) => save(p.email, { xpBonus: v })} />
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                <span><b>{earned}</b> XP earned · <b className={earned - spent < 0 ? 'text-red-500' : 'text-emerald-500'}>{earned - spent}</b> to spend</span>
                <select className={`${ui.field} !w-auto !py-1 text-xs ml-auto`} value={status} disabled={!edit} onChange={(e) => setFate(p, e.target.value)}>
                  <option value="active">Still investigating</option><option value="killed">Killed</option><option value="insane">Driven insane</option>
                </select>
              </div>
            </div>
          );
        })}
      </div>
      <p className={`text-[11px] mt-2 ${ui.muted}`}>Experience earned is the total from each scenario an investigator played, plus any bonus. An investigator killed or driven insane joins the lost at the back of the case file.</p>
    </div>
  );
}

// ---- the chaos bag -------------------------------------------------------------------------------------------
function ChaosBag({ ui, c, edit, call, section, toast }) {
  const bag = c.arkham?.chaosBag || [];
  const counts = TOKEN_ORDER.map((t) => [t, bag.filter((x) => x === t).length]);
  const [drawn, setDrawn] = useState(null);
  const [shaking, setShaking] = useState(false);
  const setBag = (next) => call('', 'PUT', { chaosBag: next });
  const add = (t) => setBag([...bag, t]);
  const remove = (t) => { const i = bag.lastIndexOf(t); if (i >= 0) setBag(bag.filter((_, j) => j !== i)); };
  const reset = async () => {
    const diff = c.arkham?.difficulty || 'standard';
    try {
      const d = await api(`/api/decks/campaigns/arkham/setup?kind=${encodeURIComponent(c.kind || '')}`);
      const guide = d.setup?.chaosBag?.[diff];
      if (!guide?.length) return toast(`The guide for ${c.kind} doesn't give a bag - set it by hand.`, 'error');
      if (window.confirm(`Reset the chaos bag to the ${c.kind} guide's ${diff} bag (${guide.length} tokens)?`)) setBag(guide);
    } catch (err) { toast(err.message, 'error'); }
  };
  const draw = () => {
    if (!bag.length) return;
    setShaking(true); setDrawn(null);
    setTimeout(() => { setDrawn(bag[Math.floor(Math.random() * bag.length)]); setShaking(false); }, 650);
  };
  return (
    <div className={ui.panel}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className={`${section} flex-1 !mb-0`}><Shuffle size={14} className="opacity-60" /> Chaos bag <span className={`font-normal normal-case tracking-normal ${ui.muted}`}>{bag.length} tokens · {c.arkham?.difficulty || 'standard'}</span></h2>
        <button onClick={draw} disabled={!bag.length} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 ${ui.primary}`}><Shuffle size={13} /> Draw a token</button>
        {edit && <button onClick={reset} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${ui.soft}`}><RotateCcw size={13} /> Reset to the guide's</button>}
      </div>
      {!bag.length && <p className={`text-sm ${ui.muted}`}>{c.kind && c.kind !== 'Custom / mixed' ? 'Reading the campaign guide for the bag...' : 'Empty - add tokens below.'}</p>}
      {(drawn || shaking) && (
        <div className="flex items-center gap-3 mb-3">
          <div style={{ transition: 'transform .6s', transform: shaking ? 'rotate(540deg) scale(.6)' : 'none' }}>{drawn ? <Token id={drawn} size={56} /> : <Token id="0" size={56} />}</div>
          {drawn && <span className="text-sm">You drew <b>{TOKEN[drawn]?.name || drawn}</b>.</span>}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        {counts.filter(([t, n]) => n > 0 || edit).map(([t, n]) => (
          <div key={t} className={`flex flex-col items-center gap-1 ${n ? '' : 'opacity-35'}`}>
            <Token id={t} />
            <div className="flex items-center gap-1 text-xs">
              {edit && <button onClick={() => remove(t)} disabled={!n} className={`w-5 h-5 rounded font-black disabled:opacity-30 ${ui.soft}`}>-</button>}
              <b>{n}</b>
              {edit && <button onClick={() => add(t)} className={`w-5 h-5 rounded font-black ${ui.soft}`}>+</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- the campaign log ----------------------------------------------------------------------------------------
function CampaignLog({ ui, c, edit, call, section }) {
  const log = c.arkham?.log || [];
  const sections = [...new Set([...(c.arkham?.logSections?.length ? c.arkham.logSections : ['Campaign Notes']), ...log.map((e) => e.section)])];
  const [drafts, setDrafts] = useState({});
  const add = async (sec) => { const text = (drafts[sec] || '').trim(); if (text && await call('/log', 'POST', { section: sec, text })) setDrafts((d) => ({ ...d, [sec]: '' })); };
  return (
    <div className={ui.panel}>
      <h2 className={section}><ScrollText size={14} className="opacity-60" /> Campaign log</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sections.map((sec) => (
          <div key={sec} className={`rounded-xl border p-3 ${ui.row}`} style={{ fontFamily: "'Special Elite', monospace" }}>
            <div className="text-xs font-bold uppercase tracking-wider mb-2">{sec}</div>
            {log.filter((e) => e.section === sec).map((e) => (
              <div key={e.id} className="flex items-start gap-2 text-sm py-0.5">
                <span className="opacity-60">•</span>
                <span className="flex-1" style={{ textDecoration: e.crossed ? 'line-through' : 'none', opacity: e.crossed ? 0.55 : 1 }}>{e.text}</span>
                {edit && <button onClick={() => call(`/log/${e.id}`, 'PUT', { crossed: !e.crossed })} title={e.crossed ? 'Uncross' : 'Cross it out'} className={`px-1.5 rounded text-[10px] ${ui.soft}`}>{e.crossed ? 'uncross' : 'cross out'}</button>}
                {edit && <button onClick={() => call(`/log/${e.id}`, 'DELETE')} className="text-red-400"><X size={12} /></button>}
              </div>
            ))}
            {edit && (
              <div className="flex gap-1.5 mt-2">
                <input className={`${ui.field} !py-1 text-sm`} value={drafts[sec] || ''} onChange={(e) => setDrafts({ ...drafts, [sec]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add(sec)} placeholder="Record in the log..." />
                <VoiceNoteButton ui={ui} campaignId={c.id} onText={(t) => setDrafts((d) => ({ ...d, [sec]: d[sec]?.trim() ? `${d[sec].trim()} ${t}` : t }))} />
                <button onClick={() => add(sec)} className={`px-2 rounded-lg ${ui.soft}`} title="Record in the log"><Plus size={14} /></button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- scenarios played ----------------------------------------------------------------------------------------
function ArkhamScenarioLog({ ui, c, edit, scenarios, call, section }) {
  const nowParts = () => { const n = new Date(), p = (x) => String(x).padStart(2, '0'); return { date: `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`, time: `${p(n.getHours())}:${p(n.getMinutes())}` }; };
  const blank = () => ({ scenarioId: '', name: '', result: 'won', resolution: 'R1', xp: '', ...nowParts(), notes: '' });
  const [d, setD] = useState(blank);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const own = scenarios.filter((s) => s.pack === c.kind);
  const others = scenarios.filter((s) => s.pack !== c.kind);
  const groups = own.length && !showAll ? [[c.kind, own]] : [...new Set(scenarios.map((s) => s.pack))].map((p) => [p, scenarios.filter((s) => s.pack === p)]);
  const save = async () => { if (await call('/scenarios', 'POST', d)) { setD(blank()); setOpen(false); } };
  const saveEdit = async (s) => { if (await call('/scenarios', 'POST', { ...s, notes: editing.notes, date: editing.date, time: editing.time, resolution: editing.resolution, xp: editing.xp })) setEditing(null); };
  return (
    <div className={ui.panel}>
      <div className="flex items-center"><h2 className={`${section} flex-1 !mb-0`}><ScrollText size={14} className="opacity-60" /> Scenarios played</h2>
        {edit && !open && <button onClick={() => { setD(blank()); setOpen(true); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${ui.soft}`}><Plus size={13} /> Log a scenario</button>}</div>
      {open && (
        <div className={`mt-3 rounded-xl border p-3 grid grid-cols-1 sm:grid-cols-6 gap-2 ${ui.row}`}>
          <select className={`${ui.field} sm:col-span-3 !py-1.5 text-sm`} value={d.scenarioId} onChange={(e) => { const s = scenarios.find((x) => String(x.id) === e.target.value); setD({ ...d, scenarioId: e.target.value, name: s?.name || '' }); }}>
            <option value="">Choose the scenario...</option>
            {groups.map(([label, xs]) => <optgroup key={label} label={label}>{xs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}
          </select>
          <select className={`${ui.field} !py-1.5 text-sm`} value={d.result} onChange={(e) => setD({ ...d, result: e.target.value })}><option value="won">Completed</option><option value="lost">Failed / defeated</option></select>
          <select className={`${ui.field} !py-1.5 text-sm`} value={d.resolution} onChange={(e) => setD({ ...d, resolution: e.target.value })} title="Resolution">
            {['No resolution', 'R1', 'R2', 'R3', 'R4', 'R5'].map((r) => <option key={r}>{r}</option>)}
          </select>
          <input className={`${ui.field} !py-1.5 text-sm`} type="number" min="0" value={d.xp} onChange={(e) => setD({ ...d, xp: e.target.value })} placeholder="XP each" title="Experience each investigator earned" />
          {own.length > 0 && others.length > 0 && <label className={`sm:col-span-6 flex items-center gap-2 text-xs ${ui.muted}`}><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show scenarios from other campaigns and standalones</label>}
          <WhenInput ui={ui} className="sm:col-span-2" value={d} onChange={(w) => setD({ ...d, ...w })} />
          <div className="sm:col-span-4 flex gap-2">
            <textarea rows={2} className={`${ui.field} flex-1 !py-1.5 text-sm min-h-[8rem] sm:min-h-0`} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="Notable moments - they go into the case file..." />
            <VoiceNoteButton ui={ui} campaignId={c.id} onText={(t) => setD((x) => ({ ...x, notes: addBullet(x.notes, t) }))} />
          </div>
          <div className="sm:col-span-6 flex gap-2">
            <button onClick={save} disabled={!d.name} className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-40 ${ui.primary}`}><Save size={14} /> Save</button>
            <button onClick={() => setOpen(false)} className={`px-4 py-2 rounded-xl text-sm font-bold ${ui.soft}`}>Cancel</button>
          </div>
        </div>
      )}
      {!c.scenarios.length ? <p className={`text-sm mt-3 ${ui.muted}`}>Nothing played yet.</p> : (
        <div className="flex flex-col gap-1.5 mt-3">
          {c.scenarios.map((s, i) => (
            <div key={s.id} className={`rounded-xl border px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm ${ui.row}`}>
              <span className={`w-5 text-xs ${ui.muted}`}>{i + 1}.</span>
              <b className="flex-1 min-w-[10rem]">{s.name}</b>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${s.result === 'won' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-red-500/15 text-red-500'}`}>{s.result === 'won' ? 'completed' : 'failed'}</span>
              <span className={`text-xs ${ui.muted}`}>{s.resolution || 'no resolution'} · {s.xp ?? 0} XP · {playWhen(s)}</span>
              {edit && <button onClick={() => setEditing(editing?.id === s.id ? null : { id: s.id, notes: s.notes || '', date: s.date, time: s.time || null, resolution: s.resolution || 'No resolution', xp: s.xp ?? '' })} className={`p-1 rounded ${ui.soft}`} title="Edit"><Pencil size={12} /></button>}
              {edit && <button onClick={() => call(`/scenarios/${s.id}`, 'DELETE')} className={`p-1 rounded ${ui.soft}`} title="Remove"><X size={12} /></button>}
              {editing?.id === s.id ? (
                <div className="basis-full pl-8 flex flex-col gap-1.5">
                  <div className="flex flex-wrap gap-2 items-center text-xs">
                    <WhenInput ui={ui} className="!w-auto" value={editing} onChange={(w) => setEditing({ ...editing, ...w })} />
                    <select className={`${ui.field} !w-auto !py-1 text-xs`} value={editing.resolution} onChange={(e) => setEditing({ ...editing, resolution: e.target.value })}>{['No resolution', 'R1', 'R2', 'R3', 'R4', 'R5'].map((r) => <option key={r}>{r}</option>)}</select>
                    <input className={`${ui.field} !w-20 !py-1 text-xs`} type="number" min="0" value={editing.xp} onChange={(e) => setEditing({ ...editing, xp: e.target.value })} placeholder="XP" />
                  </div>
                  <div className="flex gap-2">
                    <textarea rows={3} className={`${ui.field} flex-1 !py-1.5 text-sm min-h-[8rem] sm:min-h-0`} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="Notable moments - the case file's entry is rewritten to include them." />
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
        </div>
      )}
    </div>
  );
}
