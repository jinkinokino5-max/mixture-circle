/* =====================================================================
   engine.js — 音を出す部分（v3）
   ---------------------------------------------------------------------
   このファイルの目的はただ一つ、**カードを出した瞬間を気持ちよくすること**。

   v2 が地味だった原因と、その直し方：

   ┌ v2 の問題 ──────────────┬ v3 の対処 ────────────────────────┐
   │ パートが増えるほど各パートの │ やめた。足すほど密度が上がって       │
   │ 音量を 1/√n に下げていた    │ 大きく聞こえるのが正しい。全体は      │
   │ ＝音を足すと音楽が小さくなる │ グルーコンプ＋リミッターでまとめる    │
   ├────────────────────────┼──────────────────────────────┤
   │ 投入＝ループが増えるだけ     │ 合図→間→衝撃 を作る。              │
   │ 何も起きた気がしない        │ 押した瞬間に「ポーン」→着弾で         │
   │                          │ クラッシュ＋低音の一撃で入ってくる     │
   ├────────────────────────┼──────────────────────────────┤
   │ 残響センド 0.05〜0.20 で   │ センドを 0.05〜0.34 に上げ、          │
   │ 極端に乾いていた            │ 付点8分ディレイを足して奥行きを作る    │
   ├────────────────────────┼──────────────────────────────┤
   │ 音が動かない（静止したループ）│ キックのたびに全体が沈んで戻る        │
   │                          │ サイドチェイン・ポンピングを入れる     │
   ├────────────────────────┼──────────────────────────────┤
   │ モノラルで真ん中に団子       │ 役割とジャンルで左右に配置して広げる   │
   └────────────────────────┴──────────────────────────────┘
   ===================================================================== */

/* ============ 1. 音の通り道 ============
   melodic（メロディ・ベース・コード） → pumpBus（キックで沈む）
   drums                              → drumBus（沈まない。沈ませる側なので）
   合図音・衝撃音                       → fxBus（沈まない。目立ってほしいので）
                                          ↓
                            masterGain → glue(圧縮) → limiter → 出力
   リバーブとディレイは各パートから送って masterGain に戻す。         */
const Bus = {};

async function buildAudio() {
  /* 最終段。リミッターだけでは、複数枚を同時に投入したときに衝撃音が
     重なって 0dBFS を超えることが実測で分かった（最大RMS 1.2＝クリップ）。
     そこで後ろにソフトクリッパーを置き、絶対に振り切らないようにする。
     tanh なので、突っ込んでも「歪む」ではなく「潰れて太くなる」方向に転ぶ */
  Bus.clip = new Tone.WaveShaper((x) => Math.tanh(1.3 * x), 2048).toDestination();
  Bus.limiter = new Tone.Limiter(-1.5).connect(Bus.clip);
  /* 全部まとめて軽く圧縮する（グルー）。重ねるほど密度が上がって
     「大きくなった」と感じるのはこの段のおかげ。
     最初 threshold -15 / ratio 2.6 にしたら、4枚目以降で押さえ込みが
     効きすぎて「足したのに小さくなる」瞬間が出たので緩めてある */
  Bus.glue = new Tone.Compressor({ threshold: -12, ratio: 2.1, attack: 0.006, release: 0.14 })
              .connect(Bus.limiter);

  /* 空気感。実測したら 4kHz 以上が -69dB とかなり暗かった（配布元の
     mp3 がもともとこもり気味）。上を持ち上げるだけで「良い音」に化ける */
  Bus.air = new Tone.Filter({ type: 'highshelf', frequency: 5200, gain: 5 }).connect(Bus.glue);
  /* 中低域のもたつきを少し削って、低音の輪郭を出す */
  Bus.mud = new Tone.Filter({ type: 'peaking', frequency: 300, Q: 0.9, gain: -2.5 }).connect(Bus.air);

  /* 枚数連動のゲイン。リミッターが上を押さえるので歪まないまま、
     枚数が増えるほど確実に「大きくなった」と感じられるようにする。
     ここが v2 で 1/√n と真逆になっていた部分 */
  Bus.energy = new Tone.Gain(1.15).connect(Bus.mud);
  Bus.master = new Tone.Gain(1).connect(Bus.energy);

  Bus.reverb = new Tone.Reverb({ decay: 3.2, preDelay: 0.02, wet: 1 }).connect(Bus.master);
  try { await Bus.reverb.generate(); } catch (e) { /* 失敗しても音は出る */ }

  /* 付点8分のディレイ。テンポに同期するので濁らず、一気に「広い」音になる */
  Bus.delay = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.30, wet: 1 }).connect(Bus.master);

  Bus.pump = new Tone.Gain(1).connect(Bus.master);
  Bus.drums = new Tone.Gain(1).connect(Bus.master);
  Bus.fx    = new Tone.Gain(1).connect(Bus.master);

  try {
    Bus.recorder = new Tone.Recorder();
    Bus.limiter.connect(Bus.recorder);
  } catch (e) { Bus.recorder = null; }
}

