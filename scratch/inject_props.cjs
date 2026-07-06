const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, '../src/App.jsx');
let content = fs.readFileSync(appJsPath, 'utf8');

const target = `             onReset={resetLayout} 
             onBackup={handleBackup} 
             layoutRules={layoutRules}`;

const replacement = `             onReset={resetLayout} 
             onBackup={handleBackup} 
             onGetMeshBackups={handleGetMeshBackups}
             onCreateMeshBackup={handleCreateMeshBackup}
             onRestoreMeshBackup={handleRestoreMeshBackup}
             layoutRules={layoutRules}`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(appJsPath, content, 'utf8');
  console.log('Successfully updated App.jsx with props');
} else {
  // Let's try matching with different spacing
  const targetClean = `onReset={resetLayout}\r\n             onBackup={handleBackup}\r\n             layoutRules={layoutRules}`;
  const targetCleanLF = `onReset={resetLayout}\n             onBackup={handleBackup}\n             layoutRules={layoutRules}`;
  
  if (content.includes(targetClean)) {
    content = content.replace(targetClean, `onReset={resetLayout}\r\n             onBackup={handleBackup}\r\n             onGetMeshBackups={handleGetMeshBackups}\r\n             onCreateMeshBackup={handleCreateMeshBackup}\r\n             onRestoreMeshBackup={handleRestoreMeshBackup}\r\n             layoutRules={layoutRules}`);
    fs.writeFileSync(appJsPath, content, 'utf8');
    console.log('Successfully updated App.jsx with props (CRLF)');
  } else if (content.includes(targetCleanLF)) {
    content = content.replace(targetCleanLF, `onReset={resetLayout}\n             onBackup={handleBackup}\n             onGetMeshBackups={handleGetMeshBackups}\n             onCreateMeshBackup={handleCreateMeshBackup}\n             onRestoreMeshBackup={handleRestoreMeshBackup}\n             layoutRules={layoutRules}`);
    fs.writeFileSync(appJsPath, content, 'utf8');
    console.log('Successfully updated App.jsx with props (LF)');
  } else {
    console.error('Could not find target block in App.jsx');
    process.exit(1);
  }
}
