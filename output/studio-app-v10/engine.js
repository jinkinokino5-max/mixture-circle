/* =====================================================================
   engine.js — 音を出す部分（v9）
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
  /* 上限 2.05 は「10枚のとき」の値。無制限モードでは20枚まで積めるので、
     それ以上は上げない。ここを外すと最終段で潰れて、
     足しても大きくならない（v2 の失敗）に逆戻りする */
  const lv = Math.min(2.05, 1.15 + 0.09 * n);
  Bus.energy.gain.rampTo(lv * World.energyScale(), 0.5);
}

/* ============ 2-b. 世界に合わせて全体の音色を変える ============
   楽器は Part 側（世界の編成表）。ここは「部屋の響き」担当。
   ・air … 高域の空気感（久石譲は +4.5dB、ジャズは +1dB で暖かく）
   ・mud … 中低域のもたつき（藤井風は -3.5dB でベースの輪郭を出す）
   ・delay … 付点8分ディレイの返り                                    */
function applyWorldTone(sec = 0.6) {
  if (!Bus.air) return;
  try {
    Bus.air.gain.rampTo(World.num('air', 5), sec);
    Bus.mud.gain.rampTo(World.num('mud', -2.5), sec);
    Bus.delay.feedback.rampTo(0.30 * World.delayScale(), sec);
  } catch (e) { /* 音は止めない */ }
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

/* 3-1b. 解除の合図：同じ札をもう一度タッチして音を外したときの1音
   ---------------------------------------------------------------------
   入れたときの合図（G5・784Hz）と取り違えないよう、1オクターブ下の
   G4（392Hz）を短く鳴らす。周波数は動かさない（スイープしない）。
   G はこのアプリのどの世界の和音にも溶けるので、いつ鳴らしても濁らない。 */
function playUncue(time) {
  const g = new Tone.Gain(1).connect(Bus.fx);
  const send = new Tone.Gain(0.22).connect(Bus.reverb);
  g.connect(send);
  const nodes = [g, send];
  [[392, 0.20, 0.42], [784, 0.05, 0.18]].forEach(([hz, lv, dec]) => {
    const o = new Tone.Oscillator({ type: 'sine', frequency: hz });
    const og = new Tone.Gain(0).connect(g);
    o.connect(og);
    og.gain.setValueAtTime(0, time);
    og.gain.linearRampToValueAtTime(lv, time + 0.006);
    og.gain.exponentialRampToValueAtTime(0.0005, time + dec);
    o.start(time); o.stop(time + dec + 0.05);
    nodes.push(o, og);
  });
  disposeAt(nodes, time + 1.2);
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

/* 3-2b. 転換：スタイルカードで世界が入れ替わる瞬間の音
   ---------------------------------------------------------------------
   着弾の一撃だけだと「1枚増えた」のと区別がつかない。
   世界が変わるときは、その手前 lead 秒から高域のノイズがふくらんでいって
   境目で切れ、そこに一撃が来る。周波数は動かさない（音量だけを動かす）ので
   禁止した「きゅいーん」にはならない。                                */
function playTurn(time, lead = 1.0) {
  const t0 = Math.max(Tone.now() + 0.02, time - lead);
  const noise = new Tone.Noise('pink');
  const hp = new Tone.Filter({ type: 'highpass', frequency: 2600 });
  const g = new Tone.Gain(0.0001).connect(Bus.fx);
  const send = new Tone.Gain(0.6).connect(Bus.reverb);
  g.connect(send);
  noise.connect(hp); hp.connect(g);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.16, time);      // 境目に向かってふくらむ
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
  noise.start(t0); noise.stop(time + 0.1);
  disposeAt([noise, hp, g, send], time + 2.2);

  playImpact(time, 1.15);
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

/* ============ 3-4. 音域からはみ出した音を、オクターブ単位で連れ戻す ============
   Tone.Sampler は録音の無い音でも「いちばん近い音を伸び縮みさせて」鳴らす。
   数半音なら自然だが、5半音以上引き伸ばすと明らかに不自然な音になる
   （実際、ロックのギターが音源の最高音を1オクターブ超えていたことがある）。
   世界ごとに楽器と音域が変わるので、この事故が起きやすい。
   そこで TOL 半音を超えてはみ出した音だけ、オクターブ単位で音域内に折り返す。
   TOL 以内は動かさない（旋律の形を壊さないため）。                    */
const FIT_TOL = 4;
function fitNote(note, L) {
  if (L.lo == null || L.hi == null || L.hi - L.lo < 12) return note;
  let m;
  try { m = Tone.Frequency(note).toMidi(); } catch (e) { return note; }
  let guard = 8;
  while (m > L.hi + FIT_TOL && guard-- > 0) m -= 12;
  while (m < L.lo - FIT_TOL && guard-- > 0) m += 12;
  try { return Tone.Frequency(m, 'midi').toNote(); } catch (e) { return note; }
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
  constructor(charKey, roleKey, panBias) {
    this.id = charKey + '-' + roleKey;
    this.charKey = charKey;
    this.roleKey = roleKey;
    /* v9：譜面と楽器が別々の場所にある。
       譜面はカード（キャラクター×役割）が持ち、楽器はいまの世界が持つ */
    this.phrase = PHRASES[charKey][roleKey].phrase;
    this.specs = World.layersFor(charKey, roleKey);
    this.role = ROLES[roleKey];
    this.layers = [];
    this.sampled = false;

    const R = this.role;
    const bus = (roleKey === 'rhythm') ? Bus.drums : Bus.pump;

    /* 出口側から順に組む：
       partGain → panner → lp → hp ← 各レイヤー                        */
    /* v10：ここに「札ごとの音量オフセット」を足す。
       中身は card-gain.js（ミキサー画面が書き出す）。触っていなければ 0 で、
       その場合はこれまでとまったく同じ音量になる                     */
    this.offset = (typeof Mixer !== 'undefined') ? Mixer.effective(this.id) : 0;
    this.gain = new Tone.Gain(Tone.dbToGain(R.gain + this.offset)).connect(bus);
    this.nominal = Tone.dbToGain(R.gain + this.offset);

    /* 残響・ディレイ・左右の広がりは世界ごとに伸び縮みする。
       乾いた60年代の録音（ビートルズ）と、広いホール（久石譲）の差はここ */
    this.rev = new Tone.Gain(Math.min(0.9, R.send * World.sendScale())).connect(Bus.reverb);
    this.gain.connect(this.rev);
    const dlyAmt = R.delay * World.delayScale();
    if (dlyAmt > 0.001) { this.dly = new Tone.Gain(dlyAmt).connect(Bus.delay); this.gain.connect(this.dly); }

    this.pan = new Tone.Panner(Math.max(-1, Math.min(1, R.pan * panBias * World.panScale()))).connect(this.gain);
    /* ここに以前は「投入直後だけ閉じていて1小節かけて開くフィルタ」を
       置いていたが、460Hz→20kHz のフィルタスイープ＝まさに
       「きゅいーん」という音そのものだったので廃止した。
       新しいパートは最初から素の音色で入ってくる。                   */
    this.lp = new Tone.Filter(R.lp, 'lowpass').connect(this.pan);
    this.hp = new Tone.Filter(R.hp, 'highpass').connect(this.lp);

    this.specs.forEach(spec => this.layers.push(this.buildLayer(spec)));
  }

  buildLayer(spec) {
    const L = { spec, accentOnly: spec.when === 'accent' };
    /* v9：楽器はもう読み替えない。世界の編成表に書いてあるものをそのまま鳴らす */
    const voiceKey = spec.voice;
    if (!voiceKey || !VOICES[voiceKey]) { L.muted = true; return L; }
    const vo = VOICES[voiceKey];
    L.voiceKey = voiceKey;
    L.vo = vo;
    L.oct = spec.oct || 0;
    L.out = new Tone.Gain(Tone.dbToGain(spec.gain)).connect(this.hp);

    if (vo.kind === 'kit') {
      L.kit = makeSampleKit(L.out, spec.kit) || makeSynthKit(L.out, 0);
      if (L.kit.sampled) this.sampled = true;
      return L;
    }

    let node = null;
    if (vo.kind === 'sampler') {
      node = makeSampleVoice(voiceKey, vo.env);
      if (node) {
        L.sampled = true; this.sampled = true;
        /* その楽器に実際に録音がある音域を控えておく（下の fitNote で使う） */
        try {
          const ms = Object.keys(samplerUrls(voiceKey) || {}).map(n => Tone.Frequency(n).toMidi());
          if (ms.length) { L.lo = Math.min(...ms); L.hi = Math.max(...ms); }
        } catch (e) {}
      }
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
  start(entryTime, entryTicks, barSec, gentle) {
    /* 登場は少し大きめに鳴らし、2小節かけて定位置へ落ち着く。
       音色は最初から素のまま。フィルタを開く演出は
       「きゅいーん」に聞こえるので入れない（音量だけで存在感を出す）。
       gentle=true はスタイルカードで作り直したとき用。すでに鳴っていた音を
       置き換えるだけなので、登場の膨らみは付けずに定位置から始める     */
    if (gentle) {
      this.gain.gain.setValueAtTime(0.0001, entryTime);
      this.gain.gain.linearRampToValueAtTime(this.nominal, entryTime + Math.min(0.25, barSec * 0.2));
    } else {
      this.gain.gain.setValueAtTime(this.nominal * 1.55, entryTime);
      this.gain.gain.linearRampToValueAtTime(this.nominal, entryTime + barSec * 2);
    }

    this.seq = new Tone.Sequence((t) => this.tick(t), range16(), '16n');
    this.seq.start(entryTicks + 'i');
  }

  tick(time) {
    const { bar, step } = posAt(time);
    const ph = this.phrase;
    const events = ph[bar % ph.length].filter(e => e.s === step);
    if (!events.length) return;
    const ch = chordAt(bar);
    events.forEach(e => {
      this.layers.forEach(L => {
        if (L.muted) return;                         // その世界に存在しない楽器
        if (L.accentOnly && !isAccent(e)) return;    // 弱いイベントでは重ねない
        this.playOn(L, e, time, ch, bar);
      });
      if (this.roleKey !== 'rhythm' || e.p !== 'h') this.flash(time, e.v);
    });
  }

  playOn(L, e, time, ch, bar) {
    const sp = L.spec;
    if (this.roleKey === 'rhythm') {
      /* 打楽器もスタイルで読み替える（クラップ→ライド／ハイハット→無音 など） */
      const piece = World.drum(e.p);
      if (!piece) return;
      const f = L.kit[piece] || L.kit.s;
      f(time, e.v);
      return;
    }
    const tr = sp.tr || 0;
    let semis;
    if (this.roleKey === 'melody') {
      semis = [ladSemi(ch, e.t) + tr];
      /* ハモリ：梯子を何段か上の音を重ねる。度数ではなく「梯子の段」で
         数えるので、どの和音の上でも必ず和声に乗る。
         ビートルズの2声コーラス（3度上）はこれで再現している。
         全部の音に付けると団子になるので、強い音だけ            */
      const h = World.harmony();
      if (h && isAccent(e)) semis.push(ladSemi(ch, e.t + h) + tr);
    } else if (this.roleKey === 'bass') {
      semis = [(e.app != null ? chordAt(bar + 1).root + e.app : bassSemi(ch, e.c)) + tr];
    } else {
      const v = voicing(sp.voicing, ch, L.oct);
      semis = (e.n != null ? [v[e.n % v.length] + 12 * Math.floor(e.n / v.length)] : v).map(x => x + tr);
    }
    /* --- 楽器に合わせて長さを決め直す（v9.1）-------------------------
       譜面（PHRASES）の音符の長さは楽器を知らない。ピアノは16分でも
       叩いた瞬間に音があるが（実測0.02秒）、ウッドベースは音量が
       出そろうまでに0.885秒かかる。16分（132BPMで0.114秒）で切ると
       音量の25%も出ないまま終わり、楽器の音そのものが聞こえない。
       そこで music.js の VOICES にある speak / minGap を
       当てて「間引く」「伸ばす」を行う。両方0の楽器は素通りする。  */
    const notes = semis.map(semi => fitNote(noteName(semi, L.oct), L));
    const dur = this.soundLength(L, e, time);
    if (dur == null) return;          /* この楽器には速すぎる音符 → 出さない */

    const strum = sp.strum || 0;
    notes.forEach((note, i) => {
      const t = time + i * strum;
      if (L.isPluck) L.voice.triggerAttack(note, t);
      else L.voice.triggerAttackRelease(note, dur, t, e.v);
    });
  }

  /* 実際に鳴らす長さ（秒）を返す。
     null を返したら「その楽器には詰まりすぎているので今回は出さない」。
     和音は1イベントで何音も鳴るので、判定はイベントにつき1回だけ行う
     （音ごとにやると和音の2音目以降が消えてしまう）。              */
  soundLength(L, e, time) {
    let sec;
    try { sec = Tone.Time(e.l).toSeconds(); } catch (err) { sec = 0.25; }
    const gap = (L.vo && L.vo.minGap) || 0;
    if (gap > 0 && L.lastAt != null && time - L.lastAt < gap - 0.0001) return null;
    L.lastAt = time;
    return Math.max(sec, (L.vo && L.vo.speak) || 0);
  }

  flash(time, v) { Tone.Draw.schedule(() => UI.flashCell(this.id, v), time); }

  /* v10：ミキサー画面のスライダーから呼ばれる。
     鳴らしたまま音量だけを動かす。段差で「プツッ」と鳴らないよう、
     必ず少し時間をかけて（既定 0.08 秒）滑らせる。
     登場の膨らみ（2小節かけて定位置へ）の途中で動かされることもあるので、
     予約済みの変化をいったん取り消してから現在値を基準に引き直す。   */
  setOffset(db, sec = 0.08) {
    this.offset = db;
    this.nominal = Tone.dbToGain(this.role.gain + db);
    try {
      const g = this.gain.gain, t = Tone.now();
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(this.nominal, t + sec);
    } catch (e) {}
  }

  fadeOutAndDispose(sec = 1.1) {
    try { this.gain.gain.cancelScheduledValues(Tone.now()); this.gain.gain.rampTo(0, sec); } catch (e) {}
    setTimeout(() => this.dispose(), sec * 1000 + 150);
  }

  dispose() {
    try { this.seq.stop(); this.seq.dispose(); } catch (e) {}
    const nodes = [];
    this.layers.forEach(L => {
      if (L.muted) return;
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
    /* 土台のビートも札と同じようにミキサーで動かせる（id は '_beat'） */
    const off = (typeof Mixer !== 'undefined') ? Mixer.effective('_beat') : 0;
    this.gain = new Tone.Gain(Tone.dbToGain(off)).connect(Bus.drums);
    this.kit = this.makeKit();
    this.seq = new Tone.Sequence((time) => this.tick(time), range16(), '16n').start(0);
  },

  /* ミキサー画面から呼ばれる（Part.setOffset と同じ考え方） */
  setOffset(db, sec = 0.08) {
    if (!this.gain) return;
    try {
      const g = this.gain.gain, t = Tone.now();
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(Tone.dbToGain(db), t + sec);
    } catch (e) {}
  },

  makeKit() {
    const lv = -13 + World.drumGain();
    return makeSampleKit(this.gain, World.kit('acoustic-kit'), lv) || makeSynthKit(this.gain, lv + 1);
  },

  /* スタイルカードが出たらキットごと入れ替える。
     古いキットは余韻を切らないよう、少し置いてから捨てる */
  restyle() {
    if (!this.gain) return;
    const old = this.kit;
    this.kit = this.makeKit();
    if (old) setTimeout(() => { try { old.nodes.forEach(n => n.dispose()); } catch (e) {} }, 1800);
  },

  /* 打楽器の読み替えを通してから叩く（久石譲ではハイハットが消える） */
  hit(piece, time, v) {
    const p = World.drum(piece);
    if (!p || !this.kit) return;
    (this.kit[p] || this.kit.s)(time, v);
  },

  /* v10：叩く中身は music.js の GROOVES（世界ごと）から読む。
     v9 まではここに8ビートが直に書いてあり、どの世界でも同じ土台だった。
     いまは世界を変えると土台のビートごと変わる
     （ハウスなら札が0枚でも四つ打ちが鳴っている）。 */
  tick(time) {
    const { step } = posAt(time);
    const energy = State.parts.size;
    const G = World.groove();

    /* キックの位置でポンピングをかける（4拍すべて）。
       カードが増えるほど深くなるので、盛り上がるほどノリが強くなる */
    if (step % 4 === 0) schedulePump(time, energy);

    /* RHYTHMカードが鳴っていれば、基礎ビートはほぼ引っ込む */
    const hasRhythm = State.hasRole('rhythm');
    const lv = hasRhythm ? 0.16 : 1;

    /* core＝土台の芯。RHYTHM札が出ているときは拍頭だけ・小さく残す
       （完全に消すと、札を外した瞬間に足元が抜けて聞こえるため） */
    for (const [piece, s, v] of G.core) {
      if (s !== step) continue;
      if (hasRhythm && step % 4 !== 0) continue;
      this.hit(piece, time, v * lv);
    }
    if (hasRhythm) return;

    /* fill＝飾り。4つ目の数字は「重なっている札がこの枚数以上のとき鳴る」。
       0枚のときはスカスカ、増えるほど賑やかになる */
    for (const [piece, s, v, min] of G.fill) {
      if (s !== step) continue;
      if (energy < (min || 0)) continue;
      this.hit(piece, time, v);
    }
  },

  stop() {
    try { this.seq.stop(); this.seq.dispose(); } catch (e) {}
    try { this.kit.nodes.forEach(n => n.dispose()); this.gain.dispose(); } catch (e) {}
  },
};
