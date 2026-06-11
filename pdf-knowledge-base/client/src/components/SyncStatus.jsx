import React from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, FileText, Loader2, Shield } from 'lucide-react';

export default function SyncStatus({ syncStatus, onSync, compact = false, onLogin, authStatus }) {
  const [showSuccess, setShowSuccess] = React.useState(false);
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
                ? (syncStatus?.indexing?.active ? 'Indexing PDFs...' : 'Checking Drive...') 
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
                </strong> / {stats.totalDocuments || 0} PDFs
              </span>
            </div>
          )}

          {!isSyncing && stats?.lastSynced && (
            <div className="status-item" style={{ color: 'var(--text-muted)' }}>
              Last sync: {formatTimeAgo(stats.lastSynced)}
            </div>
          )}

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
