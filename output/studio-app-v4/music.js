/* =====================================================================
   music.js — STUDIO PULSE の「音楽そのもの」の定義
   ---------------------------------------------------------------------
   v1（ジャンル版）からの根本的な方針転換：

     旧： カード = ジャンル × 楽器      （ジャズのピアノ／ロックのドラム…）
     新： カード = ROLE  × INSTRUMENT   （メロディのピアノ／リズムの木琴…）

   ジャンルという「音楽の外側のラベル」を捨て、
   「曲の中で何をする音か（ROLE）」と「何の音か（INSTRUMENT）」だけで
   カードを作る。ジャンルが消えた代わりに、全パートが共有する土台として

     ・ひとつの調（Cマイナー ＝ E♭メジャー）
     ・4小節でひと回りするコード進行（全パートがこれに従う）
     ・ひとつのグルーヴ（BPM・スウィング・ENERGY）

   を engine 側が握る。だから何と何を重ねても必ず調和し、
   しかも進行が動くぶん、v1 の「1コードでひたすら回る」より曲に聞こえる。
   ---------------------------------------------------------------------
   このファイルは「データと音楽の理屈」だけを持つ。
   音を鳴らす仕組み（Tone.js）は app.js 側にある。
   ===================================================================== */

/* ============ 1. 音の名前 ============ */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/* 半音の通し番号 → 'D#4' のような音名。オクターブ4のCが60（MIDIと同じ） */
function midiToName(m) {
  const i = ((m % 12) + 12) % 12;
  return NOTE_NAMES[i] + (Math.floor(m / 12) - 1);
}
/* オクターブ番号と「Cからの半音数」から通し番号を作る */
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

/* -6..+5 に畳み込む。これをやると、コードが変わっても各パートの音域が
   跳ね回らない（＝ボイスリーディングが自然になる）。
   例：A♭(8半音上) は「4半音下」として扱われる。                    */
function fold(semi) { return ((semi + 6) % 12 + 12) % 12 - 6; }

function makeChord(rootPc, quality, name) {
  const q = QUALITY[quality];
  /* 上もの用：畳み込んで低い順に並べた4音（0番＝いちばん低い構成音） */
  const voiced = [...new Set(q.tones.map(t => fold(rootPc + t)))].sort((a, b) => a - b);
  /* 低音用：ルートを中心近くに置く（A♭ は上ではなく下へ行く） */
  const bassPc = fold(rootPc);
  return {
    name, rootPc, quality, voiced, bassPc,
    third: q.third, seventh: q.seventh,
    label: NOTE_NAMES[rootPc] + q.label,
  };
}

/* ---- コード進行：4小節でひと回り ----------------------------------
   4つとも同じ調（Cマイナー＝E♭メジャー）の中にあるので、
   演奏中に切り替えても濁らない。ジャンルではなく「情景」で選ぶ。   */
const PROGRESSIONS = {
  night: {
    label: '夜', desc: '沈む・浮遊・切ない',
    bars: [
      makeChord(0, 'min7'), makeChord(8, 'maj7'),
      makeChord(3, 'maj7'), makeChord(10, 'maj'),
    ],
  },
  sunrise: {
    label: '陽', desc: '開ける・前へ・王道',
    bars: [
      makeChord(3, 'maj'), makeChord(10, 'maj'),
      makeChord(0, 'min7'), makeChord(8, 'maj'),
    ],
  },
  spell: {
    label: '呪', desc: '重い・執拗・トランス',
    bars: [
      makeChord(0, 'min7'), makeChord(0, 'min7'),
      makeChord(5, 'min7'), makeChord(5, 'min7'),
    ],
  },
  city: {
    label: '都', desc: '洒落た・都会・動く',
    bars: [
      makeChord(5, 'min7'), makeChord(10, 'dom7'),
      makeChord(3, 'maj7'), makeChord(8, 'maj7'),
    ],
  },
};
const PROG_ORDER = ['night', 'sunrise', 'spell', 'city'];

/* ============ 3. パターンから実際の音を求める ============ */

/* 上もの（メロディ・コード・木琴）：voiced の何番目か。
   4を超えたら1オクターブ上へ回る。                                   */
