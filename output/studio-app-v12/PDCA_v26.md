# stone-app-v26 PDCAログ（第20回）

恒久PDCAサイクル第20回。候補(c)：phraseOverridesの適用範囲をrhythm役割
にも広げる。melody7例・bass1例・chord1例に続き、4つの役割すべてへの
適用を完遂する。

## Plan（計画）
候補(b)：card-gain.jsを再確認したが、v25以降ユーザーの新しい操作データは
無かった（差分無し）。今回も空振り。

候補(c)を実施：まずengine.jsのplayOn（`roleKey === 'rhythm'`分岐）を
確認——pは打楽器の種類（k=キック/s=スネア/h=ハイハット/c=クラップ/
t1〜t3=タム）で、`World.drum()`がスタイルごとに読み替える。次に
`house`世界のdetail「四つ打ち・裏のハイハットとクラップ」がまだ
専用譜面化されていないことを確認し、この一文をそのまま譜面にする。

## Do（実行）
1. 四つ打ち（キックを4拍すべてに置く）＋2拍・4拍のクラップ＋裏拍の
   ハイハットという、世界のdetailに書かれた構成をそのまま1小節分の
   リズムパターンとして設計：
   - s=0/4/8/12: キック（k）— 四つ打ち本体
   - s=4/12: クラップ（c）— 2拍・4拍に重ねる
   - s=2/6/10/14: ハイハット（h）— 裏拍
   四つ打ちは進行にもコードにも依存しないリズムの型なので、
   FUNK_BASS・PHRASE_ONEDROP・PHRASE_RASGUEADOと同じ設計思想で
   4小節とも同一パターンを繰り返す構成にした。
2. `PHRASE_FOURFLOOR`として定義し、`house.phraseOverrides.core.rhythm`
   に接続。rhythm役割へのphraseOverrides適用は今回が初例——これで
   melody・bass・chord・rhythmの4役割すべてに一度ずつ適用したことになる。
3. `index.html`のtitleと`はじめる.bat`のサーバーウィンドウ名をv26に更新。

## Check（確認）
- `node --check music.js` → 構文OK
- `node --check` で他の全コアJSファイル（app.js/engine.js/cards.js/
  card-gain.js/stone-serial.js/stone-ui.js/mixer.js/samples.js/server.js/
  stone-matcher.js/fetch-samples.js）も構文OK
- 構造整合性チェック（Node、単一eval）：missingVoice 0・missingGroove 0・
  WORLD_ORDER 18件重複なし
- `World.set('house')`後、`World.phraseFor('core','rhythm')`が
  `PHRASE_FOURFLOOR`と一致することを確認
- キック位置が全拍(0,4,8,12)、クラップ位置が2拍・4拍(4,12)、
  ハイハット位置が裏拍(2,6,10,14)であることをNodeで機械検証
- 既存10世界（melody7例・bass1例・chord1例）のphraseOverridesが
  今回の変更で壊れていないことをNodeで再確認
- `World.set(null)`後は`phraseFor`がnullに戻ることを確認
- 実際に鳴らしての確認は今回省略（ユーザー指示により不要）

## Act（次への反映）
- phraseOverridesを使った世界が10つ（motown・vintagejazz・sunshinepop・
  synthpop・kaze・hisaishi・beatles・modal・flamenco・house）になった。
  melody7例・bass1例・chord1例・rhythm1例で、4つの役割すべてに一度は
  適用済み。以後は「melodyが最も効果的」という当初の知見に戻り、
  まだ固有メロディの無い世界への追加を主軸にする。
- 次のサイクルの候補：
  a) まだ固有メロディの無い世界（citypop/lofi/funk/rock/swing/
     rocknroll/modernpop）に新規作曲メロディを追加する
  b) card-gain.jsの定点観測を継続
  c) 複数役割へ同時にphraseOverridesを適用する世界を作る（例えば
     ある世界のmelodyとbassとchordを同時に専用化するなど）
- 次はどれかを実施し、`stone-app-v27`として切り出す。v30まで残り3。
