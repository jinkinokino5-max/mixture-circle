/* =====================================================================
   music.js — 「譜面」だけを集めたファイル（v3）
   ---------------------------------------------------------------------
   ここには音の出し方（Web Audio の配線）は一切書かない。
   和声・音階・20枚ぶんのフレーズだけを置く。
   音を良くしたいときは、まずこのファイルを触る。
   ===================================================================== */

/* ============ 1. 音名 ============ */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function noteName(semi, oct) {
  const i = ((semi % 12) + 12) % 12;
  return NOTE_NAMES[i] + (oct + Math.floor(semi / 12));
}

/* ============ 2. コード進行 ============
   Cm9 → A♭maj9 → E♭6/9 → B♭sus9  の4小節ループ。
   度数でいうと vi – IV – I – V（E♭メジャー調）＝ 世界中のポップスで
   一番使われている進行そのもの。「気持ちよさ」の土台はここで決まる。
   v2 との違いは、三和音ではなく 9th / 6th を足した5声にしたこと。
   三和音は明快だが薄い。9thが1つ入るだけで響きが一気に豊かになる。

   root : ベースが弾くルート（Cからの半音。低めに置いて跳ねないようにする）
   vc   : コードの積み（Cからの半音）。CHORDカードが弾く
   lad  : 「その和音の上で鳴らして気持ちいい音」を低い順に並べた梯子。
          MELODYカードはこの梯子の番号でフレーズを書く。
          → 同じ旋律の形が、和音ごとに違う響きに“翻訳”される。
            v2 は固定ペンタトニックだったので和音が変わっても
            旋律の色が変わらず、それが「地味」の主因だった。       */
const PROG = [
  { name: 'Cm9',    root:  0, vc: [ 0, 3, 7, 10, 14], lad: [0, 3, 7, 10, 12, 14, 15, 19, 22] },
  { name: 'A♭maj9', root: -4, vc: [-4, 0, 3,  7, 10], lad: [0, 3, 7,  8, 10, 12, 15, 19, 20] },
  { name: 'E♭6/9',  root:  3, vc: [ 3, 7,10, 12, 17], lad: [0, 3, 5,  7, 10, 12, 15, 17, 19] },
  { name: 'B♭sus9', root: -2, vc: [-2, 2, 5,  8, 12], lad: [0, 2, 5, 10, 12, 14, 17, 22, 24] },
];
function chordAt(bar) { return PROG[((bar % 4) + 4) % 4]; }

/* 梯子の番号 → 半音。範囲外は1オクターブずつ足して伸ばす */
function ladSemi(ch, i) {
  const L = ch.lad, n = L.length;
  const k = ((i % n) + n) % n;
  return L[k] + 12 * Math.floor(i / n);
}
/* コードの積みの番号 → 半音（同上） */
function vcSemi(ch, i) {
  const V = ch.vc, n = V.length;
  const k = ((i % n) + n) % n;
  return V[k] + 12 * Math.floor(i / n);
}
/* ベース：0=ルート 1=5度 2=オクターブ 3=3度。app が半音アプローチも使う */
function bassSemi(ch, c) {
  const t = [0, 7, 12, ch.vc[1] - ch.vc[0]];
  return ch.root + t[((c % 4) + 4) % 4];
}

/* ============ 3. 役割（グリッドの行） ============
   帯域と定位はここで決まる。役割が違えば居場所が違うので、
   何枚重ねても音が同じ場所で殴り合わない。
   pan  : ステレオの左右（-1〜1）。genre ごとに少しずらして広げる
   send : リバーブに送る量。v2 は 0.05〜0.20 と乾きすぎていた       */
const ROLES = {
  melody: {
    label: 'MELODY', jp: 'メロディ', desc: '曲の「顔」・主旋律',
    keys: ['1', '2', '3', '4', '5', '6', '7', '8'],
    oct: 4, hp: 180, lp: 15000, gain: -6, send: 0.34, delay: 0.22, pan: 0.18,
  },
  bass: {
    label: 'BASS', jp: 'ベース', desc: '曲の「足元」・低音と安定感',
    keys: ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i'],
    oct: 2, hp: 24, lp: 3200, gain: -3, send: 0.05, delay: 0, pan: 0,
  },
  rhythm: {
    label: 'RHYTHM', jp: 'リズム', desc: '曲の「動き」・拍とノリ',
    keys: ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k'],
    oct: 0, hp: 26, lp: 17000, gain: -4, send: 0.14, delay: 0, pan: 0,
  },
  chord: {
    label: 'CHORD', jp: 'コード', desc: '曲の「空間」・和音と厚み',
    keys: ['z', 'x', 'c', 'v', 'b', 'n', 'm', ','],
    oct: 3, hp: 110, lp: 13000, gain: -5, send: 0.30, delay: 0.10, pan: 0.30,
  },
};
const ROLE_ORDER = ['melody', 'bass', 'rhythm', 'chord'];

/* ============ 4. ジャンル（グリッドの列） ============
   8ジャンル × 4役割 ＝ 32枚。
   ファンク／ヒップホップ／ワールドは v3 で追加した。
   ワールド（民族音楽）は企画書に「拡張枠」として書かれていたもの。   */
const GENRES = {
  rock:       { label: 'ロック',     sub: 'ROCK',       desc: '力強い・激しい' },
  funk:       { label: 'ファンク',   sub: 'FUNK',       desc: '16分・粘る・踊れる' },
  hiphop:     { label: 'ヒップホップ', sub: 'HIPHOP',   desc: '重い・間がある・低音' },
  jazz:       { label: 'ジャズ',     sub: 'JAZZ',       desc: '夜・都会的・複雑' },
  classical:  { label: 'クラシック', sub: 'CLASSICAL',  desc: '美しい・壮大・物語的' },
  world:      { label: 'ワールド',   sub: 'WORLD',      desc: '土・笛と太鼓・素朴' },
  electronic: { label: 'エレクトロ', sub: 'ELECTRONIC', desc: '未来的・機械的・反復' },
  pop:        { label: 'ポップ',     sub: 'POP',        desc: '明るい・親しみやすい' },
};
const GENRE_ORDER = ['rock', 'funk', 'hiphop', 'jazz', 'classical', 'world', 'electronic', 'pop'];

/* ============ 5. 音源の一覧 ============
   kind  'sampler' 実録音 / 'kit' 実録音ドラム / 'synth' 合成音        */
