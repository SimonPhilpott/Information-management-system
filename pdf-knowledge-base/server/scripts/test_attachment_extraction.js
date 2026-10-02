import { parseAttachment } from './services/attachmentParser.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runTests() {
  console.log('=== STARTING ATTACHMENT EXTRACTION TDD TESTS ===');

  // Test 1: Plain Text file parsing
  try {
    console.log('\n[Test 1] Plain text parsing...');
    const txtContent = "Hello from the attached text file. This should be successfully extracted.";
    const base64Txt = Buffer.from(txtContent, 'utf-8').toString('base64');
    
    const result = await parseAttachment({
      name: 'test.txt',
      mimeType: 'text/plain',
      data: base64Txt
    });

    if (result !== txtContent) {
      throw new Error(`Expected "${txtContent}", got "${result}"`);
    }
    console.log('✅ Test 1 Passed.');
  } catch (e) {
    console.error('❌ Test 1 Failed:', e.message);
    process.exit(1);
  }

  // Test 2: PPTX parsing using a mock zip buffer containing slide1.xml
  try {
    console.log('\n[Test 2] PPTX extraction from slides zip...');
    const { default: AdmZip } = await import('adm-zip');
    const zip = new AdmZip();
    const slide1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <p:cSld>
          <p:spTree>
            <p:sp>
              <p:txBody>
                <a:p>
                  <a:r>
                    <a:t>PowerPoint slide text content is here.</a:t>
                  </a:r>
                </a:p>
              </p:txBody>
            </p:sp>
          </p:spTree>
        </p:cSld>
      </p:sld>`;
    zip.addFile('ppt/slides/slide1.xml', Buffer.from(slide1Xml, 'utf8'));
    const zipBuffer = zip.toBuffer();
    const base64Pptx = zipBuffer.toString('base64');

    const result = await parseAttachment({
      name: 'test.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      data: base64Pptx
    });

    const expected = '[Slide 1]: PowerPoint slide text content is here.';
    if (!result.includes(expected)) {
      throw new Error(`Expected content to contain "${expected}", got "${result}"`);
    }
    console.log('✅ Test 2 Passed.');
  } catch (e) {
    console.error('❌ Test 2 Failed:', e.message);
    process.exit(1);
  }

  // Test 3: Real PDF parsing using NAVXML.pdf
  try {
    console.log('\n[Test 3] PDF extraction from real PDF file (NAVXML.pdf)...');
    const pdfPath = path.resolve(__dirname, '../../NAVXML.pdf');
    if (fs.existsSync(pdfPath)) {
      // Read NAVXML.pdf
      const pdfBuffer = fs.readFileSync(pdfPath);
      const base64Pdf = pdfBuffer.toString('base64');

      const result = await parseAttachment({
        name: 'NAVXML.pdf',
        mimeType: 'application/pdf',
        data: base64Pdf
      });

      if (!result || result.trim().length === 0) {
        throw new Error('PDF extraction returned empty result');
      }

      console.log('✅ Test 3 Passed. PDF extracted content starts with:\n', result.substring(0, 150) + '...');
    } else {
      console.log('⚠️ Test 3 Skipped: NAVXML.pdf not found in workspace root.');
    }
  } catch (e) {
    console.error('❌ Test 3 Failed:', e.message);
    process.exit(1);
  }

  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY ===');
}

runTests();
