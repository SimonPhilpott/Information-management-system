// Homebrew - the homebrew service, Material Design 3, Android first, with a list-and-detail layout on a wide screen.
// At /ims/homebrew (22 Oct: built as a beta at /ims/homebrew-beta, it replaced the classic portal, which is retired;
// the old -beta addresses still open the same screens).
//   Phone (<600dp):    bottom navigation bar, one screen at a time, the FAB for New
//   Tablet (600-839):  navigation rail, one screen at a time
//   Desktop (>=840):   navigation rail, the shelf and the open brew side by side
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import './hbb.css';
import { useAuth } from '../../AuthGate';
import { famKey } from './brewData';
import { STANDALONE,
  BASE, parsePath, pathFor, api, EMPTY_FILTERS, nextJobs, moveBrew, pitchReminders, ACTIVE,
} from './logic';
import { STATUS_WORD } from './brewData';
import {
  Icon, IconButton, useMedia, useRipples, viewTransition, liquidWipe, LayerProvider, SnackHost, useSnack, TipHost, Menu, useMenu, Confirm, useScrollState, DarkCtx,
} from './ui';
import Shelf from './Shelf';
import InviteSheet from './Invite';
import Calculators, { ToolSheet } from './Calculators';
import { Brand } from './brand';
import Find from './Find';
import BrewPage from './BrewPage';
import BrewForm from './BrewForm';
import Admin from './Admin';

