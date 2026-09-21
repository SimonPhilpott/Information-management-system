@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo   IMS ESP32-S3-BOX-3B - Build ^& Flash Firmware Tool
echo ========================================================
echo.

:: Change to script directory
cd /d "%~dp0"

:: 1. Check for secrets.h
if not exist "include\secrets.h" (
    echo [WARNING] include\secrets.h not found!
    if exist "include\secrets.h.example" (
        echo Creating include\secrets.h from secrets.h.example...
        copy "include\secrets.h.example" "include\secrets.h" >nul
        echo [ACTION REQUIRED] Please edit include\secrets.h with your real Wi-Fi credentials before continuing.
        pause
    ) else (
        echo [ERROR] secrets.h.example is also missing. Please configure Wi-Fi credentials in include\secrets.h.
        pause
        exit /b 1
    )
)

:: 2. Locate PlatformIO executable
set "PIO_EXE="
if exist "%USERPROFILE%\.platformio\penv\Scripts\platformio.exe" (
    set "PIO_EXE=%USERPROFILE%\.platformio\penv\Scripts\platformio.exe"
) else (
    where platformio >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        set "PIO_EXE=platformio"
    ) else (
        where pio >nul 2>&1
        if !ERRORLEVEL! equ 0 (
            set "PIO_EXE=pio"
        )
    )
)

if "%PIO_EXE%"=="" (
    echo [ERROR] PlatformIO was not found in %USERPROFILE%\.platformio\penv\Scripts\ or in your PATH.
    echo Please install PlatformIO IDE or CLI to proceed.
    pause
    exit /b 1
)

echo [1/3] Compiling and uploading firmware with PlatformIO...
set "PYTHONIOENCODING=utf-8"
"%PIO_EXE%" run -e esp32s3box --target upload

if %ERRORLEVEL% neq 0 (
    echo.
    echo [FAIL] Upload failed! Ensure the ESP32-S3-BOX-3 is plugged in and no serial monitor is holding COM3 open.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/3] Updating saved binaries in firmware\esp32-s3-box-3\bin...
if not exist "bin\" mkdir "bin"
copy /y ".pio\build\esp32s3box\*.bin" "bin\" >nul 2>&1

echo.
echo [3/3] Build and flash complete!
echo Saved binary copies updated in:
echo   - bin\firmware.factory.bin  (Combined flash image at 0x0)
echo   - bin\firmware.bin          (Application image at 0x10000)
echo.
echo ========================================================
echo   Flash Successful! Device is rebooting into IMS voice mode.
echo ========================================================
echo.
pause
