// Figures for the beta: the hit-location silhouettes (your survivor and the creatures), with armour on each location
// and the wounds taken there, and engraved portraits of the creatures for their cards.
import React, { useId, useState } from 'react';
import { Tip } from './Tip';
import { HIT_TABLES } from '../kn/tables';

const RANGES = (anatomy) => {
  const t = HIT_TABLES[anatomy] || HIT_TABLES.Humanoid; let lo = 1; const out = {};
  for (const [hi, name] of t) { out[name] = lo === hi ? `${lo}` : `${lo}-${hi}`; lo = hi + 1; }
  return out;
};

// the figure faces you, so its right arm is on your left
const HUMANOID = {
  Head: 'M60 6c9 0 15 7.5 15 18s-6 20-15 20-15-9.5-15-20S51 6 60 6z',
  Chest: 'M42 47c6-3 12-4 18-4s12 1 18 4l4 2-2 41H40l-2-41z',
  Abdomen: 'M40 92h40l-1 19 3 17H38l3-17z',
  'Right Arm': 'M37 50l-8 4-9 40-4 32 4 4 7-3 4-31 8-28z',
  'Left Arm': 'M83 50l8 4 9 40 4 32-4 4-7-3-4-31-8-28z',
  'Right Leg': 'M38 130h21l-1 40-2 42-5 4-9-2 1-44z',
  'Left Leg': 'M61 130h21l-5 40 1 44-9 2-5-4-2-42z',
};
const QUADRUPED = {
  Head: 'M178 44c10 2 20 8 28 18-6 7-16 12-28 12-6-6-8-20 0-30z',
  Forequarters: 'M118 40c22-2 44 0 60 6-4 12-4 22 2 30-20 6-42 8-64 6 4-14 4-28 2-42z',
  Hindquarters: 'M40 58c8-16 40-20 78-18 2 14 2 28-2 42-26 2-52 0-70-6-6-6-8-12-6-18z',
  'Right Front Leg': 'M150 80l10-1 4 24 7 4-2 4-13-2z',
  'Left Front Leg': 'M134 81l9 0 1 24 6 4-2 4-12-2z',
  'Right Hind Leg': 'M70 82l12 2-2 20 6 4-2 4-12-2z',
  'Left Hind Leg': 'M50 78l11 3-3 22 6 4-2 4-12-2z',
};
const CENTRES = {
  Humanoid: { Head: [60, 25], Chest: [60, 68], Abdomen: [60, 110], 'Right Arm': [24, 92], 'Left Arm': [96, 92], 'Right Leg': [49, 172], 'Left Leg': [71, 172] },
  Quadruped: { Head: [190, 58], Forequarters: [146, 60], Hindquarters: [80, 62], 'Right Front Leg': [158, 96], 'Left Front Leg': [140, 98], 'Right Hind Leg': [77, 98], 'Left Hind Leg': [56, 96] },
};

export function armorAt(armor = {}, loc) {
  if (armor[loc] != null) return armor[loc];
  if (loc === 'Chest' || loc === 'Abdomen') return armor.Torso || 0;
  if (/Arm$/.test(loc)) return armor.Arms || 0;
  if (/Leg$/.test(loc)) return armor.Legs || 0;
  return 0;
}
// the armour itself, drawn in blackened iron over the locations it covers (humanoid only)
const PIECES = {
  Head: ['M45 24c0-11 7-17 15-17s15 6 15 17v5H45z', 'M60 8v20M47 22h26'],
  Chest: ['M41 50c7-3 13-4 19-4s12 1 19 4l2 2-2 37H41l-2-37z', 'M60 47v42M44 60c10 4 22 4 32 0M45 72c9 3 21 3 30 0'],
  Abdomen: ['M41 93h38l-1 9H42zM42 104h36l-1 9H43zM43 115h34l1 10H42z', ''],
  'Right Arm': ['M19 95l9 2-3 28-9-2z', 'M20 104l7 1M19 113l7 1'],
  'Left Arm': ['M101 95l-9 2 3 28 9-2z', 'M100 104l-7 1M101 113l-7 1'],
  'Right Leg': ['M41 170l15 1-1 38-13-1z', 'M43 182h12M43 194h12'],
  'Left Leg': ['M64 171l15-1-1 38-13 1z', 'M66 182h12M66 194h12'],
};

