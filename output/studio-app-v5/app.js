/* =====================================================================
   app.js — STUDIO PULSE の音響エンジンと画面
   ---------------------------------------------------------------------
   music.js が「何を鳴らすか」を持ち、このファイルが「どう鳴らすか」を持つ。

   v1（ジャンル版）から強化した点：
     1. 4小節のコード進行を全パートが共有する（曲が動く）
     2. キックでほかの音を一瞬へこませる＝サイドチェイン（ビートが前に出る）
     3. スウィングと ENERGY（静／走／熱）をグローバルに操作できる
     4. 8小節ごとの自動フィル
     5. ビルドアップ＆ドロップ（スペースキー）— 盛り上げて落とす山場
     6. リズムカードの「キック権」は最初の1枚が持つ（重ねても濁らない）
     7. 波形に反応するビジュアライザ
   ===================================================================== */

const MAX_PARTS = 8;                 // 安全弁。実際は ROLE ごとの上限が先に効く
const RETRIGGER_GUARD_MS = 420;      // 同一カードの連続読み取りを無視する時間
const BASE_KIT = 'acoustic-kit';     // カードが無いときに鳴る基礎ビートのキット

/* ============ 1. 音の出口 ============
   parts ─┬→ duckBus（キックでへこむ組：メロディ/コード/ベース）┐
          └→ dryBus （ドラムなど）                              ├→ sweep → master
   send  ─→ reverb / delay ────────────────────────────────────┘
   master → glue(圧縮) → limiter → スピーカー
                       └→ analyser（画面用）／recorder（録音用）      */
let master, limiter, glue, sweep, partsBus, duckBus, dryBus, baseBus,
    reverb, delay, analyser, recorder;

async function buildMaster() {
  limiter = new Tone.Limiter(-1).toDestination();
  glue = new Tone.Compressor({ threshold: -18, ratio: 3, attack: 0.006, release: 0.12 }).connect(limiter);
  master = new Tone.Gain(0.9).connect(glue);

  analyser = new Tone.Analyser('waveform', 512);
  master.connect(analyser);

  /* ビルドアップで開く／閉じるハイパスフィルタ。ふだんは開けっぱなし */
  sweep = new Tone.Filter({ type: 'highpass', frequency: 20, rolloff: -24, Q: 1 }).connect(master);

  partsBus = new Tone.Gain(1).connect(sweep);
  duckBus  = new Tone.Gain(1).connect(partsBus);   // キックでへこむ側
  dryBus   = new Tone.Gain(1).connect(partsBus);   // へこまない側
  baseBus  = new Tone.Gain(1).connect(sweep);

  reverb = new Tone.Reverb({ decay: 2.6, preDelay: 0.02, wet: 1 }).connect(master);
  try { await reverb.generate(); } catch (e) { /* 生成に失敗しても音は出る */ }
  delay = new Tone.PingPongDelay({ delayTime: '8n.', feedback: 0.26, wet: 1 }).connect(master);

  try {
    recorder = new Tone.Recorder();
    master.connect(recorder);
  } catch (e) { recorder = null; }
}

/* キックが鳴るたびに、上ものを一瞬へこませて戻す＝グルーヴの脈 */
function pump(time, strength = 1) {
  if (!duckBus) return;
  const beat = 60 / Tone.Transport.bpm.value;
  const depth = 1 - 0.42 * strength * (State.pumpOn ? 1 : 0);
  try {
    duckBus.gain.cancelScheduledValues(time);
    duckBus.gain.setValueAtTime(depth, time);
    duckBus.gain.linearRampToValueAtTime(1, time + Math.min(0.34, beat * 0.55));
  } catch (e) {}
}

/* ============ 2. 合成音（実録音が無いとき／シンセ専用カード） ============ */
function makeSynthVoice(fb, dest) {
  switch (fb) {
    case 'mono':
      return new Tone.MonoSynth({
        oscillator: { type: 'sawtooth' },
        filter: { Q: 1.4, type: 'lowpass', rolloff: -24 },
        envelope: { attack: 0.006, decay: 0.2, sustain: 0.55, release: 0.2 },
        filterEnvelope: { attack: 0.006, decay: 0.18, sustain: 0.3, release: 0.25, baseFrequency: 150, octaves: 3 },
      }).connect(dest);
    case 'fuzz':
      return new Tone.MonoSynth({
        oscillator: { type: 'square' },
        filter: { Q: 2, type: 'lowpass', rolloff: -12 },
        envelope: { attack: 0.004, decay: 0.24, sustain: 0.7, release: 0.2 },
        filterEnvelope: { attack: 0.004, decay: 0.2, sustain: 0.5, release: 0.2, baseFrequency: 200, octaves: 2.4 },
      }).connect(dest);
    case 'sub':
      return new Tone.MonoSynth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.3, sustain: 0.9, release: 0.3 },
        filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 1, release: 0.3, baseFrequency: 90, octaves: 1.2 },
      }).connect(dest);
    case 'lead':
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'square' },
        envelope: { attack: 0.004, decay: 0.12, sustain: 0.08, release: 0.16 },
      }).connect(dest);
    case 'pad':
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'fatsawtooth', count: 3, spread: 30 },
        envelope: { attack: 0.6, decay: 0.5, sustain: 0.75, release: 1.8 },
      }).connect(dest);
    case 'bow':
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'fatsawtooth', count: 2, spread: 18 },
        envelope: { attack: 0.18, decay: 0.3, sustain: 0.6, release: 0.9 },
      }).connect(dest);
    case 'brass':
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'fatsawtooth', count: 3, spread: 25 },
        envelope: { attack: 0.012, decay: 0.16, sustain: 0.24, release: 0.22 },
      }).connect(dest);
    case 'bell':
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.002, decay: 0.35, sustain: 0.02, release: 0.5 },
      }).connect(dest);
    case 'pluck': {
      const g = new Tone.PluckSynth({ attackNoise: 1.1, dampening: 4000, resonance: 0.94 });
      g.connect(dest);
      g.__mono = true;
      return g;
    }
    default:
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.004, decay: 0.5, sustain: 0.12, release: 1.0 },
      }).connect(dest);
  }
}

