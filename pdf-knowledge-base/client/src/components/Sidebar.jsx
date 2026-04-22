import { Sparkles, Library } from 'lucide-react';
import SubjectFilter from './SubjectFilter';
import ChatHistory from './ChatHistory';

export default function Sidebar({
  subjects, selectedSubjects, onSubjectsChange, onRefineAll,
  sessions, activeSessionId, onLoadSession, onDeleteSession, onNewChat,
  onOpenCatalog
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <button className="new-chat-btn" onClick={onNewChat} id="new-chat-btn">
          <Sparkles size={14} />
          <span>New Chat</span>
        </button>

        <button className="sidebar-action-btn" onClick={onOpenCatalog}>
          <Library size={14} />
          <span>Browse Library</span>
        </button>
      </div>

      <div className="sidebar-section">
        <SubjectFilter
          subjects={subjects}
          selected={selectedSubjects}
          onChange={onSubjectsChange}
          onRefineAll={onRefineAll}
        />
      </div>

      <div className="sidebar-section" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <ChatHistory
          sessions={sessions}
          activeId={activeSessionId}
          onLoad={onLoadSession}
          onDelete={onDeleteSession}
        />
      </div>
    </aside>
  );
}
