/* =====================================================================
   fetch-samples.js — 本格音源を samples/ に取ってくる（v3）
   ---------------------------------------------------------------------
   使い方:  node fetch-samples.js       （通常は 音源をダウンロード.bat から）
   ・すでにあるファイルは飛ばすので、途中で止めても続きから再開できる
   ・落とせなかった音源は samples/manifest.js に載らない
     → アプリ側はその楽器だけ自動で合成音にフォールバックする
   ---------------------------------------------------------------------
   v3 の方針：カード1枚＝複数楽器のレイヤー（アンサンブル）にしたため、
   楽器を 18 種類まで増やしてある。
     v2: piano, guitar×2, bass, contrabass, cello, violin, sax（8種）
     v3: 上記＋ flute, trumpet, trombone, french-horn, harp, organ,
         harmonium, xylophone, guitar-nylon, clarinet（18種）
   ドラムキットもトム3個まで取るので、フィルが作れる。
   ---------------------------------------------------------------------
   音源の出どころ
     ピアノ  : Salamander Grand Piano（CC-BY 3.0 / Alexander Holm）
               https://tonejs.github.io/audio/salamander/
     その他  : tonejs-instruments（CC-BY 3.0 / VSCO2 由来）
               https://github.com/nbrosowsky/tonejs-instruments
     ドラム  : Tone.js drum-samples
               https://github.com/Tonejs/audio
   ※再配布・公開時はそれぞれのライセンス表記が必要。README を参照。
   ===================================================================== */

const https = require('https');
const fs = require('fs');
const path = require('path');

const SALAMANDER = 'https://tonejs.github.io/audio/salamander';
const INST = 'https://nbrosowsky.github.io/tonejs-instruments/samples';
const DRUMS = 'https://tonejs.github.io/audio/drum-samples';

/* ---- 落としてくる音の一覧 ----------------------------------------
   Tone.Sampler は間の音を自動で補間するので全音そろえる必要はないが、
   移調幅が広がると音が不自然になるので、使う音域を程よく覆う密度にする。
   ここに書いた音名はすべて配布元に実在することを確認済み。        */
const PITCHED = {
  /* --- 鍵盤・撥弦 --- */
  piano:             { base: SALAMANDER, notes: ['C2','Ds2','Fs2','A2','C3','Ds3','Fs3','A3','C4','Ds4','Fs4','A4','C5','Ds5','Fs5','A5','C6'] },
  organ:             { base: INST + '/organ',            notes: ['C2','Ds2','Fs2','A2','C3','Ds3','Fs3','A3','C4','Ds4','Fs4','A4','C5'] },
  harmonium:         { base: INST + '/harmonium',        notes: ['C2','Ds2','Fs2','A2','C3','Ds3','Fs3','A3','C4','Ds4','F4','G4'] },
  harp:              { base: INST + '/harp',             notes: ['G1','B1','D2','F2','A2','C3','E3','G3','B3','D4','F4','A4','C5','E5','G5'] },
  xylophone:         { base: INST + '/xylophone',        notes: ['G4','C5','G5','C6','G6','C7'] },

  /* --- ギター・ベース --- */
  'guitar-electric': { base: INST + '/guitar-electric',  notes: ['Cs2','E2','Fs2','A2','C3','Ds3','Fs3','A3','C4','Ds4','Fs4','A4','C5'] },
  'guitar-acoustic': { base: INST + '/guitar-acoustic',  notes: ['E2','G2','A2','C3','Ds3','F3','G3','As3','C4','Ds4','F4','G4','As4','C5'] },
  'guitar-nylon':    { base: INST + '/guitar-nylon',     notes: ['B1','D2','E2','Fs2','A2','B2','Cs3','E3','Fs3','A3','B3','Cs4','E4','Fs4','A4'] },
  'bass-electric':   { base: INST + '/bass-electric',    notes: ['E1','G1','As1','Cs2','E2','G2','As2','Cs3','E3'] },
  contrabass:        { base: INST + '/contrabass',       notes: ['G1','As1','C2','D2','E2','Fs2','Gs2','A2','Cs3','E3'] },

  /* --- 弦 --- */
  cello:             { base: INST + '/cello',            notes: ['C2','Ds2','F2','G2','As2','C3','Ds3','F3','G3','As3','C4'] },
  violin:            { base: INST + '/violin',           notes: ['G3','A3','C4','E4','G4','A4','C5','E5','G5','A5','C6'] },

  /* --- 管 --- */
  flute:             { base: INST + '/flute',            notes: ['C4','E4','A4','C5','E5','A5','C6','E6','A6'] },
  clarinet:          { base: INST + '/clarinet',         notes: ['D3','F3','As3','D4','F4','As4','D5'] },
  saxophone:         { base: INST + '/saxophone',        notes: ['As3','C4','Ds4','F4','G4','As4','C5','Ds5','F5','G5'] },
  trumpet:           { base: INST + '/trumpet',          notes: ['F3','A3','C4','Ds4','F4','G4','As4','D5','F5'] },
  trombone:          { base: INST + '/trombone',         notes: ['As1','Ds2','Gs2','C3','Ds3','Gs3','C4','Ds4','F4'] },
  'french-horn':     { base: INST + '/french-horn',      notes: ['A1','C2','Ds2','G2','D3','F3','A3','C4','D5','F5'] },
};

