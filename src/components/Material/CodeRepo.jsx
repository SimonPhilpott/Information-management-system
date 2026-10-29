// Code Best Practices in the IMS design (24 Oct 2026): your GitHub repositories (personal and work), scanned for the
// code patterns worth reusing. Each account is a card of repositories to tick, scan and keep up to date; the patterns
// are grouped by what they do, and one opens in a sheet with its scores against five principles, how it fits
// together, its inputs and outputs, the code, and your notes. The quality audit, dependency check and GitHub tokens
// are sheets too. New project is the button in the bottom right. The same /api/code-repo requests as before
// (Dashboard/CodeRepoPortal.jsx and DependencyWatchModal.jsx).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ServicePage, { Empty, Fab } from './ServicePage';
import { Icon, IconButton, Btn, Sheet, TextField, TextArea, SelectField, FilterChip, useSnack, Spinner } from '../HomebrewBeta/ui';
import { useDependencyWatch } from '../../hooks/useDependencyWatch';

const GROUPS = [
  { key: 'ui', title: 'Screens and components', sub: 'Web parts, React containers, dialogs and visual pieces', icon: 'monitor' },
  { key: 'hooks', title: 'Hooks, audio and state', sub: 'React hooks, WebSocket subscriptions and audio streaming', icon: 'sparkle' },
  { key: 'services', title: 'Server and APIs', sub: 'Express endpoints, Gemini orchestration, search and storage', icon: 'hub' },
  { key: 'firmware', title: 'Firmware and hardware', sub: 'ESP32 tasks, audio drivers and screen drawing', icon: 'bolt' },
  { key: 'testing', title: 'Tests and utilities', sub: 'Validation, test runners, guards and shared helpers', icon: 'shield' },
];
const PRINCIPLES = [['architectural', 'Modularity', 'Separation of concerns'], ['foundational', 'DRY and KISS', 'Reuse and simplicity'], ['solid', 'SOLID', 'Interfaces and classes'], ['clarity', 'Readability', 'Names and the why'], ['resilience', 'Resilience', 'Defensive fault tolerance']];

function groupOf(s) {
  const p = (s.file_path || '').toLowerCase(), t = (s.title || '').toLowerCase(), d = (s.description || '').toLowerCase(), tech = (s.technology || '').toLowerCase();
  if (p.includes('firmware') || p.includes('esp32') || p.endsWith('.cpp') || p.endsWith('.h') || tech.includes('c++') || tech.includes('esp')) return 'firmware';
  if (p.includes('hook') || t.startsWith('use') || p.includes('use') || d.includes('hook') || t.includes('state') || tech.includes('zustand')) return 'hooks';
  if (p.includes('service') || p.includes('server') || p.includes('route') || p.includes('api') || tech.includes('express') || tech.includes('node') || d.includes('backend')) return 'services';
  if (p.includes('test') || p.includes('spec') || d.includes('test') || t.includes('test') || t.includes('audit')) return 'testing';
  return 'ui';
}
// how a pattern sits in its system: what sets it off, what guards it, the unit itself, where its result goes
function flowOf(s) {
  const g = groupOf(s), title = s.title || 'Component';
  const F = {
    firmware: [['Microphone', 'ES7210, 16 kHz I2S DMA'], ['Echo guard', 'Half-duplex mic suppression'], [title, `${s.language} · ${s.technology}`], ['Speaker and network', 'Socket and ES8311'], [['FreeRTOS core 0', 'Queue pacing'], ['LovyanGFX screen', '320x240 drawing']]],
    hooks: [['Component lifecycle', 'Mount or a user event'], ['State and effects', 'Memoised dependencies'], [title, `Hook · ${s.technology}`], ['Reactive state', 'The screen re-renders'], [['WebSocket or fetch', 'Live data'], ['Local storage or audio', 'Client state']]],
    services: [['A REST or SSE request', 'An incoming call'], ['Payload guard', 'Schema and null checks'], [title, `Server · ${s.technology}`], ['SQLite and vectors', 'Saved and indexed'], [['Gemini', 'Multimodal and RAG'], ['Express router', 'SSE pacing']]],
    testing: [['A test run', 'Automated runner'], ['Assertions', 'Boundaries and exceptions'], [title, `Tests · ${s.technology}`], ['Results', 'Pass and fail'], [['Mocks and fixtures', 'Isolated'], ['Triple registry', 'Done means done']]],
    ui: [['A user or a page', 'A tap, click or mount'], ['Props and theme', 'Typed interfaces'], [title, `Component · ${s.technology}`], ['The page', 'Rendered'], [['Fluent UI or Tailwind', 'Design tokens'], ['The parent page', 'Its container']]],
  }[g];
  return { steps: F.slice(0, 4), deps: F[4] };
}
const scoreTone = (n) => (n >= 9 ? 'good' : n >= 8.2 ? 'mid' : n >= 7 ? 'warn' : 'bad');

