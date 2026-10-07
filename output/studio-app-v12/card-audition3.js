/* =====================================================================
   card-audition3.js — 「楽器の組み合わせ × リズム感」試聴ツール・3周目
   ---------------------------------------------------------------------
   1周目（card-audition.js）のお気に入りを見ると、コード進行を10種類変えても
   ★の付き方はほぼ変わらず、「シティ夕方」「ジャズ夜想」「ローファイ午後」の
   3つの雰囲気だけが進行に関係なく総取りされていた。
   → 判断の軸は和声ではなく「楽器の組み合わせ」と「リズム感」だった。

   そこでこの3周目は、コード進行を定番進行（vi–IV–I–V／G）1種類に固定し、
   「楽器パレット（TIMBRES）10種」×「リズム感（RHYTHMS）10種」＝100通りだけを
   比較できるようにする。TIMBRESには前回好評だった3つ（シティ夕方／
   ジャズ夜想／ローファイ午後）と、2周目で好評だった「ビッグバンドのホーン」を
   そのまま含めてある。RHYTHMSにはビッグバンドのスウィング感も新設した。
   ===================================================================== */

/* ============ 1. コード進行は1種類に固定（1周目の定番進行と同じ） ============ */
const QUALITIES = {
  maj9: [0, 4, 7, 11, 14],
  m9:   [0, 3, 7, 10, 14],
  '6/9': [0, 4, 7, 9, 14],
  dom9: [0, 4, 7, 10, 14],
};
const FIXED_PROG = {
  id: 'fixed', name: '定番進行（vi–IV–I–V）／G（固定）',
  chords: [[4, 'm9'], [0, 'maj9'], [7, '6/9'], [2, 'dom9']],
};

/* ============ 2. 楽器パレット10種（TIMBRES） ============
   style: 'pad'（伸ばす和音）／'arp'（分散和音）／'comp'（裏拍で刻む）      */
const TIMBRES = [
  { id: 't1',  name: '夜のピアノ',         chordVoice: 'piano',           chordOct: 3, style: 'pad',  bassVoice: 'cello',         bassOct: 2, reverbSend: 0.55 },
  { id: 't2',  name: 'シティ夕方',         chordVoice: 'guitar-electric', chordOct: 3, style: 'comp', bassVoice: 'bass-electric', bassOct: 2, reverbSend: 0.35, melodyVoice: 'xylophone', melodyOct: 5 },
  { id: 't3',  name: 'ハープの瞑想',       chordVoice: 'harp',            chordOct: 3, style: 'pad',  bassVoice: 'cello',         bassOct: 2, reverbSend: 0.65 },
  { id: 't4',  name: 'ジャズ夜想',         chordVoice: 'piano',           chordOct: 3, style: 'pad',  bassVoice: 'contrabass',    bassOct: 2, reverbSend: 0.40 },
  { id: 't5',  name: 'ローファイ午後',     chordVoice: 'harmonium',       chordOct: 3, style: 'pad',  bassVoice: 'bass-electric', bassOct: 2, reverbSend: 0.35 },
  { id: 't6',  name: 'アコギの朝',         chordVoice: 'guitar-acoustic', chordOct: 3, style: 'arp',  bassVoice: 'contrabass',    bassOct: 2, reverbSend: 0.30 },
  { id: 't7',  name: 'オルガンの温もり',   chordVoice: 'organ',           chordOct: 3, style: 'pad',  bassVoice: 'contrabass',    bassOct: 2, reverbSend: 0.55 },
  { id: 't8',  name: 'ビッグバンドのホーン', chordVoice: 'trumpet',       chordOct: 4, style: 'comp', bassVoice: 'bass-electric', bassOct: 2, reverbSend: 0.35 },
  { id: 't9',  name: '弦楽四重奏風',       chordVoice: 'violin',          chordOct: 4, style: 'pad',  bassVoice: 'cello',         bassOct: 2, reverbSend: 0.50 },
  { id: 't10', name: 'シンセパッドの宇宙', chordVoice: 'synth-pad',       chordOct: 3, style: 'pad',  bassVoice: 'synth-bass',    bassOct: 2, reverbSend: 0.60 },
];

