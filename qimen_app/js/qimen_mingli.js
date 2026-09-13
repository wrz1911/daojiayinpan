/*!
 * 命理奇门 (panType 6) —— 阴盘奇门 + 命理层
 *
 * 与「时盘/刻盘」的区别: 以**出生时间**排盘看命, 而非起局断事。在标准阴盘
 * 盘面上叠加命理层:
 *   - 四柱各自的旬空(年月日时四个, 而非只标时柱)
 *   - 十二神将按四柱分别起(shen12 的 1..4 对应年/月/日/时)
 *   - 天门地户(月将加时排十二月将 + 建除十二神)
 *   - 十神 / 藏干 / 纳音 / 地势(十二长生) / 自坐 / 空亡
 *   - 大运(10 年一步) + 逐流年
 *
 * 参照: 热卜「命理奇门」(mod=mingli, 页面标题「阴盘命理奇门」) —— 该模块的
 * 内联数据表与本项目逐字相同(qiyi/jiuXing/baMen/baShen/shenJue/ZhiGan/Shisheng*
 * 及 shenJiang), 属同一流派。
 *
 * 复用的现有零件(均已在全局):
 *   qimenChart(opts)        奇门盘(时盘)
 *   computeBaZiDaYun(opts)  八字大运/流年/十神/纳音/藏干/地势/自坐/空亡
 *   buildPaipanGrid(...)    九宫网格 HTML
 *   QM.CHANGSHENG           十二长生(按干按宫)
 *   QM.TMS / QM.DHS         十二月将全名 / 建除十二神
 */
