// The three admin tools rebuilt in the IMS design (26 Oct 2026, Simon: "the map urls, ingest and rulebooks admin
// screens look terrible still"): Map URLs (intranet addresses for library nodes, content sync and the SharePoint
// navigation scan), Ingest (the AI proposals demo) and Rulebooks (the BGG / publisher rulebook scraper). They do what
// Admin/URLMapper, Admin/ImportManager and Admin/RulebookScraper did, with the same APIs and the same stored keys.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, IconButton, Btn, TextField, TextArea, SelectField, Segmented, Slider, FilterChip, Sheet, Confirm, Spinner, useSnack } from '../HomebrewBeta/ui';
import { ItemCard, Empty } from './ServicePage';
import { ENTITY_TYPES, SCHEMAS } from '../../data/nodes';

const typeOf = (t) => ENTITY_TYPES[t] || ENTITY_TYPES[String(t || '').toUpperCase()] || ENTITY_TYPES.CONCEPT;
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage off */ } } };

/* ================================================================ Map URLs */

// the addresses we know for certain (bump URL_MAP_VERSION when they change, as before)
const AUTHORITATIVE_TT_MAP = {
  gov_risk: 'https://turntown.sharepoint.com/sites/GRM',
  ops_fm: 'https://turntown.sharepoint.com/sites/FACILITIES',
  ops_hr: 'https://turntown.sharepoint.com/sites/HR-ANZ',
  ops_it: 'https://turntown.sharepoint.com/sites/IT',
  ops_km: 'https://turntown.sharepoint.com/sites/KM',
  reg_anz: 'https://turntown.sharepoint.com/sites/GBG/SitePages/Australia-BG.aspx',
  reg_asia: 'https://turntown.sharepoint.com/sites/GBG/SitePages/Asia-BG.aspx',
  reg_na: 'https://turntown.sharepoint.com/sites/NAM',
  reg_uki: 'https://turntown.sharepoint.com/sites/RBG/SitePages/UK-Business-Generation.aspx',
  srv_psc: 'https://turntown.sharepoint.com/sites/FWORK',
  srv_sus: 'https://turntown.sharepoint.com/sites/Net-Zero',
  tt_group: 'https://turntown.sharepoint.com/sites/ABOUT-US',
  win_bid: 'https://turntown.sharepoint.com/sites/B2W/SitePages/Ourbidtowinprocess.aspx',
  win_root: 'https://turntown.sharepoint.com/sites/B2W',
};
const URL_MAP_VERSION = '3';
const SP_BASE = 'https://turntown.sharepoint.com';

const absUrl = (url) => {
  if (!url) return '';
  if (/^https?:\/\//.test(url)) return url;
  return url.startsWith('/') ? `${SP_BASE}${url}` : `${SP_BASE}/${url}`;
};
const navApiUrl = (base) => (base ? `${absUrl(base.trim()).replace(/\/$/, '')}/_api/navigation/MenuState?$format=json` : '');

// SharePoint's navigation, pasted or fetched as JSON or XML -> [{ title, url }] without duplicates
export function parseNavigation(text) {
  if (!text) return [];
  const items = [];
  const t = text.trim();
  let parsedJson = false;
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      const walk = (o) => {
        if (!o) return;
        if (Array.isArray(o)) { o.forEach(walk); return; }
        if (typeof o !== 'object') return;
        const title = o.Title || o.title || o.Label || o.label || o.Text || o.text;
        const url = o.Url || o.url || o.Href || o.href || o.SimpleUrl || o.simpleUrl;
        if (typeof title === 'string' && title.trim()) items.push({ title: title.trim(), url: String(url || '').trim() });
        Object.values(o).forEach((v) => { if (v && typeof v === 'object') walk(v); });
      };
      walk(JSON.parse(t));
      parsedJson = true;
    } catch { /* not JSON after all: read it as XML */ }
  }
  if (!parsedJson) {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    doc.querySelectorAll('MenuNode, Node, MenuItem, NavigationNode, link').forEach((n) => {
      const title = n.getAttribute('Title') || n.getAttribute('title') || n.getAttribute('Label') || n.getAttribute('label') || n.getAttribute('Text') || n.getAttribute('text');
      const url = n.getAttribute('Url') || n.getAttribute('url') || n.getAttribute('Href') || n.getAttribute('href');
      if (title && title.trim()) items.push({ title: title.trim(), url: (url || '').trim() });
    });
    try {
      doc.querySelectorAll('Entry, entry, Member, member, Properties, properties, element').forEach((e) => {
        const te = e.querySelector('Title, title, Label, label, Text, text');
        const ue = e.querySelector('Url, url, Href, href, Link, link, SimpleUrl, simpleurl');
        const title = te?.textContent?.trim();
        if (title && title !== 'Recent') items.push({ title, url: ue ? ue.textContent.trim() : '' });
      });
    } catch { /* an odd selector in an odd document */ }
    for (const m of text.matchAll(/(?:Title|title|Label|label|Text|text)="([^"]+)"[^>]+(?:Url|url|Href|href)="([^"]+)"/g)) items.push({ title: m[1].trim(), url: m[2].trim() });
    for (const m of text.matchAll(/(?:Url|url|Href|href)="([^"]+)"[^>]+(?:Title|title|Label|label|Text|text)="([^"]+)"/g)) items.push({ title: m[2].trim(), url: m[1].trim() });
    text.split(/<element>|<d:element>/i).forEach((block) => {
      const tm = block.match(/<(?:d:)?Title[^>]*>([^<]+)<\/(?:d:)?Title>/i);
      const um = block.match(/<(?:d:)?(?:SimpleUrl|Url|Href)[^>]*>([^<]+)<\/(?:d:)?(?:SimpleUrl|Url|Href)>/i);
      if (tm && tm[1].trim() && tm[1].trim() !== 'Recent') items.push({ title: tm[1].trim(), url: um ? um[1].trim() : '' });
    });
  }
  const seen = new Set();
  return items.reduce((out, it) => {
    const title = it.title.replace(/[\r\n\t]+/g, ' ').trim();
    const url = it.url.replace(/[\r\n\t]+/g, '').trim();
    const key = `${title.toLowerCase()}||${url.toLowerCase()}`;
    if (title.length > 1 && !seen.has(key)) { seen.add(key); out.push({ title, url }); }
    return out;
  }, []);
}

