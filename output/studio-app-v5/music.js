/* =====================================================================
   music.js — STUDIO PULSE II（v5）の「音楽そのもの」の定義
   ---------------------------------------------------------------------
   カード = ROLE（曲の中で何をするか）× INSTRUMENT（何の音でするか）。
   全パートが共有する土台（ひとつの調・4小節の進行・ひとつのグルーヴ）は
   engine 側が握るので、何と何を重ねても必ず調和する。
   ---------------------------------------------------------------------
   v4 からの変更点（「気持ちよくセッションできるか」を軸に）

   1) カードを 32 → 40 枚に増やした（各 ROLE 10 枚）
      新しい楽器：ナイロンギター／クラリネット／トロンボーン／
                  ハルモニウム／フレンチホルン／チューバ／バスーン／
                  ロックキット(Stark)／ボンゴ(Bongos)／ライド

   2) ドラムの語彙を増やした
      v4 は kick / snare / hihat / tom1 の4つしか無かった。v5 では
        cr  クラッシュ   … 8小節の頭。ここで「開ける」
        oh  オープンハット … 裏拍が伸びて前へ押される
        rd  ライド        … 刻みが金物になり、音数を増やしても濁らない
        t2/t3 タム        … フィルが「下りていくタム回し」になる
      を足した。シンバル類は音源が存在しないので samples.js 側で合成している。

   3) 1小節ごとの繰り返しをやめた
      各カードは pat（ふだん）と patB（4小節目＝turnaround）を持てる。
      ドラムも同じく drum / drumB。「4小節でひと息つく」形になり、
      同じカードを入れっぱなしでも飽きにくい。

   4) RHYTHM の同時枚数を 2 → 3 に増やした
      キックを持たない「薄い層」を 2 → 4 枚に増やしたので、
      重ねても土台が濁らない。積み上げる快感はここから来る。

   5) gain(dB) の意味を変えた
      v4 の gain は「音楽的な存在感」と「音源の録音レベルの差」の両方を
      背負っていた。v5 では samples.js が音源のラウドネスを実測して
      そろえるので、ここの gain は純粋に「どのくらい前に出したいか」だけ。
      → ROLE ごとにほぼ同じ数値が並ぶ。ズレていたら意図的な差。
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

/* ============ 4. ROLE（4分類） ============ */
const ROLES = {
  melody: {
    label: 'MELODY', jp: 'メロディ', role: '曲の「顔」',
    desc: '主旋律。曲の印象をいちばん動かす',
    keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], max: 2,
  },
  chord: {
    label: 'CHORD', jp: 'コード', role: '曲の「空間」',
    desc: '和音。厚みと明暗をつくる',
    keys: ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'], max: 2,
  },
  bass: {
    label: 'BASS', jp: 'ベース', role: '曲の「足元」',
    desc: '低音。安定とグルーヴを支える',
    keys: ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'], max: 1,   // 足元はひとつ。増やすと濁る
  },
  rhythm: {
    label: 'RHYTHM', jp: 'リズム', role: '曲の「動き」',
    desc: '拍。身体を動かしたくさせる',
    keys: ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'], max: 3,   // 薄い層を重ねられるよう v5 で3枚に
  },
};
const ROLE_ORDER = ['melody', 'chord', 'bass', 'rhythm'];

/* ============ 5. カード（ROLE × INSTRUMENT）=== 40枚 ============
   pat / patB の書式（1小節＝16ステップ）
     s : ステップ（0..15）
     d : 音の指定。数値＝構成音の番号／配列＝和音／{sd:n}＝スケール音
     v : 強さ  l : 長さ  o : オクターブずらし  e : この ENERGY 以上で鳴る
     patB を書くと 4小節目（bar % 4 === 3）だけそちらが鳴る。
   ---------------------------------------------------------------------
   drum / drumB の書式（ステップ配列）
     k キック  s スネア  h ハイハット(hv=強さ)  h3 ENERGY3のときだけ足す裏
     ghost 小さいスネア（ENERGY2以上）
     t/t2/t3 タム（高→低）  oh オープンハット  rd ライド(rv=強さ)
     cr クラッシュ（bar % crEvery === crPhase の小節だけ。既定は 8 / 0）
     hasKick … このカードが土台（キック）を出せるか
   ---------------------------------------------------------------------
   sound の書式
     kind : 'sampler'（実録音）/ 'synth'（合成音）/ 'kit'（実録音ドラム）
     set  : samples/ 以下のフォルダ名   fb: 実録音が無いときの合成音の種類
     oct  : 基準オクターブ（帯域の住み分け）
     hp/lp: 帯域フィルタ
     gain : 音量(dB)。※音源の録音レベル差は samples.js が自動でそろえるので
            ここは「どのくらい前に出したいか」だけを意味する
     rev/dly: 残響・ディレイ送り量   duck: キックでへこませるか        */
