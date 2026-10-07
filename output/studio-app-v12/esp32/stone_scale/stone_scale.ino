/* =====================================================================
   stone_scale.ino — 本番用スケッチ（校正済み・PC連携対応）
   ---------------------------------------------------------------------
   製作手順_電子工作編.md §5-3 の校正済みスケッチをもとに、
   PC側（stone-serial.js）が読み取りやすい形に整えたもの。

   出力仕様（stone-serial.js の feedRawValue が前提にしている形式）：
     ・1行に1つ、グラム数の数値だけを送る（例： 83.42\n ）
     ・ラベルや単位の文字は付けない（付けるとPC側がその行を無視する）
     ・数値でない行（起動時のメッセージなど）が混ざっても、PC側は無視するので問題ない

   使い方：
     1. CALIBRATION_FACTOR を、製作手順書 §5-2 の手順で計算した値に置き換える
     2. 何も載せていない状態でESP32の電源を入れる（起動時に自動でtareする＝その状態をゼロとして記憶する）
     3. 書き込み後、Arduino IDEのシリアルモニタ（ボーレート115200）でグラム数が出ることを確認する
     4. 確認できたら、ブラウザ側（index.html）の「ESP32につなぐ」から接続する
   ===================================================================== */

#include "HX711.h"

const int LOADCELL_DOUT_PIN = 32;
const int LOADCELL_SCK_PIN = 33;

// 製作手順書 §5-2 で計算した値に置き換える（プレースホルダー）
float CALIBRATION_FACTOR = 420.0;

// 何回分の読み取りから重さを決めるか。多いほど安定するが反応が遅くなる
// （製作手順書 §5-3 の注記／設計ログ02の既知の弱点＝台への衝撃ノイズ対策）
const int SAMPLE_COUNT = 5;

// 送信間隔（ミリ秒）。PC側の静定判定（stone-matcher.js の stableMs=300ms）に対して
// 十分な頻度で送れる値にしてある
const int SEND_INTERVAL_MS = 150;

HX711 scale;

// 突然の異常値（スパイク）対策：SAMPLE_COUNT回読み取った中から
// 最大値・最小値を1個ずつ捨てて、残りだけを平均する（トリム平均）。
// ブレッドボード仮組み段階で「6回に1回程度、値が突然飛ぶ」現象が確認されたための対策。
float readTrimmedMeanWeight() {
  float samples[SAMPLE_COUNT];
  for (int i = 0; i < SAMPLE_COUNT; i++) {
    while (!scale.is_ready()) {
      // 準備ができるまで待つ
    }
    samples[i] = scale.get_units(1);
  }

  // 挿入ソート（SAMPLE_COUNTが小さいのでこれで十分）
  for (int i = 1; i < SAMPLE_COUNT; i++) {
    float key = samples[i];
    int j = i - 1;
    while (j >= 0 && samples[j] > key) {
      samples[j + 1] = samples[j];
      j--;
    }
    samples[j + 1] = key;
  }

  // 最小値・最大値を1個ずつ除外して平均する
  float sum = 0;
  for (int i = 1; i < SAMPLE_COUNT - 1; i++) {
    sum += samples[i];
  }
  return sum / (SAMPLE_COUNT - 2);
}

void setup() {
  Serial.begin(115200);
  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);

  if (!scale.wait_ready_timeout(2000)) {
    // ここで数値が出なくなるので、PC側のログで異常に気づける
    Serial.println("HX711が見つかりません。配線を確認してください。");
  }

  scale.set_scale(CALIBRATION_FACTOR);
  scale.tare();  // 起動時に台の上を「ゼロ」として記憶する（起動時は何も載せないこと）
}

void loop() {
  float weight = readTrimmedMeanWeight();
  Serial.println(weight, 2);   // 小数点2桁のグラム数のみを送信
  delay(SEND_INTERVAL_MS);
}
