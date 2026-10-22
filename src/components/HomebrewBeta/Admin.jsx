// Homebrew (beta): Ingredient pictures (admin) - every ingredient in the recipe book and your brews, with the picture
// shown for it. Pick your own (upload, or find one on Pixabay) or go back to the one made for it. Uses the same
// /api/homebrew/admin endpoints as the classic admin section, so a choice made here shows in both.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ING_EMOJI } from './brewData';
import InviteSheet from './Invite';
import { useIngredientPictures, refreshIngredientPictures, showNewPicture, ingredientNorm } from './ingredientPics';
import { Icon, IconButton, Btn, FilterChip, Sheet, TextField, Spinner, Confirm, useSnack, useCountUp } from './ui';

const PAGE = 60;
const KINDS = [['all', 'All'], ['main', 'Main ingredients'], ['missing', 'No picture'], ['yours', 'Your pictures']];

export function getClipboardImage(e) {
  const cd = e?.clipboardData;
  if (!cd) return null;
  const items = cd.items;
  if (items && items.length > 0) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.type && it.type.startsWith('image/')) {
        const file = it.getAsFile();
        if (file) return file;
      }
    }
  }
  const files = cd.files;
  if (files && files.length > 0) {
    for (let i = 0; i < files.length; i++) {
      if (files[i].type && files[i].type.startsWith('image/')) {
        return files[i];
      }
    }
  }
  return null;
}

function Stat({ value, label }) {
  const v = useCountUp(value);
  return <div className="stat"><span className="v num">{v}</span><span className="k">{label}</span></div>;
}

// copies an ingredient's name (to search for a photo elsewhere, say); the icon turns into a tick for a moment
function CopyName({ name }) {
  const snack = useSnack();
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(name);
      setDone(true);
      snack(`Copied "${name}".`);
      setTimeout(() => setDone(false), 1500);
    } catch {
      snack('Couldn\'t copy it - your browser blocked the clipboard.', { error: true });
    }
  };
  return (
    <IconButton label={`Copy "${name}"`} onClick={copy} style={{ flex: 'none' }}>
      {done ? <span className="tick-in" style={{ display: 'inline-flex', color: 'var(--primary)' }}><Icon n="check" size={20} /></span> : <Icon n="copy" size={20} />}
    </IconButton>
  );
}

