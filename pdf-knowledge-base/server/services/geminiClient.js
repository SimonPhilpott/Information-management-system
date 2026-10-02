// The one Gemini client for IMS (Phase 4, Dev Idea #47): Google's current @google/genai SDK behind
// the small surface the rest of the server was written against with the retired
// @google/generative-ai package - getGenerativeModel() -> generateContent() / embedContent(),
// with `result.response.text()` - so every service moved over by changing one import.
//
// On every call it also:
//  - asks the model registry which model to use (the Model Switcher's choice for the calling
//    service, else what the code asked for), so a switch applies on the next request;
//  - logs the real token counts (thinking tokens count as output - Google bills them so) against
//    that service, for the Costs page.
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { resolveModel } from './modelRegistry.js';
import { logUsage } from './usageService.js';

const clients = new Map();
function clientFor(apiKey) {
  if (!clients.has(apiKey)) clients.set(apiKey, new GoogleGenAI({ apiKey }));
  return clients.get(apiKey);
}

// The service file that created the model (first stack frame outside this file).
function callerFile() {
  for (const line of (new Error().stack || '').split('\n').slice(2)) {
    const m = line.match(/([^\\/()\s]+\.m?js):\d+:\d+\)?\s*$/);
    if (m && m[1] !== 'geminiClient.js') return m[1];
  }
  return null;
}

const asParts = (x) => (Array.isArray(x) ? x : [x]).map((p) => (typeof p === 'string' ? { text: p } : p));

// Old request shapes: a string, an array of parts/strings, or { contents, generationConfig, ... }.
function toRequest(req) {
  if (typeof req === 'string') return { contents: req, config: {} };
  if (req && Array.isArray(req.contents)) {
    const { contents, generationConfig, systemInstruction, tools, toolConfig, safetySettings } = req;
    return { contents, config: { ...(generationConfig || {}), ...(systemInstruction ? { systemInstruction } : {}), ...(tools ? { tools } : {}), ...(toolConfig ? { toolConfig } : {}), ...(safetySettings ? { safetySettings } : {}) } };
  }
  return { contents: [{ role: 'user', parts: asParts(req) }], config: {} };
}

function wrapResponse(r) {
  return {
    response: {
      text: () => r.text ?? '',
      candidates: r.candidates,
      usageMetadata: r.usageMetadata,
      promptFeedback: r.promptFeedback,
      functionCalls: () => r.functionCalls,
    }
  };
}

export function recordUsage(model, usage, operation) {
  if (!usage) return;
  try {
    logUsage(model, usage.promptTokenCount || 0, (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0), operation);
  } catch (err) { console.warn('[Gemini] usage not logged:', err.message); }
}

// For the few services that call the REST API directly (audio, pictures, inline files).
export async function readGeminiJson(res, model, operation) {
  const j = await res.json();
  recordUsage(model, j?.usageMetadata, operation);
  return j;
}

export class GoogleGenerativeAI {
  constructor(apiKey) { this.apiKey = apiKey; }

  getGenerativeModel(params = {}) {
    const ai = clientFor(this.apiKey);
    const file = callerFile();
    const { model: requested, generationConfig, systemInstruction, tools, toolConfig, safetySettings } = params;
    const base = {
      ...(generationConfig || {}),
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(tools ? { tools } : {}),
      ...(toolConfig ? { toolConfig } : {}),
      ...(safetySettings ? { safetySettings } : {}),
    };
    const pick = () => resolveModel(file, requested);
    return {
      get model() { return pick().model; },
      async generateContent(req) {
        const { model, service } = pick();
        const { contents, config } = toRequest(req);
        const r = await ai.models.generateContent({ model, contents, config: { ...base, ...config } });
        recordUsage(model, r.usageMetadata, service || (file || 'unknown').replace(/\.m?js$/, ''));
        return wrapResponse(r);
      },
      // { content: { parts }, taskType, title, outputDimensionality } -> { embedding: { values } }
      async embedContent(req) {
        const { model } = pick();
        const content = typeof req === 'string' ? req : req.content;
        const config = typeof req === 'string' ? {} : Object.fromEntries(Object.entries({ taskType: req.taskType, title: req.title, outputDimensionality: req.outputDimensionality }).filter(([, v]) => v != null));
        const r = await ai.models.embedContent({ model, contents: content, config });
        return { embedding: { values: r.embeddings?.[0]?.values || [] } };
      },
    };
  }
}

export default GoogleGenerativeAI;
