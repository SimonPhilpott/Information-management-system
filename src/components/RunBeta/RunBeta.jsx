// Run planner - in Homebrew's design (Material Design 3, Android first, list and detail side by side on a wide
// screen), in green on Homebrew's oatmeal. At /ims/runplanner: built as a beta at /ims/runplanner-beta, it replaced
// the classic page on 24 Oct 2026 (the -beta addresses still open the same screens). Every service and sync the
// classic page used is here (useRunPlanner.js).
//   Phone (<600dp):    bottom navigation bar, one screen at a time
//   Tablet (600-839):  navigation rail, one screen at a time
//   Desktop (>=840):   navigation rail; Routes shows the list and the open route side by side
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import '../HomebrewBeta/hbb.css';
import './rpb.css';
import './rpb-plan.css';
import './rpb-screens.css';
import { useAuth } from '../../AuthGate';
import {
  Icon, IconButton, Btn, useMedia, useScrollState, useRipples, viewTransition, LayerProvider, SnackHost, useSnack, TipHost, Menu, useMenu, Sheet, DarkCtx, Spinner,
  TextField,
} from '../HomebrewBeta/ui';
import { useRunPlanner } from './useRunPlanner';
import { usePhone } from './usePhone';
import { BASE, parsePath, pathFor, NAV } from './paths';
import { RunBrand } from './brand';
import Today from './Today';
import Routes, { RouteDetail } from './Routes';
import Learning from './Learning';
import Rulebook from './Rulebook';
import Retro from './Retro';
import Replay from './Replay';
import AddRoute from './AddRoute';
import { printRunReport } from '../Dashboard/RunPlanner/printRunReport';
import { GaugeStyle } from '../Dashboard/RunPlanner/RadialGauge';
import { ChartFit } from '../Dashboard/RunPlanner/RunPlanChart';

const initials = (name) => String(name || 'Simon Philpott').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const TITLES = { today: 'Today', routes: 'Routes', runs: 'Replay your runs', learning: 'Learning', rulebook: 'Rulebook' };

