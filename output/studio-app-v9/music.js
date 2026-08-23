/* =====================================================================
   music.js — 「譜面（PHRASES）」と「世界（WORLDS）」（v9）
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
/* いま有効な進行を返す。スタイルカード（9章）が出ていればそちらの進行になる */
function currentProg() { return (World.def && World.def.prog) ? World.def.prog : PROG; }
function chordAt(bar) { const P = currentProg(); return P[((bar % 4) + 4) % 4]; }

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
    keys: ['1', '2', '3', '4', '5'],
    oct: 4, hp: 180, lp: 15000, gain: -6, send: 0.34, delay: 0.22, pan: 0.18,
  },
  bass: {
    label: 'BASS', jp: 'ベース', desc: '曲の「足元」・低音と安定感',
    keys: ['q', 'w', 'e', 'r', 't'],
    oct: 2, hp: 24, lp: 3200, gain: -3, send: 0.05, delay: 0, pan: 0,
  },
  rhythm: {
    label: 'RHYTHM', jp: 'リズム', desc: '曲の「動き」・拍とノリ',
    keys: ['a', 's', 'd', 'f', 'g'],
    oct: 0, hp: 26, lp: 17000, gain: -4, send: 0.14, delay: 0, pan: 0,
  },
  chord: {
    label: 'CHORD', jp: 'コード', desc: '曲の「空間」・和音と厚み',
    keys: ['z', 'x', 'c', 'v', 'b'],
    oct: 3, hp: 110, lp: 13000, gain: -5, send: 0.30, delay: 0.10, pan: 0.30,
  },
};
const ROLE_ORDER = ['melody', 'bass', 'rhythm', 'chord'];

/* ============ 4. キャラクター（グリッドの列） ============
   v9 で「ジャンル」を撤廃した。

   v3 までは列が ロック／ジャズ／クラシック／エレクトロ／ポップ という
   ジャンルだった。しかしスタイルカードで世界が変わると
   「ジャズの世界のロックのカード」という意味の通らない札ができてしまう。

   そこで列を **音楽の性格（キャラクター）** に置き換えた。
   性格はジャンルに属さない。どの世界にも「軸」も「歌」も「刻み」もある。
   楽器はカードではなく **世界の側** が決める（9章の WORLDS）。

     軸   … 背骨。素直で覚えやすい
     歌   … 長く伸びる。ひとつの物語を描く
     押し … 8分で前へ押し出す
     刻み … 16分の反復で走らせる
     彩り … 裏拍の合いの手で飾る

   譜面（PHRASES）は性格ごとに1つ。楽器は世界ごとに20通り。
   つまり **同じ札が、世界の数だけ違う楽器で鳴る**。                   */
const CHARACTERS = {
  core:  { label: '軸',   sub: 'CORE',  desc: '背骨・素直な8分' },
  sing:  { label: '歌',   sub: 'SING',  desc: '伸びる・歌う' },
  push:  { label: '押し', sub: 'PUSH',  desc: '前へ押し出す' },
  drive: { label: '刻み', sub: 'DRIVE', desc: '16分・反復' },
  color: { label: '彩り', sub: 'COLOR', desc: '裏拍・合いの手' },
};
const CHAR_ORDER = ['core', 'sing', 'push', 'drive', 'color'];

/* 各マスに出す「この札は何をする札か」の説明。
   楽器名ではなく“はたらき”を書く。楽器は世界で変わるが、はたらきは変わらない */
const HOOKS = {
  core:  { melody: '口ずさめる主旋律', bass: '8分で支える低音', rhythm: '素直な8ビート',   chord: '開いた和音を刻む' },
  sing:  { melody: '伸びて歌う旋律',   bass: '長く支える低音',   rhythm: '打点だけの打楽器', chord: '分散和音（アルペジオ）' },
  push:  { melody: '力強いリフ',       bass: '押し出す8分',      rhythm: '8ビート＋クラップ', chord: '和音を短く刻む' },
  drive: { melody: '16分のアルペジオ', bass: '16分の反復',       rhythm: '四つ打ち',         chord: '伸ばしっぱなしの和音' },
  color: { melody: '合いの手の旋律',   bass: '歩く低音',         rhythm: 'ライドと薄いキック', chord: '裏拍のコンピング' },
};

/* ============ 5. 音源の一覧 ============
   kind  'sampler' 実録音 / 'kit' 実録音ドラム / 'synth' 合成音
   ctr   その楽器の「中心オクターブ」。実際に録音されている音域の真ん中。
         v9 では編成を世界ごとに手で決めているので自動補正には使わないが、
         編成表を書くときの目安として残してある
         （例：シロフォンは ctr5 なので oct5 で書く）。
   speak その楽器が「音として聞こえる形になるまで」に要る秒数。
         譜面の音符がこれより短いときは、engine.js がここまで伸ばす。
         値は samples/ の実録音を全部デコードして測った実測値
         （5msごとのRMSが最大音量の80%に達するまでの時間の中央値、
         上限0.45秒で頭打ち）。測定結果：
           ピアノ 0.020／エレキギター 0.030／エレキベース 0.045／
           サックス 0.065／トランペット 0.085／ホルン 0.180／
           クラリネット 0.240／トロンボーン 0.495／ハルモニウム 0.605／
           チェロ 0.525／ウッドベース 0.885（秒）
         ピアノとウッドベースで44倍ちがう。16分音符は132BPMで0.114秒
         なので、ウッドベースは音量の25%も出ないうちに切られていた。
         これが「短い音だと楽器の音すら聞こえない」の正体。
   minGap その楽器が実際に出せる「音と音の最短の間隔」秒。
         これより詰まった音符は engine.js が間引く（前の音を伸ばす）。
         太い管や弓の楽器に16分の連打を書いても実際には吹けないので、
         間引いて8分相当にしたほうが、その楽器らしく、かつ濁らない。
         0 は「いくら細かくても付いてこられる」の意味。
         サックス・クラリネット・フルート・バイオリンは実測でも速く、
         実際に細かく吹ける楽器なので 0 のまま。                  */
