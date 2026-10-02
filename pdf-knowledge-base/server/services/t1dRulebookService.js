import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { getSetting, setSetting } from '../db/database.js';
import config from '../config.js';
import { GoogleGenerativeAI } from './geminiClient.js';
import { extractPdfText } from './pdfService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOKS_DIR = path.join(__dirname, '..', 'data', 't1d_books');

// Ensure books data directory exists
fs.mkdirSync(BOOKS_DIR, { recursive: true });

// Initialise SQLite schemas for T1D rulebook books and AI findings
db.exec(`
  CREATE TABLE IF NOT EXISTS t1d_rulebook_books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT DEFAULT 'pdf',
    file_size INTEGER DEFAULT 0,
    page_count INTEGER DEFAULT 0,
    word_count INTEGER DEFAULT 0,
    extracted_text TEXT,
    summary TEXT,
    status TEXT DEFAULT 'indexed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_scanned_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS t1d_rulebook_findings (
    id TEXT PRIMARY KEY,
    book_id TEXT REFERENCES t1d_rulebook_books(id) ON DELETE CASCADE,
    book_title TEXT,
    type TEXT CHECK(type IN ('conflict', 'addition', 'refinement')),
    section_target TEXT,
    title TEXT NOT NULL,
    current_rule TEXT,
    book_recommendation TEXT,
    citation TEXT,
    explanation TEXT,
    suggested_action TEXT,
    proposed_text TEXT,
    status TEXT CHECK(status IN ('pending', 'accepted', 'dismissed')) DEFAULT 'pending',
    user_action_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_rulebook_findings_book ON t1d_rulebook_findings(book_id);
  CREATE INDEX IF NOT EXISTS idx_rulebook_findings_status ON t1d_rulebook_findings(status);
`);

