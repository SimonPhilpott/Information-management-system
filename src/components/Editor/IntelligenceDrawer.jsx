import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, Save, Trash2, Cpu, Plus, Link as LinkIcon, Info, AlertTriangle, Bold, Italic, List, Heading1, Heading2, CheckCircle2, Zap, AlignLeft, AlignCenter, AlignRight, AlignJustify, Shield } from 'lucide-react';
import { ENTITY_TYPES, SCHEMAS } from '../../data/nodes';

export const IMPORTANCE_TIERS = [
  { 
    id: 1, 
    label: 'Tier 1: Critical',      
    color: '#FF3B30', 
    description: 'Non-negotiable requirements: Essential standards, safety codes, and mandatory regulatory limits.',
    mappingTitle: 'Safety and Regulatory Standards',
    mappingSummary: 'Inviolable compliance thresholds, safety instructions, or legally binding conditions.',
    aiUtility: 'Highest utility context. Ensures answer compliance with safety and legal regulations first.'
  },
  { 
    id: 2, 
    label: 'Tier 2: High',          
    color: '#FF9500', 
    description: 'Primary methodologies: Core business models, standard templates, and primary delivery methods.',
    mappingTitle: 'Core Delivery Models',
    mappingSummary: 'Key frameworks, core delivery models, and essential operating workflows.',
    aiUtility: 'Primary instruction context. Shapes response structure around main templates and blueprints.'
  },
  { 
    id: 3, 
    label: 'Tier 3: Standard',      
    color: '#34C759', 
    description: 'Operating procedures: Standard day-to-day procedures, general guides, and common steps.',
    mappingTitle: 'Standard Workflows',
    mappingSummary: 'Standard workflows, common procedures, and day-to-day execution guidelines.',
    aiUtility: 'Standard execution context. Provides typical procedures and steps for regular tasks.'
  },
  { 
    id: 4, 
    label: 'Tier 4: Low',           
    color: '#5AC8FA', 
    description: 'Background guides: Helpful context, secondary advice, and optional templates.',
    mappingTitle: 'Contextual Guides and Tips',
    mappingSummary: 'Helpful hints, secondary guides, and optional templates for additional detail.',
    aiUtility: 'Supplementary context. Offers useful but optional instructions to enrich the final output.'
  },
  { 
    id: 5, 
    label: 'Tier 5: Informational', 
    color: '#8E8E93', 
    description: 'General knowledge: Archives, past case studies, and general background information.',
    mappingTitle: 'Reference Materials and Archives',
    mappingSummary: 'Archived studies, general background information, and legacy reference sheets.',
    aiUtility: 'Lowest utility context. Feeds historical examples and background details if relevant.'
  },
];