/* ============ 2. サイドチェイン・ポンピング ============
   キックの瞬間に全体を沈ませ、0.24秒かけて戻す。
   これが入るだけで音楽が「呼吸」して、聴いていて気持ちよくなる。
   パートが増えるほど深くかける（＝盛り上がるほどノリが強くなる）。   */
/* 枚数が増えたら全体を少し持ち上げる（0枚=1.15 → 6枚=1.69）。
   ここを 1.5〜2.1 にしたら同時投入でクリップしたので下げた */
function setEnergyLevel(n) {
  if (!Bus.energy) return;
  Bus.energy.gain.rampTo(1.15 + 0.09 * n, 0.5);
}

function schedulePump(time, energy) {
  /* 深さは実測して決めた値。0.10 では浅すぎて「呼吸」に聞こえなかった。
     0.28 あたりから明確に体で分かるようになる */
  const depth = Math.min(0.50, 0.28 + 0.04 * energy);
  const g = Bus.pump.gain;
  g.setValueAtTime(1 - depth, time);
  g.linearRampToValueAtTime(1, time + 0.26);
}

/* ============ 3. 投入の「気持ちよさ」を作る3つの音 ============ */

/* 3-1. 合図：カードを受け付けたことを知らせる「ポーン」という1音
   ---------------------------------------------------------------------
   以前はここに「きゅいーん」と上がっていくライザー（上昇スイープ）を
   置いていたが、カードを出すたびに鳴るので耳についた。廃止した。

   いまは鐘を軽く突いたような音を1つだけ鳴らす。
   周波数は動かさない（＝スイープしない）ので「きゅいーん」にはならない。

   役割を分けてある：
     この合図 … 「受け付けた」ことをその場で伝える（押した瞬間に鳴る）
     衝撃音   … 「入った」ことを伝える（着弾の小節頭で鳴る）
   あいだは無音にして、着弾の一撃を引き立てる。                     */
function playCue(time) {
  const nodes = [];
  const g = new Tone.Gain(1).connect(Bus.fx);
  const send = new Tone.Gain(0.30).connect(Bus.reverb);   // 残響に送って「ポーン」の余韻を作る
  g.connect(send);

  /* [周波数, 音量, 減衰にかかる秒数]
     基音 G5(784Hz) と、その1オクターブ上・2オクターブ上。
     上の倍音ほど速く消えるようにすると、鐘や木琴のように聞こえる。
     G はこのアプリの4つの和音すべてに含まれる（または自然に溶ける）音なので、
     いつ鳴らしても曲とぶつからない。                                  */
  [[784, 0.30, 0.90], [1568, 0.10, 0.42], [2352, 0.03, 0.20]].forEach(([hz, lv, dec]) => {
    const o = new Tone.Oscillator({ type: 'sine', frequency: hz });
    const og = new Tone.Gain(0).connect(g);
    o.connect(og);
    /* 立ち上がりは 6ms。速すぎるとカチッと硬くなり、遅いとぼやける */
    og.gain.setValueAtTime(0, time);
    og.gain.linearRampToValueAtTime(lv, time + 0.006);
    og.gain.exponentialRampToValueAtTime(0.0005, time + dec);
    o.start(time); o.stop(time + dec + 0.05);
    nodes.push(o, og);
  });

  nodes.push(g, send);
  disposeAt(nodes, time + 2.0);
}

