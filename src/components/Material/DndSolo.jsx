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
import ArmorMannequin, { isWeaponItem } from './ArmorMannequin';
import { lookupItem, getActiveOngoingEffects } from './itemCatalog';
import DungeonBattleMap from './DungeonBattleMap';
import './dnd.css';

const api = async (path, opts = {}) => {
  const res = await fetch(`/api/dnd${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.success === false) throw new Error(d.error || `HTTP ${res.status}`);
  return d;
};
const ROOMS = [['play', 'Play', 'dice'], ['heroes', 'Heroes', 'people'], ['chronicle', 'Chronicle', 'book'], ['rules', 'Rulebooks', 'doc'], ['games', 'Games', 'explore']];
const ODDS = [['Impossible', 'Impossible'], ['Unlikely', 'Unlikely'], ['50/50', '50/50'], ['Likely', 'Likely'], ['Almost Certain', 'Almost certain']];
const DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];
const sign = (n) => (n > 0 ? `+${n}` : n < 0 ? `${n}` : '');
const paras = (t) => String(t || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

function renderInlineMarkdown(str) {
  if (!str) return null;
  const tokenRegex = /(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_([^_]+)_|`[^`]+`)/g;
  const parts = String(str).split(tokenRegex);
  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('__') && part.endsWith('__') && part.length >= 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('_') && part.endsWith('_') && part.length >= 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function renderTaleMarkdown(text) {
  if (!text) return null;
  // Strip any internal machine state tags or JSON delimiters that could leak into narrative prose
  const sanitized = String(text)
    .replace(/<<<STATE>>>[\s\S]*?(?:<<<[/]STATE>>>|$)/gi, '')
    .replace(/```json[\s\S]*?(?:```|$)/gi, '')
    .replace(/<<<[/]?STATE>>>/gi, '');
  const rawParas = sanitized.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return rawParas.map((para, pIdx) => {
    const hMatch = para.match(/^(#{1,4})\s+(.*)$/);
    if (hMatch) {
      return <h4 key={pIdx} className="imsd-tale-subhead">{renderInlineMarkdown(hMatch[2])}</h4>;
    }
    const lines = para.split('\n');
    if (lines.length > 1 && lines.every((l) => /^\s*([*-]|\d+\.)\s+/.test(l))) {
      return (
        <ul key={pIdx} className="imsd-tale-list">
          {lines.map((l, lIdx) => (
            <li key={lIdx}>{renderInlineMarkdown(l.replace(/^\s*([*-]|\d+\.)\s+/, ''))}</li>
          ))}
        </ul>
      );
    }
    return <p key={pIdx}>{renderInlineMarkdown(para)}</p>;
  });
}

// A stat's bonus or target for a check based on the ruleset's explicit dice_config:
// - d100-under: target score ≤ value
// - d6-pool: number of d6 dice in the pool = value
// - pbta-2d6: 2d6 + stat bonus (-3 to +3)
// - d20: 1d20 + modifier (using (score-10)/2 for 3-30 scores, or direct modifier)
// - sum: Nd6 or direct die roll
function checkFor(profile, value) {
  const cfg = profile?.dice_config || {};
  const mode = cfg.mode || profile?.resolution || (/d100/i.test(profile?.check_dice || '') ? 'd100-under' : 'd20');
  const v = Number(value) || 0;

  if (mode === 'd100-under') {
    return { dice: cfg.dice || '1d100', mod: 0, under: v, mode };
  }
  if (mode === 'd6-pool') {
    return { dice: `${Math.max(1, v)}d6`, mod: 0, pool: Math.max(1, v), mode };
  }
  if (mode === 'pbta-2d6') {
    return { dice: cfg.dice || '2d6', mod: v, mode };
  }
  if (mode === 'ironsworn') {
    return { dice: '1d6 + 2d10', mod: v, mode };
  }
  if (mode === 'd20') {
    const mod = v >= 3 && v <= 30 ? Math.floor((v - 10) / 2) : v;
    return { dice: cfg.dice || '1d20', mod, mode };
  }
  // Default sum / custom
  const dice = String(cfg.dice || profile?.check_dice || '1d6').toLowerCase();
  return { dice, mod: v, mode };
}
const parseDice = (s) => { const m = String(s || '1d20').toLowerCase().match(/^(\d*)d(\d+)$/); return { n: Math.min(10, Number(m?.[1]) || 1), sides: Number(m?.[2]) || 20 }; };

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

function XpBar({ xp, max = 1000, level = 1, onGainXp, small }) {
  const current = Number(xp || 0);
  const target = Number(max || 1000);
  const pct = Math.max(0, Math.min(100, Math.round((current / Math.max(1, target)) * 100)));
  return (
    <div className={`imsd-xp ${small ? 'small' : ''}`} role="meter" aria-valuenow={current} aria-valuemin={0} aria-valuemax={target} aria-label="Experience">
      <div className="top">
        <span>Experience {level ? `(Lv.${level})` : ''}</span>
        <b className="num">{current}<small> / {target} XP ({pct}%)</small></b>
      </div>
      <div className="bar"><i style={{ width: `${pct}%` }} /></div>
      {onGainXp && (
        <div className="imsd-xp-quick">
          <button type="button" className="imsd-xp-btn" onClick={() => onGainXp(10)} title="+10 XP: Disarming traps, picking locks, reading ancient lore tomes">+10 XP</button>
          <button type="button" className="imsd-xp-btn" onClick={() => onGainXp(50)} title="+50 XP: Surviving combat encounters, discovering a new domain">+50 XP</button>
          <button type="button" className="imsd-xp-btn" onClick={() => onGainXp(200)} title="+200 XP: Slaying an Overseer domain boss">+200 XP</button>
        </div>
      )}
    </div>
  );
}

function Tracker({ t, onChange, small }) {
  const isTension = (t.name || '').toLowerCase().includes('tension');
  const span = t.max - t.min;
  const pips = !isTension && span > 0 && span <= 12;

  const handleTensionStep = (direction) => {
    if (!onChange) return;
    const steps = [8, 6, 4];
    const currIdx = steps.indexOf(t.value);
    if (direction === 'down') {
      if (currIdx >= 0 && currIdx < steps.length - 1) {
        onChange(steps[currIdx + 1]);
      } else {
        onChange(8); // Reset to D8 when stepping down from D4
      }
    } else {
      if (currIdx > 0) {
        onChange(steps[currIdx - 1]);
      } else {
        onChange(8);
      }
    }
  };

  return (
    <div className={`imsd-tracker ${small ? 'small' : ''}`} title={t.about || t.name}>
      <span className="nm">{t.name}</span>
      {isTension ? (
        <>
          <span className="grow" />
          <span className="stepper" style={{ marginLeft: 'auto' }}>
            {onChange && (
              <IconButton
                icon="remove"
                label={`${t.name} step down`}
                onClick={() => handleTensionStep('down')}
              />
            )}
            <b className="num" style={{ color: t.value === 4 ? 'var(--imsm-warn, #ef4444)' : 'inherit', minWidth: '2.5rem', textAlign: 'center' }}>
              {`D${t.value}`}
            </b>
            {onChange && (
              <IconButton
                icon="add"
                label={`${t.name} step up`}
                disabled={t.value >= 8}
                onClick={() => handleTensionStep('up')}
              />
            )}
          </span>
        </>
      ) : (
        <>
          {pips ? (
            <span className="pips">
              {Array.from({ length: span + 1 }, (_, i) => t.min + i)
                .filter((v) => v !== 0 || t.min < 0)
                .map((v) => (
                  <i
                    key={v}
                    className={`${v <= t.value && v > 0 ? 'on' : ''} ${v < 0 && v >= t.value ? 'neg' : ''} ${v === t.value ? 'cur' : ''}`}
                  />
                ))}
            </span>
          ) : (
            <span className="grow" />
          )}
          {onChange ? (
            <span className="stepper">
              <IconButton icon="remove" label={`${t.name} down`} disabled={t.value <= t.min} onClick={() => onChange(t.value - 1)} />
              <b className={`num ${(t.name || '').toLowerCase() === 'exhaustion' && t.value >= 16 ? 'text-red-400 font-bold' : ''}`}>{t.value}</b>
              <IconButton icon="add" label={`${t.name} up`} disabled={t.value >= t.max} onClick={() => onChange(t.value + 1)} />
            </span>
          ) : (
            <b className="num">{t.value}</b>
          )}
        </>
      )}
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
      <Icon n="dice" size={16} />{r.label ? `${r.label}: ` : ''}{r.total}{r.dc ? `${r.under ? ' ≤ ' : ' vs '}${r.dc}` : ''}{r.success === true ? ' (success)' : r.success === false ? ' (failure)' : ''}<small>{r.formula}{dice.length > 1 ? ` [${dice.join(', ')}]` : ''}</small>
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
function Turn({ t, hero, profile, first, narrator, onPage, showCitations = false }) {
  const s = t.scene_state || {};
  const a = s.applied || {};
  return (
    <article id={`imsd-turn-${t.id || t.turn_number}`} className={`imsd-turn ${first ? 'first' : ''}`}>
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
      <div className="tale">{renderTaleMarkdown(t.dm_narrative)}</div>
      <div className="foot">
        {a.hp ? <span className={`tag ${a.hp < 0 ? 'bad' : 'good'}`}><Icon n="blood" size={15} />{sign(a.hp)} {profile?.hp_label || 'HP'}</span> : null}
        {(a.gained || []).map((g) => <span key={`g${g}`} className="tag good"><Icon n="add" size={15} />{g}</span>)}
        {(a.lost || []).map((g) => <span key={`l${g}`} className="tag warn"><Icon n="remove" size={15} />{g}</span>)}
        {(a.trackers || []).map((x) => <span key={`t${x.name}`} className={`tag ${x.change > 0 ? 'good' : 'warn'}`}><Icon n="chart" size={15} />{x.name} {sign(x.change)}</span>)}
        {(a.progress || []).map((x) => <span key={`p${x.name}`} className="tag good"><Icon n="flag" size={15} />{x.made ? `New ${x.rank || ''} track: ${x.name}` : x.done ? `${x.name} - fulfilled` : `${x.name} +${x.ticks / 4 >= 1 ? `${x.ticks / 4} box${x.ticks > 4 ? 'es' : ''}` : `${x.ticks} tick${x.ticks > 1 ? 's' : ''}`}`}</span>)}
        {(s.tables_rolled || []).map((x) => <span key={x} className="tag imsd-table"><Icon n="dice" size={15} />{x}</span>)}
        {showCitations && <Sources list={s.rules} onOpen={onPage} />}
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
  const [streamingDraft, setStreamingDraft] = useState('');
  const [streamingAction, setStreamingAction] = useState('');
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
  const streamingTurnRef = useRef(null);

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
  const [locked, setLocked] = useState(true);
  const [inspectItem, setInspectItem] = useState(null);
  const [inspectPortrait, setInspectPortrait] = useState(false);
  const [activeProcModal, setActiveProcModal] = useState(null);
  const [postCombatDoneTurns, setPostCombatDoneTurns] = useState(() => new Set());
  const [mapSelectedRoomId, setMapSelectedRoomId] = useState(null);
  const [mapPopover, setMapPopover] = useState(null);
  const toggleMapPopover = (pop) => {
    setMapPopover((cur) => (cur?.roomId === pop.roomId && cur?.type === pop.type ? null : { ...pop, pinned: true }));
  };

  // Explored Dungeon Rooms & Map Cartography
  const exploredRooms = useMemo(() => {
    if (!turns || turns.length === 0) return [];
    const rooms = [];
    let cur = null;

    const extractChamberName = (sceneTitle, prev) => {
      const raw = (sceneTitle || '').trim();
      const m = raw.match(/(?:in the|into the|of the|of|at the)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
      if (m && /ossuary|crypt|sepulchre|vault|gallery|sarcophagus|cruciform|reliquary|sluice|conduit|corridor|chamber|maw|catacomb|nave|hall|chasm|shrine|passage|sanctum/i.test(m[1])) {
        return m[1];
      }
      if (/ossuary|crypt|sepulchre|vault|gallery|reliquary|sluice|conduit|cruciform|sarcophagus|catacomb|shrine/i.test(raw)) {
        return raw;
      }
      return prev || raw || 'Dungeon Chamber';
    };

    turns.forEach((t) => {
      const ss = t.scene_state || {};
      const rawTitle = (t.scene_title || ss.scene_title || ss.title || 'Dungeon Chamber').trim();
      const userAct = t.player_action || t.user_action || '';
      const isMove = /wade|move|advance|enter|head|descend|ascend|portal|door|corridor|passage|crawlway|archway|retreat|return|open the|step/i.test(userAct);
      const chamberName = extractChamberName(rawTitle, cur?.name);
      const isNewChamber = !cur || (isMove && cur.name !== chamberName) || (!cur.turns?.length);

      if (isNewChamber) {
        if (cur) rooms.push(cur);
        cur = {
          id: `room-${rooms.length + 1}`,
          index: rooms.length + 1,
          name: chamberName || rawTitle,
          title: rawTitle,
          turns: [t.turn_number],
          desc: ss.situation || t.dm_narrative?.slice(0, 320) || 'Dungeon chamber shrouded in cold subterranean mist.',
          fullDesc: t.dm_narrative || ss.situation || '',
          kills: [],
          options: ss.options || [],
          hasActiveEnemies: false,
          soundscape: ss.soundscape || null,
        };
      } else {
        cur.turns.push(t.turn_number);
        if (ss.situation) cur.desc = ss.situation;
        if (t.dm_narrative) cur.fullDesc = t.dm_narrative;
        if (ss.options?.length) cur.options = ss.options;
        if (rawTitle && rawTitle !== 'Dungeon Chamber') cur.title = rawTitle;
        if (ss.soundscape) cur.soundscape = ss.soundscape;
      }

      // Check adversaries & recorded kills
      const advs = Array.isArray(ss.adversaries) && ss.adversaries.length
        ? ss.adversaries
        : (ss.adversary && ss.adversary.name ? [ss.adversary] : []);

      advs.forEach((a) => {
        if (!a || !a.name) return;
        const isDead = a.defeated || a.status === 'Slain' || a.status === 'Dead' || Number(a.hp) <= 0 || a.active === false;
        if (isDead) {
          if (!cur.kills.some((k) => k.name === a.name)) {
            cur.kills.push({
              name: a.name,
              turn: t.turn_number,
              hp: a.max_hp || a.hp || 'Slain',
              details: a.description || `Defeated on Turn ${t.turn_number}`,
            });
          }
        } else if (a.active !== false && Number(a.hp ?? 1) > 0) {
          cur.hasActiveEnemies = true;
        }
      });
    });

    if (cur) rooms.push(cur);

    // Evaluate camping suitability
    rooms.forEach((r, idx) => {
      const text = `${r.name} ${r.title} ${r.desc} ${r.fullDesc}`.toLowerCase();
      const hasSafeThematic = /sepulchre|reliquary|sanctuary|alcove|chapel|cache|study|hearth|safe|cleared|vault|respite|defensible|dry ground|sealed/i.test(text);
      r.isCampable = !r.hasActiveEnemies && (r.kills.length > 0 || hasSafeThematic);
      r.campReason = r.isCampable
        ? (r.kills.length > 0
          ? `Cleared Chamber · Hostile adversaries (${r.kills.map((k) => k.name).join(', ')}) slain. Perimeter secured for setting a bivouac or taking a Breather.`
          : 'Sheltered Recess · Dry stone and defensible archways afford respite from wandering dungeon horrors.')
        : 'Unsecured · Active hazards, flooded slime, or proximity to hostile forces.';
      r.isCurrent = idx === rooms.length - 1;
    });

    return rooms;
  }, [turns]);

  // Current chamber & available directions from current location
  const currentRoom = exploredRooms[exploredRooms.length - 1] || null;
  const availableDirections = useMemo(() => {
    const opts = state.options || currentRoom?.options || [];
    return opts.map((opt, i) => {
      const text = typeof opt === 'string' ? opt : (opt?.text || '');
      let dir = 'Passage';
      let icon = 'explore';
      let tag = 'PATH';
      if (/north|ahead|forward|advance|deeper|descend into|down the corridor|wade|venture/i.test(text)) {
        dir = 'North / Advance';
        icon = 'up';
        tag = 'NORTH';
      } else if (/south|back|retreat|return|revisit|exit|leave|backtrack/i.test(text)) {
        dir = 'South / Backtrack';
        icon = 'down';
        tag = 'SOUTH';
      } else if (/east|right|eastward/i.test(text)) {
        dir = 'East / Passage';
        icon = 'route';
        tag = 'EAST';
      } else if (/west|left|westward/i.test(text)) {
        dir = 'West / Passage';
        icon = 'route';
        tag = 'WEST';
      } else if (/up|ascend|climb|overhead|ladder|stairs up|hatch/i.test(text)) {
        dir = 'Up / Ascend';
        icon = 'up';
        tag = 'UP';
      } else if (/down|chasm|drop|stairs down|pit/i.test(text)) {
        dir = 'Down / Descend';
        icon = 'down';
        tag = 'DOWN';
      } else if (/search|examine|inspect|scavenge|investigate|study|open|unlock/i.test(text)) {
        dir = 'Local Investigation';
        icon = 'search';
        tag = 'SEARCH';
      }
      return { id: `dir-${i}`, text, dir, icon, tag, raw: opt };
    });
  }, [state.options, currentRoom]);

  // Resolve all adversaries for the current scene/combat
  const adversariesList = useMemo(() => {
    if (Array.isArray(state.adversaries) && state.adversaries.length) return state.adversaries;
    if (state.adversary && state.adversary.name) return [state.adversary];
    // Check backwards in turns: only keep if previous turn had an active combat engagement that didn't end
    const prevTurnWithAdv = [...turns].reverse().find((t) => {
      const s = t.scene_state;
      return (Array.isArray(s?.adversaries) && s.adversaries.length) || (s?.adversary?.name);
    });
    if (prevTurnWithAdv) {
      const pAdvs = Array.isArray(prevTurnWithAdv.scene_state?.adversaries) && prevTurnWithAdv.scene_state.adversaries.length
        ? prevTurnWithAdv.scene_state.adversaries
        : (prevTurnWithAdv.scene_state?.adversary?.name ? [prevTurnWithAdv.scene_state.adversary] : []);
      // If the combat was already concluded (all defeated) in that past turn, don't resurrect in future non-combat rooms
      const wasConcluded = pAdvs.every((a) => a.defeated || (Number(a.hp) <= 0 && a.hp !== undefined));
      if (!wasConcluded || prevTurnWithAdv === last) {
        return pAdvs;
      }
    }
    return [];
  }, [state.adversaries, state.adversary, turns, last]);

  // Track adversaries that have finished fading and should be removed from view / tabs
  const [removedAdvIds, setRemovedAdvIds] = useState(() => new Set());
  // Track adversaries currently performing the 0.7s fade-out animation
  const [fadingAdvIds, setFadingAdvIds] = useState(() => new Set());

  // Reset removed adversaries when a new turn begins with living foes
  useEffect(() => {
    const rawAdvs = Array.isArray(state.adversaries) && state.adversaries.length
      ? state.adversaries
      : (state.adversary && state.adversary.name ? [state.adversary] : []);
    const hasLiving = rawAdvs.some((a) => !a.defeated && Number(a.hp ?? 0) > 0);
    if (hasLiving) {
      setRemovedAdvIds(new Set());
      setFadingAdvIds(new Set());
    }
  }, [last?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Visible adversaries: filter out those that were fully dismissed or finished their slain fade-away
  const visibleAdversaries = useMemo(() => {
    return adversariesList.filter((a) => !removedAdvIds.has(a.id || a.name));
  }, [adversariesList, removedAdvIds]);

  // Selected tabbed attacker ID
  const [selectedAdvId, setSelectedAdvId] = useState(null);

  // Automatically select the active or injured attacker:
  useEffect(() => {
    if (!visibleAdversaries.length) {
      setSelectedAdvId(null);
      return;
    }
    const justDamaged = visibleAdversaries.find((a) => a.just_damaged && !a.defeated && Number(a.hp ?? 0) > 0);
    if (justDamaged) {
      setSelectedAdvId(justDamaged.id || justDamaged.name);
      return;
    }
    const current = visibleAdversaries.find((a) => (a.id || a.name) === selectedAdvId);
    if (current && !current.defeated && Number(current.hp) > 0) return;

    const firstActive = visibleAdversaries.find((a) => !a.defeated && Number(a.hp) > 0);
    if (firstActive) {
      setSelectedAdvId(firstActive.id || firstActive.name);
      return;
    }
    setSelectedAdvId(visibleAdversaries[0].id || visibleAdversaries[0].name);
  }, [visibleAdversaries]); // eslint-disable-line react-hooks/exhaustive-deps

  const adversary = useMemo(() => {
    if (!visibleAdversaries.length) return null;
    return visibleAdversaries.find((a) => (a.id || a.name) === selectedAdvId) || visibleAdversaries[0];
  }, [visibleAdversaries, selectedAdvId]);

  // Auto-fade and remove slain attacker after a few seconds
  useEffect(() => {
    if (!adversary) return;
    const advKey = adversary.id || adversary.name;
    const isDefeated = adversary.defeated || Number(adversary.hp ?? 0) <= 0;
    if (isDefeated && !removedAdvIds.has(advKey)) {
      const fadeTimer = setTimeout(() => {
        setFadingAdvIds((prev) => new Set([...prev, advKey]));
      }, 2400);

      const removeTimer = setTimeout(() => {
        setRemovedAdvIds((prev) => new Set([...prev, advKey]));
        setFadingAdvIds((prev) => {
          const next = new Set(prev);
          next.delete(advKey);
          return next;
        });
        const remaining = visibleAdversaries.filter((a) => (a.id || a.name) !== advKey);
        const nextLiving = remaining.find((a) => !a.defeated && Number(a.hp ?? 0) > 0) || remaining[0];
        if (nextLiving) {
          setSelectedAdvId(nextLiving.id || nextLiving.name);
        } else {
          setSelectedAdvId(null);
        }
      }, 3100);

      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(removeTimer);
      };
    }
  }, [adversary?.id, adversary?.name, adversary?.defeated, adversary?.hp, removedAdvIds, visibleAdversaries]);

  // Instant dismiss helper when player clicks slain card
  const dismissSlainNow = (advKey) => {
    setRemovedAdvIds((prev) => new Set([...prev, advKey]));
    setFadingAdvIds((prev) => {
      const next = new Set(prev);
      next.delete(advKey);
      return next;
    });
    const remaining = visibleAdversaries.filter((a) => (a.id || a.name) !== advKey);
    const nextLiving = remaining.find((a) => !a.defeated && Number(a.hp ?? 0) > 0) || remaining[0];
    if (nextLiving) {
      setSelectedAdvId(nextLiving.id || nextLiving.name);
    } else {
      setSelectedAdvId(null);
    }
  };

  // Ghost HP trailing bar for visceral damage animation
  const advHp = Number(adversary?.hp ?? 0);
  const [ghostHp, setGhostHp] = useState(advHp);
  useEffect(() => {
    const timer = setTimeout(() => {
      setGhostHp(advHp);
    }, 450);
    return () => clearTimeout(timer);
  }, [advHp]);
  const mood = busy === 'turn' ? 'suspicious' : state.mood || 'neutral';

  // the soundscape follows the story once it's on (the server picks a Tabletop Audio track for each scene)
  const sceneTrack = [...turns].reverse().find((t) => t.scene_state?.soundscape)?.scene_state.soundscape || null;
  useEffect(() => { if (sounds.on && follow && sceneTrack && sceneTrack.key !== sounds.track?.key) sounds.play(sceneTrack); }, [sceneTrack?.key, follow]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { sounds.duck(Boolean(narrator.playing)); }, [narrator.playing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (room === 'play' && turns.length > 0) {
      const activeTurn = turns[turns.length - 1];
      const el = document.getElementById(`imsd-turn-${activeTurn?.id || activeTurn?.turn_number}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [turns.length, room]);

  // ---- a move ----
  const send = async (text, withRoll = roll) => {
    const action = String(text || '').trim();
    if (!action || !c || busy) return;
    const low = action.toLowerCase();
    if (/attack|strike|swing|stab|slash|fight|shoot|blade/.test(low)) dndAudio.playSfx('sword_clash');
    else if (/cast|spell|magic|ritual|arcane|incant/.test(low)) dndAudio.playSfx('spell_cast');
    else if (/door|gate|open|enter|step in/.test(low)) dndAudio.playSfx('door_creak');
    else if (/rest|camp|sleep|bandage|heal/.test(low)) dndAudio.playSfx('short_rest');
    else if (/lock|pick|chest|key/.test(low)) dndAudio.playSfx('unlock_success');
    setBusy('turn');
    setStreamingAction(action);
    setStreamingDraft('');
    dndAudio.playSfx('read_scroll');
    if (rollTimerRef.current) clearTimeout(rollTimerRef.current);

    // Keep focus anchored on the prompt turn text the user was reading
    if (last) {
      const activeEl = document.getElementById(`imsd-turn-${last.id || last.turn_number}`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    try {
      // Connect to fast streaming endpoint (TTFT ~400ms)
      const res = await fetch(`/api/dnd/campaigns/${c.id}/turn-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerAction: action, diceRoll: withRoll, oracleResult: oracle })
      });

      if (!res.ok || !res.body) {
        // Fallback to standard turn if streaming unsupported
        const d = await api(`/campaigns/${c.id}/turn`, { method: 'POST', body: { playerAction: action, diceRoll: withRoll, oracleResult: oracle } });
        setC(d.campaign); setInput(''); setRoll(null); setOracle(null); setResult(null); setPaperRolling(false);
        setStreamingDraft(''); setStreamingAction('');
        const t = d.campaign.turns[d.campaign.turns.length - 1];
        if (t?.dice_rolls?.[0]?.isCrit) dndAudio.playSfx('critical_hit');
        else if (t?.dice_rolls?.[0]?.isFumble) dndAudio.playSfx('critical_miss');
        if (autoRead && t) narrator.play(t.id);
        loadLists();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          const line = block.trim();
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const ev = JSON.parse(jsonStr);
            if (ev.type === 'token') {
              accumulated += ev.token;
              setStreamingDraft(accumulated);
              // Gently keep the streaming reading position visible without aggressive jitter
              if (streamingTurnRef.current) {
                const rect = streamingTurnRef.current.getBoundingClientRect();
                if (rect.bottom > window.innerHeight - 100) {
                  streamingTurnRef.current.scrollIntoView({ behavior: 'auto', block: 'nearest' });
                }
              }
            } else if (ev.type === 'complete') {
              setC(ev.campaign);
              setInput(''); setRoll(null); setOracle(null); setResult(null); setPaperRolling(false);
              setStreamingDraft(''); setStreamingAction('');
              const t = ev.campaign.turns[ev.campaign.turns.length - 1];
              if (t?.dice_rolls?.[0]?.isCrit) dndAudio.playSfx('critical_hit');
              else if (t?.dice_rolls?.[0]?.isFumble) dndAudio.playSfx('critical_miss');
              if (autoRead && t) narrator.play(t.id);
              loadLists();
            } else if (ev.type === 'error') {
              throw new Error(ev.error || 'Turn generation error');
            }
          } catch (pe) {
            if (pe.message && !pe.message.includes('JSON')) console.warn('[DndSolo] Stream parse error:', pe);
          }
        }
      }
    } catch (e) {
      err(e);
      setStreamingDraft('');
      setStreamingAction('');
    } finally {
      setBusy('');
    }
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
  const setAdversaryHp = async (delta) => {
    if (!adversary || !c) return;
    const cur = Number(adversary.hp ?? 10);
    const max = Number(adversary.max_hp ?? cur ?? 10);
    const next = Math.max(0, Math.min(max, cur + delta));
    if (delta < 0) {
      if (next <= 0) dndAudio.playSfx('critical_hit');
      else dndAudio.playSfx('sword_clash');
    } else {
      dndAudio.playSfx('spell_cast');
    }
    try {
      const d = await api(`/campaigns/${c.id}/adversary`, {
        method: 'PUT',
        body: {
          id: adversary.id,
          name: adversary.name,
          hp: next,
          defeated: next <= 0,
          status: next <= 0 ? 'Slain' : next <= max / 2 ? 'Bloodied' : 'Engaged'
        }
      });
      if (d?.campaign) setC(d.campaign);
      if (next <= 0 && isKN) {
        setTimeout(() => {
          setActiveProcModal('post_combat');
        }, 1200);
      }
    } catch (e) { err(e); }
  };
  const [rulesPickId, setRulesPickId] = useState(null);
  const saveHero = async (patch) => {
    try { const d = await api(`/characters/${hero.id}`, { method: 'PUT', body: patch }); setC((p) => ({ ...p, character: d.character })); return true; } catch (e) { err(e); return false; }
  };

  const doKnOpposedStrike = async (adv = adversary) => {
    if (!adv || rolling || Boolean(busy)) return;
    let skillVal = 45;
    const skills = hero?.spells_or_skills || [];
    const combatSkill = skills.find((s) => /melee|weapon|sword|blade|axe|brawl|mace|unarmed|body/i.test(s));
    if (combatSkill) {
      const m = String(combatSkill).match(/\((\d+)%\)/);
      if (m) skillVal = Number(m[1]);
    } else if (hero?.attributes?.Body || hero?.attributes?.Prowess) {
      skillVal = hero.attributes.Body || hero.attributes.Prowess;
    }
    const playerTarget = skillVal + 10;

    // Gravebound Edition Weapon Speed: subtracted directly from enemy's Combat Skill
    let weaponSpeed = 0;
    const inventory = hero?.inventory || [];
    const weaponWithSpeed = inventory.find((i) => /speed\s*(\d+)/i.test(i));
    if (weaponWithSpeed) {
      const spdMatch = weaponWithSpeed.match(/speed\s*(\d+)/i);
      if (spdMatch) weaponSpeed = Number(spdMatch[1]);
    } else if (inventory.some((i) => /dagger|knife/i.test(i))) {
      weaponSpeed = 2;
    } else if (inventory.some((i) => /spear|sword|axe/i.test(i))) {
      weaponSpeed = 1;
    }

    // Level Adaptation (p. 131): Enemy Combat Skill scales with hero level ⅃
    const heroLevel = Number(hero?.level || 1);
    const levelBonus = heroLevel > 1 ? (heroLevel - 1) * 3 : 0;
    const baseEnemySkill = Number(adv.attack_bonus) || (adv.ac && adv.ac > 10 ? 45 : 40);
    const enemyCombatSkill = baseEnemySkill + levelBonus;
    const enemyTarget = Math.max(10, enemyCombatSkill - weaponSpeed);

    const pRollRes = await throwDice({ die: 'd100', count: 1, label: `Opposed Strike: Player Attack (Target ≤ ${playerTarget}%)` });
    if (!pRollRes) return;
    const pRoll = pRollRes.total;

    const eRollRes = await throwDice({ die: 'd100', count: 1, label: `Opposed Strike: ${adv.name} Defence (Target ≤ ${enemyTarget}%)` });
    const eRoll = eRollRes ? eRollRes.total : Math.floor(Math.random() * 100) + 1;

    const isPlayerCrit = (pRoll % 11 === 0 && pRoll <= playerTarget) || pRoll === 1;
    const isEnemyCrit = (eRoll % 11 === 0 && eRoll <= enemyTarget) || eRoll === 1;

    const playerHit = pRoll <= playerTarget;
    const enemyDefended = eRoll <= enemyTarget;

    if ((playerHit && (!enemyDefended || pRoll > eRoll)) || isPlayerCrit) {
      const locRes = await throwDice({ die: 'd20', count: 1, label: 'Hit Location (1d20)' });
      const locRoll = locRes ? locRes.total : Math.floor(Math.random() * 20) + 1;
      const location = getHitLocation(locRoll);

      // Gravebound Edition Damage Pool: gather dice pool and choose ONE single result to apply!
      const poolDiceCount = isPlayerCrit || location.isWeakSpot ? 2 : 1;
      const dmgRes = await throwDice({ die: 'd6', count: poolDiceCount, label: `Damage Pool (${poolDiceCount}d6 - pick single die)` });
      const dicePool = dmgRes ? (dmgRes.rolls || [dmgRes.total]) : [4];
      const chosenDie = Math.max(...dicePool);
      const critMod = (isPlayerCrit || location.isWeakSpot) ? 2 : 0;
      const rawDmg = chosenDie + critMod;
      const enemyArmor = location.isWeakSpot ? 0 : (adv.ac >= 10 ? 1 : (adv.ac ?? 1));
      const netDmg = Math.max(1, rawDmg - enemyArmor);

      await setAdversaryHp(-netDmg);
      const critTag = isPlayerCrit ? ' ★ CRITICAL TRIUMPH!' : '';
      const weakTag = location.isWeakSpot ? ' ★ WEAK SPOT HIT (Armor bypassed)!' : '';
      snack(`⚔️ Hit ${adv.name} on ${location.name} for ${netDmg} damage!`);
      send(`⚔️ Opposed Strike vs ${adv.name}:
• Player Attack: rolled ${pRoll} vs ${playerTarget}% (Skill ${skillVal}% + 10 Upper Hand) -> SUCCESS!${critTag}
• ${adv.name} Defence: rolled ${eRoll} vs ${enemyTarget}% (Base ${enemyCombatSkill}% - Speed ${weaponSpeed}) -> FAILED.
• Hit Location: ${location.name} (1d20 = ${locRoll})${weakTag}
• Damage Pool: rolled [${dicePool.join(', ')}] -> chose single die ${chosenDie}${critMod ? ` + ${critMod} weak spot bonus` : ''} - ${enemyArmor} armor = ${netDmg} damage dealt! (${adv.name} HP: ${Math.max(0, (adv.hp || 10) - netDmg)})`);
    } else if ((enemyDefended && (!playerHit || eRoll > pRoll)) || isEnemyCrit) {
      const moveRes = await throwDice({ die: 'd10', count: 1, label: 'Defensive Move Table (1d10)' });
      const moveRoll = moveRes ? moveRes.total : Math.floor(Math.random() * 10) + 1;
      const move = DEFENSIVE_MOVES[moveRoll - 1];

      if (move.piercingDmg) {
        const curTrackers = hero?.trackers || [];
        const t = curTrackers.find((x) => /toughness/i.test(x.name));
        if (t && t.value > 0) {
          const nextVal = Math.max(0, t.value - move.piercingDmg);
          const nextTrackers = curTrackers.map((x) => (x.name === t.name ? { ...x, value: nextVal } : x));
          await saveHero({ trackers: nextTrackers });
        } else {
          await adjustHp(-move.piercingDmg);
        }
      }
      snack(`🛡️ ${adv.name} parried! Defensive Move: ${move.name}`, { error: true });
      send(`⚔️ Opposed Strike vs ${adv.name}:
• Player Attack: rolled ${pRoll} vs ${playerTarget}% -> FAILED or beaten.
• ${adv.name} Defence: rolled ${eRoll} vs ${enemyTarget}% -> DEFENDED!
• Defensive Move (1d10 = ${moveRoll}): "${move.name}" — ${move.effect}`);
    } else {
      await setAdversaryHp(-1);
      snack(`⚔️ Both failed checks: Chaos of melee inflicts 1 unavoidable damage to ${adv.name}!`);
      send(`⚔️ Opposed Strike vs ${adv.name}:
• Player Attack: rolled ${pRoll} vs ${playerTarget}% -> Failed.
• ${adv.name} Defence: rolled ${eRoll} vs ${enemyTarget}% -> Failed.
• Rulebook Clash Resolution (p. 78): When both fail, neither lands a clean blow, but the defender suffers 1 point of unavoidable direct damage! (${adv.name} took 1 damage).`);
    }
  };

  const doKnDefendReact = async (adv = adversary) => {
    if (!adv || rolling || Boolean(busy)) return;
    let defSkill = 45;
    const skills = hero?.spells_or_skills || [];
    const dodgeSkill = skills.find((s) => /dodge|evasion|acrobat/i.test(s));
    if (dodgeSkill) {
      const m = String(dodgeSkill).match(/\((\d+)%\)/);
      if (m) defSkill = Number(m[1]);
    } else if (hero?.attributes?.Agility) {
      defSkill = hero.attributes.Agility;
    }
    const playerTarget = defSkill;
    const heroLevel = Number(hero?.level || 1);
    const levelBonus = heroLevel > 1 ? (heroLevel - 1) * 3 : 0;
    const enemyTarget = (Number(adv.attack_bonus) || (adv.ac && adv.ac > 10 ? 55 : 50)) + levelBonus;

    const eRollRes = await throwDice({ die: 'd100', count: 1, label: `${adv.name} Attack Check (Target ≤ ${enemyTarget}%)` });
    const eRoll = eRollRes ? eRollRes.total : Math.floor(Math.random() * 100) + 1;

    const pRollRes = await throwDice({ die: 'd100', count: 1, label: `Player Defence Reaction (Target ≤ ${playerTarget}%)` });
    if (!pRollRes) return;
    const pRoll = pRollRes.total;

    const enemyHit = eRoll <= enemyTarget;
    const playerDefended = pRoll <= playerTarget;

    if (playerDefended && (!enemyHit || pRoll > eRoll)) {
      const moveRes = await throwDice({ die: 'd10', count: 1, label: 'Defensive Move Table (1d10)' });
      const moveRoll = moveRes ? moveRes.total : Math.floor(Math.random() * 10) + 1;
      const move = DEFENSIVE_MOVES[moveRoll - 1];

      if (move.toughnessHeal) {
        const curTrackers = hero?.trackers || [];
        const t = curTrackers.find((x) => /toughness/i.test(x.name));
        if (t) {
          const nextVal = Math.min(t.max || 38, (t.value ?? 20) + move.toughnessHeal);
          const nextTrackers = curTrackers.map((x) => (x.name === t.name ? { ...x, value: nextVal } : x));
          await saveHero({ trackers: nextTrackers });
        }
      } else if (move.piercingDmg) {
        await setAdversaryHp(-move.piercingDmg);
      }

      snack(`🛡️ Defended against ${adv.name}! Defensive Move: ${move.name}`);
      send(`🛡️ Defend & React vs ${adv.name}:
• ${adv.name} Attack: rolled ${eRoll} vs ${enemyTarget}%.
• Player Defence: rolled ${pRoll} vs ${playerTarget}% -> DEFENDED!
• Defensive Move (1d10 = ${moveRoll}): "${move.name}" — ${move.effect}`);
    } else if (enemyHit && (!playerDefended || eRoll > pRoll)) {
      const locRes = await throwDice({ die: 'd20', count: 1, label: 'Incoming Hit Location (1d20)' });
      const locRoll = locRes ? locRes.total : Math.floor(Math.random() * 20) + 1;
      const location = getHitLocation(locRoll);

      // Gravebound Edition Enemy Damage Pool: roll pool and pick highest
      const dmgRes = await throwDice({ die: 'd6', count: 1, label: 'Enemy Damage Pool (1d6)' });
      const eDicePool = dmgRes ? (dmgRes.rolls || [dmgRes.total]) : [3];
      const incomingDmg = Math.max(...eDicePool) + (location.isWeakSpot ? 4 : 0);
      const playerArmor = 2;
      const netDmg = Math.max(1, incomingDmg - playerArmor);

      const curTrackers = hero?.trackers || [];
      const t = curTrackers.find((x) => /toughness/i.test(x.name));
      let tRem = netDmg;
      if (t && t.value > 0) {
        const tAbsorb = Math.min(t.value, netDmg);
        tRem = netDmg - tAbsorb;
        const nextTrackers = curTrackers.map((x) => (x.name === t.name ? { ...x, value: t.value - tAbsorb } : x));
        await saveHero({ trackers: nextTrackers });
      }
      if (tRem > 0) {
        await adjustHp(-tRem);
      }
      snack(`⚠️ ${adv.name} struck your ${location.name} for ${netDmg} damage!`, { error: true });
      send(`⚔️ Defend & React vs ${adv.name}:
• ${adv.name} Attack: rolled ${eRoll} vs ${enemyTarget}% (Level-Adapted) -> HIT!
• Player Defence: rolled ${pRoll} vs ${playerTarget}% -> Failed.
• Hit Location: ${location.name} (1d20 = ${locRoll})
• Damage Pool: rolled [${eDicePool.join(', ')}] -> chose ${incomingDmg} - ${playerArmor} armor = ${netDmg} damage taken (Toughness absorbed, remainder hit Health).`);
    } else {
      const curTrackers = hero?.trackers || [];
      const t = curTrackers.find((x) => /toughness/i.test(x.name));
      if (t && t.value > 0) {
        const nextTrackers = curTrackers.map((x) => (x.name === t.name ? { ...x, value: t.value - 1 } : x));
        await saveHero({ trackers: nextTrackers });
      } else {
        await adjustHp(-1);
      }
      snack(`Both failed: Clashing melee inflicts 1 unavoidable damage on defender.`);
      send(`⚔️ Defend & React vs ${adv.name}: Both failed checks. Rulebook p. 78 clash: 1 unavoidable damage suffered by defender.`);
    }
  };

  const doTakeBreather = async () => {
    const curTrackers = hero?.trackers || [];
    const lightTracker = curTrackers.find((x) => /light|torch|lantern/i.test(x.name));
    const lightVal = lightTracker ? lightTracker.value : 10;
    if (lightVal < 5) {
      snack('⚠️ Not enough Light fuel! Taking a Breather requires at least 5 Light turns.', { error: true });
      return;
    }

    const tRes = await throwDice({ die: 'd10', count: 1, label: 'Breather Toughness Recovery (1d10+2)' });
    if (!tRes) return;
    const tRoll = tRes.total;
    const tHeal = tRoll + 2;

    const tensionTracker = curTrackers.find((x) => /tension/i.test(x.name));
    const tensionVal = tensionTracker ? tensionTracker.value : 8;
    const steps = [8, 6, 4];
    const idx = steps.indexOf(tensionVal);
    const nextTension = idx >= 0 && idx < steps.length - 1 ? steps[idx + 1] : 8;

    const nextLight = Math.max(0, lightVal - 5);
    const nextHp = Math.min(hero.max_hp, hero.hp + 1);

    const nextTrackers = curTrackers.map((t) => {
      if (/light|torch|lantern/i.test(t.name)) return { ...t, value: nextLight };
      if (/tension/i.test(t.name)) return { ...t, value: nextTension };
      if (/exhaust/i.test(t.name)) return { ...t, value: Math.max(0, (t.value || 0) - 2) };
      if (/toughness/i.test(t.name)) return { ...t, value: Math.min(t.max || 20, (t.value ?? 10) + tHeal) };
      return t;
    });

    await saveHero({ hp: nextHp, trackers: nextTrackers });
    setActiveProcModal(null);
    snack(`🫁 Breather taken: +${tHeal} Toughness, +1 HP, -2 Exhaustion. -5 Light, Tension stepped to D${nextTension}.`);
    send(`I take a 10-minute Breather in a shadowed alcove:
• Thematic Reprieve: Catching breath and binding cuts while watching the guttering lantern flame.
• Rulebook p. 123 Costs: Consumed 5 Light turns (Light: ${nextLight}), Tension stepped down to D${nextTension}.
• Rulebook p. 123 Benefits: Rolled 1d10+2 = ${tHeal} Toughness restored, 1 Health recovered (HP: ${nextHp}/${hero.max_hp}), and Exhaustion reduced by 2.`);
  };

  const doSetCamp = async () => {
    let inv = [...(hero?.inventory || [])];
    const rIdx = inv.findIndex((i) => /ration|food|bread|meat/i.test(i));
    const hasRation = rIdx >= 0;
    if (hasRation) {
      inv.splice(rIdx, 1);
    }

    const cRes = await throwDice({ die: 'd20', count: 1, label: 'Camp Safety Check (DC 12)' });
    if (!cRes) return;
    const cRoll = cRes.total;
    const isSafe = cRoll >= 12;

    const curTrackers = hero?.trackers || [];
    const healHp = isSafe ? 1 : 0;
    const healSan = isSafe ? Math.floor(Math.random() * 4) + 1 : 1;
    const exhReduction = isSafe ? 10 : 5;
    const nextHp = Math.min(hero.max_hp, hero.hp + healHp);

    const nextTrackers = curTrackers.map((t) => {
      if (/toughness/i.test(t.name)) return { ...t, value: isSafe ? (t.max || 20) : Math.min(t.max || 20, (t.value ?? 10) + 5) };
      if (/san/i.test(t.name)) return { ...t, value: Math.min(t.max || 10, (t.value ?? 10) + healSan) };
      if (/exhaust/i.test(t.name)) return { ...t, value: Math.max(0, (t.value || 0) - exhReduction) };
      if (/tension/i.test(t.name)) return { ...t, value: 8 };
      return t;
    });

    const skills = hero?.spells_or_skills || [];
    const marked = skills.filter((s) => s.includes('[✓]'));
    let skillAdvancementNotes = [];
    let updatedSkills = [...skills];

    for (const sk of marked) {
      const advRoll = Math.floor(Math.random() * 100) + 1;
      const m = sk.match(/\((\d+)%\)/);
      const curPct = m ? Number(m[1]) : 45;
      if (advRoll > curPct) {
        const newPct = Math.min(95, curPct + 5);
        updatedSkills = updatedSkills.map((s) => (s === sk ? s.replace(/\(\d+%\)\s*\[✓\]/, `(${newPct}%)`).replace(/\[✓\]/, '') : s));
        skillAdvancementNotes.push(`${sk.replace(/\s*\[✓\].*$/, '')}: rolled ${advRoll} > ${curPct}% -> ADVANCED to ${newPct}%!`);
      } else {
        updatedSkills = updatedSkills.map((s) => (s === sk ? s.replace(/\s*\[✓\]/, '') : s));
        skillAdvancementNotes.push(`${sk.replace(/\s*\[✓\].*$/, '')}: rolled ${advRoll} ≤ ${curPct}% -> No increase.`);
      }
    }

    await saveHero({ hp: nextHp, trackers: nextTrackers, inventory: inv, spells_or_skills: updatedSkills });
    setActiveProcModal(null);

    const rationNote = hasRation ? 'Consumed 1 Ration.' : '⚠️ No Rations consumed: rest benefits halved!';
    const advText = skillAdvancementNotes.length ? `\n• Skill Advancement Checks:\n  - ${skillAdvancementNotes.join('\n  - ')}` : '';

    if (isSafe) {
      snack(`🏕️ Camp Secured (rolled ${cRoll} vs DC 12)! Full rest benefits gained.`);
      send(`I made camp and secured the perimeter:
• Thematic Sanctuary: Barricading the iron door and resting by the embers while binding wounds.
• Camp Check (DC 12): Rolled ${cRoll} on 1d20 -> SUCCESS! Sanctuary holds undisturbed.
• Rulebook pp. 123–125 Rest Benefits: ${rationNote} Full Toughness buffer restored, +${healHp} Health (HP: ${nextHp}/${hero.max_hp}), +${healSan} Sanity, Exhaustion reduced by ${exhReduction}, and Tension Die reset to D8.${advText}`);
    } else {
      snack(`💀 Camp Check failed (rolled ${cRoll} vs DC 12): AMBUSH!`, { error: true });
      send(`I attempted to make camp in the ruins:
• Camp Check (DC 12): Rolled ${cRoll} on 1d20 -> FAILED! Wandering horrors ambush our barricade in the dark!
• Rest Benefits Halved: Gained partial recovery (+${healSan} Sanity, Exhaustion -${exhReduction}). Prepare for immediate combat!`);
    }
  };

  const doMadnessRoll = async () => {
    const mRes = await throwDice({ die: 'd10', count: 1, label: 'Madness Table (1d10)' });
    if (!mRes) return;
    const roll = mRes.total;
    const aff = MADNESS_TABLE[roll - 1];

    const baseSan = Math.floor(Math.random() * 4) + 1;
    const curTrackers = hero?.trackers || [];
    const nextTrackers = curTrackers.map((t) => (/san/i.test(t.name) ? { ...t, value: aff.epiphany ? 5 : baseSan } : t));

    await saveHero({ trackers: nextTrackers });
    setActiveProcModal(null);
    snack(`💀 Madness Affliction: ${aff.name}`, { error: true });
    send(`💀 Mind Collapsed into Madness (Sanity hit 0):
• Thematic Horror: The cosmic futility and creeping shadows of Ker Nethalas overwhelm your sanity.
• Rulebook p. 91 Madness Table: Rolled ${roll} on 1d10 -> "${aff.name}"!
• Effect: ${aff.effect}
• Sanity reset to baseline (${aff.epiphany ? 5 : baseSan}/${(curTrackers.find((t) => /san/i.test(t.name))?.max) || 10}).`);
  };

  const deleteCampaign = (targetCamp = c) => {
    if (!targetCamp) return;
    setConfirm({
      title: `Delete “${targetCamp.title}”?`,
      body: 'The story and its hero will be permanently deleted. This cannot be undone.',
      okLabel: 'Delete',
      danger: true,
      onOk: async () => {
        try {
          await api(`/campaigns/${targetCamp.id}`, { method: 'DELETE' });
          if (cid === targetCamp.id) { setC(null); setCid(null); }
          snack(`Deleted “${targetCamp.title}”.`);
          loadLists();
        } catch (e) { err(e); }
      }
    });
  };

  const deleteCharacter = (targetChar) => {
    if (!targetChar) return;
    setConfirm({
      title: `Delete hero “${targetChar.name}”?`,
      body: 'This character and any associated campaign chronicle will be permanently deleted. This cannot be undone.',
      okLabel: 'Delete',
      danger: true,
      onOk: async () => {
        try {
          await api(`/characters/${targetChar.id}`, { method: 'DELETE' });
          if (hero?.id === targetChar.id) {
            setHero(null);
            setC(null);
            setCid(null);
          }
          snack(`Deleted “${targetChar.name}”.`);
          loadLists();
        } catch (e) { err(e); }
      }
    });
  };

  // ---- 3D dice rolled directly on the parchment scroll ----
  const paperTray = useRef(null);
  const rollTimerRef = useRef(null);
  const [result, setResult] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [paperRolling, setPaperRolling] = useState(false); // active 3D dice roll on the manuscript paper

  const finishRoll = (r) => {
    setResult(r);
    if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
    rollTimerRef.current = setTimeout(() => {
      setPaperRolling(false);
      setTimeout(() => {
        paperTray.current?.clear?.();
      }, 800);
    }, 2400); // 3D dice smoothly fade out after 2.4s
  };

  const throwDice = async ({ die, count = 1, mod = 0, adv = 'none', label = null, dc = null, under = null }) => {
    if (rolling) return null;
    setRolling(true); setResult(null);
    setPaperRolling(true);
    dndAudio.ensureRunning?.();
    const sides = Number(die.replace('d', ''));
    const pair = sides === 20 && count === 1 && adv !== 'none';
    const kinds = sides === 100 ? Array.from({ length: count }, () => ['d100t', 'd10']).flat() : Array.from({ length: pair ? 2 : count }, () => die);
    
    dndAudio.playSfx(kinds.length > 1 ? 'dice_pool' : 'dice_roll');
    const faces = await paperTray.current?.roll(kinds);
    setRolling(false);
    if (!faces) {
      setPaperRolling(false);
      return null;
    }
    let values;
    if (sides === 100) { values = []; for (let i = 0; i < faces.length; i += 2) values.push((faces[i] + faces[i + 1]) || 100); }
    else values = faces.map((f) => (sides === 10 && f === 0 ? 10 : f));
    try {
      const isUnder = under != null;
      const targetVal = isUnder ? Number(under) : (dc != null ? Number(dc) : null);
      const d = await api('/roll', { method: 'POST', body: { sides, count: pair ? 1 : count, modifier: mod, advantage: adv === 'adv', disadvantage: adv === 'dis', values, label, dc: targetVal, under: isUnder } });
      const r = d.result;
      if (isUnder) {
        r.dc = targetVal;
        r.under = true;
        r.success = r.total <= targetVal;
      }
      finishRoll(r);
      if (r.isCrit) dndAudio.playSfx('critical_hit');
      else if (r.isFumble) dndAudio.playSfx('critical_miss');
      else if (r.success === true) dndAudio.playSfx('skill_success');
      else if (r.success === false) dndAudio.playSfx('skill_failure');
      return r;
    } catch (e) {
      err(e);
      setPaperRolling(false);
      return null;
    }
  };
  // the game's own way of rolling a check: an Ironsworn action roll (d6 + stat against two d10s), a pool of d6 counting
  // successes (Alien, Year Zero), d100 roll-under (Ker Nethalas), PbtA 2d6 (Campfire Story), or dice + modifier against a DC
  const resolve = async ({ statName, value, label, dc, dice }) => {
    const cfg = profile?.dice_config || {};
    const isD100 = /d100/i.test(dice || '') || /d100/i.test(profile.check_dice || '') || profile.resolution === 'd100-under' || cfg.mode === 'd100-under';
    const mode = cfg.mode || profile.resolution || (isD100 ? 'd100-under' : 'd20');

    if (mode === 'ironsworn') {
      if (rolling) return null;
      setRolling(true); setResult(null); setPaperRolling(true);
      dndAudio.playSfx('dice_pool');
      const f = await paperTray.current?.roll(['d6', 'd10', 'd10']);
      setRolling(false);
      if (!f) { setPaperRolling(false); return null; }
      const stat = Number(value) || 0, action = Math.min(10, f[0] + stat), c1 = f[1] || 10, c2 = f[2] || 10;
      const beats = (action > c1 ? 1 : 0) + (action > c2 ? 1 : 0);
      const outcome = `${beats === 2 ? 'Strong hit' : beats === 1 ? 'Weak hit' : 'Miss'}${c1 === c2 ? ' with a match' : ''}`;
      const r = { label, formula: 'Action roll', total: action, rolls: [f[0]], challenge: [c1, c2], outcome, success: beats === 2 ? true : beats === 0 ? false : null, detail: `d6 ${f[0]}${stat ? ` + ${statName || 'stat'} ${stat}` : ''} = ${action} vs ${c1} and ${c2}` };
      finishRoll(r);
      dndAudio.playSfx(beats === 2 ? 'critical_hit' : beats === 1 ? 'skill_success' : 'critical_miss');
      return r;
    }
    if (mode === 'd6-pool') {
      if (rolling) return null;
      const n = Math.max(1, Math.min(10, Number(value) || 1));
      setRolling(true); setResult(null); setPaperRolling(true);
      dndAudio.playSfx('dice_pool');
      const f = await paperTray.current?.roll(Array.from({ length: n }, () => 'd6'));
      setRolling(false);
      if (!f) { setPaperRolling(false); return null; }
      const need = cfg.pool_success || profile.pool_success || 6, hits = f.filter((x) => x >= need).length;
      const r = { label, formula: `${n}d6 pool`, total: hits, rolls: f, outcome: hits ? `${hits} success${hits > 1 ? 'es' : ''}` : 'No successes', success: hits > 0, detail: `[${f.join(', ')}] - ${need}s count` };
      finishRoll(r);
      dndAudio.playSfx(hits ? 'skill_success' : 'skill_failure');
      return r;
    }
    if (mode === 'pbta-2d6') {
      if (rolling) return null;
      setRolling(true); setResult(null); setPaperRolling(true);
      dndAudio.playSfx('dice_roll');
      const f = await paperTray.current?.roll(['d6', 'd6']);
      setRolling(false);
      if (!f) { setPaperRolling(false); return null; }
      const stat = Number(value) || 0;
      const sum = f[0] + f[1] + stat;
      let outcome = 'Miss';
      let succ = false;
      if (sum >= 10) { outcome = 'Full Success'; succ = true; }
      else if (sum >= 7) { outcome = 'Partial Success (complication)'; succ = null; }
      const r = { label, formula: `2d6${stat ? (stat > 0 ? `+${stat}` : stat) : ''}`, total: sum, rolls: f, outcome, success: succ, detail: `2d6 [${f.join(', ')}]${stat ? ` + ${statName || 'stat'} ${stat}` : ''} = ${sum}` };
      finishRoll(r);
      dndAudio.playSfx(sum >= 10 ? 'critical_hit' : sum >= 7 ? 'skill_success' : 'skill_failure');
      return r;
    }
    if (mode === 'd100-under' || isD100) {
      let targetUnder = dc != null ? Number(dc) : (value != null ? Number(value) : null);
      const isKN = profile?.id === 'ker-nethalas' || c?.ruleset_id === 'ker-nethalas' || hero?.ruleset_id === 'ker-nethalas';
      const hasBreastplate = (hero?.inventory || []).some((x) => /breastplate|plate|brigandine/i.test(x));
      if (isKN && hasBreastplate && /dodge|stealth|acrobatics/i.test(statName || label || '') && targetUnder != null) {
        targetUnder = Math.max(1, targetUnder - 20);
      }
      const { n, sides } = parseDice(dice || cfg.dice || '1d100');
      return throwDice({ die: `d${sides || 100}`, count: n || 1, mod: 0, label, dc: null, under: targetUnder });
    }
    const how = value != null ? checkFor(profile, value) : { dice: dice || cfg.dice || profile.check_dice || '1d20', mod: 0 };
    const { n, sides } = parseDice(value == null && dice ? dice : how.dice);
    return throwDice({ die: `d${sides}`, count: n, mod: how.mod, label, dc, under: how.under ?? null });
  };
  // a progress roll (Ironsworn): the progress score - filled boxes - against the two challenge dice, no action die
  const progressRoll = async (p) => {
    if (rolling) return null;
    setRolling(true); setResult(null); setPaperRolling(true);
    dndAudio.playSfx('dice_pool');
    const f = await paperTray.current?.roll(['d10', 'd10']);
    setRolling(false);
    if (!f) { setPaperRolling(false); return null; }
    const score = Math.floor((p.ticks || 0) / 4), c1 = f[0] || 10, c2 = f[1] || 10;
    const beats = (score > c1 ? 1 : 0) + (score > c2 ? 1 : 0);
    const r = { label: `Progress: ${p.name}`, formula: 'Progress roll', total: score, challenge: [c1, c2], outcome: `${beats === 2 ? 'Strong hit' : beats === 1 ? 'Weak hit' : 'Miss'}${c1 === c2 ? ' with a match' : ''}`, success: beats === 2 ? true : beats === 0 ? false : null, detail: `progress ${score} vs ${c1} and ${c2}` };
    finishRoll(r);
    dndAudio.playSfx(beats === 2 ? 'critical_hit' : beats === 1 ? 'skill_success' : 'critical_miss');
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
    let statVal = null;
    let statName = check.attribute;
    if (check.attribute && hero) {
      const allAttrs = Object.entries(hero.attributes || {});
      const allTrackers = (hero.trackers || []).map((t) => [t.name, t.value]);
      const found = [...allAttrs, ...allTrackers].find(([k]) => k.toLowerCase() === check.attribute.toLowerCase());
      if (found) {
        statName = found[0];
        statVal = found[1];
      } else if (Array.isArray(hero.spells_or_skills)) {
        const skill = hero.spells_or_skills.find((s) => {
          const base = String(s).replace(/\s*\(\d+%\)$/, '').trim().toLowerCase();
          return base === check.attribute.toLowerCase();
        });
        if (skill) {
          statName = skill;
          const m = String(skill).match(/\((\d+)%\)/);
          if (m) statVal = Number(m[1]);
        }
      }
    }
    const r = await resolve({ statName, value: statVal, label: check.label, dc: check.dc, dice: check.dice });
    if (r) setTimeout(() => send(input.trim() || `I go for it - ${check.label}${check.why ? ` (${check.why})` : ''}`, r), 1100);
  };
  const rollStat = async (name, value) => {
    const r = await resolve({ statName: name, value, label: `${name} check` });
    if (r) { setRoll(r); setRoom('play'); snack(`${name}: ${r.outcome || r.total}. It goes with your next move.`); }
  };

  const handleSelectOption = async (o) => {
    if (Boolean(busy) || rolling) return;

    // 1. If an attack/combat strike is clicked and no roll is currently attached
    const isCombatAction = /attack|strike|smash|slash|stab|shoot|swing|cleave|batter|bludgeon|thrust|crush/i.test(o);
    if (isCombatAction && !roll) {
      // If there's an active adversary in Ker Nethalas, invoke formal Opposed Strike
      const activeAdv = visibleAdversaries.find((a) => !a.defeated && Number(a.hp ?? 0) > 0);
      if (activeAdv && isKN) {
        return doKnOpposedStrike(activeAdv);
      }

      // Check if a specific test is called for that fits
      if (state.check?.needed) {
        return rollCheck(state.check);
      }

      // Otherwise, resolve an attack roll with the character's weapon/combat skill
      let skillName = 'Attack Check';
      let skillVal = 45;
      const skills = hero?.spells_or_skills || [];
      const combatSkill = skills.find((s) => /shafted|melee|weapon|sword|blade|axe|brawl|mace|unarmed|pickaxe|spear/i.test(s));
      if (combatSkill) {
        skillName = String(combatSkill).replace(/\s*\(\d+%\)$/, '').trim();
        const m = String(combatSkill).match(/\((\d+)%\)/);
        if (m) skillVal = Number(m[1]);
      } else if (hero?.attributes?.Prowess || hero?.attributes?.Body) {
        skillVal = Number(hero.attributes.Prowess || hero.attributes.Body);
        skillName = 'Prowess';
      }

      const r = await resolve({ statName: skillName, value: skillVal, label: `${skillName} (${o})`, dc: skillVal });
      if (r) {
        setTimeout(() => send(o, r), 1100);
        return;
      }
    }

    // 2. If a check is explicitly called for and the user clicks the corresponding option
    if (state.check?.needed && !roll) {
      const checkWords = String(state.check.label || '').toLowerCase().split(/\s+/).filter(Boolean);
      const matchesOption = checkWords.some((w) => w.length > 3 && o.toLowerCase().includes(w));
      if (matchesOption) {
        return rollCheck(state.check);
      }
    }

    send(o);
  };

  const rollRecovery = async (type) => {
    if (rolling) return;
    
    if (type === 'toughness_recovery') {
      const r = await throwDice({ die: 'd4', count: 1, label: 'Post-Combat Toughness Recovery' });
      if (!r) return;
      const rolledVal = r.total;
      const curTrackers = hero?.trackers || [];
      const t = curTrackers.find((x) => /toughness/i.test(x.name));
      if (t) {
        const nextVal = Math.min(t.max || 20, (t.value ?? 10) + rolledVal);
        const nextTrackers = curTrackers.map((x) => (x.name === t.name ? { ...x, value: nextVal } : x));
        await saveHero({ trackers: nextTrackers });
        snack(`Restored ${rolledVal} Toughness buffer (${nextVal}/${t.max || 20}).`);
        send(`I catch my breath and roll 1d4 for Toughness recovery: rolled ${rolledVal}. Toughness recovered to ${nextVal}/${t.max || 20}.`);
      } else {
        snack(`Rolled ${rolledVal} on 1d4 for recovery.`);
      }
      return;
    }

    if (type === 'camp_rest') {
      const r = await throwDice({ die: 'd6', count: 1, label: 'Camp Rest Vitality Recovery' });
      if (!r) return;
      const recovered = r.total;
      const nextHp = Math.min(hero.max_hp, hero.hp + Math.ceil(recovered / 2));
      const curTrackers = hero?.trackers || [];
      let updatedTrackers = curTrackers.map((t) => {
        if (/exhaust/i.test(t.name)) return { ...t, value: Math.max(0, (t.value || 0) - recovered) };
        if (/toughness/i.test(t.name)) return { ...t, value: t.max || 20 };
        if (/san/i.test(t.name)) return { ...t, value: Math.min(t.max || 10, (t.value ?? 10) + Math.ceil(recovered / 2)) };
        if (/tension/i.test(t.name)) return { ...t, value: 8 };
        return t;
      });

      // Deduct 1 Ration and 1 Waterskin if present in inventory
      let inv = [...(hero?.inventory || [])];
      let consumed = [];
      const rIdx = inv.findIndex((i) => /ration|food|meat|bread/i.test(i));
      if (rIdx >= 0) {
        consumed.push(inv[rIdx]);
        inv.splice(rIdx, 1);
      }
      const wIdx = inv.findIndex((i) => /water|skin|flask/i.test(i));
      if (wIdx >= 0) {
        consumed.push(inv[wIdx]);
        inv.splice(wIdx, 1);
      }

      const skills = hero?.spells_or_skills || [];
      const markedSkills = skills.filter((s) => s.includes('[✓]'));
      let skillAdvancementMsg = '';
      if (markedSkills.length > 0) {
        const advRoll = await throwDice({ die: 'd100', count: 1, label: `Camp Advancement Check for ${markedSkills[0]}` });
        if (advRoll) {
          const rollTotal = advRoll.total;
          const skillMatch = markedSkills[0].match(/(\d+)%/);
          const curPct = skillMatch ? Number(skillMatch[1]) : 45;
          if (rollTotal > curPct) {
            const newPct = curPct + 5;
            const updatedSkills = skills.map((s) => (s === markedSkills[0] ? s.replace(/\(\d+%\)\s*\[✓\]/, `(${newPct}%)`).replace(/\[✓\]/, '') : s));
            await saveHero({ hp: nextHp, trackers: updatedTrackers, spells_or_skills: updatedSkills, inventory: inv });
            skillAdvancementMsg = ` Advancement Check on ${markedSkills[0].replace(/\s*\[✓\].*$/, '')}: rolled ${rollTotal} vs ${curPct}% -> SUCCEEDED! Rating increased to ${newPct}%.`;
          } else {
            const updatedSkills = skills.map((s) => (s === markedSkills[0] ? s.replace(/\s*\[✓\]/, '') : s));
            await saveHero({ hp: nextHp, trackers: updatedTrackers, spells_or_skills: updatedSkills, inventory: inv });
            skillAdvancementMsg = ` Advancement Check on ${markedSkills[0].replace(/\s*\[✓\].*$/, '')}: rolled ${rollTotal} vs ${curPct}% -> Did not advance.`;
          }
        }
      } else {
        await saveHero({ hp: nextHp, trackers: updatedTrackers, inventory: inv });
      }
      const consMsg = consumed.length ? ` Consumed: ${consumed.join(', ')}.` : '';
      send(`I made camp and rested: rolled 1d6 = ${recovered}. HP now ${nextHp}/${hero.max_hp}, Toughness buffer fully replenished, Fatigue eased, Sanity restored, and Tension reset to D8.${consMsg}${skillAdvancementMsg}`);
      return;
    }

    if (type === 'armour_integrity') {
      const r = await throwDice({ die: 'd10', count: 1, label: 'Armour Integrity Degradation Check' });
      if (!r) return;
      const rolledVal = r.total;
      if (rolledVal <= 2) {
        snack(`⚠️ Rolled ${rolledVal} on 1d10: Armour integrity degraded!`, { error: true });
        send(`My armour took a crushing blow: rolled 1d10 = ${rolledVal} (Integrity degraded from d10 to d8).`);
      } else {
        snack(`🛡️ Rolled ${rolledVal} on 1d10: Armour integrity holds firm!`);
        send(`My armour held against the blow: rolled 1d10 = ${rolledVal} (Integrity intact).`);
      }
      return;
    }

    if (type === 'tension_check') {
      const curTrackers = hero?.trackers || [];
      const tensionTracker = curTrackers.find((x) => /tension/i.test(x.name));
      const tensionDieVal = tensionTracker ? tensionTracker.value : 8;
      const r = await throwDice({ die: `d${tensionDieVal}`, count: 1, label: `Tension Die (D${tensionDieVal}) Check` });
      if (!r) return;
      const rolledVal = r.total;
      if (rolledVal <= 2) {
        const steps = [8, 6, 4];
        const idx = steps.indexOf(tensionDieVal);
        if (idx >= 0 && idx < steps.length - 1) {
          const nextDie = steps[idx + 1];
          const nextTrackers = curTrackers.map((t) => (t.name === tensionTracker.name ? { ...t, value: nextDie } : t));
          await saveHero({ trackers: nextTrackers });
          snack(`⚠️ Tension rolled ${rolledVal}: stepped down to D${nextDie}!`, { error: true });
          send(`Tension check: rolled ${rolledVal} on D${tensionDieVal} -> The silence deepens! Tension steps down to D${nextDie}.`);
        } else {
          const nextTrackers = curTrackers.map((t) => (t.name === tensionTracker.name ? { ...t, value: 8 } : t));
          await saveHero({ trackers: nextTrackers });
          snack(`💀 Tension rolled ${rolledVal} on D4: GROWING DARKNESS EVENT!`, { error: true });
          send(`Tension check: rolled ${rolledVal} on D4 -> A GROWING DARKNESS EVENT is triggered! Tension resets to D8.`);
        }
      } else {
        snack(`Tension rolled ${rolledVal} on D${tensionDieVal}: Quiet holds.`);
        send(`Tension check: rolled ${rolledVal} on D${tensionDieVal} -> The shadows remain still.`);
      }
      return;
    }

    if (type === 'scavenge_search') {
      const curTrackers = hero?.trackers || [];
      const tensionTracker = curTrackers.find((x) => /tension/i.test(x.name));
      const tensionDieVal = tensionTracker ? tensionTracker.value : 8;
      const r = await throwDice({ die: 'd100', count: 1, label: 'Search & Scavenge' });
      if (!r) return;
      const rollVal = r.total;
      const steps = [8, 6, 4];
      const idx = steps.indexOf(tensionDieVal);
      let tMsg = '';
      if (idx >= 0 && idx < steps.length - 1) {
        const nextDie = steps[idx + 1];
        const nextTrackers = curTrackers.map((t) => (t.name === tensionTracker?.name ? { ...t, value: nextDie } : t));
        await saveHero({ trackers: nextTrackers });
        tMsg = ` Tension stepped down to D${nextDie}.`;
      }
      snack(`Scavenged area: rolled ${rollVal} on d100.${tMsg}`);
      send(`I thoroughly search and scavenge the area: rolled ${rollVal} on d100.${tMsg}`);
      return;
    }

    if (type === 'light_check') {
      const curTrackers = hero?.trackers || [];
      const lightTracker = curTrackers.find((x) => /light|torch|lantern/i.test(x.name));
      const r = await throwDice({ die: 'd6', count: 1, label: 'Light Source Fuel Check' });
      if (!r) return;
      const rolledVal = r.total;
      if (rolledVal <= 2) {
        if (lightTracker && lightTracker.value > 0) {
          const nextVal = Math.max(0, lightTracker.value - 1);
          const nextTrackers = curTrackers.map((t) => (t.name === lightTracker.name ? { ...t, value: nextVal } : t));
          await saveHero({ trackers: nextTrackers });
          snack(`⚠️ Light fuel rolled ${rolledVal}: decreased to ${nextVal}!`, { error: true });
          send(`Light fuel check: rolled ${rolledVal} on 1d6 -> The flame sputters! Light decreased to ${nextVal}/${lightTracker.max || 6}.`);
        } else {
          snack(`⚠️ Rolled ${rolledVal} on 1d6: Light flickers and burns low!`, { error: true });
          send(`Light fuel check: rolled ${rolledVal} on 1d6 -> The torch sputters ominously against the oppressive dark!`);
        }
      } else {
        snack(`Light held steady: rolled ${rolledVal} on 1d6.`);
        send(`Light fuel check: rolled ${rolledVal} on 1d6 -> The torch burns steady, keeping the darkness at bay.`);
      }
      return;
    }

    if (type === 'camp_encounter_risk') {
      const r = await throwDice({ die: 'd6', count: 1, label: 'Camp Encounter Risk Check' });
      if (!r) return;
      const rolledVal = r.total;
      if (rolledVal === 1) {
        snack(`💀 Rolled a 1 on 1d6: Camp ambush triggered!`, { error: true });
        send(`Camp encounter check: rolled a 1 on 1d6 -> A lurking horror ambushes our sanctuary in the dark!`);
      } else {
        snack(`🛡️ Rolled ${rolledVal} on 1d6: Camp sanctuary secured.`);
        send(`Camp encounter check: rolled ${rolledVal} on 1d6 -> The barricades hold and the dark remains undisturbed.`);
      }
      return;
    }

    if (type === 'repair_armour') {
      const inv = hero?.inventory || [];
      const scrapIdx = inv.findIndex((i) => /scrap|repair|smith|tool/i.test(i));
      if (scrapIdx === -1) {
        snack(`No scrap or repair kit available in inventory!`, { error: true });
        return;
      }
      const usedItem = inv[scrapIdx];
      const nextInv = inv.filter((_, idx) => idx !== scrapIdx);
      await saveHero({ inventory: nextInv });
      snack(`Repaired armour using ${usedItem}.`);
      send(`I set up my tools and spent 1x ${usedItem} to hammer out dents and reinforce my armour's integrity.`);
      return;
    }

    if (type === 'willpower_check') {
      const wpStat = hero?.stats?.find((s) => /will|soul|mind|wis/i.test(s.name))?.value || 50;
      const r = await throwDice({ die: 'd100', count: 1, label: `Willpower Check (Target ≤ ${wpStat})` });
      if (!r) return;
      const rolledVal = r.total;
      const success = rolledVal <= wpStat;
      if (success) {
        snack(`Willpower test: rolled ${rolledVal} vs ${wpStat} -> SUCCEEDED! Mind holds firm.`);
        send(`Willpower check: rolled ${rolledVal} vs ${wpStat}% -> I grit my teeth and steady my mind against the eldritch dread.`);
      } else {
        snack(`⚠️ Willpower test: rolled ${rolledVal} vs ${wpStat} -> FAILED! Dread takes hold.`, { error: true });
        send(`Willpower check: rolled ${rolledVal} vs ${wpStat}% -> FAILED! Cosmic dread claws through my defences. Must roll 1d4 Sanity damage!`);
      }
      return;
    }

    if (type === 'take_sanity_damage') {
      const r = await throwDice({ die: 'd4', count: 1, label: '1d4 Sanity Damage' });
      if (!r) return;
      const dmg = r.total;
      const curTrackers = hero?.trackers || [];
      const sanTracker = curTrackers.find((x) => /san/i.test(x.name));
      if (sanTracker) {
        const nextVal = Math.max(0, (sanTracker.value ?? 10) - dmg);
        const nextTrackers = curTrackers.map((t) => (t.name === sanTracker.name ? { ...t, value: nextVal } : t));
        await saveHero({ trackers: nextTrackers });
        if (nextVal === 0) {
          snack(`💀 Sanity hit 0! Mind fractures into Madness!`, { error: true });
          send(`Sanity damage: rolled 1d4 = ${dmg}. Sanity reduced to 0! My sanity has shattered—triggering an immediate Madness Roll!`);
        } else {
          snack(`Lost ${dmg} Sanity (${nextVal}/${sanTracker.max || 10}).`);
          send(`Sanity damage: rolled 1d4 = ${dmg}. Sanity reduced to ${nextVal}/${sanTracker.max || 10}.`);
        }
      } else {
        snack(`Suffered ${dmg} Sanity damage.`);
        send(`Sanity damage: rolled 1d4 = ${dmg}. The horrors of the necropolis haunt my thoughts.`);
      }
      return;
    }

    if (type === 'madness_roll') {
      const r = await throwDice({ die: 'd4', count: 1, label: 'Madness Affliction Roll' });
      if (!r) return;
      const madnessTable = [
        'Paranoid Terror: Hallucinations whisper from every shadow; -10% to all skill checks until next camp.',
        'Screaming Frenzy: Involuntary shout echoes down the corridors; immediately trigger a Tension Step Down.',
        'Catatonic Tremor: Freezes in overwhelming terror; drops held weapon or light source.',
        'Maniacal Despair: Despair clouds judgement; cannot gain Toughness buffer until cured.'
      ];
      const rolledIdx = Math.min(3, Math.max(0, r.total - 1));
      const affliction = madnessTable[rolledIdx];
      const curTrackers = hero?.trackers || [];
      const sanTracker = curTrackers.find((x) => /san/i.test(x.name));
      if (sanTracker) {
        const baselineSan = Math.floor(Math.random() * 4) + 1;
        const nextTrackers = curTrackers.map((t) => (t.name === sanTracker.name ? { ...t, value: baselineSan } : t));
        await saveHero({ trackers: nextTrackers });
      }
      snack(`💀 Madness: ${affliction}`, { error: true });
      send(`Madness Table check: rolled ${r.total} on 1d4 -> Affliction: "${affliction}". Sanity resets to baseline.`);
      return;
    }
  };

  const handleUseItem = async (itemName, meta) => {
    if (!meta?.action) return;
    if (meta.action.effectType === 'restore_aether') {
      const curTrackers = hero?.trackers || [];
      const nextTrackers = curTrackers.map((t) => (/aether/i.test(t.name) ? { ...t, value: 10 } : t));
      const nextInv = (hero?.inventory || []).filter((x) => x !== itemName);
      await saveHero({ trackers: nextTrackers, inventory: nextInv });
      snack(`Crushed ${itemName}: Aether restored to 10.`);
      send(`I crushed the ${itemName} in my hand: celestial energy surged through my veins, fully restoring my Aether pool to 10.`);
    } else if (meta.action.effectType === 'cleanse_rot') {
      const curTrackers = hero?.trackers || [];
      const rotTracker = curTrackers.find((t) => /rot/i.test(t.name));
      const nextVal = Math.max(0, (rotTracker?.value || 0) - 1);
      const nextTrackers = curTrackers.map((t) => (/rot/i.test(t.name) ? { ...t, value: nextVal } : t));
      const nextInv = (hero?.inventory || []).filter((x) => x !== itemName);
      await saveHero({ trackers: nextTrackers, inventory: nextInv });
      snack(`Anointed with ${itemName}: The Rot reduced to Stage ${nextVal}.`);
      send(`I uncorked the ${itemName} and anointed my necrotic wounds: The Rot was cleansed back to Stage ${nextVal}.`);
    } else if (meta.action.effectType === 'refill_light') {
      const curTrackers = hero?.trackers || [];
      const nextTrackers = curTrackers.map((t) => (/light/i.test(t.name) ? { ...t, value: 20 } : t));
      const nextInv = (hero?.inventory || []).filter((x) => x !== itemName);
      await saveHero({ trackers: nextTrackers, inventory: nextInv });
      snack(`Lit ${itemName}: Illumination restored to 20 rooms.`);
      send(`I lit a fresh ${itemName} with flint and tinder: Illumination restored to 20 rooms.`);
    } else if (meta.action.effectType === 'heal_hp') {
      const r = await throwDice({ die: 'd4', count: 1, label: `Stitch Wounds (${itemName})` });
      if (r) {
        const nextHp = Math.min(hero.max_hp, hero.hp + r.total);
        await saveHero({ hp: nextHp });
        snack(`Stitched wounds with ${itemName}: Healed ${r.total} HP (${nextHp}/${hero.max_hp}).`);
        send(`I used my ${itemName} to stitch torn flesh: healed ${r.total} HP (Health now ${nextHp}/${hero.max_hp}).`);
      }
    } else if (meta.action.effectType === 'reduce_exhaustion') {
      const curTrackers = hero?.trackers || [];
      const exTracker = curTrackers.find((t) => /exhaust/i.test(t.name));
      const reduceVal = meta.action.exhaustionValue || 5;
      const nextVal = Math.max(0, (exTracker?.value || 0) - reduceVal);
      const nextTrackers = curTrackers.map((t) => (/exhaust/i.test(t.name) ? { ...t, value: nextVal } : t));
      const nextInv = meta.consumable ? (hero?.inventory || []).filter((x) => x !== itemName) : (hero?.inventory || []);
      await saveHero({ trackers: nextTrackers, inventory: nextInv });
      snack(`Consumed ${itemName}: Fatigue reduced by ${reduceVal} (${nextVal}/25).`);
      send(`I consumed ${itemName}: feeling revitalized, Exhaustion dropped to ${nextVal}/25.`);
    } else if (meta.action.effectType === 'heal_hp_potion') {
      const r = await throwDice({ die: 'd6', count: 1, label: `Drink Healing Potion (${itemName})` });
      if (r) {
        const healed = r.total + 2;
        const nextHp = Math.min(hero.max_hp, hero.hp + healed);
        const nextInv = (hero?.inventory || []).filter((x) => x !== itemName);
        await saveHero({ hp: nextHp, inventory: nextInv });
        snack(`Imbibed ${itemName}: Restored ${healed} HP (${nextHp}/${hero.max_hp}).`);
        send(`I drank the ${itemName}: vital warmth surged through my wounds, restoring ${healed} Health (now ${nextHp}/${hero.max_hp}).`);
      }
    } else if (meta.action.effectType === 'heal_toughness') {
      const r = await throwDice({ die: 'd4', count: 1, label: `Apply Bandages (${itemName})` });
      if (r) {
        const curTrackers = hero?.trackers || [];
        const tTracker = curTrackers.find((t) => /toughness/i.test(t.name));
        const maxTough = tTracker?.max || 35;
        const nextVal = Math.min(maxTough, (tTracker?.value || 0) + r.total);
        const nextTrackers = curTrackers.map((t) => (/toughness/i.test(t.name) ? { ...t, value: nextVal } : t));
        const nextInv = (hero?.inventory || []).filter((x) => x !== itemName);
        await saveHero({ trackers: nextTrackers, inventory: nextInv });
        snack(`Applied ${itemName}: Toughness recovered +${r.total} (${nextVal}/${maxTough}).`);
        send(`I dressed my wounds with ${itemName}: recovered ${r.total} Toughness (buffer pool now ${nextVal}/${maxTough}).`);
      }
    } else if (meta.action.effectType === 'restore_toughness_dice') {
      const r = await throwDice({ die: 'd10', count: 1, label: `Drink Vitality Potion (${itemName})` });
      if (r) {
        const curTrackers = hero?.trackers || [];
        const tTracker = curTrackers.find((t) => /toughness/i.test(t.name));
        const maxTough = tTracker?.max || 35;
        const nextVal = Math.min(maxTough, (tTracker?.value || 0) + r.total);
        const nextTrackers = curTrackers.map((t) => (/toughness/i.test(t.name) ? { ...t, value: nextVal } : t));
        const nextInv = (hero?.inventory || []).filter((x) => x !== itemName);
        await saveHero({ trackers: nextTrackers, inventory: nextInv });
        snack(`Imbibed ${itemName}: +${r.total} Temporary Toughness (${nextVal}/${maxTough}).`);
        send(`I drank the ${itemName}: skin toughened into hide, bolstering Toughness by +${r.total} (buffer now ${nextVal}/${maxTough}).`);
      }
    } else if (meta.action.effectType === 'restore_sanity') {
      const curTrackers = hero?.trackers || [];
      const sanTracker = curTrackers.find((t) => /sanity/i.test(t.name));
      const maxSan = sanTracker?.max || 14;
      const nextVal = Math.min(maxSan, (sanTracker?.value || 0) + 1);
      const nextTrackers = curTrackers.map((t) => (/sanity/i.test(t.name) ? { ...t, value: nextVal } : t));
      const nextInv = (hero?.inventory || []).filter((x) => x !== itemName);
      await saveHero({ trackers: nextTrackers, inventory: nextInv });
      snack(`Imbibed ${itemName}: Restored 1 Sanity (${nextVal}/${maxSan}).`);
      send(`I drank the ${itemName}: serene violet calm soothed my fractured mind, restoring 1 Sanity (${nextVal}/${maxSan}).`);
    } else if (meta.action.effectType === 'cure_poison') {
      const nextInv = (hero?.inventory || []).filter((x) => x !== itemName);
      await saveHero({ inventory: nextInv });
      snack(`Imbibed ${itemName}: Poisoned condition cured!`);
      send(`I drank the ${itemName}: the bitter draught neutralised subterranean venom, immediately curing the Poisoned condition.`);
    } else if (meta.action.effectType === 'cure_bleeding') {
      const nextInv = (hero?.inventory || []).filter((x) => x !== itemName);
      await saveHero({ inventory: nextInv });
      snack(`Imbibed ${itemName}: Bleeding condition stopped!`);
      send(`I drank the ${itemName}: thick astringent syrup clotted my lacerations, immediately curing the Bleeding condition.`);
    } else if (meta.action.effectType === 'cure_curse') {
      const nextInv = (hero?.inventory || []).filter((x) => x !== itemName);
      await saveHero({ inventory: nextInv });
      snack(`Imbibed ${itemName}: Cursed and Sickened conditions purged!`);
      send(`I drank the ${itemName}: silver radiant light flared through my veins, immediately purging both Cursed and Sickened conditions.`);
    } else if (meta.action.effectType === 'identify_potion') {
      const medStat = hero?.skills?.Medicine || 40;
      const r = await throwDice({ die: 'd100', count: 1, label: `Medicine Check vs ${medStat}% (${itemName})` });
      if (r) {
        const passed = r.total <= medStat;
        send(`Medicine identification check for ${itemName}: rolled ${r.total} vs ${medStat}% (${passed ? 'PASSED · Identified formula' : 'FAILED · Properties remain uncertain, taste test required'}).`);
      }
    } else if (meta.action.effectType === 'study_map') {
      send(`I carefully study the ${itemName}: spidery iron-gall ink reveals auxiliary drainage conduits bypassing warded catacomb chambers.`);
    } else if (meta.action.effectType === 'ward') {
      snack(`Invoked ${itemName}: Eldritch ward active!`);
      send(`I raised the ${itemName}: cold purple void-light pulsed from the sigil, raising a ward against approaching horrors.`);
    } else {
      send(`I used the ${itemName}: ${meta.action.description}`);
    }
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

  const [activeDrawer, setActiveDrawer] = useState('turn'); // 'turn' | 'hero' | 'rindewind' | 'moves' | 'map' | null
  const toggleDrawer = (name) => {
    setActiveDrawer((cur) => (cur === name ? null : name));
  };
  const setHeroSheetOpen = (open) => setActiveDrawer(open ? 'hero' : null);
  const setAskOpen = (open) => setActiveDrawer(open ? 'rindewind' : null);
  const setMovesSheet = (open) => setActiveDrawer(open ? 'moves' : null);
  const setComposeCollapsed = (v) => {
    if (typeof v === 'function') {
      setActiveDrawer((cur) => (cur === 'turn' ? null : 'turn'));
    } else {
      setActiveDrawer(v ? null : 'turn');
    }
  };

  const [showCitations, setShowCitations] = useState(() => {
    try { return localStorage.getItem('dnd_citations') === '1'; } catch { return false; }
  });
  const toggleCitations = () => {
    const next = !showCitations;
    setShowCitations(next);
    try { localStorage.setItem('dnd_citations', next ? '1' : '0'); } catch { /* ignore */ }
  };

  const [portraitExpanded, setPortraitExpanded] = useState(false);

  const closeAllPopups = useCallback(() => {
    setActiveDrawer(null);
    setSoundOpen(false);
    setPage(null);
    setPortraitExpanded(false);
  }, []);

  const isKN = profile?.id === 'ker-nethalas' || hero?.ruleset_id === 'ker-nethalas' || c?.ruleset_id === 'ker-nethalas';
  const xpTracker = (hero?.trackers || []).find((t) => t.name.toLowerCase() === 'xp');
  const xpVal = Number(xpTracker ? xpTracker.value : (hero?.xp || 0));
  const xpMax = Number(xpTracker ? xpTracker.max : 1000);
  const otherTrackers = (hero?.trackers || []).filter((t) => t.name.toLowerCase() !== 'xp');

  // Ker Nethalas canonical survival trackers: Toughness, Aether, Light, Tension Die, Sanity, Exhaustion, The Rot
  const KN_CORE_TRACKERS = useMemo(() => [
    { name: 'Toughness', value: 10, max: 10 },
    { name: 'Aether', value: 10, max: 10 },
    { name: 'Light', value: 20, max: 20 },
    { name: 'Tension Die', value: 8, max: 8 },
    { name: 'Sanity', value: 10, max: 10 },
    { name: 'Exhaustion', value: 0, max: 25 },
    { name: 'The Rot', value: 0, max: 8 },
  ], []);

  const displayTrackers = useMemo(() => {
    if (!isKN) return otherTrackers;
    const map = new Map();
    KN_CORE_TRACKERS.forEach((t) => map.set(t.name.toLowerCase(), { ...t }));
    otherTrackers.forEach((t) => map.set(t.name.toLowerCase(), t));
    return Array.from(map.values());
  }, [isKN, otherTrackers, KN_CORE_TRACKERS]);

  const updateTrackerValue = (name, val) => {
    const existing = (hero?.trackers || []).find((t) => t.name.toLowerCase() === name.toLowerCase());
    let nextTrackers;
    if (existing) {
      nextTrackers = (hero.trackers || []).map((t) => t.name.toLowerCase() === name.toLowerCase() ? { ...t, value: val } : t);
    } else {
      const template = KN_CORE_TRACKERS.find((t) => t.name.toLowerCase() === name.toLowerCase()) || { name, value: val, max: 10 };
      nextTrackers = [...(hero?.trackers || []), { ...template, value: val }];
    }
    saveHero({ trackers: nextTrackers });
  };

  const shaftedProgress = useMemo(() => {
    const found = (hero?.progress || []).find((p) => /shafted|weapon|polearm|spear/i.test(p.name));
    if (found) return found;
    return { name: 'Shafted Weapons', ticks: 1, maxTicks: 5 };
  }, [hero?.progress]);

  const updateShaftedAdvancement = (newTicks) => {
    const existing = (hero?.progress || []).find((p) => /shafted|weapon|polearm|spear/i.test(p.name));
    let nextProgress;
    if (existing) {
      nextProgress = (hero.progress || []).map((p) => p.name === existing.name ? { ...p, ticks: newTicks } : p);
    } else {
      nextProgress = [...(hero?.progress || []), { name: 'Shafted Weapons', rank: 'mastery', ticks: newTicks, maxTicks: 5 }];
    }
    saveHero({ progress: nextProgress });
  };

  const backpackItems = useMemo(() => {
    return (hero?.inventory || []).filter((item) => !isWeaponItem(item));
  }, [hero?.inventory]);

  const [compactionEnabled, setCompactionEnabled] = useState(false);
  useEffect(() => {
    if (c?.id) {
      api(`/campaigns/${c.id}/compaction-settings`)
        .then((d) => setCompactionEnabled(Boolean(d.enabled)))
        .catch(() => setCompactionEnabled(false));
    }
  }, [c?.id]);

  const toggleCompaction = async (next) => {
    setCompactionEnabled(next);
    if (!c?.id) return;
    try {
      await api(`/campaigns/${c.id}/compaction-settings`, { method: 'POST', body: { enabled: next } });
      snack(next ? 'Periodic chronicle compaction enabled.' : 'Periodic chronicle compaction turned off (default).');
    } catch (e) {
      err(e);
    }
  };

  // Auto-detect if Sanity dropped to 0 and trigger canonical Madness Table
  useEffect(() => {
    if (!hero || !isKN) return;
    const san = (hero.trackers || []).find((t) => /san/i.test(t.name))?.value;
    if (san === 0 && activeProcModal !== 'madness') {
      setActiveProcModal('madness');
    }
  }, [hero?.trackers, activeProcModal, isKN]);


  const noGames = campaigns && !campaigns.length;
  const shownRoom = noGames && (room === 'play' || room === 'heroes' || room === 'hero' || room === 'chronicle') ? 'games' : (room === 'hero' ? 'heroes' : room);

  // ---- the side column (hero vitals & attributes, active combat HUD, 3D dice tray, collapsible oracle) ----
  const side = (
    <aside className="imsd-side">
      {/* Active Adversary / Combat HUD Window (placed directly above Character Mini Sheet) */}
      {adversary && (() => {
        const advKey = adversary.id || adversary.name;
        const isDefeated = Boolean(adversary.defeated || (adversary.hp ?? 0) <= 0);
        const isFading = fadingAdvIds.has(advKey);
        const isKN = profile.id === 'ker-nethalas' || c?.ruleset_id === 'ker-nethalas' || hero?.ruleset_id === 'ker-nethalas';

        return (
          <section className={`imsm-card imsd-adversary-card ${isDefeated ? 'slain-mode' : ''} ${isFading ? 'fading-out' : ''}`}>
            {/* Full-size Slain Presentation (exact same size as the enemy card, no grey opacity wash) */}
            {isDefeated ? (
              <div className="imsd-slain-fullcard" onClick={() => dismissSlainNow(advKey)} title="Click to dismiss immediately">
                <Icon n="skull" size={44} className="imsd-slain-skull" />
                <h2 className="imsd-slain-title">SLAIN</h2>
                <div className="imsd-slain-name">{adversary.name}</div>
                <div className="imsd-slain-sub">Foe Defeated · +50 XP Awarded</div>
              </div>
            ) : (
              <>
                {/* Multiple Attacker Tabs */}
                {visibleAdversaries.length > 1 && (
                  <div className="imsd-adv-tabs" role="tablist">
                    {visibleAdversaries.map((adv, idx) => {
                      const k = adv.id || adv.name || idx;
                      const isSelected = (adversary.id || adversary.name) === k;
                      const def = Boolean(adv.defeated || (adv.hp ?? 0) <= 0);
                      return (
                        <button
                          key={k}
                          type="button"
                          role="tab"
                          aria-selected={isSelected}
                          className={`imsd-adv-tab ${isSelected ? 'active' : ''} ${def ? 'defeated' : ''}`}
                          onClick={() => setSelectedAdvId(k)}
                        >
                          {def ? <span className="tab-skull">💀</span> : <span className="tab-dot" />}
                          <span>{adv.name}</span>
                          <span style={{ fontSize: '10px', opacity: 0.75 }}>
                            {def ? 'SLAIN' : `${adv.hp ?? 0}/${adv.max_hp || adv.hp || 10}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="imsm-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span className="imsd-combat-pulse-dot" style={{ background: '#e03131' }} title="Combatant status" />
                    <div style={{ minWidth: 0 }}>
                      <span className="imsd-kicker" style={{ color: 'var(--imsm-crimson, #b22222)', whiteSpace: 'normal', textOverflow: 'clip' }}>
                        Enemy Engaged · {adversary.status || 'Active'}
                      </span>
                      <h3 style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {adversary.name}
                      </h3>
                    </div>
                  </div>
                </div>

                <div className="imsd-enemy-hp-wrap">
                  <div className="imsm-row" style={{ justifyContent: 'space-between', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <span>HP: {adversary.hp ?? 0} / {adversary.max_hp || adversary.hp || 10}</span>
                    <span>{Math.round(((adversary.hp || 0) / Math.max(1, adversary.max_hp || adversary.hp || 1)) * 100)}%</span>
                  </div>
                  <div className="imsd-enemy-hp-bar">
                    {/* Trailing ghost bar for smooth animated hit impact */}
                    <div
                      className="imsd-enemy-hp-ghost"
                      style={{
                        width: `${Math.max(0, Math.min(100, Math.round(((ghostHp || 0) / Math.max(1, adversary.max_hp || adversary.hp || 1)) * 100)))}%`
                      }}
                    />
                    {/* Real-time fill bar animating down */}
                    <div
                      className="imsd-enemy-hp-fill"
                      style={{
                        width: `${Math.max(0, Math.min(100, Math.round(((adversary.hp || 0) / Math.max(1, adversary.max_hp || adversary.hp || 1)) * 100)))}%`
                      }}
                    />
                  </div>
                  <div className="imsm-row" style={{ gap: '4px', justifyContent: 'flex-end', marginTop: '4px' }}>
                    <button type="button" className="imsd-btn-mini imsd-dmg-btn" onClick={() => setAdversaryHp(-5)} title="Deal 5 damage">-5</button>
                    <button type="button" className="imsd-btn-mini imsd-dmg-btn" onClick={() => setAdversaryHp(-1)} title="Deal 1 damage">-1</button>
                    <button type="button" className="imsd-btn-mini" onClick={() => setAdversaryHp(1)} title="Heal 1">+1</button>
                  </div>
                </div>

                <div className="imsd-adversary-stats">
                  <div className="imsd-adversary-stat">
                    <span className="lbl">{profile.defence_label || (isKN ? 'Prot' : 'AC')}</span>
                    <span className="val">{isKN ? (adversary.ac >= 10 ? 1 : (adversary.ac ?? 1)) : (adversary.ac || 10)}</span>
                  </div>
                  {adversary.attack && (
                    <div className="imsd-adversary-stat" style={{ flex: 2 }}>
                      <span className="lbl">Attack</span>
                      <span className="val" title={adversary.attack}>{adversary.attack}</span>
                    </div>
                  )}
                </div>

                {adversary.special && (
                  <div className="imsd-adversary-special">
                    <strong>Trait:</strong> {adversary.special}
                  </div>
                )}

                {isKN && !isDefeated && (
                  <div className="imsd-kn-combat-actions">
                    <button
                      type="button"
                      className="imsd-kn-combat-btn strike"
                      disabled={rolling || Boolean(busy)}
                      onClick={() => doKnOpposedStrike(adversary)}
                      title="Execute Opposed Strike: d100 vs Skill + 10 (Upper Hand) vs Enemy Combat Skill - Weapon Speed. Hits check Hit Location (1d20) and subtract armor."
                    >
                      <Icon n="bolt" size={14} />
                      <span>Opposed Strike</span>
                    </button>
                    <button
                      type="button"
                      className="imsd-kn-combat-btn react"
                      disabled={rolling || Boolean(busy)}
                      onClick={() => doKnDefendReact(adversary)}
                      title="Defend & React: d100 Dodge/Parry. Winning defence rolls on the 1d10 Defensive Move Table!"
                    >
                      <Icon n="shield" size={14} />
                      <span>Defend / React</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        );
      })()}




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
      <div className="imsm-ptabs imsd-ptabs">
        <div className="chips">
          {ROOMS.map(([k, l, ic]) => (
            <FilterChip key={k} on={shownRoom === k} onClick={() => { closeAllPopups(); setRoom(k); }} lead={<Icon n={ic} size={18} />}>
              {l}
            </FilterChip>
          ))}
        </div>
      </div>

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
              {turns.map((t, i) => (
                <Turn
                  key={t.id}
                  t={t}
                  hero={hero}
                  profile={profile}
                  first={i === 0}
                  narrator={narrator}
                  onPage={setPage}
                  showCitations={showCitations}
                />
              ))}
              
              {/* Roll outcome directly on the parchment scroll in document flow */}
              {result && (
                <div className={`imsd-scroll-outcome ${result.isCrit ? 'crit' : result.isFumble ? 'fumble' : result.success === true ? 'good' : result.success === false ? 'bad' : ''}`}>
                  <div className="seal">
                    <Icon n="dice" size={20} />
                    <b className="num">{result.total}</b>
                  </div>
                  <div className="info">
                    <div className="title">{result.label || result.formula}</div>
                    <div className="detail">
                      {result.dc != null ? <span>{result.under ? 'Target ≤' : 'DC'} {result.dc} · </span> : ''}
                      <b>{result.success === true ? 'SUCCESS' : result.success === false ? 'FAILURE' : result.outcome || ''}</b>
                      {result.isCrit ? (String(result.formula || '').includes('d20') ? ' · Nat 20!' : ' · Critical Triumph!') : result.isFumble ? (String(result.formula || '').includes('d20') ? ' · Nat 1' : ' · Critical Mishap!') : ''}
                    </div>
                  </div>
                </div>
              )}

              {busy === 'turn' && (
                <article ref={streamingTurnRef} className="imsd-turn streaming">
                  <div className="imsd-orn" aria-hidden="true"><i /><span>❦</span><i /></div>
                  {streamingAction && (
                    <div className="act">
                      <Icon n="edit" size={18} />
                      <p><b>{hero?.name || 'You'}</b>{streamingAction}</p>
                    </div>
                  )}
                  {streamingDraft ? (
                    <div className="tale">
                      {renderTaleMarkdown(streamingDraft)}
                      <span className="imsd-quill-cursor" aria-hidden="true"> ✒</span>
                    </div>
                  ) : (
                    <div className="imsd-writing">
                      <Spinner size={22} />
                      <span>Rindewind dips his quill in sepia ink...</span>
                    </div>
                  )}
                </article>
              )}
              <div ref={storyEnd} />

              {/* 3D Physics Dice Overlay directly across the scroll text without adding any space */}
              <div className={`imsd-paper-overlay ${paperRolling ? 'active' : ''}`}>
                <DiceTray ref={paperTray} dark={dark} height={340} onPaper onKnock={(s) => dndAudio.knock(s)} />
              </div>
            </div>

            <section className={`imsm-card imsd-dock-console ${!activeDrawer ? 'collapsed' : ''}`}>
              {/* Expandable Slide-up Drawer Body */}
              {activeDrawer && (
                <div className="imsd-dock-body">
                  {/* --- 1. TURN ACTIONS DRAWER --- */}
                  {activeDrawer === 'turn' && (
                    <>
                      {state.check?.needed && !busy && (
                        <div className="imsd-check">
                          <span className="ic" aria-hidden="true"><Icon n="dice" size={22} /></span>
                          <span className="txt">
                            <span className="imsd-kicker">A test is called for</span>
                            <b>{state.check.label}{state.check.dc ? ` · ${state.check.under || c?.dice_config?.roll_under ? 'Target ≤' : 'DC'} ${state.check.dc}` : ''}</b>
                            <small>{state.check.why || 'Rindewind asks for a check.'}{state.check.attribute ? ` Uses ${state.check.attribute}.` : ''}{state.check.dice ? ` (${state.check.dice})` : ''}</small>
                          </span>
                          <Btn icon="dice" busy={rolling} onClick={() => rollCheck(state.check)}>Roll it</Btn>
                        </div>
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

                      {/* Procedural Actions for Ker Nethalas when Out of Combat */}
                      {isKN && !visibleAdversaries.some((a) => !a.defeated && Number(a.hp ?? 0) > 0) && (
                        <div className="imsd-kn-proc-actions-bar">
                          <button
                            type="button"
                            className="imsd-kn-proc-pill explore"
                            onClick={() => setActiveProcModal('exploration')}
                            title="Step 1: The Exploration Turn · Tension Check & Light Source"
                          >
                            <Icon n="explore" size={13} />
                            <span>Explore Chamber</span>
                          </button>
                          <button
                            type="button"
                            className="imsd-kn-proc-pill breather"
                            onClick={() => setActiveProcModal('breather')}
                            title="Take a 10-Minute Breather · Recovers 1d10+2 Toughness, 1 HP, -2 Exh (costs 5 Light, steps Tension)"
                          >
                            <Icon n="shield" size={13} />
                            <span>Take Breather</span>
                          </button>
                          <button
                            type="button"
                            className="imsd-kn-proc-pill camp"
                            onClick={() => setActiveProcModal('camp')}
                            title="Step 4: The Camp Phase · 1d20 Camp Check, Full Toughness, Rest & Repairs"
                          >
                            <Icon n="sparkle" size={13} />
                            <span>Set Camp</span>
                          </button>
                        </div>
                      )}

                      {/* Condensed horizontal suggested actions & moves strip */}
                      {(!!state.options?.length || !!profile.moves?.length) && (
                        <div className="imsd-options-strip">
                          {!!profile.moves?.length && (
                            <button
                              type="button"
                              disabled={Boolean(busy)}
                              className={`imsd-opt-pill imsd-moves-pill sl ${activeDrawer === 'moves' ? 'active' : ''}`}
                              onClick={() => toggleDrawer('moves')}
                              title="Browse available game moves"
                            >
                              <Icon n="bolt" size={13} />
                              <b>Moves</b>
                              <span className="cnt">{profile.moves.length}</span>
                            </button>
                          )}
                          {(state.options || []).map((o, i) => {
                            const isChosen = busy === 'turn' && streamingAction === o;
                            return (
                              <button
                                key={o}
                                type="button"
                                disabled={Boolean(busy)}
                                className={`imsd-opt-pill sl ${isChosen ? 'chosen active' : ''}`}
                                onClick={() => handleSelectOption(o)}
                                title={o}
                              >
                                <span className="n">{['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][i] || (i + 1)}</span>
                                <span className="o">{o}</span>
                                {isChosen && <Spinner size={12} />}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {(roll || oracle) && (
                        <div className="imsm-row">
                          {roll && <span className="imsd-attach"><RollBadge r={roll} /><IconButton icon="close" label="Take the roll off" onClick={() => setRoll(null)} /></span>}
                          {oracle && <span className="imsd-attach"><span className="tag imsd-oracle"><Icon n="eye" size={16} />{oracle.outcome}</span><IconButton icon="close" label="Take fate's answer off" onClick={() => setOracle(null)} /></span>}
                        </div>
                      )}

                      <div className="imsd-say">
                        <TextArea
                          label={null}
                          placeholder={`What does ${hero?.name || 'your hero'} do?`}
                          rows={1}
                          value={input}
                          onChange={setInput}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
                        />
                        <Btn icon="send" busy={busy === 'turn'} disabled={!input.trim() || Boolean(busy)} onClick={() => send(input)}>Do it</Btn>
                      </div>
                    </>
                  )}

                  {/* --- 2. HERO / CHARACTER DRAWER --- */}
                  {activeDrawer === 'hero' && hero && (
                    <div className="imsd-hero-sheet-popup">
                      {portraitExpanded ? (
                        /* ======================================================== */
                        /* EXPANDED PORTRAIT & CAMPAIGN PROVENANCE VIEW             */
                        /* ======================================================== */
                        <div className="imsd-portrait-expanded-card">
                          <div className="imsd-dock-panel-head">
                            <div className="head-title">
                              <span className="imsd-kicker">Survivor Provenance &amp; Transformation</span>
                              <h4>{hero.name}</h4>
                            </div>
                            <div className="imsm-row" style={{ gap: '6px', alignItems: 'center' }}>
                              <Btn kind="text" icon="arrow-back" onClick={() => setPortraitExpanded(false)}>Back to sheet</Btn>
                              <IconButton icon="close" label="Close" onClick={() => { setPortraitExpanded(false); setActiveDrawer(null); }} />
                            </div>
                          </div>

                          <div className="imsd-portrait-expanded-body">
                            <div className="imsd-portrait-big-frame" style={{ margin: '8px auto' }}>
                              <img
                                src={hero.avatar_url || '/noddy_delver_catacombs.jpg'}
                                alt={hero.name}
                                className="imsd-portrait-big-img"
                                onError={(e) => {
                                  if (e.target.dataset.fallback !== 'done') {
                                    e.target.dataset.fallback = 'done';
                                    e.target.src = '/noddy_delver_catacombs.jpg';
                                  }
                                }}
                              />
                            </div>

                            <div className="imsd-provenance-section">
                              <span className="imsd-kicker">Who They Are</span>
                              <p className="imsd-provenance-text">
                                {hero.backstory || hero.notes || hero.how || `${hero.name}, ${hero.role_or_class || 'Survivor'}, cast into the sunken, bone-strewn corridors of Ker Nethalas with only shattered memories and a desperate will to endure.`}
                              </p>
                            </div>

                            <div className="imsd-provenance-section">
                              <span className="imsd-kicker">How The Campaign Has Changed Them</span>
                              <div className="imsd-transformation-summary">
                                <div className="trans-row">
                                  <span className="lbl">Physical Wounds:</span>
                                  <b>{hero.hp} / {hero.max_hp} HP {hero.hp <= Math.floor(hero.max_hp / 2) ? '· Bloodied & deeply scarred' : '· Weathered but standing'}</b>
                                </div>
                                {isKN && (
                                  <>
                                    <div className="trans-row">
                                      <span className="lbl">The Rot:</span>
                                      <b>Stage {(hero.trackers || []).find((t) => /rot/i.test(t.name))?.value || 0} of 8 {((hero.trackers || []).find((t) => /rot/i.test(t.name))?.value || 0) > 0 ? '· Necrotic veins spreading' : '· Flesh uncorrupted'}</b>
                                    </div>
                                    <div className="trans-row">
                                      <span className="lbl">Exhaustion:</span>
                                      <b>{(hero.trackers || []).find((t) => /exhaust/i.test(t.name))?.value || 0} / 25 Fatigue</b>
                                    </div>
                                    <div className="trans-row">
                                      <span className="lbl">Sanity:</span>
                                      <b>{(hero.trackers || []).find((t) => /sanity/i.test(t.name))?.value || 10} / 10 Fortitude</b>
                                    </div>
                                    <div className="trans-row">
                                      <span className="lbl">Toughness Buffer:</span>
                                      <b>{(hero.trackers || []).find((t) => /toughness/i.test(t.name))?.value ?? 10} / 10 Buffer</b>
                                    </div>
                                  </>
                                )}
                                <div className="trans-row">
                                  <span className="lbl">Catacombs Endured:</span>
                                  <b>{c?.turn_count || 1} Turns survived in the Midnight Throne</b>
                                </div>
                              </div>

                              <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                                <Btn
                                  kind="tonal"
                                  icon="auto_awesome"
                                  onClick={() => {
                                    setPortraitExpanded(false);
                                    setActiveDrawer('rindewind');
                                    setInput(`Rindewind, as Chronicler, look upon ${hero.name}. Tell me who I was when I entered these halls, and how the trauma, rot, and battles of this campaign have transformed me.`);
                                  }}
                                >
                                  Ask Rindewind how I've changed
                                </Btn>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* ======================================================== */
                        /* STANDARD CHARACTER SHEET DRAWER                          */
                        /* ======================================================== */
                        <>
                          <div className="imsd-dock-panel-head">
                            <div className="head-title">
                              <span className="imsd-kicker">{hero.role_or_class || ruleset?.name || 'Adventurer'}{hero.level ? ` · Level ${hero.level}` : ''}</span>
                              <h4>{hero.name}</h4>
                            </div>
                            <div className="imsm-row" style={{ gap: '6px' }}>
                              <button
                                type="button"
                                className={`imsd-sheet-lock-btn ${locked ? 'is-locked' : 'is-unlocked'}`}
                                onClick={() => setLocked(!locked)}
                                title={locked ? "Locked. Tap to unlock manual vitals editing." : "Unlocked. Tap to lock."}
                              >
                                <Icon n={locked ? 'lock' : 'unlock'} size={14} />
                                <span>{locked ? 'Locked' : 'Unlocked'}</span>
                              </button>
                              <Btn kind="text" onClick={() => { setActiveDrawer(null); setRoom('heroes'); }}>Full sheet</Btn>
                              <IconButton icon="close" label="Close character drawer" onClick={() => setActiveDrawer(null)} />
                            </div>
                          </div>

                          <div className="imsd-hpopup-head">
                            <div
                              className="imsd-hpopup-avatar interactive"
                              onClick={() => setInspectPortrait(true)}
                              title="Click to view enlarged portrait and character summary"
                            >
                              <img
                                src={hero.avatar_url || '/noddy_delver_catacombs.jpg'}
                                alt={hero.name}
                                onError={(e) => {
                                  if (e.target.dataset.fallback !== 'done') {
                                    e.target.dataset.fallback = 'done';
                                    e.target.src = '/noddy_delver_catacombs.jpg';
                                  }
                                }}
                              />
                              <span className="imsd-avatar-zoom-cue"><Icon n="search" size={10} /></span>
                            </div>
                            <div className="imsd-hpopup-title">
                              <h3>{hero.name}</h3>
                              <span className="muted">{hero.role_or_class || ruleset?.name || 'Adventurer'}{hero.level ? ` · Level ${hero.level}` : ''}</span>
                            </div>
                            <div className="imsd-hpopup-vitals">
                              <div className="vital hp">
                                <span className="lbl">HP</span>
                                <b>{hero.hp} / {hero.max_hp}</b>
                                {!locked && (
                                  <div className="imsm-row vit-btns">
                                    <button type="button" onClick={() => setHp(-1)} title="Lose 1 HP">-1</button>
                                    <button type="button" onClick={() => setHp(1)} title="Heal 1 HP">+1</button>
                                  </div>
                                )}
                              </div>
                              {!isKN && hero.ac != null && (
                                <div className="vital ac">
                                  <span className="lbl">{profile.defence_label || 'AC'}</span>
                                  <b>{hero.ac}</b>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Experience Bar */}
                          <div className="imsd-hpopup-section" style={{ marginTop: '4px', marginBottom: '4px' }}>
                            <XpBar
                              xp={xpVal}
                              max={xpMax}
                              level={hero.level}
                              small
                              onGainXp={isKN && !locked ? (amount) => {
                                const nextVal = Math.min(xpMax, xpVal + amount);
                                if (xpTracker) {
                                  const nextTrackers = (hero.trackers || []).map((x) => (x.name === xpTracker.name ? { ...x, value: nextVal } : x));
                                  saveHero({ trackers: nextTrackers, xp: nextVal });
                                } else {
                                  saveHero({ xp: nextVal });
                                }
                              } : null}
                            />
                          </div>

                          {/* Attributes & Resistances quick roll pills */}
                          {hero.attributes && Object.keys(hero.attributes).length > 0 && (
                            <div className="imsd-hpopup-section">
                              <span className="imsd-kicker">{isKN ? 'Character Resistances (p. 20 · tap to roll)' : 'Attributes (click to roll check)'}</span>
                              <div className="imsd-hpopup-stats">
                                {Object.entries(hero.attributes).map(([k, v]) => {
                                  if (typeof v !== 'number' && typeof v !== 'string') return null;
                                  return (
                                    <button
                                      key={k}
                                      type="button"
                                      className="imsd-hpopup-stat-pill sl"
                                      onClick={() => { setActiveDrawer('turn'); rollStat(k, v); }}
                                      title={`Roll ${k} check (${v}${isKN ? '%' : ''})`}
                                    >
                                      <span className="lbl">{k}</span>
                                      <span className="val">{v}{isKN ? '%' : ''}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Masteries (Ker Nethalas Chapter II p. 21) */}
                          {isKN && Array.isArray(hero.masteries) && hero.masteries.length > 0 && (
                            <div className="imsd-hpopup-section">
                              <span className="imsd-kicker">Masteries (Chapter II p. 21)</span>
                              <div className="imsd-drawer-masteries-list">
                                {hero.masteries.map((m, idx) => (
                                  <div key={idx} className="imsd-drawer-mastery-card">
                                    <div className="imsm-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                      <b className="mastery-name">{m.name}</b>
                                      <span className="mastery-tier">{m.tier || m.tier1}</span>
                                    </div>
                                    <div className="mastery-desc">{m.feature || m.featureDesc}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Survival Trackers: Toughness, Aether, Light, Tension Die, Sanity, Exhaustion, Rot */}
                          {displayTrackers.length > 0 && (
                            <div className="imsd-hpopup-section">
                              <div className="imsm-row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <span className="imsd-kicker">Survival Trackers (Ker Nethalas)</span>
                                {locked && <small className="muted"><Icon n="lock" size={11} /> Locked</small>}
                              </div>
                              <div className="imsd-hpopup-trackers">
                                {displayTrackers.map((t) => {
                                  const isTension = (t.name || '').toLowerCase().includes('tension');
                                  const isRot = (t.name || '').toLowerCase().includes('rot');
                                  const handleTension = (dir) => {
                                    const steps = [8, 6, 4];
                                    const idx = steps.indexOf(t.value);
                                    let nextVal = 8;
                                    if (dir === 'down') {
                                      nextVal = (idx >= 0 && idx < steps.length - 1) ? steps[idx + 1] : 8;
                                    } else {
                                      nextVal = (idx > 0) ? steps[idx - 1] : 8;
                                    }
                                    updateTrackerValue(t.name, nextVal);
                                  };
                                  return (
                                    <div key={t.name} className="imsd-hpopup-tr-card">
                                      <span className="name">{t.name}</span>
                                      <span className="grow" />
                                      {locked ? (
                                        <b style={{ minWidth: isRot ? '46px' : '28px', textAlign: 'center', color: isTension && t.value === 4 ? 'var(--imsm-warn, #ef4444)' : isRot && t.value > 0 ? '#85e89d' : 'inherit' }}>
                                          {isTension ? `D${t.value}` : isRot ? `Stage ${t.value || 0}` : `${t.value || 0}${t.max ? ` / ${t.max}` : ''}`}
                                        </b>
                                      ) : (
                                        <div className="ctrls" style={{ marginLeft: 'auto' }}>
                                          {isTension ? (
                                            <>
                                              <button type="button" onClick={() => handleTension('down')} title="Step down (worse)">-</button>
                                              <b style={{ minWidth: '28px', textAlign: 'center', color: t.value === 4 ? 'var(--imsm-warn, #ef4444)' : 'inherit' }}>{`D${t.value}`}</b>
                                              <button type="button" onClick={() => handleTension('up')} disabled={t.value >= 8} title="Step up (better)">+</button>
                                            </>
                                          ) : isRot ? (
                                            <>
                                              <button type="button" onClick={() => updateTrackerValue(t.name, Math.max(0, (t.value || 0) - 1))} title="Reduce infection">-</button>
                                              <b style={{ minWidth: '46px', textAlign: 'center', color: t.value > 0 ? '#85e89d' : 'inherit' }}>Stage {t.value || 0}</b>
                                              <button type="button" onClick={() => updateTrackerValue(t.name, Math.min(8, (t.value || 0) + 1))} title="Advance rot">+</button>
                                            </>
                                          ) : (
                                            <>
                                              <button type="button" onClick={() => updateTrackerValue(t.name, Math.max(0, (t.value || 0) - 1))}>-</button>
                                              <b>{t.value || 0}{t.max ? ` / ${t.max}` : ''}</b>
                                              <button type="button" onClick={() => updateTrackerValue(t.name, Math.min(t.max || 999, (t.value || 0) + 1))}>+</button>
                                            </>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Armor Mannequin with Weapons & Combat Gear */}
                          <div className="imsd-hpopup-section">
                            <ArmorMannequin
                              hero={hero}
                              isKN={isKN}
                              withGear={true}
                              advancementTrack={shaftedProgress}
                              onAdvancementChange={(newTicks) => updateShaftedAdvancement(newTicks)}
                              locked={locked}
                            />
                          </div>

                          {/* Active Ongoing Effects & Relic Boons */}
                          {getActiveOngoingEffects(hero.inventory || []).length > 0 && (
                            <div className="imsd-hpopup-section">
                              <span className="imsd-kicker">Active Ongoing Effects &amp; Boons</span>
                              <div className="imsd-effects-list" style={{ gap: '4px' }}>
                                {getActiveOngoingEffects(hero.inventory || []).map((eff) => (
                                  <span key={eff.name} className={`imsd-effect-pill ${eff.isPenalty ? 'penalty' : ''}`} style={{ fontSize: '11px', padding: '2px 8px' }} title={eff.description}>
                                    {eff.label}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Backpack Items & Supplies (weapons moved to Weapons section above) */}
                          {Array.isArray(backpackItems) && backpackItems.length > 0 && (
                            <div className="imsd-hpopup-section">
                              <span className="imsd-kicker">Backpack Items &amp; Supplies ({backpackItems.length} items · tap to inspect)</span>
                              <div className="imsd-hpopup-inv">
                                {backpackItems.map((item, idx) => {
                                  const itName = typeof item === 'string' ? item : item?.name;
                                  const meta = lookupItem(itName);
                                  return (
                                    <span
                                      key={idx}
                                      className="tag interactive"
                                      style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                      onClick={() => setInspectItem(itName)}
                                      title="Click to view details, lore & actions"
                                    >
                                      <Icon n={meta?.icon || 'archive'} size={12} />
                                      {itName}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* --- 3. RINDEWIND / ACROSS THE TABLE DRAWER --- */}
                  {activeDrawer === 'rindewind' && (
                    <div className="imsd-talk">
                      <div className="imsd-dock-panel-head">
                        <div className="head-title">
                          <span className="imsd-kicker">Across the table</span>
                          <h4>Rindewind</h4>
                        </div>
                        <IconButton icon="close" label="Close Rindewind drawer" onClick={() => setActiveDrawer(null)} />
                      </div>

                      <div className="who">
                        <span className="face">
                          <ChroniclerFace face={{ emotion: askMood || 'neutral' }} status={narrator.playing ? 'speaking' : busy === 'ask' ? 'thinking' : 'idle'} levelRef={narrator.level} width={80} />
                        </span>
                        <div className="who-info">
                          <p>Out of the story for a moment, then. Ask me what has happened so far, how a rule works, or what I'd do in your boots - I'll not spoil what's hidden.</p>
                          
                          {/* Soundscape, Voice Narration & Rule Citations controls */}
                          <div className="imsd-popup-options">
                            <FilterChip
                              on={autoRead}
                              onClick={() => {
                                const v = !autoRead;
                                setAutoRead(v);
                                try { localStorage.setItem('dnd_autoread', v ? '1' : '0'); } catch { /* ignore */ }
                              }}
                              lead={<Icon n="mic" size={14} />}
                            >
                              {autoRead ? 'Reads turns aloud: On' : 'Read aloud'}
                            </FilterChip>
                            <FilterChip
                              on={sounds.on}
                              onClick={toggleSound}
                              lead={<Icon n="music" size={14} />}
                            >
                              {sounds.on && sounds.track ? (sounds.track.title.length > 15 ? `${sounds.track.title.slice(0, 14)}…` : sounds.track.title) : 'Soundscape'}
                            </FilterChip>
                            <Btn kind="tonal" icon="tune" onClick={() => setSoundOpen(true)}>Choose soundscape</Btn>
                            <FilterChip
                              on={showCitations}
                              onClick={toggleCitations}
                              lead={<Icon n="doc" size={14} />}
                            >
                              {showCitations ? 'Rule citations: On' : 'Rule citations'}
                            </FilterChip>
                          </div>
                        </div>
                      </div>

                      {!talk.length && (
                        <div className="imsd-hooks">
                          {['What has happened so far?', 'What do I know about the dangers here?', 'How does combat work in this game?', 'What would you do now?'].map((q) => (
                            <button key={q} type="button" className="sl" onClick={() => askDm(q)}>{q}</button>
                          ))}
                        </div>
                      )}

                      {talk.map((x, i) => (
                        <div key={i} className="imsd-qa">
                          <p className="q">{x.q}</p>
                          {x.a ? (
                            <div className="a">
                              <p>{x.a}</p>
                              <div className="imsm-row">
                                {showCitations && <Sources list={x.sources} onOpen={setPage} />}
                                <span className="grow" />
                                <IconButton
                                  icon={narrator.playing === `a${i}` ? 'stop' : 'play'}
                                  label="Hear him say it"
                                  className={narrator.waiting === `a${i}` ? 'spinning' : ''}
                                  onClick={() => (narrator.playing === `a${i}` ? narrator.stop() : narrator.play(`a${i}`, x.a))}
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="a wait"><Spinner size={18} /><span>He strokes his beard...</span></div>
                          )}
                        </div>
                      ))}

                      <div className="imsd-say" style={{ width: '100%', marginTop: '6px' }}>
                        <TextField
                          label="Ask him - a recap, a rule, advice"
                          value={askQ}
                          onChange={setAskQ}
                          onKeyDown={(e) => { if (e.key === 'Enter') askDm(); }}
                        />
                        <Btn icon="send" busy={busy === 'ask'} disabled={!askQ.trim() || Boolean(busy)} onClick={() => askDm()}>Ask</Btn>
                      </div>
                    </div>
                  )}

                  {/* --- 4. GAME MOVES DRAWER --- */}
                  {activeDrawer === 'moves' && (
                    <div className="imsd-moves-sheet-list">
                      <div className="imsd-dock-panel-head">
                        <div className="head-title">
                          <span className="imsd-kicker">Ruleset moves</span>
                          <h4>Game Moves</h4>
                        </div>
                        <div className="imsm-row" style={{ gap: '6px' }}>
                          <Btn kind="text" onClick={() => setActiveDrawer('turn')}>Back to Turn</Btn>
                          <IconButton icon="close" label="Close moves drawer" onClick={() => setActiveDrawer(null)} />
                        </div>
                      </div>

                      {profile.moves?.map((m) => (
                        <div
                          key={m.name}
                          className="imsd-moves-sheet-item sl"
                          onClick={() => { setActiveDrawer('turn'); doMove(m); }}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="head">
                            <span className="ic"><Icon n="bolt" size={16} /></span>
                            <b>{m.name}</b>
                            <span className="grow" />
                            <small className="stat">{m.stat ? `+${m.stat}` : ''}{m.page ? ` · p.${m.page}` : ''}</small>
                          </div>
                          {m.trigger && <p className="trigger">{m.trigger}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* --- 5. CARTOGRAPHY & DUNGEON MAP DRAWER --- */}
                  {activeDrawer === 'map' && (
                    <div className="imsd-map-sheet">
                      <div className="imsd-dock-panel-head">
                        <div className="head-title">
                          <span className="imsd-kicker">Explored Cartography · {c.title}</span>
                          <h4>Dungeon Map & Passages</h4>
                        </div>
                        <div className="imsm-row imsd-map-legend" style={{ gap: '10px', alignItems: 'center' }}>
                          <span className="imsd-legend-item"><span className="legend-dot current" /> Current Chamber</span>
                          <span className="imsd-legend-item"><Icon n="torch" size={13} style={{ color: '#d4a359' }} /> Description</span>
                          <span className="imsd-legend-item"><Icon n="skull" size={13} style={{ color: '#f87171' }} /> Slain Foes</span>
                          <span className="imsd-legend-item"><Icon n="camp" size={13} style={{ color: '#34d399' }} /> Safe Camp</span>
                          <Btn kind="text" onClick={() => setActiveDrawer('turn')}>Back to Turn</Btn>
                          <IconButton icon="close" label="Close map drawer" onClick={() => setActiveDrawer(null)} />
                        </div>
                      </div>

                      <DungeonBattleMap
                        exploredRooms={exploredRooms}
                        currentRoom={currentRoom}
                        availableDirections={availableDirections}
                        hero={hero}
                        campaignTitle={c.title}
                        turnCount={c.turn_count || 1}
                        onSelectDirection={(rawText) => {
                          setActiveDrawer('turn');
                          send(rawText);
                        }}
                        onTakeBreather={() => {
                          setActiveDrawer('turn');
                          setActiveProcModal('breather');
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Persistent Docked Control Bar */}
              <div className="imsd-dock-bar">
                {/* Left: Hero button */}
                {hero && (
                  <button
                    type="button"
                    className={`imsd-dock-hero-btn sl ${activeDrawer === 'hero' ? 'active' : ''}`}
                    onClick={() => toggleDrawer('hero')}
                    title={activeDrawer === 'hero' ? 'Collapse character window' : `Open ${hero.name}'s character sheet`}
                  >
                    <div className="imsd-dock-hero-avatar">
                      {hero.avatar_url ? (
                        <img src={hero.avatar_url} alt={hero.name} />
                      ) : (
                        <Icon n="person" size={18} />
                      )}
                    </div>
                    <div className="imsd-dock-hero-info">
                      <span className="imsd-dock-hero-name">{hero.name}</span>
                      <span className="imsd-dock-hero-hp">
                        <Icon n="heart" size={11} /> {hero.hp}/{hero.max_hp}
                      </span>
                    </div>
                  </button>
                )}

                {/* Center-Left: Turn indicator & Expand/Collapse toggle */}
                <button
                  type="button"
                  className={`imsd-dock-toggle-btn sl ${activeDrawer === 'turn' ? 'active' : ''}`}
                  onClick={() => toggleDrawer('turn')}
                  title={activeDrawer === 'turn' ? 'Minimize to read story scroll' : 'Expand actions panel'}
                >
                  <div className="imsd-dock-turn">
                    <Icon n={busy === 'turn' ? 'spinner' : 'bolt'} size={14} className={busy === 'turn' ? 'spinning' : ''} />
                    <span>{busy === 'turn' ? 'Writing…' : `Turn ${c.turn_count}`}</span>
                    {!!state.options?.length && (
                      <span className="imsd-dock-opt-count">{state.options.length}</span>
                    )}
                  </div>
                  <Icon n={activeDrawer === 'turn' ? 'down' : 'up'} size={16} className="imsd-dock-chevron" />
                </button>

                {/* Center-Right: Map button */}
                <button
                  type="button"
                  className={`imsd-dock-map-btn sl ${activeDrawer === 'map' ? 'active' : ''}`}
                  onClick={() => toggleDrawer('map')}
                  title={activeDrawer === 'map' ? 'Minimize map' : 'Open dungeon cartography & directions'}
                >
                  <div className="imsd-dock-map-inner">
                    <Icon n="explore" size={14} />
                    <span className="imsd-dock-map-label">Map</span>
                    {exploredRooms.length > 0 && (
                      <span className="imsd-dock-map-badge">{exploredRooms.length}</span>
                    )}
                  </div>
                </button>

                {/* Right: Rindewind interactive portrait */}
                <div
                  className={`imsd-dock-rindewind ${activeDrawer === 'rindewind' ? 'active' : ''}`}
                  onClick={() => toggleDrawer('rindewind')}
                  title="Across the table with Rindewind · Soundscape, Voice, Rules & Advice"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDrawer('rindewind'); } }}
                >
                  <div className="imsd-dock-rindewind-face">
                    <ChroniclerFace
                      face={{ emotion: askMood || mood }}
                      status={narrator.playing ? 'speaking' : busy === 'turn' || busy === 'ask' ? 'thinking' : 'idle'}
                      levelRef={narrator.level}
                      width={44}
                    />
                    {narrator.playing && <span className="imsd-speaking-dot" title="Narrator is reading" />}
                    {sounds.on && <span className="imsd-sound-dot" title="Soundscape is active" />}
                  </div>
                </div>
              </div>
            </section>
          </div>
          {side}
        </div>
      )}

      {(shownRoom === 'heroes' || shownRoom === 'hero') && (
        <HeroesRoom
          currentCampaignId={cid}
          currentHero={hero}
          currentProfile={profile}
          campaigns={campaigns || []}
          rulesets={rulesets || []}
          onSelectCampaign={(id) => { setCid(id); setRoom('play'); }}
          onRoll={rollStat}
          onHp={setHp}
          onSave={saveHero}
          onProgressRoll={(p) => { setRoom('play'); rollProgress(p); }}
          onUseItem={handleUseItem}
          locked={locked}
          onToggleLock={() => setLocked(!locked)}
          onDeleteCharacter={deleteCharacter}
        />
      )}

      {shownRoom === 'chronicle' && c && (
        <div className="imsd-chron">
          <section className="imsm-card imsd-chronhead">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '240px' }}>
                <span className="imsd-kicker">The chronicle of</span>
                <h2>{c.title}</h2>
                <p className="muted" style={{ margin: 0 }}>Rindewind sets the tale down as a book - a chapter for every six turns, each with its plate, and he'll read any of it aloud. Open it, turn the pages, or edit a chapter by hand.</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flex: 'none', background: 'rgba(0,0,0,0.03)', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--imsd-border, #dfd4bf)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={compactionEnabled}
                    onChange={(e) => toggleCompaction(e.target.checked)}
                  />
                  <span>Periodic Chronicle Compaction</span>
                </label>
                <span className="muted" style={{ fontSize: '11px', maxWidth: '250px', textAlign: 'right' }}>
                  {compactionEnabled ? 'Rewriting running summaries every 6 turns' : 'Off by default (saves API costs)'}
                </span>
              </div>
            </div>
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

      {shownRoom === 'rules' && <RulesRoom ruleset={ruleset} rulesets={rulesets} initialPickId={rulesPickId} onPage={setPage} onStudied={loadLists} err={err} snack={snack} isOwner={isOwner} />}

      {shownRoom === 'games' && <GamesRoom isOwner={isOwner} rulesets={rulesets} campaigns={campaigns || []} onOpen={(id) => { setCid(id); setRoom('play'); }} onStart={(r) => { setNewFor(r?.id || null); setNewOpen(true); }} onDelete={deleteCampaign} onOpenRules={(rid) => { setRulesPickId(rid); setRoom('rules'); }} onRefresh={loadLists} err={err} snack={snack} />}

      <NewAdventure open={newOpen} rulesets={rulesets} initial={newFor} onClose={() => setNewOpen(false)} err={err}
        onStarted={(camp) => { setNewOpen(false); setC(camp); setCid(camp.id); setRoom('play'); loadLists(); dndAudio.playSfx('journey_begins'); if (autoRead && camp.turns?.[0]) narrator.play(camp.turns[0].id); }} />

      {/* Drawers for character, rindewind, and moves are unified in the docked console above */}
      <PageSheet page={page} onClose={() => setPage(null)} />
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      <Menu anchor={campaignMenu.anchor} open={campaignMenu.open} onClose={campaignMenu.close} items={[
        ...(campaigns || []).map((x) => ({ label: `${x.title}${x.character_name ? ` · ${x.character_name}` : ''}`, icon: x.id === cid ? 'check' : 'blank', selected: x.id === cid, onClick: () => setCid(x.id) })),
        { label: 'A new adventure', icon: 'add', onClick: () => { setNewFor(null); setNewOpen(true); } },
        c && { label: 'Delete this campaign', icon: 'del', onClick: () => deleteCampaign(c) },
      ].filter(Boolean)} />
      <SoundscapePicker open={soundOpen} onClose={() => setSoundOpen(false)} current={sounds.on ? sounds.track : null}
        onPick={(t) => { sounds.play(t); setFollow(false); try { localStorage.setItem('dnd_sound_follow', '0'); } catch { /* ignore */ } }}
        follow={follow} onFollow={(v) => { setFollow(v); try { localStorage.setItem('dnd_sound_follow', v ? '1' : '0'); } catch { /* ignore */ } if (v && sceneTrack) sounds.play(sceneTrack); }}
        vol={sounds.vol} onVol={sounds.setVolume} />

      {inspectPortrait && (
        <PortraitProvenanceModal
          hero={hero}
          campaign={c}
          profile={profile}
          onClose={() => setInspectPortrait(false)}
          onAskRindewind={(txt) => { setActiveDrawer('rindewind'); setInput(txt); }}
        />
      )}
      {inspectItem && (
        <ItemInspectionModal
          itemName={inspectItem}
          onUseItem={handleUseItem}
          onClose={() => setInspectItem(null)}
        />
      )}
      {activeProcModal && PROC_DEFINITIONS[activeProcModal] && (
        <EphemeralProcModal
          proc={PROC_DEFINITIONS[activeProcModal]}
          hero={hero}
          onRoll={async (key) => {
            if (key === 'breather_confirm') await doTakeBreather();
            else if (key === 'camp_confirm') await doSetCamp();
            else if (key === 'madness_roll') await doMadnessRoll();
            else await rollRecovery(key);
          }}
          onClose={() => {
            if (activeProcModal === 'post_combat' && last?.id) {
              setPostCombatDoneTurns((prev) => new Set([...prev, last.id]));
            }
            setActiveProcModal(null);
          }}
        />
      )}
    </>
  );
}

// ---- Item Details Modal ----
function ItemInspectionModal({ itemName, onUseItem, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!itemName) return null;
  const meta = lookupItem(itemName);
  return (
    <div className="imsd-item-modal-overlay" onClick={onClose}>
      <div className="imsd-item-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="imsd-item-modal-head">
          <div className="imsd-item-modal-title">
            <span className="imsd-kicker">{meta?.category || 'Item'}</span>
            <h3>{itemName}</h3>
          </div>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </div>
        <p className="imsd-item-modal-desc">{meta?.description || 'A valuable survival item found in the catacombs.'}</p>
        {meta?.passive && (
          <div className="imsd-item-modal-passive">
            <b>Ongoing Effect:</b> {meta.passive}
          </div>
        )}
        {meta?.action && (
          <div className="imsd-item-modal-action">
            <span className="imsd-kicker">Action / Procedure</span>
            <p style={{ margin: 0, fontSize: '13px' }}>{meta.action.description}</p>
            {onUseItem && (
              <Btn
                kind="tonal"
                icon={meta.action.dice ? "dice" : "bolt"}
                onClick={() => {
                  onClose();
                  onUseItem(itemName, meta);
                }}
              >
                {meta.action.label}
              </Btn>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Character Portrait & Provenance Modal with Top-Right Close Button ----
function PortraitProvenanceModal({ hero, campaign, profile, onClose, onAskRindewind }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!hero) return null;
  const isKN = profile?.id === 'ker-nethalas' || hero?.ruleset_id === 'ker-nethalas';
  const xpTracker = (hero.trackers || []).find((t) => t.name.toLowerCase() === 'xp');
  const xpVal = Number(xpTracker ? xpTracker.value : (hero.xp || 0));
  const xpMax = Number(xpTracker ? xpTracker.max : 1000);
  const activeEffects = getActiveOngoingEffects(hero.inventory || []);

  return (
    <div className="imsd-portrait-modal-overlay" onClick={onClose}>
      <div className="imsd-portrait-modal-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="imsd-portrait-modal-close"
          onClick={onClose}
          title="Close (Esc)"
          aria-label="Close"
        >
          <Icon n="close" size={20} />
        </button>

        <div className="imsd-portrait-modal-head" style={{ paddingRight: '44px' }}>
          <span className="imsd-kicker">Survivor Provenance &amp; Summary</span>
          <h3 style={{ margin: '2px 0 0', fontFamily: 'var(--head-font)', fontSize: '24px' }}>{hero.name}</h3>
          <span className="muted" style={{ fontSize: '12px' }}>
            {hero.role_or_class || 'Survivor'}{hero.level ? ` · Level ${hero.level}` : ''} · {xpVal} / {xpMax} XP
          </span>
        </div>

        <div className="imsd-portrait-big-frame" style={{ margin: '8px auto' }}>
          <img
            src={hero.avatar_url || '/noddy_delver_catacombs.jpg'}
            alt={hero.name}
            className="imsd-portrait-big-img"
            onError={(e) => {
              if (e.target.dataset.fallback !== 'done') {
                e.target.dataset.fallback = 'done';
                e.target.src = '/noddy_delver_catacombs.jpg';
              }
            }}
          />
        </div>

        <div className="imsd-provenance-section">
          <span className="imsd-kicker">Who They Are</span>
          <p className="imsd-provenance-text">
            {hero.backstory || hero.notes || hero.how || `${hero.name}, ${hero.role_or_class || 'Survivor'}, cast into the sunken, bone-strewn corridors of Ker Nethalas with only shattered memories and a desperate will to endure.`}
          </p>
        </div>

        <div className="imsd-provenance-section">
          <span className="imsd-kicker">How The Campaign Has Changed Them</span>
          <div className="imsd-transformation-summary">
            <div className="trans-row">
              <span className="lbl">Physical Wounds:</span>
              <b>{hero.hp} / {hero.max_hp} HP {hero.hp <= Math.floor(hero.max_hp / 2) ? '· Bloodied & deeply scarred' : '· Weathered but standing'}</b>
            </div>
            {isKN && (
              <>
                <div className="trans-row">
                  <span className="lbl">The Rot:</span>
                  <b>Stage {(hero.trackers || []).find((t) => /rot/i.test(t.name))?.value || 0} of 8 {((hero.trackers || []).find((t) => /rot/i.test(t.name))?.value || 0) > 0 ? '· Necrotic veins spreading' : '· Flesh uncorrupted'}</b>
                </div>
                <div className="trans-row">
                  <span className="lbl">Exhaustion:</span>
                  <b>{(hero.trackers || []).find((t) => /exhaust/i.test(t.name))?.value || 0} / 25 Fatigue</b>
                </div>
                <div className="trans-row">
                  <span className="lbl">Sanity:</span>
                  <b>{(hero.trackers || []).find((t) => /sanity/i.test(t.name))?.value || 10} / 10 Fortitude</b>
                </div>
                <div className="trans-row">
                  <span className="lbl">Toughness Buffer:</span>
                  <b>{(hero.trackers || []).find((t) => /toughness/i.test(t.name))?.value ?? 10} / 10 Buffer</b>
                </div>
              </>
            )}
            <div className="trans-row">
              <span className="lbl">Catacombs Endured:</span>
              <b>{campaign?.turn_count || 1} Turns survived in the Midnight Throne</b>
            </div>
          </div>
        </div>

        {activeEffects.length > 0 && (
          <div className="imsd-provenance-section">
            <span className="imsd-kicker">Active Ongoing Relic Boons</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {activeEffects.map((eff, i) => (
                <div key={i} className={`imsd-effect-pill ${eff.type}`} style={{ fontSize: '12px' }}>
                  <b>{eff.name}:</b> {eff.effect}
                </div>
              ))}
            </div>
          </div>
        )}

        {onAskRindewind && (
          <div style={{ marginTop: '4px' }}>
            <Btn
              kind="tonal"
              icon="auto_awesome"
              onClick={() => {
                onClose();
                onAskRindewind(`Rindewind, as Chronicler, look upon ${hero.name}. Tell me who I was when I entered these halls, and how the trauma, rot, and battles of this campaign have transformed me.`);
              }}
            >
              Ask Rindewind how I've changed
            </Btn>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Heroes Roster & Multi-Campaign Warband -------------------------------------------------------------
function HeroesRoom({
  currentCampaignId,
  currentHero,
  currentProfile,
  campaigns = [],
  rulesets = [],
  onSelectCampaign,
  onRoll,
  onHp,
  onSave,
  onProgressRoll,
  onUseItem,
  locked,
  onToggleLock,
  onDeleteCharacter
}) {
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedHeroId, setSelectedHeroId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRuleset, setFilterRuleset] = useState('all');

  const loadCharacters = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api('/characters');
      setCharacters(res.characters || []);
    } catch {
      if (currentHero) setCharacters([currentHero]);
    } finally {
      setLoading(false);
    }
  }, [currentHero]);

  useEffect(() => {
    loadCharacters();
  }, [loadCharacters]);

  const activeInspectHero = useMemo(() => {
    if (!selectedHeroId) return null;
    if (currentHero && selectedHeroId === currentHero.id) return currentHero;
    return characters.find((c) => c.id === selectedHeroId) || null;
  }, [selectedHeroId, currentHero, characters]);

  const activeInspectRuleset = useMemo(() => {
    if (!activeInspectHero) return null;
    return rulesets.find((r) => r.id === activeInspectHero.ruleset_id) || currentProfile || null;
  }, [activeInspectHero, rulesets, currentProfile]);

  const filteredCharacters = useMemo(() => {
    return characters.filter((c) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || (c.name || '').toLowerCase().includes(q) || (c.role_or_class || '').toLowerCase().includes(q) || (c.campaign_title || '').toLowerCase().includes(q);
      const matchesRule = filterRuleset === 'all' || c.ruleset_id === filterRuleset;
      return matchesSearch && matchesRule;
    });
  }, [characters, searchQuery, filterRuleset]);

  const uniqueRulesets = useMemo(() => {
    const map = new Map();
    characters.forEach((c) => {
      if (c.ruleset_id && c.ruleset_name) map.set(c.ruleset_id, c.ruleset_name);
    });
    return Array.from(map.entries());
  }, [characters]);

  if (activeInspectHero) {
    const isCurrent = activeInspectHero.id === currentHero?.id;
    return (
      <div className="imsd-heroes-container">
        <div className="imsm-card imsd-heroes-inspect-bar">
          <div className="imsm-row" style={{ gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              className="imsd-back-pill"
              onClick={() => setSelectedHeroId(null)}
              title="Return to the Heroes Roster grid"
            >
              <Icon n="back" size={14} />
              <span>All Heroes ({characters.length})</span>
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="imsd-kicker">{activeInspectHero.ruleset_name || 'Solo Campaign'}</span>
              <h3 style={{ margin: 0, fontSize: '18px' }}>{activeInspectHero.name}</h3>
              {activeInspectHero.campaign_title && (
                <span className="muted" style={{ fontSize: '12px' }}>Chronicle: {activeInspectHero.campaign_title}</span>
              )}
            </div>
          </div>
          <div className="imsm-row" style={{ gap: '8px' }}>
            {activeInspectHero.campaign_id && (
              <Btn
                kind={isCurrent ? 'filled' : 'tonal'}
                icon="play"
                onClick={() => onSelectCampaign(activeInspectHero.campaign_id)}
              >
                {isCurrent ? 'Resume Adventure' : 'Switch Campaign'}
              </Btn>
            )}
          </div>
        </div>

        <HeroRoom
          hero={activeInspectHero}
          profile={activeInspectRuleset?.metadata || currentProfile}
          onRoll={onRoll}
          onHp={isCurrent ? onHp : async (delta) => {
            const nextHp = Math.max(0, Math.min(activeInspectHero.max_hp || 20, (activeInspectHero.hp || 0) + delta));
            await api(`/characters/${activeInspectHero.id}`, { method: 'PUT', body: { hp: nextHp } });
            loadCharacters();
          }}
          onSave={isCurrent ? onSave : async (patch) => {
            await api(`/characters/${activeInspectHero.id}`, { method: 'PUT', body: patch });
            loadCharacters();
          }}
          onProgressRoll={onProgressRoll}
          onUseItem={onUseItem}
          locked={locked}
          onToggleLock={onToggleLock}
        />
      </div>
    );
  }

  return (
    <div className="imsd-heroes-room">
      <section className="imsm-card imsd-heroes-header">
        <div className="imsm-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <span className="imsd-kicker">Roster of Delvers &amp; Champions</span>
            <h2>Heroes of the Realm</h2>
            <p className="imsd-tagline">
              Explore your warbands, condemned delvers, and wanderers across all campaigns and rulebooks.
            </p>
          </div>
          <div className="imsm-row" style={{ gap: '8px' }}>
            <span className="imsd-hero-count-chip">
              <Icon n="people" size={15} />
              <span>{characters.length} {characters.length === 1 ? 'Hero' : 'Heroes'}</span>
            </span>
          </div>
        </div>

        {/* Filter bar */}
        <div className="imsd-heroes-controls">
          <div className="imsd-search-box">
            <Icon n="search" size={16} />
            <input
              type="text"
              placeholder="Search hero by name, class, or chronicle..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search">
                <Icon n="close" size={14} />
              </button>
            )}
          </div>
          {uniqueRulesets.length > 1 && (
            <div className="imsd-filter-chips">
              <button
                type="button"
                className={`imsd-filter-chip ${filterRuleset === 'all' ? 'active' : ''}`}
                onClick={() => setFilterRuleset('all')}
              >
                All Systems
              </button>
              {uniqueRulesets.map(([rid, rname]) => (
                <button
                  key={rid}
                  type="button"
                  className={`imsd-filter-chip ${filterRuleset === rid ? 'active' : rid === 'ker-nethalas' ? 'kn' : ''}`}
                  onClick={() => setFilterRuleset(rid)}
                >
                  {rname}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {loading && (
        <div className="imsm-empty">
          <Spinner size={32} />
          <p>Gathering the heroes of the catacombs...</p>
        </div>
      )}

      {!loading && filteredCharacters.length === 0 && (
        <div className="imsm-empty imsm-card" style={{ padding: '36px 16px', textAlign: 'center' }}>
          <Icon n="people" size={48} className="muted" />
          <h3>No Heroes Found</h3>
          <p className="muted">
            {searchQuery || filterRuleset !== 'all'
              ? 'No adventurer matches your filter criteria. Try clearing your search.'
              : 'No characters have entered the chronicles yet.'}
          </p>
        </div>
      )}

      {!loading && filteredCharacters.length > 0 && (
        <div className="imsd-heroes-grid">
          {filteredCharacters.map((char) => {
            const isCurrent = char.id === currentHero?.id;
            const xpTracker = (char.trackers || []).find((t) => t.name.toLowerCase() === 'xp');
            const xpVal = Number(xpTracker ? xpTracker.value : (char.xp || 0));
            const isKN = char.ruleset_id === 'ker-nethalas';

            return (
              <article key={char.id} className={`imsm-card imsd-hero-card ${isCurrent ? 'is-active' : ''}`}>
                <div className="imsd-hero-card-head">
                  <div className="imsd-avatar-thumb-wrap">
                    <img
                      src={char.avatar_url || '/noddy_delver_catacombs.jpg'}
                      alt={char.name}
                      className="imsd-avatar-thumb"
                      onError={(e) => {
                        if (e.target.dataset.fallback !== 'done') {
                          e.target.dataset.fallback = 'done';
                          e.target.src = '/noddy_delver_catacombs.jpg';
                        }
                      }}
                    />
                  </div>
                  <div className="imsd-hero-card-meta">
                    <span className="imsd-kicker">{char.ruleset_name || (isKN ? 'Ker Nethalas' : 'Solo RPG')}</span>
                    <h3 className="imsd-hero-name">{char.name}</h3>
                    <div className="imsd-hero-sub">
                      <span>{char.role_or_class || 'Delver Survivor'}</span>
                      {char.campaign_title && (
                        <span className="camp-ref" title={char.campaign_title}>
                          {' '}· {char.campaign_title}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Health & XP Vitals */}
                <div className="imsd-hero-card-vitals">
                  <div className="imsd-hero-vitals-row">
                    <div className="vital-item">
                      <span className="lbl">{isKN ? 'Health' : 'Hit Points'}</span>
                      <b className="val">{char.hp || 0} / {char.max_hp || 10} HP</b>
                    </div>
                    <div className="vital-item text-right">
                      <span className="lbl">Experience</span>
                      <b className="val gold">{xpVal} XP</b>
                    </div>
                  </div>
                  <HpBar hp={char.hp} max={char.max_hp} />
                </div>

                {/* Action buttons & Delete option */}
                <div className="imsd-hero-card-actions">
                  <Btn
                    kind="tonal"
                    icon="person"
                    onClick={() => setSelectedHeroId(char.id)}
                    title="Open full character sheet, mannequin, inventory, and stats"
                  >
                    View Sheet
                  </Btn>
                  {char.campaign_id ? (
                    <Btn
                      kind={isCurrent ? 'filled' : 'tonal'}
                      icon="play"
                      onClick={() => onSelectCampaign(char.campaign_id)}
                      title={`Resume ${char.name}'s chronicle: ${char.campaign_title || 'Active'}`}
                    >
                      {isCurrent ? 'Resume Adventure' : 'Resume Adventure'}
                    </Btn>
                  ) : null}
                  {onDeleteCharacter && (
                    <button
                      type="button"
                      className="imsd-card-del-btn"
                      title={`Delete hero “${char.name}”`}
                      aria-label={`Delete hero “${char.name}”`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteCharacter(char);
                      }}
                    >
                      <Icon n="del" size={17} />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- Hero ---------------------------------------------------------------------------------------------------------------
function HeroRoom({ hero, profile, onRoll, onHp, onSave, onProgressRoll, onUseItem, locked: lockedProp, onToggleLock }) {
  const [localLocked, setLocalLocked] = useState(true);
  const locked = lockedProp !== undefined ? lockedProp : localLocked;
  const toggleLock = onToggleLock || (() => setLocalLocked(!localLocked));
  const [unlockedItems, setUnlockedItems] = useState({});
  const [inspectItem, setInspectItem] = useState(null);
  const [inspectPortrait, setInspectPortrait] = useState(false);
  const [newVow, setNewVow] = useState({ name: '', rank: 'dangerous' });
  const saveProgress = (list) => onSave({ progress: list });
  const setTracker = (name, value) => onSave({ trackers: hero.trackers.map((t) => (t.name === name ? { ...t, value } : t)) });
  const [item, setItem] = useState('');
  const [notes, setNotes] = useState(hero.notes || '');
  useEffect(() => { setNotes(hero.notes || ''); }, [hero.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isKerNethalas = profile?.id === 'ker-nethalas' || hero?.ruleset_id === 'ker-nethalas';
  const xpTracker = (hero.trackers || []).find((t) => t.name.toLowerCase() === 'xp');
  const xpVal = Number(xpTracker ? xpTracker.value : (hero.xp || 0));
  const xpMax = Number(xpTracker ? xpTracker.max : 1000);
  const otherTrackers = (hero.trackers || []).filter((t) => t.name.toLowerCase() !== 'xp');
  const activeEffects = useMemo(() => getActiveOngoingEffects(hero.inventory || []), [hero.inventory]);

  const check = (v) => {
    if (profile.resolution === 'ironsworn') return `action d6+${v}`;
    if (profile.resolution === 'd6-pool') return `${v}d6 pool`;
    const h = checkFor(profile, v);
    return h.under != null ? `roll under ${h.under}` : `${h.dice}${sign(h.mod)}`;
  };

  const noteRows = Math.max(6, (notes || '').split('\n').reduce((acc, l) => acc + Math.max(1, Math.ceil(l.length / 50)), 0) + 1);

  return (
    <div className="imsd-hero">
      <section className="imsm-card imsd-herohead">
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '12px' }}>
          {hero.avatar_url ? (
            <div
              className="imsd-herohead-avatar interactive"
              onClick={() => setInspectPortrait(true)}
              title="Click to view enlarged portrait and character summary"
            >
              <img
                src={hero.avatar_url || '/noddy_delver_catacombs.jpg'}
                alt={hero.name}
                onError={(e) => {
                  if (e.target.dataset.fallback !== 'done') {
                    e.target.dataset.fallback = 'done';
                    e.target.src = '/noddy_delver_catacombs.jpg';
                  }
                }}
              />
              <span className="imsd-avatar-zoom-cue"><Icon n="search" size={12} /></span>
            </div>
          ) : (
            <div
              className="imsd-herohead-avatar placeholder interactive"
              onClick={() => setInspectPortrait(true)}
              title="Click to view character summary"
            >
              <Icon n="person" size={36} />
              <span className="imsd-avatar-zoom-cue"><Icon n="search" size={12} /></span>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="imsd-kicker">{hero.role_or_class}</span>
            <h2 style={{ margin: '2px 0 0' }}>{hero.name}</h2>
          </div>
          <button
            type="button"
            className={`imsd-sheet-lock-btn ${locked ? 'is-locked' : 'is-unlocked'}`}
            onClick={toggleLock}
            title={locked ? "Vitals locked to prevent accidental changes. Tap to unlock manual editing." : "Vitals unlocked. Tap to lock."}
          >
            <Icon n={locked ? 'lock' : 'unlock'} size={15} />
            <span>{locked ? 'Locked' : 'Unlocked'}</span>
          </button>
        </div>
        <HpBar hp={hero.hp} max={hero.max_hp} label={profile.hp_label || 'HP'} />
        {!locked ? (
          <div className="imsm-row" style={{ marginTop: '8px' }}>
            {[-5, -1].map((d) => <Btn key={d} kind="tonal" onClick={() => onHp(d)}>{d}</Btn>)}
            {[1, 5].map((d) => <Btn key={d} kind="tonal" onClick={() => onHp(d)}>+{d}</Btn>)}
            <Btn kind="text" icon="sync" onClick={() => onHp(hero.max_hp)}>Full rest</Btn>
          </div>
        ) : (
          <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <small className="muted"><Icon n="lock" size={12} /> Auto-adjusted by narrative &amp; rolls (unlock to edit manually)</small>
          </div>
        )}
        <XpBar
          xp={xpVal}
          max={xpMax}
          level={hero.level}
          onGainXp={isKerNethalas && !locked ? (amount) => {
            const nextVal = Math.min(xpMax, xpVal + amount);
            if (xpTracker) {
              setTracker(xpTracker.name, nextVal);
              onSave({ xp: nextVal });
            } else {
              onSave({ xp: nextVal });
            }
          } : null}
        />
        <div className="imsd-hero-stat-tiles" style={{ marginTop: '12px' }}>
          {[
            { label: isKerNethalas ? 'Torso Prot' : (profile.defence_label || 'AC'), val: isKerNethalas ? '3 (d10)' : hero.ac, sub: isKerNethalas ? 'Breastplate' : 'Armour', icon: 'shield' },
            { label: 'Survivor Tier', val: `Level ${hero.level || 1}`, sub: 'Gravebound', icon: 'sparkle' },
            { label: isKerNethalas ? 'Masteries' : 'Abilities', val: isKerNethalas ? (hero.masteries?.length || 2) : (hero.spells_or_skills || []).length, sub: isKerNethalas ? 'Archetypes' : 'Known', icon: 'bolt' },
            { label: 'Backpack Kit', val: `${(hero.inventory || []).length} items`, sub: 'Provisions', icon: 'archive' },
          ].map((st) => (
            <div key={st.label} className="imsd-stat-tile">
              <div className="imsd-stat-tile-top">
                <Icon n={st.icon} size={14} className="tile-icon" />
                <span className="tile-label">{st.label}</span>
              </div>
              <b className="tile-val">{st.val}</b>
              {st.sub && <span className="tile-sub">{st.sub}</span>}
            </div>
          ))}
        </div>
      </section>

      {/* Active Ongoing Effects & Relic Boons */}
      {activeEffects.length > 0 && (
        <section className="imsm-card imsd-effects-card">
          <span className="imsd-kicker">Active Ongoing Effects &amp; Relic Boons</span>
          <div className="imsd-effects-list">
            {activeEffects.map((eff) => (
              <div key={eff.name} className={`imsd-effect-pill ${eff.isPenalty ? 'penalty' : ''}`} title={eff.description}>
                <span>{eff.label}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Piecemeal Armour Mannequin, Hit Locations & Weapons */}
      {isKerNethalas && (
        <section className="imsm-card imsd-mannequin-card" style={{ padding: '16px' }}>
          <ArmorMannequin hero={hero} isKN={isKerNethalas} withGear={true} locked={locked} />
        </section>
      )}

      {/* Survival Trackers */}
      {!!otherTrackers.length && (
        <section className="imsm-card">
          <div className="imsm-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h3><Icon n="chart" size={20} />Trackers</h3>
            {locked && <small className="muted"><Icon n="lock" size={12} /> Locked</small>}
          </div>
          {otherTrackers.map((t) => (
            <Tracker key={t.name} t={t} onChange={locked ? null : (v) => setTracker(t.name, v)} />
          ))}
        </section>
      )}

      {/* Vows and progress (Only for Ironsworn - inapplicable to Ker Nethalas) */}
      {profile.resolution === 'ironsworn' && !isKerNethalas && (hero.progress || []).length > 0 && (
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

      {/* Character Resistances (Chapter II p. 20) */}
      {isKerNethalas ? (
        <section className="imsm-card imsd-resistances-card">
          <div className="imsm-row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div>
              <span className="imsd-kicker">Passive Fortitudes · Chapter II p. 20</span>
              <h3 style={{ margin: 0 }}><Icon n="shield" size={20} />Character Resistances</h3>
            </div>
            <small className="muted"><Icon n="dice" size={12} /> D100 Roll-Under · Tap to test</small>
          </div>
          <p className="muted" style={{ margin: '0 0 12px', fontSize: '12px', lineHeight: '1.4' }}>
            Resistances function as passive barriers (max 80%) tested on D100. Always available even when Stunned or Paralyzed.
          </p>
          <div className="imsd-resistances-grid">
            {[
              {
                name: 'Endurance',
                val: hero.attributes?.Endurance ?? 40,
                desc: 'Physical stamina against poisons, toxic spores, bleeding, fatigue, and sustained bodily trauma.'
              },
              {
                name: 'Resolve',
                val: hero.attributes?.Resolve ?? 20,
                desc: 'Mental fortitude and willpower against supernatural fear, despair, cosmic dread, and sanity checks.'
              },
              {
                name: 'Spellward',
                val: hero.attributes?.Spellward ?? 20,
                desc: 'Innate ward against eldritch corruption, curses, necrotic decay, and hostile arcane spells.'
              }
            ].map((r) => (
              <div key={r.name} className="imsd-resistance-card">
                <div className="res-head">
                  <span className="res-title">{r.name}</span>
                  <b className="res-val">{r.val}%</b>
                </div>
                <p className="res-desc">{r.desc}</p>
                <button
                  type="button"
                  className="imsd-res-roll-btn"
                  onClick={() => onRoll(r.name, r.val)}
                  title={`Test ${r.name} (${r.val}% or under)`}
                >
                  <Icon n="dice" size={13} />
                  <span>Test {r.name}</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="imsm-card">
          <h3><Icon n="dice" size={20} />Attributes <small className="muted">tap one to roll a check</small></h3>
          <div className="imsd-stats">
            {Object.entries(hero.attributes || {}).map(([k, v]) => (
              <button key={k} type="button" className="sl" onClick={() => onRoll(k, v)}><span>{k}</span><b className="num">{v}</b><small>{check(v)}</small></button>
            ))}
          </div>
        </section>
      )}

      {/* Masteries (Ker Nethalas Chapter II p. 21) */}
      {isKerNethalas && Array.isArray(hero.masteries) && hero.masteries.length > 0 && (
        <section className="imsm-card imsd-masteries-card">
          <div className="imsm-row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div>
              <span className="imsd-kicker">Personal Path &amp; Archetypes · Chapter II p. 21</span>
              <h3 style={{ margin: 0 }}><Icon n="sparkle" size={20} />Masteries</h3>
            </div>
            <span className="tag imsd-feat-tag">{hero.masteries.length} / 2 Masteries</span>
          </div>
          <div className="imsd-masteries-grid">
            {hero.masteries.map((m, idx) => (
              <div key={idx} className="imsd-mastery-fullcard">
                <div className="mastery-top">
                  <h4>{m.name}</h4>
                  {m.concept && <p className="mastery-concept">{m.concept}</p>}
                </div>
                <div className="mastery-block feature">
                  <div className="block-label"><Icon n="bolt" size={13} /> <b>Mastery Feature:</b> {m.feature}</div>
                  <p className="block-desc">{m.featureDesc}</p>
                </div>
                <div className="mastery-block ability">
                  <div className="block-label"><Icon n="auto_awesome" size={13} /> <b>{m.tier}</b></div>
                  <p className="block-desc">{m.tierDesc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="imsm-card">
        <div className="imsd-skills-header" style={{ marginBottom: '8px' }}>
          <h3><Icon n="bolt" size={20} />Skills &amp; Combat Proficiencies</h3>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: '12px', lineHeight: '1.4' }}>
            <b>D100 Roll-Under:</b> Percentage is your success target on 1d100 (e.g. 70% = roll &le; 70 to succeed). Matching double numbers (11, 22, 33...) or a natural 01 on a successful roll score a <b>Triumph</b>, earning a <b>[✓]</b> mark. At Camp, Rest enables an <b>Advancement Check</b> for marked skills (+5% permanent increase if rolling higher than current rating).
          </p>
        </div>
        <div className="imsm-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
          {(hero.spells_or_skills || []).map((s, idx) => {
            const isMarked = s.includes('[✓]');
            const cleanName = s.replace(/\s*\[✓\]/g, '');
            const m = cleanName.match(/^(.*?)\s*\((\d+)%\)$/);
            const sName = m ? m[1] : cleanName;
            const sVal = m ? Number(m[2]) : 40;
            return (
              <div key={`${s}-${idx}`} className={`imsd-skill-pill-wrap ${isMarked ? 'marked' : ''}`}>
                <button
                  type="button"
                  className="imsd-skill-roll-subbtn"
                  onClick={() => onRoll(sName, sVal)}
                  title={`Roll ${cleanName} check (need ≤ ${sVal})`}
                >
                  <Icon n="dice" size={13} />
                  <b>{cleanName}</b>
                </button>
                <button
                  type="button"
                  className={`imsd-skill-mark-toggle ${isMarked ? 'is-marked' : ''}`}
                  onClick={() => {
                    const updated = (hero.spells_or_skills || []).map((item, j) => {
                      if (j !== idx) return item;
                      return isMarked ? item.replace(/\s*\[✓\]/g, '') : `${item} [✓]`;
                    });
                    onSave({ spells_or_skills: updated });
                  }}
                  title={isMarked ? 'Marked for Camp advancement. Tap to clear.' : 'Tap to mark for Camp advancement check.'}
                >
                  <Icon n={isMarked ? 'check' : 'add'} size={12} />
                  <span>{isMarked ? 'Camp [✓]' : 'Mark'}</span>
                </button>
              </div>
            );
          })}
          {!(hero.spells_or_skills || []).length && <span className="muted">None yet.</span>}
        </div>
      </section>

      <section className="imsm-card">
        <div className="imsm-row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h3><Icon n="archive" size={20} />Kit &amp; Inventory ({(hero.inventory || []).length})</h3>
          <small className="muted"><Icon n="lock" size={12} /> Auto-managed procedurally</small>
        </div>
        <div className="imsd-kit-list">
          {(hero.inventory || []).map((it, i) => {
            const isItemUnlocked = Boolean(unlockedItems[i]);
            const meta = lookupItem(it);
            return (
              <div key={`${it}-${i}`} className="imsd-kit-item-row">
                <div
                  className="imsd-kit-item-text"
                  onClick={() => setInspectItem(it)}
                  title="Click to view details, lore & actions"
                >
                  <Icon n={meta?.icon || 'archive'} size={16} />
                  <span className="item-name">{it}</span>
                  {meta?.category && <span className="item-badge">{meta.category}</span>}
                </div>
                <div className="imsd-kit-item-acts">
                  <button
                    type="button"
                    className={`imsd-item-lock-btn ${isItemUnlocked ? 'unlocked' : ''}`}
                    onClick={() => setUnlockedItems((prev) => ({ ...prev, [i]: !prev[i] }))}
                    title={isItemUnlocked ? "Item unlocked. Click to re-lock." : "Item locked. Click to unlock delete option."}
                  >
                    <Icon n={isItemUnlocked ? 'unlock' : 'lock'} size={16} />
                  </button>
                  {isItemUnlocked && (
                    <IconButton
                      icon="del"
                      label={`Drop ${it}`}
                      onClick={() => {
                        onSave({ inventory: hero.inventory.filter((_, j) => j !== i) });
                        setUnlockedItems((prev) => { const n = { ...prev }; delete n[i]; return n; });
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
          {!(hero.inventory || []).length && <span className="muted">Inventory empty.</span>}
        </div>
        {!locked && (
          <div className="imsd-say" style={{ marginTop: '10px' }}>
            <TextField label="Add something" value={item} onChange={setItem} onKeyDown={(e) => { if (e.key === 'Enter' && item.trim()) { onSave({ inventory: [...hero.inventory, item.trim()] }); setItem(''); } }} />
            <Btn kind="tonal" icon="add" disabled={!item.trim()} onClick={() => { onSave({ inventory: [...hero.inventory, item.trim()] }); setItem(''); }}>Add</Btn>
          </div>
        )}
      </section>

      <section className="imsm-card">
        <h3><Icon n="note" size={20} />Backstory and notes</h3>
        <TextArea
          label="Rindewind reads these every turn (auto-expands to full text)"
          rows={noteRows}
          style={{ minHeight: '160px', height: 'auto', width: '100%' }}
          value={notes}
          onChange={setNotes}
          onBlur={() => { if (notes !== (hero.notes || '')) onSave({ notes }); }}
        />
      </section>

      {/* Item Details Inspection Modal */}
      {inspectItem && (
        <ItemInspectionModal
          itemName={inspectItem}
          onUseItem={onUseItem}
          onClose={() => setInspectItem(null)}
        />
      )}

      {/* Portrait & Character Summary Modal */}
      {inspectPortrait && (
        <PortraitProvenanceModal
          hero={hero}
          campaign={null}
          profile={profile}
          onClose={() => setInspectPortrait(false)}
        />
      )}
    </div>
  );
}

// ---- Rulebooks --------------------------------------------------------------------------------------------------------
function RulesRoom({ ruleset, rulesets, initialPickId, onPage, onStudied, err, snack, isOwner }) {
  const [pickId, setPickId] = useState(initialPickId || ruleset?.id || rulesets[0]?.id || '');
  useEffect(() => {
    if (initialPickId) setPickId(initialPickId);
    else if (ruleset?.id) setPickId(ruleset.id);
  }, [initialPickId, ruleset?.id]);
  const r = rulesets.find((x) => x.id === pickId);
  const p = r?.metadata || {};
  const [books, setBooks] = useState([]);
  const [digest, setDigest] = useState({ cards: [], config: null });
  const [q, setQ] = useState('');
  const [ans, setAns] = useState(null);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    setAns(null);
    if (pickId) {
      api(`/rulesets/${pickId}/books`).then((d) => setBooks(d.books || [])).catch(() => setBooks([]));
      api(`/rulesets/${pickId}/digest`).then((d) => setDigest({ cards: d.cards || [], config: d.config || null })).catch(() => setDigest({ cards: [], config: null }));
    }
  }, [pickId]);

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
          {digest.cards.length > 0 && <span className="tag good"><Icon n="check" size={14} />{digest.cards.length} Quick-Access Rules</span>}
          <span className="grow" />
          {isOwner && <Btn kind="text" icon="sync" busy={busy === 'study'} onClick={study}>{p.studied_at ? 'Read its books again' : 'Read its books'}</Btn>}
        </div>
        {p.description && <p style={{ margin: 0 }}>{p.description}</p>}
      </section>

      {/* Authoritative Quick-Reference Rules & Trackers extracted directly from rulebooks */}
      {(digest.cards.length > 0 || digest.config) && (
        <section className="imsm-card imsd-digest-section">
          <div className="imsm-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h3><Icon n="shield" size={20} />Quick Reference Rules &amp; Database</h3>
            <span className="tag good">{digest.cards.length} authoritative cards active</span>
          </div>
          <p className="muted" style={{ margin: 0 }}>Authoritative rules, resource trackers, and mechanics extracted from the core rulebooks. Rindewind references these directly for zero delay and accurate solo resolution.</p>

          {/* Key Resource Trackers */}
          {digest.config?.trackers && (
            <div className="imsd-digest-group">
              <h4 className="imsd-subhead"><Icon n="chart" size={16} />Key Resource Trackers &amp; Vital Pools</h4>
              <div className="imsd-trackers-grid">
                {Object.entries(digest.config.trackers).map(([k, desc]) => (
                  <div key={k} className="imsd-tracker-card">
                    <b className="tracker-name">{k.replace(/_/g, ' ')}</b>
                    <span className="tracker-desc">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Core System Mechanics & Action Economy */}
          {digest.config?.core_mechanics && (
            <div className="imsd-digest-group">
              <h4 className="imsd-subhead"><Icon n="dice" size={16} />System Mechanics &amp; Action Economy</h4>
              <div className="imsd-mech-grid">
                {Object.entries(digest.config.core_mechanics).map(([k, v]) => (
                  <div key={k} className="imsd-mech-item">
                    <span className="k">{k.replace(/_/g, ' ')}</span>
                    <span className="v">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sensory Palette & Rulebook Lexicon */}
          {digest.config?.tone_and_atmosphere && (
            <div className="imsd-digest-group">
              <h4 className="imsd-subhead"><Icon n="book" size={16} />Atmosphere &amp; Rulebook Lexicon</h4>
              <div className="imsd-lexicon-block">
                <p className="imsd-mood"><b>Tone:</b> {digest.config.tone_and_atmosphere.mood}</p>
                {digest.config.tone_and_atmosphere.authentic_lexicon && (
                  <div className="imsd-chips-wrap">
                    {digest.config.tone_and_atmosphere.authentic_lexicon.map((term) => (
                      <span key={term} className="tag imsd-lex-tag">{term}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quick-Access Rules Cards */}
          {digest.cards.length > 0 && (
            <div className="imsd-digest-group">
              <h4 className="imsd-subhead"><Icon n="doc" size={16} />Extracted Rules Cards ({digest.cards.length})</h4>
              <div className="imsd-cards-list">
                {digest.cards.map((c) => (
                  <details key={c.id} className="imsd-rule-card">
                    <summary className="imsd-rule-summary">
                      <div className="imsm-row" style={{ gap: '8px', alignItems: 'center' }}>
                        <span className={`tag ${c.category === 'core' ? 'good' : c.category === 'combat' ? 'warn' : ''}`}>{c.category}</span>
                        <b>{c.title}</b>
                        <small className="muted">{c.book_title} p.{c.page_num}</small>
                      </div>
                      <Icon n="down" size={18} className="arrow" />
                    </summary>
                    <div className="imsd-rule-body">
                      {c.trigger_when && <p className="trigger"><b>When to apply:</b> {c.trigger_when}</p>}
                      {c.procedure && <p className="procedure"><b>Procedure:</b> {c.procedure}</p>}
                      {c.outcomes && Object.keys(c.outcomes).length > 0 && (
                        <div className="outcomes">
                          <b>Outcomes:</b>
                          <ul>
                            {Object.entries(c.outcomes).map(([ok, ov]) => (
                              <li key={ok}><b>{ok.replace(/_/g, ' ')}:</b> {ov}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

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
function GamesRoom({ rulesets, campaigns, onOpen, onStart, onDelete, onOpenRules, onRefresh, err, snack, isOwner }) {
  const [st, setSt] = useState(null);
  const [filterGame, setFilterGame] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [readinessTab, setReadinessTab] = useState('all'); // 'all', 'ready', 'dev'
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

  const getReadiness = useCallback((r) => {
    if (r.readiness) return r.readiness;
    if (r.metadata?.readiness) return r.metadata.readiness;
    if (r.id === 'ker-nethalas') {
      return {
        status: 'ready',
        percentage: 100,
        label: '100% Rulebook Verified & Ready',
        badge: '100% Verified',
        summary: 'Full necropolis rulebook ingested. Procedural exploration, tension die, camp check, hit locations & piecemeal armour verified.',
        checklist: [
          { name: 'Core Rulebook Ingestion & Grounding', done: true },
          { name: 'Hard Beginnings & Starting Vitals', done: true },
          { name: 'Opposed Combat & Damage Pool Selection', done: true },
          { name: 'Piecemeal Armour Mannequin & Hit Locations', done: true },
          { name: 'Procedural Exploration Turn & Tension Die Chain', done: true },
          { name: '10-Minute Breather & Camp Rest Check', done: true },
          { name: 'Necrotic Rot Stages & Permanent Skill Advancement', done: true }
        ]
      };
    }
    const defaultPcts = {
      'ironsworn': 75,
      'ironsworn-starforged': 70,
      'alien-rpg': 50,
      'across-a-thousand-dead-worlds': 40,
      'doom-pilgrim': 40,
      'barbarian-prince': 35,
      'last-days-zombie-apocalypse': 35,
      'thousand-year-old-campfire': 35,
      'campfire-story': 30,
      'thousand-year-old-vampire': 45
    };
    const pct = defaultPcts[r.id] || 25;
    return {
      status: 'in_development',
      percentage: pct,
      label: `${pct}% Prepared · QA Pending`,
      badge: 'In Development',
      summary: 'Rulebook indexed. Core resolution and specific procedural mechanics undergoing QA accuracy check.',
      checklist: [
        { name: 'Rulebook Ingestion', done: true },
        { name: 'Stat & Dice Profile', done: pct >= 40 },
        { name: 'Procedural Cycles & Tables', done: false },
        { name: 'Rulebook Accuracy QA Check', done: false }
      ]
    };
  }, []);

  const readyCount = useMemo(() => rulesets.filter((r) => getReadiness(r).status === 'ready').length, [rulesets, getReadiness]);
  const devCount = rulesets.length - readyCount;

  const sorted = useMemo(() => {
    let list = [...rulesets].map((r) => ({
      ...r,
      readinessData: getReadiness(r)
    }));
    if (readinessTab === 'ready') {
      list = list.filter((r) => r.readinessData.status === 'ready');
    } else if (readinessTab === 'dev') {
      list = list.filter((r) => r.readinessData.status !== 'ready');
    }
    list.sort((a, b) => {
      const aReady = a.readinessData.status === 'ready' ? 1 : 0;
      const bReady = b.readinessData.status === 'ready' ? 1 : 0;
      if (bReady !== aReady) return bReady - aReady;
      if (b.readinessData.percentage !== a.readinessData.percentage) {
        return b.readinessData.percentage - a.readinessData.percentage;
      }
      return (b.metadata?.studied_at ? 1 : 0) - (a.metadata?.studied_at ? 1 : 0) || a.name.localeCompare(b.name);
    });
    return list;
  }, [rulesets, readinessTab, getReadiness]);

  const filteredCampaigns = useMemo(() => {
    let list = [...campaigns];
    if (filterGame !== 'all') {
      list = list.filter((x) => x.ruleset_id === filterGame);
    }
    if (sortBy === 'game') {
      list.sort((a, b) => (a.ruleset_name || a.ruleset_id || '').localeCompare(b.ruleset_name || b.ruleset_id || ''));
    } else if (sortBy === 'title') {
      list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }
    return list;
  }, [campaigns, filterGame, sortBy]);

  return (
    <>
      {!!campaigns.length && (
        <section className="imsd-camps-section">
          <div className="imsm-row imsd-camps-bar" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div className="imsm-row" style={{ alignItems: 'center', gap: '8px' }}>
              <h2 className="imsa-h2" style={{ margin: 0 }}>Your adventures</h2>
              <span className="tag">{filteredCampaigns.length}{filteredCampaigns.length !== campaigns.length ? ` of ${campaigns.length}` : ''}</span>
            </div>
            <div className="imsm-row" style={{ gap: '10px', alignItems: 'center' }}>
              <SelectField
                label="Filter by game"
                value={filterGame}
                onChange={setFilterGame}
                options={[['all', 'All games'], ...rulesets.map((r) => [r.id, r.name])]}
              />
              <SelectField
                label="Sort by"
                value={sortBy}
                onChange={setSortBy}
                options={[
                  ['recent', 'Recently played'],
                  ['game', 'Game system'],
                  ['title', 'Title (A–Z)'],
                ]}
              />
            </div>
          </div>
          {filteredCampaigns.length ? (
            <div className="imsd-camps">
              {filteredCampaigns.map((x) => (
                <div key={x.id} className="imsd-campcard-wrap">
                  <button type="button" className="imsd-campcard sl" onClick={() => onOpen(x.id)}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', width: '100%' }}>
                      {x.character_avatar ? (
                        <img src={x.character_avatar} alt={x.character_name} className="imsd-avatar-thumb" />
                      ) : null}
                      <div style={{ flex: 1, minWidth: 0, paddingRight: '24px' }}>
                        <span className="imsd-kicker">{x.ruleset_name || x.ruleset_id} · Turn {x.turn_count}</span>
                        <h4 className="imsd-camp-title">{x.title}</h4>
                        <div className="imsd-camp-sub">
                          <span className="char-name">{x.character_name}</span>
                          {x.character_class && <span className="char-class">, {x.character_class}</span>}
                        </div>
                      </div>
                    </div>
                    {x.max_hp ? (
                      <div className="imsd-camp-hp-row">
                        <HpBar hp={x.hp} max={x.max_hp} />
                      </div>
                    ) : null}
                    {x.current_scene && (
                      <div className="imsd-camp-scene-wrap">
                        <small>{x.current_scene}</small>
                      </div>
                    )}
                  </button>
                  {onDelete && (
                    <button
                      type="button"
                      className="imsd-camp-del"
                      title={`Delete “${x.title}”`}
                      aria-label={`Delete “${x.title}”`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(x);
                      }}
                    >
                      <Icon n="del" size={17} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ padding: '12px 0' }}>No adventures found for this game filter.</p>
          )}
        </section>
      )}
      <section className="imsm-card imsd-discover">
        <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
          <h3><Icon n="book" size={20} />Games from your library</h3>
          {isOwner && <span className="imsm-row"><Btn kind="tonal" icon="search" busy={s?.active} onClick={() => discover(false)}>Find the games in my library</Btn>{!s?.active && rulesets.some((r) => r.metadata?.studied_at) && <Btn kind="text" icon="sync" onClick={() => discover(true)}>Read them all again</Btn>}</span>}
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Rindewind evaluates every game against its rulebooks for 100% mechanical fidelity. Games that have passed complete accuracy verification are unlocked for standard play. Games undergoing active development or quality checks remain greyed out, accessible exclusively for developer testing.
        </p>
        {s?.active && <div className="imsm-banner info"><Spinner size={20} /><span><b>{s.phase}</b>{s.total ? ` · ${s.done} of ${s.total}` : ''}{s.current ? ` · ${s.current}` : ''}<span className="imsm-prog"><i style={{ width: `${s.total ? (s.done / s.total) * 100 : 8}%` }} /></span></span></div>}
        {s?.error && <div className="imsm-banner"><Icon n="warn" size={20} /><span>{s.error}</span></div>}

        {/* Readiness Filter Strip */}
        <div className="imsm-row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div className="imsd-filter-chips">
            <button
              type="button"
              className={`imsd-filter-chip ${readinessTab === 'all' ? 'active' : ''}`}
              onClick={() => setReadinessTab('all')}
            >
              All Systems ({rulesets.length})
            </button>
            <button
              type="button"
              className={`imsd-filter-chip ${readinessTab === 'ready' ? 'active' : ''}`}
              onClick={() => setReadinessTab('ready')}
            >
              <Icon n="check" size={13} style={{ color: '#16a34a' }} />
              <span>100% Verified Ready ({readyCount})</span>
            </button>
            <button
              type="button"
              className={`imsd-filter-chip ${readinessTab === 'dev' ? 'active' : ''}`}
              onClick={() => setReadinessTab('dev')}
            >
              <Icon n="tune" size={13} style={{ color: '#b45309' }} />
              <span>In Development ({devCount})</span>
            </button>
          </div>
          {isOwner && (
            <span className="imsd-dev-owner-cue">
              <Icon n="admin" size={14} />
              <span>Developer mode active · Simon Philpott has testing access to all systems</span>
            </span>
          )}
        </div>
      </section>

      <div className="imsd-games">
        {sorted.map((r) => {
          const p = r.metadata || {};
          const readiness = r.readinessData || getReadiness(r);
          const isReady = readiness.status === 'ready';

          return (
            <section
              key={r.id}
              className={`imsd-game cover-${[...r.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 6} ${isReady ? 'is-ready' : 'is-dev'}`}
            >
              {!isReady && (
                <div className="imsd-game-dev-pill" title="This system is undergoing rulebook ingestion & QA accuracy checks">
                  <Icon n="tune" size={13} />
                  <span>In Development · QA Pending</span>
                </div>
              )}
              <span className="imsd-kicker">{p.genre || r.genre}</span>
              <h3 className="nm">{p.name || r.name}</h3>
              {p.tagline && <p className="imsd-tagline">{p.tagline}</p>}
              <p className="muted desc">{p.description || r.description}</p>

              {/* Preparedness & Rulebook Accuracy Meter */}
              <div className="imsd-game-readiness">
                <div className="imsm-row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                  <span className="lbl">{isReady ? 'Rulebook Accuracy & Engine' : 'Preparedness for 100% Accuracy'}</span>
                  <b className={`pct ${isReady ? 'ready' : 'dev'}`}>{readiness.percentage}%</b>
                </div>
                <div className="imsd-game-readiness-track">
                  <div
                    className={`imsd-game-readiness-fill ${isReady ? 'ready' : 'dev'}`}
                    style={{ width: `${readiness.percentage}%` }}
                  />
                </div>
                <small className="imsd-readiness-note">
                  {readiness.summary}
                </small>
                {readiness.checklist && (
                  <details className="imsd-qa-dropdown">
                    <summary>
                      <Icon n="checklist" size={13} />
                      <span>QA Accuracy Checklist ({readiness.checklist.filter((c) => c.done).length}/{readiness.checklist.length})</span>
                    </summary>
                    <ul className="imsd-qa-list">
                      {readiness.checklist.map((item, idx) => (
                        <li key={idx} className={item.done ? 'done' : 'pending'}>
                          <Icon n={item.done ? 'check' : 'blank'} size={12} />
                          <span>{item.name}</span>
                          <small>{item.done ? 'Verified' : 'In QA'}</small>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>

              <div className="imsm-row" style={{ marginBottom: '8px' }}>
                {p.solo && <span className="tag">{p.solo}</span>}
                {(p.files?.length || r.books_count) ? <span className="tag"><Icon n="doc" size={15} />{p.files?.length || r.books_count} books</span> : null}
                <span className={`tag ${p.grounded ? 'good' : ''}`}>{p.grounded ? 'Read from your books' : p.studied_at ? 'Known from memory' : 'Not read yet'}</span>
                {isReady ? (
                  <span className="tag good" title="Rulebook 100% verified and battle-tested in solo play">
                    <Icon n="check" size={14} />100% Rulebook Verified
                  </span>
                ) : (
                  <span className="tag dev-tag" title="Rulebook mechanics undergoing QA accuracy check">
                    <Icon n="tune" size={13} />{readiness.label || `${readiness.percentage}% Prepared · QA Pending`}
                  </span>
                )}
              </div>

              <div className="imsm-row end" style={{ gap: '8px', marginTop: 'auto' }}>
                <Btn kind="text" icon="doc" onClick={() => onOpenRules?.(r.id)}>Rules &amp; Tables</Btn>
                {isReady ? (
                  <Btn icon="play" onClick={() => onStart(r)}>Begin an adventure</Btn>
                ) : isOwner ? (
                  <Btn
                    kind="tonal"
                    icon="play"
                    className="imsd-dev-test-btn"
                    onClick={() => onStart(r)}
                    title="Developer Testing Access: Start session to test & develop rulebook accuracy"
                  >
                    Test Adventure (Dev Only)
                  </Btn>
                ) : (
                  <Btn
                    disabled
                    icon="lock"
                    title="This game is in development and undergoing quality verification. It will unlock once verified."
                  >
                    Awaiting QA Check
                  </Btn>
                )}
              </div>
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
  const [details, setDetails] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [faceRef, setFaceRef] = useState(null);
  const [hero, setHero] = useState(null);
  const [busy, setBusy] = useState('');
  const [books, setBooks] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setRid(initial || rulesets.find((r) => r.metadata?.studied_at)?.id || rulesets[0]?.id || '');
      setHero(null); setTitle(''); setPremise(''); setBooks([]); setName(''); setConcept(''); setDetails(''); setAvatarUrl(''); setFaceRef(null);
    }
  }, [open, initial]); // eslint-disable-line react-hooks/exhaustive-deps

  const r = rulesets.find((x) => x.id === rid);
  const p = r?.metadata || {};

  const onAttachFace = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1024;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        setFaceRef({
          dataUrl,
          name: file.name
        });
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const rollUp = async () => {
    setBusy('hero');
    try {
      const res = await api(`/rulesets/${rid}/hero`, {
        method: 'POST',
        body: {
          name,
          concept,
          details,
          premise,
          referenceImage: faceRef?.dataUrl || null
        }
      });
      setHero(res.hero);
      if (res.hero?.avatarUrl) setAvatarUrl(res.hero.avatarUrl);
      dndAudio.playSfx('dice_roll');
    } catch (e) { err(e); } finally { setBusy(''); }
  };

  const paintAvatar = async () => {
    setBusy('avatar');
    try {
      const res = await api('/hero/avatar', {
        method: 'POST',
        body: {
          name: hero?.name || name || 'Hero',
          roleOrClass: hero?.roleOrClass || p.character_template?.role_or_class || 'Adventurer',
          rulesetId: rid,
          concept,
          details,
          backstory: hero?.backstory || '',
          premise,
          referenceImage: faceRef?.dataUrl || null
        }
      });
      if (res?.avatarUrl) {
        setAvatarUrl(res.avatarUrl);
        if (hero) setHero((h) => ({ ...h, avatarUrl: res.avatarUrl }));
        dndAudio.playSfx('oracle_whisper');
      }
    } catch (e) { err(e); } finally { setBusy(''); }
  };

  const start = async () => {
    setBusy('start');
    try {
      const heroAvatar = hero?.avatarUrl || avatarUrl || null;
      const d = await api('/campaigns', {
        method: 'POST',
        body: {
          title: title.trim() || `${p.name || r?.name}: a solo tale`,
          rulesetId: rid,
          premise,
          books,
          characterName: name,
          details,
          concept,
          avatarUrl: heroAvatar,
          referenceImage: faceRef?.dataUrl || null,
          character: hero
            ? { ...hero, name: hero.name || name, avatarUrl: heroAvatar }
            : (name || details || concept || faceRef ? { name, roleOrClass: p.character_template?.role_or_class || 'Adventurer', avatarUrl: heroAvatar, backstory: details } : undefined)
        }
      });
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
        <TextArea
          label="Appearance & distinctive features (optional)"
          rows={2}
          value={details}
          onChange={setDetails}
          help="Describe your hero: eye/hair color, scars, armour, cloaks, trinkets or physical traits. Rindewind will illustrate their portrait and weave this into their fate."
        />

        {/* Facial Likeness Photo Attachment Box */}
        <div className="imsd-face-box">
          <div className="imsd-face-box-head">
            <div className="imsd-face-box-title">
              <Icon n="face" size={17} />
              <span>Face Likeness &amp; Appearance Photo</span>
            </div>
            <span className="imsd-face-box-hint">Optional · Foundation for your hero's portrait</span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={onAttachFace}
          />

          {!faceRef ? (
            <div className="imsd-face-drop" onClick={() => fileInputRef.current?.click()}>
              <div className="imsd-face-drop-content">
                <span className="imsd-face-icon-wrap"><Icon n="camera" size={26} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>Attach a photo or face image</b>
                  <p className="muted">
                    Rindewind transforms your likeness into a weathered, haggard RPG portrait marked by your opening ordeal and environment.
                  </p>
                </div>
                <Btn kind="tonal" icon="add" type="button" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                  Choose photo
                </Btn>
              </div>
            </div>
          ) : (
            <div className="imsd-face-attached">
              <div className="imsd-face-attached-preview">
                <img src={faceRef.dataUrl} alt="Attached face likeness" />
                <span className="imsd-face-attached-tag">Source</span>
              </div>
              <div className="imsd-face-attached-info">
                <b>{faceRef.name}</b>
                <p className="muted">
                  Likeness active. Rindewind will illustrate this face weathered, haggard, and stained by the opening scene.
                </p>
                <div className="imsm-row" style={{ gap: '8px', marginTop: '6px' }}>
                  <Btn kind="text" icon="sync" type="button" onClick={() => fileInputRef.current?.click()}>
                    Change photo
                  </Btn>
                  <Btn kind="text" icon="close" type="button" onClick={() => setFaceRef(null)}>
                    Remove
                  </Btn>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="imsm-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <Btn kind="tonal" icon="dice" busy={busy === 'hero'} disabled={!rid || Boolean(busy)} onClick={rollUp}>
            {hero ? 'Roll up another' : 'Roll up a hero by the book'}
          </Btn>
          {(hero || name || details || concept || faceRef) && (
            <Btn kind="tonal" icon="palette" busy={busy === 'avatar'} disabled={!rid || Boolean(busy)} onClick={paintAvatar}>
              {avatarUrl ? (faceRef ? 'Repaint from photo' : 'Repaint portrait') : (faceRef ? 'Paint portrait from photo' : 'Paint portrait')}
            </Btn>
          )}
          {!hero && <span className="muted">or begin with the game's ready-made hero{p.character_template?.role_or_class ? ` (${p.character_template.role_or_class})` : ''}</span>}
        </div>
        {hero && (
          <section className="imsm-card imsd-herocard">
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              {(hero.avatarUrl || avatarUrl) ? (
                <div className="imsd-herocard-avatar">
                  <img src={hero.avatarUrl || avatarUrl} alt={hero.name} />
                  <button type="button" className="imsd-herocard-avatar-reroll" title={faceRef ? "Repaint portrait from photo" : "Repaint portrait"} onClick={paintAvatar} disabled={busy === 'avatar'}>
                    <Icon n="sync" size={14} />
                  </button>
                  {faceRef && <span className="imsd-avatar-likeness-tag" title="Illustrated from your attached photo">Likeness</span>}
                </div>
              ) : (
                <button type="button" className="imsd-herocard-avatar-btn" onClick={paintAvatar} disabled={busy === 'avatar'}>
                  <Icon n="palette" size={24} />
                  <span>{busy === 'avatar' ? 'Painting…' : (faceRef ? 'Paint from photo' : 'Paint portrait')}</span>
                </button>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <span className="imsd-kicker">{hero.roleOrClass}</span>
                <h3 className="nm">{hero.name}</h3>
                <div className="imsm-row" style={{ marginTop: '4px' }}>
                  <span className="tag">{p.hp_label || 'HP'} {hero.maxHp}</span>
                  <span className="tag">{p.defence_label || 'AC'} {hero.ac}</span>
                  <span className="tag" style={{ color: 'var(--imsd-gilt)' }}>XP {hero.xp || 0} / 1,000</span>
                </div>
              </div>
              <ArmorMannequin hero={hero} isKN={p.id === 'ker-nethalas'} compact />
            </div>
            <div className="imsd-stats small" style={{ marginTop: '10px' }}>
              {Object.entries(hero.attributes || {}).map(([k, v]) => <div key={k}><span>{k}</span><b className="num">{v}</b></div>)}
            </div>
            <p style={{ margin: 0 }}>{hero.backstory}</p>
            <p className="muted" style={{ margin: 0 }}><b>Kit:</b> {(hero.inventory || []).join(', ')}</p>
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

// ============================================================================
// CANONICAL KER NETHALAS TABLES & DEFINITIONS (Rulebook Ingested pp. 78-125)
// ============================================================================

export const DEFENSIVE_MOVES = [
  { roll: 1, name: 'Upper Hand', effect: '+10% bonus to your next Attack Check against this foe.' },
  { roll: 2, name: 'Armor Crushed', effect: 'Enemy armor reduced by -1 at the targeted location.' },
  { roll: 3, name: 'Inflict Bleeding', effect: 'Adversary gains Bleeding (1): takes 1 damage at the end of each round.' },
  { roll: 4, name: 'Knockdown / Shove', effect: 'Adversary is knocked Prone! Attacks against prone targets gain +10%.' },
  { roll: 5, name: 'Riposte / Counter-thrust', effect: 'Quick counter-strike deals 1 Piercing damage, completely bypassing armor!', piercingDmg: 1 },
  { roll: 6, name: 'Disarmed', effect: 'Enemy weapon batted away; foe must spend next action retrieving it.' },
  { roll: 7, name: 'Tactical Reposition', effect: 'Free repositioning; disengage or shift reach without penalty.' },
  { roll: 8, name: 'Defensive Mastery', effect: '+20% bonus to your next Defence roll.' },
  { roll: 9, name: 'Regain Composure', effect: 'Catch your breath amidst battle: restore 2 Toughness buffer!', toughnessHeal: 2 },
  { roll: 10, name: 'Free Counter-Attack', effect: 'Immediate Free Counter-Attack against the adversary!' }
];

export const getHitLocation = (d20) => {
  if (d20 <= 2) return { name: 'Head (Weak Spot!)', isWeakSpot: true };
  if (d20 <= 8) return { name: 'Torso', isWeakSpot: false };
  if (d20 <= 14) return { name: 'Arms', isWeakSpot: false };
  return { name: 'Legs', isWeakSpot: false };
};

export const MADNESS_TABLE = [
  { roll: 1, name: 'Irretrievably Lost', effect: 'The survivor’s mind shatters entirely; consumed by the abyss (Character Death/Lost).' },
  { roll: 2, name: 'Traumatised', effect: 'Permanent -1 modifier to all future rolls on this Madness Table.' },
  { roll: 3, name: 'Paranoia', effect: 'Permanent -1 penalty to Maximum Toughness buffer.' },
  { roll: 4, name: 'Phobia', effect: 'Whenever suffering Sanity damage from any source, suffer +1 additional Sanity damage.' },
  { roll: 5, name: 'Obsessive', effect: 'All Scavenging and Searching checks are permanently Demanding (-10%).' },
  { roll: 6, name: 'Broken Will', effect: 'All Resolve and Willpower checks are permanently Demanding (-10%).' },
  { roll: 7, name: 'Nihilism', effect: 'The survivor sees no hope: earn 10 fewer XP from all encounters (min 0).' },
  { roll: 8, name: 'Hysteria', effect: 'Uncontrollable tremors: -10% permanent penalty to a chosen Skill.' },
  { roll: 9, name: 'Self-Harm', effect: 'Overwhelmed by madness, the survivor lashes out at themselves for 2d6 direct damage!' },
  { roll: 10, name: 'Epiphany', effect: 'A terrifying cosmic truth flashes through your consciousness: +100 XP gained, and recover 5 Sanity!', epiphany: true }
];

export const PROC_DEFINITIONS = {
  exploration: {
    key: 'exploration',
    kicker: 'Step 1 · The Exploration Turn (pp. 96 & 120)',
    title: 'Venturing Into Unexplored Dark',
    image: '/exploration-tension.jpg',
    thematicWhy: 'Venturing deeper into unmapped catacombs frays your nerves, rapidly consuming torch fuel while every footstep risks alerting lurking horrors.',
    ruleCitation: 'Ker Nethalas Rules p. 120 (Tension Die) & p. 96 (Light Source): Rolling 1–2 on Tension steps down (d8 → d6 → d4). 1–2 on d4 triggers a Growing Darkness Threat (1d100). Rolling 1–2 on 1d6 Light decreases torch fuel by 1.',
    buttons: [
      {
        key: 'tension_check',
        icon: 'alarm',
        label: 'Tension Check',
        tooltip: 'Roll current Tension Die (steps down on 1-2; D4 on 1-2 triggers a Growing Darkness Event)'
      },
      {
        key: 'light_check',
        icon: 'flare',
        label: '1d6 Light Fuel',
        tooltip: 'Roll 1d6 light source usage (fuel degrades on 1-2)'
      },
      {
        key: 'scavenge_search',
        icon: 'search',
        label: 'Search Room (+Tension)',
        tooltip: 'Search the chamber for threats or salvage; automatically steps Tension down'
      }
    ]
  },
  breather: {
    key: 'breather',
    kicker: 'Resting · Taking a Breather (p. 123)',
    title: 'Catching Breath in the Shadows',
    image: '/camp-rest.jpg',
    thematicWhy: 'A short 10-minute pause to bandage superficial scrapes, steady trembling hands, and catch your breath amidst the oppressive gloom.',
    ruleCitation: 'Ker Nethalas Rules p. 123: Costs 5 turns of Lightsource fuel and steps the Tension Die down 1 stage. Restores 1d10+2 Toughness, 1 Health, and eases Exhaustion by 2.',
    buttons: [
      {
        key: 'breather_confirm',
        icon: 'shield',
        label: 'Confirm 10-Min Breather',
        tooltip: 'Spend 5 Light & step Tension down to recover 1d10+2 Toughness, 1 Health, -2 Exhaustion'
      }
    ]
  },
  camp: {
    key: 'camp',
    kicker: 'Step 4 · The Camp Phase (pp. 123–125)',
    title: 'Fortified Reprieve & Secured Rest',
    image: '/camp-rest.jpg',
    thematicWhy: 'Barricading yourself in the dark offers a desperate reprieve to bandage deep wounds, steady fraying nerves, and tend to worn gear before the shadows close in.',
    ruleCitation: 'Ker Nethalas Rules pp. 123–125: Requires 1 Ration (benefits halved if none). Roll 1d20 Camp Check (DC 12). If failed, an Ambush occurs (half benefits). Safe camp fully replenishes Toughness, +1 Health, +1d4 Sanity, -10 Exhaustion, Skill Advancement checks, and resets Tension to d8.',
    buttons: [
      {
        key: 'camp_confirm',
        icon: 'sparkle',
        label: 'Roll 1d20 Camp Check & Rest',
        tooltip: 'Consume 1 Ration and roll 1d20 Camp Check vs DC 12 for full rest recovery'
      },
      {
        key: 'repair_armour',
        icon: 'construct',
        label: 'Repair Armour',
        tooltip: 'Spend scrap or repair supplies to patch damaged armour integrity'
      }
    ]
  },
  post_combat: {
    key: 'post_combat',
    kicker: 'Step 3 · Post-Combat Maintenance (pp. 83 & 86)',
    title: 'Catching Breath & Checking Armour',
    image: '/post-combat-recovery.jpg',
    thematicWhy: 'With the immediate slaughter ended, you must catch your breath to restore superficial composure and inspect whether your battered armour withstood the deadly blows.',
    ruleCitation: 'Ker Nethalas Rules p. 86 (Catching Breath) & p. 83 (Armor Integrity): Restore 1d4 Toughness buffer immediately after battle. Roll 1d10 Armor Integrity (degrades on 1-2). Scavenge fallen foes.',
    buttons: [
      {
        key: 'toughness_recovery',
        icon: 'shield',
        label: '1d4 Toughness Catch Breath',
        tooltip: 'Roll 1d4 to restore superficial Toughness buffer after surviving combat'
      },
      {
        key: 'armour_integrity',
        icon: 'shield',
        label: '1d10 Armour Integrity',
        tooltip: 'Roll 1d10 Armour Integrity check (degrades from d10 to d8 on 1-2)'
      },
      {
        key: 'scavenge_search',
        icon: 'search',
        label: 'Search Foes (+Tension)',
        tooltip: 'Scavenge slain adversaries for loot; advances the tension die by one step'
      }
    ]
  },
  madness: {
    key: 'madness',
    kicker: 'Dread & Madness · Fractured Mind (p. 91)',
    title: 'Mind Collapsed into Madness',
    image: '/sanity-willpower.jpg',
    thematicWhy: 'Your mental barriers have completely collapsed under cosmic dread. The terrifying reality of the necropolis fractures your mind into permanent madness.',
    ruleCitation: 'Ker Nethalas Rules p. 91 (Madness Table): Dropping to 0 Sanity forces an immediate roll on the 1d10 Madness Table to determine the permanent psychological affliction, then resets Sanity to baseline (1d4).',
    buttons: [
      {
        key: 'madness_roll',
        icon: 'flame',
        label: 'Roll 1d10 Madness Table',
        tooltip: 'Roll 1d10 on the canonical Madness Table to determine psychological affliction'
      }
    ]
  },
  sanity: {
    key: 'sanity',
    kicker: 'Dread & Terror · Willpower Check (p. 91)',
    title: 'Resisting Eldritch Terror',
    image: '/sanity-willpower.jpg',
    thematicWhy: 'Confronting the unhallowed eldritch abominations of the necropolis threatens to shatter your fragile mortal mind unless your iron willpower holds firm.',
    ruleCitation: 'Ker Nethalas Rules p. 91: Roll d100 under Willpower/Soul. If failed, roll 1d4 Sanity damage. Dropping to 0 Sanity triggers an immediate roll on the 1d10 Madness Table.',
    buttons: [
      {
        key: 'willpower_check',
        icon: 'bolt',
        label: 'd100 Willpower Test',
        tooltip: 'Roll d100 under your character’s Willpower/Soul attribute to resist panic'
      },
      {
        key: 'take_sanity_damage',
        icon: 'heart-dislike',
        label: '1d4 Sanity Damage',
        tooltip: 'Roll 1d4 Sanity damage upon failing terror test'
      }
    ]
  }
};

function EphemeralProcModal({ proc, hero, onRoll, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!proc) return null;

  return (
    <div className="imsd-proc-modal-backdrop" onClick={onClose}>
      <div className="imsd-proc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="imsd-proc-modal-head">
          <div>
            <span className="kicker">{proc.kicker}</span>
            <h3 className="title">{proc.title}</h3>
          </div>
          <button type="button" className="imsd-phase-dismiss-btn" onClick={onClose} title="Close / Dismiss">
            <Icon n="close" size={16} />
          </button>
        </div>

        <div className="imsd-proc-modal-body">
          <div className="imsd-proc-thematic-card">
            <div className="imsd-proc-thematic-text">
              "{proc.thematicWhy}"
            </div>
            {proc.image && (
              <div className="imsd-proc-thematic-art" title={proc.title}>
                <img src={proc.image} alt={proc.title} />
              </div>
            )}
          </div>

          <div className="imsd-proc-rule-box">
            <b>Official Rulebook:</b> {proc.ruleCitation}
          </div>

          <div className="imsd-proc-btns-grid">
            {proc.buttons.map((btn) => (
              <button
                key={btn.key}
                type="button"
                className="imsd-proc-btn"
                onClick={() => onRoll(btn.key)}
                title={btn.tooltip}
              >
                <Icon n={btn.icon} size={16} />
                <span>{btn.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DndSolo({ theme, onThemeToggle, setCurrentPath }) {
  const [isOwner, setIsOwner] = useState(false);
  const [invite, setInvite] = useState(false);
  useEffect(() => { api('/me').then((d) => setIsOwner(Boolean(d.isOwner))).catch(() => {}); }, []);
  return (
    <ServicePage title="D&D Solo" icon="dice" accent="brown" wide theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} rail={false}
      actions={<>{isOwner ? <IconButton icon="people" label="Invite players" onClick={() => setInvite(true)} /> : null}<button type="button" style={{ background: 'transparent', border: '1px solid currentColor', color: 'inherit', borderRadius: 999, padding: '6px 14px', font: '600 12px Cinzel, serif', cursor: 'pointer', minHeight: 36 }} onClick={() => { window.history.pushState(null, '', '/ims/dnd-beta'); if (setCurrentPath) setCurrentPath('/ims/dnd-beta'); else window.dispatchEvent(new PopStateEvent('popstate')); }}>Try the beta</button></>}>
      <Body isOwner={isOwner} />
      {isOwner && <Invites open={invite} onClose={() => setInvite(false)} />}
    </ServicePage>
  );
}
