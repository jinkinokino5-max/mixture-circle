/* =====================================================================
   card-audition6.js — 「魅惑的な旋律」だけを聴き比べる試聴ツール・6周目
   ---------------------------------------------------------------------
   これまでは「和音」「楽器」「リズム」の組み合わせを変えてきたが、
   今回はメロディそのものを主役にする。
   楽器（リード＝フルート、伴奏＝ピアノパッド＋エレキベース＋ソフトドラム）は
   全カード共通で完全固定し、旋律パターン（音の並び・跳躍・間の使い方）だけを
   30種類変える。進行は今までと同じ定番進行（vi–IV–I–V／G）に固定。

   music.js の「梯子（lad）」の考え方を踏襲：
   旋律は「和音ごとの気持ちいい音を低い順に並べた梯子」の何番目を鳴らすか、
   という形で書く。こうすると同じ旋律の“形”が、和音が変わるたびに
   自然に違う響きに翻訳される。
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

/* ============ 2. 旋律用の梯子（和音ごとのスケール） ============
   m9   → ドリアン／maj9・6/9 → アイオニアン（メジャースケール）／dom9 → ミクソリディアン
   相対半音（コードのルートからの距離）。8個で1オクターブ強をカバーし、
   範囲外の番号は自動でオクターブを足して伸ばす（ladSemi）。               */
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

/* ============ 3. 伴奏は完全固定（ピアノパッド＋エレキベース＋ソフトドラム） ============ */
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

/* ============ 5. 旋律30種 ============
   note = [step(0-15), deg(梯子番号。負数や8以上もOK), vel, dur, chrom(半音の一時的な色付け・省略可)]
   perBarShift / shiftCycle があれば、小節が進むごとに degをずらす（シーケンス系）
   octShift があればオクターブをずらす（高音域フレーズ用）                            */
