#!/usr/bin/env node
/**
 * 全盘型对拍：只对「本项目有、第三方也有」的排盘项
 *
 *   时盘   ours panType=1   vs third paipan()（输入注入）
 *   刻盘   ours panType=2   vs third paipan()（输入注入，第三方刻盘输入在服务端）
 *   山向   ours shanxiangChart vs third shanxiangpaipan（**端到端**，双方各自算输入）
 *
 * 本项目有、第三方无 → 跳过：心盘（本项目独有的宫位编辑器）
 * 第三方有、本项目无 → 忽略（用户口径）
 *
 * 用法: node scripts/parity/run-all.js [--verbose] [--json]
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { runOurs, runThird, compare, cases, stripTags } = require('./run-parity');

const ROOT = path.resolve(__dirname, '../..');
const THIRD_SX = process.env.QIMEN_THIRD_SHANXIANG_JS || '';

// ---------------------------------------------------------------- 山向（第三方）
function sxStore() {
  const store = {};
  const el = (id) => ({
    html(v) { if (v === undefined) return store[id] || ''; store[id] = String(v); return this; },
    width() { return 800; }, height() { return this; }, css() { return this; },
    val() { return ''; }, attr() { return ''; }, append() { return this; }, bind() { return this; },
    on() { return this; }, show() { return this; }, hide() { return this; }, each() { return this; },
    find() { return this; }, parent() { return this; }, text(v) { return this.html(v); },
  });
  return { store, $: (sel) => { const m = String(sel).match(/^#([\w-]+)/); return el(m ? m[1] : String(sel)); } };
}
let _sxCode = null;
function runSxThird({ year, deg }) {
  if (!THIRD_SX) throw new Error('未设置 QIMEN_THIRD_SHANXIANG_JS（第三方山向脚本路径）');
  if (!_sxCode) _sxCode = fs.readFileSync(THIRD_SX, 'utf8');
  const { $ } = sxStore();
  const ctx = {
    console, Date, Math, JSON, parseInt, parseFloat, isNaN, String, Number, Boolean, Array, Object, RegExp, Error,
    setTimeout, clearTimeout, $, jQuery: $,
    document: { getElementById: () => null, head: { appendChild() {} }, createElement: () => ({}), all: { item: () => ({ value: 0 }) } },
    window: { scrollTo() {} }, layer: { open() {}, close() {}, closeAll() {} }, wx: { getLocation() {} },
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  try { vm.runInContext(_sxCode, ctx, { filename: 'third-shanxiang.js' }); } catch (e) { /* 尾部交互代码 */ }
  const du = Math.floor(((deg % 360) + 360) % 360 / 5);
  ctx.shanxiangpaipan(year, du, true);
  const g = (arr, i) => stripTags(arr[i]);
  const palaces = {};
  for (let i = 1; i <= 9; i++) {
    if (i === 5) continue;
    palaces[i] = {
      shen: g(ctx.shenpan, i), xing: g(ctx.xinpan, i), men: g(ctx.menpan, i),
      tian: g(ctx.tiangan, i), di: g(ctx.digan, i), anGan: g(ctx.angan, i), kong: false,
    };
  }
  const cyclical = (n) => '甲乙丙丁戊己庚辛壬癸'[n % 10] + '子丑寅卯辰巳午未申酉戌亥'[n % 12];
  return {
    source: 'third', ju: { yinYang: ctx.yy, number: ctx.ju, label: ctx.yy + ctx.ju + '局' },
    sizhu: null, jieqi: '', xunshou: cyclical(ctx.xunshou || 0),
    kongwang: '子丑寅卯辰巳午未申酉戌亥'[ctx.xunkong1] + '子丑寅卯辰巳午未申酉戌亥'[ctx.xunkong2],
    maxing: '子丑寅卯辰巳午未申酉戌亥'[ctx.maxing],
    zhifu: { star: ctx.ZhiFu, gong: 0 }, zhishi: { men: ctx.ZhiShi, gong: 0 },
    maxingGong: 0, palaces,
  };
}

