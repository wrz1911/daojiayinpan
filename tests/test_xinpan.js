#!/usr/bin/env node
// 心盘模糊测试 — 随机组合、边界条件、连续编辑、异常输入
'use strict';

const GAN = ['戊','己','庚','辛','壬','癸','丁','丙','乙'];
const BAGUA = [1,8,3,4,9,2,7,6];
const ALL_XING = ['蓬','任','冲','辅','英','芮','柱','心'];
const ALL_MEN = ['休','生','伤','杜','景','死','惊','开'];
const ALL_SHEN = ['符','蛇','阴','六','白','玄','地','天'];
const GONG_NAMES = {1:'坎1',2:'坤2',3:'震3',4:'巽4',6:'乾6',7:'兑7',8:'艮8',9:'离9'};
const G2STAR_ORIG = {1:'蓬',8:'任',3:'冲',4:'辅',9:'英',2:'芮',7:'柱',6:'心'};
const G2MEN_ORIG  = {1:'休',8:'生',3:'伤',4:'杜',9:'景',2:'死',7:'惊',6:'开'};
const SM_ORDER = [1,8,3,4,9,2,7,6];
const NI_GOD = [1,6,7,2,9,4,3,8];

function xpBuildFw(juGong, isYin) {
  const fw = []; let gp = juGong;
  for (let f = 0; f < 9; f++) { fw.push(gp); gp = isYin ? (gp===1?9:gp-1) : (gp===9?1:gp+1); }
  return fw;
}

let _xpData = {}, _xpManual = {}, _xpCalcJu = '', _xpBgIsYin = true, _xpBgSizhu = '';
let _xpBgPalaces = {};

function actualAutoFill(anchorGong) {
  const d = _xpData[anchorGong];
  if (!d || !d.di || !d.tian || !d.shen) return;
  const ad = { shen:d.shen||'', tian:d.tian||'', tian2:d.tian2||'', di:d.di||'', di2:d.di2||'',
    xing:d.xing||'', men:d.men||'' };
  const isYin = _xpBgIsYin;
  const dG = ad.di[0]; const dI = GAN.indexOf(dG);
  let ju = 0;
  if (dI >= 0) { ju = isYin ? (dI+anchorGong)%9 : (anchorGong-dI+9)%9; if (ju===0) ju=9; }
  if (ju < 1 || ju > 9) ju = anchorGong;
  const fwDi = xpBuildFw(ju, isYin);
  const diMap = {}; let zg = '';
  for (let fi = 0; fi < 9; fi++) { if (fwDi[fi] === 5) zg = GAN[fi]; else diMap[fwDi[fi]] = GAN[fi]; }
  if (zg && diMap[2]) diMap[2] = diMap[2] + zg;

  const godOrder = isYin ? NI_GOD : SM_ORDER;
  const gIdx = ALL_SHEN.indexOf(ad.shen||''); if (gIdx<0) gIdx=0;
  const ga = godOrder.indexOf(anchorGong); if (ga<0) ga=0;
  const godMap = {};
  for (let i = 0; i < 8; i++) godMap[godOrder[i]] = ALL_SHEN[(i+gIdx-ga+8)%8];

  const STAR_SEQ = SM_ORDER.map(g => G2STAR_ORIG[g]);
  const MEN_SEQ = SM_ORDER.map(g => G2MEN_ORIG[g]);
  const starMap = {}, menMap = {};
  const ai = SM_ORDER.indexOf(anchorGong);
  let stI = STAR_SEQ.indexOf(ad.xing||''); if (stI<0) stI=0;
  let meI = MEN_SEQ.indexOf(ad.men||''); if (meI<0) meI=stI;
  for (let i = 0; i < 8; i++) { starMap[SM_ORDER[i]] = STAR_SEQ[(i+stI-ai+8)%8]; menMap[SM_ORDER[i]] = MEN_SEQ[(i+meI-ai+8)%8]; }

  const tG = (ad.tian||'')[0]; let srcG = 0;
  [1,2,3,4,6,7,8,9].forEach(gk => { if (!srcG && diMap[gk] && diMap[gk].indexOf(tG)>=0) srcG = gk; });
  if (!srcG || srcG===5) srcG = anchorGong;
  const isFL = !!(ad.tian && ad.di && ad.tian[0]===ad.di[0]);
  const tianMap = {};
  if (isFL) { for (let ti = 0; ti < 8; ti++) tianMap[BAGUA[ti]] = diMap[BAGUA[ti]] || ''; }
  else { const sb = BAGUA.indexOf(srcG), db = BAGUA.indexOf(anchorGong);
    for (let ti = 0; ti < 8; ti++) tianMap[BAGUA[ti]] = diMap[BAGUA[(sb+ti-db+8)%8]] || ''; }

  const diMapBg = {};
  [1,2,3,4,6,7,8,9].forEach(g => {
    _xpData[g] = { shen:'',tian:'',di:'',tian2:'',di2:'',xing:'',men:'',ma:false,kong:false };
    _xpManual[g] = false;
    if (g === anchorGong) {
      _xpData[g].shen = ad.shen; _xpData[g].xing = ad.xing; _xpData[g].men = ad.men;
      _xpData[g].tian = (tianMap[g]||'')[0] || ad.tian;
      _xpData[g].tian2 = ad.tian2 || (tianMap[g]||'')[1] || '';
      _xpData[g].di = (diMap[g]||'')[0] || ad.di;
      _xpData[g].di2 = ad.di2 || (diMap[g]||'')[1] || '';
      return;
    }
    _xpData[g].shen = godMap[g]||'';
    _xpData[g].tian = (tianMap[g]||'')[0]||''; _xpData[g].tian2 = (tianMap[g]||'')[1]||'';
    _xpData[g].di = (diMapBg[g]||diMap[g]||'')[0]||''; _xpData[g].di2 = (diMapBg[g]||diMap[g]||'')[1]||'';
    _xpData[g].xing = starMap[g]||''; _xpData[g].men = menMap[g]||'';
  });
}

