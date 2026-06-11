import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';
import { removeDocument, updateDocumentSubject } from './vectorStore.js';
import db, { getSetting, setSetting } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_CACHE_DIR = path.join(__dirname, '..', 'data', 'pdfs');

// Ensure cache directory exists
fs.mkdirSync(PDF_CACHE_DIR, { recursive: true });

let syncProgress = { active: false, total: 0, current: 0, currentFile: '', phase: '', error: null };
let lastAuthError = null;

/**
 * Create an OAuth2 client
 */
export function createOAuth2Client() {
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri
  );
}

/**
 * Get an authenticated OAuth2 client using stored tokens
 */
export function getAuthenticatedClient() {
  const tokenRow = db.prepare('SELECT * FROM oauth_tokens WHERE id = 1').get();
  if (!tokenRow || !tokenRow.refresh_token) {
    return null;
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokenRow.access_token,
    refresh_token: tokenRow.refresh_token,
    token_type: tokenRow.token_type,
    expiry_date: tokenRow.expiry_date
  });

  // Auto-refresh on token expiry
  oauth2Client.on('tokens', (tokens) => {
    const updateStmt = db.prepare(`
      UPDATE oauth_tokens SET 
        access_token = COALESCE(?, access_token),
        expiry_date = COALESCE(?, expiry_date)
      WHERE id = 1
    `);
    updateStmt.run(tokens.access_token, tokens.expiry_date);
  });

  return oauth2Client;
}

/**
 * Store OAuth tokens after authorization
 */
export function storeTokens(tokens, userInfo) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO oauth_tokens (id, access_token, refresh_token, token_type, expiry_date, user_email, user_name)
    VALUES (1, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    tokens.access_token,
    tokens.refresh_token,
    tokens.token_type,
    tokens.expiry_date,
    userInfo?.email || null,
    userInfo?.name || null
  );
  lastAuthError = null; // Clear error on successful token storage
}

/**
 * Get auth status
 */
export function getAuthStatus() {
  const tokenRow = db.prepare('SELECT user_email, user_name FROM oauth_tokens WHERE id = 1').get();
  return {
    authenticated: !!tokenRow?.user_email,
    email: tokenRow?.user_email || null,
    name: tokenRow?.user_name || null,
    authError: lastAuthError
  };
}

/**
 * List top-level folders in Google Drive for the folder picker
 */
export async function listDriveFolders(parentId = 'root') {
  const auth = getAuthenticatedClient();
  if (!auth) throw new Error('Not authenticated');

  const drive = google.drive({ version: 'v3', auth });
  const folders = [];
  let pageToken = null;

  do {
    const response = await drive.files.list({
      q: `'${parentId}' in parents AND mimeType = 'application/vnd.google-apps.folder' AND trashed = false`,
      fields: 'nextPageToken, files(id, name, parents)',
      orderBy: 'name',
      pageSize: 100,
      pageToken: pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });

    if (response.data.files) {
      folders.push(...response.data.files);
    }
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  return folders;
}

/**
 * Normalize subject names for consistency (e.g., AI -> Artificial Intelligence)
 */
function normalizeSubjectPart(name) {
  const normalizationMap = {
    'AI': 'Artificial Intelligence',
    'RPG': 'Boardgames & Role-Playing Games'
  };
  return normalizationMap[name] || name;
}

/**
 * Recursively scan the root folder for PDFs, building a subject tree
 */
async function scanFolder(drive, folderId, subject = null) {
  const results = [];

  // Get subfolders with pagination
  let pageToken = null;
  do {
    let foldersResponse;
    try {
      foldersResponse = await drive.files.list({
        q: `'${folderId}' in parents AND mimeType = 'application/vnd.google-apps.folder' AND trashed = false`,
        fields: 'nextPageToken, files(id, name)',
        orderBy: 'name',
        pageSize: 100,
        pageToken: pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        corpora: 'allDrives'
      });
    } catch (err) {
      console.warn(`[Sync] Skipping subfolders of ${folderId} due to error:`, err.message);
      break;
    }

    const subfolders = foldersResponse.data.files || [];
    for (const folder of subfolders) {
      try {
        const normalizedFolderName = normalizeSubjectPart(folder.name);
        const subjectName = subject ? `${subject} / ${normalizedFolderName}` : normalizedFolderName;
        const subResults = await scanFolder(drive, folder.id, subjectName);
        results.push(...subResults);
      } catch (err) {
        console.warn(`[Sync] Failed to scan subfolder ${folder.name} (${folder.id}):`, err.message);
      }
    }
    pageToken = foldersResponse.data.nextPageToken;
  } while (pageToken);

  // Get PDFs with pagination
  pageToken = null;
  do {
    let pdfsResponse;
    try {
      pdfsResponse = await drive.files.list({
        q: `'${folderId}' in parents AND mimeType = 'application/pdf' AND trashed = false`,
        fields: 'nextPageToken, files(id, name, size, modifiedTime)',
        orderBy: 'name',
        pageSize: 100,
        pageToken: pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        corpora: 'allDrives'
      });
    } catch (err) {
      console.warn(`[Sync] Skipping PDFs in ${folderId} due to error:`, err.message);
      break;
    }

    const pdfs = pdfsResponse.data.files || [];
    for (const pdf of pdfs) {
      results.push({
        driveFileId: pdf.id,
        filename: pdf.name,
        subject: subject || 'Uncategorised',
        fileSize: parseInt(pdf.size || '0'),
        modifiedTime: pdf.modifiedTime
      });
    }
    pageToken = pdfsResponse.data.nextPageToken;
  } while (pageToken);

  return results;
}


/**
 * Download a PDF from Google Drive and cache it locally
 */
async function downloadPdf(drive, fileId, filename) {
  const filePath = path.join(PDF_CACHE_DIR, `${fileId}.pdf`);

  // Skip if already cached
  if (fs.existsSync(filePath)) {
    return filePath;
  }

  const response = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );

  return new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(filePath);
    response.data
      .on('end', () => resolve(filePath))
      .on('error', reject)
      .pipe(dest);
  });
}

