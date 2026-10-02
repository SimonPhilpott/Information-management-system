import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  SunMedium,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  Eye,
  Check,
  AlertCircle,
  Copy,
  ChevronDown,
  ChevronUp,
  CloudSun,
  Bell,
  CalendarDays,
  Cake,
  Music,
  Dices,
  Droplets,
  Activity,
  ShieldAlert,
  Dumbbell,
  Route,
  Trophy,
  Megaphone,
  Newspaper,
  ListChecks,
  Database,
  Sparkles,
  Link as LinkIcon,
  X,
  FileText,
  Sliders,
  Filter,
  CheckCircle2
} from 'lucide-react';
import PortalShell from './PortalShell';

const SERVICE_ICONS = {
  weather: CloudSun,
  reminders: Bell,
  calendar: CalendarDays,
  birthdays: Cake,
  music_scan: Music,
  music_releases: Music,
  campaigns: Dices,
  card_games: Dices,
  glucose: Droplets,
  glucose_now: Droplets,
  glucose_overnight: Activity,
  device_status: ShieldAlert,
  device_changes: ShieldAlert,
  strava: Dumbbell,
  training: Dumbbell,
  last_run: Route,
  goals: Trophy,
  tours: Megaphone,
  news: Newspaper,
  tasks: ListChecks,
  nightscout_db: Database,
  standalone: Sparkles,
  custom: Sparkles
};

function getServiceIcon(section) {
  if (section.serviceId && SERVICE_ICONS[section.serviceId]) {
    return SERVICE_ICONS[section.serviceId];
  }
  if (SERVICE_ICONS[section.id]) {
    return SERVICE_ICONS[section.id];
  }
  return Sparkles;
}

const SECTION_NOTE_PLACEHOLDERS = {
  tours: 'e.g. Focus on Leeds or Sheffield gigs; mention newly announced tour dates and ticket drops...',
  weather: 'e.g. Highlight rain timing around morning commute; note temperature drops or big coat advice...',
  reminders: 'e.g. Flag priority morning alarms first; alert on medication schedules or timers...',
  calendar: 'e.g. Highlight morning meetings; note any travel or Google Meet links required...',
  birthdays: 'e.g. Mention milestone birthdays; remind to send greeting cards or messages...',
  music_releases: 'e.g. Highlight favourite artists; flag vinyl want-list matches...',
  card_games: 'e.g. Note investigator physical trauma in Arkham; highlight scenario victory status...',
  glucose_now: 'e.g. Alert if current glucose is outside 4.0–7.5 mmol/L; note high IOB...',
  glucose_overnight: 'e.g. Flag overnight dips below 3.9 mmol/L; highlight percentage time in range...',
  device_changes: 'e.g. Remind to prepare replacement pod or sensor; note warmup countdown window...',
  training: 'e.g. Compare mileage against weekly target; highlight scheduled recovery or rest days...',
  last_run: 'e.g. Note pace consistency and glucose stability during the workout...',
  goals: 'e.g. Highlight progress towards active running distance milestones; encourage momentum...',
  news: 'e.g. Emphasise UK tech, science, and local Yorkshire news; skip sensationalist headlines...',
  tasks: 'e.g. Summarise key findings from background research tasks; highlight pending actions...',
  nightscout_db: 'e.g. Warn if MongoDB usage exceeds 85%; suggest clearing older records...'
};

function getNotePlaceholder(section) {
  if (section?.id && SECTION_NOTE_PLACEHOLDERS[section.id]) {
    return SECTION_NOTE_PLACEHOLDERS[section.id];
  }
  return 'e.g. Instruct IMS what specific data, conditions, or priorities to highlight in this section...';
}

