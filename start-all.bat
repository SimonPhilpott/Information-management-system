@echo off
TITLE Information Management System - Startup
SETLOCAL

:: Set current directory to script directory
cd /d "%~dp0"

echo ==========================================
echo   IMS ^& PDF KB - Starting Services
echo ==========================================
echo.

:: 1. Check Root Dependencies
if not exist "node_modules\" (
    echo [System] Root node_modules not found. Installing...
    call npm install
)

:: 2. Check PDF Knowledge Base Dependencies
if not exist "pdf-knowledge-base\node_modules\" (
    echo [System] pdf-knowledge-base node_modules not found. Installing...
    cd pdf-knowledge-base
    call npm install
    cd ..
)

:: 3. Clean up conflicting ports
echo [System] Cleaning up ports 6001, 3001, 5173, and orphaned Ngrok processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :6001') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173') do taskkill /f /pid %%a >nul 2>&1
taskkill /f /im ngrok.exe >nul 2>&1

:: 4. Auto-enable Ngrok in SQLite database
echo [System] Auto-enabling Ngrok tunnel in backend...
cd pdf-knowledge-base
call node enable-ngrok.js
cd ..

:: 5. Read NGROK_AUTHTOKEN from .env for the main tunnel
if exist ".env" (
    for /f "usebackq tokens=1,2 delims==" %%I in (".env") do (
        if "%%I"=="NGROK_AUTHTOKEN" set "NGROK_AUTHTOKEN=%%J"
    )
)

:: 6. Launch Services (Prefer Windows Terminal Tabs)
where wt.exe >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [System] Launching services in Windows Terminal tabs...
    powershell -NoProfile -Command "wt -w 0 new-tab --title 'IMS Main App' -d '%~dp0.' cmd /k npm run dev ';' new-tab --title 'PDF KB Server' -d '%~dp0pdf-knowledge-base' cmd /k npm run dev:server ';' new-tab --title 'PDF KB Client' -d '%~dp0pdf-knowledge-base' cmd /k npm run dev:client ';' new-tab --title 'IMS Ngrok Tunnel' -d '%~dp0.' cmd /k ngrok http 6001 --url=https://simon-ims.ngrok-free.app"
) else (
    echo [System] Windows Terminal not found. Falling back to separate windows...
    start "IMS main app (Port 6001)" cmd /k "npm run dev"
    start "PDF KB Server (Port 3001)" cmd /k "cd pdf-knowledge-base && npm run dev:server"
    start "PDF KB Client (Port 5173)" cmd /k "cd pdf-knowledge-base && npm run dev:client"
    start "IMS Ngrok Tunnel" cmd /k "ngrok http 6001 --url=https://simon-ims.ngrok-free.app"
)

echo.
echo ======================================================
echo   All services and tunnels have been launched.
echo ======================================================
echo.
pause
