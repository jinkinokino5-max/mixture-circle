/* =====================================================================
   mixer.js — 各カードの音量を「鳴らしながら」決めるための画面（v11）
   ---------------------------------------------------------------------
   何のためにあるか
     music.js の WORLDS には、札1枚ぶんの楽器の gain が世界ごとに手で
     書いてある。だが「実際に重ねて聴いたときの釣り合い」は、
     数字を書き換えて → 保存して → 読み直して、では決まらない。
     ここは **鳴っている音をそのまま動かして、決まった値をファイルに
     書き出す** ための道具。

   使いかた（本編が始まっている状態で）
     1. M キー、または右上の「ミキサー」を押す
     2. 札の名前を押すとその札が鳴る／止まる（もう一度押すと止まる）
     3. スライダーを動かす → その場で音量が変わる
     4. S＝ソロ（その札だけ聴く）／M＝ミュート（その札だけ消す）
     5. 決まったら「保存する」→ card-gain.js に書き込まれる

   2段構え
     共通         … 全部の世界に効く基本値
     この世界だけ … いまの世界にだけ足される上乗せ
     実際に効く値 ＝ 共通 ＋ この世界だけ
     （楽器は世界ごとに違うので、たいていは「この世界だけ」を触る）

   保存の行き先
     ・スライダーを動かした時点で localStorage に入る（再読み込みしても残る）
     ・「保存する」で card-gain.js に書き出す。こちらが本番の値で、
       localStorage を消しても効く。
       （node の server.js 経由のときだけ直接書ける。python の
         http.server で開いているときはファイルのダウンロードになる）
   ===================================================================== */

const MIXER_BEAT = '_beat';           // 土台のビート（札ではないが同じ仕組みで扱う）
const MIXER_MIN = -24, MIXER_MAX = 12, MIXER_STEP = 0.5;
const MIXER_LS = 'mixture-v11-card-gain';
const MIXER_MUTE_DB = -60;            // ソロ／ミュートで落とす量（実質無音）