/* 合成音のドラム（実録音キットが読めなかったときの予備）。
   v5：シンバル類とタム3種を実録音キットと同じ顔ぶれでそろえる。       */
function makeSynthKit(dest, level) {
  const out = new Tone.Gain(Tone.dbToGain(level)).connect(dest);
  const cym = makeCymbals(out);
  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.045, octaves: 6,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.34, sustain: 0, release: 0.1 },
  }).connect(out);
  const snareFilt = new Tone.Filter(1800, 'bandpass').connect(out);
  const snare = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.14, sustain: 0 } }).connect(snareFilt);
  const hatFilt = new Tone.Filter(7500, 'highpass').connect(out);
  const hat = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.035, sustain: 0 } }).connect(hatFilt);
  const tomS = new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 3, envelope: { attack: 0.001, decay: 0.3, sustain: 0 } }).connect(out);
  return {
    sampled: false, out,
    nodes: [kick, snare, hat, tomS, snareFilt, hatFilt, ...cym.nodes, out],
    kick:  (t, v) => kick.triggerAttackRelease('C1', '8n', t, v),
    snare: (t, v) => snare.triggerAttackRelease('16n', t, v),
    hat:   (t, v) => hat.triggerAttackRelease('32n', t, v),
    /* タムは同じ胴を音程違いで叩く。高 → 低 */
    tom:   (t, v) => tomS.triggerAttackRelease('A1', '8n', t, v),
    tom2:  (t, v) => tomS.triggerAttackRelease('F1', '8n', t, v),
    tom3:  (t, v) => tomS.triggerAttackRelease('D1', '4n', t, v),
    crash: cym.crash,
    ride:  cym.ride,
    open:  cym.open,
  };
}

/* ============ 3. いま何小節目・どのコードか ============ */
function barAtTime(time) {
  const ticks = Tone.Transport.getTicksAtTime(time);
  return Math.floor(ticks / (Tone.Transport.PPQ * 4));
}
function chordAtBar(bar) {
  const prog = PROGRESSIONS[State.prog];
  return prog.bars[((bar % prog.bars.length) + prog.bars.length) % prog.bars.length];
}
function isFillBar(bar) { return bar % 8 === 7; }

/* ============ 4. パート（カード1枚ぶん） ============ */
class Part {
  constructor(cardId) {
    const card = CARDS[cardId];
    this.id = cardId;
    this.card = card;
    this.role = cardId.split('-')[0];
    const s = card.sound;
    this.s = s;

    const bus = (s.duck && s.kind !== 'kit') ? duckBus : dryBus;
    /* v5：実録音の楽器には samples.js が実測した「録音レベル差の補正」を足す。
       これで music.js の gain は純粋に「どのくらい前に出したいか」になる。
       実録音が読めず合成音に落ちる場合は補正しない（測る対象が無いため）。 */
    const trim = (s.kind === 'sampler' && samplerUrls(s.set)) ? setTrimDb(s.set) : 0;
    this.gain = new Tone.Gain(Tone.dbToGain(s.gain + trim)).connect(bus);
    this.lp = new Tone.Filter(s.lp || 16000, 'lowpass').connect(this.gain);
    this.hp = new Tone.Filter(s.hp || 20, 'highpass').connect(this.lp);

    if (s.rev) { this.revSend = new Tone.Gain(s.rev).connect(reverb); this.gain.connect(this.revSend); }
    if (s.dly) { this.dlySend = new Tone.Gain(s.dly).connect(delay);  this.gain.connect(this.dlySend); }

    if (s.kind === 'kit') {
      this.kit = makeSampleKit(this.hp, s.set, 0) || makeSynthKit(this.hp, 0);
      this.sampled = this.kit.sampled;
      this.hasKick = card.drum.hasKick && card.drum.k.length > 0;
      this.seq = new Tone.Sequence((t, step) => this.tickDrum(t, step), STEPS, '16n');
    } else {
      this.voice = this.makeVoice();
      this.seq = new Tone.Sequence((t, step) => this.tickPitched(t, step), STEPS, '16n');
    }
  }

  makeVoice() {
    const s = this.s;
    let dest = this.hp;
    if (s.drive) {
      this.drive = new Tone.Distortion({ distortion: s.drive, wet: 0.45 }).connect(this.hp);
      dest = this.drive;
    }
    if (s.kind === 'sampler') {
      const smp = makeSampleVoice(s.set, s.env || {});
      if (smp) { this.sampled = true; smp.connect(dest); return smp; }
    }
    this.sampled = false;
    return makeSynthVoice(s.fb, dest);
  }

  /* --- 音階のあるパート --- */
  tickPitched(time, step) {
    const bar = barAtTime(time);
    const chord = chordAtBar(bar);
    /* 8小節に1回だけ旋律を1段持ち上げる。ずっと同じに聞こえないための仕掛け */
    const lift = (this.role === 'melody' && bar % 8 === 7) ? 1 : 0;

    /* v5：4小節目だけ patB（あれば）に差し替わる */
    patternAt(this.card, bar).forEach(ev => {
      if (ev.s !== step) return;
      if ((ev.e || 1) > State.energy) return;
      const notes = resolveNotes(this.role, chord, ev, this.s.oct, lift);
      const v = clamp(ev.v * (0.93 + Math.random() * 0.13) * State.velScale, 0.05, 1);
      const t = time + (Math.random() - 0.5) * 0.006;   // ほんの少しだけ人間っぽく
      this.play(notes, ev.l, t, v);
      this.flash(time, ev.v);
    });
  }