export const DEFAULT_T1D_RULEBOOK = `# Running with T1D: Comprehensive Glucose Rulebook

## 1. Physiological Foundations & Fuel Metabolism
* **Insulin-Independent vs Insulin-Mediated Glucose Uptake:** During aerobic running (Zone 1/Zone 2, HR <145 bpm), skeletal muscle contraction triggers non-insulin-mediated GLUT4 transporter translocation to sarcolemma membranes, increasing cellular glucose uptake by 1.5x to 10x above baseline.
* **Circulating IOB Sensitivity Amplification:** Exercise dramatically increases microvascular perfusion and muscular blood flow, accelerating active insulin delivery. Circulating Insulin On Board (IOB) acts with 1.5x to 2.0x higher apparent potency while shutting down hepatic glycogenolysis and gluconeogenesis.
* **Aerobic vs Anaerobic / VO2 Max Dynamics:** Sustained aerobic running (Z1-Z2 <145 bpm) drives progressive downward glucose drift. High-intensity anaerobic efforts or VO2 Max efforts (Zone 5, HR >168 bpm, speed intervals, steep gradient climbs) stimulate intense catecholamines (adrenaline, noradrenaline) and cortisol. This provokes acute counter-regulatory hepatic glucose release (unexplained spikes during or immediately post-run) followed by delayed glycogen resynthesis crashes 7-11 hours post-run.

## 2. Pre-Run Decision Matrix & Glycemic Gates
* **Target Starting Glucose:** 7.0 – 10.0 mmol/L (optimal launch target ~9.0 mmol/L with a flat trend arrow).
* **< 4.0 mmol/L (Hypoglycemia Danger):** Do NOT run. Ingest 15–20 g of rapid-acting carbohydrate. Wait 15–20 minutes and re-test. Only set off once glucose reaches >= 5.5 mmol/L with confirmed upward/stable trajectory.
* **4.0 – 4.9 mmol/L (Sub-Optimal Low):** Delay start by 20–30 minutes. Ingest 0.3 g/kg of rapid-acting carbs (approx 18–25 g for typical 60–80 kg runner). Recheck sensor before setting out.
* **5.0 – 6.9 mmol/L (Low Normal):** Consume 10–15 g of rapid-acting carbohydrates 10 minutes prior to departure to buffer against the initial exercise-induced drop.
* **7.0 – 10.0 mmol/L (Optimal Green Zone):** Prime running window. Set out immediately without upfront carbs unless CGM indicates a downward trend.
* **10.1 – 15.0 mmol/L (Elevated Safe):** Safe to start. Withhold corrective bolus before departure; aerobic exercise uptake will naturally lower blood glucose without insulin stack risk.
* **> 15.0 mmol/L (Hyperglycemia & Ketone Check):** Mandatory blood/urine ketone test. If blood ketones >= 1.5 mmol/L, DO NOT exercise (high DKA risk). If ketones < 0.6 mmol/L, proceed with light aerobic running; avoid high intensity.
* **CGM Trend Arrow Adjustments:**
  * Single Down (↓): Consume an additional 10–15 g rapid carbs prior to departure.
  * Double Down (↓↓): Delay departure 15–20 minutes; ingest 20 g fast carbs and await curve stabilization.
  * Single Up (↑) / Double Up (↑↑): Withhold pre-run carbs; reassess at 15–20 minutes into run.

## 3. Active IOB Management & Closed-Loop (AAPS / Loop) Rules
* **90-Minute Pre-Run Exercise Temp Target:** Set an elevated activity/exercise target (8.0–9.0 mmol/L) 60 to 90 minutes before running. This prompts closed-loop algorithms to cut basal rates and enter departure with minimal active insulin.
* **Meal Bolus Reductions:**
  * Run within 60–90 min of meal: Reduce meal bolus by 30% to 50% (ISPAD 2022 guidelines).
  * Run within 90–120 min of meal: Reduce meal bolus by 20% to 30% (Riddell et al. 2017).
* **Starting IOB Safety Cap:** Target starting IOB < 1.0 U. If starting IOB is >= 2.0 U, expect rapid early drops; carry surplus fast-acting carbs and front-load 20–25 g at minute 0.

## 4. In-Run Fueling Strategy & Elevation Adaptation
* **Standard Aerobic Fueling Rate:** 30–60 g carbs per hour (up to 75 g/h during high IOB, sessions exceeding 90 minutes, or challenging terrain), divided into 15–20 g increments every 20–30 minutes.
* **High Heart Rate / VO2 Max Carb Caution:** During high-intensity VO2 Max efforts (>168 bpm), counter-regulatory adrenaline elevates circulating glucose. Do not aggressively stack carbs during catecholamine-driven rises unless CGM confirms a subsequent downward inflection.
* **Terrain & Elevation Stop Placement:** Never consume gels or chews mid-way through a steep uphill climb (risk of GI distress and delayed gastric emptying). Schedule stops 3–5 minutes prior to climbs or on gentle descents and flats.
* **Gut Absorption Ceiling:** Monosaccharide intestinal transport saturates at ~1.0 g/min (~60 g/h) for pure glucose; dual-source (glucose:fructose 2:1) can sustain up to 75–90 g/h if practiced.
* **Hydration Balance:** Drink water with electrolytes every 20–30 minutes. Dehydration decreases subcutaneous microcirculation and distorts CGM accuracy.

## 5. Post-Run Recovery & Late-Onset Nocturnal Hypo Defense
* **Immediate Finish Line Fueling:** If finishing glucose is < 6.0 mmol/L or dropping, immediately take 15–20 g fast carbohydrates. Follow with 15–25 g protein and complex carbs within 30 minutes to facilitate glycogen resynthesis.
* **Extended Sensitivity Window:** Muscle and hepatic glycogen replenishment maintains heightened insulin sensitivity for 12 to 24 hours following endurance running.
* **Overnight Basal Temp Reduction:** Peak nocturnal hypoglycemia risk occurs 7 to 11 hours post-run (common following afternoon or evening runs or sessions with substantial VO2 Max volume). Apply an overnight basal rate reduction of ~20% for 6 hours (or maintain elevated night-time loop target of 6.5–7.0 mmol/L).
`;

const SETTING_KEY = 't1d_running_rulebook';
const UPDATED_AT_KEY = 't1d_running_rulebook_updated_at';

export function getRulebook() {
  const custom = getSetting(SETTING_KEY);
  const updatedAtStr = getSetting(UPDATED_AT_KEY);
  const updatedAt = updatedAtStr ? Number(updatedAtStr) : null;
  return {
    rulebook: custom || DEFAULT_T1D_RULEBOOK,
    updatedAt: updatedAt || (custom ? Date.now() : null),
    isDefault: !custom,
  };
}

