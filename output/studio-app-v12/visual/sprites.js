/* =====================================================================
   sprites.js — 「走るレーン２」用の本気のドット絵ランナー
   ---------------------------------------------------------------------
   ゲームボーイのゼルダのような「少ないコマ数でも生きて見える」走りを狙う。

   設計の要点：
   ・パーツ合成（頭・胴・脚・腕）ではなく、"紙人形"方式で
     脚6コマ・腕6コマを重ねる。コマ0〜2を手で描き、コマ3〜5は
     近い脚(b)と遠い脚(d)の色を入れ替えて自動生成する
     （走行サイクルは半周期で左右が入れ替わるだけ、という性質を使う）。
   ・体の上下動(bob)・前傾(lean)はコマごとに決め打ち。
   ・マフラーは時間で揺れる「二次モーション」として別に描く。
     脚のコマと独立して揺れることで、生き物らしさが出る。
   ・1文字＝1ドット。o=輪郭 b=近い側 d=遠い側 l=ハイライト
     k=差し色 e=瞳 w=瞳のハイライト s=白目/牙など明色
   ===================================================================== */
(function () {
  'use strict';

  /* ---------------- 性格ごとのパレット ---------------- */
  const PALETTES = {
    core:  { o: '#20222c', b: '#b9c2d2', d: '#7d8696', l: '#e4eaf3', k: '#7de3ff', s: '#f2f5fa' },
    sing:  { o: '#12303f', b: '#5ec8f0', d: '#3a8cb0', l: '#a9e8ff', k: '#ffd166', s: '#fff6e0' },
    push:  { o: '#3a1a0c', b: '#e0793f', d: '#a1512a', l: '#ffb27a', k: '#ffe08a', s: '#fff2d8' },
    drive: { o: '#16331a', b: '#79c96b', d: '#4d8f45', l: '#b6ecaa', k: '#f2ff8a', s: '#f4ffe8' },
    color: { o: '#3a1236', b: '#e069c9', d: '#a03d8d', l: '#ffb0ec', k: '#ffe27a', s: '#fff0fb' },
  };

  /* ---------------- 頭（10x8）。性格ごとに輪郭を変える ----------------
     胴を細くして腕を外に出すため、頭も一回り小さくして頭身を整えた。 */
  const HEADS = {
    core: [
      '..oooooo..',
      '.obbllbbo.',
      'obblbbbbbo',
      'obllbbwebo',
      'obbbbbeebo',
      'obbbbbbbbo',
      '.obbbbbbo.',
      '..oooooo..',
    ],
    sing: [
      '...oooo...',
      '.okbbbbko.',
      'obblbbbbbo',
      'obllbbwebo',
      'obbbbbeebk',
      'obbbbbbbkk',
      '.obbbbbbo.',
      '..oooooo..',
    ],
    push: [
      'oo......oo',
      '.oobbbboo.',
      'obblbbbbbo',
      'obllbbwebo',
      'obbbbbeebo',
      'obbssbbbbo',
      '.obbbbbbo.',
      '..oooooo..',
    ],
    drive: [
      '.o......o.',
      '..o....o..',
      'obblbbbbbo',
      'obllbweeeo',
      'obbbbeeeeo',
      'obbbbbbbbo',
      '.obbbbbbo.',
      '..oooooo..',
    ],
    color: [
      '.o......o.',
      '.ok....ko.',
      'obblbbbbbo',
      'obllbbwebo',
      'obbbbbeebo',
      'obbbbbbbbo',
      '.obbbbbbo.',
      '..oooooo..',
    ],
  };

  /* ---------------- 胴（6x7）----------------
     以前は10幅もあり、腕がすべて胴に隠れてしまっていた。
     細くして肩から先を必ず外に出す。

     さらに、全員が同じ体型だと「頭だけ違う同じ人」に見えてしまうので、
     性格ごとに体つきを変える：
       岩=角ばった塊 / 獣=いかり肩 / 虫=細身 / 鳥・蝶=標準 */
  const TORSOS = {
    core: [
      'oooooo',
      'obllbo',
      'obbbbo',
      'okkkko',
      'obbbbo',
      'obdbbo',
      'oooooo',
    ],
    push: [
      'oooooo',
      'obllbo',
      'obbbbo',
      'okkkko',
      'obbbbo',
      'obdbbo',
      '.oooo.',
    ],
    drive: [
      '.oooo.',
      '.obbo.',
      '.obbo.',
      '.okko.',
      '.obbo.',
      '.obdo.',
      '..oo..',
    ],
    default: [
      '.oooo.',
      'obllbo',
      'obbbbo',
      'okkkko',
      'obbbbo',
      'obdbbo',
      '.oooo.',
    ],
  };

  /* ---------------- 脚：6コマすべてを手で描く（12x7）----------------
     0=接地 1=沈み込み 2=蹴り出し／3〜5はその反対の足。

     ★以前は3〜5をb↔dの色入れ替えだけで作っていた。物理的には正しいが、
       横から見ると前半と後半のシルエットが完全に同じになり、
       「3コマの動きを2回くり返している」ようにしか見えなかった。
       後半は脚の伸び方・開き方を少し変えて、6コマぶんの変化を出す。 */
  const LEGS = [
    [ // 0 接地（近い脚が前へ伸びる）
      '...dddbbb...',
      '..ddd..bbb..',
      '..dd....bbb.',
      '.ddd.....bb.',
      '.dd......bbb',
      'ddd.......bb',
      'ooo.......oo',
    ],
    [ // 1 沈み込み（両脚が体の下でたたまれる）
      '...dddbbb...',
      '...dddbbb...',
      '..ddd.bbb...',
      '..ddd..bbb..',
      '.ddd...bbb..',
      '.ddd...bbb..',
      'ooo....ooo..',
    ],
    [ // 2 蹴り出し（近い脚が後ろへ伸び、遠い脚は膝が上がる）
      '....bbbddd..',
      '...bbb..ddd.',
      '..bbb....ddd',
      '.bbb....ddd.',
      '.bb....ddd..',
      'bbb...ddd...',
      'ooo...ooo...',
    ],
    [ // 3 接地（反対の足。0より開きをやや浅くして変化をつける）
      '...bbbddd...',
      '..bbb..ddd..',
      '.bbb....ddd.',
      '.bb......ddd',
      'bbb.......dd',
      'bb........dd',
      'ooo.......oo',
    ],
    [ // 4 沈み込み（反対の足。1より少しだけ前寄り）
      '...bbbddd...',
      '...bbbddd...',
      '...bbb.ddd..',
      '..bbb...ddd.',
      '..bbb...ddd.',
      '.bbb....ddd.',
      '.ooo....ooo.',
    ],
    [ // 5 蹴り出し（反対の足）
      '....dddbbb..',
      '...ddd..bbb.',
      '..ddd....bbb',
      '.ddd....bbb.',
      '.dd....bbb..',
      'ddd...bbb...',
      'ooo...ooo...',
    ],
  ];

  /* ---------------- 腕：コマ0〜2（16x6）。脚と逆位相 ----------------
     胴（スプライトx=4〜13）の外まで振り出さないと、胴に隠れて腕が見えない。
     肩をstrip6〜9（＝スプライトx7〜10）に置き、手はstrip2〜3／13〜14まで届かせる。 */
  /* 走りの腕は「前の腕＝肘を曲げて胸の高さ」「後ろの腕＝伸ばして斜め下」。
     以前は左右に水平に開くだけで案山子のように見えたので、
     前後で長さも高さも変えて、非対称な走りの腕にした。 */
  const ARMS = [
    [ // 0 近い腕は後ろ（伸びる）、遠い腕は前（曲げる）
      '.....bb..dd.....',
      '....bb....ddd...',
      '...bb.....ddd...',
      '..bb............',
      '..bb............',
      '................',
    ],
    [ // 1 両腕とも体の横（沈み込み）
      '.....bb..dd.....',
      '.....bb...dd....',
      '....bb....dd....',
      '....bb....dd....',
      '................',
      '................',
    ],
    [ // 2 近い腕が前（曲げる）、遠い腕が後ろ（伸びる）
      '.....dd..bb.....',
      '....dd....bbb...',
      '...dd.....bbb...',
      '..dd............',
      '..dd............',
      '................',
    ],
  ];

  /* コマごとの体の上下動と前傾（ドット単位）。
     0が一番高く、2が一番沈む。負にすると頭が上に見切れるので常に0以上にする。 */
  const FRAME_BOB  = [1, 2, 0, 1, 2, 0]; // 接地→沈み込み→蹴り出しで浮く
  const FRAME_LEAN = [1, 0, 1, 1, 0, 1]; // 走行中はわずかに前へ

  /* 合成後のスプライト寸法（ドット） */
  const SPRITE_W = 18;
  const SPRITE_H = 24;

  /* パーツの配置（左上ドット座標、bob=0のとき） */
  const POS = {
    head:  { x: 4,  y: 0 },   // 10幅 → x4〜13
    torso: { x: 6,  y: 8 },   // 6幅  → x6〜11（腕が外に出るよう細く）
    arms:  { x: 1,  y: 9 },   // 16幅 → x1〜16
    legs:  { x: 3,  y: 15 },  // 12幅 → x3〜14
  };

  function swapNearFar(rows) {
    return rows.map(r => r.replace(/[bd]/g, c => (c === 'b' ? 'd' : 'b')));
  }

  /* 6コマぶんの脚・腕を作る（後半は近/遠の入れ替え） */
  const LEG_FRAMES = LEGS;                    // 脚は6コマとも手描き
  const ARM_FRAMES = [...ARMS, ...ARMS.map(swapNearFar)];

  function blit(target, rows, ox, oy, onlyChars) {
    rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        const ch = row[rx];
        if (ch === '.' || ch === ' ') continue;
        if (onlyChars && onlyChars.indexOf(ch) === -1) continue;
        const x = ox + rx, y = oy + ry;
        if (x < 0 || y < 0 || x >= SPRITE_W || y >= SPRITE_H) continue;
        target[y][x] = ch;
      }
    });
  }

  /* 1コマぶんの「文字グリッド」を組み立てる */
  function buildGrid(charKey, frame) {
    const grid = [];
    for (let y = 0; y < SPRITE_H; y++) grid.push(new Array(SPRITE_W).fill('.'));

    const lean = FRAME_LEAN[frame];
    const bob = FRAME_BOB[frame];

    /* 奥→手前の順に重ねる。
       遠い側の腕(d)は胴の奥、近い側の腕(b)は胴の手前。
       これを分けないと、腕が胴に丸ごと隠れて「走っている」ように見えない。 */
    blit(grid, ARM_FRAMES[frame], POS.arms.x, POS.arms.y + bob, 'd');   // 奥の腕
    blit(grid, LEG_FRAMES[frame], POS.legs.x, POS.legs.y + bob);
    blit(grid, TORSOS[charKey] || TORSOS.default, POS.torso.x + lean, POS.torso.y + bob);
    blit(grid, HEADS[charKey] || HEADS.core, POS.head.x + lean, POS.head.y + bob);
    blit(grid, ARM_FRAMES[frame], POS.arms.x, POS.arms.y + bob, 'b');   // 手前の腕
    return grid;
  }

  /* ---------------- オフスクリーンにキャッシュ ----------------
     8人ぶんを毎フレーム1ドットずつ塗ると重いので、
     (性格, コマ, 拡大率) ごとに1回だけ描いて使い回す。 */
  const cache = new Map();

  function getSprite(charKey, frame, scale) {
    const key = `${charKey}|${frame}|${scale}`;
    let cv = cache.get(key);
    if (cv) return cv;

    const pal = PALETTES[charKey] || PALETTES.core;
    const grid = buildGrid(charKey, frame);
    cv = document.createElement('canvas');
    cv.width = SPRITE_W * scale;
    cv.height = SPRITE_H * scale;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;

    for (let y = 0; y < SPRITE_H; y++) {
      for (let x = 0; x < SPRITE_W; x++) {
        const ch = grid[y][x];
        if (ch === '.') continue;
        let col = pal[ch];
        if (ch === 'e') col = '#14161c';
        if (ch === 'w') col = '#ffffff';
        if (!col) continue;
        c.fillStyle = col;
        c.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    cache.set(key, cv);
    return cv;
  }

  /* ---------------- マフラー（二次モーション） ----------------
     コマではなく時間で揺れる。走行位相と少しずらすことで、
     体の動きに"遅れてついてくる"感じを出す。 */
  /* 首の後ろから短くたなびくマフラー。
     前回は長すぎ・振れ幅が大きすぎて「稲妻」に見えたので、
     4節・振れ幅±1ドット・後ろへ向かって細くなる形に作り直した。 */
  function drawScarf(ctx, x, y, scale, charKey, timeMs, frame) {
    const pal = PALETTES[charKey] || PALETTES.core;
    const bob = FRAME_BOB[frame];
    /* 腕は y9〜13 を大きく使うので、マフラーは首元(y8)に上げて衝突を避ける。
       ここが重なると、腕とマフラーが1つの塊に見えて走りが読み取れなくなる。 */
    const baseX = x + 6 * scale;              // 胴の左端（x6）に接する位置から後ろへ流す
    const baseY = y + (8 + bob) * scale;
    const t = timeMs / 1000;
    let py = baseY;
    for (let i = 0; i < 5; i++) {
      const px = baseX - (i + 1) * scale;
      // 隣の節との段差を最大1ドットに抑え、必ずつながって見えるようにする
      const target = baseY + Math.round(Math.sin(t * 10 - i * 0.85) * 1.2) * scale;
      py += Math.max(-scale, Math.min(scale, target - py));
      const thick = i < 3 ? 2 : 1;
      ctx.fillStyle = pal.k;
      ctx.fillRect(Math.round(px), Math.round(py), scale, thick * scale);
    }
  }

  /* ---------------- 蝶（color）の羽：はばたき ---------------- */
  function drawWings(ctx, x, y, scale, charKey, timeMs, frame) {
    if (charKey !== 'color') return;
    const pal = PALETTES.color;
    const t = timeMs / 1000;
    const flap = Math.abs(Math.sin(t * 7)) * 2;
    const bob = FRAME_BOB[frame];
    const wx = x + 2 * scale;
    const wy = y + (9 + bob) * scale;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = pal.l;
    ctx.fillRect(Math.round(wx - 2 * scale), Math.round(wy - flap * scale), 4 * scale, 3 * scale);
    ctx.fillStyle = pal.k;
    ctx.fillRect(Math.round(wx - 1 * scale), Math.round(wy - flap * scale + 3 * scale), 3 * scale, 2 * scale);
    ctx.globalAlpha = 1;
  }

  /* ---------------- 外向けの描画関数 ----------------
     (x, y) はスプライトの左上。scale は1ドットのpx数。 */
  function drawRunner(ctx, x, y, scale, charKey, frame, timeMs) {
    const sx = Math.round(x), sy = Math.round(y);
    /* マフラーは廃止した。腕の振りと同じ高さ・同じ方向に出るため、
       腕とマフラーが1つの黄色い塊に見えて「走り」が読み取れなくなったため。
       生き物らしさ（二次モーション）は、シーン側の砂ぼこり・残像で出す。 */
    drawWings(ctx, sx, sy, scale, charKey, timeMs, frame);
    const cv = getSprite(charKey, frame, scale);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cv, sx, sy);
  }

  /* ドット絵は行の長さがずれても静かに欠けるだけで気づけないので、
     期待幅つきで生データを公開しておき、ラボ側で機械的に検査する。 */
  const PARTS = {
    HEADS: { data: HEADS, width: 10, height: 8 },
    TORSO: { data: TORSOS, width: 6, height: 7 },
    LEGS:  { data: LEGS, width: 12, height: 7 },
    ARMS:  { data: ARMS, width: 16, height: 6 },
  };

  window.RunnerSprites = {
    PALETTES, SPRITE_W, SPRITE_H, PARTS,
    FRAME_COUNT: 6,
    getSprite, drawRunner, buildGrid,
  };
})();
