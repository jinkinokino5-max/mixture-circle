/* =====================================================================
   lanes3.js — 「走るレーン３」拍に足が着くランナー
   ---------------------------------------------------------------------
   走るレーン２からの決定的な変更：
   走者の足の接地を、実際の曲の拍にぴたりと合わせる。

   さらに、札の「役割」ごとに歩調と歩幅を変える：
     リズム … 1拍に2歩の小刻み（8分音符）。歩幅は小さいが一番速い
     メロディ… 1拍に1歩。標準的な走り
     ベース … 2拍に1歩の大股。重く、ゆっくり進む
     コード … 2拍に1歩のさらに大股気味。一番ゆったり流れる

   その結果、画面に並ぶ走者の速さと足の運びが、
   そのまま「いま鳴っている音楽のリズム構造」になる。
   足が着いた瞬間には地面に波紋が出るので、
   8本のレーンで拍が視覚的に合流して見える。

   レーンの規則（走るレーン２と同じ）：
   ・音が足されたら、上から順に空いているレーンへ入る
   ・キャラは左→右に走り、画面外に出たら左からループ
   ・音が消えたら、右へ抜けきるまで走り続けてから消える
   ・空いたレーンは詰めない
   ===================================================================== */
(function () {
  'use strict';

  const LANE_COUNT = 8;

  /* 役割ごとの歩調。
     steps  … 1拍あたり何歩、足が着くか
     stride … 1歩で進むドット数（歩幅）
     速さ = steps × stride（ドット/拍）なので、
     「小刻みで速い」「大股でゆっくり」を別々に作れる。 */
  const GAITS = {
    rhythm: { steps: 2,   stride: 16 },  // 8分音符の刻み。一番速い
    melody: { steps: 1,   stride: 26 },  // 標準
    bass:   { steps: 0.5, stride: 40 },  // 2拍に1歩の大股。重い
    chord:  { steps: 0.5, stride: 30 },  // 一番ゆったり
  };
  function gaitOf(roleKey) { return GAITS[roleKey] || GAITS.melody; }

  /* 背景（雲・丘・地面）の流れの基準。走者と違い一定。 */
  const BG_DOTS_PER_BEAT = 26;

  /* 世界ごとの空気感。sky=空のグラデ, far=遠景, mid=雲, ground=地面, accent=小節線 */
  const SCENES = {
    base:     { sky: ['#16243d', '#2b3f63'], far: '#1b2b45', mid: '#33507d', ground: '#22344f', accent: '#8fc0ff' , glow: '#ffb46b' },
    beatles:  { sky: ['#2a1930', '#4b2a44'], far: '#33203a', mid: '#5d3a56', ground: '#3a2440', accent: '#ffa8dd' , glow: '#ffb3e0' },
    kaze:     { sky: ['#12301f', '#245239'], far: '#173a26', mid: '#2f6b48', ground: '#1c3f2a', accent: '#8fe8b4' , glow: '#c6ffa8' },
    modal:    { sky: ['#1b1a38', '#332f5e'], far: '#221f42', mid: '#413a72', ground: '#282348', accent: '#b8a5ff' , glow: '#c9b0ff' },
    hisaishi: { sky: ['#152a3a', '#2a5070'], far: '#1c364a', mid: '#376585', ground: '#20404f', accent: '#a8dcff' , glow: '#bfe8ff' },
    citypop:  { sky: ['#2a1440', '#4d2668'], far: '#331a4a', mid: '#63348a', ground: '#3a1e52', accent: '#ff9be0' , glow: '#ff9ad4' },
    house:    { sky: ['#240f30', '#48204a'], far: '#2d1339', mid: '#5c2a5e', ground: '#33163f', accent: '#ff7fc6' , glow: '#ff7ec0' },
    lofi:     { sky: ['#231e2c', '#413848'], far: '#2b2436', mid: '#524659', ground: '#312a3c', accent: '#c9b8d8' , glow: '#e8d5c4' },
    funk:     { sky: ['#33210e', '#5e3d17'], far: '#3e2812', mid: '#77501f', ground: '#452d14', accent: '#ffc46b' , glow: '#ffd07a' },
    rock:     { sky: ['#2a1414', '#4d2424'], far: '#341a1a', mid: '#632f2f', ground: '#3a1c1c', accent: '#ff8f8f' , glow: '#ff9d7a' },
    reggae:   { sky: ['#1a2c12', '#325320'], far: '#213619', mid: '#437029', ground: '#26401b', accent: '#c4ef7a' , glow: '#e2ff8a' },
    flamenco: { sky: ['#331018', '#5c1e2b'], far: '#3f1420', mid: '#7a2839', ground: '#471825', accent: '#ff9aa8' , glow: '#ffb0a8' },
    swing:    { sky: ['#1e2333', '#3a4358'], far: '#262c40', mid: '#4b5673', ground: '#2c3346', accent: '#b9c7e6' , glow: '#dbe6ff' },
  };

  const laneSlots = new Array(LANE_COUNT).fill(null);
  let scrollFar = 0, scrollMid = 0, scrollGround = 0, scrollBar = 0;
  let dust = [];
  let shakeUntil = 0;
  let lastW = 0, lastH = 0;

  function bpm() {
    try { return (typeof Tone !== 'undefined' && Tone.Transport.bpm.value) || 104; }
    catch (e) { return 104; }
  }

  /* ---------------- 拍の時計 ----------------
     ここが走るレーン３の心臓。曲の再生位置を「拍」で持ち、
     走者の足も背景の流れも、すべてこの拍から作る。
     本体アプリでは Tone.Transport の再生位置を直接使うので、
     実際に鳴っている音と足音がずれない。
     ラボ（Toneがスタブ）では dt を積み上げた仮想の拍を使う。 */
  let virtualBeats = 0;
  let lastScale = 4;                    // 拍→pxの換算に使う直近の拡大率
  function beatsNow() {
    try {
      /* 曲が実際に走っているときだけ Transport の再生位置を使う。
         停止中は seconds が 0 のまま止まるため、そのまま使うと
         「拍0」に貼り付いて地面の縁が光りっぱなしになる。
         止まっている間は仮想の拍で静かに流し続ける。 */
      if (typeof Tone !== 'undefined' && Tone.Transport
          && Tone.Transport.state === 'started'
          && typeof Tone.Transport.seconds === 'number') {
        return Tone.Transport.seconds * (bpm() / 60);
      }
    } catch (e) {}
    return virtualBeats;
  }
  function bgSpeedPxPerBeat() { return BG_DOTS_PER_BEAT * lastScale; }
  function barWidth() { return bgSpeedPxPerBeat() * 4; }   // 1小節＝4拍ぶんの距離

  function scene() {
    const key = (typeof World !== 'undefined' && World.key) ? World.key : 'base';
    return SCENES[key] || SCENES.base;
  }

  /* ---------------- レーン管理 ---------------- */
  function spawn(cardId) {
    const i = laneSlots.findIndex(s => s === null);
    if (i === -1) return;                       // 8本すべて埋まっていたら見送る
    const [charKey, roleKey] = cardId.split('-');
    /* 左から入ってくるのは仕様どおりだが、同時に何個か足されたときに
       全員がぴたりと同じxに並ぶと「1本の柱」に見えて気持ち悪い。
       入り口を少しずつずらして、隊列がばらけるようにする。 */
    const startX = -80 - Math.random() * 220;
    laneSlots[i] = { cardId, charKey, roleKey, x: startX, phase: 'running', frame: 0, prevFrame: -1 };
  }
  function exit(cardId) {
    const s = laneSlots.find(v => v && v.cardId === cardId);
    if (s) s.phase = 'exiting';                 // 止めない。右へ抜けきってから消える
  }
  /* すでに鳴っている状態でオーバーレイを開いたとき用。
     全員を左端に置くと不自然なので、画面のあちこちに散らして「すでに走っている」ことにする。 */
  function syncAll(ids) {
    laneSlots.fill(null);
    ids.forEach(spawn);
    laneSlots.forEach(s => { if (s) s.x = Math.random() * Math.max(320, lastW * 0.85); });
  }
  function onShake() { shakeUntil = performance.now() + 900; }

  /* ---------------- 砂ぼこり ---------------- */
  function puff(x, y, col) {
    for (let i = 0; i < 4; i++) {
      dust.push({
        x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 3,
        vx: -50 - Math.random() * 60, vy: -8 - Math.random() * 26,
        life: 300 + Math.random() * 200, age: 0, col,
      });
    }
  }
  /* 足が着いた場所に出る、地面の波紋。
     8本のレーンで同時に拍が来ると波紋がそろって光り、
     「いま全員が同じ拍を踏んでいる」ことが目で分かる。 */
  const ripples = [];
  function updateRipples(dt) {
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.age += dt;
      if (r.age >= r.life) ripples.splice(i, 1);
    }
  }
  function drawRipples(ctx, scale) {
    ripples.forEach(r => {
      const t = r.age / r.life;
      const rad = (6 + t * 46) * (scale / 4);
      // 波紋はレーン３の主役なので、はっきり見える濃さにする
      ctx.globalAlpha = (1 - t) * (1 - t) * 0.85;
      ctx.strokeStyle = r.col;
      ctx.lineWidth = Math.max(1.5, scale * 0.55 * (1 - t) + 0.5);
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, rad, Math.max(2, rad * 0.24), 0, 0, Math.PI * 2);
      ctx.stroke();
      // 着地の一瞬だけ、足元に光の点を置く
      if (t < 0.22) {
        ctx.globalAlpha = (1 - t / 0.22) * 0.75;
        ctx.fillStyle = r.col;
        const s = Math.max(2, scale * 0.9);
        ctx.fillRect(Math.round(r.x - s / 2), Math.round(r.y - s / 2), s, s);
      }
    });
    ctx.globalAlpha = 1;
  }

  function updateDust(dt) {
    for (let i = dust.length - 1; i >= 0; i--) {
      const p = dust[i];
      p.age += dt;
      if (p.age >= p.life) { dust.splice(i, 1); continue; }
      p.x += p.vx * dt / 1000;
      p.y += p.vy * dt / 1000;
      p.vy += 30 * dt / 1000;                   // ゆるく落ちる
    }
  }

  /* ---------------- 背景の各層 ---------------- */
  /* 空のグラデーションは毎フレーム作り直すと重いので、
     サイズか世界が変わったときだけ作り直して使い回す。 */
  let skyCache = null, skyKey = '';
  let glowCache = null, glowKey = '';
  let vignette = null, vignetteKey = '';
  function drawSky(ctx, w, h, sc) {
    const key = `${w}x${h}|${sc.sky[0]}`;
    if (skyKey !== key) {
      skyCache = ctx.createLinearGradient(0, 0, 0, h);
      skyCache.addColorStop(0, sc.sky[0]);
      skyCache.addColorStop(1, sc.sky[1]);
      skyKey = key;
    }
    ctx.fillStyle = skyCache;
    ctx.fillRect(0, 0, w, h);

    /* 地平線の光。単調な紺一色だと「テスト画面」に見えるので、
       画面下側に暖色の光をうっすら重ねて、時間帯のある空気にする。 */
    const gk = `${w}x${h}|${sc.glow}`;
    if (glowKey !== gk) {
      glowCache = ctx.createLinearGradient(0, h * 0.45, 0, h);
      glowCache.addColorStop(0, 'rgba(0,0,0,0)');
      glowCache.addColorStop(1, sc.glow);
      glowKey = gk;
    }
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = glowCache;
    ctx.fillRect(0, Math.round(h * 0.45), w, Math.round(h * 0.55));
    ctx.globalAlpha = 1;
  }

  /* 各レーンの地平線に置く遠い丘。
     画面全体に1つ大きな山脈を置くとレーンをまたいで切れて見えたので、
     「レーンごとに、その足場の奥に小さな丘がある」形にした。
     地面よりゆっくり流すことで、1本のレーンの中にも奥行きが出る。 */
  function drawLaneHills(ctx, w, groundY, laneH, sc, laneIndex) {
    /* レーンごとに稜線の形と間隔を変える。全部同じ形だと
       8段に同じ絵が並んで「模様」に見えてしまうため。 */
    const span = 150 + (laneIndex % 4) * 46;
    const peak = laneH * (0.22 + ((laneIndex * 7) % 5) * 0.035);
    const a = 0.22 + ((laneIndex * 3) % 4) * 0.11;
    const b = 0.62 + ((laneIndex * 5) % 3) * 0.09;
    const start = -((scrollFar * 0.16 + laneIndex * 57) % span) - span;
    ctx.fillStyle = sc.far;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(start, groundY);
    for (let x = start; x < w + span; x += span) {
      ctx.lineTo(x + span * a, groundY - peak);
      ctx.lineTo(x + span * 0.5, groundY - peak * 0.35);
      ctx.lineTo(x + span * b, groundY - peak * 0.85);
      ctx.lineTo(x + span, groundY - peak * 0.15);
    }
    ctx.lineTo(w + span, groundY);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* 足場の上を流れていく小物（草・岩）。
     地面と同じ速さで流れることで「自分が進んでいる」感じが強くなる。
     キャラより奥に描くので、走者の前を横切ることはない。 */
  function drawProps(ctx, w, groundY, laneH, sc, laneIndex) {
    const span = 260;
    const off = (scrollGround * 1.0 + laneIndex * 91) % span;
    const unit = Math.max(3, laneH * 0.06);
    // 遠景と同じ色だと地面に沈んで見えないので、明るい側の色を使う
    ctx.fillStyle = sc.mid;
    ctx.globalAlpha = 0.75;
    for (let x = -off; x < w + span; x += span) {
      // 岩
      ctx.fillRect(Math.round(x), Math.round(groundY - unit), unit * 2, unit);
      ctx.fillRect(Math.round(x + unit * 0.5), Math.round(groundY - unit * 1.6), unit, unit * 0.6);
      // 草の束
      const gx = x + span * 0.45 + (laneIndex % 3) * 22;
      ctx.fillRect(Math.round(gx), Math.round(groundY - unit * 1.2), 2, unit * 1.2);
      ctx.fillRect(Math.round(gx + 4), Math.round(groundY - unit * 1.8), 2, unit * 1.8);
      ctx.fillRect(Math.round(gx + 8), Math.round(groundY - unit), 2, unit);
    }
    ctx.globalAlpha = 1;
  }

  /* 雲。以前はただの横長の長方形で「板」に見えたので、
     大小のブロックを積んだ入道雲の形にして、上側に光を当てた。 */
  /* 雲：ブロックを積むと「棚」に見えたので、丸いかたまりを重ねた積雲にした。
     [中心x, 半径] の並び（単位は雲の基準サイズ）。 */
  const CLOUD_SHAPES = [
    [[0.0, 0.55], [0.8, 0.85], [1.7, 0.62], [2.4, 0.42]],
    [[0.0, 0.45], [0.7, 0.62], [1.35, 0.4]],
    [[0.0, 0.5], [0.75, 0.95], [1.7, 0.7], [2.6, 0.95], [3.5, 0.5]],
  ];
  function drawClouds(ctx, w, h, sc) {
    const span = 320;
    const unit = Math.max(16, h * 0.03);
    const start = -((scrollMid * 0.3) % span) - span;
    let n = 0;
    for (let x = start; x < w + span; x += span) {
      const shape = CLOUD_SHAPES[n % CLOUD_SHAPES.length];
      const baseY = h * (0.08 + (n % 3) * 0.05);
      n++;
      // 本体
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = sc.mid;
      ctx.beginPath();
      shape.forEach(([ox, r]) => {
        ctx.moveTo(x + ox * unit + r * unit, baseY);
        ctx.arc(x + ox * unit, baseY, r * unit, 0, Math.PI * 2);
      });
      ctx.fill();
      // 底を平らに切って、積雲らしい水平な底面をつくる
      ctx.globalAlpha = 1;
      // 上側の光
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = sc.glow;
      ctx.beginPath();
      shape.forEach(([ox, r]) => {
        ctx.moveTo(x + ox * unit + r * unit * 0.8, baseY - r * unit * 0.3);
        ctx.arc(x + ox * unit, baseY - r * unit * 0.3, r * unit * 0.8, Math.PI, Math.PI * 2);
      });
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* 遠くを横切る鳥。数は少なく、ゆっくり。
     ときどき視界を横切るものがあるだけで、風景が「生きている」ように見える。 */
  const birds = [];
  function updateBirds(dt, w, h) {
    if (birds.length < 3 && Math.random() < dt / 2600) {
      birds.push({
        x: w + 30,
        y: h * (0.05 + Math.random() * 0.28),
        sp: 26 + Math.random() * 26,
        ph: Math.random() * 6,
        sz: 2 + Math.round(Math.random() * 2),
      });
    }
    for (let i = birds.length - 1; i >= 0; i--) {
      const b = birds[i];
      b.x -= b.sp * dt / 1000;
      b.ph += dt / 150;
      if (b.x < -40) birds.splice(i, 1);
    }
  }
  function drawBirds(ctx, sc) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = sc.far;
    birds.forEach(b => {
      const flap = Math.sin(b.ph) > 0 ? 1 : 0;   // 2コマのはばたき
      const x = Math.round(b.x), y = Math.round(b.y), s = b.sz;
      ctx.fillRect(x, y, s, s);
      ctx.fillRect(x - s * 2, y - flap * s, s * 2, s);
      ctx.fillRect(x + s, y - flap * s, s * 2, s);
    });
    ctx.globalAlpha = 1;
  }

  /* テンポに同期した縦の小節線 */
  function drawBarLines(ctx, w, h, sc) {
    const bw = barWidth();
    ctx.strokeStyle = sc.accent;
    ctx.globalAlpha = 0.13;
    ctx.lineWidth = 2;
    for (let x = -((scrollBar) % bw); x < w + bw; x += bw) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- 本体 ---------------- */
  /* 拍の進みぶんだけ、走者も背景も動かす。
     「1秒に何px」ではなく「1拍に何ドット」で考えるのが走るレーン３の要。 */
  let prevBeats = null;
  function update(dt) {
    virtualBeats += (bpm() / 60) * dt / 1000;
    const beats = beatsNow();
    if (prevBeats === null) prevBeats = beats;
    let dBeats = beats - prevBeats;
    // 曲を止めた・巻き戻した等で逆行したら、その回は動かさない
    if (!(dBeats >= 0) || dBeats > 1) dBeats = 0;
    prevBeats = beats;

    const bgSp = bgSpeedPxPerBeat() * dBeats;
    scrollFar += bgSp; scrollMid += bgSp; scrollGround += bgSp; scrollBar += bgSp;

    for (let i = 0; i < laneSlots.length; i++) {
      const s = laneSlots[i];
      if (!s) continue;
      const g = gaitOf(s.roleKey);
      s.x += g.steps * g.stride * lastScale * dBeats;   // 歩数×歩幅ぶんだけ進む
      if (s.x > lastW + 90) {
        if (s.phase === 'exiting') { laneSlots[i] = null; continue; }
        s.x = -80;                              // 走り続けるキャラは左からループ
      }
    }
    updateDust(dt);
    updateRipples(dt);
  }

  function render(ctx, w, h, now, dt) {
    lastW = w; lastH = h;
    const sc = scene();
    const S = window.RunnerSprites;

    update(dt);

    drawSky(ctx, w, h, sc);
    drawClouds(ctx, w, h, sc);
    updateBirds(dt, w, h);
    drawBirds(ctx, sc);
    drawBarLines(ctx, w, h, sc);

    const laneH = h / LANE_COUNT;
    /* スプライトはレーンに収まる最大の整数倍にする（ドット絵は整数倍でないと崩れる）。
       24ドットの枠のうち下2ドットは空きなので、実際に絵がある22ドットで
       割ることで、同じレーン高でも一段大きく表示できる。 */
    const CONTENT_H = 22;
    const scale = Math.max(2, Math.floor((laneH * 0.88) / CONTENT_H));
    lastScale = scale;                 // 拍→pxの換算に使う（update より前に確定させる）
    const spriteH = S.SPRITE_H * scale;
    const spriteW = S.SPRITE_W * scale;

    ctx.imageSmoothingEnabled = false;

    for (let i = 0; i < LANE_COUNT; i++) {
      const top = i * laneH;
      /* 足元の線の位置。キャラの高さ(CONTENT_H*scale)より下に置かないと
         頭が上のレーンへはみ出すので、スプライトが必ず収まる位置に決める。 */
      const groundY = Math.max(top + laneH * 0.84, top + CONTENT_H * scale + 2);

      /* 大地の帯。
         以前は細い線だけだったので走者が宙に浮いて見えた。
         「明るい縁 → 土の本体」の2段で、走る足場だとはっきり分かる形にする。 */
      const landTop = Math.round(groundY);
      const landBottom = Math.round(top + laneH);

      // その足場の奥にある丘 → その手前に立つ小物（どちらも地面より奥）
      drawLaneHills(ctx, w, landTop, laneH, sc, i);
      drawProps(ctx, w, landTop, laneH, sc, i);

      // 大地の本体。空よりはっきり暗くして「土の塊」に見せる
      ctx.fillStyle = sc.ground;
      ctx.fillRect(0, landTop, w, landBottom - landTop);
      ctx.globalAlpha = 0.30 + 0.22 * (i / (LANE_COUNT - 1)); // 手前ほど濃い土
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, landTop, w, landBottom - landTop);
      ctx.globalAlpha = 1;

      /* 地面の縁（陽の当たる線）。ここに足が乗る。
         上のレーンほど淡くして、奥に行くほど霞む空気遠近をつくる。 */
      const depth = 0.45 + 0.55 * (i / (LANE_COUNT - 1));   // 上=0.45 下=1.0
      /* 走るレーン３では、この縁が拍に合わせて明滅する。
         小節の頭（4拍に1回）はさらに強く光り、曲の拍子が目で分かる。 */
      const inBeat = ((beatsNow() % 1) + 1) % 1;
      const inBar  = ((beatsNow() % 4) + 4) % 4;
      const beatPulse = Math.max(0, 1 - inBeat * 3.2);
      const barPulse  = Math.max(0, 1 - inBar * 2.2);
      ctx.globalAlpha = Math.min(1, 0.34 + 0.46 * depth + beatPulse * 0.22 + barPulse * 0.3);
      ctx.fillStyle = barPulse > 0.35 ? sc.glow : sc.accent;
      ctx.fillRect(0, landTop, w, Math.max(2, Math.round(laneH * (0.022 + barPulse * 0.012))));
      ctx.globalAlpha = 1;

      /* 大地の下端に影の線を入れて、次のレーンの空とはっきり切る。
         これが無いと、暖色系の世界（ファンク等）でレーンの境目が溶けて見えなくなる。 */
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, landBottom - Math.max(2, Math.round(laneH * 0.02)), w, Math.max(2, Math.round(laneH * 0.02)));
      ctx.globalAlpha = 1;

      // 地面の粒（流れることで速さが伝わる）
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = sc.accent;
      const step = 78;
      const off = (scrollGround * (0.9 + i * 0.03)) % step;
      const grainY = landTop + Math.max(5, laneH * 0.05);
      for (let x = -off; x < w; x += step) {
        ctx.fillRect(Math.round(x), Math.round(grainY), 5, 2);
        ctx.fillRect(Math.round(x + 34), Math.round(grainY + laneH * 0.03), 3, 2);
      }
      ctx.globalAlpha = 1;

      const s = laneSlots[i];
      if (!s) continue;

      /* ★走るレーン３の肝：コマを「進んだ距離」ではなく「拍」から決める。
         6コマで2歩ぶんなので、1コマの長さは 1/(3×歩数/拍) 拍。
         +1 しているのは、拍のちょうど頭を「接地のコマ(1)」に合わせるため。
         こうすると足が着く瞬間が必ず拍と一致する。 */
      const g = gaitOf(s.roleKey);
      const beats = beatsNow();
      s.frame = (Math.floor(beats * 3 * g.steps) + 1) % S.FRAME_COUNT;
      if (s.frame !== s.prevFrame) {
        // 沈み込みのコマ（1と4）＝接地。砂ぼこりと地面の波紋を出す
        if (s.frame === 1 || s.frame === 4) {
          const col = S.PALETTES[s.charKey] ? S.PALETTES[s.charKey].d : '#888';
          puff(s.x + spriteW * 0.45, groundY + 1, col);
          ripples.push({ x: s.x + spriteW * 0.45, y: groundY, age: 0, life: 380,
                         col: S.PALETTES[s.charKey] ? S.PALETTES[s.charKey].k : '#fff' });
        }
        s.prevFrame = s.frame;
      }

      const spriteY = groundY - CONTENT_H * scale;   // 足の底が地面の縁に乗る位置

      // 影：接地しているほど濃く小さい（浮遊感を消すため濃いめに）
      const bobness = (s.frame === 1 || s.frame === 4) ? 1 : 0.75;
      ctx.globalAlpha = 0.42 * bobness;
      ctx.fillStyle = '#000000';
      const shw = spriteW * 0.42 * bobness;
      ctx.beginPath();
      ctx.ellipse(s.x + spriteW * 0.45, groundY + 1, shw, Math.max(2, scale * 1.2), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      /* 残像は入れてみたが、スプライトが小さいと「2体いる」ようにしか見えず
         かえって濁ったので、うっすら1枚・ごく近くに置くだけにした。 */
      ctx.globalAlpha = s.phase === 'exiting' ? 0.05 : 0.09;
      S.drawRunner(ctx, s.x - spriteW * 0.16, spriteY, scale, s.charKey, (s.frame + 5) % 6, now);
      ctx.globalAlpha = 1;

      ctx.globalAlpha = s.phase === 'exiting' ? 0.85 : 1;
      S.drawRunner(ctx, s.x, spriteY, scale, s.charKey, s.frame, now);
      ctx.globalAlpha = 1;
    }

    drawRipples(ctx, scale);

    // 砂ぼこり
    dust.forEach(p => {
      const a = 1 - p.age / p.life;
      ctx.globalAlpha = a * 0.85;                 // 砂ぼこりが見えなかったので濃く・大きく
      ctx.fillStyle = p.col;
      const sz = Math.max(3, Math.round(scale * 1.4 * a + 2));
      ctx.fillRect(Math.round(p.x), Math.round(p.y), sz, sz);
    });
    ctx.globalAlpha = 1;

    /* 周辺減光。四隅をわずかに落とすと、中央の走者に目が行く。 */
    if (vignetteKey !== `${w}x${h}`) {
      vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
      vignetteKey = `${w}x${h}`;
    }
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    // ゆらぎ
    if (now < shakeUntil) {
      ctx.globalAlpha = 0.10 * ((shakeUntil - now) / 900);
      ctx.fillStyle = sc.accent;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  window.Lanes3 = {
    spawn, exit, syncAll, render, onShake, LANE_COUNT,
    _slots: () => laneSlots,   // 動作確認用の覗き口
  };
})();
