#!/usr/bin/env node
/**
 * 阴盘时盘对拍（同门派）
 *
 * 基准：third（第三方 第三方排盘脚本，阴盘）—— 盘面六层 + 暗干
 * 参照：第三方 CLI -t 2（第三方独立实现（C++ CLI））—— 定局/四柱 + 六层
 * 被对拍：本项目 qimenChart（panType=1）
 *
 * 第三方前端的定局/四柱/旬首/马星来自服务端，本地只跑盘面排布：
 * 因此以本项目算出的输入注入 third.paipan()，比较「同输入下盘面是否一致」；
 * 定局/四柱另由第三方 CLI 独立验证。
 *
 * 用法: node scripts/parity/run-parity.js [--verbose] [--json] [--cases=N]
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
// 第三方基准的路径一律由环境变量提供，源码不硬编码任何第三方来源。
// 需要运行对拍时设置：
//   QIMEN_THIRD_YINPAN_JS   第三方时盘脚本
//   QIMEN_THIRD_CLI_BIN     第三方定局 CLI
const THIRD_JS = process.env.QIMEN_THIRD_YINPAN_JS || '';
const THIRD_CLI_BIN = process.env.QIMEN_THIRD_CLI_BIN || '';

// ---------------------------------------------------------------- 常量
const SHEN_ABBR = { 值符: '符', 腾蛇: '蛇', 太阴: '阴', 六合: '六', 白虎: '白', 玄武: '玄', 九地: '地', 九天: '天', 朱雀: '雀', 勾陈: '勾' };
const STAR_ABBR = { 天蓬: '蓬', 天任: '任', 天冲: '冲', 天辅: '辅', 天英: '英', 天芮: '芮', 天柱: '柱', 天心: '心', 天禽: '禽' };
const MEN_ABBR = { 休门: '休', 生门: '生', 伤门: '伤', 杜门: '杜', 景门: '景', 死门: '死', 惊门: '惊', 开门: '开' };
const GONG_OF = { 坎一宫: 1, 坤二宫: 2, 震三宫: 3, 巽四宫: 4, 中五宫: 5, 乾六宫: 6, 兑七宫: 7, 艮八宫: 8, 离九宫: 9 };
const YI_OF_XUN = { 甲子: '戊', 甲戌: '己', 甲申: '庚', 甲午: '辛', 甲辰: '壬', 甲寅: '癸' }; // 旬首 → 隐仪

const abbr = (map, v) => (v == null ? '' : (map[v] || String(v).replace(/^(天|本)/, '').replace(/(星|门)$/, '')));
const stripTags = (s) => String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/[\s　]/g, '');

// ---------------------------------------------------------------- 本项目
function runOurs(t, panType = 1) {
  const ctx = { console, setTimeout, clearTimeout, Date, Math, JSON, parseInt, parseFloat, isNaN, isFinite, String, Number, Boolean, Array, Object, RegExp, Error, Promise };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  ctx.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  ctx.document = { getElementById: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, body: { classList: { add() {}, remove() {} }, appendChild() {} } };
  vm.createContext(ctx);
  const load = (f) => vm.runInContext(fs.readFileSync(path.join(ROOT, 'qimen_app/js', f), 'utf8'), ctx, { filename: f });
  load('tyme4j-browser.js'); ctx.tyme4j = ctx.tyme;
  load('qimen_constants.js'); load('qimen_engine_min.js');
  const r = ctx.window.qimenChart({ year: t.year, month: t.month, day: t.day, hour: t.hour, minute: t.minute, panType });
  const palaces = {};
  for (let g = 1; g <= 9; g++) {
    const p = r.pals['gong' + g] || r.pals[g];
    if (!p) continue;
    palaces[g] = { shen: p.shen, xing: p.xing, men: p.men, tian: p.tian, di: p.di, anGan: p.anGan, kong: !!p.kong };
  }
  return {
    source: 'ours', school: 'yin',
    sizhu: { y: r.sizhu.y.ganZhi, m: r.sizhu.m.ganZhi, d: r.sizhu.d.ganZhi, h: r.sizhu.h.ganZhi, minute: r.sizhu.minute || '' },
    ju: { yinYang: r.yinYang, number: r.juNum, label: r.juLabel },
    jieqi: String(r.jieqi || '').split('～')[0].replace(/\s.*/, ''),
    xunshou: r.xs.gz, kongwang: r.kw.gz, maxing: r.ma.z,
    zhifu: { star: r.zf.s, gong: r.zf.g }, zhishi: { men: r.zs.s, gong: r.zs.g },
    maxingGong: r.ma.g,
    palaces,
  };
}

