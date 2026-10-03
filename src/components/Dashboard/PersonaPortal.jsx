import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Drama, Save, RotateCw, Undo2, ArrowUp, ArrowDown, Trash2, Copy, Plus,
  ChevronDown, ChevronRight, FileText, History, ListTree, Code2, ChevronsUpDown, Sparkles,
  Check, X, Play, Mic, FlaskConical, Users, BookOpen, SlidersHorizontal, MessageSquare, Bell, Clipboard
} from 'lucide-react';
import PortalShell from './PortalShell';
import { parsePersona, assemblePersona, newId } from '../../utils/personaSections';

// Strip YAML frontmatter
const stripHeader = (raw) => String(raw || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');

// Helper fetch wrapper
const api = async (url, opts = {}) => {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.success === false) throw new Error(d.error || `Request failed (${res.status})`);
  return d;
};

const LANGS = [
  ['en-GB', 'English (UK)'],
  ['en-US', 'English (US)'],
  ['en-AU', 'English (Australia)'],
  ['en-IN', 'English (India)']
];

// ---------------------------------------------------------------------------------------------------------
// SectionCard: Visual card for an individual persona markdown section (Items + Title + Opening text)
// ---------------------------------------------------------------------------------------------------------
function SectionCard({
  section,
  index,
  isDark,
  sub,
  panel,
  field,
  iconBtn,
  ghost,
  onUpdateSection,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onMoveItem,
  onDuplicateItem
}) {
  const [open, setOpen] = useState(true);
  const itemCount = section.items?.length || 0;

  return (
    <div className={panel}>
      <div className="p-3 flex items-center gap-2">
        <button onClick={() => setOpen(!open)} className={iconBtn}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <span className="w-7 h-7 rounded-lg bg-purple-600 text-white text-xs font-black flex items-center justify-center shrink-0">
          {index + 1}
        </span>
        <input
          className={`${field} font-bold flex-1`}
          value={section.title || ''}
          placeholder="Section Title"
          onChange={(e) => onUpdateSection({ title: e.target.value })}
        />
        <span className={`hidden sm:inline text-[11px] font-semibold shrink-0 ${sub}`}>
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </span>
      </div>

      {open ? (
        <div className="px-4 pb-4 space-y-3">
          <div>
            <label className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 mb-1 ${sub}`}>
              <Sparkles size={12} />Opening instructions / summary
            </label>
            <textarea
              className={`${field} leading-relaxed resize-y`}
              rows={Math.max(2, (section.opening || '').split('\n').length + 1)}
              value={section.opening || ''}
              placeholder="Optional overview or guidelines for this section"
              onChange={(e) => onUpdateSection({ opening: e.target.value })}
              spellCheck={false}
            />
          </div>

          {(section.items || []).map((it, idx) => (
            <div key={it.id} className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950/50 border-white/10' : 'bg-white border-[#2E2B27]/15'}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-md bg-purple-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                <input
                  className={`${field} font-bold flex-1`}
                  placeholder="Key rule / topic (e.g. How Ims sounds)"
                  value={it.title || ''}
                  onChange={(e) => onUpdateItem(it.id, { title: e.target.value })}
                />
                <button onClick={() => onMoveItem(idx, -1)} disabled={idx === 0} className={iconBtn} title="Move up">
                  <ArrowUp size={13} />
                </button>
                <button onClick={() => onMoveItem(idx, 1)} disabled={idx === (section.items?.length || 0) - 1} className={iconBtn} title="Move down">
                  <ArrowDown size={13} />
                </button>
                <button onClick={() => onDuplicateItem(idx)} className={iconBtn} title="Duplicate rule">
                  <Copy size={13} />
                </button>
                <button onClick={() => onRemoveItem(it.id)} className={`${iconBtn} text-red-500`} title="Remove rule">
                  <Trash2 size={13} />
                </button>
              </div>
              <textarea
                className={`${field} leading-relaxed resize-y`}
                rows={Math.max(2, (it.description || '').split('\n').length)}
                placeholder="What this specific rule or guideline instructs"
                value={it.description || ''}
                onChange={(e) => onUpdateItem(it.id, { description: e.target.value })}
                spellCheck={false}
              />
            </div>
          ))}

          <button
            onClick={onAddItem}
            className={`w-full py-2 rounded-xl border border-dashed flex items-center justify-center gap-2 text-xs font-bold transition-all ${isDark ? 'border-purple-400/40 text-purple-200 hover:bg-purple-950/20' : 'border-purple-500/50 text-purple-800 hover:bg-purple-50'}`}
          >
            <Plus size={14} />Add rule item
          </button>
        </div>
      ) : (
        <div className={`px-14 pb-3 -mt-1 text-[11px] truncate ${sub}`}>
          {section.opening || (section.items?.[0] ? `${section.items[0].title} ${section.items[0].description}` : 'Empty section')}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// PersonaPortal Main Component
// ---------------------------------------------------------------------------------------------------------
export default function PersonaPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [data, setData] = useState(null);               // { personas, activeId, voices, scenarios }
  const [selected, setSelected] = useState(null);
  const [persona, setPersona] = useState(null);         // active selected persona object from server
  const [meta, setMeta] = useState(null);               // frontmatter fields
  const [bodyModel, setBodyModel] = useState({ intro: '', sections: [] }); // parsed body sections
  const [rawFile, setRawFile] = useState('');           // raw file text
  const [savedRaw, setSavedRaw] = useState('');         // saved checkpoint to detect dirty state
  const [isDirty, setIsDirty] = useState(false);
  const [houseRaw, setHouseRaw] = useState('');         // house rules text
  const [houseSavedRaw, setHouseSavedRaw] = useState('');
  const [isHouseDirty, setIsHouseDirty] = useState(false);
  const [tab, setTab] = useState('profile');
  const [notification, setNotification] = useState(null);
  const [busy, setBusy] = useState('');
  const [tests, setTests] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPersonaName, setNewPersonaName] = useState('');
  const [cloneFromId, setCloneFromId] = useState('');
  const audioRef = useRef(null);

  const showToast = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification((prev) => (prev?.msg === msg ? null : prev)), 5000);
  }, []);

  // Styling tokens
  const panel = `rounded-2xl border ${isDark ? 'bg-slate-900/40 border-white/10' : 'bg-white/80 border-[#2E2B27]/15 shadow-sm'}`;
  const field = `w-full px-3 py-2 rounded-lg text-xs outline-none border ${isDark ? 'bg-slate-950/60 border-white/10 text-slate-100' : 'bg-white border-[#2E2B27]/15 text-slate-900'}`;
  const ghost = `px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all active:scale-95 disabled:opacity-40 ${isDark ? 'bg-white/5 hover:bg-white/10 text-slate-200' : 'bg-black/5 hover:bg-black/10 text-slate-800'}`;
  const primary = 'px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r from-purple-500 to-fuchsia-600 text-white active:scale-95 disabled:opacity-40 cursor-pointer';
  const strong = isDark ? 'text-slate-50' : 'text-slate-900';
  const sub = isDark ? 'text-slate-300' : 'text-slate-700';
  const label = `text-[11px] font-black uppercase tracking-wider mb-1 ${sub}`;
  const iconBtn = `p-1.5 rounded-lg disabled:opacity-30 transition-colors ${isDark ? 'hover:bg-white/10 text-slate-300' : 'hover:bg-black/5 text-slate-700'}`;

  // Load persona list
  const loadList = useCallback(async (keep) => {
    const d = await api('/api/personas');
    setData(d);
    setSelected((cur) => keep || cur || d.activeId);
    return d;
  }, []);
  useEffect(() => { loadList().catch((e) => showToast(e.message, 'error')); }, [loadList, showToast]);

  // Load selected persona
  const loadPersona = useCallback(async (id) => {
    if (!id) return;
    const d = await api(`/api/personas/${id}`);
    setPersona(d.persona);
    const { body, raw, id: _id, updatedAt, ...m } = d.persona;
    setMeta(m);
    setBodyModel(parsePersona(body));
    setRawFile(raw);
    setSavedRaw(raw);
    setIsDirty(false);
    setTests(d.tests ? { results: d.tests.results, at: d.tests.at } : null);
  }, []);
  useEffect(() => { loadPersona(selected).catch((e) => showToast(e.message, 'error')); }, [selected, loadPersona, showToast]);

  // Load house rules
  const loadHouseRules = useCallback(async () => {
    try {
      const d = await api('/api/personas/house');
      setHouseRaw(d.raw || '');
      setHouseSavedRaw(d.raw || '');
      setIsHouseDirty(false);
    } catch (e) {
      showToast(e.message, 'error');
    }
  }, [showToast]);
  useEffect(() => { loadHouseRules(); }, [loadHouseRules]);

  // Sync dirty flag on house rules
  useEffect(() => {
    setIsHouseDirty(houseRaw.trim() !== houseSavedRaw.trim());
  }, [houseRaw, houseSavedRaw]);

  // Warn before unload on unsaved changes
  useEffect(() => {
    const handler = (e) => {
      if (isDirty || isHouseDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, isHouseDirty]);

  // Meta helper
  const setM = (k, v) => {
    setMeta((prev) => ({ ...prev, [k]: v }));
    setIsDirty(true);
  };

  // Section manipulation helpers
  const updateSection = (idx, patch) => {
    setBodyModel((prev) => {
      const nextSections = [...prev.sections];
      if (nextSections[idx]) {
        nextSections[idx] = { ...nextSections[idx], ...patch };
      }
      return { ...prev, sections: nextSections };
    });
    setIsDirty(true);
  };

  const addItemToSection = (sectionIdx) => {
    setBodyModel((prev) => {
      const nextSections = [...prev.sections];
      const target = nextSections[sectionIdx];
      if (target) {
        const nextItems = [...(target.items || []), { id: newId(), title: '', description: '' }];
        nextSections[sectionIdx] = { ...target, items: nextItems };
      }
      return { ...prev, sections: nextSections };
    });
    setIsDirty(true);
  };

  const updateItemInSection = (sectionIdx, itemId, patch) => {
    setBodyModel((prev) => {
      const nextSections = [...prev.sections];
      const target = nextSections[sectionIdx];
      if (target) {
        const nextItems = (target.items || []).map((it) => (it.id === itemId ? { ...it, ...patch } : it));
        nextSections[sectionIdx] = { ...target, items: nextItems };
      }
      return { ...prev, sections: nextSections };
    });
    setIsDirty(true);
  };

  const removeItemFromSection = (sectionIdx, itemId) => {
    setBodyModel((prev) => {
      const nextSections = [...prev.sections];
      const target = nextSections[sectionIdx];
      if (target) {
        const nextItems = (target.items || []).filter((it) => it.id !== itemId);
        nextSections[sectionIdx] = { ...target, items: nextItems };
      }
      return { ...prev, sections: nextSections };
    });
    setIsDirty(true);
  };

  const moveItemInSection = (sectionIdx, itemIdx, delta) => {
    setBodyModel((prev) => {
      const nextSections = [...prev.sections];
      const target = nextSections[sectionIdx];
      if (target) {
        const items = [...(target.items || [])];
        const nextIdx = itemIdx + delta;
        if (nextIdx < 0 || nextIdx >= items.length) return prev;
        [items[itemIdx], items[nextIdx]] = [items[nextIdx], items[itemIdx]];
        nextSections[sectionIdx] = { ...target, items };
      }
      return { ...prev, sections: nextSections };
    });
    setIsDirty(true);
  };

  const duplicateItemInSection = (sectionIdx, itemIdx) => {
    setBodyModel((prev) => {
      const nextSections = [...prev.sections];
      const target = nextSections[sectionIdx];
      if (target) {
        const items = [...(target.items || [])];
        const orig = items[itemIdx];
        items.splice(itemIdx + 1, 0, { ...orig, id: newId(), title: orig.title ? `${orig.title} (copy)` : '' });
        nextSections[sectionIdx] = { ...target, items };
      }
      return { ...prev, sections: nextSections };
    });
    setIsDirty(true);
  };

  // Preview raw generation on switching to raw tab
  useEffect(() => {
    if (tab === 'raw' && isDirty && meta) {
      const currentBody = assemblePersona(bodyModel);
      api('/api/personas/preview-raw', { method: 'POST', body: JSON.stringify({ meta, body: currentBody }) })
        .then((res) => { if (res.raw) setRawFile(res.raw); })
        .catch(() => {});
    }
  }, [tab, isDirty, meta, bodyModel]);

  // Operations
  const run = async (key, fn) => {
    setBusy(key);
    try { await fn(); } catch (e) { showToast(e.message, 'error'); }
    setBusy('');
  };

  // Save changes
  const saveAll = () => run('save', async () => {
    if (tab === 'house') {
      await api('/api/personas/house', { method: 'PUT', body: JSON.stringify({ raw: houseRaw }) });
      setHouseSavedRaw(houseRaw);
      setIsHouseDirty(false);
      showToast('Saved house rules - applies to all personas from the next turn.');
      return;
    }

    if (tab === 'raw') {
      await api(`/api/personas/${selected}/raw`, { method: 'PUT', body: JSON.stringify({ raw: rawFile }) });
      await loadPersona(selected);
      await loadList(selected);
      showToast(`Saved ${persona.name} from raw output.`);
      return;
    }

    const assembledBody = assemblePersona(bodyModel);
    const d = await api(`/api/personas/${selected}`, {
      method: 'PUT',
      body: JSON.stringify({ meta, body: assembledBody })
    });
    await loadPersona(selected);
    await loadList(selected);
    showToast(`Saved changes to "${d.persona.name}".`);
  });

  // Revert changes
  const revert = () => {
    if (tab === 'house') {
      setHouseRaw(houseSavedRaw);
      setIsHouseDirty(false);
      showToast('Reverted house rules to last saved version.');
      return;
    }
    if (!window.confirm('Discard unsaved edits and reload from disk?')) return;
    loadPersona(selected);
    showToast('Reverted to last saved version.');
  };

  // Keyboard shortcut Ctrl+S
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if ((isDirty || isHouseDirty) && !busy) saveAll();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDirty, isHouseDirty, busy]);

  // Activate persona
  const activate = () => run('activate', async () => {
    if (!window.confirm(`Switch Ims to "${persona.name}" everywhere - desk terminal, web, spoken alerts, day report, weather, doorbell and reminders?`)) return;
    await api(`/api/personas/${selected}/activate`, { method: 'POST' });
    await loadList(selected);
    showToast(`Ims is now "${persona.name}". Every touchpoint is updated.`);
  });

  // Create or clone persona
  const handleCreatePersona = () => run('create', async () => {
    const name = newPersonaName.trim();
    if (!name) { showToast('Please enter a name for the persona.', 'error'); return; }
    const d = await api('/api/personas', { method: 'POST', body: JSON.stringify({ name, fromId: cloneFromId || null }) });
    setShowCreateModal(false);
    setNewPersonaName('');
    setCloneFromId('');
    await loadList(d.persona.id);
    setSelected(d.persona.id);
    setTab('profile');
    showToast(`Created persona "${d.persona.name}". Edit its settings and make it active when ready.`);
  });

  // Delete persona
  const remove = () => run('delete', async () => {
    if (!window.confirm(`Delete persona "${persona.name}"? (A copy is preserved in history).`)) return;
    await api(`/api/personas/${selected}`, { method: 'DELETE' });
    const d = await loadList(null);
    setSelected(d.activeId);
    showToast('Deleted persona.');
  });

  // Version History
  const openHistory = async () => {
    setShowHistory(true);
    try {
      const url = tab === 'house' ? '/api/personas/house' : `/api/personas/${selected}`;
      const d = await api(url);
      setHistory(d.history || []);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const loadVersion = async (v) => {
    if (!window.confirm('Load this earlier version into the editor? Press Save afterwards to apply it.')) return;
    try {
      const url = tab === 'house' ? `/api/personas/house/history/${v.id}` : `/api/personas/${selected}/history/${v.id}`;
      const d = await api(url);
      if (tab === 'house') {
        setHouseRaw(d.raw);
      } else {
        const { body, raw, id: _id, updatedAt, ...m } = parsePersona(d.raw);
        setRawFile(d.raw);
        setSavedRaw(d.raw);
        setMeta(m);
        setBodyModel(parsePersona(body));
        setIsDirty(true);
      }
      setShowHistory(false);
      showToast('Loaded earlier version into editor. Click Save to make it live.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Test bench execution
  const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
  const play = (url) => {
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    a.pause();
    a.src = url;
    a.play().catch(() => showToast('Press Play to hear it.', 'error'));
  };

  const runTests = (ids) => run('test', async () => {
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = SILENCE;
    audioRef.current.play().catch(() => {});
    const d = await api(`/api/personas/${selected}/test`, { method: 'POST', body: JSON.stringify({ scenarios: ids }) });
    setTests((prev) => {
      const byId = Object.fromEntries((prev?.results || []).map((r) => [r.id, r]));
      for (const r of d.results) byId[r.id] = { ...r, at: new Date().toISOString() };
      return { results: (data.scenarios || []).map((s) => byId[s.id]).filter(Boolean), at: new Date().toISOString() };
    });
    const passed = d.results.filter((r) => r.ok).length;
    showToast(`${passed} of ${d.results.length} tests passed.`, passed === d.results.length ? 'success' : 'error');
  });

  const isActive = data && selected === data.activeId;
  const currentDirty = tab === 'house' ? isHouseDirty : isDirty;

  // Tabs definition
  const TABS = [
    ['profile', 'Profile & Voice', SlidersHorizontal, 'Persona identity, name, Gemini voice model, and core concept'],
    ['accent', 'Accent & Dialect', Mic, 'Regional accent labels, pronunciation rules, and judge instructions'],
    ['rhythm', 'Rhythm & Vocabulary', Sparkles, 'Thinking sounds, dialect words, tag endings, and speech pacing'],
    ['conversation', 'Conversation & Style', MessageSquare, 'Discussion guidelines, conversation habits, and dialogue examples'],
    ['alerts', 'Alerts & Reports', Bell, 'Day report sign-offs, weather wording, and doorbell announcements'],
    ['house', 'House Rules', Users, 'Global shared rules across all personas (safety, jokes, clarifying)'],
    ['test', 'Test Bench', FlaskConical, 'Live scenario tests with voice judge evaluation'],
    ['raw', 'Raw Output', Code2, 'Complete unified markup output across all sections and settings'],
  ];

  return (
    <PortalShell
      title="Ims Personas"
      subtitle="/ims/persona • Who Ims is and how he speaks - modular sections, dialect pools, and unified raw output"
      icon={Drama}
      gradient="from-purple-500 to-fuchsia-600"
      glow="rgba(192,38,211,0.3)"
      isDark={isDark}
      onThemeToggle={onThemeToggle}
      setCurrentPath={setCurrentPath}
      notification={notification}
      maxWidth="max-w-5xl"
    >
      {/* Persona Bar */}
      <div className={`${panel} p-4`}>
        <div className="flex flex-wrap items-center gap-2">
          {(data?.personas || []).map((p) => (
            <button
              key={p.id}
              onClick={() => {
                if ((isDirty || isHouseDirty) && !window.confirm('Switching personas will discard unsaved edits. Continue?')) return;
                setSelected(p.id);
              }}
              className={`px-3 py-2 rounded-xl border text-left transition-all ${
                selected === p.id
                  ? 'border-purple-500 ring-2 ring-purple-500/40'
                  : isDark
                  ? 'border-white/10 hover:border-white/20'
                  : 'border-[#2E2B27]/15 hover:border-black/20'
              } ${isDark ? 'bg-slate-950/40' : 'bg-white'}`}
            >
              <div className={`text-xs font-black flex items-center gap-1.5 ${strong}`}>
                {p.name}
                {p.active && <span className="px-1.5 py-0.5 rounded bg-emerald-700 text-white text-[9px] uppercase">Active</span>}
              </div>
              <div className={`text-[11px] ${sub}`}>{p.accent} · voice {p.voice}</div>
            </button>
          ))}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setCloneFromId('');
                setNewPersonaName('');
                setShowCreateModal(true);
              }}
              disabled={!!busy}
              className={`${ghost} text-purple-400 font-bold border border-purple-500/30`}
            >
              <Plus size={14} />New Persona
            </button>
            {persona && (
              <button
                onClick={() => {
                  setCloneFromId(selected);
                  setNewPersonaName(`${persona.name} (Copy)`);
                  setShowCreateModal(true);
                }}
                disabled={!!busy}
                className={ghost}
              >
                <Copy size={13} />Clone Persona
              </button>
            )}
          </div>
        </div>

        {persona && (
          <div className={`mt-3 pt-3 border-t flex flex-wrap items-center gap-2 ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
            <div className="flex-1 min-w-[220px]">
              <div className={`text-sm font-black ${strong}`}>{persona.name}</div>
              <div className={`text-xs ${sub}`}>{persona.description || 'No description set'}</div>
            </div>
            {isActive ? (
              <span className="px-3 py-2 rounded-xl text-xs font-black bg-emerald-700 text-white flex items-center gap-1.5">
                <Check size={13} />Ims is actively using this persona
              </span>
            ) : (
              <button onClick={activate} disabled={!!busy} className={primary}>
                <Mic size={13} />Make Ims use this persona
              </button>
            )}
            {!persona.isDefault && persona.id !== 'yorkshire' && !isActive && (
              <button onClick={remove} disabled={!!busy} className={`${ghost} text-red-600`}>
                <Trash2 size={13} />Delete
              </button>
            )}
          </div>
        )}
      </div>

      {/* Global Actions & Tabs Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 mt-1">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map(([k, text, Icon]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                tab === k
                  ? 'bg-gradient-to-r from-purple-500 to-fuchsia-600 text-white shadow-md'
                  : ghost
              }`}
            >
              <Icon size={13} />
              {text}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {currentDirty && (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-amber-400 text-black tracking-wider">
              Unsaved Changes
            </span>
          )}
          {currentDirty && (
            <button onClick={revert} className={ghost}>
              <Undo2 size={13} />Revert
            </button>
          )}
          <button onClick={openHistory} className={ghost} title="View version history">
            <History size={13} />History
          </button>
          <button
            onClick={saveAll}
            disabled={!currentDirty || !!busy}
            className={`${primary} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {busy === 'save' ? <RotateCw size={14} className="animate-spin" /> : <Save size={14} />}
            {busy === 'save' ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {!persona || !meta ? (
        <div className="py-20 flex justify-center items-center gap-3">
          <RotateCw size={24} className="text-purple-500 animate-spin" />
          <span className={`text-xs ${sub}`}>Loading persona configuration...</span>
        </div>
      ) : (
        <>
          {/* ----------------------------------------------------------------------------------------- */}
          {/* TAB 1: Profile & Voice                                                                    */}
          {/* ----------------------------------------------------------------------------------------- */}
          {tab === 'profile' && (
            <div className="space-y-4">
              <p className={`text-xs ${sub}`}>
                Configure who Ims is, the Gemini Live voice model, speech language, and the core identity prompt.
              </p>

              <div className={`${panel} p-4 space-y-4`}>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className={label}>Persona Name</label>
                    <input className={field} value={meta.name || ''} onChange={(e) => setM('name', e.target.value)} />
                  </div>
                  <div>
                    <label className={label}>Description</label>
                    <input className={field} value={meta.description || ''} onChange={(e) => setM('description', e.target.value)} />
                  </div>
                  <div>
                    <label className={label}>Gemini Voice Model</label>
                    <select className={field} value={meta.voice || 'Umbriel'} onChange={(e) => setM('voice', e.target.value)}>
                      {(data?.voices || []).map((v) => (
                        <option key={v.name} value={v.name}>{v.name} — {v.desc}</option>
                      ))}
                    </select>
                    <p className={`text-[11px] mt-1 ${sub}`}>
                      Voice model used for hardware Box-3 terminal, Web Live, and spoken audio synthesis.
                    </p>
                  </div>
                  <div>
                    <label className={label}>Speech Language Code</label>
                    <select className={field} value={meta.languageCode || 'en-GB'} onChange={(e) => setM('languageCode', e.target.value)}>
                      {LANGS.map(([c, n]) => (
                        <option key={c} value={c}>{n}</option>
                      ))}
                    </select>
                    <p className={`text-[11px] mt-1 ${sub}`}>Always English — tunes speech synthesis acoustic models to the region.</p>
                  </div>
                </div>

                <div>
                  <label className={label}>Voice Sample Line</label>
                  <input
                    className={field}
                    value={meta.testLine || ''}
                    placeholder="Short line spoken when testing this voice"
                    onChange={(e) => setM('testLine', e.target.value)}
                  />
                </div>
              </div>

              {/* Title & Introduction block */}
              <div className={`${panel} p-4`}>
                <label className={`text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 mb-1.5 ${sub}`}>
                  <FileText size={12} />Persona Intro Header
                </label>
                <textarea
                  className={`${field} font-mono leading-relaxed resize-y`}
                  rows={Math.max(2, (bodyModel.intro || '').split('\n').length + 1)}
                  value={bodyModel.intro || ''}
                  onChange={(e) => {
                    setBodyModel((prev) => ({ ...prev, intro: e.target.value }));
                    setIsDirty(true);
                  }}
                  spellCheck={false}
                />
              </div>

              {/* Section 1: Identity */}
              {bodyModel.sections[0] && (
                <SectionCard
                  section={bodyModel.sections[0]}
                  index={0}
                  isDark={isDark}
                  sub={sub}
                  panel={panel}
                  field={field}
                  iconBtn={iconBtn}
                  ghost={ghost}
                  onUpdateSection={(patch) => updateSection(0, patch)}
                  onAddItem={() => addItemToSection(0)}
                  onUpdateItem={(iid, patch) => updateItemInSection(0, iid, patch)}
                  onRemoveItem={(iid) => removeItemFromSection(0, iid)}
                  onMoveItem={(idx, delta) => moveItemInSection(0, idx, delta)}
                  onDuplicateItem={(idx) => duplicateItemInSection(0, idx)}
                />
              )}
            </div>
          )}

          {/* ----------------------------------------------------------------------------------------- */}
          {/* TAB 2: Accent & Dialect                                                                   */}
          {/* ----------------------------------------------------------------------------------------- */}
          {tab === 'accent' && (
            <div className="space-y-4">
              <p className={`text-xs ${sub}`}>
                Phonetic accent instructions given to the voice model, regional dialect tags, and evaluation criteria.
              </p>

              <div className={`${panel} p-4 space-y-4`}>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className={label}>Accent Label (Short)</label>
                    <input
                      className={field}
                      value={meta.accent || ''}
                      placeholder="e.g. West Yorkshire (Leeds)"
                      onChange={(e) => setM('accent', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={label}>Dialect Label (Short)</label>
                    <input
                      className={field}
                      value={meta.dialect || ''}
                      placeholder="e.g. broad Yorkshire dialect"
                      onChange={(e) => setM('dialect', e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className={label}>Accent Rule (Injected into Live voice system instructions)</label>
                  <textarea
                    className={`${field} font-mono leading-relaxed resize-y`}
                    rows={6}
                    value={meta.accentRule || ''}
                    placeholder="Strict phonetic rule explaining how vowels and consonants must sound, rhoticity, and prohibited accents."
                    onChange={(e) => setM('accentRule', e.target.value)}
                    spellCheck={false}
                  />
                  <p className={`text-[11px] mt-1 ${sub}`}>
                    This exact prompt is supplied to the Gemini Live speech model on every conversation turn.
                  </p>
                </div>

                <div>
                  <label className={label}>What the Accent Should Sound Like (For Automated Judge Evaluation)</label>
                  <textarea
                    className={field}
                    rows={2}
                    value={meta.judgeAccent || ''}
                    placeholder="Criteria used by the automated judge model when listening to audio in the test bench."
                    onChange={(e) => setM('judgeAccent', e.target.value)}
                    spellCheck={false}
                  />
                </div>
              </div>

              {/* Section 2: Voice & accent rules */}
              {bodyModel.sections[1] && (
                <SectionCard
                  section={bodyModel.sections[1]}
                  index={1}
                  isDark={isDark}
                  sub={sub}
                  panel={panel}
                  field={field}
                  iconBtn={iconBtn}
                  ghost={ghost}
                  onUpdateSection={(patch) => updateSection(1, patch)}
                  onAddItem={() => addItemToSection(1)}
                  onUpdateItem={(iid, patch) => updateItemInSection(1, iid, patch)}
                  onRemoveItem={(iid) => removeItemFromSection(1, iid)}
                  onMoveItem={(idx, delta) => moveItemInSection(1, idx, delta)}
                  onDuplicateItem={(idx) => duplicateItemInSection(1, idx)}
                />
              )}
            </div>
          )}

          {/* ----------------------------------------------------------------------------------------- */}
          {/* TAB 3: Rhythm & Vocabulary                                                                */}
          {/* ----------------------------------------------------------------------------------------- */}
          {tab === 'rhythm' && (
            <div className="space-y-4">
              <p className={`text-xs ${sub}`}>
                Dialect vocabulary pools, sentence tag endings, thinking openers, and spoken pacing instructions.
              </p>

              <div className={`${panel} p-4 space-y-4`}>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div>
                    <label className={label}>Thinking Sounds ({meta.thinkingSounds?.length || 0})</label>
                    <textarea
                      className={`${field} font-mono`}
                      rows={6}
                      value={(meta.thinkingSounds || []).join('\n')}
                      onChange={(e) => setM('thinkingSounds', e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))}
                      spellCheck={false}
                    />
                    <p className={`text-[11px] mt-1 ${sub}`}>Stretched openers e.g. "Weeell,", "Soooo,". One per line.</p>
                  </div>

                  <div>
                    <label className={label}>Dialect Words Pool ({meta.dialectWords?.length || 0})</label>
                    <textarea
                      className={`${field} font-mono`}
                      rows={6}
                      value={(meta.dialectWords || []).join('\n')}
                      onChange={(e) => setM('dialectWords', e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))}
                      spellCheck={false}
                    />
                    <p className={`text-[11px] mt-1 ${sub}`}>Words Ims can lean on in conversations. One per line.</p>
                  </div>

                  <div>
                    <label className={label}>Sentence Tag Endings ({meta.tagEndings?.length || 0})</label>
                    <textarea
                      className={`${field} font-mono`}
                      rows={6}
                      value={(meta.tagEndings || []).join('\n')}
                      onChange={(e) => setM('tagEndings', e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))}
                      spellCheck={false}
                    />
                    <p className={`text-[11px] mt-1 ${sub}`}>Phrases like "...mind", "...like", "...then". One per line.</p>
                  </div>
                </div>
              </div>

              {/* Section 3: Spoken rhythm */}
              {bodyModel.sections[2] && (
                <SectionCard
                  section={bodyModel.sections[2]}
                  index={2}
                  isDark={isDark}
                  sub={sub}
                  panel={panel}
                  field={field}
                  iconBtn={iconBtn}
                  ghost={ghost}
                  onUpdateSection={(patch) => updateSection(2, patch)}
                  onAddItem={() => addItemToSection(2)}
                  onUpdateItem={(iid, patch) => updateItemInSection(2, iid, patch)}
                  onRemoveItem={(iid) => removeItemFromSection(2, iid)}
                  onMoveItem={(idx, delta) => moveItemInSection(2, idx, delta)}
                  onDuplicateItem={(idx) => duplicateItemInSection(2, idx)}
                />
              )}
            </div>
          )}

          {/* ----------------------------------------------------------------------------------------- */}
          {/* TAB 4: Conversation & Style                                                               */}
          {/* ----------------------------------------------------------------------------------------- */}
          {tab === 'conversation' && (
            <div className="space-y-4">
              <p className={`text-xs ${sub}`}>
                Conversation rules, clarification behavior, character traits for automated checks, and spoken dialogue examples.
              </p>

              <div className={`${panel} p-4 space-y-4`}>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className={label}>Character Summary (For Persona Checks)</label>
                    <textarea
                      className={field}
                      rows={3}
                      value={meta.character || ''}
                      placeholder="Short descriptor of persona nature, personality, warmth, and engineer mindset."
                      onChange={(e) => setM('character', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={label}>Clarification Example Phrase ("Didn't Catch That")</label>
                    <textarea
                      className={field}
                      rows={3}
                      value={meta.clarifyExample || ''}
                      placeholder="Spoken when speech is muffled or unclear (e.g. 'Sorry, didn't catch all of that - what was that last bit?')"
                      onChange={(e) => setM('clarifyExample', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Section 4: Conversation style */}
              {bodyModel.sections[3] && (
                <SectionCard
                  section={bodyModel.sections[3]}
                  index={3}
                  isDark={isDark}
                  sub={sub}
                  panel={panel}
                  field={field}
                  iconBtn={iconBtn}
                  ghost={ghost}
                  onUpdateSection={(patch) => updateSection(3, patch)}
                  onAddItem={() => addItemToSection(3)}
                  onUpdateItem={(iid, patch) => updateItemInSection(3, iid, patch)}
                  onRemoveItem={(iid) => removeItemFromSection(3, iid)}
                  onMoveItem={(idx, delta) => moveItemInSection(3, idx, delta)}
                  onDuplicateItem={(idx) => duplicateItemInSection(3, idx)}
                />
              )}

              {/* Section 5: Dialogue Examples */}
              {bodyModel.sections[4] && (
                <SectionCard
                  section={bodyModel.sections[4]}
                  index={4}
                  isDark={isDark}
                  sub={sub}
                  panel={panel}
                  field={field}
                  iconBtn={iconBtn}
                  ghost={ghost}
                  onUpdateSection={(patch) => updateSection(4, patch)}
                  onAddItem={() => addItemToSection(4)}
                  onUpdateItem={(iid, patch) => updateItemInSection(4, iid, patch)}
                  onRemoveItem={(iid) => removeItemFromSection(4, iid)}
                  onMoveItem={(idx, delta) => moveItemInSection(4, idx, delta)}
                  onDuplicateItem={(idx) => duplicateItemInSection(4, idx)}
                />
              )}

              {/* Additional custom sections beyond the standard 5 */}
              {bodyModel.sections.slice(5).map((sec, extraIdx) => {
                const realIdx = extraIdx + 5;
                return (
                  <SectionCard
                    key={sec.id}
                    section={sec}
                    index={realIdx}
                    isDark={isDark}
                    sub={sub}
                    panel={panel}
                    field={field}
                    iconBtn={iconBtn}
                    ghost={ghost}
                    onUpdateSection={(patch) => updateSection(realIdx, patch)}
                    onAddItem={() => addItemToSection(realIdx)}
                    onUpdateItem={(iid, patch) => updateItemInSection(realIdx, iid, patch)}
                    onRemoveItem={(iid) => removeItemFromSection(realIdx, iid)}
                    onMoveItem={(idx, delta) => moveItemInSection(realIdx, idx, delta)}
                    onDuplicateItem={(idx) => duplicateItemInSection(realIdx, idx)}
                  />
                );
              })}
            </div>
          )}

          {/* ----------------------------------------------------------------------------------------- */}
          {/* TAB 5: Alerts & Reports                                                                   */}
          {/* ----------------------------------------------------------------------------------------- */}
          {tab === 'alerts' && (
            <div className="space-y-4">
              <p className={`text-xs ${sub}`}>
                Specialized announcements: Day Report sign-offs, weather delivery style, and Ring Doorbell spoken chimes.
              </p>

              <div className={`${panel} p-4 space-y-4`}>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className={label}>Day Report Sign-Offs ({meta.signOffs?.length || 0})</label>
                    <textarea
                      className={`${field} font-mono`}
                      rows={5}
                      value={(meta.signOffs || []).join('\n')}
                      onChange={(e) => setM('signOffs', e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))}
                      spellCheck={false}
                    />
                    <p className={`text-[11px] mt-1 ${sub}`}>Examples Ims finishes the morning day report with. One per line.</p>
                  </div>

                  <div>
                    <label className={label}>Weather Phrasing Style</label>
                    <select
                      className={field}
                      value={meta.weatherPhrasing || 'plain'}
                      onChange={(e) => setM('weatherPhrasing', e.target.value)}
                    >
                      <option value="plain">In his own words and dialect</option>
                      <option value="yorkshire">Built-in Yorkshire phrasing examples</option>
                    </select>
                    <p className={`text-[11px] mt-1 ${sub}`}>Determines whether built-in regional weather phrases are provided.</p>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className={label}>Doorbell Chime — Someone Rings the Bell</label>
                    <textarea
                      className={`${field} font-mono`}
                      rows={5}
                      value={(meta.doorbell?.ding || []).join('\n')}
                      onChange={(e) =>
                        setMeta((prev) => ({
                          ...prev,
                          doorbell: { ...(prev.doorbell || {}), ding: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) }
                        }))
                      }
                      spellCheck={false}
                    />
                    <p className={`text-[11px] mt-1 ${sub}`}>Spoken when doorbell is pressed. {'{name}'} and {'{place}'} are substituted.</p>
                  </div>

                  <div>
                    <label className={label}>Doorbell Chime — Motion Detected</label>
                    <textarea
                      className={`${field} font-mono`}
                      rows={5}
                      value={(meta.doorbell?.motion || []).join('\n')}
                      onChange={(e) =>
                        setMeta((prev) => ({
                          ...prev,
                          doorbell: { ...(prev.doorbell || {}), motion: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) }
                        }))
                      }
                      spellCheck={false}
                    />
                    <p className={`text-[11px] mt-1 ${sub}`}>Spoken when camera sensor detects motion.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ----------------------------------------------------------------------------------------- */}
          {/* TAB 6: House Rules (All Personas)                                                         */}
          {/* ----------------------------------------------------------------------------------------- */}
          {tab === 'house' && (
            <div className="space-y-4">
              <p className={`text-xs ${sub}`}>
                System-wide rules that apply to <b>all personas</b>: item creation, clarifying, zero medical disclaimers, joke guidelines, and speech conciseness.
              </p>

              <div className={`${panel} overflow-hidden flex flex-col`}>
                <div className={`px-5 py-3 border-b flex items-center justify-between ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
                  <span className={`text-[11px] font-mono ${sub}`}>personas/_house_rules.md</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigator.clipboard.writeText(houseRaw).then(() => showToast('Copied house rules to clipboard.'))}
                      className={ghost}
                    >
                      <Clipboard size={12} />Copy
                    </button>
                  </div>
                </div>
                <textarea
                  value={houseRaw}
                  onChange={(e) => setHouseRaw(e.target.value)}
                  spellCheck={false}
                  className={`w-full min-h-[60vh] p-5 text-xs font-mono leading-relaxed outline-none resize-y bg-transparent ${strong}`}
                />
              </div>
            </div>
          )}

          {/* ----------------------------------------------------------------------------------------- */}
          {/* TAB 7: Test Bench                                                                         */}
          {/* ----------------------------------------------------------------------------------------- */}
          {tab === 'test' && (
            <div className="space-y-4">
              <div className={`${panel} p-4 flex flex-col gap-3`}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`text-xs flex-1 min-w-[240px] ${sub}`}>
                    Evaluate <b className={strong}>{persona.name}</b> across key scenarios. A dedicated judge model verifies dialect, character, and audio pronunciation.
                  </p>
                  <button
                    onClick={() => runTests(picked.size ? [...picked] : null)}
                    disabled={!!busy}
                    className={primary}
                  >
                    {busy === 'test' ? <RotateCw size={14} className="animate-spin" /> : <Play size={14} />}
                    {busy === 'test' ? 'Evaluating Scenarios...' : picked.size ? `Run ${picked.size} Selected` : 'Run All Scenarios'}
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {(data?.scenarios || []).map((sc) => {
                    const r = tests?.results?.find((x) => x.id === sc.id);
                    return (
                      <div
                        key={sc.id}
                        className={`p-3 rounded-xl border ${isDark ? 'border-white/10 bg-slate-950/40' : 'border-[#2E2B27]/15 bg-white'}`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="checkbox"
                            checked={picked.has(sc.id)}
                            onChange={() =>
                              setPicked((p) => {
                                const n = new Set(p);
                                n.has(sc.id) ? n.delete(sc.id) : n.add(sc.id);
                                return n;
                              })
                            }
                          />
                          <span className={`text-xs font-black ${strong}`}>{sc.label}</span>
                          <span
                            className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${
                              sc.kind === 'voice'
                                ? 'bg-sky-700 text-white'
                                : isDark
                                ? 'bg-white/10 text-slate-100'
                                : 'bg-slate-200 text-slate-900'
                            }`}
                          >
                            {sc.kind}
                          </span>
                          <span className={`text-[11px] ${sub}`}>{sc.about}</span>
                          <span className="ml-auto flex items-center gap-2">
                            {r && (
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${
                                  r.ok ? 'bg-emerald-700 text-white' : 'bg-rose-700 text-white'
                                }`}
                              >
                                {r.ok ? <Check size={10} /> : <X size={10} />}
                                {r.ok ? 'Pass' : 'Fail'}
                              </span>
                            )}
                            {r?.audio && (
                              <button onClick={() => play(r.audio)} className={ghost}>
                                <Play size={12} />Play Audio
                              </button>
                            )}
                            <button onClick={() => runTests([sc.id])} disabled={!!busy} className={ghost}>
                              Run
                            </button>
                          </span>
                        </div>
                        {r && (
                          <div className={`mt-2 text-xs ${sub}`}>
                            {r.text && <p className="italic">“{r.text.slice(0, 500)}”</p>}
                            <p className={`mt-1 ${r.ok ? '' : isDark ? 'text-rose-300' : 'text-rose-800'}`}>
                              <b className={r.ok ? strong : ''}>{r.ok ? 'Evaluation: ' : 'Why it failed: '}</b>
                              {r.reason}
                              {r.at ? ` · ${new Date(r.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ----------------------------------------------------------------------------------------- */}
          {/* TAB 8: Raw Output (Unified Across All Tabs)                                               */}
          {/* ----------------------------------------------------------------------------------------- */}
          {tab === 'raw' && (
            <div className="space-y-4">
              <p className={`text-xs ${sub}`}>
                Complete unified markup output across all sections and tabs. Changes made in any tab are assembled here in real-time. You can also edit raw markup directly.
              </p>

              <div className={`${panel} overflow-hidden flex flex-col`}>
                <div className={`px-5 py-3 border-b flex items-center justify-between ${isDark ? 'border-white/10' : 'border-[#2E2B27]/10'}`}>
                  <span className={`text-[11px] font-mono ${sub}`}>
                    personas/{selected}.md · {rawFile.split('\n').length} lines · {rawFile.length} characters
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigator.clipboard.writeText(rawFile).then(() => showToast('Copied raw persona to clipboard.'))}
                      className={ghost}
                    >
                      <Clipboard size={12} />Copy Markup
                    </button>
                  </div>
                </div>
                <textarea
                  value={rawFile}
                  onChange={(e) => {
                    setRawFile(e.target.value);
                    setIsDirty(true);
                  }}
                  spellCheck={false}
                  className={`w-full min-h-[65vh] p-5 text-xs font-mono leading-relaxed outline-none resize-y bg-transparent ${strong}`}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowHistory(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className={`max-w-lg w-full max-h-[80vh] flex flex-col rounded-2xl border p-6 shadow-2xl ${
              isDark ? 'bg-slate-900 border-white/10 text-white' : 'bg-white border-[#2E2B27]/15 text-slate-900'
            }`}
          >
            <h2 className="text-sm font-black uppercase tracking-wider mb-1 flex items-center gap-2">
              <History size={16} />Previous Versions
            </h2>
            <p className={`text-[11px] mb-3 ${sub}`}>
              Every save stores a snapshot in disk history. Loading one updates the editor; save to apply it.
            </p>
            <div className="overflow-y-auto flex flex-col gap-2">
              {history.length === 0 ? (
                <p className={`text-xs py-6 text-center ${sub}`}>No earlier versions recorded yet.</p>
              ) : (
                history.map((v) => (
                  <div
                    key={v.id}
                    className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                      isDark ? 'border-white/10 bg-slate-950/40' : 'border-[#2E2B27]/15 bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="font-bold">
                        {new Date(v.savedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                      </div>
                      <div className={`text-[10px] ${sub}`}>{v.bytes} bytes</div>
                    </div>
                    <button onClick={() => loadVersion(v)} className={ghost}>
                      <Undo2 size={12} />Restore
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Persona Creation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowCreateModal(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className={`max-w-md w-full rounded-2xl border p-6 shadow-2xl space-y-4 ${
              isDark ? 'bg-slate-900 border-white/10 text-white' : 'bg-white border-[#2E2B27]/15 text-slate-900'
            }`}
          >
            <h2 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
              <Plus size={16} className="text-purple-400" />
              {cloneFromId ? 'Clone Existing Persona' : 'Create Brand New Persona'}
            </h2>
            <p className={`text-xs ${sub}`}>
              {cloneFromId
                ? 'Creates a full copy of the selected persona that you can adapt and customize.'
                : 'Scaffolds a new persona with standard speech guidelines and identity rules.'}
            </p>

            <div className="space-y-3">
              <div>
                <label className={label}>Persona Name</label>
                <input
                  className={field}
                  autoFocus
                  placeholder="e.g. Scottish Ims, Northern Engineer"
                  value={newPersonaName}
                  onChange={(e) => setNewPersonaName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreatePersona(); }}
                />
              </div>

              <div>
                <label className={label}>Template / Base Persona</label>
                <select
                  className={field}
                  value={cloneFromId}
                  onChange={(e) => setCloneFromId(e.target.value)}
                >
                  <option value="">Start from standard clean template</option>
                  {(data?.personas || []).map((p) => (
                    <option key={p.id} value={p.id}>Clone from "{p.name}" ({p.accent})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCreateModal(false)} className={ghost}>
                Cancel
              </button>
              <button onClick={handleCreatePersona} disabled={!newPersonaName.trim() || !!busy} className={primary}>
                {busy === 'create' ? <RotateCw size={14} className="animate-spin" /> : <Plus size={14} />}
                Create Persona
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
}
