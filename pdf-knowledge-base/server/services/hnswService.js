import hnswPkg from "hnswlib-node";
const { HierarchicalNSW } = hnswPkg;
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { unpackChunks } from "./vectorCodec.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const VECTORS_DIR = path.join(DATA_DIR, "vectors");
const INDEX_PATH = path.join(DATA_DIR, "hnsw_index.bin");
const META_PATH = path.join(DATA_DIR, "hnsw_meta.json");

const DEFAULT_DIMENSION = 768;

let _index = null;
let _metadata = [];
let _dimension = DEFAULT_DIMENSION;
let _isBuilt = false;
let _lastBuilt = null;
let _totalVectors = 0;

export function getHnswStatus() {
  return {
    isBuilt: _isBuilt,
    totalVectors: _totalVectors,
    lastBuilt: _lastBuilt,
    indexExists: fs.existsSync(INDEX_PATH) && fs.existsSync(META_PATH)
  };
}

export async function loadHnswFromDisk() {
  if (!fs.existsSync(INDEX_PATH) || !fs.existsSync(META_PATH)) {
    console.log("[HNSW] No existing index found on disk — run a build to create one.");
    return false;
  }
  try {
    console.log("[HNSW] Loading index from disk...");
    const metaRaw = await fs.promises.readFile(META_PATH, "utf-8");
    const meta = JSON.parse(metaRaw);
    _dimension = meta.dimension || DEFAULT_DIMENSION;
    _metadata = meta.chunks;
    _totalVectors = _metadata.length;
    _lastBuilt = meta.builtAt;
    const idx = new HierarchicalNSW("cosine", _dimension);
    idx.readIndexSync(INDEX_PATH);
    _index = idx;
    _isBuilt = true;
    console.log("[HNSW] Index loaded: " + _totalVectors.toLocaleString() + " vectors, dim=" + _dimension);
    return true;
  } catch (err) {
    console.error("[HNSW] Failed to load index from disk:", err.message);
    _isBuilt = false;
    _index = null;
    return false;
  }
}

export async function buildIndex(onProgress = () => {}) {
  try {
    if (!fs.existsSync(VECTORS_DIR)) throw new Error("Vectors directory does not exist. Index at least one book first.");
    const jsonFiles = fs.readdirSync(VECTORS_DIR).filter(f => f.endsWith(".json"));
    if (jsonFiles.length === 0) throw new Error("No vector files found. Index at least one book first.");

    onProgress({ phase: "counting", progress: 0, total: jsonFiles.length, message: "Counting vectors..." });
    let totalChunks = 0;
    let detectedDimension = DEFAULT_DIMENSION;

    for (let i = 0; i < jsonFiles.length; i++) {
      const filePath = path.join(VECTORS_DIR, jsonFiles[i]);
      const raw = await fs.promises.readFile(filePath, "utf-8");
      const chunks = unpackChunks(JSON.parse(raw));
      totalChunks += chunks.length;
      if (detectedDimension === DEFAULT_DIMENSION && chunks.length > 0 && chunks[0].embedding) {
        detectedDimension = chunks[0].embedding.length;
      }
      onProgress({ phase: "counting", file: jsonFiles[i], progress: i + 1, total: jsonFiles.length, vectors: totalChunks, message: "Scanned " + jsonFiles[i] });
      await new Promise(resolve => setImmediate(resolve));
    }

    onProgress({ phase: "counting_done", progress: jsonFiles.length, total: jsonFiles.length, vectors: totalChunks, message: "Found " + totalChunks.toLocaleString() + " vectors across " + jsonFiles.length + " subject files" });

    _dimension = detectedDimension;
    const newIndex = new HierarchicalNSW("cosine", _dimension);
    newIndex.initIndex(Math.ceil(totalChunks * 1.1), 16, 200, 100);

    const newMetadata = [];
    let insertedCount = 0;

    for (let fileIdx = 0; fileIdx < jsonFiles.length; fileIdx++) {
      const filePath = path.join(VECTORS_DIR, jsonFiles[fileIdx]);
      const raw = await fs.promises.readFile(filePath, "utf-8");
      const chunks = unpackChunks(JSON.parse(raw));

      for (const chunk of chunks) {
        if (!chunk.embedding || chunk.embedding.length !== _dimension) continue;
        newIndex.addPoint(Array.from(chunk.embedding), insertedCount);
        newMetadata.push({
          documentId: chunk.documentId,
          driveFileId: chunk.driveFileId,
          filename: chunk.filename,
          subject: chunk.subject,
          pageNum: chunk.pageNum,
          chunkIndex: chunk.chunkIndex,
          text: chunk.text,
          hasImages: chunk.hasImages ?? false
        });
        insertedCount++;

        if (insertedCount % 500 === 0 || insertedCount === totalChunks) {
          onProgress({ phase: "building", file: jsonFiles[fileIdx], progress: insertedCount, total: totalChunks, message: "Indexed " + insertedCount.toLocaleString() + " / " + totalChunks.toLocaleString() + " vectors" });
          await new Promise(resolve => setImmediate(resolve));
        }
      }
    }

    onProgress({ phase: "saving", progress: insertedCount, total: totalChunks, message: "Saving index to disk..." });
    newIndex.writeIndexSync(INDEX_PATH);
    const metaPayload = { builtAt: new Date().toISOString(), dimension: _dimension, totalVectors: insertedCount, chunks: newMetadata };
    await fs.promises.writeFile(META_PATH, JSON.stringify(metaPayload));

    _index = newIndex;
    _metadata = newMetadata;
    _totalVectors = insertedCount;
    _lastBuilt = metaPayload.builtAt;
    _isBuilt = true;

    onProgress({ phase: "complete", progress: insertedCount, total: totalChunks, vectors: insertedCount, message: "HNSW index built with " + insertedCount.toLocaleString() + " vectors" });
    console.log("[HNSW] Index built: " + insertedCount.toLocaleString() + " vectors, dim=" + _dimension);
    return { success: true, totalVectors: insertedCount };
  } catch (err) {
    console.error("[HNSW] Build failed:", err.message);
    onProgress({ phase: "error", progress: 0, total: 0, message: err.message });
    throw err;
  }
}

