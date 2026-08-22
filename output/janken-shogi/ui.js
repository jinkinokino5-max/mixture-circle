/* じゃんけん将棋 — 画面制御 */

const el = (id) => document.getElementById(id);

const UI = {
  mode: 'cpu',
  size: 6,
  firstGame: true,
  score: [0, 0],
  games: 0,
  setupQueue: [],
  setupPtr: 0,
  setupPlayer: 0,
  handoffNext: null,
  deckDraft: [],
  trayItems: [],
  traySel: null,
  placeOrder: [],
  selected: null,
  viewer: 0,
  busy: false,
};

let G = null;

function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('is-active'));
  el('screen-' + name).classList.add('is-active');
}

// ---------------------------------------------------------------------------
// タイトル
// ---------------------------------------------------------------------------

el('mode-choice').addEventListener('click', (e) => {
  const b = e.target.closest('.choice'); if (!b) return;
  UI.mode = b.dataset.mode;
  [...el('mode-choice').children].forEach((c) => c.classList.toggle('is-on', c === b));
});
el('size-choice').addEventListener('click', (e) => {
  const b = e.target.closest('.choice'); if (!b) return;
  UI.size = Number(b.dataset.size);
  [...el('size-choice').children].forEach((c) => c.classList.toggle('is-on', c === b));
});
el('btn-start').addEventListener('click', () => {
  UI.firstGame = true;
  UI.score = [0, 0];
  UI.games = 0;
  startGame();
});
el('btn-rules').addEventListener('click', showRules);
el('btn-help').addEventListener('click', showRules);
el('btn-to-title').addEventListener('click', () => showScreen('title'));
el('btn-resign').addEventListener('click', () => {
  showModal('投了しますか？', '<p class="lead">この対局を終了してタイトルに戻ります。</p>', [
    { label: 'やめる', cls: 'ghost', on: closeModal },
    { label: '投了する', cls: 'primary', on: () => { closeModal(); showScreen('title'); } },
  ]);
});

// ---------------------------------------------------------------------------
// ゲーム開始 → セットアップ
// ---------------------------------------------------------------------------

function startGame() {
  G = createSetup({ size: UI.size, mode: UI.mode, firstGame: UI.firstGame });
  if (UI.mode === 'cpu') {
    G.deck[1] = cpuDeck(G, 1);
    placeRow(G, 1, cpuPlacement(G, 1));
    UI.setupQueue = [0];
  } else {
    UI.setupQueue = [0, 1];
  }
  UI.setupPtr = 0;
  beginSetupFor(UI.setupQueue[0]);
}

function beginSetupFor(p) {
  UI.setupPlayer = p;
  if (UI.mode === 'pvp') {
    goHandoff(p, () => goKing(p), '王将を確認して、カードを組み立てます。');
  } else {
    goKing(p);
  }
}

function finishSetupStep() {
  UI.setupPtr++;
  if (UI.setupPtr < UI.setupQueue.length) {
    beginSetupFor(UI.setupQueue[UI.setupPtr]);
  } else {
    G.turn = 0;
    if (UI.mode === 'pvp') goHandoff(0, () => enterPlay(), '対局開始。あなたの手番です。');
    else enterPlay();
  }
}

// ---------------------------------------------------------------------------
// 交代画面
// ---------------------------------------------------------------------------

function goHandoff(p, next, note) {
  el('handoff-title').textContent = `${playerName(p)} に交代`;
  el('handoff-note').innerHTML = `端末を渡してください。相手に画面を見せないように。<br>${note || ''}`;
  UI.handoffNext = next;
  showScreen('handoff');
}
el('btn-handoff-ok').addEventListener('click', () => {
  const n = UI.handoffNext; UI.handoffNext = null; if (n) n();
});

// ---------------------------------------------------------------------------
// 王将の確認
// ---------------------------------------------------------------------------

