import React, { useState } from 'react';
import { FileText, ExternalLink } from 'lucide-react';

export default function CitationCard({ citation, onOpenPdf }) {
  const [showExcerpt, setShowExcerpt] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="citation-badge"
        onClick={() => onOpenPdf(citation.driveFileId, citation.pageNum, citation.filename)}
        onMouseEnter={() => setShowExcerpt(true)}
        onMouseLeave={() => setShowExcerpt(false)}
        title={`Click to open ${citation.filename} at page ${citation.pageNum}`}
      >
        <FileText size={14} style={{ marginRight: '4px' }} />
        {citation.filename?.replace('.pdf', '')}, p.{citation.pageNum}
        <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.7 }}>↗</span>
      </button>

      {showExcerpt && citation.excerpt && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          marginBottom: '8px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius-md)',
          padding: '12px',
          maxWidth: '350px',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          lineHeight: '1.6',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 50,
          animation: 'fadeIn 0.15s ease-out',
          pointerEvents: 'none'
        }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', fontSize: '11px' }}>
            📖 Excerpt from page {citation.pageNum}
          </div>
          {citation.excerpt}
        </div>
      )}
    </div>
  );
}
