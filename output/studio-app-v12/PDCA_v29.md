# stone-app-v29 PDCAログ（第23回）

恒久PDCAサイクル第23回。候補(a)：まだ固有メロディの無い世界へ新規作曲
メロディを追加する。次サイクルでいよいよ目標のv30に到達するため、
今回は総括の準備として着実に1世界を仕上げる。

## Plan（計画）
候補(b)：card-gain.jsを再確認したが、v28以降ユーザーの新しい操作データは
無かった（差分無し）。今回も空振り。

候補(a)を実施：`rock`（ハードロック）は世界内コメントに「音の芯は
歪んだギターを左右に2本置くこと」という編成の根拠が明示済みで、
まだ固有メロディが無かった。「軸＝リフとパワーコード。世界の芯」札
（core.melody）に新規作曲する。

## Do（実行）
1. v19以降の教訓どおり、先にEm→Cadd9→G→D（rock世界の進行、
   i–♭VI–♭III–♭VII）各コードのラダーが許す音名を洗い出してから作曲：
   - Em: E/G/A/B/D　Cadd9: C/D/E/G/A
   - G: B/D/E/G/A　D: D/E/F#/A/B
   その上で、歪んだツインギターのパワーリフを新規作曲：
   - bar1(Em): E4→G4→A4→B4（パワーリフで駆け上がる）
   - bar2(Cadd9): C4→D4→E4→G4（同じ形のまま平行移動、リフの反復感）
   - bar3(G): G4→B4→D5→E5（高音域へ駆け上がり、曲全体のピーク）
   - bar4(D): D5→B4→A4→E4（下降して着地、次周回のEmへつながる）
   絶対音名で作曲→Nodeスクリプトでラダー番号へ機械変換→逆変換で原曲と
   一致することを確認、という従来と同じ手順を踏んだ。
2. `PHRASE_KASHMIR`として定義（既存world keyと紛らわしくないか
   確認済み）、`rock.phraseOverrides.core.melody`に接続。melody9例
   （motown・vintagejazz・sunshinepop・synthpop・kaze・hisaishi・
   beatles・modal・swing）・複合1例（funk）に続き、単独melodyとしては
   10例目。
3. `index.html`のtitleと`はじめる.bat`のサーバーウィンドウ名をv29に更新。

## Check（確認）
- `node --check music.js` → 構文OK
- `node --check` で他の全コアJSファイル（app.js/engine.js/cards.js/
  card-gain.js/stone-serial.js/stone-ui.js/mixer.js/samples.js/server.js/
  stone-matcher.js/fetch-samples.js）も構文OK
- 構造整合性チェック（Node、単一eval）：missingVoice 0・missingGroove 0・
  WORLD_ORDER 18件重複なし
- `World.set('rock')`後、`World.phraseFor('core','melody')`の4小節を
  ラダー番号→絶対音名に逆変換し、作曲した原曲
  （E4 G4 A4 B4 / C4 D4 E4 G4 / G4 B4 D5 E5 / D5 B4 A4 E4）と
  完全一致することを確認
- 既存12世界（melody9例・複合1例（melody+bass）・bass1例・chord1例・
  rhythm1例）のphraseOverridesが今回の変更で壊れていないことをNodeで
  再確認
- `World.set(null)`後は`phraseFor`がnullに戻ることを確認
- 実際に鳴らしての確認は今回省略（ユーザー指示により不要）

## Act（次への反映）
- phraseOverridesを使った世界が13つになった（motown・vintagejazz・
  sunshinepop・synthpop・kaze・hisaishi・beatles・modal・flamenco・
  house・swing・funk・rock）。残り固有メロディの無い世界は
  citypop/lofi/rocknroll/modernpopの4つ。
- **次回いよいよ目標のstone-app-v30に到達する**。次サイクルでは
  以下を行う：
  1. 総括として、これまで13サイクル（v18〜v30）で積み上げた
     phraseOverridesの全体像（各役割の適用数・世界数）を整理する
  2. READMEを最終更新し、v30時点での全体構成を反映する
  3. `PDCA_v30.md`は通常の4節に加え、v18〜v30の全サイクルを振り返る
     総括セクションを設ける
  4. v30到達後はScheduleWakeupを呼ばず、ループを終了してユーザーに
     達成を報告する（指示書どおり）
- 次は`stone-app-v30`として切り出し、上記の総仕上げを行う。
