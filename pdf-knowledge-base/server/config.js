import dotenv from 'dotenv';
dotenv.config();

export default {
  port: process.env.PORT || 3001,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  adminEmail: process.env.ADMIN_EMAIL,
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: `http://localhost:${process.env.PORT || 3001}/api/auth/callback`,
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ]
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    embeddingModel: 'gemini-embedding-001',
    chatModels: {
      flash: 'gemini-2.5-flash',
      pro: 'gemini-2.5-pro'
    },
    pricing: {
      'gemini-2.5-flash': { input: 0.15, output: 0.60 },
      'gemini-2.5-pro': { input: 1.25, output: 10.00 },
      'gemini-embedding-001': { input: 0.00, output: 0.00 }
    }
  },
  defaults: {
    monthlySpendCap: 250,
    preferredModel: 'flash',
    chunkSize: 500,
    chunkOverlap: 50,
    topK: 8
  }
};
