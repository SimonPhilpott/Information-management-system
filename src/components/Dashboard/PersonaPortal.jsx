import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Drama, Save, RotateCw, Undo2, ArrowUp, ArrowDown, Trash2, Copy, Plus,
  ChevronDown, ChevronRight, FileText, History, ListTree, Code2, ChevronsUpDown, Sparkles
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
    const copy = {
      ...m.sections[i],
      id: newId(),
      title: `${m.sections[i].title} (copy)`,
      items: (m.sections[i].items || []).map((it) => ({ ...it, id: newId() }))
    };
    const next = [...m.sections];
    next.splice(i + 1, 0, copy);
    return { ...m, sections: next };
  });
  const addSection = (tpl) => {
    const s = {
      id: newId(),
      title: tpl.title,
      opening: tpl.opening || '',
      items: Array.isArray(tpl.items) ? tpl.items.map((it) => ({ ...it, id: newId() })) : []
    };
    setModel((m) => ({ ...m, sections: [...m.sections, s] }));
    setExpanded((e) => new Set(e).add(s.id));
    setShowTemplates(false);
    setTimeout(() => window.scrollTo?.(0, document.body.scrollHeight), 50);
  };
  const toggle = (id) => setExpanded((e) => { const n = new Set(e); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOpen = model.sections.length > 0 && model.sections.every((s) => expanded.has(s.id));
  const toggleAll = () => setExpanded(allOpen ? new Set() : new Set(model.sections.map((s) => s.id)));

  // --- item operations within a section ---
  const addItem = (sectionId) => {
    setModel((m) => ({
      ...m,
      sections: m.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const currentItems = Array.isArray(s.items) ? s.items : [];
        return {
          ...s,
          items: [...currentItems, { id: newId(), title: '', description: '' }]
        };
      })
    }));
  };

  const updateItem = (sectionId, itemId, patch) => {
    setModel((m) => ({
      ...m,
      sections: m.sections.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          items: (s.items || []).map((it) => (it.id === itemId ? { ...it, ...patch } : it))
        };
      })
    }));
  };

  const removeItem = (sectionId, itemId) => {
    setModel((m) => ({
      ...m,
      sections: m.sections.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          items: (s.items || []).filter((it) => it.id !== itemId)
        };
      })
    }));
  };

  const moveItem = (sectionId, itemIdx, delta) => {
    setModel((m) => ({
      ...m,
      sections: m.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const items = [...(s.items || [])];
        const targetIdx = itemIdx + delta;
        if (targetIdx < 0 || targetIdx >= items.length) return s;
        [items[itemIdx], items[targetIdx]] = [items[targetIdx], items[itemIdx]];
        return { ...s, items };
      })
    }));
  };

  const duplicateItem = (sectionId, itemIdx) => {
    setModel((m) => ({
      ...m,
      sections: m.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const items = [...(s.items || [])];
        const orig = items[itemIdx];
        const copy = { ...orig, id: newId(), title: orig.title ? `${orig.title} (copy)` : '' };
        items.splice(itemIdx + 1, 0, copy);
        return { ...s, items };
      })
    }));
  };

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
          Each card below is one section of <code>ims_persona_rules.md</code>: edit the opening context, configure separate <strong>**title**</strong> items and descriptions, add new rules, and reorder them. The file is rebuilt and renumbered cleanly when you save.
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
          {/* Top Document Title & Intro */}
          <div className={`${panel} p-4`}>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider opacity-70 flex items-center gap-1.5">
                <FileText size={12} />
                <span>Document Title &amp; Introduction</span>
              </label>
              <span className="text-[10px] text-slate-500">Header lines of ims_persona_rules.md</span>
            </div>
            <textarea
              className={`${field} font-mono leading-relaxed resize-y`}
              style={{ minHeight: '90px' }}
              rows={Math.max(3, (model.intro || '').split('\n').length + 1)}
              value={model.intro}
              onChange={(e) => setModel({ ...model, intro: e.target.value })}
              spellCheck={false}
            />
          </div>

          {model.sections.map((s, i) => {
            const open = expanded.has(s.id);
            const itemCount = s.items?.length || 0;
            return (
              <div key={s.id} className={panel}>
                <div className="p-3 flex items-center gap-2">
                  <button onClick={() => toggle(s.id)} className={iconBtn} title={open ? 'Collapse section' : 'Expand section'}>
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <span className="w-7 h-7 rounded-lg bg-purple-500/15 text-purple-400 text-xs font-black flex items-center justify-center shrink-0">{i + 1}</span>
                  <input className={`${field} font-bold flex-1`} value={s.title} onChange={(e) => updateSection(s.id, { title: e.target.value })} />
                  <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] text-slate-400 shrink-0 px-2 py-0.5 rounded-md bg-white/5 border border-white/5">
                    <span>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
                    {s.opening && <span className="text-purple-400 font-semibold">• intro</span>}
                  </span>
                  <button onClick={() => move(i, -1)} disabled={i === 0} className={iconBtn} title="Move up"><ArrowUp size={14} /></button>
                  <button onClick={() => move(i, 1)} disabled={i === model.sections.length - 1} className={iconBtn} title="Move down"><ArrowDown size={14} /></button>
                  <button onClick={() => duplicate(i)} className={iconBtn} title="Duplicate section"><Copy size={14} /></button>
                  <button onClick={() => remove(i)} className={`${iconBtn} text-red-400`} title="Remove section"><Trash2 size={14} /></button>
                </div>

                {open ? (
                  <div className="px-4 pb-4 space-y-4">
                    {/* Opening Sentence / Introductory Text Box */}
                    <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50 border-[#2E2B27]/10'}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                          <Sparkles size={12} />
                          <span>Opening Sentence / Section Context</span>
                        </label>
                        <span className="text-[10px] text-slate-500">
                          Text displayed above the items • Empty if none
                        </span>
                      </div>
                      <textarea
                        className={`w-full px-3.5 py-2.5 rounded-xl text-xs leading-relaxed outline-none border resize-y transition-all ${
                          isDark
                            ? 'bg-slate-950/80 border-white/10 focus:border-purple-400 text-slate-100 placeholder-slate-600'
                            : 'bg-white border-[#2E2B27]/15 focus:border-purple-600 text-slate-900 placeholder-slate-400'
                        }`}
                        rows={Math.max(3, (s.opening || '').split('\n').length + 1)}
                        style={{ minHeight: '84px' }}
                        value={s.opening || ''}
                        placeholder="Enter opening sentence or introductory context for this section (e.g. The voice model's default accent is American. Yorkshire words are not enough...)"
                        onChange={(e) => updateSection(s.id, { opening: e.target.value })}
                        spellCheck={false}
                      />
                    </div>

                    {/* Section Items & Rules */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                            Section Rules &amp; Items
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/25">
                            {itemCount} {itemCount === 1 ? 'item' : 'items'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => addItem(s.id)}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 transition-all active:scale-95 shadow-xs"
                        >
                          <Plus size={13} />
                          <span>Add Item</span>
                        </button>
                      </div>

                      {(!s.items || s.items.length === 0) ? (
                        <div className={`p-4 rounded-xl border border-dashed text-center text-xs ${
                          isDark ? 'border-white/10 text-slate-500 bg-white/[0.02]' : 'border-[#2E2B27]/15 text-slate-500 bg-black/[0.01]'
                        }`}>
                          <span>No bullet items in this section yet. Click below or "Add Item" above to add one.</span>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {s.items.map((it, itemIdx) => {
                            const itemLines = (it.description || '').split('\n').length;
                            return (
                              <div
                                key={it.id}
                                className={`p-3 rounded-xl border transition-all ${
                                  isDark
                                    ? 'bg-slate-950/50 border-white/10 hover:border-purple-500/30'
                                    : 'bg-white border-[#2E2B27]/10 hover:border-purple-500/40 shadow-xs'
                                }`}
                              >
                                {/* Item Top Row: Bullet/Index, Title input wrapped in **, and Item Actions */}
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="w-5 h-5 rounded-md bg-purple-500/15 text-purple-400 text-[10px] font-black flex items-center justify-center shrink-0">
                                    {itemIdx + 1}
                                  </span>
                                  <div className="flex-1 flex items-center gap-1">
                                    <span className="text-xs font-black font-mono text-purple-400 select-none">**</span>
                                    <input
                                      type="text"
                                      className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold outline-none border transition-all ${
                                        isDark
                                          ? 'bg-slate-900 border-white/10 focus:border-purple-400 text-slate-100 placeholder-slate-600'
                                          : 'bg-slate-50 border-[#2E2B27]/15 focus:border-purple-600 text-slate-900 placeholder-slate-400'
                                      }`}
                                      placeholder="Title (e.g. Name: or How Ims sounds:)"
                                      value={it.title}
                                      onChange={(e) => updateItem(s.id, it.id, { title: e.target.value })}
                                    />
                                    <span className="text-xs font-black font-mono text-purple-400 select-none">**</span>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => moveItem(s.id, itemIdx, -1)}
                                      disabled={itemIdx === 0}
                                      className={iconBtn}
                                      title="Move item up"
                                    >
                                      <ArrowUp size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => moveItem(s.id, itemIdx, 1)}
                                      disabled={itemIdx === s.items.length - 1}
                                      className={iconBtn}
                                      title="Move item down"
                                    >
                                      <ArrowDown size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => duplicateItem(s.id, itemIdx)}
                                      className={iconBtn}
                                      title="Duplicate item"
                                    >
                                      <Copy size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => removeItem(s.id, it.id)}
                                      className={`${iconBtn} text-red-400 hover:text-red-300`}
                                      title="Remove item"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>

                                {/* Item Description Textarea */}
                                <textarea
                                  className={`w-full px-3 py-2 rounded-lg text-xs leading-relaxed outline-none border transition-all resize-y ${
                                    isDark
                                      ? 'bg-slate-950/80 border-white/5 focus:border-purple-400/50 text-slate-200 placeholder-slate-600'
                                      : 'bg-slate-50/70 border-[#2E2B27]/10 focus:border-purple-600 text-slate-800 placeholder-slate-400'
                                  }`}
                                  rows={Math.max(2, itemLines)}
                                  style={{ minHeight: '52px' }}
                                  placeholder="Item description / rule details..."
                                  value={it.description}
                                  onChange={(e) => updateItem(s.id, it.id, { description: e.target.value })}
                                  spellCheck={false}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Button to add another item */}
                      <button
                        type="button"
                        onClick={() => addItem(s.id)}
                        className={`w-full py-2.5 rounded-xl border border-dashed flex items-center justify-center gap-2 text-xs font-bold transition-all active:scale-[0.99] ${
                          isDark
                            ? 'border-purple-500/30 hover:border-purple-400 text-purple-300 hover:bg-purple-500/10'
                            : 'border-purple-400/40 hover:border-purple-600 text-purple-700 hover:bg-purple-50'
                        }`}
                      >
                        <Plus size={14} />
                        <span>Add another item with title &amp; description</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="px-14 pb-3 -mt-1 text-[11px] text-slate-500 truncate flex items-center gap-2">
                    {s.opening ? (
                      <span className="italic truncate">{s.opening}</span>
                    ) : s.items?.length > 0 ? (
                      <span className="truncate">
                        <strong className="text-slate-400 font-semibold">{s.items[0].title}</strong>{' '}
                        {s.items[0].description}
                      </span>
                    ) : (
                      <span className="opacity-50">Empty section</span>
                    )}
                  </div>
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
