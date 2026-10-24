// Model Switcher in the IMS design (24 Oct 2026): which language and voice model each part of IMS uses, why each model
// exists and what it trades off. Each service is a card (the model in use, the recommended one and how it compares,
// audit results); its models open in a sheet to test, assess and switch to. A switch is tested with a tiny real call
// first and the model it replaced is kept for one-tap roll back. Assess every model is the button in the bottom right.
// The same /api/models requests as before (Dashboard/ModelSwitcherPortal.jsx).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ServicePage, { Fab } from './ServicePage';
import { Icon, IconButton, Btn, Sheet, Confirm, useSnack, Spinner } from '../HomebrewBeta/ui';

const KIND_LABEL = { text: 'Language', live: 'Live voice', tts: 'Spoken audio', image: 'Pictures', embedding: 'Embeddings' };
const RATINGS = [['cost', 'Cost', true], ['depth', 'Reasoning depth'], ['speed', 'Speed'], ['complexity', 'Complexity', true], ['reliability', 'Reliability']];
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

// four little bars; for cost and complexity fewer is better, so the colours flip
function Meter({ value, invert }) {
  const good = invert ? value <= 1 : value >= 3;
  const bad = invert ? value >= 3 : value <= 1;
  return <span className={`imsm-meter ${good ? 'good' : bad ? 'bad' : 'mid'}`} aria-label={`${value} of 4`}>{[1, 2, 3, 4].map((i) => <i key={i} className={i <= value ? 'on' : ''} />)}</span>;
}

