// Homebrew (beta): the Homebrew header at the top of every page - the Rising bubbles logo and the name, in Rustic
// Delight like every heading (hbb.css)
import React from 'react';

// Rising bubbles (chosen 22 Oct): a head of foam and three bubbles rising through amber
export function BubblesLogo({ size = 40 }) {
  const id = React.useId().replace(/:/g, '');
  return (
    // role="img": a drawing - the page-wide icon rule (index.css) would otherwise empty its fills
    <svg viewBox="0 0 96 96" width={size} height={size} role="img" aria-hidden="true" className="brand-logo">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f7c25c" /><stop offset="1" stopColor="#d9821f" /></linearGradient>
      </defs>
      <rect width="96" height="96" fill={`url(#${id}g)`} />
      <path d="M0 30 C12 25 22 34 34 29 C46 24 54 33 66 28 C78 23 86 31 96 27 V0 H0 Z" fill="#fbefd9" />
      <path d="M0 30 C12 25 22 34 34 29 C46 24 54 33 66 28 C78 23 86 31 96 27" fill="none" stroke="#fff" strokeWidth="1.5" opacity=".7" />
      <circle cx="40" cy="78" r="9" fill="none" stroke="#fbefd9" strokeWidth="3" />
      <circle cx="57" cy="56" r="6.5" fill="none" stroke="#fbefd9" strokeWidth="3" />
      <circle cx="45" cy="40" r="4.2" fill="none" stroke="#fbefd9" strokeWidth="2.6" />
      <path d="M36 74 A4.5 4.5 0 0 1 40 71" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Brand({ small = false }) {
  return (
    <div className={`brand ${small ? 'small' : ''}`}>
      <BubblesLogo size={small ? 30 : 42} />
      <span>Homebrew</span>
    </div>
  );
}