export const RichTaggingEditor = ({ value, onChange, nodes, onToggleConnection, currentSecondaryLinks = [], theme = 'dark', placeholder = "Analyse and document intelligence...", ignoredNodeIds = [] }) => {
  const editorRef = useRef(null);
  const containerRef = useRef(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionPos, setSuggestionPos] = useState({ top: 0, left: 0 });
  const [isReadMode, setIsReadMode] = useState(false);
  const isDark = theme !== 'light';
  const prevIsReadMode = useRef(isReadMode);
  const isLocalChange = useRef(false);

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

    const activeTags = [];
    const bracketRegex = /\[\[(.*?)\|(.*?)\]\]/g;
    let match;
    while ((match = bracketRegex.exec(formattedText)) !== null) {
      activeTags.push(match[2]);
    }

    const processTextNode = (textNode) => {
      const text = textNode.textContent;
      if (!text.trim()) return;

      // 1. Process active bracket tags [[id|title]] first
      const bracketMatch = /\[\[(.*?)\|(.*?)\]\]/.exec(text);
      if (bracketMatch) {
        const start = bracketMatch.index;
        const end = start + bracketMatch[0].length;
        const id = bracketMatch[1];
        const title = bracketMatch[2];

        const beforeText = text.slice(0, start);
        const afterText = text.slice(end);

        const node = nodes.find(n => n.id === id);
        const color = ENTITY_TYPES[node?.type]?.color || '#fff';
        const isConnected = currentSecondaryLinks.includes(id);
        const typeLabel = ENTITY_TYPES[node?.type]?.label || 'Entity';

        const activeSpan = document.createElement('span');
        activeSpan.contentEditable = 'false';
        activeSpan.className = 'inline-tag active-tag';
        activeSpan.setAttribute('data-id', id);
        activeSpan.setAttribute('data-type', typeLabel);
        activeSpan.style.border = `1px solid ${color}88`;
        activeSpan.style.background = `${color}22`;
        activeSpan.style.color = color;
        activeSpan.style.boxShadow = `0 0 10px ${color}22`;
        activeSpan.innerHTML = `${title}<button class="tag-link-btn ${isConnected ? 'active' : ''}" data-id="${id}">${isConnected ? 'Linked' : 'Link'}</button>`;

        const nodesToInsert = [];
        if (beforeText) nodesToInsert.push(document.createTextNode(beforeText));
        nodesToInsert.push(activeSpan);
        if (afterText) nodesToInsert.push(document.createTextNode(afterText));

        textNode.replaceWith(...nodesToInsert);

        // Recursively process the split text nodes
        nodesToInsert.forEach(n => {
          if (n.nodeType === Node.TEXT_NODE) {
            processTextNode(n);
          }
        });
        return;
      }

      // 2. Find the earliest potential keyword match
      let bestMatch = null;

      nodes.forEach(node => {
        if (!node.title || activeTags.includes(node.title) || ignoredNodeIds.includes(node.id)) return;
        
        const escapedTitle = escapeRegExp(node.title);
        const regex = new RegExp(`(?<![\\w\\d])${escapedTitle}(?![\\w\\d])`, 'i');
        const m = regex.exec(text);
        
        if (m) {
          const start = m.index;
          const end = start + m[0].length;
          
          if (!bestMatch || start < bestMatch.start || (start === bestMatch.start && node.title.length > bestMatch.node.title.length)) {
            bestMatch = { start, end, node, matchedText: m[0] };
          }
        }
      });

      if (bestMatch) {
        const beforeText = text.slice(0, bestMatch.start);
        const afterText = text.slice(bestMatch.end);

        const typeLabel = ENTITY_TYPES[bestMatch.node.type]?.label || 'Entity';
        const textColor = '#000000';
        const pulseColor = 'rgba(217, 119, 6, 0.45)';
        const pulseBg = 'rgba(245, 158, 11, 0.12)';

        const potentialSpan = document.createElement('span');
        potentialSpan.contentEditable = 'false';
        potentialSpan.className = 'inline-tag potential-tag';
        potentialSpan.setAttribute('data-id', bestMatch.node.id);
        potentialSpan.setAttribute('data-type', typeLabel);
        potentialSpan.style.border = `1.5px dashed ${pulseColor}`;
        potentialSpan.style.background = pulseBg;
        potentialSpan.style.color = textColor;
        potentialSpan.style.boxShadow = `inset 0 0 8px rgba(245, 158, 11, 0.05)`;
        potentialSpan.innerHTML = `${bestMatch.matchedText}<div class="tag-actions"><button class="tag-promote-btn" data-id="${bestMatch.node.id}" title="Approve Entity">Promote</button><button class="tag-instant-link-btn" data-id="${bestMatch.node.id}" title="Approve & Link">Connect</button></div>`;

        const nodesToInsert = [];
        if (beforeText) nodesToInsert.push(document.createTextNode(beforeText));
        nodesToInsert.push(potentialSpan);
        if (afterText) nodesToInsert.push(document.createTextNode(afterText));

        textNode.replaceWith(...nodesToInsert);

        // Recursively process the split text nodes
        nodesToInsert.forEach(n => {
          if (n.nodeType === Node.TEXT_NODE) {
            processTextNode(n);
          }
        });
      }
    };

    const textNodes = [];
    const collectTextNodes = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        textNodes.push(node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.classList.contains('inline-tag')) return;
        node.childNodes.forEach(collectTextNodes);
      }
    };

    collectTextNodes(tempDiv);
    textNodes.forEach(processTextNode);

    return tempDiv.innerHTML;
  };

  const toReadHTML = (rawText) => {
    if (!rawText) return '';
    const isHTML = /<[a-z][\s\S]*>/i.test(rawText);
    let formattedText = rawText;
    if (!isHTML) {
      formattedText = formattedText.replace(/\n/g, '<br/>');
    }

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = formattedText;

    const processTextNode = (textNode) => {
      const text = textNode.textContent;
      if (!text.trim()) return;

      let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      
      html = html.replace(/\[\[(.*?)\|(.*?)\]\]/g, (m, id, title) => {
        const isConnected = currentSecondaryLinks.includes(id);
        if (isConnected) {
          const node = nodes.find(n => n.id === id);
          const color = ENTITY_TYPES[node?.type]?.color || '#3b82f6';
          return `<a href="#node-${id}" class="read-anchor-tag" style="color: ${color}; text-decoration: underline; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s;" onclick="event.preventDefault(); window.dispatchEvent(new CustomEvent('select-node', { detail: '${id}' }));">${title}</a>`;
        } else {
          return title;
        }
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
        if (node.classList.contains('read-anchor-tag')) return;
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
      if (isReadMode) {
        editorRef.current.innerHTML = toReadHTML(value);
      } else {
        if (isLocalChange.current) {
          isLocalChange.current = false;
        } else {
          editorRef.current.innerHTML = toHTML(value);
        }
      }
    }
    prevIsReadMode.current = isReadMode;
  }, [value, isReadMode]);

  useEffect(() => {
    // Find all active tag IDs in the current raw text (value)
    const activeTagIds = [];
    const bracketRegex = /\[\[(.*?)\|(.*?)\]\]/g;
    let match;
    while ((match = bracketRegex.exec(value || '')) !== null) {
      activeTagIds.push(match[1]);
    }
    
    // Check if any id in currentSecondaryLinks is not in activeTagIds
    currentSecondaryLinks.forEach(id => {
      if (!activeTagIds.includes(id)) {
        // The tag was deleted from the text! Remove it from active connections
        onToggleConnection(id);
      }
    });
  }, [value, currentSecondaryLinks, onToggleConnection]);

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

    // Process highlights immediately after paste finishes
    setTimeout(() => {
      if (editorRef.current) {
        const raw = toRawText(editorRef.current.innerHTML);
        onChange(raw);
        editorRef.current.innerHTML = toHTML(raw);
        
        // Collapse selection to end of paste
        const range = document.createRange();
        const sel = window.getSelection();
        if (sel) {
          range.selectNodeContents(editorRef.current);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }, 20);
  };

  const saveSelection = (containerEl) => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const preSelectionRange = range.cloneRange();
      preSelectionRange.selectNodeContents(containerEl);
      preSelectionRange.setEnd(range.startContainer, range.startOffset);
      const start = preSelectionRange.toString().length;
      return {
        start: start,
        end: start + range.toString().length
      };
    }
    return null;
  };

  const restoreSelection = (containerEl, savedSel) => {
    if (!savedSel) return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    
    let charIndex = 0;
    const range = document.createRange();
    range.setStart(containerEl, 0);
    range.collapse(true);
    
    const nodeStack = [containerEl];
    let node;
    let foundStart = false;
    let stop = false;
    
    while (!stop && (node = nodeStack.pop())) {
      if (node.nodeType === Node.TEXT_NODE) {
        const nextCharIndex = charIndex + node.length;
        if (!foundStart && savedSel.start >= charIndex && savedSel.start <= nextCharIndex) {
          range.setStart(node, savedSel.start - charIndex);
          foundStart = true;
        }
        if (foundStart && savedSel.end >= charIndex && savedSel.end <= nextCharIndex) {
          range.setEnd(node, savedSel.end - charIndex);
          stop = true;
        }
        charIndex = nextCharIndex;
      } else {
        let i = node.childNodes.length;
        while (i--) {
          nodeStack.push(node.childNodes[i]);
        }
      }
    }
    sel.addRange(range);
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
      const tagSpan = e.target.closest('.potential-tag');
      if (tagSpan && node) {
        const color = ENTITY_TYPES[node.type]?.color || '#fff';
        const typeLabel = ENTITY_TYPES[node.type]?.label || 'Entity';
        const isConnected = currentSecondaryLinks.includes(id);
        
        tagSpan.className = 'inline-tag active-tag';
        tagSpan.setAttribute('data-id', id);
        tagSpan.setAttribute('data-type', typeLabel);
        tagSpan.style.border = `1px solid ${color}88`;
        tagSpan.style.background = `${color}22`;
        tagSpan.style.color = color;
        tagSpan.style.boxShadow = `0 0 10px ${color}22`;
        tagSpan.innerHTML = `${node.title}<button class="tag-link-btn ${isConnected ? 'active' : ''}" data-id="${id}">${isConnected ? 'Linked' : 'Link'}</button>`;
        
        const newRaw = toRawText(editorRef.current.innerHTML);
        isLocalChange.current = true;
        onChange(newRaw);
      }
    } else if (instantLinkBtn) {
      const id = instantLinkBtn.getAttribute('data-id');
      const node = nodes.find(n => n.id === id);
      const tagSpan = e.target.closest('.potential-tag');
      if (tagSpan && node) {
        const color = ENTITY_TYPES[node.type]?.color || '#fff';
        const typeLabel = ENTITY_TYPES[node.type]?.label || 'Entity';
        
        onToggleConnection(id);
        
        tagSpan.className = 'inline-tag active-tag';
        tagSpan.setAttribute('data-id', id);
        tagSpan.setAttribute('data-type', typeLabel);
        tagSpan.style.border = `1px solid ${color}88`;
        tagSpan.style.background = `${color}22`;
        tagSpan.style.color = color;
        tagSpan.style.boxShadow = `0 0 10px ${color}22`;
        tagSpan.innerHTML = `${node.title}<button class="tag-link-btn active" data-id="${id}">Linked</button>`;
        
        const newRaw = toRawText(editorRef.current.innerHTML);
        isLocalChange.current = true;
        onChange(newRaw);
      }
    }
  };

  const handleInput = () => {
    const html = editorRef.current.innerHTML;
    const raw = toRawText(html);
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const container = range.startContainer;
      const offset = range.startOffset;
      if (container.nodeType === Node.TEXT_NODE) {
        const textBefore = container.textContent.slice(0, offset);
        const words = textBefore.split(/\s/);
        const lastWord = words[words.length - 1];
        if (lastWord.length >= 4) {
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
    isLocalChange.current = true;
    onChange(raw);

    // Apply live highlights with selection preservation
    const savedSel = saveSelection(editorRef.current);
    const highlightedHtml = toHTML(raw);
    if (editorRef.current.innerHTML !== highlightedHtml) {
      editorRef.current.innerHTML = highlightedHtml;
      restoreSelection(editorRef.current, savedSel);
    }
  };

  const insertNodeTag = (node) => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const textNode = range.startContainer;
      const offset = range.startOffset;
      if (textNode.nodeType === Node.TEXT_NODE) {
        const beforePart = textNode.textContent.slice(0, offset);
        const afterPart = textNode.textContent.slice(offset);
        const words = beforePart.split(/\s/);
        words.pop(); // Remove the typed characters
        const newBefore = words.join(' ') + (words.length > 0 ? ' ' : '');
        
        const color = ENTITY_TYPES[node.type]?.color || '#fff';
        const isConnected = currentSecondaryLinks.includes(node.id);
        const typeLabel = ENTITY_TYPES[node.type]?.label || 'Entity';
        
        const activeSpan = document.createElement('span');
        activeSpan.contentEditable = 'false';
        activeSpan.className = 'inline-tag active-tag';
        activeSpan.setAttribute('data-id', node.id);
        activeSpan.setAttribute('data-type', typeLabel);
        activeSpan.style.border = `1px solid ${color}88`;
        activeSpan.style.background = `${color}22`;
        activeSpan.style.color = color;
        activeSpan.style.boxShadow = `0 0 10px ${color}22`;
        activeSpan.innerHTML = `${node.title}<button class="tag-link-btn ${isConnected ? 'active' : ''}" data-id="${node.id}">${isConnected ? 'Linked' : 'Link'}</button>`;
        
        textNode.textContent = newBefore;
        textNode.after(activeSpan);
        
        const trailingText = document.createTextNode(afterPart);
        activeSpan.after(trailingText);
        
        // Position caret at the beginning of the trailing text
        const newRange = document.createRange();
        newRange.setStart(trailingText, 0);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
        
        const newRaw = toRawText(editorRef.current.innerHTML);
        isLocalChange.current = true;
        onChange(newRaw);
        setShowSuggestions(false);
      }
    }
  };

  const exec = (cmd, val = null) => {
    document.execCommand(cmd, false, val);
    editorRef.current.focus();
  };

  return (
    <div className="space-y-3">
      {/* Read/Edit Toggle HUD */}
      <div className="flex justify-between items-center px-1">
        <span className="text-[10px] font-black tracking-widest uppercase text-[var(--text-muted)] transition-colors duration-300">
          Mode: <span className={isReadMode ? "text-[var(--accent-indigo)] font-black" : "text-[var(--text-primary)]"}>{isReadMode ? "Read Only" : "Edit"}</span>
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const demoText = "Our project management capability is anchored around leadership, integration and domain expertise. Project management integrates the wider functional capability of our service platform optimising performance and embedding industry leading expertise throughout the project lifecycles.";
              onChange(demoText);
            }}
            type="button"
            className="px-3 py-1 rounded-xl text-xs font-bold transition-all border bg-slate-500/10 border-slate-500/30 text-slate-500 hover:bg-slate-500/20 hover:text-slate-700 flex items-center gap-1 active:scale-[0.98]"
            title="Load project management demo text"
          >
            <LinkIcon size={11} />
            <span>Project Management Hub</span>
          </button>
          <button
            onClick={() => setIsReadMode(!isReadMode)}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all border ${
              isReadMode 
                ? 'bg-[var(--accent-indigo)]/10 border-[var(--accent-indigo)]/30 text-[var(--accent-indigo)] hover:bg-[var(--accent-indigo)]/20' 
                : 'bg-black/10 border-[var(--glass-border)] text-[var(--text-secondary)] hover:bg-black/20 hover:text-[var(--text-primary)]'
            }`}
          >
            {isReadMode ? "Switch to Edit" : "Switch to Read Mode"}
          </button>
        </div>
      </div>

      <div className="relative" ref={containerRef}>
        <div 
          ref={editorRef}
          contentEditable={!isReadMode}
          onInput={handleInput}
          onClick={handleClick}
          onPaste={handlePaste}
          className={`rich-editor-content cyber-input min-h-[300px] p-6 rounded-[var(--radius-lg)] transition-all outline-none text-[13px] leading-relaxed border border-[var(--glass-border)] text-black ${
            isReadMode ? 'bg-[var(--bg-secondary)]/50 cursor-default opacity-90' : 'bg-white hover:border-[var(--glass-border-hover)] focus:border-[var(--accent-indigo)]/40'
          }`}
          placeholder={placeholder}
        />
        <AnimatePresence>
          {showSuggestions && !isReadMode && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="absolute z-[60000] backdrop-blur-2xl border rounded-2xl shadow-3xl overflow-hidden min-w-[260px] bg-[var(--bg-primary)] border-[var(--glass-border)]"
              style={{ top: suggestionPos.top, left: suggestionPos.left }}
            >
              <div className="p-3.5 border-b flex items-center gap-2.5 border-[var(--glass-border)] bg-[var(--accent-indigo)]/5 text-[var(--accent-indigo)]">
                 <Zap size={12} className="text-[var(--accent-indigo)]" />
                 <span className="text-[11px] font-bold tracking-wide uppercase">Predictive Entity Match</span>
               </div>
              {suggestions.map(s => (
                <button 
                  key={s.id} 
                  className="w-full p-4.5 flex items-center gap-3.5 transition-colors border-b last:border-0 border-[var(--glass-border)] hover:bg-[var(--glass-border)] group"
                  onClick={() => insertNodeTag(s)}
                >
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: ENTITY_TYPES[s.type]?.color }} />
                  <div className="flex flex-col items-start">
                    <span className="text-[13px] font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-indigo)] transition-colors">{s.title}</span>
                    <span className="text-[10px] tracking-tight text-[var(--text-muted)]">{ENTITY_TYPES[s.type]?.label}</span>
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
        .read-anchor-tag:hover { opacity: 0.8; text-decoration: underline !important; }

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
  formData, setFormData, onSave, onToggleConnection, onDeleteNode, theme = 'dark',
  onSelectNode
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const isDark = theme !== 'light';
  const activeRangeRef = useRef(null);

  // Toggle state between 'old' (Standard Editor) and 'new' (SharePoint Portal View)
  const [viewMode, setViewMode] = useState('old');
  const [activeTooltip, setActiveTooltip] = useState(null);
  const [hoveredItemId, setHoveredItemId] = useState(null);
  const [hoveredGrandchildId, setHoveredGrandchildId] = useState(null);

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

  // Helper to fetch descendants recursively
  const getDescendants = (nodeId) => {
    const list = [];
    const queue = [nodeId];
    const visited = new Set();
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      const children = nodes.filter(n => n.parentId === currentId);
      children.forEach(c => {
        list.push(c);
        queue.push(c.id);
      });
    }
    return list;
  };

  const parentNode = editingNode ? nodes.find(n => n.id === editingNode.parentId) : null;
  const directChildren = editingNode ? nodes.filter(n => n.parentId === editingNode.id) : [];
  const descendants = editingNode ? getDescendants(editingNode.id) : [];
  // Inherit descendant procedures (workflows)
  const inheritedProcedures = descendants.filter(n => n.type === 'PROCEDURE');

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

  const renderReadOnlyContent = (text) => {
    if (!text) return <span className="italic opacity-50">Pending logic capture...</span>;
    
    const parts = [];
    let lastIndex = 0;
    const regex = /\[\[(.*?)\|(.*?)\]\]/g;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      const id = match[1];
      const title = match[2];
      const matchIndex = match.index;
      
      if (matchIndex > lastIndex) {
        const sub = text.substring(lastIndex, matchIndex);
        parts.push(<span key={`text_${lastIndex}`} dangerouslySetInnerHTML={{ __html: sub }} />);
      }
      
      const targetNode = nodes.find(n => n.id === id);
      const color = ENTITY_TYPES[targetNode?.type]?.color || '#00f2ff';
      
      parts.push(
        <button
          key={`tag_${matchIndex}`}
          onClick={() => {
            const node = nodes.find(n => n.id === id);
            if (node && onSelectNode) onSelectNode(node);
          }}
          className="inline-tag active-tag"
          style={{
            border: `1px solid ${color}88`,
            background: `${color}22`,
            color: color,
            boxShadow: `0 0 10px ${color}22`,
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            margin: '0 4px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center'
          }}
        >
          {title}
        </button>
      );
      
      lastIndex = regex.lastIndex;
    }
    
    if (lastIndex < text.length) {
      const sub = text.substring(lastIndex);
      parts.push(<span key={`text_${lastIndex}`} dangerouslySetInnerHTML={{ __html: sub }} />);
    }
    
    return <div className="prose max-w-none text-inherit">{parts.length > 0 ? parts : <div dangerouslySetInnerHTML={{ __html: text }} />}</div>;
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
       {/* Top drawer header */}
       <div className="p-6 border-b flex justify-between items-center shrink-0 border-[var(--glass-border)] bg-[var(--bg-secondary)]/30 transition-colors duration-300">
          <div className="flex flex-col">
             <div className="flex items-center gap-3">
                <Cpu size={18} className="text-[var(--accent-indigo)]" />
                <h2 className="text-[20px] font-semibold text-[var(--text-primary)] transition-colors duration-300">Intelligence Review</h2>
             </div>
          </div>
          
          <div className="flex items-center gap-4">
             {/* New Toggle Button for View Modes */}
             {editingNode && (
               <button 
                 onClick={() => setViewMode(viewMode === 'old' ? 'new' : 'old')}
                 className={`px-4 py-2 text-[11px] font-bold rounded-lg border transition-all uppercase tracking-wider active:scale-[0.98] ${
                   theme === 'light'
                     ? 'bg-[#899981]/15 border-[#899981]/30 text-[#4E5A47] hover:bg-[#899981]/25'
                     : 'bg-brand-cyan/10 border-brand-cyan/30 text-brand-cyan hover:bg-brand-cyan/20'
                 }`}
               >
                 {viewMode === 'old' ? 'SharePoint View' : 'Standard Editor'}
               </button>
             )}
             <button onClick={onClose} className="p-2.5 rounded-full transition-all hover:bg-[var(--glass-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X size={22} /></button>
          </div>
       </div>

       {viewMode === 'new' && editingNode ? (
         /* ── SHAREPOINT PORTAL VIEW ────────────────────────────────────── */
         <div className="flex-1 overflow-auto custom-scrollbar bg-[#F2EEE7] text-slate-800 flex flex-col select-text">
           
           {/* 1. Deep Blue Navigation Bar representing subtree nodes */}
           <nav className="flex items-center gap-6 px-8 py-3 bg-[#1E4479] text-white text-[13px] font-medium font-sans relative select-none w-full shrink-0 shadow-md">
             <div className="font-extrabold uppercase tracking-wider text-[#A3B8CC] mr-2 text-[11px]">Navigation:</div>
             {directChildren.length === 0 ? (
               <span className="italic text-white/50 text-[11px]">No child nodes in this branch</span>
             ) : (
               directChildren.map(child => {
                 const grandchildren = nodes.filter(n => n.parentId === child.id);
                 const hasChildren = grandchildren.length > 0;
                 const isHovered = hoveredItemId === child.id;

                 return (
                   <div
                     key={child.id}
                     className="relative py-1 cursor-pointer"
                     onMouseEnter={() => setHoveredItemId(child.id)}
                     onMouseLeave={() => { setHoveredItemId(null); setHoveredGrandchildId(null); }}
                   >
                     <div 
                       onClick={() => onSelectNode && onSelectNode(child)}
                       className="flex items-center gap-1.5 hover:text-cyan-200 transition-colors"
                     >
                       <span>{child.title}</span>
                       {hasChildren && <span className="text-[8px] opacity-75">▼</span>}
                     </div>

                     {hasChildren && isHovered && (
                       <div 
                         className="absolute top-full left-0 mt-2 bg-white text-black py-2 rounded-lg shadow-2xl z-[80000] min-w-[220px] border border-slate-200 flex flex-col"
                         onMouseLeave={() => setHoveredGrandchildId(null)}
                       >
                         {grandchildren.map(gc => {
                           const greatGrandchildren = nodes.filter(n => n.parentId === gc.id);
                           const hasGreatChildren = greatGrandchildren.length > 0;
                           const isGcHovered = hoveredGrandchildId === gc.id;

                           return (
                             <div
                               key={gc.id}
                               className="relative px-4 py-2.5 hover:bg-slate-100 transition-colors flex items-center justify-between group"
                               onMouseEnter={() => setHoveredGrandchildId(gc.id)}
                               onClick={(e) => {
                                 e.stopPropagation();
                                 onSelectNode && onSelectNode(gc);
                               }}
                             >
                               <span className="group-hover:text-[#1E4479] font-medium text-[12px]">{gc.title}</span>
                               {hasGreatChildren && <span className="text-[8px] text-slate-400">▶</span>}

                               {hasGreatChildren && isGcHovered && (
                                 <div 
                                   className="absolute left-full top-0 ml-1 bg-white text-black py-1.5 rounded-lg shadow-2xl z-[90000] min-w-[200px] border border-slate-200 flex flex-col"
                                   onClick={(e) => e.stopPropagation()}
                                 >
                                   {greatGrandchildren.map(ggc => (
                                     <button
                                       key={ggc.id}
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         onSelectNode && onSelectNode(ggc);
                                       }}
                                       className="px-4 py-2.5 text-left hover:bg-slate-100 hover:text-[#1E4479] transition-colors w-full text-[11px] font-medium truncate"
                                     >
                                       {ggc.title}
                                     </button>
                                   ))}
                                 </div>
                               )}
                             </div>
                           );
                         })}
                       </div>
                     )}
                   </div>
                 );
               })
             )}
           </nav>

           {/* 2. Banner / Header area */}
           <div className="bg-slate-200 border-b border-slate-300/60 p-8 flex flex-col gap-3 relative shadow-inner">
             <div className="flex items-center gap-2">
               {parentNode && (
                 <button
                   onClick={() => onSelectNode && onSelectNode(parentNode)}
                   className="px-3 py-1 bg-[#1E4479] text-white text-[10px] font-black uppercase rounded tracking-wider shadow-sm hover:bg-[#153056] transition-colors"
                 >
                   {parentNode.title}
                 </button>
               )}
               <span 
                 className="px-3 py-1 border text-[10px] font-black uppercase rounded tracking-wider shadow-sm"
                 style={{
                   borderColor: ENTITY_TYPES[currentType]?.color || '#505A60',
                   color: ENTITY_TYPES[currentType]?.color || '#505A60',
                   backgroundColor: '#ffffff'
                 }}
               >
                 {ENTITY_TYPES[currentType]?.label}
               </span>
             </div>
             
             <h1 className="text-4xl font-extrabold tracking-tighter text-slate-900 leading-none">
               {formData.title}
             </h1>
           </div>

           {/* 3. Main layout grid (central column & right sidebar) */}
           <div className="p-8 grid grid-cols-3 gap-8 flex-1">
             
             {/* Left/Central Column (Col Span 2) */}
             <div className="col-span-2 space-y-8">
               
               {/* Prominent blue Definition card */}
               <div className="bg-[#1E4479] text-white p-8 rounded-3xl shadow-lg border border-white/5 relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-8 opacity-5 scale-150 rotate-12 pointer-events-none text-white">
                   <Cpu size={120} />
                 </div>
                 <h3 className="text-[10px] font-black tracking-widest uppercase text-slate-300 mb-4">Definition Summary</h3>
                 <div className="text-[17px] leading-relaxed font-light text-slate-100">
                   {renderReadOnlyContent(formData.content['Definition Summary'] || formData.content['Summary'] || '')}
                 </div>
               </div>

               {/* Other fields from schema */}
               {SCHEMAS[currentType]?.filter(f => f.name !== 'Definition Summary' && f.name !== 'Summary').map(f => (
                 <div key={f.name} className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
                   <h4 className="text-[11px] font-black tracking-wider uppercase text-slate-400 border-b pb-2">{f.name}</h4>
                   <div className="text-[13px] leading-relaxed text-slate-700 font-light">
                     {renderReadOnlyContent(formData.content[f.name] || '')}
                   </div>
                 </div>
               ))}

               {/* 4. Inherited Child Node Text Areas (Listed under main node definition) */}
               {inheritedProcedures.length > 0 && (
                 <div className="space-y-4 pt-4">
                   <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-500 border-b-2 border-slate-300 pb-2">Inherited Workflows &amp; Processes</h3>
                   <div className="grid grid-cols-1 gap-4">
                     {inheritedProcedures.map(childNode => (
                       <div 
                         key={childNode.id}
                         className="bg-white border-l-4 border-[#ffe600] rounded-xl p-5 shadow-sm hover:shadow-md transition-all border border-slate-200 border-l-[6px]"
                       >
                         <button
                           onClick={() => onSelectNode && onSelectNode(childNode)}
                           className="text-left font-bold text-slate-900 hover:text-[#1E4479] transition-colors text-[14px] block mb-2"
                         >
                           {childNode.title}
                         </button>
                         <div className="text-[12px] text-slate-600 leading-relaxed font-light">
                           {renderReadOnlyContent(childNode.content?.['Definition Summary'] || childNode.content?.['Summary'] || 'No process definition found.')}
                         </div>
                       </div>
                     ))}
                   </div>
                 </div>
               )}
             </div>

             {/* Right Sidebar Column */}
             <div className="space-y-6">
               
               {/* Importance Tier badge with rich descriptions & mapping metadata */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                  <h4 className="text-[10px] font-black tracking-wider uppercase text-slate-400">Importance Rank</h4>
                  {(() => {
                    const t = IMPORTANCE_TIERS.find(tier => tier.id === (formData.tier || 3)) || IMPORTANCE_TIERS[2];
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                          <div>
                            <div className="text-[13px] font-extrabold text-slate-800">{t.label}</div>
                            <div className="text-[10px] text-slate-500 italic">Tier {t.id} priority level</div>
                          </div>
                        </div>
                        
                        <p className="text-[11px] leading-snug text-slate-600">{t.description}</p>
                        
                        <div className="pt-2 border-t border-slate-100 flex flex-col gap-2 text-[9px] text-slate-500 select-none">
                          {t.mappingTitle && (
                            <div 
                              className="relative cursor-help w-fit"
                              onMouseEnter={() => setActiveTooltip(`tier-mapping-${t.id}`)}
                              onMouseLeave={() => setActiveTooltip(null)}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="font-medium text-slate-600 underline decoration-dotted decoration-slate-400/50 hover:text-slate-900">
                                Mapping: {t.mappingTitle}
                              </span>
                              {activeTooltip === `tier-mapping-${t.id}` && (
                                <div className="absolute z-[9999] bottom-full left-0 mb-2 w-64 p-3.5 rounded-xl border border-slate-200 bg-slate-900 text-xs text-slate-200 shadow-2xl backdrop-blur-md transition-all duration-300">
                                  <div className="font-semibold text-xs mb-1" style={{ color: t.color }}>Mapping Summary</div>
                                  <div className="leading-relaxed font-normal">{t.mappingSummary}</div>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {t.aiUtility && (
                            <div 
                              className="relative cursor-help flex items-center gap-1.5 text-[9px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 w-fit hover:bg-emerald-100/50"
                              onMouseEnter={() => setActiveTooltip(`tier-ai-${t.id}`)}
                              onMouseLeave={() => setActiveTooltip(null)}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Cpu size={10} />
                              <span>AI Utility</span>
                              {activeTooltip === `tier-ai-${t.id}` && (
                                <div className="absolute z-[9999] bottom-full left-0 mb-2 w-64 p-3.5 rounded-xl border border-slate-200 bg-slate-900 text-xs text-slate-200 shadow-2xl backdrop-blur-md transition-all duration-300">
                                  <div className="font-semibold text-xs text-emerald-400 mb-1 flex items-center gap-1.5">
                                    <Cpu size={12} />
                                    AI Prompt Value & Utility
                                  </div>
                                  <div className="leading-relaxed font-normal">{t.aiUtility}</div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

               {/* Transverse / Secondary Connections */}
               <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
                 <h4 className="text-[10px] font-black tracking-wider uppercase text-slate-400">Transverse Threads</h4>
                 <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto custom-scrollbar">
                   {(!editingNode.secondaryLinks || editingNode.secondaryLinks.length === 0) ? (
                     <span className="text-[11px] italic text-slate-400">No secondary connections established.</span>
                   ) : (
                     editingNode.secondaryLinks.map(linkId => {
                       const linked = nodes.find(n => n.id === linkId);
                       if (!linked) return null;
                       return (
                         <button
                           key={linkId}
                           onClick={() => onSelectNode && onSelectNode(linked)}
                           className="text-left px-3 py-2 rounded-lg border border-slate-100 hover:border-brand-cyan/40 bg-slate-50 hover:bg-cyan-50/20 text-slate-700 hover:text-brand-cyan transition-all text-[11px] font-semibold flex items-center gap-2"
                         >
                           <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: ENTITY_TYPES[linked.type]?.color }} />
                           <span className="truncate">{linked.title}</span>
                         </button>
                       );
                     })
                   )}
                 </div>
               </div>

               {/* Predictive Tagging & Connection Suggestions */}
               <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
                 <h4 className="text-[10px] font-black tracking-wider uppercase text-slate-400">Suggested Connections</h4>
                 <div className="p-3 bg-indigo-50/30 border border-indigo-100/50 rounded-xl flex items-start gap-2.5">
                   <Zap size={14} className="text-[var(--accent-indigo)] shrink-0 mt-0.5" />
                   <p className="text-[10px] italic text-slate-500 leading-snug">
                     To connect, toggle to the **Standard Editor** and use the interactive tags in the rich editor.
                   </p>
                 </div>
               </div>

             </div>
           </div>
         </div>
       ) : (
         /* ── STANDARD EDITING VIEW ────────────────────────────────────── */
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
                         <div 
                           key={k} 
                           onClick={() => setCurrentType(k)} 
                           style={style}
                           className="group relative p-4 border-2 rounded-[var(--radius-lg)] flex flex-col gap-2 transition-all text-left cursor-pointer hover:border-slate-500/50"
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
                            
                            {v.mappingTitle && (
                              <div className="mt-2 pt-2 border-t border-[var(--glass-border)] flex flex-col gap-2 text-[9px] text-[var(--text-muted)] select-none">
                                <div 
                                  className="relative cursor-help w-fit"
                                  onMouseEnter={() => setActiveTooltip(`mapping-${k}`)}
                                  onMouseLeave={() => setActiveTooltip(null)}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span className="font-medium text-[var(--text-secondary)] underline decoration-dotted decoration-[var(--text-muted)]/50 hover:text-[var(--text-primary)]">
                                    Mapping: {v.mappingTitle}
                                  </span>
                                  {activeTooltip === `mapping-${k}` && (
                                    <div className="absolute z-[9999] bottom-full left-0 mb-2 w-64 p-3.5 rounded-xl border border-[#27272a]/80 bg-[#18181b]/95 text-xs text-slate-200 shadow-2xl backdrop-blur-md transition-all duration-300">
                                      <div className="font-semibold text-xs mb-1" style={{ color: v.color }}>Mapping Summary</div>
                                      <div className="leading-relaxed font-normal">{v.mappingSummary}</div>
                                    </div>
                                  )}
                                </div>
                                
                                {v.aiUtility && (
                                  <div 
                                    className="relative cursor-help flex items-center gap-1.5 text-[9px] text-[var(--accent-emerald)] bg-[var(--accent-emerald)]/10 px-1.5 py-0.5 rounded border border-[var(--accent-emerald)]/20 w-fit hover:bg-[var(--accent-emerald)]/20"
                                    onMouseEnter={() => setActiveTooltip(`ai-${k}`)}
                                    onMouseLeave={() => setActiveTooltip(null)}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Cpu size={10} />
                                    <span>AI Utility</span>
                                    {activeTooltip === `ai-${k}` && (
                                      <div className="absolute z-[9999] bottom-full left-0 mb-2 w-64 p-3.5 rounded-xl border border-[#27272a]/80 bg-[#18181b]/95 text-xs text-slate-200 shadow-2xl backdrop-blur-md transition-all duration-300">
                                        <div className="font-semibold text-xs text-[var(--accent-emerald)] mb-1 flex items-center gap-1.5">
                                          <Cpu size={12} />
                                          AI Prompt Value & Utility
                                        </div>
                                        <div className="leading-relaxed font-normal">{v.aiUtility}</div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                         </div>
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
                  <div className="grid grid-cols-5 gap-3">
                     {IMPORTANCE_TIERS.map(tier => {
                       const isActive = (formData.tier || 3) === tier.id;
                       const style = isActive ? {
                         borderColor: tier.color,
                         backgroundColor: `${tier.color}15`,
                         boxShadow: `0 0 20px ${tier.color}25`
                       } : {
                         borderColor: 'var(--glass-border)',
                         backgroundColor: 'var(--bg-secondary)'
                       };
                       
                       return (
                         <div
                           key={tier.id}
                           onClick={() => setFormData({ ...formData, tier: tier.id })}
                           style={style}
                           className="group relative p-4 border-2 rounded-[var(--radius-lg)] flex flex-col gap-2 transition-all text-left cursor-pointer hover:border-slate-500/50"
                         >
                           <div className="flex items-center gap-2">
                             <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tier.color }} />
                             <span 
                               className="text-xs font-semibold transition-colors" 
                               style={{ color: tier.color }}
                             >
                               {tier.label}
                             </span>
                             <span className="text-[8px] font-mono opacity-50 ml-auto" style={{ color: tier.color }}>
                               T{tier.id}
                             </span>
                           </div>
                           <p className="text-[10px] leading-snug text-[var(--text-secondary)] transition-colors">{tier.description}</p>
                           
                           <div className="mt-auto pt-2 border-t border-[var(--glass-border)] flex flex-col gap-2 text-[9px] text-[var(--text-muted)] select-none">
                             {tier.mappingTitle && (
                               <div 
                                 className="relative cursor-help w-fit"
                                 onMouseEnter={() => setActiveTooltip(`tier-editor-mapping-${tier.id}`)}
                                 onMouseLeave={() => setActiveTooltip(null)}
                                 onClick={(e) => e.stopPropagation()}
                                >
                                 <span className="font-medium text-[var(--text-secondary)] underline decoration-dotted decoration-[var(--text-muted)]/50 hover:text-[var(--text-primary)]">
                                   Mapping: {tier.mappingTitle}
                                 </span>
                                 {activeTooltip === `tier-editor-mapping-${tier.id}` && (
                                   <div className="absolute z-[9999] bottom-full left-0 mb-2 w-64 p-3.5 rounded-xl border border-[#27272a]/80 bg-[#18181b]/95 text-xs text-slate-200 shadow-2xl backdrop-blur-md transition-all duration-300">
                                     <div className="font-semibold text-xs mb-1" style={{ color: tier.color }}>Mapping Summary</div>
                                     <div className="leading-relaxed font-normal">{tier.mappingSummary}</div>
                                   </div>
                                 )}
                               </div>
                             )}
                             
                             {tier.aiUtility && (
                               <div 
                                 className="relative cursor-help flex items-center gap-1.5 text-[9px] text-[var(--accent-emerald)] bg-[var(--accent-emerald)]/10 px-1.5 py-0.5 rounded border border-[var(--accent-emerald)]/20 w-fit hover:bg-[var(--accent-emerald)]/20"
                                 onMouseEnter={() => setActiveTooltip(`tier-editor-ai-${tier.id}`)}
                                 onMouseLeave={() => setActiveTooltip(null)}
                                 onClick={(e) => e.stopPropagation()}
                               >
                                 <Cpu size={10} />
                                 <span>AI Utility</span>
                                 {activeTooltip === `tier-editor-ai-${tier.id}` && (
                                   <div className="absolute z-[9999] bottom-full left-0 mb-2 w-64 p-3.5 rounded-xl border border-[#27272a]/80 bg-[#18181b]/95 text-xs text-slate-200 shadow-2xl backdrop-blur-md transition-all duration-300">
                                     <div className="font-semibold text-xs text-[var(--accent-emerald)] mb-1 flex items-center gap-1.5">
                                       <Cpu size={12} />
                                       AI Prompt Value & Utility
                                     </div>
                                     <div className="leading-relaxed font-normal">{tier.aiUtility}</div>
                                   </div>
                                 )}
                               </div>
                             )}
                           </div>
                         </div>
                       );
                     })}
                  </div>
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
       )}

       {/* Footer save/delete buttons */}
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
          <button 
             onClick={() => onSave(formData)} 
             disabled={!currentType} 
             className={`px-16 py-3.5 rounded-[var(--radius-lg)] flex items-center gap-2.5 font-semibold text-xs transition-all duration-200 tracking-normal cursor-pointer active:scale-[0.98] ${
               currentType 
                 ? 'bg-[var(--gradient-primary)] text-white shadow-[var(--shadow-glow)] hover:brightness-[1.05] hover:shadow-[var(--shadow-glow-hover)] border-none' 
                 : 'bg-[var(--glass-border)] text-[var(--text-muted)] opacity-40 cursor-not-allowed pointer-events-none'
             }`}
           >
             <Save size={14} />
             <span>Commit to Graph</span>
          </button>
        </div>
     </motion.div>
  );
};
