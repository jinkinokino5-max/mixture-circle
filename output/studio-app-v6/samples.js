/* =====================================================================
   samples.js — 実録音サンプルの読み込みと、そこから楽器を作る部分
   ---------------------------------------------------------------------
   ・samples/manifest.js（fetch-samples.js が生成）にある音だけを読む
   ・読めなかった楽器は null を返す → app.js 側が合成音に切り替える
   ・音の実体（バッファ）は1回だけ読んでキャッシュし、パートごとの
     Tone.Sampler はそのバッファを共有する（同じ音源を何度も読まない）
   ---------------------------------------------------------------------
   v5（STUDIO PULSE II）での追加は大きく2つ。

   ■ 1. ラウドネスの実測正規化（§B）
     v4 では music.js の gain(dB) が「音楽的な存在感」と「音源そのものの
     録音レベルの差」の両方を背負っていた。ピアノ(Salamander)は大きく録れて
     いて、フルート(VSCO2)は小さい——という録音側の事情まで手で吸収しよう
     とすると、カードを1枚足すたびに全部を耳で取り直すことになる。

     そこで v5 では、読み込んだバッファから各音源の実効ラウドネスを実測し、
     全楽器を同じ基準に合わせる補正値を自動で作る。
     結果、music.js の gain は「この楽器をどのくらい前に出したいか」だけを
     意味するようになり、楽器を増やしても балансが崩れない。

   ■ 2. ドラムの語彙を増やした（§C）
     v4 のドラムは kick / snare / hihat / tom1 の4つしか無かった。
     セッションの気持ちよさに直結する
        ・クラッシュ（小節頭の開放感）
        ・オープンハイハット（拍が伸びる感じ）
        ・ライド（刻みが前に出る感じ）
     が丸ごと無かった。公開音源側にシンバル類が存在しないため、
     Tone.MetalSynth で合成して全キットに足している。
     あわせて tom2 / tom3 を読むようにし、フィルを「下りていくタム回し」に
     できるようにした。
   ===================================================================== */

const SAMPLE_ROOT = 'samples/';
const BUFFERS = new Map();          // 'piano/C4' → Tone.ToneAudioBuffer

/* ドラムは1音ずつ別の鍵盤に割り当てて Sampler として扱う */
const DRUM_NOTES = {
  kick: 'C1', snare: 'D1', hihat: 'F#1',
  tom1: 'A1', tom2: 'B1', tom3: 'D2',
};

function manifest() {
  return window.SAMPLE_MANIFEST || { pitched: {}, drums: {} };
}

/* ファイル名 'Ds4' → 音名 'D#4'（音名にsは出てこないので単純置換でよい） */
function fileToNote(f) { return f.replace('s', '#'); }

/* =====================================================================
   v6.1 音の途切れ（プツプツ）対策 ── デコード後の常駐メモリを削る
   ---------------------------------------------------------------------
   mp3 はディスク上では 42MB だが、Web Audio は再生のために Float32 の
   生波形へ展開して丸ごと抱え込む。実測すると **437MB**（10.5倍）。
   ピアノは1音が 15 秒もあり、304本の合計は 35 分ぶんにもなっていた。

   これだけ抱えるとメモリの圧迫でごみ集めが頻繁に走り、音声スレッドが
   締め切りに間に合わなくなる。これが「時間がたつとプツプツ切れる」の正体。
   （音割れ＝波形が潰れる現象ではなく、音が欠落する現象）

   そこでデコード直後に2つだけ削る：
     1. 頭から MAX_SEC 秒だけ残す
        100BPM の全音符が 2.4 秒なので、3.5 秒あれば余韻まで足りる。
        切り口でプツッと鳴らないよう、末尾 60ms をフェードアウトさせる。
     2. モノラルにまとめる
        どれも単一楽器の録音で、定位はアプリ側の Panner が作っている。
        元の広がりは使っていないので、捨てても鳴り方は変わらない。

   実測 437.7MB → 150.9MB（66%減）。               */
const MAX_SEC = 3.5;
const FADE_SEC = 0.06;

