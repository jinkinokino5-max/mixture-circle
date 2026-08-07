/* =====================================================================
   ミクスチャー・サークル STUDIO — 本格音源版
   ---------------------------------------------------------------------
   Phase 0 版（output/phase0-app）との違いはひとつだけ：
     ピアノ・ギター・ベース・ブラス・ドラムを「実録音サンプル」で鳴らす。
     シンセだけは合成音のまま（シンセはシンセの音であるべきなので）。

   音楽の骨組み（音階の固定・帯域の住み分け・拍頭への同期・同時6パート）は
   Phase 0 とまったく同じ。カードIDもキー配置も互換なので、
   印刷済みカードと cards.js はそのまま使える。

   サンプルが1つも無い場合でも、全パートが合成音になるだけで動く。
   ===================================================================== */

/* ============ 1. 音階 ============ */
const PENTA = ['C', 'Eb', 'F', 'G', 'Bb'];      // Cマイナー・ペンタトニック
function noteOf(deg, baseOct) {
  const i = ((deg % 5) + 5) % 5;
  const oct = baseOct + Math.floor(deg / 5);
  return PENTA[i] + oct;
}

/* ============ 2. 楽器（列） ============
   kind : 'sampler' = 実録音 / 'kit' = 実録音ドラム / 'synth' = 合成音
   set  : 使うサンプル一式の名前（ギターだけジャンルで変わるので GENRES 側で指定）
   env  : サンプラーのアタック／リリース
   oct  : 基準オクターブ（周波数の住み分け）
   hp/lp: 帯域の住み分けフィルタ
   fb   : サンプルが無いときに使う合成音の種類（Phase 0 と同じ音）        */
const INSTRUMENTS = {
  bass:   { label: 'ベース', kind: 'sampler', set: 'bass-electric', fb: 'mono',
            oct: 2, deg: 0, hp: 30,  lp: 1400,  gain: -5,  vary: false,
            env: { attack: 0.002, release: 0.25 } },
  drums:  { label: 'ドラム', kind: 'kit',     fb: 'drum',
            oct: 0, deg: 0, hp: 28,  lp: 16000, gain: -7,  vary: false },
  guitar: { label: 'ギター', kind: 'sampler', fb: 'pluck',
            oct: 3, deg: 0, hp: 110, lp: 7000,  gain: -7,  vary: false,
            env: { attack: 0.002, release: 0.5 } },
  piano:  { label: 'ピアノ', kind: 'sampler', set: 'piano', fb: 'poly',
            oct: 4, deg: 0, hp: 120, lp: 12000, gain: -11, vary: true,
            env: { attack: 0, release: 1.4 } },
  brass:  { label: 'ブラス', kind: 'sampler', set: 'trumpet', fb: 'brass',
            oct: 4, deg: 4, hp: 200, lp: 9000,  gain: -15, vary: true,
            env: { attack: 0.01, release: 0.35 } },
  synth:  { label: 'シンセ', kind: 'synth',   fb: 'lead',
            oct: 5, deg: 2, hp: 420, lp: 9000,  gain: -16, vary: true },
};
const INST_ORDER = ['piano', 'guitar', 'bass', 'drums', 'brass', 'synth'];

/* ============ 3. ジャンル（行） ============
   mel  : 旋律パターン（1小節=16ステップ）s=ステップ, d=音度, v=強さ, l=音の長さ
          → ピアノ・シンセが共有する
   bass : ベース専用パターン（歩く／刻む役割）
   comp : ギター専用パターン（コード刻み／リフ役）
   stab : ブラス専用パターン（短い一撃＝ホーンスタブ）
   drm  : ドラムパターン k=キック s=スネア h=ハイハット
   gtr  : そのジャンルで使うギターの音源（生ギター／エレキ）
   kit  : そのジャンルで使うドラムキット
   drive: エレキに軽く歪みを足すか                                     */
