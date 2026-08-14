/* =====================================================================
   tools/check-music.js — 音楽データの総当たり検証（音は鳴らさない）
   ---------------------------------------------------------------------
     node tools/check-music.js
   ---------------------------------------------------------------------
   音楽アプリの「正しさ」はコードを読んでも分からない。ここでは
     ・120枚すべて × 4進行 × 16小節を実際に生成して音名を解決する
     ・サンプラーの要求音域と、手元にある音源の音域を突き合わせる
     ・3つの変化の約束（余白＜基本＜刻み）が守られているか
     ・キー重複・孤児カード・trim の暴走
   を機械的に見る。v5 ではこの種の検査が
   「30楽器の音量ズレ」「移調6半音超え4か所」「密度の逆転4件」を見つけた。
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = { window: {}, console, Math };
vm.createContext(ctx);

const EXPORTS = ['CARDS', 'CARD_ORDER', 'ROLES', 'ROLE_ORDER', 'PROGRESSIONS', 'PROG_ORDER',
                 'resolveNotes', 'INSTRUMENTS', 'INSTRUMENT_ORDER', 'VARIATIONS',
                 'generateBar', 'generateFill', 'occupancyOf', 'SECTIONS', 'sectionAt', 'GROOVE',
                 'TIMBRE', 'SPACE', 'EXPR', 'LEN_STEPS', 'KEY_MOVES', 'shiftChord', 'keyPlanFor', 'safeKeyMoves', 'commonTones'];
vm.runInContext(
  fs.readFileSync(path.join(ROOT, 'music.js'), 'utf8')
  + '\n;(' + JSON.stringify(EXPORTS) + ').forEach(n => { globalThis[n] = eval(n); });',
  ctx, { filename: 'music.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'samples/manifest.js'), 'utf8'), ctx);

const { CARDS, CARD_ORDER, ROLES, ROLE_ORDER, PROGRESSIONS, PROG_ORDER,
        resolveNotes, INSTRUMENTS, INSTRUMENT_ORDER, VARIATIONS,
        generateBar, generateFill, occupancyOf, SECTIONS, sectionAt, GROOVE,
        TIMBRE, SPACE, EXPR, LEN_STEPS, KEY_MOVES, shiftChord, keyPlanFor, safeKeyMoves, commonTones } = ctx;
const MANIFEST = ctx.window.SAMPLE_MANIFEST || { pitched: {}, drums: {} };

const err = [], warn = [];
const NOTE_PC = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const toMidi = (n) => { const m = /^([A-G]#?)(-?\d+)$/.exec(n); return m ? (Number(m[2]) + 1) * 12 + NOTE_PC[m[1]] : null; };
const fileMidi = (f) => toMidi(f.replace('s', '#'));
const BARS = 16;

/* ---- 1. 楽器・バリエーション・キー・IDの整合 ---- */
let instTotal = 0, cardTotal = 0;
const NV = VARIATIONS.length;
ROLE_ORDER.forEach(rk => {
  const insts = INSTRUMENT_ORDER[rk], keys = ROLES[rk].keys;
  instTotal += insts.length;
  cardTotal += CARD_ORDER[rk].length;
  if (insts.length !== keys.length) err.push(`${rk}: 楽器${insts.length} vs キー${keys.length}個`);
  insts.forEach(iid => {
    const inst = INSTRUMENTS[iid];
    if (!inst) { err.push(`${rk}: INSTRUMENTS に ${iid} が無い`); return; }
    if (iid.split('-')[0] !== rk) err.push(`${iid} の ROLE 接頭辞が ${rk} と違う`);
    if (inst.variants.length !== NV) err.push(`${iid}: バリエーションが ${inst.variants.length} 個（${NV} 個であるべき）`);
    if (inst.groove && !GROOVE[inst.groove]) err.push(`${iid}: groove '${inst.groove}' が GROOVE に無い`);
    inst.variants.forEach((v, i) => {
      const id = `${iid}-${i + 1}`;
      if (!v.tag) err.push(`${id}: tag が無い`);
      const isKit = inst.sound.kind === 'kit';
      if (isKit && !v.drum) err.push(`${id}: ドラム楽器なのに drum が無い`);
      if (!isKit && !v.shape) err.push(`${id}: 音階楽器なのに shape が無い`);
      if (isKit && !('hasKick' in v.drum)) err.push(`${id}: drum.hasKick が無い`);
      if ('gain' in v) err.push(`${id}: variant が gain を持っている（音量は楽器で1つにすること）`);
      const t = v.trim || 0;
      if (Math.abs(t) > 6) err.push(`${id}: trim ${t}dB は ±6dB を超えている`);
    });
    const ts = inst.variants.map(v => v.trim || 0);
    if (Math.min(...ts) > 2) warn.push(`${iid}: trim が3つとも +2dB 超。gain を上げるべき`);
    if (Math.max(...ts) < -2) warn.push(`${iid}: trim が3つとも −2dB 未満。gain を下げるべき`);
  });
});
const instListed = new Set(Object.values(INSTRUMENT_ORDER).flat());
Object.keys(INSTRUMENTS).forEach(id => {
  if (!instListed.has(id)) err.push(`INSTRUMENT_ORDER に載っていない孤児楽器: ${id}`);
});
const allKeys = ROLE_ORDER.flatMap(rk => ROLES[rk].keys);
if (new Set(allKeys).size !== allKeys.length) err.push('キーが重複している: ' + allKeys.join(''));

