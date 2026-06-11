import { Router } from 'express';
import { getTopicsBySubject, getRandomSuggestions, getTopicsForSubject } from '../services/topicService.js';
import { getIndexedSubjects } from '../services/vectorStore.js';
import db from '../db/database.js';

const router = Router();

/**
 * GET /api/subjects - List all subjects in a hierarchical tree
 */
router.get('/', (req, res) => {
  try {
    const subjectSource = req.query.subjectSource || 'folder';

    if (subjectSource === 'toc') {
      // Get TOC-based subjects
      const tocItems = db.prepare(`
        SELECT t.*, d.filename as doc_name, d.drive_file_id as doc_drive_id
        FROM toc_items t
        JOIN documents d ON t.document_id = d.id
        ORDER BY t.document_id, t.order_index
      `).all();

      const root = { name: 'All Subjects (TOC)', children: [], documentCount: 0, path: '' };
      
      // Group by document
      const docs = {};
      for (const item of tocItems) {
        if (!docs[item.document_id]) {
          docs[item.document_id] = {
            name: item.doc_name,
            children: [],
            documentCount: 1,
            path: item.doc_drive_id,
            source: 'toc'
          };
          root.children.push(docs[item.document_id]);
          root.documentCount++;
        }
        
        // Only top-level TOC items for the sidebar tree to keep it clean?
        // Or full hierarchy? Let's do full hierarchy but limited to level 0/1 for now?
        // Actually, let's just do level 0 items as children of the document.
        if (item.level === 0) {
          docs[item.document_id].children.push({
            name: item.title,
            path: `${item.doc_drive_id}:${item.id}`,
            children: [], // We could add sub-items here if needed
            documentCount: 0,
            source: 'toc'
          });
        }
      }
      return res.json(root);
    }

    // Default: Get Folder Structure subjects
    const folderSubjects = db.prepare(`
      SELECT folder_path as subject, COUNT(*) as document_count, 
        SUM(page_count) as total_pages,
        SUM(CASE WHEN indexed = 1 THEN 1 ELSE 0 END) as indexed_count,
        'folder' as source
      FROM documents
      WHERE folder_path IS NOT NULL
      GROUP BY folder_path
    `).all();

    // Get AI Subjects
    const aiSubjects = db.prepare(`
      SELECT subject, COUNT(*) as document_count, 
        SUM(page_count) as total_pages,
        SUM(CASE WHEN indexed = 1 THEN 1 ELSE 0 END) as indexed_count,
        'ai' as source
      FROM documents
      WHERE subject_source = 'ai'
      GROUP BY subject
    `).all();

    const root = { name: 'All Subjects', children: [], documentCount: 0, path: '' };
    const folderBranch = { name: 'Folder Structure', children: [], documentCount: 0, path: 'folder_root', source: 'folder' };
    const aiBranch = { name: 'AI Categorisation', children: [], documentCount: 0, path: 'ai_root', source: 'ai' };
    
    buildSubjectTree(folderSubjects, folderBranch);
    buildSubjectTree(aiSubjects, aiBranch);
    
    if (folderBranch.children.length > 0) root.children.push(folderBranch);
    if (aiBranch.children.length > 0) root.children.push(aiBranch);
    
    root.documentCount = folderBranch.documentCount; // Total docs unique is the same

    res.json(root);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function buildSubjectTree(subjects, rootNode) {
  const root = rootNode || { name: 'All Subjects', children: [], documentCount: 0, path: '' };
  
  for (const s of subjects) {
    if (!s.subject) continue;
    const parts = s.subject.split('/').map(p => p.trim()).filter(p => p !== '');
    let current = root;
    root.documentCount += s.document_count;
    
    let currentPath = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      
      let node = current.children.find(c => c.name === part);
      const isEntertainment = (name) => {
        const n = (name || '').toLowerCase();
        // Use a more robust regex-based detection matching the client-side MeshCanvas
        const entertainmentRegex = /\b(rpg|roleplaying|role-playing|role playing|boardgame|board game|gaming|tabletop|hobby|fantasy|dungeon|dragon|quest|campaign|rulebook|playbook|adventure|scenario|starter set|wargame|miniature|games|wargaming|character|dice|encounter|bestiary|grimoire|warband|bushido|campfire|dead world|parsec|borderland|no quarter|starship|gang warfare|salvage crew)\w*/i;
        return entertainmentRegex.test(n);
      };

      if (!node) {
        node = { 
          name: part, 
          path: currentPath, 
          children: [], 
          documentCount: 0,
          isLeaf: i === parts.length - 1,
          source: s.source,
          isEntertainment: isEntertainment(part)
        };
        current.children.push(node);
      } else if (s.source === 'ai') {
        node.source = 'ai';
      }
      node.documentCount += s.document_count;
      current = node;
    }
  }
  
  // Sort children
  const sortNodes = (node) => {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    for (const child of node.children) sortNodes(child);
  };
  
  sortNodes(root);
  return root;
}


/**
 * GET /api/subjects/topics - Get all topics grouped by subject
 */
router.get('/topics', (req, res) => {
  try {
    const topics = getTopicsBySubject();
    res.json(topics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/subjects/suggestions - Get random question suggestions
 */
router.get('/suggestions', (req, res) => {
  try {
    const count = parseInt(req.query.count) || 5;
    const subjectsRaw = req.query.subjects;
    const subjects = subjectsRaw ? subjectsRaw.split(',').filter(s => s.trim() !== '') : [];
    
    const suggestions = getRandomSuggestions(count, subjects);
    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/subjects/:name/topics - Get topics for a specific subject
 */
router.get('/:name/topics', (req, res) => {
  try {
    const subject = decodeURIComponent(req.params.name);
    const topics = getTopicsForSubject(subject);
    res.json(topics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
