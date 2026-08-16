/* =====================================================================
   music.js — STUDIO PULSE III（v6）の「音楽そのもの」の定義と生成
   =====================================================================
   v5 との決定的な違い：**演奏パターンをもう手で書かない。**

   v5 まで： pat: [{s:0,d:2,v:.85,l:'8n'}, {s:3,d:3,...}, ...] を
             120枚ぶん手書きしていた。同じ4小節が永遠に繰り返される。

   v6     ： 各カードは「どう弾くか」を **shape** として宣言するだけ。
             具体的な音符は、その小節ごとにエンジンが生成する。

               shape: { d:8, pref:[0,4,8,12], syn:.2, cont:'wave',
                        rng:[1,5], len:'8n', poly:1, vel:.7 }

             乱数は cardId と小節番号から決定的に作るので、
             同じ場所は何度再生しても必ず同じ音になる（録音とも一致する）。
             それでいて小節が進めば毎回ちがう音符が出る。

   これが効いてくるのは「音の数」だけではない。生成のときに
   **他のパートがどこを鳴らしているか（占有表）を見られる**ので、
   後から入ったパートが自動で隙間へ逃げる（＝掛け合いになる）。
   v5 で人力だった「賑やかなら余白、寂しいなら刻み」が自動で起きる。
   ---------------------------------------------------------------------
   このファイルが持つもの
     1〜4  音楽の理屈（調・コード・音名）        … v5 から変更なし
     5     グルーヴ（マイクロタイミング）の定義
     6     バリエーションの意味
     7     楽器 × 3つの shape（＝120枚のもと）
     8     カードへの展開
     9     ★ パターン生成エンジン
    10     曲の時間構造（章立て）

   音を鳴らす仕組み（Tone.js）は app.js 側にある。
   このファイルは音を一切鳴らさない純粋な計算だけなので、
   tools/ の検証スクリプトからそのまま読める。
   ===================================================================== */

/* ============ 1. 音の名前 ============ */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiToName(m) {
  const i = ((m % 12) + 12) % 12;
  return NOTE_NAMES[i] + (Math.floor(m / 12) - 1);
}
function midiOf(oct, semi) { return (oct + 1) * 12 + semi; }

/* Cナチュラルマイナー（＝E♭メジャー）。全カードがこの7音の世界にいる */
const SCALE = [0, 2, 3, 5, 7, 8, 10];
function scaleSemi(deg) {
  const i = ((deg % 7) + 7) % 7;
  return SCALE[i] + 12 * Math.floor(deg / 7);
}

/* ============ 2. コード ============ */
const QUALITY = {
  min7:  { tones: [0, 3, 7, 10], third: 3, seventh: 10, label: 'm7' },
  maj7:  { tones: [0, 4, 7, 11], third: 4, seventh: 11, label: 'M7' },
  min:   { tones: [0, 3, 7, 14], third: 3, seventh: 10, label: 'm' },
  maj:   { tones: [0, 4, 7, 14], third: 4, seventh: 11, label: '' },
  dom7:  { tones: [0, 4, 7, 10], third: 4, seventh: 10, label: '7' },
  sus4:  { tones: [0, 5, 7, 10], third: 5, seventh: 10, label: 'sus4' },
};

/* -6..+5 に畳み込む。コードが変わっても各パートの音域が跳ね回らない */
function fold(semi) { return ((semi + 6) % 12 + 12) % 12 - 6; }

function makeChord(rootPc, quality, name) {
  const q = QUALITY[quality];
  const voiced = [...new Set(q.tones.map(t => fold(rootPc + t)))].sort((a, b) => a - b);
  return {
    name, rootPc, quality, voiced, bassPc: fold(rootPc),
    third: q.third, seventh: q.seventh,
    label: NOTE_NAMES[rootPc] + q.label,
  };
}

const PROGRESSIONS = {
  night: {
    label: '夜', desc: '沈む・浮遊・切ない',
    bars: [makeChord(0, 'min7'), makeChord(8, 'maj7'), makeChord(3, 'maj7'), makeChord(10, 'maj')],
  },
  sunrise: {
    label: '陽', desc: '開ける・前へ・王道',
    bars: [makeChord(3, 'maj'), makeChord(10, 'maj'), makeChord(0, 'min7'), makeChord(8, 'maj')],
  },
  spell: {
    label: '呪', desc: '重い・執拗・トランス',
    bars: [makeChord(0, 'min7'), makeChord(0, 'min7'), makeChord(5, 'min7'), makeChord(5, 'min7')],
  },
  city: {
    label: '都', desc: '洒落た・都会・動く',
    bars: [makeChord(5, 'min7'), makeChord(10, 'dom7'), makeChord(3, 'maj7'), makeChord(8, 'maj7')],
  },
};
const PROG_ORDER = ['night', 'sunrise', 'spell', 'city'];

/* =====================================================================
   2b. 転調（案A）
   ---------------------------------------------------------------------
   v6 まで、4分間ずっと Cマイナー1つだった。どれだけ音符を工夫しても、
   調が動かないと「習作」の響きが残る。曲が大きく見えるかどうかは
   ここで決まる。

   ただし、この作品の生命線は「何と何を重ねても必ず噛み合う」こと。
   自由な転調を許すとそれが壊れる。そこで **共通音による転調** だけを許す。

     ・移調先は、いまのコードと **共通音を2つ以上** 持つ調に限る
     ・切り替えるのは章の変わり目だけ（曲の途中で唐突に動かさない）
     ・戻ってくる（最後は必ず元の調へ帰る）

   共通音が2つあると、耳は「同じ場所にいる」と感じたまま景色だけが変わる。
   これがいちばん安全で、いちばん効果の大きい転調のしかた。
   ---------------------------------------------------------------------
   key は「元の Cマイナーから何半音ずらすか」で表す。
   0=原調 / +5=Fマイナー方向 / −2=B♭マイナー方向 / +3=E♭（平行長調側）
   ===================================================================== */
const KEY_MOVES = [
  { semi:  0, label: '原', desc: 'もとの調' },
  { semi:  5, label: '沈', desc: '4度上（重くなる）' },
  { semi: -2, label: '翳', desc: '2度下（陰る）' },
  { semi:  3, label: '晴', desc: '3度上（明るく開ける）' },
  { semi: -5, label: '飛', desc: '5度下（遠くへ行く）' },
];

/* ふたつのコードの共通音（ピッチクラス）を数える */
function commonTones(chordA, shiftA, chordB, shiftB) {
  const pcs = (c, sh) => new Set(c.voiced.map(v => ((v + sh) % 12 + 12) % 12));
  const a = pcs(chordA, shiftA), b = pcs(chordB, shiftB);
  let n = 0; a.forEach(x => { if (b.has(x)) n++; });
  return n;
}

/* いまの調から安全に行ける移調先だけを返す --------------------------
   条件は2つあり、両方を満たす必要がある。

     ① いまの調と共通音が2つ以上（＝行きが滑らか）
     ② 原調とも共通音が2つ以上（＝**帰りも滑らか**）

   ②が要る理由：曲の終わりでは必ず原調へ帰す。行きだけを見て遠くまで
   行くと、帰り道が飛び石になって、そこだけ唐突に聞こえる。
   最初この②が無くて、検査が「-2→0 は共通音1個」と拾った。        */
function safeKeyMoves(progKey, fromSemi) {
  const first = PROGRESSIONS[progKey].bars[0];
  return KEY_MOVES.filter(m =>
    m.semi === fromSemi || (
      commonTones(first, fromSemi, first, m.semi) >= 2 &&
      commonTones(first, 0, first, m.semi) >= 2));
}

/* 章の並びに対して、どの章でどの調にいるかを決める --------------------
   決定的に作るので、同じ設定なら何度やっても同じ曲になる。
   導入と終盤は必ず原調（＝出て、帰ってくる）。                        */
function keyPlanFor(progKey, seed) {
  const rnd = makeRng((seed >>> 0) ^ 0x9E3779B9);
  const plan = [];
  let cur = 0;
  SECTIONS.forEach((sec, i) => {
    if (i === 0 || i >= SECTIONS.length - 2) { cur = 0; }        // 導入と終盤は原調
    else if (rnd() < 0.55) {
      const cands = safeKeyMoves(progKey, cur).filter(m => m.semi !== cur);
      if (cands.length) cur = cands[Math.floor(rnd() * cands.length)].semi;
    }
    plan.push({ key: sec.key, semi: cur });
  });
  return plan;
}
function keyLabel(semi) {
  const m = KEY_MOVES.find(k => k.semi === semi);
  return m ? m.label : String(semi);
}

/* コードを移調する。makeChord をやり直すので、畳み込み（fold）も
   かかり直して音域が跳ねない。下流（音名の解決・各パート）は
   「ただのコード」を受け取るだけなので、一切変更が要らない。      */
const _shiftCache = new Map();
function shiftChord(chord, semi) {
  if (!semi) return chord;
  const k = chord.rootPc + ':' + chord.quality + ':' + semi;
  let c = _shiftCache.get(k);
  if (!c) {
    c = makeChord(((chord.rootPc + semi) % 12 + 12) % 12, chord.quality);
    _shiftCache.set(k, c);
  }
  return c;
}

/* ============ 3. 構成音 → 実際の音名 ============ */
function toneMidi(chord, idx, oct) {
  const n = chord.voiced.length;
  const k = ((idx % n) + n) % n;
  const up = Math.floor(idx / n);
  return midiOf(oct, chord.voiced[k] + 12 * up);
}
function toneName(chord, idx, oct) { return midiToName(toneMidi(chord, idx, oct)); }
function scaleName(chord, deg, oct) { return midiToName(midiOf(oct, scaleSemi(deg))); }

