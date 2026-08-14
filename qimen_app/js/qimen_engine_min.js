// 奇门遁甲排盘引擎  作者: 地天泰  微信/手机: 18626256203
// 项目地址: https://github.com/wrz1911/daojiayinpan
// 开源依赖: tyme4ts (MIT) https://github.com/6tail/tyme4ts
// 开源依赖: Tauri (MIT) https://github.com/tauri-apps/tauri
(function(){
'use strict';
const _global = typeof globalThis !== 'undefined' ? globalThis : window;
function _t() { return _global.tyme4j || window.tyme || {}; }

// ====== 引擎常量: 统一引用 qimen_constants.js 的 window.QM ======
const { GAN, ZHI, GAN6, MEN, XING, SHEN_Y, SHEN_A, ZHUAN, FZHUAN, YIMA, ZHI2G, SG_MAP, HE, STN, MNM, DNM, KE_Y, KE_N, XING_G, MU_G, MEN_PO, MP, TMS, DHS } = window.QM;

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
  if (d.sizhu.minute) s += d.sizhu.minute;
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
  }
  function tc(g) {
    if (!d.pals[g]) return '';
    const t = d.pals[g].tian || '';
    return csp(t[0] || '', d.pals[g].tx, d.pals[g].tm) + (t[1] ? csp(t[1], false, false) : '');
  }
  function dc(g) {
    if (!d.pals[g]) return '';
    const dd = d.pals[g].di || '';
    return csp(dd[0] || '', d.pals[g].dx, d.pals[g].dm) + (dd[1] ? csp(dd[1], false, false) : '');
  }
  function kd(g) { return d.pals[g] && d.pals[g].kong ? '<font color=#000080>◎</font>' : '\u3000'; }
  function ms(g) {
    if (!d.pals[g]) return '';
    const m_ = d.pals[g].men || '';
    return d.pals[g].mp ? `<i><FONT color=#FF0000>${m_}</FONT></i>` : m_;
  }
  function cell(g, cls) {
    if (!d.pals[g]) return '<td>&nbsp;</td>';
    const pp = d.pals[g];
    return `<td class="${cls}">${pp.shen || ''}\u3000${kd(g)}<br />${tc(g)}\u3000${pp.xing || ''}<br />${dc(g)}\u3000${ms(g)}</td>`;
  }
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

// ====== 山向排盘(向角度选局): 纯计算, 由 app 原 renderShanxiang 算法下沉 ======
// 入参: sxDeg 向角度(0-359), sxYear 公历年。返回 items 数组(offset -30..30 步长5, 共13项),
// 每项含盘面数据(palsT/kongGongsT/_exp等)与头部信息, DOM/着色/HTML 拼接由 app 层完成
function shanxiangChart(sxDeg, sxYear) {
  const { SHAN_JU, XIANGZHI, TABLESHA, ZHI2G_OBJ, SX_NAMES } = window.QM;
  const LIUYI = ['','戊','己','庚','辛','壬','癸','丁','丙','乙'];
  const items = [];
  for (let offset = -30; offset <= 30; offset += 5) {
    let deg = ((sxDeg + offset) % 360 + 360) % 360;
    // 向角度选局使用24山查表算法
    let _duu = Math.floor(((deg % 360 + 360) % 360) / 5);
    let _du = Math.floor(_duu / 3);
    let _t = SHAN_JU[_du];
    let _tJ = (_t < 0) ? _t + 9 : _t + 8;
    let sxJu, sxIsYin;
    if (_tJ < 9) { sxJu = 9 - _tJ; sxIsYin = true; } else { sxJu = _tJ - 8; sxIsYin = false; }
    let _v = _duu % 3;
    if (sxIsYin) sxJu += _v * 3; else sxJu += 9 - _v * 3;
    if (sxJu > 9) sxJu -= 9;
    let degStart = Math.floor(deg / 5) * 5, degEnd = degStart + 4;
    // 山向排盘核心: 虚拟时柱hCyl驱动地盘飞步, 不依赖真实日历
    let _cY = (sxYear - 1864) % 60;
    let _hGan = _cY % 10; if (_hGan > 4) _hGan -= 5; // 年干支天干偏移计算
    let hCyl = _hGan * 12 + XIANGZHI[_du];
    let jiang = (13 - _cY % 12) % 12;
    let ju = sxJu, yy = sxIsYin ? '阴' : '阳';

    // paipanrest核心: 旬首/空亡/马星
    let xunshou = Math.floor(hCyl / 10) * 10;
    let xunkong1 = (xunshou + 10) % 12, xunkong2 = (xunshou + 11) % 12;
    let maxing = [2, 8, 11, 5][hCyl % 4]; // YiMa

    // 地盘
    let dg = Math.floor(xunshou / 10) + 1; // 旬首对应的liuyi索引 (AppStudio +4 = JS +1)
    let digan = {}, dgg = 0, sgg = 0;
    for (let i = 0; i < 9; i++) {
      let g = yy == '阴' ? ju - i : ju + i;
      if (g > 9) g -= 9; if (g < 1) g += 9;
      digan[g] = GAN6[i];
      if (i + 1 == dg) dgg = g;
      if (GAN6[i] == GAN[hCyl % 10]) sgg = g; // AppStudio: hCyl%10→Gan char
    }
    if (sgg == 0) sgg = dgg;
    // 寄宫: 中宫仪寄坤2宫(组合串语义与 app 原实现一致)
    if (digan[5] && digan[2]) digan[2] = digan[2] + digan[5];

    // 值符星/值使门
    let zhiFu = XING[FZHUAN[dgg]]; if (dgg == 5) zhiFu = '禽';
    let zhiShi = MEN[FZHUAN[dgg]];
    let mgg = yy == '阳' ? hCyl % 10 + dgg : dgg - (hCyl % 10);
    if (mgg < 1) mgg += 9; if (mgg > 9) mgg -= 9;

    // 排星/天盘
    let xinpan = {}, tiangan = {};
    let v1 = FZHUAN[sgg] - FZHUAN[dgg];
    for (let j = 1; j <= 8; j++) {
      let k = j - v1; if (k < 1) k += 8; if (k > 8) k -= 8;
      xinpan[ZHUAN[j]] = XING[k];
      tiangan[ZHUAN[j]] = digan[ZHUAN[k]] || '';
    }
    // 排门
    let menpan = {};
    let v2 = FZHUAN[mgg] - FZHUAN[dgg];
    for (let j = 1; j <= 8; j++) {
      let k = j - v2; if (k < 1) k += 8; if (k > 8) k -= 8;
      menpan[ZHUAN[j]] = MEN[k];
    }
    // 排神
    let shenpan = {};
    let v3 = FZHUAN[sgg] - 1;
    for (let j = 1; j <= 8; j++) {
      let kw = j - v3; if (kw < 1) kw += 8; if (kw > 8) kw -= 8;
      shenpan[ZHUAN[j]] = yy == '阳' ? SHEN_A[kw] : SHEN_Y[kw];
    }
    // 暗干
    let angan = {};
    let v4 = FZHUAN[sgg] - FZHUAN[mgg];
    for (let j = 1; j <= 8; j++) {
      let kw = j + v4; if (kw < 1) kw += 8; if (kw > 8) kw -= 8;
      angan[ZHUAN[j]] = digan[ZHUAN[kw]] || '';
    }
    // 伏吟局暗干特殊排列: 真伏吟 = 全部天盘==地盘
    let _isFY = true;
    for (let _g = 1; _g <= 9; _g++) { if (_g === 5) continue; if (tiangan[_g] !== digan[_g]) { _isFY = false; break; } }
    if (_isFY) {
      let _vj;
      if (hCyl % 10 == 0) { let _vc = LIUYI[Math.floor(hCyl / 10) + 1]; for (_vj = 1; _vj < 10; _vj++) if (LIUYI[_vj] == _vc) break; }
      else _vj = hCyl % 10;
      let _v2 = yy == '阳' ? _vj - 4 : _vj + 4;
      for (let _i = 1; _i < 10; _i++) {
        let _g = yy == '阳' ? _v2 + _i - 1 : _v2 - _i + 1;
        if (_g < 1) _g += 9; if (_g > 9) _g -= 9;
        angan[_i] = LIUYI[_g];
      }
      if (angan[1] == tiangan[1]) {
        let _gan = angan[2][0];
        for (_vj = 1; _vj < 10; _vj++) if (LIUYI[_vj] == _gan) break;
        _v2 = yy == '阳' ? _vj - 4 : _vj + 4;
        for (let _i = 1; _i < 10; _i++) {
          let _g = yy == '阳' ? _v2 + _i - 1 : _v2 - _i + 1;
          if (_g < 1) _g += 9; if (_g > 9) _g -= 9;
          angan[_i] = LIUYI[_g];
        }
      }
      if (angan[2] && angan[5]) angan[2] = angan[2][0] + angan[5][0];
      angan[5] = '';
    }

    // 组装palaces + 期望值(供渲染验证)
    let palsT = {}, _exp = {};
    for (let g = 1; g <= 9; g++) { if (g === 5) continue;
      palsT['gong' + g] = { shen: shenpan[g] || '', tian: (tiangan[g] || ''), di: (digan[g] || ''), xing: xinpan[g] || '', men: menpan[g] || '', anGan: (angan[g] || ''), isMenPo: false };
      _exp[g] = { shen: shenpan[g] || '', tian: (tiangan[g] || ''), di: (digan[g] || ''), xing: xinpan[g] || '', men: menpan[g] || '' };
    }

    // 空亡: 旬首→空亡地支→对应宫位标记◎/马星/旬首
    let xunShouGZ = '甲' + ZHI[xunshou % 12];
    let kongWangStr = ZHI[xunkong1] + ZHI[xunkong2];
    let maStr = ZHI[maxing];
    let kongGongsT = {}; kongGongsT[ZHI2G_OBJ[ZHI[xunkong1]]] = true; kongGongsT[ZHI2G_OBJ[ZHI[xunkong2]]] = true;
    let maGong = ZHI2G_OBJ[maStr] || 0, maPosId = MP[maGong] || '';

    // 黄泉: 原始公式 v=jiang-hCyl%12, hG=2
    let _duSub = Math.floor(((deg % 360 + 360) % 360) / 5); _duSub = Math.floor(_duSub / 3);
    let _hCylSub = 2 * 12 + XIANGZHI[_duSub];
    let _vSub = (jiang || 0) - _hCylSub % 12;
    let sxHq = ZHI[TABLESHA[_duSub]] + ZHI2G[(TABLESHA[_duSub] - _vSub + 12) % 12];

    let sxName = SX_NAMES[Math.floor(deg / 15)];
    let sxYearGan = GAN[(sxYear - 4) % 10], sxYearZhi = ZHI[(sxYear - 4) % 12];
    let sxShiZhu = GAN[_cY % 10] + ZHI[_cY % 12] + ' ' + GAN[hCyl % 10] + ZHI[hCyl % 12];
    let juLabel = (sxIsYin ? '阴遁' : '阳遁') + sxJu + '局';

    items.push({
      deg, degStart, degEnd, sxName, sxYearGan, sxYearZhi,
      sxShiZhu, sxShiZhuParts: sxShiZhu.split(' '),
      juLabel, xunShouGZ, kongWangStr, maStr, maGong, maPosId,
      zhiFu, zhiShi, sxHq, palsT, kongGongsT, _exp
    });
  }
  return items;
}

window.qimenChart = qimenChart;
window.shanxiangChart = shanxiangChart;

})();