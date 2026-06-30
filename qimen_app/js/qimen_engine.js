// 奇门遁甲排盘引擎  作者: 地天泰  微信/手机: 18626256203
// 基于 tyme4j (MIT) 历法库  https://github.com/6tail/tyme4ts
// 替代: c.js + show.js + iqm.js + ljqm.js (约3900行 → 本文约500行)

var _global = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this);
function _t() { return _global.tyme4j || (typeof window !== 'undefined' ? window.tyme4j : null); }

// ============ 常量 ============// ============ 常量 ============
const GAN6 = ['戊','己','庚','辛','壬','癸','丁','丙','乙'];  // 六仪飞序
const GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const MEN = ['','休','生','伤','杜','景','死','惊','开'];
const XING = ['','蓬','任','冲','辅','英','芮','柱','心'];
const SHEN_Y = ['','符','天','地','玄','白','六','阴','蛇'];
const SHEN_A = ['','符','蛇','阴','六','白','玄','地','天'];
const ZHUAN = [0,1,8,3,4,9,2,7,6];
const FZHUAN = [0,1,6,3,4,6,8,7,2,5];
const YIMA = [2,11,8,5];
const ZHI2G = [1,8,8,3,4,4,9,2,2,7,6,6];
const YJ = [10,11,11,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10];
const STN = ['小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至'];
const DHS = ['建','除','满','平','定','执','破','危','成','收','开','闭'];
const TMS = ['登明亥','河魁戌','从魁酉','传送申','小吉未','胜光午','太乙巳','天罡辰','太冲卯','功曹寅','大吉丑','神后子'];
const MNM = ['','正月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','腊月'];
const DNM = ['','初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
const XING_G = {'戊':3,'己':2,'庚':8,'辛':9,'壬':4,'癸':4};
const MU_G = {'癸':2,'戊':6,'丙':6,'乙':6,'庚':8,'丁':8,'己':8,'辛':4};
const MEN_PO = {'休':[1], '生':[8,3,4], '伤':[8,3,4], '杜':[8,3,4], '景':[9,2,7,6], '死':[9,2,7,6], '惊':[9,2,7,6], '开':[9,2,7,6]};

function p(n) { return n<10?'0'+n:''+n; }

// ============ 主入口 ============
function qimenChart(opts) {
  const { year, month, day, hour, minute, panType, customJu } = opts;
  const pt = panType || 1;
  const mi = minute || 0;

  const st = _t().SolarTime.fromYmdHms(year, month, day, hour, mi, 0);
  const sch = st.getSixtyCycleHour();
  const sd = st.getSolarDay();

  const yGz=sch.getYear(), mGz=sch.getMonth(), dGz=sch.getDay(), hGz=sch.getSixtyCycle();
  const yI=yGz.getIndex(), mI=mGz.getIndex(), dI=dGz.getIndex(), hI=hGz.getIndex();
  const hG=hGz.getHeavenStem().getIndex(), hZ=hGz.getEarthBranch().getIndex();

  // 农历
  const lh=st.getLunarHour(), ld=lh.getLunarDay(), lm=ld.getLunarMonth();
  const lY=lm.getLunarYear().getYear(), lMr=lm.getMonthWithLeap();
  const lM=Math.abs(lMr), lD=ld.getDay(), isLeap=lMr<0;

  // 节气 iqm索引(0=小寒)
  const tt=sd.getTerm(), ti=(tt.getIndex()%24+24)%24, it=(ti+1)%24;
  const piv=it===0?23:it-1;
  const jiang=YJ[piv], jz=ZHI[(11-jiang+12)%12];

  // 阴阳遁 + 局数
  let isY, ju;
  if (customJu) { isY=customJu.yinYang==='阴'; ju=customJu.number; }
  else {
    isY=piv>=11 && piv<23;
    let v=lM; if(v===0)v=12;
    ju=(yI%12+1)+v+lD+(hI%12+1); ju=ju%9; if(ju===0)ju=9;
  }

  // 刻盘分柱
  let mGzObj=null, hCyl=hI;
  if (pt===2) {
    const mg=mi%10, mz=Math.floor(mi/2)%12;
    mGzObj={g:GAN[mg],z:ZHI[mz],gz:GAN[mg]+ZHI[mz],gi:mg,zi:mz};
    hCyl=mg*12+mz;
  }

  // 排盘
  const pan=arrange({isY,ju,hI:hCyl,hG,hZ,jiang,isKePan:pt===2});

  return {
    gongli:`${year}年${month}月${day}日${hour}时${p(mi)}分`,
    nongli:buildNL(lY,lM,isLeap,lD),
    yinYang:isY?'阴':'阳', juNum:ju,
    juLabel:(isY?'阴遁':'阳遁')+ju+'局',
    jieqi:STN[it], prevJieqi:STN[piv], yueJiang:jz,
    sizhu:{ y:g(yGz), m:g(mGz), d:g(dGz), h:g(hGz), minute:mGzObj },
    ...pan,
    // 兼容旧 raw 字符串
    raw: buildRaw({year,month,day,hour,mi,isY,ju,yGz,mGz,dGz,hGz,
      lY,lM,isLeap,lD,STN,it,piv,jz,pan,mGzObj,pt}),
    rawBg: null // 心盘用
  };
}

// ============ 排盘核心 ============
function arrange(ctx) {
  const {isY,ju,hI,hG,hZ,jiang,isKePan}=ctx;
  const hCyl=hI;

  // 旬首/空亡/马星
  const xs=Math.floor(hCyl/10)*10;
  const xsG=GAN[xs%10], xsZ=ZHI[xs%12];
  const xk1=(xs+10)%12, xk2=(xs+11)%12;
  const maZ=YIMA[hCyl%4], maG=ZHI2G[maZ];
  const MP={4:'ma1',9:'ma2',2:'ma2',3:'ma3',7:'ma4',8:'ma3',1:'ma4',6:'ma4'};

  // 地盘飞步
  const di={}; let dgg=0, sgg=0;
  for(let i=0;i<9;i++){
    let g=isY?ju-i:ju+i;
    if(g>9)g-=9; if(g<1)g+=9;
    const gan=GAN6[i];
    if(g!==5)di[g]=gan;
    if(gan===GAN[xs/10+4])dgg=g;
    if(gan===GAN[hCyl%10])sgg=g;
  }
  if(sgg===0)sgg=dgg;
  // 中宫寄坤
  let zg='';
  for(let i=0;i<9;i++){
    let g=isY?ju-i:ju+i;
    if(g>9)g-=9; if(g<1)g+=9;
    if(g===5){zg=GAN6[i]; break;}
  }
  if(di[2]&&zg)di[2]=di[2][0]+zg;

  // 值符/值使
  const zfI=FZHUAN[dgg], zfN=zfI===5?'禽':XING[zfI];
  const zsN=MEN[FZHUAN[dgg]];
  let mg=dgg;
  if(isY)mg=dgg-(hCyl%10);
  else mg=hCyl%10+dgg;
  if(mg<1)mg+=9; if(mg>9)mg-=9;

  // 星盘+天盘
  const xingM={}, tianM={};
  const vS=FZHUAN[sgg]-FZHUAN[dgg];
  for(let i=1;i<9;i++){
    let j=i-vS; if(j<1)j+=8; if(j>8)j-=8;
    const g=ZHUAN[i];
    xingM[g]=XING[j];
    tianM[g]=(di[ZHUAN[j]]||'').slice(0,2);
  }

  // 门盘
  const menM={};
  const vM=FZHUAN[mg]-FZHUAN[dgg];
  for(let i=1;i<9;i++){
    let j=i-vM; if(j<1)j+=8; if(j>8)j-=8;
    menM[ZHUAN[i]]=MEN[j];
  }

  // 神盘
  const shenM={};
  const vSh=FZHUAN[sgg]-1;
  const so=isY?SHEN_Y:SHEN_A;
  for(let i=1;i<9;i++){
    let j=i-vSh; if(j<1)j+=8; if(j>8)j-=8;
    shenM[ZHUAN[i]]=so[j];
  }

  // 暗干
  const agM={};
  const isFu=tianM[1]&&tianM[1][0]===(di[1]||'')[0];
  let isFuAll=false;
  for(let g=1;g<10;g++){if(g===5)continue;if((tianM[g]||'')[0]===(di[g]||'')[0]){isFuAll=true;break;}}
  if(isFuAll){
    const si=GAN.indexOf(GAN[hG]);
    for(let i=0;i<9;i++){
      let g=isY?5-i:5+i;
      if(g>9)g-=9; if(g<1)g+=9;
      if(g!==5)agM[g]=GAN6[(si+i)%9];
    }
    if(agM[2]&&agM[5])agM[2]+=agM[5];
    agM[5]='';
  } else {
    const vA=FZHUAN[sgg]-FZHUAN[mg];
    for(let i=1;i<9;i++){
      let j=i+vA; if(j<1)j+=8; if(j>8)j-=8;
      agM[ZHUAN[i]]=(di[ZHUAN[j]]||'')[0];
    }
    agM[5]='';
    if(agM[2]&&zg)agM[2]=(agM[2]||'')+zg;
  }

  // 颜色 + 宫位对象
  const pals={};
  for(let g=1;g<10;g++){
    if(g===5){pals[g]=null;continue;}
    const tg=(tianM[g]||'')[0], dg1=(di[g]||'')[0], dg2=(di[g]||'').length>1?(di[g]||'')[1]:'';
    let tx=false,tm=false,dx=false,dm=false,mp_=false;
    if(XING_G[tg]===g)tg==='庚'?(tm=true):(tx=true);
    if(XING_G[dg1]===g)dg1==='庚'?(dm=true):(dx=true);
    if(MU_G[tg]===g)tm=true;
    if(MU_G[dg1]===g)dm=true;
    if(dg2&&MU_G[dg2]===g)dm=true;
    const mn=menM[g]||'';
    if(mn&&MEN_PO[mn]&&MEN_PO[mn].includes(g))mp_=true;
    pals[g]={
      shen:shenM[g]||'', tian:tianM[g]||'', di:di[g]||'',
      xing:xingM[g]||'', men:menM[g]||'', anGan:agM[g]||'',
      kong:g===ZHI2G[xk1]||g===ZHI2G[xk2],
      ma:g===maG, tx,tm,dx,dm,mp:mp_
    };
  }

  return {
    xs:{gz:xsG+xsZ,g:xsG,z:xsZ,idx:xs},
    zf:{n:'天'+zfN+'星',s:zfN,g:dgg},
    zs:{n:zsN+'门',s:zsN,g:mg},
    kw:{gz:ZHI[xk1]+ZHI[xk2],gs:[ZHI2G[xk1],ZHI2G[xk2]]},
    ma:{z:ZHI[maZ],g:maG,p:MP[maG]||'ma2'},
    pals,agM,isFuAll,isY,ju,dgg,sgg,mg,hCyl,jiang
  };
}

// ============ 工具函数 ============
function g(gz){return{ganZhi:gz.getName(),gan:gz.getHeavenStem().getName(),zhi:gz.getEarthBranch().getName()};}
function buildNL(y,m,leap,d){
  let s=y+'年'; if(leap)s+='闰';
  s+=(MNM[m]||m+'月')+(DNM[d]||d+'日');
  return s;
}

// ============ 兼容旧 raw 字符串 ============
function buildRaw(ctx){
  const {year,month,day,hour,mi,isY,ju,yGz,mGz,dGz,hGz,
    lY,lM,isLeap,lD,STN,it,piv,jz,pan,mGzObj,pt}=ctx;

  let s='';
  s+='公历 :'+year+'年'+month+'月'+day+'日'+hour+'时'+p(mi)+'分<br> ';
  s+='农历 :'+lY+'年'+(isLeap?'闰':'')+MNM[lM%12]+DNM[lD]+'日<br>';
  s+='四柱: <font color=#000000><b>'+yGz.getName()+'　'+mGz.getName()+'　'+dGz.getName()+'　'+hGz.getName();
  if(mGzObj)s+='　<font color=red>'+mGzObj.gz+'</font>';
  s+='</b></font><br>';
  s+='节气: '+STN[piv]+'～'+STN[it]+' 月将:'+jz+' ';

  s+=isY+'遁'+ju+'局<br> 值符:天'+pan.zf.s+'星落'+pan.sgg+'宫 值使:'+pan.zs.s+'门落'+pan.mg+'宫<br>';
  s+='旬首:'+pan.xs.gz+'　空亡:<font color=#000080>'+pan.kw.gz+'</font>　马星:<font color=#000080>'+pan.ma.z+'</font><br>';
  s+='四害颜色：<font color=#6f00d2>刑</font><font color=#009100>墓</font><font color=#FF0000>迫</font><font color=#EE00EE>【刑墓】</font><font color=#000080>空◎</font> <br>';
  s+=buildGrid(pan);
  return s;
}

// 生成与旧 paipan 完全兼容的 5x5 gridst 表格
function buildGrid(pan){
  const p=pan.pals, ag=pan.agM||{};
  function cspan(ch,x,m){
    if(m&&x)return '<FONT color=#EE00EE>'+ch+'</FONT>';
    if(m)return '<FONT color=#009100>'+ch+'</FONT>';
    if(x)return '<FONT color=#6F00D2>'+ch+'</FONT>';
    return ch;
  }
  function tcol(g){
    if(!p[g])return'';
    const t=p[g].tian||'';
    let s=cspan(t[0]||'',p[g].tx,p[g].tm);
    if(t[1])s+=cspan(t[1],false,false);
    return s;
  }
  function dcol(g){
    if(!p[g])return'';
    const d=p[g].di||'';
    let s=cspan(d[0]||'',p[g].dx,p[g].dm);
    if(d[1])s+=cspan(d[1],false,false);
    return s;
  }
  function kdot(g){return p[g]&&p[g].kong?'<font color=#000080>◎</font>':'　';}
  function mspan(g){
    if(!p[g])return'';
    const m=p[g].men||'';
    return p[g].mp?'<i><FONT color=#FF0000>'+m+'</FONT></i>':m;
  }
  function cell(g,cls){
    if(!p[g])return'<td>&nbsp;</td>';
    cls=cls||'girdleft';
    return '<td class="'+cls+'">'+(p[g].shen||'')+'　'+kdot(g)+'<br />'+tcol(g)+'　'+(p[g].xing||'')+'<br />'+dcol(g)+'　'+mspan(g)+'</td>';
  }
  let h=' <table class="gridst" cellSpacing=0>';
  // Row 0
  h+='<tr><td class="girdnone caltabwidthstsm caltabhightst"><br/></td><td class="girdnone caltabwidthst"><br/></td><td class="girdnone caltabwidthst"><br/>'+(ag[9]||'')+'</td><td class="girdnone caltabwidthst"><br/></td><td class="girdnone caltabwidthstsm"><br/></td></tr>';
  // Row 1: 4 9 2
  h+='<tr><td class="girdnone caltabhightst"><br />'+(ag[4]||'')+'</td>'+cell(4)+cell(9)+cell(2,'girdright')+'<td class="girdnone">'+(ag[2]||'')+'</td></tr>';
  // Row 2: 3 5 7
  h+='<tr><td class="girdnone caltabhightst"><br />'+(ag[3]||'')+'</td>'+cell(3)+'<td class="girdleft">&nbsp;</td>'+cell(7,'girdright')+'<td class="girdnone">'+(ag[7]||'')+'</td></tr>';
  // Row 3: 8 1 6
  h+='<tr><td class="girdnone caltabhightst"><br />'+(ag[8]||'')+'</td>'+cell(8,'girdbott')+cell(1,'girdbott')+cell(6,'girdall')+'<td class="girdnone">'+(ag[6]||'')+'</td></tr>';
  // Row 4
  h+='<tr><td class="girdnone caltabhightst"><br/></td><td class="girdnone"><br/></td><td class="girdnone"><br/>'+(ag[1]||'')+'</td><td class="girdnone"><br/></td><td class="girdnone"><br/></td></tr>';
  h+='</table>';
  return h;
}


if (typeof window !== "undefined") window.qimenChart = qimenChart;
if (typeof globalThis !== "undefined") globalThis.qimenChart = qimenChart;
