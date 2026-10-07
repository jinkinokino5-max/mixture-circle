/* =====================================================================
   card-audition5.js — 「参考曲に近づける」試聴ツール・5周目
   ---------------------------------------------------------------------
   4周目までは抽象的な「雰囲気名」の組み合わせだったが、5周目は本人が挙げた
   具体的な参考曲・アーティストのうち、次の2グループに絞って作り込む。

     ①モータウン/ファンクのホーン（Jackson 5「Stand!」「I Want You Back」）
     ③ビートルズの幅（She Came in Through the Bathroom Window／
                     Octopus's Garden／The End／Real Love／
                     And Your Bird Can Sing）

   これまでの単純な「コード楽器1つ＋ベース1つ」ではなく、
   ・複数レイヤーを重ねた編成（ホーン2〜3管、ダブルギター、弦+ギター等）
   ・単純な根音+5度ではない、動きのあるベースライン（①はファンクベース）
   を入れて、より本物に近い質感で比較できるようにしてある。

   進行はこれまでと同じ定番進行（vi–IV–I–V／G）に固定。
   構成：編成5種×グルーヴ10種 を2グループ（① 50枚 ＋ ③ 50枚）＝100枚。
   ===================================================================== */

/* ============ 1. コード進行は1種類に固定 ============ */
const QUALITIES = {
  maj9: [0, 4, 7, 11, 14],
  m9:   [0, 3, 7, 10, 14],
  '6/9': [0, 4, 7, 9, 14],
  dom9: [0, 4, 7, 10, 14],
};
const FIXED_PROG = {
  name: '定番進行（vi–IV–I–V）／G（固定）',
  chords: [[4, 'm9'], [0, 'maj9'], [7, '6/9'], [2, 'dom9']],
};

/* ============ 2. ①モータウン/ファンクのホーン：編成5種 ============
   すべて土台にピアノのゴスペル・コンプ（pad）を敷き、ホーンの重ね方だけ変える。 */
const HORN_KEYS_BED = { voice: 'piano', oct: 3, style: 'pad' };
const HORN_ARRANGEMENTS = [
  { id: 'a1', label: 'トランペットのみ（ユニゾン）',       layers: [{ voice: 'trumpet', oct: 4, style: 'comp' }] },
  { id: 'a2', label: 'トランペット＋トロンボーン',          layers: [{ voice: 'trumpet', oct: 4, style: 'comp' }, { voice: 'trombone', oct: 3, style: 'comp' }] },
  { id: 'a3', label: 'トランペット＋サックス',              layers: [{ voice: 'trumpet', oct: 4, style: 'comp' }, { voice: 'saxophone', oct: 4, style: 'comp' }] },
  { id: 'a4', label: '3管ハーモニー（トランペット+トロンボーン+サックス）', layers: [{ voice: 'trumpet', oct: 4, style: 'comp' }, { voice: 'trombone', oct: 3, style: 'comp' }, { voice: 'saxophone', oct: 4, style: 'comp' }] },
  { id: 'a5', label: 'サックスのソロ',                      layers: [{ voice: 'saxophone', oct: 4, style: 'comp' }] },
];

/* ============ 3. ③ビートルズの幅：編成5種 ============ */
const BEATLES_ARRANGEMENTS = [
  { id: 'b1', label: 'ロック疾走（She Came In Through〜系）', layers: [{ voice: 'guitar-electric', oct: 3, style: 'comp' }, { voice: 'guitar-electric', oct: 4, style: 'comp' }] },
  { id: 'b2', label: '可愛い縁日（Octopus\'s Garden系）',      layers: [{ voice: 'xylophone', oct: 5, style: 'arp' }, { voice: 'guitar-acoustic', oct: 3, style: 'arp' }] },
  { id: 'b3', label: '壮大なオーケストラ（The End系）',         layers: [{ voice: 'violin', oct: 4, style: 'pad' }, { voice: 'cello', oct: 3, style: 'pad' }, { voice: 'trumpet', oct: 4, style: 'comp' }] },
  { id: 'b4', label: '静かなバラード（Real Love系）',           layers: [{ voice: 'piano', oct: 3, style: 'pad' }, { voice: 'violin', oct: 4, style: 'pad' }] },
  { id: 'b5', label: 'ジャングリー・ポップ（And Your Bird〜系）', layers: [{ voice: 'guitar-electric', oct: 4, style: 'arp' }, { voice: 'guitar-electric', oct: 3, style: 'arp' }] },
];

