// 奇门遁甲排盘引擎  作者: 地天泰  微信/手机: 18626256203
// 项目地址: https://github.com/wrz1911/daojiayinpan
// 开源依赖: tyme4ts (MIT) https://github.com/6tail/tyme4ts
// 开源依赖: Tauri (MIT) https://github.com/tauri-apps/tauri
(function(){
// ============ DOM初始化: 填充年月日时分下拉选择器 ============
let selY = document.getElementById('selYear');
let selM = document.getElementById('selMonth');
let selD = document.getElementById('selDay');
let selH = document.getElementById('selHour');
let selI = document.getElementById('selMin');

let tip = document.getElementById('tip');
let now = new Date();
for(let y = 1950; y <= 2050; y++) selY.appendChild(new Option(y, y));
for(let m = 1; m <= 12; m++) selM.appendChild(new Option(m, m));
for(let d = 1; d <= 31; d++) selD.appendChild(new Option(d, d));
for(let h = 0; h <= 23; h++) selH.appendChild(new Option(String(h).padStart(2,'0'), h));
for(let mi = 0; mi <= 59; mi++) selI.appendChild(new Option(String(mi).padStart(2,'0'), mi));

function adjDays() {
  let y = parseInt(selY.value) || 2026, m = parseInt(selM.value) || 1;
  let maxD = new Date(y, m, 0).getDate(), cur = parseInt(selD.value) || 1;
  selD.innerHTML = '';
  for(let d = 1; d <= maxD; d++) selD.appendChild(new Option(d, d));
  selD.value = Math.min(cur, maxD);
}

let Y=now.getFullYear(), M=now.getMonth()+1, D=now.getDate(), hr=now.getHours(), mn=now.getMinutes();
selY.value = Y; selM.value = M; selD.value = D; selH.value = hr; selI.value = mn;

// 排盘类型: 1=时盘 2=刻盘 3=心盘 4=山向 5=穿壬
let panType = 1;
let _saveMode = 'shi';
let _xjuDegSaved='',_xjuYearSaved='0';
let _expectedPals=[];
const STORAGE_KEY = 'qimen_saved';
const STORAGE_FILE = 'backups.json';
const STORAGE_DIR = 'qimen';
// 共享常量: 地支→宫位, 马星位置, 空亡序号, 入墓/击刑规则
const ZHI2G = {'子':1,'丑':8,'寅':8,'卯':3,'辰':4,'巳':4,'午':9,'未':2,'申':2,'酉':7,'戌':6,'亥':6};
const MA_POS = {4:'ma1',9:'ma2',2:'ma2',3:'ma3',7:'ma4',8:'ma3',1:'ma4',6:'ma4'};
const KONG_ID = {4:4,9:5,2:6,3:3,7:7,8:2,1:1,6:8};
const MU_RULES = {2:['癸'],6:['戊','丙','乙'],8:['庚','丁','己'],4:['辛','壬']};
const XING_RULES = {3:['戊'],2:['己'],8:['庚'],9:['辛'],4:['壬','癸']};
const XM_RULES = {8:['庚'],4:['壬']};

setPanType(1);
// 绑定模式切换和日期选择器: 用程序化事件确保Tauri兼容
document.querySelectorAll('input[name="panType"]').forEach(r => {
  r.onclick = function() { let t = parseInt(this.value); setPanType(t); doPan(); };
});
[selY, selM, selH, selI].forEach(s => { if (s) s.onchange = doPan; });
if (selM) selM.onchange = function() { adjDays(); doPan(); };
if (selD) selD.onchange = doPan;
// 山向输入绑定
let sxYear=document.getElementById('selShanXiangYear'), sxDeg=document.getElementById('selShanXiangDeg');
if (sxYear) sxYear.onchange = doPan;
if (sxDeg) { sxDeg.onchange = function() { let v=parseInt(this.value); if(isNaN(v)||v<0) this.value=0; else if(v>359) this.value=359; doPan(); }; }
// 自选局绑定
(function(){ let zxj=document.getElementById('selZxj'); if(zxj) zxj.onchange = onZxjChange; })();
// 自动排盘: 用setTimeout包裹rAF避免Tauri webview在IIFE完成前触发rAF导致TDZ
let _iifeReady = false;
requestAnimationFrame(() =>{ requestAnimationFrame(() =>{ if(_iifeReady) doPan(); else setTimeout(()=>doPan(),50); }); });

// === 山向奇门: 局数用24山角度查表公式 ===
function getJu(deg){
  let duu=Math.floor(((deg%360+360)%360)/5),du=Math.floor(duu/3);
  let _s=[-7,-2,-1,-9,-7,-6,-5,-6,-5,4,1,2,3,8,9,1,3,4,5,4,5,-6,-9,-8][du];
  let _tJ=_s<0?_s+9:_s+8;
  let ju=_tJ<9?9-_tJ:_tJ-8, vv=duu%3;
  if(_tJ<9)ju+=vv*3;else ju+=9-vv*3;
  if(ju>9)ju-=9;return ju;
}
function getIsYin(deg){
  duu=Math.floor(((deg%360+360)%360)/5),du=Math.floor(duu/3);
  _s=[-7,-2,-1,-9,-7,-6,-5,-6,-5,4,1,2,3,8,9,1,3,4,5,4,5,-6,-9,-8][du];
  return (_s<0?_s+9:_s+8)<9;
}
let SHAN_XIANG_DATA = (function(){
  let SX_NAMES = ['丁山癸向','未山丑向','坤山艮向','申山寅向','庚山甲向','酉山卯向','辛山乙向','戌山辰向','乾山巽向','亥山巳向','壬山丙向','子山午向','癸山丁向','丑山未向','艮山坤向','寅山申向','甲山庚向','卯山酉向','乙山辛向','辰山戌向','巽山乾向','巳山亥向','丙山壬向','午山子向'];
  let HUANGQUAN = [[150,194,'辰'],[15,59,'卯'],[240,284,'申'],[285,329,'酉'],[105,149,'午'],[60,104,'巳'],[195,239,'寅'],[330,359,'亥'],[0,14,'亥']];
  let GAN10=['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'],ZHI12=['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  let SGX_OFF={'甲':0,'己':0,'乙':2,'庚':2,'丙':4,'辛':4,'丁':6,'壬':6,'戊':8,'癸':8};
  function di(d){return Math.floor(((d%360+360)%360)/15);}
  return {
    getJu:getJu,
    getName(d){return SX_NAMES[di(d)];},
    getHuangQuan(d){d=(d%360+360)%360;for(let i=0;i<HUANGQUAN.length;i++){if(d>=HUANGQUAN[i][0]&&d<=HUANGQUAN[i][1])return HUANGQUAN[i][2];}return'亥';},
    getShiZhu(deg,yg){let zi=Math.floor(((deg%360+360)%360)/30);let z=ZHI12[zi+1>11?zi+1-12:zi+1];let zo=SGX_OFF[yg]||0;let zn=ZHI12.indexOf(z)+1;return GAN10[(zo+zn-1)%10]+z;}
  };
})();

// 黄泉煞: 根据向度查找黄泉地支, 计算煞气所在宫位
function getHuangQuanFull(deg,year){
  let du=Math.floor(((deg%360+360)%360)/15);
  let cY=(year-1864)%60;
  let hG_y=cY%10;if(hG_y>4)hG_y-=5;
  let T=[11,3,3,3,5,5,5,6,6,6,4,4,4,2,2,2,8,8,8,9,9,9,11,11];
  let XZ=[1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,0,0];
  let hCyl=hG_y*12+XZ[du];
  let jiang=(13-cY%12)%12;
  let v=jiang-hCyl%12;
  let Z2G=[1,8,8,3,4,4,9,2,2,7,6,6]; // standard zhi2gong
  return ZHI_LIST[T[du]]+Z2G[(T[du]-v+12)%12];
}
// 山向年份下拉初始化
(function initSXYear(){
  let sy=document.getElementById('selShanXiangYear');
  if(!sy)return;let cy=new Date().getFullYear();
  for(let yi=1900;yi<=2100;yi++)sy.appendChild(new Option(yi,yi));
  sy.value=cy;
})();

// === 心盘存储：每宫当前符号 + 背景数据 ===
let _xpData = {};
let _xpManual = {}; // 记录哪些宫是用户手动编辑的
let _xpBgSizhu = '';      // 背景四柱
let _xpBgNongli = '';     // 背景农历
let _xpBgKongWang = '';   // 背景空亡
let _xpBgMaXing = '';     // 背景马星
let _xpBgJu = '';         // 背景局数
let _xpBgXunShou = '';    // 背景旬首
let _xpBgPalaces = {};    // 背景完整宫位数据
let _xpErrors = [];       // 错误/调试信息收集
let _xpOpLog = [];        // 完整操作日志
let _xpOpSeq = 0;         // 操作序号
let _xpCalcJu = '';       // 用户推算的局数
let _xpBgIsYin = true;    // 背景阴阳遁
(function initXpData() {
  [1,2,3,4,6,7,8,9].forEach(g => {
    _xpData[g] = {shen:'', tian:'', di:'', xing:'', men:'', ma:false, kong:false};
    _xpManual[g] = false;
  });
})();
function clearXinpan() {
  _xpOpLog = []; _xpOpSeq = 0;
  _xpOpLog.push('[1] 心盘重置');
  [1,2,3,4,6,7,8,9].forEach(g => {
    _xpData[g] = {shen:'', tian:'', di:'', xing:'', men:'', ma:false, kong:false};
    _xpManual[g] = false;
  });
  renderXinpan(true);
}
function setPanType(t) {
  panType = t;
  _saveMode = t===1?'shi':t===2?'ke':t===3?'xin':t===4?'shanxiang':'chuanren';
  _renderBottomBar();
  let sxIn=document.getElementById('shanxiangInputs');
  if(sxIn)sxIn.style.display=(t===4)?'flex':'none';
  let crIn=document.getElementById('crInputs');
  if(crIn)crIn.style.display=(t===5)?'block':'none';
  let zxjRow=document.getElementById('zxjRow');
  if(zxjRow){let hide=(t===3||t===4||t===5);zxjRow.style.display=hide?'none':'';if(!hide){let zs=document.getElementById('zxjSpan');if(zs)zs.style.display='';}}
  let tr=document.getElementById('timeRow');
  if(tr)tr.style.display=(t===4)?'none':'flex';
  document.body.className = document.body.className.replace(/mode-\w+/g,'');
  document.body.classList.add(t===2?'mode-ke':t===3?'mode-xin':'mode-shi');
  let isXin = (t === 3);
  document.getElementById('selGroup').style.display = '';
  if (isXin) {
    _xpBgSizhu = ''; _xpBgNongli = ''; _xpBgPalaces = {}; _xpBgKongWang = ''; _xpBgMaXing = ''; _xpBgJu = ''; _xpBgXunShou = ''; _xpCalcJu = '';
    // 计算背景参考(四柱/马星/空亡/局数), 但网格留空等用户编辑
    doPan();
  }
}

// 自选局: 读取selZxj下拉值, 构建customJu参数初始化
let selZxj = document.getElementById('selZxj');
let ZXJ_NAMES = ['阴9','阴8','阴7','阴6','阴5','阴4','阴3','阴2','阴1','阳1','阳2','阳3','阳4','阳5','阳6','阳7','阳8','阳9'];
selZxj.appendChild(new Option('自动', 0));
for(let zi = 1; zi <= 18; zi++) {
  selZxj.appendChild(new Option(ZXJ_NAMES[zi-1], zi));
}
function onZxjChange() {
  v = parseInt(selZxj.value);
  let lbl = document.getElementById('zxjLabel');
  if (lbl) { lbl.innerHTML = (v === 0) ? '' : '已选: '+ZXJ_NAMES[v-1]; }
  doPan();
}

function setNow() {
  let n = new Date();
  Y=n.getFullYear(); M=n.getMonth()+1; D=n.getDate(); hr=n.getHours(); mn=n.getMinutes();
  selY.value = Y; selM.value = M; adjDays(); selD.value = D; selH.value = hr; selI.value = mn;
}

// ============ SHEN/XING/MEN映射表: 简写↔全名互转 ============
// HTML解析时使用: 简写(符/蓬/休) → 全名(值符/天蓬/休门)
let SHEN = {'符':'值符','蛇':'螣蛇','阴':'太阴','六':'六合','白':'白虎','玄':'玄武','地':'九地','天':'九天'};
let XING = {'蓬':'天蓬','任':'天任','冲':'天冲','辅':'天辅','英':'天英','芮':'天芮','柱':'天柱','心':'天心'};
let MEN = {'休':'休门','生':'生门','伤':'伤门','杜':'杜门','景':'景门','死':'死门','惊':'惊门','开':'开门'};
// 宫格渲染时使用: 全名(值符/天蓬/休门) → 简写(符/蓬/休)
let SHEN_ABBR = {}; for(let k in SHEN) SHEN_ABBR[SHEN[k]] = k;
let XING_ABBR = {}; for(let k in XING) XING_ABBR[XING[k]] = k;
let MEN_ABBR = {}; for(let k in MEN) MEN_ABBR[MEN[k]] = k;
window.SHEN_ABBR = SHEN_ABBR; window.XING_ABBR = XING_ABBR; window.MEN_ABBR = MEN_ABBR;
window._SHEN_ABBR = SHEN_ABBR; window._XING_ABBR = XING_ABBR; window._MEN_ABBR = MEN_ABBR;
// 全局颜色标记: 入墓(棕)/击刑(紫)/门迫(红)/刑+墓(蓝)
window._colorSpan = (val, isXing, isMu, isPo, isKong) => {
  if (!val) return '';
  if (isPo) return '<font color="red">'+val+'</font>';
  if (isXing && isMu) return '<font color="#009cef">'+val+'</font>';
  if (isXing) return '<font color="#b745ce">'+val+'</font>';
  if (isMu) return '<font color="#ca610e">'+val+'</font>';
  if (isKong) return '<span style="color:#999">'+val+'</span>';
  return val;
};

// 十天干与十二地支列表, 用于干支转换与查找
let GAN_LIST = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
let ZHI_LIST = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
let GAN10 = GAN_LIST, ZHI12 = ZHI_LIST;

// ============ 主排盘: doPan统一入口, 分发到各模式 ============
// === 山向模式: 24山向度→局数→全盘渲染 ===
function renderShanXiangPan2(deg,name,ju,isYin,hq,shiZhu,sxData){
  try{
  let pals=sxData.palaces, palaces={};
  for(let g=1;g<=9;g++){if(g===5)continue;let p=pals[g];
    palaces['gong'+g]={shen:p.shen||'',tian:(p.tian||'')+(p.tian2||''),di:(p.di||'')+(p.di2||''),xing:p.xing||'',men:p.men||'',anGan:'',isMenPo:false};
  }
  recalcColors(palaces);
  // 马星: 时支查YiMa表→宫位→外圈位置标记
  let MA_POS={4:'ma1',9:'ma2',2:'ma2',3:'ma3',7:'ma4',8:'ma3',1:'ma4',6:'ma4'};
  let ZHI2GONG2=[1,8,8,3,4,4,9,2,2,7,6,6];
  let maIdx=ZHI_LIST.indexOf(sxData.maXing||'');
  let maGong=maIdx>=0?ZHI2GONG2[maIdx]:0;
  let maPosId=MA_POS[maGong]||'';
  // 空亡: 旬首→空亡地支→对应宫位标记◎
  // ZHI2G now uses shared constant at top
  let kongGongs={};let kw=sxData.kongWang||'';if(kw.length>=2){kongGongs[ZHI2G[kw[0]]]=true;kongGongs[ZHI2G[kw[1]]]=true;}
  // 阴干: 独立重算暗干排列, 不依赖doPan时干/旬首/值使落宫
  let shiZhi=shiZhu.split(' ')[1];let shiG=shiZhi?shiZhi[0]:'';
  if(shiG==='甲'){let XM={'子':'戊','戌':'己','申':'庚','午':'辛','辰':'壬','寅':'癸'};shiG=XM[shiZhi[1]]||'';}
  // === 用ShanJu重算本副盘的ju/局 (与toggleXiangJu一致) ===
  let _duu=Math.floor(((deg%360+360)%360)/5),_du=Math.floor(_duu/3);
  let _tShan=[-7,-2,-1,-9,-7,-6,-5,-6,-5,4,1,2,3,8,9,1,3,4,5,4,5,-6,-9,-8][_du];
  let _tJ=_tShan<0?_tShan+9:_tShan+8;
  let _ju2=_tJ<9?9-_tJ:_tJ-8,_yy2=_tJ<9?'阴':'阳',_vv2=_duu%3;
  if(_yy2=='阴')_ju2+=_vv2*3;else _ju2+=9-_vv2*3;if(_ju2>9)_ju2-=9;
  // === 重算hCyl ===
  let sxYearEl2=document.getElementById('selShanXiangYear'),sxY2=sxYearEl2?sxYearEl2.value:new Date().getFullYear();
  let _cY2=(sxY2-1864)%60;let _hG2=_cY2%10;if(_hG2>4)_hG2-=5;
  let _xz2=[1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,0,0];
  let _hCyl2=_hG2*12+_xz2[_du];
  // === 重算地盘 (24山角度→局数→六仪飞步) ===
  let GAN9='戊己庚辛壬癸丁丙乙',GAN10='甲乙丙丁戊己庚辛壬癸';
  let _di2={},_dgg2=0,_sgg2=0;
  let _dg=Math.floor(_hCyl2/10)+4;
  for(let i=0;i<9;i++){
    let g=_yy2=='阴'?_ju2-i:_ju2+i;if(g>9)g-=9;if(g<1)g+=9;
    _di2[g]=GAN9[i];if(GAN10.indexOf(GAN9[i])===_dg)_dgg2=g;if(GAN9[i]===GAN10[_hCyl2%10])_sgg2=g;
  }
  if(!_sgg2)_sgg2=_dgg2;
  if(_di2[5]&&_di2[2])_di2[2]=_di2[2]+_di2[5];
  let _mg2=_yy2=='阳'?_hCyl2%10+_dgg2:_dgg2-(_hCyl2%10);
  if(_mg2<1)_mg2+=9;if(_mg2>9)_mg2-=9;
  // === 天盘 (用于伏吟检查) ===
  let _fz2=[0,1,6,3,4,6,8,7,2,5],_zz2=[0,1,8,3,4,9,2,7,6];
  let _tg2=Array(10).fill('');
  for(let i=1;i<9;i++){let j=i-(_fz2[_sgg2]-_fz2[_dgg2]);if(j<1)j+=8;if(j>8)j-=8;_tg2[_zz2[i]]=_di2[_zz2[j]]||'';}
  // === 暗干 ===
  let _v2=_fz2[_sgg2]-_fz2[_mg2];
  let angan=Array(10).fill('');
  for(let i=1;i<9;i++){let j=i+_v2;if(j<1)j+=8;if(j>8)j-=8;angan[_zz2[i]]=_di2[_zz2[j]]||'';}angan[5]='';
  if(angan[1]===_tg2[1]&&angan[1]===_di2[1]){
    let LQ2=[0,4,5,6,7,8,9,3,2,1];
    let v2;(_hCyl2%10===0)?v2=LQ2[Math.floor(_hCyl2/10)+1]:v2=_hCyl2%10;
    let jj;for(jj=1;jj<10;jj++)if(v2===LQ2[jj])break;
    if(_yy2=='阳')v2=jj-4;else v2=jj+4;
    for(let i=1;i<10;i++){let gg;if(_yy2=='阳')gg=v2+i-1;else gg=v2-i+1;if(gg<1)gg+=9;if(gg>9)gg-=9;angan[i]=GAN10[LQ2[gg]];}
    if(angan[1]===_tg2[1]){let gn=angan[2].slice(0,1);for(jj=1;jj<10;jj++)if(gn===GAN10[LQ2[jj]])break;if(_yy2=='阳')v2=jj-4;else v2=jj+4;for(let i=1;i<10;i++){let gg;if(_yy2=='阳')gg=v2+i-1;else gg=v2-i+1;if(gg<1)gg+=9;if(gg>9)gg-=9;angan[i]=GAN10[LQ2[gg]];}}
    angan[2]=(angan[2]||'').slice(0,1)+(angan[5]||'').slice(0,1);angan[5]='';
  }
  // 将重算后的暗干应用到各宫palaces对象
  for(let g=1;g<=9;g++){if(g===5)continue;palaces['gong'+g].anGan=angan[g]||palaces['gong'+g].di||'';}

  if(!window._anGanColor){window._anGanColor=(gs,gong)=>{if(!gs)return'';let muR={2:['癸'],6:['戊','丙','乙'],8:['庚','丁','己'],4:['辛','壬']};let xingR={3:['戊'],2:['己'],8:['庚'],9:['辛'],4:['壬','癸']};let r='';for(let ai=0;ai<gs.length;ai++){let ch=gs[ai];let isX=xingR[gong]&&xingR[gong].indexOf(ch)>=0;let isM=muR[gong]&&muR[gong].indexOf(ch)>=0;if(isX&&isM)r+='<font color="#009cef">'+ch+'</font>';else if(isX)r+='<font color="#b745ce">'+ch+'</font>';else if(isM)r+='<font color="#ca610e">'+ch+'</font>';else r+=ch;}return r;};}
  let agColor= g => {let ag=palaces['gong'+g]?palaces['gong'+g].anGan:'';return ag?window._anGanColor(ag,g):'';};
  let colorSpan=window._colorSpan|| (v => {return v||'';});
  let gridHTML=buildPaipanGrid(palaces,kongGongs,maPosId,agColor,{colorSpan:colorSpan});
  let juLabel=(isYin?'阴遁':'阳遁')+ju+'局';
  let degStart=Math.floor(deg/5)*5,degEnd=degStart+4;
  let shiZhuParts=shiZhu.split(' ');
  let sxYearEl=document.getElementById('selShanXiangYear'),sxY=sxYearEl?sxYearEl.value:new Date().getFullYear();
  let html='<style>.xj-head #tdTitle td{color:#dead68}.xj-head #itemTitle{color:#dead68;line-height:30px}.xj-head #dTitle{width:16%;color:#dead68}</style>'+
    '<div id="panHead"><TABLE class="pan xj-head" id="headTable">'+
    '<TR><TD id="itemTitle">山向</TD><TD colspan="3">'+name+' '+degStart+'～'+degEnd+'°</TD><TD>'+sxY+'年</TD></TR>'+
    '<TR><TD id="dTitle">干支</TD><TD class="sizhu">'+shiZhuParts[0]+'</TD><TD class="sizhu" style="color:#c00000;font-weight:bold">'+shiZhuParts[1]+'</TD><TD>黄泉<b>'+hq+'</b></TD><TD>'+juLabel+'</TD></TR>'+
    '<TR id="tdTitle"><TD>旬首</TD><TD>值符</TD><TD>值使</TD><TD>空亡</TD><TD>马星</TD></TR>'+
    '<TR><TD>'+(sxData.xunShou||'—')+'</TD><TD>天'+sxData.zfStar+'</TD><TD>'+sxData.zsMen+'门</TD><TD>'+(sxData.kongWang||'—')+'</TD><TD>'+(sxData.maXing||'—')+'</TD></TR>'+
    '</TABLE></div>'+gridHTML+
    '<TABLE id="btnTable1"><TR>'+
    '<TD><div class="btn" id="btnXiangJu" onclick="toggleXiangJu()">向角度选局</div></TD>'+
    '</TR></TABLE>'+
    '<div id="yixinghuandouDIV"></div>';
  document.getElementById('panWrap').innerHTML=html;
  // 重新绑定宫格点击事件(WebView中比inline onclick更可靠)
  let xjBtn=document.getElementById('btnXiangJu');
  if(xjBtn){xjBtn.onclick = () =>{try{toggleXiangJu();}catch(e){tip.style.display='block';tip.innerHTML='<span style=color:red>选局错误:'+e.message+'</span>';}};}
  let xjDeg=document.getElementById('xjuDeg');if(xjDeg)xjDeg.blur();
  document.getElementById('result').style.display='block';
  window._palaces=palaces;
  _renderBottomBar();
  addColorStyles();setTimeout(_bindActionButtons,50);setTimeout(fixYinGanAlign,50);
  }catch(e){tip.style.display='block';tip.innerHTML='<span style=color:red>山向错误:'+e.message+'</span>';}
}

function doNewPan(zxjus) { let o={year:Y,month:M,day:D,hour:hr,minute:mn,panType:panType}; if(zxjus){let i=parseInt(selZxj.value)||0;if(i>0){let t=i-1;o.customJu=t<9?{yinYang:"阴",number:9-t}:{yinYang:"阳",number:t-8};}} return window.qimenChart(o); }
function doPan() {
  // 从DOM下拉框读取用户选择的年月日时分
  Y = parseInt(selY.value) || now.getFullYear();
  M = parseInt(selM.value) || 6;
  D = parseInt(selD.value) || 27;
  hr = parseInt(selH.value) || 0;
  mn = parseInt(selI.value) || 0;


        // 山向模式: 24山角度→局数/阴阳/黄泉→地盘星门神全算法
        if (panType === 4) {
          try{
          _xjuDegSaved='';let sxDeg=parseInt(document.getElementById('selShanXiangDeg').value)||0;
          sxDeg=((sxDeg%360)+360)%360;
          let sxYear=parseInt(document.getElementById('selShanXiangYear').value)||Y;
          let sxJu=getJu(sxDeg);
          let sxIsYin=getIsYin(sxDeg);
          let sxHq=getHuangQuanFull(sxDeg,sxYear);
          let sxName=SHAN_XIANG_DATA.getName(sxDeg);
          document.getElementById('shanXiangLabel').innerHTML=sxName+' '+(sxIsYin?'阴遁':'阳遁')+sxJu+'局';
          let sxYearGan=GAN_LIST[(sxYear-4)%10];let sxYearZhi=ZHI_LIST[(sxYear-4)%12];
          let sxYearGZ=sxYearGan+sxYearZhi;
          let zhiIdx=Math.floor(((sxDeg%360+360)%360)/30);
          let sxZhi=['丑','寅','卯','辰','巳','午','未','申','酉','戌','亥','子'][zhiIdx];
          let sxXs=ZHI_LIST.indexOf(sxZhi)+1;
          let sxCY=(sxYear-1864)%60;let sxHG=sxCY%10;if(sxHG>4)sxHG-=5;
          let sxDU=Math.floor(((sxDeg%360+360)%360)/15);
          let _xx=[1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,0,0];
          let sxHCyl=sxHG*12+_xx[sxDU];
          let sxShiZhu=GAN_LIST[sxCY%10]+ZHI_LIST[sxCY%12]+' '+GAN_LIST[sxHCyl%10]+ZHI_LIST[sxHCyl%12];
          let sgjs={'甲':0,'己':0,'乙':2,'庚':2,'丙':4,'辛':4,'丁':6,'壬':6,'戊':8,'癸':8}[sxYearGan]||0;
          let sgxs=sgjs+sxXs;if(sgxs>10)sgxs-=10;
          let ssxs=(sxXs-sgxs+12)%12;
          let xs;if(ssxs===0)xs=1;else if(ssxs===10)xs=2;else if(ssxs===8)xs=3;else if(ssxs===6)xs=4;else if(ssxs===4)xs=5;else xs=6;
          let sgy;if(sgxs===1){if(xs===1)sgy='戊';else if(xs===2)sgy='己';else if(xs===3)sgy='庚';else if(xs===4)sgy='辛';else if(xs===5)sgy='壬';else sgy='癸';}else{sgy=GAN_LIST[sgxs-1];}
          let zfzs=sxIsYin?sxJu-xs+1:sxJu+xs-1;if(zfzs<=0)zfzs+=9;else if(zfzs>9)zfzs-=9;
          let zfzsF=zfzs%9;if(zfzsF===0)zfzsF=9;
          let ZF={1:'蓬',2:'芮',3:'冲',4:'辅',5:'禽',6:'心',7:'柱',8:'任',9:'英'};
          let ZS={1:'休',2:'死',3:'伤',4:'杜',5:'中',6:'开',7:'惊',8:'生',9:'景'};
          let zfStar=ZF[zfzsF]||'蓬',zsMenH=ZS[zfzsF]||'休';if(zfzsF===5){zfStar='芮';zsMenH='死';}if(zfzsF===5){zfStar='芮';zsMenH='死';}
          let MAGIC='163468725';let GAN9=['戊','己','庚','辛','壬','癸','丁','丙','乙'];
          let dgs={};if(!sxIsYin){for(let y1=1;y1<=9;y1++){let yi=y1-sxJu+1;if(yi<1)yi+=9;dgs[y1]=GAN9[yi-1];}}
          else{for(let y1=1;y1<=9;y1++){let yi=sxJu-y1+1;if(yi<1)yi+=9;dgs[y1]=GAN9[yi-1];}}
          let zg2=dgs[5]||'';if(zg2&&dgs[2])dgs[2]=dgs[2]+zg2;
          let dsxL=zfzsF===5?2:zfzsF;let dsx=parseInt(MAGIC.charAt(dsxL-1));
          let gs=0;for(let gk=1;gk<=9;gk++){if(gk===5)continue;if(dgs[gk]&&dgs[gk].indexOf(sgy)>=0){gs=gk;break;}}
          if(!gs||gs===5)gs=zfzsF===5?2:zfzsF;
          let cY=(sxYear-1864)%60;let hG2=cY%10;if(hG2>4)hG2-=5;
          let du=Math.floor(((sxDeg%360+360)%360)/15);
          let _xzArr=[1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,0,0];
          let hCyl=hG2*12+_xzArr[du];
          let pgs=parseInt(MAGIC.charAt(gs-1)),xinjs=pgs-dsx+1;if(xinjs<1)xinjs+=8;
          let BAGUA=[1,8,3,4,9,2,7,6];
          let XIN={1:'蓬',2:'任',3:'冲',4:'辅',9:' ',5:'英',6:'芮',7:'柱',8:'心'};
          let xings={},tygs={};
          for(let x=1;x<=8;x++){let xys=x-xinjs+1;if(xys<1)xys+=8;xings[x]=XIN[xys]||'';tygs[x]=dgs[BAGUA[xys-1]]||dgs[1]||'';}
          let sgxsm=(sgxs===1||sgxs===10)?1:sgxs;
          let menjs;if(!sxIsYin)menjs=sgxsm;else menjs=parseInt('198765432'.charAt(sgxsm-1));
          let mengs={};for(let i=1;i<=9;i++){let mens=i-menjs+1;if(mens<1)mens+=9;mengs[i]=ZS[mens]||'';}
          let _zsMenOrig=zfzsF===5?'中':zsMenH; // 禽→芮替换前的原始值使门
  let szsgs=0;for(let i=1;i<=9;i++){if(mengs[i]===_zsMenOrig){szsgs=i;break;}}if(!szsgs)szsgs=zfzsF;
          let pdsx=parseInt(MAGIC.charAt(szsgs-1));
          let pmenjs;if(pdsx-dsx>0)pmenjs=pdsx-dsx;else pmenjs=pdsx-dsx+8;
          let PMEN={1:'休',2:'生',3:'伤',4:'杜',5:'景',6:'死',7:'惊',8:'开'};
          let pmengs={};for(let m=1;m<=8;m++){let pm=m-pmenjs;if(pm<=0)pm+=8;pmengs[m]=PMEN[pm]||'';}
          let TS={1:'符',2:'蛇',3:'阴',4:'六',5:'白',6:'玄',7:'地',8:'天'};let tsjs=pgs;let tsgs={};
          if(!sxIsYin){for(let i=1;i<=8;i++){let tss=i-tsjs+1;if(tss<1)tss+=8;tsgs[i]=TS[tss]||'';}}
          else{for(let i=1;i<=8;i++){let tss=tsjs-i+1;if(tss<1)tss+=8;tsgs[i]=TS[tss]||'';}}
          let pals={};
          for(let g=1;g<=9;g++){if(g===5)continue;let pos2=BAGUA.indexOf(g)+1;
            pals[g]={shen:tsgs[pos2]||'',tian:(tygs[pos2]||'')[0]||'',tian2:(tygs[pos2]||'').length>1?tygs[pos2][1]:'',di:dgs[g]?dgs[g][0]:'',di2:dgs[g]&&dgs[g].length>1?dgs[g][1]:'',xing:xings[pos2]||'',men:pmengs[pos2]||''};}
          let shiGan2=GAN_LIST[(sgjs+sxXs-1)%10],shiGanN=GAN_LIST.indexOf(shiGan2);
          let xunZhi=(ZHI_LIST.indexOf(sxZhi)-shiGanN+12)%12;
          let kongWang=ZHI_LIST[(xunZhi+10)%12]+ZHI_LIST[(xunZhi+11)%12];
          let maYao={'申子辰':'寅','寅午戌':'申','亥卯未':'巳','巳酉丑':'亥'};
          let maXing='';for(let mk in maYao){if(mk.indexOf(sxZhi)>=0){maXing=maYao[mk];break;}}
          let xunShou='甲'+ZHI_LIST[xunZhi];
          let xsDunGan={'子':'戊','戌':'己','申':'庚','午':'辛','辰':'壬','寅':'癸'}[xunShou[1]]||'';
          let dgg=0;for(let g=1;g<=9;g++){if(dgs[g]&&dgs[g][0]===xsDunGan){dgg=g;break;}}
          if(!dgg)dgg=gs;
          let zhiShiFG=0;for(let g=1;g<=9;g++){if(g===5)continue;let pp=BAGUA.indexOf(g)+1;if(pmengs[pp]===zsMenH){zhiShiFG=g;break;}}
          if(!zhiShiFG)zhiShiFG=szsgs;
          let sxInfo={palaces:pals,zfStar:zfStar,zsMen:zsMenH,zhiFuGong:zhiShiFG,kongWang:kongWang,maXing:maXing,xunShou:xunShou,zfzsF:zfzsF,szsgs:szsgs,sgg:gs,dgg:dgg,hCyl:hCyl,sgy:sgy};
          renderShanXiangPan2(sxDeg,sxName,sxJu,sxIsYin,sxHq,sxShiZhu,sxInfo);
          }catch(e){let em=e.message||e;console.error(e);let tipEl=document.getElementById('tip');if(tipEl){tipEl.style.display='block';tipEl.innerHTML='<span style=color:red>山向错误:'+em+'</span>';}}
          return;
        }


	        // 心盘模式: 提取背景数据(四柱/马星/空亡/局数), 宫位留空等用户手动编辑
	        if (panType === 3) {
	          document.getElementById('result').style.display = 'none';
	          if (Object.keys(_xpBgPalaces).length > 0) { clearXinpan(); return; }
          let bgResult = null;
	          try {
	            bgResult = doNewPan(false);
	            if (bgResult) {
	              let sz = bgResult.sizhu;
	              _xpBgSizhu = sz.y.ganZhi+' '+sz.m.ganZhi+' '+sz.d.ganZhi+' '+sz.h.ganZhi;
	              _xpBgNongli = bgResult.nongli;
	              _xpBgKongWang = bgResult.kw.gz;
	              _xpBgMaXing = bgResult.ma.z;
	              _xpBgJu = bgResult.juLabel;
	              _xpBgXunShou = bgResult.xs.gz;
	              _xpBgIsYin = bgResult.yinYang === '阴';
              let bgPalaces = {};
              let pals = bgResult.pals;
              for(let g = 1; g < 10; g++) {
                if (g === 5) continue;
                let p = pals[g];
                bgPalaces[g] = { shen:p.shen, tian:p.tian, di:p.di, xing:p.xing, men:p.men, anGan:'' };
              }
              _xpBgPalaces = bgPalaces;
	            }
	          } catch(e) {}
          if (bgResult) window._raw = bgResult.raw || '';
          try {
            let _tmdhEl=document.getElementById("tianmendihu");if(_tmdhEl)_tmdhEl.checked=true;
            _tmdhRaw = paipan(false);
            let _tmdhEl2=document.getElementById("tianmendihu");if(_tmdhEl2)_tmdhEl2.checked=false;
          } catch(e) { _tmdhRaw = null; }
	          clearXinpan();
	          return;
	        }
	      
	        
          if (panType === 5) { doChuanRen(); return; }
        
	        // 清空天门地户缓存(新排盘后需重新点击)
	        _tmdhRaw = null;
  _tmdhShow = false;

  tip.innerHTML = '计算中...';
  document.getElementById('result').style.display = 'none';

  // 自选局: 读取selZxj下拉值, 构建customJu参数
  let zxjIdx = parseInt(selZxj.value) || 0;
  let zxjus = zxjIdx > 0;

  // 设置Today供HTML paipan函数使用
  window.Today = new Date(Y, M-1, D, hr, mn, 0);

  // 调用引擎qimenChart → 获取raw HTML + 结构化数据
  try {
    let raw, _sizhuObj=null;
    let copts2={year:Y,month:M,day:D,hour:hr,minute:mn,panType:panType};
    if(zxjus){let i3=parseInt(selZxj.value)||0;if(i3>0){let t3=i3-1;copts2.customJu=t3<9?{yinYang:'阴',number:9-t3}:{yinYang:'阳',number:t3-8};}}
    let qr=window.qimenChart(copts2);
    raw=qr?qr.raw:'';
    _sizhuObj=qr?qr.sizhu:null;
    window._sizhuObj=_sizhuObj;
    if (!raw || raw.length < 100) {
      tip.innerHTML = '<span style="color:red">排盘失败，请检查日期</span>';
      return;
    }
    // 预生成天门地户数据(tmdh=true), 供tianmenDihu按钮即时显示
    try {
      let _tmdhEl=document.getElementById("tianmendihu");if(_tmdhEl)_tmdhEl.checked=true;
	      _tmdhRaw = paipan(zxjus);
	      let _tmdhEl2=document.getElementById("tianmendihu");if(_tmdhEl2)_tmdhEl2.checked=false;
    } catch(e) { _tmdhRaw = null; }

    let result=doNewPan(zxjus);renderPan(raw,result);
    tip.innerHTML = '';
    document.getElementById('result').style.display = 'block';
    _renderBottomBar();
  } catch(e) {
    tip.style.display='block'; tip.innerHTML = '<span style="color:red">错误: ' + e.message + '</span>';
    console.error(e);
  }
}


// ============ renderPan: 解析引擎HTML → 重建数据结构 → 渲染九宫格 ============
function renderPan(raw, engineData) { let gongli,nongli,sizhu,jieqi,zhiFuStr,zhiShiStr,xunShou,kongWang,maXing; if(engineData&&engineData.sizhu){let d=engineData,sz=d.sizhu;gongli=d.gongli;nongli=d.nongli;sizhu=sz.y.ganZhi+" "+sz.m.ganZhi+" "+sz.d.ganZhi+" "+sz.h.ganZhi;if(sz.minute&&sz.minute.gz)sizhu+=" "+sz.minute.gz;jieqi="";try{if(window.tyme4j&&window.tyme4j.SolarDay){let sd=window.tyme4j.SolarDay.fromYmd(Y,M,D),term=sd.getTerm(),nextTerm=term.next(1),tJD=term.getJulianDay(),tST=tJD.getSolarTime(),tD=tJD.getSolarDay(),nJD=nextTerm.getJulianDay(),nST=nJD.getSolarTime(),nD=nJD.getSolarDay(),pad= v => {return v<10?"0"+v:v};jieqi=term.getName()+" "+tD.getMonth()+"."+tD.getDay()+" "+pad(tST.getHour())+":"+pad(tST.getMinute());jieqi+="~"+nextTerm.getName()+" "+nD.getMonth()+"."+nD.getDay()+" "+pad(nST.getHour())+":"+pad(nST.getMinute())}}catch(e){}zhiFuStr=d.zf.n;zhiShiStr=d.zs.n;xunShou=d.xs.gz;kongWang=d.kw.gz;maXing=d.ma.z;}else{
  // 提取头部的 span.headst 内容块, 按 <br> 分行
  let headstMatch = raw.match(/<span class="?headst"?>(.*?)<\/span>/i);
  let headText = headstMatch ? headstMatch[1] : '';
  // 先按<br>分行, 再去除每行的HTML标签
  let brLines = headText.split(/<br\s*\/?\s*>/i);

  gongli = ''; nongli = ''; sizhu = ''; jieqi = ''; zhiFuStr = ''; zhiShiStr = '';
  xunShou = ''; kongWang = ''; maXing = '';

  brLines.forEach(line => {
    // 去HTML标签
    let t = line.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/[\s　]+/g, ' ').trim();
    if (!t) return;

    // 一个行可能包含多个字段
    if (t.indexOf('公历') >= 0) { gongli = t.replace(/^.*?公历\s*:\s*/, '').split(/\s{2,}/)[0].trim(); }
    if (t.indexOf('农历') >= 0) { nongli = t.replace(/^.*?农历\s*:\s*/, '').split(/\s{2,}/)[0].replace(/\s*乾造|\s*坤造/g, '').trim(); }
    if (t.indexOf('四柱') >= 0) {
      let sxParts = t.replace(/^.*?四柱\s*:\s*/, '').split(/\s{2,}/);
      let sxMain = sxParts[0] ? sxParts[0].replace(/<[^>]+>/g, '').trim() : '';
      if (panType === 2 && sxParts[1]) {
        let sxKe = sxParts[1].replace(/<[^>]+>/g, '').trim();
        sizhu = sxMain + ' ' + sxKe;
      } else { sizhu = sxMain; }
    }
    // 使用tyme4j SolarDay.getTerm()精确计算节气时刻
    try {
      if (window.tyme4j && window.tyme4j.SolarDay) {
        let sd = window.tyme4j.SolarDay.fromYmd(Y, M, D);
        let term = sd.getTerm();
        let nextTerm = term.next(1);
        let tJD = term.getJulianDay(); let tST = tJD.getSolarTime(); let tD = tJD.getSolarDay();
        let nJD = nextTerm.getJulianDay(); let nST = nJD.getSolarTime(); let nD = nJD.getSolarDay();
        let pad = v => v<10?'0'+v:v;
        jieqi = term.getName() + ' ' + tD.getMonth() + '.' + tD.getDay() + ' ' + pad(tST.getHour()) + ':' + pad(tST.getMinute());
        jieqi += '~' + nextTerm.getName() + ' ' + nD.getMonth() + '.' + nD.getDay() + ' ' + pad(nST.getHour()) + ':' + pad(nST.getMinute());
      } else { throw 'no tyme4j'; }
    } catch(e) {
      let jqMatch = headText.match(/节气\s*:\s*([^\n<]+)/);
      jieqi = jqMatch ? jqMatch[1].trim() : (headText.indexOf('节气')>=0 ? headText.replace(/^.*?节气\s*:\s*/, '').split(/\s{2,}/)[0].trim() : '');
    }
    if (t.indexOf('值符') >= 0) {
      let zfM = t.match(/值符\s*:\s*(\S+)/); if (zfM) zhiFuStr = zfM[1];
    }
    if (t.indexOf('值使') >= 0) {
      let zsM = t.match(/值使\s*:\s*(\S+)/); if (zsM) zhiShiStr = zsM[1];
    }
    if (t.indexOf('旬首') >= 0) {
      let m2 = t.match(/旬首\s*:\s*(\S+)/); if (m2) xunShou = m2[1];
      let m3 = t.match(/空亡\s*:\s*(\S+)/); if (m3) kongWang = m3[1];
      let m4 = t.match(/马星\s*:\s*(\S+)/); if (m4) maXing = m4[1];
    }
  });
  }

  // 优先从引擎结构化数据提取四柱/五柱(更可靠)
  let nianGz='', yueGz='', riGz='', shiGz='', keGz='';
  if (window._sizhuObj) {
    let sz=window._sizhuObj;
    nianGz=sz.y.ganZhi; yueGz=sz.m.ganZhi; riGz=sz.d.ganZhi; shiGz=sz.h.ganZhi;
    if (sz.minute) {
      // 提取纯文本 (去除HTML标签)
      keGz=sz.minute.replace(/<[^>]+>/g,'').trim();
    }
  } else {
    // 回退方案: 从raw HTML文本解析四柱
    let pillars = sizhu.split(' ').filter(Boolean);
    if (panType === 2 && pillars.length >= 5) {
      nianGz=pillars[0]; yueGz=pillars[1]; riGz=pillars[2]; shiGz=pillars[3]; keGz=pillars[4];
    } else {
      nianGz=pillars[0]||''; yueGz=pillars[1]||''; riGz=pillars[2]||''; shiGz=pillars[3]||''; keGz='';
    }
  }

  // 提取节气具体时间: "節氣：2026-6-5 23:48:0～2026-7-7 9:56:0"
  let jqTimeMatch = raw.match(/[節节]氣[：:]\s*(\d+-\d+-\d+\s+[\d:]+)[～~](\d+-\d+-\d+\s+[\d:]+)/);
  let jqTimeStr = '';
  if (jqTimeMatch) {
    let t1 = jqTimeMatch[1].replace(/^\d+-/, '').replace(/:0$/, ':00');
    let t2 = jqTimeMatch[2].replace(/^\d+-/, '').replace(/:0$/, ':00');
    jqTimeStr = ' ' + t1 + ' ~ ' + t2;
  }
  // 去掉月将和局数(类型行单独显示)，只保留节气名+时间
  jieqi = jieqi.replace(/\s*月将:\S+/, '').replace(/\s*[阴阳]遁\d+局/, '') + jqTimeStr;

  let jieqiParts = jieqi.split('～');
  let yueJiang = (jieqi.match(/月将:(\S+)/) || ['',''])[1] || (raw.match(/月将:(\S+)/) || ['',''])[1] || '';
  let juStr = (raw.match(/([阴阳])遁(\d+)局/) || ['','','']);
  let isYin = juStr[1] === '阴';
  let juNum = parseInt(juStr[2]) || 0;
  if (juNum < 1 || juNum > 9) juNum = ((juNum % 9) + 9) % 9 || 9;
  let yinYang = isYin ? '阴' : '阳';

  let zhiFuXing = zhiFuStr.replace(/落\d宫/, '').trim();
  let zhiShiMen = zhiShiStr.replace(/落\d宫/, '').trim();
  // 值符/值使显示简写: 去掉"天""星""门"后缀
  let zhiFuShort = zhiFuXing.replace(/^天/, '').replace(/星$/, '');
  let zhiShiShort = zhiShiMen.replace(/门$/, '');

  // 从gridst表格解析八宫数据(八神/天盘/地盘/九星/八门) + 外圈暗干
  let gridMatch = raw.match(/<table\s+class="gridst"[^>]*>(.*?)<\/table>/i);
  let gridHtml = gridMatch ? gridMatch[0] : '';
  let allCells = gridHtml.match(/<td[^>]*>(.*?)<\/td>/gi) || [];
  // 提取每个单元格的纯文本
  let cellTexts = allCells.map(c => {
    return c.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/[\s\u3000]+/g,' ').trim();
  });
  // 宫格位置索引 (五行五列表格)
  let GONG_POS = {
    4: 6,   // 宫4在第6个td (row1 col1)
    9: 7,   // 宫9在第7个td (row1 col2)
    2: 8,   // 宫2在第8个td (row1 col3)
    3: 11,  // 宫3在第11个td (row2 col1)
    7: 13,  // 宫7在第13个td (row2 col3)
    8: 16,  // 宫8在第16个td (row3 col1)
    1: 17,  // 宫1在第17个td (row3 col2)
    6: 18   // 宫6在第18个td (row3 col3)
  };
  // 暗干位置 (girdnone单元格)
  let ANG_POS = {
    4: 5,   // 巽宫暗干在左侧 (row1 col0)
    9: 2,   // 离宫暗干在上方 (row0 col2)
    2: 9,   // 坤宫暗干在右侧 (row1 col4)
    3: 10,  // 震宫暗干在左侧 (row2 col0)
    7: 14,  // 兑宫暗干在右侧 (row2 col4)
    8: 15,  // 艮宫暗干在左侧 (row3 col0)
    1: 22,  // 坎宫暗干在下方 (row4 col2)
    6: 19   // 乾宫暗干在右侧 (row3 col4)
  };

  let palaces = {};
  [4,9,2,3,7,8,1,6].forEach(gong => {
    let tdIdx = GONG_POS[gong];
    let td = allCells[tdIdx] || '';
    let lines = td.split(/<br\s*\/?>/i);
    let p = {shen:'', tian:'', di:'', xing:'', men:'', anGan:'', isTianXing:false, isTianMu:false, isDiXing:false, isDiMu:false, isMenPo:false, isTianXing1:false, isTianMu1:false, isTianXing2:false, isTianMu2:false, isDiXing1:false, isDiMu1:false, isDiXing2:false, isDiMu2:false};

    // 第一行: 八神
    let l1Text = lines[0].replace(/<[^>]+>/g,' ').replace(/[　\s]+/g,' ').trim();
    let l1Tokens = l1Text.split(' ').filter(Boolean);
    if (l1Tokens[0] && SHEN[l1Tokens[0]]) { p.shen = SHEN[l1Tokens[0]]; }

    // 第二行: 天盘干[+寄干] + 九星
    if (lines[1]) {
      let l2 = lines[1].replace(/<[^>]+>/g,' ').replace(/[　\s]+/g,' ').trim();
      let p2 = l2.split(/\s+/).filter(Boolean);
      if (p2[0] && /^[甲乙丙丁戊己庚辛壬癸]{1,2}$/.test(p2[0])) {
        p.tian = p2[0];
        if (p.tian.length === 1 && p2[1] && /^[甲乙丙丁戊己庚辛壬癸]$/.test(p2[1]) && !XING[p2[1]]) {
          p.tian += p2[1];
        }
      }
      for(let xi = 1; xi < p2.length; xi++) {
        let xKey = p2[xi].replace(/<[^>]*>/g,'');
        if (XING[xKey]) { p.xing = XING[xKey]; break; }
      }
      // 入墓/击刑/门迫颜色由 recalcColors 统一处理, 不再从FONT解析
    }

    // 第三行: 地盘干[+寄干] + 八门
    if (lines[2]) {
      let l3 = lines[2].replace(/<[^>]+>/g,' ').replace(/[　\s]+/g,' ').trim();
      let p3 = l3.split(/\s+/).filter(Boolean);
      if (p3[0] && /^[甲乙丙丁戊己庚辛壬癸]{1,2}$/.test(p3[0])) {
        p.di = p3[0];
        // 如果第一个token是单字且下个也是天干非门→合并寄干
        if (p.di.length === 1 && p3[1] && /^[甲乙丙丁戊己庚辛壬癸]$/.test(p3[1]) && !MEN[p3[1]]) {
          p.di += p3[1];
        }
      }
      for(let mi = p3.length - 1; mi >= 1; mi--) {
        let mKey = p3[mi].replace(/<[^>]*>/g,'');
        if (MEN[mKey]) { p.men = MEN[mKey]; break; }
      }
      // 入墓/击刑由 recalcColors 统一处理, 只保留门迫的FONT检测
      if (lines[2].indexOf('color=#FF0000') >= 0 || lines[2].indexOf("color=red") >= 0) p.isMenPo = true;
    }

    if (!p.tian && p.di) p.tian = p.di;
    // 暗干从girdnone单元格提取
    let angIdx = ANG_POS[gong];
    if (angIdx !== undefined && angIdx < cellTexts.length) {
      let ag = cellTexts[angIdx];
      if (ag && /^[甲乙丙丁戊己庚辛壬癸]{1,2}$/.test(ag)) p.anGan = ag;
    }
    palaces['gong'+gong] = p;
  });

  // 马星: 时支查YiMa表→宫位→外圈位置标记外圈位置: 地支→宫位→ma角标
  let ZHI_ARR = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  let ZHI2GONG = [1,8,8,3,4,4,9,2,2,7,6,6];
  let maIdx2 = ZHI_ARR.indexOf(maXing);
  let maGongNum = maIdx2 >= 0 ? ZHI2GONG[maIdx2] : 0;
  let maPosId = MA_POS[maGongNum] || '';
  window._maPosId = maPosId;

  // 空亡: 旬首→空亡地支→对应宫位标记◎宫位
  let kongGongs2 = {};
  if (kongWang && kongWang.length >= 2) {
    kongGongs2[ZHI2G[kongWang[0]]] = true;
    kongGongs2[ZHI2G[kongWang[1]]] = true;
  }
  window._kongGongs = kongGongs2;

  // 检测自选局标记
  let ziXuanMark = raw.indexOf('自选') >= 0 ? '<font color=#FF00FF>自选 </font>' : '';

  // 根据规则重新计算颜色标记(含逐字标记)
  recalcColors(palaces);
  // 存储供按钮函数使用
  window._palaces = palaces;
  window._raw = raw;
  window._yueJiang = yueJiang;
  window._shiZhi = shiGz.length >= 2 ? shiGz[1] : '';

  // 全局颜色标记函数
  window._colorSpan = (val, isXing, isMu, isPo, isKong) => {
    if (!val) return '';
    if (isPo) return '<font color="red">'+val+'</font>';
    if (isXing && isMu) return '<font color="#009cef">'+val+'</font>';
    if (isXing) return '<font color="#b745ce">'+val+'</font>';
    if (isMu) return '<font color="#ca610e">'+val+'</font>';
    if (isKong) return '<span style="color:#999">'+val+'</span>';
    return val;
  };
  // 阴干颜色计算(逐字处理寄干)
  window._anGanColor = (ganStr, gong) => {
    if (!ganStr) return '';
    let muRules = {2:['癸'], 6:['戊','丙','乙'], 8:['庚','丁','己'], 4:['辛','壬']};
    let xingRules = {3:['戊'], 2:['己'], 8:['庚'], 9:['辛'], 4:['壬','癸']};
    result = '';
    for(let ai = 0; ai < ganStr.length; ai++) {
      let ch = ganStr[ai];
      let isX = xingRules[gong] && xingRules[gong].indexOf(ch) >= 0;
      let isM = muRules[gong] && muRules[gong].indexOf(ch) >= 0;
      if (isX && isM) result += '<font color="#009cef">'+ch+'</font>';
      else if (isX) result += '<font color="#b745ce">'+ch+'</font>';
      else if (isM) result += '<font color="#ca610e">'+ch+'</font>';
      else result += ch;
    }
    return result;
  };
  let colorSpan = window._colorSpan;

  // 空亡: 旬首→空亡地支→对应宫位标记◎标记ID映射: 固定编号体系

  // 空亡: 旬首→空亡地支→对应宫位标记◎宫位: 地支→宫位映射
  let kongGongs = {};
  if (kongWang.length >= 2) {
    kongGongs[ZHI2G[kongWang[0]]] = true;
    kongGongs[ZHI2G[kongWang[1]]] = true;
  }
  function renderPalace(g) {
    p = palaces['gong'+g];
    if (!p) return '<TD></TD>';
    let w = (g === 9 || g === 1) ? '34%' : '33%';
    let shenAbbr = SHEN_ABBR[p.shen] || p.shen;
    let xingAbbr = XING_ABBR[p.xing] || p.xing;
    let menAbbr = MEN_ABBR[p.men] || p.men;
    let kongMark = kongGongs[g] ? '○' : '';
    // 逐字颜色: 在渲染时当场按宫位+天干规则判断, 不依赖预计算标记
    let muRules2 = {2:['癸'],6:['戊','丙','乙'],8:['庚','丁','己'],4:['辛','壬']};
    let xingRules2 = {3:['戊'],2:['己'],8:['庚'],9:['辛'],4:['壬','癸']};
    let xmRules2 = {8:['庚'],4:['壬']};
    function spanGan(ch) {
      isM = muRules2[g] && muRules2[g].indexOf(ch) >= 0;
      isX = xingRules2[g] && xingRules2[g].indexOf(ch) >= 0;
      let isXM = xmRules2[g] && xmRules2[g].indexOf(ch) >= 0;
      if (isXM) return '<font color="#009cef">'+ch+'</font>';
      if (isX) return '<font color="#b745ce">'+ch+'</font>';
      if (isM) return '<font color="#ca610e">'+ch+'</font>';
      return ch;
    }
    function charColor(str) {
      if (!str) return '';
      let r = ''; for(let ci = 0; ci < str.length; ci++) r += spanGan(str[ci]);
      return r;
    }
    return '<TD style="width:'+w+'" id="gong'+g+'" onclick="showPalace('+g+')">' +
      '<div style="display:grid;grid-template-rows:1fr 1fr 1fr;height:100%;position:relative">' +
      '<div class="panItem top" style="align-self:start"><span id="shen'+g+'">'+colorSpan(shenAbbr)+'</span><span id="kong'+KONG_ID[g]+'">'+kongMark+'</span></div>' +
      '<div class="panItem" style="align-self:center"><span id="tian'+g+'">'+charColor(p.tian)+'</span><span id="xing'+g+'">'+colorSpan(xingAbbr)+'</span></div>' +
      '<div class="panItem" style="align-self:end"><span id="di'+g+'">'+charColor(p.di)+'</span><span id="men'+g+'">'+colorSpan(menAbbr, false, false, p.isMenPo)+'</span></div>' +
      '<div class="state" id="stateTian'+g+'" style="position:absolute;top:25%;left:1px;font-size:10px;color:#888"></div>' +
      '<div class="state" id="stateDi'+g+'" style="position:absolute;bottom:26%;left:1px;font-size:10px;color:#888"></div>' +
      '</div></TD>';
  }

  // 如果只有天盘干有标记,同时标记地盘干(两者同干同标记)
  // 合并 isTianXing 和 isDiMu 到最终的标记

  // 构造日期(显示格式: YYYY-MM-DD HH:MM:SS)
  agColor = g => {
    let ag = palaces['gong'+g] ? palaces['gong'+g].anGan : '';
    return ag ? window._anGanColor(ag, g) : '';
  };
  let wxColor = c => { if(!c)return'#333'; if('甲乙寅卯'.indexOf(c)>=0)return'#2e7d32'; if('丙丁巳午'.indexOf(c)>=0)return'#d50000'; if('戊己辰戌丑未'.indexOf(c)>=0)return'#795548'; if('庚辛申酉'.indexOf(c)>=0)return'#f9a825'; if('壬癸亥子'.indexOf(c)>=0)return'#0d47a1'; return'#333'; };
  let wxSpan = s => '<font color="'+wxColor(s)+'">'+(s||'')+'</font>';
  let gridHTML = buildPaipanGrid(palaces, kongGongs, maPosId, agColor, {colorSpan: window._colorSpan});

  let dStr = Y+'-'+String(M).padStart(2,'0')+'-'+String(D).padStart(2,'0')+' '+
             String(hr).padStart(2,'0')+':'+String(mn).padStart(2,'0')+':00';
  let keCols = panType===2 ? 5 : 4;
  ziXuanMark = raw.indexOf('自选') >= 0 ? '<font color=#FF00FF>自选 </font>' : '';
  let html =
    '<div id="panHead">' +
    '<TABLE class="pan" id="headTable">' +
    '<TR><TD id="dTitle">日期</TD><TD colspan="'+keCols+'" id="dateTime">'+dStr+' ('+nongli+')</TD></TR>' +
    '<TR><TD style="color:#dead68">节气</TD><TD colspan="'+keCols+'" id="jieqi">'+(jieqi||'节气')+'</TD></TR>' +
    '<TR><TD style="color:#dead68">类型</TD><TD colspan="'+keCols+'">' +
    (panType===2?'刻盘':'时盘')+'·			'+ziXuanMark+'<font id="yinYang">'+yinYang+'</font>遁<B id="juNum">'+juNum+'</B>局【月将<B id="yueJiang">'+yueJiang+'</B>】</TD></TR>' +
    '<TR id="tdTitle"><TD>旬首</TD><TD>值符</TD><TD>值使</TD><TD>马星</TD>'+(panType===2?'<TD colspan=2>空亡</TD>':'<TD>空亡</TD>')+'</TR>' +
    '<TR><TD id="xunShou">'+xunShou+'</TD><TD>天<font id="zhiFu">'+zhiFuShort+'</font></TD>' +
    '<TD><font id="zhiShi">'+zhiShiShort+'</font>门</TD>' +
    '<TD id="maXing">'+maXing+'</TD>'+(panType===2?'<TD colspan=2 id="kongWang">'+kongWang+'</TD>':'<TD id="kongWang">'+kongWang+'</TD>')+'</TR>' +
    '<TR><TD style="color:#dead68" rowspan=2>'+(panType===2?'五柱':'四柱')+'</TD>' +
    '<TD class="sizhuTitle">年柱</TD><TD class="sizhuTitle">月柱</TD>' +
    '<TD class="sizhuTitle">日柱</TD><TD class="sizhuTitle">时柱</TD>' +
    (panType===2?'<TD class="sizhuTitle">刻柱</TD>':'') + '</TR>' +
    '<TR><TD class="sizhu" id="nianzhu">'+wxSpan(nianGz[0]||'')+'<br>'+wxSpan(nianGz[1]||'')+'</TD>' +
    '<TD class="sizhu" id="yuezhu">'+wxSpan(yueGz[0]||'')+'<br>'+wxSpan(yueGz[1]||'')+'</TD>' +
    '<TD class="sizhu" id="rizhu">'+wxSpan(riGz[0]||'')+'<br>'+wxSpan(riGz[1]||'')+'</TD>' +
    '<TD class="sizhu" id="shizhu">'+wxSpan(shiGz[0]||'')+'<br>'+wxSpan(shiGz[1]||'')+'</TD>' +
    (panType===2 ? '<TD class="sizhu" id="kezhu">'+wxSpan(keGz[0]||'')+'<br>'+wxSpan(keGz[1]||'')+'</TD>' : '') +
    '</TR></TABLE></div>' +
    gridHTML +
    '<div id="Tip">颜色说明：<span style="color:#ca610e">入墓</span>、<span style="color:#b745ce">击刑</span>、<span style="color:red">门迫</span>、<span style="color:#009cef">刑+墓</span></div>' +
    '<TABLE id="btnTable1"><TR>' +
    '<TD><div class="btn" id="btn1" onclick="showYixing()">移星换斗</div></TD>' +
    '<TD><div class="btn" id="btn3" onclick="tianmenDihu()">天门地户</div></TD>' +
    '<TD><div class="btn" id="btn2" onclick="showState()">长生状态</div></TD>' +
    '<TD><div class="btn"><span onclick="panChange(-1)" id="preBtn">上局</span>|<span onclick="panChange(1)" id="nextBtn">下局</span></div></TD>' +
    '</TR></TABLE>' +
    '<TABLE id="btnTable2"><TR>' +
    '<TD><div class="btn" id="btn4" onclick="shen12(1)">年神将</div></TD>' +
    '<TD><div class="btn" id="btn5" onclick="shen12(2)">月神将</div></TD>' +
    '<TD><div class="btn" id="btn6" onclick="shen12(3)">日神将</div></TD>' +
    '<TD><div class="btn" id="btn7" onclick="shen12(4)">时神将</div></TD>' +
    '</TR></TABLE>' +
    '<div id="yixinghuandouDIV"></div>';

  document.getElementById('panWrap').innerHTML = html;

  // 清空waipan(新排盘后天门地户需重新点击)
  for(let wp = 1; wp <= 12; wp++) {
    let el = document.getElementById('waipan'+wp);
    if (el) { el.innerHTML = ''; el.style.fontSize = ''; el.style.lineHeight = ''; }
  }
  addColorStyles();
  setTimeout(_bindActionButtons, 10);
  setTimeout(fixYinGanAlign, 10);
  setTimeout(fixYinGanAlign, 50);
}

// ============ 颜色标记 + 阴干对齐 ============
function addColorStyles() {
  let fonts = document.querySelectorAll('#pan font[color]');
  fonts.forEach(f => {
    if (f.getAttribute('color') === 'red') f.style.fontWeight = 'bold';
  });
}

function fixYinGanAlign() {
  // 主盘 + 移星换斗统一处理
  let containers = [document];
  let yxDIV = document.getElementById('yixinghuandouDIV');
  if (yxDIV && yxDIV.style.display === 'block') {
    yxDIV.querySelectorAll('#content').forEach(c => { containers.push(c); });
  }

  containers.forEach(scope => {
    let isMain = (scope === document);
    // 宫格正方形: 每个容器内独立处理
    [4,9,2,3,7,8,1,6].forEach(g => {
      let el = scope.querySelector('#gong'+g);
      if (el) { let w = el.getBoundingClientRect().width; if (w > 0) el.style.height = w + 'px'; }
    });
    // 行高同步
    let pRows = scope.querySelectorAll('#pan tr');
    let lRows = scope.querySelectorAll('#leftTable tr');
    let rRows = scope.querySelectorAll('#rightTable tr');
    for(let i = 0; i < 3 && i < pRows.length; i++) {
      let rh = pRows[i].getBoundingClientRect().height;
      if (rh > 0) {
        if (lRows[i]) lRows[i].style.height = rh + 'px';
        if (rRows[i]) rRows[i].style.height = rh + 'px';
      }
    }
    // 侧边阴干top对齐: 左=天盘, 右=九星
    [4,3,8].forEach(g => {
      let yin = scope.querySelector('#yinGan'+g);
      let tian = scope.querySelector('#tian'+g);
      let gong = scope.querySelector('#gong'+g);
      if (!yin || !tian || !gong) return;
      let go = gong.getBoundingClientRect().top;
      yin.style.paddingTop = Math.max(0, tian.getBoundingClientRect().top - go) + 'px';
      if (isMain) { yin.style.textAlign = 'right'; yin.style.verticalAlign = 'top'; yin.style.fontSize = '15px'; yin.style.lineHeight = '25px'; yin.style.color = '#333'; }
    });
    [2,7,6].forEach(g => {
      yin = scope.querySelector('#yinGan'+g);
      let xing = scope.querySelector('#xing'+g);
      gong = scope.querySelector('#gong'+g);
      if (!yin || !xing || !gong) return;
      go = gong.getBoundingClientRect().top;
      yin.style.paddingTop = Math.max(0, xing.getBoundingClientRect().top - go) + 'px';
      if (isMain) { yin.style.textAlign = 'left'; yin.style.verticalAlign = 'top'; yin.style.fontSize = '15px'; yin.style.lineHeight = '25px'; yin.style.color = '#333'; }
    });
    if (isMain) {
      let y9 = scope.querySelector('#yinGan9'), y1 = scope.querySelector('#yinGan1');
      if (y9) { y9.style.verticalAlign = 'bottom'; y9.style.fontSize = '15px'; y9.style.color = '#333'; }
      if (y1) { y1.style.verticalAlign = 'top'; y1.style.fontSize = '15px'; y1.style.color = '#333'; }
    }
  });
}


// ============ 底部按钮功能 ============

// === 自动化验证 ===

// === 调试信息复制 ===

// === 移星换斗 ===
let ZHUAN_ORDER = [1,8,3,4,9,2,7,6];

function applyZhuan(palaces) {
  let old = {};
  for(let g = 1; g <= 9; g++) { old['gong'+g] = {}; let s = palaces['gong'+g]||{}; for(let k in s) old['gong'+g][k] = s[k]; }
  n = ZHUAN_ORDER.length, last = ZHUAN_ORDER[n-1];
  for(let i = n-1; i > 0; i--) {
    let dst = ZHUAN_ORDER[i], src = ZHUAN_ORDER[i-1];
    palaces['gong'+dst] = {}; for(let k in old['gong'+src]) palaces['gong'+dst][k] = old['gong'+src][k];
  }
  palaces['gong1'] = {}; for(let k in old['gong'+last]) palaces['gong1'][k] = old['gong'+last][k];
  // 旋转后重新计算颜色标记
  recalcColors(palaces);
  return palaces;
}

function recalcColors(palaces) {
  let muRules = {2:['癸'], 6:['戊','丙','乙'], 8:['庚','丁','己'], 4:['辛','壬']};
  let xingRules = {3:['戊'], 2:['己'], 8:['庚'], 9:['辛'], 4:['壬','癸']};
  let xmRules = {8:['庚'], 4:['壬']};
  let menKeGong = {'休':[9], '生':[1], '伤':[2,8], '杜':[2,8], '景':[7,6], '死':[1], '惊':[3,4], '开':[3,4]};

  function getMenShort(men) {
    if (!men) return '';
    // 全称→简称 (死门→死)
    let s = (window._MEN_ABBR && window._MEN_ABBR[men]) || '';
    if (s) return s;
    // 已是简称或未知, 直接校验 menKeGong 中是否存在
    if (menKeGong[men]) return men;
    return '';
  }
  for(let g = 1; g <= 9; g++) {
    p = palaces['gong'+g]; if (!p) continue;
    p.isTianXing = false; p.isTianMu = false; p.isDiXing = false; p.isDiMu = false; p.isMenPo = false;
    p.isTianXing1 = false; p.isTianMu1 = false; p.isTianXing2 = false; p.isTianMu2 = false;
    p.isDiXing1 = false; p.isDiMu1 = false; p.isDiXing2 = false; p.isDiMu2 = false;
    // 门迫检查
    let menShort2 = getMenShort(p.men);
    if (menShort2 && menKeGong[menShort2] && menKeGong[menShort2].indexOf(g) >= 0) p.isMenPo = true;
    if (!p.tian) continue;
    // 逐字检查天盘干(含寄干)
    for(let ti = 0; ti < p.tian.length; ti++) {
      let tg = p.tian[ti];
      isM = muRules[g] && muRules[g].indexOf(tg) >= 0;
      isX = xingRules[g] && xingRules[g].indexOf(tg) >= 0;
      isXM = xmRules[g] && xmRules[g].indexOf(tg) >= 0;
      if (ti === 0) {
        if (isXM) { p.isTianXing1 = true; p.isTianMu1 = true; p.isTianXing = true; p.isTianMu = true; }
        else { if (isM) { p.isTianMu1 = true; p.isTianMu = true; } if (isX) { p.isTianXing1 = true; p.isTianXing = true; } }
      } else {
        if (isXM) { p.isTianXing2 = true; p.isTianMu2 = true; p.isTianXing = true; p.isTianMu = true; }
        else { if (isM) { p.isTianMu2 = true; p.isTianMu = true; } if (isX) { p.isTianXing2 = true; p.isTianXing = true; } }
      }
    }
    // 逐字检查地盘干(含寄干)
    if (p.di) {
      for(let di = 0; di < p.di.length; di++) {
        let dg = p.di[di];
        let isM = muRules[g] && muRules[g].indexOf(dg) >= 0;
        let isX = xingRules[g] && xingRules[g].indexOf(dg) >= 0;
        let isXM = xmRules[g] && xmRules[g].indexOf(dg) >= 0;
        if (di === 0) {
          if (isXM) { p.isDiXing1 = true; p.isDiMu1 = true; p.isDiXing = true; p.isDiMu = true; }
          else { if (isM) { p.isDiMu1 = true; p.isDiMu = true; } if (isX) { p.isDiXing1 = true; p.isDiXing = true; } }
        } else {
          if (isXM) { p.isDiXing2 = true; p.isDiMu2 = true; p.isDiXing = true; p.isDiMu = true; }
          else { if (isM) { p.isDiMu2 = true; p.isDiMu = true; } if (isX) { p.isDiXing2 = true; p.isDiXing = true; } }
        }
      }
    }
    if (p.men) {
      let menShort3 = getMenShort(p.men);
      if (menShort3 && menKeGong[menShort3] && menKeGong[menShort3].indexOf(g) >= 0) p.isMenPo = true;
    }
  }
}

// 从 paipan raw 输出提取宫位数据(八神/天干/地盘干/九星/八门/暗干)

// === 心盘渲染 ===

// ============ 共享九宫格渲染 ============
function buildPaipanGrid(palaces, kongGongs, maPosId, agColorFn, opts) {
  opts = opts || {};
  colorSpan = opts.colorSpan || (v => {return v||'';});
  let xpEditGong = opts.xpEditGong || 0;
  let wrapperClass = opts.wrapperClass || '';
  let panClass = opts.panClass || '';
  let wrapperOpen = wrapperClass ? '<div class="'+wrapperClass+'">' : '<div id="content">';
  let panOpen = panClass ? '<TABLE id="pan" class="'+panClass+'">' : '<TABLE id="pan">';
  let ytLeft = wrapperClass ? ' class="yinTable"' : '';
  let ytRight = wrapperClass ? ' class="yinTable right"' : '';
  let mkTag = '<font color=red style=font-size:18px>马</font>';

  function renderPalace(g) {
    p = palaces['gong'+g];
    if (!p) return '<TD></TD>';
    w = (g === 9 || g === 1) ? '34%' : '33%';
    shenAbbr = (window.SHEN_ABBR||{})[p.shen] || p.shen || '';
    xingAbbr = (window.XING_ABBR||{})[p.xing] || p.xing || '';
    menAbbr = (window.MEN_ABBR||{})[p.men] || p.men || '';
    kongMark = kongGongs[g] ? '○' : '';
    let hasState = p.isTianXing || p.isTianMu || p.isDiXing || p.isDiMu;
    muRules2 = {2:['癸'],6:['戊','丙','乙'],8:['庚','丁','己'],4:['辛','壬']};
    xingRules2 = {3:['戊'],2:['己'],8:['庚'],9:['辛'],4:['壬','癸']};
    xmRules2 = {8:['庚'],4:['壬']};
    function spanGan(ch) { let isM=muRules2[g]&&muRules2[g].indexOf(ch)>=0; let isX=xingRules2[g]&&xingRules2[g].indexOf(ch)>=0; let isXM=xmRules2[g]&&xmRules2[g].indexOf(ch)>=0; if(isXM)return'<font color="#009cef">'+ch+'</font>'; if(isX)return'<font color="#b745ce">'+ch+'</font>'; if(isM)return'<font color="#ca610e">'+ch+'</font>'; return ch; }
    function charColor(str) { if(!str)return''; let r=''; for(let ci=0;ci<str.length;ci++)r+=spanGan(str[ci]); return r; }
    let hlt = (xpEditGong === g) ? 'box-shadow:0 0 0 2px #0dc2b3 inset;' : '';
    return '<TD style="width:'+w+';'+hlt+'" id="gong'+g+'" onclick="showPalace('+g+')">' +
      '<div style="display:grid;grid-template-rows:1fr 1fr 1fr;height:100%;position:relative">' +
      '<div class="panItem top" style="align-self:start"><span id="shen'+g+'">'+colorSpan(shenAbbr)+'</span><span id="kong'+KONG_ID[g]+'">'+kongMark+'</span></div>' +
      '<div class="panItem" style="align-self:center"><span id="tian'+g+'">'+charColor(p.tian)+'</span><span id="xing'+g+'">'+colorSpan(xingAbbr)+'</span></div>' +
      '<div class="panItem" style="align-self:end"><span id="di'+g+'">'+charColor(p.di)+'</span><span id="men'+g+'">'+colorSpan(menAbbr,false,false,p.isMenPo)+'</span></div>' +
      '<div class="state" id="stateTian'+g+'" style="position:absolute;top:25%;left:1px;font-size:10px;color:#888"></div>' +
      '<div class="state" id="stateDi'+g+'" style="position:absolute;bottom:26%;left:1px;font-size:10px;color:#888"></div>' +
      '</div></TD>';
  }

  let h = '';
  h += wrapperOpen + '<center><TABLE style="table-layout:fixed;width:100%">' +
    '<TR><TD id="ma1">'+(maPosId==='ma1'?mkTag:'')+'</TD><TD>' +
    '<TABLE style="width:100%"><TR>' +
    '<TD class="waipan1" id="waipan6"></TD><TD class="waipan2" id="waipan7"></TD><TD class="waipan1" id="waipan8"></TD>' +
    '</TR><TR>' +
    '<TD style="width:33%"></TD><TD style="width:34%;text-align:center;vertical-align:bottom;padding-bottom:2px" class="yinGan" id="yinGan9">'+agColorFn(9)+'</TD><TD style="width:33%"></TD>' +
    '</TR></TABLE></TD><TD id="ma2">'+(maPosId==='ma2'?mkTag:'')+'</TD></TR>' +
    '<TR><TD style="padding-left:5px"><TABLE id="leftTable"'+ytLeft+' style="width:50px">' +
    '<TR><TD class="waipan3"><div id="waipan5"></div></TD><TD class="yinGan" id="yinGan4">'+agColorFn(4)+'</TD></TR>' +
    '<TR><TD class="waipan3"><div id="waipan4"></div></TD><TD class="yinGan" id="yinGan3">'+agColorFn(3)+'</TD></TR>' +
    '<TR><TD class="waipan3"><div id="waipan3"></div></TD><TD class="yinGan" id="yinGan8">'+agColorFn(8)+'</TD></TR>' +
    '</TABLE></TD>' +
    '<TD><center>'+panOpen+'<TR>' +
    renderPalace(4) + renderPalace(9) + renderPalace(2) +
    '</TR><TR>' +
    renderPalace(3) + '<TD></TD>' + renderPalace(7) +
    '</TR><TR>' +
    renderPalace(8) + renderPalace(1) + renderPalace(6) +
    '</TR></TABLE></center></TD>' +
    '<TD><TABLE id="rightTable"'+ytRight+' style="width:50px">' +
    '<TR><TD class="yinGan" id="yinGan2">'+agColorFn(2)+'</TD><TD class="waipan4"><div id="waipan9"></div></TD></TR>' +
    '<TR><TD class="yinGan" id="yinGan7">'+agColorFn(7)+'</TD><TD class="waipan4"><div id="waipan10"></div></TD></TR>' +
    '<TR><TD class="yinGan" id="yinGan6">'+agColorFn(6)+'</TD><TD class="waipan4"><div id="waipan11"></div></TD></TR>' +
    '</TABLE></TD></TR>' +
    '<TR><TD id="ma3">'+(maPosId==='ma3'?mkTag:'')+'</TD><TD><TABLE style="width:100%"><TR>' +
    '<TD style="width:33%"></TD><TD style="width:34%;text-align:center;vertical-align:top;padding-top:2px" class="yinGan" id="yinGan1">'+agColorFn(1)+'</TD><TD style="width:33%"></TD>' +
    '</TR><TR>' +
    '<TD class="waipan1" id="waipan2"></TD><TD class="waipan2" id="waipan1"></TD><TD class="waipan1" id="waipan12"></TD>' +
    '</TR></TABLE></TD><TD id="ma4">'+(maPosId==='ma4'?mkTag:'')+'</TD></TR>' +
    '</TABLE></center></div>';
  return h;
}
window.buildPaipanGrid=buildPaipanGrid;

function renderXinpan(useBg) {
  try {
  let palaces = {};
  kongGongs = {};
  maGong = 0;
  let SHEN_LOOKUP = {}; for(let k in SHEN_ABBR) { SHEN_LOOKUP[k] = k; SHEN_LOOKUP[SHEN_ABBR[k]] = k; }
  let XING_LOOKUP = {}; for(let k in XING_ABBR) { XING_LOOKUP[k] = k; XING_LOOKUP[XING_ABBR[k]] = k; }
  let MEN_LOOKUP = {}; for(let k in MEN_ABBR) { MEN_LOOKUP[k] = k; MEN_LOOKUP[MEN_ABBR[k]] = k; }
  [1,2,3,4,6,7,8,9].forEach(g => {
    let d = _xpData[g] || {};
    let tianRaw = (d.tian||'') + (d.tian2||'');
    let diRaw = (d.di||'') + (d.di2||'');
    // diMap/tianMap现已从局推算, 不再从背景补全寄干
    palaces['gong'+g] = {
      shen: SHEN_LOOKUP[d.shen] || d.shen || '',
      tian: tianRaw,
      di: diRaw,
      xing: XING_LOOKUP[d.xing] || d.xing || '',
      men: MEN_LOOKUP[d.men] || d.men || '',
      anGan: useBg && _xpBgPalaces[g] ? (_xpBgPalaces[g].anGan||'') : '',
      isTianXing: false, isTianMu: false, isDiXing: false, isDiMu: false, isMenPo: false,
      isTianXing1: false, isTianMu1: false, isTianXing2: false, isTianMu2: false,
      isDiXing1: false, isDiMu1: false, isDiXing2: false, isDiMu2: false
    };
    // 空亡: 旬首→空亡地支→对应宫位标记◎马星从背景计算
    if (useBg && _xpBgKongWang) {
      if (_xpBgKongWang.length >= 2) {
        kongGongs[ZHI2G[_xpBgKongWang[0]]] = true;
        kongGongs[ZHI2G[_xpBgKongWang[1]]] = true;
      }
    }
    if (useBg && _xpBgMaXing) {
      maGong = ZHI2G[_xpBgMaXing] || 0;
    }
  });
  recalcColors(palaces);
  window._palaces = palaces;
  window._kongGongs = kongGongs;
  MA_POS = {4:'ma1', 9:'ma2', 2:'ma2', 3:'ma3', 7:'ma4', 8:'ma3', 1:'ma4', 6:'ma4'};
  maPosId = MA_POS[maGong] || '';
  // 当前编辑宫位高亮
  window._xpEditGong = window._xpEditGong || 0;

  colorSpan = window._colorSpan || (v => {return v||'';});

  function renderPalace(g) {
    let p = palaces['gong'+g];
    if (!p) return '<TD></TD>';
    let w = (g === 9 || g === 1) ? '34%' : '33%';
    let shenAbbr = SHEN_ABBR[p.shen] || p.shen || '';
    let xingAbbr = XING_ABBR[p.xing] || p.xing || '';
    let menAbbr = MEN_ABBR[p.men] || p.men || '';
    let kongMark = kongGongs[g] ? '○' : '';
    let muRules2 = {2:['癸'],6:['戊','丙','乙'],8:['庚','丁','己'],4:['辛','壬']};
    let xingRules2 = {3:['戊'],2:['己'],8:['庚'],9:['辛'],4:['壬','癸']};
    let xmRules2 = {8:['庚'],4:['壬']};
    function spanGan(ch) { let isM=muRules2[g]&&muRules2[g].indexOf(ch)>=0; let isX=xingRules2[g]&&xingRules2[g].indexOf(ch)>=0; let isXM=xmRules2[g]&&xmRules2[g].indexOf(ch)>=0; if(isXM)return'<font color="#009cef">'+ch+'</font>'; if(isX)return'<font color="#b745ce">'+ch+'</font>'; if(isM)return'<font color="#ca610e">'+ch+'</font>'; return ch; }
    function charColor(str) { if(!str)return''; let r=''; for(let ci=0;ci<str.length;ci++)r+=spanGan(str[ci]); return r; }
    let hlt = (window._xpEditGong === g) ? 'box-shadow:0 0 0 2px #0dc2b3 inset;' : '';
    return '<TD style="width:'+w+';'+hlt+'" id="gong'+g+'" onclick="showPalace('+g+')">' +
      '<div style="display:grid;grid-template-rows:1fr 1fr 1fr;height:100%;position:relative">' +
      '<div class="panItem top" style="align-self:start"><span>'+shenAbbr+'</span><span>'+kongMark+'</span></div>' +
      '<div class="panItem" style="align-self:center"><span>'+charColor(p.tian)+'</span><span>'+xingAbbr+'</span></div>' +
      '<div class="panItem" style="align-self:end"><span>'+charColor(p.di)+'</span><span>'+colorSpan(menAbbr,false,false,p.isMenPo)+'</span></div>' +
      '<div class="state" id="stateTian'+g+'" style="position:absolute;top:25%;left:1px;font-size:10px;color:#888"></div>' +
      '<div class="state" id="stateDi'+g+'" style="position:absolute;bottom:26%;left:1px;font-size:10px;color:#888"></div>' +
      '</div></TD>';
  }

  let mkTag = '<font color=red style=font-size:18px>马</font>';
  let sizhuParts = _xpBgSizhu ? _xpBgSizhu.split(/\s+/) : [];
  let sizhuHTML = '';
  for(let si = 0; si < 4; si++) { let gz = sizhuParts[si] || '—'; sizhuHTML += '<TD class="sizhu">'+(gz.length>=2?gz[0]+'<br>'+gz[1]:gz)+'</TD>'; }
  let wxColor = c => { if(!c)return'#333'; if('甲乙寅卯'.indexOf(c)>=0)return'#2e7d32'; if('丙丁巳午'.indexOf(c)>=0)return'#d50000'; if('戊己辰戌丑未'.indexOf(c)>=0)return'#795548'; if('庚辛申酉'.indexOf(c)>=0)return'#f9a825'; if('壬癸亥子'.indexOf(c)>=0)return'#0d47a1'; return'#333'; };
  let wxSpanBg = s => '<font color="'+wxColor(s)+'">'+(s||'')+'</font>';
  let sizhuColorHTML = '';
  for(let si2 = 0; si2 < 4; si2++) { let gz2 = sizhuParts[si2] || '——'; sizhuColorHTML += '<TD class="sizhu">'+wxSpanBg(gz2[0]||'')+'<br>'+wxSpanBg(gz2[1]||'')+'</TD>'; }
  let dStr = Y+'-'+String(M).padStart(2,'0')+'-'+String(D).padStart(2,'0');
  let nongliStr = _xpBgNongli || '';

  // 暗干颜色函数
  let agColor = g => {
    ag = palaces['gong'+g] ? palaces['gong'+g].anGan : '';
    return ag ? (window._anGanColor|| (v => {return v||'';}))(ag, g) : '';
  };
  // 自动计算值符和值使门
  let G2STAR_ORIG = {1:'蓬',2:'芮',3:'冲',4:'辅',6:'心',7:'柱',8:'任',9:'英'};
  let G2MEN_ORIG  = {1:'休',2:'死',3:'伤',4:'杜',6:'开',7:'惊',8:'生',9:'景'};
  let zhiFuVal = '—', zhiShiVal = '—';
  [1,2,3,4,6,7,8,9].forEach(g => {
    p = palaces['gong'+g];
    if (p && p.shen && SHEN_ABBR[p.shen] === '符') {
      zhiFuVal = '天' + (G2STAR_ORIG[g] || '') + '星';
      zhiShiVal = (G2MEN_ORIG[g] || '') + '门';
    }
  });
  gridHTML = buildPaipanGrid(palaces, kongGongs, maPosId, agColor, {colorSpan: window._colorSpan, xpEditGong: window._xpEditGong||0});
  html =
    '<div id="panHead"><TABLE class="pan" id="headTable">' +
    '<TR><TD id="itemTitle" style="border:none">心盘</TD><TD colspan="4" style="line-height:30px;border:none">点击宫位编辑符号</TD></TR>' +
    '<TR><TD id="dTitle">日期</TD><TD colspan="4">'+dStr+(nongliStr?' ('+nongliStr+')':'')+'</TD></TR>' +
    '<TR><TD>局数</TD><TD colspan="4">'+(_xpCalcJu||_xpBgJu||'心盘')+'</TD></TR>' +
    '<TR id="tdTitle"><TD>旬首</TD><TD>值符</TD><TD>值使</TD><TD>马星</TD><TD>空亡</TD></TR>' +
    '<TR><TD>' + (_xpBgXunShou||'—') + '</TD><TD>' + zhiFuVal + '</TD><TD>' + zhiShiVal + '</TD><TD>' + (_xpBgMaXing||(maGong?'马[宫'+maGong+']':'—')) + '</TD><TD>' + (_xpBgKongWang||'—') + '</TD></TR>' +
    '<TR><TD rowspan=2 style="color:#dead68">四柱</TD>' +
    '<TD class="sizhuTitle">年柱</TD><TD class="sizhuTitle">月柱</TD><TD class="sizhuTitle">日柱</TD><TD class="sizhuTitle">时柱</TD></TR>' +
    '<TR>' + (sizhuParts.length>=4 ? sizhuColorHTML : sizhuHTML) + '</TR>' +
    '</TABLE></div>' +
    gridHTML +
    '<div id="Tip">颜色说明：<span style="color:#ca610e">入墓</span>、<span style="color:#b745ce">击刑</span>、<span style="color:red">门迫</span>、<span style="color:#009cef">刑+墓</span></div>' +
    '<TABLE id="btnTable1"><TR>' +
    '<TD><div class="btn" id="btn1" onclick="showYixing()">移星换斗</div></TD>' +
    '<TD><div class="btn" id="btn3" onclick="tianmenDihu()">天门地户</div></TD>' +
    '<TD><div class="btn" id="btn2" onclick="showState()">长生状态</div></TD>' +
    '</TR></TABLE>' +
    '<div id="yixinghuandouDIV"></div>';

  document.getElementById('panWrap').innerHTML = html;
  document.getElementById('result').style.display = 'block';
  tip.innerHTML = '';
  _renderBottomBar();
  _bindActionButtons();
  addColorStyles();
  setTimeout(_bindActionButtons, 50);
  setTimeout(fixYinGanAlign, 10);
  setTimeout(fixYinGanAlign, 50);
  } catch(e) { _xpErrors.push('心盘渲染错误:'+e.message); console.error(e); }
}

function showYixing() {
  let div = document.getElementById('yixinghuandouDIV');
  if (!div) return;
  if (div.style.display === 'block') { div.style.display = 'none'; div.innerHTML = ''; return; }
  let firstShow = div.style.display !== 'block';
  if (!window._palaces) return;

  let cur = {};
  for(let g = 1; g <= 9; g++) { cur['gong'+g] = {}; let s = window._palaces['gong'+g]||{}; for(let k in s) cur['gong'+g][k] = s[k]; }

  let ag = g => cur['gong'+g] ? cur['gong'+g].anGan || '' : '';
  let yxYin = (g, side) => {
    let a = ag(g); if (!a) return '';
    return '<td style="text-align:'+(side==='left'?'right':'left')+';vertical-align:top;padding-top:22px;font-size:15px;color:#333">'+a+'</td>';
  };
  let cs = window._colorSpan || (v => {return v||'';});
  let sab = window._SHEN_ABBR || {}; let xab = window._XING_ABBR || {}; let mab = window._MEN_ABBR || {};
  let kg = window._kongGongs || {};
  maPosId = window._maPosId || '';
  let mk = p => {return'<font color=red>马</font>';};

  // 逐字颜色函数(移星换斗用, 当场按宫位判断)
  let muYx = {2:['癸'],6:['戊','丙','乙'],8:['庚','丁','己'],4:['辛','壬']};
  let xingYx = {3:['戊'],2:['己'],8:['庚'],9:['辛'],4:['壬','癸']};
  let xmYx = {8:['庚'],4:['壬']};
  let spanYx = (ch, g) => {
    let isM = muYx[g] && muYx[g].indexOf(ch) >= 0;
    let isX = xingYx[g] && xingYx[g].indexOf(ch) >= 0;
    let isXM = xmYx[g] && xmYx[g].indexOf(ch) >= 0;
    if (isXM) return '<font color="#009cef">'+ch+'</font>';
    if (isX) return '<font color="#b745ce">'+ch+'</font>';
    if (isM) return '<font color="#ca610e">'+ch+'</font>';
    return ch;
  };
  let yxColor = (str, g) => {
    if (!str) return '';
    let r = ''; for(let ci = 0; ci < str.length; ci++) r += spanYx(str[ci], g);
    return r;
  };

  let yxCell = g => {
    p = cur['gong'+g]; if (!p || !p.shen) return '<td></td>';
    w = (g === 9 || g === 1) ? '34%' : '33%';
    let km = kg[g] ? '○' : '';
    return '<td style="width:'+w+'">' +
      '<div class="panItem top"><span>'+(sab[p.shen]||p.shen||'')+'</span><span>'+km+'</span></div>' +
      '<div class="panItem"><span>'+yxColor(p.tian,g)+'</span><span>'+cs(xab[p.xing]||p.xing||'')+'</span></div>' +
      '<div class="panItem"><span>'+yxColor(p.di,g)+'</span><span>'+cs(mab[p.men]||p.men||'',false,false,p.isMenPo)+'</span></div></td>';
  };

  let yxAg = g => {
    a = cur['gong'+g] ? cur['gong'+g].anGan || '' : '';
    let anc = window._anGanColor || (v => {return v||'';});
    return anc(a, g);
  };

  html = '';
  for(let t = 1; t <= 7; t++) {
    applyZhuan(cur);
    // 构建与主盘一致的palaces对象
    let rotPalaces = {};
    [4,9,2,3,7,8,1,6].forEach(g => {
      p = cur['gong'+g];
      rotPalaces['gong'+g] = {
        shen: p.shen||'', tian: p.tian||'', di: p.di||'', xing: p.xing||'', men: p.men||'',
        anGan: p.anGan||'', kong: kg[g]||false, ma: false,
        tx: p.isTianXing||false, tm: p.isTianMu||false,
        dx: p.isDiXing||false, dm: p.isDiMu||false, mp: p.isMenPo||false
      };
    });
    let yxAgFn = g => { let a=cur['gong'+g]?cur['gong'+g].anGan||'':''; return a?(window._anGanColor|| (v => {return v||'';}))(a,g):''; };
    gridHTML = buildPaipanGrid(rotPalaces, kg, maPosId, yxAgFn, {colorSpan:cs});
    html += '<div class="tableTitle"><B>【顺转'+t+'宫】</B></div>' + gridHTML;
  }
  div.style.display = 'block';
   div.innerHTML = html;
   if(firstShow) setTimeout(() => { let top=0,el=div; while(el){top+=el.offsetTop;el=el.offsetParent;} window.scrollTo({top:top-60,behavior:'smooth'}); }, 20);
   // 延迟对齐暗干，多次尝试确保渲染完成
  function alignYX() {
	    let contents = div.querySelectorAll('#content');
	    for(let ti = 0; ti < contents.length; ti++) {
	      let ct = contents[ti];
	      // 宫格正方形
	      [4,9,2,3,7,8,1,6].forEach(g => {
	        let el = ct.querySelector('#gong'+g);
	        if (el) { let w = el.getBoundingClientRect().width; if (w > 0) el.style.height = w + 'px'; }
	      });
	      // 行高同步
	      let yxTR = ct.querySelectorAll('#pan tr');
	      let yL = ct.querySelectorAll('#rightTable tr');
	      let yR = ct.querySelectorAll('#leftTable tr');
	      for(let ri = 0; ri < 3; ri++) {
	        if (!yxTR[ri]) continue;
	        let rH = yxTR[ri].getBoundingClientRect().height;
	        if (rH > 0) {
	          if (yL[ri]) yL[ri].style.height = rH + 'px';
	          if (yR[ri]) yR[ri].style.height = rH + 'px';
	        }
	      }
	    }
	  }
	  setTimeout(alignYX, 10);
}

// === 天门地户 ===
let _tmdhShow = false;
let _tmdhRaw = null; // 缓存在doPan中预生成的tmdh版paipan输出

function tianmenDihu() {
  try{
  if (_shenShow) { _shenShow = 0; clearWaipan(); }
  _tmdhShow = !_tmdhShow;
  if (!window._palaces) return;

  // 天门地户: 月将+建除均基于时支, 将月将加在时支之上顺排
  let JIANCHU = ['建','除','满','平','定','执','破','危','成','收','开','闭'];
  let ZHI2WP = {'子':1,'丑':2,'寅':3,'卯':4,'辰':5,'巳':6,'午':7,'未':8,'申':9,'酉':10,'戌':11,'亥':12};
  let YUEJIANG_FULL = {'子':'神后子','丑':'大吉丑','寅':'功曹寅','卯':'太冲卯','辰':'天罡辰','巳':'太乙巳','午':'胜光午','未':'小吉未','申':'传送申','酉':'从魁酉','戌':'河魁戌','亥':'登明亥'};
  let ZHI12 = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

  let raw = window._raw || '';

  // 获取时支 (从四柱时柱)
  let shiZhi = '子';
  if (window._sizhuObj && window._sizhuObj.h) {
    shiZhi = window._sizhuObj.h.ganZhi[1];
  } else {
    let szMatch = raw.match(/四柱[：:]\s*(?:\S+\s+){3}(\S+)/);
    if (szMatch) { let sz = szMatch[1]; shiZhi = sz.length>=2 ? sz[1] : '子'; }
  }

  // 获取月将
  let yueJiang = (raw.match(/月将[：:]\s*(\S+)/) || ['','子'])[1];
  let mjIdx = ZHI12.indexOf(yueJiang);
  if (mjIdx < 0) mjIdx = 0;

  // 时支→waipan位置, 月将和建除都用此时支作为起点
  let shiWp = ZHI2WP[shiZhi] || 1;


  let wpVertical = {3:true,4:true,5:true,9:true,10:true,11:true};

  for(let wp = 1; wp <= 12; wp++) {
    let el2 = document.getElementById('waipan'+wp);
    if (!el2) continue;
    if (_tmdhShow) {
      // 月将顺排: 时支位起月将, 顺时针
      let offsetMJ = (wp - shiWp + 12) % 12;
      let zhiIdx = (mjIdx + offsetMJ) % 12;
      let zhiAtPos = ZHI12[zhiIdx];
      let fullName = YUEJIANG_FULL[zhiAtPos] || zhiAtPos;
      // 建除: 时支起建, 顺时针
      let jc = JIANCHU[offsetMJ];
      if (wpVertical[wp]) {
        el2.innerHTML = fullName.split('').join('<br>')+'<br><font color="#0dc2b3">'+jc+'</font>';
      } else {
        el2.innerHTML = fullName+'<font color="#0dc2b3">'+jc+'</font>';
        el2.style.whiteSpace = 'nowrap';
      }
      el2.style.fontSize = '12px';
      el2.style.lineHeight = '15px';
    } else {
      el2.innerHTML = '';
      el2.style.fontSize = '';
      el2.style.lineHeight = '';
      el2.style.whiteSpace = '';
    }
  }
  if(_tmdhShow) setTimeout(() => {
    let el3 = document.getElementById('content');
    let top = 0;
    while(el3) { top += el3.offsetTop; el3 = el3.offsetParent; }
    window.scrollTo({top: top - 60, behavior: 'smooth'});
  }, 600);
  }catch(e){tip.innerHTML='<span style=color:red>天门地户错误:'+e.message+'</span>';}
}

// === 长生状态 ===
// 天干在8宫(去中5)的十二长生状态, 双地支宫显示两个状态
// 宫序: 巽4,离9,坤2,震3,兑7,艮8,坎1,乾6
// 地支: 辰巳,午,未申,卯,酉,丑寅,子,戌亥
// 天干在8宫的十二长生状态(双地支宫合并显示)
let CHANGSHENG = {
  '甲': ['衰病','死','墓绝','帝旺','胎','临冠','沐浴','养长'],
  '乙': ['冠沐','长生','养胎','临官','绝','衰旺','病','墓养'],
  '丙': ['冠临','帝旺','衰病','沐浴','死','长生','胎','墓绝'],
  '丁': ['衰旺','临官','沐冠','病','长生','墓死','绝','养胎'],
  '戊': ['冠临','帝旺','衰病','沐浴','死','长生','胎','墓绝'],
  '己': ['衰旺','临官','沐冠','病','长生','墓死','绝','养胎'],
  '庚': ['长生','沐浴','冠临','胎','帝旺','墓绝','死','衰病'],
  '辛': ['墓死','病','衰旺','绝','临官','养胎','长生','冠沐'],
  '壬': ['墓绝','胎','养长','死','沐浴','病衰','帝旺','临冠'],
  '癸': ['养胎','绝','墓死','长生','死','冠临','临官','帝衰']
};

// 长生状态索引:宫号→CHANGSHENG数组位置
let CS_IDX = {4:0,9:1,2:2,3:3,7:4,8:5,1:6,6:7};
let _stateShowing = false;
function showState() {
  if (!window._palaces) return;
  _stateShowing = !_stateShowing;
  for(let g = 1; g <= 9; g++) {
    if (g === 5) continue;
    let st = document.getElementById('stateTian'+g);
    let sd = document.getElementById('stateDi'+g);
    let idx = CS_IDX[g];
    if (!_stateShowing) { if (st) st.innerHTML = ''; if (sd) sd.innerHTML = ''; continue; }
    p = window._palaces['gong'+g];
    if (!p || !p.tian) continue;
    let gan = p.tian[0];
    let states = CHANGSHENG[gan];
    if (states && idx !== undefined && st) st.innerHTML = '<span style="font-size:10px;color:#666">'+states[idx]+'</span>';
    if (p.di && sd) {
      let dgan = p.di[0];
      let dStates = CHANGSHENG[dgan];
      if (dStates && idx !== undefined) sd.innerHTML = '<span style="font-size:10px;color:#666">'+dStates[idx]+'</span>';
    }
  }
}

// === 上局/下局 (直接切换时辰) ===
function panChange(dir) {
  let d = new Date(Y, M-1, D, hr, mn, 0);
  if (panType === 2) {
    // 刻盘模式: 切换一个刻(10分钟)
    d.setMinutes(d.getMinutes() + dir * 10);
  } else {
    // 其他模式: 切换一个时辰(2小时)
    d.setHours(d.getHours() + dir * 2);
  }
  Y = d.getFullYear(); M = d.getMonth() + 1; D = d.getDate();
  hr = d.getHours(); mn = d.getMinutes();
  selY.value = Y; selM.value = M; selD.value = D; selH.value = hr; selI.value = mn;
  adjDays();
  // 重置自选局为自动
  selZxj.value = 0;
  lbl = document.getElementById('zxjLabel');
  if (lbl) lbl.innerHTML = '';
  doPan();
}

// === 年月日时神将 ===
let SHENJIANG_NAMES = ['青龙','明堂','天刑','朱雀','金匮','天德','白虎','玉堂','天牢','玄武','司令','勾陈'];
let SHENJUE = [9,11,1,3,5,7,9,11,1,3,5,7];
let _shenShow = 0; // 0=无, 1=年, 2=月, 3=日, 4=时

function shen12(type) {
  // 互斥: 如果天门地户在显示，先关闭
  if (_tmdhShow) tianmenDihu();
  // 如果已显示同类型则关闭
  if (_shenShow === type) { _shenShow = 0; clearWaipan(); return; }
  _shenShow = type;

  if (!window._raw) return;
  let ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  let raw = window._raw;
  let sizhuMatch = (raw.match(/四柱:\s*(.*?)(?:<br|\n)/) || ['',''])[1];
  sizhuMatch = sizhuMatch.replace(/<[^>]*>/g, '').replace(/[\s　]+/g, ' ').trim();
  let pillars = sizhuMatch.split(' ').filter(Boolean);
  let zhiArr = [];
  for(let i = 0; i < pillars.length; i++) zhiArr.push(pillars[i].length >= 2 ? pillars[i][1] : '');
  let zhiChar = zhiArr[type-1] || '子';
  let zhiIdx = ZHI.indexOf(zhiChar); if (zhiIdx < 0) zhiIdx = 0;
  let startGong = SHENJUE[zhiIdx];

  // 12神将按waipan顺序排列(从起始宫位顺时针)
  let waipanOrder = [1,2,3,4,5,6,7,8,9,10,11,12];
  // 起始宫位对应的waipan起始索引
  let startIdx = (startGong - 1 + 12) % 12;
  for(let i = 0; i < 12; i++) {
    let wpIdx = ((startIdx + i) % 12) + 1;
    el = document.getElementById('waipan'+wpIdx);
    if (el) {
      el.innerHTML = SHENJIANG_NAMES[i];
      el.style.fontSize = '12px';
      el.style.lineHeight = '15px';
      el.style.color = '#333';
    }
  }
}

function clearWaipan() {
  for(let wp = 1; wp <= 12; wp++) {
    el = document.getElementById('waipan'+wp);
    if (el) { el.innerHTML = ''; el.style.fontSize = ''; el.style.lineHeight = ''; el.style.color = ''; }
  }
}

// ============ 辅助功能 ============
function editTitle() {
  let el = document.getElementById('title');
  if (el.getAttribute('contenteditable') === 'true') {
    el.setAttribute('contenteditable', 'false');
    el.style.border = '';
    el.style.padding = '';
  } else {
    el.setAttribute('contenteditable', 'true');
    el.style.border = '1px dashed #ccc';
    el.style.padding = '2px 6px';
    el.focus();
  }
}

// === 持久存储: localStorage + Tauri文件(PC) + 导出/导入(Android通用) ===
function _storagePath() {
  if (window.__TAURI__) return STORAGE_DIR+'/'+STORAGE_FILE;
  return STORAGE_FILE;
}

async function _fsWrite(data) {
  if (!window.__TAURI__) return;
  try {
    const {writeTextFile, mkdir, exists} = window.__TAURI__.fs;
    const {documentDir} = window.__TAURI__.path;
    const dir = await documentDir() + STORAGE_DIR;
    if (!(await exists(dir))) await mkdir(dir, {recursive:true});
    await writeTextFile(dir+'/'+STORAGE_FILE, data);
  } catch(e) { console.error('fs write:', e); }
}

async function _fsRead() {
  if (!window.__TAURI__) return null;
  try {
    const {readTextFile, exists} = window.__TAURI__.fs;
    const {documentDir} = window.__TAURI__.path;
    const fp = await documentDir() + STORAGE_DIR + '/' + STORAGE_FILE;
    if (!(await exists(fp))) return null;
    return await readTextFile(fp);
  } catch(e) { console.error('fs read:', e); return null; }
}

async function _syncToFile() {
  let data = localStorage.getItem(STORAGE_KEY) || '[]';
  await _fsWrite(data);
}

async function _syncFromFile() {
  let txt = await _fsRead();
  if (txt) {
    try {
      let d = JSON.parse(txt);
      if (Array.isArray(d)) { localStorage.setItem(STORAGE_KEY, txt); return d; }
    } catch(e) {}
  }
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
}

// === 底部滑出面板 ===
function _ensureSheet() {
  let overlay = document.getElementById('sheetOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sheetOverlay';
    overlay.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.3);z-index:200;transition:opacity 0.25s';
    overlay.onclick = _closeSheet;
    document.body.appendChild(overlay);
  }
  let sheet = document.getElementById('bottomSheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'bottomSheet';
    sheet.style.cssText = 'position:fixed;bottom:0;left:50%;transform:translateX(-50%) translateY(100%);width:100%;max-width:600px;max-height:70vh;background:#fff;border-radius:14px 14px 0 0;z-index:10000;overflow-y:auto;transition:transform 0.3s ease;padding-bottom:env(safe-area-inset-bottom,0)';
    document.body.appendChild(sheet);
  }
  return {overlay, sheet};
}

