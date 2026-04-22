import React, { useState, useEffect, useCallback } from 'react';
import { 
  Folder, File, ChevronRight, ChevronDown, X, BookOpen, 
  ExternalLink, Trash2, Move, Plus, Search, CheckSquare, Square,
  AlertCircle, ChevronLeft
} from 'lucide-react';

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
              <File size={14} />
            )}
          </span>
          
          <span className={`catalog-item-checkbox ${selectionActive ? 'visible' : ''}`} onClick={handleSelect}>
            {isSelected ? <CheckSquare size={14} className="text-accent" /> : <Square size={14} />}
          </span>
        </div>

        <span className="catalog-type-icon">
          {isFolder && <Folder size={16} className="folder-icon" />}
        </span>
        
        <span className="catalog-name">{item.name}</span>
        
        {!isFolder && (
          <div className="catalog-actions">
            <span className="catalog-meta">{item.pageCount} pages</span>
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

export default function CatalogBrowser({ onClose, onOpenFile }) {
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
    if (!query) return node;
    
    const search = query.toLowerCase();
    
    const filterNode = (n) => {
      // If it's a file, check if title matches
      if (n.type === 'file') {
        return n.name.toLowerCase().includes(search);
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
            <button className="catalog-close" onClick={onClose}>
              <X size={20} />
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

        {showNewFolder && (
          <div className="sub-modal-overlay">
            <div className="sub-modal">
              <h3>Create New Folder</h3>
              <input 
                type="text" 
                className="modal-input"
                placeholder="Folder Name"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                autoFocus
              />
              <div className="sub-modal-buttons">
                <button className="btn-flat" onClick={() => setShowNewFolder(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleCreateFolder}>Create</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