/* ============ 4. グルーヴ10種（①用） ============ */
const SOUL8_DRUMS   = [[0, 'k', .70], [8, 'k', .62], [4, 's', .70], [12, 's', .70], [4, 'c', .35], [12, 'c', .35],
                        [0, 'h', .22], [2, 'h', .14], [4, 'h', .20], [6, 'h', .14], [8, 'h', .22], [10, 'h', .14], [12, 'h', .20], [14, 'h', .14]];
const GHOST_FUNK     = [[0, 'k', .85], [6, 'k', .45], [10, 'k', .40], [4, 's', .55], [12, 's', .55], [7, 's', .12], [14, 's', .14],
                         [0, 'h', .16], [2, 'h', .09], [4, 'h', .13], [6, 'h', .09], [8, 'h', .15], [10, 'h', .09], [12, 'h', .13], [14, 'h', .10],
                         [1, 'h', .05], [3, 'h', .05], [5, 'h', .05], [7, 'h', .05], [9, 'h', .05], [11, 'h', .05], [13, 'h', .05], [15, 'h', .06]];
const TAMB_DENSE     = [[0, 'k', .68], [8, 'k', .60], [4, 's', .62], [12, 's', .62],
                         [0, 'c', .30], [2, 'c', .22], [4, 'c', .30], [6, 'c', .22], [8, 'c', .30], [10, 'c', .22], [12, 'c', .30], [14, 'c', .22],
                         [1, 'h', .10], [3, 'h', .10], [5, 'h', .10], [7, 'h', .10], [9, 'h', .10], [11, 'h', .10], [13, 'h', .10], [15, 'h', .10]];
const HORNSTAB_SYNC  = [[0, 'k', .75], [6, 'k', .55], [8, 'k', .70], [14, 'k', .55], [4, 's', .68], [12, 's', .68],
                         [0, 'h', .20], [4, 'h', .18], [8, 'h', .20], [12, 'h', .18]];
const GOSPEL_BACK    = [[0, 'k', .80], [6, 'k', .45], [8, 'k', .70], [4, 's', .55], [12, 's', .55],
                         [0, 'h', .18], [2, 'h', .10], [4, 'h', .16], [6, 'h', .10], [8, 'h', .18], [10, 'h', .10], [12, 'h', .16], [14, 'h', .10]];
const SOUL_FOUR      = [[0, 'k', .85], [4, 'k', .70], [8, 'k', .85], [12, 'k', .70], [4, 'c', .40], [12, 'c', .40],
                         [1, 'h', .16], [3, 'h', .16], [5, 'h', .16], [7, 'h', .16], [9, 'h', .16], [11, 'h', .16], [13, 'h', .16], [15, 'h', .16]];
const LAIDBACK_HALF  = [[0, 'k', .70], [10, 'k', .40], [8, 's', .60], [0, 'h', .16], [4, 'h', .12], [8, 'h', .16], [12, 'h', .12]];
const DOUBLE_HAT     = [[0, 'k', .70], [8, 'k', .62], [4, 's', .65], [12, 's', .65],
                         [0, 'h', .16], [1, 'h', .10], [2, 'h', .16], [3, 'h', .10], [4, 'h', .16], [5, 'h', .10], [6, 'h', .16], [7, 'h', .10],
                         [8, 'h', .16], [9, 'h', .10], [10, 'h', .16], [11, 'h', .10], [12, 'h', .16], [13, 'h', .10], [14, 'h', .16], [15, 'h', .10]];
const BREAKY_SPACE   = [[0, 'k', .78], [10, 'k', .40], [4, 's', .62], [0, 'h', .16], [8, 'h', .16]];
const SOUL_REVUE     = [[0, 'k', .90], [4, 'k', .75], [8, 'k', .90], [12, 'k', .75], [4, 'c', .48], [12, 'c', .48],
                         [2, 'h', .18], [6, 'h', .18], [10, 'h', .18], [14, 'h', .18]];

