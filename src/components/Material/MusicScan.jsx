// Music Scanner in the IMS design (24 Oct 2026): your MUZAK library checked against MusicBrainz. What came out today,
// this week, month, six months or year; what's announced; your want list; artists you might like; an audit of
// folders MusicBrainz couldn't match; and every artist. Artists open to show their releases (owned in green, not
// owned in red), with the folder browser and MusicBrainz search as sheets. Scan now is the button in the bottom
// right. The same /api/music-scan requests as before (Dashboard/MusicScanPortal.jsx).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ServicePage, { Empty, Fab } from './ServicePage';
import { Icon, IconButton, Btn, Sheet, TextField, SelectField, FilterChip, Segmented, Confirm, useSnack, Spinner } from '../HomebrewBeta/ui';

const VIEWS = [['day', 'Today'], ['week', 'This week'], ['month', 'This month'], ['6months', '6 months'], ['year', 'This year'], ['upcoming', 'Coming soon'], ['wants', 'Want list'], ['discover', 'Discover'], ['audit', 'Audit'], ['all', 'All artists']];
const UP_RANGES = [['week', 'Next 7 days'], ['month', 'Next month'], ['all', 'Everything announced']];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const wantId = (artist, title) => `${String(artist).toLowerCase()}|${String(title).toLowerCase()}`;
function fmtDate(date, precision) {
  if (!date) return 'Date unknown';
  const [y, m, d] = date.split('-');
  if (precision === 'day') return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
  if (precision === 'month') return `${MONTHS[Number(m) - 1]} ${y}`;
  return y;
}
function inRange(r, range, today) {
  if (range === 'all') return true;
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + (range === 'week' ? 7 : 31));
  const e = end.toISOString().slice(0, 10);
  if (r.precision === 'day') return r.date > today && r.date <= e;
  if (r.precision === 'month') return range === 'month' && r.date <= e.slice(0, 7);
  return false;
}
const post = (url, body, method = 'POST') => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok || d.success === false) throw new Error(d.error || 'It didn\'t work.'); return d; });

// MusicBrainz has no audio, so these search the services instead
function Listen({ artist, title }) {
  const q = encodeURIComponent(`${artist} ${title || ''}`.trim());
  return (
    <span className="imsm-listen" onClick={(e) => e.stopPropagation()}>
      <a href={`https://open.spotify.com/search/${q}`} target="_blank" rel="noreferrer" className="sp" title="Search on Spotify">Spotify</a>
      <a href={`https://www.youtube.com/results?search_query=${q}`} target="_blank" rel="noreferrer" className="yt" title="Search on YouTube">YouTube</a>
    </span>
  );
}
function Want({ on, onClick }) {
  return <IconButton icon={on ? 'fav' : 'favo'} label={on ? 'Take it off the want list' : 'Put it on the want list'} className={on ? 'favon' : ''} onClick={(e) => { e.stopPropagation(); onClick(); }} />;
}