function checkInvariants() {
  const errs = [];
  const diCount = {}; GAN.forEach(g => diCount[g]=0);
  for (let g = 1; g <= 9; g++) { if(g===5)continue; const d=_xpData[g]||{}; if(!d.di){errs.push('宫'+g+'地缺失');continue;} diCount[d.di]=(diCount[d.di]||0)+1; if(d.di2)diCount[d.di2]=(diCount[d.di2]||0)+1; }
  GAN.forEach(g => { if (diCount[g]!==1) errs.push('地'+g+'出现'+diCount[g]+'次'); });
  if (_xpData[2] && !_xpData[2].di2) errs.push('坤2缺寄干');
  const sC={};ALL_SHEN.forEach(s=>sC[s]=0);for(let g=1;g<=9;g++){if(g===5)continue;sC[(_xpData[g]||{}).shen||'']++;}
  ALL_SHEN.forEach(s => { if(sC[s]!==1) errs.push('神'+s+'出现'+(sC[s]||0)+'次'); });
  const mC={};ALL_MEN.forEach(m=>mC[m]=0);for(let g=1;g<=9;g++){if(g===5)continue;mC[(_xpData[g]||{}).men||'']++;}
  ALL_MEN.forEach(m => { if(mC[m]!==1) errs.push('门'+m+'出现'+(mC[m]||0)+'次'); });
  const xC={};ALL_XING.forEach(x=>xC[x]=0);for(let g=1;g<=9;g++){if(g===5)continue;xC[(_xpData[g]||{}).xing||'']++;}
  ALL_XING.forEach(x => { if(xC[x]!==1) errs.push('星'+x+'出现'+(xC[x]||0)+'次'); });
  return errs;
}

function reset() {
  for (let g = 1; g <= 9; g++) { _xpData[g]={shen:'',tian:'',di:'',tian2:'',di2:'',xing:'',men:'',ma:false,kong:false}; _xpManual[g]=false; }
}

// ====== TEST SUITES ======
let total = 0, passed = 0;
const failures = [];
const suites = [];

