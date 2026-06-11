@echo off
TITLE PDF Knowledge Base - Startup
SETLOCAL

:: Set the working directory to your project's absolute path
cd /d "c:\Users\sideb\.gemini\antigravity\scratch\pdf-knowledge-base"

echo ==========================================
echo   PDF Knowledge Base - Starting Services
echo ==========================================
echo.

:: Check if node_modules exists, if not, offer to install
if not exist "node_modules\" (
    echo [System] node_modules not found. Installing dependencies...
    call npm install
)

if not exist "client\node_modules\" (
    echo [System] Client node_modules not found. Installing dependencies...
    cd client
    call npm install
    cd ..
)

echo [System] Cleaning up ports 3001 and 5173...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173') do taskkill /f /pid %%a >nul 2>&1

echo [System] Auto-enabling Ngrok in database...
call node enable-ngrok.js

echo [System] Starting Server and Client...
echo.
echo ------------------------------------------
echo   Keep this window open while using the app
echo   Press Ctrl+C to stop the services
echo ------------------------------------------
echo.

:: Run the dev script which starts both server and client
:: We override the port for the client to 5173 to match .env
set VITE_PORT=5173
npm run dev

pause