function _openSheet(html) {
  let {overlay, sheet} = _ensureSheet();
  sheet.innerHTML = html;
  overlay.style.display = 'block';
  overlay.style.opacity = '0';
  sheet.style.display = 'block';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      sheet.style.transform = 'translateX(-50%) translateY(0)';
    });
  });
}

function _closeSheet() {
  let overlay = document.getElementById('sheetOverlay');
  let sheet = document.getElementById('bottomSheet');
  if (overlay) { overlay.style.opacity = '0'; setTimeout(() => {overlay.style.display='none';}, 250); }
  if (sheet) { sheet.style.transform = 'translateX(-50%) translateY(100%)'; setTimeout(() => {sheet.style.display='none';}, 300); }
}

function savePan() {
  try {
  let panWrap = document.getElementById('panWrap');
  if (!panWrap) return;
  let titleEl = document.getElementById('title');
  let defaultName = (titleEl ? titleEl.innerText : '') || '';
  let h = '<div style="padding:16px 16px 8px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
    '<span style="font-weight:bold;font-size:16px">保存排盘</span>' +
    '<span id="sheetCloseX" style="cursor:pointer;font-size:20px;color:#999">&times;</span>' +
    '</div>' +
    '<div style="margin-bottom:8px"><span style="font-size:12px;color:#999">输入事项</span></div>' +
    '<input id="sheetSaveName" placeholder="请输入事项名称" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;outline:none;box-sizing:border-box" value="'+defaultName.replace(/"/g,'&quot;')+'" autofocus>' +
    '<div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">' +
    '<span id="sheetCancelBtn" style="cursor:pointer;padding:8px 16px;border-radius:8px;color:#666;font-size:14px">取消</span>' +
    '<span id="sheetSaveBtn" style="cursor:pointer;padding:8px 24px;border-radius:8px;background:#0dc2b3;color:#fff;font-size:14px">保存</span>' +
    '</div></div>';
  _openSheet(h);
  // 绑定事件
  let closeX = document.getElementById('sheetCloseX');
  let cancelBtn = document.getElementById('sheetCancelBtn');
  let saveBtn = document.getElementById('sheetSaveBtn');
  if (closeX) closeX.onclick = _closeSheet;
  if (cancelBtn) cancelBtn.onclick = _closeSheet;
  if (saveBtn) saveBtn.onclick = _doSave;
  setTimeout(() => {
    let inp = document.getElementById('sheetSaveName');
    if (inp) { inp.focus(); inp.select(); }
  }, 350);
  }catch(e){}
}

function _doSave() {
  try {
  let inp = document.getElementById('sheetSaveName');
  let newTitle = (inp ? inp.value : '') || '未命名';
  let panWrap = document.getElementById('panWrap');
  if (!panWrap) { _closeSheet(); return; }
  let panHTML = panWrap.innerHTML;
  let timeStr = document.getElementById('dateTime') ? document.getElementById('dateTime').innerText : '';
  let params = {year:Y, month:M, day:D, hour:hr, minute:mn, panType:panType};
  if (panType === 4) {
    let sdEl=document.getElementById('selShanXiangDeg'), syEl=document.getElementById('selShanXiangYear');
    params._xjuDegSaved = _xjuDegSaved || (sdEl?sdEl.value:'');
    params._xjuYearSaved = _xjuYearSaved || (syEl?syEl.value:'');
    params._sxYear = syEl ? syEl.value : Y;
  }
  let record = {
    title: newTitle.trim(), time: timeStr, mode: _saveMode,
    params: params, html: panHTML,
    date: new Date().toISOString(),
    zhiFu: window._palaces ? (() => {for(let g in window._palaces){let p=window._palaces['gong'+g];if(p&&p.shen&&window.SHEN_ABBR&&window.SHEN_ABBR[p.shen]==='符')return{shen:p.shen,star:p.xing,men:p.men,gong:parseInt(g)};}return null;})() : null
  };
  if (panType === 3) {
    record._xpData = JSON.parse(JSON.stringify(window._xpData || {}));
    record._xpBgSizhu = window._xpBgSizhu || '';
    record._xpBgPalaces = window._xpBgPalaces || {};
    record._xpCalcJu = window._xpCalcJu || '';
    record._xpBgKongWang = window._xpBgKongWang || '';
    record._xpBgMaXing = window._xpBgMaXing || '';
    record._xpBgXunShou = window._xpBgXunShou || '';
  }
  try {
    let saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    saved.unshift(record);
    if (saved.length > 100) saved = saved.slice(0, 100);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    _syncToFile();
    _renderBottomBar();
    _closeSheet();
  } catch(e) { alert('保存失败: '+e.message); }
  } catch(e) { alert('_doSave错误: '+e.message); }
}

function showSavedList() {
  let sheet = document.getElementById('bottomSheet');
  if (sheet && sheet.style.display === 'block') { _closeSheet(); return; }
  _renderHistorySheet();
}

function _renderHistorySheet() {
  try {
    let saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    let modeLabels = {shi:'时盘', ke:'刻盘', xin:'心盘', shanxiang:'山向', chuanren:'穿壬'};
    let filtered = _saveMode ? saved.filter(r => r.mode === _saveMode) : saved;
    let h = '<div style="padding:16px 16px 0">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
      '<span style="font-weight:bold;font-size:16px">排盘历史 <span style="font-size:11px;color:#999">('+filtered.length+'条'+(filtered.length!==saved.length?'/共'+saved.length+'条':'')+')</span></span>' +
      '<span style="display:flex;gap:10px;align-items:center">' +
      '<span id="sheetExport" style="cursor:pointer;color:#0dc2b3;font-size:12px">导出</span>' +
      '<span id="sheetImport" style="cursor:pointer;color:#0dc2b3;font-size:12px">导入</span>' +
      '<span id="sheetCloseX2" style="cursor:pointer;font-size:20px;color:#999">&times;</span>' +
      '</span></div>';
    h += '<div id="sheetFilters" style="padding:6px 0;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid #f0f0f0;margin-bottom:4px">';
    let allModes = [{k:'',v:'全部'},{k:'shi',v:'时盘'},{k:'ke',v:'刻盘'},{k:'xin',v:'心盘'},{k:'shanxiang',v:'山向'},{k:'chuanren',v:'穿壬'}];
    allModes.forEach(m => {
      let isActive = _saveMode === m.k || (!m.k && !_saveMode);
      h += '<span class="sheetFilterBtn" data-mode="'+m.k+'" style="cursor:pointer;padding:2px 8px;border-radius:10px;font-size:12px;'+(isActive?'background:#0dc2b3;color:#fff':'background:#f0f0f0;color:#666')+'">'+m.v+'</span>';
    });
    h += '</div></div>';
    if (!filtered.length) {
      h += '<div style="padding:30px;color:#999;text-align:center">暂无记录</div>';
    } else {
      h += '<div style="padding:2px 16px 0;font-size:11px;color:#aaa;text-align:center">点击记录加载排盘</div>';
      h += '<div id="sheetHistoryList" style="padding:0 16px">';
      filtered.forEach((r, i) => {
        let origIdx = saved.indexOf(r);
        let modeLabel = modeLabels[r.mode] || r.mode || '时盘';
        let d = r.date ? new Date(r.date) : null;
        let dStr = d ? (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')) : '';
        h += '<div style="padding:10px 0;display:flex;align-items:center;gap:8px;border-bottom:1px solid #f5f5f5;font-size:14px">' +
          '<span style="font-size:10px;color:#fff;background:#0dc2b3;padding:1px 5px;border-radius:3px;flex-shrink:0">'+modeLabel+'</span>' +
          '<span class="sheetLoadBtn" data-idx="'+origIdx+'" style="flex:1;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+r.title+'</span>' +
          '<span style="font-size:10px;color:#aaa;flex-shrink:0">'+dStr+'</span>' +
          '<span class="sheetDelBtn" data-idx="'+origIdx+'" style="color:#ccc;cursor:pointer;font-size:18px;flex-shrink:0;padding:0 4px" title="删除">&times;</span></div>';
      });
      h += '<div style="padding:12px 0;text-align:center"><span id="sheetDelAllBtn" style="cursor:pointer;color:#e74c3c;font-size:12px">删除 '+(_saveMode?(modeLabels[_saveMode]||_saveMode):'全部')+' 记录</span></div>';
      h += '</div>';
    }
    _openSheet(h);
    // 绑定事件
    let cx = document.getElementById('sheetCloseX2');
    let ex = document.getElementById('sheetExport');
    let im = document.getElementById('sheetImport');
    let da = document.getElementById('sheetDelAllBtn');
    if (cx) cx.onclick = _closeSheet;
    if (ex) ex.onclick = _exportJSON;
    if (im) im.onclick = _importJSON;
    if (da) da.onclick = delChecked;
    // 过滤标签
    let fbs = document.querySelectorAll('#sheetFilters .sheetFilterBtn');
    fbs.forEach(fb => {
      fb.onclick = function() { _filterHistory(this.getAttribute('data-mode')||''); };
    });
    // 加载按钮
    let lbs = document.querySelectorAll('#sheetHistoryList .sheetLoadBtn');
    lbs.forEach(lb => {
      lb.onclick = function() { loadSaved(parseInt(this.getAttribute('data-idx')||'0')); };
    });
    // 删除按钮: confirm确认
    let dbs = document.querySelectorAll('#sheetHistoryList .sheetDelBtn');
    dbs.forEach(db => {
      db.onclick = function() {
        if (confirm('确认删除这条记录？')) {
          _delRecord(parseInt(this.getAttribute('data-idx')||'0'));
        }
      };
    });
  } catch(e) { _openSheet('<div style="padding:20px;color:#999">加载失败</div>'); }
}

function _delRecord(idx) {
  let sl = JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
  sl.splice(idx, 1);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sl));
  _syncToFile();
  _renderBottomBar();
  _renderHistorySheet();
}

