// Backups in the IMS design (24 Oct 2026): the nightly backup of every service's data, the weekly check that a backup
// really opens, copies on this PC and Google Drive, and restoring from one. Back up now is the button in the bottom
// right. The same /api/ims-backups requests as before (Dashboard/BackupsPortal.jsx).
import React, { useCallback, useEffect, useState } from 'react';
import ServicePage, { ItemCard, Fab } from './ServicePage';
import { Icon, Btn, Sheet, useSnack, Spinner } from '../HomebrewBeta/ui';

const when = (t) => new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function Body() {
  const snack = useSnack();
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState('');
  const [restore, setRestore] = useState(null);
  const load = useCallback(() => { fetch('/api/ims-backups').then((r) => r.json()).then((d) => d.success && setSt(d)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  const now = async () => {
    setBusy('now');
    try {
      const d = await (await fetch('/api/ims-backups', { method: 'POST' })).json();
      if (!d.success) throw new Error(d.error || 'The backup didn\'t finish.');
      snack(`Backed up: ${d.result.sizeMb} MB${d.result.drive?.uploaded ? ', and saved to Google Drive' : `. Not uploaded to Drive: ${d.result.drive?.error}`}.`);
    } catch (e) { snack(e.message, { error: true }); }
    setBusy(''); load();
  };
  const drill = async () => {
    setBusy('drill');
    try {
      const d = await (await fetch('/api/ims-backups/drill', { method: 'POST' })).json();
      if (!(d.success && d.result?.ok)) throw new Error(d.error || 'The check failed.');
      snack(`Checked ${d.result.archiveName}: it opens and every page is sound (${d.result.pageCount} pages).`);
    } catch (e) { snack(e.message, { error: true }); }
    setBusy(''); load();
  };
  const doRestore = async () => {
    setBusy('restore');
    try {
      const d = await (await fetch(`/api/ims-backups/restore/${encodeURIComponent(restore)}`, { method: 'POST' })).json();
      if (!(d.success && d.result?.ok)) throw new Error(d.error || 'It couldn\'t be restored.');
      snack(`Restored from ${d.result.restoredArchive}: ${d.result.filesRestored} files. The state before is saved as ${d.result.safetySnapshot}.`);
      setRestore(null);
    } catch (e) { snack(e.message, { error: true }); }
    setBusy(''); load();
  };

  if (!st) return <div className="imsm-empty"><Spinner /></div>;
  const last = st.last, dr = st.drill;
  return (
    <>
      <div className="imsm-stats">
        <div className={`imsm-stat ${last?.ok ? '' : 'bad'}`}>
          <span className="k"><Icon n="archive" size={16} />Last backup</span>
          <b>{last ? (last.ok ? `${last.sizeMb} MB` : 'Failed') : 'None yet'}</b>
          <span className="s">{last ? `${when(last.at)}${last.ok ? ` (${last.reason})` : `: ${last.error}`}` : 'The first runs tonight after 3am, or back up now.'}</span>
        </div>
        <div className="imsm-stat">
          <span className="k"><Icon n="cloud" size={16} />Google Drive</span>
          <b>{last?.drive?.uploaded ? 'Saved' : last ? 'Not saved' : '–'}</b>
          <span className="s">{last?.drive?.uploaded ? `In "${st.driveFolder}"; the last ${st.keepDrive} are kept` : last?.drive?.error || ''}</span>
        </div>
        <div className="imsm-stat">
          <span className="k"><Icon n="check" size={16} />Weekly check</span>
          <b>{dr ? (dr.ok ? 'Passed' : 'Failed') : 'Not yet'}</b>
          <span className="s">{dr ? `${when(dr.verifiedAt)}: ${dr.archiveName} opened and checked (${dr.pageCount} pages)` : 'Each week a backup is opened on its own and checked page by page.'}</span>
        </div>
      </div>
      <div className="imsm-row"><Btn kind="tonal" icon="check" busy={busy === 'drill'} onClick={drill}>Check a backup now</Btn></div>

      <h2 className="imsm-h2">On this PC</h2>
      <p className="muted" style={{ marginTop: -6 }}>The last {st.keepLocal ?? 10}, in server/data/backups.</p>
      {!st.local?.length ? <p className="muted">None yet.</p> : (
        <div className="imsm-list">
          {st.local.map((f) => (
            <ItemCard key={f.name} icon="archive" title={<span className="imsm-mono" style={{ fontSize: 14 }}>{f.name}</span>} meta={`${f.sizeMb} MB`}>
              <Btn kind="tonal" icon="sync" onClick={() => setRestore(f.name)}>Restore</Btn>
            </ItemCard>
          ))}
        </div>
      )}

      <details className="imsm-fold">
        <summary><Icon n="info" size={20} /><span>What's in each backup</span><Icon n="down" size={22} /></summary>
        <div style={{ padding: '0 16px 16px' }}>
          <p>The whole database (memories, birthdays, alarms, timers and reminders, lists, calendar rules, carbs, tasks, dev ideas, news sources, board games, decks, campaigns and their chronicles, rule checks, settings) plus phrase recordings, campaign banners, chronicle pictures and narration, and campaign setups and map places. It runs every night after 3am.</p>
          <p className="muted">Left out, because they can be rebuilt or fetched again: the PDF library (it lives in your Google Drive), the search index, the joke dataset, and the card and rulebook caches. The Wi-Fi key is kept through a restore, so the desk stays connected.</p>
        </div>
      </details>

      <Sheet open={Boolean(restore)} onClose={() => busy !== 'restore' && setRestore(null)} title="Restore from this backup?"
        footer={<div className="imsm-row end"><Btn kind="text" disabled={busy === 'restore'} onClick={() => setRestore(null)}>Cancel</Btn><Btn icon="sync" busy={busy === 'restore'} onClick={doRestore}>Restore it</Btn></div>}>
        <div className="imsm-form">
          <code className="imsm-code">{restore}</code>
          <ul className="imsm-ul">
            <li>Everything as it is now is saved first, as a safety copy in server/data/backups.</li>
            <li>The Wi-Fi key is kept, so the desk terminal stays online.</li>
            <li>The backup is checked before anything is replaced.</li>
          </ul>
        </div>
      </Sheet>
      <Fab label={busy === 'now' || st.running ? 'Backing up…' : 'Back up now'} icon="archive" onClick={now} disabled={busy === 'now' || st.running} />
    </>
  );
}

export default function Backups({ theme = 'light', onThemeToggle, setCurrentPath }) {
  return (
    <ServicePage title="Backups" icon="archive" accent="teal" theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} sub="Every service's data, backed up each night to this PC and Google Drive.">
      <Body />
    </ServicePage>
  );
}