const HORN_GROOVES = [
  { id: 'g1',  label: 'モータウンの8ビート',     bpm: 112, swing: 0,    kit: 'acoustic-kit', pattern: SOUL8_DRUMS },
  { id: 'g2',  label: 'ゴーストノート・ファンク', bpm: 104, swing: 0,    kit: 'LINN',          pattern: GHOST_FUNK },
  { id: 'g3',  label: 'タンバリン強調',           bpm: 116, swing: 0,    kit: 'Kit3',          pattern: TAMB_DENSE },
  { id: 'g4',  label: 'ホーンとユニゾンのキメ',   bpm: 108, swing: 0,    kit: 'Kit8',          pattern: HORNSTAB_SYNC },
  { id: 'g5',  label: 'ゴスペルのバックビート',   bpm: 100, swing: 0.15, kit: 'Kit3',          pattern: GOSPEL_BACK },
  { id: 'g6',  label: '4つ打ち寄りのソウル',      bpm: 120, swing: 0,    kit: 'Kit8',          pattern: SOUL_FOUR },
  { id: 'g7',  label: 'レイドバックしたポケット', bpm: 96,  swing: 0.1,  kit: 'LINN',          pattern: LAIDBACK_HALF },
  { id: 'g8',  label: 'ダブルタイムのハイハット', bpm: 112, swing: 0,    kit: 'Kit3',          pattern: DOUBLE_HAT },
  { id: 'g9',  label: 'ブレイクの効いたグルーヴ', bpm: 104, swing: 0,    kit: 'acoustic-kit',  pattern: BREAKY_SPACE },
  { id: 'g10', label: 'アップテンポ・ソウルレビュー', bpm: 124, swing: 0, kit: 'Kit8',         pattern: SOUL_REVUE },
];

/* ============ 5. グルーヴ10種（③用） ============ */
const ROCK8_DRUMS    = [[0, 'k', .90], [3, 'k', .55], [8, 'k', .85], [11, 'k', .50], [4, 's', .72], [12, 's', .72],
                         [0, 'h', .22], [2, 'h', .15], [4, 'h', .20], [6, 'h', .15], [8, 'h', .22], [10, 'h', .15], [12, 'h', .20], [14, 'h', .16]];
const WALTZ_LILT      = [[0, 'k', .55], [8, 'k', .40], [4, 's', .38], [12, 's', .34], [0, 'h', .16], [6, 'h', .12], [8, 'h', .16], [14, 'h', .12]];
const CRESCENDO_BIG   = [[0, 'k', .95], [4, 'k', .82], [8, 'k', .95], [12, 'k', .82], [4, 'c', .50], [12, 'c', .50],
                          [1, 'h', .18], [3, 'h', .18], [5, 'h', .18], [7, 'h', .18], [9, 'h', .18], [11, 'h', .18], [13, 'h', .18], [15, 'h', .18]];
const BALLAD_BRUSH    = [[0, 'k', .40], [8, 'k', .32], [4, 's', .28], [12, 's', .26]];
const JANGLY16        = [[0, 'k', .68], [8, 'k', .60], [4, 's', .60], [12, 's', .60],
                          [0, 'h', .16], [1, 'h', .10], [2, 'h', .16], [3, 'h', .10], [4, 'h', .16], [5, 'h', .10], [6, 'h', .16], [7, 'h', .10],
                          [8, 'h', .16], [9, 'h', .10], [10, 'h', .16], [11, 'h', .10], [12, 'h', .16], [13, 'h', .10], [14, 'h', .16], [15, 'h', .10]];
const DRUM_SOLOISH    = [[0, 'k', .80], [8, 'k', .72], [4, 's', .60], [12, 's', .60],
                          [6, 't1', .40], [7, 't1', .30], [10, 't2', .45], [11, 't2', .35], [14, 't3', .50], [15, 't3', .40]];
const MID_ROCK        = [[0, 'k', .78], [8, 'k', .70], [4, 's', .65], [12, 's', .65],
                          [0, 'h', .18], [2, 'h', .12], [4, 'h', .18], [6, 'h', .12], [8, 'h', .18], [10, 'h', .12], [12, 'h', .18], [14, 'h', .12]];