/* ---- 2. 全カード × 全進行 × 16小節を実際に生成して解決する ---- */
const usedMidi = {};
const densStat = {};
for (const [id, card] of Object.entries(CARDS)) {
  const s = card.sound;
  if (s.kind === 'kit') continue;
  let total = 0;
  for (const pk of PROG_ORDER) {
    const prog = PROGRESSIONS[pk];
    for (let bar = 0; bar < BARS; bar++) {
      /* 案A：転調したときも音域が壊れないことを見たいので、
         全部の移調先を総当たりする（ここを省くと転調で音が痩せる）。 */
      const semi = KEY_MOVES[bar % KEY_MOVES.length].semi;
      const chord = shiftChord(prog.bars[bar % prog.bars.length], semi);
      const lift = (card.role === 'melody' && bar % 8 === 7) ? 1 : 0;
      let evs;
      try { evs = generateBar(card, bar, 2, null, 1); }
      catch (e) { err.push(`${id}/${pk}/bar${bar}: 生成で例外 ${e.message}`); continue; }
      if (!evs.length) err.push(`${id}/${pk}/bar${bar}: 音がひとつも生成されなかった`);
      /* 「音数」はイベント数ではなく実際に鳴る音の数。パッド系は1発で
         1小節伸ばすので、イベント数で測ると厚みの差が見えない。      */
      total += evs.reduce((a, ev) => a + (Array.isArray(ev.d) ? ev.d.length : 1), 0);
      evs.forEach(ev => {
        if (!(ev.s >= 0 && ev.s <= 15)) err.push(`${id}: step ${ev.s} が範囲外`);
        if (!(ev.v > 0 && ev.v <= 1)) err.push(`${id}: v ${ev.v} が範囲外`);
        let notes;
        try { notes = resolveNotes(card.role, chord, ev, s.oct, lift); }
        catch (e) { err.push(`${id}/${pk}/bar${bar}: 解決で例外 ${e.message}`); return; }
        notes.forEach(n => {
          const m = toMidi(n);
          if (m == null) { err.push(`${id}: 音名が不正 "${n}"`); return; }
          if (m < 12 || m > 108) err.push(`${id}/${pk}: 音域外 ${n}(midi${m})`);
          if (s.kind === 'sampler') {
            const a = usedMidi[s.set] || (usedMidi[s.set] = { lo: 999, hi: -999, cards: new Set() });
            a.lo = Math.min(a.lo, m); a.hi = Math.max(a.hi, m); a.cards.add(id);
          }
        });
      });
    }
  }
  densStat[id] = total / (PROG_ORDER.length * BARS);
}

/* ---- 3. 要求音域 vs 実際にある音源の音域 ---- */
for (const [set, a] of Object.entries(usedMidi)) {
  const files = (MANIFEST.pitched || {})[set];
  if (!files) { err.push(`音源セット "${set}" が manifest に無い（${[...a.cards].length}枚が合成音になる）`); continue; }
  const ms = files.map(fileMidi).filter(x => x != null).sort((x, y) => x - y);
  const lo = ms[0], hi = ms[ms.length - 1];
  const stretch = Math.max(lo - a.lo, a.hi - hi, 0);
  const tag = `${set}: 要求 ${a.lo}..${a.hi} / 音源 ${lo}..${hi}`;
  if (stretch > 12) err.push(`${tag} → ${stretch}半音の移調（1オクターブ超・音が不自然）`);
  else if (stretch > 6) warn.push(`${tag} → ${stretch}半音の移調`);
  let maxGap = 0;
  for (let i = 1; i < ms.length; i++) maxGap = Math.max(maxGap, ms[i] - ms[i - 1]);
  if (maxGap > 7) warn.push(`${set}: 音源の間隔が最大 ${maxGap} 半音あいている`);
}

