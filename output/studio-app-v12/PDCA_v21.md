# stone-app-v21 PDCAログ（第15回）

恒久PDCAサイクル第15回。候補(a)：まだ固有メロディの無い世界へ新規作曲
メロディを追加する（motown→vintagejazz→sunshinepop→synthpop→kaze→
hisaishiに続く7例目）。

## Plan（計画）
候補(c)：card-gain.jsを再確認したが、v20以降ユーザーの新しい操作データは
無かった（差分無し）。今回も空振り。

候補(a)を実施：`beatles`は世界内コメントに「『リボルバー』では
『エリナー・リグビー』の弦楽八重奏とホーンの編曲を持ち込んだ」という
編成の根拠が明示済みで、まだ固有メロディが無かった。「歌＝ヴァイオリン」
札（sing.melody）に新規作曲する。

## Do（実行）
1. v19〜v20の教訓どおり、先にD6/9→E7→G6/9→C6/9（beatles世界の進行）
   各コードのラダーが許す音名を洗い出してから作曲：
   - D6/9: D/E/F#/A/B　E7: E/F#/G#/B/D
   - G6/9: D/E/G/A/B　C6/9: C/D/E/G/A
   その上で、「エリナー・リグビー」の弦楽を意識したバロックポップ風の
   4小節主旋律を新規作曲：
   - bar1(D6/9): D5→E5→F#5→A5→B5（段階的に駆け上がる）
   - bar2(E7): B5→G#5→F#5→E5（下降、ドミナントの緊張）
   - bar3(G6/9): D5→E5→G5→A5（サブドミナントの色でもう一度上昇）
   - bar4(C6/9): G5→E5→D5→C5（下降して着地、次周回のD6/9へつながる）
   絶対音名で作曲→Nodeスクリプトでラダー番号へ機械変換→逆変換で原曲と
   一致することを確認、という従来と同じ手順を踏んだ。
2. `PHRASE_RIGBY`として定義（既存world key（beatles/kaze/modal等）と
   紛らわしくないか確認済み）、`beatles.phraseOverrides.sing.melody`に
   接続。この世界は`harmony:2`で自動3度ハモリが乗るため、固有メロディも
   その上でハモる。motown・vintagejazz・sunshinepop・synthpop・kaze・
   hisaishiに続き7例目のphraseOverrides活用。
3. `index.html`のtitleと`はじめる.bat`のサーバーウィンドウ名をv21に更新。

## Check（確認）
- `node --check music.js` → 構文OK
- `node --check` で他の全コアJSファイル（app.js/engine.js/cards.js/
  card-gain.js/stone-serial.js/stone-ui.js/mixer.js/samples.js/server.js/
  stone-matcher.js/fetch-samples.js）も構文OK
- 構造整合性チェック（Node、単一eval）：missingVoice 0・missingGroove 0・
  WORLD_ORDER 18件重複なし
- `World.set('beatles')`後、`World.phraseFor('sing','melody')`の4小節を
  ラダー番号→絶対音名に逆変換し、作曲した原曲
  （D5 E5 F#5 A5 B5 / B5 G#5 F#5 E5 / D5 E5 G5 A5 / G5 E5 D5 C5）と
  完全一致することを確認
- 既存6世界（motown・vintagejazz・sunshinepop・synthpop・kaze・
  hisaishi）のphraseOverridesが今回の変更で壊れていないことをNodeで
  再確認
- `World.set(null)`後は`phraseFor`がnullに戻ることを確認
- 実際に鳴らしての確認は今回省略（ユーザー指示により不要）

## Act（次への反映）
- phraseOverridesを使った世界が7つ（motown・vintagejazz・sunshinepop・
  synthpop・kaze・hisaishi・beatles）になった。
- 次のサイクルの候補：
  a) まだ固有メロディの無い世界（modal/citypop/house/lofi/funk/rock/
     reggae/flamenco/swing/rocknroll/modernpop）に同様に追加する
  b) 全18世界のrhythm札の組み合わせを試聴5周目データに照らして点検する
     （まだ未着手のまま。そろそろ着手を検討したい）
  c) card-gain.jsの定点観測を継続
- 次はどれかを実施し、`stone-app-v22`として切り出す。
