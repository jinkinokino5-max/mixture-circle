/* =====================================================================
   record.js — 自分の録音をカードにする（v11 で追加）
   ---------------------------------------------------------------------
   このアプリの20枚は「役割（キャラクター×役割）」に楽器が世界ごとに
   割り当たる、譜面ベースのカードだった。自分の録音はそれとは性質が
   違う（決まった譜面がない、生の音）ので、別の種類の札として作る。

   1. マイクで録る（小節数ぶん。バーの区切りには合わせず、押した瞬間から
      録り始める。「重ねたときに気持ちよくループするか」のほうが
      「録り始めが拍の頭かどうか」より体感に効くため、後者は割り切って
      捨てている）。
   2. 録音の長さを、いまのテンポでの小節数ぴったりに強制する
      （録音デバイスの時刻はサンプル単位で正確ではないため、ここを
      丸めないと重ねるたびに少しずつ他の音とズレていく）。
   3. 「自動ピッチ補正」がONなら、いまの世界の音階へ寄せる
      （pitchcorrect.js）。
   4. 継ぎ目にごく短いフェードをかけてループしても音が出ないようにする。
   5. UserPart（Tone.Player のループ）として、他の札と同じ
      「押す→合図→着弾→重なる」の流れに乗せる。

   録っている間、BGM（Bus.master）を少し下げる。ブラウザのエコー
   キャンセルだけでは、スピーカー再生中のBGMがマイクにかなり回り込む
   ため（実測はしていないが、鳴っている音楽的にほぼ確実に起きる）。
   下げても消せるわけではないので、README にヘッドホン推奨と明記する。 */

const REC_MAX_CARDS = 8;                 // 録れる枚数の上限（画面が埋まりすぎないように）
const REC_BAR_CHOICES = [1, 2, 4];       // 選べる長さ（小節）
const REC_DUCK_GAIN = 0.42;              // 録音中、BGMをここまで下げる

const RecState = {
  bars: 2,
  pitchCorrect: true,
  recording: false,
  seq: 0,
  panel: null,
};

/* ============ 1. UserPart：録音ループを鳴らすパート ============
   engine.js の Part とインターフェースを合わせてある
   （start / fadeOutAndDispose / gain / dispose）ので、
   app.js の insertCard / removeCard / requestWorld からは
   ふつうの札とほとんど同じ形で扱える。                              */
class UserPart {
  constructor(id, rec, panBias) {
    this.id = id;
    this.rec = rec;

    /* 帯域・定位・残響量は MELODY と CHORD の中間くらいに固定してある。
       自分の声や生音はだいたいそのあたりの帯域で気持ちよく収まる。
       v11：他の20枚は「役割の音量（ROLES.gain）＋楽器ごとの音量（specの
       gain。だいたい-3〜-18dB）」の2段で音量が決まっているのに対し、
       録音カードはそれが1段しか無かった＝録れた音量そのままで鳴っていて、
       他の札より頭ひとつ大きく聞こえていた。ここを-11dBまで下げ、
       さらに buildUserCard 側で録音そのものを音量そろえ（正規化）＋
       ここのコンプレッサーで粒をそろえて、他の楽器と釣り合わせている */
    const GAIN_DB = -11, SEND = 0.30, DELAY = 0.16, HP = 90, LP = 12500, PAN = 0.24;

    this.gain = new Tone.Gain(Tone.dbToGain(GAIN_DB)).connect(Bus.pump);
    this.nominal = Tone.dbToGain(GAIN_DB);

    this.rev = new Tone.Gain(Math.min(0.9, SEND * World.sendScale())).connect(Bus.reverb);
    this.gain.connect(this.rev);
    const dlyAmt = DELAY * World.delayScale();
    if (dlyAmt > 0.001) { this.dly = new Tone.Gain(dlyAmt).connect(Bus.delay); this.gain.connect(this.dly); }

    this.pan = new Tone.Panner(Math.max(-1, Math.min(1, PAN * panBias * World.panScale()))).connect(this.gain);
    this.lp = new Tone.Filter(LP, 'lowpass').connect(this.pan);
    this.hp = new Tone.Filter(HP, 'highpass').connect(this.lp);

    /* マイク録音は、サンプル楽器と違って音量にムラがある（声を張った瞬間だけ
       大きい、など）。軽くコンプレッサーで粒をそろえてから上のゲイン段に渡す */
    this.comp = new Tone.Compressor({ threshold: -20, ratio: 3.2, attack: 0.006, release: 0.16 }).connect(this.hp);

    this.player = new Tone.Player(rec.buffer).connect(this.comp);
    this.player.loop = true;
    this.player.loopStart = 0;
    /* 保険：万一 rec.durationSec がバッファの実測 duration をわずかに超えていても
       例外で止まらないよう、実測値でクランプする（本来は一致しているはず） */
    this.player.loopEnd = Math.min(rec.durationSec, this.player.buffer.duration);
  }