/**
 * Get the current sync progress
 */
export function getSyncProgress() {
  return { ...syncProgress };
}

/**
 * Sync all PDFs from the configured Drive folder
 */
export async function syncPdfs() {
  const rootFolderId = getSetting('drive_root_folder_id');
  if (!rootFolderId) {
    throw new Error('No Drive folder configured. Please set up a root folder first.');
  }

  if (syncProgress.active) {
    console.log('[Sync] Sync already active. Skipping.');
    return;
  }

  const auth = getAuthenticatedClient();
  if (!auth) throw new Error('Not authenticated');
  const drive = google.drive({ version: 'v3', auth });

  syncProgress = { active: true, total: 0, current: 0, currentFile: '', phase: 'Initializing...', error: null };
  lastAuthError = null; // Clear previous errors on start

  try {
    // Phase 1: Scan for PDFs
    syncProgress.phase = 'Scanning Drive folders...';
    const pdfFiles = await scanFolder(drive, rootFolderId);
    syncProgress.total = pdfFiles.length;
    syncProgress.phase = 'Downloading PDFs...';

    const insertOrUpdate = db.prepare(`
      INSERT INTO documents (id, drive_file_id, filename, folder_path, subject, subject_source, file_size, drive_modified_time, last_synced)
      VALUES (?, ?, ?, ?, ?, 'folder', ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(drive_file_id) DO UPDATE SET
        filename = excluded.filename,
        folder_path = excluded.folder_path,
        -- ONLY update subject if it is currently from 'folder' or 'Uncategorised'
        subject = CASE 
          WHEN subject_source = 'folder' OR subject = 'Uncategorised' THEN excluded.subject 
          ELSE subject 
        END,
        file_size = excluded.file_size,
        drive_modified_time = excluded.drive_modified_time,
        last_synced = CURRENT_TIMESTAMP
    `);

    // Phase 2: Download and register each PDF
    for (let i = 0; i < pdfFiles.length; i++) {
      const file = pdfFiles[i];
      syncProgress.current = i + 1;
      syncProgress.currentFile = file.filename;

      try {
        // Check if we need to re-download
        const existing = db.prepare('SELECT drive_modified_time FROM documents WHERE drive_file_id = ?').get(file.driveFileId);
        const needsDownload = !existing || existing.drive_modified_time !== file.modifiedTime;

        if (needsDownload) {
          // Delete old cache if exists
          const cachePath = path.join(PDF_CACHE_DIR, `${file.driveFileId}.pdf`);
          if (fs.existsSync(cachePath)) {
            fs.unlinkSync(cachePath);
          }
          await downloadPdf(drive, file.driveFileId, file.filename);
        }

        insertOrUpdate.run(
          uuidv4(),
          file.driveFileId,
          file.filename,
          file.subject, // This is the folder path from scanFolder
          file.subject, // Also use as initial subject
          file.fileSize,
          file.modifiedTime
        );
      } catch (err) {
        console.error(`Failed to sync ${file.filename}:`, err.message);
      }
    }

    // Phase 3: Cleanup deleted documents
    syncProgress.phase = 'Cleaning up deleted documents...';
    const driveIdsFound = pdfFiles.map(f => f.driveFileId);
    const existingDocs = db.prepare('SELECT drive_file_id, filename FROM documents').all();
    
    const missingIds = existingDocs
      .filter(doc => !driveIdsFound.includes(doc.drive_file_id))
      .map(doc => doc.drive_file_id);
    
    if (missingIds.length > 0) {
      console.log(`[Sync] Removing ${missingIds.length} documents that are no longer in Drive.`);
      await deleteDocuments(missingIds);
    }

    syncProgress.phase = 'Complete';
    syncProgress.active = false;
    lastAuthError = null; // Clear on success
    return {
      total: pdfFiles.length,
      subjects: [...new Set(pdfFiles.map(f => f.subject))]
    };
  } catch (err) {
    syncProgress.active = false;
    if (err.message.includes('invalid_grant') || err.message.includes('Token has been expired') || err.message.includes('No refresh token')) {
      lastAuthError = 'Session Expired';
      syncProgress.phase = 'Error: Session Expired';
      syncProgress.error = 'Session Expired';
    } else {
      console.error('[Sync] Full Error Object:', JSON.stringify(err, null, 2));
      
      // LOG TO FILE FOR AGENT INSPECTION
      try {
        const errorLog = {
          timestamp: new Date().toISOString(),
          message: err.message,
          stack: err.stack,
          data: err.response?.data || null,
          status: err.response?.status || null
        };
        fs.writeFileSync(path.join(__dirname, '..', 'data', 'sync_error.json'), JSON.stringify(errorLog, null, 2));
      } catch (logErr) {
        console.error('Failed to write error log:', logErr);
      }

      lastAuthError = err.message;
      syncProgress.phase = 'Error: ' + err.message;
      syncProgress.error = err.message;
    }
    throw err;
  }
}