const MELODIES = [
  { id: 'n1',  label: '上行スケール',
    notes: [[0,0,.55,'8n'],[2,1,.55,'8n'],[4,2,.58,'8n'],[6,3,.58,'8n'],[8,4,.6,'8n'],[10,5,.6,'8n'],[12,6,.62,'8n'],[14,7,.65,'8n']] },
  { id: 'n2',  label: '下行スケール',
    notes: [[0,7,.62,'8n'],[2,6,.6,'8n'],[4,5,.58,'8n'],[6,4,.58,'8n'],[8,3,.55,'8n'],[10,2,.55,'8n'],[12,1,.52,'8n'],[14,0,.5,'8n']] },
  { id: 'n3',  label: '呼びかけと応答',
    notes: [[0,4,.65,'4n'],[8,2,.5,'8n'],[10,3,.52,'8n'],[12,4,.55,'8n']] },
  { id: 'n4',  label: '波のようなうねり',
    notes: [[0,0,.55,'8n'],[2,2,.55,'8n'],[4,4,.58,'8n'],[6,2,.5,'8n'],[8,4,.58,'8n'],[10,6,.6,'8n'],[12,4,.5,'8n'],[14,2,.5,'8n']] },
  { id: 'n5',  label: '跳躍モチーフ（6度）',
    notes: [[0,0,.6,'8n'],[2,5,.6,'8n'],[4,0,.55,'8n'],[6,5,.55,'8n'],[8,1,.6,'8n'],[10,6,.6,'8n'],[12,1,.55,'8n'],[14,6,.55,'8n']] },
  { id: 'n6',  label: '装飾音のターン',
    notes: [[0,4,.4,'16n'],[1,5,.4,'16n'],[2,4,.4,'16n'],[3,3,.5,'16n'],[4,4,.65,'4n'],
             [8,4,.4,'16n'],[9,5,.4,'16n'],[10,4,.4,'16n'],[11,3,.5,'16n'],[12,4,.65,'4n']] },
  { id: 'n7',  label: 'シンコペーションの刻み',
    notes: [[0,4,.6,'8n'],[3,4,.45,'16n'],[6,4,.55,'8n'],[9,4,.45,'16n'],[12,4,.6,'8n']] },
  { id: 'n8',  label: 'ロングトーンからの駆け上がり',
    notes: [[0,4,.6,'2n'],[10,4,.5,'16n'],[11,5,.5,'16n'],[12,6,.55,'16n'],[13,7,.55,'16n'],[14,8,.6,'16n'],[15,9,.62,'16n']] },
  { id: 'n9',  label: '反復モチーフ（移高）',
    notes: [[0,0,.55,'16n'],[1,2,.55,'16n'],[2,1,.55,'16n'],
             [6,2,.55,'16n'],[7,4,.55,'16n'],[8,3,.55,'16n'],
             [12,4,.58,'16n'],[13,6,.58,'16n'],[14,5,.58,'16n']] },
  { id: 'n10', label: '滝落ちのラン',
    notes: [[8,8,.55,'16n'],[9,7,.55,'16n'],[10,6,.55,'16n'],[11,5,.55,'16n'],[12,4,.55,'16n'],[13,3,.55,'16n'],[14,2,.55,'16n'],[15,1,.55,'16n']] },
  { id: 'n11', label: '経過音の半音アプローチ',
    notes: [[0,4,.6,'8n'],[2,4,.35,'16n',-1],[3,5,.55,'8n'],[6,5,.35,'16n',-1],[7,6,.55,'8n'],
             [10,3,.5,'8n'],[12,2,.35,'16n',1],[13,1,.55,'8n']] },
  { id: 'n12', label: '休符を活かした間',
    notes: [[0,4,.6,'4n'],[8,2,.52,'4n']] },
  { id: 'n13', label: '三連符風のうねり',
    notes: [[0,2,.55,'16n'],[3,4,.55,'16n'],[5,3,.55,'16n'],[8,5,.55,'16n'],[11,4,.55,'16n'],[13,6,.55,'16n']] },
  { id: 'n14', label: '上昇シーケンス（小節ごとに一段高く）',
    notes: [[0,0,.55,'8n'],[4,2,.58,'8n'],[8,4,.6,'8n']], perBarShift: 1, shiftCycle: 4 },
  { id: 'n15', label: '下降シーケンス（小節ごとに一段低く）',
    notes: [[0,6,.6,'8n'],[4,4,.58,'8n'],[8,2,.55,'8n']], perBarShift: -1, shiftCycle: 4 },
  { id: 'n16', label: '跳躍＋ステップ（コンパウンド旋律）',
    notes: [[0,6,.6,'8n'],[2,0,.45,'8n'],[4,7,.6,'8n'],[6,1,.45,'8n'],[8,6,.58,'8n'],[10,2,.45,'8n'],[12,7,.58,'8n'],[14,3,.45,'8n']] },
  { id: 'n17', label: '隣接音トリル',
    notes: [[0,4,.4,'16n'],[1,5,.5,'16n'],[2,4,.4,'16n'],[3,5,.5,'16n'],
             [8,2,.4,'16n'],[9,3,.5,'16n'],[10,2,.4,'16n'],[11,3,.5,'16n']] },
  { id: 'n18', label: 'ブルーノート的すり上げ',
    notes: [[0,2,.5,'16n',-1],[1,2,.62,'8n'],[4,4,.5,'16n',-1],[5,4,.62,'8n'],[8,4,.68,'4n']] },
  { id: 'n19', label: '静かな長い旋律線',
    notes: [[0,4,.5,'2n'],[8,6,.5,'2n']] },
  { id: 'n20', label: '弾むようなスタッカート',
    notes: [[1,2,.5,'16n'],[3,4,.5,'16n'],[5,3,.5,'16n'],[7,5,.5,'16n'],[9,4,.5,'16n'],[11,6,.5,'16n'],[13,5,.5,'16n'],[15,7,.5,'16n']] },
  { id: 'n21', label: '弧を描くフレーズ',
    notes: [[0,0,.55,'8n'],[2,2,.58,'8n'],[4,4,.6,'8n'],[6,6,.62,'8n'],[8,7,.65,'8n'],[10,5,.58,'8n'],[12,3,.55,'8n'],[14,1,.5,'8n']] },
  { id: 'n22', label: '反行（谷型）',
    notes: [[0,6,.6,'8n'],[2,4,.55,'8n'],[4,2,.5,'8n'],[6,0,.48,'8n'],[8,0,.5,'8n'],[10,2,.55,'8n'],[12,4,.58,'8n'],[14,6,.62,'8n']] },
  { id: 'n23', label: 'モチーフの拡大（引き伸ばし）',
    notes: [[0,0,.55,'4n'],[4,2,.58,'4n'],[8,1,.55,'4n']] },
  { id: 'n24', label: 'モチーフの縮小（倍速）',
    notes: [[0,0,.5,'16n'],[1,2,.5,'16n'],[2,1,.5,'16n'],[3,0,.5,'16n'],[4,2,.55,'16n'],[5,1,.55,'16n']] },
  { id: 'n25', label: '呼びかけの三音＋長い応答',
    notes: [[0,4,.6,'16n'],[1,5,.58,'16n'],[2,6,.62,'16n'],[6,3,.55,'2n']] },
  { id: 'n26', label: '頂点を先に置くフレーズ',
    notes: [[0,7,.68,'4n'],[6,6,.5,'16n'],[8,5,.5,'8n'],[9,4,.48,'16n'],[10,3,.48,'8n'],[11,2,.45,'16n'],[12,1,.45,'8n'],[13,0,.42,'16n']] },
  { id: 'n27', label: '螺旋状に広がる音型',
    notes: [[0,4,.55,'8n'],[2,3,.5,'8n'],[4,5,.58,'8n'],[6,2,.48,'8n'],[8,6,.6,'8n'],[10,1,.45,'8n'],[12,7,.62,'8n'],[14,0,.42,'8n']] },
  { id: 'n28', label: 'チェンジングノート（補助音）',
    notes: [[0,5,.5,'16n'],[1,3,.5,'16n'],[2,4,.6,'8n'],[6,7,.5,'16n'],[7,5,.5,'16n'],[8,6,.6,'8n']] },
  { id: 'n29', label: '高音域の煌めき',
    notes: [[0,4,.42,'16n'],[2,6,.45,'16n'],[4,5,.42,'16n'],[6,7,.45,'16n'],[8,4,.42,'16n'],[10,6,.45,'16n'],[12,5,.42,'16n'],[14,8,.48,'16n']],
    octShift: 1 },
  { id: 'n30', label: '低音域からの浮上',
    notes: [[0,-4,.5,'8n'],[2,-2,.5,'8n'],[4,0,.55,'8n'],[6,2,.55,'8n'],[8,4,.6,'8n'],[10,6,.65,'4n']] },
];

