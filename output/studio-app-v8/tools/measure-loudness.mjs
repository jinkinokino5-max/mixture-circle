/* =====================================================================
   measure.mjs — 全120枚を「実際に音として書き出して」音量を測る
   ---------------------------------------------------------------------
   これまでの検証は「音名が壊れていないか」「例外が出ないか」だけだった。
   ここでは本物の mp3 をデコードし、各カードのパターンを4小節ぶん
   OfflineAudioContext で合成して、**耳で感じる音量**を数値で出す。

   測る量は LUFS（ITU-R BS.1770 の K特性ラウドネス）。
   単純な RMS だと低音が過大評価されるが、LUFS は人の聴こえ方に合わせて
   低域を落として測るので、「ベースだけやたら大きい」を正しく検出できる。

   アプリ側と同じ条件をそろえてある：
     ・samples.js と同じ式で音源ごとの補正dBを実測して足す
     ・music.js の gain / hp / lp をそのまま適用する
     ・Tone.Sampler と同じく「いちばん近い音源を選んで移調」する
   ===================================================================== */
import { OfflineAudioContext } from 'node-web-audio-api';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

import { fileURLToPath } from 'url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SR = 48000;          // BS.1770 の係数が 48kHz 用なので合わせる
const BPM = 100;
const BARS = 8;   // v6 は小節ごとに音符が変わるので長めに測る
const BEAT = 60 / BPM;
const STEP = BEAT / 4;
const DUR = BARS * 4 * BEAT;

/* ---------- music.js を読む ---------- */
const ctx = { window: {}, console, Math };
vm.createContext(ctx);
const EXPORTS = ['CARDS', 'CARD_ORDER', 'ROLES', 'ROLE_ORDER', 'PROGRESSIONS',
                 'resolveNotes', 'generateBar', 'INSTRUMENTS', 'INSTRUMENT_ORDER', 'VARIATIONS'];
vm.runInContext(fs.readFileSync(path.join(ROOT, 'music.js'), 'utf8')
  + '\n;(' + JSON.stringify(EXPORTS) + ').forEach(n => { globalThis[n] = eval(n); });', ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'samples/manifest.js'), 'utf8'), ctx);
const { CARDS, CARD_ORDER, ROLE_ORDER, ROLES, PROGRESSIONS,
        resolveNotes, generateBar, INSTRUMENTS, INSTRUMENT_ORDER, VARIATIONS } = ctx;
const MANIFEST = ctx.window.SAMPLE_MANIFEST;

