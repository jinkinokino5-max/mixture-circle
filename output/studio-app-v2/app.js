/* =====================================================================
   ミクスチャー・サークル STUDIO v2 — ROLE × INSTRUMENT × GENRE 版
   ---------------------------------------------------------------------
   カード ＝ ROLE（曲の中で何をするか）× GENRE（どんな性格でするか）
   楽器は「そのジャンルでその役割を担う代表楽器」として自動的に決まる。
     例：JAZZ × MELODY → サックス ／ CLASSICAL × MELODY → バイオリン

   4 ROLE × 5 GENRE ＝ 20枚。

   ---------------------------------------------------------------------
   v1（output/studio-app）からの音楽面の刷新
     1. コード進行を導入   Cm → A♭ → E♭ → B♭ の4小節ループ。
                           CHORD と BASS は進行を追いかけて音が変わる。
                           （v1 は1つの和音の上をずっと回るだけだった）
     2. 複数小節フレーズ   1小節ループではなく 2〜4小節の楽句にした。
                           ドラムは4小節目にフィルが入る。
     3. 拍位置を絶対時刻から求める
                           v1 は「投入した拍」からパターンが始まるため、
                           小節の途中で入れると拍子とズレて聞こえた。
                           v2 は常に小節頭からの位置を計算するので、
                           いつ入れても他のパートと拍子が揃う。
     4. 奏法を役割ごとに書き分け
                           ウォーキングベースの半音アプローチ、
                           ピアノのルートレス・ヴォイシング、
                           ギターのストラム（弦のずらし）など。

   音源ファイル自体は v1 と同じものを使う（samples/ 以下）。
   鳴らし方＝旋律・和音・リズムはすべてこのファイルで作り直してある。
   ===================================================================== */

/* ============ 1. 音の材料：音階とコード進行 ============ */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/* 半音（Cからの距離）とオクターブ → 'Eb3' のような音名にする */
function noteName(semi, oct) {
  const i = ((semi % 12) + 12) % 12;
  return NOTE_NAMES[i] + (oct + Math.floor(semi / 12));
}

/* メロディが使う音階：Cマイナー・ペンタトニック（C E♭ F G B♭）
   下のコード進行4つ全部に対して外れない音だけで出来ているので、
   誰がどのカードを重ねても濁らない。これが「破綻しない濁り」の土台。 */
const PENTA = [0, 3, 5, 7, 10];
function pentaSemi(deg) {
  const i = ((deg % 5) + 5) % 5;
  return PENTA[i] + 12 * Math.floor(deg / 5);
}

/* コード進行：1小節ずつ Cm → A♭ → E♭ → B♭（すべてCナチュラルマイナー内）
   root : Cからの半音。低く置いてベースの音域が飛ばないようにしてある
   tri  : 三和音（ルートからの半音）
   sev  : 七の和音（ジャズのコンピング用）                              */
const PROG = [
  { name: 'Cm',    root:  0, tri: [0, 3, 7], sev: [0, 3, 7, 10] },
  { name: 'A♭',   root: -4, tri: [0, 4, 7], sev: [0, 4, 7, 11] },
  { name: 'E♭',   root:  3, tri: [0, 4, 7], sev: [0, 4, 7, 11] },
  { name: 'B♭7',  root: -2, tri: [0, 4, 7], sev: [0, 4, 7, 10] },
];
function chordAt(bar) { return PROG[((bar % 4) + 4) % 4]; }

/* CHORD役のヴォイシング（和音の積み方）。ジャンルごとに積み方が違う */
function voicing(kind, ch) {
  switch (kind) {
    case 'power':                        // ロック：ルートと5度だけのパワーコード
      return [ch.root, ch.root + 7, ch.root + 12];
    case 'rootless':                     // ジャズ：ルートを抜いた七の和音（ベースに任せる）
      return [ch.root + ch.sev[1], ch.root + ch.sev[2], ch.root + ch.sev[3]];
    case 'triad':                        // クラシック：素直な三和音
      return ch.tri.map(x => ch.root + x);
    case 'pad':                          // エレクトロ：ルート・5度・オクターブ・9度の広がり
      return [ch.root, ch.root + 7, ch.root + 12, ch.root + 14];
    case 'open':                         // ポップ：ギターで押さえたような開いた形
      return [ch.root, ch.root + 7, ch.root + 12, ch.root + 12 + ch.tri[1], ch.root + 19];
    default:
      return ch.tri.map(x => ch.root + x);
  }
}

/* BASS役：コードの何番目の音を弾くか（3以上はオクターブ上のルート） */
function bassSemi(ch, c) {
  if (c >= 3) return ch.root + 12;
  return ch.root + ch.tri[c];
}

/* ============ 2. 役割（ROLE：グリッドの行） ============
   周波数の住み分けはここで決まる。
   BASS＝低域／CHORD＝中域／MELODY＝中高域／RHYTHM＝全域。
   役割が違えば帯域が違うので、4枚重ねても音が団子にならない。       */
const ROLES = {
  melody: {
    label: 'MELODY', jp: 'メロディ', desc: '曲の「顔」・主旋律',
    keys: ['1', '2', '3', '4', '5'],
    oct: 4, hp: 220, lp: 9000, gain: -11, send: 0.20,
  },
  bass: {
    label: 'BASS', jp: 'ベース', desc: '曲の「足元」・低音と安定感',
    keys: ['q', 'w', 'e', 'r', 't'],
    oct: 2, hp: 30, lp: 1300, gain: -5, send: 0.05,
  },
  rhythm: {
    label: 'RHYTHM', jp: 'リズム', desc: '曲の「動き」・拍とノリ',
    keys: ['a', 's', 'd', 'f', 'g'],
    oct: 0, hp: 28, lp: 16000, gain: -8, send: 0.10,
  },
  chord: {
    label: 'CHORD', jp: 'コード', desc: '曲の「空間」・和音と厚み',
    keys: ['z', 'x', 'c', 'v', 'b'],
    oct: 3, hp: 150, lp: 7000, gain: -13, send: 0.18,
  },
};
const ROLE_ORDER = ['melody', 'bass', 'rhythm', 'chord'];

/* ============ 3. ジャンル（グリッドの列） ============ */
const GENRES = {
  rock:       { label: 'ロック',     sub: 'ROCK',       desc: '力強い・激しい' },
  jazz:       { label: 'ジャズ',     sub: 'JAZZ',       desc: '夜・都会的・複雑' },
  classical:  { label: 'クラシック', sub: 'CLASSICAL',  desc: '美しい・壮大・物語的' },
  electronic: { label: 'エレクトロ', sub: 'ELECTRONIC', desc: '未来的・機械的・反復' },
  pop:        { label: 'ポップ',     sub: 'POP',        desc: '明るい・親しみやすい' },
};
const GENRE_ORDER = ['rock', 'jazz', 'classical', 'electronic', 'pop'];

/* ============ 4. 音源（実録音サンプル／合成音） ============
   kind : 'sampler' 実録音の音階楽器 / 'kit' 実録音ドラム / 'synth' 合成音
   set  : samples/ 以下のフォルダ名
   env  : サンプラーのアタックとリリース
   fb   : サンプルが無いときに代わりに使う合成音の種類            */
