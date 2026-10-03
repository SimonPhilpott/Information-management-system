import React, { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, RefreshCw, Undo2, Lock, FlaskConical, Check, X, ChevronDown, ChevronRight, RotateCcw, Play, ClipboardCheck, Sparkles, AlertTriangle } from 'lucide-react';
import PortalShell from './PortalShell';
import Notice from './RunPlanner/Notice';

// Model Switcher: which language / voice model each part of IMS uses, why each model exists, and
// what it trades off. A switch is tested with a tiny real call first, and the model it replaced is
// kept so it can be rolled back in one click.
const KIND_LABEL = { text: 'Language', live: 'Live voice', tts: 'Spoken audio', image: 'Pictures', embedding: 'Embeddings' };
const RATINGS = [['cost', 'Cost', true], ['depth', 'Reasoning depth'], ['speed', 'Speed'], ['complexity', 'Complexity', true], ['reliability', 'Reliability']];
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '');

export default function ModelSwitcherPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [data, setData] = useState(null);
  const [openSvc, setOpenSvc] = useState(null);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState(null);
  const [probes, setProbes] = useState({});
  const [expanded, setExpanded] = useState({});
  const [samples, setSamples] = useState({}); // Test button results: { model: { type, text, dataUrl } }
  const [audits, setAudits] = useState({});   // { serviceKey: audit }
  const [assessing, setAssessing] = useState(null); // background assessment progress

  const card = isDark ? 'bg-slate-900/60 border-white/10' : 'bg-white border-[#2E2B27]/15 shadow-sm';
  const strong = isDark ? 'text-slate-50' : 'text-slate-900';
  const body = isDark ? 'text-slate-200' : 'text-slate-800';
  const line = isDark ? 'border-white/10' : 'border-slate-200';
  const btn = `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50 ${isDark ? 'bg-white/5 border-white/15 text-slate-100 hover:bg-white/10' : 'bg-white border-slate-300 text-slate-900 hover:bg-slate-100'}`;
  const primary = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50';

  const load = async (refresh = false) => {
    try {
      const j = await (await fetch(`/api/models${refresh ? '?refresh=1' : ''}`)).json();
      if (j.success) setData(j);
      else setNote({ type: 'error', msg: j.error });
    } catch (e) { setNote({ type: 'error', msg: e.message }); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (note) { const t = setTimeout(() => setNote(null), 6000); return () => clearTimeout(t); } }, [note]);

  const post = async (url, body, key) => {
    setBusy(key);
    try {
      const j = await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })).json();
      if (!j.success) throw new Error(j.error || 'Failed');
      return j;
    } catch (e) { setNote({ type: 'error', msg: e.message }); return null; } finally { setBusy(''); }
  };

  // One audio element, unlocked inside the click: a test takes a few seconds, and browsers block sound
  // that starts that long after a click unless the element was already playing from the click itself.
  const audioRef = React.useRef(null);
  const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
  const unlockAudio = () => {
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    a.src = SILENCE;
    a.play().catch(() => {});
  };
  const play = (dataUrl) => {
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    a.pause();
    a.src = dataUrl;
    a.play().catch((e) => setNote({ type: 'error', msg: `The browser didn't let the sample play (${e.name}) - press Play to hear it.` }));
  };
  const test = async (model, kind) => {
    unlockAudio();
    const j = await post('/api/models/probe', { model, kind }, `probe:${model}`);
    if (!j) return;
    setProbes((p) => ({ ...p, [model]: { ok: j.ok !== false, ms: j.ms || 0, error: j.error } }));
    setSamples((x) => ({ ...x, [model]: j.ok === false ? null : j.sample }));
    setExpanded((e) => ({ ...e, [model]: true }));
    if (j.ok === false) setNote({ type: 'error', msg: `${model}: ${j.error}` });
    else if (j.sample?.type === 'audio') play(j.sample.dataUrl);
  };
  const pollAssess = async () => {
    try {
      const st = await (await fetch('/api/models/assess/status')).json();
      setAssessing(st.running ? st : null);
      if (st.running) setTimeout(pollAssess, 2500);
      else { await load(); setNote({ type: 'ok', msg: 'Assessment finished - each model now shows whether it passes for each service.' }); }
    } catch { setAssessing(null); }
  };
  const assess = async (model = null) => {
    const j = await post('/api/models/assess', model ? { model } : { all: true }, model ? `assess:${model}` : 'assess:all');
    if (j) { setAssessing({ running: true, done: 0, total: model ? 1 : 0, current: model }); setTimeout(pollAssess, 1500); }
  };
  useEffect(() => { pollAssessQuiet(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function pollAssessQuiet() {
    try { const st = await (await fetch('/api/models/assess/status')).json(); if (st.running) { setAssessing(st); setTimeout(pollAssess, 2500); } } catch { }
  }
  const showAudit = (svcKey, audit) => {
    if (!audit) return;
    setAudits((a) => ({ ...a, [svcKey]: audit }));
    if (audit.failed) setNote({ type: 'error', msg: `Audit: ${audit.failed} service(s) failed on ${audit.model} - see the results, and Roll back if needed.` });
  };
  const runAudit = async (svc) => {
    const j = await post('/api/models/audit', { model: svc.current }, `audit:${svc.key}`);
    if (j) { showAudit(svc.key, j.audit); if (!j.audit.failed) setNote({ type: 'ok', msg: `All ${j.audit.passed} service(s) on ${svc.current} passed.` }); }
  };
  const switchTo = async (svc, model) => {
    const j = await post(`/api/models/${svc.key}`, { model }, `switch:${svc.key}:${model}`);
    if (j) {
      showAudit(svc.key, j.audit);
      if (!j.audit?.failed) setNote({ type: 'ok', msg: `${svc.label} now uses ${model}. Audit: all ${j.audit?.passed} service(s) on it passed. The previous model is kept for roll back.` });
      await load();
    }
  };
  const rollback = async (svc) => {
    if (!window.confirm(`Put ${svc.label} back on ${svc.previous}?`)) return;
    const j = await post(`/api/models/${svc.key}/rollback`, {}, `rb:${svc.key}`);
    if (j) { showAudit(svc.key, j.audit); if (!j.audit?.failed) setNote({ type: 'ok', msg: `${svc.label} rolled back to ${j.selection.current} - audit passed.` }); await load(); }
  };
  const reset = async (svc) => {
    const j = await post(`/api/models/${svc.key}/reset`, {}, `reset:${svc.key}`);
    if (j) { showAudit(svc.key, j.audit); if (!j.audit?.failed) setNote({ type: 'ok', msg: `${svc.label} back on its default, ${svc.default} - audit passed.` }); await load(); }
  };

  const modelsByKind = useMemo(() => {
    const out = {};
    for (const m of data?.models || []) (out[m.kind] ||= []).push(m);
    const rel = { Stable: 0, 'Moving alias': 1, Preview: 2 };
    for (const k of Object.keys(out)) out[k].sort((a, b) => (rel[a.reliability.level] - rel[b.reliability.level]) || ((b.version || 0) - (a.version || 0)) || a.id.localeCompare(b.id));
    return out;
  }, [data]);

  const Meter = ({ value, invert }) => (
    <span className="inline-flex gap-0.5" aria-label={`${value} of 4`}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={`w-3 h-2 rounded-sm ${i <= value ? (invert ? (value >= 3 ? 'bg-rose-600' : value === 2 ? 'bg-amber-500' : 'bg-emerald-600') : (value >= 3 ? 'bg-emerald-600' : value === 2 ? 'bg-amber-500' : 'bg-rose-600')) : (isDark ? 'bg-white/15' : 'bg-slate-200')}`} />
      ))}
    </span>
  );

  const RelBadge = ({ r }) => (
    <span className={`text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${r.level === 'Stable' ? 'bg-emerald-600 text-white' : r.level === 'Preview' ? 'bg-amber-500 text-black' : 'bg-sky-600 text-white'}`} title={r.text}>{r.level}</span>
  );

  const ModelRow = ({ m, svc }) => {
    const probe = probes[m.id] || m.probe;
    const current = svc.current === m.id;
    const verdict = m.assessment?.services?.[svc.key] || null;
    const more = expanded[m.id] ?? current;
    const setMore = (v) => setExpanded((e) => ({ ...e, [m.id]: v }));
    return (
      <div className={`rounded-lg border p-3 ${current ? (isDark ? 'border-indigo-400 bg-indigo-500/10' : 'border-indigo-500 bg-indigo-50') : line}`}>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setMore(!more)} className={`inline-flex items-center gap-1 font-black text-sm ${strong}`}>{more ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{m.name}</button>
          <code className={`text-[11px] ${body}`}>{m.id}</code>
          <RelBadge r={m.reliability} />
          {current && <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-600 text-white">In use</span>}
          {m.isNew && <span className="inline-flex items-center gap-0.5 text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-fuchsia-600 text-white" title={`First seen ${when(m.firstSeen)}`}><Sparkles size={10} />New</span>}
          {verdict ? (
            <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${verdict.ok ? 'bg-emerald-700 text-white' : 'bg-rose-700 text-white'}`} title={verdict.reason}>
              {verdict.ok ? <Check size={10} /> : <X size={10} />}{verdict.ok ? 'Passes for this service' : 'Fails for this service'}
            </span>
          ) : (
            <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded border ${isDark ? 'border-white/30 text-slate-100' : 'border-slate-400 text-slate-800'}`}>Not assessed yet</span>
          )}
          {m.id === svc.recommended && <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-400 text-black" title={svc.recommendedWhy}>Recommended</span>}
          {m.id === svc.default && <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded border ${isDark ? 'border-white/30 text-slate-100' : 'border-slate-400 text-slate-800'}`}>Default</span>}
          {probe && <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${probe.ok ? (isDark ? 'text-emerald-300' : 'text-emerald-800') : (isDark ? 'text-rose-300' : 'text-rose-800')}`}>{probe.ok ? <Check size={12} /> : <X size={12} />}{probe.ok ? `Answers (${(probe.ms / 1000).toFixed(1)} s)` : 'Not available to this key'}</span>}
          <div className="ml-auto flex gap-2">
            <button className={btn} disabled={!!busy} onClick={() => test(m.id, m.kind)}><FlaskConical size={13} />{busy === `probe:${m.id}` ? 'Testing...' : 'Test'}</button>
            <button className={btn} disabled={!!busy || !!assessing} onClick={() => assess(m.id)} title="Try this model in every service it could run, persona included"><ClipboardCheck size={13} />{busy === `assess:${m.id}` || assessing?.current === m.id ? 'Assessing...' : 'Assess'}</button>
            {!current && !svc.locked && <button className={primary} disabled={!!busy || (probe && !probe.ok) || (verdict && !verdict.ok)} title={verdict && !verdict.ok ? `Failed the assessment for this service: ${verdict.reason}` : ''} onClick={() => switchTo(svc, m.id)}>{busy === `switch:${svc.key}:${m.id}` ? 'Testing & switching...' : 'Switch to this'}</button>}
          </div>
        </div>
        {verdict && !verdict.ok && (
          <div className={`mt-2 flex gap-1.5 text-xs rounded-md px-2 py-1.5 ${isDark ? 'bg-rose-500/15 text-rose-200' : 'bg-rose-50 text-rose-900'}`}>
            <AlertTriangle size={13} className="shrink-0 mt-0.5" /><span><span className="font-black">Why it fails here: </span>{verdict.reason} <span className="opacity-90">(assessed {when(m.assessment.at)})</span></span>
          </div>
        )}
        {verdict?.ok && more && <div className={`mt-2 text-xs ${body}`}><span className={`font-black ${strong}`}>Assessment: </span>{verdict.reason} ({when(m.assessment.at)})</div>}
        <div className={`mt-2 grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-1 text-[11px] ${body}`}>
          {RATINGS.map(([k, label, invert]) => (
            <div key={k} className="flex items-center justify-between gap-2"><span className="font-semibold">{label}</span><Meter value={m.ratings[k]} invert={invert} /></div>
          ))}
        </div>
        {more && (
          <div className={`mt-2.5 text-xs space-y-1.5 ${body}`}>
            <p><span className={`font-black ${strong}`}>Why it exists: </span>{m.purpose}</p>
            {m.intended && <p><span className={`font-black ${strong}`}>Intended use: </span>{m.intended}</p>}
            <p><span className={`font-black ${strong}`}>Reliability: </span>{m.reliability.text}</p>
            <div className="grid sm:grid-cols-2 gap-2">
              <ul className="space-y-0.5">{m.benefits.map((b) => <li key={b} className="flex gap-1.5"><Check size={13} className={`shrink-0 mt-0.5 ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`} />{b}</li>)}</ul>
              <ul className="space-y-0.5">{m.drawbacks.map((b) => <li key={b} className="flex gap-1.5"><X size={13} className={`shrink-0 mt-0.5 ${isDark ? 'text-rose-300' : 'text-rose-700'}`} />{b}</li>)}</ul>
            </div>
            <p><span className={`font-black ${strong}`}>Price: </span>{m.price ? `US$${m.price.input} per million tokens in, US$${m.price.output} out (Google list price)` : 'not listed here - set it on the Costs page once known; until then the bars above compare it with the others'}{m.inputLimit ? ` · reads up to ${Number(m.inputLimit).toLocaleString('en-GB')} tokens` : ''}</p>
            {probe && !probe.ok && <p className={isDark ? 'text-rose-300' : 'text-rose-800'}><span className="font-black">Test call: </span>{probe.error}</p>}
            {samples[m.id] && (
              <div className={`rounded-lg border p-2 flex flex-wrap items-center gap-2 ${line}`}>
                <span className={`font-black ${strong}`}>Test result:</span>
                {samples[m.id].type === 'audio' && <button className={btn} onClick={() => play(samples[m.id].dataUrl)}><Play size={13} />Play</button>}
                {samples[m.id].voiced && <span className={body}>(its reply, read out in Ims's voice)</span>}
                {samples[m.id].text && <span className="italic">“{samples[m.id].text}”</span>}
                {samples[m.id].type === 'image' && <img src={samples[m.id].dataUrl} alt="Test picture" className="h-32 rounded-md" />}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <PortalShell title="Model Switcher" subtitle="/ims/models • the language and voice models each part of IMS uses" icon={BrainCircuit}
      gradient="from-indigo-500 to-violet-700" glow="rgba(99,102,241,0.3)" isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={note}>
      {!data ? <div className={`p-8 ${body}`}>Loading models...</div> : (
        <div className="space-y-4">
          <Notice isDark={isDark} tone="info" title="How switching works"
            actions={<>
              <button className={btn} disabled={!!busy} onClick={() => load(true)}><RefreshCw size={13} />Refresh model list</button>
              <button className={btn} disabled={!!busy || !!assessing} onClick={() => assess()}><ClipboardCheck size={13} />{assessing ? `Assessing ${assessing.done}/${assessing.total || '?'}...` : 'Assess all models'}</button>
            </>}>
            The list comes live from Google for your API key. Before a switch, IMS makes a tiny real call to the new model - Google lists some models it then refuses ("no longer available to new users"), and those are never switched to. The change applies to the next request (voice: the next conversation), and the model it replaced is kept for one-click roll back.
            {' '}New models are found every day and tried in every service they could run - the same checks as the audit, and for anything Ims says himself (day report, voice, spoken alerts) a separate judge checks it sounds like Ims: English only, in character, British, no self-corrections, nothing offensive, and for voice the active persona's accent itself. A model that fails is marked with the reason, and can't be switched to for that service.
            {assessing && <span className="block mt-1 font-bold">Assessing {assessing.current || '...'} ({assessing.done} of {assessing.total} done)</span>}
          </Notice>
          {data.catalogueError && <Notice isDark={isDark} tone="warn" title="Couldn't fetch Google's model list">{data.catalogueError}</Notice>}

          {data.services.map((svc) => {
            const isOpen = openSvc === svc.key;
            const rank = (m) => (m.id === svc.recommended ? 0 : m.assessment?.services?.[svc.key]?.ok ? 1 : !m.assessment?.services?.[svc.key] ? 2 : 3);
            const options = [...(modelsByKind[svc.kind] || [])].sort((a, b) => rank(a) - rank(b));
            const passing = options.filter((m) => m.assessment?.services?.[svc.key]?.ok).length;
            const newOnes = options.filter((m) => m.isNew).length;
            return (
              <section key={svc.key} className={`rounded-xl border ${card}`}>
                <div className="p-4 flex flex-wrap items-center gap-3">
                  <button onClick={() => setOpenSvc(isOpen ? null : svc.key)} className="flex-1 min-w-[240px] text-left">
                    <div className={`flex items-center gap-2 font-black ${strong}`}>
                      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}{svc.label}
                      <span className={`text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${isDark ? 'bg-white/10 text-slate-100' : 'bg-slate-200 text-slate-900'}`}>{KIND_LABEL[svc.kind]}</span>
                      {svc.locked && <Lock size={13} />}
                    </div>
                    <p className={`text-xs mt-0.5 ml-6 ${body}`}>{svc.use}</p>
                    <p className={`text-xs mt-0.5 ml-6 font-semibold ${body}`}>{passing} of {options.length} model{options.length === 1 ? '' : 's'} pass for this service{newOnes ? ` · ${newOnes} new` : ''}</p>
                    {svc.recommended && (
                      <p className={`text-xs mt-1 ml-6 ${body}`}>
                        <span className={`font-black ${strong}`}>Recommended: </span><code className={`font-bold ${strong}`}>{svc.recommended}</code>
                        {svc.recommendedIsNew && <span className="ml-1.5 text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-fuchsia-600 text-white">New model</span>}
                        <span className={`ml-1.5 text-[10px] font-black uppercase px-1.5 py-0.5 rounded border ${isDark ? 'border-white/30' : 'border-slate-400'}`} title={svc.recommendedSource === 'assessed' ? 'Chosen from the latest assessments' : 'Hand-picked - this service has no assessment results yet'}>{svc.recommendedSource === 'assessed' ? 'From assessments' : 'Hand-picked'}</span>
                        {svc.current === svc.recommended ? <span className={`ml-1.5 font-bold ${isDark ? 'text-emerald-300' : 'text-emerald-800'}`}>(in use)</span> : null}
                        {' - '}{svc.recommendedWhy}
                      </p>
                    )}
                    {svc.comparison?.length > 0 && (
                      <div className={`mt-1.5 ml-6 rounded-lg border p-2 ${line}`}>
                        <div className={`text-[11px] font-black uppercase tracking-wide mb-1 ${strong}`}>Compared with {svc.current}</div>
                        <ul className="space-y-1">
                          {svc.comparison.map((c) => (
                            <li key={c.key} className={`text-xs flex gap-2 ${body}`}>
                              <span className={`shrink-0 w-4 text-center font-black ${c.verdict === 'better' ? (isDark ? 'text-emerald-300' : 'text-emerald-700') : c.verdict === 'worse' ? (isDark ? 'text-amber-300' : 'text-amber-700') : ''}`}>
                                {c.verdict === 'better' ? '▲' : c.verdict === 'worse' ? '▼' : '='}
                              </span>
                              <span><span className={`font-bold ${strong}`}>{c.label}</span>{c.verdict !== 'same' && <span className="tabular-nums"> ({c.change})</span>}: {c.text}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </button>
                  <div className="text-right">
                    <code className={`text-sm font-black ${strong}`}>{svc.current}</code>
                    {svc.changedAt && <div className={`text-[11px] ${body}`}>since {when(svc.changedAt)}{svc.previous ? ` · was ${svc.previous}` : ''}</div>}
                  </div>
                  <div className="flex gap-2">
                    <button className={btn} disabled={!!busy} onClick={() => runAudit(svc)} title={`Try every service on ${svc.current} with the features it uses`}><ClipboardCheck size={13} />{busy === `audit:${svc.key}` ? 'Auditing...' : 'Audit'}</button>
                    {svc.recommended && svc.current !== svc.recommended && !svc.locked && (
                      <button className={primary} disabled={!!busy} onClick={() => switchTo(svc, svc.recommended)}>{busy === `switch:${svc.key}:${svc.recommended}` ? 'Testing & switching...' : 'Use recommended'}</button>
                    )}
                    {svc.previous && !svc.locked && <button className={btn} disabled={!!busy} onClick={() => rollback(svc)}><Undo2 size={13} />Roll back</button>}
                    {svc.current !== svc.default && !svc.locked && <button className={btn} disabled={!!busy} onClick={() => reset(svc)}><RotateCcw size={13} />Default</button>}
                  </div>
                </div>
                {audits[svc.key] && (
                  <div className={`border-t px-4 py-3 ${line}`}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className={`text-xs font-black uppercase tracking-wide ${strong}`}>
                        Audit of {audits[svc.key].model} · {audits[svc.key].passed} passed{audits[svc.key].failed ? `, ${audits[svc.key].failed} failed` : ''} · {when(audits[svc.key].at)}
                      </span>
                      <button className={btn} onClick={() => setAudits((a) => ({ ...a, [svc.key]: null }))}><X size={12} />Close</button>
                    </div>
                    <ul className="space-y-1">
                      {audits[svc.key].results.map((r) => (
                        <li key={r.service} className={`text-xs flex flex-wrap items-center gap-2 ${body}`}>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${r.ok ? 'bg-emerald-700 text-white' : 'bg-rose-700 text-white'}`}>{r.ok ? 'PASS' : 'FAIL'}</span>
                          <span className={`font-bold ${strong}`}>{r.label}</span>
                          <span>{r.detail}</span>
                          <span className="tabular-nums">({(r.ms / 1000).toFixed(1)} s)</span>
                          {r.sample?.type === 'audio' && <button className={btn} onClick={() => play(r.sample.dataUrl)}><Play size={12} />Hear it</button>}
                          {r.sample?.type === 'image' && <img src={r.sample.dataUrl} alt="" className="h-12 rounded" />}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {isOpen && (
                  <div className={`border-t p-4 space-y-2 ${line}`}>
                    {svc.locked && <Notice isDark={isDark} tone="warn" title="Locked">{svc.use}</Notice>}
                    {!options.length && <p className={`text-xs ${body}`}>No {KIND_LABEL[svc.kind].toLowerCase()} models in Google's list for this key right now.</p>}
                    {options.map((m) => <React.Fragment key={m.id}>{ModelRow({ m, svc })}</React.Fragment>)}
                    {svc.history?.length > 0 && (
                      <div className={`text-xs pt-2 ${body}`}>
                        <span className={`font-black ${strong}`}>History: </span>
                        {svc.history.map((h) => `${h.model} (until ${when(h.until)})`).join(' → ')}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </PortalShell>
  );
}
