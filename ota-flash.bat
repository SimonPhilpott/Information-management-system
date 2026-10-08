@echo off
TITLE ESP32-S3-BOX-3 Wi-Fi OTA Flasher
SETLOCAL
cd /d "%~dp0"

echo ======================================================
echo   ESP32-S3-BOX-3 Wi-Fi OTA Firmware Flasher
echo ======================================================
echo.

set "ESP_IP=192.168.1.92"
set "ESP_PORT=3232"
set "BIN_FILE=firmware\esp32-s3-box-3\.pio\build\esp32s3box\firmware.bin"

if not "%~1"=="" set "BIN_FILE=%~1"
if not "%~2"=="" set "ESP_IP=%~2"

if not exist "%BIN_FILE%" (
    echo [ERROR] Firmware binary not found at: %BIN_FILE%
    echo Please run PlatformIO build first.
    pause
    exit /b 1
)

echo Target Device IP: %ESP_IP%
echo Target OTA Port:  %ESP_PORT%
echo Firmware Binary:   %BIN_FILE%
echo.

echo [1/2] Probing ESP32-S3-BOX-3 OTA port...
powershell -NoProfile -Command "$tcp = [System.Net.Sockets.TcpClient]::new(); try { $tcp.Connect('%ESP_IP%', %ESP_PORT%); $stream = $tcp.GetStream(); $reader = [System.IO.StreamReader]::new($stream); $r = $reader.ReadLine(); Write-Host '[OK] Device responded: ' $r -ForegroundColor Green; $tcp.Close() } catch { Write-Host '[FAIL] Device not reachable at %ESP_IP%:%ESP_PORT%' -ForegroundColor Red; exit 1 }"

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] ESP32 did not respond on OTA port %ESP_PORT%.
    pause
    exit /b 1
)

echo.
echo [2/2] Transmitting firmware over Wi-Fi...
set "PYTHONIOENCODING=utf-8"
"C:\python312\python.exe" "C:\Users\sideb\.platformio\packages\framework-arduinoespressif32\tools\espota.py" -i %ESP_IP% -I 192.168.1.78 -p %ESP_PORT% -f "%BIN_FILE%" -d -r -t 15

if %ERRORLEVEL% equ 0 (
    echo.
    echo ======================================================
    echo   [SUCCESS] OTA Flash Complete!
    echo   ESP32-S3-BOX-3 is rebooting into the new partition.
    echo ======================================================
) else (
    echo.
    echo ======================================================
    echo   [ERROR] OTA Flash Failed.
    echo ======================================================
)

echo.
pause
