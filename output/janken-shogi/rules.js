/* じゃんけん将棋 — ルールエンジン（純粋ロジック / UI非依存）
   ルールの詳細は README.md を参照。 */

const TYPES = ['rock', 'scissors', 'paper'];

// 絵文字はコードポイントから生成する（ファイルのエンコーディング事故を避けるため）
const TYPE_INFO = {
  rock:     { label: 'グー',   icon: String.fromCodePoint(0x270A) },
  scissors: { label: 'チョキ', icon: String.fromCodePoint(0x270C) },
  paper:    { label: 'パー',   icon: String.fromCodePoint(0x1F590) },
};
const KING_ICON = String.fromCodePoint(0x1F451); // 王冠

const DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

/** a が b に相性で勝つか */
function beats(a, b) {
  return (a === 'rock' && b === 'scissors')
      || (a === 'scissors' && b === 'paper')
      || (a === 'paper' && b === 'rock');
}

/** a と b の関係: 'win' | 'lose' | 'draw' */
function relation(a, b) {
  if (a === b) return 'draw';
  return beats(a, b) ? 'win' : 'lose';
}

/** 種類 t に勝てる種類を返す（t の天敵） */
function counterOf(t) {
  return TYPES.find((x) => beats(x, t));
}

// ---------------------------------------------------------------------------
// 盤面ユーティリティ
// ---------------------------------------------------------------------------

function idx(state, r, c) { return r * state.size + c; }
function rowOf(state, i) { return Math.floor(i / state.size); }
function colOf(state, i) { return i % state.size; }
function inBoard(state, r, c) {
  return r >= 0 && r < state.size && c >= 0 && c < state.size;
}

/** プレイヤー p の陣地（最下段/最上段）の行番号 */
function homeRow(state, p) {
  return p === 0 ? state.size - 1 : 0;
}

/** プレイヤー p の王将が置かれているマス（無ければ -1） */
function findKing(state, p) {
  return state.board.findIndex((x) => x && x.owner === p && x.isKing);
}

function pieceAt(state, i) { return state.board[i]; }

/** そのコマの種類。王将で未公開かつ viewer に見せられない場合は null */
function visibleType(state, piece, viewer) {
  if (!piece) return null;
  if (!piece.isKing) return piece.type;
  if (piece.revealed) return piece.type;
  if (viewer === piece.owner) return piece.type; // 自分の王は自分だけ見える
  return null;
}

// ---------------------------------------------------------------------------
// 初期化
// ---------------------------------------------------------------------------

let nextPieceId = 1;

/**
 * 対局開始前の状態を作る。
 * opts: { size, mode:'pvp'|'cpu', firstGame:boolean }
 */
function createSetup(opts) {
  const size = opts.size;
  const kingTypes = drawKings(opts.firstGame);
  return {
    size,
    mode: opts.mode,
    firstGame: !!opts.firstGame,
    board: new Array(size * size).fill(null),
    kingType: kingTypes,          // [p0, p1] 各自の王将の種類（内部的には既知）
    kingRevealed: [false, false], // 公開されたか
    deck: [null, null],           // 各自の一般カード構成（配列）
    turn: 0,
    plies: 0,
    captured: [[], []],           // captured[p] = p が取ったカードの種類配列
    over: null,                   // {winner, reason} 決着後
    log: [],
    lastAction: null,
  };
}

/** 王将を引く。第1戦は必ず別種、2戦目以降は独立ランダム */
function drawKings(firstGame) {
  const a = TYPES[Math.floor(Math.random() * 3)];
  if (firstGame) {
    const rest = TYPES.filter((t) => t !== a);
    return [a, rest[Math.floor(Math.random() * rest.length)]];
  }
  return [a, TYPES[Math.floor(Math.random() * 3)]];
}

/** 1プレイヤーぶんの一般カード枚数 */
function handSize(size) { return size - 1; }

/**
 * プレイヤー p のカードを自陣最下段に配置する。
 * order: 長さ size の配列。各要素は 'king' または種類名。左（列0）から順に置く。
 */
