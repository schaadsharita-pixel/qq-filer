@echo off
chcp 65001 >nul
title QQ File Classifier

cd /d "%~dp0"

echo.
echo ========================================
echo   QQ Group File Classifier - Quick Start
echo ========================================
echo.

:: ── 自动找 NapCat 安装位置 ──
set NAPCAT_DIR=
for %%d in (
    "%USERPROFILE%\Desktop\NapCat.Shell.Windows.OneKey\NapCat.44498.Shell"
    "%USERPROFILE%\Desktop\NapCatInstaller\NapCat.44498.Shell"
    "C:\NapCat\NapCat.44498.Shell"
) do (
    if exist "%%~d\NapCatWinBootMain.exe" if "%NAPCAT_DIR%"=="" set "NAPCAT_DIR=%%~d"
)

if "%NAPCAT_DIR%"=="" (
    echo [ERROR] NapCat not found!
    echo Please install NapCat first:
    echo   https://github.com/NapNeko/NapCatQQ/releases
    pause
    exit /b 1
)

echo   NapCat: %NAPCAT_DIR%
echo   Project: %~dp0
echo.

:: ── 检查 Node.js ──
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found! Please install Node.js ^>=16
    pause
    exit /b 1
)

:: ── 装依赖（第一次运行） ──
if not exist "node_modules\express" (
    echo [*] Installing dependencies...
    call npm install
)

:: ── 启动 ──
echo [1/3] Starting NapCat + QQ...
start "QQ-NapCat" cmd /c "chcp 65001>nul & "%NAPCAT_DIR%\NapCatWinBootMain.exe""

timeout /t 2 /nobreak >nul

echo [2/3] Starting Classifier + WebUI...
start "QQ-WebUI" cmd /c "cd /d %~dp0 && node napcat-webui.js"
start "QQ-Classifier" cmd /c "cd /d %~dp0 && node napcat-classifier.js"

timeout /t 3 /nobreak >nul

echo [3/3] Opening browser...
start http://localhost:3002

echo.
echo ========================================
echo   All started!  http://localhost:3002
echo ========================================
echo.
pause
