// IMS core services in the Homebrew / Run planner design (24 Oct 2026, Simon: "roll out the new design aesthetic to
// all the core services ... add buttons to the bottom right where appropriate"). One frame for every service page:
// Homebrew's Material 3 pieces (HomebrewBeta/ui.jsx, hbb.css) on the oatmeal background, each service in its own
// colour (ims-m.css), a header with the service's tile and name in the heading font, the back button to the IMS
// dashboard, your account and the light/dark switch, snackbars, and the main action as a floating button in the
// bottom right that shrinks as you scroll.
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import '../HomebrewBeta/hbb.css';
import './ims-m.css';
import { useAuth } from '../../AuthGate';
import Rail from './Rail';
import { Icon, IconButton, useRipples, LayerProvider, SnackHost, TipHost, Menu, useMenu, useScrollState, DarkCtx } from '../HomebrewBeta/ui';

// whether the page has been scrolled down (the floating button shrinks to its icon)
const ScrollCtx = createContext(false);

const initials = (name) => String(name || 'Simon Philpott').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function Frame({ title, icon, accent, theme, onThemeToggle, setCurrentPath, fab, actions, sub, children, wide, full, rail, backTo = '/ims', backLabel = 'Back to the IMS dashboard' }) {
  const { user } = useAuth();
  const scroller = useRef(null);
  const { down } = useScrollState(scroller);
  const account = useMenu();
  const go = (to) => { window.history.pushState(null, '', to); if (setCurrentPath) setCurrentPath(to); else window.dispatchEvent(new PopStateEvent('popstate')); };
  const goHome = () => go('/ims');
  useEffect(() => { const was = document.title; document.title = title; return () => { document.title = was; }; }, [title]);
  return (
    <>
    {rail !== false && <Rail active={rail === 'dash' ? 'dash' : null} setCurrentPath={setCurrentPath} />}
    <div className="imsm-page">
      <div className="scroll" ref={scroller}>
        <div className={`imsm-body ${wide ? 'wide' : ''} ${full ? 'full' : ''}`}>
          <header className={`imsm-head ${actions ? 'has-acts' : ''}`}>
            {!user?.guest && <IconButton icon="back" label={backLabel} onClick={() => go(backTo)} />}
            <span className={`imsm-tile acc-${accent}`}><Icon n={icon} size={26} /></span>
            <h1 className="imsm-title">{title}</h1>
            <span className="grow" />
            {/* on a phone a page's own tools drop to a row of their own, so the title shows in full */}
            <span className="tools">
              {actions}
              <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} label={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={onThemeToggle} />
              <IconButton label="Your account" onClick={account.show} aria-haspopup="menu"><span className="avatar">{initials(user?.name)}</span></IconButton>
            </span>
          </header>
          {sub && <p className="imsm-sub">{sub}</p>}
          <ScrollCtx.Provider value={down}>{children}</ScrollCtx.Provider>
        </div>
      </div>
      {fab && <ScrollCtx.Provider value={down}><Fab {...fab} /></ScrollCtx.Provider>}
      <Menu anchor={account.anchor} open={account.open} onClose={account.close} items={[
        { label: theme === 'dark' ? 'Light theme' : 'Dark theme', icon: theme === 'dark' ? 'sun' : 'moon', onClick: onThemeToggle },
        !user?.guest && { label: 'IMS home', icon: 'home', onClick: goHome },
      ]} />
    </div>
    </>
  );
}

// accent: red | sky | teal | pink | indigo | orange | violet | blue | green
export default function ServicePage(props) {
  const root = useRef(null);
  const [node, setNode] = useState(null);
  useRipples(root);
  const dark = props.theme === 'dark';
  return (
    <div className={`hbb imsm withrail acc-${props.accent || 'green'} ${dark ? 'dark' : ''}`} ref={(el) => { root.current = el; if (el && el !== node) setNode(el); }}>
      <DarkCtx.Provider value={dark}>
        <LayerProvider root={node}>
          <SnackHost>
            <TipHost>{node && <Frame {...props} />}</TipHost>
          </SnackHost>
        </LayerProvider>
      </DarkCtx.Provider>
    </div>
  );
}

// a card in a list: a leading icon tile, the text, and its actions on the right
export function ItemCard({ icon, tone, title, meta, tags, children, onClick, className = '', style }) {
  // a card you can tap is a focusable "button" that can still hold its own icon buttons (a real <button> can't)
  const tap = onClick ? { role: 'button', tabIndex: 0, onClick, onKeyDown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onClick(e); } } } : {};
  return (
    <div className={`imsm-item ${onClick ? 'sl tappable' : ''} ${className}`} style={style} {...tap}>
      {icon && <span className={`lead ${tone || ''}`}><Icon n={icon} size={22} /></span>}
      <span className="txt">
        <b>{title}</b>
        {meta && <span className="meta">{meta}</span>}
        {tags && <span className="tags">{tags}</span>}
      </span>
      {children && <span className="acts" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>{children}</span>}
    </div>
  );
}

export function Empty({ icon = 'info', title, children }) {
  return (
    <div className="imsm-empty"><span className="eic"><Icon n={icon} size={30} /></span><b>{title}</b>{children && <p>{children}</p>}</div>
  );
}

// the page's main action, in the bottom right (Homebrew's New button): render it anywhere inside the page
export function Fab({ label, icon = 'add', onClick, disabled }) {
  const down = useContext(ScrollCtx);
  return (
    <div className="fab-slot imsm-fab">
      <button type="button" className={`fab sl ${down ? 'small' : ''}`} onClick={onClick} aria-label={label} disabled={disabled}>
        <Icon n={icon} /><span className="lbl">{label}</span>
      </button>
    </div>
  );
}
