// Personas in the IMS design (24 Oct 2026): who Ims is and how he speaks. The personas as cards (make one the one Ims
// uses, copy it, delete it), then the chosen one's settings in tabs: profile and voice, accent, rhythm and words,
// conversation, alerts, the personality sliders, house rules for every persona, the test bench, his conversations,
// and the whole file. Save is the button in the bottom right (Ctrl+S too). The same /api/personas and
// /api/settings/personality requests as before (Dashboard/PersonaPortal.jsx).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ServicePage, { Fab } from './ServicePage';
import { Icon, IconButton, Btn, Sheet, TextField, TextArea, SelectField, FilterChip, Segmented, Confirm, useSnack, Spinner } from '../HomebrewBeta/ui';
import { parsePersona, assemblePersona, newId } from '../../utils/personaSections';
import PersonaConversations from '../Dashboard/PersonaConversations';
import ImsFace from '../Ims/ImsFace';
import { EMOTIONS, EMOTION_KEYS, FACE_STYLES } from '../Ims/faceEmotions';
import { api, LANGS, PERSONALITY_AXES_CONFIG, DEFAULT_PERSONALITY, describeSliderAxis } from './personaKit';

const TABS = [
  ['profile', 'Profile and voice', 'person'],
  ['accent', 'Accent', 'mic'],
  ['rhythm', 'Rhythm and words', 'sparkle'],
  ['conversation', 'Conversation', 'chat'],
  ['alerts', 'Alerts and reports', 'bell'],
  ['sliders', 'Personality', 'tune'],
  ['house', 'House rules', 'people'],
  ['test', 'Test bench', 'flask'],
  ['conversations', 'Conversations', 'list'],
  ['raw', 'The whole file', 'doc'],
];
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
const lines = (v) => v.split('\n').map((x) => x.trim()).filter(Boolean);
const stamp = (t) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// a native select with grouped options, in the same outlined style as SelectField
function GroupSelect({ label, value, onChange, groups, empty }) {
  const id = useRef(`gs${Math.random().toString(36).slice(2)}`).current;
  return (
    <div className="tf">
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {empty && <option value="">{empty}</option>}
        {groups.map(([g, opts]) => <optgroup key={g} label={g}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</optgroup>)}
      </select>
      <label htmlFor={id}>{label}</label>
      <span className="drop"><Icon n="drop" /></span>
    </div>
  );
}

// one section of the persona file: its title, opening and numbered rules
function Section({ s, n, onSection, onAdd, onItem, onRemove, onMove, onCopy }) {
  const [open, setOpen] = useState(true);
  const count = s.items?.length || 0;
  return (
    <section className="imsm-card imsm-psec">
      <div className="hd">
        <span className="imsm-step">{n}</span>
        <input className="ttl" value={s.title || ''} placeholder="Section title" aria-label="Section title" onChange={(e) => onSection({ title: e.target.value })} />
        <span className="muted cnt">{count} rule{count === 1 ? '' : 's'}</span>
        <IconButton icon={open ? 'up' : 'down'} label={open ? 'Fold it' : 'Open it'} onClick={() => setOpen(!open)} />
      </div>
      {open ? (
        <>
          <TextArea label="Opening" rows={Math.max(2, (s.opening || '').split('\n').length + 1)} value={s.opening || ''} onChange={(v) => onSection({ opening: v })} spellCheck={false} help="An overview or guidance for the section (optional)." />
          {(s.items || []).map((it, i) => (
            <div key={it.id} className="rule">
              <div className="rh2">
                <span className="no">{i + 1}</span>
                <input className="ttl sm" value={it.title || ''} placeholder="The rule, for example: How Ims sounds" aria-label="Rule title" onChange={(e) => onItem(it.id, { title: e.target.value })} />
                <span className="acts">
                  <IconButton icon="up" label="Move up" disabled={i === 0} onClick={() => onMove(i, -1)} />
                  <IconButton icon="down" label="Move down" disabled={i === count - 1} onClick={() => onMove(i, 1)} />
                  <IconButton icon="copy" label="Duplicate" onClick={() => onCopy(i)} />
                  <IconButton icon="del" label="Remove" onClick={() => onRemove(it.id)} />
                </span>
              </div>
              <TextArea label="What it says" rows={Math.max(2, (it.description || '').split('\n').length)} value={it.description || ''} onChange={(v) => onItem(it.id, { description: v })} spellCheck={false} />
            </div>
          ))}
          <Btn kind="tonal" icon="add" onClick={onAdd}>Add a rule</Btn>
        </>
      ) : <p className="muted fold">{s.opening || (s.items?.[0] ? `${s.items[0].title} ${s.items[0].description}` : 'Empty')}</p>}
    </section>
  );
}

