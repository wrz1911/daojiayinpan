/*!
 * 命理奇门 (panType 6) —— 阴盘奇门 + 命理层
 *
 * 与「时盘/刻盘」的区别: 以**出生时间**排盘看命, 而非起局断事。
 *
 * 布局**参照热卜「命理奇门」(mod=mingli)**:
 *   头部表(日期/农历/节气/局/四柱/值符值使旬首空亡马星/月将年命性别)
 *   按钮行: 十二神将(按年|月|日|时) ｜ 天门地户 ｜ 长生状态
 *   盘体(九宫) + 外圈 waipan1..12(由上述按钮切换填充)
 *   八字表(十神/藏干/纳音/地势/自坐/星运空)
 *   大运表 + 流年表
 *
 * 外圈复用本项目**已有的**三个函数(山向盘在用, 已导出到 window):
 *   shen12(1..4)    十二神将, 1=年 2=月 3=日 4=时   ← 与热卜 shen12 同构
 *   tianmenDihu()   天门地户(月将加时 + 建除十二神)
 *   showState()     十二长生状态(写入宫内的 stateTian/stateDi)
 * 它们读 window._raw / window._sizhuObj / window._palaces, 故命理排盘后需设置。
 */
(function () {
  'use strict';

  var GAN = '甲乙丙丁戊己庚辛壬癸';
  var ZHI = '子丑寅卯辰巳午未申酉戌亥';

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

    // ③ 四柱 —— qimenChart 的 sizhu 是**对象**({y:{ganZhi},m:…,d:…,h:…}),
    //    与 chuanRenChart 的字符串 sizhu 不同, 勿混用。
    var gzOf = function (k) { return dec(qr.sizhu && qr.sizhu[k] && qr.sizhu[k].ganZhi); };
    var siZhu = { nian: gzOf('y'), yue: gzOf('m'), ri: gzOf('d'), shi: gzOf('h') };

    // ④ 四柱各自的旬空(命理特征: 四个而非一个)
    var kong = {
      nian: xunKongOf(siZhu.nian), yue: xunKongOf(siZhu.yue),
      ri: xunKongOf(siZhu.ri), shi: xunKongOf(siZhu.shi),
    };

    // ⑤ 供 shen12 / tianmenDihu / showState 使用(它们读这三个全局)
    window._raw = qr.raw || '';
    window._sizhuObj = qr.sizhu || null;
    var palsForState = {};
    for (var g = 1; g <= 9; g++) {
      if (g === 5) continue;
      palsForState['gong' + g] = (qr.pals && qr.pals[g]) || null;
    }
    window._palaces = palsForState;

    return {
      qr: qr, bz: bz,
      sizhu: siZhu,
      gender: gender,
      nianMing: opts.nianMing || siZhu.shi[1] || '',
      kong: kong,
      yueJiang: dec(qr.yueJiang),
      juLabel: qr.juLabel,
      /** 当前外圈显示: 'none' | 1..4(十二神将按年月日时) | 'tmdh' */
      ringKind: 'none',
    };
  };

  /** 染色: 按五行给干着色 */
  function wxSpan(ch) {
    if (!ch) return '';
    var color = (window.QM && window.QM.WX_COLOR && window.QM.WX_COLOR[ch]) || '#333';
    return '<font color="' + color + '">' + ch + '</font>';
  }

  /**
   * 切换外圈 —— 复现热卜 btn() 的行为:
   *   kind = 1..4   → 十二神将(年/月/日/时)
   *   kind = 'tmdh' → 天门地户
   *   kind = 'state'→ 十二长生(写宫内, 不动外圈)
   *   kind = 'none' → 清空外圈
   * 同一个 kind 再点一次则清空。
   */
  window.mingliRing = function (kind, data) {
    var isRing = (kind === 1 || kind === 2 || kind === 3 || kind === 4 || kind === 'tmdh');
    if (isRing && data && data.ringKind === kind) kind = 'none';   // 再点一次取消

    if (kind === 'state') {
      if (window.showState) window.showState();
      return data ? data.ringKind : 'none';
    }

    if (window.clearWaipan) { try { window.clearWaipan(); } catch (e) { if (window._logErr) window._logErr('clearWaipan', e && e.message); } }
    if (kind === 'none') return 'none';

    try {
      if (kind === 'tmdh') { if (window.tianmenDihu) window.tianmenDihu(); }
      else if (kind >= 1 && kind <= 4) { if (window.shen12) window.shen12(kind); }
    } catch (e) {
      if (window._logErr) window._logErr('mingliRing', e && e.message);
    }
    return kind;
  };

  /** 按钮行(参照热卜: 十二神将四选一 + 天门地户 + 长生) */
  function ringButtons() {
    var lab = ['年', '月', '日', '时'];
    var h = '<div class="ml-btns">';
    h += '<span class="ml-btn-hd">十二神将</span>';
    for (var i = 1; i <= 4; i++) h += '<span class="ml-btn" data-ml="' + i + '">' + lab[i - 1] + '</span>';
    h += '<span class="ml-btn-hd" style="margin-left:8px">外圈</span>';
    h += '<span class="ml-btn" data-ml="tmdh">天门地户</span>';
    h += '<span class="ml-btn-hd" style="margin-left:8px">宫内</span>';
    h += '<span class="ml-btn" data-ml="state">长生</span>';
    h += '</div>';
    return h;
  }

  /** 命理模块的输入面板(性别 + 年命)。出生时间复用页面顶部的年月日时选择器。 */
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

  /**
   * 渲染命理奇门。
   * data: mingliChart 的返回值 ｜ containerId: 传入则写入该元素
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

      // ── 外圈切换按钮(参照热卜) ──
      h += ringButtons();

      // ── 盘体 + 外圈 waipan(外圈内容由 mingliRing 填充) ──
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
        h += window.buildPaipanGrid(pals, kongGongs, (qr.ma && qr.ma.p) || 'ma2', agFn,
               { colorSpan: csFn, wrapperClass: 'ml-inner', panClass: 'ml-pan' });
      }

      // ── 八字表 ──
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
          var cg = bz.cangGan[i] || '', s = '';
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
      h += '<tr><td>旬空</td><td>' + data.kong.nian + '</td><td>' + data.kong.yue + '</td><td>' + data.kong.ri + '</td><td>' + data.kong.shi + '</td></tr>';
      h += '</table>';

      // ── 大运 + 流年 ──
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
      '.ml-btns{display:flex;flex-wrap:wrap;align-items:center;width:100%;max-width:520px;margin:8px auto;gap:4px}' +
      '.ml-btn-hd{font-size:11px;color:var(--c-text-3)}' +
      '.ml-btn{display:inline-block;padding:2px 10px;border:1px solid var(--c-border);border-radius:12px;font-size:12px;cursor:pointer;background:var(--c-gray-bg)}' +
      '.ml-btn.on{background:var(--c-theme);color:#fff;border-color:var(--c-theme)}' +
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
      '.ml-pan{width:100%;border-collapse:collapse;table-layout:fixed!important}' +
      '</style>';

    if (containerId) {
      var el = document.getElementById(containerId);
      if (el) el.innerHTML = h;
    }
    return h;
  };
})();
