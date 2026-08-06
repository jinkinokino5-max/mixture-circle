@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PORT=8765

where python >nul 2>nul
if %errorlevel%==0 (
  start "ミクスチャー・サークル サーバー" /min python -m http.server %PORT%
  goto open
)

where node >nul 2>nul
if %errorlevel%==0 (
  start "ミクスチャー・サークル サーバー" /min node server.js %PORT%
  goto open
)

echo Python も Node も見つかりませんでした。
echo index.html を直接ダブルクリックしても遊べます（残響だけ無効になります）。
pause
goto :eof

:open
timeout /t 2 >nul
start "" http://localhost:%PORT%/index.html
echo.
echo ブラウザを開きました。
echo 遊び終わったら、最小化されている「ミクスチャー・サークル サーバー」の窓を閉じてください。
timeout /t 6 >nul