function compactBuffer(toneBuf) {
  const src = toneBuf.get ? toneBuf.get() : toneBuf;      // 素の AudioBuffer
  if (!src || !src.length) return toneBuf;
  const sr = src.sampleRate;
  const len = Math.min(src.length, Math.ceil(MAX_SEC * sr));
  const ch = src.numberOfChannels;

  let ac;
  try { ac = Tone.getContext(); } catch (e) { ac = null; }
  if (!ac || !ac.createBuffer) return toneBuf;            // 作れないならそのまま使う

  const out = ac.createBuffer(1, len, sr);
  const dst = out.getChannelData(0);

  /* チャンネルを平均してモノラルにする */
  for (let c = 0; c < ch; c++) {
    const s = src.getChannelData(c);
    for (let i = 0; i < len; i++) dst[i] += s[i] / ch;
  }

  /* 途中で切った場合だけ、末尾をなめらかに落とす（切り口のプツッ音よけ）*/
  if (len < src.length) {
    const fade = Math.min(len, Math.round(FADE_SEC * sr));
    for (let i = 0; i < fade; i++) dst[len - fade + i] *= 1 - i / fade;
  }
  return new Tone.ToneAudioBuffer(out);
}

/* ---- 起動時に全部まとめて読む ---- */
async function preloadSamples(onProgress) {
  const m = manifest();
  const jobs = [];
  for (const [set, notes] of Object.entries(m.pitched || {})) {
    notes.forEach(n => jobs.push([set, n]));
  }
  for (const [kit, parts] of Object.entries(m.drums || {})) {
    parts.forEach(p => jobs.push(['drums/' + kit, p]));
  }

  const total = jobs.length;
  let done = 0;
  onProgress(0, total);
  if (total === 0) return { total: 0, loaded: 0 };

  /* 304本を Promise.all で一斉にデコードすると、その間ブラウザが
     数十秒固まる（デコードは重い同期処理）。少しずつ流す。         */
  const LANES = 6;
  const queue = jobs.slice();
  const worker = async () => {
    while (queue.length) {
      const [dir, name] = queue.shift();
      try {
        const raw = await Tone.ToneAudioBuffer.fromUrl(`${SAMPLE_ROOT}${dir}/${name}.mp3`);
        BUFFERS.set(dir + '/' + name, compactBuffer(raw));
      } catch (e) {
        /* 1つ落ちても止めない。足りない楽器は合成音になるだけ */
      }
      onProgress(++done, total);
    }
  };
  await Promise.all(Array.from({ length: LANES }, worker));

  /* 読み終わってから、全音源のラウドネスを実測して補正表を作る */
  analyzeLoudness();

  return { total, loaded: BUFFERS.size };
}

/* =====================================================================
   §B  ラウドネスの実測正規化
   ---------------------------------------------------------------------
   測り方：1音ぶんのバッファについて
     1) 全体のピークを求める
     2) ピークの 1% を最初に超えた地点を「発音点」とみなす
     3) 発音点から 0.5 秒ぶんの RMS を返す
   単純な全体RMSだと、余韻の長いピアノ／短い木琴で不当な差が出る。
   「鳴り始めの 0.5 秒」は人が感じる音量にいちばん近い。
   ===================================================================== */
const LOUDNESS_WINDOW_SEC = 0.5;
const SET_TRIM_DB = new Map();     // 'piano' → 補正dB（音階もの）
const KIT_TRIM_DB = new Map();     // 'acoustic-kit/kick' → 補正dB
const TRIM_LIMIT_DB = 14;          // 補正しすぎない安全弁

/* 音階ものをそろえる基準。この RMS に各楽器を合わせる */
const PITCHED_REF_RMS = 0.070;

function onsetRms(buf) {
  let data;
  try { data = buf.getChannelData(0); } catch (e) { return 0; }
  if (!data || !data.length) return 0;

  let peak = 0;
  for (let i = 0; i < data.length; i++) { const a = Math.abs(data[i]); if (a > peak) peak = a; }
  if (peak < 1e-5) return 0;

  const gate = peak * 0.01;
  let start = 0;
  for (let i = 0; i < data.length; i++) { if (Math.abs(data[i]) >= gate) { start = i; break; } }

  const end = Math.min(data.length, start + Math.round(LOUDNESS_WINDOW_SEC * buf.sampleRate));
  let sum = 0;
  for (let i = start; i < end; i++) sum += data[i] * data[i];
  const n = Math.max(1, end - start);
  return Math.sqrt(sum / n);
}

