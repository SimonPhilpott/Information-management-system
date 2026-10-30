// Figures for the beta: the hit-location silhouettes (your survivor and the creatures), with armour on each location
// and the wounds taken there, and engraved portraits of the creatures for their cards.
import React, { useId, useState } from 'react';
import { Tip } from './Tip';
import { HIT_TABLES } from '../kn/creatures';
import { OVERSEERS, overseerImg } from '../kn/tables';
import { armourByName } from '../kn/loot';
import { weaponInfo, lightInfo } from './gearInfo';

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
// the other bodies of the bestiary (p. 80): a leg is a bent limb from its root through the knee to the foot
const limb = ([x0, y0], [x1, y1], [x2, y2], w = 2.6) => `M${x0 - w} ${y0}L${x1 - w} ${y1}L${x2} ${y2}L${x1 + w} ${y1}L${x0 + w} ${y0}Z`;
const ellipse = (cx, cy, rx, ry) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;
const mirrorY = (h) => (pts) => pts.map(([x, y]) => [x, h - y]);
const INSECT = (() => {
  const m = mirrorY(120); const L = {
    'Right Front Leg': [[166, 70], [182, 92], [194, 112]], 'Right Middle Leg': [[150, 74], [150, 96], [158, 114]], 'Right Rear Leg': [[136, 72], [118, 94], [104, 112]],
  };
  const z = { Abdomen: ellipse(86, 60, 42, 24), Thorax: ellipse(150, 60, 24, 17), Head: ellipse(190, 58, 15, 13) };
  const c = { Abdomen: [86, 60], Thorax: [150, 60], Head: [190, 58] };
  for (const [k, pts] of Object.entries(L)) { z[k] = limb(...pts); c[k] = pts[1]; const lk = k.replace('Right', 'Left'); z[lk] = limb(...m(pts)); c[lk] = m(pts)[1]; }
  return { box: '0 0 220 120', z, c };
})();
const SPIDER = (() => {
  const m = mirrorY(130); const L = {
    'Front Right Leg': [[168, 78], [194, 98], [214, 122]], 'Fore Right Leg': [[158, 82], [176, 106], [186, 128]], 'Mid Right Leg': [[144, 84], [138, 108], [128, 128]], 'Right Rear Leg': [[132, 80], [116, 100], [96, 124]],
  };
  const z = { Abdomen: ellipse(88, 65, 38, 30), Cephalothorax: ellipse(152, 65, 26, 19) };
  const c = { Abdomen: [88, 65], Cephalothorax: [152, 65] };
  for (const [k, pts] of Object.entries(L)) { z[k] = limb(...pts); c[k] = pts[1]; const lk = k.replace('Right', 'Left'); z[lk] = limb(...m(pts)); c[lk] = m(pts)[1]; }
  return { box: '0 0 220 130', z, c };
})();
const SERPENT = { box: '0 0 220 120', z: { Body: 'M8 84C34 40 70 38 96 66S150 102 172 60L182 67C158 110 112 104 88 80S42 52 18 92Z', Head: ellipse(196, 54, 17, 11) }, c: { Body: [96, 74], Head: [196, 54] } };
const WINGED = (() => {
  const z = { 'Right Wing': 'M76 52L30 18L4 58L20 70L8 102L40 96L76 86Z', 'Left Wing': 'M124 52L170 18L196 58L180 70L192 102L160 96L124 86Z' };
  const c = { 'Right Wing': [34, 66], 'Left Wing': [166, 66] };
  for (const [k, d] of Object.entries(HUMANOID)) { z[k] = d; c[k] = [CENTRES.Humanoid[k][0] + 40, CENTRES.Humanoid[k][1]]; }
  return { box: '0 0 200 222', z, c, shift: { ...Object.fromEntries(Object.keys(HUMANOID).map((k) => [k, 40])) } };
})();
const BLOB = { box: '0 0 160 120', z: { Body: 'M20 80C8 50 40 18 80 22S152 40 146 76 108 112 70 108 28 104 20 80Z' }, c: { Body: [80, 66] } };
const BODIES = {
  Humanoid: { box: '0 0 120 222', z: HUMANOID, c: CENTRES.Humanoid }, Quadruped: { box: '0 0 220 120', z: QUADRUPED, c: CENTRES.Quadruped },
  Insectoid: INSECT, Arachnid: SPIDER, Serpentoid: SERPENT, 'Winged Biped': WINGED, none: BLOB,
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

// ---- the mannequin: a human figure traced from the silhouette Simon chose (a man standing, arms a little out),
// in light brown; the clothes a survivor starts with in dark brown over it; found armour in black over that.
// Hit locations are zones laid over the figure and clipped to its outline, so each still answers on hover.
const MAN = 'M57.7 3.0L55.6 3.3L50.9 5.5L49.5 6.8L48.5 9.0L48.9 13.7L48.4 16.2L48.4 19.1L47.5 20.1L47.4 21.0L48.4 24.3L51.7 30.0L53.8 32.5L53.9 34.0L49.5 38.8L46.0 41.7L43.5 43.1L39.1 44.3L35.6 46.4L32.0 50.6L30.6 53.1L29.6 56.3L28.2 62.7L27.2 69.7L27.2 79.4L26.1 87.9L26.0 97.5L27.1 104.5L27.1 113.6L26.1 119.1L26.0 123.7L26.2 126.0L28.3 129.8L32.4 132.9L34.6 134.0L35.4 133.8L35.7 133.4L35.4 131.9L31.8 127.4L31.4 123.7L32.1 122.8L32.8 123.1L33.5 124.1L34.5 127.1L35.3 127.8L36.3 127.6L36.5 125.8L35.9 122.7L33.3 116.6L33.1 111.7L33.8 106.7L35.7 99.9L35.7 85.0L38.5 73.7L39.1 72.7L39.3 69.5L40.0 68.8L40.7 69.4L41.1 70.6L42.7 80.1L42.8 93.9L40.3 102.6L39.5 108.6L38.5 122.4L38.5 134.0L41.4 148.7L41.8 152.8L42.4 153.9L42.7 157.3L42.7 164.2L41.7 170.0L42.1 179.3L43.9 188.8L46.2 195.3L48.1 208.0L48.0 209.4L47.1 211.2L43.5 216.1L43.2 217.5L43.8 218.4L44.6 218.7L54.4 218.7L55.5 218.0L56.0 216.8L56.3 206.3L55.8 202.2L55.6 192.8L56.0 187.1L57.0 182.4L57.0 176.7L55.9 169.3L54.6 164.3L56.7 155.8L57.1 152.5L57.1 144.1L58.8 122.8L59.5 122.0L60.3 122.0L61.0 122.8L61.7 134.2L62.7 143.8L62.9 153.9L65.2 164.3L62.9 176.6L62.9 182.3L64.1 189.5L64.4 195.8L63.7 205.2L63.7 216.1L64.1 217.6L65.6 218.7L75.1 218.7L76.5 218.0L76.6 216.6L72.7 211.2L71.9 209.1L73.7 195.2L75.9 188.9L77.9 179.2L78.2 169.7L77.2 164.4L77.2 158.0L78.2 150.4L81.2 135.2L81.5 131.5L81.4 121.6L80.2 107.1L79.1 100.6L78.3 99.0L77.0 94.3L77.2 79.5L77.9 77.2L79.0 69.8L80.0 68.8L80.4 69.4L80.8 72.6L81.4 73.6L84.1 85.0L84.1 99.4L85.3 104.6L86.1 106.7L86.9 112.0L86.8 115.7L85.4 118.8L83.5 125.5L83.7 127.6L84.6 127.8L85.4 127.1L87.3 122.8L88.2 123.1L88.5 124.1L87.6 128.4L85.1 130.9L84.1 132.4L84.4 133.7L85.4 134.0L90.5 130.8L92.2 129.0L93.6 125.9L93.9 123.8L93.8 118.9L92.8 113.9L92.8 104.6L93.8 99.4L93.9 90.7L93.3 83.0L92.6 79.1L92.6 69.5L91.5 61.7L90.1 55.5L89.0 52.5L86.5 48.6L83.2 45.6L81.9 44.9L75.7 42.8L70.0 38.4L65.9 33.9L66.1 32.5L69.0 28.9L69.7 27.1L71.5 24.6L72.5 21.8L72.6 20.4L71.5 19.0L71.6 17.1L71.2 14.6L71.5 9.1L71.2 8.3L69.5 6.5L68.8 5.1L67.4 4.1L64.7 3.3Z';
const mirror = (pts) => pts.map(([x, y]) => [120 - x, y]);
const poly = (pts) => `M${pts.map(([x, y]) => `${x} ${y}`).join('L')}Z`;
const R_ARM = [[0, 37], [40, 37], [40, 90], [38, 122], [37, 140], [0, 140]];
const R_LEG = [[37, 122], [60, 122], [60, 222], [0, 222], [0, 140], [37, 140]];
const MAN_ZONES = {
  Head: poly([[0, 0], [120, 0], [120, 37], [0, 37]]),
  Chest: poly([[40, 37], [80, 37], [80, 90], [40, 90]]),
  Abdomen: poly([[40, 90], [80, 90], [82, 122], [38, 122]]),
  'Right Arm': poly(R_ARM), 'Left Arm': poly(mirror(R_ARM)),
  'Right Leg': poly(R_LEG), 'Left Leg': poly(mirror(R_LEG)),
};
const MAN_CENTRES = { Head: [60, 19], Chest: [60, 64], Abdomen: [60, 106], 'Right Arm': [31, 98], 'Left Arm': [89, 98], 'Right Leg': [49, 172], 'Left Leg': [71, 172] };
// starting clothes: a torn tunic with ragged sleeves and hem, and cut-off breeches
const CLOTHES = {
  tunic: poly([[10, 41], [52, 41], [60, 50], [68, 41], [110, 41], [110, 62], [104, 68], [99, 62], [94, 69], [89, 63], [84, 67], [81, 64], [81, 92], [83, 114], [78, 121], [73, 114], [67, 122], [62, 115], [56, 122], [50, 114], [44, 121], [38, 114], [39, 92], [39, 64], [36, 67], [31, 63], [26, 69], [21, 62], [16, 68], [10, 62]]),
  breeches: poly([[37, 116], [83, 116], [83, 152], [78, 158], [74, 151], [70, 159], [66, 152], [62, 157], [60, 150], [58, 157], [54, 152], [50, 159], [46, 151], [42, 158], [37, 152]]),
  seams: 'M47 58l6 3M71 78l6-2M50 98l-5 4M67 134l6 2M44 140l5-3',
};
// armour, by the part of the body it covers
const ARMOUR = {
  Torso: [poly([[41, 42], [79, 42], [83, 52], [81, 72], [79, 90], [80, 108], [60, 113], [40, 108], [41, 90], [39, 72], [37, 52]]), 'M60 44V110M44 60c10 4 22 4 32 0M44 76c10 3 22 3 32 0M43 94c11 3 23 3 34 0'],
  Head: ['M46 25C46 9 52 3 60 3S74 9 74 25Z', 'M60 5V25M47 18h26'],
  Arms: [`${poly([[20, 86], [38, 86], [37, 121], [20, 121]])}${poly(mirror([[20, 86], [38, 86], [37, 121], [20, 121]]))}`, 'M21 98h16M21 110h16M83 98h16M83 110h16'],
  Legs: [`${poly([[38, 166], [59.4, 166], [59.4, 210], [38, 210]])}${poly(mirror([[38, 166], [59.4, 166], [59.4, 210], [38, 210]]))}`, 'M39 180h20M39 195h20M61 180h20M61 195h20'],
  Shield: ['M97 92h22v23c0 10-11 17-11 17S97 125 97 115Z', 'M108 95v34M99 107h18'],
};
const PART_LOCS = { Torso: ['Chest', 'Abdomen'], Head: ['Head'], Arms: ['Left Arm', 'Right Arm'], Legs: ['Left Leg', 'Right Leg'], Shield: [] };
// what the survivor wears: each worn piece of armour with a summary of what it does, and their starting clothes
const weaponKind = (n = '') => (/pick/i.test(n) ? 'pick' : /dagger|knife|stiletto/i.test(n) ? 'dagger' : /axe|cleaver|hatchet/i.test(n) ? 'axe' : /sword|saber|rapier|blade|scimitar/i.test(n) ? 'sword'
  : /club|mace|hammer|maul|flail|morningstar|staff/i.test(n) ? 'club' : /spear|pike|halberd|glaive|bardiche|billhook|lance|fang/i.test(n) ? 'spear' : /fist|claw|knuckle|cestus|gauntlet|unarmed/i.test(n) ? null : 'sword');
export function heroGear(h) {
  if (!h) return { pieces: {}, clothes: false };
  const pieces = {};
  const worn = h.worn || {};
  for (const part of ['Torso', 'Arms', 'Legs', 'Head', 'Shield']) {
    const it = worn[part]; const a = it ? armourByName(it.base || it.name) : null;
    const prot = part === 'Shield' ? null : (h.armor?.[part] ?? 0);
    if (!it && !(prot > 0)) continue;
    const lines = [];
    if (part === 'Shield') lines.push(`Parry +${h.shield?.parry ?? a?.parry ?? 0}: you can parry with any weapon.`);
    else lines.push(`Protection ${prot} on the ${PART_LOCS[part].join(' and ').toLowerCase()}: taken off each blow that lands there.`);
    if (it?.die) lines.push(`Integrity D${it.die}${a?.integ ? ` (D${a.integ} at its best)` : ''}: 1-2 after a fight steps it down.`);
    if (a?.man) lines.push(`Maneuverability -${a.man}: Acrobatics, Dodge and Stealth.`);
    if (a?.per) lines.push(`Perception -${a.per}.`);
    if (h.armorDown?.[part]) lines.push(`Acid has eaten ${h.armorDown[part]} of its Armor until you repair it.`);
    for (const pr of it?.properties || []) lines.push(pr.t);
    for (const pw of it?.powers || []) lines.push(pw);
    if (it?.kind === 'magic' && !it.attuned) lines.push('Magic, but not attuned yet: it acts as an ordinary piece.');
    pieces[part] = { name: it?.name || (part === 'Torso' ? h.armorName || 'Armour' : `${part} armour`), lines };
  }
  const clothes = (h.misc || []).some((m) => /rag|cloth|tunic|robe|shirt|breeches|trousers|tatter/i.test(m)) || Object.keys(pieces).length === 0;
  const w = h.weapons?.[h.wield];
  const held = { weapon: w ? weaponKind(w.name) : null, weaponName: w?.name, weaponTip: w ? weaponInfo(h, w) : null, light: (h.vit?.light || 0) > 0 && !(h.rot >= 3) && !pieces.Shield ? (h.lightSource || 'torch') : null };
  return { held, pieces, clothes, clothesName: (h.misc || []).find((m) => /rag|cloth|tunic|robe|shirt|breeches|trousers|tatter/i.test(m)) || 'Tattered rags' };
}
// a weapon in the right hand (on your left) and a light in the left (on your right)
// drawn upright beside the arm (Simon: "they can be at the side of the arms"), so no hand needs to line up
const WEAPON_ART = {
  pick: [['haft', 'M14 148V76'], ['iron', 'M2 82C6 74 22 72 27 79L25.5 82C21 77 8 78 4.5 84Z'], ['iron', 'M12 76h4v8h-4z']],
  axe: [['haft', 'M14 148V78'], ['iron', 'M14 80C6 78 2 86 4 96C8 93 12 92 15 92Z']],
  sword: [['iron', 'M12.4 130L12.2 74L14 68L15.8 74L15.6 130Z'], ['haft', 'M8 131h12M14 131v14']],
  dagger: [['iron', 'M12.6 128L12.4 104L14 99L15.6 104L15.4 128Z'], ['haft', 'M10 129h8M14 129v9']],
  club: [['haft', 'M14 148V96'], ['iron', 'M14 98C8 97 7 86 10 82S19 80 19 88C19 94 17 97 14 98Z']],
  spear: [['haft', 'M14 160V64'], ['iron', 'M14 64L11.5 55L14 44L16.5 55Z']],
};
function Held({ held }) {
  if (!held) return null;
  const w = WEAPON_ART[held.weapon];
  return (
    <g className="held" aria-hidden="true">
      {w && <Tip as="g" className="hold" tip={held.weaponTip}><rect className="hitbox" x="0" y="40" width="28" height="122" />{w.map(([cls, d], i) => <path key={i} className={cls} d={d} />)}</Tip>}
      {held.light && <Tip as="g" className="hold" tip={lightInfo(held.light)}><rect className="hitbox" x="94" y="70" width="24" height="72" /></Tip>}
      {held.light === 'torch' && <g className="light torch"><path className="haft" d="M106 138V98" /><path className="wrap" d="M104 98h4v6h-4z" /><ellipse className="glow" cx="106" cy="88" rx="12" ry="14" /><path className="flame" d="M106 76c3.4 4.6 5.2 8.2 4.6 12.2-.5 3.5-2.7 5.8-4.6 5.8s-4.1-2.3-4.6-5.8c-.4-3.8 2.3-6.2 3-9.2.9 1.8 1.6 3 2.4 3.8z" /></g>}
      {held.light === 'candle' && <g className="light candle"><path className="iron" d="M100 126h12v3h-12z" /><rect className="wax" x="103.5" y="110" width="5" height="16" rx="1" /><ellipse className="glow" cx="106" cy="104" rx="9" ry="10" /><path className="flame" d="M106 97c1.9 2.6 2.8 4.7 2.4 6.6-.3 1.5-1.3 2.4-2.4 2.4s-2.1-.9-2.4-2.4c-.4-1.9.5-4 2.4-6.6z" /></g>}
      {(held.light === 'oil' || held.light === 'lamp') && <g className="light lamp"><path className="haft" d="M106 98v-6" /><ellipse className="glow" cx="106" cy="108" rx="11" ry="12" /><path className="iron" d="M100 102h12l-1.4 14h-9.2zM102 99h8l-1-3h-6zM100 116h12v3h-12z" /><path className="flame" d="M106 104c1.5 2 2.3 3.6 1.9 5-.3 1.1-1 1.8-1.9 1.8s-1.6-.7-1.9-1.8c-.4-1.4.4-3 1.9-5z" /></g>}
    </g>
  );
}
function Mannequin({ armorOf, armor, wounds, highlight, label, className, gear, weakSpot }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const ranges = RANGES('Humanoid');
  const byLoc = {}; for (const w of wounds) { byLoc[w.loc] = byLoc[w.loc] || []; byLoc[w.loc].push(w); }
  const pieces = gear?.pieces || {};
  // a creature (no gear given) still shows its armour by location, as numbers on dark plates
  const plateParts = gear ? Object.keys(pieces) : ['Torso', 'Arms', 'Legs', 'Head'].filter((p) => PART_LOCS[p].some((l) => (armorOf ? armorOf(l) : armorAt(armor, l)) > 0));
  return (
    <svg className={`dbt-sil human ${className}`} viewBox="0 0 120 222" role="img" aria-label={label}>
      <defs><clipPath id={`m${id}`}><path d={MAN} /></clipPath></defs>
      <path className="skin" d={MAN} />
      <g clipPath={`url(#m${id})`}>
        {Object.entries(MAN_ZONES).map(([loc, d]) => {
          const a = armorOf ? armorOf(loc) : armorAt(armor, loc), ws = byLoc[loc] || [], dmg = ws.reduce((t, w) => t + w.dmg, 0); const weak = loc === weakSpot;
          const tip = { title: loc, badge: `D20 ${ranges[loc]}`, body: `${a ? `Armor ${a}: taken off any damage that lands here.` : 'No armour here.'}${weak ? ' The Weak Spot: a hit here is an automatic Critical Strike.' : ''}`, live: ws.length ? `${ws.length} hit${ws.length > 1 ? 's' : ''} here, ${dmg} damage${ws.some((w) => w.crit) ? ', including a critical' : ''}.` : null, page: 80 };
          return <Tip as="g" key={loc} tip={tip} className={`zone ${ws.length ? 'hurt' : ''} ${highlight === loc ? 'hl' : ''}`}><path className="hit" d={d} /></Tip>;
        })}
        {gear?.clothes && <g className="clothes" aria-hidden="true"><path d={CLOTHES.tunic} /><path d={CLOTHES.breeches} /><path className="seam" d={CLOTHES.seams} /></g>}
        {plateParts.filter((p) => p !== 'Shield').map((part) => {
          const g = pieces[part]; const [d, ln] = ARMOUR[part];
          const body = <><path d={d} /><path className="ln" d={ln} /></>;
          return g ? <Tip as="g" key={part} className="plate" tip={{ title: g.name, badge: part, body: g.lines.join(' '), page: 210 }}>{body}</Tip> : <g key={part} className="plate" aria-hidden="true">{body}</g>;
        })}
      </g>
      <path className="edge" d={MAN} />
      <Held held={gear?.held} />
      {pieces.Shield && <Tip as="g" className="plate shield" tip={{ title: pieces.Shield.name, badge: 'Shield', body: pieces.Shield.lines.join(' '), page: 210 }}><path d={ARMOUR.Shield[0]} /><path className="ln" d={ARMOUR.Shield[1]} /></Tip>}
      {Object.entries(MAN_CENTRES).map(([loc, [cx, cy]]) => { const a = armorOf ? armorOf(loc) : armorAt(armor, loc); return a > 0 ? <text key={`a${loc}`} x={cx} y={cy + 4} className="ar">{a}</text> : null; })}
      {Object.entries(byLoc).map(([loc, ws]) => MAN_CENTRES[loc] && ws.slice(-5).map((w, i) => { const [cx, cy] = MAN_CENTRES[loc]; const seed = [...loc].reduce((t, ch) => t + ch.charCodeAt(0), 0) + i * 31 + (w.dmg || 1) * 7; const ox = ((seed % 9) - 4) * 1.4, oy = ((seed % 7) - 3) * 1.6; return <Blood key={`${loc}${i}`} x={cx + ox} y={cy + oy} size={Math.min(10, 3.5 + (w.dmg || 1) * 1.1)} seed={seed} crit={w.crit} />; }))}
      {highlight && MAN_ZONES[highlight] && <path className="hlring" d={MAN_ZONES[highlight]} clipPath={`url(#m${id})`} />}
      {weakSpot && MAN_CENTRES[weakSpot] && <circle className="weak" cx={MAN_CENTRES[weakSpot][0] + 8} cy={MAN_CENTRES[weakSpot][1] - 10} r="3.5" />}
    </svg>
  );
}

// `armorOf(loc)` overrides the armour lookup (a creature's stat block); `weak` names its Weak Spot (none: no Weak Spot);
// `hero` dresses the figure in what that survivor wears
export function Silhouette({ anatomy = 'Humanoid', armor = {}, armorOf = null, weak: weakSpot = 'Head', wounds = [], highlight = null, label = 'Your body', className = '', hero = null }) {
  if (anatomy === 'Humanoid') return <Mannequin armorOf={armorOf} armor={armor} wounds={wounds} highlight={highlight} label={label} className={className} gear={hero ? heroGear(hero) : null} weakSpot={weakSpot} />;
  const body = BODIES[anatomy] || BODIES.none; const kind = BODIES[anatomy] ? anatomy : 'none';
  const ranges = HIT_TABLES[anatomy] ? RANGES(anatomy) : { Body: '1-20' };
  const byLoc = {}; for (const w of wounds) { byLoc[w.loc] = byLoc[w.loc] || []; byLoc[w.loc].push(w); }
  return (
    <svg className={`dbt-sil ${className} body-${kind.replace(' ', '-').toLowerCase()}`} viewBox={body.box} role="img" aria-label={label}>
      {kind === 'Quadruped' && <path className="tail" d="M42 70C22 74 14 92 4 88" />}
      {Object.entries(body.z).map(([loc, d]) => {
        const a = armorOf ? armorOf(loc) : armorAt(armor, loc), ws = byLoc[loc] || [], dmg = ws.reduce((s, w) => s + w.dmg, 0);
        const weak = kind !== 'none' && loc === weakSpot; const [cx0, cy0] = body.c[loc]; const sx = body.shift?.[loc] || 0;
        const tip = { title: loc, badge: `D20 ${ranges[loc] || '-'}`, body: `${a ? `Armor ${a}: taken off any damage that lands here.` : 'No armour here.'}${weak ? ' The Weak Spot: a hit here is an automatic Critical Strike.' : ''}`, live: ws.length ? `${ws.length} hit${ws.length > 1 ? 's' : ''} here, ${dmg} damage${ws.some((w) => w.crit) ? ', including a critical' : ''}.` : null, page: 80 };
        return (
          <Tip as="g" key={loc} tip={tip} className={`zone ${a ? 'armored' : ''} ${ws.length ? 'hurt' : ''} ${highlight === loc ? 'hl' : ''}`}>
            <path d={d} transform={sx ? `translate(${sx} 0)` : undefined} />
            {a > 0 && kind === 'Humanoid' && PIECES[loc] && <g className="piece" aria-hidden="true"><path d={PIECES[loc][0]} />{PIECES[loc][1] && <path className="ln" d={PIECES[loc][1]} />}</g>}
            {a > 0 && <text x={cx0} y={cy0 + 4} className="ar">{a}</text>}
            {ws.slice(-5).map((w, i) => { const seed = [...loc].reduce((s2, ch) => s2 + ch.charCodeAt(0), 0) + i * 31 + (w.dmg || 1) * 7; const ox = ((seed % 9) - 4) * 1.4, oy = ((seed % 7) - 3) * 1.6; return <Blood key={i} x={cx0 + ox} y={cy0 + oy} size={Math.min(10, 3.5 + (w.dmg || 1) * 1.1)} seed={seed} crit={w.crit} />; })}
            {weak && <circle className="weak" cx={cx0 + 8} cy={cy0 - 10} r="3.5" />}
          </Tip>
        );
      })}
    </svg>
  );
}

// ---- creature portraits, engraved on a dark ground ----
function Frame({ children, label }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
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
// a picture you gave it, one in the Bestiary folder, or, for the ten Overseers, the book's own portrait
const sources = (name) => [`/api/dnd/beta/creature-art/${slugOf(name)}${versions[name] ? `?v=${versions[name]}` : ''}`, ...['jpg', 'png', 'webp'].map((x) => `/api/dnd/asset?path=${encodeURIComponent(`Ker Nathalas/Bestiary/${name}.${x}`)}`),
  ...(OVERSEERS.includes(name) ? [overseerImg(name)] : [])];
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