const GENRES = {
  jazz: {
    label: 'ジャズ', sub: 'JAZZ', desc: '深い青・スウィング・裏拍',
    keys: ['1', '2', '3', '4', '5', '6'],
    gtr: 'guitar-acoustic', kit: 'acoustic-kit', drive: 0,
    mel: [
      { s: 2, d: 0, v: .70, l: '8n' }, { s: 5, d: 2, v: .50, l: '16n' },
      { s: 6, d: 3, v: .45, l: '16n' }, { s: 8, d: 1, v: .72, l: '8n' },
      { s: 11, d: 4, v: .50, l: '16n' }, { s: 14, d: 2, v: .65, l: '8n' },
    ],
    bass: [   // ウォーキングベース：ルート→上って→下りる
      { s: 0, d: 0, v: .80, l: '8n' }, { s: 3, d: 2, v: .60, l: '8n' },
      { s: 6, d: 3, v: .65, l: '8n' }, { s: 8, d: 4, v: .78, l: '8n' },
      { s: 11, d: 3, v: .60, l: '8n' }, { s: 14, d: 2, v: .65, l: '8n' },
    ],
    comp: [   // 裏拍コンピング（Freddie Green風）
      { s: 2, d: 2, v: .55, l: '16n' }, { s: 6, d: 3, v: .50, l: '16n' },
      { s: 10, d: 2, v: .55, l: '16n' }, { s: 14, d: 4, v: .60, l: '16n' },
    ],
    stab: [   // ホーンの合いの手（シャウト）
      { s: 3, d: 3, v: .60, l: '8n' }, { s: 8, d: 1, v: .65, l: '8n' },
      { s: 13, d: 4, v: .55, l: '8n' },
    ],
    drm: { k: [0, 10], s: [4, 12], h: [2, 3, 6, 10, 11, 14], hv: .28 },
  },
  rock: {
    label: 'ロック', sub: 'ROCK', desc: '赤黒・8分・強拍',
    keys: ['q', 'w', 'e', 'r', 't', 'y'],
    gtr: 'guitar-electric', kit: 'acoustic-kit', drive: 0.3,
    mel: [
      { s: 0, d: 0, v: .90, l: '8n' }, { s: 2, d: 0, v: .55, l: '8n' },
      { s: 4, d: 3, v: .80, l: '8n' }, { s: 6, d: 0, v: .55, l: '8n' },
      { s: 8, d: 2, v: .88, l: '8n' }, { s: 10, d: 2, v: .55, l: '8n' },
      { s: 12, d: 4, v: .82, l: '8n' }, { s: 14, d: 3, v: .62, l: '8n' },
    ],
    bass: [   // キックに張り付く8分の押し出し（ルート主体＋経過音）
      { s: 0, d: 0, v: .90, l: '8n' }, { s: 2, d: 0, v: .55, l: '8n' },
      { s: 4, d: 0, v: .60, l: '8n' }, { s: 6, d: 3, v: .75, l: '8n' },
      { s: 8, d: 0, v: .88, l: '8n' }, { s: 10, d: 0, v: .55, l: '8n' },
      { s: 12, d: 0, v: .60, l: '8n' }, { s: 14, d: 3, v: .75, l: '8n' },
    ],
    comp: [   // パワーコード（ルート⇔5度）のチャグ
      { s: 0, d: 0, v: .85, l: '16n' }, { s: 3, d: 3, v: .60, l: '16n' },
      { s: 4, d: 0, v: .80, l: '16n' }, { s: 7, d: 3, v: .60, l: '16n' },
      { s: 8, d: 0, v: .85, l: '16n' }, { s: 11, d: 3, v: .60, l: '16n' },
      { s: 12, d: 0, v: .80, l: '16n' }, { s: 15, d: 3, v: .60, l: '16n' },
    ],
    stab: [   // 一発でぶちかますホーンヒット
      { s: 0, d: 0, v: .85, l: '8n' }, { s: 8, d: 2, v: .80, l: '8n' },
      { s: 12, d: 4, v: .70, l: '8n' },
    ],
    drm: { k: [0, 6, 8, 14], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], hv: .35 },
  },
  classic: {
    label: 'クラシック', sub: 'CLASSIC', desc: '白金・伸びる音・優雅',
    keys: ['a', 's', 'd', 'f', 'g', 'h'],
    gtr: 'guitar-acoustic', kit: 'acoustic-kit', drive: 0,
    mel: [
      { s: 0, d: 0, v: .55, l: '2n' }, { s: 4, d: 2, v: .42, l: '4n' },
      { s: 8, d: 4, v: .55, l: '2n' }, { s: 12, d: 3, v: .42, l: '4n' },
    ],
    bass: [   // ペダルトーン（ルート→5度）
      { s: 0, d: 0, v: .55, l: '2n' }, { s: 8, d: 3, v: .50, l: '2n' },
    ],
    comp: [   // ゆるやかな上行アルペジオ
      { s: 0, d: 0, v: .38, l: '4n' }, { s: 4, d: 2, v: .34, l: '4n' },
      { s: 8, d: 4, v: .40, l: '4n' }, { s: 12, d: 3, v: .32, l: '4n' },
    ],
    stab: [   // ファンファーレ（伸ばし気味の2音）
      { s: 0, d: 0, v: .45, l: '4n' }, { s: 8, d: 3, v: .42, l: '4n' },
    ],
    drm: { k: [0, 8], s: [], h: [12, 13, 14], hv: .12 },
  },
  electro: {
    label: 'エレクトロ', sub: 'ELECTRO', desc: 'ネオン・16分・機械的',
    keys: ['z', 'x', 'c', 'v', 'b', 'n'],
    gtr: 'guitar-electric', kit: 'LINN', drive: 0.2,
    mel: [
      { s: 0, d: 0, v: .80, l: '16n' }, { s: 1, d: 0, v: .35, l: '16n' },
      { s: 2, d: 3, v: .55, l: '16n' }, { s: 4, d: 2, v: .70, l: '16n' },
      { s: 6, d: 2, v: .45, l: '16n' }, { s: 7, d: 4, v: .55, l: '16n' },
      { s: 8, d: 1, v: .80, l: '16n' }, { s: 9, d: 1, v: .35, l: '16n' },
      { s: 10, d: 3, v: .55, l: '16n' }, { s: 12, d: 4, v: .70, l: '16n' },
      { s: 13, d: 3, v: .45, l: '16n' }, { s: 14, d: 2, v: .55, l: '16n' },
      { s: 15, d: 0, v: .45, l: '16n' },
    ],
    bass: [   // キックと同期して脈打つルート（サイドチェイン風）
      { s: 0, d: 0, v: .90, l: '16n' }, { s: 2, d: 0, v: .40, l: '16n' },
      { s: 4, d: 0, v: .85, l: '16n' }, { s: 6, d: 0, v: .40, l: '16n' },
      { s: 8, d: 0, v: .90, l: '16n' }, { s: 10, d: 0, v: .40, l: '16n' },
      { s: 12, d: 0, v: .85, l: '16n' }, { s: 14, d: 0, v: .40, l: '16n' },
    ],
    comp: [   // 裏拍で刺すシンセスタブ（キック・ベースと組む）
      { s: 1, d: 0, v: .50, l: '16n' }, { s: 5, d: 3, v: .45, l: '16n' },
      { s: 9, d: 2, v: .50, l: '16n' }, { s: 13, d: 4, v: .45, l: '16n' },
    ],
    stab: [   // トランス風ホーンスタブ（ダウンビートに重ねる）
      { s: 4, d: 2, v: .75, l: '16n' }, { s: 12, d: 4, v: .70, l: '16n' },
    ],
    drm: { k: [0, 4, 8, 12], s: [4, 12], h: [1, 3, 5, 7, 9, 11, 13, 15], hv: .3 },
  },
};
const GENRE_ORDER = ['jazz', 'rock', 'classic', 'electro'];