function median(arr) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function toTrimDb(measured, reference) {
  if (measured <= 1e-6 || reference <= 1e-6) return 0;
  const db = 20 * Math.log10(reference / measured);
  return Math.max(-TRIM_LIMIT_DB, Math.min(TRIM_LIMIT_DB, db));
}

function analyzeLoudness() {
  const m = manifest();

  /* --- 音階もの：楽器ごとに「全音の RMS の中央値」を代表値にする --- */
  for (const [set, notes] of Object.entries(m.pitched || {})) {
    const vals = [];
    notes.forEach(n => {
      const b = BUFFERS.get(set + '/' + n);
      if (b) { const r = onsetRms(b); if (r > 0) vals.push(r); }
    });
    if (vals.length) SET_TRIM_DB.set(set, toTrimDb(median(vals), PITCHED_REF_RMS));
  }

  /* --- ドラム：パート種別ごとに「全キットの中央値」へそろえる ---------
     キック同士・スネア同士を同じ大きさにする、という考え方。
     キットが本来持っている「キックとハットの比率」は壊さずに、
     キット間の当たり外れだけを消せる。                               */
  const byPart = {};     // 'kick' → [{kit, rms}, ...]
  for (const [kit, parts] of Object.entries(m.drums || {})) {
    parts.forEach(p => {
      const b = BUFFERS.get(`drums/${kit}/${p}`);
      if (!b) return;
      const r = onsetRms(b);
      if (r <= 0) return;
      (byPart[p] = byPart[p] || []).push({ kit, rms: r });
    });
  }
  for (const [part, list] of Object.entries(byPart)) {
    const ref = median(list.map(x => x.rms));
    list.forEach(({ kit, rms }) => KIT_TRIM_DB.set(`${kit}/${part}`, toTrimDb(rms, ref)));
  }
}

/* music.js の gain に足す補正（実録音でないものは 0） */
function setTrimDb(set) { return SET_TRIM_DB.get(set) || 0; }

/* 確認用。ブラウザのコンソールで studioLevels() と打つと実測値が出る */
function studioLevels() {
  const rows = [];
  SET_TRIM_DB.forEach((v, k) => rows.push({ 対象: k, '補正dB': Number(v.toFixed(2)) }));
  KIT_TRIM_DB.forEach((v, k) => rows.push({ 対象: 'drums/' + k, '補正dB': Number(v.toFixed(2)) }));
  console.table(rows);
  return rows;
}
window.studioLevels = studioLevels;

/* ---- 音階のある楽器：Sampler に渡す { 音名: バッファ } を組み立てる ---- */
function samplerUrls(set) {
  const notes = (manifest().pitched || {})[set] || [];
  const urls = {};
  notes.forEach(n => {
    const b = BUFFERS.get(set + '/' + n);
    if (b) urls[fileToNote(n)] = b;
  });
  return Object.keys(urls).length ? urls : null;
}

/* ---- ドラム：kick/snare/hihat がそろっているキットだけ採用する ---- */
function kitUrls(kit) {
  const urls = {};
  for (const [part, note] of Object.entries(DRUM_NOTES)) {
    const b = BUFFERS.get(`drums/${kit}/${part}`);
    if (b) urls[note] = b;
  }
  const essential = [DRUM_NOTES.kick, DRUM_NOTES.snare, DRUM_NOTES.hihat];
  return essential.every(n => urls[n]) ? urls : null;
}

/* =====================================================================
   §C  シンバル類（クラッシュ／ライド／オープンハット）
   ---------------------------------------------------------------------
   公開音源側にシンバルが1枚も無いので合成する。Tone.MetalSynth は
   まさにこの用途（金属打楽器）のために用意されているシンセ。
   3つとも同じ系統の音で、減衰の長さと明るさだけを変えている。
     クラッシュ … 長い（1.6秒）／低め／小節頭で「開ける」
     ライド    … 中くらい（0.45秒）／明るい／刻みに使う
     オープンハット … 短い（0.25秒）／いちばん明るい／裏拍を伸ばす
   ===================================================================== */