function loadUrls() {
  if (store.get('hive_url_map_version') !== URL_MAP_VERSION) {
    try { localStorage.removeItem('hive_graph_node_urls'); localStorage.removeItem('hive_mesh_node_urls'); } catch { /* storage off */ }
    store.set('hive_url_map_version', URL_MAP_VERSION);
    return { ...AUTHORITATIVE_TT_MAP };
  }
  try { return { ...AUTHORITATIVE_TT_MAP, ...JSON.parse(store.get('hive_graph_node_urls') || '{}') }; } catch { return { ...AUTHORITATIVE_TT_MAP }; }
}

// one node's address: the name, the address field and Open / Sync / Scan
function UrlRow({ node, level, url, open, hasKids, kidCount, onToggle, onChange, onSync, syncing, onScan }) {
  const t = typeOf(node.type);
  return (
    <div className={`imsa-urow ${url ? 'set' : ''}`} style={{ '--lv': level }}>
      <div className="who">
        {hasKids ? <IconButton icon="down" label={open ? `Close ${node.title}` : `Open ${node.title}`} className={`tw ${open ? '' : 'shut'}`} onClick={onToggle} /> : <span className="tw-sp" />}
        <i style={{ background: t.color }} />
        <span className="nm" title={node.title}>{node.title}</span>
        {hasKids ? <small>{kidCount}</small> : null}
      </div>
      <div className="adr">
        <Icon n={url ? 'link' : 'linkoff'} size={18} />
        <input value={url || ''} onChange={(e) => onChange(e.target.value)} placeholder="No address yet" aria-label={`Address for ${node.title}`} title={url ? absUrl(url) : ''} spellCheck={false} />
      </div>
      <div className="acts">
        <IconButton icon="open" label="Open the page" disabled={!url} onClick={() => window.open(absUrl(url), '_blank', 'noopener')} />
        <IconButton icon="sync" label={syncing ? 'Syncing its content' : 'Sync its content into this node'} disabled={!url || syncing} onClick={onSync} className={syncing ? 'spinning' : ''} />
        <IconButton icon="hub" label="Scan the site's menu for pages to add" disabled={!url} onClick={onScan} />
      </div>
    </div>
  );
}