  start(entryTime) {
    this.gain.gain.setValueAtTime(0.0001, entryTime);
    this.gain.gain.linearRampToValueAtTime(this.nominal, entryTime + 0.12);
    try { this.player.start(entryTime); } catch (e) {}
  }

  fadeOutAndDispose(sec = 1.1) {
    try {
      this.gain.gain.cancelScheduledValues(Tone.now());
      this.gain.gain.rampTo(0, sec);
      this.player.stop(Tone.now() + sec);
    } catch (e) {}
    setTimeout(() => this.dispose(), sec * 1000 + 150);
  }

  dispose() {
    [this.player, this.comp, this.hp, this.lp, this.pan, this.rev, this.dly, this.gain].forEach(n => {
      try { n && n.dispose(); } catch (e) {}
    });
  }
}

/* ============ 2. 投入（app.js の insertCard から呼ばれる） ============
   中身は insertCard とほぼ同じ流れ（合図→着弾→pending→active）。
   譜面カードを作り直すたびに書き換えるのを避けるため、あえて
   ここに複製している（app.js 側は isUserCard で分岐するだけ）。      */
function insertUserCard(cardId) {
  if (State.worldBusy) { UI.toast('切り替え中です。少し待ってください'); return; }
  const rec = State.userCards.get(cardId);
  if (!rec) return;

  const now = performance.now();
  if (now - (State.lastInput.get(cardId) || 0) < RETRIGGER_GUARD_MS) return;
  State.lastInput.set(cardId, now);

  if (State.parts.has(cardId)) {
    playUncue(Tone.now() + 0.02);
    removeCard(cardId);
    UI.toast(`${rec.name} を外しました`);
    return;
  }

  while (State.order.length >= State.maxParts) {
    const oldest = State.order.shift();
    const p = State.parts.get(oldest);
    if (p) { p.fadeOutAndDispose(1.3); State.parts.delete(oldest); }
    State.pending.delete(oldest);
    UI.setCell(oldest, '');
    UI.toast(`${labelOf(oldest)} が抜けました（同時${State.maxParts}枚まで）`);
  }

  const entryTicks = nextBoundaryTicks();
  const entryTime = secondsAtTicks(entryTicks);
  const nowT = Tone.now();

  playCue(nowT + 0.02);
  playImpact(entryTime, 0.7 + 0.06 * State.parts.size);

  State.panSeed = -State.panSeed || 1;
  const part = new UserPart(cardId, rec, State.panSeed);
  part.start(entryTime);

  State.parts.set(cardId, part);
  State.order.push(cardId);
  State.pending.add(cardId);
  UI.setCell(cardId, 'pending');
  UI.refreshNow(); UI.energy();

  Tone.Transport.scheduleOnce((t) => {
    Tone.Draw.schedule(() => {
      if (!State.pending.has(cardId)) return;
      State.pending.delete(cardId);
      UI.setCell(cardId, 'active');
      UI.punch();
    }, t);
  }, entryTicks + 'i');
}

function deleteUserCard(cardId) {
  if (State.parts.has(cardId)) removeCard(cardId);
  State.userCards.delete(cardId);
  RecUI.removeTile(cardId);
}

/* ============ 3. 録音そのもの ============ */
function pickMimeType() {
  const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const t of cands) if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
  return '';
}