/* =====================================================================
   3b. 和音の積み方 ── 臨界帯域（ERB）で決まる最小間隔（案1）
   ---------------------------------------------------------------------
   なぜ必要か。2つの音が内耳の同じフィルタ（臨界帯域）に入ると、
   音程比とは無関係に必ず濁る。臨界帯域は低音ほど音楽的な音程で見て
   広いので、**同じ長3度でも中音域では澄み、低音域では濁る**。
   （Huron 2001「最小マスキング原理」／Plomp & Levelt 1965
     → reference/音の重ね方リサーチ.md §2）

   本アプリはここを踏み外していた。CHORD 10楽器のうち7楽器が oct:3 で、
   generateBar は構成音の**連続インデックス**（deg, deg+1, deg+2）を
   積む＝密集配置。実際に Cm7 を oct:3 で積むと

       G2(98.0Hz) → A#2(116.5Hz) → C3(130.8Hz)

   となり、隣どうしの差は 18.5Hz と 14.3Hz。その帯域の ERB は約 36Hz
   なので、**3つとも同じ臨界帯域の中**に入っている。これでは音量を
   いくら上げても濁って聞こえるだけになる。

   直し方：構成音を下から積むとき、直前の音から 1 ERB 以上あくまで
   構成音を1つずつ上へ読み飛ばす。「下は広く、上は詰めて」が自動的に
   実現され、必要な場所だけが動く（十分あいている音は動かない）。

     ERB(f) = 24.7 × (4.37 × f/1000 + 1)   [Hz]  (Glasberg & Moore 1990)
   ===================================================================== */
function erbHz(f) { return 24.7 * (4.37 * f / 1000 + 1); }
function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

/* この音の上に音を置くとき、濁らないために必要な最小間隔（半音） */
function minSpacingSemis(midi) {
  const f = midiToHz(midi);
  return 12 * Math.log2((f + erbHz(f)) / f);
}

/* 低音：0=ルート 1=5度 2=オクターブ上 3=3度 4=7度 5=4度（経過音） */
const BASS_OFFSET = [0, 7, 12, null, null, 5];
function bassName(chord, code, oct) {
  let off = BASS_OFFSET[code];
  if (code === 3) off = chord.third;
  if (code === 4) off = chord.seventh;
  if (off == null) off = 0;
  return midiToName(midiOf(oct, chord.bassPc + off));
}

/* ============ 4. ROLE（4分類） ============ */
const ROLES = {
  melody: {
    label: 'MELODY', jp: 'メロディ', role: '曲の「顔」',
    desc: '主旋律。曲の印象をいちばん動かす',
    keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], max: 2, band: 'mid',
  },
  chord: {
    label: 'CHORD', jp: 'コード', role: '曲の「空間」',
    desc: '和音。厚みと明暗をつくる',
    keys: ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'], max: 2, band: 'mid',
  },
  bass: {
    label: 'BASS', jp: 'ベース', role: '曲の「足元」',
    desc: '低音。安定とグルーヴを支える',
    keys: ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'], max: 1, band: 'low',
  },
  rhythm: {
    label: 'RHYTHM', jp: 'リズム', role: '曲の「動き」',
    desc: '拍。身体を動かしたくさせる',
    keys: ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'], max: 3, band: 'high',
  },
};
const ROLE_ORDER = ['melody', 'chord', 'bass', 'rhythm'];

/* =====================================================================
   5. グルーヴ（案4：マイクロタイミングを一級の模型にする）
   ---------------------------------------------------------------------
   v5 は time に ±3ms の独立乱数を足すだけだった。人間の揺れは
   「前の音のずれを引きずる」ので、独立乱数はかえって機械的に聞こえる。

     push   … 拍に対する平均のずれ(ms)。負＝前ノリ、正＝後ノリ
     tight  … ばらつきの大きさ(ms)。小さいほど正確
     drag   … 直前のずれをどれだけ引きずるか(0..1)。1次自己回帰
     accent … 16ステップごとのベロシティ倍率

   ベースとキックが前に、ハットとサックスが後ろに寄ることで、
   同じ音符でも「打ち込み」から「演奏」になる。
   ===================================================================== */
const ACCENT = {
  /* 4つ打ち的：表拍が強い */
  straight: [1.15, .70, .85, .72, 1.05, .70, .88, .72, 1.10, .70, .85, .72, 1.02, .70, .88, .78],
  /* 裏拍が強い（跳ねもの・カッティング向け） */
  offbeat:  [.80, .95, .72, 1.05, .82, .95, .74, 1.08, .80, .95, .72, 1.05, .84, .98, .78, 1.10],
  /* ほぼ平ら（パッド・持続音向け） */
  flat:     [1, .96, .98, .96, 1, .96, .98, .96, 1, .96, .98, .96, 1, .96, .98, .98],
};

const GROOVE = {
  /* 既定値。楽器ごとに上書きできる */
  default: { push: 0, tight: 4, drag: .55, accent: 'straight' },

  /* 足元は気持ち前へ。走って聞こえる */
  bass:    { push: -7, tight: 3, drag: .60, accent: 'straight' },
  /* 太鼓の土台は正確に。ここが揺れると全部が揺れる */
  kit:     { push: -2, tight: 2.5, drag: .50, accent: 'straight' },
  /* 金物は後ろへ。前に詰まらず、抜けが出る */
  hat:     { push: 9, tight: 5, drag: .55, accent: 'offbeat' },
  /* 管は息の分だけ遅れる */
  wind:    { push: 12, tight: 7, drag: .65, accent: 'straight' },
  /* 弓は立ち上がりが遅い */
  bow:     { push: 15, tight: 8, drag: .70, accent: 'flat' },
  /* 撥弦はほぼ正確、わずかに前 */
  pluck:   { push: -3, tight: 4, drag: .55, accent: 'offbeat' },
  /* 鍵盤は素直 */
  key:     { push: 0, tight: 4, drag: .55, accent: 'straight' },
  /* 機械は揺れない */
  machine: { push: 0, tight: 0.8, drag: .30, accent: 'straight' },
  /* パッドは発音がぼやけるので揺れが見えない */
  pad:     { push: 0, tight: 6, drag: .70, accent: 'flat' },
};

/* =====================================================================
   5b. 音色の可変化（案C）
   ---------------------------------------------------------------------
   v6 までは、強く弾いても弱く弾いても **音量が変わるだけ** だった。
   実際の楽器は、弱く吹いたサックスは丸く、強く吹くと開く。
   ピアノも弱打は柔らかく、強打は硬い。この「音色そのものの変化」が
   無いと、どれだけ音符を工夫しても機械が鳴っている印象が残る。

   ここでは各カードの lp（ローパス）を「いちばん開いたときの明るさ」と
   読み替えて、弱い音ほど閉じる。

     cut = lp × ( open + (1 − open) × v ^ curve )

     open  … いちばん弱いときにどこまで閉じるか（0.3 なら 3割の高さまで）
     curve … 効き方。小さいほど弱音側で急に閉じる

   v=1 でちょうど lp になるので、**設定した明るさより明るくはならない**。
   実測で合わせた音量バランスを壊しにくい向きに倒してある。
   ===================================================================== */
const TIMBRE = {
  default: { open: .50, curve: .70 },
  /* 息もの：弱いと丸く、強いと開く。いちばん効果が分かりやすい */
  wind:    { open: .32, curve: .60 },
  /* 弓もの：弱音はほとんど倍音が出ない */
  bow:     { open: .34, curve: .65 },
  /* 撥弦：爪の当たりが強さで変わる */
  pluck:   { open: .45, curve: .70 },
  /* 鍵盤：ハンマーの硬さ */
  key:     { open: .42, curve: .75 },
  /* 面で支える音はあまり変わらない（変えると不安定に聞こえる） */
  pad:     { open: .68, curve: .90 },
  /* 機械は素直に。ただし完全に一定だと硬すぎる */
  machine: { open: .62, curve: .80 },
  /* 太鼓と金物：強打ほど明るい */
  kit:     { open: .55, curve: .65 },
  hat:     { open: .48, curve: .60 },
  bass:    { open: .52, curve: .70 },
};

/* =====================================================================
   5d. ロングトーンの脈動（案H）
   ---------------------------------------------------------------------
   v6.1 までは、音は「鳴り始め」と「鳴り終わり」しかなかった。
   四分音符より長く伸びる音は、伸びている間ずっと無表情のまま。
   人が長い音を伸ばすときは、必ず微かに揺れる（本物のビブラートは
   ピッチが揺れるが、この合成器の構成（PolySynthを含む）で全楽器に
   安全にピッチ自動化を掛けるのは壊れやすいので、ここでは
   「音量」と「明るさ（lp）」を同時にごく僅か脈動させて、
   同じ「歌っている」感触を作る。新しいノードは作らない
   （すでにある gain と lp に値を置いていくだけ）。

     rate  … 脈動の速さ（Hz）。速すぎるとトレモロに、遅すぎると
             ただの音量変化に聞こえるので 4〜6Hz 帯に収めてある
     delay … 鳴ってから脈動が始まるまでの間（秒）。人が音を伸ばす
             ときの「ワンテンポ遅れて揺れ出す」感じを作る
     amp   … 音量の揺れ幅（比率。.04 なら ±4%≈±0.35dB）
     bright… 明るさ（lp周波数）の揺れ幅（比率）

   四分音符未満の短い音には掛けない（わざとらしくなるため）。       */
const EXPR = {
  default: { rate: 5.0, delay: .16, amp: .035, bright: .05 },
  /* 息もの：揺らす楽器の代表。いちばん深くする */
  wind:    { rate: 5.4, delay: .14, amp: .05,  bright: .09 },
  /* 弓もの：ビブラートの本場 */
  bow:     { rate: 5.6, delay: .12, amp: .045, bright: .08 },
  /* 撥弦：減衰していく音なので浅めに */
  pluck:   { rate: 4.6, delay: .20, amp: .025, bright: .04 },
  /* 鍵盤：ロングトーンでもほぼ揺れない（サスティンペダルの伸び） */
  key:     { rate: 4.4, delay: .24, amp: .018, bright: .025 },
  /* 面で支える音：目立たない程度にゆったり */
  pad:     { rate: 3.8, delay: .30, amp: .022, bright: .035 },
  /* 機械はほぼ揺れない。完全な無表情だけは避ける */
  machine: { rate: 5.0, delay: .18, amp: .012, bright: .02 },
  kit:     { rate: 5.0, delay: .18, amp: .015, bright: .02 },
  hat:     { rate: 5.0, delay: .18, amp: .015, bright: .02 },
  /* 低音は動かしすぎると芯がぶれるので最小限 */
  bass:    { rate: 4.2, delay: .22, amp: .015, bright: .02 },
};

