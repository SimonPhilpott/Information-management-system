// Hover, focus or tap descriptions for anything in the beta: terms, stats, items, conditions, map icons. One floating
// card for the whole page, placed under (or over) what it describes and kept inside the window. On a touch screen a tap
// opens it and a second tap, or a tap elsewhere, closes it.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { GLOSSARY, TERM_RE } from '../kn/glossary';
import Ico from './Ico';

const Ctx = createContext(null);

export function TipHost({ children, onPage }) {
  const [tip, setTip] = useState(null); // { rect, data, pinned }
  const timer = useRef(null);
  const show = useCallback((el, data, pinned = false) => { clearTimeout(timer.current); setTip({ rect: el.getBoundingClientRect(), data, pinned }); }, []);
  const hide = useCallback((force = false) => { clearTimeout(timer.current); setTip((t) => (t && t.pinned && !force ? t : null)); }, []);
  const later = useCallback((el, data) => { clearTimeout(timer.current); timer.current = setTimeout(() => show(el, data), 220); }, [show]);
  useEffect(() => {
    if (!tip) return undefined;
    const off = (e) => { if (!e.target.closest?.('.dbt-tip') && !e.target.closest?.('[data-tip]')) hide(true); };
    const key = (e) => { if (e.key === 'Escape') hide(true); };
    const scroll = () => hide(true);
    document.addEventListener('pointerdown', off); document.addEventListener('keydown', key); window.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('pointerdown', off); document.removeEventListener('keydown', key); window.removeEventListener('scroll', scroll, true); };
  }, [tip, hide]);
  const api = useMemo(() => ({ show, hide, later, onPage }), [show, hide, later, onPage]);
  return <Ctx.Provider value={api}>{children}<Bubble tip={tip} onClose={() => hide(true)} onPage={onPage} /></Ctx.Provider>;
}

function Bubble({ tip, onClose, onPage }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!tip || !ref.current) { setPos(null); return; }
    const b = ref.current.getBoundingClientRect(), r = tip.rect, W = window.innerWidth, H = window.innerHeight;
    let top = r.bottom + 8; let above = false;
    if (top + b.height > H - 8 && r.top - b.height - 8 > 8) { top = r.top - b.height - 8; above = true; }
    const left = Math.max(8, Math.min(W - b.width - 8, r.left + r.width / 2 - b.width / 2));
    setPos({ top, left, arrow: Math.max(14, Math.min(b.width - 14, r.left + r.width / 2 - left)), above });
  }, [tip]);
  if (!tip) return null;
  const d = tip.data;
  return (
    <div ref={ref} className={`dbt-tip ${pos?.above ? 'above' : ''}`} role="tooltip" style={pos ? { top: pos.top, left: pos.left, '--arrow': `${pos.arrow}px` } : { top: -999, left: -999 }}>
      <div className="dbt-tip-head">
        {d.icon && <span className="dbt-tip-ico"><Ico n={d.icon} size={18} /></span>}
        <b>{d.title}</b>
        {d.badge && <em>{d.badge}</em>}
        {tip.pinned && <button type="button" className="dbt-tip-x" onClick={onClose} aria-label="Close"><Ico n="close" size={14} /></button>}
      </div>
      {d.live && <p className="dbt-tip-live">{d.live}</p>}
      {d.body && <p>{d.body}</p>}
      {d.extra}
      {d.page && (onPage ? <button type="button" className="dbt-tip-page" onClick={() => { onPage(d.page); onClose(); }}><Ico n="tome" size={14} /> Book, page {d.page}</button> : <span className="dbt-tip-page">Book, page {d.page}</span>)}
    </div>
  );
}

export function useTip() { return useContext(Ctx); }

// wraps anything in a description. `as` picks the element; buttons keep their own onClick and get the tip on hover
export function Tip({ tip, as: As = 'span', className = '', children, onClick, ...rest }) {
  const api = useTip();
  const ref = useRef(null);
  const touch = useRef(false);
  if (!tip || !api) return <As className={className} onClick={onClick} {...rest}>{children}</As>;
  return (
    <As ref={ref} data-tip="" className={`${className} has-tip`} tabIndex={As === 'span' ? 0 : undefined} {...rest}
      onPointerDown={(e) => { touch.current = e.pointerType !== 'mouse'; }}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') api.later(ref.current, tip); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') api.hide(); }}
      onFocus={() => api.show(ref.current, tip)} onBlur={() => api.hide()}
      onClick={(e) => { if (onClick) onClick(e); else if (touch.current || As === 'span') { e.stopPropagation(); api.show(ref.current, tip, true); } }}>
      {children}
    </As>
  );
}

// a glossary word, underlined with dots
export function Term({ name, children, live }) {
  const g = GLOSSARY[name];
  if (!g) return <>{children || name}</>;
  return <Tip className="dbt-term" tip={{ title: name, ...g, live }}>{children || name}</Tip>;
}

// running text with every glossary term made hoverable
export function Rich({ text }) {
  const parts = useMemo(() => {
    const s = String(text || ''); const out = []; let last = 0; const re = new RegExp(TERM_RE.source, 'g'); let m; const seen = new Set();
    while ((m = re.exec(s))) {
      if (seen.has(m[1])) continue; seen.add(m[1]);
      if (m.index > last) out.push(s.slice(last, m.index));
      out.push(<Term key={`${m.index}`} name={m[1]}>{m[0]}</Term>); last = m.index + m[0].length;
    }
    if (last < s.length) out.push(s.slice(last));
    return out;
  }, [text]);
  return <>{parts}</>;
}
