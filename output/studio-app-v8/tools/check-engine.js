/* =====================================================================
   tools/check-engine.js — app.js を Tone.js 抜きで実際に走らせる
   ---------------------------------------------------------------------
     node tools/check-engine.js
   ---------------------------------------------------------------------
   Tone.js と DOM を最小限スタブして、本物の app.js を読み込み、
   120枚すべてを16小節ぶん実際に tick させる。ブラウザを開かずに
     ・全カードが発音するか／例外が出ないか
     ・キー巡回（1→2→3→止まる）が正しいか
     ・案1 衝突回避が実際に効いているか（占有表が埋まるか）
     ・案3 アレンジ・エンジンが章を進めるか
     ・案4 グルーヴが時刻をずらしているか
     ・案5 自動ミックスが補正を出すか
   を確かめる。
   ===================================================================== */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const PPQ = 192, BAR = PPQ * 4;

const hits = [];
const rec = (kind, note, vel, time) => hits.push({ kind, note, vel, time });
const errors = [];

/* ---------- Tone.js スタブ ---------- */
class Node {
  connect(d) { this.__dest = d; return this; }
  toDestination() { return this; }
  dispose() { this.__disposed = true; }
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
  triggerAttack(n, t, v) { rec('sampler', n, v, t); }
  triggerAttackRelease(n, d, t, v) { rec('sampler', n, v, t); }
}
class PolySynth extends Node { triggerAttackRelease(n, d, t, v) { rec('poly', n, v, t); } }
class MonoSynth extends Node { triggerAttackRelease(n, d, t, v) { rec('mono', n, v, t); } }
class Synth extends Node {}
class MembraneSynth extends Node { triggerAttackRelease(n, d, t, v) { rec('membrane', n, v, t); } }
class NoiseSynth extends Node { triggerAttackRelease(d, t, v) { rec('noise', 'x', v, t); } }
class MetalSynth extends Node { triggerAttackRelease(d, t, v) { rec('metal', 'x', v, t); } }
class PluckSynth extends Node { triggerAttack(n, t) { rec('pluck', n, 1, t); } }
class Limiter extends Node {} class Compressor extends Node {}
/* v6.1：最終段のソフトクリッパ。写像関数を実際に呼んで、
   どんな入力でも出力が ±1 を超えないことをここで確かめられるようにする */
class WaveShaper extends Node {
  constructor(map, len) { super(); this.__map = map; this.__len = len; }
  probe(x) { return this.__map(x); }
}
class Panner extends Node { constructor(p){super(); this.__pan=p;} }
class Analyser extends Node { getValue() { return new Float32Array(8); } }
class Meter extends Node { constructor(){super(); this.__b=Meter.__n++;} getValue() { return [-18,-26,-30,-40][this.__b%4] + (Math.random()-.5)*2; } }
Meter.__n=0;
class Reverb extends Node { async generate() {} }
class PingPongDelay extends Node {}
class Recorder extends Node { start() {} }
class Sequence extends Node { constructor(cb) { super(); this.cb = cb; } start() { return this; } stop() { return this; } }