// ---- incremental updates (Phase 4): one document in or out, no full rebuild ----
// Labels are positions in _metadata; a document's old passages are marked deleted (their metadata
// slot set to null) and its new ones appended. Saved to disk a few seconds after the last change.
let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      if (!_index) return;
      _index.writeIndexSync(INDEX_PATH);
      fs.writeFileSync(META_PATH, JSON.stringify({ builtAt: _lastBuilt, updatedAt: new Date().toISOString(), dimension: _dimension, totalVectors: _totalVectors, chunks: _metadata }));
      console.log("[HNSW] Incremental changes saved (" + _totalVectors.toLocaleString() + " live vectors)");
    } catch (err) {
      console.error("[HNSW] Could not save incremental changes:", err.message);
    }
  }, 5000);
}

function ensureLoaded() {
  if (_isBuilt && _index) return true;
  if (!fs.existsSync(INDEX_PATH) || !fs.existsSync(META_PATH)) return false;
  try {
    const meta = JSON.parse(fs.readFileSync(META_PATH, "utf-8"));
    _dimension = meta.dimension || DEFAULT_DIMENSION;
    _metadata = meta.chunks;
    _totalVectors = _metadata.filter(Boolean).length;
    _lastBuilt = meta.builtAt;
    const idx = new HierarchicalNSW("cosine", _dimension);
    idx.readIndexSync(INDEX_PATH);
    _index = idx;
    _isBuilt = true;
    return true;
  } catch (err) {
    console.error("[HNSW] Could not load index for an incremental update:", err.message);
    return false;
  }
}

export function removeFromIndex(driveFileId) {
  if (!ensureLoaded()) return 0;
  let removed = 0;
  for (let label = 0; label < _metadata.length; label++) {
    if (_metadata[label]?.driveFileId === driveFileId) {
      try { _index.markDelete(label); } catch { /* already deleted */ }
      _metadata[label] = null;
      removed++;
    }
  }
  if (removed) { _totalVectors -= removed; scheduleSave(); }
  return removed;
}

