import { google } from 'googleapis';
import db from './db/database.js';
import config from './config.js';

async function testConnection() {
  const tokenRow = db.prepare('SELECT * FROM oauth_tokens WHERE id = 1').get();
  if (!tokenRow) {
    console.error('No tokens found in database');
    return;
  }

  console.log('Using tokens for:', tokenRow.user_email);
  console.log('Token expiry:', new Date(tokenRow.expiry_date).toLocaleString());

  const rootFolderId = '1z2dmRfvW8bfUr6wBbvYhrVb2ADxFUfoc';
  console.log('Testing with ROOT FOLDER ID:', rootFolderId);

  const oauth2Client = new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    `http://localhost:${config.port}/api/auth/callback`
  );

  oauth2Client.setCredentials({
    access_token: tokenRow.access_token,
    refresh_token: tokenRow.refresh_token,
    expiry_date: tokenRow.expiry_date
  });

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  try {
    console.log('Testing files.list with APP FIELDS...');
    const res = await drive.files.list({
      pageSize: 10,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, parents, driveId)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      q: `'${rootFolderId}' in parents AND (mimeType = 'application/pdf' or mimeType = 'application/vnd.google-apps.folder') and trashed = false`
    });
    console.log(`Success! Found ${res.data.files.length} items in root.`);
    
    async function recursiveScan(folderId, depth = 0) {
      const indent = '  '.repeat(depth);
      console.log(`${indent}Scanning folder: ${folderId}`);
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });
      
      for (const file of res.data.files) {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          await recursiveScan(file.id, depth + 1);
        } else if (file.mimeType === 'application/pdf') {
          console.log(`${indent}  Found PDF: ${file.name}`);
        }
      }
    }

    console.log('Starting full recursive scan...');
    await recursiveScan(rootFolderId);
    console.log('Recursive scan complete!');
    
    // TEST DOWNLOAD
    const pdfs = [];
    async function collectPdfs(folderId) {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });
      for (const file of res.data.files) {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          await collectPdfs(file.id);
        } else if (file.mimeType === 'application/pdf') {
          pdfs.push(file);
        }
      }
    }
    
    console.log('Collecting first 10 PDFs...');
    await collectPdfs(rootFolderId);
    
    for (let i = 0; i < Math.min(10, pdfs.length); i++) {
      const testFile = pdfs[i];
      console.log(`Testing download [${i+1}/10]: ${testFile.name} (${testFile.id})`);
      try {
        const download = await drive.files.get(
          { fileId: testFile.id, alt: 'media', supportsAllDrives: true },
          { responseType: 'arraybuffer' }
        );
        console.log(`  Download success! Received ${download.data.byteLength} bytes.`);
      } catch (dlErr) {
        console.error(`  Download failed for ${testFile.name}:`, dlErr.message);
        if (dlErr.response) {
          console.error('  Status:', dlErr.response.status);
          console.error('  Data:', JSON.stringify(dlErr.response.data, null, 2));
        }
      }
    }

    console.log('Testing about.get...');
    const about = await drive.about.get({ fields: 'user, storageQuota, exportFormats' });
    console.log('User info from API:', about.data.user.emailAddress);
  } catch (err) {
    console.error('API Error details:');
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err);
    }
  }
}

testConnection();
