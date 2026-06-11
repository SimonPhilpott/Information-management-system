import React, { useState, useEffect } from 'react';
import { Brain, User, Settings, Menu, Compass, X } from 'lucide-react';
import { Tooltip } from './CursorHover';
import Sidebar from '../Navigation/Sidebar';
import TopicDiscovery from './TopicDiscovery';
import ModelSwitcher from './ModelSwitcher';
import TokenUsageMeter from './TokenUsageMeter';
import SyncStatus from './SyncStatus';
import ToneSwitcher from './ToneSwitcher';
import ThemeToggle from './ThemeToggle';
import GemSelector from './GemSelector';
import PDFWorkspace from './PDFWorkspace';

export default function Layout({
  children, // The main center viewport children
  sessions, activeSessionId, onLoadSession, onDeleteSession, onClearHistory, onNewChat,
  subjects, selectedSubjects, onSubjectsChange,
  currentModel, onModelChange,
  usage,
  topics, suggestions, onTopicClick, onRefreshSuggestions,
  syncStatus, onSync,
  pdfViewer, onOpenPdf, onClosePdf,
  settings, authStatus,
  onOpenCatalog, onRefineAll,
  onOpenAdmin,
  sidebarWidth, isResizing, onResizeStart,
  topicsWidth, isResizingTopics, onTopicsResizeStart,
  onLogin, onLogout,
  appMode, onModeChange,
  pinnedItems, onPin,
  chatTone, onToneChange,
  theme, onThemeToggle,
  gems, onActivateGem,
  isClearingHistory,
  showCitations,
  onToggleCitations,
  deletingSessionIds,
  onClearPins,
  onOpenGraph,
  showGraph,
}) {

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isTopicsOpen, setIsTopicsOpen] = useState(false);
  const [isStatusExpanded, setIsStatusExpanded] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  
  // PDF Viewer split sizing state and mouse drag handlers
  const [pdfWidth, setPdfWidth] = useState(500);
  const [isResizingPdf, setIsResizingPdf] = useState(false);

  useEffect(() => {
    if (!isResizingPdf) return;
    const handleMouseMove = (e) => {
      const newWidth = window.innerWidth - e.clientX;
      setPdfWidth(Math.max(300, Math.min(window.innerWidth * 0.8, newWidth)));
    };
    const handleMouseUp = () => {
      setIsResizingPdf(false);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingPdf]);
  
  // Teleportation state
  const [teleportedIds, setTeleportedIds] = useState([]);
  const topbarRef = React.useRef(null);
  const toolWidthsRef = React.useRef({
    logo: 180,
    tone: 220,
    gem: 100,
    model: 240,
    usage: 160,
    settings: 48
  });

  // Close sidebars on resize if moving back to desktop
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      if (window.innerWidth > 768) {
        setIsSidebarOpen(false);
        setIsStatusExpanded(true); 
      } else {
        setIsStatusExpanded(false); 
      }
    };
    window.addEventListener('resize', handleResize);
    if (window.innerWidth > 768) setIsStatusExpanded(true);
    else setIsStatusExpanded(false);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Monitor topbar overflow
  useEffect(() => {
    if (!topbarRef.current) return;

    const checkOverflow = () => {
      const topbar = topbarRef.current;
      if (!topbar) return;
      
      const topbarRect = topbar.getBoundingClientRect();
      if (topbarRect.width <= 0) return; // Wait for layout

      const padding = 64; // Increased padding buffer
      const availableWidth = topbarRect.width - padding;
      
      // Capture real widths if tools are currently visible
      const toolOrder = ['tone', 'gem', 'model', 'usage', 'settings'];
      toolOrder.forEach(id => {
        const el = topbar.querySelector(`[data-tool-id="${id}"]`);
        if (el && el.getBoundingClientRect().width > 0) {
          toolWidthsRef.current[id] = el.getBoundingClientRect().width;
        }
      });

      const widths = toolWidthsRef.current;
      let totalNeeded = widths.logo;
      toolOrder.forEach(id => totalNeeded += widths[id] + 16);

      let overflow = Math.max(0, totalNeeded - availableWidth);
      let toTeleport = [];
      
      // Revised priority: Remove usage and model first, settings LAST
      const priorityOrder = ['usage', 'model', 'tone', 'gem', 'settings'];
      for (const id of priorityOrder) {
        if (overflow > 0) {
          toTeleport.push(id);
          overflow -= (widths[id] + 16);
        } else {
          break;
        }
      }

      if (JSON.stringify(toTeleport.sort()) !== JSON.stringify(teleportedIds.sort())) {
        setTeleportedIds(toTeleport);
      }
    };

    const observer = new ResizeObserver(checkOverflow);
    observer.observe(topbarRef.current);
    checkOverflow();

    return () => observer.disconnect();
  }, [teleportedIds]);

  return (
    <div className="app-layout">
      {/* Mobile Overlays */}
      {(isSidebarOpen || isTopicsOpen) && (
        <div
          className="mobile-overlay"
          onClick={() => { setIsSidebarOpen(false); setIsTopicsOpen(false); }}
        />
      )}

      {/* Top Bar */}
      <header className="app-topbar" ref={topbarRef}>
        <div className="app-topbar-left">
          <Tooltip text="Toggle Navigation Sidebar">
            <button className="mobile-toggle-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
              <Menu size={20} />
            </button>
          </Tooltip>
          <div className="app-logo">
            <Brain className="app-logo-icon" size={20} />
            <span className="logo-text">IMS</span>
          </div>
          <div className="topbar-tool-container desktop-only-flex">
            {!teleportedIds.includes('tone') && (
              <div data-tool-id="tone">
                <ToneSwitcher current={chatTone} onChange={onToneChange} />
              </div>
            )}
            {!teleportedIds.includes('gem') && (
              <div data-tool-id="gem">
                <GemSelector gems={gems} onSelect={onActivateGem} compact={true} />
              </div>
            )}
            {!teleportedIds.includes('model') && (
              <div data-tool-id="model">
                <ModelSwitcher current={currentModel} onChange={onModelChange} />
              </div>
            )}
          </div>
        </div>
        <div className="app-topbar-right">
          <div className="topbar-tool-container desktop-only-flex">
            {!teleportedIds.includes('usage') && (
              <div data-tool-id="usage">
                <TokenUsageMeter usage={usage} />
              </div>
            )}
          </div>
          <Tooltip text="Toggle Topic Discovery Panel">
            <button
              className="mobile-toggle-btn topic-toggle-btn"
              onClick={() => setIsTopicsOpen(!isTopicsOpen)}
            >
              <Compass size={20} />
            </button>
          </Tooltip>
          {!teleportedIds.includes('settings') && (
            <div data-tool-id="settings">
              <Tooltip text="Admin">
                <button
                  className="settings-cog-btn"
                  onClick={onOpenAdmin}
                >
                  <Settings size={18} />
                </button>
              </Tooltip>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="app-main">
        <div className={`sidebar-wrapper ${isSidebarOpen ? 'mobile-open' : ''}`}>
          <Sidebar
            width={sidebarWidth}
            subjects={subjects}
            selectedSubjects={selectedSubjects}
            onSubjectsChange={onSubjectsChange}
            sessions={sessions}
            activeSessionId={activeSessionId}
            onLoadSession={onLoadSession}
            onDeleteSession={onDeleteSession}
            onClearHistory={onClearHistory}
            isClearingHistory={isClearingHistory}
            onNewChat={onNewChat}
            onOpenCatalog={onOpenCatalog}
            onRefineAll={onRefineAll}
            appMode={appMode}
            onModeChange={onModeChange}
            pinnedItems={pinnedItems}
            onPin={onPin}
            onClearPins={onClearPins}
            onOpenPdf={onOpenPdf}
            chatTone={chatTone}
            onToneChange={onToneChange}
            theme={theme}
            onThemeToggle={onThemeToggle}
            currentModel={currentModel}
            onModelChange={onModelChange}
            usage={usage}
            gems={gems}
            onActivateGem={onActivateGem}
            teleportedIds={teleportedIds}
            onOpenAdmin={onOpenAdmin}
            showCitations={showCitations}
            onToggleCitations={onToggleCitations}
            deletingSessionIds={deletingSessionIds}
            showGraph={showGraph}
            onOpenGraph={onOpenGraph}
          />
        </div>

        <div
          className={`sidebar-resizer ${isResizing ? 'active' : ''}`}
          onMouseDown={onResizeStart}
        />

        <div className="main-content-wrapper" style={{ 
          display: 'flex', 
          flex: 1, 
          overflow: 'hidden', 
          height: '100%',
          position: 'relative'
        }}>
          <div style={{ flex: 1, height: '100%', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
            {children}
          </div>
          {pdfViewer && (
            <>
              <div 
                className={`pdf-pane-resizer ${isResizingPdf ? 'active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsResizingPdf(true);
                }}
              />
              <div style={{ width: `${pdfWidth}px`, height: '100%', flexShrink: 0 }}>
                <PDFWorkspace
                  driveFileId={pdfViewer.driveFileId}
                  initialPage={pdfViewer.pageNum || pdfViewer.page_num}
                  filename={pdfViewer.filename}
                  highlightText={pdfViewer.highlightText}
                  onClose={onClosePdf}
                />
              </div>
            </>
          )}
        </div>

        <div 
          className={`topic-discovery-wrapper ${isTopicsOpen ? 'mobile-open' : ''} ${isResizingTopics ? 'resizing' : ''}`}
          style={{ 
            flex: windowWidth > 1024 ? `0 0 ${topicsWidth}px` : undefined,
            width: windowWidth > 1024 ? `${topicsWidth}px` : undefined,
            maxWidth: windowWidth > 1024 ? `${topicsWidth}px` : '100%'
          }}
        >
          <div 
            className={`sidebar-resizer right ${isResizingTopics ? 'active' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault();
              onTopicsResizeStart();
            }}
          />
          <TopicDiscovery
            topics={topics}
            suggestions={suggestions}
            onTopicClick={onTopicClick}
            onRefresh={onRefreshSuggestions}
            subjects={subjects}
            onOpenGraph={onOpenGraph}
            showGraph={showGraph}
          />
        </div>
      </div>

      {/* Status Bar */}
      <footer className={`app-statusbar ${isStatusExpanded ? 'expanded' : 'collapsed'}`}>
        <button
          className="mobile-status-toggle"
          onClick={() => setIsStatusExpanded(!isStatusExpanded)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--status-green)' }} />
            <span>System Status</span>
          </div>
        </button>

        <div className="statusbar-content">
          <div className="mobile-full-width">
            <SyncStatus syncStatus={syncStatus} onSync={onSync} onLogin={onLogin} authStatus={authStatus} />
          </div>

          {authStatus?.authenticated ? (
            <div className="status-item user-info-item">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span className="user-email" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: authStatus.authError ? 'var(--status-red)' : 'inherit'
                }}>
                  <User size={12} className={authStatus.authError ? '' : 'text-accent'} />
                  {authStatus.email}
                </span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <SyncStatus syncStatus={syncStatus} onSync={onSync} compact={true} onLogin={onLogin} authStatus={authStatus} />
                  <Tooltip text="Sign out of your account">
                    <button className="auth-btn logout" onClick={onLogout}>Logout</button>
                  </Tooltip>
                </div>
              </div>
            </div>
          ) : (
            <div className="status-item" style={{ marginLeft: 'auto' }}>
              <button className="auth-btn login" onClick={onLogin}>
                <User size={12} />
                Login with Google
              </button>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
