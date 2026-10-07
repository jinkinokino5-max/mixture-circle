/* =====================================================================
   card-audition4.js — 「楽器パレットの開拓」試聴ツール・4周目
   ---------------------------------------------------------------------
   3周目までで「和音の種類」「リズム感」はある程度輪郭が見えてきたので、
   4周目は変数を楽器の組み合わせだけに絞る。
   コード進行は3周目と同じ定番進行（vi–IV–I–V／G）に固定、
   リズムも1種類（ソフトな8ビート・92BPM・スウィング無し）に固定し、
   「コードを弾く楽器（20種）× ベースを弾く楽器（5種）＝100通り」だけを
   比較できるようにする。実録音（16楽器）に加えて、実録音の無い音色を
   シンセで4種類（パッド／リード／オルガン／ベル）＋サブベース補う。
   ===================================================================== */

/* ============ 1. コード進行とリズムは1種類に固定 ============ */
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
const FIXED_DRUMS = [[0, 'k', .55], [8, 'k', .48], [0, 'h', .22], [2, 'h', .13], [4, 'h', .18], [6, 'h', .13], [8, 'h', .22], [10, 'h', .13], [12, 'h', .18], [14, 'h', .13]];
const FIXED_RHYTHM = { bpm: 92, swing: 0, drums: { kit: 'acoustic-kit', pattern: FIXED_DRUMS } };

/* ============ 2. コードを弾く楽器20種 ============ */
const CHORD_VOICES = [
  { key: 'piano',            label: 'ピアノ',           oct: 3, style: 'pad'  },
  { key: 'organ',             label: 'オルガン',         oct: 3, style: 'pad'  },
  { key: 'harmonium',         label: 'ハルモニウム',     oct: 3, style: 'pad'  },
  { key: 'harp',              label: 'ハープ',           oct: 4, style: 'arp'  },
  { key: 'xylophone',         label: 'シロフォン',       oct: 5, style: 'arp'  },
  { key: 'guitar-electric',   label: 'エレキギター',     oct: 3, style: 'comp' },
  { key: 'guitar-acoustic',   label: 'アコギ',           oct: 3, style: 'arp'  },
  { key: 'guitar-nylon',      label: 'ガットギター',     oct: 3, style: 'arp'  },
  { key: 'violin',            label: 'バイオリン',       oct: 4, style: 'pad'  },
  { key: 'cello',             label: 'チェロ',           oct: 3, style: 'pad'  },
  { key: 'flute',             label: 'フルート',         oct: 5, style: 'arp'  },
  { key: 'clarinet',          label: 'クラリネット',     oct: 4, style: 'pad'  },
  { key: 'saxophone',         label: 'サックス',         oct: 4, style: 'pad'  },
  { key: 'trumpet',           label: 'トランペット',     oct: 4, style: 'comp' },
  { key: 'trombone',          label: 'トロンボーン',     oct: 3, style: 'pad'  },
  { key: 'french-horn',       label: 'ホルン',           oct: 3, style: 'pad'  },
  { key: 'synth-pad',         label: 'シンセパッド',     oct: 3, style: 'pad'  },
  { key: 'synth-lead',        label: 'シンセリード',     oct: 4, style: 'arp'  },
  { key: 'synth-organ',       label: 'シンセオルガン',   oct: 3, style: 'comp' },
  { key: 'synth-bell',        label: 'シンセベル',       oct: 5, style: 'arp'  },
];

/* ============ 3. ベースを弾く楽器5種 ============ */
const BASS_VOICES = [
  { key: 'bass-electric', label: 'エレキベース', oct: 2 },
  { key: 'contrabass',    label: 'ウッドベース', oct: 2 },
  { key: 'cello',         label: 'チェロ',       oct: 2 },
  { key: 'synth-bass',    label: 'シンセベース', oct: 2 },
  { key: 'synth-sub',     label: 'サブベース',   oct: 2 },
];