const NAV = [['brews', 'My brews', 'flask'], ['recipes', 'Recipe book', 'book'], ['find', 'Find', 'leaf'], ['favourites', 'Favourites', 'favo'], ['tools', 'Tools', 'calc']];
const readSort = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const keepSort = (k, v) => { try { localStorage.setItem(k, v); } catch { /* fine */ } };
const initials = (name) => String(name || 'Simon Philpott').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function App({ theme, onThemeToggle, setCurrentPath, rootEl }) {
  const { user } = useAuth();
  const isOwner = !user?.guest;
  const snack = useSnack();
  const sm = useMedia('(min-width: 600px)');
  const md = useMedia('(min-width: 840px)');
  const lg = useMedia('(min-width: 1200px)');
  const layout = lg ? 'xwide' : md ? 'wide' : sm ? 'medium' : 'compact';
  const wide = md;

  // ---- where we are ----
  const [route, setRoute] = useState(() => parsePath(window.location.pathname));
  const [listDest, setListDest] = useState(() => parsePath(window.location.pathname).dest);
  const routeRef = useRef(route);
  routeRef.current = route;

  // ---- the data ----
  const [brews, setBrews] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [meta, setMeta] = useState({ categories: [], styles: [], statuses: [], logKinds: [] });
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState({}); // id -> the full brew (logs, tastings)
  const loadList = useCallback(async () => {
    try {
      const d = await api('/api/homebrew');
      setBrews(d.brews || []); setRecipes(d.recipes || []);
      setMeta({ categories: d.categories || [], styles: d.styles || [], statuses: d.statuses || [], logKinds: d.logKinds || [] });
      setLoading(false);
      // every brew in full (there are only a few): the logs give Next up and how lively each ferment is
      const full = await Promise.all((d.brews || []).map((b) => api(`/api/homebrew/${b.id}`).then((x) => x.brew).catch(() => null)));
      setDetails((m) => { const n = { ...m }; full.filter(Boolean).forEach((b) => { n[b.id] = b; }); return n; });
    } catch (e) { setLoading(false); snack(e.message, { error: true }); }
  }, [snack]);
  useEffect(() => { loadList(); }, [loadList]);
  const loadItem = useCallback(async (id) => {
    try { const d = await api(`/api/homebrew/${id}`); setDetails((m) => ({ ...m, [id]: d.brew })); return d.brew; } catch (e) { snack(e.message, { error: true }); return null; }
  }, [snack]);
  useEffect(() => { if (route.id) loadItem(route.id); }, [route.id, loadItem]);

  const listItem = (id) => brews.find((b) => b.id === id) || recipes.find((b) => b.id === id) || null;
  const item = route.id ? details[route.id] || listItem(route.id) : null;
  const brewsFull = brews.map((b) => (details[b.id] ? { ...b, ...details[b.id] } : b));
  // what's next to do: your own brews only
  const jobs = useMemo(() => nextJobs(brewsFull.filter((b) => b.mine !== false && (ACTIVE.includes(b.status) || b.status === 'bottled'))), [brews, details]); // eslint-disable-line react-hooks/exhaustive-deps
  const catLabel = useCallback((id) => (meta.categories.find((c) => c.id === id) || {}).label || '', [meta.categories]);
  const family = item?.isRecipe ? recipes.filter((r) => famKey(r) === famKey(item)) : [];

  // ---- filters, sort and the finder's words, per shelf ----
  const [filters, setFiltersAll] = useState({ brews: EMPTY_FILTERS, recipes: EMPTY_FILTERS, favourites: EMPTY_FILTERS });
  const [sorts, setSorts] = useState({ brews: readSort('hbb_sort_brews', 'started-desc'), recipes: readSort('hbb_sort_recipes', 'name-asc'), favourites: 'name-asc' });
  const [words, setWords] = useState([]);
  const shelfDest = listDest === 'find' ? 'recipes' : listDest;
  const setFilters = (f) => setFiltersAll((all) => ({ ...all, [shelfDest]: f }));
  const setSort = (v) => { setSorts((s) => ({ ...s, [shelfDest]: v })); keepSort(`hbb_sort_${shelfDest}`, v); };

  // ---- moving about: every screen has an address; Android's back gesture goes back ----
  const listScroll = useRef(null);
  const detailArt = useRef(null);
  const go = (next, { replace = false, from = null, to = null, back = false, instant = false } = {}) => {
    const path = pathFor(next);
    // instant: no page transition of its own (the liquid wipe is covering the screen)
    (instant ? (fn) => fn() : viewTransition)(() => {
      flushSync(() => {
        setRoute({ dest: next.dest || routeRef.current.dest, id: next.item?.id ?? null, edit: Boolean(next.edit), create: next.create || null });
        if (!next.item && !next.create && next.dest) setListDest(next.dest);
      });
      if (window.location.pathname !== path) window.history[replace ? 'replaceState' : 'pushState']({ hbb: true }, '', path);
    }, { from, to, back });
  };
  const findCardArt = (id) => () => [...(rootEl.current?.querySelectorAll('[data-art]') || [])].find((el) => el.dataset.art.split(' ').includes(String(id)) && el.getBoundingClientRect().height > 0) || null;
  const findHeroArt = () => () => rootEl.current?.querySelector('.pane.detail .hero .stage') || null;
  useEffect(() => {
    const onPop = () => {
      const next = parsePath(window.location.pathname);
      if (!window.location.pathname.startsWith(BASE)) return;
      const cur = routeRef.current;
      if (next.dest === cur.dest && next.id === cur.id && next.edit === cur.edit && next.create === cur.create) return; // an overlay closing
      const leavingId = cur.id;
      viewTransition(() => {
        flushSync(() => { setRoute(next); if (!next.id && !next.create) setListDest(next.dest); });
      }, { back: true, from: leavingId && !next.id ? rootEl.current?.querySelector('.pane.detail .hero .stage') : null, to: leavingId ? findCardArt(leavingId) : null });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const was = document.title;
    document.title = 'Homebrew (beta)';
    return () => { document.title = was; };
  }, []);

  const openItem = (b, artEl, { replace = false } = {}) => {
    if (!b) return;
    go({ dest: b.isRecipe ? 'recipes' : 'brews', item: b }, { replace: replace || (wide && Boolean(route.id)), from: artEl, to: findHeroArt() });
  };
  const closeDetail = () => {
    const leaving = route.id;
    if (window.history.state?.hbb && !wide) { window.history.back(); return; }
    go({ dest: listDest }, { back: true, from: rootEl.current?.querySelector('.pane.detail .hero .stage'), to: leaving ? findCardArt(leaving) : null });
  };
  const switchDest = (d) => {
    if (d === listDest && !route.id && !route.create) { listScroll.current?.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    // between the main screens, the liquid wipe flows towards the one you're going to (on trial, 23 Oct)
    const order = [...NAV.map(([k]) => k), 'admin'];
    liquidWipe(() => go({ dest: d }, { instant: true }), { dir: order.indexOf(d) >= order.indexOf(listDest) ? 1 : -1 });
  };
  const newItem = () => go({ create: listDest === 'recipes' || listDest === 'find' ? 'recipe' : 'brew', dest: listDest });
  const goHome = () => { window.history.pushState(null, '', '/ims'); setCurrentPath('/ims'); };

  // ---- changes ----
  const putItem = (nb) => {
    if (!nb) return;
    setDetails((m) => ({ ...m, [nb.id]: { ...(m[nb.id] || {}), ...nb } }));
    const merge = (l) => l.map((x) => (x.id === nb.id ? { ...x, ...Object.fromEntries(Object.entries(nb).filter(([k]) => k !== 'logs' && k !== 'tastings')) } : x));
    setBrews(merge); setRecipes(merge);
  };
  const toggleFav = async (b) => {
    const on = !b.favourite;
    putItem({ ...b, favourite: on });
    try {
      await api(`/api/homebrew/${b.id}/favourite`, 'POST', { favourite: on });
      snack(on ? `Added ${b.name} to favourites.` : `Removed ${b.name} from favourites.`, {
        action: { label: 'Undo', onClick: async () => { putItem({ ...b, favourite: !on }); await api(`/api/homebrew/${b.id}/favourite`, 'POST', { favourite: !on }).catch(() => {}); } },
      });
    } catch (e) { putItem({ ...b, favourite: !on }); snack(e.message, { error: true }); }
  };
  const [request, setRequest] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const runJob = (job) => {
    const b = job.brew;
    if (job.kind === 'log' || job.kind === 'taste') {
      openItem(b, null);
      setTimeout(() => setRequest({ id: b.id, kind: job.kind, at: Date.now() }), 60);
      return;
    }
    if (job.kind === 'move') {
      setConfirm({
        title: `Move ${b.name} to ${STATUS_WORD[job.to]}?`, body: 'The move goes in the log, so you can see when it happened.', okLabel: 'Move it',
        onOk: async () => {
          try {
            const from = b.status;
            const nb = await moveBrew(b, job.to);
            putItem(nb); await loadList();
            if (from === 'planning') snack(`${b.name} has started.`, { action: { label: 'Set reminders', onClick: async () => { const r = await pitchReminders(nb); snack(`Nutrient reminders set${r.steps ? `, and ${r.steps} for the steps to come` : ''}.`); } } });
            else snack(`${b.name}: ${STATUS_WORD[job.to].toLowerCase()}.`, { action: { label: 'Undo', onClick: async () => { putItem(await moveBrew(nb, from)); loadList(); } } });
          } catch (e) { snack(e.message, { error: true }); }
        },
      });
      return;
    }
    openItem(b, null);
  };

  // ---- the frame ----
  const { down } = useScrollState(listScroll);
  const accountMenu = useMenu();
  const [inviting, setInviting] = useState(false);
  // a brewing tool opened from a brew (its stage's tools, or Next up), filled in with that brew's numbers
  const [tool, setTool] = useState(null);
  const openTool = (id, brew) => setTool({ id, brew });
  const showDetail = Boolean(route.id || route.create || route.edit);
  const showList = wide || !showDetail;
  const fabLabel = listDest === 'recipes' ? 'New recipe' : 'New brew';
  const destTitle = { brews: 'My brews', recipes: 'Recipe book', find: 'Find by ingredient', favourites: 'Favourites', tools: 'Brewing tools', admin: 'Ingredient pictures' }[listDest];
  const avatar = <IconButton label="Your account and settings" onClick={accountMenu.show} aria-haspopup="menu"><span className="avatar">{initials(user?.name)}</span></IconButton>;
  const accountItems = [
    isOwner && { label: 'Ingredient pictures (admin)', icon: 'admin', onClick: () => switchDest('admin') },
    { label: theme === 'dark' ? 'Light theme' : 'Dark theme', icon: theme === 'dark' ? 'sun' : 'moon', onClick: onThemeToggle },
    isOwner && { label: 'Invite someone', icon: 'share', onClick: () => setInviting(true) },
    !user?.guest && !STANDALONE && { label: 'IMS home', icon: 'home', onClick: goHome },
  ];
  const hrefFor = (b) => pathFor({ item: b });

  // On a phone the list stays in place behind an open recipe (parked, hidden), so coming back finds it where you left
  // it - scrolled to the same card, with as many cards loaded - instead of rebuilt from the top
  const parkList = !showList;
  const listPane = (
    <div className={`pane list ${parkList ? 'parked' : ''}`} key="list" aria-hidden={parkList || undefined} inert={parkList || undefined}>
      <div className="scroll" ref={listScroll}>
        <div className="gutter brand-bar" style={{ paddingTop: 'max(12px, env(safe-area-inset-top, 0px))' }}>
          {/* back to the IMS dashboard - for Simon only (not guests, and not in the standalone app) */}
          {isOwner && !STANDALONE && <IconButton icon="back" label="Back to the IMS dashboard" onClick={goHome} className="ims-back" />}
          <Brand />
          {/* on a phone: your account top right, and the ingredient pictures admin (Simon only) beneath it */}
          {layout === 'compact' && (
            <div className="corner-acts">
              {avatar}
              {isOwner && <IconButton icon="admin" label="Ingredient pictures (admin)" on={listDest === 'admin'} onClick={() => switchDest('admin')} />}
            </div>
          )}
        </div>
        <div className="gutter" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h1 className="t-tl" style={{ flex: 1 }}>{destTitle}</h1>
        </div>
        <div key={listDest} className="fade-through-in">
          {listDest === 'tools' ? (
            <Calculators recipes={recipes} brews={brewsFull} headerEnd={null} />
          ) : listDest === 'admin' ? (
            <Admin headerEnd={null} onDataChanged={loadList} />
          ) : listDest === 'find' ? (
            <Find recipes={recipes} words={words} setWords={setWords} selectedId={route.id} onOpen={openItem} onFav={toggleFav} catLabel={catLabel} hrefFor={hrefFor} headerEnd={null} scrollRef={listScroll} />
          ) : (
            <Shelf dest={listDest} brews={brewsFull} recipes={recipes} loading={loading} categories={meta.categories} catLabel={catLabel} onTool={openTool}
              filters={filters[shelfDest]} setFilters={setFilters} sort={sorts[shelfDest]} setSort={setSort} selectedId={route.id}
              onOpen={openItem} onFav={toggleFav} onNew={newItem} jobs={jobs} onJob={runJob} hrefFor={hrefFor} scrollRef={listScroll}
              headerEnd={null} compact={layout === 'compact'} isOwner={isOwner} />
          )}
        </div>
      </div>
      {layout === 'compact' && (isOwner || listDest === 'brews') && listDest !== 'find' && listDest !== 'admin' && listDest !== 'tools' && (
        <div className="fab-slot"><button type="button" className={`fab sl ${down ? 'small' : ''}`} onClick={newItem} aria-label={fabLabel}><Icon n="add" /><span className="lbl">{fabLabel}</span></button></div>
      )}
    </div>
  );
  const detailPane = showDetail && (
    <div className="pane detail" key="detail">
      {route.create || route.edit ? (
        <BrewForm key={route.create || `edit${route.id}`} item={route.edit ? item : null} kind={route.create} meta={meta} layout={layout}
          onCancel={() => (route.edit ? (window.history.state?.hbb ? window.history.back() : go({ item }, { replace: true })) : closeDetail())}
          onSaved={(nb) => {
            putItem(nb); loadList();
            if (route.edit && window.history.state?.hbb) window.history.back();
            else go({ dest: nb.isRecipe ? 'recipes' : 'brews', item: nb }, { replace: true });
          }}
          onDeleted={() => { loadList(); go({ dest: listDest }, { replace: true }); }} />
      ) : (
        <BrewPage item={item} layout={layout} isOwner={isOwner} catLabel={catLabel} family={family} kinds={meta.logKinds} onTool={openTool}
          backIcon={wide ? 'close' : 'back'} onBack={closeDetail} onEdit={() => go({ item, edit: true })} onEditOther={(it) => go({ item: it, edit: true })} onOpen={openItem}
          onChanged={putItem} onListChanged={loadList} onDeleted={() => go({ dest: listDest }, { replace: true })} onFav={toggleFav}
          request={request} artRef={detailArt} hrefFor={hrefFor} />
      )}
    </div>
  );

  return (
    <>
      {layout !== 'compact' && (
        <nav className="rail" aria-label="Homebrew">
          {(isOwner || listDest === 'brews') && <button type="button" className="fab sl" onClick={newItem} aria-label={fabLabel} title={fabLabel}><Icon n="add" /></button>}
          {NAV.map(([d, l, ic]) => (
            <button key={d} type="button" className={`it sl ${listDest === d ? 'on' : ''}`} onClick={() => switchDest(d)} aria-current={listDest === d ? 'page' : undefined}>
              <span className="pill" style={{ position: 'relative' }}><Icon n={listDest === d && ic === 'favo' ? 'fav' : ic} />{d === 'brews' && jobs.length > 0 && <span className="badge dot" />}</span>{l}
            </button>
          ))}
          <span className="grow" />
          {isOwner && <IconButton icon="admin" label="Ingredient pictures (admin)" on={listDest === 'admin'} onClick={() => switchDest('admin')} />}
          <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} label={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={onThemeToggle} />
          {avatar}
        </nav>
      )}
      <div className={`shell ${layout} ${wide ? 'wide' : ''} ${lg ? 'xwide' : ''} ${layout === 'medium' ? 'medium' : ''}`}>
        <div className="panes">
          {listPane}
          {detailPane}
        </div>
        {layout === 'compact' && !showDetail && (
          <nav className="navbar" aria-label="Homebrew">
            {NAV.map(([d, l, ic]) => (
              <button key={d} type="button" className={`it ${listDest === d ? 'on' : ''}`} onClick={() => switchDest(d)} aria-current={listDest === d ? 'page' : undefined}>
                <span className="pill sl" style={{ position: 'relative' }}><Icon n={listDest === d && ic === 'favo' ? 'fav' : ic} />{d === 'brews' && jobs.length > 0 && <span className="badge">{jobs.length}</span>}</span>{l}
              </button>
            ))}
          </nav>
        )}
      </div>
      <Menu anchor={accountMenu.anchor} open={accountMenu.open} onClose={accountMenu.close} items={accountItems} />
      <InviteSheet open={inviting} onClose={() => setInviting(false)} />
      <ToolSheet id={tool?.id} brew={tool?.brew} recipes={recipes} brews={brewsFull} onClose={() => setTool(null)} />
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
    </>
  );
}

export default function HomebrewBeta({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const root = useRef(null);
  const [rootNode, setRootNode] = useState(null);
  useRipples(root);
  const dark = theme === 'dark';
  return (
    <div className={`hbb ${dark ? 'dark' : ''}`} ref={(el) => { root.current = el; if (el && el !== rootNode) setRootNode(el); }}>
      <DarkCtx.Provider value={dark}>
        <LayerProvider root={rootNode}>
          <SnackHost>
            <TipHost>
              {rootNode && <App theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} rootEl={root} />}
            </TipHost>
          </SnackHost>
        </LayerProvider>
      </DarkCtx.Provider>
    </div>
  );
}
