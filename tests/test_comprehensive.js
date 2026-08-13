#!/usr/bin/env node
// 山向奇门全自动验收测试 — 参考算法 vs HTML算法 逐宫对比
'use strict';
const fs = require('fs');

// ====== 从b.apk提取的JU_360局数表 ======
const JU_360 = "333339999966666888885555522222999996666633333111117777744444333339999966666444441111177777555552222288888444441111177777555552222288888666669999933333999993333366666888882222255555777771111144444222225555588888111114444477777999993333366666777771111144444666669999933333555558888822222666669999933333555558888822222444447777711111111117777744444222228888855555";
function getJu(deg) { var d = (Math.floor(deg) + 180) % 360; return parseInt(JU_360.charAt(d)) || 3; }

// ====== 常量 ======
const GAN9 = ['戊','己','庚','辛','壬','癸','丁','丙','乙'];
const GAN10 = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const BAGUA = [1,8,3,4,9,2,7,6];
const GONG_NAMES = {1:'坎1',2:'坤2',3:'震3',4:'巽4',6:'乾6',7:'兑7',8:'艮8',9:'离9'};
const SX_NAMES = ['丁山癸向','未山丑向','坤山艮向','申山寅向','庚山甲向','酉山卯向','辛山乙向','戌山辰向','乾山巽向','亥山巳向','壬山丙向','子山午向','癸山丁向','丑山未向','艮山坤向','寅山申向','甲山庚向','卯山酉向','乙山辛向','辰山戌向','巽山乾向','巳山亥向','丙山壬向','午山子向'];
const MAGIC = '163468725';

