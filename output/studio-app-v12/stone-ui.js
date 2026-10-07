/* =====================================================================
   stone-ui.js（v5版） — 石パネルの画面配線
   ---------------------------------------------------------------------
   v4版との違い：個体識別をやめたことに伴い、「石の管理モーダル」
   （性格×役割の登録・レンジ幅の変更・重さの計測）を丸ごと削除した。
   石の重さはもう「どの石か」を当てるためではなく、「増えた/減った」の
   きっかけを拾うためだけに使う（app.jsのhandleStoneIncrease/Decrease/Empty
   が実際に何を鳴らすかを決める）。接続・シミュレーター・ログ・
   ランプ表示はv4のまま。
   ===================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);

  /* ---------------- 石パネル ---------------- */
  const connDot = $('stoneconn');
  const connLabel = $('stoneconnlabel');
  const weightEl = $('stoneweight');
  const logEl = $('stonelog');
  const readyDot = $('readydot');
  const readyLabel = $('readylabel');
  const globalReady = $('globalready');
  const globalReadyDot = $('globalreadydot');
  const globalReadyLabel = $('globalreadylabel');
  const lampScreen = $('lampscreen');
  const lampLabel = $('lamplabel');
  const lampSub = $('lampsub');

  function setConn(connected) {
    connDot.classList.toggle('on', connected);
    connDot.classList.toggle('off', !connected);
    connLabel.textContent = connected ? '接続中' : '未接続';
  }

  /* 「置いてよいタイミング」の画面表示。表示は「石に触れないで」
     「石を追加・除去可能」の二面のみ。石パネルの小さいランプ・
     グローバル表示・ランプ画面（拡大表示）の3箇所すべてで同じ文言に統一する。
     タイミングの制御（最低1.2秒＋安定するまで待つ）はstone-serial.js側の
     MIN_COOLDOWN_MS/STABILITY_BAND_G/MIN_STABLE_MSで行っている。 */
  function setReady(ready) {
    const label = ready ? '石を追加・除去可能' : '石に触れないで';

    readyDot.classList.toggle('on', ready);
    readyDot.classList.toggle('wait', !ready);
    readyLabel.textContent = label;

    globalReady.classList.toggle('on', ready);
    globalReady.classList.toggle('wait', !ready);
    globalReadyDot.classList.toggle('on', ready);
    globalReadyDot.classList.toggle('wait', !ready);
    globalReadyLabel.textContent = label;

    lampScreen.classList.toggle('ready', ready);
    lampLabel.textContent = label;
    lampSub.textContent = label;
  }

  function addLog(message, cls = '') {
    if (!message) return;
    const row = document.createElement('div');
    row.className = 'stone-log-row' + (cls ? ' ' + cls : '');
    const time = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    row.textContent = `[${time}] ${message}`;
    logEl.prepend(row);
    while (logEl.children.length > 40) logEl.removeChild(logEl.lastChild);
  }

  /* 誤差測定用：デスクトップ版のみ、ESP32接続中は生の値(raw)を自動でCSVに記録する。
     Web版（window.stoneDesktopが無い）では何もしない。 */
  const desktopLog = (typeof window !== 'undefined' && window.stoneDesktop) || null;

  StoneBridge.onEvent((evt) => {
    if (typeof evt.weightNow === 'number') {
      weightEl.textContent = evt.weightNow.toFixed(1);
    }
    if (evt.type === 'raw' && desktopLog) desktopLog.logRaw(evt.weightNow);
    switch (evt.type) {
      case 'connected':
        setConn(true); addLog(evt.message);
        if (desktopLog) desktopLog.logSessionStart();
        break;
      case 'disconnected':
        setConn(false); addLog(evt.message);
        if (desktopLog) desktopLog.logSessionEnd();
        break;
      case 'error': addLog(evt.message, 'err'); break;
      case 'spike-rejected': addLog(evt.message, 'err'); break;
      case 'baseline': addLog(evt.message); break;
      case 'increase': addLog(evt.message, 'place'); break;
      case 'decrease': addLog(evt.message, 'remove'); break;
      case 'empty': addLog(evt.message); break;
      case 'ready': setReady(true); break;
      case 'not-ready': setReady(false); break;
      default: break;
    }
  });

  if (!StoneBridge.isSupported()) {
    addLog('このブラウザは Web Serial API に対応していません。Chrome か Edge で開くと、ESP32に直接つなげます（手入力での検証は引き続き使えます）。', 'err');
  }

  $('stoneconnectbtn').addEventListener('click', async () => {
    try { await StoneBridge.connectSerial(); }
    catch (e) { addLog('接続に失敗しました: ' + e.message, 'err'); }
  });

  $('stoneretarebtn').addEventListener('click', () => {
    const now = StoneBridge.getStableWeight();
    StoneBridge.retare(now);
  });

  $('stonesimbtn').addEventListener('click', () => {
    const v = Number($('stonesim').value);
    if (!Number.isFinite(v)) { addLog('数値を入力してください', 'err'); return; }
    StoneBridge.simulateWeight(v);
  });
  $('stonesim').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('stonesimbtn').click();
  });

  /* ---------------- ランプ画面 ---------------- */
  $('lampscreenbtn').addEventListener('click', () => {
    lampScreen.classList.add('show');
  });
  $('lampclosebtn').addEventListener('click', () => {
    lampScreen.classList.remove('show');
  });
});