const MAX_PARTS = 6;
const RETRIGGER_GUARD_MS = 500;   // 同一カードの連続読み取りを無視する時間
const BASE_KIT = 'acoustic-kit';  // ずっと鳴っている基礎ビートのキット

/* その楽器＋ジャンルが使うサンプル一式の名前 */
function setNameFor(instKey, genreKey) {
  if (instKey === 'guitar') return GENRES[genreKey].gtr;
  return INSTRUMENTS[instKey].set || null;
}

/* ============ 4. 音の出口（マスター） ============ */
let master, limiter, comp, partsBus, beatBus, reverb, recorder;

async function buildMaster() {
  limiter = new Tone.Limiter(-1).toDestination();
  /* 実録音は音の粒がばらつくので、まとめて軽く圧縮して座りを良くする */
  comp   = new Tone.Compressor({ threshold: -20, ratio: 3, attack: 0.006, release: 0.12 }).connect(limiter);
  master = new Tone.Gain(0.9).connect(comp);

  reverb = new Tone.Reverb({ decay: 2.4, preDelay: 0.02, wet: 1 }).connect(master);
  try { await reverb.generate(); } catch (e) { /* 生成に失敗しても音は出る */ }

  partsBus = new Tone.Gain(1).connect(master);
  beatBus  = new Tone.Gain(1).connect(master);
  try {
    recorder = new Tone.Recorder();
    master.connect(recorder);
  } catch (e) { recorder = null; }
}