function placeRow(state, p, order) {
  const r = homeRow(state, p);
  order.forEach((entry, c) => {
    const i = idx(state, r, c);
    if (entry === 'king') {
      state.board[i] = {
        id: nextPieceId++, owner: p, isKing: true,
        type: state.kingType[p], revealed: false,
      };
    } else {
      state.board[i] = {
        id: nextPieceId++, owner: p, isKing: false,
        type: entry, revealed: true,
      };
    }
  });
}

// ---------------------------------------------------------------------------
// 合法手
// ---------------------------------------------------------------------------

/**
 * from にあるコマの移動先一覧。
 * 8方向1マス + あいこジャンプ（一般カード同士のみ）
 */
function legalMoves(state, from) {
  const p = pieceAt(state, from);
  if (!p) return [];
  const r = rowOf(state, from), c = colOf(state, from);
  const out = [];
  for (const [dr, dc] of DIRS) {
    const r1 = r + dr, c1 = c + dc;
    if (!inBoard(state, r1, c1)) continue;
    const i1 = idx(state, r1, c1);
    const occupant = state.board[i1];
    if (!occupant) {
      out.push({ to: i1, jump: false });
      continue;
    }
    // あいこジャンプ: 自分も相手も一般カードで同種、着地が空
    if (!p.isKing && !occupant.isKing && occupant.type === p.type) {
      const r2 = r + dr * 2, c2 = c + dc * 2;
      if (!inBoard(state, r2, c2)) continue;
      const i2 = idx(state, r2, c2);
      if (!state.board[i2]) out.push({ to: i2, jump: true });
    }
  }
  return out;
}

/**
 * from にあるコマが攻撃できる対象の一覧。
 * 返り値: [{ target, distance, kind: 'sure'|'gamble' }]
 *  - 'sure'   : 相手の種類が判明していて確実に取れる
 *  - 'gamble' : 相手が正体不明の王将（賭け攻撃）
 */
function legalAttacks(state, from) {
  const p = pieceAt(state, from);
  if (!p) return [];
  const r = rowOf(state, from), c = colOf(state, from);
  const out = [];
  for (const [dr, dc] of DIRS) {
    for (let d = 1; d <= 2; d++) {
      const r1 = r + dr * d, c1 = c + dc * d;
      if (!inBoard(state, r1, c1)) break;
      const i1 = idx(state, r1, c1);
      const t = state.board[i1];
      if (!t) continue;            // 空きマスは通過（射線は通る）
      if (t.owner === p.owner) break; // 自分のコマが遮蔽物
      // 敵コマを発見
      if (t.isKing && !t.revealed) {
        out.push({ target: i1, distance: d, kind: 'gamble' });
      } else if (beats(p.type, t.type)) {
        out.push({ target: i1, distance: d, kind: 'sure' });
      }
      break; // 敵コマも射線を止める（その先は撃てない）
    }
  }
  return out;
}

/** プレイヤー p の全合法アクション */
function allActions(state, p) {
  const acts = [];
  for (let i = 0; i < state.board.length; i++) {
    const pc = state.board[i];
    if (!pc || pc.owner !== p) continue;
    for (const m of legalMoves(state, i)) {
      acts.push({ type: 'move', from: i, to: m.to, jump: m.jump });
    }
    for (const a of legalAttacks(state, i)) {
      acts.push({ type: 'attack', from: i, target: a.target, kind: a.kind });
    }
  }
  return acts;
}

// ---------------------------------------------------------------------------
// アクションの適用
// ---------------------------------------------------------------------------

function applyMove(state, from, to) {
  const p = state.board[from];
  state.board[to] = p;
  state.board[from] = null;
  state.lastAction = { type: 'move', from, to, owner: p.owner };
  pushLog(state, `${playerName(p.owner)}：${pieceName(p)}が移動`);
  endTurn(state);
}

/**
 * 攻撃を適用する。返り値は結果の説明オブジェクト。
 * { outcome:'capture'|'draw'|'backfire', revealedKing:bool, ... }
 */