const VOICES = {
  piano:             { label: 'ピアノ',           kind: 'sampler', env: { attack: 0,     release: 1.6 }, fb: 'poly' },
  organ:             { label: 'オルガン',         kind: 'sampler', env: { attack: 0.01,  release: 0.5 }, fb: 'organ' },
  harmonium:         { label: 'ハルモニウム',     kind: 'sampler', env: { attack: 0.05,  release: 0.9 }, fb: 'organ' },
  harp:              { label: 'ハープ',           kind: 'sampler', env: { attack: 0,     release: 2.2 }, fb: 'poly' },
  xylophone:         { label: 'シロフォン',       kind: 'sampler', env: { attack: 0,     release: 0.8 }, fb: 'bell' },
  'guitar-electric': { label: 'エレキギター',     kind: 'sampler', env: { attack: 0.002, release: 0.5 }, fb: 'pluck' },
  'guitar-acoustic': { label: 'アコギ',           kind: 'sampler', env: { attack: 0.003, release: 1.0 }, fb: 'pluck' },
  'guitar-nylon':    { label: 'ガットギター',     kind: 'sampler', env: { attack: 0.004, release: 1.1 }, fb: 'pluck' },
  'bass-electric':   { label: 'エレキベース',     kind: 'sampler', env: { attack: 0.002, release: 0.35 }, fb: 'mono' },
  contrabass:        { label: 'ウッドベース',     kind: 'sampler', env: { attack: 0.008, release: 0.45 }, fb: 'mono' },
  cello:             { label: 'チェロ',           kind: 'sampler', env: { attack: 0.05,  release: 1.0 }, fb: 'bow' },
  violin:            { label: 'バイオリン',       kind: 'sampler', env: { attack: 0.05,  release: 0.9 }, fb: 'bow' },
  flute:             { label: 'フルート',         kind: 'sampler', env: { attack: 0.03,  release: 0.6 }, fb: 'bow' },
  clarinet:          { label: 'クラリネット',     kind: 'sampler', env: { attack: 0.03,  release: 0.5 }, fb: 'reed' },
  saxophone:         { label: 'サックス',         kind: 'sampler', env: { attack: 0.012, release: 0.35 }, fb: 'reed' },
  trumpet:           { label: 'トランペット',     kind: 'sampler', env: { attack: 0.01,  release: 0.3 }, fb: 'reed' },
  trombone:          { label: 'トロンボーン',     kind: 'sampler', env: { attack: 0.02,  release: 0.4 }, fb: 'reed' },
  'french-horn':     { label: 'ホルン',           kind: 'sampler', env: { attack: 0.04,  release: 0.8 }, fb: 'bow' },
  'synth-lead':      { label: 'シンセリード',     kind: 'synth', fb: 'lead' },
  'synth-bass':      { label: 'シンセベース',     kind: 'synth', fb: 'sbass' },
  'synth-pad':       { label: 'シンセパッド',     kind: 'synth', fb: 'pad' },
  sub:               { label: 'サブベース',       kind: 'synth', fb: 'sub' },
  drums:             { label: 'ドラム',           kind: 'kit' },
};

/* =====================================================================
   6. カード20枚
   ---------------------------------------------------------------------
   v3 の核：カード1枚 ＝ 複数楽器のレイヤー（アンサンブル）。
   1枚出しただけで「バンドのセクションが1つ入った」音になる。

   layers[] の各要素
     voice : VOICES のキー
     oct   : 基準オクターブ
     gain  : 音量(dB)
     tr    : 半音の移調（オクターブ重ね＝+12、ハモリ＝+3 など）
     when  : 'all'（既定）｜'accent'（強いイベントだけ鳴らす＝厚みの出し分け）
     kit   : ドラムのときのキット名
     strum : 和音を1音ずつずらす秒数（ギターのストローク）

   フレーズの書式（1小節＝16ステップ）
     MELODY  { s, t:和音の梯子の番号, v:強さ, l:長さ }
     BASS    { s, c:0ルート/1・5度/2・オクターブ/3・3度, app:次の和音へ半音で寄せる, v, l }
     CHORD   { s, n:積みの何番目か（省略＝全部）, v, l }
     RHYTHM  { s, p:'k'キック 's'スネア 'h'ハット 't1..t3'タム 'c'クラップ, v }
   ===================================================================== */