const CARDS = {

  /* =================================================================
     MELODY ＝ 曲の「顔」    目安 gain −10dB
     ================================================================= */
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
    /* 4小節目は音数を落として上へ抜ける＝ひと息つく */
    patB: [
      { s: 0, d: 5, v: .78, l: '4n' }, { s: 6, d: 6, v: .62, l: '8n' },
      { s: 8, d: 7, v: .80, l: '2n' }, { s: 14, d: 4, v: .45, l: '16n', e: 2 },
    ],
  },
  'melody-eguitar': {
    label: 'エレキギター', tag: '前に出る・叫ぶ',
    sound: { kind: 'sampler', set: 'guitar-electric', fb: 'pluck', oct: 4, hp: 150, lp: 7000,
             gain: -10, rev: .12, dly: .14, drive: .28, duck: true, env: { attack: .002, release: .5 } },
    pat: [
      { s: 0, d: 0, v: .90, l: '8n' }, { s: 2, d: 0, v: .50, l: '16n' },
      { s: 3, d: 2, v: .72, l: '8n' }, { s: 6, d: 3, v: .75, l: '8n' },
      { s: 8, d: 2, v: .85, l: '8n' }, { s: 10, d: 4, v: .58, l: '16n', e: 2 },
      { s: 11, d: 3, v: .70, l: '8n' }, { s: 14, d: 1, v: .65, l: '8n' },
    ],
    /* 上へ登るが、d は 5 まで。音源が C5 までしか無いので、これ以上だと
       8小節目の lift と合わさって1オクターブ近く移調され、音が痩せる。 */
    patB: [
      { s: 0, d: 2, v: .88, l: '4n' }, { s: 4, d: 3, v: .70, l: '8n' },
      { s: 6, d: 4, v: .74, l: '8n' }, { s: 8, d: 5, v: .90, l: '2n' },
      { s: 15, d: 2, v: .50, l: '16n', e: 2 },
    ],
  },
  'melody-nylon': {
    label: 'ナイロンギター', tag: '爪弾く・角が丸い',
    sound: { kind: 'sampler', set: 'guitar-nylon', fb: 'pluck', oct: 4, hp: 160, lp: 6500,
             gain: -10, rev: .20, dly: .08, duck: true, env: { attack: .002, release: .8 } },
    pat: [
      { s: 0, d: 2, v: .72, l: '8n' }, { s: 2, d: 4, v: .48, l: '16n' },
      { s: 4, d: 3, v: .62, l: '8n' }, { s: 7, d: 5, v: .52, l: '16n', e: 2 },
      { s: 8, d: 4, v: .70, l: '8n' }, { s: 10, d: 2, v: .46, l: '16n' },
      { s: 12, d: 5, v: .64, l: '4n' },
    ],
    patB: [
      { s: 0, d: 6, v: .68, l: '8n' }, { s: 3, d: 5, v: .50, l: '16n' },
      { s: 4, d: 4, v: .60, l: '8n' }, { s: 8, d: 3, v: .66, l: '4n' },
      { s: 12, d: 2, v: .58, l: '4n' },
    ],
  },
  'melody-sax': {
    label: 'サックス', tag: '息づかい・後ノリ',
    sound: { kind: 'sampler', set: 'saxophone', fb: 'brass', oct: 4, hp: 200, lp: 8500,
             gain: -10, rev: .22, dly: .12, duck: true, env: { attack: .02, release: .5 } },
    pat: [
      { s: 2, d: 3, v: .68, l: '4n' }, { s: 6, d: 4, v: .58, l: '8n' },
      { s: 7, d: 5, v: .62, l: '8n' }, { s: 10, d: 3, v: .70, l: '4n' },
      { s: 14, d: 2, v: .55, l: '8n', e: 2 },
    ],
    patB: [
      { s: 0, d: 5, v: .64, l: '8n' }, { s: 2, d: 6, v: .58, l: '8n' },
      { s: 4, d: 7, v: .72, l: '2n' }, { s: 12, d: 4, v: .56, l: '4n' },
    ],
  },
  'melody-clarinet': {
    label: 'クラリネット', tag: '木の温度・語る',
    sound: { kind: 'sampler', set: 'clarinet', fb: 'brass', oct: 4, hp: 180, lp: 7000,
             gain: -10, rev: .22, dly: .08, duck: true, env: { attack: .03, release: .6 } },
    pat: [
      { s: 0, d: 1, v: .62, l: '8n' }, { s: 3, d: 2, v: .48, l: '16n' },
      { s: 4, d: 3, v: .66, l: '4n' }, { s: 8, d: 2, v: .58, l: '8n' },
      { s: 11, d: 4, v: .52, l: '16n', e: 2 }, { s: 12, d: 3, v: .64, l: '4n' },
    ],
    patB: [
      { s: 0, d: 4, v: .60, l: '4n' }, { s: 5, d: 5, v: .54, l: '8n' },
      { s: 8, d: 6, v: .68, l: '2n' },
    ],
  },
  'melody-flute': {
    label: 'フルート', tag: '軽い・舞う',
    sound: { kind: 'sampler', set: 'flute', fb: 'bell', oct: 5, hp: 400, lp: 11000,
             gain: -12, rev: .26, dly: .18, duck: true, env: { attack: .03, release: .5 } },
    pat: [
      { s: 4, d: 3, v: .50, l: '16n' }, { s: 5, d: 4, v: .45, l: '16n' },
      { s: 6, d: 5, v: .52, l: '16n' }, { s: 7, d: 6, v: .60, l: '8n' },
      { s: 12, d: 5, v: .55, l: '8n' }, { s: 14, d: 4, v: .45, l: '16n', e: 2 },
    ],
    /* 降りてくる形。d は 5 まで（音源の上限 E6 を超えないように） */
    patB: [
      { s: 0, d: 5, v: .58, l: '8n' }, { s: 1, d: 4, v: .42, l: '16n' },
      { s: 2, d: 3, v: .48, l: '16n' }, { s: 3, d: 2, v: .42, l: '16n' },
      { s: 4, d: 1, v: .54, l: '4n' }, { s: 10, d: 4, v: .50, l: '8n', e: 2 },
    ],
  },
  'melody-violin': {
    label: 'ヴァイオリン', tag: '伸びる・のぼる',
    sound: { kind: 'sampler', set: 'violin', fb: 'bow', oct: 4, hp: 240, lp: 9000,
             gain: -12, rev: .28, dly: .06, duck: true, env: { attack: .06, release: .8 } },
    pat: [
      { s: 0, d: 4, v: .58, l: '2n' }, { s: 8, d: 5, v: .62, l: '4n' },
      { s: 12, d: 3, v: .52, l: '4n' },
    ],
    patB: [
      { s: 0, d: 5, v: .56, l: '4n' }, { s: 4, d: 6, v: .60, l: '4n' },
      { s: 8, d: 7, v: .66, l: '2n' },
    ],
  },
  'melody-trumpet': {
    label: 'トランペット', tag: '高らか・宣言する',
    sound: { kind: 'sampler', set: 'trumpet', fb: 'brass', oct: 4, hp: 220, lp: 9000,
             gain: -11, rev: .20, dly: .10, duck: true, env: { attack: .012, release: .35 } },
    pat: [
      { s: 0, d: 4, v: .75, l: '8n' }, { s: 4, d: 5, v: .62, l: '8n' },
      { s: 6, d: 4, v: .50, l: '16n', e: 2 }, { s: 8, d: 6, v: .78, l: '4n' },
      { s: 13, d: 5, v: .58, l: '8n' },
    ],
    patB: [
      { s: 2, d: 6, v: .70, l: '16n' }, { s: 3, d: 7, v: .74, l: '8n' },
      { s: 8, d: 8, v: .82, l: '2n' }, { s: 14, d: 6, v: .55, l: '8n', e: 2 },
    ],
  },
  'melody-trombone': {
    label: 'トロンボーン', tag: '太く歌う・滑る',
    sound: { kind: 'sampler', set: 'trombone', fb: 'brass', oct: 3, hp: 110, lp: 6000,
             gain: -10, rev: .22, dly: .05, duck: true, env: { attack: .02, release: .5 } },
    pat: [
      { s: 0, d: 1, v: .70, l: '4n' }, { s: 4, d: 2, v: .58, l: '8n' },
      { s: 8, d: 3, v: .72, l: '2n' }, { s: 14, d: 2, v: .50, l: '8n', e: 2 },
    ],
    patB: [
      { s: 0, d: 4, v: .66, l: '8n' }, { s: 2, d: 3, v: .54, l: '8n' },
      { s: 6, d: 2, v: .60, l: '8n' }, { s: 8, d: 1, v: .74, l: '2n' },
    ],
  },
  'melody-lead': {
    label: 'シンセリード', tag: '刻む・突き刺す',
    sound: { kind: 'synth', fb: 'lead', oct: 5, hp: 420, lp: 9000,
             gain: -15, rev: .10, dly: .22, duck: true },
    pat: [
      { s: 0, d: 0, v: .80, l: '16n' }, { s: 1, d: 0, v: .35, l: '16n', e: 2 },
      { s: 2, d: 2, v: .55, l: '16n' }, { s: 4, d: 1, v: .70, l: '16n' },
      { s: 6, d: 3, v: .45, l: '16n', e: 2 }, { s: 7, d: 4, v: .55, l: '16n' },
      { s: 8, d: 2, v: .78, l: '16n' }, { s: 9, d: 2, v: .35, l: '16n', e: 3 },
      { s: 10, d: 5, v: .55, l: '16n' }, { s: 12, d: 4, v: .70, l: '16n' },
      { s: 13, d: 3, v: .45, l: '16n', e: 3 }, { s: 14, d: 6, v: .58, l: '16n' },
    ],
    /* 4小節目は上へ駆け上がる */
    patB: [
      { s: 0, d: 0, v: .74, l: '16n' }, { s: 2, d: 1, v: .58, l: '16n' },
      { s: 4, d: 2, v: .66, l: '16n' }, { s: 6, d: 3, v: .58, l: '16n' },
      { s: 8, d: 4, v: .74, l: '16n' }, { s: 10, d: 5, v: .62, l: '16n' },
      { s: 12, d: 6, v: .70, l: '16n' }, { s: 14, d: 7, v: .82, l: '8n' },
    ],
  },

  /* =================================================================
     CHORD ＝ 曲の「空間」    目安 gain −16dB（面で支える側は少し下げる）
     ================================================================= */
  'chord-piano': {
    label: 'ピアノ', tag: '裏で刻む・軽い和音',
    sound: { kind: 'sampler', set: 'piano', fb: 'poly', oct: 3, hp: 160, lp: 8000,
             gain: -15, rev: .18, dly: .04, duck: true, env: { attack: 0, release: .9 } },
    pat: [
      { s: 2, d: [0, 1, 2], v: .50, l: '8n' }, { s: 6, d: [1, 2, 3], v: .44, l: '8n' },
      { s: 10, d: [0, 1, 2], v: .50, l: '8n' }, { s: 13, d: [1, 2, 3], v: .40, l: '16n', e: 2 },
      { s: 14, d: [2, 3, 4], v: .52, l: '8n' },
    ],
    patB: [
      { s: 0, d: [0, 1, 2], v: .54, l: '4n' }, { s: 6, d: [2, 3, 4], v: .46, l: '8n' },
      { s: 8, d: [1, 2, 3], v: .50, l: '4n' },
    ],
  },
  'chord-aguitar': {
    label: 'アコギ', tag: 'かき鳴らす・体温',
    sound: { kind: 'sampler', set: 'guitar-acoustic', fb: 'pluck', oct: 3, hp: 140, lp: 7500,
             gain: -15, rev: .16, dly: .05, duck: true, env: { attack: .002, release: .6 } },
    pat: [
      { s: 0, d: [0, 1, 2], v: .60, l: '8n' }, { s: 3, d: [1, 2, 3], v: .32, l: '16n' },
      { s: 4, d: [0, 1, 2], v: .48, l: '8n' }, { s: 6, d: [1, 2, 3], v: .30, l: '16n', e: 2 },
      { s: 8, d: [0, 1, 2], v: .58, l: '8n' }, { s: 11, d: [1, 2, 3], v: .32, l: '16n' },
      { s: 12, d: [0, 1, 2], v: .48, l: '8n' }, { s: 14, d: [2, 3, 4], v: .36, l: '16n', e: 2 },
    ],
    patB: [
      { s: 0, d: [0, 1, 2], v: .62, l: '4n' }, { s: 4, d: [1, 2, 3], v: .40, l: '8n' },
      { s: 8, d: [0, 1, 2], v: .56, l: '8n' }, { s: 10, d: [1, 2, 3], v: .34, l: '16n' },
      { s: 12, d: [2, 3, 4], v: .52, l: '4n' },
    ],
  },
  'chord-cutting': {
    label: 'カッティング', tag: '16分で切る・跳ねる',
    sound: { kind: 'sampler', set: 'guitar-electric', fb: 'pluck', oct: 3, hp: 320, lp: 6500,
             gain: -15, rev: .10, dly: .08, drive: .12, duck: true, env: { attack: .002, release: .12 } },
    pat: [
      { s: 1, d: [1, 2, 3], v: .48, l: '16n' }, { s: 3, d: [1, 2, 3], v: .34, l: '16n' },
      { s: 5, d: [2, 3, 4], v: .50, l: '16n' }, { s: 6, d: [1, 2, 3], v: .30, l: '16n', e: 2 },
      { s: 9, d: [1, 2, 3], v: .48, l: '16n' }, { s: 11, d: [2, 3, 4], v: .36, l: '16n' },
      { s: 13, d: [1, 2, 3], v: .50, l: '16n' }, { s: 15, d: [2, 3, 4], v: .34, l: '16n', e: 2 },
    ],
    patB: [
      { s: 1, d: [1, 2, 3], v: .50, l: '16n' }, { s: 2, d: [1, 2, 3], v: .34, l: '16n' },
      { s: 5, d: [2, 3, 4], v: .52, l: '16n' }, { s: 7, d: [1, 2, 3], v: .36, l: '16n' },
      { s: 8, d: [2, 3, 4], v: .54, l: '16n' }, { s: 11, d: [1, 2, 3], v: .38, l: '16n' },
      { s: 12, d: [2, 3, 4], v: .56, l: '8n' },
    ],
  },
  'chord-organ': {
    label: 'オルガン', tag: '面で支える・持続',
    sound: { kind: 'sampler', set: 'organ', fb: 'pad', oct: 3, hp: 170, lp: 6000,
             gain: -19, rev: .20, dly: 0, duck: true, env: { attack: .04, release: .5 } },
    pat: [
      { s: 0, d: [0, 1, 2, 3], v: .38, l: '2n' }, { s: 8, d: [0, 1, 2, 3], v: .34, l: '2n' },
    ],
    patB: [
      { s: 0, d: [0, 1, 2, 3], v: .38, l: '2n' }, { s: 8, d: [1, 2, 3, 4], v: .40, l: '4n' },
      { s: 12, d: [2, 3, 4, 5], v: .42, l: '4n' },
    ],
  },
  'chord-harmonium': {
    label: 'ハルモニウム', tag: '息のあるオルガン・にじむ',
    sound: { kind: 'sampler', set: 'harmonium', fb: 'pad', oct: 3, hp: 190, lp: 5200,
             gain: -19, rev: .26, dly: .04, duck: true, env: { attack: .10, release: .9 } },
    pat: [
      { s: 0, d: [0, 2, 3], v: .40, l: '1n' },
    ],
    patB: [
      { s: 0, d: [0, 2, 3], v: .38, l: '2n' }, { s: 8, d: [1, 3, 4], v: .44, l: '2n' },
    ],
  },
  'chord-harp': {
    label: 'ハープ', tag: '滴る・分散和音',
    sound: { kind: 'sampler', set: 'harp', fb: 'bell', oct: 3, hp: 220, lp: 10000,
             gain: -14, rev: .26, dly: .12, duck: true, env: { attack: 0, release: 1.4 } },
    pat: [
      { s: 0, d: 0, v: .55, l: '8n' }, { s: 2, d: 1, v: .40, l: '8n' },
      { s: 4, d: 2, v: .48, l: '8n' }, { s: 6, d: 3, v: .38, l: '8n' },
      { s: 8, d: 4, v: .52, l: '8n' }, { s: 10, d: 5, v: .38, l: '8n' },
      { s: 12, d: 6, v: .48, l: '8n' }, { s: 14, d: 5, v: .36, l: '8n', e: 2 },
    ],
    /* 4小節目は逆向きに降りてくる */
    patB: [
      { s: 0, d: 7, v: .52, l: '8n' }, { s: 2, d: 6, v: .38, l: '8n' },
      { s: 4, d: 5, v: .46, l: '8n' }, { s: 6, d: 4, v: .36, l: '8n' },
      { s: 8, d: 3, v: .50, l: '8n' }, { s: 10, d: 2, v: .36, l: '8n' },
      { s: 12, d: 1, v: .46, l: '8n' }, { s: 14, d: 0, v: .42, l: '4n' },
    ],
  },
  'chord-strings': {
    label: 'ストリングス', tag: '包む・ふくらむ',
    sound: { kind: 'sampler', set: 'violin', fb: 'bow', oct: 4, hp: 260, lp: 7000,
             gain: -20, rev: .34, dly: 0, duck: true, env: { attack: .25, release: 1.6 } },
    pat: [
      { s: 0, d: [2, 3, 4], v: .40, l: '1n' },
    ],
    patB: [
      { s: 0, d: [2, 3, 4], v: .38, l: '2n' }, { s: 8, d: [3, 4, 5], v: .44, l: '2n' },
    ],
  },
  'chord-brass': {
    label: 'ブラス', tag: '一撃・合いの手',
    sound: { kind: 'sampler', set: 'trumpet', fb: 'brass', oct: 4, hp: 220, lp: 8000,
             gain: -17, rev: .18, dly: .06, duck: true, env: { attack: .012, release: .30 } },
    pat: [
      { s: 4, d: [2, 3, 4], v: .62, l: '8n' }, { s: 10, d: [3, 4, 5], v: .55, l: '16n' },
      { s: 12, d: [2, 3, 4], v: .58, l: '8n', e: 2 },
    ],
    patB: [
      { s: 0, d: [2, 3, 4], v: .64, l: '16n' }, { s: 2, d: [2, 3, 4], v: .48, l: '16n' },
      { s: 6, d: [3, 4, 5], v: .60, l: '8n' }, { s: 12, d: [4, 5, 6], v: .66, l: '4n' },
    ],
  },
  'chord-horn': {
    label: 'ホルン', tag: '丸い面・遠くで鳴る',
    /* 音源は C4 と D5 の間が 14 半音あいている。そこへ音を置くと補間が
       効かず露骨に不自然になるので、d は 3 までに抑えて低い側だけ使う。 */
    sound: { kind: 'sampler', set: 'french-horn', fb: 'pad', oct: 3, hp: 150, lp: 4800,
             gain: -18, rev: .30, dly: 0, duck: true, env: { attack: .12, release: 1.0 } },
    pat: [
      { s: 0, d: [0, 1, 2], v: .42, l: '1n' },
    ],
    patB: [
      { s: 0, d: [0, 1, 2], v: .40, l: '2n' }, { s: 8, d: [1, 2, 3], v: .46, l: '2n' },
    ],
  },
  'chord-pad': {
    label: 'シンセパッド', tag: '奥行き・にじむ',
    sound: { kind: 'synth', fb: 'pad', oct: 3, hp: 200, lp: 4200,
             gain: -20, rev: .34, dly: .08, duck: true },
    pat: [
      { s: 0, d: [0, 2, 4], v: .42, l: '1n' },
    ],
    patB: [
      { s: 0, d: [0, 2, 4], v: .40, l: '2n' }, { s: 8, d: [1, 3, 5], v: .46, l: '2n' },
    ],
  },

  /* =================================================================
     BASS ＝ 曲の「足元」    目安 gain −7dB（同時1枚なので堂々と出す）
     ================================================================= */
  'bass-ebass': {
    label: 'エレキベース', tag: 'キックに張りつく',
    sound: { kind: 'sampler', set: 'bass-electric', fb: 'mono', oct: 2, hp: 32, lp: 1600,
             gain: -7, rev: .03, dly: 0, duck: true, env: { attack: .002, release: .25 } },
    pat: [
      { s: 0, d: 0, v: .95, l: '8n' }, { s: 3, d: 0, v: .48, l: '16n' },
      { s: 6, d: 2, v: .60, l: '8n' }, { s: 8, d: 0, v: .90, l: '8n' },
      { s: 10, d: 0, v: .48, l: '16n', e: 2 }, { s: 11, d: 1, v: .62, l: '8n' },
      { s: 14, d: 3, v: .66, l: '8n' },
    ],
    patB: [
      { s: 0, d: 0, v: .95, l: '8n' }, { s: 4, d: 1, v: .66, l: '8n' },
      { s: 8, d: 3, v: .82, l: '8n' }, { s: 11, d: 4, v: .58, l: '16n' },
      { s: 12, d: 5, v: .70, l: '8n' }, { s: 14, d: 1, v: .62, l: '8n' },
    ],
  },
  'bass-upright': {
    label: 'ウッドベース', tag: '歩く・呼吸する',
    sound: { kind: 'sampler', set: 'contrabass', fb: 'mono', oct: 2, hp: 30, lp: 1200,
             gain: -7, rev: .06, dly: 0, duck: true, env: { attack: .01, release: .35 } },
    pat: [
      { s: 0, d: 0, v: .82, l: '4n' }, { s: 4, d: 3, v: .62, l: '4n' },
      { s: 8, d: 1, v: .74, l: '4n' }, { s: 12, d: 5, v: .62, l: '4n' },
      { s: 14, d: 4, v: .40, l: '16n', e: 3 },
    ],
    patB: [
      { s: 0, d: 1, v: .80, l: '4n' }, { s: 4, d: 4, v: .60, l: '4n' },
      { s: 8, d: 5, v: .72, l: '4n' }, { s: 12, d: 3, v: .64, l: '8n' },
      { s: 14, d: 0, v: .56, l: '8n' },
    ],
  },
  'bass-cello': {
    label: 'チェロ', tag: '伸ばす・沈む',
    sound: { kind: 'sampler', set: 'cello', fb: 'bow', oct: 2, hp: 40, lp: 2600,
             gain: -9, rev: .18, dly: 0, duck: true, env: { attack: .08, release: .9 } },
    pat: [
      { s: 0, d: 0, v: .62, l: '2n' }, { s: 8, d: 1, v: .55, l: '2n' },
    ],
    patB: [
      { s: 0, d: 3, v: .60, l: '2n' }, { s: 8, d: 0, v: .58, l: '4n' },
      { s: 12, d: 5, v: .52, l: '4n' },
    ],
  },
  'bass-tuba': {
    label: 'チューバ', tag: '生の重低音・ふくらむ',
    sound: { kind: 'sampler', set: 'tuba', fb: 'mono', oct: 2, hp: 26, lp: 900,
             gain: -7, rev: .08, dly: 0, duck: true, env: { attack: .03, release: .5 } },
    pat: [
      { s: 0, d: 0, v: .88, l: '4n' }, { s: 6, d: 0, v: .52, l: '8n' },
      { s: 8, d: 1, v: .76, l: '4n' }, { s: 14, d: 0, v: .56, l: '8n', e: 2 },
    ],
    patB: [
      { s: 0, d: 0, v: .86, l: '8n' }, { s: 3, d: 1, v: .58, l: '8n' },
      { s: 8, d: 3, v: .78, l: '4n' }, { s: 12, d: 5, v: .62, l: '4n' },
    ],
  },
  'bass-bassoon': {
    label: 'バスーン', tag: '木の中低音・語尾がある',
    /* 音源の最低音が G2 なので、他のベースと同じ oct2 にすると 11 半音も
       下へ移調され、鈍い音になる。oct3（テノール域）で使う代わりに、
       他のベースより「歌う」性格のカードとして立てる。                 */
    sound: { kind: 'sampler', set: 'bassoon', fb: 'mono', oct: 3, hp: 60, lp: 2000,
             gain: -9, rev: .14, dly: 0, duck: true, env: { attack: .02, release: .45 } },
    pat: [
      { s: 0, d: 0, v: .80, l: '8n' }, { s: 4, d: 1, v: .58, l: '8n' },
      { s: 8, d: 0, v: .76, l: '8n' }, { s: 11, d: 3, v: .56, l: '16n', e: 2 },
      { s: 12, d: 1, v: .64, l: '8n' },
    ],
    patB: [
      { s: 0, d: 3, v: .78, l: '8n' }, { s: 4, d: 4, v: .58, l: '8n' },
      { s: 8, d: 5, v: .72, l: '8n' }, { s: 12, d: 0, v: .70, l: '4n' },
    ],
  },
  'bass-organ': {
    label: 'オルガンベース', tag: '途切れない・地鳴り',
    sound: { kind: 'sampler', set: 'organ', fb: 'pad', oct: 2, hp: 30, lp: 900,
             gain: -9, rev: .05, dly: 0, duck: true, env: { attack: .03, release: .4 } },
    pat: [
      { s: 0, d: 0, v: .70, l: '2n' }, { s: 8, d: 0, v: .60, l: '4n' },
      { s: 12, d: 1, v: .58, l: '4n' },
    ],
    patB: [
      { s: 0, d: 0, v: .70, l: '4n' }, { s: 4, d: 3, v: .58, l: '4n' },
      { s: 8, d: 5, v: .62, l: '4n' }, { s: 12, d: 1, v: .60, l: '4n' },
    ],
  },
  'bass-pianolow': {
    label: 'ピアノ（低音）', tag: '打楽器のような低音',
    sound: { kind: 'sampler', set: 'piano', fb: 'poly', oct: 2, hp: 40, lp: 2200,
             gain: -8, rev: .08, dly: 0, duck: true, env: { attack: 0, release: .7 } },
    pat: [
      { s: 0, d: [0, 2], v: .72, l: '8n' }, { s: 6, d: [0, 2], v: .50, l: '8n' },
      { s: 8, d: [0, 2], v: .66, l: '8n' }, { s: 12, d: [1, 2], v: .55, l: '8n' },
      { s: 15, d: [0, 2], v: .42, l: '16n', e: 3 },
    ],
    patB: [
      { s: 0, d: [0, 2], v: .74, l: '8n' }, { s: 4, d: [3, 2], v: .54, l: '8n' },
      { s: 8, d: [1, 2], v: .68, l: '8n' }, { s: 11, d: [5, 2], v: .50, l: '16n' },
      { s: 12, d: [0, 2], v: .60, l: '4n' },
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
    patB: [
      { s: 0, d: 0, v: .92, l: '16n' }, { s: 2, d: 1, v: .56, l: '16n' },
      { s: 4, d: 0, v: .70, l: '16n' }, { s: 6, d: 3, v: .60, l: '16n' },
      { s: 8, d: 0, v: .88, l: '16n' }, { s: 10, d: 5, v: .62, l: '16n' },
      { s: 12, d: 1, v: .72, l: '16n' }, { s: 14, d: 4, v: .60, l: '16n' },
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
    patB: [
      { s: 0, d: 0, v: .90, l: '8n' }, { s: 3, d: 1, v: .60, l: '16n' },
      { s: 4, d: 3, v: .66, l: '8n' }, { s: 8, d: 0, v: .88, l: '8n' },
      { s: 11, d: 5, v: .62, l: '16n' }, { s: 12, d: 4, v: .72, l: '4n' },
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
    patB: [
      { s: 0, d: 0, v: .95, l: '4n' }, { s: 6, d: 1, v: .68, l: '8n' },
      { s: 8, d: 3, v: .78, l: '4n' }, { s: 14, d: 0, v: .64, l: '8n' },
    ],
  },

  /* =================================================================
     RHYTHM ＝ 曲の「動き」    同時3枚まで
     キック持ちは6枚。残り4枚（木琴・シェイカー・ボンゴ・ライド）は
     キックを持たない「薄い層」で、どのリズムの上にも安全に重なる。
     ================================================================= */
  'rhythm-kit': {
    label: '生ドラム', tag: '王道・8ビート',
    sound: { kind: 'kit', set: 'acoustic-kit', gain: -8, hp: 28, lp: 16000, rev: .07 },
    drum: {
      k: [0, 7, 10], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], hv: .30,
      h3: [1, 3, 5, 7, 9, 11, 13, 15], ghost: [6, 14],
      oh: [14], cr: [0], hasKick: true,
    },
    /* 4小節目：オープンハットを増やしてタムで受ける */
    drumB: {
      k: [0, 7, 10, 14], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12], hv: .30,
      oh: [6, 14], t: [13], t2: [15], cr: [],
    },
  },
  'rhythm-break': {
    label: 'ブレイクビーツ', tag: '転がる・つんのめる',
    sound: { kind: 'kit', set: 'breakbeat13', gain: -8, hp: 40, lp: 15000, rev: .10 },
    drum: {
      k: [0, 2, 9], s: [4, 11, 12], h: [0, 3, 6, 8, 10, 14], hv: .34,
      h3: [1, 5, 7, 13, 15], ghost: [7, 15], t: [13],
      oh: [10], cr: [0], hasKick: true,
    },
    drumB: {
      k: [0, 2, 6, 9], s: [4, 12, 14], h: [0, 3, 8, 10], hv: .34,
      oh: [6, 13], t: [11], t2: [13], t3: [15], cr: [],
    },
  },
  'rhythm-four': {
    label: '四つ打ち', tag: '止まらない・前へ',
    sound: { kind: 'kit', set: 'Techno', gain: -9, hp: 30, lp: 16000, rev: .06 },
    drum: {
      k: [0, 4, 8, 12], s: [4, 12], h: [2, 6, 10, 14], hv: .38,
      h3: [1, 3, 5, 7, 9, 11, 13, 15],
      oh: [2, 6, 10, 14], cr: [0], hasKick: true,
    },
    drumB: {
      k: [0, 4, 8, 12], s: [4, 12], h: [2, 6, 10], hv: .38,
      oh: [2, 6, 10, 13, 14, 15], cr: [],
    },
  },
  'rhythm-machine': {
    label: 'ドラムマシン', tag: '機械的・細かい',
    sound: { kind: 'kit', set: 'CR78', gain: -10, hp: 34, lp: 16000, rev: .05 },
    drum: {
      k: [0, 6, 11], s: [4, 12], h: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], hv: .18,
      ghost: [10], cr: [0], crEvery: 16, hasKick: true,
    },
    drumB: {
      k: [0, 6, 11, 14], s: [4, 12], h: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], hv: .18,
      oh: [13, 15], cr: [],
    },
  },
  'rhythm-linn': {
    label: '80sマシン', tag: '硬い・広い・レトロ',
    sound: { kind: 'kit', set: 'LINN', gain: -10, hp: 32, lp: 16000, rev: .22 },
    drum: {
      k: [0, 3, 8], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], hv: .22,
      t: [14], oh: [6], cr: [0], hasKick: true,
    },
    drumB: {
      k: [0, 3, 8, 11], s: [4, 12], h: [0, 2, 4, 6, 8, 10], hv: .22,
      t: [12], t2: [13], t3: [14], oh: [15], cr: [],
    },
  },
  'rhythm-stark': {
    label: 'ロックキット', tag: '生々しい・叩きつける',
    sound: { kind: 'kit', set: 'Stark', gain: -9, hp: 30, lp: 16000, rev: .16 },
    drum: {
      k: [0, 6, 8], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], hv: .32,
      h3: [1, 5, 9, 13], ghost: [7],
      oh: [10], cr: [0], crEvery: 4, hasKick: true,
    },
    drumB: {
      k: [0, 6, 8, 10], s: [4, 12], h: [0, 2, 4, 6, 8], hv: .32,
      t: [10], t2: [12], t3: [14], oh: [15], cr: [],
    },
  },

  /* ---- ここから下はキックを持たない「薄い層」。重ねても土台が濁らない ---- */
  'rhythm-ride': {
    label: 'ライド', tag: '金物で刻む・音数が増えても濁らない',
    /* シンバルは合成（samples.js の makeCymbals）。キットは音を借りるだけ */
    sound: { kind: 'kit', set: 'acoustic-kit', gain: -8, hp: 300, lp: 16000, rev: .18 },
    drum: {
      k: [], s: [], h: [], hv: 0,
      rd: [0, 4, 6, 8, 12, 14], rv: .55,
      hasKick: false,
    },
    /* drumB は 4小節目（bar % 4 === 3）にしか回ってこないので、
       クラッシュの条件も crPhase: 3 でそこに合わせる。
       ＝4小節ごとに、次の頭へ渡す合図が1発入る。                */
    drumB: {
      k: [], s: [], h: [], hv: 0,
      rd: [0, 2, 4, 6, 8, 10, 12], rv: .50, cr: [14], crEvery: 4, crPhase: 3,
    },
  },
  'rhythm-shaker': {
    label: 'シェイカー', tag: '裏を刻む・前へ押す',
    sound: { kind: 'kit', set: 'acoustic-kit', gain: -13, hp: 400, lp: 16000, rev: .10 },
    drum: {
      k: [], s: [], h: [1, 3, 5, 7, 9, 11, 13, 15], hv: .30,
      h3: [0, 2, 4, 6, 8, 10, 12, 14], hasKick: false,
    },
    drumB: {
      k: [], s: [], h: [1, 3, 5, 7, 9, 11, 12, 13, 14, 15], hv: .30,
    },
  },
  'rhythm-bongo': {
    label: 'ボンゴ', tag: '手で叩く・隙間を埋める',
    sound: { kind: 'kit', set: 'Bongos', gain: -12, hp: 120, lp: 16000, rev: .14 },
    drum: {
      k: [], s: [5, 13], h: [2, 8, 11, 14], hv: .28, t: [0, 6, 9],
      h3: [1, 4, 7, 10, 13], hasKick: false,
    },
    drumB: {
      k: [], s: [5, 11, 13], h: [2, 8, 14], hv: .28,
      t: [0, 6], t2: [9, 12], t3: [15],
    },
  },
  'rhythm-xylo': {
    label: '木琴', tag: '音程のあるリズム・跳ねる',
    sound: { kind: 'sampler', set: 'xylophone', fb: 'bell', oct: 5, hp: 500, lp: 12000,
             gain: -14, rev: .16, dly: .16, duck: true, env: { attack: 0, release: .4 } },
    pat: [
      { s: 0, d: 0, v: .62, l: '16n' }, { s: 3, d: 2, v: .48, l: '16n' },
      { s: 4, d: 1, v: .52, l: '16n' }, { s: 6, d: 3, v: .44, l: '16n', e: 2 },
      { s: 8, d: 2, v: .60, l: '16n' }, { s: 11, d: 4, v: .46, l: '16n' },
      { s: 12, d: 1, v: .52, l: '16n' }, { s: 14, d: 5, v: .44, l: '16n', e: 2 },
    ],
    patB: [
      { s: 0, d: 4, v: .60, l: '16n' }, { s: 2, d: 3, v: .46, l: '16n' },
      { s: 5, d: 2, v: .54, l: '16n' }, { s: 7, d: 1, v: .44, l: '16n' },
      { s: 8, d: 0, v: .62, l: '16n' }, { s: 10, d: 2, v: .48, l: '16n' },
      { s: 13, d: 4, v: .54, l: '16n' }, { s: 15, d: 6, v: .50, l: '16n', e: 2 },
    ],
  },
};

