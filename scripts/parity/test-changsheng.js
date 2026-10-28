#!/usr/bin/env node
/**
 * 十二长生（长生状态）功能测试
 *
 * 1) 表级：10 干 × 8 宫 = 72 项（热卜无「甲」行，比 9 干 × 8 宫 = 72 项中的 72? 实为 9×8=72）
 *    本项目表：qimen_constants.js CHANGSHENG[gan][CS_IDX[g]]
 *    热卜表：yinpanPan.js state() 内的局部表[gan][g]
 *    归一化：字序（养胎=胎养）、简称（临=临官/沐=沐浴/生=长生/旺=帝旺）
 *
 * 2) 盘级：真实盘面下每宫「天盘干 / 地盘干」的长生输出
 *    本项目：showState() 的取值逻辑（tian[0] / di[0] + CS_IDX）
 *    热卜：state() 实际写入 #stateTianN / #stateDiN 的文本
 *
 * 用法: node scripts/parity/test-changsheng.js [--verbose]
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { runOurs, runRebu, cases } = require('./run-parity');

const ROOT = path.resolve(__dirname, '../..');
const REBU_SRC = '/home/wrz/dsh/reverse-rebu/yinpan/site/Mobile/tools/yinpan/yinpanPan.unpacked.pretty.js';
const GANS = ['乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']; // 热卜表无甲
const GONGS = [1, 2, 3, 4, 6, 7, 8, 9];

// ---------------------------------------------------------------- 加载本项目表
function loadOursTable() {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'qimen_app/js/qimen_constants.js'), 'utf8'), ctx, { filename: 'qimen_constants.js' });
  return ctx.window.QM;
}

// ---------------------------------------------------------------- 提取热卜表
function loadRebuTable() {
  const src = fs.readFileSync(REBU_SRC, 'utf8');
  const i = src.indexOf('function state()');
  const j = src.indexOf('var c = {', i) + 'var c = '.length;
  let depth = 0, end = j;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  // eslint-disable-next-line no-eval
  return eval('(' + src.slice(j, end + 1) + ')');
}

// ---------------------------------------------------------------- 归一化
const PAIR = {
  长生: ['长生'], 沐浴: ['沐浴'], 冠带: ['冠带'], 临官: ['临官'], 帝旺: ['帝旺'],
  胎养: ['胎', '养'], 养胎: ['胎', '养'], 冠临: ['冠带', '临官'], 临冠: ['临官', '冠带'],
  沐冠: ['沐浴', '冠带'], 冠沐: ['冠带', '沐浴'], 衰病: ['衰', '病'], 衰旺: ['衰', '帝旺'],
  旺衰: ['帝旺', '衰'], 墓绝: ['墓', '绝'], 死墓: ['死', '墓'], 墓死: ['墓', '死'],
  墓养: ['墓', '养'], 养长: ['养', '长生'], 养生: ['养', '长生'],
  胎: ['胎'], 养: ['养'], 绝: ['绝'], 死: ['死'], 病: ['病'], 墓: ['墓'], 衰: ['衰'],
  临: ['临官'], 沐: ['沐浴'], 生: ['长生'], 旺: ['帝旺'], 冠: ['冠带'],
};
const ALIAS = { 长: '长生', 生: '长生', 沐: '沐浴', 冠: '冠带', 临: '临官', 旺: '帝旺', 帝: '帝旺', 衰: '衰', 病: '病', 死: '死', 墓: '墓', 绝: '绝', 胎: '胎', 养: '养' };
function parseStates(v) {
  const s = String(v || '').trim();
  if (!s) return [];
  if (PAIR[s]) return PAIR[s].slice();
  const out = [];
  for (const ch of s) if (ALIAS[ch]) out.push(ALIAS[ch]);
  return out;
}
const norm = (v) => parseStates(v).sort().join('+');

// ---------------------------------------------------------------- 表级测试
function tableTest(C, rebuT) {
  const rows = [];
  for (const gan of GANS) for (const g of GONGS) {
    const oursRaw = C.CHANGSHENG[gan] ? C.CHANGSHENG[gan][C.CS_IDX[g]] : undefined;
    const rebuRaw = rebuT[gan] ? rebuT[gan][g] : undefined;
    const ok = norm(oursRaw) === norm(rebuRaw);
    if (!ok) rows.push({ scope: `${gan}宫${g}`, ours: oursRaw, other: rebuRaw, ok });
  }
  return { total: GANS.length * GONGS.length, rows };
}

// ---------------------------------------------------------------- 盘级测试
/** 热卜 state() 的实际输出（#stateTianN / #stateDiN） */
function rebuStateOutput(t, input) {
  // runRebu 内部已排好盘；这里复跑一次以拿到 ctx（简化：直接复用 runRebu 的 mock 逻辑）
  const { store, ctx } = runRebuRaw(t, input);
  try { ctx.state(); } catch (e) { /* state 依赖盘面，可能缺元素 */ }
  const out = { tian: {}, di: {} };
  for (let g = 1; g <= 9; g++) {
    if (g === 5) continue;
    out.tian[g] = String(store['stateTian' + g] || '').replace(/<[^>]*>/g, '');
    out.di[g] = String(store['stateDi' + g] || '').replace(/<[^>]*>/g, '');
  }
  return out;
}

