import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell, Video, RefreshCw, ShieldCheck, AlertTriangle, Play, Battery,
  Wifi, Sparkles, Clock, CheckCircle, Flame, ExternalLink, Key, Check,
  Camera, Eye, Activity, ShieldAlert
} from 'lucide-react';
import PortalShell from './PortalShell';
import { useSystemEvents } from '../../hooks/useSystemEvents';

export default function DoorbellPortal({ theme = 'dark', onThemeToggle, setCurrentPath }) {
  const isDark = theme === 'dark';

  const [statusData, setStatusData] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [testingDing, setTestingDing] = useState(false);
  const [testingMotion, setTestingMotion] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [snapshotUrls, setSnapshotUrls] = useState({});
  const [loadingSnapshot, setLoadingSnapshot] = useState({});

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

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStatus(), fetchEvents()]);
    setLoading(false);
  }, [fetchStatus, fetchEvents]);

  // Real-time SSE updates: update status and events immediately when doorbell triggers
  useSystemEvents('doorbell:ding', (alert) => {
    fetchStatus();
    fetchEvents();
    if (alert?.event) {
      showNotification(`🚨 ${alert.event.toUpperCase()}: ${alert.cameraName} (${alert.yorkshirePhrase || ''})`);
    }
  }, [fetchStatus, fetchEvents]);

  useSystemEvents('doorbell:cleared', () => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    loadData();
    // Gentle 60-second fallback sync instead of aggressive 10-second polling
    const interval = setInterval(() => {
      fetchStatus();
      fetchEvents();
    }, 60000);
    return () => clearInterval(interval);
  }, [loadData, fetchStatus, fetchEvents]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchStatus(), fetchEvents()]);
    setRefreshing(false);
    showNotification('Doorbell status and event timeline updated');
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
      const res = await fetch('/api/doorbell/test-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType, cameraName: 'Front Door' })
      });
      const data = await res.json();
      if (data.success) {
        showNotification(
          `Test ${eventType === 'ding' ? 'Doorbell Ding' : 'Motion'} alert sent to Box-3 & Yorkshire speaker!`,
          'success'
        );
        await Promise.all([fetchStatus(), fetchEvents()]);
      }
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      if (eventType === 'ding') setTestingDing(false);
      else setTestingMotion(false);
    }
  };

  const handleFetchSnapshot = async (cameraId) => {
    setLoadingSnapshot((prev) => ({ ...prev, [cameraId]: true }));
    try {
      const res = await fetch(`/api/doorbell/snapshot/${cameraId}?t=${Date.now()}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setSnapshotUrls((prev) => ({ ...prev, [cameraId]: url }));
        showNotification('Camera snapshot captured');
      } else {
        showNotification('Could not grab snapshot from Ring camera', 'error');
      }
    } catch (err) {
      showNotification(err.message, 'error');
    } finally {
      setLoadingSnapshot((prev) => ({ ...prev, [cameraId]: false }));
    }
  };

  const isConnected = statusData?.status === 'connected';
  const isConnecting = statusData?.status === 'connecting' || statusData?.isConnecting;
  const cameras = statusData?.cameras || [];
  const activeAlert = statusData?.activeAlert;

  return (
    <PortalShell
      title="Doorbell Service"
      subtitle="Direct Ring API Integration with real-time SIP/WebSocket event streaming & Yorkshire voice alerts"
      icon={Bell}
      theme={theme}
      onThemeToggle={onThemeToggle}
      setCurrentPath={setCurrentPath}
      headerActions={
        <div className="flex items-center gap-2">
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
          <div className={`p-4 rounded-xl border flex items-center justify-between gap-4 animate-pulse ${
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
                <div className="font-bold text-sm tracking-wide">
                  ACTIVE ALERT: {activeAlert.event.toUpperCase()} DETECTED AT {activeAlert.cameraName.toUpperCase()}
                </div>
                <div className="text-xs opacity-80 mt-0.5">
                  Spoken announcement: &quot;{activeAlert.yorkshirePhrase}&quot; ({activeAlert.timeFormatted})
                </div>
              </div>
            </div>
            <div className="text-xs px-2.5 py-1 rounded bg-black/40 border border-white/10 font-mono">
              Live Trigger
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
              SIP / WebSocket event listeners active
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
              &quot;Doorbell&apos;s gone, lad.&quot; / Box-3 chime
            </div>
          </div>

          {/* Hardware Client Alert Link Card */}
          <div className={`p-4 rounded-xl border ${
            isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 mb-2">
              <span>BOX-3 TERMINAL LINK</span>
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-bold tracking-tight text-emerald-400">
              Direct Push Frame
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Instant chime + visitor alert banner
            </div>
          </div>
        </div>

        {/* Action Bar / Test Triggers */}
        <div className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4 ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              Direct Hardware & Voice Alert Verification
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Simulate a physical button press or motion event to verify the ESP32-S3-BOX-3 visual chime and Yorkshire vocal turn.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleTestAlert('ding')}
              disabled={testingDing}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>{testingDing ? 'Triggering...' : 'Test Doorbell Ding'}</span>
            </button>
            <button
              onClick={() => handleTestAlert('motion')}
              disabled={testingMotion}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{testingMotion ? 'Triggering...' : 'Test Motion Alert'}</span>
            </button>
          </div>
        </div>

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
              <span>Doorbell & Motion Activity Timeline</span>
              <span className="text-xs text-slate-500 font-mono">{events.length} events recorded</span>
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
