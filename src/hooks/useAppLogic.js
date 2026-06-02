import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useVoiceEngine } from './useVoiceEngine';
import { checkIsEntertainment, filterTreeNode } from '../utils/contentFilter';

const API = '';

/**
 * Custom orchestrator hook that acts as the core controller for data fetching,
 * chat sessions, library catalog synchronisation, and layout setting propagation.
 * 
 * DESIGN RATIONALE:
 * - Decouples state synchronization from the presentation components in App.jsx.
 * - Manages active model switching and token count cap warnings.
 * - Implements automated library refinement loops (auto-categorisation).
 * - Applies content filter to prevent entertainment or RPG-related nodes from leaking
 *   into professional contexts when the active tone is set to 'professional'.
 * 
 * @returns {Object} State maps and callback actions.
 */
export function useAppLogic() {
  const voiceEngine = useVoiceEngine();
  const refineAbortRef = useRef(false);
  const [authStatus, setAuthStatus] = useState({ authenticated: false });
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  // Chat interface states
  const [messages, setMessages] = useState([]);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const [topicsWidth, setTopicsWidth] = useState(320);
  const [isResizingTopics, setIsResizingTopics] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [gems, setGems] = useState([]);

  // Catalog Filter settings
  const [subjects, setSubjects] = useState(null);
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [subjectSource, setSubjectSource] = useState('folder'); // 'folder' or 'toc'
  const [currentModel, setCurrentModel] = useState('flash');

  // Token usages and App Modes
  const [usage, setUsage] = useState(null);
  const [appMode, setAppMode] = useState('kb'); // 'kb' or 'general'
  const [chatTone, _setChatTone] = useState('friendly');
  
  /**
   * Action handler for tone changes.
   */
  const setChatTone = useCallback((tone) => {
    console.log('[Action] Tone Change:', tone);
    _setChatTone(tone);
  }, []);
  
  const [canvasContent, setCanvasContent] = useState(null);
  const [isCanvasVisible, setIsCanvasVisible] = useState(false);

  // Auto-extracted topic maps
  const [topics, setTopics] = useState({});
  const [suggestions, setSuggestions] = useState([]);

  // Drive/Storage synchronisation indicators
  const [syncStatus, setSyncStatus] = useState(null);

  // Global Filter: Prune RPG/Entertainment content unconditionally
  const filteredSubjects = useMemo(() => {
    if (!subjects) return null;

    try {
      const result = filterTreeNode(subjects, 'professional');
      return result || subjects;
    } catch (err) {
      console.error('[Filtering] Subjects filter crashed:', err);
      return subjects;
    }
  }, [subjects]);

  /**
   * Filters the suggestions list to remove any entry that contains entertainment/RPG content
   * in ANY of its fields (question text, subject, filename, or topic label).
   * Checks each field independently to avoid || short-circuit bypass.
   */
  const filteredSuggestions = useMemo(() => {
    try {
      return suggestions.filter(s => {
        if (typeof s === 'string') return !checkIsEntertainment(s);
        // Check every relevant field independently — do NOT use || which short-circuits
        const isEntertainment = (
          checkIsEntertainment(s.suggested_question || '') ||
          checkIsEntertainment(s.subject || '') ||
          checkIsEntertainment(s.filename || '') ||
          checkIsEntertainment(s.topic || '')
        );
        return !isEntertainment;
      });
    } catch (err) {
      console.error('[Filtering] Suggestions filter crashed:', err);
      return suggestions;
    }
  }, [suggestions]);

  /**
   * Filters the topics map to remove any subject group or individual topic entry
   * that contains entertainment/RPG content in ANY of its fields.
   * Subject keys and each topic's topic/description/filename are checked independently.
   */
  const filteredTopics = useMemo(() => {
    if (!topics) return {};
    try {
      const newTopics = {};
      Object.keys(topics).forEach(subjectKey => {
        // Exclude entire subject group if the key itself is entertainment-related
        if (checkIsEntertainment(subjectKey)) return;
        const cleanItems = topics[subjectKey].filter(t => {
          // Check each field independently — do NOT use || which short-circuits
          const isEntertainment = (
            checkIsEntertainment(t.topic || '') ||
            checkIsEntertainment(t.description || '') ||
            checkIsEntertainment(t.filename || '') ||
            checkIsEntertainment(t.subject || '')
          );
          return !isEntertainment;
        });
        if (cleanItems.length > 0) {
          newTopics[subjectKey] = cleanItems;
        }
      });
      return newTopics;
    } catch (err) {
      console.error('[Filtering] Topics filter crashed:', err);
      return topics;
    }
  }, [topics]);

  // PDF splits and notebook pins
  const [pdfViewer, setPdfViewer] = useState(null);
  const [pinnedItems, setPinnedItems] = useState([]);

  // Modals visibility toggles
  const [showCapWarning, setShowCapWarning] = useState(false);
  const [pendingMessage, setPendingMessage] = useState(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [refineProgress, setRefineProgress] = useState({ current: 0, total: 0, currentFile: '' });
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [showGraph, setShowGraph] = useState(false);

  // Active UI theme configuration
  const [theme, setTheme] = useState(() => localStorage.getItem('app-theme') || 'dark');
  const [showCitations, setShowCitations] = useState(() => {
    const saved = localStorage.getItem('app-show-citations');
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [deletingSessionIds, setDeletingSessionIds] = useState(new Set());

  // Enforces general theme attribute triggers on document elements
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  const toggleCitations = useCallback(() => {
    setShowCitations(prev => {
      const next = !prev;
      localStorage.setItem('app-show-citations', JSON.stringify(next));
      return next;
    });
  }, []);

  /**
   * Performs high-throughput data loading across subjects, chat history, topics,
   * cost summaries, and workspace configurations in parallel.
   */
  const loadAppData = useCallback(async () => {
    try {
      const fetchJson = (url, defaultValue) => 
        fetch(`${API}${url}`)
          .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          })
          .catch(err => {
            console.warn(`[API] Failed to load ${url}:`, err);
            return defaultValue;
          });

      const [subjectsRes, sessionsRes, usageRes, topicsRes, suggestionsRes, statusRes, canvasRes, pinsRes, gemsRes] = await Promise.all([
        fetchJson(`/api/subjects?subjectSource=folder`, { name: 'All Subjects', children: [], documentCount: 0, path: '' }),
        fetchJson('/api/chat/history', []),
        fetchJson('/api/usage/summary', { month: { cost: 0 }, today: { cost: 0 }, percentage: 0 }),
        fetchJson('/api/subjects/topics', {}),
        fetchJson('/api/subjects/suggestions', []),
        fetchJson('/api/drive/status', { drive: { active: false }, indexing: { active: false } }),
        fetchJson('/api/settings/canvas', { content: null }),
        fetchJson('/api/notebook', []),
        fetchJson('/api/gems', [])
      ]);

      setSubjects(subjectsRes);
      setSessions(sessionsRes);
      setUsage(usageRes);
      setTopics(topicsRes);
      setSuggestions(suggestionsRes);
      setSyncStatus(statusRes);
      if (canvasRes && canvasRes.content) setCanvasContent(canvasRes.content);
      setPinnedItems(pinsRes || []);
      setGems((gemsRes || []).filter(g => g.id !== 'rule-expert'));
    } catch (err) {
      console.error('Critical failure in loadAppData:', err);
    }
  }, []);

  // Initial cold-boot data verification flow
  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/auth/status`).then(r => r.json()).catch(() => ({ authenticated: false })),
      fetch(`${API}/api/settings`).then(r => r.json()).catch(() => ({ isConfigured: false, preferredModel: 'flash' }))
    ]).then(([auth, settings]) => {
      setAuthStatus(auth);
      setSettings(settings);
      if (settings?.preferredModel) setCurrentModel(settings.preferredModel);
      setLoading(false);

      if (auth.authenticated && auth.isAuthorized && settings.isConfigured) {
        loadAppData();
      }
    }).catch(err => {
      console.error('Failed to load initial state:', err);
      setLoading(false);
    });
  }, [loadAppData]);

  // Refresh subjects automatically on configuration state changes
  useEffect(() => {
    if (authStatus.authenticated && authStatus.isAuthorized && settings?.isConfigured) {
      fetch(`${API}/api/subjects?subjectSource=folder`)
        .then(r => r.json())
        .then(setSubjects)
        .catch(err => console.error('Failed to refresh subjects:', err));
    }
  }, [authStatus.authenticated, authStatus.isAuthorized, settings?.isConfigured]);

  /**
   * Sends user chat message payload to active cognitive model.
   * 
   * @param {string} text Plain-text user message.
   * @param {string} forceModel Force a specific model target.
   * @param {string} image Base64 representation of attached visual imagery context.
   */
  const sendMessage = useCallback(async (text, forceModel, image = null) => {
    if (!text.trim() && !image) return;

    if (usage && usage.percentage >= 95) {
      setShowCapWarning(true);
      setPendingMessage(text);
      return;
    }

    const modelToUse = forceModel || currentModel;
    setMessages(prev => [...prev, { role: 'user', content: text, image }]);
    setIsTyping(true);

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          sessionId,
          subjects: selectedSubjects,
          model: modelToUse,
          appMode: appMode,
          tone: chatTone,
          image: image,
          showCitations: showCitations
        })
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `Server Error: ${res.status}`);
      }

      const data = await res.json();

      if (data.canvasUpdate) setCanvasContent(data.canvasUpdate);
      if (!sessionId && data.sessionId) setSessionId(data.sessionId);

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.response, 
        citations: data.citations || [],
        model: data.model,
        canvasUpdate: data.canvasUpdate,
        image: data.generatedImage,
        spokenSummary: data.spokenSummary
      }]);

      fetch(`${API}/api/usage/summary`).then(r => r.json()).then(setUsage);
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
  }, [sessionId, selectedSubjects, currentModel, chatTone, usage, appMode, showCitations]);

  // Voice Interaction Trigger: speak response summary upon reception
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant' && !isTyping) {
        const textToSpeak = lastMessage.spokenSummary || lastMessage.content;
        voiceEngine.speak(textToSpeak, chatTone);
      }
    }
  }, [messages, isTyping, chatTone, voiceEngine]);

  /**
   * Fetches suggested topics based on active selections.
   */
  const fetchSuggestions = useCallback(async (selected) => {
    try {
      const subjectsParam = selected.length > 0 ? `?subjects=${selected.map(encodeURIComponent).join(',')}` : '';
      const res = await fetch(`${API}/api/subjects/suggestions${subjectsParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSuggestions(data);
    } catch (err) {
      console.warn('[API] Failed to fetch suggestions:', err);
    }
  }, []);

  useEffect(() => {
    fetchSuggestions(selectedSubjects);
  }, [selectedSubjects, fetchSuggestions]);

  /**
   * Fiers a background Google Drive index sync routine.
   */
  const triggerSync = useCallback(async () => {
    setSyncStatus(prev => ({ 
      ...prev, 
      drive: { ...prev?.drive, active: true, phase: 'Initializing sync...' } 
    }));
    
    try {
      const res = await fetch(`${API}/api/drive/sync`, { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      
      await new Promise(r => setTimeout(r, 1000));

      const pollInterval = setInterval(async () => {
        try {
          const status = await fetch(`${API}/api/drive/status`).then(r => r.json());
          setSyncStatus(status);
          
          if (!status.drive.active && !status.indexing.active) {
            console.log('[Sync] Polling stopped - Sync Complete.');
            clearInterval(pollInterval);
            loadAppData();
          }
        } catch (pollErr) {
          console.error('[Sync] Polling error:', pollErr);
          clearInterval(pollInterval);
        }
      }, 2000);
    } catch (err) {
      console.error('[Sync] Failed to start sync:', err);
      setSyncStatus(prev => ({
        ...prev,
        drive: { ...prev.drive, active: false, error: err.message, phase: 'Failed to start' }
      }));
    }
  }, [loadAppData]);

  /**
   * Triggers global auto-classification refinement loop on uncategorised files.
   */
  const refineAllLibrary = async () => {
    if (isRefining) return;
    try {
      setIsRefining(true);
      setRefineProgress({ current: 0, total: 0, currentFile: 'Checking for updates...' });
      await fetch(`${API}/api/drive/sync`, { method: 'POST' });
      let isIndexing = true;
      while (isIndexing) {
        if (refineAbortRef.current) break;
        const status = await fetch(`${API}/api/drive/status`).then(r => r.json());
        if (!status.indexing.active && !status.drive.active) isIndexing = false;
        else {
          setRefineProgress({ 
            current: status.indexing.current || 0,
            total: status.indexing.total || 1,
            currentFile: status.indexing.currentFile ? `Indexing: ${status.indexing.currentFile}...` : 'Indexing new books...'
          });
          await new Promise(r => setTimeout(r, 2000));
        }
      }
      if (refineAbortRef.current) { setIsRefining(false); refineAbortRef.current = false; return; }
      const catalog = await fetch(`${API}/api/drive/catalog`).then(r => r.json());
      const needsRefine = [];
      const extractIds = (node) => {
        if (node.type === 'file') {
          const isUncategorised = !node.subject || ['Uncategorised', 'Uncategorized', 'Library', 'General'].includes(node.subject);
          const isShallow = (node.subject || '').split(' / ').filter(p => p.trim() !== '').length < 2;
          if (isUncategorised || isShallow) needsRefine.push({ id: node.driveFileId, name: node.name });
        }
        if (node.children) node.children.forEach(extractIds);
      };
      extractIds(catalog);
      if (needsRefine.length === 0) { setIsRefining(false); await loadAppData(); return; }
      setRefineProgress({ current: 0, total: needsRefine.length, currentFile: 'Organising library...' });
      for (let i = 0; i < needsRefine.length; i++) {
        if (refineAbortRef.current) break;
        setRefineProgress(prev => ({ ...prev, currentFile: `Refining: ${needsRefine[i].name}...` }));
        await fetch(`${API}/api/drive/auto-categorise`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driveFileIds: [needsRefine[i].id] })
        });
        setRefineProgress(prev => ({ ...prev, current: i + 1 }));
      }
      setIsRefining(false); refineAbortRef.current = false; await loadAppData(); 
    } catch (err) { console.error('Refinement failed:', err); setIsRefining(false); }
  };

  /**
   * Loads specific chat session history.
   */
  const loadSession = useCallback(async (id) => {
    try {
      const msgs = await fetch(`${API}/api/chat/history/${id}`).then(r => r.json());
      setSessionId(id);
      setMessages(msgs.map(m => ({
        role: m.role, content: m.content, citations: m.citations || [], model: m.model_used
      })));
    } catch (err) { console.error('Failed to load session:', err); }
  }, []);

  /**
   * Deletes a specific chat session record.
   */
  const deleteSession = useCallback(async (id) => {
    try {
      setDeletingSessionIds(prev => new Set(prev).add(id));
      await fetch(`${API}/api/chat/history/${id}`, { method: 'DELETE' });
      await new Promise(r => setTimeout(r, 600));
      setSessions(prev => prev.filter(s => s.id !== id));
      if (sessionId === id) { setSessionId(null); setMessages([]); }
    } catch (err) { 
      console.error('Failed to delete session:', err); 
    } finally {
      setDeletingSessionIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [sessionId]);

  /**
   * Purges all chat sessions.
   */
  const clearAllHistory = useCallback(async () => {
    if (isClearingHistory) return;
    setIsClearingHistory(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await fetch(`${API}/api/chat/history`, { method: 'DELETE' });
      setSessions([]);
      setMessages([]);
      setSessionId(null);
      if (appMode === 'general') setAppMode('kb');
    } catch (err) {
      console.error('Failed to clear history:', err);
    } finally {
      setIsClearingHistory(false);
    }
  }, [isClearingHistory, appMode]);

  /**
   * Updates preferred cognitive model in settings registry.
   */
  const updateModel = useCallback(async (model) => {
    console.log('[Action] Model Change:', model);
    setCurrentModel(model);
    await fetch(`${API}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferredModel: model })
    });
  }, []);

  /**
   * Pins or unpins a specific reference excerpt to the Notebook.
   */
  const handlePin = useCallback(async (citation, pinIdToDelete = null) => {
    if (pinIdToDelete) {
      setPinnedItems(prev => prev.filter(p => p.id !== pinIdToDelete));
      try {
        await fetch(`${API}/api/notebook/pin/${pinIdToDelete}`, { method: 'DELETE' });
      } catch (err) {
        console.error('Failed to unpin by ID:', err);
      }
      return;
    }
    
    if (!citation) return;
    
    const isPinned = pinnedItems.some(p => p.drive_file_id === citation.driveFileId && p.page_num === citation.pageNum);
    const id = `${citation.driveFileId}_${citation.pageNum}`;
    if (isPinned) {
      setPinnedItems(prev => prev.filter(p => p.id !== id));
      await fetch(`${API}/api/notebook/pin/${id}`, { method: 'DELETE' });
    } else {
      const newPin = { id, drive_file_id: citation.driveFileId, filename: citation.filename, page_num: citation.pageNum, excerpt: citation.excerpt };
      setPinnedItems(prev => [newPin, ...prev]);
      await fetch(`${API}/api/notebook/pin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newPin) });
    }
  }, [pinnedItems]);

  /**
   * Pulls dynamic Google Auth login URL and redirects browser to start session.
   */
  const handleLogin = async () => {
    const currentOrigin = window.location.origin;
    console.log('[Auth] Fetching redirect URL...');
    try {
      const data = await fetch(`${API}/api/auth/url?clientUrl=${encodeURIComponent(currentOrigin)}`).then(r => r.json());
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert('Authentication failed: No redirect URL received.');
      }
    } catch (err) {
      alert(`Authentication failed: ${err.message}`);
    }
  };

  /**
   * De-authorizes the session.
   */
  const handleLogout = async () => {
    await fetch(`${API}/api/auth/logout`, { method: 'POST' });
    setAuthStatus({ authenticated: false });
    await loadAppData();
  };

  /**
   * Activates or triggers secondary extension utilities.
   */
  const activateGem = useCallback(async (id) => {
    try {
      await fetch(`${API}/api/gems/activate/${id}`, { method: 'POST' });
      const gemsRes = await fetch(`${API}/api/gems`).then(r => r.json());
      setGems((gemsRes || []).filter(g => g.id !== 'rule-expert'));
    } catch (err) { console.error('Failed to activate gem:', err); }
  }, []);

  const refreshSuggestions = useCallback(async (subject) => {
    try {
      const url = subject && subject !== 'Everything' 
        ? `/api/subjects/suggestions?subjects=${encodeURIComponent(subject)}` 
        : '/api/subjects/suggestions';
      const res = await fetch(`${API}${url}`).then(r => r.json());
      setSuggestions(res || []);
    } catch (err) {
      console.error('Failed to refresh suggestions:', err);
    }
  }, []);

  const abortRefinement = useCallback(() => {
    refineAbortRef.current = true;
  }, []);

  const clearAllPins = useCallback(async () => {
    try {
      await fetch(`${API}/api/notebook/pins`, { method: 'DELETE' });
      setPinnedItems([]);
    } catch (err) {
      console.error('Failed to clear pins:', err);
    }
  }, []);

  return {
    state: {
      authStatus, settings, loading, messages, sidebarWidth, isResizing,
      sessionId, sessions, isTyping, 
      subjects: filteredSubjects, 
      selectedSubjects, currentModel,
      usage, appMode, chatTone, canvasContent, isCanvasVisible, 
      topics: filteredTopics,
      suggestions: filteredSuggestions, 
      syncStatus, pdfViewer, pinnedItems, showCapWarning,
      pendingMessage, showCatalog, showAdmin, isRefining, refineProgress, theme,
      gems, isClearingHistory, showCitations, topicsWidth, isResizingTopics, showGraph,
      subjectSource, deletingSessionIds
    },

    actions: {
      setAuthStatus, setSettings, setLoading, setMessages, setSidebarWidth,
      setIsResizing, setSessionId, setSessions, setIsTyping, setSubjects,
      setSelectedSubjects, setSubjectSource, setCurrentModel, setUsage, setAppMode, setChatTone,
      setCanvasContent, setIsCanvasVisible, setTopics, setSuggestions,
      setSyncStatus, setPdfViewer, setPinnedItems, setShowCapWarning,
      setPendingMessage, setShowCatalog, setShowAdmin, setIsRefining,
      setRefineProgress, loadAppData, sendMessage, triggerSync,
      refineAllLibrary, abortRefinement, loadSession, deleteSession, clearAllHistory, updateModel, handlePin, clearAllPins,
      handleLogin, handleLogout, toggleTheme, toggleCitations, activateGem, refreshSuggestions,
      setTopicsWidth, setIsResizingTopics, setShowGraph,
      voiceEngine
    }
  };
}
