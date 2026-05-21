import React, { useState } from 'react';
import { User, Bot, Zap, Brain, Sparkles, Copy, Check, ShieldCheck, Info, Loader2 } from 'lucide-react';
import CitationCard from './CitationCard';
import { Tooltip } from './CursorHover';

export default function MessageBubble({ message, onOpenPdf, onPin, pinnedItems = [], onOpenCanvas, showCitations }) {
  const { role, content, citations, model, canvasUpdate, id } = message;
  const [verification, setVerification] = React.useState(null);
  const [isVerifying, setIsVerifying] = React.useState(false);

  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      const res = await fetch('/api/chat/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      const data = await res.json();
      setVerification(data);
    } catch (err) {
      console.error('Verification failed:', err);
    } finally {
      setIsVerifying(false);
    }
  };

  // Simple markdown-like rendering
  const renderContent = (text) => {
    if (!text) return null;

    // 1. Pre-process text to handle citations without splitting Markdown
    const citationRegex = /\[\[([^\]]+)\]\]/g;
    const citationMap = new Map();
    let lastCitationKey = null;
    let placeholderIndex = 0;

    const processedText = text.replace(citationRegex, (match, citationText) => {
      const cleanText = citationText.trim();
      const citationData = citations?.find(c => c.text === cleanText);
      
      const currentCitationKey = citationData 
        ? `${citationData.driveFileId}-${citationData.pageNum}`
        : cleanText;

      // Only render if different from last to respect consolidation
      if (currentCitationKey === lastCitationKey) return '';
      
      lastCitationKey = currentCitationKey;
      const placeholder = `__CITE_PH_${placeholderIndex}__`;
      citationMap.set(placeholder, { text: cleanText, data: citationData });
      placeholderIndex++;
      return placeholder;
    });

    // 2. Render the entire processed text as Markdown
    return renderMarkdown(processedText, 0, citationMap);
  };

  const renderMarkdown = (text, key, citationMap) => {
    // Basic markdown rendering
    const lines = text.split('\n');
    const elements = [];
    let listStack = []; 
    let inCodeBlock = false;
    let codeContent = [];
    let codeLanguage = '';

    const flushLists = (targetLevel = 0) => {
      while (listStack.length > targetLevel) {
        const { items, type, key: listKey } = listStack.pop();
        const ListTag = type === 'ordered' ? 'ol' : 'ul';
        const listElement = <ListTag key={listKey}>{items}</ListTag>;
        
        if (listStack.length > 0) {
          // Add this list as a child of the last item in the parent list
          const parentList = listStack[listStack.length - 1];
          const lastItem = parentList.items[parentList.items.length - 1];
          // Replace last item with version including nested list
          parentList.items[parentList.items.length - 1] = React.cloneElement(lastItem, {}, [
            lastItem.props.children,
            listElement
          ]);
        } else {
          elements.push(listElement);
        }
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Handle code blocks
      if (trimmed.startsWith('```')) {
        if (inCodeBlock) {
          // Close code block
          const code = codeContent.join('\n');
          elements.push(
            <CodeBlock 
              key={`code-${key}-${i}`} 
              code={code} 
              language={codeLanguage} 
              onOpenCanvas={onOpenCanvas}
            />
          );
          inCodeBlock = false;
          codeContent = [];
          codeLanguage = '';
        } else {
          // Open code block
          inCodeBlock = true;
          codeLanguage = trimmed.slice(3).trim();
          flushLists(0);
        }
        continue;
      }

      if (inCodeBlock) {
        codeContent.push(line);
        continue;
      }
      
      // Check if line is ONLY citation placeholders
      const isOnlyCitations = trimmed !== '' && trimmed.split(/(__CITE_PH_\d+__)/).every(part => 
        part.trim() === '' || part.match(/^__CITE_PH_\d+__$/)
      );

      const indentMatch = line.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1].length : 0;
      const level = Math.floor(indent / 2);

      // List item detection
      const bulletMatch = line.trim().match(/^[-*]\s+(.*)/);
      const orderedMatch = line.trim().match(/^\d+\.\s+(.*)/);

      if (bulletMatch || orderedMatch) {
        const content = bulletMatch ? bulletMatch[1] : orderedMatch[1];
        const type = bulletMatch ? 'unordered' : 'ordered';

        if (listStack.length <= level) {
          listStack.push({ items: [], type, level, key: `list-${key}-${i}` });
        } else if (listStack.length > level + 1) {
          flushLists(level + 1);
        }

        const currentList = listStack[listStack.length - 1];
        currentList.items.push(<li key={`li-${key}-${i}`}>{formatInline(content, i, citationMap)}</li>);
      } else if (isOnlyCitations && (listStack.length > 0 || elements.length > 0)) {
        // If it's just citations, try to append to last element instead of new paragraph
        const badge = formatInline(trimmed, i, citationMap);
        if (listStack.length > 0) {
          const currentList = listStack[listStack.length - 1];
          const lastItem = currentList.items[currentList.items.length - 1];
          currentList.items[currentList.items.length - 1] = React.cloneElement(lastItem, {}, [
            lastItem.props.children,
            badge
          ]);
        } else {
          const lastEl = elements[elements.length - 1];
          if (lastEl && lastEl.type === 'p') {
            elements[elements.length - 1] = React.cloneElement(lastEl, {}, [
              lastEl.props.children,
              badge
            ]);
          } else {
            elements.push(<p key={`p-${key}-${i}`} className="citation-row">{badge}</p>);
          }
        }
      } else {
        // Not a list item
        flushLists(0);

        if (line.startsWith('### ')) {
          elements.push(<h3 key={`h3-${key}-${i}`}>{formatInline(line.slice(4), i, citationMap)}</h3>);
        } else if (line.startsWith('## ')) {
          elements.push(<h2 key={`h2-${key}-${i}`}>{formatInline(line.slice(3), i, citationMap)}</h2>);
        } else if (line.startsWith('# ')) {
          elements.push(<h1 key={`h1-${key}-${i}`}>{formatInline(line.slice(2), i, citationMap)}</h1>);
        } else if (trimmed === '' || trimmed === '.') {
          // Skip
        } else {
          elements.push(<p key={`p-${key}-${i}`}>{formatInline(line, i, citationMap)}</p>);
        }
      }
    }
    flushLists(0);

    return <React.Fragment key={`md-${key}`}>{elements}</React.Fragment>;
  };

  const formatInline = (text, lineKey, citationMap) => {
    if (!text) return null;

    // Handle inline code
    const inlineParts = [];
    const inlineCodeRegex = /`(.+?)`/g;
    let lastInlineIdx = 0;
    let inlineMatch;

    while ((inlineMatch = inlineCodeRegex.exec(text)) !== null) {
      if (inlineMatch.index > lastInlineIdx) {
        inlineParts.push(text.slice(lastInlineIdx, inlineMatch.index));
      }
      inlineParts.push(<code key={`code-${lineKey}-${inlineMatch.index}`} className="inline-code">{inlineMatch[1]}</code>);
      lastInlineIdx = inlineMatch.index + inlineMatch[0].length;
    }

    if (lastInlineIdx < text.length) {
      inlineParts.push(text.slice(lastInlineIdx));
    }

    const processedText = inlineParts.length > 0 ? inlineParts : text;

    // Handle bolding
    const parts = [];
    const boldRegex = /\*\*(.+?)\*\*/g;
    let lastIdx = 0;
    let match;

    // Helper to process a mix of text and react elements
    const deepProcess = (content) => {
      if (typeof content === 'string') {
        return processCitations(content, lineKey, citationMap);
      }
      return content;
    };

    if (Array.isArray(processedText)) {
      processedText.forEach((item, idx) => {
        if (typeof item === 'string') {
          let lastBIdx = 0;
          let bMatch;
          while ((bMatch = boldRegex.exec(item)) !== null) {
            if (bMatch.index > lastBIdx) {
              parts.push(processCitations(item.slice(lastBIdx, bMatch.index), `${lineKey}-${idx}`, citationMap));
            }
            parts.push(<strong key={`bold-${lineKey}-${idx}-${bMatch.index}`}>{processCitations(bMatch[1], `${lineKey}-${idx}`, citationMap)}</strong>);
            lastBIdx = bMatch.index + bMatch[0].length;
          }
          if (lastBIdx < item.length) {
            parts.push(processCitations(item.slice(lastBIdx), `${lineKey}-${idx}`, citationMap));
          }
        } else {
          parts.push(item);
        }
      });
    } else {
      let lastBIdx = 0;
      let bMatch;
      while ((bMatch = boldRegex.exec(processedText)) !== null) {
        if (bMatch.index > lastBIdx) {
          parts.push(processCitations(processedText.slice(lastBIdx, bMatch.index), lineKey, citationMap));
        }
        parts.push(<strong key={`bold-${lineKey}-${bMatch.index}`}>{processCitations(bMatch[1], lineKey, citationMap)}</strong>);
        lastBIdx = bMatch.index + bMatch[0].length;
      }
      if (lastBIdx < processedText.length) {
        parts.push(processCitations(processedText.slice(lastBIdx), lineKey, citationMap));
      }
    }

    return parts.length > 0 ? parts : deepProcess(processedText);
  };

  const processCitations = (text, lineKey, citationMap) => {
    if (!text || typeof text !== 'string') return text;
    if (!citationMap || citationMap.size === 0) return text;

    const parts = [];
    const placeholderRegex = /(__CITE_PH_\d+__)/g;
    let lastIdx = 0;
    let match;

    while ((match = placeholderRegex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        parts.push(text.slice(lastIdx, match.index));
      }

      const placeholder = match[1];
      const cite = citationMap.get(placeholder);
      
      if (cite) {
        const { text: citationText, data: citationData } = cite;
        if (!showCitations) return ''; // Hide if disabled
        
        if (citationData && citationData.driveFileId) {
          parts.push(
            <Tooltip key={`cite-${lineKey}-${match.index}`} text={`Open ${citationData.filename} at page ${citationData.pageNum}`}>
              <button
                className="citation-badge"
                onClick={() => {
                  onOpenPdf(
                    citationData.driveFileId || citationData.drive_file_id, 
                    citationData.pageNum || citationData.page_num || 1, 
                    citationData.filename,
                    citationData.text || citationText
                  );
                }}
              >
                <span className="citation-icon">📄</span>
                {citationData.filename?.replace('.pdf', '')}, p.{citationData.pageNum || citationData.page_num || '?'}
                <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.7 }}>↗</span>
              </button>
            </Tooltip>
          );
        } else {
          parts.push(
            <span key={`cite-${lineKey}-${match.index}`} className="citation-badge" style={{ cursor: 'default', opacity: 0.7 }}>
              <span className="citation-icon">📄</span>
              {citationText}
            </span>
          );
        }
      }
      
      lastIdx = match.index + match[0].length;
    }

    if (lastIdx < text.length) {
      parts.push(text.slice(lastIdx));
    }

    return parts.length > 0 ? parts : text;
  };

  return (
    <div className={`message ${role}`}>
      <div className="message-avatar">
        {role === 'user' ? <User size={16} /> : <Bot size={16} />}
      </div>
      <div className="message-content">
        {message.image && (
          <div className="message-image-container" style={{ marginBottom: '12px' }}>
            <img 
              src={message.image} 
              alt="User uploaded" 
              style={{ maxWidth: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }} 
            />
          </div>
        )}
        <div className="message-text">
          {renderContent(content)}
        </div>

        {canvasUpdate && (
          <div style={{ marginTop: '12px' }}>
            <button 
              className="canvas-trigger-btn"
              onClick={() => onOpenCanvas(canvasUpdate)}
              style={{
                background: 'rgba(var(--accent-primary-rgb), 0.15)',
                border: '1px solid var(--accent-primary)',
                color: 'var(--accent-primary)',
                padding: '8px 16px',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <Sparkles size={14} />
              Open in Workspace
            </button>
          </div>
        )}

        {role === 'assistant' && (
          <div className="message-actions">
            <Tooltip text="Double-Check with Google Search">
              <button 
                className={`verify-btn ${isVerifying ? 'loading' : ''}`} 
                onClick={handleVerify}
                disabled={isVerifying}
              >
                {isVerifying ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                <span>{isVerifying ? 'Verifying...' : 'Verify Response'}</span>
              </button>
            </Tooltip>
          </div>
        )}

        {verification && (
          <div className="verification-report animate-fadeIn">
            <div className="verification-header">
              <ShieldCheck size={14} className="text-status-green" />
              <span>Verification Report</span>
            </div>
            <div className="verification-content">
              {verification.verification}
            </div>
            <div className="verification-footer">
              <Info size={10} />
              <span>Verified via Google Search grounding</span>
            </div>
          </div>
        )}

        {role === 'assistant' && citations && citations.length > 0 && showCitations && (
          <div className="citations-list">
            {citations.filter(c => c.driveFileId).map((c, i) => (
              <CitationCard 
                key={i} 
                citation={c} 
                onOpenPdf={onOpenPdf} 
                onPin={onPin}
                isPinned={pinnedItems.some(p => p.drive_file_id === c.driveFileId && p.page_num === c.pageNum)}
              />
            ))}
          </div>
        )}
        {role === 'assistant' && model && (
          <div className="message-model">
            {model === 'flash' ? <Zap size={10} style={{ color: 'var(--status-yellow)' }} /> : <Brain size={10} style={{ color: 'var(--accent-indigo-light)' }} />}
            <span>{model === 'flash' ? 'Flash' : 'Pro'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function CodeBlock({ code, language, onOpenCanvas }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-container">
      <div className="code-block-header">
        <span className="code-block-lang">{language || 'code'}</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Tooltip text="Open in Workspace">
            <button 
              className="code-copy-btn" 
              onClick={() => onOpenCanvas(code)}
            >
              <Sparkles size={14} />
              <span>Workspace</span>
            </button>
          </Tooltip>
          <button className="code-copy-btn" onClick={handleCopy}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>
      </div>
      <pre className="code-block-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}
