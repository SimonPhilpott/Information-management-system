import db from './db/database.js';

const rootFolderId = db.prepare("SELECT value FROM settings WHERE key = 'drive_root_folder_id'").get()?.value;
console.log('Root Folder ID:', rootFolderId);

const documents = db.prepare('SELECT drive_file_id, filename FROM documents LIMIT 5').all();
console.log('Sample Documents:', JSON.stringify(documents, null, 2));
