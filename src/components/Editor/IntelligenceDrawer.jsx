import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, Save, Trash2, Cpu, Plus, Link as LinkIcon, Info, AlertTriangle, Bold, Italic, List, Heading1, Heading2, CheckCircle2, Zap, AlignLeft, AlignCenter, AlignRight, AlignJustify, Shield } from 'lucide-react';
import { ENTITY_TYPES, SCHEMAS } from '../../data/nodes';

/** Importance tier definitions — ordered from highest to lowest priority. */
const IMPORTANCE_TIERS = [
  { id: 1, label: 'Critical',      color: '#FF3B30', description: 'Mission-critical — regulatory, safety, or contractual obligation.' },
  { id: 2, label: 'High',          color: '#FF9500', description: 'Significant business impact — key deliverables and milestones.' },
  { id: 3, label: 'Standard',      color: '#34C759', description: 'Normal priority — standard operating procedures and guidance.' },
  { id: 4, label: 'Low',           color: '#5AC8FA', description: 'Supplementary context — useful but not time-sensitive.' },
  { id: 5, label: 'Informational', color: '#8E8E93', description: 'Reference only — background knowledge and archive material.' },
];

const RichTaggingEditor = ({ value, onChange, nodes, onToggleConnection, currentSecondaryLinks = [], theme = 'dark' }) => {
  const editorRef = useRef(null);
  const containerRef = useRef(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionPos, setSuggestionPos] = useState({ top: 0, left: 0 });
  const isDark = theme !== 'light';

  const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const toHTML = (htmlText) => {
    if (!htmlText) return '';
    
    // Check if the input is HTML or plain text; convert newlines to <br/> for plain text
    const isHTML = /<[a-z][\s\S]*>/i.test(htmlText);
    let formattedText = htmlText;
    if (!isHTML) {
      formattedText = formattedText.replace(/\n/g, '<br/>');
    }

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = formattedText;

    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Collect all active bracket tags to avoid potential double parsing
    const activeTags = [];
    const bracketRegex = /\[\[(.*?)\|(.*?)\]\]/g;
    let match;
    while ((match = bracketRegex.exec(formattedText)) !== null) {
      activeTags.push(match[2]);
    }

    const processTextNode = (textNode) => {
      const text = textNode.textContent;
      if (!text.trim()) return;

      let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      
      html = html.replace(/\[\[(.*?)\|(.*?)\]\]/g, (m, id, title) => {
        const node = nodes.find(n => n.id === id);
        const color = ENTITY_TYPES[node?.type]?.color || '#fff';
        const isConnected = currentSecondaryLinks.includes(id);
        const typeLabel = ENTITY_TYPES[node?.type]?.label || 'Entity';
        return `<span contenteditable="false" data-id="${id}" data-type="${typeLabel}" class="inline-tag active-tag" style="border: 1px solid ${color}88; background: ${color}22; color: ${color}; box-shadow: 0 0 10px ${color}22;">${title}<button class="tag-link-btn ${isConnected ? 'active' : ''}" data-id="${id}">${isConnected ? 'Linked' : 'Link'}</button></span>`;
      });

      nodes.forEach(node => {
        if (!node.title || activeTags.includes(node.title)) return;
        const escapedTitle = escapeRegExp(node.title);
        const regex = new RegExp(`(?<![\\w\\d])${escapedTitle}(?![\\w\\d])`, 'g');
        const typeLabel = ENTITY_TYPES[node.type]?.label || 'Entity';
        const textColor = '#000000';
        const pulseColor = isDark ? 'rgba(0, 242, 255, 0.4)' : 'rgba(8, 145, 178, 0.4)';
        const pulseBg = isDark ? 'rgba(0, 242, 255, 0.05)' : 'rgba(8, 145, 178, 0.05)';
        
        html = html.replace(regex, (matchedWord) => {
          return `<span contenteditable="false" data-id="${node.id}" data-type="${typeLabel}" class="inline-tag potential-tag" style="border: 1px dotted ${pulseColor}; background: ${pulseBg}; color: ${textColor}; box-shadow: inset 0 0 10px ${pulseBg};">${matchedWord}<div class="tag-actions"><button class="tag-promote-btn" data-id="${node.id}" title="Approve Entity">Promote</button><button class="tag-instant-link-btn" data-id="${node.id}" title="Approve & Link">Connect</button></div></span>`;
        });
      });

      if (html !== text) {
        const replacementSpan = document.createElement('span');
        replacementSpan.innerHTML = html;
        textNode.replaceWith(replacementSpan);
      }
    };

    const traverse = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        processTextNode(node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.classList.contains('inline-tag')) return;
        const children = Array.from(node.childNodes);
        children.forEach(child => traverse(child));
      }
    };

    traverse(tempDiv);
    return tempDiv.innerHTML;
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
    return div.innerHTML;
  };

  useEffect(() => {
    if (editorRef.current) {
      const rawEditorText = toRawText(editorRef.current.innerHTML);
      if (rawEditorText !== value) {
        editorRef.current.innerHTML = toHTML(value);
      }
    }
  }, [value, currentSecondaryLinks]);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (showSuggestions && containerRef.current && !containerRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showSuggestions]);

  const handlePaste = (e) => {
    e.preventDefault();
    const clipboardData = e.clipboardData || window.clipboardData;

    // Handle direct image file pastes (e.g. screenshots) only when no rich HTML is available
    const files = clipboardData.files;
    const pastedHTML = clipboardData.getData('text/html');
    const pastedText = clipboardData.getData('text/plain');

    if (files && files.length > 0 && !pastedHTML) {
      for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const imgHtml = `<img src="${event.target.result}" alt="Pasted Image" />`;
            document.execCommand('insertHTML', false, imgHtml);
            handleInput();
          };
          reader.readAsDataURL(files[i]);
          return;
        }
      }
    }

    if (pastedHTML) {
      const allowedTags = [
        'P', 'B', 'STRONG', 'I', 'EM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 
        'UL', 'OL', 'LI', 'IMG', 'SPAN', 'BR', 'FONT', 'A',
        'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD'
      ];

      const sanitize = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          return node.cloneNode(true);
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
          const tagName = node.tagName;
          if (allowedTags.includes(tagName)) {
            const cleanEl = document.createElement(tagName);
            
            // Preserve original inline style attributes (fonts, colors, sizes, etc.),
            // stripping font-size, color, font-family, and background for SPAN, P, FONT tags.
            let style = node.getAttribute('style');
            if (style) {
              if (['SPAN', 'P', 'FONT'].includes(tagName)) {
                const parts = style.split(';');
                const cleanParts = parts.filter(part => {
                  const trimmed = part.trim().toLowerCase();
                  if (!trimmed) return false;
                  return !trimmed.startsWith('font-size') &&
                         !trimmed.startsWith('color') &&
                         !trimmed.startsWith('font-family') &&
                         !trimmed.startsWith('background');
                });
                style = cleanParts.join(';').trim();
              }
              if (style) {
                cleanEl.setAttribute('style', style);
              }
            }

            if (tagName === 'IMG') {
              // Extract the real source from common lazy-loading data attributes first
              let src = node.getAttribute('data-src') || 
                        node.getAttribute('data-image-src') || 
                        node.getAttribute('data-orig-src') || 
                        node.getAttribute('data-display-src') ||
                        node.getAttribute('src');
              const alt = node.getAttribute('alt') || '';
              if (src) {
                // Resolve relative URLs from SharePoint
                if (src.startsWith('/')) {
                  src = 'https://turntown.sharepoint.com' + src;
                } else if (!src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:')) {
                  src = 'https://turntown.sharepoint.com/sites/SV-CAPABILITIES/' + src;
                }
                cleanEl.setAttribute('src', src);
                cleanEl.setAttribute('alt', alt);
              }
            } else if (tagName === 'A') {
              const href = node.getAttribute('href');
              if (href) cleanEl.setAttribute('href', href);
            }

            Array.from(node.childNodes).forEach(child => {
              const cleanChild = sanitize(child);
              if (cleanChild) cleanEl.appendChild(cleanChild);
            });
            return cleanEl;
          } else {
            const fragment = document.createDocumentFragment();
            Array.from(node.childNodes).forEach(child => {
              const cleanChild = sanitize(child);
              if (cleanChild) fragment.appendChild(cleanChild);
            });
            return fragment;
          }
        }
        return null;
      };

      const temp = document.createElement('div');
      temp.innerHTML = pastedHTML;

      const resultFragment = document.createDocumentFragment();
      Array.from(temp.childNodes).forEach(child => {
        const cleanChild = sanitize(child);
        if (cleanChild) resultFragment.appendChild(cleanChild);
      });

      const output = document.createElement('div');
      output.appendChild(resultFragment);

      document.execCommand('insertHTML', false, output.innerHTML);
    } else if (pastedText) {
      document.execCommand('insertText', false, pastedText);
    }
  };

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
      <div className="relative" ref={containerRef}>
        <div 
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onClick={handleClick}
          onPaste={handlePaste}
          className="rich-editor-content cyber-input min-h-[300px] p-6 rounded-[var(--radius-lg)] transition-all outline-none text-[13px] leading-relaxed border border-[var(--glass-border)] bg-white hover:border-[var(--glass-border-hover)] focus:border-[var(--accent-indigo)]/40 text-black"
          placeholder="Analyse and document intelligence..."
        />
        <AnimatePresence>
          {showSuggestions && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="absolute z-[60000] backdrop-blur-2xl border rounded-2xl shadow-3xl overflow-hidden min-w-[240px] bg-[var(--bg-primary)] border-[var(--glass-border)]"
              style={{ top: suggestionPos.top, left: suggestionPos.left }}
            >
              <div className="p-3 border-b flex items-center gap-2 border-[var(--glass-border)] bg-[var(--accent-indigo)]/5 text-[var(--accent-indigo)]">
                 <Zap size={10} className="text-[var(--accent-indigo)]" />
                 <span className="text-[9px] font-semibold tracking-wide">Predictive Entity Match</span>
               </div>
              {suggestions.map(s => (
                <button 
                  key={s.id} 
                  className="w-full p-4 flex items-center gap-3 transition-colors border-b last:border-0 border-[var(--glass-border)] hover:bg-[var(--glass-border)] group"
                  onClick={() => insertNodeTag(s)}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ENTITY_TYPES[s.type]?.color }} />
                  <div className="flex flex-col items-start">
                    <span className="text-[11px] font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-indigo)] transition-colors">{s.title}</span>
                    <span className="text-[8px] tracking-tight text-[var(--text-muted)]">{ENTITY_TYPES[s.type]?.label}</span>
                  </div>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <style>{`
        .rich-editor-content { background-color: #ffffff !important; color: #000000 !important; font-size: 12pt; }
        .rich-editor-content:empty:before { content: attr(placeholder); color: #6e6c68 !important; font-style: italic; opacity: 0.6; }
        .inline-tag { display: inline-flex; align-items: center; gap: 8px; padding: 4px 10px; border-radius: 8px; margin: 2px 4px; font-weight: 500; font-size: 13px; vertical-align: middle; cursor: default; user-select: none; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        .inline-tag::before { content: attr(data-type) ''; font-weight: 800; text-transform: uppercase; font-size: 8px; opacity: 0.6; border-right: 1px solid currentColor; padding-right: 6px; margin-right: 2px; }
        .tag-link-btn, .tag-promote-btn, .tag-instant-link-btn { background: rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.1); color: rgba(0,0,0,0.6); padding: 4px 8px; border-radius: 6px; font-size: 9px; font-weight: 900; text-transform: uppercase; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 4px; }
        .tag-link-btn:hover, .tag-promote-btn:hover, .tag-instant-link-btn:hover { background: rgba(0,0,0,0.1); color: black; border-color: rgba(0,0,0,0.3); }
        .tag-link-btn.active { background: #008fa822; color: #008fa8; border-color: #008fa855; box-shadow: 0 0 10px #008fa822; }
        .tag-instant-link-btn { border-color: rgba(0,143,168,0.2) !important; color: rgba(0,143,168,0.6); }
        .tag-instant-link-btn:hover { background: rgba(0,143,168,0.1) !important; color: #008fa8 !important; border-color: #008fa8 !important; }
        .tag-actions { display: flex; gap: 4px; }
        .potential-tag { border-style: dotted !important; transition: all 0.3s; }
        .potential-tag:hover { background: rgba(0,143,168,0.1) !important; border-color: #008fa855 !important; }
        .rich-editor-content h1 { font-size: 2.2rem; font-weight: 800; margin-top: 2rem; color: #000000; margin-bottom: 1.2rem; }
        .rich-editor-content h2 { font-size: 1.8rem; font-weight: 800; margin-top: 1.8rem; color: #000000; margin-bottom: 1.1rem; }
        .rich-editor-content h3 { font-size: 1.5rem; font-weight: 800; margin-top: 1.5rem; color: #000000; margin-bottom: 1rem; }
        .rich-editor-content h4 { font-size: 1.2rem; font-weight: 700; margin-top: 1rem; color: #1a1713; margin-bottom: 0.5rem; }
        .rich-editor-content h5 { font-size: 1.0rem; font-weight: 700; margin-top: 0.8rem; color: #1a1713; margin-bottom: 0.4rem; }
        .rich-editor-content h6 { font-size: 0.85rem; font-weight: 700; margin-top: 0.6rem; color: #1a1713; margin-bottom: 0.3rem; }
        .rich-editor-content ul { list-style-type: disc !important; margin-left: 1.5rem !important; margin-top: 0.5rem; padding-left: 0 !important; }
        .rich-editor-content ol { list-style-type: decimal !important; margin-left: 1.5rem !important; margin-top: 0.5rem; padding-left: 0 !important; }
        .rich-editor-content li { display: list-item !important; margin-bottom: 0.25rem; }
        .rich-editor-content b { font-weight: 800; color: #000000; }
        .rich-editor-content i { font-style: italic; opacity: 0.8; }
        .rich-editor-content img { max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0; border: 1px solid var(--glass-border); }
        .rich-editor-content table { border-collapse: collapse; width: 100%; margin: 12px 0; }
        .rich-editor-content th, .rich-editor-content td { border: 1px solid var(--glass-border); padding: 8px; text-align: left; }
        .rich-editor-content th { background: var(--bg-secondary); }
      `}</style>
    </div>
  );
};

