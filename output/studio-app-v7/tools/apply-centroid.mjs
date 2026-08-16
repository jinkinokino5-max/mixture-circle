/* =====================================================================
   tools/apply-centroid.mjs — 実測した「明るさ」を music.js に書き込む
   ---------------------------------------------------------------------
     node tools/measure-loudness.mjs   ← 先にこれで levels.json を作る
     node tools/apply-centroid.mjs
   ---------------------------------------------------------------------
   音量の3兄弟（apply-gain / apply-trim）と同じ作り。こちらが書くのは
   sound.centroid（スペクトル重心 Hz、変化1/2/3 の中央値）。

   何に使うか：カードの提案スコア（案B）で
     「後から足す音は、すでに鳴っている音と同じかそれより下」
   という**方向のある非対称ルール**を回すため。上回った瞬間に blend が
   急落することが実験で示されている（Lembke & McAdams 2015）。
   → reference/音源と楽器リサーチ.md §3-2・優先度3

   値は「そのカードとして実際に鳴ったときの波形」から測っているので、
   楽器の素の音色だけでなく oct・hp・lp・案C まで入っている。
   ===================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MJS = path.join(ROOT, 'music.js');

const ctx = { window: {}, console, Math };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(MJS, 'utf8') + '\n;globalThis.INSTRUMENTS = INSTRUMENTS;', ctx);
const { INSTRUMENTS } = ctx;

const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'levels.json'), 'utf8'));
const med = a => { const b = [...a].sort((x, y) => x - y); const m = b.length >> 1;
                   return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };

let src = fs.readFileSync(MJS, 'utf8');
const log = [];

for (const [iid, inst] of Object.entries(INSTRUMENTS)) {
  const vals = rows.filter(r => r.inst === iid).map(r => r.centroid).filter(v => v > 0);
  if (!vals.length) { log.push(`!! ${iid} の実測値が levels.json に無い`); continue; }
  const hz = Math.round(med(vals));

  /* apply-gain.mjs と同じ探し方（music.js は INSTRUMENTS より前に
     同じキーの定位テーブルを持つので、そこから後ろだけを探す）      */
  const at = src.indexOf(`\n  '${iid}': {`, src.indexOf('const INSTRUMENTS = {'));
  if (at < 0) { log.push(`!! ${iid} が見つからない`); continue; }
  const end = src.indexOf("\n  '", at + 5);
  const seg = src.slice(at, end < 0 ? src.length : end);

  let next;
  if (/centroid:\s*\d+/.test(seg)) {
    next = seg.replace(/centroid:\s*\d+/, `centroid: ${hz}`);
  } else {
    /* gain: の直後に差し込む。sound の中で必ず1回だけ現れるので安全 */
    const m = /gain:\s*-?[\d.]+,/.exec(seg);
    if (!m) { log.push(`!! ${iid} の gain: が見つからない`); continue; }
    next = seg.slice(0, m.index + m[0].length) + ` centroid: ${hz},` + seg.slice(m.index + m[0].length);
  }
  src = src.slice(0, at) + next + (end < 0 ? '' : src.slice(end));
  log.push(`  ${iid.padEnd(20)} ${String(hz).padStart(5)} Hz`);
}

fs.writeFileSync(MJS, src, 'utf8');
const okCount = log.filter(l => !l.startsWith('!!')).length;
log.filter(l => l.startsWith('!!')).forEach(l => console.log(l));
console.log(`centroid（明るさ）を ${okCount} 楽器に書き込みました。`);