// ---- blood: twenty splatter shapes (a ragged pool, flung droplets, streaks), chosen by the wound so they stay put ----
function rand(seed) { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const SPLATS = Array.from({ length: 20 }, (_, v) => {
  const r = rand(v * 7919 + 13); const n = 12 + Math.floor(r() * 6); const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, k = 0.55 + r() * 0.55; pts.push([Math.cos(a) * k, Math.sin(a) * k]); }
  let d = `M${((pts[0][0] + pts[n - 1][0]) / 2).toFixed(3)} ${((pts[0][1] + pts[n - 1][1]) / 2).toFixed(3)}`;
  for (let i = 0; i < n; i++) { const q = pts[i], nx = pts[(i + 1) % n]; d += `Q${q[0].toFixed(3)} ${q[1].toFixed(3)} ${((q[0] + nx[0]) / 2).toFixed(3)} ${((q[1] + nx[1]) / 2).toFixed(3)}`; }
  const drops = Array.from({ length: 5 + Math.floor(r() * 6) }, () => { const a = r() * Math.PI * 2, dist = 1.1 + r() * 1.2; return [Math.cos(a) * dist, Math.sin(a) * dist, 0.07 + r() * 0.16]; });
  const streaks = Array.from({ length: 2 + Math.floor(r() * 3) }, () => { const a = r() * 360; return [a, 0.9 + r() * 0.9, 0.08 + r() * 0.08]; });
  return { d: d + 'Z', drops, streaks };
});
export function Blood({ x, y, size, seed = 0, crit }) {
  const sp = SPLATS[Math.abs(seed) % 20]; const s = size * (crit ? 1.35 : 1);
  return (
    <g className="blood" transform={`translate(${x} ${y}) scale(${s})`} aria-hidden="true">
      {sp.streaks.map(([a, l, w], i) => <ellipse key={`s${i}`} cx={l * 0.75} cy="0" rx={l * 0.75} ry={w} transform={`rotate(${a})`} className="b2" />)}
      <path d={sp.d} className="b1" />
      <path d={sp.d} className="b3" transform="scale(.55) translate(.15 .1)" />
      {sp.drops.map(([dx, dy, r], i) => <circle key={`d${i}`} cx={dx} cy={dy} r={r} className="b2" />)}
    </g>
  );
}

export function Silhouette({ anatomy = 'Humanoid', armor = {}, wounds = [], highlight = null, label = 'Your body', className = '' }) {
  const zones = anatomy === 'Quadruped' ? QUADRUPED : HUMANOID;
  const ranges = RANGES(anatomy); const box = anatomy === 'Quadruped' ? '0 0 220 120' : '0 0 120 222';
  const byLoc = {}; for (const w of wounds) { byLoc[w.loc] = byLoc[w.loc] || []; byLoc[w.loc].push(w); }
  return (
    <svg className={`dbt-sil ${className}`} viewBox={box} role="img" aria-label={label}>
      {anatomy === 'Quadruped' && <path className="tail" d="M42 70C22 74 14 92 4 88" />}
      {Object.entries(zones).map(([loc, d]) => {
        const a = armorAt(armor, loc), ws = byLoc[loc] || [], dmg = ws.reduce((s, w) => s + w.dmg, 0);
        const weak = loc === 'Head';
        const tip = { title: loc, badge: `D20 ${ranges[loc]}`, body: `${a ? `Armor ${a}: taken off any damage that lands here.` : 'No armour here.'}${weak ? ' The Weak Spot: a hit here is an automatic Critical Strike.' : ''}`, live: ws.length ? `${ws.length} hit${ws.length > 1 ? 's' : ''} here, ${dmg} damage${ws.some((w) => w.crit) ? ', including a critical' : ''}.` : null, page: 80 };
        return (
          <Tip as="g" key={loc} tip={tip} className={`zone ${a ? 'armored' : ''} ${ws.length ? 'hurt' : ''} ${highlight === loc ? 'hl' : ''}`}>
            <path d={d} />
            {a > 0 && anatomy === 'Humanoid' && PIECES[loc] && <g className="piece" aria-hidden="true"><path d={PIECES[loc][0]} />{PIECES[loc][1] && <path className="ln" d={PIECES[loc][1]} />}</g>}
            {a > 0 && <text x={CENTRES[anatomy][loc][0]} y={CENTRES[anatomy][loc][1] + 4} className="ar">{a}</text>}
            {ws.slice(-5).map((w, i) => { const [cx, cy] = CENTRES[anatomy][loc]; const seed = [...loc].reduce((a, c) => a + c.charCodeAt(0), 0) + i * 31 + (w.dmg || 1) * 7; const ox = ((seed % 9) - 4) * 1.4, oy = ((seed % 7) - 3) * 1.6; return <Blood key={i} x={cx + ox} y={cy + oy} size={Math.min(10, 3.5 + (w.dmg || 1) * 1.1)} seed={seed} crit={w.crit} />; })}
            {weak && <circle className="weak" cx={CENTRES[anatomy].Head[0] + (anatomy === 'Quadruped' ? 4 : 10)} cy={CENTRES[anatomy].Head[1] - (anatomy === 'Quadruped' ? 8 : 14)} r="3.5" />}
          </Tip>
        );
      })}
    </svg>
  );
}

