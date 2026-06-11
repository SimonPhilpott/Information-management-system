import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config.js';
import { logUsage } from './usageService.js';

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

/**
 * Embed a single chunk with exponential backoff retry for transient API errors.
 */
async function embedWithRetry(model, chunk, taskType, maxRetries = 4) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.embedContent({
        content: { parts: [{ text: chunk.text }], role: 'user' },
        taskType
      });
      return result.embedding.values;
    } catch (err) {
      const code = err.status || err.code || 0;
      const msg = (err.message || '').toLowerCase();
      const isRetryable =
        code === 503 || code === 429 || code === 500 ||
        msg.includes('service unavailable') ||
        msg.includes('too many requests') ||
        msg.includes('internal server error') ||
        msg.includes('resource_exhausted') ||
        msg.includes('unavailable') ||
        msg.includes('rate limit');

      if (!isRetryable || attempt >= maxRetries) {
        if (attempt >= maxRetries && isRetryable) {
          console.error(`[Embedding] All ${maxRetries + 1} retries exhausted: ${err.message}`);
        }
        throw err;
      }

      // Exponential backoff with jitter: 1s, 2s, 4s, 8s (capped at 30s)
      const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 30000);
      console.warn(`[Embedding] Retry ${attempt + 1}/${maxRetries} in ${Math.round(delay)}ms — ${err.message}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Generate embeddings for an array of text chunks
 * Includes retry logic and rate limiting between batches.
 */
export async function generateEmbeddings(chunks, taskType = 'RETRIEVAL_DOCUMENT') {
  const model = genAI.getGenerativeModel({ model: config.gemini.embeddingModel });
  const embeddings = [];

  // Process in batches to avoid rate limits
  const BATCH_SIZE = 20;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    const promises = batch.map(async (chunk) => {
      return await embedWithRetry(model, chunk, taskType);
    });

    const batchResults = await Promise.allSettled(promises);

    for (let j = 0; j < batch.length; j++) {
      const r = batchResults[j];
      if (r.status === 'fulfilled') {
        embeddings.push({
          ...batch[j],
          embedding: r.value
        });
      } else {
        // Log the chunk-level failure but keep going — don't let a single chunk
        // kill the entire document.
        console.warn(`[Embedding] Chunk ${i + j} embedding failed: ${r.reason?.message || r.reason}`);
      }
    }

    // Log embedding usage (approximate) — only for successful embeddings
    const succeeded = batchResults.filter(r => r.status === 'fulfilled');
    if (succeeded.length > 0) {
      const totalChars = succeeded.reduce((sum, _, idx) => {
        return sum + batch[batchResults.indexOf(succeeded[idx])].text.length;
      }, 0);
      const approxTokens = Math.ceil(totalChars / 4);
      logUsage(config.gemini.embeddingModel, approxTokens, 0, 'embedding');
    }

    // Rate limit pause between batches
    if (i + BATCH_SIZE < chunks.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // If ALL chunks failed, throw so the caller knows the document is unindexable
  if (embeddings.length === 0) {
    throw new Error('All embedding chunks failed after retries');
  }

  return embeddings;
}

/**
 * Generate a single embedding for a query
 */
export async function generateQueryEmbedding(query) {
  const model = genAI.getGenerativeModel({ model: config.gemini.embeddingModel });

  const result = await model.embedContent({
    content: { parts: [{ text: query }], role: 'user' },
    taskType: 'RETRIEVAL_QUERY'
  });

  // Log usage
  const approxTokens = Math.ceil(query.length / 4);
  logUsage(config.gemini.embeddingModel, approxTokens, 0, 'embedding');

  return result.embedding.values;
}