function toneName(chord, idx, oct) {
  const n = chord.voiced.length;
  const k = ((idx % n) + n) % n;
  const up = Math.floor(idx / n);
  return midiToName(midiOf(oct, chord.voiced[k] + 12 * up));
}

/* スケール音（経過音・装飾に使う） */
function scaleName(chord, deg, oct) {
  return midiToName(midiOf(oct, scaleSemi(deg)));
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

/* ============ 4. ROLE（4分類） ============
   reference/音楽カードのサウンド設計1.txt の4分類をそのまま採用する。 */
const ROLES = {
  melody: {
    label: 'MELODY', jp: 'メロディ', role: '曲の「顔」',
    desc: '主旋律。曲の印象をいちばん動かす',
    keys: ['1', '2', '3', '4', '5', '6', '7', '8'], max: 2,
  },
  chord: {
    label: 'CHORD', jp: 'コード', role: '曲の「空間」',
    desc: '和音。厚みと明暗をつくる',
    keys: ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i'], max: 2,
  },
  bass: {
    label: 'BASS', jp: 'ベース', role: '曲の「足元」',
    desc: '低音。安定とグルーヴを支える',
    keys: ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k'], max: 1,   // 足元はひとつ。増やすと濁る
  },
  rhythm: {
    label: 'RHYTHM', jp: 'リズム', role: '曲の「動き」',
    desc: '拍。身体を動かしたくさせる',
    keys: ['z', 'x', 'c', 'v', 'b', 'n', 'm', ','], max: 2,
  },
};
const ROLE_ORDER = ['melody', 'chord', 'bass', 'rhythm'];

/* ============ 5. カード（ROLE × INSTRUMENT）=== 24枚 ============
   pat の書式（1小節＝16ステップ）
     s : ステップ（0..15）
     d : 音の指定。数値＝構成音の番号／配列＝和音／{sd:n}＝スケール音
     v : 強さ  l : 長さ  o : オクターブずらし  e : この ENERGY 以上で鳴る
   ドラムは drum: { k:キック s:スネア h:ハイハット t:タム } のステップ配列。
   ---------------------------------------------------------------------
   sound の書式
     kind : 'sampler'（実録音）/ 'synth'（合成音）/ 'kit'（実録音ドラム）
     set  : samples/ 以下のフォルダ名   fb: 実録音が無いときの合成音の種類
     oct  : 基準オクターブ（帯域の住み分け）
     hp/lp: 帯域フィルタ   gain: 音量(dB)   rev/dly: 残響・ディレイ送り量
     duck : キックで音量をへこませる（サイドチェイン）対象にするか       */
const CARDS = {
  /* ---------------- MELODY ＝ 曲の顔 ---------------- */
  'melody-piano': {
    label: 'ピアノ', tag: '粒だつ・輪郭が立つ',
    sound: { kind: 'sampler', set: 'piano', fb: 'poly', oct: 4, hp: 180, lp: 12000,
             gain: -10, rev: .16, dly: .10, duck: true, env: { attack: 0, release: 1.2 } },
    pat: [
      { s: 0, d: 2, v: .85, l: '8n' }, { s: 3, d: 3, v: .50, l: '16n' },
      { s: 4, d: 1, v: .70, l: '8n' }, { s: 7, d: 4, v: .55, l: '16n', e: 2 },
      { s: 8, d: 3, v: .82, l: '8n' }, { s: 11, d: 2, v: .55, l: '16n' },
      { s: 12, d: 5, v: .75, l: '4n' }, { s: 15, d: 4, v: .48, l: '16n', e: 3 },
    ],
  },
  'melody-eguitar': {
    label: 'エレキギター', tag: '前に出る・叫ぶ',
    sound: { kind: 'sampler', set: 'guitar-electric', fb: 'pluck', oct: 4, hp: 150, lp: 7000,
             gain: -9, rev: .12, dly: .14, drive: .28, duck: true, env: { attack: .002, release: .5 } },
    pat: [
      { s: 0, d: 0, v: .90, l: '8n' }, { s: 2, d: 0, v: .50, l: '16n' },
      { s: 3, d: 2, v: .72, l: '8n' }, { s: 6, d: 3, v: .75, l: '8n' },
      { s: 8, d: 2, v: .85, l: '8n' }, { s: 10, d: 4, v: .58, l: '16n', e: 2 },
      { s: 11, d: 3, v: .70, l: '8n' }, { s: 14, d: 1, v: .65, l: '8n' },
    ],
  },
  'melody-sax': {
    label: 'サックス', tag: '息づかい・後ノリ',
    sound: { kind: 'sampler', set: 'saxophone', fb: 'brass', oct: 4, hp: 200, lp: 8500,
             gain: -14, rev: .22, dly: .12, duck: true, env: { attack: .02, release: .5 } },
    pat: [
      { s: 2, d: 3, v: .68, l: '4n' }, { s: 6, d: 4, v: .58, l: '8n' },
      { s: 7, d: 5, v: .62, l: '8n' }, { s: 10, d: 3, v: .70, l: '4n' },
      { s: 14, d: 2, v: .55, l: '8n', e: 2 },
    ],
  },
  'melody-violin': {
    label: 'ヴァイオリン', tag: '伸びる・のぼる',
    sound: { kind: 'sampler', set: 'violin', fb: 'bow', oct: 4, hp: 240, lp: 9000,
             gain: -15, rev: .28, dly: .06, duck: true, env: { attack: .06, release: .8 } },
    pat: [
      { s: 0, d: 4, v: .58, l: '2n' }, { s: 8, d: 5, v: .62, l: '4n' },
      { s: 12, d: 3, v: .52, l: '4n' },
    ],
  },
  'melody-flute': {
    label: 'フルート', tag: '軽い・舞う',
    sound: { kind: 'sampler', set: 'flute', fb: 'bell', oct: 5, hp: 400, lp: 11000,
             gain: -16, rev: .26, dly: .18, duck: true, env: { attack: .03, release: .5 } },
    pat: [
      { s: 4, d: 3, v: .50, l: '16n' }, { s: 5, d: 4, v: .45, l: '16n' },
      { s: 6, d: 5, v: .52, l: '16n' }, { s: 7, d: 6, v: .60, l: '8n' },
      { s: 12, d: 5, v: .55, l: '8n' }, { s: 14, d: 4, v: .45, l: '16n', e: 2 },
    ],
  },
  'melody-lead': {
    label: 'シンセリード', tag: '刻む・突き刺す',
    sound: { kind: 'synth', fb: 'lead', oct: 5, hp: 420, lp: 9000,
             gain: -17, rev: .10, dly: .22, duck: true },
    pat: [
      { s: 0, d: 0, v: .80, l: '16n' }, { s: 1, d: 0, v: .35, l: '16n', e: 2 },
      { s: 2, d: 2, v: .55, l: '16n' }, { s: 4, d: 1, v: .70, l: '16n' },
      { s: 6, d: 3, v: .45, l: '16n', e: 2 }, { s: 7, d: 4, v: .55, l: '16n' },
      { s: 8, d: 2, v: .78, l: '16n' }, { s: 9, d: 2, v: .35, l: '16n', e: 3 },
      { s: 10, d: 5, v: .55, l: '16n' }, { s: 12, d: 4, v: .70, l: '16n' },
      { s: 13, d: 3, v: .45, l: '16n', e: 3 }, { s: 14, d: 6, v: .58, l: '16n' },
    ],
  },

  'melody-trumpet': {
    label: 'トランペット', tag: '高らか・宣言する',
    sound: { kind: 'sampler', set: 'trumpet', fb: 'brass', oct: 4, hp: 220, lp: 9000,
             gain: -17, rev: .20, dly: .10, duck: true, env: { attack: .012, release: .35 } },
    pat: [
      { s: 0, d: 4, v: .75, l: '8n' }, { s: 4, d: 5, v: .62, l: '8n' },
      { s: 6, d: 4, v: .50, l: '16n', e: 2 }, { s: 8, d: 6, v: .78, l: '4n' },
      { s: 13, d: 5, v: .58, l: '8n' },
    ],
  },
  'melody-celloline': {
    label: 'チェロ（旋律）', tag: '低く歌う・厚い',
    sound: { kind: 'sampler', set: 'cello', fb: 'bow', oct: 3, hp: 90, lp: 5000,
             gain: -13, rev: .24, dly: .04, duck: true, env: { attack: .07, release: 1.0 } },
    pat: [
      { s: 0, d: 1, v: .60, l: '4n' }, { s: 4, d: 2, v: .52, l: '4n' },
      { s: 8, d: 4, v: .64, l: '2n' }, { s: 14, d: 3, v: .48, l: '8n', e: 2 },
    ],
  },

  /* ---------------- CHORD ＝ 曲の空間 ---------------- */
  'chord-piano': {
    label: 'ピアノ', tag: '裏で刻む・軽い和音',
    sound: { kind: 'sampler', set: 'piano', fb: 'poly', oct: 3, hp: 160, lp: 8000,
             gain: -14, rev: .18, dly: .04, duck: true, env: { attack: 0, release: .9 } },
    pat: [
      { s: 2, d: [0, 1, 2], v: .50, l: '8n' }, { s: 6, d: [1, 2, 3], v: .44, l: '8n' },
      { s: 10, d: [0, 1, 2], v: .50, l: '8n' }, { s: 13, d: [1, 2, 3], v: .40, l: '16n', e: 2 },
      { s: 14, d: [2, 3, 4], v: .52, l: '8n' },
    ],
  },
  'chord-aguitar': {
    label: 'アコギ', tag: 'かき鳴らす・体温',
    sound: { kind: 'sampler', set: 'guitar-acoustic', fb: 'pluck', oct: 3, hp: 140, lp: 7500,
             gain: -13, rev: .16, dly: .05, duck: true, env: { attack: .002, release: .6 } },
    pat: [
      { s: 0, d: [0, 1, 2], v: .60, l: '8n' }, { s: 3, d: [1, 2, 3], v: .32, l: '16n' },
      { s: 4, d: [0, 1, 2], v: .48, l: '8n' }, { s: 6, d: [1, 2, 3], v: .30, l: '16n', e: 2 },
      { s: 8, d: [0, 1, 2], v: .58, l: '8n' }, { s: 11, d: [1, 2, 3], v: .32, l: '16n' },
      { s: 12, d: [0, 1, 2], v: .48, l: '8n' }, { s: 14, d: [2, 3, 4], v: .36, l: '16n', e: 2 },
    ],
  },
  'chord-organ': {
    label: 'オルガン', tag: '面で支える・持続',
    sound: { kind: 'sampler', set: 'organ', fb: 'pad', oct: 3, hp: 170, lp: 6000,
             gain: -19, rev: .20, dly: 0, duck: true, env: { attack: .04, release: .5 } },
    pat: [
      { s: 0, d: [0, 1, 2, 3], v: .38, l: '2n' }, { s: 8, d: [0, 1, 2, 3], v: .34, l: '2n' },
    ],
  },
  'chord-harp': {
    label: 'ハープ', tag: '滴る・分散和音',
    sound: { kind: 'sampler', set: 'harp', fb: 'bell', oct: 3, hp: 220, lp: 10000,
             gain: -13, rev: .26, dly: .12, duck: true, env: { attack: 0, release: 1.4 } },
    pat: [
      { s: 0, d: 0, v: .55, l: '8n' }, { s: 2, d: 1, v: .40, l: '8n' },
      { s: 4, d: 2, v: .48, l: '8n' }, { s: 6, d: 3, v: .38, l: '8n' },
      { s: 8, d: 4, v: .52, l: '8n' }, { s: 10, d: 5, v: .38, l: '8n' },
      { s: 12, d: 6, v: .48, l: '8n' }, { s: 14, d: 5, v: .36, l: '8n', e: 2 },
    ],
  },
  'chord-strings': {
    label: 'ストリングス', tag: '包む・ふくらむ',
    sound: { kind: 'sampler', set: 'violin', fb: 'bow', oct: 4, hp: 260, lp: 7000,
             gain: -20, rev: .34, dly: 0, duck: true, env: { attack: .25, release: 1.6 } },
    pat: [
      { s: 0, d: [2, 3, 4], v: .40, l: '1n' },
    ],
  },
  'chord-pad': {
    label: 'シンセパッド', tag: '奥行き・にじむ',
    sound: { kind: 'synth', fb: 'pad', oct: 3, hp: 200, lp: 4200,
             gain: -20, rev: .34, dly: .08, duck: true },
    pat: [
      { s: 0, d: [0, 2, 4], v: .42, l: '1n' },
    ],
  },

  'chord-cutting': {
    label: 'カッティング', tag: '16分で切る・跳ねる',
    sound: { kind: 'sampler', set: 'guitar-electric', fb: 'pluck', oct: 3, hp: 320, lp: 6500,
             gain: -14, rev: .10, dly: .08, drive: .12, duck: true, env: { attack: .002, release: .12 } },
    pat: [
      { s: 1, d: [1, 2, 3], v: .48, l: '16n' }, { s: 3, d: [1, 2, 3], v: .34, l: '16n' },
      { s: 5, d: [2, 3, 4], v: .50, l: '16n' }, { s: 6, d: [1, 2, 3], v: .30, l: '16n', e: 2 },
      { s: 9, d: [1, 2, 3], v: .48, l: '16n' }, { s: 11, d: [2, 3, 4], v: .36, l: '16n' },
      { s: 13, d: [1, 2, 3], v: .50, l: '16n' }, { s: 15, d: [2, 3, 4], v: .34, l: '16n', e: 2 },
    ],
  },
  'chord-brass': {
    label: 'ブラス', tag: '一撃・合いの手',
    sound: { kind: 'sampler', set: 'trumpet', fb: 'brass', oct: 4, hp: 220, lp: 8000,
             gain: -19, rev: .18, dly: .06, duck: true, env: { attack: .012, release: .30 } },
    pat: [
      { s: 4, d: [2, 3, 4], v: .62, l: '8n' }, { s: 10, d: [3, 4, 5], v: .55, l: '16n' },
      { s: 12, d: [2, 3, 4], v: .58, l: '8n', e: 2 },
    ],
  },

  /* ---------------- BASS ＝ 曲の足元 ---------------- */
  'bass-ebass': {
    label: 'エレキベース', tag: 'キックに張りつく',
    sound: { kind: 'sampler', set: 'bass-electric', fb: 'mono', oct: 2, hp: 32, lp: 1600,
             gain: -5, rev: .03, dly: 0, duck: true, env: { attack: .002, release: .25 } },
    pat: [
      { s: 0, d: 0, v: .95, l: '8n' }, { s: 3, d: 0, v: .48, l: '16n' },
      { s: 6, d: 2, v: .60, l: '8n' }, { s: 8, d: 0, v: .90, l: '8n' },
      { s: 10, d: 0, v: .48, l: '16n', e: 2 }, { s: 11, d: 1, v: .62, l: '8n' },
      { s: 14, d: 3, v: .66, l: '8n' },
    ],
  },
  'bass-upright': {
    label: 'ウッドベース', tag: '歩く・呼吸する',
    sound: { kind: 'sampler', set: 'contrabass', fb: 'mono', oct: 2, hp: 30, lp: 1200,
             gain: -6, rev: .06, dly: 0, duck: true, env: { attack: .01, release: .35 } },
    pat: [
      { s: 0, d: 0, v: .82, l: '4n' }, { s: 4, d: 3, v: .62, l: '4n' },
      { s: 8, d: 1, v: .74, l: '4n' }, { s: 12, d: 5, v: .62, l: '4n' },
      { s: 14, d: 4, v: .40, l: '16n', e: 3 },
    ],
  },
  'bass-cello': {
    label: 'チェロ', tag: '伸ばす・沈む',
    sound: { kind: 'sampler', set: 'cello', fb: 'bow', oct: 2, hp: 40, lp: 2600,
             gain: -12, rev: .18, dly: 0, duck: true, env: { attack: .08, release: .9 } },
    pat: [
      { s: 0, d: 0, v: .62, l: '2n' }, { s: 8, d: 1, v: .55, l: '2n' },
    ],
  },
  'bass-synth': {
    label: 'シンセベース', tag: '弾む・跳ねる',
    sound: { kind: 'synth', fb: 'mono', oct: 2, hp: 34, lp: 1800,
             gain: -9, rev: .02, dly: 0, duck: true },
    pat: [
      { s: 0, d: 0, v: .92, l: '16n' }, { s: 2, d: 0, v: .52, l: '16n' },
      { s: 3, d: 2, v: .60, l: '16n' }, { s: 6, d: 0, v: .55, l: '16n', e: 2 },
      { s: 8, d: 0, v: .88, l: '16n' }, { s: 10, d: 4, v: .58, l: '16n' },
      { s: 11, d: 1, v: .62, l: '16n' }, { s: 14, d: 0, v: .60, l: '16n' },
      { s: 15, d: 2, v: .44, l: '16n', e: 3 },
    ],
  },
  'bass-sub': {
    label: 'サブベース', tag: '床が鳴る・重い',
    sound: { kind: 'synth', fb: 'sub', oct: 2, hp: 24, lp: 260,
             gain: -6, rev: 0, dly: 0, duck: true },
    pat: [
      { s: 0, d: 0, v: .95, l: '2n' }, { s: 10, d: 0, v: .70, l: '8n' },
      { s: 14, d: 1, v: .60, l: '8n', e: 2 },
    ],
  },
  'bass-pianolow': {
    label: 'ピアノ（低音）', tag: '打楽器のような低音',
    sound: { kind: 'sampler', set: 'piano', fb: 'poly', oct: 2, hp: 40, lp: 2200,
             gain: -10, rev: .08, dly: 0, duck: true, env: { attack: 0, release: .7 } },
    pat: [
      { s: 0, d: [0, 2], v: .72, l: '8n' }, { s: 6, d: [0, 2], v: .50, l: '8n' },
      { s: 8, d: [0, 2], v: .66, l: '8n' }, { s: 12, d: [1, 2], v: .55, l: '8n' },
      { s: 15, d: [0, 2], v: .42, l: '16n', e: 3 },
    ],
  },

  'bass-organ': {
    label: 'オルガンベース', tag: '途切れない・地鳴り',
    sound: { kind: 'sampler', set: 'organ', fb: 'pad', oct: 2, hp: 30, lp: 900,
             gain: -13, rev: .05, dly: 0, duck: true, env: { attack: .03, release: .4 } },
    pat: [
      { s: 0, d: 0, v: .70, l: '2n' }, { s: 8, d: 0, v: .60, l: '4n' },
      { s: 12, d: 1, v: .58, l: '4n' },
    ],
  },
  'bass-fuzz': {
    label: 'ファズベース', tag: '歪む・押し出す',
    sound: { kind: 'synth', fb: 'fuzz', oct: 2, hp: 40, lp: 2400,
             gain: -13, rev: .04, dly: 0, drive: .55, duck: true },
    pat: [
      { s: 0, d: 0, v: .90, l: '8n' }, { s: 2, d: 0, v: .55, l: '16n' },
      { s: 4, d: 0, v: .62, l: '8n' }, { s: 6, d: 3, v: .70, l: '8n' },
      { s: 8, d: 0, v: .88, l: '8n' }, { s: 10, d: 0, v: .55, l: '16n', e: 2 },
      { s: 12, d: 0, v: .62, l: '8n' }, { s: 14, d: 4, v: .70, l: '8n' },
    ],
  },

  /* ---------------- RHYTHM ＝ 曲の動き ---------------- */
  'rhythm-kit': {
    label: '生ドラム', tag: '王道・8ビート',
    sound: { kind: 'kit', set: 'acoustic-kit', gain: -7, hp: 28, lp: 16000, rev: .07 },
    drum: { k: [0, 7, 10], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], hv: .30,
            h3: [1, 3, 5, 7, 9, 11, 13, 15], ghost: [6, 14], hasKick: true },
  },
  'rhythm-break': {
    label: 'ブレイクビーツ', tag: '転がる・つんのめる',
    sound: { kind: 'kit', set: 'breakbeat13', gain: -7, hp: 40, lp: 15000, rev: .10 },
    drum: { k: [0, 2, 9], s: [4, 11, 12], h: [0, 3, 6, 8, 10, 14], hv: .34,
            h3: [1, 5, 7, 13, 15], ghost: [7, 15], t: [13], hasKick: true },
  },
  'rhythm-four': {
    label: '四つ打ち', tag: '止まらない・前へ',
    sound: { kind: 'kit', set: 'Techno', gain: -8, hp: 30, lp: 16000, rev: .06 },
    drum: { k: [0, 4, 8, 12], s: [4, 12], h: [2, 6, 10, 14], hv: .38,
            h3: [1, 3, 5, 7, 9, 11, 13, 15], hasKick: true },
  },
  'rhythm-machine': {
    label: 'ドラムマシン', tag: '機械的・細かい',
    sound: { kind: 'kit', set: 'CR78', gain: -9, hp: 34, lp: 16000, rev: .05 },
    drum: { k: [0, 6, 11], s: [4, 12], h: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], hv: .18,
            ghost: [10], hasKick: true },
  },
  'rhythm-linn': {
    label: '80sマシン', tag: '硬い・広い・レトロ',
    sound: { kind: 'kit', set: 'LINN', gain: -9, hp: 32, lp: 16000, rev: .22 },
    drum: { k: [0, 3, 8], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], hv: .22,
            t: [14], hasKick: true },
  },
  'rhythm-hats': {
    label: 'シェイカー', tag: '裏を刻む・前へ押す',
    /* キックもスネアも持たない。どのリズムの上にも安全に重ねられる薄い層 */
    sound: { kind: 'kit', set: 'acoustic-kit', gain: -13, hp: 400, lp: 16000, rev: .10 },
    drum: { k: [], s: [], h: [1, 3, 5, 7, 9, 11, 13, 15], hv: .30,
            h3: [0, 2, 4, 6, 8, 10, 12, 14], hasKick: false },
  },
  'rhythm-perc': {
    label: 'パーカッション', tag: '隙間を埋める・踊る',
    sound: { kind: 'kit', set: 'Kit3', gain: -11, hp: 120, lp: 16000, rev: .14 },
    /* キックを持たない＝他のリズムカードと重ねても土台が濁らない */
    drum: { k: [], s: [], h: [2, 5, 8, 11, 14], hv: .26, t: [0, 3, 6, 9, 12],
            h3: [1, 4, 7, 10, 13], hasKick: false },
  },
  'rhythm-xylo': {
    label: '木琴', tag: '音程のあるリズム・跳ねる',
    sound: { kind: 'sampler', set: 'xylophone', fb: 'bell', oct: 5, hp: 500, lp: 12000,
             gain: -15, rev: .16, dly: .16, duck: true, env: { attack: 0, release: .4 } },
    pat: [
      { s: 0, d: 0, v: .62, l: '16n' }, { s: 3, d: 2, v: .48, l: '16n' },
      { s: 4, d: 1, v: .52, l: '16n' }, { s: 6, d: 3, v: .44, l: '16n', e: 2 },
      { s: 8, d: 2, v: .60, l: '16n' }, { s: 11, d: 4, v: .46, l: '16n' },
      { s: 12, d: 1, v: .52, l: '16n' }, { s: 14, d: 5, v: .44, l: '16n', e: 2 },
    ],
  },
};

