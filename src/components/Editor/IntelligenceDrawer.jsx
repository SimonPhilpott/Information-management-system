import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, Save, Trash2, Cpu, Plus, Link as LinkIcon, Info, AlertTriangle, Bold, Italic, List, Heading1, Heading2, CheckCircle2, Zap } from 'lucide-react';
import { ENTITY_TYPES, SCHEMAS } from '../../data/nodes';

const RichTaggingEditor = ({ value, onChange, nodes, onToggleConnection, currentSecondaryLinks = [] }) => {
  const editorRef = useRef(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionPos, setSuggestionPos] = useState({ top: 0, left: 0 });

  const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const toHTML = (text) => {
    if (!text) return '';
    let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, '<br/>');
    const activeTags = [];
    html = html.replace(/\[\[(.*?)\|(.*?)\]\]/g, (match, id, title) => {
      activeTags.push(title);
      const node = nodes.find(n => n.id === id);
      const color = ENTITY_TYPES[node?.type]?.color || '#fff';
      const isConnected = currentSecondaryLinks.includes(id);
      const typeLabel = ENTITY_TYPES[node?.type]?.label || 'Entity';
      return `<span contenteditable="false" data-id="${id}" data-type="${typeLabel}" class="inline-tag active-tag" style="border: 1px solid ${color}88; background: ${color}22; color: ${color}; box-shadow: 0 0 10px ${color}22;">
        ${title}
        <button class="tag-link-btn ${isConnected ? 'active' : ''}" data-id="${id}">
           ${isConnected ? 'Linked' : 'Link'}
        </button>
      </span>`;
    });

    nodes.forEach(node => {
      if (!node.title || activeTags.includes(node.title)) return;
      const escapedTitle = escapeRegExp(node.title);
      const regex = new RegExp(`(?<![\\w\\d])${escapedTitle}(?![\\w\\d])(?![^<]*>)`, 'g');
      const typeLabel = ENTITY_TYPES[node.type]?.label || 'Entity';
      html = html.replace(regex, (match) => {
        return `<span contenteditable="false" data-id="${node.id}" data-type="${typeLabel}" class="inline-tag potential-tag" style="border: 1px dotted rgba(0, 242, 255, 0.4); background: rgba(0, 242, 255, 0.05); color: rgba(255,255,255,0.7); box-shadow: inset 0 0 10px rgba(0,242,255,0.05);">
          ${match}
          <div class="tag-actions">
             <button class="tag-promote-btn" data-id="${node.id}" title="Approve Entity">Promote</button>
             <button class="tag-instant-link-btn" data-id="${node.id}" title="Approve & Link">Connect</button>
          </div>
        </span>`;
      });
    });
    return html;
  };

  const toRawText = (html) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('.active-tag').forEach(tag => {
      const id = tag.getAttribute('data-id');
      const title = tag.firstChild.textContent.trim();
      tag.outerHTML = `[[${id}|${title}]]`;
    });
    div.querySelectorAll('.potential-tag').forEach(tag => {
      const title = tag.firstChild.textContent.trim();
      tag.outerHTML = title;
    });
    return div.innerText || div.textContent || '';
  };

  useEffect(() => {
    if (editorRef.current && (editorRef.current.innerHTML === '' || editorRef.current.innerHTML === '<br>')) {
      editorRef.current.innerHTML = toHTML(value);
    }
  }, [value, currentSecondaryLinks]);

  const handleClick = (e) => {
    const linkBtn = e.target.closest('.tag-link-btn');
    const promoteBtn = e.target.closest('.tag-promote-btn');
    const instantLinkBtn = e.target.closest('.tag-instant-link-btn');

    if (linkBtn) {
       const id = linkBtn.getAttribute('data-id');
       onToggleConnection(id);
       const isNowActive = !linkBtn.classList.contains('active');
       linkBtn.classList.toggle('active', isNowActive);
       linkBtn.textContent = isNowActive ? 'Linked' : 'Link';
    } else if (promoteBtn) {
       const id = promoteBtn.getAttribute('data-id');
       const node = nodes.find(n => n.id === id);
       const raw = toRawText(editorRef.current.innerHTML);
       const newRaw = raw.replace(node.title, `[[${id}|${node.title}]]`);
       onChange(newRaw);
       editorRef.current.innerHTML = toHTML(newRaw);
    } else if (instantLinkBtn) {
       const id = instantLinkBtn.getAttribute('data-id');
       const node = nodes.find(n => n.id === id);
       const raw = toRawText(editorRef.current.innerHTML);
       const newRaw = raw.replace(node.title, `[[${id}|${node.title}]]`);
       onChange(newRaw);
       onToggleConnection(id);
       editorRef.current.innerHTML = toHTML(newRaw);
    }
  };

  const handleInput = () => {
    const html = editorRef.current.innerHTML;
    const raw = toRawText(html);
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const container = range.startContainer;
      const offset = range.startOffset;
      if (container.nodeType === Node.TEXT_NODE) {
        const textBefore = container.textContent.slice(0, offset);
        const words = textBefore.split(/\s/);
        const lastWord = words[words.length - 1];
        if (lastWord.length >= 2) {
          const matches = nodes.filter(n => n.title.toLowerCase().includes(lastWord.toLowerCase())).slice(0, 5);
          if (matches.length > 0) {
            const rect = range.getBoundingClientRect();
            const editorRect = editorRef.current.getBoundingClientRect();
            setSuggestionPos({ top: rect.bottom - editorRect.top + 5, left: rect.left - editorRect.left });
            setSuggestions(matches);
            setShowSuggestions(true);
          } else { setShowSuggestions(false); }
        } else { setShowSuggestions(false); }
      }
    }
    onChange(raw);
  };

  const insertNodeTag = (node) => {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const textNode = range.startContainer;
      const offset = range.startOffset;
      const beforePart = textNode.textContent.slice(0, offset);
      const words = beforePart.split(/\s/);
      words.pop();
      const newBefore = words.join(' ') + (words.length > 0 ? ' ' : '');
      const raw = toRawText(editorRef.current.innerHTML);
      const newRaw = raw.replace(beforePart, newBefore + `[[${node.id}|${node.title}]]`);
      onChange(newRaw);
      editorRef.current.innerHTML = toHTML(newRaw);
      setShowSuggestions(false);
    }
  };

  const exec = (cmd, val = null) => {
    document.execCommand(cmd, false, val);
    editorRef.current.focus();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 bg-black/40 p-2 rounded-xl border border-white/5 shrink-0">
         <button onClick={() => exec('bold')} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-all"><Bold size={14} /></button>
         <button onClick={() => exec('italic')} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-all"><Italic size={14} /></button>
         <div className="w-px h-4 bg-white/10 mx-1" />
         <button onClick={() => exec('formatBlock', 'h3')} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-all"><Heading1 size={14}/></button>
         <button onClick={() => exec('formatBlock', 'h4')} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-all"><Heading2 size={14}/></button>
         <button onClick={() => exec('insertUnorderedList')} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-all"><List size={14} /></button>
      </div>
      <div className="relative">
        <div 
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onClick={handleClick}
          className="rich-editor-content cyber-input min-h-[300px] p-8 border-white/5 bg-white/[0.02] rounded-3xl hover:border-white/10 focus:border-brand-cyan/40 transition-all outline-none text-[13px] leading-relaxed text-slate-300"
          placeholder="Analyze and document intelligence..."
        />
        <AnimatePresence>
          {showSuggestions && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="absolute z-[60000] bg-slate-910/95 backdrop-blur-2xl border border-brand-cyan/20 rounded-2xl shadow-3xl overflow-hidden min-w-[240px]"
              style={{ top: suggestionPos.top, left: suggestionPos.left }}
            >
              <div className="p-3 border-b border-white/5 bg-brand-cyan/5 flex items-center gap-2">
                 <Zap size={10} className="text-brand-cyan" />
                 <span className="text-[9px] font-black uppercase text-brand-cyan tracking-widest">Predictive Entity Match</span>
              </div>
              {suggestions.map(s => (
                <button 
                  key={s.id} 
                  className="w-full p-4 flex items-center gap-3 hover:bg-brand-cyan/10 transition-colors border-b border-white/5 last:border-0 group"
                  onClick={() => insertNodeTag(s)}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ENTITY_TYPES[s.type]?.color }} />
                  <div className="flex flex-col items-start">
                    <span className="text-[11px] font-bold text-white group-hover:text-brand-cyan transition-colors">{s.title}</span>
                    <span className="text-[8px] uppercase tracking-tighter text-slate-500">{ENTITY_TYPES[s.type]?.label}</span>
                  </div>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <style>{`
        .rich-editor-content:empty:before { content: attr(placeholder); color: #475569; font-style: italic; }
        .inline-tag { display: inline-flex; align-items: center; gap: 8px; padding: 4px 10px; border-radius: 8px; margin: 2px 4px; font-weight: 500; font-size: 13px; vertical-align: middle; cursor: default; user-select: none; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        .inline-tag::before { content: attr(data-type) ''; font-weight: 800; text-transform: uppercase; font-size: 8px; opacity: 0.4; border-right: 1px solid currentColor; padding-right: 6px; margin-right: 2px; }
        .tag-link-btn, .tag-promote-btn, .tag-instant-link-btn { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.5); padding: 4px 8px; border-radius: 6px; font-size: 9px; font-weight: 900; text-transform: uppercase; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 4px; }
        .tag-link-btn:hover, .tag-promote-btn:hover, .tag-instant-link-btn:hover { background: rgba(255,255,255,0.1); color: white; border-color: rgba(255,255,255,0.3); }
        .tag-link-btn.active { background: #00f2ff22; color: #00f2ff; border-color: #00f2ff55; box-shadow: 0 0 10px #00f2ff22; }
        .tag-instant-link-btn { border-color: rgba(0,242,255,0.2) !important; color: rgba(0,242,255,0.6); }
        .tag-instant-link-btn:hover { background: rgba(0,242,255,0.1) !important; color: #00f2ff !important; border-color: #00f2ff !important; }
        .tag-actions { display: flex; gap: 4px; }
        .potential-tag { border-style: dotted !important; transition: all 0.3s; }
        .potential-tag:hover { background: rgba(0,242,255,0.1) !important; border-color: #00f2ff55 !important; }
        .rich-editor-content h3 { font-size: 1.5rem; font-weight: 800; margin-top: 1.5rem; color: white; border-left: 4px solid #00f2ff; padding-left: 1rem; margin-bottom: 1rem; }
        .rich-editor-content h4 { font-size: 1.2rem; font-weight: 700; margin-top: 1rem; color: #cbd5e1; margin-bottom: 0.5rem; }
        .rich-editor-content ul { list-style-type: none; margin-left: 1rem; margin-top: 0.5rem; }
        .rich-editor-content ul li:before { content: "•"; color: #00f2ff; font-weight: bold; display: inline-block; width: 1em; margin-left: -1em; }
        .rich-editor-content b { font-weight: 800; color: white; }
        .rich-editor-content i { font-style: italic; opacity: 0.8; }
      `}</style>
    </div>
  );
};

export const IntelligenceDrawer = ({ 
  isOpen, onClose, nodes, editingNode, currentType, setCurrentType, 
  formData, setFormData, onSave, onToggleConnection, onDeleteNode 
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <motion.div 
      initial={{ x: '100%' }} animate={{ x: isOpen ? 0 : '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }} 
      className="fixed top-0 right-0 h-full w-[66vw] bg-[#0c0d12]/98 backdrop-blur-3xl border-l border-white/10 z-[75000] shadow-[-20px_0_60px_rgba(0,0,0,0.8)] flex flex-col"
      onMouseDown={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
       <div className="p-6 border-b border-white/5 flex justify-between items-center shrink-0 bg-black/20">
          <div className="flex flex-col">
             <div className="flex items-center gap-3">
                <Cpu size={18} className="text-brand-cyan" />
                <h2 className="text-xl font-bold italic tracking-tight text-white uppercase opacity-80">Intelligence Review</h2>
             </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white/5 rounded-full text-slate-400 hover:text-white transition-all"><X size={24} /></button>
       </div>
       
       <div className="flex-1 overflow-auto p-8 custom-scrollbar">
          <div className="space-y-10">
             <div className="space-y-3">
                <label className="text-[9px] font-black text-brand-cyan tracking-[0.2em] uppercase flex items-center gap-2">
                   <div className="w-1 h-3 bg-brand-cyan" />
                   Designation
                </label>
                <input 
                   className="cyber-input text-4xl font-black border-white/5 bg-transparent w-full text-white placeholder:text-white/5 outline-none" 
                   value={formData.title} 
                   onChange={(e) => setFormData({ ...formData, title: e.target.value })} 
                   placeholder="Enter designation..."
                />
             </div>
             <div className="space-y-4">
                <label className="text-[9px] font-black text-slate-500 tracking-[0.2em] uppercase flex items-center gap-2">
                   <Info size={10} />
                   Branch Classification
                </label>
                <div className="grid grid-cols-3 gap-3">
                   {Object.entries(ENTITY_TYPES).map(([k,v]) => (
                     <button 
                       key={k} 
                       onClick={() => setCurrentType(k)} 
                       className={`group relative p-4 border-2 rounded-xl flex flex-col gap-2 transition-all text-left ${currentType === k ? 'border-brand-cyan bg-brand-cyan/10' : 'border-white/5 bg-white/[0.01] hover:bg-white/5'}`}
                     >
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: v.color }} />
                          <span className={`text-[10px] font-black uppercase tracking-wider ${currentType === k ? 'text-brand-cyan' : 'text-slate-400 group-hover:text-white'}`}>{v.label}</span>
                        </div>
                        <p className={`text-[10px] text-slate-500 leading-tight`}>{v.description}</p>
                     </button>
                   ))}
                </div>
             </div>
             <div className="space-y-10 pt-10 border-t border-white/5 pb-32">
                <div className="p-5 bg-brand-cyan/5 border border-brand-cyan/10 rounded-2xl flex items-start gap-4 mb-4">
                   <Zap size={18} className="text-brand-cyan shrink-0" />
                   <div className="space-y-1">
                      <span className="text-[10px] font-black text-brand-cyan uppercase tracking-widest">Predictive Tagging Engaged</span>
                      <p className="text-[10px] text-slate-400 italic">Review keywords with <span className="text-brand-cyan font-bold border-b border-dotted border-brand-cyan mx-1">dotted boxes</span> to instantly establish new mesh connections.</p>
                   </div>
                </div>
                {SCHEMAS[currentType]?.map(f => (
                  <div key={f.name} className="space-y-4">
                     <label className="text-[11px] font-black text-slate-400 flex items-center gap-2 uppercase tracking-widest">
                        <ChevronRight size={12} className="text-brand-cyan" />
                        {f.name}
                     </label>
                     <RichTaggingEditor 
                        value={formData.content[f.name] || ''} 
                        onChange={(val) => setFormData(prev => ({
                           ...prev, content: { ...prev.content, [f.name]: val }
                        }))} 
                        nodes={nodes}
                        placeholder={`Document ${f.name} with intelligence...`}
                        onToggleConnection={onToggleConnection}
                        currentSecondaryLinks={editingNode?.secondaryLinks || []}
                     />
                  </div>
                ))}
             </div>
          </div>
       </div>
       <div className="p-10 border-t border-white/10 flex justify-between items-center bg-[#08090d] shrink-0">
          <div className="flex items-center gap-4">
             {editingNode && (
                <div className="relative">
                   <AnimatePresence>
                      {isDeleting && (
                         <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="absolute bottom-full mb-4 left-0 bg-red-600 p-6 rounded-2xl shadow-2xl z-[80000] w-64 border border-white/10">
                           <span className="text-[11px] font-bold text-white block mb-2">Confirm Deletion?</span>
                           <p className="text-[11px] text-white/80 mb-6 leading-relaxed">Moved to Bin, connections archived.</p>
                           <div className="flex gap-4">
                              <button onClick={() => onDeleteNode(editingNode.id)} className="flex-1 py-3 bg-white text-red-600 rounded-lg text-[10px] font-bold">Delete</button>
                              <button onClick={() => setIsDeleting(false)} className="flex-1 py-3 bg-black/20 text-white rounded-lg text-[10px] font-bold">Cancel</button>
                           </div>
                         </motion.div>
                      )}
                   </AnimatePresence>
                   <button onClick={() => setIsDeleting(true)} className="p-5 bg-red-600/10 hover:bg-red-600 border border-red-600/20 text-red-600 hover:text-white rounded-xl transition-all shadow-lg hover:shadow-red-600/40">
                      <Trash2 size={24} />
                   </button>
                </div>
             )}
          </div>
          <button onClick={() => onSave(formData)} disabled={!currentType} className={`px-24 py-5 rounded-xl flex items-center gap-3 font-bold text-[13px] transition-all uppercase tracking-widest ${currentType ? 'bg-brand-cyan text-black shadow-[0_10px_40px_rgba(0,242,255,0.3)]' : 'bg-white/5 text-slate-700'}`}>
             <Save size={16} />
             <span>Commit to Mesh</span>
          </button>
       </div>
    </motion.div>
  );
};
