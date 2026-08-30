/* =====================================================================
   pitchcorrect.js — 自分の録音を、いまの世界の音階へ自動で寄せる（v11 で追加）
   ---------------------------------------------------------------------
   ここでやっているのは本物のスタジオのオートチューンではない。
   フレーズを一定間隔（フレーム）に区切り、各フレームの基本周波数を
   自己相関（YIN法の簡易版）で推定し、いまの世界の音階に一番近い音へ
   「粒（グレイン）ごと読み出す速さを変える」方式で寄せているだけ。
   フォルマント（声の質感）は保持しないので、寄せすぎると声質が変わるが、
   このアプリの目的（誰が歌っても音楽的に破綻しない）には十分。

   世界の音階は music.js の WORLDS[].prog の lad（メロディカードが使う
   「梯子」＝和音ごとの気持ちいい音の集合）をそのまま借りる。
   録音は和音の進行とは無関係に単独ループするので、進行全体の lad を
   まとめて「その世界で歌ってよい音」の集合として扱う。               */

/* ============ 1. いまの世界の音階（ピッチクラス集合） ============ */
function currentScalePCs() {
  const P = currentProg();
  const set = new Set();
  P.forEach(ch => ch.lad.forEach(s => set.add(((s % 12) + 12) % 12)));
  return [...set].sort((a, b) => a - b);
}

/* pc（0〜11） に一番近い、集合内のピッチクラスへの符号付き半音差を返す。
   例：pc=1（C#）, scale=[0,3,5,7,10] なら 0 のほうが近いので -1 を返す */
function nearestPcShift(pc, scalePcs) {
  let best = 0, bestDist = Infinity;
  scalePcs.forEach(target => {
    for (const cand of [target, target - 12, target + 12]) {
      const d = cand - pc;
      if (Math.abs(d) < Math.abs(bestDist)) { bestDist = d; best = cand; }
    }
  });
  return bestDist === Infinity ? 0 : bestDist;
}

/* ============ 2. ピッチ検出（YIN法の簡易版） ============
   window内の基本周波数を推定する。無声（子音・無音・パーカッシブ）な
   フレームは null を返し、そこは補正せずそのまま通す。               */
