// The navigation rail (25 Oct 2026, Simon: "unless the services have their own sidebar, I'm keen that this sidebar is
// visible in the service, including on the IMS dashboard"): Ims, Library and History (the home screen's rooms) and
// IMS (the dashboard), down the left; a bar along the bottom on a phone. On the home screen it switches rooms; from a
// service it opens the home screen in that room. Guests never see it (they only get the page they were invited to).
import React from 'react';
import { useAuth } from '../../AuthGate';
import { Icon, IconButton } from '../HomebrewBeta/ui';

const HOME_ROOMS = [['ims', 'Ims', 'face'], ['library', 'Library', 'book'], ['history', 'History', 'archive']];
const initials = (name) => String(name || 'Simon Philpott').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

const goTo = (to, setCurrentPath) => { window.history.pushState(null, '', to); if (setCurrentPath) setCurrentPath(to); else window.dispatchEvent(new PopStateEvent('popstate')); };

// active: 'ims' | 'library' | 'history' | 'dash'; onRoom: on the home screen, switches rooms in place.
// theme/onThemeToggle/onAccount: the light-dark switch and account button at the foot (the home screen; a service
// page has them in its own header).
export default function Rail({ active, onRoom, setCurrentPath, theme, onThemeToggle, onAccount }) {
  const { user } = useAuth();
  if (user?.guest) return null;
  const room = (k) => {
    if (onRoom) return onRoom(k);
    try { localStorage.setItem('home_room', k); } catch { /* ignore */ }
    goTo('/', setCurrentPath);
  };
  return (
    <nav className="imsh-rail" aria-label="IMS">
      <button type="button" className="logo sl" onClick={() => room('ims')} aria-label="IMS home" title="IMS home"><Icon n="sparkle" size={22} /></button>
      {HOME_ROOMS.map(([k, l, ic]) => (
        <button key={k} type="button" className={`ri sl ${active === k ? 'on' : ''}`} aria-current={active === k ? 'page' : undefined} onClick={() => room(k)}>
          <i><Icon n={ic} size={22} /></i><span>{l}</span>
        </button>
      ))}
      <button type="button" className={`ri sl ${active === 'dash' ? 'on' : ''}`} aria-current={active === 'dash' ? 'page' : undefined} onClick={() => goTo('/ims', setCurrentPath)}>
        <i><Icon n="hub" size={22} /></i><span>IMS</span>
      </button>
      <span className="grow" />
      {onThemeToggle && <IconButton className="rtheme" icon={theme === 'dark' ? 'sun' : 'moon'} label={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={onThemeToggle} />}
      {onAccount && <IconButton className="racct" label="Your account" onClick={onAccount} aria-haspopup="menu"><span className="avatar">{initials(user?.name)}</span></IconButton>}
    </nav>
  );
}
