import React, { useState } from 'react';
import { FileText, ExternalLink, Bookmark, BookmarkCheck } from 'lucide-react';

export default function CitationCard({ citation, onOpenPdf, onPin, isPinned }) {
  const [showExcerpt, setShowExcerpt] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button
          className="citation-badge"
          onClick={() => {
            console.log('[CitationCard] Citation click:', citation);
            onOpenPdf(
              citation.driveFileId || citation.drive_file_id, 
              citation.pageNum || citation.page_num, 
              citation.filename,
              citation.excerpt || citation.text
            );
          }}
          onMouseEnter={() => setShowExcerpt(true)}
          onMouseLeave={() => setShowExcerpt(false)}
          title={`Click to open ${citation.filename} at page ${citation.pageNum}`}
        >
          <FileText size={14} style={{ marginRight: '4px' }} />
          {citation.filename?.replace('.pdf', '')}, p.{citation.pageNum || citation.page_num || '?'}
          <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.7 }}>↗</span>
        </button>
        
        <button 
          className={`pin-btn ${isPinned ? 'active' : ''}`}
          onClick={() => onPin(citation)}
          title={isPinned ? "Remove from Notebook" : "Pin to Notebook"}
          style={{
            background: 'transparent',
            border: 'none',
            color: isPinned ? 'var(--accent-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s'
          }}
        >
          {isPinned ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
        </button>
      </div>

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
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', fontSize: '11px' }}>
            📖 Excerpt from page {citation.pageNum}
          </div>
          
          {citation.hasImages && (
            <div style={{ 
              width: '100%', 
              height: '180px', 
              background: '#000', 
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
              border: '1px solid var(--glass-border)'
            }}>
              <img 
                src={`/api/drive/page-image/${citation.driveFileId}/${citation.pageNum}`} 
                alt="Page Preview" 
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
          )}
          
          <div style={{ fontStyle: citation.hasImages ? 'italic' : 'normal' }}>
            {citation.excerpt}
          </div>
        </div>
      )}
    </div>
  );
}
