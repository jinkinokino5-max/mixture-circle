/* =====================================================================
   app.js — 進行管理・入力・画面（v9）
   ---------------------------------------------------------------------
   音の中身は music.js（譜面）と engine.js（音の出し方）にある。
   ここは「いつ何を鳴らすか」と「画面」だけを持つ。
   ===================================================================== */

/* 同じ札の連続入力を無視する時間。
   カードリーダーは、札をかざしたままにすると同じUIDを繰り返し送ってくる。
   「もう一度タッチで外す」を入れたので、ここが短いと
   入る→外れる→入る…とばたついてしまう。手で置き直すには十分で、
   かつ待たされたと感じない長さとして 900ms にした。                */
const RETRIGGER_GUARD_MS = 900;
/* 開始画面で選べる同時枚数。0 は「無制限」。
   無制限でも重ねる札は20枚しかないので、実際の上限は20枚になる */
const MAX_PARTS_CHOICES = [3, 4, 6, 8, 10, 0];
const ALL_CARDS = 20;                          // 重ねる札の総数（無制限のときの表示に使う）

/* ============ 1. 状態 ============ */
const State = {
  playing: false, paused: false,
  quantize: 'bar',        // 'bar'（気持ちいい）｜'beat'（速い）
  maxParts: 6,            // 同時に鳴らせる枚数（Infinity＝無制限）
  durationSec: 180,
  baseBpm: 104,           // 開始画面で選んだテンポ（＝標準の世界のテンポ）
  styleBusy: false,       // スタイルカードの切り替え待ちのあいだ true
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

/* 'style-beatles' のような札か（プレフィックスは実物のカードと揃えて style- のまま） */
function isStyleCard(id) { return id.startsWith('style-') && WORLD_ORDER.includes(id.slice(6)); }

function cardOf(id) {
  const [c, r] = id.split('-');
  return (PHRASES[c] && PHRASES[c][r]) ? PHRASES[c][r] : null;
}
function labelOf(id) {
  if (isStyleCard(id)) return WORLDS[id.slice(6)].label;
  const [c, r] = id.split('-');
  return `${CHARACTERS[c].label}の${ROLES[r].jp}`;
}
function barSeconds() { return (60 / Tone.Transport.bpm.value) * 4; }

/* ============ 2. 投入 ============
   ここが v3 の一番大事なところ。
   押した瞬間に 短い合図音 を鳴らして受け付けたことを伝え、
   着弾の瞬間に クラッシュ＋低音の一撃 を置き、
   そこからフィルタが開いて新しい音が姿を現す。
   この3つが揃って初めて「音を足した」ことが快感になる。            */
function insertCard(cardId) {
  if (!State.playing || State.paused) return;
  if (isStyleCard(cardId)) { requestWorld(cardId.slice(6)); return; }
  if (!cardOf(cardId)) return;
  /* 世界の切り替え中（合図から着地までの約1小節）は投入を受けない。
     テンポが変わる瞬間をまたいで予約すると、鳴り始めの位置がずれるため */
  if (State.worldBusy) { UI.reject(cardId); UI.toast('切り替え中です。少し待ってください'); return; }

  const now = performance.now();
  if (now - (State.lastInput.get(cardId) || 0) < RETRIGGER_GUARD_MS) return;
  State.lastInput.set(cardId, now);

  /* もう一度タッチ（同じキー）で、その音を外す。
     カードを2枚用意しなくても足し引きができるようにするための動作。
     鳴り始める前（着弾待ち）の札も、ここで取り消せる */
  if (State.parts.has(cardId)) {
    playUncue(Tone.now() + 0.02);
    removeCard(cardId);
    UI.toast(`${labelOf(cardId)} を外しました`);
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

  /* 合図：押した「その場で」短い音を鳴らし、受け付けたことを伝える */
  playCue(nowT + 0.02);
  /* 衝撃：着弾の瞬間。枚数が増えるほど強くする（盛り上がりの演出） */
  playImpact(entryTime, 0.7 + 0.06 * State.parts.size);

  const [charKey, roleKey] = cardId.split('-');
  /* ステレオの左右に交互に置いて広げる */
  State.panSeed = -State.panSeed || 1;
  const part = new Part(charKey, roleKey, State.panSeed);
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

/* 次の区切り（既定は小節頭） */
function nextBoundaryTicks() {
  const ppq = Tone.Transport.PPQ;
  const q = State.quantize === 'beat' ? ppq : ppq * 4;
  const cur = Tone.Transport.ticks;
  let target = Math.ceil((cur + Math.max(2, ppq * 0.05)) / q) * q;
  /* 直前すぎると予約が間に合わないので、半拍を切っていたら1つ先へ送る。
     以前はライザーを鳴らす時間を作るために1拍ぶん見ていたが、
     合図が短い音になったので待ち時間を詰めた */
  if ((target - cur) < ppq * 0.5) target += q;
  return target;
}

/* スタイル切り替え用の区切り。1拍前に「仕込み」をするので、
   いまから 1.5拍 以上先の小節頭を選ぶ（近すぎると仕込みが間に合わない） */
function worldBoundaryTicks() {
  const ppq = Tone.Transport.PPQ, q = ppq * 4;
  const cur = Tone.Transport.ticks;
  let target = Math.ceil((cur + 2) / q) * q;
  while (target - cur < ppq * 1.5) target += q;
  return target;
}

/* ============ 2-b. スタイルカード：世界をまるごと塗り替える ============
   譜面は1つも書き換えない。変わるのは
     コード進行（調ごと）／テンポ／跳ね／楽器／ドラムキット／和音の積み方／
     残響とディレイと左右の広がり／メロディのハモリ
   いま鳴っているカードは、次の小節頭で「同じ役割のまま別の楽器」に化ける。

   同じスタイルカードをもう一度出すと標準の世界に戻る（4枚で5つの世界）。 */
function requestWorld(styleKey) {
  if (!WORLDS[styleKey]) return;
  if (State.worldBusy) { UI.toast('切り替え中です'); return; }

  const target = (World.key === styleKey) ? null : styleKey;   // 同じ札＝解除
  const entryTicks = worldBoundaryTicks();
  const ppq = Tone.Transport.PPQ;

  State.worldBusy = true;
  UI.worldArm(styleKey);
  playCue(Tone.now() + 0.02);          // 受け付けた合図（1枚出したときと同じ音）

  /* 1拍前に仕込む。この時点の tPrep は正確な音の時刻なので、
     境目の時刻は「tPrep ＋ 1拍」で確定できる（テンポはまだ変わっていない） */
  Tone.Transport.scheduleOnce((tPrep) => {
    const oldBpm = Tone.Transport.bpm.value;
    const tEdge = tPrep + 60 / oldBpm;
    const def = target ? WORLDS[target] : null;
    const newBpm = def ? def.bpm : State.baseBpm;

    /* 世界の定数を差し替える。ここから作る Part は新しい世界の住人になる */
    World.set(target);
    applyWorldTone(0.5);
    BaseBeat.restyle();

    /* いま鳴っているカードを、同じIDのまま作り直す（＝楽器が化ける） */
    const rebuilt = [];
    State.order.forEach(id => {
      if (!cardOf(id)) return;
      const [ck, rk] = id.split('-');
      State.panSeed = -State.panSeed || 1;
      try { rebuilt.push([id, new Part(ck, rk, State.panSeed)]); } catch (e) { /* 1枚落ちても続ける */ }
    });

    /* 古い音は境目に向かって消す */
    const old = [];
    State.parts.forEach(p => {
      old.push(p);
      try {
        p.gain.gain.cancelScheduledValues(tPrep);
        p.gain.gain.setValueAtTime(p.gain.gain.value, tPrep);
        p.gain.gain.linearRampToValueAtTime(0.0001, tEdge);
      } catch (e) {}
    });

    /* 転換の音（ふくらんで、境目で切れて、一撃） */
    playTurn(tEdge, 60 / oldBpm);

    /* テンポと跳ねは境目ちょうどで切り替える。
       bpm は「その時刻に切り替える」形で予約する（値を直接代入すると
       すでに予約済みの音の位置がずれて、鳴らないカードが出る） */
    try { Tone.Transport.bpm.setValueAtTime(newBpm, tEdge); } catch (e) { Tone.Transport.bpm.value = newBpm; }
    Tone.Transport.swing = def ? (def.swing || 0) : 0;
    Tone.Transport.swingSubdivision = def ? (def.swingSub || '8n') : '8n';

    /* 新しい世界の音を、境目ちょうどから鳴らし始める */
    const barSec = (60 / newBpm) * 4;
    State.parts.clear();
    rebuilt.forEach(([id, p]) => {
      try { p.start(tEdge, entryTicks, barSec, true); State.parts.set(id, p); } catch (e) {}
    });
    setTimeout(() => old.forEach(p => { try { p.dispose(); } catch (e) {} }), 900);

    Tone.Draw.schedule(() => {
      State.worldBusy = false;
      UI.worldApplied();
      UI.punch();
      UI.energy();
      document.getElementById('bpmshow').textContent = Math.round(newBpm);
      UI.toast(target ? `${WORLDS[target].label} の世界になりました` : '標準の世界に戻りました');
    }, tEdge);
  }, (entryTicks - ppq) + 'i');
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
  State.baseBpm = bpm;
  World.set(null);                 // いつも「標準の世界」から始まる
  applyWorldTone(0.01);
  Tone.Transport.bpm.value = bpm;
  Tone.Transport.swing = 0;
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
    CHAR_ORDER.forEach(ck => {
      const h = el('div', 'head-cell', '');
      h.style.setProperty('--g', `var(--ch-${ck})`);
      h.innerHTML = `<b>${CHARACTERS[ck].label}</b><em>${CHARACTERS[ck].sub}</em>`
                  + `<small>${CHARACTERS[ck].desc}</small>`;
      grid.appendChild(h);
    });

    ROLE_ORDER.forEach(rk => {
      const role = ROLES[rk];
      const lab = el('div', 'role-label', '');
      lab.innerHTML = `<b>${role.label}</b><span>${role.jp}</span><small>${role.desc}</small>`;
      grid.appendChild(lab);

      CHAR_ORDER.forEach((ck, ci) => {
        const id = ck + '-' + rk;
        const c = el('div', 'cell', '');
        c.style.setProperty('--g', `var(--ch-${ck})`);
        c.style.setProperty('--ga', `var(--ch-${ck}-a)`);
        /* 表示するのは“はたらき”。楽器名は下の .src に世界ごとに出る */
        c.innerHTML = `<div class="key">${role.keys[ci].toUpperCase()}</div>
                       <div class="hook">${HOOKS[ck][rk]}</div>
                       <div class="src"></div>
                       <div class="bar"></div>`;
        c.addEventListener('click', () => insertCard(id));
        grid.appendChild(c);
        UI.cells[id] = c;
      });
    });

    /* スタイルカード4枚。20枚とは形も色も変えて「別種の札」だと分かるようにする */
    const strip = document.getElementById('styles');
    strip.innerHTML = '';
    WORLD_ORDER.forEach(sk => {
      const s = WORLDS[sk];
      const c = el('div', 'style-card', '');
      c.style.setProperty('--g', `var(--st-${sk})`);
      c.style.setProperty('--ga', `var(--st-${sk}-a)`);
      c.innerHTML = `<div class="skey">${s.key}</div>
                     <div class="sname">${s.label}</div>
                     <div class="ssub">${s.sub}</div>
                     <div class="sdesc">${s.desc}</div>
                     <div class="sdetail">${s.detail}</div>`;
      c.addEventListener('click', () => insertCard('style-' + sk));
      strip.appendChild(c);
      UI.worldCells[sk] = c;
    });
    UI.worldApplied();
    UI.time();
  },

  worldCells: {},

  /* 受け付けた直後（着地するまで）光らせる */
  worldArm(sk) {
    Object.values(UI.worldCells).forEach(c => c.classList.remove('arming'));
    const c = UI.worldCells[sk]; if (c) c.classList.add('arming');
  },
  /* 着地後：いまの世界を示す */
  worldApplied() {
    WORLD_ORDER.forEach(sk => {
      const c = UI.worldCells[sk]; if (!c) return;
      c.classList.remove('arming');
      c.classList.toggle('on', World.key === sk);
    });
    const now = document.getElementById('worldnow');
    if (now) {
      now.textContent = World.label();
      now.className = World.key ? 'world on' : 'world';
    }
    document.body.classList.toggle('styled', !!World.key);
    UI.markSources();          // 各マスの楽器名を、いまの世界のものに書き換える
  },

  markSources() {
    CHAR_ORDER.forEach(ck => ROLE_ORDER.forEach(rk => {
      const c = UI.cells[ck + '-' + rk]; if (!c) return;
      let real = 0, total = 0;
      /* いまの世界の編成表に書かれている楽器を表示する。
         世界が変われば表示も変わる＝「同じ札が別の楽器になった」証拠 */
      const specs = World.layersFor(ck, rk);
      const voices = specs.map(sp => sp.voice).filter(v => v && VOICES[v]);
      specs.forEach(sp => {
        const vo = VOICES[sp.voice];
        if (!vo || vo.kind === 'synth') return;   // シンセは元々合成音なので数えない
        total++;
        if (vo.kind === 'kit') { if (kitUrls(sp.kit)) real++; }
        else if (samplerUrls(sp.voice)) real++;
      });
      const s = c.querySelector('.src');
      const names = voices.map(v => VOICES[v].label).join(' ＋ ');
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
    /* 無制限のときは Infinity で回せないので、重ねる札の総数（20）を枠にする */
    const slots = Number.isFinite(State.maxParts) ? State.maxParts : ALL_CARDS;
    meter.classList.toggle('many', slots > 12);
    for (let i = 0; i < slots; i++) {
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
      const [c, r] = id.split('-');
      const p = el('div', 'pill', '');
      p.style.setProperty('--g', `var(--ch-${c})`);
      p.style.setProperty('--ga', `var(--ch-${c}-a)`);
      p.innerHTML = `<span><em>${ROLES[r].label}</em>${CHARACTERS[c].label}</span>`;
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
  ROLES[rk].keys.forEach((k, i) => { KEYMAP[k] = CHAR_ORDER[i] + '-' + rk; });
});
/* スタイルカード4枚は数字の 6 7 8 9（メロディの 1〜5 の右どなり） */
WORLD_ORDER.forEach(sk => { KEYMAP[WORLDS[sk].key] = 'style-' + sk; });

let uidBuf = '', uidTimer = null;   // RFIDリーダーが打ち込むUIDを拾うバッファ
let pendingDigit = null;            // 数字キー(1-8)はMELODYの操作キーと兼用のタイマーID
const DIGIT_HOLD_MS = 45;           // 人の手より速い連続入力＝リーダーとみなす猶予（体感できない速さ）

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
    if (pendingDigit) { clearTimeout(pendingDigit); pendingDigit = null; }
    if (uidBuf.length >= 6 && CARD_MAP[uidBuf]) insertCard(CARD_MAP[uidBuf]);
    uidBuf = '';
    return;
  }
  if (/^[0-9]$/.test(e.key)) {
    uidBuf += e.key;
    clearTimeout(uidTimer);
    uidTimer = setTimeout(() => { uidBuf = ''; }, 400);

    /* 数字キーはMELODYの操作キーと同じ。リーダーがUIDを連打してくるのか
       1回だけの手押しなのかは次の入力（or Enter）が来るまで分からないので、
       ごく短く待ってから確定する。リーダーの入力なら次の文字が45ms以内に
       来て打ち消され、Enterでカード投入に切り替わる。手押しなら45ms後に
       ふつうに鳴る（体感できない遅さ）。 */
    if (pendingDigit) clearTimeout(pendingDigit);
    const digitId = KEYMAP[e.key.toLowerCase()];
    if (digitId) {
      e.preventDefault();
      pendingDigit = setTimeout(() => { pendingDigit = null; insertCard(digitId); }, DIGIT_HOLD_MS);
    }
    return;
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
  } else if (res.failed > 0) {
    /* 何個か取りこぼした＝サーバーが同時接続をさばけていない可能性が高い。
       そのままでも遊べる（足りない楽器だけ合成音になる）が、黙って劣化させない */
    msg.innerHTML = `<b>${res.sets}種類・${res.loaded}個</b>の本格音源を読み込みました。<br>`
      + `<b>${res.failed}個</b>は読み込めませんでした（その楽器は合成音になります）。<br>`
      + 'サーバーの調子かもしれません。気になるときは一度ブラウザを再読み込みしてください。';
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
      const v = Number(c.dataset.n);
      State.maxParts = (v === 0) ? Infinity : v;      // 0 ＝ 無制限
      document.getElementById('maxshow').textContent = (v === 0) ? '∞' : v;
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
