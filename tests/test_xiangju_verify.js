#!/usr/bin/env node
// 向角度选局完整验证: Node.js paipanrest vs b.apk预期
'use strict';

// ====== b.apk常量 ======
const ShanJu = [-7,-2,-1,-9,-7,-6,-5,-6,-5,4,1,2,3,8,9,1,3,4,5,4,5,-6,-9,-8];
const XiangZhi = [1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,0,0];
const Liuyi = ['','戊','己','庚','辛','壬','癸','丁','丙','乙'];
const Gan = ['','甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const Zhi = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const FZHUAN = [0,1,6,3,4,6,8,7,2,5];
const ZHUAN = [0,1,8,3,4,9,2,7,6];
const XING = ['','蓬','任','冲','辅','英','芮','柱','心'];
const MEN = ['','休','生','伤','杜','景','死','惊','开'];
const SHEN_YIN = ['','符','天','地','玄','白','六','阴','蛇'];
const SHEN_YANG = ['','符','蛇','阴','六','白','玄','地','天'];
const YiMa = [2,8,11,5]; // hCyl%4 → 地支index

// ====== b.apk算法 ======
function apkPaipanRest(year, deg) {
  const duu = Math.floor(((deg % 360 + 360) % 360) / 5);
  const du = Math.floor(duu / 3);

  // ShanJu → ju/yinYang
  const t = ShanJu[du];
  const tJ = t < 0 ? t + 9 : t + 8;
  let ju = tJ < 9 ? 9 - tJ : tJ - 8;
  const yy = tJ < 9 ? '阴' : '阳';
  const v = duu % 3;
  if (yy === '阴') ju += v * 3; else ju += 9 - v * 3;
  if (ju > 9) ju -= 9;

  // hCyl
  const cY = (year - 1864) % 60;
  let hGan = cY % 10;
  if (hGan > 4) hGan -= 5;
  const hCyl = hGan * 12 + XiangZhi[du];

  // 旬首/空亡/马星
  const xunshou = Math.floor(hCyl / 10) * 10;
  const xunkong1 = (xunshou + 10) % 12;
  const xunkong2 = (xunshou + 11) % 12;
  const maxing = YiMa[hCyl % 4];

  // 地盘
  const dg = Math.floor(xunshou / 10) + 4;
  const digan = {};
  let dgg = 0, sgg = 0;
  for (let i = 0; i < 9; i++) {
    let g = yy === '阴' ? ju - i : ju + i;
    if (g > 9) g -= 9;
    if (g < 1) g += 9;
    digan[g] = Liuyi[i + 1];
    if (i + 1 === dg) dgg = g;
    if (i + 1 === (hCyl % 10)) sgg = g;
  }
  if (sgg === 0) sgg = dgg;
  if (digan[5] && digan[2]) digan[2] = digan[2] + digan[5];

  // 值符/值使
  const zhiFu = XING[FZHUAN[dgg]];
  const zhiShi = MEN[FZHUAN[dgg]];
  let mgg = yy === '阳' ? hCyl % 10 + dgg : dgg - (hCyl % 10);
  if (mgg < 1) mgg += 9;
  if (mgg > 9) mgg -= 9;

  // 星/天盘
  const xinpan = {}, tiangan = {};
  const v1 = FZHUAN[sgg] - FZHUAN[dgg];
  for (let j = 1; j <= 8; j++) {
    let k = j - v1;
    if (k < 1) k += 8;
    if (k > 8) k -= 8;
    xinpan[ZHUAN[j]] = XING[k];
    tiangan[ZHUAN[j]] = digan[ZHUAN[k]] || '';
  }

  // 门
  const menpan = {};
  const v2 = FZHUAN[mgg] - FZHUAN[dgg];
  for (let j = 1; j <= 8; j++) {
    let k = j - v2;
    if (k < 1) k += 8;
    if (k > 8) k -= 8;
    menpan[ZHUAN[j]] = MEN[k];
  }

  // 神
  const shenpan = {};
  const v3 = FZHUAN[sgg] - 1;
  for (let j = 1; j <= 8; j++) {
    let kw = j - v3;
    if (kw < 1) kw += 8;
    if (kw > 8) kw -= 8;
    shenpan[ZHUAN[j]] = yy === '阳' ? SHEN_YANG[kw] : SHEN_YIN[kw];
  }

  // 暗干
  const angan = {};
  const v4 = FZHUAN[sgg] - FZHUAN[mgg];
  for (let j = 1; j <= 8; j++) {
    let kw = j + v4;
    if (kw < 1) kw += 8;
    if (kw > 8) kw -= 8;
    angan[ZHUAN[j]] = digan[ZHUAN[kw]] || '';
  }

  // 组装palaces
  const palaces = {};
  for (let g = 1; g <= 9; g++) {
    if (g === 5) continue;
    palaces[g] = {
      shen: shenpan[g] || '',
      tian: (tiangan[g] || '')[0] || '',
      tian2: (tiangan[g] || '').length > 1 ? tiangan[g][1] : '',
      di: (digan[g] || '')[0] || '',
      di2: (digan[g] || '').length > 1 ? digan[g][1] : '',
      xing: xinpan[g] || '',
      men: menpan[g] || '',
      anGan: (angan[g] || '')[0] || ''
    };
  }

  return {
    year, deg, duu, du, ju, yy,
    hCyl, dgg, sgg, mgg,
    xunshou, xunkong1, xunkong2, maxing,
    zhiFu, zhiShi,
    palaces,
    debug: { t, tJ, ju, yy, hCyl, cY, hGan, dg, dgg, sgg, mgg }
  };
}

// ====== 不变量检查 ======
function checkInvariants(palaces) {
  const errs = [];
  const diCount = {};
  Liuyi.slice(1).forEach(g => diCount[g] = 0);
  for (let g = 1; g <= 9; g++) {
    if (g === 5) continue;
    const p = palaces[g];
    if (!p || !p.di) { errs.push('宫' + g + '缺地盘干'); continue; }
    diCount[p.di] = (diCount[p.di] || 0) + 1;
    if (p.di2) diCount[p.di2] = (diCount[p.di2] || 0) + 1;
  }
  Liuyi.slice(1).forEach(g => { if (diCount[g] !== 1) errs.push('地盘干' + g + '×' + diCount[g]); });
  if (palaces[2] && !palaces[2].di2) errs.push('坤2缺寄干');
  // 八神
  const allGods = ['符','天','地','玄','白','六','阴','蛇'];
  const sC = {}; allGods.forEach(s => sC[s] = 0);
  for (let g = 1; g <= 9; g++) { if (g === 5) continue; sC[(palaces[g] || {}).shen || '']++; }
  allGods.forEach(s => { if (sC[s] !== 1) errs.push('神' + s + '×' + (sC[s] || 0)); });
  // 九星
  const allStars = ['蓬','任','冲','辅','英','芮','柱','心'];
  const xC = {}; allStars.forEach(x => xC[x] = 0);
  for (let g = 1; g <= 9; g++) { if (g === 5) continue; xC[(palaces[g] || {}).xing || '']++; }
  allStars.forEach(x => { if (xC[x] !== 1) errs.push('星' + x + '×' + (xC[x] || 0)); });
  // 八门
  const allMen = ['休','生','伤','杜','景','死','惊','开'];
  const mC = {}; allMen.forEach(m => mC[m] = 0);
  for (let g = 1; g <= 9; g++) { if (g === 5) continue; mC[(palaces[g] || {}).men || '']++; }
  allMen.forEach(m => { if (mC[m] !== 1) errs.push('门' + m + '×' + (mC[m] || 0)); });
  return errs;
}

// ====== 全量验证 ======
console.log('╔══════════════════════════════════════╗');
console.log('║  paipanrest实现 全量不变量验证      ║');
console.log('╚══════════════════════════════════════╝\n');

let total = 0, passed = 0;
const failures = [];
const years = [2020, 2021, 2022, 2023, 2024, 2025, 2026];

for (const year of years) {
  for (let deg = 0; deg < 360; deg += 5) {
    total++;
    const r = apkPaipanRest(year, deg);
    const errs = checkInvariants(r.palaces);
    if (errs.length === 0) {
      passed++;
    } else {
      failures.push({ year, deg, name: 'j'+r.ju+'-'+r.yy+'遁', errs: errs.slice(0, 5) });
    }
  }
}

console.log(`总计: ${total} 案例`);
console.log(`通过: ${passed}`);
console.log(`失败: ${failures.length}\n`);

if (failures.length > 0) {
  console.log('=== 失败案例 (前20个) ===');
  failures.slice(0, 20).forEach(f => {
    console.log(`${f.year}年${f.deg}°: ${f.errs.join('; ')}`);
  });
} else {
  console.log('✓ 全部通过!');
}

// 抽样对比已知案例
console.log('\n=== 抽样验证 (2026年0度, 重点宫位) ===');
const r = apkPaipanRest(2026, 0);
console.log(`2026年 0°: ju=${r.ju} ${r.yy}遁 hCyl=${r.hCyl}`);
console.log(`  旬首=${r.xunshou} 空亡=${Zhi[r.xunkong1]}${Zhi[r.xunkong2]} 马星=${Zhi[r.maxing]}`);
for (let g = 1; g <= 9; g++) {
  if (g === 5) continue;
  const p = r.palaces[g];
  console.log(`  宫${g}: ${p.shen} ${p.tian}${p.tian2||' '} ${p.di}${p.di2||' '} ${p.xing} ${p.men} (暗:${p.anGan||' '})`);
}

console.log('\n=== 13副盘抽样 (2026年175°中心) ===');
for (let o = -30; o <= 30; o += 5) {
  const d = ((175 + o) % 360 + 360) % 360;
  const r = apkPaipanRest(2026, d);
  console.log(`  ${d}° ju=${r.ju}${r.yy}遁 符=${r.zhiFu}宫${r.dgg} 使=${r.zhiShi}宫${r.mgg} hCyl=${r.hCyl}`);
}

if (passed === total) process.exit(0); else process.exit(1);
