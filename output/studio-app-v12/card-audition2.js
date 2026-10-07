/* =====================================================================
   card-audition2.js — 「音楽カード」候補（コード進行×雰囲気）試聴ツール・2周目
   ---------------------------------------------------------------------
   card-audition.js（1周目）と同じ仕組み・同じ本体ファイルの間借りだが、
   和音の種類と雰囲気（楽器編成）をすべて入れ替えて、別の100個を作る。
   1周目は「ピアノ／ギター／オルガン系＋定番進行」中心だったので、
   2周目は「弦楽器・木管・金管・シンセパッド」と「1周目で使わなかった
   和音（m11・m6・dom7♭9・4度堆積・ディミニッシュ・オーグメント等）」で構成。
   ===================================================================== */

/* ============ 1. 和音の型（ルートからの半音）2周目の10種 ============ */
const QUALITIES2 = {
  m11:     [0, 3, 7, 10, 14, 17],
  maj7:    [0, 4, 7, 11],
  m6:      [0, 3, 7, 9],
  dom7b9:  [0, 4, 7, 10, 13],
  m7b5:    [0, 3, 6, 10],
  quartal: [0, 5, 10, 15],
  dim7:    [0, 3, 6, 9],
  aug:     [0, 4, 8],
  madd9:   [0, 3, 7, 14],
  'm(maj7)': [0, 3, 7, 11],
  sus4:    [0, 5, 7, 14],
  maj9:    [0, 4, 7, 11, 14],
  m9:      [0, 3, 7, 10, 14],
  dom9:    [0, 4, 7, 10, 14],
  m7:      [0, 3, 7, 10],
  '6/9':   [0, 4, 7, 9, 14],
};

/* ============ 2. コード進行10種（1周目とは別の和声・機能） ============ */
const PROGRESSIONS2 = [
  { id: 'q1',  name: 'アンダルシア終止（i–♭VII–♭VI–V）／Am',    chords: [[9, 'm6'], [7, '6/9'], [5, 'maj7'], [7, 'dom7b9']] },
  { id: 'q2',  name: 'ドリアン・ヴァンプ（i–IV）／Dm',           chords: [[2, 'm11'], [7, 'dom9'], [2, 'm11'], [7, 'dom9']] },
  { id: 'q3',  name: 'ネオソウル（ii♭5–V–i–iv）／Cm',            chords: [[2, 'm7b5'], [7, 'dom7b9'], [0, 'm9'], [5, 'm11']] },
  { id: 'q4',  name: 'クォータル・ヴァンプ（4度堆積）／G',        chords: [[7, 'quartal'], [2, 'quartal'], [9, 'quartal'], [7, 'quartal']] },
  { id: 'q5',  name: 'ピカルディ終止（i–iv–V–I）／Em',           chords: [[4, 'm9'], [9, 'm7'], [11, 'dom7b9'], [4, 'maj9']] },
  { id: 'q6',  name: 'ディミニッシュ経過（I–♯Idim–ii–V）／C',     chords: [[0, 'maj7'], [1, 'dim7'], [2, 'm7'], [7, 'dom9']] },
  { id: 'q7',  name: 'オーグメント経過（I–I+–vi–IV）／C',         chords: [[0, 'maj7'], [0, 'aug'], [9, 'm7'], [5, '6/9']] },
  { id: 'q8',  name: 'サスの浮遊（Isus4–IVadd9–Isus4–V）／D',    chords: [[2, 'sus4'], [7, 'madd9'], [2, 'sus4'], [9, 'dom9']] },
  { id: 'q9',  name: 'マイナー・メジャー7th（i(maj7)–iv–VII–III）／Am', chords: [[9, 'm(maj7)'], [2, 'm7'], [7, 'dom9'], [0, 'maj9']] },
  { id: 'q10', name: 'マイナー6th循環（i–vi♭5–ii–V）／Fm',        chords: [[5, 'm6'], [9, 'm7b5'], [10, 'm7'], [5, 'dom7b9']] },
];

/* ============ 3. 雰囲気（編成）10種 ============
   1周目で使わなかった音色（弦・木管・金管・シンセパッド）を中心に。   */
