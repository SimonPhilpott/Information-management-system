import React, { useCallback, useEffect, useState } from 'react';
import { DatabaseBackup, CheckCircle2, AlertTriangle, HardDrive, Cloud, Loader2 } from 'lucide-react';
import PortalShell from './PortalShell';

// Backups (/ims/backups): the nightly backup of every service's data - when it last ran, whether it
// reached Google Drive, the copies kept on the PC - and a button to back up now.
export default function BackupsPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const load = useCallback(() => fetch('/api/backups').then((r) => r.json()).then((d) => d.success && setSt(d)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  const now = async () => {
    setBusy(true); setNote(null);
    try {
      const d = await (await fetch('/api/backups', { method: 'POST' })).json();
      setNote(d.success ? { ok: true, msg: `Backed up - ${d.result.sizeMb} MB${d.result.drive?.uploaded ? ', and saved to Google Drive' : ` (not uploaded: ${d.result.drive?.error})`}.` } : { ok: false, msg: d.error });
    } catch (err) { setNote({ ok: false, msg: err.message }); }
    setBusy(false); load();
  };
  const panel = `rounded-2xl border p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;
  const muted = isDark ? 'text-slate-400' : 'text-slate-500';
  const last = st?.last;
  const when = (t) => new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <PortalShell title="Backups" subtitle="/ims/backups • every night, to this PC and Google Drive" icon={DatabaseBackup}
      gradient="from-emerald-500 to-cyan-600" glow="rgba(16,185,129,0.3)" isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath}>
      <div className={panel}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[14rem]">
            <div className="font-black text-lg">Last backup</div>
            {!st ? <div className={muted}>Loading...</div> : !last ? <div className={muted}>None yet - the first runs tonight after 3am, or back up now.</div> : last.ok ? (
              <div className="text-sm mt-1 flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-emerald-500 font-bold"><CheckCircle2 size={15} /> {when(last.at)} - {last.sizeMb} MB ({last.reason})</span>
                <span className={`flex items-center gap-1.5 ${last.drive?.uploaded ? '' : 'text-amber-500'}`}><Cloud size={14} /> {last.drive?.uploaded ? `In Google Drive, "${st.driveFolder}" (the last ${st.keepDrive} are kept)` : `Not uploaded to Google Drive: ${last.drive?.error}`}</span>
              </div>
            ) : <span className="flex items-center gap-1.5 text-rose-500 text-sm font-bold mt-1"><AlertTriangle size={15} /> {when(last.at)} - failed: {last.error}</span>}
          </div>
          <button onClick={now} disabled={busy || st?.running} className="px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-cyan-700 text-white disabled:opacity-50">
            {busy || st?.running ? <Loader2 size={15} className="animate-spin" /> : <DatabaseBackup size={15} />} {busy || st?.running ? 'Backing up...' : 'Back up now'}</button>
        </div>
        {note && <div className={`mt-3 text-sm ${note.ok ? 'text-emerald-500' : 'text-rose-500'}`}>{note.msg}</div>}
      </div>

      <div className={panel}>
        <div className="font-bold mb-2 flex items-center gap-2"><HardDrive size={15} className="opacity-60" /> On this PC <span className={`font-normal text-xs ${muted}`}>(the last {st?.keepLocal ?? 7}, in server/data/backups)</span></div>
        {!st?.local?.length ? <div className={`text-sm ${muted}`}>None yet.</div> : (
          <div className="flex flex-col gap-1 text-sm">{st.local.map((f) => <div key={f.name} className="flex justify-between"><span className="font-mono text-xs">{f.name}</span><span className={muted}>{f.sizeMb} MB</span></div>)}</div>
        )}
      </div>

      <div className={`${panel} text-sm leading-relaxed`}>
        <div className="font-bold mb-1">What's in each backup</div>
        <p className={muted}>The whole database - memories, birthdays, alarms, timers and reminders, lists, calendar rules, carbs, tasks, dev ideas, news sources, board games, decks, campaigns and their chronicles, rule checks, settings - plus phrase recordings, campaign banners, chronicle pictures and narration, and the campaign setups and map places. It runs every night after 3am.</p>
        <p className={`${muted} mt-2`}>Left out, because they can be rebuilt or fetched again: the PDF library (it lives in your Google Drive), the search index, the joke dataset, and the card and rulebook caches. The Wi-Fi passwords file is encrypted and its key is deliberately not backed up. To restore, stop the server, put the files back in <code>pdf-knowledge-base/server/data/</code> and start it again - each backup's README says so too.</p>
      </div>
    </PortalShell>
  );
}