async function recordOnce(bars, onProgress) {
  const durationSec = bars * barSeconds();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });

  const mimeType = pickMimeType();
  const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks = [];
  mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

  const stopP = new Promise((resolve) => { mr.onstop = resolve; });

  /* 録っているあいだ、BGMを少し下げて回り込みを減らす */
  const master = Bus.master ? Bus.master.gain.value : 1;
  try { Bus.master.gain.rampTo(REC_DUCK_GAIN, 0.15); } catch (e) {}

  mr.start();
  const startedAt = performance.now();
  const timer = setInterval(() => {
    const pct = Math.min(1, (performance.now() - startedAt) / (durationSec * 1000));
    onProgress && onProgress(pct);
  }, 60);

  await new Promise((r) => setTimeout(r, durationSec * 1000));
  clearInterval(timer);
  onProgress && onProgress(1);
  mr.stop();
  stream.getTracks().forEach((t) => t.stop());
  try { Bus.master.gain.rampTo(master, 0.3); } catch (e) {}

  await stopP;
  const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
  const arrayBuf = await blob.arrayBuffer();
  const decoded = await Tone.getContext().decodeAudioData(arrayBuf);
  return { decoded, durationSec };
}

/* デコードしたバッファをモノラルにし、小節ぴったりの長さへ強制する。
   録音デバイスの開始・停止はミリ秒単位でしかそろわないので、ここで
   丸めないと、ループのたびに他の札から少しずつズレていく。          */
function conformBuffer(decoded, targetSec) {
  const sr = decoded.sampleRate;
  const targetLen = Math.round(targetSec * sr);
  const mono = new Float32Array(targetLen);
  const chs = decoded.numberOfChannels;
  const srcLen = decoded.length;
  for (let ch = 0; ch < chs; ch++) {
    const data = decoded.getChannelData(ch);
    for (let i = 0; i < targetLen; i++) {
      mono[i] += (i < srcLen ? data[i] : 0) / chs;
    }
  }
  return { mono, sampleRate: sr };
}

/* 2回 requestAnimationFrame を挟んで、直前の画面更新（「処理しています…」）を
   確実に1度描画させてから重い同期処理へ入る。ピッチ補正は自己相関の
   総当たりで、数秒の録音でも main thread を1〜2秒近く止めることがある */