export default function DayReportPortal({
  theme = 'dark',
  onThemeToggle,
  currentPath = '/ims/dayreport',
  setCurrentPath
}) {
  const isDark = theme === 'dark';

  const [sections, setSections] = useState([]);
  const [availableServices, setAvailableServices] = useState([]);
  const [subFilterSchemas, setSubFilterSchemas] = useState({});
  // choices for 'select' sub-filters that load theirs from the server (e.g. the weather's saved places)
  const [selectOptions, setSelectOptions] = useState({});
  const [savedSections, setSavedSections] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState(null);

  // Active drawer tab: 'notes' or 'filters' (null if collapsed)
  const [activeDrawer, setActiveDrawer] = useState({}); // { [sectionId]: 'notes' | 'filters' | null }

  // Custom item modal
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [editingCustomItem, setEditingCustomItem] = useState(null);
  const [customForm, setCustomForm] = useState({
    title: '',
    serviceId: 'standalone',
    description: '',
    customNote: '',
    content: ''
  });

  // Preview modal
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [copiedPreview, setCopiedPreview] = useState(false);
  // what Ims would say: one section's example, and the whole report's script
  const [examples, setExamples] = useState({}); // { [sectionId]: { loading, text, reason, error, stale } }
  const [previewView, setPreviewView] = useState('script'); // 'script' | 'instructions'
  const [script, setScript] = useState(null);
  const [scriptLoading, setScriptLoading] = useState(false);
  const loadExample = async (section) => {
    setExamples((e) => ({ ...e, [section.id]: { ...(e[section.id] || {}), loading: true, error: null } }));
    try {
      const r = await fetch('/api/day-report/sample', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section }) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'Could not make an example');
      setExamples((e) => ({ ...e, [section.id]: { text: j.text, reason: j.reason, dummy: j.dummy, loading: false, stale: false } }));
    } catch (err) { setExamples((e) => ({ ...e, [section.id]: { loading: false, error: err.message } })); }
  };
  const loadScript = async () => {
    setScriptLoading(true);
    try {
      const r = await fetch('/api/day-report/script', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sections }) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || 'Could not write the script');
      setScript(j.script || []);
    } catch (err) { showToast(err.message, 'error'); } finally { setScriptLoading(false); }
  };

  const showToast = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification((prev) => (prev?.msg === msg ? null : prev)), 4000);
  }, []);

  const isDirty = useMemo(() => {
    return JSON.stringify(sections) !== JSON.stringify(savedSections);
  }, [sections, savedSections]);

  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/day-report/config');
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load day report configuration');
      }
      const rawSections = (data.sections || []).map((s) => {
        let customNote = s.customNote || '';
        if (s.id !== 'tours' && /focus on leeds|sheffield gigs/i.test(customNote)) {
          customNote = '';
        }
        return { ...s, customNote };
      });
      setSections(rawSections);
      setSavedSections(rawSections);
      setAvailableServices(data.availableServices || []);
      setSubFilterSchemas(data.subFilterSchemas || {});
    } catch (err) {
      console.error('[DayReportPortal] Load error:', err);
      showToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    const handler = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Re-order items
  const moveItem = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= sections.length) return;
    const updated = [...sections];
    const temp = updated[index];
    updated[index] = updated[newIndex];
    updated[newIndex] = temp;
    setSections(updated);
  };

  // Toggle enabled
  const toggleEnabled = (id) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  };

  // Update custom note
  const updateCustomNote = (id, note) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, customNote: note } : s))
    );
  };

  // Update a specific sub-filter property for a section
  useEffect(() => {
    const urls = [...new Set(Object.values(subFilterSchemas).flat().filter((f) => f?.type === 'select' && f.optionsUrl).map((f) => f.optionsUrl))];
    urls.filter((u) => !selectOptions[u]).forEach((u) => {
      fetch(u).then((r) => r.json()).then((j) => setSelectOptions((o) => ({ ...o, [u]: j.options || [] }))).catch(() => {});
    });
  }, [subFilterSchemas]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateSubFilter = (sectionId, filterKey, val) => {
    setExamples((e) => (e[sectionId] ? { ...e, [sectionId]: { ...e[sectionId], stale: true } } : e));
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        const currentFilters = s.subFilters || {};
        return {
          ...s,
          subFilters: {
            ...currentFilters,
            [filterKey]: val
          }
        };
      })
    );
  };

  // Toggle drawer open state for a section
  const toggleDrawer = (sectionId, drawerTab) => {
    setActiveDrawer((prev) => {
      const current = prev[sectionId];
      if (current === drawerTab) {
        return { ...prev, [sectionId]: null };
      }
      return { ...prev, [sectionId]: drawerTab };
    });
  };

  // Save changes to backend
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/day-report/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save configuration');
      }
      setSections(data.sections);
      setSavedSections(data.sections);
      if (data.subFilterSchemas) {
        setSubFilterSchemas(data.subFilterSchemas);
      }
      showToast('Day report subjects, sub-filters, and order saved successfully');
    } catch (err) {
      console.error('[DayReportPortal] Save error:', err);
      showToast(err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to defaults
  const handleReset = async () => {
    if (!window.confirm('Reset all report subjects and sub-filters to their default sequence? Custom items will be removed.')) {
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/day-report/reset', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to reset configuration');
      }
      setSections(data.sections);
      setSavedSections(data.sections);
      if (data.subFilterSchemas) {
        setSubFilterSchemas(data.subFilterSchemas);
      }
      setActiveDrawer({});
      showToast('Reset to default day report subjects and sub-filters');
    } catch (err) {
      console.error('[DayReportPortal] Reset error:', err);
      showToast(err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Open modal to add custom item
  const openAddCustom = () => {
    setEditingCustomItem(null);
    setCustomForm({
      title: '',
      serviceId: 'standalone',
      description: '',
      customNote: '',
      content: ''
    });
    setCustomModalOpen(true);
  };

  // Open modal to edit custom item
  const openEditCustom = (item) => {
    setEditingCustomItem(item);
    setCustomForm({
      title: item.title || '',
      serviceId: item.serviceId || 'standalone',
      description: item.description || '',
      customNote: item.customNote || '',
      content: item.content || ''
    });
    setCustomModalOpen(true);
  };

  // Submit custom item
  const handleSaveCustom = (e) => {
    e.preventDefault();
    if (!customForm.title.trim()) {
      showToast('Please provide a subject title', 'error');
      return;
    }

    const linkedService = availableServices.find((s) => s.id === customForm.serviceId);
    const serviceName = linkedService ? linkedService.name : 'Custom';

    if (editingCustomItem) {
      setSections((prev) =>
        prev.map((s) =>
          s.id === editingCustomItem.id
            ? {
                ...s,
                title: customForm.title.trim(),
                serviceId: customForm.serviceId,
                serviceName,
                description: customForm.description.trim() || `Custom report item linked to ${serviceName}.`,
                customNote: customForm.customNote.trim(),
                content: customForm.content.trim()
              }
            : s
        )
      );
      showToast(`Updated custom subject "${customForm.title.trim()}"`);
    } else {
      const newItem = {
        id: `custom_${Date.now()}`,
        type: 'custom',
        title: customForm.title.trim(),
        serviceId: customForm.serviceId,
        serviceName,
        description: customForm.description.trim() || `Custom report item linked to ${serviceName}.`,
        enabled: true,
        customNote: customForm.customNote.trim(),
        content: customForm.content.trim(),
        subFilters: {}
      };
      setSections((prev) => [...prev, newItem]);
      showToast(`Added custom subject "${customForm.title.trim()}"`);
    }
    setCustomModalOpen(false);
  };

  // Delete custom item
  const handleDeleteCustom = (id, title) => {
    if (!window.confirm(`Delete custom subject "${title}"?`)) return;
    setSections((prev) => prev.filter((s) => s.id !== id));
    showToast(`Removed custom subject "${title}"`);
  };

  // Fetch live preview
  const handleOpenPreview = async () => {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setCopiedPreview(false);
    if (previewView === 'script') loadScript();
    try {
      // what Ims is given, from the sections as they are on the page
      const res = await fetch('/api/day-report/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sections }) });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate preview');
      }
      setPreviewData(data);
    } catch (err) {
      console.error('[DayReportPortal] Preview error:', err);
      showToast(err.message, 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const copyPreviewText = () => {
    if (previewView === 'script' && script?.length) {
      navigator.clipboard.writeText(script.map((x) => `${x.title}\n${x.text || ''}`).join('\n\n'));
      setCopiedPreview(true);
      setTimeout(() => setCopiedPreview(false), 2500);
      return;
    }
    if (!previewData || !previewData.parts) return;
    const fullText = (previewData.whoLine || '') + previewData.parts.join('\n\n');
    navigator.clipboard.writeText(fullText);
    setCopiedPreview(true);
    setTimeout(() => setCopiedPreview(false), 2500);
  };

  return (
    <PortalShell
      title="Day Report Service"
      subtitle="Edit & re-order daily briefing subjects, configure fine-tuned service sub-filters, and add custom items"
      icon={SunMedium}
      gradient="from-amber-400 to-orange-500"
      glow="rgba(251,146,60,0.3)"
      isDark={isDark}
      onThemeToggle={onThemeToggle}
      setCurrentPath={setCurrentPath}
      notification={notification}
      maxWidth="max-w-5xl"
    >
      <div className="p-4 sm:p-6 space-y-6">
        {/* Controls & Action Bar */}
        <div className={`p-4 rounded-2xl border backdrop-blur-md flex flex-wrap items-center justify-between gap-4 shadow-sm ${
          isDark ? 'bg-white/5 border-white/10' : 'bg-[#2E2B27]/5 border-[#2E2B27]/10'
        }`}>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={openAddCustom}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all active:scale-95 shadow-sm ${
                isDark
                  ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30'
                  : 'bg-amber-600/10 text-amber-900 hover:bg-amber-600/20 border border-amber-600/20'
              }`}
            >
              <Plus size={15} />
              <span>Add Custom Item</span>
            </button>

            <button
              onClick={handleOpenPreview}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all active:scale-95 ${
                isDark
                  ? 'bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10'
                  : 'bg-[#2E2B27]/5 hover:bg-[#2E2B27]/10 text-[#2E2B27] border border-[#2E2B27]/15'
              }`}
            >
              <Eye size={15} />
              <span>Live Preview</span>
            </button>

            <button
              onClick={handleReset}
              disabled={isSaving}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all active:scale-95 ${
                isDark
                  ? 'bg-white/5 hover:bg-white/10 text-slate-400 hover:text-red-400 border border-white/5'
                  : 'bg-[#2E2B27]/5 hover:bg-[#2E2B27]/10 text-slate-600 hover:text-red-600 border border-[#2E2B27]/10'
              }`}
              title="Reset subjects to default sequence"
            >
              <RotateCcw size={14} />
              <span className="hidden sm:inline">Reset Defaults</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            {isDirty && (
              <span className="text-xs font-semibold text-amber-400 animate-pulse flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Unsaved changes
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving || !isDirty}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all active:scale-95 shadow-md ${
                !isDirty
                  ? 'opacity-50 cursor-not-allowed bg-slate-600 text-slate-300'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30'
              }`}
            >
              <Save size={15} />
              <span>{isSaving ? 'Saving...' : 'Save Order & Filters'}</span>
            </button>
          </div>
        </div>

        {/* Informational Guidance */}
        <div className={`p-4 rounded-xl border text-xs leading-relaxed ${
          isDark ? 'bg-slate-900/40 border-white/5 text-slate-400' : 'bg-white/70 border-[#2E2B27]/10 text-slate-600'
        }`}>
          <div className="flex items-start gap-2.5">
            <Sliders size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className={`font-bold ${isDark ? 'text-slate-100' : 'text-[#2E2B27]'}`}>Daily Morning Briefing Sequence & Fine-Tuning: </span>
              Use the <span className="font-semibold">Move Up</span> and <span className="font-semibold">Move Down</span> buttons to re-order the report subjects. Toggle any subject off to exclude it completely. Click <span className="font-semibold text-amber-500 dark:text-amber-400">Sub-Filters</span> on any service to target or exclude specific data points (e.g. rain warnings, run vs ride stats, glucose trend arrows, alarm scopes, or news thresholds). Click <span className="font-semibold">Notes</span> to add custom conversational directives.
            </div>
          </div>
        </div>

        {/* Subjects List */}
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-semibold text-slate-400">Loading report subjects...</span>
          </div>
        ) : sections.length === 0 ? (
          <div className={`p-12 rounded-2xl border text-center ${
            isDark ? 'bg-white/5 border-white/10' : 'bg-white/80 border-[#2E2B27]/10'
          }`}>
            <SunMedium size={32} className="mx-auto text-amber-400 mb-3 opacity-60" />
            <h3 className="text-sm font-bold">No report subjects configured</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">Click below to restore the standard default sequence.</p>
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400"
            >
              Restore Defaults
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {sections.map((section, index) => {
              const Icon = getServiceIcon(section);
              const isFirst = index === 0;
              const isLast = index === sections.length - 1;
              const drawerState = activeDrawer[section.id] || null;
              const isNotesOpen = drawerState === 'notes';
              const isFiltersOpen = drawerState === 'filters';
              const isCustom = section.type === 'custom';

              // Resolve sub-filter schema for this section/service
              const schema = subFilterSchemas[section.id] || subFilterSchemas[section.serviceId] || [];
              const hasSubFilters = schema.length > 0;
              const currentFilters = section.subFilters || {};

              // Calculate active filter count if custom values applied
              const activeFilterCount = schema.filter(f => currentFilters[f.key] !== f.default).length;

              return (
                <div
                  key={section.id}
                  className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                    section.enabled
                      ? isDark
                        ? 'bg-slate-900/60 border-white/10 hover:border-white/20'
                        : 'bg-white/90 border-[#2E2B27]/10 hover:border-[#2E2B27]/20 shadow-sm'
                      : isDark
                      ? 'bg-slate-950/40 border-white/5 opacity-55'
                      : 'bg-slate-100/60 border-slate-200/50 opacity-60'
                  }`}
                >
                  <div className="p-3.5 sm:p-4 flex items-center gap-3 sm:gap-4">
                    {/* Position / Index Badge */}
                    <div className="flex flex-col items-center justify-center shrink-0 w-8">
                      <span className={`text-[10px] font-black font-mono tracking-tight ${
                        section.enabled ? (isDark ? 'text-amber-400' : 'text-amber-700') : 'text-slate-500'
                      }`}>
                        #{index + 1}
                      </span>
                    </div>

                    {/* Re-order Arrow Controls */}
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => moveItem(index, -1)}
                        disabled={isFirst}
                        title="Move subject earlier in report"
                        className={`p-1 rounded-lg transition-all ${
                          isFirst
                            ? 'opacity-20 cursor-not-allowed text-slate-500'
                            : isDark
                            ? 'hover:bg-white/10 text-slate-300 active:scale-95'
                            : 'hover:bg-[#2E2B27]/10 text-slate-700 active:scale-95'
                        }`}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        onClick={() => moveItem(index, 1)}
                        disabled={isLast}
                        title="Move subject later in report"
                        className={`p-1 rounded-lg transition-all ${
                          isLast
                            ? 'opacity-20 cursor-not-allowed text-slate-500'
                            : isDark
                            ? 'hover:bg-white/10 text-slate-300 active:scale-95'
                            : 'hover:bg-[#2E2B27]/10 text-slate-700 active:scale-95'
                        }`}
                      >
                        <ArrowDown size={14} />
                      </button>
                    </div>

                    {/* Service Icon */}
                    <div className={`p-2.5 rounded-xl shrink-0 ${
                      section.enabled
                        ? isDark
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                          : 'bg-amber-600/10 text-amber-800 border border-amber-600/15'
                        : isDark
                        ? 'bg-slate-800 text-slate-600'
                        : 'bg-slate-200 text-slate-500'
                    }`}>
                      <Icon size={18} />
                    </div>

                    {/* Subject Details */}
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <h4 className={`text-sm font-bold tracking-tight truncate ${
                          section.enabled
                            ? isDark ? 'text-slate-100' : 'text-slate-900'
                            : 'text-slate-500 line-through'
                        }`}>
                          {section.title}
                        </h4>

                        {/* Linked Service Pill */}
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-1 shrink-0 ${
                          isCustom
                            ? isDark
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : 'bg-purple-100 text-purple-800 border border-purple-200'
                            : isDark
                            ? 'bg-white/5 text-slate-400 border border-white/5'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          <LinkIcon size={10} />
                          <span>{section.serviceName || 'Built-in Service'}</span>
                        </span>

                        {hasSubFilters && (
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-1 shrink-0 ${
                            activeFilterCount > 0
                              ? isDark
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold'
                                : 'bg-amber-100 text-amber-900 border border-amber-300 font-bold'
                              : isDark
                              ? 'bg-white/5 text-slate-400 border border-white/5'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}>
                            <Filter size={10} />
                            <span>{schema.length} Sub-Filters {activeFilterCount > 0 ? `(${activeFilterCount} tuned)` : ''}</span>
                          </span>
                        )}

                        {!section.enabled && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30">
                            Inactive
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-400 dark:text-slate-400 line-clamp-1">
                        {section.description}
                      </p>

                      {section.customNote && !isNotesOpen && (
                        <div className="mt-1 text-[11px] font-medium text-amber-400/90 dark:text-amber-300/90 flex items-center gap-1 truncate">
                          <span className="font-bold">Mention:</span> {section.customNote}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Sub-Filters Accordion Toggle */}
                      {hasSubFilters && (
                        <button
                          onClick={() => toggleDrawer(section.id, 'filters')}
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                            isFiltersOpen || activeFilterCount > 0
                              ? isDark
                                ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40 shadow-sm'
                                : 'bg-amber-600/15 text-amber-900 border border-amber-600/30 shadow-sm'
                              : isDark
                              ? 'hover:bg-white/10 text-slate-400 border border-transparent'
                              : 'hover:bg-[#2E2B27]/10 text-slate-600 border border-transparent'
                          }`}
                          title="Tune service-specific data points and exclusion filters"
                        >
                          <Filter size={13} />
                          <span className="hidden sm:inline">Filters</span>
                          {isFiltersOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                      )}

                      {/* Mention Notes Toggle */}
                      <button
                        onClick={() => toggleDrawer(section.id, 'notes')}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                          isNotesOpen || section.customNote
                            ? isDark
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-amber-600/10 text-amber-900 border border-amber-600/20'
                            : isDark
                            ? 'hover:bg-white/10 text-slate-400'
                            : 'hover:bg-[#2E2B27]/10 text-slate-600'
                        }`}
                        title="Edit mention notes and emphasis"
                      >
                        <FileText size={13} />
                        <span className="hidden sm:inline">Notes</span>
                        {isNotesOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>

                      {/* Edit button for custom items */}
                      {isCustom && (
                        <button
                          onClick={() => openEditCustom(section)}
                          className={`p-1.5 rounded-xl transition-all ${
                            isDark ? 'hover:bg-white/10 text-slate-300' : 'hover:bg-[#2E2B27]/10 text-slate-700'
                          }`}
                          title="Edit custom item"
                        >
                          <Sliders size={14} />
                        </button>
                      )}

                      {/* Delete button for custom items */}
                      {isCustom && (
                        <button
                          onClick={() => handleDeleteCustom(section.id, section.title)}
                          className={`p-1.5 rounded-xl transition-all text-red-400 hover:text-red-300 ${
                            isDark ? 'hover:bg-red-500/20' : 'hover:bg-red-50'
                          }`}
                          title="Delete custom item"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}

                      {/* Enable/Disable Toggle */}
                      <button
                        onClick={() => toggleEnabled(section.id)}
                        title={section.enabled ? 'Click to exclude from report' : 'Click to include in report'}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          section.enabled
                            ? 'bg-emerald-500'
                            : isDark
                            ? 'bg-slate-700'
                            : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                            section.enabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Sub-Filters Drawer */}
                  {isFiltersOpen && hasSubFilters && (
                    <div className={`p-4 border-t space-y-3 ${
                      isDark ? 'bg-slate-950/70 border-white/10' : 'bg-[#F9F6F0] border-amber-900/10'
                    }`}>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold uppercase tracking-wider text-amber-500 dark:text-amber-400 flex items-center gap-1.5">
                          <Filter size={13} className="text-amber-400" />
                          <span>{section.title} — Information Sub-Filters & Data Targeting</span>
                        </label>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          Target or exclude specific metrics from {section.serviceName || 'this service'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        {schema.map((filter) => {
                          const currentVal = currentFilters[filter.key] !== undefined ? currentFilters[filter.key] : filter.default;

                          if (filter.type === 'boolean') {
                            return (
                              <div
                                key={filter.key}
                                onClick={() => updateSubFilter(section.id, filter.key, !currentVal)}
                                className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all select-none ${
                                  currentVal
                                    ? isDark
                                      ? 'bg-white/5 border-amber-500/30 hover:border-amber-500/50'
                                      : 'bg-white border-amber-500/40 hover:border-amber-600 shadow-sm'
                                    : isDark
                                    ? 'bg-slate-900/40 border-white/5 opacity-60 hover:opacity-80'
                                    : 'bg-slate-100 border-slate-200 opacity-60 hover:opacity-80'
                                }`}
                              >
                                <div className="space-y-0.5 flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-xs font-bold ${
                                      currentVal ? (isDark ? 'text-slate-100' : 'text-slate-900') : 'text-slate-400'
                                    }`}>
                                      {filter.label}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-400 dark:text-slate-400 leading-tight">
                                    {filter.description}
                                  </p>
                                </div>
                                <div className={`relative inline-flex h-6 w-11 shrink-0 items-center cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                  currentVal ? 'bg-amber-500' : isDark ? 'bg-slate-700' : 'bg-slate-300'
                                }`}>
                                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                    currentVal ? 'translate-x-5' : 'translate-x-0.5'
                                  }`} />
                                </div>
                              </div>
                            );
                          }

                          if (filter.type === 'level') {
                            const levels = filter.levels || ['Off', 'Brief', 'Normal', 'Detailed'];
                            const lv = typeof currentVal === 'boolean' ? (currentVal ? 2 : 0) : Number(currentVal ?? filter.default ?? 2);
                            const off = filter.levels ? false : lv === 0;
                            return (
                              <div key={filter.key} className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${off ? (isDark ? 'bg-slate-900/40 border-white/5' : 'bg-slate-100 border-slate-200') : (isDark ? 'bg-white/5 border-amber-500/30' : 'bg-white border-amber-500/40 shadow-sm')}`}>
                                <div className="flex items-center justify-between gap-2">
                                  <span className={`text-xs font-bold ${off ? 'text-slate-400' : isDark ? 'text-slate-100' : 'text-slate-900'}`}>{filter.label}</span>
                                  <span className={`text-[11px] font-black px-2 py-0.5 rounded-md ${off ? (isDark ? 'bg-white/5 text-slate-400' : 'bg-slate-200 text-slate-600') : (isDark ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-100 text-amber-900')}`}>{levels[lv]}</span>
                                </div>
                                <input type="range" min="0" max={levels.length - 1} step="1" value={lv}
                                  onChange={(e) => updateSubFilter(section.id, filter.key, Number(e.target.value))}
                                  className="w-full accent-amber-500 cursor-pointer" aria-label={`${filter.label} - how much detail`} />
                                <div className={`flex justify-between text-[9px] font-bold ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                  {levels.length <= 8 ? (
                                    levels.map((l, idx) => <span key={`${l}-${idx}`}>{l}</span>)
                                  ) : (
                                    levels.map((l, idx) => {
                                      const isStart = idx === 0;
                                      const isEnd = idx === levels.length - 1;
                                      const isMiddle = idx === 6;
                                      return (
                                        <span
                                          key={`${l}-${idx}`}
                                          className={isStart || isEnd || isMiddle ? 'opacity-100 font-extrabold' : 'opacity-40 text-[8px]'}
                                          title={l}
                                        >
                                          {isStart || isEnd || isMiddle ? l : (levels.length === 14 ? `${idx + 1}d` : l)}
                                        </span>
                                      );
                                    })
                                  )}
                                </div>
                                <p className="text-[10px] text-slate-400 leading-tight">{filter.description}</p>
                              </div>
                            );
                          }

                          if (filter.type === 'number') {
                            return (
                              <div
                                key={filter.key}
                                className={`p-2.5 rounded-xl border flex flex-col justify-between gap-2 ${
                                  isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'
                                }`}
                              >
                                <div>
                                  <div className="flex items-center justify-between">
                                    <span className={`text-xs font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                                      {filter.label}
                                    </span>
                                    <span className="font-mono text-xs font-black text-amber-500 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                                      {currentVal}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-400 mt-0.5">
                                    {filter.description}
                                  </p>
                                </div>
                                <div className="flex items-center gap-3 pt-1">
                                  <input
                                    type="range"
                                    min={filter.min || 0}
                                    max={filter.max || 100}
                                    step={filter.step || 1}
                                    value={currentVal}
                                    onChange={(e) => updateSubFilter(section.id, filter.key, parseFloat(e.target.value))}
                                    className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer bg-slate-700 accent-amber-500"
                                  />
                                  <span className="text-[10px] font-mono text-slate-500 w-8 text-right">
                                    {filter.max} max
                                  </span>
                                </div>
                              </div>
                            );
                          }

                          if (filter.type === 'select') {
                            const options = filter.options || selectOptions[filter.optionsUrl] || [];
                            return (
                              <div
                                key={filter.key}
                                className={`p-2.5 rounded-xl border flex flex-col justify-between gap-2 ${
                                  isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'
                                }`}
                              >
                                <div>
                                  <span className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{filter.label}</span>
                                  <p className="text-[10px] text-slate-400 mt-0.5">{filter.description}</p>
                                </div>
                                <select
                                  value={currentVal ?? ''}
                                  onChange={(e) => updateSubFilter(section.id, filter.key, e.target.value)}
                                  className={`w-full rounded-lg border px-2 py-1.5 text-xs font-semibold outline-none focus:border-amber-500 ${
                                    isDark ? 'bg-slate-900 border-white/10 text-slate-100' : 'bg-white border-slate-300 text-slate-800'
                                  }`}
                                >
                                  {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                              </div>
                            );
                          }

                          return null;
                        })}
                      </div>

                      {/* what Ims would say for this section today, with these settings */}
                      {(() => {
                        const ex = examples[section.id];
                        return (
                          <div className={`rounded-xl border p-3 ${isDark ? 'border-amber-500/30 bg-amber-500/5' : 'border-amber-400/60 bg-amber-50'}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                              <span className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-amber-300' : 'text-amber-900'}`}>What Ims would say</span>
                              <button onClick={() => loadExample(section)} disabled={ex?.loading}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border disabled:opacity-50 ${isDark ? 'border-amber-500/40 text-amber-200 hover:bg-amber-500/10' : 'border-amber-500 text-amber-900 bg-white hover:bg-amber-100'}`}>
                                {ex?.loading ? 'Writing...' : ex?.text || ex?.reason ? (ex.stale ? 'Settings changed - update the example' : 'Another example') : 'Show an example'}
                              </button>
                            </div>
                            {ex?.error && <p className="text-[11px] text-rose-600">{ex.error}</p>}
                            {ex?.dummy && ex?.text && <p className={`mb-1.5 inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${isDark ? 'bg-sky-500/15 text-sky-200' : 'bg-sky-100 text-sky-900'}`}>Made-up data - nothing real for this today</p>}
                            {ex?.text ? <p className={`text-xs leading-relaxed whitespace-pre-line ${ex.stale ? 'opacity-50' : ''} ${isDark ? 'text-slate-100' : 'text-[#2E2B27]'}`}>{ex.text}</p>
                              : ex?.reason ? <p className="text-[11px] text-slate-500">{ex.reason}</p>
                              : !ex?.loading && <p className="text-[11px] text-slate-500">Today's real data, said in Ims's voice with the settings above - saved or not.</p>}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Mention Notes Drawer */}
                  {isNotesOpen && (
                    <div className={`p-4 border-t space-y-3 ${
                      isDark ? 'bg-slate-950/60 border-white/5' : 'bg-slate-50 border-[#2E2B27]/10'
                    }`}>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <Sparkles size={12} className="text-amber-400" />
                          <span>Mention Directives & Focus Notes</span>
                        </label>
                        <span className="text-[10px] text-slate-500">
                          Instruct IMS what specific conditions or priorities to emphasize
                        </span>
                      </div>

                      <textarea
                        value={section.customNote || ''}
                        onChange={(e) => updateCustomNote(section.id, e.target.value)}
                        placeholder={getNotePlaceholder(section)}
                        rows={2}
                        className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none transition-all resize-none ${
                          isDark
                            ? 'bg-white/5 border-white/10 focus:border-amber-400/50 text-slate-200'
                            : 'bg-white border-[#2E2B27]/15 focus:border-amber-600 text-slate-800'
                        }`}
                      />

                      {isCustom && section.content && (
                        <div className="text-[11px] text-slate-400 bg-white/5 p-2.5 rounded-lg border border-white/5">
                          <span className="font-bold text-slate-300">Item Prompt / Instructions:</span> {section.content}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Custom Item Modal */}
      {customModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden ${
            isDark ? 'bg-[#0f172a] border-white/15 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className={`px-6 py-4 border-b flex items-center justify-between ${
              isDark ? 'border-white/10 bg-white/5' : 'border-slate-100 bg-slate-50'
            }`}>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold">
                    {editingCustomItem ? 'Edit Custom Subject' : 'Add Custom Report Subject'}
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Define a subject and optionally link it to an existing service
                  </span>
                </div>
              </div>
              <button
                onClick={() => setCustomModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveCustom} className="p-6 space-y-4 text-xs">
              {/* Subject Title */}
              <div>
                <label className="block font-bold mb-1 text-slate-300">Subject Title</label>
                <input
                  type="text"
                  required
                  value={customForm.title}
                  onChange={(e) => setCustomForm({ ...customForm, title: e.target.value })}
                  placeholder="e.g. Daily Medication Check, Spanish Practice, Garden Watering"
                  className={`w-full px-3 py-2 rounded-xl border focus:outline-none ${
                    isDark ? 'bg-white/5 border-white/10 text-white focus:border-amber-400' : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-600'
                  }`}
                />
              </div>

              {/* Link to Existing Service */}
              <div>
                <label className="block font-bold mb-1 text-slate-300">Link to Existing Service</label>
                <select
                  value={customForm.serviceId}
                  onChange={(e) => setCustomForm({ ...customForm, serviceId: e.target.value })}
                  className={`w-full px-3 py-2 rounded-xl border focus:outline-none ${
                    isDark ? 'bg-slate-900 border-white/10 text-white focus:border-amber-400' : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-600'
                  }`}
                >
                  {availableServices.map((srv) => (
                    <option key={srv.id} value={srv.id}>
                      {srv.name} — {srv.description}
                    </option>
                  ))}
                </select>
                <span className="block mt-1 text-[10px] text-slate-400">
                  Select a service if this subject should reference data gathered by that system.
                </span>
              </div>

              {/* Subject Description / Subtitle */}
              <div>
                <label className="block font-bold mb-1 text-slate-300">Short Summary</label>
                <input
                  type="text"
                  value={customForm.description}
                  onChange={(e) => setCustomForm({ ...customForm, description: e.target.value })}
                  placeholder="e.g. Remind to take morning vitamins and asthma inhaler."
                  className={`w-full px-3 py-2 rounded-xl border focus:outline-none ${
                    isDark ? 'bg-white/5 border-white/10 text-white focus:border-amber-400' : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-600'
                  }`}
                />
              </div>

              {/* Prompt / Instructions for IMS */}
              <div>
                <label className="block font-bold mb-1 text-slate-300">
                  Prompt Instructions / Information to Mention
                </label>
                <textarea
                  rows={3}
                  value={customForm.content}
                  onChange={(e) => setCustomForm({ ...customForm, content: e.target.value })}
                  placeholder="Specify what IMS should say or verify in the morning report, or cues on what to check."
                  className={`w-full px-3 py-2 rounded-xl border focus:outline-none resize-none ${
                    isDark ? 'bg-white/5 border-white/10 text-white focus:border-amber-400' : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-600'
                  }`}
                />
              </div>

              {/* Mention Directive */}
              <div>
                <label className="block font-bold mb-1 text-slate-300">Additional Mention Directive</label>
                <input
                  type="text"
                  value={customForm.customNote}
                  onChange={(e) => setCustomForm({ ...customForm, customNote: e.target.value })}
                  placeholder="e.g. Keep it punchy; ask if completed"
                  className={`w-full px-3 py-2 rounded-xl border focus:outline-none ${
                    isDark ? 'bg-white/5 border-white/10 text-white focus:border-amber-400' : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-600'
                  }`}
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCustomModalOpen(false)}
                  className={`px-4 py-2 rounded-xl font-bold ${
                    isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md"
                >
                  {editingCustomItem ? 'Save Changes' : 'Add to Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Live Preview Modal */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
            isDark ? 'bg-[#0f172a] border-white/20 text-white' : 'bg-white border-slate-300 text-slate-950'
          }`}>
            <div className={`px-6 py-4 border-b flex items-center justify-between shrink-0 ${
              isDark ? 'border-white/10 bg-slate-900/80' : 'border-slate-200 bg-slate-100'
            }`}>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-500">
                  <SunMedium size={18} />
                </div>
                <div>
                  <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-black'}`}>Live Day Report Preview</h3>
                  <span className={`text-[11px] ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    Spoken briefing contents rendered according to your custom order & sub-filters
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyPreviewText}
                  disabled={previewLoading || !previewData?.parts?.length}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    copiedPreview
                      ? 'bg-emerald-600 text-white'
                      : isDark
                      ? 'bg-white/10 hover:bg-white/20 text-white'
                      : 'bg-slate-200 hover:bg-slate-300 text-slate-900'
                  }`}
                >
                  {copiedPreview ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                  <span>{copiedPreview ? 'Copied!' : 'Copy'}</span>
                </button>
                <button
                  onClick={() => setPreviewOpen(false)}
                  className={`p-1.5 rounded-xl transition-colors ${
                    isDark ? 'hover:bg-white/10 text-slate-300 hover:text-white' : 'hover:bg-slate-200 text-slate-700 hover:text-black'
                  }`}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className={`px-6 pt-3 flex gap-2 shrink-0 ${isDark ? 'bg-slate-900/60' : 'bg-slate-100/70'}`}>
              {[['script', 'Script - what Ims will say'], ['instructions', 'What Ims is given']].map(([k, t]) => (
                <button key={k} onClick={() => { setPreviewView(k); if (k === 'script' && !script && !scriptLoading) loadScript(); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${previewView === k ? 'bg-amber-500 text-slate-950' : isDark ? 'bg-white/5 text-slate-300' : 'bg-white text-slate-700 border border-slate-300'}`}>{t}</button>
              ))}
            </div>
            <div className={`p-6 overflow-y-auto space-y-4 flex-1 text-xs ${
              isDark ? 'bg-slate-900/60' : 'bg-slate-100/70'
            }`}>
              {previewView === 'script' ? (
                scriptLoading ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-3">
                    <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
                    <span className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Writing today's script in Ims's voice...</span>
                  </div>
                ) : !script?.length ? (
                  <div className={`text-center py-8 font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Nothing to say with these settings - check that subjects are enabled.</div>
                ) : (
                  <div className="space-y-3">
                    {script.map((x, idx) => (
                      <div key={idx} className="p-3.5 rounded-xl border border-slate-300 bg-white shadow-sm">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="px-2 py-0.5 rounded font-mono text-[11px] font-black text-amber-950 bg-amber-200 border border-amber-400">{idx + 1}</span>
                          <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">{x.title}</span>
                        </div>
                        <p className="text-sm leading-relaxed text-black whitespace-pre-line select-text" style={{ color: '#000000' }}>{x.text || '(no words came back for this section - refresh)'}</p>
                      </div>
                    ))}
                  </div>
                )
              ) : previewLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  <span className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Generating live report briefing...</span>
                </div>
              ) : !previewData || !previewData.parts || previewData.parts.length === 0 ? (
                <div className={`text-center py-8 font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  No active report contents generated. Check that subjects are enabled.
                </div>
              ) : (
                <div className="space-y-3 font-sans">
                  {previewData.whoLine && (
                    <div className="p-3.5 rounded-xl bg-purple-100 border border-purple-300 text-black font-semibold text-xs italic shadow-sm" style={{ color: '#000000' }}>
                      {previewData.whoLine}
                    </div>
                  )}

                  {previewData.parts.map((part, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl border border-slate-300 bg-white shadow-sm flex items-start gap-3 transition-all"
                    >
                      <span className="px-2 py-0.5 rounded font-mono text-[11px] font-black text-amber-950 bg-amber-200 border border-amber-400 shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <p className="text-xs leading-relaxed flex-1 text-black font-medium select-text" style={{ color: '#000000' }}>
                        {part}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={`px-6 py-3 border-t text-[11px] flex items-center justify-between shrink-0 ${
              isDark ? 'border-white/10 bg-slate-900/80 text-slate-300' : 'border-slate-200 bg-slate-100 text-slate-800 font-medium'
            }`}>
              <span>{previewView === 'script' ? 'From the settings on this page, saved or not - change them, then Refresh.' : 'The facts and instructions each section gives Ims.'}</span>
              <button
                onClick={() => (previewView === 'script' ? loadScript() : handleOpenPreview())}
                className="font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
              >
                <RotateCcw size={11} /> Refresh
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
}