/* トムを3つとも取る。v3 はフィル（タム回し）を作るので必要 */
const DRUM_KITS = ['acoustic-kit', 'Kit3', 'Kit8', 'LINN', 'Techno', 'CR78'];
const DRUM_PARTS = ['kick', 'snare', 'hihat', 'tom1', 'tom2', 'tom3'];

/* ---- 1ファイル取得（リダイレクト追従つき） ---- */
function download(url, dest, redirectsLeft = 5) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        resolve(download(new URL(res.headers.location, url).href, dest, redirectsLeft - 1));
        return;
      }
      if (res.statusCode !== 200) { res.resume(); resolve(false); return; }
      const tmp = dest + '.part';
      const file = fs.createWriteStream(tmp);
      res.pipe(file);
      file.on('finish', () => file.close(() => { fs.renameSync(tmp, dest); resolve(true); }));
      file.on('error', () => { try { fs.unlinkSync(tmp); } catch (e) {} resolve(false); });
    }).on('error', () => resolve(false));
  });
}

/* ---- まとめて取得（同じフォルダ内は4本並行） ---- */
async function fetchGroup(dirName, base, names) {
  const dir = path.join(__dirname, 'samples', dirName);
  fs.mkdirSync(dir, { recursive: true });
  const got = [];
  const queue = names.slice();
  async function worker() {
    while (queue.length) {
      const n = queue.shift();
      const dest = path.join(dir, n + '.mp3');
      if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { got.push(n); process.stdout.write('.'); continue; }
      const ok = await download(`${base}/${n}.mp3`, dest);
      if (ok) { got.push(n); process.stdout.write('#'); }
      else process.stdout.write('x');
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  console.log(`  ${dirName}  ${got.length}/${names.length}`);
  return names.filter(n => got.includes(n));   // 元の並び順を保つ
}

(async () => {
  console.log('本格音源をダウンロードします（全部で 30MB 前後・数分かかります）');
  console.log('  # = 取得  . = すでにある  x = 取れなかった\n');

  const manifest = { pitched: {}, drums: {} };

  for (const [name, spec] of Object.entries(PITCHED)) {
    const got = await fetchGroup(name, spec.base, spec.notes);
    if (got.length) manifest.pitched[name] = got;
  }
  for (const kit of DRUM_KITS) {
    const got = await fetchGroup('drums/' + kit, `${DRUMS}/${kit}`, DRUM_PARTS);
    if (got.length) manifest.drums[kit] = got;
  }

  /* JSON ではなく JS で書き出す。<script> で読めるので file:// でも困らない */
  const out = '/* 自動生成 — fetch-samples.js が作ります。手で編集しないこと */\n'
            + 'window.SAMPLE_MANIFEST = ' + JSON.stringify(manifest, null, 2) + ';\n';
  fs.writeFileSync(path.join(__dirname, 'samples', 'manifest.js'), out, 'utf8');

  const p = Object.values(manifest.pitched).reduce((a, b) => a + b.length, 0);
  const d = Object.values(manifest.drums).reduce((a, b) => a + b.length, 0);
  console.log(`\n完了。楽器 ${Object.keys(manifest.pitched).length}種 / 音階もの ${p} 個 / ドラム ${d} 個`);
  console.log('samples/manifest.js を書き出しました。はじめる.bat でアプリを開いてください。');
  if (!p) {
    console.log('\n⚠ 1つも取得できませんでした。ネット接続を確認してください。');
    console.log('  そのままでも遊べますが、全パートが合成音になります。');
  }
})();