const VOICES = {
  'guitar-electric':  { label: 'エレキギター',       kind: 'sampler', set: 'guitar-electric',
                        env: { attack: 0.002, release: 0.45 }, fb: 'pluck' },
  'guitar-acoustic':  { label: 'アコースティックギター', kind: 'sampler', set: 'guitar-acoustic',
                        env: { attack: 0.003, release: 0.9 },  fb: 'pluck' },
  'bass-electric':    { label: 'エレキベース',       kind: 'sampler', set: 'bass-electric',
                        env: { attack: 0.002, release: 0.3 },  fb: 'mono' },
  contrabass:         { label: 'ウッドベース',       kind: 'sampler', set: 'contrabass',
                        env: { attack: 0.008, release: 0.4 },  fb: 'mono' },
  piano:              { label: 'ピアノ',             kind: 'sampler', set: 'piano',
                        env: { attack: 0, release: 1.4 },      fb: 'poly' },
  saxophone:          { label: 'サックス',           kind: 'sampler', set: 'saxophone',
                        env: { attack: 0.012, release: 0.3 },  fb: 'reed' },
  violin:             { label: 'バイオリン',         kind: 'sampler', set: 'violin',
                        env: { attack: 0.06, release: 0.8 },   fb: 'bow' },
  cello:              { label: 'チェロ',             kind: 'sampler', set: 'cello',
                        env: { attack: 0.05, release: 0.9 },   fb: 'bow' },
  'synth-lead':       { label: 'シンセリード',       kind: 'synth', fb: 'lead' },
  'synth-bass':       { label: 'シンセベース',       kind: 'synth', fb: 'sbass' },
  'synth-pad':        { label: 'シンセパッド',       kind: 'synth', fb: 'pad' },
  drums:              { label: 'ドラム',             kind: 'kit' },
};

/* ============ 5. カード20枚 ============
   ここが v2 の中身そのもの。20通りすべての旋律・奏法・リズムを書いてある。

   フレーズは「小節の配列」。小節番号 % 配列長 で選ばれるので、
   2小節フレーズ・4小節フレーズが混ざっていてよい。

   1小節＝16ステップ（16分音符）。s がステップ番号。
     MELODY  { s, d:ペンタトニックの度数, v:強さ, l:音の長さ }
     BASS    { s, c:コード構成音の番号 / app:次のコードへ半音でアプローチ, v, l }
     CHORD   { s, n:和音の何番目か（省略＝全部いっぺんに）, v, l }
     RHYTHM  { s, p:'k'キック 's'スネア 'h'ハイハット 't'タム, v }        */