// the navigation scan: fetch the site's menu (or take a paste), then pick the pages to add as children
function ScanSheet({ node, url, nodes, onClose, onImport }) {
  const snack = useSnack();
  const [tab, setTab] = useState('live');
  const [picking, setPicking] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [live, setLive] = useState('');
  const [liveErr, setLiveErr] = useState('');
  const [paste, setPaste] = useState(() => store.get(`hive_nav_xml_${node.id}`) || '');
  const [found, setFound] = useState([]);
  const [look, setLook] = useState({ id: null, q: '' });

  const suggest = (title) => {
    const low = title.toLowerCase();
    return [...new Set(nodes.filter((n) => n.title && n.title.length > 3 && new RegExp(`\\b${n.title.toLowerCase().replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(low)).map((n) => n.id))];
  };
  const take = (text) => {
    const parsed = parseNavigation(text);
    if (!parsed.length) return false;
    setFound(parsed.map((it, i) => ({ ...it, url: absUrl(it.url), id: `discovered_${i}`, checked: true, connections: suggest(it.title), type: 'CONCEPT' })));
    setPicking(true);
    return true;
  };
  const fetchLive = () => {
    setTab('live'); setLive(''); setLiveErr(''); setFetching(true); setPicking(false);
    fetch(`/api/sharepoint-nav?siteUrl=${encodeURIComponent(absUrl(url))}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}${r.statusText ? ` ${r.statusText}` : ''}`); return r.text(); })
      .then((text) => { setLive(text); setFetching(false); take(text); })
      .catch((e) => { setLiveErr(e.message || 'The SharePoint navigation could not be reached'); setFetching(false); });
  };
  useEffect(fetchLive, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text?.trim()) { snack('The clipboard is empty. Open the API link, copy everything (Ctrl+A, Ctrl+C) and try again.', { error: true }); return; }
      if (take(text)) setLive(text);
      else snack("That doesn't look like a navigation menu - copy the whole API response.", { error: true });
    } catch { snack('The clipboard is blocked here: paste it into the Paste tab instead.', { error: true }); }
  };
  const readPaste = () => { if (!take(paste)) snack('No pages could be read from that. It needs Title and Url values.', { error: true }); };
  const setItem = (id, patch) => setFound((p) => p.map((it) => (it.id === id ? { ...it, ...(typeof patch === 'function' ? patch(it) : patch) } : it)));
  const lookups = look.q.trim().length >= 2 ? nodes.filter((n) => n.title.toLowerCase().includes(look.q.toLowerCase()) && n.id !== node.id).slice(0, 5) : [];
  const chosen = found.filter((i) => i.checked).length;
  const preview = useMemo(() => (tab === 'tree' ? parseNavigation(paste || live) : []), [tab, paste, live]);
  const pretty = useMemo(() => { try { return JSON.stringify(JSON.parse(live), null, 2); } catch { return live; } }, [live]);

  const footer = (
    <>
      <Btn kind="text" onClick={onClose}>Cancel</Btn>
      {picking
        ? <Btn icon="add" disabled={!chosen} onClick={() => onImport(found.filter((i) => i.checked))}>Add {chosen} {chosen === 1 ? 'page' : 'pages'}</Btn>
        : tab === 'raw' ? <Btn icon="search" disabled={!paste.trim()} onClick={readPaste}>Read the paste</Btn>
          : <Btn icon="sync" busy={fetching} disabled={fetching} onClick={fetchLive}>{fetching ? 'Fetching' : 'Try again'}</Btn>}
    </>
  );

  return (
    <Sheet open onClose={onClose} title={`Pages under ${node.title}`} wideWidth="760px" footer={footer}
      actions={picking ? <IconButton icon="edit" label="Back to the menu source" onClick={() => setPicking(false)} /> : null}>
      {!picking ? (
        <div className="imsa-scan">
          <p className="muted" style={{ margin: 0 }}>IMS reads the site's navigation menu and lists its pages so you can add them under <b>{node.title}</b>. If SharePoint asks you to sign in, copy the menu from your browser instead.</p>
          <div className="imsm-row">
            <Btn kind="tonal" icon="lock" onClick={() => window.open(SP_BASE, '_blank', 'noopener')}>1. Sign in to SharePoint</Btn>
            <Btn kind="tonal" icon="open" onClick={() => window.open(navApiUrl(url), '_blank', 'noopener')}>2. Open the menu API</Btn>
            <Btn kind="tonal" icon="paste" onClick={fromClipboard}>3. Paste from the clipboard</Btn>
          </div>
          <Segmented label="Menu source" value={tab} onChange={setTab} options={[['live', 'Fetched'], ['raw', 'Paste'], ['tree', 'Preview']]} />
          {tab === 'live' && (
            fetching ? <div className="imsa-scanbox wait"><Spinner /><span>Fetching the site's navigation...</span></div>
              : liveErr ? (
                <div className="imsm-banner"><Icon n="lock" size={20} /><span><b>SharePoint wants you signed in</b> ({liveErr}). Sign in, open the menu API, copy the whole page and paste it from the clipboard - or into the Paste tab.</span></div>
              ) : live ? <pre className="imsa-pre imsa-scanbox">{pretty}</pre>
                : <div className="imsa-scanbox wait"><span>Nothing fetched yet.</span></div>
          )}
          {tab === 'raw' && (
            <TextArea label="The navigation menu (JSON or XML)" rows={12} className="imsa-mono" value={paste} spellCheck={false}
              onChange={(v) => { setPaste(v); store.set(`hive_nav_xml_${node.id}`, v); }} />
          )}
          {tab === 'tree' && (
            preview.length ? (
              <div className="imsa-scanbox imsa-navtree">
                <div className="muted">{preview.length} pages read from the {paste ? 'paste' : 'fetched menu'}</div>
                {preview.map((p, i) => <div key={i} className="it"><Icon n="link" size={16} /><span><b>{p.title}</b><small>{p.url || 'A heading with no page'}</small></span></div>)}
              </div>
            ) : <Empty icon="hub" title="No pages read yet">Fetch the menu or paste it first.</Empty>
          )}
        </div>
      ) : (
        <div className="imsa-scan">
          <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
            <p className="muted" style={{ margin: 0 }}>Tick the pages to add under <b>{node.title}</b>, choose what kind each is and what it links to.</p>
            <div className="imsm-row">
              <Btn kind="text" onClick={() => setFound((p) => p.map((i) => ({ ...i, checked: true })))}>All</Btn>
              <Btn kind="text" onClick={() => setFound((p) => p.map((i) => ({ ...i, checked: false })))}>None</Btn>
            </div>
          </div>
          <div className="imsa-picks">
            {found.map((it) => (
              <div key={it.id} className={`imsa-pick ${it.checked ? 'on' : ''}`}>
                <div className="top">
                  <IconButton icon={it.checked ? 'boxon' : 'boxoff'} on={it.checked} label={it.checked ? `Leave out ${it.title}` : `Add ${it.title}`} onClick={() => setItem(it.id, { checked: !it.checked })} />
                  <span className="txt"><b>{it.title}</b><small>{it.url || 'A heading with no page'}</small></span>
                  <SelectField label="Kind" value={it.type} onChange={(v) => setItem(it.id, { type: v })} options={Object.keys(ENTITY_TYPES).map((k) => [k, ENTITY_TYPES[k]?.label || k])} className="kind" />
                </div>
                <div className="links">
                  <span className="muted"><Icon n="hub" size={16} />Links to</span>
                  {(it.connections || []).map((cid) => (
                    <span key={cid} className="tag imsa-link">{nodes.find((n) => n.id === cid)?.title || cid}
                      <button type="button" aria-label="Remove this link" onClick={() => setItem(it.id, (x) => ({ connections: x.connections.filter((c) => c !== cid) }))}><Icon n="close" size={14} /></button>
                    </span>
                  ))}
                  <span className="imsa-look">
                    <input value={look.id === it.id ? look.q : ''} placeholder="Link a node" aria-label={`Link ${it.title} to a node`}
                      onFocus={() => setLook({ id: it.id, q: look.id === it.id ? look.q : '' })} onChange={(e) => setLook({ id: it.id, q: e.target.value })} />
                    {look.id === it.id && lookups.length > 0 && (
                      <span className="pop">{lookups.map((n) => (
                        <button key={n.id} type="button" className="sl" onClick={() => { setItem(it.id, (x) => ({ connections: x.connections.includes(n.id) ? x.connections : [...x.connections, n.id] })); setLook({ id: null, q: '' }); }}>{n.title}</button>
                      ))}</span>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}

export function MapUrls({ nodes = [], onUpdateNodes, onReviewSync }) {
  const snack = useSnack();
  const [urls, setUrls] = useState(loadUrls);
  const [q, setQ] = useState('');
  const [show, setShow] = useState('all');
  const [open, setOpen] = useState(() => new Set());
  const [syncing, setSyncing] = useState(null);
  const [scan, setScan] = useState(null);

  const visible = useMemo(() => nodes.filter((n) => n.visible !== false), [nodes]);
  const kids = useMemo(() => {
    const m = new Map();
    visible.forEach((n) => { if (n.parentId) m.set(n.parentId, [...(m.get(n.parentId) || []), n]); });
    return m;
  }, [visible]);
  const mapped = visible.filter((n) => urls[n.id]).length;
  const save = (next) => { setUrls(next); store.set('hive_graph_node_urls', JSON.stringify(next)); };

  const sync = async (node) => {
    const url = urls[node.id];
    if (!url) return;
    setSyncing(node.id);
    try {
      const r = await fetch('/api/graph/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: absUrl(url), nodeTitle: node.title, nodeType: node.type }) });
      if (!r.ok) throw new Error(`The sync failed (HTTP ${r.status})`);
      const data = await r.json();
      const field = (SCHEMAS[node.type] || []).map((f) => f.name)[0] || 'Definition Summary';
      onReviewSync?.(node, { [field]: data.content });
    } catch (e) { snack(e.message || 'The sync failed.', { error: true }); } finally { setSyncing(null); }
  };

  const importPages = (picked) => {
    const parent = scan;
    const made = picked.map((it) => ({
      id: `node_scanned_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, parentId: parent.id, title: it.title, type: it.type, visible: true,
      x: (parent.x || 1000) + (Math.random() * 200 - 100), y: (parent.y || 500) + 150 + (Math.random() * 50 - 25), content: {}, secondaryLinks: it.connections || [],
    }));
    const next = { ...urls };
    made.forEach((n, i) => { next[n.id] = absUrl(picked[i].url); });
    save(next);
    if (onUpdateNodes) { onUpdateNodes((prev) => [...prev, ...made]); snack(`${made.length} ${made.length === 1 ? 'page' : 'pages'} added under ${parent.title}.`); }
    else snack('The addresses are saved, but the library map could not take new nodes from here.', { error: true });
    setScan(null);
  };

  const rowFor = (n, level, hasKids = false) => (
    <UrlRow key={n.id} node={n} level={level} url={urls[n.id]} hasKids={hasKids} kidCount={(kids.get(n.id) || []).length}
      open={open.has(n.id) || level === 0 && !open.has(`!${n.id}`)}
      onToggle={() => setOpen((p) => {
        const s = new Set(p);
        const isOpen = s.has(n.id) || (level === 0 && !s.has(`!${n.id}`));
        if (level === 0) { if (isOpen) s.add(`!${n.id}`); else s.delete(`!${n.id}`); } else if (isOpen) s.delete(n.id); else s.add(n.id);
        return s;
      })}
      onChange={(v) => save({ ...urls, [n.id]: v })} syncing={syncing === n.id} onSync={() => sync(n)} onScan={() => setScan(n)} />
  );
  const tree = (n, level) => {
    const ks = kids.get(n.id) || [];
    const isOpen = open.has(n.id) || (level === 0 && !open.has(`!${n.id}`));
    return <React.Fragment key={n.id}>{rowFor(n, level, ks.length > 0)}{isOpen && ks.map((k) => tree(k, level + 1))}</React.Fragment>;
  };
  const flat = q.trim() || show !== 'all';
  const list = flat ? visible.filter((n) => (show === 'all' || (show === 'mapped' ? urls[n.id] : !urls[n.id])) && (!q.trim() || n.title.toLowerCase().includes(q.toLowerCase()) || String(urls[n.id] || '').toLowerCase().includes(q.toLowerCase()))) : [];

  return (
    <>
      <div className="imsm-stats four">
        {[['Nodes', visible.length, 'in the library map'], ['Mapped', mapped, 'have an address'], ['Unmapped', visible.length - mapped, 'still to do'], ['Coverage', `${visible.length ? Math.round((mapped / visible.length) * 100) : 0}%`, 'of the map']].map(([k, v, s]) => (
          <div key={k} className="imsm-stat"><span className="k">{k}</span><b>{v}</b><span className="s">{s}</span></div>
        ))}
      </div>
      <section className="imsm-card quiet">
        <h3><Icon n="link" size={20} />Intranet addresses</h3>
        <p className="muted" style={{ margin: 0 }}>Give library nodes their SharePoint page. Then, on each row, Sync pulls the page's text into the node for you to review, and Scan reads the site's menu so you can add its pages underneath. Addresses starting with / are on {SP_BASE.replace('https://', '')}.</p>
        <div className="imsm-row">
          <span className="tag"><Icon n="open" size={16} />Open the page</span>
          <span className="tag"><Icon n="sync" size={16} />Sync its content</span>
          <span className="tag"><Icon n="hub" size={16} />Scan its menu</span>
        </div>
      </section>
      <div className="imsa-bar">
        <div className="imsh-search imsa-search"><Icon n="search" size={20} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a node or address" aria-label="Find a node or address" /></div>
        <div className="chips">
          <FilterChip on={show === 'all'} onClick={() => setShow('all')}>All</FilterChip>
          <FilterChip on={show === 'mapped'} onClick={() => setShow('mapped')} count={mapped}>Mapped</FilterChip>
          <FilterChip on={show === 'unmapped'} onClick={() => setShow('unmapped')} count={visible.length - mapped}>Unmapped</FilterChip>
        </div>
      </div>
      <section className="imsm-card imsa-urls">
        {flat
          ? (list.length ? list.slice(0, 120).map((n) => rowFor(n, 0)) : <Empty icon="search" title="Nothing matches">Try another word or filter.</Empty>)
          : visible.filter((n) => !n.parentId).map((r) => tree(r, 0))}
        {flat && list.length > 120 && <p className="muted" style={{ margin: '8px 12px' }}>And {list.length - 120} more - narrow the search to see them.</p>}
      </section>
      {scan && <ScanSheet node={scan} url={urls[scan.id]} nodes={nodes} onClose={() => setScan(null)} onImport={importPages} />}
    </>
  );
}

