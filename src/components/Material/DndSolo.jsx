// The D&D Solo DM in the IMS design (25 Oct 2026, Simon: "I'm sure you can improve it and make it look better ... also
// look at the way the service works"; "can you create real 3D dice that roll in a tray?"; "we also have Rindewind's
// face"; "I do prefer the Chronicler voice from the LOTR LCG campaign"; "they don't reflect the whole scope of possible
// D&D solo games ... maybe they need to be indexed ... then use that index to further improve the service").
//
// Rindewind - the old wizard-chronicler, with the Chronicler's painted face and the LOTR chronicle narrator's voice - runs
// solo games from Simon's own books. Rooms: Play (the story as a book, the DM's options and the check he asks for,
// with the 3D dice tray, the oracle and the hero at the side), Hero (the full sheet), Chronicle (the whole tale to read
// or hear), Rulebooks (the game as studied from its books, ask the rulebook, the pages it cites) and Games (every solo
// game found in the library index). Same /api/dnd requests (now with the library behind them).
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import ServicePage, { Empty } from './ServicePage';
import { Icon, IconButton, Btn, Sheet, TextField, TextArea, SelectField, Segmented, FilterChip, Confirm, Spinner, Menu, useMenu, useSnack, DarkCtx } from '../HomebrewBeta/ui';
import ChroniclerFace from '../Ims/ChroniclerFace';
import DiceTray from './DiceTray';
import Chronicle, { useChronicle } from '../Dashboard/Chronicle';
import { useSoundscape, SoundscapePicker, loadCatalogue } from './Soundscape';
import { dndAudio } from '../DndSolo/dndAudioEngine';
import './dnd.css';