const CARDS = {

  /* ───────────── ROCK：8分の押し出し、強拍、パワーコード ───────────── */
  rock: {
    melody: {
      voice: 'guitar-electric', oct: 4, gain: -10, drive: 0.32,
      /* 2小節のギターリフ。1小節目で問いかけ、2小節目で上に駆け上がって答える */
      phrase: [
        [ { s: 0,  d: 0, v: .95, l: '8n'  }, { s: 3,  d: 2, v: .55, l: '16n' },
          { s: 4,  d: 3, v: .85, l: '8n'  }, { s: 6,  d: 2, v: .50, l: '16n' },
          { s: 8,  d: 4, v: .92, l: '4n'  }, { s: 12, d: 3, v: .70, l: '8n'  },
          { s: 14, d: 2, v: .58, l: '16n' } ],
        [ { s: 0,  d: 0, v: .95, l: '8n'  }, { s: 3,  d: 2, v: .55, l: '16n' },
          { s: 4,  d: 3, v: .85, l: '8n'  }, { s: 7,  d: 5, v: .88, l: '8n'  },
          { s: 10, d: 4, v: .75, l: '8n'  }, { s: 12, d: 3, v: .68, l: '16n' },
          { s: 13, d: 2, v: .58, l: '16n' }, { s: 14, d: 0, v: .82, l: '8n'  } ],
      ],
    },
    bass: {
      voice: 'bass-electric', oct: 2, gain: -5,
      /* キックに張り付く8分。2小節目の終わりだけ5度→3度で持ち上げる */
      phrase: [
        [ { s: 0,  c: 0, v: .95, l: '8n' }, { s: 2,  c: 0, v: .50, l: '8n' },
          { s: 4,  c: 0, v: .58, l: '8n' }, { s: 6,  c: 0, v: .85, l: '8n' },
          { s: 8,  c: 0, v: .92, l: '8n' }, { s: 10, c: 0, v: .50, l: '8n' },
          { s: 12, c: 2, v: .70, l: '8n' }, { s: 14, c: 1, v: .72, l: '8n' } ],
        [ { s: 0,  c: 0, v: .95, l: '8n' }, { s: 2,  c: 0, v: .50, l: '8n' },
          { s: 4,  c: 0, v: .58, l: '8n' }, { s: 6,  c: 0, v: .85, l: '8n' },
          { s: 8,  c: 3, v: .88, l: '8n' }, { s: 10, c: 2, v: .55, l: '8n' },
          { s: 12, c: 1, v: .70, l: '8n' }, { s: 14, c: 0, v: .80, l: '8n' } ],
      ],
    },
    rhythm: {
      voice: 'drums', kit: 'acoustic-kit', gain: -8,
      /* 4小節でひとまとまり。4小節目にタムのフィルが入って区切りが分かる */
      phrase: [
        drumBar({ k: [0, 6, 8, 14], s: [4, 12], h8: true, hv: .34 }),
        drumBar({ k: [0, 6, 8, 14], s: [4, 12], h8: true, hv: .34 }),
        drumBar({ k: [0, 6, 8, 14], s: [4, 12], h8: true, hv: .34 }),
        [ { s: 0, p: 'k', v: .90 }, { s: 4, p: 's', v: .70 },
          { s: 6, p: 'k', v: .70 }, { s: 8, p: 's', v: .55 },
          { s: 0, p: 'h', v: .30 }, { s: 2, p: 'h', v: .22 },
          { s: 4, p: 'h', v: .30 }, { s: 6, p: 'h', v: .22 },
          { s: 10, p: 't', v: .60 }, { s: 11, p: 't', v: .50 },
          { s: 12, p: 's', v: .75 }, { s: 13, p: 's', v: .60 },
          { s: 14, p: 't', v: .80 }, { s: 15, p: 't', v: .70 } ],
      ],
    },
    chord: {
      voice: 'guitar-electric', oct: 3, gain: -12, drive: 0.38, kindOfVoicing: 'power',
      /* パワーコードのチャグ。裏で短く刻んで前のめりにする */
      phrase: [
        [ { s: 0,  v: .90, l: '16n' }, { s: 2,  v: .48, l: '16n' },
          { s: 4,  v: .82, l: '16n' }, { s: 6,  v: .48, l: '16n' },
          { s: 7,  v: .58, l: '16n' }, { s: 8,  v: .90, l: '16n' },
          { s: 10, v: .48, l: '16n' }, { s: 12, v: .82, l: '16n' },
          { s: 14, v: .55, l: '16n' }, { s: 15, v: .50, l: '16n' } ],
      ],
    },
  },

  /* ───────────── JAZZ：スウィング（拍を 0 と 3 に置く）、裏拍 ───────────── */
  jazz: {
    melody: {
      voice: 'saxophone', oct: 4, gain: -12,
      /* 2小節のアドリブ風。休符を多くとって「息継ぎ」を作る */
      phrase: [
        [ { s: 0,  d: 2, v: .70, l: '8n'  }, { s: 3,  d: 3, v: .48, l: '16n' },
          { s: 4,  d: 4, v: .72, l: '8n'  }, { s: 7,  d: 3, v: .46, l: '16n' },
          { s: 8,  d: 2, v: .68, l: '4n'  }, { s: 12, d: 1, v: .60, l: '8n'  },
          { s: 15, d: 0, v: .52, l: '16n' } ],
        [ { s: 2,  d: 0, v: .64, l: '8n'  }, { s: 4,  d: 1, v: .70, l: '8n'  },
          { s: 7,  d: 2, v: .48, l: '16n' }, { s: 8,  d: 3, v: .75, l: '8n'  },
          { s: 11, d: 4, v: .52, l: '16n' }, { s: 12, d: 5, v: .70, l: '2n'  } ],
      ],
    },
    bass: {
      voice: 'contrabass', oct: 2, gain: -6,
      /* ウォーキングベース：4分音符で歩き、4拍目で次のコードへ半音で寄せる。
         app: -1 なら下から、+1 なら上から近づく（jazzらしさの中心） */
      phrase: [
        [ { s: 0, c: 0, v: .85, l: '4n' }, { s: 4, c: 2, v: .60, l: '4n' },
          { s: 8, c: 1, v: .68, l: '4n' }, { s: 12, app: -1, v: .62, l: '4n' } ],
        [ { s: 0, c: 0, v: .85, l: '4n' }, { s: 4, c: 1, v: .60, l: '4n' },
          { s: 8, c: 2, v: .68, l: '4n' }, { s: 12, app:  1, v: .62, l: '4n' } ],
      ],
    },
    rhythm: {
      voice: 'drums', kit: 'acoustic-kit', gain: -9,
      /* ハイハットでライドのパターン（1・2・2裏・3・4・4裏）を刻む。
         キックは「フェザリング」で軽く、スネアは合いの手 */
      phrase: [
        [ { s: 0, p: 'h', v: .30 }, { s: 4, p: 'h', v: .24 }, { s: 7, p: 'h', v: .18 },
          { s: 8, p: 'h', v: .30 }, { s: 12, p: 'h', v: .24 }, { s: 15, p: 'h', v: .18 },
          { s: 0, p: 'k', v: .30 }, { s: 8, p: 'k', v: .28 },
          { s: 7, p: 's', v: .32 }, { s: 14, p: 's', v: .28 } ],
        [ { s: 0, p: 'h', v: .30 }, { s: 4, p: 'h', v: .24 }, { s: 7, p: 'h', v: .18 },
          { s: 8, p: 'h', v: .30 }, { s: 12, p: 'h', v: .24 }, { s: 15, p: 'h', v: .18 },
          { s: 0, p: 'k', v: .30 }, { s: 8, p: 'k', v: .28 },
          { s: 3, p: 's', v: .30 }, { s: 10, p: 's', v: .34 } ],
        [ { s: 0, p: 'h', v: .30 }, { s: 4, p: 'h', v: .24 }, { s: 7, p: 'h', v: .18 },
          { s: 8, p: 'h', v: .30 }, { s: 12, p: 'h', v: .24 }, { s: 15, p: 'h', v: .18 },
          { s: 0, p: 'k', v: .30 }, { s: 8, p: 'k', v: .28 },
          { s: 7, p: 's', v: .32 }, { s: 11, p: 's', v: .26 } ],
        [ { s: 0, p: 'h', v: .30 }, { s: 4, p: 'h', v: .24 },
          { s: 8, p: 'h', v: .26 },
          { s: 0, p: 'k', v: .30 }, { s: 8, p: 'k', v: .28 },
          { s: 3, p: 's', v: .34 }, { s: 7, p: 't', v: .40 },
          { s: 11, p: 's', v: .40 }, { s: 12, p: 't', v: .45 }, { s: 15, p: 's', v: .36 } ],
      ],
    },
    chord: {
      voice: 'piano', oct: 3, gain: -14, kindOfVoicing: 'rootless',
      /* ルートを抜いた七の和音を裏拍で置く（コンピング）。
         鳴らす場所を毎小節ずらして、同じ形が続かないようにしてある */
      phrase: [
        [ { s: 2,  v: .55, l: '8n'  }, { s: 7,  v: .42, l: '16n' }, { s: 10, v: .52, l: '8n' } ],
        [ { s: 0,  v: .50, l: '8n'  }, { s: 6,  v: .45, l: '16n' },
          { s: 11, v: .55, l: '8n'  }, { s: 14, v: .40, l: '16n' } ],
        [ { s: 3,  v: .52, l: '8n'  }, { s: 8,  v: .48, l: '8n'  }, { s: 15, v: .44, l: '16n' } ],
        [ { s: 0,  v: .48, l: '16n' }, { s: 4,  v: .50, l: '8n'  }, { s: 10, v: .55, l: '4n' } ],
      ],
    },
  },

  /* ───────────── CLASSICAL：伸びる音、4小節でひとつの物語 ───────────── */
  classical: {
    melody: {
      voice: 'violin', oct: 4, gain: -12,
      /* 4小節のフレーズ。登って（A→B）、下りて（C）、着地する（D） */
      phrase: [
        [ { s: 0, d: 2, v: .52, l: '2n' }, { s: 8,  d: 3, v: .46, l: '4n' },
          { s: 12, d: 4, v: .50, l: '4n' } ],
        [ { s: 0, d: 5, v: .58, l: '2n' }, { s: 8,  d: 4, v: .46, l: '2n' } ],
        [ { s: 0, d: 3, v: .48, l: '4n' }, { s: 4,  d: 2, v: .42, l: '4n' },
          { s: 8, d: 1, v: .50, l: '2n' } ],
        [ { s: 0, d: 0, v: .54, l: '1n' } ],
      ],
    },
    bass: {
      /* oct は 2 ではなく 3。チェロの最低音は C2 で、oct 2 にすると
         A♭ と B♭ の小節でその下（A♭1）を要求してしまうため。
         oct 3 なら C3→A♭2→E♭3→B♭2 とチェロの一番鳴る音域に収まる */
      voice: 'cello', oct: 3, gain: -7,
      /* 弓で伸ばす低音。2小節目は全音符にして呼吸を作る */
      phrase: [
        [ { s: 0, c: 0, v: .60, l: '2n' }, { s: 8, c: 2, v: .48, l: '2n' } ],
        [ { s: 0, c: 0, v: .58, l: '1n' } ],
      ],
    },
    rhythm: {
      voice: 'drums', kit: 'acoustic-kit', gain: -11,
      /* パーカッション＝ティンパニのつもり。タムを打点に置き、
         4小節目に細かい連打（ロール）で次の頭へ持っていく */
      phrase: [
        [ { s: 0, p: 't', v: .45 }, { s: 0, p: 'k', v: .35 } ],
        [ { s: 0, p: 't', v: .40 }, { s: 8, p: 't', v: .32 }, { s: 0, p: 'k', v: .30 } ],
        [ { s: 0, p: 't', v: .45 }, { s: 12, p: 'h', v: .12 }, { s: 14, p: 'h', v: .14 } ],
        [ { s: 0, p: 't', v: .40 },
          { s: 10, p: 't', v: .22 }, { s: 11, p: 't', v: .28 },
          { s: 12, p: 't', v: .34 }, { s: 13, p: 't', v: .40 },
          { s: 14, p: 't', v: .48 }, { s: 15, p: 't', v: .56 } ],
      ],
    },
    chord: {
      voice: 'piano', oct: 3, gain: -14, kindOfVoicing: 'triad',
      /* 3小節はアルベルティ・バス風の分散和音、4小節目だけ全部まとめて置く。
         n を指定すると和音の中の1音だけを鳴らせる */
      phrase: [
        [ { s: 0,  n: 0, v: .38, l: '8n' }, { s: 2,  n: 2, v: .30, l: '8n' },
          { s: 4,  n: 1, v: .34, l: '8n' }, { s: 6,  n: 2, v: .30, l: '8n' },
          { s: 8,  n: 0, v: .38, l: '8n' }, { s: 10, n: 2, v: .30, l: '8n' },
          { s: 12, n: 1, v: .34, l: '8n' }, { s: 14, n: 2, v: .30, l: '8n' } ],
        [ { s: 0,  n: 0, v: .38, l: '8n' }, { s: 2,  n: 2, v: .30, l: '8n' },
          { s: 4,  n: 1, v: .34, l: '8n' }, { s: 6,  n: 2, v: .30, l: '8n' },
          { s: 8,  n: 0, v: .38, l: '8n' }, { s: 10, n: 2, v: .30, l: '8n' },
          { s: 12, n: 1, v: .34, l: '8n' }, { s: 14, n: 2, v: .30, l: '8n' } ],
        [ { s: 0,  n: 2, v: .36, l: '8n' }, { s: 2,  n: 1, v: .30, l: '8n' },
          { s: 4,  n: 0, v: .34, l: '8n' }, { s: 6,  n: 1, v: .30, l: '8n' },
          { s: 8,  n: 2, v: .36, l: '8n' }, { s: 10, n: 1, v: .30, l: '8n' },
          { s: 12, n: 0, v: .34, l: '8n' }, { s: 14, n: 1, v: .30, l: '8n' } ],
        [ { s: 0,  v: .42, l: '1n' } ],
      ],
    },
  },

  /* ───────────── ELECTRONIC：16分、機械的、反復 ───────────── */
  electronic: {
    melody: {
      voice: 'synth-lead', oct: 5, gain: -15,
      /* 16分の分散アルペジオ。2小節目は途中を抜いて（ゲート）機械らしさを出す */
      phrase: [
        [ { s: 0,  d: 0, v: .80, l: '16n' }, { s: 1,  d: 2, v: .38, l: '16n' },
          { s: 2,  d: 4, v: .55, l: '16n' }, { s: 3,  d: 2, v: .38, l: '16n' },
          { s: 4,  d: 0, v: .74, l: '16n' }, { s: 5,  d: 3, v: .38, l: '16n' },
          { s: 6,  d: 5, v: .58, l: '16n' }, { s: 7,  d: 3, v: .38, l: '16n' },
          { s: 8,  d: 1, v: .80, l: '16n' }, { s: 9,  d: 3, v: .38, l: '16n' },
          { s: 10, d: 5, v: .55, l: '16n' }, { s: 11, d: 3, v: .38, l: '16n' },
          { s: 12, d: 2, v: .74, l: '16n' }, { s: 13, d: 4, v: .38, l: '16n' },
          { s: 14, d: 6, v: .58, l: '16n' }, { s: 15, d: 4, v: .42, l: '16n' } ],
        [ { s: 0,  d: 2, v: .80, l: '16n' }, { s: 1,  d: 4, v: .38, l: '16n' },
          { s: 2,  d: 6, v: .55, l: '16n' }, { s: 3,  d: 4, v: .38, l: '16n' },
          /* ここで4ステップぶん切る＝「抜け」を作る */
          { s: 8,  d: 1, v: .78, l: '16n' }, { s: 9,  d: 3, v: .38, l: '16n' },
          { s: 10, d: 5, v: .55, l: '16n' }, { s: 11, d: 3, v: .38, l: '16n' },
          { s: 12, d: 0, v: .74, l: '16n' }, { s: 13, d: 2, v: .40, l: '16n' },
          { s: 14, d: 4, v: .56, l: '16n' }, { s: 15, d: 2, v: .42, l: '16n' } ],
      ],
    },
    bass: {
      voice: 'synth-bass', oct: 2, gain: -6,
      /* キックの隙間を埋めて脈打つ（サイドチェイン的な聞こえ方） */
      phrase: [
        [ { s: 0,  c: 0, v: .92, l: '16n' }, { s: 2,  c: 0, v: .40, l: '16n' },
          { s: 3,  c: 0, v: .50, l: '16n' }, { s: 6,  c: 0, v: .60, l: '16n' },
          { s: 8,  c: 0, v: .90, l: '16n' }, { s: 10, c: 0, v: .40, l: '16n' },
          { s: 11, c: 0, v: .50, l: '16n' }, { s: 14, c: 2, v: .65, l: '16n' } ],
        [ { s: 0,  c: 0, v: .92, l: '16n' }, { s: 2,  c: 0, v: .40, l: '16n' },
          { s: 3,  c: 0, v: .50, l: '16n' }, { s: 6,  c: 0, v: .60, l: '16n' },
          { s: 8,  c: 0, v: .90, l: '16n' }, { s: 10, c: 3, v: .55, l: '16n' },
          { s: 12, c: 3, v: .70, l: '16n' }, { s: 14, c: 2, v: .60, l: '16n' } ],
      ],
    },
    rhythm: {
      voice: 'drums', kit: 'LINN', gain: -8,
      /* ドラムマシン。四つ打ち＋裏の16分ハット。4小節目は最後に連打 */
      phrase: [
        drumBar({ k: [0, 4, 8, 12], s: [4, 12], hOdd: true, hv: .28 }),
        drumBar({ k: [0, 4, 8, 12], s: [4, 12], hOdd: true, hv: .28 }),
        drumBar({ k: [0, 4, 8, 12], s: [4, 12], hOdd: true, hv: .28 }),
        [ { s: 0, p: 'k', v: .90 }, { s: 4, p: 'k', v: .85 }, { s: 8, p: 'k', v: .90 },
          { s: 4, p: 's', v: .55 }, { s: 12, p: 's', v: .60 },
          { s: 1, p: 'h', v: .26 }, { s: 3, p: 'h', v: .26 }, { s: 5, p: 'h', v: .26 },
          { s: 7, p: 'h', v: .26 }, { s: 9, p: 'h', v: .26 }, { s: 11, p: 'h', v: .26 },
          { s: 12, p: 'k', v: .70 }, { s: 13, p: 'k', v: .55 },
          { s: 14, p: 'k', v: .70 }, { s: 15, p: 'k', v: .85 } ],
      ],
    },
    chord: {
      voice: 'synth-pad', oct: 3, gain: -17, kindOfVoicing: 'pad',
      /* ゆっくり立ち上がって小節いっぱい伸びるパッド。反復の下敷きになる */
      phrase: [
        [ { s: 0, v: .34, l: '1n' } ],
      ],
    },
  },

  /* ───────────── POP：素直な8分、口ずさめる、開いたコード ───────────── */
  pop: {
    melody: {
      voice: 'piano', oct: 4, gain: -11,
      /* 2小節でひとまとまりの「歌」。同じ形を少し変えて繰り返す（覚えやすさ） */
      phrase: [
        [ { s: 0,  d: 2, v: .70, l: '8n' }, { s: 2,  d: 3, v: .58, l: '8n' },
          { s: 4,  d: 4, v: .76, l: '4n' }, { s: 8,  d: 3, v: .64, l: '8n' },
          { s: 10, d: 2, v: .58, l: '8n' }, { s: 12, d: 1, v: .70, l: '4n' } ],
        [ { s: 0,  d: 2, v: .70, l: '8n' }, { s: 2,  d: 4, v: .60, l: '8n' },
          { s: 4,  d: 5, v: .78, l: '2n' }, { s: 12, d: 4, v: .66, l: '4n' } ],
      ],
    },
    bass: {
      voice: 'bass-electric', oct: 2, gain: -5,
      /* 跳ねすぎない8分。頭と裏で支え、小節末で次へ受け渡す */
      phrase: [
        [ { s: 0,  c: 0, v: .85, l: '8n' }, { s: 6,  c: 0, v: .55, l: '8n' },
          { s: 8,  c: 0, v: .80, l: '8n' }, { s: 11, c: 2, v: .58, l: '8n' },
          { s: 14, c: 1, v: .60, l: '8n' } ],
        [ { s: 0,  c: 0, v: .85, l: '8n' }, { s: 6,  c: 0, v: .55, l: '8n' },
          { s: 8,  c: 3, v: .78, l: '8n' }, { s: 12, c: 2, v: .60, l: '8n' },
          { s: 14, c: 0, v: .62, l: '8n' } ],
      ],
    },
    rhythm: {
      voice: 'drums', kit: 'Kit3', gain: -8,
      /* 素直なエイトビート。3小節目だけキックを1つ足して単調さを避ける */
      phrase: [
        drumBar({ k: [0, 8], s: [4, 12], h8: true, hv: .26 }),
        drumBar({ k: [0, 8, 11], s: [4, 12], h8: true, hv: .26 }),
        drumBar({ k: [0, 8], s: [4, 12], h8: true, hv: .26 }),
        [ { s: 0, p: 'k', v: .85 }, { s: 8, p: 'k', v: .80 }, { s: 11, p: 'k', v: .60 },
          { s: 4, p: 's', v: .65 }, { s: 12, p: 's', v: .65 }, { s: 14, p: 's', v: .45 },
          { s: 0, p: 'h', v: .26 }, { s: 2, p: 'h', v: .20 }, { s: 4, p: 'h', v: .26 },
          { s: 6, p: 'h', v: .20 }, { s: 8, p: 'h', v: .26 }, { s: 10, p: 'h', v: .20 },
          { s: 15, p: 't', v: .55 } ],
      ],
    },
    chord: {
      voice: 'guitar-acoustic', oct: 3, gain: -13, kindOfVoicing: 'open', strum: 0.014,
      /* ギターのストローク。strum を入れてあるので弦が1本ずつ少しずれて鳴る。
         下向き（強く・広く）と上向き（弱く）を交互にした形 */
      phrase: [
        [ { s: 0,  v: .70, l: '4n' }, { s: 4,  v: .48, l: '8n' },
          { s: 6,  v: .42, l: '8n' }, { s: 8,  v: .66, l: '4n' },
          { s: 11, v: .46, l: '8n' }, { s: 14, v: .44, l: '8n' } ],
        [ { s: 0,  v: .70, l: '4n' }, { s: 3,  v: .40, l: '8n' },
          { s: 6,  v: .46, l: '8n' }, { s: 8,  v: .66, l: '4n' },
          { s: 10, v: .42, l: '8n' }, { s: 12, v: .52, l: '8n' },
          { s: 14, v: .44, l: '8n' } ],
      ],
    },
  },
};

