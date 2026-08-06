/* =====================================================================
   ミクスチャー・サークル — Phase 0（キーボード版）
   ---------------------------------------------------------------------
   設計の要点（draft/実装計画.md 6章に対応）
   ・全パートを Cマイナー・ペンタトニックに固定 → 何を重ねても破綻しない
   ・楽器 = 音色と周波数帯／ジャンル = リズムの性格
   ・投入は「次の拍頭（または小節頭）」にキューイングして同期させる
   ・同時発音は最大6パート、増えるほど全体音量を自動で下げる
   ===================================================================== */

/* ============ 1. 音階 ============ */
const PENTA = ['C', 'Eb', 'F', 'G', 'Bb'];      // Cマイナー・ペンタトニック
function noteOf(deg, baseOct) {
  const i = ((deg % 5) + 5) % 5;
  const oct = baseOct + Math.floor(deg / 5);
  return PENTA[i] + oct;
}

/* ============ 2. 楽器（列） ============ */
/* type : poly=和音可 / mono=単音 / pluck=撥弦 / drum=打楽器
   oct  : 基準オクターブ（周波数の住み分け）
   hp/lp: 帯域の住み分けフィルタ                                   */
const INSTRUMENTS = {
  bass:    { label: 'ベース',       type: 'mono',  oct: 1, deg: 0, hp: 30,  lp: 420,   gain: -4,  vary: false },
  drums:   { label: 'ドラム',       type: 'drum',  oct: 0, deg: 0, hp: 30,  lp: 12000, gain: -9,  vary: false },
  guitar:  { label: 'ギター',       type: 'pluck', oct: 3, deg: 2, hp: 160, lp: 4800,  gain: -3,  vary: true  },
  piano:   { label: 'ピアノ',       type: 'poly',  oct: 4, deg: 0, hp: 180, lp: 6000,  gain: -10, vary: true  },
  strings: { label: 'ストリングス', type: 'pad',   oct: 4, deg: 4, hp: 260, lp: 5000,  gain: -14, vary: true  },
  synth:   { label: 'シンセ',       type: 'lead',  oct: 5, deg: 2, hp: 420, lp: 9000,  gain: -16, vary: true  },
};
const INST_ORDER = ['piano', 'guitar', 'bass', 'drums', 'strings', 'synth'];

/* ============ 3. ジャンル（行） ============ */
/* mel : 旋律パターン（1小節=16ステップ）s=ステップ, d=音度, v=強さ, l=音の長さ
   drm : ドラムパターン k=キック s=スネア h=ハイハット                        */
