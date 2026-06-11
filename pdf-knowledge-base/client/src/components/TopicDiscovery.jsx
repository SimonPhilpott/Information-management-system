import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Lightbulb, Dice5, X, Compass } from 'lucide-react';
import { Tooltip } from './CursorHover';

const formatSubject = (subject) => {
  if (!subject) return 'General';
  const parts = subject.split('/');
  return parts[parts.length - 1];
};

export default function TopicDiscovery({ topics, suggestions, onTopicClick, onRefresh, subjects, onOpenMesh }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('Everything');
  
  // Extract top-level subjects for the dropdown
  const highLevelSubjects = [];
  if (subjects && subjects.children) {
    const uniqueSubjects = new Set();
    subjects.children.forEach(branch => {
      if (branch.children) {
        branch.children.forEach(sub => {
          uniqueSubjects.add(sub.name);
        });
      }
    });
    highLevelSubjects.push(...Array.from(uniqueSubjects).sort());
  }
  
  const subjectKeys = Object.keys(topics || {});
  
  // Filter topics based on search query
  const filteredTopics = {};
  let totalFilteredCount = 0;
  
  subjectKeys.forEach(subject => {
    const matching = topics[subject].filter(t => 
      t.topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );
    if (matching.length > 0) {
      filteredTopics[subject] = matching;
      totalFilteredCount += matching.length;
    }
  });

  const hasTopics = subjectKeys.some(k => topics[k].length > 0);
  const showSuggestions = !searchQuery && suggestions && suggestions.length > 0;

  return (
    <aside className="topic-panel">
      <div className="topic-panel-section" style={{ padding: '0 var(--space-md) 0' }}>
        <Tooltip text="View library as 3D Spatial Knowledge Graph">
          <button 
            className="global-btn primary_ghost"
            style={{ width: '100%', maxWidth: 'var(--sidebar-content-max-width-right)' }}
            onClick={onOpenMesh}
          >
            <Compass size={14} />
            <span>Spatial Knowledge Graph</span>
          </button>
        </Tooltip>
      </div>

      <div className="topic-panel-section" style={{ marginBottom: 'var(--space-sm)' }}>
        <div className="topic-panel-title" style={{ width: '100%', maxWidth: 'var(--sidebar-content-max-width-right)' }}>
          <Search size={16} />
          Discover Topics
        </div>
      </div>

      <div className="topic-panel-section">
        <div className="topic-search-wrapper">
          <Search size={14} className="search-icon" />
          <input 
            type="text" 
            placeholder="Filter topics..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="topic-search-input"
            style={{ maxWidth: 'var(--sidebar-content-max-width-right)' }}
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="topic-panel-section topic-panel-controls" style={{ gap: 'var(--space-sm)' }}>
        {!searchQuery && (
          <>
            <Tooltip text="Generate a random thought-provoking question from your library">
              <button 
                className="global-btn accent_filled" 
                onClick={() => onRefresh(selectedSubject)} 
                id="surprise-btn" 
                style={{ 
                  width: '100%', 
                  maxWidth: 'var(--sidebar-content-max-width-right)',
                  border: '1px solid transparent'
                }}
              >
                <Dice5 size={14} />
                <span>Ask Your Knowledge Base</span>
              </button>
            </Tooltip>
            
            <div className="subject-selector-wrapper" style={{ position: 'relative', width: '100%', maxWidth: 'var(--sidebar-content-max-width-right)' }}>
              <select 
                className="subject-dropdown"
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '10px 12px',
                  outline: 'none',
                  cursor: 'pointer',
                  appearance: 'none',
                  transition: 'all 0.2s',
                  boxShadow: 'var(--shadow-sm)'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--accent-indigo)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--glass-border)'}
              >
                <option value="Everything">Everything</option>
                {highLevelSubjects.map(s => (
                  <option key={s} value={s}>{formatSubject(s)}</option>
                ))}
              </select>
              <div style={{ 
                position: 'absolute', 
                right: '12px', 
                top: '50%', 
                transform: 'translateY(-50%)', 
                pointerEvents: 'none',
                opacity: 0.5,
                fontSize: '10px'
              }}>
                ▼
              </div>
            </div>

            {showSuggestions && (
              <div className="topic-subject-name" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0' }}>
                <Lightbulb size={12} />
                Suggested Questions
              </div>
            )}
          </>
        )}
      </div>

      <div className="topic-panel-content" style={{ paddingTop: '4px' }}>
        {!searchQuery && showSuggestions && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {suggestions.map((s, i) => (
              <Tooltip 
                key={i} 
                content={
                  <div className="flex flex-col gap-1">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--accent-indigo)] font-bold opacity-80">Topic Context</div>
                    <div className="text-[12px] font-bold mb-1">{s.topic || 'Suggested Exploration'}</div>
                    <div className="flex items-center gap-2 text-[10px] opacity-70">
                      <span className="font-bold">Book:</span> {s.filename || 'Knowledge Base'}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] opacity-70">
                      <span className="font-bold">Subject:</span> {s.subject || 'General Research'}
                    </div>
                  </div>
                }
              >
                <button
                  className="topic-chip user-message-style"
                  onClick={() => onTopicClick(s.suggested_question)}
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'flex-start', 
                    gap: '4px',
                    padding: '10px 14px',
                    textAlign: 'left',
                    width: '100%',
                    marginBottom: '6px'
                  }}
                >
                  <span style={{ 
                    fontSize: '9px', 
                    fontWeight: 800, 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.5px',
                    color: 'var(--accent-indigo)',
                    opacity: 0.8
                  }}>
                    {s.filename || 'Source Document'}
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 500, lineHeight: 1.4 }}>
                    {s.suggested_question}
                  </span>
                </button>
              </Tooltip>
            ))}
          </div>
        )}

        {!hasTopics ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
            <Search size={32} style={{ marginBottom: '12px', opacity: 0.3 }} />
            <p style={{ fontSize: '13px', lineHeight: 1.6 }}>
              Topics will appear here once your PDFs are synced and indexed.
            </p>
          </div>
        ) : totalFilteredCount === 0 && searchQuery ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: '13px' }}>No topics match "{searchQuery}"</p>
          </div>
        ) : (
          <>
            {Object.keys(filteredTopics).map(subject => (
              <div key={subject} className="topic-subject-group">
                <div className="topic-subject-name">{formatSubject(subject)}</div>
                <div className="topic-chips">
                  {filteredTopics[subject].map((topic, i) => {
                    const questionText = topic.suggestedQuestion || topic.suggested_question || `Tell me about ${topic.topic}`;
                    return (
                      <Tooltip 
                        key={i} 
                        content={
                          <div className="flex flex-col gap-1">
                            <div className="text-[10px] uppercase tracking-wider text-[var(--accent-indigo)] font-bold opacity-80">Topic Context</div>
                            <div className="text-[12px] font-bold mb-1">{topic.topic}</div>
                            {topic.description && <div className="text-[11px] mb-1 opacity-90">{topic.description}</div>}
                          </div>
                        }
                      >
                        <button
                          className="topic-chip user-message-style"
                          onClick={() => onTopicClick(questionText)}
                          style={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            alignItems: 'flex-start', 
                            gap: '4px',
                            padding: '10px 14px',
                            textAlign: 'left',
                            width: '100%',
                            marginBottom: '6px'
                          }}
                        >
                          <span style={{ 
                            fontSize: '9px', 
                            fontWeight: 800, 
                            textTransform: 'uppercase', 
                            letterSpacing: '0.5px',
                            color: 'var(--accent-indigo)',
                            opacity: 0.8
                          }}>
                            {topic.filename || 'Source Document'}
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: 500, lineHeight: 1.4 }}>
                            {questionText}
                          </span>
                        </button>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}