/* ドラムの1小節を短く書くための補助。
   k/s はステップ番号の配列、h8＝8分でハット、hOdd＝裏の16分でハット */
function drumBar({ k = [], s = [], h8 = false, hOdd = false, hv = .28 }) {
  const out = [];
  k.forEach(x => out.push({ s: x, p: 'k', v: .88 }));
  s.forEach(x => out.push({ s: x, p: 's', v: .62 }));
  if (h8)   [0, 2, 4, 6, 8, 10, 12, 14].forEach(x => out.push({ s: x, p: 'h', v: x % 4 === 0 ? hv : hv * .7 }));
  if (hOdd) [1, 3, 5, 7, 9, 11, 13, 15].forEach(x => out.push({ s: x, p: 'h', v: hv }));
  return out;
}

/* ============ 6. 全体の設定 ============ */
const MAX_PARTS = 6;              // 同時に鳴らせるパート数
const RETRIGGER_GUARD_MS = 500;   // 同一カードの連続読み取りを無視する時間
const BASE_KIT = 'acoustic-kit';  // ずっと鳴っている基礎ビートのキット

function cardOf(id) {
  const [g, r] = id.split('-');
  return (CARDS[g] && CARDS[g][r]) ? CARDS[g][r] : null;
}
function labelOf(id) {
  const [g, r] = id.split('-');
  return `${GENRES[g].label}の${VOICES[CARDS[g][r].voice].label}`;
}