function runSuite(name, tests) {
  const sf = [];
  let st=0, sp=0;
  for (const tc of tests) {
    st++; total++;
    reset();
    let ok = true;
    try {
      tc.run();
      const errs = checkInvariants();
      if (errs.length > 0) { ok = false; sf.push({name: tc.name, errs}); }
    } catch(e) { ok = false; sf.push({name: tc.name, errs: ['异常:'+e.message]}); }
    if (ok) { sp++; passed++; } else { failures.push(sf[sf.length-1]); }
  }
  suites.push({ name, total: st, passed: sp, failed: st-sp });
}

// ====== TEST 1: All SHEN combinations ======
runSuite('所有八神组合(8×9宫×9干)', (() => {
  const tests = [];
  for (let si = 0; si < ALL_SHEN.length; si++) {
    [1,2,3,4,6,7,8,9].forEach(ag => {
      for (let di = 0; di < 9; di++) {
        tests.push({ name: '神='+ALL_SHEN[si]+' 宫='+ag+' 天='+GAN[di]+' 地='+GAN[di],
          run() { _xpBgIsYin=true; _xpData[ag]={shen:ALL_SHEN[si],tian:GAN[di],di:GAN[di],tian2:'',di2:'',xing:ALL_XING[di%8],men:ALL_MEN[di%8],ma:false,kong:false}; actualAutoFill(ag); } });
      }
    });
  }
  return tests;
})());

// ====== TEST 2: Fuzz random (2000 random combos) ======
runSuite('随机模糊(2000项)', (() => {
  const tests = [];
  for (let i = 0; i < 2000; i++) {
    const isYin = Math.random() > 0.5;
    const ag = [1,2,3,4,6,7,8,9][Math.floor(Math.random()*8)];
    const shen = ALL_SHEN[Math.floor(Math.random()*8)];
    const di = GAN[Math.floor(Math.random()*9)];
    const tian = GAN[Math.floor(Math.random()*9)];
    const xing = ALL_XING[Math.floor(Math.random()*8)];
    const men = ALL_MEN[Math.floor(Math.random()*8)];
    tests.push({ name: 'fuzz#'+i+' '+GONG_NAMES[ag]+' '+(isYin?'阴':'阳'),
      run() { _xpBgIsYin=isYin; _xpData[ag]={shen,tian,di,tian2:'',di2:'',xing,men,ma:false,kong:false}; actualAutoFill(ag); } });
  }
  return tests;
})());

// ====== TEST 3: Consecutive auto-fills (same data, multiple calls) ======
runSuite('连续推算(重复调用100次)', (() => {
  const tests = [];
  for (let i = 0; i < 100; i++) {
    tests.push({ name: 'consecutive#'+i,
      run() { _xpBgIsYin=true; _xpData[3]={shen:'符',tian:'壬',di:'辛',tian2:'',di2:'',xing:'辅',men:'杜',ma:false,kong:false}; actualAutoFill(3); } });
  }
  return tests;
})());

// ====== TEST 4: Multi-palace edit before fill (edit 宫A, then宫B, fill from B) ======
runSuite('多宫编辑后推算(100项)', (() => {
  const tests = [];
  for (let i = 0; i < 100; i++) {
    const ag1 = [1,2,3,4,6,7,8,9][Math.floor(Math.random()*8)];
    let ag2 = [1,2,3,4,6,7,8,9][Math.floor(Math.random()*8)];
    while (ag2===ag1) ag2 = [1,2,3,4,6,7,8,9][Math.floor(Math.random()*8)];
    const di2 = GAN[Math.floor(Math.random()*9)];
    tests.push({ name: 'multi-edit#'+i+' 编辑宫'+ag1+'→宫'+ag2,
      run() {
        _xpBgIsYin=true;
        _xpData[ag1]={shen:'符',tian:'戊',di:'戊',tian2:'',di2:'',xing:'蓬',men:'休',ma:false,kong:false};
        actualAutoFill(ag1); // first fill
        // Now edit ag2 with different values
        _xpData[ag2].shen = ALL_SHEN[i%8];
        _xpData[ag2].tian = GAN[(i+3)%9]; _xpData[ag2].tian2 = '';
        _xpData[ag2].di = GAN[(i+5)%9]; _xpData[ag2].di2 = '';
        _xpData[ag2].xing = ALL_XING[(i+2)%8];
        _xpData[ag2].men = ALL_MEN[(i+4)%8];
        _xpManual[ag2] = true;
        actualAutoFill(ag2); // second fill
      } });
  }
  return tests;
})());

