import React, { useContext } from 'react';
import { DarkCtx } from './ui';
import { WINE_COLOURS, look, BEER_GLASS, NOT_A_PILE, PILE_TYPE_COLOUR, PILES } from './brewData';

// A demijohn showing the brew, always in the drink's own colour: piles of its main ingredients beside it while it's
// planned, bubbles rising to a froth while it ferments, sediment falling on to the lees while it clears, empty bottles
// standing ready once it's bottling, and full bottles once it's finished. Sizes are true to life: a 4.5 L demijohn
// is ~37 cm tall (108 units here), a 75 cl wine bottle ~30 cm, a 500 ml beer bottle ~24 cm.
// liquid: the drink's expected colour when known, else the wine colour or the category's
// pics: the main-ingredient pictures ([{ key, name }]) for the planning piles; ingredients: the fallback when there are none
// Beta: the bubbles follow how active the brew really is (activity: 'vigorous' | 'slowing' | 'still', from the
// gravity readings - see activityOf in logic.js), and all motion pauses when the vessel is off-screen.
// fillIn: the liquid rises to its level as the vessel first appears (cards loading into the shelf)
// The estimated colours are sometimes a stock colour name rather than a drink: ivory or lemon chiffon (reads as milk in
// the glass), light pink, or indigo for a berry wine. Drawn as a drink they're kept believable: never paler than a
// straw white or a rosé, never washed out, and blues and violets turned to the purple-red of a real berry wine.
function drinkable(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let l = (mx + mn) / 2, s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  let h = !d ? 0 : mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const before = [h, s, l];
  if (h >= 200 && h < 300 && s > 0.25) h = 325;              // blue-violet -> berry purple-red
  if (l > 0.72) { l = 0.72; s = Math.min(Math.max(s, 0.45), 0.65); if (h > 52 && h < 75) h = 50; } // too pale -> straw / rosé
  if (s < 0.3 && l > 0.25) s = 0.3;                         // greyed out -> a little colour
  if (before[0] === h && before[1] === s && before[2] === l) return hex;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), o = l - c / 2;
  const [R, G, B] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [R, G, B].map((v) => Math.round((v + o) * 255).toString(16).padStart(2, '0')).join('');
}