// ---------------------------------------------------------------- 山向（本项目）
function runSxOurs({ year, deg }) {
  const ctx = { console, setTimeout, clearTimeout, Date, Math, JSON, parseInt, parseFloat, isNaN, isFinite, String, Number, Boolean, Array, Object, RegExp, Error, Promise };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  ctx.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  ctx.document = { getElementById: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, body: { classList: { add() {}, remove() {} }, appendChild() {} } };
  vm.createContext(ctx);
  const load = (f) => vm.runInContext(fs.readFileSync(path.join(ROOT, 'qimen_app/js', f), 'utf8'), ctx, { filename: f });
  load('tyme4j-browser.js'); ctx.tyme4j = ctx.tyme;
  load('qimen_constants.js'); load('qimen_engine_min.js');
  const items = ctx.window.shanxiangChart(deg, year);
  const du = Math.floor(((deg % 360) + 360) % 360 / 5);
  const it = items.find((x) => x.degStart === du * 5) || items[6];
  const palaces = {};
  for (let i = 1; i <= 9; i++) {
    if (i === 5) continue;
    const p = it.palsT['gong' + i];
    if (!p) continue;
    palaces[i] = { shen: p.shen, xing: p.xing, men: p.men, tian: p.tian, di: p.di, anGan: p.anGan, kong: !!p.kong };
  }
  const m = String(it.juLabel || '').match(/([阴阳])遁(\d+)局/);
  return {
    source: 'ours', ju: { yinYang: m ? m[1] : '', number: m ? m[2] : '', label: it.juLabel },
    sizhu: null, jieqi: '', xunshou: it.xunShouGZ, kongwang: it.kongWangStr, maxing: it.maStr,
    zhifu: { star: it.zhiFu, gong: 0 }, zhishi: { men: it.zhiShi, gong: 0 },
    maxingGong: it.maGong || 0, palaces,
  };
}

// ---------------------------------------------------------------- 山向比较
function compareSx(base, other) {
  const rows = [];
  const push = (scope, a, b) => rows.push({ scope, ours: a, other: b, same: String(a ?? '') === String(b ?? '') });
  push('阴阳遁', base.ju.yinYang, other.ju.yinYang);
  push('局数', base.ju.number, other.ju.number);
  push('值符', base.zhifu.star, other.zhifu.star);
  push('值使', base.zhishi.men, other.zhishi.men);
  push('旬首', base.xunshou, other.xunshou);
  push('空亡', base.kongwang, other.kongwang);
  push('马星', base.maxing, other.maxing);
  for (let g = 1; g <= 9; g++) {
    const A = base.palaces[g], B = other.palaces[g];
    if (!A || !B) continue;
    push(`宫${g}.神`, A.shen, B.shen);
    push(`宫${g}.星`, A.xing, B.xing);
    push(`宫${g}.门`, A.men, B.men);
    push(`宫${g}.天盘`, A.tian, B.tian);
    push(`宫${g}.地盘`, A.di, B.di);
    push(`宫${g}.暗干`, A.anGan, B.anGan);
  }
  return rows;
}

// ---------------------------------------------------------------- 用例
function mlCases() {
  return [
    { year: 1990, month: 5, day: 12, hour: 8, minute: 0, gender: '男', note: '基准' },
    { year: 1985, month: 3, day: 15, hour: 14, minute: 20, gender: '女', note: '女命' },
    { year: 2000, month: 1, day: 1, hour: 23, minute: 30, gender: '男', note: '夜子时' },
    { year: 2024, month: 2, day: 29, hour: 6, minute: 0, gender: '男', note: '闰日' },
    { year: 1978, month: 12, day: 12, hour: 0, minute: 0, gender: '女', note: '子时' },
    { year: 2010, month: 8, day: 8, hour: 8, minute: 8, gender: '男', note: '八八八' },
  ];
}

function sxCases() {
  const out = [];
  for (const year of [2024, 2026]) for (const deg of [0, 15, 30, 45, 60, 90, 120, 180, 225, 270, 315, 345]) out.push({ year, deg, note: `${year}年 ${deg}°` });
  return out;
}

// ---------------------------------------------------------------- 穿壬
const THIRD_SIXREN_JS = process.env.QIMEN_THIRD_LIUREN_JS || '';
const THIRD_CR_JS = process.env.QIMEN_THIRD_CHUANREN_JS || '';
const JIANG_NORM = { 腾: '蛇', 贵: '贵', 后: '后', 阴: '阴', 玄: '玄', 常: '常', 白: '白', 空: '空', 青: '青', 勾: '勾', 六: '六', 朱: '朱' };

