@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo   IMS ESP32-S3-BOX-3B - Flash Pre-Compiled Binary Tool
echo ========================================================
echo.

cd /d "%~dp0"

if not exist "bin\firmware.factory.bin" (
    echo [ERROR] bin\firmware.factory.bin not found!
    echo Please run build-and-flash.bat first to compile the binary.
    pause
    exit /b 1
)

:: Locate Python or PlatformIO Python
set "PYTHON_EXE="
if exist "%USERPROFILE%\.platformio\penv\Scripts\python.exe" (
    set "PYTHON_EXE=%USERPROFILE%\.platformio\penv\Scripts\python.exe"
) else (
    where python >nul 2>&1
    if !ERRORLEVEL! equ 0 set "PYTHON_EXE=python"
)

set "ESPTOOL_PY=%USERPROFILE%\.platformio\packages\tool-esptoolpy\esptool.py"

if exist "%ESPTOOL_PY%" if defined PYTHON_EXE (
    echo [System] Using PlatformIO esptool...
    "%PYTHON_EXE%" "%ESPTOOL_PY%" --chip esp32s3 write_flash -z 0x0 bin\firmware.factory.bin
    goto done
)

:: Fallback to esptool on PATH
where esptool.py >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [System] Using system esptool.py...
    esptool.py --chip esp32s3 write_flash -z 0x0 bin\firmware.factory.bin
    goto done
)

where esptool >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [System] Using system esptool...
    esptool --chip esp32s3 write_flash -z 0x0 bin\firmware.factory.bin
    goto done
)

echo [ERROR] esptool was not found. Please install esptool via 'pip install esptool' or install PlatformIO.
pause
exit /b 1

:done
if %ERRORLEVEL% equ 0 (
    echo.
    echo ========================================================
    echo   Factory Binary Flashed Successfully! Device is rebooting.
    echo ========================================================
) else (
    echo.
    echo [FAIL] Flash failed! Please check COM port and cable connection.
)
echo.
pause
