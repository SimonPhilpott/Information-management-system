import { GoogleGenerativeAI } from '@google/generative-ai';
import config from './server/config.js';

async function listModels() {
  const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${config.gemini.apiKey}`);
    const data = await response.json();
    console.log('Available Models:', data.models.map(m => m.name));
  } catch (err) {
    console.error('Failed to list models:', err);
  }
}

listModels();