/* ROLE ごとのカード並び（＝画面の列順・キー順）。10枚 × 4役割 ＝ 40枚 */
const CARD_ORDER = {
  melody: ['melody-piano', 'melody-eguitar', 'melody-nylon', 'melody-sax', 'melody-clarinet',
           'melody-flute', 'melody-violin', 'melody-trumpet', 'melody-trombone', 'melody-lead'],
  chord:  ['chord-piano', 'chord-aguitar', 'chord-cutting', 'chord-organ', 'chord-harmonium',
           'chord-harp', 'chord-strings', 'chord-brass', 'chord-horn', 'chord-pad'],
  bass:   ['bass-ebass', 'bass-upright', 'bass-cello', 'bass-tuba', 'bass-bassoon',
           'bass-organ', 'bass-pianolow', 'bass-synth', 'bass-fuzz', 'bass-sub'],
  rhythm: ['rhythm-kit', 'rhythm-break', 'rhythm-four', 'rhythm-machine', 'rhythm-linn',
           'rhythm-stark', 'rhythm-xylo', 'rhythm-shaker', 'rhythm-bongo', 'rhythm-ride'],
};

/* ============ 6. 小節ごとのパターン切り替え ============
   4小節でひと回りするので、その4小節目（bar % 4 === 3）だけ
   patB / drumB があればそちらを使う。「ひと息つく／畳みかける」の一手。
   drumB は差分だけ書けばよいように、起動時に drum とマージしておく。   */
Object.values(CARDS).forEach(c => {
  if (c.drum && c.drumB) c._drumB = Object.assign({}, c.drum, c.drumB);
});

function isVariantBar(bar) { return ((bar % 4) + 4) % 4 === 3; }
function patternAt(card, bar) { return (card.patB && isVariantBar(bar)) ? card.patB : card.pat; }
function drumAt(card, bar)    { return (card._drumB && isVariantBar(bar)) ? card._drumB : card.drum; }

/* ============ 7. ひとつの音の高さを決める ============
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
