# stone-app-v24 PDCAログ（第18回）

恒久PDCAサイクル第18回。候補(a)：まだ固有メロディの無い世界へ新規作曲
メロディを追加する。

## Plan（計画）
候補(b)：card-gain.jsを再確認したが、v23以降ユーザーの新しい操作データは
無かった（差分無し）。今回も空振り。

候補(a)を実施：`modal`（マイルス・デイヴィス／ビル・エヴァンス）は
世界内コメントに「『カインド・オブ・ブルー』の六重奏」という編成の
根拠が明示済みで、まだ固有メロディが無かった。「歌＝バラードの
トランペット」札（sing.melody）に新規作曲する。

## Do（実行）
1. v19以降の教訓どおり、先にDm11→Dm11→E♭m11→Dm11（modal世界の進行、
   3小節目だけ半音上へずれる）各コードのラダーが許す音名を洗い出して
   から作曲：
   - Dm11（Dドリアン）: D/E/F/G/A/B/C
   - E♭m11（半音上のドリアン）: D#/F/F#/G#/A#/C/C#
   その上で、『カインド・オブ・ブルー』的な間の広いトランペットの
   4小節主旋律を新規作曲：
   - bar1(Dm11): D4→F4→A4→C5→A4（Dmの分散和音で大きく跳躍して開く）
   - bar2(Dm11): G4→F4→E4→D4（下降、ドリアンの色を確かめながら戻る）
   - bar3(E♭m11): D#4→F#4→G#4→C5（半音上へのモード転換で色が変わる）
   - bar4(Dm11): C5→A4→F4→D4（下降して着地、次周回のDm11へつながる）
   絶対音名で作曲→Nodeスクリプトでラダー番号へ機械変換→逆変換で原曲と
   一致することを確認、という従来と同じ手順を踏んだ。
2. `PHRASE_BLUEDORIAN`として定義（既存world key（beatles/kaze/modal等）
   と紛らわしくないか確認済み）、`modal.phraseOverrides.sing.melody`に
   接続。motown・vintagejazz・sunshinepop・synthpop・kaze・hisaishi・
   beatlesに続き8例目のphraseOverrides活用（melodyとしては7例目）。
3. `index.html`のtitleと`はじめる.bat`のサーバーウィンドウ名をv24に更新。

## Check（確認）
- `node --check music.js` → 構文OK
- `node --check` で他の全コアJSファイル（app.js/engine.js/cards.js/
  card-gain.js/stone-serial.js/stone-ui.js/mixer.js/samples.js/server.js/
  stone-matcher.js/fetch-samples.js）も構文OK
- 構造整合性チェック（Node、単一eval）：missingVoice 0・missingGroove 0・
  WORLD_ORDER 18件重複なし
- `World.set('modal')`後、`World.phraseFor('sing','melody')`の4小節を
  ラダー番号→絶対音名に逆変換し、作曲した原曲
  （D4 F4 A4 C5 A4 / G4 F4 E4 D4 / D#4 F#4 G#4 C5 / C5 A4 F4 D4）と
  完全一致することを確認
- 既存7世界（motown・vintagejazz・sunshinepop・synthpop・kaze・
  hisaishi・beatles）と、bass版1件（reggae）のphraseOverridesが今回の
  変更で壊れていないことをNodeで再確認
- `World.set(null)`後は`phraseFor`がnullに戻ることを確認
- 実際に鳴らしての確認は今回省略（ユーザー指示により不要）

## Act（次への反映）
- phraseOverridesを使った世界が8つ（motown・vintagejazz・sunshinepop・
  synthpop・kaze・hisaishi・beatles・modal）になった。melody7例・bass1例。
- 次のサイクルの候補：
  a) まだ固有メロディの無い世界（citypop/house/lofi/funk/rock/flamenco/
     swing/rocknroll/modernpop）に同様に追加する
  b) card-gain.jsの定点観測を継続
  c) chord役割へのphraseOverrides適用も検討する（melody/bassに続き
     まだ未試行）
- 次はどれかを実施し、`stone-app-v25`として切り出す。
