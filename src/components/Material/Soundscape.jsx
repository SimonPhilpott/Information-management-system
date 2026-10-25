// Soundscapes for the D&D Solo DM from Tabletop Audio (25 Oct 2026, Simon: "those soundscapes are bloody awful.
// Surely there are better ones in the free D&D resources site we're using"). Tim Cross's ten-minute tabletop
// soundscapes (tabletopaudio.com - free to stream, credited), played in a loop with a crossfade. Following the story,
// it plays the track the server picked for the latest scene; or pick one yourself from the whole catalogue.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, IconButton, Btn, Sheet, FilterChip, Slider, Spinner } from '../HomebrewBeta/ui';

const GENRES = [['', 'All'], ['fantasy', 'Fantasy'], ['horror', 'Horror'], ['scifi', 'Sci-fi'], ['historical', 'Historical'], ['nature', 'Nature']];
let catalogue = null;
export async function loadCatalogue() {
  if (!catalogue) catalogue = fetch('/api/dnd/soundscapes').then((r) => r.json()).then((d) => d.tracks || []).catch(() => { catalogue = null; return []; });
  return catalogue;
}

// two audio elements, crossfading; volume 0-1
export function useSoundscape() {
  const a = useRef([null, null]);
  const cur = useRef(0);
  const fade = useRef(0);
  const [track, setTrack] = useState(null);
  const [on, setOn] = useState(false);
  const [vol, setVol] = useState(() => { try { return Number(localStorage.getItem('dnd_sound_vol')) || 0.5; } catch { return 0.5; } });
  const volRef = useRef(vol);
  volRef.current = vol;
  const el = (i) => {
    if (!a.current[i]) { const x = new Audio(); x.loop = true; x.preload = 'auto'; a.current[i] = x; }
    return a.current[i];
  };
  const crossTo = useCallback((t) => {
    clearInterval(fade.current);
    const from = el(cur.current), next = (cur.current + 1) % 2, to = el(next);
    if (!t) { from.pause(); return; }
    if (from.src === t.link && !from.paused) return;
    to.src = t.link; to.volume = 0; to.currentTime = 0;
    to.play().catch(() => {});
    cur.current = next;
    let k = 0;
    fade.current = setInterval(() => {
      k = Math.min(1, k + 0.05);
      to.volume = volRef.current * k;
      from.volume = Math.max(0, volRef.current * (1 - k));
      if (k >= 1) { clearInterval(fade.current); from.pause(); }
    }, 100);
  }, []);
  const play = useCallback((t) => { setTrack(t); setOn(true); crossTo(t); }, [crossTo]);
  const stop = useCallback(() => { setOn(false); clearInterval(fade.current); a.current.forEach((x) => x?.pause()); }, []);
  const setVolume = useCallback((v) => {
    setVol(v); volRef.current = v;
    try { localStorage.setItem('dnd_sound_vol', String(v)); } catch { /* ignore */ }
    const x = a.current[cur.current]; if (x) x.volume = v;
  }, []);
  // a little quieter while Rindewind speaks
  const duck = useCallback((down) => { const x = a.current[cur.current]; if (x && !x.paused) x.volume = volRef.current * (down ? 0.35 : 1); }, []);
  useEffect(() => () => { clearInterval(fade.current); a.current.forEach((x) => { if (x) { x.pause(); x.src = ''; } }); }, []);
  return { track, on, vol, play, stop, setVolume, duck };
}

// the whole catalogue to browse: search, genre, covers
export function SoundscapePicker({ open, onClose, current, onPick, follow, onFollow, vol, onVol }) {
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const [g, setG] = useState('');
  useEffect(() => { if (open) loadCatalogue().then(setList); }, [open]);
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (list || []).filter((t) => (!g || t.genres.includes(g)) && words.every((w) => `${t.title} ${t.tags.join(' ')} ${t.flavor}`.toLowerCase().includes(w))).slice(0, 120);
  }, [list, q, g]);
  return (
    <Sheet open={open} onClose={onClose} title="Soundscapes" wideWidth="900px"
      footer={<div className="imsm-row" style={{ justifyContent: 'space-between', width: '100%' }}><small className="muted">Soundscapes by <a href="https://tabletopaudio.com" target="_blank" rel="noreferrer">Tabletop Audio</a> (Tim Cross) - free to stream; support him on Patreon if you love them.</small><Btn kind="text" onClick={onClose}>Done</Btn></div>}>
      <div className="imsm-form">
        <div className="imsm-row">
          <FilterChip on={follow} onClick={() => onFollow(!follow)} lead={<Icon n="book" size={16} />}>Follow the story</FilterChip>
          <span className="grow" />
          <div style={{ minWidth: 220 }}><Slider label="Volume" value={Math.round(vol * 100)} min={0} max={100} onChange={(v) => onVol(v / 100)} /></div>
        </div>
        <div className="imsh-search"><Icon n="search" size={20} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search - tavern, crypt, storm, derelict ship..." aria-label="Search the soundscapes" /></div>
        <div className="chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{GENRES.map(([k, l]) => <FilterChip key={k} on={g === k} onClick={() => setG(k)}>{l}</FilterChip>)}</div>
        {list === null ? <Spinner /> : (
          <div className="imsd-sounds">
            {shown.map((t) => (
              <button key={t.key} type="button" className={`sl ${current?.key === t.key ? 'on' : ''}`} onClick={() => onPick(t)} title={t.flavor}>
                <img src={t.image} alt="" loading="lazy" />
                <span><b>{t.title}</b><small>{t.tags.slice(0, 4).join(' · ')}</small></span>
                {current?.key === t.key && <Icon n="music" size={20} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
