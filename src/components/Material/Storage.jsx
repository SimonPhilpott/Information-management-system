// Storage in the IMS design (24 Oct 2026): what the PDF library, its vector embeddings and everything else IMS keeps
// take up on disk - per subject, with the two space savers (identical PDFs stored once, compact int8 vectors) and
// the backups they leave. Measure again is the button in the bottom right. The same /api/storage requests as before
// (Dashboard/StoragePortal.jsx).
import React, { useEffect, useState } from 'react';
import ServicePage, { Fab } from './ServicePage';
import { Icon, Btn, Confirm, useSnack, Spinner } from '../HomebrewBeta/ui';

const GROUP_COLOUR = { LOTR: '#b45309', Arkham: '#0f766e', Diabetes: '#be123c', Technology: '#1d4ed8', 'Board Games': '#7c3aed' };
const PDF = '#0284c7', VEC = '#9333ea';
const mb = (n) => `${Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`;
const size = (bytes) => { const b = Number(bytes || 0); if (!b) return '0 KB'; if (b < 1048576) return `${Math.max(1, Math.round(b / 1024)).toLocaleString('en-GB')} KB`; return `${(b / 1048576).toLocaleString('en-GB', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`; };

function Body() {
  const snack = useSnack();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState({});
  const [confirm, setConfirm] = useState(null);
  const load = async (fresh = false) => {
    if (fresh) setBusy('measure');
    try { const j = await (await fetch(`/api/storage${fresh ? '?fresh=1' : ''}`)).json(); if (j.success) setData(j); } catch (e) { snack(e.message, { error: true }); }
    if (fresh) setBusy('');
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (key, url, method = 'POST') => {
    setBusy(key);
    try {
      const j = await (await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'DELETE' ? undefined : '{}' })).json();
      if (!j.success) throw new Error(j.error || 'That didn\'t work.');
      const r = j.result || {};
      snack(r.savedMB != null ? `Done: ${mb(r.savedMB)} saved.` : r.deletedMB != null ? `Deleted ${mb(r.deletedMB)}.` : r.restored != null ? `Put back ${r.restored} file${r.restored === 1 ? '' : 's'}.` : 'Done.');
      await load(true);
    } catch (e) { snack(e.message, { error: true }); }
    setBusy('');
  };
  const act = (key, url, method, title, body) => (title ? setConfirm({ title, body, okLabel: 'Go ahead', danger: method === 'DELETE', onOk: () => run(key, url, method) }) : run(key, url, method));

  if (!data) return <div className="imsm-empty"><Spinner /><span>Measuring…</span></div>;
  const groups = data.groups || [];
  const maxGroup = Math.max(1, ...groups.map((g) => g.pdfMB + g.vectorMB));
  const libraryMB = groups.reduce((n, g) => n + g.pdfMB + g.vectorMB, 0);
  const otherMB = (data.other || []).reduce((n, o) => n + o.MB, 0);
  const maxOther = Math.max(1, ...(data.other || []).map((o) => o.MB));
  const v = data.vectors;
  return (
    <>
      <div className="imsm-stats">
        <div className="imsm-stat"><span className="k"><Icon n="doc" size={16} />Library PDFs</span><b>{mb(data.pdfs.physicalMB)}</b><span className="s">{data.pdfs.savedByLinksMB > 0 ? `${mb(data.pdfs.savedByLinksMB)} saved by storing duplicates once` : 'No shared copies yet'}</span></div>
        <div className="imsm-stat"><span className="k"><Icon n="chart" size={16} />Vector embeddings</span><b>{mb(v.MB)}</b><span className="s">{v.floatFiles ? `${v.floatFiles} file${v.floatFiles === 1 ? '' : 's'} still in the old format` : `All ${v.packedFiles} subject files compact`}</span></div>
        <div className="imsm-stat"><span className="k"><Icon n="archive" size={16} />Everything else</span><b>{mb(otherMB)}</b><span className="s">Backups, the database, chronicle audio and art, logs…</span></div>
        <div className="imsm-stat"><span className="k"><Icon n="admin" size={16} />In all</span><b>{mb(data.totalMB)}</b><span className="s">Measured {new Date(data.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></div>
      </div>

      {v.backupMB > 0 && (
        <div className="imsm-banner warn"><Icon n="info" size={20} /><span style={{ flex: 1 }}><b>{mb(v.backupMB)} of the old vectors kept as a backup.</b> The library uses the compact ones now{data.lastQuantise ? ` (worst likeness to the originals: ${data.lastQuantise.worstCosine})` : ''}. Once library search answers as well as before, the backup can go.</span>
          <span className="imsm-row"><Btn kind="tonal" busy={busy === 'restore'} onClick={() => act('restore', '/api/storage/vector-backup/restore', 'POST', 'Put the original vectors back?', 'Search will use them again.')}>Put them back</Btn><Btn busy={busy === 'delbak'} onClick={() => act('delbak', '/api/storage/vector-backup', 'DELETE', `Delete the ${mb(v.backupMB)} backup?`, 'Search already uses the compact files.')}>Delete the backup</Btn></span></div>
      )}
      {v.staleBackupMB > 0 && (
        <div className="imsm-banner info"><Icon n="archive" size={20} /><span style={{ flex: 1 }}><b>{mb(v.staleBackupMB)} of old vector files archived.</b> These {v.staleBackupFiles} files are from earlier subject names; everything in the library is indexed in the current ones.</span>
          <span className="imsm-row"><Btn kind="tonal" busy={busy === 'reststale'} onClick={() => act('reststale', '/api/storage/restore-stale-vectors', 'POST', 'Put the old vector files back?')}>Put them back</Btn><Btn busy={busy === 'delstale'} onClick={() => act('delstale', '/api/storage/stale-vector-backup', 'DELETE', `Delete the ${mb(v.staleBackupMB)} of old vector files for good?`)}>Delete them</Btn></span></div>
      )}
      {v.orphanFiles > 0 && (
        <div className="imsm-banner warn"><Icon n="info" size={20} /><span style={{ flex: 1 }}><b>{v.orphanFiles} vector file{v.orphanFiles === 1 ? '' : 's'} ({mb(v.orphanMB)}) no longer match the library.</b></span>
          <Btn busy={busy === 'prune'} onClick={() => act('prune', '/api/storage/clean-stale-vectors', 'POST', `Tidy away ${v.orphanFiles} unused vector files (${mb(v.orphanMB)})?`)}>Tidy them away</Btn></div>
      )}

      <section className="imsm-card">
        <div className="imsm-row"><h3 style={{ flex: 1, margin: 0 }}>The library by subject</h3><span className="imsm-key"><i style={{ background: PDF }} />PDFs</span><span className="imsm-key"><i style={{ background: VEC }} />Vectors</span><b>{mb(libraryMB)}</b></div>
        {groups.map((g) => (
          <div key={g.group}>
            <button type="button" className="imsm-bar sl" onClick={() => setOpen((o) => ({ ...o, [g.group]: !o[g.group] }))} aria-expanded={Boolean(open[g.group])}>
              <span className="top"><span className="nm"><i style={{ background: GROUP_COLOUR[g.group] || '#888' }} />{g.group}<Icon n="down" size={18} /></span><span className="muted">PDFs {size(g.pdfBytes)} ({g.pdfFiles}) · vectors {size(g.vectorBytes)} · <b>{size(g.pdfBytes + g.vectorBytes)}</b></span></span>
              <span className="track"><i style={{ width: `${(g.pdfMB / maxGroup) * 100}%`, background: PDF }} /><i style={{ width: `${(g.vectorMB / maxGroup) * 100}%`, background: VEC }} /></span>
            </button>
            {open[g.group] && (
              <div className="imsm-sublist">
                {g.subjects.map((s) => <div key={s.subject}><b>{s.subject}</b><span className="muted">{s.pdfFiles > 0 ? `PDFs ${size(s.pdfBytes)} (${s.pdfFiles}) · vectors ${size(s.vectorBytes)}` : `Vectors ${size(s.vectorBytes)} (vectors only)`}</span></div>)}
              </div>
            )}
          </div>
        ))}
        {data.pdfs.orphanFiles > 0 && <p className="muted" style={{ margin: 0 }}>Also {data.pdfs.orphanFiles} cached PDF{data.pdfs.orphanFiles === 1 ? '' : 's'} ({mb(data.pdfs.orphanMB)}) no longer in the library, left in place.</p>}
      </section>

      <section className="imsm-card">
        <h3>Saving space</h3>
        <div className="imsm-grid">
          <div className="imsm-say">
            <b>Store identical PDFs once</b>
            <p>The same rulebook often sits in the Drive cache and the deck builder's folders. Identical files become links: every path still works, the bytes are stored once.</p>
            <p className="muted">{data.lastDedupe ? `Last checked ${new Date(data.lastDedupe.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.` : 'Not checked yet.'}</p>
            <Btn kind="tonal" icon="link" busy={busy === 'dedupe'} onClick={() => act('dedupe', '/api/storage/dedupe')}>Check for duplicates</Btn>
          </div>
          <div className="imsm-say">
            <b>Compact vector embeddings</b>
            <p>Each passage's 3,072 numbers kept as one byte each instead of long decimals: about a seventh of the size, with search effectively unchanged. New books are written this way.</p>
            <p className="muted">{data.lastQuantise ? `Converted ${data.lastQuantise.converted} file${data.lastQuantise.converted === 1 ? '' : 's'}: ${mb(data.lastQuantise.beforeMB)} to ${mb(data.lastQuantise.afterMB)}.` : 'Not converted yet.'}</p>
            {v.floatFiles > 0 && <Btn kind="tonal" icon="remove" busy={busy === 'quantise'} onClick={() => act('quantise', '/api/storage/quantise')}>Convert {v.floatFiles} file{v.floatFiles === 1 ? '' : 's'}</Btn>}
          </div>
        </div>
        <p className="muted" style={{ margin: 0 }}>Search index: {data.hnsw?.indexExists ? `built, ${Number(data.hnsw.totalVectors || 0).toLocaleString('en-GB')} passages. New books are added one at a time.` : 'not built; searches look through everything.'}</p>
      </section>

      <section className="imsm-card">
        <h3>Everything else</h3>
        {(data.other || []).map((o) => (
          <div key={o.name} className="imsm-otherrow"><b title={o.name}>{o.name}</b><span className="track"><i style={{ width: `${Math.max(0.5, (o.MB / maxOther) * 100)}%` }} /></span><span>{size(o.bytes)}</span></div>
        ))}
      </section>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      <Fab label="Measure again" icon="sync" onClick={() => load(true)} disabled={busy === 'measure'} />
    </>
  );
}

export default function Storage({ theme = 'light', onThemeToggle, setCurrentPath }) {
  return (
    <ServicePage title="Storage" icon="archive" accent="blue" theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} sub="What the library and IMS's data take up on disk.">
      <Body />
    </ServicePage>
  );
}