/* ============ 5. 合成音のドラム（サンプルが無いときの予備） ============ */
function makeSynthKit(dest, level) {
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
    sampled: false,
    nodes: [kick, snare, hat, snareFilt, hatFilt, out],
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
    this.send = new Tone.Gain(instKey === 'brass' ? 0.20 : 0.13).connect(reverb);
    this.gain.connect(this.send);
    this.lp = new Tone.Filter(inst.lp, 'lowpass').connect(this.gain);
    this.hp = new Tone.Filter(inst.hp, 'highpass').connect(this.lp);

    if (inst.kind === 'kit') {
      this.kit = makeSampleKit(this.hp, genre.kit, 0) || makeSynthKit(this.hp, 0);
      this.sampled = this.kit.sampled;
      this.seq = new Tone.Sequence((time, step) => this.tickDrum(time, step), range16(), '16n');
    } else {
      this.voice = this.makeVoice(inst, genre);
      this.seq = new Tone.Sequence((time, step) => this.tickMel(time, step), range16(), '16n');
    }
  }

  makeVoice(inst, genre) {
    /* まず実録音を試す。無ければ Phase 0 と同じ合成音に落ちる */
    if (inst.kind === 'sampler') {
      const smp = makeSampleVoice(setNameFor(this.instKey, this.genreKey), inst.env);
      if (smp) {
        this.sampled = true;
        /* エレキギターだけ、ジャンルに応じて軽く歪ませる */
        if (this.instKey === 'guitar' && genre.drive > 0) {
          this.drive = new Tone.Distortion({ distortion: genre.drive, wet: 0.4 }).connect(this.hp);
          smp.connect(this.drive);
        } else {
          smp.connect(this.hp);
        }
        return smp;
      }
    }
    this.sampled = false;
    return this.makeSynthVoice(inst.fb);
  }

  /* Phase 0 版とまったく同じ合成音。シンセは常にこちらを使う */
  makeSynthVoice(fb) {
    switch (fb) {
      case 'mono':
        return new Tone.MonoSynth({
          oscillator: { type: 'sawtooth' },
          filter: { Q: 1.4, type: 'lowpass', rolloff: -24 },
          envelope: { attack: 0.008, decay: 0.22, sustain: 0.6, release: 0.22 },
          filterEnvelope: { attack: 0.008, decay: 0.2, sustain: 0.3, release: 0.25, baseFrequency: 140, octaves: 3.0 },
        }).connect(this.hp);
      case 'pluck': {
        const gtr = new Tone.PluckSynth({ attackNoise: 1.2, dampening: 3800, resonance: 0.95 });
        this.drive = new Tone.Distortion({ distortion: 0.38, wet: 0.5 }).connect(this.hp);
        gtr.connect(this.drive);
        return gtr;
      }
      case 'brass':
        return new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'fatsawtooth', count: 3, spread: 25 },
          envelope: { attack: 0.012, decay: 0.16, sustain: 0.22, release: 0.22 },
        }).connect(this.hp);
      case 'lead':   // シンセ：短く硬い（要望どおり合成音のまま）
        return new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'square' },
          envelope: { attack: 0.004, decay: 0.12, sustain: 0.08, release: 0.18 },
        }).connect(this.hp);
      default:       // ピアノの予備
        return new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.004, decay: 0.5, sustain: 0.12, release: 1.1 },
        }).connect(this.hp);
    }
  }

  tickMel(time, step) {
    const pattern = this.instKey === 'bass' ? this.genre.bass
      : this.instKey === 'guitar' ? this.genre.comp
      : this.instKey === 'brass' ? this.genre.stab
      : this.genre.mel;
    const ev = pattern.find(e => e.s === step);
    if (!ev) return;
    const vary = this.inst.vary && (barIndex % 4 === 3) ? 1 : 0;
    const note = noteOf(this.inst.deg + ev.d + vary, this.inst.oct);
    /* 合成音のギター（PluckSynth）だけは release を取らない */
    if (!this.sampled && this.inst.fb === 'pluck') this.voice.triggerAttack(note, time);
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
    const nodes = [this.voice, this.drive, ...(this.kit ? this.kit.nodes : []), this.hp, this.lp, this.send, this.gain];
    nodes.forEach(n => { try { n && n.dispose(); } catch (e) {} });
  }
}
function range16() { return [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]; }

/* ============ 7. 基礎ビート（常に鳴り続ける） ============ */
let baseKit, baseSeq;
const BASE = { k: [0, 8], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14] };

function startBaseBeat() {
  baseKit = makeSampleKit(beatBus, BASE_KIT, -8) || makeSynthKit(beatBus, -7);
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
  await buildMaster();
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
                       <div class="src"></div>
                       <div class="bar"></div>`;
        c.addEventListener('click', () => insertCard(id));
        grid.appendChild(c);
        UI.cells[id] = c;
      });
    });
    UI.time();
  },
  /* 各マスに「実録音」か「合成音」かを表示する */
  markSources() {
    GENRE_ORDER.forEach(gk => INST_ORDER.forEach(ik => {
      const c = UI.cells[gk + '-' + ik]; if (!c) return;
      const inst = INSTRUMENTS[ik];
      let real = false;
      if (inst.kind === 'kit') real = !!kitUrls(GENRES[gk].kit);
      else if (inst.kind === 'sampler') real = !!samplerUrls(setNameFor(ik, gk));
      const s = c.querySelector('.src');
      s.textContent = real ? '実録音' : '合成音';
      s.className = 'src' + (real ? ' real' : '');
    }));
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
    msg.innerHTML = `本格音源 ${res.loaded} 個を読み込みました。`
      + '<br>ピアノ・ギター・ベース・ブラス・ドラムは<b>実録音</b>、シンセは<b>合成音</b>です。';
  }
}

/* ============ 13. 画面まわりの配線 ============ */
document.addEventListener('DOMContentLoaded', () => {
  UI.init();
  bootSamples();

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
