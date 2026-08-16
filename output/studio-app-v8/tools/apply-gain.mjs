/* =====================================================================
   tools/apply-gain.mjs — 実測から「楽器の gain」を直す
   ---------------------------------------------------------------------
     node tools/measure-loudness.mjs   ← 先にこれで levels.json を作る
     node tools/apply-gain.mjs
   ---------------------------------------------------------------------
   音量の直し方は2段ある。役割が違うので混ぜないこと。

     apply-gain  … 楽器どうしをそろえる。music.js の sound.gain を書く
     apply-trim  … ひとつの楽器の変化1/2/3 をそろえる。variant.trim を書く

   ここは前者。薄い層（木琴・シェイカー・ボンゴ・ライド）だけは
   重ねる前提の層なので、意図的に基準より低いところを狙う。
   ---------------------------------------------------------------------
   v7.1 で基準の決め方を変えた（ここが今回いちばん大事な変更）。

   v7 までの基準は「その ROLE の中央値」だった。つまり
     ・メロディはメロディの中でそろう
     ・コードはコードの中でそろう
   までしか保証しておらず、**ROLE どうしの釣り合いは誰も見ていなかった**。
   結果、実測で

       BASS -24.4 ／ RHYTHM -26.8 ／ MELODY -29.2 ／ CHORD -37.2 (LUFS)

   まで開いていた。コードはリズムより 10dB 以上下＝重ねてもほぼ聞こえない。
   「ドラムばかり鳴って他が聞こえない」の正体はこれ。

   そこで基準を **絶対値（ROLE_TARGET）** にする。合奏したときの
   立ち位置を数字で決め打ちし、実測がそこへ来るまで gain を動かす。
     ・リズムを基準(0)に置く
     ・ベースはリズムとほぼ同じ（少しだけ下）
     ・メロディは「曲の顔」なので気持ち前
     ・コードは土台なので 3.5dB 後ろ。ただし“後ろ”であって“不在”ではない
   4役 1枚ずつのときの合計ラウドネスは変更前とほぼ同じ(-21.5 LUFS)なので、
   これは音量を上げる変更ではなく、**配分を組み替える**変更。
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

/* 重ねる前提の「薄い層」は主役より低いのが正しい。
   ただし v7 の -6dB はやり過ぎで、木琴・ボンゴ・ライドは
   単体で入れても存在が分からない状態だった（実測で ROLE 中央値 -6dB）。
   「重ねたとき濁らない」ために必要なのはせいぜい 3dB。            */
const THIN = new Set(['rhythm-xylo', 'rhythm-shaker', 'rhythm-bongo', 'rhythm-ride']);
const THIN_OFFSET = -3;

/* ---- 合奏したときの ROLE ごとの立ち位置（LUFS の絶対目標）--------------
   数字は「1枚だけ鳴らして measure-loudness.mjs で測ったときの値」。
   リズムを基準に、ベース -0.5 / メロディ +0.5 / コード -3.0。       */
const ROLE_TARGET = {
  rhythm: -28.0,   // 打楽器。出過ぎると他が聞こえなくなる
  bass:   -27.5,   // 足元
  melody: -25.5,   // 曲の「顔」。いちばん前に出す
  chord:  -30.0,   // 空間の土台。後ろだが、消えてはいけない
};
/* v7.2：メロディを +1.0、リズムを -1.0 動かした（旋律をもっと前へ、
   打楽器をもう少し引く）。ここは「較正の基準」なので、変えたら
   npm run balance を回して全120枚の gain を作り直すこと。
   その場ですぐ試したいだけなら、app.js の ROLE_TRIM_DB か
   画面の「音量（役割ごと）」のつまみを使うほうが早い。            */

/* 1回で動かす上限。行き過ぎて発散しないように */
const MAX_STEP = 8;

const byInst = {};
rows.forEach(r => { (byInst[r.inst] ||= []).push(r.lufs); });

const roleTarget = Object.assign({}, ROLE_TARGET);

let src = fs.readFileSync(MJS, 'utf8');
const log = [];
let maxMove = 0;

for (const [iid, inst] of Object.entries(INSTRUMENTS)) {
  const rk = iid.split('-')[0];
  const vals = (byInst[iid] || []).filter(isFinite);
  if (!vals.length) continue;

  const target = roleTarget[rk] + (THIN.has(iid) ? THIN_OFFSET : 0);
  let corr = target - med(vals);
  corr = Math.max(-MAX_STEP, Math.min(MAX_STEP, corr));
  if (Math.abs(corr) < 0.5) continue;

  const old = inst.sound.gain;
  const ng = Math.round((old + corr) * 2) / 2;          // 0.5dB 刻み

  /* 楽器キーの直後にある最初の gain: を書き換える。
     ---------------------------------------------------------------
     v7.1 修正：ここは単なる indexOf だった。ところが music.js には
     INSTRUMENTS より前に定位テーブル
         'melody-eguitar': { pan: -0.36 },
     があり、同じキー文字列が先に出てくる。そちらを掴んでしまうため、
     eguitar / nylon / flute / trumpet / trombone / aguitar / cutting /
     harmonium / harp / strings / pad / shaker / bongo の 13楽器は
     「gain が一致しない」と言って**ずっと無視されていた**。
     音量がそろわない楽器が残っていた直接の原因のひとつ。
     定位テーブルも行頭2スペース始まりなので、インデントだけでは足りない。
     INSTRUMENTS の定義開始位置から後ろだけを探す。                  */
  const key = `\n  '${iid}': {`;
  const at = src.indexOf(key, src.indexOf('const INSTRUMENTS = {'));
  if (at < 0) { log.push(`!! ${iid} が見つからない`); continue; }
  const end = src.indexOf("\n  '", at + 5);
  const seg = src.slice(at, end < 0 ? src.length : end);
  const m = /gain:\s*(-?[\d.]+)/.exec(seg);
  if (!m || Number(m[1]) !== old) { log.push(`!! ${iid} の gain が一致しない (${m && m[1]} vs ${old})`); continue; }

  src = src.slice(0, at) + seg.replace(/gain:\s*-?[\d.]+/, `gain: ${ng}`) + (end < 0 ? '' : src.slice(end));
  maxMove = Math.max(maxMove, Math.abs(corr));
  log.push(`  ${iid.padEnd(20)} ${String(old).padStart(6)} → ${String(ng).padStart(6)}  (${corr > 0 ? '+' : ''}${corr.toFixed(1)})`);
}

fs.writeFileSync(MJS, src, 'utf8');
console.log('ROLE 基準(LUFS): ' + Object.entries(roleTarget).map(([k, v]) => `${k} ${v.toFixed(1)}`).join('  '));
log.forEach(l => console.log(l));
console.log(`gain 更新 ${log.filter(l => !l.startsWith('!!')).length} 件 / 今回の最大移動量 ${maxMove.toFixed(1)}dB`);