/* ---- 4. ドラム：ステップ範囲・キック権・キットの実在・フィル生成 ---- */
const DRUM_FIELDS = ['k', 's', 'h', 'h3', 'ghost', 't', 't2', 't3', 'oh', 'rd', 'cr'];
let kickOwners = 0, thin = 0;
for (const [id, card] of Object.entries(CARDS)) {
  if (card.sound.kind !== 'kit') continue;
  const kit = card.sound.set;
  if (!MANIFEST.drums[kit]) err.push(`${id}: キット "${kit}" が manifest に無い`);
  else ['kick', 'snare', 'hihat'].forEach(p => {
    if (!MANIFEST.drums[kit].includes(p)) err.push(`${id}: キット ${kit} に ${p} が無い（合成音に落ちる）`);
  });
  (card.drum.hasKick && card.drum.k.length) ? kickOwners++ : thin++;
  DRUM_FIELDS.forEach(f => (card.drum[f] || []).forEach(st => {
    if (!(st >= 0 && st <= 15)) err.push(`${id}: drum.${f} の step ${st} が範囲外`);
  }));
  if (!card.drum.hasKick && (card.drum.k || []).length) err.push(`${id}: hasKick=false なのにキックが書かれている`);
  /* フィルは毎回生成される。壊れていないか16小節ぶん見る */
  for (let bar = 7; bar < 64; bar += 8) {
    const f = generateFill(card, bar);
    if (!f.length) err.push(`${id}: bar${bar} のフィルが空`);
    f.forEach(x => {
      if (!(x.s >= 12 && x.s < 16)) err.push(`${id}: フィルの位置 ${x.s} が4拍目の外`);
      if (!['snare', 'tom', 'tom2', 'tom3'].includes(x.voice)) err.push(`${id}: フィルの声部 ${x.voice} が不正`);
    });
  }
}

/* ---- 5. 3つの変化の約束（余白＜基本＜刻み）---- */
const densRows = [];
for (const [iid, inst] of Object.entries(INSTRUMENTS)) {
  const isKit = inst.sound.kind === 'kit';
  const ds = inst.variants.map((v, i) => {
    if (isKit) {
      const d = v.drum;
      return ['k', 's', 'h', 't', 't2', 't3', 'oh', 'rd'].reduce((a, f) => a + (d[f] || []).length, 0);
    }
    return densStat[`${iid}-${i + 1}`];
  });
  densRows.push({ iid, ds });
  if (!(ds[1] < ds[0])) err.push(`${iid}: 変化2「余白」が変化1より疎になっていない（${ds[1].toFixed(1)} vs ${ds[0].toFixed(1)}）`);
  if (!(ds[2] > ds[0])) err.push(`${iid}: 変化3「刻み」が変化1より密になっていない（${ds[2].toFixed(1)} vs ${ds[0].toFixed(1)}）`);
}

/* ---- 6. 生成の決定性：同じ (カード, 小節) は必ず同じ結果 ---- */
{
  const ids = Object.keys(CARDS).filter(id => CARDS[id].shape).slice(0, 20);
  ids.forEach(id => {
    for (const bar of [0, 3, 7, 31]) {
      const a = JSON.stringify(generateBar(CARDS[id], bar, 2, null, 1));
      const b = JSON.stringify(generateBar(CARDS[id], bar, 2, null, 1));
      if (a !== b) err.push(`${id}/bar${bar}: 生成が決定的でない（録音と演奏がずれる）`);
    }
  });
}

