/* =====================================================================
   card-audition.js — 「音楽カード」候補（コード進行×雰囲気）の試聴ツール
   ---------------------------------------------------------------------
   本体アプリ（app.js / engine.js / cards.js）はいっさい触らない。
   music.js の VOICES（楽器の音色設定）と samples.js の読み込み・音源生成
   だけを間借りして、本体とは別の簡易再生エンジンをここに書く。

   候補 = コード進行10種 × 雰囲気（編成）10種 = 100個。
   1個 = 「和声＋楽器＋テンポ＋グルーヴ」だけの短いスケッチ（4小節ループ）。
   ここでは PHRASES（性格×役割20枠のメロディ譜面）は作らない
   （聞き比べの母数を増やすのが目的なので、和音進行と雰囲気の当たりを
   先に絞り込み、良かったものだけ本体のWORLD/PHRASEに仕立てる）。
   ===================================================================== */

/* ============ 1. 和音の型（ルートからの半音） ============ */
const QUALITIES = {
  maj9:  [0, 4, 7, 11, 14],
  m9:    [0, 3, 7, 10, 14],
  '6/9': [0, 4, 7, 9, 14],
  dom9:  [0, 4, 7, 10, 14],
  m7:    [0, 3, 7, 10],
  maj7:  [0, 4, 7, 11],
  sus2:  [0, 2, 7, 14],
  add9:  [0, 4, 7, 14],
};

/* ============ 2. コード進行10種（ルート半音, 型） ============ */
const PROGRESSIONS = [
  { id: 'p1',  name: '定番進行（vi–IV–I–V）／G',        chords: [[4, 'm9'], [0, 'maj9'], [7, '6/9'], [2, 'dom9']] },
  { id: 'p2',  name: '王道進行（IV–V–iii–vi）／C',       chords: [[5, 'maj7'], [7, 'dom9'], [4, 'm7'], [9, 'm9']] },
  { id: 'p3',  name: 'I–V–vi–IV／D',                    chords: [[2, 'maj9'], [9, 'dom9'], [11, 'm9'], [7, 'maj7']] },
  { id: 'p4',  name: 'ii–V–I（ジャズ）／F',              chords: [[7, 'm7'], [0, 'dom9'], [5, 'maj9'], [5, 'maj9']] },
  { id: 'p5',  name: '50s進行（I–vi–IV–V）／C',          chords: [[0, 'maj9'], [9, 'm9'], [5, 'maj7'], [7, 'dom9']] },
  { id: 'p6',  name: 'マイナー循環（i–♭VII–♭VI–♭VII）／Am', chords: [[9, 'm9'], [7, '6/9'], [5, 'maj9'], [7, 'dom9']] },
  { id: 'p7',  name: 'マイナーポップ（i–iv–♭VII–♭III）／Em', chords: [[4, 'm9'], [9, 'm7'], [2, 'dom9'], [7, 'maj9']] },
  { id: 'p8',  name: '循環（I–IV–I–V）／C',              chords: [[0, 'add9'], [5, '6/9'], [0, 'add9'], [7, 'dom9']] },
  { id: 'p9',  name: 'サークル（vi–ii–V–I）／B♭',         chords: [[7, 'm9'], [0, 'm7'], [5, 'dom9'], [10, '6/9']] },
  { id: 'p10', name: '浮遊ヴァンプ（sus/add9）／A',        chords: [[9, 'sus2'], [2, 'add9'], [9, 'sus2'], [4, 'dom9']] },
];

/* ============ 3. 雰囲気（編成）10種 ============
   style: 'pad'（伸ばす和音）／'arp'（分散和音）／'comp'（裏拍で刻む）
   drums.pattern: [step(0-15), 'k'/'s'/'h'/'c', velocity] の配列          */
