import React from 'react';
import { User, Bot, Zap, Brain } from 'lucide-react';
import CitationCard from './CitationCard';

export default function MessageBubble({ message, onOpenPdf }) {
  const { role, content, citations, model } = message;

  // Simple markdown-like rendering
  const renderContent = (text) => {
    if (!text) return null;

    // Replace citation markers [[...]] with placeholder for rendering
    const parts = [];
    let lastIndex = 0;
    const citationRegex = /\[\[([^\]]+)\]\]/g;
    let match;

    while ((match = citationRegex.exec(text)) !== null) {
      // Add text before citation
      if (match.index > lastIndex) {
        parts.push(renderMarkdown(text.slice(lastIndex, match.index), lastIndex));
      }

      // Find matching citation data
      const citationText = match[1];
      const citationData = citations?.find(c => c.text === citationText);

      if (citationData && citationData.driveFileId) {
        parts.push(
          <button
            key={`cite-${match.index}`}
            className="citation-badge"
            onClick={() => onOpenPdf(citationData.driveFileId, citationData.pageNum, citationData.filename)}
            title={`Open ${citationData.filename} at page ${citationData.pageNum}`}
          >
            <span className="citation-icon">📄</span>
            {citationData.filename?.replace('.pdf', '')}, p.{citationData.pageNum}
          </button>
        );
      } else {
        parts.push(
          <span key={`cite-${match.index}`} className="citation-badge" style={{ cursor: 'default', opacity: 0.7 }}>
            <span className="citation-icon">📄</span>
            {citationText}
          </span>
        );
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(renderMarkdown(text.slice(lastIndex), lastIndex));
    }

    return parts.length > 0 ? parts : renderMarkdown(text, 0);
  };

  const renderMarkdown = (text, key) => {
    // Basic markdown rendering
    const lines = text.split('\n');
    const elements = [];
    let inList = false;
    let listItems = [];

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(<ul key={`list-${key}-${elements.length}`}>{listItems}</ul>);
        listItems = [];
        inList = false;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Headers
      if (line.startsWith('### ')) {
        flushList();
        elements.push(<h3 key={`h3-${key}-${i}`}>{formatInline(line.slice(4))}</h3>);
      } else if (line.startsWith('## ')) {
        flushList();
        elements.push(<h2 key={`h2-${key}-${i}`}>{formatInline(line.slice(3))}</h2>);
      } else if (line.startsWith('# ')) {
        flushList();
        elements.push(<h1 key={`h1-${key}-${i}`}>{formatInline(line.slice(2))}</h1>);
      }
      // List items
      else if (line.match(/^[\s]*[-*]\s/)) {
        inList = true;
        listItems.push(<li key={`li-${key}-${i}`}>{formatInline(line.replace(/^[\s]*[-*]\s/, ''))}</li>);
      }
      // Numbered list
      else if (line.match(/^[\s]*\d+\.\s/)) {
        inList = true;
        listItems.push(<li key={`li-${key}-${i}`}>{formatInline(line.replace(/^[\s]*\d+\.\s/, ''))}</li>);
      }
      // Empty line
      else if (line.trim() === '') {
        flushList();
      }
      // Regular paragraph
      else {
        flushList();
        elements.push(<p key={`p-${key}-${i}`}>{formatInline(line)}</p>);
      }
    }
    flushList();

    return <React.Fragment key={`md-${key}`}>{elements}</React.Fragment>;
  };

  const formatInline = (text) => {
    // Bold
    const parts = [];
    const boldRegex = /\*\*(.+?)\*\*/g;
    let lastIdx = 0;
    let match;

    while ((match = boldRegex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        parts.push(text.slice(lastIdx, match.index));
      }
      parts.push(<strong key={match.index}>{match[1]}</strong>);
      lastIdx = match.index + match[0].length;
    }

    if (lastIdx < text.length) {
      parts.push(text.slice(lastIdx));
    }

    return parts.length > 0 ? parts : text;
  };

  const modelLabel = model === 'flash' ? '⚡ Flash' : model === 'pro' ? '🧠 Pro' : '';

  return (
    <div className={`message ${role}`}>
      <div className="message-avatar">
        {role === 'user' ? <User size={16} /> : <Bot size={16} />}
      </div>
      <div>
        <div className="message-content">
          {renderContent(content)}
        </div>
        {role === 'assistant' && citations && citations.length > 0 && (
          <div className="citations-list">
            {citations.filter(c => c.driveFileId).map((c, i) => (
              <CitationCard key={i} citation={c} onOpenPdf={onOpenPdf} />
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
