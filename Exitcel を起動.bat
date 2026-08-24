@echo off
cd /d "%~dp0"
title Exitcel
set PORT=8777

where node >nul 2>nul
if errorlevel 1 goto NONODE

set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist "%BROWSER%" goto LAUNCH
set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%BROWSER%" goto LAUNCH
set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%BROWSER%" goto LAUNCH
set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%BROWSER%" goto LAUNCH
set "BROWSER="

:LAUNCH
if defined BROWSER start "" "%BROWSER%" --app=http://localhost:%PORT%/ --window-size=1440,900
if not defined BROWSER start "" http://localhost:%PORT%/

echo.
echo   Exitcel を起動しました   http://localhost:%PORT%/
echo   このウィンドウを閉じると Exitcel は終了します。
echo.
node server.js %PORT%

echo.
echo   Exitcel を終了しました。何かキーを押すと閉じます。
pause >nul
goto :EOF

:NONODE
echo.
echo   Node.js が見つからないため、index.html を直接開きます。
echo.
start "" "index.html"
pause >nul