  play(notes, dur, time, v) {
    const voice = this.voice;
    if (!voice) return;
    try {
      if (voice.__mono) { notes.forEach((n, i) => voice.triggerAttack(n, time + i * 0.012)); return; }
      if (voice instanceof Tone.MonoSynth) { voice.triggerAttackRelease(notes[0], dur, time, v); return; }
      voice.triggerAttackRelease(notes.length === 1 ? notes[0] : notes, dur, time, v);
    } catch (e) { /* 同時発音の取りこぼしで演奏を止めない */ }
  }

  /* --- ドラムのパート --- */
  tickDrum(time, step) {
    const bar = barAtTime(time);
    const d = drumAt(this.card, bar);          // v5：4小節目は drumB に差し替わる
    const owner = State.kickOwner === this.id;
    const fill = isFillBar(bar) && owner;

    /* フィル：8小節目の4拍目だけ、通常パターンを止めて畳みかける。
       v5 は tom1→tom2→tom3 と「下りていくタム回し」になる（v4 はスネア連打）。 */
    if (fill && step >= 12) {
      const n = step - 12;                                   // 0..3
      const half = (60 / Tone.Transport.bpm.value) / 8;      // 32分ぶん
      const roll = [this.kit.snare, this.kit.tom, this.kit.tom2, this.kit.tom3][n];
      roll.call(this.kit, time, 0.55 + n * 0.12);
      this.kit.snare(time + half, 0.30 + n * 0.12);
      this.flash(time, 0.8);
      if (step === 12) pump(time, 0.6);
      return;
    }

    if (d.k.includes(step)) {
      /* キックを出せるのは「最初に入ったリズムカード」だけ。土台を1枚に絞る */
      if (owner) { this.kit.kick(time, 0.92); pump(time); this.flash(time, 1); UI.kickPulse(); }
    }
    if (d.s.includes(step)) { this.kit.snare(time, 0.56); this.flash(time, 0.7); }
    if (d.h.includes(step)) this.kit.hat(time, d.hv * (step % 4 === 0 ? 1.15 : 0.85));
    if (State.energy >= 3 && d.h3 && d.h3.includes(step)) this.kit.hat(time, d.hv * 0.55);
    if (State.energy >= 2 && d.ghost && d.ghost.includes(step)) this.kit.snare(time, 0.16);

    /* --- v5 で足した語彙 --- */
    if (d.t  && d.t.includes(step))  { this.kit.tom(time, 0.50);  this.flash(time, 0.5); }
    if (d.t2 && d.t2.includes(step)) { this.kit.tom2(time, 0.52); this.flash(time, 0.5); }
    if (d.t3 && d.t3.includes(step)) { this.kit.tom3(time, 0.56); this.flash(time, 0.5); }
    if (d.oh && d.oh.includes(step)) this.kit.open(time, 0.55);              // オープンハット
    if (d.rd && d.rd.includes(step)) {                                       // ライド
      this.kit.ride(time, (d.rv || 0.5) * (step % 4 === 0 ? 1.15 : 0.85));
      this.flash(time, 0.45);
    }
    /* クラッシュは crEvery 小節に1回だけ。土台役か、キックを持たない薄い層のみ
       （キック持ちが複数いるときに2枚ぶん重なって鳴るのを避ける）           */
    if (d.cr && d.cr.includes(step) && (owner || !this.hasKick)
        && bar % (d.crEvery || 8) === (d.crPhase || 0)) {
      this.kit.crash(time, 0.72);
      this.flash(time, 0.9);
    }
  }

  flash(time, v) { Tone.Draw.schedule(() => UI.flashCell(this.id, v), time); }

  start(ticks) { this.seq.start(ticks + 'i'); }

  fadeOutAndDispose(sec = 1.0) {
    try { this.gain.gain.rampTo(0, sec); } catch (e) {}
    try { this.seq.stop(); } catch (e) {}
    setTimeout(() => this.dispose(), sec * 1000 + 150);
  }

  dispose() {
    try { this.seq.stop(); this.seq.dispose(); } catch (e) {}
    const nodes = [this.voice, this.drive, ...(this.kit ? this.kit.nodes : []),
                   this.hp, this.lp, this.revSend, this.dlySend, this.gain];
    nodes.forEach(n => { try { n && n.dispose(); } catch (e) {} });
  }
}
const STEPS = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

/* ============ 5. 基礎ビート ============
   リズムカードが1枚も入っていないときだけ鳴る、心拍のような土台。
   リズムカードが入ったら静かに引っ込む。                             */
let baseKit, baseSeq;
const BASE = { k: [0, 8], h: [0, 2, 4, 6, 8, 10, 12, 14] };

function startBaseBeat() {
  baseKit = makeSampleKit(baseBus, BASE_KIT, -9) || makeSynthKit(baseBus, -8);
  baseSeq = new Tone.Sequence((time, step) => {
    if (State.kickOwner) return;                   // カードのキックが優先
    if (BASE.k.includes(step)) { baseKit.kick(time, 0.85); pump(time, 0.8); Tone.Draw.schedule(() => UI.kickPulse(), time); }
    if (BASE.h.includes(step)) baseKit.hat(time, step % 4 === 0 ? 0.16 : 0.09);
  }, STEPS, '16n').start(0);
}

/* ============ 6. 進行の状態 ============ */
const State = {
  playing: false, paused: false,
  quantize: 'beat',        // 'beat' | 'bar'
  prog: 'night',
  energy: 2,               // 1=静 2=走 3=熱
  velScale: 1,
  pumpOn: true,
  durationSec: 240,
  elapsed: 0,
  parts: new Map(),        // cardId -> Part
  order: [],               // 投入順（古い順）
  lastInput: new Map(),
  pending: new Set(),
  queue: [],               // 開始前に押されたカードの控え
  kickOwner: null,
  building: false,
  bar: 0, step: 0,
};

