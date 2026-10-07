# stone-app-v7 PDCAログ（第1回）

方針：ユーザーより「stone-app-v30ができるまで、承認を待たずにPDCAを回し続けてよい。
既存の音楽カードを無くす・改変するなど大きな変更も可。大きな変更のたびに
新しいバージョンのフォルダを作る」という指示を受けての、恒久サイクルの1回目。
目的は常に「気持ちいい音楽が多様に作れること」。

## Plan（計画）
v6のREADME・引継ぎ記録に「未着手」として明記されていた最大の壁：
**PHRASES（旋律・リズムの実データ）が性格ごとに1つで全世界共有**という構造のため、
試聴6〜8周目で作った固有の（進行専用の）メロディを個別の世界だけの専用カードに
できなかった。今回はここに手を入れる。

## Do（実行）
1. `music.js`のWorldに`phraseFor(charKey, roleKey)`を追加。世界が
   `phraseOverrides`を持っていればそれを返し、無ければnull（＝呼び出し側は
   今までどおり共有PHRASESを使う）。**既存の12〜13世界の挙動は無変更**。
2. `engine.js`のPartコンストラクタで`PHRASES[charKey][roleKey].phrase`固定だった
   箇所を`World.phraseFor(charKey, roleKey) || PHRASES[...]`に変更。
3. 試聴8周目の3曲すべて（M1/M2/M3、各4小節、絶対音名で記録済み）を、
   モータウン世界の進行（Em9→Cmaj9→G6/9→D9）に対するラダー番号（t）へ
   Nodeスクリプトで機械的に変換：
   - M1「夕凪に浮かぶ旋律」→`PHRASE_YUNAGI`→`sing.melody`（サックスのソロ）
   - M2「光の階段」→`PHRASE_HIKARI`→`core.melody`（ピアノ）
   - M3「静かな祈り」→`PHRASE_INORI`→`color.melody`（ハープ）
   M3は音域が低く、ラダー番号が負（t=-1〜-3）になる音があったが、
   `ladSemi()`のmodulo演算はもともと負のiにも対応済みだったため、
   engine.js側の変更は不要だった。

## Check（確認）
- `node --check music.js` / `node --check engine.js` → 構文OK
- 構造整合性チェック（Node、単一eval）：
  - WORLD_ORDER 13件・重複なし
  - 全世界・全キャラクター×役割の楽器レイヤーがVOICESに実在（missingVoice 0）
  - 全世界のgrooveがGROOVESに実在（missingGroove 0）
- `World.phraseFor('sing','melody')`（motown選択時）→ 4小節の配列を返す
- `World.phraseFor('core','melody')`（motown選択時）→ null（未指定の札は影響なし）
- `World.set(null)`後は`phraseFor('sing','melody')`もnull（baseに戻すと通常運転）
- **ラダー番号→絶対音名の逆変換で、3曲×4小節＝全12小節が
  試聴8周目の原曲と完全一致**（Node検証スクリプトで自動比較、
  ALL BARS OK）
- `World.set(null)`後は3札とも`phraseFor`がnullに戻ることを確認
  （base世界・他12世界の挙動には一切影響しない）
- 実際に鳴らしての確認は今回省略（ユーザー指示により不要）

## Do（追加・同日内）— ファンクベースの実装
`phraseOverrides`はmelody以外の役割にもそのまま使えることを示すため、
同じ仕組みで試聴5周目の「オクターブ往復のファンクベース」も実装した。
BASSの書式は絶対音名ではなく`{c}`（0=ルート/1=5度/2=オクターブ/3=3度）
なので、元のcard-audition5.jsのインターバル（0/12/7半音）をそのまま
c(0/2/1)に対応させるだけで変換誤差なく移植できた。
モータウン世界の`drive.bass`（16分の反復＝「刻み」）に接続
（`PHRASE_FUNK_BASS`）。Node検証で`bassSemi()`の出力が
root→octave→5th→root→octave→5thの意図どおりの並びになることを確認。

## Act（次への反映）
- モータウン世界の5枠のうち、core/sing/color/driveの4枠が専用譜面に
  なった。残る「押し」（3管ハーモニー、意図的に共有PHRASESのまま）。
- `phraseOverrides`はmelody/bass両方で実証できたので、chord/rhythmへの
  拡張も同じ要領で可能（次サイクル以降で必要になれば）。
- 次のサイクルの候補：
  a) 未着手の参考曲クラスタ（②クールジャズ/ピアノトリオ、④オーケストラ/
     シネマティック、⑤初期ロックンロール、⑥レトロシンセポップ、
     ⑦ヴィンテージジャズポップ、⑧モダンポップグルーヴ、
     ⑨サンシャインポップ）から新しい世界を追加
  b) GROOVESのさらなる拡充・既存世界のリズム差し替え
  c) 新しい固有メロディを別の世界向けに新規作曲し、専用譜面として実装
- 次はどれか1つ以上を実施し、`stone-app-v8`として切り出す。