const SOFT_DRUMS  = [[0, 'k', .60], [8, 'k', .50], [0, 'h', .25], [2, 'h', .15], [4, 'h', .20], [6, 'h', .15], [8, 'h', .25], [10, 'h', .15], [12, 'h', .20], [14, 'h', .15]];
const FOUR_DRUMS  = [[0, 'k', .85], [4, 'k', .70], [8, 'k', .85], [12, 'k', .70], [4, 'c', .40], [12, 'c', .40],
                      [1, 'h', .16], [3, 'h', .16], [5, 'h', .16], [7, 'h', .16], [9, 'h', .16], [11, 'h', .16], [13, 'h', .16], [15, 'h', .16]];
const RIDE_DRUMS  = [[0, 'k', .30], [0, 'h', .18], [2, 'h', .14], [4, 'h', .18], [6, 'h', .14], [8, 'h', .18], [10, 'h', .14], [12, 'h', .18], [14, 'h', .14]];
const BOOM_DRUMS  = [[0, 'k', .75], [10, 'k', .50], [8, 's', .55], [0, 'h', .16], [4, 'h', .12], [8, 'h', .16], [12, 'h', .12]];
const GOSPEL_DRUMS = [[0, 'k', .80], [6, 'k', .45], [8, 'k', .70], [4, 's', .55], [12, 's', .55],
                       [0, 'h', .18], [2, 'h', .10], [4, 'h', .16], [6, 'h', .10], [8, 'h', .18], [10, 'h', .10], [12, 'h', .16], [14, 'h', .10]];

const MOODS = [
  { id: 'm1',  name: '夜のピアノ',       bpm: 70,  chordVoice: 'piano',            chordOct: 3, style: 'pad',  bassVoice: 'cello',            bassOct: 2, reverbSend: 0.55 },
  { id: 'm2',  name: 'アコギの朝',       bpm: 96,  chordVoice: 'guitar-acoustic',  chordOct: 3, style: 'arp',  bassVoice: 'contrabass',       bassOct: 2, reverbSend: 0.30, drums: { kit: 'acoustic-kit', pattern: SOFT_DRUMS } },
  { id: 'm3',  name: 'シティ夕方',       bpm: 112, chordVoice: 'guitar-electric',  chordOct: 3, style: 'comp', bassVoice: 'bass-electric',    bassOct: 2, reverbSend: 0.35, melodyVoice: 'xylophone', melodyOct: 5, drums: { kit: 'Kit8', pattern: FOUR_DRUMS } },
  { id: 'm4',  name: 'オルゴール',       bpm: 84,  chordVoice: 'harp',             chordOct: 4, style: 'arp',  reverbSend: 0.60, melodyVoice: 'xylophone', melodyOct: 5 },
  { id: 'm5',  name: 'ハープの瞑想',     bpm: 60,  chordVoice: 'harp',             chordOct: 3, style: 'pad',  bassVoice: 'cello',            bassOct: 2, reverbSend: 0.65 },
  { id: 'm6',  name: 'ジャズ夜想',       bpm: 120, swing: 0.30, chordVoice: 'piano', chordOct: 3, style: 'pad', bassVoice: 'contrabass',       bassOct: 2, reverbSend: 0.40, drums: { kit: 'acoustic-kit', pattern: RIDE_DRUMS } },
  { id: 'm7',  name: 'ローファイ午後',   bpm: 84,  swing: 0.15, chordVoice: 'harmonium', chordOct: 3, style: 'pad', bassVoice: 'bass-electric', bassOct: 2, reverbSend: 0.35, drums: { kit: 'CR78', pattern: BOOM_DRUMS } },
  { id: 'm8',  name: 'ゴスペル',         bpm: 88,  swing: 0.20, chordVoice: 'organ', chordOct: 3, style: 'pad', bassVoice: 'bass-electric',    bassOct: 2, reverbSend: 0.40, drums: { kit: 'Kit3', pattern: GOSPEL_DRUMS } },
  { id: 'm9',  name: 'オルガンの温もり', bpm: 66,  chordVoice: 'organ',            chordOct: 3, style: 'pad',  bassVoice: 'contrabass',       bassOct: 2, reverbSend: 0.55 },
  { id: 'm10', name: 'ナイロンの子守唄', bpm: 72,  chordVoice: 'guitar-nylon',     chordOct: 3, style: 'arp',  bassVoice: 'contrabass',       bassOct: 2, reverbSend: 0.50 },
];

