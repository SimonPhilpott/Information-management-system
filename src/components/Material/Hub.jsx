// The IMS dashboard in the IMS design (24 Oct 2026): every IMS page as a card in its own colour, grouped as before,
// with a search across them. (The stars that marked pages in the new design went on 25 Oct, once every page was.) The list of pages, their
// groups and descriptions still live in Dashboard/ImsHub.jsx (LINKS, SECTIONS, NEW_DESIGN), the one place to add
// a new page; the icon and colour for each are here.
import React, { useMemo, useState } from 'react';
import ServicePage from './ServicePage';
import { Icon } from '../HomebrewBeta/ui';
import { LINKS, SECTIONS } from '../Dashboard/ImsHub';

// path -> [icon, colour]
const LOOK = {
  '/ims/weather': ['cloud', 'sky'], '/ims/doorbell': ['doorbell', 'orange'], '/ims/alarms': ['alarm', 'red'], '/ims/timers': ['timer', 'blue'],
  '/ims/reminders': ['bell', 'green'], '/ims/instructions': ['clipboard', 'indigo'], '/ims/birthday': ['cake', 'pink'], '/ims/calendar': ['calendar', 'blue'],
  '/ims/memories': ['bulb', 'teal'], '/ims/recordings': ['mic', 'red'], '/ims/tasks': ['checklist', 'teal'],
  '/ims/look': ['eye', 'sky'], '/ims/faces': ['face', 'violet'],
  '/ims/code-repo': ['code', 'indigo'], '/ims/dnd': ['dice', 'brown'], '/ims/dnd-beta': ['dice', 'brown'], '/ims/dayreport': ['sun', 'orange'], '/ims/musicscan': ['music', 'pink'], '/ims/boardgames': ['dice', 'violet'],
  '/campaigns': ['explore', 'green'], '/ims/homebrew': ['cup', 'orange'], '/ims/news': ['news', 'sky'],
  '/ims/glucose': ['blood', 'red'], '/ims/activities': ['watch', 'orange'], '/ims/runplanner': ['route', 'green'],
  '/ims/device-health': ['monitor', 'teal'], '/ims/storage': ['disk', 'indigo'], '/ims/models': ['sparkle', 'indigo'], '/ims/costs': ['money', 'green'],
  '/ims/facedesigner': ['palette', 'orange'], '/ims/persona': ['people', 'violet'], '/ims/phrases': ['mic', 'pink'], '/ims/wifi': ['wifi', 'blue'],
  '/ims/devideas': ['bulb', 'orange'], '/ims/backups': ['archive', 'teal'], '/ims/architecture': ['hub', 'indigo'],
};
const SECTION_ICON = { 'Core functions': 'home', 'Vision & camera': 'eye', Personal: 'person', 'Health and fitness': 'run', 'Customisation and system settings': 'tune' };

function Body({ go }) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return SECTIONS.map(([name, paths]) => [name, paths.map((p) => LINKS.find((l) => l.path === p)).filter(Boolean)
      .filter((l) => !needle || `${l.title} ${l.description}`.toLowerCase().includes(needle))
      .sort((a, b) => a.title.localeCompare(b.title, 'en-GB'))]).filter(([, l]) => l.length);
  }, [q]);

  return (
    <>
      <div className="imsm-hubsearch">
        <Icon n="search" size={22} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a page" aria-label="Find a page" />
        {q && <button type="button" className="sl" aria-label="Clear the search" onClick={() => setQ('')}><Icon n="close" size={20} /></button>}
      </div>
      {!groups.length && <p className="muted">Nothing matches “{q}”.</p>}
      {groups.map(([name, links]) => (
        <section key={name} className="imsm-hubsec">
          <h2 className="imsm-h2"><Icon n={SECTION_ICON[name] || 'list'} size={22} />{name}</h2>
          <div className="imsm-hubgrid">
            {links.map((l) => {
              const [icon, acc] = LOOK[l.path] || ['open', 'green'];
              return (
                <button key={l.path} type="button" className={`imsm-hubcard sl ${l.disabled ? 'off' : ''}`} disabled={Boolean(l.disabled)} title={l.disabled || undefined} onClick={() => go(l.path)}>
                  <span className={`imsm-tile acc-${acc}`}><Icon n={icon} size={24} /></span>
                  <span className="txt">
                    <b>{l.title}</b>
                    <small>{l.disabled || l.description}</small>
                  </span>
                  <Icon n="open" size={20} />
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}

export default function Hub({ theme = 'light', onThemeToggle, setCurrentPath }) {
  const go = (path) => { window.history.pushState(null, '', path); if (setCurrentPath) setCurrentPath(path); else window.dispatchEvent(new PopStateEvent('popstate')); };
  return (
    <ServicePage rail="dash" title="IMS" icon="home" accent="green" wide theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath}
      backTo="/" backLabel="Back to the library dashboard" sub="Everything about Ims outside a normal chat: what he remembers, who he is, and the services he runs.">
      <Body go={go} />
    </ServicePage>
  );
}
