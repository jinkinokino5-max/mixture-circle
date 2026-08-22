/* ルールエンジンの自動テスト：CPU同士で多数対局させ、破綻がないか確認 */
const fs = require('fs');
const vm = require('vm');
const DIR = require('path').join(__dirname, '..') + require('path').sep;

const ctx = vm.createContext({ console, Math, JSON });
for (const f of ['rules.js', 'ai.js']) {
  vm.runInContext(fs.readFileSync(DIR + f, 'utf8'), ctx, { filename: f });
}

const S = (expr) => vm.runInContext(expr, ctx);

// --- 単体チェック -----------------------------------------------------------
function assert(cond, msg) {
  if (!cond) { console.log('NG: ' + msg); process.exitCode = 1; }
  else console.log('ok: ' + msg);
}

assert(S("beats('rock','scissors') && beats('scissors','paper') && beats('paper','rock')"), '三すくみ');
assert(S("!beats('scissors','rock') && !beats('rock','rock')"), '逆向き・あいこは勝てない');
assert(S("counterOf('rock')==='paper'"), '天敵の算出');
assert(S("handSize(6)===5 && handSize(5)===4"), '一般カード枚数');

// 第1戦は必ず別種
let sameCount = 0;
for (let i = 0; i < 400; i++) {
  const r = S("(function(){var s=createSetup({size:6,mode:'cpu',firstGame:true});return s.kingType[0]===s.kingType[1];})()");
  if (r) sameCount++;
}
assert(sameCount === 0, '第1戦の王将は必ず別種（400回試行）');

// 2戦目以降は同種もありうる
let same2 = 0;
for (let i = 0; i < 400; i++) {
  if (S("(function(){var s=createSetup({size:6,mode:'cpu',firstGame:false});return s.kingType[0]===s.kingType[1];})()")) same2++;
}
assert(same2 > 0, '第2戦以降は同種の王将もありうる（' + same2 + '/400）');

// --- 射程・遮蔽の検証 -------------------------------------------------------
const rangeTest = S(`(function(){
  var s = createSetup({size:6,mode:'cpu',firstGame:true});
  s.kingType=['rock','scissors'];
  function put(r,c,owner,type,isKing){ s.board[idx(s,r,c)] = {id:99,owner:owner,isKing:!!isKing,type:type,revealed:!isKing}; }
  put(3,0,0,'rock');          // 攻撃側 グー
  put(3,2,1,'scissors');      // 距離2 直線 → 撃てる
  put(0,5,1,'scissors');      // 射程外
  var a = legalAttacks(s, idx(s,3,0)).map(function(x){return x.target+':'+x.distance+':'+x.kind;});
  // 間に遮蔽物を置く
  put(3,1,1,'paper');
  var b = legalAttacks(s, idx(s,3,0)).map(function(x){return x.target;});
  return {a:a, blockedHasFar: b.indexOf(idx(s,3,2))>=0, blockedList:b};
})()`);
assert(rangeTest.a.length === 1 && rangeTest.a[0].endsWith('2:sure'), '距離2・遮蔽なしで撃てる / 射程外は撃てない');
assert(rangeTest.blockedHasFar === false, '間に駒があると距離2は撃てない（遮蔽）');

// 相性で負ける相手・あいこは攻撃対象にならない
const relTest = S(`(function(){
  var s = createSetup({size:6,mode:'cpu',firstGame:true});
  function put(r,c,owner,type){ s.board[idx(s,r,c)] = {id:1,owner:owner,isKing:false,type:type,revealed:true}; }
  put(2,2,0,'rock');
  put(2,3,1,'paper');   // グー<パー → 撃てない
  put(1,2,1,'rock');    // あいこ → 撃てない
  put(3,3,1,'scissors');// 勝てる → 撃てる
  return legalAttacks(s, idx(s,2,2)).map(function(x){return x.target;});
})()`);
assert(relTest.length === 1, '相性で負ける相手とあいこは攻撃できない');

// あいこジャンプ
const jumpTest = S(`(function(){
  var s = createSetup({size:6,mode:'cpu',firstGame:true});
  function put(r,c,owner,type,isKing){ s.board[idx(s,r,c)] = {id:1,owner:owner,isKing:!!isKing,type:type,revealed:!isKing}; }
  put(2,2,0,'rock');
  put(2,3,1,'rock');   // 同種の一般カード → 飛び越えられる
  var m = legalMoves(s, idx(s,2,2));
  var jumped = m.some(function(x){ return x.to===idx(s,2,4) && x.jump; });
  // 王将は踏み台にできない
  var s2 = createSetup({size:6,mode:'cpu',firstGame:true});
  s2.kingType=['rock','rock'];
  s2.board[idx(s2,2,2)] = {id:1,owner:0,isKing:false,type:'rock',revealed:true};
  s2.board[idx(s2,2,3)] = {id:2,owner:1,isKing:true,type:'rock',revealed:false};
  var m2 = legalMoves(s2, idx(s2,2,2));
  return {jumped:jumped, kingJump:m2.some(function(x){return x.jump;})};
})()`);
assert(jumpTest.jumped === true, 'あいこジャンプができる');
assert(jumpTest.kingJump === false, '王将は踏み台にならない');

