@echo off
cd /d "%~dp0"
set PORT=8774

if not exist "samples\manifest.js" (
  echo Samples not found yet.
  echo Please run the sample-download batch file in this folder once first.
  pause
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "card-audition2-server" /min python -m http.server %PORT%
  goto open
)

where node >nul 2>nul
if %errorlevel%==0 (
  start "card-audition2-server" /min node server.js %PORT%
  goto open
)

echo Python or Node.js is required to run the local server.
echo Install Node.js from https://nodejs.org/ and try again.
pause
goto :eof

:open
ping -n 3 127.0.0.1 >nul
start "" http://localhost:%PORT%/card-audition2.html
echo.
echo Browser opened at http://localhost:%PORT%/card-audition2.html
echo Close the small "card-audition2-server" window in the taskbar when done.
ping -n 7 127.0.0.1 >nul