function goKing(p) {
  const t = G.kingType[p];
  el('king-title').textContent = `${playerName(p)} の王将`;
  const card = el('king-card');
  card.classList.remove('flipped');
  el('king-face-front').innerHTML =
    `<div>${TYPE_INFO[t].icon}</div><div class="name">${TYPE_INFO[t].label}王</div>`;
  el('btn-king-ok').classList.add('hidden');
  const cands = TYPES.filter((x) => x !== t);
  el('king-hint').textContent = G.firstGame
    ? `※第1戦なので相手の王将は「${TYPE_INFO[cands[0]].label}」か「${TYPE_INFO[cands[1]].label}」のどちらかです。`
    : '※第2戦以降は相手の王将が3種類すべてありえます（同種＝あいこ王もありうる）。';
  card.onclick = () => {
    card.classList.add('flipped');
    el('btn-king-ok').classList.remove('hidden');
    card.onclick = null;
  };
  showScreen('king');
}
el('btn-king-ok').addEventListener('click', () => goDeck(UI.setupPlayer));

// ---------------------------------------------------------------------------
// デッキ構築
// ---------------------------------------------------------------------------

function goDeck(p) {
  UI.deckDraft = [];
  el('deck-title').textContent = `${playerName(p)}：一般カードを選ぶ`;
  const myKing = G.kingType[p];
  const threat = counterOf(myKing);
  el('deck-hint').innerHTML =
    `あなたの王将は <b>${TYPE_INFO[myKing].label}王</b>。これを撃てるのは <b>${TYPE_INFO[threat].label}</b> だけです。` +
    `<br>その${TYPE_INFO[threat].label}を止められるのは <b>${TYPE_INFO[counterOf(threat)].label}</b>。護衛に厚くするか、読まれないよう散らすか。`;
  renderDeckPicker();
  showScreen('deck');
}

function renderDeckPicker() {
  const need = handSize(G.size);
  const pick = el('deck-picker');
  pick.innerHTML = '';
  TYPES.forEach((t) => {
    const n = UI.deckDraft.filter((x) => x === t).length;
    const b = document.createElement('button');
    b.className = 'pick';
    b.innerHTML = `<span class="ic">${TYPE_INFO[t].icon}</span><span class="nm">${TYPE_INFO[t].label}</span><span class="cnt">${n} 枚</span>`;
    b.onclick = () => {
      if (UI.deckDraft.length >= need) return;
      UI.deckDraft.push(t);
      renderDeckPicker();
    };
    pick.appendChild(b);
  });

  const tray = el('deck-tray');
  tray.innerHTML = '';
  UI.deckDraft.forEach((t, i) => {
    const d = document.createElement('div');
    d.className = 'tray-card';
    d.textContent = TYPE_INFO[t].icon;
    d.title = 'クリックで取り消し';
    d.onclick = () => { UI.deckDraft.splice(i, 1); renderDeckPicker(); };
    tray.appendChild(d);
  });
  if (UI.deckDraft.length === 0) {
    tray.innerHTML = '<span class="hint" style="margin:0 6px">上のカードを押して選ぶ</span>';
  }
  el('deck-remain').textContent = need - UI.deckDraft.length;
  el('btn-deck-ok').disabled = UI.deckDraft.length !== need;
}

el('btn-deck-clear').addEventListener('click', () => { UI.deckDraft = []; renderDeckPicker(); });
el('btn-deck-ok').addEventListener('click', () => {
  G.deck[UI.setupPlayer] = UI.deckDraft.slice();
  goPlace(UI.setupPlayer);
});

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

function goPlace(p) {
  el('place-title').textContent = `${playerName(p)}：自陣に並べる`;
  UI.trayItems = [{ id: 0, kind: 'king' }].concat(
    G.deck[p].map((t, i) => ({ id: i + 1, kind: t })),
  );
  UI.placeOrder = new Array(G.size).fill(null);
  UI.traySel = null;
  renderPlace();
  showScreen('place');
}