function nextBoundaryTicks() {
  const ppq = Tone.Transport.PPQ;
  const q = State.quantize === 'bar' ? ppq * 4 : ppq;
  const cur = Tone.Transport.ticks;
  const lead = Math.max(2, Math.round(ppq * 0.08));
  return Math.ceil((cur + lead) / q) * q;
}

/* リズムカードのうち「最初に入ったキック持ち」を土台に決める */
function recomputeKickOwner() {
  State.kickOwner = null;
  for (const id of State.order) {
    const p = State.parts.get(id);
    if (p && p.hasKick) { State.kickOwner = id; break; }
  }
  if (baseBus) baseBus.gain.rampTo(State.kickOwner ? 0 : 1, 0.8);
}

/* パートが増えても全体の音量感が破綻しないように少しずつ下げる */
function duckByCount() {
  const n = Math.max(1, State.parts.size);
  partsBus.gain.rampTo(Math.pow(n, -0.32), 0.4);
}

function labelOf(id) {
  const role = id.split('-')[0];
  const c = CARDS[id];
  return `${ROLES[role].jp}の${c.label}${c.n}`;
}

/* ---- カード投入（Phase 1 のリーダーもここを呼ぶだけでよい） ------------
   v5.1：同じ楽器の別バリエーション（ギター1が鳴っているところへギター3）が
   来たら、足すのではなく **差し替える**。物理カードでも同じ挙動になる。  */
function insertCard(cardId) {
  if (!CARDS[cardId]) return;
  /* 「はじめる」直後は音の準備（残響の生成など）に1秒ほどかかる。
     その間に押されたカードは捨てずに覚えておき、開始後に流し込む */
  if (!State.playing) { if (State.queue.length < MAX_PARTS) State.queue.push(cardId); return; }
  if (State.paused) return;
  const role = cardId.split('-')[0];
  const inst = CARDS[cardId].inst;

  /* 連打よけは「楽器」単位。バリエーションを巡回しても弾かれないよう、
     同じカードの再投入だけを見る */
  const now = performance.now();
  if (now - (State.lastInput.get(cardId) || 0) < RETRIGGER_GUARD_MS) return;
  State.lastInput.set(cardId, now);

  /* 同じカードをもう一度 → 引っ込める（トグル） */
  if (State.parts.has(cardId)) { removeCard(cardId); UI.toast(`${labelOf(cardId)} を止めました`); return; }

  /* 同じ楽器の別バリエーションが鳴っていたら、それと入れ替える */
  const sibling = State.order.find(id => CARDS[id].inst === inst);
  if (sibling) dropPart(sibling);

  /* ROLE ごとの上限。超えたらその ROLE のいちばん古い音と入れ替える */
  const sameRole = State.order.filter(id => id.split('-')[0] === role);
  while (sameRole.length >= ROLES[role].max) {
    const out = sameRole.shift();
    dropPart(out);
    UI.toast(`${ROLES[role].jp}は${ROLES[role].max}枚まで。${labelOf(out)} と交代しました`);
  }
  while (State.order.length >= MAX_PARTS) dropPart(State.order[0]);

  const part = new Part(cardId);
  const ticks = nextBoundaryTicks();
  part.start(ticks);

  State.parts.set(cardId, part);
  State.order.push(cardId);
  State.pending.add(cardId);
  UI.setCell(cardId, 'pending');
  recomputeKickOwner();
  duckByCount();
  UI.refreshNow();

  Tone.Transport.scheduleOnce((t) => {
    Tone.Draw.schedule(() => {
      if (!State.pending.has(cardId)) return;
      State.pending.delete(cardId);
      UI.setCell(cardId, 'active');
    }, t);
  }, ticks + 'i');
}

function dropPart(cardId) {
  const p = State.parts.get(cardId);
  if (p) p.fadeOutAndDispose(1.1);
  State.parts.delete(cardId);
  State.pending.delete(cardId);
  State.order = State.order.filter(x => x !== cardId);
  UI.setCell(cardId, '');
}

function removeCard(cardId) {
  if (!State.parts.has(cardId)) return;
  dropPart(cardId);
  recomputeKickOwner();
  duckByCount();
  UI.refreshNow();
}

/* ---- 楽器キーを押したとき（キーボード・セル本体のクリック）------------
   1回目 → 変化1 が入る
   2回目 → 変化2 に差し替わる
   3回目 → 変化3 に差し替わる
   4回目 → 止まる
   「同じカードをもう一度押すと止まる」を、バリエーションを一巡してから
   止まる形に伸ばしただけ。物理カードでは1枚ずつが独立したカードなので、
   この巡回はキーボード（とクリック）だけの都合。                      */
function pressInstrument(instId) {
  const playing = State.order.find(id => CARDS[id].inst === instId);
  if (!playing) { insertCard(`${instId}-1`); return; }
  const n = CARDS[playing].n;
  if (n < VARIATIONS.length) insertCard(`${instId}-${n + 1}`);
  else { removeCard(playing); UI.toast(`${labelOf(playing)} を止めました`); }
}

/* ============ 7. ビルドアップ＆ドロップ ============
   スペースキーで発動。2小節かけて持ち上げ、次の小節頭で落とす。
   ・ハイパスを上げていく（低音が抜けて宙に浮く）
   ・ノイズのライザーが上昇する
   ・スネアが細かくなっていく
   ・落とす直前に一瞬だけ無音 → 頭で全部戻る                        */