/**
 * Get the cached PDF path for a Drive file
 */
export function getCachedPdfPath(driveFileId) {
  const filePath = path.join(PDF_CACHE_DIR, `${driveFileId}.pdf`);
  if (fs.existsSync(filePath)) {
    return filePath;
  }
  return null;
}

/**
 * Download a PDF on demand if not cached
 */
export async function ensurePdfCached(driveFileId) {
  let filePath = getCachedPdfPath(driveFileId);
  if (filePath) return filePath;

  const auth = getAuthenticatedClient();
  if (!auth) throw new Error('Not authenticated');

  const drive = google.drive({ version: 'v3', auth });
  return await downloadPdf(drive, driveFileId, driveFileId);
}
/**
 * Get the full catalog structure as a hierarchical tree
 */
export function getCatalogStructure() {
  const documents = db.prepare(`
    SELECT d.id, d.drive_file_id, d.filename, d.subject, d.subject_source, d.page_count, d.file_size, d.indexed, d.index_error,
           GROUP_CONCAT(t.topic, ', ') as themes
    FROM documents d
    LEFT JOIN topics t ON d.id = t.document_id
    GROUP BY d.id
  `).all();
  
  const root = { name: 'Library', type: 'folder', children: [] };
  
  for (const doc of documents) {
    const parts = doc.subject ? doc.subject.split(' / ') : ['Uncategorised'];
    let current = root;
    
    // Navigate/create folder structure
    for (const part of parts) {
      let folder = current.children.find(c => c.name === part && c.type === 'folder');
      if (!folder) {
        folder = { 
          name: part, 
          type: 'folder', 
          children: [],
          isAI: doc.subject_source === 'ai'
        };
        current.children.push(folder);
      } else if (doc.subject_source === 'ai') {
        // If an AI-sourced file is in this folder, we can consider it an AI-enhanced folder
        folder.isAI = true;
      }
      current = folder;
    }
    
    // Add file to folder
    current.children.push({
      id: doc.id,
      driveFileId: doc.drive_file_id,
      name: doc.filename,
      type: 'file',
      subject: doc.subject,
      subjectSource: doc.subject_source,
      pageCount: doc.page_count,
      fileSize: doc.file_size,
      themes: doc.themes,
      indexed: doc.indexed,
      indexError: doc.index_error
    });
  }
  
  // Recursive function to calculate folder stats (document count and index status)
  const calculateFolderStats = (node) => {
    if (node.type === 'file') {
      return { total: 1, indexed: node.indexed ? 1 : 0 };
    }
    
    let totalDocs = 0;
    let indexedDocs = 0;
    
    for (const child of node.children) {
      const stats = calculateFolderStats(child);
      totalDocs += stats.total;
      indexedDocs += stats.indexed;
    }
    
    node.documentCount = totalDocs;
    node.indexedCount = indexedDocs;
    
    if (totalDocs === 0) {
      node.indexStatus = 'none';
    } else if (indexedDocs === totalDocs) {
      node.indexStatus = 'green';
    } else if (indexedDocs === 0) {
      node.indexStatus = 'red';
    } else {
      node.indexStatus = 'amber';
    }
    
    return { total: totalDocs, indexed: indexedDocs };
  };
  
  calculateFolderStats(root);
  
  // Sort children: folders first, then alphabetical
  const sortFunc = (a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  };
  
  const deepSort = (node) => {
    if (node.children) {
      node.children.sort(sortFunc);
      for (const child of node.children) deepSort(child);
    }
  };
  
  deepSort(root);
  return root;
}

