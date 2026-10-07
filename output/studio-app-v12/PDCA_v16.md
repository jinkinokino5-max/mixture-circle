# stone-app-v16 PDCAログ（第10回）

恒久PDCAサイクル第10回。候補(c)「静かなバラード／ジャングリーポップ」の
grep調査と、候補(b)「新規メロディの追加」を実施。

## Plan（計画）
候補(a)：card-gain.jsを再確認したが、v15以降ユーザーの新しい操作データは
無かった（前バージョンと差分無し）。今回は空振り。

候補(c)：試聴5周目で確定した他の弱い組み合わせ
（「静かなバラード」＝piano+violin pad・ドラムなし、
「ジャングリーポップ」＝2本のarpギター）が既存18世界に紛れ込んでいないか
grep調査した。
- 2本のギターのみで構成された札は5件（beatles.push/rock.core/
  rock.push/rock.push.chord/flamenco.core）見つかったが、いずれも
  fuzz/power-chordの荒々しい編成か、flamenco（ジャンル的に妥当）で、
  「ジャングリーポップ」の"クリーンな2本のアルペジオ"とは質感が違う。
  **該当なし**と判断。
- 「violin+piano、ドラム低め」の組み合わせは5件見つかったが、
  いずれもrhythmGain -8dB程度（完全な無音ではない）で、round5の
  "ドラムなし"という極端な条件とは一致しない。vintagejazz.singは
  意図的なLaufey系バラードとして既に設計済み。**該当なし**と判断。
→ この調査は「見つからなかった」という結果を含めて記録する
  （何も直さなかったこと自体が今回の成果）。

候補(b)：phraseOverridesが無い18世界のうち、`vintagejazz`
（ヴィンテージジャズポップ）の「歌＝ヴァイオリン」札に、新規作曲した
固有メロディを追加した。理由：この世界は「内省的・親密なピアノトリオ」
というコンセプトが既に明確で、汎用の共有PHRASESでは"曲の物語"までは
表現しきれていなかったため。

## Do（実行）
1. 試聴8周目のM1〜M3と同じ手順で、Fmaj9→Dm9→Gm9→C13
   （vintagejazz世界の進行）専用の4小節メロディを新規作曲：
   - bar1(Fmaj9): C5→A4→C5→E5→F5（穏やかな入り、Fの主和音で終わる）
   - bar2(Dm9): F5→E5→D5→A4（下降、iiへ落ち着く）
   - bar3(Gm9): Bb4→D5→F5→G5（この曲のクライマックス、G5へ上昇）
   - bar4(C13): E5→D5→C5→A4（穏やかな着地、ドットクォーターで余韻）
   絶対音名で作曲→Nodeスクリプトで`vintagejazz.prog`のラダー番号（t）
   へ機械変換→逆変換（`ladSemi`+`noteName`）で原曲と完全一致することを
   確認、という試聴8周目と同じ厳密な手順を踏んだ。
2. `PHRASE_INTIMATE`として定義し、`vintagejazz.phraseOverrides.sing.melody`
   に接続。これはmotown世界以外でphraseOverridesを使う初めての例。
3. `index.html`のtitleとサーバーウィンドウ名をv16に更新。

## Check（確認）
- `node --check music.js` → 構文OK
- 構造整合性チェック：missingVoice 0・missingGroove 0
- `World.set('vintagejazz')`後、`World.phraseFor('sing','melody')`の
  4小節をラダー番号→絶対音名に逆変換し、作曲した原曲
  （C5 A4 C5 E5 F5 / F5 E5 D5 A4 / A#4(Bb4) D5 F5 G5 / E5 D5 C5 A4）と
  完全一致することを確認
- `World.set(null)`後は`phraseFor`がnullに戻り、他世界に影響しないことを確認
- 全コアJSファイルで`node --check`構文OK
- 実際に鳴らしての確認は今回省略（ユーザー指示により不要）

## Act（次への反映）
- phraseOverridesの仕組みが、motown以外の世界でも問題なく機能することを
  実証した。他の世界（特にコンセプトが明確な世界：sunshinepop、
  synthpopなど）にも同様に固有メロディを追加できる。
- 「静かなバラード」「ジャングリーポップ」調査は、既存18世界には
  該当が無いという結論で一区切り。今後新しい世界を追加する際に
  同じ組み合わせを避ければよい。
- 次のサイクルの候補：
  a) 他の世界（sunshinepop等）にも新規作曲メロディを追加する
  b) card-gain.jsの定点観測を継続
  c) 全18世界のリズム（rhythm札）の組み合わせも、試聴5周目データに
     照らして同様に点検する（今までmelodyしか見ていない）
- 次はどれかを実施し、`stone-app-v17`として切り出す。

## 付記：作業の一時中断について
本サイクルの実行中、ユーザーから「この改善作業の指示命令をまとめて
文章化してください」という別依頼が入り、一度作業を中断した
（`stone-app-v16/PDCA_指示命令まとめ.md`として作成）。その際、
`PHRASE_INTIMATE`の参照だけ書いて定義本体を書いていない状態
（構文的には有効だが`ReferenceError`になる状態）で止まっていたため、
指示書作成の前に完成させ、Node検証まで通してから本ログを書いている。