function detectPitchYin(frame, sampleRate, minFreq = 70, maxFreq = 900) {
  const n = frame.length;
  const maxLag = Math.min(n - 1, Math.floor(sampleRate / minFreq));
  const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));

  /* 音量ゲート：無音・極小音はそもそも判定しない */
  let rms = 0;
  for (let i = 0; i < n; i++) rms += frame[i] * frame[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.006) return null;

  /* 差分関数 d(tau) と、その累積正規化 d'(tau)（YINの核） */
  const d = new Float32Array(maxLag + 1);
  for (let tau = minLag; tau <= maxLag; tau++) {
    let sum = 0;
    for (let i = 0; i < n - tau; i++) {
      const diff = frame[i] - frame[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  let runningSum = 0;
  const dp = new Float32Array(maxLag + 1);
  dp[0] = 1;
  for (let tau = 1; tau <= maxLag; tau++) {
    runningSum += d[tau];
    dp[tau] = runningSum === 0 ? 1 : d[tau] * tau / runningSum;
  }

  /* しきい値を初めて下回った谷を採用する（YINの絶対しきい値法） */
  const threshold = 0.18;
  let tau = -1;
  for (let t = minLag + 1; t <= maxLag - 1; t++) {
    if (dp[t] < threshold && dp[t] < dp[t - 1] && dp[t] <= dp[t + 1]) { tau = t; break; }
  }
  if (tau < 0) {
    /* しきい値を割らなかった＝声というより雑音に近い。棄却する */
    return null;
  }
  /* 放物線補間でタウをサブサンプル精度にする */
  const x0 = dp[tau - 1], x1 = dp[tau], x2 = dp[tau + 1];
  const denom = (x0 - 2 * x1 + x2);
  const shift = denom !== 0 ? 0.5 * (x0 - x2) / denom : 0;
  const refinedTau = tau + Math.max(-1, Math.min(1, shift));
  if (refinedTau <= 0) return null;

  const freq = sampleRate / refinedTau;
  if (freq < minFreq || freq > maxFreq) return null;
  return freq;
}

/* ============ 3. 補正の本体（グレイン読み出しの重ね合わせ） ============
   frameSize/hopSize は 75% 重なりの Hann窓。各ホップで
     ・そのフレームの基本周波数を推定
     ・いまの世界の音階に一番近い半音へ寄せる比率を出す
     ・入力からその比率で読み出した「粒」を、窓をかけて出力へ足し込む
   無声フレームは比率1（そのまま）で通すので、子音や息づかいは変質しない。
   strength は 0〜1。1で完全にスナップ、0.5で半分だけ寄せる（自然さ重視）。 */
function pitchCorrectBuffer(float32, sampleRate, scalePcs, opts = {}) {
  const frameSize = opts.frameSize || 2048;
  /* 重なりを50%にしてある（本来は75%のほうが滑らかだが、ピッチ検出が
     フレームごとに自己相関を総当たりで計算するので、重なりを増やすと
     そのぶんホップ数が増えて処理時間が線形に伸びる。数秒の録音を
     ブラウザのメインスレッドで一括処理する都合上、ここで折り合わせた） */
  const hopSize = opts.hopSize || Math.round(frameSize / 2);
  const strength = opts.strength != null ? opts.strength : 0.85;
  const n = float32.length;

  const hann = new Float32Array(frameSize);
  for (let i = 0; i < frameSize; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frameSize - 1));

  const out = new Float32Array(n);
  const weight = new Float32Array(n);

  /* 直前フレームで採用した半音シフトを覚えておき、急に暴れないよう
     短いヒステリシスをかける（1ホップだけの誤検出で音が揺れないように） */
  let lastShift = 0;
  let holdCount = 0;

  for (let center = 0; center < n; center += hopSize) {
    const start = center - Math.floor(frameSize / 2);

    /* 解析フレーム（範囲外はゼロ埋め） */
    const frame = new Float32Array(frameSize);
    for (let i = 0; i < frameSize; i++) {
      const idx = start + i;
      if (idx >= 0 && idx < n) frame[i] = float32[idx] * hann[i];
    }

    const freq = detectPitchYin(frame, sampleRate);
    let shift = 0;
    if (freq) {
      const midi = 69 + 12 * Math.log2(freq / 440);
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      const target = nearestPcShift(pc, scalePcs);
      /* target はすでに「pcからの符号付き半音差」。今の実際の周波数の
         端数（ビブラートやピッチのゆらぎ）も込みで寄せたいので、
         検出周波数そのものからのシフト量として使う                    */
      shift = target * strength;
      /* 直前と1半音以上離れていたら3ホップ様子を見てから切り替える。
         誤検出1回で音がガクッと動くのを防ぐ（本物のオートチューンにもある工夫）*/
      if (Math.abs(shift - lastShift) > 0.5) {
        holdCount++;
        if (holdCount < 3) shift = lastShift;
        else { holdCount = 0; lastShift = shift; }
      } else {
        holdCount = 0;
        lastShift = shift;
      }
    } else {
      shift = 0;
      lastShift = 0;
      holdCount = 0;
    }

    const ratio = Math.pow(2, shift / 12);

    /* 入力から ratio 倍の速さで読み出した粒を作る（線形補間） */
    const grain = new Float32Array(frameSize);
    const srcCenter = start + frameSize / 2;
    for (let i = 0; i < frameSize; i++) {
      const srcPos = srcCenter + (i - frameSize / 2) * ratio;
      const i0 = Math.floor(srcPos), frac = srcPos - i0;
      const a = (i0 >= 0 && i0 < n) ? float32[i0] : 0;
      const b = (i0 + 1 >= 0 && i0 + 1 < n) ? float32[i0 + 1] : 0;
      grain[i] = (a + (b - a) * frac) * hann[i];
    }

    for (let i = 0; i < frameSize; i++) {
      const idx = start + i;
      if (idx >= 0 && idx < n) { out[idx] += grain[i]; weight[idx] += hann[i]; }
    }
  }

  for (let i = 0; i < n; i++) {
    if (weight[i] > 0.0001) out[i] /= weight[i];
  }
  return out;
}

/* ============ 4. ループの継ぎ目を滑らかにする ============
   録音の頭と尻をわずかにフェードして、繰り返し再生したときの
   「プツッ」というクリックノイズを消す。                             */
function applyEdgeFades(float32, sampleRate, fadeMs = 12) {
  const n = float32.length;
  const fadeLen = Math.min(Math.floor(n / 4), Math.round(sampleRate * fadeMs / 1000));
  for (let i = 0; i < fadeLen; i++) {
    const g = i / fadeLen;
    float32[i] *= g;
    float32[n - 1 - i] *= g;
  }
  return float32;
}
