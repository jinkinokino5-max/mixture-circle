# stone-app-v27 PDCAログ（第21回）

恒久PDCAサイクル第21回。候補(a)：まだ固有メロディの無い世界へ新規作曲
メロディを追加する。

## Plan（計画）
候補(b)：card-gain.jsを再確認したが、v26以降ユーザーの新しい操作データは
無かった（差分無し）。今回も空振り。

候補(a)を実施：`swing`（ビッグバンド）は世界内コメントに「この世界だけ
管楽器が全部いる」という編成の根拠が明示済みで、まだ固有メロディが
無かった。「軸＝トランペットの主題」札（core.melody）に新規作曲する。

## Do（実行）
1. v19以降の教訓どおり、先にB♭6/9→G7(♭9)→Cm9→F9（swing世界の進行、
   I–VI7–IIm–V7）各コードのラダーが許す音名を洗い出してから作曲：
   - B♭6/9: C/D/F/G/A#　G7(♭9): C/D/F/G#/B
   - Cm9: C/D#/F/G/A#　F9: C/D/F/G/A
   その上で、跳ねの強いビッグバンドのシャウト・コーラス風トランペット
   リフを新規作曲：
   - bar1(B♭6/9): F4→A#4→C5→D5→C5（分散和音でシャウトするように駆け上がる）
   - bar2(G7♭9): B4→G#4→F4→D4（♭9の緊張色を含めて下降）
   - bar3(Cm9): C5→A#4→G4→D#4（シンコペーションの効いた下降リフ）
   - bar4(F9): C5→A4→F4→C4（オクターブ下げて着地、次周回のB♭6/9へ）
   絶対音名で作曲→Nodeスクリプトでラダー番号へ機械変換→逆変換で原曲と
   一致することを確認、という従来と同じ手順を踏んだ。
2. `PHRASE_SHOUTCHORUS`として定義（既存world keyと紛らわしくないか
   確認済み）、`swing.phraseOverrides.core.melody`に接続。melody8例
   （motown・vintagejazz・sunshinepop・synthpop・kaze・hisaishi・
   beatles・modal）に続き9例目。
3. `index.html`のtitleと`はじめる.bat`のサーバーウィンドウ名をv27に更新。

## Check（確認）
- `node --check music.js` → 構文OK
- `node --check` で他の全コアJSファイル（app.js/engine.js/cards.js/
  card-gain.js/stone-serial.js/stone-ui.js/mixer.js/samples.js/server.js/
  stone-matcher.js/fetch-samples.js）も構文OK
- 構造整合性チェック（Node、単一eval）：missingVoice 0・missingGroove 0・
  WORLD_ORDER 18件重複なし
- `World.set('swing')`後、`World.phraseFor('core','melody')`の4小節を
  ラダー番号→絶対音名に逆変換し、作曲した原曲
  （F4 A#4 C5 D5 C5 / B4 G#4 F4 D4 / C5 A#4 G4 D#4 / C5 A4 F4 C4）と
  完全一致することを確認
- 既存10世界（melody8例・bass1例・chord1例・rhythm1例）の
  phraseOverridesが今回の変更で壊れていないことをNodeで再確認
- `World.set(null)`後は`phraseFor`がnullに戻ることを確認
- 実際に鳴らしての確認は今回省略（ユーザー指示により不要）

## Act（次への反映）
- phraseOverridesを使った世界が11つ（motown・vintagejazz・sunshinepop・
  synthpop・kaze・hisaishi・beatles・modal・flamenco・house・swing）に
  なった。残り固有メロディの無い世界は citypop/lofi/funk/rock/
  rocknroll/modernpop の6つ。
- 次のサイクルの候補：
  a) 残り6世界（citypop/lofi/funk/rock/rocknroll/modernpop）のいずれか
     に新規作曲メロディを追加する
  b) card-gain.jsの定点観測を継続
  c) 複数役割へ同時にphraseOverridesを適用する世界を作る
- 次はどれかを実施し、`stone-app-v28`として切り出す。v30まで残り2。