const Mixer = {
  open: false,
  scope: 'world',                     // 'world'（この世界だけ）／'shared'（共通）
  solo: new Set(),
  mute: new Set(),
  data: { shared: {}, worlds: {} },
  dirty: false,                       // card-gain.js に書き出していない変更があるか
  root: null,
  rows: {},

  /* ---------- 値の読み書き ---------- */

  worldKey() { return (typeof World !== 'undefined' && World.key) ? World.key : 'base'; },

  load() {
    const file = window.CARD_GAIN || {};
    this.data = { shared: Object.assign({}, file.shared || {}), worlds: {} };
    Object.keys(file.worlds || {}).forEach(w => {
      this.data.worlds[w] = Object.assign({}, file.worlds[w]);
    });

    /* 作業中の値（localStorage）があればそれを優先する。
       card-gain.js に書き出す前に画面を閉じても消えないようにするため */
    try {
      const raw = localStorage.getItem(MIXER_LS);
      if (raw) {
        const w = JSON.parse(raw);
        if (w && w.shared) this.data.shared = w.shared;
        if (w && w.worlds) this.data.worlds = w.worlds;
        this.dirty = true;
      }
    } catch (e) {}
  },

  worldTable(w) {
    const k = w || this.worldKey();
    if (!this.data.worlds[k]) this.data.worlds[k] = {};
    return this.data.worlds[k];
  },

  sharedOf(id) { return Number(this.data.shared[id] || 0); },
  worldOf(id)  { return Number(this.worldTable()[id] || 0); },
  /* 保存される値の合計（ソロ／ミュートは含めない） */
  total(id)    { return this.sharedOf(id) + this.worldOf(id); },

  /* 実際に音へ掛ける値。ソロ／ミュートはその場かぎりの試聴用なので保存しない */
  effective(id) {
    if (this.mute.has(id)) return MIXER_MUTE_DB;
    if (this.solo.size && !this.solo.has(id)) return MIXER_MUTE_DB;
    return this.total(id);
  },

  set(id, db) {
    const v = Math.max(MIXER_MIN, Math.min(MIXER_MAX, Math.round(db / MIXER_STEP) * MIXER_STEP));
    if (this.scope === 'shared') {
      if (v === 0) delete this.data.shared[id]; else this.data.shared[id] = v;
    } else {
      const t = this.worldTable();
      if (v === 0) delete t[id]; else t[id] = v;
    }
    this.stash();
    this.applyOne(id);
    this.refreshRow(id);
  },

  reset(id) {
    delete this.data.shared[id];
    delete this.worldTable()[id];
    this.stash();
    this.applyOne(id);
    this.refreshRow(id);
  },

  stash() {
    this.dirty = true;
    try { localStorage.setItem(MIXER_LS, JSON.stringify(this.data)); } catch (e) {}
    this.status();
  },

  /* ---------- 音へ反映する ---------- */

  applyOne(id) {
    if (id === MIXER_BEAT) {
      if (typeof BaseBeat !== 'undefined' && BaseBeat.setOffset) BaseBeat.setOffset(this.effective(id));
      return;
    }
    const p = (typeof State !== 'undefined') ? State.parts.get(id) : null;
    if (p && p.setOffset) p.setOffset(this.effective(id));
  },

  applyAll() { MIXER_IDS.forEach(id => this.applyOne(id)); },

  /* ---------- 画面 ---------- */

  build() {
    const r = document.getElementById('mixer');
    if (!r) return;
    this.root = r;
    r.innerHTML = ''
      + '<div class="mx-head">'
      +   '<h2>ミキサー — 札ごとの音量</h2>'
      +   '<p>札の名前を押すと鳴らす／止める。スライダーはその場で音に効きます。'
      +      '決まったら「保存する」で <b>card-gain.js</b> に書き出してください。</p>'
      +   '<button class="mx-close" type="button">閉じる（M）</button>'
      + '</div>'
      + '<div class="mx-scope">'
      +   '<span class="lab">いま調整している世界</span>'
      +   '<span class="now" id="mx-world">標準</span>'
      +   '<div class="mx-tabs">'
      +     '<button type="button" data-scope="world">この世界だけ</button>'
      +     '<button type="button" data-scope="shared">共通（全世界）</button>'
      +   '</div>'
      + '</div>'
      + '<div class="mx-opts">'
      +   '<label><input type="checkbox" id="mx-nolimit">同時枚数の上限を外す（調整用）</label>'
      + '</div>'
      + '<div class="mx-body" id="mx-body"></div>'
      + '<div class="mx-foot">'
      +   '<button type="button" class="primary" id="mx-save">保存する（card-gain.js）</button>'
      +   '<button type="button" id="mx-code">コードを見る</button>'
      +   '<button type="button" id="mx-clearsolo">ソロ／ミュート解除</button>'
      +   '<button type="button" id="mx-resetworld">この世界を全部 0 に</button>'
      +   '<div class="mx-status" id="mx-status"></div>'
      +   '<textarea id="mx-text" spellcheck="false" readonly></textarea>'
      + '</div>';

    const body = r.querySelector('#mx-body');

    /* 先頭に土台のビート。札が0枚のときも鳴っているので、
       ここの大きさが全体の印象を決める                              */
    body.appendChild(this.groupHead('土台のビート', '札が0枚でも鳴っているドラム'));
    body.appendChild(this.rowFor(MIXER_BEAT));

    ROLE_ORDER.forEach(rk => {
      const role = ROLES[rk];
      body.appendChild(this.groupHead(role.label + '　' + role.jp, role.desc));
      CHAR_ORDER.forEach(ck => body.appendChild(this.rowFor(ck + '-' + rk)));
    });

    r.querySelector('.mx-close').addEventListener('click', () => this.hide());
    r.querySelectorAll('.mx-tabs button').forEach(b => {
      b.addEventListener('click', () => { this.scope = b.dataset.scope; this.refresh(); });
    });
    r.querySelector('#mx-nolimit').addEventListener('change', (e) => {
      if (e.target.checked) { this._savedMax = State.maxParts; State.maxParts = Infinity; }
      else { State.maxParts = this._savedMax || 6; }
      document.getElementById('maxshow').textContent =
        Number.isFinite(State.maxParts) ? State.maxParts : '∞';
      UI.energy();
    });
    r.querySelector('#mx-save').addEventListener('click', () => this.saveFile());
    r.querySelector('#mx-code').addEventListener('click', () => {
      const t = r.querySelector('#mx-text');
      t.value = this.exportText();
      t.classList.toggle('show');
      if (t.classList.contains('show')) t.select();
    });
    r.querySelector('#mx-clearsolo').addEventListener('click', () => {
      this.solo.clear(); this.mute.clear(); this.applyAll(); this.refresh();
    });
    r.querySelector('#mx-resetworld').addEventListener('click', () => {
      this.data.worlds[this.worldKey()] = {};
      this.stash(); this.applyAll(); this.refresh();
    });

    this.refresh();
  },

  groupHead(title, sub) {
    const d = document.createElement('div');
    d.className = 'mx-group';
    d.innerHTML = '<b></b><small></small>';
    d.querySelector('b').textContent = title;
    d.querySelector('small').textContent = sub;
    return d;
  },

  rowFor(id) {
    const row = document.createElement('div');
    row.className = 'mx-row';
    let name, sub = '';
    if (id === MIXER_BEAT) {
      name = '土台のビート';
      row.style.setProperty('--g', '#4a5468');
    } else {
      const [ck, rk] = id.split('-');
      name = CHARACTERS[ck].label + 'の' + ROLES[rk].jp;
      sub = HOOKS[ck][rk];
      row.style.setProperty('--g', 'var(--ch-' + ck + ')');
    }
    row.innerHTML = ''
      + '<div class="mx-name"><button type="button"><b></b><small></small></button></div>'
      + '<div class="mx-sm">'
      +   '<button type="button" class="s" title="この札だけ聴く（ソロ）">S</button>'
      +   '<button type="button" class="m" title="この札だけ消す（ミュート）">M</button>'
      + '</div>'
      + '<input type="range" min="' + MIXER_MIN + '" max="' + MIXER_MAX + '" step="' + MIXER_STEP + '" value="0">'
      + '<div class="mx-val"><b>0.0</b><small></small></div>'
      + '<button type="button" class="mx-reset" title="0 に戻す">↺</button>';
    row.querySelector('.mx-name b').textContent = name;
    row.querySelector('.mx-name small').textContent = sub;

    const range = row.querySelector('input');
    range.addEventListener('input', () => this.set(id, Number(range.value)));
    /* スライダーの上でホイールを回すと 0.5dB ずつ動く（細かく詰めるとき用） */
    range.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.set(id, this.scopeValue(id) + (e.deltaY < 0 ? MIXER_STEP : -MIXER_STEP));
    }, { passive: false });

    row.querySelector('.mx-name button').addEventListener('click', () => {
      if (id === MIXER_BEAT) { UI.toast('土台のビートは常に鳴っています'); return; }
      if (!State.playing) { UI.toast('先に「はじめる」を押してください'); return; }
      insertCard(id);
      setTimeout(() => this.refresh(), 60);
    });
    row.querySelector('.s').addEventListener('click', () => {
      if (this.solo.has(id)) this.solo.delete(id); else this.solo.add(id);
      this.applyAll(); this.refresh();
    });
    row.querySelector('.m').addEventListener('click', () => {
      if (this.mute.has(id)) this.mute.delete(id); else this.mute.add(id);
      this.applyAll(); this.refresh();
    });
    row.querySelector('.mx-reset').addEventListener('click', () => this.reset(id));

    this.rows[id] = row;
    return row;
  },

  /* いま触っているタブ側の値（スライダーが表す値） */
  scopeValue(id) { return this.scope === 'shared' ? this.sharedOf(id) : this.worldOf(id); },

  refreshRow(id) {
    const row = this.rows[id]; if (!row) return;
    const cur = this.scopeValue(id), tot = this.total(id);
    row.querySelector('input').value = cur;
    const v = row.querySelector('.mx-val');
    v.querySelector('b').textContent = (cur > 0 ? '+' : '') + cur.toFixed(1);
    /* 合計が別の値になるときだけ、下に小さく「計」を出す */
    v.querySelector('small').textContent =
      (Math.abs(tot - cur) > 0.001) ? ('計' + (tot > 0 ? '+' : '') + tot.toFixed(1)) : '';
    v.classList.toggle('changed', Math.abs(cur) > 0.001);

    const playing = (id === MIXER_BEAT) || (typeof State !== 'undefined' && State.parts.has(id));
    row.classList.toggle('playing', playing);
    row.classList.toggle('off', !playing);
    row.querySelector('.s').classList.toggle('on', this.solo.has(id));
    row.querySelector('.m').classList.toggle('mon', this.mute.has(id));

    /* いまの世界での楽器名を出す（世界が変わると中身が入れ替わる） */
    if (id !== MIXER_BEAT) {
      const [ck, rk] = id.split('-');
      const names = World.layersFor(ck, rk)
        .map(sp => VOICES[sp.voice] && VOICES[sp.voice].label)
        .filter(Boolean).join(' ＋ ');
      row.querySelector('.mx-name small').textContent = names || HOOKS[ck][rk];
    }
  },

  refresh() {
    if (!this.root) return;
    this.root.querySelector('#mx-world').textContent = World.label();
    this.root.querySelectorAll('.mx-tabs button').forEach(b => {
      b.classList.toggle('on', b.dataset.scope === this.scope);
    });
    MIXER_IDS.forEach(id => this.refreshRow(id));
    this.status();
  },

  status() {
    const s = this.root && this.root.querySelector('#mx-status');
    if (!s) return;
    const n = Object.keys(this.data.shared).length
            + Object.values(this.data.worlds).reduce((a, t) => a + Object.keys(t).length, 0);
    s.innerHTML = this.dirty
      ? '<b style="color:#ffd166">未保存の変更があります</b>（' + n + '件・この端末には残っています）。'
        + '「保存する」を押すと card-gain.js に書き込まれ、次からは全員に効きます。'
      : 'card-gain.js の値をそのまま使っています（' + n + '件）。';
  },

  show() {
    if (!this.root) this.build();
    this.open = true;
    this.root.classList.add('show');
    const b = document.getElementById('mixbtn'); if (b) b.classList.add('on');
    this.refresh();
  },
  hide() {
    this.open = false;
    if (this.root) this.root.classList.remove('show');
    const b = document.getElementById('mixbtn'); if (b) b.classList.remove('on');
  },
  toggle() { this.open ? this.hide() : this.show(); },

  /* ---------- 書き出し ---------- */

  /* { 'core-melody': -2 } を、読める形の JavaScript の文字列にする */
  fmt(table, indent) {
    const keys = Object.keys(table).sort();
    if (!keys.length) return '{}';
    const pad = Math.max.apply(null, keys.map(k => k.length)) + 3;
    const sp = ' '.repeat(indent);
    return '{\n' + keys.map(k => sp + ("'" + k + "':").padEnd(pad) + ' ' + table[k] + ',').join('\n')
         + '\n' + ' '.repeat(indent - 2) + '}';
  },

  exportText() {
    const worlds = ['base'].concat(WORLD_ORDER);
    const body = worlds.map(w => {
      const t = this.data.worlds[w] || {};
      return '    ' + (w + ':').padEnd(10) + ' ' + this.fmt(t, 6) + ',';
    }).join('\n');
    const d = new Date();
    const stamp = d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' '
                + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return [
      '/* =====================================================================',
      '   card-gain.js — 各カードの音量（dB のオフセット）',
      '   ミキサー画面（本編で M キー）が書き出したもの（' + stamp + '）',
      '     実際に効く値 ＝ shared[札] ＋ worlds[いまの世界][札]',
      '     0 は「music.js の編成表どおり」。ここに無い札は 0。',
      '     _beat は札が0枚のときも鳴っている土台のビート。',
      '   ===================================================================== */',
      '',
      'window.CARD_GAIN = {',
      '  shared: ' + this.fmt(this.data.shared, 4) + ',',
      '',
      '  worlds: {',
      body,
      '  },',
      '};',
      '',
    ].join('\n');
  },

  async saveFile() {
    const text = this.exportText();
    const s = this.root.querySelector('#mx-status');
    try {
      const res = await fetch('save-card-gain', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: text,
      });
      if (!res.ok) throw new Error(await res.text());
      this.dirty = false;
      /* 保存できたら作業中の控えは要らない。次の読み込みはファイルの値になる */
      try { localStorage.removeItem(MIXER_LS); } catch (e) {}
      s.innerHTML = '<b style="color:#7fe08a">card-gain.js に保存しました。</b>'
                  + '次に開いたときはこの値で始まります。';
      UI.toast('card-gain.js に保存しました');
      return;
    } catch (e) {
      /* python の http.server で開いているときはここに来る。
         ファイルとして落として、手で置き換えてもらう               */
      const blob = new Blob([text], { type: 'text/javascript;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'card-gain.js';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      s.innerHTML = '<b style="color:#ffd166">サーバーに書き込めませんでした。</b>'
                  + 'いま <b>card-gain.js</b> をダウンロードしたので、アプリのフォルダにある'
                  + '同名のファイルへ置き換えてください。'
                  + '（「はじめる.bat」が node を使えていれば、このボタンで直接保存できます）';
    }
  },
};

/* 扱う札の一覧（土台のビート＋20枚） */
const MIXER_IDS = [MIXER_BEAT].concat(
  [].concat.apply([], ROLE_ORDER.map(rk => CHAR_ORDER.map(ck => ck + '-' + rk)))
);

Mixer.load();

document.addEventListener('DOMContentLoaded', () => {
  const b = document.getElementById('mixbtn');
  if (b) b.addEventListener('click', () => Mixer.toggle());
});

window.Mixer = Mixer;