function triggerBuild() {
  if (!State.playing || State.paused || State.building) return;
  State.building = true;

  const ppq = Tone.Transport.PPQ;
  const barTicks = ppq * 4;
  const startTicks = Math.ceil((Tone.Transport.ticks + ppq * 0.2) / barTicks) * barTicks;
  const dropTicks = startTicks + barTicks * 2;

  UI.toast('ビルドアップ！ 2小節で落ちます');
  UI.setBuild(true);

  /* --- 立ち上がり：フィルタとライザーを仕込む --- */
  Tone.Transport.scheduleOnce((time) => {
    const beat = 60 / Tone.Transport.bpm.value;
    const len = beat * 8;                       // 2小節ぶんの秒数
    try {
      sweep.frequency.cancelScheduledValues(time);
      sweep.frequency.setValueAtTime(24, time);
      sweep.frequency.exponentialRampToValueAtTime(1100, time + len * 0.98);
    } catch (e) {}

    /* ノイズのライザー */
    const rg = new Tone.Gain(0).connect(master);
    const rf = new Tone.Filter({ type: 'bandpass', frequency: 400, Q: 2.2 }).connect(rg);
    const noise = new Tone.Noise('white').connect(rf);
    noise.start(time);
    rg.gain.setValueAtTime(0.0001, time);
    rg.gain.exponentialRampToValueAtTime(0.22, time + len * 0.95);
    rf.frequency.setValueAtTime(400, time);
    rf.frequency.exponentialRampToValueAtTime(6000, time + len * 0.95);
    rg.gain.exponentialRampToValueAtTime(0.0005, time + len + 0.05);
    setTimeout(() => { try { noise.stop(); noise.dispose(); rf.dispose(); rg.dispose(); } catch (e) {} }, (len + 0.6) * 1000);

    /* スネアロール：8分 → 16分 → 32分 と細かくなる */
    const kit = (State.kickOwner && State.parts.get(State.kickOwner)) ? State.parts.get(State.kickOwner).kit : baseKit;
    let t = time, i = 0;
    while (t < time + len - 0.02) {
      const prog = (t - time) / len;                       // 0→1
      const div = prog < 0.5 ? beat / 2 : prog < 0.85 ? beat / 4 : beat / 8;
      try { kit.snare(t, clamp(0.18 + prog * 0.65, 0.1, 0.95)); } catch (e) {}
      t += div; i++;
      if (i > 200) break;
    }
  }, startTicks + 'i');

  /* --- 落とす瞬間 --- */
  Tone.Transport.scheduleOnce((time) => {
    const beat = 60 / Tone.Transport.bpm.value;
    const gap = beat / 4;                                   // 16分1つぶんの静寂
    try {
      sweep.frequency.cancelScheduledValues(time - gap);
      sweep.frequency.setValueAtTime(1100, time - gap);
      partsBus.gain.cancelScheduledValues(time - gap);
      partsBus.gain.setValueAtTime(0.0001, time - gap);
      sweep.frequency.setValueAtTime(24, time);
      partsBus.gain.setValueAtTime(Math.pow(Math.max(1, State.parts.size), -0.32), time);
    } catch (e) {}

    const kit = (State.kickOwner && State.parts.get(State.kickOwner)) ? State.parts.get(State.kickOwner).kit : baseKit;
    /* v5：落ちる瞬間にクラッシュを重ねる。ここが「開けた」と感じる正体 */
    try { kit.kick(time, 1); kit.tom3(time, 0.85); kit.crash(time, 0.95); } catch (e) {}
    pump(time, 1.2);

    /* 状態そのものは音のタイミングで戻す。描画（Tone.Draw）は
       タブが裏に回ると止まるので、そこに状態管理を任せてはいけない */
    State.energy = 3;
    State.velScale = 1.08;
    State.building = false;
    Tone.Draw.schedule(() => {
      UI.setBuild(false);
      UI.dropFlash();
      UI.syncEnergy();
    }, time);
  }, dropTicks + 'i');
}

/* ============ 8. 開始・停止 ============ */
async function startGame(bpm) {
  await Tone.start();
  await buildMaster();
  Tone.Transport.bpm.value = bpm;
  Tone.Transport.timeSignature = 4;
  Tone.Transport.swingSubdivision = '16n';
  Tone.Transport.swing = State.swing || 0;

  startBaseBeat();

  /* 1ステップごとに画面のステップ表示を進める */
  Tone.Transport.scheduleRepeat((time) => {
    const ticks = Tone.Transport.getTicksAtTime(time);
    const step = Math.round(ticks / (Tone.Transport.PPQ / 4)) % 16;
    const bar = Math.floor(ticks / (Tone.Transport.PPQ * 4));
    Tone.Draw.schedule(() => { State.step = step; State.bar = bar; UI.stepTick(step, bar); }, time);
  }, '16n', 0);

  /* 残り時間 */
  Tone.Transport.scheduleRepeat((time) => {
    Tone.Draw.schedule(() => {
      State.elapsed++;
      UI.time();
      if (State.durationSec > 0 && State.elapsed >= State.durationSec) endGame();
    }, time);
  }, 1, 0);

  Tone.Transport.start('+0.12');
  if (recorder) { try { recorder.start(); } catch (e) {} }
  State.playing = true;
  State.paused = false;
  UI.startViz();

  /* 準備中に押されていたカードをここで入れる */
  const q = State.queue.splice(0);
  q.forEach(id => insertCard(id));
}

async function endGame() {
  if (!State.playing) return;
  State.playing = false;
  master.gain.rampTo(0, 3.2);
  setTimeout(async () => {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    State.parts.forEach(p => p.dispose());
    State.parts.clear(); State.order = []; State.pending.clear();
    try { baseSeq.stop(); baseSeq.dispose(); baseKit.nodes.forEach(n => n.dispose()); } catch (e) {}

    let url = null;
    if (recorder && recorder.state === 'started') {
      try { url = URL.createObjectURL(await recorder.stop()); } catch (e) { url = null; }
    }
    UI.showFinish(url);
  }, 3300);
}

