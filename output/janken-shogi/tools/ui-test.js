/* ui.js を最小DOMスタブ上で実際に動かし、実行時エラー・ID不一致を検出する */
const fs = require('fs'), vm = require('vm');
const DIR = require('path').join(__dirname, '..') + require('path').sep;

const html = fs.readFileSync(DIR + 'index.html', 'utf8');
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const problems = [];

class Node {
  constructor(tag, id) {
    this.tag = tag; this.id = id || '';
    this.children = []; this.listeners = {};
    this._class = new Set(); this.style = {}; this.dataset = {};
    this.textContent = ''; this._html = ''; this.onclick = null;
    this.disabled = false; this.title = ''; this.scrollTop = 0; this.scrollHeight = 0;
    const self = this;
    this.classList = {
      add: (...c) => c.forEach((x) => self._class.add(x)),
      remove: (...c) => c.forEach((x) => self._class.delete(x)),
      toggle: (c, on) => { if (on === undefined) { self._class.has(c) ? self._class.delete(c) : self._class.add(c); } else if (on) self._class.add(c); else self._class.delete(c); },
      contains: (c) => self._class.has(c),
    };
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = v; this.children = []; }
  get className() { return [...this._class].join(' '); }
  set className(v) { this._class = new Set(String(v).split(/\s+/).filter(Boolean)); }
  addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
  appendChild(c) { this.children.push(c); return c; }
  querySelectorAll() { return []; }
  closest() { return null; }
  fire(ev, e) { (this.listeners[ev] || []).forEach((fn) => fn(e || { target: { closest: () => null } })); }
  click() { if (this.onclick) this.onclick(); this.fire('click'); }
}

const registry = new Map();
function getEl(id) {
  if (!registry.has(id)) registry.set(id, new Node('div', id));
  return registry.get(id);
}

const document = {
  getElementById(id) {
    if (!ids.has(id) && !id.startsWith('screen-')) problems.push('未定義のID参照: ' + id);
    return getEl(id);
  },
  createElement: (t) => new Node(t),
  querySelectorAll(sel) {
    if (sel === '.screen') return [...ids].filter((i) => i.startsWith('screen-')).map(getEl);
    return [];
  },
};

const ctx = vm.createContext({ console, Math, JSON, document, setTimeout: (fn) => fn(), window: {} });
for (const f of ['rules.js', 'ai.js', 'ui.js']) {
  try { vm.runInContext(fs.readFileSync(DIR + f, 'utf8'), ctx, { filename: f }); }
  catch (e) { problems.push(`${f} 読み込みで例外: ${e.message}`); }
}
const S = (e) => vm.runInContext(e, ctx);

// index.html が参照するIDに対して、screen-* が全部そろっているか
['title', 'handoff', 'king', 'deck', 'place', 'play', 'over'].forEach((n) => {
  if (!ids.has('screen-' + n)) problems.push('screen-' + n + ' が index.html にない');
});

function activeScreen() {
  return [...ids].filter((i) => i.startsWith('screen-') && getEl(i).classList.contains('is-active'))[0];
}

function clickModal(index) {
  const btns = getEl('modal-btns').children;
  if (!btns.length) return false;
  btns[Math.min(index, btns.length - 1)].onclick();
  return true;
}