export const IntelligenceDrawer = ({ 
  isOpen, onClose, nodes, editingNode, currentType, setCurrentType, 
  formData, setFormData, onSave, onToggleConnection, onDeleteNode, theme = 'dark'
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const isDark = theme !== 'light';
  const activeRangeRef = useRef(null);

  const [colorPalette, setColorPalette] = useState([
    '#000000', // Black
    '#1E4479', // Primary Blue
    '#0090DC', // Primary Cyan
    '#505A60', // Primary Grey
    '#00A000', // Secondary Green
    '#D55C17', // Secondary Orange
    '#F2EEE7', // Background Mushroom
    '#FFFFFF'  // Background White
  ]);
  const [customColor, setCustomColor] = useState('#1E4479');

  const [currentFontSize, setCurrentFontSize] = useState('12pt');
  const [currentHeading, setCurrentHeading] = useState('P');

  // Track selection state and computed styles
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      
      const range = selection.getRangeAt(0);
      let node = range.startContainer;
      
      // Traverse up to find if we are inside a rich-editor-content
      let inEditor = false;
      let tempNode = node;
      while (tempNode) {
        if (tempNode.nodeType === Node.ELEMENT_NODE && tempNode.classList.contains('rich-editor-content')) {
          inEditor = true;
          break;
        }
        tempNode = tempNode.parentNode;
      }
      
      if (!inEditor) return;

      // Save non-collapsed range
      if (!range.collapsed) {
        activeRangeRef.current = range.cloneRange();
      }

      const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;
      if (element) {
        const computedStyle = window.getComputedStyle(element);
        const fontSizePx = parseFloat(computedStyle.fontSize);
        // px to pt conversion: pt = px * 0.75
        const fontSizePt = Math.round(fontSizePx * 0.75);
        setCurrentFontSize(`${fontSizePt}pt`);

        // Find heading level (traverse up to find H1-H6)
        let headingTag = 'P';
        let headingNode = element;
        while (headingNode && !headingNode.classList?.contains('rich-editor-content')) {
          const tagName = headingNode.tagName;
          if (tagName && /^H[1-6]$/.test(tagName)) {
            headingTag = tagName;
            break;
          }
          headingNode = headingNode.parentNode;
        }
        setCurrentHeading(headingTag);
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  const exec = (cmd, val = null) => {
    document.execCommand(cmd, false, val);
  };

  const applyFontSize = (ptSize) => {
    const selection = window.getSelection();
    let range = null;
    if (selection && selection.rangeCount > 0) {
      range = selection.getRangeAt(0);
    }
    // Fallback to active selection range cache if focus shift collapsed active select highlight
    if ((!range || range.collapsed) && activeRangeRef.current) {
      range = activeRangeRef.current;
    }
    if (!range || range.collapsed) return;

    const span = document.createElement('span');
    span.style.fontSize = ptSize;
    try {
      span.appendChild(range.extractContents());
      range.insertNode(span);
      selection.removeAllRanges();
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      selection.addRange(newRange);
      activeRangeRef.current = newRange.cloneRange();
    } catch (e) {
      console.error("Failed to apply font size", e);
    }
  };

  const applyHeading = (level) => {
    const selection = window.getSelection();
    let range = null;
    if (selection && selection.rangeCount > 0) {
      range = selection.getRangeAt(0);
    }
    // Fallback to active selection range cache
    if ((!range || range.collapsed) && activeRangeRef.current) {
      range = activeRangeRef.current;
    }
    if (!range || range.collapsed) return;

    if (level === 'P') {
      const contents = range.extractContents();
      const span = document.createElement('span');
      span.appendChild(contents);
      range.insertNode(span);
      selection.removeAllRanges();
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      selection.addRange(newRange);
      activeRangeRef.current = newRange.cloneRange();
      return;
    }

    const headingEl = document.createElement(level);
    try {
      headingEl.appendChild(range.extractContents());
      range.insertNode(headingEl);
      selection.removeAllRanges();
      const newRange = document.createRange();
      newRange.selectNodeContents(headingEl);
      selection.addRange(newRange);
      activeRangeRef.current = newRange.cloneRange();
    } catch (e) {
      console.error("Failed to apply heading style", e);
    }
  };

  return (
    <motion.div 
      initial={{ x: '100%' }} animate={{ x: isOpen ? 0 : '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }} 
      className="fixed top-0 right-0 h-full w-[66vw] transition-colors duration-300 backdrop-blur-3xl z-[75000] flex flex-col bg-[var(--bg-primary)] border-l border-[var(--glass-border)] shadow-[-20px_0_60px_rgba(0,0,0,0.4)]"
      onMouseDown={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
       <div className="p-6 border-b flex justify-between items-center shrink-0 border-[var(--glass-border)] bg-[var(--bg-secondary)]/30 transition-colors duration-300">
          <div className="flex flex-col">
             <div className="flex items-center gap-3">
                <Cpu size={18} className="text-[var(--accent-indigo)]" />
                <h2 className="text-[20px] font-semibold text-[var(--text-primary)] transition-colors duration-300">Intelligence Review</h2>
             </div>
          </div>
          <button onClick={onClose} className="p-2.5 rounded-full transition-all hover:bg-[var(--glass-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={22} /></button>
       </div>
       
       <div className="flex-1 overflow-auto custom-scrollbar relative flex flex-col">
            {/* Sticky Unified Formatting Toolbar */}
            <div 
              className="sticky top-0 z-50 px-8 py-3 bg-[var(--bg-secondary)] border-b border-[var(--glass-border)] flex flex-wrap items-center gap-3 transition-colors duration-300 shadow-sm"
              style={{ backdropFilter: 'blur(20px)' }}
            >
               {/* Bold & Italic */}
               <div className="flex items-center gap-1 p-1 bg-black/10 rounded-lg border border-[var(--glass-border)]">
                  <button 
                    onMouseDown={(e) => { e.preventDefault(); exec('bold'); }}
                    className="p-1.5 rounded hover:bg-black/15 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all"
                    title="Bold"
                  >
                    <Bold size={13} />
                  </button>
                  <button 
                    onMouseDown={(e) => { e.preventDefault(); exec('italic'); }}
                    className="p-1.5 rounded hover:bg-black/15 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all"
                    title="Italic"
                  >
                    <Italic size={13} />
                  </button>
               </div>

               {/* Font Size selector */}
               <div className="flex items-center gap-1 p-1 bg-black/10 rounded-lg border border-[var(--glass-border)]">
                  <input 
                    type="text"
                    list="font-sizes"
                    value={currentFontSize}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCurrentFontSize(val);
                      applyFontSize(val);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="bg-transparent text-xs text-[var(--text-primary)] outline-none border-none py-1 px-1.5 w-[60px] text-center"
                    placeholder="11pt"
                  />
                  <datalist id="font-sizes">
                    <option value="8pt" />
                    <option value="9pt" />
                    <option value="10pt" />
                    <option value="11pt" />
                    <option value="12pt" />
                    <option value="14pt" />
                    <option value="16pt" />
                    <option value="18pt" />
                    <option value="20pt" />
                    <option value="24pt" />
                    <option value="30pt" />
                    <option value="36pt" />
                  </datalist>
               </div>

               {/* Headings & Lists */}
               <div className="flex items-center gap-1 p-1 bg-black/10 rounded-lg border border-[var(--glass-border)]">
                  <select
                    value={currentHeading}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCurrentHeading(val);
                      applyHeading(val);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="bg-transparent text-xs text-[var(--text-primary)] outline-none border-none py-1 px-1.5 cursor-pointer"
                  >
                    <option value="P" className="text-black">Normal</option>
                    <option value="H1" className="text-black">H1</option>
                    <option value="H2" className="text-black">H2</option>
                    <option value="H3" className="text-black">H3</option>
                    <option value="H4" className="text-black">H4</option>
                    <option value="H5" className="text-black">H5</option>
                    <option value="H6" className="text-black">H6</option>
                  </select>
                  <div className="w-px h-4 bg-[var(--glass-border)] mx-0.5" />
                  <button 
                    onMouseDown={(e) => { e.preventDefault(); exec('insertUnorderedList'); }}
                    className="p-1.5 rounded hover:bg-black/15 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all"
                    title="Bullet List"
                  >
                    <List size={13} />
                  </button>
               </div>

               {/* Color Palette & Custom Color Builder */}
               <div className="flex items-center gap-2 p-1 bg-black/10 rounded-lg border border-[var(--glass-border)]">
                  <div className="flex items-center gap-1 overflow-x-auto max-w-[180px] scrollbar-none pr-1">
                     {colorPalette.map((color, i) => (
                       <button
                         key={i}
                         onMouseDown={(e) => { e.preventDefault(); exec('foreColor', color); }}
                         className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0 hover:scale-110 active:scale-95 transition-all"
                         style={{ backgroundColor: color }}
                         title={color}
                       />
                     ))}
                  </div>
                  <div className="w-px h-4 bg-[var(--glass-border)]" />
                  <div 
                    className="relative w-5 h-5 rounded-full overflow-hidden border border-white/20 hover:scale-110 active:scale-95 transition-all cursor-pointer"
                    style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
                    title="Select Custom Color"
                  >
                     <input 
                       type="color" 
                       value={customColor}
                       onChange={(e) => {
                         const selected = e.target.value;
                         setCustomColor(selected);
                         if (!colorPalette.includes(selected)) {
                           setColorPalette([...colorPalette, selected]);
                         }
                         exec('foreColor', selected);
                       }}
                       className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                     />
                  </div>
               </div>
            </div>

           <div className="p-8 space-y-10 flex-1">
             <div className="space-y-3.5">
                <label className="text-xs font-semibold flex items-center gap-2 text-[var(--accent-indigo)] transition-colors duration-300">
                   <div className="w-1 h-3.5 bg-[var(--accent-indigo)] rounded-full" />
                   Designation
                </label>
                <input 
                   className="cyber-input text-[28px] font-medium bg-transparent w-full outline-none transition-colors duration-300 border-[var(--glass-border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/20 tracking-tight" 
                   value={formData.title} 
                   onChange={(e) => setFormData({ ...formData, title: e.target.value })} 
                   placeholder="Enter designation..."
                />
             </div>
             <div className="space-y-4">
                <label className="text-xs font-semibold flex items-center gap-2 text-[var(--text-muted)] transition-colors duration-300">
                   <Info size={12} />
                   Branch Classification
                </label>
                <div className="grid grid-cols-3 gap-3">
                   {Object.entries(ENTITY_TYPES).map(([k,v]) => {
                     const isActive = currentType === k;
                     const style = isActive ? {
                       borderColor: v.color,
                       backgroundColor: `${v.color}15`,
                       boxShadow: `0 0 20px ${v.color}25`
                     } : {
                       borderColor: 'var(--glass-border)',
                       backgroundColor: 'var(--bg-secondary)'
                     };
                     
                     return (
                       <button 
                         key={k} 
                         onClick={() => setCurrentType(k)} 
                         style={style}
                         className="group relative p-4 border-2 rounded-[var(--radius-lg)] flex flex-col gap-2 transition-all text-left"
                       >
                          <div className="flex items-center gap-2">
                             <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: v.color }} />
                             <span 
                               className="text-xs font-semibold transition-colors" 
                               style={{ color: v.color }}
                             >
                               {v.label}
                             </span>
                          </div>
                          <p className="text-[11px] leading-snug text-[var(--text-secondary)] transition-colors">{v.description}</p>
                       </button>
                     );
                   })}
                </div>
             </div>
             {/* ── Importance Tier Selector ── */}
             <div className="space-y-4 pt-6">
                <label className="text-xs font-semibold flex items-center gap-2 text-[var(--text-muted)] transition-colors duration-300">
                   <Shield size={12} />
                   Importance Tier
                </label>
                <div className="flex gap-2">
                   {IMPORTANCE_TIERS.map(tier => {
                     const isActive = (formData.tier || 3) === tier.id;
                     return (
                       <button
                         key={tier.id}
                         onClick={() => setFormData({ ...formData, tier: tier.id })}
                         className="group relative flex-1 py-2.5 px-2 rounded-[var(--radius-lg)] border-2 flex flex-col items-center gap-1.5 transition-all text-center"
                         style={isActive ? {
                           borderColor: tier.color,
                           backgroundColor: `${tier.color}15`,
                           boxShadow: `0 0 16px ${tier.color}20`
                         } : {
                           borderColor: 'var(--glass-border)',
                           backgroundColor: 'var(--bg-secondary)'
                         }}
                         title={tier.description}
                       >
                         <div
                           className="w-2 h-2 rounded-full transition-all"
                           style={{ backgroundColor: tier.color, opacity: isActive ? 1 : 0.4 }}
                         />
                         <span
                           className="text-[10px] font-bold uppercase tracking-wide transition-colors"
                           style={{ color: isActive ? tier.color : 'var(--text-muted)' }}
                         >
                           {tier.label}
                         </span>
                         <span className="text-[8px] font-mono opacity-60" style={{ color: isActive ? tier.color : 'var(--text-muted)' }}>
                           T{tier.id}
                         </span>
                       </button>
                     );
                   })}
                </div>
                <p className="text-[10px] italic text-[var(--text-muted)] leading-snug">
                  {IMPORTANCE_TIERS.find(t => t.id === (formData.tier || 3))?.description}
                </p>
             </div>
             <div className="space-y-10 pt-10 border-t border-[var(--glass-border)] pb-32 transition-colors duration-300">
                <div className="p-5 rounded-2xl flex items-start gap-4 mb-4 border transition-all bg-[var(--accent-indigo)]/5 border-[var(--accent-indigo)]/10">
                   <Zap size={18} className="shrink-0 text-[var(--accent-indigo)]" />
                   <div className="space-y-1">
                      <span className="text-xs font-semibold text-[var(--accent-indigo)]">Predictive Tagging Engaged</span>
                      <p className="text-[11px] italic text-[var(--text-secondary)] transition-colors duration-300">Review keywords with <span className="font-semibold border border-dotted px-1.5 py-0.5 rounded mx-1 text-[var(--accent-indigo)] border-[var(--accent-indigo)] bg-[var(--accent-indigo)]/5">dotted boxes</span> to instantly establish new graph connections.</p>
                   </div>
                </div>
                {SCHEMAS[currentType]?.map(f => (
                  <div key={f.name} className="space-y-4">
                     <label className="text-[13px] font-semibold flex items-center gap-2 text-[var(--text-secondary)] transition-colors duration-300">
                        <ChevronRight size={12} className="text-[var(--accent-indigo)]" />
                        {f.name}
                     </label>
                     <RichTaggingEditor 
                        value={formData.content[f.name] || ''} 
                        onChange={(val) => setFormData(prev => ({
                           ...prev, content: { ...prev.content, [f.name]: val }
                        }))} 
                        nodes={nodes}
                        theme={theme}
                        placeholder={`Document ${f.name} with intelligence...`}
                        onToggleConnection={onToggleConnection}
                        currentSecondaryLinks={editingNode?.secondaryLinks || []}
                     />
                  </div>
                ))}
             </div>
          </div>
       </div>
       <div className="py-4 px-6 border-t flex justify-between items-center shrink-0 border-[var(--glass-border)] bg-[var(--bg-secondary)] transition-colors duration-300">
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
                   <button onClick={() => setIsDeleting(true)} className="p-4 bg-red-600/10 hover:bg-red-600 border border-red-600/20 text-red-600 hover:text-white rounded-xl transition-all shadow-md hover:shadow-red-600/20">
                      <Trash2 size={20} />
                   </button>
                </div>
             )}
          </div>
          <button onClick={() => onSave(formData)} disabled={!currentType} className={`px-16 py-3.5 rounded-[var(--radius-lg)] flex items-center gap-2.5 font-semibold text-xs transition-all tracking-normal ${currentType ? 'bg-[var(--gradient-primary)] text-white shadow-[var(--shadow-glow)] border-none' : 'bg-[var(--glass-border)] text-[var(--text-muted)]/30'}`}>
             <Save size={14} />
             <span>Commit to Graph</span>
          </button>
       </div>
    </motion.div>
  );
};