/* =====================================================================
   5c. 空間（案D）
   ---------------------------------------------------------------------
   v6 まで、全パートが左右の中央・同じ距離で鳴っていた。
   実際の演奏では、ドラムとベースは真ん中、ギターは左、鍵盤は右、
   というふうに **場所が分かれている**。これが無いと、何枚重ねても
   「1つのスピーカーから全部出ている」窮屈さが残る。

     pan   … 左右 −1（左）〜 +1（右）
     depth … 奥行き 0（手前）〜 1（奥）。奥ほど残響が増え、高域が減る

   決め方の原則：
     ・低音（ベース）と土台（キック）は必ず真ん中。左右に振ると芯がぶれる
     ・同じ ROLE の2枚は左右に分かれる（重ねたとき混ざらないように）
     ・面で支える音（パッド・ストリングス）は奥へ。前に出ると邪魔になる
   ===================================================================== */
const SPACE = {
  /* ROLE ごとの基本位置。同じ ROLE の2枚目は左右反転して置く */
  melody: { pan: -0.22, depth: 0.20 },
  chord:  { pan:  0.26, depth: 0.42 },
  bass:   { pan:  0.00, depth: 0.05 },   // 足元は動かさない
  rhythm: { pan:  0.00, depth: 0.15 },
};

/* 楽器ごとの微調整。実際の編成での立ち位置に近づける */
const SPACE_TWEAK = {
  'chord-strings': { depth: 0.72 }, 'chord-pad': { depth: 0.78 },
  'chord-horn':    { depth: 0.66 }, 'chord-harmonium': { depth: 0.55 },
  'chord-cutting': { pan: 0.44, depth: 0.22 },
  'chord-aguitar': { pan: 0.38 },   'chord-harp': { pan: 0.34, depth: 0.38 },
  'melody-eguitar': { pan: -0.36 }, 'melody-nylon': { pan: -0.30 },
  'melody-violin':  { depth: 0.46 }, 'melody-flute': { pan: -0.14, depth: 0.36 },
  'melody-trumpet': { pan: -0.28, depth: 0.30 }, 'melody-trombone': { pan: -0.18, depth: 0.32 },
  'rhythm-shaker': { pan:  0.40 },  'rhythm-bongo': { pan: -0.42 },
  'rhythm-ride':   { pan:  0.30 },  'rhythm-xylo':  { pan: -0.34, depth: 0.30 },
};

/* ============ 6. バリエーションの意味 ============ */
const VARIATIONS = [
  { n: 1, label: '基本', desc: 'その楽器の代表的な弾き方' },
  { n: 2, label: '余白', desc: '音数が少なく長い。賑やかな音の下に敷く' },
  { n: 3, label: '刻み', desc: '音数が多く短い。疎な音の上に乗せる' },
];

/* =====================================================================
   7. 楽器 × 3つの shape
   ---------------------------------------------------------------------
   shape に書けるもの（すべて省略可・既定値あり）

     d      1小節あたりの音数（＝密度）。これが変化1/2/3 の正体
     pref   好むステップ。ここは選ばれやすくなる
     syn    シンコペーション 0..1。上げると裏拍に寄る
     cont   音の輪郭  up / down / arch / valley / wave / static
     rng    構成音インデックスの範囲 [低, 高]（bass では使わない）
     len    基本の音価。次の音までの隙間で自動的に詰められる
     poly   同時発音数。2以上で和音になる
     vel    基準ベロシティ
     walk   bass 専用。root（根音中心）/ move（動く）/ walk（歩く）
     glue   1.0 に近いほど「前の小節と似た形」になる（persistence）

   sound（音色・音量・帯域）は **楽器ごとに1つだけ**。
   バリエーションはそれを共有するので、
   「ギター1は良いがギター3だけ大きい」が構造的に起きない。
   gain は v5 で実際に書き出して LUFS で測った値をそのまま引き継いでいる。
   trim は変化どうしの音量をそろえるためだけの補正（tools が自動計算）。
   ===================================================================== */