/* 3-2. 衝撃：着弾の瞬間のクラッシュ（高域）と一撃の低音（体で感じる） */
let lastImpactAt = -99;
function playImpact(time, strength = 1) {
  /* 短い間に衝撃が重なると音が振り切れるので、近すぎるものは弱める */
  if (time - lastImpactAt < 0.18) strength *= 0.45;
  lastImpactAt = Math.max(lastImpactAt, time);
  /* クラッシュ：白ノイズを高域だけ通して長く減衰させる */
  const noise = new Tone.Noise('white');
  const hp = new Tone.Filter({ type: 'highpass', frequency: 1400 });
  const cg = new Tone.Gain(0.0001).connect(Bus.fx);
  const cs = new Tone.Gain(0.7).connect(Bus.reverb);     // 残響に深く送って広がりを出す
  cg.connect(cs);
  noise.connect(hp); hp.connect(cg);
  cg.gain.setValueAtTime(0.0001, time);
  cg.gain.linearRampToValueAtTime(0.34 * strength, time + 0.004);
  cg.gain.exponentialRampToValueAtTime(0.0001, time + 1.7);
  noise.start(time); noise.stop(time + 1.8);

  /* 低音の一撃：90Hz から 45Hz へ落ちるサイン波。
     落ちるのに 0.40 秒かけていたら「ドゥーン」と滑って聞こえたので、
     0.10 秒に詰めて打撃音（ドッ）にした。スイープ感はこれで消える */
  const osc = new Tone.Oscillator({ type: 'sine', frequency: 90 });
  const bg = new Tone.Gain(0.0001).connect(Bus.fx);
  osc.connect(bg);
  osc.frequency.setValueAtTime(90, time);
  osc.frequency.exponentialRampToValueAtTime(45, time + 0.10);
  bg.gain.setValueAtTime(0.0001, time);
  bg.gain.linearRampToValueAtTime(0.55 * strength, time + 0.006);
  bg.gain.exponentialRampToValueAtTime(0.0001, time + 0.75);
  osc.start(time); osc.stop(time + 0.8);

  /* 全体を一瞬だけ凹ませる。衝撃が「穴を開けた」ように聞こえる */
  const m = Bus.master.gain;
  m.setValueAtTime(1 - 0.26 * strength, time);
  m.linearRampToValueAtTime(1, time + 0.34);

  disposeAt([noise, hp, cg, cs, osc, bg], time + 2.2);
}

/* 3-3. クラップ：手拍子。バックビートに入ると一気に踊れる音になる */
function makeClap(dest) {
  const out = new Tone.Gain(1).connect(dest);
  const bp = new Tone.Filter({ type: 'bandpass', frequency: 1100, Q: 1.1 }).connect(out);
  const n = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.16, sustain: 0 },
  }).connect(bp);
  return {
    nodes: [n, bp, out],
    /* 3回わずかにずらして鳴らすと、1発のノイズが「手拍子」に化ける */
    hit: (t, v) => {
      n.triggerAttackRelease('32n', t, v * 0.55);
      n.triggerAttackRelease('32n', t + 0.011, v * 0.75);
      n.triggerAttackRelease('16n', t + 0.023, v);
    },
  };
}

function disposeAt(nodes, when) {
  const ms = Math.max(0, (when - Tone.now()) * 1000) + 200;
  setTimeout(() => nodes.forEach(n => { try { n.dispose(); } catch (e) {} }), ms);
}

