import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusItem } from '../../hooks/useFocusItem';
import { Lightbulb, Pencil, Plus, AlertTriangle, Trash2, Mic, Monitor, Terminal, Check, X, RotateCcw, Save, Tag, Filter, Image as ImageIcon, Copy, ExternalLink, Sparkles } from 'lucide-react';
import PortalShell from './PortalShell';

// Dev ideas (/ims/devideas): ideas for improving IMS, said to Ims ("Ims, dev idea: ...") or typed
// here, waiting to be picked up in Claude Code or Antigravity with /ideas.
const STATUS = {
  new: { label: 'New', cls: 'bg-violet-500/15 text-violet-500' },
  picked_up: { label: 'Picked up', cls: 'bg-sky-500/15 text-sky-500' },
  done: { label: 'Done', cls: 'bg-emerald-500/15 text-emerald-500' },
  dismissed: { label: 'Dismissed', cls: 'bg-slate-500/15 text-slate-500' },
};
const SOURCE = { desk: [Mic, 'Said to Ims on the desk'], web: [Mic, 'Said to Ims in the app'], page: [Monitor, 'Typed here'], claude: [Terminal, 'Added from Claude / Antigravity'], auto: [AlertTriangle, 'Flagged automatically when something failed'] };

const DEFAULT_CATEGORIES = [
  'IMS Desktop',
  'IMS ESP32',
  'Music Scanner',
  'Blood Glucose / Diabetes',
  'Run Planner',
  'Activities & Training',
  'Morning Report',
  'Hardware & Firmware',
  'Voice & Persona',
  'Calendar & Schedule',
  'Lists & Memory',
  'Campaign Manager',
  'Board Games',
  'Code Repo Best Practices',
  'System Architecture',
  'Other'
];