const SOFT2_DRUMS  = [[0, 'k', .55], [10, 'k', .40], [0, 'h', .20], [4, 'h', .14], [8, 'h', .20], [12, 'h', .14]];
const SWING2_DRUMS = [[0, 'k', .80], [6, 'k', .45], [8, 'k', .78], [4, 's', .60], [12, 's', .60],
                       [0, 'h', .18], [3, 'h', .14], [6, 'h', .18], [9, 'h', .14], [12, 'h', .18], [15, 'h', .14]];
const RIDE2_DRUMS  = [[0, 'k', .28], [0, 'h', .17], [3, 'h', .13], [6, 'h', .17], [9, 'h', .13], [12, 'h', .17], [15, 'h', .13]];
const TECHNO_DRUMS = [[0, 'k', .90], [4, 'k', .78], [8, 'k', .90], [12, 'k', .78], [4, 'c', .45], [12, 'c', .45],
                       [2, 'h', .18], [6, 'h', .18], [10, 'h', .18], [14, 'h', .18]];

const MOODS2 = [
  { id: 'n1',  name: '弦楽四重奏風',     bpm: 74,  chordVoice: 'violin',       chordOct: 4, style: 'pad',  bassVoice: 'cello',         bassOct: 2, reverbSend: 0.50 },
  { id: 'n2',  name: '木管のワルツ',     bpm: 100, chordVoice: 'clarinet',     chordOct: 4, style: 'comp', bassVoice: 'contrabass',    bassOct: 2, reverbSend: 0.40 },
  { id: 'n3',  name: 'ビッグバンドのホーン', bpm: 128, swing: 0.30, chordVoice: 'trumpet', chordOct: 4, style: 'comp', bassVoice: 'bass-electric', bassOct: 2, reverbSend: 0.35, drums: { kit: 'Kit3', pattern: SWING2_DRUMS } },
  { id: 'n4',  name: 'サックスの夜',     bpm: 92,  chordVoice: 'saxophone',    chordOct: 4, style: 'pad',  bassVoice: 'contrabass',    bassOct: 2, reverbSend: 0.45, drums: { kit: 'acoustic-kit', pattern: RIDE2_DRUMS } },
  { id: 'n5',  name: 'ホルンの静けさ',   bpm: 64,  chordVoice: 'french-horn',  chordOct: 3, style: 'pad',  bassVoice: 'cello',         bassOct: 2, reverbSend: 0.60 },
  { id: 'n6',  name: 'フルートの朝露',   bpm: 88,  chordVoice: 'flute',        chordOct: 5, style: 'arp',  bassVoice: 'contrabass',    bassOct: 2, reverbSend: 0.55, melodyVoice: 'xylophone', melodyOct: 5 },
  { id: 'n7',  name: 'トロンボーンの温かさ', bpm: 80, chordVoice: 'trombone',   chordOct: 3, style: 'pad',  bassVoice: 'bass-electric', bassOct: 2, reverbSend: 0.40, drums: { kit: 'LINN', pattern: SOFT2_DRUMS } },
  { id: 'n8',  name: 'シンセパッドの宇宙', bpm: 68, chordVoice: 'synth-pad',   chordOct: 3, style: 'pad',  bassVoice: 'synth-bass',    bassOct: 2, reverbSend: 0.60 },
  { id: 'n9',  name: 'シンセリードのゲーム音楽', bpm: 124, chordVoice: 'synth-lead', chordOct: 4, style: 'arp', bassVoice: 'synth-bass', bassOct: 2, reverbSend: 0.30, drums: { kit: 'Techno', pattern: TECHNO_DRUMS } },
  { id: 'n10', name: 'ヴァイオリンとハープの子守唄', bpm: 62, chordVoice: 'violin', chordOct: 4, style: 'arp', bassVoice: 'harp', bassOct: 3, reverbSend: 0.55 },
];

const GAIN_DB2 = {
  violin: -8, clarinet: -8, trumpet: -9, saxophone: -8, 'french-horn': -9,
  flute: -10, trombone: -8, xylophone: -11, cello: -6, contrabass: -5,
  'bass-electric': -4, harp: -7,
};

