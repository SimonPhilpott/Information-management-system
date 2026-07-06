const fs = require('fs');
const path = require('path');

const adminPanelPath = path.join(__dirname, '../src/components/Admin/AdminPanel.jsx');
let content = fs.readFileSync(adminPanelPath, 'utf8');

// Helper to normalize and replace regardless of CRLF vs LF
const replaceResilient = (target, replacement) => {
  const targetLF = target.replace(/\r\n/g, '\n');
  const contentLF = content.replace(/\r\n/g, '\n');
  
  if (contentLF.includes(targetLF)) {
    const updatedLF = contentLF.replace(targetLF, replacement.replace(/\r\n/g, '\n'));
    content = updatedLF.replace(/\n/g, '\r\n');
    return true;
  }
  return false;
};

// 1. Add icons to lucide imports
content = content.replace(
  /import\s+{[^}]+}\s+from\s+'lucide-react';/,
  `import { X, ChevronRight, ChevronDown, Search, Database, RefreshCw, Layers, Trash2, RotateCcw, Box, Palette, Info, Zap, Link2, CheckCircle2, Globe, History, Shield } from 'lucide-react';`
);

// 2. Add props to AdminPanel parameter list
const propsTarget = `  onApplyAIProposal,
  onReviewSync
}) => {`;

const propsReplacement = `  onApplyAIProposal,
  onReviewSync,
  onGetMeshBackups,
  onCreateMeshBackup,
  onRestoreMeshBackup
}) => {`;

if (!replaceResilient(propsTarget, propsReplacement)) {
  console.error('Failed to replace propsTarget');
  process.exit(1);
}

// 3. Add states and useEffect inside AdminPanel component
const stateTarget = `  const [hoveredFeature, setHoveredFeature] = useState(null);`;

const stateReplacement = `  const [hoveredFeature, setHoveredFeature] = useState(null);

  const [meshBackups, setMeshBackups] = useState([]);
  const [isMeshBackingUp, setIsMeshBackingUp] = useState(false);
  const [meshBackupStatus, setMeshBackupStatus] = useState(null);
  const [previewingBackup, setPreviewingBackup] = useState(null);

  const loadMeshBackups = async () => {
    if (!onGetMeshBackups) return;
    try {
      const data = await onGetMeshBackups();
      setMeshBackups(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadMeshBackups();
    }
  }, [isOpen]);`;

if (!replaceResilient(stateTarget, stateReplacement)) {
  console.error('Failed to replace stateTarget');
  process.exit(1);
}

// 4. Inject Tab Switcher option in Mode Switcher list
const switcherTarget = "              <div \n                onClick={() => setActiveTab('spatial')}\n                className={`mode-item ${activeTab === 'spatial' ? 'active' : ''}`}\n              >\n                <Zap size={14} />\n                <span>Spatial Logic</span>\n              </div>";

const switcherReplacement = "              <div \n                onClick={() => setActiveTab('spatial')}\n                className={`mode-item ${activeTab === 'spatial' ? 'active' : ''}`}\n              >\n                <Zap size={14} />\n                <span>Spatial Logic</span>\n              </div>\n              <div \n                onClick={() => setActiveTab('checkpoints')}\n                className={`mode-item ${activeTab === 'checkpoints' ? 'active' : ''}`}\n                style={activeTab === 'checkpoints' ? { background: 'rgba(6, 182, 212, 0.15)', border: '1px solid rgba(6, 182, 212, 0.25)', color: '#06b6d4' } : {}}\n              >\n                <History size={14} />\n                <span>Checkpoints</span>\n              </div>";

if (!replaceResilient(switcherTarget, switcherReplacement)) {
  console.error('Failed to replace switcherTarget');
  process.exit(1);
}

// 5. Inject Checkpoints Panel render block
const panelTarget = `              ) : (
                <motion.div key="bin-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>`;

