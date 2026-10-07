# stone-app-v25 PDCAログ（第19回）

恒久PDCAサイクル第19回。候補(c)：phraseOverridesの適用範囲をchord役割
にも広げる（melody7例・bass1例に続く新しい役割への初適用）。

## Plan（計画）
候補(b)：card-gain.jsを再確認したが、v24以降ユーザーの新しい操作データは
無かった（差分無し）。今回も空振り。

候補(c)を実施：`flamenco`は世界内コメントに「土台のビートも3-3-2で数える
（スペインの数え方）」「ラスゲアード（かき鳴らし）」という編成の根拠が
明示済みで、この世界の核心的な演奏技法（ラスゲアード）がまだ譜面化
されていなかった。「押し＝ラスゲアードとスペインの金管」札
（push.chord）に固有のリズム譜面を追加する。

## Do（実行）
1. chord役割はmelody（t：ラダー番号）やbass（c：コード相対index）と
   異なり、`{s,v,l}`のみで書ける（実際に鳴る音は`voicing()`が和音から
   その場で組むため、絶対音名の指定は不要）ことをengine.js
   （`playOn`のelse分岐）で確認した上で設計。
2. 世界の根拠コメントにある「3-3-2」の区切り（16分換算でs=0/6/12）に
   強い一撃を置き、4小節目の終わり（s=14〜15）に短い連打（ラスゲアード
   のロール）を足した1小節パターンを設計。進行（Am–G–F–E7♭9）が
   変わっても保たれるべきリズムの型なので、FUNK_BASS・PHRASE_ONEDROP
   と同じ設計思想で4小節とも同一パターンを繰り返す構成にした。
3. `PHRASE_RASGUEADO`として定義し、`flamenco.phraseOverrides.push.chord`
   に接続。melody7例・bass1例に続き、chord役割へのphraseOverrides適用
   は今回が初例。
4. `index.html`のtitleと`はじめる.bat`のサーバーウィンドウ名をv25に更新。

## Check（確認）
- `node --check music.js` → 構文OK
- `node --check` で他の全コアJSファイル（app.js/engine.js/cards.js/
  card-gain.js/stone-serial.js/stone-ui.js/mixer.js/samples.js/server.js/
  stone-matcher.js/fetch-samples.js）も構文OK
- 構造整合性チェック（Node、単一eval）：missingVoice 0・missingGroove 0・
  WORLD_ORDER 18件重複なし
- `World.set('flamenco')`後、`World.phraseFor('push','chord')`が
  `PHRASE_RASGUEADO`と一致することを確認
- 4小節すべてが同一パターンであること、3-3-2の区切り（s=0/6/12）に
  強拍が置かれていることをNodeで機械検証
- 既存9世界（melody7例・bass1例）のphraseOverridesが今回の変更で
  壊れていないことをNodeで再確認
- `World.set(null)`後は`phraseFor`がnullに戻ることを確認
- 実際に鳴らしての確認は今回省略（ユーザー指示により不要）

## Act（次への反映）
- phraseOverridesを使った世界が9つ（motown・vintagejazz・sunshinepop・
  synthpop・kaze・hisaishi・beatles・modal・flamenco）になった。
  melody7例・bass1例・chord1例で、rhythm役割だけがまだ未試行。
- 次のサイクルの候補：
  a) まだ固有メロディの無い世界（citypop/house/lofi/funk/rock/swing/
     rocknroll/modernpop）に同様に追加する
  b) card-gain.jsの定点観測を継続
  c) rhythm役割へのphraseOverrides適用を検討する（4つの役割すべてを
     一度は試す、という完全制覇が視野に入ってきた）
- 次はどれかを実施し、`stone-app-v26`として切り出す。