// ---------------------------------------------------------------- 第三方（基准）
/** mock jQuery：只需 #id 的 html() 读写 */
function thirdStore() {
  const store = {};
  const el = (id) => ({
    _id: id,
    html(v) { if (v === undefined) return store[id] || ''; store[id] = String(v); return this; },
    text(v) { return this.html(v); },
    height() { return this; }, width() { return 800; }, scroll() { return this; }, scrollTop() { return 0; },
    bind() { return this; }, on() { return this; }, click() { return this; }, ready() { return this; },
    attr() { return ''; }, val() { return ''; }, append() { return this; }, prepend() { return this; },
    css() { return this; }, addClass() { return this; }, removeClass() { return this; },
    show() { return this; }, hide() { return this; }, find() { return this; }, each() { return this; },
    parent() { return this; }, children() { return this; }, eq() { return this; }, remove() { return this; },
  });
  return { store, $: (sel) => { const m = String(sel).match(/^#([\w-]+)/); return el(m ? m[1] : String(sel)); } };
}

let _thirdCode = null;
function runThird(t, input) {
  if (!THIRD_JS) throw new Error('未设置 QIMEN_THIRD_YINPAN_JS（第三方时盘脚本路径）');
  if (!_thirdCode) _thirdCode = fs.readFileSync(THIRD_JS, 'utf8');
  const { store, $ } = thirdStore();
  const ctx = {
    console, Date, Math, JSON, parseInt, parseFloat, isNaN, String, Number, Boolean, Array, Object, RegExp, Error,
    setTimeout, clearTimeout, $, jQuery: $,
    document: { getElementById: () => null, all: { item: () => ({ value: 0 }) } },
    // 第三方 paipan() 的输入（SPEC.md 1.1）
    yinYang: input.yinYang, juNum: input.juNum, shiGan: input.shiGan, currentYi: input.currentYi,
    maXingPos: input.maXingPos, type: 1, shiZhi: input.shiZhi, xunZhiPos: 6, yueJiang: '',
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  try { vm.runInContext(_thirdCode, ctx, { filename: '第三方排盘脚本' }); } catch (e) { /* 尾部非盘面代码可能缺变量，盘面已生成 */ }
  const g = (id) => stripTags(store[id] || '');
  const palaces = {};
  for (let i = 1; i <= 9; i++) {
    if (i === 5) continue;
    palaces[i] = { shen: g('shen' + i), xing: g('xing' + i), men: g('men' + i), tian: g('tian' + i), di: g('di' + i), anGan: g('yinGan' + i), kong: false };
  }
  return {
    source: 'third', school: 'yin',
    sizhu: null, ju: { yinYang: input.yinYang, number: input.juNum, label: '' },
    jieqi: '', xunshou: '', kongwang: '', maxing: '',
    zhifu: { star: g('zhiFu'), gong: 0 }, zhishi: { men: g('zhiShi'), gong: 0 },
    maxingGong: input.maXingPos,
    palaces,
  };
}

// ---------------------------------------------------------------- 第三方 CLI（独立参照）
function runThirdCli(t) {
  if (!THIRD_CLI_BIN) throw new Error('未设置 QIMEN_THIRD_CLI_BIN（第三方定局 CLI 路径）');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'third-'));
  const ds = `${t.year}-${t.month}-${t.day}-${t.hour}-${t.minute}-0`;
  execFileSync(THIRD_CLI_BIN, ['-t', '2', '-d', ds, '-j', '--no-color'], { cwd: dir, stdio: 'pipe', timeout: 30000 });
  const f = fs.readdirSync(dir).find((n) => n.endsWith('.json'));
  if (!f) throw new Error('第三方 CLI 未生成 JSON');
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  fs.rmSync(dir, { recursive: true, force: true });
  const b = d['基本信息'] || {};
  const sz = b['四柱'] || {};
  const palaces = {};
  let maxingGong = 0, zfGong = 0, zsGong = 0;
  for (const p of d['九宫'] || []) {
    const g = GONG_OF[p['宫位']];
    if (!g || g === 5) continue;
    palaces[g] = {
      shen: abbr(SHEN_ABBR, p['八神']), xing: abbr(STAR_ABBR, p['九星']), men: abbr(MEN_ABBR, p['八门']),
      tian: p['天盘'], di: p['地盘'], anGan: p['暗干'], kong: !!p['空亡'],
    };
    if (p['马星']) maxingGong = g;
    if (p['九星'] === b['值符星']) zfGong = g;
    if (p['八门'] === b['值使门']) zsGong = g;
  }
  const kong = (d['旬空'] || {})['时柱'] || [];
  return {
    source: 'third-cli', school: 'yin',
    sizhu: { y: sz['年柱'], m: sz['月柱'], d: sz['日柱'], h: sz['时柱'] },
    ju: { yinYang: String(b['阴阳遁'] || '').replace('遁', ''), number: b['局数'] ?? '', label: `${b['阴阳遁'] || ''}${b['局数'] ?? ''}局` },
    jieqi: '', xunshou: '', kongwang: Array.isArray(kong) ? kong.join('') : '', maxing: '',
    zhifu: { star: abbr(STAR_ABBR, b['值符星']), gong: zfGong }, zhishi: { men: abbr(MEN_ABBR, b['值使门']), gong: zsGong },
    maxingGong,
    palaces,
  };
}

// ---------------------------------------------------------------- 比较
function compare(base, other, opts = {}) {
  const rows = [];
  const push = (scope, a, b, cmp) => {
    const same = cmp ? cmp(String(a ?? ''), String(b ?? '')) : String(a ?? '') === String(b ?? '');
    rows.push({ scope, ours: a, other: b, same });
  };
  if (opts.sizhu && base.sizhu && other.sizhu) for (const k of ['y', 'm', 'd', 'h']) push(`四柱.${k}`, base.sizhu[k], other.sizhu[k]);
  if (opts.ju) {
    push('阴阳遁', base.ju.yinYang, other.ju.yinYang, (a, b) => !a || !b || a === b);
    push('局数', base.ju.number, other.ju.number, (a, b) => {
      if (!a || !b) return true;
      const cn = '一二三四五六七八九';
      const na = cn.indexOf(a) >= 0 ? cn.indexOf(a) + 1 : +a;
      const nb = cn.indexOf(b) >= 0 ? cn.indexOf(b) + 1 : +b;
      return na === nb;
    });
  }
  if (opts.meta) {
    if (base.jieqi || other.jieqi) push('节气', base.jieqi, other.jieqi, (a, b) => !a || !b || a === b);
    if (base.kongwang || other.kongwang) push('空亡', base.kongwang, other.kongwang, (a, b) => !a || !b || a === b);
  }
  if (opts.zhifu) {
    push('值符', base.zhifu.star, other.zhifu.star, (a, b) => !a || !b || a === b);
    push('值使', base.zhishi.men, other.zhishi.men, (a, b) => !a || !b || a === b);
    if (base.zhifu.gong && other.zhifu.gong) push('值符落宫', base.zhifu.gong, other.zhifu.gong);
    if (base.zhishi.gong && other.zhishi.gong) push('值使落宫', base.zhishi.gong, other.zhishi.gong);
    if (base.maxingGong && other.maxingGong) push('马星宫', base.maxingGong, other.maxingGong);
  }
  if (opts.palaces) {
    for (let g = 1; g <= 9; g++) {
      const A = base.palaces[g], B = other.palaces[g];
      if (!A || !B) continue;
      push(`宫${g}.神`, A.shen, B.shen);
      push(`宫${g}.星`, A.xing, B.xing);
      push(`宫${g}.门`, A.men, B.men);
      const ganCmp = opts.ganExact ? undefined : (a, b) => a.slice(0, 1) === b.slice(0, 1);
      push(`宫${g}.天盘`, A.tian, B.tian, ganCmp);
      push(`宫${g}.地盘`, A.di, B.di, ganCmp);
      if (opts.anGan) push(`宫${g}.暗干`, A.anGan, B.anGan);
      if (opts.kong) push(`宫${g}.空亡`, A.kong ? 1 : 0, B.kong ? 1 : 0);
    }
  }
  return rows;
}

// ---------------------------------------------------------------- 用例
function pad(n) { return String(n).padStart(2, '0'); }
function cases(n) {
  const list = [
    { year: 2026, month: 10, day: 19, hour: 20, minute: 0, note: '基准' },
    { year: 2026, month: 10, day: 20, hour: 10, minute: 30, note: '次日上午' },
    { year: 2026, month: 6, day: 21, hour: 12, minute: 0, note: '夏至' },
    { year: 2026, month: 12, day: 22, hour: 0, minute: 0, note: '冬至子时' },
    { year: 2025, month: 1, day: 1, hour: 23, minute: 30, note: '跨年夜子时' },
    { year: 2024, month: 2, day: 29, hour: 8, minute: 15, note: '闰日' },
    { year: 2026, month: 10, day: 8, hour: 14, minute: 0, note: '寒露交节前' },
    { year: 2026, month: 10, day: 8, hour: 15, minute: 0, note: '寒露交节后' },
  ];
  // 扩展：2026 年每月 1 日 + 15 日 4 个时辰
  for (let m = 1; m <= 12; m++) {
    for (const d of [1, 15]) {
      for (const h of [0, 6, 12, 18]) list.push({ year: 2026, month: m, day: d, hour: h, minute: 0, note: `扩展 ${m}/${d} ${h}时` });
    }
  }
  return n ? list.slice(0, n) : list;
}

// ---------------------------------------------------------------- 主流程
function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const jsonOut = args.includes('--json');
  const nArg = args.find((a) => a.startsWith('--cases='));
  const list = cases(nArg ? parseInt(nArg.split('=')[1], 10) : 0);

  const report = [];
  for (const t of list) {
    const row = { input: t, diffs: [], errors: [] };
    let ours;
    try { ours = runOurs(t); } catch (e) { row.errors.push(`ours: ${e.message}`); report.push(row); continue; }
    // 第三方输入 = 本项目结果（验证同输入下盘面排布）
    const input = {
      yinYang: ours.ju.yinYang, juNum: ours.ju.number,
      shiGan: (ours.sizhu.h || '').slice(0, 1), shiZhi: (ours.sizhu.h || '').slice(1, 2),
      currentYi: YI_OF_XUN[ours.xunshou] || '', maXingPos: ours.maxingGong,
    };
    let third;
    try { third = runThird(t, input); } catch (e) { row.errors.push(`third: ${e.message}`); }
    if (third) {
      const rows = compare(ours, third, { palaces: true, anGan: true, zhifu: true, ganExact: true });
      row.diffs.push({ engine: 'third', total: rows.length, items: rows.filter((r) => !r.same) });
    }
    let cli;
    try { cli = runThirdCli(t); } catch (e) { row.errors.push(`third-cli: ${e.message}`); }
    if (cli) {
      const rows = compare(ours, cli, { sizhu: true, ju: true, meta: true, zhifu: true, palaces: true, anGan: false, kong: true });
      row.diffs.push({ engine: 'third-cli', total: rows.length, items: rows.filter((r) => !r.same) });
    }
    report.push(row);
  }

  if (jsonOut) { console.log(JSON.stringify(report, null, 2)); return; }
  let total = 0, bad = 0;
  const perEngine = {};
  for (const r of report) {
    const t = r.input;
    const head = `■ ${t.year}-${pad(t.month)}-${pad(t.day)} ${pad(t.hour)}:${pad(t.minute)}  ${t.note}`;
    const lines = [];
    for (const e of r.errors) lines.push(`  ⚠️ ${e}`);
    for (const d of r.diffs) {
      total += d.total; bad += d.items.length;
      perEngine[d.engine] = perEngine[d.engine] || { total: 0, bad: 0 };
      perEngine[d.engine].total += d.total; perEngine[d.engine].bad += d.items.length;
      const st = d.items.length === 0 ? '✅' : `❌ ${d.items.length}/${d.total}`;
      lines.push(`  ${d.engine.padEnd(5)} ${st}`);
      if (verbose || d.items.length <= 4) for (const it of d.items.slice(0, verbose ? 99 : 4)) lines.push(`      ${it.scope}: 本=${it.ours} 他=${it.other}`);
    }
    if (lines.length > 1 || verbose) console.log(`\n${head}\n${lines.join('\n')}`);
  }
  console.log('\n════ 汇总 ════');
  for (const [k, v] of Object.entries(perEngine)) {
    console.log(`${k.padEnd(5)} ${v.total} 项，${v.bad} 项不一致（${((1 - v.bad / v.total) * 100).toFixed(1)}% 一致）`);
  }
  console.log(`合计 ${total} 项，${bad} 项不一致`);
}

if (require.main === module) main();
module.exports = { runOurs, runThird, runThirdCli, compare, cases, stripTags, YI_OF_XUN };
