import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bell, Video, RefreshCw, ShieldCheck, AlertTriangle, Play, Battery,
  Wifi, Sparkles, Clock, CheckCircle, Flame, ExternalLink, Key, Check,
  Camera, Eye, Activity, ShieldAlert, X, Download, Maximize2, Pause,
  Volume2, UserCheck, Calendar, Filter, Film, BellOff, EyeOff
} from 'lucide-react';
import PortalShell from './PortalShell';
import { useSystemEvents } from '../../hooks/useSystemEvents';

/**
 * Synthesizes an authentic dual-tone Westminster/Ring doorbell chime using Web Audio API
 */
function playWebChime(type = 'ding') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const now = ctx.currentTime;

    if (type === 'ding') {
      // 2-tone chime: High bell (F#5 ~ 740 Hz) -> Low bell (D5 ~ 587 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(739.99, now);
      gain1.gain.setValueAtTime(0.35, now);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 1.2);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(587.33, now + 0.35);
      gain2.gain.setValueAtTime(0.4, now + 0.35);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.35);
      osc2.stop(now + 2.0);
    } else {
      // Motion alert tri-tone radar blip (E5 -> G5 -> B5)
      [659.25, 783.99, 987.77].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = now + idx * 0.12;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.45);
      });
    }
  } catch (err) {
    console.warn('Web Audio playback failed:', err);
  }
}

/**
 * Speaks the Yorkshire phrase through browser SpeechSynthesis in en-GB
 */
function speakAnnouncement(phrase) {
  if (!('speechSynthesis' in window) || !phrase) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.lang = 'en-GB';
    utterance.rate = 1.0;
    utterance.pitch = 0.95;
    const voices = window.speechSynthesis.getVoices();
    const ukVoice = voices.find(v => v.lang === 'en-GB' || v.name.includes('UK') || v.name.includes('British'));
    if (ukVoice) utterance.voice = ukVoice;
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Speech synthesis failed:', err);
  }
}

/**
 * Speaks the Yorkshire phrase using IMS Gemini TTS (POST /api/voice/tts)
 * with graceful fallback to browser SpeechSynthesis
 */
// One announcement at a time, each alert once: the live event and the Test button's own reply
// describe the same alert, so it's keyed by event + camera + time.
let currentAudio = null;
const announced = new Set();
let testChimePlayedAt = 0;

function stopAnnouncement() {
  if (currentAudio) { try { currentAudio.pause(); } catch (_) { } currentAudio = null; }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

function announceAlert(alert, { chime = true } = {}) {
  if (!alert?.event) return;
  const key = `${alert.event}|${alert.cameraId || alert.cameraName}|${alert.timestamp}`;
  if (announced.has(key)) return;
  announced.add(key);
  // The Box-3's top button is in MIC MUTED (Ims's silent mode): no chime, no voice here either.
  if (alert.deviceMuted) return;
  if (announced.size > 50) announced.delete(announced.values().next().value);
  // the Test button already chimed the moment it was pressed
  if (chime && !(alert.isTest && Date.now() - testChimePlayedAt < 15000)) playWebChime(alert.event);
  if (alert.yorkshirePhrase) playImsVoice(alert.yorkshirePhrase);
}

async function playImsVoice(phrase) {
  if (!phrase) return;
  stopAnnouncement();
  try {
    const res = await fetch('/api/voice/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: phrase })
    });
    if (res.ok) {
      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      stopAnnouncement(); // another announcement may have started while this one was fetched
      const audio = new Audio(audioUrl);
      currentAudio = audio;
      audio.onended = () => { URL.revokeObjectURL(audioUrl); if (currentAudio === audio) currentAudio = null; };
      try {
        await audio.play();
        return;
      } catch (playErr) {
        console.warn('[IMS Audio] Audio play error:', playErr);
      }
    }
  } catch (err) {
    console.warn('[IMS Audio] TTS audio stream fetch failed, falling back to Web Speech:', err);
  }
  // Fallback to speech synthesis if network fails or API offline
  speakAnnouncement(phrase);
}