const CARDS = {

  /* ───────────── ROCK：8分の押し出し・パワーコード・オルガン ───────────── */
  rock: {
    melody: {
      hook: 'ギターリフ＋オクターブ上',
      layers: [
        /* oct 4/5 にしていたら 3小節目の山で D6〜A#6 まで上がり、ギター音源の
           最高音（C5）を1オクターブ超えて不自然に伸びていた。1つ下げてある。
           実際のロックのリフもこの音域なので、こちらの方が本物らしい */
        { voice: 'guitar-electric', oct: 3, gain: -5,  drive: 0.34 },
        { voice: 'guitar-electric', oct: 4, gain: -15, drive: 0.34, when: 'accent' },  // 上に重ねて太くする
      ],
      /* 4小節。1〜2小節で問いかけ、3小節で高い所へ飛び、4小節で落とす。
         同じリズムを保ったまま音の高さだけ変える＝覚えやすいフック */
      phrase: [
        [ { s: 0, t: 2, v: .98, l: '8n' }, { s: 3, t: 1, v: .60, l: '16n' },
          { s: 4, t: 3, v: .88, l: '8n' }, { s: 6, t: 2, v: .55, l: '16n' },
          { s: 8, t: 4, v: .95, l: '4n' }, { s: 12, t: 3, v: .72, l: '8n' },
          { s: 14, t: 2, v: .62, l: '16n' } ],
        [ { s: 0, t: 2, v: .98, l: '8n' }, { s: 3, t: 1, v: .60, l: '16n' },
          { s: 4, t: 3, v: .88, l: '8n' }, { s: 7, t: 5, v: .92, l: '8n' },
          { s: 10, t: 4, v: .78, l: '8n' }, { s: 12, t: 3, v: .70, l: '16n' },
          { s: 13, t: 2, v: .60, l: '16n' }, { s: 14, t: 1, v: .84, l: '8n' } ],
        [ { s: 0, t: 5, v: 1.0, l: '4n' }, { s: 4, t: 6, v: .90, l: '8n' },   // ここが山
          { s: 6, t: 5, v: .62, l: '16n' }, { s: 8, t: 7, v: 1.0, l: '4n' },
          { s: 12, t: 6, v: .82, l: '8n' }, { s: 14, t: 5, v: .68, l: '16n' } ],
        [ { s: 0, t: 4, v: .92, l: '8n' }, { s: 2, t: 3, v: .62, l: '16n' },
          { s: 4, t: 2, v: .80, l: '8n' }, { s: 8, t: 1, v: .88, l: '4n' },
          { s: 12, t: 2, v: .70, l: '8n' }, { s: 14, t: 3, v: .74, l: '16n' } ],
      ],
    },
    bass: {
      hook: 'エレキベース＋サブ',
      layers: [
        { voice: 'bass-electric', oct: 2, gain: -3 },
        { voice: 'sub',           oct: 2, gain: -8 },   // 体で感じる低域
      ],
      phrase: [
        [ { s: 0, c: 0, v: .98, l: '8n' }, { s: 2, c: 0, v: .52, l: '8n' },
          { s: 4, c: 0, v: .60, l: '8n' }, { s: 6, c: 0, v: .88, l: '8n' },
          { s: 8, c: 0, v: .96, l: '8n' }, { s: 10, c: 0, v: .52, l: '8n' },
          { s: 12, c: 1, v: .74, l: '8n' }, { s: 14, c: 3, v: .76, l: '8n' } ],
        [ { s: 0, c: 0, v: .98, l: '8n' }, { s: 2, c: 0, v: .52, l: '8n' },
          { s: 4, c: 0, v: .60, l: '8n' }, { s: 6, c: 0, v: .88, l: '8n' },
          { s: 8, c: 2, v: .90, l: '8n' }, { s: 10, c: 1, v: .58, l: '8n' },
          { s: 12, c: 3, v: .72, l: '8n' }, { s: 14, app: -1, v: .82, l: '8n' } ],
      ],
    },
    rhythm: {
      hook: '8ビート＋クラップ',
      layers: [ { voice: 'drums', kit: 'acoustic-kit', gain: -3 } ],
      phrase: [
        rockBar(false), rockBar(true), rockBar(false),
        /* 4小節目はタム回しのフィル。次の1小節目へ突っ込む快感を作る */
        [ { s: 0, p: 'k', v: .95 }, { s: 4, p: 's', v: .80 }, { s: 6, p: 'k', v: .72 },
          { s: 0, p: 'h', v: .34 }, { s: 2, p: 'h', v: .24 }, { s: 4, p: 'h', v: .34 }, { s: 6, p: 'h', v: .24 },
          { s: 8,  p: 't1', v: .70 }, { s: 9,  p: 't1', v: .55 },
          { s: 10, p: 't2', v: .74 }, { s: 11, p: 't2', v: .58 },
          { s: 12, p: 't3', v: .80 }, { s: 13, p: 't3', v: .62 },
          { s: 14, p: 's',  v: .88 }, { s: 15, p: 's',  v: .95 } ],
      ],
    },
    chord: {
      hook: 'パワーコード＋オルガン',
      layers: [
        { voice: 'guitar-electric', oct: 3, gain: -7, drive: 0.40, voicing: 'power' },
        { voice: 'organ',           oct: 4, gain: -14, voicing: 'full', when: 'accent' },  // 隙間を埋める
      ],
      phrase: [
        [ { s: 0,  v: .95, l: '16n' }, { s: 2,  v: .50, l: '16n' },
          { s: 4,  v: .86, l: '16n' }, { s: 6,  v: .50, l: '16n' },
          { s: 7,  v: .60, l: '16n' }, { s: 8,  v: .95, l: '16n' },
          { s: 10, v: .50, l: '16n' }, { s: 12, v: .86, l: '16n' },
          { s: 14, v: .58, l: '16n' }, { s: 15, v: .52, l: '16n' } ],
        [ { s: 0,  v: .95, l: '8n'  }, { s: 3,  v: .55, l: '16n' },
          { s: 4,  v: .86, l: '16n' }, { s: 6,  v: .50, l: '16n' },
          { s: 8,  v: .95, l: '4n'  }, { s: 12, v: .86, l: '16n' },
          { s: 13, v: .55, l: '16n' }, { s: 14, v: .70, l: '16n' } ],
      ],
    },
  },

  /* ───────────── JAZZ：スウィング（拍を0と3に置く）・ホーンセクション ───────────── */
  jazz: {
    melody: {
      hook: 'サックス＋トランペット（ホーン隊）',
      layers: [
        { voice: 'saxophone', oct: 4, gain: -7 },
        { voice: 'trumpet',   oct: 4, gain: -13, tr: 5, when: 'accent' },  // 4度上でハモる
      ],
      /* 4小節のフレーズ。休符で息継ぎを作り、3小節目で上に伸びる */
      phrase: [
        [ { s: 0, t: 2, v: .78, l: '8n' }, { s: 3, t: 3, v: .52, l: '16n' },
          { s: 4, t: 4, v: .80, l: '8n' }, { s: 7, t: 3, v: .50, l: '16n' },
          { s: 8, t: 2, v: .76, l: '4n' }, { s: 12, t: 1, v: .66, l: '8n' },
          { s: 15, t: 0, v: .58, l: '16n' } ],
        [ { s: 2, t: 1, v: .70, l: '8n' }, { s: 4, t: 2, v: .78, l: '8n' },
          { s: 7, t: 3, v: .52, l: '16n' }, { s: 8, t: 4, v: .84, l: '8n' },
          { s: 11, t: 5, v: .56, l: '16n' }, { s: 12, t: 6, v: .80, l: '2n' } ],
        [ { s: 0, t: 6, v: .88, l: '8n' }, { s: 3, t: 7, v: .60, l: '16n' },
          { s: 4, t: 8, v: .92, l: '4n' }, { s: 8, t: 6, v: .78, l: '8n' },
          { s: 11, t: 5, v: .56, l: '16n' }, { s: 12, t: 4, v: .74, l: '8n' },
          { s: 15, t: 3, v: .54, l: '16n' } ],
        [ { s: 0, t: 3, v: .74, l: '8n' }, { s: 4, t: 2, v: .68, l: '8n' },
          { s: 7, t: 1, v: .52, l: '16n' }, { s: 8, t: 0, v: .80, l: '2n' } ],
      ],
    },
    bass: {
      hook: 'ウッドベース（ウォーキング）',
      layers: [
        { voice: 'contrabass', oct: 2, gain: -4 },
        { voice: 'sub',        oct: 2, gain: -14 },
      ],
      /* 4分で歩き、4拍目で次の和音へ半音で寄せる。ジャズらしさの中心 */
      phrase: [
        [ { s: 0, c: 0, v: .90, l: '4n' }, { s: 4, c: 1, v: .64, l: '4n' },
          { s: 8, c: 3, v: .72, l: '4n' }, { s: 12, app: -1, v: .66, l: '4n' } ],
        [ { s: 0, c: 0, v: .90, l: '4n' }, { s: 4, c: 3, v: .64, l: '4n' },
          { s: 8, c: 1, v: .72, l: '4n' }, { s: 12, app:  1, v: .66, l: '4n' } ],
        [ { s: 0, c: 0, v: .90, l: '4n' }, { s: 4, c: 2, v: .62, l: '4n' },
          { s: 8, c: 1, v: .74, l: '4n' }, { s: 12, app: -1, v: .68, l: '4n' } ],
        [ { s: 0, c: 0, v: .90, l: '4n' }, { s: 4, c: 1, v: .64, l: '4n' },
          { s: 8, c: 3, v: .70, l: '4n' }, { s: 11, c: 1, v: .55, l: '8n' },
          { s: 14, app: -1, v: .72, l: '8n' } ],
      ],
    },
    rhythm: {
      hook: 'ライド＋ブラシ',
      layers: [ { voice: 'drums', kit: 'acoustic-kit', gain: -5 } ],
      /* ハットでライドのパターン（1・2・2裏・3・4・4裏）。キックは軽く */
      phrase: [
        jazzBar([{ s: 7, p: 's', v: .38 }, { s: 14, p: 's', v: .32 }]),
        jazzBar([{ s: 3, p: 's', v: .34 }, { s: 10, p: 's', v: .40 }]),
        jazzBar([{ s: 7, p: 's', v: .38 }, { s: 11, p: 's', v: .30 }, { s: 15, p: 't1', v: .34 }]),
        [ { s: 0, p: 'h', v: .34 }, { s: 4, p: 'h', v: .26 }, { s: 8, p: 'h', v: .30 },
          { s: 0, p: 'k', v: .36 }, { s: 8, p: 'k', v: .34 },
          { s: 3, p: 's', v: .40 }, { s: 7, p: 't1', v: .48 }, { s: 10, p: 't2', v: .50 },
          { s: 12, p: 't3', v: .55 }, { s: 14, p: 's', v: .48 }, { s: 15, p: 's', v: .58 } ],
      ],
    },
    chord: {
      hook: 'ピアノ（ルートレス）＋シロフォン',
      layers: [
        { voice: 'piano',     oct: 3, gain: -6, voicing: 'rootless' },
        { voice: 'xylophone', oct: 5, gain: -18, voicing: 'rootless', when: 'accent' },  // きらめきを足す
      ],
      /* 裏拍に置くコンピング。毎小節ずらして同じ形が続かないようにする */
      phrase: [
        [ { s: 2,  v: .70, l: '8n'  }, { s: 7,  v: .52, l: '16n' }, { s: 10, v: .66, l: '8n' } ],
        [ { s: 0,  v: .62, l: '8n'  }, { s: 6,  v: .56, l: '16n' },
          { s: 11, v: .70, l: '8n'  }, { s: 14, v: .50, l: '16n' } ],
        [ { s: 3,  v: .66, l: '8n'  }, { s: 8,  v: .60, l: '8n'  }, { s: 15, v: .54, l: '16n' } ],
        [ { s: 0,  v: .58, l: '16n' }, { s: 4,  v: .62, l: '8n'  }, { s: 10, v: .72, l: '4n' } ],
      ],
    },
  },

  /* ───────────── CLASSICAL：伸びる音・4小節でひとつの物語 ───────────── */
  classical: {
    melody: {
      hook: 'バイオリン＋フルート（オクターブ上）',
      layers: [
        { voice: 'violin', oct: 4, gain: -6 },
        { voice: 'flute',  oct: 5, gain: -13, when: 'accent' },  // 上に薄く重ねて輝かせる
      ],
      /* 登って（1〜2小節）、頂点に達し（3小節）、着地する（4小節）。
         音は少ないが、1音1音が和音の梯子を上がるので響きが変わり続ける */
      phrase: [
        [ { s: 0, t: 2, v: .58, l: '2n' }, { s: 8,  t: 3, v: .52, l: '4n' },
          { s: 12, t: 4, v: .56, l: '4n' } ],
        [ { s: 0, t: 5, v: .66, l: '2n' }, { s: 8,  t: 4, v: .54, l: '4n' },
          { s: 12, t: 6, v: .62, l: '4n' } ],
        [ { s: 0, t: 7, v: .78, l: '2n' }, { s: 8,  t: 8, v: .82, l: '2n' } ],   // 頂点
        [ { s: 0, t: 6, v: .62, l: '4n' }, { s: 4,  t: 4, v: .54, l: '4n' },
          { s: 8, t: 2, v: .58, l: '2n' } ],
      ],
    },
    bass: {
      hook: 'チェロ＋コントラバス',
      layers: [
        { voice: 'cello',      oct: 3, gain: -5 },
        { voice: 'contrabass', oct: 2, gain: -9 },   // 1オクターブ下で支える
      ],
      phrase: [
        [ { s: 0, c: 0, v: .68, l: '2n' }, { s: 8, c: 1, v: .56, l: '2n' } ],
        [ { s: 0, c: 0, v: .66, l: '1n' } ],
        [ { s: 0, c: 0, v: .72, l: '2n' }, { s: 8, c: 3, v: .58, l: '2n' } ],
        [ { s: 0, c: 0, v: .66, l: '2n' }, { s: 8, c: 1, v: .56, l: '4n' },
          { s: 12, app: -1, v: .60, l: '4n' } ],
      ],
    },
    rhythm: {
      hook: 'ティンパニ＋シロフォン',
      layers: [
        { voice: 'drums', kit: 'acoustic-kit', gain: -6 },
      ],
      phrase: [
        [ { s: 0, p: 't3', v: .55 }, { s: 0, p: 'k', v: .40 } ],
        [ { s: 0, p: 't3', v: .50 }, { s: 8, p: 't2', v: .40 }, { s: 0, p: 'k', v: .34 } ],
        [ { s: 0, p: 't3', v: .58 }, { s: 8, p: 't3', v: .48 }, { s: 12, p: 't2', v: .40 },
          { s: 14, p: 't1', v: .36 } ],
        /* 4小節目：だんだん強くなる連打（ロール）で次の頭へ持っていく */
        [ { s: 0, p: 't3', v: .50 },
          { s: 8,  p: 't3', v: .22 }, { s: 9,  p: 't3', v: .28 },
          { s: 10, p: 't3', v: .34 }, { s: 11, p: 't2', v: .40 },
          { s: 12, p: 't2', v: .48 }, { s: 13, p: 't2', v: .56 },
          { s: 14, p: 't1', v: .66 }, { s: 15, p: 't1', v: .78 } ],
      ],
    },
    chord: {
      hook: 'ハープ（分散和音）＋ホルン',
      layers: [
        { voice: 'harp',         oct: 3, gain: -6,  voicing: 'full' },
        { voice: 'french-horn',  oct: 3, gain: -15, voicing: 'triad', when: 'accent' },  // 下支えの厚み
      ],
      /* 3小節は16分の分散和音（ハープのグリッサンド風）、4小節目は全部まとめて */
      phrase: [
        harpBar([0, 1, 2, 3, 4, 3, 2, 1]),
        harpBar([0, 2, 4, 5, 6, 5, 4, 2]),
        harpBar([2, 3, 4, 5, 6, 7, 8, 7]),
        [ { s: 0, v: .62, l: '1n' } ],
      ],
    },
  },

  /* ───────────── ELECTRONIC：16分・反復・機械的 ───────────── */
  electronic: {
    melody: {
      hook: 'シンセリード（デチューン）＋オクターブ',
      layers: [
        { voice: 'synth-lead', oct: 5, gain: -9 },
        { voice: 'synth-lead', oct: 4, gain: -14, when: 'accent' },
      ],
      /* 16分の分散。2小節目で抜きを作り、3小節目で上に、4小節目で戻す */
      phrase: [
        arpBar([0, 2, 4, 2, 0, 3, 5, 3, 1, 3, 5, 3, 2, 4, 6, 4]),
        arpBar([2, 4, 6, 4, null, null, null, null, 1, 3, 5, 3, 0, 2, 4, 2]),
        arpBar([4, 6, 8, 6, 4, 7, 9, 7, 5, 7, 9, 7, 6, 8, 10, 8]),
        arpBar([2, 4, 6, 4, 2, 5, 7, 5, 1, 3, 5, 3, 0, 2, 4, 6]),
      ],
    },
    bass: {
      hook: 'シンセベース＋サブ',
      layers: [
        { voice: 'synth-bass', oct: 2, gain: -4 },
        { voice: 'sub',        oct: 2, gain: -6 },
      ],
      phrase: [
        [ { s: 0,  c: 0, v: .98, l: '16n' }, { s: 2,  c: 0, v: .44, l: '16n' },
          { s: 3,  c: 0, v: .54, l: '16n' }, { s: 6,  c: 0, v: .64, l: '16n' },
          { s: 8,  c: 0, v: .96, l: '16n' }, { s: 10, c: 0, v: .44, l: '16n' },
          { s: 11, c: 0, v: .54, l: '16n' }, { s: 14, c: 1, v: .70, l: '16n' } ],
        [ { s: 0,  c: 0, v: .98, l: '16n' }, { s: 2,  c: 0, v: .44, l: '16n' },
          { s: 3,  c: 0, v: .54, l: '16n' }, { s: 6,  c: 0, v: .64, l: '16n' },
          { s: 8,  c: 2, v: .90, l: '16n' }, { s: 10, c: 1, v: .58, l: '16n' },
          { s: 12, c: 2, v: .76, l: '16n' }, { s: 14, c: 1, v: .64, l: '16n' } ],
      ],
    },
    rhythm: {
      hook: 'ドラムマシン（四つ打ち）',
      layers: [ { voice: 'drums', kit: 'LINN', gain: -3 } ],
      phrase: [
        technoBar(false), technoBar(true), technoBar(false),
        [ { s: 0, p: 'k', v: .98 }, { s: 4, p: 'k', v: .92 }, { s: 8, p: 'k', v: .98 },
          { s: 4, p: 'c', v: .70 }, { s: 12, p: 'c', v: .74 },
          { s: 1, p: 'h', v: .30 }, { s: 3, p: 'h', v: .30 }, { s: 5, p: 'h', v: .30 },
          { s: 7, p: 'h', v: .30 }, { s: 9, p: 'h', v: .30 }, { s: 11, p: 'h', v: .30 },
          /* 最後の1拍でキックを詰めて突っ込む（ビルドアップ） */
          { s: 12, p: 'k', v: .74 }, { s: 13, p: 'k', v: .60 },
          { s: 14, p: 'k', v: .80 }, { s: 15, p: 'k', v: .95 } ],
      ],
    },
    chord: {
      hook: 'シンセパッド＋オルガン',
      layers: [
        { voice: 'synth-pad', oct: 3, gain: -11, voicing: 'pad' },
        { voice: 'organ',     oct: 4, gain: -17, voicing: 'full', when: 'accent' },
      ],
      phrase: [
        [ { s: 0, v: .58, l: '1n' } ],
        [ { s: 0, v: .58, l: '1n' } ],
        [ { s: 0, v: .62, l: '1n' } ],
        [ { s: 0, v: .58, l: '2n' }, { s: 8, v: .52, l: '4n' }, { s: 12, v: .60, l: '4n' } ],
      ],
    },
  },

  /* ───────────── POP：素直な8分・口ずさめる・開いた和音 ───────────── */
  pop: {
    melody: {
      hook: 'ピアノ＋シンセ（オクターブ上）',
      layers: [
        { voice: 'piano',      oct: 4, gain: -3 },      // ← v2 で小さすぎた分をしっかり上げる
        { voice: 'synth-lead', oct: 5, gain: -18, when: 'accent' },
      ],
      /* 「同じリズムで音の高さだけ変える」を4小節続ける。歌える形 */
      phrase: [
        [ { s: 0,  t: 2, v: .82, l: '8n' }, { s: 2,  t: 3, v: .66, l: '8n' },
          { s: 4,  t: 4, v: .88, l: '4n' }, { s: 8,  t: 3, v: .72, l: '8n' },
          { s: 10, t: 2, v: .66, l: '8n' }, { s: 12, t: 1, v: .80, l: '4n' } ],
        [ { s: 0,  t: 2, v: .82, l: '8n' }, { s: 2,  t: 4, v: .68, l: '8n' },
          { s: 4,  t: 5, v: .90, l: '2n' }, { s: 12, t: 4, v: .74, l: '4n' } ],
        [ { s: 0,  t: 5, v: .90, l: '8n' }, { s: 2,  t: 6, v: .72, l: '8n' },
          { s: 4,  t: 7, v: .96, l: '4n' }, { s: 8,  t: 6, v: .78, l: '8n' },
          { s: 10, t: 5, v: .70, l: '8n' }, { s: 12, t: 4, v: .84, l: '4n' } ],
        [ { s: 0,  t: 3, v: .80, l: '8n' }, { s: 2,  t: 2, v: .66, l: '8n' },
          { s: 4,  t: 1, v: .84, l: '2n' }, { s: 12, t: 2, v: .72, l: '4n' } ],
      ],
    },
    bass: {
      hook: 'エレキベース＋サブ',
      layers: [
        { voice: 'bass-electric', oct: 2, gain: -3 },
        { voice: 'sub',           oct: 2, gain: -9 },
      ],
      phrase: [
        [ { s: 0,  c: 0, v: .92, l: '8n' }, { s: 6,  c: 0, v: .60, l: '8n' },
          { s: 8,  c: 0, v: .88, l: '8n' }, { s: 11, c: 1, v: .62, l: '8n' },
          { s: 14, c: 3, v: .66, l: '8n' } ],
        [ { s: 0,  c: 0, v: .92, l: '8n' }, { s: 6,  c: 0, v: .60, l: '8n' },
          { s: 8,  c: 2, v: .86, l: '8n' }, { s: 12, c: 1, v: .66, l: '8n' },
          { s: 14, app: -1, v: .70, l: '8n' } ],
      ],
    },
    rhythm: {
      hook: 'エイトビート＋クラップ',
      layers: [ { voice: 'drums', kit: 'Kit3', gain: -3 } ],
      phrase: [
        popBar(false), popBar(false), popBar(true),
        [ { s: 0, p: 'k', v: .92 }, { s: 8, p: 'k', v: .88 }, { s: 11, p: 'k', v: .66 },
          { s: 4, p: 's', v: .74 }, { s: 12, p: 's', v: .74 },
          { s: 4, p: 'c', v: .62 }, { s: 12, p: 'c', v: .62 },
          { s: 0, p: 'h', v: .30 }, { s: 2, p: 'h', v: .22 }, { s: 4, p: 'h', v: .30 },
          { s: 6, p: 'h', v: .22 }, { s: 8, p: 'h', v: .30 }, { s: 10, p: 'h', v: .22 },
          { s: 13, p: 't2', v: .56 }, { s: 14, p: 't1', v: .64 }, { s: 15, p: 's', v: .80 } ],
      ],
    },
    chord: {
      hook: 'アコギ（ストローク）＋ハルモニウム',
      layers: [
        { voice: 'guitar-acoustic', oct: 3, gain: -6,  voicing: 'open', strum: 0.016 },
        { voice: 'harmonium',       oct: 3, gain: -16, voicing: 'full', when: 'accent' },
      ],
      phrase: [
        [ { s: 0,  v: .82, l: '4n' }, { s: 4,  v: .56, l: '8n' },
          { s: 6,  v: .50, l: '8n' }, { s: 8,  v: .78, l: '4n' },
          { s: 11, v: .54, l: '8n' }, { s: 14, v: .52, l: '8n' } ],
        [ { s: 0,  v: .82, l: '4n' }, { s: 3,  v: .48, l: '8n' },
          { s: 6,  v: .54, l: '8n' }, { s: 8,  v: .78, l: '4n' },
          { s: 10, v: .50, l: '8n' }, { s: 12, v: .62, l: '8n' },
          { s: 14, v: .52, l: '8n' } ],
      ],
    },
  },

  /* ───────────── FUNK：16分・粘る・休符が主役 ─────────────
     ファンクの気持ちよさは「音を詰めること」ではなく「抜くこと」。
     裏拍で入って表で消えるので、体が勝手に動く。                    */
  funk: {
    melody: {
      hook: 'オルガン＋カッティングギター',
      layers: [
        { voice: 'organ',           oct: 4, gain: -8 },
        { voice: 'guitar-electric', oct: 4, gain: -14, drive: 0.25, when: 'accent' },
      ],
      /* 16分のシンコペーション。表拍をわざと外す */
      phrase: [
        [ { s: 0,  t: 2, v: .92, l: '16n' }, { s: 3,  t: 4, v: .60, l: '16n' },
          { s: 6,  t: 3, v: .78, l: '16n' }, { s: 7,  t: 2, v: .52, l: '16n' },
          { s: 10, t: 4, v: .84, l: '16n' }, { s: 11, t: 5, v: .56, l: '16n' },
          { s: 14, t: 3, v: .74, l: '8n'  } ],
        [ { s: 2,  t: 5, v: .88, l: '16n' }, { s: 3,  t: 4, v: .56, l: '16n' },
          { s: 6,  t: 6, v: .82, l: '16n' }, { s: 9,  t: 5, v: .62, l: '16n' },
          { s: 10, t: 4, v: .78, l: '16n' }, { s: 13, t: 2, v: .66, l: '16n' },
          { s: 14, t: 3, v: .72, l: '16n' } ],
      ],
    },
    bass: {
      hook: 'スラップベース＋サブ',
      layers: [
        { voice: 'bass-electric', oct: 2, gain: -2 },
        { voice: 'sub',           oct: 2, gain: -11 },
      ],
      /* ファンクの主役。1拍目を強く踏んで、あとは16分で跳ねる */
      phrase: [
        [ { s: 0,  c: 0, v: 1.0, l: '16n' }, { s: 3,  c: 0, v: .50, l: '16n' },
          { s: 4,  c: 2, v: .72, l: '16n' }, { s: 6,  c: 0, v: .58, l: '16n' },
          { s: 7,  c: 1, v: .66, l: '16n' }, { s: 10, c: 0, v: .86, l: '16n' },
          { s: 11, c: 0, v: .48, l: '16n' }, { s: 14, c: 3, v: .74, l: '16n' } ],
        [ { s: 0,  c: 0, v: 1.0, l: '16n' }, { s: 2,  c: 0, v: .46, l: '16n' },
          { s: 3,  c: 1, v: .62, l: '16n' }, { s: 6,  c: 2, v: .78, l: '16n' },
          { s: 8,  c: 0, v: .88, l: '16n' }, { s: 11, c: 3, v: .60, l: '16n' },
          { s: 13, c: 1, v: .54, l: '16n' }, { s: 14, app: -1, v: .78, l: '16n' } ],
      ],
    },
    rhythm: {
      hook: 'タイトな16分＋クラップ',
      layers: [ { voice: 'drums', kit: 'Kit8', gain: -3 } ],
      phrase: [
        funkBar(false), funkBar(true), funkBar(false),
        [ { s: 0, p: 'k', v: .98 }, { s: 6, p: 'k', v: .70 }, { s: 10, p: 'k', v: .78 },
          { s: 4, p: 's', v: .82 }, { s: 12, p: 's', v: .82 },
          { s: 4, p: 'c', v: .60 }, { s: 12, p: 'c', v: .60 },
          { s: 0, p: 'h', v: .32 }, { s: 1, p: 'h', v: .16 }, { s: 2, p: 'h', v: .26 }, { s: 3, p: 'h', v: .16 },
          { s: 4, p: 'h', v: .32 }, { s: 5, p: 'h', v: .16 }, { s: 6, p: 'h', v: .26 }, { s: 7, p: 'h', v: .16 },
          { s: 13, p: 't1', v: .60 }, { s: 14, p: 't2', v: .68 }, { s: 15, p: 's', v: .88 } ],
      ],
    },
    chord: {
      hook: '16分カッティング＋オルガン',
      layers: [
        { voice: 'guitar-electric', oct: 4, gain: -7, drive: 0.18, voicing: 'rootless' },
        { voice: 'organ',           oct: 4, gain: -16, voicing: 'rootless', when: 'accent' },
      ],
      /* 短く切った和音を裏拍に置く。これがファンクの「シャキシャキ」 */
      phrase: [
        [ { s: 2,  v: .82, l: '32n' }, { s: 3,  v: .48, l: '32n' },
          { s: 6,  v: .76, l: '32n' }, { s: 9,  v: .52, l: '32n' },
          { s: 10, v: .84, l: '32n' }, { s: 11, v: .46, l: '32n' },
          { s: 14, v: .74, l: '32n' } ],
        [ { s: 1,  v: .70, l: '32n' }, { s: 2,  v: .84, l: '32n' },
          { s: 5,  v: .50, l: '32n' }, { s: 6,  v: .78, l: '32n' },
          { s: 10, v: .82, l: '32n' }, { s: 13, v: .52, l: '32n' },
          { s: 14, v: .76, l: '32n' }, { s: 15, v: .44, l: '32n' } ],
      ],
    },
  },

  /* ───────────── HIPHOP：重い・遅い・間がある ─────────────
     詰め込まないことで低音が立つ。1音1音が重くなる。               */
  hiphop: {
    melody: {
      hook: 'ローファイピアノ＋シロフォン',
      layers: [
        { voice: 'piano',     oct: 4, gain: -4, lp: 4200 },   // わざと高域を落として古い質感に
        { voice: 'xylophone', oct: 5, gain: -20, when: 'accent' },
      ],
      /* 音数を絞り、休符を長く取る。裏で入って表で消える */
      phrase: [
        [ { s: 0,  t: 2, v: .88, l: '4n' }, { s: 6,  t: 4, v: .70, l: '8n' },
          { s: 10, t: 3, v: .76, l: '4n' } ],
        [ { s: 2,  t: 5, v: .82, l: '8n' }, { s: 3,  t: 4, v: .54, l: '16n' },
          { s: 8,  t: 2, v: .84, l: '2n' } ],
        [ { s: 0,  t: 6, v: .90, l: '4n' }, { s: 6,  t: 5, v: .68, l: '8n' },
          { s: 10, t: 7, v: .82, l: '4n' } ],
        [ { s: 0,  t: 4, v: .80, l: '8n' }, { s: 3,  t: 3, v: .56, l: '16n' },
          { s: 8,  t: 1, v: .86, l: '2n' } ],
      ],
    },
    bass: {
      hook: '重いサブ＋エレキベース',
      layers: [
        { voice: 'sub',           oct: 2, gain: -2 },       // ヒップホップは低音が主役
        { voice: 'bass-electric', oct: 2, gain: -8 },
      ],
      phrase: [
        [ { s: 0,  c: 0, v: 1.0, l: '4n' }, { s: 6,  c: 0, v: .62, l: '8n' },
          { s: 10, c: 2, v: .78, l: '4n' } ],
        [ { s: 0,  c: 0, v: 1.0, l: '2n' }, { s: 11, c: 1, v: .66, l: '8n' },
          { s: 14, c: 0, v: .72, l: '8n' } ],
      ],
    },
    rhythm: {
      hook: 'ブーンバップ（重いドラム）',
      layers: [ { voice: 'drums', kit: 'CR78', gain: -2 } ],
      /* スネアを2拍4拍に強く置き、キックは間を空ける。ハーフタイムの重さ */
      phrase: [
        hiphopBar([{ s: 10, p: 'k', v: .74 }]),
        hiphopBar([{ s: 7, p: 'k', v: .68 }, { s: 14, p: 's', v: .40 }]),
        hiphopBar([{ s: 10, p: 'k', v: .74 }, { s: 11, p: 'k', v: .50 }]),
        [ { s: 0, p: 'k', v: 1.0 }, { s: 4, p: 's', v: .92 },
          { s: 8, p: 'k', v: .86 }, { s: 12, p: 's', v: .92 },
          { s: 0, p: 'h', v: .26 }, { s: 2, p: 'h', v: .18 }, { s: 4, p: 'h', v: .26 },
          { s: 6, p: 'h', v: .18 }, { s: 8, p: 'h', v: .26 },
          { s: 13, p: 's', v: .55 }, { s: 14, p: 's', v: .70 }, { s: 15, p: 's', v: .88 } ],
      ],
    },
    chord: {
      hook: 'ハルモニウム＋ピアノ（暗い和音）',
      layers: [
        { voice: 'harmonium', oct: 3, gain: -8,  voicing: 'rootless' },
        { voice: 'piano',     oct: 3, gain: -13, voicing: 'rootless', when: 'accent' },
      ],
      phrase: [
        [ { s: 0, v: .66, l: '2n' }, { s: 10, v: .52, l: '4n' } ],
        [ { s: 2, v: .62, l: '2n' }, { s: 11, v: .56, l: '8n' } ],
      ],
    },
  },

  /* ───────────── WORLD：土・笛と太鼓・素朴 ─────────────
     企画書に「拡張枠」として書かれていた民族音楽ジャンル。           */
  world: {
    melody: {
      hook: 'フルート＋クラリネット（笛の重ね）',
      layers: [
        { voice: 'flute',    oct: 5, gain: -7 },
        { voice: 'clarinet', oct: 4, gain: -12, when: 'accent' },   // 1オクターブ下で厚みを出す
      ],
      /* 装飾音（すぐ隣の音を挟む）を入れて、笛らしい歌い方にする */
      phrase: [
        [ { s: 0,  t: 2, v: .82, l: '8n' }, { s: 2,  t: 3, v: .48, l: '16n' },
          { s: 3,  t: 2, v: .70, l: '8n' }, { s: 6,  t: 4, v: .78, l: '4n' },
          { s: 10, t: 3, v: .64, l: '8n' }, { s: 12, t: 2, v: .76, l: '4n' } ],
        [ { s: 0,  t: 4, v: .84, l: '8n' }, { s: 2,  t: 5, v: .50, l: '16n' },
          { s: 3,  t: 4, v: .72, l: '8n' }, { s: 6,  t: 6, v: .86, l: '4n' },
          { s: 10, t: 5, v: .62, l: '8n' }, { s: 12, t: 3, v: .74, l: '2n' } ],
        [ { s: 0,  t: 6, v: .88, l: '4n' }, { s: 4,  t: 7, v: .74, l: '8n' },
          { s: 6,  t: 6, v: .56, l: '16n' }, { s: 8,  t: 5, v: .80, l: '4n' },
          { s: 12, t: 4, v: .68, l: '4n' } ],
        [ { s: 0,  t: 3, v: .74, l: '8n' }, { s: 2,  t: 2, v: .52, l: '16n' },
          { s: 4,  t: 1, v: .78, l: '2n' }, { s: 12, t: 2, v: .66, l: '4n' } ],
      ],
    },
    bass: {
      hook: 'ウッドベース＋サブ（素朴なルート）',
      layers: [
        { voice: 'contrabass', oct: 2, gain: -4 },
        { voice: 'sub',        oct: 2, gain: -12 },
      ],
      phrase: [
        [ { s: 0, c: 0, v: .92, l: '4n' }, { s: 6, c: 0, v: .58, l: '8n' },
          { s: 8, c: 1, v: .70, l: '4n' }, { s: 14, c: 0, v: .60, l: '8n' } ],
        [ { s: 0, c: 0, v: .92, l: '4n' }, { s: 4, c: 2, v: .62, l: '8n' },
          { s: 8, c: 0, v: .78, l: '4n' }, { s: 12, c: 1, v: .64, l: '4n' } ],
      ],
    },
    rhythm: {
      hook: '太鼓＋手拍子（ジャンベ風）',
      layers: [ { voice: 'drums', kit: 'acoustic-kit', gain: -4 } ],
      /* キックとタムだけで太鼓を作り、手拍子を重ねる。ハイハットは使わない */
      phrase: [
        worldBar(false), worldBar(true), worldBar(false),
        [ { s: 0, p: 'k', v: .95 }, { s: 3, p: 't1', v: .55 }, { s: 4, p: 't2', v: .62 },
          { s: 6, p: 'k', v: .70 }, { s: 8, p: 't1', v: .58 }, { s: 10, p: 't2', v: .64 },
          { s: 4, p: 'c', v: .58 }, { s: 12, p: 'c', v: .62 },
          { s: 12, p: 't3', v: .70 }, { s: 13, p: 't2', v: .58 },
          { s: 14, p: 't1', v: .66 }, { s: 15, p: 'k', v: .88 } ],
      ],
    },
    chord: {
      hook: 'ガットギター＋ハープ',
      layers: [
        { voice: 'guitar-nylon', oct: 3, gain: -6,  voicing: 'open', strum: 0.020 },
        { voice: 'harp',         oct: 4, gain: -14, voicing: 'full', when: 'accent' },
      ],
      phrase: [
        [ { s: 0,  n: 0, v: .74, l: '4n' }, { s: 3,  n: 2, v: .46, l: '8n' },
          { s: 6,  n: 3, v: .52, l: '8n' }, { s: 8,  n: 1, v: .70, l: '4n' },
          { s: 11, n: 4, v: .48, l: '8n' }, { s: 14, n: 2, v: .54, l: '8n' } ],
        [ { s: 0,  v: .78, l: '4n' }, { s: 4,  n: 3, v: .50, l: '8n' },
          { s: 6,  n: 4, v: .46, l: '8n' }, { s: 8,  v: .72, l: '4n' },
          { s: 12, n: 2, v: .52, l: '8n' }, { s: 14, n: 1, v: .48, l: '8n' } ],
      ],
    },
  },
};