const INSTRUMENTS = {

  /* ================= MELODY ＝ 曲の「顔」 ================= */
  'melody-piano': {
    label: 'ピアノ', groove: 'key',
    sound: { kind: 'sampler', set: 'piano', fb: 'poly', oct: 4, hp: 180, lp: 12000,
             gain: -2, centroid: 776, rev: .16, dly: .10, duck: true, env: { attack: 0, release: 1.2 } },
    variants: [
      { tag: '粒だつ・輪郭が立つ', trim: -1.5, shape: { d: 8, pref: [0, 4, 8, 12], syn: .25, cont: 'wave', rng: [1, 5], len: '8n', vel: .78 } },
      { tag: '余白・一音ずつ置く', trim: 1, shape: { d: 3, syn: .1, cont: 'arch', rng: [2, 6], len: '2n', vel: .76, glue: .7 } },
      { tag: '刻み・転がる16分', trim: 2.5,   shape: { d: 13, syn: .35, cont: 'wave', rng: [0, 6], len: '16n', vel: .55 } },
    ],
  },
  'melody-eguitar': {
    label: 'エレキギター', groove: 'pluck',
    /* 音源が C5 まで。rng の上を 5 くらいに抑えないと移調で痩せる */
    sound: { kind: 'sampler', set: 'guitar-electric', fb: 'pluck', oct: 4, hp: 150, lp: 7000,
             gain: -4, centroid: 747, rev: .12, dly: .14, drive: .28, duck: true, env: { attack: .002, release: .5 } },
    variants: [
      { tag: '前に出る・叫ぶ', trim: -1,   shape: { d: 8, pref: [0, 3, 6, 8, 11], syn: .35, cont: 'arch', rng: [0, 4], len: '8n', vel: .82 } },
      { tag: '余白・伸ばして泣く', trim: 2, shape: { d: 2, syn: 0, cont: 'up', rng: [3, 5], len: '2n', vel: .82, glue: .8 } },
      { tag: '刻み・単音リフ',   shape: { d: 12, pref: [0, 4, 8, 12], syn: .3, cont: 'static', rng: [0, 3], len: '16n', vel: .58 } },
    ],
  },
  'melody-nylon': {
    label: 'ナイロンギター', groove: 'pluck',
    sound: { kind: 'sampler', set: 'guitar-nylon', fb: 'pluck', oct: 4, hp: 160, lp: 6500,
             gain: 1, centroid: 1148, rev: .20, dly: .08, duck: true, env: { attack: .002, release: .8 } },
    variants: [
      { tag: '爪弾く・角が丸い', trim: -1,   shape: { d: 7, syn: .2, cont: 'wave', rng: [2, 6], len: '8n', vel: .68 } },
      { tag: '余白・ぽつりと置く', trim: 2.5, shape: { d: 2, syn: .1, cont: 'down', rng: [3, 6], len: '2n', vel: .70, glue: .75 } },
      { tag: '刻み・アルペジオ', trim: -0.5,   shape: { d: 13, syn: .15, cont: 'up', rng: [0, 7], len: '16n', vel: .50 } },
    ],
  },
  'melody-sax': {
    label: 'サックス', groove: 'wind',
    sound: { kind: 'sampler', set: 'saxophone', fb: 'brass', oct: 4, hp: 200, lp: 8500,
             gain: -10, centroid: 1717, rev: .22, dly: .12, duck: true, env: { attack: .02, release: .5 } },
    variants: [
      { tag: '息づかい・後ノリ', trim: -1,   shape: { d: 6, pref: [2, 6, 10, 14], syn: .45, cont: 'arch', rng: [2, 6], len: '4n', vel: .66 } },
      { tag: '余白・ロングトーン', shape: { d: 2, syn: .2, cont: 'up', rng: [4, 7], len: '2n', vel: .70, glue: .8 } },
      { tag: '刻み・走句', trim: 0.5,         shape: { d: 12, syn: .3, cont: 'wave', rng: [1, 7], len: '16n', vel: .48 } },
    ],
  },
  'melody-clarinet': {
    label: 'クラリネット', groove: 'wind',
    sound: { kind: 'sampler', set: 'clarinet', fb: 'brass', oct: 4, hp: 180, lp: 7000,
             gain: -13.5, centroid: 872, rev: .22, dly: .08, duck: true, env: { attack: .03, release: .6 } },
    variants: [
      { tag: '木の温度・語る', trim: -1.5,   shape: { d: 6, syn: .2, cont: 'arch', rng: [1, 5], len: '4n', vel: .64 } },
      { tag: '余白・低く伸ばす', trim: 0.5, shape: { d: 2, syn: 0, cont: 'static', rng: [0, 2], len: '2n', vel: .92, glue: .85 } },
      { tag: '刻み・跳ねる',     shape: { d: 12, syn: .4, cont: 'wave', rng: [1, 6], len: '16n', vel: .48 } },
    ],
  },
  'melody-flute': {
    label: 'フルート', groove: 'wind',
    /* 音源は C4..E6。oct5 なので rng の上は 5 くらいまで */
    sound: { kind: 'sampler', set: 'flute', fb: 'bell', oct: 5, hp: 400, lp: 11000,
             gain: -11, centroid: 1509, rev: .26, dly: .18, duck: true, env: { attack: .03, release: .5 } },
    variants: [
      { tag: '軽い・舞う', trim: -1.5,       shape: { d: 7, pref: [4, 5, 6, 7, 12], syn: .3, cont: 'up', rng: [2, 5], len: '16n', vel: .52 } },
      { tag: '余白・遠くで鳴る', trim: -1.5, shape: { d: 2, syn: .1, cont: 'arch', rng: [2, 5], len: '2n', vel: .56, glue: .8 } },
      { tag: '刻み・さえずる', trim: 0.5,   shape: { d: 13, syn: .35, cont: 'wave', rng: [1, 5], len: '16n', vel: .40 } },
    ],
  },
  'melody-violin': {
    label: 'ヴァイオリン', groove: 'bow',
    sound: { kind: 'sampler', set: 'violin', fb: 'bow', oct: 4, hp: 240, lp: 9000,
             gain: -14, centroid: 2413, rev: .28, dly: .06, duck: true, env: { attack: .06, release: .8 } },
    variants: [
      { tag: '伸びる・のぼる', trim: -1,     shape: { d: 4, syn: .1, cont: 'up', rng: [3, 6], len: '2n', vel: .60 } },
      { tag: '余白・1小節を1音で', trim: 2.5, shape: { d: 1, syn: 0, cont: 'static', rng: [4, 5], len: '1n', vel: .62, glue: .9 } },
      { tag: '刻み・短く弓を返す', shape: { d: 10, syn: .2, cont: 'wave', rng: [3, 7], len: '16n', vel: .45 } },
    ],
  },
  'melody-trumpet': {
    label: 'トランペット', groove: 'wind',
    sound: { kind: 'sampler', set: 'trumpet', fb: 'brass', oct: 4, hp: 220, lp: 9000,
             gain: -8.5, centroid: 1047, rev: .20, dly: .10, duck: true, env: { attack: .012, release: .35 } },
    variants: [
      { tag: '高らか・宣言する', trim: -1.5,   shape: { d: 5, pref: [0, 4, 8, 13], syn: .2, cont: 'up', rng: [4, 7], len: '4n', vel: .74 } },
      { tag: '余白・ファンファーレ', trim: 0.5, shape: { d: 2, syn: 0, cont: 'up', rng: [5, 8], len: '2n', vel: .76, glue: .8 } },
      { tag: '刻み・畳みかける', trim: 1,   shape: { d: 11, syn: .35, cont: 'arch', rng: [3, 8], len: '16n', vel: .52 } },
    ],
  },
  'melody-trombone': {
    label: 'トロンボーン', groove: 'wind',
    sound: { kind: 'sampler', set: 'trombone', fb: 'brass', oct: 3, hp: 110, lp: 6000,
             gain: -12, centroid: 923, rev: .22, dly: .05, duck: true, env: { attack: .02, release: .5 } },
    variants: [
      { tag: '太く歌う・滑る', trim: -2.5,     shape: { d: 5, syn: .15, cont: 'arch', rng: [1, 4], len: '4n', vel: .70 } },
      { tag: '余白・地を這う持続', trim: 1.5, shape: { d: 1, syn: 0, cont: 'static', rng: [0, 1], len: '1n', vel: .72, glue: .9 } },
      { tag: '刻み・合いの手',     shape: { d: 10, pref: [2, 3, 6, 7, 10, 11, 14], syn: .5, cont: 'wave', rng: [1, 4], len: '16n', vel: .54 } },
    ],
  },
  'melody-lead': {
    label: 'シンセリード', groove: 'machine',
    sound: { kind: 'synth', fb: 'lead', oct: 5, hp: 420, lp: 9000,
             gain: -14.5, centroid: 2766, rev: .10, dly: .22, duck: true },
    variants: [
      { tag: '刻む・突き刺す', trim: -1.5,     shape: { d: 11, syn: .3, cont: 'wave', rng: [0, 6], len: '16n', vel: .72 } },
      { tag: '余白・1音で引っぱる', shape: { d: 2, syn: 0, cont: 'up', rng: [4, 6], len: '2n', vel: .74, glue: .85 } },
      { tag: '刻み・32分の連射', trim: 1,   shape: { d: 15, syn: .25, cont: 'up', rng: [0, 7], len: '16n', vel: .50 } },
    ],
  },

  /* ================= CHORD ＝ 曲の「空間」 ================= */
  'chord-piano': {
    label: 'ピアノ', groove: 'key',
    sound: { kind: 'sampler', set: 'piano', fb: 'poly', oct: 3, hp: 160, lp: 8000,
             gain: -3.5, centroid: 578, rev: .18, dly: .04, duck: true, env: { attack: 0, release: .9 } },
    variants: [
      { tag: '裏で刻む・軽い和音', trim: -0.5, shape: { d: 5, pref: [2, 6, 10, 14], syn: .55, cont: 'static', rng: [0, 2], len: '8n', poly: 3, vel: .48 } },
      { tag: '余白・頭で1回だけ', trim: 2.5,   shape: { d: 1, syn: 0, cont: 'static', rng: [0, 1], len: '1n', poly: 4, vel: .48, glue: .9 } },
      { tag: '刻み・16分で散らす', trim: 0.5, shape: { d: 11, syn: .45, cont: 'static', rng: [0, 3], len: '16n', poly: 3, vel: .34 } },
    ],
  },
  'chord-aguitar': {
    label: 'アコギ', groove: 'pluck',
    sound: { kind: 'sampler', set: 'guitar-acoustic', fb: 'pluck', oct: 3, hp: 140, lp: 7500,
             gain: -6, centroid: 555, rev: .16, dly: .05, duck: true, env: { attack: .002, release: .6 } },
    variants: [
      { tag: 'かき鳴らす・体温', trim: -1.5,   shape: { d: 8, pref: [0, 4, 8, 12], syn: .3, cont: 'static', rng: [0, 2], len: '8n', poly: 3, vel: .55 } },
      { tag: '余白・ゆっくり分散', trim: -2.5, shape: { d: 4, syn: .1, cont: 'up', rng: [0, 3], len: '4n', poly: 2, vel: .66, glue: .7 } },
      { tag: '刻み・8分の空ピック混じり', shape: { d: 12, syn: .4, cont: 'static', rng: [0, 3], len: '16n', poly: 3, vel: .36 } },
    ],
  },
  'chord-cutting': {
    label: 'カッティング', groove: 'pluck',
    sound: { kind: 'sampler', set: 'guitar-electric', fb: 'pluck', oct: 3, hp: 320, lp: 6500,
             gain: -6, centroid: 688, rev: .10, dly: .08, drive: .12, duck: true, env: { attack: .002, release: .12 } },
    variants: [
      { tag: '16分で切る・跳ねる', trim: 0.5, shape: { d: 8, pref: [1, 3, 5, 9, 11, 13, 15], syn: .8, cont: 'static', rng: [1, 3], len: '16n', poly: 3, vel: .46 } },
      { tag: '余白・裏だけ入れる', shape: { d: 3, pref: [6, 14], syn: .9, cont: 'static', rng: [1, 3], len: '16n', poly: 3, vel: .58 } },
      { tag: '刻み・全16分', trim: 2,       shape: { d: 14, syn: .5, cont: 'static', rng: [1, 4], len: '16n', poly: 3, vel: .32 } },
    ],
  },
  'chord-organ': {
    label: 'オルガン', groove: 'pad',
    sound: { kind: 'sampler', set: 'organ', fb: 'pad', oct: 3, hp: 170, lp: 6000,
             gain: -16, centroid: 1261, rev: .20, dly: 0, duck: true, env: { attack: .04, release: .5 } },
    variants: [
      { tag: '面で支える・持続', shape: { d: 2, syn: 0, cont: 'static', rng: [0, 1], len: '2n', poly: 4, vel: .38 } },
      { tag: '余白・1小節ずっと', trim: 2.5, shape: { d: 1, syn: 0, cont: 'static', rng: [0, 1], len: '1n', poly: 4, vel: .36, glue: .95 } },
      { tag: '刻み・8分で押す', trim: -0.5,   shape: { d: 8, syn: .25, cont: 'static', rng: [0, 3], len: '8n', poly: 3, vel: .30 } },
    ],
  },
  'chord-harmonium': {
    label: 'ハルモニウム', groove: 'pad',
    sound: { kind: 'sampler', set: 'harmonium', fb: 'pad', oct: 3, hp: 190, lp: 5200,
             gain: -15, centroid: 1596, rev: .26, dly: .04, duck: true, env: { attack: .10, release: .9 } },
    variants: [
      { tag: '息のあるオルガン・にじむ', trim: 1, shape: { d: 1, syn: 0, cont: 'static', rng: [0, 1], len: '1n', poly: 3, vel: .40 } },
      { tag: '余白・2音だけで支える', trim: 1,   shape: { d: 1, syn: 0, cont: 'static', rng: [0, 1], len: '1n', poly: 2, vel: .42, glue: .95 } },
      { tag: '刻み・ふいごを煽る',     shape: { d: 6, syn: .3, cont: 'static', rng: [0, 2], len: '8n', poly: 3, vel: .32 } },
    ],
  },
  'chord-harp': {
    label: 'ハープ', groove: 'pluck',
    /* 音源は C3(48)..G5(79)。oct3 だと下へ9半音はみ出したので oct4 にした。
       rng の上も 5 までに抑えて、上下とも音源の中に収めている。       */
    sound: { kind: 'sampler', set: 'harp', fb: 'bell', oct: 4, hp: 220, lp: 10000,
             gain: -2, centroid: 534, rev: .26, dly: .12, duck: true, env: { attack: 0, release: 1.4 } },
    variants: [
      { tag: '滴る・分散和音', trim: -1.5,   shape: { d: 8, syn: .15, cont: 'up', rng: [0, 5], len: '8n', vel: .48 } },
      { tag: '余白・ひと撫でだけ', shape: { d: 3, pref: [0, 1, 2], syn: 0, cont: 'up', rng: [0, 4], len: '2n', vel: .50, glue: .6 } },
      { tag: '刻み・きらめき続ける', trim: 1, shape: { d: 13, syn: .3, cont: 'wave', rng: [0, 5], len: '16n', vel: .36 } },
    ],
  },
  'chord-strings': {
    label: 'ストリングス', groove: 'bow',
    sound: { kind: 'sampler', set: 'violin', fb: 'bow', oct: 4, hp: 260, lp: 7000,
             gain: -15, centroid: 2292, rev: .34, dly: 0, duck: true, env: { attack: .25, release: 1.6 } },
    variants: [
      { tag: '包む・ふくらむ',   shape: { d: 1, syn: 0, cont: 'static', rng: [2, 3], len: '1n', poly: 3, vel: .40 } },
      { tag: '余白・遠くでひとつ', trim: 1, shape: { d: 1, syn: 0, cont: 'static', rng: [3, 4], len: '1n', poly: 2, vel: .38, glue: .95 } },
      { tag: '刻み・短く弓を刻む', trim: -1.5, shape: { d: 8, syn: .2, cont: 'static', rng: [2, 5], len: '16n', poly: 3, vel: .32 } },
    ],
  },
  'chord-brass': {
    label: 'ブラス', groove: 'wind',
    sound: { kind: 'sampler', set: 'trumpet', fb: 'brass', oct: 4, hp: 220, lp: 8000,
             gain: -12, centroid: 943, rev: .18, dly: .06, duck: true, env: { attack: .012, release: .30 } },
    variants: [
      { tag: '一撃・合いの手',   shape: { d: 3, pref: [4, 10, 12], syn: .4, cont: 'static', rng: [2, 4], len: '8n', poly: 3, vel: .60 } },
      { tag: '余白・頭で一発だけ', shape: { d: 1, syn: 0, cont: 'static', rng: [2, 3], len: '4n', poly: 3, vel: .66, glue: .8 } },
      { tag: '刻み・スタブの連打', trim: 1.5, shape: { d: 9, syn: .45, cont: 'static', rng: [2, 5], len: '16n', poly: 3, vel: .42 } },
    ],
  },
  'chord-horn': {
    label: 'ホルン', groove: 'pad',
    /* 音源は C4 と D5 の間が 14 半音あいている。rng は 3 までに抑える */
    sound: { kind: 'sampler', set: 'french-horn', fb: 'pad', oct: 3, hp: 150, lp: 4800,
             gain: -9.5, centroid: 440, rev: .30, dly: 0, duck: true, env: { attack: .12, release: 1.0 } },
    variants: [
      { tag: '丸い面・遠くで鳴る', shape: { d: 1, syn: 0, cont: 'static', rng: [0, 1], len: '1n', poly: 3, vel: .42 } },
      { tag: '余白・低く長く', trim: 1.5,     shape: { d: 1, syn: 0, cont: 'static', rng: [0, 0], len: '1n', poly: 2, vel: .44, glue: .95 } },
      /* ホルンは音源が太く、3和音で刻むと trim の下限でも足りなかったので
         vel 側も下げてある（tools/measure-loudness.mjs の実測による）    */
      { tag: '刻み・呼びかける', trim: -2.5,   shape: { d: 5, syn: .3, cont: 'static', rng: [0, 2], len: '8n', poly: 3, vel: .28 } },
    ],
  },
  'chord-pad': {
    label: 'シンセパッド', groove: 'pad',
    sound: { kind: 'synth', fb: 'pad', oct: 3, hp: 200, lp: 4200,
             gain: -20.5, centroid: 1604, rev: .34, dly: .08, duck: true },
    variants: [
      { tag: '奥行き・にじむ',   shape: { d: 1, syn: 0, cont: 'static', rng: [0, 1], len: '1n', poly: 3, vel: .42 } },
      { tag: '余白・霧のように', trim: 1.5, shape: { d: 1, syn: 0, cont: 'static', rng: [0, 0], len: '1n', poly: 2, vel: .40, glue: .95 } },
      { tag: '刻み・脈打つ',     shape: { d: 5, syn: .2, cont: 'static', rng: [0, 2], len: '8n', poly: 3, vel: .34 } },
    ],
  },

  /* ================= BASS ＝ 曲の「足元」 ================= */
  'bass-ebass': {
    label: 'エレキベース', groove: 'bass',
    sound: { kind: 'sampler', set: 'bass-electric', fb: 'mono', oct: 2, hp: 32, lp: 1600,
             gain: -7, centroid: 332, rev: .03, dly: 0, duck: true, env: { attack: .002, release: .25 } },
    variants: [
      { tag: 'キックに張りつく', trim: -2, shape: { d: 7, pref: [0, 3, 6, 8, 11, 14], syn: .35, walk: 'move', len: '8n', vel: .90 } },
      { tag: '余白・ルートを踏むだけ', trim: 3, shape: { d: 2, syn: 0, walk: 'root', len: '2n', vel: .92, glue: .9 } },
      { tag: '刻み・16分で走る', shape: { d: 13, syn: .3, walk: 'move', len: '16n', vel: .62 } },
    ],
  },
  'bass-upright': {
    label: 'ウッドベース', groove: 'bass',
    sound: { kind: 'sampler', set: 'contrabass', fb: 'mono', oct: 2, hp: 30, lp: 1200,
             gain: -13.5, centroid: 380, rev: .06, dly: 0, duck: true, env: { attack: .01, release: .35 } },
    variants: [
      { tag: '歩く・呼吸する', trim: -2,     shape: { d: 5, pref: [0, 4, 8, 12], syn: .15, walk: 'walk', len: '4n', vel: .78 } },
      { tag: '余白・2分音符で構える', trim: 0.5, shape: { d: 2, syn: 0, walk: 'root', len: '2n', vel: .80, glue: .85 } },
      { tag: '刻み・4分ウォーキング', shape: { d: 9, syn: .25, walk: 'walk', len: '8n', vel: .62 } },
    ],
  },
  'bass-cello': {
    label: 'チェロ', groove: 'bow',
    sound: { kind: 'sampler', set: 'cello', fb: 'bow', oct: 2, hp: 40, lp: 2600,
             gain: -9, centroid: 553, rev: .18, dly: 0, duck: true, env: { attack: .08, release: .9 } },
    variants: [
      { tag: '伸ばす・沈む',   shape: { d: 2, syn: 0, walk: 'root', len: '2n', vel: .62 } },
      { tag: '余白・1音で1小節', trim: 2.5, shape: { d: 1, syn: 0, walk: 'root', len: '1n', vel: .62, glue: .95 } },
      { tag: '刻み・弓を返して押す', trim: -1.5, shape: { d: 8, syn: .25, walk: 'move', len: '8n', vel: .52 } },
    ],
  },
  'bass-tuba': {
    label: 'チューバ', groove: 'wind',
    sound: { kind: 'sampler', set: 'tuba', fb: 'mono', oct: 2, hp: 26, lp: 900,
             gain: -9, centroid: 284, rev: .08, dly: 0, duck: true, env: { attack: .03, release: .5 } },
    variants: [
      { tag: '生の重低音・ふくらむ', trim: -0.5, shape: { d: 4, pref: [0, 6, 8, 14], syn: .2, walk: 'root', len: '4n', vel: .84 } },
      { tag: '余白・息を長く', trim: 5.5,   shape: { d: 1, syn: 0, walk: 'root', len: '1n', vel: .84, glue: .95 } },
      { tag: '刻み・2拍で踏む',   shape: { d: 8, syn: .2, walk: 'move', len: '8n', vel: .66 } },
    ],
  },
  'bass-bassoon': {
    label: 'バスーン', groove: 'wind',
    /* 音源の最低音が G2 なので oct3（テノール域）で「歌うベース」にする */
    sound: { kind: 'sampler', set: 'bassoon', fb: 'mono', oct: 3, hp: 60, lp: 2000,
             gain: -12, centroid: 540, rev: .14, dly: 0, duck: true, env: { attack: .02, release: .45 } },
    variants: [
      { tag: '木の中低音・語尾がある', trim: -2.5, shape: { d: 6, syn: .25, walk: 'move', len: '8n', vel: .76 } },
      { tag: '余白・ぽつぽつ置く', trim: 0.5,   shape: { d: 2, syn: .1, walk: 'root', len: '2n', vel: .76, glue: .85 } },
      { tag: '刻み・跳ね回る',       shape: { d: 12, syn: .4, walk: 'move', len: '16n', vel: .56 } },
    ],
  },
  'bass-organ': {
    label: 'オルガンベース', groove: 'pad',
    sound: { kind: 'sampler', set: 'organ', fb: 'pad', oct: 2, hp: 30, lp: 900,
             gain: -14, centroid: 625, rev: .05, dly: 0, duck: true, env: { attack: .03, release: .4 } },
    variants: [
      { tag: '途切れない・地鳴り', trim: -1, shape: { d: 3, syn: .1, walk: 'root', len: '2n', vel: .68 } },
      { tag: '余白・1小節ずっと踏む', trim: 3.5, shape: { d: 1, syn: 0, walk: 'root', len: '1n', vel: .68, glue: .95 } },
      { tag: '刻み・8分で押し続ける', shape: { d: 9, syn: .2, walk: 'move', len: '8n', vel: .54 } },
    ],
  },
  'bass-pianolow': {
    label: 'ピアノ（低音）', groove: 'key',
    sound: { kind: 'sampler', set: 'piano', fb: 'poly', oct: 2, hp: 40, lp: 2200,
             gain: -3, centroid: 509, rev: .08, dly: 0, duck: true, env: { attack: 0, release: .7 } },
    variants: [
      { tag: '打楽器のような低音', trim: -2, shape: { d: 5, pref: [0, 6, 8, 12], syn: .25, walk: 'oct', len: '8n', vel: .70 } },
      { tag: '余白・オクターブで置く', shape: { d: 2, syn: 0, walk: 'oct', len: '2n', vel: .70, glue: .9 } },
      /* 変化3だけ音源を casio に。Gs1〜A2 の13音しか無いので
         オクターブ上（walk:'oct'）は音域外になる。使わないこと。 */
      { tag: 'ローファイ鍵盤・つぶれた低音', trim: 3.5, set: 'casio',
        shape: { d: 12, syn: .3, walk: 'move', len: '16n', vel: .52 } },
    ],
  },
  'bass-synth': {
    label: 'シンセベース', groove: 'machine',
    sound: { kind: 'synth', fb: 'mono', oct: 2, hp: 34, lp: 1800,
             gain: -14.5, centroid: 727, rev: .02, dly: 0, duck: true },
    variants: [
      { tag: '弾む・跳ねる', trim: -1.5,   shape: { d: 9, syn: .4, walk: 'move', len: '16n', vel: .82 } },
      { tag: '余白・低く置いておく', shape: { d: 2, syn: 0, walk: 'root', len: '2n', vel: .86, glue: .9 } },
      { tag: '刻み・全16分', trim: 1.5,   shape: { d: 15, syn: .25, walk: 'move', len: '16n', vel: .56 } },
    ],
  },
  'bass-fuzz': {
    label: 'ファズベース', groove: 'machine',
    sound: { kind: 'synth', fb: 'fuzz', oct: 2, hp: 40, lp: 2400,
             gain: -21, centroid: 790, rev: .04, dly: 0, drive: .55, duck: true },
    variants: [
      { tag: '歪む・押し出す', trim: -2, shape: { d: 8, pref: [0, 4, 8, 12], syn: .3, walk: 'move', len: '8n', vel: .86 } },
      { tag: '余白・唸らせておく', shape: { d: 2, syn: 0, walk: 'root', len: '2n', vel: .86, glue: .9 } },
      { tag: '刻み・轟音の連打', trim: 1, shape: { d: 12, syn: .3, walk: 'move', len: '16n', vel: .60 } },
    ],
  },
  'bass-sub': {
    label: 'サブベース', groove: 'machine',
    sound: { kind: 'synth', fb: 'sub', oct: 2, hp: 24, lp: 260,
             gain: -19.5, centroid: 67, rev: 0, dly: 0, duck: true },
    variants: [
      { tag: '床が鳴る・重い', trim: -0.5,   shape: { d: 3, pref: [0, 10, 14], syn: .2, walk: 'root', len: '2n', vel: .92 } },
      { tag: '余白・1小節を1音で', shape: { d: 1, syn: 0, walk: 'root', len: '1n', vel: .94, glue: .95 } },
      { tag: '刻み・8分で揺らす', trim: 1, shape: { d: 8, syn: .2, walk: 'root', len: '8n', vel: .74 } },
    ],
  },

  /* =================================================================
     RHYTHM ＝ 曲の「動き」
     ドラムだけは shape ではなく **ステップ配列のまま**にしてある。
     四つ打ちは 0/4/8/12 でなければ四つ打ちではないし、ブレイクビーツの
     つんのめりは具体的な位置そのものが正体だから。ここを生成にすると
     「そのリズムらしさ」が消える。
     ただし v6 では
       ・フィル（8小節ごとのタム回し）は生成する
       ・ハットは占有表を見て自動で間引かれる
     ので、固定配列のままでも毎回同じにはならない。
     ================================================================= */
  'rhythm-kit': {
    label: '生ドラム', groove: 'kit',
    sound: { kind: 'kit', set: 'acoustic-kit', gain: -8.5, centroid: 4689, hp: 28, lp: 16000, rev: .07 },
    variants: [
      { tag: '王道・8ビート', trim: -2,
        drum: { k: [0, 7, 10], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], hv: .30,
                h3: [1, 3, 5, 7, 9, 11, 13, 15], ghost: [6, 14], oh: [14], cr: [0], hasKick: true } },
      { tag: '余白・2拍4拍だけ', set: 'R8',
        drum: { k: [0, 8], s: [4, 12], h: [], hv: .30,
                h3: [2, 6, 10, 14], cr: [0], hasKick: true } },
      { tag: '刻み・畳みかける', trim: 2, set: 'Stark',
        drum: { k: [0, 3, 7, 10, 14], s: [4, 12], h: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], hv: .20,
                ghost: [2, 6, 10, 14], oh: [7, 15], cr: [0], crEvery: 4, hasKick: true } },
    ],
  },
  'rhythm-break': {
    label: 'ブレイクビーツ', groove: 'kit',
    sound: { kind: 'kit', set: 'breakbeat13', gain: -10.5, centroid: 1371, hp: 40, lp: 15000, rev: .10 },
    variants: [
      { tag: '転がる・つんのめる',
        drum: { k: [0, 2, 9], s: [4, 11, 12], h: [0, 3, 6, 8, 10, 14], hv: .34,
                h3: [1, 5, 7, 13, 15], ghost: [7, 15], t: [13], oh: [10], cr: [0], hasKick: true } },
      { tag: '余白・骨だけ残す', trim: 2,
        drum: { k: [0, 9], s: [4, 12], h: [], hv: .34,
                h3: [2, 6, 10, 14], ghost: [7], cr: [0], hasKick: true } },
      { tag: '刻み・アーメン風', trim: -1.5, set: 'Kit8',
        drum: { k: [0, 2, 6, 9, 11], s: [4, 7, 12, 14], h: [0, 1, 3, 5, 6, 8, 10, 11, 13, 15], hv: .24,
                ghost: [1, 5, 10, 15], oh: [6], t: [13], cr: [0], crEvery: 4, hasKick: true } },
    ],
  },
  'rhythm-four': {
    label: '四つ打ち', groove: 'machine',
    sound: { kind: 'kit', set: 'Techno', gain: -10, centroid: 1911, hp: 30, lp: 16000, rev: .06 },
    variants: [
      { tag: '止まらない・前へ', trim: -1,
        drum: { k: [0, 4, 8, 12], s: [4, 12], h: [2, 6, 10, 14], hv: .38,
                h3: [1, 3, 5, 7, 9, 11, 13, 15], oh: [2, 6, 10, 14], cr: [0], hasKick: true } },
      { tag: '余白・キックだけ',
        drum: { k: [0, 4, 8, 12], s: [], h: [], hv: .38,
                h3: [2, 6, 10, 14], oh: [14], cr: [0], hasKick: true } },
      { tag: '刻み・裏で埋め尽くす', trim: 1, set: '4OP-FM',
        drum: { k: [0, 4, 8, 12], s: [4, 12], h: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], hv: .18,
                ghost: [3, 7, 11, 15], oh: [2, 6, 10, 14], cr: [0], crEvery: 4, hasKick: true } },
    ],
  },
  'rhythm-machine': {
    label: 'ドラムマシン', groove: 'machine',
    sound: { kind: 'kit', set: 'CR78', gain: -8, centroid: 4116, hp: 34, lp: 16000, rev: .05 },
    variants: [
      { tag: '機械的・細かい', trim: 1,
        drum: { k: [0, 6, 11], s: [4, 12], h: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], hv: .18,
                ghost: [10], cr: [0], crEvery: 16, hasKick: true } },
      { tag: '余白・点滅するだけ', set: 'KPR77',
        drum: { k: [0, 8], s: [12], h: [4, 12], hv: .22,
                h3: [2, 6, 10, 14], cr: [0], crEvery: 16, hasKick: true } },
      { tag: '刻み・詰め込む', trim: -1.5, set: '4OP-FM',
        drum: { k: [0, 3, 6, 8, 11, 14], s: [4, 12], h: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], hv: .16,
                ghost: [2, 5, 9, 13], oh: [7, 15], cr: [0], crEvery: 4, hasKick: true } },
    ],
  },
  'rhythm-linn': {
    label: '80sマシン', groove: 'machine',
    sound: { kind: 'kit', set: 'LINN', gain: -8, centroid: 3074, hp: 32, lp: 16000, rev: .22 },
    variants: [
      { tag: '硬い・広い・レトロ',
        drum: { k: [0, 3, 8], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], hv: .22,
                t: [14], oh: [6], cr: [0], hasKick: true } },
      { tag: '余白・ゲートスネアだけ', trim: 1,
        drum: { k: [0, 8], s: [4, 12], h: [], hv: .22,
                h3: [2, 6, 10, 14], cr: [0], hasKick: true } },
      { tag: '刻み・タム連打', trim: -4, set: 'Kit3',
        drum: { k: [0, 3, 8, 11], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], hv: .18,
                t: [2, 10], t2: [6], t3: [14], oh: [7], cr: [0], crEvery: 4, hasKick: true } },
    ],
  },
  'rhythm-stark': {
    label: 'ロックキット', groove: 'kit',
    sound: { kind: 'kit', set: 'Stark', gain: -5.5, centroid: 5326, hp: 30, lp: 16000, rev: .16 },
    variants: [
      { tag: '生々しい・叩きつける',
        drum: { k: [0, 6, 8], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], hv: .32,
                h3: [1, 5, 9, 13], ghost: [7], oh: [10], cr: [0], crEvery: 4, hasKick: true } },
      { tag: '余白・大きく構える', trim: 2,
        drum: { k: [0, 8], s: [4, 12], h: [], hv: .32,
                h3: [2, 6, 10, 14], oh: [14], cr: [0], crEvery: 4, hasKick: true } },
      { tag: '刻み・手数で押す', trim: -6, set: 'R8',
        drum: { k: [0, 3, 8, 11], s: [4, 12], h: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], hv: .14,
                ghost: [2, 6, 10, 14], oh: [7], cr: [0], crEvery: 4, hasKick: true } },
    ],
  },

  /* ---- キックを持たない「薄い層」。どのリズムの上にも安全に重なる ---- */
  'rhythm-xylo': {
    label: '木琴', groove: 'pluck',
    /* 音源は G4/C5/G5/C6/G6 の5音。打楽器的に使うので移調幅は許容 */
    sound: { kind: 'sampler', set: 'xylophone', fb: 'bell', oct: 5, hp: 500, lp: 12000,
             gain: -5, centroid: 1477, rev: .16, dly: .16, duck: true, env: { attack: 0, release: .4 } },
    variants: [
      { tag: '音程のあるリズム・跳ねる', trim: -1, shape: { d: 8, syn: .35, cont: 'wave', rng: [0, 5], len: '16n', vel: .58 } },
      { tag: '余白・ぽーん、ぽーん',     shape: { d: 2, syn: .1, cont: 'arch', rng: [0, 4], len: '8n', vel: .60, glue: .7 } },
      { tag: '刻み・転がり続ける',       shape: { d: 13, syn: .4, cont: 'wave', rng: [0, 6], len: '16n', vel: .44 } },
    ],
  },
  'rhythm-shaker': {
    label: 'シェイカー', groove: 'hat',
    sound: { kind: 'kit', set: 'acoustic-kit', gain: -1.5, centroid: 7704, hp: 400, lp: 16000, rev: .10 },
    variants: [
      { tag: '裏を刻む・前へ押す',
        drum: { k: [], s: [], h: [1, 3, 5, 7, 9, 11, 13, 15], hv: .30,
                h3: [0, 2, 4, 6, 8, 10, 12, 14], hasKick: false } },
      { tag: '余白・4分だけ振る', trim: 1,
        drum: { k: [], s: [], h: [2, 6, 10, 14], hv: .34,
                h3: [0, 4, 8, 12], hasKick: false } },
      { tag: '刻み・全16分で埋める', trim: -1,
        drum: { k: [], s: [], h: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], hv: .22,
                hasKick: false } },
    ],
  },
  'rhythm-bongo': {
    label: 'ボンゴ', groove: 'hat',
    sound: { kind: 'kit', set: 'Bongos', gain: -8, centroid: 564, hp: 120, lp: 16000, rev: .14 },
    variants: [
      { tag: '手で叩く・隙間を埋める',
        drum: { k: [], s: [5, 13], h: [2, 8, 11, 14], hv: .28, t: [0, 6, 9],
                h3: [1, 4, 7, 10, 13], hasKick: false } },
      { tag: '余白・合いの手だけ', trim: 0.5,
        drum: { k: [], s: [], h: [6, 14], hv: .30, t: [0], t2: [8],
                h3: [2, 10], hasKick: false } },
      { tag: '刻み・手数で煽る',
        drum: { k: [], s: [3, 7, 11, 15], h: [0, 2, 4, 6, 8, 10, 12, 14], hv: .20,
                t: [1, 9], t2: [5], t3: [13], h3: [1, 5, 9, 13], hasKick: false } },
    ],
  },
  'rhythm-ride': {
    label: 'ライド', groove: 'hat',
    /* シンバルは合成（samples.js の makeCymbals）。キットは音を借りるだけ */
    sound: { kind: 'kit', set: 'acoustic-kit', gain: 11.5, centroid: 7813, hp: 300, lp: 16000, rev: .18 },
    variants: [
      { tag: '金物で刻む・濁らない', trim: -0.5,
        drum: { k: [], s: [], h: [], hv: 0, rd: [0, 4, 6, 8, 12, 14], rv: .55, hasKick: false } },
      { tag: '余白・4分で鳴らす', trim: -1,
        drum: { k: [], s: [], h: [], hv: 0, rd: [0, 4, 8, 12], rv: .60, hasKick: false } },
      { tag: '刻み・全8分＋アクセント', trim: 1,
        drum: { k: [], s: [], h: [], hv: 0, rd: [0, 2, 4, 6, 8, 10, 12, 14], rv: .42,
                oh: [7, 15], hasKick: false } },
    ],
  },
};