/* ROLE ごとのカード並び（＝画面の列順・キー順）。8枚 × 4役割 ＝ 32枚 */
const CARD_ORDER = {
  melody: ['melody-piano', 'melody-eguitar', 'melody-sax', 'melody-violin',
           'melody-flute', 'melody-trumpet', 'melody-celloline', 'melody-lead'],
  chord:  ['chord-piano', 'chord-aguitar', 'chord-cutting', 'chord-organ',
           'chord-harp', 'chord-strings', 'chord-brass', 'chord-pad'],
  bass:   ['bass-ebass', 'bass-upright', 'bass-cello', 'bass-organ',
           'bass-pianolow', 'bass-synth', 'bass-fuzz', 'bass-sub'],
  rhythm: ['rhythm-kit', 'rhythm-break', 'rhythm-four', 'rhythm-machine',
           'rhythm-linn', 'rhythm-hats', 'rhythm-perc', 'rhythm-xylo'],
};

/* ============ 6. ひとつの音の高さを決める ============
   同じパターンでも ROLE によって音の求め方が変わる：
     bass  → ルート中心（bassName）
     それ以外 → コード構成音（toneName）                            */
function resolveNotes(role, chord, ev, oct, lift) {
  const list = Array.isArray(ev.d) ? ev.d : [ev.d];
  return list.map(d => {
    if (d && typeof d === 'object' && 'sd' in d) return scaleName(chord, d.sd + lift, oct + (ev.o || 0));
    if (role === 'bass') return bassName(chord, d, oct + (ev.o || 0));
    return toneName(chord, d + lift, oct + (ev.o || 0));
  });
}
