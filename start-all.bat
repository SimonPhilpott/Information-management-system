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

:: 3. Clean up conflicting node processes and ports
echo [System] Terminating prior node processes and cleaning up ports...
powershell -NoProfile -Command "Stop-Process -Name node,ngrok -Force -ErrorAction SilentlyContinue"
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :6001') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3002') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3003') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173') do taskkill /f /pid %%a >nul 2>&1
taskkill /f /im ngrok.exe >nul 2>&1

:: 4. Auto-enable Ngrok in SQLite database
echo [System] Auto-enabling Ngrok tunnel in backend...
cd pdf-knowledge-base
call node enable-ngrok.js
cd ..

:: 5. Read NGROK_AUTHTOKEN from .env for the main tunnel (.env is encrypted with dotenvx; it decrypts
::    with the private key kept on this PC)
if exist ".env" (
    for /f "delims=" %%T in ('npx dotenvx get NGROK_AUTHTOKEN -f .env 2^>nul') do set "NGROK_AUTHTOKEN=%%T"
)

:: 6. Launch Services (Prefer Windows Terminal Tabs)
where wt.exe >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [System] Launching services in Windows Terminal tabs...
    powershell -NoProfile -Command "wt -w 0 new-tab --title 'IMS Main App' -d '%~dp0.' cmd /k npm run dev ';' new-tab --title 'PDF KB Server (3001/3002/3003)' -d '%~dp0pdf-knowledge-base' cmd /k npm run dev:server ';' new-tab --title 'IMS Ngrok Tunnel' -d '%~dp0.' cmd /k ngrok http 6001 --url=https://simon-ims.ngrok-free.app ';' new-tab --title 'Hardware & OTA (3002/3232)' -d '%~dp0.' cmd /k powershell -NoProfile -ExecutionPolicy Bypass -File scripts\probe_box3.ps1"
) else (
    echo [System] Windows Terminal not found. Falling back to separate windows...
    start "IMS main app (Port 6001)" cmd /k "npm run dev"
    start "PDF KB Server (Port 3001/3002/3003)" cmd /k "cd pdf-knowledge-base && npm run dev:server"
    start "IMS Ngrok Tunnel" cmd /k "ngrok http 6001 --url=https://simon-ims.ngrok-free.app"
    start "Hardware & OTA Status (Port 3002/3232)" cmd /k powershell -NoProfile -ExecutionPolicy Bypass -File scripts\probe_box3.ps1
)

echo.
echo [System] Waiting 3s for services to bind ports...
timeout /t 3 /nobreak >nul

echo.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\probe_box3.ps1

echo.
echo ======================================================
echo   Port & Service Summary:
echo   - Port 6001: IMS Main Web Interface (http://localhost:6001)
echo   - Port 3001: PDF KB Backend API (http://localhost:3001)
echo   - Port 3002: Hardware Raw TCP Server (Box-3 Audio/Voice)
echo   - Port 3003: Device HTTP Server (Dock UVC Camera Stream)
echo   - Port 5173: PDF KB Client Interface (http://localhost:5173)
echo   - Port 3232: ESP32-S3-BOX-3 ArduinoOTA Wi-Fi Listener (192.168.1.92:3232)
echo.
echo   To flash firmware over Wi-Fi without USB:
echo   Run: ota-flash.bat
echo ======================================================
echo.
pause