function _filterHistory(mode) {
  _saveMode = mode || '';
  _renderHistorySheet();
}

function loadSaved(i) {
  try {
    let saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    let r = saved[i];
    if (!r) return;
    // 恢复时间选择器
    let p = r.params || {};
    if (p.year) { Y=p.year; selY.value=p.year; }
    if (p.month!=null) { M=p.month; selM.value=p.month; adjDays(); }
    if (p.day) { D=p.day; selD.value=p.day; }
    if (p.hour!=null) { hr=p.hour; selH.value=p.hour; }
    if (p.minute!=null) { mn=p.minute; selI.value=p.minute; }
    // 自动切换到对应模块
    let modeMap = {shi:1, ke:2, xin:3, shanxiang:4, chuanren:5};
    let targetType = modeMap[r.mode] || 1;
    if (targetType !== panType) {
      let radio = document.querySelector('input[name="panType"][value="'+targetType+'"]');
      if (radio) { radio.checked = true; setPanType(targetType); }
    }
    // 恢复山向年/度
    if (r.mode === 'shanxiang') {
      _xjuDegSaved = p._xjuDegSaved || '';
      _xjuYearSaved = p._xjuYearSaved || '0';
      let syEl=document.getElementById('selShanXiangYear'), sdEl=document.getElementById('selShanXiangDeg');
      if (syEl) syEl.value = p._sxYear || p.year || Y;
      if (sdEl && _xjuDegSaved) sdEl.value = _xjuDegSaved;
    }
    document.getElementById('panWrap').innerHTML = r.html;
    document.getElementById('result').style.display = 'block';
    _closeSheet();
    let yhd = document.getElementById('yixinghuandouDIV');
    if (yhd) yhd.style.display = 'none';
    if (r.mode === 'xin' && r._xpData) {
      window._xpData = JSON.parse(JSON.stringify(r._xpData));
      window._xpBgSizhu = r._xpBgSizhu || '';
      window._xpBgPalaces = r._xpBgPalaces || {};
      window._xpCalcJu = r._xpCalcJu || '';
      window._xpBgKongWang = r._xpBgKongWang || '';
      window._xpBgMaXing = r._xpBgMaXing || '';
      window._xpBgXunShou = r._xpBgXunShou || '';
      window._xpOpLog = [];
      window._xpOpSeq = 0;
      document.getElementById('xinpanPanel').style.display = '';
    }
    if (r.mode) _saveMode = r.mode;
    _renderBottomBar();
    _bindActionButtons();
    setTimeout(fixYinGanAlign, 50);
  } catch(e) { console.error(e); }
}

