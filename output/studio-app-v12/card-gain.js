/* =====================================================================
   card-gain.js — 各カードの音量（dB のオフセット）
   ミキサー画面（本編で M キー）が書き出したもの（2026/9/3 02:13）を基に、
   stone-app-v12で一部を music.js の既定値へ焼き込んだ（PDCA_v12.md参照）。
     実際に効く値 ＝ shared[札] ＋ worlds[いまの世界][札]
     0 は「music.js の編成表どおり」。ここに無い札は 0。
     _beat は札が0枚のときも鳴っている土台のビート。

   v18（stone-app-v12）での変更：5枚の和音カードが揃って-8.5〜-9dB
   下げられていた＝既定値そのものが間違っていたと判断し、ROLES.chord.gain
   を -5→-13.5 に焼き込んだ（詳細はmusic.js該当箇所とPDCA_v12.md）。
   4枚（core/sing/push/color-chord）は焼き込みで完全に0になったので削除。
   drive-chordだけ元が-9とわずかに深かったので、その差分(-0.5)だけ残す。 */

window.CARD_GAIN = {
  shared: {
    'core-bass':   -1,
    'drive-chord': -0.5,
    'push-melody': -1,
    'sing-bass':   -1,
  },

  worlds: {
    base:      {
      'core-melody':  10,
      'drive-melody': 7.5,
    },
    beatles:   {},
    kaze:      {},
    modal:     {},
    hisaishi:  {},
    citypop:   {},
    house:     {},
    lofi:      {},
    funk:      {},
    rock:      {},
    reggae:    {},
    flamenco:  {},
    swing:     {},
    motown:    {},
    rocknroll: {},
    synthpop:  {},
    vintagejazz: {},
    modernpop: {},
    sunshinepop: {},
  },
};
