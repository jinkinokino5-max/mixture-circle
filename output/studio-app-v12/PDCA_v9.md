# stone-app-v9 PDCAログ（第3回）

恒久PDCAサイクル第3回。前回（`stone-app-v8/PDCA_v8.md`）の候補(a)を継続。

## Plan（計画）
引継ぎ記録の9クラスタのうち、①③⑤は実装済み。次は④オーケストラ/
シネマティックに着手しようとしたが、着手前に既存13〜14世界を確認したところ、
『久石譲』世界（key:9、prog:Cadd9→Fmaj9→E♭maj9→Fm9、76BPM、
弦・ピアノ・ハープ・木管・ホルン、groove:'cinema'）が既に
「映画音楽のオーケストラ」という役割を十分に果たしていると判断。
重複を避け、代わりに未着手だった⑥レトロシンセポップに切り替えた。

**訂正**：前回（PDCA_v8.md）で「groove:'boogie'は未使用だった」と書いたが、
実際は`kaze`・`citypop`世界が既に使用していた。実装した機能自体に問題は
無かった（グルーヴは複数世界で共有される設計）が、記述が事実誤認だったため
`stone-app-v8/PDCA_v8.md`・`README.md`を訂正済み。今回はgrooveの使用状況を
`grep`で確認してから採用した（`doubletime`は本当に未使用だったことを確認）。

## Do（実行）
1. `music.js`のWORLDSに`synthpop`（key: n）を追加。
   - 進行：Dmaj9→A9→Bm9→Gmaj9（I–V–vi–IV、ニ長調）。他のどの世界とも
     コード進行・キーが重複しない。
   - グルーヴ：`doubletime`を初採用（grepで未使用を確認済み）。
   - 編成：core/push/drive=シンセリード中心、sing=歌うシンセリード
     （バラード寄り）、color=ハープ＋シロフォンの"きらめき"。
     pushにはクリーンなカッティングギターも足した（Nile Rodgers的な味）。
2. `WORLD_ORDER`に追加（15枚目）、コメント更新。
3. `index.html`に`--st-synthpop`のCSS変数を追加。
4. `はじめる.bat`のサーバーウィンドウ名を`stone-app-v9-server`に更新。
5. `card-gain.js`の`worlds`マップに`synthpop: {}`を追加。

## Check（確認）
- `node --check music.js` → 構文OK
- 構造整合性チェック（Node、単一eval）：
  - WORLD_ORDER 15件・重複なし
  - 全世界・全キャラクター×役割の楽器レイヤーがVOICESに実在（missingVoice 0）
  - 全世界のgrooveがGROOVESに実在（missingGroove 0）
  - 全15世界のkeyが重複なし、既存の役割キー(1-5/q-t/a-g/z-b/m)とも衝突なし
  - synthpop世界の4和音すべてでlad/vc配列が厳密に昇順
  - `World.set('synthpop')`でbpm114・groove'doubletime'・4小節のroot音名が
    D3/A3/B3/G3（狙い通りI–V–vi–IVの並び）を確認
  - 5キャラクター全てのmelody音域をサンプリングし、D4〜C#6の範囲に収まる
    （極端に低い/高い音がないか）ことを確認
- 実際に鳴らしての確認は今回省略（ユーザー指示により不要）

## Act（次への反映）
- 9クラスタのうち①③⑤⑥が実装済み（④は久石譲世界で代替済みと判断）。
  残り②クールジャズ/ピアノトリオ、⑦ヴィンテージジャズポップ、
  ⑧モダンポップグルーヴ、⑨サンシャインポップが未着手。
- 次のサイクルの候補：
  a) 残りクラスタ（②⑦⑧⑨）から次の世界を追加
  b) 新しい世界（rocknroll・synthpop）にも試聴8周目方式の固有メロディを
     新規作曲してphraseOverridesで追加する
  c) GROOVESの残り（tambourine・crescendoBig）を使う世界を作る
  d) 15世界に増えたことでの見た目（スタイルカードのCSSグリッド）が
     崩れていないか、実機での目視確認をユーザーに依頼する
- 次はどれかを実施し、`stone-app-v10`として切り出す。
