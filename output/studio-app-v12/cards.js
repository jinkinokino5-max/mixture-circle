/* =====================================================================
   cards.js — カードIDの定義と、RFID UID との対応表
   =====================================================================
   石！！石？？石！？（合奏版 v5）では使いません。
   v5では石ごとの識別すらしていません（重さの増減＝何かが起きるきっかけ、
   というだけの「かくはん型」設計。詳細はstone-serial.js/app.js参照）。
   RFIDカード・NFCシールは使っていません。
   このファイルは studio-app-v10（音楽エンジン）が本来使うカード方式の
   名残りで、engine.js/app.js が参照できるように空のままにしてあります。
   （app.js の insertCard はUIDではなく stone-serial.js から直接
   cardId を渡されて呼ばれます）

   参考：cardIdの書式は2種類
     性格カード： '<性格>-<役割>'　性格=core/sing/push/drive/color
                                 役割=melody/bass/rhythm/chord （20通り）
     スタイルカード： 'style-<世界>'　世界=WORLD_ORDER の12種類
   ===================================================================== */

const CARD_MAP = {
  // ---- 軸 CORE ----
  // '<UIDを登録してください>': 'core-melody',   // 口ずさめる主旋律
  // '<UIDを登録してください>': 'core-bass',     // 8分で支える低音
  // '<UIDを登録してください>': 'core-rhythm',   // 素直な8ビート
  // '<UIDを登録してください>': 'core-chord',    // 開いた和音を刻む

  // ---- 歌 SING ----
  // '<UIDを登録してください>': 'sing-melody',   // 伸びて歌う旋律
  // '<UIDを登録してください>': 'sing-bass',     // 長く支える低音
  // '<UIDを登録してください>': 'sing-rhythm',   // 打点だけの打楽器
  // '<UIDを登録してください>': 'sing-chord',    // 分散和音（アルペジオ）

  // ---- 押し PUSH ----
  // '<UIDを登録してください>': 'push-melody',   // 力強いリフ
  // '<UIDを登録してください>': 'push-bass',     // 押し出す8分
  // '<UIDを登録してください>': 'push-rhythm',   // 8ビート＋クラップ
  // '<UIDを登録してください>': 'push-chord',    // 和音を短く刻む

  // ---- 刻み DRIVE ----
  // '<UIDを登録してください>': 'drive-melody',  // 16分のアルペジオ
  // '<UIDを登録してください>': 'drive-bass',    // 16分の反復
  // '<UIDを登録してください>': 'drive-rhythm',  // 四つ打ち
  // '<UIDを登録してください>': 'drive-chord',   // 伸ばしっぱなしの和音

  // ---- 彩り COLOR ----
  // '<UIDを登録してください>': 'color-melody',  // 合いの手の旋律
  // '<UIDを登録してください>': 'color-bass',    // 歩く低音
  // '<UIDを登録してください>': 'color-rhythm',  // ライドと薄いキック
  // '<UIDを登録してください>': 'color-chord',   // 裏拍のコンピング

  // ---- STYLE（世界を決める12枚）----
  // '<UIDを登録してください>': 'style-beatles',
  // '<UIDを登録してください>': 'style-kaze',
  // '<UIDを登録してください>': 'style-modal',
  // '<UIDを登録してください>': 'style-hisaishi',
  // '<UIDを登録してください>': 'style-citypop',
  // '<UIDを登録してください>': 'style-house',
  // '<UIDを登録してください>': 'style-lofi',
  // '<UIDを登録してください>': 'style-funk',
  // '<UIDを登録してください>': 'style-rock',
  // '<UIDを登録してください>': 'style-reggae',
  // '<UIDを登録してください>': 'style-flamenco',
  // '<UIDを登録してください>': 'style-swing',
};