function Gauge({ score, title, sub }) {
  const v = Math.min(Math.max(Number(score) || 0, 0), 10), r = 26, c = 2 * Math.PI * r;
  return (
    <div className={`imsm-gauge ${scoreTone(v)}`}>
      <svg viewBox="0 0 64 64" width="72" height="72"><circle cx="32" cy="32" r={r} className="tr" fill="none" strokeWidth="6" /><circle cx="32" cy="32" r={r} className="fg" fill="none" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(v / 10) * c} ${c}`} transform="rotate(-90 32 32)" /><text x="32" y="36" textAnchor="middle">{v.toFixed(1)}</text></svg>
      <b>{title}</b><small>{sub}</small>
    </div>
  );
}

// Live calculation of accurate days, hours, minutes, and seconds
function useLiveCountdown(resetIso) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!resetIso) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [resetIso]);

  if (!resetIso) return null;
  const target = new Date(resetIso).getTime();
  const diff = Math.max(0, target - now);
  if (diff === 0) return { expired: true, text: 'Resetting now…' };

  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  let parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  parts.push(`${String(seconds).padStart(2, '0')}s`);

  return {
    expired: false,
    text: parts.join(' '),
    days,
    hours,
    minutes,
    seconds
  };
}

function formatResetDateTime(resetIso) {
  if (!resetIso) return '–';
  const d = new Date(resetIso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const timeStr = d.toLocaleTimeString('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit'
  });
  if (isToday) {
    return `Today ${timeStr}`;
  }
  return d.toLocaleDateString('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function ClaudeStyleUsageBar({
  label,
  utilization = 0,
  resetIso,
  color = 'coral',
  reminderKey,
  isReminded,
  onToggleReminder
}) {
  const countdown = useLiveCountdown(resetIso);
  const isFull = utilization >= 100;
  const displayVal = isFull
    ? formatResetDateTime(resetIso)
    : `${Number(utilization).toFixed(utilization % 1 === 0 ? 0 : 1)}%`;

  return (
    <div className="imsm-cc-usage-item">
      <div className="imsm-cc-usage-header">
        <span className="imsm-cc-usage-label">{label}</span>
        <span className={`imsm-cc-usage-val ${isFull ? 'date' : ''}`}>{displayVal}</span>
      </div>
      <div className="imsm-cc-usage-track">
        <div
          className={`imsm-cc-usage-fill ${color}`}
          style={{ width: `${Math.min(100, Math.max(0, utilization))}%` }}
        />
      </div>
      <div className="imsm-cc-usage-footer">
        <span className="imsm-cc-usage-countdown">
          {countdown?.expired ? 'Resetting now…' : `Resets in ${countdown?.text || '–'}`}
        </span>
        {reminderKey && (
          <button
            type="button"
            className={`imsm-cc-reminder-btn ${isReminded ? 'active' : ''}`}
            onClick={() => onToggleReminder(reminderKey)}
            title={isReminded ? 'Automatic reset reminder set. Click to turn off.' : 'Click to set automatic reset reminder.'}
          >
            <Icon n={isReminded ? 'alarm' : 'bell'} size={13} />
            <span>{isReminded ? 'Reminder set' : 'Remind on reset'}</span>
          </button>
        )}
      </div>
    </div>
  );
}

function AiQuotasPanel({ quotas, loading, onRefresh }) {
  const snack = useSnack();
  const [reminders, setReminders] = useState({
    claude_daily: false,
    claude_weekly: false,
    gemini_daily: false,
    gemini_weekly: false
  });

  const loadReminders = useCallback(async () => {
    try {
      const res = await fetch('/api/code-repo/ai-quotas/reminders');
      const d = await res.json();
      if (d.success && d.config) setReminders(d.config);
    } catch (_) {}
  }, []);

  useEffect(() => {
    loadReminders();
  }, [loadReminders]);

  const toggleReminder = async (key) => {
    const nextVal = !reminders[key];
    const nextConfig = { ...reminders, [key]: nextVal };
    setReminders(nextConfig);
    try {
      const res = await fetch('/api/code-repo/ai-quotas/reminders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextConfig)
      });
      const d = await res.json();
      if (d.success && d.config) {
        setReminders(d.config);
        snack(nextVal ? 'Automatic reminder set for quota reset.' : 'Quota reset reminder cancelled.');
      }
    } catch (err) {
      setReminders(reminders);
      snack('Could not update reminder: ' + err.message, { error: true });
    }
  };

  if (!quotas) return null;
  const { claude, gemini, tokenUsage } = quotas;

  return (
    <section className="imsm-quota-card">
      <div className="imsm-quota-hd">
        <div className="imsm-quota-title">
          <span className="ico"><Icon n="sparkle" size={24} /></span>
          <div>
            <b>AI Quotas & Automatic Reset Reminders</b>
            <small>Live usage and exact countdowns with optional reset alarms</small>
          </div>
        </div>
        <Btn kind="text" icon="sync" busy={loading} onClick={onRefresh}>Refresh Quotas</Btn>
      </div>

      <div className="imsm-cc-panels">
        {/* Claude Code Panel (matching screenshot) */}
        <div className="imsm-cc-panel">
          <div className="imsm-cc-header">
            <h4><Icon n="sparkle" size={16} /> Claude Code</h4>
            <span className="badge">Subscription</span>
          </div>
          <div className="imsm-cc-account">
            <span className="imsm-cc-subhead">ACCOUNT</span>
            <span className="email">{claude?.account || 'sideburnt@gmail.com'}</span>
          </div>
          <div className="imsm-cc-usage-list">
            <span className="imsm-cc-subhead">USAGE</span>
            <ClaudeStyleUsageBar
              label="Session (5hr)"
              utilization={claude?.daily?.utilization ?? 0}
              resetIso={claude?.daily?.countdown?.resetIso}
              color="coral"
              reminderKey="claude_daily"
              isReminded={reminders.claude_daily}
              onToggleReminder={toggleReminder}
            />
            <ClaudeStyleUsageBar
              label="Weekly (7 day)"
              utilization={claude?.weekly?.utilization ?? 0}
              resetIso={claude?.weekly?.countdown?.resetIso}
              color="cyan"
              reminderKey="claude_weekly"
              isReminded={reminders.claude_weekly}
              onToggleReminder={toggleReminder}
            />
          </div>
        </div>

        {/* Google Gemini Panel */}
        <div className="imsm-cc-panel">
          <div className="imsm-cc-header">
            <h4><Icon n="bolt" size={16} /> Google Gemini</h4>
            <span className="badge">{gemini?.account || 'Google AI Pro'}</span>
          </div>
          <div className="imsm-cc-account">
            <span className="imsm-cc-subhead">ACCOUNT</span>
            <span className="email">{gemini?.account || 'Google AI Pro'} (Antigravity IDE)</span>
          </div>
          <div className="imsm-cc-usage-list">
            <span className="imsm-cc-subhead">USAGE</span>
            <ClaudeStyleUsageBar
              label="Daily (Flash)"
              utilization={gemini?.daily?.utilization ?? 0}
              resetIso={gemini?.daily?.countdown?.resetIso}
              color="coral"
              reminderKey="gemini_daily"
              isReminded={reminders.gemini_daily}
              onToggleReminder={toggleReminder}
            />
            <ClaudeStyleUsageBar
              label="Weekly Pool"
              utilization={gemini?.weekly?.utilization ?? 0}
              resetIso={gemini?.weekly?.countdown?.resetIso}
              color="cyan"
              reminderKey="gemini_weekly"
              isReminded={reminders.gemini_weekly}
              onToggleReminder={toggleReminder}
            />
          </div>
        </div>
      </div>

      <div className="imsm-quota-footer">
        <div className="credits-strip">
          <span>Prompt Credits: <b>{tokenUsage?.promptCredits?.available ?? 500} / {tokenUsage?.promptCredits?.monthly ?? '50k'}</b> ({tokenUsage?.promptCredits?.remainingPercentage ?? 1}%)</span>
          <span>Flow Credits: <b>{tokenUsage?.flowCredits?.available ?? 100} / {tokenUsage?.flowCredits?.monthly ?? '150k'}</b></span>
          <span>Google One AI Credits: <b>{tokenUsage?.userCredits?.[0]?.creditAmount ?? 26}</b></span>
        </div>
        <span>Exact millisecond timestamps from Anthropic OAuth & Antigravity IDE</span>
      </div>
    </section>
  );
}

function Account({ title, sub, icon, token, repos, scanning, scanTarget, progress, lastLog, onScanAll, onScanOne, onToggle, onToggleAll, onRemove, onTokens, mismatch }) {
  const [open, setOpen] = useState(true);
  const all = repos.length > 0 && repos.every((r) => r.is_selected);
  const mine = scanning && (scanTarget === title || repos.some((r) => r.id === scanTarget));
  return (
    <section className="imsm-card imsm-acct">
      <div className="hd">
        <span className="lead"><Icon n={icon} size={22} /></span>
        <span className="txt"><b>{title} <span className="muted">({repos.length})</span></b><small>{sub}</small><span className={`tag ${token.ok ? 'good' : 'warn'}`}>{token.text}</span></span>
        <Btn kind="tonal" icon="sync" busy={mine && scanTarget === title} disabled={scanning} onClick={onScanAll}>Scan</Btn>
        <IconButton icon={open ? 'up' : 'down'} label={open ? 'Fold it' : 'Open it'} onClick={() => setOpen(!open)} />
      </div>
      {mine && <div className="imsm-ota"><div className="imsm-row" style={{ justifyContent: 'space-between' }}><b>Scanning…</b><span>{progress}%</span></div><span className="trk"><i style={{ width: `${progress}%` }} /></span><small className="imsm-mono">{lastLog || 'Reading files…'}</small></div>}
      {mismatch && <div className="imsm-banner"><Icon n="warn" size={22} /><span><b>That token belongs to @{mismatch}.</b> Your work repositories belong to @simon-philpott-turntown, so GitHub won't let this token see the private ones.</span><Btn kind="text" onClick={onTokens}>Change the token</Btn></div>}
      {open && (
        <>
          <div className="imsm-row" style={{ justifyContent: 'space-between' }}><span className="muted">{repos.filter((r) => r.is_selected).length} of {repos.length} ticked for scanning</span>{repos.length > 0 && <Btn kind="text" onClick={() => onToggleAll(!all)}>{all ? 'Untick them all' : 'Tick them all'}</Btn>}</div>
          {!repos.length ? <p className="muted" style={{ margin: 0 }}>None found yet. Add a token and sync.</p> : (
            <ul className="imsm-repos">
              {repos.map((r) => {
                const on = Boolean(r.is_selected);
                return (
                  <li key={r.id} className={on ? 'on' : ''}>
                    <label className="ck"><input type="checkbox" checked={on} onChange={() => onToggle(r.id, on)} aria-label={`Scan ${r.name}`} /></label>
                    <span className="txt"><b>{r.name}{Boolean(r.is_private) && <span className="tag quiet"><Icon n="lock" size={13} />Private</span>}</b><small className="imsm-mono">{r.local_path ? 'On this PC' : r.url?.replace('https://github.com/', '')}</small></span>
                    {r.is_outdated ? <span className="tag warn" title={`${r.last_scanned_commit_sha?.slice(0, 7) || 'none'} → ${r.last_commit_sha?.slice(0, 7) || 'latest'}`}>Needs a rescan</span> : r.last_scanned_at ? <span className="tag good">Up to date</span> : <span className="tag quiet">Not scanned</span>}
                    <IconButton icon="sync" label={`Scan ${r.name}`} disabled={scanning} onClick={() => onScanOne(r.id)} />
                    <IconButton icon="del" label={`Stop tracking ${r.name}`} disabled={scanning} onClick={() => onRemove(r)} />
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function Pattern({ s, notes, setNotes, onSaveNotes, saving, onCopy }) {
  const flow = flowOf(s);
  const overall = Number(s.principles?.overallScore || s.overallScore || 8.5);
  const io = (list, kind) => (
    <div className="imsm-io">
      <h4><Icon n={kind === 'in' ? 'down' : 'up'} size={18} />{kind === 'in' ? 'Inputs' : 'Outputs'} <span className="muted">({list?.length || 0})</span></h4>
      {!(list?.length) ? <p className="muted">None given.</p> : list.map((x, i) => (
        <div key={i} className="it">
          <div className="imsm-row"><code>{x.name}</code><span className="tag quiet">{x.kind || (kind === 'in' ? 'Variable' : 'Return value')}</span><span className="tag quiet imsm-mono">{x.type || 'any'}</span></div>
          <p>{x.description}</p>
          {x.example && <pre className="imsm-pre"><code>{x.example}</code></pre>}
        </div>
      ))}
    </div>
  );
  return (
    <div className="imsm-form">
      <div className="imsm-row"><span className={`tag ${s.repo_account === 'turntown' ? 'warn' : 'good'}`}>{s.repo_name || 'Repository'}</span><code className="muted" style={{ overflowWrap: 'anywhere' }}>{s.file_path}</code></div>
      <p style={{ margin: 0, lineHeight: '23px' }}>{s.description}</p>
      <div className="imsm-flow">
        {flow.steps.map(([l, sub], i) => <div key={i} className={`st s${i}`}><small>{['What sets it off', 'What guards it', 'The unit', 'Where it goes'][i]}</small><b>{l}</b><span>{sub}</span></div>)}
        <div className="deps"><small>Works with</small>{flow.deps.map(([l, sub]) => <span key={l} className="tag quiet">{l} <span className="muted">({sub})</span></span>)}</div>
      </div>
      <div className="imsm-row" style={{ justifyContent: 'space-between' }}><h3 className="imsm-h2" style={{ fontSize: 20, margin: 0 }}>Against five principles</h3><span className={`tag ${overall >= 8.5 ? 'good' : 'warn'}`}>Overall {overall} / 10</span></div>
      <div className="imsm-gauges">{PRINCIPLES.map(([k, t, sub]) => <Gauge key={k} score={(s.principles?.[k] || { score: 9 }).score} title={t} sub={sub} />)}</div>
      <div className="imsm-banner info"><Icon n="check" size={22} /><span><b>Why it's good practice.</b> {s.best_practice_rationale || 'High cohesion and low coupling.'}</span></div>
      <div className="imsm-two">{io(s.inputs, 'in')}{io(s.outputs, 'out')}</div>
      <div className="imsm-row" style={{ justifyContent: 'space-between' }}><b>The code <span className="tag quiet">{s.language}</span></b><Btn kind="tonal" icon="copy" onClick={onCopy}>Copy it</Btn></div>
      <pre className="imsm-pre big"><code>{s.code_content}</code></pre>
      {s.usage_example && <><b>How to use it</b><pre className="imsm-pre"><code>{s.usage_example}</code></pre></>}
      <div className="imsm-two">
        <div className="imsm-sub-card">
          <h4 className="imsm-steph"><Icon n="sparkle" size={18} />What the review noticed</h4>
          {s.aiObservations?.length ? <ul className="imsm-ul">{s.aiObservations.map((o, i) => <li key={i}>{o}</li>)}</ul> : <p className="muted">Nothing in particular.</p>}
          {s.suggestedImprovements?.length > 0 && <><b>Could be better</b><ul className="imsm-ul">{s.suggestedImprovements.map((o, i) => <li key={i}>{o}</li>)}</ul></>}
        </div>
        <div className="imsm-sub-card">
          <h4 className="imsm-steph"><Icon n="edit" size={18} />Your notes</h4>
          <TextArea label="Standards, caveats or migration notes" rows={6} value={notes} onChange={setNotes} />
          <div className="imsm-row end"><Btn icon="check" busy={saving} onClick={onSaveNotes}>Save notes</Btn></div>
        </div>
      </div>
    </div>
  );
}

function Deps({ state, reload }) {
  const snack = useSnack();
  const [open, setOpen] = useState({});
  const last = state?.last, running = state?.running;
  useEffect(() => { if (!running) return undefined; const t = setInterval(reload, 4000); return () => clearInterval(t); }, [running, reload]);
  const run = async () => { try { await fetch('/api/code-repo/dependencies/run', { method: 'POST' }); reload(); snack('Checking dependencies: a minute or two.'); } catch (e) { snack(e.message, { error: true }); } };
  const when = (ms) => (ms ? new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–');
  const list = [...(last?.results || [])].sort((a, b) => (b.counts?.critical || 0) - (a.counts?.critical || 0) || (b.counts?.high || 0) - (a.counts?.high || 0));
  return (
    <div className="imsm-form">
      <div className="imsm-row" style={{ justifyContent: 'space-between' }}><span className="muted">npm audit and npm outdated for IMS and every scanned repository. It runs weekly, and each critical advisory becomes a dev idea.</span><Btn icon="sync" busy={running} disabled={running} onClick={run}>{running ? `Checking${state?.progress ? ` ${state.progress.done + 1} of ${state.progress.total}` : '…'}` : 'Check now'}</Btn></div>
      {!last ? <p className="muted">{running ? 'The first check is under way.' : 'Not checked yet.'}</p> : (
        <>
          <div className="imsm-stats">
            {[['Critical', last.summary.critical, 'bad'], ['High', last.summary.high, 'bad'], ['A major version behind', last.summary.majorLag, ''], ['Projects', last.summary.projects, ''], ['Dev ideas added', last.summary.ideasAdded ?? 0, '']].map(([k, v, t]) => <div key={k} className={`imsm-stat ${t && v ? t : ''}`}><span className="k">{k}</span><b>{v}</b></div>)}
          </div>
          <p className="muted" style={{ margin: 0 }}>Last checked {when(last.finishedAt)} ({last.reason}). Next weekly check {when(state.nextDue)}.</p>
          {list.map((p) => {
            const isOpen = open[p.key] ?? ((p.counts?.critical || 0) > 0);
            return (
              <div key={p.key} className="imsm-artist">
                <div className="hd sl" role="button" tabIndex={0} onClick={() => setOpen((o) => ({ ...o, [p.key]: !isOpen }))} onKeyDown={(e) => e.key === 'Enter' && setOpen((o) => ({ ...o, [p.key]: !isOpen }))}>
                  <span className="txt" style={{ paddingLeft: 10 }}><b>{p.name}</b><small>{p.kind === 'ims' ? 'IMS' : 'GitHub repository'}</small></span>
                  {p.ok ? <span className="imsm-row" style={{ gap: 4 }}>{p.counts.critical > 0 && <span className="tag bad">{p.counts.critical} critical</span>}{p.counts.high > 0 && <span className="tag warn">{p.counts.high} high</span>}{p.majorLag.length > 0 && <span className="tag quiet">{p.majorLag.length} major behind</span>}{!p.counts.critical && !p.counts.high && !p.majorLag.length && <span className="tag good">All clear</span>}</span> : <span className="bad">{p.error}</span>}
                  <Icon n={isOpen ? 'up' : 'down'} size={22} />
                </div>
                {p.ok && isOpen && (
                  <div className="bd">
                    {p.lockNote && <p className="muted" style={{ margin: 0 }}>{p.lockNote}</p>}
                    {p.findings.map((f) => (
                      <div key={f.package} className="imsm-dep">
                        <div className="imsm-row"><b>{f.package}</b><span className={`tag ${f.severity === 'critical' ? 'bad' : 'warn'}`}>{f.severity}</span><small className="muted">{f.direct ? 'direct' : 'through another package'}</small></div>
                        {f.advisories.slice(0, 2).map((a) => <div key={a.url || a.title}>{a.url ? <a href={a.url} target="_blank" rel="noreferrer">{a.title}</a> : a.title}</div>)}
                        <small className="muted">Fix: {f.fix.available ? (f.fix.package ? `${f.fix.package} → ${f.fix.version}${f.fix.major ? ' (major)' : ''}` : 'npm audit fix') : 'none yet'}</small>
                      </div>
                    ))}
                    {p.majorLag.length > 0 && <div className="chips wrap">{p.majorLag.map((x) => <span key={x.package} className="tag quiet">{x.package} {x.current} → {x.latest} ({x.majorsBehind} major)</span>)}</div>}
                    {!p.findings.length && !p.majorLag.length && <p className="muted" style={{ margin: 0 }}>No critical or high advisories, and nothing a major version behind.</p>}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function Body({ go }) {
  const snack = useSnack();
  const err = useCallback((m) => snack(m, { error: true }), [snack]);
  const [repos, setRepos] = useState([]);
  const [repoId, setRepoId] = useState('all');
  const [group, setGroup] = useState('all');
  const [stack, setStack] = useState('all');
  const [stacks, setStacks] = useState([]);
  const [q, setQ] = useState('');
  const [snips, setSnips] = useState(null);
  const [active, setActive] = useState(null);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [tok, setTok] = useState({});
  const [tokForm, setTokForm] = useState(null);
  const [busy, setBusy] = useState('');
  const [scan, setScan] = useState({ on: false, target: null, logs: [], progress: 0 });
  const [sheet, setSheet] = useState(null); // 'audit' | 'deps'
  const [audit, setAudit] = useState(null);
  const [auditing, setAuditing] = useState(false);
  const [auditFilter, setAuditFilter] = useState('all');
  const [logged, setLogged] = useState(new Set());
  const [depWatch, reloadDeps] = useDependencyWatch();
  const [quotas, setQuotas] = useState(null);
  const [quotasLoading, setQuotasLoading] = useState(false);

  const loadQuotas = useCallback(async () => {
    setQuotasLoading(true);
    try {
      const res = await fetch('/api/code-repo/ai-quotas');
      const d = await res.json();
      if (d.success) setQuotas(d);
    } catch (_) {}
    setQuotasLoading(false);
  }, []);

  const loadTok = useCallback(async () => { try { const d = await (await fetch('/api/code-repo/tokens')).json(); if (d.success) setTok(d); } catch { /* keep */ } }, []);
  const loadRepos = useCallback(async () => { try { const d = await (await fetch('/api/code-repo/repositories')).json(); if (d.success) setRepos(d.repositories || []); } catch { /* keep */ } }, []);
  const loadSnips = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (repoId !== 'all') p.set('repoId', repoId);
      if (stack !== 'all') p.set('stack', stack);
      if (q.trim()) p.set('search', q.trim());
      const d = await (await fetch(`/api/code-repo/snippets?${p}`)).json();
      if (d.success) { setSnips(d.snippets || []); if (Array.isArray(d.stacks)) setStacks(d.stacks); }
    } catch (e) { setSnips((s) => s || []); err(`The patterns couldn't be loaded: ${e.message}`); }
  }, [repoId, stack, q, err]);
  useEffect(() => { loadTok(); loadRepos(); loadQuotas(); }, [loadTok, loadRepos, loadQuotas]);
  useEffect(() => { const t = setTimeout(loadSnips, q ? 300 : 0); return () => clearTimeout(t); }, [loadSnips, q]);

  const runAudit = useCallback(async () => {
    setSheet('audit'); setAuditing(true);
    try { const d = await (await fetch('/api/code-repo/audit', { method: 'POST' })).json(); if (!d.success) throw new Error(d.error || 'The audit failed.'); setAudit(d); snack(`Audit done: ${d.metrics.overallScore} out of 100.`); } catch (e) { err(e.message); }
    setAuditing(false);
  }, [snack, err]);
  useEffect(() => { const p = new URLSearchParams(window.location.search); if (p.get('action') === 'audit' || p.get('audit') === 'true') runAudit(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const call = async (key, url, opts, then) => {
    setBusy(key);
    try { const d = await (await fetch(url, opts)).json(); if (!d.success) throw new Error(d.error || 'It didn\'t work.'); await then(d); } catch (e) { err(e.message); }
    setBusy('');
  };
  const stream = (target, url, doneWord) => {
    setScan({ on: true, target, logs: [], progress: 0 });
    const es = new EventSource(url);
    const end = (word, bad) => { es.close(); setScan({ on: false, target: null, logs: [], progress: 0 }); if (bad) err(word); else { snack(word); loadRepos(); loadSnips(); } };
    es.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        setScan((s) => ({ ...s, logs: d.message ? [...s.logs, d.message] : s.logs, progress: typeof d.progress === 'number' ? d.progress : s.progress }));
        if (d.phase === 'finished') end(d.message || doneWord);
        else if (d.phase === 'error') end(d.message || 'The scan hit a problem.', true);
      } catch { /* skip a bad line */ }
    };
    es.onerror = () => end('The scan connection dropped.', true);
  };
  const scanAccount = (acct) => {
    if (!repos.some((r) => (r.account || 'personal') === acct && r.is_selected)) return err('Tick some repositories to scan first.');
    stream(acct === 'personal' ? 'Personal' : 'Work', `/api/code-repo/scan-all-stream?account=${acct}`, 'Scanned.');
  };
  const toggle = async (id, cur) => { try { const d = await (await fetch(`/api/code-repo/repositories/${id}/toggle-select`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isSelected: !cur }) })).json(); if (d.success) setRepos((p) => p.map((r) => (r.id === id ? { ...r, is_selected: cur ? 0 : 1 } : r))); } catch { err('That couldn\'t be changed.'); } };
  const toggleAll = async (acct, on) => {
    for (const r of repos.filter((x) => (x.account || 'personal') === acct)) await fetch(`/api/code-repo/repositories/${r.id}/toggle-select`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isSelected: on }) }).catch(() => {});
    setRepos((p) => p.map((r) => ((r.account || 'personal') === acct ? { ...r, is_selected: on ? 1 : 0 } : r)));
  };
  const remove = (r) => call(`rm${r.id}`, `/api/code-repo/repositories/${r.id}`, { method: 'DELETE' }, (d) => { setRepos(d.repositories || []); snack(`Stopped tracking ${r.name}.`); });
  const open = (s) => { setActive(s); setNotes(s.user_observations || ''); };
  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      const d = await (await fetch(`/api/code-repo/snippets/${active.id}/observations`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userObservations: notes }) })).json();
      if (!d.success) throw new Error(d.error || 'They couldn\'t be saved.');
      setActive(d.snippet); setSnips((p) => p.map((x) => (x.id === d.snippet.id ? d.snippet : x))); snack('Notes saved.');
    } catch (e) { err(e.message); }
    setSavingNotes(false);
  };
  const copyCode = () => navigator.clipboard.writeText(active?.code_content || '').then(() => snack('Code copied.')).catch(() => err('It couldn\'t be copied.'));
  const logIdea = async (issue, idx, critical) => {
    const text = `[${critical ? 'Critical Code Audit' : 'Code Repo Audit'}] ${issue.title} in ${issue.file}${issue.line ? `:${issue.line}` : ''}${critical ? '' : ` (${issue.severity})`}: ${issue.description} -> Remediation: ${issue.remediation}`;
    const r = await fetch('/api/dev-ideas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, category: !critical && issue.type === 'registry' ? 'IMS Desktop' : 'Architecture', source: 'code_repo_audit' }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.success === false) throw new Error(d.error || 'It couldn\'t be added to Dev Ideas.');
    setLogged((p) => new Set([...p, idx]));
    return d;
  };
  const logAllCritical = async () => {
    const list = audit.issues.map((issue, idx) => ({ issue, idx })).filter(({ issue, idx }) => issue.severity === 'critical' && !logged.has(idx));
    if (!list.length) return snack('Every critical finding is already in Dev Ideas.');
    setBusy('logall');
    let n = 0;
    for (const { issue, idx } of list) { try { await logIdea(issue, idx, true); n++; } catch { /* carry on */ } }
    setBusy(''); snack(`${n} critical finding${n === 1 ? '' : 's'} added to Dev Ideas.`);
  };

  const personal = useMemo(() => repos.filter((r) => (r.account || 'personal') === 'personal'), [repos]);
  const work = useMemo(() => repos.filter((r) => r.account === 'turntown'), [repos]);
  const grouped = useMemo(() => { const g = { ui: [], hooks: [], services: [], firmware: [], testing: [] }; (snips || []).forEach((s) => g[groupOf(s)].push(s)); return g; }, [snips]);
  const outdated = repos.filter((r) => r.is_outdated).length;
  const anyFilter = group !== 'all' || repoId !== 'all' || stack !== 'all' || q;
  const crit = depWatch?.last?.summary?.critical || 0;
  const accountProps = { scanning: scan.on, scanTarget: scan.target, progress: scan.progress, lastLog: scan.logs[scan.logs.length - 1], onScanOne: (id) => stream(id, `/api/code-repo/scan-stream/${id}`, 'Scanned.'), onToggle: toggle, onRemove: remove, onTokens: () => setTokForm({ personal: '', work: '' }) };

  return (
    <>
      <div className="imsm-row imsm-toolbar">
        <Btn kind="tonal" icon="checklist" busy={auditing} onClick={runAudit}>Quality audit</Btn>
        <Btn kind="tonal" icon="shield" onClick={() => { reloadDeps(); setSheet('deps'); }}>Dependencies{crit > 0 && <span className="imsm-badge">{crit}</span>}</Btn>
        <Btn kind="text" icon="sync" busy={busy === 'check'} disabled={scan.on} onClick={() => call('check', '/api/code-repo/check-outdated', { method: 'POST' }, (d) => { setRepos(d.repositories || []); if (d.outdatedCount > 0) snack(`${d.outdatedCount} repositor${d.outdatedCount === 1 ? 'y has' : 'ies have'} new commits to scan.`); else snack('Everything is up to date.'); })}>Check for updates</Btn>
        {outdated > 0 && <Btn kind="tonal" icon="sync" disabled={scan.on} onClick={() => stream('outdated', '/api/code-repo/scan-outdated-stream', 'The out-of-date repositories are rescanned.')}>Rescan the {outdated} out of date</Btn>}
        <Btn kind="text" icon="hub" busy={busy === 'sync'} onClick={() => call('sync', '/api/code-repo/discover-repos', { method: 'POST' }, (d) => { setRepos(d.repositories || []); snack(`Found ${d.discoveredCount} repositories on GitHub.`); })}>Sync from GitHub</Btn>
        <Btn kind="text" icon="del" busy={busy === 'tidy'} onClick={() => call('tidy', '/api/code-repo/builder/tidy-library', { method: 'POST' }, (d) => {
          const gone = (d.removedDuplicates || 0) + (d.removedNotYours || 0);
          snack(gone ? `Removed ${d.removedDuplicates} duplicate${d.removedDuplicates === 1 ? '' : 's'} and ${d.removedNotYours} piece${d.removedNotYours === 1 ? '' : 's'} that weren't your code; ${d.kept} kept and re-indexed.` : `Nothing to remove: ${d.kept} pieces of code, and the search index is ${d.reindexed ? 'rebuilt' : 'up to date'}.`);
          setActive(null); loadSnips();
        })}>Tidy and re-index</Btn>
        <Btn kind="text" icon="admin" onClick={() => setTokForm({ personal: '', work: '' })}>GitHub tokens</Btn>
      </div>

      <AiQuotasPanel quotas={quotas} loading={quotasLoading} onRefresh={loadQuotas} />

      <div className="imsm-two">
        <Account title="Personal" sub="github.com/simonphilpott · your own tools and projects" icon="person" repos={personal} token={{ ok: tok.personalConfigured, text: tok.personalConfigured ? `Token ${tok.personalMasked}` : 'Public access only' }} onScanAll={() => scanAccount('personal')} onToggleAll={(on) => toggleAll('personal', on)} {...accountProps} />
        <Account title="Work" sub="github.com/simon-philpott-turntown · SPFx and Turner & Townsend" icon="people" repos={work} token={{ ok: tok.turntownConfigured && !tok.turntownMismatch, text: tok.turntownMismatch ? `Wrong account (@${tok.turntownUser})` : tok.turntownConfigured ? `Token ${tok.turntownMasked}` : 'Needs a token' }} mismatch={tok.turntownMismatch ? tok.turntownUser : null} onScanAll={() => scanAccount('turntown')} onToggleAll={(on) => toggleAll('turntown', on)} {...accountProps} />
      </div>

      <h2 className="imsm-h2">Code patterns{snips ? ` (${snips.length})` : ''}</h2>
      <div className="imsm-hubsearch"><Icon n="search" size={22} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a pattern, principle or technology" aria-label="Find a pattern" />{q && <button type="button" className="sl" aria-label="Clear the search" onClick={() => setQ('')}><Icon n="close" size={20} /></button>}</div>
      <div className="imsm-bgf">
        <SelectField label="What it does" value={group} onChange={setGroup} options={[['all', 'Everything'], ...GROUPS.map((g) => [g.key, g.title])]} />
        <SelectField label="Repository" value={repoId} onChange={(v) => setRepoId(v === 'all' ? 'all' : Number(v) || v)} options={[['all', `All ${repos.length}`], ...repos.map((r) => [r.id, `${r.name} (${r.account === 'turntown' ? 'work' : 'personal'})`])]} />
        <SelectField label="Kind of project" value={stack} onChange={setStack} options={[['all', 'Any'], ...stacks.map((t) => [t.id, `${t.name} (${t.count})`])]} />
        {anyFilter && <Btn kind="text" icon="close" onClick={() => { setGroup('all'); setRepoId('all'); setStack('all'); setQ(''); }}>Clear</Btn>}
      </div>
      {snips == null ? <div className="imsm-empty"><Spinner /></div> : !snips.length ? <Empty icon="code" title="No patterns found">Scan some repositories to find the patterns worth reusing.</Empty> : (
        GROUPS.filter((g) => group === 'all' || group === g.key).map((g) => {
          const list = grouped[g.key];
          if (!list.length && group === 'all') return null;
          return (
            <section key={g.key} className="imsm-pgroup">
              <h3 className="imsm-steph"><span className="imsm-tile acc-indigo" style={{ width: 36, height: 36, borderRadius: 12 }}><Icon n={g.icon} size={20} /></span><span>{g.title} <span className="muted">({list.length})</span><small>{g.sub}</small></span></h3>
              {!list.length ? <p className="muted">Nothing here with these filters.</p> : (
                <div className="imsm-pats">
                  {list.map((s) => {
                    const sc = Number(s.principles?.overallScore || s.overallScore || 8.5);
                    const f = flowOf(s);
                    return (
                      <button key={s.id} type="button" className="imsm-pat sl" onClick={() => open(s)}>
                        <span className="imsm-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'nowrap' }}><b>{s.title}</b><span className={`tag ${sc >= 8.5 ? 'good' : 'warn'}`}>{sc.toFixed(1)}</span></span>
                        <span className="flow"><span>{f.steps[0][0]}</span><Icon n="send" size={12} /><span className="c">{f.steps[2][0]}</span><Icon n="send" size={12} /><span>{f.steps[3][0]}</span></span>
                        <small>{s.description}</small>
                        <span className="tags"><span className="tag quiet">{s.stackName || s.technology}</span><span className="tag quiet">{s.language}</span><code className="muted" title={s.file_path}>{s.file_path?.split('/').pop()}</code></span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })
      )}

      <Sheet open={Boolean(active)} onClose={() => setActive(null)} title={active?.title || ''} wideWidth="1000px">
        {active && <Pattern s={active} notes={notes} setNotes={setNotes} onSaveNotes={saveNotes} saving={savingNotes} onCopy={copyCode} />}
      </Sheet>
      <Sheet open={sheet === 'deps'} onClose={() => setSheet(null)} title="Dependencies" wideWidth="1000px">{sheet === 'deps' && <Deps state={depWatch} reload={reloadDeps} />}</Sheet>
      <Sheet open={sheet === 'audit'} onClose={() => setSheet(null)} title="Quality audit" wideWidth="1000px">
        {sheet === 'audit' && (auditing && !audit ? <div className="imsm-empty"><Spinner /><p>Checking type declarations, async error handling and the triple registry…</p></div> : audit && (
          <div className="imsm-form">
            <p className="muted" style={{ margin: 0 }}>Checks the code for missing type definitions, async code without error handling, and whether feature.json, ProjectStructure.JSON and test_plan.md agree.</p>
            <div className="imsm-stats">
              <div className={`imsm-stat ${audit.metrics.overallScore < 75 ? 'bad' : ''}`}><span className="k">Code health</span><b>{audit.metrics.overallScore} <small>/ 100</small></b><span className="s">{audit.metrics.overallScore >= 90 ? 'Ready to ship' : 'Worth fixing first'}</span></div>
              <div className={`imsm-stat ${audit.metrics.tripleRegistryStats.inSync ? '' : 'bad'}`}><span className="k">Triple registry</span><b style={{ fontSize: 20 }}>{audit.metrics.tripleRegistryStats.inSync ? 'In step' : 'Out of step'}</b><span className="s">{audit.metrics.tripleRegistryStats.featureJsonCount} features · {audit.metrics.tripleRegistryStats.projectStructureCount} modules</span></div>
              <div className="imsm-stat"><span className="k">Async error handling</span><b>{audit.metrics.asyncCatchIssuesCount}</b><span className="s">{audit.metrics.asyncCatchIssuesCount ? 'Empty catches or unhandled promises' : 'None missing'}</span></div>
              <div className="imsm-stat"><span className="k">Type declarations</span><b>{audit.metrics.typeIssuesCount}</b><span className="s">{audit.metrics.totalFilesScanned} files checked</span></div>
            </div>
            <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
              <div className="chips wrap">{[['all', `Everything (${audit.issues.length})`], ['registry', `Registry (${audit.metrics.tripleRegistryIssuesCount})`], ['async_catch', `Async (${audit.metrics.asyncCatchIssuesCount})`], ['type_definition', `Types (${audit.metrics.typeIssuesCount})`]].map(([k, l]) => <FilterChip key={k} on={auditFilter === k} onClick={() => setAuditFilter(k)}>{l}</FilterChip>)}</div>
              <span className="imsm-row"><Btn kind="text" icon="bulb" busy={busy === 'logall'} disabled={!audit.issues.some((i) => i.severity === 'critical')} onClick={logAllCritical}>Critical ones to Dev Ideas</Btn><Btn kind="text" icon="sync" busy={auditing} onClick={runAudit}>Run it again</Btn></span>
            </div>
            {audit.issues.map((issue, idx) => ({ issue, idx })).filter(({ issue }) => auditFilter === 'all' || issue.type === auditFilter).map(({ issue, idx }) => (
              <div key={idx} className={`imsm-issue ${issue.severity}`}>
                <div className="imsm-row" style={{ justifyContent: 'space-between' }}><b>{issue.title}</b><span className="imsm-row" style={{ gap: 6 }}><code>{issue.file}{issue.line ? `:${issue.line}` : ''}</code><span className={`tag ${issue.severity === 'critical' ? 'bad' : issue.severity === 'warning' ? 'warn' : 'quiet'}`}>{issue.severity}</span></span></div>
                <p>{issue.description}</p>
                <div className="imsm-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}><span className="fix"><b>Fix:</b> {issue.remediation}</span><Btn kind={logged.has(idx) ? 'text' : 'tonal'} icon={logged.has(idx) ? 'check' : 'bulb'} disabled={logged.has(idx) || busy === `log${idx}`} busy={busy === `log${idx}`} onClick={async () => { setBusy(`log${idx}`); try { const d = await logIdea(issue, idx, false); snack(`Added to Dev Ideas${d.idea?.id ? ` (#${d.idea.id})` : ''}.`); } catch (e) { err(e.message); } setBusy(''); }}>{logged.has(idx) ? 'In Dev Ideas' : 'To Dev Ideas'}</Btn></div>
              </div>
            ))}
            {!audit.issues.some((i) => auditFilter === 'all' || i.type === auditFilter) && <Empty icon="check" title="Nothing found here" />}
          </div>
        ))}
      </Sheet>
      <Sheet open={Boolean(tokForm)} onClose={() => setTokForm(null)} title="GitHub tokens"
        footer={<div className="imsm-row" style={{ justifyContent: 'space-between' }}><span className="muted">Kept in IMS's settings, and only used to read your repositories.</span><span className="imsm-row"><Btn kind="text" onClick={() => setTokForm(null)}>Cancel</Btn><Btn icon="check" busy={busy === 'tok'} disabled={!tokForm?.personal.trim() && !tokForm?.work.trim()} onClick={() => call('tok', '/api/code-repo/tokens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(tokForm.personal.trim() ? { personalToken: tokForm.personal.trim() } : {}), ...(tokForm.work.trim() ? { turntownToken: tokForm.work.trim() } : {}) }) }, (d) => { setTok(d); setTokForm(null); if (d.turntownMismatch) err(`The work token belongs to @${d.turntownUser}, not @simon-philpott-turntown.`); else snack('Tokens saved.'); })}>Save</Btn></span></div>}>
        {tokForm && (
          <div className="imsm-form">
            <div className="imsm-sub-card">
              <div className="imsm-row" style={{ justifyContent: 'space-between' }}><b>Personal <code>simonphilpott</code></b><a href="https://github.com/settings/tokens/new?description=IMS+Personal+Code+Scanner&scopes=repo,read:org" target="_blank" rel="noreferrer">Make a token on GitHub</a></div>
              <p className="muted">Needs the <b>repo</b> scope to read private repositories and avoid GitHub's rate limits.</p>
              {tok.personalValid && <span className="tag good">Connected as @{tok.personalUser}</span>}
              <TextField label={tok.personalConfigured ? `New token (now ${tok.personalMasked})` : 'Token'} type="password" autoComplete="off" value={tokForm.personal} onChange={(v) => setTokForm({ ...tokForm, personal: v })} className="imsm-mono" />
            </div>
            <div className="imsm-sub-card">
              <div className="imsm-row" style={{ justifyContent: 'space-between' }}><b>Work <code>simon-philpott-turntown</code></b><a href="https://github.com/settings/tokens/new?description=IMS+TurnTown+Code+Scanner&scopes=repo,read:org" target="_blank" rel="noreferrer">Make a token on GitHub</a></div>
              <p className="muted">Needs <b>repo</b> and <b>read:org</b>. If the organisation uses single sign-on, press Configure SSO next to the token on GitHub to allow it.</p>
              {tok.turntownValid && !tok.turntownMismatch && <span className="tag good">Connected as @{tok.turntownUser}</span>}
              {tok.turntownMismatch && <div className="imsm-banner"><Icon n="warn" size={22} /><span>This token was made by <b>@{tok.turntownUser}</b>. Sign in to GitHub as <b>simon-philpott-turntown</b> (a private window works), make a token with the repo scope, and paste it here.</span></div>}
              <TextField label={tok.turntownConfigured ? `New token (now ${tok.turntownMasked})` : 'Token'} type="password" autoComplete="off" value={tokForm.work} onChange={(v) => setTokForm({ ...tokForm, work: v })} className="imsm-mono" />
            </div>
          </div>
        )}
      </Sheet>
      <Fab label="New project" icon="add" onClick={() => go('/ims/code-repo/new-project')} />
    </>
  );
}

export default function CodeRepo({ theme = 'light', onThemeToggle, setCurrentPath }) {
  const go = (p) => { window.history.pushState(null, '', p); if (setCurrentPath) setCurrentPath(p); else window.dispatchEvent(new PopStateEvent('popstate')); };
  return (
    <ServicePage title="Code Best Practices" icon="code" accent="indigo" wide theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} sub="Your GitHub repositories, and the code patterns in them worth reusing.">
      <Body go={go} />
    </ServicePage>
  );
}