function applyAttack(state, from, target) {
  const atk = state.board[from];
  const def = state.board[target];
  const result = { outcome: null, revealedKing: false, attackerType: atk.type, defenderType: def.type };

  // 王将が関与すると種類が公開される
  if (atk.isKing && !atk.revealed) {
    atk.revealed = true;
    state.kingRevealed[atk.owner] = true;
    result.revealedKing = true;
    pushLog(state, `${playerName(atk.owner)}の王将が攻撃 → 正体は「${TYPE_INFO[atk.type].label}」！`);
  }
  if (def.isKing && !def.revealed) {
    def.revealed = true;
    state.kingRevealed[def.owner] = true;
    result.revealedKing = true;
    pushLog(state, `${playerName(def.owner)}の王将に賭け攻撃 → 正体は「${TYPE_INFO[def.type].label}」！`);
  }

  const rel = relation(atk.type, def.type);
  if (rel === 'win') {
    result.outcome = 'capture';
    state.captured[atk.owner].push({ type: def.type, isKing: def.isKing });
    state.board[target] = null;
    pushLog(state, `${playerName(atk.owner)}：${pieceName(atk)}が${pieceName(def)}を撃破`);
  } else if (rel === 'draw') {
    result.outcome = 'draw';
    pushLog(state, `あいこ。何も起こらない`);
  } else {
    result.outcome = 'backfire';
    state.captured[def.owner].push({ type: atk.type, isKing: atk.isKing });
    state.board[from] = null;
    pushLog(state, `返り討ち！ ${playerName(atk.owner)}の${pieceName(atk)}が失われた`);
  }

  state.lastAction = { type: 'attack', from, target, owner: atk.owner, outcome: result.outcome };
  endTurn(state);
  return result;
}

function applyAction(state, act) {
  if (act.type === 'move') return applyMove(state, act.from, act.to);
  return applyAttack(state, act.from, act.target);
}

function endTurn(state) {
  state.plies++;
  checkGameOver(state);
  if (!state.over) {
    state.turn = 1 - state.turn;
    // 手がまったく無い場合はパス（極めて稀）
    if (allActions(state, state.turn).length === 0) {
      pushLog(state, `${playerName(state.turn)}は動けないためパス`);
      state.turn = 1 - state.turn;
    }
  }
}

function countNormals(state, p) {
  return state.board.filter((x) => x && x.owner === p && !x.isKing).length;
}

function checkGameOver(state) {
  for (const p of [0, 1]) {
    if (findKing(state, p) === -1) {
      state.over = { winner: 1 - p, reason: 'king' };
      return;
    }
  }
  for (const p of [0, 1]) {
    if (countNormals(state, p) === 0) {
      state.over = { winner: 1 - p, reason: 'wipe' };
      return;
    }
  }
  const limit = 120;
  if (state.plies >= limit) {
    const a = state.board.filter((x) => x && x.owner === 0).length;
    const b = state.board.filter((x) => x && x.owner === 1).length;
    if (a === b) state.over = { winner: -1, reason: 'limit' };
    else state.over = { winner: a > b ? 0 : 1, reason: 'limit' };
  }
}

// ---------------------------------------------------------------------------
// 推理支援
// ---------------------------------------------------------------------------

/**
 * viewer から見た、相手プレイヤーの王将の候補種類。
 * 第1戦は「自分と別種」の制約があるため2択になる。
 */
function kingCandidates(state, viewer) {
  const opp = 1 - viewer;
  if (state.kingRevealed[opp]) return [state.kingType[opp]];
  if (state.firstGame) return TYPES.filter((t) => t !== state.kingType[viewer]);
  return TYPES.slice();
}

function playerName(p) { return p === 0 ? 'プレイヤー1' : 'プレイヤー2'; }

function pieceName(pc) {
  if (pc.isKing) return pc.revealed ? `${TYPE_INFO[pc.type].label}王` : '王将';
  return TYPE_INFO[pc.type].label;
}

function pushLog(state, text) {
  state.log.push({ ply: state.plies, text });
  if (state.log.length > 120) state.log.shift();
}

/** ディープコピー（AI の先読み用） */
function cloneState(state) {
  return {
    ...state,
    board: state.board.map((x) => (x ? { ...x } : null)),
    kingRevealed: state.kingRevealed.slice(),
    captured: [state.captured[0].slice(), state.captured[1].slice()],
    deck: [state.deck[0] ? state.deck[0].slice() : null, state.deck[1] ? state.deck[1].slice() : null],
    log: [],
  };
}
