/* =====================================================================
   tools/apply-gain.mjs — 実測から「楽器の gain」を直す
   ---------------------------------------------------------------------
     node tools/measure-loudness.mjs   ← 先にこれで levels.json を作る
     node tools/apply-gain.mjs
   ---------------------------------------------------------------------
   音量の直し方は2段ある。役割が違うので混ぜないこと。

     apply-gain  … 楽器どうしをそろえる。music.js の sound.gain を書く
     apply-trim  … ひとつの楽器の変化1/2/3 をそろえる。variant.trim を書く

   ここは前者。ROLE ごとの基準値（＝その役割の主要カードの中央値）に
   各楽器を合わせる。薄い層（木琴・シェイカー・ボンゴ・ライド）だけは
   重ねる前提の層なので、意図的に基準より 6dB 低いところを狙う。
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

/* 重ねる前提の「薄い層」は主役より 6dB 低いのが正しい */
const THIN = new Set(['rhythm-xylo', 'rhythm-shaker', 'rhythm-bongo', 'rhythm-ride']);
const THIN_OFFSET = -6;
/* 1回で動かす上限。行き過ぎて発散しないように */
const MAX_STEP = 8;

const byInst = {};
rows.forEach(r => { (byInst[r.inst] ||= []).push(r.lufs); });

/* ROLE の基準は「薄い層を除いた」中央値 */
const roleTarget = {};
['melody', 'chord', 'bass', 'rhythm'].forEach(rk => {
  roleTarget[rk] = med(rows.filter(r => r.role === rk && !THIN.has(r.inst)).map(r => r.lufs));
});

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

  /* 楽器キーの直後にある最初の gain: を書き換える */
  const key = `'${iid}': {`;
  const at = src.indexOf(key);
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
