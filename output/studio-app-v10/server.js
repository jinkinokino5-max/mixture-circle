/* 簡易サーバ（はじめる.bat から呼ばれる。Python が無い環境用の予備）
   使い方: node server.js [ポート番号]
   音源（.mp3 / .wav / .ogg）の Content-Type を足してある */
const http = require('http'), fs = require('fs'), path = require('path');
const port = Number(process.argv[2]) || 8768;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
                '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
                '.png': 'image/png', '.svg': 'image/svg+xml' };

/* ミキサー画面（mixer.js）からの保存。card-gain.js だけを書き換える。
   書き込めるファイルはこの1つに限っている（ほかは触れない）。
   python の http.server で開いているときはこの口が無いので、
   mixer.js 側はダウンロードに切り替わる。                           */
const GAIN_FILE = 'card-gain.js';
function saveCardGain(req, res) {
  let body = '';
  req.on('data', c => {
    body += c;
    if (body.length > 200000) { req.destroy(); }     // 想定は数KB。異常に大きければ切る
  });
  req.on('end', () => {
    /* 中身が想定どおりか一応みる（別のものを書き込まれないように） */
    if (!/window\.CARD_GAIN\s*=/.test(body)) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('形式がちがいます');
      return;
    }
    fs.writeFile(path.join(__dirname, GAIN_FILE), body, 'utf8', (err) => {
      if (err) { res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(String(err)); return; }
      console.log(`${GAIN_FILE} を保存しました（${new Date().toLocaleTimeString()}）`);
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('ok');
    });
  });
}

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.split('?')[0].replace(/^\/+/, '') === 'save-card-gain') {
    saveCardGain(req, res); return;
  }
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(__dirname, rel);
  if (!file.startsWith(__dirname)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('見つかりません: ' + rel); return; }
    const ext = path.extname(file).toLowerCase();
    const head = { 'Content-Type': TYPES[ext] || 'application/octet-stream' };
    /* 音源は使い回してよいが、コードはキャッシュさせない。
       ミキサーで card-gain.js を保存したのに古い値が読まれる、を防ぐ */
    if (ext === '.js' || ext === '.html' || ext === '.css') head['Cache-Control'] = 'no-store';
    res.writeHead(200, head);
    res.end(buf);
  });
}).listen(port, () => console.log(`http://localhost:${port}/index.html で開けます（止めるときは Ctrl+C）`));
