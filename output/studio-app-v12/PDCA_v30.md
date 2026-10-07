# stone-app-v30 PDCAログ（第24回）— 恒久PDCAサイクル 最終回・目標到達

`stone-app-v18/PDCA_指示命令まとめ.md`が定めた到達目標
「`stone-app-v30`まで到達すること」を、本サイクルで達成した。

## Plan（計画）
候補(b)：card-gain.jsを再確認したが、v29以降ユーザーの新しい操作データは
無かった（差分無し）。恒久PDCAサイクルを通じて一度も新規データが
見つからなかった（後述の総括参照）。

候補(a)を実施：まだ固有メロディの無い残り4世界（citypop/lofi/rocknroll/
modernpop）のうち`citypop`を選んだ。世界内コメントに「16分で刻む
ギターと、裏で鳴るクラップ」「エレキギターのカッティング、エレキベース、
ドラム、エレクトリック・ピアノ、そこにストリングスとホーンセクション」
という編成の根拠が明示済みで、「軸＝ピアノとギターの土台」札
（core.melody）に新規作曲する。

## Do（実行）
1. v19以降の教訓どおり、先にFmaj9→E7(9)→Am9→G9（citypop世界の進行、
   IVmaj9と借用のE7）各コードのラダーが許す音名を洗い出してから作曲：
   - Fmaj9: C/D/E/F/G/A　E7(9): E/F#/G#/B/D
   - Am9: C/D/E/G/A　G9: D/F/G/A/B
   その上で、夏の夕方を思わせる弾むピアノの主旋律を新規作曲：
   - bar1(Fmaj9): C5→E5→G5→A5→G5（分散和音で明るく駆け上がる）
   - bar2(E7(9)): B4→G#4→F#4→E4（借用和音の緊張を含めて下降）
   - bar3(Am9): E5→C5→A4→G4（下降する滑らかなライン）
   - bar4(G9): A4→G4→F4→D4（穏やかな着地、次周回のFmaj9へつながる）
   絶対音名で作曲→Nodeスクリプトでラダー番号へ機械変換→逆変換で原曲と
   一致することを確認、という従来と同じ手順を踏んだ。
2. `PHRASE_TWILIGHTDRIVE`として定義（既存world keyと紛らわしくないか
   確認済み）、`citypop.phraseOverrides.core.melody`に接続。単独melody
   としては11例目、複合1例（funk）を含めると全体で15世界目。
3. `index.html`のtitleと`はじめる.bat`のサーバーウィンドウ名をv30に更新。
4. READMEを更新し、v30時点の全体構成を反映（後述）。

## Check（確認）
- `node --check music.js` → 構文OK
- `node --check` で他の全コアJSファイル（app.js/engine.js/cards.js/
  card-gain.js/stone-serial.js/stone-ui.js/mixer.js/samples.js/server.js/
  stone-matcher.js/fetch-samples.js）も構文OK
- 構造整合性チェック（Node、単一eval）：missingVoice 0・missingGroove 0・
  WORLD_ORDER 18件重複なし
- `World.set('citypop')`後、`World.phraseFor('core','melody')`の4小節を
  ラダー番号→絶対音名に逆変換し、作曲した原曲
  （C5 E5 G5 A5 G5 / B4 G#4 F#4 E4 / E5 C5 A4 G4 / A4 G4 F4 D4）と
  完全一致することを確認
- phraseOverridesを持つ全15世界（beatles・kaze・modal・hisaishi・
  citypop・house・funk・rock・reggae・flamenco・swing・motown・
  synthpop・vintagejazz・sunshinepop）の譜面がすべて4小節を保持し、
  今回の変更で壊れていないことをNodeで一括再確認
- `World.set(null)`後は`phraseFor`がnullに戻ることを確認
- 実際に鳴らしての確認は今回省略（ユーザー指示により不要）

## Act（次への反映）
残り固有メロディの無い世界（lofi/rocknroll/modernpopの3つ）と、
card-gain.jsの定点観測（今後もユーザー操作があれば継続監視の価値あり）が
次サイクル以降の候補として残っている。恒久PDCAサイクルとしての目標地点
`stone-app-v30`には到達したため、以降は`stone-app-v18/PDCA_指示命令
まとめ.md`の到達目標を満たした状態としてループを終了する。

---

## 総括：恒久PDCAサイクル 第10回〜第24回（stone-app-v16〜v30）