/* ---------- 音名 → MIDI ---------- */
const PC = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const toMidi = n => { const m = /^([A-G]#?)(-?\d+)$/.exec(n); return m ? (+m[2] + 1) * 12 + PC[m[1]] : null; };
const fileMidi = f => toMidi(f.replace('s', '#'));

/* ---------- 全 mp3 をデコード ---------- */
const dec = new OfflineAudioContext(1, SR, SR);
const BUF = new Map();
async function decodeAll() {
  const jobs = [];
  for (const [set, notes] of Object.entries(MANIFEST.pitched)) notes.forEach(n => jobs.push([set, n]));
  for (const [kit, parts] of Object.entries(MANIFEST.drums)) parts.forEach(p => jobs.push(['drums/' + kit, p]));
  for (const [dir, name] of jobs) {
    const p = path.join(ROOT, 'samples', dir, name + '.mp3');
    try { BUF.set(dir + '/' + name, await dec.decodeAudioData(fs.readFileSync(p).buffer)); }
    catch (e) { /* 読めないものは飛ばす（アプリ側も合成音に落ちる） */ }
  }
  return jobs.length;
}

/* ---------- samples.js と同じラウドネス実測 ---------- */
const WINDOW = 0.5, REF = 0.070, LIMIT = 14;
function onsetRms(buf) {
  const d = buf.getChannelData(0);
  let peak = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  if (peak < 1e-5) return 0;
  const gate = peak * 0.01;
  let s = 0; for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) >= gate) { s = i; break; }
  const e = Math.min(d.length, s + Math.round(WINDOW * buf.sampleRate));
  let sum = 0; for (let i = s; i < e; i++) sum += d[i] * d[i];
  return Math.sqrt(sum / Math.max(1, e - s));
}
const med = a => { if (!a.length) return 0; const b = [...a].sort((x, y) => x - y); const m = b.length >> 1;
                   return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const trimDb = (x, r) => (x <= 1e-6 ? 0 : Math.max(-LIMIT, Math.min(LIMIT, 20 * Math.log10(r / x))));

const SET_TRIM = new Map(), KIT_TRIM = new Map();
function analyzeLoudness() {
  for (const [set, notes] of Object.entries(MANIFEST.pitched)) {
    const v = notes.map(n => BUF.get(set + '/' + n)).filter(Boolean).map(onsetRms).filter(x => x > 0);
    if (v.length) SET_TRIM.set(set, trimDb(med(v), REF));
  }
  const byPart = {};
  for (const [kit, parts] of Object.entries(MANIFEST.drums))
    parts.forEach(p => { const b = BUF.get(`drums/${kit}/${p}`); if (!b) return;
                         const r = onsetRms(b); if (r > 0) (byPart[p] ||= []).push({ kit, r }); });
  for (const [p, list] of Object.entries(byPart)) {
    const ref = med(list.map(x => x.r));
    list.forEach(({ kit, r }) => KIT_TRIM.set(`${kit}/${p}`, trimDb(r, ref)));
  }
}
const db2g = db => Math.pow(10, db / 20);

/* ---------- ドラム部位 → 鍵盤名（samples.js と同じ） ---------- */
const DRUM_PARTS = ['kick', 'snare', 'hihat', 'tom1', 'tom2', 'tom3'];

/* ---------- 1枚ぶんを実際に合成する ---------- */
async function renderCard(cardId) {
  const card = CARDS[cardId];
  const role = cardId.split('-')[0];
  const s = card.sound;
  const ac = new OfflineAudioContext(1, Math.ceil(DUR * SR) + SR, SR);

  /* music.js の hp / lp をそのまま通す（帯域で音量感が変わるので必須）。
     さらに v6 の案C（強さで音色が変わる）と案D（奥行きの空気減衰）も
     アプリと同じ式で再現する。これを入れないと、実際より明るい音を
     測ってしまい、音量合わせが 1〜2dB ずれる。                      */
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass';  lp.frequency.value = s.lp || 16000;
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = s.hp || 20;
  hp.connect(lp);
  const depth = (card.space && card.space.depth) || 0;
  if (depth > 0.05) {
    const air = ac.createBiquadFilter(); air.type = 'lowpass';
    air.frequency.value = 16000 - depth * 8500;
    lp.connect(air); air.connect(ac.destination);
  } else lp.connect(ac.destination);

  /* 案C：音符ごとに lp を動かす（app.js の applyTimbre と同じ式） */
  const tb = card.timbre;
  const timbreAt = (t, v) => {
    if (!tb) return;
    const nominal = s.lp || 16000;
    const k = tb.open + (1 - tb.open) * Math.pow(Math.max(0, Math.min(1, v)), tb.curve);
    lp.frequency.setValueAtTime(Math.max(180, Math.min(18000, nominal * k)), Math.max(0, t));
  };

  const isKit = s.kind === 'kit';
  const sampled = isKit
    ? DRUM_PARTS.slice(0, 3).every(p => BUF.has(`drums/${s.set}/${p}`))
    : (s.kind === 'sampler' && (MANIFEST.pitched[s.set] || []).some(n => BUF.has(s.set + '/' + n)));

  /* 実録音のときだけ、アプリと同じ補正dBを足す */
  const trim = (!isKit && sampled) ? (SET_TRIM.get(s.set) || 0) : 0;
  const out = ac.createGain();
  out.gain.value = db2g(s.gain + trim);
  out.connect(hp);

  /* --- 実録音を1発鳴らす --- */
  const playBuf = (buf, t, v, rate = 1) => {
    if (!buf) return;
    const src = ac.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    const g = ac.createGain(); g.gain.value = Math.min(1, v);
    src.connect(g); g.connect(out); src.start(t);
  };
  /* --- 合成音を1発鳴らす（Tone のシンセ設定に寄せた近似） --- */
  const SYN = {
    mono: ['sawtooth', .006, .2, .55, .2], fuzz: ['square', .004, .24, .7, .2],
    sub:  ['sine', .01, .3, .9, .3],       lead: ['square', .004, .12, .08, .16],
    pad:  ['sawtooth', .6, .5, .75, 1.8],  bow:  ['sawtooth', .18, .3, .6, .9],
    brass:['sawtooth', .012, .16, .24, .22], bell: ['triangle', .002, .35, .02, .5],
    poly: ['triangle', .004, .5, .12, 1.0], pluck: ['triangle', .002, .3, .05, .4],
  };
  const playSyn = (midi, t, v, dur) => {
    const [type, a, d, sus, rel] = SYN[s.fb] || SYN.poly;
    const o = ac.createOscillator(); o.type = type;
    o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.linearRampToValueAtTime(v * sus, t + a + d);
    g.gain.linearRampToValueAtTime(0, t + Math.max(a + d, dur) + rel);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + Math.max(a + d, dur) + rel + .02);
  };
  /* --- シンバル類（アプリでは MetalSynth。ここは帯域ノイズで近似） --- */
  const noiseBuf = (() => {
    const b = ac.createBuffer(1, SR * 2, SR); const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  })();
  const cym = (t, v, decay, freq, lvlDb) => {
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 1.2;
    const g = ac.createGain();
    g.gain.setValueAtTime(v * db2g(lvlDb), t);
    g.gain.exponentialRampToValueAtTime(1e-4, t + decay);
    src.connect(bp); bp.connect(g); g.connect(out);
    src.start(t); src.stop(t + decay + .02);
  };

  const DURS = { '1n': 4 * BEAT, '2n': 2 * BEAT, '4n': BEAT, '8n': BEAT / 2, '16n': BEAT / 4 };
  const prog = PROGRESSIONS.night;
  const ENERGY = 2;

  for (let bar = 0; bar < BARS; bar++) {
    const chord = prog.bars[bar % prog.bars.length];
    const barT = bar * 4 * BEAT;

    if (!isKit) {
      const lift = (role === 'melody' && bar % 8 === 7) ? 1 : 0;
      generateBar(card, bar, ENERGY, null, 1).forEach(ev => {
        const t = barT + ev.s * STEP;
        const dur = DURS[ev.l] || BEAT / 4;
        timbreAt(t, ev.v);
        resolveNotes(role, chord, ev, s.oct, lift).forEach(nm => {
          const midi = toMidi(nm);
          if (sampled) {
            /* Tone.Sampler と同じ：いちばん近い音源を選んで移調する */
            const notes = (MANIFEST.pitched[s.set] || []).filter(n => BUF.has(s.set + '/' + n));
            if (!notes.length) return;
            let best = notes[0], bd = 1e9;
            notes.forEach(n => { const d = Math.abs(fileMidi(n) - midi); if (d < bd) { bd = d; best = n; } });
            playBuf(BUF.get(s.set + '/' + best), t, ev.v, Math.pow(2, (midi - fileMidi(best)) / 12));
          } else playSyn(midi, t, ev.v, dur);
        });
      });
    } else {
      const d = card.drum;
      const kb = p => BUF.get(`drums/${s.set}/${p}`);
      const kt = p => db2g(KIT_TRIM.get(`${s.set}/${p}`) || 0);
      const hit = (p, t, v) => { timbreAt(t, v);
        return sampled ? playBuf(kb(p), t, Math.min(1, v * kt(p))) : playSyn(48, t, v * .5, .1); };
      for (let st = 0; st < 16; st++) {
        const t = barT + st * STEP;
        if (d.k.includes(st)) hit('kick', t, .92);
        if (d.s.includes(st)) hit('snare', t, .56);
        if (d.h.includes(st)) hit('hihat', t, d.hv * (st % 4 === 0 ? 1.15 : .85));
        if (ENERGY >= 2 && d.ghost && d.ghost.includes(st)) hit('snare', t, .16);
        if (d.t  && d.t.includes(st))  hit('tom1', t, .50);
        if (d.t2 && d.t2.includes(st)) hit('tom2', t, .52);
        if (d.t3 && d.t3.includes(st)) hit('tom3', t, .56);
        if (d.oh && d.oh.includes(st)) cym(t, .55, .25, 6500, -20);
        if (d.rd && d.rd.includes(st)) cym(t, (d.rv || .5) * (st % 4 === 0 ? 1.15 : .85), .45, 5200, -19);
        if (d.cr && d.cr.includes(st) && bar % (d.crEvery || 8) === (d.crPhase || 0)) cym(t, .72, 1.6, 3000, -16);
      }
    }
  }

  const rendered = await ac.startRendering();
  return rendered.getChannelData(0);
}

