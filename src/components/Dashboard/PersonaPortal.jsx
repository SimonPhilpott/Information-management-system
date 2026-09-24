import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Drama, Save, RotateCw, Undo2, ArrowUp, ArrowDown, Trash2, Copy, Plus,
  ChevronDown, ChevronRight, FileText, History, ListTree, Code2, ChevronsUpDown
} from 'lucide-react';
import PortalShell from './PortalShell';
import { parsePersona, assemblePersona, newId, SECTION_TEMPLATES } from '../../utils/personaSections';

// ims_persona_rules.md as editable sections. The file is always what gets
// saved: the sections are reassembled (renumbered by position) into it, and
// the previous version is kept in the history list on every save.
const normalise = (md) => assemblePersona(parsePersona(md));

export default function PersonaPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';

  const [model, setModel] = useState({ intro: '', sections: [] });
  const [rawContent, setRawContent] = useState('');
  const [mode, setMode] = useState('sections');       // 'sections' | 'raw'
  const [savedContent, setSavedContent] = useState('');
  const [filePath, setFilePath] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [showTemplates, setShowTemplates] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState(null);

  const showToast = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification((prev) => (prev?.msg === msg ? null : prev)), 4000);
  }, []);

  const currentContent = mode === 'sections' ? assemblePersona(model) : rawContent;
  const isDirty = useMemo(() => normalise(currentContent) !== normalise(savedContent), [currentContent, savedContent]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/persona-rules');
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed to load persona rules.');
      setSavedContent(d.content || '');
      setRawContent(d.content || '');
      setModel(parsePersona(d.content || ''));
      setFilePath(d.path || '');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = (e) => { if (isDirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const save = useCallback(async () => {
    const content = mode === 'sections' ? assemblePersona(model) : rawContent;
    if (!content.trim()) { showToast('Persona rules cannot be empty.', 'error'); return; }
    setIsSaving(true);
    try {
      const res = await fetch('/api/persona-rules', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content })
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Failed to save.');
      setSavedContent(content);
      setRawContent(content);
      showToast("Saved - Ims uses this from the next conversation. The previous version is in History.");
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  }, [mode, model, rawContent, showToast]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (isDirty && !isSaving) save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDirty, isSaving, save]);

  const revert = () => {
    if (!isDirty || !window.confirm('Discard unsaved changes and go back to the last saved version?')) return;
    setRawContent(savedContent);
    setModel(parsePersona(savedContent));
  };

  const switchMode = (next) => {
    if (next === mode) return;
    if (next === 'raw') setRawContent(assemblePersona(model));
    else setModel(parsePersona(rawContent));
    setMode(next);
  };

  // --- section operations ---
  const updateSection = (id, patch) => setModel((m) => ({ ...m, sections: m.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const move = (i, delta) => setModel((m) => {
    const j = i + delta;
    if (j < 0 || j >= m.sections.length) return m;
    const next = [...m.sections];
    [next[i], next[j]] = [next[j], next[i]];
    return { ...m, sections: next };
  });
  const remove = (i) => {
    const s = model.sections[i];
    if (!window.confirm(`Remove the section "${s.title}"? (It stays in History once you save.)`)) return;
    setModel((m) => ({ ...m, sections: m.sections.filter((_, k) => k !== i) }));
  };
  const duplicate = (i) => setModel((m) => {
    const copy = { ...m.sections[i], id: newId(), title: `${m.sections[i].title} (copy)` };
    const next = [...m.sections];
    next.splice(i + 1, 0, copy);
    return { ...m, sections: next };
  });
  const addSection = (tpl) => {
    const s = { id: newId(), title: tpl.title, body: tpl.body };
    setModel((m) => ({ ...m, sections: [...m.sections, s] }));
    setExpanded((e) => new Set(e).add(s.id));
    setShowTemplates(false);
    setTimeout(() => window.scrollTo?.(0, document.body.scrollHeight), 50);
  };
  const toggle = (id) => setExpanded((e) => { const n = new Set(e); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOpen = model.sections.length > 0 && model.sections.every((s) => expanded.has(s.id));
  const toggleAll = () => setExpanded(allOpen ? new Set() : new Set(model.sections.map((s) => s.id)));

  // --- history ---
  const openHistory = async () => {
    setShowHistory(true);
    try {
      const d = await (await fetch('/api/persona-rules/history')).json();
      if (d.success) setHistory(d.versions);
    } catch (err) { showToast(err.message, 'error'); }
  };
  const loadVersion = async (v) => {
    if (isDirty && !window.confirm('Replace your unsaved edits with this earlier version?')) return;
    try {
      const d = await (await fetch(`/api/persona-rules/history/${v.id}`)).json();
      if (!d.success) throw new Error(d.error || 'Could not load that version.');
      setRawContent(d.content);
      setModel(parsePersona(d.content));
      setShowHistory(false);
      showToast('Loaded into the editor - press Save to make it live.');
    } catch (err) { showToast(err.message, 'error'); }
  };

  const panel = `rounded-2xl border ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;
  const field = `w-full px-3 py-2 rounded-lg text-xs outline-none border ${isDark ? 'bg-slate-950/60 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/10 text-slate-900'}`;
  const ghost = `px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all active:scale-95 ${isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300' : 'bg-black/5 hover:bg-black/10 text-slate-700'}`;
  const iconBtn = `p-1.5 rounded-lg disabled:opacity-30 ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`;

  return (
    <PortalShell title="IMS Persona Editor" subtitle="/ims/persona • ims_persona_rules.md"
      icon={Drama} gradient="from-purple-500 to-fuchsia-600" glow="rgba(192,38,211,0.3)"
      isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={notification} maxWidth="max-w-5xl">

      <div className={`p-3 rounded-xl border flex items-start gap-3 text-xs ${isDark ? 'bg-slate-900/40 border-white/5 text-slate-400' : 'bg-white/70 border-[#2E2B27]/10 text-slate-600'}`}>
        <FileText size={14} className="shrink-0 mt-0.5 opacity-70" />
        <span>
          This document defines Ims's fixed dialect, identity and tool-usage rules - the personality sliders separately control tone within it.
          Each card below is one section of <code>ims_persona_rules.md</code>: edit them, add new ones from a template, reorder or remove them, and the file is rebuilt (sections renumbered) when you save. Changes apply from Ims's next conversation.
          Which <strong>faces</strong> Ims uses, and when, now lives in the Face Designer.
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className={`flex rounded-xl overflow-hidden border ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
          {[['sections', 'Sections', ListTree], ['raw', 'Raw markdown', Code2]].map(([key, text, Icon]) => (
            <button key={key} onClick={() => switchMode(key)}
              className={`px-3 py-2 text-xs font-bold flex items-center gap-2 ${mode === key ? 'bg-gradient-to-r from-purple-500 to-fuchsia-600 text-white' : isDark ? 'text-slate-300 hover:bg-white/5' : 'text-slate-700 hover:bg-black/5'}`}>
              <Icon size={13} />{text}
            </button>
          ))}
        </div>
        {mode === 'sections' && (
          <>
            <button onClick={toggleAll} className={ghost}><ChevronsUpDown size={13} />{allOpen ? 'Collapse all' : 'Expand all'}</button>
            <div className="relative">
              <button onClick={() => setShowTemplates(!showTemplates)} className={ghost}><Plus size={13} />Add section</button>
              {showTemplates && (
                <div className={`absolute z-30 mt-2 w-64 rounded-xl border shadow-2xl p-1 ${isDark ? 'bg-slate-900 border-white/10' : 'bg-white border-[#2E2B27]/15'}`}>
                  {SECTION_TEMPLATES.map((t) => (
                    <button key={t.label} onClick={() => addSection(t)} className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}>{t.label}</button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        <button onClick={openHistory} className={ghost}><History size={13} />History</button>
        <div className="ml-auto flex items-center gap-2">
          {isDirty && <span className="px-2 py-1 rounded-full text-[10px] font-black uppercase bg-amber-500/15 text-amber-400 border border-amber-500/25">Unsaved</span>}
          {isDirty && <button onClick={revert} className={ghost}><Undo2 size={13} />Revert</button>}
          <button onClick={save} disabled={!isDirty || isSaving}
            className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r from-purple-500 to-fuchsia-600 text-white shadow-[0_0_15px_rgba(192,38,211,0.25)] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
            {isSaving ? <RotateCw size={14} className="animate-spin" /> : <Save size={14} />}{isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 flex justify-center"><RotateCw size={24} className="text-purple-400 animate-spin" /></div>
      ) : mode === 'raw' ? (
        <div className={`${panel} overflow-hidden flex flex-col`}>
          <textarea value={rawContent} onChange={(e) => setRawContent(e.target.value)} spellCheck={false}
            className={`w-full min-h-[65vh] p-5 text-xs font-mono leading-relaxed outline-none resize-y bg-transparent ${isDark ? 'text-slate-100' : 'text-slate-900'}`} />
          <div className="px-5 py-2.5 border-t border-white/5 flex justify-between text-[10px] font-semibold text-slate-500">
            <span>{rawContent.split('\n').length} lines &middot; {rawContent.length} characters</span>
            <span className="font-mono opacity-60 truncate max-w-[50%]">{filePath}</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Intro */}
          <div className={`${panel} p-4`}>
            <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block opacity-70">Document title &amp; introduction</label>
            <textarea className={`${field} font-mono min-h-[80px] leading-relaxed`} value={model.intro}
              onChange={(e) => setModel({ ...model, intro: e.target.value })} spellCheck={false} />
          </div>

          {model.sections.map((s, i) => {
            const open = expanded.has(s.id);
            const lines = s.body ? s.body.split('\n').length : 0;
            return (
              <div key={s.id} className={panel}>
                <div className="p-3 flex items-center gap-2">
                  <button onClick={() => toggle(s.id)} className={iconBtn} title={open ? 'Collapse' : 'Expand'}>
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <span className="w-7 h-7 rounded-lg bg-purple-500/15 text-purple-400 text-xs font-black flex items-center justify-center shrink-0">{i + 1}</span>
                  <input className={`${field} font-bold`} value={s.title} onChange={(e) => updateSection(s.id, { title: e.target.value })} />
                  <span className="hidden sm:inline text-[10px] text-slate-500 shrink-0 tabular-nums">{lines} lines</span>
                  <button onClick={() => move(i, -1)} disabled={i === 0} className={iconBtn} title="Move up"><ArrowUp size={14} /></button>
                  <button onClick={() => move(i, 1)} disabled={i === model.sections.length - 1} className={iconBtn} title="Move down"><ArrowDown size={14} /></button>
                  <button onClick={() => duplicate(i)} className={iconBtn} title="Duplicate"><Copy size={14} /></button>
                  <button onClick={() => remove(i)} className={`${iconBtn} text-red-400`} title="Remove"><Trash2 size={14} /></button>
                </div>
                {open ? (
                  <div className="px-3 pb-3">
                    <textarea className={`${field} font-mono leading-relaxed`} spellCheck={false}
                      style={{ minHeight: `${Math.min(30, Math.max(6, lines + 1)) * 1.45}rem` }}
                      value={s.body} onChange={(e) => updateSection(s.id, { body: e.target.value })} />
                  </div>
                ) : (
                  s.body && <p className="px-14 pb-3 -mt-1 text-[11px] text-slate-500 truncate">{s.body.split('\n').find((l) => l.trim()) || ''}</p>
                )}
              </div>
            );
          })}

          <button onClick={() => setShowTemplates(true)} className={`${ghost} justify-center border border-dashed ${isDark ? 'border-white/15' : 'border-[#2E2B27]/20'}`}>
            <Plus size={14} /> Add a section
          </button>
        </div>
      )}

      {/* History */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowHistory(false)}>
          <div onClick={(e) => e.stopPropagation()} className={`max-w-lg w-full max-h-[80vh] flex flex-col rounded-2xl border p-6 shadow-2xl ${isDark ? 'bg-slate-900 border-white/10 text-white' : 'bg-white border-[#2E2B27]/15 text-slate-900'}`}>
            <h2 className="text-sm font-black uppercase tracking-wider mb-1 flex items-center gap-2"><History size={16} />Previous versions</h2>
            <p className="text-[11px] text-slate-500 mb-3">A copy of the file is kept every time you save. Loading one puts it in the editor - press Save to make it live.</p>
            <div className="overflow-y-auto flex flex-col gap-2">
              {history.length === 0 ? <p className="text-xs text-slate-500 py-6 text-center">No earlier versions yet - one is kept from your next save.</p>
                : history.map((v) => (
                  <div key={v.id} className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${isDark ? 'border-white/5 bg-slate-950/40' : 'border-[#2E2B27]/10 bg-slate-50'}`}>
                    <div>
                      <div className="font-bold">{new Date(v.savedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                      <div className="text-[10px] text-slate-500">{Math.round(v.bytes / 100) / 10} KB</div>
                    </div>
                    <button onClick={() => loadVersion(v)} className={ghost}><Undo2 size={12} />Load</button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
}