const GENRES = {
  jazz: {
    label: 'ジャズ', sub: 'JAZZ', desc: '深い青・スウィング・裏拍',
    keys: ['1', '2', '3', '4', '5', '6'],
    mel: [
      { s: 2, d: 0, v: .70, l: '8n' }, { s: 5, d: 2, v: .50, l: '16n' },
      { s: 6, d: 3, v: .45, l: '16n' }, { s: 8, d: 1, v: .72, l: '8n' },
      { s: 11, d: 4, v: .50, l: '16n' }, { s: 14, d: 2, v: .65, l: '8n' },
    ],
    drm: { k: [0, 10], s: [4, 12], h: [2, 3, 6, 10, 11, 14], hv: .28 },
  },
  rock: {
    label: 'ロック', sub: 'ROCK', desc: '赤黒・8分・強拍',
    keys: ['q', 'w', 'e', 'r', 't', 'y'],
    mel: [
      { s: 0, d: 0, v: .90, l: '8n' }, { s: 2, d: 0, v: .55, l: '8n' },
      { s: 4, d: 3, v: .80, l: '8n' }, { s: 6, d: 0, v: .55, l: '8n' },
      { s: 8, d: 2, v: .88, l: '8n' }, { s: 10, d: 2, v: .55, l: '8n' },
      { s: 12, d: 4, v: .82, l: '8n' }, { s: 14, d: 3, v: .62, l: '8n' },
    ],
    drm: { k: [0, 6, 8, 14], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], hv: .35 },
  },
  classic: {
    label: 'クラシック', sub: 'CLASSIC', desc: '白金・伸びる音・優雅',
    keys: ['a', 's', 'd', 'f', 'g', 'h'],
    mel: [
      { s: 0, d: 0, v: .55, l: '2n' }, { s: 4, d: 2, v: .42, l: '4n' },
      { s: 8, d: 4, v: .55, l: '2n' }, { s: 12, d: 3, v: .42, l: '4n' },
    ],
    drm: { k: [0, 8], s: [], h: [12, 13, 14], hv: .12 },
  },
  electro: {
    label: 'エレクトロ', sub: 'ELECTRO', desc: 'ネオン・16分・機械的',
    keys: ['z', 'x', 'c', 'v', 'b', 'n'],
    mel: [
      { s: 0, d: 0, v: .80, l: '16n' }, { s: 1, d: 0, v: .35, l: '16n' },
      { s: 2, d: 3, v: .55, l: '16n' }, { s: 4, d: 2, v: .70, l: '16n' },
      { s: 6, d: 2, v: .45, l: '16n' }, { s: 7, d: 4, v: .55, l: '16n' },
      { s: 8, d: 1, v: .80, l: '16n' }, { s: 9, d: 1, v: .35, l: '16n' },
      { s: 10, d: 3, v: .55, l: '16n' }, { s: 12, d: 4, v: .70, l: '16n' },
      { s: 13, d: 3, v: .45, l: '16n' }, { s: 14, d: 2, v: .55, l: '16n' },
      { s: 15, d: 0, v: .45, l: '16n' },
    ],
    drm: { k: [0, 4, 8, 12], s: [4, 12], h: [1, 3, 5, 7, 9, 11, 13, 15], hv: .3 },
  },
};
const GENRE_ORDER = ['jazz', 'rock', 'classic', 'electro'];

const MAX_PARTS = 6;
const RETRIGGER_GUARD_MS = 500;   // 同一カードの連続読み取りを無視する時間

/* ============ 4. 音の出口（マスター） ============ */
let master, limiter, partsBus, beatBus, reverb, recorder;

function buildMaster() {
  limiter = new Tone.Limiter(-1).toDestination();
  master  = new Tone.Gain(0.9).connect(limiter);
  reverb  = new Tone.Freeverb({ roomSize: 0.72, dampening: 2600, wet: 1 }).connect(master);
  partsBus = new Tone.Gain(1).connect(master);
  beatBus  = new Tone.Gain(1).connect(master);
  try {
    recorder = new Tone.Recorder();
    master.connect(recorder);
  } catch (e) { recorder = null; }
}

/* ============ 5. ドラムの音づくり ============ */
function makeKit(dest, level) {
  const out = new Tone.Gain(Tone.dbToGain(level)).connect(dest);
  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.045, octaves: 6,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.34, sustain: 0, release: 0.1 },
  }).connect(out);
  const snareFilt = new Tone.Filter(1800, 'bandpass').connect(out);
  const snare = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.14, sustain: 0 },
  }).connect(snareFilt);
  const hatFilt = new Tone.Filter(7500, 'highpass').connect(out);
  const hat = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.035, sustain: 0 },
  }).connect(hatFilt);
  return {
    out, nodes: [kick, snare, hat, snareFilt, hatFilt, out],
    kick: (t, v) => kick.triggerAttackRelease('C1', '8n', t, v),
    snare: (t, v) => snare.triggerAttackRelease('16n', t, v),
    hat: (t, v) => hat.triggerAttackRelease('32n', t, v),
  };
}

/* ============ 6. パート（カード1枚ぶん） ============ */
let barIndex = 0;   // 何小節目か（微妙な変化づけに使う）

class Part {
  constructor(instKey, genreKey) {
    this.id = genreKey + '-' + instKey;
    this.instKey = instKey;
    this.genreKey = genreKey;
    const inst = INSTRUMENTS[instKey];
    const genre = GENRES[genreKey];
    this.inst = inst; this.genre = genre;

    // 出口 → 帯域フィルタ → パート音量 → partsBus（＋残響へ少量）
    this.gain = new Tone.Gain(Tone.dbToGain(inst.gain)).connect(partsBus);
    this.send = new Tone.Gain(instKey === 'strings' ? 0.35 : 0.12).connect(reverb);
    this.gain.connect(this.send);
    this.lp = new Tone.Filter(inst.lp, 'lowpass').connect(this.gain);
    this.hp = new Tone.Filter(inst.hp, 'highpass').connect(this.lp);

    this.extra = [];
    if (inst.type === 'drum') {
      this.kit = makeKit(this.hp, 0);
      this.seq = new Tone.Sequence((time, step) => this.tickDrum(time, step), range16(), '16n');
    } else {
      this.voice = this.makeVoice(inst);
      this.seq = new Tone.Sequence((time, step) => this.tickMel(time, step), range16(), '16n');
    }
  }

