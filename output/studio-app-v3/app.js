/* =====================================================================
   app.js — 進行管理・入力・画面（v3）
   ---------------------------------------------------------------------
   音の中身は music.js（譜面）と engine.js（音の出し方）にある。
   ここは「いつ何を鳴らすか」と「画面」だけを持つ。
   ===================================================================== */

const RETRIGGER_GUARD_MS = 500;
const MAX_PARTS_CHOICES = [3, 4, 6, 8, 10];   // 開始画面で選べる同時枚数

/* ============ 1. 状態 ============ */
const State = {
  playing: false, paused: false,
  quantize: 'bar',        // 'bar'（気持ちいい）｜'beat'（速い）
  maxParts: 6,            // 同時に鳴らせる枚数（開始画面で変えられる）
  durationSec: 180,
  elapsed: 0,
  parts: new Map(),       // id -> Part
  order: [],              // 投入順（古い順）
  lastInput: new Map(),
  pending: new Set(),
  panSeed: 0,

  hasRole(role) {
    for (const id of this.parts.keys()) if (id.endsWith('-' + role)) return true;
    return false;
  },
};

function cardOf(id) {
  const [g, r] = id.split('-');
  return (CARDS[g] && CARDS[g][r]) ? CARDS[g][r] : null;
}
function labelOf(id) {
  const [g, r] = id.split('-');
  return `${GENRES[g].label}の${ROLES[r].jp}`;
}
function barSeconds() { return (60 / Tone.Transport.bpm.value) * 4; }

/* ============ 2. 投入 ============
   ここが v3 の一番大事なところ。
   「押した→次の小節頭で入る」の あいだ に ライザーを鳴らし、
   着弾の瞬間に クラッシュ＋低音の一撃 を置き、
   そこからフィルタが開いて新しい音が姿を現す。
   この3つが揃って初めて「音を足した」ことが快感になる。            */
