import React, { useState, useEffect, useCallback } from 'react';
import { 
  Folder, File, ChevronRight, ChevronDown, X, BookOpen, 
  ExternalLink, Trash2, Move, Plus, Search, CheckSquare, Square,
  AlertCircle, ChevronLeft, Sparkles, Brain, RotateCcw
} from 'lucide-react';
import { checkIsEntertainment } from '../utils/contentFilter';

const CatalogItem = ({ 
  item, level = 0, onOpenFile, onToggleSelect, isSelected, 
  isSelectedFunc, onMoveTo, onDelete, selectionActive 
}) => {
  const [isOpen, setIsOpen] = useState(level === 0);
  const isFolder = item.type === 'folder';

  const toggleOpen = (e) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleSelect = (e) => {
    e.stopPropagation();
    onToggleSelect(item);
  };

  return (
    <div className="catalog-item-container">
      <div 
        className={`catalog-item ${isFolder ? 'folder' : 'file'} ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={isFolder ? toggleOpen : () => onOpenFile(item.driveFileId, 1, item.name)}
      >
        <div className="catalog-item-prefix">
          <span className="catalog-icon" onClick={toggleOpen}>
            {isFolder ? (
              isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            ) : (
              <div className="catalog-chevron-spacer" />
            )}
          </span>
          
          <span className={`catalog-item-checkbox ${selectionActive ? 'visible' : ''}`} onClick={handleSelect}>
            {isSelected ? <CheckSquare size={14} className="text-accent" /> : <Square size={14} />}
          </span>
          {!isFolder && <File size={14} className="catalog-file-icon" />}
        </div>

        <span className="catalog-type-icon">
          {isFolder ? (
            <Folder size={16} className={`folder-icon ${item.isAI ? 'ai-folder' : ''}`} />
          ) : (
            item.subjectSource === 'ai' ? <Sparkles size={14} className="text-accent-ai" title="AI Categorised" /> : null
          )}
        </span>
        
        <div className="catalog-info">
          <span className="catalog-name">
            {item.name}
            {item.subjectSource === 'ai' && <span className="ai-tag">AI</span>}
          </span>
          {item.themes && (
            <span className="catalog-themes" title={item.themes}>
              <Brain size={10} style={{ marginRight: '4px', opacity: 0.7 }} />
              {item.themes.length > 80 ? item.themes.substring(0, 77) + '...' : item.themes}
            </span>
          )}
        </div>
        
        {!isFolder && (
          <div className="catalog-actions">
            <span 
              className={`index-status-badge ${item.indexed === 1 ? 'indexed' : item.indexed === -1 ? 'failed' : 'pending'}`}
              title={item.indexError || ''}
            >
              {item.indexed === 1 ? 'Indexed' : item.indexed === -1 ? 'Error' : 'Pending'}
            </span>
            <span className="catalog-meta">{(item.pageCount || 0) || '?'} pages</span>
            <span className="catalog-meta">{((item.fileSize || 0) / 1024 / 1024).toFixed(1)} MB</span>
            <button className="catalog-action-btn" title="Open PDF" onClick={(e) => {
              e.stopPropagation();
              onOpenFile(item.driveFileId, 1, item.name);
            }}>
              <ExternalLink size={14} />
            </button>
            <button className="catalog-action-btn" title="Move Book" onClick={(e) => {
              e.stopPropagation();
              onMoveTo(item);
            }}>
              <Move size={14} />
            </button>
            <button className="catalog-action-btn delete" title="Delete Book" onClick={(e) => {
              e.stopPropagation();
              onDelete([item.driveFileId]);
            }}>
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {isFolder && isOpen && item.children && (
        <div className="catalog-children">
          {item.children.map((child, idx) => (
            <CatalogItem 
              key={idx} 
              item={child} 
              level={level + 1} 
              onOpenFile={onOpenFile}
              onToggleSelect={onToggleSelect}
              isSelected={isSelectedFunc(child)}
              isSelectedFunc={isSelectedFunc}
              onMoveTo={onMoveTo}
              onDelete={onDelete}
              selectionActive={selectionActive}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default function CatalogBrowser({ onClose, onOpenFile, chatTone = 'friendly' }) {
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null); // Array of IDs to delete
  const [movingItem, setMovingItem] = useState(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [processingAI, setProcessingAI] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionProgress, setDeletionProgress] = useState({ current: 0, total: 0, lastFile: '' });
  const [abortDeletion, setAbortDeletion] = useState(false);
  const [showIndexSummary, setShowIndexSummary] = useState(false);

  const loadCatalog = useCallback(() => {
    setLoading(true);
    fetch('/api/drive/catalog')
      .then(res => res.json())
      .then(data => {
        setCatalog(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load catalog:', err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const toggleSelect = (item) => {
    if (item.type === 'folder') return; // For now only books
    setSelectedIds(prev => 
      prev.includes(item.driveFileId) 
        ? prev.filter(id => id !== item.driveFileId)
        : [...prev, item.driveFileId]
    );
  };

  const isSelected = (item) => selectedIds.includes(item.driveFileId);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    
    setIsDeleting(true);
    setAbortDeletion(false);
    setDeletionProgress({ current: 0, total: confirmDelete.length, lastFile: '' });

    const ids = [...confirmDelete];
    let successCount = 0;

    for (let i = 0; i < ids.length; i++) {
      if (window.catalog_abort) break;

      const id = ids[i];
      // Note: We'd need filename for better feedback, 
      // but we can just use the index for now or look it up
      setDeletionProgress(prev => ({ ...prev, current: i + 1 }));

      try {
        await fetch('/api/drive/documents', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driveFileIds: [id] })
        });
        successCount++;
      } catch (err) {
        console.error(`Failed to delete ${id}:`, err);
      }
    }

    setIsDeleting(false);
    setConfirmDelete(null);
    setSelectedIds([]);
    window.catalog_abort = false;
    loadCatalog();
  };

  const cancelOrInterruptDeleletion = () => {
    if (isDeleting) {
      window.catalog_abort = true;
      setAbortDeletion(true);
    } else {
      setConfirmDelete(null);
    }
  };


  const handleMove = async (newSubject) => {
    if (!movingItem) return;
    
    try {
      await fetch('/api/drive/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveFileId: movingItem.driveFileId, newSubject })
      });
      setMovingItem(null);
      loadCatalog();
    } catch (err) {
      alert('Failed to move book: ' + err.message);
    }
  };

  const handleFindDuplicates = async () => {
    try {
      const res = await fetch('/api/drive/duplicates');
      const data = await res.json();
      if (data.duplicateIds && data.duplicateIds.length > 0) {
        setSelectedIds(prev => [...new Set([...prev, ...data.duplicateIds])]);
      } else {
        alert('No duplicates found.');
      }
    } catch (err) {
      alert('Failed to find duplicates: ' + err.message);
    }
  };

  const handleAIRorganize = async () => {
    if (selectedIds.length === 0) return;
    
    setProcessingAI(true);
    try {
      const res = await fetch('/api/drive/auto-categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveFileIds: selectedIds })
      });
      const data = await res.json();
      setProcessingAI(false);
      setSelectedIds([]);
      loadCatalog();
      alert(`AI reorganized ${data.count} books into better sub-categories.`);
    } catch (err) {
      setProcessingAI(false);
      alert('AI reorganization failed: ' + err.message);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    // In this RAG implementation, folders are just subjects.
    // Creating one just means we have a new destination for moves.
    setShowNewFolder(false);
    setNewFolderName('');
    // We update UI by showing it in the "Move" picker or by actually adding a placeholder if we wanted.
  };

  // Extract all unique subjects (paths) for the move picker
  const getAllSubjects = (node, acc = []) => {
    if (node.type === 'folder' && node.name !== 'Library') {
      // Find the path for this node
      const buildPath = (n, currentCatalog) => {
          // This is a simple version, ideally paths are stored in the tree
          return n.name; // In a real app we'd compute full branch path
      };
    }
    // Simplification: just get current subjects from flat list if we had one
    // Or traverse catalog to find folder names
    return acc;
  };

  // Filter Catalog Tree
  const filterCatalog = (node, query) => {
    const search = query.toLowerCase().trim();
    
    // Define entertainment detection logic as a reusable helper
    const filterNode = (n) => {
      // Professional Mode Pruning
      if (chatTone === 'professional' && checkIsEntertainment(n)) {
        return null;
      }

      // Search Filtering
      if (search) {
        // If it's a file, check if title matches
        if (n.type === 'file') {
          return n.name.toLowerCase().includes(search) ? n : null;
        }
        
        // If it's a folder, check if any children match
        if (n.children) {
          const matchingChildren = n.children
            .map(child => filterNode(child))
            .filter(child => child !== null);
            
          if (matchingChildren.length > 0) {
            return { ...n, children: matchingChildren };
          }
        }
        
        // If folder name itself matches, return it with all children
        if (n.name.toLowerCase().includes(search)) {
          return n;
        }
        
        return null;
      }

      // No search, just return the node (potentially pruned by professional check)
      if (n.children) {
        const prunedChildren = n.children
          .map(child => filterNode(child))
          .filter(child => child !== null);
        
        // Prune empty folders (unless they are the root)
        if (prunedChildren.length === 0 && n.type === 'folder' && n.name !== 'Library') {
          return null;
        }
        return { ...n, children: prunedChildren };
      }

      return n;
    };

    const result = filterNode(node);
    return result || { ...node, children: [] };
  };

  const filteredCatalog = catalog ? filterCatalog(catalog, searchQuery) : null;

  return (
    <div className="catalog-overlay" onClick={onClose}>

      <div className="catalog-modal expanded" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="catalog-header">
          <div className="catalog-title">
            <BookOpen size={20} className="text-accent" />
            <h2>Library Management</h2>
          </div>
          <div className="catalog-header-actions">
            <div className="catalog-search">
              <Search size={14} />
              <input 
                type="text" 
                placeholder="Search library..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <button className="global-close-btn" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="catalog-toolbar">
          <div className="catalog-toolbar-left">
            <button className="toolbar-btn primary" onClick={() => window.location.reload()}>
              <Plus size={14} />
              <span>Add Book</span>
            </button>
            <button className="toolbar-btn" onClick={() => setShowNewFolder(true)}>
              <Folder size={14} />
              <span>New Folder</span>
            </button>
            <button className="toolbar-btn" onClick={handleFindDuplicates}>
              <CheckSquare size={14} />
              <span>Find Duplicates</span>
            </button>
            <button className="toolbar-btn" onClick={() => setShowIndexSummary(true)}>
              <Search size={14} />
              <span>Index Summary</span>
            </button>
            <button className="toolbar-btn" onClick={async () => {
              try {
                await fetch('/api/drive/retry', { method: 'POST' });
                loadCatalog();
                alert('Reset failed documents. Click Sync Now in the bottom bar to retry indexing.');
              } catch (err) {
                alert('Retry failed: ' + err.message);
              }
            }}>
              <RotateCcw size={14} />
              <span>Retry Failed</span>
            </button>
          </div>
          
          <div className="catalog-toolbar-right">
            {selectedIds.length > 0 && (
              <div className="selection-actions">
                <span>{selectedIds.length} selected</span>
                <button className="toolbar-btn" onClick={() => setSelectedIds([])}>
                  <X size={14} />
                  <span>Clear</span>
                </button>
                <button className="toolbar-btn primary" onClick={handleAIRorganize} disabled={processingAI}>
                  <BookOpen size={14} />
                  <span>{processingAI ? 'AI Working...' : 'AI Reorganize'}</span>
                </button>
                <button className="toolbar-btn danger" onClick={() => {
                  setConfirmDelete(selectedIds);
                  window.catalog_abort = false;
                }}>
                  <Trash2 size={14} />
                  <span>Delete Selected</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="catalog-content">
          {loading ? (
            <div className="catalog-loading">
              <div className="spinner"></div>
              <p>Refreshing library index...</p>
            </div>
          ) : catalog ? (
            <div className="catalog-tree">
              {catalog.children.length === 0 ? (
                <div className="catalog-empty">
                  <div className="empty-icon"><BookOpen size={48} /></div>
                  <p>Your library is empty.</p>
                  <button className="btn-sync" onClick={() => window.location.reload()}>Sync with Google Drive</button>
                </div>
              ) : filteredCatalog.children.length === 0 ? (
                <div className="catalog-empty">
                  <p>No matches found for "{searchQuery}"</p>
                  <button className="text-btn" onClick={() => setSearchQuery('')}>Clear Search</button>
                </div>
              ) : (
                filteredCatalog.children.map((item, idx) => (
                  <CatalogItem 
                    key={idx} 
                    item={item} 
                    onOpenFile={onOpenFile}
                    onToggleSelect={toggleSelect}
                    isSelected={isSelected(item)}
                    isSelectedFunc={isSelected}
                    onMoveTo={setMovingItem}
                    onDelete={(ids) => setConfirmDelete(ids)}
                    selectionActive={selectedIds.length > 0}
                  />
                ))
              )}
            </div>
          ) : null}
        </div>

        {/* Confirmation Modals */}
        {confirmDelete && (
          <div className="sub-modal-overlay">
            <div className={`sub-modal ${isDeleting ? 'processing' : 'danger'}`}>
              <div className="sub-modal-icon">
                {isDeleting ? <Trash2 size={32} className="spin-pulse" /> : <AlertCircle size={32} />}
              </div>
              
              <h3>{isDeleting ? 'Deleting Books...' : `Delete ${confirmDelete.length === 1 ? 'Book' : 'Books'}?`}</h3>
              
              {!isDeleting ? (
                <p>This will remove {confirmDelete.length === 1 ? 'this book' : 'these books'} from your library index and local cache. This action cannot be undone.</p>
              ) : (
                <div className="deletion-status">
                  <div className="progress-container">
                    <div 
                      className="progress-bar" 
                      style={{ width: `${(deletionProgress.current / deletionProgress.total) * 100}%` }}
                    ></div>
                  </div>
                  <p className="progress-text">
                    Deleting {deletionProgress.current} of {deletionProgress.total}...
                  </p>
                </div>
              )}

              <div className="sub-modal-buttons">
                <button 
                  className="btn-flat" 
                  onClick={cancelOrInterruptDeleletion}
                  disabled={abortDeletion}
                >
                  {isDeleting ? 'Interrupt' : 'Cancel'}
                </button>
                {!isDeleting && (
                  <button className="btn-danger" onClick={handleDelete}>
                    Delete Permanently
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {movingItem && (
          <div className="sub-modal-overlay">
            <div className="sub-modal">
              <h3>Move "{movingItem.name}"</h3>
              <p>Enter the destination folder path (e.g. "Rules / Core"):</p>
              <input 
                type="text" 
                className="modal-input"
                placeholder="Folder Path"
                defaultValue={movingItem.subject || ''}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleMove(e.target.value);
                }}
                autoFocus
              />
              <div className="sub-modal-buttons">
                <button className="btn-flat" onClick={() => setMovingItem(null)}>Cancel</button>
                <button className="btn-primary" onClick={() => handleMove(document.querySelector('.modal-input').value)}>Move Book</button>
              </div>
            </div>
          </div>
        )}

        {showIndexSummary && (
          <div className="sub-modal-overlay" onClick={() => setShowIndexSummary(false)}>
            <div className="sub-modal expanded-summary" onClick={e => e.stopPropagation()} style={{ maxWidth: '850px', width: '95%', maxHeight: '85vh', padding: '20px' }}>
              <div className="catalog-header" style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--glass-border)' }}>
                <div className="catalog-title">
                  <CheckSquare size={18} className="text-accent" />
                  <h2 style={{ fontSize: '1.1rem' }}>Indexing Summary</h2>
                </div>
                <button className="global-close-btn" onClick={() => setShowIndexSummary(false)}>
                  <X size={18} />
                </button>
              </div>
              
              <div className="custom-scrollbar" style={{ overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '6px 8px' }}>Document Name</th>
                      <th style={{ padding: '6px 8px', width: '100px' }}>Status</th>
                      <th style={{ padding: '6px 8px' }}>Details / Error Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const docs = [];
                      const traverse = (node) => {
                        if (node.type === 'file') docs.push(node);
                        if (node.children) node.children.forEach(traverse);
                      };
                      if (catalog) traverse(catalog);
                      
                      // Sort by status: Pending first, then Error, then Indexed
                      docs.sort((a, b) => {
                        const score = (d) => d.indexed === 0 ? 0 : (d.indexed === -1 ? 1 : 2);
                        return score(a) - score(b);
                      });

                      return docs.map((doc, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.2s' }} className="summary-row-hover">
                          <td style={{ padding: '8px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.name}>
                            {doc.name}
                          </td>
                          <td style={{ padding: '8px' }}>
                            <span className={`index-status-badge compact ${doc.indexed === 1 ? 'indexed' : doc.indexed === -1 ? 'failed' : 'pending'}`}>
                              {doc.indexed === 1 ? 'Success' : doc.indexed === -1 ? 'Error' : 'Pending'}
                            </span>
                          </td>
                          <td style={{ padding: '8px', color: doc.indexed === -1 ? '#f87171' : 'var(--text-muted)', fontSize: '11px', lineHeight: '1.4' }}>
                            {doc.indexed === -1 ? (
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                                <AlertCircle size={12} style={{ marginTop: '2px', flexShrink: 0 }} />
                                <span>{doc.indexError || 'Unknown processing error. Check server logs.'}</span>
                              </div>
                            ) : (doc.indexed === 1 ? 'Successfully indexed in vector store' : 'Waiting for next sync cycle...')}
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
              
              <div className="sub-modal-buttons" style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--glass-border)' }}>
                <div style={{ marginRight: 'auto', fontSize: '11px', color: 'var(--text-muted)' }}>
                  {(() => {
                    const docs = [];
                    const traverse = (node) => {
                      if (node.type === 'file') docs.push(node);
                      if (node.children) node.children.forEach(traverse);
                    };
                    if (catalog) traverse(catalog);
                    const failed = docs.filter(d => d.indexed === -1).length;
                    const pending = docs.filter(d => d.indexed === 0).length;
                    return `Found ${failed} errors and ${pending} pending items in your library.`;
                  })()}
                </div>
                <button className="btn-primary" style={{ padding: '6px 16px', fontSize: '12px' }} onClick={() => setShowIndexSummary(false)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
