# stone-app-v20 PDCAログ（第14回）

恒久PDCAサイクル第14回。候補(a)：まだ固有メロディの無い世界へ新規作曲
メロディを追加する（motown→vintagejazz→sunshinepop→synthpop→kazeに
続く6例目）。

## Plan（計画）
候補(c)：card-gain.jsを再確認したが、v19以降ユーザーの新しい操作データは
無かった（差分無し）。今回も空振り。

候補(a)を実施：`hisaishi`（久石譲）は世界内コメントに「大編成ではなく
小さめのオーケストラ」「場面ごとに丁寧に描き分ける」という編成の根拠が
明示済みで、まだ固有メロディが無かった。「軸＝ピアノにフルートが寄り添う」
札（core.melody）に新規作曲する。

## Do（実行）
1. v19の教訓どおり、先にCadd9→Fmaj9→E♭maj9→Fm9（hisaishi世界の進行）
   各コードのラダーが許す音名を洗い出してから作曲：
   - Cadd9: C/D/E/G/A　Fmaj9: C/D/F/G/A
   - E♭maj9: D#/F/G/A#/C　Fm9: D#/F/G#/A#/C
   その上で、映画音楽らしい広い間を持つ4小節の主題を新規作曲：
   - bar1(Cadd9): C5→E5→G5→A5→G5（分散和音でゆったり駆け上がる）
   - bar2(Fmaj9): A5→G5→F5→D5（下降、次の借用和音への準備）
   - bar3(E♭maj9): F5→G5→A#5→C6（借用和音♭IIIによる色の転換、曲のピーク）
   - bar4(Fm9): A#4→G#4→F4→D#4（オクターブ下げて静かに着地、次周回へ）
   絶対音名で作曲→Nodeスクリプトでラダー番号へ機械変換→逆変換で原曲と
   一致することを確認、という従来と同じ手順を踏んだ。
2. `PHRASE_SORA`として定義（最初`PHRASE_KAZEBANA`と名付けたが、既存の
   「kaze」世界＝藤井風と紛らわしいため`PHRASE_SORA`へ変更）、
   `hisaishi.phraseOverrides.core.melody`に接続。motown・vintagejazz・
   sunshinepop・synthpop・kazeに続き6例目のphraseOverrides活用。
3. `index.html`のtitleと`はじめる.bat`のサーバーウィンドウ名をv20に更新。

## Check（確認）
- `node --check music.js` → 構文OK
- `node --check` で他の全コアJSファイル（app.js/engine.js/cards.js/
  card-gain.js/stone-serial.js/stone-ui.js/mixer.js/samples.js/server.js/
  stone-matcher.js/fetch-samples.js）も構文OK
- 構造整合性チェック（Node、単一eval）：missingVoice 0・missingGroove 0・
  WORLD_ORDER 18件重複なし
- `World.set('hisaishi')`後、`World.phraseFor('core','melody')`の4小節を
  ラダー番号→絶対音名に逆変換し、作曲した原曲
  （C5 E5 G5 A5 G5 / A5 G5 F5 D5 / F5 G5 A#5 C6 / A#4 G#4 F4 D#4）と
  完全一致することを確認
- 既存5世界（motown・vintagejazz・sunshinepop・synthpop・kaze）の
  phraseOverridesが今回の変更で壊れていないことをNodeで再確認
- `World.set(null)`後は`phraseFor`がnullに戻ることを確認
- 実際に鳴らしての確認は今回省略（ユーザー指示により不要）

## Act（次への反映）
- phraseOverridesを使った世界が6つ（motown・vintagejazz・sunshinepop・
  synthpop・kaze・hisaishi）になった。新規定数の命名時は、既存の
  world key（kaze等）と紛らわしくないか一度確認する運用を今後も続ける。
- 次のサイクルの候補：
  a) まだ固有メロディの無い世界（beatles/modal/citypop/house/lofi/funk/
     rock/reggae/flamenco/swing/rocknroll/modernpop）に同様に追加する
  b) 全18世界のrhythm札の組み合わせを試聴5周目データに照らして点検する
     （まだ未着手のまま）
  c) card-gain.jsの定点観測を継続
- 次はどれかを実施し、`stone-app-v21`として切り出す。