const VOICES = {
  piano:             { label: 'ピアノ',           kind: 'sampler', env: { attack: 0,     release: 1.6 }, speak: 0, minGap: 0, ctr: 4, fb: 'poly' },
  organ:             { label: 'オルガン',         kind: 'sampler', env: { attack: 0.01,  release: 0.5 }, speak: 0.3, minGap: 0, ctr: 4, fb: 'organ' },
  harmonium:         { label: 'ハルモニウム',     kind: 'sampler', env: { attack: 0.05,  release: 0.9 }, speak: 0.35, minGap: 0.16, ctr: 3, fb: 'organ' },
  harp:              { label: 'ハープ',           kind: 'sampler', env: { attack: 0,     release: 2.2 }, speak: 0.07, minGap: 0, ctr: 3, fb: 'poly' },
  xylophone:         { label: 'シロフォン',       kind: 'sampler', env: { attack: 0,     release: 0.8 }, speak: 0.03, minGap: 0, ctr: 5, fb: 'bell' },
  'guitar-electric': { label: 'エレキギター',     kind: 'sampler', env: { attack: 0.002, release: 0.5 }, speak: 0.04, minGap: 0, ctr: 3, fb: 'pluck' },
  'guitar-acoustic': { label: 'アコギ',           kind: 'sampler', env: { attack: 0.003, release: 1.0 }, speak: 0.07, minGap: 0, ctr: 3, fb: 'pluck' },
  'guitar-nylon':    { label: 'ガットギター',     kind: 'sampler', env: { attack: 0.004, release: 1.1 }, speak: 0.05, minGap: 0, ctr: 3, fb: 'pluck' },
  'bass-electric':   { label: 'エレキベース',     kind: 'sampler', env: { attack: 0.002, release: 0.35 }, speak: 0.07, minGap: 0, ctr: 2, fb: 'mono' },
  contrabass:        { label: 'ウッドベース',     kind: 'sampler', env: { attack: 0.008, release: 0.45 }, speak: 0.45, minGap: 0.2, ctr: 2, fb: 'mono' },
  cello:             { label: 'チェロ',           kind: 'sampler', env: { attack: 0.05,  release: 1.0 }, speak: 0.4, minGap: 0.16, ctr: 3, fb: 'bow' },
  violin:            { label: 'バイオリン',       kind: 'sampler', env: { attack: 0.05,  release: 0.9 }, speak: 0.3, minGap: 0, ctr: 4, fb: 'bow' },
  flute:             { label: 'フルート',         kind: 'sampler', env: { attack: 0.03,  release: 0.6 }, speak: 0.3, minGap: 0, ctr: 5, fb: 'bow' },
  clarinet:          { label: 'クラリネット',     kind: 'sampler', env: { attack: 0.03,  release: 0.5 }, speak: 0.26, minGap: 0, ctr: 4, fb: 'reed' },
  saxophone:         { label: 'サックス',         kind: 'sampler', env: { attack: 0.012, release: 0.35 }, speak: 0.1, minGap: 0, ctr: 4, fb: 'reed' },
  trumpet:           { label: 'トランペット',     kind: 'sampler', env: { attack: 0.01,  release: 0.3 }, speak: 0.12, minGap: 0, ctr: 4, fb: 'reed' },
  trombone:          { label: 'トロンボーン',     kind: 'sampler', env: { attack: 0.02,  release: 0.4 }, speak: 0.4, minGap: 0.2, ctr: 3, fb: 'reed' },
  'french-horn':     { label: 'ホルン',           kind: 'sampler', env: { attack: 0.04,  release: 0.8 }, speak: 0.2, minGap: 0.14, ctr: 3, fb: 'bow' },
  'synth-lead':      { label: 'シンセリード',     kind: 'synth', speak: 0.05, minGap: 0, ctr: 5, fb: 'lead' },
  'synth-bass':      { label: 'シンセベース',     kind: 'synth', speak: 0.05, minGap: 0, ctr: 2, fb: 'sbass' },
  'synth-pad':       { label: 'シンセパッド',     kind: 'synth', speak: 1.2, minGap: 0.25, ctr: 3, fb: 'pad' },
  sub:               { label: 'サブベース',       kind: 'synth', speak: 0.1, minGap: 0, ctr: 2, fb: 'sub' },
  drums:             { label: 'ドラム',           kind: 'kit' },
};

/* =====================================================================
   6. 譜面（PHRASES）— キャラクター × 役割 ＝ 20枠
   ---------------------------------------------------------------------
   v9 では、ここには **音の並びしか無い**。楽器は書かれていない。
   楽器は 9章の WORLDS が世界ごとに決める。
   つまり同じ譜面が、5つの世界で5通りの楽器で鳴る。

   フレーズの書式（1小節＝16ステップ）
     MELODY  { s, t:和音の梯子の番号, v:強さ, l:長さ }
     BASS    { s, c:0ルート/1・5度/2・オクターブ/3・3度, app:次の和音へ半音で寄せる, v, l }
     CHORD   { s, n:積みの何番目か（省略＝全部）, v, l }
     RHYTHM  { s, p:'k'キック 's'スネア 'h'ハット 't1..t3'タム 'c'クラップ, v }
   ===================================================================== */
