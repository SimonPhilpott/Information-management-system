// The scroll's paper, drawn after the picture Simon chose (29 Oct 2026): cream parchment torn ragged at the sides,
// toasted a mottled sepia towards its edges with a thin burnt rim, faint creases and specks; and at top and bottom the
// rolled paper, with torn and curled ends, fine gilt lines, gold filigree in the middle and a red ribbon (with a wax
// seal on the top roll). Everything is SVG drawn at the element's real size, so the tears and the mottling never
// stretch however tall the scroll grows.
import React, { useId } from 'react';

export function Parchment() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg className="dbt-parchment" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`pg${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3e3bf" /><stop offset=".5" stopColor="#f6e9cc" /><stop offset="1" stopColor="#efdcb2" />
        </linearGradient>
        <filter id={`pf${id}`} x="-3%" y="-3%" width="106%" height="106%" colorInterpolationFilters="sRGB">
          {/* the torn outline: the sheet's edges pushed about by low, irregular noise */}
          <feTurbulence type="fractalNoise" baseFrequency="0.013 0.045" numOctaves="4" seed="11" result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="26" xChannelSelector="R" yChannelSelector="G" result="torn" />
          {/* creases: a broad, soft lighting of slow noise, laid lightly over the paper */}
          <feTurbulence type="fractalNoise" baseFrequency="0.006 0.012" numOctaves="3" seed="4" result="crease" />
          <feDiffuseLighting in="crease" surfaceScale="2.2" lightingColor="#fff6e2" result="lit"><feDistantLight azimuth="235" elevation="58" /></feDiffuseLighting>
          <feComposite in="lit" in2="torn" operator="arithmetic" k1="0.85" k2="0" k3="0.15" k4="0" result="paper" />
          {/* the toasted band: what lies near the torn edge, mottled by finer noise */}
          <feMorphology in="torn" operator="erode" radius="20" result="inner" />
          <feGaussianBlur in="inner" stdDeviation="22" result="innerSoft" />
          <feComposite in="torn" in2="innerSoft" operator="out" result="band" />
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="4" seed="21" result="mottle" />
          <feColorMatrix in="mottle" type="matrix" values="0 0 0 0 .66  0 0 0 0 .40  0 0 0 0 .14  1.9 0 0 0 -.62" result="sepia" />
          <feComposite in="sepia" in2="band" operator="in" result="toast" />
          <feFlood floodColor="#d8a462" floodOpacity=".42" /><feComposite in2="band" operator="in" result="tan" />
          {/* a thin burnt rim right at the tear */}
          <feMorphology in="torn" operator="erode" radius="2" result="rimIn" />
          <feComposite in="torn" in2="rimIn" operator="out" result="rimBand" />
          <feFlood floodColor="#7e4615" floodOpacity=".75" /><feComposite in2="rimBand" operator="in" result="rim" />
          {/* specks: sparse dots of age */}
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="3" result="fine" />
          <feColorMatrix in="fine" type="matrix" values="0 0 0 0 .42  0 0 0 0 .26  0 0 0 0 .1  -9 0 0 0 4.2" result="dots" />
          <feComposite in="dots" in2="torn" operator="in" result="speck" />
          <feMerge><feMergeNode in="paper" /><feMergeNode in="tan" /><feMergeNode in="toast" /><feMergeNode in="speck" /><feMergeNode in="rim" /></feMerge>
        </filter>
        <filter id={`ps${id}`} x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>
      <rect className="shadow" style={{ x: 24, y: 16, width: 'calc(100% - 48px)', height: 'calc(100% - 28px)' }} filter={`url(#ps${id})`} />
      <rect style={{ x: 18, y: 8, width: 'calc(100% - 36px)', height: 'calc(100% - 16px)' }} fill={`url(#pg${id})`} filter={`url(#pf${id})`} />
    </svg>
  );
}

// gold filigree: curls either side of a bud, after the gilt work on the picture's rolls
function Filigree() {
  return (
    <svg className="fil" viewBox="0 0 140 34" aria-hidden="true">
      <g fill="none" stroke="#b08a36" strokeWidth="1.3" strokeLinecap="round">
        <path d="M70 7c-3.5 5-3.5 15 0 20 3.5-5 3.5-15 0-20z" fill="#cfa955" fillOpacity=".35" />
        <path d="M63 17c-7-8-17-9-23-3.5-4.5 4.5-1 11 4.5 10 4.5-1 4.5-7 1-8M77 17c7-8 17-9 23-3.5 4.5 4.5 1 11-4.5 10-4.5-1-4.5-7-1-8" />
        <path d="M63 17c-10 2.5-21 10-35 7-7-2-9-9-3.5-11.5M77 17c10 2.5 21 10 35 7 7-2 9-9 3.5-11.5" />
        <path d="M46 10c-7-6-16-5-19.5 0M94 10c7-6 16-5 19.5 0M35 26c-6 2.5-11.5 1.5-14-3.5M105 26c6 2.5 11.5 1.5 14-3.5" />
        <circle cx="70" cy="4" r="1.3" fill="#b08a36" /><circle cx="70" cy="30" r="1.3" fill="#b08a36" />
      </g>
    </svg>
  );
}
// a torn, curled end of the rolled paper
function RollEnd({ side }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg className={`end ${side}`} viewBox="0 0 48 56" aria-hidden="true">
      <defs>
        <linearGradient id={`eg${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#dcb57a" /><stop offset=".35" stopColor="#f2dcae" /><stop offset=".7" stopColor="#d9ac6c" /><stop offset="1" stopColor="#a8723a" /></linearGradient>
        <radialGradient id={`er${id}`} cx="0" cy=".5" r="1"><stop offset="0" stopColor="#a5652a" stopOpacity=".85" /><stop offset=".6" stopColor="#c88a45" stopOpacity=".25" /><stop offset="1" stopColor="#c88a45" stopOpacity="0" /></radialGradient>
        <filter id={`ef${id}`} x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="5" /><feDisplacementMap in="SourceGraphic" scale="7" xChannelSelector="R" yChannelSelector="G" /></filter>
      </defs>
      <g filter={`url(#ef${id})`}>
        <path d="M46 8C34 4 18 2 8 7C2 12 1 22 4 30C1 36 3 46 10 50C20 54 34 52 46 48Z" fill={`url(#eg${id})`} />
        <path d="M46 8C34 4 18 2 8 7C2 12 1 22 4 30C1 36 3 46 10 50C20 54 34 52 46 48Z" fill={`url(#er${id})`} />
        <path d="M12 12c-4 6-5 22 0 32M18 9c-3 8-3 30 1 38" fill="none" stroke="#9a6430" strokeOpacity=".45" strokeWidth="1.2" />
      </g>
    </svg>
  );
}
export function Roll({ which }) {
  // the rolled ends are cut from the scroll picture Simon chose (public/kn/scroll, cut by scripts in the session notes)
  return <div className={`dbt-scroll-rod ${which} img`} aria-hidden="true" />;
}