function renderPlace() {
  const p = UI.setupPlayer;
  const board = el('place-board');
  board.style.gridTemplateColumns = `repeat(${G.size}, auto)`;
  board.innerHTML = '';
  const hr = homeRow(G, p);

  for (let r = 0; r < G.size; r++) {
    for (let c = 0; c < G.size; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell' + ((r + c) % 2 ? ' alt' : '');
      const i = idx(G, r, c);
      const existing = G.board[i];
      if (existing) {
        // 相手（先に配置済み）のカードも見えるように描画
        cell.appendChild(pieceEl(existing, p, false));
      } else if (r === hr) {
        const itemId = UI.placeOrder[c];
        if (itemId !== null) {
          const item = UI.trayItems.find((x) => x.id === itemId);
          const fake = item.kind === 'king'
            ? { owner: p, isKing: true, type: G.kingType[p], revealed: false }
            : { owner: p, isKing: false, type: item.kind, revealed: true };
          const pe = pieceEl(fake, p, false);
          pe.classList.add('selectable');
          pe.onclick = () => { UI.placeOrder[c] = null; renderPlace(); };
          cell.appendChild(pe);
        } else if (UI.traySel !== null) {
          cell.classList.add('placeable');
          cell.onclick = () => {
            UI.placeOrder[c] = UI.traySel;
            UI.traySel = null;
            renderPlace();
          };
        }
      }
      board.appendChild(cell);
    }
  }

  const tray = el('place-tray');
  tray.innerHTML = '';
  UI.trayItems.forEach((item) => {
    const used = UI.placeOrder.includes(item.id);
    const d = document.createElement('div');
    d.className = 'tray-card' + (item.kind === 'king' ? ' is-king' : '')
      + (used ? ' used' : '') + (UI.traySel === item.id ? ' is-sel' : '');
    d.textContent = item.kind === 'king' ? KING_ICON : TYPE_INFO[item.kind].icon;
    d.onclick = () => { UI.traySel = (UI.traySel === item.id ? null : item.id); renderPlace(); };
    tray.appendChild(d);
  });

  el('btn-place-ok').disabled = UI.placeOrder.some((x) => x === null);
}

el('btn-place-clear').addEventListener('click', () => {
  UI.placeOrder = new Array(G.size).fill(null); UI.traySel = null; renderPlace();
});
el('btn-place-auto').addEventListener('click', () => {
  const ids = UI.trayItems.map((x) => x.id).filter((id) => id !== 0);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const kingCol = Math.floor(Math.random() * (G.size - 2)) + 1;
  UI.placeOrder = new Array(G.size).fill(null);
  UI.placeOrder[kingCol] = 0;
  let k = 0;
  for (let c = 0; c < G.size; c++) if (UI.placeOrder[c] === null) UI.placeOrder[c] = ids[k++];
  UI.traySel = null;
  renderPlace();
});
el('btn-place-ok').addEventListener('click', () => {
  const p = UI.setupPlayer;
  const order = UI.placeOrder.map((id) => {
    const item = UI.trayItems.find((x) => x.id === id);
    return item.kind === 'king' ? 'king' : item.kind;
  });
  placeRow(G, p, order);
  finishSetupStep();
});

// ---------------------------------------------------------------------------
// 対局
// ---------------------------------------------------------------------------

function enterPlay() {
  UI.viewer = UI.mode === 'cpu' ? 0 : G.turn;
  UI.selected = null;
  UI.busy = false;
  showScreen('play');
  renderPlay();
}

function pieceEl(pc, viewer, interactive) {
  const d = document.createElement('div');
  d.className = 'piece own-' + pc.owner + (pc.isKing ? ' king' : '');
  if (pc.isKing) {
    d.textContent = KING_ICON;
    const t = visibleType(G, pc, viewer);
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = t ? TYPE_INFO[t].icon : '?';
    d.appendChild(badge);
  } else {
    d.textContent = TYPE_INFO[pc.type].icon;
  }
  return d;
}