/* ROLE ごとの楽器の並び（＝画面の列順・キー順）。10楽器 × 4役割 ＝ 40楽器 */
const INSTRUMENT_ORDER = {
  melody: ['melody-piano', 'melody-eguitar', 'melody-nylon', 'melody-sax', 'melody-clarinet',
           'melody-flute', 'melody-violin', 'melody-trumpet', 'melody-trombone', 'melody-lead'],
  chord:  ['chord-piano', 'chord-aguitar', 'chord-cutting', 'chord-organ', 'chord-harmonium',
           'chord-harp', 'chord-strings', 'chord-brass', 'chord-horn', 'chord-pad'],
  bass:   ['bass-ebass', 'bass-upright', 'bass-cello', 'bass-tuba', 'bass-bassoon',
           'bass-organ', 'bass-pianolow', 'bass-synth', 'bass-fuzz', 'bass-sub'],
  rhythm: ['rhythm-kit', 'rhythm-break', 'rhythm-four', 'rhythm-machine', 'rhythm-linn',
           'rhythm-stark', 'rhythm-xylo', 'rhythm-shaker', 'rhythm-bongo', 'rhythm-ride'],
};

/* ============ 8. 楽器 × バリエーション → カード（120枚）============
   カードID は '<楽器ID>-<番号>'。RFID のカード1枚 ＝ このID1つ。       */
