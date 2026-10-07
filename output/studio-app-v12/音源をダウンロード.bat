@echo off
cd /d "%~dp0"

echo ============================================================
echo  Sample audio download
echo ------------------------------------------------------------
echo  Run this once (later runs only fetch what's missing).
echo  Needs an internet connection. Total size is about 39MB.
echo ============================================================
echo.

where node >nul 2>nul
if not %errorlevel%==0 (
  echo Node.js was not found.
  echo   Install it from https://nodejs.org/ and run this again.
  echo.
  echo Without downloading, the app will still open but stay silent.
  pause
  goto :eof
)

node fetch-samples.js
echo.
echo Done. Open the app with "hajimeru.bat" ( or the start batch file ).
pause