const panelReplacement = `              ) : activeTab === 'checkpoints' ? (
                <motion.div key="checkpoints-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6 pb-32">
                   <div className="space-y-4">
                      <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest block border-b border-[var(--glass-border)] pb-2">Mesh Authority Checkpoints</span>
                      
                      <button 
                          disabled={isMeshBackingUp}
                          onClick={async () => {
                              setIsMeshBackingUp(true);
                              setMeshBackupStatus(null);
                              try {
                                  await onCreateMeshBackup();
                                  setMeshBackupStatus('success');
                                  loadMeshBackups();
                                  setTimeout(() => setMeshBackupStatus(null), 3000);
                              } catch (e) {
                                  setMeshBackupStatus('error');
                                  setTimeout(() => setMeshBackupStatus(null), 3000);
                              } finally {
                                  setIsMeshBackingUp(false);
                              }
                          }}
                          className={\`w-full py-4 rounded-xl flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all border \${
                              meshBackupStatus === 'success' ? 'bg-[var(--accent-emerald)]/20 border-[var(--accent-emerald)]/50 text-[var(--accent-emerald)]' :
                              meshBackupStatus === 'error' ? 'bg-[var(--status-red)]/20 border-[var(--status-red)]/50 text-[var(--status-red)]' :
                              'bg-[var(--accent-cyan)]/10 border border-[var(--accent-cyan)]/30 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/25'
                          }\`}
                      >
                          {isMeshBackingUp ? (
                              <RefreshCw size={12} className="animate-spin" />
                          ) : meshBackupStatus === 'success' ? (
                              <CheckCircle2 size={12} /> 
                          ) : (
                              <Database size={12} />
                          )}
                          {isMeshBackingUp ? 'Creating Checkpoint...' : 
                          meshBackupStatus === 'success' ? 'Checkpoint Created' : 
                          meshBackupStatus === 'error' ? 'Failed to Create Checkpoint' : 
                          'Create New Mesh Checkpoint'}
                      </button>

                      <div className="space-y-3">
                         {meshBackups.length > 0 ? (
                            meshBackups.map(b => (
                               <div key={b.filename} className="p-4 bg-[var(--bg-elevated)] border border-[var(--glass-border)] rounded-2xl space-y-3 group hover:border-[var(--glass-border-hover)] transition-all">
                                  <div className="flex items-center justify-between">
                                     <div className="flex flex-col">
                                        <span className="text-[11px] font-bold text-[var(--text-primary)]">{new Date(b.timestamp).toLocaleString('en-GB')}</span>
                                        <span className="text-[8px] uppercase tracking-widest text-[var(--text-muted)] font-black truncate max-w-[250px]">{b.filename}</span>
                                     </div>
                                  </div>
                                  
                                  <div className="grid grid-cols-2 gap-2 text-[10px] text-[var(--text-secondary)] border-t border-b border-[var(--glass-border)]/50 py-2">
                                     <div>Nodes: <strong className="text-[var(--text-primary)]">{b.nodeCount}</strong></div>
                                     <div>Connections: <strong className="text-[var(--text-primary)]">{b.connectionCount}</strong></div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                     <button 
                                       onClick={() => setPreviewingBackup(previewingBackup?.filename === b.filename ? null : b)}
                                       className="py-2.5 rounded-xl border border-[var(--glass-border)] hover:bg-[var(--bg-tertiary)] text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] transition-all flex items-center justify-center gap-1.5"
                                     >
                                        <Info size={10} />
                                        {previewingBackup?.filename === b.filename ? 'Hide Details' : 'View Details'}
                                     </button>
                                     <button 
                                       onClick={() => {
                                          if (confirm(\`Are you sure you want to restore the backup from \${new Date(b.timestamp).toLocaleString('en-GB')}? This will reload the application.\`)) {
                                             onRestoreMeshBackup(b.filename);
                                          }
                                       }}
                                       className="py-2.5 rounded-xl bg-[var(--accent-cyan)]/15 border border-[var(--accent-cyan)]/35 text-[9px] font-black uppercase tracking-widest text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)] hover:text-white transition-all flex items-center justify-center gap-1.5"
                                     >
                                        <RotateCcw size={10} />
                                        Restore
                                     </button>
                                  </div>

                                  {previewingBackup?.filename === b.filename && (
                                     <div className="p-3 bg-[var(--bg-primary)] border border-[var(--glass-border)] rounded-xl text-[10px] space-y-1.5 font-mono text-[var(--text-secondary)] select-text max-h-48 overflow-y-auto">
                                        <div>Checkpoints Info:</div>
                                        <div>• File: {b.filename}</div>
                                        <div>• Saved: {new Date(b.timestamp).toString()}</div>
                                        <div>• Total Registered Nodes: {b.nodeCount}</div>
                                        <div>• Total Relationships: {b.connectionCount}</div>
                                     </div>
                                  )}
                               </div>
                            ))
                         ) : (
                            <div className="h-48 flex flex-col items-center justify-center text-[var(--text-muted)] border border-dashed border-[var(--glass-border)] rounded-2xl">
                               <Database size={24} className="mb-2 opacity-20" />
                               <p className="text-[10px] font-black uppercase tracking-[0.2em] italic">No checkpoints found</p>
                            </div>
                         )}
                      </div>
                   </div>
                </motion.div>
              ) : (
                <motion.div key="bin-tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>`;

if (!replaceResilient(panelTarget, panelReplacement)) {
  console.error('Failed to replace panelTarget');
  process.exit(1);
}

fs.writeFileSync(adminPanelPath, content, 'utf8');
console.log('Successfully completed full line-ending resilient AdminPanel.jsx updates.');
