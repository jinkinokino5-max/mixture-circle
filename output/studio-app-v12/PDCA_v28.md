# stone-app-v28 PDCAログ（第22回）

恒久PDCAサイクル第22回。候補(c)：複数役割へ同時にphraseOverridesを
適用する世界を作る（これまで1世界1役割だった適用範囲を広げる）。

## Plan（計画）
候補(b)：card-gain.jsを再確認したが、v27以降ユーザーの新しい操作データは
無かった（差分無し）。今回も空振り。

候補(c)を実施：`funk`は世界内コメントに「軸＝カッティングのギターと
エレキベース。ファンクの最小単位」と明記されており、melody（カッティング
ギター）とbass（ファンクベース）の両方が世界の核心を成す。両方を
同時に固有譜面化すればより一体感のある「最小単位」になると判断した。

## Do（実行）
1. melody：先にB♭9→B♭9→E♭9→F7(♯9)（funk世界の進行、I7を2小節動かさない）
   各コードのラダーが許す音名を洗い出してから作曲：
   - B♭9: C/D/F/G#/A#　E♭9: D#/F/G/A#/C#　F7(♯9): C/D#/F/G#/A#
   16分のカッティング・ギターのリフを新規作曲：
   - bar1(B♭9): C4→D4→F4→G#4（I7ヴァンプの短い刻み）
   - bar2(B♭9、同じ和音): A#4→G#4→F4→D4（同じI7の上で変化をつける）
   - bar3(E♭9): D#4→F4→G4→A#4（IV9へ上昇）
   - bar4(F7♯9): C5→A#4→G#4→F4（V7♯9の緊張を経て下降）
   絶対音名で作曲→Nodeスクリプトでラダー番号へ機械変換→逆変換で原曲と
   一致することを確認、という従来と同じ手順を踏んだ。
   `PHRASE_ONETHECAT`として定義（世界名の由来はジェームス・ブラウンの
   「ザ・ワン」＝1拍目を全員でそろえる哲学から）。
2. bass：新規作曲はせず、`FUNK_BASS`（v13でmotown.drive.bass用に作った
   オクターブ往復のファンクベース）をそのまま再利用。c（コード相対
   index）形式で書かれているため進行が変わっても正しく動くことを利用し、
   「ファンクの本場であるこの世界にこそふさわしい」という判断で流用した。
3. `funk.phraseOverrides.core`に`{ melody: PHRASE_ONETHECAT,
   bass: PHRASE_FUNK_BASS }`として2役割同時に接続。これまでの1世界1役割
   の枠を初めて超えた。
4. `index.html`のtitleと`はじめる.bat`のサーバーウィンドウ名をv28に更新。

## Check（確認）
- `node --check music.js` → 構文OK
- `node --check` で他の全コアJSファイル（app.js/engine.js/cards.js/
  card-gain.js/stone-serial.js/stone-ui.js/mixer.js/samples.js/server.js/
  stone-matcher.js/fetch-samples.js）も構文OK
- 構造整合性チェック（Node、単一eval）：missingVoice 0・missingGroove 0・
  WORLD_ORDER 18件重複なし
- `World.set('funk')`後、`World.phraseFor('core','melody')`が
  `PHRASE_ONETHECAT`と、`World.phraseFor('core','bass')`が
  `PHRASE_FUNK_BASS`と一致することを確認
- melodyの4小節をラダー番号→絶対音名に逆変換し、作曲した原曲
  （C4 D4 F4 G#4 / A#4 G#4 F4 D4 / D#4 F4 G4 A#4 / C5 A#4 G#4 F4）と
  完全一致することを確認
- bassの4小節が同一パターン（FUNK_BASSの繰り返し）であることを確認
- 既存11世界（melody9例・bass1例・chord1例・rhythm1例）の
  phraseOverridesが今回の変更で壊れていないことをNodeで再確認
- `World.set(null)`後は`phraseFor`がnullに戻ることを確認
- 実際に鳴らしての確認は今回省略（ユーザー指示により不要）

## Act（次への反映）
- phraseOverridesを使った世界が12つ（motown・vintagejazz・sunshinepop・
  synthpop・kaze・hisaishi・beatles・modal・flamenco・house・swing・
  funk）になった。funkは初めて1世界内で2役割（melody+bass）を同時に
  専用化した例。既存の役割別フレーズ（FUNK_BASS等）を別の世界で
  再利用できることも実証できた。
- 残り固有メロディの無い世界は citypop/lofi/rock/rocknroll/modernpop
  の5つ。
- 次のサイクルの候補：
  a) 残り5世界のいずれかに新規作曲メロディを追加する
  b) card-gain.jsの定点観測を継続
  c) v30到達に向けて総仕上げ（README更新・全体の整合性最終確認等）を
     検討する
- 次はどれかを実施し、`stone-app-v29`として切り出す。v30まで残り1。