const api = async (path, opts = {}) => {
  const res = await fetch(`/api/dnd${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.success === false) throw new Error(d.error || `HTTP ${res.status}`);
  return d;
};
const ROOMS = [['play', 'Play', 'dice'], ['hero', 'Hero', 'person'], ['chronicle', 'Chronicle', 'book'], ['rules', 'Rulebooks', 'doc'], ['games', 'Games', 'explore']];
const ODDS = [['Impossible', 'Impossible'], ['Unlikely', 'Unlikely'], ['50/50', '50/50'], ['Likely', 'Likely'], ['Almost Certain', 'Almost certain']];
const DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];
const sign = (n) => (n > 0 ? `+${n}` : n < 0 ? `${n}` : '');
const paras = (t) => String(t || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

// A stat's bonus for a check: d20 games with 3-20 scores use (score-10)/2; d100 games roll under the score; small
// dice-pool numbers are added as they are
function checkFor(profile, value) {
  const dice = String(profile?.check_dice || '1d20').toLowerCase();
  const v = Number(value) || 0;
  if (/d100/.test(dice)) return { dice: '1d100', mod: 0, under: v };
  if (/^1?d20$/.test(dice)) return { dice: '1d20', mod: v >= 3 && v <= 30 ? Math.floor((v - 10) / 2) : v };
  return { dice, mod: v };
}
const parseDice = (s) => { const m = String(s || '1d20').toLowerCase().match(/^(\d*)d(\d+)$/); return { n: Math.min(6, Number(m?.[1]) || 1), sides: Number(m?.[2]) || 20 }; };

// ---- the narrator: the Chronicler's voice, his lips moving with it -------------------------------------------------------
function useNarrator(snack) {
  const level = useRef(0);
  const [playing, setPlaying] = useState(null); // turn id
  const [waiting, setWaiting] = useState(null);
  const audio = useRef(null);
  const raf = useRef(0);
  const ctx = useRef(null);
  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    try { audio.current?.pause(); } catch { /* gone */ }
    audio.current = null; level.current = 0; setPlaying(null);
  }, []);
  // id: a turn's id (its telling), or any key with text (one of his answers)
  const play = useCallback(async (turnId, text = null) => {
    stop();
    setWaiting(turnId);
    try {
      let r;
      for (let i = 0; i < 90; i++) { // the first reading is made on demand (~10-40 s); afterwards it's instant
        r = text ? await api('/voice', { method: 'POST', body: { text } }) : await api(`/turns/${turnId}/voice`, { method: 'POST' });
        if (r.url) break;
        await new Promise((ok) => setTimeout(ok, 2000));
      }
      if (!r?.url) throw new Error('The narrator is taking too long - try again.');
      const a = new Audio(r.url);
      a.crossOrigin = 'anonymous';
      audio.current = a;
      ctx.current = ctx.current || new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.current.createMediaElementSource(a);
      const an = ctx.current.createAnalyser();
      an.fftSize = 512;
      src.connect(an); an.connect(ctx.current.destination);
      const buf = new Uint8Array(an.fftSize);
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        level.current = Math.min(1, Math.sqrt(sum / buf.length) * 4.5);
        raf.current = requestAnimationFrame(tick);
      };
      a.onended = stop;
      await ctx.current.resume();
      await a.play();
      setPlaying(turnId);
      tick();
    } catch (e) { snack(e.message, { error: true }); stop(); } finally { setWaiting(null); }
  }, [stop, snack]);
  useEffect(() => stop, [stop]);
  return { level, playing, waiting, play, stop };
}

// ---- small pieces -----------------------------------------------------------------------------------------------------
function HpBar({ hp, max, label = 'HP' }) {
  const pct = Math.max(0, Math.min(100, (hp / Math.max(1, max)) * 100));
  return (
    <div className="imsd-hp" role="meter" aria-valuenow={hp} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
      <div className="top"><span>{label}</span><b className="num">{hp}<small> / {max}</small></b></div>
      <div className={`bar ${pct <= 25 ? 'low' : pct <= 50 ? 'mid' : ''}`}><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function Tracker({ t, onChange, small }) {
  const span = t.max - t.min;
  const pips = span > 0 && span <= 12;
  return (
    <div className={`imsd-tracker ${small ? 'small' : ''}`} title={t.about || t.name}>
      <span className="nm">{t.name}</span>
      {pips ? <span className="pips">{Array.from({ length: span + 1 }, (_, i) => t.min + i).filter((v) => v !== 0 || t.min < 0).map((v) => <i key={v} className={`${v <= t.value && v > 0 ? 'on' : ''} ${v < 0 && v >= t.value ? 'neg' : ''} ${v === t.value ? 'cur' : ''}`} />)}</span> : <span className="grow" />}
      {onChange ? <span className="stepper"><IconButton icon="remove" label={`${t.name} down`} disabled={t.value <= t.min} onClick={() => onChange(t.value - 1)} /><b className="num">{t.value}</b><IconButton icon="add" label={`${t.name} up`} disabled={t.value >= t.max} onClick={() => onChange(t.value + 1)} /></span> : <b className="num">{t.value}</b>}
    </div>
  );
}

const RANKS = { troublesome: 12, dangerous: 8, formidable: 4, extreme: 2, epic: 1 };
function ProgressTrack({ p, onMark, onRoll }) {
  return (
    <div className="imsd-progress">
      <div className="top"><span className="nm">{p.name}</span>{p.rank && <span className="tag">{p.rank}</span>}{p.done && <span className="tag good">fulfilled</span>}</div>
      <div className="boxes" aria-label={`${p.name}: ${Math.floor((p.ticks || 0) / 4)} of 10`}>
        {Array.from({ length: 10 }, (_, i) => { const t = Math.max(0, Math.min(4, (p.ticks || 0) - i * 4)); return <i key={i} className={`t${t}`} />; })}
      </div>
      {(onMark || onRoll) && !p.done && <div className="imsm-row">
        {onMark && <Btn kind="text" icon="add" onClick={() => onMark(p)}>Mark progress</Btn>}
        {onRoll && <Btn kind="text" icon="dice" onClick={() => onRoll(p)}>Progress roll</Btn>}
      </div>}
    </div>
  );
}

function RollBadge({ r }) {
  if (!r) return null;
  const dice = [...(r.rolls || []), ...(r.secondRoll != null ? [r.secondRoll] : [])];
  if (r.outcome) return <span className={`tag imsd-roll ${r.success === true ? 'good' : r.success === false ? 'warn' : ''}`}><Icon n="dice" size={16} />{r.label ? `${r.label}: ` : ''}{r.outcome}<small>{r.detail}</small></span>;
  return (
    <span className={`tag imsd-roll ${r.isCrit ? 'good' : r.isFumble ? 'bad' : r.success === true ? 'good' : r.success === false ? 'warn' : ''}`}>
      <Icon n="dice" size={16} />{r.label ? `${r.label}: ` : ''}{r.total}{r.dc ? ` vs ${r.dc}` : ''}<small>{r.formula}{dice.length > 1 ? ` [${dice.join(', ')}]` : ''}</small>
    </span>
  );
}

// a page of one of his books, with the pages either side a tap away
function PageSheet({ page, onClose }) {
  const [n, setN] = useState(page?.page || 1);
  useEffect(() => { setN(page?.page || 1); }, [page]);
  return (
    <Sheet open={Boolean(page)} onClose={onClose} title={page ? `${page.book}, page ${n}` : ''} wideWidth="820px"
      footer={<div className="imsm-row" style={{ justifyContent: 'space-between', width: '100%' }}>
        <Btn kind="text" icon="back" disabled={n <= 1} onClick={() => setN(n - 1)}>Previous page</Btn>
        <Btn kind="text" onClick={() => setN(n + 1)}>Next page<Icon n="open" size={18} /></Btn>
      </div>}>
      {page && <img className="imsd-page" src={`/api/drive/page-image/${page.id}/${n}`} alt={`${page.book}, page ${n}`} />}
    </Sheet>
  );
}

function Sources({ list, onOpen }) {
  if (!list?.length) return null;
  return <>{list.map((s) => <button key={`${s.id}:${s.page}`} type="button" className="tag imsd-src sl" onClick={() => onOpen(s)} title={`Open ${s.book}, page ${s.page}`}><Icon n="doc" size={15} />{s.book.replace(/\s*\(\d+\)$/, '')} p.{s.page}</button>)}</>;
}

// one turn of the story: what he did, then Rindewind's telling, then what it changed and the books it leaned on
function Turn({ t, hero, profile, first, narrator, onPage }) {
  const s = t.scene_state || {};
  const a = s.applied || {};
  const ps = paras(t.dm_narrative);
  return (
    <article className={`imsd-turn ${first ? 'first' : ''}`}>
      {!first && <div className="imsd-orn" aria-hidden="true"><i /><span>❦</span><i /></div>}
      {t.turn_number > 0 && (
        <div className="act">
          <Icon n="edit" size={18} />
          <p><b>{hero?.name || 'You'}</b>{t.player_action}</p>
          <span className="imsm-row">
            {t.dice_rolls?.[0] && <RollBadge r={t.dice_rolls[0]} />}
            {s.oracle && <span className="tag imsd-oracle"><Icon n="eye" size={16} />{s.oracle.question ? `“${s.oracle.question}” ` : ''}{s.oracle.outcome}</span>}
          </span>
        </div>
      )}
      {s.scene_title && <h3 className="scene">{s.scene_title}</h3>}
      <div className="tale">{ps.map((p, i) => <p key={i}>{p}</p>)}</div>
      <div className="foot">
        {a.hp ? <span className={`tag ${a.hp < 0 ? 'bad' : 'good'}`}><Icon n="blood" size={15} />{sign(a.hp)} {profile?.hp_label || 'HP'}</span> : null}
        {(a.gained || []).map((g) => <span key={`g${g}`} className="tag good"><Icon n="add" size={15} />{g}</span>)}
        {(a.lost || []).map((g) => <span key={`l${g}`} className="tag warn"><Icon n="remove" size={15} />{g}</span>)}
        {(a.trackers || []).map((x) => <span key={`t${x.name}`} className={`tag ${x.change > 0 ? 'good' : 'warn'}`}><Icon n="chart" size={15} />{x.name} {sign(x.change)}</span>)}
        {(a.progress || []).map((x) => <span key={`p${x.name}`} className="tag good"><Icon n="flag" size={15} />{x.made ? `New ${x.rank || ''} track: ${x.name}` : x.done ? `${x.name} - fulfilled` : `${x.name} +${x.ticks / 4 >= 1 ? `${x.ticks / 4} box${x.ticks > 4 ? 'es' : ''}` : `${x.ticks} tick${x.ticks > 1 ? 's' : ''}`}`}</span>)}
        {(s.tables_rolled || []).map((x) => <span key={x} className="tag imsd-table"><Icon n="dice" size={15} />{x}</span>)}
        <Sources list={s.rules} onOpen={onPage} />
        <span className="grow" />
        <IconButton icon={narrator.playing === t.id ? 'stop' : 'play'} label={narrator.playing === t.id ? 'Stop the narrator' : 'Rindewind reads this aloud'}
          onClick={() => (narrator.playing === t.id ? narrator.stop() : narrator.play(t.id))} className={narrator.waiting === t.id ? 'spinning' : ''} />
      </div>
    </article>
  );
}

// ---- the page ---------------------------------------------------------------------------------------------------------
function Body({ isOwner = false }) {
  const snack = useSnack();
  const err = useCallback((e) => snack(e?.message || String(e), { error: true }), [snack]);
  const dark = useContext(DarkCtx);
  const [room, setRoomState] = useState(() => { try { return localStorage.getItem('dnd_room') || 'play'; } catch { return 'play'; } });
  const setRoom = (r) => { setRoomState(r); try { localStorage.setItem('dnd_room', r); } catch { /* ignore */ } };
  const [rulesets, setRulesets] = useState([]);
  const [campaigns, setCampaigns] = useState(null);
  const [cid, setCid] = useState(() => { try { return localStorage.getItem('dnd_campaign') || null; } catch { return null; } });
  const [c, setC] = useState(null);
  const [busy, setBusy] = useState('');
  const [input, setInput] = useState('');
  const [roll, setRoll] = useState(null); // attached to the next move
  const [oracle, setOracle] = useState(null);
  const [page, setPage] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newFor, setNewFor] = useState(null);
  const narrator = useNarrator(snack);
  const [autoRead, setAutoRead] = useState(() => { try { return localStorage.getItem('dnd_autoread') === '1'; } catch { return false; } });
  const sounds = useSoundscape();
  const [follow, setFollow] = useState(() => { try { return localStorage.getItem('dnd_sound_follow') !== '0'; } catch { return true; } });
  const [soundOpen, setSoundOpen] = useState(false);
  const campaignMenu = useMenu();
  const storyEnd = useRef(null);

  const loadLists = useCallback(async () => {
    try {
      const [r, cs] = await Promise.all([api('/rulesets'), api('/campaigns')]);
      setRulesets(r.rulesets || []);
      setCampaigns(cs.campaigns || []);
      if (!cs.campaigns?.length) { setCid(null); setC(null); }
      else setCid((cur) => (cur && cs.campaigns.some((x) => x.id === cur) ? cur : cs.campaigns[0].id));
    } catch (e) { err(e); setCampaigns([]); }
  }, [err]);
  useEffect(() => { loadLists(); }, [loadLists]);
  useEffect(() => {
    try { if (cid) localStorage.setItem('dnd_campaign', cid); } catch { /* ignore */ }
    if (!cid) return;
    let live = true;
    api(`/campaigns/${cid}`).then((d) => { if (live) setC(d.campaign); }).catch(err);
    return () => { live = false; };
  }, [cid, err]);


  const ruleset = useMemo(() => rulesets.find((r) => r.id === c?.ruleset_id) || null, [rulesets, c]);
  // the chronicle: the LOTR campaign's own book, its chapters written from these turns
  const bookC = useMemo(() => (c ? { id: c.id, name: c.title, game: 'lotr', kind: c.ruleset_name || '', canEdit: true, players: [{ deckHeroes: [], fallen: [] }], scenarios: (c.turns || []).map((t) => t.id), cards: [] } : null), [c]);
  const chron = useChronicle(bookC, true, c ? `/api/dnd/campaigns/${c.id}` : null);
  const profile = ruleset?.metadata || {};
  const hero = c?.character || null;
  const turns = c?.turns || [];
  const last = turns[turns.length - 1];
  const state = last?.scene_state || {};
  const mood = busy === 'turn' ? 'suspicious' : state.mood || 'neutral';

  // the soundscape follows the story once it's on (the server picks a Tabletop Audio track for each scene)
  const sceneTrack = [...turns].reverse().find((t) => t.scene_state?.soundscape)?.scene_state.soundscape || null;
  useEffect(() => { if (sounds.on && follow && sceneTrack && sceneTrack.key !== sounds.track?.key) sounds.play(sceneTrack); }, [sceneTrack?.key, follow]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { sounds.duck(Boolean(narrator.playing)); }, [narrator.playing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (room === 'play') storyEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns.length, room]);

  // ---- a move ----
  const send = async (text, withRoll = roll) => {
    const action = String(text || '').trim();
    if (!action || !c || busy) return;
    const low = action.toLowerCase();
    if (/attack|strike|swing|stab|slash|fight/.test(low)) dndAudio.playSfx('sword_clash');
    else if (/cast|spell|magic|ritual/.test(low)) dndAudio.playSfx('spell_cast');
    else if (/door|gate|open|enter/.test(low)) dndAudio.playSfx('door_creak');
    setBusy('turn');
    try {
      const d = await api(`/campaigns/${c.id}/turn`, { method: 'POST', body: { playerAction: action, diceRoll: withRoll, oracleResult: oracle } });
      setC(d.campaign); setInput(''); setRoll(null); setOracle(null);
      const t = d.campaign.turns[d.campaign.turns.length - 1];
      if (t?.dice_rolls?.[0]?.isCrit) dndAudio.playSfx('critical_hit');
      else if (t?.dice_rolls?.[0]?.isFumble) dndAudio.playSfx('fumble');
      if (autoRead && t) narrator.play(t.id);
      loadLists();
    } catch (e) { err(e); } finally { setBusy(''); }
  };
  const undo = async () => {
    try {
      const d = await api(`/campaigns/${c.id}/undo`, { method: 'POST' });
      setC(d.campaign); setInput(d.action || ''); setRoll(d.roll || null);
      snack('Taken back. Your words are in the box to change and send again.');
    } catch (e) { err(e); }
  };
  const setHp = async (delta) => {
    if (!hero) return;
    const hp = Math.max(0, Math.min(hero.max_hp, hero.hp + delta));
    dndAudio.playSfx(delta < 0 ? 'shield_block' : 'spell_cast');
    try { const d = await api(`/characters/${hero.id}`, { method: 'PUT', body: { hp } }); setC((p) => ({ ...p, character: d.character })); } catch (e) { err(e); }
  };
  const saveHero = async (patch) => {
    try { const d = await api(`/characters/${hero.id}`, { method: 'PUT', body: patch }); setC((p) => ({ ...p, character: d.character })); return true; } catch (e) { err(e); return false; }
  };
  const removeCampaign = async () => {
    try { await api(`/campaigns/${c.id}`, { method: 'DELETE' }); setC(null); setCid(null); snack('The campaign is gone.'); loadLists(); } catch (e) { err(e); }
  };

  // ---- dice: thrown in the tray, then recorded ----
  const tray = useRef(null);
  const [tray_, setTraySpec] = useState({ die: 'd20', count: 1, mod: 0, adv: 'none' });
  const [result, setResult] = useState(null);
  const [rolling, setRolling] = useState(false);
  const throwDice = async ({ die, count, mod = 0, adv = 'none', label = null, dc = null, under = null }) => {
    if (rolling) return null;
    setRolling(true); setResult(null);
    dndAudio.ensureRunning?.();
    const sides = Number(die.replace('d', ''));
    const pair = sides === 20 && count === 1 && adv !== 'none';
    const kinds = sides === 100 ? Array.from({ length: count }, () => ['d100t', 'd10']).flat() : Array.from({ length: pair ? 2 : count }, () => die);
    const faces = await tray.current?.roll(kinds);
    setRolling(false);
    if (!faces) return null;
    let values;
    if (sides === 100) { values = []; for (let i = 0; i < faces.length; i += 2) values.push((faces[i] + faces[i + 1]) || 100); }
    else values = faces.map((f) => (sides === 10 && f === 0 ? 10 : f));
    try {
      const d = await api('/roll', { method: 'POST', body: { sides, count: pair ? 1 : count, modifier: mod, advantage: adv === 'adv', disadvantage: adv === 'dis', values, label, dc: under ? null : dc } });
      const r = d.result;
      if (under != null) { r.dc = under; r.success = r.kept <= under; r.under = true; r.label = `${label || 'Check'} (roll under ${under})`; }
      setResult(r);
      if (r.isCrit) dndAudio.playSfx('critical_hit'); else if (r.isFumble) dndAudio.playSfx('fumble');
      return r;
    } catch (e) { err(e); return null; }
  };
  // the game's own way of rolling a check: an Ironsworn action roll (d6 + stat against two d10s), a pool of d6 counting
  // successes (Alien, Year Zero), d100 roll-under, or dice + modifier against a DC
  const resolve = async ({ statName, value, label, dc, dice }) => {
    const mode = profile.resolution || (/d100/.test(profile.check_dice || '') ? 'd100-under' : 'd20');
    if (mode === 'ironsworn') {
      if (rolling) return null;
      setRolling(true); setResult(null);
      const f = await tray.current?.roll(['d6', 'd10', 'd10']);
      setRolling(false);
      if (!f) return null;
      const stat = Number(value) || 0, action = Math.min(10, f[0] + stat), c1 = f[1] || 10, c2 = f[2] || 10;
      const beats = (action > c1 ? 1 : 0) + (action > c2 ? 1 : 0);
      const outcome = `${beats === 2 ? 'Strong hit' : beats === 1 ? 'Weak hit' : 'Miss'}${c1 === c2 ? ' with a match' : ''}`;
      const r = { label, formula: 'Action roll', total: action, rolls: [f[0]], challenge: [c1, c2], outcome, success: beats === 2 ? true : beats === 0 ? false : null, detail: `d6 ${f[0]}${stat ? ` + ${statName || 'stat'} ${stat}` : ''} = ${action} vs ${c1} and ${c2}` };
      setResult(r);
      dndAudio.playSfx(beats === 2 ? 'critical_hit' : beats === 0 ? 'fumble' : 'shield_block');
      return r;
    }
    if (mode === 'd6-pool') {
      if (rolling) return null;
      const n = Math.max(1, Math.min(10, Number(value) || 1));
      setRolling(true); setResult(null);
      const f = await tray.current?.roll(Array.from({ length: n }, () => 'd6'));
      setRolling(false);
      if (!f) return null;
      const need = profile.pool_success || 6, hits = f.filter((x) => x >= need).length;
      const r = { label, formula: `${n}d6 pool`, total: hits, rolls: f, outcome: hits ? `${hits} success${hits > 1 ? 'es' : ''}` : 'No successes', success: hits > 0, detail: `[${f.join(', ')}] - ${need}s count` };
      setResult(r);
      dndAudio.playSfx(hits ? 'critical_hit' : 'fumble');
      return r;
    }
    const how = value != null ? checkFor(profile, value) : { dice: dice || profile.check_dice || '1d20', mod: 0 };
    const { n, sides } = parseDice(value == null && dice ? dice : how.dice);
    return throwDice({ die: `d${sides}`, count: n, mod: how.mod, label, dc, under: how.under ?? null });
  };
  // a progress roll (Ironsworn): the progress score - filled boxes - against the two challenge dice, no action die
  const progressRoll = async (p) => {
    if (rolling) return null;
    setRolling(true); setResult(null);
    const f = await tray.current?.roll(['d10', 'd10']);
    setRolling(false);
    if (!f) return null;
    const score = Math.floor((p.ticks || 0) / 4), c1 = f[0] || 10, c2 = f[1] || 10;
    const beats = (score > c1 ? 1 : 0) + (score > c2 ? 1 : 0);
    const r = { label: `Progress: ${p.name}`, formula: 'Progress roll', total: score, challenge: [c1, c2], outcome: `${beats === 2 ? 'Strong hit' : beats === 1 ? 'Weak hit' : 'Miss'}${c1 === c2 ? ' with a match' : ''}`, success: beats === 2 ? true : beats === 0 ? false : null, detail: `progress ${score} vs ${c1} and ${c2}` };
    setResult(r);
    dndAudio.playSfx(beats === 2 ? 'critical_hit' : beats === 0 ? 'fumble' : 'shield_block');
    return r;
  };
  const rollProgress = async (p) => { const r = await progressRoll(p); if (r) setTimeout(() => send(`I make a progress roll for ${p.name}`, r), 1100); };
  const markProgress = (p) => send(`I mark progress on ${p.name}`, null);
  // one of the game's moves: rolled with the stat it calls for (asked which, if it offers a choice)
  const [moveAsk, setMoveAsk] = useState(null);
  const doMove = async (m, statName = null) => {
    const stats = String(m.stat || '').split(/\s*(?:\||,|\bor\b|\/)\s*/i).map((x) => x.trim()).filter(Boolean);
    if (/progress/i.test(m.stat || '')) { setMoveAsk({ move: m, progress: true }); return; }
    // a move with no roll (Pay the Price, Ask the Oracle, Reach a Milestone): just make it
    if (!stats.length || stats.every((x) => /^none$/i.test(x))) { setMoveAsk(null); send(input.trim() || m.name, null); return; }
    const pick = statName || (stats.length === 1 ? stats[0] : null);
    if (stats.length > 1 && !pick) { setMoveAsk({ move: m, stats }); return; }
    setMoveAsk(null);
    const all = [...Object.entries(hero?.attributes || {}), ...(hero?.trackers || []).map((t) => [t.name, t.value]), ...(hero ? [[profile.hp_label || 'Health', hero.hp], ['Health', hero.hp]] : [])];
    const found = pick ? all.find(([k]) => k.toLowerCase() === pick.toLowerCase()) : null;
    const r = await resolve({ statName: found?.[0] || pick, value: found ? found[1] : 0, label: m.name });
    if (r) setTimeout(() => send(input.trim() || `${m.name}${found ? ` (+${found[0]})` : ''}`, r), 1100);
  };
  // the check Rindewind asked for: rolled the game's way with the stat it uses, then sent as the move
  const rollCheck = async (check) => {
    const stat = check.attribute && hero ? [...Object.entries(hero.attributes || {}), ...(hero.trackers || []).map((t) => [t.name, t.value])].find(([k]) => k.toLowerCase() === check.attribute.toLowerCase()) : null;
    const r = await resolve({ statName: stat?.[0], value: stat ? stat[1] : null, label: check.label, dc: check.dc, dice: check.dice });
    if (r) setTimeout(() => send(input.trim() || `I go for it - ${check.label}${check.why ? ` (${check.why})` : ''}`, r), 1100);
  };
  const rollStat = async (name, value) => {
    const r = await resolve({ statName: name, value, label: `${name} check` });
    if (r) { setRoll(r); setRoom('play'); snack(`${name}: ${r.outcome || r.total}. It goes with your next move.`); }
  };

  // ---- the oracle ----
  const [oq, setOq] = useState('');
  const [odds, setOdds] = useState('50/50');
  const [oAns, setOAns] = useState(null);
  const ask = async () => {
    if (!oq.trim()) return;
    dndAudio.playSfx('oracle_whisper');
    try { const d = await api('/oracle', { method: 'POST', body: { question: oq.trim(), odds } }); setOAns(d.result); } catch (e) { err(e); }
  };

  const toggleSound = async () => {
    if (sounds.on) { sounds.stop(); return; }
    const t = (follow && sceneTrack) || sounds.track || (await loadCatalogue()).find((x) => x.genres.includes('fantasy'));
    if (t) sounds.play(t); else snack('The soundscapes couldn’t be reached just now.', { error: true });
  };

  const [askOpen, setAskOpen] = useState(false);
  const [askQ, setAskQ] = useState('');
  const [talk, setTalk] = useState([]);
  const [askMood, setAskMood] = useState(null);
  const askDm = async (q = askQ) => {
    const question = String(q || '').trim();
    if (!question || !c) return;
    setAskQ(''); setBusy('ask');
    setTalk((t) => [...t, { q: question }]);
    try {
      const d = await api(`/campaigns/${c.id}/ask`, { method: 'POST', body: { question } });
      setTalk((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a: d.answer, sources: d.sources } : x)));
      setAskMood(d.mood);
      if (autoRead) narrator.play(`ask-${Date.now()}`, d.answer);
    } catch (e) { err(e); setTalk((t) => t.slice(0, -1)); } finally { setBusy(''); }
  };
  const noGames = campaigns && !campaigns.length;
  const shownRoom = noGames && (room === 'play' || room === 'hero' || room === 'chronicle') ? 'games' : room;

  // ---- the side column (condensed Rindewind, hero vitals & attributes, 3D dice tray, collapsible oracle) ----
  const side = (
    <aside className="imsd-side">
      <section className="imsm-card imsd-dm">
        <div className="face">
          <ChroniclerFace face={{ emotion: mood }} status={narrator.playing ? 'speaking' : busy === 'turn' ? 'thinking' : 'idle'} levelRef={narrator.level} width={68} />
        </div>
        <div className="who">
          <div className="imsm-row" style={{ justifyContent: 'space-between', alignItems: 'baseline', width: '100%' }}>
            <div>
              <span className="imsd-kicker">Chronicler &amp; DM</span>
              <h3>Rindewind</h3>
            </div>
            <Btn kind="text" icon="chat" onClick={() => setAskOpen(true)}>Ask</Btn>
          </div>
          <span className="muted">{busy === 'turn' ? 'Writing your fate into the vellum...' : narrator.waiting ? 'Clearing his throat...' : narrator.playing ? 'Reading aloud...' : state.situation || 'Your Dungeon Master'}</span>
          <div className="imsm-row" style={{ gap: '4px' }}>
            <FilterChip on={autoRead} onClick={() => { const v = !autoRead; setAutoRead(v); try { localStorage.setItem('dnd_autoread', v ? '1' : '0'); } catch { /* ignore */ } }} lead={<Icon n="mic" size={14} />}>Reads turn</FilterChip>
            <FilterChip on={sounds.on} onClick={toggleSound} lead={<Icon n="music" size={14} />}>{sounds.on && sounds.track ? (sounds.track.title.length > 12 ? `${sounds.track.title.slice(0, 11)}…` : sounds.track.title) : 'Soundscape'}</FilterChip>
            <IconButton icon="tune" label="Choose a soundscape" onClick={() => setSoundOpen(true)} />
          </div>
        </div>
      </section>

      {hero && (
        <section className="imsm-card imsd-mini">
          <div className="imsm-row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ minWidth: 0 }}>
              <h3><Icon n="person" size={18} />{hero.name}</h3>
              <span className="muted" style={{ fontSize: '13px' }}>{hero.role_or_class} · Lv.{hero.level} · {profile.defence_label || 'AC'} {hero.ac}</span>
            </div>
            <div className="imsm-row" style={{ gap: '4px' }}>
              <Btn kind="text" onClick={() => setRoom('hero')}>Full sheet</Btn>
            </div>
          </div>

          <div className="imsm-row" style={{ alignItems: 'center', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <HpBar hp={hero.hp} max={hero.max_hp} label={profile.hp_label || 'HP'} />
            </div>
            <div className="imsm-row" style={{ gap: '2px', flex: 'none' }}>
              <IconButton icon="remove" label="Take damage" onClick={() => setHp(-1)} />
              <IconButton icon="add" label="Heal" onClick={() => setHp(1)} />
            </div>
          </div>

          {/* Interactive Character Attributes Pills: Tap any attribute to roll a check */}
          {hero.attributes && Object.keys(hero.attributes).length > 0 && (
            <div className="imsd-statpills">
              {Object.entries(hero.attributes).map(([k, v]) => {
                const chk = checkFor(profile, v);
                const modStr = chk.mod != null ? (chk.mod >= 0 ? `+${chk.mod}` : `${chk.mod}`) : (chk.under != null ? `<${chk.under}` : '');
                return (
                  <button key={k} type="button" className="imsd-statpill sl" onClick={() => rollStat(k, v)} title={`Roll a ${k} check`}>
                    <span className="k">{k}</span>
                    <b className="v">{v}</b>
                    {modStr && <small className="m">{modStr}</small>}
                  </button>
                );
              })}
            </div>
          )}

          {(hero.trackers || []).slice(0, 2).map((t) => <Tracker key={t.name} t={t} small />)}
          {(hero.progress || []).filter((p) => !p.done).slice(0, 1).map((p) => <ProgressTrack key={p.name} p={p} onMark={markProgress} onRoll={rollProgress} />)}
        </section>
      )}

      <section className="imsm-card imsd-dice">
        <div className="imsm-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3><Icon n="dice" size={18} />The dice tray</h3>
          {result && <Btn kind="text" icon="add" onClick={() => { setRoll(result); snack('That roll goes with your next move.'); }}>Use with move</Btn>}
        </div>
        <div className="imsd-traywrap">
          <DiceTray ref={tray} dark={dark} height={135} onKnock={(s) => dndAudio.knock(s)} />
          {result && !rolling && (
            <div className={`imsd-result ${result.isCrit ? 'crit' : result.isFumble ? 'fumble' : ''}`}>
              <b className="num">{result.total}</b>
              {result.outcome ? <span>{result.outcome}{result.label ? ` · ${result.label}` : ''}</span> : <span>{result.label || result.formula}{result.dc ? ` · ${result.under ? 'needs' : 'DC'} ${result.dc}` : ''}{result.success === true ? ' · success' : result.success === false ? ' · failure' : ''}{result.isCrit ? ' · nat 20!' : result.isFumble ? ' · nat 1' : ''}</span>}
            </div>
          )}
          {!result && !rolling && <div className="imsd-hint">Pick dice and roll</div>}
        </div>
        <div className="imsd-diepick">{DICE.map((d) => <button key={d} type="button" className={`sl ${tray_.die === d ? 'on' : ''}`} onClick={() => setTraySpec((t) => ({ ...t, die: d, adv: d === 'd20' ? t.adv : 'none' }))}>{d}</button>)}</div>
        <div className="imsd-diectl">
          <span className="stepper"><IconButton icon="remove" label="One die fewer" disabled={tray_.count <= 1} onClick={() => setTraySpec((t) => ({ ...t, count: t.count - 1 }))} /><b className="num">{tray_.count}×</b><IconButton icon="add" label="One more die" disabled={tray_.count >= 6} onClick={() => setTraySpec((t) => ({ ...t, count: t.count + 1 }))} /></span>
          <span className="stepper"><IconButton icon="remove" label="Lower the modifier" onClick={() => setTraySpec((t) => ({ ...t, mod: t.mod - 1 }))} /><b className="num">{sign(tray_.mod) || '±0'}</b><IconButton icon="add" label="Raise the modifier" onClick={() => setTraySpec((t) => ({ ...t, mod: t.mod + 1 }))} /></span>
          {tray_.die === 'd20' && tray_.count === 1 && <Segmented label="Advantage" value={tray_.adv} onChange={(v) => setTraySpec((t) => ({ ...t, adv: v }))} options={[['dis', 'Dis'], ['none', 'Normal'], ['adv', 'Adv']]} />}
        </div>
        <Btn icon="dice" busy={rolling} wide onClick={() => throwDice(tray_)}>Roll {tray_.count}{tray_.die}{sign(tray_.mod)}{tray_.adv === 'adv' ? ' with adv' : tray_.adv === 'dis' ? ' with dis' : ''}</Btn>
      </section>

      <details className="imsm-card imsd-oracle-fold">
        <summary className="imsd-oracle-sum">
          <div className="imsm-row" style={{ gap: '8px', alignItems: 'center' }}>
            <Icon n="eye" size={18} />
            <h3>Ask fate</h3>
            {oAns && <span className={`tag imsd-fate-tag ${/^Yes/.test(oAns.outcome) ? 'yes' : 'no'}`}>{oAns.outcome}</span>}
          </div>
          <Icon n="down" size={18} className="arrow" />
        </summary>
        <div className="imsd-oracle-body">
          <TextField label="A yes or no question" value={oq} onChange={setOq} onKeyDown={(e) => { if (e.key === 'Enter') ask(); }} />
          <SelectField label="How likely?" value={odds} onChange={setOdds} options={ODDS} />
          <div className="imsm-row">
            <Btn kind="tonal" icon="eye" disabled={!oq.trim()} onClick={ask}>Ask</Btn>
            {oAns && <Btn kind="text" icon="add" onClick={() => { setOracle(oAns); snack('Fate’s answer goes with your next move.'); }}>Use with move</Btn>}
          </div>
          {oAns && <div className={`imsd-fate ${/^Yes/.test(oAns.outcome) ? 'yes' : 'no'}`}><b>{oAns.outcome}</b><small>d20 rolled {oAns.roll}, needed {oAns.target} · {oAns.odds}</small></div>}
        </div>
      </details>
    </aside>
  );

  return (
    <>
      <div className="imsm-ptabs"><div className="chips">{ROOMS.map(([k, l, ic]) => <FilterChip key={k} on={shownRoom === k} onClick={() => setRoom(k)} lead={<Icon n={ic} size={18} />}>{l}</FilterChip>)}</div></div>

      {campaigns === null && <div className="imsm-empty"><Spinner /></div>}

      {shownRoom === 'play' && c && (
        <div className="imsd-play">
          <div className="imsd-story">
            <section className="imsm-card imsd-camp">
              <div className="imsm-row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                <div style={{ minWidth: 0 }}>
                  <span className="imsd-kicker">{c.ruleset_name || ruleset?.name} · turn {c.turn_count}</span>
                  <h2>{c.title}</h2>
                </div>
                <span className="imsm-row" style={{ flexWrap: 'nowrap' }}>
                  <IconButton icon="back" label="Take back the last turn" disabled={!last || last.turn_number === 0 || Boolean(busy)} onClick={() => setConfirm({ title: 'Take back the last turn?', body: 'Rindewind forgets it, your sheet goes back to how it was, and your words come back to change.', okLabel: 'Take it back', onOk: undo })} />
                  <IconButton icon="more" label="Campaigns" onClick={campaignMenu.show} />
                </span>
              </div>
              {c.setting && <p className="muted" style={{ margin: 0 }}>{c.setting}</p>}
            </section>

            <div className="imsd-book">
              {turns.map((t, i) => <Turn key={t.id} t={t} hero={hero} profile={profile} first={i === 0} narrator={narrator} onPage={setPage} />)}
              {busy === 'turn' && <div className="imsd-writing"><Spinner size={22} /><span>Rindewind dips his quill...</span></div>}
              <div ref={storyEnd} />
            </div>

            <section className="imsm-card imsd-compose">
              {state.check?.needed && !busy && (
                <div className="imsd-check">
                  <span className="ic" aria-hidden="true"><Icon n="dice" size={22} /></span>
                  <span className="txt"><span className="imsd-kicker">A test is called for</span><b>{state.check.label}{state.check.dc ? ` · DC ${state.check.dc}` : ''}</b><small>{state.check.why || 'Rindewind asks for a check.'}{state.check.attribute ? ` Uses ${state.check.attribute}.` : ''}</small></span>
                  <Btn icon="dice" busy={rolling} onClick={() => rollCheck(state.check)}>Roll it</Btn>
                </div>
              )}
              {!!profile.moves?.length && !busy && (
                <details className="imsd-moves">
                  <summary><Icon n="bolt" size={18} /><span>Moves</span><small>{profile.moves.length}</small><Icon n="down" size={20} /></summary>
                  <div className="list">{profile.moves.map((m) => (
                    <button key={m.name} type="button" className="sl" onClick={() => doMove(m)} title={m.trigger || m.name}>
                      <b>{m.name}</b><small>{m.stat ? `+${m.stat}` : ''}{m.page ? ` · p.${m.page}` : ''}</small>
                    </button>
                  ))}</div>
                </details>
              )}
              {moveAsk && (
                <div className="imsd-check">
                  <span className="ic" aria-hidden="true"><Icon n="bolt" size={22} /></span>
                  <span className="txt"><span className="imsd-kicker">{moveAsk.move.name}</span><b>{moveAsk.progress ? 'Which track?' : 'Roll with which stat?'}</b><small>{moveAsk.move.trigger}</small></span>
                  <span className="imsm-row">
                    {moveAsk.progress
                      ? (hero?.progress || []).filter((p) => !p.done).map((p) => <Btn key={p.name} kind="tonal" onClick={() => { setMoveAsk(null); rollProgress(p); }}>{p.name}</Btn>)
                      : moveAsk.stats.map((st) => <Btn key={st} kind="tonal" onClick={() => doMove(moveAsk.move, st)}>{st}</Btn>)}
                    <IconButton icon="close" label="Never mind" onClick={() => setMoveAsk(null)} />
                  </span>
                </div>
              )}
              {!!state.options?.length && !busy && (
                <div className="imsd-options">{state.options.map((o, i) => <button key={o} type="button" className="sl" onClick={() => send(o)}><span className="n">{['I', 'II', 'III', 'IV'][i]}</span><span className="o">{o}</span></button>)}</div>
              )}
              {(roll || oracle) && (
                <div className="imsm-row">
                  {roll && <span className="imsd-attach"><RollBadge r={roll} /><IconButton icon="close" label="Take the roll off" onClick={() => setRoll(null)} /></span>}
                  {oracle && <span className="imsd-attach"><span className="tag imsd-oracle"><Icon n="eye" size={16} />{oracle.outcome}</span><IconButton icon="close" label="Take fate's answer off" onClick={() => setOracle(null)} /></span>}
                </div>
              )}
              <div className="imsd-say">
                <TextArea label={`What does ${hero?.name || 'your hero'} do?`} rows={1} value={input} onChange={setInput}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} />
                <Btn icon="send" busy={busy === 'turn'} disabled={!input.trim() || Boolean(busy)} onClick={() => send(input)}>Do it</Btn>
              </div>
            </section>
          </div>
          {side}
        </div>
      )}

      {shownRoom === 'hero' && hero && <HeroRoom hero={hero} profile={profile} onRoll={rollStat} onHp={setHp} onSave={saveHero} onProgressRoll={(p) => { setRoom('play'); rollProgress(p); }} />}

      {shownRoom === 'chronicle' && c && (
        <div className="imsd-chron">
          <section className="imsm-card imsd-chronhead">
            <span className="imsd-kicker">The chronicle of</span>
            <h2>{c.title}</h2>
            <p className="muted" style={{ margin: 0 }}>Rindewind sets the tale down as a book - a chapter for every six turns, each with its plate, and he'll read any of it aloud. Open it, turn the pages, or edit a chapter by hand.</p>
            {chron?.writing && <div className="imsm-banner info"><Spinner size={20} /><span>Rindewind is writing{chron.stale?.length ? ` chapter ${chron.stale.join(', ')}` : ''}...</span></div>}
          </section>
          <div className="rpb-legacy imsd-bookwrap">
            {chron?.order?.length ? <Chronicle c={bookC} chron={chron} toast={(m) => snack(m)} apiBase={`/api/dnd/campaigns/${c.id}`} /> : <Empty icon="book" title="Not a word yet">The first chapter is written once the tale begins.</Empty>}
          </div>
          {c.story_so_far && (
            <details className="imsm-fold"><summary><Icon n="note" size={20} /><span>The story so far, in brief (what Rindewind remembers)</span><Icon n="down" size={22} /></summary><p className="imsd-sofar">{c.story_so_far}</p></details>
          )}
        </div>
      )}

      {shownRoom === 'rules' && <RulesRoom ruleset={ruleset} rulesets={rulesets} onPage={setPage} onStudied={loadLists} err={err} snack={snack} isOwner={isOwner} />}

      {shownRoom === 'games' && <GamesRoom isOwner={isOwner} rulesets={rulesets} campaigns={campaigns || []} onOpen={(id) => { setCid(id); setRoom('play'); }} onStart={(r) => { setNewFor(r?.id || null); setNewOpen(true); }} onRefresh={loadLists} err={err} snack={snack} />}

      <NewAdventure open={newOpen} rulesets={rulesets} initial={newFor} onClose={() => setNewOpen(false)} err={err}
        onStarted={(camp) => { setNewOpen(false); setC(camp); setCid(camp.id); setRoom('play'); loadLists(); dndAudio.playSfx('spell_cast'); if (autoRead && camp.turns?.[0]) narrator.play(camp.turns[0].id); }} />
      {c && shownRoom !== 'play' && (
        <button type="button" className="imsd-dock sl" onClick={() => setAskOpen(true)} title="Ask Rindewind anything - a recap, a rule, some advice">
          <span className="face"><ChroniclerFace face={{ emotion: askMood || mood }} status={narrator.playing ? 'speaking' : busy === 'ask' ? 'thinking' : 'idle'} levelRef={narrator.level} width={64} /></span>
          <span className="txt"><span className="imsd-kicker">Rindewind</span><b>Ask me anything</b></span>
        </button>
      )}
      <Sheet open={askOpen} onClose={() => setAskOpen(false)} title="Across the table with Rindewind" wideWidth="680px"
        footer={<div className="imsd-say" style={{ width: '100%' }}><TextField label="Ask him - a recap, a rule, advice" value={askQ} onChange={setAskQ} onKeyDown={(e) => { if (e.key === 'Enter') askDm(); }} /><Btn icon="send" busy={busy === 'ask'} disabled={!askQ.trim() || Boolean(busy)} onClick={() => askDm()}>Ask</Btn></div>}>
        <div className="imsd-talk">
          <div className="who"><span className="face"><ChroniclerFace face={{ emotion: askMood || 'neutral' }} status={narrator.playing ? 'speaking' : busy === 'ask' ? 'thinking' : 'idle'} levelRef={narrator.level} width={96} /></span>
            <p>Out of the story for a moment, then. Ask me what has happened so far, how a rule works, or what I'd do in your boots - I'll not spoil what's hidden.</p></div>
          {!talk.length && <div className="imsd-hooks">{['What has happened so far?', 'What do I know about the dangers here?', 'How does combat work in this game?', 'What would you do now?'].map((q) => <button key={q} type="button" className="sl" onClick={() => askDm(q)}>{q}</button>)}</div>}
          {talk.map((x, i) => (
            <div key={i} className="imsd-qa">
              <p className="q">{x.q}</p>
              {x.a ? <div className="a"><p>{x.a}</p><div className="imsm-row"><Sources list={x.sources} onOpen={setPage} /><span className="grow" /><IconButton icon={narrator.playing === `a${i}` ? 'stop' : 'play'} label="Hear him say it" className={narrator.waiting === `a${i}` ? 'spinning' : ''} onClick={() => (narrator.playing === `a${i}` ? narrator.stop() : narrator.play(`a${i}`, x.a))} /></div></div>
                : <div className="a wait"><Spinner size={18} /><span>He strokes his beard...</span></div>}
            </div>
          ))}
        </div>
      </Sheet>
      <PageSheet page={page} onClose={() => setPage(null)} />
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      <Menu anchor={campaignMenu.anchor} open={campaignMenu.open} onClose={campaignMenu.close} items={[
        ...(campaigns || []).map((x) => ({ label: `${x.title}${x.character_name ? ` · ${x.character_name}` : ''}`, icon: x.id === cid ? 'check' : 'blank', selected: x.id === cid, onClick: () => setCid(x.id) })),
        { label: 'A new adventure', icon: 'add', onClick: () => { setNewFor(null); setNewOpen(true); } },
        c && { label: 'Delete this campaign', icon: 'del', onClick: () => setConfirm({ title: `Delete “${c.title}”?`, body: 'The story and its hero are deleted. That can’t be undone.', okLabel: 'Delete', danger: true, onOk: removeCampaign }) },
      ].filter(Boolean)} />
      <SoundscapePicker open={soundOpen} onClose={() => setSoundOpen(false)} current={sounds.on ? sounds.track : null}
        onPick={(t) => { sounds.play(t); setFollow(false); try { localStorage.setItem('dnd_sound_follow', '0'); } catch { /* ignore */ } }}
        follow={follow} onFollow={(v) => { setFollow(v); try { localStorage.setItem('dnd_sound_follow', v ? '1' : '0'); } catch { /* ignore */ } if (v && sceneTrack) sounds.play(sceneTrack); }}
        vol={sounds.vol} onVol={sounds.setVolume} />
    </>
  );
}

// ---- Hero ---------------------------------------------------------------------------------------------------------------
function HeroRoom({ hero, profile, onRoll, onHp, onSave, onProgressRoll }) {
  const [newVow, setNewVow] = useState({ name: '', rank: 'dangerous' });
  const saveProgress = (list) => onSave({ progress: list });
  const setTracker = (name, value) => onSave({ trackers: hero.trackers.map((t) => (t.name === name ? { ...t, value } : t)) });
  const [item, setItem] = useState('');
  const [notes, setNotes] = useState(hero.notes || '');
  useEffect(() => { setNotes(hero.notes || ''); }, [hero.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const check = (v) => {
    if (profile.resolution === 'ironsworn') return `action d6+${v}`;
    if (profile.resolution === 'd6-pool') return `${v}d6 pool`;
    const h = checkFor(profile, v);
    return h.under != null ? `roll under ${h.under}` : `${h.dice}${sign(h.mod)}`;
  };
  return (
    <div className="imsd-hero">
      <section className="imsm-card imsd-herohead">
        <span className="imsd-kicker">{hero.role_or_class} · level {hero.level}</span>
        <h2>{hero.name}</h2>
        <HpBar hp={hero.hp} max={hero.max_hp} label={profile.hp_label || 'HP'} />
        <div className="imsm-row">
          {[-5, -1].map((d) => <Btn key={d} kind="tonal" onClick={() => onHp(d)}>{d}</Btn>)}
          {[1, 5].map((d) => <Btn key={d} kind="tonal" onClick={() => onHp(d)}>+{d}</Btn>)}
          <Btn kind="text" icon="sync" onClick={() => onHp(hero.max_hp)}>Full rest</Btn>
        </div>
        <div className="imsm-stats four">
          {[[profile.defence_label || 'AC', hero.ac], ['Level', hero.level], ['Kit', (hero.inventory || []).length], ['Abilities', (hero.spells_or_skills || []).length]].map(([k, v]) => <div key={k} className="imsm-stat"><span className="k">{k}</span><b>{v}</b></div>)}
        </div>
      </section>
      {!!(hero.trackers || []).length && (
        <section className="imsm-card">
          <h3><Icon n="chart" size={20} />Trackers</h3>
          {hero.trackers.map((t) => <Tracker key={t.name} t={t} onChange={(v) => setTracker(t.name, v)} />)}
        </section>
      )}
      {(profile.resolution === 'ironsworn' || (hero.progress || []).length > 0) && (
        <section className="imsm-card">
          <h3><Icon n="flag" size={20} />Vows and progress</h3>
          {(hero.progress || []).map((p) => (
            <ProgressTrack key={p.name} p={p}
              onMark={() => saveProgress(hero.progress.map((x) => (x.name === p.name ? { ...x, ticks: Math.min(40, (x.ticks || 0) + (RANKS[x.rank] || 4)) } : x)))}
              onRoll={onProgressRoll} />
          ))}
          <div className="imsd-say">
            <TextField label="Swear a new vow (or start a journey)" value={newVow.name} onChange={(v) => setNewVow((n) => ({ ...n, name: v }))} />
            <SelectField label="Rank" value={newVow.rank} onChange={(v) => setNewVow((n) => ({ ...n, rank: v }))} options={Object.keys(RANKS)} />
            <Btn kind="tonal" icon="add" disabled={!newVow.name.trim()} onClick={() => { saveProgress([...(hero.progress || []), { name: newVow.name.trim(), rank: newVow.rank, ticks: 0 }]); setNewVow({ name: '', rank: 'dangerous' }); }}>Add</Btn>
          </div>
        </section>
      )}
      <section className="imsm-card">
        <h3><Icon n="dice" size={20} />Attributes <small className="muted">tap one to roll a check</small></h3>
        <div className="imsd-stats">
          {Object.entries(hero.attributes || {}).map(([k, v]) => (
            <button key={k} type="button" className="sl" onClick={() => onRoll(k, v)}><span>{k}</span><b className="num">{v}</b><small>{check(v)}</small></button>
          ))}
        </div>
      </section>
      <section className="imsm-card">
        <h3><Icon n="bolt" size={20} />Skills and abilities</h3>
        <div className="imsm-row">{(hero.spells_or_skills || []).map((s) => <span key={s} className="tag">{s}</span>)}{!(hero.spells_or_skills || []).length && <span className="muted">None yet.</span>}</div>
      </section>
      <section className="imsm-card">
        <h3><Icon n="archive" size={20} />Kit</h3>
        <div className="imsd-kit">
          {(hero.inventory || []).map((it, i) => (
            <div key={`${it}-${i}`}><span>{it}</span><IconButton icon="del" label={`Drop ${it}`} onClick={() => onSave({ inventory: hero.inventory.filter((_, j) => j !== i) })} /></div>
          ))}
        </div>
        <div className="imsd-say"><TextField label="Add something" value={item} onChange={setItem} onKeyDown={(e) => { if (e.key === 'Enter' && item.trim()) { onSave({ inventory: [...hero.inventory, item.trim()] }); setItem(''); } }} />
          <Btn kind="tonal" icon="add" disabled={!item.trim()} onClick={() => { onSave({ inventory: [...hero.inventory, item.trim()] }); setItem(''); }}>Add</Btn></div>
      </section>
      <section className="imsm-card">
        <h3><Icon n="note" size={20} />Backstory and notes</h3>
        <TextArea label="Rindewind reads these every turn" rows={5} value={notes} onChange={setNotes} onBlur={() => { if (notes !== (hero.notes || '')) onSave({ notes }); }} />
      </section>
    </div>
  );
}

// ---- Rulebooks --------------------------------------------------------------------------------------------------------
function RulesRoom({ ruleset, rulesets, onPage, onStudied, err, snack, isOwner }) {
  const [pickId, setPickId] = useState(ruleset?.id || rulesets[0]?.id || '');
  useEffect(() => { if (ruleset?.id) setPickId(ruleset.id); }, [ruleset?.id]);
  const r = rulesets.find((x) => x.id === pickId);
  const p = r?.metadata || {};
  const [books, setBooks] = useState([]);
  const [q, setQ] = useState('');
  const [ans, setAns] = useState(null);
  const [busy, setBusy] = useState('');
  useEffect(() => { setAns(null); if (pickId) api(`/rulesets/${pickId}/books`).then((d) => setBooks(d.books || [])).catch(() => setBooks([])); }, [pickId]);
  const askIt = async () => {
    setBusy('ask');
    try { setAns(await api(`/rulesets/${pickId}/ask`, { method: 'POST', body: { question: q } })); } catch (e) { err(e); } finally { setBusy(''); }
  };
  const study = async () => {
    setBusy('study');
    try { await api(`/rulesets/${pickId}/study`, { method: 'POST' }); snack(`Rindewind has read ${r.name} again.`); onStudied(); } catch (e) { err(e); } finally { setBusy(''); }
  };
  if (!r) return <Empty icon="doc" title="No games yet">Find the games in your library first (Games).</Empty>;
  return (
    <div className="imsd-rules">
      <div className="imsm-row"><SelectField label="Game" value={pickId} onChange={setPickId} options={rulesets.map((x) => [x.id, x.name])} /></div>
      <section className="imsm-card imsd-gamehead">
        <span className="imsd-kicker">{p.genre || r.genre}</span>
        <h2>{p.name || r.name}</h2>
        {p.tagline && <p className="imsd-tagline">{p.tagline}</p>}
        <div className="imsm-row">
          <span className={`tag ${p.grounded ? 'good' : 'warn'}`}>{p.grounded ? 'Read from your books' : p.studied_at ? 'From memory - its books aren’t indexed yet' : 'Rindewind hasn’t read its books yet'}</span>
          {p.solo && <span className="tag">{p.solo}</span>}
          {(p.dice_system || r.dice_system) && <span className="tag"><Icon n="dice" size={15} />{p.dice_system || r.dice_system}</span>}
          <span className="grow" />
          {isOwner && <Btn kind="text" icon="sync" busy={busy === 'study'} onClick={study}>{p.studied_at ? 'Read its books again' : 'Read its books'}</Btn>}
        </div>
        {p.description && <p style={{ margin: 0 }}>{p.description}</p>}
      </section>
      <section className="imsm-card imsd-ask">
        <h3><Icon n="chat" size={20} />Ask the rulebook</h3>
        <div className="imsd-say"><TextField label="A rules question" value={q} onChange={setQ} onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) askIt(); }} />
          <Btn icon="search" busy={busy === 'ask'} disabled={!q.trim()} onClick={askIt}>Ask</Btn></div>
        {ans && <div className="imsd-answer"><p>{ans.answer}</p><div className="imsm-row"><Sources list={ans.sources} onOpen={onPage} /></div></div>}
      </section>
      <div className="imsd-facts">
        {[['How actions resolve', p.core_mechanic, 'dice'], ['Playing it solo', p.solo_play, 'person'], ['Making a hero', p.character_creation, 'edit']].filter(([, v]) => v).map(([k, v, ic]) => (
          <section key={k} className="imsm-card"><h3><Icon n={ic} size={20} />{k}</h3><p style={{ margin: 0 }}>{v}</p></section>
        ))}
      </div>
      {!!p.moves?.length && (
        <section className="imsm-card"><h3><Icon n="bolt" size={20} />Its moves</h3>
          <div className="imsd-tables">{p.moves.map((m) => {
            const core = (p.files || []).find((f) => f.core);
            const src = core && m.page ? { id: core.id, book: core.filename.replace(/\.pdf$/i, ''), page: m.page } : null;
            return <button key={m.name} type="button" className="sl" disabled={!src} onClick={() => src && onPage(src)} title={m.trigger}><b>{m.name}</b><small>{m.stat ? `+${m.stat}` : ''}{m.page ? ` · p.${m.page}` : ''}</small></button>;
          })}</div>
        </section>
      )}
      {!!p.tables?.length && (
        <section className="imsm-card"><h3><Icon n="list" size={20} />Its random tables</h3>
          <div className="imsd-tables">{p.tables.map((t) => {
            const src = books[0] && t.page ? { id: (books.find((b) => b.id === (p.files || []).find((f) => f.core)?.id) || books[0]).id, book: (books.find((b) => b.id === (p.files || []).find((f) => f.core)?.id) || books[0]).filename.replace(/\.pdf$/i, ''), page: t.page } : null;
            return <button key={t.name} type="button" className="sl" disabled={!src} onClick={() => src && onPage(src)}><b>{t.name}</b><small>{t.dice || ''}{t.page ? ` · p.${t.page}` : ''}</small></button>;
          })}</div>
        </section>
      )}
      {!!p.sources?.length && <section className="imsm-card"><h3><Icon n="doc" size={20} />Pages Rindewind studied</h3><div className="imsm-row"><Sources list={p.sources} onOpen={onPage} /></div></section>}
      <section className="imsm-card"><h3><Icon n="book" size={20} />Its books in your library</h3>
        {books.length ? <div className="imsm-list">{books.map((b) => (
          <div key={b.id} className="imsm-item sl tappable" role="button" tabIndex={0} onClick={() => onPage({ id: b.id, book: b.filename.replace(/\.pdf$/i, ''), page: 1 })}>
            <span className="lead"><Icon n="doc" size={22} /></span>
            <span className="txt"><b>{b.filename.replace(/\.pdf$/i, '')}</b><span className="meta">{b.pages ? `${b.pages} pages` : ''}</span><span className="tags">{(p.files || []).find((f) => f.id === b.id)?.role && <span className="tag">{(p.files || []).find((f) => f.id === b.id).role}</span>}<span className={`tag ${b.indexed === 1 ? 'good' : 'warn'}`}>{b.indexed === 1 ? 'Indexed' : 'Not indexed yet'}</span></span></span>
          </div>
        ))}</div> : <p className="muted" style={{ margin: 0 }}>None found in the library index yet - Games › Find the games in my library.</p>}
      </section>
      {!!p.maps?.length && (
        <section className="imsm-card"><h3><Icon n="image" size={20} />Maps</h3>
          <div className="imsd-maps">{p.maps.slice(0, 12).map((m) => <a key={m.path} href={`/api/dnd/asset?path=${encodeURIComponent(m.path)}`} target="_blank" rel="noreferrer"><img src={`/api/dnd/asset?path=${encodeURIComponent(m.path)}`} alt={m.filename} loading="lazy" /></a>)}</div>
        </section>
      )}
    </div>
  );
}

// ---- Games ------------------------------------------------------------------------------------------------------------
function GamesRoom({ rulesets, campaigns, onOpen, onStart, onRefresh, err, snack, isOwner }) {
  const [st, setSt] = useState(null);
  const poll = useRef(0);
  const check = useCallback(async () => {
    try {
      const d = await api('/discover');
      setSt(d);
      if (d.status.active) poll.current = window.setTimeout(check, 3000);
      else if (poll.current) { poll.current = 0; onRefresh(); }
    } catch { /* quiet */ }
  }, [onRefresh]);
  useEffect(() => { check(); return () => window.clearTimeout(poll.current); }, [check]);
  const discover = async (restudy) => {
    try { await api('/discover', { method: 'POST', body: { restudy } }); poll.current = 1; snack('Rindewind is reading your library.'); check(); } catch (e) { err(e); }
  };
  const s = st?.status;
  const sorted = [...rulesets].sort((a, b) => (b.metadata?.studied_at ? 1 : 0) - (a.metadata?.studied_at ? 1 : 0) || a.name.localeCompare(b.name));
  return (
    <>
      {!!campaigns.length && (
        <>
          <h2 className="imsa-h2">Your adventures</h2>
          <div className="imsd-camps">
            {campaigns.map((x) => (
              <button key={x.id} type="button" className="imsd-campcard sl" onClick={() => onOpen(x.id)}>
                <span className="imsd-kicker">{x.ruleset_name || x.ruleset_id} · turn {x.turn_count}</span>
                <b>{x.title}</b>
                <span className="muted">{x.character_name}{x.character_class ? `, ${x.character_class}` : ''}</span>
                {x.max_hp ? <HpBar hp={x.hp} max={x.max_hp} /> : null}
                {x.current_scene && <small>{x.current_scene}</small>}
              </button>
            ))}
          </div>
        </>
      )}
      <section className="imsm-card imsd-discover">
        <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
          <h3><Icon n="book" size={20} />Games from your library</h3>
          {isOwner && <span className="imsm-row"><Btn kind="tonal" icon="search" busy={s?.active} onClick={() => discover(false)}>Find the games in my library</Btn>{!s?.active && rulesets.some((r) => r.metadata?.studied_at) && <Btn kind="text" icon="sync" onClick={() => discover(true)}>Read them all again</Btn>}</span>}
        </div>
        <p className="muted" style={{ margin: 0 }}>Rindewind reads the books in the D&amp;D folder of the library ({st ? `${st.indexed} of ${st.books} indexed` : '...'}), sorts them into games - each with its expansions, settings and supplements - and studies each one: how it plays, how solo play works, how to make a hero, its trackers and tables. New books arrive with the library sync.</p>
        {s?.active && <div className="imsm-banner info"><Spinner size={20} /><span><b>{s.phase}</b>{s.total ? ` · ${s.done} of ${s.total}` : ''}{s.current ? ` · ${s.current}` : ''}<span className="imsm-prog"><i style={{ width: `${s.total ? (s.done / s.total) * 100 : 8}%` }} /></span></span></div>}
        {s?.error && <div className="imsm-banner"><Icon n="warn" size={20} /><span>{s.error}</span></div>}
      </section>
      <div className="imsd-games">
        {sorted.map((r) => {
          const p = r.metadata || {};
          return (
            <section key={r.id} className={`imsd-game cover-${[...r.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 6}`}>
              <span className="imsd-kicker">{p.genre || r.genre}</span>
              <h3 className="nm">{p.name || r.name}</h3>
              {p.tagline && <p className="imsd-tagline">{p.tagline}</p>}
              <p className="muted desc">{p.description || r.description}</p>
              <div className="imsm-row">
                {p.solo && <span className="tag">{p.solo}</span>}
                {(p.files?.length || r.books_count) ? <span className="tag"><Icon n="doc" size={15} />{p.files?.length || r.books_count} books</span> : null}
                {(p.files || []).filter((f) => ['expansion', 'setting'].includes(f.role)).length ? <span className="tag">{(p.files || []).filter((f) => ['expansion', 'setting'].includes(f.role)).length} expansions & settings</span> : null}
                <span className={`tag ${p.grounded ? 'good' : ''}`}>{p.grounded ? 'Read from your books' : p.studied_at ? 'Known from memory' : 'Not read yet'}</span>
              </div>
              <div className="imsm-row end"><Btn icon="play" onClick={() => onStart(r)}>Begin an adventure</Btn></div>
            </section>
          );
        })}
      </div>
    </>
  );
}

// ---- a new adventure ------------------------------------------------------------------------------------------------
function NewAdventure({ open, rulesets, initial, onClose, onStarted, err }) {
  const [rid, setRid] = useState('');
  const [title, setTitle] = useState('');
  const [premise, setPremise] = useState('');
  const [name, setName] = useState('');
  const [concept, setConcept] = useState('');
  const [hero, setHero] = useState(null);
  const [busy, setBusy] = useState('');
  const [books, setBooks] = useState([]);
  useEffect(() => { if (open) { setRid(initial || rulesets.find((r) => r.metadata?.studied_at)?.id || rulesets[0]?.id || ''); setHero(null); setTitle(''); setPremise(''); setBooks([]); } }, [open, initial]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = rulesets.find((x) => x.id === rid);
  const p = r?.metadata || {};
  const rollUp = async () => {
    setBusy('hero');
    try { setHero((await api(`/rulesets/${rid}/hero`, { method: 'POST', body: { name, concept } })).hero); dndAudio.playSfx('dice_roll'); } catch (e) { err(e); } finally { setBusy(''); }
  };
  const start = async () => {
    setBusy('start');
    try {
      const d = await api('/campaigns', { method: 'POST', body: { title: title.trim() || `${p.name || r?.name}: a solo tale`, rulesetId: rid, premise, books, characterName: name, character: hero ? { ...hero, name: hero.name || name } : (name ? { name } : undefined) } });
      onStarted(d.campaign);
    } catch (e) { err(e); } finally { setBusy(''); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="A new adventure" wideWidth="760px"
      footer={<div className="imsm-row end" style={{ width: '100%' }}><Btn kind="text" onClick={onClose}>Cancel</Btn><Btn icon="play" busy={busy === 'start'} disabled={!rid || Boolean(busy)} onClick={start}>{busy === 'start' ? 'Rindewind sets the scene' : 'Begin'}</Btn></div>}>
      <div className="imsm-form">
        <SelectField label="The game" value={rid} onChange={(v) => { setRid(v); setHero(null); setBooks([]); }} options={rulesets.map((x) => [x.id, x.name])} />
        {p.tagline && <p className="imsd-tagline" style={{ margin: 0 }}>{p.tagline}</p>}
        {(p.files || []).some((f) => f.role && !['core', 'sheet'].includes(f.role)) && (
          <>
            <h3 className="imsd-h3">The books in play</h3>
            <p className="muted" style={{ margin: 0 }}>The core rules are always in. Add any expansions, settings or supplements - a setting is the world the tale takes place in. Rindewind uses only the books you choose.</p>
            <div className="imsd-books">
              {p.files.filter((f) => f.role && !['core', 'sheet'].includes(f.role)).map((f) => {
                const on = books.includes(f.id);
                return (
                  <button key={f.id} type="button" className={`sl ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setBooks((b) => (on ? b.filter((x) => x !== f.id) : f.role === 'setting' ? [...b.filter((x) => p.files.find((g) => g.id === x)?.role !== 'setting'), f.id] : [...b, f.id]))}>
                    <Icon n={on ? 'boxon' : 'boxoff'} size={22} />
                    <span><b>{f.filename.replace(/\.pdf$/i, '').replace(/\s*\(\d+\)$/, '')}</b><small><span className="imsd-kicker">{f.role}</span>{f.adds || ''}</small></span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        <TextField label="The adventure's name (optional)" value={title} onChange={setTitle} />
        <TextArea label="How it begins (optional - or pick a hook below)" rows={3} value={premise} onChange={setPremise} />
        {!!p.premises?.length && <div className="imsd-hooks">{p.premises.map((h) => <button key={h} type="button" className={`sl ${premise === h ? 'on' : ''}`} onClick={() => setPremise(h)}>{h}</button>)}</div>}
        <h3 className="imsd-h3">Your hero</h3>
        <div className="imsa-three">
          <TextField label="Name (optional)" value={name} onChange={setName} />
          <TextField label="A concept (optional)" value={concept} onChange={setConcept} help="e.g. a disgraced knight, a scavenger with debts" />
        </div>
        <div className="imsm-row"><Btn kind="tonal" icon="dice" busy={busy === 'hero'} disabled={!rid || Boolean(busy)} onClick={rollUp}>{hero ? 'Roll up another' : 'Roll up a hero by the book'}</Btn>{!hero && <span className="muted">or begin with the game's ready-made hero{p.character_template?.role_or_class ? ` (${p.character_template.role_or_class})` : ''}</span>}</div>
        {hero && (
          <section className="imsm-card imsd-herocard">
            <span className="imsd-kicker">{hero.roleOrClass}</span>
            <h3 className="nm">{hero.name}</h3>
            <div className="imsm-row"><span className="tag">{p.hp_label || 'HP'} {hero.maxHp}</span><span className="tag">{p.defence_label || 'AC'} {hero.ac}</span></div>
            <div className="imsd-stats small">{Object.entries(hero.attributes || {}).map(([k, v]) => <div key={k}><span>{k}</span><b className="num">{v}</b></div>)}</div>
            <p style={{ margin: 0 }}>{hero.backstory}</p>
            <p className="muted" style={{ margin: 0 }}><b>Kit:</b> {(hero.inventory || []).join(', ')}</p>
            {hero.how && <p className="muted" style={{ margin: 0 }}><b>How:</b> {hero.how}</p>}
          </section>
        )}
      </div>
    </Sheet>
  );
}

// Inviting players (25 Oct 2026, Simon: "an invite feature ... so my son and Daniel can also use it"): the same guest
// list as the deck builder and Homebrew - an invited person signs in with Google (name and email only) at /ims/dnd and
// plays their own adventures.
function Invites({ open, onClose }) {
  const snack = useSnack();
  const [list, setList] = useState(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const d = await (await fetch('/api/homebrew/invites')).json(); setList(d.invites || []); } catch { setList([]); }
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);
  const link = `${window.location.origin}/ims/dnd`;
  const add = async () => {
    setBusy(true);
    try {
      const d = await (await fetch('/api/homebrew/invites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) })).json();
      if (!d.success) throw new Error(d.error || 'That didn’t work.');
      setEmail(''); load(); snack(`${d.invite?.email || 'They'} can come in now - send them the link.`);
    } catch (e) { snack(e.message, { error: true }); } finally { setBusy(false); }
  };
  const revoke = async (e) => { await fetch(`/api/homebrew/invites/${encodeURIComponent(e)}`, { method: 'DELETE' }); load(); };
  const live = (list || []).filter((x) => !x.revokedAt);
  return (
    <Sheet open={open} onClose={onClose} title="Invite players" wideWidth="640px">
      <div className="imsm-form">
        <p className="muted" style={{ margin: 0 }}>Anyone you invite signs in with their Google account (just their name and email) and plays their own adventures with Rindewind. The same invite opens the deck builder and Homebrew.</p>
        <div className="imsa-url"><Icon n="link" size={20} /><code>{link}</code><IconButton icon="copy" label="Copy the link" onClick={() => { navigator.clipboard?.writeText(link); snack('Link copied - send it to them.'); }} /></div>
        <div className="imsd-say"><TextField label="Their Google email" value={email} onChange={setEmail} type="email" onKeyDown={(e) => { if (e.key === 'Enter' && email.trim()) add(); }} />
          <Btn icon="add" busy={busy} disabled={!email.trim()} onClick={add}>Invite</Btn></div>
        <h3 className="imsd-h3">Invited</h3>
        {list === null ? <Spinner /> : live.length ? (
          <div className="imsm-list">{live.map((x) => (
            <div key={x.email} className="imsm-item">
              <span className="lead"><Icon n="person" size={22} /></span>
              <span className="txt"><b>{x.name || x.email}</b><span className="meta">{x.email}{x.lastSignInAt ? ` · last in ${new Date(x.lastSignInAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ' · not signed in yet'}</span></span>
              <span className="acts"><Btn kind="text" onClick={() => revoke(x.email)}>Remove</Btn></span>
            </div>
          ))}</div>
        ) : <p className="muted" style={{ margin: 0 }}>Nobody yet.</p>}
      </div>
    </Sheet>
  );
}

export default function DndSolo({ theme, onThemeToggle, setCurrentPath }) {
  const [isOwner, setIsOwner] = useState(false);
  const [invite, setInvite] = useState(false);
  useEffect(() => { api('/me').then((d) => setIsOwner(Boolean(d.isOwner))).catch(() => {}); }, []);
  return (
    <ServicePage title="D&D Solo" icon="dice" accent="brown" wide theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} rail="dash"
      actions={isOwner ? <IconButton icon="people" label="Invite players" onClick={() => setInvite(true)} /> : null}
      sub="Rindewind runs your solo games from your own rulebooks - roll the dice, ask fate, and he tells the tale.">
      <Body isOwner={isOwner} />
      {isOwner && <Invites open={invite} onClose={() => setInvite(false)} />}
    </ServicePage>
  );
}
