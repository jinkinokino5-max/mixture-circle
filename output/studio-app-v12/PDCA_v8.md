# stone-app-v8 PDCAログ（第2回）

恒久PDCAサイクル第2回。前回（`stone-app-v7/PDCA_v7.md`）の「次のサイクルの候補」
から (a) を実施：未着手だった参考曲クラスタから新しい世界を1枚追加。

## Plan（計画）
`音楽カード_検討記録_引継ぎ.md`の④節に、9クラスタのうち①（モータウン/ファンク）
③（ビートルズ）以外は未着手と明記されていた。このうち⑤初期ロックンロール
（Chuck Berry「Maybellene」）は、既存の「ハードロック」世界と名前は近いが
音楽的性格が正反対（歪みなし・明るい・ブギウギ）なので混同されず、
かつ試聴1〜5周目の「楽器の組み合わせとリズムが支配的」という確定傾向とも
矛盾しない題材として選んだ。

## Do（実行）
1. `music.js`のWORLDSに`rocknroll`（key: k）を追加。
   - 進行：A6→D6→A6→E7（I–IV–I–V、イ長調）。他の全世界がvi–IV–I–V系の
     進行を使っている中、初めてI–IV–I–Vにした。
   - グルーヴ：既存の`boogie`を使用（後で確認したところ、実際は
     `kaze`・`citypop`世界が既に使っており「未使用だった」という
     当初の記述は誤りだったため訂正。groove自体は世界間で共有される
     設計なので、複数世界が同じgrooveを使うこと自体は問題ない）。
   - 編成：core=ツインギターのリフ、sing=サックスのホンキングソロ、
     push=ピアノのブギウギ（世界の主役）、drive=ギターの16分シャッフル、
     color=トランペットの合いの手。
2. `WORLD_ORDER`に追加（14枚目）、コメント更新。
3. `index.html`に`--st-rocknroll`のCSS変数を追加。
4. `はじめる.bat`のサーバーウィンドウ名を`stone-app-v8-server`に更新。
5. `card-gain.js`の`worlds`マップに`rocknroll: {}`を追加。

## Check（確認）
- `node --check music.js` / `node --check engine.js` → 構文OK
- 構造整合性チェック（Node、単一eval）：
  - WORLD_ORDER 14件・重複なし
  - 全世界・全キャラクター×役割の楽器レイヤーがVOICESに実在（missingVoice 0）
  - 全世界のgrooveがGROOVESに実在（missingGroove 0）
  - 全14世界のkeyが重複なし、かつROLES（1-5/q-t/a-g/z-b）やMixerキー(m)と衝突なし
  - 全4和音のlad/vc配列が昇順（跳躍や逆行がないか）を確認 → 問題なし
  - `World.set('rocknroll')`でbpm168・groove'boogie'・4小節のroot音名が
    A3/D3/A3/E3と、狙い通りI–IV–I–Vの並びになっていることを確認
- 実際に鳴らしての確認は今回省略（ユーザー指示により不要）

## Act（次への反映）
- これで引継ぎ記録の9クラスタのうち①③⑤が実装済み。残り②④⑥⑦⑧⑨は未着手。
- 次のサイクルの候補：
  a) 残りクラスタから次の1〜2枚（例：④オーケストラ/シネマティック、
     ⑥レトロシンセポップ）を追加
  b) ロックンロール世界にも試聴8周目方式の固有メロディ（新規作曲）を
     phraseOverridesで追加する
  c) GROOVESの残り（tambourine/doubletime/crescendoBig）がまだ
     どの世界からも参照されていないので、それらを使う世界を作る
  d) 既存世界のリズム/編成のテコ入れ（試聴データにない古い世界の見直し）
- 次はどれかを実施し、`stone-app-v9`として切り出す。
