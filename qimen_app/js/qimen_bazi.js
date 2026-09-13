/* 八字排盘 —— 传统模式(四柱/十神/大运/流年)
 *
 * 用途: 八字的十神/藏干/纳音/地势/自坐/空亡/神煞/胎元·命宫·身宫/交运
 *       已并入命理主盘(见 qimen_mingli.js), 由 baziMainRows() 提供那几行;
 *       renderBazi() 保留完整传统盘版式(四柱+大运+流年)备用。
 * 计算: tyme4ts (window.tyme); 配色走主题变量, 暗色自动适配
 *
 * 各字段取法(全部由 tyme4ts 计算得出):
 *   四柱   ec.getYear/Month/Day/Hour()
 *   十神   日干.getTenStar(该柱天干) -> 简称
 *   藏干   EarthBranch.getHideHeavenStems() + 各自对日干的十神简称
 *   纳音   SixtyCycle.getSound()
 *   地势   日干.getTerrain(各柱地支)      <- 注意不是"天干对本柱"
 *   自坐   各柱天干.getTerrain(本柱地支)
 *   空亡   SixtyCycle.getExtraEarthBranches()
 *   胎元   ec.getFetalOrigin()
 *   命宫   ec.getOwnSign()                 <- tyme 的 ownSign 即命宫
 *   身宫   ec.getBodySign()
 *   大运   ChildLimit.fromSolarTime(时间, 1男/0女).getStartDecadeFortune()
 *   流年   DecadeFortune.getStartFortune()
 *
 * 注意: browser 构建里 tyme 的 next() 默认参数丢失, 必须显式传 1。
 */