/* ================================================================ Ingest (a demo) */

const DEMO_PROPOSALS = [
  { id: 'real_p1', type: 'update', targetId: 'srv_sus', field: 'Summary', oldValue: 'Integrating social and environmental goals into projects...', newValue: 'Turner & Townsend works with its partners to deliver sustainable change by accelerating the journey to net zero, focusing on environmental, social, and economic outcomes.', reason: 'Official definition synced from turnerandtownsend.com/solutions/sustainability/', impact: 620 },
  { id: 'real_p2', type: 'new_node', parentId: 'seg_inf', title: 'Clean Energy & Net Zero', nodeType: 'PROCEDURE', reason: 'Primary growth sector identified in Level-1 site navigation.', impact: 1450 },
  { id: 'real_p3', type: 'new_node', parentId: 'seg_re', title: 'Digital Performance Management', nodeType: 'PROCEDURE', reason: 'Detected in /solutions/digital/ as a core driver for project transparency.', impact: 1100 },
  { id: 'real_p4', type: 'connection', fromId: 'real_p3', toId: 'srv_sus', linkType: 'Data Support', reason: 'Semantic link detected between Digital tracking and Sustainability reporting in latest Insights.', impact: 420 },
];
const PROPOSAL_KIND = { update: ['edit', 'Update', 'warn'], new_node: ['add', 'New node', 'good'], connection: ['hub', 'New link', ''] };