  makeVoice(inst) {
    switch (inst.type) {
      case 'mono':   // ベース：太いサイン＋ノコギリ
        return new Tone.MonoSynth({
          oscillator: { type: 'sawtooth' },
          filter: { Q: 1, type: 'lowpass', rolloff: -24 },
          envelope: { attack: 0.01, decay: 0.25, sustain: 0.55, release: 0.25 },
          filterEnvelope: { attack: 0.01, decay: 0.22, sustain: 0.25, release: 0.3, baseFrequency: 90, octaves: 2.6 },
        }).connect(this.hp);
      case 'pluck':  // ギター
        return new Tone.PluckSynth({ attackNoise: 1.1, dampening: 3400, resonance: 0.93 }).connect(this.hp);
      case 'pad':    // ストリングス：ゆっくり立ち上がる
        return new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sawtooth' },
          envelope: { attack: 0.35, decay: 0.4, sustain: 0.85, release: 1.6 },
        }).connect(this.hp);
      case 'lead':   // シンセ：短く硬い
        return new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'square' },
          envelope: { attack: 0.004, decay: 0.12, sustain: 0.08, release: 0.18 },
        }).connect(this.hp);
      default:       // ピアノ
        return new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.004, decay: 0.5, sustain: 0.12, release: 1.1 },
        }).connect(this.hp);
    }
  }

  tickMel(time, step) {
    const ev = this.genre.mel.find(e => e.s === step);
    if (!ev) return;
    const vary = this.inst.vary && (barIndex % 4 === 3) ? 1 : 0;
    const note = noteOf(this.inst.deg + ev.d + vary, this.inst.oct);
    if (this.inst.type === 'pluck') this.voice.triggerAttack(note, time);
    else this.voice.triggerAttackRelease(note, ev.l, time, ev.v);
    this.flash(time, ev.v);
  }

  tickDrum(time, step) {
    const d = this.genre.drm;
    if (d.k.includes(step)) { this.kit.kick(time, 0.85); this.flash(time, 0.9); }
    if (d.s.includes(step)) { this.kit.snare(time, 0.55); this.flash(time, 0.7); }
    if (d.h.includes(step)) { this.kit.hat(time, d.hv); }
  }

  flash(time, v) {
    Tone.Draw.schedule(() => UI.flashCell(this.id, v), time);
  }

  start(ticks) { this.seq.start(ticks + 'i'); }

  fadeOutAndDispose(sec = 1.2) {
    try { this.gain.gain.rampTo(0, sec); } catch (e) {}
    setTimeout(() => this.dispose(), sec * 1000 + 120);
  }

  dispose() {
    try { this.seq.stop(); this.seq.dispose(); } catch (e) {}
    const nodes = [this.voice, ...(this.kit ? this.kit.nodes : []), this.hp, this.lp, this.send, this.gain];
    nodes.forEach(n => { try { n && n.dispose(); } catch (e) {} });
  }
}
function range16() { return [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]; }

/* ============ 7. 基礎ビート（常に鳴り続ける） ============ */
let baseKit, baseSeq;
const BASE = { k: [0, 8], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14] };

function startBaseBeat() {
  baseKit = makeKit(beatBus, -7);
  baseSeq = new Tone.Sequence((time, step) => {
    if (BASE.k.includes(step)) baseKit.kick(time, 0.9);
    if (BASE.s.includes(step)) baseKit.snare(time, 0.45);
    if (BASE.h.includes(step)) baseKit.hat(time, step % 4 === 0 ? 0.22 : 0.13);
  }, range16(), '16n').start(0);
}

