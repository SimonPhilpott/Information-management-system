// The admin screens in the IMS design (26 Oct 2026, Simon: "use the new design principles to improve them like we
// did with the run planner"). A full-screen page over the home screen with the IMS header and its sections as chips:
// Library map (counts, keeping it safe, search and the tree), Checkpoints, Deleted, Node types, Layout (the physics
// playground), Map URLs, Ingest and Rulebooks (AdminTools.jsx), Sharing (the ngrok tunnel) and About.
// It takes the same props the old Admin/AdminPanel did, and does the same things with them.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../HomebrewBeta/hbb.css';
import './ims-m.css';
import { Icon, IconButton, Btn, TextArea, SelectField, Segmented, FilterChip, Confirm, Slider, useSnack, useRipples, LayerProvider, SnackHost, TipHost, DarkCtx } from '../HomebrewBeta/ui';
import { ItemCard, Empty } from './ServicePage';
import { ENTITY_TYPES } from '../../data/nodes';
import { IMPORTANCE_TIERS } from '../Editor/IntelligenceDrawer';
import { MapUrls, Ingest, Rulebooks } from './AdminTools';
import { TONES, MODELS } from './Library';
import { ADMIN_FEATURES, ADMIN_MODULES, ADMIN_GUIDE } from './adminAbout';

const ROOMS = [
  ['map', 'Library map', 'hub'], ['library', 'Chat & library', 'chat'], ['checkpoints', 'Checkpoints', 'archive'], ['deleted', 'Deleted', 'del'], ['types', 'Node types', 'tune'],
  ['layout', 'Layout', 'explore'], ['urls', 'Map URLs', 'link'], ['ingest', 'Ingest', 'upload'], ['rulebooks', 'Rulebooks', 'book'],
  ['sharing', 'Sharing', 'public'], ['about', 'About', 'info'],
];
const when = (t) => new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const typeOf = (t) => ENTITY_TYPES[t] || ENTITY_TYPES[String(t || '').toUpperCase()] || ENTITY_TYPES.CONCEPT;

// one branch of the library map: the arrow opens it, the name opens the node
function Branch({ node, nodes, level = 0, onOpen }) {
  const [open, setOpen] = useState(level < 1);
  const kids = useMemo(() => nodes.filter((n) => n.parentId === node.id), [nodes, node.id]);
  const t = typeOf(node.type);
  return (
    <div className="imsa-br">
      <div className="row" style={{ paddingLeft: 4 + level * 18 }}>
        {kids.length ? <IconButton icon="down" label={open ? `Close ${node.title}` : `Open ${node.title}`} className={`tw ${open ? '' : 'shut'}`} onClick={() => setOpen(!open)} /> : <span className="tw-sp" />}
        <button type="button" className="nm sl" onClick={() => onOpen(node)} title="Open this node">
          <i style={{ background: t.color }} /><span>{node.title}</span>{kids.length ? <small>{kids.length}</small> : null}
        </button>
      </div>
      {open && kids.map((k, i) => <Branch key={`${k.id || 'n'}-${i}`} node={k} nodes={nodes} level={level + 1} onOpen={onOpen} />)}
    </div>
  );
}

// a node type or importance tier, with its three notes kept on this device (as before)
function DefCard({ color, label, idLabel, guidance, keys, defaults, onSave }) {
  const [v, setV] = useState(() => keys.map((k, i) => { try { return localStorage.getItem(k) || defaults[i] || ''; } catch { return defaults[i] || ''; } }));
  const save = (i) => { try { localStorage.setItem(keys[i], v[i]); } catch { /* storage off */ } onSave?.(i, v[i]); };
  const LABELS = ['What it is', 'How it maps', 'Examples'];
  return (
    <section className="imsm-card">
      <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
        <h3><i className="imsa-dot" style={{ background: color }} />{label}</h3>
        <span className="tag">{idLabel}</span>
      </div>
      {guidance && <p className="muted" style={{ margin: 0, whiteSpace: 'pre-line' }}>{guidance}</p>}
      <div className="imsa-three">
        {LABELS.map((l, i) => <TextArea key={l} label={l} rows={4} value={v[i]} onChange={(x) => setV((p) => p.map((y, j) => (j === i ? x : y)))} onBlur={() => save(i)} />)}
      </div>
    </section>
  );
}