export function saveRulebook(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Rulebook text cannot be empty.');
  }
  const now = Date.now();
  setSetting(SETTING_KEY, text.trim());
  setSetting(UPDATED_AT_KEY, String(now));
  return {
    rulebook: text.trim(),
    updatedAt: now,
    isDefault: false,
  };
}

export function resetRulebook() {
  setSetting(SETTING_KEY, '');
  setSetting(UPDATED_AT_KEY, '');
  return {
    rulebook: DEFAULT_T1D_RULEBOOK,
    updatedAt: Date.now(),
    isDefault: true,
  };
}

/**
 * Returns a concise prompt summary of the active rulebook for Gemini activity review.
 */
export function getRulebookPromptContext() {
  const { rulebook } = getRulebook();
  return rulebook.slice(0, 2500);
}

// ---------------------------------------------------------------------------
// BOOK UPLOAD, INDEXING & STORAGE
// ---------------------------------------------------------------------------

export async function uploadBook({ title, filename, dataBase64, textContent = null, fileType = null }) {
  if (!filename) throw new Error('Filename is required.');
  const cleanTitle = (title || filename.replace(/\.[^/.]+$/, '')).trim();
  const id = `book_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const ext = path.extname(filename).toLowerCase().replace('.', '') || 'pdf';
  const resolvedType = fileType || (ext === 'pdf' ? 'pdf' : (ext === 'md' ? 'md' : 'txt'));
  const safeFilename = `${id}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const filePath = path.join(BOOKS_DIR, safeFilename);

  let fileBuffer;
  if (dataBase64) {
    // Strip optional data:mime/type;base64, prefix
    const base64Data = dataBase64.replace(/^data:[^;]+;base64,/, '');
    fileBuffer = Buffer.from(base64Data, 'base64');
  } else if (textContent) {
    fileBuffer = Buffer.from(textContent, 'utf8');
  } else {
    throw new Error('No book content or file data provided.');
  }

  fs.writeFileSync(filePath, fileBuffer);
  const fileSize = fileBuffer.length;

  let pageCount = 1;
  let extractedText = '';

  if (resolvedType === 'pdf') {
    try {
      const pdfData = await extractPdfText(filePath);
      pageCount = pdfData.pageCount || 1;
      extractedText = (pdfData.pages || [])
        .map((p) => `--- Page ${p.pageNum} ---\n${p.text}`)
        .join('\n\n');
    } catch (err) {
      console.warn(`[T1D Book] PDF text extraction failed for ${filename}:`, err.message);
      extractedText = fileBuffer.toString('utf8');
      pageCount = 1;
    }
  } else {
    extractedText = fileBuffer.toString('utf8');
    pageCount = Math.max(1, Math.ceil(extractedText.split(/\s+/).length / 350));
  }

  const wordCount = extractedText ? extractedText.split(/\s+/).filter(Boolean).length : 0;

  db.prepare(`
    INSERT INTO t1d_rulebook_books (
      id, title, filename, file_path, file_type, file_size, page_count, word_count, extracted_text, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'indexed')
  `).run(
    id,
    cleanTitle,
    filename,
    filePath,
    resolvedType,
    fileSize,
    pageCount,
    wordCount,
    extractedText
  );

  return {
    id,
    title: cleanTitle,
    filename,
    file_type: resolvedType,
    file_size: fileSize,
    page_count: pageCount,
    word_count: wordCount,
    status: 'indexed',
    created_at: new Date().toISOString()
  };
}

export function listBooks() {
  return db.prepare(`
    SELECT id, title, filename, file_type, file_size, page_count, word_count, summary, status, created_at, last_scanned_at
    FROM t1d_rulebook_books
    ORDER BY created_at DESC
  `).all();
}

export function getBook(id) {
  return db.prepare(`SELECT * FROM t1d_rulebook_books WHERE id = ?`).get(id);
}

