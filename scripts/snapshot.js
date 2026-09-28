#!/usr/bin/env node
/* 盘面数据快照工具 —— 排盘结果的固化与回归比对(2026-09-28)
 *
 * 背景: 5000 万项参照对拍的参照物(~/src/refimpl)与 verify_* 脚本已随历史清理丢失,
 *       引擎回归只剩"人眼"。本工具把当前(已通过对拍验证的)引擎输出固化为快照数据
 *       入库, 之后任何引擎/历法改动跑一次比对即可发现行为漂移。
 *
 * 用法:  node scripts/snapshot.js gen    生成/更新 docs/snapshots/pan-snapshots.json
 *        node scripts/snapshot.js        比对当前代码输出与已入库快照(退出码 0=一致)
 *
 * 依赖:  jsdom(devDependencies)。快照为纯数据层(window._palaces + 空亡/马星),
 *        不含 DOM/样式 —— 排版类回归不在此工具职责内。
 * 入库说明: 本脚本作为可持续使用的开发工具入库(区别于一次性 verify_* 调试脚本,
 *        后者按约定仍不入库) —— 快照若不入库、脚本不入库, 换机后两者皆失, 工具就失去意义。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SNAP_FILE = path.join(ROOT, 'docs/snapshots/pan-snapshots.json');

/* 快照矩阵: 覆盖交节、子时跨日、跨年、闰年、历史对拍用例、伏吟易发区 */
const TIME_POINTS = [
  { y: 2026, m: 9,  d: 24, h: 4,  min: 0  },   // 常规
  { y: 2026, m: 9,  d: 22, h: 23, min: 55 },   // 子时前 + 55 分(刻盘分支)
  { y: 2026, m: 9,  d: 23, h: 0,  min: 5  },   // 跨入次日
  { y: 2026, m: 1,  d: 15, h: 12, min: 30 },
  { y: 2024, m: 2,  d: 29, h: 12, min: 30 },   // 闰年
  { y: 2030, m: 6,  d: 21, h: 13, min: 0  },   // 夏至交节附近
  { y: 1986, m: 12, d: 11, h: 14, min: 0  },   // 历史对拍用例(月将裁决)
  { y: 2026, m: 12, d: 31, h: 23, min: 30 },   // 年末子时
  { y: 2027, m: 1,  d: 1,  h: 0,  min: 35 },   // 跨年 + 奇数分
];
const SHANXIANG = [
  { year: 2026, deg: 0 }, { year: 2026, deg: 45 }, { year: 2026, deg: 90 },
  { year: 2026, deg: 179 }, { year: 2026, deg: 180 }, { year: 2026, deg: 270 },
  { year: 2026, deg: 359 }, { year: 2027, deg: 133 },
];
const MINGLI = { y: 1988, m: 8, d: 8, h: 8, min: 0 };   // 与 README 截图同生辰

async function boot() {
  const html = fs.readFileSync(path.join(ROOT, 'qimen_app/yinpan.html'), 'utf8');
  const bundle = fs.readFileSync(path.join(ROOT, 'qimen_app/js/qimen_bundle.min.js'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true,
                                url: 'http://localhost/qimen_app/yinpan.html' });
  const w = dom.window;
  w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} }));
  w.requestAnimationFrame = w.requestAnimationFrame || (fn => setTimeout(fn, 16));
  w.eval(bundle);
  const set = (id, v) => { w.document.getElementById(id).value = v; };
  const pan = () => {
    const p = w.window._palaces || w._palaces;
    const out = { palaces: {} };
    if (p) for (const k of Object.keys(p)) {
      const c = p[k];
      out.palaces[k] = c ? { shen: c.shen, tian: c.tian, di: c.di, xing: c.xing, men: c.men, anGan: c.anGan } : null;
    }
    out.kong = w.window._kongGongs || w._kongGongs || null;
    out.ma = w.window._maPosId || w._maPosId || null;
    return out;
  };
  const goto = (type, t) => {
    const rb = w.document.querySelector(`input[name=panType][value="${type}"]`);
    if (rb) { rb.checked = true; w.setPanType(type); }
    if (t) { set('selYear', String(t.y)); set('selMonth', String(t.m)); set('selDay', String(t.d));
             set('selHour', String(t.h)); set('selMin', String(t.min)); }
    w.doPan();
  };
  return { w, set, pan, goto };
}

function keyOf(s) { return `${s.type}|${s.label}`; }

async function collect() {
  const { set, pan, goto } = await boot();
  const snaps = [];
  for (const type of [1, 2]) {                                  // 时盘/刻盘
    for (const t of TIME_POINTS) {
      goto(type, t);
      snaps.push({ type, label: `${t.y}-${t.m}-${t.d} ${t.h}:${String(t.min).padStart(2,'0')}`, data: pan() });
    }
  }
  for (const s of SHANXIANG) {                                  // 山向(13 副盘数据量大, 只存主盘 palsT)
    goto(4, null);
    set('selShanXiangYear', String(s.year));
    set('selShanXiangDeg', String(s.deg));
    goto(4, null);
    snaps.push({ type: 4, label: `${s.year}年 ${s.deg}°`, data: pan() });
  }
  goto(6, MINGLI);                                              // 命理
  snaps.push({ type: 6, label: `生辰 ${MINGLI.y}-${MINGLI.m}-${MINGLI.d} ${MINGLI.h}:00`, data: pan() });
  return snaps;
}

(async () => {
  const mode = process.argv[2] || 'check';
  const snaps = await collect();
  if (mode === 'gen') {
    fs.mkdirSync(path.dirname(SNAP_FILE), { recursive: true });
    fs.writeFileSync(SNAP_FILE, JSON.stringify({ generated: new Date().toISOString(), count: snaps.length, snaps }, null, 1), 'utf8');
    console.log(`已生成 ${snaps.length} 个快照 → ${path.relative(ROOT, SNAP_FILE)}`);
    return;
  }
  if (!fs.existsSync(SNAP_FILE)) { console.error('快照文件不存在, 先跑: node scripts/snapshot.js gen'); process.exit(2); }
  const ref = JSON.parse(fs.readFileSync(SNAP_FILE, 'utf8'));
  const refMap = new Map(ref.snaps.map(s => [keyOf(s), s]));
  let bad = 0;
  for (const s of snaps) {
    const r = refMap.get(keyOf(s));
    if (!r) { console.log(`  ✗ ${keyOf(s)} — 快照中不存在`); bad++; continue; }
    if (JSON.stringify(r.data) !== JSON.stringify(s.data)) {
      console.log(`  ✗ ${keyOf(s)} — 数据漂移:`);
      for (const g of Object.keys(s.data.palaces)) {
        const a = JSON.stringify(r.data.palaces[g]), b = JSON.stringify(s.data.palaces[g]);
        if (a !== b) console.log(`      ${g}: ${a} → ${b}`);
      }
      bad++;
    }
  }
  console.log(bad === 0 ? `✓ ${snaps.length} 个快照全部一致` : `✗ ${bad}/${snaps.length} 个快照不一致`);
  process.exit(bad === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(3); });