/* ============ 7. 音の出口（マスター） ============ */
let master, limiter, comp, partsBus, beatBus, reverb, recorder;

async function buildMaster() {
  limiter = new Tone.Limiter(-1).toDestination();
  /* 実録音は音の粒がばらつくので、まとめて軽く圧縮して座りを良くする */
  comp   = new Tone.Compressor({ threshold: -20, ratio: 3, attack: 0.006, release: 0.12 }).connect(limiter);
  master = new Tone.Gain(0.9).connect(comp);

  reverb = new Tone.Reverb({ decay: 2.6, preDelay: 0.02, wet: 1 }).connect(master);
  try { await reverb.generate(); } catch (e) { /* 生成に失敗しても音は出る */ }

  partsBus = new Tone.Gain(1).connect(master);
  beatBus  = new Tone.Gain(1).connect(master);
  try {
    recorder = new Tone.Recorder();
    master.connect(recorder);
  } catch (e) { recorder = null; }
}

/* ============ 8. 合成音のドラム（サンプルが無いときの予備） ============ */
function makeSynthKit(dest, level) {
  const out = new Tone.Gain(Tone.dbToGain(level)).connect(dest);
  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.045, octaves: 6,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.34, sustain: 0, release: 0.1 },
  }).connect(out);
  const snareFilt = new Tone.Filter(1800, 'bandpass').connect(out);
  const snare = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.14, sustain: 0 },
  }).connect(snareFilt);
  const hatFilt = new Tone.Filter(7500, 'highpass').connect(out);
  const hat = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.035, sustain: 0 },
  }).connect(hatFilt);
  const tom = new Tone.MembraneSynth({
    pitchDecay: 0.1, octaves: 3,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.1 },
  }).connect(out);
  return {
    sampled: false,
    nodes: [kick, snare, hat, tom, snareFilt, hatFilt, out],
    kick:  (t, v) => kick.triggerAttackRelease('C1', '8n', t, v),
    snare: (t, v) => snare.triggerAttackRelease('16n', t, v),
    hat:   (t, v) => hat.triggerAttackRelease('32n', t, v),
    tom:   (t, v) => tom.triggerAttackRelease('A1', '8n', t, v),
  };
}

/* ============ 9. 小節と拍の位置 ============
   v1 との違い：パターンの位置を「そのパートを始めた時刻」ではなく
   「曲全体の絶対時刻」から求める。こうすると小節の途中で投入しても
   パターンが小節頭から数え直され、他のパートと拍子が必ず揃う。      */
function posAt(time) {
  const ppq = Tone.Transport.PPQ;
  const ticks = (Tone.Transport.getTicksAtTime ? Tone.Transport.getTicksAtTime(time)
                                               : Tone.Transport.ticks) + 2;   // 誤差の吸収
  const total = Math.floor(ticks / (ppq / 4));    // 通算16分音符の数
  return { bar: Math.floor(total / 16), step: ((total % 16) + 16) % 16 };
}

/* ============ 10. パート（カード1枚ぶん） ============ */
class Part {
  constructor(genreKey, roleKey) {
    this.id = genreKey + '-' + roleKey;
    this.genreKey = genreKey;
    this.roleKey = roleKey;
    this.card = CARDS[genreKey][roleKey];
    this.role = ROLES[roleKey];
    this.vo = VOICES[this.card.voice];

    const gainDb = this.card.gain != null ? this.card.gain : this.role.gain;
    const hp = this.card.hp != null ? this.card.hp : this.role.hp;
    const lp = this.card.lp != null ? this.card.lp : this.role.lp;

    // 出口 → 帯域フィルタ → パート音量 → partsBus（＋残響へ少量）
    this.gain = new Tone.Gain(Tone.dbToGain(gainDb)).connect(partsBus);
    this.send = new Tone.Gain(this.role.send).connect(reverb);
    this.gain.connect(this.send);
    this.lp = new Tone.Filter(lp, 'lowpass').connect(this.gain);
    this.hp = new Tone.Filter(hp, 'highpass').connect(this.lp);

    if (this.vo.kind === 'kit') {
      this.kit = makeSampleKit(this.hp, this.card.kit, 0) || makeSynthKit(this.hp, 0);
      this.sampled = this.kit.sampled;
    } else {
      this.voice = this.makeVoice();
    }

    this.seq = new Tone.Sequence((time) => this.tick(time), range16(), '16n');
  }

