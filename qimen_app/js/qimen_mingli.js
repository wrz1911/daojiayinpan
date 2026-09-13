/*!
 * 命理奇门 (panType 6) —— 阴盘奇门 + 命理层
 *
 * 与「时盘/刻盘」的区别: 以**出生时间**排盘看命, 而非起局断事。
 *
 * ⚠ 本文件的结构**逐段照搬热卜「命理奇门」(mod=mingli)** 的结果页, 取自其真实
 * 模板(16979 字节), 顺序与 id 完全一致:
 *
 *   #panHead          头部表: 名称/性别/生肖 ｜ 出生(公历+农历) ｜ 节气·月将·局
 *                      ｜ 旬首·值符·值使·马星·空亡 ｜ 四柱(五行着色)
 *   #content          #ma1 + 外圈上(waipan6/7/8) + yinGan9 + #ma2
 *                     + leftTable(waipan5/4/3 + yinGan4/3/8) + #pan(九宫)
 *                     + rightTable(yinGan2/7/6 + waipan9/10/11)
 *                     + #ma3 + 外圈下(waipan2/1/12) + yinGan1 + #ma4
 *                     末尾 #Tip 颜色说明
 *   #dayun_liunian    大运表(yunTitle + dayun_year{n} + dayun{n} onclick=yunFocus)
 *                     + 流年表(yunTitle + liunian1_{c} + liunian2_{c})
 *   #btnTable1        移星换斗 | 天门地户 | 长生状态        (btn1/btn3/btn2)
 *   #btnTable2        年神将 | 月神将 | 日神将 | 时神将     (btn4..btn7)
 *   #yixinghuandouDIV + #tableTemp
 *
 * 外圈与状态复用本项目**已有的**函数(山向盘在用, 已导出到 window):
 *   shen12(1..4)    十二神将, 1=年 2=月 3=日 4=时
 *   tianmenDihu()   天门地户(月将加时 + 建除十二神)
 *   showState()     十二长生(写宫内 stateTian/stateDi)
 * 它们读 window._raw / window._sizhuObj / window._palaces, 故排盘后需设置。
 */
