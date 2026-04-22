import React, { useState } from 'react';
import { Folder, ChevronRight, ChevronDown, CheckSquare, Square, MinusSquare } from 'lucide-react';

const SubjectNode = ({ node, selected, onToggle, level = 0 }) => {
  const [isOpen, setIsOpen] = useState(level === 0);
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
          {node.name}
        </span>
        
        {node.documentCount > 0 && (
          <span className="subject-badge">{node.documentCount}</span>
        )}
      </div>

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
        <div className="sidebar-section-title">
          <Folder size={12} />
          Subjects
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' }}>
          {!subjects ? 'Loading subjects...' : 'No subjects found. Sync your Drive to get started.'}
        </p>
      </div>
    );
  }

  return (
    <div className="subject-filter-container">
      <div className="sidebar-section-title" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Folder size={12} />
          Subjects
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleRefineAll}
            className={`text-btn ${isRefining ? 'pulse' : ''}`}
            disabled={isRefining}
            title="Use AI to automatically create sub-categories"
          >
            {isRefining ? 'Refining...' : 'Refine Subjects'}
          </button>
          <button
            onClick={toggleAll}
            className="text-btn"
          >
            {selected.length > 0 ? 'None' : 'All'}
          </button>
        </div>
      </div>
      
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
  );
}
