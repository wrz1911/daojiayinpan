#!/usr/bin/env node
// 山向奇门验收测试 — 硬编码用户验证案例 + 不变量 + 抽样输出
// 加载当前生产代码(qimen_bundle.min.js 内的 window.shanxiangChart)对比用户确认真值。
// 历史: 早期版本内嵌算法副本, 与当前 engine 漂移(104 字段), 2026-08-13 重写为直测当前代码。
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(path.join(__dirname, '..', 'node_modules', 'jsdom'));

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'qimen_app');
const html = fs.readFileSync(path.join(APP, 'yinpan_standalone.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const dom = new JSDOM(html.replace(/<script src="[^"]+"><\/script>/g, ''), {
  runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/yinpan_standalone.html',
});
const w = dom.window;
for (const s of srcs) w.eval(fs.readFileSync(path.join(APP, s), 'utf8'));
if (typeof w.shanxiangChart !== 'function') {
  console.error('FAIL: window.shanxiangChart 不存在(bundle 加载失败?)');
  process.exit(1);
}

const GONG_NAMES = {1:'坎1',2:'坤2',3:'震3',4:'巽4',6:'乾6',7:'兑7',8:'艮8',9:'离9'};

// ====== 用户确认的正确期望值 (7个案例) ======
// 注意: 真值未标 tian2/di2 的案例, 若当前算法输出寄干, 记为 WARN 不 FAIL(见 315° 已知差异)
const USER_GROUND_TRUTH = {
  2026: {
    0:   [{g:2, shen:'阴', tian:'辛', di:'癸', di2:'庚', xing:'辅', men:'惊'}],
    180: [{g:3, shen:'玄', tian:'丁', di:'戊',              xing:'英', men:'杜'}],
    245: [{g:9, shen:'玄', tian:'丁', di:'戊',              xing:'心', men:'开'}],
    90:  [{g:3, shen:'地', tian:'癸', di:'庚',              xing:'英', men:'生'}],
    270: [{g:6, shen:'阴', tian:'乙', di:'己',              xing:'辅', men:'惊'}],
    135: [{g:2, shen:'蛇', tian:'丁', di:'丙', di2:'己',    xing:'蓬', men:'死'}],
    315: [{g:1, shen:'玄', tian:'壬', di:'癸',              xing:'芮', men:'景'}],
  }
};

// ====== 当前代码适配: engine items → 测试用 palaces 结构 ======
function currentAlgorithm(deg, year) {
  const items = w.shanxiangChart(deg, year);
  const it = items.find(x => x.deg === deg);
  if (!it) throw new Error(`engine 输出缺 offset=0 项 (deg=${deg})`);
  const palaces = {};
  for (let g = 1; g <= 9; g++) {
    if (g === 5) continue;
    const e = it._exp[g] || {};
    const tian = (e.tian || '').trim(), di = (e.di || '').trim();
    palaces[g] = {
      shen: e.shen || '',
      tian: tian[0] || '',
      tian2: tian[1] || '',
      di: di[0] || '',
      di2: di[1] || '',
      xing: e.xing || '',
      men: e.men || ''
    };
  }
  // 值符宫: palsT 中星 == zhiFu 的宫
  let fuGong = 0;
  for (let g = 1; g <= 9; g++) {
    if (g === 5) continue;
    if ((it.palsT['gong' + g] || {}).xing === it.zhiFu) { fuGong = g; break; }
  }
  return { deg, year, name: it.sxName, juLabel: it.juLabel, fuGong, palaces, item: it };
}

