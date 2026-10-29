// Rindewind at the table: his painted face (the Chronicler, as in the classic), his narration switch, and a word with
// him out of character: a rule (answered from the rulebook, with its pages), advice on what to do, or a recap.
// useVoice reads text aloud in his voice (the LOTR chronicle narrator), only when you ask.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ChroniclerFace from '../../Ims/ChroniclerFace';
import * as E from '../kn/engine';
import Ico from '../ui/Ico';
import { Rich } from '../ui/Tip';
import { Switch } from '../ui/Bits';

const post = async (path, body) => { const r = await fetch(`/api/dnd${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const d = await r.json().catch(() => ({})); if (!r.ok || d.success === false) throw new Error(d.error || `HTTP ${r.status}`); return d; };

export function useVoice(onError) {
  const level = useRef(0);
  const [playing, setPlaying] = useState(null); const [waiting, setWaiting] = useState(null);
  const audio = useRef(null), raf = useRef(0), ctx = useRef(null);
  const stop = useCallback(() => { cancelAnimationFrame(raf.current); try { audio.current?.pause(); } catch { /* gone */ } audio.current = null; level.current = 0; setPlaying(null); }, []);
  const play = useCallback(async (id, text) => {
    stop(); setWaiting(id);
    try {
      let r;
      for (let i = 0; i < 90; i++) { r = await post('/voice', { text }); if (r.url) break; await new Promise((ok) => setTimeout(ok, 2000)); }
      if (!r?.url) throw new Error('His voice is taking too long. Try again.');
      const a = new Audio(r.url); a.crossOrigin = 'anonymous'; audio.current = a;
      ctx.current = ctx.current || new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.current.createMediaElementSource(a); const an = ctx.current.createAnalyser(); an.fftSize = 512; src.connect(an); an.connect(ctx.current.destination);
      const buf = new Uint8Array(an.fftSize);
      const tick = () => { an.getByteTimeDomainData(buf); let s = 0; for (const v of buf) s += ((v - 128) / 128) ** 2; level.current = Math.min(1, Math.sqrt(s / buf.length) * 4.5); raf.current = requestAnimationFrame(tick); };
      a.onended = stop; await ctx.current.resume(); await a.play(); setPlaying(id); tick();
    } catch (e) { onError?.(e.message); stop(); } finally { setWaiting(null); }
  }, [stop, onError]);
  useEffect(() => stop, [stop]);
  return { level, playing, waiting, play, stop };
}

// what he is told about the game when you ask him something
export function contextOf(game) {
  if (!game) return {};
  const h = game.hero, v = h.vit, p = E.here(game), cb = game.combat;
  const doors = p.doors.filter((d) => !d.blocked).map((d) => (d.to ? `back to ${E.pieceById(game, d.to)?.title}` : `the ${['north', 'east', 'south', 'west'][d.dir]} way (${d.kind ? `${d.kind}${d.locked ? ', locked' : ''}${d.spotted ? ', trapped' : ''}` : 'unexplored'})`));
  return {
    hero: `${h.name}: Health ${v.health}/${v.maxHealth}, Toughness ${v.tough}/${v.maxTough}, Sanity ${v.sanity}/${v.maxSanity}, Aether ${v.aether}, Light ${v.light} rooms, Exhaustion ${v.exh}, XP ${v.xp}. Resolve ${h.resist.Resolve}, Endurance ${h.resist.Endurance}, Spellward ${h.resist.Spellward}. Skills: ${Object.entries(h.skills).map(([k, n]) => `${k} ${n}`).join(', ')}. Weapon: ${h.weapons[h.wield].name}. Pack: ${h.items.rations} rations, ${h.items.bandages} bandages, ${h.items.torches} torches. Conditions: ${h.effects.map((e) => e.name).join(', ') || 'none'}.`,
    place: `${p.title}: ${p.desc?.text || ''} ${p.enc ? `${p.enc.name} are here.` : p.cleared ? 'It is quiet.' : ''} ${p.searched ? 'Searched.' : 'Not searched.'}`,
    state: `Domain ${game.domain.n} ruled by ${game.domain.overseer.name} (${game.domain.overseer.influence}). Tension Die D${game.domain.tension}. ${game.domain.lairFound ? 'Lair found.' : `Lair Die D${game.domain.lair}.`}${cb ? ` In combat, round ${cb.round}.` : ''}${p.event?.roll && !p.event.done ? ` An event: ${p.event.text}` : ''}`,
    options: cb ? 'attack, flee (Dodge check), break free if held' : `go through ${doors.join('; ')}; search the room; take a Breather; set camp; tend wounds`,
    recent: game.log.slice(-14).map((e) => `${e.title}: ${e.text}`).join('\n').slice(0, 3000),
  };
}

export default function Rindewind({ game, open, onClose, narrate, setNarrate, voice, onPage }) {
  const [q, setQ] = useState('');
  const [chat, setChat] = useState([]);
  const [busy, setBusy] = useState(false);
  const [mood, setMood] = useState('neutral');
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [chat.length, busy]);
  const ask = async (question, mode = 'free') => {
    const text = String(question).trim(); if (!text || busy) return;
    setChat((c) => [...c, { who: 'you', text }]); setQ(''); setBusy(true);
    try {
      const r = await post('/beta/ask', { question: text, mode, context: contextOf(game) });
      setMood(r.mood || 'neutral'); setChat((c) => [...c, { who: 'him', text: r.answer, sources: r.sources || [], kind: r.kind, id: `a${Date.now()}` }]);
    } catch (e) { setChat((c) => [...c, { who: 'him', text: `I cannot answer that just now (${e.message}).`, id: `e${Date.now()}` }]); } finally { setBusy(false); }
  };
  const p = game ? E.here(game) : null; const cb = game?.combat;
  const quick = [
    ['What should I do now?', 'advice'], ['Remind me what has happened', 'recap'],
    cb ? ['How does fleeing work?', 'rule'] : p?.event?.roll && !p.event.done ? ['What does this event ask of me?', 'advice'] : ['How does the Tension Die work?', 'rule'],
    ['Is this a good place to camp?', 'advice'],
  ];
  const status = voice?.playing ? 'speaking' : busy ? 'thinking' : 'idle';
  if (!open) return null;
  return (
    <div className="dbt-rw-wrap" role="presentation" onClick={onClose}>
      <aside className="dbt-rw" role="dialog" aria-label="Rindewind" onClick={(e) => e.stopPropagation()}>
        <header className="dbt-rw-head">
          <div className="face"><ChroniclerFace face={{ emotion: mood }} status={status} levelRef={voice?.level} width={92} /></div>
          <div className="t"><span className="dbt-kick">Your Dungeon Master</span><h2>Rindewind</h2><small>{status === 'thinking' ? 'Thinking...' : status === 'speaking' ? 'Speaking' : 'Ask him anything, out of the story'}</small></div>
          <button type="button" className="dbt-x" onClick={onClose} aria-label="Close"><Ico n="close" size={18} /></button>
        </header>
        <div className="dbt-rw-switch"><Switch id="dbt-rw-narr" checked={narrate} onChange={setNarrate} label="He narrates each new place" sub="One or two lines after the book's own words. Off: the book alone." /></div>
        <div className="dbt-rw-chat">
          {chat.length === 0 && <p className="dbt-fell dbt-rw-hello">Well met, {game?.hero.name || 'traveller'}. Ask me how a rule works and I shall find it in the book; ask what to do and I shall tell you what I would.</p>}
          {chat.map((m, i) => (
            <div key={i} className={`msg ${m.who}`}>
              <p>{m.who === 'him' ? <Rich text={m.text} /> : m.text}</p>
              {m.sources?.length > 0 && <div className="src">{m.sources.map((s, j) => <button key={j} type="button" className="dbt-pg" onClick={() => onPage(s.page, s.id)}><Ico n="tome" size={12} />{s.book ? `${String(s.book).split(':')[0]}, ` : ''}p. {s.page}</button>)}</div>}
              {m.who === 'him' && voice && <button type="button" className="dbt-speak" onClick={() => (voice.playing === m.id ? voice.stop() : voice.play(m.id, m.text))}><Ico n={voice.playing === m.id ? 'stop' : voice.waiting === m.id ? 'hourglass' : 'speaker'} size={14} />{voice.playing === m.id ? 'Stop' : 'Read aloud'}</button>}
            </div>
          ))}
          {busy && <div className="msg him"><p className="dbt-dots"><i /><i /><i /></p></div>}
          <div ref={end} />
        </div>
        <div className="dbt-rw-quick">{quick.map(([t, m]) => <button key={t} type="button" onClick={() => ask(t, m)} disabled={busy}>{t}</button>)}</div>
        <form className="dbt-rw-ask" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
          <label htmlFor="dbt-rw-q" className="sr">Ask Rindewind</label>
          <input id="dbt-rw-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about a rule, or what to do" />
          <button type="submit" className="dbt-btn primary" disabled={busy || !q.trim()} aria-label="Ask"><Ico n="quill" size={18} /></button>
        </form>
      </aside>
    </div>
  );
}

// his face in a small gilt medallion, always within reach
export function RindewindButton({ onClick, voice }) {
  return (
    <button type="button" className="dbt-rw-btn" onClick={onClick} aria-label="Talk to Rindewind">
      <span className="face"><ChroniclerFace face={{ emotion: 'neutral' }} status={voice?.playing ? 'speaking' : 'idle'} levelRef={voice?.level} width={54} /></span>
      <span className="lbl"><b>Rindewind</b>Ask Rindewind something</span>
    </button>
  );
}