// ---- creature portraits, engraved on a dark ground ----
function Frame({ children, label }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className="dbt-art" viewBox="0 0 200 200" role="img" aria-label={label}>
      <defs>
        <radialGradient id={`g${id}`} cx="50%" cy="42%" r="70%"><stop offset="0" stopColor="#3a2a1c" /><stop offset=".6" stopColor="#1a120c" /><stop offset="1" stopColor="#070504" /></radialGradient>
        <radialGradient id={`e${id}`}><stop offset="0" stopColor="#ffd27a" /><stop offset=".4" stopColor="#ff5a24" /><stop offset="1" stopColor="#ff5a2400" /></radialGradient>
        <filter id={`b${id}`}><feGaussianBlur stdDeviation="6" /></filter>
      </defs>
      <rect width="200" height="200" fill={`url(#g${id})`} />
      <ellipse cx="100" cy="182" rx="90" ry="16" fill="#000" opacity=".5" filter={`url(#b${id})`} />
      {children(id)}
      <rect x="4" y="4" width="192" height="192" fill="none" stroke="#b8904f" strokeWidth="2" />
      <rect x="9" y="9" width="182" height="182" fill="none" stroke="#b8904f" strokeWidth=".8" opacity=".6" />
    </svg>
  );
}
function Rat({ x = 0, y = 0, s = 1, dim = 1, id }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={dim}>
      <path d="M28 120C12 128 8 146-4 142" stroke="#6d5a49" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M30 118c0-26 30-40 64-40 22 0 36 6 48 14 12-6 26-4 36 4l14 12c-4 8-14 12-26 12-8 6-22 8-32 6l-80 4c-16 2-24-4-24-12z" fill="#2c221a" stroke="#8c7560" strokeWidth="2" />
      <path d="M44 100c10-10 24-14 40-14M60 108c14-6 30-8 46-6M120 92c8 0 14 2 20 6" stroke="#5a4838" strokeWidth="1.5" fill="none" />
      <circle cx="160" cy="88" r="9" fill="#3a2d22" stroke="#8c7560" strokeWidth="2" />
      <circle cx="176" cy="98" r="4" fill={`url(#e${id})`} /><circle cx="176" cy="98" r="1.6" fill="#fff3d0" />
      <path d="M186 110l3 7 3-6M192 109l2 6 3-6" fill="#efe6d2" />
      <path d="M58 128l-6 16h8M78 128l-2 16h8M134 124l4 16h8M152 122l6 14h8" stroke="#8c7560" strokeWidth="3" fill="none" strokeLinecap="round" />
    </g>
  );
}
const ART = {
  'Blightfang Rats': (id) => (<>
    <Rat id={id} x={-6} y={30} s={0.55} dim={0.55} /><Rat id={id} x={92} y={20} s={0.5} dim={0.45} /><Rat id={id} x={6} y={34} s={0.92} />
  </>),
  'Skeletal Horrors': (id) => (<g stroke="#d9cfb8" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M48 176L150 40" stroke="#7a5a3a" strokeWidth="6" /><path d="M140 52l18-18M134 46l20 20" stroke="#9a7a50" strokeWidth="5" />
    <path d="M100 20c18 0 30 13 30 30 0 12-6 20-12 24v10H82V74c-6-4-12-12-12-24 0-17 12-30 30-30z" fill="#e6dcc6" stroke="#5a4a38" strokeWidth="2" />
    <ellipse cx="89" cy="50" rx="8" ry="9" fill="#120c08" stroke="none" /><ellipse cx="111" cy="50" rx="8" ry="9" fill="#120c08" stroke="none" />
    <circle cx="89" cy="51" r="3" fill={`url(#e${id})`} stroke="none" /><circle cx="111" cy="51" r="3" fill={`url(#e${id})`} stroke="none" />
    <path d="M100 58l-4 8h8z" fill="#120c08" stroke="none" /><path d="M86 76h28M90 76v8M96 76v8M102 76v8M108 76v8" stroke="#5a4a38" strokeWidth="1.5" />
    <path d="M100 86v70" strokeWidth="4" />
    {[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M100 ${96 + i * 11}c-14 0-24 4-28 ${10 - i}M100 ${96 + i * 11}c14 0 24 4 28 ${10 - i}`} strokeWidth="3" />)}
    <path d="M72 92L52 128 46 166M128 92l20 36 6 38" strokeWidth="4" /><path d="M84 160c-8 4-10 14-8 26M116 160c8 4 10 14 8 26" strokeWidth="4" />
    <path d="M70 90c-10-4-20 0-26 8M130 90c10-4 20 0 26 8" stroke="#6a5038" strokeWidth="6" opacity=".8" />
  </g>),
  'Flesh Eater': (id) => (<g strokeLinecap="round" strokeLinejoin="round">
    <path d="M58 182c-6-40 4-70 22-90 14-16 34-22 52-16 20 8 28 32 24 60-3 22-10 34-12 46z" fill="#8f8270" stroke="#3a3026" strokeWidth="2.5" />
    <path d="M80 92c-8-20-2-40 16-48 16-6 34 2 38 18 4 14-4 28-16 32" fill="#a39581" stroke="#3a3026" strokeWidth="2.5" />
    <circle cx="104" cy="66" r="4.5" fill={`url(#e${id})`} /><circle cx="122" cy="64" r="3.6" fill={`url(#e${id})`} />
    <path d="M94 80c10 8 26 8 36-2" stroke="#2a1e16" strokeWidth="5" fill="none" />
    <path d="M95 80l3 5 3-4 3 5 3-4 3 5 3-4 3 5 3-4 3 4" stroke="#efe6d2" strokeWidth="1.6" fill="none" />
    <path d="M80 104C60 120 46 150 40 176M150 104c14 18 20 44 20 70" stroke="#8f8270" strokeWidth="11" fill="none" />
    <path d="M36 172l-8 12M41 175l-4 13M46 176l1 12M166 172l4 14M171 171l9 11M161 173l-1 13" stroke="#d9cfb8" strokeWidth="2.4" />
    {[[96, 128, 6], [124, 118, 4], [112, 150, 5], [138, 142, 3.5], [84, 146, 3]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#5a3a2a" stroke="#3a2218" />)}
    <path d="M100 110c10 6 24 6 34 0" stroke="#6e6252" strokeWidth="2" fill="none" />
  </g>),
};
// a picture saved in the D&D books folder (Ker Nathalas/Bestiary/<Name>.jpg, .png or .webp) is used first;
// otherwise the engraved drawing. What was found is remembered, so a missing picture is only asked for once.
// first a picture given in the beta (pasted or uploaded on the bestiary card), then one saved in the books folder
const slugOf = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const versions = {};
export const artChanged = (name) => { versions[name] = Date.now(); found.delete(name); };
const sources = (name) => [`/api/dnd/beta/creature-art/${slugOf(name)}${versions[name] ? `?v=${versions[name]}` : ''}`, ...['jpg', 'png', 'webp'].map((x) => `/api/dnd/asset?path=${encodeURIComponent(`Ker Nathalas/Bestiary/${name}.${x}`)}`)];
const found = new Map();
export function CreatureArt({ name, className = '' }) {
  const v = versions[name] || 0;
  const [st, setSt] = useState({ v, i: found.has(name) ? found.get(name) : 0 });
  const i = st.v === v ? st.i : 0;
  const draw = ART[name]; const src = sources(name);
  if (i < src.length) {
    return <img className={`dbt-art photo ${className}`} src={src[i]} alt={name}
      onLoad={() => found.set(name, i)} onError={() => { const n = i + 1; found.set(name, n); setSt({ v, i: n }); }} />;
  }
  return <Frame label={`${name}, engraved`}>{(id) => (draw ? draw(id) : <text x="100" y="110" textAnchor="middle" fill="#b8904f" fontSize="60">?</text>)}</Frame>;
}
