import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Drama, Save, RotateCw, Undo2, ArrowUp, ArrowDown, Trash2, Copy, Plus,
  ChevronDown, ChevronRight, FileText, History, ListTree, Code2, ChevronsUpDown, Sparkles,
  Check, X, Play, Mic, FlaskConical, Users, BookOpen, SlidersHorizontal, MessageSquare, Bell, Clipboard,
  Smile, Volume2, Glasses, Sliders
} from 'lucide-react';
import PortalShell from './PortalShell';
import { parsePersona, assemblePersona, newId } from '../../utils/personaSections';
import ImsFace from '../Ims/ImsFace';
import { EMOTIONS, EMOTION_KEYS, FACE_STYLES, COLOR_PRESETS, ACCESSORY_OPTIONS, HAIR_COLORS, GLASSES_COLORS } from '../Ims/faceEmotions';

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

// Ported from ESP32 IMS Personality Screen & hardwareClientService.js
const PERSONALITY_AXES_CONFIG = {
  humor: {
    label: "Humor",
    low: { name: "Cheerful", val: 15, text: "upbeat, sunny, and lighthearted - playful banter, wholesome wit, and positive observations" },
    mid: { name: "Dry", val: 50, text: "deadpan, understated, and ironic - subtle, laconic observations delivered with a straight face" },
    high: { name: "Dark", val: 85, text: "cynical, macabre, and sardonic - gallows humour, existential absurdity, and biting satire" }
  },
  delivery: {
    label: "Delivery",
    low: { name: "Tactful", val: 15, text: "diplomatic, gentle, and cushioned - polite phrasing and softened language to minimise friction" },
    mid: { name: "Candid", val: 50, text: "plainspoken, straightforward, and fair - clear and transparent without excessive softening or harshness" },
    high: { name: "Blunt", val: 85, text: "terse, unvarnished, and razor-sharp - straight to the point, zero pleasantries or euphemisms" }
  },
  temperament: {
    label: "Temperament",
    low: { name: "Pragmatic", val: 15, text: "grounded, literal, and functional - real-world utility, concrete actions, direct problem-solving" },
    mid: { name: "Systematic", val: 50, text: "structured, rational, and methodical - weighing variables logically into clear frameworks" },
    high: { name: "Philosophical", val: 85, text: "abstract, reflective, and speculative - foundational theories, meta-questions, existential implications" }
  },
  social: {
    label: "Social",
    low: { name: "Clinical", val: 15, text: "detached, objective, and transactional - minimal emotional colouring or rapport" },
    mid: { name: "Professional", val: 50, text: "cordial, cooperative, and approachable - respectful, constructive rapport without becoming overly personal" },
    high: { name: "Empathic", val: 85, text: "warm, validating, and emotionally attuned - actively engaging with feelings and offering reassurance" }
  },
  formality: {
    label: "Formality",
    low: { name: "Casual", val: 15, text: "conversational, relaxed, and idiomatic - loose sentence structures and an easygoing peer-to-peer tone" },
    mid: { name: "Articulate", val: 50, text: "clean, standard, and balanced - clear, modern, accessible prose, neither sloppy nor stuffy" },
    high: { name: "Academic", val: 85, text: "erudite, precise, and elevated - advanced vocabulary, rigorous syntax, formal rhetorical conventions" }
  }
};

const DEFAULT_PERSONALITY = { humor: 70, delivery: 45, temperament: 30, social: 55, formality: 35 };