const UPTEMPO_ROCK    = [[0, 'k', .92], [6, 'k', .55], [8, 'k', .90], [14, 'k', .55], [4, 's', .78], [12, 's', .78],
                          [0, 'h', .22], [2, 'h', .16], [4, 'h', .22], [6, 'h', .16], [8, 'h', .22], [10, 'h', .16], [12, 'h', .22], [14, 'h', .16]];
const QUIET_BRUSH     = [[0, 'k', .30], [8, 'k', .24], [4, 's', .20], [12, 's', .18]];
const DOUBLETIME_POP  = [[0, 'k', .88], [4, 'k', .68], [8, 'k', .88], [12, 'k', .68], [4, 'c', .44], [12, 'c', .44],
                          [1, 'h', .17], [3, 'h', .17], [5, 'h', .17], [7, 'h', .17], [9, 'h', .17], [11, 'h', .17], [13, 'h', .17], [15, 'h', .17]];

const BEATLES_GROOVES = [
  { id: 'g1',  label: 'ロックンロールの8ビート',   bpm: 128, swing: 0,    kit: 'Kit3',         pattern: ROCK8_DRUMS },
  { id: 'g2',  label: 'ワルツ寄りの跳ね',           bpm: 100, swing: 0.2,  kit: 'acoustic-kit', pattern: WALTZ_LILT },
  { id: 'g3',  label: '壮大なクレッシェンド用',     bpm: 100, swing: 0,    kit: 'Kit8',         pattern: CRESCENDO_BIG },
  { id: 'g4',  label: 'バラードのブラシ',           bpm: 72,  swing: 0,    kit: 'acoustic-kit', pattern: BALLAD_BRUSH },
  { id: 'g5',  label: 'ジャングリーな16分',         bpm: 124, swing: 0,    kit: 'Kit3',         pattern: JANGLY16 },
  { id: 'g6',  label: 'ドラムソロ風（フィル多め）', bpm: 112, swing: 0,    kit: 'acoustic-kit', pattern: DRUM_SOLOISH },
  { id: 'g7',  label: 'ミディアムロック',           bpm: 108, swing: 0,    kit: 'Kit8',         pattern: MID_ROCK },
  { id: 'g8',  label: 'アップテンポのロックンロール', bpm: 138, swing: 0,  kit: 'LINN',         pattern: UPTEMPO_ROCK },
  { id: 'g9',  label: '静かなブラシワーク',         bpm: 80,  swing: 0,    kit: 'acoustic-kit', pattern: QUIET_BRUSH },
  { id: 'g10', label: 'ダブルタイムのポップ',       bpm: 132, swing: 0,    kit: 'Kit3',         pattern: DOUBLETIME_POP },
];

const GAIN_DB = {
  piano: -6, harp: -7, xylophone: -11, 'guitar-acoustic': -7, 'guitar-electric': -8,
  'bass-electric': -4, contrabass: -5, cello: -6, violin: -8, trumpet: -9, trombone: -8, saxophone: -8,
};

/* ============ 6. 候補の生成（① 50 ＋ ③ 50 ＝ 100） ============ */
function generateCandidates5() {
  const out = [];
  HORN_ARRANGEMENTS.forEach(arr => {
    HORN_GROOVES.forEach(gr => {
      out.push({
        id: 'A-' + arr.id + '-' + gr.id,
        group: 'A',
        name: '① ' + arr.label + ' × ' + gr.label,
        layers: arr.layers, keysBed: HORN_KEYS_BED,
        bassVoice: 'bass-electric', bassOct: 2, bassPattern: 'funk',
        bpm: gr.bpm, swing: gr.swing, reverbSend: 0.35,
        drums: { kit: gr.kit, pattern: gr.pattern },
      });
    });
  });
  BEATLES_ARRANGEMENTS.forEach(arr => {
    BEATLES_GROOVES.forEach(gr => {
      out.push({
        id: 'B-' + arr.id + '-' + gr.id,
        group: 'B',
        name: '③ ' + arr.label + ' × ' + gr.label,
        layers: arr.layers, keysBed: null,
        bassVoice: (arr.id === 'b2' || arr.id === 'b4') ? 'cello' : 'bass-electric',
        bassOct: 2, bassPattern: 'simple',
        bpm: gr.bpm, swing: gr.swing, reverbSend: (arr.id === 'b3') ? 0.55 : (arr.id === 'b4' ? 0.55 : 0.35),
        drums: (arr.id === 'b4') ? null : { kit: gr.kit, pattern: gr.pattern },
      });
    });
  });
  return out;
}

