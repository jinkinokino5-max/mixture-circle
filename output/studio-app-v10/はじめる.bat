@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem v10 は 8770 を使う。v3 が 8768、v9 が 8769 を使っているので、
rem どれを同時に開いても取り合いにならない。
set PORT=8770

if not exist "samples\manifest.js" (
  echo 音源がまだありません。
  echo 先に「音源をダウンロード.bat」を1度だけ実行してください。
  echo （このまま進めると、全パートが合成音になります）
  echo.
  pause
)

rem ポートが埋まっていたら、黙って別のアプリを開いてしまわないように止める。
rem （以前、v3 のサーバーが 8768 を掴んだままだったせいで、
rem   v10 を起動したつもりで v3 の画面が開く、という事故があった）
netstat -ano | findstr /c:"LISTENING" | findstr /c:":%PORT% " >nul
if %errorlevel%==0 (
  echo.
  echo ポート %PORT% はすでに使われています。
  echo 別の「ミクスチャー・サークル v10 サーバー」の窓がまだ開いたままかもしれません。
  echo その窓を閉じてから、もう一度この bat を実行してください。
  echo.
  echo 使っているプロセスはこれです：
  netstat -ano | findstr /c:"LISTENING" | findstr /c:":%PORT% "
  echo.
  pause
  goto :eof
)

rem Node を先に使う。Python の http.server は接続の待ち行列が5本しかなく、
rem 音源236個を一気に読むときに取りこぼす（実測：同時236個で50個しか取れない）。
rem 同梱の server.js にはその制限が無い。
where node >nul 2>nul
if %errorlevel%==0 (
  start "ミクスチャー・サークル v10 サーバー" /min node server.js %PORT%
  goto open
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "ミクスチャー・サークル v10 サーバー" /min python -m http.server %PORT%
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
echo ブラウザを開きました（http://localhost:%PORT%/index.html）。
echo 画面の左上が「ミクスチャー・サークル v10」になっていることを確かめてください。
echo 遊び終わったら、最小化されている「ミクスチャー・サークル v10 サーバー」の窓を閉じてください。
timeout /t 6 >nul