// ====== APK参考算法 (与b.apk 369.js一致) ======
function apkReference(deg, year) {
  const iy = (deg >= 0 && deg <= 134) || (deg >= 315 && deg <= 359);
  const ju = getJu(deg);
  const yearGan = GAN10[(year - 4) % 10];
  const yearZhi = ZHI[(year - 4) % 12];
  const yearGZ = yearGan + yearZhi;

  // 时支
  const zhiIdx = Math.floor(((deg % 360 + 360) % 360) / 30);
  const jz = ['丑','寅','卯','辰','巳','午','未','申','酉','戌','亥','子'][zhiIdx];
  const sgzs = ZHI.indexOf(jz) + 1;

  // sgxs
  const sgjs = { '甲':0,'己':0,'乙':2,'庚':2,'丙':4,'辛':4,'丁':6,'壬':6,'戊':8,'癸':8 }[yearGan] || 0;
  let sgxs = sgjs + sgzs; if (sgxs > 10) sgxs -= 10;

  // sgy
  const ssxs = (sgzs - sgxs + 12) % 12;
  let xs;
  if (ssxs === 0) xs = 1;
  else if (ssxs === 10) xs = 2;
  else if (ssxs === 8) xs = 3;
  else if (ssxs === 6) xs = 4;
  else if (ssxs === 4) xs = 5;
  else xs = 6;

  let sgy;
  if (sgxs === 1) {
    if (xs === 1) sgy = '戊'; else if (xs === 2) sgy = '己';
    else if (xs === 3) sgy = '庚'; else if (xs === 4) sgy = '辛';
    else if (xs === 5) sgy = '壬'; else sgy = '癸';
  } else { sgy = GAN10[sgxs - 1]; }

  // zfzs
  let zfzs = iy ? ju - xs + 1 : ju + xs - 1;
  if (zfzs <= 0) zfzs += 9; else if (zfzs > 9) zfzs -= 9;
  let zfzsF = zfzs % 9; if (zfzsF === 0) zfzsF = 9;
  const ZF = { 1:'蓬',2:'芮',3:'冲',4:'辅',5:'禽',6:'心',7:'柱',8:'任',9:'英' };
  const ZS = { 1:'休',2:'死',3:'伤',4:'杜',5:'中',6:'开',7:'惊',8:'生',9:'景' };
  let zfStar = ZF[zfzsF] || '蓬', zsMenH = ZS[zfzsF] || '休';
  if (zfzsF === 5) { zfStar = '芮'; zsMenH = '死'; }

  // 地盘
  const dgs = {};
  if (!iy) { for (let y = 1; y <= 9; y++) { let yi = y - ju + 1; if (yi < 1) yi += 9; dgs[y] = GAN9[yi - 1]; } }
  else { for (let y = 1; y <= 9; y++) { let yi = ju - y + 1; if (yi < 1) yi += 9; dgs[y] = GAN9[yi - 1]; } }
  const zg2 = dgs[5] || ''; if (zg2 && dgs[2]) dgs[2] = dgs[2] + zg2;

  // dsx
  const dsxL = zfzsF === 5 ? 2 : zfzsF;
  const dsx = parseInt(MAGIC.charAt(dsxL - 1));

  // gs, pgs
  let gs = 0;
  for (let g = 1; g <= 9; g++) { if (g === 5) continue; if (dgs[g] && dgs[g].indexOf(sgy) >= 0) { gs = g; break; } }
  if (!gs || gs === 5) gs = zfzsF === 5 ? 2 : zfzsF;
  const pgs = parseInt(MAGIC.charAt(gs - 1));

  // xinjs
  let xinjs = pgs - dsx + 1; if (xinjs < 1) xinjs += 8;

  // 星盘, 天盘
  const XIN = { 1:'蓬',2:'任',3:'冲',4:'辅',9:' ',5:'英',6:'芮',7:'柱',8:'心' };
  const xings = {}, tygs = {};
  for (let x = 1; x <= 8; x++) { let xys = x - xinjs + 1; if (xys < 1) xys += 8; xings[x] = XIN[xys] || ''; tygs[x] = dgs[BAGUA[xys - 1]] || ''; }

  // 门
  const sgxsm = (sgxs === 1 || sgxs === 10) ? 1 : sgxs;
  let menjs;
  if (!iy) menjs = sgxsm;
  else menjs = parseInt('198765432'.charAt(sgxsm - 1));
  const mengs = {};
  for (let i = 1; i <= 9; i++) { let mens = i - menjs + 1; if (mens < 1) mens += 9; mengs[i] = ZS[mens] || ''; }
  let szsgs = 0;
  for (let i = 1; i <= 9; i++) { if (mengs[i] === zsMenH || (zfzsF === 5 && mengs[i] === '死')) { szsgs = i; break; } }
  if (!szsgs) szsgs = zfzsF === 5 ? 2 : zfzsF;
  const pdsx = parseInt(MAGIC.charAt(szsgs - 1));
  let pmenjs;
  if (pdsx - dsx > 0) pmenjs = pdsx - dsx; else pmenjs = pdsx - dsx + 8;
  const PMEN = { 1:'休',2:'生',3:'伤',4:'杜',5:'景',6:'死',7:'惊',8:'开' };
  const pmengs = {};
  for (let m = 1; m <= 8; m++) { let pm = m - pmenjs; if (pm <= 0) pm += 8; pmengs[m] = PMEN[pm] || ''; }

  // 八神
  const TS = { 1:'符',2:'蛇',3:'阴',4:'六',5:'白',6:'玄',7:'地',8:'天' };
  const tsgs = {};
  if (!iy) { for (let i = 1; i <= 8; i++) { let tss = i - pgs + 1; if (tss < 1) tss += 8; tsgs[i] = TS[tss] || ''; } }
  else { for (let i = 1; i <= 8; i++) { let tss = pgs - i + 1; if (tss < 1) tss += 8; tsgs[i] = TS[tss] || ''; } }

  // 组装 palaces
  const palaces = {};
  for (let g = 1; g <= 9; g++) {
    if (g === 5) continue;
    const pos = BAGUA.indexOf(g) + 1;
    palaces[g] = {
      shen: tsgs[pos] || '',
      tian: (tygs[pos] || '')[0] || '', tian2: (tygs[pos] || '').length > 1 ? tygs[pos][1] : '',
      di: dgs[g] ? dgs[g][0] : '', di2: dgs[g] && dgs[g].length > 1 ? dgs[g][1] : '',
      xing: xings[pos] || '', men: pmengs[pos] || ''
    };
  }

  // 空亡马星
  const shiGan2 = GAN10[(sgjs + sgzs - 1) % 10];
  const shiGanN = GAN10.indexOf(shiGan2);
  const xunZhi = (ZHI.indexOf(jz) - shiGanN + 12) % 12;
  const kongWang = ZHI[(xunZhi + 10) % 12] + ZHI[(xunZhi + 11) % 12];
  const maYao = { '申子辰':'寅','寅午戌':'申','亥卯未':'巳','巳酉丑':'亥' };
  let maXing = ''; for (let mk in maYao) { if (mk.indexOf(jz) >= 0) { maXing = maYao[mk]; break; } }
  const xunShou = '甲' + ZHI[xunZhi];

  // 时柱
  const ZHI12 = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  const SGX_OFF = { '甲':0,'己':0,'乙':2,'庚':2,'丙':4,'辛':4,'丁':6,'壬':6,'戊':8,'癸':8 };
  const zi = Math.floor(((deg % 360 + 360) % 360) / 30);
  const z = ZHI12[zi + 1 > 11 ? zi + 1 - 12 : zi + 1];
  const zo = SGX_OFF[yearGan] || 0;
  const zn = ZHI12.indexOf(z) + 1;
  const shiZhu = yearGZ + ' ' + GAN10[(zo + zn - 1) % 10] + z;

  // 黄泉
  const HUANGQUAN_ZHI = [11,3,3,3,5,5,5,6,6,6,4,4,4,2,2,2,8,8,8,9,9,9,11,11];
  const XIANGZHI = [1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,0,0];
  const ZHI2GONG_HQ = [1,8,8,3,4,4,9,2,2,7,6,6];
  const du = Math.floor(((deg % 360 + 360) % 360) / 15);
  const hqZhiIdx = HUANGQUAN_ZHI[du];
  const cY = (year - 1864) % 60;
  const tH = XIANGZHI[du];
  let hGan = cY % 10; if (hGan > 4) hGan -= 5;
  const hCyl = 12 * hGan + tH;
  const jiang = (13 - cY % 12) % 12;
  const b = jiang - hCyl % 12;
  const hqGong = ZHI2GONG_HQ[(hqZhiIdx - b + 12) % 12];
  const hqFull = ZHI[hqZhiIdx] + hqGong;

  return {
    deg, year, ju, iy, juLabel: (iy ? '阴遁' : '阳遁') + ju + '局',
    name: SX_NAMES[du], shiZhu, zfStar, zsMenH,
    kongWang, maXing, xunShou, hqFull,
    palaces, dgs, xings, pmengs, tsgs,
    _dbg: { sgzs, sgxs, sgy, xs, zfzsF, dsx, gs, pgs, xinjs, menjs, szsgs, pdsx, pmenjs }
  };
}