function App({ theme, onThemeToggle, setCurrentPath }) {
  const { user } = useAuth();
  const isOwner = !user?.guest;
  const snack = useSnack();
  const sm = useMedia('(min-width: 600px)');
  const md = useMedia('(min-width: 840px)');
  const lg = useMedia('(min-width: 1200px)');
  const layout = lg ? 'xwide' : md ? 'wide' : sm ? 'medium' : 'compact';
  const wide = md;
  const dark = theme === 'dark';

  // every bit of the planner's data and actions - the same services and syncs as the classic page
  const rp = useRunPlanner({ theme });
  // its messages come up as snackbars
  useEffect(() => { if (rp.notification?.msg) snack(rp.notification.msg, { error: rp.notification.type === 'error' }); }, [rp.notification]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- where we are: every screen has an address; Android's back gesture goes back ----
  const [route, setRoute] = useState(() => parsePath(window.location.pathname));
  const routeRef = useRef(route);
  routeRef.current = route;
  const go = (next, { replace = false, instant = false, back = false } = {}) => {
    const path = pathFor(next);
    (instant ? (fn) => fn() : viewTransition)(() => {
      flushSync(() => setRoute({ dest: next.dest || routeRef.current.dest, id: next.id ?? null }));
      if (window.location.pathname !== path) window.history[replace ? 'replaceState' : 'pushState']({ rpb: true }, '', path);
    }, { back });
  };
  useEffect(() => {
    const onPop = () => {
      if (!window.location.pathname.startsWith(BASE)) return;
      const next = parsePath(window.location.pathname);
      const cur = routeRef.current;
      if (next.dest === cur.dest && next.id === cur.id) return;
      viewTransition(() => flushSync(() => setRoute(next)), { back: true });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    const was = document.title;
    document.title = 'Run planner';
    // an old -beta address becomes the planner's own
    if (window.location.pathname.startsWith('/ims/runplanner-beta')) window.history.replaceState(window.history.state, '', window.location.pathname.replace('/ims/runplanner-beta', '/ims/runplanner'));
    return () => { document.title = was; };
  }, []);
  const listScroll = useRef(null);
  const switchDest = (d) => {
    if (d === route.dest && !route.id) { listScroll.current?.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    // each screen starts at its top
    // (no liquid wipe here, 24 Oct, Simon: just the quick fade between screens)
    go({ dest: d }); listScroll.current?.scrollTo(0, 0);
  };
  const goHome = () => { window.history.pushState(null, '', '/ims'); setCurrentPath('/ims'); };

  // ---- routes: open one; plan one (it becomes the chosen route and Today opens) ----
  const openRoute = (r) => go({ dest: 'routes', id: r.id }, { replace: wide && Boolean(route.id) });
  const closeRoute = () => (window.history.state?.rpb && !wide ? window.history.back() : go({ dest: 'routes' }, { back: true }));
  const planRoute = (id) => {
    rp.setRouteId(String(id));
    go({ dest: 'today' });
  };
  const openRouteId = route.dest === 'routes' && route.id ? route.id : null;
  // a run looked back on (plan against reality), beside the Learning list on a wide screen
  const openRunId = route.dest === 'learning' && route.id ? route.id : null;
  const openRun = (id) => go({ dest: 'learning', id }, { replace: wide && Boolean(route.id) });
  const closeRun = () => (window.history.state?.rpb && !wide ? window.history.back() : go({ dest: 'learning' }, { back: true }));

  // ---- Send to my phone: the floating button in the bottom right of Today, as Homebrew's New button ----
  const phone = usePhone(rp.plan);
  const [adding, setAdding] = useState(false); // the Add a route sheet (the green button on Routes; the Komoot button)
  const [addHow, setAddHow] = useState('file');
  const openAdd = (how = 'file') => { setAddHow(how); setAdding(true); };
  const { down } = useScrollState(listScroll);
  const sendToPhone = async () => {
    try {
      const name = await phone.send();
      snack(`Sent. On your phone, tap Start run on "Ready when you are: ${name}" as you set off.`, { action: { label: 'Cancel it', onClick: async () => { await phone.cancel(); snack('Cancelled. Nothing more will come to your phone.'); } } });
    } catch (e) { snack(e.message, { error: true }); }
  };

  // ---- the frame ----
  const accountMenu = useMenu();
  const unitsMenu = useMenu();
  const [garminOpen, setGarminOpen] = useState(false);
  const canPrint = Boolean(rp.routeId || rp.plan?.plan);
  const print = () => printRunReport({ plan: rp.plan?.plan ? rp.plan : null, routeId: rp.routeId ? Number(rp.routeId) : null, units: rp.units });
  const avatar = <IconButton label="Your account and settings" onClick={accountMenu.show} aria-haspopup="menu"><span className="avatar">{initials(user?.name)}</span></IconButton>;
  const accountItems = [
    { label: rp.garmin?.connected ? 'Garmin: synced' : 'Connect Garmin', icon: 'watch', onClick: () => setGarminOpen(true) },
    { label: rp.komoot?.connected ? 'Komoot: connected' : 'Connect Komoot', icon: 'explore', onClick: () => openAdd('komoot') },
    { label: 'Save as PDF', icon: 'print', onClick: print, disabled: !canPrint },
    { label: theme === 'dark' ? 'Light theme' : 'Dark theme', icon: theme === 'dark' ? 'sun' : 'moon', onClick: onThemeToggle },
    !user?.guest && { label: 'IMS home', icon: 'home', onClick: goHome },
  ];
  const unitsChip = (
    <button type="button" className="chip sl rpb-units" onClick={unitsMenu.show} aria-haspopup="menu" aria-label="Distances in">
      {rp.units === 'mi' ? 'Miles' : 'Kilometres'}<Icon n="down" size={18} />
    </button>
  );
  const unitsItems = [['km', 'Kilometres'], ['mi', 'Miles']].map(([u, l]) => ({ label: l, icon: rp.units === u ? 'check' : 'blank', onClick: () => rp.setUnits(u) }));

  const selected = rp.routes.find((r) => String(r.id) === String(rp.routeId)) || null;
  const screen = () => {
    if (route.dest === 'today') return <Today rp={rp} phone={phone} selected={selected} dark={dark} onPickRoute={() => switchDest('routes')} onOpenRoute={(r) => go({ dest: 'routes', id: r.id })} />;
    if (route.dest === 'routes') return <Routes rp={rp} selectedId={openRouteId} onOpen={openRoute} compact={layout === 'compact'} />;
    if (route.dest === 'runs') return <Replay rp={rp} dark={dark} />;
    if (route.dest === 'learning') return <Learning rp={rp} openId={openRunId} onOpenRun={openRun} />;
    return <Rulebook rp={rp} />;
  };

  const showDetail = Boolean(openRouteId || openRunId);
  const showList = wide || !showDetail;
  const parkList = !showList;
  const listPane = (
    <div className={`pane list ${parkList ? 'parked' : ''}`} key="list" aria-hidden={parkList || undefined} inert={parkList || undefined}>
      <div className="scroll" ref={listScroll}>
        <div className="gutter brand-bar" style={{ paddingTop: 'max(12px, env(safe-area-inset-top, 0px))' }}>
          {isOwner && <IconButton icon="back" label="Back to the IMS dashboard" onClick={goHome} className="ims-back" />}
          <RunBrand />
          {layout === 'compact' && <div className="corner-acts">{avatar}</div>}
        </div>
        <div className="gutter rpb-titlebar">
          <h1 className="t-tl" style={{ flex: 1 }}>{TITLES[route.dest]}</h1>
          <button type="button" className={`chip sl rpb-sync ${rp.garmin?.connected ? 'on' : ''}`} onClick={() => setGarminOpen(true)} title={rp.garmin?.connected ? `Garmin synced${rp.garmin.latestDate ? ` (latest day ${rp.garmin.latestDate})` : ''}. Tap to sync or manage.` : 'Connect Garmin for sleep, body battery and readiness'}>
            <Icon n="watch" size={18} />{rp.garmin?.connected ? 'Garmin synced' : 'Connect Garmin'}{rp.garmin?.connected && <i className="live" />}
          </button>
          <button type="button" className={`chip sl rpb-sync ${rp.komoot?.connected ? 'on' : ''}`} onClick={() => openAdd('komoot')} title={rp.komoot?.connected ? `Komoot connected${rp.komoot.email ? ` (${rp.komoot.email})` : ''}. Tap to add a tour.` : 'Connect Komoot for your routes'}>
            <Icon n="explore" size={18} />{rp.komoot?.connected ? 'Komoot' : 'Connect Komoot'}{rp.komoot?.connected && <i className="live" />}
          </button>
          {unitsChip}
          {layout !== 'compact' && <Btn kind="tonal" icon="print" onClick={print} disabled={!canPrint}>Save as PDF</Btn>}
        </div>
        <div key={route.dest} className="fade-through-in">
          {rp.needsSignIn ? (
            <div className="gutter"><div className="rpb-card rpb-signin">
              <Icon n="person" size={32} />
              <p>Your glucose and insulin are only shown to your own signed-in Google account.</p>
              <Btn icon="open" onClick={rp.signIn}>Sign in with Google</Btn>
            </div></div>
          ) : rp.isLoading ? (
            <div className="gutter" style={{ display: 'grid', placeItems: 'center', padding: 48 }}><Spinner label="Loading the run planner" /></div>
          ) : screen()}
        </div>
      </div>
      {route.dest === 'routes' && !rp.needsSignIn && (
        <div className="fab-slot">
          <button type="button" className={`fab sl ${down ? 'small' : ''}`} onClick={() => openAdd('file')} aria-label="Add a route"><Icon n="add" /><span className="lbl">Add a route</span></button>
        </div>
      )}
      {route.dest === 'today' && rp.plan && !rp.needsSignIn && (
        <div className="fab-slot">
          <button type="button" className={`fab sl ${down ? 'small' : ''} ${phone.busy === 'send' ? 'busy' : ''}`} onClick={sendToPhone} disabled={phone.busy === 'send'}
            aria-label={phone.armed ? 'Send to my phone again' : 'Send to my phone'}>
            <Icon n={phone.busy === 'send' ? 'sync' : 'phone'} /><span className="lbl">{phone.armed ? 'Send again' : 'Send to my phone'}</span>
          </button>
        </div>
      )}
    </div>
  );
  const detailRoute = rp.routes.find((r) => r.id === openRouteId) || null;
  const detailPane = showDetail && (
    <div className="pane detail" key="detail">
      {openRunId ? <Retro key={openRunId} activityId={openRunId} rp={rp} dark={dark} backIcon={wide ? 'close' : 'back'} onBack={closeRun} />
        : <RouteDetail rp={rp} route={detailRoute} backIcon={wide ? 'close' : 'back'} onBack={closeRoute} onPlan={planRoute} dark={dark} />}
    </div>
  );

  return (
    <>
      {layout !== 'compact' && (
        <nav className="rail" aria-label="Run planner">
          {NAV.map(([d, l, ic]) => (
            <button key={d} type="button" className={`it sl ${route.dest === d ? 'on' : ''}`} onClick={() => switchDest(d)} aria-current={route.dest === d ? 'page' : undefined}>
              <span className="pill" style={{ position: 'relative' }}><Icon n={ic} />{d === 'rulebook' && rp.pendingFindingsCount > 0 && <span className="badge dot" />}</span>{l}
            </button>
          ))}
          <span className="grow" />
          <IconButton icon="watch" label={rp.garmin?.connected ? 'Garmin: synced' : 'Connect Garmin'} on={Boolean(rp.garmin?.connected)} onClick={() => setGarminOpen(true)} />
          <IconButton icon="explore" label={rp.komoot?.connected ? 'Komoot: connected' : 'Connect Komoot'} on={Boolean(rp.komoot?.connected)} onClick={() => openAdd('komoot')} />
          <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} label={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={onThemeToggle} />
          {avatar}
        </nav>
      )}
      <div className={`shell ${layout} ${wide ? 'wide' : ''} ${lg ? 'xwide' : ''} ${layout === 'medium' ? 'medium' : ''} ${route.dest === 'routes' ? 'rpb-split' : 'rpb-single'}`}>
        <div className="panes">
          {listPane}
          {detailPane}
        </div>
        {layout === 'compact' && !showDetail && (
          <nav className="navbar" aria-label="Run planner">
            {NAV.map(([d, l, ic]) => (
              <button key={d} type="button" className={`it ${route.dest === d ? 'on' : ''}`} onClick={() => switchDest(d)} aria-current={route.dest === d ? 'page' : undefined}>
                <span className="pill sl" style={{ position: 'relative' }}><Icon n={ic} />{d === 'rulebook' && rp.pendingFindingsCount > 0 && <span className="badge">{rp.pendingFindingsCount}</span>}</span>{l}
              </button>
            ))}
          </nav>
        )}
      </div>
      <Menu anchor={accountMenu.anchor} open={accountMenu.open} onClose={accountMenu.close} items={accountItems} />
      <Menu anchor={unitsMenu.anchor} open={unitsMenu.open} onClose={unitsMenu.close} items={unitsItems} />
      <GarminSheet open={garminOpen} onClose={() => setGarminOpen(false)} rp={rp} />
      <AddRoute open={adding} onClose={() => setAdding(false)} rp={rp} start={addHow} onAdded={(r) => go({ dest: 'routes', id: r.id })} />
    </>
  );
}


// Garmin Connect: the same connect, sync and disconnect as the classic page, as a sheet
function GarminSheet({ open, onClose, rp }) {
  const g = rp.garmin;
  const f = rp.garminForm;
  const set = (k) => (v) => rp.setGarminForm({ ...f, [k]: v });
  return (
    <Sheet open={open} onClose={onClose} title="Garmin Connect"
      footer={<div className="rpb-acts">{g?.connected
        ? <><Btn kind="text" onClick={rp.handleDisconnectGarmin} disabled={rp.garminBusy}>Disconnect</Btn><Btn icon="sync" busy={rp.garminBusy} onClick={rp.handleSyncGarmin}>Sync now</Btn></>
        : <><Btn kind="text" onClick={onClose}>Cancel</Btn><Btn icon="watch" busy={rp.garminBusy} onClick={(e) => rp.handleConnectGarmin(e)}>Connect</Btn></>}</div>}>
      {g?.connected ? (
        <div className="kv rpb-kv">
          <span><b>Account</b>{g.user || 'Linked'}</span>
          <span><b>Latest day</b>{g.latestDate || 'None yet'}</span>
          <span><b>Days synced</b>{g.dayRecordsCount || 0}</span>
          <p className="muted" style={{ margin: '8px 0 0' }}>Sleep, body battery, heart rate variability and training readiness come in each day and go into Today's verdict.</p>
        </div>
      ) : (
        <form onSubmit={rp.handleConnectGarmin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p className="muted" style={{ margin: 0 }}>Sign in once with your Garmin Connect account. The password is never logged or kept; a sign-in token is kept so you don't need to do it again.</p>
          <TextField label="Garmin email" type="email" value={f.email} onChange={set('email')} autoComplete="username" />
          <TextField label="Garmin password" type="password" value={f.password} onChange={set('password')} autoComplete="current-password" />
          {g?.mfaRequired && <TextField label="Code from Garmin's email or text" value={f.mfaCode} onChange={set('mfaCode')} inputMode="numeric" autoFocus />}
          <button type="submit" hidden />
        </form>
      )}
    </Sheet>
  );
}

export default function RunBeta({ theme = 'light', onThemeToggle, setCurrentPath }) {
  const root = useRef(null);
  const [rootNode, setRootNode] = useState(null);
  useRipples(root);
  const dark = theme === 'dark';
  const body = useMemo(() => rootNode && <App theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} />, [rootNode, theme, onThemeToggle, setCurrentPath]);
  return (
    <div className={`hbb rpb ${dark ? 'dark' : ''}`} ref={(el) => { root.current = el; if (el && el !== rootNode) setRootNode(el); }}>
      <DarkCtx.Provider value={dark}>
        <LayerProvider root={rootNode}>
          <SnackHost>
            {/* the planner's gauges as dials, and its charts at their real size (the classic page keeps its own) */}
            <TipHost><GaugeStyle.Provider value="dial"><ChartFit.Provider value>{body}</ChartFit.Provider></GaugeStyle.Provider></TipHost>
          </SnackHost>
        </LayerProvider>
      </DarkCtx.Provider>
    </div>
  );
}
