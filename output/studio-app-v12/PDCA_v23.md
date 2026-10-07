# stone-app-v23 PDCAログ（第17回）

恒久PDCAサイクル第17回。候補(c)：phraseOverridesの適用範囲をmelody以外
（bass）にも広げる（motown.drive.bassのFUNK_BASS以来2例目）。

## Plan（計画）
候補(b)：card-gain.jsを再確認したが、v22以降ユーザーの新しい操作データは
無かった（差分無し）。今回も空振り。

候補(c)を実施：`reggae`は世界内コメントに「編成の根拠：土台のビートは
ワン・ドロップ（1拍目にキックを置かず、3拍目でキックとスネアが同時に
落ちる）。ベースが最前面に出て、旋律よりも太く低く歌う」と明記済みだが、
これまでbassは共有PHRASESのままだった。ワン・ドロップという世界の核心
概念を、専用のベースラインとして固有実装する。

## Do（実行）
1. FUNK_BASS（v13・motown.drive.bass）と同じ形式（c：0=ルート/1=5度/
   2=オクターブ/3=3度のコード相対インデックス）でベースラインを設計。
   絶対音名のラダー変換が不要なため、v18〜v22で使ったNode検証手順
   （音名→ラダー番号→逆変換）は今回不要——その代わり「1拍目に音符が
   無いこと（ワン・ドロップの型）」をNodeで機械的に検証する方式にした。
   - s=6: 3度（弱く、3拍目への予備動作）
   - s=8: ルート（強く、3拍目で「落とす」＝ワン・ドロップ本体）
   - s=12: 5度（次への橋渡し）
   - s=14: オクターブ（次の小節の頭へ滑らかに接続）
   4小節とも同一パターンで繰り返す（FUNK_BASSと同じ設計思想：
   ワン・ドロップは進行が変わっても型が保たれるべきグルーヴだから）。
2. `PHRASE_ONEDROP`として定義し、`reggae.phraseOverrides.core.bass`に
   接続。melody以外にphraseOverridesを使う2例目（1例目はmotown.drive.bass
   のFUNK_BASS）。
3. `index.html`のtitleと`はじめる.bat`のサーバーウィンドウ名をv23に更新。

## Check（確認）
- `node --check music.js` → 構文OK
- `node --check` で他の全コアJSファイル（app.js/engine.js/cards.js/
  card-gain.js/stone-serial.js/stone-ui.js/mixer.js/samples.js/server.js/
  stone-matcher.js/fetch-samples.js）も構文OK
- 構造整合性チェック（Node、単一eval）：missingVoice 0・missingGroove 0・
  WORLD_ORDER 18件重複なし
- `World.set('reggae')`後、`World.phraseFor('core','bass')`の4小節が
  `bassSemi`で正しくコードトーン（ルート/5度/オクターブ/3度）に変換
  されることを確認。4小節すべてが同一パターン（REGGAE_BASS_BARの
  繰り返し）であることも確認
- 全小節で1拍目（s<4）に音符が存在しないこと（ワン・ドロップの型を
  守っていること）をNodeで機械検証
- 既存7世界（motown・vintagejazz・sunshinepop・synthpop・kaze・
  hisaishi・beatles）のphraseOverridesが今回の変更で壊れていないことを
  Nodeで再確認
- `World.set(null)`後は`phraseFor`がnullに戻ることを確認
- 実際に鳴らしての確認は今回省略（ユーザー指示により不要）

## Act（次への反映）
- phraseOverridesがmelody以外（bass）にも使えることを再確認できた。
  「世界の核心概念がリズム的な型（ワン・ドロップ等）である場合は、
  bassやrhythmの専用譜面化が有効」という設計判断が今回で実証2例目に
  なった。同様の候補（例：flamenco「パルマスと踏み鳴らし」・house
  「四つ打ち」など、既にgrooveレベルで表現されているものは対象外だが、
  楽器の"演奏の型"まで踏み込みたい世界があれば次の候補になる）。
- 次のサイクルの候補：
  a) まだ固有メロディの無い世界（modal/citypop/house/lofi/funk/rock/
     flamenco/swing/rocknroll/modernpop）に新規作曲メロディを追加する
  b) card-gain.jsの定点観測を継続
  c) chord役割へのphraseOverrides適用も検討する（melody/bassに続き
     まだ未試行）
- 次はどれかを実施し、`stone-app-v24`として切り出す。