// Rename an ingredient: the new name goes into every recipe that uses it (each line keeps its amount and notes), and
// its picture follows. If the new name is already an ingredient, the two are merged - you're asked first. Undo puts
// everything back.
// Merge with: every recipe that uses this ingredient switches to another one you pick (each line keeps its amount and
// notes), and this one goes from the list. The one you pick keeps its picture, or takes this one's if it has none.
// Undo puts everything back. (The same server rename does the work - a rename onto an existing name is a merge.)
async function mergeInto(snack, from, into, onDone) {
  const res = await fetch('/api/homebrew/admin/ingredients/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: from.name, to: into.name }) });
  const r = await res.json().catch(() => ({}));
  if (!res.ok || r.success === false || !r.undoId) throw new Error(r.error || 'Couldn\'t merge them.');
  await refreshIngredientPictures();
  onDone(into.name);
  snack(`Merged ${from.name} into ${into.name} - ${r.recipes} ${r.recipes === 1 ? 'recipe' : 'recipes'} changed.`, {
    action: {
      label: 'Undo',
      onClick: async () => {
        try {
          const u = await fetch('/api/homebrew/admin/ingredients/rename/undo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ undoId: r.undoId }) });
          if (!u.ok) throw new Error((await u.json().catch(() => ({}))).error || 'Couldn\'t undo it.');
          await refreshIngredientPictures();
          onDone(from.name);
          snack(`${from.name} is back.`);
        } catch (e) { snack(e.message, { error: true }); }
      },
    },
  });
}
function MergeWith({ ing, all, onMerged, onDone }) {
  const snack = useSnack();
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState(false);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  // the likeliest first: names sharing a word with this one, then by how much they're used
  const mine = new Set(ing.name.toLowerCase().split(/[\s,&-]+/).filter((w) => w.length > 2));
  const shared = (i) => i.name.toLowerCase().split(/[\s,&-]+/).filter((w) => mine.has(w)).length;
  const options = all.filter((i) => i.norm !== ing.norm && words.every((w) => i.name.toLowerCase().includes(w)))
    .sort((a, b) => shared(b) - shared(a) || b.count - a.count).slice(0, 24);
  const go = async () => {
    setBusy(true);
    try { await mergeInto(snack, ing, pick, onMerged); onDone(); } catch (e) { snack(e.message, { error: true }); } finally { setBusy(false); setPick(null); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, '--fieldbg': 'var(--surface-c-low)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <TextField label={`Merge ${ing.name} into…`} value={q} onChange={setQ} style={{ flex: 1 }} autoFocus
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onDone(); } }}
          help={`Search your ingredients. The ${ing.count === 1 ? 'recipe' : `${ing.count} recipes`} using ${ing.name} will use the one you pick.`} />
        <Btn kind="text" onClick={onDone} style={{ marginTop: 8 }}>Cancel</Btn>
      </div>
      {/* the list scrolls inside its own box; the grid inside keeps every tile at full height */}
      <div style={{ maxHeight: 360, overflowY: 'auto', flex: 'none', paddingRight: 4 }}>
      <div className="adm-grid" style={{ gridAutoRows: 'min-content', alignContent: 'start' }}>
        {options.map((i) => (
          <button key={i.norm} type="button" className="adm-tile sl" onClick={() => setPick(i)}>
            <span className="pic">{i.hasImage ? <img src={`/api/homebrew/picture/${i.currentKey}`} alt="" loading="lazy" /> : <span aria-hidden="true">{ING_EMOJI[i.type] || '🧪'}</span>}</span>
            <span className="tx"><span className="nm">{i.name}</span><span className="st">{i.count} {i.count === 1 ? 'use' : 'uses'}</span></span>
          </button>
        ))}
        {!options.length && <p className="muted">No ingredient matches that.</p>}
      </div>
      </div>
      <Confirm open={Boolean(pick)} title={pick ? `Merge into ${pick.name}?` : ''}
        body={pick ? `The ${ing.count === 1 ? 'recipe' : `${ing.count} recipes`} using ${ing.name} will use ${pick.name} instead, keeping their amounts and notes, and ${ing.name} goes from the list.${pick.hasImage ? ` ${pick.name} keeps its picture.` : ing.hasImage ? ` ${pick.name} takes ${ing.name}'s picture.` : ''} You can undo it straight after.` : ''}
        okLabel={busy ? 'Merging…' : 'Merge'} onClose={() => setPick(null)} onOk={go} />
    </div>
  );
}

function RenameIngredient({ ing, all, onRenamed, onDone }) {
  const snack = useSnack();
  const [to, setTo] = useState(ing?.name || '');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const setEditing = (v) => { if (!v) onDone(); };
  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/homebrew/admin/ingredients/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: ing.name, to: to.trim() }) });
      const r = await res.json().catch(() => ({}));
      if (!res.ok || r.success === false || !r.undoId) throw new Error(r.error || 'Couldn\'t rename it.');
      await refreshIngredientPictures();
      onRenamed(to.trim());
      setEditing(false);
      snack(`${r.merged ? 'Merged into' : 'Renamed to'} ${to.trim()} in ${r.recipes} ${r.recipes === 1 ? 'recipe' : 'recipes'}.`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              const u = await fetch('/api/homebrew/admin/ingredients/rename/undo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ undoId: r.undoId }) });
              if (!u.ok) throw new Error((await u.json().catch(() => ({}))).error || 'Couldn\'t undo it.');
              await refreshIngredientPictures();
              onRenamed(ing.name);
              snack(`${ing.name} is back.`);
            } catch (e) { snack(e.message, { error: true }); }
          },
        },
      });
    } catch (e) { snack(e.message, { error: true }); } finally { setBusy(false); }
  };
  const submit = () => {
    const name = to.trim();
    if (!name || name === ing.name) { setEditing(false); return; }
    const existing = all.find((i) => i.norm !== ing.norm && i.name.toLowerCase() === name.toLowerCase());
    if (existing) setConfirm({ title: `Merge into ${existing.name}?`, body: `${ing.name} is in ${ing.count} ${ing.count === 1 ? 'recipe' : 'recipes'}. They'll all use ${existing.name} instead${existing.hasImage ? ', with its picture' : ''}. You can undo this straight after.`, okLabel: 'Merge', onOk: run });
    else run();
  };
  return (
    <>
      <div className="rename-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', '--fieldbg': 'var(--surface-c-low)' }}>
        <TextField label="New name" value={to} onChange={setTo} style={{ flex: 1 }} autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); } }}
          help={ing.count === 1 ? 'Changes it in the one recipe that uses it' : `Changes it in all ${ing.count} recipes that use it`} />
        <Btn kind="filled" busy={busy} onClick={submit} disabled={!to.trim()} style={{ marginTop: 8 }}>Rename</Btn>
        <Btn kind="text" onClick={() => setEditing(false)} style={{ marginTop: 8 }}>Cancel</Btn>
      </div>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
    </>
  );
}