const GAIN_DB = {
  piano: -6, organ: -8, harmonium: -9, harp: -7, xylophone: -11,
  'guitar-acoustic': -7, 'guitar-nylon': -8, 'guitar-electric': -8,
  'bass-electric': -4, contrabass: -5, cello: -6,
};

/* ============ 4. 候補の生成（10×10＝100） ============ */
function generateCandidates() {
  const out = [];
  MOODS.forEach(mood => {
    PROGRESSIONS.forEach(prog => {
      out.push({
        id: mood.id + '-' + prog.id,
        name: mood.name + ' × ' + prog.name,
        mood, prog,
      });
    });
  });
  return out;
}

/* ============ 4-a. samples.js の makeSampleKit が呼ぶ makeClap ============
   本体では engine.js にあるが、ここでは engine.js を読み込んでいないため、
   使う分だけ（クラップ音の合成）を移植する。中身は engine.js と同一。      */
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

/* ============ 5. 音の通り道（本体engine.jsとは別の簡易版） ============ */
const Bus = {};
const instruments = {};
const kits = {};
let currentLoop = null;
let currentCandidateId = null;

async function buildAudio() {
  Bus.limiter = new Tone.Limiter(-1).toDestination();
  Bus.master = new Tone.Gain(0.9).connect(Bus.limiter);
  Bus.reverb = new Tone.Reverb({ decay: 3.0, preDelay: 0.02, wet: 1 }).connect(Bus.master);
  try { await Bus.reverb.generate(); } catch (e) { /* 失敗しても音は出る */ }
  Bus.reverbSend = new Tone.Gain(0.4).connect(Bus.reverb);
}

const INSTRUMENT_KEYS = ['piano', 'organ', 'harmonium', 'harp', 'xylophone',
  'guitar-acoustic', 'guitar-nylon', 'guitar-electric', 'bass-electric', 'contrabass', 'cello'];