/* ============ 4. 候補の生成（10×10＝100） ============ */
function generateCandidates2() {
  const out = [];
  MOODS2.forEach(mood => {
    PROGRESSIONS2.forEach(prog => {
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
  Bus.reverb = new Tone.Reverb({ decay: 3.2, preDelay: 0.02, wet: 1 }).connect(Bus.master);
  try { await Bus.reverb.generate(); } catch (e) { /* 失敗しても音は出る */ }
  Bus.reverbSend = new Tone.Gain(0.4).connect(Bus.reverb);
}

/* 実録音（サンプラー）で使う楽器 */
const SAMPLE_INSTRUMENT_KEYS = ['violin', 'clarinet', 'trumpet', 'saxophone', 'french-horn',
  'flute', 'trombone', 'xylophone', 'cello', 'contrabass', 'bass-electric', 'harp'];

function wireOutput(node, key, gainMap) {
  const outGain = new Tone.Gain(Tone.dbToGain((gainMap && gainMap[key]) || -7)).connect(Bus.master);
  const sendGain = new Tone.Gain(0.28).connect(Bus.reverbSend);
  node.connect(outGain);
  node.connect(sendGain);
}

function buildInstruments() {
  SAMPLE_INSTRUMENT_KEYS.forEach(key => {
    const env = (VOICES[key] && VOICES[key].env) || { attack: 0.01, release: 0.8 };
    const node = makeSampleVoice(key, env);
    if (!node) { instruments[key] = null; return; }
    wireOutput(node, key, GAIN_DB2);
    instruments[key] = node;
  });

  /* シンセの2種（engine.js の makeSynth と同じ音作り）。
     サンプラーが無い音色（宇宙的なパッド／ゲーム音楽風リード）のために使う */
  const synthPad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'fatsawtooth', count: 4, spread: 48 },
    envelope: { attack: 0.9, decay: 0.5, sustain: 0.85, release: 2.0 },
  });
  wireOutput(synthPad, 'synth-pad', { 'synth-pad': -14 });
  instruments['synth-pad'] = synthPad;

  const synthLead = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'fatsawtooth', count: 3, spread: 34 },
    envelope: { attack: 0.005, decay: 0.14, sustain: 0.22, release: 0.22 },
  });
  wireOutput(synthLead, 'synth-lead', { 'synth-lead': -12 });
  instruments['synth-lead'] = synthLead;

  const synthBass = new Tone.MonoSynth({
    oscillator: { type: 'square' },
    filter: { Q: 3.5, type: 'lowpass', rolloff: -24 },
    envelope: { attack: 0.004, decay: 0.16, sustain: 0.4, release: 0.1 },
    filterEnvelope: { attack: 0.004, decay: 0.13, sustain: 0.22, release: 0.12, baseFrequency: 95, octaves: 3.6 },
  });
  wireOutput(synthBass, 'synth-bass', { 'synth-bass': -8 });
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
  if (already) return;   // 同じカードをもう一度押したら停止だけして終わる

  const mood = cand.mood, prog = cand.prog;
  Tone.Transport.bpm.value = mood.bpm;
  Tone.Transport.swing = mood.swing || 0;
  Tone.Transport.swingSubdivision = '8n';
  Bus.reverbSend.gain.rampTo(mood.reverbSend, 0.25);

  let bar = 0;
  currentLoop = new Tone.Loop((time) => {
    const [root, q] = prog.chords[bar % prog.chords.length];
    playBar(mood, root, QUALITIES2[q], time);
    bar++;
  }, '1m').start(0);
  Tone.Transport.start();

  currentCandidateId = cand.id;
  cardEl.classList.add('playing');
  cardEl.querySelector('.playbtn').textContent = '■ 停止';
}

/* ============ 9. お気に入りの保存・書き出し ============ */
const FAV_KEY2 = 'stoneAppV5.cardAudition2.favorites';
function loadFavIds() {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY2) || '[]')); } catch (e) { return new Set(); }
}
function saveFavIds(set) {
  try { localStorage.setItem(FAV_KEY2, JSON.stringify([...set])); } catch (e) {}
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
    a.href = url; a.download = 'card-audition2-favorites.json';
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
    renderGrid(generateCandidates2());
  } catch (e) {
    loadmsg.textContent = '読み込みに失敗しました： ' + e.message;
    console.error(e);
  }
});