/* ============ 8. 進行管理 ============ */
const State = {
  playing: false, paused: false,
  quantize: 'beat',       // 'beat' | 'bar'
  durationSec: 180,
  elapsed: 0,
  parts: new Map(),       // id -> Part
  order: [],              // 投入順（古い順）
  lastInput: new Map(),   // id -> 時刻（連続読みガード）
  pending: new Set(),
};

function nextBoundaryTicks() {
  const ppq = Tone.Transport.PPQ;
  const q = State.quantize === 'bar' ? ppq * 4 : ppq;
  const cur = Tone.Transport.ticks;
  const lead = Math.max(2, Math.round(ppq * 0.08));   // 直前すぎる予約を避ける
  return Math.ceil((cur + lead) / q) * q;
}

/* --- カード投入。Phase 1 でもここを呼ぶだけでよい --- */
function insertCard(cardId) {
  if (!State.playing || State.paused) return;
  const [genreKey, instKey] = cardId.split('-');
  if (!GENRES[genreKey] || !INSTRUMENTS[instKey]) return;

  const now = performance.now();
  const last = State.lastInput.get(cardId) || 0;
  if (now - last < RETRIGGER_GUARD_MS) return;      // 二重読みガード
  State.lastInput.set(cardId, now);

  if (State.parts.has(cardId)) {
    UI.reject(cardId);
    UI.toast('その音はもう鳴っています');
    return;
  }

  // 上限を超えたら一番古い音を引っ込める
  // （発音待ちのパートも数に入れる。連続投入で上限を突破しないため）
  while (State.order.length >= MAX_PARTS) {
    const oldest = State.order.shift();
    const p = State.parts.get(oldest);
    if (p) { p.fadeOutAndDispose(1.4); State.parts.delete(oldest); }
    State.pending.delete(oldest);
    UI.setCell(oldest, '');
    UI.toast(`${labelOf(oldest)} が抜けました（同時6パートまで）`);
  }

  const part = new Part(instKey, genreKey);
  const ticks = nextBoundaryTicks();
  part.start(ticks);

  // 投入した時点で在籍させる。UI上は次の拍頭までを「発音待ち」として見せる
  State.parts.set(cardId, part);
  State.order.push(cardId);
  State.pending.add(cardId);
  UI.setCell(cardId, 'pending');
  UI.refreshNow();
  UI.time();
  duckByCount();

  Tone.Transport.scheduleOnce((t) => {
    Tone.Draw.schedule(() => {
      if (!State.pending.has(cardId)) return;   // 待っている間に抜かれていたら何もしない
      State.pending.delete(cardId);
      UI.setCell(cardId, 'active');
    }, t);
  }, ticks + 'i');
}

function removeCard(cardId) {
  const p = State.parts.get(cardId);
  if (!p) return;
  p.fadeOutAndDispose(0.9);
  State.parts.delete(cardId);
  State.pending.delete(cardId);
  State.order = State.order.filter(x => x !== cardId);
  UI.setCell(cardId, '');
  UI.refreshNow();
  UI.time();
  duckByCount();
}

/* パートが増えるほど1つあたりを下げ、全体音量を一定に保つ */
function duckByCount() {
  const n = Math.max(1, State.parts.size);
  partsBus.gain.rampTo(1 / Math.sqrt(n), 0.4);
}

function labelOf(cardId) {
  const [g, i] = cardId.split('-');
  return `${GENRES[g].label}の${INSTRUMENTS[i].label}`;
}

/* ============ 9. 開始・停止 ============ */
async function startGame(bpm) {
  await Tone.start();
  buildMaster();
  Tone.Transport.bpm.value = bpm;
  Tone.Transport.timeSignature = 4;
  barIndex = 0;

  startBaseBeat();

  // 拍のインジケータと小節カウント
  Tone.Transport.scheduleRepeat((time) => {
    const beat = Math.floor(Tone.Transport.ticks / Tone.Transport.PPQ) % 4;
    Tone.Draw.schedule(() => UI.beat(beat), time);
  }, '4n', 0);
  Tone.Transport.scheduleRepeat(() => { barIndex++; }, '1m', 0);

  // 残り時間
  Tone.Transport.scheduleRepeat((time) => {
    Tone.Draw.schedule(() => {
      State.elapsed++;
      UI.time();
      if (State.durationSec > 0 && State.elapsed >= State.durationSec) endGame();
    }, time);
  }, 1, 0);

  Tone.Transport.start('+0.1');
  if (recorder) { try { recorder.start(); } catch (e) {} }
  State.playing = true;
  State.paused = false;
}