// ====== TEST 5: Edge cases ======
runSuite('边界条件', [
  { name: '中5干=戊(阳遁5局)', run() { _xpBgIsYin=false; _xpData[5%9===5?6:5]={shen:'符',tian:'戊',di:'戊',tian2:'',di2:'',xing:'蓬',men:'休',ma:false,kong:false}; actualAutoFill(5%9===5?6:5); } },
  { name: '阳遁1局坎1戊', run() { _xpBgIsYin=false; _xpData[1]={shen:'符',tian:'戊',di:'戊',tian2:'',di2:'',xing:'蓬',men:'休',ma:false,kong:false}; actualAutoFill(1); } },
  { name: '阳遁9局离9丙', run() { _xpBgIsYin=false; _xpData[9]={shen:'符',tian:'丙',di:'戊',tian2:'',di2:'',xing:'冲',men:'伤',ma:false,kong:false}; actualAutoFill(9); } },
  { name: '阴遁5局(中宫寄坤)', run() { _xpBgIsYin=true; _xpData[4]={shen:'符',tian:'己',di:'己',tian2:'',di2:'',xing:'辅',men:'杜',ma:false,kong:false}; actualAutoFill(4); } },
  { name: '天盘=寄干位(坤2天=中5干)', run() { _xpBgIsYin=true; _xpData[2]={shen:'符',tian:'戊',di:'辛',tian2:'',di2:'',xing:'辅',men:'杜',ma:false,kong:false}; actualAutoFill(2); } },
  { name: '全部宫=符(仅锚点)', run() { _xpBgIsYin=true; _xpData[1]={shen:'符',tian:'壬',di:'癸',tian2:'',di2:'',xing:'柱',men:'惊',ma:false,kong:false}; actualAutoFill(1); } },
  { name: '阳遁 天盘≠地盘 坤2', run() { _xpBgIsYin=false; _xpData[2]={shen:'符',tian:'庚',di:'戊',tian2:'',di2:'',xing:'冲',men:'伤',ma:false,kong:false}; actualAutoFill(2); } },
  { name: '锚点离9 天=癸(坤寄干位)', run() { _xpBgIsYin=true; _xpData[9]={shen:'符',tian:'癸',di:'己',tian2:'',di2:'',xing:'任',men:'生',ma:false,kong:false}; actualAutoFill(9); } },
]);

// ====== REPORT ======
console.log('╔══════════════════════════════════════════╗');
console.log('║     心盘模糊测试 — 隐藏Bug探测           ║');
console.log('╚══════════════════════════════════════════╝');
console.log('');

for (const s of suites) {
  const status = s.failed === 0 ? '✓' : '✗';
  console.log(status + ' ' + s.name.padEnd(40) + ' ' + s.passed + '/' + s.total);
}

console.log('');
console.log('──────────────────────────────────────────');
console.log('总计: ' + total + ' | 通过: ' + passed + ' | 失败: ' + (total-passed));

if (failures.length > 0) {
  console.log('');
  console.log('=== 失败详情 (' + failures.length + '项) ===');
  for (let fi = 0; fi < Math.min(failures.length, 30); fi++) {
    const f = failures[fi];
    console.log('  ['+(fi+1)+'] ' + f.name);
    for (const e of f.errs) console.log('    ✗ ' + e);
  }
  if (failures.length > 30) console.log('  ... 还有'+(failures.length-30)+'项');
  process.exit(1);
} else {
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  全部通过 ✓  无隐藏Bug');
  console.log('═══════════════════════════════════════════');
}
