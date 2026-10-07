/* =====================================================================
   stone-serial.js — ESP32との接続、および「重さ→きっかけ」のパイプライン（v5）
   ---------------------------------------------------------------------
   v4までは「増えた分＝どの石か」をStoneMatcher.decide()でレジストリと
   照合し、石ごとに1対1で決まった音（insertCard(id)）を鳴らしていた。

   本人依頼（2026-09-01「重量変化を"特定の音のON/OFFスイッチ"ではなく
   "セッション全体をゆらす撹拌操作"として再定義する」）への対応で、v5では
   個体識別（どの石か）をやめ、**増えた/減った の二値**だけを見る。
   識別しないので、レンジ丸め・登録レジストリ・計測（登録用キャリブレー
   ション）は丸ごと不要になった——これは同時に、これまで悩んでいた
   「計測精度が安定しない」問題そのものを解消する（当てる対象が無くなる
   ため、当てる精度も要らなくなる）。

   データの流れ：
     重さが増えた → 'increase' を発行 → handleStoneIncrease()（app.js）が
       確率的に「札を1枚追加」「世界を変える」「揺らす」のどれかを行う
     重さが減った → 'decrease' を発行 → handleStoneDecrease()（app.js）が
       確率的に「札を1枚外す」「標準に戻す」「揺らす」のどれかを行う
     石が全部なくなった（基準の重さまで戻った） → 'empty' を発行 →
       handleStoneEmpty()（app.js）がセッションをリセットする

   「置いてよいタイミング」の判定（ランプ表示・クールダウン）と、
   ドリフト追従・異常値ガードは識別と無関係の話なので、v4のまま維持する。

   ハードウェア到着前でも試せるように、simulateWeight() で
   「シリアルから来た値」と同じ扱いの値を手入力できる。
   ===================================================================== */

