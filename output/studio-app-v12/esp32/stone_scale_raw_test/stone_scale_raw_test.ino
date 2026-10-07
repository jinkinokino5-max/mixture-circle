/* =====================================================================
   stone_scale_raw_test.ino — 配線確認用の最初のスケッチ
   ---------------------------------------------------------------------
   製作手順_電子工作編.md §4-1 に対応。
   ブレッドボードでの仮組みが終わったら、いちばん先にこれを書き込む。
   「生の値」がシリアルモニタに出て、ロードセルに触れると数字が動けば
   配線は正しい。グラム単位への変換はまだしていない
   （キャリブレーション用の値取りは §5、stone_scale.ino で行う）。

   必要なライブラリ： 「HX711 Arduino Library」（作者：Bogdan Necula / Bogde）
                       Arduino IDE の「ライブラリを管理」から「HX711」で検索してインストール
   ===================================================================== */

#include "HX711.h"

// 製作手順書 §3-1 で決めたピン割り当て（ESP32のストラッピングピンを避けている）
const int LOADCELL_DOUT_PIN = 32;
const int LOADCELL_SCK_PIN = 33;

HX711 scale;

void setup() {
  Serial.begin(115200);
  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  Serial.println("HX711 起動確認中...");

  if (scale.wait_ready_timeout(2000)) {
    Serial.println("HX711 準備OK");
  } else {
    Serial.println("HX711が見つかりません。配線を確認してください。");
  }
}

void loop() {
  if (scale.is_ready()) {
    long reading = scale.read();      // 生の値（グラムではない）
    Serial.print("生の値: ");
    Serial.println(reading);
  } else {
    Serial.println("HX711が応答していません");
  }
  delay(500);
}
