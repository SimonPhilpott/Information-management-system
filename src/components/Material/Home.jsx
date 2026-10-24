// The IMS home screen (/) in the IMS design (25 Oct 2026, Simon chose option A with B's three columns as the Library
// room): Ims at the centre, with his face, a greeting and today at a glance (the next event, the weather, what's
// due), the conversation and a message box, and the mic as the button in the bottom right. A navigation rail on the
// left (a bar along the bottom on a phone) moves between Ims, Library (the existing library page: subjects, the
// chat with Pro/Thinking models and citations, Discover Topics and the graph, untouched), History (library chats)
// and the IMS dashboard. Ims's chat is the same live session as before (useImsLive, as ImsPanel used).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../HomebrewBeta/hbb.css';
import './ims-m.css';
import { useAuth } from '../../AuthGate';
import { Icon, IconButton, Btn, Sheet, Confirm, Menu, useMenu, useRipples, LayerProvider, SnackHost, TipHost, DarkCtx, useSnack } from '../HomebrewBeta/ui';
import ImsFace from '../Ims/ImsFace';
import PhotoCarbs, { CameraCapture } from '../Dashboard/PhotoCarbs';
import { useImsLive } from '../../hooks/useImsLive';

const ROOMS = [['ims', 'Ims', 'face'], ['library', 'Library', 'book'], ['history', 'History', 'archive']];
const STATUS_TEXT = { asleep: 'Asleep', connecting: 'Waking up', ready: 'Awake', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking' };
const SUGGEST = ["What's my day look like?", 'Any news from my sources?', "What's the weather doing later?", 'Set a timer for 10 minutes'];
const CAL = { pod: 'Omnipod change', sensor: 'Sensor change', prescription: 'Prescription' };
const initials = (name) => String(name || 'Simon Philpott').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const londonNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/London' }));
const greeting = () => { const h = londonNow().getHours(); return h < 5 ? 'Evening' : h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening'; };
const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const londonTime = (iso) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit' });
const countdown = (sec) => { const s = Math.max(0, Math.round(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`; };

// today at a glance: the device's status (alarms, timers, reminders, pod and sensor), the weather and the next event
function useGlance() {
  const [status, setStatus] = useState(null);
  const [weather, setWeather] = useState(null);
  const [events, setEvents] = useState(null);
  useEffect(() => {
    let stop = false;
    const load = () => fetch('/api/ims/status').then((r) => r.json()).then((d) => { if (!stop && d.success) setStatus(d); }).catch(() => {});
    load();
    const poll = setInterval(load, 15000);
    fetch('/api/weather?days=2').then((r) => r.json()).then((d) => { if (!stop && d.success) setWeather(d.weather); }).catch(() => {});
    fetch('/api/calendar?days=2', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (!stop && d?.events) setEvents(d.events); }).catch(() => {});
    return () => { stop = true; clearInterval(poll); };
  }, []);
  return { status, weather, events };
}

function Glance({ status, weather, events, now }) {
  const nextEvent = useMemo(() => {
    if (!events) return null;
    const t = todayStr(), hm = londonNow().toTimeString().slice(0, 5);
    return events.filter((e) => e.date > t || (e.date === t && (!e.time || (e.endTime || e.time) >= hm))).sort((a, b) => `${a.date}${a.time || '00:00'}`.localeCompare(`${b.date}${b.time || '00:00'}`))[0] || null;
  }, [events]);
  const items = status?.items || [];
  const due = [];
  for (const ic of status?.icons || []) if (CAL[ic.icon]) due.push({ k: `c${ic.icon}`, icon: 'calendar', text: ic.color && ic.color !== 'white' ? `${CAL[ic.icon]} soon` : `${CAL[ic.icon]} today`, warn: true });
  const timer = items.find((i) => i.type === 'timer');
  if (timer) due.push({ k: 'timer', icon: 'timer', text: `${timer.label || 'Timer'} · ${countdown((new Date(timer.fireAt).getTime() - now) / 1000)}` });
  const alarm = items.find((i) => i.type === 'alarm');
  if (alarm) due.push({ k: 'alarm', icon: 'alarm', text: `${alarm.label || 'Alarm'} · ${londonTime(alarm.fireAt)}` });
  const reminder = items.find((i) => i.type === 'reminder');
  if (reminder) due.push({ k: 'rem', icon: 'bell', text: `${reminder.label || 'Reminder'} · ${londonTime(reminder.fireAt)}` });
  if (status?.birthday?.count) due.push({ k: 'bd', icon: 'cake', text: `${status.birthday.count} birthday${status.birthday.count === 1 ? '' : 's'} coming up` });
  if (status?.newReleases?.count) due.push({ k: 'nr', icon: 'music', text: `${status.newReleases.count} new release${status.newReleases.count === 1 ? '' : 's'} today` });
  const w = weather?.current, td = weather?.today;
  const place = weather?.location?.split(',')[0];
  return (
    <div className="imsh-glance">
      <a className="gc sl" href="/ims/calendar">
        <span className="lbl"><Icon n="calendar" size={18} />Next</span>
        {nextEvent ? <><b>{nextEvent.title}</b><span className="s">{nextEvent.date === todayStr() ? 'Today' : 'Tomorrow'}{nextEvent.time ? ` · ${nextEvent.time}` : ' · all day'}{nextEvent.location ? ` · ${nextEvent.location}` : ''}</span></>
          : <><b>{events ? 'Nothing booked' : 'Your calendar'}</b><span className="s">{events ? 'Today and tomorrow are clear.' : 'Sign in to see what\'s next.'}</span></>}
      </a>
      <a className="gc sl" href="/ims/weather">
        <span className="lbl"><Icon n="cloud" size={18} />Weather{place ? ` · ${place}` : ''}</span>
        {w ? <><b>{w.temperature_c}° · {w.condition}</b><span className="s">{td ? `${td.min_temp_c}° to ${td.max_temp_c}°${td.rain_probability_percent >= 30 ? `, ${td.rain_level || 'some'} rain likely` : ', staying dry'}` : ''}{w.gust_mph >= 30 ? `, gusts to ${w.gust_mph} mph` : ''}</span></>
          : <><b>-</b><span className="s">Checking the forecast...</span></>}
      </a>
      <a className="gc sl" href="/ims/reminders">
        <span className="lbl"><Icon n="checklist" size={18} />Today</span>
        {due.length ? <ul>{due.slice(0, 3).map((d) => <li key={d.k} className={d.warn ? 'warn' : ''}><Icon n={d.icon} size={16} />{d.text}</li>)}</ul>
          : <><b>Nothing due</b><span className="s">No alarms, timers or reminders set.</span></>}
      </a>
    </div>
  );
}

function ImsRoom({ dark, onOpenStatus, statusTone }) {
  const ims = useImsLive();
  const snack = useSnack();
  const { user } = useAuth();
  const glance = useGlance();
  const [now, setNow] = useState(() => Date.now());
  const [text, setText] = useState('');
  const [plate, setPlate] = useState(null);
  const [camera, setCamera] = useState(false);
  const [clearAsk, setClearAsk] = useState(false);
  const more = useMenu();
  const listRef = useRef(null);
  const taRef = useRef(null);
  const talking = ims.messages.length > 0;
  const firstName = (user?.name || 'Simon Philpott').split(/\s+/)[0];

  useEffect(() => { if (!glance.status?.hasTimer) return undefined; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [glance.status?.hasTimer]);
  useEffect(() => { if (ims.messages.length) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [ims.messages]);
  useEffect(() => { if (ims.error) snack(ims.error, { error: true }); }, [ims.error, snack]);
  const grow = (el) => { if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 220)}px`; };
  const submit = (t = text) => { if (!t.trim()) return; ims.sendText(t); setText(''); requestAnimationFrame(() => grow(taRef.current)); };
  const launcher = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));

  return (
    <div className={`imsh-ims ${talking ? 'talking' : ''}`}>
      <header className="imsh-top">
        <span className="imsm-tile acc-green"><Icon n="face" size={24} /></span>
        <h1 className="imsm-title">Ims</h1>
        <button type="button" className={`imsh-dot sl ${statusTone}`} onClick={onOpenStatus} title="Ims and the library: status"><i className={`st-${ims.status}`} /><span>{STATUS_TEXT[ims.status] || ims.status}</span></button>
        <span className="grow" />
        <IconButton icon="search" label="Search everything (Ctrl K)" onClick={launcher} />
      </header>

      <div className="imsh-scroll" ref={listRef}>
        <section className="imsh-hero">
          <div className={`imsh-face st-${ims.status}`}><ImsFace face={ims.face} status={ims.status} levelRef={ims.levelRef} width="100%" /></div>
          {!talking && <h2 className="imsh-hello">{greeting()}, {firstName}</h2>}
        </section>
        {!talking && (
          <>
            <Glance {...glance} now={now} />
            <div className="imsh-suggest">{SUGGEST.map((s) => <button key={s} type="button" className="chip sl" onClick={() => submit(s)}>{s}</button>)}</div>
          </>
        )}
        {talking && (
          <div className="imsh-msgs" aria-live="polite">
            {ims.messages.map((m) => (m.role === 'tool'
              ? <div key={m.id} className="tool">Ims {m.text}</div>
              : <div key={m.id} className={`msg ${m.role === 'user' ? 'me' : 'ims'} ${m.done ? '' : 'live'}`}>{m.text}</div>))}
          </div>
        )}
      </div>

      <div className="imsh-compose">
        <div className="box">
          <textarea ref={taRef} rows={1} value={text} placeholder="Type to Ims..." aria-label="Message to Ims"
            onChange={(e) => { setText(e.target.value); grow(e.target); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} />
          <div className="row">
            <button type="button" className={`cchip sl ${ims.voiceReplies ? 'on' : ''}`} onClick={() => ims.setVoiceReplies(!ims.voiceReplies)} title={ims.voiceReplies ? 'He answers out loud; tap for text only' : 'Text only; tap to hear him'}>
              <Icon n={ims.voiceReplies ? 'mic' : 'chat'} size={16} /><span>{ims.voiceReplies ? 'Voice replies' : 'Text only'}</span>
            </button>
            <span className="grow" />
            {ims.status === 'speaking' && <IconButton icon="stop" label="Stop him talking" onClick={ims.stopSpeaking} />}
            <IconButton icon="more" label="More" onClick={more.show} aria-haspopup="menu" />
            <IconButton icon="send" label="Send" className="send" disabled={!text.trim()} onClick={() => submit()} />
          </div>
        </div>
        <button type="button" className={`imsh-mic sl ${ims.micOn ? 'on' : ''}`} onClick={ims.toggleMic} aria-label={ims.micOn ? 'Stop talking' : 'Talk to Ims'} title={ims.micOn ? 'Stop talking' : 'Talk to Ims'}>
          <Icon n={ims.micOn ? 'stop' : 'mic'} size={28} />
        </button>
        <button type="button" className="imsh-food sl" onClick={() => setCamera(true)} aria-label="Log food from a photo" title="Log food: carbs from a photo of your plate">
          <Icon n="food" size={26} /><span>Log food</span>
        </button>
      </div>

      <Menu anchor={more.anchor} open={more.open} onClose={more.close} items={[
        { label: 'Search everything (Ctrl K)', icon: 'search', onClick: launcher },
        { label: 'Log food from a photo', icon: 'camera', onClick: () => setCamera(true) },
        talking && { label: 'Clear the chat on screen', icon: 'del', onClick: () => setClearAsk(true) },
      ].filter(Boolean)} />
      <Confirm open={clearAsk} title="Clear the chat on screen?" body="It only clears this screen; Ims still remembers what you've told him." okLabel="Clear" onOk={ims.clear} onClose={() => setClearAsk(false)} />
      {camera && <CameraCapture onPhoto={(f) => { setCamera(false); setPlate(f); }} onClose={() => setCamera(false)} />}
      <Sheet open={Boolean(plate)} onClose={() => setPlate(null)} title="Carbs from your photo" wideWidth="640px">
        {plate && (
          <div className="rpb-legacy">
            <PhotoCarbs file={plate} isDark={dark} gradient="from-emerald-500 to-teal-600"
              field={`w-full px-2.5 py-1.5 rounded-lg text-sm outline-none border ${dark ? 'bg-slate-900/60 border-white/10' : 'bg-white border-[#2E2B27]/10'}`}
              notify={(m, kind) => snack(m, kind === 'error' ? { error: true } : undefined)}
              onLogged={() => setPlate(null)} onCancel={() => setPlate(null)} />
          </div>
        )}
      </Sheet>
    </div>
  );
}

function HistoryRoom({ sessions, activeSessionId, onLoadSession, onDeleteSession, onClearHistory, onNewChat, isClearingHistory }) {
  const [q, setQ] = useState('');
  const [ask, setAsk] = useState(null);
  const list = (sessions || []).filter((s) => !q || (s.title || '').toLowerCase().includes(q.toLowerCase()));
  const when = (s) => { const t = s.updated_at || s.updatedAt || s.created_at || s.createdAt || s.timestamp; return t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
  return (
    <div className="imsh-page">
      <header className="imsh-top">
        <span className="imsm-tile acc-green"><Icon n="archive" size={24} /></span>
        <h1 className="imsm-title">History</h1>
        <span className="grow" />
        <Btn kind="tonal" icon="add" onClick={onNewChat}>New library chat</Btn>
      </header>
      <p className="imsm-sub">Your library chats. Open one to carry on in the Library.</p>
      <div className="imsh-search"><Icon n="search" size={20} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your chats" aria-label="Search your chats" /></div>
      {list.length ? (
        <div className="imsm-list">
          {list.map((s) => (
            <div key={s.id} className={`imsm-item sl tappable ${s.id === activeSessionId ? 'on' : ''}`} role="button" tabIndex={0} onClick={() => onLoadSession(s.id)} onKeyDown={(e) => { if (e.key === 'Enter') onLoadSession(s.id); }}>
              <span className="lead quiet"><Icon n="chat" size={22} /></span>
              <span className="txt"><b>{s.title || 'Untitled chat'}</b>{when(s) && <span className="meta">{when(s)}</span>}</span>
              <span className="acts" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}><IconButton icon="del" label={`Delete ${s.title || 'this chat'}`} onClick={() => setAsk({ title: `Delete "${s.title || 'Untitled chat'}"?`, okLabel: 'Delete', danger: true, onOk: () => onDeleteSession(s.id) })} /></span>
            </div>
          ))}
        </div>
      ) : <div className="imsm-empty"><span className="eic"><Icon n="archive" size={30} /></span><b>{q ? 'No chats match' : 'No library chats yet'}</b></div>}
      {(sessions || []).length > 0 && <div className="imsm-row end"><Btn kind="text" icon="del" busy={isClearingHistory} onClick={() => setAsk({ title: 'Clear all your library chats?', body: 'Every chat in the history is deleted. That can\'t be undone.', okLabel: 'Clear them all', danger: true, onOk: onClearHistory })}>Clear the history</Btn></div>}
      <Confirm open={Boolean(ask)} {...(ask || {})} onClose={() => setAsk(null)} onOk={ask?.onOk || (() => {})} />
    </div>
  );
}

function Shell({ theme, onThemeToggle, setCurrentPath, onLogout, syncStatus, onSync, history, room, setRoom }) {
  const { user } = useAuth();
  const dark = theme === 'dark';
  const account = useMenu();
  const [statusOpen, setStatusOpen] = useState(false);
  const go = (to) => { window.history.pushState(null, '', to); if (setCurrentPath) setCurrentPath(to); else window.dispatchEvent(new PopStateEvent('popstate')); };
  useEffect(() => { document.title = room === 'library' ? 'IMS · Library' : room === 'history' ? 'IMS · History' : 'IMS'; }, [room]);
  // the library and its sync, folded into one dot
  const syncing = syncStatus?.drive?.active || syncStatus?.indexing?.active;
  const syncError = syncStatus?.drive?.error || syncStatus?.indexing?.error || /error/i.test(`${syncStatus?.drive?.phase || ''}${syncStatus?.indexing?.phase || ''}`);
  const tone = syncError ? 'bad' : syncing ? 'busy' : 'ok';

  return (
    <>
      <nav className="imsh-rail" aria-label="Home">
        <span className="logo" aria-hidden="true"><Icon n="sparkle" size={22} /></span>
        {ROOMS.map(([k, l, ic]) => (
          <button key={k} type="button" className={`ri sl ${room === k ? 'on' : ''}`} aria-current={room === k ? 'page' : undefined} onClick={() => setRoom(k)}>
            <i><Icon n={ic} size={22} /></i><span>{l}</span>
          </button>
        ))}
        {!user?.guest && <button type="button" className="ri sl" onClick={() => go('/ims')}><i><Icon n="hub" size={22} /></i><span>IMS</span></button>}
        <span className="grow" />
        <IconButton className="rtheme" icon={dark ? 'sun' : 'moon'} label={dark ? 'Light theme' : 'Dark theme'} onClick={onThemeToggle} />
        <IconButton className="racct" label="Your account" onClick={account.show} aria-haspopup="menu"><span className="avatar">{initials(user?.name)}</span></IconButton>
      </nav>

      {room === 'ims' && <main className="imsh-main"><ImsRoom dark={dark} statusTone={tone} onOpenStatus={() => setStatusOpen(true)} /></main>}
      {room === 'history' && <main className="imsh-main scroll"><HistoryRoom {...history} onLoadSession={(id) => { history.onLoadSession(id); setRoom('library'); }} onNewChat={() => { history.onNewChat(); setRoom('library'); }} /></main>}

      <Menu anchor={account.anchor} open={account.open} onClose={account.close} items={[
        { label: dark ? 'Light theme' : 'Dark theme', icon: dark ? 'sun' : 'moon', onClick: onThemeToggle },
        !user?.guest && { label: 'IMS dashboard', icon: 'hub', onClick: () => go('/ims') },
        onLogout && { label: 'Sign out', icon: 'person', onClick: onLogout },
      ].filter(Boolean)} />
      <Sheet open={statusOpen} onClose={() => setStatusOpen(false)} title="Status"
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setStatusOpen(false)}>Done</Btn></div>}>
        <div className="imsm-form">
          <div className="imsh-strow"><i className={`d ${tone}`} /><span><b>The library</b><small>{syncError ? (syncStatus?.drive?.error || syncStatus?.indexing?.error || 'The last sync hit a problem.') : syncing ? `Syncing: ${syncStatus?.indexing?.phase || syncStatus?.drive?.phase || 'working'}` : 'Up to date.'}</small></span>{onSync && <Btn kind="tonal" icon="sync" disabled={syncing} onClick={onSync}>Sync</Btn>}</div>
          <p className="muted" style={{ margin: 0 }}>Ims's own status is beside his name: asleep until you type or tap the mic, then awake, listening, thinking or speaking. The face mirrors the one on the desk.</p>
        </div>
      </Sheet>
    </>
  );
}

// theme, onThemeToggle, setCurrentPath; library: the existing library page; history: the library chats and their actions
export default function Home(props) {
  const root = useRef(null);
  const [node, setNode] = useState(null);
  const [room, setRoomState] = useState(() => { try { return localStorage.getItem('home_room') || 'ims'; } catch { return 'ims'; } });
  const setRoom = (r) => { setRoomState(r); try { localStorage.setItem('home_room', r); } catch { /* ignore */ } };
  useRipples(root);
  const dark = props.theme === 'dark';
  // the library page draws itself full screen, so it sits beside the rail rather than inside the IMS frame
  const lib = room === 'library';
  return (
    <>
      <div className={`hbb imsm imsh acc-green ${dark ? 'dark' : ''} ${lib ? 'lib' : ''}`} ref={(el) => { root.current = el; if (el && el !== node) setNode(el); }}>
        <DarkCtx.Provider value={dark}>
          <LayerProvider root={node}>
            <SnackHost>
              <TipHost>{node && <Shell {...props} room={room} setRoom={setRoom} />}</TipHost>
            </SnackHost>
          </LayerProvider>
        </DarkCtx.Provider>
      </div>
      {lib && <div className="imsh-lib">{props.library}</div>}
    </>
  );
}
