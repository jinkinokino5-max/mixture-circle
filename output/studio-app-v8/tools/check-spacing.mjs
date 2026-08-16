/* =====================================================================
   tools/check-spacing.mjs — 同時に鳴る音が臨界帯域(ERB)の中に入って
   いないかを、全カード・全コード・全小節ぶん数え上げる（案1の検査）
   ---------------------------------------------------------------------
     node tools/check-spacing.mjs
   ---------------------------------------------------------------------
   2音が同じ臨界帯域に入ると、音程比とは無関係に必ず濁る（→ Huron 2001、
   reference/音の重ね方リサーチ.md §2）。ここでは実際に generateBar で
   音符を作り、resolveNotes で音名にし、同時に鳴る音の隣どうしの間隔が
   1 ERB を下回っている回数を数える。

   判定は3段階：
     濁り     … 間隔 < 1 ERB（同じ臨界帯域に入る）
     最悪     … 間隔が ERB の 30〜40%（Greenwood 1991 の最大不協和点）
     可       … 1 ERB 以上
   ===================================================================== */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { window: {}, console, Math };
vm.createContext(ctx);
const EXPORTS = ['CARDS', 'CARD_ORDER', 'ROLE_ORDER', 'PROGRESSIONS',
                 'resolveNotes', 'generateBar', 'INSTRUMENTS'];
vm.runInContext(fs.readFileSync(path.join(ROOT, 'music.js'), 'utf8')
  + '\n;(' + JSON.stringify(EXPORTS) + ').forEach(n => { globalThis[n] = eval(n); });', ctx);
const { CARDS, PROGRESSIONS, resolveNotes, generateBar } = ctx;

const PC = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const toMidi = n => { const m = /^([A-G]#?)(-?\d+)$/.exec(n); return m ? (+m[2] + 1) * 12 + PC[m[1]] : null; };
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const erb = f => 24.7 * (4.37 * f / 1000 + 1);

let muddy = 0, worst = 0, ok = 0;
const byCard = {};

for (const card of Object.values(CARDS)) {
  if (!card.shape || (card.shape.poly || 1) < 2) continue;
  for (const prog of Object.values(PROGRESSIONS)) {
    for (let bar = 0; bar < 8; bar++) {
      const chord = prog.bars[bar % prog.bars.length];
      const evs = generateBar(card, bar, 2, null, 1);
      for (const ev of evs) {
        const ms = resolveNotes(card.role, chord, ev, card.sound.oct, 0)
          .map(toMidi).filter(x => x != null).sort((a, b) => a - b);
        for (let i = 1; i < ms.length; i++) {
          const lo = hz(ms[i - 1]), gap = hz(ms[i]) - lo, w = erb(lo);
          const r = gap / w;
          if (r < 1) {
            muddy++;
            (byCard[card.id] = byCard[card.id] || { muddy: 0, all: 0 }).muddy++;
            if (r >= 0.30 && r <= 0.40) worst++;
          } else ok++;
          (byCard[card.id] = byCard[card.id] || { muddy: 0, all: 0 }).all++;
        }
      }
    }
  }
}

const total = muddy + ok;
console.log('【同時に鳴る音の間隔（poly 2以上のカードのみ）】');
console.log(`  調べた隣接ペア : ${total}`);
console.log(`  濁り（1 ERB 未満・同じ臨界帯域に入る）: ${muddy}  (${(muddy / total * 100).toFixed(1)}%)`);
console.log(`  うち最悪域（ERB の 30〜40%）           : ${worst}`);

const bad = Object.entries(byCard)
  .map(([id, v]) => ({ id, pct: v.muddy / v.all * 100 }))
  .filter(x => x.pct > 0).sort((a, b) => b.pct - a.pct);
if (bad.length) {
  console.log('\n【濁りが残っているカード】');
  bad.slice(0, 20).forEach(x => console.log(`  ${x.id.padEnd(22)} ${x.pct.toFixed(1)}%`));
  if (bad.length > 20) console.log(`  … ほか ${bad.length - 20} 枚`);
} else {
  console.log('\n濁り（同じ臨界帯域に入る同時音）は1件もありません。');
}