const CARDS = {};
const CARD_ORDER = {};

ROLE_ORDER.forEach(rk => {
  CARD_ORDER[rk] = [];
  INSTRUMENT_ORDER[rk].forEach(instId => {
    const inst = INSTRUMENTS[instId];
    inst.variants.forEach((va, i) => {
      const id = `${instId}-${i + 1}`;
      /* set / oct などの上書きがあるものだけ sound を複製する。
         無ければ楽器の sound をそのまま共有＝音量も必ず共有される。 */
      const over = {};
      ['set', 'oct', 'drive', 'hp', 'lp'].forEach(k => { if (k in va) over[k] = va[k]; });
      if (va.trim) over.gain = inst.sound.gain + va.trim;
      const sound = Object.keys(over).length ? Object.assign({}, inst.sound, over) : inst.sound;

      CARDS[id] = {
        id, inst: instId, n: i + 1, role: instId.split('-')[0],
        label: inst.label, tag: va.tag,
        sound, shape: va.shape, drum: va.drum,
        groove: GROOVE[inst.groove] || GROOVE.default,
        /* 音色の変化のしかたも、グルーヴと同じ「楽器の系統」で決まる。
           楽器ごとに書き分けなくてよいように groove 名を流用している。 */
        timbre: TIMBRE[inst.groove] || TIMBRE.default,
        /* 立ち位置。ROLE の基本 ＋ 楽器ごとの微調整 */
        space: Object.assign({}, SPACE[instId.split('-')[0]], SPACE_TWEAK[instId] || {}),
        /* 案H：ロングトーンの脈動も同じ「楽器の系統」で決まる */
        expr: EXPR[inst.groove] || EXPR.default,
      };
      CARD_ORDER[rk].push(id);
    });
  });
});