// --- CPU戦の通し操作 -------------------------------------------------------
function runCpuGame(size) {
  S(`UI.mode='cpu'; UI.size=${size}; UI.firstGame=true; UI.score=[0,0]; startGame();`);
  if (activeScreen() !== 'screen-king') problems.push('開始後に王将確認画面へ遷移しない: ' + activeScreen());
  getEl('king-card').onclick();            // カードをめくる
  getEl('btn-king-ok').fire('click');      // 確認した
  if (activeScreen() !== 'screen-deck') problems.push('デッキ画面へ遷移しない: ' + activeScreen());

  // ピッカーを実際に押してデッキを埋める
  const need = S(`handSize(G.size)`);
  for (let i = 0; i < need; i++) {
    const picks = getEl('deck-picker').children;
    picks[i % picks.length].onclick();
  }
  if (getEl('btn-deck-ok').disabled) problems.push('デッキが揃っても決定できない');
  getEl('btn-deck-ok').fire('click');
  if (activeScreen() !== 'screen-place') problems.push('配置画面へ遷移しない: ' + activeScreen());

  getEl('btn-place-auto').fire('click');
  if (getEl('btn-place-ok').disabled) problems.push('おまかせ配置後も決定できない');
  getEl('btn-place-ok').fire('click');
  if (activeScreen() !== 'screen-play') problems.push('対局画面へ遷移しない: ' + activeScreen());

  // 盤のセル数が正しいか
  const cells = getEl('board').children.length;
  if (cells !== size * size) problems.push(`盤のマス数が ${cells}（期待 ${size * size}）`);

  // 人間側は毎回ランダムな合法手を選ぶ。CPUは自動で応じる
  let guard = 0;
  while (!S('!!G.over') && guard++ < 300) {
    if (S('G.turn') !== 0) { problems.push('CPUの手番のまま人間に制御が戻った'); break; }
    const n = S('allActions(G,0).length');
    if (n === 0) { problems.push('人間側に合法手がない'); break; }
    const k = Math.floor(Math.random() * n);
    const act = S(`allActions(G,0)[${k}]`);
    if (act.type === 'move') {
      S(`doMove(${act.from}, ${act.to})`);
    } else {
      S(`doAttack(${act.from}, ${act.target}, '${act.kind}')`);
      if (act.kind === 'gamble') clickModal(1);  // 「撃つ」
      clickModal(0);                              // 結果モーダルのOK
    }
    // CPU側の攻撃結果モーダルが残っていれば閉じる
    let safety = 0;
    while (getEl('modal-btns').children.length && !getEl('modal').classList.contains('hidden') && safety++ < 5) {
      if (!clickModal(0)) break;
    }
  }
  if (guard >= 300) problems.push('対局が終了しない（' + size + '×' + size + '）');
  if (!S('!!G.over')) problems.push('決着せずにループを抜けた');
  if (activeScreen() !== 'screen-over') problems.push('結果画面へ遷移しない: ' + activeScreen());

  // 結果画面の中身
  if (!getEl('over-title').textContent) problems.push('結果タイトルが空');
  if (!getEl('over-reveal').innerHTML.includes('王')) problems.push('王将の公開表示がない');
  return S('G.over.reason');
}

const reasons = [];
for (const size of [5, 6, 7]) {
  for (let i = 0; i < 4; i++) reasons.push(size + ':' + runCpuGame(size));
}

// --- 2人対戦モードのセットアップ ------------------------------------------
S(`UI.mode='pvp'; UI.size=6; UI.firstGame=true; startGame();`);
if (activeScreen() !== 'screen-handoff') problems.push('パス＆プレイで交代画面から始まらない: ' + activeScreen());
for (let p = 0; p < 2; p++) {
  getEl('btn-handoff-ok').fire('click');
  if (activeScreen() !== 'screen-king') problems.push('交代後に王将確認へ行かない');
  getEl('king-card').onclick();
  getEl('btn-king-ok').fire('click');
  const need = S('handSize(G.size)');
  for (let i = 0; i < need; i++) getEl('deck-picker').children[0].onclick();
  getEl('btn-deck-ok').fire('click');
  getEl('btn-place-auto').fire('click');
  getEl('btn-place-ok').fire('click');
}
if (activeScreen() !== 'screen-handoff') problems.push('両者セットアップ後に交代画面へ行かない: ' + activeScreen());
getEl('btn-handoff-ok').fire('click');
if (activeScreen() !== 'screen-play') problems.push('パス＆プレイの対局が始まらない: ' + activeScreen());
// 1手指すと交代画面に戻るか
const a0 = S('allActions(G,0).find(a=>a.type==="move")');
S(`doMove(${a0.from}, ${a0.to})`);
if (activeScreen() !== 'screen-handoff') problems.push('パス＆プレイで手番後に交代画面へ戻らない: ' + activeScreen());
if (S('G.turn') !== 1) problems.push('手番が相手に移っていない');

// ルールモーダル
S('showRules()');
if (!getEl('modal-body').innerHTML.includes('あいこジャンプ')) problems.push('ルールモーダルの内容が不足');

console.log('通し対局の決着理由:', reasons.join(', '));
if (problems.length) {
  console.log('\n--- 検出された問題 ---');
  [...new Set(problems)].forEach((p) => console.log(' NG: ' + p));
  process.exitCode = 1;
} else {
  console.log('\nUI通しテスト：問題なし（12局のCPU戦＋パス＆プレイのセットアップを完走）');
}
