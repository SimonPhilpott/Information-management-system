import React, { useState } from 'react';
import { Sparkles, Library, Bookmark, Trash2, FileText, Settings, Eye, EyeOff, Check, X, Compass, MessageSquare } from 'lucide-react';
import { Tooltip } from '../Dashboard/CursorHover';
import SubjectFilter from '../Dashboard/SubjectFilter';
import ChatHistory from '../Dashboard/ChatHistory';
import ToneSwitcher from '../Dashboard/ToneSwitcher';
import ThemeToggle from '../Dashboard/ThemeToggle';
import ModelSwitcher from '../Dashboard/ModelSwitcher';
import TokenUsageMeter from '../Dashboard/TokenUsageMeter';
import GemSelector from '../Dashboard/GemSelector';

export default function Sidebar({
  subjects, selectedSubjects, onSubjectsChange, onRefineAll,
  sessions, activeSessionId, onLoadSession, onDeleteSession, onClearHistory, onNewChat,
  onOpenCatalog, width,
  appMode, onModeChange,
  pinnedItems = [], onPin, onOpenPdf,
  chatTone, onToneChange,
  theme, onThemeToggle,
  currentModel, onModelChange,
  usage,
  gems, onActivateGem,
  isClearingHistory,
  teleportedIds = [],
  onOpenAdmin,
  showCitations,
  onToggleCitations,
  deletingSessionIds = new Set(),
  onClearPins,
  showMesh,
  onOpenMesh,
}) {
  const [isConfirmingClearPins, setIsConfirmingClearPins] = useState(false);

  return (
    <aside 
      className="sidebar" 
      style={{ 
        width: `${width}px`, 
        overflowY: 'auto'
      }}
    >
      <div className="sidebar-section">
        <Tooltip text="Start a fresh conversation thread">
          <button className="new-chat-btn" onClick={onNewChat} id="new-chat-btn" style={{ width: '100%', marginBottom: '8px' }}>
            <Sparkles size={14} fill="none" stroke="currentColor" />
            <span>New Chat</span>
          </button>
        </Tooltip>

        <Tooltip text="View and manage all files in your Knowledge Base">
          <button className="sidebar-action-btn" onClick={onOpenCatalog} style={{ width: '100%' }}>
            <Library size={14} fill="none" stroke="currentColor" />
            <span>Browse Library</span>
          </button>
        </Tooltip>
      </div>

      {teleportedIds.length > 0 && (
        <div className="sidebar-section teleported-utilities">
          <div className="sidebar-label" style={{ marginBottom: '12px', fontSize: '10px', opacity: 0.6, letterSpacing: '1px', textTransform: 'uppercase' }}>Quick Tools</div>
          <div className="teleported-grid" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {teleportedIds.includes('settings') && (
              <Tooltip text="Manage system rules, files, and network configuration">
                <button className="sidebar-action-btn" onClick={onOpenAdmin} style={{ justifyContent: 'center', padding: '10px' }}>
                  <Settings size={16} />
                  <span>Admin</span>
                </button>
              </Tooltip>
            )}
            {teleportedIds.includes('usage') && <TokenUsageMeter usage={usage} />}
            {teleportedIds.includes('model') && <ModelSwitcher current={currentModel} onChange={onModelChange} />}
            {teleportedIds.includes('gem') && <GemSelector gems={gems} onSelect={onActivateGem} compact={false} />}
            {teleportedIds.includes('tone') && <ToneSwitcher current={chatTone} onChange={onToneChange} />}
          </div>
        </div>
      )}

      <div className="sidebar-section">
        <ThemeToggle theme={theme} onToggle={onThemeToggle} />
      </div>

      <div className="sidebar-section">
        <div className="mode-switcher" style={{ width: '100%' }}>
          <Tooltip text="Focus on your uploaded PDF documents and library subjects">
            <div
              className={`mode-item ${appMode === 'kb' ? 'active' : ''}`}
              onClick={() => onModeChange('kb')}
            >
              <Library size={14} fill="none" stroke="currentColor" />
              <span>Library</span>
            </div>
          </Tooltip>
          <Tooltip text="Chat directly with Gemini Pro for general knowledge and research">
            <div
              className={`mode-item ${appMode === 'general' ? 'active' : ''}`}
              onClick={() => onModeChange('general')}
            >
              <Sparkles size={14} fill="none" stroke="currentColor" />
              <span>Gemini</span>
            </div>
          </Tooltip>
        </div>
        
        {appMode === 'kb' && (
          <>
            <div className="citation-toggle-section" style={{ marginTop: '8px' }}>
              <div className="mode-switcher" style={{ width: '100%' }}>
                <Tooltip text="Show document citations in chat responses">
                  <div
                    className={`mode-item ${showCitations ? 'active' : ''}`}
                    onClick={onToggleCitations}
                  >
                    <Eye size={12} />
                    <span>Citations</span>
                  </div>
                </Tooltip>
                <Tooltip text="Hide citations for a cleaner chat experience">
                  <div
                    className={`mode-item ${!showCitations ? 'active' : ''}`}
                    onClick={onToggleCitations}
                  >
                    <EyeOff size={12} />
                    <span>Hide</span>
                  </div>
                </Tooltip>
              </div>
            </div>

            <div className="citation-toggle-section" style={{ marginTop: '0px' }}>
              <div className="mode-switcher" style={{ width: '100%' }}>
                <Tooltip text="View library as 3D Spatial Knowledge Graph">
                  <div
                    className={`mode-item ${showMesh ? 'active' : ''}`}
                    onClick={() => !showMesh && onOpenMesh()}
                  >
                    <Compass size={12} />
                    <span>Spatial Graph</span>
                  </div>
                </Tooltip>
                <Tooltip text="Switch back to conversational chat interface">
                  <div
                    className={`mode-item ${!showMesh ? 'active' : ''}`}
                    onClick={() => showMesh && onOpenMesh()}
                  >
                    <MessageSquare size={12} />
                    <span>Chat</span>
                  </div>
                </Tooltip>
              </div>
            </div>
          </>
        )}

      </div>

      {appMode === 'kb' && (
        <div className="sidebar-section">
          <SubjectFilter
            subjects={subjects}
            selected={selectedSubjects}
            onChange={onSubjectsChange}
            onRefineAll={onRefineAll}
          />
        </div>
      )}

      <div className="sidebar-section">
        <ChatHistory
          sessions={sessions}
          activeId={activeSessionId}
          onLoad={onLoadSession}
          onDelete={onDeleteSession}
          onClearAll={onClearHistory}
          isClearing={isClearingHistory}
          deletingIds={deletingSessionIds}
        />
      </div>

      {pinnedItems.length > 0 && (
        <div className="sidebar-section" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
          <div className="sidebar-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bookmark size={12} className="text-accent" />
              <span>Pinned Rules</span>
            </div>
            {isConfirmingClearPins ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: 'var(--status-red)', fontWeight: 'bold' }}>Sure?</span>
                <button 
                  onClick={() => { onClearPins(); setIsConfirmingClearPins(false); }}
                  style={{ color: 'var(--status-green)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px' }}
                >
                  <Check size={12} />
                </button>
                <button 
                  onClick={() => setIsConfirmingClearPins(false)}
                  style={{ color: 'var(--status-red)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px' }}
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setIsConfirmingClearPins(true)}
                title="Clear all pinned rules"
                style={{ opacity: 0.6, cursor: 'pointer', background: 'transparent', border: 'none', color: 'var(--text-muted)', display: 'flex', padding: '2px' }}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
          <div className="pinned-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pinnedItems.map(pin => (
              <div key={pin.id} className="pinned-item" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--glass-bg)',
                fontSize: '12px'
              }}>
                <Tooltip text={`View content from ${pin.filename}`}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1, overflow: 'hidden' }}
                    onClick={() => onOpenPdf(pin.drive_file_id, pin.page_num, pin.filename)}
                  >
                    <FileText size={12} style={{ opacity: 0.6 }} />
                    <span style={{
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {pin.filename.replace('.pdf', '')} (p.{pin.page_num})
                    </span>
                  </div>
                </Tooltip>
                <Tooltip text="Remove this pin">
                  <button
                    onClick={(e) => { e.stopPropagation(); onPin(null, pin.id); }}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
                  >
                    <Trash2 size={12} />
                  </button>
                </Tooltip>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
