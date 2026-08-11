@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PORT=8767

if not exist "samples\manifest.js" (
  echo 音源がまだありません。
  echo 先に「音源をダウンロード.bat」を1度だけ実行してください。
  echo （このまま進めると、全パートが合成音になります）
  echo.
  pause
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "ミクスチャー・サークル STUDIO v2 サーバー" /min python -m http.server %PORT%
  goto open
)

where node >nul 2>nul
if %errorlevel%==0 (
  start "ミクスチャー・サークル STUDIO v2 サーバー" /min node server.js %PORT%
  goto open
)

echo Python も Node も見つかりませんでした。
echo このアプリは音源ファイルを読むため、サーバー経由でないと本格音源が使えません。
echo   https://nodejs.org/ から Node.js を入れてから、もう一度実行してください。
pause
goto :eof

:open
timeout /t 2 >nul
start "" http://localhost:%PORT%/index.html
echo.
echo ブラウザを開きました。
echo 遊び終わったら、最小化されている「ミクスチャー・サークル STUDIO v2 サーバー」の窓を閉じてください。
timeout /t 6 >nul