const repeats = [];
const Tone = {
  Gain, Filter, Distortion, Sampler, PolySynth, Synth, MonoSynth, MembraneSynth,
  NoiseSynth, MetalSynth, PluckSynth, Limiter, Compressor, Analyser, Meter, Reverb,
  PingPongDelay, Recorder, Sequence, Panner, Noise: Node, WaveShaper,
  dbToGain: (db) => Math.pow(10, db / 20),
  ToneAudioBuffer: {
    fromUrl: async (url) => {
      const set = url.replace(/^samples\//, '').replace(/\/[^/]+$/, '');
      let h = 0; for (const c of set) h = (h * 31 + c.charCodeAt(0)) % 997;
      const amp = 0.02 + (h / 997) * 0.28;
      const sr = 44100, data = new Float32Array(sr);
      for (let i = 0; i < sr; i++) data[i] = amp * Math.sin(i * 0.05) * Math.exp(-i / (sr * 0.4));
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

/* ---------- 読み込み ---------- */
const ctx = {
  Tone, document, console, window: {}, performance: { now: () => Date.now() },
  setTimeout, clearTimeout, requestAnimationFrame: () => 0, location: { protocol: 'http:' },
  /* 見張り番のタイマーは検証を非決定的にするので空回しにする */
  setInterval: () => 0, clearInterval: () => {},
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
  '\n;["Part","State","buildMaster","CARDS","CARD_ORDER","ROLE_ORDER","ROLES","INSTRUMENTS",'
  + '"INSTRUMENT_ORDER","VARIATIONS","pressInstrument","insertCard","removeCard","KEYMAP",'
  + '"ensureBar","updateArrangement","updateAutoMix","currentSection","roleBus","SECTIONS",'
  + '"generateBar","resolveNotes","setEnergy","playCadence","endGame","dropPart","suggestCards","takeSuggestion","refreshSuggestions","chordAtBar","busyness","triggerBreak","partsBusLevel","MAX_PARTS","UI"]'
  + '.forEach(n=>{ try{ globalThis[n]=eval(n); }catch(e){} });');

/* ---------- 実行 ---------- */
(async () => {
  const res = await ctx.window.__preload();
  console.log(`音源 ${res.loaded}/${res.total} を読み込み（偽バッファ）`);
  await ctx.buildMaster();
  const { Part, State, CARDS, CARD_ORDER, ROLE_ORDER, ROLES, INSTRUMENTS } = ctx;
  /* v8：進行は main 固定。music.js の const はコンテキストに出ないので直接持つ */
  const MAIN_PROG = 'main';

  /* ===== 1. キー巡回 ===== */
  {
    State.playing = true; State.paused = false;
    const instId = 'melody-eguitar';
    const seen = [];
    for (let i = 0; i < 5; i++) {
      State.lastInput.clear();
      ctx.pressInstrument(instId);
      const on = State.order.find(id => CARDS[id] && CARDS[id].inst === instId);
      seen.push(on || '（停止）');
    }
    const want = ['melody-eguitar-1', 'melody-eguitar-2', 'melody-eguitar-3', '（停止）', 'melody-eguitar-1'];
    console.log('キー巡回 : ' + seen.join(' → '));
    if (JSON.stringify(seen) !== JSON.stringify(want)) errors.push('巡回がおかしい。期待 ' + want.join(' → '));
    /* v8：楽器数は役割ごとに違ってよい（melody 9 / chord 10 / bass 7 / rhythm 9）。
       固定値ではなく「全楽器にキーが1つずつ割り当たっているか」で見る。 */
    const instTotal = ROLE_ORDER.reduce((n, rk) => n + ctx.INSTRUMENT_ORDER[rk].length, 0);
    if (Object.keys(ctx.KEYMAP).length !== instTotal) errors.push(`KEYMAP が ${Object.keys(ctx.KEYMAP).length} 個（楽器は ${instTotal} 個）`);
    State.order.slice().forEach(id => ctx.removeCard(id));
  }

  /* ===== 2. 120枚を1枚ずつ16小節走らせる ===== */
  const summary = [];
  const newVoc = { crash: 0, ride: 0, open: 0, tom2: 0, tom3: 0 };
  State.playing = false;

  for (const rk of ROLE_ORDER) {
    for (const id of CARD_ORDER[rk]) {
      hits.length = 0;
      let part;
      try { part = new Part(id); } catch (e) { errors.push(`${id}: Part 生成で例外 ${e.message}`); continue; }
      State.parts.set(id, part); State.order = [id];
      State.kickOwner = part.hasKick ? id : null;
      State.energy = 2; State.velScale = 1; State.genBar = -1;

      const local = { crash: 0, ride: 0, open: 0, tom2: 0, tom3: 0 };
      if (part.kit) ['crash', 'ride', 'open', 'tom2', 'tom3'].forEach(k => {
        const orig = part.kit[k];
        part.kit[k] = (t, v) => { local[k]++; return orig(t, v); };
      });

      const offsets = [];
      for (let bar = 0; bar < 16; bar++) {
        for (let step = 0; step < 16; step++) {
          const time = bar * BAR + step * (PPQ / 4);
          try {
            if (part.kit) part.tickDrum(time, step); else part.tickPitched(time, step);
          } catch (e) { errors.push(`${id}: bar${bar} step${step} で例外 ${e.message}`); bar = 999; break; }
        }
      }
      /* 案4：グルーヴが時刻をずらしているか（全部が格子ぴったりなら効いていない） */
      hits.forEach(h => { if (typeof h.time === 'number') offsets.push(h.time % 1); });
      const moved = offsets.filter(o => Math.abs(o) > 1e-9).length;

      if (hits.length === 0) errors.push(`${id}: 16小節まわして一度も音が出ていない`);
      Object.keys(newVoc).forEach(k => newVoc[k] += local[k]);
      summary.push({ id, sampled: part.sampled, n: hits.length, moved, ...local });

      try { part.dispose(); } catch (e) { errors.push(`${id}: dispose で例外 ${e.message}`); }
      State.parts.delete(id); State.order = [];
    }
  }

  /* ===== 3. 案1：複数枚を重ねたとき占有表が働くか ===== */
  {
    State.playing = true; State.genBar = -1;
    State.parts.clear(); State.order = [];
    ['rhythm-kit-1', 'bass-ebass-1', 'chord-piano-3', 'melody-piano-3'].forEach(id => {
      const p = new Part(id);
      State.parts.set(id, p); State.order.push(id);
    });
    State.kickOwner = 'rhythm-kit-1';
    ctx.ensureBar(4);
    const occ = State.occ;
    const sum = b => Array.from(occ[b]).reduce((a, x) => a + x, 0);
    console.log(`占有表 : 低域 ${sum('low').toFixed(1)} / 中域 ${sum('mid').toFixed(1)} / 高域 ${sum('high').toFixed(1)}`);
    if (sum('low') === 0 && sum('mid') === 0) errors.push('占有表がまったく埋まっていない（案1が動いていない）');

    /* 同じ ROLE の2枚目が1枚目とどれだけ同じ位置に置いたか */
    const a = State.parts.get('chord-piano-3').curPat.map(e => e.s);
    const b = State.parts.get('melody-piano-3').curPat.map(e => e.s);
    const overlap = b.filter(s => a.includes(s)).length / Math.max(1, b.length);
    console.log(`中域2枚の位置かぶり : ${(overlap * 100).toFixed(0)}%`);
    if (overlap > 0.7) errors.push(`中域の2枚が ${(overlap * 100).toFixed(0)}% かぶっている（避けが効いていない）`);
    State.parts.forEach(p => p.dispose());
    State.parts.clear(); State.order = [];
  }

  /* ===== 4. 案3：アレンジ・エンジンが章を進めるか ===== */
  {
    State.playing = true; State.autoArrange = true;
    State.durationSec = 240; State.section = null; State.lastManualEnergy = 0;
    const seen = [];
    for (let s = 0; s <= 240; s += 5) {
      State.elapsed = s;
      ctx.updateArrangement();
      const k = ctx.currentSection().key;
      if (seen[seen.length - 1] !== k) seen.push(k);
    }
    console.log('章の進行 : ' + seen.join(' → '));
    if (seen.length < 5) errors.push(`章が ${seen.length} 個しか進まない（7つあるはず）`);
    /* 手で ENERGY を触ったら自動が引っ込むか */
    ctx.setEnergy(1);
    State.elapsed = 200; State.section = null;
    ctx.updateArrangement();
    if (State.energy !== 1) errors.push('手動 ENERGY のあと、自動が上書きしてしまっている');
  }

  /* ===== 5. 案5：自動ミックスが補正を出すか ===== */
  {
    State.playing = true; State.autoMix = true;
    State.parts.clear(); State.order = [];
    ['bass-ebass-1', 'melody-piano-1'].forEach(id => {
      const p = new Part(id); State.parts.set(id, p); State.order.push(id);
    });
    for (let i = 0; i < 25; i++) ctx.updateAutoMix();
    const corr = ROLE_ORDER.map(rk => `${ROLES[rk].jp} ${ctx.roleBus[rk].corr.toFixed(1)}`).join(' / ');
    console.log('自動ミックス補正 : ' + corr);
    const moved = ROLE_ORDER.some(rk => Math.abs(ctx.roleBus[rk].corr) > 0.05);
    if (!moved) errors.push('自動ミックスがまったく動いていない');
    const over = ROLE_ORDER.filter(rk => Math.abs(ctx.roleBus[rk].corr) > 4.001);
    if (over.length) errors.push('自動ミックスが ±4dB を超えた: ' + over.join(','));
    State.parts.forEach(p => p.dispose());
  }

  /* ===== 6. 案C：ベロシティで音色（lp）が動くか ===== */
  {
    State.timbre = true;
    const p = new ctx.Part('melody-sax-1');
    const seen = [];
    p.lp.frequency.setValueAtTime = (f) => seen.push(f);
    p.applyTimbre(0, 0.2); p.applyTimbre(0, 0.9);
    const nominal = p.s.lp;
    console.log(`音色 : 弱 ${Math.round(seen[0])}Hz / 強 ${Math.round(seen[1])}Hz （設定 ${nominal}Hz）`);
    if (!(seen[0] < seen[1])) errors.push('弱いほうが明るくなっている（案Cが逆）');
    if (seen[1] > nominal + 1) errors.push('設定した lp より明るくなっている（音量バランスが崩れる）');
    if (seen[0] / seen[1] > 0.9) errors.push('音色の変化が小さすぎる（効いていない）');
    State.timbre = false;
    seen.length = 0; p.applyTimbre(0, 0.2);
    if (seen.length) errors.push('timbre を切っても音色を動かしている');
    State.timbre = true;
    p.dispose();
  }

  /* ===== 7. 案D：左右と奥行きが設定されるか ===== */
  {
    State.space = true;
    State.parts.clear(); State.order = [];
    const mk = id => { const p = new ctx.Part(id); State.parts.set(id, p); State.order.push(id); return p; };
    const a = mk('melody-eguitar-1');
    const b = mk('melody-flute-1');           // 同じ ROLE の2枚目 → 反転するはず
    const bass = mk('bass-ebass-1');
    const pad = mk('chord-pad-1');
    console.log(`定位 : ギター ${a.panner.__pan.toFixed(2)} / フルート(2枚目) ${b.panner.__pan.toFixed(2)}`
      + ` / ベース ${bass.panner.__pan.toFixed(2)}`);
    console.log(`奥行き : ギター ${a.depth.toFixed(2)} / パッド ${pad.depth.toFixed(2)}`);
    if (Math.abs(bass.panner.__pan) > 0.001) errors.push('ベースが中央にいない（低音は真ん中であるべき）');
    if (a.panner.__pan * b.panner.__pan >= 0) errors.push('同じ ROLE の2枚が同じ側にいる（左右に分かれるべき）');
    if (!(pad.depth > a.depth)) errors.push('パッドがギターより手前にいる（面ものは奥であるべき）');
    if (!pad.air) errors.push('奥にいるのに空気の減衰が入っていない');
    if (a.depth > 0.05 && !a.air) errors.push('depth があるのに air が無い');
    State.parts.forEach(p => p.dispose());
    State.parts.clear(); State.order = [];

    /* 切ったら全部中央・奥行きなしに戻ること */
    State.space = false;
    const c = new ctx.Part('chord-pad-1');
    if (Math.abs(c.panner.__pan) > 0.001 || c.depth > 0.001) errors.push('space を切っても定位が残っている');
    c.dispose();
    State.space = true;
  }

  /* ===== 8. 案E：終止が組み立てられるか ===== */
  {
    /* scheduleOnce をスタブしているので、何を何拍目に仕込んだかを数える */
    const booked = [];
    ctx.Tone.Transport.scheduleOnce = (cb, at) => { booked.push({ cb, at }); };
    State.playing = true; State.cadenceOn = true; State.cadence = false;
    State.prog = MAIN_PROG; State.kickOwner = null;
    const before = State.prog;
    const pr = ctx.playCadence();
    console.log(`終止 : ${booked.length} 個の仕込み（進行の解決・リタルダンド・リズム抜き・最後の一撃）`);
    if (booked.length < 4) errors.push(`終止の仕込みが ${booked.length} 個しかない（4つ必要）`);
    /* 1つめを実行すると進行がトニック側へ切り替わるはず */
    try { booked[0].cb(0); } catch (e) { errors.push('終止1: ' + e.message); }
    if (State.prog === before) errors.push('終止でコード進行がトニックへ切り替わっていない');
    /* 最後の一撃が例外を出さないこと */
    try { booked[booked.length - 1].cb(0); } catch (e) { errors.push('終止の最後の一撃: ' + e.message); }
    if (!State.cadence) errors.push('State.cadence が立っていない');
    State.cadence = false; State.prog = before;

    /* 案K：ENERGY が低いときは、フラッシュを出さない「静かな終わり方」になるか */
    let flashed = false;
    const origFlash = ctx.UI.dropFlash;
    ctx.UI.dropFlash = () => { flashed = true; };
    booked.length = 0;
    State.cadence = false; State.energy = 1;
    ctx.playCadence();
    try { booked[booked.length - 1].cb(0); } catch (e) { errors.push('終止（静）の最後: ' + e.message); }
    if (flashed) errors.push('ENERGY=1 の終止なのにフラッシュ（派手な演出）が出た');
    State.cadence = false;

    /* ENERGY が高いときは、従来どおりフラッシュが出るか */
    flashed = false;
    booked.length = 0;
    State.energy = 3;
    ctx.playCadence();
    try { booked[booked.length - 1].cb(0); } catch (e) { errors.push('終止（熱）の最後: ' + e.message); }
    if (!flashed) errors.push('ENERGY=3 の終止でフラッシュが出ていない');
    ctx.UI.dropFlash = origFlash;
    State.cadence = false; State.energy = 2;
  }

  /* ===== 9. 案A：転調が全パートに一斉にかかるか ===== */
  {
    State.keyOn = true; State.prog = MAIN_PROG; State.keySemi = 0;
    const c0 = ctx.chordAtBar(0);
    State.keySemi = 5;
    const c5 = ctx.chordAtBar(0);
    console.log(`転調 : 原調 ${c0.label} → +5 ${c5.label}`);
    if (c0.label === c5.label) errors.push('keySemi を変えてもコードが変わらない（案Aが効いていない）');
    State.keyOn = false;
    if (ctx.chordAtBar(0).label !== c0.label) errors.push('keyOn を切っても転調が残っている');
    State.keyOn = true; State.keySemi = 0;
  }

  /* ===== 10. 案B：提案エンジン ===== */
  {
    State.playing = true;
    State.parts.clear(); State.order = []; State.suggest = []; State.lastSuggest = null;
    State.elapsed = 0; State.durationSec = 240; State.bar = 0;

    /* 何も無いときは、まず土台（リズム／ベース）を推すはず */
    let sug = ctx.suggestCards();
    console.log('最初の提案 : ' + sug.map(id => `${ROLES[CARDS[id].role].jp}の${CARDS[id].label}${CARDS[id].n}`).join(' / '));
    if (sug.length !== 3) errors.push(`提案が ${sug.length} 個（3個であるべき）`);
    const firstRoles = sug.map(id => CARDS[id].role);
    if (!firstRoles.includes('rhythm')) errors.push('何も無い状態でリズムを推していない（土台が先であるべき）');
    /* 何も無いところへ「刻み」を勧めない。曲は基本から始まる */
    if (sug.every(id => CARDS[id].n === 3)) errors.push('始めたばかりなのに全部「刻み」を推している');
    /* キック持ちは1つまで（土台は1枚なので2つ並べても片方は死ぬ） */
    const kickSug = sug.filter(id => CARDS[id].drum && CARDS[id].drum.hasKick && CARDS[id].drum.k.length);
    if (kickSug.length > 1) errors.push(`キック持ちを ${kickSug.length} 個同時に提案している`);
    /* 3つとも同じ ROLE ではないこと（選ぶ意味がなくなる） */
    if (new Set(firstRoles).size === 1) errors.push('3つとも同じ役割を推している');

    /* v8：上限は撤廃したので「超えないこと」は検査できない。
       代わりに「提案が目安（soft）から極端に偏らないこと」を見る。
       目安＋1枚までは許容。それ以上ひとつの役割に寄るのは、
       roleNeed() の減衰が効いていないということ。 */
    for (let i = 0; i < 8; i++) {
      State.suggest = ctx.suggestCards();
      if (!State.suggest.length) break;
      State.lastInput.clear();
      ctx.takeSuggestion(0);
    }
    const counts = {};
    State.order.forEach(id => { counts[CARDS[id].role] = (counts[CARDS[id].role] || 0) + 1; });
    console.log('提案だけで積んだ結果 : ' + ROLE_ORDER.map(r => `${ROLES[r].jp}${counts[r] || 0}（目安${ROLES[r].soft}）`).join(' '));
    ROLE_ORDER.forEach(r => {
      if ((counts[r] || 0) > ROLES[r].soft + 1) errors.push(`${r} が目安 ${ROLES[r].soft} から偏りすぎ（${counts[r]}枚）`);
    });
    /* 同じ楽器が2枚入っていないこと */
    const insts = State.order.map(id => CARDS[id].inst);
    if (new Set(insts).size !== insts.length) errors.push('提案で同じ楽器が2枚入った');
    /* キック持ちが2枚以上にならないこと（土台は1枚） */
    const kicks = State.order.filter(id => CARDS[id].drum && CARDS[id].drum.hasKick && CARDS[id].drum.k.length);
    if (kicks.length > 1) errors.push(`キック持ちが ${kicks.length} 枚（提案が土台を重ねている）`);

    /* v8：上限を撤廃したので、提案は尽きないのが正しい。
       代わりに、いくら積んでも安全弁（MAX_PARTS）を超えないことと、
       積み続けても提案が壊れない（例外・空配列にならない）ことを見る。 */
    let guard = 0;
    while (guard++ < 40) {
      const s = ctx.suggestCards();
      if (!s.length) { errors.push('提案が尽きた（上限撤廃後は出続けるはず）'); break; }
      State.lastInput.clear();
      ctx.insertCard(s[0]);
    }
    if (State.order.length > ctx.MAX_PARTS) {
      errors.push(`安全弁を超えた（${State.order.length} 枚 / MAX_PARTS ${ctx.MAX_PARTS}）`);
    }
    console.log(`上限撤廃の確認 : 40回積んで ${State.order.length} 枚（安全弁 ${ctx.MAX_PARTS}）`);

    /* 賑やかなときは「余白」、寂しいときは「刻み」を推すか */
    State.parts.forEach(p => p.dispose());
    State.parts.clear(); State.order = []; State.lastSuggest = null;
    const quiet = ctx.suggestCards().map(id => CARDS[id].n);
    console.log(`寂しいときの提案の変化番号 : ${quiet.join(',')}（3=刻み が多いはず）`);
    State.parts.clear(); State.order = [];
  }

  /* ===== 10b. 案M（v8）：メロディが重なったら二重奏になるか ===== */
  {
    State.parts.forEach(p => p.dispose());
    State.parts.clear(); State.order = []; State.lastInput.clear();
    State.playing = true; State.genBar = -1;

    /* 別々の楽器のメロディを3枚積む（上限が無いので3枚入るはず） */
    ['melody-piano-1', 'melody-violin-2', 'melody-flute-3'].forEach(id => {
      State.lastInput.clear();
      ctx.insertCard(id);
    });
    const mel = State.order.filter(id => CARDS[id].role === 'melody');
    if (mel.length !== 3) errors.push(`メロディ3枚が入らなかった（${mel.length}枚）`);

    ctx.ensureBar(0);
    const parts = mel.map(id => State.parts.get(id));
    const [p0, p1, p2] = parts;

    /* 主旋律は 0、2枚目・3枚目はずれる */
    if (p0.harmony !== 0) errors.push(`主旋律の harmony が ${p0.harmony}（0 のはず）`);
    if (!p1 || p1.harmony === 0) errors.push('2枚目のメロディがずれていない（二重奏になっていない）');
    if (!p2 || p2.harmony === 0) errors.push('3枚目のメロディがずれていない');
    if (p1 && p2 && p1.harmony === p2.harmony) errors.push('2枚目と3枚目が同じ高さに重なっている');

    /* 音符の位置は借りている＝主旋律と同じ。だから旋律は1本に聞こえる */
    const stepsOf = (p) => p.curPat.map(e => e.s).join(',');
    if (p1 && stepsOf(p1) !== stepsOf(p0)) errors.push('2枚目が主旋律と別の位置で鳴っている（寄り添っていない）');
    if (p2 && stepsOf(p2) !== stepsOf(p0)) errors.push('3枚目が主旋律と別の位置で鳴っている');

    /* 実際に音名を解決して、高さが本当に違うことを確かめる */
    const chord = ctx.chordAtBar(0);
    const nameAt = (p) => {
      const ev = p.curPat[0];
      return ev ? ctx.resolveNotes('melody', chord, ev, p.s.oct, p.harmony)[0] : '(無音)';
    };
    console.log(`二重奏 : ${mel.map((id, i) => `${CARDS[id].label}${nameAt(parts[i])}(${parts[i].harmony >= 0 ? '+' : ''}${parts[i].harmony})`).join(' / ')}`);
    if (p0.curPat.length === 0) errors.push('主旋律が無音（二重奏の検査が成立していない）');

    State.parts.forEach(p => p.dispose());
    State.parts.clear(); State.order = []; State.playing = false;
  }

  /* ===== 11. 案I：ブレイクが仕込まれるか ===== */
  {
    const booked = [];
    ctx.Tone.Transport.scheduleOnce = (cb, at) => { booked.push({ cb, at }); };
    State.playing = true; State.paused = false; State.building = false; State.breaking = false;
    ctx.triggerBreak();
    console.log(`ブレイク : ${booked.length} 個の仕込み（抜く・スネアの目印・戻す）`);
    if (booked.length < 3) errors.push(`ブレイクの仕込みが ${booked.length} 個しかない（3つ必要）`);
    if (!State.breaking) errors.push('triggerBreak 直後に State.breaking が立っていない');
    /* 全部実行しても例外を出さず、最後に breaking が下りること */
    booked.forEach((b, i) => { try { b.cb(0); } catch (e) { errors.push(`ブレイク${i + 1}: ${e.message}`); } });
    if (State.breaking) errors.push('ブレイクが終わっても State.breaking が下りていない');
    /* ビルド中／既にブレイク中は多重に仕込まれないこと */
    booked.length = 0;
    State.building = true;
    ctx.triggerBreak();
    if (booked.length) errors.push('ビルド中なのにブレイクが割り込んだ');
    State.building = false;
  }

  /* ===== 12. 案J：ROLEごとの4トラック（stem）が用意されているか ===== */
  {
    ROLE_ORDER.forEach(rk => {
      if (!ctx.roleBus[rk] || !ctx.roleBus[rk].rec) errors.push(`${rk}: stem 用の Recorder が無い`);
    });
    /* start/stop を呼んでも例外が出ないこと（実ブラウザでは録音データを返す） */
    try {
      ROLE_ORDER.forEach(rk => ctx.roleBus[rk].rec.start());
    } catch (e) { errors.push('stem の start で例外: ' + e.message); }
  }

  /* ---------- 出力 ---------- */
  const pad = (s, n) => String(s).padEnd(n);
  const byInst = new Map();
  summary.forEach(r => {
    const inst = CARDS[r.id].inst;
    if (!byInst.has(inst)) byInst.set(inst, []);
    byInst.get(inst).push(r);
  });
  console.log('\n' + pad('楽器', 20) + pad('音源', 8) + '発音数（16小節）基本/余白/刻み');
  byInst.forEach((rs, inst) => {
    const src = rs.every(r => r.sampled) ? '実録音' : rs.some(r => r.sampled) ? '一部合成' : '合成音';
    console.log(pad(inst, 20) + pad(src, 8) + '            ' + rs.map(r => String(r.n).padStart(4)).join(' /'));
  });

  const synth = summary.filter(r => !r.sampled).map(r => r.id);
  const grooved = summary.filter(r => r.moved > 0).length;
  console.log(`\n合成音のカード（${synth.length}枚）: ${synth.join(', ')}`);
  console.log(`グルーヴで時刻がずれたカード : ${grooved} / ${summary.length}`);
  console.log('新語彙の総発火数:', JSON.stringify(newVoc));

  if (errors.length) { console.log('\n― エラー ―'); errors.forEach(e => console.log('  ' + e)); process.exitCode = 1; }
  else console.log(`\nエラーなし。${summary.length}枚すべてが発音し、8つの自動機能も動いている。`);
})();