function describeSliderAxis(val, axis) {
  const v = Math.round(Number(val) || 0);
  if (v <= 33) return { name: axis.low.name, tier: 'low', text: axis.low.text };
  if (v <= 66) return { name: axis.mid.name, tier: 'mid', text: axis.mid.text };
  return { name: axis.high.name, tier: 'high', text: axis.high.text };
}

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
  const [voiceScenarios, setVoiceScenarios] = useState([]);   // real things Ims says, to hear in this persona
  const [sampleLine, setSampleLine] = useState('');
  const [voiceScenario, setVoiceScenario] = useState('');
  const [voiceEngine, setVoiceEngine] = useState('live');
  const [heard, setHeard] = useState(null);                   // { said, ms, engine, label }
  const [voicePlaying, setVoicePlaying] = useState(false);
  const voiceLevelRef = useRef(0);                            // loudness of the voice playing, drives the face
  const analyserRef = useRef(null);
  const [auditionEmotion, setAuditionEmotion] = useState('neutral');
  const [isSimulatingSpeech, setIsSimulatingSpeech] = useState(false);
  const simLevelRef = useRef(0);

  useEffect(() => {
    let raf = 0;
    if (isSimulatingSpeech) {
      const loop = (now) => {
        simLevelRef.current = (Math.sin(now / 130) * 0.4 + 0.5) * (0.3 + Math.random() * 0.6);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    } else {
      simLevelRef.current = 0;
    }
    return () => cancelAnimationFrame(raf);
  }, [isSimulatingSpeech]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Personality Sliders state (Ported from ESP32 Personality screen)
  const [personality, setPersonality] = useState(DEFAULT_PERSONALITY);
  const [personalityDirty, setPersonalityDirty] = useState(false);

  const loadPersonality = useCallback(async () => {
    try {
      const d = await api('/api/settings/personality');
      if (d) {
        setPersonality({
          humor: typeof d.humor === 'number' ? d.humor : DEFAULT_PERSONALITY.humor,
          delivery: typeof d.delivery === 'number' ? d.delivery : DEFAULT_PERSONALITY.delivery,
          temperament: typeof d.temperament === 'number' ? d.temperament : DEFAULT_PERSONALITY.temperament,
          social: typeof d.social === 'number' ? d.social : DEFAULT_PERSONALITY.social,
          formality: typeof d.formality === 'number' ? d.formality : DEFAULT_PERSONALITY.formality,
        });
        setPersonalityDirty(false);
      }
    } catch (e) {
      console.warn('Could not load personality settings:', e.message);
    }
  }, []);
  useEffect(() => { loadPersonality(); }, [loadPersonality]);

  const savePersonalitySliders = async (override) => {
    const toSave = override || personality;
    try {
      const res = await api('/api/settings/personality', {
        method: 'POST',
        body: JSON.stringify(toSave)
      });
      setPersonality({
        humor: res.humor,
        delivery: res.delivery,
        temperament: res.temperament,
        social: res.social,
        formality: res.formality,
      });
      setPersonalityDirty(false);
      showToast('Saved personality sliders. Live prompt updated.', 'success');
    } catch (err) {
      showToast(`Failed to save personality: ${err.message}`, 'error');
    }
  };

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
    setAuditionEmotion(m.faceEmotion || 'neutral');
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

  // Accessories helper
  const setAcc = (k, v) => {
    setMeta((prev) => ({
      ...prev,
      accessories: { ...(prev?.accessories || {}), [k]: v }
    }));
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
  const hookVoice = () => {
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    if (analyserRef.current) { analyserRef.current.ctx.resume().catch(() => {}); return a; }
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaElementSource(a).connect(an);
      an.connect(ctx.destination);
      analyserRef.current = { ctx, an, buf: new Uint8Array(an.fftSize) };
      a.addEventListener('playing', () => { if (a.src !== SILENCE) setVoicePlaying(true); });
      a.addEventListener('pause', () => setVoicePlaying(false));
      a.addEventListener('ended', () => setVoicePlaying(false));
    } catch { /* no Web Audio: the face falls back to its own speaking rhythm */ }
    return a;
  };
  const play = (url) => {
    const a = hookVoice();
    a.pause();
    a.src = url;
    a.play().catch(() => showToast('Press Play to hear it.', 'error'));
  };
  useEffect(() => {
    if (!voicePlaying) { voiceLevelRef.current = 0; return undefined; }
    let raf = 0;
    const loop = () => {
      const h = analyserRef.current;
      if (h) {
        h.an.getByteTimeDomainData(h.buf);
        let sum = 0;
        for (let i = 0; i < h.buf.length; i++) { const v = (h.buf[i] - 128) / 128; sum += v * v; }
        voiceLevelRef.current = Math.min(1, Math.sqrt(sum / h.buf.length) * 2.5);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [voicePlaying]);

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

  // Voice tester: hear this persona say a line, or a real scenario built from today's data
  useEffect(() => {
    if (tab !== 'test' || voiceScenarios.length) return;
    api('/api/personas/voice-scenarios').then((d) => {
      setVoiceScenarios(d.scenarios || []);
      if (!voiceScenario && d.scenarios?.length) setVoiceScenario(d.scenarios[0].id);
    }).catch((e) => showToast(e.message, 'error'));
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const speak = (body, label, key) => run(key, async () => {
    hookVoice();
    audioRef.current.src = SILENCE; // unlock playback inside the click, before the wait
    audioRef.current.play().catch(() => {});
    setHeard(null);
    const d = await api(`/api/personas/${selected}/speak`, { method: 'POST', body: JSON.stringify(body) });
    setHeard({ said: d.said, ms: d.ms, engine: d.engine, label, audio: d.audio });
    play(d.audio);
  });
  const speakLine = (engine) => {
    const text = (sampleLine || meta?.testLine || '').trim();
    if (!text) return showToast('Type a line for Ims to say first.', 'error');
    speak({ text, engine }, 'Voice sample line', engine === 'live' ? 'speak-live' : 'speak-line');
  };
  const speakScenario = () => {
    const sc = voiceScenarios.find((x) => x.id === voiceScenario);
    if (!sc) return;
    speak({ scenario: sc.id, engine: voiceEngine }, sc.label, 'speak-scenario');
  };

  const isActive = data && selected === data.activeId;
  const currentDirty = tab === 'house' ? isHouseDirty : isDirty;

  // Tabs definition
  const TABS = [
    ['profile', 'Profile & Voice', SlidersHorizontal, 'Persona identity, name, Gemini voice model, and core concept'],
    ['accent', 'Accent & Dialect', Mic, 'Regional accent labels, pronunciation rules, and judge instructions'],
    ['rhythm', 'Rhythm & Vocabulary', Sparkles, 'Thinking sounds, dialect words, tag endings, and speech pacing'],
    ['conversation', 'Conversation & Style', MessageSquare, 'Discussion guidelines, conversation habits, and dialogue examples'],
    ['alerts', 'Alerts & Reports', Bell, 'Day report sign-offs, weather wording, and doorbell announcements'],
    ['sliders', 'Personality Sliders', Sliders, '5 behavioral axes: Humor, Delivery, Temperament, Social, Formality'],
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

                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <label className={label}>Face</label>
                    <select className={field} value={meta.faceStyle || 'dots'} onChange={(e) => setM('faceStyle', e.target.value)}>
                      {FACE_STYLES.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                    </select>
                    <p className={`text-[11px] mt-1 ${sub}`}>Shown on the Box-3, in Web Live and on the dashboard while this persona is active. Designs are made in the Face Designer.</p>
                  </div>
                  <ImsFace
                    face={{
                      faceStyle: meta.faceStyle || 'dots',
                      color: meta.faceColor || '4CFF7A',
                      faceColor: meta.faceColor || '4CFF7A',
                      emotion: meta.faceEmotion || 'neutral',
                      faceEmotion: meta.faceEmotion || 'neutral',
                      accessories: meta?.accessories,
                    }}
                    status="idle"
                    width={220}
                    className="shadow-xl border border-white/10"
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
          {/* TAB: Personality Sliders (Ported from ESP32 IMS Personality Screen)                         */}
          {/* ----------------------------------------------------------------------------------------- */}
          {tab === 'sliders' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className={`text-sm font-black flex items-center gap-2 ${strong}`}>
                    <Sliders size={16} className="text-purple-400" />
                    Personality Behavior Sliders
                  </h3>
                  <p className={`text-xs ${sub}`}>
                    Ported from the ESP32 desk terminal. 5 continuous 0-100 axes controlling Ims's humor, delivery, temperament, social engagement, and formality.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPersonality(DEFAULT_PERSONALITY);
                      savePersonalitySliders(DEFAULT_PERSONALITY);
                    }}
                    className={ghost}
                  >
                    <RotateCw size={12} />
                    Reset to Defaults
                  </button>
                  <button
                    type="button"
                    onClick={() => savePersonalitySliders()}
                    disabled={!personalityDirty}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                      personalityDirty
                        ? 'bg-purple-600 text-white shadow-md active:scale-95'
                        : 'opacity-50 cursor-not-allowed bg-purple-900/30 text-purple-300'
                    }`}
                  >
                    <Save size={13} />
                    Save Sliders
                  </button>
                </div>
              </div>

              {/* 5 Slider Cards */}
              <div className="space-y-3">
                {Object.entries(PERSONALITY_AXES_CONFIG).map(([key, axis]) => {
                  const val = Math.round(Number(personality[key] ?? 50));
                  const desc = describeSliderAxis(val, axis);

                  return (
                    <div
                      key={key}
                      className={`p-4 rounded-2xl border transition-all ${
                        isDark ? 'bg-slate-900/50 border-white/10' : 'bg-white border-[#2E2B27]/15'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-black uppercase tracking-wider ${strong}`}>
                            {axis.label}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                            {desc.name} ({val}%)
                          </span>
                        </div>

                        {/* 3 Tier Anchor Buttons for Quick Snapping */}
                        <div className="flex items-center gap-1">
                          {[axis.low, axis.mid, axis.high].map((tier) => (
                            <button
                              key={tier.name}
                              type="button"
                              onClick={() => {
                                const next = { ...personality, [key]: tier.val };
                                setPersonality(next);
                                setPersonalityDirty(true);
                              }}
                              className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${
                                desc.name === tier.name
                                  ? 'bg-purple-600 text-white shadow-sm'
                                  : isDark
                                  ? 'bg-white/5 text-slate-400 hover:text-white'
                                  : 'bg-black/5 text-slate-600 hover:text-black'
                              }`}
                            >
                              {tier.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Range Input Slider */}
                      <div className="py-2">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={val}
                          onChange={(e) => {
                            const next = { ...personality, [key]: Number(e.target.value) };
                            setPersonality(next);
                            setPersonalityDirty(true);
                          }}
                          className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-purple-500 bg-slate-800"
                        />
                      </div>

                      {/* Continuous Description */}
                      <p className={`text-[11px] leading-relaxed italic ${sub}`}>
                        {desc.text}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Synthesized Live Prompt Preview */}
              <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-950/60 border-purple-500/20' : 'bg-purple-50/50 border-purple-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                    <Sparkles size={13} />
                    Synthesized Hardware Personality Prompt Directive
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Auto-injected into Gemini Live session
                  </span>
                </div>
                <p className={`text-xs font-mono leading-relaxed p-3 rounded-xl border ${isDark ? 'bg-slate-900 border-white/5 text-slate-300' : 'bg-white border-[#2E2B27]/10 text-slate-700'}`}>
                  {`PERSONALITY PROFILE: Your responses should be shaped by these calibrated behavioral traits: ` +
                    `Humor: ${describeSliderAxis(personality.humor, PERSONALITY_AXES_CONFIG.humor).name} (${describeSliderAxis(personality.humor, PERSONALITY_AXES_CONFIG.humor).text}). ` +
                    `Delivery: ${describeSliderAxis(personality.delivery, PERSONALITY_AXES_CONFIG.delivery).name} (${describeSliderAxis(personality.delivery, PERSONALITY_AXES_CONFIG.delivery).text}). ` +
                    `Temperament: ${describeSliderAxis(personality.temperament, PERSONALITY_AXES_CONFIG.temperament).name} (${describeSliderAxis(personality.temperament, PERSONALITY_AXES_CONFIG.temperament).text}). ` +
                    `Social: ${describeSliderAxis(personality.social, PERSONALITY_AXES_CONFIG.social).name} (${describeSliderAxis(personality.social, PERSONALITY_AXES_CONFIG.social).text}). ` +
                    `Formality: ${describeSliderAxis(personality.formality, PERSONALITY_AXES_CONFIG.formality).name} (${describeSliderAxis(personality.formality, PERSONALITY_AXES_CONFIG.formality).text}).`}
                </p>
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
              {/* Voice tester, with the persona's face animating to the voice */}
              <div className={`${panel} p-4 flex flex-col lg:flex-row gap-4`}>
              <div className="flex flex-col items-center gap-2 shrink-0">
                <ImsFace
                  face={{
                    faceStyle: meta?.faceStyle || 'dots',
                    color: meta?.faceColor || '4CFF7A',
                    faceColor: meta?.faceColor || '4CFF7A',
                    emotion: auditionEmotion,
                    faceEmotion: auditionEmotion,
                    accessories: meta?.accessories,
                  }}
                  status={voicePlaying ? 'speaking' : (busy || '').startsWith('speak') ? 'thinking' : 'idle'}
                  levelRef={voiceLevelRef}
                  width={260}
                  className="shadow-xl border border-white/10"
                />
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${sub}`}>{FACE_STYLES.find((s) => s.id === (meta?.faceStyle || 'dots'))?.name || meta?.faceStyle}</span>
                  <select className={`${field} w-auto py-1`} value={auditionEmotion} onChange={(e) => setAuditionEmotion(e.target.value)} title="The expression he speaks with">
                    {EMOTION_KEYS.map((k) => <option key={k} value={k}>{EMOTIONS[k].label}</option>)}
                  </select>
                </div>
                <p className={`text-[11px] ${sub}`}>Face set in Profile, or with Use for in the Face Designer.</p>
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Volume2 size={16} className={strong} />
                  <h3 className={`text-sm font-bold ${strong}`}>Hear {persona.name}</h3>
                  <span className={`text-xs ${sub}`}>Voice: {meta?.voice || 'default'}{isDirty ? ' (save first to hear unsaved changes)' : ''}</span>
                </div>

                <label className={`text-xs font-bold ${sub}`}>Voice Sample Line</label>
                <div className="flex flex-wrap gap-2">
                  <input
                    className={`${field} flex-1 min-w-[240px]`}
                    value={sampleLine}
                    placeholder={meta?.testLine || 'Type anything for Ims to say...'}
                    onChange={(e) => setSampleLine(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !busy) speakLine('tts'); }}
                  />
                  <button onClick={() => speakLine('tts')} disabled={!!busy} className={primary} title="Speaks exactly this line with the persona's Gemini voice and accent">
                    {busy === 'speak-line' ? <RotateCw size={14} className="animate-spin" /> : <Play size={14} />} Play
                  </button>
                  <button onClick={() => speakLine('live')} disabled={!!busy} className={ghost} title="Sends the line to the live voice model Ims uses on the desk, so you hear exactly how he'd answer">
                    {busy === 'speak-live' ? <RotateCw size={14} className="animate-spin" /> : <Mic size={14} />} Say it live
                  </button>
                </div>

                <label className={`text-xs font-bold ${sub}`}>Or a real scenario</label>
                <div className="flex flex-wrap gap-2">
                  <select className={`${field} flex-1 min-w-[240px]`} value={voiceScenario} onChange={(e) => setVoiceScenario(e.target.value)}>
                    {!voiceScenarios.length && <option value="">Loading scenarios...</option>}
                    {[...new Set(voiceScenarios.map((x) => x.group))].map((g) => (
                      <optgroup key={g} label={g}>
                        {voiceScenarios.filter((x) => x.group === g).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <select className={`${field} w-auto`} value={voiceEngine} onChange={(e) => setVoiceEngine(e.target.value)} title="Live is the desk voice model; Read aloud is the text-to-speech used for announcements">
                    <option value="live">Live voice (desk)</option>
                    <option value="tts">Read aloud (TTS)</option>
                  </select>
                  <button onClick={speakScenario} disabled={!!busy || !voiceScenario} className={primary}>
                    {busy === 'speak-scenario' ? <RotateCw size={14} className="animate-spin" /> : <Play size={14} />}
                    {busy === 'speak-scenario' ? 'Preparing...' : 'Play scenario'}
                  </button>
                </div>
                {busy === 'speak-scenario' && <p className={`text-xs ${sub}`}>Gathering today's real data and voicing it - this can take up to a minute.</p>}

                {heard && (
                  <div className={`p-3 rounded-xl border flex flex-col gap-2 ${isDark ? 'border-white/10 bg-slate-950/40' : 'border-[#2E2B27]/15 bg-white'}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-xs font-bold ${strong}`}>{heard.label}</span>
                      <span className={`text-xs ${sub}`}>{heard.engine === 'live' ? 'Live voice' : 'Read aloud'}{heard.ms ? ` - ready in ${(heard.ms / 1000).toFixed(1)} s` : ''}</span>
                      <button onClick={() => play(heard.audio)} className={`${ghost} ml-auto`}><Play size={14} /> Replay</button>
                    </div>
                    {heard.said && <p className={`text-xs leading-relaxed ${strong}`}>"{heard.said}"</p>}
                  </div>
                )}
              </div>
              </div>

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