  /* --- 音を作る。まず実録音を試し、無ければ合成音に落ちる --- */
  makeVoice() {
    if (this.vo.kind === 'sampler') {
      const smp = makeSampleVoice(this.vo.set, this.vo.env);
      if (smp) {
        this.sampled = true;
        this.connectVoice(smp);
        return smp;
      }
    }
    this.sampled = false;
    const syn = this.makeSynthVoice(this.vo.fb);
    return syn;
  }

  /* ギターだけ、カードに drive があれば軽く歪ませてから帯域フィルタへ送る */
  connectVoice(node) {
    if (this.card.drive > 0) {
      this.drive = new Tone.Distortion({ distortion: this.card.drive, wet: 0.4 }).connect(this.hp);
      node.connect(this.drive);
    } else {
      node.connect(this.hp);
    }
  }

  makeSynthVoice(fb) {
    let v;
    switch (fb) {
      case 'mono':      // ベースの予備
        v = new Tone.MonoSynth({
          oscillator: { type: 'sawtooth' },
          filter: { Q: 1.4, type: 'lowpass', rolloff: -24 },
          envelope: { attack: 0.008, decay: 0.22, sustain: 0.6, release: 0.22 },
          filterEnvelope: { attack: 0.008, decay: 0.2, sustain: 0.3, release: 0.25, baseFrequency: 140, octaves: 3.0 },
        });
        break;
      case 'sbass':     // シンセベース（常にこれ。エレクトロの土台）
        v = new Tone.MonoSynth({
          oscillator: { type: 'square' },
          filter: { Q: 3, type: 'lowpass', rolloff: -24 },
          envelope: { attack: 0.004, decay: 0.14, sustain: 0.35, release: 0.1 },
          filterEnvelope: { attack: 0.004, decay: 0.12, sustain: 0.2, release: 0.12, baseFrequency: 90, octaves: 3.4 },
        });
        break;
      case 'lead':      // シンセリード（常にこれ）
        v = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'square' },
          envelope: { attack: 0.004, decay: 0.12, sustain: 0.08, release: 0.16 },
        });
        break;
      case 'pad':       // シンセパッド（常にこれ）。ゆっくり開いて長く伸びる
        v = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'fatsawtooth', count: 3, spread: 30 },
          envelope: { attack: 0.7, decay: 0.4, sustain: 0.8, release: 1.6 },
        });
        break;
      case 'reed':      // サックスの予備
        v = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'fatsawtooth', count: 2, spread: 18 },
          envelope: { attack: 0.02, decay: 0.2, sustain: 0.4, release: 0.25 },
        });
        break;
      case 'bow':       // 弦楽器の予備
        v = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sawtooth' },
          envelope: { attack: 0.16, decay: 0.3, sustain: 0.7, release: 0.7 },
        });
        break;
      case 'pluck': {   // ギターの予備
        const g = new Tone.PluckSynth({ attackNoise: 1.2, dampening: 3800, resonance: 0.95 });
        this.drive = new Tone.Distortion({ distortion: 0.38, wet: 0.5 }).connect(this.hp);
        g.connect(this.drive);
        return g;
      }
      default:          // ピアノの予備
        v = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.004, decay: 0.5, sustain: 0.12, release: 1.1 },
        });
    }
    this.connectVoice(v);
    return v;
  }

  /* --- 16分音符ごとに呼ばれる。ここで役割ごとの弾き方が決まる --- */
  tick(time) {
    const { bar, step } = posAt(time);
    const phrase = this.card.phrase;
    const events = phrase[bar % phrase.length].filter(e => e.s === step);
    if (!events.length) return;
    const ch = chordAt(bar);

    events.forEach(e => {
      switch (this.roleKey) {
        case 'melody': this.playMelody(e, time); break;
        case 'bass':   this.playBass(e, time, ch, bar); break;
        case 'chord':  this.playChord(e, time, ch); break;
        case 'rhythm': this.playDrum(e, time); break;
      }
    });
  }

  playMelody(e, time) {
    const note = noteName(pentaSemi(e.d), this.card.oct);
    /* 合成音のギター（PluckSynth）だけは長さを指定できない */
    if (!this.sampled && this.vo.fb === 'pluck') this.voice.triggerAttack(note, time);
    else this.voice.triggerAttackRelease(note, e.l, time, e.v);
    this.flash(time, e.v);
  }

  playBass(e, time, ch, bar) {
    let semi;
    if (e.app != null) {
      /* 次の小節のコードのルートへ、半音上／半音下から寄せる（ウォーキング） */
      semi = chordAt(bar + 1).root + e.app;
    } else {
      semi = bassSemi(ch, e.c);
    }
    const note = noteName(semi, this.card.oct);
    if (!this.sampled && this.vo.fb === 'pluck') this.voice.triggerAttack(note, time);
    else this.voice.triggerAttackRelease(note, e.l, time, e.v);
    this.flash(time, e.v);
  }

  playChord(e, time, ch) {
    const semis = voicing(this.card.kindOfVoicing, ch);
    /* n が指定されていればその1音だけ（分散和音）、無ければ和音全部 */
    const picks = (e.n != null) ? [semis[e.n % semis.length]] : semis;
    const strum = this.card.strum || 0;   // ストロークの弦のずれ（秒）
    picks.forEach((semi, i) => {
      const note = noteName(semi, this.card.oct);
      const t = time + i * strum;
      if (!this.sampled && this.vo.fb === 'pluck') this.voice.triggerAttack(note, t);
      else this.voice.triggerAttackRelease(note, e.l, t, e.v);
    });
    this.flash(time, e.v);
  }

  playDrum(e, time) {
    const fn = { k: 'kick', s: 'snare', h: 'hat', t: 'tom' }[e.p];
    const f = this.kit[fn] || this.kit.snare;   // タムが無いキットはスネアで代用
    f(time, e.v);
    if (e.p !== 'h') this.flash(time, e.v);
  }

  flash(time, v) {
    Tone.Draw.schedule(() => UI.flashCell(this.id, v), time);
  }

  start(ticks) { this.seq.start(ticks + 'i'); }

  fadeOutAndDispose(sec = 1.2) {
    try { this.gain.gain.rampTo(0, sec); } catch (e) {}
    setTimeout(() => this.dispose(), sec * 1000 + 120);
  }

  dispose() {
    try { this.seq.stop(); this.seq.dispose(); } catch (e) {}
    const nodes = [this.voice, this.drive, ...(this.kit ? this.kit.nodes : []),
                   this.hp, this.lp, this.send, this.gain];
    nodes.forEach(n => { try { n && n.dispose(); } catch (e) {} });
  }
}
function range16() { return [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]; }

/* ============ 11. 基礎ビート（常に鳴り続ける） ============
   v2 では RHYTHM カードが5種類あるので、基礎ビートは
   「拍が分かる最低限」まで削ってある（キックと軽いハットだけ）。 */
let baseKit, baseSeq;

function startBaseBeat() {
  baseKit = makeSampleKit(beatBus, BASE_KIT, -11) || makeSynthKit(beatBus, -10);
  baseSeq = new Tone.Sequence((time) => {
    const { step } = posAt(time);
    if (step === 0 || step === 8) baseKit.kick(time, 0.75);
    if (step % 4 === 0) baseKit.hat(time, step === 0 ? 0.16 : 0.10);
  }, range16(), '16n').start(0);
}