/* ============ 9. 画面 ============ */
const UI = {
  cells: {},
  viz: null,
  pulse: 0,

  init() {
    /* --- カードのグリッド --- */
    const grid = document.getElementById('grid');
    grid.innerHTML = '';
    ROLE_ORDER.forEach(rk => {
      const r = ROLES[rk];
      const lab = el('div', 'role-label', '');
      lab.style.setProperty('--r', `var(--${rk})`);
      lab.innerHTML = `<div class="rl-en">${r.label}</div>
                       <div class="rl-jp">${r.role}</div>
                       <small>${r.desc}</small>
                       <div class="rl-max">同時${r.max}枚まで</div>`;
      grid.appendChild(lab);

      /* セルは「楽器」1つぶん。中の 1/2/3 がバリエーション。 */
      INSTRUMENT_ORDER[rk].forEach((instId, i) => {
        const inst = INSTRUMENTS[instId];
        const cell = el('div', 'cell', '');
        cell.style.setProperty('--r', `var(--${rk})`);
        cell.style.setProperty('--ra', `var(--${rk}-a)`);
        cell.dataset.inst = instId;
        cell.innerHTML =
          `<div class="top"><span class="key">${(r.keys[i] || '').toUpperCase()}</span><span class="src"></span></div>
           <div class="name">${inst.label}</div>
           <div class="tag">${inst.variants[0].tag}</div>
           <div class="vars">` +
          inst.variants.map((va, k) =>
            `<button class="vb" data-n="${k + 1}" title="${VARIATIONS[k].label}：${va.tag}">${k + 1}</button>`
          ).join('') +
          `</div><div class="bar"></div>`;

        /* セル本体 → バリエーションを巡回。番号ボタン → その変化を直接 */
        cell.addEventListener('click', (ev) => {
          const b = ev.target.closest('.vb');
          if (b) { ev.stopPropagation(); insertCard(`${instId}-${b.dataset.n}`); return; }
          pressInstrument(instId);
        });
        /* 番号にさわると、その変化の説明が下の tag に出る */
        cell.querySelectorAll('.vb').forEach((b, k) => {
          b.addEventListener('mouseenter', () => UI.showTag(instId, k + 1));
        });
        cell.addEventListener('mouseleave', () => UI.showTag(instId, null));

        grid.appendChild(cell);
        UI.cells[instId] = cell;
      });
    });

    /* --- 16ステップの目盛り --- */
    const ladder = document.getElementById('ladder');
    ladder.innerHTML = '';
    for (let i = 0; i < 16; i++) {
      const d = el('i', 'st' + (i % 4 === 0 ? ' down' : ''), '');
      ladder.appendChild(d);
    }

    /* --- 進行の選択（設定・本編で共用） --- */
    ['progchips', 'progchips2'].forEach(boxId => {
      const box = document.getElementById(boxId);
      if (!box) return;
      box.innerHTML = '';
      PROG_ORDER.forEach(pk => {
        const p = PROGRESSIONS[pk];
        const b = el('button', 'chip', '');
        b.innerHTML = `<b>${p.label}</b> ${p.desc}`;
        b.dataset.prog = pk;
        b.setAttribute('aria-pressed', String(pk === State.prog));
        b.addEventListener('click', () => setProgression(pk));
        box.appendChild(b);
      });
    });

    /* --- 変化1/2/3 が何なのかの凡例 --- */
    const leg = document.getElementById('varlegend');
    if (leg) {
      leg.innerHTML = VARIATIONS
        .map(v => `<span><b>${v.n}</b>${v.label}／${v.desc}</span>`).join('');
    }

    UI.chordMap();
    UI.time();
  },

  /* 各楽器が実録音か合成音かを表示する。バリエーションで音源が変わる楽器
     （ドラムのキット差し替えなど）は、ひとつでも合成に落ちたら「一部合成」 */
  markSources() {
    Object.keys(INSTRUMENTS).forEach(instId => {
      const cell = UI.cells[instId]; if (!cell) return;
      const reals = INSTRUMENTS[instId].variants.map((_, k) => {
        const s = CARDS[`${instId}-${k + 1}`].sound;
        if (s.kind === 'kit') return !!kitUrls(s.set);
        if (s.kind === 'sampler') return !!samplerUrls(s.set);
        return false;
      });
      const all = reals.every(Boolean), none = !reals.some(Boolean);
      const e = cell.querySelector('.src');
      e.textContent = all ? '実録音' : none ? '合成音' : '一部合成';
      e.className = 'src' + (all ? ' real' : '');
    });
  },

  /* cardId を渡すと、その楽器のセルに印をつけ、何番の変化かも示す */
  setCell(cardId, cls) {
    const card = CARDS[cardId]; if (!card) return;
    const c = UI.cells[card.inst]; if (!c) return;
    c.classList.remove('pending', 'active');
    if (cls) c.classList.add(cls);
    c.querySelectorAll('.vb').forEach(b =>
      b.classList.toggle('on', !!cls && Number(b.dataset.n) === card.n));
    UI.showTag(card.inst, cls ? card.n : null);
  },

  /* セルの説明文を「いま鳴っている変化」または「さわっている変化」にする */
  showTag(instId, n) {
    const c = UI.cells[instId]; if (!c) return;
    const inst = INSTRUMENTS[instId];
    let k = n;
    if (k == null) {
      const on = c.querySelector('.vb.on');
      k = on ? Number(on.dataset.n) : 1;
    }
    c.querySelector('.tag').textContent = inst.variants[k - 1].tag;
  },

  flashCell(cardId, v) {
    const card = CARDS[cardId]; if (!card) return;
    const c = UI.cells[card.inst]; if (!c) return;
    const bar = c.querySelector('.bar');
    bar.style.transition = 'none'; bar.style.width = Math.round(v * 100) + '%';
    requestAnimationFrame(() => { bar.style.transition = 'width .26s ease-out'; bar.style.width = '0%'; });
  },
  kickPulse() { UI.pulse = 1; },

  stepTick(step, bar) {
    const dots = document.querySelectorAll('#ladder .st');
    dots.forEach((d, i) => d.classList.toggle('on', i === step));
    UI.chordMap();
    document.getElementById('barnum').textContent = (bar % 8) + 1;
  },

  /* コード表示。作り直すのは進行が変わったときだけで、
     毎ステップは「いまどれか」の印を付け替えるだけにする */
  chordMap() {
    const box = document.getElementById('chordmap');
    const prog = PROGRESSIONS[State.prog];
    if (box.dataset.prog !== State.prog) {
      box.dataset.prog = State.prog;
      box.innerHTML = '';
      prog.bars.forEach(c => box.appendChild(el('div', 'ch', c.label)));
    }
    const cur = State.playing ? ((State.bar % prog.bars.length) + prog.bars.length) % prog.bars.length : 0;
    [...box.children].forEach((d, i) => d.classList.toggle('on', i === cur));
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
    UI.time();
    if (State.order.length === 0) {
      box.innerHTML = '<div class="empty">いまは基礎ビートだけ。カードを入れて積み上げてください。</div>';
      return;
    }
    State.order.forEach(id => {
      const role = id.split('-')[0];
      const card = CARDS[id];
      const p = el('div', 'pill', '');
      p.style.setProperty('--r', `var(--${role})`);
      p.style.setProperty('--ra', `var(--${role}-a)`);
      const tag = (State.kickOwner === id) ? ' ★土台' : '';
      p.innerHTML = `<span>${card.label}<b class="vn">${card.n}</b>`
                  + `<i class="vk">${VARIATIONS[card.n - 1].label}</i>${tag}</span>`;
      const b = el('button', '', '×');
      b.title = 'この音を止める';
      b.addEventListener('click', () => removeCard(id));
      p.appendChild(b);
      box.appendChild(p);
    });
  },

  syncEnergy() {
    document.querySelectorAll('#energychips .chip').forEach(c =>
      c.setAttribute('aria-pressed', String(Number(c.dataset.e) === State.energy)));
  },
  syncProg() {
    document.querySelectorAll('[data-prog]').forEach(c =>
      c.setAttribute('aria-pressed', String(c.dataset.prog === State.prog)));
  },

  setBuild(on) { document.body.classList.toggle('building', on); },
  dropFlash() {
    const f = document.getElementById('dropflash');
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  },

  toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(UI._tt);
    UI._tt = setTimeout(() => t.classList.remove('show'), 1700);
  },

  /* --- ビジュアライザ：波形のリングと、キックで広がる円 --- */
  startViz() {
    const cv = document.getElementById('viz');
    const ctx = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const roleColor = { melody: '#ffc45e', chord: '#b39bff', bass: '#59a6ff', rhythm: '#3ce0b0' };

    const draw = () => {
      requestAnimationFrame(draw);
      const w = cv.clientWidth, h = cv.clientHeight;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;

      const wave = analyser ? analyser.getValue() : null;
      let rms = 0;
      if (wave) { for (let i = 0; i < wave.length; i++) rms += wave[i] * wave[i]; rms = Math.sqrt(rms / wave.length); }

      UI.pulse *= 0.90;
      const base = Math.min(w, h) * 0.22;
      const R = base * (1 + rms * 1.6 + UI.pulse * 0.35);

      /* キックの衝撃波 */
      if (UI.pulse > 0.02) {
        ctx.beginPath();
        ctx.arc(cx, cy, R + (1 - UI.pulse) * base * 1.9, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,255,255,${UI.pulse * 0.28})`;
        ctx.lineWidth = 2 + UI.pulse * 3;
        ctx.stroke();
      }

      /* 鳴っている ROLE の色を混ぜてリングを描く */
      const roles = [...new Set(State.order.map(id => id.split('-')[0]))];
      const cols = roles.length ? roles.map(r => roleColor[r]) : ['#5b6478'];
      const grad = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      cols.forEach((c, i) => grad.addColorStop(cols.length === 1 ? i : i / (cols.length - 1), c));

      if (wave) {
        ctx.beginPath();
        const N = 180;
        for (let i = 0; i <= N; i++) {
          const a = (i / N) * Math.PI * 2 - Math.PI / 2;
          const s = wave[Math.floor(i / N * (wave.length - 1))] || 0;
          const r = R + s * base * 1.15;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.2;
        ctx.shadowBlur = 22; ctx.shadowColor = cols[0];
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      /* 4小節サイクルの進み具合を弧で示す */
      const prog = PROGRESSIONS[State.prog];
      const cycle = ((State.bar % prog.bars.length) + (State.step / 16)) / prog.bars.length;
      ctx.beginPath();
      ctx.arc(cx, cy, base * 1.62, -Math.PI / 2, -Math.PI / 2 + cycle * Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,.18)';
      ctx.lineWidth = 3;
      ctx.stroke();

      /* 真ん中にいまのコード */
      const ch = chordAtBar(State.bar);
      ctx.fillStyle = 'rgba(232,236,244,.92)';
      ctx.font = `600 ${Math.round(base * 0.42)}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ch.label, cx, cy);
    };
    draw();
  },

  showFinish(url) {
    const f = document.getElementById('finish');
    const audio = document.getElementById('playback');
    const dl = document.getElementById('dl');
    if (url) {
      audio.src = url; audio.style.display = '';
      dl.href = url; dl.style.display = '';
    } else {
      audio.style.display = 'none'; dl.style.display = 'none';
      document.getElementById('finishmsg').textContent =
        'おつかれさまでした。（このブラウザでは録音を保存できませんでした）';
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

/* ============ 10. グローバル操作 ============ */
function setProgression(pk) {
  if (!PROGRESSIONS[pk]) return;
  State.prog = pk;
  UI.syncProg();
  UI.chordMap();
  if (State.playing) UI.toast(`進行を「${PROGRESSIONS[pk].label}」に切り替えました`);
}
function setEnergy(n) {
  State.energy = clamp(n, 1, 3);
  State.velScale = [0.86, 1, 1.08][State.energy - 1];
  UI.syncEnergy();
  if (State.playing) UI.toast(`ENERGY ${['静', '走', '熱'][State.energy - 1]}`);
}
function setSwing(v) {
  State.swing = v;
  if (Tone.Transport) Tone.Transport.swing = v;
  document.getElementById('swingv').textContent = Math.round(v * 100) + '%';
}

/* ============ 11. キーボード（＝カードの代わり） ============
   キーは「楽器」に対応する。同じキーを押すたびに変化1→2→3→止まる。
   数字キー（Shift＋）ではなく巡回にしたのは、40楽器ぶんのキーで
   手いっぱいだから。物理カードでは変化ごとに別のカードになる。      */
const KEYMAP = {};
ROLE_ORDER.forEach(rk => {
  ROLES[rk].keys.forEach((k, i) => {
    const id = INSTRUMENT_ORDER[rk][i];
    if (id) KEYMAP[k] = id;
  });
});

/* Phase 1（RFIDリーダー）用：打ち込まれるUIDを拾うバッファ */
let uidBuf = '', uidTimer = null;

document.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();

  if (e.key === 'Escape') { endGame(); return; }
  if (e.key === ' ') { e.preventDefault(); triggerBuild(); return; }
  if (e.key === 'Backspace') {
    e.preventDefault();
    const last = State.order[State.order.length - 1];
    if (last) removeCard(last);
    return;
  }
  if (e.key === 'ArrowUp') { e.preventDefault(); setEnergy(State.energy + 1); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); setEnergy(State.energy - 1); return; }
  /* v5：カードが40枚になり P が CHORD のキーになったので、進行の切り替えは Tab へ */
  if (e.key === 'Tab') { e.preventDefault(); setProgression(PROG_ORDER[(PROG_ORDER.indexOf(State.prog) + 1) % PROG_ORDER.length]); return; }
  if (e.key === 'Enter') {                    // HIDリーダーは末尾にEnterを打つ
    if (uidBuf.length >= 6 && CARD_MAP[uidBuf]) insertCard(CARD_MAP[uidBuf]);
    uidBuf = '';
    return;
  }
  if (/^[0-9]$/.test(e.key)) {
    uidBuf += e.key;
    clearTimeout(uidTimer);
    uidTimer = setTimeout(() => { uidBuf = ''; }, 400);
  }
  const instId = KEYMAP[k];
  if (instId) { e.preventDefault(); pressInstrument(instId); }
});