function makeCymbals(dest) {
  const mk = (opts, level) => {
    const g = new Tone.Gain(Tone.dbToGain(level)).connect(dest);
    const s = new Tone.MetalSynth(Object.assign({
      harmonicity: 5.1, modulationIndex: 32, octaves: 1.5, resonance: 4000,
    }, opts)).connect(g);
    return { s, g };
  };

  /* レベルは v5.1 でそれぞれ +6dB した。
     元の値だと、書き出して測ったときシンバルだけ他の打楽器から
     20dB 以上沈んでいて、「小節頭で開ける」という役目を果たして
     いなかった（特にライドだけのカードはほぼ聞こえない状態）。 */
  const crash = mk({
    frequency: 260, resonance: 3000, modulationIndex: 40, octaves: 1.6,
    envelope: { attack: 0.001, decay: 1.6, release: 1.4 },
  }, -16);
  const ride = mk({
    frequency: 420, resonance: 5200, modulationIndex: 26, octaves: 1.2,
    envelope: { attack: 0.001, decay: 0.45, release: 0.4 },
  }, -19);
  const open = mk({
    frequency: 360, resonance: 6500, modulationIndex: 30, octaves: 1.4,
    envelope: { attack: 0.001, decay: 0.25, release: 0.2 },
  }, -20);

  const fire = (o, t, v, dur) => { try { o.s.triggerAttackRelease(dur, t, v); } catch (e) {} };
  return {
    nodes: [crash.s, crash.g, ride.s, ride.g, open.s, open.g],
    crash: (t, v) => fire(crash, t, v, '2n'),
    ride:  (t, v) => fire(ride,  t, v, '8n'),
    open:  (t, v) => fire(open,  t, v, '16n'),
  };
}

/* ---- 実録音のドラムキットを1つ作る（作れなければ null） ----------------
   §B の補正をここで反映する。パートごとの補正はベロシティに掛けるが、
   1.0 を超えると頭打ちして歪むので、いちばん大きい補正が 1.0 になるよう
   全体を割り、その差ぶんをキットの出力ゲインで戻す。                  */
function makeSampleKit(dest, kit, levelDb) {
  const urls = kitUrls(kit);
  if (!urls) return null;

  const PARTS = ['kick', 'snare', 'hihat', 'tom1', 'tom2', 'tom3'];
  const lin = {};
  PARTS.forEach(p => { lin[p] = Tone.dbToGain(KIT_TRIM_DB.get(`${kit}/${p}`) || 0); });
  const maxLin = Math.max(1e-6, ...PARTS.map(p => lin[p]));
  PARTS.forEach(p => { lin[p] /= maxLin; });                 // すべて 1.0 以下になる
  const makeupDb = 20 * Math.log10(maxLin);                  // 割ったぶんを出口で戻す

  const out = new Tone.Gain(Tone.dbToGain(levelDb + makeupDb)).connect(dest);
  /* release を長めに取り、スネアやタムの余韻を切らない */
  const smp = new Tone.Sampler({ urls, attack: 0, release: 0.6, curve: 'exponential' }).connect(out);
  const cym = makeCymbals(out);

  const has = (p) => !!urls[DRUM_NOTES[p]];
  const hit = (part, t, v) => {
    const note = DRUM_NOTES[part];
    if (!note || !urls[note]) return;
    try { smp.triggerAttack(note, t, Math.min(1, v * lin[part])); } catch (e) {}
  };
  /* 無いタムは1段上のタムで代用し、それも無ければスネアで代用する */
  const tomFall = (p) => has(p) ? p : (has('tom2') ? 'tom2' : (has('tom1') ? 'tom1' : 'snare'));

  return {
    sampled: true,
    nodes: [smp, ...cym.nodes, out],
    out,
    kick:  (t, v) => hit('kick',  t, v),
    snare: (t, v) => hit('snare', t, v),
    hat:   (t, v) => hit('hihat', t, v),
    tom:   (t, v) => hit(tomFall('tom1'), t, v),
    tom2:  (t, v) => hit(tomFall('tom2'), t, v),
    tom3:  (t, v) => hit(tomFall('tom3'), t, v),
    crash: cym.crash,
    ride:  cym.ride,
    open:  cym.open,
  };
}

/* ---- 実録音の音階楽器を1つ作る（作れなければ null） ---- */
function makeSampleVoice(set, env) {
  const urls = samplerUrls(set);
  if (!urls) return null;
  return new Tone.Sampler(Object.assign({ urls, curve: 'exponential' }, env));
}