/* ---------- LUFS（ITU-R BS.1770 の K特性）---------- */
function biquad(x, b, a) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
/* BS.1770-4 の「ゲート付き」ラウドネス。
   400ms のブロックに切り、静かすぎるブロックを捨ててから平均する。
   ---------------------------------------------------------------
   ここが今回の肝。ゲート無しで測ると、音数の少ない「余白」変化は
   休符（無音）まで平均に入ってしまい、実際には同じ大きさで鳴って
   いるのに「小さい」と誤判定される。ゲートを入れると
   「鳴っているあいだの大きさ」で比べられる。                    */
function lufs(x) {
  const s1 = biquad(x, [1.53512485958697, -2.69169618940638, 1.19839281085285],
                       [1, -1.69065929318241, 0.73248077421585]);
  const s2 = biquad(s1, [1.0, -2.0, 1.0], [1, -1.99004745483398, 0.99007225036621]);

  const block = Math.round(0.400 * SR), hop = Math.round(0.100 * SR);
  const power = [];
  for (let st = 0; st + block <= s2.length; st += hop) {
    let sum = 0;
    for (let i = st; i < st + block; i++) sum += s2[i] * s2[i];
    power.push(sum / block);
  }
  if (!power.length) return -Infinity;

  const toL = p => (p <= 1e-12 ? -Infinity : -0.691 + 10 * Math.log10(p));
  /* 絶対ゲート −70 LUFS */
  let kept = power.filter(p => toL(p) >= -70);
  if (!kept.length) return -Infinity;
  /* 相対ゲート（残ったぶんの平均 −10 LU） */
  const relTh = toL(kept.reduce((a, b) => a + b, 0) / kept.length) - 10;
  const kept2 = kept.filter(p => toL(p) >= relTh);
  const use = kept2.length ? kept2 : kept;
  return toL(use.reduce((a, b) => a + b, 0) / use.length);
}
const peakOf = x => { let p = 0; for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i])); return p; };

