import { MessageSquare, Trash2 } from 'lucide-react';

export default function ChatHistory({ sessions, activeId, onLoad, onDelete }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div className="sidebar-section-title">
        <MessageSquare size={12} />
        Chat History
      </div>
      {!sessions || sessions.length === 0 ? (
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' }}>
          No conversations yet. Start chatting!
        </p>
      ) : (
        <ul className="chat-history-list">
          {sessions.map((session) => (
            <li
              key={session.id}
              className={`chat-history-item ${activeId === session.id ? 'active' : ''}`}
              onClick={() => onLoad(session.id)}
            >
              <MessageSquare size={14} style={{ opacity: 0.6 }} />
              <span className="chat-history-title">
                {session.title || 'Untitled Chat'}
              </span>
              <button
                className="chat-history-delete"
                onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
                title="Delete conversation"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
