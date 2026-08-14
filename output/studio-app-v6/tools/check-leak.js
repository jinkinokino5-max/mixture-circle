/* =====================================================================
   tools/check-leak.js — 「時間がたつと音がプツプツ切れる」の原因を探す
   ---------------------------------------------------------------------
     node tools/check-leak.js
   ---------------------------------------------------------------------
   プツプツ・ブツッという途切れは音割れ（クリップ）ではなく、
   音声スレッドが締め切りに間に合わなくなって起きる「音の欠落」。
   時間とともに悪化するなら、原因は何かが増え続けていること。

   ここでは Tone.js を差し替えて **生成されたノードと dispose されたノードを
   1つずつ数え**、長い演奏を模擬して「生きているノードが増え続けるか」を見る。

   ・スタブは check-engine.js と同じ考え方（本物の app.js をそのまま走らせる）
   ・カードの入れ替えを何度も繰り返し、小節の再生成も本物を呼ぶ
   ・dispose は fadeOutAndDispose の setTimeout 経由なので、
     実時間を少し待って確実に回収させる
   ===================================================================== */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const PPQ = 192, BAR = PPQ * 4;

const errors = [];

/* ---------- ノードの生死を数える ---------- */
const census = { made: 0, killed: 0, byKind: new Map(), liveByKind: new Map() };
const bump = (map, k, d) => map.set(k, (map.get(k) || 0) + d);

class Node {
  constructor() {
    const k = this.constructor.name;
    census.made++; bump(census.byKind, k, 1); bump(census.liveByKind, k, 1);
    this.__kind = k; this.__disposed = false;
  }
  connect(d) { this.__dest = d; return this; }
  toDestination() { return this; }
  dispose() {
    if (this.__disposed) return this;          // 二重 dispose は数えない
    this.__disposed = true;
    census.killed++; bump(census.liveByKind, this.__kind, -1);
    return this;
  }
  get gain() { return this.__g || (this.__g = param()); }
  get frequency() { return this.__f || (this.__f = param()); }
  get wet() { return this.__w || (this.__w = param()); }
}
const param = () => ({
  value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, rampTo() {},
  cancelScheduledValues() {}, exponentialRampToValueAtTime() {},
});

class Gain extends Node { constructor(v) { super(); this.__v = v; } }
class Filter extends Node { constructor(f) { super(); this.__freq = f; } }
class Distortion extends Node {}
class Sampler extends Node {
  constructor(o) { super(); this.urls = (o && o.urls) || {}; }
  triggerAttack() {} triggerAttackRelease() {}
}
class PolySynth extends Node { triggerAttackRelease() {} }
class MonoSynth extends Node { triggerAttackRelease() {} }
class MembraneSynth extends Node { triggerAttackRelease() {} }
class NoiseSynth extends Node { triggerAttackRelease() {} }
class MetalSynth extends Node { triggerAttackRelease() {} }
class PluckSynth extends Node { triggerAttack() {} }
class Synth extends Node {}
class Limiter extends Node {}
class Compressor extends Node {}
class WaveShaper extends Node { constructor(map, len) { super(); this.__map = map; this.__len = len; } }
class Panner extends Node { constructor(p) { super(); this.__pan = p; } }
class Analyser extends Node { getValue() { return new Float32Array(8); } }
class Meter extends Node {
  constructor() { super(); this.__b = Meter.__n++; }
  getValue() { return [-18, -26, -30, -40][this.__b % 4] + (Math.random() - .5) * 2; }
}
Meter.__n = 0;
class Reverb extends Node { async generate() {} }
class PingPongDelay extends Node {}
class Recorder extends Node { start() {} }
class Noise extends Node { start() {} stop() {} }
class Sequence extends Node {
  constructor(cb) { super(); this.cb = cb; }
  start() { return this; } stop() { return this; }
}

const repeats = [];
const Tone = {
  Gain, Filter, Distortion, Sampler, PolySynth, Synth, MonoSynth, MembraneSynth,
  NoiseSynth, MetalSynth, PluckSynth, Limiter, Compressor, WaveShaper, Analyser,
  Meter, Reverb, PingPongDelay, Recorder, Sequence, Panner, Noise,
  dbToGain: (db) => Math.pow(10, db / 20),
  ToneAudioBuffer: {
    fromUrl: async () => {
      const sr = 44100, data = new Float32Array(64);
      return { sampleRate: sr, getChannelData: () => data };
    },
  },
  Draw: { schedule(fn) { try { fn(); } catch (e) { errors.push('Draw: ' + e.message); } } },
  now: () => 0,
  Transport: {
    PPQ, ticks: 0, bpm: { value: 100 }, swing: 0, timeSignature: 4,
    getTicksAtTime: (t) => t,
    scheduleOnce() {}, scheduleRepeat(cb, iv) { repeats.push({ cb, iv }); },
    start() {}, stop() {}, cancel() {}, pause() {},
  },
  start: async () => {},
};