function buildInstruments() {
  INSTRUMENT_KEYS.forEach(key => {
    const env = (VOICES[key] && VOICES[key].env) || { attack: 0.01, release: 0.8 };
    const node = makeSampleVoice(key, env);
    if (!node) { instruments[key] = null; return; }
    const outGain = new Tone.Gain(Tone.dbToGain(GAIN_DB[key] || -7)).connect(Bus.master);
    const sendGain = new Tone.Gain(0.28).connect(Bus.reverbSend);
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

/* ============ 6. 分散和音の並び（山型：上がって降りる） ============ */
function arpSequence(n) {
  const period = Math.max(1, 2 * (n - 1));
  const seq = [];
  for (let i = 0; i < 8; i++) {
    const p = i % period;
    seq.push(p < n ? p : period - p);
  }
  return seq;
}

/* ============ 7. 1小節ぶんを鳴らす ============ */
function playBar(mood, root, intervals, time) {
  const stepDur = Tone.Time('16n').toSeconds();

  if (mood.chordVoice && instruments[mood.chordVoice]) {
    const v = instruments[mood.chordVoice];
    const notes = intervals.map(iv => noteName(root + iv, mood.chordOct));
    if (mood.style === 'pad') {
      v.triggerAttackRelease(notes, '1m', time, 0.55);
    } else if (mood.style === 'arp') {
      arpSequence(intervals.length).forEach((idx, i) => {
        const note = noteName(root + intervals[idx], mood.chordOct);
        v.triggerAttackRelease(note, '8n', time + i * stepDur * 2, i % 2 === 0 ? 0.55 : 0.42);
      });
    } else if (mood.style === 'comp') {
      [6, 14].forEach(step => v.triggerAttackRelease(notes, '16n', time + step * stepDur, 0.6));
    }
  }

  if (mood.bassVoice && instruments[mood.bassVoice]) {
    const bv = instruments[mood.bassVoice];
    bv.triggerAttackRelease(noteName(root, mood.bassOct), '2n', time, 0.65);
    bv.triggerAttackRelease(noteName(root + 7, mood.bassOct), '4n', time + 8 * stepDur, 0.45);
  }

  if (mood.melodyVoice && instruments[mood.melodyVoice]) {
    const mv = instruments[mood.melodyVoice];
    const topIv = intervals[intervals.length - 1];
    mv.triggerAttackRelease(noteName(root + topIv, mood.melodyOct), '8n', time + 12 * stepDur, 0.4);
  }

  if (mood.drums) {
    const kit = getKit(mood.drums.kit);
    if (kit) {
      mood.drums.pattern.forEach(([step, part, vel]) => {
        const fn = kit[part];
        if (fn) fn(time + step * stepDur, vel);
      });
    }
  }
}

/* ============ 8. 再生の開始・停止 ============ */
function stopCurrent() {
  try { Tone.Transport.stop(); Tone.Transport.cancel(0); } catch (e) {}
  if (currentLoop) { try { currentLoop.stop(0); currentLoop.dispose(); } catch (e) {} currentLoop = null; }
  Object.values(instruments).forEach(v => { if (v && v.releaseAll) { try { v.releaseAll(); } catch (e) {} } });
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
  if (already) return;   // 同じカードをもう一度押したら停止だけして終わる

  const mood = cand.mood, prog = cand.prog;
  Tone.Transport.bpm.value = mood.bpm;
  Tone.Transport.swing = mood.swing || 0;
  Tone.Transport.swingSubdivision = '8n';
  Bus.reverbSend.gain.rampTo(mood.reverbSend, 0.25);

  let bar = 0;
  currentLoop = new Tone.Loop((time) => {
    const [root, q] = prog.chords[bar % prog.chords.length];
    playBar(mood, root, QUALITIES[q], time);
    bar++;
  }, '1m').start(0);
  Tone.Transport.start();

  currentCandidateId = cand.id;
  cardEl.classList.add('playing');
  cardEl.querySelector('.playbtn').textContent = '■ 停止';
}

/* ============ 9. お気に入りの保存・書き出し ============ */
const FAV_KEY = 'stoneAppV5.cardAudition.favorites';
function loadFavIds() {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch (e) { return new Set(); }
}
function saveFavIds(set) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...set])); } catch (e) {}
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ============ 10. 画面の組み立て ============ */
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
      <div class="moodname">${cand.mood.name}</div>
      <div class="progname">${cand.prog.name}</div>
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

  document.getElementById('favonly').addEventListener('change', (e) => {
    document.querySelectorAll('.card').forEach(c => {
      c.style.display = (!e.target.checked || c.classList.contains('fav')) ? '' : 'none';
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
      id: c.id, name: c.name,
      mood: { id: c.mood.id, name: c.mood.name, bpm: c.mood.bpm, swing: c.mood.swing || 0,
              chordVoice: c.mood.chordVoice, style: c.mood.style, bassVoice: c.mood.bassVoice || null,
              melodyVoice: c.mood.melodyVoice || null, reverbSend: c.mood.reverbSend,
              drums: c.mood.drums ? { kit: c.mood.drums.kit } : null },
      prog: { id: c.prog.id, name: c.prog.name, chords: c.prog.chords },
    }));
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), picked }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'card-audition-favorites.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`${picked.length}件を書き出しました`);
  });
}

function updateFavCount(favs) { document.getElementById('favcount').textContent = favs.size; }

/* ============ 11. 起動 ============ */
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
    renderGrid(generateCandidates());
  } catch (e) {
    loadmsg.textContent = '読み込みに失敗しました： ' + e.message;
    console.error(e);
  }
});
