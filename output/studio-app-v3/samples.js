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
  if (total === 0) return { total: 0, loaded: 0, sets: 0 };

  await Promise.all(jobs.map(async ([dir, name]) => {
    try {
      const buf = await Tone.ToneAudioBuffer.fromUrl(`${SAMPLE_ROOT}${dir}/${name}.mp3`);
      BUFFERS.set(dir + '/' + name, buf);
    } catch (e) {
      /* 1つ落ちても止めない。足りない楽器は合成音になるだけ */
    }
    onProgress(++done, total);
  }));

  return { total, loaded: BUFFERS.size, sets: Object.keys(m.pitched || {}).length };
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