/**
 * Delete documents from the library
 */
export async function deleteDocuments(driveFileIds) {
  const stmt = db.prepare('SELECT subject, filename FROM documents WHERE drive_file_id = ?');
  const delMsgStmt = db.prepare('DELETE FROM chat_messages WHERE citations_json LIKE ?');
  const delDocStmt = db.prepare('DELETE FROM documents WHERE drive_file_id = ?');
  const delTopicStmt = db.prepare('DELETE FROM topics WHERE document_id = (SELECT id FROM documents WHERE drive_file_id = ?)');

  for (const id of driveFileIds) {
    const doc = stmt.get(id);
    if (doc) {
      // 1. Remove from vector store
      removeDocument(id, doc.subject);
      
      // 2. Remove topics
      delTopicStmt.run(id);
      
      // 3. Remove from documents table
      delDocStmt.run(id);
      
      // 4. Delete local cache file
      const cachePath = path.join(PDF_CACHE_DIR, `${id}.pdf`);
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
      }
      
      console.log(`[Library] Deleted document: ${doc.filename}`);
    }
  }
}

/**
 * Move a document to a new subject/folder
 */
export async function moveDocument(driveFileId, newSubject, source = 'folder') {
  const doc = db.prepare('SELECT subject, filename FROM documents WHERE drive_file_id = ?').get(driveFileId);
  if (!doc) throw new Error('Document not found');

  if (doc.subject === newSubject) return;

  // 1. Update vector store
  updateDocumentSubject(driveFileId, doc.subject, newSubject);

  // 2. Update topics
  db.prepare('UPDATE topics SET subject = ? WHERE document_id = (SELECT id FROM documents WHERE drive_file_id = ?)').run(newSubject, driveFileId);

  // 3. Update documents table
  db.prepare('UPDATE documents SET subject = ?, subject_source = ? WHERE drive_file_id = ?').run(newSubject, source, driveFileId);
  
  console.log(`[Library] Moved '${doc.filename}' from '${doc.subject}' to '${newSubject}'`);
}

/**
 * Create a new folder (represented as a subject in our DB)
 */
export function createFolder(path) {
  // We don't need to do much in the DB for an empty folder, 
  // but we can ensure it follows our naming convention
  return path.trim();
}

/**
 * Find duplicate documents by filename
 */
export function findDuplicates() {
  const allDocs = db.prepare('SELECT id, drive_file_id, filename, subject, last_synced FROM documents').all();
  const groups = {};
  
  for (const doc of allDocs) {
    if (!groups[doc.filename]) groups[doc.filename] = [];
    groups[doc.filename].push(doc);
  }
  
  const duplicateIds = [];
  for (const filename in groups) {
    if (groups[filename].length > 1) {
      // Sort by sync date, keep the oldest one
      groups[filename].sort((a, b) => new Date(a.last_synced) - new Date(b.last_synced));
      // All but the first are duplicates
      duplicateIds.push(...groups[filename].slice(1).map(d => d.drive_file_id));
    }
  }
  
  return duplicateIds;
}