function insertCard(cardId) {
  if (!State.playing || State.paused) return;
  if (!cardOf(cardId)) return;

  const now = performance.now();
  if (now - (State.lastInput.get(cardId) || 0) < RETRIGGER_GUARD_MS) return;
  State.lastInput.set(cardId, now);

  if (State.parts.has(cardId)) {
    UI.reject(cardId);
    UI.toast('その音はもう鳴っています');
    return;
  }

  /* 上限を超えたら一番古い音を引っ込める */
  while (State.order.length >= State.maxParts) {
    const oldest = State.order.shift();
    const p = State.parts.get(oldest);
    if (p) { p.fadeOutAndDispose(1.3); State.parts.delete(oldest); }
    State.pending.delete(oldest);
    UI.setCell(oldest, '');
    UI.toast(`${labelOf(oldest)} が抜けました（同時${State.maxParts}枚まで）`);
  }

  const entryTicks = nextBoundaryTicks();
  const entryTime = Tone.Transport.getSecondsAtTime
    ? secondsAtTicks(entryTicks)
    : Tone.now() + 0.3;
  const nowT = Tone.now();

  /* 予感：着弾までのあいだ、ノイズが上へ昇っていく */
  playRiser(Math.max(nowT + 0.02, entryTime - Math.min(1.4, barSeconds())), entryTime);
  /* 衝撃：着弾の瞬間。枚数が増えるほど強くする（盛り上がりの演出） */
  playImpact(entryTime, 0.7 + 0.06 * State.parts.size);

  const [genreKey, roleKey] = cardId.split('-');
  /* ステレオの左右に交互に置いて広げる */
  State.panSeed = -State.panSeed || 1;
  const part = new Part(genreKey, roleKey, State.panSeed);
  part.start(entryTime, entryTicks, barSeconds());

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

function removeCard(cardId) {
  const p = State.parts.get(cardId);
  if (!p) return;
  p.fadeOutAndDispose(0.8);
  State.parts.delete(cardId);
  State.pending.delete(cardId);
  State.order = State.order.filter(x => x !== cardId);
  UI.setCell(cardId, '');
  UI.refreshNow(); UI.energy();
}

/* 次の区切り（既定は小節頭）。ライザーを鳴らす余地が無いときは1つ先へ送る */
function nextBoundaryTicks() {
  const ppq = Tone.Transport.PPQ;
  const q = State.quantize === 'beat' ? ppq : ppq * 4;
  const cur = Tone.Transport.ticks;
  let target = Math.ceil((cur + Math.max(2, ppq * 0.05)) / q) * q;
  /* 着弾まで1拍を切ると、ライザー（予感）を作る時間が無い。
     そのときは1つ先の区切りへ送る。待たせるより「溜め」がある方が気持ちいい */
  if ((target - cur) < ppq) target += q;
  return target;
}

function secondsAtTicks(ticks) {
  const ppq = Tone.Transport.PPQ;
  const beats = (ticks - Tone.Transport.ticks) / ppq;
  return Tone.now() + beats * (60 / Tone.Transport.bpm.value);
}

/* ============ 3. 開始・停止 ============ */
async function startGame(bpm) {
  await Tone.start();
  await buildAudio();
  Tone.Transport.bpm.value = bpm;
  Tone.Transport.timeSignature = 4;

  BaseBeat.start();

  Tone.Transport.scheduleRepeat((time) => {
    const { bar, step } = posAt(time);
    Tone.Draw.schedule(() => { UI.beat(Math.floor(step / 4), bar); }, time);
  }, '4n', 0);

  Tone.Transport.scheduleRepeat((time) => {
    Tone.Draw.schedule(() => {
      State.elapsed++;
      UI.time();
      if (State.durationSec > 0 && State.elapsed >= State.durationSec) endGame();
    }, time);
  }, 1, 0);

  Tone.Transport.start('+0.15');
  if (Bus.recorder) { try { Bus.recorder.start(); } catch (e) {} }
  State.playing = true;
  State.paused = false;
  UI.energy();
}

async function endGame() {
  if (!State.playing) return;
  State.playing = false;

  Bus.master.gain.cancelScheduledValues(Tone.now());
  Bus.master.gain.rampTo(0, 3.5);
  setTimeout(async () => {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    State.parts.forEach(p => p.dispose());
    State.parts.clear(); State.order = []; State.pending.clear();
    BaseBeat.stop();

    let url = null;
    if (Bus.recorder && Bus.recorder.state === 'started') {
      try { url = URL.createObjectURL(await Bus.recorder.stop()); } catch (e) { url = null; }
    }
    UI.showFinish(url);
  }, 3600);
}

/* ============ 4. 画面 ============ */
const UI = {
  cells: {},

  init() {
    const grid = document.getElementById('grid');
    grid.innerHTML = '';
    grid.appendChild(el('div', 'head-cell', ''));
    GENRE_ORDER.forEach(gk => {
      const h = el('div', 'head-cell', '');
      h.style.setProperty('--g', `var(--${gk})`);
      h.innerHTML = `<b>${GENRES[gk].label}</b><small>${GENRES[gk].desc}</small>`;
      grid.appendChild(h);
    });

    ROLE_ORDER.forEach(rk => {
      const role = ROLES[rk];
      const lab = el('div', 'role-label', '');
      lab.innerHTML = `<b>${role.label}</b><span>${role.jp}</span><small>${role.desc}</small>`;
      grid.appendChild(lab);

      GENRE_ORDER.forEach((gk, ci) => {
        const id = gk + '-' + rk;
        const card = CARDS[gk][rk];
        const c = el('div', 'cell', '');
        c.style.setProperty('--g', `var(--${gk})`);
        c.style.setProperty('--ga', `var(--${gk}-a)`);
        c.innerHTML = `<div class="key">${role.keys[ci].toUpperCase()}</div>
                       <div class="hook">${card.hook}</div>
                       <div class="src"></div>
                       <div class="bar"></div>`;
        c.addEventListener('click', () => insertCard(id));
        grid.appendChild(c);
        UI.cells[id] = c;
      });
    });
    UI.time();
  },

  markSources() {
    GENRE_ORDER.forEach(gk => ROLE_ORDER.forEach(rk => {
      const c = UI.cells[gk + '-' + rk]; if (!c) return;
      const card = CARDS[gk][rk];
      let real = 0, total = 0;
      card.layers.forEach(sp => {
        const vo = VOICES[sp.voice];
        if (vo.kind === 'synth') return;      // シンセは元々合成音なので数えない
        total++;
        if (vo.kind === 'kit') { if (kitUrls(sp.kit)) real++; }
        else if (samplerUrls(sp.voice)) real++;
      });
      const s = c.querySelector('.src');
      const names = card.layers.map(sp => VOICES[sp.voice].label).join(' ＋ ');
      s.textContent = names;
      s.className = 'src' + (total > 0 && real === total ? ' real' : '');
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
  /* 着弾の瞬間、画面全体を一度光らせる（音の衝撃に画面を合わせる） */
  punch() {
    const f = document.getElementById('flash');
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  },
  beat(i, bar) {
    document.querySelectorAll('#beats .beat').forEach((b, j) => {
      b.classList.toggle('on', j === i);
      b.classList.toggle('down', j === i && i === 0);
    });
    const ch = chordAt(bar);
    document.getElementById('chordnow').textContent = ch.name;
    document.querySelectorAll('#progdots i').forEach((d, j) => {
      d.classList.toggle('on', j === ((bar % 4) + 4) % 4);
    });
  },
  /* 何枚重なっているかを目で見せる。増えるほど盛り上がっている実感を出す */
  energy() {
    setEnergyLevel(State.parts.size);
    const n = State.parts.size;
    document.getElementById('partcount').textContent = n;
    const meter = document.getElementById('energy');
    meter.innerHTML = '';
    for (let i = 0; i < State.maxParts; i++) {
      const b = el('i', i < n ? 'on' : '', '');
      meter.appendChild(b);
    }
    document.body.classList.toggle('hot', n >= 4);
  },
  time() {
    const left = State.durationSec > 0 ? Math.max(0, State.durationSec - State.elapsed) : State.elapsed;
    const m = Math.floor(left / 60), s = left % 60;
    document.getElementById('timeleft').textContent = `${m}:${String(s).padStart(2, '0')}`;
    const pct = State.durationSec > 0 ? (State.elapsed / State.durationSec) * 100 : 0;
    document.querySelector('#progress > div').style.width = Math.min(100, pct) + '%';
  },
  refreshNow() {
    const box = document.getElementById('nowlist');
    box.innerHTML = '';
    if (State.order.length === 0) {
      box.innerHTML = '<div class="empty">まだ土台のビートだけです。キーを押して音を重ねてください。</div>';
      return;
    }
    State.order.forEach(id => {
      const [g, r] = id.split('-');
      const p = el('div', 'pill', '');
      p.style.setProperty('--g', `var(--${g})`);
      p.style.setProperty('--ga', `var(--${g}-a)`);
      p.innerHTML = `<span><em>${ROLES[r].label}</em>${GENRES[g].label}</span>`;
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
    } else {
      audio.style.display = 'none'; dl.style.display = 'none';
      document.getElementById('finishmsg').textContent =
        'おつかれさまでした。（このブラウザでは録音を保存できませんでした）';
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

/* ============ 5. キーボード入力（＝カードの代わり） ============ */
const KEYMAP = {};
ROLE_ORDER.forEach(rk => {
  ROLES[rk].keys.forEach((k, i) => { KEYMAP[k] = GENRE_ORDER[i] + '-' + rk; });
});

let uidBuf = '', uidTimer = null;   // RFIDリーダーが打ち込むUIDを拾うバッファ

document.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === 'Escape') { endGame(); return; }
  if (e.key === 'Backspace') {
    e.preventDefault();
    const last = State.order[State.order.length - 1];
    if (last) removeCard(last);
    return;
  }
  if (e.key === 'Enter') {
    if (uidBuf.length >= 6 && CARD_MAP[uidBuf]) insertCard(CARD_MAP[uidBuf]);
    uidBuf = '';
    return;
  }
  if (/^[0-9]$/.test(e.key)) {
    uidBuf += e.key;
    clearTimeout(uidTimer);
    uidTimer = setTimeout(() => { uidBuf = ''; }, 400);
  }
  const id = KEYMAP[e.key.toLowerCase()];
  if (id) { e.preventDefault(); insertCard(id); }
});

/* ============ 6. 起動時：音源の読み込み ============ */
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
    msg.innerHTML = `<b>${res.sets}種類・${res.loaded}個</b>の本格音源を読み込みました。`;
  }
}

/* ============ 7. 画面まわりの配線 ============ */
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
  document.querySelectorAll('#maxchips .chip').forEach(c => {
    c.addEventListener('click', () => {
      document.querySelectorAll('#maxchips .chip').forEach(x => x.setAttribute('aria-pressed', 'false'));
      c.setAttribute('aria-pressed', 'true');
      State.maxParts = Number(c.dataset.n);
      document.getElementById('maxshow').textContent = State.maxParts;
      UI.energy();
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

/* RFID化したときの入口 */
window.insertCard = insertCard;