/* ---- 7. 衝突回避が本当に効いているか ---- */
{
  /* 一様に埋まっている状況では選択が変わらないのが**正しい**（全部の重みが
     同じ割合で下がるだけなので）。混み具合そのものへの反応は thin が担う。
     ここで見たいのは「偏って埋まっているとき、空いている側へ寄るか」。   */
  const half = new Float32Array(16);
  [0, 2, 4, 6, 8, 10, 12, 14].forEach(i => half[i] = 3.0);   // 表拍だけ埋まっている
  let onBusy = 0, totalEv = 0;
  Object.values(CARDS).filter(c => c.shape).forEach(card => {
    for (let bar = 0; bar < 8; bar++) {
      const ev = generateBar(card, bar, 2, half, 1);
      totalEv += ev.length;
      onBusy += ev.filter(e => half[e.s] > 0).length;
    }
  });
  const rate = onBusy / Math.max(1, totalEv);
  /* 素の状態なら表拍のほうが選ばれやすい（METRIC が強い）ので 50% を大きく
     上回るはず。避けが効いていれば 50% を下回る。                        */
  if (rate > 0.45) warn.push(`埋まっている位置に ${(rate * 100).toFixed(0)}% 置いている（避けが弱い）`);
  densRows.avoidRate = rate;
}

/* ---- 7b. 案A：転調が「必ず噛み合う」条件を守っているか ----------
   この作品の生命線は「何と何を重ねても噛み合う」こと。自由な転調は
   それを壊すので、共通音2つ以上の移動しか許していない。その検査。   */
{
  const bad = [];
  PROG_ORDER.forEach(pk => {
    const first = PROGRESSIONS[pk].bars[0];
    /* 計画に出てくる移動が、すべて共通音2つ以上か */
    for (let seed = 1; seed <= 40; seed++) {
      const plan = keyPlanFor(pk, seed);
      if (plan.length !== SECTIONS.length) err.push(`keyPlanFor(${pk},${seed}) の長さが章の数と違う`);
      if (plan[0].semi !== 0) err.push(`${pk}/${seed}: 導入が原調でない`);
      if (plan[plan.length - 1].semi !== 0) err.push(`${pk}/${seed}: 終わりが原調へ帰っていない`);
      let prev = 0;
      plan.forEach(p => {
        if (p.semi !== prev) {
          const n = commonTones(first, prev, first, p.semi);
          if (n < 2) bad.push(`${pk}: ${prev}→${p.semi} は共通音 ${n} 個`);
        }
        prev = p.semi;
      });
    }
    /* safeKeyMoves が返すものは必ず条件を満たすこと */
    KEY_MOVES.forEach(from => {
      safeKeyMoves(pk, from.semi).forEach(to => {
        if (to.semi === from.semi) return;
        const n = commonTones(first, from.semi, first, to.semi);
        if (n < 2) bad.push(`safeKeyMoves(${pk},${from.semi}) が共通音 ${n} 個の ${to.semi} を返した`);
      });
    });
  });
  [...new Set(bad)].forEach(b => err.push('転調: ' + b));

  /* どの進行でも、原調から動ける先が1つ以上あること（動かないと意味がない） */
  PROG_ORDER.forEach(pk => {
    const n = safeKeyMoves(pk, 0).filter(m => m.semi !== 0).length;
    if (n === 0) warn.push(`${pk}: 原調から安全に動ける調が無い（転調が起きない）`);
  });
  const moves = {};
  PROG_ORDER.forEach(pk => { moves[pk] = safeKeyMoves(pk, 0).map(m => m.label).join(''); });
  densRows.keyMoves = moves;
}

/* ---- 7c. 案C/D：音色と空間の定義が壊れていないか ---- */
{
  Object.entries(TIMBRE).forEach(([k, t]) => {
    if (!(t.open > 0 && t.open < 1)) err.push(`TIMBRE.${k}: open ${t.open} は 0..1 の外`);
    if (!(t.curve > 0 && t.curve <= 2)) err.push(`TIMBRE.${k}: curve ${t.curve} が範囲外`);
  });
  Object.values(CARDS).forEach(c => {
    if (!c.timbre) err.push(`${c.id}: timbre が無い`);
    if (!c.space) err.push(`${c.id}: space が無い`);
    else {
      if (Math.abs(c.space.pan) > 0.85) err.push(`${c.id}: pan ${c.space.pan} が振れすぎ`);
      if (c.space.depth < 0 || c.space.depth > 1) err.push(`${c.id}: depth ${c.space.depth} が範囲外`);
      if (c.role === 'bass' && Math.abs(c.space.pan) > 0.001) err.push(`${c.id}: ベースは中央に置くこと`);
    }
  });
}