function renderPlay() {
  const viewer = UI.viewer;
  const me = G.turn;
  const board = el('board');
  board.style.gridTemplateColumns = `repeat(${G.size}, auto)`;
  board.innerHTML = '';

  let moves = [], attacks = [];
  if (UI.selected !== null) {
    moves = legalMoves(G, UI.selected);
    attacks = legalAttacks(G, UI.selected);
  }

  for (let r = 0; r < G.size; r++) {
    for (let c = 0; c < G.size; c++) {
      const i = idx(G, r, c);
      const cell = document.createElement('div');
      cell.className = 'cell' + ((r + c) % 2 ? ' alt' : '')
        + (r === G.size - 1 ? ' home-0' : '') + (r === 0 ? ' home-1' : '');
      if (G.lastAction && (G.lastAction.to === i || G.lastAction.target === i)) cell.classList.add('last');

      const mv = moves.find((m) => m.to === i);
      if (mv && canAct()) {
        cell.classList.add(mv.jump ? 'can-jump' : 'can-move');
        cell.classList.add('can-move');
        cell.onclick = () => doMove(UI.selected, i);
      }

      const pc = G.board[i];
      if (pc) {
        const pe = pieceEl(pc, viewer, true);
        const at = attacks.find((a) => a.target === i);
        if (at && canAct()) {
          pe.classList.add(at.kind === 'gamble' ? 'target-gamble' : 'target-sure');
          pe.onclick = () => doAttack(UI.selected, i, at.kind);
        } else if (pc.owner === me && canAct()) {
          pe.classList.add('selectable');
          if (UI.selected === i) pe.classList.add('selected');
          pe.onclick = () => { UI.selected = (UI.selected === i ? null : i); renderPlay(); };
        }
        cell.appendChild(pe);
      }
      board.appendChild(cell);
    }
  }

  const chip = el('turn-chip');
  chip.textContent = (UI.mode === 'cpu' && G.turn === 1) ? 'CPU の手番' : `${playerName(G.turn)} の手番`;
  chip.classList.toggle('p2', G.turn === 1);
  el('ply-count').textContent = `${G.plies + 1} 手目 / 上限120手`;

  if (!canAct()) {
    el('action-note').textContent = UI.mode === 'cpu' ? 'CPU が考えています…' : '';
  } else if (UI.selected === null) {
    el('action-note').textContent = '自分のカードをタップして選択';
  } else {
    const n = attacks.length;
    el('action-note').innerHTML = n
      ? `緑の点＝移動先／光っている敵カード＝攻撃できる相手（${n}体）`
      : '緑の点＝移動先。攻撃できる相手はいません';
  }

  renderSide();
}

function canAct() {
  return !G.over && !UI.busy && !(UI.mode === 'cpu' && G.turn === 1);
}

function renderSide() {
  const viewer = UI.viewer;
  const kt = G.kingType[viewer];
  el('my-king').innerHTML =
    `<span>${KING_ICON}</span><span>${TYPE_INFO[kt].icon}</span><span class="nm">${TYPE_INFO[kt].label}王</span>` +
    `<span class="st">${G.kingRevealed[viewer] ? '正体バレ済み' : '非公開'}</span>`;

  const cands = kingCandidates(G, viewer);
  const confirmed = cands.length === 1 && G.kingRevealed[1 - viewer];
  el('candidates').innerHTML = cands.map((t) =>
    `<span class="cand${confirmed ? ' confirmed' : ''}"><span class="ic">${TYPE_INFO[t].icon}</span>${TYPE_INFO[t].label}</span>`,
  ).join('') + (confirmed ? '<span class="cand confirmed">確定</span>' : '');

  const fmt = (arr) => arr.map((x) => (x.isKing ? KING_ICON : TYPE_INFO[x.type].icon)).join(' ') || '<span class="hint" style="margin:0">なし</span>';
  el('cap-me').innerHTML = fmt(G.captured[viewer]);
  el('cap-opp').innerHTML = fmt(G.captured[1 - viewer]);

  const log = el('log');
  log.innerHTML = G.log.slice(-40).map((l) =>
    `<div class="${/正体|撃破|返り討ち/.test(l.text) ? 'hot' : ''}">${l.text}</div>`).join('');
  log.scrollTop = log.scrollHeight;
}

function doMove(from, to) {
  UI.selected = null;
  applyMove(G, from, to);
  afterAction();
}

