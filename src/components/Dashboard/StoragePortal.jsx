import React, { useEffect, useState } from 'react';
import { HardDrive, RefreshCw, Link2, Minimize2, Trash2, Undo2, FileText, Boxes, Database, ChevronDown, ChevronRight } from 'lucide-react';
import PortalShell from './PortalShell';
import Notice from './RunPlanner/Notice';

// Storage: exact megabytes used by the PDF library and its vector embeddings, per subject group,
// plus everything else IMS keeps on disk - and the two space savers from Phase 4 (PDF hard-link
// de-duplication and int8 vectors).
const GROUP_COLOUR = { LOTR: '#b45309', Arkham: '#0f766e', Diabetes: '#be123c', Technology: '#1d4ed8', 'Board Games': '#7c3aed' };
const PDF_COLOUR = '#0284c7';
const VEC_COLOUR = '#9333ea';
const mb = (n) => `${Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`;
// exact size from bytes: KB under 1 MB, so small files don't show as "0.0 MB"
const size = (bytes) => {
  const b = Number(bytes || 0);
  if (b === 0) return '0 KB';
  if (b < 1048576) return `${Math.max(1, Math.round(b / 1024)).toLocaleString('en-GB')} KB`;
  return `${(b / 1048576).toLocaleString('en-GB', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`;
};