### 各サイクルで実装したこと
| バージョン | 回 | 実装内容 |
|---|---|---|
| v16 | 10 | 「静かなバラード」「ジャングリーポップ」grep調査（該当なし）／`vintagejazz`にPHRASE_INTIMATE（phraseOverrides初採用、motown以外で初） |
| v17 | 11 | `sunshinepop`にPHRASE_SUNSHINE |
| v18 | 12 | `synthpop`にPHRASE_NEON（作曲時にコードのラダーに無い音を使い変換失敗する教訓を得た） |
| v19 | 13 | `kaze`にPHRASE_KAZE（v18の教訓を反映し、先にラダーの許す音名を洗い出す手順を確立） |
| v20 | 14 | `hisaishi`にPHRASE_SORA（命名がworld keyと紛らわしくなった教訓を得て改名） |
| v21 | 15 | `beatles`にPHRASE_RIGBY（harmony:2の自動ハモリと組み合わせた初例） |
| v22 | 16 | rhythm札（groove/kit）を試聴5周目データに照らして点検（修正点なし、コード変更なし） |
| v23 | 17 | `reggae`にPHRASE_ONEDROP（bass役割へのphraseOverrides初適用） |
| v24 | 18 | `modal`にPHRASE_BLUEDORIAN（3小節目の半音上モード転換を反映） |
| v25 | 19 | `flamenco`にPHRASE_RASGUEADO（chord役割へのphraseOverrides初適用） |
| v26 | 20 | `house`にPHRASE_FOURFLOOR（rhythm役割へのphraseOverrides初適用——melody/bass/chord/rhythmの4役割制覇） |
| v27 | 21 | `swing`にPHRASE_SHOUTCHORUS |
| v28 | 22 | `funk`にPHRASE_ONETHECAT＋FUNK_BASS再利用（1世界内で2役割同時適用の初例） |
| v29 | 23 | `rock`にPHRASE_KASHMIR |
| v30 | 24 | `citypop`にPHRASE_TWILIGHTDRIVE、総括・README更新（本サイクル） |

### phraseOverridesの最終適用状況
**15世界**（motown・vintagejazz・sunshinepop・synthpop・kaze・
hisaishi・beatles・modal・flamenco・house・swing・funk・rock・
citypop、および元々v7で導入済みのmotown）で使用。内訳：
- melody：11世界（motown含む）で単独適用、funkは複合
- bass：motown（drive）・reggae（core）・funk（core、複合）の3例
- chord：flamenco（push）の1例
- rhythm：house（core）の1例
- 1世界内で複数役割を同時適用：funk（melody+bass）が唯一の例

残り固有メロディの無い世界：lofi・rocknroll・modernpopの3つ
（引継ぎ記録に残し、次サイクル以降の候補とする）。

### 確立された作曲・検証手法
1. **絶対音名で作曲→ラダー番号へ機械変換→逆変換で一致確認**
   （v16のPHRASE_INTIMATEから継続する基本手順）。
2. **v18の教訓**：melody役割は各コードのラダー配列（lad）に実在する
   音名だけを先に洗い出してから作曲すること。存在しない音を使うと
   Node変換が失敗する。
3. **v23・v25・v26で確立**：bass役割はc（コード相対index：0=ルート/
   1=5度/2=オクターブ/3=3度）形式、chord・rhythm役割は{s,v,l}や
   {s,p,v}形式で書けるため、絶対音名のラダー検証は不要。
4. **v20の教訓**：新規定数の命名は既存world key（beatles/kaze/modal等）
   と紛らわしくないか事前に確認する。
5. リズムの型（ワン・ドロップ、四つ打ち、ラスゲアードの3-3-2、ファンク
   ベース）は進行やコードに依存しないため、4小節とも同一パターンで
   繰り返す設計にする（FUNK_BASS・PHRASE_ONEDROP・PHRASE_RASGUEADO・
   PHRASE_FOURFLOOR共通の設計思想）。
6. 各サイクル共通のCheck手順：`node --check`（全コアJSファイル）、
   Node単一evalによる構造整合性チェック（missingVoice/missingGroove/
   WORLD_ORDER重複）、`World.set`→`World.phraseFor`での往復変換確認、
   既存phraseOverridesが壊れていないことの再確認。

### 今後の課題（次サイクル以降の候補）
- 残り3世界（lofi・rocknroll・modernpop）への固有メロディ追加。
- card-gain.js（ミキサー書き出しの音量調整データ）は、v12で一度
  焼き込んだ後、v16〜v30の全15サイクルを通じて**一度も新しいユーザー
  操作データが見つからなかった**。定点観測自体は継続する価値があるが、
  毎サイクルの空振りが常態化していたため、次回以降は頻度を落としても
  よい。
- 1世界内で3役割以上を同時に専用化する例はまだない（funkの2役割が
  最多）。
- 「静かなバラード」「ジャングリーポップ」以外の試聴5周目「弱い」判定
  （a1トランペット単体ユニゾン等）は既にv14〜v15で対応済み。
