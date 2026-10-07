/* =====================================================================
   samples.js — 実録音サンプルの読み込みと、そこから楽器を作る部分（v3）
   ---------------------------------------------------------------------
   ・samples/manifest.js（fetch-samples.js が生成）にある音だけを読む
   ・読めなかった楽器は null を返す → engine.js が合成音に切り替える
   ・音の実体（バッファ）は1回だけ読んでキャッシュし、パートごとの
     Tone.Sampler はそのバッファを共有する（同じ音源を何度も読まない）
   ・v3 の変更：トムを3つ扱う／クラップを合成で足す
   ===================================================================== */

const SAMPLE_ROOT = 'samples/';
const BUFFERS = new Map();          // 'piano/C4' → Tone.ToneAudioBuffer

/* ドラムは1音ずつ別の鍵盤に割り当てて Sampler として扱う */
const DRUM_NOTES = { kick: 'C1', snare: 'D1', hihat: 'F#1', tom1: 'A1', tom2: 'C2', tom3: 'D2' };

function manifest() {
  return window.SAMPLE_MANIFEST || { pitched: {}, drums: {} };
}

/* ファイル名 'Ds4' → 音名 'D#4'（音名にsは出てこないので単純置換でよい） */
function fileToNote(f) { return f.replace('s', '#'); }

/* ---- 起動時に全部まとめて読む ----
   ※ 同時に投げる数を絞ってある。理由：
     `はじめる.bat` が使う Python の `http.server` は、接続の待ち行列が
     既定で5本しかない（socketserver の request_queue_size = 5）。
     236個を一斉に取りに行くと大半が待ち行列からあふれ、
     ブラウザ側で長いタイムアウトに入って「読み込みが終わらない」状態になる。
     実測：同時236個 → 50個しか取れない／同時6個 → 236個すべて取れる。
     取りこぼしは再挑戦する（一時的にあふれただけのことが多いため）。 */
const LOAD_CONCURRENCY = 6;
const LOAD_RETRY = 2;

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
  let done = 0, failed = 0;
  onProgress(0, total);
  if (total === 0) return { total: 0, loaded: 0, sets: 0, failed: 0 };

  async function loadOne(dir, name) {
    for (let attempt = 0; attempt <= LOAD_RETRY; attempt++) {
      try {
        const buf = await Tone.ToneAudioBuffer.fromUrl(`${SAMPLE_ROOT}${dir}/${name}.mp3`);
        BUFFERS.set(dir + '/' + name, buf);
        return true;
      } catch (e) {
        /* 少し待ってから再挑戦。待ち行列があいていれば次は通る */
        if (attempt < LOAD_RETRY) await new Promise(r => setTimeout(r, 150 * (attempt + 1)));
      }
    }
    return false;   /* 最後まで駄目でも止めない。その楽器が合成音になるだけ */
  }

  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const [dir, name] = jobs[next++];
      if (!(await loadOne(dir, name))) failed++;
      onProgress(++done, total);
    }
  }
  await Promise.all(Array.from({ length: Math.min(LOAD_CONCURRENCY, total) }, worker));

  return { total, loaded: BUFFERS.size, sets: Object.keys(m.pitched || {}).length, failed };
}

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

/* ---- 実録音のドラムキットを1つ作る（作れなければ null） ----
   返り値のキーは譜面の p と同じ： k / s / h / t1 / t2 / t3 / c
   クラップだけは音源が無いので合成で足す（engine.js の makeClap）。 */
function makeSampleKit(dest, kit, levelDb = 0) {
  const urls = kitUrls(kit);
  if (!urls) return null;
  const out = new Tone.Gain(Tone.dbToGain(levelDb)).connect(dest);
  /* release を長めに取り、シンバルやスネアの余韻を切らない */
  const smp = new Tone.Sampler({ urls, attack: 0, release: 0.8, curve: 'exponential' }).connect(out);
  const hit = (note) => (t, v) => smp.triggerAttack(note, t, v);
  const has = (part) => !!urls[DRUM_NOTES[part]];
  const clap = makeClap(out);

  const kitObj = {
    sampled: true,
    nodes: [smp, out, ...clap.nodes],
    k: hit(DRUM_NOTES.kick),
    s: hit(DRUM_NOTES.snare),
    h: hit(DRUM_NOTES.hihat),
    c: clap.hit,
  };
  /* トムが無いキットはスネアで代用する（フィルが消えないように） */
  kitObj.t1 = has('tom1') ? hit(DRUM_NOTES.tom1) : kitObj.s;
  kitObj.t2 = has('tom2') ? hit(DRUM_NOTES.tom2) : kitObj.t1;
  kitObj.t3 = has('tom3') ? hit(DRUM_NOTES.tom3) : kitObj.t2;
  return kitObj;
}

/* ---- 実録音の音階楽器を1つ作る（作れなければ null） ---- */
function makeSampleVoice(set, env) {
  const urls = samplerUrls(set);
  if (!urls) return null;
  return new Tone.Sampler(Object.assign({ urls, curve: 'exponential' }, env));
}