// ====== 不变量检查 ======
function checkInvariants(palaces) {
  const errs = [];
  const GAN = ['戊','己','庚','辛','壬','癸','丁','丙','乙'];
  const diCount = {}; GAN.forEach(g => diCount[g]=0);
  for (let g=1;g<=9;g++){if(g===5)continue;const p=palaces[g];
    if(!p.di){errs.push('宫'+g+'地盘干缺失');continue;}
    diCount[p.di]=(diCount[p.di]||0)+1;if(p.di2)diCount[p.di2]=(diCount[p.di2]||0)+1;
  }
  GAN.forEach(g=>{if(diCount[g]!==1)errs.push('地盘干'+g+'×'+diCount[g]);});
  if(palaces[2]&&!palaces[2].di2)errs.push('坤2缺寄干');
  const allGods=['符','蛇','阴','六','白','玄','地','天'];
  const sC={};allGods.forEach(s=>sC[s]=0);
  for(let g=1;g<=9;g++){if(g===5)continue;sC[(palaces[g]||{}).shen||'']++;}
  allGods.forEach(s=>{if(sC[s]!==1)errs.push('神'+s+'×'+(sC[s]||0));});
  const xC={};['蓬','任','冲','辅','英','芮','柱','心'].forEach(x=>xC[x]=0);
  for(let g=1;g<=9;g++){if(g===5)continue;xC[(palaces[g]||{}).xing||'']++;}
  ['蓬','任','冲','辅','英','芮','柱','心'].forEach(x=>{if(xC[x]!==1)errs.push('星'+x+'×'+(xC[x]||0));});
  const mC={};['休','生','伤','杜','景','死','惊','开'].forEach(m=>mC[m]=0);
  for(let g=1;g<=9;g++){if(g===5)continue;mC[(palaces[g]||{}).men||'']++;}
  ['休','生','伤','杜','景','死','惊','开'].forEach(m=>{if(mC[m]!==1)errs.push('门'+m+'×'+(mC[m]||0));});
  return errs;
}

// ====== 运行验证 ======
console.log('╔══════════════════════════════════════════╗');
console.log('║   山向奇门验收测试 — 2026年 0-359度       ║');
console.log('║   (直测当前 qimen_bundle.min.js engine)    ║');
console.log('╚══════════════════════════════════════════╝\n');

// === Part 1: 用户确认案例 ===
console.log('=== Part 1: 用户确认案例验证 ===\n');

let userTotal=0, userPassed=0;
const userFailures=[];
const warnings=[];

for (const yearStr in USER_GROUND_TRUTH) {
  const year = parseInt(yearStr);
  for (const degStr in USER_GROUND_TRUTH[year]) {
    const deg = parseInt(degStr);
    const checks = USER_GROUND_TRUTH[year][deg];
    userTotal++;
    const r = currentAlgorithm(deg, year);

    const allDiffs = [];
    for (const chk of checks) {
      const got = r.palaces[chk.g];
      // 首干与神/星/门: 严格匹配
      if (chk.shen !== undefined && got.shen !== chk.shen) allDiffs.push(`神:${got.shen}≠${chk.shen}`);
      if (chk.tian !== undefined && got.tian !== chk.tian) allDiffs.push(`天:${got.tian}≠${chk.tian}`);
      if (chk.di !== undefined && got.di !== chk.di) allDiffs.push(`地:${got.di}≠${chk.di}`);
      if (chk.xing !== undefined && got.xing !== chk.xing) allDiffs.push(`星:${got.xing}≠${chk.xing}`);
      if (chk.men !== undefined && got.men !== chk.men) allDiffs.push(`门:${got.men}≠${chk.men}`);
      // 寄干: 真值标注了则必须匹配; 未标注但当前算法有寄干 → WARN
      if (chk.di2 !== undefined && got.di2 !== chk.di2) allDiffs.push(`地2:${got.di2}≠${chk.di2}`);
      else if (chk.di2 === undefined && got.di2) warnings.push(`${year}年${deg}° 宫${chk.g} 地盘寄干 ${got.di2}(真值未标)`);
      if (chk.tian2 !== undefined && got.tian2 !== chk.tian2) allDiffs.push(`天2:${got.tian2}≠${chk.tian2}`);
      else if (chk.tian2 === undefined && got.tian2) warnings.push(`${year}年${deg}° 宫${chk.g} 天盘寄干 ${got.tian2}(真值未标)`);
    }

    if (allDiffs.length === 0) {
      userPassed++;
      console.log(`✓ ${year}年${deg}° ${r.name} ${r.juLabel}: 宫${checks.map(c=>c.g).join(',')} 全部匹配`);
    } else {
      console.log(`✗ ${year}年${deg}° ${r.name} ${r.juLabel}: ${allDiffs.join('; ')}`);
      console.log(`  符宫=${r.fuGong} 值符=${r.item.zhiFu} 值使=${r.item.zhiShi} ${r.item.xunShouGZ} 空亡${r.item.kongWangStr}`);
      userFailures.push({deg, name:r.name, diffs:allDiffs});
    }
  }
}
if (warnings.length) {
  console.log('\n⚠ 真值表未标寄干(仅提示, 不判失败):');
  warnings.forEach(x => console.log('  ' + x));
}
console.log(`\n用户验证: ${userPassed}/${userTotal} 通过\n`);

