import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Shield, FileText, Code, Star, Trash2, Settings, Sparkles, Grid, Activity, Terminal, Globe, Copy, Zap, CheckCircle2,
  MousePointer2, Layers, Type, Folder, Search, MessageSquare, ChevronDown, ChevronRight, Camera, Mic, Send, Volume2
} from 'lucide-react';
import { useDraggableScroll } from '../../hooks/useDraggableScroll';
import { Tooltip } from '../CursorHover';

/**
 * AdminPortal: Executive Control Interface.
 * Restored from GitHub Master Branch (main).
 */
export default function AdminPortal({ isOpen, onClose, voiceEngine }) {
  const { scrollRef, isDragging, handlers } = useDraggableScroll();
  const [activeTab, setActiveTab] = useState('structure');
  const [data, setData] = useState({ structure: null, rules: [], devRules: '', features: null, styleRules: null });
  const [loading, setLoading] = useState(false);
  const [newRule, setNewRule] = useState('');
  const [ngrokStatus, setNgrokStatus] = useState({ active: false, url: null });
  const [isNgrokTransitioning, setIsNgrokTransitioning] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadTabData(activeTab);
      fetchNgrokStatus();
    }
  }, [isOpen, activeTab]);

  const fetchNgrokStatus = async () => {
    try {
      const res = await fetch('/api/admin/ngrok/status');
      const data = await res.json();
      setNgrokStatus(data);
    } catch (err) {
      console.error('[Admin] Failed to fetch ngrok status:', err);
    }
  };

  const toggleNgrok = async () => {
    setIsNgrokTransitioning(true);
    const action = ngrokStatus.active ? 'stop' : 'start';
    try {
      const res = await fetch('/api/admin/ngrok/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      setNgrokStatus(data);
    } catch (err) {
      console.error('[Admin] Failed to toggle ngrok:', err);
    } finally {
      setIsNgrokTransitioning(false);
    }
  };

  const loadTabData = async (tab) => {
    if (tab === 'network') return;
    setLoading(true);
    try {
      const endpoints = {
        structure: '/api/admin/structure',
        rules: '/api/admin/rules',
        'dev-rules': '/api/admin/dev-rules',
        features: '/api/admin/features',
        'style-rules': '/api/admin/style-rules'
      };
      const res = await fetch(endpoints[tab]);
      const result = await res.json();
      
      if (tab === 'dev-rules') {
        setData(prev => ({ ...prev, devRules: result }));
      } else if (tab === 'style-rules') {
        setData(prev => ({ ...prev, styleRules: result }));
      } else {
        setData(prev => ({ ...prev, [tab]: result }));
      }
    } catch (err) {
      console.error(`Admin Sync Error [${tab}]:`, err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRule = async () => {
    if (!newRule.trim()) return;
    try {
      await fetch('/api/admin/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newRule })
      });
      setNewRule('');
      loadTabData('rules');
    } catch (err) { console.error('Rule Injection Failed:', err); }
  };

  const handleDeleteRule = async (id) => {
    try {
      await fetch(`/api/admin/rules/${id}`, { method: 'DELETE' });
      loadTabData('rules');
    } catch (err) { console.error('Rule Deletion Failed:', err); }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[2000] flex items-center justify-center p-6 md:p-12 overflow-hidden"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[40px]"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-6xl h-[85vh] bg-[var(--bg-secondary)] border border-[var(--glass-border)] rounded-[var(--radius-xl)] shadow-2xl flex flex-col overflow-hidden"
      >
        <header className="px-[var(--space-md)] py-[var(--space-sm)] border-b border-[var(--glass-border)] flex flex-col shrink-0 bg-[var(--bg-tertiary)] gap-4">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-4 md:gap-6">
              <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-[var(--accent-indigo)] flex items-center justify-center text-white shadow-xl shadow-[var(--shadow-glow)]">
                <Settings size={24} className="md:w-[28px] md:h-[28px]" />
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-[var(--text-primary)] tracking-tight">Admin Portal</h2>
                <p className="text-[10px] font-bold text-[var(--text-muted)] tracking-widest mt-1">Core Interface v1.0.4</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <button className="global-close-btn" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="flex items-center w-full">
            <nav 
              ref={scrollRef}
              {...handlers}
              className="flex items-center bg-[var(--bg-elevated)] p-[2px] rounded-full border border-[var(--glass-border)] gap-[1px] overflow-x-auto scrollbar-none flex-1 md:flex-none"
              style={{
                cursor: isDragging ? 'grabbing' : 'grab',
                userSelect: 'none',
                maxWidth: '100%'
              }}
            >
              {[
                { id: 'structure', label: 'Architecture', icon: Grid },
                { id: 'style-rules', label: 'Components', icon: Sparkles },
                { id: 'rules', label: 'Logic', icon: Shield },
                { id: 'dev-rules', label: 'Manifest', icon: Terminal },
                { id: 'features', label: 'Features', icon: Activity },
                { id: 'network', label: 'Network', icon: Globe },
                { id: 'diagnostics', label: 'Diagnostics', icon: Terminal },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => !isDragging && setActiveTab(tab.id)}
                  style={{ 
                    background: activeTab === tab.id ? 'var(--gradient-primary)' : 'transparent',
                    color: activeTab === tab.id ? 'white' : 'var(--text-muted)'
                  }}
                  className={`flex items-center gap-2 px-4 md:px-5 py-2 rounded-full text-[11px] md:text-[12px] font-semibold transition-all duration-300 group cursor-pointer shrink-0 ${activeTab === tab.id
                      ? 'shadow-[var(--shadow-glow)]'
                      : 'hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-light)]'
                    }`}
                >
                  <tab.icon size={14} className="shrink-0 transition-transform duration-300 group-hover:scale-110" />
                  <span className="shrink-0">{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-[var(--space-md)] py-6 bg-[var(--bg-primary)] custom-scrollbar">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'structure' && <StructureView structure={data.structure} loading={loading} />}
              {activeTab === 'style-rules' && <ComponentRulesView rules={data.styleRules} loading={loading} />}
              {activeTab === 'rules' && (
                <RulesView
                  rules={data.rules}
                  newRule={newRule}
                  setNewRule={setNewRule}
                  onAdd={handleAddRule}
                  onDelete={handleDeleteRule}
                  loading={loading}
                />
              )}
              {activeTab === 'dev-rules' && <DevRulesView content={data.devRules} loading={loading} />}
              {activeTab === 'features' && <FeaturesView features={data.features} loading={loading} />}
              {activeTab === 'network' && (
                <NetworkView 
                  status={ngrokStatus} 
                  onToggle={toggleNgrok} 
                  isTransitioning={isNgrokTransitioning} 
                />
              )}
              {activeTab === 'diagnostics' && (
                <DiagnosticsView voiceEngine={voiceEngine} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
        

      </motion.div>
    </div>
  );
}

function DiagnosticsView({ voiceEngine }) {
  const [testStatus, setTestStatus] = useState('idle');
  
  const handleVoiceTest = () => {
    if (!voiceEngine) return;
    setTestStatus('testing');
    voiceEngine.speak("This is a diagnostic test of the Knowledge Base voice engine. If you can hear this, your audio output is correctly configured.", true);
    setTimeout(() => setTestStatus('idle'), 3000);
  };

  const support = {
    stt: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    tts: !!window.speechSynthesis
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto py-8">
      <div className="text-center mb-12">
        <h3 className="text-2xl font-bold text-[var(--text-primary)] mb-2">System Diagnostics</h3>
        <p className="text-[var(--text-muted)]">Verify core infrastructure and peripheral integration.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Voice Engine Diagnostics */}
        <div className="p-8 bg-[var(--bg-tertiary)] border border-[var(--glass-border)] rounded-3xl shadow-xl">
           <div className="flex items-center gap-4 mb-8">
             <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500">
               <Mic size={24} />
             </div>
             <div>
               <h4 className="text-lg font-bold">Voice Interface</h4>
               <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest font-black">STT / TTS PIPELINE</p>
             </div>
           </div>

           <div className="space-y-4 mb-8">
             <div className="flex items-center justify-between p-4 bg-[var(--bg-primary)] rounded-xl border border-[var(--glass-border)]">
               <span className="text-sm font-medium">Speech Recognition (STT)</span>
               <span className={`text-[10px] font-black px-2 py-1 rounded ${support.stt ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                 {support.stt ? 'SUPPORTED' : 'UNSUPPORTED'}
               </span>
             </div>
             <div className="flex items-center justify-between p-4 bg-[var(--bg-primary)] rounded-xl border border-[var(--glass-border)]">
               <span className="text-sm font-medium">Speech Synthesis (TTS)</span>
               <span className={`text-[10px] font-black px-2 py-1 rounded ${support.tts ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                 {support.tts ? 'SUPPORTED' : 'UNSUPPORTED'}
               </span>
             </div>
           </div>

           <button
             onClick={handleVoiceTest}
             disabled={testStatus === 'testing' || !support.tts}
             className="w-full py-4 bg-[var(--accent-indigo)] hover:bg-[var(--accent-indigo-light)] disabled:opacity-50 text-white rounded-2xl font-bold shadow-lg shadow-[var(--accent-indigo)]/20 transition-all flex items-center justify-center gap-3"
           >
             {testStatus === 'testing' ? (
               <Activity size={18} className="animate-pulse" />
             ) : (
               <Volume2 size={18} />
             )}
             {testStatus === 'testing' ? 'OUTPUTTING AUDIO...' : 'RUN VOICE TEST'}
           </button>
           
           {!support.tts && (
             <p className="mt-4 text-center text-xs text-red-500 font-bold">
               Browser block detected. Try Google Chrome.
             </p>
           )}
        </div>

        {/* Global Controls */}
        <div className="p-8 bg-[var(--bg-tertiary)] border border-[var(--glass-border)] rounded-3xl shadow-xl flex flex-col justify-between">
           <div>
             <div className="flex items-center gap-4 mb-8">
               <div className="w-12 h-12 rounded-2xl bg-[var(--accent-indigo)]/10 flex items-center justify-center text-[var(--accent-indigo)]">
                 <Shield size={24} />
               </div>
               <div>
                 <h4 className="text-lg font-bold">Preference Overrides</h4>
                 <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest font-black">FORCE PROTOCOLS</p>
               </div>
             </div>

             <div className="space-y-4">
               <div className="p-4 bg-[var(--bg-primary)] rounded-xl border border-[var(--glass-border)]">
                 <p className="text-xs text-[var(--text-muted)] mb-2 font-bold">CITATION CLEANING</p>
                 <p className="text-sm">The Voice Engine now automatically strips citation markers like <code className="text-[var(--accent-indigo)]">[1]</code> or <code className="text-[var(--accent-indigo)]">(p. 42)</code> for cleaner audio output.</p>
               </div>
               
               <div className="p-4 bg-[var(--bg-primary)] rounded-xl border border-[var(--glass-border)]">
                 <p className="text-xs text-[var(--text-muted)] mb-2 font-bold">REGIONALISATION</p>
                 <p className="text-sm">Defaulting to <code className="text-[var(--accent-indigo)]">en-GB</code> (British English) for all speech interactions.</p>
               </div>
             </div>
           </div>

           <div className="mt-8 pt-8 border-t border-[var(--glass-border)] flex items-center justify-center gap-2 opacity-50">
             <Terminal size={12} />
             <span className="text-[10px] font-mono font-bold tracking-widest">SYSTEM_VERSION_1.0.4_STABLE</span>
           </div>
        </div>
      </div>
    </div>
  );
}

function StructureView({ structure, loading }) {
  if (loading && !structure) return <LoadingPulse />;
  if (!structure) return <div className="text-slate-500 p-20 text-center font-bold uppercase tracking-widest text-xs">No Matrix Data</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-6 opacity-60">
        <Layers size={12} className="text-[var(--accent-indigo)]" />
        <span className="text-[9px] font-black uppercase tracking-[3px] text-[var(--accent-indigo)]">SOURCE: GEMINI.MD</span>
      </div>
      {Object.entries(structure.structure).map(([moduleName, files]) => (
        <section key={moduleName} className="mb-6 last:mb-0">
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-[9px] font-bold text-[var(--accent-indigo)] tracking-[2px] bg-[var(--accent-indigo)]/10 px-2.5 py-1 rounded-md border border-[var(--accent-indigo)]/30">
              {moduleName.charAt(0).toUpperCase() + moduleName.slice(1).toLowerCase()}
            </h3>
            <div className="h-px flex-1 bg-[var(--glass-border)]" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Object.entries(files || {}).map(([path, desc]) => (
              <Tooltip key={path} text={`${path}: ${desc}`}>
                <div 
                  className="bg-[var(--bg-tertiary)] border border-[var(--glass-border)] rounded-[var(--radius-md)] p-3 hover:border-[var(--accent-indigo)] transition-all group cursor-help flex flex-row items-center text-left gap-3 w-40 h-20 shrink-0 overflow-hidden shadow-sm"
                >
                  <div className="w-10 h-10 shrink-0 rounded-xl bg-[var(--bg-primary)] flex items-center justify-center text-[var(--accent-indigo)] group-hover:scale-110 transition-transform shadow-sm">
                    {path.endsWith('.js') || path.endsWith('.jsx') ? <Code size={18} /> : <FileText size={18} />}
                  </div>
                  <h4 className="text-[10px] font-mono font-bold text-[var(--text-primary)] leading-tight flex-1 break-all line-clamp-3">
                    {path}
                  </h4>
                </div>

              </Tooltip>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function RulesView({ rules, newRule, setNewRule, onAdd, onDelete, loading }) {
  const safeRules = Array.isArray(rules) ? rules : [];
  if (loading && safeRules.length === 0) return <LoadingPulse />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 mb-4">
        <div>
          <h3 className="text-[9px] font-bold text-[var(--accent-indigo)] tracking-[2px] bg-[var(--accent-indigo)]/10 px-2.5 py-1 rounded-md border border-[var(--accent-indigo)]/30">
            Logic Matrix
          </h3>
          <div className="flex items-center gap-1.5 mt-1.5 px-1">
             <Shield size={10} className="text-[var(--accent-indigo)]" />
             <span className="text-[8px] font-black uppercase tracking-[2px] text-[var(--accent-indigo)] opacity-60">SOURCE: LOGIC_MATRIX (DB)</span>
          </div>
        </div>
        <div className="h-px flex-1 bg-[var(--glass-border)]" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 bg-[var(--bg-tertiary)] border border-[var(--glass-border)] rounded-[24px] p-6 shadow-xl h-fit">
          <h4 className="text-sm font-black text-[var(--text-primary)] mb-4 flex items-center gap-2 uppercase tracking-wider">
            <Zap size={14} className="text-[var(--accent-indigo)]" /> Inject Strategy
          </h4>
          <textarea 
            value={newRule}
            onChange={(e) => setNewRule(e.target.value)}
            placeholder="Define behavioral protocol..."
            className="w-full h-40 bg-black/20 border border-[var(--glass-border)] rounded-[var(--radius-md)] p-4 text-[var(--text-primary)] text-xs outline-none resize-none focus:border-[var(--accent-indigo)]/50 transition-colors"
          />
          <button 
            onClick={onAdd} 
            disabled={!newRule.trim()} 
            className="w-full mt-4 py-3 bg-[var(--gradient-primary)] rounded-[var(--radius-md)] text-white font-bold text-[11px] tracking-widest uppercase shadow-lg shadow-[var(--accent-indigo)]/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            Deploy Strategy
          </button>
        </div>

        <div className="lg:col-span-8 flex flex-col gap-3">
          {safeRules.length === 0 ? (
            <div className="p-12 border-2 border-dashed border-[var(--glass-border)] rounded-3xl text-center">
               <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">No strategies deployed.</p>
            </div>
          ) : (
            safeRules.map((rule) => (
              <div key={rule.id} className="bg-[var(--bg-secondary)] border border-[var(--glass-border)] p-4 rounded-2xl flex gap-4 items-center group hover:border-[var(--accent-indigo)]/30 transition-all">
                <div className="w-8 h-8 rounded-lg bg-[var(--bg-primary)] flex items-center justify-center text-[var(--accent-indigo)] group-hover:scale-110 transition-transform shadow-sm">
                  <Shield size={14} />
                </div>
                <p className="flex-1 text-[12px] text-[var(--text-primary)] leading-relaxed font-medium">
                  {rule.content}
                </p>
                <button 
                  onClick={() => onDelete(rule.id)} 
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function DevRulesView({ content, loading }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editText, setEditText] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  
  const actualContent = content?.content || '';
  const filePath = content?.filePath || '';

  React.useEffect(() => {
    if (!isEditing) setEditText(actualContent);
  }, [actualContent, isEditing]);

  const handleSave = async () => {
    if (!filePath) return alert("Cannot save: No file path associated with this manifest.");
    setIsSaving(true);
    try {
      await fetch('/api/admin/dev-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editText, filePath })
      });
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to save rules:", err);
      alert("Failed to save manifest.");
    } finally {
      setIsSaving(false);
    }
  };

  const formatRules = (text) => {
    if (!text) return '';
    return text.split('\n').map((line, i) => {
      let color = 'var(--manifest-text)';
      let fontWeight = '400';
      let opacity = '1';
      let paddingLeft = line.startsWith(' ') ? '15px' : '0';

      // Parse line for structure
      if (line.startsWith('#')) {
        color = 'var(--manifest-heading)';
        fontWeight = '800';
      } else if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
        opacity = '0.75'; // Soften list markers slightly
      }

      // Handle Bold Sub-headings (**Text:**)
      const boldMatch = line.match(/\*\*(.*?)\*\*/);
      if (boldMatch) {
        const [full, content] = boldMatch;
        const parts = line.split(full);
        return (
          <div key={i} style={{ color, fontWeight, opacity, paddingLeft, minHeight: '1.2em', marginBottom: '2px' }}>
            {parts[0]}
            <span style={{ color: 'var(--manifest-subheading)', fontWeight: '700' }}>{content}</span>
            {parts[1]}
          </div>
        );
      }

      return (
        <div key={i} style={{ color, fontWeight, opacity, paddingLeft, minHeight: '1.2em', marginBottom: '2px' }}>
          {line}
        </div>
      );
    });
  };

  if (loading && !content) return <LoadingPulse />;
  
  return (
    <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)', borderRadius: '24px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 20px', background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Terminal size={13} style={{ color: '#475569', marginRight: '10px' }} />
          <div className="flex flex-col">
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '1px' }}>
              System Manifest {filePath && <span style={{ opacity: 0.5 }}>- {filePath.split('\\').pop() || filePath.split('/').pop()}</span>}
            </span>
            <span style={{ fontSize: '8px', fontWeight: 900, color: 'var(--accent-indigo)', letterSpacing: '2px', marginTop: '2px' }}>SOURCE: GEMINI.MD</span>
          </div>
        </div>
        <div>
          {isEditing ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setIsEditing(false)} className="toolbar-btn">Cancel</button>
              <button onClick={handleSave} disabled={isSaving} className="toolbar-btn" style={{ background: 'var(--accent-indigo)', color: 'white', borderColor: 'var(--accent-indigo)' }}>
                {isSaving ? 'Saving...' : 'Save Manifest'}
              </button>
            </div>
          ) : (
            <button onClick={() => setIsEditing(true)} className="toolbar-btn">Edit Manifest</button>
          )}
        </div>
      </div>
      <div className="custom-scrollbar" style={{ height: '550px', overflowY: 'auto', padding: '24px' }}>
        {isEditing ? (
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            spellCheck="false"
            style={{
              width: '100%', height: '100%', minHeight: '500px', background: 'transparent', border: 'none',
              color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '12px',
              resize: 'vertical', outline: 'none', lineHeight: 1.7
            }}
          />
        ) : (
          <div style={{ margin: 0, fontFamily: 'monospace', fontSize: '12px', lineHeight: 1.7 }}>
            {formatRules(editText)}
          </div>
        )}
      </div>
    </div>
  );
}

function FeaturesView({ features, loading }) {
  if (loading && !features) return <LoadingPulse />;
  const items = features?.features || [];
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div>
          <h3 className="text-[9px] font-bold text-[var(--accent-indigo)] tracking-[2px] bg-[var(--accent-indigo)]/10 px-2.5 py-1 rounded-md border border-[var(--accent-indigo)]/30">
            Feature Registry
          </h3>
          <div className="flex items-center gap-1.5 mt-1.5 px-1">
             <Activity size={10} className="text-[var(--accent-indigo)]" />
             <span className="text-[8px] font-black uppercase tracking-[2px] text-[var(--accent-indigo)] opacity-60">SOURCE: FEATURE.JSON</span>
          </div>
        </div>
        <div className="h-px flex-1 bg-[var(--glass-border)]" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {items.map((f) => {
          const status = (f.status || 'stable').toLowerCase().replace(' ', '-');
          const isImplemented = status === 'implemented';
          
          return (
            <Tooltip key={f.id} text={f.description}>
              <div 
                className="bg-[var(--bg-tertiary)] border border-[var(--glass-border)] rounded-[var(--radius-md)] p-3 hover:border-[var(--accent-indigo)] transition-all group cursor-help flex flex-col items-center justify-center text-center gap-2 w-40 h-40 shrink-0 overflow-hidden shadow-sm"
              >
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <div className="w-10 h-10 rounded-xl bg-[var(--bg-primary)] flex items-center justify-center text-[var(--accent-indigo)] group-hover:scale-110 transition-transform shadow-sm">
                    <Star size={18} fill={isImplemented ? "currentColor" : "none"} />
                  </div>
                  <span className={`status-badge ${status}`} style={{ fontSize: '8px', padding: '1px 6px' }}>
                    {f.status}
                  </span>
                </div>
                <div className="flex-1 flex flex-col justify-center w-full min-h-0 px-1">
                  <h4 className="text-[10px] font-bold text-[var(--text-primary)] tracking-wider leading-tight line-clamp-3">
                    {f.name}
                  </h4>
                  <div className="h-0.5 w-8 bg-[var(--accent-indigo)]/30 rounded-full mx-auto mt-2 shrink-0" />
                </div>
              </div>

            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

function BoxModel({ specs }) {
  const padding = specs?.padding || '0';
  const margin = specs?.margin || '0';
  const border = specs?.border ? (specs.border === 'none' ? '0' : '1') : '0';
  
  return (
    <div className="flex flex-col items-center justify-center p-6 bg-white rounded-2xl mt-4 border border-[var(--glass-border)] shadow-inner">
      <div className="relative border-2 border-dashed border-orange-400/40 p-5 bg-orange-400/5 rounded-xl flex items-center justify-center min-w-[200px]">
        <span className="absolute top-1 left-2 text-[7px] font-bold text-orange-600/60 uppercase">Margin {margin}</span>
        
        <div className="relative border border-yellow-400/60 p-4 bg-yellow-400/10 rounded-lg flex items-center justify-center w-full">
          <span className="absolute top-1 left-2 text-[7px] font-bold text-yellow-700/80 uppercase">Border {border}</span>
          
          <div className="relative border-2 border-dashed border-green-400/50 p-5 bg-green-400/10 rounded-md flex items-center justify-center w-full">
            <span className="absolute top-1 left-2 text-[7px] font-bold text-green-700/80 uppercase">Padding {padding}</span>
            
            <div className="bg-blue-400/20 border border-blue-400/40 rounded px-5 py-2.5 flex items-center justify-center min-w-[80px] shadow-sm">
              <span className="text-[10px] font-mono font-black text-blue-600">
                {specs?.icon_size ? `${specs.icon_size}px` : 'AUTO'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function VisualPreview({ type, variant, specs }) {
  const [isHovered, setIsHovered] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 });
  const containerRef = React.useRef(null);

  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  if (variant === 'segment_toggles') {
    const items = ['RESEARCH', 'CRITIC', 'GURU'];
    return (
      <div className="p-4 bg-black/5 rounded-xl flex flex-col gap-3 items-center justify-center border border-dashed border-[var(--glass-border)]">
        <div 
          style={{ 
            padding: specs.container_padding, 
            borderRadius: specs.container_radius,
            background: specs.container_background || 'var(--bg-tertiary)',
            border: '1px solid var(--glass-border)',
            display: 'flex',
            gap: specs.between_item_gap
          }}
        >
          {items.map((item, i) => (
            <div 
              key={item}
              onClick={() => setActiveIndex(i)}
              onMouseEnter={() => activeIndex !== i && setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              style={{
                padding: specs.item_padding,
                borderRadius: specs.item_radius,
                background: i === activeIndex ? specs.active_background : 'transparent',
                color: i === activeIndex ? specs.active_text : 'var(--text-muted)',
                fontSize: specs.font_size,
                fontWeight: specs.font_weight,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: specs.internal_icon_gap || '8px',
                transition: 'all 0.2s ease',
                boxShadow: i === activeIndex ? specs.active_shadow : 'none'
              }}
            >
              <Star 
                size={specs.icon_size || 10} 
                className={i === activeIndex ? 'opacity-100' : 'opacity-80'} 
                style={{ 
                  transform: (i === activeIndex || (isHovered && i !== activeIndex)) ? 'scale(1.1)' : 'scale(1)',
                  transition: 'transform 0.2s ease',
                  color: i === activeIndex ? 'white' : 'inherit'
                }}
              />
              <span className="tracking-tight">{item}</span>
            </div>
          ))}
        </div>
        <span className="text-[9px] font-bold text-[var(--accent-indigo)] uppercase tracking-[2px] opacity-60">Production-Locked Sync</span>
      </div>
    );
  }

  if (type === 'BinaryToggle') {
    const items = ['OPTION A', 'OPTION B'];
    return (
      <div className="p-4 bg-black/5 rounded-xl flex flex-col gap-3 items-center justify-center border border-dashed border-[var(--glass-border)]">
        <div 
          style={{ 
            padding: specs.padding, 
            borderRadius: specs.radius,
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--glass-border)',
            display: 'flex',
            gap: specs.gap,
            width: '100%',
            maxWidth: '226px'
          }}
        >
          {items.map((item, i) => (
            <div 
              key={item}
              onClick={() => setActiveIndex(i)}
              style={{
                flex: 1,
                padding: specs.item_padding,
                borderRadius: specs.radius,
                background: i === activeIndex ? 'var(--gradient-primary)' : 'transparent',
                color: i === activeIndex ? 'white' : 'var(--text-muted)',
                fontSize: specs.item_font_size,
                fontWeight: specs.item_font_weight,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                boxShadow: i === activeIndex ? specs.active_shadow : 'none'
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'buttons') {
    const style = {
      padding: specs.padding,
      borderRadius: specs.radius || 'var(--radius-full)',
      background: specs.background || 'var(--bg-tertiary)',
      border: specs.border || '1px solid var(--glass-border)',
      color: specs.active_text || 'var(--text-primary)',
      fontSize: specs.font_size || '12px',
      fontWeight: specs.font_weight || 600,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      boxShadow: isHovered ? specs.active_shadow : 'none'
    };

    return (
      <div className="p-4 bg-black/5 rounded-xl flex items-center justify-center border border-dashed border-[var(--glass-border)]">
        <div 
          style={style}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <Sparkles 
            size={14} 
            style={{ 
              transform: isHovered ? 'scale(1.2)' : 'scale(1)',
              transition: 'transform 0.2s ease' 
            }} 
          />
          <span>{variant.charAt(0).toUpperCase() + variant.slice(1).replace(/_/g, ' ')}</span>
        </div>
      </div>
    );
  }

  if (type === 'messages') {
    const isUser = variant === 'user_prompt';
    return (
      <div className={`p-4 bg-black/5 rounded-xl flex flex-col gap-2 border border-dashed border-[var(--glass-border)] ${isUser ? 'items-end' : 'items-start'}`}>
        <div 
          style={{
            padding: '12px 16px',
            borderRadius: specs.radius,
            borderBottomRightRadius: specs.border_bottom_right_radius || specs.radius,
            borderBottomLeftRadius: specs.border_bottom_left_radius || specs.radius,
            background: specs.background,
            border: specs.border || 'none',
            color: specs.color || 'var(--text-primary)',
            backdropFilter: !isUser ? 'blur(10px)' : 'none',
            fontSize: '14px',
            lineHeight: 1.7,
            maxWidth: '220px'
          }}
        >
          {isUser ? 'Researcher Query Protocol' : 'Intelligence Synthesis Reply: According to the architectural schematics...'}
        </div>
      </div>
    );
  }

  if (type === 'history_item') {
    return (
      <div 
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="p-4 bg-black/5 rounded-xl flex flex-col items-center justify-center border border-dashed border-[var(--glass-border)] h-32 relative cursor-default"
      >
        <div 
          style={{
            padding: specs.padding,
            borderRadius: specs.radius,
            background: isHovered ? specs.hover_background : 'transparent',
            border: isHovered ? specs.active_border || '1px solid var(--glass-border)' : '1px solid transparent',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
            transition: 'all 0.2s ease',
            fontSize: specs.font_size
          }}
        >
          <MessageSquare size={14} className="text-[var(--text-muted)]" />
          <div className="flex flex-col flex-1 min-w-0">
             <span className="truncate font-medium">Physical components interaction...</span>
          </div>
          {isHovered && <Trash2 size={13} className="text-[var(--status-red)] opacity-60 hover:opacity-100 transition-opacity" />}
        </div>
      </div>
    );
  }

  if (type === 'prompt_action_icons') {
    return (
      <div className="p-4 bg-black/5 rounded-xl flex flex-col items-center justify-center border border-dashed border-[var(--glass-border)] h-32 relative">
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: specs.gap,
            padding: specs.padding,
            background: 'var(--bg-secondary)',
            borderRadius: specs.radius,
            border: '1px solid var(--glass-border)',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
           <Camera size={specs.icon_size} className="text-[var(--text-muted)] hover:text-[var(--accent-indigo)] cursor-pointer" />
           <Sparkles size={specs.icon_size} className="text-[var(--text-muted)] hover:text-[var(--accent-indigo)] cursor-pointer" />
           <div className="w-px h-4 bg-[var(--glass-border)] mx-1" />
           <div className="p-1.5 rounded-lg bg-red-500/10 text-red-500 animate-pulse">
             <Mic size={specs.icon_size} />
           </div>
           <div className="p-1.5 rounded-lg bg-[var(--gradient-primary)] text-white shadow-lg">
             <Send size={18} />
           </div>
        </div>
      </div>
    );
  }

  if (type === 'hover_components') {
    const isPopover = variant === 'cursor_popover';
    const isFlipped = mousePos.x > 250; 

    return (
      <div 
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="p-4 bg-black/5 rounded-xl flex flex-col gap-4 items-center justify-center border border-dashed border-[var(--glass-border)] relative h-48 cursor-crosshair overflow-hidden"
      >
        <div className="absolute top-0 right-0 bottom-0 w-px bg-[var(--accent-indigo)]/20 border-r border-dashed border-[var(--accent-indigo)]/40 pointer-events-none">
           <span className="absolute top-2 right-2 text-[7px] font-black uppercase text-[var(--accent-indigo)]/60">Viewport Edge</span>
        </div>
        <div className={`flex items-center gap-3 px-4 py-2 border rounded-full text-[11px] font-black transition-all duration-300 ${isHovered ? 'bg-[var(--accent-indigo)] text-white border-[var(--accent-indigo)]' : 'bg-[var(--bg-primary)] text-[var(--accent-indigo)] border-[var(--accent-indigo)]/40 shadow-sm'}`}>
           <MousePointer2 size={12} /> {isHovered ? 'CURSOR_LOCKED' : 'HOVER_AREA'}
        </div>
        
        {isHovered && (
          <div 
            style={{ 
              position: 'absolute',
              left: isFlipped ? Math.max(10, mousePos.x - (isPopover ? 292 : 160)) : Math.min(containerRef.current?.offsetWidth - 10, mousePos.x + 12),
              top: mousePos.y + 12,
              zIndex: 10,
              pointerEvents: 'none',
              transition: 'opacity 0.2s ease, left 0.1s ease'
            }}
          >
            <div 
              style={{
                width: specs.width || 'auto',
                padding: specs.padding || '0',
                background: 'var(--bg-secondary)',
                backdropFilter: 'blur(30px)',
                border: specs.border || '1px solid var(--glass-border)',
                borderRadius: specs.radius,
                boxShadow: specs.shadow,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}
            >
              {isPopover && (
                <div className="p-3 border-b border-[var(--glass-border)] bg-white/5 flex items-center gap-2">
                  <div className="w-1 h-3 bg-[var(--accent-indigo)] rounded-full" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-[var(--text-muted)]">
                    {isFlipped ? 'QUADRANT: NW (FLIPPED)' : 'QUADRANT: NE'}
                  </span>
                </div>
              )}
              <div className="p-4">
                 <p className="text-[11px] font-semibold text-[var(--text-primary)] leading-relaxed">
                   {isPopover ? 'This protocol ensures that hover containers flip boundaries when approaching viewport edges...' : 'System Prompt Verification'}
                 </p>
              </div>
            </div>
          </div>
        )}

        <div className="text-center space-y-1 pointer-events-none">
           <span className="text-[9px] font-black text-[var(--accent-indigo)] uppercase tracking-[2px]">Viewport Intelligence Engine</span>
           <p className="text-[8px] text-[var(--text-muted)] italic max-w-[180px]">Monitors coordinates to maintain fixed 12px offset from the active cursor context.</p>
        </div>
      </div>
    );
  }

  if (type === 'administrative_overlays') {
    return (
      <div className="p-4 bg-black/5 rounded-xl flex flex-col items-center justify-center border border-dashed border-[var(--glass-border)] h-40 relative overflow-hidden">
        <div className="absolute inset-0 bg-black/20 backdrop-blur-[10px]" />
        <div 
          style={{
            width: '140px',
            height: '70px',
            background: 'var(--bg-secondary)',
            borderRadius: specs.window_radius,
            border: specs.border,
            boxShadow: specs.shadow,
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px'
          }}
        >
          <Shield size={18} className="text-[var(--accent-indigo)]" />
          <span className="text-[8px] font-black uppercase tracking-tighter opacity-60">System Modal</span>
        </div>
      </div>
    );
  }

  if (type === 'layout_z_index') {
    return (
      <div className="p-4 bg-black/5 rounded-xl flex flex-col gap-2 border border-dashed border-[var(--glass-border)] h-32 justify-center">
        {Object.entries(specs).slice(0, 3).map(([key, val], i) => (
          <div key={key} className="flex items-center justify-between bg-[var(--bg-primary)] p-2 rounded-lg border border-[var(--glass-border)]" style={{ marginLeft: i * 8 }}>
            <span className="text-[8px] font-black uppercase tracking-wider">{key}</span>
            <span className="text-[10px] font-mono font-bold text-[var(--accent-indigo)]">Z:{val}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-8 bg-black/5 rounded-xl flex items-center justify-center border border-dashed border-[var(--glass-border)] italic text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-black">
       Proxy Node_{variant.toUpperCase()}
    </div>
  );
}

function TypographyView({ typography }) {
  if (!typography) return null;
  return (
    <div className="mt-12 space-y-8">
      <div className="flex items-center gap-3 mb-6">
        <h3 className="text-[10px] font-bold text-[var(--accent-indigo)] tracking-[4px] bg-[var(--accent-indigo)]/10 px-4 py-2 rounded-md border border-[var(--accent-indigo)]/50 uppercase">
          Typography & Semantic Palette
        </h3>
        <div className="h-px flex-1 bg-[var(--glass-border)]" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-[var(--bg-tertiary)] border border-[var(--glass-border)] rounded-[32px] p-10 shadow-2xl">
           <div className="flex items-center gap-4 mb-8">
              <div className="p-3 rounded-2xl bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)]">
                <Type size={24} />
              </div>
              <h4 className="text-2xl font-black text-[var(--text-primary)] tracking-tight">Heading Hierarchy</h4>
           </div>
           <div className="space-y-8">
              {Object.entries(typography.headings).map(([key, val]) => {
                const color = key.includes('manifest') ? 'var(--manifest-heading)' : 'var(--text-primary)';
                return (
                  <div key={key} className="flex flex-col gap-3 group">
                    <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[3px] group-hover:text-[var(--accent-indigo)] transition-colors">{key.replace(/_/g, ' ')}</span>
                    <div className="flex items-baseline gap-4">
                        <span 
                          style={{ 
                            fontSize: val.split(' / ')[0], 
                            fontWeight: val.split(' / ')[1].split(' ')[0],
                            letterSpacing: val.includes('letter-spacing') ? val.split(' / ')[2].split(' ')[0] : 'normal',
                            color: color
                          }}
                        >
                          Executive Intelligence
                        </span>
                    </div>
                    <div className="h-px w-full bg-gradient-to-r from-[var(--glass-border)] to-transparent" />
                    <span className="text-[10px] font-mono font-bold text-[var(--accent-indigo)] opacity-60 tracking-tight">{val}</span>
                  </div>
                );
              })}
           </div>
        </div>

        <div className="bg-[var(--bg-tertiary)] border border-[var(--glass-border)] rounded-[32px] p-10 shadow-2xl">
           <div className="flex items-center gap-4 mb-8">
              <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-500">
                <FileText size={24} />
              </div>
              <h4 className="text-2xl font-black text-[var(--text-primary)] tracking-tight">Body & Interface Copy</h4>
           </div>
           <div className="space-y-8">
              {Object.entries(typography.body).map(([key, val]) => {
                const color = key.includes('manifest') ? 'var(--manifest-text)' : 'var(--text-secondary)';
                return (
                  <div key={key} className="flex flex-col gap-3 group">
                    <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[3px] group-hover:text-indigo-500 transition-colors">{key.replace(/_/g, ' ')}</span>
                    <p 
                      style={{ 
                        fontSize: val.split(' / ')[0], 
                        lineHeight: val.split(' / ')[1].split(' ')[0],
                        fontWeight: val.includes('weight') ? val.split(' / ')[2].split(' ')[0] : 500,
                        color: color
                      }}
                      className="italic"
                    >
                      "The Knowledge Base synthesizes document intelligence with a 98.4% relevance threshold across multimodal datasets."
                    </p>
                    <div className="h-px w-full bg-gradient-to-r from-[var(--glass-border)] to-transparent" />
                    <span className="text-[10px] font-mono font-bold text-[var(--accent-indigo)] opacity-60 tracking-tight">{val}</span>
                  </div>
                );
              })}
           </div>
        </div>
      </div>
    </div>
  );
}

function ComponentRulesView({ rules, loading }) {
  if (loading && !rules) return <LoadingPulse />;
  if (!rules || !rules.components) return <div className="text-slate-500 p-20 text-center font-bold uppercase tracking-widest text-xs">No Component Data</div>;

  return (
    <div className="space-y-12 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <div>
          <h3 className="text-[11px] font-black text-[var(--accent-indigo)] tracking-[5px] bg-[var(--accent-indigo)]/10 px-5 py-2.5 rounded-xl border-2 border-[var(--accent-indigo)]/40 uppercase shadow-glow-sm">
            System Design Protocol v{rules.version}
          </h3>
          <div className="flex items-center gap-1.5 mt-2 px-1">
             <Sparkles size={10} className="text-[var(--accent-indigo)]" />
             <span className="text-[8px] font-black uppercase tracking-[2px] text-[var(--accent-indigo)] opacity-60">SOURCE: COMPONENTSTYLERULES.JSON</span>
          </div>
        </div>
        <div className="h-px flex-1 bg-[var(--glass-border)]" />
      </div>

      {rules.design_system?.typography && <TypographyView typography={rules.design_system.typography} />}

      <div className="grid grid-cols-1 gap-12 mt-16">
        {Object.entries(rules.components).map(([compName, compData]) => (
          <div 
            key={compName} 
            className="bg-[var(--bg-secondary)] border border-[var(--glass-border)] rounded-[32px] overflow-hidden flex flex-col shadow-2xl"
          >
            <div className="p-8 border-b border-[var(--glass-border)] bg-[var(--bg-tertiary)] flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-[var(--bg-primary)] flex items-center justify-center text-[var(--accent-indigo)] shadow-xl">
                  <Grid size={24} />
                </div>
                <div>
                  <h4 className="text-2xl font-black text-[var(--text-primary)] tracking-tight">
                    {compName.charAt(0).toUpperCase() + compName.slice(1).replace(/_/g, ' ')}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-black text-[var(--accent-indigo)] tracking-widest uppercase">
                      Architecture Node
                    </span>
                    <div className="w-1 h-1 rounded-full bg-[var(--glass-border)]" />
                    <div className="flex items-center gap-1">
                      <FileText size={10} className="text-[var(--text-muted)]" />
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase italic">
                        {compData.maintaining_file || 'Multiple Sources'}
                      </span>
                    </div>
                    <div className="w-1 h-1 rounded-full bg-[var(--glass-border)]" />
                    <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase italic">
                      {compData.classes?.length || 0} Selectors Bound
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap lg:justify-end gap-2">
                {(compData.classes || []).map(cls => (
                  <span key={cls} className="text-[10px] font-mono font-bold px-3 py-1 rounded-lg bg-[var(--bg-primary)] border border-[var(--glass-border)] text-[var(--text-secondary)] shadow-sm">
                    .{cls.split(' ')[0]}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-12 bg-[var(--bg-primary)]">
              <div className="lg:col-span-4 space-y-8">
                <div>
                  <h5 className="text-[11px] font-black text-[var(--text-primary)] uppercase tracking-[2px] mb-4 flex items-center gap-2">
                    <Activity size={12} className="text-[var(--accent-indigo)]" /> Intent & Summary
                  </h5>
                  <div className="p-5 bg-[var(--bg-tertiary)] rounded-2xl border border-[var(--glass-border)] shadow-sm">
                    <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed font-medium">
                      {compData.description}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h5 className="text-[11px] font-black text-[var(--text-primary)] uppercase tracking-[2px] mb-4">Geometry Matrix</h5>
                  <BoxModel specs={compData.specs || (compData.variants ? Object.values(compData.variants)[0].specs : {})} />
                </div>
              </div>

              <div className="lg:col-span-8 space-y-8">
                <h5 className="text-[11px] font-black text-[var(--text-primary)] uppercase tracking-[2px] mb-4 flex items-center gap-2">
                  <Sparkles size={12} className="text-[var(--accent-indigo)]" /> Rendered Variants & Hover Protocols
                </h5>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {compData.variants ? (
                    Object.entries(compData.variants).map(([vName, vData]) => (
                      <div key={vName} className="p-6 bg-[var(--bg-tertiary)] rounded-3xl border border-[var(--glass-border)] flex flex-col gap-6 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider">{vName.replace(/_/g, ' ')}</span>
                          <span className="text-[10px] font-mono font-bold text-[var(--accent-indigo)]">PROTOCOL_{vName.toUpperCase()}</span>
                        </div>
                        
                        <VisualPreview type={compName} variant={vName} specs={vData.specs} />
                        
                        <div className="space-y-3">
                           <div className="flex items-center gap-2">
                              <MousePointer2 size={10} className="text-[var(--accent-indigo)]" />
                              <span className="text-[9px] font-black text-[var(--text-primary)] uppercase tracking-wider">Hover Spec</span>
                           </div>
                           <p className="text-[10px] text-[var(--text-muted)] italic pl-4 border-l border-[var(--accent-indigo)]/30">
                              Triggers: {vData.specs?.shadow ? 'Depth Shift, ' : ''}{vData.specs?.icon_size ? 'Icon Scaling, ' : ''}{vData.specs?.background?.includes('gradient') ? 'Glow Intensity' : 'Border Highlight'}
                           </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-auto">
                          {Object.entries(vData.specs || {}).slice(0, 4).map(([sk, sv]) => (
                            <div key={sk} className="bg-[var(--bg-primary)] p-2 rounded-lg border border-[var(--glass-border)]">
                              <span className="block text-[8px] font-bold text-[var(--text-muted)] uppercase mb-0.5">{sk.replace(/_/g, ' ')}</span>
                              <span className="text-[10px] font-mono text-[var(--text-primary)] truncate block">{sv}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="md:col-span-2 p-6 bg-[var(--bg-tertiary)] rounded-3xl border border-[var(--glass-border)] flex flex-col gap-6">
                       <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider">Standard Variant</span>
                          <span className="text-[10px] font-mono font-bold text-[var(--accent-indigo)]">UNI_SPEC_V1</span>
                        </div>
                        <VisualPreview type={compName} variant={compName} specs={compData.specs} />
                        <div className="grid grid-cols-4 gap-3 mt-auto">
                          {Object.entries(compData.specs || {}).map(([sk, sv]) => (
                            <div key={sk} className="bg-[var(--bg-primary)] p-2 rounded-lg border border-[var(--glass-border)]">
                              <span className="block text-[8px] font-bold text-[var(--text-muted)] uppercase mb-0.5">{sk.replace(/_/g, ' ')}</span>
                              <span className="text-[10px] font-mono text-[var(--text-primary)] truncate block">{sv}</span>
                            </div>
                          ))}
                        </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingPulse() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '400px', gap: '24px' }}>
      <div className="w-12 h-12 border-4 border-[var(--glass-border)] border-t-[var(--accent-indigo)] rounded-full animate-spin"></div>
      <div className="flex flex-col items-center gap-1">
        <span className="text-[12px] font-black tracking-[3px] text-[var(--text-primary)] uppercase">Syncing Design Spec</span>
        <span className="text-[10px] font-medium text-[var(--text-muted)] italic">Finalising Architecture Matrix...</span>
      </div>
    </div>
  );
}

function NetworkView({ status, onToggle, isTransitioning }) {
  const [copied, setCopied] = useState(false);
  const [portValue, setPortValue] = useState('');
  const [isSavingPort, setIsSavingPort] = useState(false);
  const [portSaved, setPortSaved] = useState(false);
  const [portError, setPortError] = useState('');

  // Fetch current port on mount
  useEffect(() => {
    const fetchPort = async () => {
      try {
        const res = await fetch('/api/admin/port');
        const data = await res.json();
        setPortValue(String(data.port));
      } catch (err) {
        console.error('[Admin] Failed to fetch port:', err);
        setPortValue('5173');
      }
    };
    fetchPort();
  }, []);

  const copyUrl = () => {
    if (status.url) {
      navigator.clipboard.writeText(status.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  /**
   * Validates and persists the new port to the server.
   * The Vite dev server must be restarted manually for localhost to reflect the change.
   * Ngrok will automatically reconnect to the new port on next toggle.
   */
  const handleSavePort = async () => {
    const numPort = parseInt(portValue, 10);
    if (isNaN(numPort) || numPort < 1024 || numPort > 65535) {
      setPortError('Port must be between 1024 and 65535.');
      return;
    }
    setPortError('');
    setIsSavingPort(true);
    try {
      const res = await fetch('/api/admin/port', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: numPort })
      });
      const result = await res.json();
      if (result.success) {
        setPortSaved(true);
        setTimeout(() => setPortSaved(false), 4000);
      } else {
        setPortError(result.error || 'Failed to save port.');
      }
    } catch (err) {
      setPortError('Network error saving port.');
    } finally {
      setIsSavingPort(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-6 flex flex-col gap-8">
      {/* Port Configuration Card */}
      <div className="bg-[var(--bg-elevated)] border border-[var(--glass-border)] rounded-[24px] p-8 shadow-xl">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[var(--accent-indigo)]/20 text-[var(--accent-indigo)]">
              <Settings size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[var(--text-primary)]">Port Configuration</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-muted)] font-medium">Localhost &amp; Tunnel Port</span>
                <div className="w-1 h-1 rounded-full bg-[var(--glass-border)]" />
                <span className="text-[8px] font-black text-[var(--accent-indigo)] uppercase tracking-widest">SOURCE: APP_SETTINGS</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-6 rounded-2xl border bg-[var(--bg-primary)] border-[var(--glass-border)]">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Client Port</span>
              {portSaved && (
                <span className="flex items-center gap-1.5 text-[10px] font-bold text-green-500">
                  <CheckCircle2 size={10} /> SAVED — RESTART REQUIRED
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center gap-2 bg-black/20 border border-white/5 rounded-lg px-4 py-3">
                <span className="text-xs font-mono text-[var(--text-muted)] whitespace-nowrap select-none">http://localhost:</span>
                <input
                  type="number"
                  min="1024"
                  max="65535"
                  value={portValue}
                  onChange={(e) => { setPortValue(e.target.value); setPortError(''); setPortSaved(false); }}
                  className="bg-transparent border-none outline-none text-[var(--text-primary)] font-mono text-sm font-bold w-20"
                  placeholder="5173"
                />
              </div>
              <button
                onClick={handleSavePort}
                disabled={isSavingPort}
                className="px-5 py-3 bg-[var(--accent-indigo)] hover:bg-[var(--accent-indigo-light)] text-white rounded-lg font-bold text-[11px] tracking-wider uppercase transition-all disabled:opacity-50 flex items-center gap-2 shrink-0"
              >
                {isSavingPort ? (
                  <Zap size={14} className="animate-pulse" />
                ) : portSaved ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <Settings size={14} />
                )}
                {isSavingPort ? 'SAVING...' : portSaved ? 'APPLIED' : 'APPLY'}
              </button>
            </div>
            {portError && (
              <p className="mt-3 text-xs text-red-500 font-bold">{portError}</p>
            )}
          </div>

          <div className="p-4 rounded-xl bg-[var(--accent-indigo)]/5 border border-[var(--accent-indigo)]/15">
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              <strong className="text-[var(--text-primary)]">How it works:</strong> Changing the port will update the ngrok tunnel target immediately on next toggle.
              For <code className="text-[var(--accent-indigo)] text-[10px] font-bold">localhost</code>, restart the dev server with:
            </p>
            <div className="mt-2 bg-black/20 border border-white/5 rounded-lg px-4 py-2 font-mono text-[11px] text-[var(--text-primary)] flex items-center justify-between">
              <span>VITE_PORT={portValue} npm run dev</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`set VITE_PORT=${portValue} && npm run dev`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="p-1.5 rounded hover:bg-white/10 transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                {copied ? <CheckCircle2 size={12} className="text-green-500" /> : <Copy size={12} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Ngrok Tunnel Card */}
      <div className="flex flex-col md:flex-row gap-8">
        <div className="flex-1 bg-[var(--bg-elevated)] border border-[var(--glass-border)] rounded-[24px] p-8 shadow-xl">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${status.active ? "bg-green-500/20 text-green-500" : "bg-slate-500/20 text-slate-500"}`}>
                <Globe size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[var(--text-primary)]">External Access Control</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-muted)] font-medium">Secure public tunnel</span>
                  <div className="w-1 h-1 rounded-full bg-[var(--glass-border)]" />
                  <span className="text-[8px] font-black text-[var(--accent-indigo)] uppercase tracking-widest">SOURCE: ADMIN SERVICE</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <span className={`text-[10px] font-bold tracking-widest ${status.active ? 'text-green-500' : 'text-slate-500'}`}>
                {status.active ? 'ONLINE' : 'OFFLINE'}
              </span>
              <button
                onClick={onToggle}
                disabled={isTransitioning}
                className={`relative w-14 h-7 rounded-full transition-all duration-300 ${status.active ? "bg-green-500" : "bg-slate-600"} p-1 cursor-pointer outline-none border-none`}
              >
                <motion.div
                  animate={{ x: status.active ? 28 : 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className="w-5 h-5 bg-white rounded-full shadow-lg flex items-center justify-center"
                >
                  {isTransitioning && <Zap size={10} className="text-slate-400 animate-pulse" />}
                </motion.div>
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div className={`p-6 rounded-2xl border transition-all duration-300 ${status.active ? "bg-green-500/5 border-green-500/20" : "bg-slate-500/5 border-slate-500/10"}`}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Live URL</span>
                {status.active && (
                  <span className="flex items-center gap-1.5 text-[10px] font-bold text-green-500">
                    <CheckCircle2 size={10} /> TLS 1.3 SECURE
                  </span>
                )}
              </div>
              
              {status.active ? (
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-black/20 border border-white/5 rounded-lg px-4 py-3 font-mono text-xs text-[var(--text-primary)] truncate">
                    {status.url}
                  </div>
                  <button
                    onClick={copyUrl}
                    className="p-3 bg-[var(--bg-elevated)] border border-[var(--glass-border)] rounded-lg hover:bg-[var(--glass-bg-light)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    {copied ? <CheckCircle2 size={16} className="text-green-500" /> : <Copy size={16} />}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-[var(--text-muted)] italic">Tunnel is offline. Toggle the switch to activate.</p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                <span className="block text-[9px] font-bold text-[var(--text-muted)] uppercase mb-1">Region</span>
                <span className="text-xs font-bold text-[var(--text-primary)]">Europe (uk)</span>
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                <span className="block text-[9px] font-bold text-[var(--text-muted)] uppercase mb-1">Domain Type</span>
                <span className="text-xs font-bold text-[var(--text-primary)]">Static Endpoint</span>
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                <span className="block text-[9px] font-bold text-[var(--text-muted)] uppercase mb-1">Tunnel Port</span>
                <span className="text-xs font-bold text-[var(--accent-indigo)]">{portValue}</span>
              </div>
            </div>
          </div>
        </div>

        {status.active && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-full md:w-64 bg-[var(--bg-elevated)] border border-[var(--glass-border)] rounded-[24px] p-6 flex flex-col items-center justify-center text-center"
          >
            <div className="bg-white p-3 rounded-xl mb-4 shadow-inner">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(status.url)}`}
                alt="Tunnel QR Code"
                className="w-32 h-32"
              />
            </div>
            <h4 className="text-xs font-bold text-[var(--text-primary)] mb-1">Quick Mobile Access</h4>
            <p className="text-[10px] text-[var(--text-muted)] px-2">Scan to open the mobile-optimised interface on your device.</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}