/* ============ 12. 起動時：音源の読み込み ============ */
async function bootSamples() {
  const bar = document.querySelector('#loadbar > div');
  const msg = document.getElementById('loadmsg');
  const btn = document.getElementById('startbtn');

  if (location.protocol === 'file:') {
    msg.innerHTML = '<b>「はじめる.bat」から開いてください。</b><br>'
      + 'ファイルを直接開くと、ブラウザの制限で音源を読み込めません（全パートが合成音になります）。';
    document.getElementById('loadbar').style.display = 'none';
    btn.disabled = false; btn.textContent = 'このまま合成音ではじめる';
    return;
  }

  btn.disabled = true;
  const res = await preloadSamples((done, total) => {
    if (total === 0) return;
    bar.style.width = (done / total * 100) + '%';
    msg.textContent = `本格音源を読み込んでいます… ${done} / ${total}`;
  });

  UI.markSources();
  document.getElementById('loadbar').style.display = 'none';
  btn.disabled = false;

  if (res.loaded === 0) {
    msg.innerHTML = '<b>音源が見つかりませんでした。</b><br>'
      + '「音源をダウンロード.bat」を先に1度だけ実行してください。<br>'
      + 'このまま始めた場合は、全パートが合成音になります。';
    btn.textContent = 'このまま合成音ではじめる';
  } else {
    const sets = Object.keys((window.SAMPLE_MANIFEST || {}).pitched || {}).length;
    msg.innerHTML = `本格音源 ${res.loaded} 個を読み込みました。`
      + `<br>${sets}種類の楽器が<b>実録音</b>、シンセ系だけ<b>合成音</b>です。`
      + '<br>音源ごとの録音レベル差は、読み込み時に実測してそろえてあります。';
  }
}