export function indexDocumentIncremental(driveFileId, chunks = []) {
  // No index yet: nothing to update - searches use the linear scan until one is built.
  if (!ensureLoaded()) return { updated: false, reason: "no index built yet" };
  const started = Date.now();
  removeFromIndex(driveFileId);
  const usable = chunks.filter((c) => c.embedding && c.embedding.length === _dimension);
  const needed = _metadata.length + usable.length;
  if (needed > _index.getMaxElements()) _index.resizeIndex(Math.ceil(needed * 1.2));
  for (const chunk of usable) {
    const label = _metadata.length;
    _index.addPoint(Array.from(chunk.embedding), label);
    _metadata.push({
      documentId: chunk.documentId, driveFileId: chunk.driveFileId, filename: chunk.filename, subject: chunk.subject,
      pageNum: chunk.pageNum, chunkIndex: chunk.chunkIndex, text: chunk.text, hasImages: chunk.hasImages ?? false
    });
  }
  _totalVectors += usable.length;
  scheduleSave();
  console.log("[HNSW] Added " + usable.length + " passages for " + driveFileId + " in " + (Date.now() - started) + " ms (no rebuild)");
  return { updated: true, added: usable.length, ms: Date.now() - started };
}

export function renameSubjectInIndex(driveFileId, subject) {
  if (!ensureLoaded()) return;
  let n = 0;
  for (const m of _metadata) if (m?.driveFileId === driveFileId) { m.subject = subject; n++; }
  if (n) scheduleSave();
}

export function invalidateIndex() {
  _isBuilt = false;
  _index = null;
  _metadata = [];
  _totalVectors = 0;
  try {
    if (fs.existsSync(INDEX_PATH)) fs.unlinkSync(INDEX_PATH);
    if (fs.existsSync(META_PATH)) fs.unlinkSync(META_PATH);
    console.log("[HNSW] Index invalidated — rebuild required.");
  } catch (err) {
    console.warn("[HNSW] Could not remove old index files:", err.message);
  }
}

function isEntertainmentSubject(subject = "", filename = "") {
  const entertainmentRegex = /\b(rpg|roleplaying|role-playing|role playing|boardgame|board game|gaming|tabletop|hobby|fantasy|dungeon|dragon|quest|campaign|rulebook|playbook|adventure|scenario|starter set|wargame|miniature|games|wargaming|character|dice|encounter|bestiary|grimoire|warband|bushido|campfire|dead world|parsec|borderland|no quarter|starship|gang warfare|salvage crew|cyberpunk|osr|pbt|d20|fate core|savage worlds|cthulhu|pathfinder|warhammer|d&d|dungeons)\w*/i;
  return entertainmentRegex.test(subject) || entertainmentRegex.test(filename);
}

export function searchHnsw(queryEmbedding, topK = 8, allowedDriveFileIds = null, showPersonal = false) {
  if (!_isBuilt || !_index) {
    if (fs.existsSync(INDEX_PATH) && fs.existsSync(META_PATH)) {
      try {
        const metaRaw = fs.readFileSync(META_PATH, "utf-8");
        const meta = JSON.parse(metaRaw);
        _dimension = meta.dimension || DEFAULT_DIMENSION;
        _metadata = meta.chunks;
        _totalVectors = _metadata.filter(Boolean).length;
        _lastBuilt = meta.builtAt;
        const idx = new HierarchicalNSW("cosine", _dimension);
        idx.readIndexSync(INDEX_PATH);
        _index = idx;
        _isBuilt = true;
      } catch (e) {
        console.error("[HNSW] Auto-load error:", e);
        return null;
      }
    } else {
      return null;
    }
  }
  try {
    const fetchK = allowedDriveFileIds
      ? Math.min(Math.max(topK * 50, 500), _totalVectors)
      : Math.min(Math.max(topK * 5, 50), _totalVectors);

    // Widen the search beam so the greedy graph walk explores more candidates.
    // ef defaults to the same value as K (very narrow). Setting it to at least
    // efConstruction (200) significantly improves recall with no index rebuild.
    _index.setEf(Math.max(200, fetchK));

    const { neighbors, distances } = _index.searchKnn(queryEmbedding, fetchK);
    const results = [];
    for (let i = 0; i < neighbors.length; i++) {
      const label = neighbors[i];
      const meta = _metadata[label];
      if (!meta) continue;
      if (allowedDriveFileIds && !allowedDriveFileIds.has(meta.driveFileId)) continue;
      if (!showPersonal && isEntertainmentSubject(meta.subject, meta.filename)) continue;
      results.push({ ...meta, similarity: 1 - distances[i] });
      if (results.length >= topK) break;
    }
    return results;
  } catch (err) {
    console.error("[HNSW] Search error:", err.message);
    return null;
  }
}