/* ============ 3. リズム感10種（RHYTHMS） ============
   drums.pattern: [step(0-15), 'k'/'s'/'h'/'c', velocity] の配列          */
const SOFT_DRUMS   = [[0, 'k', .60], [8, 'k', .50], [0, 'h', .25], [2, 'h', .15], [4, 'h', .20], [6, 'h', .15], [8, 'h', .25], [10, 'h', .15], [12, 'h', .20], [14, 'h', .15]];
const FOUR_DRUMS   = [[0, 'k', .85], [4, 'k', .70], [8, 'k', .85], [12, 'k', .70], [4, 'c', .40], [12, 'c', .40],
                       [1, 'h', .16], [3, 'h', .16], [5, 'h', .16], [7, 'h', .16], [9, 'h', .16], [11, 'h', .16], [13, 'h', .16], [15, 'h', .16]];
const RIDE_DRUMS   = [[0, 'k', .30], [0, 'h', .18], [2, 'h', .14], [4, 'h', .18], [6, 'h', .14], [8, 'h', .18], [10, 'h', .14], [12, 'h', .18], [14, 'h', .14]];
const BOOM_DRUMS   = [[0, 'k', .75], [10, 'k', .50], [8, 's', .55], [0, 'h', .16], [4, 'h', .12], [8, 'h', .16], [12, 'h', .12]];
const GOSPEL_DRUMS = [[0, 'k', .80], [6, 'k', .45], [8, 'k', .70], [4, 's', .55], [12, 's', .55],
                       [0, 'h', .18], [2, 'h', .10], [4, 'h', .16], [6, 'h', .10], [8, 'h', .18], [10, 'h', .10], [12, 'h', .16], [14, 'h', .10]];
const FUNK_DRUMS   = [[0, 'k', .85], [6, 'k', .45], [10, 'k', .40], [4, 's', .55], [12, 's', .55], [7, 's', .12], [14, 's', .14],
                       [0, 'h', .16], [2, 'h', .09], [4, 'h', .13], [6, 'h', .09], [8, 'h', .15], [10, 'h', .09], [12, 'h', .13], [14, 'h', .10],
                       [1, 'h', .05], [3, 'h', .05], [5, 'h', .05], [7, 'h', .05], [9, 'h', .05], [11, 'h', .05], [13, 'h', .05], [15, 'h', .06]];
const TECHNO_DRUMS = [[0, 'k', .90], [4, 'k', .78], [8, 'k', .90], [12, 'k', .78], [4, 'c', .45], [12, 'c', .45],
                       [2, 'h', .18], [6, 'h', .18], [10, 'h', .18], [14, 'h', .18]];
const ONEDROP_DRUMS = [[8, 'k', .85], [8, 's', .50], [2, 'h', .16], [6, 'h', .16], [10, 'h', .16], [14, 'h', .16]];
const BIGBAND_DRUMS = [[0, 'k', .80], [6, 'k', .45], [8, 'k', .78], [4, 's', .60], [12, 's', .60],
                        [0, 'h', .18], [3, 'h', .14], [6, 'h', .18], [9, 'h', .14], [12, 'h', .18], [15, 'h', .14]];