export function deleteBook(id) {
  const book = getBook(id);
  if (!book) return false;

  try {
    if (fs.existsSync(book.file_path)) {
      fs.unlinkSync(book.file_path);
    }
  } catch (err) {
    console.warn(`[T1D Book] Could not delete file ${book.file_path}:`, err.message);
  }

  db.prepare(`DELETE FROM t1d_rulebook_findings WHERE book_id = ?`).run(id);
  const result = db.prepare(`DELETE FROM t1d_rulebook_books WHERE id = ?`).run(id);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// AI BOOK SCANNING & RULEBOOK ENHANCEMENT ENGINE
// ---------------------------------------------------------------------------

export async function scanBooksForRulebookImprovements({ bookId = null } = {}) {
  const { rulebook } = getRulebook();
  let books = [];

  if (bookId) {
    const b = getBook(bookId);
    if (!b) throw new Error('Book not found.');
    books = [b];
  } else {
    books = db.prepare(`SELECT * FROM t1d_rulebook_books WHERE status = 'indexed' ORDER BY created_at DESC`).all();
  }

  if (books.length === 0) {
    throw new Error('No indexed books found. Please upload a book (PDF, TXT, MD) first.');
  }

  const apiKey = config.gemini?.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key is not configured.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = config.gemini?.chatModels?.flash || 'gemini-2.5-flash';
  const model = genAI.getGenerativeModel({ model: modelName });

  const allNewFindings = [];

  for (const book of books) {
    const rawText = book.extracted_text || '';
    if (!rawText.trim()) continue;

    // Truncate to first ~120,000 characters if enormous to fit safely within single prompt window
    const bookSample = rawText.slice(0, 120000);

    const prompt = `You are a Senior Consultant Sports Endocrinologist and Lead Clinical Exercise Physiologist specializing in Type 1 Diabetes and endurance running (Omnipod, AndroidAPS/Loop closed loop, continuous glucose monitoring).

Your task is to conduct an authoritative, rigorous comparative audit between our active "Running with T1D: Comprehensive Glucose Rulebook" and the uploaded clinical book/reference material: "${book.title}".

### ACTIVE RULEBOOK CURRENTLY IN USE:
\`\`\`markdown
${rulebook}
\`\`\`

### EXTRACTED BOOK REFERENCE MATERIAL ("${book.title}"):
\`\`\`text
${bookSample}
\`\`\`

### AUDIT INSTRUCTIONS:
Carefully compare the book's evidence, clinical guidelines, and endurance exercise protocols against our 5 rulebook dimensions:
1. Physiological Foundations & Fuel Metabolism
2. Pre-Run Decision Matrix & Glycemic Gates
3. Active IOB Management & Closed-Loop (AAPS / Loop) Rules
4. In-Run Fueling Strategy & Elevation Adaptation
5. Post-Run Recovery & Late-Onset Nocturnal Hypo Defense

Identify the most impactful findings in these 3 categories:
1. "conflict": The book directly contradicts our rulebook or provides different clinical thresholds (e.g. different starting glucose range, different pre-run carb g/kg dosing, bolus reduction percentages, ketone thresholds, or in-run fueling rates).
   - "current_rule": The exact or summarized rule from our rulebook that is contradicted.
   - "book_recommendation": What this book specifically advises instead.
   - "citation": Page, chapter, study or direct excerpt from the book.
   - "explanation": Why they differ and physiological rationale for considering the book's recommendation.
   - "suggested_action": "replace"
   - "proposed_text": A polished, ready-to-use markdown bullet point to replace the conflicting rule.

2. "addition": Important missing information, clinical guidance, or physiological edge cases covered in the book that our rulebook completely lacks (e.g. interval sprint anaerobic bursts vs steady runs, elevation/altitude effects, heat/cold humidity compensation, dual-wave bolusing, alcohol interaction with nocturnal glycogen replenishment, gut training).
   - "section_target": Which of the 5 sections this should belong to.
   - "title": Short descriptive title of the new protocol.
   - "book_recommendation": Summary of the book's protocol.
   - "citation": Page, chapter or quote.
   - "explanation": Clinical rationale for adding this to our rulebook.
   - "suggested_action": "add"
   - "proposed_text": A complete markdown bullet point formatted as: * **Title:** Complete actionable protocol.

3. "refinement": A specific nuance, practical metric, or clarification from the book that improves an existing rule.
   - "suggested_action": "refine"
   - "proposed_text": The improved markdown bullet point.

### CRITICAL REQUIREMENTS:
- Output MUST be valid, parseable JSON with NO markdown codeblock markers, starting with { and ending with }.
- Provide between 3 and 10 high-quality, actionable findings. Prioritise genuine clinical conflicts and valuable additions.

Expected JSON structure:
{
  "findings": [
    {
      "type": "conflict" | "addition" | "refinement",
      "section_target": "2. Pre-Run Decision Matrix & Glycemic Gates",
      "title": "Short title",
      "current_rule": "Current rule text or null if addition",
      "book_recommendation": "Book guidance",
      "citation": "Chapter 4 / Page 82",
      "explanation": "Detailed clinical reasoning",
      "suggested_action": "replace" | "add" | "refine",
      "proposed_text": "* **Target Starting Glucose:** ..."
    }
  ]
}`;

    try {
      const response = await model.generateContent(prompt);
      let textOut = response.response.text().trim();
      // Remove any json markdown code fences
      textOut = textOut.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

      const parsed = JSON.parse(textOut);
      const findingsList = Array.isArray(parsed?.findings) ? parsed.findings : [];

      const insertStmt = db.prepare(`
        INSERT INTO t1d_rulebook_findings (
          id, book_id, book_title, type, section_target, title, current_rule,
          book_recommendation, citation, explanation, suggested_action, proposed_text, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `);

      for (const item of findingsList) {
        const findingId = `find_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const findingType = ['conflict', 'addition', 'refinement'].includes(item.type) ? item.type : 'addition';
        const sectionTarget = item.section_target || '2. Pre-Run Decision Matrix & Glycemic Gates';
        const itemTitle = item.title || 'Clinical Rulebook Enhancement';
        const currentRule = item.current_rule || (findingType === 'conflict' ? 'Current protocol' : null);
        const bookRec = item.book_recommendation || item.proposed_text || '';
        const citation = item.citation || `${book.title}`;
        const explanation = item.explanation || '';
        const suggestedAction = item.suggested_action || (findingType === 'conflict' ? 'replace' : 'add');
        const proposedText = item.proposed_text || `* **${itemTitle}:** ${bookRec}`;

        insertStmt.run(
          findingId,
          book.id,
          book.title,
          findingType,
          sectionTarget,
          itemTitle,
          currentRule,
          bookRec,
          citation,
          explanation,
          suggestedAction,
          proposedText
        );

        allNewFindings.push({
          id: findingId,
          book_id: book.id,
          book_title: book.title,
          type: findingType,
          section_target: sectionTarget,
          title: itemTitle,
          current_rule: currentRule,
          book_recommendation: bookRec,
          citation,
          explanation,
          suggested_action: suggestedAction,
          proposed_text: proposedText,
          status: 'pending'
        });
      }

      db.prepare(`UPDATE t1d_rulebook_books SET last_scanned_at = CURRENT_TIMESTAMP WHERE id = ?`).run(book.id);
    } catch (err) {
      console.error(`[T1D Book Scan] Error analyzing book ${book.title}:`, err);
    }
  }

  return {
    scanned_books_count: books.length,
    new_findings_count: allNewFindings.length,
    findings: allNewFindings
  };
}

export function listFindings({ status = null, bookId = null, type = null } = {}) {
  let query = 'SELECT * FROM t1d_rulebook_findings WHERE 1=1';
  const params = [];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  if (bookId) {
    query += ' AND book_id = ?';
    params.push(bookId);
  }
  if (type) {
    query += ' AND type = ?';
    params.push(type);
  }

  query += ' ORDER BY created_at DESC';
  return db.prepare(query).all(...params);
}

// ---------------------------------------------------------------------------
// ARBITRATION & FINDING RESOLUTION (USER DECISION CONTROL)
// ---------------------------------------------------------------------------

export function resolveFinding(findingId, { action, customText = null }) {
  if (!['replace', 'add', 'dismiss'].includes(action)) {
    throw new Error(`Invalid arbitration action "${action}". Must be 'replace', 'add', or 'dismiss'.`);
  }

  const finding = db.prepare('SELECT * FROM t1d_rulebook_findings WHERE id = ?').get(findingId);
  if (!finding) {
    throw new Error('Finding not found.');
  }

  const nowIso = new Date().toISOString();

  if (action === 'dismiss') {
    db.prepare('UPDATE t1d_rulebook_findings SET status = ?, user_action_at = ? WHERE id = ?')
      .run('dismissed', nowIso, findingId);
    return {
      success: true,
      action: 'dismissed',
      findingId,
      status: 'dismissed',
      message: 'Finding ignored. The rulebook remains unchanged.'
    };
  }

  let { rulebook } = getRulebook();
  const textToApply = (customText || finding.proposed_text || '').trim();
  if (!textToApply) {
    throw new Error('Proposed text cannot be empty.');
  }

  // Ensure bullet prefix
  const formattedBullet = textToApply.startsWith('*') || textToApply.startsWith('-')
    ? textToApply
    : `* **${finding.title}:** ${textToApply}`;

  if (action === 'replace') {
    let replaced = false;

    // 1. Try exact match of current_rule if present
    if (finding.current_rule && rulebook.includes(finding.current_rule.trim())) {
      rulebook = rulebook.replace(finding.current_rule.trim(), formattedBullet);
      replaced = true;
    }

    // 2. Try matching the title keyword in a bullet within the target section
    if (!replaced) {
      const sectionKeywords = (finding.section_target || '').replace(/^[0-9.]+\s*/, '').toLowerCase().trim();
      const lines = rulebook.split('\n');
      let targetSectionIndex = -1;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('## ') && (
          (sectionKeywords && lines[i].toLowerCase().includes(sectionKeywords)) ||
          lines[i].includes(finding.section_target)
        )) {
          targetSectionIndex = i;
          break;
        }
      }

      if (targetSectionIndex !== -1) {
        // Look for matching bullet under this section
        const titleKey = finding.title.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter((w) => w.length > 3)[0];
        let matchedLine = -1;

        for (let j = targetSectionIndex + 1; j < lines.length; j++) {
          if (lines[j].startsWith('## ')) break; // Hit next section
          if (titleKey && lines[j].toLowerCase().includes(titleKey)) {
            matchedLine = j;
            break;
          }
        }

        if (matchedLine !== -1) {
          lines[matchedLine] = formattedBullet;
          rulebook = lines.join('\n');
          replaced = true;
        } else {
          // If no specific bullet matched, insert at the top of the target section
          lines.splice(targetSectionIndex + 1, 0, formattedBullet);
          rulebook = lines.join('\n');
          replaced = true;
        }
      }
    }

    // 3. Fallback: append formatted bullet at the end of the rulebook
    if (!replaced) {
      rulebook += `\n\n${formattedBullet}`;
    }

    saveRulebook(rulebook);
    db.prepare('UPDATE t1d_rulebook_findings SET status = ?, user_action_at = ? WHERE id = ?')
      .run('accepted', nowIso, findingId);

    return {
      success: true,
      action: 'replaced',
      findingId,
      status: 'accepted',
      rulebook,
      message: 'Conflicting rule replaced with book recommendation.'
    };
  }

  if (action === 'add') {
    const lines = rulebook.split('\n');
    let inserted = false;

    // Locate the target section heading
    const sectionKeywords = (finding.section_target || '').replace(/^[0-9.]+\s*/, '').toLowerCase().trim();
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('## ') && (
        (sectionKeywords && lines[i].toLowerCase().includes(sectionKeywords)) ||
        lines[i].includes(finding.section_target)
      )) {
        // Find end of section (before next ## or end of file)
        let insertPos = lines.length;
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].startsWith('## ')) {
            insertPos = j;
            break;
          }
        }
        lines.splice(insertPos, 0, formattedBullet);
        rulebook = lines.join('\n');
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      rulebook += `\n\n${formattedBullet}`;
    }

    saveRulebook(rulebook);
    db.prepare('UPDATE t1d_rulebook_findings SET status = ?, user_action_at = ? WHERE id = ?')
      .run('accepted', nowIso, findingId);

    return {
      success: true,
      action: 'added',
      findingId,
      status: 'accepted',
      rulebook,
      message: 'New clinical protocol added to rulebook.'
    };
  }
}

// ---------------------------------------------------------------------------
// DIRECT RESEARCH TEXT AUDIT & ARBITRATION (PASTE & REVIEW)
// ---------------------------------------------------------------------------

export async function reviewResearchText({ title = '', source = '', textContent = '', saveAsBook = true } = {}) {
  const cleanText = String(textContent || '').trim();
  if (!cleanText || cleanText.length < 20) {
    throw new Error('Research text must be at least 20 characters in length.');
  }

  const effectiveTitle = String(title || '').trim() || `Research Note (${new Date().toLocaleDateString('en-GB')})`;
  const effectiveSource = String(source || '').trim() || 'Pasted Research Excerpt';

  let savedBook = null;

  if (saveAsBook) {
    const bookId = `book_res_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const filename = `research_${Date.now()}.txt`;
    const filePath = path.join(BOOKS_DIR, filename);

    // Persist file content to disk
    fs.writeFileSync(filePath, cleanText, 'utf-8');

    const stats = fs.statSync(filePath);
    const wordCount = cleanText.split(/\s+/).filter(Boolean).length;
    const pageCount = Math.max(1, Math.ceil(cleanText.length / 3000));
    const summary = `Pasted research excerpt: ${effectiveTitle}${effectiveSource ? ` (${effectiveSource})` : ''}. ${cleanText.slice(0, 180)}...`;

    db.prepare(`
      INSERT INTO t1d_rulebook_books (
        id, title, filename, file_path, file_type, file_size, page_count, word_count,
        extracted_text, summary, status, last_scanned_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'indexed', CURRENT_TIMESTAMP)
    `).run(
      bookId,
      effectiveTitle,
      filename,
      filePath,
      'research',
      stats.size,
      pageCount,
      wordCount,
      cleanText,
      summary
    );

    savedBook = {
      id: bookId,
      title: effectiveTitle,
      filename,
      file_path: filePath,
      file_type: 'research',
      file_size: stats.size,
      page_count: pageCount,
      word_count: wordCount,
      summary,
      status: 'indexed'
    };
  }

  const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment or settings.');
  }

  const { rulebook } = getRulebook();
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = config.gemini?.chatModels?.flash || 'gemini-2.5-flash';
  const model = genAI.getGenerativeModel({ model: modelName });

  const researchSnippet = cleanText.slice(0, 100000);

  const prompt = `You are a Senior Consultant Sports Endocrinologist and Lead Clinical Exercise Physiologist specializing in Type 1 Diabetes, endurance running, automated insulin delivery (AAPS/Loop/Omnipod 5), and continuous glucose monitoring.

Your task is to conduct an authoritative, rigorous comparative audit between our active "Running with T1D: Comprehensive Glucose Rulebook" and recently pasted clinical research, trial data, or sports science literature.

### ACTIVE RULEBOOK CURRENTLY IN USE:
\`\`\`markdown
${rulebook}
\`\`\`

### PASTED RESEARCH MATERIAL:
Title: "${effectiveTitle}"
Source / Citation: "${effectiveSource}"
\`\`\`text
${researchSnippet}
\`\`\`

### AUDIT INSTRUCTIONS:
Carefully cross-examine the pasted research against what is currently documented across the rulebook sections:
1. Physiological Foundations & Fuel Metabolism
2. Pre-Run Decision Matrix & Glycemic Gates
3. Active IOB Management & Closed-Loop (AAPS / Loop) Rules
4. In-Run Fueling Strategy & Elevation Adaptation
5. Post-Run Recovery & Late-Onset Nocturnal Hypo Defense

Identify the most impactful findings in these 3 categories:
1. "conflict": The research directly contradicts our rulebook or specifies differing clinical thresholds (e.g., target glucose windows, pre-run carb dosing per kg, basal suspension timing, ketone cutoffs, in-run carb oxidation ceilings, nocturnal basal reduction).
   - "current_rule": The exact or summarized rule from our rulebook that is contradicted.
   - "book_recommendation": What this research specifically proves or advises instead.
   - "citation": Specific study name, paper author, trial, or page/paragraph from the research.
   - "explanation": Detailed physiological rationale for the discrepancy and why the user should evaluate replacing their existing rule.
   - "suggested_action": "replace"
   - "proposed_text": A clean, authoritative markdown bullet point formatted as: "* **Target Name:** Exact recommended text" to replace the conflicting rule.

2. "addition": High-value clinical guidance, practical sports management protocols, or physiological edge cases in this research that are completely MISSING from our rulebook (e.g., anaerobic sprint bursts before aerobic runs to blunt drops, altitude/hypoxia glycogen utilization rates, ambient temperature/humidity corrections, dual-source carbs vs glucose alone, late-onset nocturnal hypo defense).
   - "section_target": Which of the 5 sections this should belong to.
   - "title": Short descriptive title of the new protocol.
   - "book_recommendation": Summary of the protocol from the research.
   - "citation": Specific citation from the research.
   - "explanation": Why this fills an essential clinical gap for an endurance runner with T1D.
   - "suggested_action": "add"
   - "proposed_text": A complete, ready-to-insert markdown bullet point formatted as: "* **Protocol Name:** Exact protocol instructions"

3. "refinement": Guidance that aligns with our current rules but provides more accurate precision, specific ratios, or actionable execution steps.
   - "suggested_action": "replace" or "add"
   - "proposed_text": Formatted markdown bullet point.

CRITICAL: Return ONLY valid, parseable JSON without code fences or surrounding text. Schema:
{
  "summary": "Brief 1-2 sentence executive assessment of how this research compares to our rulebook.",
  "findings": [
    {
      "type": "conflict" | "addition" | "refinement",
      "section_target": "Exact section title from rulebook (e.g., '2. Pre-Run Decision Matrix & Glycemic Gates')",
      "title": "Clear concise finding title",
      "current_rule": "Current rule text from rulebook or null if addition",
      "book_recommendation": "Research guidance",
      "citation": "${effectiveSource}",
      "explanation": "Detailed physiological reasoning",
      "suggested_action": "replace" | "add",
      "proposed_text": "* **Finding Title:** Full bullet markdown"
    }
  ]
}`;

  const response = await model.generateContent(prompt);
  let textOut = response.response.text().trim();
  textOut = textOut.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed = {};
  try {
    parsed = JSON.parse(textOut);
  } catch (parseErr) {
    console.error('[T1D Research Review] JSON parse error:', parseErr, textOut);
    throw new Error('Failed to parse AI comparative audit response. Please try again.');
  }

  const findingsList = Array.isArray(parsed?.findings) ? parsed.findings : [];
  const createdFindings = [];

  const insertStmt = db.prepare(`
    INSERT INTO t1d_rulebook_findings (
      id, book_id, book_title, type, section_target, title, current_rule,
      book_recommendation, citation, explanation, suggested_action, proposed_text, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `);

  for (const item of findingsList) {
    const findingId = `find_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const findingType = ['conflict', 'addition', 'refinement'].includes(item.type) ? item.type : 'addition';
    const sectionTarget = item.section_target || '2. Pre-Run Decision Matrix & Glycemic Gates';
    const itemTitle = item.title || 'Clinical Research Enhancement';
    const currentRule = item.current_rule || (findingType === 'conflict' ? 'Current protocol' : null);
    const bookRec = item.book_recommendation || item.proposed_text || '';
    const citation = item.citation || effectiveSource;
    const explanation = item.explanation || '';
    const suggestedAction = item.suggested_action || (findingType === 'conflict' ? 'replace' : 'add');
    const proposedText = item.proposed_text || `* **${itemTitle}:** ${bookRec}`;

    insertStmt.run(
      findingId,
      savedBook ? savedBook.id : null,
      effectiveTitle,
      findingType,
      sectionTarget,
      itemTitle,
      currentRule,
      bookRec,
      citation,
      explanation,
      suggestedAction,
      proposedText
    );

    createdFindings.push({
      id: findingId,
      book_id: savedBook ? savedBook.id : null,
      book_title: effectiveTitle,
      type: findingType,
      section_target: sectionTarget,
      title: itemTitle,
      current_rule: currentRule,
      book_recommendation: bookRec,
      citation,
      explanation,
      suggested_action: suggestedAction,
      proposed_text: proposedText,
      status: 'pending'
    });
  }

  return {
    success: true,
    saved_book: savedBook,
    new_findings_count: createdFindings.length,
    findings: createdFindings,
    summary: parsed?.summary || `Cross-examination complete against Running with T1D Rulebook: ${createdFindings.length} findings recorded for arbitration.`
  };
}