export function Ingest({ nodes = [], onApplyChanges }) {
  const snack = useSnack();
  const [quota, setQuota] = useState(() => { try { return JSON.parse(store.get('hive_mesh_quota_v1')) || { used: 420000, max: 1000000 }; } catch { return { used: 420000, max: 1000000 }; } });
  useEffect(() => { store.set('hive_mesh_quota_v1', JSON.stringify(quota)); }, [quota]);
  const [mode, setMode] = useState('webpage');
  const [url, setUrl] = useState('');
  const [depth, setDepth] = useState(1);
  const [scanning, setScanning] = useState(false);
  const [asking, setAsking] = useState(false);
  const [proposals, setProposals] = useState([]);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const cost = Math.round(2500 * (mode === 'website' ? depth * 2.5 : 1));
  const pct = Math.min(100, (quota.used / quota.max) * 100);
  const title = (id) => nodes.find((n) => n.id === id)?.title || DEMO_PROPOSALS.find((p) => p.id === id)?.title || id;

  const analyse = () => {
    setScanning(true);
    timer.current = setTimeout(() => { setQuota((p) => ({ ...p, used: p.used + cost })); setProposals(DEMO_PROPOSALS); setScanning(false); }, 2500);
  };
  const approve = (p) => { onApplyChanges?.(p); setQuota((q) => ({ ...q, used: q.used + p.impact })); setProposals((l) => l.filter((x) => x.id !== p.id)); snack('Applied to the library map.'); };

  return (
    <>
      <div className="imsm-banner info"><Icon n="info" size={20} /><span><b>This is a demo.</b> It doesn't read the page yet: whatever address you give, it proposes the same four example changes, and the token counter is a pretend budget kept on this device.</span></div>
      <div className="imsa-layout">
        <section className="imsm-card">
          <h3><Icon n="upload" size={20} />Bring in a page or a site</h3>
          <Segmented label="What to read" value={mode} onChange={setMode} options={[['webpage', 'One page'], ['website', 'A whole site']]} />
          <TextField label={mode === 'website' ? "The site's address" : "The page's address"} value={url} onChange={setUrl} inputMode="url" placeholder="https://" />
          {mode === 'website' && <Slider label="How many links deep" value={depth} min={1} max={5} onChange={setDepth} lo="Just the top" hi="Five levels" />}
          <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">About <b>{cost.toLocaleString('en-GB')}</b> tokens</span>
            <Btn icon="sparkle" busy={scanning} disabled={!url.trim() || scanning} onClick={() => setAsking(true)}>{scanning ? 'Reading' : 'Find changes'}</Btn>
          </div>
        </section>
        <section className="imsm-card">
          <div className="imsm-row" style={{ justifyContent: 'space-between' }}><h3><Icon n="chart" size={20} />Token budget</h3><span className={`tag ${pct > 85 ? 'bad' : pct > 60 ? 'warn' : 'good'}`}>{Math.round(pct)}% used</span></div>
          <div className="imsm-pbar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
          <div className="imsm-row" style={{ justifyContent: 'space-between' }}><span className="muted">{quota.used.toLocaleString('en-GB')} used</span><span className="muted">of {quota.max.toLocaleString('en-GB')}</span></div>
          <p className="muted" style={{ margin: 0 }}>Reading big sites uses a lot of the Gemini allowance, so check the depth before you start.</p>
          <div><Btn kind="text" icon="sync" onClick={() => setQuota((q) => ({ ...q, used: 0 }))}>Reset the counter</Btn></div>
        </section>
      </div>
      {scanning && <div className="imsm-banner info"><Spinner size={20} /><span>Reading {url.trim() || 'the page'} and comparing it with the library map...</span></div>}
      {proposals.length > 0 && <h2 className="imsa-h2">Proposed changes</h2>}
      {proposals.length > 0 ? (
        <div className="imsm-list">
          {proposals.map((p) => {
            const [ic, label, tone] = PROPOSAL_KIND[p.type] || ['info', p.type, ''];
            return (
              <section key={p.id} className="imsm-card imsa-prop">
                <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
                  <h3><Icon n={ic} size={20} />{p.type === 'update' ? `${p.field} of ${title(p.targetId)}` : p.type === 'new_node' ? p.title : `${title(p.fromId)} → ${title(p.toId)}`}</h3>
                  <span className="imsm-row"><span className={`tag ${tone}`}>{label}</span><span className="tag">+{p.impact.toLocaleString('en-GB')} tokens</span></span>
                </div>
                <p className="muted" style={{ margin: 0 }}>{p.reason}</p>
                {p.type === 'update' && (
                  <div className="imsa-diff"><div className="old"><small>Now</small><span>{p.oldValue}</span></div><div className="new"><small>Proposed</small><span>{p.newValue}</span></div></div>
                )}
                {p.type === 'new_node' && <div className="imsm-row"><span className="tag"><i className="imsa-dot" style={{ background: typeOf(p.nodeType).color }} />{typeOf(p.nodeType).label}</span><span className="muted">under {title(p.parentId)}</span></div>}
                {p.type === 'connection' && <div className="imsm-row"><span className="tag">{p.linkType}</span></div>}
                <div className="imsm-row">
                  <Btn icon="check" onClick={() => approve(p)}>Apply</Btn>
                  <Btn kind="text" onClick={() => setProposals((l) => l.filter((x) => x.id !== p.id))}>Dismiss</Btn>
                </div>
              </section>
            );
          })}
        </div>
      ) : !scanning && <Empty icon="sparkle" title="No proposals yet">Give it an address and tap Find changes.</Empty>}
      <Confirm open={asking} title="Use the tokens?" body={`Reading ${mode === 'website' ? `the site ${depth} ${depth === 1 ? 'level' : 'levels'} deep` : 'the page'} will use about ${cost.toLocaleString('en-GB')} tokens of the Gemini allowance.`} okLabel="Go ahead" onOk={analyse} onClose={() => setAsking(false)} />
    </>
  );
}

