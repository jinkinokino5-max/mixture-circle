/* =====================================================================
   card-audition7.js — 参考曲リストから旋律を作る試聴ツール・7周目
   ---------------------------------------------------------------------
   6周目と同じく「楽器は完全固定・旋律だけを変える」方式を継続。
   今回はユーザーが挙げた60曲超の参考曲・アーティストを、旋律の性格ごとに
   11クラスタへ整理し、各クラスタから2〜4種類、計30種類の新しい旋律を作った。
   （実在曲のメロディをそのまま引用してはいない。あくまで「跳躍の大きさ」
    「順次進行か跳躍か」「シンコペーションの位置」「半音の使い方」といった
    “性格”だけを抽出してオリジナルの旋律を書いている）

   クラスタ一覧：
     A. モータウン/ジャクソン5（Stand!／I Want You Back／ABC）
     B. マイケル・ジャクソンのポップフック（Beat It／Rock With You／Don't Stop）
     C. ビートルズ 抒情的・順次進行（Blackbird／Michelle／I Will／Something）
     D. ビートルズ 変則的・実験的（You Never Give Me Your Money／Good Morning／Free As A Bird）
     E. ディラン的な語りの旋律（Like a Rolling Stone／Mr. Tambourine Man／Positively 4th Street）
     F. ジャズ・クロマチック（Round Midnight／Desafinado／Getz）
     G. 大きなバラードの弧（My Way／Don't Worry Be Happy）
     H. ディスコ/ELO/Bee Gees（Stayin' Alive／Night Fever／Shine a Little Love）
     I. クイーンのアンセミックな跳躍（I Want to Break Free／Under Pressure）
     J. 序曲/シネマティック（William Tell Overture／Sonatine）
     K. 陽気で弾む旋律（Monkees／Happy）

   進行・伴奏・リード楽器は6周目と同じ設定で固定（比較しやすくするため）。
   ===================================================================== */

