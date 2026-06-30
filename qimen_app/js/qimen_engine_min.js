// 奇门遁甲排盘引擎  作者: 地天泰  微信/手机: 18626256203
// 开源依赖: tyme4ts (MIT) https://github.com/6tail/tyme4ts
var _global = typeof globalThis !== 'undefined' ? globalThis : window;
function _t() { return _global.tyme4j || window.tyme || {}; }
function qimenChart(opts) {
  var st = _t().SolarTime.fromYmdHms(opts.year, opts.month, opts.day, opts.hour, opts.minute||0, 0);
  var sch = st.getSixtyCycleHour();
  var yGz=sch.getYear(), mGz=sch.getMonth(), dGz=sch.getDay(), hGz=sch.getSixtyCycle();
  var yI=yGz.getIndex(), mI=mGz.getIndex(), dI=dGz.getIndex(), hI=hGz.getIndex();
  var hG=hGz.getHeavenStem().getIndex(), hZ=hGz.getEarthBranch().getIndex();
  var lh=st.getLunarHour(), ld=lh.getLunarDay(), lm=ld.getLunarMonth();
  var lY=lm.getLunarYear().getYear(), lMr=lm.getMonthWithLeap();
  var lM=Math.abs(lMr), lD=ld.getDay(), isLeap=lMr<0;
  var tt=st.getTerm(), ti=(tt.getIndex()%24+24)%24;  // tyme4j: 0=冬至 12=夏至
  var isY=ti>=12;  // 夏至后阴遁, 冬至后阳遁, 精确到分钟
  var ZHI=['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  // 月将 = 月支的六合 (午未合, 巳申合, ...)
  var yueZhi=(lM+1)%12;  // 农历月→地支: 正月寅(2), 二月卯(3), ..., 十一月子(0), 十二月丑(1)
  var HE=[1,0,11,10,9,8,7,6,5,4,3,2];  // 六合: 子丑 寅亥 卯戌 辰酉 巳申 午未: 子(0)→丑(1), 丑(1)→子(0), 寅(2)→亥(7), 卯(3)→戌(8), 辰(4)→酉(9), 巳(5)→申(10), 午(6)→未(11), 未(11)→午(6), 申(10)→巳(5), 酉(9)→辰(4), 戌(8)→卯(3), 亥(7)→寅(2)
  var jiang=HE[yueZhi];  // 月将地支索引
  var jz=ZHI[jiang];  // 月将地支名
  var STN=['冬至','小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪'];
  var v=lM; if(v===0)v=12;
  var ju=(yI%12+1)+v+lD+(hI%12+1); ju=ju%9; if(ju===0)ju=9;
  if(opts.customJu){ isY=opts.customJu.yinYang==='阴'; ju=opts.customJu.number; }
  var GAN6=['戊','己','庚','辛','壬','癸','丁','丙','乙'];
  var GAN=['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
  var MEN=['','休','生','伤','杜','景','死','惊','开'];
  var XING=['','蓬','任','冲','辅','英','芮','柱','心'];
  var SHEN_Y=['','符','天','地','玄','白','六','阴','蛇'];
  var SHEN_A=['','符','蛇','阴','六','白','玄','地','天'];
  var ZHUAN=[0,1,8,3,4,9,2,7,6];
  var FZHUAN=[0,1,6,3,4,6,8,7,2,5];
  var YIMA=[2,11,8,5];
  var ZHI2G=[1,8,8,3,4,4,9,2,2,7,6,6];
  // 刻盘分柱
  var pt=opts.panType||1, isKePan=pt===2;
  var mGzStr='', hCyl=hI;
  if(isKePan){
    var mg=opts.minute%10, mz=Math.floor(opts.minute/2)%12;
    mGzStr='　<font color=red>'+GAN[mg]+ZHI[mz]+'</font>';
    hCyl=mg*12+mz;
  }
  var xs=Math.floor(hCyl/10)*10;
  var xsG=GAN[xs%10], xsZ=ZHI[xs%12];
  var xk1=(xs+10)%12, xk2=(xs+11)%12;
  var maZ=YIMA[hI%4], maG=ZHI2G[maZ];
  var MP={4:'ma1',9:'ma2',2:'ma2',3:'ma3',7:'ma4',8:'ma3',1:'ma4',6:'ma4'};
  var di={}; var dgg=0, sgg=0;
  for(var i=0;i<9;i++){
    var g=isY?ju-i:ju+i;
    if(g>9)g-=9; if(g<1)g+=9;
    var gan=GAN6[i];
    if(g!==5)di[g]=gan;
    if(gan===GAN[xs/10+4])dgg=g;
    if(gan===GAN[hI%10])sgg=g;
  }
  if(sgg===0)sgg=dgg;
  var zg='';
  for(var i=0;i<9;i++){
    var g2=isY?ju-i:ju+i;
    if(g2>9)g2-=9; if(g2<1)g2+=9;
    if(g2===5){zg=GAN6[i]; break;}
  }
  if(di[2]&&zg)di[2]=di[2][0]+zg;
  var zfI=FZHUAN[dgg], zfN=zfI===5?'禽':XING[zfI];
  var zsN=MEN[FZHUAN[dgg]];
  var mg=dgg;
  if(isY)mg=dgg-(hI%10); else mg=hI%10+dgg;
  if(mg<1)mg+=9; if(mg>9)mg-=9;
  var xingM={}, tianM={};
  var vS=FZHUAN[sgg]-FZHUAN[dgg];
  for(var i=1;i<9;i++){
    var j=i-vS; if(j<1)j+=8; if(j>8)j-=8;
    var g3=ZHUAN[i];
    xingM[g3]=XING[j];
    tianM[g3]=(di[ZHUAN[j]]||'').slice(0,2);
  }
  var menM={};
  var vM=FZHUAN[mg]-FZHUAN[dgg];
  for(var i=1;i<9;i++){
    var j2=i-vM; if(j2<1)j2+=8; if(j2>8)j2-=8;
    menM[ZHUAN[i]]=MEN[j2];
  }
  var shenM={};
  var vSh=FZHUAN[sgg]-1;
  var so=isY?SHEN_Y:SHEN_A;
  for(var i=1;i<9;i++){
    var j3=i-vSh; if(j3<1)j3+=8; if(j3>8)j3-=8;
    shenM[ZHUAN[i]]=so[j3];
  }
  var agM={};
  var isFuAll=false;
  for(var g4=1;g4<10;g4++){if(g4===5)continue;if((tianM[g4]||'')[0]===(di[g4]||'')[0]){isFuAll=true;break;}}
  if(isFuAll){
    // 伏吟暗干: 对齐iqm.js的liuyi映射算法
    // liuyi=[0,4,5,6,7,8,9,3,2,1] 对应 GAN6=[戊,己,庚,辛,壬,癸,丁,丙,乙]
    var liuyi=[0,4,5,6,7,8,9,3,2,1];
    var v6=hCyl%10;
    if(v6===0) v6=liuyi[Math.floor(hCyl/10)+1]; // 甲时→旬首映射
    var j6=1; for(;j6<10;j6++) if(v6===liuyi[j6]) break;
    if(isY) v6=j6+4; else v6=j6-4; // 阴+4 阳-4
    for(var i6=1;i6<10;i6++){
      var g6;
      if(isY) g6=v6-i6+1; else g6=v6+i6-1;
      if(g6<1) g6+=9; if(g6>9) g6-=9;
      agM[i6]=GAN[liuyi[g6]];
    }
    // 二次伏吟检查
    if(agM[1]===tianM[1][0]){
      var gan2=agM[2]; // 将2宫暗干放中宫来排
      for(j6=1;j6<10;j6++) if(gan2===GAN[liuyi[j6]]) break;
      if(isY) v6=j6+4; else v6=j6-4;
      for(var i62=1;i62<10;i62++){
        var g62;
        if(isY) g62=v6-i62+1; else g62=v6+i62-1;
        if(g62<1) g62+=9; if(g62>9) g62-=9;
        agM[i62]=GAN[liuyi[g62]];
      }
    }
    // 寄干: 2宫prepend中宫干
    if(agM[2]&&agM[5]) agM[2]=agM[2]+agM[5];
    agM[5]='';
  } else {
    var vA=FZHUAN[sgg]-FZHUAN[mg];
    for(var i=1;i<9;i++){
      var j4=i+vA; if(j4<1)j4+=8; if(j4>8)j4-=8;
      agM[ZHUAN[i]]=di[ZHUAN[j4]]||'';
    }
    agM[5]='';
    // 寄干已在地盘di[2]中通过di[2][0]+zg包含, 复制时自带, 无需重复添加
  }
  var pals={};
  var XING_G={'戊':3,'己':2,'庚':8,'辛':9,'壬':4,'癸':4};
  var MU_G={'癸':2,'戊':6,'丙':6,'乙':6,'庚':8,'丁':8,'己':8,'辛':4};
  var MEN_PO={'休':[1],'生':[8,3,4],'伤':[8,3,4],'杜':[8,3,4],'景':[9,2,7,6],'死':[9,2,7,6],'惊':[9,2,7,6],'开':[9,2,7,6]};
  for(var g6=1;g6<10;g6++){
    if(g6===5){pals[g6]=null;continue;}
    var tg=(tianM[g6]||'')[0], dg1=(di[g6]||'')[0], dg2=(di[g6]||'').length>1?(di[g6]||'')[1]:'';
    var tx=false,tm=false,dx=false,dm=false,mp_=false;
    if(XING_G[tg]===g6)tg==='庚'?(tm=true):(tx=true);
    if(XING_G[dg1]===g6)dg1==='庚'?(dm=true):(dx=true);
    if(MU_G[tg]===g6)tm=true;
    if(MU_G[dg1]===g6)dm=true;
    if(dg2&&MU_G[dg2]===g6)dm=true;
    var mn=menM[g6]||'';
    if(mn&&MEN_PO[mn]&&MEN_PO[mn].indexOf(g6)>=0)mp_=true;
    pals[g6]={ shen:shenM[g6]||'', tian:tianM[g6]||'', di:di[g6]||'', xing:xingM[g6]||'', men:menM[g6]||'', anGan:agM[g6]||'', kong:g6===ZHI2G[xk1]||g6===ZHI2G[xk2], ma:g6===maG, tx:tx,tm:tm,dx:dx,dm:dm,mp:mp_ };
  }
  // 天门地户: 月将加时支, 顺时针环绕
  var tianmen={}, dihu={};
  // 12天将名(顺时针:子丑寅卯辰巳午未申酉戌亥)
  var tms=['神后子','大吉丑','功曹寅','太冲卯','天罡辰','太乙巳','胜光午','小吉未','传送申','从魁酉','河魁戌','登明亥'];
  var dhs=['建','除','满','平','定','执','破','危','成','收','开','闭'];
  // 时支→起始位置(0=子), 月将名索引=jiang
  var startPos=hZ;  // 时支=时辰地支索引(0=子)
  for(var ti_=0;ti_<12;ti_++){
    var pos=(startPos+ti_)%12;  // 从时支位顺时针
    tianmen[pos]=tms[(jiang+ti_)%12];  // 月将名依次填充
    dihu[pos]=dhs[ti_];  // 建除依次填充
  }
  // 返回纯数据 (不含HTML)
  function pad2(n){ return n<10?'0'+n:''+n; }
  var MNM=['','正月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','腊月'];
  var DNM=['','初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
  var r = {
    gongli: opts.year+'年'+opts.month+'月'+opts.day+'日'+opts.hour+'时'+pad2(opts.minute||0)+'分',
    nongli: lY+'年'+(isLeap?'闰':'')+MNM[lM%12]+DNM[lD]+'日',
    yinYang: isY?'阴':'阳', juNum: ju,
    juLabel: (isY?'阴遁':'阳遁')+ju+'局', customJu: opts.customJu||false,
    jieqi: STN[ti===0?23:ti-1]+'～'+STN[ti],
    yueJiang: jz,
    sizhu: { y:{ganZhi:yGz.getName()}, m:{ganZhi:mGz.getName()}, d:{ganZhi:dGz.getName()}, h:{ganZhi:hGz.getName()}, minute:mGzStr||null },
    xs: { gz:xsG+xsZ }, kw: { gz:ZHI[xk1]+ZHI[xk2] }, ma: { z:ZHI[maZ], g:maG, p:MP[maG]||'ma2' },
    zf: { n:'天'+zfN+'星', s:zfN, g:sgg }, zs: { n:zsN+'门', s:zsN, g:mg },
    pals: pals, agM: agM, tianmen: tianmen, dihu: dihu,
    isFuAll: isFuAll, isY: isY, ju: ju, dgg: dgg, sgg: sgg, mg: mg, hCyl: hCyl, jiang: jiang, _tmdh: opts.tmdh||false,
    raw: ''
  };
  r.raw = buildRawFromData(r);
  return r;
}

// 仅用于兼容旧路径的 raw HTML 生成
function buildRawFromData(d) {
  var p=function(n){return n<10?'0'+n:''+n;};
  var ZHI=['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  var MNM=['','正月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','腊月'];
  var DNM=['','初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
  var STN=['冬至','小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪'];
  var s='';
  s+='公历 :'+d.gongli+'<br> '; if(d.customJu) s+='<font color=#FF00FF>自选 </font>';
  s+='农历 :'+d.nongli+'<br>';
  s+='四柱: '+d.sizhu.y.ganZhi+'　'+d.sizhu.m.ganZhi+'　'+d.sizhu.d.ganZhi+'　'+d.sizhu.h.ganZhi;
  if(d.sizhu.minute&&d.sizhu.minute.gz) s+='　<font color=red>'+d.sizhu.minute.gz+'</font>';
  s+='<br>';
  s+='节气: '+d.jieqi+' 月将:'+d.yueJiang+' ';
  s+=(d.yinYang=='阴'?'阴':'阳')+'遁'+d.juNum+'局<br> 值符:'+d.zf.n+'落'+d.zf.g+'宫 值使:'+d.zs.n+'落'+d.zs.g+'宫<br>';
  s+='旬首:'+d.xs.gz+'　空亡:'+d.kw.gz+'　马星:'+d.ma.z+'<br>';
  s+='四害颜色：<font color=#6f00d2>刑</font><font color=#009100>墓</font><font color=#FF0000>迫</font><font color=#EE00EE>【刑墓】</font><font color=#000080>空◎</font> <br>';
  d._tmdh = d._tmdh || false; s+=buildGridFromData(d);
  return s;
}
function buildGridFromData(d) {
  function hlTm(s){return ['太冲卯','小吉未','从魁酉'].indexOf(s)>=0?'<font color=#4caf50><b>'+s+'</b></font>':s;}
  var p=d.pals, ag=d.agM||{}, tm=d.tianmen||{}, dh=d.dihu||{};
  function csp(ch,x,m){if(m&&x)return'<FONT color=#EE00EE>'+ch+'</FONT>';if(m)return'<FONT color=#009100>'+ch+'</FONT>';if(x)return'<FONT color=#6F00D2>'+ch+'</FONT>';return ch;}
  function tc(g){if(!p[g])return'';var t=p[g].tian||'';return csp(t[0]||'',p[g].tx,p[g].tm)+(t[1]?csp(t[1],false,false):'');}
  function dc(g){if(!p[g])return'';var dd=p[g].di||'';return csp(dd[0]||'',p[g].dx,p[g].dm)+(dd[1]?csp(dd[1],false,false):'');}
  function kd(g){return p[g]&&p[g].kong?'<font color=#000080>◎</font>':'　';}
  function ms(g){if(!p[g])return'';var m_=p[g].men||'';return p[g].mp?'<i><FONT color=#FF0000>'+m_+'</FONT></i>':m_;}
  function cl(g,cls){if(!p[g])return'<td>&nbsp;</td>';var pp=p[g];return'<td class="'+cls+'">'+(pp.shen||'')+'　'+kd(g)+'<br />'+tc(g)+'　'+(pp.xing||'')+'<br />'+dc(g)+'　'+ms(g)+'</td>';}
  var h=' <table class="gridst" cellSpacing=0>';
  if(d._tmdh){
    // 外圈按视觉布局: 子(0)底中, 顺时针→丑寅卯辰巳午未申酉戌亥
    // td: 22=子,21=丑,15=寅,10=卯,5=辰,1=巳,2=午,3=未,9=申,14=酉,19=戌,23=亥
    // 天门地户外圈: 只显示天将+建除, 不含暗干
    h+='<tr><td class="girdnone caltabwidthstsm caltabhightst"><br/></td><td class="girdnone caltabwidthst"><br/>'+(hlTm(tm[5]||''))+(dh[5]||'')+'</td><td class="girdnone caltabwidthst"><br/>'+(hlTm(tm[6]||''))+(dh[6]||'')+'</td><td class="girdnone caltabwidthst"><br/>'+(hlTm(tm[7]||''))+(dh[7]||'')+'</td><td class="girdnone caltabwidthstsm"><br/></td></tr>';
    h+='<tr><td class="girdnone caltabhightst">'+(hlTm(tm[4]||''))+(dh[4]||'')+'<br />'+(ag[4]||'')+'</td>'+cl(4,'girdleft')+cl(9,'girdleft')+cl(2,'girdright')+'<td class="girdnone">'+(hlTm(tm[8]||''))+(dh[8]||'')+'<br />'+(ag[2]||'')+'</td></tr>';
    h+='<tr><td class="girdnone caltabhightst">'+(hlTm(tm[3]||''))+(dh[3]||'')+'<br />'+(ag[3]||'')+'</td>'+cl(3,'girdleft')+'<td class="girdleft">&nbsp;</td>'+cl(7,'girdright')+'<td class="girdnone">'+(hlTm(tm[9]||''))+(dh[9]||'')+'<br />'+(ag[7]||'')+'</td></tr>';
    h+='<tr><td class="girdnone caltabhightst">'+(hlTm(tm[2]||''))+(dh[2]||'')+'<br />'+(ag[8]||'')+'</td>'+cl(8,'girdbott')+cl(1,'girdbott')+cl(6,'girdall')+'<td class="girdnone">'+(hlTm(tm[10]||''))+(dh[10]||'')+'<br />'+(ag[6]||'')+'</td></tr>';
    h+='<tr><td class="girdnone caltabhightst"><br/></td><td class="girdnone">'+(hlTm(tm[1]||''))+(dh[1]||'')+'<br/></td><td class="girdnone">'+(hlTm(tm[0]||''))+(dh[0]||'')+'<br/></td><td class="girdnone">'+(hlTm(tm[11]||''))+(dh[11]||'')+'<br/></td><td class="girdnone"><br/></td></tr>';
  } else {
    h+='<tr><td class="girdnone caltabwidthstsm caltabhightst"><br/></td><td class="girdnone caltabwidthst"><br/></td><td class="girdnone caltabwidthst"><br/>'+(ag[9]||'')+'</td><td class="girdnone caltabwidthst"><br/></td><td class="girdnone caltabwidthstsm"><br/></td></tr>';
    h+='<tr><td class="girdnone caltabhightst"><br />'+(ag[4]||'')+'</td>'+cl(4,'girdleft')+cl(9,'girdleft')+cl(2,'girdright')+'<td class="girdnone">'+(ag[2]||'')+'</td></tr>';
    h+='<tr><td class="girdnone caltabhightst"><br />'+(ag[3]||'')+'</td>'+cl(3,'girdleft')+'<td class="girdleft">&nbsp;</td>'+cl(7,'girdright')+'<td class="girdnone">'+(ag[7]||'')+'</td></tr>';
    h+='<tr><td class="girdnone caltabhightst"><br />'+(ag[8]||'')+'</td>'+cl(8,'girdbott')+cl(1,'girdbott')+cl(6,'girdall')+'<td class="girdnone">'+(ag[6]||'')+'</td></tr>';
    h+='<tr><td class="girdnone caltabhightst"><br/></td><td class="girdnone"><br/></td><td class="girdnone"><br/>'+(ag[1]||'')+'</td><td class="girdnone"><br/></td><td class="girdnone"><br/></td></tr>';
  }
  h+='</table>';
  return h;
}
window.qimenChart = qimenChart;