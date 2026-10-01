import React, { useEffect, useState } from 'react';
import { ShieldAlert, X, RotateCw, Package, ExternalLink, ChevronDown, Lightbulb } from 'lucide-react';

// Code Repo > Dependencies: the weekly npm audit / npm outdated results for IMS and the scanned GitHub
// repos - critical and high advisories, and packages a major version or more behind.

const SEV = { critical: 'bg-rose-600 text-white', high: 'bg-orange-500 text-white' };
const when = (ms) => (ms ? new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');

export default function DependencyWatchModal({ isDark, onClose, state, reload, showToast }) {
  const [open, setOpen] = useState({});
  const last = state?.last;
  const running = state?.running;

  // while a run is going, check every few seconds
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(reload, 4000);
    return () => clearInterval(t);
  }, [running, reload]);

  const run = async () => {
    try { await fetch('/api/code-repo/dependencies/run', { method: 'POST' }); reload(); showToast?.('Dependency check started - takes a minute or two'); } catch (err) { showToast?.(err.message, 'error'); }
  };

  const panel = isDark ? 'bg-slate-900 border-white/10 text-slate-100' : 'bg-white border-slate-200 text-slate-900';
  const muted = isDark ? 'text-slate-400' : 'text-slate-500';
  const row = isDark ? 'border-white/5' : 'border-slate-100';
  const results = last?.results || [];
  const sorted = [...results].sort((a, b) => (b.counts?.critical || 0) - (a.counts?.critical || 0) || (b.counts?.high || 0) - (a.counts?.high || 0));

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className={`w-full max-w-5xl rounded-2xl border shadow-2xl my-8 ${panel}`} onClick={(e) => e.stopPropagation()}>
        <div className={`flex flex-wrap items-center justify-between gap-3 p-5 border-b ${row}`}>
          <div>
            <h2 className="text-base font-black flex items-center gap-2"><ShieldAlert size={18} className="text-rose-500" /> Dependencies & vulnerabilities</h2>
            <p className={`text-xs mt-0.5 ${muted}`}>npm audit and npm outdated for IMS (web app, server, library client) and every scanned GitHub repo. Runs weekly; each critical advisory becomes one dev idea.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={run} disabled={running} className="px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-2 bg-gradient-to-r from-rose-600 to-orange-500 text-white disabled:opacity-50">
              <RotateCw size={14} className={running ? 'animate-spin' : ''} /> {running ? `Checking${state?.progress ? ` ${state.progress.done + 1}/${state.progress.total}: ${state.progress.current}` : '...'}` : 'Check now'}
            </button>
            <button onClick={onClose} className={`p-2 rounded-xl ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`} aria-label="Close"><X size={16} /></button>
          </div>
        </div>

        {!last ? (
          <div className={`p-8 text-sm text-center ${muted}`}>{running ? 'First check under way...' : 'Not checked yet - press Check now.'}</div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              {[['Critical', last.summary.critical, 'text-rose-500'], ['High', last.summary.high, 'text-orange-500'], ['Major versions behind', last.summary.majorLag, 'text-amber-500'], ['Projects', last.summary.projects, ''], ['Dev ideas added', last.summary.devIdeasAdded, 'text-sky-500']].map(([k, v, c]) => (
                <div key={k} className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-slate-50'}`}><div className={muted}>{k}</div><div className={`text-xl font-black ${c}`}>{v}</div></div>
              ))}
            </div>
            <p className={`text-[11px] ${muted}`}>Last checked {when(last.finishedAt)} ({last.reason}). Next weekly check {when(state.nextDue)}.</p>

            {sorted.map((p) => {
              const isOpen = open[p.key] ?? ((p.counts?.critical || 0) > 0);
              return (
                <div key={p.key} className={`rounded-xl border ${row} ${isDark ? 'bg-slate-950/40' : 'bg-slate-50/60'}`}>
                  <button onClick={() => setOpen((o) => ({ ...o, [p.key]: !isOpen }))} className="w-full flex flex-wrap items-center gap-2 p-3 text-left">
                    <Package size={14} className={p.kind === 'ims' ? 'text-sky-500' : 'text-violet-500'} />
                    <span className="font-bold text-sm">{p.name}</span>
                    <span className={`text-[10px] uppercase font-bold ${muted}`}>{p.kind === 'ims' ? 'IMS' : 'GitHub repo'}</span>
                    {p.ok ? (
                      <span className="ml-auto flex items-center gap-1.5 text-[10px] font-black">
                        {p.counts.critical > 0 && <span className={`px-2 py-0.5 rounded-full ${SEV.critical}`}>{p.counts.critical} critical</span>}
                        {p.counts.high > 0 && <span className={`px-2 py-0.5 rounded-full ${SEV.high}`}>{p.counts.high} high</span>}
                        {p.majorLag.length > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600">{p.majorLag.length} major behind</span>}
                        {!p.counts.critical && !p.counts.high && !p.majorLag.length && <span className="text-emerald-500">All clear</span>}
                      </span>
                    ) : <span className="ml-auto text-[11px] text-rose-500">{p.error}</span>}
                    <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {p.ok && isOpen && (
                    <div className="px-3 pb-3 space-y-3 text-xs">
                      {p.lockNote && <p className={muted}>{p.lockNote}</p>}
                      {p.findings.length > 0 && (
                        <table className="w-full">
                          <thead><tr className={`text-left text-[10px] uppercase ${muted}`}><th className="py-1">Package</th><th>Severity</th><th>Advisory</th><th>Fix</th></tr></thead>
                          <tbody>{p.findings.map((f) => (
                            <tr key={f.package} className={`border-t align-top ${row}`}>
                              <td className="py-1.5 pr-2 font-semibold">{f.package}<div className={`font-normal text-[10px] ${muted}`}>{f.direct ? 'direct' : 'through another package'}</div></td>
                              <td className="pr-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${SEV[f.severity]}`}>{f.severity}</span></td>
                              <td className="pr-2">{f.advisories.slice(0, 2).map((a) => (
                                <div key={a.url || a.title}>{a.url ? <a href={a.url} target="_blank" rel="noreferrer" className="text-sky-500 hover:underline inline-flex items-center gap-1">{a.title} <ExternalLink size={10} /></a> : a.title}</div>
                              ))}</td>
                              <td className={muted}>{f.fix.available ? (f.fix.package ? `${f.fix.package} → ${f.fix.version}${f.fix.major ? ' (major)' : ''}` : 'npm audit fix') : 'No fix yet'}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      )}
                      {p.majorLag.length > 0 && (
                        <div>
                          <div className={`text-[10px] uppercase font-bold mb-1 ${muted}`}>A major version or more behind</div>
                          <div className="flex flex-wrap gap-1.5">{p.majorLag.map((x) => (
                            <span key={x.package} className={`px-2 py-1 rounded-lg border ${row}`}><b>{x.package}</b> {x.current} → {x.latest} <span className="text-amber-500 font-bold">({x.majorsBehind} major)</span></span>
                          ))}</div>
                        </div>
                      )}
                      {!p.findings.length && !p.majorLag.length && <p className="text-emerald-500">No critical or high advisories, and nothing a major version behind.</p>}
                    </div>
                  )}
                </div>
              );
            })}
            <p className={`text-[11px] flex items-center gap-1.5 ${muted}`}><Lightbulb size={12} className="text-amber-400" /> Critical advisories are queued in Dev Ideas under Code Repo Best Practices - one per advisory, listing every project it affects.</p>
          </div>
        )}
      </div>
    </div>
  );
}
