// Run planner: the header - a route logo and the name, in the heading font, as Homebrew's
import React from 'react';

// a route winding up a green hill to a marker
export function RouteLogo({ size = 40 }) {
  const id = React.useId().replace(/:/g, '');
  return (
    // role="img": a drawing - the page-wide icon rule (index.css) would otherwise empty its fills
    <svg viewBox="0 0 96 96" width={size} height={size} role="img" aria-hidden="true" className="brand-logo">
      <defs><linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8fd16a" /><stop offset="1" stopColor="#2f8a52" /></linearGradient></defs>
      <rect width="96" height="96" fill={`url(#${id}g)`} />
      <path d="M0 72 C18 60 30 66 46 56 C62 46 74 50 96 38 V96 H0 Z" fill="#256f42" opacity=".55" />
      <path d="M14 80 C30 70 26 56 42 52 C58 48 60 34 72 30" fill="none" stroke="#fdf8f3" strokeWidth="6" strokeLinecap="round" strokeDasharray="1 11" />
      <circle cx="74" cy="26" r="9" fill="#fdf8f3" />
      <circle cx="74" cy="26" r="4" fill="#2f8a52" />
    </svg>
  );
}

export function RunBrand() {
  return (
    <div className="brand">
      <RouteLogo size={42} />
      <span>Run planner</span>
    </div>
  );
}
