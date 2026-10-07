/* =====================================================================
   visual.js — 「ビジュアルボタン」試作（stone-app-v5/tools/visual-prototype）
   ---------------------------------------------------------------------
   本体（index.html／app.js／engine.js／music.js）は一切書き換えない。
   State.parts / State.order / World.key を毎フレームpollingで見て
   差分（増えた／減った／世界が変わった）を検出し、キャンバスに描く。
   「揺らぎ」(shakeSession)だけは差分検出できない一瞬のイベントなので、
   関数をラップして検知する。

   モード1：鼓動する石庭（ピクセル生き物・ビート同期）
   モード2：生命の木（積み重なりがそのまま木の姿になる）
   モード3：走るレーン（8レーン・左から右へ走って画面外へ抜けたらループ、
            消えたキャラは右へ抜けきるまで走り続けて消え、
            そのレーンは詰めずに空けておいて次の追加を待つ）
   ===================================================================== */
(function () {
  'use strict';

  /* ---------------- 見た目の土台データ ---------------- */
  const CHAR_COLORS = {
    core:  '#9aa0ad', // 岩の精
    sing:  '#5ec8f0', // 鳥
    push:  '#e0793f', // 獣
    drive: '#79c96b', // 虫
    color: '#e069c9', // 蝶
  };
  const CHAR_DARK = {
    core: '#4d5159', sing: '#2a6a86', push: '#7a3d1c', drive: '#356b2c', color: '#7a3266',
  };

  const ROLE_ZONE_Y = { melody: 0.16, chord: 0.38, rhythm: 0.62, bass: 0.85 };

  const WORLD_PALETTE = {
    base:     { sky: ['#0e1220', '#161c30'], accent: '#6fa8ff' },
    beatles:  { sky: ['#20141a', '#33202a'], accent: '#ff8fd0' },
    kaze:     { sky: ['#0e1f1a', '#173327'], accent: '#7be8b0' },
    modal:    { sky: ['#131226', '#1f1d3d'], accent: '#a98bff' },
    hisaishi: { sky: ['#0f1b24', '#1a2c3a'], accent: '#8fd4ff' },
    citypop:  { sky: ['#1a1030', '#2c1a4d'], accent: '#ff7ad9' },
    house:    { sky: ['#160a20', '#2a1235'], accent: '#ff5fb0' },
    lofi:     { sky: ['#151515', '#232323'], accent: '#e0b080' },
    funk:     { sky: ['#241005', '#3d1c08'], accent: '#ffb020' },
    rock:     { sky: ['#1a0808', '#301010'], accent: '#ff5040' },
    reggae:   { sky: ['#0c1f0c', '#173717'], accent: '#ffd23f' },
    flamenco: { sky: ['#2a0a0a', '#451212'], accent: '#ff3860' },
    swing:    { sky: ['#1c1408', '#332510'], accent: '#f0c060' },
  };
  function currentPalette() {
    const key = (typeof World !== 'undefined' && World.key) ? World.key : 'base';
    return WORLD_PALETTE[key] || WORLD_PALETTE.base;
  }

  const WORLD_SEASON = {
    base: 'spring', beatles: 'spring', citypop: 'spring',
    reggae: 'summer', house: 'summer', funk: 'summer',
    kaze: 'autumn', hisaishi: 'autumn', lofi: 'autumn', swing: 'autumn',
    modal: 'winter', rock: 'winter', flamenco: 'winter',
  };
  const SEASON_PALETTE = {
    spring: { sky: '#1a1522', trunk: '#5b4636' },
    summer: { sky: '#0e2016', trunk: '#4a3626' },
    autumn: { sky: '#221208', trunk: '#4a3020' },
    winter: { sky: '#10141c', trunk: '#3a3a40' },
  };
  function currentSeason() {
    const key = (typeof World !== 'undefined' && World.key) ? World.key : 'base';
    return SEASON_PALETTE[WORLD_SEASON[key] || 'spring'];
  }

  /* ---------------- 安定した位置合わせ用ハッシュ ---------------- */
  function hash01(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return ((h >>> 0) % 10000) / 10000;
  }

  /* ---------------- ピクセル生き物（共通ブロブ＋種ごとの装飾） ----------------
     8x8の共通の「まる胴体」マスクに、生き物ごとの装飾ピクセル（耳・羽・触角等）を
     重ねる方式。フレームA/Bで装飾の位置だけを変える（羽ばたき・まばたき等）。   */
  const BODY_MASK = [
    '..1111..',
    '.111111.',
    '11111111',
    '11111111',
    '11111111',
    '11111111',
    '.111111.',
    '..1111..',
  ];
  function drawBlob(ctx, cx, cy, cell, bodyColor) {
    for (let y = 0; y < 8; y++) {
      const row = BODY_MASK[y];
      for (let x = 0; x < 8; x++) {
        if (row[x] === '.') continue;
        ctx.fillStyle = bodyColor;
        ctx.fillRect(cx + (x - 4) * cell, cy + (y - 4) * cell, cell, cell);
      }
    }
  }
  /* 種ごとの装飾。frame 0/1 でちょっとだけ変化させる */
  const DECORATIONS = {
    core: (ctx, cx, cy, cell, dark, frame) => {
      // 岩の精：目のハイライトが明滅
      ctx.fillStyle = frame === 0 ? dark : '#ffffff';
      ctx.fillRect(cx - 1 * cell, cy - 1 * cell, cell, cell);
      ctx.fillRect(cx + 1 * cell, cy - 1 * cell, cell, cell);
    },
    sing: (ctx, cx, cy, cell, dark, frame) => {
      // 鳥：くちばし＋翼（frameで翼の角度が変わる）
      ctx.fillStyle = '#f2c14e';
      ctx.fillRect(cx + 4 * cell, cy, cell, cell);
      ctx.fillStyle = dark;
      const wingY = frame === 0 ? -1 : 0;
      ctx.fillRect(cx - 5 * cell, cy + wingY * cell, cell, cell);
      ctx.fillRect(cx - 6 * cell, cy + (wingY + (frame === 0 ? 1 : -1)) * cell, cell, cell);
    },
    push: (ctx, cx, cy, cell, dark, frame) => {
      // 獣：耳2つ＋小さな牙
      ctx.fillStyle = dark;
      ctx.fillRect(cx - 3 * cell, cy - 5 * cell, cell, cell);
      ctx.fillRect(cx + 2 * cell, cy - 5 * cell, cell, cell);
      ctx.fillStyle = '#fff8e0';
      ctx.fillRect(cx + (frame === 0 ? 3 : 4) * cell, cy + 3 * cell, cell, cell);
    },
    drive: (ctx, cx, cy, cell, dark, frame) => {
      // 虫：触角2本（frameで先端が揺れる）
      ctx.fillStyle = dark;
      const sway = frame === 0 ? -1 : 1;
      ctx.fillRect(cx - 2 * cell, cy - 6 * cell, cell, cell);
      ctx.fillRect(cx - 2 * cell + sway * cell, cy - 7 * cell, cell, cell);
      ctx.fillRect(cx + 1 * cell, cy - 6 * cell, cell, cell);
      ctx.fillRect(cx + 1 * cell - sway * cell, cy - 7 * cell, cell, cell);
    },
    color: (ctx, cx, cy, cell, dark, frame) => {
      // 蝶：左右の羽（frameで開閉）
      const spread = frame === 0 ? 6 : 4;
      ctx.fillStyle = dark;
      ctx.fillRect(cx - spread * cell, cy - 2 * cell, 2 * cell, 3 * cell);
      ctx.fillRect(cx + (spread - 2) * cell, cy - 2 * cell, 2 * cell, 3 * cell);
    },
  };

  /* ---------------- パーティクル ---------------- */
  let particles = [];
  function spawnBurst(x, y, color, n) {
    n = n || 10;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 70;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0, life: 0, maxLife: 450 + Math.random() * 250, color, size: 3 });
    }
  }
  function spawnLeafFall(x, y, color, n) {
    n = n || 4;
    for (let i = 0; i < n; i++) {
      particles.push({
        x: x + (Math.random() - 0.5) * 10, y,
        vx: (Math.random() - 0.5) * 20, vy: 10 + Math.random() * 10, g: 40,
        life: 0, maxLife: 1200 + Math.random() * 500, color, size: 4,
      });
    }
  }
  function spawnHeart(x, y) {
    particles.push({ x, y, vx: 0, vy: -18, g: 0, life: 0, maxLife: 700, color: '#ff6fa8', size: 6, heart: true });
  }
  function updateParticles(dtMs) {
    const dtS = dtMs / 1000;
    particles.forEach(p => { p.life += dtMs; p.x += p.vx * dtS; p.y += p.vy * dtS; p.vy += p.g * dtS; });
    particles = particles.filter(p => p.life < p.maxLife);
  }
  function drawParticles(ctx) {
    particles.forEach(p => {
      const a = Math.max(0, 1 - p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.heart) {
        ctx.font = '16px sans-serif';
        ctx.fillText('♥', p.x - 6, p.y + 6);
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    });
    ctx.globalAlpha = 1;
  }

  /* ---------------- ビート同期 ---------------- */
  let lastBeatAt = 0;
  function onBeat() {
    lastBeatAt = performance.now();
    beatCount++;
    maybeTriggerGesture();
  }
  let beatCount = 0;
  function beatEnvelope(now) {
    const dt = now - lastBeatAt, dur = 220;
    if (dt < 0 || dt > dur) return 0;
    return 1 - dt / dur;
  }
  function beatFrame() { return beatCount % 2; }

  if (typeof Tone !== 'undefined') {
    try {
      Tone.Transport.scheduleRepeat((time) => {
        Tone.Draw.schedule(onBeat, time);
      }, '4n');
    } catch (e) { /* Toneの版によってはscheduleRepeatの引数が違う可能性があるが、失敗しても描画自体は続行できる */ }
  }

  /* ---------------- モード1：石庭の生き物の状態 ---------------- */
  const creatures = new Map(); // id -> {charKey, roleKey, x01, state, t0, t1}
  const pairTimers = new Map(); // "idA|idB" -> ms co-present

  function spawnCreature(id, silent) {
    const [charKey, roleKey] = id.split('-');
    const c = { charKey, roleKey, x01: hash01(id), state: silent ? 'active' : 'arriving', t0: performance.now() };
    creatures.set(id, c);
  }
  function despawnCreature(id) {
    const c = creatures.get(id);
    if (!c) return;
    c.state = 'leaving';
    c.t1 = performance.now();
  }
  function maybeTriggerGesture() {
    const active = [...creatures.entries()].filter(([, c]) => c.state === 'active');
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const [idA, cA] = active[i], [idB, cB] = active[j];
        const zoneDist = Math.abs(ROLE_ZONE_Y[cA.roleKey] - ROLE_ZONE_Y[cB.roleKey]);
        if (zoneDist > 0.24) continue; // 同じ／隣接ゾーンだけ対象
        const key = idA < idB ? idA + '|' + idB : idB + '|' + idA;
        const t = (pairTimers.get(key) || 0) + 1;
        pairTimers.set(key, t);
        if (t > 8 && Math.random() < 0.10) {
          pairTimers.set(key, 0);
          const midX01 = (cA.x01 + cB.x01) / 2;
          const midY = (ROLE_ZONE_Y[cA.roleKey] + ROLE_ZONE_Y[cB.roleKey]) / 2;
          gestureHint = { x01: midX01, y01: midY, t: performance.now() };
        }
      }
    }
  }
  let gestureHint = null;

  /* ---------------- モード2：生命の木の状態 ---------------- */
  const branches = new Map(); // id -> {charKey, roleKey, angle, x01(高さ), state, t0, t1}
  let treeRestFactor = 1;

  function growBranch(id, silent) {
    const [charKey, roleKey] = id.split('-');
    branches.set(id, {
      charKey, roleKey,
      heightFrac: 0.25 + hash01(id) * 0.65,
      angleSign: (hash01(id + 'a') < 0.5 ? -1 : 1),
      angleBase: 0.5 + hash01(id + 'b') * 0.6,
      len: silent ? 1 : 0,
      state: silent ? 'active' : 'growing',
      t0: performance.now(),
    });
    treeRestFactor = 1;
  }
  function witherBranch(id) {
    const b = branches.get(id);
    if (!b) return;
    b.state = 'withering';
    b.t1 = performance.now();
  }

  /* ---------------- モード3：走るレーンの状態 ---------------- */
  const LANE_COUNT = 8;
  const RUN_PX_PER_BEAT = 90; // このpx分だけ、四分音符1つぶんの時間で走る（速さのテンポ連動の基準）
  const SPRITE_W = 110; // 本人依頼（もっと大きく）に合わせて拡大したスプライトの余白込み幅
  /* 何px進むごとに脚が1サイクル（両足接地×1）するか。s.x（実際の移動距離）を
     直接位相にするので、テンポが速いほど自然に足の回転も速く見える。
     RUN_PX_PER_BEATの半分＝1拍で脚が2サイクル回る、駆け足らしい速さにした。 */
  const STRIDE_LEN = RUN_PX_PER_BEAT / 2;
  // 小節線の間隔は「ランナーが1小節（4拍）で進む距離」に揃えてある。
  // これで背景の小節線とキャラの走る速さが体感として噛み合う（本人の紅の豚OP要望）。
  function currentBpm() {
    try { return (typeof Tone !== 'undefined' && Tone.Transport.bpm.value) || 104; } catch (e) { return 104; }
  }
  function runSpeedPxPerSec() { return RUN_PX_PER_BEAT * (currentBpm() / 60); }
  function barWidthPx() { return RUN_PX_PER_BEAT * 4; }

  const laneSlots = new Array(LANE_COUNT).fill(null); // null または {cardId, charKey, roleKey, x, phase}
  let barScrollX = 0; // 小節線の右→左スクロール位置（負方向へ進む）

  function laneSpawn(id) {
    const slotIndex = laneSlots.findIndex(s => s === null);
    if (slotIndex === -1) return; // 8レーン埋まっていたら諦める（試作の既知の制約）
    const [charKey, roleKey] = id.split('-');
    laneSlots[slotIndex] = { cardId: id, charKey, roleKey, x: -SPRITE_W, phase: 'running', animFrame: -1 };
  }

  /* ---------------- 走行エフェクト（砂ぼこり） ----------------
     本人依頼「エフェクトも追加」への対応。接地コマ（後述RUN_FRAMESの1・3）に
     切り替わった瞬間だけ、足元に小さな砂ぼこりを出す。単純な寿命つき配列。 */
  let laneDust = [];
  function spawnDust(x, y, color) {
    for (let i = 0; i < 3; i++) {
      laneDust.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 4,
        vx: -40 - Math.random() * 30,
        vy: -10 - Math.random() * 20,
        life: 260 + Math.random() * 120,
        age: 0,
        color,
      });
    }
  }
  function updateDust(dt) {
    for (let i = laneDust.length - 1; i >= 0; i--) {
      const p = laneDust[i];
      p.age += dt;
      if (p.age >= p.life) { laneDust.splice(i, 1); continue; }
      p.x += p.vx * (dt / 1000);
      p.y += p.vy * (dt / 1000);
    }
  }
  function drawDust(ctx, cell) {
    laneDust.forEach(p => {
      const a = 1 - p.age / p.life;
      ctx.globalAlpha = a * 0.8;
      ctx.fillStyle = p.color;
      const s = cell * 0.8;
      ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
    });
    ctx.globalAlpha = 1;
  }
  function laneExit(id) {
    const slot = laneSlots.find(s => s && s.cardId === id);
    if (slot) slot.phase = 'exiting';
  }
  function laneSyncAll(ids) {
    laneSlots.fill(null);
    ids.forEach(id => laneSpawn(id));
  }
  function updateLanes(dt) {
    const speed = runSpeedPxPerSec() * (dt / 1000);
    barScrollX -= runSpeedPxPerSec() * (dt / 1000);
    const bw = barWidthPx();
    if (barScrollX <= -bw) barScrollX += bw;

    const w = lastCanvasW;
    for (let i = 0; i < laneSlots.length; i++) {
      const s = laneSlots[i];
      if (!s) continue;
      s.x += speed;
      if (s.x > w + SPRITE_W) {
        if (s.phase === 'exiting') { laneSlots[i] = null; }
        else { s.x = -SPRITE_W; } // 画面外に抜けたら左からループして走り続ける
      }
    }
    updateDust(dt);
  }

  /* ---------------- 差分検出（pollingベース） ---------------- */
  let lastPartIds = new Set();
  let lastWorldKey;
  let lastOrderEmpty = true;
  let baselineSynced = false;

  function syncBaseline() {
    if (typeof State === 'undefined') return;
    lastPartIds = new Set(State.parts.keys());
    lastWorldKey = (typeof World !== 'undefined') ? World.key : null;
    lastOrderEmpty = State.order.length === 0;
    creatures.clear(); branches.clear();
    lastPartIds.forEach(id => { spawnCreature(id, true); growBranch(id, true); });
    laneSyncAll([...lastPartIds]);
    if (window.Lanes2) Lanes2.syncAll([...lastPartIds]);
    if (window.Lanes3) Lanes3.syncAll([...lastPartIds]);
    if (window.Lanes4) Lanes4.syncAll([...lastPartIds]);
    baselineSynced = true;
  }

  function pollDiff() {
    if (typeof State === 'undefined') return;
    if (!baselineSynced) { syncBaseline(); return; }

    const now = new Set(State.parts.keys());
    now.forEach(id => {
      if (!lastPartIds.has(id)) {
        spawnCreature(id, false);
        growBranch(id, false);
        laneSpawn(id);
        if (window.Lanes2) Lanes2.spawn(id);
        if (window.Lanes3) Lanes3.spawn(id);
        if (window.Lanes4) Lanes4.spawn(id);
        onCardAdded(id);
      }
    });
    lastPartIds.forEach(id => {
      if (!now.has(id)) {
        despawnCreature(id);
        witherBranch(id);
        laneExit(id);
        if (window.Lanes2) Lanes2.exit(id);
        if (window.Lanes3) Lanes3.exit(id);
        if (window.Lanes4) Lanes4.exit(id);
      }
    });
    lastPartIds = now;

    if (typeof World !== 'undefined' && World.key !== lastWorldKey) {
      lastWorldKey = World.key;
    }

    const orderEmpty = (State.order.length === 0);
    if (orderEmpty && !lastOrderEmpty) treeRestFactor = 0.35;
    lastOrderEmpty = orderEmpty;
  }

  function onCardAdded(id) {
    // 着地の粒子演出は、insertCard内のplayImpact（次の拍/小節境界）と厳密には
    // 同期していない簡易近似。挿入検知の瞬間にすぐ出す（既知の簡略化）。
    const c = creatures.get(id);
    if (c) {
      const zoneY = ROLE_ZONE_Y[c.roleKey] * lastCanvasH;
      const x = c.x01 * lastCanvasW;
      spawnBurst(x, zoneY, CHAR_COLORS[c.charKey]);
    }
  }

  /* ---------------- 揺らぎ(shakeSession)のラップ検知 ---------------- */
  let shakeUntil = 0;
  if (typeof window.shakeSession === 'function') {
    const _shake = window.shakeSession;
    window.shakeSession = function () {
      _shake();
      shakeUntil = performance.now() + 900;
      if (window.Lanes2) Lanes2.onShake();
      if (window.Lanes3) Lanes3.onShake();
      if (window.Lanes4) Lanes4.onShake();
    };
  }

  /* ---------------- キャンバス／UI ---------------- */
  let canvas, ctx, overlay, visible = false, mode = 'garden';
  let lastCanvasW = window.innerWidth, lastCanvasH = window.innerHeight;

  function buildUI() {
    const style = document.createElement('style');
    style.textContent = `
      #vpOpenBtn{position:fixed;right:12px;top:12px;z-index:99997;padding:8px 14px;
        background:#1a1f2b;color:#eef2f8;border:1px solid #333c4d;border-radius:8px;
        font:13px sans-serif;cursor:pointer;}
      #vpOverlay{position:fixed;inset:0;z-index:99998;background:#05060a;display:none;}
      #vpOverlay.show{display:block;}
      #vpCanvas{display:block;width:100%;height:100%;}
      #vpControls{position:fixed;right:12px;top:12px;z-index:99999;display:flex;gap:8px;}
      #vpControls button{padding:8px 12px;background:#1a1f2bcc;color:#eef2f8;
        border:1px solid #333c4d;border-radius:8px;font:13px sans-serif;cursor:pointer;}
      #vpControls button.active{background:#3a4a6bcc;border-color:#6fa8ff;}
    `;
    document.head.appendChild(style);

    const openBtn = document.createElement('button');
    openBtn.id = 'vpOpenBtn';
    openBtn.textContent = '🌱 ビジュアル';
    document.body.appendChild(openBtn);

    overlay = document.createElement('div');
    overlay.id = 'vpOverlay';
    overlay.innerHTML = `
      <canvas id="vpCanvas"></canvas>
      <div id="vpControls">
        <button id="vpGarden" class="active">石庭</button>
        <button id="vpTree">生命の木</button>
        <button id="vpLanes">走るレーン</button>
        <button id="vpLanes2">走るレーン２</button>
        <button id="vpLanes3">走るレーン３</button>
        <button id="vpLanes4">走るレーン４</button>
        <button id="vpCloseBtn">閉じる ×</button>
      </div>
    `;
    document.body.appendChild(overlay);

    canvas = document.getElementById('vpCanvas');
    ctx = canvas.getContext('2d');

    openBtn.addEventListener('click', () => { showOverlay(); });
    document.getElementById('vpCloseBtn').addEventListener('click', () => { hideOverlay(); });
    document.getElementById('vpGarden').addEventListener('click', (e) => { setMode('garden', e.target); });
    document.getElementById('vpTree').addEventListener('click', (e) => { setMode('tree', e.target); });
    document.getElementById('vpLanes').addEventListener('click', (e) => { setMode('lanes', e.target); });
    document.getElementById('vpLanes2').addEventListener('click', (e) => { setMode('lanes2', e.target); });
    document.getElementById('vpLanes3').addEventListener('click', (e) => { setMode('lanes3', e.target); });
    document.getElementById('vpLanes4').addEventListener('click', (e) => { setMode('lanes4', e.target); });

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
  }

  function setMode(m, btn) {
    mode = m;
    document.querySelectorAll('#vpControls button').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
  }

  function resizeCanvas() {
    if (!canvas) return;
    /* ドット絵は等倍で描かないとぼやけるので、devicePixelRatioを掛けた
       実ピクセル数でバッファを確保し、CSS側でCSSピクセルに戻す。
       （高DPI画面でブラウザに引き伸ばされると、走るレーン２の絵が眠くなる） */
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    lastCanvasW = canvas.width; lastCanvasH = canvas.height;
  }

  function showOverlay() {
    overlay.classList.add('show');
    visible = true;
    baselineSynced = false; // 開いた瞬間の状態をそのまま「すでにいる」扱いで同期する
    resizeCanvas();
  }
  function hideOverlay() {
    overlay.classList.remove('show');
    visible = false;
  }

  /* ---------------- モード1描画 ---------------- */
  function renderGarden(now, dt) {
    const pal = currentPalette();
    const w = canvas.width, h = canvas.height;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, pal.sky[0]);
    grad.addColorStop(1, pal.sky[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 遠景：ゆっくり流れる淡い円（雲/靄）
    const t1 = (now * 0.01) % (w + 200);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = pal.accent;
    for (let i = 0; i < 6; i++) {
      const x = ((i * 260 - t1) % (w + 200)) - 100;
      ctx.beginPath(); ctx.ellipse(x, h * 0.18 + (i % 3) * 20, 70, 22, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 中景：明滅する小さな光の粒（ホタル的）
    const t2 = now * 0.03;
    for (let i = 0; i < 18; i++) {
      const seed = i * 137.5;
      const x = (Math.sin(seed + t2 * 0.6) * 0.5 + 0.5) * w;
      const y = h * 0.35 + Math.sin(seed * 1.3 + t2) * h * 0.18;
      const tw = (Math.sin(t2 * 2 + seed) + 1) / 2;
      ctx.globalAlpha = 0.15 + tw * 0.35;
      ctx.fillStyle = pal.accent;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;

    // 前景：地面の帯
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, h * 0.9, w, h * 0.1);

    // 生き物たち
    const cell = Math.max(3, Math.min(6, w / 220));
    const env = beatEnvelope(now);
    const frame = beatFrame();

    creatures.forEach((c, id) => {
      const zoneY = ROLE_ZONE_Y[c.roleKey] * h;
      const x = c.x01 * (w * 0.86) + w * 0.07;

      let alpha = 1, scaleY = 1, scaleX = 1, yOff = 0;
      if (c.state === 'arriving') {
        const t = Math.min(1, (now - c.t0) / 300);
        alpha = t; scaleY = 0.4 + 0.6 * t; scaleX = 0.4 + 0.6 * t;
        if (t >= 1) c.state = 'active';
      } else if (c.state === 'leaving') {
        const t = Math.min(1, (now - c.t1) / 800);
        alpha = 1 - t; yOff = -20 * t; scaleY = 1 - 0.3 * t;
        if (t >= 1) { creatures.delete(id); return; }
      } else {
        // ビートに合わせたスクワッシュ&ストレッチ
        scaleY = 1 - 0.22 * env;
        scaleX = 1 + 0.14 * env;
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, zoneY + yOff);
      ctx.scale(scaleX, scaleY);
      drawBlob(ctx, 0, 0, cell, CHAR_COLORS[c.charKey]);
      const dec = DECORATIONS[c.charKey];
      if (dec) dec(ctx, 0, 0, cell, CHAR_DARK[c.charKey], frame);
      ctx.restore();
    });
    ctx.globalAlpha = 1;

    // セレンディピティ演出：仲良くなったペアの間にハート
    if (gestureHint && now - gestureHint.t < 50) {
      spawnHeart(gestureHint.x01 * (w * 0.86) + w * 0.07, gestureHint.y01 * h - 14);
      gestureHint = null;
    }

    // ゆらぎ（shake）：画面全体をわずかに揺らして光を強める
    if (now < shakeUntil) {
      const s = (shakeUntil - now) / 900;
      ctx.fillStyle = pal.accent;
      ctx.globalAlpha = 0.10 * s;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  /* ---------------- モード2描画 ---------------- */
  function renderTree(now, dt) {
    const season = currentSeason();
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = season.sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, h * 0.92, w, h * 0.08);

    const baseX = w * 0.5, baseY = h * 0.92;
    const windAmp = (now < shakeUntil ? 0.35 : 0.06) * treeRestFactor;
    const wind = Math.sin(now / 700) * windAmp;

    // 幹
    ctx.strokeStyle = season.trunk;
    ctx.lineWidth = Math.max(6, w * 0.015);
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    const trunkTopX = baseX + wind * 20;
    const trunkTopY = baseY - h * 0.55;
    ctx.quadraticCurveTo(baseX + wind * 10, baseY - h * 0.3, trunkTopX, trunkTopY);
    ctx.stroke();

    treeRestFactor = Math.min(1, treeRestFactor + dt * 0.00005);

    branches.forEach((b, id) => {
      let alpha = 1, growT = 1;
      if (b.state === 'growing') {
        growT = Math.min(1, (now - b.t0) / 600);
        if (growT >= 1) b.state = 'active';
      } else if (b.state === 'withering') {
        const t = Math.min(1, (now - b.t1) / 900);
        alpha = 1 - t;
        if (t >= 1) { branches.delete(id); return; }
        if (t > 0.05 && !b._dropped) {
          b._dropped = true;
          const bx = baseX + (trunkTopX - baseX) * b.heightFrac;
          const by = baseY + (trunkTopY - baseY) * b.heightFrac;
          spawnLeafFall(bx, by, CHAR_COLORS[b.charKey], 4);
        }
      }

      const originX = baseX + (trunkTopX - baseX) * b.heightFrac;
      const originY = baseY + (trunkTopY - baseY) * b.heightFrac;
      const sway = wind * (0.5 + b.heightFrac);
      const angle = -Math.PI / 2 + b.angleSign * b.angleBase + sway;
      const len = (60 + b.heightFrac * 60) * growT;
      const tipX = originX + Math.cos(angle) * len;
      const tipY = originY + Math.sin(angle) * len;

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = season.trunk;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(originX, originY); ctx.lineTo(tipX, tipY); ctx.stroke();

      // 葉クラスタ：役割で形（丸/三角/四角/星型っぽい配置）を変える
      ctx.fillStyle = CHAR_COLORS[b.charKey];
      const leafSize = 5 + growT * 3;
      const cluster = 3;
      for (let i = 0; i < cluster; i++) {
        const a2 = angle + (i - 1) * 0.4;
        const lx = tipX + Math.cos(a2) * (i * 4);
        const ly = tipY + Math.sin(a2) * (i * 4);
        if (b.roleKey === 'melody') { ctx.beginPath(); ctx.arc(lx, ly, leafSize / 2, 0, Math.PI * 2); ctx.fill(); }
        else if (b.roleKey === 'bass') { ctx.fillRect(lx - leafSize / 2, ly - leafSize / 2, leafSize, leafSize); }
        else if (b.roleKey === 'rhythm') { ctx.beginPath(); ctx.moveTo(lx, ly - leafSize / 2); ctx.lineTo(lx + leafSize / 2, ly + leafSize / 2); ctx.lineTo(lx - leafSize / 2, ly + leafSize / 2); ctx.closePath(); ctx.fill(); }
        else { ctx.beginPath(); ctx.ellipse(lx, ly, leafSize / 2, leafSize / 3, a2, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
    });
  }

  /* ---------------- 走るキャラのスプライト（横向き・ファミコン/ゲームボーイ風） ----------------
     本人依頼（レーンに収まる範囲で大きく／ファミコン・ゲームボーイ風のアニメ／
     もっと作り込む／エフェクト追加）への対応。
     sinによる連続補間はやめ、4コマの決め打ちポーズを"パチッ"と切り替える
     离散フレームアニメにした（8bit機の走行サイクルは滑らかな補間ではなく、
     少ないコマ数を一定間隔で切り替えることで表現されていたため）。
     頭上の性格マークに加えて、目・胴体の陰影・性格ごとの追加ディテールを
     入れて、単なるブロブから一段作り込んだ見た目にしている。 */

  // 4コマ：0/2＝両足を大きく開いた「宙に浮く」コマ、1/3＝両足がそろう「接地」コマ
  // （このコマ切り替わりのタイミングでspawnDust=砂ぼこりを出す）
  const RUN_FRAMES = [
    { legF: -3.4, legB: 3.4, bob: -0.3, armF: 2.0, armB: -2.0, contact: false },
    { legF: 0,    legB: 0,   bob: -1.6, armF: 0,   armB: 0,    contact: true },
    { legF: 3.4,  legB: -3.4, bob: -0.3, armF: -2.0, armB: 2.0, contact: false },
    { legF: 0,    legB: 0,   bob: -1.6, armF: 0,   armB: 0,    contact: true },
  ];

  const RUN_MARK = {
    core:  (ctx, cx, cy, cell) => { ctx.fillStyle = '#fef6d8'; ctx.fillRect(cx - cell, cy - 11 * cell, cell, cell); },
    sing:  (ctx, cx, cy, cell) => { ctx.fillStyle = '#f2c14e'; ctx.fillRect(cx + 3.5 * cell, cy - 10 * cell, cell, cell); ctx.fillRect(cx + 4.2 * cell, cy - 9.6 * cell, 0.8 * cell, 0.6 * cell); },
    push:  (ctx, cx, cy, cell, dark) => { ctx.fillStyle = '#f4efe6'; ctx.fillRect(cx - 1.6 * cell, cy - 11.6 * cell, cell, 1.6 * cell); ctx.fillRect(cx + 0.6 * cell, cy - 11.6 * cell, cell, 1.6 * cell); },
    drive: (ctx, cx, cy, cell, dark) => { ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, cell * 0.4); ctx.beginPath(); ctx.moveTo(cx + 0.5 * cell, cy - 11 * cell); ctx.lineTo(cx + 1.6 * cell, cy - 13 * cell); ctx.stroke(); ctx.fillStyle = dark; ctx.fillRect(cx + 1.3 * cell, cy - 13.4 * cell, cell, cell); },
    color: (ctx, cx, cy, cell, dark) => { ctx.fillStyle = dark; ctx.fillRect(cx - 5 * cell, cy - 9 * cell, 1.6 * cell, 2.2 * cell); ctx.fillRect(cx + 3.4 * cell, cy - 9 * cell, 1.6 * cell, 2.2 * cell); },
  };

  function drawRunner(ctx, cx, cy, cell, charKey, frameIndex) {
    const body = CHAR_COLORS[charKey] || '#cccccc';
    const dark = CHAR_DARK[charKey] || '#333333';
    const f = RUN_FRAMES[frameIndex] || RUN_FRAMES[0];
    const by = cy + f.bob * cell;
    const px = (v) => Math.round(v); // 8bit機らしく、ピクセル境界にスナップして"ヌルヌル"させない

    // 脚（フレームごとに決め打ちの開き方。中間の補間はしない）
    ctx.fillStyle = dark;
    ctx.fillRect(px(cx + f.legF * cell - 0.6 * cell), px(by - cell), 1.2 * cell, 4.5 * cell);
    ctx.fillRect(px(cx + f.legB * cell - 0.6 * cell), px(by - 1.5 * cell), 1.2 * cell, 4 * cell);

    // 腕
    ctx.fillStyle = body;
    ctx.fillRect(px(cx - 4.5 * cell + f.armF * 0.5 * cell), px(by - 7.5 * cell), cell, 3 * cell);
    ctx.fillRect(px(cx + 3.5 * cell + f.armB * 0.5 * cell), px(by - 7.5 * cell), cell, 3 * cell);

    // 胴体
    ctx.fillStyle = body;
    ctx.fillRect(px(cx - 4 * cell), px(by - 9.5 * cell), 8 * cell, 6 * cell);
    // 胴体の陰影（下半分だけ濃い色を薄く重ねて立体感を出す）
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = dark;
    ctx.fillRect(px(cx - 4 * cell), px(by - 4.5 * cell), 8 * cell, 1.5 * cell);
    ctx.globalAlpha = 1;

    // 頭
    ctx.fillStyle = body;
    ctx.fillRect(px(cx - 3 * cell), px(by - 12 * cell), 6 * cell, 3 * cell);
    // 目（進行方向側に寄せる。8bitキャラらしい黒目＋白ハイライト）
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(px(cx + 1 * cell), px(by - 11 * cell), 1.2 * cell, 1.2 * cell);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px(cx + 1.5 * cell), px(by - 10.8 * cell), 0.5 * cell, 0.5 * cell);

    const mark = RUN_MARK[charKey];
    if (mark) mark(ctx, cx, by, cell, dark);

    return { contact: f.contact, footX: cx, footY: by + 3.4 * cell };
  }

  /* ---------------- モード3描画 ---------------- */
  function renderLanes(now, dt) {
    const pal = currentPalette();
    const w = canvas.width, h = canvas.height;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, pal.sky[0]);
    grad.addColorStop(1, pal.sky[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    updateLanes(dt);

    const laneH = h / LANE_COUNT;

    // 小節線（右→左へ、テンポに同期してスクロール）
    const bw = barWidthPx();
    ctx.strokeStyle = pal.accent;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 2;
    for (let x = barScrollX; x < w + bw; x += bw) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // レーンの区切り線（五線譜のような横線）
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= LANE_COUNT; i++) {
      const y = i * laneH;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    /* 本人依頼「レーンの大きさは変えずに、レーン内に収まる範囲でキャラクターを
       大きく」への対応。キャラは頭上13.4cell〜足元3.5cell（弾み分含め約17cell）
       の高さで描いているので、そのユニット数からcellを逆算し、レーンをはみ出さず
       目一杯大きく使う。アンカー(y)もユニット比に合わせて下寄りに置く。 */
    const SPRITE_TOP_UNITS = 13.4, SPRITE_BOTTOM_UNITS = 3.6, SPRITE_TOTAL_UNITS = SPRITE_TOP_UNITS + SPRITE_BOTTOM_UNITS;
    const cell = Math.max(3, (laneH * 0.90) / SPRITE_TOTAL_UNITS);
    const anchorFrac = SPRITE_TOP_UNITS / SPRITE_TOTAL_UNITS;

    laneSlots.forEach((s, i) => {
      if (!s) return;
      const y = i * laneH + laneH * anchorFrac;
      // 実際に進んだ距離(s.x)から、4コマの決め打ちフレーム番号を出す（連続補間しない）
      const stridePhase = (((s.x / STRIDE_LEN) % 1) + 1) % 1;
      const frameIndex = Math.floor(stridePhase * 4) % 4;
      if (frameIndex !== s.animFrame) {
        s.animFrame = frameIndex;
        if (RUN_FRAMES[frameIndex].contact) spawnDust(s.x, y + 3.4 * cell, CHAR_DARK[s.charKey]);
      }

      // 走行エフェクト：進行方向後ろに残像（スピード線）を数本
      ctx.globalAlpha = (s.phase === 'exiting' ? 0.7 : 0.8) * 0.5;
      ctx.strokeStyle = CHAR_COLORS[s.charKey];
      ctx.lineWidth = Math.max(1, cell * 0.35);
      [-3, -2, -1].forEach((k, idx) => {
        const ly = y - (5 - idx * 2.5) * cell;
        ctx.beginPath();
        ctx.moveTo(s.x + k * 3 * cell - 2 * cell, ly);
        ctx.lineTo(s.x + k * 3 * cell - 5 * cell, ly);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.globalAlpha = s.phase === 'exiting' ? 0.85 : 1;
      drawRunner(ctx, s.x, y, cell, s.charKey, frameIndex);
      ctx.restore();
    });
    ctx.globalAlpha = 1;

    drawDust(ctx, cell);

    // ゆらぎ（shake）
    if (now < shakeUntil) {
      const sA = (shakeUntil - now) / 900;
      ctx.fillStyle = pal.accent;
      ctx.globalAlpha = 0.10 * sA;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  /* ---------------- メインループ ---------------- */
  let lastFrameT = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) return;
    const dt = Math.min(50, now - lastFrameT);
    lastFrameT = now;
    pollDiff();
    updateParticles(dt);
    if (mode === 'garden') renderGarden(now, dt);
    else if (mode === 'lanes2') {
      if (window.Lanes2) Lanes2.render(ctx, canvas.width, canvas.height, now, dt);
    }
    else if (mode === 'lanes3') {
      if (window.Lanes3) Lanes3.render(ctx, canvas.width, canvas.height, now, dt);
    }
    else if (mode === 'lanes4') {
      if (window.Lanes4) Lanes4.render(ctx, canvas.width, canvas.height, now, dt);
    }
    else if (mode === 'lanes') renderLanes(now, dt);
    else renderTree(now, dt);
    drawParticles(ctx);
  }

  document.addEventListener('DOMContentLoaded', () => {
    buildUI();
    requestAnimationFrame(frame);
  });
})();