const PHRASES = {

  /* ───────────── 軸 CORE：素直な8分。口ずさめる形。何と重ねても土台になる ───────────── */
  core: {
    melody: {
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
      phrase: [
        coreBar(false), coreBar(false), coreBar(true),
        [ { s: 0, p: 'k', v: .92 }, { s: 8, p: 'k', v: .88 }, { s: 11, p: 'k', v: .66 },
          { s: 4, p: 's', v: .74 }, { s: 12, p: 's', v: .74 },
          { s: 4, p: 'c', v: .62 }, { s: 12, p: 'c', v: .62 },
          { s: 0, p: 'h', v: .30 }, { s: 2, p: 'h', v: .22 }, { s: 4, p: 'h', v: .30 },
          { s: 6, p: 'h', v: .22 }, { s: 8, p: 'h', v: .30 }, { s: 10, p: 'h', v: .22 },
          { s: 13, p: 't2', v: .56 }, { s: 14, p: 't1', v: .64 }, { s: 15, p: 's', v: .80 } ],
      ],
    },
    chord: {
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

  /* ───────────── 歌 SING：長く伸びる音。4小節でひとつの物語を描く ───────────── */
  sing: {
    melody: {
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
      phrase: [
        [ { s: 0, c: 0, v: .68, l: '2n' }, { s: 8, c: 1, v: .56, l: '2n' } ],
        [ { s: 0, c: 0, v: .66, l: '1n' } ],
        [ { s: 0, c: 0, v: .72, l: '2n' }, { s: 8, c: 3, v: .58, l: '2n' } ],
        [ { s: 0, c: 0, v: .66, l: '2n' }, { s: 8, c: 1, v: .56, l: '4n' },
          { s: 12, app: -1, v: .60, l: '4n' } ],
      ],
    },
    rhythm: {
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
      /* 3小節は16分の分散和音（ハープのグリッサンド風）、4小節目は全部まとめて */
      phrase: [
        harpBar([0, 1, 2, 3, 4, 3, 2, 1]),
        harpBar([0, 2, 4, 5, 6, 5, 4, 2]),
        harpBar([2, 3, 4, 5, 6, 7, 8, 7]),
        [ { s: 0, v: .62, l: '1n' } ],
      ],
    },
  },

  /* ───────────── 押し PUSH：8分で前へ押し出す。いちばん力強い ───────────── */
  push: {
    melody: {
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
      phrase: [
        pushBar(false), pushBar(true), pushBar(false),
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

  /* ───────────── 刻み DRIVE：16分の反復で走らせる。機械的な推進力 ───────────── */
  drive: {
    melody: {
      /* 16分の分散。2小節目で抜きを作り、3小節目で上に、4小節目で戻す */
      phrase: [
        arpBar([0, 2, 4, 2, 0, 3, 5, 3, 1, 3, 5, 3, 2, 4, 6, 4]),
        arpBar([2, 4, 6, 4, null, null, null, null, 1, 3, 5, 3, 0, 2, 4, 2]),
        arpBar([4, 6, 8, 6, 4, 7, 9, 7, 5, 7, 9, 7, 6, 8, 10, 8]),
        arpBar([2, 4, 6, 4, 2, 5, 7, 5, 1, 3, 5, 3, 0, 2, 4, 6]),
      ],
    },
    bass: {
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
      phrase: [
        driveBar(false), driveBar(true), driveBar(false),
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
      phrase: [
        [ { s: 0, v: .58, l: '1n' } ],
        [ { s: 0, v: .58, l: '1n' } ],
        [ { s: 0, v: .62, l: '1n' } ],
        [ { s: 0, v: .58, l: '2n' }, { s: 8, v: .52, l: '4n' }, { s: 12, v: .60, l: '4n' } ],
      ],
    },
  },

  /* ───────────── 彩り COLOR：裏拍と合いの手で飾る。休符が主役 ───────────── */
  color: {
    melody: {
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
      /* ハットでライドのパターン（1・2・2裏・3・4・4裏）。キックは軽く */
      phrase: [
        colorBar([{ s: 7, p: 's', v: .38 }, { s: 14, p: 's', v: .32 }]),
        colorBar([{ s: 3, p: 's', v: .34 }, { s: 10, p: 's', v: .40 }]),
        colorBar([{ s: 7, p: 's', v: .38 }, { s: 11, p: 's', v: .30 }, { s: 15, p: 't1', v: .34 }]),
        [ { s: 0, p: 'h', v: .34 }, { s: 4, p: 'h', v: .26 }, { s: 8, p: 'h', v: .30 },
          { s: 0, p: 'k', v: .36 }, { s: 8, p: 'k', v: .34 },
          { s: 3, p: 's', v: .40 }, { s: 7, p: 't1', v: .48 }, { s: 10, p: 't2', v: .50 },
          { s: 12, p: 't3', v: .55 }, { s: 14, p: 's', v: .48 }, { s: 15, p: 's', v: .58 } ],
      ],
    },
    chord: {
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
};

/* ============ 7. 小節を短く書くための補助 ============ */

/* 押し：8ビート。clap=true でバックビートにクラップを重ねる */
function pushBar(clap) {
  const b = [
    { s: 0, p: 'k', v: .95 }, { s: 6, p: 'k', v: .78 },
    { s: 8, p: 'k', v: .92 }, { s: 14, p: 'k', v: .72 },
    { s: 4, p: 's', v: .82 }, { s: 12, p: 's', v: .82 },
  ];
  [0, 2, 4, 6, 8, 10, 12, 14].forEach(s => b.push({ s, p: 'h', v: s % 4 === 0 ? .36 : .25 }));
  if (clap) { b.push({ s: 4, p: 'c', v: .55 }, { s: 12, p: 'c', v: .55 }); }
  return b;
}

/* 彩り：ライドのパターン＋軽いキック。extra で合いの手を足す */
function colorBar(extra) {
  const b = [
    { s: 0, p: 'h', v: .36 }, { s: 4, p: 'h', v: .28 }, { s: 7, p: 'h', v: .22 },
    { s: 8, p: 'h', v: .36 }, { s: 12, p: 'h', v: .28 }, { s: 15, p: 'h', v: .22 },
    { s: 0, p: 'k', v: .36 }, { s: 8, p: 'k', v: .34 },
  ];
  return b.concat(extra || []);
}

/* 刻み：四つ打ち。open=true で裏のハットを強く（開いた感じに） */
function driveBar(open) {
  const b = [];
  [0, 4, 8, 12].forEach(s => b.push({ s, p: 'k', v: .98 }));
  b.push({ s: 4, p: 'c', v: .66 }, { s: 12, p: 'c', v: .70 });
  [1, 3, 5, 7, 9, 11, 13, 15].forEach(s => b.push({ s, p: 'h', v: open ? .38 : .28 }));
  return b;
}

/* 軸：エイトビート。fill=true で最後にキックを1つ足す */
function coreBar(fill) {
  const b = [
    { s: 0, p: 'k', v: .92 }, { s: 8, p: 'k', v: .88 },
    { s: 4, p: 's', v: .74 }, { s: 12, p: 's', v: .74 },
    { s: 4, p: 'c', v: .60 }, { s: 12, p: 'c', v: .60 },
  ];
  [0, 2, 4, 6, 8, 10, 12, 14].forEach(s => b.push({ s, p: 'h', v: s % 4 === 0 ? .32 : .22 }));
  if (fill) b.push({ s: 11, p: 'k', v: .66 }, { s: 14, p: 's', v: .50 });
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
  switch (World.voicingKind(kind)) {
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

/* =====================================================================
   9. 世界（WORLDS）— 標準＋スタイルカード4枚
   ---------------------------------------------------------------------
   v9 の中心。世界は次のものを丸ごと持つ。

     prog       コード進行（調ごと）。null＝2章の PROG をそのまま使う
     bpm        テンポ。null＝開始画面で選んだ値
     swing      跳ね
     harmony    メロディに重ねるハモリ（音の梯子で何段上か。null＝なし）
     kit        土台のビートのドラムキット
     drumMap    打楽器の読み替え（'c'クラップ→'h' など。null＝鳴らさない）
     voicingMap 和音の積み方の読み替え（既定は変換なし）
     音場        sendScale(残響)／delayScale／panScale／air／mud／drumGain／energyScale
     voices     ★ 20枠ぶんの編成表（キャラクター × 役割 → 楽器のレイヤー）

   voices が v9 の新しいところ。
   v3 は「楽器A→楽器B」という機械的な読み替えだったが、v9 は
   **世界ごとに20枠すべてを手で決めている**。
   だから、その音楽に実在しない楽器は最初から出てこない
   （例：マイルスの世界にギターとシンセは1本も無い）。

   レイヤーの書式は v3 と同じ：
     voice / oct / gain / tr / when:'accent' / kit / voicing / strum / drive / lp
   ===================================================================== */
const WORLDS = {

  /* ───────────── 標準：どこにも寄っていない現代のバンド編成 ─────────────
     ゲーム開始時はここ。スタイルカードを出すまでの土台。            */
  base: {
    label: '標準', sub: 'NEUTRAL', key: null,
    desc: 'どこにも寄っていない',
    detail: 'Cm9 → A♭maj9 → E♭6/9 → B♭sus9・テンポは開始画面で選んだ値',
    prog: null,
    bpm: null,
    swing: 0, swingSub: '8n', harmony: null,
    kit: 'acoustic-kit', drumMap: {}, voicingMap: {},
    sendScale: 1, delayScale: 1, panScale: 1,
    air: 5, mud: -2.5, drumGain: 0, energyScale: 1,
    voices: {
      core: {
        melody: [ { voice: 'piano', oct: 4, gain: -3 },
                  { voice: 'synth-lead', oct: 5, gain: -18, when: 'accent' } ],
        bass:   [ { voice: 'bass-electric', oct: 2, gain: -3 },
                  { voice: 'sub', oct: 2, gain: -9 } ],
        rhythm: [ { voice: 'drums', kit: 'Kit3', gain: -3 } ],
        chord:  [ { voice: 'guitar-acoustic', oct: 3, gain: -6, voicing: 'open', strum: 0.016 },
                  { voice: 'harmonium', oct: 3, gain: -16, voicing: 'full', when: 'accent' } ],
      },
      sing: {
        melody: [ { voice: 'violin', oct: 4, gain: -6 },
                  { voice: 'flute', oct: 5, gain: -13, when: 'accent' } ],
        bass:   [ { voice: 'cello', oct: 3, gain: -5 },
                  { voice: 'contrabass', oct: 2, gain: -9 } ],
        rhythm: [ { voice: 'drums', kit: 'acoustic-kit', gain: -6 } ],
        chord:  [ { voice: 'harp', oct: 3, gain: -6, voicing: 'full' },
                  { voice: 'french-horn', oct: 3, gain: -15, voicing: 'triad', when: 'accent' } ],
      },
      push: {
        melody: [ { voice: 'guitar-electric', oct: 3, gain: -5, drive: 0.34 },
                  { voice: 'guitar-electric', oct: 4, gain: -15, drive: 0.34, when: 'accent' } ],
        bass:   [ { voice: 'bass-electric', oct: 2, gain: -3 },
                  { voice: 'sub', oct: 2, gain: -8 } ],
        rhythm: [ { voice: 'drums', kit: 'acoustic-kit', gain: -3 } ],
        chord:  [ { voice: 'guitar-electric', oct: 3, gain: -7, drive: 0.40, voicing: 'power' },
                  { voice: 'organ', oct: 4, gain: -14, voicing: 'full', when: 'accent' } ],
      },
      drive: {
        melody: [ { voice: 'synth-lead', oct: 5, gain: -9 },
                  { voice: 'synth-lead', oct: 4, gain: -14, when: 'accent' } ],
        bass:   [ { voice: 'synth-bass', oct: 2, gain: -4 },
                  { voice: 'sub', oct: 2, gain: -6 } ],
        rhythm: [ { voice: 'drums', kit: 'LINN', gain: -3 } ],
        chord:  [ { voice: 'synth-pad', oct: 3, gain: -11, voicing: 'pad' },
                  { voice: 'organ', oct: 4, gain: -17, voicing: 'full', when: 'accent' } ],
      },
      color: {
        melody: [ { voice: 'saxophone', oct: 4, gain: -7 },
                  { voice: 'trumpet', oct: 4, gain: -13, tr: 5, when: 'accent' } ],
        bass:   [ { voice: 'contrabass', oct: 2, gain: -4 },
                  { voice: 'sub', oct: 2, gain: -14 } ],
        rhythm: [ { voice: 'drums', kit: 'acoustic-kit', gain: -5 } ],
        chord:  [ { voice: 'piano', oct: 3, gain: -6, voicing: 'rootless' },
                  { voice: 'xylophone', oct: 5, gain: -18, voicing: 'rootless', when: 'accent' } ],
      },
    },
  },

  /* ───────────── ビートルズ ─────────────
     編成の根拠：『ラバー・ソウル』でハルモニウムを導入し、『リボルバー』では
     「エリナー・リグビー」の弦楽八重奏とホーンの編曲を持ち込んだ。
     「Think for Yourself」では通常のベースにファズベースを重ねている。
     ポール・マッカートニーのベースは12度を駆け上がるなど旋律的。
     土台はエレキ＋アコギ＋ベース＋ドラム＋ピアノ／オルガン。         */
  beatles: {
    label: 'ビートルズ', sub: 'THE BEATLES', key: '6',
    desc: '明るいギターバンド',
    detail: 'D調・118BPM・♭VII と II7・3度のハモリ',
    prog: [
      { name: 'D6/9',  root:  2, vc: [ 2,  6,  9, 11, 16], lad: [2, 4, 6,  9, 11, 14, 16, 18, 21] },
      { name: 'E7',    root:  4, vc: [ 4,  8, 11, 14, 18], lad: [4, 6, 8, 11, 14, 16, 18, 20, 23] },
      { name: 'G6/9',  root:  7, vc: [ 7, 11, 14, 16, 21], lad: [2, 4, 7,  9, 11, 14, 16, 19, 21] },
      { name: 'C6/9',  root:  0, vc: [ 0,  4,  7,  9, 14], lad: [0, 2, 4,  7,  9, 12, 14, 16, 19] },
    ],
    bpm: 118, swing: 0, swingSub: '8n', harmony: 2,
    kit: 'Kit3', drumMap: {}, voicingMap: {},
    sendScale: 0.62, delayScale: 0.25, panScale: 0.55,
    air: 3.5, mud: -1.0, drumGain: 1, energyScale: 1,
    voices: {
      core: {   /* ピアノとアコギの主旋律 */
        melody: [ { voice: 'piano', oct: 4, gain: -4 },
                  { voice: 'guitar-acoustic', oct: 3, gain: -12, when: 'accent' } ],
        bass:   [ { voice: 'bass-electric', oct: 2, gain: -3 },
                  { voice: 'sub', oct: 2, gain: -12 } ],
        rhythm: [ { voice: 'drums', kit: 'Kit3', gain: -3 } ],
        chord:  [ { voice: 'guitar-acoustic', oct: 3, gain: -6, voicing: 'open', strum: 0.018 },
                  { voice: 'harmonium', oct: 3, gain: -14, voicing: 'full', when: 'accent' } ],
      },
      sing: {   /* 「エリナー・リグビー」の弦 */
        melody: [ { voice: 'violin', oct: 4, gain: -7 },
                  { voice: 'cello', oct: 3, gain: -14, when: 'accent' } ],
        bass:   [ { voice: 'cello', oct: 3, gain: -6 },
                  { voice: 'contrabass', oct: 2, gain: -10 } ],
        rhythm: [ { voice: 'drums', kit: 'acoustic-kit', gain: -8 } ],
        chord:  [ { voice: 'harmonium', oct: 3, gain: -8, voicing: 'full' },
                  { voice: 'french-horn', oct: 3, gain: -15, voicing: 'triad', when: 'accent' } ],
      },
      push: {   /* 通常のベースにファズベースを重ねる */
        melody: [ { voice: 'guitar-electric', oct: 3, gain: -5, drive: 0.28 },
                  { voice: 'guitar-electric', oct: 4, gain: -15, drive: 0.28, when: 'accent' } ],
        bass:   [ { voice: 'bass-electric', oct: 2, gain: -3 },
                  { voice: 'guitar-electric', oct: 2, gain: -17, drive: 0.55, when: 'accent' } ],
        rhythm: [ { voice: 'drums', kit: 'Kit3', gain: -3 } ],
        chord:  [ { voice: 'guitar-electric', oct: 3, gain: -7, drive: 0.22, voicing: 'open', strum: 0.012 },
                  { voice: 'organ', oct: 4, gain: -14, voicing: 'full', when: 'accent' } ],
      },
      drive: {  /* ピアノで刻む */
        melody: [ { voice: 'piano', oct: 4, gain: -6 },
                  { voice: 'guitar-electric', oct: 4, gain: -16, drive: 0.20, when: 'accent' } ],
        bass:   [ { voice: 'bass-electric', oct: 2, gain: -4 },
                  { voice: 'sub', oct: 2, gain: -14 } ],
        rhythm: [ { voice: 'drums', kit: 'Kit3', gain: -4 } ],
        chord:  [ { voice: 'piano', oct: 3, gain: -8, voicing: 'open' },
                  { voice: 'organ', oct: 4, gain: -16, voicing: 'full', when: 'accent' } ],
      },
      color: {  /* ホーンセクション */
        melody: [ { voice: 'trumpet', oct: 4, gain: -8 },
                  { voice: 'trombone', oct: 3, gain: -14, when: 'accent' } ],
        bass:   [ { voice: 'bass-electric', oct: 2, gain: -4 },
                  { voice: 'sub', oct: 2, gain: -14 } ],
        rhythm: [ { voice: 'drums', kit: 'acoustic-kit', gain: -6 } ],
        chord:  [ { voice: 'piano', oct: 3, gain: -7, voicing: 'full' },
                  { voice: 'harmonium', oct: 3, gain: -16, voicing: 'full', when: 'accent' } ],
      },
    },
  },

  /* ───────────── 藤井風 ─────────────
     編成の根拠：全曲を Yaffle が編曲・プロデュースしており、
     「ドラムやベース、ギターやサンプリング音源でのプログラミング、
     ストリングス、ホーンセクションなどを合わせて組み立てていく」手法。
     つまり生楽器と打ち込みが同居する。中心はあくまでピアノ。       */
  kaze: {
    label: '藤井風', sub: 'FUJII KAZE', key: '7',
    desc: 'ピアノとゴスペル',
    detail: 'E♭調・88BPM・Ⅱm–Ⅴ–Ⅰ–Ⅵ7(♭9)・16分の跳ね',
    prog: [
      { name: 'Fm9',    root:  5, vc: [ 5,  8, 12, 15, 19], lad: [3, 5, 7,  8, 12, 15, 17, 19, 20] },
      { name: 'B♭9',    root: -2, vc: [-2,  2,  5,  8, 12], lad: [2, 5, 7, 10, 12, 14, 17, 19, 22] },
      { name: 'E♭maj9', root:  3, vc: [ 3,  7, 10, 14, 17], lad: [3, 5, 7, 10, 12, 15, 17, 19, 22] },
      { name: 'C7♭9',   root:  0, vc: [ 0,  4,  7, 10, 13], lad: [1, 4, 7, 10, 12, 13, 16, 19, 22] },
    ],
    bpm: 88, swing: 0.22, swingSub: '16n', harmony: null,
    kit: 'Kit8', drumMap: {}, voicingMap: {},
    sendScale: 1.10, delayScale: 1.20, panScale: 0.80,
    air: 2.0, mud: -3.5, drumGain: -2, energyScale: 0.98,
    voices: {
      core: {   /* ピアノが主役。低音は深い */
        melody: [ { voice: 'piano', oct: 4, gain: -3 },
                  { voice: 'synth-lead', oct: 5, gain: -20, when: 'accent' } ],
        bass:   [ { voice: 'bass-electric', oct: 2, gain: -3 },
                  { voice: 'sub', oct: 2, gain: -5 } ],
        rhythm: [ { voice: 'drums', kit: 'Kit8', gain: -4 } ],
        chord:  [ { voice: 'piano', oct: 3, gain: -5, voicing: 'open' },
                  { voice: 'synth-pad', oct: 3, gain: -16, voicing: 'pad', when: 'accent' } ],
      },
      sing: {   /* ストリングス */
        melody: [ { voice: 'violin', oct: 4, gain: -8 },
                  { voice: 'cello', oct: 3, gain: -15, when: 'accent' } ],
        bass:   [ { voice: 'contrabass', oct: 2, gain: -5 },
                  { voice: 'sub', oct: 2, gain: -8 } ],
        rhythm: [ { voice: 'drums', kit: 'Kit8', gain: -8 } ],
        chord:  [ { voice: 'synth-pad', oct: 3, gain: -13, voicing: 'pad' },
                  { voice: 'violin', oct: 4, gain: -19, voicing: 'triad', when: 'accent' } ],
      },
      push: {   /* 歪ませないカッティング */
        melody: [ { voice: 'guitar-electric', oct: 3, gain: -8, drive: 0.12 },
                  { voice: 'organ', oct: 4, gain: -16, when: 'accent' } ],
        bass:   [ { voice: 'bass-electric', oct: 2, gain: -3 },
                  { voice: 'sub', oct: 2, gain: -6 } ],
        rhythm: [ { voice: 'drums', kit: 'Kit8', gain: -3 } ],
        chord:  [ { voice: 'guitar-electric', oct: 3, gain: -9, drive: 0.10, voicing: 'open', strum: 0.014 },
                  { voice: 'organ', oct: 4, gain: -15, voicing: 'full', when: 'accent' } ],
      },
      drive: {  /* ここだけ打ち込み（プログラミング） */
        melody: [ { voice: 'piano', oct: 4, gain: -7 },
                  { voice: 'xylophone', oct: 5, gain: -19, when: 'accent' } ],
        bass:   [ { voice: 'synth-bass', oct: 2, gain: -5 },
                  { voice: 'sub', oct: 2, gain: -5 } ],
        rhythm: [ { voice: 'drums', kit: 'LINN', gain: -4 } ],
        chord:  [ { voice: 'organ', oct: 3, gain: -10, voicing: 'open' },
                  { voice: 'synth-pad', oct: 3, gain: -16, voicing: 'pad', when: 'accent' } ],
      },
      color: {  /* ホーンセクションとゴスペルのオルガン */
        melody: [ { voice: 'saxophone', oct: 4, gain: -8 },
                  { voice: 'trumpet', oct: 4, gain: -14, tr: 5, when: 'accent' } ],
        bass:   [ { voice: 'bass-electric', oct: 2, gain: -4 },
                  { voice: 'sub', oct: 2, gain: -8 } ],
        rhythm: [ { voice: 'drums', kit: 'Kit8', gain: -6 } ],
        chord:  [ { voice: 'piano', oct: 3, gain: -6, voicing: 'rootless' },
                  { voice: 'organ', oct: 4, gain: -15, voicing: 'full', when: 'accent' } ],
      },
    },
  },

  /* ───────────── マイルス・デイヴィス／ビル・エヴァンス ─────────────
     編成の根拠：『カインド・オブ・ブルー』の六重奏は
     トランペット（マイルス）／アルトサックス（キャノンボール）／
     テナーサックス（コルトレーン）／ピアノ（ビル・エヴァンス）／
     ウッドベース（ポール・チェンバース）／ドラム（ジミー・コブ）。
     ギターもシンセも1本も入っていない。だからこの世界には出さない。
     サックスの音源は1つしかないので、重ねる相手（トランペット／
     トロンボーン）を変えて管の厚みを作り分けている。               */
  modal: {
    label: 'マイルス／エヴァンス', sub: 'MODAL JAZZ', key: '8',
    desc: '夜のモードジャズ',
    detail: 'Dドリアン・132BPM・4度堆積・半音上へずれる3小節目',
    prog: [
      { name: 'Dm11',  root:  2, vc: [ 4,  9, 14, 19, 23], lad: [2, 4, 5, 7,  9, 11, 12, 14, 16] },
      { name: 'Dm11',  root:  2, vc: [ 4,  9, 14, 19, 23], lad: [2, 4, 5, 7,  9, 11, 12, 14, 16] },
      { name: 'E♭m11', root:  3, vc: [ 5, 10, 15, 20, 24], lad: [3, 5, 6, 8, 10, 12, 13, 15, 17] },
      { name: 'Dm11',  root:  2, vc: [ 4,  9, 14, 19, 23], lad: [2, 4, 5, 7,  9, 11, 12, 14, 16] },
    ],
    bpm: 132, swing: 0.35, swingSub: '8n', harmony: null,
    kit: 'acoustic-kit',
    drumMap: { c: 'h' },
    voicingMap: {},
    sendScale: 1.25, delayScale: 0.35, panScale: 0.90,
    air: 1.0, mud: -1.5, drumGain: -3, energyScale: 0.85,
    voices: {
      core: {   /* トランペットとサックスのユニゾンで主題を吹く */
        melody: [ { voice: 'trumpet', oct: 4, gain: -8 },
                  { voice: 'saxophone', oct: 4, gain: -16, when: 'accent' } ],
        bass:   [ { voice: 'contrabass', oct: 2, gain: -4 },
                  { voice: 'sub', oct: 2, gain: -16 } ],
        rhythm: [ { voice: 'drums', kit: 'acoustic-kit', gain: -6 } ],
        chord:  [ { voice: 'piano', oct: 3, gain: -6, voicing: 'rootless' } ],
      },
      sing: {   /* バラード。トランペットにピアノが寄り添う */
        melody: [ { voice: 'trumpet', oct: 4, gain: -7 },
                  { voice: 'piano', oct: 4, gain: -18, when: 'accent' } ],
        bass:   [ { voice: 'contrabass', oct: 2, gain: -4 },
                  { voice: 'sub', oct: 2, gain: -18 } ],
        rhythm: [ { voice: 'drums', kit: 'acoustic-kit', gain: -10 } ],
        chord:  [ { voice: 'piano', oct: 3, gain: -7, voicing: 'full' },
                  { voice: 'trombone', oct: 3, gain: -17, voicing: 'triad', when: 'accent' } ],
      },
      push: {   /* ホーン隊がハモる */
        melody: [ { voice: 'saxophone', oct: 4, gain: -7 },
                  { voice: 'trumpet', oct: 4, gain: -13, tr: 5, when: 'accent' } ],
        bass:   [ { voice: 'contrabass', oct: 2, gain: -3 },
                  { voice: 'sub', oct: 2, gain: -16 } ],
        rhythm: [ { voice: 'drums', kit: 'acoustic-kit', gain: -5 } ],
        chord:  [ { voice: 'piano', oct: 3, gain: -7, voicing: 'rootless' },
                  { voice: 'trombone', oct: 3, gain: -16, voicing: 'triad', when: 'accent' } ],
      },
      drive: {  /* 16分＝速いフレーズ。サックスとピアノで */
        melody: [ { voice: 'saxophone', oct: 4, gain: -9 },
                  { voice: 'piano', oct: 4, gain: -16, when: 'accent' } ],
        bass:   [ { voice: 'contrabass', oct: 2, gain: -4 },
                  { voice: 'sub', oct: 2, gain: -16 } ],
        rhythm: [ { voice: 'drums', kit: 'acoustic-kit', gain: -6 } ],
        chord:  [ { voice: 'piano', oct: 3, gain: -10, voicing: 'full' },
                  { voice: 'piano', oct: 4, gain: -18, voicing: 'rootless', when: 'accent' } ],
      },
      color: {  /* サックスとトロンボーンの低い色 */
        melody: [ { voice: 'saxophone', oct: 4, gain: -8 },
                  { voice: 'trombone', oct: 3, gain: -15, when: 'accent' } ],
        bass:   [ { voice: 'contrabass', oct: 2, gain: -4 },
                  { voice: 'sub', oct: 2, gain: -16 } ],
        rhythm: [ { voice: 'drums', kit: 'acoustic-kit', gain: -6 } ],
        /* 両手のヴォイシング：左手を低く、右手を1オクターブ上に */
        chord:  [ { voice: 'piano', oct: 3, gain: -6, voicing: 'rootless' },
                  { voice: 'piano', oct: 4, gain: -17, voicing: 'rootless', when: 'accent' } ],
      },
    },
  },

  /* ───────────── 久石譲 ─────────────
     編成の根拠：大編成ではなく小さめのオーケストラを使い、楽器と音色を
     場面ごとに丁寧に描き分ける。『風の谷のナウシカ』などでは
     ミニマル・ミュージックの手法（動きを最小限にした反復）が使われている。
     ここでは弦・ピアノ・ハープ・木管・ホルンで組み、
     「刻み」の札だけをミニマルな反復（シロフォン＝グロッケン役）に当てた。 */
  hisaishi: {
    label: '久石譲', sub: 'JOE HISAISHI', key: '9',
    desc: '映画音楽のオーケストラ',
    detail: 'ハ長調・76BPM・♭IIImaj7 と借用のⅣm・広い残響',
    prog: [
      { name: 'Cadd9',  root:  0, vc: [ 0,  4,  7, 11, 14], lad: [0, 2, 4,  7,  9, 12, 14, 16, 19] },
      { name: 'Fmaj9',  root:  5, vc: [ 5,  9, 12, 16, 19], lad: [0, 2, 5,  7,  9, 12, 14, 17, 19] },
      { name: 'E♭maj9', root:  3, vc: [ 3,  7, 10, 14, 17], lad: [3, 5, 7, 10, 12, 15, 17, 19, 22] },
      { name: 'Fm9',    root:  5, vc: [ 5,  8, 12, 15, 19], lad: [3, 5, 8, 10, 12, 15, 17, 20, 22] },
    ],
    bpm: 76, swing: 0, swingSub: '8n', harmony: null,
    kit: 'acoustic-kit',
    /* ハイハットは映画音楽に居場所がない。消す。
       スネアとクラップはティンパニ（タム）に読み替える              */
    drumMap: { h: null, c: 't1', s: 't2' },
    voicingMap: {},
    sendScale: 1.60, delayScale: 0.80, panScale: 1.15,
    air: 4.5, mud: -2.0, drumGain: -4, energyScale: 0.95,
    voices: {
      core: {   /* ピアノの主題にフルートが寄り添う */
        melody: [ { voice: 'piano', oct: 4, gain: -4 },
                  { voice: 'flute', oct: 5, gain: -14, when: 'accent' } ],
        bass:   [ { voice: 'contrabass', oct: 2, gain: -5 },
                  { voice: 'cello', oct: 3, gain: -9 } ],
        rhythm: [ { voice: 'drums', kit: 'acoustic-kit', gain: -9 } ],
        chord:  [ { voice: 'harp', oct: 3, gain: -5, voicing: 'open' },
                  { voice: 'french-horn', oct: 3, gain: -15, voicing: 'triad', when: 'accent' } ],
      },
      sing: {   /* 弦が歌う */
        melody: [ { voice: 'violin', oct: 4, gain: -5 },
                  { voice: 'flute', oct: 5, gain: -13, when: 'accent' } ],
        bass:   [ { voice: 'cello', oct: 3, gain: -5 },
                  { voice: 'contrabass', oct: 2, gain: -9 } ],
        rhythm: [ { voice: 'drums', kit: 'acoustic-kit', gain: -8 } ],
        chord:  [ { voice: 'violin', oct: 4, gain: -9, voicing: 'full' },
                  { voice: 'french-horn', oct: 3, gain: -14, voicing: 'triad', when: 'accent' } ],
      },
      push: {   /* 金管が前に出る場面 */
        melody: [ { voice: 'french-horn', oct: 3, gain: -6 },
                  { voice: 'trumpet', oct: 4, gain: -14, when: 'accent' } ],
        bass:   [ { voice: 'contrabass', oct: 2, gain: -4 },
                  { voice: 'cello', oct: 3, gain: -8 } ],
        rhythm: [ { voice: 'drums', kit: 'acoustic-kit', gain: -5 } ],
        chord:  [ { voice: 'french-horn', oct: 3, gain: -8, voicing: 'open' },
                  { voice: 'violin', oct: 4, gain: -15, voicing: 'triad', when: 'accent' } ],
      },
      drive: {  /* ミニマル：グロッケン（シロフォン）とピアノの反復 */
        melody: [ { voice: 'xylophone', oct: 5, gain: -10 },
                  { voice: 'piano', oct: 4, gain: -14, when: 'accent' } ],
        bass:   [ { voice: 'contrabass', oct: 2, gain: -5 },
                  { voice: 'cello', oct: 3, gain: -10 } ],
        rhythm: [ { voice: 'drums', kit: 'acoustic-kit', gain: -8 } ],
        chord:  [ { voice: 'harp', oct: 3, gain: -7, voicing: 'open' },
                  { voice: 'xylophone', oct: 5, gain: -18, voicing: 'full', when: 'accent' } ],
      },
      color: {  /* 木管の合いの手 */
        melody: [ { voice: 'clarinet', oct: 4, gain: -7 },
                  { voice: 'flute', oct: 5, gain: -15, when: 'accent' } ],
        bass:   [ { voice: 'contrabass', oct: 2, gain: -5 },
                  { voice: 'sub', oct: 2, gain: -18 } ],
        rhythm: [ { voice: 'drums', kit: 'acoustic-kit', gain: -9 } ],
        chord:  [ { voice: 'harp', oct: 3, gain: -6, voicing: 'full' },
                  { voice: 'clarinet', oct: 4, gain: -17, voicing: 'triad', when: 'accent' } ],
      },
    },
  },
};
/* スタイルカードとして出せる4枚（base は札を持たない＝初期状態） */
const WORLD_ORDER = ['beatles', 'kaze', 'modal', 'hisaishi'];

/* ---------------------------------------------------------------------
   いま有効な世界。key が null なら base（標準）。
   engine.js と app.js はここだけを見る。                              */
const World = {
  key: null,
  def: WORLDS.base,

  set(key) {
    this.key = (key && WORLDS[key] && key !== 'base') ? key : null;
    this.def = this.key ? WORLDS[this.key] : WORLDS.base;
  },
  label() { return this.def.label; },

  /* その札（キャラクター × 役割）を、いまの世界では何で鳴らすか */
  layersFor(charKey, roleKey) {
    const v = this.def.voices[charKey];
    return (v && v[roleKey]) ? v[roleKey] : WORLDS.base.voices[charKey][roleKey];
  },
  kit(k) { return this.def.kit || k; },
  voicingKind(k) {
    const m = this.def.voicingMap || {};
    return (k in m) ? m[k] : k;
  },
  drum(p) {
    const m = this.def.drumMap || {};
    return (p in m) ? m[p] : p;
  },
  harmony() { return this.def.harmony || null; },
  num(field, dflt) { return this.def[field] == null ? dflt : this.def[field]; },
  sendScale()  { return this.num('sendScale', 1); },
  delayScale() { return this.num('delayScale', 1); },
  panScale()   { return this.num('panScale', 1); },
  drumGain()   { return this.num('drumGain', 0); },
  energyScale(){ return this.num('energyScale', 1); },
};