function Body() {
  const snack = useSnack();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const [probes, setProbes] = useState({});
  const [samples, setSamples] = useState({});
  const [audits, setAudits] = useState({});
  const [assessing, setAssessing] = useState(null);
  const [pick, setPick] = useState(null); // the service whose models are open
  const [more, setMore] = useState({});
  const [confirm, setConfirm] = useState(null);
  const audio = useRef(null);
  const err = useCallback((m) => snack(m, { error: true }), [snack]);

  const load = useCallback(async (refresh = false) => {
    try { const j = await (await fetch(`/api/models${refresh ? '?refresh=1' : ''}`)).json(); if (j.success) setData(j); else err(j.error); } catch (e) { err(e.message); }
  }, [err]);
  useEffect(() => { load(); }, [load]);
  const post = async (url, body, key) => {
    setBusy(key);
    try {
      const j = await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })).json();
      if (!j.success) throw new Error(j.error || 'It didn\'t work.');
      return j;
    } catch (e) { err(e.message); return null; } finally { setBusy(''); }
  };
  // one audio element, started inside the tap: browsers block sound that starts seconds after a tap otherwise
  const unlock = () => { if (!audio.current) audio.current = new Audio(); audio.current.src = SILENCE; audio.current.play().catch(() => {}); };
  const play = (url) => {
    if (!audio.current) audio.current = new Audio();
    audio.current.pause(); audio.current.src = url;
    audio.current.play().catch((e) => err(`The browser didn't let the sample play (${e.name}). Press Play to hear it.`));
  };
  const test = async (m) => {
    unlock();
    const j = await post('/api/models/probe', { model: m.id, kind: m.kind }, `probe:${m.id}`);
    if (!j) return;
    setProbes((p) => ({ ...p, [m.id]: { ok: j.ok !== false, ms: j.ms || 0, error: j.error } }));
    setSamples((x) => ({ ...x, [m.id]: j.ok === false ? null : j.sample }));
    setMore((x) => ({ ...x, [m.id]: true }));
    if (j.ok === false) err(`${m.id}: ${j.error}`);
    else if (j.sample?.type === 'audio') play(j.sample.dataUrl);
  };
  const pollAssess = useCallback(async (quiet) => {
    try {
      const st = await (await fetch('/api/models/assess/status')).json();
      setAssessing(st.running ? st : null);
      if (st.running) setTimeout(() => pollAssess(false), 2500);
      else if (!quiet) { await load(); snack('Assessment finished: each model now shows whether it passes for each service.'); }
    } catch { setAssessing(null); }
  }, [load, snack]);
  useEffect(() => { pollAssess(true); }, [pollAssess]);
  const assess = async (model = null) => {
    const j = await post('/api/models/assess', model ? { model } : { all: true }, model ? `assess:${model}` : 'assess:all');
    if (j) { setAssessing({ running: true, done: 0, total: model ? 1 : 0, current: model }); setTimeout(() => pollAssess(false), 1500); }
  };
  const showAudit = (key, a, ok) => {
    if (!a) return;
    setAudits((x) => ({ ...x, [key]: a }));
    if (a.failed) err(`Audit: ${a.failed} service${a.failed === 1 ? '' : 's'} failed on ${a.model}. See the results, and roll back if you need to.`);
    else if (ok) snack(ok);
  };
  const runAudit = async (svc) => { const j = await post('/api/models/audit', { model: svc.current }, `audit:${svc.key}`); if (j) showAudit(svc.key, j.audit, `All ${j.audit.passed} services on ${svc.current} passed.`); };
  const switchTo = async (svc, model) => {
    const j = await post(`/api/models/${svc.key}`, { model }, `switch:${svc.key}:${model}`);
    if (j) { showAudit(svc.key, j.audit, `${svc.label} now uses ${model}, and all ${j.audit?.passed} services on it passed. The one before is kept for roll back.`); setPick(null); await load(); }
  };
  const rollback = (svc) => setConfirm({ title: `Put ${svc.label} back on ${svc.previous}?`, okLabel: 'Roll back', onOk: async () => {
    const j = await post(`/api/models/${svc.key}/rollback`, {}, `rb:${svc.key}`);
    if (j) { showAudit(svc.key, j.audit, `${svc.label} is back on ${j.selection.current}, and the audit passed.`); await load(); }
  } });
  const reset = async (svc) => {
    const j = await post(`/api/models/${svc.key}/reset`, {}, `reset:${svc.key}`);
    if (j) { showAudit(svc.key, j.audit, `${svc.label} is back on its default, ${svc.default}, and the audit passed.`); await load(); }
  };

  const byKind = useMemo(() => {
    const out = {};
    for (const m of data?.models || []) (out[m.kind] ||= []).push(m);
    const rel = { Stable: 0, 'Moving alias': 1, Preview: 2 };
    for (const k of Object.keys(out)) out[k].sort((a, b) => (rel[a.reliability.level] - rel[b.reliability.level]) || ((b.version || 0) - (a.version || 0)) || a.id.localeCompare(b.id));
    return out;
  }, [data]);
  const optionsFor = (svc) => {
    const rank = (m) => (m.id === svc.recommended ? 0 : m.assessment?.services?.[svc.key]?.ok ? 1 : !m.assessment?.services?.[svc.key] ? 2 : 3);
    return [...(byKind[svc.kind] || [])].sort((a, b) => rank(a) - rank(b));
  };

  if (!data) return <div className="imsm-empty"><Spinner /></div>;
  const pickSvc = pick && data.services.find((s) => s.key === pick);

  const Model = (m, svc) => {
    const probe = probes[m.id] || m.probe;
    const current = svc.current === m.id;
    const verdict = m.assessment?.services?.[svc.key] || null;
    const open = more[m.id] ?? current;
    return (
      <div key={m.id} className={`imsm-model ${current ? 'cur' : ''}`}>
        <button type="button" className="hd sl" onClick={() => setMore((x) => ({ ...x, [m.id]: !open }))} aria-expanded={open}>
          <span className="nm"><b>{m.name}</b><code>{m.id}</code></span>
          <Icon n={open ? 'up' : 'down'} size={22} />
        </button>
        <div className="tags">
          {current && <span className="tag good">In use</span>}
          <span className={`tag ${m.reliability.level === 'Stable' ? 'quiet' : 'warn'}`}>{m.reliability.level}</span>
          {m.isNew && <span className="tag warn" title={`First seen ${when(m.firstSeen)}`}><Icon n="sparkle" size={14} />New</span>}
          {m.id === svc.recommended && <span className="tag good" title={svc.recommendedWhy}><Icon n="star" size={14} />Recommended</span>}
          {m.id === svc.default && <span className="tag quiet">Default</span>}
          {verdict ? <span className={`tag ${verdict.ok ? 'good' : 'bad'}`} title={verdict.reason}><Icon n={verdict.ok ? 'check' : 'close'} size={14} />{verdict.ok ? 'Passes here' : 'Fails here'}</span> : <span className="tag quiet">Not assessed yet</span>}
          {probe && <span className={`tag ${probe.ok ? 'good' : 'bad'}`}>{probe.ok ? `Answers in ${(probe.ms / 1000).toFixed(1)} s` : 'Not available to this key'}</span>}
        </div>
        {verdict && !verdict.ok && <p className="why bad"><Icon n="warn" size={16} /><span><b>Why it fails here:</b> {verdict.reason} (assessed {when(m.assessment.at)})</span></p>}
        <div className="meters">{RATINGS.map(([k, label, inv]) => <span key={k}><small>{label}</small><Meter value={m.ratings[k]} invert={inv} /></span>)}</div>
        {open && (
          <div className="detail">
            {verdict?.ok && <p><b>Assessment:</b> {verdict.reason} ({when(m.assessment.at)})</p>}
            <p><b>Why it exists:</b> {m.purpose}</p>
            {m.intended && <p><b>Meant for:</b> {m.intended}</p>}
            <p><b>Reliability:</b> {m.reliability.text}</p>
            <div className="pc">
              <ul className="pros">{m.benefits.map((b) => <li key={b}><Icon n="check" size={16} />{b}</li>)}</ul>
              <ul className="cons">{m.drawbacks.map((b) => <li key={b}><Icon n="close" size={16} />{b}</li>)}</ul>
            </div>
            <p><b>Price:</b> {m.price ? `US$${m.price.input} per million tokens in, US$${m.price.output} out (Google's list price)` : 'not listed here. Set it on the Costs page once it\'s known; until then the bars above compare it with the others'}{m.inputLimit ? `. Reads up to ${Number(m.inputLimit).toLocaleString('en-GB')} tokens.` : ''}</p>
            {probe && !probe.ok && <p className="bad"><b>Test call:</b> {probe.error}</p>}
            {samples[m.id] && (
              <div className="sample">
                <b>Test result</b>
                {samples[m.id].type === 'audio' && <Btn kind="tonal" icon="play" onClick={() => play(samples[m.id].dataUrl)}>Play</Btn>}
                {samples[m.id].voiced && <span className="muted">(its reply, read out in Ims's voice)</span>}
                {samples[m.id].text && <q>{samples[m.id].text}</q>}
                {samples[m.id].type === 'image' && <img src={samples[m.id].dataUrl} alt="The test picture" />}
              </div>
            )}
          </div>
        )}
        <div className="imsm-row acts">
          <Btn kind="text" icon="flask" busy={busy === `probe:${m.id}`} disabled={!!busy} onClick={() => test(m)}>Test</Btn>
          <Btn kind="text" icon="checklist" busy={busy === `assess:${m.id}` || assessing?.current === m.id} disabled={!!busy || !!assessing} onClick={() => assess(m.id)} title="Try this model in every service it could run, persona included">Assess</Btn>
          {!current && !svc.locked && <Btn kind="tonal" icon="sync" busy={busy === `switch:${svc.key}:${m.id}`} disabled={!!busy || (probe && !probe.ok) || (verdict && !verdict.ok)} title={verdict && !verdict.ok ? `It failed the assessment for this service: ${verdict.reason}` : ''} onClick={() => switchTo(svc, m.id)}>Switch to this</Btn>}
        </div>
      </div>
    );
  };

  return (
    <>
      <details className="imsm-fold">
        <summary><Icon n="info" size={20} /><span>How switching works</span><Icon n="down" size={22} /></summary>
        <div style={{ padding: '0 16px 16px' }}>
          <p>The list comes live from Google for your API key. Before a switch, IMS makes a tiny real call to the new model: Google lists some models it then refuses ("no longer available to new users"), and those are never switched to. The change applies to the next request (for voice, the next conversation), and the model it replaced is kept for roll back.</p>
          <p>New models are found every day and tried in every service they could run, with the same checks as the audit. For anything Ims says himself (day report, voice, spoken alerts) a separate judge checks it sounds like Ims: English only, in character, British, no self-corrections, nothing offensive, and for voice the persona's own accent. A model that fails is marked with the reason, and can't be switched to for that service.</p>
        </div>
      </details>
      {assessing && <div className="imsm-banner info"><Spinner size={20} /><span>Assessing {assessing.current || 'every model'}: {assessing.done} of {assessing.total || '?'} done.</span></div>}
      {data.catalogueError && <div className="imsm-banner"><Icon n="warn" size={22} /><span><b>Google's model list couldn't be fetched.</b> {data.catalogueError}</span></div>}

      <div className="imsm-list">
        {data.services.map((svc) => {
          const options = byKind[svc.kind] || [];
          const passing = options.filter((m) => m.assessment?.services?.[svc.key]?.ok).length;
          const newOnes = options.filter((m) => m.isNew).length;
          const audit = audits[svc.key];
          return (
            <section key={svc.key} className="imsm-svcm">
              <div className="top">
                <span className="lead"><Icon n={svc.kind === 'tts' || svc.kind === 'live' ? 'mic' : svc.kind === 'image' ? 'image' : 'sparkle'} size={22} /></span>
                <span className="txt">
                  <b>{svc.label}{svc.locked && <Icon n="admin" size={16} />}</b>
                  <small>{svc.use}</small>
                </span>
                <span className="tag quiet">{KIND_LABEL[svc.kind]}</span>
              </div>
              <div className="now">
                <span className="k">In use</span>
                <code>{svc.current}</code>
                {svc.changedAt && <small>since {when(svc.changedAt)}{svc.previous ? `, was ${svc.previous}` : ''}</small>}
              </div>
              <p className="muted" style={{ margin: 0 }}>{passing} of {options.length} model{options.length === 1 ? '' : 's'} pass for this{newOnes ? `, ${newOnes} new` : ''}.</p>
              {svc.recommended && (
                <div className={`rec ${svc.current === svc.recommended ? 'same' : ''}`}>
                  <Icon n="star" size={20} />
                  <span><b>Recommended: <code>{svc.recommended}</code></b>{svc.current === svc.recommended ? ' (in use)' : ''}{svc.recommendedIsNew ? ' · new model' : ''} · {svc.recommendedSource === 'assessed' ? 'from the assessments' : 'hand-picked'}<br />{svc.recommendedWhy}</span>
                </div>
              )}
              {svc.comparison?.length > 0 && (
                <ul className="cmp">
                  <li className="h">Compared with {svc.current}</li>
                  {svc.comparison.map((c) => (
                    <li key={c.key} className={c.verdict}><Icon n={c.verdict === 'better' ? 'up' : c.verdict === 'worse' ? 'down' : 'remove'} size={18} /><span><b>{c.label}</b>{c.verdict !== 'same' && ` (${c.change})`}: {c.text}</span></li>
                  ))}
                </ul>
              )}
              {audit && (
                <div className="audit">
                  <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
                    <b>Audit of {audit.model}: {audit.passed} passed{audit.failed ? `, ${audit.failed} failed` : ''} · {when(audit.at)}</b>
                    <IconButton icon="close" label="Close the audit" onClick={() => setAudits((a) => ({ ...a, [svc.key]: null }))} />
                  </div>
                  <ul>
                    {audit.results.map((r) => (
                      <li key={r.service}>
                        <span className={`tag ${r.ok ? 'good' : 'bad'}`}>{r.ok ? 'Pass' : 'Fail'}</span>
                        <span><b>{r.label}</b> {r.detail} ({(r.ms / 1000).toFixed(1)} s)</span>
                        {r.sample?.type === 'audio' && <Btn kind="text" icon="play" onClick={() => play(r.sample.dataUrl)}>Hear it</Btn>}
                        {r.sample?.type === 'image' && <img src={r.sample.dataUrl} alt="" />}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {svc.history?.length > 0 && <p className="muted hist">History: {svc.history.map((h) => `${h.model} (until ${when(h.until)})`).join(' → ')}</p>}
              <div className="imsm-row acts">
                <Btn kind="tonal" icon="list" onClick={() => setPick(svc.key)}>Models ({options.length})</Btn>
                {svc.recommended && svc.current !== svc.recommended && !svc.locked && <Btn icon="star" busy={busy === `switch:${svc.key}:${svc.recommended}`} disabled={!!busy} onClick={() => switchTo(svc, svc.recommended)}>Use the recommended one</Btn>}
                <Btn kind="text" icon="checklist" busy={busy === `audit:${svc.key}`} disabled={!!busy} onClick={() => runAudit(svc)} title={`Try every service on ${svc.current} with the features it uses`}>Audit</Btn>
                {svc.previous && !svc.locked && <Btn kind="text" icon="back" disabled={!!busy} onClick={() => rollback(svc)}>Roll back</Btn>}
                {svc.current !== svc.default && !svc.locked && <Btn kind="text" icon="sync" busy={busy === `reset:${svc.key}`} disabled={!!busy} onClick={() => reset(svc)}>Default</Btn>}
              </div>
            </section>
          );
        })}
      </div>

      <Sheet open={Boolean(pickSvc)} onClose={() => setPick(null)} title={pickSvc ? `Models for ${pickSvc.label}` : ''} wideWidth="860px">
        {pickSvc && (
          <div className="imsm-list">
            {pickSvc.locked && <div className="imsm-banner info"><Icon n="admin" size={22} /><span><b>Locked.</b> {pickSvc.use}</span></div>}
            {!optionsFor(pickSvc).length && <p className="muted">No {KIND_LABEL[pickSvc.kind].toLowerCase()} models in Google's list for this key right now.</p>}
            {optionsFor(pickSvc).map((m) => Model(m, pickSvc))}
          </div>
        )}
      </Sheet>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      <Fab label={assessing ? `Assessing ${assessing.done}/${assessing.total || '?'}` : 'Assess every model'} icon="checklist" disabled={!!busy || !!assessing} onClick={() => assess()} />
    </>
  );
}

export default function Models({ theme = 'light', onThemeToggle, setCurrentPath }) {
  const [k, setK] = useState(0);
  return (
    <ServicePage title="Model Switcher" icon="sparkle" accent="indigo" theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath}
      sub="The language and voice models each part of IMS uses, and what each one trades off."
      actions={<IconButton icon="sync" label="Fetch Google's model list again" onClick={async () => { await fetch('/api/models?refresh=1'); setK((x) => x + 1); }} />}>
      <Body key={k} />
    </ServicePage>
  );
}