/* ============ 7. 小節を短く書くための補助 ============ */

/* ロックの8ビート。clap=true でバックビートにクラップを重ねる */
function rockBar(clap) {
  const b = [
    { s: 0, p: 'k', v: .95 }, { s: 6, p: 'k', v: .78 },
    { s: 8, p: 'k', v: .92 }, { s: 14, p: 'k', v: .72 },
    { s: 4, p: 's', v: .82 }, { s: 12, p: 's', v: .82 },
  ];
  [0, 2, 4, 6, 8, 10, 12, 14].forEach(s => b.push({ s, p: 'h', v: s % 4 === 0 ? .36 : .25 }));
  if (clap) { b.push({ s: 4, p: 'c', v: .55 }, { s: 12, p: 'c', v: .55 }); }
  return b;
}

/* ジャズのライドパターン＋軽いキック。extra で合いの手を足す */
function jazzBar(extra) {
  const b = [
    { s: 0, p: 'h', v: .36 }, { s: 4, p: 'h', v: .28 }, { s: 7, p: 'h', v: .22 },
    { s: 8, p: 'h', v: .36 }, { s: 12, p: 'h', v: .28 }, { s: 15, p: 'h', v: .22 },
    { s: 0, p: 'k', v: .36 }, { s: 8, p: 'k', v: .34 },
  ];
  return b.concat(extra || []);
}