const ACTIVITY = { vigorous: { n: 10, pace: 1 }, slowing: { n: 4, pace: 1.9 }, still: { n: 0, pace: 1 } };
// tight: no blank margin to the right of or below the glass, so a card can set the drawing's gap from its edges exactly
export default function Vessel({ category, status, isRecipe, size = 96, isDark: darkProp, wine, liquid, pics = [], ingredients = [], fizz, activity = 'vigorous', fillIn = false, tight = false, exactColour = false }) {
  const ctxDark = useContext(DarkCtx);
  const isDark = darkProp ?? ctxDark;
  const id = React.useId().replace(/:/g, '');
  // a colour chosen by hand is drawn exactly as chosen; an estimated one is kept believable
  const colour = status === 'dumped' ? '#94a3b8' : (exactColour ? (x) => x : drinkable)(liquid || (WINE_COLOURS.find((w) => w.id === wine) || look(category)).liquid);
  const stage = isRecipe ? 'recipe' : status;
  const act = ACTIVITY[activity] || ACTIVITY.vigorous;
  const fermenting = stage === 'fermenting';
  const bubbling = fermenting && act.n > 0; // a ferment that has stopped is still and clear on top
  const clearing = stage === 'conditioning';
  const finished = stage === 'finished';
  const besides = ['planning', 'bottled', 'finished'].includes(stage); // things on the table beside it
  const vbW = besides ? 162 : 100; // the demijohn stays the same size; the picture just gets wider
  // empty while it's planned (the ingredients are still in piles beside it) and once finished (it's in the bottles);
  // full to the shoulder otherwise; a little left if dumped
  const fill = finished || stage === 'planning' ? 0 : stage === 'dumped' ? 0.15 : isRecipe ? 0.9 : 0.88;
  const top = 122 - fill * 84;
  // the airlock only while there's something in it; it stands 20 units above the glass, its stem pushed well into the bung - inside the drawing, except
  // on a tight one (cards), where it rises over the card's picture instead
  const airlock = fill > 0;
  const lift = airlock && !tight ? 20 : 0;
  const glass = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(46,43,39,0.35)';
  // a real demijohn: straight sides, a broad rounded shoulder, a short neck with a thick rim and two loop handles
  const body = 'M43.5 19 H56.5 V31 C70 33 86 39 86 57 V113 Q86 122 77 122 H23 Q14 122 14 113 V57 C14 39 30 33 43.5 31 Z';
  const bubbles = [[26, 114, 1.6, 0, 2.6, 1.2], [33, 104, 1.1, 1.3, 3.1, -1], [40, 117, 2, 0.6, 2.4, 0.8], [47, 96, 1.2, 2.1, 2.9, -0.8], [53, 110, 1.8, 0.9, 2.7, 1],
    [60, 100, 1.3, 1.8, 3.3, -1.2], [66, 116, 2.1, 0.3, 2.5, 0.9], [72, 106, 1.2, 2.5, 3, -0.7], [37, 90, 1, 1.6, 2.2, 0.6], [57, 92, 1.1, 0.1, 2.3, -0.6]];
  const specks = [[27, top + 6, 1.4, 0, 7], [35, top + 14, 1.1, 2.4, 8.5], [43, top + 4, 1.6, 4.1, 7.5], [50, top + 20, 1.2, 1.2, 9], [57, top + 9, 1.5, 5.6, 8],
    [64, top + 17, 1.1, 3.3, 7.2], [71, top + 7, 1.4, 6.4, 8.8], [31, top + 24, 1.2, 5, 6.8], [46, top + 28, 1.1, 7.1, 7.8], [68, top + 26, 1.3, 0.7, 9.4],
    [39, top + 11, 1, 3.8, 8.2], [61, top + 3, 1.2, 2, 7.6]];
  // planning: a pile of each main ingredient (its photo shaped into a heap), else heaps coloured by ingredient type
  const piles = stage !== 'planning' ? [] : pics?.length
    ? pics.slice(0, 3).map((p) => ({ key: p.key, name: p.name }))
    : [...new Map((ingredients || []).filter((i) => i?.name && !NOT_A_PILE.test(i.name)).map((i) => [i.type || 'other', i])).values()].slice(0, 3)
      .map((i) => ({ colour: PILE_TYPE_COLOUR[i.type] || PILE_TYPE_COLOUR.other, name: i.name }));
  // bottling / finished: three bottles of the right kind - 500 ml beer bottles in brown glass, 75 cl wine bottles
  const beerBottle = BEER_GLASS.includes(category);
  const bottleTint = beerBottle ? '#7a4a12' : category === 'red_wine' ? '#3f6b3a' : null;
  const bottlePath = (cx) => (beerBottle
    ? `M${cx - 10} 118 Q${cx - 10} 122 ${cx - 6} 122 H${cx + 6} Q${cx + 10} 122 ${cx + 10} 118 V86 C${cx + 10} 78 ${cx + 3} 76 ${cx + 3} 66 V53 H${cx - 3} V66 C${cx - 3} 76 ${cx - 10} 78 ${cx - 10} 86 Z`
    : `M${cx - 11} 118 Q${cx - 11} 122 ${cx - 7} 122 H${cx + 7} Q${cx + 11} 122 ${cx + 11} 118 V72 C${cx + 11} 62 ${cx + 3.5} 60 ${cx + 3.5} 52 V37 H${cx - 3.5} V52 C${cx - 3.5} 60 ${cx - 11} 62 ${cx - 11} 72 Z`);
  const bottleTop = beerBottle ? 53 : 37;
  // a full bottle is filled to the base of the neck, with clear glass above it, as a real one is
  const fillTop = beerBottle ? 64 : 54;
  const bottles = stage === 'bottled' || finished ? [100, 122, 144] : [];
  return (
    // role="img": a drawing, not an outline icon - the page-wide icon rule (index.css) would otherwise empty its fills
    // overflow visible: on a tight drawing the airlock stands above its top
    // the glass ends at x 87.25 (the demijohn) or 155.6 (the last bottle), and its foot shadow at y 124.1
    <svg viewBox={`0 ${-lift} ${tight ? (vbW > 100 ? 156 : 88) : vbW} ${(tight ? 124.5 : 130) + lift}`} width={size * (tight ? (vbW > 100 ? 156 : 88) : vbW) / 100} height={size * ((tight ? 124.5 : 130) + lift) / 100}
      role="img" aria-hidden="true" className="shrink-0 drop-shadow-sm" style={{ overflow: 'visible' }}>
      <defs>
        <clipPath id={`c${id}`}><path d={body} /></clipPath>
        <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={colour} stopOpacity="0.95" />
          <stop offset="1" stopColor={colour} stopOpacity="1" />
        </linearGradient>
        {/* round glass: shaded at the sides, lit just left of centre */}
        <linearGradient id={`r${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.32" />
          <stop offset="0.3" stopColor="#fff" stopOpacity="0.18" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.38" />
        </linearGradient>
        <linearGradient id={`e${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={isDark ? '#fff' : '#2E2B27'} stopOpacity="0.1" />
          <stop offset="0.3" stopColor="#fff" stopOpacity={isDark ? 0.08 : 0.5} />
          <stop offset="1" stopColor={isDark ? '#fff' : '#2E2B27'} stopOpacity="0.14" />
        </linearGradient>
        {/* the label turning away round the side of the glass */}
        <linearGradient id={`w${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.04" />
          <stop offset="0.35" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.2" />
        </linearGradient>
        {/* a heap: lit on top, shaded round its foot */}
        <linearGradient id={`p${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.18" />
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.3" />
        </linearGradient>
        {piles.map((p, i) => p.key && (
          <pattern key={i} id={`i${id}${i}`} patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox" width="1" height="1">
            <image href={`/api/homebrew/picture/${p.key}`} width="1" height="1" preserveAspectRatio="xMidYMid slice" />
          </pattern>
        ))}
        {bottles.map((cx, i) => <clipPath key={i} id={`b${id}${i}`}><path d={bottlePath(cx)} /></clipPath>)}
      </defs>

      {/* planning: piles of the main ingredients on the table, the biggest at the back */}
      {piles.map((p, i) => {
        const [x, w, h] = PILES[i];
        const d = `M${x} 122 C${x + w * 0.15} ${122 - h * 0.9} ${x + w * 0.35} ${122 - h * 1.05} ${x + w / 2} ${122 - h} C${x + w * 0.65} ${122 - h * 1.05} ${x + w * 0.85} ${122 - h * 0.9} ${x + w} 122 Z`;
        return (
          <g key={i}>
            <title>{p.name}</title>
            <ellipse cx={x + w / 2} cy="122.5" rx={w / 2 + 1} ry="1.6" fill="#000" opacity="0.22" />
            <path d={d} fill={p.key ? `url(#i${id}${i})` : p.colour} />
            <path d={d} fill={`url(#p${id})`} stroke={glass} strokeWidth="1.2" strokeLinejoin="round" />
            {!p.key && [0.3, 0.5, 0.7, 0.42, 0.6].map((f, j) => <circle key={j} cx={x + w * f} cy={122 - h * (j < 3 ? 0.35 : 0.65)} r="0.9" fill="#fff" opacity="0.35" />)}
          </g>
        );
      })}

      <g clipPath={`url(#c${id})`}>
        <rect x="0" y="0" width="100" height="130" fill={`url(#e${id})`} />
        {fill > 0 && (
          <g className={fillIn ? 'hbb-fillin' : undefined}>
            <rect x="0" y={top} width="100" height="130" fill={`url(#g${id})`} />
            <rect x="0" y={top} width="100" height="130" fill={`url(#r${id})`} />
            <rect x="0" y={top} width="100" height="2.5" fill="#fff" opacity={bubbling ? 0.5 : 0.25} />
          </g>
        )}
        {bubbling && bubbles.slice(0, act.n).map(([cx, cy, r, delay, dur, sway], i) => (
          <circle key={i} className="hbb-bubble" cx={cx} cy={cy} r={r} fill="#fff" stroke="#fff" strokeOpacity="0.9" strokeWidth="0.4" fillOpacity="0.55"
            style={{ '--rise': `${top + 2 - cy}px`, '--sway': `${sway}px`, animationDelay: `${delay * act.pace}s`, animationDuration: `${dur * act.pace}s` }} />
        ))}
        {/* a thin froth on the surface while it ferments hard */}
        {bubbling && activity === 'vigorous' && (
          <g className="hbb-foam">
            <rect x="0" y={top - 1.6} width="100" height="3.2" fill="#fff" opacity="0.6" />
            {Array.from({ length: 16 }, (_, i) => <circle key={i} cx={16 + i * 4.4} cy={top - 1.2 + (i % 2) * 0.6} r={1.3 + (i % 3) * 0.45} fill="#fff" opacity="0.88" />)}
          </g>
        )}
        {fermenting && <path d="M10 122 V119.5 Q50 117 90 119.5 V122 Z" fill="#4a3522" opacity="0.45" />}
        {/* clearing: sediment falling from the top half of the liquid on to a thick layer of lees */}
        {clearing && specks.map(([cx, cy, r, delay, dur], i) => (
          <circle key={i} className="hbb-speck" cx={cx} cy={cy} r={r} fill="#3d2b1a" stroke="#f5e6c8" strokeWidth="0.3" strokeOpacity="0.5" style={{ '--fall': `${115 - cy}px`, animationDelay: `${delay}s`, animationDuration: `${dur}s` }} />
        ))}
        {clearing && (
          <g>
            <path d="M10 122 V115.5 C26 111.5 40 110.5 50 110.5 C60 110.5 74 111.5 90 115.5 V122 Z" fill="#4a3522" opacity="0.92" />
            <path d="M10 116 C26 112 40 111 50 111 C60 111 74 112 90 116" stroke="#c9a978" strokeWidth="0.8" fill="none" opacity="0.7" />
            {[[24, 117], [31, 115], [38, 118.5], [45, 114], [52, 117.5], [59, 114.5], [66, 118], [73, 116], [80, 118.5], [34, 120], [56, 120.5], [70, 120]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="0.8" fill="#c9a978" opacity="0.55" />
            ))}
          </g>
        )}
        {(stage === 'planning' || stage === 'bottled') && <g transform="skewX(-18)"><rect className="hbb-glint" x="-20" y="0" width="9" height="130" fill="#fff" opacity="0.28" /></g>}
        {/* light caught on the round glass: the shoulder, a long streak down the left, a faint one on the right, the neck
            and the thick base */}
        <path d="M20 62 C21 50 28 43 39 39" stroke="#fff" strokeWidth="3" fill="none" opacity="0.4" strokeLinecap="round" />
        <path d="M20.5 70 V108" stroke="#fff" strokeWidth="3.2" fill="none" opacity="0.3" strokeLinecap="round" />
        <path d="M25.5 72 V100" stroke="#fff" strokeWidth="1" fill="none" opacity="0.25" strokeLinecap="round" />
        <path d="M80 66 V110" stroke="#fff" strokeWidth="1.6" fill="none" opacity="0.16" strokeLinecap="round" />
        <path d="M46.5 21 V30" stroke="#fff" strokeWidth="1.6" fill="none" opacity="0.35" strokeLinecap="round" />
        <path d="M19 118.5 Q50 114.5 81 118.5" stroke="#fff" strokeWidth="1.1" fill="none" opacity="0.3" />
      </g>
      <path d={body} fill="none" stroke={glass} strokeWidth="2.5" strokeLinejoin="round" />
      {/* the two glass loop handles at the neck */}
      <path d="M43.5 21.5 C35 16.5 27.5 20 27.5 26.5 C27.5 33 35 36.5 43 32.5" fill="none" stroke={glass} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M56.5 21.5 C65 16.5 72.5 20 72.5 26.5 C72.5 33 65 36.5 57 32.5" fill="none" stroke={glass} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M30 25 C31 21.5 35 19.5 39 20.5" fill="none" stroke="#fff" strokeWidth="1.1" opacity="0.5" strokeLinecap="round" />
      <path d="M61 20.5 C65 19.5 69 21.5 70 25" fill="none" stroke="#fff" strokeWidth="1.1" opacity="0.35" strokeLinecap="round" />
      {/* the airlock in its bung, the bung pushed into the thick rounded rim: a glass S-bubbler - a stem into the bung, a
          long loop up the left, three bulbs down, a U at the bottom, three bulbs up, a ball and a red cap on top - with
          water sitting in the bulbs and, while it ferments, gas bubbling through. It stands above the drawing's top */}
      {airlock && <g transform="translate(0 10)">
        <path d="M50 13 V-1.5 M50 -1.5 H45.8 Q44 -1.5 44 -3.3 V-20 Q44 -22 46 -22 Q47.6 -22 47.6 -20 V-18.4 M47.6 -4.4 Q47.6 -2.6 50 -2.6 Q52.4 -2.6 52.4 -4.4 M52.4 -18.4 V-19.6 Q52.4 -21 51 -21.4"
          fill="none" stroke={glass} strokeWidth="1.2" strokeLinecap="round" />
        {[-16.2, -11.4, -6.6].map((y) => [47.6, 52.4].map((x) => (
          <circle key={`${x}${y}`} cx={x} cy={y} r="2.3" fill="#fff" fillOpacity="0.18" stroke={glass} strokeWidth="0.9" />
        )))}
        {/* the water: the lower bulbs, a little higher on one side while gas pushes through */}
        <path d="M45.5 -6.6 A2.1 2.1 0 0 0 49.7 -6.6 Z M50.3 -9.4 A2.1 2.1 0 0 0 54.5 -9.4 V-6.6 A2.1 2.1 0 0 1 50.3 -6.6 Z" fill={colour} opacity="0.4" />
        <circle cx="50.6" cy="-23.4" r="2.6" fill="#fff" fillOpacity="0.18" stroke={glass} strokeWidth="0.9" />
        <rect x="48.3" y="-29.6" width="4.6" height="4.2" rx="0.9" fill="#8e1c22" />
        <rect x="49" y="-29" width="1.2" height="3" rx="0.6" fill="#fff" opacity="0.3" />
        <path d="M46.6 -17.5 V-14.5" stroke="#fff" strokeWidth="0.6" opacity="0.6" strokeLinecap="round" />
      </g>}
      {bubbling && <circle className="hbb-airlock" cx="52.4" cy="2.5" r="1.3" fill="#fff" fillOpacity="0.8" style={{ animationDuration: `${2.2 * act.pace * (activity === 'slowing' ? 2 : 1)}s` }} />}
      <path d="M44 11 H56 L55 19.5 H45 Z" fill="#a0703c" />
      <path d="M45 11.8 H48 L47.6 18.8 H45.8 Z" fill="#fff" opacity="0.18" />
      <rect x="41.5" y="16.5" width="17" height="5" rx="2.5" fill={`url(#e${id})`} stroke={glass} strokeWidth="2" />
      {/* the label, wrapped round the glass: its edges and lines curve with the body, and it shades off to the right
          where it turns away round the side */}
      <g transform="translate(61 84)">
        <path d="M0 0.4 Q10.5 2.6 22 0.2 L21.3 27.4 Q10.5 30.4 0 28.2 Z" fill="#fff" stroke="#d6b77a" strokeLinejoin="round" />
        <path d="M0 0.4 Q10.5 2.6 22 0.2 L21.3 27.4 Q10.5 30.4 0 28.2 Z" fill={`url(#w${id})`} />
        <path d="M4.5 8.6 Q10.5 9.9 16.5 8.8 M4.5 14.6 Q10.5 15.9 16.5 14.8 M4.5 20.6 Q8.5 21.6 12.5 21.1" stroke="#b08b4f" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </g>

      {/* bottling: empty bottles standing ready; finished: the same bottles full, capped and labelled */}
      {bottles.map((cx, i) => (
        <g key={i}>
          <ellipse cx={cx} cy="122.5" rx={beerBottle ? 11 : 12} ry="1.6" fill="#000" opacity="0.22" />
          <g clipPath={`url(#b${id}${i})`}>
            <rect x={cx - 12} y="30" width="24" height="95" fill={`url(#e${id})`} />
            {bottleTint && <rect x={cx - 12} y="30" width="24" height="95" fill={bottleTint} opacity={finished ? 0.25 : 0.32} />}
            {finished && <rect x={cx - 12} y={fillTop} width="24" height="95" fill={colour} />}
            {finished && <rect x={cx - 12} y={fillTop} width="24" height="95" fill={`url(#r${id})`} />}
            {finished && <rect x={cx - 12} y={fillTop} width="24" height="0.8" fill="#fff" opacity="0.35" />}
            {finished && fizz === 'sparkling' && [[-4, 116, 0], [1, 110, 0.9], [5, 118, 1.7], [-1, 104, 2.4]].map(([dx, cy, d], j) => (
              <circle key={j} className="hbb-bubble" cx={cx + dx} cy={cy} r="0.7" fill="#fff" fillOpacity="0.7" style={{ '--rise': `${fillTop + 2 - cy}px`, '--sway': '0.4px', animationDelay: `${d + i * 0.5}s`, animationDuration: '3.4s' }} />
            ))}
            {!finished && <g transform="skewX(-18)"><rect className="hbb-glint" x={cx - 30} y="30" width="5" height="95" fill="#fff" opacity="0.45" style={{ animationDelay: `${0.25 * i}s` }} /></g>}
            <rect x={cx - 6} y="66" width="2.4" height="50" rx="1.2" fill="#fff" opacity="0.4" />
          </g>
          <path d={bottlePath(cx)} fill="none" stroke={glass} strokeWidth="1.2" />
          {finished && (beerBottle
            ? <rect x={cx - 3.8} y={bottleTop - 2.5} width="7.6" height="3" rx="0.8" fill="#c9a227" />
            : <rect x={cx - 4} y={bottleTop - 1} width="8" height="9" rx="1" fill="#7a1f2b" />)}
          {finished && <g transform={`translate(${cx - (beerBottle ? 7 : 8)} ${beerBottle ? 92 : 84})`}><rect width={beerBottle ? 14 : 16} height={beerBottle ? 14 : 16} rx="1.5" fill="#fff" stroke="#d6b77a" strokeWidth="0.8" /><path d={`M3 5 H${beerBottle ? 11 : 13} M3 9 H${beerBottle ? 9 : 11}`} stroke="#b08b4f" strokeWidth="1.1" /></g>}
        </g>
      ))}
      {finished && [[80, 22], [20, 30], [150, 40]].map(([x, y], i) => (
        <path key={i} className="hbb-star" d={`M${x} ${y - 5} L${x + 1.5} ${y - 1.5} L${x + 5} ${y} L${x + 1.5} ${y + 1.5} L${x} ${y + 5} L${x - 1.5} ${y + 1.5} L${x - 5} ${y} L${x - 1.5} ${y - 1.5} Z`} fill="#fbbf24" style={{ animationDelay: `${i * 0.6}s` }} />
      ))}
    </svg>
  );
}
