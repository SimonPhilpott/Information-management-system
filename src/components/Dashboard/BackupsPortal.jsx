import React, { useCallback, useEffect, useState } from 'react';
import {
  DatabaseBackup, CheckCircle2, AlertTriangle, HardDrive, Cloud, Loader2,
  ShieldCheck, RotateCcw, AlertOctagon, X, Check, FileCheck
} from 'lucide-react';
import PortalShell from './PortalShell';

// Backups (/ims/backups): the nightly backup of every service's data, automated SQLite
// integrity verification drills, copies kept on PC and Google Drive, and 1-click disaster recovery.
export default function BackupsPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [drillBusy, setDrillBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [restoreTarget, setRestoreTarget] = useState(null);

  const load = useCallback(() => {
    fetch('/api/ims-backups')
      .then((r) => r.json())
      .then((d) => d.success && setSt(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const now = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch('/api/ims-backups', { method: 'POST' });
      const d = await res.json();
      setNote(
        d.success
          ? {
              ok: true,
              msg: `Backed up - ${d.result.sizeMb} MB${
                d.result.drive?.uploaded
                  ? ', and saved to Google Drive'
                  : ` (not uploaded: ${d.result.drive?.error})`
              }.`
            }
          : { ok: false, msg: d.error }
      );
    } catch (err) {
      setNote({ ok: false, msg: err.message });
    }
    setBusy(false);
    load();
  };

  const runDrill = async () => {
    setDrillBusy(true);
    setNote(null);
    try {
      const res = await fetch('/api/ims-backups/drill', { method: 'POST' });
      const d = await res.json();
      if (d.success && d.result?.ok) {
        setNote({
          ok: true,
          msg: `Automated drill passed: verified archive ${d.result.archiveName} (${d.result.pageCount} database pages, PRAGMA integrity_check ok).`
        });
      } else {
        setNote({ ok: false, msg: d.error || 'Integrity drill check failed' });
      }
    } catch (err) {
      setNote({ ok: false, msg: err.message });
    }
    setDrillBusy(false);
    load();
  };

  const executeRestore = async (filename) => {
    if (!filename) return;
    setRestoreBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/ims-backups/restore/${encodeURIComponent(filename)}`, { method: 'POST' });
      const d = await res.json();
      if (d.success && d.result?.ok) {
        setNote({
          ok: true,
          msg: `Successfully restored from ${d.result.restoredArchive}! Pre-restore safety snapshot saved as ${d.result.safetySnapshot} (${d.result.filesRestored} files restored; .wifi_key preserved).`
        });
        setRestoreTarget(null);
      } else {
        setNote({ ok: false, msg: d.error || 'Failed to execute restoration' });
      }
    } catch (err) {
      setNote({ ok: false, msg: err.message });
    }
    setRestoreBusy(false);
    load();
  };

  const panel = `rounded-2xl border p-5 ${
    isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'
  }`;
  const muted = isDark ? 'text-slate-400' : 'text-slate-500';
  const last = st?.last;
  const drill = st?.drill;
  const when = (t) =>
    new Date(t).toLocaleString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });

  return (
    <PortalShell
      title="Backups & Disaster Recovery"
      subtitle="/ims/backups • automated drills, Google Drive sync & 1-click restore"
      icon={DatabaseBackup}
      gradient="from-emerald-500 to-cyan-600"
      glow="rgba(16,185,129,0.3)"
      isDark={isDark}
      onThemeToggle={onThemeToggle}
      setCurrentPath={setCurrentPath}
    >
      {/* Automated Drill Verification Banner */}
      <div className={`rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3 ${
        drill?.ok
          ? isDark ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'
          : drill
            ? isDark ? 'bg-rose-950/20 border-rose-500/30' : 'bg-rose-50 border-rose-200'
            : isDark ? 'bg-slate-900/50 border-white/10' : 'bg-slate-100 border-slate-200'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            drill?.ok ? 'bg-emerald-500/20 text-emerald-400' : drill ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-500/20 text-slate-400'
          }`}>
            <ShieldCheck size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">Automated Integrity Drill</span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                drill?.ok ? 'bg-emerald-500/15 text-emerald-500' : drill ? 'bg-rose-500/15 text-rose-500' : 'bg-slate-500/15 text-slate-400'
              }`}>
                {drill?.ok ? 'PASSED (PRAGMA integrity_check ok)' : drill ? 'FAILED' : 'Pending verification'}
              </span>
            </div>
            <div className={`text-xs mt-0.5 ${muted}`}>
              {drill
                ? `Last drill: ${when(drill.verifiedAt)} on ${drill.archiveName} (${drill.pageCount} pages, ${drill.sizeMb} MB in ${drill.durationMs}ms)`
                : 'Sandboxed weekly SQLite verification ensures backup archives are clean and uncorrupted.'}
            </div>
          </div>
        </div>
        <button
          onClick={runDrill}
          disabled={drillBusy}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
            isDark ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300' : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
          } disabled:opacity-50`}
        >
          {drillBusy ? <Loader2 size={13} className="animate-spin" /> : <FileCheck size={13} />}
          {drillBusy ? 'Verifying Sandbox...' : 'Run Drill Now'}
        </button>
      </div>

      {/* Last Backup Summary */}
      <div className={panel}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[14rem]">
            <div className="font-black text-lg">Last backup</div>
            {!st ? (
              <div className={muted}>Loading...</div>
            ) : !last ? (
              <div className={muted}>None yet - the first runs tonight after 3am, or back up now.</div>
            ) : last.ok ? (
              <div className="text-sm mt-1 flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-emerald-500 font-bold">
                  <CheckCircle2 size={15} /> {when(last.at)} - {last.sizeMb} MB ({last.reason})
                </span>
                <span className={`flex items-center gap-1.5 ${last.drive?.uploaded ? '' : 'text-amber-500'}`}>
                  <Cloud size={14} />{' '}
                  {last.drive?.uploaded
                    ? `In Google Drive, "${st.driveFolder}" (the last ${st.keepDrive} are kept)`
                    : `Not uploaded to Google Drive: ${last.drive?.error}`}
                </span>
              </div>
            ) : (
              <span className="flex items-center gap-1.5 text-rose-500 text-sm font-bold mt-1">
                <AlertTriangle size={15} /> {when(last.at)} - failed: {last.error}
              </span>
            )}
          </div>
          <button
            onClick={now}
            disabled={busy || st?.running}
            className="px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-cyan-700 text-white disabled:opacity-50 hover:brightness-110 transition-all shadow-sm"
          >
            {busy || st?.running ? <Loader2 size={15} className="animate-spin" /> : <DatabaseBackup size={15} />}
            {busy || st?.running ? 'Backing up...' : 'Back up now'}
          </button>
        </div>
        {note && (
          <div className={`mt-3 text-sm p-3 rounded-xl border flex items-center gap-2 ${
            note.ok
              ? isDark ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : isDark ? 'bg-rose-950/20 border-rose-500/20 text-rose-400' : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            {note.ok ? <Check size={15} className="shrink-0" /> : <AlertTriangle size={15} className="shrink-0" />}
            <span>{note.msg}</span>
          </div>
        )}
      </div>

      {/* On This PC Backups List with 1-Click Restore */}
      <div className={panel}>
        <div className="font-bold mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive size={15} className="opacity-60" /> On this PC{' '}
            <span className={`font-normal text-xs ${muted}`}>
              (the last {st?.keepLocal ?? 10}, in server/data/backups)
            </span>
          </div>
          <span className={`text-xs ${muted}`}>{st?.local?.length ?? 0} archives available</span>
        </div>
        {!st?.local?.length ? (
          <div className={`text-sm ${muted}`}>None yet.</div>
        ) : (
          <div className="flex flex-col gap-2 text-sm">
            {st.local.map((f) => (
              <div
                key={f.name}
                className={`flex items-center justify-between p-2.5 rounded-xl border transition-colors ${
                  isDark ? 'bg-slate-950/30 border-white/5 hover:border-white/10' : 'bg-slate-50 border-slate-200/60 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <DatabaseBackup size={14} className="text-emerald-500 shrink-0" />
                  <span className="font-mono text-xs truncate">{f.name}</span>
                  <span className={`text-[11px] shrink-0 ${muted}`}>{f.sizeMb} MB</span>
                </div>
                <button
                  onClick={() => setRestoreTarget(f.name)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors border ${
                    isDark
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                      : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                  }`}
                  title={`Restore state from ${f.name}`}
                >
                  <RotateCcw size={12} /> Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scope Explanation */}
      <div className={`${panel} text-sm leading-relaxed`}>
        <div className="font-bold mb-1">What's in each backup & disaster recovery guarantee</div>
        <p className={muted}>
          The whole database—memories, birthdays, alarms, timers and reminders, lists, calendar rules, carbs, tasks,
          dev ideas, news sources, board games, decks, campaigns and their chronicles, rule checks, settings—plus phrase
          recordings, campaign banners, chronicle pictures and narration, and campaign setups and map places. It runs
          every night after 3am.
        </p>
        <p className={`${muted} mt-2`}>
          Left out, because they can be rebuilt or fetched again: the PDF library (it lives in your Google Drive), the
          search index, the joke dataset, and the card and rulebook caches. The Wi-Fi passwords file is encrypted and
          its key (<code className="text-xs bg-slate-500/20 px-1 py-0.5 rounded">data/.wifi_key</code>) is preserved
          across restorations so your desk hardware terminal always stays connected.
        </p>
      </div>

      {/* Confirmation Modal for Restore */}
      {restoreTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className={`relative w-full max-w-lg rounded-3xl border p-6 shadow-2xl ${
              isDark ? 'bg-slate-900 border-white/10 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <button
              onClick={() => !restoreBusy && setRestoreTarget(null)}
              className={`absolute top-5 right-5 p-2 rounded-xl transition-colors ${
                isDark ? 'bg-white/5 hover:bg-white/10 text-slate-400' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 flex items-center justify-center text-amber-400">
                <AlertOctagon size={22} />
              </div>
              <div>
                <h2 className="text-lg font-black tracking-tight">Confirm Disaster Recovery Restore</h2>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Restore IMS database and assets from local archive
                </p>
              </div>
            </div>

            <div className={`p-3.5 rounded-xl border mb-4 text-xs leading-relaxed ${
              isDark ? 'bg-slate-950/60 border-white/10 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}>
              Target Archive: <span className="font-mono font-bold text-amber-400">{restoreTarget}</span>
            </div>

            <div className="space-y-2 text-xs mb-5">
              <div className="flex items-start gap-2">
                <Check size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                <span>An automatic <b>pre-restore safety snapshot</b> of your active database will be saved first in <code className="text-[11px]">server/data/backups/</code>.</span>
              </div>
              <div className="flex items-start gap-2">
                <Check size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                <span>Your hardware Wi-Fi key (<code className="text-[11px]">.wifi_key</code>) is protected and retained so your ESP32 terminal remains online.</span>
              </div>
              <div className="flex items-start gap-2">
                <Check size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                <span>Database integrity is validated with SQLite PRAGMA check before committing.</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/5">
              <button
                onClick={() => setRestoreTarget(null)}
                disabled={restoreBusy}
                className={`px-4 py-2 rounded-xl text-xs font-bold ${
                  isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={() => executeRestore(restoreTarget)}
                disabled={restoreBusy}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {restoreBusy ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                {restoreBusy ? 'Restoring System State...' : 'Confirm & Restore Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
}
