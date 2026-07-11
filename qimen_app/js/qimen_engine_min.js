// 奇门遁甲排盘引擎  作者: 地天泰  微信/手机: 18626256203
// 项目地址: https://github.com/wrz1911/daojiayinpan
// 开源依赖: tyme4ts (MIT) https://github.com/6tail/tyme4ts
// 开源依赖: Tauri (MIT) https://github.com/tauri-apps/tauri
(function(){
const _global = typeof globalThis !== 'undefined' ? globalThis : window;
function _t() { return _global.tyme4j || window.tyme || {}; }

// ====== 引擎常量: 干支/八门/九星/八神/飞转宫映射 ======
const GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const GAN6 = ['戊','己','庚','辛','壬','癸','丁','丙','乙'];
const MEN = ['','休','生','伤','杜','景','死','惊','开'];
const XING = ['','蓬','任','冲','辅','英','芮','柱','心'];
const SHEN_Y = ['','符','天','地','玄','白','六','阴','蛇'];
const SHEN_A = ['','符','蛇','阴','六','白','玄','地','天'];
const ZHUAN = [0,1,8,3,4,9,2,7,6];
const FZHUAN = [0,1,6,3,4,6,8,7,2,5];
const YIMA = [2,11,8,5];
const ZHI2G = [1,8,8,3,4,4,9,2,2,7,6,6];
const SG_MAP = {甲:0,己:0,乙:2,庚:2,丙:4,辛:4,丁:6,壬:6,戊:8,癸:8};
const HE = [1,0,11,10,9,8,7,6,5,4,3,2];
const STN = ['冬至','小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪'];
const MNM = ['','正月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','腊月'];
const DNM = ['','初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
const KE_Y = '子丑寅卯辰巳';
const KE_N = '午未申酉戌亥';
const XING_G = {'戊':3,'己':2,'庚':8,'辛':9,'壬':4,'癸':4};
const MU_G = {'癸':2,'戊':6,'丙':6,'乙':6,'庚':8,'丁':8,'己':8,'辛':4};
const MEN_PO = {休:[1],生:[8,3,4],伤:[8,3,4],杜:[8,3,4],景:[9,2,7,6],死:[9,2,7,6],惊:[9,2,7,6],开:[9,2,7,6]};
const MP = {4:'ma1',9:'ma2',2:'ma2',3:'ma3',7:'ma4',8:'ma3',1:'ma4',6:'ma4'};
const TMS = ['神后子','大吉丑','功曹寅','太冲卯','天罡辰','太乙巳','胜光午','小吉未','传送申','从魁酉','河魁戌','登明亥'];
const DHS = ['建','除','满','平','定','执','破','危','成','收','开','闭'];

function pad(n) { return n < 10 ? '0' + n : '' + n; }
const zi = s => ZHI.indexOf(s)

function getKeGan(dayStem, hourBranch, keZhi) {
  const sgjs0 = SG_MAP[dayStem] || 0;
  let shiGanI = sgjs0 + ZHI.indexOf(hourBranch) + 1;
  if (shiGanI > 10) shiGanI -= 10;
  const shiGanC = GAN[shiGanI - 1];
  const sgjs = SG_MAP[shiGanC] || 0;
  let kg = sgjs + keZhi + 1;
  if (kg > 10) kg -= 10;
  return kg - 1;
}

function qimenChart(opts) {
  const { year, month, day, hour, minute = 0, panType = 1, customJu } = opts;
  const pt = panType;
  const mi = minute;
  // 子时(23点起)算次日: 日期推进1天, 时归0(子时)
  const origHour = hour;
  let calYear = year, calMonth = month, calDay = day, calHour = hour;
  if (origHour >= 23) {
    const d = new Date(year, month-1, day, 23, mi, 0);
    d.setDate(d.getDate() + 1);
    calYear = d.getFullYear(); calMonth = d.getMonth()+1; calDay = d.getDate();
    calHour = 0;
  }
  const st = _t().SolarTime.fromYmdHms(calYear, calMonth, calDay, calHour, mi, 0);
  const sch = st.getSixtyCycleHour();
  const yGz = sch.getYear(), mGz = sch.getMonth(), dGz = sch.getDay(), hGz = sch.getSixtyCycle();
  const yI = yGz.getIndex(), mI = mGz.getIndex(), dI = dGz.getIndex(), hI = hGz.getIndex();
  const hG = hGz.getHeavenStem().getIndex(), hZ = hGz.getEarthBranch().getIndex();
  const lh = st.getLunarHour(), ld = lh.getLunarDay(), lm = ld.getLunarMonth();
  const lY = lm.getLunarYear().getYear();
  const lMr = lm.getMonthWithLeap();
  const lM = Math.abs(lMr), lD = ld.getDay(), isLeap = lMr < 0;
  const tt = st.getTerm(), ti = (tt.getIndex() % 24 + 24) % 24;
  let isY = ti >= 12;
  const yueZhi = (lM + 1) % 12;
  const jiang = HE[yueZhi];
  const jz = ZHI[jiang];
  let v = lM;
  if (v === 0) v = 12;

  // 局数计算: 自动公式 或 自选局直接指定
  let juN;
  if (customJu) {
    juN = customJu.number;
  } else {
    juN = (yI % 12 + 1) + v + lD + (hI % 12 + 1);
    juN = juN % 9;
    if (juN === 0) juN = 9;
  }
  if (customJu) { isY = customJu.yinYang === '阴'; }

  // 刻盘: 分柱干支计算
  const isKePan = pt === 2;
  let mGzStr = '', hCyl = hI, keGanIdx = hG, cMin = hI;
  if (isKePan) {
    // 使用子时修正前的原始小时判断奇偶
    const tMin = (origHour % 2 === 0) ? 60 + mi : mi;
    // 刻柱 = 时柱天干*12 + floor(tMin/10)
    let keG = hCyl % 10;
    if (keG > 4) keG -= 5;
    const kz = Math.floor(tMin / 10);
    cMin = (keG * 12 + kz) % 60;
    const keGan = cMin % 10;
    const keZhi = cMin % 12;
    mGzStr = `\u3000<font color=red>${GAN[keGan]}${ZHI[keZhi]}</font>`;
    keGanIdx = keGan;
  }
  // 刻盘局数公式: v+lD+(hCyl%12+1)+(cMin%12+1)+cY%12+1
  // 时盘局数公式: cY%12+1+v+lD+(hCyl%12+1)
  let ju;
  if (customJu) {
    ju = customJu.number;
  } else if (isKePan) {
    ju = v + lD + (hCyl % 12 + 1) + (cMin % 12 + 1) + (yI % 12 + 1);
  } else {
    ju = (yI % 12 + 1) + v + lD + (hCyl % 12 + 1);
  }
  if (!customJu) { ju = ju % 9; if (ju === 0) ju = 9; }
  // 局数计算后用刻柱替换hCyl做后续计算(地盘/星门/神)
  if (isKePan) { hCyl = cMin; }

  // 地盘飞步: 阴遁逆排/阳遁顺排六仪, 找旬首落宫(dgg)和时干落宫(sgg)
  const xs = Math.floor(hCyl / 10) * 10;
  const xsG = GAN[xs % 10], xsZ = ZHI[xs % 12];
  const xk1 = (xs + 10) % 12, xk2 = (xs + 11) % 12;
  const maZ = YIMA[(isKePan ? hCyl : hI) % 4], maG = ZHI2G[maZ];
  const di = {};
  let dgg = 0, sgg = 0;
  const hiddenIdx = (xs / 10 % 6) + 4;
  for (let i = 0; i < 9; i++) {
    let g = isY ? ju - i : ju + i;
    if (g > 9) g -= 9;
    if (g < 1) g += 9;
    const gan = GAN6[i];
    if (g !== 5) di[g] = gan;
    if (gan === GAN[hiddenIdx]) dgg = g;
    if (gan === GAN[isKePan ? keGanIdx : hI % 10]) sgg = g;
  }
  if (sgg === 0) sgg = dgg;
  // 保留dgg=5(中宫), 值符/值使特殊处理天禽星, 不改变dgg值

  let zg = '';
  for (let i = 0; i < 9; i++) {
    let g = isY ? ju - i : ju + i;
    if (g > 9) g -= 9;
    if (g < 1) g += 9;
    if (g === 5) { zg = GAN6[i]; break; }
  }
  if (di[2] && zg) di[2] = di[2][0] + zg;

  // 值符/值使: 旬首落宫→查FZHUAN表→对应星/门
  const zfI = FZHUAN[dgg], zfN = dgg === 5 ? '禽' : XING[zfI];
  const zsN = MEN[FZHUAN[dgg]];
  const effGan = isKePan ? keGanIdx : hI % 10;
  let mg = dgg;
  if (isY) mg = dgg - effGan;
  else mg = effGan + dgg;
  if (mg < 1) mg += 9;
  if (mg > 9) mg -= 9;

  // 星盘+天盘: 值符星→旋转天盘干和九星到各宫
  const xingM = {}, tianM = {};
  const vS = FZHUAN[sgg] - FZHUAN[dgg];
  for (let i = 1; i < 9; i++) {
    let j = i - vS;
    if (j < 1) j += 8;
    if (j > 8) j -= 8;
    const g = ZHUAN[i];
    xingM[g] = XING[j];
    tianM[g] = (di[ZHUAN[j]] || '').slice(0, 2);
  }

  // 门盘: 值使门→旋转八门到各宫
  const menM = {};
  const vM = FZHUAN[mg] - FZHUAN[dgg];
  for (let i = 1; i < 9; i++) {
    let j = i - vM;
    if (j < 1) j += 8;
    if (j > 8) j -= 8;
    menM[ZHUAN[i]] = MEN[j];
  }

  // 神盘: 值符→旋转八神到各宫, 阳遁顺排/阴遁逆排
  const shenM = {};
  const vSh = FZHUAN[sgg] - 1;
  const so = isY ? SHEN_Y : SHEN_A;
  for (let i = 1; i < 9; i++) {
    let j = i - vSh;
    if (j < 1) j += 8;
    if (j > 8) j -= 8;
    shenM[ZHUAN[i]] = so[j];
  }

  // 暗干: 先正常旋转排布, 再检查1宫三合(暗干=天干=地盘)决定是否伏吟重排
  const agM = {};
  let isFuAll = false;
  // 第一步: 正常排暗干
  const vA = FZHUAN[sgg] - FZHUAN[mg];
  for (let i = 1; i < 9; i++) {
    let j = i + vA;
    if (j < 1) j += 8;
    if (j > 8) j -= 8;
    agM[ZHUAN[i]] = di[ZHUAN[j]] || '';
  }
  agM[5] = '';
  // 第二步: 检查1宫 暗干=天干=地盘 三合条件
  const ag1 = agM[1] || '', tian1 = (tianM[1] || '')[0] || '', di1 = (di[1] || '')[0] || '';
  if (ag1 === tian1 && ag1 === di1 && ag1 !== '') {
    isFuAll = true;
    const liuyi = [0, 4, 5, 6, 7, 8, 9, 3, 2, 1];
    let v6 = hCyl % 10;
    if (v6 === 0) v6 = liuyi[Math.floor(hCyl / 10) + 1];
    let j6 = 1;
    for (; j6 < 10; j6++) if (v6 === liuyi[j6]) break;
    if (isY) v6 = j6 + 4; else v6 = j6 - 4;
    for (let i = 1; i < 10; i++) {
      let g;
      if (isY) g = v6 - i + 1; else g = v6 + i - 1;
      if (g < 1) g += 9;
      if (g > 9) g -= 9;
      agM[i] = GAN[liuyi[g]];
    }
    if (agM[1] === tian1) {
      const gan2 = agM[2] ? agM[2][0] : '';
      for (j6 = 1; j6 < 10; j6++) if (gan2 === GAN[liuyi[j6]]) break;
      if (isY) v6 = j6 + 4; else v6 = j6 - 4;
      for (let i = 1; i < 10; i++) {
        let g;
        if (isY) g = v6 - i + 1; else g = v6 + i - 1;
        if (g < 1) g += 9;
        if (g > 9) g -= 9;
        agM[i] = GAN[liuyi[g]];
      }
    }
    if (agM[2] && agM[5]) agM[2] = agM[2] + agM[5];
    agM[5] = '';
  }

  // 构建pals宫位对象数组: 八神/天盘干/地盘干/九星/八门/暗干/四害标记
  const pals = {};
  for (let g = 1; g < 10; g++) {
    if (g === 5) { pals[g] = null; continue; }
    const tg = (tianM[g] || '')[0], dg1 = (di[g] || '')[0];
    const dg2 = (di[g] || '').length > 1 ? (di[g] || '')[1] : '';
    let tx = false, tm = false, dx = false, dm = false;
    if (XING_G[tg] === g) tg === '庚' ? (tm = true) : (tx = true);
    if (XING_G[dg1] === g) dg1 === '庚' ? (dm = true) : (dx = true);
    if (MU_G[tg] === g) tm = true;
    if (MU_G[dg1] === g) dm = true;
    if (dg2 && MU_G[dg2] === g) dm = true;
    const mn = menM[g] || '';
    let mp_ = false;
    if (mn && MEN_PO[mn] && MEN_PO[mn].includes(g)) mp_ = true;
    pals[g] = {
      shen: shenM[g] || '', tian: tianM[g] || '', di: di[g] || '',
      xing: xingM[g] || '', men: menM[g] || '', anGan: agM[g] || '',
      kong: g === ZHI2G[xk1] || g === ZHI2G[xk2], ma: g === maG,
      tx, tm, dx, dm, mp: mp_
    };
  }

  // 天门地户(外圈建除): 月将加时支顺排十二神, 供tianmenDihu函数
  const tianmen = {}, dihu = {};
  const startPos = hZ;
  for (let ti = 0; ti < 12; ti++) {
    const pos = (startPos + ti) % 12;
    tianmen[pos] = TMS[(jiang + ti) % 12];
    dihu[pos] = DHS[ti];
  }

  const r = {
    gongli: `${calYear}年${calMonth}月${calDay}日${calHour}时${pad(mi)}分`,
    nongli: `${lY}年${isLeap ? '闰' : ''}${MNM[lM % 12]}${DNM[lD]}日`,
    yinYang: isY ? '阴' : '阳', juNum: ju,
    juLabel: `${isY ? '阴遁' : '阳遁'}${ju}局`,
    customJu: customJu || false,
    jieqi: `${STN[ti === 0 ? 23 : ti - 1]}～${STN[ti]}`,
    yueJiang: jz,
    sizhu: {
      y: { ganZhi: yGz.getName() }, m: { ganZhi: mGz.getName() },
      d: { ganZhi: dGz.getName() }, h: { ganZhi: hGz.getName() },
      minute: mGzStr || null
    },
    xs: { gz: xsG + xsZ },
    kw: { gz: ZHI[xk1] + ZHI[xk2] },
    ma: { z: ZHI[maZ], g: maG, p: MP[maG] || 'ma2' },
    zf: { n: `天${zfN}星`, s: zfN, g: sgg },
    zs: { n: `${zsN}门`, s: zsN, g: mg },
    pals, agM, tianmen, dihu,
    isFuAll, isY, ju, dgg, sgg, mg, hCyl, jiang,
    _tmdh: opts.tmdh || false,
    raw: ''
  };
  r.raw = buildRaw(r);
  return r;
}

function buildRaw(d) {
  const Z = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  let s = `公历 :${d.gongli}<br> `;
  if (d.customJu) s += '<font color=#FF00FF>自选 </font>';
  s += `农历 :${d.nongli}<br>`;
  s += `四柱: ${d.sizhu.y.ganZhi}\u3000${d.sizhu.m.ganZhi}\u3000${d.sizhu.d.ganZhi}\u3000${d.sizhu.h.ganZhi}`;
  if (d.sizhu.minute && d.sizhu.minute) s += d.sizhu.minute;
  s += '<br>';
  s += `节气: ${d.jieqi} 月将:${d.yueJiang} `;
  s += `${d.yinYang}遁${d.juNum}局<br> 值符:${d.zf.n}落${d.zf.g}宫 值使:${d.zs.n}落${d.zs.g}宫<br>`;
  s += `旬首:${d.xs.gz}\u3000空亡:${d.kw.gz}\u3000马星:${d.ma.z}<br>`;
  s += '四害颜色：<font color=#6f00d2>刑</font><font color=#009100>墓</font><font color=#FF0000>迫</font><font color=#EE00EE>【刑墓】</font><font color=#000080>空◎</font> <br>';
  s += buildGrid(d);
  return s;
}

function buildGrid(d) {
  function csp(ch, x, m) {
    if (m && x) return `<FONT color=#EE00EE>${ch}</FONT>`;
    if (m) return `<FONT color=#009100>${ch}</FONT>`;
    if (x) return `<FONT color=#6F00D2>${ch}</FONT>`;
    return ch;
  };
  function tc(g) {
    if (!d.pals[g]) return '';
    const t = d.pals[g].tian || '';
    return csp(t[0] || '', d.pals[g].tx, d.pals[g].tm) + (t[1] ? csp(t[1], false, false) : '');
  };
  function dc(g) {
    if (!d.pals[g]) return '';
    const dd = d.pals[g].di || '';
    return csp(dd[0] || '', d.pals[g].dx, d.pals[g].dm) + (dd[1] ? csp(dd[1], false, false) : '');
  };
  function kd(g) { return d.pals[g] && d.pals[g].kong ? '<font color=#000080>◎</font>' : '\u3000'; }
  function ms(g) {
    if (!d.pals[g]) return '';
    const m_ = d.pals[g].men || '';
    return d.pals[g].mp ? `<i><FONT color=#FF0000>${m_}</FONT></i>` : m_;
  };
  function cell(g, cls) {
    if (!d.pals[g]) return '<td>&nbsp;</td>';
    const pp = d.pals[g];
    return `<td class="${cls}">${pp.shen || ''}\u3000${kd(g)}<br />${tc(g)}\u3000${pp.xing || ''}<br />${dc(g)}\u3000${ms(g)}</td>`;
  };
  const ag = d.agM || {};

  let h = ' <table class="gridst" cellSpacing=0>';
  h += `<tr><td class="girdnone caltabwidthstsm caltabhightst"><br/></td><td class="girdnone caltabwidthst"><br/></td><td class="girdnone caltabwidthst"><br/>${ag[9]||''}</td><td class="girdnone caltabwidthst"><br/></td><td class="girdnone caltabwidthstsm"><br/></td></tr>`;
  h += `<tr><td class="girdnone caltabhightst"><br />${ag[4]||''}</td>${cell(4,'girdleft')}${cell(9,'girdleft')}${cell(2,'girdright')}<td class="girdnone">${ag[2]||''}</td></tr>`;
  h += `<tr><td class="girdnone caltabhightst"><br />${ag[3]||''}</td>${cell(3,'girdleft')}<td class="girdleft">&nbsp;</td>${cell(7,'girdright')}<td class="girdnone">${ag[7]||''}</td></tr>`;
  h += `<tr><td class="girdnone caltabhightst"><br />${ag[8]||''}</td>${cell(8,'girdbott')}${cell(1,'girdbott')}${cell(6,'girdall')}<td class="girdnone">${ag[6]||''}</td></tr>`;
  h += `<tr><td class="girdnone caltabhightst"><br/></td><td class="girdnone"><br/></td><td class="girdnone"><br/>${ag[1]||''}</td><td class="girdnone"><br/></td><td class="girdnone"><br/></td></tr>`;
  h += '</table>';
  return h;
}

window.qimenChart = qimenChart;

})();