/* =====================================================================
   9. ★ パターン生成エンジン（案2）
   ===================================================================== */

/* ---- 決定的な乱数。同じ (カード, 小節) なら必ず同じ数列 -------------
   これがないと、録音を聴き返したときに演奏が変わってしまう。        */
function hashSeed(str, bar, salt) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= Math.imul(bar + 1, 2654435761); h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= Math.imul((salt || 0) + 1, 40503);
  return h >>> 0;
}
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- 拍の強さ。0拍目がいちばん強く、裏拍は弱い ---- */
const METRIC = [10, 1, 3, 1.5, 7, 1, 3, 1.5, 9, 1, 3, 1.5, 7, 1, 3, 2];

/* ---- どのステップに音を置くかの重み ------------------------------
   ここが案1（衝突回避）と案2（生成）の合流点。
   occ は「他のパートがそのステップをどれだけ埋めているか」0..N。   */
function stepWeights(shape, occ) {
  const syn = shape.syn || 0;
  const w = new Float64Array(16);
  for (let i = 0; i < 16; i++) {
    let base = METRIC[i];
    /* シンコペーション：上げるほど裏拍（奇数ステップ）へ寄る */
    base *= (i % 2 === 1) ? (1 + 3.2 * syn) : (1 - 0.45 * syn);
    if (shape.pref && shape.pref.indexOf(i) >= 0) base *= 2.4;
    /* 他のパートが鳴っている場所は避ける（＝隙間へ逃げる） */
    if (occ) base /= (1 + 2.2 * occ[i]);
    w[i] = Math.max(0.02, base);
  }
  return w;
}

/* ---- 重みつきで n 個のステップを選ぶ（重複なし） ---- */
function pickSteps(w, n, rnd) {
  const pool = Float64Array.from(w);
  const chosen = [];
  n = Math.max(0, Math.min(n, 16));
  for (let k = 0; k < n; k++) {
    let total = 0;
    for (let i = 0; i < 16; i++) total += pool[i];
    if (total <= 1e-9) break;
    let r = rnd() * total, idx = 15;
    for (let i = 0; i < 16; i++) { r -= pool[i]; if (r <= 0) { idx = i; break; } }
    chosen.push(idx);
    pool[idx] = 0;
    /* 隣を少し抑える。全部が団子にならないための「呼吸」 */
    if (idx > 0) pool[idx - 1] *= 0.5;
    if (idx < 15) pool[idx + 1] *= 0.5;
  }
  return chosen.sort((a, b) => a - b);
}

/* ---- 音の輪郭。0..1 を返す ---- */
function contourAt(cont, t, rnd) {
  switch (cont) {
    case 'up':     return t;
    case 'down':   return 1 - t;
    case 'arch':   return 1 - Math.abs(2 * t - 1);
    case 'valley': return Math.abs(2 * t - 1);
    case 'wave':   return 0.5 + 0.5 * Math.sin(t * Math.PI * 2 - Math.PI / 2);
    default:       return 0.5 + (rnd() - 0.5) * 0.35;   // static
  }
}

/* ---- ベースの音を拍の強さで選ぶ --------------------------------
   強拍は必ずルート。弱拍ほど動ける。これで何を生成しても足元が崩れない。 */
function bassCode(step, walk, rnd) {
  const strong = step % 8 === 0;
  const mid = step % 4 === 0;
  if (walk === 'oct') return strong ? 0 : (mid ? 0 : (rnd() < .5 ? 1 : 3));
  if (strong) return 0;
  if (walk === 'root') return rnd() < .75 ? 0 : 1;
  if (mid) return [0, 0, 1, 3][Math.floor(rnd() * 4)];
  if (walk === 'walk') return [0, 1, 3, 5, 4][Math.floor(rnd() * 5)];
  return [0, 1, 3, 5][Math.floor(rnd() * 4)];   // move
}

