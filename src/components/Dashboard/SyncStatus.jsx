import React from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, FileText, Loader2, Shield } from 'lucide-react';
import { Tooltip } from './CursorHover';

export default function SyncStatus({ syncStatus, onSync, compact = false, onLogin, authStatus }) {
  const [showSuccess, setShowSuccess] = React.useState(false);
  const [portsStatus, setPortsStatus] = React.useState({
    mainApp: 'checking',
    authServer: 'checking',
    kbClient: 'checking',
    ngrok: 'checking'
  });

  React.useEffect(() => {
    const checkPort = async (url) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);
        await fetch(url, { mode: 'no-cors', signal: controller.signal, cache: 'no-cache' });
        clearTimeout(timeoutId);
        return 'online';
      } catch (e) {
        return 'offline';
      }
    };

    const checkNgrok = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);
        const res = await fetch('http://localhost:4040/api/tunnels', { signal: controller.signal, cache: 'no-cache' });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          const hasTunnel = data.tunnels?.some(t => t.public_url?.includes('simon-ims') || t.public_url?.includes('ngrok'));
          return hasTunnel ? 'online' : 'offline';
        }
        return 'offline';
      } catch (e) {
        const tcpCheck = await checkPort('http://localhost:4040/');
        return tcpCheck === 'online' ? 'online' : 'offline';
      }
    };

    const runChecks = async () => {
      const hostname = window.location.hostname || 'localhost';
      const mainApp = await checkPort(`http://${hostname}:6001/`);
      const authServer = await checkPort(`http://${hostname}:3001/api/auth/status`);
      const kbClient = await checkPort(`http://${hostname}:5173/`);
      const ngrok = await checkNgrok();
      setPortsStatus({ mainApp, authServer, kbClient, ngrok });
    };

    runChecks();
    const interval = setInterval(runChecks, 5000);
    return () => clearInterval(interval);
  }, []);
  const isSyncing = syncStatus?.drive?.active || syncStatus?.indexing?.active;
  const stats = syncStatus?.stats;
  const progress = syncStatus?.indexing;

  const hasError = !!syncStatus?.drive?.error || 
                   !!syncStatus?.indexing?.error ||
                   syncStatus?.drive?.phase?.toLowerCase()?.includes('error') || 
                   syncStatus?.indexing?.phase?.toLowerCase()?.includes('error') ||
                   syncStatus?.drive?.phase?.includes?.('invalid_grant') ||
                   syncStatus?.drive?.phase?.includes?.('Session Expired') ||
                   authStatus?.authError === 'Session Expired';
                   
  const errorMsg = syncStatus?.drive?.error || syncStatus?.indexing?.error || authStatus?.authError || 'Sync Failure';

  // Track sync completion for success animation
  React.useEffect(() => {
    if (isSyncing) {
      setShowSuccess(false);
    } else {
      // Only show success if we just finished successfully
      const isComplete = syncStatus?.drive?.phase === 'Complete' || 
                         syncStatus?.indexing?.phase === 'Complete';

      if (!hasError && isComplete) {
        setShowSuccess(true);
        const timer = setTimeout(() => setShowSuccess(false), 5000);
        return () => clearTimeout(timer);
      }
    }
  }, [isSyncing, syncStatus, hasError]);

  const handleReauth = async () => {
    if (onLogin) {
      onLogin();
      return;
    }
    try {
      const res = await fetch('/api/auth/url');
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error('Failed to get auth URL:', err);
    }
  };

  const handleClick = (e) => {
    if (onSync) onSync();
  };

  if (compact) {
    return (
      <button
        onClick={handleClick}
        disabled={isSyncing}
        className={`sync-btn ${isSyncing ? 'active' : ''} ${showSuccess ? 'success' : ''}`}
        title="Sync Library"
        style={{ 
          margin: 0,
          background: showSuccess ? 'rgba(34, 197, 94, 0.15)' : undefined,
          color: showSuccess ? '#22C55E' : undefined,
          borderColor: showSuccess ? 'rgba(34, 197, 94, 0.3)' : undefined
        }}
      >
        {showSuccess ? <CheckCircle2 size={14} /> : <RefreshCw size={14} className={isSyncing ? 'spin' : ''} />}
        <span className="mobile-hide">
          {isSyncing ? 'Syncing...' : (showSuccess ? 'Synced!' : 'Sync Now')}
        </span>
      </button>
    );
  }

  const percent = progress?.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, flexWrap: 'wrap' }}>
      {hasError ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
          <div className="status-item" style={{ color: 'var(--status-red)', fontWeight: 600 }}>
            <AlertCircle size={16} />
            <span>
              {errorMsg === 'Session Expired' 
                ? 'Authentication Required' 
                : (errorMsg.toLowerCase().includes('permission') || errorMsg.includes('403')
                    ? 'Permission Denied' 
                    : 'Sync Error'
                  )
              }
            </span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {errorMsg.toLowerCase().includes('permission') || errorMsg.includes('403')
              ? 'Permission Denied. Please ensure you check the "Drive" box during re-authentication.' 
              : errorMsg
            }
          </div>
          <button
            onClick={handleReauth}
            className="sync-btn error"
            style={{ 
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#EF4444',
              borderColor: 'rgba(239, 68, 68, 0.3)',
              margin: 0
            }}
          >
            <Shield size={14} />
            <span>Re-authenticate</span>
          </button>
        </div>
      ) : (
        <>
          <div className="status-item">
            {isSyncing ? (
              <RefreshCw size={14} className="spin" style={{ color: 'var(--accent-indigo-light)' }} />
            ) : (
              <CheckCircle2 size={14} style={{ color: showSuccess ? '#22C55E' : 'var(--status-green)' }} className={showSuccess ? 'animate-bounce-subtle' : ''} />
            )}
            <span style={{ 
              fontWeight: 600, 
              color: showSuccess ? '#22C55E' : 'inherit', 
              transition: 'color 0.3s' 
            }}>
              {isSyncing 
                ? (syncStatus?.indexing?.active ? 'Indexing Documents...' : 'Checking Drive...') 
                : (showSuccess ? 'Library Updated!' : 'Library Synced')
              }
            </span>
          </div>

          {isSyncing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, maxWidth: '400px' }}>
              <div className="sync-progress-container" style={{ flex: 1, height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
                <div 
                  className="sync-progress-fill" 
                  style={{ 
                    width: `${
                      syncStatus?.indexing?.active 
                        ? (syncStatus?.indexing?.total > 0 ? (syncStatus?.indexing?.current / syncStatus?.indexing?.total) * 100 : 0)
                        : (syncStatus?.drive?.total > 0 ? (syncStatus?.drive?.current / syncStatus?.drive?.total) * 100 : 0)
                    }%`, 
                    height: '100%', 
                    background: 'var(--gradient-primary)',
                    transition: 'width 0.3s ease-out'
                  }} 
                />
              </div>
              <span style={{ 
                fontSize: '11px', 
                color: 'var(--text-secondary)', 
                minWidth: '70px', 
                fontFamily: 'var(--font-mono)',
                whiteSpace: 'nowrap'
              }}>
                {syncStatus?.indexing?.active 
                  ? `${syncStatus?.indexing?.current || 0} / ${syncStatus?.indexing?.total || 0}`
                  : `${syncStatus?.drive?.current || 0} / ${syncStatus?.drive?.total || 0}`
                }
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {syncStatus?.indexing?.active ? syncStatus?.indexing?.currentFile : syncStatus?.drive?.currentFile}
              </span>
            </div>
          )}

          {!isSyncing && stats && (
            <div className="status-item">
              <FileText size={12} />
              <span>
                Indexed: <strong style={{ color: stats.indexedDocuments === stats.totalDocuments ? 'var(--status-green)' : 'var(--status-amber)' }}>
                  {stats.indexedDocuments || 0}
                </strong> / {stats.totalDocuments || 0} Documents
              </span>
            </div>
          )}

          {!isSyncing && stats?.lastSynced && (
            <div className="status-item" style={{ color: 'var(--text-muted)' }}>
              Last sync: {formatTimeAgo(stats.lastSynced)}
            </div>
          )}

          {/* Sync Now button placed next to last synced text */}
          <button
            onClick={handleClick}
            disabled={isSyncing}
            className={`sync-btn ${isSyncing ? 'active' : ''} ${showSuccess ? 'success' : ''}`}
            title="Sync Library"
            style={{
              background: showSuccess ? 'rgba(34, 197, 94, 0.15)' : undefined,
              color: showSuccess ? '#22C55E' : undefined,
              borderColor: showSuccess ? 'rgba(34, 197, 94, 0.3)' : undefined
            }}
          >
            {showSuccess ? <CheckCircle2 size={14} /> : <RefreshCw size={14} className={isSyncing ? 'spin' : ''} />}
            <span className="mobile-hide">
              {isSyncing ? 'Syncing...' : (showSuccess ? 'Synced!' : 'Sync Now')}
            </span>
          </button>

          {/* Pulse warning banner for offline ports (only App, Auth, or KB) */}
          {(portsStatus.mainApp === 'offline' || portsStatus.authServer === 'offline' || portsStatus.kbClient === 'offline') && (
            <div 
              style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: '#ef4444', 
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
              }}
              title="A critical service port has stopped. Click sync to retry or check your developer terminal window."
            >
              <AlertCircle size={13} />
              <span>
                Offline: {[
                  portsStatus.mainApp === 'offline' && 'App:6001',
                  portsStatus.authServer === 'offline' && 'Auth:3001 (Critical)',
                  portsStatus.kbClient === 'offline' && 'KB:5173'
                ].filter(Boolean).join(', ')}
              </span>
            </div>
          )}

          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px', 
            marginRight: '8px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '4px 10px',
            backdropFilter: 'blur(4px)',
            userSelect: 'none'
          }}>
            <Tooltip text={`Main UI Dashboard (Port 6001)\nStatus: ${portsStatus.mainApp === 'online' ? 'Online' : 'Offline'}\nServes the frontend user interface and layout navigations.`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'help' }}>
                <div 
                  style={{ 
                    width: '6px', 
                    height: '6px', 
                    borderRadius: '50%', 
                    backgroundColor: portsStatus.mainApp === 'online' ? '#10b981' : (portsStatus.mainApp === 'checking' ? '#f59e0b' : '#ef4444'),
                    boxShadow: portsStatus.mainApp === 'online' ? '0 0 6px #10b981' : (portsStatus.mainApp === 'checking' ? '0 0 6px #f59e0b' : '0 0 6px #ef4444'),
                    transition: 'background-color 0.3s, box-shadow 0.3s'
                  }} 
                />
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)' }}>App: 6001</span>
              </div>
            </Tooltip>

            <Tooltip text={`Authentication & API Server (Port 3001)\nStatus: ${portsStatus.authServer === 'online' ? 'Online' : 'Offline'}\nManages Google OAuth logins, document storage, and vector database API services.`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'help' }}>
                <div 
                  style={{ 
                    width: '6px', 
                    height: '6px', 
                    borderRadius: '50%', 
                    backgroundColor: portsStatus.authServer === 'online' ? '#10b981' : (portsStatus.authServer === 'checking' ? '#f59e0b' : '#ef4444'),
                    boxShadow: portsStatus.authServer === 'online' ? '0 0 6px #10b981' : (portsStatus.authServer === 'checking' ? '0 0 6px #f59e0b' : '0 0 6px #ef4444'),
                    transition: 'background-color 0.3s, box-shadow 0.3s'
                  }} 
                />
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)' }}>Auth: 3001</span>
              </div>
            </Tooltip>

            <Tooltip text={`Knowledge Base Dev Client (Port 5173)\nStatus: ${portsStatus.kbClient === 'online' ? 'Online' : 'Offline'}\nProvides hot-reloaded development rendering for the PDF parser module.`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'help' }}>
                <div 
                  style={{ 
                    width: '6px', 
                    height: '6px', 
                    borderRadius: '50%', 
                    backgroundColor: portsStatus.kbClient === 'online' ? '#10b981' : (portsStatus.kbClient === 'checking' ? '#f59e0b' : '#ef4444'),
                    boxShadow: portsStatus.kbClient === 'online' ? '0 0 6px #10b981' : (portsStatus.kbClient === 'checking' ? '0 0 6px #f59e0b' : '0 0 6px #ef4444'),
                    transition: 'background-color 0.3s, box-shadow 0.3s'
                  }} 
                />
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)' }}>KB: 5173</span>
              </div>
            </Tooltip>

            <Tooltip text={`IMS Public Tunnel (Ngrok)\nStatus: ${portsStatus.ngrok === 'online' ? 'Online' : 'Offline'}\nExposes the dashboard secure URL https://simon-ims.ngrok-free.app for external access.`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'help' }}>
                <div 
                  style={{ 
                    width: '6px', 
                    height: '6px', 
                    borderRadius: '50%', 
                    backgroundColor: portsStatus.ngrok === 'online' ? '#10b981' : (portsStatus.ngrok === 'checking' ? '#f59e0b' : '#ef4444'),
                    boxShadow: portsStatus.ngrok === 'online' ? '0 0 6px #10b981' : (portsStatus.ngrok === 'checking' ? '0 0 6px #f59e0b' : '0 0 6px #ef4444'),
                    transition: 'background-color 0.3s, box-shadow 0.3s'
                  }} 
                />
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)' }}>ngrok</span>
              </div>
            </Tooltip>
          </div>
        </>
      )}
    </div>
  );
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return 'never';
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