function doAttack(from, target, kind) {
  if (kind !== 'gamble') {
    UI.selected = null;
    const res = applyAttack(G, from, target);
    showAttackResult(res, () => afterAction());
    return;
  }
  // 賭け攻撃：確率を提示して確認
  const me = G.turn;
  const atk = G.board[from];
  const cands = kingCandidates(G, me);
  const win = cands.filter((t) => beats(atk.type, t));
  const lose = cands.filter((t) => beats(t, atk.type));
  const draw = cands.filter((t) => t === atk.type);
  const pct = (n) => Math.round((n / cands.length) * 100) + '%';

  showModal(`王将へ賭け攻撃`, `
    <p class="lead">${TYPE_INFO[atk.type].label}${atk.isKing ? '王' : ''}で相手の王将を撃ちます。
    宣言した瞬間に<b>相手の王将の正体が公開</b>されます。${atk.isKing && !atk.revealed ? '<br><b>さらにあなたの王将の正体も公開されます。</b>' : ''}</p>
    <div class="odds">
      <div class="odds-item win"><div class="v">${pct(win.length)}</div><div class="k">勝利<br>${win.map((t) => TYPE_INFO[t].icon).join('') || '—'}</div></div>
      <div class="odds-item"><div class="v">${pct(draw.length)}</div><div class="k">あいこ<br>${draw.map((t) => TYPE_INFO[t].icon).join('') || '—'}</div></div>
      <div class="odds-item lose"><div class="v">${pct(lose.length)}</div><div class="k">返り討ち<br>${lose.map((t) => TYPE_INFO[t].icon).join('') || '—'}</div></div>
    </div>`, [
    { label: 'やめる', cls: 'ghost', on: closeModal },
    { label: '撃つ', cls: 'primary', on: () => {
      closeModal();
      UI.selected = null;
      const res = applyAttack(G, from, target);
      showAttackResult(res, () => afterAction());
    } },
  ]);
}

function showAttackResult(res, next) {
  const map = {
    capture: { t: '命中！', b: `${TYPE_INFO[res.attackerType].label} が ${TYPE_INFO[res.defenderType].label} を撃破しました。` },
    draw:    { t: 'あいこ', b: `同じ ${TYPE_INFO[res.attackerType].label} 同士。何も起こりませんでした。` },
    backfire:{ t: '返り討ち…', b: `${TYPE_INFO[res.defenderType].label} に読み負け、${TYPE_INFO[res.attackerType].label} を失いました。` },
  }[res.outcome];
  const extra = res.revealedKing ? '<p class="hint">王将の正体が公開されました。</p>' : '';
  showModal(map.t, `<p class="lead">${map.b}</p>${extra}`, [
    { label: 'OK', cls: 'primary', on: () => { closeModal(); next(); } },
  ]);
}

function afterAction() {
  renderPlay();
  if (G.over) { setTimeout(showOver, 400); return; }
  if (UI.mode === 'cpu') {
    if (G.turn === 1) { UI.busy = true; renderPlay(); setTimeout(cpuTurn, 620); }
    return;
  }
  // パス＆プレイ：交代画面を挟む
  UI.selected = null;
  goHandoff(G.turn, () => enterPlay(), `${playerName(G.turn)} の手番です。`);
}

function cpuTurn() {
  const act = chooseAction(G, 1);
  if (!act) { UI.busy = false; renderPlay(); return; }
  if (act.type === 'move') {
    applyMove(G, act.from, act.to);
    UI.busy = false;
    renderPlay();
    if (G.over) setTimeout(showOver, 400);
    else if (G.turn === 1) { UI.busy = true; setTimeout(cpuTurn, 620); }
  } else {
    const res = applyAttack(G, act.from, act.target);
    UI.busy = false;
    renderPlay();
    showAttackResult(res, () => {
      renderPlay();
      if (G.over) setTimeout(showOver, 300);
      else if (G.turn === 1) { UI.busy = true; renderPlay(); setTimeout(cpuTurn, 620); }
    });
  }
}

