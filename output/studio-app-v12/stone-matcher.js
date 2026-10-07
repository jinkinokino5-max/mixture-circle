/* =====================================================================
   stone-matcher.js — 重さの差分から「どの石か」を判定する純粋ロジック
   ---------------------------------------------------------------------
   ハードウェア（ESP32・ロードセル）にもブラウザにも依存しない。
   ・createSettleTracker … 揺れているシリアル値から「落ち着いた値」だけを拾う
   ・decide … 落ち着いた重さの差分と登録済み石のリストから、
              置かれた／取られたのはどの石かを判定する
   Node（テスト・検証用）とブラウザ（<script>タグ）の両方で使えるように、
   最後で module.exports と window への登録を両方行う。
   ===================================================================== */

const StoneMatcher = (function () {

  /* ---- 1. 揺れる値から「落ち着いた値」だけを取り出す ----
     値が noiseThreshold(g) 以内に stableMs(ms) 以上とどまったら「落ち着いた」とみなす。
     一度確定した値の近くで揺れ続けている間は再通知しない（同じ確定を連発しない）。 */
  function createSettleTracker({ stableMs = 300, noiseThreshold = 0.5 } = {}) {
    let anchorValue = null;
    let anchorTime = null;
    let lastEmitted = null;

    return {
      /* value: グラム数, t: ミリ秒のタイムスタンプ（単調増加であればなんでもよい）
         戻り値: 落ち着いた値（グラム）を返せば通知、まだなら null */
      feed(value, t) {
        if (anchorValue === null || Math.abs(value - anchorValue) > noiseThreshold) {
          anchorValue = value;
          anchorTime = t;
          return null;
        }
        if (t - anchorTime >= stableMs) {
          if (lastEmitted === null || Math.abs(value - lastEmitted) > noiseThreshold) {
            lastEmitted = value;
            return value;
          }
        }
        return null;
      },
      reset() {
        anchorValue = null; anchorTime = null; lastEmitted = null;
      },
    };
  }

  /* ---- 1-5. レンジ丸め（絶対値ベースの識別方式） ----
     2026-08-31の実測（measurement-logs/）で、静止状態でも生値が数十〜200g超
     揺れる／ドリフトすることが確認された。±数gの許容誤差では吸収しきれないため、
     本人指示によりrangeSize(既定100g)刻みで切り捨てる方式に変更した。
     例：1274g → 1200g（1200〜1299gのレンジ扱い）
     ※ これは症状を吸収する対症療法であり、ハードウェア側の不安定さ
     （配線の緩み等、実測時に切り分け途中だったもの）そのものを直すものではない。 */
  function toRange(value, rangeSize = 100) {
    return Math.floor(value / rangeSize) * rangeSize;
  }

  /* ---- 2. 差分から石を特定する ----
     delta         : 直前の確定重量からの増減（g）。プラス＝置いた／マイナス＝取った
     rangeSize     : 同一レンジとみなす刻み幅（g）。既定100g
     noiseThreshold: これ未満の差分はノイズとして無視する（g）
     registry      : [{ id, weightGrams, cardId, ... }, ...] 登録済みの石すべて
     placedIds     : Set<string> いま台の上にあると分かっている石のid

     戻り値のtype:
       'noise'    … 差分が小さすぎる。無視してよい
       'place'    … stone を新たに置いたと判定
       'remove'   … stone を取ったと判定
       'unknown'  … 差分はあるが、登録済みのどの石ともレンジが一致しない
  */
  function decide({ delta, rangeSize = 80, noiseThreshold = 50, registry = [], placedIds = new Set() } = {}) {
    if (Math.abs(delta) < noiseThreshold) return { type: 'noise', delta };

    const target = Math.abs(delta);
    const wantPlaced = delta < 0; // マイナスなら「いま置かれている石」の中から探す
    const targetRange = toRange(target, rangeSize);

    const candidates = registry
      .filter(s => (wantPlaced ? placedIds.has(s.id) : !placedIds.has(s.id)))
      .filter(s => toRange(s.weightGrams, rangeSize) === targetRange)
      .map(s => ({ stone: s, diff: Math.abs(s.weightGrams - target) }))
      .sort((a, b) => a.diff - b.diff);

    if (candidates.length === 0) return { type: 'unknown', delta };

    const best = candidates[0];
    // 同じレンジに複数の石が入っている＝この方式では原理的に区別できない
    const ambiguous = candidates.length > 1;

    return {
      type: wantPlaced ? 'remove' : 'place',
      delta,
      range: targetRange,
      stone: best.stone,
      ambiguous,
      candidates: candidates.map(c => ({ id: c.stone.id, diff: c.diff })),
    };
  }

  /* ---- 3. 新規登録時に「同じレンジの石」がないか事前チェック ----
     レンジ丸め方式では同じレンジに2個以上の石があると原理的に区別不能なため、
     許容誤差の近さではなく「同じレンジかどうか」で判定する */
  function findConflicts(weightGrams, registry, rangeSize = 80) {
    const targetRange = toRange(weightGrams, rangeSize);
    return registry
      .filter(s => toRange(s.weightGrams, rangeSize) === targetRange)
      .map(s => ({ stone: s, diff: Math.abs(s.weightGrams - weightGrams) }))
      .sort((a, b) => a.diff - b.diff);
  }

  return { createSettleTracker, decide, findConflicts, toRange };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StoneMatcher;
}
if (typeof window !== 'undefined') {
  window.StoneMatcher = StoneMatcher;
}