/* =====================================================================
   スペクトル重心（＝そのカードの「明るさ」）
   ---------------------------------------------------------------------
   後から足す音は、すでに鳴っている音と「同じかそれより下」の重心で
   なければ溶けない。上回った瞬間に blend が急落する（非対称）。
   → reference/音源と楽器リサーチ.md §3-2（Lembke & McAdams 2015）

   書き出した波形そのものから測るので、gain・hp・lp・oct・案C（強さで
   lp が動く）まで全部入った「実際に聞こえる明るさ」になる。
   楽器の素の重心ではなく、そのカードとして鳴ったときの値を使うのが要点。
   ===================================================================== */
const N_FFT = 2048;

/* 実数信号用に、素直な繰り返し radix-2 FFT を1つ置く（外部依存を増やさない）*/
function fftMag(re) {
  const n = re.length;
  const im = new Float64Array(n);
  /* ビット反転並べ替え */
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k],           ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;            im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;  im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi;   ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
  const mag = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}

function centroidHz(x) {
  const hop = N_FFT / 2;
  const win = new Float64Array(N_FFT);
  for (let i = 0; i < N_FFT; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N_FFT - 1));

  /* 無音のフレームを混ぜると重心が意味を失うので、ピークの 5% でゲート */
  const peak = peakOf(x);
  if (peak < 1e-6) return 0;
  const gate = peak * 0.05;

  const vals = [];
  for (let st = 0; st + N_FFT <= x.length; st += hop) {
    let mx = 0;
    for (let i = st; i < st + N_FFT; i++) mx = Math.max(mx, Math.abs(x[i]));
    if (mx < gate) continue;                       // 鳴っていないフレーム
    const buf = new Float64Array(N_FFT);
    for (let i = 0; i < N_FFT; i++) buf[i] = x[st + i] * win[i];
    const mag = fftMag(buf);
    let num = 0, den = 0;
    for (let k = 1; k < mag.length; k++) { num += (k * SR / N_FFT) * mag[k]; den += mag[k]; }
    if (den > 1e-9) vals.push(num / den);
  }
  return vals.length ? med(vals) : 0;
}