/* ---- 7d. 案H：ロングトーンの脈動の定義が壊れていないか ---- */
{
  Object.entries(EXPR).forEach(([k, e]) => {
    if (!(e.rate > 1 && e.rate < 12)) err.push(`EXPR.${k}: rate ${e.rate} が不自然（1〜12Hzの外）`);
    if (!(e.delay >= 0 && e.delay < 1)) err.push(`EXPR.${k}: delay ${e.delay} が範囲外`);
    if (!(e.amp > 0 && e.amp < 0.15)) err.push(`EXPR.${k}: amp ${e.amp} が範囲外（揺れすぎ／無音）`);
    if (!(e.bright > 0 && e.bright < 0.3)) err.push(`EXPR.${k}: bright ${e.bright} が範囲外`);
  });
  Object.values(CARDS).forEach(c => { if (!c.expr) err.push(`${c.id}: expr が無い`); });
}

/* ---- 7e. 案G：複数小節フレーズが実際に弧を描いているか ----
   glue が高く period > 1 のカードのうち、輪郭が単調（up/down/arch）な
   ものを1枚選び、そのフレーズ（period 小節ぶん）を生成して、
   最初の小節より最後の小節のほうが輪郭の言うとおりに動いているかを見る。
   これが動いていないと、案Gは「効いているつもり」で終わってしまう。 */
{
  const period = (glue) => glue >= .9 ? 8 : glue >= .7 ? 4 : glue >= .5 ? 2 : 1;
  let checked = 0, arcedOk = 0, densityOk = 0;
  Object.values(CARDS).forEach(c => {
    const shape = c.shape;
    if (!shape || c.role === 'bass') return;
    const p = period(shape.glue || 0);
    if (p <= 1) return;
    if (!['up', 'down', 'arch', 'wave'].includes(shape.cont)) return;
    checked++;
    const first = generateBar(c, 0, 2, null, 1);
    const last = generateBar(c, p - 1, 2, null, 1);
    const avg = (evs) => evs.length ? evs.reduce((s, e) => s + (Array.isArray(e.d) ? e.d[0] : e.d), 0) / evs.length : 0;
    const a0 = avg(first), a1 = avg(last);
    if (shape.cont === 'up' ? a1 >= a0 : shape.cont === 'down' ? a1 <= a0 : true) arcedOk++;
    if (last.length >= first.length) densityOk++;
  });
  if (checked === 0) warn.push('案G：フレーズが弧を描くはずのカードが見つからなかった（対象0枚）');
  else {
    if (arcedOk < checked) warn.push(`案G：輪郭の弧が向きどおりでないカードあり（${checked - arcedOk}/${checked}）`);
    if (densityOk < checked * 0.7) warn.push(`案G：フレーズ後半で密度が増えていないカードが多い（${checked - densityOk}/${checked}）`);
  }
}

/* ---- 8. 章立て ---- */
{
  let last = -1;
  SECTIONS.forEach(s => {
    if (s.until <= last) err.push(`SECTIONS の until が単調増加でない: ${s.key}`);
    last = s.until;
    if (!(s.energy >= 1 && s.energy <= 3)) err.push(`${s.key}: energy ${s.energy} が範囲外`);
    if (!(s.thin > 0 && s.thin <= 1.5)) err.push(`${s.key}: thin ${s.thin} が範囲外`);
  });
  for (const p of [0, .2, .5, .8, .99]) if (!sectionAt(p)) err.push(`sectionAt(${p}) が章を返さない`);
}

/* ---- 出力 ---- */
console.log(`楽器 ${instTotal} × バリエーション ${NV} ＝ カード ${cardTotal} 枚`);
console.log(`キック持ちリズムカード ${kickOwners} 枚 / キック無しの薄い層 ${thin} 枚`);
console.log(`同時上限 : ` + ROLE_ORDER.map(r => `${ROLES[r].label} ${ROLES[r].max}`).join(' / '));
const avg = i => (densRows.reduce((a, r) => a + r.ds[i], 0) / densRows.length).toFixed(1);
console.log(`1小節あたりの平均音数 : 基本 ${avg(0)} / 余白 ${avg(1)} / 刻み ${avg(2)}`);
console.log(`埋まっている位置に置いた割合 : ${(densRows.avoidRate * 100).toFixed(0)}%（低いほど良い）`);
console.log(`章 : ` + SECTIONS.map(s => s.label).join(" → "));
console.log(`原調から動ける調 : ` + Object.entries(densRows.keyMoves).map(([k,v])=>k+" "+v).join(" / "));
console.log('');
if (warn.length) { console.log('― 注意 ―'); warn.forEach(w => console.log('  ' + w)); console.log(''); }
if (err.length) { console.log('― エラー ―'); err.forEach(e => console.log('  ' + e)); process.exitCode = 1; }
else console.log('エラーなし。');