async function endGame() {
  if (!State.playing) return;
  State.playing = false;

  // 余韻を残して止める
  master.gain.rampTo(0, 3.5);
  setTimeout(async () => {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    State.parts.forEach(p => p.dispose());
    State.parts.clear(); State.order = []; State.pending.clear();
    try { baseSeq.stop(); baseSeq.dispose(); baseKit.nodes.forEach(n => n.dispose()); } catch (e) {}

    let url = null;
    if (recorder && recorder.state === 'started') {
      try {
        const blob = await recorder.stop();
        url = URL.createObjectURL(blob);
      } catch (e) { url = null; }
    }
    UI.showFinish(url);
  }, 3600);
}

/* ============ 10. 画面 ============ */
const UI = {
  cells: {},
  init() {
    const grid = document.getElementById('grid');
    grid.innerHTML = '';
    grid.appendChild(el('div', 'head-cell', ''));
    INST_ORDER.forEach(k => grid.appendChild(el('div', 'head-cell', INSTRUMENTS[k].label)));

    GENRE_ORDER.forEach(gk => {
      const g = GENRES[gk];
      const lab = el('div', 'genre-label', '');
      lab.style.setProperty('--g', `var(--${gk})`);
      lab.innerHTML = `<div>${g.label}</div><small>${g.desc}</small>`;
      grid.appendChild(lab);

      INST_ORDER.forEach((ik, ci) => {
        const id = gk + '-' + ik;
        const c = el('div', 'cell', '');
        c.style.setProperty('--g', `var(--${gk})`);
        c.style.setProperty('--ga', `var(--${gk}-a)`);
        c.innerHTML = `<div class="key">${g.keys[ci].toUpperCase()}</div>
                       <div class="name">${INSTRUMENTS[ik].label}</div>
                       <div class="bar"></div>`;
        c.addEventListener('click', () => insertCard(id));
        grid.appendChild(c);
        UI.cells[id] = c;
      });
    });
    UI.time();
  },
  setCell(id, cls) {
    const c = UI.cells[id]; if (!c) return;
    c.classList.remove('pending', 'active');
    if (cls) c.classList.add(cls);
  },
  reject(id) {
    const c = UI.cells[id]; if (!c) return;
    c.classList.remove('reject'); void c.offsetWidth; c.classList.add('reject');
  },
  flashCell(id, v) {
    const c = UI.cells[id]; if (!c) return;
    const bar = c.querySelector('.bar');
    bar.style.transition = 'none'; bar.style.width = Math.round(v * 100) + '%';
    requestAnimationFrame(() => { bar.style.transition = 'width .28s ease-out'; bar.style.width = '0%'; });
  },
  beat(i) {
    document.querySelectorAll('#beats .beat').forEach((b, j) => {
      b.classList.toggle('on', j === i);
      b.classList.toggle('down', j === i && i === 0);
    });
  },
  time() {
    const left = State.durationSec > 0 ? Math.max(0, State.durationSec - State.elapsed) : State.elapsed;
    const m = Math.floor(left / 60), s = left % 60;
    document.getElementById('timeleft').textContent = `${m}:${String(s).padStart(2, '0')}`;
    document.getElementById('partcount').textContent = State.parts.size;
    const pct = State.durationSec > 0 ? (State.elapsed / State.durationSec) * 100 : 0;
    document.querySelector('#progress > div').style.width = Math.min(100, pct) + '%';
  },
  refreshNow() {
    const box = document.getElementById('nowlist');
    box.innerHTML = '';
    if (State.order.length === 0) {
      box.innerHTML = '<div class="empty">まだ基礎ビートだけです。キーを押して音を重ねてください。</div>';
      return;
    }
    State.order.forEach(id => {
      const [g] = id.split('-');
      const p = el('div', 'pill', '');
      p.style.setProperty('--g', `var(--${g})`);
      p.style.setProperty('--ga', `var(--${g}-a)`);
      p.innerHTML = `<span>${labelOf(id)}</span>`;
      const b = el('button', '', '×');
      b.title = 'この音を止める';
      b.addEventListener('click', () => removeCard(id));
      p.appendChild(b);
      box.appendChild(p);
    });
  },
  toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(UI._tt);
    UI._tt = setTimeout(() => t.classList.remove('show'), 1800);
  },
  showFinish(url) {
    const f = document.getElementById('finish');
    const audio = document.getElementById('playback');
    const dl = document.getElementById('dl');
    if (url) {
      audio.src = url; audio.style.display = '';
      dl.href = url; dl.style.display = '';
      document.getElementById('finishmsg').innerHTML =
        'みんなで聴いてみましょう。<br>「ここ良かったね」を言い合うところまでが体験です。';
    } else {
      audio.style.display = 'none'; dl.style.display = 'none';
      document.getElementById('finishmsg').textContent =
        'おつかれさまでした。感想を共有しましょう。（このブラウザでは録音を保存できませんでした）';
    }
    f.classList.add('show');
  },
};
function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt) e.textContent = txt;
  return e;
}

