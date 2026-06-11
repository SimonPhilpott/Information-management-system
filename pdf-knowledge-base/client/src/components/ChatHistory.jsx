import React, { useState } from 'react';
import { MessageSquare, Trash2, Check, X } from 'lucide-react';

import { Tooltip } from './CursorHover';

export default function ChatHistory({ sessions, activeId, onLoad, onDelete, onClearAll, isClearing, deletingIds = new Set() }) {
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);


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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div className="sidebar-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageSquare size={12} />
          Chat History
        </div>
        
        {sessions && sessions.length > 0 && (
          <div className="clear-history-container">
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
                  className="sidebar-action-icon confirm" 
                  onClick={(e) => { e.stopPropagation(); handleClearAll(); }}
                  title="Confirm Delete All"
                  style={{ color: 'var(--status-green)', padding: '2px' }}
                >
                  <Check size={14} />
                </button>
                <button 
                  className="sidebar-action-icon cancel" 
                  onClick={() => setIsConfirmingClear(false)}
                  title="Cancel"
                  style={{ color: 'var(--text-muted)', padding: '2px' }}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button 
                className="sidebar-action-icon" 
                onClick={() => setIsConfirmingClear(true)}
                title="Clear all history"
                style={{ opacity: 0.6, cursor: 'pointer', background: 'transparent', border: 'none', color: 'var(--text-muted)', display: 'flex', padding: '2px' }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>
      
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
      ) : (
        <ul className="chat-history-list">
          {sessions.map((session) => {
            const isDeleting = deletingIds.has(session.id);
            return (
              <li
                key={session.id}
                className={`chat-history-item ${activeId === session.id ? 'active' : ''} ${isDeleting ? 'deleting' : ''}`}
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
                    className="chat-history-delete"
                    onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
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
