import express from 'express';
import cors from 'cors';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import config from './config.js';

// Import routes
import authRoutes from './routes/auth.js';
import driveRoutes from './routes/drive.js';
import chatRoutes from './routes/chat.js';
import subjectRoutes from './routes/subjects.js';
import usageRoutes from './routes/usage.js';
import pdfRoutes from './routes/pdf.js';
import settingsRoutes from './routes/settings.js';
import { validateConfiguredModels } from './services/modelService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Ensure data directories exist
const dataDirs = ['data', 'data/pdfs', 'data/vectors'];
for (const dir of dataDirs) {
  fs.mkdirSync(path.join(__dirname, dir), { recursive: true });
}

// Middleware
app.use(cors({
  origin: config.clientUrl,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set true in production with HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));
+
+// Restriction Middleware: Gates the app to the authorized user only
+const requireAdmin = (req, res, next) => {
+  // Allow auth routes and static assets
+  if (req.path.startsWith('/api/auth') || !req.path.startsWith('/api')) {
+    return next();
+  }
+
+  if (!req.session.user) {
+    return res.status(401).json({ error: 'Unauthorized: Admin access required.' });
+  }
+
+  next();
+};
+
+app.use(requireAdmin);
+
 // API Routes
 app.use('/api/auth', authRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/settings', settingsRoutes);

// Serve static client build in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

app.listen(config.port, async () => {
  console.log(`\n🚀 PDF Knowledge Base server running on http://localhost:${config.port}`);
  console.log(`📡 Client expected at ${config.clientUrl}\n`);
  
  // Validate models on startup
  await validateConfiguredModels();
});