const RHYTHMS = [
  { id: 'r1',  name: 'ドラムなし・自由',       bpm: 70,  swing: 0,    drums: null },
  { id: 'r2',  name: 'ソフトな8ビート',        bpm: 96,  swing: 0,    drums: { kit: 'acoustic-kit', pattern: SOFT_DRUMS } },
  { id: 'r3',  name: '四つ打ち',               bpm: 112, swing: 0,    drums: { kit: 'Kit8', pattern: FOUR_DRUMS } },
  { id: 'r4',  name: 'スウィング・ジャズ',      bpm: 120, swing: 0.30, drums: { kit: 'acoustic-kit', pattern: RIDE_DRUMS } },
  { id: 'r5',  name: 'ブームバップ・ローファイ', bpm: 84,  swing: 0.15, drums: { kit: 'CR78', pattern: BOOM_DRUMS } },
  { id: 'r6',  name: 'ゴスペル16分',           bpm: 88,  swing: 0.20, drums: { kit: 'Kit3', pattern: GOSPEL_DRUMS } },
  { id: 'r7',  name: 'ファンク風タイト',        bpm: 100, swing: 0,    drums: { kit: 'LINN', pattern: FUNK_DRUMS } },
  { id: 'r8',  name: 'テクノ四つ打ち',          bpm: 128, swing: 0,    drums: { kit: 'Techno', pattern: TECHNO_DRUMS } },
  { id: 'r9',  name: 'レゲエ的ワンドロップ',    bpm: 76,  swing: 0,    drums: { kit: 'acoustic-kit', pattern: ONEDROP_DRUMS } },
  { id: 'r10', name: 'ビッグバンド・スウィング', bpm: 128, swing: 0.30, drums: { kit: 'Kit3', pattern: BIGBAND_DRUMS } },
];

const GAIN_DB = {
  piano: -6, organ: -8, harmonium: -9, harp: -7, xylophone: -11,
  'guitar-acoustic': -7, 'guitar-nylon': -8, 'guitar-electric': -8,
  'bass-electric': -4, contrabass: -5, cello: -6, violin: -8, trumpet: -9,
  'synth-pad': -14, 'synth-bass': -8,
};

/* ============ 4. 候補の生成（10×10＝100） ============ */
function generateCandidates3() {
  const out = [];
  TIMBRES.forEach(timbre => {
    RHYTHMS.forEach(rhythm => {
      out.push({
        id: timbre.id + '-' + rhythm.id,
        name: timbre.name + ' × ' + rhythm.name,
        timbre, rhythm,
      });
    });
  });
  return out;
}

/* ============ 4-a. samples.js の makeSampleKit が呼ぶ makeClap ============
   本体では engine.js にあるが、ここでは読み込んでいないため移植する。      */
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

/* ============ 5. 音の通り道 ============ */
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

const SAMPLE_INSTRUMENT_KEYS = ['piano', 'organ', 'harmonium', 'harp', 'xylophone',
  'guitar-acoustic', 'guitar-nylon', 'guitar-electric', 'bass-electric', 'contrabass', 'cello',
  'violin', 'trumpet'];

function wireOutput(node, key) {
  const outGain = new Tone.Gain(Tone.dbToGain(GAIN_DB[key] || -7)).connect(Bus.master);
  const sendGain = new Tone.Gain(0.28).connect(Bus.reverbSend);
  node.connect(outGain);
  node.connect(sendGain);
}

