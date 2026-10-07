# stone-app-v10 PDCAログ（第4回）

恒久PDCAサイクル第4回。

## Plan（計画）
引継ぎ記録の残りクラスタ（②⑦⑧⑨）から⑦ヴィンテージジャズポップに着手しようと
した際、既存15世界がすべて`WORLDS[k].key`に一意の英数字1文字を持つ設計だと
気づいた。演奏キー（qwert/asdfg/zxcvb=15文字）＋ミキサー（m）＋
世界（6789 0 + y u p i o h j l k n = 15文字）で、アルファベット26字＋
数字10字のうち使える範囲（英字26・かつ演奏キーと衝突しない数字5）を
ちょうど使い切っていた。つまり**今の設計のままでは17枚目の世界を
追加できない**という制約が判明。新しい世界を作る前に、まずこれを解消する。

## Do（実行）
1. `app.js`のKEYMAP登録（旧: `WORLD_ORDER.forEach(sk => { KEYMAP[WORLDS[sk].key] = ... })`）
   を`if (k) KEYMAP[k] = ...`でガードし、`key`未設定の世界を安全に無視するよう変更。
2. スタイルカードのキー表示（`String(s.key).toUpperCase()`、keyが無いと
   "UNDEFINED"と表示されてしまう不具合になるところだった）を
   `s.key ? String(s.key).toUpperCase() : '·'`に変更。
3. 新しい世界`vintagejazz`（ヴィンテージジャズポップ）を`key`無しで追加。
   進行：Fmaj9→Dm9→Gm9→C13（I–vi–ii–V、ヘ長調）。
   `groove:'tambourine'`を初採用（grepで未使用を確認済み）。
   ピアノトリオ＋弦、LPFを使わない清潔な質感で『ローファイ』と差別化。
4. `WORLD_ORDER`に追加（16枚目）、コメント更新。
5. `index.html`に`--st-vintagejazz`のCSS変数を追加。
6. `はじめる.bat`のサーバーウィンドウ名を`stone-app-v10-server`に更新。
7. `card-gain.js`の`worlds`マップに`vintagejazz: {}`を追加。

## Check（確認）
- `node --check music.js` / `node --check app.js` → 構文OK
- 構造整合性チェック（Node、単一eval）：
  - WORLD_ORDER 16件・重複なし
  - 全世界・全キャラクター×役割の楽器レイヤーがVOICESに実在（missingVoice 0）
  - 全世界のgrooveがGROOVESに実在（missingGroove 0）
  - `key`を持つ世界15件・重複なし。`vintagejazz.key`が`undefined`であることを確認
  - vintagejazz世界の4和音すべてでlad/vc配列が厳密に昇順
  - `World.set('vintagejazz')`でbpm86・groove'tambourine'・4小節のroot音名が
    F/D/G/C（狙い通りI–vi–ii–Vの並び）を確認
- **未確認・要目視**：`key`無しのスタイルカードが実際にブラウザで正しく
  クリック選択できること、CSSグリッドが16枚でも崩れないこと
  （ブラウザ拡張が引き続き未接続のため、静的コード確認のみで済ませた）
- 実際に鳴らしての確認は今回省略（ユーザー指示により不要）

## Act（次への反映）
- キーの上限問題は解消したので、今後は世界の数を気にせず追加を続けられる。
- 9クラスタのうち①③⑤⑥⑦が実装済み。残り②クールジャズ/ピアノトリオ、
  ⑧モダンポップグルーヴ、⑨サンシャインポップが未着手。
- 次のサイクルの候補：
  a) 残りクラスタ（②⑧⑨）から次の世界を追加
  b) `key`無しカードのクリック選択を、可能なら実機（ブラウザ拡張が
     繋がったタイミング）で目視確認する
  c) GROOVESの残り（crescendoBig）を使う世界を作る
  d) 新しい世界にも試聴8周目方式の固有メロディを新規作曲して
     phraseOverridesで追加する
- 次はどれかを実施し、`stone-app-v11`として切り出す。