// 賭け攻撃の3分岐
const gamble = S(`(function(){
  function make(kingType, atkType){
    var s = createSetup({size:6,mode:'cpu',firstGame:true});
    s.kingType=[atkType,kingType];
    s.board[idx(s,2,2)] = {id:1,owner:0,isKing:false,type:atkType,revealed:true};
    s.board[idx(s,2,3)] = {id:2,owner:1,isKing:true,type:kingType,revealed:false};
    var r = applyAttack(s, idx(s,2,2), idx(s,2,3));
    return {outcome:r.outcome, revealed:s.kingRevealed[1], over: s.over ? s.over.reason : null,
            atkAlive: !!s.board[idx(s,2,2)]};
  }
  return {win:make('scissors','rock'), draw:make('rock','rock'), lose:make('paper','rock')};
})()`);
assert(gamble.win.outcome === 'capture' && gamble.win.over === 'king', '賭け攻撃：相性勝ち→王将を取って勝利');
assert(gamble.draw.outcome === 'draw' && gamble.draw.atkAlive, 'あいこ→何も起きない');
assert(gamble.lose.outcome === 'backfire' && !gamble.lose.atkAlive, '相性負け→攻撃側が返り討ち');
assert(gamble.win.revealed && gamble.draw.revealed && gamble.lose.revealed, '賭け攻撃で王将の正体が公開される');

// 王将で攻撃すると自分の正体が公開される
const kingAtk = S(`(function(){
  var s = createSetup({size:6,mode:'cpu',firstGame:true});
  s.kingType=['rock','scissors'];
  s.board[idx(s,2,2)] = {id:1,owner:0,isKing:true,type:'rock',revealed:false};
  s.board[idx(s,2,3)] = {id:2,owner:1,isKing:false,type:'scissors',revealed:true};
  s.board[idx(s,5,0)] = {id:3,owner:1,isKing:true,type:'scissors',revealed:false};
  s.board[idx(s,5,1)] = {id:4,owner:1,isKing:false,type:'paper',revealed:true};
  applyAttack(s, idx(s,2,2), idx(s,2,3));
  return s.kingRevealed[0];
})()`);
assert(kingAtk === true, '王将で攻撃すると自分の正体が公開される');

// 候補の絞り込み
assert(S("(function(){var s=createSetup({size:6,mode:'cpu',firstGame:true});s.kingType=['rock','paper'];return kingCandidates(s,0).length===2 && kingCandidates(s,0).indexOf('rock')<0;})()"),
  '第1戦は相手の王将候補が2択');
assert(S("(function(){var s=createSetup({size:6,mode:'cpu',firstGame:false});s.kingType=['rock','paper'];return kingCandidates(s,0).length===3;})()"),
  '第2戦以降は3択');

// --- 通し対局（CPU vs CPU） -------------------------------------------------
function playGames(size, n) {
  const res = S(`(function(){
    var stats={king:0,wipe:0,limit:0,draw:0,plies:[],err:null};
    for (var g=0; g<${n}; g++){
      var s = createSetup({size:${size},mode:'cpu',firstGame:(g%2===0)});
      for (var p=0;p<2;p++){ s.deck[p]=cpuDeck(s,p); placeRow(s,p,cpuPlacement(s,p)); }
      var guard=0;
      while(!s.over && guard++ < 500){
        var act = chooseAction(s, s.turn);
        if(!act){ stats.err='行動不能'; break; }
        applyAction(s, act);
      }
      if(guard>=500){ stats.err='無限ループ'; break; }
      if(!s.over){ stats.err='未決着'; break; }
      stats[s.over.reason]++;
      if(s.over.winner===-1) stats.draw++;
      stats.plies.push(s.plies);
    }
    return stats;
  })()`);
  return res;
}

for (const size of [5, 6, 7]) {
  const r = playGames(size, 60);
  const avg = r.plies.length ? (r.plies.reduce((a, b) => a + b, 0) / r.plies.length).toFixed(1) : '-';
  assert(!r.err, `${size}×${size} 60局が例外なく完走（${r.err || 'OK'}）`);
  console.log(`   → ${size}×${size}: 王将決着 ${r.king} / 全滅 ${r.wipe} / 手数上限 ${r.limit}（引分 ${r.draw}）, 平均 ${avg} 手`);
}