/* ================================================================ Rulebooks */

const FOUND = (s) => s === 'Downloaded' || s === 'Already Exists';
const logTone = (t) => {
  const l = t.toLowerCase();
  if (l.includes('error') || l.includes('exception')) return 'bad';
  if (l.includes('warning') || l.includes('failed') || l.includes('could not find')) return 'warn';
  if (l.includes('success') || l.includes('downloaded') || l.includes('authenticated')) return 'good';
  if (t.startsWith('[System]')) return 'sys';
  return '';
};

export function Rulebooks() {
  const snack = useSnack();
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState({ percent: 0, current: 0, total: 0 });
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [one, setOne] = useState(null);
  const [user, setUser] = useState(() => store.get('bgg_username') || '');
  const [pass, setPass] = useState(() => store.get('bgg_password') || '');
  const [stopAsk, setStopAsk] = useState(false);
  const es = useRef(null);
  const term = useRef(null);

  const loadGames = async () => {
    setLoading(true);
    try { const d = await (await fetch('/api/admin/rulebooks/list')).json(); if (d.games) setGames(d.games); } catch { snack('The game list could not be loaded.', { error: true }); } finally { setLoading(false); }
  };
  const listen = () => {
    es.current?.close();
    const src = new EventSource('/api/admin/rulebooks/scrape/stream');
    es.current = src;
    src.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (d.type === 'status') { setRunning(d.status === 'running'); if (d.status === 'idle') { setOne(null); loadGames(); } }
        else if (d.type === 'log') { setLogs((p) => [...p, d.text].slice(-500)); if (d.text.includes('BGG login failed')) window.open('https://boardgamegeek.com/login', '_blank'); }
        else if (d.type === 'progress') setProgress({ percent: d.progress, current: d.current, total: d.total });
      } catch { /* a malformed event */ }
    };
  };
  useEffect(() => {
    fetch('/api/admin/rulebooks/scrape/status').then((r) => r.json()).then((d) => { setRunning(Boolean(d.active)); if (d.logs) setLogs(d.logs.map((l) => l.text)); }).catch(() => {});
    loadGames();
    listen();
    return () => es.current?.close();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (term.current) term.current.scrollTop = term.current.scrollHeight; }, [logs]);

  const keepCreds = () => { store.set('bgg_username', user); store.set('bgg_password', pass); };
  const post = async (path, body) => {
    const d = await (await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })).json();
    if (d.error) throw new Error(d.error);
    return d;
  };
  const runAll = async () => {
    keepCreds();
    try { await post('/api/admin/rulebooks/scrape', { bggUsername: user, bggPassword: pass }); setRunning(true); setLogs(['[System] Requesting full scraper start...']); setProgress({ percent: 0, current: 0, total: 0 }); listen(); }
    catch (e) { snack(e.message, { error: true }); }
  };
  const runOne = async (name) => {
    if (running) return;
    keepCreds(); setOne(name);
    try { await post('/api/admin/rulebooks/scrape/single', { gameName: name, deep: true, bggUsername: user, bggPassword: pass }); setRunning(true); setLogs([`[System] Requesting single scrape for '${name}' (deep=true)...`]); listen(); }
    catch (e) { snack(e.message, { error: true }); setOne(null); }
  };
  const stop = async () => { try { await post('/api/admin/rulebooks/scrape/stop'); } catch (e) { snack(e.message, { error: true }); } };
  const markFound = async (name) => {
    try { const r = await fetch('/api/admin/rulebooks/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game: name, status: 'Downloaded', url: 'Manual' }) }); if (!r.ok) throw new Error(); snack(`${name} marked as found.`); loadGames(); }
    catch { snack("The status couldn't be changed.", { error: true }); }
  };

  const counts = useMemo(() => ({ found: games.filter((g) => FOUND(g.status)).length, notfound: games.filter((g) => g.status === 'Not Found').length, pending: games.filter((g) => g.status === 'Pending').length }), [games]);
  const shown = games.filter((g) => g.name.toLowerCase().includes(q.toLowerCase()) && (filter === 'all' || (filter === 'downloaded' ? FOUND(g.status) : filter === 'notfound' ? g.status === 'Not Found' : g.status === 'Pending')));

  return (
    <>
      <div className="imsm-stats four">
        {[['Games', games.length, 'in the collection'], ['Found', counts.found, 'rulebooks saved'], ['Not found', counts.notfound, 'try a deep scrape'], ['Waiting', counts.pending, 'not tried yet']].map(([k, v, s]) => (
          <div key={k} className="imsm-stat"><span className="k">{k}</span><b>{v}</b><span className="s">{s}</span></div>
        ))}
      </div>
      <div className="imsa-layout">
        <section className="imsm-card">
          <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
            <h3><Icon n="book" size={20} />Fetch the rulebooks</h3>
            <span className={`tag ${running ? 'good' : ''}`}>{running ? (one ? `Scraping ${one}` : 'Running') : 'Idle'}</span>
          </div>
          <p className="muted" style={{ margin: 0 }}>Finds each game's rulebook PDF from its publisher or BoardGameGeek's uploaded files (English only), using Gemini search.</p>
          {running && progress.total > 0 && (
            <>
              <div className="imsm-pbar" role="progressbar" aria-valuenow={Math.round(progress.percent)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress.percent}%` }} /></div>
              <span className="muted">{progress.current} of {progress.total} games · {Math.round(progress.percent)}%</span>
            </>
          )}
          <div className="imsm-row">
            {running ? <Btn kind="tonal" icon="stop" onClick={() => setStopAsk(true)}>Stop</Btn> : <Btn icon="play" onClick={runAll}>Fetch them all</Btn>}
            <Btn kind="text" icon="sync" busy={loading} onClick={loadGames}>Refresh the list</Btn>
          </div>
        </section>
        <section className="imsm-card">
          <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
            <h3><Icon n="lock" size={20} />BoardGameGeek sign-in</h3>
            <Btn kind="text" icon="open" onClick={() => window.open('https://boardgamegeek.com/login', '_blank', 'noopener')}>Open BGG</Btn>
          </div>
          <p className="muted" style={{ margin: 0 }}>Needed for BGG's uploaded files. Kept on this device only.</p>
          <TextField label="Username" value={user} onChange={setUser} autoComplete="username" onBlur={keepCreds} />
          <TextField label="Password" type="password" value={pass} onChange={setPass} autoComplete="current-password" onBlur={keepCreds} />
        </section>
      </div>
      <details className="imsm-fold" open={running || undefined}>
        <summary><Icon n="code" size={20} /><span>The scraper's log{logs.length ? ` · ${logs.length} lines` : ''}</span><Icon n="down" size={22} /></summary>
        <div className="imsm-term imsa-rterm" ref={term}>
          {logs.length ? logs.map((l, i) => <div key={i} className={`ln ${logTone(l)}`}><span className="m">{l}</span></div>) : <p className="wait">Nothing yet. Fetch them all, or deep scrape one game below.</p>}
        </div>
      </details>
      <div className="imsa-bar">
        <div className="imsh-search imsa-search"><Icon n="search" size={20} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a game" aria-label="Find a game" /></div>
        <div className="chips">
          <FilterChip on={filter === 'all'} onClick={() => setFilter('all')} count={games.length}>All</FilterChip>
          <FilterChip on={filter === 'downloaded'} onClick={() => setFilter('downloaded')} count={counts.found}>Found</FilterChip>
          <FilterChip on={filter === 'notfound'} onClick={() => setFilter('notfound')} count={counts.notfound}>Not found</FilterChip>
          <FilterChip on={filter === 'pending'} onClick={() => setFilter('pending')} count={counts.pending}>Waiting</FilterChip>
        </div>
      </div>
      {shown.length ? (
        <div className="imsa-games">
          {shown.map((g) => {
            const ok = FOUND(g.status);
            return (
              <ItemCard key={g.name} icon={ok ? 'doc' : g.status === 'Not Found' ? 'warn' : 'book'} tone={ok ? '' : 'quiet'} title={g.name}
                meta={ok && g.url && g.url !== 'Manual' ? <a href={g.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>Where it came from</a> : ok && g.url === 'Manual' ? 'Marked by hand' : null}
                tags={<span className={`tag ${ok ? 'good' : g.status === 'Not Found' ? 'bad' : 'warn'}`}>{ok ? 'Found' : g.status === 'Not Found' ? 'Not found' : 'Waiting'}</span>}>
                {!ok && (
                  <>
                    <IconButton icon="check" label="Mark as found (you have the rulebook)" onClick={() => markFound(g.name)} />
                    <IconButton icon="search" label={one === g.name ? 'Deep scraping' : 'Deep scrape: search harder, using the publisher'} disabled={running} className={one === g.name ? 'spinning' : ''} onClick={() => runOne(g.name)} />
                  </>
                )}
              </ItemCard>
            );
          })}
        </div>
      ) : <Empty icon="book" title={games.length ? 'Nothing matches' : loading ? 'Loading the games' : 'No games yet'}>{games.length ? 'Try another word or filter.' : 'The list comes from your board game collection.'}</Empty>}
      <Confirm open={stopAsk} title="Stop the scraper?" body="It finishes the game it's on and stops. What it has found so far is kept." okLabel="Stop" danger onOk={stop} onClose={() => setStopAsk(false)} />
    </>
  );
}