/* ============ 11. キーボード入力（＝カードの代わり） ============ */
const KEYMAP = {};
GENRE_ORDER.forEach(gk => {
  GENRES[gk].keys.forEach((k, i) => { KEYMAP[k] = gk + '-' + INST_ORDER[i]; });
});

/* Phase 1 用：HIDリーダーが打ち込むUIDを拾うバッファ */
let uidBuf = '', uidTimer = null;

document.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === 'Escape') { endGame(); return; }
  if (e.key === 'Backspace') {
    e.preventDefault();
    const last = State.order[State.order.length - 1];
    if (last) removeCard(last);
    return;
  }
  if (e.key === 'Enter') {          // HIDリーダーは末尾にEnterを打つ
    if (uidBuf.length >= 6 && CARD_MAP[uidBuf]) insertCard(CARD_MAP[uidBuf]);
    uidBuf = '';
    return;
  }
  if (/^[0-9]$/.test(e.key)) {      // UIDらしき連続入力を蓄積（Phase 1で効く）
    uidBuf += e.key;
    clearTimeout(uidTimer);
    uidTimer = setTimeout(() => { uidBuf = ''; }, 400);
  }
  const id = KEYMAP[e.key.toLowerCase()];
  if (id) { e.preventDefault(); insertCard(id); }
});

/* ============ 12. 画面まわりの配線 ============ */
document.addEventListener('DOMContentLoaded', () => {
  UI.init();

  const bpm = document.getElementById('bpm');
  const bpmv = document.getElementById('bpmv');
  bpm.addEventListener('input', () => { bpmv.textContent = bpm.value; });

  document.querySelectorAll('#durchips .chip').forEach(c => {
    c.addEventListener('click', () => {
      document.querySelectorAll('#durchips .chip').forEach(x => x.setAttribute('aria-pressed', 'false'));
      c.setAttribute('aria-pressed', 'true');
      State.durationSec = Number(c.dataset.sec);
      State.elapsed = 0; UI.time();
    });
  });
  document.querySelectorAll('#quantchips .chip').forEach(c => {
    c.addEventListener('click', () => {
      document.querySelectorAll('#quantchips .chip').forEach(x => x.setAttribute('aria-pressed', 'false'));
      c.setAttribute('aria-pressed', 'true');
      State.quantize = c.dataset.q;
    });
  });

  document.getElementById('startbtn').addEventListener('click', async () => {
    const v = Number(bpm.value);
    document.getElementById('bpmshow').textContent = v;
    document.getElementById('setup').classList.add('hidden');
    State.elapsed = 0; UI.time();
    await startGame(v);
  });

  document.getElementById('pausebtn').addEventListener('click', (e) => {
    if (!State.playing) return;
    State.paused = !State.paused;
    if (State.paused) { Tone.Transport.pause(); e.target.textContent = '再開'; }
    else { Tone.Transport.start(); e.target.textContent = '一時停止'; }
  });
  document.getElementById('stopbtn').addEventListener('click', () => endGame());
  document.getElementById('againbtn').addEventListener('click', () => location.reload());
});

/* Phase 1 で使う入口を外に出しておく */
window.insertCard = insertCard;