/* ============ 6-a. samples.js の makeSampleKit が呼ぶ makeClap ============ */
function monoSafe(fn, tail = 0) {
  let last = -1;
  return (t, v) => {
    if (!(t > last)) return;
    last = t + tail;
    try { fn(t, v); } catch (e) {}
  };
}
function makeClap(dest) {
  const out = new Tone.Gain(1).connect(dest);
  const bp = new Tone.Filter({ type: 'bandpass', frequency: 1100, Q: 1.1 }).connect(out);
  const n = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.16, sustain: 0 },
  }).connect(bp);
  return {
    nodes: [n, bp, out],
    hit: monoSafe((t, v) => {
      n.triggerAttackRelease('32n', t, v * 0.55);
      n.triggerAttackRelease('32n', t + 0.011, v * 0.75);
      n.triggerAttackRelease('16n', t + 0.023, v);
    }, 0.023),
  };
}

/* ============ 7. 音の通り道 ============ */
const Bus = {};
const instruments = {};
const kits = {};
let currentLoop = null;
let currentCandidateId = null;

async function buildAudio() {
  Bus.limiter = new Tone.Limiter(-1).toDestination();
  Bus.master = new Tone.Gain(0.9).connect(Bus.limiter);
  Bus.reverb = new Tone.Reverb({ decay: 2.8, preDelay: 0.02, wet: 1 }).connect(Bus.master);
  try { await Bus.reverb.generate(); } catch (e) {}
  Bus.reverbSend = new Tone.Gain(0.4).connect(Bus.reverb);
}

const SAMPLE_INSTRUMENT_KEYS = ['piano', 'harp', 'xylophone', 'guitar-acoustic', 'guitar-electric',
  'bass-electric', 'contrabass', 'cello', 'violin', 'trumpet', 'trombone', 'saxophone'];

function buildInstruments() {
  SAMPLE_INSTRUMENT_KEYS.forEach(key => {
    const env = (VOICES[key] && VOICES[key].env) || { attack: 0.01, release: 0.8 };
    const node = makeSampleVoice(key, env);
    if (!node) { instruments[key] = null; return; }
    const outGain = new Tone.Gain(Tone.dbToGain(GAIN_DB[key] || -7)).connect(Bus.master);
    const sendGain = new Tone.Gain(0.26).connect(Bus.reverbSend);
    node.connect(outGain);
    node.connect(sendGain);
    instruments[key] = node;
  });
}

function getKit(name) {
  if (kits[name] !== undefined) return kits[name];
  const dest = new Tone.Gain(1).connect(Bus.master);
  const send = new Tone.Gain(0.12).connect(Bus.reverbSend);
  dest.connect(send);
  const k = makeSampleKit(dest, name, -8);
  kits[name] = k || null;
  return kits[name];
}

/* ============ 8. 分散和音の並び ============ */
function arpSequence(n) {
  const period = Math.max(1, 2 * (n - 1));
  const seq = [];
  for (let i = 0; i < 8; i++) {
    const p = i % period;
    seq.push(p < n ? p : period - p);
  }
  return seq;
}

/* ============ 9. レイヤー1つぶんを鳴らす ============ */
function playLayer(layer, root, intervals, time, stepDur) {
  const v = instruments[layer.voice];
  if (!v) return;
  const tr = layer.tr || 0;
  const notes = intervals.map(iv => noteName(root + iv + tr, layer.oct));
  if (layer.style === 'pad') {
    v.triggerAttackRelease(notes, '1m', time, 0.55);
  } else if (layer.style === 'arp') {
    arpSequence(intervals.length).forEach((idx, i) => {
      const note = noteName(root + intervals[idx] + tr, layer.oct);
      v.triggerAttackRelease(note, '8n', time + i * stepDur * 2, i % 2 === 0 ? 0.55 : 0.42);
    });
  } else if (layer.style === 'comp') {
    [6, 14].forEach(step => v.triggerAttackRelease(notes, '16n', time + step * stepDur, 0.62));
  }
}

