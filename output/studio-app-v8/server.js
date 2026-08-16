/* 簡易サーバ（はじめる.bat から呼ばれる。Python が無い環境用の予備）
   使い方: node server.js [ポート番号]
   Phase 0 版との違い：音源（.mp3 / .wav / .ogg）の Content-Type を足してある */
const http = require('http'), fs = require('fs'), path = require('path');
const port = Number(process.argv[2]) || 8773;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
                '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
                '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(__dirname, rel);
  if (!file.startsWith(__dirname)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('見つかりません: ' + rel); return; }
    /* 手元で編集しながら開くためのサーバなので、キャッシュは持たせない。
       これが無いと app.js を直してもブラウザが古い版を使い続ける。
       音源(.mp3)は変わらないうえ量が多いので、そこだけは残す。      */
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.mp3' ? 'public, max-age=86400' : 'no-store',
    });
    res.end(buf);
  });
}).listen(port, () => console.log(`http://localhost:${port}/index.html で開けます（止めるときは Ctrl+C）`));