(function () {
  'use strict';

  var GAN = '甲乙丙丁戊己庚辛壬癸';
  var ZHI = '子丑寅卯辰巳午未申酉戌亥';
  /** 十二神将(黄道十二神): 与 QM.SHENJIANG_NAMES 同源 */
  var SHEN_JIANG = ['青龙', '明堂', '天刑', '朱雀', '金匮', '天德',
                    '白虎', '玉堂', '天牢', '玄武', '司命', '勾陈'];
  /** 起宫序号表: 与 QM.SHENJUE 同源 */
  var SHEN_JUE = [9, 11, 1, 3, 5, 7, 9, 11, 1, 3, 5, 7];
  /** 十二月将全名(与 QM.TMS 同源) */
  var YUE_JIANG_FULL = ['神后子', '大吉丑', '功曹寅', '太冲卯', '天罡辰', '太乙巳',
                        '胜光午', '小吉未', '传送申', '从魁酉', '河魁戌', '登明亥'];
  /** 建除十二神(与 QM.DHS 同源) */
  var JIAN_CHU = ['建', '除', '满', '平', '定', '执', '破', '危', '成', '收', '开', '闭'];

  var dec = function (s) { return String(s == null ? '' : s); };

  /**
   * 某一柱的旬空: 旬空偏移 = 10 - (干序+1), 再与地支序相加取模。
   * 与热卜命理模块的 kong() 同式, 也与本项目 QM 的 kwMap 口径一致。
   */
  function xunKongOf(gz) {
    gz = dec(gz);
    if (gz.length < 2) return '';
    var gi = GAN.indexOf(gz[0]), zi = ZHI.indexOf(gz[1]);
    if (gi < 0 || zi < 0) return '';
    var off = 10 - (gi + 1);
    var b = ((zi + off) % 12 + 12) % 12;
    return ZHI[(b + 1) % 12] + ZHI[(b + 2) % 12];
  }

  /**
   * 十二神将排布: 以某柱地支起, 顺排十二神将到十二宫。
   * 与热卜命理模块 shen12(b) 同构(b: 1=年 2=月 3=日 4=时)。
   */
  function paiShenJiang(zhi) {
    var zi = ZHI.indexOf(zhi);
    if (zi < 0) return {};
    var start = SHEN_JUE[zi];
    var out = {};
    for (var i = 0; i < 12; i++) {
      var g = (start + i) % 12;
      if (g === 0) g = 12;
      out[g] = SHEN_JIANG[i];   // 键为地支序号 1..12(子=1)
    }
    return out;
  }

  /**
   * 天门地户: 以时支为起点顺排十二格, 每格 = 月将加时所得神名 + 建除神。
   * 与本项目引擎里的 tianmen/dihu 计算同构(月将顺排 + 建除顺排)。
   */
  function paiTianMenDiHu(shiZhi, yueJiang) {
    var zp = ZHI.indexOf(shiZhi), yp = ZHI.indexOf(yueJiang);
    if (zp < 0 || yp < 0) return {};
    var out = {};
    for (var i = 0; i < 12; i++) {
      var start = (zp + i + 1) % 12;
      if (start === 0) start = 12;
      var tp = (yp + i) % 12;
      out[start] = { shen: YUE_JIANG_FULL[tp], jian: JIAN_CHU[i] };
    }
    return out;
  }

  /**
   * 命理奇门排盘。
   * opts: { year, month, day, hour, minute, gender('男'|'女'), nianMing(地支, 可选) }
   */
  window.mingliChart = function (opts) {
    opts = opts || {};
    var year = opts.year, month = opts.month, day = opts.day, hour = opts.hour, minute = opts.minute || 0;
    var gender = opts.gender || '男';

    // ① 奇门盘(复用现有引擎, 时盘)
    var qr = window.qimenChart({ year: year, month: month, day: day, hour: hour, minute: minute, panType: 1 });

    // ② 八字大运(复用穿壬模块里已有的实现)
    var bz = null;
    try {
      bz = window.computeBaZiDaYun({ year: year, month: month, day: day, hour: hour, gender: gender });
    } catch (e) {
      if (window._logErr) window._logErr('mingli.bazi', e && e.message);
    }

    // ③ 四柱 —— 注意 qimenChart 的 sizhu 是**对象**({y:{ganZhi},m:…,d:…,h:…}),
    //    与 chuanRenChart 的字符串 sizhu 不同, 勿混用。
    var gzOf = function (k) { return dec(qr.sizhu && qr.sizhu[k] && qr.sizhu[k].ganZhi); };
    var siZhu = { nian: gzOf('y'), yue: gzOf('m'), ri: gzOf('d'), shi: gzOf('h') };

    // ④ 四柱各自的旬空(命理特征: 四个而非一个)
    var kong = {
      nian: xunKongOf(siZhu.nian), yue: xunKongOf(siZhu.yue),
      ri: xunKongOf(siZhu.ri), shi: xunKongOf(siZhu.shi),
    };

    // ⑤ 十二神将(四柱各一套) 与 天门地户
    var shenJiang = {
      1: paiShenJiang(siZhu.nian[1]), 2: paiShenJiang(siZhu.yue[1]),
      3: paiShenJiang(siZhu.ri[1]), 4: paiShenJiang(siZhu.shi[1]),
    };
    var tmdh = paiTianMenDiHu(siZhu.shi[1], dec(qr.yueJiang)); // qr.yueJiang 是字符串(非对象)

    // ⑥ 宫位的十二长生(天盘干 / 地盘干各一个, 复用 QM.CHANGSHENG)
    var CS_IDX = (window.QM && window.QM.CS_IDX) || { 4: 0, 9: 1, 2: 2, 3: 3, 7: 4, 8: 5, 1: 6, 6: 7 };
    var changSheng = {};
    for (var g = 1; g <= 9; g++) {
      if (g === 5) continue;
      var p = (qr.pals && qr.pals[g]) || {};
      var idx = CS_IDX[g];
      var t = dec(p.tian)[0], d = dec(p.di)[0];
      changSheng[g] = {
        tian: (window.QM && window.QM.CHANGSHENG[t] && idx !== undefined) ? window.QM.CHANGSHENG[t][idx] : '',
        di: (window.QM && window.QM.CHANGSHENG[d] && idx !== undefined) ? window.QM.CHANGSHENG[d][idx] : '',
      };
    }

    return {
      qr: qr, bz: bz,
      sizhu: siZhu,
      gender: gender,
      nianMing: opts.nianMing || siZhu.shi[1] || '',
      kong: kong,
      shenJiang: shenJiang,
      tianmenDihu: tmdh,
      changSheng: changSheng,
      yueJiang: dec(qr.yueJiang),
      juLabel: qr.juLabel,
    };
  };

  /** 染色: 按五行给干着色(与穿壬一致的观感) */
  function wxSpan(ch) {
    if (!ch) return '';
    var color = (window.QM && window.QM.WX_COLOR && window.QM.WX_COLOR[ch]) || '#333';
    return '<font color="' + color + '">' + ch + '</font>';
  }

  /**
   * 渲染命理奇门。
   * data: mingliChart 的返回值 ｜ containerId: 可选, 传入则写入该元素
   */
  window.renderMingli = function (data, containerId) {
    var h = '';
    try {
      var qr = data.qr, bz = data.bz, sz = data.sizhu;

      // ── 头部 ──
      h += '<div id="panHead"><TABLE class="pan" id="headTable">';
      h += '<TR><TD id="dTitle">日期</TD><TD colspan="4" id="dateTime">' + qr.gongli + '（' + qr.nongli + '）</TD></TR>';
      h += '<TR><TD style="color:var(--c-gold)">节气</TD><TD colspan="2">' + qr.jieqi + '</TD><TD colspan="2">' + qr.juLabel + ' <b>' + (data.gender === '女' ? '坤造' : '乾造') + '</b></TD></TR>';
      h += '<TR id="tdTitle"><TD>值符</TD><TD>值使</TD><TD>旬首</TD><TD>空亡</TD><TD>马星</TD></TR>';
      h += '<TR><TD>' + qr.zf.n + '</TD><TD>' + qr.zs.n + '</TD><TD>' + qr.xs.gz + '</TD><TD>' + qr.kw.gz + '</TD><TD>' + qr.ma.z + '</TD></TR>';
      h += '<TR id="tdTitle"><TD>月将</TD><TD>年命</TD><TD>性别</TD><TD colspan="2">四柱</TD></TR>';
      h += '<TR><TD>' + data.yueJiang + '</TD><TD>' + data.nianMing + '</TD><TD>' + data.gender + '</TD><TD colspan="2">' + [sz.nian, sz.yue, sz.ri, sz.shi].join(' ') + '</TD></TR>';
      h += '</TABLE></div>';

      // ── 四柱命理表(十神/藏干/纳音/地势/自坐/空亡/旬空) ──
      h += '<table class="ml-bz-tbl"><tr><td>四柱</td><td>年柱</td><td>月柱</td><td>日柱</td><td>时柱</td></tr>';
      if (bz) {
        h += '<tr><td>十神</td>';
        bz.bz.forEach(function (c, i) { h += '<td>' + (i === 2 ? '日元' : (bz.shishen[i] || '')) + '</td>'; });
        h += '</tr>';
        h += '<tr class="ml-bz-zao"><td>' + (data.gender === '女' ? '坤造' : '乾造') + '</td>';
        bz.bz.forEach(function (c) { h += '<td>' + wxSpan(c.g) + '<br>' + wxSpan(c.z) + '</td>'; });
        h += '</tr>';
        h += '<tr class="ml-bz-cg"><td>藏干</td>';
        bz.bz.forEach(function (c, i) {
          var cg = bz.cangGan[i] || '';
          var s = '';
          for (var k = 0; k < cg.length; k++) s += wxSpan(cg[k]);
          h += '<td>' + s + '<br><span class="ml-bz-cgss">' +
               [bz.cgSS[i * 3], bz.cgSS[i * 3 + 1], bz.cgSS[i * 3 + 2]].filter(Boolean).join(' ') + '</span></td>';
        });
        h += '</tr>';
        h += '<tr><td>纳音</td>';
        (bz.nayin || []).forEach(function (c) { h += '<td>' + c + '</td>'; });
        h += '</tr>';
        h += '<tr><td>地势</td>';
        (bz.dishi || []).forEach(function (c) { h += '<td>' + c + '</td>'; });
        h += '</tr>';
        h += '<tr><td>自坐</td>';
        (bz.zizuo || []).forEach(function (c) { h += '<td>' + c + '</td>'; });
        h += '</tr>';
        h += '<tr><td>星运空</td>';
        (bz.xunKong || []).forEach(function (c) { h += '<td>' + c + '</td>'; });
        h += '</tr>';
      } else {
        h += '<tr><td>十神</td><td colspan="4">（八字大运计算失败，详见错误日志）</td></tr>';
      }
      // 每柱各自的旬空(命理特征)
      h += '<tr><td>旬空</td><td>' + data.kong.nian + '</td><td>' + data.kong.yue + '</td><td>' + data.kong.ri + '</td><td>' + data.kong.shi + '</td></tr>';
      h += '</table>';

      // ── 奇门盘(复用九宫网格) ──
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
        // 命理层: 在每宫左下角标注十二长生(天盘/地盘各一)
        h += '<div class="ml-grid-wrap"><div class="ml-grid-inner">' +
             window.buildPaipanGrid(pals, kongGongs, (qr.ma && qr.ma.p) || 'ma2', agFn,
               { colorSpan: csFn, wrapperClass: 'ml-inner', panClass: 'ml-pan' }) + '</div>';
        // 十二神将外圈(默认按日柱, 与命理看命的习惯一致)
        h += '<div class="ml-ring">';
        for (var i = 0; i < 12; i++) {
          var zi = i + 1;                       // 地支序号 1..12
          var zhi = ZHI[i];
          var sj = (data.shenJiang[3] || {})[zi] || '';   // 3 = 日柱
          var td = data.tianmenDihu[zi] || {};
          h += '<div class="ml-card" data-zhi="' + zhi + '">' +
               '<span class="ml-sj">' + sj + '</span>' +
               '<span class="ml-zhi">' + zhi + '</span>' +
               '<span class="ml-tm">' + (td.shen || '') + '</span>' +
               '<span class="ml-jc">' + (td.jian || '') + '</span>' +
               '</div>';
        }
        h += '</div>';
        h += '<div class="ml-cs-note">十二神将按<b>日柱</b>起；天门地户 = 月将加时</div>';
        // 十二长生(天盘干/地盘干各一) —— 以日干为准的长生十二宫, 落在各宫
        if (data.changSheng) {
          h += '<table class="ml-cs-tbl"><tr><td>宫位</td>';
          var gongs = [4, 9, 2, 3, 7, 8, 1, 6];
          gongs.forEach(function (g) { h += '<td>' + g + '</td>'; });
          h += '</tr><tr><td>天盘</td>';
          gongs.forEach(function (g) { h += '<td>' + ((data.changSheng[g] || {}).tian || '') + '</td>'; });
          h += '</tr><tr><td>地盘</td>';
          gongs.forEach(function (g) { h += '<td>' + ((data.changSheng[g] || {}).di || '') + '</td>'; });
          h += '</tr></table>';
        }
        h += '</div>';
      }

      // ── 大运 ──
      if (bz && bz.dayun && bz.dayun.length) {
        var n = Math.min(bz.dayun.length, 10);
        h += '<table class="ml-dy-tbl">';
        h += '<tr class="ml-dy-info"><td colspan="' + (n + 1) + '">' + (bz.qiYunDesc || '') + '</td></tr>';
        h += '<tr class="ml-dy-hdr"><td class="ml-dy-lbl" rowspan="2">大运</td>';
        for (var d = 0; d < n; d++) h += '<td>' + (bz.qiYunYear + d * 10) + '</td>';
        h += '</tr><tr>';
        for (var d2 = 0; d2 < n; d2++) {
          var dy = bz.dayun[d2], ss = (bz.dayunSS || [])[d2] || '';
          var cur = (d2 === bz.curDY);
          h += '<td><span class="ml-dy-gz' + (cur ? ' ml-cur' : '') + '">' +
               wxSpan(dy.g) + '<br>' + wxSpan(dy.z) + '</span><br><span class="ml-dy-ss">' + ss + '</span></td>';
        }
        h += '</tr>';
        // 流年: 每运 10 年, 每年一格
        var ln = bz.liuNian || [];
        for (var r = 0; r < 10; r++) {
          h += '<tr class="ml-dy-liu">';
          if (r === 0) h += '<td class="ml-dy-lbl" rowspan="10">流年</td>';
          for (var c2 = 0; c2 < n; c2++) {
            var y = ln[c2 * 10 + r];
            var isCur = y && y.year === bz.curYear;
            h += '<td>' + (isCur ? '<span class="ml-cur">' : '') +
                 (y ? wxSpan(y.g) + wxSpan(y.z) : '') + (isCur ? '</span>' : '') + '</td>';
          }
          h += '</tr>';
        }
        h += '</table>';
      }
    } catch (e) {
      h += '<div style="color:red;padding:12px">命理渲染错误: ' + (e && e.message) + '</div>';
      if (window._logErr) window._logErr('renderMingli', e && e.message);
    }

    // ── 样式 ──
    h += '<style>' +
      '.ml-bz-tbl,.ml-dy-tbl{width:100%;max-width:520px;margin:8px auto;border-collapse:collapse;font-size:12px}' +
      '.ml-bz-tbl td,.ml-dy-tbl td{border:1px solid var(--c-border);text-align:center;vertical-align:middle;padding:3px 2px;line-height:1.3}' +
      '.ml-bz-tbl tr td:first-child,.ml-dy-lbl{background:var(--c-gray-bg);color:var(--c-gold);font-size:11px;font-weight:500}' +
      '.ml-bz-zao td{font-size:17px;font-weight:bold;padding:2px 1px!important}' +
      '.ml-bz-cg td{font-size:13px}' +
      '.ml-bz-cgss{font-size:10px;color:var(--c-text-3)}' +
      '.ml-dy-hdr td:not(.ml-dy-lbl){background:var(--c-gray-bg);color:var(--c-gold);font-size:10px}' +
      '.ml-dy-gz{font-size:14px}.ml-dy-ss{font-size:10px;color:var(--c-text-3)}' +
      '.ml-cur{color:#d82828;font-weight:bold}' +
      '.ml-dy-info td{background:var(--c-gray-bg);font-size:13px;padding:5px;color:var(--c-text)}' +
      '.ml-dy-liu td{font-size:11px}' +
      '.ml-grid-wrap{position:relative;max-width:360px;margin:10px auto}' +
      '.ml-pan{width:100%;border-collapse:collapse;table-layout:fixed!important}' +
      '.ml-ring{display:flex;flex-wrap:wrap;justify-content:center;gap:2px;margin-top:6px}' +
      '.ml-card{display:flex;flex-direction:column;align-items:center;border:1px solid var(--c-border);border-radius:5px;padding:2px 5px;font-size:11px;min-width:40px}' +
      '.ml-sj{color:var(--c-gold);font-size:10px}' +
      '.ml-zhi{font-weight:bold;font-size:12px}' +
      '.ml-tm{color:var(--c-text-3);font-size:9px}' +
      '.ml-jc{color:#226ACC;font-size:10px}' +
      '.ml-cs-note{text-align:center;font-size:10px;color:var(--c-text-3);margin-top:4px}' +
      '.ml-cs-tbl{width:100%;max-width:400px;margin:6px auto;border-collapse:collapse;font-size:11px}' +
      '.ml-cs-tbl td{border:1px solid var(--c-border);text-align:center;padding:2px 1px}' +
      '.ml-cs-tbl tr td:first-child{background:var(--c-gray-bg);color:var(--c-gold);font-size:10px}' +
      '</style>';

    if (containerId) {
      var el = document.getElementById(containerId);
      if (el) el.innerHTML = h;
    }
    return h;
  };

  /**
   * 命理模块的输入面板(性别 + 年命)。
   * 出生时间复用页面顶部的年月日时选择器, 故此处不重复提供。
   */
  window.renderMingliInputs = function (d) {
    d = d || {};
    var gender = d.gender || '男';
    var nm = d.nianMing || '';
    var h = '<div class="ml-input-panel"><table style="width:100%;border-collapse:collapse"><tr>';
    h += '<td style="width:48px;font-size:13px;color:var(--c-text-2);text-align:right;padding-right:4px">性别</td>';
    h += '<td><select id="mlGender" class="sel-date" style="width:100%" onchange="doMingli()">';
    ['男', '女'].forEach(function (g) { h += '<option value="' + g + '"' + (g === gender ? ' selected' : '') + '>' + g + '</option>'; });
    h += '</select></td>';
    h += '<td style="width:48px;font-size:13px;color:var(--c-text-2);text-align:right;padding-right:4px">年命</td>';
    h += '<td><select id="mlNianMing" class="sel-date" style="width:100%" onchange="doMingli()">';
    h += '<option value=""' + (nm === '' ? ' selected' : '') + '>（按时支）</option>';
    for (var i = 0; i < 12; i++) h += '<option value="' + ZHI[i] + '"' + (ZHI[i] === nm ? ' selected' : '') + '>' + ZHI[i] + '</option>';
    h += '</select></td>';
    h += '</tr></table></div>';
    return h;
  };
})();