/* ============ 10. ベースライン ============
   simple：根音＋5度（これまでと同じ）
   funk  ：オクターブ往復のファンクベース（James Jamerson 的な「動き」を模す）  */
function playBass(bassVoice, bassOct, pattern, root, time, stepDur) {
  const bv = instruments[bassVoice];
  if (!bv) return;
  if (pattern === 'funk') {
    [
      [0, 0, .85, '4n'], [3, 12, .42, '16n'], [6, 7, .48, '16n'],
      [8, 0, .82, '4n'], [11, 12, .38, '16n'], [14, 7, .52, '16n'],
    ].forEach(([step, iv, vel, len]) => {
      bv.triggerAttackRelease(noteName(root + iv, bassOct), len, time + step * stepDur, vel);
    });
  } else {
    bv.triggerAttackRelease(noteName(root, bassOct), '2n', time, 0.65);
    bv.triggerAttackRelease(noteName(root + 7, bassOct), '4n', time + 8 * stepDur, 0.45);
  }
}

/* ============ 11. 1小節ぶんを鳴らす ============ */
function playBar(cand, root, intervals, time) {
  const stepDur = Tone.Time('16n').toSeconds();

  if (cand.keysBed) playLayer(cand.keysBed, root, intervals, time, stepDur);
  cand.layers.forEach(layer => playLayer(layer, root, intervals, time, stepDur));
  if (cand.bassVoice) playBass(cand.bassVoice, cand.bassOct, cand.bassPattern, root, time, stepDur);

  if (cand.drums) {
    const kit = getKit(cand.drums.kit);
    if (kit) {
      cand.drums.pattern.forEach(([step, part, vel]) => {
        const fn = kit[part];
        if (fn) fn(time + step * stepDur, vel);
      });
    }
  }
}

/* ============ 12. 再生の開始・停止 ============ */
function stopCurrent() {
  try { Tone.Transport.stop(); Tone.Transport.cancel(0); } catch (e) {}
  if (currentLoop) { try { currentLoop.stop(0); currentLoop.dispose(); } catch (e) {} currentLoop = null; }
  Object.values(instruments).forEach(v => {
    if (!v) return;
    if (v.releaseAll) { try { v.releaseAll(); } catch (e) {} }
    else if (v.triggerRelease) { try { v.triggerRelease(); } catch (e) {} }
  });
  if (currentCandidateId) {
    const prev = document.querySelector(`.card[data-id="${currentCandidateId}"]`);
    if (prev) { prev.classList.remove('playing'); prev.querySelector('.playbtn').textContent = '▶ 再生'; }
  }
  currentCandidateId = null;
}

async function playCandidate(cand, cardEl) {
  await Tone.start();
  const already = currentCandidateId === cand.id;
  stopCurrent();
  if (already) return;

  Tone.Transport.bpm.value = cand.bpm;
  Tone.Transport.swing = cand.swing || 0;
  Tone.Transport.swingSubdivision = '8n';
  Bus.reverbSend.gain.rampTo(cand.reverbSend, 0.25);

  let bar = 0;
  currentLoop = new Tone.Loop((time) => {
    const [root, q] = FIXED_PROG.chords[bar % FIXED_PROG.chords.length];
    playBar(cand, root, QUALITIES[q], time);
    bar++;
  }, '1m').start(0);
  Tone.Transport.start();

  currentCandidateId = cand.id;
  cardEl.classList.add('playing');
  cardEl.querySelector('.playbtn').textContent = '■ 停止';
}