/* ============ 1. コード進行は1種類に固定（伴奏用の和音積み） ============ */
const QUALITIES = {
  m9:   [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  '6/9': [0, 4, 7, 9, 14],
  dom9: [0, 4, 7, 10, 14],
};
const FIXED_PROG = {
  name: '定番進行（vi–IV–I–V）／G（固定）',
  chords: [[4, 'm9'], [0, 'maj9'], [7, '6/9'], [2, 'dom9']],
};

/* ============ 2. 旋律用の梯子（和音ごとのスケール） ============ */
const LADDERS = {
  m9:    [0, 2, 3, 5, 7, 9, 10, 12],
  maj9:  [0, 2, 4, 5, 7, 9, 11, 12],
  '6/9': [0, 2, 4, 5, 7, 9, 11, 12],
  dom9:  [0, 2, 4, 5, 7, 9, 10, 12],
};
function ladSemi(quality, i) {
  const L = LADDERS[quality], n = L.length;
  const k = ((i % n) + n) % n;
  return L[k] + 12 * Math.floor(i / n);
}

/* ============ 3. 伴奏は完全固定（6周目と同じ） ============ */
const KEYS_BED = { voice: 'piano', oct: 3 };
const BASS_VOICE = 'bass-electric';
const BASS_OCT = 2;
const SOFT_DRUMS = [
  [0, 'k', .55], [8, 'k', .48], [4, 's', .50], [12, 's', .50],
  [0, 'h', .16], [4, 'h', .12], [8, 'h', .16], [12, 'h', .12],
];
const FIXED_RHYTHM = { bpm: 92, swing: 0, kit: 'acoustic-kit', pattern: SOFT_DRUMS };

/* ============ 4. リード楽器も完全固定（フルート） ============ */
const LEAD_VOICE = 'flute';
const LEAD_OCT = 5;

/* ============ 5. 旋律30種（11クラスタ） ============
   note = [step(0-15), deg(梯子番号), vel, dur, chrom(半音の一時的な色付け・省略可)] */
const MELODIES = [
  /* A. モータウン/ジャクソン5 */
  { id: 'A1', cluster: 'A. モータウン/ジャクソン5', label: 'はずむ呼びかけ（Stand!風）',
    notes: [[0,4,.65,'8n'],[2,6,.5,'16n'],[3,7,.6,'16n'],[6,4,.55,'8n'],[8,2,.5,'16n'],[9,4,.6,'8n'],[12,7,.68,'4n']] },
  { id: 'A2', cluster: 'A. モータウン/ジャクソン5', label: '掛け合いのユニゾン・フック（I Want You Back風）',
    notes: [[0,0,.6,'16n'],[1,4,.65,'8n'],[4,1,.55,'16n'],[5,5,.62,'8n'],[8,2,.58,'16n'],[9,6,.65,'8n'],[12,3,.5,'16n'],[13,7,.68,'4n']] },
  { id: 'A3', cluster: 'A. モータウン/ジャクソン5', label: 'スペルアウトの弾む16分（ABC風）',
    notes: [[0,0,.5,'16n'],[1,1,.5,'16n'],[2,2,.55,'16n'],[3,3,.55,'16n'],[4,4,.6,'8n'],[7,5,.5,'16n'],[8,6,.62,'8n'],[11,4,.5,'16n'],[12,7,.68,'4n']] },

  /* B. マイケル・ジャクソンのポップフック */
  { id: 'B1', cluster: 'B. MJポップフック', label: 'シンコペーションのリフ（Beat It風）',
    notes: [[0,0,.65,'8n'],[3,0,.5,'16n'],[4,3,.55,'8n'],[6,0,.5,'16n'],[9,-2,.5,'8n'],[12,0,.62,'8n'],[15,3,.45,'16n']] },
  { id: 'B2', cluster: 'B. MJポップフック', label: 'グルーヴ感あるオフビート（Rock With You風）',
    notes: [[1,2,.5,'16n'],[3,4,.55,'16n'],[4,2,.45,'16n'],[6,5,.55,'16n'],[9,4,.5,'16n'],[11,7,.6,'16n'],[13,5,.5,'16n'],[15,2,.45,'16n']] },
  { id: 'B3', cluster: 'B. MJポップフック', label: 'ファンキーな短いモチーフ反復（Don\'t Stop風）',
    notes: [[0,4,.6,'16n'],[1,4,.5,'16n'],[2,6,.55,'16n'],[5,5,.58,'16n'],[6,5,.5,'16n'],[7,7,.6,'16n'],[10,3,.55,'16n'],[11,3,.48,'16n'],[12,6,.62,'8n']] },

  /* C. ビートルズ 抒情的・順次進行 */
  { id: 'C1', cluster: 'C. ビートルズ（抒情的）', label: '静かな下行ライン（Blackbird風）',
    notes: [[0,7,.52,'8n'],[2,6,.5,'8n'],[4,5,.5,'8n'],[6,3,.48,'8n'],[8,4,.5,'8n'],[10,2,.48,'8n'],[11,3,.35,'16n'],[12,1,.55,'4n']] },
  { id: 'C2', cluster: 'C. ビートルズ（抒情的）', label: '順次進行の温かい旋律（Michelle風）',
    notes: [[0,4,.55,'8n'],[2,5,.55,'8n'],[4,6,.58,'8n'],[5,5,.4,'16n',-1],[6,4,.52,'8n'],[8,3,.5,'8n'],[10,2,.5,'8n'],[12,4,.58,'4n']] },
  { id: 'C3', cluster: 'C. ビートルズ（抒情的）', label: '願いを込めた上行フレーズ（I Will風）',
    notes: [[0,0,.5,'8n'],[2,2,.55,'8n'],[4,4,.6,'8n'],[6,5,.58,'16n'],[7,6,.6,'16n'],[8,7,.7,'2n']] },
  { id: 'C4', cluster: 'C. ビートルズ（抒情的）', label: '感情の高まる跳躍（Something風）',
    notes: [[0,2,.55,'4n'],[4,7,.68,'4n'],[7,6,.45,'16n'],[8,5,.5,'8n'],[10,3,.48,'8n'],[12,4,.55,'4n']] },

  /* D. ビートルズ 変則的・実験的 */
  { id: 'D1', cluster: 'D. ビートルズ（変則的）', label: '不規則なフレーズ長（You Never Give Me Your Money風）',
    notes: [[0,4,.6,'8n'],[3,2,.5,'16n'],[5,6,.58,'8n'],[7,1,.4,'16n'],[9,4,.5,'16n'],[10,7,.62,'8n'],[13,3,.45,'16n'],[14,5,.5,'8n']] },
  { id: 'D2', cluster: 'D. ビートルズ（変則的）', label: '角ばった跳躍（Good Morning Good Morning風）',
    notes: [[0,0,.6,'8n'],[2,6,.6,'8n'],[4,1,.55,'8n'],[6,7,.62,'8n'],[8,2,.55,'8n'],[10,5,.55,'8n'],[12,0,.5,'8n'],[14,6,.58,'8n']] },
  { id: 'D3', cluster: 'D. ビートルズ（変則的）', label: '漂うようなアウトロ風（Free As A Bird風）',
    notes: [[0,4,.42,'4n'],[4,6,.4,'4n'],[8,5,.45,'2n']] },

  /* E. ディラン的な語りの旋律 */
  { id: 'E1', cluster: 'E. ディラン的な語り', label: '同音連打の語り口（Like a Rolling Stone風）',
    notes: [[0,4,.55,'16n'],[2,4,.5,'16n'],[3,5,.4,'16n'],[4,4,.55,'16n'],[6,4,.5,'16n'],[8,4,.55,'16n'],[10,6,.6,'8n'],[12,4,.5,'8n'],[14,2,.48,'8n']] },
  { id: 'E2', cluster: 'E. ディラン的な語り', label: '淡々とした行進（Mr. Tambourine Man風）',
    notes: [[0,2,.5,'8n'],[2,3,.5,'8n'],[4,5,.52,'8n'],[6,3,.48,'8n'],[8,4,.55,'8n'],[10,6,.55,'8n'],[12,2,.5,'8n'],[14,4,.52,'8n']] },
  { id: 'E3', cluster: 'E. ディラン的な語り', label: '問いかけの反復（Positively 4th Street風）',
    notes: [[0,4,.5,'8n'],[2,6,.55,'8n'],[4,3,.45,'16n'],[6,4,.5,'8n'],[8,7,.6,'8n'],[10,5,.45,'16n'],[12,4,.5,'8n'],[14,8,.62,'4n']] },

  /* F. ジャズ・クロマチック */
  { id: 'F1', cluster: 'F. ジャズ・クロマチック', label: '半音でにじり寄る夜想（Round Midnight風）',
    notes: [[0,4,.55,'8n'],[2,4,.4,'16n',-1],[3,3,.5,'8n'],[6,3,.4,'16n',-1],[7,2,.5,'8n'],[9,1,.35,'16n'],[10,2,.4,'16n',1],[11,3,.5,'8n'],[14,4,.55,'4n']] },
  { id: 'F2', cluster: 'F. ジャズ・クロマチック', label: '外れた音で遊ぶ（Desafinado風）',
    notes: [[0,4,.5,'16n',1],[1,4,.55,'16n'],[3,2,.5,'16n',-1],[4,2,.55,'16n'],[7,6,.5,'16n',1],[8,6,.55,'16n'],[11,5,.5,'16n',-1],[12,5,.55,'16n'],[14,4,.6,'8n']] },
  { id: 'F3', cluster: 'F. ジャズ・クロマチック', label: 'ためを効かせたスウィング（Getz風）',
    notes: [[2,4,.55,'8n'],[5,6,.5,'8n'],[7,5,.4,'16n'],[9,4,.55,'8n'],[12,2,.5,'8n'],[14,3,.45,'16n']] },

  /* G. 大きなバラードの弧 */
  { id: 'G1', cluster: 'G. 大きなバラードの弧', label: 'サビへ駆け上がる大きな弧（My Way風）',
    notes: [[0,0,.5,'8n'],[2,2,.52,'8n'],[4,4,.56,'8n'],[5,5,.4,'16n'],[6,6,.6,'8n'],[8,8,.7,'2n']] },
  { id: 'G2', cluster: 'G. 大きなバラードの弧', label: '静かな語りから広がる（Don\'t Worry Be Happy風）',
    notes: [[0,4,.4,'4n'],[4,4,.42,'8n'],[5,3,.35,'16n'],[6,5,.45,'8n'],[8,6,.55,'4n'],[12,7,.6,'4n'],[14,5,.4,'8n']] },

  /* H. ディスコ/ELO/Bee Gees */
  { id: 'H1', cluster: 'H. ディスコ/ELO/Bee Gees', label: '16分の走るグルーヴ（Stayin\' Alive風）',
    notes: [[0,4,.5,'16n'],[1,4,.42,'16n'],[2,6,.52,'16n'],[3,5,.42,'16n'],[4,4,.5,'16n'],[5,7,.42,'16n'],[6,6,.52,'16n'],[7,5,.42,'16n'],
             [8,4,.5,'16n'],[9,8,.42,'16n'],[10,7,.52,'16n'],[11,6,.42,'16n'],[12,9,.55,'16n'],[13,8,.45,'16n'],[14,7,.5,'16n'],[15,6,.58,'16n']] },
  { id: 'H2', cluster: 'H. ディスコ/ELO/Bee Gees', label: '高音でキラキラ伸ばす（Night Fever風）',
    notes: [[0,4,.5,'8n'],[2,6,.55,'8n'],[4,7,.6,'4n'],[8,9,.62,'2n']], octShift: 1 },
  { id: 'H3', cluster: 'H. ディスコ/ELO/Bee Gees', label: '上昇するストリングス風ライン（Shine a Little Love風）',
    notes: [[0,0,.5,'8n'],[2,1,.5,'8n'],[4,2,.52,'8n'],[6,4,.55,'8n'],[8,3,.5,'16n'],[9,5,.58,'16n'],[10,6,.6,'8n'],[12,7,.65,'8n'],[14,9,.7,'8n']] },

  /* I. クイーンのアンセミックな跳躍 */
  { id: 'I1', cluster: 'I. クイーン（アンセミック）', label: '大きな跳躍で始まる決意（I Want to Break Free風）',
    notes: [[0,7,.68,'4n'],[4,0,.5,'8n'],[6,4,.55,'8n'],[8,7,.65,'4n'],[12,5,.5,'8n'],[14,2,.48,'8n']] },
  { id: 'I2', cluster: 'I. クイーン（アンセミック）', label: '分厚いユニゾンの上昇（Under Pressure風）',
    notes: [[0,0,.6,'8n'],[2,0,.55,'16n'],[3,3,.55,'16n'],[4,5,.6,'8n'],[8,2,.6,'8n'],[10,2,.55,'16n'],[11,5,.55,'16n'],[12,9,.68,'8n']] },

  /* J. 序曲/シネマティック */
  { id: 'J1', cluster: 'J. 序曲/シネマティック', label: '駆け抜けるファンファーレ（William Tell風）',
    notes: [[0,0,.55,'16n'],[1,2,.55,'16n'],[2,4,.6,'16n'],[3,6,.6,'16n'],[4,7,.68,'8n'],[8,2,.55,'16n'],[9,4,.55,'16n'],[10,6,.6,'16n'],[11,8,.6,'16n'],[12,9,.72,'4n']] },
  { id: 'J2', cluster: 'J. 序曲/シネマティック', label: '静と動のコントラスト（Sonatine風）',
    notes: [[0,4,.3,'8n'],[2,5,.28,'8n'],[4,4,.32,'4n'],[8,4,.65,'16n'],[9,6,.65,'16n'],[10,7,.68,'16n'],[11,5,.6,'16n'],[12,8,.62,'8n']] },

  /* K. 陽気で弾む旋律 */
  { id: 'K1', cluster: 'K. 陽気で弾む旋律', label: 'スキップするような跳ね（Monkees風）',
    notes: [[0,2,.55,'8n'],[2,4,.55,'16n'],[3,2,.5,'16n'],[5,5,.58,'16n'],[6,3,.5,'16n'],[8,2,.55,'8n'],[10,4,.55,'16n'],[11,6,.5,'16n'],[13,5,.5,'16n'],[14,7,.62,'8n']] },
  { id: 'K2', cluster: 'K. 陽気で弾む旋律', label: '満ち足りた笑顔のフレーズ（Happy風）',
    notes: [[0,4,.6,'8n'],[2,6,.58,'8n'],[4,8,.6,'8n'],[6,5,.5,'8n'],[8,4,.58,'8n'],[10,7,.65,'8n'],[12,9,.62,'8n'],[14,6,.55,'8n']] },
];

/* ============ 6. 候補の生成（30枚） ============ */
function generateCandidates7() {
  return MELODIES.map((m, i) => ({
    id: 'M-' + m.id,
    name: '#' + String(i + 1).padStart(2, '0') + ' [' + m.cluster + '] ' + m.label,
    melody: m,
  }));
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
let kit = null;
let currentLoop = null;
let currentCandidateId = null;

async function buildAudio() {
  Bus.limiter = new Tone.Limiter(-1).toDestination();
  Bus.master = new Tone.Gain(0.9).connect(Bus.limiter);
  Bus.reverb = new Tone.Reverb({ decay: 2.6, preDelay: 0.02, wet: 1 }).connect(Bus.master);
  try { await Bus.reverb.generate(); } catch (e) {}
  Bus.reverbSend = new Tone.Gain(0.32).connect(Bus.reverb);
}

const GAIN_DB = { flute: -6, piano: -8, 'bass-electric': -5 };
const SAMPLE_INSTRUMENT_KEYS = ['flute', 'piano', 'bass-electric'];

function buildInstruments() {
  SAMPLE_INSTRUMENT_KEYS.forEach(key => {
    const env = (VOICES[key] && VOICES[key].env) || { attack: 0.01, release: 0.8 };
    const node = makeSampleVoice(key, env);
    if (!node) { instruments[key] = null; return; }
    const outGain = new Tone.Gain(Tone.dbToGain(GAIN_DB[key] || -7)).connect(Bus.master);
    const sendGain = new Tone.Gain(0.24).connect(Bus.reverbSend);
    node.connect(outGain);
    node.connect(sendGain);
    instruments[key] = node;
  });
  const dest = new Tone.Gain(1).connect(Bus.master);
  const send = new Tone.Gain(0.1).connect(Bus.reverbSend);
  dest.connect(send);
  kit = makeSampleKit(dest, FIXED_RHYTHM.kit, -9) || null;
}

/* ============ 8. 伴奏（コードパッド・ベース・ドラム） ============ */
function playKeysBed(root, intervals, time) {
  const v = instruments[KEYS_BED.voice];
  if (!v) return;
  const notes = intervals.map(iv => noteName(root + iv, KEYS_BED.oct));
  v.triggerAttackRelease(notes, '1m', time, 0.4);
}
function playBass(root, time) {
  const bv = instruments[BASS_VOICE];
  if (!bv) return;
  bv.triggerAttackRelease(noteName(root, BASS_OCT), '2n', time, 0.6);
  bv.triggerAttackRelease(noteName(root + 7, BASS_OCT), '4n', time + 8 * Tone.Time('16n').toSeconds(), 0.4);
}
function playDrums(time, stepDur) {
  if (!kit) return;
  FIXED_RHYTHM.pattern.forEach(([step, part, vel]) => {
    const fn = kit[part];
    if (fn) fn(time + step * stepDur, vel);
  });
}

/* ============ 9. 旋律を鳴らす ============ */
function playMelody(melody, root, quality, barIndex, time, stepDur) {
  const v = instruments[LEAD_VOICE];
  if (!v) return;
  const oct = LEAD_OCT + (melody.octShift || 0);
  const shift = melody.perBarShift ? (barIndex % (melody.shiftCycle || 1)) * melody.perBarShift : 0;
  melody.notes.forEach(([step, deg, vel, dur, chrom]) => {
    const semi = root + ladSemi(quality, deg + shift) + (chrom || 0);
    const note = noteName(semi, oct);
    v.triggerAttackRelease(note, dur, time + step * stepDur, vel);
  });
}

/* ============ 10. 1小節ぶんを鳴らす ============ */
function playBar(cand, root, quality, barIndex, time) {
  const stepDur = Tone.Time('16n').toSeconds();
  playKeysBed(root, QUALITIES[quality], time);
  playBass(root, time);
  playDrums(time, stepDur);
  playMelody(cand.melody, root, quality, barIndex, time, stepDur);
}

/* ============ 11. 再生の開始・停止 ============ */
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

  Tone.Transport.bpm.value = FIXED_RHYTHM.bpm;
  Tone.Transport.swing = FIXED_RHYTHM.swing || 0;
  Tone.Transport.swingSubdivision = '8n';
  Bus.reverbSend.gain.rampTo(0.32, 0.2);

  let bar = 0;
  currentLoop = new Tone.Loop((time) => {
    const [root, q] = FIXED_PROG.chords[bar % FIXED_PROG.chords.length];
    playBar(cand, root, q, bar, time);
    bar++;
  }, '1m').start(0);
  Tone.Transport.start();

  currentCandidateId = cand.id;
  cardEl.classList.add('playing');
  cardEl.querySelector('.playbtn').textContent = '■ 停止';
}

/* ============ 12. お気に入りの保存・書き出し ============ */
const FAV_KEY7 = 'stoneAppV5.cardAudition7.favorites';
function loadFavIds() {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY7) || '[]')); } catch (e) { return new Set(); }
}
function saveFavIds(set) {
  try { localStorage.setItem(FAV_KEY7, JSON.stringify([...set])); } catch (e) {}
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ============ 13. 画面の組み立て ============ */
let currentFilter = 'all';
function applyFilters() {
  const favOnly = document.getElementById('favonly').checked;
  document.querySelectorAll('.card').forEach(c => {
    const clusterOk = currentFilter === 'all' || c.dataset.cluster === currentFilter;
    const favOk = !favOnly || c.classList.contains('fav');
    c.style.display = (clusterOk && favOk) ? '' : 'none';
  });
}

function renderGrid(candidates) {
  const grid = document.getElementById('grid');
  const favIds = loadFavIds();
  document.getElementById('totalcount').textContent = candidates.length;
  updateFavCount(favIds);

  const clusters = [...new Set(candidates.map(c => c.melody.cluster))];
  const filterBar = document.getElementById('filterbar');
  const allBtn = document.createElement('button');
  allBtn.className = 'segbtn'; allBtn.dataset.cluster = 'all'; allBtn.setAttribute('aria-pressed', 'true'); allBtn.textContent = 'すべて';
  filterBar.appendChild(allBtn);
  clusters.forEach(c => {
    const b = document.createElement('button');
    b.className = 'segbtn'; b.dataset.cluster = c; b.setAttribute('aria-pressed', 'false'); b.textContent = c;
    filterBar.appendChild(b);
  });
  filterBar.querySelectorAll('.segbtn').forEach(btn => {
    btn.addEventListener('click', () => {
      filterBar.querySelectorAll('.segbtn').forEach(b => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      currentFilter = btn.dataset.cluster;
      applyFilters();
    });
  });

  candidates.forEach((cand, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = cand.id;
    card.dataset.cluster = cand.melody.cluster;
    if (favIds.has(cand.id)) card.classList.add('fav');
    card.innerHTML = `
      <div class="idx">#${String(i + 1).padStart(3, '0')} — ${cand.id}</div>
      <div class="clustertag">${cand.melody.cluster}</div>
      <div class="moodname">${cand.melody.label}</div>
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
      id: c.id, cluster: c.melody.cluster, label: c.melody.label,
      notes: c.melody.notes,
      perBarShift: c.melody.perBarShift || 0, shiftCycle: c.melody.shiftCycle || 1,
      octShift: c.melody.octShift || 0,
    }));
    const blob = new Blob([JSON.stringify({
      exportedAt: new Date().toISOString(),
      fixedProgression: FIXED_PROG.name,
      fixedInstruments: { lead: LEAD_VOICE, keysBed: KEYS_BED.voice, bass: BASS_VOICE, kit: FIXED_RHYTHM.kit, bpm: FIXED_RHYTHM.bpm },
      picked,
    }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'card-audition7-favorites.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`${picked.length}件を書き出しました`);
  });
}

function updateFavCount(favs) { document.getElementById('favcount').textContent = favs.size; }

/* ============ 14. 起動 ============ */
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
    renderGrid(generateCandidates7());
  } catch (e) {
    loadmsg.textContent = '読み込みに失敗しました： ' + e.message;
    console.error(e);
  }
});
