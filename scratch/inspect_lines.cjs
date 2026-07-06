const fs = require('fs');
const path = require('path');

const adminPanelPath = path.join(__dirname, '../src/components/Admin/AdminPanel.jsx');
const content = fs.readFileSync(adminPanelPath, 'utf8');
const lines = content.split(/\r?\n/);

for (let i = 250; i < 270; i++) {
  console.log(`${i + 1}: ${JSON.stringify(lines[i])}`);
}