/* ---------- 実行 ---------- */
const n = await decodeAll();
analyzeLoudness();
console.log(`mp3 ${BUF.size}/${n} をデコード。ラウドネス補正を実測。\n`);

const rows = [];
for (const rk of ROLE_ORDER) {
  for (const id of CARD_ORDER[rk]) {
    const pcm = await renderCard(id);
    rows.push({ id, role: rk, inst: CARDS[id].inst, n: CARDS[id].n,
                lufs: lufs(pcm), peak: peakOf(pcm), centroid: centroidHz(pcm) });
  }
}

/* --- ROLE ごとの中央値と、そこからのズレ --- */
const f = v => (v === -Infinity ? '  -inf' : v.toFixed(1).padStart(6));
console.log('【ROLE ごとのラウドネス（LUFS・高いほど大きい）】');
const roleMed = {};
ROLE_ORDER.forEach(rk => {
  const v = rows.filter(r => r.role === rk).map(r => r.lufs).filter(isFinite);
  roleMed[rk] = med(v);
  console.log(`  ${ROLES[rk].label.padEnd(7)} 中央値 ${f(roleMed[rk])}   最小 ${f(Math.min(...v))}   最大 ${f(Math.max(...v))}`);
});

console.log('\n【変化1/2/3 のあいだで音量がそろっているか（楽器ごとの最大差）】');
const spread = [];
for (const [iid] of Object.entries(INSTRUMENTS)) {
  const v = rows.filter(r => r.inst === iid).map(r => r.lufs).filter(isFinite);
  if (v.length === 3) spread.push({ iid, d: Math.max(...v) - Math.min(...v), v });
}
spread.sort((a, b) => b.d - a.d);
spread.slice(0, 12).forEach(s =>
  console.log(`  ${s.iid.padEnd(20)} 差 ${s.d.toFixed(1).padStart(5)} dB   ` + s.v.map(f).join(' /')));
console.log(`  … 40楽器の平均差 ${(spread.reduce((a, b) => a + b.d, 0) / spread.length).toFixed(2)} dB`);

console.log('\n【ROLE の中央値から 5dB 以上ずれているカード】');
const OUT = 5;
const bad = rows.filter(r => isFinite(r.lufs) && Math.abs(r.lufs - roleMed[r.role]) >= OUT)
                .sort((a, b) => Math.abs(b.lufs - roleMed[b.role]) - Math.abs(a.lufs - roleMed[a.role]));
if (!bad.length) console.log('  なし');
bad.forEach(r => console.log(
  `  ${r.id.padEnd(22)} ${f(r.lufs)} LUFS   中央値との差 ${(r.lufs - roleMed[r.role] > 0 ? '+' : '')}${(r.lufs - roleMed[r.role]).toFixed(1)} dB`));

console.log('\n【明るさ＝スペクトル重心（低いほど溶ける・楽器ごとの中央値 Hz）】');
const bright = Object.keys(INSTRUMENTS)
  .map(iid => ({ iid, hz: med(rows.filter(r => r.inst === iid).map(r => r.centroid).filter(v => v > 0)) }))
  .filter(x => x.hz > 0).sort((a, b) => a.hz - b.hz);
const col = x => `${x.iid.padEnd(17)}${Math.round(x.hz).toString().padStart(5)}`;
console.log('  ── 暗い（溶ける）──');
bright.slice(0, 6).forEach(x => console.log('  ' + col(x)));
console.log('  ── 明るい（立つ）──');
bright.slice(-6).forEach(x => console.log('  ' + col(x)));

const clip = rows.filter(r => r.peak > 1.0);
console.log(`\n【パート単体で 0dBFS を超えたカード】 ${clip.length ? clip.map(r => r.id + '(' + r.peak.toFixed(2) + ')').join(', ') : 'なし'}`);

fs.writeFileSync(path.join(ROOT,'tools','levels.json'), JSON.stringify(rows, null, 1));
console.log('\nlevels.json に全120枚の実測値を書き出しました。');