export default function DevIdeasPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';
  const [ideas, setIdeas] = useState([]);
  useFocusItem(ideas.length); // Ctrl+K search results land on #<item>
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [newCategory, setNewCategory] = useState('Other');
  const [text, setText] = useState('');
  const [image, setImage] = useState(null); // base64 data url for new idea
  const [editing, setEditing] = useState(null); // { id, text, category, image }
  const [showClosed, setShowClosed] = useState(false);
  const [notification, setNotification] = useState(null);
  const [previewModalImg, setPreviewModalImg] = useState(null);
  
  const fileInputRef = useRef(null);
  const editFileInputRef = useRef(null);

  const toast = (msg, type = 'success') => { setNotification({ msg, type }); setTimeout(() => setNotification(null), 3000); };
  
  const load = useCallback(async () => {
    try {
      const url = selectedCategory && selectedCategory !== 'all'
        ? `/api/dev-ideas?category=${encodeURIComponent(selectedCategory)}`
        : '/api/dev-ideas';
      const d = await (await fetch(url)).json();
      if (d.success) {
        setIdeas(d.ideas);
        if (d.categories && Array.isArray(d.categories)) {
          setCategories(d.categories);
        }
      }
    } catch (err) { toast(err.message, 'error'); }
  }, [selectedCategory]);

  useEffect(() => { load(); }, [load]);

  const call = async (url, method, body, done) => {
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Something went wrong.');
      if (done) toast(done);
      load();
    } catch (err) { toast(err.message, 'error'); }
  };
  
  const handlePasteImage = (e, isEdit = false) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          const reader = new FileReader();
          reader.onloadend = () => {
            if (isEdit) {
              setEditing(prev => prev ? { ...prev, image: reader.result } : null);
            } else {
              setImage(reader.result);
            }
            toast('Screenshot pasted from clipboard.');
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    }
  };

  const handleFileChange = (e, isEdit = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast('Image exceeds 5MB limit.', 'error');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      if (isEdit) {
        setEditing(prev => prev ? { ...prev, image: reader.result } : null);
      } else {
        setImage(reader.result);
      }
      e.target.value = '';
      toast('Image attached.');
    };
    reader.readAsDataURL(file);
  };

  const add = () => {
    if (text.trim() || image) {
      call('/api/dev-ideas', 'POST', { text, category: newCategory, image }, 'Idea saved.');
      setText('');
      setImage(null);
    }
  };
  
  const setStatus = (id, status) => call(`/api/dev-ideas/${id}`, 'PATCH', { status });
  const saveEdit = () => {
    call(`/api/dev-ideas/${editing.id}`, 'PATCH', { text: editing.text, category: editing.category, image: editing.image }, 'Idea updated.');
    setEditing(null);
  };
  const remove = (id) => { if (window.confirm('Delete this idea?')) call(`/api/dev-ideas/${id}`, 'DELETE', null, 'Idea deleted.'); };

  const copyImageToClipboard = async (dataUrl) => {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
      toast('Screenshot copied to clipboard! Paste it straight into Antigravity.');
    } catch (err) {
      toast('Could not write image binary to clipboard directly: ' + err.message, 'error');
    }
  };

  const copyPromptForAntigravity = (idea) => {
    let promptText = `[Dev Idea #${idea.id} - ${idea.category || 'Other'}]\n${idea.text}`;
    if (idea.image) {
      promptText += `\n\n(Screenshot attached in IMS Dev Ideas portal #${idea.id})`;
    }
    navigator.clipboard.writeText(promptText);
    toast('Copied idea prompt to clipboard for Antigravity!');
  };

  const open = ideas.filter((i) => i.status === 'new' || i.status === 'picked_up');
  const closed = ideas.filter((i) => i.status === 'done' || i.status === 'dismissed');
  const panel = `rounded-2xl border p-5 ${isDark ? 'bg-slate-900/40 border-white/5' : 'bg-white/70 border-[#2E2B27]/10 shadow-sm'}`;
  const field = `w-full px-3 py-2.5 rounded-xl text-sm outline-none border ${isDark ? 'bg-slate-950/60 border-white/10' : 'bg-white border-[#2E2B27]/10'}`;
  const selectField = `px-3 py-2 rounded-xl text-xs font-semibold outline-none border cursor-pointer ${isDark ? 'bg-slate-950/80 border-white/10 text-slate-200' : 'bg-white border-[#2E2B27]/10 text-slate-800'}`;
  const muted = isDark ? 'text-slate-400' : 'text-slate-500';
  const btn = `p-2 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`;

  // a render function, not a component, so the edit box keeps focus while typing
  const renderRow = (i) => {
    const [SrcIcon, srcLabel] = SOURCE[i.source] || SOURCE.page;
    return (
      <div key={i.id} id={`idea-${i.id}`} className={`p-3.5 rounded-xl border flex flex-col sm:flex-row gap-3 ${isDark ? 'bg-slate-950/40 border-white/5' : 'bg-white border-[#2E2B27]/10'}`}>
        <div className="flex-1 min-w-0">
          {editing?.id === i.id ? (
            <div className="flex flex-col gap-2" onPaste={(e) => handlePasteImage(e, true)}>
              <textarea className={field} rows={3} value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} autoFocus />
              
              {editing.image && (
                <div className="relative inline-block mt-1">
                  <img src={editing.image} alt="Attachment" className="max-h-36 rounded-lg border border-white/10 object-contain cursor-pointer" onClick={() => setPreviewModalImg(editing.image)} />
                  <button onClick={() => setEditing({ ...editing, image: null })} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600" title="Remove screenshot">
                    <X size={12} />
                  </button>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Tag size={13} className="opacity-60" />
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-70">Category:</span>
                <select className={selectField} value={editing.category || 'Other'} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>

                <input type="file" ref={editFileInputRef} accept="image/*" onChange={(e) => handleFileChange(e, true)} className="hidden" />
                <button type="button" onClick={() => editFileInputRef.current?.click()} className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${isDark ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'border-black/10 bg-black/5 hover:bg-black/10'}`}>
                  <ImageIcon size={13} /> {editing.image ? 'Replace Image' : 'Attach Screenshot'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm whitespace-pre-wrap break-words">{i.text}</p>
              {i.image && (
                <div className="mt-2.5 flex flex-wrap items-start gap-3">
                  <div className="relative group cursor-pointer" onClick={() => setPreviewModalImg(i.image)}>
                    <img src={i.image} alt="Dev idea screenshot" className="max-h-44 max-w-full sm:max-w-md rounded-xl border border-white/10 shadow-sm object-cover group-hover:opacity-90 transition-opacity" />
                    <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded-md backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      <ExternalLink size={10} /> View Large
                    </span>
                  </div>
                  <button onClick={() => copyImageToClipboard(i.image)} className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 self-start font-semibold transition-colors ${isDark ? 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20' : 'border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100'}`} title="Copy screenshot to clipboard for Antigravity prompt">
                    <Copy size={13} /> Copy Screenshot
                  </button>
                </div>
              )}
            </div>
          )}
          {i.notes && <p className={`text-xs mt-1.5 ${muted}`}>Claude / Antigravity: {i.notes}</p>}
          <div className={`flex flex-wrap items-center gap-2 mt-2.5 text-[11px] ${muted}`}>
            <span className={`px-2 py-0.5 rounded-full font-bold ${STATUS[i.status].cls}`}>{STATUS[i.status].label}</span>
            <span className={`px-2 py-0.5 rounded-full font-semibold border ${isDark ? 'border-amber-500/30 text-amber-400 bg-amber-500/10' : 'border-amber-400/40 text-amber-700 bg-amber-50'}`}>
              {i.category || 'Other'}
            </span>
            <span className="flex items-center gap-1" title={srcLabel}><SrcIcon size={12} /> #{i.id}</span>
            <span>{new Date(i.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            
            <button onClick={() => copyPromptForAntigravity(i)} className={`ml-auto px-2 py-0.5 rounded-md border font-medium flex items-center gap-1 text-[11px] ${isDark ? 'border-white/10 hover:bg-white/10 text-slate-300' : 'border-black/10 hover:bg-black/5 text-slate-700'}`} title="Copy formatted prompt text">
              <Sparkles size={11} className="text-amber-500" /> Copy Prompt
            </button>
          </div>
        </div>
        <div className="flex items-start gap-0.5 shrink-0 self-end sm:self-start">
          {editing?.id === i.id ? (
            <>
              <button onClick={saveEdit} className={btn} title="Save"><Save size={15} /></button>
              <button onClick={() => setEditing(null)} className={btn} title="Cancel"><X size={15} /></button>
            </>
          ) : (i.status === 'new' || i.status === 'picked_up') ? (
            <>
              <button onClick={() => setEditing({ id: i.id, text: i.text, category: i.category || 'Other', image: i.image || null })} className={btn} title="Edit"><Pencil size={15} /></button>
              <button onClick={() => setStatus(i.id, 'done')} className={`${btn} text-emerald-500`} title="Mark done"><Check size={15} /></button>
              <button onClick={() => setStatus(i.id, 'dismissed')} className={btn} title="Dismiss"><X size={15} /></button>
            </>
          ) : (
            <button onClick={() => setStatus(i.id, 'new')} className={btn} title="Reopen"><RotateCcw size={15} /></button>
          )}
          <button onClick={() => remove(i.id)} className={`${btn} text-red-400`} title="Delete"><Trash2 size={15} /></button>
        </div>
      </div>
    );
  };

  return (
    <PortalShell title="Dev Ideas" subtitle="/ims/devideas • ideas & screenshots for IMS, ready for Antigravity & Claude Code"
      icon={Lightbulb} gradient="from-amber-400 to-orange-600" glow="rgba(251,146,60,0.3)" maxWidth="max-w-3xl"
      isDark={isDark} onThemeToggle={onThemeToggle} setCurrentPath={setCurrentPath} notification={notification}>
      
      {/* Input panel with clipboard paste */}
      <div className={panel} onPaste={(e) => handlePasteImage(e, false)}>
        <p className={`text-xs mb-3 ${muted}`}>
          Say <b>"Ims, dev idea: …"</b> to the desk or type here. <b>Paste screenshots (Ctrl+V)</b> directly into the box, then copy them back out into Antigravity prompt.
        </p>
        <div className="flex flex-col gap-2.5">
          <textarea className={field} rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Show tomorrow's first event in the desk footer after 9pm (or paste a screenshot with Ctrl+V)"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) add(); }} />

          {/* Screenshot Preview in creation box */}
          {image && (
            <div className="relative inline-block self-start p-1 rounded-xl border border-amber-500/30 bg-amber-500/5">
              <img src={image} alt="Screenshot attachment" className="max-h-36 rounded-lg object-contain cursor-pointer" onClick={() => setPreviewModalImg(image)} />
              <button onClick={() => setImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600" title="Remove screenshot">
                <X size={12} />
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider opacity-70">Tag Service:</span>
              <select className={selectField} value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>

              <input type="file" ref={fileInputRef} accept="image/*" onChange={(e) => handleFileChange(e, false)} className="hidden" />
              <button type="button" onClick={() => fileInputRef.current?.click()} className={`text-xs px-3 py-2 rounded-xl border flex items-center gap-1.5 font-medium transition-colors ${image ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' : isDark ? 'border-white/10 hover:bg-white/10 text-slate-300' : 'border-black/10 hover:bg-black/5 text-slate-700'}`}>
                <ImageIcon size={14} /> {image ? 'Screenshot Attached' : 'Attach / Paste Image'}
              </button>
            </div>
            
            <button onClick={add} disabled={!text.trim() && !image} className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 bg-gradient-to-r from-amber-400 to-orange-600 text-white disabled:opacity-40 shrink-0 shadow-md">
              <Plus size={14} /> Add Dev Idea
            </button>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Filter size={14} className="text-amber-500" />
          <span>Filter by Service Tag:</span>
          <select className={selectField} value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
            <option value="all">All Services ({ideas.length})</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {selectedCategory !== 'all' && (
          <button onClick={() => setSelectedCategory('all')} className={`text-xs px-2.5 py-1 rounded-lg border font-semibold ${isDark ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'border-black/10 bg-black/5 hover:bg-black/10'}`}>
            Clear Filter
          </button>
        )}
      </div>

      {/* Waiting Ideas */}
      <div className={panel}>
        <h2 className="text-xs font-black uppercase tracking-wider mb-3">
          Waiting ({open.length}) {selectedCategory !== 'all' && <span className="text-amber-500 font-normal">in {selectedCategory}</span>}
        </h2>
        {open.length ? <div className="flex flex-col gap-2.5">{open.map(renderRow)}</div>
          : <p className={`text-sm text-center py-6 ${muted}`}>No ideas waiting{selectedCategory !== 'all' ? ` for "${selectedCategory}"` : ''}.</p>}
      </div>

      {/* Closed Ideas */}
      {closed.length > 0 && (
        <div className={panel}>
          <button onClick={() => setShowClosed(!showClosed)} className="text-xs font-black uppercase tracking-wider">
            Done and dismissed ({closed.length}) {showClosed ? '▾' : '▸'}
          </button>
          {showClosed && <div className="flex flex-col gap-2 mt-3">{closed.map(renderRow)}</div>}
        </div>
      )}

      {/* Lightbox / Zoom Modal for Screenshots */}
      {previewModalImg && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150" onClick={() => setPreviewModalImg(null)}>
          <div className="relative max-w-5xl max-h-[90vh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <img src={previewModalImg} alt="Enlarged screenshot" className="max-h-[80vh] max-w-full rounded-2xl border border-white/20 shadow-2xl object-contain" />
            <div className="flex items-center gap-3">
              <button onClick={() => copyImageToClipboard(previewModalImg)} className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs flex items-center gap-2 shadow-lg">
                <Copy size={14} /> Copy Image to Clipboard
              </button>
              <button onClick={() => setPreviewModalImg(null)} className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs flex items-center gap-2">
                <X size={14} /> Close
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
}
