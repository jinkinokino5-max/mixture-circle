# stone-app-v19 PDCAログ（第13回）

恒久PDCAサイクル第13回。候補(a)：まだ固有メロディの無い世界へ新規作曲
メロディを追加する（motown→vintagejazz→sunshinepop→synthpopに続く5例目）。

## Plan（計画）
候補(c)：card-gain.jsを再確認したが、v18以降ユーザーの新しい操作データは
無かった（差分無し）。今回も空振り。

候補(a)を実施：`kaze`（藤井風）は「ピアノとゴスペル」という性格が世界内
コメントに明示済みで、まだ固有メロディが無かった。「軸＝ピアノ」札
（core.melody）に新規作曲する。

## Do（実行）
1. PHRASE_NEON（v18）の教訓（コードのラダー配列に実在する音名だけを
   使う）を踏まえ、先にFm9→B♭9→E♭maj9→C7♭9（kaze世界の進行）各コードの
   ラダーが許す音名を洗い出してから作曲：
   - Fm9: D#/F/G/G#/C　B♭9: D/F/G/A#/C
   - E♭maj9: D#/F/G/A#/C　C7♭9: C#/E/G/A#/C
   その上で、ゴスペル寄りの16分の跳ねを持つ4小節の主旋律を新規作曲：
   - bar1(Fm9): C5→D#5→F5→G5→F5（16分の跳ねで駆け上がり、軽く戻る）
   - bar2(B♭9): G5→F5→D5→C5（下降、次のE♭maj9への準備）
   - bar3(E♭maj9): D#5→F5→G5→A#5（曲全体のピーク、A#5で長く伸ばす）
   - bar4(C7♭9): G4→E4→C4（オクターブ下げて静かに着地、次周回のFm9へ）
   絶対音名で作曲→Nodeスクリプトでラダー番号へ機械変換→逆変換で原曲と
   一致することを確認、という従来と同じ手順を踏んだ。今回は音名選定を
   先にラダーで縛ったため、v18のような変換失敗は発生しなかった。
2. `PHRASE_KAZE`として定義し、`kaze.phraseOverrides.core.melody`に接続。
   motown・vintagejazz・sunshinepop・synthpopに続き5例目のphraseOverrides
   活用。
3. `index.html`のtitleと`はじめる.bat`のサーバーウィンドウ名をv19に更新。

## Check（確認）
- `node --check music.js` → 構文OK
- `node --check` で他の全コアJSファイル（app.js/engine.js/cards.js/
  card-gain.js/stone-serial.js/stone-ui.js/mixer.js/samples.js/server.js/
  stone-matcher.js/fetch-samples.js）も構文OK
- 構造整合性チェック（Node、単一eval）：missingVoice 0・missingGroove 0・
  WORLD_ORDER 18件重複なし
- `World.set('kaze')`後、`World.phraseFor('core','melody')`の4小節を
  ラダー番号→絶対音名に逆変換し、作曲した原曲
  （C5 D#5 F5 G5 F5 / G5 F5 D5 C5 / D#5 F5 G5 A#5 / G4 E4 C4）と
  完全一致することを確認
- 既存4世界（motown・vintagejazz・sunshinepop・synthpop）の
  phraseOverridesが今回の変更で壊れていないことをNodeで再確認
- `World.set(null)`後は`phraseFor`がnullに戻ることを確認
- 実際に鳴らしての確認は今回省略（ユーザー指示により不要）

## Act（次への反映）
- phraseOverridesを使った世界が5つ（motown・vintagejazz・sunshinepop・
  synthpop・kaze）になった。v18の教訓（先にコードのラダーが許す音名を
  洗い出してから作曲する）を適用したことで、今回は変換失敗が起きず
  作業がスムーズだった——この手順を今後の標準手順として定着させる。
- 次のサイクルの候補：
  a) まだ固有メロディの無い世界（beatles/modal/hisaishi/citypop/house/
     lofi/funk/rock/reggae/flamenco/swing/rocknroll/modernpop）に
     同様に追加する
  b) 全18世界のrhythm札の組み合わせを試聴5周目データに照らして点検する
     （引継ぎ記録の「グルーヴより楽器編成が支配的」という記述があり
     成果が薄い可能性がある点に留意。それでも一度は実施して記録に残す
     価値はある）
  c) card-gain.jsの定点観測を継続
- 次はどれかを実施し、`stone-app-v20`として切り出す。