/* ============ 6. 候補の生成（30枚） ============ */
function generateCandidates6() {
  return MELODIES.map((m, i) => ({
    id: 'M-' + m.id,
    name: '#' + String(i + 1).padStart(2, '0') + ' ' + m.label,
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
const FAV_KEY6 = 'stoneAppV5.cardAudition6.favorites';
function loadFavIds() {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY6) || '[]')); } catch (e) { return new Set(); }
}
function saveFavIds(set) {
  try { localStorage.setItem(FAV_KEY6, JSON.stringify([...set])); } catch (e) {}
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ============ 13. 画面の組み立て ============ */
function applyFilters() {
  const favOnly = document.getElementById('favonly').checked;
  document.querySelectorAll('.card').forEach(c => {
    c.style.display = (!favOnly || c.classList.contains('fav')) ? '' : 'none';
  });
}

function renderGrid(candidates) {
  const grid = document.getElementById('grid');
  const favIds = loadFavIds();
  document.getElementById('totalcount').textContent = candidates.length;
  updateFavCount(favIds);

  candidates.forEach((cand, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = cand.id;
    if (favIds.has(cand.id)) card.classList.add('fav');
    card.innerHTML = `
      <div class="idx">#${String(i + 1).padStart(3, '0')} — ${cand.id}</div>
      <div class="moodname">${cand.name}</div>
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
      id: c.id, name: c.name,
      melodyId: c.melody.id, melodyLabel: c.melody.label,
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
    a.href = url; a.download = 'card-audition6-favorites.json';
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
    renderGrid(generateCandidates6());
  } catch (e) {
    loadmsg.textContent = '読み込みに失敗しました： ' + e.message;
    console.error(e);
  }
});