function delChecked() {
  if (!confirm('确认删除当前模块的全部记录？此操作不可撤销。')) return;
  let saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  saved = saved.filter(r => r.mode !== _saveMode);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  _syncToFile();
  _renderBottomBar();
  _renderHistorySheet();
}

async function _exportJSON() {
  let data = localStorage.getItem(STORAGE_KEY) || '[]';
  if (window.__TAURI__) {
    try {
      const {writeTextFile, mkdir, exists} = window.__TAURI__.fs;
      const {downloadDir} = window.__TAURI__.path;
      const dir = await downloadDir() + STORAGE_DIR;
      if (!(await exists(dir))) await mkdir(dir, {recursive:true});
      let ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
      await writeTextFile(dir+'/qimen_'+ts+'.json', data);
      alert('已导出到下载目录');
    } catch(e) { _downloadBlob(data); }
  } else {
    _downloadBlob(data);
  }
}

function _downloadBlob(data) {
  let blob = new Blob([data], {type:'application/json'});
  let a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'qimen_backup_'+new Date().toISOString().slice(0,10)+'.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

function _importJSON() {
  let inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
  inp.onchange = function() {
    let file = this.files[0];
    if (!file) return;
    let reader = new FileReader();
    reader.onload = function() {
      try {
        let d = JSON.parse(reader.result);
        if (!Array.isArray(d)) throw new Error('格式错误');
        let existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        let merged = d.concat(existing);
        if (merged.length > 200) merged = merged.slice(0, 200);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        _syncToFile();
        _renderBottomBar();
        showSavedList();
      } catch(e) { alert('导入失败: '+e.message); }
    };
    reader.readAsText(file);
  };
  inp.click();
}

// 修复动态innerHTML中的onclick: 用事件委托绑定
function _bindActionButtons() {
  // 底部操作按钮
  let btns = {
    '#btn1': showYixing, '#btn2': showState, '#btn3': tianmenDihu,
    '#btn4': ()=>shen12(1), '#btn5': ()=>shen12(2), '#btn6': ()=>shen12(3), '#btn7': ()=>shen12(4),
    '#btnXiangJu': ()=>{try{toggleXiangJu();}catch(e){tip.style.display='block';tip.innerHTML='<span style=color:red>选局错误:'+e.message+'</span>';}},
    '#preBtn': ()=>panChange(-1), '#nextBtn': ()=>panChange(1)
  };
  for (let id in btns) {
    let el = document.querySelector(id);
    if (el && !el._bound) { el.onclick = btns[id]; el._bound = true; }
  }
  // 宫位点击 (穿壬不绑定)
  if (panType !== 5) {
    let gongs = document.querySelectorAll('[id^="gong"]');
    gongs.forEach(g => {
      if (!g._bound) { let gn = parseInt(g.id.replace('gong','')); if (gn) g.onclick = ()=>showPalace(gn); g._bound = true; }
    });
  }
  // 标题编辑
  let titleSpans = document.querySelectorAll('#title,[onclick*="editTitle"]');
  titleSpans.forEach(s => { if (!s._bound) { s.onclick = editTitle; s._bound = true; } });
  // 山向相关
  let xjBtn = document.querySelector('[onclick*="refreshXiangJu"]');
  if (xjBtn && !xjBtn._bound) { xjBtn.onclick = refreshXiangJu; xjBtn._bound = true; }
  let xjChg = document.querySelector('[onclick*="toggleXiangJu"]');
  if (xjChg && !xjChg._bound) { xjChg.onclick = toggleXiangJu; xjChg._bound = true; }
}

// === 底部固定 Bar ===
function _renderBottomBar() {
  try {
    let bar = document.getElementById('bottomBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'bottomBar';
      bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;height:44px;background:#fff;border-top:1px solid #e0e0e0;display:flex;align-items:center;justify-content:space-around;z-index:9999;padding-bottom:env(safe-area-inset-bottom,0);max-width:600px;margin:0 auto;pointer-events:auto';
      let md = document.getElementById('mainDIV') || document.body;
      if (md) md.appendChild(bar);
    }
    let saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    let cnt = _saveMode ? saved.filter(r => r.mode === _saveMode).length : saved.length;
    bar.innerHTML = '';
    let hb = document.createElement('span');
    hb.id = 'barHistoryBtn';
    hb.style.cssText = 'cursor:pointer;color:#666;font-size:14px;display:flex;align-items:center;gap:4px';
    hb.innerHTML = '<span style="font-size:16px">&#128196;</span>排盘历史'+(cnt>0?' ('+cnt+')':'');
    hb.addEventListener('click', function(e){e.stopPropagation();showSavedList();});
    let sb = document.createElement('span');
    sb.id = 'barSaveBtn';
    sb.style.cssText = 'cursor:pointer;color:#0dc2b3;font-size:14px;display:flex;align-items:center;gap:4px';
    sb.innerHTML = '<span style="font-size:16px">&#128190;</span>保存';
    sb.addEventListener('click', function(e){e.stopPropagation();savePan();});
    bar.appendChild(hb);
    bar.appendChild(sb);
  } catch(e) { console.error('bottomBar:', e); }
}

// Tauri启动时从文件同步记录
(async function _initStorage() {
  await _syncFromFile();
})();

window.savePan = savePan;
window.showSavedList = showSavedList;
window.loadSaved = loadSaved;
window.delChecked = delChecked;
window._exportJSON = _exportJSON;
window._importJSON = _importJSON;
window._filterHistory = _filterHistory;
window._renderHistoryPanel = _renderHistoryPanel;

// === 宫位详解数据 ===

// === 宫位详解数据 ===
let GONG_INFO = {
  6:{name:'乾卦', wx:'金', key:'天/大事/领导/事业/丈夫/权威/能力', desc:'乾为天，代表高贵、权威、大事。临乾卦之事不小，人有领导力，但也易心高气傲。疾病主头颈心脑血管。'},
  1:{name:'坎卦', wx:'水', key:'波折/困难/智慧/奔波/烦恼', desc:'坎为水，主波折困难，需迂回处理。有智慧但要防忧患。健康主肾、泌尿生殖系统、耳。'},
  8:{name:'艮卦', wx:'土', key:'停止/阻碍/稳重/保守/子孙', desc:'艮为山，主停止阻碍。宜维稳守成，不宜冒进。健康主脾胃、腿脚、关节。'},
  3:{name:'震卦', wx:'木', key:'震动/变化/冲动/积极/发展', desc:'震为雷，主动态变化。有冲劲但不稳定，易大起大落。健康主肝胆、足部、神经。'},
  4:{name:'巽卦', wx:'木', key:'犹豫/传播/渗透/技术/不实', desc:'巽为风，主犹豫不决、信息传播。想法多但难落地。健康主神经、呼吸系统、肝胆。'},
  9:{name:'离卦', wx:'火', key:'美丽/热烈/空虚/分离/文采', desc:'离为火，外实内虚。外表光鲜但需防虚假。美女多出离卦。健康主心脑血管、眼。'},
  2:{name:'坤卦', wx:'土', key:'包容/多/慢/母亲/厚重/忧虑', desc:'坤为地，什么都多。包容万物但也拖累多。婚姻怕落坤宫(多婚)。健康主脾胃、腹部。'},
  7:{name:'兑卦', wx:'金', key:'口舌/缺陷/争辩/喜悦/少女', desc:'兑为泽，主口舌是非官司。有缺陷需多说解决。健康主口、肺、呼吸系统。'}
};
let SHEN_INFO = {
  '值符':{key:'高贵/名牌/领导/核心', desc:'天乙之神，八神之首。代表名贵高档、有领导力、逢凶化吉。物象：国旗、符咒、名贵品。'},
  '螣蛇':{key:'虚诈/变化/缠绕/灵异/失眠', desc:'虚诈之神。主欺骗反复、小人缠绕。影响神经睡眠。物象：藤蔓、绳索、花花绿绿衣物。'},
  '太阴':{key:'庇护/策划/隐藏/隐私/细腻', desc:'庇护之神。主暗中策划、心思细腻。代表隐私、雕刻、玉器。也主祖坟祖宅。'},
  '六合':{key:'合作/婚姻/中介/多/牵连', desc:'护卫之神。主合作婚姻、人缘好。问感情必看六合。临之什么都多，牵连广。'},
  '白虎':{key:'阻力/权威/冲动/疾病/伤灾', desc:'凶煞之神。最大阻碍和竞争者。有能力但易怒冲动。疾病主肿瘤重症。物象：刀剑、武器。'},
  '玄武':{key:'偷盗/玄学/眩晕/不明确/谎言', desc:'偷盗之神。主玄学风水、晕乎不落地。代表偷盗、被骗、不明确。物象：风水物、悬挂物。'},
  '九地':{key:'稳固/低调/陈旧/迟缓/牢狱', desc:'坚牢之神。主稳定低调、旧物、接地气。发展慢但踏实。物象：地窖、旧物、地毯。'},
  '九天':{key:'高大/显眼/远行/好高骛远/飞机', desc:'威悍之神。主高大显眼、志向远大。但易不切实际。代表飞机、高处之物、远行。'}
};
let XING_INFO = {
  '天蓬':{key:'魅力/胆大/偏财/贪色', desc:'魅力之星。胆大好色贪财，能得大财也能失大财。代表冒险、赌博、蓬勃发展。'},
  '天任':{key:'压力/任劳任怨/老实/担当', desc:'任劳任怨，压力大但有担当。代表农民、台阶、桥、驼背。踏实稳定但倔强。'},
  '天冲':{key:'快速/冲动/闯劲/鲁莽', desc:'主快速冲动。敢闯敢干，适合开拓。脾气急易冲突。代表火箭、运动员。'},
  '天辅':{key:'文化/辅佐/文昌/教师', desc:'文昌之星。代表文化教育、辅佐二把手。小孩学业看天辅。物象：花草、地毯。'},
  '天英':{key:'英俊/热情/暴躁/漂亮', desc:'代表英俊漂亮、热情急躁。爱打扮要面子。代表客厅、明亮物品。'},
  '天芮':{key:'问题/疾病/学习/神佛', desc:'问题之星、病星。临之有问题。也代表学习和学校、神佛。物象：神像、菩萨。'},
  '天柱':{key:'骨干/破坏/口才/中流砥柱', desc:'顶梁柱之星。能镇场也能破坏。代表口才、脊柱。物象：柱子、音响。'},
  '天心':{key:'中心/管理/凝聚力/西医', desc:'中心之星。有管理能力和凝聚力。代表西医西药、心脏。物象：圆形物品、珠宝。'}
};
let MEN_INFO = {
  '休门':{key:'休息/养生/贵人/停滞', desc:'休养生息。代表休息、调理、卧室。事临休门则停滞。也代表贵人、婚后生活。'},
  '生门':{key:'生意/利润/阳宅/生命', desc:'最大财星。代表生意利润、阳宅风水。催财首选。健康临之代表生长中(需防肿瘤)。'},
  '伤门':{key:'伤害/车辆/赌博/主动', desc:'主伤害、伤灾。代表车辆、司机。主动出击，适合讨债。也代表手术伤疤。'},
  '杜门':{key:'堵塞/技术/隐藏/保密', desc:'杜绝沟通。主堵塞、技术研究、保密。适合躲藏。健康代表结节、梗塞。'},
  '景门':{key:'漂亮/广告/信息/证件', desc:'主前景、广告宣传。代表信息、证件、考试。也代表血压、眼睛。漂亮有面子。'},
  '死门':{key:'死亡/阴宅/固执/神佛', desc:'死气沉沉。代表阴宅、神佛、地皮。临之不变通、无活力。也代表旧伤疤。'},
  '惊门':{key:'口舌/惊吓/官司/声音', desc:'主惊吓、口舌官司。代表歌手、律师。小孩受惊看惊门。代表能发声之物。'},
  '开门':{key:'事业/开始/开明/手术', desc:'开门大吉。代表事业、公司、开始。性格开朗外向。也代表开刀手术。'}
};

function showPalace(g) {
  if (panType === 3) { showXinpanEditor(g); return; }
  let p = window._palaces ? window._palaces['gong'+g] : null;
  if (!p) return;
  let gi = GONG_INFO[g] || {};
  let sh = SHEN_INFO[p.shen] || {};
  let xi = XING_INFO[p.xing] || {};
  let me = MEN_INFO[p.men] || {};
  ag = p.anGan || '无';

  // 五行配色
  let WX_CLR = {'金':'#f9a825','木':'#2e7d32','水':'#0d47a1','火':'#d50000','土':'#795548'};
  function wxBadge(wx) { return wx ? '<span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;color:#fff;background:'+(WX_CLR[wx]||'#999')+'">'+wx+'</span>' : ''; }

  // 统一格式化：标签自动加粗，自动分行排版
  function fmtText(txt) {
    if (!txt) return '';
    let out = '';
    lines = txt.split(/\n+/);
    for(let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) { out += '<div style="height:6px"></div>'; continue; }
      // 编号项 (1、xxx)
      let numMatch = line.match(/^(\d+)[、，](.+)/);
      if (numMatch) {
        let rest = numMatch[2];
        let sp = rest.search(/[。，\s]/);
        let title = sp > 0 ? rest.slice(0, sp) : rest.slice(0, 20);
        let desc = sp > 0 ? rest.slice(sp) : rest.slice(20);
        out += '<div style="margin-top:8px"><b style="color:#0dc2b3">'+numMatch[1]+'、</b><b>'+title+'</b>'+desc+'</div>';
        continue;
      }
      // 标签检测：已知标签关键词后跟 ：/为/代表
      let labelKw = ['概念','性情','形态','天时','地理','人物','人体','动物','植物','静物',
        '颜色','方位','疾病','时间','总结','关键词','家庭','社会','场所','食物','色彩',
        '特征','个性','事业求财','景物','五行','经商求财','婚姻恋爱','文昌学业',
        '符令','主要涵义','天盘干','地盘干','天时','数','性格','天文','感觉','物体','地点',
        '八神','九星','八门','三奇六仪','格局','概要','解释','现代生活','经商求财含义','婚姻恋爱含义','文昌学业含义'];
      let labelEnd = -1, labelSuffix = '';
      for(let k = 0; k < labelKw.length; k++) {
        let kw = labelKw[k];
        idx = line.indexOf(kw);
        if (idx === 0 || (idx > 0 && line[idx-1] === ' ')) {
          let after = line.slice(idx+kw.length);
          if (after[0] === '：' || after[0] === ':') { labelEnd = idx+kw.length+1; labelSuffix = '：'; break; }
          if (after.slice(0,2) === '代表') { labelEnd = idx+kw.length+2; labelSuffix = '代表'; break; }
          if (after[0] === '为' && kw.length >= 2) { labelEnd = idx+kw.length+1; labelSuffix = '为'; break; }
        }
      }
      // Fallback: short colon-only detection (e.g., "五行：金")
      if (labelEnd < 0) {
        let ci = line.search(/[：:]/);
        if (ci > 0 && ci <= 8 && line.slice(0,ci).indexOf('<') < 0) { labelEnd = ci+1; labelSuffix = '：'; }
      }
      if (labelEnd > 0) {
        let label = line.slice(0, labelEnd);
        let content = line.slice(labelEnd);
        out += '<div style="margin-top:4px"><b>'+label+'</b>'+content+'</div>';
      } else {
        out += '<p style="margin:3px 0;line-height:1.9;text-indent:2em">'+line+'</p>';
      }
    }
    return out;
  }

  function makeTab(id, label, active) {
    return '<span onclick="event.stopPropagation();switchPalaceTab(\''+id+'\',\''+tabId+'\')" id="tab_'+id+'" style="display:inline-block;padding:6px 14px;cursor:pointer;font-size:14px;border-radius:20px;margin:2px;'+(active?'background:#0dc2b3;color:#fff':'background:#f0f0f0;color:#666')+'">'+label+'</span>';
  }

  // 构建各标签页内容
  let tabId = 'palace_tab_' + g + '_' + Date.now();
  let tabs = makeTab(tabId+'_gong', gi.name||'宫', true)
    + makeTab(tabId+'_shen', '八神·'+(window.SHEN_ABBR||{})[p.shen]||p.shen, false)
    + makeTab(tabId+'_xing', '九星·'+(window.XING_ABBR||{})[p.xing]||p.xing, false)
    + makeTab(tabId+'_men', '八门·'+(window.MEN_ABBR||{})[p.men]||p.men, false)
    + makeTab(tabId+'_gan', '干支', false)
    + makeTab(tabId+'_geju', '格局·'+(p.tian[0]||'')+(p.di[0]||''), false);

  function contentGong() {
    s = '<div style="font-size:20px;font-weight:bold">第'+g+'宫 '+gi.name+' '+wxBadge(gi.wx)+'</div>';
    s += '<div style="color:#999;margin:4px 0">'+gi.key+'</div>';
    if (window.GONG_FULL && window.GONG_FULL[g]) s += fmtText(window.GONG_FULL[g].text);
    else s += '<p>'+gi.desc+'</p>';
    return s;
  }
  function contentShen() {
    s = '<div style="font-size:18px;font-weight:bold">八神：'+p.shen+'</div>';
    if (window.SHEN_FULL && window.SHEN_FULL[p.shen]) s += fmtText(window.SHEN_FULL[p.shen].text);
    else s += '<p>'+sh.desc+'</p>';
    if (window.WUCHENG_SHEN && window.WUCHENG_SHEN[p.shen]) s += '<hr style="border:0;border-top:1px dashed #ddd;margin:12px 0">'+fmtText(window.WUCHENG_SHEN[p.shen].text);
    return s;
  }
  function contentXing() {
    s = '<div style="font-size:18px;font-weight:bold">九星：'+p.xing+'</div>';
    if (window.XING_FULL && window.XING_FULL[p.xing]) s += fmtText(window.XING_FULL[p.xing].text);
    else s += '<p>'+xi.desc+'</p>';
    if (window.WUCHENG_XING && window.WUCHENG_XING[p.xing]) s += '<hr style="border:0;border-top:1px dashed #ddd;margin:12px 0">'+fmtText(window.WUCHENG_XING[p.xing].text);
    return s;
  }
  function contentMen() {
    s = '<div style="font-size:18px;font-weight:bold">八门：'+p.men+'</div>';
    if (window.MEN_FULL && window.MEN_FULL[p.men]) s += fmtText(window.MEN_FULL[p.men].text);
    else s += '<p>'+me.desc+'</p>';
    if (window.WUCHENG_MEN && window.WUCHENG_MEN[p.men]) s += '<hr style="border:0;border-top:1px dashed #ddd;margin:12px 0">'+fmtText(window.WUCHENG_MEN[p.men].text);
    return s;
  }
  function contentGan() {
    s = '<div style="font-size:18px;font-weight:bold">天干</div>';
    let tg0 = p.tian[0]||'', dg0 = p.di[0]||'';
    s += '<div style="margin:8px 0"><span style="font-weight:bold">天盘：</span>'+p.tian;
    if (window.GAN_FULL&&tg0&&window.GAN_FULL[tg0]) s += ' '+wxBadge(window.GAN_FULL[tg0].wx);
    s += '</div>';
    s += '<div style="margin:8px 0"><span style="font-weight:bold">地盘：</span>'+p.di;
    if (window.GAN_FULL&&dg0&&window.GAN_FULL[dg0]) s += ' '+wxBadge(window.GAN_FULL[dg0].wx);
    s += '</div>';
    s += '<div style="margin:8px 0"><span style="font-weight:bold">暗干：</span>'+ag+'</div>';
    if (window.GAN_FULL&&tg0&&window.GAN_FULL[tg0]) s += '<details style="margin-top:8px"><summary style="font-weight:bold;cursor:pointer">天盘干详解('+p.tian[0]+')</summary>'+fmtText(window.GAN_FULL[tg0].text)+'</details>';
    if (window.GAN_FULL&&dg0&&dg0!==tg0&&window.GAN_FULL[dg0]) s += '<details style="margin-top:4px"><summary style="font-weight:bold;cursor:pointer">地盘干详解('+p.di[0]+')</summary>'+fmtText(window.GAN_FULL[dg0].text)+'</details>';
    if (window.WUCHENG_SANQI&&tg0&&window.WUCHENG_SANQI[tg0]) s += '<details style="margin-top:4px"><summary style="font-weight:bold;cursor:pointer;color:#0dc2b3">三奇六仪('+p.tian[0]+')</summary>'+fmtText(window.WUCHENG_SANQI[tg0].text)+'</details>';
    return s;
  }
  function contentGeju() {
    tg0 = p.tian[0]||'', dg0 = p.di[0]||'';
    let key = tg0 + dg0;
    s = '<div style="font-size:18px;font-weight:bold">格局：'+key+'</div>';
    s += '<div style="color:#999;margin:4px 0">天盘'+tg0+' + 地盘'+dg0+'</div>';
    if (window.GEJU_81 && window.GEJU_81[key]) {
      s += fmtText(window.GEJU_81[key].text);
    } else {
      s += '<p style="margin:8px 0;color:#999">该组合无对应格局记录（甲为值符，隐于旬首之下）</p>';
    }
    // Also show 天干克应 for 天盘干 as reference below
    if (window.WUCHENG_GANKEYING && tg0 && window.WUCHENG_GANKEYING[tg0]) {
      s += '<hr style="border:0;border-top:1px dashed #ddd;margin:12px 0">';
      s += '<details><summary style="font-weight:bold;cursor:pointer;color:#0dc2b3">天干克应参考('+tg0+')</summary>'+fmtText(window.WUCHENG_GANKEYING[tg0].text)+'</details>';
    }
    return s;
  }

  h = '<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center" onclick="this.remove()">'
    + '<div style="position:relative;background:#fff;border-radius:12px;padding:20px;max-width:520px;width:92vw;max-height:88vh;overflow-y:auto;font-size:14px;line-height:1.9;color:#333;cursor:default" onclick="event.stopPropagation()">'
    + '<span onclick="event.stopPropagation();let p=this;while(p){if(p.style&&p.style.position==\'fixed\'){p.remove();break;}p=p.parentNode;}" style="position:sticky;top:0;float:right;width:32px;height:32px;line-height:30px;text-align:center;background:#f0f0f0;border-radius:50%;font-size:18px;color:#999;cursor:pointer;z-index:10;margin:-8px -8px 0 0">&times;</span>'
    + '<div id="'+tabId+'_tabs" style="text-align:center;margin-bottom:12px;border-bottom:1px solid #eee;padding-bottom:10px">'+tabs+'</div>'
    + '<div id="'+tabId+'_gong" class="ptab">'+contentGong()+'</div>'
    + '<div id="'+tabId+'_shen" class="ptab" style="display:none">'+contentShen()+'</div>'
    + '<div id="'+tabId+'_xing" class="ptab" style="display:none">'+contentXing()+'</div>'
    + '<div id="'+tabId+'_men" class="ptab" style="display:none">'+contentMen()+'</div>'
    + '<div id="'+tabId+'_gan" class="ptab" style="display:none">'+contentGan()+'</div>'
    + '<div id="'+tabId+'_geju" class="ptab" style="display:none">'+contentGeju()+'</div>'
    + '</div></div>';

  // 标签切换（限定在当前弹窗内）
  window.switchPalaceTab = (id, base) => {
    let modal = document.getElementById(base+'_tabs');
    if (!modal) return;
    let container = modal.parentNode;
    // 隐藏所有标签页
    let all = container.querySelectorAll('.ptab'); for(let a=0;a<all.length;a++) all[a].style.display='none';
    // 切换标签样式
    let allT = container.querySelectorAll('[id^="tab_"]'); for(let t=0;t<allT.length;t++) { allT[t].style.background='#f0f0f0'; allT[t].style.color='#666'; }
    // 显示目标
    el = container.querySelector('#'+id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    if (el) el.style.display='block';
    let tb = container.querySelector('#tab_'+id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    if (tb) { tb.style.background='#0dc2b3'; tb.style.color='#fff'; }
  };

  document.body.insertAdjacentHTML('beforeend', h);
}

// === 心盘自动推算：根据阴遁/阳遁和锚点宫推算全盘 ===

function autoFillXinpan(anchorGong) {
  try {
  d = _xpData[anchorGong];
  _xpOpLog.push('['+(++_xpOpSeq)+'] 推算全盘 锚点=宫'+anchorGong+' 神='+(d.shen||'')+' 天='+(d.tian||'')+' 地='+(d.di||'')+' 星='+(d.xing||'')+' 门='+(d.men||''));
  if (!d || !d.di || !d.tian || !d.shen) {
    _xpErrors.push('推算失败: 请先选择神、天盘干、地盘干、星、门');
    return;
  }
  let anchorSaved = {shen:d.shen||'',tian:d.tian||'',tian2:d.tian2||'',di:d.di||'',di2:d.di2||'',xing:d.xing||'',men:d.men||''};
  GAN = ['戊','己','庚','辛','壬','癸','丁','丙','乙'];

  // 从锚点地盘干反推局数, 再重算完整地盘(含寄干)
  let diGan = (anchorSaved.di||'')[0];
  let diIdx = GAN.indexOf(diGan);
  let calcJuGong = 0;
  if (diIdx >= 0) {
    calcJuGong = _xpBgIsYin ? (diIdx + anchorGong) % 9 : (anchorGong - diIdx + 9) % 9;
    if (calcJuGong === 0) calcJuGong = 9;
  }
  if (calcJuGong < 1 || calcJuGong > 9) calcJuGong = anchorGong;
  _xpCalcJu = (_xpBgIsYin ? '阴遁' : '阳遁') + calcJuGong + '局';

  let fwDi = xpBuildFw(calcJuGong, _xpBgIsYin);
  let diMap = {};
  let zhongGan = '';
  for(let fi = 0; fi < 9; fi++) {
    let fg = fwDi[fi];
    if (fg === 5) { zhongGan = GAN[fi]; }
    else { diMap[fg] = GAN[fi]; }
  }
  // 寄干: 中5干附加到坤2宫地盘干尾部
  if (zhongGan && diMap[2]) diMap[2] = diMap[2] + zhongGan;


  let BAGUA = [1,8,3,4,9,2,7,6]; // 八卦顺时针

  // === 先算八神(不依赖天盘/星/门) ===
  let GODS = ['符','蛇','阴','六','白','玄','地','天'];
  let SHUN_GOD = [1,8,3,4,9,2,7,6];
  let NI_GOD   = [1,6,7,2,9,4,3,8];
  let godOrder = _xpBgIsYin ? NI_GOD : SHUN_GOD;
  let godIdx = GODS.indexOf(anchorSaved.shen || '');
  if (godIdx < 0) godIdx = 0;
  let godAnchorIdx = godOrder.indexOf(anchorGong);
  if (godAnchorIdx < 0) godAnchorIdx = 0;
  let godOffset = godIdx - godAnchorIdx;

  let godMap = {};
  for(let gi2 = 0; gi2 < 8; gi2++) {
    godMap[godOrder[gi2]] = GODS[(gi2 + godOffset + 8) % 8];
  }

  // === 值符宫(八神=符) ===
  let fuGong3 = 0;
  [1,2,3,4,6,7,8,9].forEach(g => { if (godMap[g] === '符') fuGong3 = g; });
  if (!fuGong3) fuGong3 = anchorGong;

  // === 星/门 ===
  let SM_ORDER = [1,8,3,4,9,2,7,6];
  let G2STAR_BG = {1:'蓬',8:'任',3:'冲',4:'辅',9:'英',2:'芮',7:'柱',6:'心'};
  let G2MEN_BG  = {1:'休',8:'生',3:'伤',4:'杜',9:'景',2:'死',7:'惊',6:'开'};
  let STAR_SEQ = SM_ORDER.map(g => {return G2STAR_BG[g];});
  let MEN_SEQ  = SM_ORDER.map(g => {return G2MEN_BG[g];});

  let starMap = {};
  let menMap = {};

  // 星门从锚点反推(伏吟不强制回原位,跟随锚点旋转)
  let anchorSmIdx = SM_ORDER.indexOf(anchorGong);
  let starIdx = STAR_SEQ.indexOf(anchorSaved.xing || '');
  if (starIdx < 0) starIdx = 0;
  let menIdx = MEN_SEQ.indexOf(anchorSaved.men || '');
  if (menIdx < 0) menIdx = starIdx;
  let starOffset = starIdx - anchorSmIdx;
  let menOffset = menIdx - anchorSmIdx;
  for(let si = 0; si < 8; si++) {
    let sgong = SM_ORDER[si];
    starMap[sgong] = STAR_SEQ[(si + starOffset + 8) % 8];
    menMap[sgong]  = MEN_SEQ[(si + menOffset + 8) % 8];
  }

  let diMapBg = {};


  // === 天盘: 顺时针复制地盘(含寄干), 不做任何额外计算 ===
  let tianMap = {};
  let tianG = (anchorSaved.tian||'')[0];
  let srcGong = 0;
  [1,2,3,4,6,7,8,9].forEach(gKey => {
    if (!srcGong && diMap[gKey] && diMap[gKey].indexOf(tianG) >= 0) srcGong = gKey;
  });
  if (!srcGong || srcGong === 5) srcGong = anchorGong;

  // 伏吟检测: 锚点天盘首字 = 锚点地盘首字
  let isFuYinLocal = !!(anchorSaved.tian && anchorSaved.di && anchorSaved.tian[0] === anchorSaved.di[0]);

  if (isFuYinLocal) {
    // 伏吟: 天盘=地盘(含寄干完全复制)
    for(let ti = 0; ti < 8; ti++) { let tg2 = BAGUA[ti]; tianMap[tg2] = diMap[tg2] || ''; }
  } else {
    // 正常BAGUA旋转
    let srcBw = BAGUA.indexOf(srcGong), dstBw = BAGUA.indexOf(anchorGong);
    if (srcBw < 0) srcBw = 0; if (dstBw < 0) dstBw = 0;
    for(let ti = 0; ti < 8; ti++) {
      let tg3 = BAGUA[ti];
      let bw = (srcBw + ti - dstBw + 8) % 8;
      tianMap[tg3] = diMap[BAGUA[bw]] || '';
    }
  }

  // 全部8宫重新计算，锚点宫保留用户手动选的神/天干/地盘干/星/门
  [1,2,3,4,6,7,8,9].forEach(g => {
    _xpData[g] = {shen:'',tian:'',di:'',tian2:'',di2:'',xing:'',men:'',ma:false,kong:false};
    if (g === anchorGong) {
      _xpData[g].shen = anchorSaved.shen;
      _xpData[g].xing = anchorSaved.xing;
      _xpData[g].men  = anchorSaved.men;
      // 锚点天盘/地盘: 取自局推算的diMap/tianMap, 含完整寄干
      _xpData[g].tian = (tianMap[g]||'')[0] || anchorSaved.tian;
      _xpData[g].tian2 = anchorSaved.tian2 || (tianMap[g]||'')[1] || '';
      _xpData[g].di   = (diMap[g]||'')[0] || anchorSaved.di;
      _xpData[g].di2  = anchorSaved.di2 || (diMap[g]||'')[1] || '';
      return;
    }
    _xpData[g].shen = godMap[g] || '';
    _xpData[g].tian = (tianMap[g]||'')[0] || '';
    _xpData[g].tian2 = (tianMap[g]||'')[1] || '';
    _xpData[g].di   = (diMapBg[g]||diMap[g]||'')[0] || '';
    _xpData[g].di2  = (diMapBg[g]||diMap[g]||'')[1] || '';
    _xpData[g].xing = starMap[g] || '';
    _xpData[g].men  = menMap[g] || '';
  });

  // === 暗干(阴干)计算 ===
  // 获取时干: 甲时→旬映射, 其他直接取
  let sizhuBG = _xpBgSizhu ? _xpBgSizhu.split(/\s+/) : [];
  let shiZhu = sizhuBG.length >= 4 ? sizhuBG[3] : '';
  let shiG = shiZhu ? shiZhu[0] : '';
  let XUN_MAP = {'子':'戊','戌':'己','申':'庚','午':'辛','辰':'壬','寅':'癸'};
  let anGanStart;
  if (shiG === '甲') { anGanStart = XUN_MAP[shiZhu.length>=2 ? shiZhu[1] : ''] || ''; }
  else { anGanStart = shiG; }

  let anGanMap = {};
  let isFuYin = false; // 暗干不强制伏吟,统一走BAGUA旋转

  // 值符宫
  let fuGong2 = 0;
  [1,2,3,4,6,7,8,9].forEach(g => { if (godMap[g] === '符') fuGong2 = g; });

  // 原始星门映射
  let G2MEN_ORIG2 = {1:'休',2:'死',3:'伤',4:'杜',6:'开',7:'惊',8:'生',9:'景'};
  // 值使门 = 值符宫的原始门
  let zhiShiMen = G2MEN_ORIG2[fuGong2] || '';
  // 值使门落宫 = menMap中值使门所在宫
  let zhiShiGong = 0;
  for(let gKey in menMap) {
    if (menMap[gKey] === zhiShiMen) { zhiShiGong = parseInt(gKey); break; }
  }

  // 时干在地盘中的来源宫
  let srcGong3 = 0;
  [1,2,3,4,6,7,8,9].forEach(gKey => {
    if (!srcGong3 && diMap[gKey] && diMap[gKey].indexOf(anGanStart) >= 0) srcGong3 = gKey;
  });
  if (srcGong3 === 5) srcGong3 = isYin ? 2 : 8;

  // 伏吟:时干加中宫→寄坤,沿飞序排列暗干
  if (isFuYin) {
    let jiGong = 2; // 始终寄坤2
    let startGanIdx = GAN.indexOf(anGanStart);
    if (startGanIdx >= 0) {
      let zhongIdx2 = fw.indexOf(5); // 中宫在飞序中的位置
      let jiIdx2 = fw.indexOf(jiGong); // 寄宫在飞序中的位置
      let skipSteps = (jiIdx2 - zhongIdx2 + 9) % 9; // 中宫到寄宫的飞步数
      let jiFlyGan = GAN[(startGanIdx + skipSteps) % 9]; // 寄宫飞序分配值
      anGanMap[jiGong] = (jiFlyGan||'') + anGanStart; // 飞序值+寄干
      for(let ai = 1; ai < 9; ai++) {
        let agong = fw[(jiIdx2 + ai) % 9];
        if (agong === 5) continue;
        let gIdx = (startGanIdx + ai + skipSteps) % 9;
        anGanMap[agong] = GAN[gIdx];
      }
    }
  } else if (srcGong3 && zhiShiGong) {
    // 正常:时干加值使门落宫, BAGUA复制地盘(和天盘规则一致)
    let srcBw3 = BAGUA.indexOf(srcGong3); if (srcBw3 < 0) srcBw3 = 0;
    let dstBw3 = BAGUA.indexOf(zhiShiGong); if (dstBw3 < 0) dstBw3 = 0;
    for(let ti3 = 0; ti3 < 8; ti3++) {
      let tgong3 = BAGUA[ti3];
      let bwIdx3 = (srcBw3 + ti3 - dstBw3 + 8) % 8;
      let sGong3 = BAGUA[bwIdx3];
      anGanMap[tgong3] = diMap[sGong3] || '';
    }
  }


  for(let ag in anGanMap) {
    if (_xpBgPalaces[ag]) _xpBgPalaces[ag].anGan = anGanMap[ag];
  }

  // 诊断日志
  _xpErrors.push('--- 推算诊断 ---');
  _xpErrors.push('锚点:宫'+anchorGong+' 天='+anchorSaved.tian+' 地='+anchorSaved.di+' 伏吟='+isFuYinLocal);
  _xpErrors.push('局:'+_xpCalcJu+' fwDi='+JSON.stringify(fwDi));
  _xpErrors.push('diMap:'+JSON.stringify(diMap));
  _xpErrors.push('tianMap:'+JSON.stringify(tianMap));
  _xpErrors.push('_xpData[2]:天='+(_xpData[2].tian||'')+(_xpData[2].tian2||'')+' 地='+(_xpData[2].di||'')+(_xpData[2].di2||''));

  let ov = window._xpOverlay || document.getElementById('xpOverlay');
  if (ov) ov.style.display = 'none';
  window._xpEditGong = 0;
  renderXinpan(true);
  } catch(e) { _xpErrors.push('推算错误:'+e.message); console.error(e); }
}

// 地盘/天盘干变更时自动计算寄干

// 获取当前阴遁/阳遁
function xpGetYinYang() {
  if (typeof _xpBgIsYin !== 'undefined') return _xpBgIsYin;
  if (_xpBgJu && _xpBgJu.length > 0) return _xpBgJu.charAt(0) === '阴';
  if (window._rawBg) return window._rawBg.indexOf('阴遁') >= 0;
  return true;
}
// 计算中宫干: 从锚点宫的地盘干和局数推算

// 飞步序列: 从局宫起,阴阳顺逆
function xpBuildFw(juGong, isYin) {
  let fw = []; let gp = juGong;
  for(let f = 0; f < 9; f++) {
    fw.push(gp);
    gp = isYin ? (gp === 1 ? 9 : gp - 1) : (gp === 9 ? 1 : gp + 1);
  }
  return fw;
}

// 坤2宫地盘干戊选择后弹出局数选择(仅戊)
function showJuSelectForKun2(gan) {
  isYin = xpGetYinYang();
  let yinYangLabel = isYin ? '阴遁' : '阳遁';
  let GAN = ['戊','己','庚','辛','壬','癸','丁','丙','乙'];

  // 局2: 坤2主宫, 寄干=中5在飞步中对应的干
  let fw2 = xpBuildFw(2, isYin);
  let jiGan2 = GAN[fw2.indexOf(5)]; // 中5的干
  let diLabel2 = gan + jiGan2;

  // 局5: 中5寄宫, 坤2主宫=飞步中坤2位置的干, 寄干=戊(中5局宫干)
  let fw5 = xpBuildFw(5, isYin);
  let kunGan5 = GAN[fw5.indexOf(2)]; // 坤2主宫干
  let diLabel5 = kunGan5 + gan; // 坤2主宫干+寄干(戊)

  let ju2Label = yinYangLabel + '2局  → ' + diLabel2;
  let ju5Label = yinYangLabel + '5局  → ' + diLabel5;

  old = document.getElementById('xpJuSelect');
  if (old) old.parentNode.removeChild(old);

  let dlg = document.createElement('div');
  dlg.id = 'xpJuSelect';
  dlg.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1001;display:flex;align-items:center;justify-content:center';
  dlg.innerHTML = '<div style="background:#fff;border-radius:12px;padding:16px;max-width:320px;width:90%;text-align:center">' +
    '<div style="font-size:15px;margin-bottom:4px">坤2宫地盘干 戊</div>' +
    '<div style="font-size:13px;color:#888;margin-bottom:12px">请选择局数（中5寄坤2宫）</div>' +
    '<button id="xpJuBtn2" style="display:block;width:100%;padding:10px;margin:6px 0;border:1px solid #0dc2b3;border-radius:8px;background:#f0fdfa;color:#0dc2b3;font-size:15px;cursor:pointer">'+ju2Label+'</button>' +
    '<button id="xpJuBtn5" style="display:block;width:100%;padding:10px;margin:6px 0;border:1px solid #e0e0e0;border-radius:8px;background:#fafafa;color:#333;font-size:15px;cursor:pointer">'+ju5Label+'</button>' +
    '</div>';
  document.body.appendChild(dlg);

  document.getElementById('xpJuBtn2').addEventListener('click', () => {
    _xpCalcJu = yinYangLabel + '2局';
    _xpData[2].di2 = jiGan2;
    _xpOpLog.push('['+(++_xpOpSeq)+'] 坤2局选择:'+ju2Label);
    dlg.parentNode.removeChild(dlg);
  });
  document.getElementById('xpJuBtn5').addEventListener('click', () => {
    _xpCalcJu = yinYangLabel + '5局';
    _xpData[2].di = kunGan5;
    _xpData[2].di2 = gan;
    _xpOpLog.push('['+(++_xpOpSeq)+'] 坤2局选择:'+ju5Label);
    dlg.parentNode.removeChild(dlg);
  });
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.parentNode.removeChild(dlg); });
}