/* ============ 4. 合成音のドラム（サンプルが無いときの予備） ============ */
function makeSynthKit(dest, level) {
  const out = new Tone.Gain(Tone.dbToGain(level)).connect(dest);
  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.048, octaves: 6, oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.36, sustain: 0, release: 0.1 },
  }).connect(out);
  const snareFilt = new Tone.Filter(1800, 'bandpass').connect(out);
  const snare = new Tone.NoiseSynth({ noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.15, sustain: 0 } }).connect(snareFilt);
  const hatFilt = new Tone.Filter(7800, 'highpass').connect(out);
  const hat = new Tone.NoiseSynth({ noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.035, sustain: 0 } }).connect(hatFilt);
  const tom = new Tone.MembraneSynth({
    pitchDecay: 0.1, octaves: 3, oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.42, sustain: 0, release: 0.1 },
  }).connect(out);
  const clap = makeClap(out);
  return {
    sampled: false,
    nodes: [kick, snare, hat, tom, snareFilt, hatFilt, out, ...clap.nodes],
    k:  (t, v) => kick.triggerAttackRelease('C1', '8n', t, v),
    s:  (t, v) => snare.triggerAttackRelease('16n', t, v),
    h:  (t, v) => hat.triggerAttackRelease('32n', t, v),
    t1: (t, v) => tom.triggerAttackRelease('D2', '8n', t, v),
    t2: (t, v) => tom.triggerAttackRelease('A1', '8n', t, v),
    t3: (t, v) => tom.triggerAttackRelease('E1', '4n', t, v),
    c:  clap.hit,
  };
}

/* ============ 5. 小節と拍の位置 ============
   パターンの位置を「曲全体の絶対時刻」から求める。
   小節の途中で投入してもパターンが小節頭から数え直され、拍が必ず揃う。 */
function posAt(time) {
  const ppq = Tone.Transport.PPQ;
  const ticks = (Tone.Transport.getTicksAtTime ? Tone.Transport.getTicksAtTime(time)
                                               : Tone.Transport.ticks) + 2;
  const total = Math.floor(ticks / (ppq / 4));
  return { bar: Math.floor(total / 16), step: ((total % 16) + 16) % 16 };
}
function range16() { return [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]; }

/* ============ 6. パート（カード1枚ぶん＝複数楽器のレイヤー） ============ */
class Part {
  constructor(genreKey, roleKey, panBias) {
    this.id = genreKey + '-' + roleKey;
    this.genreKey = genreKey;
    this.roleKey = roleKey;
    this.card = CARDS[genreKey][roleKey];
    this.role = ROLES[roleKey];
    this.layers = [];
    this.sampled = false;

    const R = this.role;
    const bus = (roleKey === 'rhythm') ? Bus.drums : Bus.pump;

    /* 出口側から順に組む：
       partGain → panner → lp → hp ← 各レイヤー                        */
    this.gain = new Tone.Gain(Tone.dbToGain(R.gain)).connect(bus);
    this.nominal = Tone.dbToGain(R.gain);

    this.rev = new Tone.Gain(R.send).connect(Bus.reverb);
    this.gain.connect(this.rev);
    if (R.delay > 0) { this.dly = new Tone.Gain(R.delay).connect(Bus.delay); this.gain.connect(this.dly); }

    this.pan = new Tone.Panner(R.pan * panBias).connect(this.gain);
    /* ここに以前は「投入直後だけ閉じていて1小節かけて開くフィルタ」を
       置いていたが、460Hz→20kHz のフィルタスイープ＝まさに
       「きゅいーん」という音そのものだったので廃止した。
       新しいパートは最初から素の音色で入ってくる。                   */
    this.lp = new Tone.Filter(R.lp, 'lowpass').connect(this.pan);
    this.hp = new Tone.Filter(R.hp, 'highpass').connect(this.lp);

    this.card.layers.forEach(spec => this.layers.push(this.buildLayer(spec)));
  }

  buildLayer(spec) {
    const L = { spec, accentOnly: spec.when === 'accent' };
    const vo = VOICES[spec.voice];
    L.vo = vo;
    L.out = new Tone.Gain(Tone.dbToGain(spec.gain)).connect(this.hp);

    if (vo.kind === 'kit') {
      L.kit = makeSampleKit(L.out, spec.kit) || makeSynthKit(L.out, 0);
      if (L.kit.sampled) this.sampled = true;
      return L;
    }

    let node = null;
    if (vo.kind === 'sampler') {
      node = makeSampleVoice(spec.voice, vo.env);
      if (node) { L.sampled = true; this.sampled = true; }
    }
    if (!node) { node = this.makeSynth(vo.fb); L.sampled = false; }

    /* レイヤーごとの高域カット（ヒップホップのローファイなピアノなどで使う） */
    let dest = L.out;
    if (spec.lp) { L.lp = new Tone.Filter(spec.lp, 'lowpass').connect(L.out); dest = L.lp; }

    if (spec.drive > 0) {
      L.drive = new Tone.Distortion({ distortion: spec.drive, wet: 0.45 }).connect(dest);
      node.connect(L.drive);
    } else {
      node.connect(dest);
    }
    L.voice = node;
    L.isPluck = !L.sampled && vo.fb === 'pluck';
    return L;
  }