const StoneBridge = (function () {
  let port = null;
  let reader = null;
  let keepReading = false;
  let lineBuf = '';

  /* ---- ESP32未校正の暫定補正（2026-09-01） ----
     esp32/stone_scale/stone_scale.ino の CALIBRATION_FACTOR が製作手順書§5-2の
     校正を経ないままプレースホルダー(420.0)だった。そのため2026-08-31〜09-01の
     実測ログは、本当のグラム数の約72倍（かつ符号反転）の値を"グラム"として
     扱っていたことが、本人が2つの石の実重量（5450→76.0g、17357→239g）を
     教えてくれたことで判明した。

     RAW_TO_GRAMS_FACTOR は最小二乗フィット（原点を通る比例関係と仮定）で算出：
       k = Σ(x·y) / Σ(x²) ≈ -0.013787
       （x=ESP32が今出している値、y=実際のグラム数）
     この値をESP32から届く値に毎回掛けてから、以降の処理（ノイズ除去・表示）
     はすべて「本当のグラム数」で行う。

     恒久対応としては、esp32/stone_scale/stone_scale.ino の CALIBRATION_FACTOR
     を 420 から 420 / (-0.013787) ≈ -30460 に書き換えて再度書き込むと、
     ESP32自身が最初から正しいグラム数を出すようになり、このPC側補正は
     不要になる（不要になった場合はRAW_TO_GRAMS_FACTORを1に戻すこと）。 */
  const RAW_TO_GRAMS_FACTOR = -0.013787;

  /* settleTrackerのnoiseThreshold(=「揺れ」とみなす幅)。 */
  let settleTracker = StoneMatcher.createSettleTracker({ stableMs: 300, noiseThreshold: 0.5 });
  let stableWeight = null;     // 直近の「確定した総重量」（g、センサーの生値）。null＝まだ基準ができていない
  let emptyBaseline = null;    // 「石が何もない」ときの基準重量（g）。最初の基準・retare()のたびに更新
  let wasEmpty = true;         // 直前の確定値が「空」判定だったか（'empty'の重複発火を防ぐ）

  const listeners = [];
  function emit(evt) { listeners.forEach(fn => { try { fn(evt); } catch (e) { console.error(e); } }); }
  function onEvent(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; }

  const config = {
    noiseThreshold: 3, // これ未満の差分はノイズとして無視する（g）。暫定値
  };

  /* ---- 異常値（センサー瞬断）のガード ----
     直前のまともな値から3000g以上飛んだ値はセンサー瞬断とみなして捨てる。
     ただし最初の1個自体が異常値だった場合に永久に復帰できなくならないよう、
     5回連続で弾いたら諦めて受け入れる安全弁を設ける。
     絶対値そのものが物理的にありえない大きさ（ABSOLUTE_SANITY_LIMIT_G超）は
     安全弁の対象外で、何回連続しても常に無視する。 */
  const MAX_PLAUSIBLE_STEP_G = 1000;
  const MAX_CONSECUTIVE_REJECTS = 5;
  const ABSOLUTE_SANITY_LIMIT_G = 6000; // 5kgロードセルの定格＋余裕
  let lastGoodRaw = null;
  let consecutiveRejects = 0;
  let spikeRejectedTotal = 0;

  /* ---- ドリフト追従型の基準値（Holt法：水準＋速度の二重指数平滑） ----
     基準の「今の値(driftLevel)」に加えて「今の変化速度(driftTrend, g/ms)」も
     同時に推定し、次の値が来る前に「このくらい動いているはず」を先読みで
     予測してから比較する。増えた/減ったを検出したときは水準だけをその瞬間の
     値に確定し、速度推定はそのまま引き継ぐ（重さの増減はドリフトの物理現象
     とは無関係なので、速度推定を乱さない）。 */
  const LEVEL_ALPHA = 0.3;  // 水準の追従の速さ
  const TREND_BETA = 0.1;   // 速度推定の追従の速さ（水準より慎重に）
  let driftTrend = 0;       // 現在の推定ドリフト速度（g/ms）
  let lastUpdateT = null;   // 直近に基準を更新した時刻（ms）

  /* 現在時刻tにおける「ドリフトだけを見込んだ予測値」を返す */
  function predictBaseline(t) {
    if (stableWeight === null || lastUpdateT === null) return stableWeight;
    return stableWeight + driftTrend * (t - lastUpdateT);
  }

  /* ---- 「置いてよいタイミング」の判定（案A：画面表示） ----
     固定時間ではなく、生の値を継続的に見て「STABILITY_BAND_G以内の揺れが
     MIN_STABLE_MSだけ続いたら本当に収まった」と判定する。値が動くたびに
     判定をやり直す（揺れが続く限り待ち続ける）。万一いつまでも収まらない
     場合に備え、MAX_COOLDOWN_MSで強制的に準備完了扱いにする安全弁を設ける。
     checkReadyTransitionは生の値のたびに呼ぶ（settleTrackerの確定値
     ストリームは「動かないと通知しない」重複抑制があるため、石が完全に
     静止すると復帰できなくなる不具合が過去に見つかっているため）。 */
  const STABILITY_BAND_G = 2;    // これ以内の揺れなら「収まっている」とみなす
  const MIN_STABLE_MS = 500;     // この時間だけ収まり続けたら準備完了
  const MAX_COOLDOWN_MS = 5000;  // これだけ待っても収まらなければ諦めて準備完了扱いにする
  /* 置いたり除いたりした後の1.2秒は必ず「石に触れないで」表示にする。
     1.2秒経っても安定していなければ、そのまま表示を続ける（早く収まっても
     1.2秒未満では準備完了にしない）。1.2秒後は従来どおりSTABILITY_BAND_G・
     MIN_STABLE_MSの安定判定を満たすまで待ち続ける。 */
  const MIN_COOLDOWN_MS = 1200;
  let settling = null;           // null＝準備完了。{ anchor, anchorT, startT }＝揺れの収束待ち
  let isReadyState = true;

  function finishSettling() {
    settling = null;
    if (!isReadyState) {
      isReadyState = true;
      emit({ type: 'ready', message: '次の石を置いても大丈夫です' });
    }
  }

  function checkReadyTransition(value, t) {
    if (!settling) return;
    if (Math.abs(value - settling.anchor) > STABILITY_BAND_G) {
      // まだ揺れている。ここを新しい起点にして、収まったかどうかの判定をやり直す
      settling.anchor = value;
      settling.anchorT = t;
    } else if (t - settling.anchorT >= MIN_STABLE_MS && t - settling.startT >= MIN_COOLDOWN_MS) {
      // 安定していても、置いた/取った瞬間からMIN_COOLDOWN_MS未満なら準備完了にしない
      finishSettling();
      return;
    }
    if (t - settling.startT >= MAX_COOLDOWN_MS) {
      finishSettling(); // 安全弁：いつまでも収まらない場合は諦めて準備完了にする
    }
  }

  function startCooldown(value, t) {
    settling = { anchor: value, anchorT: t, startT: t };
    if (isReadyState) {
      isReadyState = false;
      emit({ type: 'not-ready', message: '重さが落ち着くまで少し待ってください…' });
    }
    // すでに準備中だった場合は、揺れの起点だけ更新して様子を見る
  }

  function isSupported() {
    return typeof navigator !== 'undefined' && !!navigator.serial;
  }

  /* 水準・速度をHolt法で更新するだけの共通処理（ノイズ／クールダウン中の
     残留揺れの両方で使う。識別はしない） */
  function updateDrift(value, t) {
    const predicted = predictBaseline(t);
    const dt = Math.max(t - lastUpdateT, 1);
    const newLevel = predicted + LEVEL_ALPHA * (value - predicted);
    const observedRate = (newLevel - stableWeight) / dt;
    driftTrend = driftTrend + TREND_BETA * (observedRate - driftTrend);
    stableWeight = newLevel;
    lastUpdateT = t;
    emit({ type: 'weight', weightNow: value });
  }

  /* 「石が全部なくなった（基準の重さまで戻った）」の検出。
     edge-trigger（空になった瞬間だけ）で'empty'を出す。 */
  function checkEmpty() {
    if (emptyBaseline === null || stableWeight === null) return;
    const nowEmpty = Math.abs(stableWeight - emptyBaseline) <= config.noiseThreshold;
    if (nowEmpty && !wasEmpty) {
      wasEmpty = true;
      emit({ type: 'empty', message: '石がすべて取り除かれました。リセットします' });
      if (typeof handleStoneEmpty === 'function') handleStoneEmpty();
    } else if (!nowEmpty && wasEmpty) {
      wasEmpty = false;
    }
  }

  /* ---- 値が1つ「確定」するたびに呼ばれる本体処理 ---- */
  function handleSettledWeight(value, t) {
    if (stableWeight === null) {
      // 接続直後の最初の1回は基準づくりだけ（この時点の重さを「今の総重量」とする）
      stableWeight = value;
      lastUpdateT = t;
      emptyBaseline = value;
      wasEmpty = true;
      emit({ type: 'baseline', weightNow: value, message: `基準の重さを ${value.toFixed(1)}g に設定しました` });
      return;
    }

    /* クールダウン中（settling !== null、＝ランプが『石に触れないで』の間）は、
       石が完全に静止しきっていない残留揺れの可能性があるため、この確定値を
       増えた/減ったの判定にかけない。noiseと同じ扱いで水準・速度だけを
       Holt法で追従させる。本当に安定して『置いてOK』に戻ってから来る
       次の確定値だけを、次の判定対象として扱う（前回分の残留影響が
       次回の判定に混入しないようにするため）。 */
    if (settling !== null) {
      updateDrift(value, t);
      checkEmpty();
      return;
    }

    // 素の値ではなく「速度も見込んだ予測値」との差分で判定する
    const predicted = predictBaseline(t);
    const delta = value - predicted;

    if (Math.abs(delta) < config.noiseThreshold) {
      // ドリフトの範囲内。水準・速度の両方をHolt法で更新する
      updateDrift(value, t);
      checkEmpty();
      return;
    }

    // 増えた/減った：水準だけをその瞬間の値に確定する。
    // 速度推定(driftTrend)はそのまま引き継ぐ（増減はドリフトと無関係なため）
    stableWeight = value;
    lastUpdateT = t;
    emit({ type: 'weight', weightNow: value });
    startCooldown(value, t);

    if (delta > 0) {
      emit({ type: 'increase', delta, message: `+${delta.toFixed(1)}g の変化がありました` });
      if (typeof handleStoneIncrease === 'function') handleStoneIncrease();
    } else {
      emit({ type: 'decrease', delta, message: `${delta.toFixed(1)}g の変化がありました` });
      if (typeof handleStoneDecrease === 'function') handleStoneDecrease();
    }

    checkEmpty();
  }

  /* ---- 生の値（グラム）を1件受け取るたびに呼ぶ共通の入口 ----
     serialの読み取りと simulateWeight() の両方がここを通る。
     異常値ガード → settleTracker の順で通す */
  function feedRawValue(value) {
    if (Math.abs(value) > ABSOLUTE_SANITY_LIMIT_G) {
      // 絶対値そのものが物理的にありえない大きさ。安全弁（give-up）の対象外で、
      // 何回連続しても常に無視する
      spikeRejectedTotal += 1;
      emit({ type: 'spike-rejected', message: `物理的にありえない異常値 ${value.toFixed(1)}g を無視しました（${spikeRejectedTotal}回目）` });
      return;
    }
    if (lastGoodRaw !== null
      && Math.abs(value - lastGoodRaw) > MAX_PLAUSIBLE_STEP_G
      && consecutiveRejects < MAX_CONSECUTIVE_REJECTS) {
      consecutiveRejects += 1;
      spikeRejectedTotal += 1;
      emit({ type: 'spike-rejected', message: `異常値 ${value.toFixed(1)}g を無視しました（${spikeRejectedTotal}回目）` });
      return;
    }
    consecutiveRejects = 0;
    lastGoodRaw = value;

    emit({ type: 'raw', weightNow: value });
    const now = performance.now();
    // 「置いてよいタイミング」の時間経過判定は、確定値ストリームではなく
    // 生の値のたびに見る（settleTrackerの確定値ストリームには重複抑制が
    // あるため、石が完全に静止すると復帰できなくなる不具合が過去にあった）
    checkReadyTransition(value, now);
    const settled = settleTracker.feed(value, now);
    if (settled !== null) {
      handleSettledWeight(settled, now);
    }
  }

  /* ---- シミュレーターモード：ハードウェアなしで検証する ---- */
  function simulateWeight(value) {
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    feedRawValue(v);
  }

  /* 現在の重さを「新しい基準（0点）＝石が何もない状態」として登録し直す。
     配線を組み替えた直後や、判定がずれてきたときのリセット用 */
  function retare(value) {
    stableWeight = typeof value === 'number' ? value : stableWeight;
    lastUpdateT = null; // 速度推定はここでは引き継がない。次の確定値から仕切り直す
    driftTrend = 0;
    settleTracker.reset();
    emptyBaseline = stableWeight;
    wasEmpty = true;
    settling = null;
    if (!isReadyState) { isReadyState = true; emit({ type: 'ready', message: '次の石を置いても大丈夫です' }); }
    emit({ type: 'baseline', weightNow: stableWeight, message: '基準の重さをリセットしました（台の上の石はいったん「なし」として扱います）' });
  }

  /* ---- Web Serial 接続 ---- */
  async function connectSerial({ baudRate = 115200 } = {}) {
    if (!isSupported()) throw new Error('このブラウザは Web Serial API に対応していません（Chrome / Edge を使ってください）');
    port = await navigator.serial.requestPort();
    await port.open({ baudRate });
    keepReading = true;
    emit({ type: 'connected', message: 'ESP32に接続しました' });
    readLoop(); // 非同期で開始（await しない）
  }

  async function readLoop() {
    const textDecoder = new TextDecoderStream();
    const readableClosed = port.readable.pipeTo(textDecoder.writable).catch(() => {});
    reader = textDecoder.readable.getReader();
    lineBuf = '';
    try {
      while (keepReading) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        lineBuf += value;
        let idx;
        while ((idx = lineBuf.indexOf('\n')) >= 0) {
          const line = lineBuf.slice(0, idx).trim();
          lineBuf = lineBuf.slice(idx + 1);
          if (!line) continue;
          const num = Number(line);
          // RAW_TO_GRAMS_FACTORはESP32の未校正出力にだけ掛ける。
          // simulateWeight()（手入力シミュレーター）は最初から本当のグラム数を
          // 入力する場所なので、ここでは補正しない
          if (Number.isFinite(num)) feedRawValue(num * RAW_TO_GRAMS_FACTOR);
          // 数値でない行（起動メッセージ等）は無視する
        }
      }
    } catch (e) {
      emit({ type: 'error', message: `シリアル読み取りエラー: ${e.message}` });
    } finally {
      try { reader.releaseLock(); } catch (e) {}
      await readableClosed;
    }
  }

  async function disconnect() {
    keepReading = false;
    try { if (reader) await reader.cancel(); } catch (e) {}
    try { if (port) await port.close(); } catch (e) {}
    port = null; reader = null;
    emit({ type: 'disconnected', message: 'ESP32との接続を切りました' });
  }

  return {
    isSupported, connectSerial, disconnect,
    simulateWeight, retare, onEvent,
    getStableWeight: () => stableWeight,
    isReady: () => isReadyState,
    setNoiseThreshold: (g) => { config.noiseThreshold = Number(g) || config.noiseThreshold; },
    getNoiseThreshold: () => config.noiseThreshold,
  };
})();

if (typeof window !== 'undefined') window.StoneBridge = StoneBridge;