/* ============ 13. 画面まわりの配線 ============ */
document.addEventListener('DOMContentLoaded', () => {
  UI.init();
  UI.syncEnergy();
  UI.syncProg();
  bootSamples();

  const bpm = document.getElementById('bpm');
  bpm.addEventListener('input', () => { document.getElementById('bpmv').textContent = bpm.value; });

  const swing = document.getElementById('swing');
  swing.addEventListener('input', () => setSwing(Number(swing.value) / 100));
  setSwing(Number(swing.value) / 100);

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
  document.querySelectorAll('#energychips .chip').forEach(c => {
    c.addEventListener('click', () => setEnergy(Number(c.dataset.e)));
  });

  document.getElementById('startbtn').addEventListener('click', async () => {
    const v = Number(bpm.value);
    document.getElementById('bpmshow').textContent = v;
    document.getElementById('setup').classList.add('hidden');
    State.elapsed = 0; UI.time();
    await startGame(v);
    UI.refreshNow();
  });

  document.getElementById('dropbtn').addEventListener('click', () => triggerBuild());
  document.getElementById('pausebtn').addEventListener('click', (e) => {
    if (!State.playing) return;
    State.paused = !State.paused;
    if (State.paused) { Tone.Transport.pause(); e.target.textContent = '再開'; }
    else { Tone.Transport.start(); e.target.textContent = '一時停止'; }
  });
  document.getElementById('stopbtn').addEventListener('click', () => endGame());
  document.getElementById('againbtn').addEventListener('click', () => location.reload());
});

/* Phase 1（RFID）で使う入口 */
window.insertCard = insertCard;
window.removeCard = removeCard;
