# stone-app-v18 PDCAログ（第12回）

恒久PDCAサイクル第12回。候補(a)：コンセプトが明確な他の世界にも
新規作曲メロディを追加する（motown→vintagejazz→sunshinepopに続く4例目）。

## Plan（計画）
候補(c)：card-gain.jsを再確認したが、v17以降ユーザーの新しい操作データは
無かった（差分無し）。今回も空振り。

候補(a)を実施：`synthpop`（レトロシンセポップ）は「きらめく・80年代」
という性格が明確で、まだ固有メロディが無かった。「芯＝シンセリード」札
（core.melody）に新規作曲する。

## Do（実行）
1. Dmaj9→A9→Bm9→Gmaj9（synthpop世界の進行）専用に、4小節の
   きらめく主旋律を新規作曲：
   - bar1(Dmaj9): D5→F#5→A5→D6→C#6（トニックの分散和音で駆け上がる）
   - bar2(A9): B5→A5→E5→C#5（9thから下降、Vコードの緊張）
   - bar3(Bm9): D6→C#6→B5→F#5（曲全体のピーク、D6から一気に開放して下降）
   - bar4(Gmaj9): G5→D5→B4→A4（穏やかな着地、次の周回のDmaj9へつながる）
   PHRASE_SUNSHINE（v17）と同じ厳密な手順（絶対音名で作曲→Nodeで
   ラダー番号へ機械変換→逆変換で原曲と一致確認）を踏んだ。作曲途中、
   各コードの梯子（lad配列）に含まれる音名のみで組み立てる必要がある
   ことを見落とし、A9小節でF#5（A9のコードトーンに無い音）を使おうと
   して変換に失敗——各コードのラダーが許す音名（Dmaj9:D/F#/A/C#/E、
   A9:A/C#/E/G/B、Bm9:B/D/F#/A/C#、Gmaj9:G/B/D/F#/A）を先に洗い出して
   から作り直した。
2. `PHRASE_NEON`として定義し、`synthpop.phraseOverrides.core.melody`
   に接続。motown・vintagejazz・sunshinepopに続き4例目のphraseOverrides
   活用。
3. `index.html`のtitleと`はじめる.bat`のサーバーウィンドウ名をv18に更新。

## Check（確認）
- `node --check music.js` → 構文OK
- `node --check` で他の全コアJSファイル（app.js/engine.js/cards.js/
  card-gain.js/stone-serial.js/stone-ui.js/mixer.js/samples.js/server.js/
  stone-matcher.js/fetch-samples.js）も構文OK
- 構造整合性チェック（Node、単一eval）：missingVoice 0・missingGroove 0・
  WORLD_ORDER 18件重複なし
- `World.set('synthpop')`後、`World.phraseFor('core','melody')`の
  4小節をラダー番号→絶対音名に逆変換し、作曲した原曲
  （D5 F#5 A5 D6 C#6 / B5 A5 E5 C#5 / D6 C#6 B5 F#5 / G5 D5 B4 A4）と
  完全一致することを確認
- 前2サイクルで追加した`vintagejazz`（sing.melody）・`sunshinepop`
  （core.melody）のphraseOverridesが今回の変更で壊れていないこと、
  `motown`のphraseOverridesも残っていることをNodeで再確認
- `World.set(null)`後は`phraseFor`がnullに戻ることを確認
- 実際に鳴らしての確認は今回省略（ユーザー指示により不要）

## Act（次への反映）
- phraseOverridesを使った世界が4つ（motown・vintagejazz・sunshinepop・
  synthpop）になった。作曲時は「各コードのラダー配列に実在する音名だけを
  使う」という制約を必ず先に確認すること——今回のA9での失敗は次回以降の
  教訓として残す。
- いずれもmelody役割・単一キャラクターへの適用に留まっている——
  bass/chord/rhythmへの拡張や、1つの世界で複数キャラクターへの適用は、
  FUNK_BASS（motownのdrive.bass）以外はまだ試していない。
- 次のサイクルの候補：
  a) まだ固有メロディの無い世界（beatles/kaze/modal/hisaishi/citypop/
     house/lofi/funk/rock/reggae/flamenco/swing/rocknroll/modernpop）
     に同様に追加する
  b) 全18世界のrhythm札の組み合わせを試聴5周目データに照らして点検する
     （今までmelody中心だった。ただし引継ぎ記録3-6「グルーヴより楽器
     編成の当たり外れが支配的」との記述があるため、成果が薄い可能性が
     ある点に留意）
  c) card-gain.jsの定点観測を継続
- 次はどれかを実施し、`stone-app-v19`として切り出す。
