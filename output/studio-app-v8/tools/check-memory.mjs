/* =====================================================================
   tools/check-memory.mjs — 音源をデコードしたとき、ブラウザが何MB抱えるか
   ---------------------------------------------------------------------
     node tools/check-memory.mjs
   ---------------------------------------------------------------------
   mp3 はディスク上では小さいが、Web Audio は再生のために **Float32 の
   生波形へ展開して丸ごとメモリに置く**。圧縮率が 10 倍なら、
   43MB の音源は数百MB になる。

   「時間がたつと音がプツプツ切れる」の原因を切り分けるために、
   実際に全 304 本をデコードして、
     ・合計の再生時間
     ・チャンネル数
     ・デコード後に常駐するメモリ量
   を出す。ここが数百MBなら、音声スレッドが締め切りに間に合わなく
   なる（＝プツプツ）のはマスター段ではなくメモリ側の問題。
   ===================================================================== */
import { OfflineAudioContext } from 'node-web-audio-api';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* manifest.js から実際に読み込まれる音源の一覧を取る */
const ctx = { window: {} };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'samples/manifest.js'), 'utf8'), ctx);
const manifest = ctx.SAMPLE_MANIFEST || ctx.window.SAMPLE_MANIFEST;

/* manifest は { pitched: { 楽器: [音名...] }, drums: { キット: [パーツ...] } } の形。
   ドラムは samples/drums/<キット>/<パーツ>.mp3、音階楽器は samples/<楽器>/<音名>.mp3 */
const files = [];
for (const [group, sets] of Object.entries(manifest)) {
  for (const [set, notes] of Object.entries(sets)) {
    for (const note of notes) {
      const rel = group === 'drums'
        ? path.join('samples', 'drums', set, note + '.mp3')
        : path.join('samples', set, note + '.mp3');
      files.push({ group, set: group === 'drums' ? 'drums/' + set : set, note, rel });
    }
  }
}

const ac = new OfflineAudioContext(1, 128, 48000);
let totSec = 0, totBytes = 0, totDisk = 0, maxCh = 1, failed = 0;
const durations = [];
const bySet = new Map();

for (const f of files) {
  const abs = path.join(ROOT, f.rel);
  if (!fs.existsSync(abs)) { failed++; continue; }
  const disk = fs.statSync(abs).size;
  let buf;
  try {
    buf = await ac.decodeAudioData(fs.readFileSync(abs).buffer.slice(0));
  } catch (e) { failed++; continue; }
  const bytes = buf.length * buf.numberOfChannels * 4;   // Float32
  totSec += buf.duration; totBytes += bytes; totDisk += disk;
  maxCh = Math.max(maxCh, buf.numberOfChannels);
  durations.push({ set: f.set, dur: buf.duration });
  const cur = bySet.get(f.set) || { n: 0, sec: 0, bytes: 0 };
  cur.n++; cur.sec += buf.duration; cur.bytes += bytes;
  bySet.set(f.set, cur);
}

const mb = (b) => (b / 1048576).toFixed(1);
console.log(`デコードできた音源     : ${files.length - failed} / ${files.length}${failed ? `（失敗 ${failed}）` : ''}`);
console.log(`ディスク上の合計       : ${mb(totDisk)} MB`);
console.log(`合計の再生時間         : ${totSec.toFixed(0)} 秒（${(totSec / 60).toFixed(1)} 分）`);
console.log(`最大チャンネル数       : ${maxCh}`);
console.log(`デコード後の常駐メモリ : ${mb(totBytes)} MB  ← ブラウザがずっと抱える量`);
console.log(`ふくらむ倍率           : ${(totBytes / totDisk).toFixed(1)} 倍`);

console.log('\n重い音源セット（上位15）');
const rank = [...bySet.entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 15);
rank.forEach(([set, v]) => {
  console.log(`  ${set.padEnd(20)} ${String(v.n).padStart(3)}本  ${v.sec.toFixed(0).padStart(4)}秒  ${mb(v.bytes).padStart(7)} MB`);
});

/* ---------------------------------------------------------------------
   対策の試算：頭から N 秒だけ残し、モノラルにまとめたらどうなるか。
   100BPM で全音符 ＝ 2.4 秒。カードの音符はそれより短いので、
   数秒あれば余韻まで足りる。単一楽器の録音なのでモノラルで困らない。 */
console.log('\n対策の試算（頭から N 秒だけ残す ＋ モノラル化）');
console.log('  N秒   残る再生時間      常駐メモリ    削減率');
for (const N of [2, 2.5, 3, 3.5, 4, 5, 6]) {
  let sec = 0;
  for (const d of durations) sec += Math.min(d.dur, N);
  const bytes = sec * 48000 * 1 * 4;                    // モノラル Float32
  console.log(`  ${String(N).padStart(4)}  ${sec.toFixed(0).padStart(6)} 秒  ${mb(bytes).padStart(9)} MB  ${(100 - bytes / totBytes * 100).toFixed(0).padStart(4)}%減`);
}

console.log('');
if (totBytes > 300 * 1048576) {
  console.log('⚠ 常駐メモリが 300MB を超えている。音声スレッドが締め切りに間に合わず、');
  console.log('  「プツプツ・ブツッ」と途切れる（音割れではなく音の欠落）主因になりうる。');
  process.exitCode = 1;
}
