import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve .env from the pdf-knowledge-base root (one level above this server/ dir)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

export default {
  port: process.env.PORT || 3001,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  adminEmail: process.env.ADMIN_EMAIL,
  ngrok: {
    authtoken: process.env.NGROK_AUTHTOKEN,
    domain: process.env.NGROK_DOMAIN
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: `http://localhost:${process.env.PORT || 3001}/api/auth/callback`,
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ]
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    embeddingModel: 'gemini-embedding-001',
    chatModels: {
      flash: 'gemini-2.5-flash',
      pro: 'gemini-2.5-pro',
      thinking: 'gemini-2.5-flash',
      research: 'gemini-2.5-pro',
      image: 'gemini-3.1-flash-image'
    },
    // Defaults only. Which model each service actually uses is chosen on the Model Switcher
    // (services/modelRegistry.js); prices live on the Costs page (usageService.getPrices()).
    liveModel: 'gemini-3.8-live',
    ttsModel: 'gemini-2.5-flash-preview-tts'
  },
  defaults: {
    monthlySpendCap: 250,
    preferredModel: 'flash',
    chunkSize: 500,
    chunkOverlap: 50,
    topK: 8
  }
};

// Trigger server config reload