(function () {
  'use strict';

  var GAN = '甲乙丙丁戊己庚辛壬癸';
  var ZHI = '子丑寅卯辰巳午未申酉戌亥';
  var SX = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
  /** 天干五行色 — 取自热卜结果页的内联着色 */
  var GAN_COLOR = { 甲: '#43ab18', 乙: '#43ab18', 丙: '#e40b06', 丁: '#e40b06',
                    戊: '#964607', 己: '#964607', 庚: '#f4a600', 辛: '#f4a600',
                    壬: '#006aff', 癸: '#006aff' };
  /** 地支五行色 */
  var ZHI_COLOR = { 子: '#006aff', 丑: '#964607', 寅: '#43ab18', 卯: '#43ab18',
                    辰: '#964607', 巳: '#e40b06', 午: '#e40b06', 未: '#964607',
                    申: '#f4a600', 酉: '#f4a600', 戌: '#964607', 亥: '#006aff' };

  var dec = function (s) { return String(s == null ? '' : s); };
  var ganSpan = function (g) { return '<font style="color:' + (GAN_COLOR[g] || '#333') + '">' + g + '</font>'; };
  var zhiSpan = function (z) { return '<font style="color:' + (ZHI_COLOR[z] || '#333') + '">' + z + '</font>'; };

  /** 某一柱的旬空: 旬空偏移 = 10 - (干序+1), 与地支序相加取模(与热卜 kong() 同式) */
  function xunKongOf(gz) {
    gz = dec(gz);
    if (gz.length < 2) return '';
    var gi = GAN.indexOf(gz[0]), zi = ZHI.indexOf(gz[1]);
    if (gi < 0 || zi < 0) return '';
    var b = ((zi + (10 - (gi + 1))) % 12 + 12) % 12;
    return ZHI[(b + 1) % 12] + ZHI[(b + 2) % 12];
  }

  /**
   * 命理奇门排盘。
   * opts: { year, month, day, hour, minute, gender('男'|'女'), name }
   */
  window.mingliChart = function (opts) {
    opts = opts || {};
    var year = opts.year, month = opts.month, day = opts.day, hour = opts.hour, minute = opts.minute || 0;
    var gender = opts.gender || '男';

    var qr = window.qimenChart({ year: year, month: month, day: day, hour: hour, minute: minute, panType: 1 });

    var bz = null;
    try { bz = window.computeBaZiDaYun({ year: year, month: month, day: day, hour: hour, gender: gender }); }
    catch (e) { if (window._logErr) window._logErr('mingli.bazi', e && e.message); }

    // 四柱 —— qimenChart 的 sizhu 是**对象**(与 chuanRenChart 的字符串不同)
    var gzOf = function (k) { return dec(qr.sizhu && qr.sizhu[k] && qr.sizhu[k].ganZhi); };
    var siZhu = { nian: gzOf('y'), yue: gzOf('m'), ri: gzOf('d'), shi: gzOf('h') };

    var kong = { nian: xunKongOf(siZhu.nian), yue: xunKongOf(siZhu.yue),
                 ri: xunKongOf(siZhu.ri), shi: xunKongOf(siZhu.shi) };

    // 供 shen12 / tianmenDihu / showState 使用
    window._raw = qr.raw || '';
    window._sizhuObj = qr.sizhu || null;
    var palsForState = {};
    for (var g = 1; g <= 9; g++) { if (g !== 5) palsForState['gong' + g] = (qr.pals && qr.pals[g]) || null; }
    window._palaces = palsForState;

    // 生肖: 按年支
    var shengXiao = SX[ZHI.indexOf(siZhu.nian[1])] || '';

    return {
      qr: qr, bz: bz, sizhu: siZhu, gender: gender, shengXiao: shengXiao,
      name: opts.name || '未知',
      kong: kong,
      yueJiang: dec(qr.yueJiang),
      juLabel: qr.juLabel,
      /** 当前外圈: 'none' | 1..4(神将) | 'tmdh' | 'state' | 1|3(移星换斗) */
      ringKind: 'none',
      /** 当前高亮的大运序号 */
      yunIdx: (bz && bz.curDY) || 0,
    };
  };

  /* ───────────────── 外圈 / 状态切换 (照搬热卜 btn() 的按钮行为) ───────────────── */

  /** 按钮高亮: 3..7 互斥, 再点同一个则取消并清空外圈 */
  window.mingliBtn = function (b, data) {
    var isRing = (b >= 3 && b <= 7);
    var bz = document.getElementById('yixinghuandouDIV');   // 切神将时收起八字盘
    if (bz && bz.getAttribute('data-mode') === 'bazi') {
      bz.innerHTML = ''; bz.removeAttribute('data-mode'); bz.style.display = 'none';
    }
    if (isRing && data && data.ringKind === b) {          // 再点一次 → 取消
      data.ringKind = 'none';
      if (window.clearWaipan) { try { window.clearWaipan(); } catch (e) { if (window._logErr) window._logErr('clearWaipan', e && e.message); } }
      return 'none';
    }
    if (window.clearWaipan) { try { window.clearWaipan(); } catch (e) { if (window._logErr) window._logErr('clearWaipan', e && e.message); } }
    try {
      if (b === 3) { if (window.tianmenDihu) window.tianmenDihu(); }      // 天门地户
      else if (b === 4) { if (window.shen12) window.shen12(1); }          // 年神将
      else if (b === 5) { if (window.shen12) window.shen12(2); }          // 月神将
      else if (b === 6) { if (window.shen12) window.shen12(3); }          // 日神将
      else if (b === 7) { if (window.shen12) window.shen12(4); }          // 时神将
    } catch (e) { if (window._logErr) window._logErr('mingliBtn', e && e.message); }
    return isRing ? b : (data ? data.ringKind : 'none');
  };

  /** 长生状态(btn2): 写宫内, 独立开关, 不动外圈 */
  window.mingliState = function () { if (window.showState) window.showState(); };

  /* ───────────────── 大运 / 流年 ───────────────── */

  /**
   * 高亮第 n 步大运, 并把该运的 10 个流年填进 liunian1_{c}/liunian2_{c}。
   * 照搬热卜 yun(a) 的行为: 一步大运 10 年, 虚岁 = 流年-出生年+1。
   */
  window.mingliYun = function (n, data) {
    var bz = data && data.bz;
    if (!bz || !bz.dayun || !bz.dayun.length) return;
    n = parseInt(n, 10) || 0;
    if (n < 0) n = 0;
    if (n >= bz.dayun.length) n = bz.dayun.length - 1;

    // 大运格高亮
    for (var i = 0; i < 10; i++) {
      var el = document.getElementById('dayun' + i);
      var yr = document.getElementById('dayun_year' + i);
      var on = (i === n);
      if (el) { el.style.background = on ? '#faf8f3' : ''; el.style.color = on ? '#e40b06' : ''; el.style.fontWeight = on ? 'bold' : ''; }
      if (yr) { yr.style.background = on ? '#faf8f3' : ''; }
    }
    // 流年: 该运第 c 年
    var startYear = (bz.qiYunYear || 0) + 10 * n;
    var birthYear = (data.qr && data.qr.gongli ? parseInt(dec(data.qr.gongli).slice(0, 4), 10) : 0);
    var ln = bz.liuNian || [];
    for (var c = 0; c < 10; c++) {
      var y = ln[n * 10 + c];
      var e1 = document.getElementById('liunian1_' + c);
      var e2 = document.getElementById('liunian2_' + c);
      if (!y) { if (e1) e1.innerHTML = ''; if (e2) e2.innerHTML = ''; continue; }
      var age = birthYear ? (y.year - birthYear + 1) : '';
      if (e1) e1.innerHTML = y.year + '<br>' + age + '岁';
      if (e2) e2.innerHTML = ganSpan(y.g) + zhiSpan(y.z);
    }
    data.yunIdx = n;
    void startYear;
  };

  /* ───────────────── 输入面板 ───────────────── */

  /** 命理输入面板(姓名 + 性别)。出生时间复用页面顶部的年月日时选择器。 */
  window.renderMingliInputs = function (d) {
    d = d || {};
    var gender = d.gender || '男';
    var name = d.name || '';
    var h = '<div class="ml-input-panel"><table style="width:100%;border-collapse:collapse"><tr>';
    h += '<td style="width:44px;font-size:13px;color:var(--c-text-2);text-align:right;padding-right:4px">姓名</td>';
    h += '<td style="width:34%"><input id="mlName" class="sel-date" style="width:100%;box-sizing:border-box" type="text" maxlength="20" value="' + name.replace(/"/g, '&quot;') + '" onchange="doMingli()"></td>';
    h += '<td style="width:44px;font-size:13px;color:var(--c-text-2);text-align:right;padding-right:4px">性别</td>';
    h += '<td><select id="mlGender" class="sel-date" style="width:100%" onchange="doMingli()">';
    ['男', '女'].forEach(function (g) { h += '<option value="' + g + '"' + (g === gender ? ' selected' : '') + '>' + g + '</option>'; });
    h += '</select></td>';
    h += '</tr></table></div>';
    return h;
  };

  /* ───────────────── 渲染(逐段照搬热卜结果页) ───────────────── */

  window.renderMingli = function (data, containerId) {
    var h = '';
    try {
      var qr = data.qr, bz = data.bz, sz = data.sizhu;

      /* ── ① #panHead 头部表 ── */
      h += '<div id="panHead"><TABLE class="pan" id="headTable">';
      h += '<TR><TD colspan="5" style="line-height:30px">' +
           '<font style="color:#dead68">名称：</font><font id="name">' + data.name + '</font>&emsp;' +
           '<font style="color:#dead68">性别：</font><font id="gender">' + data.gender + '</font>&emsp;' +
           '<font style="color:#dead68">生肖：</font>' + data.shengXiao + '</TD></TR>';
      // 热卜格式: 1986-12-11(农历十一月初十)
      var birthYmd = qr.gongli.replace(/^(\d+)年(\d+)月(\d+)日.*$/, function (m, a, b, c) {
        return a + '-' + ('0' + b).slice(-2) + '-' + ('0' + c).slice(-2);
      });
      h += '<TR><TD style="width:16%;color:#dead68">出生</TD>' +
           '<TD colspan="4" id="datetime">' + birthYmd + '(' + qr.nongli + ')</TD></TR>';
      h += '<TR><TD style="color:#dead68">节气</TD>' +
           '<TD colspan="2">' + qr.jieqi + '&nbsp;&nbsp;&nbsp;月将<B>' + data.yueJiang + '</B></TD>' +
           '<TD colspan="2">' + qr.juLabel.replace(/^(\D+)/, '$1<B>').replace(/(\d+)$/, '$1</B>') + '</TD></TR>';
      h += '<TR id="tdTitle"><TD>旬首</TD><TD>值符</TD><TD>值使</TD><TD>马星</TD><TD>空亡</TD></TR>';
      // 旬首显示为「旬首+遁干」(热卜格式: 甲子戊), 六甲遁于六仪
      var XUN_DUN = { 子: '戊', 戌: '己', 申: '庚', 午: '辛', 辰: '壬', 寅: '癸' };
      var xunShouTxt = dec(qr.xs.gz) + (XUN_DUN[dec(qr.xs.gz)[1]] || '');
      h += '<TR><TD id="xunShou">' + xunShouTxt + '</TD>' +
           '<TD>天<font id="zhiFu">' + qr.zf.s + '</font></TD>' +
           '<TD><font id="zhiShi">' + qr.zs.s + '</font>门</TD>' +
           '<TD id="maXing">' + qr.ma.z + '</TD>' +
           '<TD>' + qr.kw.gz + '</TD></TR>';
      h += '<TR><TD style="color:#dead68" rowspan="2">四柱</TD>' +
           '<TD class="sizhuTitle">年柱</TD><TD class="sizhuTitle">月柱</TD>' +
           '<TD class="sizhuTitle">日柱</TD><TD class="sizhuTitle">时柱</TD></TR>';
      h += '<TR id="sizhu">';
      [sz.nian, sz.yue, sz.ri, sz.shi].forEach(function (gz) {
        h += '<TD>' + ganSpan(gz[0] || '') + '<br>' + zhiSpan(gz[1] || '') + '</TD>';
      });
      h += '</TR></TABLE></div>';

      /* ── ② #content 盘体 + 外圈 ── */
      if (window.buildPaipanGrid && qr.pals) {
        var pals = {}, kongGongs = {};
        for (var g = 1; g <= 9; g++) {
          if (g === 5) continue;
          var p = qr.pals[g] || {};
          pals['gong' + g] = {
            shen: p.shen || '', tian: p.tian || '', di: p.di || '', xing: p.xing || '',
            men: p.men || '', anGan: p.anGan || '', kong: !!p.kong, isMenPo: !!p.mp,
            isTianXing: !!p.tx, isTianMu: !!p.tm, isDiXing: !!p.dx, isDiMu: !!p.dm,
          };
          if (p.kong) kongGongs[g] = true;
        }
        if (window.recalcColors) window.recalcColors(pals);
        var csFn = window._colorSpan || function (v) { return v || ''; };
        var agFn = function () { return ''; };
        // 不传 wrapperClass/panClass, 让 buildPaipanGrid 生成与热卜一致的
        // <div id="content"> 与 <TABLE id="pan">
        h += window.buildPaipanGrid(pals, kongGongs, (qr.ma && qr.ma.p) || 'ma2', agFn,
               { colorSpan: csFn });
        // 颜色说明(与穿壬/时盘同一行文案, 用共用 .cx-* 类, 随主题变量走)
        h += '<div id="Tip">颜色说明：' +
             '<span class="cx-mu">入墓</span>、<span class="cx-xing">击刑</span>、' +
             '<span class="cx-po">门迫</span>、<span class="cx-xingmu">刑+墓</span></div>';
      }

      /* ── ③ #dayun_liunian 大运 + 流年(两个独立 TABLE, 照搬热卜) ── */
      if (bz && bz.dayun && bz.dayun.length) {
        var n = Math.min(bz.dayun.length, 10);

        h += '<div id="dayun_liunian"><TABLE class="pan">';
        h += '<TR><TD class="yunTitle" rowspan="2">大<br>运</TD>';
        for (var d = 0; d < n; d++) {
          h += '<TD class="yun1" id="dayun_year' + d + '">' + (bz.qiYunYear + d * 10) + '</TD>';
        }
        h += '</TR><TR>';
        for (var d2 = 0; d2 < n; d2++) {
          var dy = bz.dayun[d2], ss = (bz.dayunSS || [])[d2] || '';
          var cur = (d2 === data.yunIdx);
          h += '<TD class="yun2" id="dayun' + d2 + '" onclick="mingliYun(' + d2 + ',window._mlData)"' +
               (cur ? ' style="font-weight:bold;color:#e40b06;background:#faf8f3"' : '') + '>' +
               ganSpan(dy.g) + '<br>' + zhiSpan(dy.z) + '<br><font class="shishen">' + ss + '</font></TD>';
        }
        h += '</TR></TABLE>';

        h += '<TABLE class="pan">';
        h += '<TR><TD class="yunTitle" rowspan="2">流<br>年</TD>';
        for (var c = 0; c < 10; c++) h += '<TD class="liunian1" id="liunian1_' + c + '"></TD>';
        h += '</TR><TR>';
        for (var c2 = 0; c2 < 10; c2++) h += '<TD class="liunian2" id="liunian2_' + c2 + '"></TD>';
        h += '</TR></TABLE></div>';
      }

      /* ── ④ #btnTable1 ── */
      h += '<TABLE id="btnTable1"><TR>';
      h += '<TD><div class="btn" id="btn1" onclick="showMingliYixing();mingliBtn(1,window._mlData);">移星换斗</div></TD>';
      h += '<TD><div class="btn" id="btn3" onclick="mingliBtn(3,window._mlData);">天门地户</div></TD>';
      h += '<TD><div class="btn" id="btn2" onclick="mingliState();mingliBtn(2,window._mlData);">长生状态</div></TD>';
      h += '<TD><div class="btn" id="btnBazi" onclick="showBaziPan();">八字排盘</div></TD>';
      h += '</TR></TABLE>';

      /* ── ⑤ #btnTable2 ── */
      h += '<TABLE id="btnTable2"><TR>';
      ['年神将', '月神将', '日神将', '时神将'].forEach(function (t, i) {
        h += '<TD><div class="btn" id="btn' + (i + 4) + '" onclick="mingliBtn(' + (i + 4) + ',window._mlData);">' + t + '</div></TD>';
      });
      h += '</TR></TABLE>';

      /* ── ⑥ 移星换斗容器 ── */
      h += '<div id="yixinghuandouDIV"></div><div id="tableTemp" style="display:none"></div>';
    } catch (e) {
      h += '<div style="color:red;padding:12px">命理渲染错误: ' + (e && e.message) + '</div>';
      if (window._logErr) window._logErr('renderMingli', e && e.message);
    }

    h += '<style>' +
      '.ml-dy-wrap{width:100%;max-width:520px;margin:0 auto}' +
      '</style>';

    if (containerId) {
      var el = document.getElementById(containerId);
      if (el) el.innerHTML = h;
    }
    return h;
  };

  /** 移星换斗(占位: 保持与热卜一致的按钮结构, 功能待补) */
  window.showMingliYixing = function () {
    var d = document.getElementById('yixinghuandouDIV');
    if (!d) return;
    if (d.getAttribute('data-mode') === 'bazi') {   // 八字盘占着容器时先让位
      d.innerHTML = ''; d.removeAttribute('data-mode'); d.style.display = 'none';
    }
    d.style.display = (d.style.display === 'block') ? 'none' : 'block';
    if (d.style.display === 'block' && !d.innerHTML) {
      d.innerHTML = '<div style="text-align:center;color:var(--c-text-3);font-size:12px;padding:8px">' +
                    '移星换斗：点击盘面宫位查看各宫换斗星（待补全）</div>';
    }
  };
})();