function crMock() {
  const store = {};
  const el = (id) => ({
    html(v) { if (v === undefined) return store[id] || ''; store[id] = String(v); return this; },
    width() { return 800; }, height() { return this; }, css() { return this; },
    val() { return ''; }, attr() { return ''; }, append() { return this; }, bind() { return this; },
    on() { return this; }, show() { return this; }, hide() { return this; }, text(v) { return this.html(v); },
    each() { return this; }, find() { return this; }, click() { return this; }, scroll() { return this; },
    scrollTop() { return 0; }, fadeIn() { return this; }, fadeOut() { return this; },
    is() { return false; }, animate() { return this; }, parent() { return this; }, remove() { return this; }, eq() { return this; }, length: 0,
  });
  return { store, $: (sel) => { const m = String(sel).match(/^#([\w-]+)/); return el(m ? m[1] : String(sel)); } };
}
let _crCode = null, _sixrenCode = null;
function runCrThird(t, input) {
  if (!THIRD_SIXREN_JS || !THIRD_CR_JS) throw new Error('未设置 QIMEN_THIRD_LIUREN_JS / QIMEN_THIRD_CHUANREN_JS（第三方六壬脚本路径）');
  if (!_crCode) { _sixrenCode = fs.readFileSync(THIRD_SIXREN_JS, 'utf8'); _crCode = fs.readFileSync(THIRD_CR_JS, 'utf8'); }
  const { store, $ } = crMock();
  const ctx = {
    console, Date, Math, JSON, parseInt, parseFloat, isNaN, String, Number, Boolean, Array, Object, RegExp, Error,
    setTimeout, clearTimeout, $, jQuery: $,
    document: { getElementById: () => null, head: { appendChild() {} }, createElement: () => ({}), all: { item: () => ({ value: 0 }) }, click() {} },
    window: { scrollTo() {}, event: {} }, layer: { open() {}, close() {}, closeAll() {} }, wx: { getLocation() {} },
    yinYang: input.yinYang, juNum: input.juNum, shiGan: input.shiGan, currenYi: input.currentYi, currentYi: input.currentYi,
    maXingPos: input.maXingPos, shiZhi: input.shiZhi, yueJiang: input.yueJiang,
    riGan: input.riGan, riZhi: input.riZhi, nianZhi: input.nianZhi, yueZhi: input.yueZhi,
    guiren: input.guiren, yongshen: input.yongshen, shenType: 1, timestr: '', id: 0, actionFile: '', realTime: '', dateTime: '',
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  try { vm.runInContext(_sixrenCode, ctx, { filename: 'third-sixren.js' }); } catch (e) { }
  try { vm.runInContext(_crCode, ctx, { filename: 'third-chuanren.js' }); } catch (e) { }
  const g = (id) => stripTags(store[id] || '');
  const palaces = {};
  for (let i = 1; i <= 9; i++) {
    if (i === 5) continue;
    palaces[i] = { shen: g('shen' + i), xing: g('xing' + i), men: g('men' + i), tian: g('tian' + i), di: g('di' + i), anGan: g('yinGan' + i), kong: false };
  }
  const tianPan = [], tianGans = [], tianJiangs = [], jianchu = [];
  for (let i = 1; i <= 12; i++) {
    tianPan[i] = g('yuejiang' + i); tianGans[i] = g('gan' + i);
    tianJiangs[i] = JIANG_NORM[g('gui' + i)] || g('gui' + i); jianchu[i] = g('jianchu' + i);
  }
  return { source: 'third', palaces, tianPan, tianGans, tianJiangs, jianchu };
}

function runCrOurs(t) {
  const ctx = { console, setTimeout, clearTimeout, Date, Math, JSON, parseInt, parseFloat, isNaN, isFinite, String, Number, Boolean, Array, Object, RegExp, Error, Promise };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  ctx.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  ctx.document = { getElementById: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, body: { classList: { add() {}, remove() {} }, appendChild() {} } };
  vm.createContext(ctx);
  const load = (f) => vm.runInContext(fs.readFileSync(path.join(ROOT, 'qimen_app/js', f), 'utf8'), ctx, { filename: f });
  load('tyme4j-browser.js'); ctx.tyme4j = ctx.tyme;
  for (const f of ['qimen_constants.js', 'qimen_engine_min.js', 'qimen_chuanren.js']) load(f);
  const d = ctx.window.chuanRenChart({ year: t.year, month: t.month, day: t.day, hour: t.hour, minute: t.minute });
  const palaces = {};
  const qr = d.qr || {};
  for (let i = 1; i <= 9; i++) {
    if (i === 5) continue;
    const p = qr.pals['gong' + i] || qr.pals[i];
    if (!p) continue;
    palaces[i] = { shen: p.shen, xing: p.xing, men: p.men, tian: p.tian, di: p.di, anGan: p.anGan, kong: !!p.kong };
  }
  const tianPan = [], tianGans = [], tianJiangs = [], jianchu = [];
  for (let i = 1; i <= 12; i++) {
    tianPan[i] = d.tianPan[i]; tianGans[i] = d.tianGans[i];
    tianJiangs[i] = JIANG_NORM[d.tianJiangs[i]] || d.tianJiangs[i];
    jianchu[i] = d.dutyMap[tianPan[i]] || '';
  }
  const [ny, ym, rd, sh] = String(d.sizhu || '').split(/\s+/);
  const input = {
    yinYang: qr.yinYang, juNum: qr.juNum,
    shiGan: (sh || '').slice(0, 1), currentYi: { 甲子: '戊', 甲戌: '己', 甲申: '庚', 甲午: '辛', 甲辰: '壬', 甲寅: '癸' }[qr.xs.gz] || '',
    maXingPos: qr.ma.g, shiZhi: (sh || '').slice(1, 2), yueJiang: d.yueJiang.zhi,
    riGan: (rd || '').slice(0, 1), riZhi: (rd || '').slice(1, 2),
    nianZhi: (ny || '').slice(1, 2), yueZhi: (ym || '').slice(1, 2),
    guiren: '阳贵', yongshen: rd || '',
  };
  return { source: 'ours', palaces, tianPan, tianGans, tianJiangs, jianchu, sizhu: d.sizhu, yueJiang: d.yueJiang, dutyMap: d.dutyMap, input };
}

function compareCr(base, other) {
  const rows = [];
  const push = (scope, a, b) => rows.push({ scope, ours: a, other: b, same: String(a ?? '') === String(b ?? '') });
  for (let g = 1; g <= 9; g++) {
    const A = base.palaces[g], B = other.palaces[g];
    if (!A || !B) continue;
    push(`宫${g}.神`, A.shen, B.shen); push(`宫${g}.星`, A.xing, B.xing); push(`宫${g}.门`, A.men, B.men);
    push(`宫${g}.天盘`, A.tian, B.tian); push(`宫${g}.地盘`, A.di, B.di); push(`宫${g}.暗干`, A.anGan, B.anGan);
  }
  for (let i = 1; i <= 12; i++) {
    push(`位${i}.天盘`, base.tianPan[i], other.tianPan[i]);
    push(`位${i}.天干`, base.tianGans[i], other.tianGans[i]);
    push(`位${i}.天将`, base.tianJiangs[i], other.tianJiangs[i]);
    push(`位${i}.建除`, base.jianchu[i], other.jianchu[i]);
  }
  return rows;
}

// ---------------------------------------------------------------- 命理
const THIRD_ML = process.env.QIMEN_THIRD_MINGLI_JS || '';
let _mlCode = null;
function runMlThird(t, input) {
  if (!THIRD_ML) throw new Error('未设置 QIMEN_THIRD_MINGLI_JS（第三方命理脚本路径）');
  if (!_mlCode) _mlCode = fs.readFileSync(THIRD_ML, 'utf8');
  const { store, $ } = crMock();
  const ctx = {
    console, Date, Math, JSON, parseInt, parseFloat, isNaN, String, Number, Boolean, Array, Object, RegExp, Error,
    setTimeout, clearTimeout, $, jQuery: $,
    document: { getElementById: () => null, head: { appendChild() {} }, createElement: () => ({}), all: { item: () => ({ value: 0 }) }, click() {} },
    window: { scrollTo() {}, event: {} }, layer: { open() {}, close() {}, closeAll() {} }, wx: { getLocation() {} },
    yinYang: input.yinYang, juNum: input.juNum, shiGan: input.shiGan, currenYi: input.currentYi, currentYi: input.currentYi,
    maXingPos: input.maXingPos, kong1: input.kong1, kong2: input.kong2,
    nianZhi: input.nianZhi, yueZhi: input.yueZhi, riZhi: input.riZhi, shiZhi: input.shiZhi, yueJiang: input.yueJiang,
    riGan: input.riGan, nianGan: input.nianGan, yueGan: input.yueGan, shiGanBz: input.shiGanBz,
    id: 0, actionFile: '', yunNo: 0, isBirthYun: 0, yunStartYear: 0, birthYear: 2000, currentYear: 2026,
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  try { vm.runInContext(_mlCode, ctx, { filename: 'third-mingli.js' }); } catch (e) { }
  const g = (id) => stripTags(store[id] || '');
  const palaces = {};
  for (let i = 1; i <= 9; i++) {
    if (i === 5) continue;
    palaces[i] = { shen: g('shen' + i), xing: g('xing' + i), men: g('men' + i), tian: g('tian' + i), di: g('di' + i), anGan: g('yinGan' + i), kong: false };
  }
  return { source: 'third', palaces, sizhuThird: { n: g('nianzhu'), y: g('yuezhu'), r: g('rizhu'), s: g('shizhu') } };
}

function runMlOurs(t, gender) {
  const ctx = { console, setTimeout, clearTimeout, Date, Math, JSON, parseInt, parseFloat, isNaN, isFinite, String, Number, Boolean, Array, Object, RegExp, Error, Promise };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  ctx.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  ctx.document = { getElementById: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, body: { classList: { add() {}, remove() {} }, appendChild() {} } };
  vm.createContext(ctx);
  const load = (f) => vm.runInContext(fs.readFileSync(path.join(ROOT, 'qimen_app/js', f), 'utf8'), ctx, { filename: f });
  load('tyme4j-browser.js'); ctx.tyme4j = ctx.tyme;
  for (const f of ['qimen_constants.js', 'qimen_engine_min.js', 'qimen_mingli.js']) load(f);
  const d = ctx.window.mingliChart({ year: t.year, month: t.month, day: t.day, hour: t.hour, minute: t.minute, gender: gender || '男' });
  const qr = d.qr || {};
  const palaces = {};
  for (let i = 1; i <= 9; i++) {
    if (i === 5) continue;
    const p = qr.pals['gong' + i] || qr.pals[i];
    if (!p) continue;
    palaces[i] = { shen: p.shen, xing: p.xing, men: p.men, tian: p.tian, di: p.di, anGan: p.anGan, kong: !!p.kong };
  }
  const sz = d.sizhu || {};
  const kw = String(qr.kw.gz || '');
  const input = {
    yinYang: qr.yinYang, juNum: qr.juNum,
    shiGan: String(sz.shi || '').slice(0, 1), currentYi: { 甲子: '戊', 甲戌: '己', 甲申: '庚', 甲午: '辛', 甲辰: '壬', 甲寅: '癸' }[qr.xs.gz] || '',
    maXingPos: qr.ma.g, kong1: kw.slice(0, 1), kong2: kw.slice(1, 2),
    nianZhi: String(sz.nian || '').slice(1, 2), yueZhi: String(sz.yue || '').slice(1, 2),
    riZhi: String(sz.ri || '').slice(1, 2), shiZhi: String(sz.shi || '').slice(1, 2),
    yueJiang: '', riGan: String(sz.ri || '').slice(0, 1),
  };
  return { source: 'ours', palaces, sizhu: d.sizhu, ju: qr.juLabel || `${qr.yinYang}${qr.juNum}局`, input };
}

function compareMl(base, other) {
  const rows = [];
  const push = (scope, a, b) => rows.push({ scope, ours: a, other: b, same: String(a ?? '') === String(b ?? '') });
  // 四柱：第三方命理的四柱由服务端页面渲染，前端无输出 → 无基准，不比
  for (let g = 1; g <= 9; g++) {
    const A = base.palaces[g], B = other.palaces[g];
    if (!A || !B) continue;
    push(`宫${g}.神`, A.shen, B.shen); push(`宫${g}.星`, A.xing, B.xing); push(`宫${g}.门`, A.men, B.men);
    push(`宫${g}.天盘`, A.tian, B.tian); push(`宫${g}.地盘`, A.di, B.di); push(`宫${g}.暗干`, A.anGan, B.anGan);
  }
  return rows;
}

// ---------------------------------------------------------------- 主流程
function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const jsonOut = args.includes('--json');
  const report = { time: [], ke: [], sx: [], cr: [], ml: [] };

  // 时盘 / 刻盘
  for (const panType of [1, 2]) {
    const key = panType === 1 ? 'time' : 'ke';
    for (const t of cases()) {
      let ours, third;
      try { ours = runOurs(t, panType); } catch (e) { report[key].push({ input: t, error: 'ours: ' + e.message }); continue; }
      // 刻盘的「时干/时支」必须用刻柱，不是时柱（第三方刻盘排布用刻柱替换 hCyl）
      const keGz = panType === 2 && ours.sizhu && ours.sizhu.minute ? stripTags(ours.sizhu.minute) : '';
      const shiGZ = keGz || (ours.sizhu.h || '');
      const input = {
        yinYang: ours.ju.yinYang, juNum: ours.ju.number,
        shiGan: shiGZ.slice(0, 1), shiZhi: shiGZ.slice(1, 2),
        currentYi: { 甲子: '戊', 甲戌: '己', 甲申: '庚', 甲午: '辛', 甲辰: '壬', 甲寅: '癸' }[ours.xunshou] || '',
        maXingPos: ours.maxingGong,
      };
      try { third = runThird(t, input); } catch (e) { report[key].push({ input: t, error: 'third: ' + e.message }); continue; }
      const rows = compare(ours, third, { palaces: true, anGan: true, zhifu: true, ganExact: true });
      report[key].push({ input: t, rows, bad: rows.filter((r) => !r.same) });
    }
  }

  // 穿壬（奇门九宫 + 天盘/天干/天将/建除）
  for (const t of cases().slice(0, 8)) {
    let ours, third;
    try { ours = runCrOurs(t); } catch (e) { report.cr.push({ input: t, error: 'ours: ' + e.message }); continue; }
    try { third = runCrThird(t, ours.input); } catch (e) { report.cr.push({ input: t, error: 'third: ' + e.message }); continue; }
    const rows = compareCr(ours, third);
    report.cr.push({ input: t, rows, bad: rows.filter((r) => !r.same) });
  }

  // 命理（奇门九宫 + 四柱）
  for (const t of mlCases()) {
    let ours, third;
    try { ours = runMlOurs(t, t.gender); } catch (e) { report.ml.push({ input: t, error: 'ours: ' + e.message }); continue; }
    try { third = runMlThird(t, ours.input); } catch (e) { report.ml.push({ input: t, error: 'third: ' + e.message }); continue; }
    const rows = compareMl(ours, third);
    report.ml.push({ input: t, rows, bad: rows.filter((r) => !r.same) });
  }

  // 山向
  for (const t of sxCases()) {
    let ours, third;
    try { ours = runSxOurs(t); } catch (e) { report.sx.push({ input: t, error: 'ours: ' + e.message }); continue; }
    try { third = runSxThird(t); } catch (e) { report.sx.push({ input: t, error: 'third: ' + e.message }); continue; }
    const rows = compareSx(ours, third);
    report.sx.push({ input: t, rows, bad: rows.filter((r) => !r.same) });
  }

  if (jsonOut) { console.log(JSON.stringify(report, null, 2)); return; }

  const names = { time: '时盘', ke: '刻盘', sx: '山向', cr: '穿壬', ml: '命理' };
  for (const key of ['time', 'ke', 'sx', 'cr', 'ml']) {
    const list = report[key];
    const total = list.reduce((s, r) => s + (r.rows ? r.rows.length : 0), 0);
    const bad = list.reduce((s, r) => s + (r.bad ? r.bad.length : 0), 0);
    console.log(`\n════ ${names[key]} ════`);
    console.log(`${list.length} 个用例，${total} 项比较，${bad} 项不一致（${total ? ((1 - bad / total) * 100).toFixed(1) : 0}% 一致）`);
    for (const r of list) {
      if (r.error) { console.log(`  ⚠️ ${JSON.stringify(r.input)} ${r.error}`); continue; }
      if (!r.bad.length) continue;
      const t = r.input;
      const head = t.deg != null ? `${t.year} ${t.deg}°` : `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')} ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
      console.log(`  ${head}: ${r.bad.length} 项`);
      for (const it of r.bad.slice(0, verbose ? 99 : 4)) console.log(`      ${it.scope}: 本=${it.ours} 他=${it.other}`);
    }
  }
  console.log('\n跳过: 心盘（第三方无对应引擎，无基准）');
}

if (require.main === module) main();
module.exports = { runSxOurs, runSxThird, compareSx };
