# stone-app-v17 PDCAログ（第11回）

恒久PDCAサイクル第11回。候補(a)：コンセプトが明確な他の世界にも
新規作曲メロディを追加する。

## Plan（計画）
候補(a)：card-gain.jsを再確認したが、v16以降ユーザーの新しい操作データは
無かった（差分無し）。今回も空振り。

候補(a)を実施：`sunshinepop`（サンシャインポップ）は「朗らか・弦とハープの
室内楽ポップス」という性格が明確で、まだ固有メロディが無かった。
「軸＝フルート」札（core.melody）に新規作曲する。

## Do（実行）
1. Gmaj9→Em9→Cmaj9→D9（sunshinepop世界の進行）専用に、4小節の
   明るく弾む主旋律を新規作曲：
   - bar1(Gmaj9): D5→G5→B5→D6→B5（軽やかな跳躍で入る）
   - bar2(Em9): B5→G5→E5→D5（下降、ひと息つく）
   - bar3(Cmaj9): E5→G5→C6→B5（この曲全体の頂点、C6まで駆け上がる）
   - bar4(D9): A5→F#5→D5→A4（穏やかな着地）
   PHRASE_INTIMATE（v16）と同じ厳密な手順（絶対音名で作曲→Nodeで
   ラダー番号へ機械変換→逆変換で原曲と一致確認）を踏んだ。
2. `PHRASE_SUNSHINE`として定義し、`sunshinepop.phraseOverrides.core.melody`
   に接続。motown・vintagejazzに続き3例目のphraseOverrides活用。
3. `index.html`のtitleとサーバーウィンドウ名をv17に更新。

## Check（確認）
- `node --check music.js` → 構文OK
- 構造整合性チェック：missingVoice 0・missingGroove 0
- `World.set('sunshinepop')`後、`World.phraseFor('core','melody')`の
  4小節をラダー番号→絶対音名に逆変換し、作曲した原曲
  （D5 G5 B5 D6 B5 / B5 G5 E5 D5 / E5 G5 C6 B5 / A5 F#5 D5 A4）と
  完全一致することを確認
- `World.set(null)`後は`phraseFor`がnullに戻ることを確認
- 前サイクルで追加した`vintagejazz`の`phraseOverrides`が今回の変更で
  壊れていないこと（4小節そのまま残っていること）をNodeで再確認
- 全コアJSファイルで`node --check`構文OK
- 実際に鳴らしての確認は今回省略（ユーザー指示により不要）

## Act（次への反映）
- phraseOverridesを使った世界が3つ（motown・vintagejazz・sunshinepop）
  になった。いずれもmelody役割・単一キャラクターへの適用に留まっている
  ——bass/chord/rhythmへの拡張や、1つの世界で複数キャラクターへの
  適用は、FUNK_BASS（motownのdrive.bass）以外はまだ試していない。
- 次のサイクルの候補：
  a) 残りの候補(c)：全18世界のrhythm札の組み合わせを試聴5周目データに
     照らして点検する（今までmelody中心だった）
  b) 他の世界（synthpop・modernpop等）にも新規作曲メロディを追加する
  c) card-gain.jsの定点観測を継続
- 次はどれかを実施し、`stone-app-v18`として切り出す。