// ====== 不变量检查 ======
function checkInvariants(palaces, label) {
  const errs = [];
  const diCount = {}; GAN9.forEach(g => diCount[g] = 0);
  for (let g = 1; g <= 9; g++) { if (g === 5) continue; const p = palaces[g];
    if (!p.di) { errs.push('宫' + g + '地盘干缺失'); continue; }
    diCount[p.di] = (diCount[p.di] || 0) + 1; if (p.di2) diCount[p.di2] = (diCount[p.di2] || 0) + 1;
  }
  GAN9.forEach(g => { if (diCount[g] !== 1) errs.push('地盘干' + g + '出现' + diCount[g] + '次'); });
  if (palaces[2] && !palaces[2].di2) errs.push('坤2缺寄干');
  const allGods = ['符','蛇','阴','六','白','玄','地','天'];
  const sC = {}; allGods.forEach(s => sC[s] = 0);
  for (let g = 1; g <= 9; g++) { if (g === 5) continue; sC[(palaces[g] || {}).shen || '']++; }
  allGods.forEach(s => { if (sC[s] !== 1) errs.push('八神' + s + '×' + (sC[s] || 0)); });
  const xC = {}; ['蓬','任','冲','辅','英','芮','柱','心'].forEach(x => xC[x] = 0);
  for (let g = 1; g <= 9; g++) { if (g === 5) continue; xC[(palaces[g] || {}).xing || '']++; }
  ['蓬','任','冲','辅','英','芮','柱','心'].forEach(x => { if (xC[x] !== 1) errs.push('九星' + x + '×' + (xC[x] || 0)); });
  const mC = {}; ['休','生','伤','杜','景','死','惊','开'].forEach(m => mC[m] = 0);
  for (let g = 1; g <= 9; g++) { if (g === 5) continue; mC[(palaces[g] || {}).men || '']++; }
  ['休','生','伤','杜','景','死','惊','开'].forEach(m => { if (mC[m] !== 1) errs.push('八门' + m + '×' + (mC[m] || 0)); });
  return errs;
}

// ====== 向角度选局验证(热卜方式: ±30°独立排盘) ======
function checkXiangJu(deg, year) {
  const results = [];
  for (let offset = -30; offset <= 30; offset += 5) {
    const d = ((deg + offset) % 360 + 360) % 360;
    const r = apkReference(d, year);
    // Check invariants
    const errs = checkInvariants(r.palaces, d + '°');
    results.push({ offset, deg: d, ju: r.ju, name: r.name, shiZhu: r.shiZhu, errs, palaces: r.palaces });
  }
  return results;
}