const LEN_STEPS = { '1n': 16, '2n': 8, '4n': 4, '8n': 2, '16n': 1 };
const STEPS_LEN = { 16: '1n', 8: '2n', 4: '4n', 2: '8n', 1: '16n' };

/* =====================================================================
   generateBar — カード1枚の、1小節ぶんの音符を作る
   ---------------------------------------------------------------------
     card   … CARDS の1つ
     bar    … 何小節目か（0から）
     energy … 1..3。密度に効く
     occ    … 他のパートの占有表（Float32Array(16)）。無くてもよい
     thin   … アレンジ・エンジンからの間引き係数（0..1）
   戻り値は v5 と同じ形の配列 [{s, d, v, l}, ...] なので、
   app.js の再生側は v5 のものがほぼそのまま使える。
   ===================================================================== */
function generateBar(card, bar, energy, occ, thin) {
  const shape = card.shape;
  if (!shape) return [];

  /* glue（前の小節と似せる度合い）が高いカードは、種を数小節に1回しか
     変えない。パッドのように「ずっと同じでいてほしい」音のため。      */
  const glue = shape.glue || 0;
  const period = glue >= .9 ? 8 : glue >= .7 ? 4 : glue >= .5 ? 2 : 1;
  const seedBar = Math.floor(bar / period);
  const rnd = makeRng(hashSeed(card.id, seedBar, 0));

  /* --- 案G：周期の多様化 ----------------------------------------------
     v6.1までは、どのカードも「1小節でひと回り」だった。
     period（glueから決まる、種を変える間隔）が1より大きいカードは、
     せっかく数小節も同じ種のまま鳴らすのに、小節ごとの表情は変わらず
     ずっと平坦だった。ここでは period 分を「1つのフレーズ」とみなし、
     phase（0→1、フレーズの中の進み具合）で輪郭と密度に緩やかな
     弧を作る。period=1（ほとんどのカード）は phase=0 のままなので、
     この案の影響を一切受けない。                                     */
  const phase = period > 1 ? (bar % period) / period : 0;

  /* 密度：ENERGY と間引きで増減する。フレーズの後半ほど僅かに満ちる */
  const e = [0.72, 1.0, 1.22][(energy || 2) - 1];
  const phaseArc = period > 1 ? (0.86 + 0.28 * phase) : 1;
  let n = Math.round((shape.d || 6) * e * phaseArc * (thin == null ? 1 : thin));
  n = Math.max(1, Math.min(16, n));

  const steps = pickSteps(stepWeights(shape, occ), n, rnd);
  if (!steps.length) return [];

  const isBass = card.role === 'bass';
  const poly = Math.max(1, shape.poly || 1);

  /* --- 音数によるラウドネスの自動補正 -------------------------------
     同じ vel でも、1小節に1音しか鳴らないカードと15音鳴るカードでは
     聞こえる大きさがまるで違う。v5 ではこれを120枚ぶん手で調整していて、
     ±6dB の trim では足りない箇所が残った。
     ここで「実際に鳴る音の数」から自動で釣り合わせる。
     基準は8音。少ないほど持ち上げ、多いほど抑える。
     指数 0.30 は、書き出して LUFS で測って決めた値。               */
  const effDensity = Math.max(1, (shape.d || 6) * poly);
  const densComp = Math.pow(8 / effDensity, 0.30);
  const baseVel = (shape.vel == null ? .7 : shape.vel) * densComp;
  const accent = card.groove.accentTable || ACCENT[card.groove.accent] || ACCENT.straight;
  const lo = shape.rng ? shape.rng[0] : 0;
  const hi = shape.rng ? shape.rng[1] : 4;
  const baseLen = LEN_STEPS[shape.len] || 2;

  const out = [];
  steps.forEach((st, k) => {
    const t = steps.length > 1 ? k / (steps.length - 1) : 0.5;
    /* 案G：フレーズが複数小節にまたがるカードは、輪郭もその
       小節ぶんの位置（phase）ぶんだけ進ませる。arch や wave のような
       輪郭が、1小節では見えない「数小節がかりの弧」を描くようになる。 */
    const tPhrase = period > 1 ? Math.max(0, Math.min(1, phase + t / period)) : t;

    /* --- 音の高さ --- */
    let d;
    if (isBass) {
      d = bassCode(st, shape.walk || 'move', rnd);
    } else {
      const u = contourAt(shape.cont, tPhrase, rnd);
      let deg = Math.round(lo + u * (hi - lo));
      if (rnd() < 0.22) deg += rnd() < 0.5 ? -1 : 1;      // ほんの少し崩す
      deg = Math.max(lo - 1, Math.min(hi + 1, deg));
      d = poly > 1 ? Array.from({ length: poly }, (_, j) => deg + j) : deg;
    }

    /* --- 長さ：次の音までの隙間を超えないように詰める --- */
    const next = k + 1 < steps.length ? steps[k + 1] : st + baseLen;
    const room = Math.max(1, Math.min(baseLen, next - st));
    const l = STEPS_LEN[room] || (room >= 12 ? '1n' : room >= 6 ? '2n' : room >= 3 ? '4n' : room >= 2 ? '8n' : '16n');

    /* --- 強さ：拍の重み × グルーヴのアクセント × ゆらぎ --- */
    const v = Math.max(.05, Math.min(1,
      baseVel * accent[st] * (0.9 + rnd() * 0.2)));

    out.push({ s: st, d, v, l });
  });
  return out;
}

/* ---- このカードが16ステップのどこを埋めるか（占有表への寄与）------
   後から入るパートは、これを見て空いている場所へ逃げる。          */
function occupancyOf(events, weight) {
  const occ = new Float32Array(16);
  events.forEach(ev => { occ[ev.s] += (weight == null ? 1 : weight) * Math.min(1, ev.v * 1.4); });
  return occ;
}

/* ---- ドラムのフィル（8小節ごと）も生成する ------------------------
   v5 は「スネア→タム1→タム2→タム3」の固定だった。v6 では毎回ちがう。 */
function generateFill(card, bar) {
  const rnd = makeRng(hashSeed(card.id + ':fill', bar, 7));
  const voices = ['snare', 'tom', 'tom2', 'tom3'];
  const grid = rnd() < .5 ? [12, 13, 14, 15] : [12, 13, 14, 14.5, 15, 15.5];
  const down = rnd() < .7;                       // 高いタムから低いタムへ下る
  return grid.map((st, i) => {
    const p = i / (grid.length - 1 || 1);
    const vi = Math.min(3, Math.floor((down ? p : 1 - p) * 4));
    return { s: st, voice: voices[vi], v: 0.5 + p * 0.4 };
  });
}

/* =====================================================================
   10. 曲の時間構造（案3：アレンジ・エンジン）
   ---------------------------------------------------------------------
   v5 は4小節ループが延々続くだけで、4分回しても「曲」にならなかった。
   経過割合で章を切り替え、密度・ENERGY・空気感を自動で動かす。
     until … 制限時間に対する割合（無制限のときは分数を時間で割り当て）
     thin  … 生成密度の倍率
     hp    … 全体のハイパス（上げると軽くなる＝遠くなる）
     wet   … リバーブの深さ倍率
   ===================================================================== */
const SECTIONS = [
  { key: 'intro',  label: '導入',   until: .12, energy: 1, thin: .55, hp: 150, wet: 1.35 },
  { key: 'verse',  label: '展開',   until: .38, energy: 2, thin: .85, hp: 30,  wet: 1.0 },
  { key: 'lift',   label: '持ち上げ', until: .52, energy: 2, thin: 1.0, hp: 30,  wet: .95 },
  { key: 'chorus', label: '山',     until: .78, energy: 3, thin: 1.12, hp: 20,  wet: .85 },
  { key: 'break',  label: '間',     until: .86, energy: 1, thin: .5,  hp: 220, wet: 1.5 },
  { key: 'last',   label: '締め',   until: .96, energy: 3, thin: 1.15, hp: 20,  wet: .9 },
  { key: 'outro',  label: '終息',   until: 1.01, energy: 1, thin: .45, hp: 80,  wet: 1.4 },
];

function sectionAt(pct) {
  for (const s of SECTIONS) if (pct < s.until) return s;
  return SECTIONS[SECTIONS.length - 1];
}

/* ============ 11. 音名の解決（v5 と同じ）============ */
function resolveNotes(role, chord, ev, oct, lift) {
  const list = Array.isArray(ev.d) ? ev.d : [ev.d];
  const o = oct + (ev.o || 0);

  const one = (d) => {
    if (d && typeof d === 'object' && 'sd' in d) return scaleName(chord, d.sd + lift, o);
    if (role === 'bass') return bassName(chord, d, o);
    return toneName(chord, d + lift, o);
  };

  /* 単音／ベース／音階指定はこれまでどおり。
     ベースを外すのは、BASS が max:1 で他の低音と同時に鳴らない設計であり、
     オクターブ（walk:'oct'＝12半音）は元から十分あいているため。       */
  if (list.length < 2 || role === 'bass' || (list[0] && typeof list[0] === 'object')) {
    return list.map(one);
  }

  /* --- 同時に鳴る和音：下から順に、1 ERB 以上あけて積む（案1）-------
     idx は「構成音の何番目か」。近すぎるときだけ1つ上へ読み飛ばす。
     もともと十分あいている高音域では1回も飛ばさないので、
     中〜高音の和音の響きは変わらない。                              */
  const out = [];
  let idx = list[0] + lift;
  let prev = -Infinity;
  for (let i = 0; i < list.length; i++) {
    if (i > 0) {
      const need = minSpacingSemis(prev);
      /* guard：構成音は4つなので、2周（8つ）も上がれば必ず条件を満たす */
      for (let g = 0; g < 8 && toneMidi(chord, idx, o) < prev + need; g++) idx++;
    }
    const m = toneMidi(chord, idx, o);
    out.push(midiToName(m));
    prev = m;
    idx++;
  }
  return out;
}
