/* 実測から、各バリエーションの trim（そろえ用補正dB）を書き込む。
   levels.json は「いまの trim が入った状態」の測定値なので、
   新しい trim = いまの trim + (目標 - 実測)。上書きではなく加算。 */
import fs from 'fs'; import path from 'path'; import vm from 'vm';
import { fileURLToPath } from 'url';
const ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
const MJS=path.join(ROOT,'music.js');
const ctx={window:{},console,Math};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(MJS,'utf8')+'\n;globalThis.INSTRUMENTS=INSTRUMENTS;',ctx);
const {INSTRUMENTS}=ctx;
const rows=JSON.parse(fs.readFileSync(path.join(ROOT,'tools','levels.json'),'utf8'));
const med=a=>{const b=[...a].sort((x,y)=>x-y);const m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2};
const lv={};rows.forEach(r=>lv[r.id]=r.lufs);

let src=fs.readFileSync(MJS,'utf8');
let n=0,maxMove=0;const clamped=[];
for(const [iid,inst] of Object.entries(INSTRUMENTS)){
  const ids=inst.variants.map((_,i)=>`${iid}-${i+1}`);
  const vals=ids.map(id=>lv[id]);
  if(vals.some(v=>!isFinite(v))) continue;
  const target=med(vals);
  const instAt=src.indexOf(`'${iid}': {`);
  if(instAt<0) continue;
  const end=src.indexOf("\n  '",instAt+5);
  let seg=src.slice(instAt,end<0?src.length:end);
  const tags=[...seg.matchAll(/\{ tag: '[^']*',(?: trim: (-?[\d.]+),)?/g)];
  if(tags.length!==inst.variants.length) continue;
  /* 後ろから書き換える（前を書き換えると後ろの index がずれる） */
  for(let i=inst.variants.length-1;i>=0;i--){
    const old=inst.variants[i].trim||0;
    let t=old+(target-vals[i]);
    const raw=t;
    t=Math.max(-6,Math.min(6,Math.round(t*2)/2));
    if(Math.abs(raw)>6.01) clamped.push(`${ids[i]} (要 ${raw.toFixed(1)}dB)`);
    maxMove=Math.max(maxMove,Math.abs(t-old));
    const m=tags[i];
    const rep=Math.abs(t)<0.25
      ? m[0].replace(/(\{ tag: '[^']*',)(?: trim: -?[\d.]+,)?/,'$1')
      : m[0].replace(/(\{ tag: '[^']*',)(?: trim: -?[\d.]+,)?/,`$1 trim: ${t},`);
    seg=seg.slice(0,m.index)+rep+seg.slice(m.index+m[0].length);
    if(t!==old) n++;
  }
  src=src.slice(0,instAt)+seg+(end<0?'':src.slice(end));
}
fs.writeFileSync(MJS,src,'utf8');
console.log(`trim 更新 ${n} 箇所 / 今回の最大移動量 ${maxMove.toFixed(1)}dB`);
if(clamped.length) console.log('±6dB では足りない: '+clamped.join(', '));
