import React, { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import OnboardingSetup from './components/OnboardingSetup';
import CatalogBrowser from './components/CatalogBrowser';
import { Sparkles, Trash2 } from 'lucide-react';

const API = '';

export default function App() {
  const [authStatus, setAuthStatus] = useState({ authenticated: false });
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [isTyping, setIsTyping] = useState(false);

  // Filter state
  const [subjects, setSubjects] = useState(null);
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [currentModel, setCurrentModel] = useState('flash');

  // Usage state
  const [usage, setUsage] = useState(null);

  // Topic state
  const [topics, setTopics] = useState({});
  const [suggestions, setSuggestions] = useState([]);

  // Sync state
  const [syncStatus, setSyncStatus] = useState(null);

  // PDF viewer state
  const [pdfViewer, setPdfViewer] = useState(null);

  // Spend cap warning
  const [showCapWarning, setShowCapWarning] = useState(false);
  const [pendingMessage, setPendingMessage] = useState(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [refineProgress, setRefineProgress] = useState({ current: 0, total: 0 });

  // Check initial status
  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/auth/status`).then(r => r.json()),
      fetch(`${API}/api/settings`).then(r => r.json())
    ]).then(([auth, settings]) => {
      setAuthStatus(auth);
      setSettings(settings);
      if (settings.preferredModel) setCurrentModel(settings.preferredModel);
      setLoading(false);

      if (auth.authenticated && auth.isAuthorized && settings.isConfigured) {
        loadAppData();
      }
    }).catch(err => {
      console.error('Failed to load initial state:', err);
      setLoading(false);
    });
  }, []);

  // Check for auth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success') {
      window.history.replaceState({}, '', '/');
      fetch(`${API}/api/auth/status`).then(r => r.json()).then(setAuthStatus);
      fetch(`${API}/api/settings`).then(r => r.json()).then(setSettings);
    }
  }, []);

  const loadAppData = useCallback(async () => {
    try {
      const [subjectsRes, sessionsRes, usageRes, topicsRes, suggestionsRes, statusRes] = await Promise.all([
        fetch(`${API}/api/subjects`).then(r => r.json()),
        fetch(`${API}/api/chat/history`).then(r => r.json()),
        fetch(`${API}/api/usage/summary`).then(r => r.json()),
        fetch(`${API}/api/subjects/topics`).then(r => r.json()),
        fetch(`${API}/api/subjects/suggestions`).then(r => r.json()),
        fetch(`${API}/api/drive/status`).then(r => r.json())
      ]);
      setSubjects(subjectsRes);
      setSessions(sessionsRes);
      setUsage(usageRes);
      setTopics(topicsRes);
      setSuggestions(suggestionsRes);
      setSyncStatus(statusRes);
    } catch (err) {
      console.error('Failed to load app data:', err);
    }
  }, []);

  const sendMessage = useCallback(async (text, forceModel) => {
    if (!text.trim()) return;

    // Check spend cap
    if (usage && usage.percentage >= 95) {
      setShowCapWarning(true);
      setPendingMessage(text);
      return;
    }

    const modelToUse = forceModel || currentModel;

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setIsTyping(true);

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          sessionId,
          subjects: selectedSubjects,
          model: modelToUse
        })
      });
      const data = await res.json();

      if (data.capWarning) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.response,
          citations: [],
          model: null
        }]);
        setIsTyping(false);
        return;
      }

      if (!sessionId && data.sessionId) {
        setSessionId(data.sessionId);
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response,
        citations: data.citations || [],
        model: data.model
      }]);

      // Refresh usage
      fetch(`${API}/api/usage/summary`).then(r => r.json()).then(setUsage);
      // Refresh sessions
      fetch(`${API}/api/chat/history`).then(r => r.json()).then(setSessions);

    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '❌ Failed to get a response. Please try again.',
        citations: [],
        model: null
      }]);
    }

    setIsTyping(false);
  }, [sessionId, selectedSubjects, currentModel, usage]);

  const refineAllLibrary = async () => {
    try {
      // Get all indexed documents first
      const statusRes = await fetch(`${API}/api/drive/catalog`);
      const catalog = await statusRes.json();
      
      // Flatten catalog to get all file IDs
      const allIds = [];
      const extractIds = (node) => {
        if (node.type === 'file') allIds.push(node.driveFileId);
        if (node.children) node.children.forEach(extractIds);
      };
      extractIds(catalog);

      if (allIds.length === 0) {
        alert('No books to refine.');
        return;
      }

      setIsRefining(true);
      setRefineProgress({ current: 0, total: allIds.length });

      // Process in batches of 10 for better robustness and progress tracking
      const batchSize = 10;
      for (let i = 0; i < allIds.length; i += batchSize) {
        if (window.refine_abort) break;
        
        const batch = allIds.slice(i, i + batchSize);
        await fetch(`${API}/api/drive/auto-categorize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driveFileIds: batch })
        });
        
        setRefineProgress(prev => ({ ...prev, current: Math.min(i + batchSize, allIds.length) }));
      }

      setIsRefining(false);
      window.refine_abort = false;
      await loadAppData(); // Refresh tree
    } catch (err) {
      console.error('Refinement failed:', err);
      setIsRefining(false);
      alert('AI refinement failed. Try again later.');
    }
  };

  const proceedDespiteCap = useCallback(() => {
    setShowCapWarning(false);
    if (pendingMessage) {
      const msg = pendingMessage;
      setPendingMessage(null);
      // Temporarily bypass cap check by calling directly
      const sendDirect = async () => {
        setMessages(prev => [...prev, { role: 'user', content: msg }]);
        setIsTyping(true);
        try {
          const res = await fetch(`${API}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg, sessionId, subjects: selectedSubjects, model: currentModel })
          });
          const data = await res.json();
          if (!sessionId && data.sessionId) setSessionId(data.sessionId);
          setMessages(prev => [...prev, {
            role: 'assistant', content: data.response,
            citations: data.citations || [], model: data.model
          }]);
          fetch(`${API}/api/usage/summary`).then(r => r.json()).then(setUsage);
          fetch(`${API}/api/chat/history`).then(r => r.json()).then(setSessions);
        } catch (err) {
          setMessages(prev => [...prev, {
            role: 'assistant', content: '❌ Failed to get a response.',
            citations: [], model: null
          }]);
        }
        setIsTyping(false);
      };
      sendDirect();
    }
  }, [pendingMessage, sessionId, selectedSubjects, currentModel]);

  const loadSession = useCallback(async (id) => {
    try {
      const msgs = await fetch(`${API}/api/chat/history/${id}`).then(r => r.json());
      setSessionId(id);
      setMessages(msgs.map(m => ({
        role: m.role,
        content: m.content,
        citations: m.citations || [],
        model: m.model_used
      })));
    } catch (err) {
      console.error('Failed to load session:', err);
    }
  }, []);

  const deleteSession = useCallback(async (id) => {
    try {
      await fetch(`${API}/api/chat/history/${id}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s.id !== id));
      if (sessionId === id) {
        setSessionId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  }, [sessionId]);

  const startNewChat = useCallback(() => {
    setSessionId(null);
    setMessages([]);
  }, []);

  const triggerSync = useCallback(async () => {
    try {
      await fetch(`${API}/api/drive/sync`, { method: 'POST' });
      // Poll for status
      const pollInterval = setInterval(async () => {
        const status = await fetch(`${API}/api/drive/status`).then(r => r.json());
        setSyncStatus(status);
        if (!status.drive.active && !status.indexing.active) {
          clearInterval(pollInterval);
          loadAppData();
        }
      }, 2000);
    } catch (err) {
      console.error('Sync failed:', err);
    }
  }, [loadAppData]);

  const handleSetupComplete = useCallback(() => {
    fetch(`${API}/api/settings`).then(r => r.json()).then(s => {
      setSettings(s);
      triggerSync();
    });
  }, [triggerSync]);

  const openPdfViewer = useCallback((driveFileId, pageNum, filename) => {
    setPdfViewer({ driveFileId, pageNum, filename });
  }, []);

  const updateSpendCap = useCallback(async (cap) => {
    await fetch(`${API}/api/usage/cap`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cap })
    });
    const u = await fetch(`${API}/api/usage/summary`).then(r => r.json());
    setUsage(u);
  }, []);

  const updateModel = useCallback(async (model) => {
    setCurrentModel(model);
    await fetch(`${API}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferredModel: model })
    });
  }, []);

  const handleTopicClick = useCallback((question) => {
    sendMessage(question);
  }, [sendMessage]);

  const refreshSuggestions = useCallback(async () => {
    const s = await fetch(`${API}/api/subjects/suggestions`).then(r => r.json());
    setSuggestions(s);
  }, []);

  if (loading) {
    return (
      <div className="onboarding-overlay">
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto 16px' }}></div>
          <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  // Show onboarding/login if not configured or not authorized
  if (!authStatus.isAuthorized || !settings?.isConfigured) {
    return (
      <OnboardingSetup
        authStatus={authStatus}
        onComplete={handleSetupComplete}
      />
    );
  }

  return (
    <>
      <Layout
        messages={messages}
        isTyping={isTyping}
        onSendMessage={sendMessage}
        sessions={sessions}
        activeSessionId={sessionId}
        onLoadSession={loadSession}
        onDeleteSession={deleteSession}
        onNewChat={startNewChat}
        subjects={subjects}
        selectedSubjects={selectedSubjects}
        onSubjectsChange={setSelectedSubjects}
        onRefineAll={refineAllLibrary}
        currentModel={currentModel}
        onModelChange={updateModel}
        usage={usage}
        topics={topics}
        suggestions={suggestions}
        onTopicClick={handleTopicClick}
        onRefreshSuggestions={refreshSuggestions}
        syncStatus={syncStatus}
        onSync={triggerSync}
        pdfViewer={pdfViewer}
        onOpenPdf={openPdfViewer}
        onClosePdf={() => setPdfViewer(null)}
        settings={settings}
        authStatus={authStatus}
        onOpenCatalog={() => setShowCatalog(true)}
      />

      {isRefining && (
        <div className="sub-modal-overlay" style={{ zIndex: 3000 }}>
          <div className="sub-modal processing">
            <div className="sub-modal-icon">
              <Sparkles size={32} className="spin-pulse" style={{ color: 'var(--accent-indigo-light)' }} />
            </div>
            <h3>Refining Library</h3>
            <p>AI is analyzing content and creating sub-categories...</p>
            
            <div className="deletion-status">
              <div className="progress-container">
                <div 
                  className="progress-bar" 
                  style={{ width: `${(refineProgress.current / refineProgress.total) * 100}%` }}
                ></div>
              </div>
              <p className="progress-text">
                Processing {refineProgress.current} of {refineProgress.total} books
              </p>
            </div>

            <div className="sub-modal-buttons">
              <button className="btn-flat" onClick={() => {
                window.refine_abort = true;
                setIsRefining(false);
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {showCapWarning && (
        <div className="warning-modal-overlay" onClick={() => { setShowCapWarning(false); setPendingMessage(null); }}>
          <div className="warning-modal" onClick={e => e.stopPropagation()}>
            <div className="warning-icon">⚠️</div>
            <h2>Approaching Spend Limit</h2>
            <p>
              You've used <strong>{usage?.percentage?.toFixed(1)}%</strong> of your monthly spend cap 
              (${usage?.month?.cost?.toFixed(4)} / ${usage?.spendCap?.toFixed(2)}).
              Continuing may incur additional costs.
            </p>
            <div className="warning-modal-buttons">
              <button className="btn-cancel" onClick={() => { setShowCapWarning(false); setPendingMessage(null); }}>Cancel</button>
              <button className="btn-proceed" onClick={proceedDespiteCap}>Proceed Anyway</button>
            </div>
          </div>
        </div>
      )}
      {showCatalog && (
        <CatalogBrowser 
          onClose={() => setShowCatalog(false)} 
          onOpenFile={(id, page, name) => {
            setShowCatalog(false);
            openPdfViewer(id, page, name);
          }}
        />
      )}
    </>
  );
}
