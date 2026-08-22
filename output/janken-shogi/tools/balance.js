const fs=require('fs'), vm=require('vm');
const DIR = require('path').join(__dirname, '..') + require('path').sep;
const ctx=vm.createContext({console,Math,JSON});
for(const f of ['rules.js','ai.js']) vm.runInContext(fs.readFileSync(DIR+f,'utf8'),ctx,{filename:f});
const S=e=>vm.runInContext(e,ctx);
for (const size of [5,6,7]) {
  const r = S(`(function(){
    var N=300, first=0, second=0, draw=0, byRel={win:[0,0],lose:[0,0]};
    for(var g=0; g<N; g++){
      var s=createSetup({size:${size},mode:'cpu',firstGame:true});
      for(var p=0;p<2;p++){ s.deck[p]=cpuDeck(s,p); placeRow(s,p,cpuPlacement(s,p)); }
      var rel = relation(s.kingType[0], s.kingType[1]); // 先手の王将が後手の王将に勝つか
      var guard=0;
      while(!s.over && guard++<500) applyAction(s, chooseAction(s,s.turn));
      if(!s.over) continue;
      if(s.over.winner===0) first++; else if(s.over.winner===1) second++; else draw++;
      if(byRel[rel]){ byRel[rel][s.over.winner===0?0:1]++; }
    }
    return {N:N, first:first, second:second, draw:draw, byRel:byRel};
  })()`);
  const pct=(a,b)=>Math.round(a/(a+b)*100);
  console.log(`${size}x${size}  先手勝率 ${Math.round(r.first/r.N*100)}%  後手 ${Math.round(r.second/r.N*100)}%  引分 ${r.draw}`);
  console.log(`   王将相性が先手有利のとき 先手勝率 ${pct(r.byRel.win[0],r.byRel.win[1])}% / 先手不利のとき ${pct(r.byRel.lose[0],r.byRel.lose[1])}%`);
}
