// Small shared pieces of the beta's tome look: framed panels, ornaments, dice chips, sheets, switches and bars.
import React, { useEffect, useRef } from 'react';
import Ico from './Ico';
import { Tip } from './Tip';

// a gilt-framed panel with corner flourishes; `plate` is the engraved title tab at the top, as on the character sheet
export function Panel({ plate, icon, className = '', children, aside, id }) {
  return (
    <section className={`dbt-panel ${className}`} id={id} aria-label={typeof plate === 'string' ? plate : undefined}>
      <i className="cn tl" /><i className="cn tr" /><i className="cn bl" /><i className="cn br" />
      {plate && <header className="dbt-plate">{icon && <Ico n={icon} size={16} />}<h3>{plate}</h3>{aside}</header>}
      {children}
    </section>
  );
}

export function Orn({ className = '' }) {
  return (
    <svg className={`dbt-orn ${className}`} viewBox="0 0 240 16" aria-hidden="true">
      <path d="M0 8h96M144 8h96" />
      <path d="M100 8c6-6 14-6 20 0-6 6-14 6-20 0zM120 8c6-6 14-6 20 0-6 6-14 6-20 0z" className="f" />
      <circle cx="120" cy="8" r="2.4" className="d" /><circle cx="92" cy="8" r="1.4" className="d" /><circle cx="148" cy="8" r="1.4" className="d" />
    </svg>
  );
}

// a die-shaped chip for a rolled number
const SHAPES = { d4: 'M12 3l9 16H3z', d6: 'M5 5h14v14H5z', d8: 'M12 2l9 10-9 10-9-10z', d10: 'M12 2l8 8-8 12-8-12z', d12: 'M12 2l8 5.5-3 9.5H7L4 7.5z', d20: 'M12 2l9 5v10l-9 5-9-5V7z', d100: 'M12 2l8 8-8 12-8-12z' };
export function DieChip({ label, value, die, tone = '' }) {
  const d = die || (/d\s?(\d+)/i.exec(label || '')?.[0]?.replace(/\s/g, '').toLowerCase()) || (Number(value) > 20 ? 'd100' : 'd20');
  return (
    <span className={`dbt-die ${tone}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d={SHAPES[d] || SHAPES.d20} /></svg>
      <b>{value}</b>{label && <small>{label}</small>}
    </span>
  );
}

export function Bar({ value, max, tone = 'ox', thin }) {
  return <i className={`dbt-bar ${tone} ${thin ? 'thin' : ''}`} aria-hidden="true"><u style={{ width: `${Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))}%` }} /></i>;
}

export function Switch({ id, checked, onChange, label, sub }) {
  return (
    <label className="dbt-switch" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="trk" aria-hidden="true"><span className="kn" /></span>
      <span className="txt"><b>{label}</b>{sub && <small>{sub}</small>}</span>
    </label>
  );
}

// a sheet that slides up from the bottom on a phone and sits centred on a wide screen
export function Sheet({ open, onClose, title, icon, children, wide, className = '' }) {
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    setTimeout(() => box.current?.querySelector('button, [href], input, select, textarea')?.focus(), 30);
    return () => document.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="dbt-sheet-wrap" role="presentation" onClick={onClose}>
      <div ref={box} className={`dbt-sheet ${wide ? 'wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="dbt-sheet-head">{icon && <span className="dbt-roundel sm"><Ico n={icon} size={18} /></span>}<h2>{title}</h2>
          <button type="button" className="dbt-x" onClick={onClose} aria-label="Close"><Ico n="close" size={18} /></button></header>
        <div className="dbt-sheet-body">{children}</div>
      </div>
    </div>
  );
}

// an illustrated action: an icon in a gilt roundel, what it does, and what it costs
export function Action({ icon, title, sub, onClick, disabled, why, tone = '', badge, tip, compact }) {
  const t = tip || (disabled && why ? { title, body: why, icon } : null);
  return (
    <Tip as="button" type="button" tip={t} className={`dbt-act ${tone} ${compact ? 'compact' : ''}`} onClick={disabled ? undefined : onClick} aria-disabled={disabled || undefined}>
      <span className="dbt-roundel"><Ico n={icon} size={compact ? 20 : 24} /></span>
      <span className="txt"><b>{title}</b>{sub && <small>{sub}</small>}</span>
      {badge && <em className="dbt-badge">{badge}</em>}
    </Tip>
  );
}

export function Seg({ value, options, onChange, label }) {
  return (
    <div className="dbt-seg" role="tablist" aria-label={label}>
      {options.map(([k, l, ic]) => <button key={k} type="button" role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{ic && <Ico n={ic} size={16} />}{l}</button>)}
    </div>
  );
}

export function Medallion({ src, name, size = 56 }) {
  const initials = String(name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <span className="dbt-medal" style={{ width: size, height: size }}>{src ? <img src={src} alt={`Portrait of ${name}`} /> : <b style={{ fontSize: size * 0.36 }}>{initials}</b>}</span>;
}