export default function DoorbellPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';

  const [activeTab, setActiveTab] = useState('live'); // 'live' | 'recordings'
  const [statusData, setStatusData] = useState(null);
  const [events, setEvents] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [recordingFilter, setRecordingFilter] = useState('all'); // 'all' | 'motion' | 'ding' | 'person'
  const [selectedRecording, setSelectedRecording] = useState(null);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [videoDirectUrl, setVideoDirectUrl] = useState(null);
  const [videoLoading, setVideoLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [testingDing, setTestingDing] = useState(false);
  const [testingMotion, setTestingMotion] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  // Notification toggles state (Ding & Motion notifications by IMS)
  const [notificationSettings, setNotificationSettings] = useState({
    dingEnabled: true,
    motionEnabled: true
  });

  // Live snapshot state
  const [snapshotUrls, setSnapshotUrls] = useState({});
  const [snapshotTimestamps, setSnapshotTimestamps] = useState({});
  const [loadingSnapshot, setLoadingSnapshot] = useState({});
  const [liveAutoRefresh, setLiveAutoRefresh] = useState(false);
  const autoRefreshIntervalRef = useRef(null);

  const showNotification = (text, type = 'success') => {
    setActionMessage({ text, type });
    setTimeout(() => setActionMessage(null), 5000);
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/doorbell/status');
      if (res.ok) {
        const data = await res.json();
        setStatusData(data);
      }
    } catch (err) {
      console.error('Failed to fetch doorbell status:', err);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/doorbell/settings');
      if (res.ok) {
        const data = await res.json();
        setNotificationSettings({
          dingEnabled: data.dingEnabled !== false,
          motionEnabled: data.motionEnabled !== false
        });
      }
    } catch (err) {
      console.error('Failed to fetch doorbell notification settings:', err);
    }
  }, []);

  const handleToggleSetting = async (key) => {
    const nextVal = !notificationSettings[key];
    const nextSettings = { ...notificationSettings, [key]: nextVal };
    setNotificationSettings(nextSettings);
    try {
      const res = await fetch('/api/doorbell/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextSettings)
      });
      if (res.ok) {
        showNotification(
          `${key === 'dingEnabled' ? 'Doorbell Press' : 'Motion Detection'} notifications ${nextVal ? 'turned ON' : 'turned OFF'}`
        );
      }
    } catch (err) {
      showNotification('Failed to save notification toggle', 'error');
    }
  };

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/doorbell/events?limit=30');
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (err) {
      console.error('Failed to fetch doorbell events:', err);
    }
  }, []);

  const fetchRecordings = useCallback(async () => {
    setRecordingsLoading(true);
    try {
      const res = await fetch('/api/doorbell/recordings?limit=40');
      if (res.ok) {
        const data = await res.json();
        setRecordings(data.events || []);
      }
    } catch (err) {
      console.error('Failed to fetch doorbell cloud recordings:', err);
    } finally {
      setRecordingsLoading(false);
    }
  }, []);

  const handleFetchSnapshot = useCallback(async (cameraId) => {
    if (!cameraId) return;
    setLoadingSnapshot((prev) => ({ ...prev, [cameraId]: true }));
    try {
      const res = await fetch(`/api/doorbell/snapshot/${cameraId}?t=${Date.now()}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setSnapshotUrls((prev) => ({ ...prev, [cameraId]: url }));
        setSnapshotTimestamps((prev) => ({
          ...prev,
          [cameraId]: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        }));
      } else {
        showNotification('Could not grab snapshot from Ring camera', 'error');
      }
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setLoadingSnapshot((prev) => ({ ...prev, [cameraId]: false }));
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStatus(), fetchEvents(), fetchRecordings(), fetchSettings()]);
    setLoading(false);
  }, [fetchStatus, fetchEvents, fetchRecordings, fetchSettings]);

  // Real-time SSE updates: update status, events, chime, and vocal announcement immediately
  useSystemEvents('doorbell:ding', (alert) => {
    fetchStatus();
    fetchEvents();
    fetchRecordings();

    if (alert?.event) {
      const isDing = alert.event === 'ding';
      const isMuted = isDing ? !notificationSettings.dingEnabled : !notificationSettings.motionEnabled;

      if (!isMuted) announceAlert(alert);
      showNotification(`🚨 ${alert.event.toUpperCase()}: ${alert.cameraName} (${alert.yorkshirePhrase || ''})`);

      // Refresh snapshot of the camera that triggered
      if (alert.cameraId) {
        handleFetchSnapshot(alert.cameraId);
      }
    }
  }, [fetchStatus, fetchEvents, fetchRecordings, handleFetchSnapshot, notificationSettings]);

  useSystemEvents('doorbell:cleared', () => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      fetchStatus();
      fetchEvents();
    }, 60000);
    return () => clearInterval(interval);
  }, [loadData, fetchStatus, fetchEvents]);

  // Initial snapshot grab for primary camera on load
  useEffect(() => {
    if (statusData?.cameras?.length > 0) {
      const primaryCamId = statusData.cameras[0].id;
      if (!snapshotUrls[primaryCamId] && !loadingSnapshot[primaryCamId]) {
        handleFetchSnapshot(primaryCamId);
      }
    }
  }, [statusData, snapshotUrls, loadingSnapshot, handleFetchSnapshot]);

  // Live Auto-refresh timer management
  useEffect(() => {
    if (liveAutoRefresh && statusData?.cameras?.length > 0) {
      const primaryCamId = statusData.cameras[0].id;
      autoRefreshIntervalRef.current = setInterval(() => {
        handleFetchSnapshot(primaryCamId);
      }, 5000);
    } else {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
        autoRefreshIntervalRef.current = null;
      }
    }
    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
      }
    };
  }, [liveAutoRefresh, statusData, handleFetchSnapshot]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchStatus(), fetchEvents(), fetchRecordings()]);
    if (statusData?.cameras?.length > 0) {
      await handleFetchSnapshot(statusData.cameras[0].id);
    }
    setRefreshing(false);
    showNotification('Doorbell status, snapshot, and event timeline updated');
  };

  const handleReconnect = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/doorbell/reconnect', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotification('Successfully reconnected to Ring API');
      } else {
        showNotification(data.lastError || 'Reconnect failed', 'error');
      }
      await fetchStatus();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSaveToken = async (e) => {
    e?.preventDefault();
    if (!tokenInput.trim()) return;
    setSavingToken(true);
    try {
      const res = await fetch('/api/doorbell/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput.trim() })
      });
      const data = await res.json();
      if (data.success) {
        showNotification('Ring Refresh Token verified and saved successfully');
        setTokenModalOpen(false);
        setTokenInput('');
        await loadData();
      } else {
        showNotification(data.error || 'Failed to authenticate token with Ring', 'error');
      }
      await fetchStatus();
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setSavingToken(false);
    }
  };

  const handleTestAlert = async (eventType) => {
    if (eventType === 'ding') setTestingDing(true);
    else setTestingMotion(true);

    try {
      // Audible chime immediately upon user interaction
      playWebChime(eventType);
      testChimePlayedAt = Date.now();

      const res = await fetch('/api/doorbell/test-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType, cameraName: 'Front Door' })
      });
      const data = await res.json();
      if (data.success) {
        // same alert as the live event - whichever arrives first speaks it, once
        announceAlert(data.alert);
        showNotification(
          `Test ${eventType === 'ding' ? 'Doorbell Ding' : 'Motion'} chime & IMS voice announcement played!`,
          'success'
        );
        await Promise.all([fetchStatus(), fetchEvents(), fetchRecordings()]);
      } else {
        showNotification(data.error || 'Failed to trigger test alert', 'error');
      }
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      if (eventType === 'ding') setTestingDing(false);
      else setTestingMotion(false);
    }
  };

  const handleOpenVideoModal = async (recording) => {
    setSelectedRecording(recording);
    setVideoModalOpen(true);
    setVideoLoading(true);
    setVideoDirectUrl(null);

    try {
      const res = await fetch(`/api/doorbell/recordings/${recording.id}/url`);
      if (res.ok) {
        const data = await res.json();
        setVideoDirectUrl(data.url);
      }
    } catch (err) {
      console.warn('Could not fetch direct video URL:', err);
    } finally {
      setVideoLoading(false);
    }
  };

  const filteredRecordings = recordings.filter((rec) => {
    if (recordingFilter === 'all') return true;
    if (recordingFilter === 'motion') return rec.kind === 'motion';
    if (recordingFilter === 'ding') return rec.kind === 'ding';
    if (recordingFilter === 'person') return rec.personDetected;
    return true;
  });

  const isConnected = statusData?.status === 'connected';
  const isConnecting = statusData?.status === 'connecting' || statusData?.isConnecting;
  const cameras = statusData?.cameras || [];
  const activeAlert = statusData?.activeAlert;
  const primaryCamera = cameras.length > 0 ? cameras[0] : null;

  return (
    <PortalShell
      title="Doorbell Service"
      subtitle="Direct Ring API Integration with real-time SIP/WebSocket event streaming, live feed & recordings playback"
      icon={Bell}
      theme={theme}
      onThemeToggle={onThemeToggle}
      setCurrentPath={setCurrentPath}
      headerActions={
        <div className="flex items-center gap-2">
          {/* View Tab Switcher */}
          <div className="flex items-center rounded-lg bg-black/30 p-1 border border-white/10 text-xs mr-2">
            <button
              onClick={() => setActiveTab('live')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-semibold transition-all ${
                activeTab === 'live'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Live & Activity</span>
            </button>
            <button
              onClick={() => setActiveTab('recordings')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md font-semibold transition-all ${
                activeTab === 'recordings'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Motion Recordings</span>
              {recordings.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-black/40 text-amber-200">
                  {recordings.length}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={() => setTokenModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 border border-violet-500/20 transition-colors"
          >
            <Key className="w-3.5 h-3.5" />
            <span>Configure Token</span>
          </button>
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      }
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Banner Alert if triggered */}
        {activeAlert && (
          <div className={`p-4 rounded-xl border flex items-center justify-between gap-4 animate-pulse shadow-lg ${
            activeAlert.event === 'ding'
              ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
              : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
          }`}>
            <div className="flex items-center gap-3">
              {activeAlert.event === 'ding' ? (
                <Bell className="w-6 h-6 text-amber-400 animate-bounce" />
              ) : (
                <Eye className="w-6 h-6 text-cyan-400" />
              )}
              <div>
                <div className="font-bold text-sm tracking-wide flex items-center gap-2">
                  <span>ACTIVE ALERT: {activeAlert.event.toUpperCase()} DETECTED AT {activeAlert.cameraName.toUpperCase()}</span>
                  {activeAlert.isTest && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 font-bold uppercase">
                      Test
                    </span>
                  )}
                </div>
                <div className="text-xs opacity-80 mt-0.5 flex items-center gap-2">
                  <Volume2 className="w-3 h-3 text-amber-400" />
                  <span>Announcement: &quot;{activeAlert.yorkshirePhrase}&quot; ({activeAlert.timeFormatted})</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => playWebChime(activeAlert.event)}
                className="text-xs px-2.5 py-1 rounded bg-black/40 hover:bg-black/60 border border-white/10 font-mono text-white flex items-center gap-1.5"
              >
                <Volume2 className="w-3 h-3" />
                <span>Re-play Chime</span>
              </button>
              <div className="text-xs px-2.5 py-1 rounded bg-black/40 border border-white/10 font-mono">
                Live Trigger
              </div>
            </div>
          </div>
        )}

        {/* Global Action Banner Notification */}
        {actionMessage && (
          <div className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
            actionMessage.type === 'error'
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
          }`}>
            {actionMessage.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            ) : (
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
        )}

        {/* Status & Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Connection Status Card */}
          <div className={`p-4 rounded-xl border ${
            isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-2">
              <span>RING API CONNECTION</span>
              <span className={`w-2.5 h-2.5 rounded-full ${
                isConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' :
                isConnecting ? 'bg-amber-400 animate-ping' :
                'bg-rose-400'
              }`} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-white capitalize">
                {statusData?.status || 'Loading...'}
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-1 flex items-center justify-between">
              <span>{statusData?.configured ? '2FA Token Active' : 'No Token Configured'}</span>
              {statusData?.configured && (
                <button
                  onClick={handleReconnect}
                  disabled={refreshing}
                  className="text-indigo-400 hover:text-indigo-300 font-medium underline cursor-pointer text-[11px]"
                >
                  Reconnect
                </button>
              )}
            </div>
          </div>

          {/* Active Cameras Card */}
          <div className={`p-4 rounded-xl border ${
            isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-2">
              <span>DISCOVERED CAMERAS</span>
              <Video className="w-4 h-4 text-violet-400" />
            </div>
            <div className="text-xl font-bold tracking-tight text-white">
              {cameras.length} {cameras.length === 1 ? 'Device' : 'Devices'}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {primaryCamera ? `${primaryCamera.name} (${primaryCamera.batteryLevel ?? 100}% battery)` : 'SIP / WebSockets ready'}
            </div>
          </div>

          {/* Persona Spoken Alerts Card */}
          <div className={`p-4 rounded-xl border ${
            isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-2">
              <span>SPOKEN ANNOUNCEMENTS</span>
              <Sparkles className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-bold tracking-tight text-amber-400">
              Yorkshire Dialect
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Dual-tone Chime + en-GB Voice Turn
            </div>
          </div>

          {/* Cloud Recordings Counter Card */}
          <div className={`p-4 rounded-xl border ${
            isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-2">
              <span>CLOUD RECORDINGS</span>
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-bold tracking-tight text-emerald-400">
              {recordings.length} Events Synced
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Direct MP4 streaming with Range support
            </div>
          </div>
        </div>

        {/* Action Bar / Notification Controls & Test Triggers */}
        <div className={`p-4 rounded-xl border space-y-4 ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                Direct Alert Audio & Hardware Verification
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Plays an authentic dual-tone chime and genuine Yorkshire voice announcement in your browser, pushes alert frames to the ESP32-S3-BOX-3, and triggers Gemini voice brain.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleTestAlert('ding')}
                disabled={testingDing}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>{testingDing ? 'Announcing...' : 'Test Doorbell Ding'}</span>
              </button>
              <button
                onClick={() => handleTestAlert('motion')}
                disabled={testingMotion}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{testingMotion ? 'Announcing...' : 'Test Motion Alert'}</span>
              </button>
            </div>
          </div>

          {/* Notification Toggles Bar */}
          <div className="pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-1.5 text-slate-400 font-medium">
              <Volume2 className="w-3.5 h-3.5 text-amber-400" />
              <span>IMS Notification Toggles:</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Doorbell Ding Toggle */}
              <button
                type="button"
                onClick={() => handleToggleSetting('dingEnabled')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all cursor-pointer font-medium ${
                  notificationSettings.dingEnabled
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
                }`}
              >
                {notificationSettings.dingEnabled ? (
                  <Bell className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <BellOff className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span>Doorbell Chime & Voice:</span>
                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                  notificationSettings.dingEnabled
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {notificationSettings.dingEnabled ? 'ON' : 'OFF'}
                </span>
              </button>

              {/* Motion Detection Toggle */}
              <button
                type="button"
                onClick={() => handleToggleSetting('motionEnabled')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all cursor-pointer font-medium ${
                  notificationSettings.motionEnabled
                    ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
                }`}
              >
                {notificationSettings.motionEnabled ? (
                  <Eye className="w-3.5 h-3.5 text-cyan-400" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span>Motion Detection Alerts:</span>
                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                  notificationSettings.motionEnabled
                    ? 'bg-cyan-400 text-slate-950'
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {notificationSettings.motionEnabled ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* TAB 1: LIVE FEED & TIMELINE */}
        {activeTab === 'live' && (
          <div className="space-y-6">
            {/* Live Camera Feed Card */}
            {primaryCamera && (
              <div className={`rounded-2xl border overflow-hidden ${
                isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
              }`}>
                {/* Live Feed Header Bar */}
                <div className="p-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 bg-black/30">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-2.5 w-2.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                    </span>
                    <span className="font-bold text-sm text-white tracking-wide uppercase">
                      Live Feed • {primaryCamera.name}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-slate-400">
                      {primaryCamera.location}
                    </span>
                    {primaryCamera.batteryLevel !== null && (
                      <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 font-mono text-emerald-400 flex items-center gap-1">
                        <Battery className="w-3 h-3" />
                        {primaryCamera.batteryLevel}%
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Auto-refresh toggle */}
                    <button
                      onClick={() => setLiveAutoRefresh(!liveAutoRefresh)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        liveAutoRefresh
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-white/5 hover:bg-white/10 text-white/70 border border-white/10'
                      }`}
                    >
                      {liveAutoRefresh ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                      <span>{liveAutoRefresh ? 'Auto-Refresh (5s) ON' : 'Enable Auto-Refresh'}</span>
                    </button>

                    {/* Manual Capture */}
                    <button
                      onClick={() => handleFetchSnapshot(primaryCamera.id)}
                      disabled={loadingSnapshot[primaryCamera.id]}
                      className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Camera className={`w-3.5 h-3.5 ${loadingSnapshot[primaryCamera.id] ? 'animate-spin' : ''}`} />
                      <span>{loadingSnapshot[primaryCamera.id] ? 'Capturing...' : 'Capture Snapshot'}</span>
                    </button>
                  </div>
                </div>

                {/* Viewport Canvas */}
                <div className="relative aspect-video max-h-[520px] bg-slate-950 flex items-center justify-center overflow-hidden">
                  {snapshotUrls[primaryCamera.id] ? (
                    <img
                      src={snapshotUrls[primaryCamera.id]}
                      alt={primaryCamera.name}
                      className="w-full h-full object-contain select-none"
                    />
                  ) : (
                    <div className="text-center p-8 space-y-3">
                      <Camera className="w-12 h-12 text-slate-700 mx-auto animate-pulse" />
                      <p className="text-sm font-medium text-slate-400">Camera ready for live snapshot grab</p>
                      <button
                        onClick={() => handleFetchSnapshot(primaryCamera.id)}
                        disabled={loadingSnapshot[primaryCamera.id]}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all cursor-pointer"
                      >
                        Grab Live Snapshot
                      </button>
                    </div>
                  )}

                  {/* Viewport Overlays */}
                  <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] font-mono text-emerald-400 border border-white/10 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>SIP STREAM ACTIVE</span>
                  </div>

                  {snapshotTimestamps[primaryCamera.id] && (
                    <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] font-mono text-white/80 border border-white/10">
                      Captured at {snapshotTimestamps[primaryCamera.id]}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Main Grid: Cameras List & Live Event Log */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Cameras Panel (Col 1) */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-300 flex items-center justify-between">
                  <span>Connected Ring Devices</span>
                  <span className="text-xs text-slate-500 font-mono">{cameras.length} found</span>
                </h3>

                {cameras.length === 0 ? (
                  <div className={`p-6 rounded-xl border text-center ${
                    isDark ? 'bg-slate-900/40 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <Video className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-400">No Ring cameras connected</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Configure your Ring 2FA Refresh Token using the button above to discover your doorbells and floodlight cameras.
                    </p>
                    <button
                      onClick={() => setTokenModalOpen(true)}
                      className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white"
                    >
                      Enter Refresh Token
                    </button>
                  </div>
                ) : (
                  cameras.map((camera) => (
                    <div
                      key={camera.id}
                      className={`p-4 rounded-xl border space-y-3 ${
                        isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-bold text-sm text-white flex items-center gap-1.5">
                            <Bell className="w-3.5 h-3.5 text-amber-400" />
                            <span>{camera.name}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                            ID: {camera.id} • {camera.location}
                          </div>
                        </div>
                        {camera.batteryLevel !== null && (
                          <div className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-emerald-400">
                            <Battery className="w-3 h-3" />
                            <span>{camera.batteryLevel}%</span>
                          </div>
                        )}
                      </div>

                      {/* Snapshot View */}
                      {snapshotUrls[camera.id] ? (
                        <div className="relative rounded-lg overflow-hidden border border-white/10 bg-black aspect-video">
                          <img
                            src={snapshotUrls[camera.id]}
                            alt={camera.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute bottom-1 right-1 bg-black/70 px-2 py-0.5 rounded text-[10px] text-white/70 font-mono">
                            Live Snapshot
                          </div>
                        </div>
                      ) : null}

                      <div className="flex items-center justify-between pt-1 border-t border-white/5">
                        <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Live SIP Stream Active
                        </span>
                        <button
                          onClick={() => handleFetchSnapshot(camera.id)}
                          disabled={loadingSnapshot[camera.id]}
                          className="text-[11px] px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-white/80 font-medium flex items-center gap-1 border border-white/10 cursor-pointer"
                        >
                          <Camera className="w-3 h-3" />
                          <span>{loadingSnapshot[camera.id] ? 'Capturing...' : 'Grab Snapshot'}</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Event History Timeline (Cols 2-3) */}
              <div className="lg:col-span-2 space-y-4">
                <h3 className="text-sm font-semibold text-slate-300 flex items-center justify-between">
                  <span>Recent Doorbell & Motion Activity</span>
                  <span className="text-xs text-slate-500 font-mono">{events.length} local logs</span>
                </h3>

                <div className={`rounded-xl border divide-y overflow-hidden ${
                  isDark ? 'bg-slate-900/60 border-slate-800 divide-slate-800' : 'bg-white border-slate-200 divide-slate-200'
                }`}>
                  {events.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      No doorbell dings or motion events recorded yet. Press &quot;Test Doorbell Ding&quot; to simulate.
                    </div>
                  ) : (
                    events.map((ev) => (
                      <div key={ev.id} className="p-3.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${
                            ev.event_type === 'ding'
                              ? 'bg-amber-500/15 text-amber-400'
                              : 'bg-cyan-500/15 text-cyan-400'
                          }`}>
                            {ev.event_type === 'ding' ? <Bell className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                              <span className="capitalize">{ev.event_type === 'ding' ? 'Doorbell Button Press' : 'Motion Detected'}</span>
                              <span className="text-slate-500">•</span>
                              <span className="text-slate-300 font-normal">{ev.camera_name}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {new Date(ev.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} at{' '}
                              {new Date(ev.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              {ev.battery_level ? ` • Battery: ${ev.battery_level}%` : ''}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                            ev.event_type === 'ding'
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                              : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                          }`}>
                            {ev.event_type}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CLOUD RECORDINGS GALLERY */}
        {activeTab === 'recordings' && (
          <div className="space-y-6">
            {/* Filter Bar */}
            <div className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
              isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-semibold text-slate-300">Filter Events:</span>
                <div className="flex items-center gap-1.5 ml-2">
                  <button
                    onClick={() => setRecordingFilter('all')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      recordingFilter === 'all'
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-white/5 hover:bg-white/10 text-white/70'
                    }`}
                  >
                    All ({recordings.length})
                  </button>
                  <button
                    onClick={() => setRecordingFilter('motion')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                      recordingFilter === 'motion'
                        ? 'bg-cyan-500 text-slate-950'
                        : 'bg-white/5 hover:bg-white/10 text-cyan-400'
                    }`}
                  >
                    <Eye className="w-3 h-3" />
                    <span>Motion ({recordings.filter(r => r.kind === 'motion').length})</span>
                  </button>
                  <button
                    onClick={() => setRecordingFilter('ding')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                      recordingFilter === 'ding'
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-white/5 hover:bg-white/10 text-amber-400'
                    }`}
                  >
                    <Bell className="w-3 h-3" />
                    <span>Doorbell Dings ({recordings.filter(r => r.kind === 'ding').length})</span>
                  </button>
                  <button
                    onClick={() => setRecordingFilter('person')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                      recordingFilter === 'person'
                        ? 'bg-purple-500 text-white'
                        : 'bg-white/5 hover:bg-white/10 text-purple-400'
                    }`}
                  >
                    <UserCheck className="w-3 h-3" />
                    <span>Person Detected ({recordings.filter(r => r.personDetected).length})</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchRecordings}
                  disabled={recordingsLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${recordingsLoading ? 'animate-spin' : ''}`} />
                  <span>Sync Cloud Events</span>
                </button>
              </div>
            </div>

            {/* Recordings Grid */}
            {recordingsLoading ? (
              <div className="p-12 text-center text-slate-400 text-xs space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-400" />
                <p>Loading historical motion recordings from Ring cloud...</p>
              </div>
            ) : filteredRecordings.length === 0 ? (
              <div className={`p-12 rounded-xl border text-center text-slate-500 text-xs ${
                isDark ? 'bg-slate-900/40 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <Film className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="font-semibold text-slate-400">No recordings match the selected filter</p>
                <p className="text-[11px] text-slate-500 mt-1">Try switching to &quot;All&quot; or trigger a test motion alert.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredRecordings.map((recording) => (
                  <div
                    key={recording.id}
                    onClick={() => handleOpenVideoModal(recording)}
                    className={`group rounded-xl border overflow-hidden transition-all duration-200 hover:border-amber-500/50 hover:shadow-xl cursor-pointer ${
                      isDark ? 'bg-slate-900/70 border-slate-800' : 'bg-white border-slate-200'
                    }`}
                  >
                    {/* Thumbnail Header Area */}
                    <div className="relative aspect-video bg-slate-950 flex items-center justify-center overflow-hidden">
                      {/* Dark overlay backdrop */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40 z-10" />

                      {/* Play Button Icon */}
                      <div className="relative z-20 w-12 h-12 rounded-full bg-amber-500/90 text-slate-950 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-amber-400 transition-all">
                        <Play className="w-5 h-5 ml-0.5 fill-current" />
                      </div>

                      {/* Top Badges */}
                      <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                          recording.kind === 'ding'
                            ? 'bg-amber-500 text-slate-950'
                            : recording.kind === 'on_demand'
                            ? 'bg-violet-600 text-white'
                            : 'bg-cyan-500 text-slate-950'
                        }`}>
                          {recording.kind === 'ding' ? 'Doorbell Ding' : recording.kind === 'on_demand' ? 'Live View' : 'Motion'}
                        </span>

                        {recording.personDetected && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500 text-white flex items-center gap-1">
                            <UserCheck className="w-3 h-3" />
                            <span>Person</span>
                          </span>
                        )}
                      </div>

                      {/* Bottom Duration Badge */}
                      {recording.duration && (
                        <div className="absolute bottom-2.5 right-2.5 z-20 bg-black/80 px-2 py-0.5 rounded text-[11px] font-mono text-white/90">
                          {recording.duration}s
                        </div>
                      )}
                    </div>

                    {/* Content Details */}
                    <div className="p-3.5 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-white group-hover:text-amber-400 transition-colors">
                          {recording.cameraName}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          {recording.timeFormatted}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-white/5">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{recording.dateFormatted}</span>
                        </span>
                        <span className="text-amber-400/90 group-hover:underline flex items-center gap-1 font-medium">
                          <span>Watch Recording</span>
                          <Play className="w-2.5 h-2.5 fill-current" />
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Video Playback Modal */}
        {videoModalOpen && selectedRecording && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className={`w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden ${
              isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
            }`}>
              {/* Header */}
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/40">
                <div className="flex items-center gap-2.5">
                  <div className={`p-1.5 rounded-lg ${
                    selectedRecording.kind === 'ding' ? 'bg-amber-500/20 text-amber-400' : 'bg-cyan-500/20 text-cyan-400'
                  }`}>
                    {selectedRecording.kind === 'ding' ? <Bell className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">
                      {selectedRecording.kind === 'ding' ? 'Doorbell Chime Recording' : 'Motion Detected Recording'}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {selectedRecording.cameraName} • {selectedRecording.dateFormatted} at {selectedRecording.timeFormatted}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setVideoModalOpen(false)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Video Player */}
              <div className="relative aspect-video bg-black flex items-center justify-center">
                <video
                  key={selectedRecording.id}
                  controls
                  autoPlay
                  playsInline
                  src={`/api/doorbell/recordings/${selectedRecording.id}/video`}
                  className="w-full h-full object-contain"
                >
                  {videoDirectUrl && <source src={videoDirectUrl} type="video/mp4" />}
                  Your browser does not support HTML5 video playback.
                </video>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 bg-black/20 text-xs">
                <div className="flex items-center gap-3">
                  <span className="text-slate-400">
                    Event ID: <span className="font-mono text-white/80">{selectedRecording.id}</span>
                  </span>
                  {selectedRecording.personDetected && (
                    <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1 font-semibold">
                      <UserCheck className="w-3 h-3" />
                      Person Verified
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {videoDirectUrl && (
                    <a
                      href={videoDirectUrl}
                      download={`ring_${selectedRecording.id}.mp4`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white font-semibold flex items-center gap-1.5 border border-white/10"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download MP4</span>
                    </a>
                  )}
                  <button
                    onClick={() => setVideoModalOpen(false)}
                    className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Token Configuration Modal */}
        {tokenModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className={`w-full max-w-lg rounded-2xl border p-6 space-y-4 shadow-2xl ${
              isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
            }`}>
              <div className="flex items-center justify-between border-b pb-3 border-white/10">
                <div className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-violet-400" />
                  <h3 className="font-bold text-base">Ring 2FA Refresh Token Setup</h3>
                </div>
                <button
                  onClick={() => setTokenModalOpen(false)}
                  className="text-slate-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              <div className="text-xs text-slate-300 space-y-2">
                <p>
                  To connect directly to your Ring Doorbell, generate a persistent refresh token using the official CLI:
                </p>
                <div className="p-3 rounded-lg bg-black/60 font-mono text-emerald-400 select-all border border-emerald-500/20 text-[11px]">
                  npx -p ring-client-api ring-auth-cli
                </div>
                <p className="text-[11px] text-slate-400">
                  Follow the prompt in your terminal to sign in with your Ring email, password, and 2FA code. Then paste the output token below:
                </p>
              </div>

              <form onSubmit={handleSaveToken} className="space-y-4">
                <textarea
                  rows={4}
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Paste Ring Refresh Token here..."
                  className={`w-full p-3 text-xs rounded-xl font-mono border focus:outline-none focus:ring-2 focus:ring-violet-500 ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setTokenModalOpen(false)}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-white/70 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingToken || !tokenInput.trim()}
                    className="px-4 py-2 rounded-lg text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{savingToken ? 'Authenticating...' : 'Save & Connect'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </PortalShell>
  );
}