/* ============ 12. 進行管理 ============ */
const State = {
  playing: false, paused: false,
  quantize: 'beat',       // 'beat' | 'bar'
  durationSec: 180,
  elapsed: 0,
  parts: new Map(),       // id -> Part
  order: [],              // 投入順（古い順）
  lastInput: new Map(),   // id -> 時刻（連続読みガード）
  pending: new Set(),
};

function nextBoundaryTicks() {
  const ppq = Tone.Transport.PPQ;
  const q = State.quantize === 'bar' ? ppq * 4 : ppq;
  const cur = Tone.Transport.ticks;
  const lead = Math.max(2, Math.round(ppq * 0.08));   // 直前すぎる予約を避ける
  return Math.ceil((cur + lead) / q) * q;
}

/* --- カード投入。Phase 1（RFID）でもここを呼ぶだけでよい --- */
function insertCard(cardId) {
  if (!State.playing || State.paused) return;
  if (!cardOf(cardId)) return;

  const now = performance.now();
  const last = State.lastInput.get(cardId) || 0;
  if (now - last < RETRIGGER_GUARD_MS) return;      // 二重読みガード
  State.lastInput.set(cardId, now);

  if (State.parts.has(cardId)) {
    UI.reject(cardId);
    UI.toast('その音はもう鳴っています');
    return;
  }

  // 上限を超えたら一番古い音を引っ込める
  while (State.order.length >= MAX_PARTS) {
    const oldest = State.order.shift();
    const p = State.parts.get(oldest);
    if (p) { p.fadeOutAndDispose(1.4); State.parts.delete(oldest); }
    State.pending.delete(oldest);
    UI.setCell(oldest, '');
    UI.toast(`${labelOf(oldest)} が抜けました（同時${MAX_PARTS}パートまで）`);
  }

  const [genreKey, roleKey] = cardId.split('-');
  const part = new Part(genreKey, roleKey);
  const ticks = nextBoundaryTicks();
  part.start(ticks);

  State.parts.set(cardId, part);
  State.order.push(cardId);
  State.pending.add(cardId);
  UI.setCell(cardId, 'pending');
  UI.refreshNow();
  UI.time();
  duckByCount();

  Tone.Transport.scheduleOnce((t) => {
    Tone.Draw.schedule(() => {
      if (!State.pending.has(cardId)) return;   // 待っている間に抜かれていたら何もしない
      State.pending.delete(cardId);
      UI.setCell(cardId, 'active');
    }, t);
  }, ticks + 'i');
}

function removeCard(cardId) {
  const p = State.parts.get(cardId);
  if (!p) return;
  p.fadeOutAndDispose(0.9);
  State.parts.delete(cardId);
  State.pending.delete(cardId);
  State.order = State.order.filter(x => x !== cardId);
  UI.setCell(cardId, '');
  UI.refreshNow();
  UI.time();
  duckByCount();
}

/* パートが増えるほど1つあたりを下げ、全体音量を一定に保つ */
function duckByCount() {
  const n = Math.max(1, State.parts.size);
  partsBus.gain.rampTo(1 / Math.sqrt(n), 0.4);
}

/* ============ 13. 開始・停止 ============ */
async function startGame(bpm) {
  await Tone.start();
  await buildMaster();
  Tone.Transport.bpm.value = bpm;
  Tone.Transport.timeSignature = 4;

  startBaseBeat();

  // 拍のインジケータとコード名の表示
  Tone.Transport.scheduleRepeat((time) => {
    const { bar, step } = posAt(time);
    Tone.Draw.schedule(() => {
      UI.beat(Math.floor(step / 4));
      UI.chord(chordAt(bar).name, bar);
    }, time);
  }, '4n', 0);

  // 残り時間
  Tone.Transport.scheduleRepeat((time) => {
    Tone.Draw.schedule(() => {
      State.elapsed++;
      UI.time();
      if (State.durationSec > 0 && State.elapsed >= State.durationSec) endGame();
    }, time);
  }, 1, 0);

  Tone.Transport.start('+0.1');
  if (recorder) { try { recorder.start(); } catch (e) {} }
  State.playing = true;
  State.paused = false;
}

async function endGame() {
  if (!State.playing) return;
  State.playing = false;

  // 余韻を残して止める
  master.gain.rampTo(0, 3.5);
  setTimeout(async () => {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    State.parts.forEach(p => p.dispose());
    State.parts.clear(); State.order = []; State.pending.clear();
    try { baseSeq.stop(); baseSeq.dispose(); baseKit.nodes.forEach(n => n.dispose()); } catch (e) {}

    let url = null;
    if (recorder && recorder.state === 'started') {
      try {
        const blob = await recorder.stop();
        url = URL.createObjectURL(blob);
      } catch (e) { url = null; }
    }
    UI.showFinish(url);
  }, 3600);
}