function IngredientSheet({ ing, onClose, onChanged, all = [], onRenamed = () => {} }) {
  const [renaming, setRenaming] = useState(false);
  const [mergingWith, setMergingWith] = useState(false);
  useEffect(() => { if (!ing) setMergingWith(false); }, [ing]);
  useEffect(() => { if (!ing) setRenaming(false); }, [ing]);
  const snack = useSnack();
  const [busy, setBusy] = useState('');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState(null);
  const file = useRef(null);
  const open = Boolean(ing);
  const done = async (msg) => { await refreshIngredientPictures(); onChanged?.(); snack(msg); };
  const upload = async (f) => {
    if (!f || !ing) return;
    setBusy('upload');
    try {
      const res = await fetch(`/api/homebrew/admin/ingredients/upload?name=${encodeURIComponent(ing.name)}`, { method: 'POST', headers: { 'Content-Type': f.type || 'application/octet-stream' }, body: f });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.key) throw new Error(d.error || 'Couldn\'t use that picture.');
      showNewPicture(ing.name, d.key); await done(`New picture for ${ing.name}.`);
    } catch (e) { snack(e.message, { error: true }); } finally { setBusy(''); }
  };

  const pasteFromClipboard = async () => {
    if (!ing) return;
    setBusy('upload');
    try {
      if (!navigator.clipboard?.read) {
        throw new Error('Clipboard access unavailable. Press Ctrl+V directly to paste your copied image.');
      }
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const f = new File([blob], `${ing.name || 'ingredient'}.png`, { type: imageType });
          await upload(f);
          return;
        }
      }
      throw new Error('No image found on your clipboard. Copy an image first, then paste or press Ctrl+V.');
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        snack('Clipboard access was blocked by your browser. Press Ctrl+V directly to paste.', { error: true });
      } else {
        snack(e.message || 'Couldn\'t paste picture. Try pressing Ctrl+V.', { error: true });
      }
    } finally {
      setBusy('');
    }
  };

  useEffect(() => {
    if (!open || !ing) return;
    const handlePaste = (e) => {
      const f = getClipboardImage(e);
      if (f) {
        e.preventDefault();
        e.stopPropagation();
        upload(f);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [open, ing?.name]);

  const search = async () => {
    const term = (q || ing?.name || '').trim();
    if (!term) return;
    setBusy('search');
    try {
      const res = await fetch(`/api/homebrew/pixabay/search?q=${encodeURIComponent(term)}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Couldn\'t search for photos.');
      setHits(d.hits || []);
    } catch (e) { snack(e.message, { error: true }); } finally { setBusy(''); }
  };
  const pick = async (h) => {
    setBusy(`hit${h.id}`);
    try {
      const res = await fetch('/api/homebrew/admin/ingredients/pixabay/pick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: h.url, id: h.id, credit: h.credit, page: h.page, tags: h.tags, query: q || ing.name, name: ing.name }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.key) throw new Error(d.error || 'Couldn\'t use that photo.');
      showNewPicture(ing.name, d.key); await done(`New picture for ${ing.name}.`);
    } catch (e) { snack(e.message, { error: true }); } finally { setBusy(''); }
  };
  const useMade = async () => {
    setBusy('reset');
    try {
      const res = await fetch(`/api/homebrew/admin/ingredients/custom/${encodeURIComponent(ing.name)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Couldn\'t change it back.');
      await done(`${ing.name} is back to the picture made for it.`);
    } catch (e) { snack(e.message, { error: true }); } finally { setBusy(''); }
  };
  return (
    <Sheet open={open} onClose={onClose} title={ing?.name || ''} titleAfter={ing ? (
      <>
        <CopyName name={ing.name} />
        <IconButton icon="edit" label={`Rename "${ing.name}"`} on={renaming} onClick={() => setRenaming((v) => !v)} style={{ flex: 'none' }} />
      </>
    ) : null}>
      {ing && mergingWith && <div style={{ marginBottom: 16 }}><MergeWith key={ing.norm} ing={ing} all={all} onMerged={onRenamed} onDone={() => setMergingWith(false)} /></div>}
      {ing && renaming && <div style={{ marginBottom: 16 }}><RenameIngredient key={ing.norm} ing={ing} all={all} onRenamed={onRenamed} onDone={() => setRenaming(false)} /></div>}
      {ing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} onPaste={(e) => { const f = getClipboardImage(e); if (f) { e.preventDefault(); e.stopPropagation(); upload(f); } }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div className="adm-big">
              {ing.hasImage ? <img src={`/api/homebrew/picture/${ing.currentKey}`} alt={ing.name} /> : <span aria-hidden="true">{ING_EMOJI[ing.type] || '🧪'}</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <span className="t-tm">{ing.hasCustom ? 'Your picture' : ing.hasImage ? 'The picture made for it' : 'No picture yet'}</span>
              <span className="muted t-bm">Used in {ing.count} {ing.count === 1 ? 'recipe or brew' : 'recipes and brews'}{ing.isMain ? ', as a main ingredient' : ''}.</span>
            </div>
          </div>
          <div className="actrow">
            <Btn kind="filled" icon="upload" busy={busy === 'upload'} onClick={() => file.current?.click()}>Upload a photo</Btn>
            <Btn kind="tonal" icon="merge" onClick={() => { setRenaming(false); setMergingWith((v) => !v); }}>Merge with…</Btn>
            <Btn kind="tonal" icon="paste" busy={busy === 'upload'} onClick={pasteFromClipboard}>Paste picture</Btn>
            {ing.hasCustom && <Btn kind="tonal" icon="close" busy={busy === 'reset'} onClick={useMade}>Use the one made for it</Btn>}
          </div>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', '--fieldbg': 'var(--surface-c-low)' }}>
            <TextField label="Find a photo" value={q} onChange={setQ} style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === 'Enter') search(); }} help={`Leave empty to search for "${ing.name}"`} />
            <Btn kind="tonal" icon="search" busy={busy === 'search'} onClick={search} style={{ marginTop: 8 }}>Search</Btn>
          </div>
          {hits && (hits.length ? (
            <div className="picgrid">
              {hits.map((h) => (
                <button key={h.id} type="button" className="sl" onClick={() => pick(h)} title={h.tags}>
                  <img src={h.previewUrl || h.url} alt={h.tags || ''} loading="lazy" />
                  {busy === `hit${h.id}` && <span className="okmark"><Spinner size={16} /></span>}
                </button>
              ))}
            </div>
          ) : <p className="muted">No photos found. Try a simpler word.</p>)}
          <p className="t-bs muted">Photos found here come from Pixabay. You can also paste a copied picture or click Paste picture.</p>
        </div>
      )}
    </Sheet>
  );
}