// === Part 2: 不变量检查 ===
console.log('=== Part 2: 不变量检查 (336案例: 7年×24角度×2) ===\n');

let invTotal=0, invPassed=0;
const invFailures=[];
for (let year = 2020; year <= 2026; year++) {
  for (let deg=0; deg<360; deg+=15) {
    for (let deg2 of [deg, deg+7]) {
      if (deg2 >= 360) continue;
      invTotal++;
      try {
        const r = currentAlgorithm(deg2, year);
        const errs = checkInvariants(r.palaces);
        if (errs.length === 0) invPassed++;
        else invFailures.push({name:`${year}年${deg2}° ${r.name}`, errs});
      } catch (e) {
        invFailures.push({name:`${year}年${deg2}°`, errs:['异常:'+e.message]});
      }
    }
  }
}
console.log(`不变量: ${invPassed}/${invTotal} 通过`);
if (invFailures.length > 0) {
  invFailures.slice(0,5).forEach(f => console.log(`  ✗ ${f.name}: ${f.errs.join('; ')}`));
}
console.log('');

// === Part 3: 全量输出(供用户对比原版APK) ===
console.log('=== Part 3: 2026年 全部48个角度输出 (供对比原版APK) ===\n');

for (let deg = 0; deg < 360; deg += 15) {
  const r = currentAlgorithm(deg, 2026);
  const isVerified = USER_GROUND_TRUTH[2026] && USER_GROUND_TRUTH[2026][deg];
  const marker = isVerified ? (userFailures.some(f=>f.deg===deg) ? '⚠' : '✓') : '?';

  // 输出宫位摘要
  const parts = [];
  for (let g = 1; g <= 9; g++) {
    if (g === 5) continue;
    const p = r.palaces[g];
    parts.push(`${GONG_NAMES[g]}:${p.shen}${p.tian}${p.di}${p.xing}${p.men}`);
  }
  console.log(`${marker} ${deg}° ${r.name.padEnd(6)} ${r.juLabel.padEnd(6)} | ${parts.join(' | ')}`);
}

console.log('\n图例: ✓=已验证正确  ⚠=已验证但当前算法有误  ?=待验证');

// === Final ===
console.log('\n═══════════════════════════════════════');
console.log(`  用户验证: ${userPassed}/${userTotal} 通过`);
console.log(`  不变量:   ${invPassed}/${invTotal} 通过`);
if (warnings.length) console.log(`  提示:     ${warnings.length} 处寄干真值未标(WARN, 不判失败)`);
if (userFailures.length > 0 || invFailures.length > 0) {
  console.log(`  待修复:   ${userFailures.length} 个案例 / ${invFailures.length} 组不变量`);
  console.log(`  失败案例: ${userFailures.map(f=>f.deg+'°'+f.name).join(', ')}`);
  process.exit(1);
} else {
  console.log('  ✓ 全部通过');
}
console.log('═══════════════════════════════════════');