/** 复用 run-parity 的 mock 重建 ctx（runRebu 只返回结果，这里需要 ctx 调 state()） */
function runRebuRaw(t, input) {
  const REBU_JS = REBU_SRC;
  const store = {};
  const el = (id) => ({
    html(v) { if (v === undefined) return store[id] || ''; store[id] = String(v); return this; },
    text(v) { return this.html(v); }, height() { return this; }, width() { return 800; }, scroll() { return this; },
    scrollTop() { return 0; }, bind() { return this; }, on() { return this; }, click() { return this; }, ready() { return this; },
    attr() { return ''; }, val() { return ''; }, append() { return this; }, prepend() { return this; },
    css() { return this; }, addClass() { return this; }, removeClass() { return this; }, show() { return this; }, hide() { return this; },
    find() { return this; }, each() { return this; }, parent() { return this; }, children() { return this; },
    eq() { return this; }, remove() { return this; },
  });
  const $ = (sel) => { const m = String(sel).match(/^#([\w-]+)/); return el(m ? m[1] : String(sel)); };
  const ctx = {
    console, Date, Math, JSON, parseInt, parseFloat, isNaN, String, Number, Boolean, Array, Object, RegExp, Error,
    setTimeout, clearTimeout, $, jQuery: $,
    document: { getElementById: () => null, all: { item: () => ({ value: 0 }) } },
    yinYang: input.yinYang, juNum: input.juNum, shiGan: input.shiGan, currentYi: input.currentYi,
    maXingPos: input.maXingPos, type: 1, shiZhi: input.shiZhi, xunZhiPos: 6, yueJiang: '',
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  try { vm.runInContext(fs.readFileSync(REBU_JS, 'utf8'), ctx, { filename: 'yinpanPan.js' }); } catch (e) { }
  return { store, ctx };
}

function palaceTest(C, t) {
  const ours = runOurs(t, 1);
  const input = {
    yinYang: ours.ju.yinYang, juNum: ours.ju.number,
    shiGan: (ours.sizhu.h || '').slice(0, 1), shiZhi: (ours.sizhu.h || '').slice(1, 2),
    currentYi: { 甲子: '戊', 甲戌: '己', 甲申: '庚', 甲午: '辛', 甲辰: '壬', 甲寅: '癸' }[ours.xunshou] || '',
    maXingPos: ours.maxingGong,
  };
  const rebu = rebuStateOutput(t, input);
  const rows = [];
  for (let g = 1; g <= 9; g++) {
    if (g === 5) continue;
    const p = ours.palaces[g];
    if (!p) continue;
    // 本项目：showState 的取值逻辑（天盘首干 / 地盘首干）
    const oursTian = C.CHANGSHENG[p.tian[0]] ? C.CHANGSHENG[p.tian[0]][C.CS_IDX[g]] : '';
    const oursDi = C.CHANGSHENG[p.di[0]] ? C.CHANGSHENG[p.di[0]][C.CS_IDX[g]] : '';
    // 热卜：state() 写入的文本；寄干时形如「状态、状态」，只取首状态
    const rebuTian = String(rebu.tian[g] || '').split('、')[0];
    const rebuDi = String(rebu.di[g] || '').split('、')[0];
    if (norm(oursTian) !== norm(rebuTian)) rows.push({ scope: `宫${g}.天盘(${p.tian[0]})`, ours: oursTian, other: rebuTian, ok: false });
    if (norm(oursDi) !== norm(rebuDi)) rows.push({ scope: `宫${g}.地盘(${p.di[0]})`, ours: oursDi, other: rebuDi, ok: false });
  }
  return { total: 8 * 2, rows };
}

// ---------------------------------------------------------------- 主流程
function main() {
  const verbose = process.argv.includes('--verbose');
  const C = loadOursTable();
  const rebuT = loadRebuTable();
  console.log('════ 十二长生 · 表级 ════');
  const tt = tableTest(C, rebuT);
  console.log(`${GANS.length} 干 × 8 宫 = ${tt.total} 项，差异 ${tt.rows.length}`);
  for (const r of tt.rows.slice(0, verbose ? 99 : 10)) console.log(`  ${r.scope}: 本=${r.ours} 热卜=${r.other}`);
  if (rebuT['甲']) console.log('  ⚠️ 热卜含甲行');

  console.log('\n════ 十二长生 · 盘级 ════');
  let total = 0, bad = 0;
  for (const t of cases().slice(0, 8)) {
    const pt = palaceTest(C, t);
    total += pt.total; bad += pt.rows.length;
    const head = `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')} ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
    if (pt.rows.length === 0) { if (verbose) console.log(`  ${head} ✅`); continue; }
    console.log(`  ${head}: ${pt.rows.length} 项`);
    for (const r of pt.rows.slice(0, verbose ? 99 : 4)) console.log(`      ${r.scope}: 本=${r.ours} 热卜=${r.other}`);
  }
  console.log(`\n盘级 ${total} 项，差异 ${bad}`);
  process.exitCode = tt.rows.length + bad > 0 ? 1 : 0;
}

if (require.main === module) main();
module.exports = { tableTest, palaceTest, loadOursTable, loadRebuTable, norm };
