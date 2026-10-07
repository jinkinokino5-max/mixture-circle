/* =====================================================================
   visual/overlay.js — 本体アプリの「ビジュアル」ボタン
   ---------------------------------------------------------------------
   デスクトップ版（Electron）でもブラウザ版でも、これが本番の入口になる。
   試作ページ（tools/visual-prototype）と違い、完成した2つだけを載せる：
     走るレーン３ … 足音が拍に着く。役割ごとに歩調がちがう
     走るレーン４ … 走るレーン３ ＋ 旅（草原→海→街→山）と時間（朝→夜）

   本体（app.js / engine.js / music.js）は一切書き換えない。
   State.parts と World.key を毎フレーム見て差分を取り、
   Lanes3 / Lanes4 に「増えた・減った」を伝えるだけ。
   ===================================================================== */
(function () {
  'use strict';

  let canvas, ctx, overlay, btn;
  let visible = false;
  let mode = 'lanes4';                 // 初期表示は旅する走るレーン４
  let lastT = 0;

  /* ---------------- 画面の組み立て ---------------- */
  function buildUI() {
    const style = document.createElement('style');
    style.textContent = `
      #vsOverlay{position:fixed;inset:0;z-index:99998;background:#05060a;display:none;}
      #vsOverlay.show{display:block;}
      #vsCanvas{display:block;}
      #vsCtrl{position:fixed;right:14px;top:14px;z-index:99999;display:flex;gap:8px;}
      #vsCtrl button{padding:9px 14px;background:#1a1f2bd9;color:#eef2f8;
        border:1px solid #333c4d;border-radius:8px;font:13px system-ui,sans-serif;cursor:pointer;}
      #vsCtrl button:hover{background:#26304099;}
      #vsCtrl button.on{background:#3a4a6bd9;border-color:#6fa8ff;}
    `;
    document.head.appendChild(style);

    /* ボタンはヘッダーの並び（一時停止／ミキサー／終了する）に混ぜて、
       本体のUIと同じ見た目になるようにする。見つからなければ右上に浮かせる。 */
    btn = document.createElement('button');
    btn.id = 'visualbtn';
    btn.textContent = 'ビジュアル';
    btn.title = '音の重なりを映像で見る';
    const stopBtn = document.getElementById('stopbtn');
    if (stopBtn && stopBtn.parentNode) {
      btn.className = stopBtn.className || 'minibtn';
      stopBtn.parentNode.insertBefore(btn, stopBtn);
    } else {
      btn.style.cssText = 'position:fixed;right:14px;top:14px;z-index:99997;padding:8px 14px;'
        + 'background:#1a1f2b;color:#eef2f8;border:1px solid #333c4d;border-radius:8px;'
        + 'font:13px system-ui,sans-serif;cursor:pointer;';
      document.body.appendChild(btn);
    }

    overlay = document.createElement('div');
    overlay.id = 'vsOverlay';
    overlay.innerHTML = `
      <canvas id="vsCanvas"></canvas>
      <div id="vsCtrl">
        <button id="vsL3">走るレーン３</button>
        <button id="vsL4" class="on">走るレーン４</button>
        <button id="vsClose">閉じる ×</button>
      </div>`;
    document.body.appendChild(overlay);

    canvas = document.getElementById('vsCanvas');
    ctx = canvas.getContext('2d');

    btn.addEventListener('click', show);
    document.getElementById('vsClose').addEventListener('click', hide);
    document.getElementById('vsL3').addEventListener('click', () => setMode('lanes3'));
    document.getElementById('vsL4').addEventListener('click', () => setMode('lanes4'));
    window.addEventListener('resize', resize);
    /* Escで閉じる。文字キーは本体が札の操作に使っているので割り当てない。 */
    window.addEventListener('keydown', (e) => { if (visible && e.key === 'Escape') hide(); });
    resize();
  }

  function setMode(m) {
    mode = m;
    document.getElementById('vsL3').classList.toggle('on', m === 'lanes3');
    document.getElementById('vsL4').classList.toggle('on', m === 'lanes4');
  }

  /* ドット絵は等倍で描かないとぼやけるので、
     devicePixelRatioを掛けた実ピクセル数でバッファを持つ。 */
  function resize() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
  }

  function show() {
    overlay.classList.add('show');
    visible = true;
    baselineSynced = false;      // 開いた時点で鳴っている音を「すでに走っている」扱いにする
    resize();
  }
  function hide() {
    overlay.classList.remove('show');
    visible = false;
  }

  /* ---------------- 本体の状態を見張る ---------------- */
  let lastPartIds = new Set();
  let lastWorldKey;
  let baselineSynced = false;

  function eachLane(fn) {
    if (window.Lanes3) fn(window.Lanes3);
    if (window.Lanes4) fn(window.Lanes4);
  }

  function syncBaseline() {
    if (typeof State === 'undefined') return;
    lastPartIds = new Set(State.parts.keys());
    lastWorldKey = (typeof World !== 'undefined') ? World.key : null;
    const ids = [...lastPartIds];
    eachLane(L => L.syncAll(ids));
    baselineSynced = true;
  }

  function poll() {
    if (typeof State === 'undefined') return;
    if (!baselineSynced) { syncBaseline(); return; }

    const cur = new Set(State.parts.keys());
    cur.forEach(id => { if (!lastPartIds.has(id)) eachLane(L => L.spawn(id)); });
    lastPartIds.forEach(id => { if (!cur.has(id)) eachLane(L => L.exit(id)); });
    lastPartIds = cur;

    if (typeof World !== 'undefined' && World.key !== lastWorldKey) lastWorldKey = World.key;
  }

  /* 「ゆらぎ」は一瞬のできごとで差分から拾えないので、関数を包んで捕まえる */
  function wrapShake() {
    if (typeof window.shakeSession !== 'function') return;
    const original = window.shakeSession;
    window.shakeSession = function () {
      original.apply(this, arguments);
      eachLane(L => L.onShake());
    };
  }

  /* ---------------- 毎フレーム ---------------- */
  let frameCount = 0, lastError = null;
  function frame(now) {
    const dt = Math.min(50, now - lastT || 16.7);
    lastT = now;
    frameCount++;

    /* 見張りか描画のどちらかで例外が出ても、ループ自体は止めない。
       止めてしまうと画面が固まったまま原因も分からなくなるため。 */
    try {
      poll();
      if (visible && ctx) {
        const L = (mode === 'lanes3') ? window.Lanes3 : window.Lanes4;
        if (L) L.render(ctx, canvas.width, canvas.height, now, dt);
      }
    } catch (e) {
      lastError = e;
    }
    requestAnimationFrame(frame);
  }

  document.addEventListener('DOMContentLoaded', () => {
    buildUI();
    wrapShake();
    requestAnimationFrame(frame);
  });

  /* 動作確認用の覗き口。ここが無いと、映像が出ないときに
     「見張りが動いていないのか、描画が止まっているのか」を切り分けられない。 */
  window.__visual = {
    state: () => ({
      visible, mode, baselineSynced,
      見ているid: [...lastPartIds],
      フレーム数: frameCount,
      直近のエラー: lastError && String(lastError),
    }),
  };
})();