function Body() {
  const snack = useSnack();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [persona, setPersona] = useState(null);
  const [meta, setMeta] = useState(null);
  const [bodyModel, setBodyModel] = useState({ intro: '', sections: [] });
  const [rawFile, setRawFile] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [houseRaw, setHouseRaw] = useState('');
  const [houseSaved, setHouseSaved] = useState('');
  const [tab, setTab] = useState('profile');
  const [busy, setBusy] = useState('');
  const [tests, setTests] = useState(null);
  const [testHistory, setTestHistory] = useState([]);
  const [numbersCheck, setNumbersCheck] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [history, setHistory] = useState(null); // null = closed
  const [create, setCreate] = useState(null); // { name, from }
  const [confirm, setConfirm] = useState(null);
  const [voiceScenarios, setVoiceScenarios] = useState([]);
  const [sampleLine, setSampleLine] = useState('');
  const [voiceScenario, setVoiceScenario] = useState('');
  const [voiceEngine, setVoiceEngine] = useState('live');
  const [heard, setHeard] = useState(null);
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [emotion, setEmotion] = useState('neutral');
  const [personality, setPersonality] = useState(DEFAULT_PERSONALITY);
  const [personalityDirty, setPersonalityDirty] = useState(false);
  const audioRef = useRef(null);
  const analyser = useRef(null);
  const voiceLevel = useRef(0);
  const err = useCallback((m) => snack(m, { error: true }), [snack]);
  const isHouseDirty = houseRaw.trim() !== houseSaved.trim();

  const loadPersonality = useCallback(async () => {
    try {
      const d = await api('/api/settings/personality');
      if (d) { setPersonality(Object.fromEntries(Object.keys(DEFAULT_PERSONALITY).map((k) => [k, typeof d[k] === 'number' ? d[k] : DEFAULT_PERSONALITY[k]]))); setPersonalityDirty(false); }
    } catch { /* defaults stay */ }
  }, []);
  useEffect(() => { loadPersonality(); }, [loadPersonality]);
  const saveSliders = async (override) => {
    try {
      const r = await api('/api/settings/personality', { method: 'POST', body: JSON.stringify(override || personality) });
      setPersonality(Object.fromEntries(Object.keys(DEFAULT_PERSONALITY).map((k) => [k, r[k]])));
      setPersonalityDirty(false);
      snack('Personality saved. Ims uses it from his next reply.');
    } catch (e) { err(`The personality couldn't be saved: ${e.message}`); }
  };

  const loadList = useCallback(async (keep) => { const d = await api('/api/personas'); setData(d); setSelected((cur) => keep || cur || d.activeId); return d; }, []);
  useEffect(() => { loadList().catch((e) => err(e.message)); }, [loadList, err]);
  const loadPersona = useCallback(async (id) => {
    if (!id) return;
    const d = await api(`/api/personas/${id}`);
    setPersona(d.persona);
    const { body, raw, id: _id, updatedAt: _u, ...m } = d.persona;
    setMeta(m); setEmotion(m.faceEmotion || 'neutral');
    setBodyModel(parsePersona(body)); setRawFile(raw); setIsDirty(false);
    setTests(d.tests ? { results: d.tests.results, at: d.tests.at } : null);
    setTestHistory(d.testHistory || []);
  }, []);
  useEffect(() => { loadPersona(selected).catch((e) => err(e.message)); }, [selected, loadPersona, err]);
  useEffect(() => { api('/api/personas/numbers-check').then((d) => setNumbersCheck(d.check)).catch(() => {}); }, []);
  const loadHouse = useCallback(async () => { try { const d = await api('/api/personas/house'); setHouseRaw(d.raw || ''); setHouseSaved(d.raw || ''); } catch (e) { err(e.message); } }, [err]);
  useEffect(() => { loadHouse(); }, [loadHouse]);
  useEffect(() => {
    const h = (e) => { if (isDirty || isHouseDirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [isDirty, isHouseDirty]);

  const setM = (k, v) => { setMeta((p) => ({ ...p, [k]: v })); setIsDirty(true); };
  const setSections = (fn) => { setBodyModel((p) => ({ ...p, sections: fn(p.sections) })); setIsDirty(true); };
  const onSec = (si, patch) => setSections((ss) => ss.map((s, i) => (i === si ? { ...s, ...patch } : s)));
  const onItems = (si, fn) => setSections((ss) => ss.map((s, i) => (i === si ? { ...s, items: fn(s.items || []) } : s)));
  const sectionProps = (si) => ({
    s: bodyModel.sections[si], n: si + 1,
    onSection: (patch) => onSec(si, patch),
    onAdd: () => onItems(si, (it) => [...it, { id: newId(), title: '', description: '' }]),
    onItem: (id, patch) => onItems(si, (it) => it.map((x) => (x.id === id ? { ...x, ...patch } : x))),
    onRemove: (id) => onItems(si, (it) => it.filter((x) => x.id !== id)),
    onMove: (i, by) => onItems(si, (it) => { const j = i + by; if (j < 0 || j >= it.length) return it; const n = it.slice(); [n[i], n[j]] = [n[j], n[i]]; return n; }),
    onCopy: (i) => onItems(si, (it) => { const n = it.slice(); n.splice(i + 1, 0, { ...it[i], id: newId(), title: it[i].title ? `${it[i].title} (copy)` : '' }); return n; }),
  });

  useEffect(() => {
    if (tab === 'raw' && isDirty && meta) {
      api('/api/personas/preview-raw', { method: 'POST', body: JSON.stringify({ meta, body: assemblePersona(bodyModel) }) }).then((r) => { if (r.raw) setRawFile(r.raw); }).catch(() => {});
    }
  }, [tab, isDirty, meta, bodyModel]);

  const run = async (key, fn) => { setBusy(key); try { await fn(); } catch (e) { err(e.message); } setBusy(''); };
  const saveAll = () => run('save', async () => {
    if (tab === 'house') {
      await api('/api/personas/house', { method: 'PUT', body: JSON.stringify({ raw: houseRaw }) });
      setHouseSaved(houseRaw);
      snack('House rules saved. Every persona uses them from the next reply.');
      return;
    }
    if (tab === 'raw') {
      await api(`/api/personas/${selected}/raw`, { method: 'PUT', body: JSON.stringify({ raw: rawFile }) });
      await loadPersona(selected); await loadList(selected);
      snack(`${persona.name} saved from the whole file.`);
      return;
    }
    const d = await api(`/api/personas/${selected}`, { method: 'PUT', body: JSON.stringify({ meta, body: assemblePersona(bodyModel) }) });
    await loadPersona(selected); await loadList(selected);
    snack(`“${d.persona.name}” saved.`);
  });
  const dirty = tab === 'house' ? isHouseDirty : tab === 'sliders' ? personalityDirty : isDirty;
  const saveRef = useRef(saveAll);
  saveRef.current = tab === 'sliders' ? () => saveSliders() : saveAll;
  useEffect(() => {
    const k = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (dirty && !busy) saveRef.current(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [dirty, busy]);
  const revert = () => {
    if (tab === 'house') { setHouseRaw(houseSaved); snack('House rules put back to the saved version.'); return; }
    if (tab === 'sliders') { loadPersonality(); return; }
    setConfirm({ title: 'Throw away your changes?', body: 'The persona goes back to the last saved version.', okLabel: 'Throw them away', danger: true, onOk: () => { loadPersona(selected); snack('Back to the saved version.'); } });
  };
  const pick = (id) => {
    if (id === selected) return;
    if (isDirty || isHouseDirty) setConfirm({ title: 'Switch persona?', body: 'Your unsaved changes will be lost.', okLabel: 'Switch', danger: true, onOk: () => setSelected(id) });
    else setSelected(id);
  };
  const activate = () => setConfirm({ title: `Switch Ims to “${persona.name}”?`, body: 'Everywhere: the desk, the web, spoken alerts, the day report, weather, the doorbell and reminders.', okLabel: 'Switch him', onOk: () => run('activate', async () => {
    await api(`/api/personas/${selected}/activate`, { method: 'POST' });
    await loadList(selected);
    snack(`Ims is now “${persona.name}” everywhere.`);
  }) });
  const doCreate = () => run('create', async () => {
    const name = create.name.trim();
    if (!name) return;
    const d = await api('/api/personas', { method: 'POST', body: JSON.stringify({ name, fromId: create.from || null }) });
    setCreate(null);
    await loadList(d.persona.id);
    setSelected(d.persona.id); setTab('profile');
    snack(`“${d.persona.name}” created. Change it as you like, and make it the one Ims uses when it's ready.`);
  });
  const remove = () => setConfirm({ title: `Delete “${persona.name}”?`, body: 'A copy is kept in its history.', okLabel: 'Delete', danger: true, onOk: () => run('delete', async () => {
    await api(`/api/personas/${selected}`, { method: 'DELETE' });
    const d = await loadList(null);
    setSelected(d.activeId);
    snack('Deleted.');
  }) });
  const openHistory = async () => {
    setHistory([]);
    try { const d = await api(tab === 'house' ? '/api/personas/house' : `/api/personas/${selected}`); setHistory(d.history || []); } catch (e) { err(e.message); }
  };
  const loadVersion = (v) => setConfirm({ title: 'Load this earlier version?', body: 'It goes into the editor; press Save to make it live.', okLabel: 'Load it', onOk: async () => {
    try {
      const d = await api(tab === 'house' ? `/api/personas/house/history/${v.id}` : `/api/personas/${selected}/history/${v.id}`);
      if (tab === 'house') setHouseRaw(d.raw);
      else {
        const { body, raw: _r, id: _id, updatedAt: _u, ...m } = parsePersona(d.raw);
        setRawFile(d.raw); setMeta(m); setBodyModel(parsePersona(body)); setIsDirty(true);
      }
      setHistory(null);
      snack('The earlier version is in the editor. Save to make it live.');
    } catch (e) { err(e.message); }
  } });

  // the voice: one audio element, measured so the face moves with it
  const hookVoice = () => {
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    if (analyser.current) { analyser.current.ctx.resume().catch(() => {}); return a; }
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const an = ctx.createAnalyser(); an.fftSize = 512;
      ctx.createMediaElementSource(a).connect(an); an.connect(ctx.destination);
      analyser.current = { ctx, an, buf: new Uint8Array(an.fftSize) };
      a.addEventListener('playing', () => { if (a.src !== SILENCE) setVoicePlaying(true); });
      a.addEventListener('pause', () => setVoicePlaying(false));
      a.addEventListener('ended', () => setVoicePlaying(false));
    } catch { /* no Web Audio: the face keeps its own rhythm */ }
    return a;
  };
  const play = (url) => { const a = hookVoice(); a.pause(); a.src = url; a.play().catch(() => err('Press Play to hear it.')); };
  useEffect(() => {
    if (!voicePlaying) { voiceLevel.current = 0; return undefined; }
    let raf = 0;
    const loop = () => {
      const h = analyser.current;
      if (h) { h.an.getByteTimeDomainData(h.buf); let s = 0; for (let i = 0; i < h.buf.length; i++) { const v = (h.buf[i] - 128) / 128; s += v * v; } voiceLevel.current = Math.min(1, Math.sqrt(s / h.buf.length) * 2.5); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [voicePlaying]);
  const runTests = (ids) => run('test', async () => {
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = SILENCE; audioRef.current.play().catch(() => {});
    const d = await api(`/api/personas/${selected}/test`, { method: 'POST', body: JSON.stringify({ scenarios: ids }) });
    setTests((prev) => {
      const by = Object.fromEntries((prev?.results || []).map((r) => [r.id, r]));
      for (const r of d.results) by[r.id] = { ...r, at: new Date().toISOString() };
      return { results: (data.scenarios || []).map((s) => by[s.id]).filter(Boolean), at: new Date().toISOString() };
    });
    setTestHistory((h) => [...h, { at: new Date().toISOString(), results: Object.fromEntries(d.results.map((r) => [r.id, r.ok])) }].slice(-30));
    const passed = d.results.filter((r) => r.ok).length;
    snack(`${passed} of ${d.results.length} tests passed.`, passed === d.results.length ? undefined : { error: true });
  });
  useEffect(() => {
    if (tab !== 'test' || voiceScenarios.length) return;
    api('/api/personas/voice-scenarios').then((d) => { setVoiceScenarios(d.scenarios || []); if (!voiceScenario && d.scenarios?.length) setVoiceScenario(d.scenarios[0].id); }).catch((e) => err(e.message));
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const speak = (body, label, key) => run(key, async () => {
    hookVoice(); audioRef.current.src = SILENCE; audioRef.current.play().catch(() => {});
    setHeard(null);
    const d = await api(`/api/personas/${selected}/speak`, { method: 'POST', body: JSON.stringify(body) });
    setHeard({ said: d.said, ms: d.ms, engine: d.engine, label, audio: d.audio });
    play(d.audio);
  });
  const speakLine = (engine) => {
    const text = (sampleLine || meta?.testLine || '').trim();
    if (!text) return err('Type a line for Ims to say first.');
    speak({ text, engine }, 'Your line', engine === 'live' ? 'speak-live' : 'speak-line');
  };
  const speakScenario = () => { const sc = voiceScenarios.find((x) => x.id === voiceScenario); if (sc) speak({ scenario: sc.id, engine: voiceEngine }, sc.label, 'speak-scenario'); };

  const isActive = data && selected === data.activeId;
  const face = (m, em) => ({ faceStyle: m?.faceStyle || 'dots', color: m?.faceColor || '4CFF7A', faceColor: m?.faceColor || '4CFF7A', emotion: em, faceEmotion: em, accessories: m?.accessories });
  const listField = (label, key, help, rows = 6) => (
    <TextArea label={`${label} (${meta[key]?.length || 0})`} rows={rows} value={(meta[key] || []).join('\n')} onChange={(v) => setM(key, lines(v))} spellCheck={false} help={help} className="imsm-monoarea" />
  );

  return (
    <>
      <section className="imsm-card">
        <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
          <h3><Icon n="people" size={20} />Personas</h3>
          <Btn kind="text" icon="add" disabled={!!busy} onClick={() => setCreate({ name: '', from: '' })}>New persona</Btn>
        </div>
        {!data ? <Spinner /> : (
          <div className="imsm-personas">
            {data.personas.map((p) => (
              <button key={p.id} type="button" className={`pc sl ${selected === p.id ? 'on' : ''}`} onClick={() => pick(p.id)}>
                <b>{p.name}{p.active && <span className="tag good">In use</span>}</b>
                <small>{p.accent} · voice {p.voice}</small>
              </button>
            ))}
          </div>
        )}
        {persona && (
          <div className="imsm-pnow">
            <span className="txt"><b>{persona.name}</b><small>{persona.description || 'No description yet'}</small></span>
            {isActive ? <span className="tag good" style={{ height: 34, fontSize: 14 }}><Icon n="check" size={16} />Ims uses this one</span>
              : <Btn icon="mic" busy={busy === 'activate'} disabled={!!busy} onClick={activate}>Make Ims use this</Btn>}
            <IconButton icon="copy" label="Copy it as a new persona" disabled={!!busy} onClick={() => setCreate({ name: `${persona.name} (copy)`, from: selected })} />
            {!persona.isDefault && persona.id !== 'yorkshire' && !isActive && <IconButton icon="del" label="Delete it" disabled={!!busy} onClick={remove} />}
          </div>
        )}
      </section>

      <div className="imsm-ptabs">
        <div className="chips">{TABS.map(([k, l, ic]) => <FilterChip key={k} on={tab === k} onClick={() => setTab(k)} lead={<Icon n={ic} size={18} />}>{l}</FilterChip>)}</div>
      </div>
      {tab !== 'test' && tab !== 'conversations' && (
        <div className="imsm-row imsm-psave">
          {dirty ? <span className="tag warn">Not saved yet</span> : <span className="muted">{tab === 'house' ? 'Shared by every persona' : tab === 'sliders' ? 'Shared by every persona' : 'Everything saved'}</span>}
          <span className="grow" />
          {dirty && <Btn kind="text" icon="back" onClick={revert}>Undo changes</Btn>}
          {tab !== 'sliders' && <Btn kind="text" icon="archive" onClick={openHistory}>Earlier versions</Btn>}
        </div>
      )}

      {!persona || !meta ? <div className="imsm-empty"><Spinner /></div> : (
        <>
          {tab === 'profile' && (
            <>
              <section className="imsm-card">
                <div className="imsm-form">
                  <div className="two">
                    <TextField label="Name" value={meta.name || ''} onChange={(v) => setM('name', v)} />
                    <TextField label="Description" value={meta.description || ''} onChange={(v) => setM('description', v)} />
                    <SelectField label="Voice" value={meta.voice || 'Umbriel'} onChange={(v) => setM('voice', v)} options={(data?.voices || []).map((v) => [v.name, `${v.name}: ${v.desc}`])} help="Used on the desk, in the web app and for spoken alerts." />
                    <SelectField label="Speech language" value={meta.languageCode || 'en-GB'} onChange={(v) => setM('languageCode', v)} options={LANGS} help="Always English; this tunes the voice to the region." />
                  </div>
                  <div className="imsm-pface">
                    <div className="f"><SelectField label="Face" value={meta.faceStyle || 'dots'} onChange={(v) => setM('faceStyle', v)} options={FACE_STYLES.map((s) => [s.id, s.name])} help="Shown on the desk, in the web app and on the dashboard while this persona is in use. Faces are designed in the Face Designer." /></div>
                    <div className="pv"><ImsFace face={face(meta, meta.faceEmotion || 'neutral')} status="idle" width={220} /></div>
                  </div>
                </div>
              </section>
              <section className="imsm-card">
                <TextArea label="Introduction" rows={Math.max(2, (bodyModel.intro || '').split('\n').length + 1)} value={bodyModel.intro || ''} onChange={(v) => { setBodyModel((p) => ({ ...p, intro: v })); setIsDirty(true); }} spellCheck={false} className="imsm-monoarea" help="The heading at the top of the persona file." />
              </section>
              {bodyModel.sections[0] && <Section {...sectionProps(0)} />}
            </>
          )}

          {tab === 'accent' && (
            <>
              <section className="imsm-card">
                <div className="imsm-form">
                  <div className="two">
                    <TextField label="Accent, in short" value={meta.accent || ''} onChange={(v) => setM('accent', v)} placeholder="For example: West Yorkshire (Leeds)" />
                    <TextField label="Dialect, in short" value={meta.dialect || ''} onChange={(v) => setM('dialect', v)} placeholder="For example: broad Yorkshire dialect" />
                  </div>
                  <TextArea label="Accent rule" rows={6} value={meta.accentRule || ''} onChange={(v) => setM('accentRule', v)} spellCheck={false} className="imsm-monoarea" help="Given word for word to the live voice model on every turn: how vowels and consonants must sound, and which accents are ruled out." />
                  <TextArea label="What the accent should sound like" rows={2} value={meta.judgeAccent || ''} onChange={(v) => setM('judgeAccent', v)} spellCheck={false} help="What the judge listens for in the test bench." />
                </div>
              </section>
              {bodyModel.sections[1] && <Section {...sectionProps(1)} />}
            </>
          )}

          {tab === 'rhythm' && (
            <>
              <section className="imsm-card">
                <div className="imsm-p3">
                  {listField('Thinking sounds', 'thinkingSounds', 'Stretched openers like "Weeell," and "Soooo,". One per line.')}
                  {listField('Dialect words', 'dialectWords', 'Words he can lean on in conversation. One per line.')}
                  {listField('Tag endings', 'tagEndings', 'Endings like "…mind", "…like", "…then". One per line.')}
                </div>
              </section>
              {bodyModel.sections[2] && <Section {...sectionProps(2)} />}
            </>
          )}

          {tab === 'conversation' && (
            <>
              <section className="imsm-card">
                <div className="imsm-form">
                  <div className="two">
                    <TextArea label="Character, in short" rows={3} value={meta.character || ''} onChange={(v) => setM('character', v)} help="Used by the persona checks." />
                    <TextArea label="When he didn't catch it" rows={3} value={meta.clarifyExample || ''} onChange={(v) => setM('clarifyExample', v)} help="Said when speech was muffled or unclear." />
                  </div>
                  <TextArea label={`Tastes (${meta.tastes?.length || 0})`} rows={6} value={(meta.tastes || []).join('\n')} onChange={(v) => setM('tastes', lines(v))} placeholder={'One per line, for example:\nFavourite board game: Wingspan, for the calm of it\nCan\'t stand: microwaved tea'} help="What he likes and can't stand; he holds to these when you ask what he'd pick." />
                </div>
              </section>
              {bodyModel.sections.slice(3).map((s, i) => <Section key={s.id || i + 3} {...sectionProps(i + 3)} />)}
            </>
          )}

          {tab === 'alerts' && (
            <section className="imsm-card">
              <div className="imsm-form">
                <div className="two">
                  {listField('Day report sign-offs', 'signOffs', 'How he can finish the morning report. One per line.', 5)}
                  <SelectField label="Weather wording" value={meta.weatherPhrasing || 'plain'} onChange={(v) => setM('weatherPhrasing', v)} options={[['plain', 'In his own words and dialect'], ['yorkshire', 'With the built-in Yorkshire phrases']]} help="Whether the built-in regional weather phrases are given to him." />
                  <TextArea label="Doorbell: someone rings" rows={5} className="imsm-monoarea" value={(meta.doorbell?.ding || []).join('\n')} onChange={(v) => { setMeta((p) => ({ ...p, doorbell: { ...(p.doorbell || {}), ding: lines(v) } })); setIsDirty(true); }} spellCheck={false} help="{name} and {place} are filled in. One per line." />
                  <TextArea label="Doorbell: movement seen" rows={5} className="imsm-monoarea" value={(meta.doorbell?.motion || []).join('\n')} onChange={(v) => { setMeta((p) => ({ ...p, doorbell: { ...(p.doorbell || {}), motion: lines(v) } })); setIsDirty(true); }} spellCheck={false} help="One per line." />
                </div>
              </div>
            </section>
          )}

          {tab === 'sliders' && (
            <>
              <p className="muted" style={{ margin: 0 }}>Five dials, from the desk's Personality screen, shaping his humour, delivery, temperament, warmth and formality. They apply to every persona.</p>
              {Object.entries(PERSONALITY_AXES_CONFIG).map(([key, axis]) => {
                const val = Math.round(Number(personality[key] ?? 50));
                const d = describeSliderAxis(val, axis);
                const set = (v) => { setPersonality((p) => ({ ...p, [key]: v })); setPersonalityDirty(true); };
                return (
                  <section key={key} className="imsm-card imsm-axis">
                    <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
                      <h3>{axis.label}<span className="tag good">{d.name} · {val}%</span></h3>
                      <Segmented label={`${axis.label} presets`} value={d.name} onChange={(n) => set([axis.low, axis.mid, axis.high].find((t) => t.name === n).val)} options={[axis.low, axis.mid, axis.high].map((t) => [t.name, t.name])} />
                    </div>
                    <input type="range" className="imsm-range" min="0" max="100" step="1" value={val} onChange={(e) => set(Number(e.target.value))} aria-label={axis.label} style={{ '--v': `${val}%` }} />
                    <p className="muted" style={{ margin: 0, fontStyle: 'italic' }}>{d.text}</p>
                  </section>
                );
              })}
              <div className="imsm-row"><Btn kind="text" icon="sync" onClick={() => { setPersonality(DEFAULT_PERSONALITY); saveSliders(DEFAULT_PERSONALITY); }}>Back to the defaults</Btn></div>
              <details className="imsm-fold">
                <summary><Icon n="doc" size={20} /><span>What he's told</span><Icon n="down" size={22} /></summary>
                <p className="imsm-code" style={{ margin: '0 16px 16px', whiteSpace: 'pre-wrap' }}>
                  {`PERSONALITY PROFILE: Your responses should be shaped by these calibrated behavioral traits: ${Object.entries(PERSONALITY_AXES_CONFIG).map(([k, ax]) => { const x = describeSliderAxis(personality[k], ax); return `${ax.label}: ${x.name} (${x.text}).`; }).join(' ')}`}
                </p>
              </details>
            </>
          )}

          {tab === 'house' && (
            <section className="imsm-card">
              <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
                <span className="muted">Rules for every persona: making things, asking when unsure, no medical disclaimers, jokes and keeping it short. <code>personas/_house_rules.md</code></span>
                <IconButton icon="copy" label="Copy the house rules" onClick={() => navigator.clipboard.writeText(houseRaw).then(() => snack('Copied.'))} />
              </div>
              <textarea className="imsm-bigtext" value={houseRaw} onChange={(e) => setHouseRaw(e.target.value)} spellCheck={false} aria-label="House rules" />
            </section>
          )}

          {tab === 'test' && (
            <>
              <section className="imsm-card">
                <h3><Icon n="play" size={20} />Hear {persona.name}</h3>
                <div className="imsm-hear">
                  <div className="fc">
                    <ImsFace face={face(meta, emotion)} status={voicePlaying ? 'speaking' : (busy || '').startsWith('speak') ? 'thinking' : 'idle'} levelRef={voiceLevel} width={240} />
                    <SelectField label="Expression" value={emotion} onChange={setEmotion} options={EMOTION_KEYS.map((k) => [k, EMOTIONS[k].label])} />
                  </div>
                  <div className="imsm-form" style={{ flex: 1, minWidth: 0 }}>
                    <p className="muted" style={{ margin: 0 }}>Voice: {meta.voice || 'default'}{isDirty ? '. Save first to hear your changes.' : '.'}</p>
                    <TextField label="A line for him to say" value={sampleLine} placeholder={meta.testLine || 'Type anything'} onChange={setSampleLine} onKeyDown={(e) => { if (e.key === 'Enter' && !busy) speakLine('tts'); }} />
                    <div className="imsm-row">
                      <Btn icon="play" busy={busy === 'speak-line'} disabled={!!busy} onClick={() => speakLine('tts')} title="Says exactly this line in the persona's voice and accent">Say it</Btn>
                      <Btn kind="tonal" icon="mic" busy={busy === 'speak-live'} disabled={!!busy} onClick={() => speakLine('live')} title="Sends it to the live voice model the desk uses, so you hear how he'd answer">Say it live</Btn>
                    </div>
                    <GroupSelect label="Or something real he says" value={voiceScenario} onChange={setVoiceScenario} empty={voiceScenarios.length ? null : 'Loading…'} groups={[...new Set(voiceScenarios.map((x) => x.group))].map((g) => [g, voiceScenarios.filter((x) => x.group === g).map((x) => [x.id, x.label])])} />
                    <div className="imsm-row">
                      <Segmented label="Which voice" value={voiceEngine} onChange={setVoiceEngine} options={[['live', 'Live (desk)'], ['tts', 'Read aloud']]} />
                      <Btn icon="play" busy={busy === 'speak-scenario'} disabled={!!busy || !voiceScenario} onClick={speakScenario}>{busy === 'speak-scenario' ? 'Getting it ready…' : 'Play it'}</Btn>
                    </div>
                    {busy === 'speak-scenario' && <p className="muted" style={{ margin: 0 }}>Gathering today's real data and voicing it; it can take up to a minute.</p>}
                    {heard && (
                      <div className="imsm-heard">
                        <div className="imsm-row"><b>{heard.label}</b><span className="muted">{heard.engine === 'live' ? 'Live voice' : 'Read aloud'}{heard.ms ? `, ready in ${(heard.ms / 1000).toFixed(1)} s` : ''}</span><span className="grow" /><Btn kind="text" icon="play" onClick={() => play(heard.audio)}>Again</Btn></div>
                        {heard.said && <q>{heard.said}</q>}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className="imsm-card">
                <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
                  <h3><Icon n="chart" size={20} />Numbers he said against the data</h3>
                  <Btn kind="tonal" icon="check" busy={busy === 'numbers'} disabled={!!busy} onClick={() => run('numbers', async () => {
                    const d = await api('/api/personas/numbers-check', { method: 'POST', body: JSON.stringify({ days: 7 }) });
                    setNumbersCheck(d.check);
                    snack(d.check.checked ? `${d.check.mismatches} of ${d.check.checked} replies had a number that didn't match.` : 'No replies with data to check yet.', d.check.mismatches ? { error: true } : undefined);
                  })}>Check the last 7 days</Btn>
                </div>
                <p className="muted" style={{ margin: 0 }}>{numbersCheck ? `${numbersCheck.checked} replies checked, ${numbersCheck.mismatches} with a mismatch · ${stamp(numbersCheck.at)}` : 'Checks recent replies where he read out the weather, reminders, the calendar, glucose or the day report.'}</p>
                {numbersCheck?.results?.filter((x) => !x.ok).map((x) => (
                  <div key={x.turnId} className="imsm-miss"><b>{stamp(x.at)}</b> ({x.tools.join(', ')}): {x.problems.join('; ')}<q>{x.said}</q></div>
                ))}
              </section>

              <section className="imsm-card">
                <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
                  <h3><Icon n="flask" size={20} />Tests</h3>
                  <Btn icon="play" busy={busy === 'test'} disabled={!!busy} onClick={() => runTests(picked.size ? [...picked] : null)}>{busy === 'test' ? 'Testing…' : picked.size ? `Run the ${picked.size} ticked` : 'Run them all'}</Btn>
                </div>
                <p className="muted" style={{ margin: 0 }}>Tries <b>{persona.name}</b> in key situations; a separate judge checks the dialect, the character and, for voice tests, how it sounds.</p>
                {[['core', 'Voice and character'], ['aliveness', 'Aliveness: does he feel like someone?']].map(([g, title]) => {
                  const group = (data?.scenarios || []).filter((s) => (s.group || 'core') === g);
                  if (!group.length) return null;
                  const latest = group.map((s) => tests?.results?.find((x) => x.id === s.id)).filter(Boolean);
                  return (
                    <div key={g} className="imsm-tgroup">
                      <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
                        <b>{title}{latest.length > 0 && <span className="muted"> · {latest.filter((x) => x.ok).length} of {group.length} passing</span>}</b>
                        <Btn kind="text" disabled={!!busy} onClick={() => runTests(group.map((x) => x.id))}>Run this group</Btn>
                      </div>
                      {group.map((sc) => {
                        const r = tests?.results?.find((x) => x.id === sc.id);
                        const trend = testHistory.filter((h) => h.results && sc.id in h.results).slice(-12);
                        return (
                          <div key={sc.id} className={`imsm-test ${r ? (r.ok ? 'ok' : 'no') : ''}`}>
                            <div className="top">
                              <label className="ck"><input type="checkbox" checked={picked.has(sc.id)} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(sc.id)) n.delete(sc.id); else n.add(sc.id); return n; })} aria-label={`Tick ${sc.label}`} /></label>
                              <span className="txt"><b>{sc.label}</b><small>{sc.about}</small></span>
                              <span className={`tag ${sc.kind === 'voice' ? 'warn' : 'quiet'}`}>{sc.kind}</span>
                              {trend.length > 1 && <span className="trend" title={`The last ${trend.length} runs, oldest first`}>{trend.map((h, i) => <i key={i} className={h.results[sc.id] ? 'p' : 'f'} />)}</span>}
                              {r && <span className={`tag ${r.ok ? 'good' : 'bad'}`}>{r.ok ? 'Pass' : 'Fail'}</span>}
                              {r?.audio && <IconButton icon="play" label="Hear it" onClick={() => play(r.audio)} />}
                              <Btn kind="text" disabled={!!busy} onClick={() => runTests([sc.id])}>Run</Btn>
                            </div>
                            {r && (
                              <div className="res">
                                {r.text && <q>{r.text.slice(0, 500)}</q>}
                                <p><b>{r.ok ? 'Judged: ' : 'Why it failed: '}</b>{r.reason}{r.at ? ` · ${stamp(r.at)}` : ''}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </section>
            </>
          )}

          {tab === 'conversations' && (
            <div className="imsm-legacy-conv">
              <PersonaConversations isDark={false} panel="imsm-card" ghost="btn tonal sl imsm-lbtn" field="imsm-native" strong="" sub="muted" showToast={(m, t) => snack(m, t === 'error' ? { error: true } : undefined)} />
            </div>
          )}

          {tab === 'raw' && (
            <section className="imsm-card">
              <div className="imsm-row" style={{ justifyContent: 'space-between' }}>
                <span className="muted"><code>personas/{selected}.md</code> · {rawFile.split('\n').length} lines. Changes in the other tabs are put together here, and you can change it directly too.</span>
                <IconButton icon="copy" label="Copy the whole file" onClick={() => navigator.clipboard.writeText(rawFile).then(() => snack('Copied.'))} />
              </div>
              <textarea className="imsm-bigtext" value={rawFile} onChange={(e) => { setRawFile(e.target.value); setIsDirty(true); }} spellCheck={false} aria-label="The whole persona file" />
            </section>
          )}
        </>
      )}

      <Sheet open={history != null} onClose={() => setHistory(null)} title="Earlier versions">
        <p className="muted" style={{ marginTop: 0 }}>Every save keeps a copy. Loading one puts it in the editor; save to make it live.</p>
        {history && !history.length ? <p className="muted">No earlier versions yet.</p> : (
          <ul className="imsm-log" style={{ padding: 0 }}>
            {(history || []).map((v) => <li key={v.id}><span className="m"><b>{stamp(v.savedAt)}</b> · {v.bytes} bytes</span><Btn kind="tonal" icon="back" onClick={() => loadVersion(v)}>Load it</Btn></li>)}
          </ul>
        )}
      </Sheet>
      <Sheet open={Boolean(create)} onClose={() => setCreate(null)} title={create?.from ? 'Copy this persona' : 'A new persona'}
        footer={<div className="imsm-row end"><Btn kind="text" onClick={() => setCreate(null)}>Cancel</Btn><Btn icon="add" busy={busy === 'create'} disabled={!create?.name.trim() || !!busy} onClick={doCreate}>Create it</Btn></div>}>
        {create && (
          <div className="imsm-form">
            <p className="muted" style={{ margin: 0 }}>{create.from ? 'A full copy of the persona, to change as you like.' : 'Starts with the standard speech guidance and identity rules.'}</p>
            <TextField label="Name" value={create.name} onChange={(v) => setCreate({ ...create, name: v })} autoFocus placeholder="For example: Scottish Ims" onKeyDown={(e) => e.key === 'Enter' && doCreate()} />
            <SelectField label="Start from" value={create.from} onChange={(v) => setCreate({ ...create, from: v })} options={[['', 'The standard template'], ...(data?.personas || []).map((p) => [p.id, `A copy of “${p.name}” (${p.accent})`])]} />
          </div>
        )}
      </Sheet>
      <Confirm open={Boolean(confirm)} {...(confirm || {})} onClose={() => setConfirm(null)} onOk={confirm?.onOk || (() => {})} />
      {tab !== 'test' && tab !== 'conversations' && <Fab label={busy === 'save' ? 'Saving…' : 'Save'} icon="check" disabled={!dirty || !!busy} onClick={() => saveRef.current()} />}
    </>
  );
}

export default function Personas({ theme = 'light', onThemeToggle, setCurrentPath }) {
  return (
    <ServicePage title="Personas" icon="people" accent="violet" wide theme={theme} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} sub="Who Ims is and how he speaks.">
      <Body />
    </ServicePage>
  );
}
