import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Drama,
  ArrowLeft,
  Save,
  RotateCw,
  Check,
  AlertCircle,
  Sun,
  Moon,
  FileText,
  Undo2
} from 'lucide-react';

export default function PersonaPortal({
  theme = 'dark',
  onThemeToggle,
  currentPath = '/ims/persona',
  setCurrentPath
}) {
  const isDark = theme === 'dark';

  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [filePath, setFilePath] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [notification, setNotification] = useState(null);
  const textareaRef = useRef(null);

  const isDirty = content !== savedContent;

  const showToast = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => {
      setNotification(prev => (prev?.msg === msg ? null : prev));
    }, 3500);
  }, []);

  const fetchPersonaRules = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/persona-rules');
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      if (data.success) {
        setContent(data.content || '');
        setSavedContent(data.content || '');
        setFilePath(data.path || '');
      } else {
        throw new Error(data.error || 'Failed to load persona rules.');
      }
    } catch (err) {
      console.error('[PersonaPortal] Error fetching persona rules:', err);
      setErrorMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPersonaRules();
  }, [fetchPersonaRules]);

  // Warn on browser navigation/close with unsaved changes - a full-document
  // edit like this is far more painful to lose by accident than a single
  // memory card, so this is worth the extra guard MemoriesPortal doesn't need.
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleReturnHome = () => {
    if (isDirty && !window.confirm('You have unsaved changes to the persona rules. Leave without saving?')) {
      return;
    }
    window.history.pushState(null, '', '/ims');
    if (setCurrentPath) {
      setCurrentPath('/ims');
    } else {
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const handleSave = async () => {
    if (!content.trim()) {
      showToast('Persona rules cannot be empty.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/persona-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save persona rules.');
      }
      setSavedContent(content);
      showToast('Persona rules saved - takes effect on IMS\'s next conversation.');
    } catch (err) {
      console.error('[PersonaPortal] Save error:', err);
      showToast(err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevert = () => {
    if (!isDirty) return;
    if (!window.confirm('Discard unsaved changes and revert to the last saved version?')) return;
    setContent(savedContent);
  };

  // Ctrl/Cmd+S saves in place, rather than triggering the browser's own
  // "save page" dialog - this is a text editor for the duration of the visit.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty && !isSaving) handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDirty, isSaving, content]);

  const lineCount = content ? content.split('\n').length : 0;
  const charCount = content.length;

  return (
    <div className={`min-h-screen w-full flex flex-col font-sans transition-colors duration-300 ${
      isDark ? 'bg-[#030712] text-[#f3f4f6]' : 'bg-[#f4efed] text-[#1f2937]'
    }`}>
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 backdrop-blur-md border animate-in fade-in slide-in-from-top-4 duration-200 ${
          notification.type === 'error'
            ? 'bg-red-500/90 text-white border-red-600/30'
            : isDark
              ? 'bg-slate-900/90 text-white border-brand-cyan/40 shadow-[0_0_20px_rgba(0,242,255,0.2)]'
              : 'bg-white/95 text-slate-800 border-[#899981]/40 shadow-xl'
        }`}>
          {notification.type === 'error' ? <AlertCircle size={18} /> : <Check size={18} className="text-emerald-400" />}
          <span className="text-xs font-semibold">{notification.msg}</span>
        </div>
      )}

      {/* Top Header */}
      <header className={`px-6 py-4 flex items-center justify-between border-b backdrop-blur-xl sticky top-0 z-40 transition-colors duration-300 ${
        isDark ? 'bg-[#030712]/80 border-white/5' : 'bg-[#f4efed]/85 border-[#2E2B27]/10'
      }`}>
        <div className="flex items-center gap-4">
          <button
            onClick={handleReturnHome}
            className={`p-2 rounded-xl flex items-center gap-2 text-xs font-bold transition-all active:scale-95 ${
              isDark
                ? 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5'
                : 'bg-[#2E2B27]/5 hover:bg-[#2E2B27]/10 text-[#2E2B27] border border-[#2E2B27]/10'
            }`}
            title="Return to IMS Hub"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">IMS Hub</span>
          </button>

          <div className="h-6 w-px bg-slate-500/20" />

          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-purple-500 to-fuchsia-600 shadow-[0_0_15px_rgba(192,38,211,0.3)]">
              <Drama size={18} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black tracking-tight leading-none uppercase">
                  IMS Persona Editor
                </h1>
                {isDirty && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/25">
                    Unsaved
                  </span>
                )}
              </div>
              <span className="text-[10px] font-semibold text-slate-500 tracking-wider">
                /ims/persona • ims_persona_rules.md
              </span>
            </div>
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-3">
          {isDirty && (
            <button
              onClick={handleRevert}
              className={`px-3 py-2 rounded-xl text-xs font-bold tracking-wide transition-all flex items-center gap-2 active:scale-95 ${
                isDark
                  ? 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5'
                  : 'bg-[#2E2B27]/5 hover:bg-[#2E2B27]/10 text-[#2E2B27] border border-[#2E2B27]/10'
              }`}
              title="Discard changes"
            >
              <Undo2 size={14} />
              <span className="hidden sm:inline">Revert</span>
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className="px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-all flex items-center gap-2 bg-gradient-to-r from-purple-500 to-fuchsia-600 hover:from-purple-400 hover:to-fuchsia-500 text-white shadow-[0_0_15px_rgba(192,38,211,0.25)] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Save (Ctrl+S)"
          >
            {isSaving ? <RotateCw size={15} className="animate-spin" /> : <Save size={15} />}
            <span>{isSaving ? 'Saving...' : 'Save'}</span>
          </button>

          {onThemeToggle && (
            <button
              onClick={onThemeToggle}
              className={`p-2 rounded-xl transition-all border ${
                isDark
                  ? 'bg-white/5 hover:bg-white/10 text-amber-400 border-white/5'
                  : 'bg-[#2E2B27]/5 hover:bg-[#2E2B27]/10 text-slate-700 border-[#2E2B27]/10'
              }`}
              title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          )}
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-6 flex flex-col gap-4">
        <div className={`p-3 rounded-xl border flex items-center gap-3 text-xs ${
          isDark ? 'bg-slate-900/40 border-white/5 text-slate-400' : 'bg-white/70 border-[#2E2B27]/10 text-slate-600'
        }`}>
          <FileText size={14} className="shrink-0 opacity-70" />
          <span>
            This document defines Ims's fixed dialect, identity, and tool-usage rules - the personality sliders (on the device's Preferences screen) separately control tone (how warm, blunt, or playful Ims is) within it. Changes here take effect on IMS's next conversation - no restart or firmware flash needed.
          </span>
        </div>

        {errorMessage && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-3">
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
            <button onClick={fetchPersonaRules} className="ml-auto underline font-semibold hover:no-underline">Retry</button>
          </div>
        )}

        {isLoading ? (
          <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
            <RotateCw size={24} className="text-purple-400 animate-spin" />
            <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Loading persona rules...</p>
          </div>
        ) : (
          <div className={`rounded-2xl border overflow-hidden flex flex-col ${
            isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'
          }`}>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
              className={`w-full min-h-[65vh] p-5 text-xs font-mono leading-relaxed outline-none resize-y ${
                isDark
                  ? 'bg-transparent text-slate-100 placeholder-slate-500'
                  : 'bg-transparent text-slate-900 placeholder-slate-400'
              }`}
              placeholder="# IMS Core Persona, Dialect & Behavioral Directives..."
            />
            <div className={`px-5 py-2.5 border-t flex items-center justify-between text-[10px] font-semibold tracking-wide ${
              isDark ? 'border-white/5 text-slate-500' : 'border-[#2E2B27]/10 text-slate-500'
            }`}>
              <span>{lineCount} lines &middot; {charCount} characters</span>
              <span className="font-mono opacity-60 truncate max-w-[50%]">{filePath}</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
