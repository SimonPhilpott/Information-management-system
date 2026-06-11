import db from '../db/database.js';

/**
 * Generates a spatial graph representation of the library.
 * Nodes = Books
 * Links = Shared concepts/topics
 */
export async function getSpatialGraph(sensitivity = 1, subjectSource = 'folder') {
  try {
    // 1. Fetch all documents
    const rawDocuments = db.prepare(`
      SELECT id, drive_file_id, filename, subject, folder_path
      FROM documents
    `).all();

    const documents = rawDocuments.map(doc => {
      if (doc.subject) {
        // Normalize subject delimiter to consistently use ' / '
        doc.subject = doc.subject.split(/\s*\/\s*/).join(' / ');
      }
      return doc;
    });

    // 2. Fetch all topics for these documents
    const topics = db.prepare(`
      SELECT document_id, topic
      FROM topics
    `).all();

    // 3. Map topics to documents
    const docTopics = {};
    topics.forEach(t => {
      if (!docTopics[t.document_id]) docTopics[t.document_id] = new Set();
      docTopics[t.document_id].add(t.topic.toLowerCase().trim());
    });

    // 4. Create nodes
    const isEntertainment = (val) => {
      const v = (val || '').toLowerCase();
      const entertainmentRegex = /\b(rpg|role-?playing|board-?game|gaming|tabletop|hobby|fantasy|dungeon|dragon|quest|campaign|rulebook|playbook|adventure|scenario|starter set|wargame|miniature|games|wargaming|character|dice|encounter|bestiary|grimoire|warband|bushido|campfire|dead world|parsec|borderland|no quarter|starship|gang warfare|salvage crew|cyberpunk|osr|pbt|d20|fate core|savage worlds|cthulhu|pathfinder|warhammer|d&d|dungeons)\w*/i;
      return entertainmentRegex.test(v);
    };

    const nodes = documents.map(doc => ({
      id: doc.id,
      type: 'book',
      driveFileId: doc.drive_file_id,
      name: doc.filename,
      subject: doc.subject,
      folder_path: doc.folder_path,
      val: 1,
      topics: Array.from(docTopics[doc.id] || []),
      isEntertainment: isEntertainment(doc.filename) || isEntertainment(doc.subject) || isEntertainment(doc.folder_path)
    }));

    // 5. Create Subject Nodes
    const uniqueSubjects = new Set();
    documents.forEach(doc => {
      if (doc.subject) {
        // Robust splitting for both ' / ' and '/'
        const parts = doc.subject.split(/\s*\/\s*/);
        parts.forEach((part, index) => {
          const path = parts.slice(0, index + 1).join(' / ');
          uniqueSubjects.add(path);
        });
      }
    });

    // 5. Create Subject Nodes (Merged by Leaf Name to avoid duplicates)
    const subjectLeafToId = {}; // Map leaf name -> node ID
    const pathIdToLeafId = {};  // Map full path -> shared leaf ID

    uniqueSubjects.forEach(subjectPath => {
      const parts = subjectPath.split(' / ');
      const name = parts[parts.length - 1];
      const leafKey = name.toLowerCase().trim();
      
      if (!subjectLeafToId[leafKey]) {
        const sharedId = `subj_${leafKey}`;
        subjectLeafToId[leafKey] = sharedId;
        nodes.push({
          id: sharedId,
          type: 'subject',
          name: name, 
          fullName: name,
          val: 3, 
          isSubject: true,
          level: parts.length - 1, // Store folder subject depth (0-indexed)
          isEntertainment: isEntertainment(name) || isEntertainment(subjectPath)
        });
      }
      pathIdToLeafId[subjectPath] = subjectLeafToId[leafKey];
    });

    // 6. Create links
    const links = [];

    // 5b. If using TOC source, add TOC-derived subject nodes instead of folder subjects
    if (subjectSource === 'toc') {
      // 1. Remove all folder-based subject nodes
      const bookNodes = nodes.filter(n => n.type === 'book');
      nodes.length = 0;
      nodes.push(...bookNodes);

      // 2. Fetch TOC items (Allowing full depth retrieval up to internal level 5)
      const tocItems = db.prepare(`
        SELECT t.*, d.filename, d.drive_file_id as doc_drive_id, d.id as doc_id
        FROM toc_items t
        JOIN documents d ON t.document_id = d.id
        WHERE t.level <= 5
        ORDER BY t.document_id, t.order_index
        LIMIT 10000
      `).all();

      const tocNodeIds = new Set();
      const tocItemMap = new Map();

      // 3. Create TOC Nodes
      for (const item of tocItems) {
        const tocId = `toc_${item.doc_drive_id}_${item.id}`;
        tocNodeIds.add(tocId);
        tocItemMap.set(item.id, item);

        nodes.push({
          id: tocId,
          type: 'toc_item',
          name: item.title,
          fullName: `${item.filename} › ${item.title}`,
          val: item.level === 0 ? 2 : (item.level === 1 ? 1.5 : 1),
          documentId: item.doc_id,
          driveFileId: item.doc_drive_id,
          tocLevel: item.level,
          isEntertainment: isEntertainment(item.title) || isEntertainment(item.filename)
        });
      }

      // 4. Create TOC Links
      for (const item of tocItems) {
        const nodeId = `toc_${item.doc_drive_id}_${item.id}`;
        
        // Link to Parent TOC Item
        if (item.parent_id) {
          const parentItem = tocItemMap.get(item.parent_id);
          // Only link if parent is also within our depth limit
          if (parentItem && parentItem.document_id === item.document_id) {
            const parentNodeId = `toc_${item.doc_drive_id}_${parentItem.id}`;
            links.push({ source: nodeId, target: parentNodeId, type: 'hierarchy' });
          }
        }
        
        // Link Root TOC Items to their Book
        if (item.level === 0) {
          links.push({ source: item.doc_id, target: nodeId, type: 'category' });
        }
      }
    } else {
      // Folder-based links (existing logic)
      
      // Link documents to their leaf subjects
      documents.forEach(doc => {
        if (doc.subject) {
          links.push({
            source: doc.id,
            target: pathIdToLeafId[doc.subject],
            type: 'category'
          });
        }
      });

      // Link subjects to their parent subjects (hierarchy)
      const hierarchyPairs = new Set();
      uniqueSubjects.forEach(subjectPath => {
        const parts = subjectPath.split(' / ');
        if (parts.length > 1) {
          const parentPath = parts.slice(0, parts.length - 1).join(' / ');
          const childId = pathIdToLeafId[subjectPath];
          const parentId = pathIdToLeafId[parentPath];
          
          const pairKey = `${childId}->${parentId}`;
          if (!hierarchyPairs.has(pairKey)) {
            links.push({
              source: childId,
              target: parentId,
              type: 'hierarchy'
            });
            hierarchyPairs.add(pairKey);
          }
        }
      });
    }

    const discoveryThreshold = Math.max(1, 3 - Math.floor(sensitivity / 2));

    if (subjectSource !== 'toc') {
      // 7. Topic aggregation for subjects
      const subjectTopics = {};
      documents.forEach(doc => {
        if (doc.subject) {
          const parts = doc.subject.split(/\s*\/\s*/);
          const dTopics = docTopics[doc.id] || new Set();
          
          parts.forEach((_, index) => {
            const path = parts.slice(0, index + 1).join(' / ');
            if (!subjectTopics[path]) subjectTopics[path] = new Set();
            dTopics.forEach(t => subjectTopics[path].add(t));
          });
        }
      });

      const subjectPaths = Array.from(Object.keys(subjectTopics));

      // 8. Discovery Links: Subject to Subject similarity
      const leafTopics = {};
      Object.entries(subjectTopics).forEach(([path, tSet]) => {
        const leafId = pathIdToLeafId[path];
        if (!leafTopics[leafId]) leafTopics[leafId] = new Set();
        tSet.forEach(t => leafTopics[leafId].add(t));
      });

      const leafIds = Object.keys(leafTopics);

      for (let i = 0; i < leafIds.length; i++) {
        for (let j = i + 1; j < leafIds.length; j++) {
          const idA = leafIds[i];
          const idB = leafIds[j];
          
          const topicsA = leafTopics[idA];
          const topicsB = leafTopics[idB];
          const shared = Array.from(topicsA).filter(t => topicsB.has(t));
          
          if (shared.length >= discoveryThreshold) { 
            links.push({
              source: idA,
              target: idB,
              type: 'thematic',
              value: shared.length * 0.5,
              shared: shared
            });
          }
        }
      }

      // 9. Discovery Links: Document to Related Subjects (Cross-pollination)
      documents.forEach(doc => {
        subjectPaths.forEach(path => {
          const leafId = pathIdToLeafId[path];
          if (pathIdToLeafId[doc.subject] === leafId) return; 
          
          const dTopics = docTopics[doc.id] || new Set();
          const sTopics = subjectTopics[path];
          const shared = Array.from(dTopics).filter(t => sTopics.has(t));
          
          if (shared.length >= discoveryThreshold * 1.5) { 
            links.push({
              source: doc.id,
              target: leafId,
              type: 'discovery',
              value: shared.length * 0.3,
              shared: shared
            });
          }
        });
      });
    }

    // 10. Semantic Links: Document to Document (Restored & Optimized)
    for (let i = 0; i < documents.length; i++) {
      for (let j = i + 1; j < documents.length; j++) {
        const docA = documents[i];
        const docB = documents[j];
        
        const topicsA = docTopics[docA.id] || new Set();
        const topicsB = docTopics[docB.id] || new Set();
        const sharedTopics = Array.from(topicsA).filter(t => topicsB.has(t));
        
        if (sharedTopics.length >= discoveryThreshold) {
          links.push({
            source: docA.id,
            target: docB.id,
            type: 'semantic',
            value: sharedTopics.length,
            shared: sharedTopics
          });
        }
      }
    }

    // Defensive pass to filter out any links referencing non-existent nodes
    const nodeIds = new Set(nodes.map(n => n.id));
    const validLinks = links.filter(l => {
      const srcId = l.source?.id ?? l.source;
      const tgtId = l.target?.id ?? l.target;
      return nodeIds.has(srcId) && nodeIds.has(tgtId);
    });

    return { nodes, links: validLinks };
  } catch (err) {
    console.error('[GraphService] Failed to generate spatial graph:', err);
    throw err;
  }
}
