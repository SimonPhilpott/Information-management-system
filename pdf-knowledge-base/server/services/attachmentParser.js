import AdmZip from 'adm-zip';

/**
 * Parses and extracts text content from base64 document attachments.
 * Supports:
 * - text/plain
 * - application/pdf
 * - application/vnd.openxmlformats-officedocument.presentationml.presentation (PPTX)
 * 
 * @param {object} attachment { name, mimeType, data (base64 string) }
 * @returns {Promise<string>} Extracted text content
 */
export async function parseAttachment(attachment) {
  if (!attachment || !attachment.data) return '';

  const buffer = Buffer.from(attachment.data, 'base64');
  const mimeType = attachment.mimeType;

  // 1. Plain Text File
  if (mimeType === 'text/plain' || attachment.name.endsWith('.txt')) {
    return buffer.toString('utf-8');
  }

  // 2. PowerPoint PPTX Presentation
  if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || attachment.name.endsWith('.pptx')) {
    try {
      const zip = new AdmZip(buffer);
      const zipEntries = zip.getEntries();
      const extractedText = [];

      // Sort slide XML files in numeric order (ppt/slides/slide1.xml, slide2.xml, etc.)
      const slideEntries = zipEntries
        .filter(entry => /^ppt\/slides\/slide\d+\.xml$/.test(entry.entryName))
        .sort((a, b) => {
          const numA = parseInt(a.entryName.match(/\d+/)[0], 10);
          const numB = parseInt(b.entryName.match(/\d+/)[0], 10);
          return numA - numB;
        });

      for (let i = 0; i < slideEntries.length; i++) {
        const slideXml = slideEntries[i].getData().toString('utf-8');
        // Extract all text inside <a:t>...</a:t> tags
        const matches = slideXml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g);
        const slideText = Array.from(matches)
          .map(m => m[1])
          .join(' ')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .trim();

        if (slideText) {
          extractedText.push(`[Slide ${i + 1}]: ${slideText}`);
        }
      }

      return extractedText.join('\n');
    } catch (err) {
      throw new Error(`Failed to parse PowerPoint presentation: ${err.message}`);
    }
  }

  // 3. PDF Document
  if (mimeType === 'application/pdf' || attachment.name.endsWith('.pdf')) {
    try {
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const uint8 = new Uint8Array(buffer);
      const doc = await pdfjsLib.getDocument({ data: uint8, useSystemFonts: true }).promise;
      const extractedPages = [];

      // Extract up to 10 pages maximum for on-the-fly prompt attachments to protect context window size
      const maxPages = Math.min(doc.numPages, 10);

      for (let i = 1; i <= maxPages; i++) {
        const page = await doc.getPage(i);
        const textContent = await page.getTextContent();
        let lastY = null;
        const textParts = [];

        for (const item of textContent.items) {
          if (item.str === undefined) continue;
          if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
            textParts.push('\n');
          }
          textParts.push(item.str);
          if (item.hasEOL) {
            textParts.push('\n');
          }
          lastY = item.transform[5];
        }

        const pageText = textParts.join('').trim();
        if (pageText) {
          extractedPages.push(`[Page ${i}]: ${pageText}`);
        }
      }

      if (doc.numPages > 10) {
        extractedPages.push(`[Truncated: only the first 10 pages of this PDF are attached as prompt context]`);
      }

      await doc.destroy();
      return extractedPages.join('\n');
    } catch (err) {
      throw new Error(`Failed to parse PDF document: ${err.message}`);
    }
  }

  // Fallback / Unsupported types
  return `[Attached file: ${attachment.name} (${mimeType || 'unknown'})]`;
}