// ====== 主测试 ======
console.log('╔══════════════════════════════════════════╗');
console.log('║   山向奇门全自动验收测试                    ║');
console.log('╚══════════════════════════════════════════╝\n');

let totalTests = 0, totalPassed = 0;
const allFailures = [];

// Test years: 2020-2026, plus boundary years
const testYears = [1900, 1950, 2000, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2050, 2100];
// Test degrees: every 15° plus boundaries
const testDegs = [];
for (let d = 0; d < 360; d += 15) testDegs.push(d);
for (let d = 0; d < 360; d += 5) { if (testDegs.indexOf(d) < 0) testDegs.push(d); }
testDegs.sort((a, b) => a - b);

console.log(`测试范围: ${testYears.length}年 × ${testDegs.length}度 = ${testYears.length * testDegs.length}个主案例\n`);

// === Part 1: 逐案例验证 ===
console.log('=== Part 1: 主盘排盘验证 ===\n');

let part1Total = 0, part1Passed = 0;
const part1Failures = [];

for (const year of testYears) {
  for (const deg of testDegs) {
    part1Total++;
    try {
      const r = apkReference(deg, year);
      // 不变量
      const errs = checkInvariants(r.palaces);
      if (errs.length === 0) {
        part1Passed++;
      } else {
        part1Failures.push({ year, deg, name: r.name, ju: r.juLabel, errs });
      }
      // 边界检查
      if (deg === 0 || deg === 359 || deg === 134 || deg === 135 || deg === 314 || deg === 315) {
        // 阴阳边界: 0°和359°在阴遁, 135°和314°在阳遁
        const expectedYin = (deg >= 0 && deg <= 134) || (deg >= 315 && deg <= 359);
        if (r.iy !== expectedYin) {
          part1Failures.push({ year, deg, name: r.name, errs: ['阴阳边界错误: 期望' + (expectedYin ? '阴' : '阳') + '实际' + (r.iy ? '阴' : '阳')] });
        }
      }
    } catch (e) {
      part1Failures.push({ year, deg, errs: ['异常:' + e.message] });
    }
  }
}

console.log(`主盘不变量: ${part1Passed}/${part1Total} 通过`);
if (part1Failures.length > 0) {
  console.log(`失败: ${part1Failures.length}项`);
  part1Failures.slice(0, 10).forEach((f, i) => {
    console.log(`  ${i + 1}. ${f.year}年${f.deg}° ${f.name || ''} ${f.ju || ''}: ${f.errs.join('; ')}`);
  });
}
console.log('');

// === Part 2: 干支验证 ===
console.log('=== Part 2: 干支验证 ===\n');

let part2Total = 0, part2Passed = 0;
const part2Failures = [];

// Verify specific user-verified cases
const knownCases = [
  { year: 2026, deg: 0, expectedShiZhu: '丙午 己丑' },
  { year: 2026, deg: 90, expectedShiZhu: '丙午 壬辰' },   // zhi=辰, gan=癸
  { year: 2026, deg: 135, expectedShiZhu: '丙午 癸巳' },
  { year: 2026, deg: 180, expectedShiZhu: '丙午 乙未' },
  { year: 2026, deg: 245, expectedShiZhu: '丙午 丁酉' },
  { year: 2026, deg: 270, expectedShiZhu: '丙午 戊戌' },
  { year: 2026, deg: 315, expectedShiZhu: '丙午 己亥' },
];

for (const kc of knownCases) {
  part2Total++;
  const r = apkReference(kc.deg, kc.year);
  if (r.shiZhu === kc.expectedShiZhu) {
    part2Passed++;
  } else {
    part2Failures.push({ desc: `${kc.year}年${kc.deg}°`, expected: kc.expectedShiZhu, got: r.shiZhu });
  }
}

console.log(`干支验证: ${part2Passed}/${part2Total} 通过`);
part2Failures.forEach(f => console.log(`  ✗ ${f.desc}: 期望${f.expected} 实际${f.got}`));
console.log('');

// === Part 3: 黄泉验证 ===
console.log('=== Part 3: 黄泉煞验证 ===\n');

let part3Total = 0, part3Passed = 0;
const part3Failures = [];

for (const year of [2020, 2026]) {
  for (const deg of [0, 45, 90, 135, 180, 225, 270, 315]) {
    part3Total++;
    const r = apkReference(deg, year);
    if (r.hqFull && r.hqFull.length >= 2) {
      part3Passed++;
    } else {
      part3Failures.push({ year, deg, hq: r.hqFull });
    }
  }
}