(function () {
  'use strict';

  // 共享常量(见 qimen_constants.js): 显式挂接, 不依赖加载顺序
  var QM = window.QM || {};
  var GAN = '甲乙丙丁戊己庚辛壬癸'.split('');
  var ZHI = '子丑寅卯辰巳午未申酉戌亥'.split('');
  /* 天干/地支五行色: 由 QM.WX_OF 统一单字表派生(见 qimen_constants.js),
     这里不再自备一份, 免得与盘头/三传/命理出现同字不同色 */
  var WX_VAR = { mu: 'var(--wx-mu)', huo: 'var(--wx-huo)', tu: 'var(--wx-tu)',
                 jin: 'var(--wx-jin)', shui: 'var(--wx-shui)' };
  var wxColorOf = function (ch) {
    var of = (window.QM && QM.WX_OF) || {};
    return WX_VAR[of[ch]] || 'var(--c-text)';
  };
  var GAN_COLOR = GAN.map(wxColorOf);
  var ZHI_COLOR = ZHI.map(wxColorOf);
  var ZODIAC = '鼠牛虎兔龙蛇马羊猴鸡狗猪'.split('');
  /* 十神全称 -> 单字简称 */
  var SHISHEN_ABBR = {
    '比肩': '比', '劫财': '劫', '食神': '食', '伤官': '伤', '偏财': '才',
    '正财': '财', '七杀': '杀', '正官': '官', '偏印': '枭', '正印': '印'
  };
  var YUE_NAME = ['正月', '二月', '三月', '四月', '五月', '六月',
                  '七月', '八月', '九月', '十月', '十一月', '十二月'];
  var WX_SHENG = { '木': '火', '火': '土', '土': '金', '金': '水', '水': '木' };  // 生
  var WX_KE = { '木': '土', '土': '水', '水': '火', '火': '金', '金': '木' };     // 克

  /* ── 神煞规则 ── */
  /* 三合局: 申子辰 / 寅午戌 / 亥卯未 / 巳酉丑 */
  var SANHE = {
    '申': '水', '子': '水', '辰': '水',
    '寅': '火', '午': '火', '戌': '火',
    '亥': '木', '卯': '木', '未': '木',
    '巳': '金', '酉': '金', '丑': '金'
  };
  var JIESHA = { '水': '巳', '火': '亥', '木': '申', '金': '寅' };   // 劫煞
  var ZAISHA = { '水': '午', '火': '子', '木': '酉', '金': '卯' };   // 灾煞
  var WANGSHEN = { '水': '亥', '火': '巳', '木': '寅', '金': '申' }; // 亡神
  /* 天乙贵人(日干查) */
  var TIANYI = { '甲': '丑未', '戊': '丑未', '庚': '丑未', '乙': '子申', '己': '子申',
                 '丙': '亥酉', '丁': '亥酉', '壬': '卯巳', '癸': '卯巳', '辛': '午寅' };
  /* 羊刃(日干查, 阴干取禄前一位即逆行) */
  var YANGREN = { '甲': '卯', '乙': '寅', '丙': '午', '丁': '巳', '戊': '午',
                  '己': '巳', '庚': '酉', '辛': '申', '壬': '子', '癸': '亥' };
  /* 国印贵人(干查) */
  var GUOYIN = { '甲': '戌', '乙': '亥', '丙': '丑', '丁': '寅', '戊': '丑',
                 '己': '寅', '庚': '辰', '辛': '巳', '壬': '未', '癸': '申' };
  /* 天德贵人(月支查) */
  var TIANDE = { '寅': '丁', '卯': '申', '辰': '壬', '巳': '辛', '午': '亥', '未': '甲',
                 '申': '癸', '酉': '寅', '戌': '丙', '亥': '乙', '子': '巳', '丑': '庚' };
  /* 红鸾(年支查) */
  var HONGLUAN = { '子': '卯', '丑': '寅', '寅': '丑', '卯': '子', '辰': '亥', '巳': '戌',
                   '午': '酉', '未': '申', '申': '未', '酉': '午', '戌': '巳', '亥': '辰' };
  /* 孤辰/寡宿(年支查, 按三会方) */
  var GUCHEN = { '亥': '寅', '子': '寅', '丑': '寅', '寅': '巳', '卯': '巳', '辰': '巳',
                 '巳': '申', '午': '申', '未': '申', '申': '亥', '酉': '亥', '戌': '亥' };
  var GUASU = { '亥': '戌', '子': '戌', '丑': '戌', '寅': '丑', '卯': '丑', '辰': '丑',
                '巳': '辰', '午': '辰', '未': '辰', '申': '未', '酉': '未', '戌': '未' };
  var SHIE_DABAI = ['甲辰', '乙巳', '丙申', '丁亥', '戊戌', '己丑', '庚辰', '辛巳', '壬申', '癸亥'];
  /* 三合局衍生神煞(以年支/日支两路查) */
  var JIANGXING = { '水': '子', '火': '午', '木': '卯', '金': '酉' };   // 将星 = 局中神
  var HUAGAI = { '水': '辰', '火': '戌', '木': '未', '金': '丑' };      // 华盖 = 局墓库
  var YIMA = { '水': '寅', '火': '申', '木': '巳', '金': '亥' };        // 驿马 = 局长生之冲
  var TAOHUA = { '水': '酉', '火': '卯', '木': '子', '金': '午' };      // 桃花(咸池)
  /* 以日干查 */
  var WENCHANG = { '甲': '巳', '乙': '午', '丙': '申', '丁': '酉', '戊': '申', '己': '酉', '庚': '亥', '辛': '子', '壬': '寅', '癸': '卯' };
  var LUSHEN = { '甲': '寅', '乙': '卯', '丙': '巳', '丁': '午', '戊': '巳', '己': '午', '庚': '申', '辛': '酉', '壬': '亥', '癸': '子' };
  var JINYU = { '甲': '辰', '乙': '巳', '丙': '未', '丁': '申', '戊': '未', '己': '申', '庚': '戌', '辛': '亥', '壬': '丑', '癸': '寅' };
  var HONGYAN = { '甲': '午', '乙': '午', '丙': '寅', '丁': '未', '戊': '辰', '己': '辰', '庚': '戌', '辛': '酉', '壬': '子', '癸': '申' };
  /* 月德贵人: 按三合局月令 */
  var YUEDE = { '火': '丙', '水': '壬', '木': '甲', '金': '庚' };
  /* 太极贵人(日干查, 值可为两地支) */
  var TAIJI = { '甲': '子午', '乙': '子午', '丙': '卯酉', '丁': '卯酉', '戊': '辰戌丑未',
                '己': '辰戌丑未', '庚': '寅亥', '辛': '寅亥', '壬': '巳申', '癸': '巳申' };
  var KUIGANG = ['庚辰', '庚戌', '壬辰', '戊戌'];                       // 魁罡(日柱)
  var YINCHAYANGCUO = ['丙子', '丁丑', '戊寅', '辛卯', '壬辰', '癸巳',
                       '丙午', '丁未', '戊申', '辛酉', '壬戌', '癸亥'];  // 阴差阳错(日柱)
  /* 神煞输出顺序 */
  var SHA_ORDER = ['将星', '禄神', '文昌', '天乙贵人', '天德贵人', '月德贵人', '太极贵人',
                   '金舆', '天医', '红鸾', '桃花', '红艳', '羊刃', '驿马', '国印', '词馆',
                   '华盖', '魁罡', '劫煞', '灾煞', '亡神', '孤辰', '寡宿', '六厄', '大耗',
                   '流霞', '披麻', '隔角', '五鬼', '童子', '天罗', '十恶大败', '阴差阳错'];

  /* 纳音用字统一: tyme 作"霹雳火/砂中金", 本盘按通行写法作"霹雷火/沙中金" */
  var NAYIN_FIX = { '霹雳火': '霹雷火', '砂中金': '沙中金', '砂中土': '沙中土', '砂石金': '沙石金' };
  function naYin(sound) {
    var n = sound ? sound.getName() : '';
    return NAYIN_FIX[n] || n;
  }

  /* ══════════════ 排盘 ══════════════ */
  function baziChart(o) {
    var t = window.tyme;
    if (!t) throw new Error('tyme4ts 未加载');
    var y = o.year, mo = o.month, d = o.day, h = o.hour, mi = o.minute || 0;
    var st = t.SolarTime.fromYmdHms(y, mo, d, h, mi, 0);
    var lh = st.getLunarHour();
    /* 早晚子时: 默认晚子时日柱算次日; 开启后算当天(晚子时算当天)。
       tyme 的 LunarHour.getEightChar() 不接受参数, 只能临时改静态 provider, 用完还原。 */
    var ec;
    if (o.zaoWanZi) {
      var oldProvider = t.LunarHour.provider;
      t.LunarHour.provider = new t.LunarSect2EightCharProvider();
      try { ec = lh.getEightChar(); } finally { t.LunarHour.provider = oldProvider; }
    } else {
      ec = lh.getEightChar();
    }
    var SC = [ec.getYear(), ec.getMonth(), ec.getDay(), ec.getHour()];
    var dayGan = SC[2].getHeavenStem();
    var gender = o.gender === '女' ? '女' : '男';

    function abbr(star) { return SHISHEN_ABBR[star] || star; }
    function tenOf(stem) { return abbr(dayGan.getTenStar(stem).getName()); }

    /* 四柱 */
    var pillars = SC.map(function (p) {
      var g = p.getHeavenStem(), z = p.getEarthBranch();
      return {
        gz: p.getName(), gan: g.getName(), zhi: z.getName(),
        ganColor: GAN_COLOR[g.getIndex()], zhiColor: ZHI_COLOR[z.getIndex()],
        shiShen: (p === SC[2]) ? '日元' : tenOf(g),
        cang: z.getHideHeavenStems().map(function (hs) {
          return { gan: hs.getHeavenStem().getName(), shen: tenOf(hs.getHeavenStem()) };
        }),
        naYin: naYin(p.getSound()),
        diShi: dayGan.getTerrain(z).getName(),              // 地势: 日干 vs 该柱地支
        ziZuo: g.getTerrain(z).getName(),                   // 自坐: 本柱天干 vs 本柱地支
        kong: p.getExtraEarthBranches().map(function (x) { return x.getName(); }).join(''),
        sha: []
      };
    });

    /* ── 神煞: 年支/日支(劫灾亡) + 日干/年干(国印) + 日干(天乙羊刃) + 月支(天德) + 年支(红鸾孤寡) ── */
    var nianZhi = pillars[0].zhi, riZhi = pillars[2].zhi, yueZhi = pillars[1].zhi;
    var nianGan = pillars[0].gan, riGan = pillars[2].gan;
    pillars.forEach(function (p, i) {
      var z = p.zhi, g = p.gan, got = {};
      function mark(n) { got[n] = 1; }
      /* 三合局类神煞: 以年支局和日支局两路去查该柱地支 */
      [nianZhi, riZhi].forEach(function (ref) {
        var ju = SANHE[ref];
        if (!ju) return;
        if (JIESHA[ju] === z) mark('劫煞');
        if (ZAISHA[ju] === z) mark('灾煞');
        if (WANGSHEN[ju] === z) mark('亡神');
        if (JIANGXING[ju] === z) mark('将星');
        if (HUAGAI[ju] === z) mark('华盖');
        if (YIMA[ju] === z) mark('驿马');
        if (TAOHUA[ju] === z) mark('桃花');
      });
      /* 日干类 */
      if (WENCHANG[riGan] === z) mark('文昌');
      if (LUSHEN[riGan] === z) mark('禄神');
      if (JINYU[riGan] === z) mark('金舆');
      if (HONGYAN[riGan] === z) mark('红艳');
      if ((TAIJI[riGan] || '').indexOf(z) >= 0) mark('太极贵人');
      /* 月德贵人 / 天医: 以月支三合局查 */
      var yueJu = SANHE[yueZhi];
      if (yueJu && YUEDE[yueJu] === g) mark('月德贵人');
      if (ZHI[(ZHI.indexOf(yueZhi) + 11) % 12] === z) mark('天医');   // 月支前一位
      /* 日柱专有 */
      if (i === 2) {
        if (KUIGANG.indexOf(p.gz) >= 0) mark('魁罡');
        if (YINCHAYANGCUO.indexOf(p.gz) >= 0) mark('阴差阳错');
      }
      if (HONGLUAN[nianZhi] === z) mark('红鸾');            // 红鸾: 年支查
      if (GUOYIN[riGan] === z || GUOYIN[nianGan] === z) mark('国印');   // 国印: 日干/年干
      if ((TIANYI[riGan] || '').indexOf(z) >= 0) mark('天乙贵人');      // 天乙: 日干
      var td = TIANDE[yueZhi];                              // 天德: 月支查
      if (td === z || td === g) mark('天德贵人');
      if (YANGREN[riGan] === z) mark('羊刃');               // 羊刃: 日干
      if (GUCHEN[nianZhi] === z) mark('孤辰');              // 孤辰/寡宿: 年支查
      if (GUASU[nianZhi] === z) mark('寡宿');
      if (i === 2 && SHIE_DABAI.indexOf(p.gz) >= 0) mark('十恶大败');
      p.sha = SHA_ORDER.filter(function (n) { return got[n]; });   // 按固定顺序输出
    });

    /* ── 旺相休囚死: 按"当月五行"推出 旺/相/休/囚/死 顺序的五行名 ── */
    var yueWx = SC[1].getEarthBranch().getElement().getName();
    var wangXiang = [yueWx, WX_SHENG[yueWx], shengWo(yueWx), keWo(yueWx), WX_KE[yueWx]];
    function shengWo(w) { for (var k in WX_SHENG) if (WX_SHENG[k] === w) return k; return ''; }
    function keWo(w) { for (var k in WX_KE) if (WX_KE[k] === w) return k; return ''; }

    /* ── 童限 / 大运 / 流年 ── */
    var cl = t.ChildLimit.fromSolarTime(st, gender === '男' ? 1 : 0);
    /* 出生所属干支年(立春为界): 童限给的是公历年, 需按年柱校正 */
    var birthGZYear = y;
    if (t.SixtyCycleYear.fromYear(y).getSixtyCycle().getName() !== SC[0].getName()) birthGZYear = y - 1;
    var startYear = cl.getEndSixtyCycleYear().getYear();       // 交运年
    var jiaoYun = {
      y: cl.getYearCount(), m: cl.getMonthCount(), d: cl.getDayCount(),
      year: startYear,
      gan: cl.getEndSixtyCycleYear().getSixtyCycle().getHeavenStem().getName(),
      month: cl.getEndTime().getMonth(), day: cl.getEndTime().getDay()
    };
    /* 第一柱固定为月柱(出生年 ~ 交运前一年), 之后是 tyme 的九步大运 */
    var dayun = [{ gz: pillars[1].gz, gan: pillars[1].gan, zhi: pillars[1].zhi,
                   year: birthGZYear, siShen: pillars[1].cang.map(function (c) { return c.shen; }).join('') }];
    /* 交运时刻所属干支年(tyme 给的是公历年, 立春前的要减 1) */
    var jyTime = cl.getEndTime();
    function gzYearAt(year) {
      try {
        var tt = t.SolarTime.fromYmdHms(year, jyTime.getMonth(), jyTime.getDay(), 12, 0, 0);
        return tt.getLunarHour().getEightChar().getYear().getName() ===
               t.SixtyCycleYear.fromYear(year).getSixtyCycle().getName() ? year : year - 1;
      } catch (e) {
        if (window._logErr) window._logErr('gzYearAt', e && e.message);
        return year;
      }
    }
    var df = cl.getStartDecadeFortune();
    for (var i = 0; i < 9; i++) {
      var g2 = df.getSixtyCycle().getHeavenStem(), z2 = df.getSixtyCycle().getEarthBranch();
      dayun.push({
        gz: df.getSixtyCycle().getName(), gan: g2.getName(), zhi: z2.getName(),
        year: gzYearAt(jyTime.getYear() + i * 10),
        siShen: z2.getHideHeavenStems().map(function (hs) { return tenOf(hs.getHeavenStem()); }).join('')
      });
      df = df.next(1);
    }
    /* 每步大运覆盖的流年干支: 按干支年逐年查表(Fortune.getSixtyCycle 不可靠) */
    for (var k = 0; k < 9; k++) {
      var list = [];
      for (var j = 0; j < 10; j++) {
        var yr = dayun[k + 1].year + j;
        if (yr < startYear) list.push(t.SixtyCycleYear.fromYear(yr).getSixtyCycle().getName());
      }
      dayun[k + 1].liunian = list;
    }
    dayun[0].liunian = [];
    for (var yy = birthGZYear; yy < startYear; yy++) {
      dayun[0].liunian.push(t.SixtyCycleYear.fromYear(yy).getSixtyCycle().getName());
    }

    /* 当前大运下标(按本年) */
    var nowY = new Date().getFullYear(), curYun = 0;
    for (var q = 0; q < dayun.length; q++) if (dayun[q].year <= nowY) curYun = q;

    /* 当前大运的十个流年: 直接以该运的干支年起算十年 */
    var curFortune = [];
    for (var e = 0; e < 10; e++) {
      var y2 = dayun[curYun].year + e;
      curFortune.push({ year: y2, gz: t.SixtyCycleYear.fromYear(y2).getSixtyCycle().getName(),
                        age: y2 - birthGZYear + 1 });
    }
    /* 流年十神 */
    curFortune.forEach(function (f2) {
      var sc2 = t.SixtyCycle.fromName(f2.gz);
      var g3 = sc2.getHeavenStem(), z3 = sc2.getEarthBranch();
      f2.gan = g3.getName(); f2.zhi = z3.getName();
      f2.ganColor = GAN_COLOR[g3.getIndex()]; f2.zhiColor = ZHI_COLOR[z3.getIndex()];
      f2.siShen = z3.getHideHeavenStems().map(function (hs) { return tenOf(hs.getHeavenStem()); }).join('');
    });

    /* 节气文本: 出生时刻在相邻两节气之间的位置, 形如「大雪后3天16小时，冬至前11天2小时」 */
    var term = st.getTerm(), nextTerm = term.next(1);
    function fmtSpan(days) {
      var h = Math.round(days * 24);
      return Math.floor(h / 24) + '天' + (h % 24) + '小时';
    }
    var jieQi = term.getName() + '后' + fmtSpan(st.getJulianDay() - term.getJulianDay()) +
                '，' + nextTerm.getName() + '前' + fmtSpan(nextTerm.getJulianDay() - st.getJulianDay());

    var lunarMonth = lh.getMonth();
    return {
      name: o.name || '', gender: gender,
      zodiac: ZODIAC[SC[0].getEarthBranch().getIndex()],
      solar: { y: y, month: mo, day: d, hour: h, minute: mi },
      dateText: y + '年' + mo + '月' + d + '日 ' + hourText(h) + '时' + mi + '分' +
                '(' + (lunarMonth < 0 ? '闰' : '') + YUE_NAME[Math.abs(lunarMonth) - 1] +
                lh.getLunarDay().getName() + ')',
      jieQi: jieQi,
      pillars: pillars,
      zao: gender === '男' ? '乾造' : '坤造',
      taiYuan: ec.getFetalOrigin().getName(), taiYuanNaYin: naYin(ec.getFetalOrigin().getSound()),
      mingGong: ec.getOwnSign().getName(), mingGongNaYin: naYin(ec.getOwnSign().getSound()),
      shenGong: ec.getBodySign().getName(), shenGongNaYin: naYin(ec.getBodySign().getSound()),
      wangXiang: wangXiang.join(''),
      birthGZYear: birthGZYear,
      jiaoYun: jiaoYun,
      dayun: dayun, curYun: curYun, curFortune: curFortune
    };
  }

  function hourText(h) { return ZHI[Math.floor(((h + 1) % 24) / 2)]; }

  /* 十神/藏干/纳音/地势/自坐/空亡/神煞/胎元命宫身宫/旺相/交运 —— 命理主盘与本模块共用 */
  function baziMainRows(bz, withGz, rowCls, tipHtml, skipJy) {
    var h = '';
    var rc = rowCls ? ' class="' + rowCls + '"' : '';
    /* 十神 */
    h += '<TR' + rc + ' style="height:25px"><TD style="color:var(--c-gold);line-height:25px">十神</TD>';
    bz.pillars.forEach(function (p) { h += '<TD class="shiShen">' + p.shiShen + '</TD>'; });
    h += '</TR>';
    /* 干支(命理主盘已自带四柱, 那边传 withGz=false 跳过) */
    if (withGz) {
      h += '<TR><TD style="color:var(--c-gold)">' + bz.zao + '</TD>';
      bz.pillars.forEach(function (p) {
        h += '<TD class="sizhuTd"><font style="color:' + p.ganColor + '">' + p.gan + '</font><br>' +
             '<font style="color:' + p.zhiColor + '">' + p.zhi + '</font></TD>';
      });
      h += '</TR>';
    }
    /* 藏干 */
    h += '<TR' + rc + '><TD style="color:var(--c-gold)">藏干</TD>';
    bz.pillars.forEach(function (p) {
      h += '<TD class="cangGanTd">';
      p.cang.forEach(function (c, i) {
        h += '<font style="color:' + GAN_COLOR[GAN.indexOf(c.gan)] + '">' + c.gan + '</font>' +
             (i === p.cang.length - 1 ? '<br>' : '');
      });
      h += '<font class="ganShen">' + p.cang.map(function (c) { return c.shen; }).join('') + '</font></TD>';
    });
    h += '</TR>';
    /* 纳音 / 地势 / 自坐 / 空亡 */
    [['纳音', 'naYin'], ['地势', 'diShi'], ['自坐', 'ziZuo'], ['空亡', 'kong']].forEach(function (row) {
      h += '<TR' + rc + '><TD style="color:var(--c-gold)">' + row[0] + '</TD>';
      bz.pillars.forEach(function (p) { h += '<TD>' + p[row[1]] + '</TD>'; });
      h += '</TR>';
    });
    /* 神煞 */
    h += '<TR' + rc + '><TD style="color:var(--c-gold);line-height:15px">神煞<br></TD>';
    bz.pillars.forEach(function (p) {
      h += '<TD class="shenShaTd"><div class="ssDiv shensha">';
      p.sha.forEach(function (s) { h += '<span>' + s + '</span><br>'; });
      h += '</div></TD>';
    });
    h += '</TR>';
    /* 胎元 命宫 身宫 旺相休囚死 */
    h += '<TR' + rc + '><TD style="color:var(--c-gold)">胎元</TD><TD style="color:var(--c-gold)">命宫</TD>' +
         '<TD style="color:var(--c-gold)">身宫</TD><TD colspan="2" style="color:var(--c-gold)">旺相休囚死</TD></TR>';
    h += '<TR' + rc + '><TD class="gong">' + bz.taiYuan + '<br><font>' + bz.taiYuanNaYin + '</font></TD>' +
         '<TD class="gong">' + bz.mingGong + '<br><font>' + bz.mingGongNaYin + '</font></TD>' +
         '<TD class="gong">' + bz.shenGong + '<br><font>' + bz.shenGongNaYin + '</font></TD>' +
         '<TD colspan="2">' + bz.wangXiang + '</TD></TR>';
    /* 颜色说明(命理主盘把它插在交运之前, 八字盘不传则无此行) */
    if (tipHtml) h += '<TR' + rc + '><TD colspan="5" class="bz-tip">' + tipHtml + '</TD></TR>';
    /* 交运: 命理主盘把它移到九宫下方(skipJy=true), 八字盘留在主盘内 */
    if (!skipJy) h += baziJiaoYunRow(bz, rc);
    h += '</TABLE>';
    return h;
  }

  /** 交运说明行/块(主盘内用 <TR>, 主盘外用 <div class="bz-jy-out">) */
  function baziJiaoYunRow(bz, rc) {
    var d = bz.jiaoYun;
    var dur = d.y + '年' + (d.m ? d.m + '个月' : '') + (d.d ? d.d + '日' : '');
    return '<TR' + (rc || '') + '><TD colspan="5" id="jiaoYun">出生后' + dur +
           '起大运，每逢<font style="color:var(--wx-huo)">' + d.gan + '</font>年' + d.month + '月' +
           d.day + '日前后交运。</TD></TR>';
  }

  /** 主盘外版本(命理把交运放在九宫下面, 沿用原来颜色说明的位置) */
  function baziJiaoYunBlock(bz) {
    var d = bz.jiaoYun;
    var dur = d.y + '年' + (d.m ? d.m + '个月' : '') + (d.d ? d.d + '日' : '');
    return '<div class="bz-jy-out">出生后' + dur +
           '起大运，每逢<font style="color:var(--wx-huo)">' + d.gan + '</font>年' + d.month + '月' +
           d.day + '日前后交运。</div>';
  }

  /* ══════════════ 渲染(传统模式) ══════════════ */
  function renderBazi(d) {
    if (!d) return '';
    var h = '<div class="panDiv bz-pan">';
    /* ── 主盘 ── */
    h += '<TABLE class="pan"><TR><TD colspan="5" style="line-height:28px">' +
         '<font style="color:var(--c-gold)">名称：</font><font class="name">' + (d.name || '') + '</font>&emsp;' +
         '<font style="color:var(--c-gold)">性别：</font>' + d.gender + '&emsp;' +
         '<font style="color:var(--c-gold)">生肖：</font>' + d.zodiac + '</TD></TR>';
    h += '<TR><TD id="dateTitle">日期</TD><TD colspan="4" id="date">' + d.dateText + '</TD></TR>';
    h += '<TR id="jieqiTr"><TD style="color:var(--c-gold)">节气</TD>' +
         '<TD colspan="4" id="jieqi">' + d.jieQi + '</TD></TR>';
    /* 四柱表头 */
    h += '<TR><TD class="sizhuTitle" style="width:16%">四柱</TD>' +
         '<TD class="sizhuTitle">年柱</TD><TD class="sizhuTitle">月柱</TD>' +
         '<TD class="sizhuTitle">日柱</TD><TD class="sizhuTitle">时柱</TD></TR>';
    h += baziMainRows(d, true);

    /* ── 大运 ── */
    h += '<TABLE class="pan" id="dayun"><TR><TD class="title" rowspan=2>大<br>运</TD>';
    d.dayun.forEach(function (y2, i) {
      h += '<TD class="year"' + (i === d.curYun ? '' : '') +
           ' id="bz_dayun_year' + i + '">' + y2.year + '</TD>';
    });
    h += '</TR><TR>';
    d.dayun.forEach(function (y2, i) {
      var st = (i === d.curYun) ? 'font-weight:bold;color:var(--c-po)' : '';
      h += '<TD class="gz"' + (st ? ' style="' + st + '"' : '') + ' id="bz_dayun' + i + '">' +
           '<font style="color:' + GAN_COLOR[GAN.indexOf(y2.gan)] + '">' + y2.gan + '</font><br>' +
           '<font style="color:' + ZHI_COLOR[ZHI.indexOf(y2.zhi)] + '">' + y2.zhi + '</font><br>' +
           '<font>' + (y2.siShen || '') + '</font></TD>';
    });
    h += '</TR></TABLE>';

    /* ── 流年(当前大运的十年) ── */
    h += '<TABLE class="pan" id="year1"><TR><TD class="title" rowspan=2>流<br>年</TD>';
    d.curFortune.forEach(function (f, i) {
      h += '<TD class="liunian1" id="bz_liunian1_' + i + '">' + f.year + '<br>' + f.age + '岁</TD>';
    });
    h += '</TR><TR>';
    d.curFortune.forEach(function (f, i) {
      var nowY = new Date().getFullYear();
      var st = (f.year === nowY) ? " style='color:var(--c-po);font-weight:bold'" : '';
      h += '<TD class="liunian2" id="bz_liunian2_' + i + '"><span' + st + '>' +
           '<font style="color:' + f.ganColor + '">' + f.gan + '</font><br>' +
           '<font style="color:' + f.zhiColor + '">' + f.zhi + '</font></span><br>' +
           '<font>' + (f.siShen || '') + '</font></TD>';
    });
    h += '</TR></TABLE>';

    /* ── 流年总表(各步大运对应的十年干支) ── */
    h += '<TABLE class="pan" id="year2"><TR><TD class="title" rowspan=2>流<br>年</TD>';
    d.dayun.forEach(function (y2, i) {
      h += '<TD class="gz"' + (i === d.curYun ? '' : '') +
           ' id="bz_dayun_liunian' + i + '">' +
           (y2.liunian || []).map(function (g) { return g + '<br>'; }).join('') + '</TD>';
    });
    h += '</TR></TABLE>';
    h += '</div>';
    return h;
  }

  /* ══════════════ 入口: 命理模块「八字排盘」按钮 ══════════════ */
  function showBaziPan() {
    try {
      var box = document.getElementById('yixinghuandouDIV');
      if (!box) return;
      if (box.getAttribute('data-mode') === 'bazi') {   // 再点一次收起
        box.innerHTML = ''; box.style.display = 'none'; box.removeAttribute('data-mode');
        return;
      }
      var y = window.Y, mo = window.M, dd = window.D, hh = window.hr, mi = window.mn;
      if (y === undefined) { var now = new Date(); y = now.getFullYear(); mo = now.getMonth() + 1; dd = now.getDate(); hh = now.getHours(); mi = now.getMinutes(); }
      var nm = '', gd = '男';
      var el = document.getElementById('mlName'); if (el && el.value) nm = el.value;
      var eg = document.getElementById('mlGender'); if (eg && eg.value) gd = eg.value;
      var data = baziChart({ year: y, month: mo, day: dd, hour: hh, minute: mi, name: nm, gender: gd });
      box.innerHTML = renderBazi(data);
      box.style.display = 'block';
      box.setAttribute('data-mode', 'bazi');
    } catch (e) {
      if (window._logErr) window._logErr('showBaziPan', e && e.message);
      var b2 = document.getElementById('yixinghuandouDIV');
      if (b2) { b2.style.display = 'block'; b2.innerHTML = '<div style="color:var(--c-po);padding:8px">八字错误:' + (e && e.message) + '</div>'; }
    }
  }

  window.baziChart = baziChart;
  window.baziMainRows = baziMainRows;
  window.baziJiaoYunBlock = baziJiaoYunBlock;
  window.renderBazi = renderBazi;
  window.showBaziPan = showBaziPan;
})();