/* エレクトロの四つ打ち。open=true で裏のハットを強く（開いた感じに） */
function technoBar(open) {
  const b = [];
  [0, 4, 8, 12].forEach(s => b.push({ s, p: 'k', v: .98 }));
  b.push({ s: 4, p: 'c', v: .66 }, { s: 12, p: 'c', v: .70 });
  [1, 3, 5, 7, 9, 11, 13, 15].forEach(s => b.push({ s, p: 'h', v: open ? .38 : .28 }));
  return b;
}

/* ポップのエイトビート。fill=true で最後にキックを1つ足す */
function popBar(fill) {
  const b = [
    { s: 0, p: 'k', v: .92 }, { s: 8, p: 'k', v: .88 },
    { s: 4, p: 's', v: .74 }, { s: 12, p: 's', v: .74 },
    { s: 4, p: 'c', v: .60 }, { s: 12, p: 'c', v: .60 },
  ];
  [0, 2, 4, 6, 8, 10, 12, 14].forEach(s => b.push({ s, p: 'h', v: s % 4 === 0 ? .32 : .22 }));
  if (fill) b.push({ s: 11, p: 'k', v: .66 }, { s: 14, p: 's', v: .50 });
  return b;
}

/* ファンク：16分ハットを刻み、キックは裏で跳ねる。clap でバックビート強化 */
function funkBar(clap) {
  const b = [
    { s: 0, p: 'k', v: .98 }, { s: 6, p: 'k', v: .70 }, { s: 10, p: 'k', v: .76 },
    { s: 4, p: 's', v: .82 }, { s: 12, p: 's', v: .82 },
  ];
  for (let s = 0; s < 16; s++) b.push({ s, p: 'h', v: s % 4 === 0 ? .32 : (s % 2 === 0 ? .24 : .15) });
  if (clap) b.push({ s: 4, p: 'c', v: .58 }, { s: 12, p: 'c', v: .58 }, { s: 15, p: 'k', v: .52 });
  return b;
}