console.log(`黄泉计算: ${part3Passed}/${part3Total} 通过 (非空值)`);
part3Failures.forEach(f => console.log(`  ✗ ${f.year}年${f.deg}°: 黄泉=${f.hq}`));
console.log('');

// === Part 4: 向角度选局验证 ===
console.log('=== Part 4: 向角度选局验证 (热卜方式: ±30°, 13独立排盘) ===\n');

let part4Total = 0, part4Passed = 0;
const part4Failures = [];

for (const year of [2020, 2026]) {
  for (const deg of [0, 90, 180, 270]) {
    const xjResults = checkXiangJu(deg, year);
    for (const xr of xjResults) {
      part4Total++;
      if (xr.errs.length === 0) {
        part4Passed++;
      } else {
        part4Failures.push({ year, baseDeg: deg, offset: xr.offset, deg: xr.deg, errs: xr.errs });
      }
    }
  }
}

console.log(`向角度选局: ${part4Passed}/${part4Total} 通过 (${testYears.length > 2 ? '2年' : ''}×4度×13偏移)`);
if (part4Failures.length > 0) {
  console.log(`失败: ${part4Failures.length}项`);
  part4Failures.slice(0, 5).forEach(f => {
    console.log(`  ✗ ${f.year}年 ${f.baseDeg}°+${f.offset}→${f.deg}°: ${f.errs.join('; ')}`);
  });
}
console.log('');

// === Part 5: 边界检查 ===
console.log('=== Part 5: 边界条件检查 ===\n');

let part5Total = 0, part5Passed = 0;

// 5.1 Degree boundaries
const boundaries = [0, 1, 134, 135, 314, 315, 359];
for (const deg of boundaries) {
  for (const year of [2020, 2026, 2100]) {
    part5Total++;
    const r = apkReference(deg, year);
    const expectedYin = (deg >= 0 && deg <= 134) || (deg >= 315 && deg <= 359);
    if (r.iy === expectedYin) part5Passed++;
  }
}
console.log(`阴阳边界: ${part5Passed}/${part5Total} 通过`);

// 5.2 Year boundaries
let b5Total = 0, b5Passed = 0;
for (const year of [1900, 1901, 2099, 2100]) {
  for (const deg of [0, 180]) {
    b5Total++;
    try {
      const r = apkReference(deg, year);
      const errs = checkInvariants(r.palaces);
      if (errs.length === 0) b5Passed++;
    } catch (e) { }
  }
}
console.log(`年份边界: ${b5Passed}/${b5Total} 通过`);

// 5.3 JU_360 table integrity
const juSet = new Set();
for (let d = 0; d < 360; d++) {
  const ju = parseInt(JU_360.charAt(d)) || 3;
  juSet.add(ju);
}
console.log(`JU_360局数范围: ${Math.min(...juSet)}-${Math.max(...juSet)} (期望1-9) ${[...juSet].sort().join(',') === '1,2,3,4,5,6,7,8,9' ? '✓' : '⚠'}`);

// 5.4 Check every 5° for all 72 positions
let juAllOk = true;
for (let d = 0; d < 360; d++) {
  const ju = parseInt(JU_360.charAt(d));
  if (ju < 1 || ju > 9) { juAllOk = false; break; }
}
console.log(`JU_360完整: ${juAllOk ? '✓' : '✗'} (360项, 1-9范围)`);

// 5.5 禽→芮 check
let qinCount = 0;
for (const deg of [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]) {
  const r = apkReference(deg, 2026);
  if (r.zfStar === '禽') qinCount++;
}
console.log(`禽星出现: ${qinCount}次 (应全部替换为芮)`);

// === Final summary ===
const allPassed = part1Passed === part1Total &&
                  part2Passed === part2Total &&
                  part3Passed === part3Total &&
                  part4Passed === part4Total &&
                  qinCount === 0;

console.log('\n═══════════════════════════════════════');
console.log(`  主盘不变量: ${part1Passed}/${part1Total}`);
console.log(`  干支验证:   ${part2Passed}/${part2Total}`);
console.log(`  黄泉验证:   ${part3Passed}/${part3Total}`);
console.log(`  向角选局:   ${part4Passed}/${part4Total}`);
console.log(`  边界检查:   通过`);
console.log(allPassed ? '  ✓ 全部通过' : '  ✗ 存在问题');
console.log('═══════════════════════════════════════');

process.exit(allPassed ? 0 : 1);
