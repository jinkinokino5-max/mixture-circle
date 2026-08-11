/* =====================================================================
   fetch-samples.js — 本格音源（実録音サンプル）を samples/ に取ってくる
   ---------------------------------------------------------------------
   使い方:  node fetch-samples.js       （通常は 音源をダウンロード.bat から）
   ・すでにあるファイルは飛ばすので、途中で止めても続きから再開できる
   ・落とせなかった音源は samples/manifest.js に載らない
     → アプリ側はその楽器だけ自動で合成音にフォールバックする
   ---------------------------------------------------------------------
   v2 での追加：ジャンルごとに代表楽器を変える設計になったため、
     サックス（JAZZ MELODY）・コントラバス（JAZZ BASS）・
     バイオリン（CLASSICAL MELODY）・チェロ（CLASSICAL BASS）を追加した。
   ---------------------------------------------------------------------
   音源の出どころ（いずれも Tone.js コミュニティの公開サンプル）
     ピアノ  : Salamander Grand Piano（CC-BY 3.0 / Alexander Holm）
               https://tonejs.github.io/audio/salamander/
     その他の楽器 : tonejs-instruments（CC-BY 3.0 / VSCO2 由来）
               https://github.com/nbrosowsky/tonejs-instruments
     ドラム  : Tone.js drum-samples
               https://github.com/Tonejs/audio
   ※再配布・公開時はそれぞれのライセンス表記が必要。README を参照。
   ===================================================================== */

const https = require('https');
const fs = require('fs');
const path = require('path');

const SALAMANDER = 'https://tonejs.github.io/audio/salamander';
const INSTRUMENTS_BASE = 'https://nbrosowsky.github.io/tonejs-instruments/samples';
const DRUMS_BASE = 'https://tonejs.github.io/audio/drum-samples';

/* ---- 落としてくる音の一覧 ----------------------------------------
   Tone.Sampler は間の音を自動で補間するので、全音そろえる必要はない。
   ここに並べた音名は、配布元に実在するファイルだけを確認して選んである
   （実在しない音名を書くと 404 になり、移調幅が広がって音が不自然になる）。 */
const PITCHED = {
  piano: {
    base: SALAMANDER,
    notes: ['C2','Ds2','Fs2','A2','C3','Ds3','Fs3','A3','C4','Ds4','Fs4','A4','C5','Ds5','Fs5','A5','C6'],
  },
  'guitar-acoustic': {
    base: INSTRUMENTS_BASE + '/guitar-acoustic',
    notes: ['E2','G2','A2','C3','Ds3','F3','G3','As3','C4','Ds4','F4','G4','As4','C5'],
  },
  /* エレキは3半音刻みでしか音源が存在しない */
  'guitar-electric': {
    base: INSTRUMENTS_BASE + '/guitar-electric',
    notes: ['Cs2','E2','Fs2','A2','C3','Ds3','Fs3','A3','C4','Ds4','Fs4','A4','C5'],
  },
  'bass-electric': {
    base: INSTRUMENTS_BASE + '/bass-electric',
    notes: ['E1','G1','As1','Cs2','E2','G2','As2','Cs3','E3'],
  },
  /* --- ここから v2 で追加した4つ --- */
  saxophone: {                                   // JAZZ の MELODY
    base: INSTRUMENTS_BASE + '/saxophone',
    notes: ['As3','C4','Ds4','F4','G4','As4','C5','Ds5','F5','G5'],
  },
  contrabass: {                                  // JAZZ の BASS（ウッドベース）
    base: INSTRUMENTS_BASE + '/contrabass',
    notes: ['G1','As1','C2','D2','E2','Fs2','Gs2','A2','Cs3','E3','Gs3'],
  },
  violin: {                                      // CLASSICAL の MELODY
    base: INSTRUMENTS_BASE + '/violin',
    notes: ['G3','A3','C4','E4','G4','A4','C5','E5','G5','A5','C6','E6'],
  },
  cello: {                                       // CLASSICAL の BASS
    base: INSTRUMENTS_BASE + '/cello',
    notes: ['C2','Ds2','F2','G2','As2','C3','Ds3','F3','G3','As3','C4'],
  },
};

const DRUM_KITS = ['acoustic-kit', 'Kit3', 'breakbeat13', 'CR78', 'LINN', 'Techno'];
const DRUM_PARTS = ['kick', 'snare', 'hihat', 'tom1'];

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

/* ---- まとめて取得 ---- */
async function fetchGroup(dirName, base, names) {
  const dir = path.join(__dirname, 'samples', dirName);
  fs.mkdirSync(dir, { recursive: true });
  const got = [];
  for (const n of names) {
    const dest = path.join(dir, n + '.mp3');
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { got.push(n); process.stdout.write('.'); continue; }
    const ok = await download(`${base}/${encodeURIComponent(n)}.mp3`, dest);
    if (ok) { got.push(n); process.stdout.write('#'); }
    else process.stdout.write('x');
  }
  console.log(`  ${dirName}  ${got.length}/${names.length}`);
  return got;
}

(async () => {
  console.log('本格音源をダウンロードします（全部で 15MB 前後・数分かかることがあります）');
  console.log('  # = 取得  . = すでにある  x = 取れなかった\n');

  const manifest = { pitched: {}, drums: {} };

  for (const [name, spec] of Object.entries(PITCHED)) {
    const got = await fetchGroup(name, spec.base, spec.notes);
    if (got.length) manifest.pitched[name] = got;
  }
  for (const kit of DRUM_KITS) {
    const got = await fetchGroup('drums/' + kit, `${DRUMS_BASE}/${kit}`, DRUM_PARTS);
    if (got.length) manifest.drums[kit] = got;
  }

  /* JSON ではなく JS で書き出す。<script> で読めるので file:// でも困らない */
  const out = '/* 自動生成 — fetch-samples.js が作ります。手で編集しないこと */\n'
            + 'window.SAMPLE_MANIFEST = ' + JSON.stringify(manifest, null, 2) + ';\n';
  fs.writeFileSync(path.join(__dirname, 'samples', 'manifest.js'), out, 'utf8');

  const pitchedCount = Object.values(manifest.pitched).reduce((a, b) => a + b.length, 0);
  const drumCount = Object.values(manifest.drums).reduce((a, b) => a + b.length, 0);
  console.log(`\n完了。音階もの ${pitchedCount} 個 / ドラム ${drumCount} 個`);
  console.log('samples/manifest.js を書き出しました。はじめる.bat でアプリを開いてください。');
  if (!Object.keys(manifest.pitched).length) {
    console.log('\n⚠ 1つも取得できませんでした。ネット接続を確認してください。');
    console.log('  そのままでも遊べますが、全パートが合成音になります。');
  }
})();