// ---------------------------------------------------------------------------
// 決着
// ---------------------------------------------------------------------------

function showOver() {
  const w = G.over.winner;
  UI.games++;
  if (w >= 0) UI.score[w]++;
  const nameOf = (p) => (UI.mode === 'cpu' ? (p === 0 ? 'あなた' : 'CPU') : playerName(p));
  el('over-title').textContent = w === -1 ? '引き分け' : `${nameOf(w)} の勝ち`;
  const reason = {
    king: '王将を撃ち抜いた。',
    wipe: '一般カードを全滅させた。',
    limit: '手数上限。残ったカードの数で決着。',
  }[G.over.reason];
  el('over-reason').textContent = `${reason}　（通算 ${nameOf(0)} ${UI.score[0]} - ${UI.score[1]} ${nameOf(1)}）`;

  el('over-reveal').innerHTML = [0, 1].map((p) => {
    const t = G.kingType[p];
    return `<div class="reveal${w === p ? ' win' : ''}">
      <div class="who">${nameOf(p)} の王将</div>
      <div class="ic">${TYPE_INFO[t].icon}</div>
      <div class="nm">${TYPE_INFO[t].label}王</div></div>`;
  }).join('');

  const unused = TYPES.filter((t) => t !== G.kingType[0] && t !== G.kingType[1]);
  el('series-note').innerHTML = UI.firstGame && unused.length
    ? `次の対局からは、今回使われなかった <b>${TYPE_INFO[unused[0]].label}</b> も加わり、王将は3種類すべてから引かれます（同種＝あいこ王もありえます）。`
    : '王将は3種類すべてから引かれます。';
  showScreen('over');
}

el('btn-next-game').addEventListener('click', () => {
  UI.firstGame = false;
  startGame();
});

// ---------------------------------------------------------------------------
// モーダル
// ---------------------------------------------------------------------------

function showModal(title, bodyHTML, buttons) {
  el('modal-title').textContent = title;
  el('modal-body').innerHTML = bodyHTML;
  const row = el('modal-btns');
  row.innerHTML = '';
  buttons.forEach((b) => {
    const btn = document.createElement('button');
    btn.className = b.cls;
    btn.textContent = b.label;
    btn.onclick = b.on;
    row.appendChild(btn);
  });
  el('modal').classList.remove('hidden');
}
function closeModal() { el('modal').classList.add('hidden'); }

function showRules() {
  const R = TYPE_INFO.rock.icon, S = TYPE_INFO.scissors.icon, P = TYPE_INFO.paper.icon;
  showModal('ルール', `<div class="rules-body">
    <h4>相性</h4>
    <ul><li>${R}グー → ${S}チョキ に勝つ</li><li>${S}チョキ → ${P}パー に勝つ</li><li>${P}パー → ${R}グー に勝つ</li>
    <li>同種はあいこ（取れない）</li></ul>
    <h4>手番でできること（どちらか1つ）</h4>
    <ul>
      <li><b>移動</b>：8方向に1マス。隣に<b>同種の一般カード</b>があれば飛び越えて2マス先へ（あいこジャンプ／王将は不可）</li>
      <li><b>攻撃</b>：8方向の直線上・距離1〜2の敵を、<b>自分は動かずに</b>取る。距離2は間が空いている必要あり。相性で勝てる相手のみ</li>
    </ul>
    <h4>王将</h4>
    <ul>
      <li>位置は公開、種類は非公開（👑と表示）</li>
      <li>敵の王将には<b>正体不明のまま賭け攻撃</b>できる。宣言すると正体が公開され、勝ち＝勝利／あいこ＝何も起きない／負け＝<b>攻撃側が返り討ち</b></li>
      <li>王将で攻撃すると、その王将の正体も公開される</li>
    </ul>
    <h4>勝敗</h4>
    <ul><li>相手の王将を取る、または相手の一般カードを全滅させる</li>
    <li>120手で決着しなければ残存カードの多い方の勝ち</li></ul>
  </div>`, [{ label: '閉じる', cls: 'primary', on: closeModal }]);
}

// 起動
showScreen('title');
