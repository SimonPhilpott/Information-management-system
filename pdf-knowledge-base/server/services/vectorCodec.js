// Compact storage for library embeddings (Phase 4, Dev Idea #51).
//
// Embeddings used to be written as JSON number arrays - about 13 characters per dimension, so a
// 3072-dimension passage took ~39 KB on disk and ~25 KB as a JS array in memory. Now each one is
// int8 scalar-quantised: one signed byte per dimension plus one scale (largest |value| / 127),
// stored as base64 (`q` + `qs`) - ~4 KB on disk, and decoded to a Float32Array (12 KB) in memory.
// Gemini embeddings are unit-length, so the rounding error is tiny: cosine similarity to the
// original is > 0.999 and search results are effectively unchanged (checked when converting).
//
// Readers accept both forms, so an old float file still works; every write uses the compact form.
import fs from 'fs';

export function encodeEmbedding(values) {
  let max = 0;
  for (let i = 0; i < values.length; i++) { const a = Math.abs(values[i]); if (a > max) max = a; }
  const scale = max > 0 ? max / 127 : 1;
  const q = new Int8Array(values.length);
  for (let i = 0; i < values.length; i++) q[i] = Math.max(-127, Math.min(127, Math.round(values[i] / scale)));
  return { q: Buffer.from(q.buffer, q.byteOffset, q.byteLength).toString('base64'), qs: scale };
}

export function decodeEmbedding(q, qs) {
  const b = Buffer.from(q, 'base64');
  const out = new Float32Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = (b[i] > 127 ? b[i] - 256 : b[i]) * qs;
  return out;
}

// In place: compact chunks -> chunks with an `embedding` (Float32Array) like the old format.
export function unpackChunks(chunks) {
  if (!Array.isArray(chunks)) return [];
  for (const c of chunks) {
    if (c && typeof c.q === 'string') {
      c.embedding = decodeEmbedding(c.q, c.qs);
      delete c.q;
      delete c.qs;
    }
  }
  return chunks;
}

// Copies for writing: every embedding (array or Float32Array) in the compact form.
export function packChunks(chunks) {
  return chunks.map((c) => {
    if (!c || c.embedding == null) return c;
    const { embedding, ...rest } = c;
    return { ...rest, ...encodeEmbedding(embedding) };
  });
}

export const isPacked = (chunks) => Array.isArray(chunks) && chunks.length > 0 && typeof chunks[0].q === 'string';

export async function readVectorFile(filePath) {
  return unpackChunks(JSON.parse(await fs.promises.readFile(filePath, 'utf-8')));
}

export function readVectorFileSync(filePath) {
  return unpackChunks(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
}

// Written to a temp file then renamed, so a crash mid-write never leaves half a file.
export function writeVectorFile(filePath, chunks) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(packChunks(chunks)));
  fs.renameSync(tmp, filePath);
}

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