function buildInstruments() {
  SAMPLE_INSTRUMENT_KEYS.forEach(key => {
    const env = (VOICES[key] && VOICES[key].env) || { attack: 0.01, release: 0.8 };
    const node = makeSampleVoice(key, env);
    if (!node) { instruments[key] = null; return; }
    wireOutput(node, key);
    instruments[key] = node;
  });

  const synthPad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'fatsawtooth', count: 4, spread: 48 },
    envelope: { attack: 0.9, decay: 0.5, sustain: 0.85, release: 2.0 },
  });
  wireOutput(synthPad, 'synth-pad');
  instruments['synth-pad'] = synthPad;

  const synthBass = new Tone.MonoSynth({
    oscillator: { type: 'square' },
    filter: { Q: 3.5, type: 'lowpass', rolloff: -24 },
    envelope: { attack: 0.004, decay: 0.16, sustain: 0.4, release: 0.1 },
    filterEnvelope: { attack: 0.004, decay: 0.13, sustain: 0.22, release: 0.12, baseFrequency: 95, octaves: 3.6 },
  });
  wireOutput(synthBass, 'synth-bass');
  instruments['synth-bass'] = synthBass;
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
function playBar(timbre, rhythm, root, intervals, time) {
  const stepDur = Tone.Time('16n').toSeconds();

  if (timbre.chordVoice && instruments[timbre.chordVoice]) {
    const v = instruments[timbre.chordVoice];
    const notes = intervals.map(iv => noteName(root + iv, timbre.chordOct));
    if (timbre.style === 'pad') {
      v.triggerAttackRelease(notes, '1m', time, 0.55);
    } else if (timbre.style === 'arp') {
      arpSequence(intervals.length).forEach((idx, i) => {
        const note = noteName(root + intervals[idx], timbre.chordOct);
        v.triggerAttackRelease(note, '8n', time + i * stepDur * 2, i % 2 === 0 ? 0.55 : 0.42);
      });
    } else if (timbre.style === 'comp') {
      [6, 14].forEach(step => v.triggerAttackRelease(notes, '16n', time + step * stepDur, 0.6));
    }
  }

  if (timbre.bassVoice && instruments[timbre.bassVoice]) {
    const bv = instruments[timbre.bassVoice];
    bv.triggerAttackRelease(noteName(root, timbre.bassOct), '2n', time, 0.65);
    bv.triggerAttackRelease(noteName(root + 7, timbre.bassOct), '4n', time + 8 * stepDur, 0.45);
  }

  if (timbre.melodyVoice && instruments[timbre.melodyVoice]) {
    const mv = instruments[timbre.melodyVoice];
    const topIv = intervals[intervals.length - 1];
    mv.triggerAttackRelease(noteName(root + topIv, timbre.melodyOct), '8n', time + 12 * stepDur, 0.4);
  }

  if (rhythm.drums) {
    const kit = getKit(rhythm.drums.kit);
    if (kit) {
      rhythm.drums.pattern.forEach(([step, part, vel]) => {
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

  const timbre = cand.timbre, rhythm = cand.rhythm;
  Tone.Transport.bpm.value = rhythm.bpm;
  Tone.Transport.swing = rhythm.swing || 0;
  Tone.Transport.swingSubdivision = '8n';
  Bus.reverbSend.gain.rampTo(timbre.reverbSend, 0.25);

  let bar = 0;
  currentLoop = new Tone.Loop((time) => {
    const [root, q] = FIXED_PROG.chords[bar % FIXED_PROG.chords.length];
    playBar(timbre, rhythm, root, QUALITIES[q], time);
    bar++;
  }, '1m').start(0);
  Tone.Transport.start();

  currentCandidateId = cand.id;
  cardEl.classList.add('playing');
  cardEl.querySelector('.playbtn').textContent = '■ 停止';
}

/* ============ 9. お気に入りの保存・書き出し ============ */
const FAV_KEY3 = 'stoneAppV5.cardAudition3.favorites';
function loadFavIds() {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY3) || '[]')); } catch (e) { return new Set(); }
}
function saveFavIds(set) {
  try { localStorage.setItem(FAV_KEY3, JSON.stringify([...set])); } catch (e) {}
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
      <div class="moodname">${cand.timbre.name}</div>
      <div class="progname">${cand.rhythm.name}（${cand.rhythm.bpm}BPM${cand.rhythm.swing ? '・swing' : ''}）</div>
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
      timbre: { id: c.timbre.id, name: c.timbre.name, chordVoice: c.timbre.chordVoice, style: c.timbre.style,
                bassVoice: c.timbre.bassVoice || null, melodyVoice: c.timbre.melodyVoice || null, reverbSend: c.timbre.reverbSend },
      rhythm: { id: c.rhythm.id, name: c.rhythm.name, bpm: c.rhythm.bpm, swing: c.rhythm.swing || 0,
                drums: c.rhythm.drums ? { kit: c.rhythm.drums.kit } : null },
    }));
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), fixedProgression: FIXED_PROG.name, picked }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'card-audition3-favorites.json';
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
    renderGrid(generateCandidates3());
  } catch (e) {
    loadmsg.textContent = '読み込みに失敗しました： ' + e.message;
    console.error(e);
  }
});
