/* =====================================================================
   app.js — 進行管理・入力・画面（v10）
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
   無制限でも重ねる札は20枚＋その世界のメロディ拡張ぶんしかないので、
   実際の上限はallCardIds().length（世界により20〜25）になる */
const MAX_PARTS_CHOICES = [3, 4, 6, 8, 10, 0];

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

/* かくはん（handleStoneIncreaseの15%抽選）で「次の世界」の候補にする世界の集合。
   既定は全世界＝これまでの挙動のまま。STYLEカードの各札に付いた抽選対象トグルで
   演奏中でもその場でON/OFFできる（本人指示：2026-09-04）。 */
const ActiveWorlds = new Set(WORLD_ORDER);
function toggleActiveWorld(sk) {
  if (ActiveWorlds.has(sk)) {
    if (ActiveWorlds.size <= 1) { UI.toast('最後の1つは外せません'); return; }
    ActiveWorlds.delete(sk);
  } else {
    ActiveWorlds.add(sk);
  }
  UI.worldApplied();
}

function cardOf(id) {
  const [c, r] = id.split('-');
  /* v31：メロディ拡張（ext1〜5）は世界によって有る/無いが変わる。
     いまの世界に無ければnull＝「この札はまだ出せない」 */
  if (EXT_SLOTS.includes(c)) return World.extDef(c);
  return (PHRASES[c] && PHRASES[c][r]) ? PHRASES[c][r] : null;
}
function labelOf(id) {
  if (isStyleCard(id)) return WORLDS[id.slice(6)].label;
  const [c, r] = id.split('-');
  if (EXT_SLOTS.includes(c)) {
    const ext = World.extDef(c);
    return ext ? ext.label : 'メロディ拡張';
  }
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

   同じスタイルカードをもう一度出すと標準の世界に戻る（13の世界）。 */
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

    /* いま鳴っているカードを、同じIDのまま作り直す（＝楽器が化ける）。
       v31：メロディ拡張（ext1〜5）は世界によって存在しない札があるため、
       新しい世界に無ければここで静かに脱落させる（State.orderからも
       外し、マスの見た目も戻す——旧世界にしか無い札が「鳴っていない
       のに鳴っている扱い」のまま残らないようにする） */
    const rebuilt = [];
    const dropped = [];
    State.order.forEach(id => {
      if (!cardOf(id)) { dropped.push(id); return; }
      const [ck, rk] = id.split('-');
      State.panSeed = -State.panSeed || 1;
      try { rebuilt.push([id, new Part(ck, rk, State.panSeed)]); } catch (e) { /* 1枚落ちても続ける */ }
    });
    if (dropped.length) {
      State.order = State.order.filter(id => !dropped.includes(id));
      dropped.forEach(id => { State.pending.delete(id); UI.setCell(id, ''); });
    }

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

    const settle = () => {
      State.worldBusy = false;
      UI.worldApplied();
      UI.energy();
      document.getElementById('bpmshow').textContent = Math.round(newBpm);
    };

    Tone.Draw.schedule(() => {
      settle();
      UI.punch();
      UI.toast(target ? `${WORLDS[target].label} の世界になりました` : '標準の世界に戻りました');
    }, tEdge);

    /* 保険（v10）。上の Tone.Draw は画面の描画に合わせて呼ばれるので、
       ブラウザのタブが裏に回っていると **一度も呼ばれない**。
       すると worldBusy が立ったままになり、表に戻しても札を1枚も
       受け付けなくなる（実機で確認した。v9 にも同じ穴があった）。
       実時間のタイマーでも同じ後始末をして、必ず解除されるようにする */
    setTimeout(() => { if (State.worldBusy) settle(); },
               Math.max(0, (tEdge - Tone.now()) * 1000) + 500);
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

    UI.showFinish();
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

    /* v31（作り直し）：メロディ拡張5枠（ext1〜5）。共通の性格・ムードは
       決めない設計にしたため、見出しは位置番号だけの中立表示にし、
       曲名・説明・楽器は世界ごとに`UI.refreshExt()`で書き換える
       （世界を切り替えるたびに呼ぶ）。まだ作曲されていない世界では
       「（この世界にはまだありません）」を出し、クリックしても
       何も起きない（cardOf側でも同じ判定をしている）。 */
    const gridExt = document.getElementById('gridExt');
    if (gridExt) {
      gridExt.innerHTML = '';
      gridExt.appendChild(el('div', 'head-cell', ''));
      EXT_SLOTS.forEach((ck, i) => {
        const h = el('div', 'head-cell', '');
        h.style.setProperty('--g', `var(--ch-${ck})`);
        h.innerHTML = `<b>拡張${i + 1}</b><em>EXT</em>`;
        gridExt.appendChild(h);
      });
      const lab = el('div', 'role-label', '');
      lab.innerHTML = `<b>${ROLES.melody.label}</b><span>${ROLES.melody.jp}</span><small>世界固有の拡張5枚</small>`;
      gridExt.appendChild(lab);
      EXT_SLOTS.forEach(ck => {
        const id = ck + '-melody';
        const c = el('div', 'cell', '');
        c.style.setProperty('--g', `var(--ch-${ck})`);
        c.style.setProperty('--ga', `var(--ch-${ck}-a)`);
        c.innerHTML = `<div class="key">·</div>
                       <div class="hook"></div>
                       <div class="src"></div>
                       <div class="bar"></div>`;
        c.addEventListener('click', () => insertCard(id));
        gridExt.appendChild(c);
        UI.cells[id] = c;
      });
      UI.refreshExt();
    }

    /* スタイルカード7枚。20枚とは形も色も変えて「別種の札」だと分かるようにする。
       v10：キーは大文字で出し、下に「ノリ（体の動きやすさ）」を3つの点で出す */
    const strip = document.getElementById('styles');
    strip.innerHTML = '';
    WORLD_ORDER.forEach(sk => {
      const s = WORLDS[sk];
      const c = el('div', 'style-card', '');
      c.style.setProperty('--g', `var(--st-${sk})`);
      c.style.setProperty('--ga', `var(--st-${sk}-a)`);
      const mv = Math.max(1, Math.min(3, s.move || 2));
      const dots = [1, 2, 3].map(i => `<i class="${i <= mv ? 'on' : ''}"></i>`).join('');
      c.innerHTML = `<div class="skey">${s.key ? String(s.key).toUpperCase() : '·'}</div>
                     <div class="spick" title="かくはんで抽選される世界に含める">抽選</div>
                     <div class="sname">${s.label}</div>
                     <div class="ssub">${s.sub}</div>
                     <div class="sdesc">${s.desc}</div>
                     <div class="sdetail">${s.detail}</div>
                     <div class="smove"><b>ノリ</b>${dots}</div>`;
      c.addEventListener('click', () => insertCard('style-' + sk));
      c.querySelector('.spick').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleActiveWorld(sk);
      });
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
      c.classList.toggle('out-of-pool', !ActiveWorlds.has(sk));
      const pick = c.querySelector('.spick');
      if (pick) pick.classList.toggle('picked', ActiveWorlds.has(sk));
    });
    const now = document.getElementById('worldnow');
    if (now) {
      now.textContent = World.label();
      now.className = World.key ? 'world on' : 'world';
    }
    document.body.classList.toggle('styled', !!World.key);
    UI.markSources();          // 各マスの楽器名を、いまの世界のものに書き換える
    UI.refreshExt();           // v31：メロディ拡張5枚の曲名・楽器も世界ごとに書き換える
    /* ミキサーを開いたまま世界を変えることがある。
       調整の対象（世界）と楽器名が変わるので、開いていれば描き直す */
    if (typeof Mixer !== 'undefined' && Mixer.open) Mixer.refresh();
  },

  markSources() {
    const paint = (ck, rk) => {
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
    };
    CHAR_ORDER.forEach(ck => ROLE_ORDER.forEach(rk => paint(ck, rk)));
  },

  /* v31（作り直し）：メロディ拡張5枚（ext1〜5）は世界ごとに曲名・説明・
     楽器がまるごと違う（＝共通の性格を持たない）ため、markSourcesとは
     別に専用の更新関数を用意した。いまの世界に無い枠は「まだ無い」と
     はっきり出し、押しても何も起きないようにする（cardOf側でも同じ
     判定をしている） */
  refreshExt() {
    EXT_SLOTS.forEach(ck => {
      const c = UI.cells[ck + '-melody']; if (!c) return;
      const ext = World.extDef(ck);
      const hook = c.querySelector('.hook');
      const src = c.querySelector('.src');
      if (!ext) {
        c.classList.add('unavailable');
        hook.textContent = '（この世界にはまだありません）';
        src.textContent = '';
        src.className = 'src';
        return;
      }
      c.classList.remove('unavailable');
      hook.textContent = `${ext.label}｜${ext.desc}`;
      let real = 0, total = 0;
      const voices = ext.voices.map(sp => sp.voice).filter(v => v && VOICES[v]);
      ext.voices.forEach(sp => {
        const vo = VOICES[sp.voice];
        if (!vo || vo.kind === 'synth') return;
        total++;
        if (vo.kind === 'kit') { if (kitUrls(sp.kit)) real++; }
        else if (samplerUrls(sp.voice)) real++;
      });
      src.textContent = voices.map(v => VOICES[v].label).join(' ＋ ');
      src.className = 'src' + (total > 0 && real === total ? ' real' : '');
    });
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
    /* 無制限のときは Infinity で回せないので、いま実際に鳴らせる札の総数を枠にする。
       v31：メロディ拡張ぶんは世界によって数が変わるためallCardIds()で都度数える */
    const slots = Number.isFinite(State.maxParts) ? State.maxParts : allCardIds().length;
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
    /* 札の出入りはミキサーの行の見た目（鳴っている／いない）にも出す */
    if (typeof Mixer !== 'undefined' && Mixer.open) setTimeout(() => Mixer.refresh(), 0);
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
      p.innerHTML = EXT_SLOTS.includes(c)
        ? `<span><em>MELODY</em>${labelOf(id)}</span>`
        : `<span><em>${ROLES[r].label}</em>${CHARACTERS[c].label}</span>`;
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
  showFinish() {
    document.getElementById('finish').classList.add('show');
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
/* スタイルカードのキーは世界ごとに music.js が持っている。
   6 7 8 9 0（メロディの 1〜5 の右どなり）と、v10 で足した3枚ぶんの Y U。
   Y U は数字が足りなくなったための追加で、演奏キー（qwert / asdfg / zxcvb）
   とはぶつからない位置を選んである。
   stone-app-v10：26文字の英字＋10 6789 0 を演奏キー・ミキサーキーで
   使い切ったため、世界は15枚でキーボードの1文字キーが尽きた。
   以降に増える世界は `key` を持たなくてよい（undefined）。
   キーボードはあくまで「石の代わりに試す」ための開発・検証用の入口
   （README 3章参照）で、本番の入口は石の重さなので、キー無しの世界も
   マウスクリック・石の重さ操作では今までどおり完全に使える。 */
WORLD_ORDER.forEach(sk => {
  const k = WORLDS[sk].key;
  if (k) KEYMAP[k] = 'style-' + sk;
});

/* ---------------------------------------------------------------------
   カードリーダーからの入力
   ---------------------------------------------------------------------
   リーダーはキーボードとして振る舞い、UIDを1文字ずつ高速に打ち込んで
   最後に Enter を送る。UIDは**16進数なので a〜f の英字を含む**
   （例：010095e40c5553）。

   ここが以前壊れていた：数字だけを UID として拾っていたため、
     ・UIDから英字が抜け落ちて CARD_MAP に一致しない
     ・しかも a b c d e f はすべて演奏キーなので、UIDを読むたびに
       関係のない札が次々と鳴ってしまう
   という二重の事故になっていた。

   直し方：**英数字はすべて同じ道を通す。**
   1文字来たら
     ・UIDバッファに足す（400ms 何も来なければ捨てる）
     ・その文字が演奏キーなら、すぐには鳴らさずに 45ms だけ待つ
   リーダーの入力なら次の文字か Enter が 45ms 以内に来て打ち消される。
   手押しなら 45ms 後にふつうに鳴る（人には分からない遅さ）。       */
let uidBuf = '', uidTimer = null;
let pendingKey = null;              // 手押しかリーダーかを見分けるための保留
const KEY_HOLD_MS = 45;             // 人の手より速い連続入力＝リーダーとみなす猶予
const UID_RESET_MS = 400;           // これだけ間があいたらUIDの途中でも捨てる

/* UIDの大文字小文字の違いで読めなくならないように、小文字で引けるようにしておく */
const CARD_MAP_LC = {};
Object.keys(CARD_MAP || {}).forEach(k => { CARD_MAP_LC[k.toLowerCase()] = CARD_MAP[k]; });

function cancelPendingKey() {
  if (pendingKey) { clearTimeout(pendingKey); pendingKey = null; }
}

document.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  /* ミキサー画面の中で操作しているときは、演奏キーとして横取りしない
     （スライダーを触りながら数字を打っても札が飛び出さないように） */
  if (e.target && e.target.closest && e.target.closest('#mixer')) {
    if (e.key === 'Escape') { e.preventDefault(); Mixer.hide(); }
    return;
  }
  if (e.key === 'Escape') { endGame(); return; }
  /* M：ミキサー（札ごとの音量）の開閉。
     m はカードUIDの16進（0-9 a-f）にも演奏キーにも入っていないので安全 */
  if (e.key === 'm' || e.key === 'M') { e.preventDefault(); Mixer.toggle(); return; }
  if (e.key === 'Backspace') {
    e.preventDefault();
    const last = State.order[State.order.length - 1];
    if (last) removeCard(last);
    return;
  }
  if (e.key === 'Enter') {
    /* リーダーが打ち終えた合図。最後の1文字が演奏キーでも鳴らさない */
    cancelPendingKey();
    clearTimeout(uidTimer);
    const uid = uidBuf;
    uidBuf = '';
    if (uid.length < 6) return;
    const id = CARD_MAP_LC[uid.toLowerCase()];
    if (id) insertCard(id);
    else UI.toast(`未登録のカードです（UID: ${uid}）`);
    return;
  }
  if (/^[0-9a-zA-Z]$/.test(e.key)) {
    uidBuf += e.key;
    clearTimeout(uidTimer);
    uidTimer = setTimeout(() => { uidBuf = ''; }, UID_RESET_MS);

    cancelPendingKey();
    const id = KEYMAP[e.key.toLowerCase()];
    if (id) {
      e.preventDefault();
      pendingKey = setTimeout(() => { pendingKey = null; insertCard(id); }, KEY_HOLD_MS);
    }
    return;
  }
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

/* ============ 8. かくはん：重さの増減を「何かが起きる」きっかけに変える（v5） ============
   本人依頼（2026-09-01「重量変化を"特定の音のON/OFFスイッチ"ではなく
   "セッション全体をゆらす撹拌操作"として再定義する」）への対応。
   stone-serial.js は個体識別をせず、「増えた('increase')／減った('decrease')／
   石が全部なくなった('empty')」の三種類のきっかけだけを教えてくる。
   ここでその都度、確率的に何を起こすかを選ぶ。
   比率は初期値（体感で決めた仮の値）。実際に触ってみて、ここの数字を
   直接書き換えれば調整できる（合計が100になっていなくても比率として
   機能するので、増減の目安として自由に変えてよい）。 */
function pickWeighted(options) {
  // options: [[重み, 実行する関数], ...]
  const total = options.reduce((s, o) => s + o[0], 0);
  let r = Math.random() * total;
  for (const [w, fn] of options) {
    if (r < w) return fn;
    r -= w;
  }
  return options[options.length - 1][1];
}

/* 「揺らす」：既存の一撃（playImpact）に、もう一段大きな音量の凹みを
   重ねるだけの単純な演出。新しい合成音は作らず、既存の仕組みの再利用に
   とどめている（本人依頼「シンプルに・低リスクに」への対応）。 */
function shakeSession() {
  const t = Tone.now();
  playImpact(t + 0.05, 1.0);
  try {
    const g = Bus.master.gain;
    g.cancelScheduledValues(t + 0.4);
    g.setValueAtTime(g.value, t + 0.4);
    g.rampTo(0.5 + Math.random() * 0.15, 0.25, t + 0.4);
    g.rampTo(1, 1.1, t + 0.65);
  } catch (e) { /* Tone.Signal.rampToの第3引数(開始時刻)が使えない版でも、ここが失敗するだけで曲は止めない */ }
  UI.toast('ゆらぎました');
}

function allCardIds() {
  const ids = [];
  CHAR_ORDER.forEach(ck => ROLE_ORDER.forEach(rk => ids.push(ck + '-' + rk)));
  /* v31：メロディ拡張5枠（melodyのみ）を末尾に追加。既存20枚には触れない。
     いまの世界に無い枠（cardOfがnull）はここで除外する——かくはん
     （ランダム撹拌）が「押しても何も起きない札」を選んで空振りしない
     ようにするため */
  EXT_SLOTS.forEach(ck => { const id = ck + '-melody'; if (cardOf(id)) ids.push(id); });
  return ids;
}
function randomInactiveCard() {
  const free = allCardIds().filter(id => !State.parts.has(id));
  if (free.length === 0) return null;
  return free[Math.floor(Math.random() * free.length)];
}
/* 指定した役割のうち、まだ鳴っていない札を1枚選ぶ。無ければnull */
function randomInactiveCardOfRole(roleKey) {
  const free = allCardIds().filter(id => !State.parts.has(id) && id.endsWith('-' + roleKey));
  if (free.length === 0) return null;
  return free[Math.floor(Math.random() * free.length)];
}

/* ---- 出だしの2枚だけは役割を決めておく（本人指示：2026-09-02）----
   1枚目＝リズム、2枚目＝ベース。3枚目以降は完全に自由。

   理由：リズムだけだと拍は立つが調が決まらず、次に来る札が何であっても
   ふわっと乗ってしまう。リズム＋ベースまで置くと拍と和音の芯が両方決まるので、
   そこから先は何が来ても「意図した音」に聞こえる。
   映像（走るレーン３／４）は足音を拍に合わせているため、
   拍を鳴らすリズムが最初にいると、最初の一手から音と絵が噛み合う。

   v5の核である「何が起きるか分からない」を損なわないよう、
   縛るのは最初の2枚だけに留めてある。 */
const OPENING_ROLES = ['rhythm', 'bass'];
function openingRole() {
  /* 何枚目かは「いま鳴っている枚数」ではなく State.order の長さで見る。
     押し出しで枚数が減っても出だしをやり直さないため。 */
  if (State.order.length >= OPENING_ROLES.length) return null;
  const role = OPENING_ROLES[State.order.length];
  /* すでにその役割が鳴っているなら、出だしの役目は果たしているので自由に戻す */
  return State.hasRole(role) ? null : role;
}
function randomWorldExcluding(excludeKey) {
  const base = WORLD_ORDER.filter(w => ActiveWorlds.has(w));
  const pool = base.filter(w => w !== excludeKey);
  const list = pool.length ? pool : (base.length ? base : WORLD_ORDER);
  return list[Math.floor(Math.random() * list.length)];
}

/* 重さが増えたとき：80%札を1枚追加／15%世界を変える／5%揺らす。
   ただし出だしの2枚（リズム→ベース）だけは抽選せず、必ずその役割を置く。 */
function handleStoneIncrease() {
  if (!State.playing || State.paused) return;

  const role = openingRole();
  if (role) {
    const id = randomInactiveCardOfRole(role);
    if (id) {
      insertCard(id);
      UI.toast(`${labelOf(id)} が入りました`);
      return;
    }
    // その役割の札がもう残っていない場合だけ、通常の抽選に落とす
  }

  const action = pickWeighted([
    [80, () => {
      const id = randomInactiveCard();
      if (!id) { UI.toast('もう空きがありません'); return; }
      insertCard(id);
      UI.toast(`${labelOf(id)} が増えました`);
    }],
    [15, () => { requestWorld(randomWorldExcluding(World.key)); }], // 完了時のトーストはrequestWorld自身が出す
    [5, shakeSession],
  ]);
  action();
}

/* 重さが減ったとき：80%札を1枚外す／10%標準の世界へ戻す／10%揺らす */
function handleStoneDecrease() {
  if (!State.playing || State.paused) return;
  const action = pickWeighted([
    [80, () => {
      if (State.order.length === 0) { UI.toast('鳴っている音がありません'); return; }
      const id = State.order[Math.floor(Math.random() * State.order.length)];
      const label = labelOf(id);
      removeCard(id);
      UI.toast(`${label} が減りました`);
    }],
    [10, () => {
      if (World.key) requestWorld(World.key); // 同じ札扱い＝標準へ戻る。トーストはrequestWorld自身が出す
      else UI.toast('すでに標準の世界です');
    }],
    [10, shakeSession],
  ]);
  action();
}

/* 石が全部なくなったとき：鳴っている音を全部フェードアウトし、世界も標準へ戻す。
   endGame()は使わない（トランスポートは止めず、土台のビートは鳴り続けたまま
   「また0から積み重ねられる」状態に戻すだけ）。 */
function handleStoneEmpty() {
  if (!State.playing) return;
  State.order.slice().forEach(id => removeCard(id));
  if (World.key) requestWorld(World.key);
  UI.toast('リセットしました（また0から積み重ねられます）');
}

window.handleStoneIncrease = handleStoneIncrease;
window.handleStoneDecrease = handleStoneDecrease;
window.handleStoneEmpty = handleStoneEmpty;

/* RFID化したときの入口 */
window.insertCard = insertCard;