// === 心盘宫殿编辑器 ===
	function showXinpanEditor(g) {
	  window._xpEditGong = g;
	  d = _xpData[g] || {};
	  _xpOpLog.push('['+(++_xpOpSeq)+'] 打开宫'+g+'编辑器 当前:神='+(d.shen||'空')+' 天='+(d.tian||'空')+(d.tian2||'')+' 地='+(d.di||'空')+(d.di2||'')+' 星='+(d.xing||'空')+' 门='+(d.men||'空'));
	  let overlay = document.getElementById('xpOverlay');
	  if (!overlay) {
	    overlay = document.createElement('div');
	    overlay.id = 'xpOverlay';
	    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);z-index:999;display:flex;align-items:center;justify-content:center';
	    overlay.addEventListener('click', e => { if (e.target === overlay) { _xpOpLog.push('['+(++_xpOpSeq)+'] 点击背景关闭编辑器'); overlay.style.display = 'none'; window._xpEditGong = 0; renderXinpan(true); } });
	    document.body.appendChild(overlay);
	    window._xpOverlay = overlay;
	  }
	  let GONG_NAMES = {1:'坎',2:'坤',3:'震',4:'巽',6:'乾',7:'兑',8:'艮',9:'离'};
	  let cats = [
	    {key:'shen',label:'八神',opts:['符','蛇','阴','六','白','玄','地','天']},
	    {key:'tian',label:'天盘干',opts:['戊','己','庚','辛','壬','癸','丁','丙','乙']},
	    {key:'di',label:'地盘干',opts:['戊','己','庚','辛','壬','癸','丁','丙','乙']},
	    {key:'xing',label:'九星',opts:['蓬','任','冲','辅','英','芮','柱','心']},
	    {key:'men',label:'八门',opts:['休','生','伤','杜','景','死','惊','开']}
	  ];

	  // 构建HTML，所有按钮用data属性替代onclick
	  h = '<div id="xpEditorCard" style="background:#fff;border-radius:12px;padding:14px;max-width:380px;width:92%;max-height:85vh;overflow-y:auto">';
	  h += '<div style="font-weight:bold;font-size:17px;text-align:center;margin-bottom:10px">'+GONG_NAMES[g]+'宫 编辑</div>';
	  for(let ci = 0; ci < cats.length; ci++) {
	    let cat = cats[ci];
	    let curVal = d[cat.key] || '';
	    h += '<div style="font-size:12px;color:#888;margin-bottom:2px">'+cat.label+'</div>';
	    h += '<div class="xp-btn-group" data-cat="'+cat.key+'" style="margin-bottom:8px">';
	    for(let oi = 0; oi < cat.opts.length; oi++) {
	      let val = cat.opts[oi];
	      let sel = (curVal === val) ? 'background:#0dc2b3;color:#fff;border-color:#0dc2b3' : 'background:#fafafa;border-color:#e0e0e0';
	      h += '<span class="xp-btn" data-cat="'+cat.key+'" data-val="'+val+'" style="display:inline-block;padding:6px 12px;margin:2px;border:1px solid;border-radius:16px;font-size:14px;cursor:pointer;'+sel+'">'+val+'</span>';
	    }
	    h += '</div>';
	  }
	  h += '<div style="text-align:center;margin:8px 0">';
	  h += '<span id="xpAutoFillBtn" style="display:inline-block;padding:8px 20px;background:#0dc2b3;color:#fff;border-radius:20px;font-size:14px;cursor:pointer">以此宫推算全盘</span>';
	  h += '</div>';
	  h += '<div style="text-align:center"><span id="xpCloseBtn" style="font-size:13px;color:#888;cursor:pointer">关闭</span></div>';
	  h += '</div>';

	  overlay.innerHTML = h;
	  overlay.style.display = 'flex';

	  // === 事件委托: 所有符号按钮点击由卡片统一处理 ===
	  let card = document.getElementById('xpEditorCard');
	  card.addEventListener('click', e => {
	    // 从点击目标向上查找 .xp-btn（兼容无closest的旧WebView）
	    let btn = e.target;
	    while (btn && btn !== card) {
	      if (btn.classList && btn.classList.contains('xp-btn')) break;
	      btn = btn.parentElement;
	    }
	    if (!btn || btn === card) return;
	    let catKey = btn.getAttribute('data-cat');
	    let val = btn.getAttribute('data-val');
	    if (!catKey || val === null) return;

	    // 设置数据
	    _xpManual[g] = true;
	    _xpData[g][catKey] = val;
	    d[catKey] = val;
	    // 干变更时清除旧寄干（局可能已变，旧寄干无效）
	    if (catKey === 'di') { _xpData[g].di2 = ''; d.di2 = ''; }
	    if (catKey === 'tian') { _xpData[g].tian2 = ''; d.tian2 = ''; }
	    _xpOpLog.push('['+(++_xpOpSeq)+'] 宫'+g+' '+({'shen':'神','tian':'天','di':'地','xing':'星','men':'门'})[catKey]+'→'+val);

	    // 重置同组所有按钮样式
	    let group = btn.parentElement;
	    let siblings = group.querySelectorAll('.xp-btn');
	    for(let si = 0; si < siblings.length; si++) {
	      siblings[si].style.cssText = 'display:inline-block;padding:6px 12px;margin:2px;border:1px solid #e0e0e0;border-radius:16px;font-size:14px;cursor:pointer;background:#fafafa';
	    }
	    // 高亮选中按钮
	    btn.style.cssText = 'display:inline-block;padding:6px 12px;margin:2px;border:1px solid #0dc2b3;border-radius:16px;font-size:14px;cursor:pointer;background:#0dc2b3;color:#fff';

	    // 坤2宫地盘干戊选择后弹出局数选择
	    if (g === 2 && catKey === 'di' && val === '戊') {
	      showJuSelectForKun2(val);
	    }
	  });

	  // 关闭按钮
	  let closeBtn = document.getElementById('xpCloseBtn');
	  if (closeBtn) {
	    closeBtn.addEventListener('click', () => {
	      _xpOpLog.push('['+(++_xpOpSeq)+'] 关闭编辑器(宫'+g+')');
	      overlay.style.display = 'none';
	      window._xpEditGong = 0;
	      renderXinpan(true);
	    });
	  }

	  // 推算全盘按钮
	  let fillBtn = document.getElementById('xpAutoFillBtn');
	  if (fillBtn) {
	    fillBtn.addEventListener('click', e => {
	      e.stopPropagation();
	      _xpOpLog.push('['+(++_xpOpSeq)+'] 点击推算全盘(宫'+g+') 锚点符号:神='+(_xpData[g].shen||'')+' 天='+(_xpData[g].tian||'')+' 地='+(_xpData[g].di||'')+' 星='+(_xpData[g].xing||'')+' 门='+(_xpData[g].men||''));
	      window._xpAutoFillAnchor = g;
	      setTimeout(() => { autoFillXinpan(window._xpAutoFillAnchor); }, 50);
	    });
	  }
	}

	window.addEventListener('resize', () =>{
	  clearTimeout(window._yinRT);
	  window._yinRT = setTimeout(() =>{
	    if (panType === 5) {
	      doChuanRen();
	    } else {
	      fixYinGanAlign();
	    }
	  }, 300);
	});

