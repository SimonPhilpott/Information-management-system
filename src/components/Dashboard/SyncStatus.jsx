import React, { useRef } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, FileText, Loader2, Shield, Zap, Database, Layers, Hash } from 'lucide-react';
import { Tooltip } from './CursorHover';
import { createPortal } from 'react-dom';

export default function SyncStatus({ syncStatus, onSync, compact = false, onLogin, authStatus, onOpenHnsw }) {
  const [showSuccess, setShowSuccess] = React.useState(false);
  const [hnswHover, setHnswHover] = React.useState(false);
  const [hnswStats, setHnswStats] = React.useState(null);
  const [hnswBtnRect, setHnswBtnRect] = React.useState(null);
  const hnswBtnRef = useRef(null);
  const [portsStatus, setPortsStatus] = React.useState({
    mainApp: 'checking',
    authServer: 'checking',
    kbClient: 'checking',
    ngrok: 'checking'
  });

  React.useEffect(() => {
    /**
     * Fetch port and tunnel status from the server-side endpoint.
     * Using a relative URL ensures this works whether the app is accessed
     * locally (localhost:6001) or via the ngrok tunnel — the Vite dev server
     * handles the request in Node.js where all local ports are reachable.
     */
    const runChecks = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch('/ims/port-status', {
          cache: 'no-store',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          setPortsStatus({
            mainApp: data.mainApp ?? 'offline',
            authServer: data.authServer ?? 'offline',
            kbClient: data.kbClient ?? 'offline',
            ngrok: data.ngrok ?? 'offline',
          });
        }
      } catch {
        // Network failure — keep current state rather than flipping to offline
      }
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
        {onOpenHnsw && (
          <button
            onClick={onOpenHnsw}
            className="sync-btn"
            title="Fast Vector Index (HNSW)"
            style={{
              margin: 0,
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#10B981',
              borderColor: 'rgba(16, 185, 129, 0.25)'
            }}
          >
            <Zap size={13} />
          </button>
        )}
      </div>
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

          {/* Fast Vector Index (HNSW) Button with hover popup */}
          {onOpenHnsw && (
            <div
              ref={hnswBtnRef}
              style={{ position: 'relative', display: 'inline-flex' }}
              onMouseEnter={async () => {
                if (hnswBtnRef.current) {
                  setHnswBtnRect(hnswBtnRef.current.getBoundingClientRect());
                }
                setHnswHover(true);
                try {
                  const res = await fetch('/api/admin/hnsw/status');
                  if (res.ok) {
                    const data = await res.json();
                    setHnswStats(data);
                  }
                } catch {}
              }}
              onMouseLeave={() => setHnswHover(false)}
            >
              <button
                onClick={onOpenHnsw}
                className="sync-btn"
                title="Open HNSW Vector Index Acceleration Monitor"
                style={{
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: '#10B981',
                  borderColor: 'rgba(16, 185, 129, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Zap size={13} style={{ color: '#10B981' }} />
                <span className="mobile-hide">Fast Index (HNSW)</span>
              </button>
            </div>
          )}
          {hnswHover && hnswBtnRect && createPortal(
            <div
              style={{
                position: 'fixed',
                left: Math.max(8, Math.min(window.innerWidth - 496, hnswBtnRect.left)),
                top: hnswBtnRect.top - 8,
                transform: 'translateY(-100%)',
                width: '480px',
                background: 'var(--bg-secondary)',
                backdropFilter: 'blur(40px)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-xl, 12px)',
                boxShadow: 'var(--shadow-xl, 0 25px 50px rgba(0,0,0,0.5))',
                zIndex: 2147483647,
                pointerEvents: 'none',
                overflow: 'hidden'
              }}
            >
              {/* Header */}
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '4px', height: '12px', background: '#10B981', borderRadius: '2px' }} />
                <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)' }}>HNSW Vector Index</span>
              </div>

              <div style={{ padding: '14px' }}>
                {hnswStats ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Status badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: hnswStats.isBuilt ? '#10B981' : '#f59e0b', boxShadow: hnswStats.isBuilt ? '0 0 6px #10B981' : '0 0 6px #f59e0b' }} />
                      <span style={{ fontSize: '11px', fontWeight: 700, color: hnswStats.isBuilt ? '#10B981' : '#f59e0b' }}>
                        {hnswStats.isBuilt ? 'Index Active — Sub-millisecond ready' : 'Index not built — rebuild required'}
                      </span>
                    </div>

                    {/* Stats grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                      <div style={{ padding: '8px 10px', background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                          <Hash size={10} style={{ color: '#10B981' }} />
                          <span style={{ fontSize: '9px', fontWeight: 800, color: '#10B981', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Vectors</span>
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                          {hnswStats.totalVectors ? hnswStats.totalVectors.toLocaleString('en-GB') : '—'}
                        </div>
                      </div>

                      <div style={{ padding: '8px 10px', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                          <Database size={10} style={{ color: '#818cf8' }} />
                          <span style={{ fontSize: '9px', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Dimensions</span>
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>768</div>
                      </div>

                      <div style={{ padding: '8px 10px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                          <Layers size={10} style={{ color: '#fbbf24' }} />
                          <span style={{ fontSize: '9px', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Graph Layers</span>
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>3</div>
                      </div>
                    </div>

                    {/* Index size estimate */}
                    <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '8px' }}>
                      <div style={{ fontSize: '9px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Estimated Index Size</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                        {hnswStats.totalVectors
                          ? `≈ ${((hnswStats.totalVectors * 768 * 4) / (1024 ** 3)).toFixed(3)} GB`
                          : '—'}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        768 dims × 4 bytes (float32) × {hnswStats.totalVectors?.toLocaleString('en-GB') || '0'} vectors
                      </div>
                    </div>

                    {/* Algorithm info */}
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      <strong style={{ color: 'var(--text-secondary)' }}>Algorithm:</strong> Hierarchical Navigable Small World (HNSW) · Cosine similarity · <em>O(log N)</em> queries
                      {hnswStats.lastBuilt && (
                        <div style={{ marginTop: '2px' }}>Last built: {new Date(hnswStats.lastBuilt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Loading index stats…</div>
                )}
              </div>

              <div style={{ padding: '6px 14px', background: 'rgba(0,0,0,0.1)', fontSize: '9px', color: 'var(--text-muted)', textAlign: 'right', borderTop: '1px solid var(--glass-border)' }}>
                System Intelligence Hover Protocol v1.0
              </div>
            </div>,
            document.body
          )}

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
            userSelect: 'none',
            whiteSpace: 'nowrap',
            flexShrink: 0
          }}>
            <Tooltip text={`Main UI Dashboard (Port 6001)\nStatus: ${portsStatus.mainApp === 'online' ? 'Online' : 'Offline'}\nServes the frontend user interface and layout navigations.`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'help', whiteSpace: 'nowrap', flexShrink: 0 }}>
                <div 
                  style={{ 
                    width: '6px', 
                    height: '6px', 
                    borderRadius: '50%', 
                    backgroundColor: portsStatus.mainApp === 'online' ? '#10b981' : (portsStatus.mainApp === 'checking' ? '#f59e0b' : '#ef4444'),
                    boxShadow: portsStatus.mainApp === 'online' ? '0 0 6px #10b981' : (portsStatus.mainApp === 'checking' ? '0 0 6px #f59e0b' : '0 0 6px #ef4444'),
                    transition: 'background-color 0.3s, box-shadow 0.3s',
                    flexShrink: 0
                  }} 
                />
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>App: 6001</span>
              </div>
            </Tooltip>

            <Tooltip text={`Authentication & API Server (Port 3001)\nStatus: ${portsStatus.authServer === 'online' ? 'Online' : 'Offline'}\nManages Google OAuth logins, document storage, and vector database API services.`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'help', whiteSpace: 'nowrap', flexShrink: 0 }}>
                <div 
                  style={{ 
                    width: '6px', 
                    height: '6px', 
                    borderRadius: '50%', 
                    backgroundColor: portsStatus.authServer === 'online' ? '#10b981' : (portsStatus.authServer === 'checking' ? '#f59e0b' : '#ef4444'),
                    boxShadow: portsStatus.authServer === 'online' ? '0 0 6px #10b981' : (portsStatus.authServer === 'checking' ? '0 0 6px #f59e0b' : '0 0 6px #ef4444'),
                    transition: 'background-color 0.3s, box-shadow 0.3s',
                    flexShrink: 0
                  }} 
                />
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>Auth: 3001</span>
              </div>
            </Tooltip>

            <Tooltip text={`Knowledge Base Dev Client (Port 5173)\nStatus: ${portsStatus.kbClient === 'online' ? 'Online' : 'Offline'}\nProvides hot-reloaded development rendering for the PDF parser module.`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'help', whiteSpace: 'nowrap', flexShrink: 0 }}>
                <div 
                  style={{ 
                    width: '6px', 
                    height: '6px', 
                    borderRadius: '50%', 
                    backgroundColor: portsStatus.kbClient === 'online' ? '#10b981' : (portsStatus.kbClient === 'checking' ? '#f59e0b' : '#ef4444'),
                    boxShadow: portsStatus.kbClient === 'online' ? '0 0 6px #10b981' : (portsStatus.kbClient === 'checking' ? '0 0 6px #f59e0b' : '0 0 6px #ef4444'),
                    transition: 'background-color 0.3s, box-shadow 0.3s',
                    flexShrink: 0
                  }} 
                />
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>KB: 5173</span>
              </div>
            </Tooltip>

            <Tooltip text={`IMS Public Tunnel (Ngrok)\nStatus: ${portsStatus.ngrok === 'online' ? 'Online' : 'Offline'}\nExposes the dashboard secure URL https://simon-ims.ngrok-free.app for external access.`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'help', whiteSpace: 'nowrap', flexShrink: 0 }}>
                <div 
                  style={{ 
                    width: '6px', 
                    height: '6px', 
                    borderRadius: '50%', 
                    backgroundColor: portsStatus.ngrok === 'online' ? '#10b981' : (portsStatus.ngrok === 'checking' ? '#f59e0b' : '#ef4444'),
                    boxShadow: portsStatus.ngrok === 'online' ? '0 0 6px #10b981' : (portsStatus.ngrok === 'checking' ? '0 0 6px #f59e0b' : '0 0 6px #ef4444'),
                    transition: 'background-color 0.3s, box-shadow 0.3s',
                    flexShrink: 0
                  }} 
                />
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>ngrok</span>
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
