// Board Games in the IMS design (24 Oct 2026): your BoardGameGeek collection as box-art cards. Filter by players, play
// time, theme, solo and favourites; open a game for its expansions (tick the ones you own), selling (with eBay's sold
// prices) and removing. BoardGameGeek's settings, refresh and box art are in a fold; the list of additions to copy
// back to BGG is a sheet. Add a game is the button in the bottom right. The same /api/boardgames requests as before
// (Dashboard/BoardgamesPortal.jsx).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ServicePage, { Empty, Fab } from './ServicePage';
import { Icon, IconButton, Btn, Sheet, TextField, SelectField, FilterChip, Segmented, Confirm, useSnack, Spinner } from '../HomebrewBeta/ui';

// BoardGameGeek names arrive with HTML entities (&#039;, &amp;, &eacute;)
function decode(str) {
  if (typeof str !== 'string') return str || '';
  return str.replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c))).replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&eacute;/g, 'é').replace(/&Eacute;/g, 'É').replace(/&nbsp;/g, ' ');
}
const ebaySold = (name) => `https://www.ebay.co.uk/sch/i.html?_nkw=${encodeURIComponent(decode(name))}&LH_Sold=1&LH_Complete=1&LH_PrefLoc=1&_sop=13`;
const playTime = (g) => (g.minTime && g.maxTime && g.minTime !== g.maxTime ? `${g.minTime} to ${g.maxTime} min` : g.playingTime ? `${g.playingTime} min` : null);
const PLAYERS = [[0, 'Any'], [1, '1 player'], [2, '2 players'], [3, '3 players'], [4, '4 players'], [5, '5 players'], [6, '6 or more']];
const TIMES = [[0, 'Any'], [30, 'Up to 30 min'], [45, 'Up to 45 min'], [60, 'Up to 1 hour'], [90, 'Up to 1.5 hours'], [120, 'Up to 2 hours'], [180, 'Up to 3 hours'], [999, 'Over 3 hours']];

function Art({ src, name, size = 'm' }) {
  return src ? <img className={`imsm-art ${size}`} src={src} alt="" loading="lazy" title={name} /> : <span className={`imsm-art ${size} none`}><Icon n="dice" size={size === 's' ? 16 : 28} /></span>;
}

// selling: a tick, and once ticked a link to recent eBay UK sold listings
function Sell({ item, onSell }) {
  return (
    <span className="imsm-sell">
      <FilterChip on={Boolean(item.wantToSell)} onClick={() => onSell(item.id, !item.wantToSell)}>To sell</FilterChip>
      {item.wantToSell && <a className="btn text sl" href={ebaySold(item.name)} target="_blank" rel="noreferrer" title={`Recent sold listings for “${decode(item.name)}” on eBay UK`}><Icon n="open" size={18} />eBay sold</a>}
    </span>
  );
}