// one on/off setting: an icon, what it is, what it's doing now, and a switch
function Setting({ icon, title, desc, on, onChange, disabled }) {
  return (
    <label className={`imsa-set ${disabled ? 'off' : ''}`}>
      <span className="ic"><Icon n={icon} size={22} /></span>
      <span className="tx"><b>{title}</b><small>{disabled ? 'Only for answers from your library.' : desc}</small></span>
      <span className="imsm-switch"><input type="checkbox" checked={Boolean(on)} disabled={disabled} onChange={() => onChange?.()} aria-label={title} /><i /></span>
    </label>
  );
}

function Body(props) {
  const { nodes = [], deletedNodes = [], onClose, onFocusNode, onRestoreNode, onReset, onBackup, onApplyAIProposal, onReviewSync, onGetMeshBackups, onCreateMeshBackup, onRestoreMeshBackup, library: lib = {} } = props;
  const snack = useSnack();
  const err = useCallback((m) => snack(m, { error: true }), [snack]);
  const [room, setRoom] = useState(() => { try { return localStorage.getItem('admin_room') || 'map'; } catch { return 'map'; } });
  const pick = (r) => { setRoom(r); try { localStorage.setItem('admin_room', r); } catch { /* ignore */ } };
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [backups, setBackups] = useState([]);
  const [detail, setDetail] = useState(null);
  const [tunnel, setTunnel] = useState({ status: 'disconnected', url: '', error: '', logs: [] });
  const [phys, setPhys] = useState({ d: 65, g: 45, s: 0.35, t: 60 });
  // the header stays in view and the room chips sit just under it, as on the service pages
  const scroller = useRef(null);
  const head = useRef(null);
  useEffect(() => {
    const el = head.current, sc = scroller.current;
    if (!el || !sc || typeof ResizeObserver === 'undefined') return undefined;
    const set = () => sc.style.setProperty('--imsm-head-h', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const loadBackups = useCallback(async () => { if (!onGetMeshBackups) return; try { setBackups((await onGetMeshBackups()) || []); } catch { /* none */ } }, [onGetMeshBackups]);
  useEffect(() => { loadBackups(); }, [loadBackups]);

  // the tunnel: polled while Sharing is open (the same rules as before: on the ngrok address it's clearly up)
  useEffect(() => {
    if (room !== 'sharing') return undefined;
    const viaNgrok = /ngrok-free\.app|ngrok\.io/.test(window.location.hostname);
    let live = true;
    const tick = async () => {
      try {
        const d = await (await fetch('/api/tunnel/status')).json();
        if (live) setTunnel(viaNgrok && d.status === 'disconnected' ? { ...d, status: 'connected', url: d.url || window.location.origin } : d);
      } catch { if (live && viaNgrok) setTunnel((p) => ({ ...p, status: 'connected', url: p.url || window.location.origin })); }
    };
    if (viaNgrok) setTunnel((p) => ({ ...p, status: 'connected', url: p.url || window.location.origin }));
    tick();
    const t = setInterval(tick, 3000);
    return () => { live = false; clearInterval(t); };
  }, [room]);
  const toggleTunnel = async () => {
    setBusy('tunnel');
    const running = tunnel.status === 'connected' || tunnel.status === 'connecting';
    try { const d = await (await fetch(running ? '/api/tunnel/stop' : '/api/tunnel/start', { method: 'POST' })).json(); setTunnel((p) => ({ ...p, status: d.status, url: d.url || p.url })); }
    catch (e) { err(e.message); } finally { setBusy(''); }
  };

  const roots = useMemo(() => nodes.filter((n) => !n.parentId), [nodes]);
  const found = useMemo(() => (search ? nodes.filter((n) => String(n.title || '').toLowerCase().includes(search.toLowerCase())).slice(0, 80) : []), [nodes, search]);
  const deletedFound = useMemo(() => (search && room === 'deleted' ? deletedNodes.filter((n) => String(n.title || '').toLowerCase().includes(search.toLowerCase())) : deletedNodes), [deletedNodes, search, room]);

  const recoveryPoint = async () => {
    setBusy('backup');
    try { await onBackup(); snack('Recovery point saved.'); } catch (e) { err(e?.message || 'The recovery point failed.'); } finally { setBusy(''); }
  };
  const checkpoint = async () => {
    setBusy('checkpoint');
    try { await onCreateMeshBackup(); snack('Checkpoint created.'); loadBackups(); } catch (e) { err(e?.message || 'The checkpoint failed.'); } finally { setBusy(''); }
  };

  // the layout preview (the same maths as the old playground)
  const preview = useMemo(() => {
    const { d, g, s, t } = phys;
    const links = [], dots = [];
    const curve = (x1, y1, x2, y2) => {
      if (t === 100) return `M${x1} ${y1}L${x2} ${y2}`;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, f = (100 - t) * 0.45;
      return `M${x1} ${y1}Q${mx - (dy / len) * f} ${my + (dx / len) * f} ${x2} ${y2}`;
    };
    dots.push({ x: 0, y: 0, r: 10, k: 'root', label: 'Root' });
    for (let i = 0; i < 3; i++) {
      const a1 = (i * 120 * Math.PI) / 180, x1 = d * Math.cos(a1), y1 = d * Math.sin(a1);
      links.push(curve(0, 0, x1, y1));
      dots.push({ x: x1, y: y1, r: 7, k: 'l1', label: `L1-${i + 1}` });
      for (let j = 0; j < 2; j++) {
        const a2 = a1 + (j === 0 ? -1 : 1) * g * (1 + s) * Math.PI / 180, x2 = 2 * d * Math.cos(a2), y2 = 2 * d * Math.sin(a2);
        links.push(curve(x1, y1, x2, y2));
        dots.push({ x: x2, y: y2, r: 5, k: 'l2', label: `L2-${i + 1}-${j + 1}` });
      }
    }
    return { links, dots };
  }, [phys]);

  const typeCount = useMemo(() => new Set(nodes.map((n) => n.type)).size, [nodes]);

  return (
    <div className="imsm-page">
      <div className="scroll" ref={scroller}>
        <div className="imsm-body wide">
          <header className="imsm-head imsa-top" ref={head}>
            <IconButton icon="close" label="Close admin" onClick={onClose} />
            <span className="imsm-tile acc-teal"><Icon n="admin" size={26} /></span>
            <h1 className="imsm-title">Admin</h1>
            <span className="grow" />
          </header>
          <p className="imsm-sub">The library's structure, its safety nets, imports, sharing and how it's all put together.</p>
          <div className="imsm-ptabs"><div className="chips">{ROOMS.map(([k, l, ic]) => <FilterChip key={k} on={room === k} onClick={() => pick(k)} lead={<Icon n={ic} size={18} />}>{l}</FilterChip>)}</div></div>

          {room === 'map' && (
            <>
              <div className="imsm-stats four">
                {[['Entities', nodes.length, 'in the library map'], ['Top level', roots.length, 'sections'], ['Kinds', typeCount, 'node types in use'], ['Deleted', deletedNodes.length, 'in the bin']].map(([k, v, s]) => (
                  <div key={k} className="imsm-stat"><span className="k">{k}</span><b>{v}</b><span className="s">{s}</span></div>
                ))}
              </div>
              <section className="imsm-card">
                <h3><Icon n="shield" size={20} />Keeping it safe</h3>
                <p className="muted" style={{ margin: 0 }}>A recovery point saves every node and folder to this computer in one go. Checkpoints (their own section) keep copies of the map you can go back to.</p>
                <div className="imsm-row">
                  <Btn icon="disk" busy={busy === 'backup'} onClick={recoveryPoint}>Save a recovery point</Btn>
                  <Btn kind="tonal" icon="sync" onClick={() => setConfirm({ title: 'Sync with the source file?', body: 'Nodes in the source file that are missing here are added back.', okLabel: 'Sync', onOk: onReset })}>Sync from the source</Btn>
                  <Btn kind="text" icon="explore" onClick={() => setConfirm({ title: 'Reset the layout?', body: 'Every node goes back to where the layout engine puts it.', okLabel: 'Reset', danger: true, onOk: onReset })}>Reset the layout</Btn>
                </div>
              </section>
              <div className="imsh-search imsa-search"><Icon n="search" size={20} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a node" aria-label="Find a node" /></div>
              {search ? (
                found.length ? <div className="imsm-list">{found.map((n) => (
                  <ItemCard key={`f-${n.id}`} title={n.title} meta={typeOf(n.type).label} onClick={() => onFocusNode(n)} tags={<span className="tag"><i className="imsa-dot" style={{ background: typeOf(n.type).color }} />{typeOf(n.type).label}</span>} />
                ))}</div> : <Empty icon="search" title="Nothing matches">Try another word.</Empty>
              ) : (
                <section className="imsm-card imsa-tree">
                  <h3><Icon n="hub" size={20} />The library map</h3>
                  <div>{roots.map((r, i) => <Branch key={`r-${r.id || i}`} node={r} nodes={nodes} onOpen={onFocusNode} />)}</div>
                </section>
              )}
            </>
          )}

          {room === 'library' && (
            <>
              <section className="imsm-card">
                <h3><Icon n="book" size={20} />Where answers come from</h3>
                <Segmented label="Answers from" value={lib.appMode === 'general' ? 'general' : 'kb'} onChange={(v) => lib.onModeChange?.(v)} options={[['kb', 'Your library'], ['general', 'Gemini']]} />
                <p className="muted" style={{ margin: 0 }}>{lib.appMode === 'general' ? 'The library chat answers from Gemini\'s general knowledge, not your documents.' : 'The library chat answers from your own documents and subjects.'}</p>
                <div className="imsa-sets">
                  <Setting icon="doc" title="Citations" on={lib.showCitations} onChange={lib.onToggleCitations} disabled={lib.appMode === 'general'}
                    desc={lib.showCitations ? 'Answers show the book and page each point came from.' : 'Answers come without the book and page references.'} />
                  <Setting icon="person" title="Personal books" on={lib.showPersonal} onChange={lib.onTogglePersonal} disabled={lib.appMode === 'general'}
                    desc={lib.showPersonal ? 'Your personal books are searched as well as the professional ones - and shown in the spatial graph.' : 'Professional books only, in answers and in the spatial graph.'} />
                </div>
              </section>
              <section className="imsm-card">
                <h3><Icon n="chat" size={20} />How the library chat answers</h3>
                <div className="imsa-three">
                  <SelectField label="Tone" value={lib.chatTone || 'friendly'} onChange={(v) => lib.onToneChange?.(v)} options={TONES.map(([k, l, d]) => [k, `${l} - ${d}`])} />
                  <SelectField label="Model" value={lib.currentModel || 'flash'} onChange={(v) => lib.onModelChange?.(v)} options={MODELS.map(([k, l, d]) => [k, `${l} - ${d}`])} />
                  {(lib.gems || []).length > 0 && <SelectField label="Mode" value={String((lib.gems.find((g) => g.is_active === 1) || lib.gems[0]).id)} onChange={(v) => lib.onActivateGem?.(lib.gems.find((g) => String(g.id) === v)?.id ?? v)} options={lib.gems.map((g) => [String(g.id), g.name])} />}
                </div>
              </section>
              <section className="imsm-card">
                <h3><Icon n="share" size={20} />The library</h3>
                <p className="muted" style={{ margin: 0 }}>The spatial graph is also on the rail, just above the admin cog.</p>
                <div className="imsm-row">
                  {lib.onOpenGraph && <Btn icon="share" onClick={lib.onOpenGraph}>Open the spatial graph</Btn>}
                  {lib.onOpenCatalog && <Btn kind="tonal" icon="book" onClick={lib.onOpenCatalog}>Browse the library</Btn>}
                  {lib.onOpenHnsw && <Btn kind="tonal" icon="bolt" onClick={lib.onOpenHnsw}>Fast index</Btn>}
                  {lib.onSync && <Btn kind="tonal" icon="sync" busy={Boolean(lib.syncStatus?.drive?.active || lib.syncStatus?.indexing?.active)} onClick={() => { lib.onSync(); snack('Syncing the library.'); }}>Sync the library now</Btn>}
                </div>
              </section>
            </>
          )}

          {room === 'checkpoints' && (
            <>
              <section className="imsm-card">
                <div className="imsm-row" style={{ justifyContent: 'space-between' }}><h3><Icon n="archive" size={20} />Checkpoints of the map</h3><Btn icon="add" busy={busy === 'checkpoint'} onClick={checkpoint}>New checkpoint</Btn></div>
                <p className="muted" style={{ margin: 0 }}>A copy of every node and connection as it stands. Restoring one replaces the map and reloads the page.</p>
              </section>
              {backups.length ? (
                <div className="imsm-list">{backups.map((b) => (
                  <div key={b.filename} className="imsa-cp">
                    <ItemCard icon="archive" title={when(b.timestamp)} meta={b.filename}
                      tags={<><span className="tag">{b.nodeCount} nodes</span><span className="tag">{b.connectionCount} connections</span></>}>
                      <IconButton icon="info" label="Details" on={detail === b.filename} onClick={() => setDetail(detail === b.filename ? null : b.filename)} />
                      <Btn kind="tonal" icon="sync" onClick={() => setConfirm({ title: `Restore the checkpoint from ${when(b.timestamp)}?`, body: 'The map goes back to that copy and the page reloads.', okLabel: 'Restore', danger: true, onOk: () => onRestoreMeshBackup(b.filename) })}>Restore</Btn>
                    </ItemCard>
                    {detail === b.filename && <pre className="imsa-pre">{`File      ${b.filename}\nSaved     ${new Date(b.timestamp).toString()}\nNodes     ${b.nodeCount}\nLinks     ${b.connectionCount}`}</pre>}
                  </div>
                ))}</div>
              ) : <Empty icon="archive" title="No checkpoints yet">Make one before a big change.</Empty>}
            </>
          )}

          {room === 'deleted' && (
            <>
              <div className="imsh-search imsa-search"><Icon n="search" size={20} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find something deleted" aria-label="Find something deleted" /></div>
              {deletedFound.length ? (
                <div className="imsm-list">{deletedFound.map((n) => (
                  <ItemCard key={`d-${n.id}`} icon="del" tone="quiet" title={n.title} meta={typeOf(n.type).label}>
                    <Btn kind="tonal" icon="sync" onClick={() => { onRestoreNode(n.id); snack(`${n.title} is back.`); }}>Restore</Btn>
                  </ItemCard>
                ))}</div>
              ) : <Empty icon="del" title={search ? 'Nothing matches' : 'The bin is empty'}>Deleted nodes wait here until you restore them.</Empty>}
            </>
          )}

          {room === 'types' && (
            <>
              <section className="imsm-card quiet">
                <h3><Icon n="tune" size={20} />What each kind of node means</h3>
                <p className="muted" style={{ margin: 0 }}>These notes teach the AI what each node type and importance tier is for when it reasons over the library. They're kept on this device and saved as you leave each box.</p>
              </section>
              <h2 className="imsa-h2">Node types</h2>
              {Object.entries(ENTITY_TYPES).map(([key, c]) => (
                <DefCard key={key} color={c.color} label={c.label} idLabel={key} guidance={c.guidance}
                  keys={[`hive_def_desc_${key}`, `hive_def_mapping_${key}`, `hive_def_examples_${key}`]}
                  defaults={[c.description, c.mappingSummary, c.examples]}
                  onSave={(i, val) => { if (i === 0) c.description = val; else if (i === 1) c.mappingSummary = val; else c.examples = val; }} />
              ))}
              <h2 className="imsa-h2">Importance tiers</h2>
              {IMPORTANCE_TIERS.map((tier) => (
                <DefCard key={tier.id} color={tier.color} label={tier.label} idLabel={`Tier ${tier.id}`}
                  keys={[`hive_tier_desc_${tier.id}`, `hive_tier_mapping_${tier.id}`, `hive_tier_examples_${tier.id}`]}
                  defaults={[tier.description, tier.mappingSummary, '']}
                  onSave={(i, val) => { if (i === 0) tier.description = val; else if (i === 1) tier.mappingSummary = val; }} />
              ))}
            </>
          )}

          {room === 'layout' && (
            <>
              <div className="imsa-layout">
                <section className="imsm-card">
                  <h3><Icon n="tune" size={20} />Layout physics</h3>
                  <p className="muted" style={{ margin: 0 }}>A playground for how the spatial graph arranges the library: move the sliders and watch the preview.</p>
                  <Slider label={`Level spacing · ${phys.d}px`} value={phys.d} min={30} max={120} onChange={(v) => setPhys((p) => ({ ...p, d: Number(v) }))} lo="Tight" hi="Spread out" />
                  <small className="muted">How far each level sits from its parent.</small>
                  <Slider label={`Fanning angle · ${phys.g}°`} value={phys.g} min={15} max={90} onChange={(v) => setPhys((p) => ({ ...p, g: Number(v) }))} lo="Clustered" hi="Fanned out" />
                  <small className="muted">The spread between brothers and sisters of the same parent.</small>
                  <Slider label={`Label cushion · ${phys.s.toFixed(2)}×`} value={Math.round(phys.s * 100)} min={10} max={80} onChange={(v) => setPhys((p) => ({ ...p, s: Number(v) / 100 }))} lo="Close" hi="Roomy" />
                  <small className="muted">Extra room so neighbouring names never write over each other.</small>
                  <Slider label={`Line straightness · ${phys.t}%`} value={phys.t} min={0} max={100} onChange={(v) => setPhys((p) => ({ ...p, t: Number(v) }))} lo="Curved" hi="Straight" />
                  <small className="muted">At 100% the links are straight; lower bows them round the middle.</small>
                </section>
                <section className="imsm-card imsa-preview">
                  <h3><Icon n="explore" size={20} />Preview</h3>
                  <svg viewBox="-250 -250 500 500" role="img" aria-label="The layout with these settings">
                    <circle cx="0" cy="0" r={phys.d} className="ring" />
                    <circle cx="0" cy="0" r={phys.d * 2} className="ring" />
                    {preview.links.map((d, i) => <path key={i} d={d} className="ln" />)}
                    {preview.dots.map((n) => (
                      <g key={n.label}><circle cx={n.x} cy={n.y} r={n.r} className={`n ${n.k}`} /><text x={n.x} y={n.y + (n.k === 'l2' ? 16 : -14)} textAnchor="middle" className="lb">{n.label}</text></g>
                    ))}
                  </svg>
                  <div className="imsm-row">{[['Spread', `${phys.g}°`], ['Stiffness', (phys.t / 100).toFixed(2)], ['Rings', `${phys.d}px · ${phys.d * 2}px`]].map(([k, v]) => <span key={k} className="tag">{k}: {v}</span>)}</div>
                </section>
              </div>
              <details className="imsm-fold">
                <summary><Icon n="calc" size={20} /><span>How the layout maths works</span><Icon n="down" size={22} /></summary>
                <div className="imsa-maths">
                  <h4>1. Concentric orbits</h4>
                  <p>Nodes sit on rings fanning out from the centre: the root at 0, level one on a ring at one level-spacing, level two at two.</p>
                  <pre className="imsa-pre">radius = depth × parentDistance</pre>
                  <h4>2. In 3D</h4>
                  <p>Each place is worked out as a radius and two angles, then turned into X, Y and Z for drawing.</p>
                  <pre className="imsa-pre">{'X = r × sin(θ) × cos(φ)\nY = r × sin(θ) × sin(φ)\nZ = r × cos(θ)'}</pre>
                  <h4>3. Keeping names apart</h4>
                  <pre className="imsa-pre">spread angle = childGap × (1 + siblingMultiplier)</pre>
                  <h4>4. Curved links</h4>
                  <pre className="imsa-pre">curve depth = (100 − connectionTension) × scale</pre>
                </div>
              </details>
            </>
          )}

          {room === 'urls' && <MapUrls nodes={nodes} onUpdateNodes={props.onUpdateNodes} onReviewSync={onReviewSync} />}
          {room === 'ingest' && <Ingest nodes={nodes} onApplyChanges={onApplyAIProposal} />}
          {room === 'rulebooks' && <Rulebooks />}

          {room === 'sharing' && (
            <>
              <section className="imsm-card">
                <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
                  <h3><Icon n="public" size={20} />Sharing outside the house</h3>
                  <span className={`tag ${tunnel.status === 'connected' ? 'good' : tunnel.status === 'error' ? 'bad' : tunnel.status === 'connecting' ? 'warn' : ''}`}>{tunnel.status === 'connected' ? 'Online' : tunnel.status === 'connecting' ? 'Connecting' : tunnel.status === 'error' ? 'Failed' : 'Offline'}</span>
                </div>
                <p className="muted" style={{ margin: 0 }}>IMS reaches the outside world through your ngrok address, so you can use it on your phone when you're out.</p>
                {tunnel.status === 'connected' && tunnel.url && (
                  <div className="imsa-url"><Icon n="link" size={20} /><code>{tunnel.url}</code><IconButton icon="copy" label="Copy the address" onClick={() => { navigator.clipboard?.writeText(tunnel.url); snack('Address copied.'); }} /></div>
                )}
                {tunnel.error && <div className="imsm-banner"><Icon n="warn" size={20} /><span>{tunnel.error}</span></div>}
                <div className="imsm-row">
                  <Btn icon={tunnel.status === 'connected' ? 'stop' : 'play'} kind={tunnel.status === 'connected' ? 'tonal' : 'filled'} busy={busy === 'tunnel' || tunnel.status === 'connecting'} onClick={tunnel.status === 'connected' ? () => setConfirm({ title: 'Take IMS offline?', body: 'The ngrok address stops working until you start it again - including on your phone.', okLabel: 'Take it offline', danger: true, onOk: toggleTunnel }) : toggleTunnel}>
                    {tunnel.status === 'connected' ? 'Take it offline' : 'Go online'}
                  </Btn>
                </div>
              </section>
              <details className="imsm-fold">
                <summary><Icon n="doc" size={20} /><span>The tunnel's log</span><Icon n="down" size={22} /></summary>
                <pre className="imsa-pre imsa-log">{tunnel.logs?.length ? tunnel.logs.join('\n') : 'Waiting for the tunnel to start...'}</pre>
              </details>
            </>
          )}

          {room === 'about' && (
            <>
              <h2 className="imsa-h2">What IMS can do</h2>
              <div className="imsa-feats">
                {ADMIN_FEATURES.map((f) => (
                  <section key={f.title} className="imsm-card">
                    <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
                      <span className="tag" style={{ background: `${f.color}22`, color: f.color }}>{f.tag}</span>
                      <span className="tag">{f.status}</span>
                    </div>
                    <h3>{f.title}</h3>
                    <p className="muted" style={{ margin: 0 }}>{f.description}</p>
                    <ul className="imsa-ticks">{f.bullets.map((b) => <li key={b}><Icon n="check" size={18} />{b}</li>)}</ul>
                  </section>
                ))}
              </div>
              <h2 className="imsa-h2">How it's built</h2>
              <div className="imsa-feats">
                {ADMIN_MODULES.map((g) => (
                  <section key={g.cat} className="imsm-card">
                    <h3><Icon n="code" size={20} />{g.cat}</h3>
                    <div className="imsa-mods">{g.files.map((f) => <div key={f.n}><b>{f.n}</b><span className="muted">{f.d}</span></div>)}</div>
                  </section>
                ))}
              </div>
              <h2 className="imsa-h2">The user guide</h2>
              <div className="imsa-feats">
                {ADMIN_GUIDE.map((g) => (
                  <section key={g.cat} className="imsm-card">
                    <h3>{g.cat}</h3>
                    <div className="imsa-mods">{g.items.map((i) => <div key={i.n}><b>{i.n}</b><span className="muted">{i.d}</span></div>)}</div>
                  </section>
                ))}
              </div>
              <section className="imsm-card">
                <h3><Icon n="tune" size={20} />Configuration</h3>
                <div className="imsa-kv">
                  {[['Backups', 'd:\\Information management system\\backups'], ['Vector search', 'In-process HNSW (41,000+ vectors)'], ['Live voice', 'Gemini Live, both ways (180 ms jitter guard)'], ['Graph engine', 'Fluid, 60 fps'], ['Mesh app version', '1.4.0']].map(([k, v]) => <div key={k}><span className="muted">{k}</span><b>{v}</b></div>)}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
    </div>
  );
}

// isOpen, onClose and the library's state, as the old Admin/AdminPanel took them
export default function Admin(props) {
  const root = useRef(null);
  const [node, setNode] = useState(null);
  useRipples(root);
  const dark = props.theme === 'dark';
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.hbb.imsm.imsa-page .scrim')) props.onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);
  if (props.isOpen === false) return null;
  return (
    <div className={`hbb imsm imsa-page acc-teal ${dark ? 'dark' : ''}`} ref={(el) => { root.current = el; if (el && el !== node) setNode(el); }}>
      <DarkCtx.Provider value={dark}>
        <LayerProvider root={node}>
          <SnackHost>
            <TipHost>{node && <Body {...props} />}</TipHost>
          </SnackHost>
        </LayerProvider>
      </DarkCtx.Provider>
    </div>
  );
}