export default function StoragePortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState(null);
  const [open, setOpen] = useState({});

  const card = isDark ? 'bg-slate-900/60 border-white/10' : 'bg-white border-[#2E2B27]/15 shadow-sm';
  const strong = isDark ? 'text-slate-50' : 'text-slate-900';
  const body = isDark ? 'text-slate-200' : 'text-slate-800';
  const track = isDark ? 'bg-white/10' : 'bg-slate-200';
  const btn = `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50 ${isDark ? 'bg-white/5 border-white/15 text-slate-100 hover:bg-white/10' : 'bg-white border-slate-300 text-slate-900 hover:bg-slate-100'}`;

  const load = async (fresh = false) => {
    try {
      const r = await fetch(`/api/storage${fresh ? '?fresh=1' : ''}`);
      const j = await r.json();
      if (j.success) setData(j);
    } catch (e) { setNote({ type: 'error', msg: e.message }); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (note) { const t = setTimeout(() => setNote(null), 4500); return () => clearTimeout(t); } }, [note]);

  const act = async (key, url, method = 'POST', confirmText = null) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(key);
    try {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'DELETE' ? undefined : '{}' });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'Failed');
      const res = j.result || {};
      setNote({ type: 'ok', msg: res.savedMB != null ? `Done - ${mb(res.savedMB)} saved` : res.deletedMB != null ? `Deleted ${mb(res.deletedMB)}` : res.restored != null ? `Restored ${res.restored} file(s)` : 'Done' });
      await load(true);
    } catch (e) { setNote({ type: 'error', msg: e.message }); }
    setBusy('');
  };

  const groups = data?.groups || [];
  const maxGroup = Math.max(1, ...groups.map((g) => g.pdfMB + g.vectorMB));
  const libraryMB = groups.reduce((n, g) => n + g.pdfMB + g.vectorMB, 0);
  const otherMB = (data?.other || []).reduce((n, o) => n + o.MB, 0);
  const maxOther = Math.max(1, ...(data?.other || []).map((o) => o.MB));

  const Tile = ({ icon: Icon, label, value, sub }) => (
    <div className={`rounded-xl border p-4 ${card}`}>
      <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wide ${body}`}><Icon size={15} />{label}</div>
      <div className={`text-2xl font-black mt-1 ${strong}`}>{value}</div>
      {sub && <div className={`text-xs mt-1 ${body}`}>{sub}</div>}
    </div>
  );

  return (
    <PortalShell title="Storage" subtitle="/ims/storage • what the library and IMS's data take up on disk" icon={HardDrive}
      gradient="from-slate-500 to-sky-700" glow="rgba(14,165,233,0.3)" isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={note}>
      {!data ? <div className={`p-8 ${body}`}>Measuring...</div> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile icon={FileText} label="Library PDFs" value={mb(data.pdfs.physicalMB)} sub={data.pdfs.savedByLinksMB > 0 ? `${mb(data.pdfs.savedByLinksMB)} saved by storing duplicates once` : 'No shared copies yet'} />
            <Tile icon={Boxes} label="Vector embeddings" value={mb(data.vectors.MB)} sub={data.vectors.floatFiles ? `${data.vectors.floatFiles} file(s) still in the old float format` : `All ${data.vectors.packedFiles} subject files compact (int8)`} />
            <Tile icon={Database} label="Everything else" value={mb(otherMB)} sub="Backups, database, chronicle audio and art, logs..." />
            <Tile icon={HardDrive} label="Total in server/data" value={mb(data.totalMB)} sub={`Measured ${new Date(data.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`} />
          </div>

          {data.vectors.backupMB > 0 && (
            <Notice isDark={isDark} tone="warn" title={`${mb(data.vectors.backupMB)} of old float32 vectors kept as a backup`}
              actions={<>
                <button className={btn} disabled={!!busy} onClick={() => act('restore', '/api/storage/vector-backup/restore', 'POST', 'Put the original float32 vector files back? (Search will use them again.)')}><Undo2 size={13} />Restore originals</button>
                <button className={btn} disabled={!!busy} onClick={() => act('delbak', '/api/storage/vector-backup', 'DELETE', `Delete the ${mb(data.vectors.backupMB)} float32 backup? Search already uses the compact files - this can't be undone, but the library could always be re-indexed from the PDFs.`)}><Trash2 size={13} />Delete backup</button>
              </>}>
              The library now uses the compact int8 vectors{data.lastQuantise ? ` (checked: worst similarity to the originals ${data.lastQuantise.worstCosine})` : ''}. Once you're happy that library search answers as well as before, delete the backup to get the space back.
            </Notice>
          )}

          {data.vectors.staleBackupMB > 0 && (
            <Notice isDark={isDark} tone="info" title={`${mb(data.vectors.staleBackupMB)} of old reclassified vector files archived`}
              actions={<>
                <button className={btn} disabled={!!busy} onClick={() => act('delstale', '/api/storage/stale-vector-backup', 'DELETE', `Delete the ${mb(data.vectors.staleBackupMB)} backup of old vector files permanently?`)}><Trash2 size={13} />Delete backup</button>
                <button className={btn} disabled={!!busy} onClick={() => act('reststale', '/api/storage/restore-stale-vectors', 'POST', 'Restore old vector files back to the vectors folder?')}><Undo2 size={13} />Restore</button>
              </>}>
              These {data.vectors.staleBackupFiles} vector files were from previous subject naming schemes. Active library subjects and documents are already indexed in current vector files.
            </Notice>
          )}

          {data.vectors.orphanFiles > 0 && (
            <Notice isDark={isDark} tone="warn" title={`${data.vectors.orphanFiles} orphaned vector file(s) (${mb(data.vectors.orphanMB)}) detected`}
              actions={<>
                <button className={btn} disabled={!!busy} onClick={() => act('prune', '/api/storage/clean-stale-vectors', 'POST', `Clean up ${data.vectors.orphanFiles} orphaned vector files (${mb(data.vectors.orphanMB)})? They will be safely moved to vectors_stale_backup.`)}><Trash2 size={13} />Clean up orphaned vectors</button>
              </>}>
              These vector files in server/data/vectors no longer correspond to active document subjects in your library.
            </Notice>
          )}

          <section className={`rounded-xl border p-4 ${card}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className={`text-sm font-black uppercase tracking-wide ${strong}`}>Library by subject</h2>
              <div className={`flex items-center gap-4 text-xs font-bold ${body}`}>
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: PDF_COLOUR }} />PDFs</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: VEC_COLOUR }} />Vector embeddings</span>
                <span>{mb(libraryMB)} in all</span>
              </div>
            </div>
            <div className="space-y-3">
              {groups.map((g) => (
                <div key={g.group}>
                  <button className="w-full text-left" onClick={() => setOpen((o) => ({ ...o, [g.group]: !o[g.group] }))}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`inline-flex items-center gap-1.5 font-black text-sm ${strong}`}>
                        {open[g.group] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: GROUP_COLOUR[g.group] }} />{g.group}
                      </span>
                      <span className={`text-xs font-bold tabular-nums ${body}`}>PDFs {size(g.pdfBytes)} ({g.pdfFiles}) · vectors {size(g.vectorBytes)} · <span className={strong}>{size(g.pdfBytes + g.vectorBytes)}</span></span>
                    </div>
                    <div className={`mt-1.5 h-4 rounded-md overflow-hidden flex ${track}`}>
                      <div style={{ width: `${(g.pdfMB / maxGroup) * 100}%`, background: PDF_COLOUR }} title={`PDFs ${mb(g.pdfMB)}`} />
                      <div style={{ width: `${(g.vectorMB / maxGroup) * 100}%`, background: VEC_COLOUR }} title={`Vectors ${mb(g.vectorMB)}`} />
                    </div>
                  </button>
                  {open[g.group] && (
                    <div className={`mt-2 ml-5 rounded-lg border divide-y ${isDark ? 'border-white/10 divide-white/10' : 'border-slate-200 divide-slate-200'}`}>
                      {g.subjects.map((s) => (
                        <div key={s.subject} className={`flex flex-wrap items-baseline justify-between gap-2 px-3 py-1.5 text-xs ${body}`}>
                          <span className={`font-semibold ${strong}`}>{s.subject}</span>
                          <span className="tabular-nums">
                            {s.pdfFiles > 0 ? (
                              <>PDFs {size(s.pdfBytes)}{s.pdfFiles ? ` (${s.pdfFiles})` : ''} · vectors {size(s.vectorBytes)}</>
                            ) : (
                              <>Vectors {size(s.vectorBytes)} <span className="opacity-60">(vectors only)</span></>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {data.pdfs.orphanFiles > 0 && <p className={`text-xs mt-3 ${body}`}>Also {data.pdfs.orphanFiles} cached PDF(s) ({mb(data.pdfs.orphanMB)}) no longer in the library - left in place.</p>}
            {data.vectors.orphanFiles > 0 && <p className={`text-xs mt-1 ${body}`}>Also {data.vectors.orphanFiles} orphaned vector file(s) ({mb(data.vectors.orphanMB)}) from previous subject names.</p>}
          </section>

          <section className={`rounded-xl border p-4 ${card}`}>
            <h2 className={`text-sm font-black uppercase tracking-wide mb-3 ${strong}`}>Saving space</h2>
            <div className="grid md:grid-cols-2 gap-3">
              <div className={`rounded-lg border p-3 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                <div className={`font-black text-sm ${strong}`}>Store identical PDFs once</div>
                <p className={`text-xs mt-1 ${body}`}>The same rulebook often sits in the Drive cache and the deck builder's folders. Identical files (by SHA-256) become hard links: every path still works, the bytes are stored once. Runs every night; only new or changed files are read.</p>
                <p className={`text-xs mt-1.5 font-semibold ${strong}`}>{data.lastDedupe ? `Last run ${new Date(data.lastDedupe.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}: ${data.lastDedupe.duplicatesLinked} duplicate(s), ${mb(data.lastDedupe.savedMB)} saved.` : 'Not run yet.'}</p>
                <button className={`${btn} mt-2`} disabled={!!busy} onClick={() => act('dedupe', '/api/storage/dedupe')}><Link2 size={13} />{busy === 'dedupe' ? 'Checking...' : 'Check for duplicates now'}</button>
              </div>
              <div className={`rounded-lg border p-3 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                <div className={`font-black text-sm ${strong}`}>Compact vector embeddings (int8)</div>
                <p className={`text-xs mt-1 ${body}`}>Each passage's 3,072 numbers are kept as one byte each instead of long decimals - about a seventh of the size, with search results effectively unchanged. New books are written this way automatically.</p>
                <p className={`text-xs mt-1.5 font-semibold ${strong}`}>{data.lastQuantise ? `Converted ${data.lastQuantise.converted} file(s): ${mb(data.lastQuantise.beforeMB)} → ${mb(data.lastQuantise.afterMB)}.` : 'Not converted yet.'}</p>
                {data.vectors.floatFiles > 0 && <button className={`${btn} mt-2`} disabled={!!busy} onClick={() => act('quantise', '/api/storage/quantise')}><Minimize2 size={13} />{busy === 'quantise' ? 'Converting...' : `Convert ${data.vectors.floatFiles} file(s)`}</button>}
              </div>
            </div>
            <p className={`text-xs mt-3 ${body}`}>
              Search index (HNSW): {data.hnsw?.indexExists ? `built, ${Number(data.hnsw.totalVectors || 0).toLocaleString('en-GB')} passages - new books are added to it one at a time, no full rebuild.` : 'not built - searches scan the compact vectors directly.'}
            </p>
          </section>

          <section className={`rounded-xl border p-4 ${card}`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className={`text-sm font-black uppercase tracking-wide ${strong}`}>Everything else</h2>
              <button className={btn} disabled={!!busy} onClick={() => load(true)}><RefreshCw size={13} />Measure again</button>
            </div>
            <div className="space-y-1.5">
              {data.other.map((o) => (
                <div key={o.name} className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3 text-xs">
                  <span className={`font-semibold truncate ${strong}`} title={o.name}>{o.name}</span>
                  <div className={`h-2.5 rounded ${track}`}><div className="h-full rounded bg-slate-500" style={{ width: `${Math.max(0.5, (o.MB / maxOther) * 100)}%` }} /></div>
                  <span className={`tabular-nums font-bold ${body}`}>{size(o.bytes)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </PortalShell>
  );
}