function nextPaint() {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

async function buildUserCard(bars, pitchCorrect, onStatus, onProgress) {
  onStatus && onStatus('録音中…（マイクに向かって話す・歌う・鳴らす）');
  const { decoded, durationSec } = await recordOnce(bars, onProgress);
  const { mono, sampleRate } = conformBuffer(decoded, durationSec);

  let processed = mono;
  if (pitchCorrect) {
    onStatus && onStatus('補正しています…（少し止まったように見えますが正常です）');
    await nextPaint();
    const scale = currentScalePCs();
    processed = pitchCorrectBuffer(mono, sampleRate, scale, { strength: 0.85 });
  }
  normalizePeak(processed, 0.85);
  applyEdgeFades(processed, sampleRate, 12);

  const audioBuffer = Tone.getContext().rawContext.createBuffer(1, processed.length, sampleRate);
  audioBuffer.copyToChannel(processed, 0);
  const toneBuffer = new Tone.ToneAudioBuffer(audioBuffer);

  RecState.seq++;
  return {
    id: 'user-' + Date.now() + '-' + RecState.seq,
    name: '録音' + RecState.seq,
    buffer: toneBuffer,
    /* v11のバグ修正：小節数から計算した理論値（durationSec）は、秒→サンプル数に
       丸めた実際のバッファ長とごくわずかに（1サンプル未満）ずれることがある。
       Tone.Player の loopEnd はバッファの実測 duration を超えると例外を投げるので、
       カードの長さは必ずバッファの実測値を使う（理論値は録音・進捗表示にしか使わない）*/
    durationSec: audioBuffer.duration,
    wave: downsampleForWave(mono, 160),
    pitchCorrected: pitchCorrect,
  };
}

/* 録音の音量は、マイクとの距離や声の大きさでバラバラになる（サンプル楽器と
   違って収録レベルが揃っていない）。ピークを一定値に合わせておくことで、
   UserPart 側の固定ゲイン（-11dB）が他の20枚と釣り合うようにする。
   ほぼ無音（ノイズだけ拾った）ときは増幅すると耳障りなヒスになるので、
   一定以上小さい録音は正規化しない。 */
function normalizePeak(float32, target = 0.85) {
  let peak = 0;
  for (let i = 0; i < float32.length; i++) { const a = Math.abs(float32[i]); if (a > peak) peak = a; }
  if (peak < 0.02 || peak >= target) return float32;
  const g = target / peak;
  for (let i = 0; i < float32.length; i++) float32[i] *= g;
  return float32;
}

function downsampleForWave(float32, points) {
  const n = float32.length, step = Math.max(1, Math.floor(n / points));
  const out = [];
  for (let i = 0; i < n; i += step) {
    let min = 1, max = -1;
    for (let j = i; j < Math.min(n, i + step); j++) { if (float32[j] < min) min = float32[j]; if (float32[j] > max) max = float32[j]; }
    out.push([min, max]);
  }
  return out;
}

/* ============ 4. 画面 ============ */
const RecUI = {
  strip: null,
  tiles: {},

  init() {
    this.strip = document.getElementById('usercards');
    if (!this.strip) return;
    this.renderAddTile();
    document.getElementById('recbtn')?.addEventListener('click', () => this.openPanel());
    document.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.target && e.target.closest && (e.target.closest('#mixer') || e.target.closest('#recorder'))) return;
      if ((e.key === 'n' || e.key === 'N') && State.playing && !State.paused) {
        e.preventDefault();
        this.openPanel();
      }
    });
  },

  renderAddTile() {
    const t = el('div', 'user-card add', '');
    t.innerHTML = `<div class="ukey">N</div><div class="uname">＋ 録音する</div><div class="usub">自分の声・音をカードにする</div>`;
    t.addEventListener('click', () => this.openPanel());
    this.strip.appendChild(t);
    this.addTile = t;
  },

  addCardTile(rec) {
    const t = el('div', 'user-card', '');
    t.innerHTML = `
      <div class="uname">${rec.name}</div>
      <canvas class="uwave" width="140" height="28"></canvas>
      <div class="usub">${rec.pitchCorrected ? '補正あり' : '補正なし'}・${rec.durationSec.toFixed(1)}秒</div>
      <button type="button" class="udel" title="削除">×</button>
    `;
    drawWave(t.querySelector('.uwave'), rec.wave);
    t.addEventListener('click', (e) => {
      if (e.target.closest('.udel')) return;
      if (!State.playing) { UI.toast('先に「はじめる」を押してください'); return; }
      insertCard(rec.id);
    });
    t.querySelector('.udel').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteUserCard(rec.id);
    });
    this.tiles[rec.id] = t;
    this.strip.insertBefore(t, this.addTile);
  },

  removeTile(id) {
    const t = this.tiles[id]; if (!t) return;
    t.remove();
    delete this.tiles[id];
  },

  setTileState(id, cls) {
    const t = this.tiles[id]; if (!t) return;
    t.classList.remove('pending', 'active');
    if (cls) t.classList.add(cls);
  },

  /* ---- 録音パネル ---- */
  openPanel() {
    if (!State.playing || State.paused) { UI.toast('先に「はじめる」を押してください'); return; }
    if (State.userCards.size >= REC_MAX_CARDS) {
      UI.toast(`自分のカードは${REC_MAX_CARDS}枚までです。いらないものを削除してください`);
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      UI.toast('このブラウザ・この開き方ではマイクを使えません（はじめる.bat から開いてください）');
      return;
    }
    this.buildPanel();
    RecState.panel.classList.add('show');
  },

  closePanel() {
    if (RecState.panel) RecState.panel.classList.remove('show');
  },

  buildPanel() {
    let r = document.getElementById('recorder');
    r.innerHTML = `
      <div class="rec-box">
        <button type="button" class="rec-close">×</button>
        <h2>自分のカードを録音する</h2>
        <p class="rec-help">マイクに向かって歌う・声を出す・手拍子など、好きな音を録ってカードにします。
        でき上がったカードは、他の札と同じように出し入れできます。<br>
        <b>ヘッドホンをつけていると、BGMの回り込みが減ってきれいに録れます。</b></p>

        <div class="rec-row">
          <span>長さ</span>
          <div class="rec-chips" id="rec-bars"></div>
        </div>
        <div class="rec-row">
          <label><input type="checkbox" id="rec-pitch" checked> 自動ピッチ補正（いまの世界の音階に寄せる）</label>
        </div>

        <button type="button" class="primary rec-go" id="rec-go">録音する</button>
        <div class="rec-status" id="rec-status"></div>
        <div class="rec-bar"><div id="rec-bar-fill"></div></div>

        <div class="rec-preview" id="rec-preview" hidden>
          <canvas class="uwave big" id="rec-wave" width="360" height="60"></canvas>
          <div class="rec-preview-actions">
            <button type="button" id="rec-play">試聴</button>
            <button type="button" id="rec-retry">録り直す</button>
            <button type="button" class="primary" id="rec-add">このカードを追加する</button>
          </div>
        </div>
      </div>
    `;
    RecState.panel = r;
    r.querySelector('.rec-close').addEventListener('click', () => this.closePanel());
    r.addEventListener('click', (e) => { if (e.target === r) this.closePanel(); });

    const chips = r.querySelector('#rec-bars');
    REC_BAR_CHOICES.forEach((n) => {
      const c = el('button', 'chip' + (n === RecState.bars ? ' on' : ''), n + '小節');
      c.type = 'button';
      c.addEventListener('click', () => {
        RecState.bars = n;
        chips.querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
        c.classList.add('on');
      });
      chips.appendChild(c);
    });

    r.querySelector('#rec-pitch').addEventListener('change', (e) => { RecState.pitchCorrect = e.target.checked; });

    let pendingRec = null;
    const goBtn = r.querySelector('#rec-go');
    const status = r.querySelector('#rec-status');
    const fill = r.querySelector('#rec-bar-fill');
    const preview = r.querySelector('#rec-preview');

    goBtn.addEventListener('click', async () => {
      if (RecState.recording) return;
      RecState.recording = true;
      goBtn.disabled = true;
      preview.hidden = true;
      fill.style.width = '0%';
      try {
        pendingRec = await buildUserCard(
          RecState.bars, RecState.pitchCorrect,
          (msg) => { status.textContent = msg; },
          (pct) => { fill.style.width = (pct * 100) + '%'; }
        );
        status.textContent = 'できました。試聴してから追加してください';
        fill.style.width = '100%';
        preview.hidden = false;
        drawWave(r.querySelector('#rec-wave'), pendingRec.wave);
      } catch (e) {
        status.textContent = 'マイクを使えませんでした（' + (e && e.message ? e.message : e) + '）';
      } finally {
        RecState.recording = false;
        goBtn.disabled = false;
      }
    });

    r.querySelector('#rec-play').addEventListener('click', () => {
      if (!pendingRec) return;
      const p = new Tone.Player(pendingRec.buffer).toDestination();
      p.start();
      setTimeout(() => { try { p.dispose(); } catch (e) {} }, pendingRec.durationSec * 1000 + 200);
    });
    r.querySelector('#rec-retry').addEventListener('click', () => { pendingRec = null; preview.hidden = true; status.textContent = ''; });
    r.querySelector('#rec-add').addEventListener('click', () => {
      if (!pendingRec) return;
      State.userCards.set(pendingRec.id, pendingRec);
      this.addCardTile(pendingRec);
      UI.toast(`${pendingRec.name} をカードにしました`);
      this.closePanel();
    });
  },
};

function drawWave(canvas, wave) {
  if (!canvas || !wave || !wave.length) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height, mid = h / 2;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--usr-a') || '#9ad0ff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  wave.forEach((pair, i) => {
    const x = (i / wave.length) * w;
    ctx.moveTo(x, mid + pair[0] * mid);
    ctx.lineTo(x, mid + pair[1] * mid);
  });
  ctx.stroke();
}

document.addEventListener('DOMContentLoaded', () => RecUI.init());