function Body({ go }) {
  const snack = useSnack();
  const [data, setData] = useState(null);
  const [config, setConfig] = useState({ username: 'Sideburnt', hasToken: false });
  const [status, setStatus] = useState({ state: 'idle' });
  const [art, setArt] = useState({ state: 'idle' });
  const [draftUser, setDraftUser] = useState('');
  const [draftToken, setDraftToken] = useState('');
  const [q, setQ] = useState('');
  const [f, setF] = useState({ sell: false, fav: false, solo: false, players: 0, time: 0, theme: '' });
  const [openId, setOpenId] = useState(null);
  const [updates, setUpdates] = useState(null); // filter text while the sheet is open
  const [add, setAdd] = useState(null); // { mode, query, results, searching, picked, loading, owned:Set, draft }
  const [confirm, setConfirm] = useState(null);
  const err = useCallback((m) => snack(m, { error: true }), [snack]);
  const poll = useRef(null);
  const wasRunning = useRef(false);

  const load = useCallback(async () => {
    try {
      const d = await (await fetch('/api/boardgames')).json();
      if (!d.success) throw new Error(d.error || 'The collection couldn\'t be loaded.');
      setData({ games: d.games, orphans: d.orphanExpansions, fetchedAt: d.fetchedAt, source: d.source, updates: d.updates || [], details: d.details || null, removed: d.removed || [] });
      setConfig(d.config); setStatus(d.status); if (d.backfillStatus) setArt(d.backfillStatus);
      setDraftUser((p) => p || d.config.username);
    } catch (e) { setData((x) => x || { games: [], orphans: [], updates: [], removed: [] }); err(e.message); }
  }, [err]);
  useEffect(() => { load(); }, [load]);
  const running = status.state === 'running', artRunning = art.state === 'running';
  useEffect(() => {
    if (running || artRunning) { wasRunning.current = true; poll.current = setInterval(load, 3000); return () => clearInterval(poll.current); }
    if (wasRunning.current) { wasRunning.current = false; load(); }
    return undefined;
  }, [running, artRunning, load]);
  // games still missing players, play time or themes: fetched from BGG in the background
  const kicked = useRef(false);
  useEffect(() => {
    if (kicked.current || !data?.details?.missing || !config.hasToken) return undefined;
    kicked.current = true;
    fetch('/api/boardgames/details/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    const t = setInterval(async () => { try { const st = await (await fetch('/api/boardgames/details/status')).json(); if (!st.running) { clearInterval(t); load(); } } catch { clearInterval(t); } }, 4000);
    return () => clearInterval(t);
  }, [data?.details?.missing, config.hasToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const call = async (url, opts, word) => {
    const r = await fetch(url, opts); const d = await r.json().catch(() => ({}));
    if (!r.ok || d.success === false) throw new Error(d.error || 'It didn\'t work.');
    if (word) snack(word);
    return d;
  };
  const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const saveConfig = async () => { try { const d = await call('/api/boardgames/config', json('PUT', { username: draftUser, token: draftToken }), 'BoardGameGeek settings saved.'); setConfig(d.config); setDraftToken(''); } catch (e) { err(e.message); } };
  const refresh = async () => { try { await call('/api/boardgames/refresh', { method: 'POST' }); setStatus({ state: 'running', phase: 'Starting', done: 0, total: 0 }); } catch (e) { err(e.message); } };
  const syncArt = async () => { try { const d = await call('/api/boardgames/backfill-thumbnails', { method: 'POST' }); setArt({ state: 'running', phase: 'Fetching expansion box art', done: 0, total: d.total || 0 }); snack(`Fetching box art for ${d.total} expansions.`); } catch (e) { err(e.message); } };
  const importCsv = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try { const d = await call('/api/boardgames/import-csv', { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: await file.text() }); snack(`Imported ${d.games} games and ${d.expansions} expansions.`); load(); } catch (x) { err(x.message); }
  };
  const flagAll = (id, key, val) => setData((p) => {
    const flag = (x) => (x.id === id ? { ...x, [key]: val } : x);
    return { ...p, games: p.games.map((g) => ({ ...flag(g), expansions: (g.expansions || []).map(flag) })), orphans: p.orphans.map(flag) };
  });
  const setSell = async (id, v) => { flagAll(id, 'wantToSell', v); try { await call('/api/boardgames/sell', json('PUT', { id, wantToSell: v })); } catch (e) { flagAll(id, 'wantToSell', !v); err(e.message); } };
  const setFav = async (g, v) => { flagAll(g.id, 'favourite', v); try { await call('/api/boardgames/favourite', json('PUT', { id: g.id, favourite: v }), v ? `“${decode(g.name)}” is a favourite.` : `“${decode(g.name)}” is no longer a favourite.`); } catch (e) { flagAll(g.id, 'favourite', !v); err(e.message); } };
  const own = async (id, owned) => { try { await call(`/api/boardgames/expansions/${id}/own`, json('PUT', { owned }), owned ? 'Marked as owned.' : 'No longer owned.'); load(); } catch (e) { err(e.message); } };
  const remove = (item) => setConfirm({ title: `Remove ${decode(item.name)}?`, body: 'You can bring it back from the removed list.', okLabel: 'Remove', danger: true, onOk: async () => { try { await call(`/api/boardgames/games/${item.id}`, { method: 'DELETE' }, 'Removed from your collection.'); if (openId === item.id) setOpenId(null); load(); } catch (e) { err(e.message); } } });
  const restore = async (id) => { try { await call(`/api/boardgames/games/${id}/restore`, { method: 'POST' }, 'Back in your collection.'); load(); } catch (e) { err(e.message); } };

  const searchBgg = async () => {
    const query = add.query.trim(); if (!query) return;
    setAdd((a) => ({ ...a, searching: true }));
    try { const d = await call(`/api/boardgames/search?query=${encodeURIComponent(query)}`); setAdd((a) => ({ ...a, results: d.results || [], searching: false })); } catch (e) { err(e.message); setAdd((a) => ({ ...a, searching: false })); }
  };
  const pickBgg = async (item) => {
    setAdd((a) => ({ ...a, loading: true }));
    try { const d = await call(`/api/boardgames/bgg-details/${item.id}`); setAdd((a) => ({ ...a, picked: d.details, owned: new Set(), loading: false })); } catch (e) { err(e.message); setAdd((a) => ({ ...a, loading: false })); }
  };
  const saveBgg = async () => {
    const p = add.picked;
    try {
      await call('/api/boardgames/add-with-expansions', json('POST', { bggId: p.id, name: p.name, year: p.year, thumbnail: p.thumbnail, ownedExpansionIds: [...add.owned] }), `Added ${decode(p.name)} with ${add.owned.size} expansion${add.owned.size === 1 ? '' : 's'}.`);
      setAdd(null); load();
    } catch (e) { err(e.message); }
  };
  const saveManual = async () => {
    const dg = add.draft;
    try { const d = await call('/api/boardgames/games', json('POST', { ...dg, parentId: dg.parentId ? Number(dg.parentId) : null })); snack(`Added ${decode(d.game.name)}.`); setAdd(null); load(); } catch (e) { err(e.message); }
  };

  const games = data?.games || [];
  const needle = q.trim().toLowerCase();
  const matches = (g) => {
    if (f.sell && !(g.wantToSell || (g.expansions || []).some((e) => e.wantToSell))) return false;
    if (f.fav && !g.favourite) return false;
    if (f.solo && !g.solo) return false;
    if (f.players) {
      if (f.players === 1) { if (!g.solo && g.minPlayers !== 1 && g.communityMinPlayers !== 1) return false; }
      else { if (!g.minPlayers) return false; const hi = g.maxPlayers || g.minPlayers; if (f.players === 6 ? hi < 6 : (f.players < g.minPlayers || f.players > hi)) return false; }
    }
    if (f.time) { const t = g.playingTime || g.maxTime; if (!t) return false; if (f.time === 999 ? t <= 180 : t > f.time) return false; }
    if (f.theme && !(g.categories || []).includes(f.theme)) return false;
    if (!needle) return true;
    return decode(g.name).toLowerCase().includes(needle) || (g.expansions || []).some((e) => decode(e.name).toLowerCase().includes(needle));
  };
  const visible = games.filter(matches);
  const themes = useMemo(() => Object.entries(games.reduce((acc, g) => { for (const c of g.categories || []) if (c !== 'Print & Play') acc[c] = (acc[c] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])), [games]);
  const sellCount = games.filter((g) => g.wantToSell).length + games.reduce((n, g) => n + (g.expansions || []).filter((e) => e.wantToSell).length, 0);
  const favCount = games.filter((g) => g.favourite).length;
  const anyFilter = f.fav || f.solo || f.players || f.time || f.theme || f.sell;
  const openGame = games.find((g) => g.id === openId);

  if (!data) return <div className="imsm-empty"><Spinner /></div>;
  const pct = status.total ? Math.round((status.done / status.total) * 100) : 5;
  return (
    <>
      {(running || artRunning) && (
        <div className="imsm-banner info"><Spinner size={20} /><span><b>{running ? status.phase : art.phase || 'Fetching expansion box art'}</b>{(running ? status.total : art.total) > 0 && ` · ${running ? status.done : art.done} of ${running ? status.total : art.total}`}<span className="imsm-prog"><i style={{ width: `${running ? pct : art.total ? (art.done / art.total) * 100 : 5}%` }} /></span></span></div>
      )}
      <details className="imsm-fold">
        <summary><Icon n="dice" size={20} /><span>BoardGameGeek <span className={`tag ${config.hasToken ? 'good' : 'warn'}`} style={{ marginLeft: 6 }}>{config.hasToken ? 'Connected' : 'Needs a token'}</span></span><Icon n="down" size={22} /></summary>
        <div className="imsm-form" style={{ padding: '0 16px 16px' }}>
          <p className="muted" style={{ margin: 0 }}>{data.fetchedAt ? `${data.source === 'csv' ? 'Loaded from a collection CSV' : 'Last refreshed'} ${new Date(data.fetchedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.` : 'Not fetched yet.'}{status.state === 'error' ? ` The last refresh failed: ${status.error}` : ''}{art.state === 'error' ? ` Box art failed: ${art.error}` : ''}</p>
          {!config.hasToken && <p style={{ margin: 0 }}>BoardGameGeek needs an application token for its data. Register one at <a href="https://boardgamegeek.com/applications" target="_blank" rel="noreferrer">boardgamegeek.com/applications</a>, then paste it here. It's kept on the IMS server and never shown again.</p>}
          <div className="two">
            <TextField label="BoardGameGeek username" value={draftUser} onChange={setDraftUser} />
            <TextField label={config.hasToken ? 'New token (optional)' : 'Token'} type="password" autoComplete="off" value={draftToken} onChange={setDraftToken} />
          </div>
          <div className="imsm-row">
            <Btn kind="tonal" icon="check" onClick={saveConfig}>Save</Btn>
            <Btn kind="tonal" icon="sync" busy={running} disabled={running || artRunning || !config.hasToken} onClick={refresh}>Refresh from BGG</Btn>
            <Btn kind="text" icon="image" disabled={running || artRunning || !config.hasToken} onClick={syncArt}>Fetch missing box art</Btn>
            <label className="btn text sl icon" style={{ cursor: 'pointer' }}><Icon n="upload" />Import a collection CSV<input type="file" accept=".csv,text/csv" hidden onChange={importCsv} /></label>
          </div>
        </div>
      </details>

      <div className="imsm-hubsearch"><Icon n="search" size={22} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a game or expansion" aria-label="Find a game or expansion" />{q && <button type="button" className="sl" aria-label="Clear the search" onClick={() => setQ('')}><Icon n="close" size={20} /></button>}</div>
      <div className="imsm-bgf">
        <FilterChip on={f.fav} onClick={() => setF({ ...f, fav: !f.fav })} lead={<Icon n="fav" size={18} />}>Favourites ({favCount})</FilterChip>
        <FilterChip on={f.solo} onClick={() => setF({ ...f, solo: !f.solo })} lead={<Icon n="person" size={18} />}>Solo</FilterChip>
        <FilterChip on={f.sell} onClick={() => setF({ ...f, sell: !f.sell })} lead={<Icon n="money" size={18} />}>To sell ({sellCount})</FilterChip>
        <SelectField label="Players" value={f.players} onChange={(v) => setF({ ...f, players: Number(v) })} options={PLAYERS} />
        <SelectField label="Play time" value={f.time} onChange={(v) => setF({ ...f, time: Number(v) })} options={TIMES} />
        <SelectField label="Theme" value={f.theme} onChange={(v) => setF({ ...f, theme: v })} options={[['', 'Any'], ...themes.map(([t, n]) => [t, `${t} (${n})`])]} />
      </div>
      <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
        <span className="muted">{visible.length} of {games.length} games{anyFilter ? '' : ''}{data.details?.running || (data.details?.missing > 0 && config.hasToken) ? ` · fetching players and play times${data.details?.total ? ` (${data.details.done} of ${data.details.total})` : ''}` : ''}</span>
        <span className="imsm-row">
          {anyFilter ? <Btn kind="text" icon="close" onClick={() => setF({ sell: false, fav: false, solo: false, players: 0, time: 0, theme: '' })}>Clear the filters</Btn> : null}
          <Btn kind="text" icon="list" onClick={() => setUpdates('')}>To add on BGG{data.updates.length ? ` (${data.updates.length})` : ''}</Btn>
        </span>
      </div>

      {!games.length ? <Empty icon="dice" title="No games yet">{config.hasToken ? 'Refresh from BoardGameGeek, or add one with the button in the corner.' : 'Add your BoardGameGeek token above, or add games yourself.'}</Empty>
        : !visible.length ? <Empty icon="search" title="Nothing matches" />
        : (
          <div className="imsm-games">
            {visible.map((g) => {
              const owned = (g.expansions || []).filter((e) => e.owned).length;
              return (
                <div key={g.id} className={`imsm-game sl ${g.wantToSell ? 'selling' : ''}`} role="button" tabIndex={0} onClick={() => setOpenId(g.id)} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) setOpenId(g.id); }}>
                  <Art src={g.thumbnail} name={decode(g.name)} />
                  <span className="txt">
                    <b>{decode(g.name)}{g.year ? <span className="muted"> ({g.year})</span> : null}</b>
                    <span className="meta">
                      {g.players && <span><Icon n="people" size={15} />{g.players}</span>}
                      {playTime(g) && <span><Icon n="timer" size={15} />{playTime(g)}</span>}
                      {g.solo && <span className="solo"><Icon n="person" size={15} />Solo</span>}
                    </span>
                    {(g.categories || []).length > 0 && <span className="cats">{g.categories.filter((c) => c !== 'Print & Play').slice(0, 3).join(' · ')}</span>}
                    <span className="tags">
                      {(g.expansions || []).length > 0 && <span className={`tag ${owned ? 'good' : 'quiet'}`}>{owned} of {g.expansions.length} expansions</span>}
                      {g.wantToSell && <span className="tag warn">To sell</span>}
                      {g.manual && <span className="tag quiet">Added by you</span>}
                    </span>
                  </span>
                  <IconButton icon={g.favourite ? 'fav' : 'favo'} label={g.favourite ? 'No longer a favourite' : 'Make it a favourite'} className={g.favourite ? 'favon' : ''} onClick={(e) => { e.stopPropagation(); setFav(g, !g.favourite); }} />
                </div>
              );
            })}
          </div>
        )}

      {data.orphans.length > 0 && !f.sell && !needle && (
        <details className="imsm-fold">
          <summary><Icon n="list" size={20} /><span>Expansions without their game ({data.orphans.length})</span><Icon n="down" size={22} /></summary>
          <ul className="imsm-exps" style={{ padding: '0 12px 12px' }}>
            {data.orphans.map((e) => <li key={e.id}><Art src={e.thumbnail} name={decode(e.name)} size="s" /><span className="nm">{decode(e.name)}{e.year ? <span className="muted"> ({e.year})</span> : null}</span><Sell item={e} onSell={setSell} /><IconButton icon="del" label="Remove it" onClick={() => remove(e)} /></li>)}
          </ul>
        </details>
      )}
      {data.removed.length > 0 && !f.sell && !needle && (
        <details className="imsm-fold">
          <summary><Icon n="archive" size={20} /><span>Removed ({data.removed.length})</span><Icon n="down" size={22} /></summary>
          <ul className="imsm-exps" style={{ padding: '0 12px 12px' }}>
            {data.removed.map((e) => <li key={e.id}><span className="nm">{decode(e.name)}{e.year ? <span className="muted"> ({e.year})</span> : null}</span><Btn kind="tonal" icon="back" onClick={() => restore(e.id)}>Bring back</Btn></li>)}
          </ul>
        </details>
      )}

      <Sheet open={Boolean(openGame)} onClose={() => setOpenId(null)} title={openGame ? decode(openGame.name) : ''} wideWidth="720px">
        {openGame && (
          <div className="imsm-form">
            <div className="imsm-gamehd">
              <Art src={openGame.thumbnail} name={decode(openGame.name)} size="l" />
              <div className="txt">
                {openGame.year && <span className="muted">Released {openGame.year}</span>}
                <span className="meta">
                  {openGame.players && <span><Icon n="people" size={16} />{openGame.players} player{openGame.players === '1' ? '' : 's'}</span>}
                  {playTime(openGame) && <span><Icon n="timer" size={16} />{playTime(openGame)}</span>}
                  {openGame.solo && <span className="solo"><Icon n="person" size={16} />Can be played solo</span>}
                </span>
                {(openGame.categories || []).length > 0 && <div className="chips wrap">{openGame.categories.filter((c) => c !== 'Print & Play').map((c) => <span key={c} className="tag quiet">{c}</span>)}</div>}
                <div className="imsm-row">
                  <Btn kind={openGame.favourite ? 'tonal' : 'text'} icon={openGame.favourite ? 'fav' : 'favo'} onClick={() => setFav(openGame, !openGame.favourite)}>{openGame.favourite ? 'A favourite' : 'Make it a favourite'}</Btn>
                  <Sell item={openGame} onSell={setSell} />
                  {openGame.deckGame && <Btn kind="tonal" icon="explore" onClick={() => go('/campaigns/lotr')}>Campaign Manager</Btn>}
                  <IconButton icon="del" label="Remove it" onClick={() => remove(openGame)} />
                </div>
              </div>
            </div>
            {(openGame.expansions || []).length > 0 && (
              <>
                <h3 className="imsm-h2" style={{ fontSize: 20, margin: 0 }}>Expansions ({openGame.expansions.filter((e) => e.owned).length} of {openGame.expansions.length} owned)</h3>
                <ul className="imsm-exps">
                  {openGame.expansions.map((e) => (
                    <li key={e.id} className={e.owned ? 'own' : ''}>
                      <label className="ck"><input type="checkbox" checked={Boolean(e.owned)} onChange={() => own(e.id, !e.owned)} aria-label={`I own ${decode(e.name)}`} /></label>
                      <Art src={e.thumbnail} name={decode(e.name)} size="s" />
                      <span className="nm">{decode(e.name)}{e.year ? <span className="muted"> ({e.year})</span> : null}{e.manual && <span className="tag quiet">Added by you</span>}</span>
                      {e.owned && <><Sell item={e} onSell={setSell} /><IconButton icon="del" label="Remove it" onClick={() => remove(e)} /></>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </Sheet>

      <Sheet open={updates != null} onClose={() => setUpdates(null)} title="To add on BoardGameGeek" wideWidth="720px"
        footer={<div className="imsm-row" style={{ justifyContent: 'space-between' }}><span className="muted">Once they're on your BGG account, refresh from BGG to bring everything in line.</span><Btn kind="text" onClick={() => setUpdates(null)}>Done</Btn></div>}>
        {updates != null && (() => {
          const uq = updates.trim().toLowerCase();
          const list = data.updates.filter((u) => !uq || `${u.name} ${u.parentName || ''} ${u.year || ''}`.toLowerCase().includes(uq));
          return (
            <div className="imsm-form">
              <p className="muted" style={{ margin: 0 }}>Games and expansions you've added here or marked as owned, to copy to your BoardGameGeek account.</p>
              <TextField label="Filter them" value={updates} onChange={setUpdates} />
              {!list.length ? <p className="muted">{uq ? 'Nothing matches.' : 'Nothing to add.'}</p> : (
                <ul className="imsm-exps">
                  {list.map((u) => (
                    <li key={`${u.type}_${u.id}`}>
                      <Art src={u.thumbnail} name={decode(u.name)} size="s" />
                      <span className="nm">{decode(u.name)}{u.year ? <span className="muted"> ({u.year})</span> : null}<span className={`tag ${u.type === 'expansion' ? 'warn' : 'quiet'}`}>{u.type === 'expansion' ? 'Expansion' : 'Game'}</span>{u.parentName && <small className="muted">for {decode(u.parentName)}</small>}</span>
                      {u.bggUrl ? <a className="btn tonal sl icon" href={u.bggUrl} target="_blank" rel="noreferrer"><Icon n="open" />Open on BGG</a> : <span className="muted">No BGG link</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })()}
      </Sheet>

      <Sheet open={Boolean(add)} onClose={() => setAdd(null)} title="Add a game" wideWidth="720px"
        footer={add && (add.mode === 'manual'
          ? <div className="imsm-row end"><Btn kind="text" onClick={() => setAdd(null)}>Cancel</Btn><Btn icon="add" disabled={!add.draft.name.trim()} onClick={saveManual}>Add it</Btn></div>
          : add.picked ? <div className="imsm-row end"><Btn kind="text" onClick={() => setAdd({ ...add, picked: null })}>Another game</Btn><Btn icon="add" onClick={saveBgg}>Add it{add.owned.size ? ` with ${add.owned.size} expansion${add.owned.size === 1 ? '' : 's'}` : ''}</Btn></div>
          : <div className="imsm-row end"><Btn kind="text" onClick={() => setAdd(null)}>Cancel</Btn></div>)}>
        {add && (
          <div className="imsm-form">
            <Segmented label="How" value={add.mode} onChange={(m) => setAdd({ ...add, mode: m })} options={[['bgg', 'Find it on BGG'], ['manual', 'Type it in']]} />
            {add.mode === 'bgg' ? (
              add.picked ? (
                <>
                  <div className="imsm-gamehd"><Art src={add.picked.thumbnail} name={decode(add.picked.name)} size="l" /><div className="txt"><b style={{ fontSize: 18 }}>{decode(add.picked.name)}</b><span className="muted">{add.picked.year || 'Year not known'} · BGG {add.picked.id}</span></div></div>
                  {!add.picked.expansions?.length ? <p className="muted">BoardGameGeek has no expansions for it.</p> : (
                    <>
                      <div className="imsm-row" style={{ justifyContent: 'space-between' }}><b>Which expansions do you own? ({add.owned.size} of {add.picked.expansions.length})</b><span className="imsm-row"><Btn kind="text" onClick={() => setAdd({ ...add, owned: new Set(add.picked.expansions.map((e) => e.id)) })}>All</Btn><Btn kind="text" onClick={() => setAdd({ ...add, owned: new Set() })}>None</Btn></span></div>
                      <ul className="imsm-exps">
                        {add.picked.expansions.map((e) => {
                          const on = add.owned.has(e.id);
                          return <li key={e.id} className={on ? 'own' : ''}><label className="ck"><input type="checkbox" checked={on} onChange={() => setAdd((a) => { const n = new Set(a.owned); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return { ...a, owned: n }; })} aria-label={`I own ${decode(e.name)}`} /></label><Art src={e.thumbnail} name={decode(e.name)} size="s" /><span className="nm">{decode(e.name)}{e.year ? <span className="muted"> ({e.year})</span> : null}</span></li>;
                        })}
                      </ul>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="imsm-ask"><TextField label="Game title" value={add.query} onChange={(v) => setAdd({ ...add, query: v })} autoFocus placeholder="For example: Dune: Imperium" onKeyDown={(e) => e.key === 'Enter' && searchBgg()} /><Btn icon="search" busy={add.searching} disabled={add.searching || !add.query.trim()} onClick={searchBgg}>Search</Btn></div>
                  {add.loading && <div className="imsm-empty"><Spinner /><p>Getting its expansions from BGG…</p></div>}
                  {!add.loading && add.results?.length > 0 && <ul className="imsm-exps">{add.results.map((r) => <li key={r.id} className="pick sl" role="button" tabIndex={0} onClick={() => pickBgg(r)} onKeyDown={(e) => e.key === 'Enter' && pickBgg(r)}><span className="nm">{decode(r.name)}{r.year ? <span className="muted"> ({r.year})</span> : null}</span><Icon n="open" size={18} /></li>)}</ul>}
                  {!add.loading && add.results && !add.results.length && <p className="muted">Nothing found on BGG.</p>}
                </>
              )
            ) : (
              <>
                <TextField label="Name" value={add.draft.name} onChange={(v) => setAdd({ ...add, draft: { ...add.draft, name: v } })} autoFocus placeholder="For example: Marvel Champions" />
                <div className="two">
                  <TextField label="Year (optional)" type="number" value={add.draft.year} onChange={(v) => setAdd({ ...add, draft: { ...add.draft, year: v } })} />
                  <SelectField label="It's" value={add.draft.type} onChange={(v) => setAdd({ ...add, draft: { ...add.draft, type: v } })} options={[['base', 'A game'], ['expansion', 'An expansion']]} />
                </div>
                {add.draft.type === 'expansion' && <SelectField label="An expansion for" value={add.draft.parentId} onChange={(v) => setAdd({ ...add, draft: { ...add.draft, parentId: v } })} options={[['', 'Choose a game'], ...games.map((g) => [String(g.id), decode(g.name)])]} />}
                <TextField label="BoardGameGeek link (optional)" value={add.draft.bggLink} onChange={(v) => setAdd({ ...add, draft: { ...add.draft, bggLink: v } })} placeholder="https://boardgamegeek.com/boardgame/…" />
              </>
            )}
          </div>
        )}
      </Sheet>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      <Fab label="Add a game" onClick={() => setAdd({ mode: 'bgg', query: '', results: null, picked: null, owned: new Set(), draft: { name: '', year: '', type: 'base', parentId: '', bggLink: '' } })} />
    </>
  );
}

export default function Boardgames({ theme = 'light', onThemeToggle, setCurrentPath }) {
  const go = (p) => { window.history.pushState(null, '', p); if (setCurrentPath) setCurrentPath(p); else window.dispatchEvent(new PopStateEvent('popstate')); };
  return (
    <ServicePage title="Board Games" icon="dice" accent="violet" wide theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} sub="Your BoardGameGeek collection, its expansions, and what you're selling.">
      <Body go={go} />
    </ServicePage>
  );
}
