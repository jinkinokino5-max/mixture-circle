# stone-app-v14 PDCAログ（第8回）— 既存カードの見直し 第2弾

恒久PDCAサイクル第8回。候補(b)：ジャンル的根拠のない世界の楽器選定を
試聴4/5周目データに照らして再点検（v12で保留していた項目）。

## Plan（計画）
まずcard-gain.js（候補a）を再確認したが、v12の変更以降ユーザーが
ミキサーを操作した形跡（ファイルのタイムスタンプ・中身）は無かった
ため、新しいデータは無い。候補(a)は今回は空振りと判断し、候補(b)に着手。

`citypop`世界を精査したところ、`push.melody`（サックス+トランペット
accent）と`color.melody`（トランペット+サックスaccent）が、
**試聴5周目で「1件も★なし＝弱い」と明確に確定していた組み合わせ**
（引継ぎ記録3章5項「トランペット単体ユニゾン(a1)とトランペット＋
サックス(a3)は1件も★なし＝弱い」）そのものであることを発見。
`sing.melody`も、accentがsaxophoneで、世界のコメントが明記する
「エレキギター/エレピの土台の上にストリングス/ホーンを重ねる」
という編成原則から外れていた（guitar/piano系の裏付けが1つも無い）。

これは、v12で見送った「試聴4周目単独判定を機械的に当てはめる」
リスクとは異なる——**試聴5周目は本番同様の複数レイヤー・グルーヴ
付きの条件でテストされたデータ**であり、かつ「トランペット＋サックス」
という**具体的な組み合わせそのもの**が明確に不評だったという、
条件のずれが無い直接的な根拠。なので今回は自信を持って修正する。

## Do（実行）
`citypop`世界の3枚を修正：
1. `push.melody`：accentを`saxophone`→`guitar-electric`。primaryの
   `trumpet`は試聴3周目t8（trumpet comp、全10リズム★）の裏付けが
   あるためそのまま残した。
2. `color.melody`：同じ理由でaccentを`saxophone`→`guitar-electric`。
3. `sing.melody`：accentを`saxophone`→`guitar-electric`（primaryの
   violinは維持。ストリングス自体は世界のコメントが認める編成要素）。

## Check（確認）
- `node --check music.js` → 構文OK
- 構造整合性チェック（Node、単一eval）：missingVoice 0・missingGroove 0
- 変更後の3枚の楽器構成をNodeで確認：
  - citypop.sing.melody   = ['violin', 'guitar-electric']
  - citypop.push.melody   = ['trumpet', 'guitar-electric']
  - citypop.color.melody  = ['trumpet', 'guitar-electric']
  → いずれも「トランペット＋サックス」の組み合わせが解消されたことを確認
- 全コアJSファイルで`node --check`構文OK
- 実際に鳴らしての確認は今回省略（ユーザー指示により不要）

## Act（次への反映）
- 「試聴4周目（単独楽器パレット・薄いミックス）」と「試聴5周目
  （複数レイヤー・グルーヴ付き・本番同様の条件）」を区別し、後者の
  具体的な組み合わせ判定の方を修正の根拠として優先する、という
  判断基準が今回で明確になった。次回以降もこの基準を使う。
- 念のため全18世界を「trumpet+saxophoneの組み合わせ（melody札）」で
  grepしたところ、citypop以外にも7件見つかった：
  `kaze.color` / `modal.core` / `modal.push` / `lofi.push` /
  `funk.push` / `reggae.push` / `swing.core`（motown.pushの3管
  ハーモニーは試聴5周目で裏付けのある編成なので対象外）。
  ただし`modal`と`swing`はコード内コメントに「史実に基づく意図的な
  編成」と明記されており（v12で確認済み）、citypopと同列には扱えない。
  `kaze`/`funk`/`reggae`はジャンル的に管の合いの手が定番（ソウル/
  ファンク/レゲエのホーンセクション）である可能性が高く、`lofi`は
  根拠が薄そうに見える——**いずれも個別に世界のコメントを読んでから
  判断する必要があり、今回は時間の都合でcitypopの3枚に留めた**。
- 次のサイクルの候補：
  a) 上記7件（kaze/modal/lofi/funk/reggae/swing）を1つずつ、
     世界のコメントに genre 的根拠が書かれているか確認しながら判断する
     （根拠が無ければcitypopと同じ修正、あればそのまま残す）
  b) card-gain.jsを定点観測し、新しいユーザー操作データがあれば
     引き続き焼き込みを検討
  c) phraseOverridesが無い世界（motown以外の17世界）に、新規作曲した
     固有メロディを追加する
- 次はどれかを実施し、`stone-app-v15`として切り出す。
