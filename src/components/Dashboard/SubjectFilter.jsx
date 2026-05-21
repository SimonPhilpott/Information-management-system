import React, { useState } from 'react';
import { Folder, ChevronRight, ChevronDown, CheckSquare, Square, MinusSquare, Sparkles } from 'lucide-react';
import { Tooltip } from './CursorHover';

const SubjectNode = ({ node, selected, onToggle, level = 0 }) => {
  const [isOpen, setIsOpen] = useState(false);
  const isFolder = node.children && node.children.length > 0;
  
  // Recursively check if all children are selected
  const getAllLeafPaths = (n) => {
    let paths = [];
    if (n.path) paths.push(n.path);
    if (n.children) {
      for (const child of n.children) {
        paths.push(...getAllLeafPaths(child));
      }
    }
    return [...new Set(paths)];
  };

  const leafPaths = getAllLeafPaths(node).filter(p => p !== '');
  const selectedCount = leafPaths.filter(p => selected.includes(p)).length;
  const isSelected = leafPaths.length > 0 && selectedCount === leafPaths.length;
  const isIndeterminate = selectedCount > 0 && selectedCount < leafPaths.length;

  const handleToggle = (e) => {
    e.stopPropagation();
    onToggle(leafPaths, !isSelected);
  };

  const toggleOpen = (e) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  if (node.path === '' && level === 0 && (!node.children || node.children.length === 0)) {
    return null;
  }

  return (
    <div className="subject-tree-node">
      <Tooltip text={`${node.path || node.name} (${node.documentCount} documents)`}>
        <div 
          className={`subject-tree-item ${node.path === '' ? 'root' : ''}`}
          style={{ paddingLeft: `${node.path === '' ? 0 : level * 12 + 4}px` }}
          onClick={isFolder ? toggleOpen : handleToggle}
        >
          <span className="subject-tree-chevron" onClick={toggleOpen}>
            {isFolder ? (
              isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />
            ) : (
              <span style={{ width: 12 }} />
            )}
          </span>
          
          <span className="subject-tree-checkbox" onClick={handleToggle}>
            {isSelected ? (
              <CheckSquare size={14} className="text-accent" />
            ) : isIndeterminate ? (
              <MinusSquare size={14} className="text-accent" />
            ) : (
              <Square size={14} />
            )}
          </span>

          <span className="subject-tree-name">
            {node.source === 'ai' ? (
              <Sparkles size={12} className="text-accent" style={{ marginRight: '6px', display: 'inline-block' }} />
            ) : (
              <Folder size={12} style={{ marginRight: '6px', display: 'inline-block', opacity: 0.6 }} />
            )}
            {node.name}
            {node.indexStatus && node.indexStatus !== 'none' && (
              <span className={`subject-status-dot ${node.indexStatus}`} />
            )}
          </span>
          
          {node.documentCount > 0 && (
            <span className="subject-badge">{node.documentCount}</span>
          )}
        </div>
      </Tooltip>

      {isFolder && isOpen && (
        <div className="subject-tree-children">
          {node.children.map((child, idx) => (
            <SubjectNode 
              key={idx} 
              node={child} 
              selected={selected} 
              onToggle={onToggle} 
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default function SubjectFilter({ subjects, selected, onChange, onRefineAll }) {
  const [isRefining, setIsRefining] = useState(false);

  const handleToggle = (paths, shouldSelect) => {
    let newSelected;
    if (shouldSelect) {
      newSelected = [...new Set([...selected, ...paths])];
    } else {
      newSelected = selected.filter(p => !paths.includes(p));
    }
    onChange(newSelected);
  };

  const handleRefineAll = async () => {
    if (isRefining) return;
    setIsRefining(true);
    try {
      await onRefineAll();
    } finally {
      setIsRefining(false);
    }
  };

  const toggleAll = () => {
    if (!subjects || !subjects.children) return;
    if (selected.length > 0) {
      onChange([]);
    } else {
      // Get all paths from tree
      const getAllPaths = (node) => {
        let paths = node.path ? [node.path] : [];
        if (node.children) {
          node.children.forEach(c => paths.push(...getAllPaths(c)));
        }
        return paths;
      };
      const allPaths = [...new Set(getAllPaths(subjects))];
      onChange(allPaths);
    }
  };

  if (!subjects || !subjects.children || subjects.children.length === 0) {
    return (
      <div className="subject-filter-container">
        <div className="sidebar-section-title" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Folder size={12} />
            Subjects
          </span>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' }}>
          {!subjects ? 'Loading subjects...' : 'No subjects found. Sync your Drive to get started.'}
        </p>
      </div>
    );
  }

  return (
    <div className="subject-filter-container">
      <div className="sidebar-section-title" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Folder size={12} />
          Subjects
        </span>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', justifyContent: 'flex-end' }}>
        <Tooltip text="Use AI to automatically categorise files based on content">
          <button
            onClick={handleRefineAll}
            className={`text-btn ${isRefining ? 'pulse' : ''}`}
            disabled={isRefining}
          >
            {isRefining ? 'Refreshing...' : 'Refresh Subjects'}
          </button>
        </Tooltip>
        <Tooltip text={selected.length > 0 ? 'Deselect all subjects' : 'Select all subjects'}>
          <button
            onClick={toggleAll}
            className="text-btn"
          >
            {selected.length > 0 ? 'None' : 'All'}
          </button>
        </Tooltip>
      </div>
      
      <div className="subject-tree-scroll-container">
        <div className="subject-tree-root">
          {subjects.children.map((node, idx) => (
            <SubjectNode 
              key={idx} 
              node={node} 
              selected={selected} 
              onToggle={handleToggle} 
            />
          ))}
        </div>
      </div>
    </div>
  );
}
