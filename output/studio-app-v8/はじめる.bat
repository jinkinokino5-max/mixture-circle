@echo off
chcp 932 >nul
setlocal
cd /d "%~dp0"
set PORT=8773
set STARTED=

echo === STUDIO PULSE IV ===
echo フォルダ: %CD%
echo.

if not exist "index.html" (
  echo [エラー] index.html が見つかりません。
  echo このバッチは studio-app-v8 フォルダの中に置いてください。
  goto :fail
)

if not exist "samples\manifest.js" (
  echo [注意] 音源がまだありません。
  echo 先に「音源をダウンロード.bat」を1度だけ実行してください。
  echo このまま進めると、全パートが合成音になります。
  echo.
  pause
)

rem --- ポートが既に使われていないか確認 ---
netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul 2>nul
if %errorlevel%==0 (
  echo [情報] ポート %PORT% は既に使用中です。起動済みのサーバーをそのまま使います。
  set STARTED=1
)

if defined STARTED goto :open

where python >nul 2>nul
if %errorlevel%==0 (
  echo Python でサーバーを起動します...
  start "STUDIO PULSE IV サーバー" /min python -m http.server %PORT%
  set STARTED=1
)

if defined STARTED goto :open

where node >nul 2>nul
if %errorlevel%==0 (
  echo Node.js でサーバーを起動します...
  start "STUDIO PULSE IV サーバー" /min node server.js %PORT%
  set STARTED=1
)

if defined STARTED goto :open

echo [エラー] Python も Node.js も見つかりませんでした。
echo このアプリは音源ファイルを読むため、サーバー経由でないと本格音源が使えません。
echo   https://nodejs.org/ から Node.js を入れてから、もう一度実行してください。
goto :fail

:open
rem --- サーバーが応答するまで最大15秒待つ ---
set /a TRY=0
:wait
set /a TRY+=1
netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul 2>nul
if %errorlevel%==0 goto :ready
if %TRY% geq 15 (
  echo [エラー] サーバーが起動できませんでした（ポート %PORT%）。
  echo 最小化された「STUDIO PULSE IV サーバー」の窓を開いて、エラー内容を確認してください。
  goto :fail
)
ping -n 2 127.0.0.1 >nul
goto :wait

:ready
start "" http://localhost:%PORT%/index.html
echo.
echo ブラウザを開きました → http://localhost:%PORT%/index.html
echo 遊び終わったら、最小化されている「STUDIO PULSE IV サーバー」の窓を閉じてください。
ping -n 7 127.0.0.1 >nul
goto :eof

:fail
echo.
pause
exit /b 1
