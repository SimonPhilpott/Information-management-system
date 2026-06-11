import React, { useState, useEffect } from 'react';


export default function OnboardingSetup({ authStatus, onComplete, API }) {
  const [step, setStep] = useState(authStatus.authenticated ? 2 : 1);
  const [folders, setFolders] = useState([]);
  const [folderPath, setFolderPath] = useState([{ id: 'root', name: 'My Drive' }]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [spendCap, setSpendCap] = useState(250);
  const [model, setModel] = useState('flash');
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Check for errors in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'error') {
      setError(params.get('message') || 'Authentication failed');
      window.history.replaceState({}, '', '/');
    }
  }, []);

  // Load folders when on folder picker step
  useEffect(() => {
    if (step === 2 && authStatus.authenticated) {
      loadFolders('root');
    }
  }, [step, authStatus.authenticated]);

  const handleConnect = async () => {
    console.log('[Auth] Fetching auth URL from:', `${API}/api/auth/url`);
    try {
      const res = await fetch(`${API}/api/auth/url`);
      const { url } = await res.json();
      console.log('[Auth] Redirecting to:', url);
      window.location.href = url;
    } catch (err) {
      console.error('[Auth] Failed to get auth URL:', err);
      setError('Connection failed: ' + err.message);
    }
  };

  const loadFolders = async (parentId) => {
    setLoadingFolders(true);
    try {
      const res = await fetch(`${API}/api/settings/drive-folders?parentId=${parentId}`);
      const data = await res.json();
      setFolders(data);
    } catch (err) {
      console.error('Failed to load folders:', err);
    }
    setLoadingFolders(false);
  };

  const navigateToFolder = (folderId, folderName) => {
    setFolderPath(prev => [...prev, { id: folderId, name: folderName }]);
    setSelectedFolder(null);
    loadFolders(folderId);
  };

  const navigateBack = (index) => {
    const newPath = folderPath.slice(0, index + 1);
    setFolderPath(newPath);
    setSelectedFolder(null);
    loadFolders(newPath[newPath.length - 1].id);
  };

  const handleFinish = async () => {
    if (!selectedFolder) return;
    setSaving(true);
    try {
      await fetch(`${API}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driveRootFolderId: selectedFolder.id,
          driveRootFolderName: selectedFolder.name,
          monthlySpendCap: spendCap,
          preferredModel: model
        })
      });
      onComplete();
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
    setSaving(false);
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <h1>📚 Knowledge Base</h1>
        <p>Connect your Google Drive to start asking questions about your PDF library with AI-powered answers and citations.</p>

        {/* Step 1: Connect Google */}
        <div className={`onboarding-step ${step > 1 ? 'completed' : ''}`}>
          <div className="onboarding-step-number">{step > 1 ? '✓' : '1'}</div>
          <div className="onboarding-step-content">
            <h3>Login & Authorization</h3>
            <p>{authStatus.email
              ? (authStatus.isAuthorized ? `Authorized as ${authStatus.email}` : `Restricted: ${authStatus.email} is not authorized`)
              : 'Sign in with Google to access the knowledge base'}</p>
          </div>
        </div>

        {error && (
          <div className="auth-error-banner" style={{
            background: 'rgba(255, 0, 0, 0.1)',
            border: '1px solid rgba(255, 0, 0, 0.3)',
            color: 'var(--accent-rose)',
            padding: '12px',
            borderRadius: '12px',
            fontSize: '13px',
            marginBottom: '16px',
            textAlign: 'center'
          }}>
            🚫 {error}
          </div>
        )}

        {(!authStatus.isAuthorized) && (
          <button className="onboarding-btn" onClick={handleConnect}>
            {authStatus.authenticated ? '👤 Switch Account' : '🔗 Login with Google'}
          </button>
        )}

        {/* Step 2: Choose Folder */}
        {step >= 2 && (
          <>
            <div className={`onboarding-step ${selectedFolder ? 'completed' : ''}`}>
              <div className="onboarding-step-number">{selectedFolder ? '✓' : '2'}</div>
              <div className="onboarding-step-content">
                <h3>Select PDF Folder</h3>
                <p>{selectedFolder
                  ? `Selected: ${selectedFolder.name}`
                  : 'Choose the root folder containing your subject subfolders'}</p>
              </div>
            </div>

            {step === 2 && (
              <>
                {/* Breadcrumb */}
                <div style={{
                  display: 'flex', gap: '4px', alignItems: 'center',
                  fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px', flexWrap: 'wrap'
                }}>
                  {folderPath.map((fp, i) => (
                    <React.Fragment key={fp.id}>
                      {i > 0 && <span>›</span>}
                      <button
                        onClick={() => navigateBack(i)}
                        style={{
                          background: 'none', border: 'none', color: 'var(--accent-indigo-light)',
                          cursor: 'pointer', fontSize: '12px', fontFamily: 'var(--font-sans)', padding: '2px'
                        }}
                      >
                        {fp.name}
                      </button>
                    </React.Fragment>
                  ))}
                </div>

                {/* Folder list */}
                <div className="folder-picker">
                  {loadingFolders ? (
                    <div style={{ padding: '24px', textAlign: 'center' }}>
                      <div className="spinner" style={{ margin: '0 auto' }}></div>
                    </div>
                  ) : !Array.isArray(folders) ? (
                    <p style={{ padding: '16px', textAlign: 'center', color: 'var(--accent-rose)', fontSize: '13px' }}>
                      Failed to load folders. Please check your connection.
                    </p>
                  ) : folders.length === 0 ? (
                    <p style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                      No subfolders found
                    </p>
                  ) : (
                    folders.map(folder => (
                      <div
                        key={folder.id}
                        className={`folder-item ${selectedFolder?.id === folder.id ? 'selected' : ''}`}
                      >
                        <span className="folder-icon">📁</span>
                        <span
                          style={{ flex: 1, cursor: 'pointer' }}
                          onClick={() => setSelectedFolder(folder)}
                        >
                          {folder.name}
                        </span>
                        <button
                          onClick={() => navigateToFolder(folder.id, folder.name)}
                          style={{
                            background: 'none', border: 'none',
                            color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px'
                          }}
                          title="Open folder"
                        >
                          ▶
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {selectedFolder && (
                  <button className="onboarding-btn" onClick={() => setStep(3)}>
                    Continue with "{selectedFolder.name}" →
                  </button>
                )}
              </>
            )}
          </>
        )}

        {/* Step 3: Settings */}
        {step >= 3 && (
          <>
            <div className="onboarding-step">
              <div className="onboarding-step-number">3</div>
              <div className="onboarding-step-content">
                <h3>Configure Settings</h3>
                <p>Set your budget and preferred AI model</p>
              </div>
            </div>

            {step === 3 && (
              <div style={{ marginTop: '16px' }}>
                <label className="input-label">Monthly Spend Cap ($)</label>
                <input
                  type="number"
                  className="input-field"
                  value={spendCap}
                  onChange={(e) => setSpendCap(parseFloat(e.target.value) || 0)}
                  min={0}
                  step={10}
                />
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: '16px' }}>
                  The app will warn you when approaching this limit. Tier 1 default: $250/month.
                </p>

                <label className="input-label">Default AI Model</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                  <button
                    className={`onboarding-btn ${model === 'flash' ? '' : 'secondary'}`}
                    style={{ flex: 1, marginTop: 0, padding: '10px' }}
                    onClick={() => setModel('flash')}
                  >
                    ⚡ Flash
                    <span style={{ fontSize: '11px', opacity: 0.8, display: 'block', fontWeight: 400 }}>Fast & cheap</span>
                  </button>
                  <button
                    className={`onboarding-btn ${model === 'pro' ? '' : 'secondary'}`}
                    style={{ flex: 1, marginTop: 0, padding: '10px' }}
                    onClick={() => setModel('pro')}
                  >
                    🧠 Pro
                    <span style={{ fontSize: '11px', opacity: 0.8, display: 'block', fontWeight: 400 }}>Higher quality</span>
                  </button>
                </div>

                <button
                  className="onboarding-btn"
                  onClick={handleFinish}
                  disabled={saving}
                >
                  {saving ? '⏳ Saving...' : '🚀 Start Indexing PDFs'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
