import React, { useState, useEffect, useMemo } from 'react';
import { MessageSquare, Trash2, Check, X, Search, Pin } from 'lucide-react';

import { Tooltip } from './CursorHover';

export default function ChatHistory({ sessions, activeId, onLoad, onDelete, onClearAll, isClearing, deletingIds = new Set() }) {
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Load pinned session IDs from localStorage
  const [pinnedSessionIds, setPinnedSessionIds] = useState(() => {
    try {
      const stored = localStorage.getItem('pinned_sessions_ids');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Save pinned session IDs to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('pinned_sessions_ids', JSON.stringify(pinnedSessionIds));
    } catch (err) {
      console.warn('[ChatHistory] Failed to save pinned sessions to localStorage:', err);
    }
  }, [pinnedSessionIds]);

  const togglePin = (e, sessionId) => {
    e.stopPropagation();
    e.preventDefault();
    setPinnedSessionIds(prev => 
      prev.includes(sessionId) 
        ? prev.filter(id => id !== sessionId) 
        : [...prev, sessionId]
    );
  };

  const handleClearAll = () => {
    console.log('[ChatHistory] handleClearAll triggered');
    if (onClearAll) {
      console.log('[ChatHistory] Calling onClearAll prop');
      onClearAll();
    } else {
      console.warn('[ChatHistory] onClearAll prop is MISSING');
    }
    setIsConfirmingClear(false);
  };

  // Filter and sort sessions
  const sortedSessions = useMemo(() => {
    if (!sessions) return [];
    
    // First apply search filter
    let filtered = sessions;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = sessions.filter(s => 
        (s.title || 'Untitled Chat').toLowerCase().includes(query)
      );
    }

    // Then sort: pinned sessions first, then the rest
    return [...filtered].sort((a, b) => {
      const aPinned = pinnedSessionIds.includes(a.id);
      const bPinned = pinnedSessionIds.includes(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0; // Maintain original database creation order
    });
  }, [sessions, pinnedSessionIds, searchQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div className="sidebar-section-title" style={{ display: 'flex', alignItems: 'center', width: '100%', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageSquare size={12} />
          Chat History
        </div>
        
        {sessions && sessions.length > 0 && (
          <div className="clear-history-container" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', zIndex: 50 }}>
            {isClearing ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="history-spinner" style={{ 
                  width: '12px', 
                  height: '12px', 
                  border: '2px solid var(--accent-indigo)', 
                  borderTopColor: 'transparent', 
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                <span style={{ fontSize: '10px', color: 'var(--accent-indigo)', fontWeight: 'bold' }}>Clearing...</span>
              </div>
            ) : isConfirmingClear ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: 'var(--status-red)', fontWeight: 'bold' }}>Sure?</span>
                <button 
                  id="chat-history-clear-all-confirm-btn"
                  className="sidebar-action-icon confirm" 
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleClearAll(); }}
                  title="Confirm Delete All"
                  style={{ color: 'var(--status-green)', padding: '2px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex' }}
                >
                  <Check size={14} />
                </button>
                <button 
                  id="chat-history-clear-all-cancel-btn"
                  className="sidebar-action-icon cancel" 
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); setIsConfirmingClear(false); }}
                  title="Cancel"
                  style={{ color: 'var(--text-muted)', padding: '2px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex' }}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button 
                id="chat-history-clear-all-btn"
                className="sidebar-action-icon" 
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setIsConfirmingClear(true); }}
                title="Clear all history"
                style={{ opacity: 0.6, cursor: 'pointer', background: 'transparent', border: 'none', color: 'var(--text-muted)', display: 'flex', padding: '2px' }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Search Input Bar */}
      {sessions && sessions.length > 0 && (
        <div className="chat-history-search" style={{ 
          margin: '0 0 10px 0', 
          position: 'relative', 
          display: 'flex', 
          alignItems: 'center' 
        }}>
          <Search size={11} style={{ 
            position: 'absolute', 
            left: '8px', 
            color: 'var(--text-muted)', 
            opacity: 0.5 
          }} />
          <input
            id="chat-history-search-input"
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 8px 6px 26px',
              fontSize: '11px',
              background: 'var(--glass-bg)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              outline: 'none',
              transition: 'border-color 0.2s ease',
            }}
            className="search-input"
          />
          {searchQuery && (
            <button
              id="chat-history-search-clear-btn"
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '8px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <X size={10} />
            </button>
          )}
        </div>
      )}
      
      {isClearing && (
        <div className="deletion-status" style={{ margin: '8px 8px 16px 8px' }}>
          <div className="progress-container" style={{ height: '4px' }}>
            <div className="progress-bar" style={{ animation: 'progress-fast 1s ease-out forwards' }} />
          </div>
        </div>
      )}
      {!sessions || sessions.length === 0 ? (
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' }}>
          No conversations yet. Start chatting!
        </p>
      ) : sortedSessions.length === 0 ? (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '16px 0', textAlign: 'center' }}>
          No matching chats found
        </p>
      ) : (
        <ul className="chat-history-list">
          {sortedSessions.map((session) => {
            const isDeleting = deletingIds.has(session.id);
            const isPinned = pinnedSessionIds.includes(session.id);
            return (
              <li
                key={session.id}
                id={`chat-history-item-${session.id}`}
                className={`chat-history-item ${activeId === session.id ? 'active' : ''} ${isDeleting ? 'deleting' : ''} ${isPinned ? 'pinned-item' : ''}`}
                onClick={() => !isDeleting && onLoad(session.id)}
                style={{ position: 'relative', overflow: 'hidden' }}
              >
                <MessageSquare size={14} style={{ opacity: isDeleting ? 0.2 : 0.6 }} />
                <div className="chat-history-title-container" style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                  <Tooltip text={session.title || 'Untitled Chat'}>
                    <span className="chat-history-title" style={{ display: 'inline-block', width: '100%', opacity: isDeleting ? 0.3 : 1 }}>
                      {session.title || 'Untitled Chat'}
                    </span>
                  </Tooltip>
                </div>
                
                {!isDeleting && (
                  <button
                    id={`chat-history-pin-${session.id}`}
                    className={`chat-history-pin ${isPinned ? 'pinned' : ''}`}
                    onClick={(e) => togglePin(e, session.id)}
                    title={isPinned ? "Unpin chat" : "Pin chat to top"}
                  >
                    <Pin size={11} style={{ transform: isPinned ? 'none' : 'rotate(45deg)', transition: 'transform 0.2s ease' }} />
                  </button>
                )}

                {isDeleting ? (
                  <div className="chat-history-delete-progress" style={{ 
                    width: '32px', 
                    height: '14px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center' 
                  }}>
                    <div className="history-spinner" style={{ 
                      width: '8px', 
                      height: '8px', 
                      border: '2px solid var(--accent-indigo)', 
                      borderTopColor: 'transparent', 
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }} />
                  </div>
                ) : (
                  <button
                    id={`chat-history-delete-${session.id}`}
                    className="chat-history-delete"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); onDelete(session.id); }}
                    title="Delete conversation"
                  >
                    <Trash2 size={13} />
                  </button>
                )}

                {isDeleting && (
                  <div className="chat-history-progress-bar" style={{ 
                    position: 'absolute', 
                    bottom: 0, 
                    left: 0, 
                    height: '2px', 
                    background: 'var(--accent-indigo)', 
                    width: '100%',
                    animation: 'progress-fast 1s ease-out forwards'
                  }} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
