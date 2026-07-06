const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/KnowledgeMesh/SunburstCanvas.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize CRLF to LF for matching
const contentLF = content.replace(/\r\n/g, '\n');

const target = `              // Line height proportional to font size (1.25\u00d7 leading)
              const LINE_H     = fontSize * 1.25;

              // Chars per line: how many characters fit ALONG the arc (tangential)
              // ~0.55\u00d7 width ratio for the font at this size
              const charsPerLine = Math.max(4, Math.floor(arcLen / (fontSize * 0.56)));

              // Max lines: how many lines fit inside the RADIAL ring width
              // Use 80% of ringWidth to leave visual padding top and bottom
              const maxLines = Math.max(1, Math.floor((ringWidth * 0.80) / LINE_H));`;

const replacement = `              // Font size scales with arc length (short slices get smaller text), capped at 7.5px
              const fontSize = Math.max(5.5, Math.min(7.5, arcLen / 2.2));
              // Line height: 1.25x leading, proportional to font size
              const LINE_H   = fontSize * 1.25;

              // Each line runs RADIALLY — character capacity is determined by ringWidth (the radial depth)
              const charsPerLine = Math.max(5, Math.floor(ringWidth / (fontSize * 0.56)));

              // Lines stack TANGENTIALLY — cap by how many fit in 80% of the arc length
              const maxLines = Math.max(1, Math.floor((arcLen * 0.80) / LINE_H));`;

if (!contentLF.includes(target.replace(/\r\n/g, '\n'))) {
  console.error('Target not found');
  process.exit(1);
}

const updated = contentLF.replace(target.replace(/\r\n/g, '\n'), replacement);
// Restore CRLF
fs.writeFileSync(filePath, updated.replace(/\n/g, '\r\n'), 'utf8');
console.log('Successfully fixed fontSize declaration order and charsPerLine geometry.');