const GAIN_DB = {
  piano: -6, organ: -8, harmonium: -9, harp: -7, xylophone: -11,
  'guitar-acoustic': -7, 'guitar-nylon': -8, 'guitar-electric': -8,
  'bass-electric': -4, contrabass: -5, cello: -6, violin: -8, flute: -10,
  clarinet: -8, saxophone: -8, trumpet: -9, trombone: -8, 'french-horn': -9,
  'synth-pad': -14, 'synth-lead': -12, 'synth-organ': -12, 'synth-bell': -13,
  'synth-bass': -8, 'synth-sub': -6,
};

/* ============ 4. 候補の生成（20×5＝100） ============ */
function generateCandidates4() {
  const out = [];
  CHORD_VOICES.forEach((cv, ci) => {
    BASS_VOICES.forEach((bv, bi) => {
      out.push({
        id: `c${ci + 1}-b${bi + 1}`,
        name: `${cv.label} ＋ ${bv.label}`,
        chord: cv, bass: bv,
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
let kit = null;
let currentLoop = null;
let currentCandidateId = null;

async function buildAudio() {
  Bus.limiter = new Tone.Limiter(-1).toDestination();
  Bus.master = new Tone.Gain(0.9).connect(Bus.limiter);
  Bus.reverb = new Tone.Reverb({ decay: 2.6, preDelay: 0.02, wet: 1 }).connect(Bus.master);
  try { await Bus.reverb.generate(); } catch (e) { /* 失敗しても音は出る */ }
  Bus.reverbSend = new Tone.Gain(0.42).connect(Bus.reverb);
}

const SAMPLE_INSTRUMENT_KEYS = ['piano', 'organ', 'harmonium', 'harp', 'xylophone',
  'guitar-acoustic', 'guitar-nylon', 'guitar-electric', 'bass-electric', 'contrabass', 'cello',
  'violin', 'flute', 'clarinet', 'saxophone', 'trumpet', 'trombone', 'french-horn'];

function wireOutput(node, key) {
  const outGain = new Tone.Gain(Tone.dbToGain(GAIN_DB[key] || -7)).connect(Bus.master);
  const sendGain = new Tone.Gain(0.26).connect(Bus.reverbSend);
  node.connect(outGain);
  node.connect(sendGain);
}

/* engine.js の makeSynth と同じ音作り（pad/lead/organ/bell/sbass/sub）。
   実録音の無い音色を補うためだけに使う。                                  */
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
  wireOutput(synthPad, 'synth-pad'); instruments['synth-pad'] = synthPad;

  const synthLead = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'fatsawtooth', count: 3, spread: 34 },
    envelope: { attack: 0.005, decay: 0.14, sustain: 0.22, release: 0.22 },
  });
  wireOutput(synthLead, 'synth-lead'); instruments['synth-lead'] = synthLead;

  const synthOrgan = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'fatsquare', count: 2, spread: 14 },
    envelope: { attack: 0.02, decay: 0.1, sustain: 0.8, release: 0.3 },
  });
  wireOutput(synthOrgan, 'synth-organ'); instruments['synth-organ'] = synthOrgan;

  const synthBell = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.002, decay: 0.5, sustain: 0, release: 0.5 },
  });
  wireOutput(synthBell, 'synth-bell'); instruments['synth-bell'] = synthBell;

  const synthBass = new Tone.MonoSynth({
    oscillator: { type: 'square' },
    filter: { Q: 3.5, type: 'lowpass', rolloff: -24 },
    envelope: { attack: 0.004, decay: 0.16, sustain: 0.4, release: 0.1 },
    filterEnvelope: { attack: 0.004, decay: 0.13, sustain: 0.22, release: 0.12, baseFrequency: 95, octaves: 3.6 },
  });
  wireOutput(synthBass, 'synth-bass'); instruments['synth-bass'] = synthBass;

  const synthSub = new Tone.MonoSynth({
    oscillator: { type: 'sine' },
    filter: { type: 'lowpass', frequency: 200 },
    envelope: { attack: 0.008, decay: 0.2, sustain: 0.85, release: 0.14 },
    filterEnvelope: { attack: 0.01, decay: 0.1, sustain: 1, baseFrequency: 60, octaves: 1 },
  });
  wireOutput(synthSub, 'synth-sub'); instruments['synth-sub'] = synthSub;

  const dest = new Tone.Gain(1).connect(Bus.master);
  const send = new Tone.Gain(0.10).connect(Bus.reverbSend);
  dest.connect(send);
  kit = makeSampleKit(dest, FIXED_RHYTHM.drums.kit, -9);
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
function playBar(chordDef, bassDef, root, intervals, time) {
  const stepDur = Tone.Time('16n').toSeconds();

  const cv = instruments[chordDef.key];
  if (cv) {
    const notes = intervals.map(iv => noteName(root + iv, chordDef.oct));
    if (chordDef.style === 'pad') {
      cv.triggerAttackRelease(notes, '1m', time, 0.55);
    } else if (chordDef.style === 'arp') {
      arpSequence(intervals.length).forEach((idx, i) => {
        const note = noteName(root + intervals[idx], chordDef.oct);
        cv.triggerAttackRelease(note, '8n', time + i * stepDur * 2, i % 2 === 0 ? 0.55 : 0.42);
      });
    } else if (chordDef.style === 'comp') {
      [6, 14].forEach(step => cv.triggerAttackRelease(notes, '16n', time + step * stepDur, 0.6));
    }
  }

  const bv = instruments[bassDef.key];
  if (bv) {
    bv.triggerAttackRelease(noteName(root, bassDef.oct), '2n', time, 0.65);
    bv.triggerAttackRelease(noteName(root + 7, bassDef.oct), '4n', time + 8 * stepDur, 0.45);
  }

  if (kit) {
    FIXED_RHYTHM.drums.pattern.forEach(([step, part, vel]) => {
      const fn = kit[part];
      if (fn) fn(time + step * stepDur, vel);
    });
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

  Tone.Transport.bpm.value = FIXED_RHYTHM.bpm;
  Tone.Transport.swing = FIXED_RHYTHM.swing;
  Tone.Transport.swingSubdivision = '8n';

  let bar = 0;
  currentLoop = new Tone.Loop((time) => {
    const [root, q] = FIXED_PROG.chords[bar % FIXED_PROG.chords.length];
    playBar(cand.chord, cand.bass, root, QUALITIES[q], time);
    bar++;
  }, '1m').start(0);
  Tone.Transport.start();

  currentCandidateId = cand.id;
  cardEl.classList.add('playing');
  cardEl.querySelector('.playbtn').textContent = '■ 停止';
}

/* ============ 9. お気に入りの保存・書き出し ============ */
const FAV_KEY4 = 'stoneAppV5.cardAudition4.favorites';
function loadFavIds() {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY4) || '[]')); } catch (e) { return new Set(); }
}
function saveFavIds(set) {
  try { localStorage.setItem(FAV_KEY4, JSON.stringify([...set])); } catch (e) {}
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
      <div class="moodname">${cand.name}</div>
      <div class="progname">コード：${cand.chord.style} ／ ベース：単純な根音+5度</div>
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
      chordVoice: c.chord.key, chordStyle: c.chord.style, bassVoice: c.bass.key,
    }));
    const blob = new Blob([JSON.stringify({
      exportedAt: new Date().toISOString(),
      fixedProgression: FIXED_PROG.name,
      fixedRhythm: { bpm: FIXED_RHYTHM.bpm, swing: FIXED_RHYTHM.swing, kit: FIXED_RHYTHM.drums.kit },
      picked,
    }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'card-audition4-favorites.json';
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
    renderGrid(generateCandidates4());
  } catch (e) {
    loadmsg.textContent = '読み込みに失敗しました： ' + e.message;
    console.error(e);
  }
});
