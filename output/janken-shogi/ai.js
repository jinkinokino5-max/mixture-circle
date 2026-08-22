/* じゃんけん将棋 — CPU 思考ルーチン
   相手（人間）の王将の種類は覗かず、候補集合からの確率で判断する。 */

const PIECE_VALUE = 100;
const KING_LOSS = 100000;

/** viewer 視点で「from が target を取れる確率」 */
function chanceCapture(state, from, target, viewer) {
  const atk = state.board[from];
  const def = state.board[target];
  if (!atk || !def) return 0;

  const atkHidden = atk.isKing && !atk.revealed && atk.owner !== viewer;
  const defHidden = def.isKing && !def.revealed && def.owner !== viewer;
  const cands = kingCandidates(state, viewer);

  if (defHidden) {
    const win = cands.filter((t) => beats(atk.type, t)).length;
    return win / cands.length;
  }
  if (atkHidden) {
    const win = cands.filter((t) => beats(t, def.type)).length;
    return win / cands.length;
  }
  return beats(atk.type, def.type) ? 1 : 0;
}

/** viewer 視点で「from が target に返り討ちされる確率」 */
function chanceBackfire(state, from, target, viewer) {
  const atk = state.board[from];
  const def = state.board[target];
  if (!atk || !def) return 0;
  const defHidden = def.isKing && !def.revealed && def.owner !== viewer;
  const cands = kingCandidates(state, viewer);
  if (defHidden) {
    const lose = cands.filter((t) => beats(t, atk.type)).length;
    return lose / cands.length;
  }
  return beats(def.type, atk.type) ? 1 : 0;
}

function chebyshev(state, a, b) {
  return Math.max(
    Math.abs(rowOf(state, a) - rowOf(state, b)),
    Math.abs(colOf(state, a) - colOf(state, b)),
  );
}

/** マス i にいる自分のコマが、相手から撃たれる危険度（0〜1の目安） */
function incomingRisk(state, i, me) {
  let risk = 0;
  for (let j = 0; j < state.board.length; j++) {
    const e = state.board[j];
    if (!e || e.owner === me) continue;
    const hits = legalAttacks(state, j).some((a) => a.target === i);
    if (!hits) continue;
    const p = chanceCapture(state, j, i, me);
    if (p <= 0) continue;
    // 相手から見て確実な手ほど実行される。賭け攻撃は割り引く
    const target = state.board[i];
    const gamble = target.isKing && !target.revealed;
    risk = Math.max(risk, gamble ? p * 0.65 : p);
  }
  return risk;
}

/** me 視点の盤面評価 */
function evaluate(state, me) {
  if (state.over) {
    if (state.over.winner === me) return KING_LOSS;
    if (state.over.winner === -1) return 0;
    return -KING_LOSS;
  }
  let s = 0;
  const myKing = findKing(state, me);
  const oppKing = findKing(state, 1 - me);

  for (let i = 0; i < state.board.length; i++) {
    const pc = state.board[i];
    if (!pc) continue;
    const mine = pc.owner === me;
    if (!pc.isKing) s += mine ? PIECE_VALUE : -PIECE_VALUE;

    if (mine) {
      const risk = incomingRisk(state, i, me);
      s -= risk * (pc.isKing ? 1200 : 70);
      // 敵王への圧力：近いほどよい（王将本体は前に出しすぎない）
      if (oppKing >= 0 && !pc.isKing) s -= chebyshev(state, i, oppKing) * 3;
    }
  }

  // 自分が次に取れそうな相手のコマ
  for (let i = 0; i < state.board.length; i++) {
    const pc = state.board[i];
    if (!pc || pc.owner !== me) continue;
    for (const a of legalAttacks(state, i)) {
      const p = chanceCapture(state, i, a.target, me);
      const t = state.board[a.target];
      s += p * (t.isKing ? 500 : 40);
    }
  }

  // 自玉が端寄りだと逃げ道が減る
  if (myKing >= 0) {
    const r = rowOf(state, myKing), c = colOf(state, myKing);
    const edge = Math.min(r, state.size - 1 - r) + Math.min(c, state.size - 1 - c);
    s += Math.min(edge, 2) * 4;
  }
  return s;
}

/** CPU の手を1つ選ぶ */
function chooseAction(state, me) {
  const acts = allActions(state, me);
  if (acts.length === 0) return null;
  const scored = acts.map((act) => ({ act, score: scoreAction(state, me, act) }));
  scored.sort((a, b) => b.score - a.score);
  // 上位の手からわずかにランダムに選ぶ（同点の膠着を避ける）
  const best = scored[0].score;
  const pool = scored.filter((x) => x.score >= best - 6);
  return pool[Math.floor(Math.random() * pool.length)].act;
}

function scoreAction(state, me, act) {
  if (act.type === 'attack') {
    const def = state.board[act.target];
    const atk = state.board[act.from];
    const pWin = chanceCapture(state, act.from, act.target, me);
    const pLose = chanceBackfire(state, act.from, act.target, me);
    const pDraw = Math.max(0, 1 - pWin - pLose);

    if (def.isKing) {
      // 賭け攻撃：勝てば即勝利、外せば自分のコマを失う
      let s = pWin * 100000
            - pLose * (atk.isKing ? 100000 : PIECE_VALUE * 3 + 120)
            - pDraw * 20;
      if (atk.isKing && !atk.revealed) s -= 250; // 正体を晒すコスト
      return s;
    }
    // 通常カードへの確実な攻撃：実際に適用して評価
    const next = cloneState(state);
    applyAttack(next, act.from, act.target);
    let s = evaluate(next, me) + 60;
    if (atk.isKing && !atk.revealed) s -= 300; // 王で撃つと正体が割れる
    return s;
  }

  const next = cloneState(state);
  applyMove(next, act.from, act.to);
  return evaluate(next, me);
}

/** CPU のデッキ構築（自分の王を守る構成＋少しのブラフ） */
function cpuDeck(state, me) {
  const n = handSize(state.size);
  const myKing = state.kingType[me];
  const threat = counterOf(myKing);         // 自玉を脅かす種類
  const guard = counterOf(threat);          // それに勝てる種類 = myKing 自身
  const attacker = TYPES.find((t) => t !== threat && t !== guard);

  const deck = [];
  // 護衛を軸に、相手の主力を刈る種類を混ぜる
  const pattern = [guard, attacker, guard, threat, attacker, guard, threat];
  for (let i = 0; i < n; i++) deck.push(pattern[i % pattern.length]);
  // 少しシャッフルしてブラフ気味に
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** CPU の初期配置（王将を端に寄せすぎず、護衛で挟む） */
function cpuPlacement(state, me) {
  const deck = state.deck[me].slice();
  const n = state.size;
  const order = new Array(n).fill(null);
  const kingCol = Math.random() < 0.5
    ? Math.floor(n / 2)
    : (Math.random() < 0.5 ? 1 : n - 2);
  order[kingCol] = 'king';
  let k = 0;
  for (let c = 0; c < n; c++) {
    if (order[c] === null) order[c] = deck[k++];
  }
  return order;
}
