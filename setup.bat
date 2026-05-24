@echo off
chcp 65001 >nul
title QQ File Classifier - Setup
cd /d "%~dp0"

echo.
echo ========================================
echo   QQ Group File Classifier - Setup
echo   Run this ONCE on a new computer
echo ========================================
echo.

echo [1/4] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo   Node.js NOT found! Opening download page...
    start https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi
    echo   Install Node.js, then re-run this script.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo   OK: Node.js %%v

echo [2/4] Installing Node dependencies...
call npm install

echo [3/4] Configuring NapCat OneBot...

set NAPCAT_BASE=
set NAPCAT_CFG=

if exist "%USERPROFILE%\Desktop\NapCat.Shell.Windows.OneKey\NapCat.44498.Shell\versions\9.9.26-44498\resources\app\napcat" (
    set "NAPCAT_BASE=%USERPROFILE%\Desktop\NapCat.Shell.Windows.OneKey\NapCat.44498.Shell\versions\9.9.26-44498\resources\app\napcat"
    set "NAPCAT_CFG=%NAPCAT_BASE%\config"
)
if "%NAPCAT_BASE%"=="" (
    if exist "%USERPROFILE%\Desktop\NapCatInstaller\NapCat.44498.Shell\versions\9.9.26-44498\resources\app\napcat" (
        set "NAPCAT_BASE=%USERPROFILE%\Desktop\NapCatInstaller\NapCat.44498.Shell\versions\9.9.26-44498\resources\app\napcat"
        set "NAPCAT_CFG=%NAPCAT_BASE%\config"
    )
)

if "%NAPCAT_CFG%"=="" (
    echo   [WARN] NapCat config not found.
    echo   Make sure NapCat is installed and has been run once.
    echo   https://github.com/NapNeko/NapCatQQ/releases
) else (
    echo   Found NapCat: %NAPCAT_CFG%

    echo   Writing onebot11.json...
    copy /Y "%~dp0napcat\onebot11.json" "%NAPCAT_CFG%\onebot11.json" >nul

    if exist "%~dp0napcat\webui.json" (
        echo   Writing webui.json (no token)...
        copy /Y "%~dp0napcat\webui.json" "%NAPCAT_CFG%\webui.json" >nul
    )

    echo   Deploying classifier plugin...
    if not exist "%NAPCAT_BASE%\plugins\qq-filer-classifier" mkdir "%NAPCAT_BASE%\plugins\qq-filer-classifier"
    copy /Y "%~dp0napcat-plugin\index.js" "%NAPCAT_BASE%\plugins\qq-filer-classifier\index.js" >nul
    if exist "%NAPCAT_BASE%\plugins\qq-filer-classifier\package.json" del "%NAPCAT_BASE%\plugins\qq-filer-classifier\package.json"
    echo   OK: Plugin deployed

    echo   OK: OneBot + WebUI + Plugin configured
)

echo [4/4] Done!
echo.
echo ========================================
echo   Setup complete!
echo.
echo   Next: double-click start-all.bat
echo   NapCat WebUI: http://127.0.0.1:6099/webui
echo   File Manager: http://localhost:3002
echo ========================================
echo.
pause