function toggleXiangJu(noScroll){
  div=document.getElementById('xiangjuDIV');
  if(!div){div=document.createElement('div');div.id='xiangjuDIV';div.style.cssText='margin-top:12px';
    let result=document.getElementById('result');if(result)result.appendChild(div);}
  if(!noScroll&&div.style.display==='block'){div.style.display='none';div.innerHTML='';return;}

  let sxDeg=_xjuDegSaved?parseInt(_xjuDegSaved)||0:parseInt(document.getElementById('selShanXiangDeg').value)||0;if(!_xjuDegSaved)_xjuDegSaved=String(sxDeg);
  let baseYear=new Date().getFullYear();let yearOff=0;let yrRadios=document.getElementsByName('xjuYear');for(let ri=0;ri<yrRadios.length;ri++){if(yrRadios[ri].checked){yearOff=parseInt(yrRadios[ri].value)||0;break;}}let sxYear=baseYear+yearOff;
  sxDeg=((sxDeg%360)+360)%360;

  let parts=[];
  _expectedPals=[];

  // ShanJu数组 (24山), 用于向角度选局副盘局数计算
  let SHAN_JU=[-7,-2,-1,-9,-7,-6,-5,-6,-5,4,1,2,3,8,9,1,3,4,5,4,5,-6,-9,-8];
  for(let offset=-30;offset<=30;offset+=5){
    let deg=((sxDeg+offset)%360+360)%360;
    // 向角度选局使用24山查表算法
    _duu=Math.floor(((deg%360+360)%360)/5);
    let _du=Math.floor(_duu/3);
    let _t=SHAN_JU[_du];
    _tJ=(_t<0)?_t+9:_t+8;
    let sxJu,sxIsYin;
    if(_tJ<9){sxJu=9-_tJ;sxIsYin=true;}else{sxJu=_tJ-8;sxIsYin=false;}
    let _v=_duu%3;
    if(sxIsYin)sxJu+=_v*3;else sxJu+=9-_v*3;
    if(sxJu>9)sxJu-=9;
    degStart=Math.floor(deg/5)*5,degEnd=degStart+4;
    // 山向排盘核心: 虚拟时柱hCyl驱动地盘飞步, 不依赖真实日历
    let XiangZhi=[1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,0,0];
    let _cY=(sxYear-1864)%60;
    let _hGan=_cY%10;if(_hGan>4)_hGan-=5; // 年干支天干偏移计算
    let hCyl=_hGan*12+XiangZhi[_du];
    let jiang=(13-_cY%12)%12;
    let ju=sxJu,yy=sxIsYin?'阴':'阳';
    jiang=(13-_cY%12)%12;

    // paipanrest核心: 旬首/空亡/马星
    let xunshou=Math.floor(hCyl/10)*10;
    let xunkong1=(xunshou+10)%12,xunkong2=(xunshou+11)%12;
    let maxing=[2,8,11,5][hCyl%4]; // YiMa

    // 地盘
    let LIUYI=['','戊','己','庚','辛','壬','癸','丁','丙','乙'];
    let _g10=['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
    let dg=Math.floor(xunshou/10)+1; // 旬首对应的liuyi索引 (AppStudio +4 = JS +1)
    let digan={},dgg=0,sgg=0;
    for(let i=0;i<9;i++){
      g=yy=='阴'?ju-i:ju+i;
      if(g>9)g-=9;if(g<1)g+=9;
      digan[g]=LIUYI[i+1];
      if(i+1==dg)dgg=g;
      if(LIUYI[i+1]==_g10[hCyl%10])sgg=g; // AppStudio: hCyl%10→Gan char
    }
    if(sgg==0)sgg=dgg;
    // 寄宫
    if(digan[5]&&digan[2])digan[2]=digan[2]+digan[5];

    // 值符星/值使门
    let FZHUAN=[0,1,6,3,4,6,8,7,2,5],ZHUAN=[0,1,8,3,4,9,2,7,6];
    let XING=['','蓬','任','冲','辅','英','芮','柱','心'];
    let MEN=['','休','生','伤','杜','景','死','惊','开'];
    let SHEN_YIN=['','符','天','地','玄','白','六','阴','蛇'];
    let SHEN_YANG=['','符','蛇','阴','六','白','玄','地','天'];
    let zhiFu=XING[FZHUAN[dgg]];if(dgg==5)zhiFu='禽';
    let zhiShi=MEN[FZHUAN[dgg]];
    let mgg=yy=='阳'?hCyl%10+dgg:dgg-(hCyl%10);
    if(mgg<1)mgg+=9;if(mgg>9)mgg-=9;

    // 排星/天盘
    let xinpan={},tiangan={};
    let v1=FZHUAN[sgg]-FZHUAN[dgg];
    for(let j=1;j<=8;j++){
      let k=j-v1;if(k<1)k+=8;if(k>8)k-=8;
      xinpan[ZHUAN[j]]=XING[k];
      tiangan[ZHUAN[j]]=digan[ZHUAN[k]]||'';
    }
    // 排门
    let menpan={};
    let v2=FZHUAN[mgg]-FZHUAN[dgg];
    for(let j=1;j<=8;j++){
      k=j-v2;if(k<1)k+=8;if(k>8)k-=8;
      menpan[ZHUAN[j]]=MEN[k];
    }
    // 排神
    let shenpan={};
    let v3=FZHUAN[sgg]-1;
    for(let j=1;j<=8;j++){
      let kw=j-v3;if(kw<1)kw+=8;if(kw>8)kw-=8;
      shenpan[ZHUAN[j]]=yy=='阳'?SHEN_YANG[kw]:SHEN_YIN[kw];
    }
    // 暗干
    angan={};
    let v4=FZHUAN[sgg]-FZHUAN[mgg];
    for(let j=1;j<=8;j++){
      kw=j+v4;if(kw<1)kw+=8;if(kw>8)kw-=8;
      angan[ZHUAN[j]]=digan[ZHUAN[kw]]||'';
    }
    // 伏吟局暗干特殊排列
    // 真伏吟: 全部天盘==地盘
    let _isFY=true;
    for(let _g=1;_g<=9;_g++){if(_g===5)continue;if(tiangan[_g]!==digan[_g]){_isFY=false;break;}}
    if(_isFY){
      let _vj;
      if(hCyl%10==0){let _vc=LIUYI[Math.floor(hCyl/10)+1];for(_vj=1;_vj<10;_vj++)if(LIUYI[_vj]==_vc)break;}
      else _vj=hCyl%10;
      let _v2=yy=='阳'?_vj-4:_vj+4;
      for(let _i=1;_i<10;_i++){
        let _g=yy=='阳'?_v2+_i-1:_v2-_i+1;
        if(_g<1)_g+=9;if(_g>9)_g-=9;
        angan[_i]=LIUYI[_g];
      }
      if(angan[1]==tiangan[1]){
        let _gan=angan[2][0];
        for(_vj=1;_vj<10;_vj++)if(LIUYI[_vj]==_gan)break;
        _v2=yy=='阳'?_vj-4:_vj+4;
        for(let _i=1;_i<10;_i++){
          let _g=yy=='阳'?_v2+_i-1:_v2-_i+1;
          if(_g<1)_g+=9;if(_g>9)_g-=9;
          angan[_i]=LIUYI[_g];
        }
      }
      if(angan[2]&&angan[5])angan[2]=angan[2][0]+angan[5][0];
      angan[5]='';
    }

    // 组装palaces + 保存预期值用于渲染验证
    let palsT={},_exp={};
    for(let g=1;g<=9;g++){if(g===5)continue;
      palsT['gong'+g]={shen:shenpan[g]||'',tian:(tiangan[g]||''),di:(digan[g]||''),xing:xinpan[g]||'',men:menpan[g]||'',anGan:(angan[g]||''),isMenPo:false};
      _exp[g]={shen:shenpan[g]||'',tian:(tiangan[g]||''),di:(digan[g]||''),xing:xinpan[g]||'',men:menpan[g]||''};
    }
    _expectedPals.push(_exp);
    recalcColors(palsT);

    // 空亡: 旬首→空亡地支→对应宫位标记◎/马星/旬首
    let ZHI=['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
    let xunShouGZ='甲'+ZHI[xunshou%12];
    let kongWangStr=ZHI[xunkong1]+ZHI[xunkong2];
    let maStr=ZHI[maxing];
    let ZHI2G_KW={'子':1,'丑':8,'寅':8,'卯':3,'辰':4,'巳':4,'午':9,'未':2,'申':2,'酉':7,'戌':6,'亥':6};
    let kongGongsT={};kongGongsT[ZHI2G_KW[ZHI[xunkong1]]]=true;kongGongsT[ZHI2G_KW[ZHI[xunkong2]]]=true;
    let MA_POS2={4:'ma1',9:'ma2',2:'ma2',3:'ma3',7:'ma4',8:'ma3',1:'ma4',6:'ma4'};
    maGong=ZHI2G_KW[maStr]||0,maPosId=MA_POS2[maGong]||'';
    let agFn= g => {let a=palsT['gong'+g];return a&&a.anGan?window._anGanColor?window._anGanColor(a.anGan,g):a.anGan:'';};
    let csFn=window._colorSpan|| (v => {return v||'';});
    gridHTML=buildPaipanGrid(palsT,kongGongsT,maPosId,agFn,{colorSpan:csFn});

    // 黄泉: 原始公式 v=jiang-hCyl%12, hG=2
    let _tablesha=[11,3,3,3,5,5,5,6,6,6,4,4,4,2,2,2,8,8,8,9,9,9,11,11];
    let _duSub=Math.floor(((deg%360+360)%360)/5);_duSub=Math.floor(_duSub/3);
    let _XZ=[1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,0,0];
    let _hCylSub=2*12+_XZ[_duSub];
    let _vSub=(jiang||0)-_hCylSub%12;
    let _Z2G=[1,8,8,3,4,4,9,2,2,7,6,6];
    let sxHq=ZHI_LIST[_tablesha[_duSub]]+_Z2G[(_tablesha[_duSub]-_vSub+12)%12];
    let sxName=SHAN_XIANG_DATA.getName(deg);
    let sxYearGan=GAN_LIST[(sxYear-4)%10],sxYearZhi=ZHI_LIST[(sxYear-4)%12];
    let ZHI12=['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
    let SGX_OFF={'甲':0,'己':0,'乙':2,'庚':2,'丙':4,'辛':4,'丁':6,'壬':6,'戊':8,'癸':8};
    let sxShiZhu=GAN_LIST[_cY%10]+ZHI12[_cY%12]+' '+GAN_LIST[hCyl%10]+ZHI12[hCyl%12];
    juLabel=(sxIsYin?'阴遁':'阳遁')+sxJu+'局';

    let sxShiZhuParts=sxShiZhu.split(' ');
    html='<style>.xj-head #tdTitle td{color:#dead68}.xj-head #itemTitle{color:#dead68;line-height:30px}.xj-head #dTitle{width:16%;color:#dead68}</style>'+
      '<div id="panHead"><TABLE class="pan xj-head" id="headTable">'+
      '<TR><TD id="itemTitle">度数</TD><TD colspan="3">'+sxName+' '+degStart+'～'+degEnd+'°</TD><TD>'+sxYear+'年</TD></TR>'+
      '<TR><TD id="dTitle">干支</TD><TD class="sizhu">'+sxShiZhuParts[0]+'</TD><TD class="sizhu" style="color:#c00000;font-weight:bold">'+sxShiZhuParts[1]+'</TD><TD>黄泉<b>'+sxHq+'</b></TD><TD>'+juLabel+'</TD></TR>'+
      '<TR id="tdTitle"><TD>旬首</TD><TD>值符</TD><TD>值使</TD><TD>空亡</TD><TD>马星</TD></TR>'+
      '<TR><TD>'+xunShouGZ+'</TD><TD>天'+zhiFu+'星</TD><TD>'+zhiShi+'门</TD><TD>'+kongWangStr+'</TD><TD>'+maStr+'</TD></TR>'+
      '</TABLE></div>'+gridHTML;
    html=html.replace(/<TABLE[^>]*id="btnTable1"[^>]*>[\s\S]*?<\/TABLE>/gi,'');
    html=html.replace(/<div[^>]*id="yixinghuandouDIV"[^>]*><\/div>/gi,'');
    parts.push('<div class="xj-pan" style="margin:8px 0">'+html+'</div>');
  }
  let ui='<div style="padding:6px 0;display:flex;align-items:center;gap:6px;flex-wrap:wrap">';
ui+='<span style="font-size:13px;color:#666">年:</span>';
ui+='<label style="font-size:13px;cursor:pointer;margin:0"><input type="radio" name="xjuYear" value="0" checked onchange="refreshXiangJu()" style="vertical-align:middle"> 今年</label>';
ui+='<label style="font-size:13px;cursor:pointer;margin:0"><input type="radio" name="xjuYear" value="1" onchange="refreshXiangJu()" style="vertical-align:middle"> 明年</label>';
ui+='<label style="font-size:13px;cursor:pointer;margin:0"><input type="radio" name="xjuYear" value="2" onchange="refreshXiangJu()" style="vertical-align:middle"> 后年</label>';
ui+='<span style="font-size:13px;color:#666;margin-left:8px">度数:</span>';
ui+='<input id="xjuDeg" class="sel-date" style="width:55px" type="number" min="0" max="359" value="'+sxDeg+'" tabindex="-1" onchange="let v=parseInt(this.value);if(isNaN(v)||v<0){this.value=0;}else if(v>359){this.value=359;}refreshXiangJu();">';
ui+='<span onclick="refreshXiangJu()" style="display:inline-block;padding:4px 14px;font-size:13px;cursor:pointer;border:1px solid #0dc2b3;color:#0dc2b3;border-radius:4px;background:#fff">更改</span>';
ui+='</div>';
div.innerHTML=ui+parts.join('');
  // Restore saved values
  setTimeout(() => {
    let rd=div.querySelector('input[name="xjuYear"][value="'+_xjuYearSaved+'"]');
    if(rd) rd.checked=true;
    let xd=div.querySelector('#xjuDeg');
    if(xd&&_xjuDegSaved) xd.value=_xjuDegSaved;
  },10);
  div.style.display='block';let xjuD=document.getElementById('xjuDeg');if(xjuD){if(xjuD.value==='0'){let md=document.getElementById('selShanXiangDeg');if(md)xjuD.value=md.value||'0';}xjuD.blur();}
  // 程序化绑定向角度选局面板事件(Tauri兼容)
  div.querySelectorAll('input[name="xjuYear"]').forEach(r => { r.onchange = refreshXiangJu; });
  let xd2=div.querySelector('#xjuDeg'); if(xd2) xd2.onchange = function(){let v=parseInt(this.value);if(isNaN(v)||v<0)this.value=0;else if(v>359)this.value=359;refreshXiangJu();};
  let chgBtn=div.querySelector('[onclick*="refreshXiangJu"]'); if(chgBtn) chgBtn.onclick = refreshXiangJu;
  if(!noScroll)setTimeout(() => {let btn=document.getElementById('btnXiangJu');if(btn){let top=btn.getBoundingClientRect().top+window.pageYOffset;let offset=document.body.classList.contains('is-mobile')?36:0;window.scrollTo({top:top-offset,behavior:'smooth'});}},200);
  // Re-align after display: square gongs, row sync, and yinGan positions
  setTimeout(() => {
    div.querySelectorAll('.xj-pan').forEach(pan => {
      // Square gongs
      [4,9,2,3,7,8,1,6].forEach(g => {let el=pan.querySelector('#gong'+g);if(el){let w=el.getBoundingClientRect().width;if(w>0)el.style.height=w+'px';}});
      // Row height sync
      let pRows=pan.querySelectorAll('#pan tr'),lRows=pan.querySelectorAll('#leftTable tr'),rRows=pan.querySelectorAll('#rightTable tr');
      for(let i=0;i<3&&i<pRows.length;i++){let rh=pRows[i].getBoundingClientRect().height;if(rh>0){if(lRows[i])lRows[i].style.height=rh+'px';if(rRows[i])rRows[i].style.height=rh+'px';}}
      // YinGan alignment: left side (gong4,3,8) align to tian, right side (gong2,7,6) align to xing
      [4,3,8].forEach(g => {let y=pan.querySelector('#yinGan'+g),t=pan.querySelector('#tian'+g),go=pan.querySelector('#gong'+g);if(y&&t&&go){y.style.paddingTop=Math.max(0,t.getBoundingClientRect().top-go.getBoundingClientRect().top)+'px';y.style.textAlign='right';y.style.verticalAlign='top';y.style.fontSize='15px';y.style.lineHeight='25px';y.style.color='#333';}});
      [2,7,6].forEach(g => {let y=pan.querySelector('#yinGan'+g),x=pan.querySelector('#xing'+g),go=pan.querySelector('#gong'+g);if(y&&x&&go){y.style.paddingTop=Math.max(0,x.getBoundingClientRect().top-go.getBoundingClientRect().top)+'px';y.style.textAlign='left';y.style.verticalAlign='top';y.style.fontSize='15px';y.style.lineHeight='25px';y.style.color='#333';}});
      y9=pan.querySelector('#yinGan9'),y1=pan.querySelector('#yinGan1');
      if(y9){y9.style.verticalAlign='bottom';y9.style.fontSize='15px';y9.style.color='#333';}
      if(y1){y1.style.verticalAlign='top';y1.style.fontSize='15px';y1.style.color='#333';}
    });
  },50);
  // Self-verification: compare rendered DOM against expected paipanrest data
}


function refreshXiangJu(){
  div=document.getElementById('xiangjuDIV');if(!div)return;
  // Save current values
  let curDeg=document.getElementById('xjuDeg');
  if(curDeg) _xjuDegSaved=curDeg.value;
  let radios=document.getElementsByName('xjuYear');
  for(let i=0;i<radios.length;i++){if(radios[i].checked){_xjuYearSaved=radios[i].value;break;}}
  // Directly rebuild content without toggling display (keeps scroll position)
  // Use same logic as toggleXiangJu but skip display toggle and scroll
  let origDisplay=div.style.display;
  div.style.display='block'; // ensure visible
  // Call toggleXiangJu in "rebuild" mode
  toggleXiangJu(true);
}


function doChuanRen(){
  let tip=document.getElementById("tip");if(tip)tip.innerHTML="";
  sxIn=document.getElementById("shanxiangInputs");if(sxIn)sxIn.style.display="none";
  let zxj2=document.getElementById("zxjSpan");if(zxj2)zxj2.style.display="none";
  document.getElementById("xinpanPanel").style.display="none";
  document.getElementById("result").style.display="block";
  // Create persistent穿壬 inputs if not exist
  if(!document.getElementById("crInputs")){
    let inpDiv=document.createElement("div");inpDiv.id="crInputs";
    let pw=document.getElementById("panWrap");
    if(pw&&pw.parentNode)pw.parentNode.insertBefore(inpDiv,pw);
  }
  document.getElementById("crInputs").style.display="block";
  // 保存当前输入值
  let _crVals={};
  let _crEls=document.getElementById("crInputs").querySelectorAll('select');
  if(_crEls.length){
    _crVals.yongShen=document.getElementById("crYongShen")?document.getElementById("crYongShen").value:"";
    _crVals.guiRen=document.getElementById("crGuiRen")?document.getElementById("crGuiRen").value:"阳贵";
    _crVals.nianMing=document.getElementById("crNianMing")?document.getElementById("crNianMing").value:"子";
    _crVals.gender=document.getElementById("crGender")?document.getElementById("crGender").value:"男";
    _crVals.ziJu=document.getElementById("crZiJu")?document.getElementById("crZiJu").value:"道家";
    _crVals.shiKe=document.getElementById("crShiKe")?document.getElementById("crShiKe").value:"时家";
  }
  document.getElementById("crInputs").innerHTML=window.renderChuanRenInputs?window.renderChuanRenInputs(_crVals):"";
  // 程序化绑定穿壬输入事件(Tauri兼容)
  ['crYongShen','crGuiRen','crNianMing','crGender','crZiJu','crShiKe'].forEach(id=>{let el=document.getElementById(id);if(el)el.onchange=doChuanRen;});
  try{
    let nm=document.getElementById("crNianMing");let nianMing=nm?nm.value:_crVals.nianMing||"子";
    let gr=document.getElementById("crGuiRen");let guiRen=gr?gr.value:_crVals.guiRen||"阳贵";
    let ys=document.getElementById("crYongShen");let yongShen=ys?ys.value:_crVals.yongShen||"";
    let gd=document.getElementById("crGender");let gender=gd?gd.value:_crVals.gender||"男";
    let zj=document.getElementById("crZiJu");let ziJu=zj?zj.value:_crVals.ziJu||"道家";
    let sk=document.getElementById("crShiKe");let shiKe=sk?sk.value:_crVals.shiKe||"时家";
    let data=window.chuanRenChart({year:Y,month:M,day:D,hour:hr,minute:mn,nianMing:nianMing,guiRen:guiRen,yongShen:yongShen,gender:gender,ziJu:ziJu,shiKe:shiKe});
    // Only update display, keep inputs persistent
    document.getElementById("panWrap").innerHTML=window.renderChuanRen(data,null);
    _renderBottomBar();
    setTimeout(_bindActionButtons, 50);
    requestAnimationFrame(() =>{requestAnimationFrame(() =>{
      let crW=document.querySelector('.cr-grid-wrap');if(!crW)return;
      let pans=crW.querySelectorAll('#pan');if(!pans.length)return;
      let pan=pans[0];
      // 正方化宫格: 内层TD需手动设置
      pan.querySelectorAll('[id^=gong]').forEach(el => { let w = el.getBoundingClientRect().width; if (w > 0) el.style.height = w + 'px'; });
// 2. 阴干移入宫内, 隐藏外圈yinGan
      pan.querySelectorAll('[id^="gong"]').forEach(go => {
        let g=parseInt(go.id.replace('gong',''));if(g===5)return;
        let yg=document.getElementById('yinGan'+g);if(!yg)return;
        let agText=yg.textContent.replace(/\s/g,'').trim();
        yg.style.display='none';if(!agText)return;
        let topRow=go.querySelector('.panItem.top');if(!topRow)return;
        let kw=topRow.querySelector('[id^=kong]');
        let wrap=document.createElement('span');wrap.style.cssText='float:right;white-space:nowrap;margin-left:4px';
        if(kw&&kw.textContent.replace(/\s/g,'').trim()=='○'){let ks=document.createElement('span');ks.textContent='○';ks.style.cssText='font-weight:bold;color:#1a1a2e;margin-right:1px';wrap.appendChild(ks);kw.style.display='none';}
        let ag=document.createElement('span');ag.textContent=agText;ag.style.cssText='color:#8B7D6B;font-size:70%';wrap.appendChild(ag);
        topRow.appendChild(wrap);
      });
      // 3. 12地支卡片: 各自上方/下方居中于对应宫
      let wr2=crW.getBoundingClientRect();
      crW.querySelectorAll('.cr-card').forEach(card => {
        let side=card.getAttribute('data-side');
        let gref=parseInt(card.getAttribute('data-gref'))||1;
        let refGo=pan.querySelector('#gong'+gref);if(!refGo)return;
        let gr=refGo.getBoundingClientRect();
        card.style.position='absolute';
        if(side==='top'){
          card.style.bottom=(wr2.bottom-gr.top+1)+'px';
          card.style.left=(gr.left-wr2.left+gr.width/2)+'px';
          card.style.transform='translateX(-50%)';
        } else if(side==='bot'){
          card.style.top=(gr.bottom-wr2.top+1)+'px';
          card.style.left=(gr.left-wr2.left+gr.width/2)+'px';
          card.style.transform='translateX(-50%)';
        } else if(side==='left'){
          card.style.right=(wr2.right-gr.left+1)+'px';
          card.style.top=(gr.top-wr2.top+gr.height/2)+'px';
          card.style.transform='translateY(-50%)';
        } else if(side==='right'){
          card.style.left=(gr.right-wr2.left+1)+'px';
          card.style.top=(gr.top-wr2.top+gr.height/2)+'px';
          card.style.transform='translateY(-50%)';
        }
      });

      // 移除宫位点击(穿壬不需要)
      document.querySelectorAll('[id^=yinGan]').forEach(y => {y.onclick=null;y.style.cursor='default';});    });});
  }catch(e){
    document.getElementById("panWrap").innerHTML="<span style=\"color:red;user-select:text;-webkit-user-select:text\">穿壬错误:"+e.message+"</span>";
  }
}


// 暴露到全局




window.Y=Y;
window.M=M;
window.D=D;
window.hr=hr;
window.mn=mn;
window.panType=panType;
window.doPan=doPan;
window.setPanType=setPanType;
window.adjDays=adjDays;
window.onZxjChange=onZxjChange;
window.setNow=setNow;
window.recalcColors=recalcColors;
window.showPalace=showPalace;
window.showXinpanEditor=showXinpanEditor;
window.doChuanRen=doChuanRen;
window.tianmenDihu=tianmenDihu;
window.shen12=shen12;
window.clearWaipan=clearWaipan;
window.renderShanXiangPan2=renderShanXiangPan2;
window.clearXinpan=clearXinpan;

window.applyZhuan=applyZhuan;
window.fixYinGanAlign=fixYinGanAlign;
window.getJu=getJu;
window.getIsYin=getIsYin;
window.SHAN_XIANG_DATA=SHAN_XIANG_DATA;
window.panChange=panChange;
window.showYixing=showYixing;
window.toggleXiangJu=toggleXiangJu;
window.refreshXiangJu=refreshXiangJu;
window.savePan=savePan;
window.loadSaved=loadSaved;
window.showSavedList=showSavedList;
window.showState=showState;
window.delChecked=delChecked;
window._closeSheet=_closeSheet;
window._doSave=_doSave;
window._delRecord=_delRecord;
window.editTitle=editTitle;

window.XING=XING;
window.MEN=MEN;
window.SHEN_ABBR=SHEN_ABBR;
window.XING_ABBR=XING_ABBR;
window.MEN_ABBR=MEN_ABBR;
window._colorSpan=_colorSpan;
window.GAN_LIST=GAN_LIST;
window.ZHI_LIST=ZHI_LIST;
window.SHEN=SHEN;
window.GAN10=GAN10;
window.ZHI12=ZHI12;
window.SHENJIANG_NAMES=SHENJIANG_NAMES;
window.SHENJUE=SHENJUE;
window.ZXJ_NAMES=ZXJ_NAMES;
_iifeReady = true;
})();
