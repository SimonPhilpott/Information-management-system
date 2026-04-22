import React from 'react';
import { Library, User } from 'lucide-react';
import Sidebar from './Sidebar';
import ChatInterface from './ChatInterface';
import TopicDiscovery from './TopicDiscovery';
import ModelSwitcher from './ModelSwitcher';
import TokenUsageMeter from './TokenUsageMeter';
import SyncStatus from './SyncStatus';
import PDFViewerModal from './PDFViewerModal';

export default function Layout({
  messages, isTyping, onSendMessage,
  sessions, activeSessionId, onLoadSession, onDeleteSession, onNewChat,
  subjects, selectedSubjects, onSubjectsChange,
  currentModel, onModelChange,
  usage,
  topics, suggestions, onTopicClick, onRefreshSuggestions,
  syncStatus, onSync,
  pdfViewer, onOpenPdf, onClosePdf,
  settings, authStatus,
  onOpenCatalog, onRefineAll
}) {
  return (
    <div className="app-layout">
      {/* Top Bar */}
      <header className="app-topbar">
        <div className="app-topbar-left">
          <div className="app-logo">
            <Library className="app-logo-icon" size={20} />
            <span>PDF Knowledge Base</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <ModelSwitcher current={currentModel} onChange={onModelChange} />
          <TokenUsageMeter usage={usage} />
        </div>
      </header>

      {/* Main Content */}
      <div className="app-main">
        <Sidebar
          subjects={subjects}
          selectedSubjects={selectedSubjects}
          onSubjectsChange={onSubjectsChange}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onLoadSession={onLoadSession}
          onDeleteSession={onDeleteSession}
          onNewChat={onNewChat}
          onOpenCatalog={onOpenCatalog}
          onRefineAll={onRefineAll}
        />

        <ChatInterface
          messages={messages}
          isTyping={isTyping}
          onSendMessage={onSendMessage}
          onOpenPdf={onOpenPdf}
          suggestions={suggestions}
          onTopicClick={onTopicClick}
        />

        <TopicDiscovery
          topics={topics}
          suggestions={suggestions}
          onTopicClick={onTopicClick}
          onRefresh={onRefreshSuggestions}
        />
      </div>

      {/* Status Bar */}
      <footer className="app-statusbar">
        <SyncStatus syncStatus={syncStatus} onSync={onSync} />
        {authStatus?.email && (
          <span className="status-item" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <User size={12} />
            {authStatus.email}
          </span>
        )}
      </footer>

      {/* PDF Viewer Modal */}
      {pdfViewer && (
        <PDFViewerModal
          driveFileId={pdfViewer.driveFileId}
          initialPage={pdfViewer.pageNum}
          filename={pdfViewer.filename}
          onClose={onClosePdf}
        />
      )}
    </div>
  );
}
