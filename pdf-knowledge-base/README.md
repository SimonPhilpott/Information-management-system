# 📚 PDF Knowledge Base

AI-powered research assistant that connects to your Google Drive PDFs and answers questions with direct citations to source pages.

## Features

- 🔗 **Google Drive Integration** — Syncs PDFs from your chosen Drive folder
- 🤖 **AI Q&A with RAG** — Ask questions and get answers grounded in your documents
- 📄 **Interactive Citations** — Click citations to open the PDF at the exact page
- 📁 **Subject Filtering** — Filter answers by subject/folder
- 💬 **Chat History** — Save and revisit past conversations
- ⚡🧠 **Model Switching** — Toggle between Gemini Flash (fast) and Pro (quality)
- 📊 **Token Usage Tracking** — Visual spend meter with monthly cap warnings
- 🔍 **Topic Discovery** — Browse discovered topics and get question suggestions

## Setup

### 1. Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable these APIs:
   - **Google Drive API** — [Enable](https://console.cloud.google.com/apis/library/drive.googleapis.com)
   - **Generative Language API** — [Enable](https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com)

### 2. OAuth 2.0 Credentials

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Add authorized redirect URI: `http://localhost:3001/api/auth/callback`
5. Copy the **Client ID** and **Client Secret**

### 3. Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create an API key
3. Copy the key

### 4. Environment Setup

Copy the example env file and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env`:
```env
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GEMINI_API_KEY=your_gemini_api_key_here
SESSION_SECRET=any-random-string-here
```

### 5. Install & Run

```bash
# Install dependencies
npm install
cd client && npm install && cd ..

# Run in development mode (starts both server and client)
npm run dev
```

The app will be available at **http://localhost:5173**

### 6. First Run

1. Click **Connect with Google** to authorize Drive access
2. Browse and select your root PDF folder (the one containing subject subfolders)
3. Set your monthly spend cap and preferred AI model
4. Click **Start Indexing** — the app will download, process, and index your PDFs
5. Start asking questions!

## Architecture

```
Client (React + Vite)  ←→  Server (Express)  ←→  Google Drive API
        ↓                        ↓                     ↓
   PDF.js Viewer            Vector Store          Gemini API
                            (JSON-based)         (Chat + Embeddings)
                                ↓
                        SQLite Database
                    (History, Usage, Topics)
```

## Project Structure

```
pdf-knowledge-base/
├── client/src/
│   ├── components/
│   │   ├── ChatInterface.jsx     # Chat messages + input
│   │   ├── MessageBubble.jsx     # Message rendering + citations
│   │   ├── CitationCard.jsx      # Clickable citation badges
│   │   ├── PDFViewerModal.jsx    # In-app PDF viewer
│   │   ├── Sidebar.jsx           # Subject filter + history
│   │   ├── TopicDiscovery.jsx    # Topic chips + suggestions
│   │   ├── TokenUsageMeter.jsx   # Spend tracking meter
│   │   ├── ModelSwitcher.jsx     # Flash/Pro toggle
│   │   └── OnboardingSetup.jsx   # First-run wizard
│   ├── App.jsx                   # Main app + state management
│   └── index.css                 # Full design system
├── server/
│   ├── services/
│   │   ├── driveService.js       # Google Drive integration
│   │   ├── pdfService.js         # PDF text extraction
│   │   ├── embeddingService.js   # Gemini embeddings
│   │   ├── vectorStore.js        # Cosine similarity search
│   │   ├── chatService.js        # RAG chat engine
│   │   ├── topicService.js       # Topic extraction
│   │   └── usageService.js       # Token tracking
│   ├── routes/                   # Express API routes
│   └── db/database.js            # SQLite schema
└── .env                          # Your credentials
```

## Keyboard Shortcuts (PDF Viewer)

| Key | Action |
|-----|--------|
| `←` `↑` | Previous page |
| `→` `↓` | Next page |
| `+` | Zoom in |
| `-` | Zoom out |
| `Esc` | Close viewer |