  makeSynth(fb) {
    switch (fb) {
      case 'sub':      // サブベース：純粋なサイン波。体で感じる帯域を足す役
        return new Tone.MonoSynth({
          oscillator: { type: 'sine' },
          filter: { type: 'lowpass', frequency: 200 },
          envelope: { attack: 0.008, decay: 0.2, sustain: 0.85, release: 0.14 },
          filterEnvelope: { attack: 0.01, decay: 0.1, sustain: 1, baseFrequency: 60, octaves: 1 },
        });
      case 'sbass':    // シンセベース：太く歪んだ矩形
        return new Tone.MonoSynth({
          oscillator: { type: 'square' },
          filter: { Q: 3.5, type: 'lowpass', rolloff: -24 },
          envelope: { attack: 0.004, decay: 0.16, sustain: 0.4, release: 0.1 },
          filterEnvelope: { attack: 0.004, decay: 0.13, sustain: 0.22, release: 0.12, baseFrequency: 95, octaves: 3.6 },
        });
      case 'lead':     // シンセリード：3枚重ねてデチューン＝厚い
        return new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'fatsawtooth', count: 3, spread: 34 },
          envelope: { attack: 0.005, decay: 0.14, sustain: 0.22, release: 0.22 },
        });
      case 'pad':      // パッド：ゆっくり開いて長く伸びる
        return new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'fatsawtooth', count: 4, spread: 48 },
          envelope: { attack: 0.9, decay: 0.5, sustain: 0.85, release: 2.0 },
        });
      case 'organ':
        return new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'fatsquare', count: 2, spread: 14 },
          envelope: { attack: 0.02, decay: 0.1, sustain: 0.8, release: 0.3 },
        });
      case 'bell':
        return new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.002, decay: 0.5, sustain: 0, release: 0.5 },
        });
      case 'reed':
        return new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'fatsawtooth', count: 2, spread: 20 },
          envelope: { attack: 0.02, decay: 0.2, sustain: 0.45, release: 0.25 },
        });
      case 'bow':
        return new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sawtooth' },
          envelope: { attack: 0.18, decay: 0.3, sustain: 0.7, release: 0.7 },
        });
      case 'mono':
        return new Tone.MonoSynth({
          oscillator: { type: 'sawtooth' },
          filter: { Q: 1.4, type: 'lowpass', rolloff: -24 },
          envelope: { attack: 0.008, decay: 0.22, sustain: 0.6, release: 0.22 },
          filterEnvelope: { attack: 0.008, decay: 0.2, sustain: 0.3, release: 0.25, baseFrequency: 140, octaves: 3 },
        });
      case 'pluck':
        return new Tone.PluckSynth({ attackNoise: 1.2, dampening: 4200, resonance: 0.95 });
      default:
        return new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.004, decay: 0.6, sustain: 0.12, release: 1.2 },
        });
    }
  }

  /* --- 投入 --- */
  start(entryTime, entryTicks, barSec) {
    /* 登場は少し大きめに鳴らし、2小節かけて定位置へ落ち着く。
       音色は最初から素のまま。フィルタを開く演出は
       「きゅいーん」に聞こえるので入れない（音量だけで存在感を出す） */
    this.gain.gain.setValueAtTime(this.nominal * 1.55, entryTime);
    this.gain.gain.linearRampToValueAtTime(this.nominal, entryTime + barSec * 2);

    this.seq = new Tone.Sequence((t) => this.tick(t), range16(), '16n');
    this.seq.start(entryTicks + 'i');
  }

  tick(time) {
    const { bar, step } = posAt(time);
    const ph = this.card.phrase;
    const events = ph[bar % ph.length].filter(e => e.s === step);
    if (!events.length) return;
    const ch = chordAt(bar);
    events.forEach(e => {
      this.layers.forEach(L => {
        if (L.accentOnly && !isAccent(e)) return;    // 弱いイベントでは重ねない
        this.playOn(L, e, time, ch, bar);
      });
      if (this.roleKey !== 'rhythm' || e.p !== 'h') this.flash(time, e.v);
    });
  }

  playOn(L, e, time, ch, bar) {
    const sp = L.spec;
    if (this.roleKey === 'rhythm') {
      const f = L.kit[e.p] || L.kit.s;
      f(time, e.v);
      return;
    }
    const tr = sp.tr || 0;
    let semis;
    if (this.roleKey === 'melody') {
      semis = [ladSemi(ch, e.t) + tr];
    } else if (this.roleKey === 'bass') {
      semis = [(e.app != null ? chordAt(bar + 1).root + e.app : bassSemi(ch, e.c)) + tr];
    } else {
      const v = voicing(sp.voicing, ch, sp.oct);
      semis = (e.n != null ? [v[e.n % v.length] + 12 * Math.floor(e.n / v.length)] : v).map(x => x + tr);
    }
    const strum = sp.strum || 0;
    semis.forEach((semi, i) => {
      const note = noteName(semi, sp.oct);
      const t = time + i * strum;
      if (L.isPluck) L.voice.triggerAttack(note, t);
      else L.voice.triggerAttackRelease(note, e.l, t, e.v);
    });
  }

  flash(time, v) { Tone.Draw.schedule(() => UI.flashCell(this.id, v), time); }

  fadeOutAndDispose(sec = 1.1) {
    try { this.gain.gain.cancelScheduledValues(Tone.now()); this.gain.gain.rampTo(0, sec); } catch (e) {}
    setTimeout(() => this.dispose(), sec * 1000 + 150);
  }

  dispose() {
    try { this.seq.stop(); this.seq.dispose(); } catch (e) {}
    const nodes = [];
    this.layers.forEach(L => {
      if (L.voice) nodes.push(L.voice);
      if (L.drive) nodes.push(L.drive);
      if (L.lp) nodes.push(L.lp);
      if (L.kit) nodes.push(...L.kit.nodes);
      nodes.push(L.out);
    });
    nodes.push(this.hp, this.lp, this.pan, this.rev, this.gain);
    if (this.dly) nodes.push(this.dly);
    nodes.forEach(n => { try { n && n.dispose(); } catch (e) {} });
  }
}