export default function Admin({ headerEnd, onDataChanged }) {
  const d = useIngredientPictures();
  const snack = useSnack();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const [limit, setLimit] = useState(PAGE);
  const [sel, setSel] = useState(null);
  const [inviting, setInviting] = useState(false);
  const all = d?.ingredients || [];
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter((i) => (kind === 'all' || (kind === 'main' && i.isMain) || (kind === 'missing' && !i.hasImage) || (kind === 'yours' && i.hasCustom))
      && words.every((w) => i.name.toLowerCase().includes(w)));
  }, [all, q, kind]);
  const current = sel ? all.find((i) => i.norm === sel) || null : null;
  const uploadFor = async (targetIng, f) => {
    if (!f || !targetIng) return;
    try {
      const res = await fetch(`/api/homebrew/admin/ingredients/upload?name=${encodeURIComponent(targetIng.name)}`, {
        method: 'POST',
        headers: { 'Content-Type': f.type || 'application/octet-stream' },
        body: f,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.key) throw new Error(data.error || "Couldn't use that picture.");
      showNewPicture(targetIng.name, data.key); await refreshIngredientPictures();
      snack(`New picture for ${targetIng.name}.`);
    } catch (e) {
      snack(e.message, { error: true });
    }
  };

  return (
    <>
      <div className="shelf-head gutter">
        <div className="search">
          <Icon n="search" />
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Search ingredients" aria-label="Search ingredients" />
          {q && <IconButton icon="close" label="Clear search" onClick={() => setQ('')} />}
          {headerEnd}
        </div>
        {/* wraps on to more lines, so every choice is in view */}
        <div className="chips wrap">
          {KINDS.map(([k, l]) => <FilterChip key={k} on={kind === k} onClick={() => { setKind(k); setLimit(PAGE); }}>{l}</FilterChip>)}
        </div>
      </div>
      <div className="gutter" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
        {!d ? <div className="empty"><Spinner /><p>Loading the ingredients…</p></div> : (
          <>
            <div className="stats">
              <Stat value={d.totalCount || all.length} label="Ingredients" />
              <Stat value={d.withImageCount || 0} label="With a picture" />
              <Stat value={d.customCount || 0} label="Your pictures" />
              <Stat value={d.mainCount || 0} label="Main ingredients" />
            </div>
            <div className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Icon n="person" />
              <span style={{ flex: '1 1 220px' }} className="t-bm">Invite someone to Homebrew. They can read every recipe and brew, start brews of their own and keep their own favourites. You see their brews and they see yours.</span>
              <Btn kind="tonal" icon="add" onClick={() => setInviting(true)}>Invite someone</Btn>
            </div>
            <div className="sect" style={{ paddingTop: 4 }}>{list.length} {list.length === 1 ? 'ingredient' : 'ingredients'}</div>
            {list.length ? (
              <div className="adm-grid">
                {list.slice(0, limit).map((i, n) => (
                  <button
                    key={i.norm}
                    type="button"
                    className="adm-tile sl enter"
                    style={{ animationDelay: `${Math.min(n % PAGE, 16) * 20}ms` }}
                    onClick={() => setSel(i.norm)}
                    onPaste={(e) => {
                      const f = getClipboardImage(e);
                      if (f) {
                        e.preventDefault();
                        e.stopPropagation();
                        uploadFor(i, f);
                      }
                    }}
                  >
                    <span className="pic">{i.hasImage ? <img src={`/api/homebrew/picture/${i.currentKey}`} alt="" loading="lazy" /> : <span aria-hidden="true">{ING_EMOJI[i.type] || '🧪'}</span>}</span>
                    <span className="tx">
                      <span className="nm">{i.name}</span>
                      <span className="st">{i.count} {i.count === 1 ? 'use' : 'uses'}{i.isMain ? ' · main' : ''}{!i.hasImage && <> · <span className="miss">No picture</span></>}</span>
                    </span>
                    {i.hasCustom && <span className="mine" title="Your picture"><Icon n="check" size={18} /></span>}
                  </button>
                ))}
              </div>
            ) : <div className="empty"><h3>Nothing matches</h3><p>Try another word or filter.</p></div>}
            {limit < list.length && <Btn kind="tonal" onClick={() => setLimit((l) => l + PAGE)} style={{ alignSelf: 'center' }}>Show more ({list.length - limit} left)</Btn>}
            <div className="shelf-end" />
          </>
        )}
      </div>
      <IngredientSheet ing={current} onClose={() => setSel(null)} all={all} onRenamed={(name) => { const n = all.find((i) => i.name.toLowerCase() === name.toLowerCase()); setSel(n ? n.norm : ingredientNorm(name)); onDataChanged?.(); }} />
      <InviteSheet open={inviting} onClose={() => setInviting(false)} />
    </>
  );
}