/* ============ 14. 画面 ============ */
const UI = {
  cells: {},
  init() {
    const grid = document.getElementById('grid');
    grid.innerHTML = '';

    // 左上の空きマス＋ジャンル見出し（列）
    grid.appendChild(el('div', 'head-cell', ''));
    GENRE_ORDER.forEach(gk => {
      const h = el('div', 'head-cell', '');
      h.style.setProperty('--g', `var(--${gk})`);
      h.innerHTML = `<b>${GENRES[gk].label}</b><small>${GENRES[gk].desc}</small>`;
      grid.appendChild(h);
    });

    // 役割ごとに1行
    ROLE_ORDER.forEach(rk => {
      const role = ROLES[rk];
      const lab = el('div', 'role-label', '');
      lab.innerHTML = `<b>${role.label}</b><span>${role.jp}</span><small>${role.desc}</small>`;
      grid.appendChild(lab);

      GENRE_ORDER.forEach((gk, ci) => {
        const id = gk + '-' + rk;
        const card = CARDS[gk][rk];
        const c = el('div', 'cell', '');
        c.style.setProperty('--g', `var(--${gk})`);
        c.style.setProperty('--ga', `var(--${gk}-a)`);
        c.innerHTML = `<div class="key">${role.keys[ci].toUpperCase()}</div>
                       <div class="name">${VOICES[card.voice].label}</div>
                       <div class="src"></div>
                       <div class="bar"></div>`;
        c.addEventListener('click', () => insertCard(id));
        grid.appendChild(c);
        UI.cells[id] = c;
      });
    });
    UI.time();
  },

  /* 各マスに「実録音」か「合成音」かを表示する */
  markSources() {
    GENRE_ORDER.forEach(gk => ROLE_ORDER.forEach(rk => {
      const c = UI.cells[gk + '-' + rk]; if (!c) return;
      const card = CARDS[gk][rk];
      const vo = VOICES[card.voice];
      let real = false;
      if (vo.kind === 'kit') real = !!kitUrls(card.kit);
      else if (vo.kind === 'sampler') real = !!samplerUrls(vo.set);
      const s = c.querySelector('.src');
      s.textContent = real ? '実録音' : '合成音';
      s.className = 'src' + (real ? ' real' : '');
    }));
  },

  setCell(id, cls) {
    const c = UI.cells[id]; if (!c) return;
    c.classList.remove('pending', 'active');
    if (cls) c.classList.add(cls);
  },
  reject(id) {
    const c = UI.cells[id]; if (!c) return;
    c.classList.remove('reject'); void c.offsetWidth; c.classList.add('reject');
  },
  flashCell(id, v) {
    const c = UI.cells[id]; if (!c) return;
    const bar = c.querySelector('.bar');
    bar.style.transition = 'none'; bar.style.width = Math.round(v * 100) + '%';
    requestAnimationFrame(() => { bar.style.transition = 'width .28s ease-out'; bar.style.width = '0%'; });
  },
  beat(i) {
    document.querySelectorAll('#beats .beat').forEach((b, j) => {
      b.classList.toggle('on', j === i);
      b.classList.toggle('down', j === i && i === 0);
    });
  },
  /* いま何のコードかを出す。進行が見えると「合っている」ことが分かる */
  chord(name, bar) {
    const c = document.getElementById('chordnow');
    if (c) c.textContent = name;
    document.querySelectorAll('#progdots i').forEach((d, j) => {
      d.classList.toggle('on', j === ((bar % 4) + 4) % 4);
    });
  },
  time() {
    const left = State.durationSec > 0 ? Math.max(0, State.durationSec - State.elapsed) : State.elapsed;
    const m = Math.floor(left / 60), s = left % 60;
    document.getElementById('timeleft').textContent = `${m}:${String(s).padStart(2, '0')}`;
    document.getElementById('partcount').textContent = State.parts.size;
    const pct = State.durationSec > 0 ? (State.elapsed / State.durationSec) * 100 : 0;
    document.querySelector('#progress > div').style.width = Math.min(100, pct) + '%';
  },
  refreshNow() {
    const box = document.getElementById('nowlist');
    box.innerHTML = '';
    if (State.order.length === 0) {
      box.innerHTML = '<div class="empty">まだ基礎ビートだけです。キーを押して音を重ねてください。</div>';
      return;
    }
    State.order.forEach(id => {
      const [g, r] = id.split('-');
      const p = el('div', 'pill', '');
      p.style.setProperty('--g', `var(--${g})`);
      p.style.setProperty('--ga', `var(--${g}-a)`);
      p.innerHTML = `<span><em>${ROLES[r].label}</em>${labelOf(id)}</span>`;
      const b = el('button', '', '×');
      b.title = 'この音を止める';
      b.addEventListener('click', () => removeCard(id));
      p.appendChild(b);
      box.appendChild(p);
    });
  },
  toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(UI._tt);
    UI._tt = setTimeout(() => t.classList.remove('show'), 1800);
  },
  showFinish(url) {
    const f = document.getElementById('finish');
    const audio = document.getElementById('playback');
    const dl = document.getElementById('dl');
    if (url) {
      audio.src = url; audio.style.display = '';
      dl.href = url; dl.style.display = '';
      document.getElementById('finishmsg').innerHTML =
        'みんなで聴いてみましょう。<br>「ここ良かったね」を言い合うところまでが体験です。';
    } else {
      audio.style.display = 'none'; dl.style.display = 'none';
      document.getElementById('finishmsg').textContent =
        'おつかれさまでした。感想を共有しましょう。（このブラウザでは録音を保存できませんでした）';
    }
    f.classList.add('show');
  },
};
function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt) e.textContent = txt;
  return e;
}

/* ============ 15. キーボード入力（＝カードの代わり） ============ */
const KEYMAP = {};
ROLE_ORDER.forEach(rk => {
  ROLES[rk].keys.forEach((k, i) => { KEYMAP[k] = GENRE_ORDER[i] + '-' + rk; });
});

/* Phase 1 用：HIDリーダーが打ち込むUIDを拾うバッファ */
let uidBuf = '', uidTimer = null;

document.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.key === 'Escape') { endGame(); return; }
  if (e.key === 'Backspace') {
    e.preventDefault();
    const last = State.order[State.order.length - 1];
    if (last) removeCard(last);
    return;
  }
  if (e.key === 'Enter') {          // HIDリーダーは末尾にEnterを打つ
    if (uidBuf.length >= 6 && CARD_MAP[uidBuf]) insertCard(CARD_MAP[uidBuf]);
    uidBuf = '';
    return;
  }
  if (/^[0-9]$/.test(e.key)) {      // UIDらしき連続入力を蓄積（Phase 1で効く）
    uidBuf += e.key;
    clearTimeout(uidTimer);
    uidTimer = setTimeout(() => { uidBuf = ''; }, 400);
  }
  const id = KEYMAP[e.key.toLowerCase()];
  if (id) { e.preventDefault(); insertCard(id); }
});

/* ============ 16. 起動時：音源の読み込み ============ */
async function bootSamples() {
  const bar = document.querySelector('#loadbar > div');
  const msg = document.getElementById('loadmsg');
  const btn = document.getElementById('startbtn');

  if (location.protocol === 'file:') {
    msg.innerHTML = '<b>「はじめる.bat」から開いてください。</b><br>'
      + 'ファイルを直接開くと、ブラウザの制限で音源を読み込めません（全パートが合成音になります）。';
    document.getElementById('loadbar').style.display = 'none';
    btn.disabled = false; btn.textContent = 'このまま合成音ではじめる';
    return;
  }

  btn.disabled = true;
  const res = await preloadSamples((done, total) => {
    if (total === 0) return;
    bar.style.width = (done / total * 100) + '%';
    msg.textContent = `本格音源を読み込んでいます… ${done} / ${total}`;
  });

  UI.markSources();
  document.getElementById('loadbar').style.display = 'none';
  btn.disabled = false;

  if (res.loaded === 0) {
    msg.innerHTML = '<b>音源が見つかりませんでした。</b><br>'
      + '「音源をダウンロード.bat」を先に1度だけ実行してください。<br>'
      + 'このまま始めた場合は、全パートが合成音になります。';
    btn.textContent = 'このまま合成音ではじめる';
  } else {
    msg.innerHTML = `本格音源 ${res.loaded} 個を読み込みました。`
      + '<br>シンセ3種だけが<b>合成音</b>で、あとはすべて<b>実録音</b>です。';
  }
}

/* ============ 17. 画面まわりの配線 ============ */
document.addEventListener('DOMContentLoaded', () => {
  UI.init();
  bootSamples();

  const bpm = document.getElementById('bpm');
  const bpmv = document.getElementById('bpmv');
  bpm.addEventListener('input', () => { bpmv.textContent = bpm.value; });

  document.querySelectorAll('#durchips .chip').forEach(c => {
    c.addEventListener('click', () => {
      document.querySelectorAll('#durchips .chip').forEach(x => x.setAttribute('aria-pressed', 'false'));
      c.setAttribute('aria-pressed', 'true');
      State.durationSec = Number(c.dataset.sec);
      State.elapsed = 0; UI.time();
    });
  });
  document.querySelectorAll('#quantchips .chip').forEach(c => {
    c.addEventListener('click', () => {
      document.querySelectorAll('#quantchips .chip').forEach(x => x.setAttribute('aria-pressed', 'false'));
      c.setAttribute('aria-pressed', 'true');
      State.quantize = c.dataset.q;
    });
  });

  document.getElementById('startbtn').addEventListener('click', async () => {
    const v = Number(bpm.value);
    document.getElementById('bpmshow').textContent = v;
    document.getElementById('setup').classList.add('hidden');
    State.elapsed = 0; UI.time();
    await startGame(v);
  });

  document.getElementById('pausebtn').addEventListener('click', (e) => {
    if (!State.playing) return;
    State.paused = !State.paused;
    if (State.paused) { Tone.Transport.pause(); e.target.textContent = '再開'; }
    else { Tone.Transport.start(); e.target.textContent = '一時停止'; }
  });
  document.getElementById('stopbtn').addEventListener('click', () => endGame());
  document.getElementById('againbtn').addEventListener('click', () => location.reload());
});

/* Phase 1 で使う入口を外に出しておく */
window.insertCard = insertCard;