/* ---------- DOM スタブ ---------- */
const mkEl = () => {
  const e = {
    style: { setProperty() {} }, dataset: {}, children: [], innerHTML: '', textContent: '',
    className: '', classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(c) { e.children.push(c); }, addEventListener() {}, setAttribute() {},
    getAttribute: () => null, querySelector: () => mkEl(), querySelectorAll: () => [],
    closest: () => null, title: '',
  };
  return e;
};
const document = {
  addEventListener() {}, getElementById: () => mkEl(), createElement: () => mkEl(),
  querySelector: () => mkEl(), querySelectorAll: () => [], body: mkEl(),
};

const ctx = {
  Tone, document, console, window: {}, performance: { now: () => Date.now() },
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: () => 0, location: { protocol: 'http:' },
  Math, Float32Array, JSON,
};
ctx.globalThis = ctx;
vm.createContext(ctx);
const load = (f, extra = '') =>
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8') + extra, ctx, { filename: f });

load('samples/manifest.js');
load('samples.js', '\n;window.__preload = () => preloadSamples(() => {});');
load('music.js');
load('cards.js');
load('app.js',
  '\n;["State","buildMaster","CARDS","CARD_ORDER","ROLE_ORDER","insertCard","removeCard",'
  + '"ensureBar","updateArrangement","updateAutoMix","triggerBuild","pressInstrument"]'
  + '.forEach(n=>{ try{ globalThis[n]=eval(n); }catch(e){} });');

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const pad = (s, n) => String(s).padEnd(n);

(async () => {
  await ctx.window.__preload();
  await ctx.buildMaster();
  const { State, CARD_ORDER, ROLE_ORDER, CARDS } = ctx;

  /* マスター段だけで何個使っているかを先に控える */
  const baseLive = census.made - census.killed;
  console.log(`マスター段のノード数（土台）: ${baseLive}`);

  State.playing = true; State.paused = false;
  State.durationSec = 240;

  /* 演奏を模擬する：1ラウンド ＝ カードを一巡入れ替え、16小節ぶん再生成 */
  const ROUNDS = 12;
  const snapshots = [];
  let tick = 0;

  for (let round = 0; round < ROUNDS; round++) {
    /* --- カードの入れ替え（実際の遊び方：楽器キーを押して巡回させる）--- */
    for (const rk of ROLE_ORDER) {
      const ids = CARD_ORDER[rk];
      for (let i = 0; i < 4; i++) {
        const id = ids[(round * 4 + i) % ids.length];
        State.lastInput.clear();
        try { ctx.insertCard(id); } catch (e) { errors.push('insertCard: ' + e.message); }
      }
    }
    /* --- 16小節ぶん、本物の小節再生成を回す --- */
    for (let b = 0; b < 16; b++) {
      tick += BAR;
      Tone.Transport.ticks = tick;
      try { ctx.ensureBar(Math.floor(tick / BAR)); } catch (e) { errors.push('ensureBar: ' + e.message); }
    }
    /* --- 1秒ごとの処理（アレンジと自動ミックス）を16回ぶん --- */
    for (let s = 0; s < 16; s++) {
      State.elapsed++;
      try { ctx.updateArrangement(); ctx.updateAutoMix(); } catch (e) { errors.push('update: ' + e.message); }
    }
    /* fadeOutAndDispose は setTimeout 経由。実時間を待って確実に回収させる */
    await wait(1400);
    snapshots.push({
      round: round + 1,
      parts: State.parts.size,
      live: census.made - census.killed,
      made: census.made,
      killed: census.killed,
    });
  }

  console.log('');
  console.log('ラウンド  鳴っている枚数  生成累計  破棄累計  生きているノード');
  snapshots.forEach(s => {
    console.log(`  ${pad(s.round, 6)}  ${pad(s.parts, 14)}  ${pad(s.made, 8)}  ${pad(s.killed, 8)}  ${s.live}`);
  });

  /* 判定：後半5ラウンドで生きているノードが増え続けていたらリーク */
  const tail = snapshots.slice(-5).map(s => s.live);
  const growth = tail[tail.length - 1] - tail[0];
  console.log('');
  console.log(`後半5ラウンドでの増加: ${growth} ノード`);

  /* 種類ごとの生き残りを、多い順に出す */
  const live = [...census.liveByKind.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  console.log('\n生きているノードの内訳（多い順）');
  live.forEach(([k, n]) => console.log(`  ${pad(k, 16)} ${n}`));

  if (errors.length) {
    console.log('\n例外:');
    [...new Set(errors)].slice(0, 20).forEach(e => console.log('  ' + e));
  }

  console.log('');
  if (growth > 20) {
    console.log(`⚠ ノードが増え続けている（後半だけで +${growth}）。これが時間経過での音の欠落の原因。`);
    process.exitCode = 1;
  } else {
    console.log('ノードの増え続けは見られない（回収できている）。');
  }
})();