/* ヒップホップ：スネアを2拍4拍に重く置き、キックは間を空ける */
function hiphopBar(extra) {
  const b = [
    { s: 0, p: 'k', v: 1.0 }, { s: 4, p: 's', v: .92 }, { s: 12, p: 's', v: .92 },
  ];
  [0, 2, 4, 6, 8, 10, 12, 14].forEach(s => b.push({ s, p: 'h', v: s % 4 === 0 ? .26 : .17 }));
  return b.concat(extra || []);
}

/* ワールド：ハイハットを使わず、太鼓（キック＋タム）と手拍子だけで作る */
function worldBar(clapMore) {
  const b = [
    { s: 0, p: 'k', v: .95 }, { s: 6, p: 'k', v: .68 }, { s: 11, p: 'k', v: .62 },
    { s: 3, p: 't1', v: .52 }, { s: 8, p: 't2', v: .58 }, { s: 14, p: 't1', v: .50 },
    { s: 4, p: 'c', v: .56 }, { s: 12, p: 'c', v: .60 },
  ];
  if (clapMore) b.push({ s: 7, p: 'c', v: .38 }, { s: 10, p: 't3', v: .52 });
  return b;
}

/* ハープの分散和音：8分で積みの番号を辿る */
function harpBar(indices) {
  return indices.map((n, i) => ({ s: i * 2, n, v: i === 0 ? .62 : .44, l: '4n' }));
}

/* シンセの16分アルペジオ：null は休符 */
function arpBar(indices) {
  const out = [];
  indices.forEach((t, s) => {
    if (t == null) return;
    out.push({ s, t, v: s % 4 === 0 ? .88 : (s % 2 === 0 ? .58 : .40), l: '16n' });
  });
  return out;
}

/* ============ 8. 和音の積み方 ============ */
function voicing(kind, ch, oct) {
  const V = ch.vc;
  switch (kind) {
    case 'power':                                   // ロック：ルートと5度だけ
      return [ch.root, ch.root + 7, ch.root + 12];
    case 'rootless':                                // ジャズ：ルートを抜く（ベースに任せる）
      return [V[1], V[2], V[3], V[4]];
    case 'triad':
      return [V[0], V[1], V[2]];
    case 'pad':                                     // 広く積んで空間を作る
      return [V[0], V[2], V[3], V[4], V[1] + 12];
    case 'open':                                    // ギターで押さえたような開いた形
      return [V[0], V[2], V[1] + 12, V[3] + 12, V[4] + 12];
    default:
      return V.slice();
  }
}

/* 強いイベントか（when:'accent' のレイヤーはここが true のときだけ鳴る） */
function isAccent(ev) { return (ev.v || 0) >= 0.62; }