/* ============ 7. 基礎ビート ============
   常に鳴っている土台。ポンピングの基準もここ。
   RHYTHMカードが入っている間は自分を小さくして場所を譲る。         */
const BaseBeat = {
  kit: null, seq: null, gain: null,

  start() {
    this.gain = new Tone.Gain(1).connect(Bus.drums);
    this.kit = makeSampleKit(this.gain, 'acoustic-kit', -13) || makeSynthKit(this.gain, -12);
    this.seq = new Tone.Sequence((time) => this.tick(time), range16(), '16n').start(0);
  },

  tick(time) {
    const { step } = posAt(time);
    const energy = State.parts.size;

    /* キックの位置でポンピングをかける（4拍すべて）。
       カードが増えるほど深くなるので、盛り上がるほどノリが強くなる */
    if (step % 4 === 0) schedulePump(time, energy);

    /* RHYTHMカードが鳴っていれば、基礎ビートはほぼ引っ込む */
    const hasRhythm = State.hasRole('rhythm');
    const lv = hasRhythm ? 0.16 : 1;
    if (lv < 0.2 && step % 4 !== 0) return;

    if (step === 0 || step === 8) this.kit.k(time, 0.85 * lv);
    if (!hasRhythm) {
      if (energy >= 3 && (step === 4 || step === 12)) this.kit.s(time, 0.45);
      if (step % 4 === 0) this.kit.h(time, step === 0 ? 0.20 : 0.13);
      if (energy >= 2 && step % 2 === 0 && step % 4 !== 0) this.kit.h(time, 0.09);
    }
  },

  stop() {
    try { this.seq.stop(); this.seq.dispose(); } catch (e) {}
    try { this.kit.nodes.forEach(n => n.dispose()); this.gain.dispose(); } catch (e) {}
  },
};