/* ============ 13. お気に入りの保存・書き出し ============ */
const FAV_KEY5 = 'stoneAppV5.cardAudition5.favorites';
function loadFavIds() {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY5) || '[]')); } catch (e) { return new Set(); }
}
function saveFavIds(set) {
  try { localStorage.setItem(FAV_KEY5, JSON.stringify([...set])); } catch (e) {}
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ============ 14. 画面の組み立て ============ */
let currentFilter = 'all';
function applyFilters() {
  const favOnly = document.getElementById('favonly').checked;
  document.querySelectorAll('.card').forEach(c => {
    const groupOk = currentFilter === 'all' || c.classList.contains('group' + currentFilter);
    const favOk = !favOnly || c.classList.contains('fav');
    c.style.display = (groupOk && favOk) ? '' : 'none';
  });
}

function renderGrid(candidates) {
  const grid = document.getElementById('grid');
  const favIds = loadFavIds();
  document.getElementById('totalcount').textContent = candidates.length;
  updateFavCount(favIds);

  candidates.forEach((cand, i) => {
    const card = document.createElement('div');
    card.className = 'card group' + cand.group;
    card.dataset.id = cand.id;
    if (favIds.has(cand.id)) card.classList.add('fav');
    card.innerHTML = `
      <div class="idx">#${String(i + 1).padStart(3, '0')} — ${cand.id}</div>
      <div class="moodname">${cand.name}</div>
      <div class="progname">${cand.bpm}BPM${cand.swing ? '・swing' : ''}${cand.drums ? '' : '・ドラムなし'}</div>
      <div class="row">
        <button class="playbtn">▶ 再生</button>
        <button class="favbtn" aria-pressed="${favIds.has(cand.id)}">★</button>
      </div>`;
    card.querySelector('.playbtn').addEventListener('click', () => playCandidate(cand, card));
    card.querySelector('.favbtn').addEventListener('click', () => {
      const favs = loadFavIds();
      const btn = card.querySelector('.favbtn');
      if (favs.has(cand.id)) { favs.delete(cand.id); btn.setAttribute('aria-pressed', 'false'); card.classList.remove('fav'); }
      else { favs.add(cand.id); btn.setAttribute('aria-pressed', 'true'); card.classList.add('fav'); }
      saveFavIds(favs);
      updateFavCount(favs);
    });
    grid.appendChild(card);
  });

  document.getElementById('favonly').addEventListener('change', applyFilters);
  document.querySelectorAll('.segbtn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.segbtn').forEach(b => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      currentFilter = btn.dataset.filter;
      applyFilters();
    });
  });

  document.getElementById('clearbtn').addEventListener('click', () => {
    if (!confirm('お気に入りをすべて解除します。よろしいですか？')) return;
    saveFavIds(new Set());
    document.querySelectorAll('.card').forEach(c => { c.classList.remove('fav'); c.querySelector('.favbtn').setAttribute('aria-pressed', 'false'); });
    updateFavCount(new Set());
    toast('お気に入りをリセットしました');
  });

  document.getElementById('stopbtn').addEventListener('click', stopCurrent);

  document.getElementById('exportbtn').addEventListener('click', () => {
    const favs = loadFavIds();
    if (!favs.size) { toast('お気に入りがまだありません'); return; }
    const picked = candidates.filter(c => favs.has(c.id)).map(c => ({
      id: c.id, group: c.group, name: c.name,
      layers: c.layers.map(l => ({ voice: l.voice, oct: l.oct, style: l.style })),
      keysBed: c.keysBed ? { voice: c.keysBed.voice, oct: c.keysBed.oct } : null,
      bassVoice: c.bassVoice, bassPattern: c.bassPattern,
      bpm: c.bpm, swing: c.swing || 0,
      drums: c.drums ? { kit: c.drums.kit } : null,
    }));
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), fixedProgression: FIXED_PROG.name, picked }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'card-audition5-favorites.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`${picked.length}件を書き出しました`);
  });
}

function updateFavCount(favs) { document.getElementById('favcount').textContent = favs.size; }

/* ============ 15. 起動 ============ */
window.addEventListener('DOMContentLoaded', async () => {
  const loadmsg = document.getElementById('loadmsg');
  const loadbar = document.querySelector('#loadbar > div');
  try {
    await buildAudio();
    const res = await preloadSamples((done, total) => {
      loadbar.style.width = total ? Math.round(done / total * 100) + '%' : '0%';
      loadmsg.textContent = `音源を読み込み中… ${done} / ${total}`;
    });
    buildInstruments();
    if (res.failed > 0) loadmsg.textContent = `読み込み完了（${res.failed}個は読み込めませんでした。音源を先にダウンロードしているか確認してください）`;
    document.getElementById('loadbox').style.display = 'none';
    document.getElementById('main').style.display = '';
    renderGrid(generateCandidates5());
  } catch (e) {
    loadmsg.textContent = '読み込みに失敗しました： ' + e.message;
    console.error(e);
  }
});
