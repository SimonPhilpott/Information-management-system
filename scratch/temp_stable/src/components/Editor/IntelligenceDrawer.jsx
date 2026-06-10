import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, Save, Trash2, Cpu, Plus, Link as LinkIcon, Info, AlertTriangle, Bold, Italic, List, Heading1, Heading2 } from 'lucide-react';
import { ENTITY_TYPES, SCHEMAS } from '../../data/nodes';

const RichTaggingEditor = ({ value, onChange, nodes, onToggleConnection, currentSecondaryLinks = [] }) => {
  const editorRef = useRef(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionPos, setSuggestionPos] = useState({ top: 0, left: 0 });

  // Convert current text value (with [[id|title]] tags) to HTML for contentEditable
  const toHTML = (text) => {
    if (!text) return '';
    
    // First, escape characters
    let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, '<br/>');
    
    // 1. First Pass: Handle explicit tags [[id|title]]
    const activeTags = [];
    html = html.replace(/\[\[(.*?)\|(.*?)\]\]/g, (match, id, title) => {
      activeTags.push(title);
      const node = nodes.find(n => n.id === id);
      const color = ENTITY_TYPES[node?.type]?.color || '#fff';
      const isConnected = currentSecondaryLinks.includes(id);
      
      const typeLabel = ENTITY_TYPES[node?.type]?.label || 'Entity';
      
      return `<span contenteditable="false" data-id="${id}" data-type="${typeLabel}" class="inline-tag active-tag" style="border: 1px solid ${color}44; background: ${color}11; color: ${color};">
        ${title}
        <button class="tag-link-btn ${isConnected ? 'active' : ''}" data-id="${id}">
           ${isConnected ? 'Linked' : 'Link'}
        </button>
      </span>`;
    });

    // 2. Second Pass: Scan for potential node titles (Pasted content intelligence)
    // We only scan if not already part of an active tag
    nodes.forEach(node => {
      if (activeTags.includes(node.title)) return;
      
      // Use a regex to find the title as a whole word, but avoid replacing inside existing HTML tags
      // This is a simplified version; for complex cases we'd need a proper DOM parser
      const regex = new RegExp(`(?<![\\w\\d])${node.title}(?![\\w\\d])(?![^<]*>)`, 'g');
      const typeLabel = ENTITY_TYPES[node.type]?.label || 'Entity';
      html = html.replace(regex, (match) => {
        return `<span contenteditable="false" data-id="${node.id}" data-type="${typeLabel}" class="inline-tag potential-tag" style="border: 1px dotted rgba(255,255,255,0.3); background: rgba(255,255,255,0.02); color: rgba(255,255,255,0.4);">
          ${match}
          <button class="tag-promote-btn" data-id="${node.id}"><Plus size="10" /></button>
        </span>`;
      });
    });

    return html;
  };

  const toRawText = (html) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    
    // Convert active tags back
    const activeTags = div.querySelectorAll('.active-tag');
    activeTags.forEach(tag => {
      const id = tag.getAttribute('data-id');
      const title = tag.firstChild.textContent.trim();
      tag.outerHTML = `[[${id}|${title}]]`;
    });

    // Convert potential tags back to raw text (strip the span)
    const potentialTags = div.querySelectorAll('.potential-tag');
    potentialTags.forEach(tag => {
      const title = tag.firstChild.textContent.trim();
      tag.outerHTML = title;
    });

    return div.innerText || div.textContent || '';
  };

  useEffect(() => {
    if (editorRef.current && (editorRef.current.innerHTML === '' || editorRef.current.innerHTML === '<br>')) {
      editorRef.current.innerHTML = toHTML(value);
    }
  }, [value]);

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
      const text = textNode.textContent;
      const beforePart = text.slice(0, offset);
      const words = beforePart.split(/\s/);
      words.pop();
      const newBefore = words.join(' ') + (words.length > 0 ? ' ' : '');
      
      const typeLabel = ENTITY_TYPES[node.type]?.label || 'Entity';
      const color = ENTITY_TYPES[node.type]?.color || '#fff';
      const tagHtml = `<span contenteditable="false" data-id="${node.id}" data-type="${typeLabel}" class="inline-tag active-tag" style="border: 1px solid ${color}44; background: ${color}11; color: ${color};">${node.title}<button class="tag-link-btn" data-id="${node.id}">Link</button></span> `;
      
      const fragment = range.createContextualFragment(tagHtml);
      textNode.textContent = newBefore;
      range.setStartAfter(textNode);
      range.collapse(true);
      range.insertNode(fragment);
      
      setShowSuggestions(false);
      handleInput();
    }
  };

  const exec = (cmd, val = null) => {
    document.execCommand(cmd, false, val);
    editorRef.current.focus();
  };

  const handleClick = (e) => {
    const linkBtn = e.target.closest('.tag-link-btn');
    const promoteBtn = e.target.closest('.tag-promote-btn');

    if (linkBtn) {
       const id = linkBtn.getAttribute('data-id');
       onToggleConnection(id);
       linkBtn.classList.toggle('active');
       linkBtn.textContent = linkBtn.classList.contains('active') ? 'Linked' : 'Link';
       handleInput();
    } else if (promoteBtn) {
       const id = promoteBtn.getAttribute('data-id');
       // Convert potential tag to active tag by updating raw value
       const node = nodes.find(n => n.id === id);
       const raw = toRawText(editorRef.current.innerHTML);
       const newRaw = raw.replace(node.title, `[[${id}|${node.title}]]`);
       onChange(newRaw);
       // The toHTML effect will re-render it as an active tag
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 bg-white/5 p-1.5 rounded-xl border border-white/10 shrink-0">
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
          className="rich-editor-content cyber-input min-h-[200px] p-6 border-white/5 bg-white/5 rounded-2xl hover:border-white/10 focus:border-brand-cyan/40 transition-all outline-none text-[13px] leading-relaxed text-slate-300"
          placeholder="Start typing..."
        />

        <AnimatePresence>
          {showSuggestions && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="absolute z-[60000] bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden min-w-[200px]"
              style={{ top: suggestionPos.top, left: suggestionPos.left }}
            >
              {suggestions.map(s => (
                <button 
                  key={s.id} 
                  className="w-full p-4 flex items-center gap-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                  onClick={() => insertNodeTag(s)}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ENTITY_TYPES[s.type]?.color }} />
                  <span className="text-[11px] font-bold text-white text-left">{s.title}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      <style>{`
        .rich-editor-content:empty:before { content: attr(placeholder); color: #475569; font-style: italic; }
        .inline-tag { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 6px; margin: 0 2px; font-weight: 500; font-size: 12px; vertical-align: middle; cursor: default; user-select: none; }
        .inline-tag::before { content: attr(data-type) ': '; font-weight: 800; text-transform: uppercase; font-size: 8px; opacity: 0.5; margin-right: 4px; }
        .tag-link-btn, .tag-promote-btn { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.4); padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 900; text-transform: uppercase; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 4px; }
        .tag-link-btn:hover, .tag-promote-btn:hover { background: rgba(255,255,255,0.1); color: white; }
        .tag-link-btn.active { background: #00f2ff22; color: #00f2ff; border-color: #00f2ff44; }
        .rich-editor-content h3 { font-size: 1.25rem; font-weight: 800; margin-top: 1rem; color: white; }
        .rich-editor-content h4 { font-size: 1.1rem; font-weight: 700; margin-top: 0.8rem; color: #cbd5e1; }
        .rich-editor-content ul { list-style-type: disc; margin-left: 1.5rem; margin-top: 0.5rem; }
        .rich-editor-content b { font-weight: 800; color: white; }
        .rich-editor-content i { font-style: italic; opacity: 0.8; }
        .potential-tag { border-style: dotted !important; transition: all 0.3s; }
        .potential-tag:hover { background: rgba(255,255,255,0.05) !important; color: white !important; }
      `}</style>
    </div>
  );
};

export const IntelligenceDrawer = ({ 
  isOpen, 
  onClose, 
  nodes,
  editingNode, 
  currentType, 
  setCurrentType, 
  formData, 
  setFormData, 
  onSave,
  onToggleConnection,
  onDeleteNode
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleFieldChange = (fieldName, value) => {
    setFormData({ ...formData, content: { ...formData.content, [fieldName]: value } });
  };

  return (
    <motion.div 
      initial={{ x: '100%' }} animate={{ x: isOpen ? 0 : '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }} 
      className="fixed top-0 right-0 h-full w-[750px] bg-[#0c0d12]/98 backdrop-blur-3xl border-l border-white/10 z-[50000] shadow-[-20px_0_60px_rgba(0,0,0,0.8)] flex flex-col"
    >
       <div className="p-10 border-b border-white/5 flex justify-between items-center shrink-0 bg-black/20">
          <div className="flex flex-col">
             <div className="flex items-center gap-3">
                <Cpu size={18} className="text-brand-cyan" />
                <h2 className="text-2xl font-bold italic tracking-tight text-white">Knowledge node summary</h2>
             </div>
          </div>
          <button onClick={onClose} className="p-4 hover:bg-white/5 rounded-full text-slate-400 hover:text-white transition-all"><X size={32} /></button>
       </div>
       
       <div className="flex-1 overflow-auto p-12 custom-scrollbar">
          <div className="space-y-12">
             <div className="space-y-4">
                <label className="text-[10px] font-bold text-brand-cyan tracking-wider flex items-center gap-2">
                  <div className="w-1 h-3 bg-brand-cyan" />
                  Architectural Label
                </label>
                <input 
                   className="cyber-input text-3xl font-bold border-white/5 italic bg-transparent w-full text-white placeholder:text-white/10" 
                   value={formData.title} 
                   onChange={(e) => setFormData({ ...formData, title: e.target.value })} 
                   placeholder="Enter designation..."
                />
             </div>
             
             <div className="space-y-6">
                <label className="text-[10px] font-bold text-slate-500 tracking-wider flex items-center gap-2">
                   <Info size={10} />
                   Select Entity Classification
                </label>
                <div className="grid grid-cols-2 gap-4">
                   {Object.entries(ENTITY_TYPES).map(([k,v]) => (
                     <button 
                       key={k} 
                       onClick={() => setCurrentType(k)} 
                       className={`group relative p-6 border-2 rounded-2xl flex flex-col gap-3 transition-all text-left ${currentType === k ? 'border-brand-cyan bg-brand-cyan/10' : 'border-white/5 bg-white/[0.02] hover:bg-white/5'}`}
                     >
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: v.color, color: v.color }} />
                          <span className={`text-[11px] font-bold ${currentType === k ? 'text-brand-cyan' : 'text-slate-400 group-hover:text-white'}`}>{v.label}</span>
                        </div>
                        <p className={`text-[11px] text-slate-500 leading-tight transition-opacity`}>
                          {v.description}
                        </p>
                     </button>
                   ))}
                </div>
             </div>
             
             <AnimatePresence>
              {currentType ? (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-10 pt-12 border-t border-white/5">
                   <label className="text-[10px] font-bold text-white/40 tracking-widest block mb-4 italic">Metadata Relational Fabric</label>
                   {SCHEMAS[currentType]?.map(f => (
                     <div key={f.name} className="space-y-4">
                        <label className="text-[11px] font-bold text-slate-400 flex items-center gap-2">
                           <ChevronRight size={12} className="text-brand-cyan" />
                           {f.name}
                        </label>
                        <RichTaggingEditor 
                          value={formData.content?.[f.name] || ''} 
                          onChange={(val) => handleFieldChange(f.name, val)}
                          nodes={nodes}
                          onToggleConnection={onToggleConnection}
                          currentSecondaryLinks={editingNode?.secondaryLinks || []}
                        />
                     </div>
                   ))}
                </motion.div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-3xl text-slate-500">
                   <Cpu size={48} className="mb-4 opacity-20" />
                   <p className="text-[11px] font-bold italic tracking-wider">Awaiting Entity Classification...</p>
                </div>
              )}
             </AnimatePresence>
          </div>
       </div>
       
       <div className="p-10 border-t border-white/10 flex justify-between items-center bg-[#08090d]">
          <div className="flex items-center gap-4">
             {editingNode && (
               <div className="relative">
                  <AnimatePresence>
                     {isDeleting && (
                        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="absolute bottom-full mb-4 left-0 bg-red-600 p-6 rounded-2xl shadow-2xl z-50 w-64 border border-white/10">
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
          <button onClick={() => onSave(formData)} disabled={!currentType} className={`px-24 py-5 rounded-xl flex items-center gap-3 font-bold text-[13px] transition-all ${currentType ? 'bg-brand-cyan text-black shadow-[0_10px_40px_rgba(0,242,255,0.3)]' : 'bg-white/5 text-slate-700'}`}>
             <Save size={16} />
             <span>Integrate to Mesh</span>
          </button>
       </div>
    </motion.div>
  );
};
