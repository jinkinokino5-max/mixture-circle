/* =====================================================================
   card-audition8.js — 全身全霊で作った旋律・3曲だけ
   ---------------------------------------------------------------------
   6・7周目までは「1小節のパターンを4回繰り返し、和音だけが変わる」方式
   だったが、それでは本当の意味での“旋律の物語”にはならない。
   今回は逆に、4小節（Em9 → Cmaj9 → G6/9 → D9 ＝ vi–IV–I–V／G）を
   通しで1本の旋律として書いた。小節ごとに音を使い回さず、
   「入り方」「山（クライマックス）」「収まり方」を最初から設計している。

   3曲とも、和音の色（9th・6th）を意識した音選び、
   ため息のような跳躍、あえて空ける「間」を使って、
   ただ気持ちいいだけでなく“歌える”旋律を目指した。
   ===================================================================== */

/* ============ 1. コード進行（伴奏用） ============ */
const QUALITIES = {
  m9:   [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  '6/9': [0, 4, 7, 9, 14],
  dom9: [0, 4, 7, 10, 14],
};
const FIXED_PROG = {
  name: '定番進行（vi–IV–I–V）／G：Em9 → Cmaj9 → G6/9 → D9',
  chords: [[4, 'm9'], [0, 'maj9'], [7, '6/9'], [2, 'dom9']],
};

/* ============ 2. 伴奏は完全固定（ピアノパッド＋エレキベース＋ソフトドラム） ============ */
const KEYS_BED = { voice: 'piano', oct: 3 };
const BASS_VOICE = 'bass-electric';
const BASS_OCT = 2;
const SOFT_DRUMS = [
  [0, 'k', .42], [8, 'k', .36], [4, 's', .38], [12, 's', .38],
  [0, 'h', .12], [4, 'h', .09], [8, 'h', .12], [12, 'h', .09],
];
const FIXED_RHYTHM = { bpm: 78, swing: 0, kit: 'acoustic-kit', pattern: SOFT_DRUMS };

/* ============ 3. リード楽器も固定（フルート） ============ */
const LEAD_VOICE = 'flute';

/* ============ 4. 旋律3曲（4小節を通しで作曲） ============
   note = [step(0-15), noteName, vel, dur]
   phrase = [bar1の音, bar2の音, bar3の音, bar4の音]（コード進行と対応） */
const MELODIES = [
  {
    id: 'M1',
    label: '夕凪に浮かぶ旋律',
    desc: '静かに立ち上がり、3小節目のG（開放的な高いG5）で一度だけ大きく開ける。そこから4小節目で歌うように降りて、また最初のBへ滑らかに戻る。',
    phrase: [
      /* bar1: Em9 — 静かな入り、9th(F#)で色づけ */
      [[0,'B4',.5,'4n'],[4,'D5',.46,'8n'],[6,'E5',.55,'8n'],[8,'F#5',.58,'4n'],[12,'D5',.42,'8n'],[14,'B4',.4,'8n']],
      /* bar2: Cmaj9 — 一度落ち着き、E5への「ため息」の跳躍 */
      [[0,'C5',.5,'4n'],[4,'B4',.42,'8n'],[6,'A4',.45,'8n'],[8,'G4',.5,'4n'],[12,'E5',.5,'8n'],[14,'D5',.42,'8n']],
      /* bar3: G6/9 — 曲全体のクライマックス。オクターブ上のG5へ */
      [[0,'D5',.55,'4n'],[4,'E5',.5,'8n'],[6,'D5',.4,'16n'],[7,'C5',.38,'16n'],[8,'B4',.55,'4n'],[12,'G5',.66,'4n']],
      /* bar4: D9 — 歌うように降りて、次の1周へなめらかに接続 */
      [[0,'F#5',.55,'8n'],[2,'E5',.5,'8n'],[4,'D5',.46,'8n'],[8,'C5',.44,'8n'],[10,'B4',.4,'8n'],[12,'A4',.38,'4n']],
    ],
  },
  {
    id: 'M2',
    label: '光の階段',
    desc: '低いEから始まり、4小節かけて少しずつ高い場所へ。3小節目でB5に到達して長く伸ばし、4小節目でまた低いところへ静かに戻ってくる、大きな一つの弧。',
    phrase: [
      /* bar1: Em9 — 低く、静かな始まり */
      [[0,'E4',.46,'4n'],[4,'G4',.5,'8n'],[6,'B4',.52,'8n'],[8,'D5',.55,'4n'],[13,'E5',.4,'16n']],
      /* bar2: Cmaj9 — 少し息をつきながら上がる */
      [[0,'E5',.55,'4n'],[6,'D5',.42,'8n'],[8,'G5',.6,'4n'],[12,'E5',.45,'8n'],[14,'C5',.4,'8n']],
      /* bar3: G6/9 — 頂点。B5で長く伸ばして光を放つ */
      [[0,'D5',.5,'4n'],[4,'G5',.58,'8n'],[6,'A5',.6,'8n'],[8,'B5',.68,'2n']],
      /* bar4: D9 — 静かに舞い降りて、1周目のEへ帰る準備 */
      [[0,'A5',.48,'8n'],[2,'F#5',.46,'8n'],[4,'D5',.42,'8n'],[8,'C5',.4,'8n'],[10,'A4',.38,'8n'],[12,'F#4',.36,'4n']],
    ],
  },
  {
    id: 'M3',
    label: '静かな祈り',
    desc: '長い音とためらいがちな9th（掛留音）を中心にした、いちばん静かで親密な旋律。跳躍はほとんどせず、ゆっくり呼吸するように歌う。',
    phrase: [
      /* bar1: Em9 — 9th(F#)からrootへ、掛留の解決 */
      [[0,'F#4',.4,'4n'],[4,'E4',.46,'4n.'],[10,'G4',.38,'8n'],[12,'B4',.46,'4n']],
      /* bar2: Cmaj9 — 6thの色を通って、低く長い音へ */
      [[0,'A4',.38,'4n'],[6,'G4',.4,'8n'],[8,'E4',.44,'4n.'],[14,'C5',.38,'8n']],
      /* bar3: G6/9 — 9th(E5)を長く掛けてから、そっと解決 */
      [[0,'B4',.48,'4n'],[6,'A4',.4,'8n'],[8,'E5',.54,'4n.'],[14,'D5',.38,'16n']],
      /* bar4: D9 — b7から5thへ、長い静けさで終わり、また最初へ戻る */
      [[0,'C5',.46,'4n'],[6,'B4',.42,'8n'],[8,'A4',.4,'4n.']],
    ],
  },
];

/* ============ 5. 候補の生成（3枚だけ） ============ */
function generateCandidates8() {
  return MELODIES.map(m => ({ id: 'M-' + m.id, name: m.label, desc: m.desc, melody: m }));
}

/* ============ 5-a. samples.js の makeSampleKit が呼ぶ makeClap ============ */
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

/* ============ 6. 音の通り道 ============ */
const Bus = {};
const instruments = {};
let kit = null;
let currentLoop = null;
let currentCandidateId = null;

async function buildAudio() {
  Bus.limiter = new Tone.Limiter(-1).toDestination();
  Bus.master = new Tone.Gain(0.9).connect(Bus.limiter);
  Bus.reverb = new Tone.Reverb({ decay: 3.2, preDelay: 0.02, wet: 1 }).connect(Bus.master);
  try { await Bus.reverb.generate(); } catch (e) {}
  Bus.reverbSend = new Tone.Gain(0.36).connect(Bus.reverb);
}

const GAIN_DB = { flute: -6, piano: -9, 'bass-electric': -6 };
const SAMPLE_INSTRUMENT_KEYS = ['flute', 'piano', 'bass-electric'];

function buildInstruments() {
  SAMPLE_INSTRUMENT_KEYS.forEach(key => {
    const env = (VOICES[key] && VOICES[key].env) || { attack: 0.01, release: 0.8 };
    const node = makeSampleVoice(key, env);
    if (!node) { instruments[key] = null; return; }
    const outGain = new Tone.Gain(Tone.dbToGain(GAIN_DB[key] || -7)).connect(Bus.master);
    const sendGain = new Tone.Gain(0.28).connect(Bus.reverbSend);
    node.connect(outGain);
    node.connect(sendGain);
    instruments[key] = node;
  });
  const dest = new Tone.Gain(1).connect(Bus.master);
  const send = new Tone.Gain(0.08).connect(Bus.reverbSend);
  dest.connect(send);
  kit = makeSampleKit(dest, FIXED_RHYTHM.kit, -11) || null;
}

/* ============ 7. 伴奏（コードパッド・ベース・ドラム） ============ */
function playKeysBed(root, intervals, time) {
  const v = instruments[KEYS_BED.voice];
  if (!v) return;
  const notes = intervals.map(iv => noteName(root + iv, KEYS_BED.oct));
  v.triggerAttackRelease(notes, '1m', time, 0.32);
}
function playBass(root, time) {
  const bv = instruments[BASS_VOICE];
  if (!bv) return;
  bv.triggerAttackRelease(noteName(root, BASS_OCT), '2n', time, 0.55);
  bv.triggerAttackRelease(noteName(root + 7, BASS_OCT), '4n', time + 8 * Tone.Time('16n').toSeconds(), 0.36);
}
function playDrums(time, stepDur) {
  if (!kit) return;
  FIXED_RHYTHM.pattern.forEach(([step, part, vel]) => {
    const fn = kit[part];
    if (fn) fn(time + step * stepDur, vel);
  });
}

/* ============ 8. 旋律を鳴らす（4小節を通した1本のフレーズ） ============ */
function playMelodyBar(phraseBar, time, stepDur) {
  const v = instruments[LEAD_VOICE];
  if (!v) return;
  phraseBar.forEach(([step, note, vel, dur]) => {
    v.triggerAttackRelease(note, dur, time + step * stepDur, vel);
  });
}

/* ============ 9. 1小節ぶんを鳴らす ============ */
function playBar(cand, root, quality, barIndex, time) {
  const stepDur = Tone.Time('16n').toSeconds();
  playKeysBed(root, QUALITIES[quality], time);
  playBass(root, time);
  playDrums(time, stepDur);
  playMelodyBar(cand.melody.phrase[barIndex % 4], time, stepDur);
}

/* ============ 10. 再生の開始・停止 ============ */
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
  Bus.reverbSend.gain.rampTo(0.36, 0.2);

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

/* ============ 11. お気に入りの保存・書き出し ============ */
const FAV_KEY8 = 'stoneAppV5.cardAudition8.favorites';
function loadFavIds() {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY8) || '[]')); } catch (e) { return new Set(); }
}
function saveFavIds(set) {
  try { localStorage.setItem(FAV_KEY8, JSON.stringify([...set])); } catch (e) {}
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ============ 12. 画面の組み立て ============ */
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
      <div class="idx">#${String(i + 1).padStart(2, '0')} — ${cand.id}</div>
      <div class="moodname">${cand.name}</div>
      <div class="desc">${cand.desc}</div>
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
      id: c.id, label: c.name, desc: c.desc, phrase: c.melody.phrase,
    }));
    const blob = new Blob([JSON.stringify({
      exportedAt: new Date().toISOString(),
      fixedProgression: FIXED_PROG.name,
      fixedInstruments: { lead: LEAD_VOICE, keysBed: KEYS_BED.voice, bass: BASS_VOICE, kit: FIXED_RHYTHM.kit, bpm: FIXED_RHYTHM.bpm },
      picked,
    }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'card-audition8-favorites.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`${picked.length}件を書き出しました`);
  });
}

function updateFavCount(favs) { document.getElementById('favcount').textContent = favs.size; }

/* ============ 13. 起動 ============ */
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
    renderGrid(generateCandidates8());
  } catch (e) {
    loadmsg.textContent = '読み込みに失敗しました： ' + e.message;
    console.error(e);
  }
});