// match a folder to the right MusicBrainz artist, or rename the folder to its name
function MbSearch({ target, onClose, onDone, confirmIt }) {
  const snack = useSnack();
  const [q, setQ] = useState(target.name);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState('');
  const run = useCallback(async (query) => {
    if (!query.trim()) return;
    setBusy('search');
    try { const d = await (await fetch(`/api/music-scan/musicbrainz/search?q=${encodeURIComponent(query.trim())}`)).json(); if (!d.success) throw new Error(d.error || 'MusicBrainz didn\'t answer.'); setRes(d.artists || []); } catch (e) { snack(e.message, { error: true }); }
    setBusy('');
  }, [snack]);
  useEffect(() => { run(target.name); }, [target.name, run]);
  const link = async (r) => {
    setBusy(r.name);
    try {
      await post('/api/music-scan/artist/settings', { name: target.name, searchName: r.name, mbId: r.id || undefined, aliases: [] }, 'PUT');
      await post('/api/music-scan/artist/rescan', { name: target.name });
      snack(`“${target.name}” is now matched to “${r.name}”, and rescanned.`); onDone(); onClose();
    } catch (e) { snack(e.message, { error: true }); }
    setBusy('');
  };
  const rename = (r) => confirmIt({ title: `Rename the folder to “${r.name}”?`, body: `“${target.name}” is renamed on the network drive.`, okLabel: 'Rename it', onOk: async () => {
    setBusy(`rn-${r.name}`);
    try { await post('/api/music-scan/artist/rename', { genre: target.genre, oldArtist: target.name, newArtist: r.name }); snack(`Renamed to “${r.name}”, and rescanned.`); onDone(); onClose(); } catch (e) { snack(e.message, { error: true }); }
    setBusy('');
  } });
  return (
    <div className="imsm-form">
      <p className="muted" style={{ margin: 0 }}>Find the right MusicBrainz artist for the folder <b>{target.name}</b>.</p>
      <div className="imsm-ask"><TextField label="Search MusicBrainz" value={q} onChange={setQ} onKeyDown={(e) => e.key === 'Enter' && run(q)} /><Btn icon="search" busy={busy === 'search'} onClick={() => run(q)}>Search</Btn></div>
      {busy === 'search' && !res ? <div className="imsm-empty"><Spinner /></div> : res && !res.length ? <p className="muted">No close matches on MusicBrainz.</p> : (
        <ul className="imsm-mb">
          {(res || []).map((r) => (
            <li key={r.id || r.name}>
              <span className="txt">
                <b>{r.name}{r.type && <span className="tag quiet">{r.type}</span>}{r.country && <span className="tag warn">{r.country}</span>}{r.score && <span className="muted"> {r.score}% match</span>}</b>
                {r.disambiguation && <small>{r.disambiguation}</small>}
                {r.aliases?.length > 0 && <small>Also known as {r.aliases.slice(0, 4).join(', ')}</small>}
              </span>
              <span className="imsm-row">
                <Btn kind="tonal" busy={busy === r.name} disabled={Boolean(busy)} onClick={() => link(r)} title="Keep the folder's name, but match it to this artist">Match to this</Btn>
                <Btn kind="text" busy={busy === `rn-${r.name}`} disabled={Boolean(busy)} onClick={() => rename(r)} title="Rename the folder on disk to this name">Rename the folder</Btn>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// look inside an artist's folder: link a release to a folder (marking it owned), rename an album folder or the artist's
function Folder({ target, onClose, onDone, confirmIt }) {
  const snack = useSnack();
  const { name: artist, genre, release } = target;
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('browse');
  const [pick, setPick] = useState('');
  const [albumName, setAlbumName] = useState(release?.title || '');
  const [artistName, setArtistName] = useState(artist);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch(`/api/music-scan/artist/folder?artist=${encodeURIComponent(artist)}&genre=${encodeURIComponent(genre || '')}`).then((r) => r.json())
      .then((d) => { if (!d.success) throw new Error(d.error || 'The folder couldn\'t be read.'); setData(d); }).catch((e) => { snack(e.message, { error: true }); setData({ exists: false }); });
  }, [artist, genre, snack]);
  const act = async (fn, word) => { setBusy(true); try { await fn(); snack(word); onDone(); onClose(); } catch (e) { snack(e.message, { error: true }); } setBusy(false); };
  const link = (folder) => act(() => post('/api/music-scan/album/link', { artistName: artist, releaseTitle: release.title, folderName: folder }), `“${release.title}” linked to “${folder}”, and marked as owned.`);
  const renameAlbum = () => act(() => post('/api/music-scan/album/rename', { genre: data.genre, artist, oldFolder: pick, newFolder: albumName.trim() }), `Renamed to “${albumName.trim()}”, and rescanned.`);
  const renameArtist = () => confirmIt({ title: `Rename “${artist}” to “${artistName.trim()}”?`, body: 'The artist\'s folder is renamed on the network drive, and its search settings move with it.', okLabel: 'Rename it', onOk: () => act(() => post('/api/music-scan/artist/rename', { genre: data.genre, oldArtist: artist, newArtist: artistName.trim() }), `Renamed to “${artistName.trim()}”.`) });
  if (!data) return <div className="imsm-empty"><Spinner /><p>Reading the folder from the network drive…</p></div>;
  if (!data.exists) return <div className="imsm-banner"><Icon n="warn" size={22} /><span>There's no folder at <code>{data.folderPath || `${genre}\\${artist}`}</code>.</span></div>;
  return (
    <div className="imsm-form">
      <code className="imsm-code">{data.folderPath}</code>
      {release && (
        <div className="imsm-banner info"><Icon n="link" size={22} /><span><b>Linking “{release.title}”</b>{release.type ? ` (${release.type}${release.date ? `, ${release.date}` : ''})` : ''}. Pick the folder it's in, or link it to the artist's folder if its tracks are loose there.</span><Btn kind="tonal" busy={busy} onClick={() => link(artist)}>Artist's folder</Btn></div>
      )}
      <Segmented label="What to do" value={tab} onChange={setTab} options={[['browse', `Folders (${data.subfolders.length})`], ['album', 'Rename an album'], ['artist', 'Rename the artist']]} />
      {tab === 'browse' && (
        <>
          {!data.subfolders.length ? <p className="muted">No album folders; the tracks may be loose in the artist's folder.</p> : (
            <ul className="imsm-exps">
              {data.subfolders.map((f) => (
                <li key={f.name} className={pick === f.name ? 'own' : ''}>
                  <Icon n="archive" size={18} /><span className="nm">{f.name}<span className="muted">{f.audioFilesCount} tracks</span></span>
                  {release && <Btn kind="tonal" icon="link" busy={busy} onClick={() => link(f.name)}>Link it</Btn>}
                  <IconButton icon="edit" label="Rename this folder" onClick={() => { setPick(f.name); setAlbumName(release?.title || f.name); setTab('album'); }} />
                </li>
              ))}
            </ul>
          )}
          {data.looseAudioFiles.length > 0 && (
            <details className="imsm-fold" style={{ margin: 0 }}>
              <summary><Icon n="music" size={20} /><span>Loose tracks ({data.looseAudioFiles.length})</span><Icon n="down" size={22} /></summary>
              <ul className="imsm-log">{data.looseAudioFiles.map((f) => <li key={f}><span className="m">{f}</span></li>)}</ul>
            </details>
          )}
        </>
      )}
      {tab === 'album' && (
        <>
          <SelectField label="Folder to rename" value={pick} onChange={(v) => { setPick(v); if (!albumName) setAlbumName(v); }} options={[['', 'Choose a folder'], ...data.subfolders.map((f) => [f.name, `${f.name} (${f.audioFilesCount} tracks)`])]} />
          <TextField label="New name" value={albumName} onChange={setAlbumName} placeholder="For example: The Union of Souls" />
          <div className="imsm-row end"><Btn icon="edit" busy={busy} disabled={busy || !pick || !albumName.trim()} onClick={renameAlbum}>Rename and rescan</Btn></div>
        </>
      )}
      {tab === 'artist' && (
        <>
          <p className="muted" style={{ margin: 0 }}>Renames <code>{artist}</code> in <code>{data.genre}</code> on the network drive.</p>
          <TextField label="New artist folder name" value={artistName} onChange={setArtistName} />
          <div className="imsm-row end"><Btn icon="edit" busy={busy} disabled={busy || !artistName.trim() || artistName.trim() === artist} onClick={renameArtist}>Rename and rescan</Btn></div>
        </>
      )}
    </div>
  );
}

function Artist({ artist, wants, onWant, onChanged, onFolder, onMb, onEdit, onHide }) {
  const snack = useSnack();
  const [open, setOpen] = useState(false);
  const [fetched, setFetched] = useState(null);
  useEffect(() => { setFetched(null); }, [artist]);
  const detail = fetched || (artist.releases ? artist : null);
  useEffect(() => {
    if (!open || detail) return undefined;
    let off = false;
    fetch(`/api/music-scan/artist?name=${encodeURIComponent(artist.name)}`).then((r) => r.json()).then((d) => { if (!off && d.success) setFetched(d.artist); }).catch(() => {});
    return () => { off = true; };
  }, [open, detail, artist.name]);
  const fav = async (e) => {
    e.stopPropagation();
    try { await post('/api/music-scan/artist/favourite', { name: artist.name, favourite: !artist.favourite }); snack(artist.favourite ? `“${artist.name}” is no longer a favourite.` : `“${artist.name}” is a favourite.`); onChanged(); } catch (x) { snack(x.message, { error: true }); }
  };
  const owned = detail ? detail.releases.filter((r) => r.owned).length : artist.owned;
  const missing = detail ? detail.releases.filter((r) => !r.owned).length : artist.notOwned;
  const unlisted = detail ? detail.unlistedAlbums.length : artist.unlisted;
  return (
    <div className={`imsm-artist ${open ? 'open' : ''}`}>
      <div className="hd sl" role="button" tabIndex={0} aria-expanded={open} onClick={() => setOpen(!open)} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setOpen(!open); } }}>
        <IconButton icon={artist.favourite ? 'fav' : 'favo'} label={artist.favourite ? 'No longer a favourite' : 'Make them a favourite'} className={artist.favourite ? 'favon' : ''} onClick={fav} />
        <span className="txt"><b>{artist.name}</b><small>{artist.genre}</small></span>
        <span className="counts"><span className="own">{owned} owned</span><span className="miss">{missing} missing</span>{unlisted > 0 && <span className="unl">{unlisted} not listed</span>}</span>
        <Icon n={open ? 'up' : 'down'} size={22} />
      </div>
      {open && (
        <div className="bd">
          <div className="imsm-row" style={{ gap: 2 }}>
            <Btn kind="text" icon="archive" onClick={() => onFolder(artist, null)}>Folder</Btn>
            <Btn kind="text" icon="search" onClick={() => onMb(artist)}>Match on MusicBrainz</Btn>
            <Btn kind="text" icon="edit" onClick={() => onEdit(artist, detail, setFetched)}>Search names</Btn>
            <Btn kind="text" icon="close" onClick={() => onHide(artist)}>Hide</Btn>
          </div>
          {!detail ? <Spinner /> : (
            <ul className="imsm-rel">
              {detail.releases.map((r, i) => (
                <li key={`${r.title}-${r.date}-${i}`} className={`${r.owned ? 'own' : 'miss'} ${r.isNew ? 'new' : ''}`}>
                  <span className="dot" />
                  <span className="t"><b>{r.title}</b><small>{r.type} · {fmtDate(r.date, r.precision)}</small></span>
                  {r.isNew && <span className="tag warn">New</span>}
                  {!r.owned && <Btn kind="text" icon="link" onClick={() => onFolder(artist, r)}>Link a folder</Btn>}
                  <Listen artist={detail.mbName || artist.name} title={r.title} />
                  {!r.owned && <Want on={wants.has(wantId(artist.name, r.title))} onClick={() => onWant({ artist: artist.name, ...r })} />}
                </li>
              ))}
              {detail.unlistedAlbums.map((t) => (
                <li key={`u-${t}`} className="unl"><span className="dot" /><span className="t"><b>{t}</b><small>Your folder, not found on MusicBrainz</small></span><IconButton icon="edit" label="Rename or look inside" onClick={() => onFolder(artist, { title: t })} /></li>
              ))}
              {!detail.releases.length && !detail.unlistedAlbums.length && <li className="muted">Nothing found for this artist.</li>}
              {detail.error && <li className="bad">MusicBrainz said: {detail.error}</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Audit({ onRefresh, onFolder, onMb, onHide, artistProps }) {
  const snack = useSnack();
  const [d, setD] = useState(null);
  const [tab, setTab] = useState('unmatched');
  const [q, setQ] = useState('');
  const load = useCallback(async () => { try { const x = await (await fetch('/api/music-scan/audit')).json(); if (!x.success) throw new Error(x.error || 'The audit couldn\'t be loaded.'); setD(x); } catch (e) { snack(e.message, { error: true }); setD((p) => p || {}); } }, [snack]);
  useEffect(() => { load(); }, [load]);
  const unhide = async (name) => { try { await post('/api/music-scan/artist/hide', { name, hidden: false }); snack(`“${name}” is back in the scanner.`); load(); onRefresh(); } catch (e) { snack(e.message, { error: true }); } };
  const f = (list) => (list || []).filter((a) => { const n = q.trim().toLowerCase(); return !n || a.name.toLowerCase().includes(n) || a.genre?.toLowerCase().includes(n); });
  if (!d) return <div className="imsm-empty"><Spinner /><p>Checking the library against MusicBrainz…</p></div>;
  const s = d.summary || {};
  return (
    <div className="imsm-form">
      <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
        <Segmented label="Which list" value={tab} onChange={setTab} options={[['unmatched', `Not matched (${s.unmatchedCount || 0})`], ['missing', `Missing releases (${s.missingReleasesArtistCount || 0})`], ['hidden', `Hidden (${s.hiddenCount || 0})`]]} />
        <IconButton icon="sync" label="Check again" onClick={() => { setD(null); load(); }} />
      </div>
      <TextField label="Filter" value={q} onChange={setQ} />
      {tab === 'unmatched' && (f(d.unmatchedArtists).length === 0 ? <Empty icon="check" title={q ? 'Nothing matches' : 'Every artist is matched on MusicBrainz'} /> : (
        <>
          <p className="muted" style={{ margin: 0 }}>These folders didn't match a MusicBrainz artist. Search MusicBrainz for a different spelling, or rename the folder.</p>
          {f(d.unmatchedArtists).map((a) => (
            <div key={a.name} className="imsm-unm">
              <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
                <b><span className="dot" />{a.name}<span className="tag quiet">{a.genre}</span></b>
                <span className="imsm-row" style={{ gap: 2 }}><Btn kind="tonal" icon="search" onClick={() => onMb(a)}>Search MusicBrainz</Btn><Btn kind="text" icon="archive" onClick={() => onFolder(a, null)}>Folder</Btn><IconButton icon="close" label="Hide it from the scanner" onClick={() => onHide(a, () => { load(); })} /></span>
              </div>
              {a.error && <small className="bad">{a.error}</small>}
              {a.unlistedAlbums?.length > 0 && <div className="chips wrap">{a.unlistedAlbums.map((u) => <span key={u} className="tag quiet">{u}</span>)}</div>}
            </div>
          ))}
        </>
      ))}
      {tab === 'missing' && (f(d.missingReleases).length === 0 ? <Empty icon="check" title={q ? 'Nothing matches' : 'You own everything by your matched artists'} /> : (
        <div className="imsm-list">{f(d.missingReleases).map((a) => <Artist key={`m-${a.name}`} artist={a} {...artistProps} onChanged={() => { load(); onRefresh(); }} />)}</div>
      ))}
      {tab === 'hidden' && (f(d.hiddenArtists).length === 0 ? <Empty icon="eye" title="Nothing is hidden" /> : (
        <ul className="imsm-exps">{f(d.hiddenArtists).map((a) => <li key={a.name}><span className="nm">{a.name}<span className="tag quiet">{a.genre}</span></span><Btn kind="tonal" icon="eye" onClick={() => unhide(a.name)}>Bring back</Btn></li>)}</ul>
      ))}
    </div>
  );
}

function Body() {
  const snack = useSnack();
  const [config, setConfig] = useState(null);
  const [draft, setDraft] = useState(null);
  const [status, setStatus] = useState({ state: 'idle' });
  const [running, setRunning] = useState(false);
  const [nextRun, setNextRun] = useState(null);
  const [meta, setMeta] = useState({ lastScanCompleted: null, artistsScanned: 0, artistsWithMissingReleases: 0 });
  const [view, setView] = useState('day');
  const [win, setWin] = useState(null);
  const [today, setToday] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [upRange, setUpRange] = useState('month');
  const [wants, setWants] = useState([]);
  const [recs, setRecs] = useState(null);
  const [recsBusy, setRecsBusy] = useState(false);
  const [all, setAll] = useState([]);
  const [q, setQ] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [loadingView, setLoadingView] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState(null); // { kind: 'folder' | 'mb' | 'edit', ... }
  const [confirm, setConfirm] = useState(null);
  const poll = useRef(null);
  const was = useRef(false);
  const err = useCallback((m) => snack(m, { error: true }), [snack]);
  const wantSet = useMemo(() => new Set(wants.map((w) => wantId(w.artist, w.title))), [wants]);
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const dirty = draft && config && JSON.stringify(draft) !== JSON.stringify(config);

  const fetchStatus = useCallback(async () => {
    try {
      const d = await (await fetch('/api/music-scan')).json();
      if (d.success) { setConfig(d.config); setDraft((p) => p || d.config); setStatus(d.status); setRunning(d.isRunning); setNextRun(d.nextScheduledRun); setMeta({ lastScanCompleted: d.lastScanCompleted, artistsScanned: d.artistsScanned, artistsWithMissingReleases: d.artistsWithMissingReleases }); }
    } catch (e) { err(e.message); }
  }, [err]);
  const fetchView = useCallback(async () => {
    setLoadingView(true);
    try {
      if (view === 'all') { const d = await (await fetch('/api/music-scan/artists')).json(); if (d.success) setAll(d.artists); }
      else if (view === 'upcoming') { const d = await (await fetch('/api/music-scan/upcoming')).json(); if (d.success) setUpcoming(d.releases); }
      else if (!['audit', 'wants', 'discover'].includes(view)) {
        const d = await (await fetch(`/api/music-scan/results?window=${view}`)).json(); if (d.success) setWin(d);
        if (view === 'day') { const t = await (await fetch('/api/music-scan/today')).json(); if (t.success) setToday(t.releases); }
      }
    } catch { /* keep what's shown */ }
    setLoadingView(false);
  }, [view]);
  const fetchWants = useCallback(async () => { try { const d = await (await fetch('/api/music-scan/wants')).json(); if (d.success) setWants(d.wants); } catch { /* keep */ } }, []);
  useEffect(() => { fetchStatus(); fetchWants(); }, [fetchStatus, fetchWants]);
  useEffect(() => { fetchView(); }, [fetchView]);
  useEffect(() => { if (view === 'discover' && !recs) fetch('/api/music-scan/recommendations').then((r) => r.json()).then((d) => { if (d.success) setRecs(d.recommendations); }).catch(() => {}); }, [view, recs]);
  useEffect(() => {
    if (running) { was.current = true; poll.current = setInterval(fetchStatus, 3000); return () => clearInterval(poll.current); }
    if (was.current) { was.current = false; fetchStatus(); fetchView(); }
    return undefined;
  }, [running, fetchStatus, fetchView]);

  const toggleWant = async (r) => {
    const on = wantSet.has(wantId(r.artist, r.title));
    try {
      const d = await (await fetch('/api/music-scan/wants', { method: on ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ artist: r.artist, title: r.title, date: r.date, precision: r.precision, type: r.type }) })).json();
      if (d.success) { setWants(d.wants); snack(on ? `“${r.title}” is off your want list.` : `“${r.title}” is on your want list.`); }
    } catch (e) { err(e.message); }
  };
  const scan = async () => { try { await post('/api/music-scan/run', {}); snack('Scan started.'); setRunning(true); fetchStatus(); } catch (e) { err(e.message); } };
  const save = async () => {
    setSaving(true);
    try { const d = await post('/api/music-scan/config', draft, 'PUT'); setConfig(d.config); setDraft(d.config); setNextRun(d.nextScheduledRun); snack('Settings saved.'); } catch (e) { err(e.message); }
    setSaving(false);
  };
  const makeRecs = async () => { setRecsBusy(true); try { const d = await (await fetch('/api/music-scan/recommendations', { method: 'POST' })).json(); if (!d.success) throw new Error(d.error); setRecs(d.recommendations); } catch (e) { err(e.message); } setRecsBusy(false); };
  const refreshAll = () => { fetchStatus(); fetchView(); };
  const hide = (a, after) => setConfirm({ title: `Hide “${a.name}”?`, body: 'It\'s left out of scans and the morning report until you bring it back from the audit.', okLabel: 'Hide it', onOk: async () => { try { await post('/api/music-scan/artist/hide', { name: a.name, hidden: true }); snack(`“${a.name}” is hidden.`); refreshAll(); after?.(); } catch (e) { err(e.message); } } });
  const editNames = (a, detail, setFetched) => setSheet({ kind: 'edit', artist: a, mbName: detail?.mbName || a.mbName, setFetched, searchName: a.searchName || '', aliases: (a.aliases || []).join(', ') });
  const saveNames = async () => {
    const s = sheet; setSheet({ ...s, busy: true });
    try {
      await post('/api/music-scan/artist/settings', { name: s.artist.name, searchName: s.searchName, aliases: s.aliases.split(',').map((x) => x.trim()).filter(Boolean) }, 'PUT');
      const d = await post('/api/music-scan/artist/rescan', { name: s.artist.name });
      s.setFetched?.(d.artist); snack(`Saved, and ${s.artist.name} rescanned.`); setSheet(null); fetchView();
    } catch (e) { err(e.message); setSheet({ ...s, busy: false }); }
  };
  const artistProps = { wants: wantSet, onWant: toggleWant, onFolder: (a, release) => setSheet({ kind: 'folder', name: a.name, genre: a.genre, release }), onMb: (a) => setSheet({ kind: 'mb', name: a.name, genre: a.genre }), onEdit: editNames, onHide: (a, after) => hide(a, after) };

  const hasData = meta.artistsScanned > 0;
  const source = view === 'all' ? all : (win?.artists || []);
  const favCount = source.filter((a) => a.favourite).length;
  const shown = view === 'all'
    ? all.filter((a) => (!favOnly || a.favourite) && (!q.trim() || [a.name, a.mbName || '', ...(a.aliases || [])].some((x) => x.toLowerCase().includes(q.trim().toLowerCase()))))
    : (favOnly ? source.filter((a) => a.favourite) : source);
  const upShown = upcoming.filter((r) => inRange(r, upRange, todayStr));
  const pct = status.totalArtists > 0 ? Math.round((status.currentIndex / status.totalArtists) * 100) : 0;
  const isWindow = !['all', 'upcoming', 'wants', 'discover', 'audit'].includes(view);

  return (
    <>
      <div className={`imsm-live-dev ${running ? 'on' : ''}`} style={running ? undefined : { background: 'var(--surface-c)', color: 'inherit' }}>
        <span className="dot" style={running ? undefined : { animation: 'none', background: status.state === 'error' ? '#c0392b' : 'var(--outline)' }} />
        <span className="txt">
          <b>{running ? (status.currentArtist ? `Checking “${status.currentArtist}”` : 'Starting the scan') : status.state === 'error' ? 'The last scan failed' : meta.lastScanCompleted ? `Last scanned ${new Date(meta.lastScanCompleted).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Not scanned yet'}</b>
          <small>{running ? `${status.currentIndex || 0} of ${status.totalArtists || 0} (${pct}%). The full library takes 35 to 40 minutes.` : `${hasData ? `${meta.artistsScanned} artists, ${meta.artistsWithMissingReleases} with releases you don't own. ` : ''}${nextRun ? `Next scan ${new Date(nextRun).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.` : ''}${status.state === 'error' && status.lastError ? ` ${status.lastError}` : ''}`}</small>
          {running && <span className="imsm-prog"><i style={{ width: `${pct}%` }} /></span>}
        </span>
      </div>

      <div className="imsm-ptabs"><div className="chips">{VIEWS.map(([k, l]) => <FilterChip key={k} on={view === k} onClick={() => setView(k)}>{l}</FilterChip>)}</div></div>
      {view !== 'audit' && (
        <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
          <span className="imsm-legend"><span className="own"><i />Owned</span><span className="miss"><i />Not owned</span><span className="unl"><i />Yours, not on MusicBrainz</span></span>
          {(isWindow || view === 'all') && <FilterChip on={favOnly} onClick={() => setFavOnly(!favOnly)} lead={<Icon n="fav" size={18} />}>Favourites ({favCount})</FilterChip>}
        </div>
      )}

      {!hasData && view !== 'audit' ? <Empty icon="music" title={running ? 'Waiting for the scan to finish' : 'No scan yet'}>{running ? '' : 'Start one with the button in the corner.'}</Empty> : (
        <>
          {view === 'day' && (
            <section className="imsm-card">
              <h3><Icon n="music" size={20} />Out today ({today.length})</h3>
              <p className="muted" style={{ margin: 0 }}>The number beside the record icon on the desk.</p>
              {!today.length ? <p className="muted" style={{ margin: 0 }}>Nothing from your artists came out today.</p> : (
                <ul className="imsm-rel">{today.map((r, i) => <li key={`${r.artist}-${r.title}-${i}`} className={r.owned ? 'own' : 'miss'}><span className="dot" /><span className="t"><b>{r.title}</b><small>{r.artist} · {r.type}</small></span><Listen artist={r.artist} title={r.title} />{!r.owned && <Want on={wantSet.has(wantId(r.artist, r.title))} onClick={() => toggleWant(r)} />}</li>)}</ul>
              )}
            </section>
          )}
          {view === 'audit' && <Audit onRefresh={refreshAll} onFolder={artistProps.onFolder} onMb={artistProps.onMb} onHide={artistProps.onHide} artistProps={artistProps} />}
          {view === 'upcoming' && (
            <>
              <Segmented label="How far ahead" value={upRange} onChange={setUpRange} options={UP_RANGES} />
              {loadingView && !upcoming.length ? <div className="imsm-empty"><Spinner /></div> : !upShown.length ? <Empty icon="calendar" title="Nothing announced">{upcoming.length ? 'Try a longer stretch.' : 'MusicBrainz lists releases once they\'re announced; check after the next scan.'}</Empty> : (
                <ul className="imsm-rel big">
                  {upShown.map((r, i) => (
                    <li key={`${r.artist}-${r.title}-${i}`} className={r.owned ? 'own' : ''}>
                      <span className="date">{fmtDate(r.date, r.precision)}{r.precision !== 'day' && <small>day not known yet</small>}</span>
                      <span className="t"><b>{r.title}</b><small title={r.mbName && r.mbName !== r.artist ? `Your folder: ${r.artist}` : undefined}>{r.mbName || r.artist} · {r.type}</small></span>
                      <Listen artist={r.mbName || r.artist} title={r.title} />
                      <Want on={wantSet.has(wantId(r.artist, r.title))} onClick={() => toggleWant(r)} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {view === 'wants' && (!wants.length ? <Empty icon="favo" title="Your want list is empty">Tap the heart on a release you haven't got, in Coming soon or inside any artist. Ims mentions it in your morning report on the day it comes out.</Empty> : (
            <ul className="imsm-rel big">
              {wants.map((w) => (
                <li key={wantId(w.artist, w.title)} className={w.owned ? 'own gone' : ''}>
                  <span className="date">{w.date ? fmtDate(w.date, w.precision) : 'Date unknown'}</span>
                  <span className="t"><b>{w.title}</b><small>{w.artist}</small></span>
                  <span className={`tag ${w.owned || w.released ? 'good' : 'quiet'}`}>{w.owned ? 'Got it' : w.released ? 'Out now' : 'Not out yet'}</span>
                  <Listen artist={w.artist} title={w.title} />
                  <Want on onClick={() => toggleWant(w)} />
                </li>
              ))}
            </ul>
          ))}
          {view === 'discover' && (
            <>
              <div className="imsm-row" style={{ justifyContent: 'space-between' }}><span className="muted">Suggested from the artists you own most of. Anything already in your library is left out.</span><Btn kind="tonal" icon="sparkle" busy={recsBusy} onClick={makeRecs}>{recs ? 'New suggestions' : 'Suggest some'}</Btn></div>
              {recs?.artists?.length ? (
                <div className="imsm-grid">
                  {recs.artists.map((r) => (
                    <div key={r.artist} className="imsm-card imsm-rec">
                      <div className="imsm-row" style={{ justifyContent: 'space-between' }}><h3>{r.artist}</h3><Listen artist={r.artist} title={r.startWith || ''} /></div>
                      {r.why && <p className="muted" style={{ margin: 0 }}>{r.why}</p>}
                      {r.startWith && <p style={{ margin: 0 }}>Start with <b>{r.startWith}</b></p>}
                      {Array.isArray(r.because) && r.because.length > 0 && <small className="muted">Because you own {r.because.join(', ')}</small>}
                    </div>
                  ))}
                </div>
              ) : !recsBusy && <Empty icon="sparkle" title="No suggestions yet" />}
            </>
          )}
          {view === 'all' && <div className="imsm-hubsearch"><Icon n="search" size={22} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Find one of ${all.length} artists`} aria-label="Find an artist" />{q && <button type="button" className="sl" aria-label="Clear the search" onClick={() => setQ('')}><Icon n="close" size={20} /></button>}</div>}
          {(isWindow || view === 'all') && (
            loadingView && !shown.length ? <div className="imsm-empty"><Spinner /></div>
              : !shown.length ? <Empty icon="music" title={view === 'all' ? 'No artists match' : 'Nothing dated in this stretch'} />
              : (
                <>
                  {isWindow && <p className="muted" style={{ margin: 0 }}>{shown.length} artist{shown.length === 1 ? '' : 's'}. Highlighted releases fall in this stretch; ones dated only by year can't be placed.</p>}
                  <div className="imsm-list">{shown.map((a) => <Artist key={`${view}-${a.name}`} artist={a} {...artistProps} onChanged={fetchView} />)}</div>
                </>
              )
          )}
        </>
      )}

      {draft && (
        <details className="imsm-fold">
          <summary><Icon n="tune" size={20} /><span>Settings</span><Icon n="down" size={22} /></summary>
          <div className="imsm-form" style={{ padding: '0 16px 16px' }}>
            <div className="two">
              <TextField label="MUZAK folder on the network" value={draft.muzak_path} onChange={(v) => setDraft({ ...draft, muzak_path: v })} className="imsm-mono" />
              <TextField label="Nightly scan time (UK time)" value={draft.schedule_time} onChange={(v) => setDraft({ ...draft, schedule_time: v })} placeholder="01:00" />
              <TextField label="MusicBrainz requests a second" type="number" step="0.1" min="0.1" max="1" value={draft.rate_limit_per_sec} onChange={(v) => setDraft({ ...draft, rate_limit_per_sec: parseFloat(v) || 1 })} />
              <label className="imsm-row" style={{ cursor: 'pointer' }}><span className="imsm-switch"><input type="checkbox" checked={draft.schedule_enabled} onChange={(e) => setDraft({ ...draft, schedule_enabled: e.target.checked })} /><i /></span>Scan every night</label>
            </div>
            <TextField label="Artists to leave out (comma-separated)" value={draft.excluded_artists.join(', ')} onChange={(v) => setDraft({ ...draft, excluded_artists: v.split(',').map((s) => s.trim()).filter(Boolean) })} />
            <div className="imsm-row end"><Btn icon="check" busy={saving} disabled={!dirty || saving} onClick={save}>Save settings</Btn></div>
          </div>
        </details>
      )}

      <Sheet open={sheet?.kind === 'mb'} onClose={() => setSheet(null)} title="Match on MusicBrainz" wideWidth="760px">
        {sheet?.kind === 'mb' && <MbSearch target={sheet} onClose={() => setSheet(null)} onDone={refreshAll} confirmIt={setConfirm} />}
      </Sheet>
      <Sheet open={sheet?.kind === 'folder'} onClose={() => setSheet(null)} title={sheet?.kind === 'folder' ? `${sheet.name}'s folder` : ''} wideWidth="760px">
        {sheet?.kind === 'folder' && <Folder target={sheet} onClose={() => setSheet(null)} onDone={refreshAll} confirmIt={setConfirm} />}
      </Sheet>
      <Sheet open={sheet?.kind === 'edit'} onClose={() => setSheet(null)} title={sheet?.kind === 'edit' ? `How to find ${sheet.artist.name}` : ''}
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setSheet(null)}>Cancel</Btn><Btn icon="sync" busy={sheet?.busy} disabled={sheet?.busy} onClick={saveNames}>Save and rescan</Btn></div>}>
        {sheet?.kind === 'edit' && (
          <div className="imsm-form">
            <p className="muted" style={{ margin: 0 }}>Matched on MusicBrainz as {sheet.mbName ? <b>{sheet.mbName}</b> : 'nothing yet'}.</p>
            <TextField label="Name to search MusicBrainz for" value={sheet.searchName} onChange={(v) => setSheet({ ...sheet, searchName: v })} placeholder={sheet.artist.name} />
            <TextField label="Other names (comma-separated)" value={sheet.aliases} onChange={(v) => setSheet({ ...sheet, aliases: v })} placeholder="For example: Perturbator, James Kent" />
          </div>
        )}
      </Sheet>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      <Fab label={running ? 'Scanning…' : 'Scan now'} icon="sync" disabled={running} onClick={scan} />
    </>
  );
}

export default function MusicScan({ theme = 'light', onThemeToggle, setCurrentPath }) {
  return (
    <ServicePage title="Music Scanner" icon="music" accent="pink" theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} sub="Your MUZAK library checked against MusicBrainz: what's out, what's coming, and what you're missing.">
      <Body />
    </ServicePage>
  );
}
