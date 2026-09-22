// 奇门遁甲排盘引擎  作者: 地天泰  微信/手机: 18626256203
// 项目地址: https://github.com/wrz1911/daojiayinpan
// 开源依赖: tyme4ts (MIT) https://github.com/6tail/tyme4ts
// 开源依赖: Tauri (MIT) https://github.com/tauri-apps/tauri
(function(){
'use strict';
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

// === 全局错误静默记录(catch 静默后保留排查线索) ===
let _errLog = [];
try { _errLog = JSON.parse(localStorage.getItem('qimen_errlog') || '[]'); } catch(e) { _errLog = []; }
function _logErr(src, msg) {
  try {
    _errLog.push(new Date().toISOString().slice(0,19).replace('T',' ') + ' ' + src + ': ' + msg);
    if (_errLog.length > 30) _errLog = _errLog.slice(-30);
    localStorage.setItem('qimen_errlog', JSON.stringify(_errLog));
    let bad = document.getElementById('errBadge');
    if (!bad) {
      bad = document.createElement('span');
      bad.id = 'errBadge';
      bad.textContent = '⚠';
      bad.style.cssText = 'position:fixed;right:8px;bottom:8px;font-size:13px;cursor:pointer;color:var(--c-text-3);opacity:0.7;z-index:10000;background:var(--c-bg);border-radius:50%;width:24px;height:24px;line-height:24px;text-align:center';
      bad.title = '检测到异常, 点击复制日志';
      bad.onclick = function() {
        try {
          let txt = '【奇门排盘错误日志】\n' + _errLog.join('\n');
          if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(txt); }
          _errLog = []; localStorage.removeItem('qimen_errlog');
          this.remove(); alert('错误日志已复制到剪贴板并清空, 请粘贴给开发者');
        } catch(e2) {}
      };
      document.body.appendChild(bad);
    }
  } catch(e) {}
}
/* HTML 转义: 用于把用户/导入数据拼进 innerHTML 的场合(历史记录标题、姓名等)。
   排盘历史是设计成可以互相分享备份文件的, 导入内容属于不可信输入。 */
function escHtml(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
window._esc = escHtml;   // 供 qimen_mingli.js / qimen_bazi.js 引用
window.addEventListener('error', ev => { _logErr('error', (ev.message||'') + ' @' + (ev.filename||'').split('/').pop() + ':' + ev.lineno); });
window.addEventListener('unhandledrejection', ev => { _logErr('rejection', String((ev.reason && ev.reason.message) || ev.reason)); });
// 共享常量: 由 qimen_constants.js 的 window.QM 派生, 避免重复定义
var QM = window.QM || {};     // 挂接 constants 导出的共享常量(同 chuanren)
const ZHI2G = QM.ZHI2G_OBJ;   // 地支→宫位(对象版)
const MA_POS = QM.MP;         // 马星位置
const KONG_ID = QM.KONG_ID;   // 空亡序号
const XM_RULES = QM.XM_G;     // 相门规则
// 入墓规则: QM.MU_G 不含壬(壬墓辰在4宫, 山向显示需要), 故保留独立定义
const MU_RULES = {2:['癸'],6:['戊','丙','乙'],8:['庚','丁','己'],4:['辛','壬']};
// 击刑规则: 由 QM.XING_G(干→宫)反向派生(宫→干列表)
const XING_RULES = Object.keys(QM.XING_G).reduce((acc, gan) => {
  const g = QM.XING_G[gan];
  (acc[g] = acc[g] || []).push(gan);
  return acc;
}, {});

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
  let duu=Math.floor(((deg%360+360)%360)/5),du=Math.floor(duu/3);
  let _s=[-7,-2,-1,-9,-7,-6,-5,-6,-5,4,1,2,3,8,9,1,3,4,5,4,5,-6,-9,-8][du];
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
let _xpCalcJu = '';       // 用户推算的局数
let _xpBgIsYin = true;    // 背景阴阳遁
(function initXpData() {
  [1,2,3,4,6,7,8,9].forEach(g => {
    _xpData[g] = {shen:'', tian:'', di:'', xing:'', men:'', ma:false, kong:false};
    _xpManual[g] = false;
  });
})();
function clearXinpan() {
  [1,2,3,4,6,7,8,9].forEach(g => {
    _xpData[g] = {shen:'', tian:'', di:'', xing:'', men:'', ma:false, kong:false};
    _xpManual[g] = false;
  });
  renderXinpan(true);
}
function setPanType(t) {
  // 归一化为数字: 调用方既有 parseInt 过的数字, 也有从存档/会话里取回的字符串,
  // 而下游大量使用 `panType === N` 的严格比较 —— 类型不一致会让分支静默失效。
  t = parseInt(t, 10);
  if (!t || t < 1 || t > 6) t = 1;
  // 金口诀只在时盘(1)与心盘(3)可用。切到其它盘型时若金口诀面板还开着, 直接刷新
  // 页面, 避免残留面板与新盘型混在一起(setPanType 先于 doPan 执行, 故守卫放这里)
  if (t !== 1 && t !== 3 && (document.getElementById('jinkoujueDIV') || _jkShow)) {
    // 记住目标盘型, 刷新后自动切过去 —— 否则这次点击只刷新不切换, 用户得点两次
    try { sessionStorage.setItem('_jkPendingPan', String(t)); } catch (e) {}
    location.reload(); return;
  }
  panType = t;
  _saveMode = t===1?'shi':t===2?'ke':t===3?'xin':t===4?'shanxiang':t===5?'chuanren':'mingli';
  _renderBottomBar();
  let sxIn=document.getElementById('shanxiangInputs');
  if(sxIn)sxIn.style.display=(t===4)?'flex':'none';
  let crIn=document.getElementById('crInputs');
  if(crIn)crIn.style.display=(t===5)?'block':'none';
  let mlIn=document.getElementById('mlInputs');
  if(mlIn)mlIn.style.display=(t===6)?'block':'none';
  let zxjRow=document.getElementById('zxjRow');
  // 自选局已并入 timeRow(见 yinpan.html), zxjRow 现在是空容器; 显隐必须同时管 zxjSpan,
  // 否则心盘/山向/穿壬/命理下会残留一个无用的自选局 select(2026-09-22)
  if(zxjRow){
    let hide=(t===3||t===4||t===5||t===6);
    zxjRow.style.display=hide?'none':'';
    let zs=document.getElementById('zxjSpan');
    if(zs) zs.style.display=hide?'none':'flex';
  }
  let tr=document.getElementById('timeRow');
  if(tr)tr.style.display=(t===4)?'none':'flex';
  document.body.className = document.body.className.replace(/mode-\w+/g,'');
  document.body.classList.add(t===2?'mode-ke':t===3?'mode-xin':'mode-shi');
  /* 命理另挂一个专属标识, 便于给它独立配色/尺寸, 不影响时盘/山向/穿壬 */
  document.body.classList.toggle('mode-mingli', t===6);
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
  let v = parseInt(selZxj.value);
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
let SHEN = {'符':'值符','蛇':'腾蛇','阴':'太阴','六':'六合','白':'白虎','玄':'玄武','地':'九地','天':'九天'};
let XING = {'蓬':'天蓬','任':'天任','冲':'天冲','辅':'天辅','英':'天英','芮':'天芮','柱':'天柱','心':'天心'};
let MEN = {'休':'休门','生':'生门','伤':'伤门','杜':'杜门','景':'景门','死':'死门','惊':'惊门','开':'开门'};
// 宫格渲染时使用: 全名(值符/天蓬/休门) → 简写(符/蓬/休)
let SHEN_ABBR = {}; for(let k in SHEN) SHEN_ABBR[SHEN[k]] = k;
let XING_ABBR = {}; for(let k in XING) XING_ABBR[XING[k]] = k;
let MEN_ABBR = {}; for(let k in MEN) MEN_ABBR[MEN[k]] = k;
window.SHEN_ABBR = SHEN_ABBR; window.XING_ABBR = XING_ABBR; window.MEN_ABBR = MEN_ABBR;
window._SHEN_ABBR = SHEN_ABBR; window._XING_ABBR = XING_ABBR; window._MEN_ABBR = MEN_ABBR;
// 全局四害着色: 共用逐字标记, 颜色由 CSS 类(cx-xing/cx-mu/cx-xingmu)驱动, 暗色主题自动适配
window._siHaiSpan = (ch, isXing, isMu) => {
  if (!ch) return '';
  if (isXing && isMu) return '<span class="cx-xingmu">'+ch+'</span>';
  if (isXing) return '<span class="cx-xing">'+ch+'</span>';
  if (isMu) return '<span class="cx-mu">'+ch+'</span>';
  return ch;
};
// 全局颜色标记: 入墓(棕)/击刑(紫)/门迫(红)/刑+墓(蓝)/空亡(灰)
window._colorSpan = (val, isXing, isMu, isPo, isKong) => {
  if (!val) return '';
  if (isPo) return '<span class="cx-po">'+val+'</span>';
  if (isKong) return '<span class="cx-kong">'+val+'</span>';
  return window._siHaiSpan(val, isXing, isMu);
};
// 五行着色: 木绿/火红/土棕/金橙/水蓝 —— 统一委托给 QM.wxSpan(见 qimen_constants.js),
// 全项目一张单字表, 盘头/三传/大运/八字各处同字同色
window._wxSpan = (s) => (window.QM && QM.wxSpan) ? QM.wxSpan(s) : (s || '');

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

  if(!window._anGanColor){window._anGanColor=(gs,gong)=>{if(!gs)return'';let muR={2:['癸'],6:['戊','丙','乙'],8:['庚','丁','己'],4:['辛','壬']};let xingR={3:['戊'],2:['己'],8:['庚'],9:['辛'],4:['壬','癸']};let r='';for(let ai=0;ai<gs.length;ai++){let ch=gs[ai];let isX=xingR[gong]&&xingR[gong].indexOf(ch)>=0;let isM=muR[gong]&&muR[gong].indexOf(ch)>=0;r+=window._siHaiSpan(ch,isX,isM);}return r;};}
  let agColor= g => {let ag=palaces['gong'+g]?palaces['gong'+g].anGan:'';return ag?window._anGanColor(ag,g):'';};
  let colorSpan=window._colorSpan|| (v => {return v||'';});
  let gridHTML=buildPaipanGrid(palaces,kongGongs,maPosId,agColor,{colorSpan:colorSpan, noClick:true});
  let juLabel=(isYin?'阴遁':'阳遁')+ju+'局';
  let degStart=Math.floor(deg/5)*5,degEnd=degStart+4;
  let shiZhuParts=shiZhu.split(' ');
  let sxYearEl=document.getElementById('selShanXiangYear'),sxY=sxYearEl?sxYearEl.value:new Date().getFullYear();
  let html='<style>.xj-head #tdTitle td{color:var(--c-gold)}.xj-head #itemTitle{color:var(--c-gold);line-height:30px}.xj-head #dTitle{width:16%;color:var(--c-gold)}</style>'+
    '<div id="panHead"><TABLE class="pan xj-head" id="headTable">'+
    '<TR><TD id="itemTitle">山向</TD><TD colspan="3">'+name+' '+degStart+'～'+degEnd+'°</TD><TD>'+sxY+'年</TD></TR>'+
    '<TR><TD id="dTitle">干支</TD><TD class="sizhu">'+window._wxSpan(shiZhuParts[0])+'</TD><TD class="sizhu" style="font-weight:bold">'+window._wxSpan(shiZhuParts[1])+'</TD><TD>黄泉<b>'+hq+'</b></TD><TD>'+juLabel+'</TD></TR>'+
    '<TR id="tdTitle"><TD>旬首</TD><TD>值符</TD><TD>值使</TD><TD>空亡</TD><TD>马星</TD></TR>'+
    '<TR><TD>'+window._wxSpan(sxData.xunShou||'—')+'</TD><TD>天'+sxData.zfStar+'</TD><TD>'+sxData.zsMen+'门</TD><TD>'+window._wxSpan(sxData.kongWang||'—')+'</TD><TD>'+window._wxSpan(sxData.maXing||'—')+'</TD></TR>'+
    '</TABLE></div>'+gridHTML+
    '<TABLE id="btnTable1"><TR>'+
    '<TD><div class="btn" id="btnXiangJu" onclick="toggleXiangJu()">向角度选局</div></TD>'+
    '</TR></TABLE>'+
    '<div id="yixinghuandouDIV"></div>';
  document.getElementById('panWrap').innerHTML=html;
  // 山向盘禁用宫位点击解释
  document.querySelectorAll('[id^="gong"]').forEach(x => {x.onclick=null;x.style.cursor='default';});
  // 重新绑定宫格点击事件(WebView中比inline onclick更可靠)
  let xjBtn=document.getElementById('btnXiangJu');
  if(xjBtn){xjBtn.onclick = () =>{try{toggleXiangJu();}catch(e){tip.style.display='block';tip.innerHTML='<span style=color:red>选局错误:'+e.message+'</span>';}};}
  let xjDeg=document.getElementById('xjuDeg');if(xjDeg)xjDeg.blur();
  document.getElementById('result').style.display='block';
  window._palaces=palaces;
  _renderBottomBar();
  setTimeout(_bindActionButtons,50);scheduleYinGanAlign();
  }catch(e){tip.style.display='block';tip.innerHTML='<span style=color:red>山向错误:'+e.message+'</span>';}
}

function doNewPan(zxjus) { let o={year:Y,month:M,day:D,hour:hr,minute:mn,panType:panType}; if(zxjus){let i=parseInt(selZxj.value)||0;if(i>0){let t=i-1;o.customJu=t<9?{yinYang:"阴",number:9-t}:{yinYang:"阳",number:t-8};}} return window.qimenChart(o); }
function doPan() {
  // 金口诀只在时盘(1)与心盘(3)可用; 切到其它盘型时直接刷新页面,
  // 避免残留的金口诀面板与新盘型混在一起
  if (typeof panType !== 'undefined' && panType !== 1 && panType !== 3) {
    if (document.getElementById('jinkoujueDIV') || _jkShow) { location.reload(); return; }
  }

  // 从DOM下拉框读取用户选择的年月日时分
  Y = parseInt(selY.value) || now.getFullYear();
  M = parseInt(selM.value) || 6;
  D = parseInt(selD.value) || 27;
  hr = parseInt(selH.value) || 0;
  mn = parseInt(selI.value) || 0;
  /* 命理盘的八字区块(qimen_mingli.js / qimen_bazi.js)读的是 window.Y 等, 而这里
     改的是 IIFE 闭包变量 —— 不同步的话, 用户改完时间后四柱行会更新, 而同屏的
     十神/藏干/神煞/胎元/大运仍按"打开页面的那一刻"计算, 两处自相矛盾。 */
  window.Y=Y; window.M=M; window.D=D; window.hr=hr; window.mn=mn;
  /* 切盘时清掉三个开关的残留状态: 下面各盘型分支会提前 return, 不在这里清的话
     (比如)时盘开过"年神将"→切命理→切回时盘, 按钮要点两次才生效。 */
  _tmdhShow=false; _shenShow=0; _stateShowing=false; _diShenShow=false; _renShenShow=false; _xnShow=false; _jkShow=false;


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
          // 中宫不替换值符星: ZF[5]='禽' 即中宫本位星
          // 值使落中宫取「死」(寄坤2) —— 用户定夺口径, 勿改回 ZS[5]='中'
          let zfStar=ZF[zfzsF]||'蓬',zsMenH=ZS[zfzsF]||'休';if(zfzsF===5){zsMenH='死';}
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
          }catch(e){let em=e.message||e;let tipEl=document.getElementById('tip');if(tipEl){tipEl.style.display='block';tipEl.innerHTML='<span style=color:red>山向错误:'+em+'</span>';}}
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
	          } catch(e){ _logErr('xinpanBg', e && e.message); }
          if (bgResult) window._raw = bgResult.raw || '';
          if (bgResult) _qrData = bgResult; // 缓存结构化数据供tianmenDihu复用
	          clearXinpan();
	          return;
	        }
	      
	        
          if (panType === 5) { doChuanRen(); return; }
          if (panType === 6) { doMingli(); return; }
        
	        // 清空天门地户缓存(新排盘后需重新点击)
	        _qrData = null;
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
    // 缓存本次排盘结构化数据(tianmen/dihu引擎无条件计算, 供tianmenDihu即时显示)
    _qrData = qr;

    renderPan(raw, qr);
    tip.innerHTML = '';
    document.getElementById('result').style.display = 'block';
    _renderBottomBar();
  } catch(e) {
    tip.style.display='block'; tip.innerHTML = '<span style="color:red">错误: ' + e.message + '</span>';
  }
}


// ============ renderPan: 解析引擎HTML → 重建数据结构 → 渲染九宫格 ============
function renderPan(raw, engineData) {
  let gongli='', nongli='', sizhu='', jieqi='', zhiFuStr='', zhiShiStr='', xunShou='', kongWang='', maXing='';
  if (engineData && engineData.sizhu) { let d=engineData, sz=d.sizhu;gongli=d.gongli;nongli=d.nongli;sizhu=sz.y.ganZhi+" "+sz.m.ganZhi+" "+sz.d.ganZhi+" "+sz.h.ganZhi;if(sz.minute&&sz.minute.gz)sizhu+=" "+sz.minute.gz;jieqi="";try{if(window.tyme4j&&window.tyme4j.SolarDay){let sd=window.tyme4j.SolarDay.fromYmd(Y,M,D),term=sd.getTerm(),nextTerm=term.next(1),tJD=term.getJulianDay(),tST=tJD.getSolarTime(),tD=tJD.getSolarDay(),nJD=nextTerm.getJulianDay(),nST=nJD.getSolarTime(),nD=nJD.getSolarDay(),pad= v => {return v<10?"0"+v:v};jieqi=term.getName()+" "+tD.getMonth()+"."+tD.getDay()+" "+pad(tST.getHour())+":"+pad(tST.getMinute());jieqi+="~"+nextTerm.getName()+" "+nD.getMonth()+"."+nD.getDay()+" "+pad(nST.getHour())+":"+pad(nST.getMinute())}}catch(e){ _logErr('jieqi', e && e.message); }zhiFuStr=d.zf.n;zhiShiStr=d.zs.n;xunShou=d.xs.gz;kongWang=d.kw.gz;maXing=d.ma.z;
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
  let ZHI_LIST = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  let ZHI2GONG = [1,8,8,3,4,4,9,2,2,7,6,6];
  let maIdx2 = ZHI_LIST.indexOf(maXing);
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
  let ziXuanMark = raw.indexOf('自选') >= 0 ? '<span class="cx-zixuan">自选 </span>' : '';

  // 根据规则重新计算颜色标记(含逐字标记)
  recalcColors(palaces);
  // 存储供按钮函数使用
  window._palaces = palaces;
  window._raw = raw;
  window._yueJiang = yueJiang;
  window._shiZhi = shiGz.length >= 2 ? shiGz[1] : '';
  window._isYin = isYin;   // 玄女十六字诀排布要用(阳顺阴逆)

  // 阴干颜色计算(逐字处理寄干): 委托顶层 _siHaiSpan
  window._anGanColor = (ganStr, gong) => {
    if (!ganStr) return '';
    let result = '';
    for(let ai = 0; ai < ganStr.length; ai++) {
      let ch = ganStr[ai];
      let isX = XING_RULES[gong] && XING_RULES[gong].indexOf(ch) >= 0;
      let isM = MU_RULES[gong] && MU_RULES[gong].indexOf(ch) >= 0;
      result += window._siHaiSpan(ch, isX, isM);
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

  // 如果只有天盘干有标记,同时标记地盘干(两者同干同标记)
  // 合并 isTianXing 和 isDiMu 到最终的标记

  // 构造日期(显示格式: YYYY-MM-DD HH:MM:SS)
  let agColor = g => {
    let ag = palaces['gong'+g] ? palaces['gong'+g].anGan : '';
    return ag ? window._anGanColor(ag, g) : '';
  };
  let wxSpan = window._wxSpan;
  // diShen: 只有时盘需要地八神占位(其余盘型不输出该 span, 布局完全不受影响)
  let gridHTML = buildPaipanGrid(palaces, kongGongs, maPosId, agColor, {colorSpan: window._colorSpan, diShen: panType===1});

  let dStr = Y+'-'+String(M).padStart(2,'0')+'-'+String(D).padStart(2,'0')+' '+
             String(hr).padStart(2,'0')+':'+String(mn).padStart(2,'0')+':00';
  // 日期行已删(见下方), 农历并入节气行; 同时存一份全局给 _doSave 生成记录时间串用
  let nongliShort = String(nongli||'').replace(/^\d+年/,'');
  window._nongliFull = nongli;
  let keCols = panType===2 ? 5 : 4;
  ziXuanMark = raw.indexOf('自选') >= 0 ? '<span class="cx-zixuan">自选 </span>' : '';
  let html =
    '<div id="panHead">' +
    '<TABLE class="pan" id="headTable">' +
    // 试验过把日期行并入节气行 —— **会换行**(节气区间+农历+遁局+月将一行放不下),
    // 节气行从 24 涨到 43px, 净省仅 5px, 得不偿失, 故仍分两行。
    // 但日期行只留农历: 公历部分与顶部时间选择器**完全重复**(选择器 2026/9/22 23:06
    // ↔ 原日期行 2026-09-22 23:06:00), 去掉后无信息损失。
    '<TR><TD id="dTitle">农历</TD><TD colspan="'+keCols+'" id="dateTime">'+nongliShort+'</TD></TR>' +
    '<TR><TD style="color:var(--c-gold)">节气</TD><TD colspan="'+keCols+'">' +
    '<span id="jieqi">'+(jieqi||'节气')+'</span> · ' + ziXuanMark +
    '<font id="yinYang">'+yinYang+'</font>遁<B id="juNum">'+juNum+'</B>局【月将<B id="yueJiang">'+wxSpan(yueJiang)+'</B>】</TD></TR>' +
    '<TR id="tdTitle"><TD>旬首</TD><TD>值符</TD><TD>值使</TD><TD>马星</TD>'+(panType===2?'<TD colspan=2>空亡</TD>':'<TD>空亡</TD>')+'</TR>' +
    '<TR><TD id="xunShou">'+wxSpan(xunShou)+'</TD><TD>天<font id="zhiFu">'+zhiFuShort+'</font></TD>' +
    '<TD><font id="zhiShi">'+zhiShiShort+'</font>门</TD>' +
    '<TD id="maXing">'+wxSpan(maXing)+'</TD>'+(panType===2?'<TD colspan=2 id="kongWang">'+wxSpan(kongWang)+'</TD>':'<TD id="kongWang">'+wxSpan(kongWang)+'</TD>')+'</TR>' +
    '<TR><TD style="color:var(--c-gold)" rowspan=2>'+(panType===2?'五柱':'四柱')+'</TD>' +
    '<TD class="sizhuTitle">年柱</TD><TD class="sizhuTitle">月柱</TD>' +
    '<TD class="sizhuTitle">日柱</TD><TD class="sizhuTitle">时柱</TD>' +
    (panType===2?'<TD class="sizhuTitle">刻柱</TD>':'') + '</TR>' +
    // 四柱横排(干支同行)而非竖排: 原来天干+<br>+地支占两行, 每行 49px;
    // 横排后单行约 25px, 一行省 24px。字号不变, 每格 71px 宽足够容纳两字。
    '<TR><TD class="sizhu" id="nianzhu">'+wxSpan(nianGz[0]||'')+wxSpan(nianGz[1]||'')+'</TD>' +
    '<TD class="sizhu" id="yuezhu">'+wxSpan(yueGz[0]||'')+wxSpan(yueGz[1]||'')+'</TD>' +
    '<TD class="sizhu" id="rizhu">'+wxSpan(riGz[0]||'')+wxSpan(riGz[1]||'')+'</TD>' +
    '<TD class="sizhu" id="shizhu">'+wxSpan(shiGz[0]||'')+wxSpan(shiGz[1]||'')+'</TD>' +
    (panType===2 ? '<TD class="sizhu" id="kezhu">'+wxSpan(keGz[0]||'')+wxSpan(keGz[1]||'')+'</TD>' : '') +
    '</TR></TABLE></div>' +
    gridHTML +
    '<div id="Tip">颜色说明：<span class="cx-mu">入墓</span>、<span class="cx-xing">击刑</span>、<span class="cx-po">门迫</span>、<span class="cx-xingmu">刑+墓</span></div>' +
    '<TABLE id="btnTable1"><TR>' +
    '<TD><div class="btn" id="btn1" onclick="showYixing()">移星换斗</div></TD>' +
    '<TD><div class="btn" id="btn3" onclick="tianmenDihu()">天门地户</div></TD>' +
    '<TD><div class="btn" id="btn2" onclick="showState()">长生状态</div></TD>' +
    '<TD><div class="btn"><span onclick="panChange(-1)" id="preBtn">上局</span>|<span onclick="panChange(1)" id="nextBtn">下局</span></div></TD>' +
    '</TR></TABLE>' +
    // 刻盘用不到年月日时神将(多了刻柱, 神将只按年月日时四支取, 排出来没有意义)
    (panType===2 ? '' :
    '<TABLE id="btnTable2"><TR>' +
    '<TD><div class="btn" id="btn4" onclick="shen12(1)">年神将</div></TD>' +
    '<TD><div class="btn" id="btn5" onclick="shen12(2)">月神将</div></TD>' +
    '<TD><div class="btn" id="btn6" onclick="shen12(3)">日神将</div></TD>' +
    '<TD><div class="btn" id="btn7" onclick="shen12(4)">时神将</div></TD>' +
    '</TR></TABLE>') +
    // 地八神: 时盘专用, 排在年神将下方
    ((panType===1 || panType===3) ?
    '<TABLE id="btnTable3"><TR>' +
    '<TD><div class="btn" id="btnDiShen" onclick="toggleDiBaShen()">地八神</div></TD>' +
    '<TD><div class="btn" id="btnRenShen" onclick="toggleRenBaShen()">人八神</div></TD>' +
    '<TD><div class="btn" id="btnXuanNv" onclick="xuanNv16()">玄女16诀</div></TD>' +
    '<TD><div class="btn" id="btnJinKou" onclick="toggleJinKouJue()">金口诀</div></TD>' +
    '</TR></TABLE>' : '') +
    '<div id="yixinghuandouDIV"></div>';

  document.getElementById('panWrap').innerHTML = html;
  // 地八神符号先算好放着(默认不显示), 点按钮才写到宫格里
  if (panType === 1) {
    _diShenMap  = buildDiBaShenMap(palaces, isYin);
    _renShenMap = buildRenBaShenMap(palaces, isYin, zhiShiShort);
    _xn4Map = buildXuanNv4Map(palaces, isYin);
    paintDiBaShen(_diShenShow); paintRenBaShen(_renShenShow);
  }

  // 清空waipan(新排盘后天门地户需重新点击)
  for(let wp = 1; wp <= 12; wp++) {
    let el = document.getElementById('waipan'+wp);
    if (el) { el.innerHTML = ''; el.style.fontSize = ''; el.style.lineHeight = ''; }
  }
  setTimeout(_bindActionButtons, 10);
  scheduleYinGanAlign();
}

/* ══════════════════ 地八神 (时盘) ══════════════════
   天八神是盘面自带的那一圈; 地八神不显示在盘上, 需另排:

     起宫: 值符落宫的【天盘干】→ 该干在【地盘】上的落宫, 从该宫起"符"
     排布: 沿绕宫环 ZHUAN=[坎1,艮8,震3,巽4,离9,坤2,兑7,乾6] 阳遁顺行、阴遁逆序,
           顺序固定为 符 蛇 阴 六 白 玄 地 天

   这里刻意复用引擎排天八神用的同一个环与同一组顺序表(QM.ZHUAN / QM.SHEN_A / QM.SHEN_Y),
   免得两处口径走岔。中宫没有环位, 起宫落在中宫时寄坤二。
   两个特例按文档口径处理: 天盘干取首字(第二字是中宫寄干, 不作依据)。 */
let _diShenShow = false;
let _diShenMap = null;
let _renShenShow = false;
let _renShenMap = null;

/* 给定起宫, 沿环把八个神铺到八宫 —— 地八神与人八神只有"起宫"不同, 排布共用这里。
   中宫没有环位, 起宫落在中宫时寄坤二。 */
function _layBaShen(startG, isYin) {
  const HUAN = QM.ZHUAN, FZ = QM.FZHUAN, SO = isYin ? QM.SHEN_Y : QM.SHEN_A;
  if (!HUAN || !FZ || !SO || !startG) return null;
  if (startG === 5) startG = 2;
  const vSh = FZ[startG] - 1, map = {};
  for (let i = 1; i < 9; i++) {
    let j = i - vSh;
    if (j < 1) j += 8;
    if (j > 8) j -= 8;
    map[HUAN[i]] = SO[j];
  }
  return map;
}

function buildDiBaShenMap(palaces, isYin) {
  try {
    if (!palaces || !window.QM) return null;
    const HUAN = QM.ZHUAN, FZ = QM.FZHUAN, SO = isYin ? QM.SHEN_Y : QM.SHEN_A;
    if (!HUAN || !FZ || !SO) return null;
    // 1) 值符落宫
    let zfG = 0;
    for (let g = 1; g <= 9; g++) {
      const p = palaces['gong' + g];
      if (p && p.shen && (window.SHEN_ABBR || {})[p.shen] === '符') { zfG = g; break; }
    }
    if (!zfG) return null;
    // 2) 该宫的天盘干
    const tg = (palaces['gong' + zfG].tian || '')[0];
    if (!tg) return null;
    // 3) 这个干在地盘上的落宫
    let startG = 0;
    for (let g = 1; g <= 9; g++) {
      const d = palaces['gong' + g] ? palaces['gong' + g].di : '';
      if (d && d.indexOf(tg) >= 0) { startG = g; break; }
    }
    if (!startG) return null;
    // 4) 起符, 阳顺阴逆
    return _layBaShen(startG, isYin);
  } catch (e) { _logErr('diBaShen', e && e.message); return null; }
}

/* 人八神: 起宫换成【值使门落宫】, 其余与地八神完全一致 */
function buildRenBaShenMap(palaces, isYin, zhiShiMen) {
  try {
    if (!palaces || !zhiShiMen) return null;
    const abbr = window.MEN_ABBR || {};
    let startG = 0;
    for (let g = 1; g <= 9; g++) {
      const m = palaces['gong' + g] ? palaces['gong' + g].men : '';
      if (m && ((abbr[m] || m) === zhiShiMen || m === zhiShiMen)) { startG = g; break; }
    }
    if (!startG) return null;
    return _layBaShen(startG, isYin);
  } catch (e) { _logErr('renBaShen', e && e.message); return null; }
}

function paintDiBaShen(show) {
  for (let g = 1; g <= 9; g++) {
    const el = document.getElementById('dshen' + g);
    if (el) el.textContent = (show && _diShenMap && _diShenMap[g]) ? _diShenMap[g] : '';
  }
}

/* 开关型按钮的"已开启"态与各开关的实际状态保持同步(描边由 CSS .btn.on 给)。
   移星换斗看面板显隐, 其余三个看各自的标志位。 */
function _syncToggleBtns() {
  const yxDiv = document.getElementById('yixinghuandouDIV');
  const on = {
    btn1: !!(yxDiv && yxDiv.style.display === 'block'),
    btn2: !!_stateShowing,
    btn3: !!_tmdhShow,
    btn4: _shenShow === 1, btn5: _shenShow === 2, btn6: _shenShow === 3, btn7: _shenShow === 4,
    btnXuanNv: !!_xnShow,
    btnJinKou: !!_jkShow
  };
  for (const id in on) { const el = document.getElementById(id); if (el) el.classList.toggle('on', on[id]); }
}

/* ══════════════ 金口诀 · 文字资料 ══════════════
   长按"金口诀"按钮弹出。据讲义(特训班/提高班)整理,
   起例部分按讲义原文与课例逐条核对过。 */
/* ══════ 金口诀 · 内置教材 ══════
   由 13 章正文 + 课例班特别篇合成; 条数上万, 采用按章懒渲染(lazy)。
   凡讲义未给起例者, 文中如实注明, 不代拟规则。 */
const JK_HELP = {
  toc: true,
  lazy: true,
  title: '金口诀',
  head: '人元 · 贵神 · 将神 · 地分　（大金口 · 四位断课）<br><span style="font-size:11px">共 14 章 · 点上方目录可跳转</span>',
  blocks: [
    { t: '第一章　预测的原理与阴阳五行', rows: [
      '<b style="color:var(--c-gold)">引言</b>',
      '<b>这本书要教你什么</b>',
      '金口诀是中国传统预测术的一种。所谓"预测术"，就是古人通过一套符号系统，来推断人事吉凶、事物发展趋势的方法。这类方法在中国流传了几千年，门派很多，金口诀是其中<b>体系最简洁、上手最快</b>的一种。',
      '<b>它简洁到什么程度？</b> 别的预测术排一个盘要写满一整页，金口诀只要四行字：',
      '<code>`</code>',
      '人元：庚',
      '贵神：癸亥(天后)',
      '将神：戊午(胜光)',
      '地分：申',
      '<code>`</code>',
      '<b>就这四行字。</b> 熟练的人看一眼，就能说出十几二十条信息——对方的工作性质、性格特点、家里的情况、最近发生的事、事情的走向。',
      '听起来不可思议，但它确实是这样。原因不在于什么神秘力量，而在于<b>这四行字背后的那套符号系统极其严密</b>。',
      '<b>为什么要先讲原理</b>',
      '很多人学这门学问，是从背口诀开始的。<b>这是走错了路。</b>',
      '口诀是前人对经验的总结，但如果你不知道它的道理从哪来，就只会生搬硬套。<b>遇到口诀没覆盖的情况，就断不出来了。</b>',
      '所以第一章先讲三件事：',
      '<b>这套系统凭什么能预测</b>——原理是什么',
      '<b>符号系统的起点</b>——阴阳',
      '<b>符号系统怎么运作</b>——五行，以及阴阳五行怎么落到干支上',
      '<b>如果你是零基础，这一章请慢慢看。</b> 凡是专业术语，第一次出现我都会解释。',
      '---',
      '<b style="color:var(--c-gold)">第一节　预测的原理</b>',
      '<b>一、金口诀是一个"模拟系统"</b>',
      '<b>1.1 先破除一个误解</b>',
      '很多人一听"预测"，第一反应是"算命"，然后想到"命中注定"。',
      '<b>金口诀不是这个路子。</b>',
      '金口诀<b>不看你"是什么命"</b>，它看的是<b>你此刻所处的状态</b>。同一个人的同一件事，今天起课和明天起课，结果可能完全不同——因为时间变了，课就变了，抓到的信息也就变了。',
      '<b>打个比方就明白了</b>：',
      '茶壶和手机都是物件，但用途完全不同。金口诀问的不是"你是什么"，而是"<b>你现在处在什么状态</b>"。',
      '<b>所以金口诀的核心不是"宿命"，而是"状态"。</b> 它回答的是这样几个问题：',
      '现在处于什么情况？',
      '将来如何？',
      '以前是什么情况？',
      '主要针对哪方面求测？',
      '何时解决（应期）？',
      '怎么解决（化解）？',
      '<b>注意最后两条</b>——它不只说"会怎样"，还说"什么时候"和"怎么办"。这说明它的定位是<b>分析工具</b>，不是<b>命运判决书</b>。',
      '<b>1.2 模拟：课式模仿了天地人的结构</b>',
      '那这套系统凭什么能推算？',
      '<b>它的原理是"模拟"。</b>',
      '<b>金口诀的课式模拟天体运行，宇宙全息论学说，模拟人体学说，达到天地人合一、人与事合一的科学模拟结构。</b>',
      '<b>金口诀是一个模拟宇宙规律、生活规律、人事规律、伦理规律等的结构体。</b>',
      '<b>注意"模拟"这两个字。</b> 它不是说这四个位置"真的就是"天地人，而是说——<b>这四个位置的结构，与天地人的结构是相似的</b>。',
      '古人认为：<b>大宇宙和小宇宙是同构的</b>。大到天体运行，小到一人一事，都遵循同样的规律。所以只要建立一个"结构相似"的模型，就能用来推演。',
      '<b>这个模型就是课式</b>：',
      '<code>`</code>',
      '人元   ← 天（最上，最高层）',
      '贵神   ← 人（次上，外部关系）',
      '将神   ← 人（再次，自身）',
      '地分   ← 地（最下，根基）',
      '<code>`</code>',
      '<b>四个位置模拟了"天地人"三层结构</b>，所以叫<b>天地人的模拟系统</b>。',
      '<b>这个模拟系统强到什么程度？</b>',
      '<b>金口诀的模拟性特强，恰恰是因为它的模拟性性强，所以它能断万事万物。</b>',
      '<b>为什么模拟性强就能断万事万物？</b> 因为既然是"模拟"，那么<b>同一个模型可以套用到不同的事情上</b>：',
      '问事业，四位的结构对应一个单位（领导、部门、自己、基础）',
      '问家庭，四位的结构对应一个家庭（长辈、外面、自己、家宅）',
      '问身体，四位的结构对应一具身体（头、胸、腹、腿脚）',
      '甚至<b>直接断人的脸部</b>——就用这一个课，不改任何东西，专门断这个人的脸长什么形状',
      '<b>所以课体「可大可小、可长可短、可粗可细，灵活变化」</b>。大可以是整体，小可以是某个部分。',
      '<b>金口诀很像一个运算公式</b>：<b>输入不同的数值，套用同一个公式，就能算出不同的结果。</b>',
      '<b>1.3 把四位当四个人看</b>',
      '理解"模拟"最好的办法，是<b>把四位当成四个人</b>。',
      '就像一个房间里来了四个人，这四个人都是什么人物？他就代表将要有什么事发生。有性格倔强固执的，温柔恬顺的，刚强坚毅的，桃花的，爱生气的，拍马屁的，性子急躁的口才好，文科好理科好的。<b>首先你先要自己心中有数。</b>',
      '然后看他们所居的位置，再分析其旺衰。<b>如果来的这四个人配合得好，就能容易促成事情的成功；如果这四个人矛盾多，还有不对眼有仇的，这就代表事物不会顺利进行了。</b>',
      '如果出现分帮结派的就更难配合……比如来了一个爱闹事的，但他今天状态不好、处于休死空的状态，就对事物起不到很大破坏作用。<b>所以分析旺衰是很关键的一步。</b>',
      '<b>这段话说透了断课的全部要诀</b>：',
      '<b>先认清四个人是谁</b>（取象）',
      '<b>看他们坐在哪个位置</b>（四位）',
      '<b>看他们各自的状态强弱</b>（旺衰）',
      '<b>看他们之间的关系</b>（生克冲合）',
      '<b>这就是"形象化、生活化的断课思维"。</b>',
      '<b>二、全息：课内任何信息都是你的信息</b>',
      '<b>2.1 什么是全息</b>',
      '"模拟"之外，还有第二个原理：<b>全息</b>。',
      '<b>什么叫全息？</b> 简单说就是——<b>局部包含了整体的全部信息</b>。',
      '<b>把课内的三个地支逐个与相对应的年月分析变化，再结合课内五行所临的位置，分析出所变化的结果。比如贵神受克，代表工作受阻；将神受克，代表财运和人身的损害；地分受克，代表固定不动的那部分信息事物出问题。</b>',
      '<b>不能只是简单地分析用神怎么样，因为在分析流年月时，课内的任何信息都是你自身的信息，哪个地支出问题，就代表哪里出了问题。这样进行综合判断，就是信息的全息论。</b>',
      '<b>核心是这一句</b>：',
      '<b>课内的任何信息，都是你自身的信息。</b>',
      '<b>不是"用神代表你，别的与你无关"</b>——而是<b>四位全都是你的信息</b>，只是各自代表的部分不同：',
      '| 位置 | 受克时代表什么出问题 |',
      '|---|---|',
      '| <b>人元</b> | 大方向、头脑、上级 |',
      '| <b>贵神</b> | <b>工作受阻</b> |',
      '| <b>将神</b> | <b>财运和人身的损害</b> |',
      '| <b>地分</b> | <b>固定不动的那部分信息事物</b>（房子、存款、孩子） |',
      '<b>2.2 为什么不能只看用神</b>',
      '很多人断课只看用神，忽略其他三位：',
      '<b>为什么有的金口诀断课简单枯燥？就是很大成分忽略了用神外的部分，因为其他的干支于己无关高高挂起。比如说我们去谈判要用到嘴，用到手，难道其他的身体部分留家里吗？你的脚受伤了，其他部位出问题了，你照样没法去工作。所以他们是一个整体，但又各分工不同。</b>',
      '<b>这个比喻很到位</b>：谈判要用到嘴、用到手，但不能说脚伤了不影响谈判。<b>身体是一个整体，课也是一个整体。</b>',
      '<b>三、公式学：为什么它像计算而不是"通灵"</b>',
      '<b>3.1 金口诀是公式学</b>',
      '<b>金口诀的性质，是公式学的计算与五行感知的体系。</b>',
      '<b>"公式学"这三个字很关键。</b> 它说明：',
      '金口诀<b>有固定的推演规则</b>，不是凭感觉乱说',
      '只要输入正确的数据（四柱、地分），<b>结果是可以重复验证的</b>',
      '学会规则的人，<b>都能算出同样的结果</b>',
      '<b>这就像做数学题</b>：掌握了公式，谁来算都一样。',
      '<b>但金口诀又不完全是机械计算</b>——它还需要"<b>五行感知</b>"。因为五行的取象是活的（比如"水"既可以代表智慧，也可以代表小偷、军人、会计），<b>具体取哪个象，要靠对五行的理解去判断</b>。',
      '<b>所以它是"公式 + 感知"的结合</b>：',
      '| 部分 | 性质 |',
      '|---|---|',
      '| <b>推演规则</b>（生克冲合、旺衰空亡） | <b>公式</b>，可重复 |',
      '| <b>取象</b>（水代表什么） | <b>感知</b>，靠功底 |',
      '<b>3.2 "五行感知"是什么意思</b>',
      '<b>举个例子</b>：课中水旺。',
      '按<b>公式</b>：水旺则火死（水克火）',
      '但<b>取什么象</b>？水代表智慧？代表隐私？代表小偷？代表军人？代表会计？',
      '<b>这就要看具体课体</b>：',
      '如果问工作，水旺可能是<b>流动性强的工作</b>',
      '如果问性格，水旺可能是<b>聪明、善策划</b>',
      '如果问婚姻，水旺可能是<b>阴私过重、感情不稳</b>',
      '<b>同样一个"水旺"，取象不同，断出来的话完全不同。</b> 这就是为什么说"感知"很重要。',
      '<b>3.3 金口诀与"命"无关</b>',
      '这一点很重要：',
      '<b>金口诀与"命"无关。</b>',
      '<b>什么意思？</b> 传统八字讲的是"你是什么命"——一生的格局。而<b>金口诀问的是"此刻这件事怎么样"</b>。',
      '<b>所以</b>：',
      '同一个人，<b>同样的问题，不同时间起课，结果可能不同</b>（因为状态变了）',
      '用神<b>每次都不同</b>（取决于起课时的四柱和地分）',
      '<b>这就是为什么金口诀能"专事专断"</b> —— 它不预设你的命，只分析你此刻的状态。',
      '<b>四、基础是什么</b>',
      '<b>4.1 两种基础</b>',
      '学这门学问，常听人说"基础最重要"。<b>但基础到底是什么？</b>',
      '<b>基础一个是指干支、生克、刑冲等，再就是实践也是一种基础——一种是理论基础，再就是行动基础。</b>',
      '<b>两类基础缺一不可</b>：',
      '| 基础 | 内容 | 怎么练 |',
      '|---|---|---|',
      '| <b>理论基础</b> | 干支、生克、刑冲合害 | 读书、记忆、理解 |',
      '| <b>行动基础</b> | 断课的手感 | <b>必须实际断课</b> |',
      '<b>"行动基础"常被忽略</b>。要害就在这里：',
      '<b>最大的学习障碍是"不敢断"——实践不可省。</b>',
      '<b>学三天就能断课，但不敢断就永远学不会。</b> 因为取象的功夫，是在一次次实际断课中练出来的，不是读书读出来的。',
      '<b>4.2 断课最难的三关</b>',
      '<b>断课最难的三关——从哪下手、怎么全面、怎么活变。</b>',
      '<b>从哪下手</b>——拿到一个课，第一步看什么',
      '<b>怎么全面</b>——怎么不遗漏信息',
      '<b>怎么活变</b>——四位是活的，怎么根据问题调整',
      '<b>这三关贯穿全书</b>，后面的章节都会围着它们转。',
      '<b>4.3 本课总纲</b>',
      '<b>第一章的内容很多，但有一条可以统领全部</b>：',
      '<b>十二地支类象不必死记，关键是把五行属性吃透。</b>',
      '<b>为什么？</b> 因为所有的取象，<b>都是从五行本性推出来的</b>。',
      '<b>举个例子</b>：水为什么代表会计？',
      '水的本性是<b>流动、缜密、渗透</b>',
      '会计的工作<b>要精确、要细致、要和数字打交道</b>',
      '所以水的"缜密"这一面，就对应到会计',
      '<b>这个推演过程，才是要学的</b>。而死记"水代表会计"，遇到别的情况就不知道水还代表什么了。',
      '<b>所以本课的总纲是</b>：',
      '<b>从"五行属性"讲到"五行的人"，再讲到"五行的事"。</b>',
      '---',
      '<b style="color:var(--c-gold)">第二节　阴阳</b>',
      '<b>一、一分为二</b>',
      '古人观察世界，发现一个很普遍的现象：<b>任何事物都可以一分为二，而且这两面总是成对出现。</b>',
      '有白天，就有黑夜。有男人，就有女人。有上面，就有下面。',
      '这种成对出现的两面，古人用两个字概括：<b>阴</b>和<b>阳</b>。',
      '<b>具体怎么分？三个层面：</b>',
      '<b>从性质上分</b>：',
      '男为阳，女为阴',
      '公为阳，母为阴',
      '正面的为阳，负面的为阴',
      '得到的为阳，失去的为阴',
      '<b>从空间上分</b>：',
      '天为阳，地为阴',
      '上为阳，下为阴',
      '左为阳，右为阴',
      '外为阳，内为阴',
      '<b>从时间上分</b>：',
      '白天为阳，夜晚为阴',
      '过去为阳，未来为阴',
      '生为阳，死为阴',
      '<b>你会发现一个规律</b>：凡是<b>上升的、明亮的、外向的、刚强的</b>，都是阳；凡是<b>下降的、暗淡的、内向的、柔弱的</b>，都是阴。抓住这个感觉，比死记分类有用。',
      '<b>二、阴阳的转化</b>',
      '<b>阴阳相互依存，不能独立存在。</b>',
      '没有阳，阴就不存在；没有阴，也就无所谓阳。',
      '如果没有"上"这个概念，"下"还有意义吗？<b>阴阳是相对而言的，必须成对出现。</b>',
      '<b>同时，阴阳不断转化。</b>',
      '日往则月来，月往则日来，日月相推而明生焉；',
      '寒往则暑来，暑往则寒来，寒暑相推而岁成焉。',
      '<b>阳极生阴，阴极生阳</b>——这是一个循环，永远不会停在一个极端。',
      '<b>这个特性在断课时非常重要：</b>',
      '<b>纯阳课</b>（四位全阳）不能简单断"阳气旺盛，大吉"。因为<b>纯阳不长</b>——阳气到极点就要往阴走，所以这种课反而提示"<b>事情发展到顶峰，接下来要走下坡路，宜速不宜迟</b>"',
      '<b>纯阴课</b>（四位全阴）也不能断"一片阴暗，凶"。<b>纯阴不生</b>，但阴极必反，所以这种课往往提示"<b>目前状态消沉，但即将转暗为明，宜耐心等待时机</b>"',
      '<b>这就是"物极必反"在断课中的应用。</b>',
      '<b>三、阴阳落到干支上</b>',
      '为了把阴阳用符号表达出来，古人发明了<b>天干</b>和<b>地支</b>。',
      '<b>十天干，一共十个：</b>',
      '甲　乙　丙　丁　戊　己　庚　辛　壬　癸',
      '每个都带阴阳属性。<b>看位置，单数位置是阳，双数位置是阴</b>：',
      '| 阳干（第1、3、5、7、9位） | 阴干（第2、4、6、8、10位） |',
      '|---|---|',
      '| 甲　丙　戊　庚　壬 | 乙　丁　己　辛　癸 |',
      '<b>十二地支，一共十二个：</b>',
      '子　丑　寅　卯　辰　巳　午　未　申　酉　戌　亥',
      '| 阳支（第1、3、5、7、9、11位） | 阴支（第2、4、6、8、10、12位） |',
      '|---|---|',
      '| 子　寅　辰　午　申　戌 | 丑　卯　巳　未　酉　亥 |',
      '<b>读法提示</b>：「干支」的「干」读 gān，「支」读 zhī。这二十二个字一开始不认识很正常，念熟就好。',
      '<b>为什么叫"天干"和"地支"？</b>',
      '<b>天干是天上五气、地支是地上五气。</b>',
      '<b>就像云和雨的关系</b>：天上的云是"象"，看不见摸不着，但它决定了会不会下雨；地下的雨是"形"，看得见摸得着。<b>云可以化成雨，雨不能再变回云。</b>',
      '<b>这就是为什么第一章后面要讲</b>：<b>天干是象，地支是形；天干可以变成地支，地支不能变成天干。</b>',
      '<b>干支怎么配对：六十甲子</b>',
      '有了天干地支，古人把它们<b>两两配对</b>，用来标记时间。',
      '<b>配对的规则很简单，但有一条铁律：阳配阳，阴配阴。</b>',
      '拿天干第一个"甲"配地支第一个"子"，得到"甲子"；然后天干用"乙"，地支用"丑"，得到"乙丑"。依此类推。',
      '<b>走到第十位时会出现一个情况</b>：天干只有十个，用完了；地支还有两个（戌、亥）没用。怎么办？<b>天干从头再来</b>（回到"甲"），<b>地支继续往下走</b>（接"戌"）。',
      '于是得到六十甲子：',
      '<code>`</code>',
      '甲子、乙丑、丙寅、丁卯、戊辰、己巳、庚午、辛未、壬申、癸酉、',
      '甲戌、乙亥、丙子、丁丑、戊寅、己卯、庚辰、辛巳、壬午、癸未、',
      '甲申、乙酉、丙戌、丁亥、戊子、己丑、庚寅、辛卯、壬辰、癸巳、',
      '甲午、乙未、丙申、丁酉、戊戌、己亥、庚子、辛丑、壬寅、癸卯、',
      '甲辰、乙巳、丙午、丁未、戊申、己酉、庚戌、辛亥、壬子、癸丑、',
      '甲寅、乙卯、丙辰、丁巳、戊午、己未、庚申、辛酉、壬戌、癸亥',
      '<code>`</code>',
      '<b>正好六十个</b>，到"癸亥"结束，再往下又回到"甲子"。',
      '<b>注意那条铁律的效果</b>：因为阳干只配阳支、阴干只配阴支，所以<b>永远不会出现"甲丑"这样的组合</b>。你可以自己检查上面那六十个：第一个字和第二个字的阴阳属性一定一致。',
      '<b>六十甲子用来标记年、月、日、时</b>。年、月、日、时各有一个干支，合起来叫"<b>四柱</b>"——这是起课的第一步，第六章会详细讲。',
      '<b>为什么是六十？</b> 十和十二的最小公倍数是六十。天干转六圈、地支转五圈，正好回到起点。',
      '<b>在课式中怎么标记阴阳</b>',
      '金口诀记录一个课时，会在五行后面标符号：<b>阳标「＋」，阴标「－」</b>。',
      '<code>`</code>',
      '人元：庚        金 + 休',
      '贵神：癸亥(天后) 用 水 - 旺',
      '将神：戊午(胜光)    火 + 死',
      '地分：申        金 + 休',
      '<code>`</code>',
      '"金 + "表示庚金是阳金，"水 - "表示癸亥水是阴水。后面的"休""旺""死"叫<b>旺衰</b>，第七章会讲。',
      '<b>这条规则在断课中很实用</b>：有一条规矩叫「<b>阳干配阳位、阴干配阴位</b>」，<b>遁干必须合阴阳</b>——阳干落在阴位上就不合。这是断课的一个细节，后面会用到。',
      '---',
      '<b style="color:var(--c-gold)">第三节　五行总论</b>',
      '<b>一、从阴阳到五行</b>',
      '阴阳把事物分成两类，但两类太粗。同样是"阳"，火和木一样吗？显然不一样。',
      '所以古人又往下细分，归成<b>五类</b>，用五种物质代表：<b>金、木、水、火、土</b>。',
      '<b>这五类就是五行。</b>「行」是运行、运动的意思，<b>强调的是这五种力量之间的运动和相互作用</b>，不是五种静止的物质。',
      '<b>五行的分量，从这一句就能看出来</b>：',
      '<b>五行生克制化是总纲。</b>',
      '<b>整本金口诀，说到底就是讲五行怎么生、怎么克、怎么制、怎么化。</b>',
      '<b>二、五行相生与相克</b>',
      '<b>相生</b>，就是一方对另一方有滋生、促进、助长的作用。<b>相克</b>，就是一方对另一方有克制、压制、削弱的作用。',
      '<b>五行相生</b>：',
      '<b>木生火，火生土，土生金，金生水，水生木。</b>',
      '<b>五行相克</b>：',
      '<b>木克土，土克水，水克火，火克金，金克木。</b>',
      '<b>怎么记住相生？理解物性就自然记住了：</b>',
      '<b>木生火</b>——木头能燃烧，烧起来就是火',
      '<b>火生土</b>——火烧完剩下灰烬，灰烬归到土里',
      '<b>土生金</b>——土里挖矿能挖出金属',
      '<b>金生水</b>——金属加热到一定温度会熔化成液体',
      '<b>水生木</b>——树木生长离不开水',
      '<b>怎么记住相克？同样理解物性：</b>',
      '<b>木克土</b>——古代农具是木头做的，用木器松土种田',
      '<b>土克水</b>——俗话说"水来土掩"，用土筑坝能把水堵住',
      '<b>水克火</b>——"水火不容"，水是火的克星',
      '<b>火克金</b>——火有温度，金属遇火就熔化',
      '<b>金克木</b>——砍树要用金属斧锯，金有肃杀之气',
      '<b>相生是一个圈，相克是一个五角星。每个五行都"生"一个、"克"一个，同时被一个"生"、被一个"克"。</b> 这样整个系统就保持平衡了。',
      '<b>把这两套关系记住，是学这门学问的最低门槛。</b>',
      '<b>万物生于土、死于土</b>',
      '五行的生克还有一个总规律：',
      '<b>万物生于土、死于土。</b>',
      '<b>什么意思？</b> 看相生循环：<b>火生土，土生金</b>——土是"生出万物的中间环节"。看相克循环：<b>木克土，土克水</b>——土被克之后，整个循环才能继续。',
      '<b>这句话在断课上的意义</b>：<b>土在课中位置特殊</b>，它既是万物的母亲（生万物），又是事物的归宿（万物归于土）。所以断课时<b>土的状态要特别注意</b>——土若受克严重，往往主事物失去根基。',
      '<b>三、生克的"量"</b>',
      '<b>3.1 相克不是无条件的</b>',
      '<b>相克受"量"的制约。</b>',
      '<b>一个木只能克一个土。</b> 如果课中出现<b>一木三土</b>，那个木根本没有力量去克三个土，只能<b>一对一地算</b>。',
      '<b>但这不等于木就不克土了</b>，有个很形象的比喻：',
      '<b>就像猫抓老鼠是它的天性，猫要是病了，抓不动老鼠，但不代表它不抓老鼠。</b>',
      '<b>木克土的性质始终存在，只是力量够不够的问题。</b>',
      '<b>反过来</b>：如果那三个土本身已经处在<b>休死</b>的状态（力量很弱），那么被木一克就<b>一触即溃</b>。同样的相克，结果完全不同——差别就在土自身的状态。',
      '<b>3.2 水多木漂</b>',
      '再看一个反常识的现象。',
      '水生木是常理。但<b>水太多</b>呢？',
      '<b>木反而会浮起来，扎不下根</b>——这就是「<b>水多木漂</b>」，这时候"水生木"这层关系就<b>体现不出来</b>了。',
      '<b>同样的道理</b>：',
      '金能生水，但水过多时，金的力量反而显不出来',
      '土能生金，但土太多时，金也一样显不出来',
      '<b>用在求财上</b>，就有一句话叫「<b>水火不求财</b>」——看着是水生木、木生财，实际上钱财像打水漂一样，留不住。',
      '<b>3.3 水在木下生木"不情愿"</b>',
      '<b>还有一个细节</b>：水的方向是<b>向下</b>的，木的方向是<b>向上</b>的。',
      '所以<b>水在木的下面时，生木是"不情愿"的</b>（要往上送）。反过来，<b>水在木的上面生木，就顺畅得多</b>。',
      '<b>这就是"位置决定力度"</b> ——同样的生克关系，上下位置不同，效果差别很大。',
      '<b>3.4 凡事都有个度</b>',
      '<b>为什么会这样？因为凡事都有一个度。</b>',
      '古人用了个很贴切的比喻：<b>就像一位母亲生孩子，生孩子是好事，可生得太多，母亲的身体也就垮了。</b>',
      '<b>所以断课遇到复杂课体时，不要急着下断语，先掂一掂各方的分量。</b>',
      '<b>四、反常：生未必好，克未必坏</b>',
      '<b>并非生的都好，克的都坏。</b> 关键在<b>平衡</b>。物极必反——就像爬山，到了顶峰只能往下走；跌到谷底只能往上走。',
      '<b>用到断课上，有两层意思：</b>',
      '<b>4.1 过旺和过衰都是病</b>',
      '<b>过旺者为病</b>——某一行力量太强，压制了其它行',
      '<b>过衰者为病</b>——某一行力量太弱，被其它行压制',
      '<b>五行所缺亦是病</b>——课里完全没有某一行，同样出问题',
      '比如<b>木过旺</b>，多与肝胆类疾病相关，性情上则偏自私刻薄。',
      '<b>"过旺而不及"</b>——这是古人的说法：<b>太过和不及，同样是毛病。</b>',
      '<b>4.2 课内旺而无制不是好事</b>',
      '<b>这里有一个很容易搞反的地方</b>：',
      '<b>课内旺而无制，不是好事；用神旺，不等于结果好。</b>',
      '<b>为什么？</b> 因为旺到极处就要转向。<b>一棵树长得太旺、枝条乱长，反而不成材</b>——需要修剪（也就是用金来克）才能成栋梁。',
      '<b>所以看到"旺"，不能直接断"吉"</b>，要看它<b>有没有制</b>（有没有东西约束它）。',
      '<b>4.3 相生无克时，旺衰的意义不大</b>',
      '如果一课之中<b>只有生、没有克</b>（四位相生），那么即便某一五行处于"休"的状态，也<b>不会形成多大阻力</b>，事情照样能成。',
      '<b>这就像一家人，谁强一点弱一点都是自家人，不必分得太清。</b>',
      '<b>而一旦出现克，矛盾就显现了。</b>',
      '<b>4.4 重克不重生</b>',
      '<b>由此引出金口诀一条总原则：重克不重生。</b>',
      '为什么重克？因为<b>克是事物的矛盾突出点</b>。<b>克则动，动才能看出问题。</b>',
      '打个比方：两个人站着不动，你无法判断他们在做什么，也不知道关系如何；<b>一旦动起手来，谁强谁弱、因何而起，立刻清清楚楚。</b>',
      '<b>这一句概括得极精辟</b>：',
      '<b>金口诀"以克找问题"。</b>',
      '<b>所以断课的第一个动作，就是在四位之间找"克"。</b>',
      '<b>五、五行五常</b>',
      '五行各有其德，古人用五个字概括：',
      '<b>仁、义、礼、智、信</b>',
      '| 五行 | 主德 | 具体含义 |',
      '|---|---|---|',
      '| <b>木</b> | <b>仁</b> | 性情随和、感情丰富、仁慈乐善、勤勉朴实、有博爱之心、君子之仁、济天下之怀、正直豪迈、善恶较分明、济物利民 |',
      '| <b>金</b> | <b>义</b> | 义理分明、仗义疏财、知廉知耻、刚毅果决、勇敢顽强；有安国家之大义、处朋友之诚义、齐家庭之情义，万事义字当先 |',
      '| <b>火</b> | <b>礼</b> | 热情有礼、善言健谈、热忱坦率、重情重义、充满自信、乐观进取；尊卑分明，万事礼字当头 |',
      '| <b>水</b> | <b>智</b> | 足智多谋、明辨是非、多才多艺、反应灵敏、处事较圆滑、适应性强、不喜欢与他人发生正面冲突、聪慧绝伦、爱思考善策划、思维缜密 |',
      '| <b>土</b> | <b>信</b> | 忠孝至诚、诚信敦厚、稳重踏实、心胸宽广、不愿过多计较得失、言必行行必果、以信立于天地之间 |',
      '<b>"木主仁，火主礼，土主信，金主义，水主智"</b>——这五个字在判断人物性格时极好用。',
      '---',
      '<b style="color:var(--c-gold)">第四节　五行逐行详解</b>',
      '<b>这一节是断课能不能断到细节的关键。</b> 同样一个课，有人只能说"财运不好"，有人能说"你做的是贸易生意，资金压在货上"。差别就在取象的功夫。',
      '<b>每一行我们都从六个维度讲</b>：形体相貌、人体脏腑、性情性格、职业取向、太旺与休囚、特殊细节。',
      '<b>一、木曰曲直</b>',
      '<b>"曲直"</b>——木既能弯曲，也能伸直，有向上生长的生命力，主<b>生发、条达、仁厚</b>。',
      '<b>"木性直，主仁义，往上生发"</b>——这是木的总纲。',
      '<b>1.1 形体相貌</b>',
      '<b>木旺之人</b>：',
      '<b>丰姿秀丽、骨骼修长、手足细腻、面色青白</b>',
      '<b>形体直、高、苗条、骨感</b>——像树木的形态',
      '<b>头发浓密、胡须也密</b>——因为木就像枝条',
      '<b>身上有酸味</b>（其味酸），<b>面色青</b>（其色青）',
      '<b>木衰则</b>：个子瘦长、<b>头发稀少</b>、性格偏狭、嫉妒不仁。',
      '<b>木气死绝则</b>：眉眼不正、项长喉结（脖子长而喉结突出）、肌肉干燥、鄙下吝啬。',
      '<b>1.2 人体脏腑</b>',
      '<b>主</b>：肝、胆、毛发、眉毛、眼睛、四肢、神经、脑、筋、脉。',
      '<b>在四肢中最形象的对应就是"筋"</b>——贯穿全身。所以：',
      '木受伤，<b>多应筋骨、四肢、神经之疾</b>',
      '<b>手指关节、神经韧带</b>都属木',
      '<b>十二地支中</b>：',
      '<b>寅</b>：臂、肢、胆、筋、脉、发、毛',
      '<b>卯</b>：肝、胸、目、手、爪、筋',
      '<b>1.3 性情性格</b>',
      '<b>木旺之人</b>：',
      '<b>性格直爽、讲信义、心地仁慈</b>',
      '<b>说话直接、一根筋、爱得罪人、认死理、刨根问底</b>',
      '<b>正直仁慈、有正义感、责任心强、敏感、不善变通、直性子真性情、富贵清廉</b>',
      '<b>理智、有主见、虚心、举止端庄稳妥</b>',
      '<b>这一句很传神</b>：',
      '<b>木旺之人常说话直接，一根筋，爱得罪人，一根直木不拐弯。</b>',
      '<b>太旺则</b>：暴躁、偏执、嫉妒、宁折不弯、难与人相处、偏激、话语直爱得罪人。',
      '<b>休囚则</b>：优柔寡断、意志薄弱、做事反复、心无主见、心胸狭窄、斤斤计较、占有欲强、办事杂乱。',
      '<b>还有一层特殊联系</b>：',
      '<b>子午卯酉四处游走</b>，所以属木的人常常「<b>站没站相、坐没坐相</b>」——他站着时总得靠着桌子或墙壁，不会直直地站着。这是不稳定的状态在形体上的表现。',
      '<b>1.4 喜忌与"木不琢不成器"</b>',
      '<b>木喜水生，怕金克。但极旺之时反而喜金来克。</b>',
      '正所谓「<b>木不琢，不成器</b>」。',
      '<b>课中木旺无制，会成事于金旺之年月。</b>',
      '道理很形象：一棵树不修剪，枝条乱长，长不成材；<b>剪去乱枝，才能向上成栋梁</b>。',
      '<b>注意"木旺无制"的断法</b>：不能简单说"旺就是好"。<b>旺而无制，反而要靠金来修剪</b>——所以到金旺的年月反而是好事。',
      '<b>1.5 职业取向</b>',
      '<b>文化教育、易卜中医、证券交易、媒介信息。</b>',
      '<b>1.6 木的四种组合（重点）</b>',
      '<b>甲乙木的区别</b>：',
      '<b>甲木</b>——大木、栋梁之木，<b>正直有才，可为文官</b>',
      '<b>乙木</b>——小木、花草之木',
      '<b>卯木的四种组合，各有讲究</b>：',
      '<b>丁卯</b>——<b>带刺之花木</b>，如枣树、玫瑰一类。',
      '丁卯临用<b>付出多而收获少</b>，感情上非常挑剔，高不成低不就，<b>最难伺候</b>',
      '「<b>丁卯</b>」的人像玫瑰：<b>看着挺漂亮，但是有刺，不好交往</b>',
      '因为丁有花草象，<b>兔子吃草就会降低注意力，交易常会出错</b>，所以丁卯常指<b>徒劳无功</b>',
      '<b>癸卯</b>——<b>心机重、比较狡猾</b>之人。',
      '因为<b>癸水生卯充足身体能量</b>，所以癸卯更有聪明的交易，<b>常常被指狡猾、心眼多</b>',
      '「<b>癸卯与丁卯是对兔子的两种写照：露水滋草则精明狡猾</b>」',
      '<b>乙卯</b>——<b>神经敏感、爱干净、爱嫉妒人</b>，常见于有<b>洁癖</b>的人。',
      '<b>乙卯之人爱嫉妒</b>',
      '因为兔子爱干净，<b>常常双爪洗脸</b>，所以乙卯常指<b>干净、敏感、化妆品</b>',
      '<b>辛卯</b>——<b>辛卯为自冲</b>（辛本身即酉，酉与卯相冲，故称自冲），所以：',
      '<b>常指司机</b>（卯有车船之象、辛有道路之象）',
      '主求事<b>反复无常、变化多端</b>（今天一个主意明天又改，自己对自己过不去，<b>缺乏主见</b>）',
      '<b>主搬迁频繁</b>',
      '<b>主开快车</b>',
      '<b>卯木的通用取象</b>：',
      '<b>阴木卯一般指交易、贸易、中介</b>',
      '<b>临戌亥之上称为"卯入天门"</b>，主<b>改变经营模式</b>，或改变了企业性质，或产品不同了，或放弃一个业务、干另一种业务',
      '<b>卯木又指手指与技术、太冲盗贼、媒介生意、表演</b>',
      '<b>卯无根不立</b> ——所以卯性之人站没站相、坐没坐相',
      '<b>卯酉为门户桃花</b>，相冲主搬迁',
      '<b>卯木的环境器物类象</b>：<b>金克木主车祸破财</b>。',
      '<b>1.7 木的相关断语</b>',
      '<b>二木为爻求难得</b>——木多枝蔓纠缠，求事不顺（详见第六章「五动三动」）',
      '<b>三木更是难上加难</b>，还主会有官事缠身',
      '<b>课中见四木则家贫如洗</b>——「四木争张房舍新，徒有四壁家中贫」',
      '<b>甲木见未为墓，乙木见戌为墓</b>。入库主人昏庸，占病则有瘫患在床之意',
      '<b>特别甲寅临未为寡妇，这个诀窍很灵验的</b>',
      '<b>一木受三金之克，占病，九死一生</b>',
      '<b>一木二金多瘫跛，二金二木病远年</b>',
      '<b>木克土秃顶、肿瘤</b>，如果再临火就是病情扩散',
      '<b>水木相生，多主其人须发旺</b>',
      '<b>三水漂一木，必主漂泊，出远门等，非常准确！</b>（但要看是什么水，口诀都有片面性）',
      '<b>二、火曰炎上</b>',
      '<b>"炎上"</b>——火性高温，燃烧时火焰总是向上窜，主<b>炎热、向上、光明</b>。',
      '<b>2.1 形体相貌</b>',
      '<b>头小脚长、上尖下阔、浓眉小耳、精神闪烁</b>（火盛）',
      '<b>其头上窄下宽、其发焦黄、印堂窄双眉浓</b>',
      '<b>火的形状就是上尖下宽</b>',
      '<b>面色赤</b>（其色赤），<b>味苦</b>',
      '<b>火衰则</b>：黄瘦尖楞、语言妄诞、诡诈妒毒、有始无终。',
      '<b>2.2 人体脏腑</b>',
      '<b>主</b>：心脏、小肠、血脉、循环系统、<b>眼睛</b>、舌、扁腺。',
      '<b>午火主眼</b>——所以这一组干支断忧愁时，常有<b>流泪哭泣</b>之象——<b>眼旁有水，就是泪</b>。',
      '<b>2.3 位置的讲究（重要）</b>',
      '<b>如上有金，则会受火之伤。而火下之金，受伤反会轻些。</b>',
      '<b>因为火的力量是向上的。</b>',
      '<b>同样地，木在下克土重，木在上克土轻</b>（因为木的力量也向上）。',
      '<b>2.4 性情性格</b>',
      '<b>火性之人</b>：',
      '<b>热情有礼、善言健谈、热忱坦率、重情重义、充满自信、乐观进取</b>',
      '<b>尊卑分明，万事礼字当头</b>',
      '<b>喜欢修饰打扮、作风严谨、尊老爱幼、谦和厚重、注重礼节</b>',
      '<b>爱说大话、表现欲强、有奋发精神、有创造力，但常反复</b>',
      '<b>性急、自尊心强、有自我表现欲、爱与人争辩、忍耐力较小、毅力差</b>',
      '<b>火的两面性</b>（这一点很关键）：',
      '<b>火是"外热中空"的</b> ——表面看着很热，里面其实是空的。',
      '<b>所以火性之人</b>：',
      '<b>"三分钟热度"</b>——来得快去得也快',
      '<b>虎头蛇尾</b>——有头无尾',
      '火性之人在感情上<b>不回头</b>——水火无情，说不行就是不行，不会再来回反复，讲话不给对方留反驳的余地',
      '##### 为什么说火"外实内虚"',
      '<b>火的形状是外热内空的</b>——火焰看着很旺，中间其实是空的。',
      '<b>这个道理很简单</b>：一堆火烧起来，最热的是外焰，中心反而温度低。<b>所以火性之人表面热情，内里未必真热</b>——这就是"三分钟热度"的由来。',
      '<b>太旺则</b>：性情暴躁、易冲动、易失去理智、作事不计后果。',
      '<b>休囚则</b>：阿谀谄媚、奸诈狡猾、作事有头无尾、无恒心、不果断。',
      '<b>2.5 午火与巳火的分野（重点）</b>',
      '<b>这是火这一行最重要的区分</b>：',
      '| | <b>午火（阳火）</b> | <b>巳火（阴火）</b> |',
      '|---|---|---|',
      '| <b>性质</b> | 太阳之火、明火 | <b>阴火、小火、"闭口火"</b> |',
      '| <b>性情</b> | 思虑周详、有礼貌、语速快、性子急 | <b>猜疑嫉妒、忍耐力差、爱生闷气</b> |',
      '| <b>做事</b> | 风风火火、不顾后果、有头无尾 | 变化反复无常、见异思迁 |',
      '| <b>感情</b> | 反复 | <b>常为第三者或风尘女子</b> |',
      '| <b>伤害</b> | <b>午火伤身</b> | <b>巳火伤心</b> |',
      '<b>一句话记住</b>：',
      '<b>「金口诀当中金和火是凶神」，但「巳火杀伤力更大，所谓午火伤身，巳火伤心」。</b>',
      '<b>巳火像油灯的火</b>——',
      '<b>为什么这样比喻？</b> 午火是太阳之火，光明正大、稳定持久；<b>巳火是灯烛之火，光弱而不稳，油尽则灭</b>。',
      '所以巳火<b>带来光明，也带来恐惧</b>——因为它随时可能熄灭。',
      '巳火主<b>不安、疑虑、患得患失</b>',
      '<b>巳蛇的人性取象</b>——<b>不知有毒、讲话刻薄</b>',
      '<b>巳火是"是非之神"</b>——因为巳火主<b>嫉妒、猜疑</b>',
      '<b>巳火主娱乐场所、文字图案、鬼神与神经病</b>',
      '<b>巳火主"攀附"</b>——因为蛇身千般变化无形无规，<b>见物攀附，常附寄身与木</b>',
      '<b>"自诩为龙，虚荣夸张华而不实"</b>',
      '<b>"木为财富象征，巳缠附而不得木，表现嫉妒猜疑；如见他木更好，更易屈身易主，不坚贞不守贞，贪图享受不劳而获"</b>',
      '<b>现在的对应</b>：<b>第三者、风尘女子、陪酒女</b>',
      '<b>巳逢酉为陪酒女</b>',
      '<b>巳见丑、巳见酉为陪酒女</b>',
      '<b>2.6 火旺的断法</b>',
      '<b>火旺主火光、伤残</b>，易出<b>烧伤烫伤</b>',
      '<b>多指有名望、文艺、文科强之人</b>',
      '<b>占人，主性急、有口才或有一定的文字功力</b>',
      '<b>火旺住高冈</b>——占家宅多主其家宅<b>地势高，或住在高层</b>，<b>南方宽敞明亮</b>',
      '<b>火主高、主张扬</b>——火性之人住处偏高',
      '<b>午火入课，可断家宅光线好</b>——因为火代表光明',
      '<b>断环境时，午火可断学校、烟筒、变压器、电线杆</b>',
      '<b>"水来入火妇难安"</b>：',
      '<b>火遇水，则主妇科病、难产、流产。</b>',
      '<b>水火相见</b>还主<b>烫伤、伤灾、心痛、血压病症</b>。',
      '<b>"水火既济"</b>：',
      '<b>极旺之火，喜水来制</b>，谓之「水火既济」。',
      '<b>2.7 火的具体干支取象</b>',
      '<b>午火临用</b>——主<b>聚而复散、成而复散</b>',
      '<b>巳火临用</b>——因为是<b>乞索之神</b>，<b>爱生闷气</b>',
      '<b>庚午</b>——又主「<b>改门接屋</b>」',
      '<b>由改换门庭延伸到装修与换工作</b>',
      '占工作，则可能会有工作上的变动，或家内有装饰装修',
      '<b>壬午</b>——<b>阳水配阳火，反复性最强</b>，主求事反复、主心神不定',
      '<b>子午相冲</b>——<b>水火交战</b>，反复之象与车马血光（详见第七节）',
      '<b>火过旺</b>：<b>二火为灾百事残</b>（详见第六章「五动三动」）。',
      '<b>2.8 职业取向</b>',
      '<b>文字文化类、演出、火电、通讯、教育。</b>',
      '<b>火主文书</b>——所以<b>火逢克则文书合同受损</b>。',
      '<b>火的现代延伸</b>：',
      '<b>火有光、有影</b> —— <b>光与影正是电影、电视、屏幕的底子</b> —— <b>所以火在现代还代表影视、娱乐、信息</b>。',
      '<b>这类延伸看着很"新"，根子却仍在火的本性上</b> —— <b>不是硬贴上去的时髦说法</b>。',
      '<b>午火</b>——<b>与电有关的现代行业环境</b>。',
      '<b>三、土曰稼穑</b>',
      '<b>"稼穑"</b>（jià sè）——稼是种庄稼，穑是收庄稼。',
      '<b>土乃万物之母，有收纳万物之功。</b>',
      '<b>君子以厚德载物，坤德容天下。</b>',
      '<b>3.1 形体相貌</b>',
      '<b>背圆腰阔、鼻大而口方</b>（土旺）',
      '<b>圆腰廓鼻、眉清目秀、口才声重</b>（土盛）',
      '<b>面色黄、味甘</b>',
      '<b>团圆脸、黄色、偏胖</b>；旺相个头高大，休死低矮瘦小',
      '<b>土气太过</b>：头脑僵化、愚拙不明、内向好静。',
      '<b>不及则</b>：面色忧滞、面扁鼻低、狠毒乖戾、不讲信用。',
      '<b>3.2 人体脏腑</b>',
      '<b>主</b>：脾、胃、肠及整个消化系统。',
      '<b>具体</b>：',
      '<b>辰戌土临用，多有恶性肿瘤之患。再见火则会感染</b>',
      '<b>丑未易有脾胃病、皮肤病</b>',
      '<b>土主皮肤</b>',
      '<b>土主远年病</b>（旧病）',
      '<b>辰土</b>：背、胸、项、肩、皮肤、胃',
      '<b>丑土</b>：肚、腹、脾、肌、肉、<b>阴道、子宫</b>',
      '<b>未土</b>：脾、胸、胃、腹、口、头面',
      '<b>戌土</b>：命门、胸、筋、臀、腿、膝、足',
      '<b>3.3 性情性格</b>',
      '<b>土旺之人</b>：',
      '<b>善良忠厚、有宽容之心、正直敦厚</b>',
      '<b>忠孝至诚、诚信敦厚、稳重踏实、心胸宽广、不愿过多计较得失、言必行行必果</b>',
      '<b>喜静不喜动，易有孤独感</b>',
      '<b>喜宗教，有医卜佛道之缘</b>',
      '<b>土旺其家易居于冈岭之上</b>',
      '<b>土过旺则</b>：<b>偏执、倔强愚顽</b>、<b>顽固不化、执迷不悟、反应迟钝</b>。',
      '<b>「我就是不听你的，明知道错也不服。」</b>',
      '我们说这种人「<b>讲不通</b>」「<b>钻牛角尖</b>」。',
      '<b>土旺之人学习踏实</b>，但<b>脑子不转弯</b>。',
      '<b>3.4 土的阴阳之分（重点）</b>',
      '<b>土分阴阳，这是断课的关键区别</b>：',
      '| | <b>丑未（阴土）</b> | <b>辰戌（阳土）</b> |',
      '|---|---|---|',
      '| <b>性质</b> | <b>包容不争</b> | <b>好斗好打</b> |',
      '| <b>性</b> | 静 | 动 |',
      '<b>辰戌的关键断法</b>：',
      '<b>辰戌为是非之神</b>，课中多见常主<b>打斗、官非</b>',
      '<b>「勾陈最怕者是见戌土，只要辰戌相见，必有官非斗打之事」</b>',
      '<b>神将见辰戌，占婚姻，必是夫妻不睦，时有斗打之事发生</b>',
      '<b>以辰戌为用者，又多是孤独之人</b>',
      '<b>辰戌同入课，信奉的不是一种宗教，或家中人有不同的信仰</b>',
      '<b>辰土临用，多是好斗之人，不服输的性格</b>',
      '<b>丑未的关键断法</b>：',
      '<b>丑未相冲</b>——<b>阴土主静</b>，二阴土相冲<b>没有辰戌相冲力度强</b>',
      '<b>阴土体现在咀咒谩骂、观点性对抗、相互埋怨</b>',
      '<b>二者还有相刑成分存在，有欺压性与抗争的矛盾相对立</b>',
      '<b>3.5 土的"冲"与"缓"（重要）</b>',
      '<b>一般人以为土主迟缓，但这里有个讲究</b>：',
      '<b>土分辰戌丑未，辰戌互冲、丑未互冲，冲的关系是很快的，一点都不缓慢。如果不是冲的组合才能代表迟缓。</b>',
      '<b>所以</b>：',
      '<b>辰戌冲、丑未冲</b>——<b>主快</b>',
      '<b>其他土组合</b>——才主<b>迟缓</b>',
      '<b>四位二土的位置断法</b>（很实用）：',
      '| 二土所在位置 | 断法 |',
      '|---|---|',
      '| <b>人元、贵神见二土</b> | 主<b>开头</b>办事虽成而迟 |',
      '| <b>贵神、将神见二土</b> | 办事<b>中间</b>困难较多 |',
      '| <b>地分、将神见二土</b> | 主<b>结尾</b>不顺，虽然以前有答复，常一拖再拖，且有反复 |',
      '<b>3.6 土旺的断法</b>',
      '<b>课中土多，求事必拖延</b>',
      '<b>土旺的人婚姻同样也晚</b>',
      '<b>土性静，遇卯木来克，易出车祸</b>——因为土静而动之，动静相激。道理是：<b>静的东西被突然冲动，最容易出事</b>',
      '<b>土旺主高岗</b>——有<b>实高与虚高之别</b>，土性人厚重',
      '<b>土多且旺主晚婚，特别戌土旺孤独晚婚</b>',
      '<b>3.7 四土的取象</b>',
      '<b>辰土</b>：是非之神、好斗、暗黑手段、<b>逢冲必打</b>；<b>臂膀皮肤、西医</b>（与寅木中医相对）；<b>法律机构、监狱、收容所、拍卖行</b>；<b>医疗机构</b>',
      '<b>戌土</b>：<b>成熟男人、外冷内热、军警</b>；<b>坟墓、油库、监狱与变压器</b>；<b>清高心机重、修行学艺</b>；<b>天空</b>',
      '<b>丑土</b>：<b>脾胃、脚、金库银行、坟墓寺庙、认死理</b>；<b>丑土的母性、子宫</b>（有"宫寒"断法）；<b>丑在贵神断脚的火车实例</b>',
      '<b>未土</b>：<b>美食家、碎嘴、媒婆、寡妇</b>；<b>容纳、拉家常、酒食说媒、善良有信仰</b>',
      '<b>3.8 职业取向</b>',
      '<b>固定的、稳定的职业</b>——因为土性好静不好动。',
      '<b>土也有艺术特质</b>，因<b>土主信、主厚</b>。<b>土旺之人忠厚稳重、有佛道缘</b>。',
      '<b>四、金曰从革</b>',
      '<b>"从革"</b>——从是顺从，革是变革。',
      '<b>金是金属，坚硬无情，有改革、变更、肃杀之性。</b>',
      '<b>4.1 形体相貌</b>',
      '<b>骨肉相称、面方白净、眉高眼深</b>',
      '<b>面色方白、嗓门大</b>',
      '<b>方正魁梧</b>',
      '<b>面色白、味辣</b>',
      '<b>金不及则</b>：身材瘦小、刻薄内毒、喜淫好杀、吝啬贪婪。',
      '<b>4.2 人体脏腑</b>',
      '<b>主</b>：肺、大肠、气管、呼吸系统、骨骼、口齿、头胸气管、皮毛、大脑、小脑、肋膜、脊椎。',
      '<b>占病多是肠道、肺部、呼吸道、筋骨疾病。</b>',
      '<b>4.3 性情性格</b>',
      '<b>金旺之人</b>：',
      '<b>义理分明、仗义疏财、知廉知耻、刚毅果决、勇敢顽强</b>',
      '<b>多武性、喜刀枪、豪饮义气、性格急躁、多为武官</b>',
      '<b>办事刚毅、果断</b>',
      '<b>善恶分明、特别爱面子</b>——所谓死要面子，你不能不给他面子',
      '<b>做事快，但容易冲动</b>——脑子一热三下五除二就做完了，做完才发现不对',
      '<b>好胜心切、善斗、强硬、服人而不屈人、干净利落不拖泥带水</b>',
      '<b>「可以联想梁山好汉。」</b>',
      '<b>缺"智"的一面</b>：<b>有勇无谋</b>。所以<b>太旺则有勇无谋、冲动妄为、义气行事、爱打斗、喜淫欲</b>。',
      '<b>阴金则</b>：<b>重感情、温润秀气、自尊而虚荣、意志不坚</b>。',
      '<b>休囚则</b>：似是心非、举棋不定、自尊而虚荣、意志不坚。',
      '<b>4.4 金的喜忌（重点）</b>',
      '<b>金的特性是沉重，向下的力量大</b>——所以：',
      '<b>金在木上克木就严重，反之则轻。</b>',
      '<b>"金性下沉，所以下肢受伤重"</b>。',
      '<b>金最怕火克</b>：',
      '<b>火克易有灾祸，易出车祸、伤残。</b>',
      '<b>午火克金，车祸伤身；金遇火易有车祸</b>',
      '<b>金遇火，血光伤残、车祸</b>',
      '<b>白虎（申金）为用时，只宜水泄，不宜火克</b>——<b>为什么？</b> 金旺时用火去克，是硬碰硬，火金相战必出凶灾；<b>用水来泄，金生水，是顺势疏导</b>，既泄了金的气势，又不伤和气。这就是"宜泄不宜克"的道理',
      '<b>"金旺不可火克，宜泄宜合"</b>。',
      '<b>4.5 金的具体干支取象</b>',
      '<b>申金</b>——<b>移动之神</b>。',
      '<b>申金临用，多指旧事重提</b>',
      '<b>金水相生，儿女多情</b>',
      '<b>申亥相见，断而复续</b>',
      '<b>申金是移动之神，变化变动，折于理而不弯与人</b>',
      '<b>申金类象</b>：<b>军警武官、流动传送、资金留不住、白虎杀气</b>',
      '<b>申金为白色，又称白虎</b>',
      '<b>「白虎出现克与被克都会有凶灾伤残、是非祸端，如再现吊客丧门，必有白事临身」</b>',
      '<b>「一般白虎就是凶神恶煞的代名词。课内出现必须注意，一般都非吉事。」</b>',
      '<b>「白虎申金入课旺，无论课多好，都会有不顺事发生」</b>',
      '<b>酉金</b>——<b>四大桃花之神、为嘴为说</b>。',
      '<b>"金口诀"为何取酉金之象</b>：酉金主"说"、主"口舌"，与"口诀"相应',
      '<b>酉金类象</b>：<b>隐私桃花、漂亮女人、镜子与平滑之地</b>；<b>动嘴的工作与走私</b>',
      '<b>酉金主鼻、皮毛、声</b>',
      '<b>庚申、辛酉的区别</b>：',
      '<b>庚申为大路，辛酉为小路</b>',
      '<b>遇丁火多有丁字路口，丙火则多有十字路口</b>',
      '<b>4.6 职业取向</b>',
      '<b>军警、政法、机械、运输、电子设计。</b>',
      '<b>4.7 金的相关断语</b>',
      '<b>二金刑克都不顺</b>（详见第六章「五动三动」）',
      '<b>金多主不义、不讲规矩乱人理</b>',
      '<b>金见水反成好事</b>——主<b>清高有才、金水相生儿女有情</b>，断婚姻则吉',
      '<b>不能见木</b>，见木主<b>口舌伤手脚</b>，「尤其是卯木遇申，<b>卯申木绝车马财</b>，伤身破财」',
      '<b>见火更出凶灾</b>，多主血光伤残、交通惊险',
      '<b>「金过旺主淫乱特别指阴酉金，妇女不贞」</b>',
      '<b>「四金入课则六亲不认」</b>',
      '<b>金木交战主是非口舌，破财伤灾。寅卯都为财神，受克则损财</b>',
      '<b>火临金指求事困难；金临火发生变形，指原定计划会改变</b>，指煎熬、灾难，求事难成',
      '<b>金空则鸣</b>——空亡的一种',
      '<b>五、水曰润下</b>',
      '<b>水流动、温度低、由高处往低处流</b>，主<b>寒冷、向下</b>。',
      '<b>水的方向是向下的，所以"往下的力量大"。</b>',
      '<b>5.1 形体相貌</b>',
      '<b>眉目清秀、一身秀气、长圆脸、身体易动、语音清和、皮肤细腻</b>',
      '<b>太旺则肥大，休囚则矮小黑丑</b>',
      '<b>水旺无治主白色</b>',
      '<b>面色黑、味咸</b>',
      '<b>水太过</b>：好说是非、飘荡贪淫。',
      '<b>不及则</b>：人物短小、性情无常、胆小无略、行事反覆。',
      '<b>5.2 人体脏腑</b>',
      '<b>主</b>：肾、膀胱、泌尿系统、妇科、耳、骨髓、脚、阴部、血液。',
      '<b>水主肾脏，常有泌尿系统疾病。</b>',
      '<b>5.3 性情性格（重点）</b>',
      '<b>水的核心特性</b>：',
      '<b>第一，适应力强、随物就形。</b>',
      '<b>「无论河道多弯曲，水也能流行，放到什么形状的容器就是什么形状，一切行动听指挥。」</b>',
      '<b>"有八十八道弯它也能往前流"</b>',
      '<b>"随曲就弯、滴水不漏"</b>——这是水的<b>缜密性</b>',
      '所以水主<b>顺从、适应力强</b>',
      '<b>第二，往下、忍耐。</b>',
      '水<b>往下的力量大</b>，所以水性能<b>忍耐</b>',
      '水主<b>聪明、头脑好用、有学识、反应快、忍耐力强</b>',
      '<b>第三，阴私、多变。</b>',
      '<b>水旺之人阴私过重、婚姻不稳、多有私情事、水性杨花</b>',
      '因水性有<b>听从性</b>，常指<b>没有主见、爱随波逐流</b>',
      '<b>易受人之暗示、引诱</b>',
      '<b>爱贪小便宜</b>',
      '<b>第四，渗透、无孔不入。</b>',
      '<b>水主智慧、爱思考、理科强、人缘好、易融于人群</b>',
      '<b>爱溜须拍马奉承人、无孔不入、渗透力强</b>',
      '<b>易从事盗窃、间谍、偷情活动</b>',
      '<b>太旺则</b>：诡计多端、喜淫欲、好动、不拘小节、不守礼教、性情不专、神经过敏、情绪多变。',
      '<b>休囚则</b>：反复无常、胆小怕事、无远见、心无主张。',
      '<b>5.4 水的具体干支取象</b>',
      '<b>子水</b>——<b>带玄武的聪明</b>：',
      '<b>子水类象总览</b>：<b>小偷、桃花、隐私、机密</b>',
      '<b>子水还有军人象</b>——因为"一切行动听指挥"',
      '<b>子水断出"鬼神图画"的实例</b>',
      '<b>子时不宜起课</b>——<b>为什么？</b> 子时是两天的交界（23 点至 1 点），<b>阴阳交替、界限不明</b>。此时起课，日干支归属容易含混，所以避开',
      '<b>老鼠爪趾与奇偶</b>——子为老鼠，前爪四趾（偶）、后爪五趾（奇），<b>这是子时跨两天的由来</b>',
      '<b>子（水）的五行特性与性格</b>：偏理科、善策划、<b>没主见</b>',
      '<b>子水主淫欲；子水见火必偷</b>',
      '<b>子酉相见主桃花偷情</b>——「<b>几乎没有跑</b>」',
      '<b>亥水</b>——<b>阴极反阳、柔顺灵巧</b>：',
      '<b>亥为12地支最后一位，阴极返阳，柔顺听话乖孩子</b>',
      '<b>亥水类象</b>：<b>阴柔听话、乞索小儿、小水绸缎</b>；<b>婚姻与病难查</b>',
      '<b>亥水（微博、口水议论、隐私、下水道）</b>',
      '<b>亥水——高楼楼台、会计</b>',
      '<b>「亥水容易当会计，总和数字打交道」</b>',
      '<b>壬癸水相见</b>（水多之时）之人：',
      '偏<b>顺从、没有主见</b>，听别人的',
      '但<b>忍耐力特别强</b>，不怕疼，有毅力',
      '容易融入各种环境，<b>不容易得罪人</b>',
      '<b>适合在领导身边做事</b>',
      '<b>水过旺</b>：',
      '<b>诡计多端</b>，适合做<b>隐秘性、机密性的工作</b>，如管理文件档案',
      '也对应<b>水产、酒水、流动性、计算性</b>的行业',
      '<b>5.5 水的"过旺反效果"</b>',
      '<b>就像往水杯里倒水，倒多了反而流失。</b>',
      '<b>凡事有度，水太多，财也留不住</b>——水多木漂，所谓「<b>水火不求财</b>」。',
      '<b>水过旺，反喜土来制</b>，不然即是泛滥之水，易致灾。',
      '<b>5.6 职业取向</b>',
      '<b>从事机密隐秘性工作、外交、谍报、军人、海产水运业、酒水饮料。</b>',
      '<b>5.7 水相关的重要断语</b>',
      '<b>二水皆须为大吉</b>（详见第六章「五动三动」）',
      '<b>水在风水中代表财，多多益善。但是水多不一定就是好事，水多则溢，需要有收敛他的物质。比如一课中全是水，往往就是</b>财来财去、存不住<b>的象</b>……<b>水又主隐私淫欲，很大一部分钱浇灌桃花了</b>',
      '<b>水如果有金来生为活水为有根，可以生生不息，这是最好的</b>',
      '<b>如果课内火旺而没有木，这种火也是不长久的，最喜欢的就是寅午木火通明</b>',
      '<b>水空则流</b>——空亡的一种',
      '<b>六、五行空亡速断</b>',
      '<b>五行逢空亡，各有其象</b>，这是一套很实用的速断法：',
      '<b>水空则流，火空则发，木空则损，土空则陷，金空则响。</b>',
      '<b>逐条解释</b>：',
      '<b>水空则流</b>——<b>流失</b>。钱财流失、人员流失、计划落空',
      '<b>金空则响</b>——<b>有名声，但不一定有财</b>，因为金空',
      '<b>木空则损</b>——<b>钱财损失</b>；寺庙则香火盛',
      '<b>火空则发</b>——<b>发火、火灾、伤灾、凋零</b>',
      '<b>土空则陷</b>——<b>做什么事都不顺或犯小人</b>；土空见坑塌陷、遭陷害、行移不顺',
      '<b>注意"木空则损"的补充</b>：',
      '<b>木空则损——乙木为第一财神，寺庙则香火盛。</b>',
      '---',
      '<b style="color:var(--c-gold)">第五节　天干</b>',
      '<b>一、天干是象，地支是形</b>',
      '<b>这是最容易搞混的地方，请仔细看。</b>',
      '<b>天干是"象"，地支是"形"。</b>',
      '<b>天干是能量与气场，必须与地支组合才能显现状态。</b>',
      '<b>"干为象意，如云可以化作雨成物体，而地支实性不能化作象。所以天干可以变成地支，而地支不能变成天干。天干变支常用于虚合待用，而不是真正合局。"</b>',
      '<b>这个区别在断课时的用处</b>：',
      '<b>天干主外、主表、主象</b>——外在表现、表面现象、别人看到的样子',
      '<b>地支主内、主里、主实</b>——内在实质、真实情况、最终结果',
      '<b>凡是要落到实处的东西，最终都要看地支。</b>',
      '所以金口诀<b>重地支生克，天干只作牵线搭桥</b>。',
      '<b>但"不太重"不等于"不重要"。</b> 天干在断一个人的<b>状态、心性、外在表现</b>时，取象往往更直接。',
      '<b>1.1 天干与地支不能直接作用</b>',
      '<b>天干与地支不能直接发生作用。</b>',
      '<b>天干与天干作用，地支与地支作用，不能相互作用。</b>',
      '<b>违反了它，断课容易失误。</b>',
      '<b>为什么这样规定？</b> 道理很精辟：',
      '<b>天干是不能直接与地支发生作用的。这个必须清楚其中原理，否则断课时出现失误。其实金口诀表现得就很形象——人元为干为头，头是指挥官，是发号施令的，是下达文件的，所以人元也是号令、文件性质的。那是条文，是要下面听从的，当时你可以不听，但后果不好说。</b>',
      '<b>比如人元克贵神为斩官，这个是天干与地支的关系，但是天干不能直接作用贵神这个地支，天干是起间接作用的，所以就要看天干所要对应的时空——是不是要斩官，还是已经斩官的时间性。</b>',
      '<b>这段话把"象"和"形"的关系讲透了</b>：天干像一份<b>文件</b>，它下达命令，但<b>命令的执行需要时间</b>，而且<b>下面可以不听（但后果自负）</b>。所以天干的作用是<b>间接的、有时间性的</b>。',
      '<b>还有一条相关的</b>：',
      '<b>课内天干与课外天干的合化</b> ——<b>课外天干之合不能断外情</b>。',
      '<b>二、十干象意</b>',
      '<b>十天干不是十个孤立的符号，它们串起来，是一个完整的"生长—收获—储藏"的过程。</b>',
      '| 干 | 本义 | 象意口诀 | 像什么 |',
      '|---|---|---|---|',
      '| <b>甲</b> | 万物冲破而出、种子出生，<b>开始</b> | <b>甲——贵</b> | 种子破壳 |',
      '| <b>乙</b> | 生长、弯曲生长，<b>脆弱</b> | <b>乙——曲</b> | 刚出生的婴儿 |',
      '| <b>丙</b> | 象太阳一样昭然可见 | <b>丙——乱</b> | 十五六岁的孩子 |',
      '| <b>丁</b> | 壮，长成了形 | <b>丁——惊</b> | 十八九岁，轻狂叛逆 |',
      '| <b>戊</b> | 茂盛，形状固定，事态定型 | <b>戊——讼</b> | 定型 |',
      '| <b>己</b> | 奋起，突出有形，记号定格 | <b>己——难</b> | 三四十岁，稳重 |',
      '| <b>庚</b> | 更新，气象更新，开花结果 | <b>庚——变</b>（或作"动"） | 锋芒毕露 |',
      '| <b>辛</b> | 辛苦，成熟有结果收获 | <b>辛——苦</b> | 成熟需付出 |',
      '| <b>壬</b> | 妊，成熟的种子 | <b>壬——暗</b> | 大势已定 |',
      '| <b>癸</b> | 藏，种子归仓 | <b>癸——愁</b> | 等待萌发 |',
      '<b>十干象意口诀汇总</b>：',
      '<b>甲贵、乙曲、丙乱、丁惊、戊讼、己难、庚变、辛苦、壬暗、癸愁。</b>',
      '<b>这十个字是断课时的"第一眼"</b>。拿到课先看人元是什么干，心里立刻有个基调。',
      '<b>2.1 逐干详解</b>',
      '<b>甲（贵）——冲破而出</b>',
      '<b>甲在人元时，第一件事是先分析它的旺衰</b>',
      '<b>甲旺</b>——体现一种<b>好的开始</b>。如果它对课内其他干支起了有利的作用，可以初步断定<b>所要预测的事物是积极有利的</b>',
      '<b>甲死、衰、空亡</b>——说明事物<b>处于消极不利的状态</b>。就像种子还没发芽就腐烂了，或者被虫咬了，<b>没有生长的可能</b>',
      '代表<b>文书、喜庆、财帛</b>',
      '<b>受克</b>——指"无"或者"少"；<b>得生</b>——主得贵人相助',
      '<b>甲木的性格</b>：<b>直言直语、正直心善、容易得罪人</b>',
      '<b>乙（曲）——弯曲生长</b>',
      '就像刚出生的婴儿，虽然有形，但<b>需要呵护</b>。所以这是一个<b>曲折</b>的时间段',
      '<b>乙在人元时</b>，一般指事物<b>会发生曲折</b>、不利的因素，<b>费一番周折</b>',
      '<b>"乙所含的意义不会变，就是曲折、好事多磨"</b>',
      '代表<b>门户、交易、婚姻</b>',
      '<b>乙见乙时争执不让</b>——两个乙都抢着生长，谁也不服谁。<b>"初生牛犊不怕虎"</b>，它连甲都不怕',
      '<b>乙见甲木出争执</b>——就像酒席上面有纷争，顶撞、不合的意思',
      '<b>乙木是文字、文官、长辈、第一财神</b>',
      '<b>乙木无论在哪个位置被克，必定破财</b>',
      '<b>丙（乱）——昭然可见</b>',
      '<b>已经初步具备了对事物的判断能力</b>，是一种<b>有生长力</b>的状态',
      '就像<b>十五六岁的孩子</b>，带给你一种踏实的感觉，一种积极向上的力量',
      '<b>如果生合课内的干支</b>——带给你的是<b>正能量</b>',
      '<b>如果刑克课内干支</b>——也是<b>比较有分量的破坏力</b>',
      '「做好事的时候，他给你的是绝对的帮助；做坏事的时候，带给你的也是<b>灭顶之灾</b>」',
      '代表<b>文书、文化、官司、证书</b>',
      '<b>丁（惊）——长成了形</b>',
      '<b>丁是很可怕的一种力量</b>，因为它有一种<b>叛逆性</b>',
      '这是<b>轻狂的时期、莽撞的时期</b>——就像<b>十八九岁</b>，也是最容易<b>惹是生非</b>的时期',
      '<b>丁在人元时的判断</b>（很重要）：',
      '<b>人元丁衰、死、空</b>——代表一种<b>绝望</b>',
      '<b>人元丁火不利课内干支</b>——会出现<b>惊恐、灾难性</b>的因素',
      '<b>「所以看到人元是丁的时候，是最能分析吉凶的关键所在。」</b>',
      '代表<b>虚惊、怪梦、家宅不宁</b>',
      '丁火还是<b>精神</b>的意思——<b>如果叛逆性过强，会出现精神问题</b>',
      '<b>戊（讼）——茂盛定型</b>',
      '<b>有形状固定了，事态已经定型，无法改变了</b>',
      '<b>「利则更利，败者更败」</b>——它的影响力是<b>不可改变</b>的',
      '<b>戊在人元受克时</b>，一般指<b>破败、贫穷、官司、牢狱</b>等。这是一种<b>事实的体现</b>',
      '<b>但并非人元见戊土都为穷</b>——<b>如果戊土旺，生贵神，则是富贵</b>',
      '因为形状固定，还指<b>土堆、丘陵、坟墓</b>',
      '代表<b>辰戌土</b>——<b>坚硬、竞争</b>；<b>还代表现金</b>',
      '<b>己（难）——奋起定格</b>',
      '就像<b>三四十岁的人</b>——最有魅力、最稳重的时期',
      '<b>己在人元时</b>，也是指<b>不可改变</b>，事情有了<b>明确的态势</b>',
      '<b>但己还有另一面：主坎坷、一波三折</b>',
      '因为虽然稳定了，但都是<b>经过坎坷和曲折奋斗</b>过来的。这也是<b>是非较多、社会关系最复杂</b>的时期，常有<b>纠纷、诉讼</b>等',
      '<b>所以己还有诉讼、痛苦之象</b>',
      '主<b>坎坷、一波三折</b>；主<b>诉讼、痛苦</b>；成熟稳重、变化甚微',
      '<b>庚（变）——更新变化</b>',
      '<b>气象更新，万物更新，开花结果</b>',
      '状态是<b>硬、健壮、锋芒毕露</b>，<b>容易惹事端</b>',
      '太锋芒的人，<b>容易遭人嫉妒陷害，出现是非</b>',
      '<b>事业有成了再太张扬，就容易出现变化</b>',
      '<b>庚性刚，不易弯曲</b>——容易出现<b>官司、斗讼、凶伤</b>',
      '就像一棵庄稼<b>开花结果了，呵护不好可能最终一场空</b>',
      '<b>人元为庚，代表事物变化、不易稳定</b>',
      '<b>辛（苦）——辛苦收获</b>',
      '<b>成熟、有结果、收获的时期</b>。但收获不等于轻松——<b>需要付出劳动才能收获</b>',
      '<b>人元见辛</b>，就是一种事物<b>有了定性，但需要付出努力操作才能完成</b>。<b>不是件容易的事</b>',
      '<b>旺相生合</b>——则<b>皆大欢喜</b>；<b>衰败空亡</b>——也会<b>有收获，但不会像预料的结果一样</b>',
      '还指<b>伤亡、凶灾、动荡、路途、虚惊</b>',
      '<b>辛的成熟具备威信、权威</b>；<b>辛有法制之象</b>',
      '<b>壬（暗）——妊养暗藏</b>',
      '<b>阳气已极，任养万物之下</b>，事态<b>变化不大了</b>，已经<b>完成定性</b>了',
      '<b>「壬癸难行」</b>——可操作的变化性不大了',
      '就像<b>已经有了硬性规定，大的主题已经形成</b>，只能<b>暗地里动手脚</b>',
      '<b>所以壬还指隐私、暗箱操作、盗取等不光明的手段</b>',
      '<b>人元见壬</b>，事物<b>大的关键因素已经确定</b>，能做的只能是<b>人情、财务上的暗地勾结</b>',
      '<b>如果人元壬衰、休、空亡</b>——连暗地操作都不可能了',
      '<b>癸（愁）——归库储藏</b>',
      '<b>种子归库储藏</b>了',
      '<b>「癸水难行」</b>——事物<b>等待萌发，暂时无操作性，阴暗难见</b>',
      '<b>宜「早人一步，尽早打算，合计下一步发展」</b>',
      '<b>癸也指柔顺</b>：「顺天意、顺民意则胜，知难则解纠纷，不察则奸不能行」',
      '<b>癸还指郁闷、惊恐、冤仇</b>——因为<b>无处发泄，只能等待</b>',
      '<b>癸见癸为积聚</b>——<b>蓄势待发</b>',
      '<b>2.2 "壬癸难行"的解释</b>',
      '古代人<b>赶路见到有水的地方过不去</b>，再者<b>前面有水不知道深浅</b>，在考虑、思虑、犹豫。',
      '<b>所以人元为壬癸水的时候，常代表难以进行之意，代表障碍。</b>',
      '<b>三、天干的合与克（详见第二章）</b>',
      '<b>天干之间的五合、化气、相克，是断课最常用的一套规则</b> —— 五合化气、合的先后、合化的条件、"相合者不论克"、天干相克，<b>这些都在第二章「天干与起课法」里讲</b>。',
      '<b>这里先记住一句话就够了</b>：',
      '<b>天干是"象"，管的是外在这一层；真正落到实处的，还要看地支。</b>',
      '<b>为什么把合与克放到第二章？</b> 因为<b>起课本身就要用到天干</b> —— 起人元、起神干都用<b>五子元遁</b>，而<b>"合到底化不化、化出什么五行"</b>又直接决定后面的断法。<b>放在一起讲，学起来是一条线，不必来回翻。</b>',
      '---',
      '<b style="color:var(--c-gold)">第六节　十二地支类象</b>',
      '<b>这一节是全书取象的基础。</b> 十二地支每一个都有丰富的类象，而且<b>类象随时代发展而延伸，但它的本性不变</b>。',
      '<b>子水</b>',
      '<b>总览</b>：<b>小偷、桃花、隐私、机密</b>。',
      '<b>核心取象</b>：',
      '<b>阴阳交替</b>——子时是两天的交界',
      '<b>子时不宜起课</b>——因为子时为两日交界，阴阳界限不明',
      '<b>老鼠爪趾与奇偶</b>——子为老鼠，前爪四趾（偶）、后爪五趾（奇），这是子时跨两天的由来',
      '<b>聪明流动、适应性强、隐私与智慧</b>',
      '<b>子水主淫欲；子水见火必偷</b>',
      '<b>子水还有军人象</b>——因为"一切行动听指挥"',
      '<b>子水主软件、机密档案、军人、小偷</b>',
      '<b>子水断出"鬼神图画"的实例</b>——子为阴私，主鬼神之象',
      '<b>子（水）的五行特性与性格</b>：偏理科、善策划、<b>没主见</b>',
      '<b>子酉相见主桃花偷情</b>——「<b>几乎没有跑</b>」',
      '<b>子半合</b>：子丑合（详见第七节）。',
      '<b>丑土</b>',
      '<b>总览</b>：<b>脾胃、脚、金库银行、坟墓寺庙、认死理</b>。',
      '<b>核心取象</b>：',
      '<b>丑代表成熟的女性、老女人</b>',
      '<b>丑代表动物牛，表示勤勉可靠、任劳任怨、倔强从一</b>',
      '<b>丑为阴性湿土，能泄火生金</b>',
      '<b>在人体指胃腹</b>，还指<b>女性子宫，有养育包容之德</b>',
      '<b>牛代表踏实稳定，渐渐聚财</b>，在百姓心中就是<b>财富的象征</b>',
      '<b>丑土生金，又成了金融的代表词</b>，也是<b>富贵的象征</b>',
      '<b>还指土桥、庙宇，富贵吉祥的象征</b>',
      '<b>在金口诀中的名字是"贵人 大吉"</b>',
      '<b>丑土性温忠实可靠，逢被木克必伤财身。逢生必定有喜。为官清廉，为财富足</b>',
      '<b>所以丑在金口诀中是喜庆之神，富贵之神</b>',
      '<b>丑土的母性、子宫与"宫寒"断法</b>',
      '<b>丑在贵神断脚的火车实例</b>',
      '<b>丑土为何既指寺庙桥梁、又指银行金库？</b> 因为它<b>属土而能生金</b>——土为承载、为建筑，故指寺庙桥梁；<b>能生金则主财，故又指金库银行</b>。同一个"丑土"，因为兼有"土"和"生金"两重属性，就有了这两类取象',
      '<b>丑戌未三刑的来源</b>：',
      '戌狗的特性是吠叫，奸诈不实，看家护院，与牛的沉静性格格格不入就出现了刑的状况。羊咩咩乱叫就扰乱了戌的工作，因为只有戌吠叫才能体现他的尽职尽责，羊乱叫，狗不能乱叫，所以戌就讨厌未，就成了牛讨厌狗、狗厌烦羊、羊不如牛受重视，渐渐变成了三刑。<b>这些都是来源于生活的联想，只是便于思路的灵活运用。切勿当真。</b>',
      '<b>寅木</b>',
      '<b>总览</b>：<b>财富权力、中草药、被克损财损官、青龙第一财神</b>。',
      '<b>核心取象</b>：',
      '<b>寅虎是权威富有的象征</b>',
      '<b>在时间上代表天亮之前黑的一段</b>，现代时间 3 至 5 点，<b>等待黎明，期待幸福</b>',
      '<b>用虎来表示冒险、勇敢、胆量、威严、有力量、守护、有资本和占有欲</b>',
      '<b>寅代表宝剑</b>——古时涉猎打仗以木棍为矛，现在指宝剑',
      '<b>树木对生活有着很大的影响</b>：造纸建房、布匹、桥梁、中药材，承载文化信息，<b>有文明富贵之象，古代之文官</b>',
      '<b>寅本身对生活起着巨大的影响</b>，穿的、吃的、住的、用的都离不开寅，<b>所以它是财富的象征，一旦寅受克必定伤财受损失</b>',
      '<b>寅被指为第一财富</b>',
      '<b>寅木——正直有才、青龙文官</b>；<b>寅寅为用胆大</b>；<b>木旺一根筋</b>',
      '<b>寅木类象——肝胆、膝、胆大胆小</b>',
      '<b>乙木类象——文字、文官、长辈、第一财神</b>；<b>乙木无论在哪个位置被克，必定破财</b>',
      '<b>注意</b>：<b>"寅为第一财神"</b> 与 <b>"乙木为第一财神"</b> 两种说法都存在——<b>寅是地支中的第一财神，乙是木行中的第一财神</b>。',
      '<b>卯木</b>',
      '<b>总览</b>：<b>婚姻交易、媒介信息、点卯</b>。',
      '<b>核心取象</b>：',
      '<b>房子有了，基础有了，就是成婚交合了</b>',
      '<b>在时间上表示天亮到太阳不热</b>，现代时间 5 至 7 点',
      '<b>用兔来表示双方高贵典雅和惴惴不安</b>，把最好的献给对方又担心对方的看法',
      '<b>卯时是人精力旺盛的时间，神经思维活跃，动脑动手勤劳工作、买卖</b>',
      '<b>现在泛指婚姻、贸易、交易、钱财</b>，现在上班点名还称<b>点卯</b>',
      '<b>卯时出门劳作开窗透气，还有门户之意</b>',
      '<b>开门推窗常被盗贼有机可乘，所以卯也有盗贼之象</b>',
      '<b>卯是动物兔子，机灵多动，可爱温顺，耳朵长爱打听事，对事物敏感</b>',
      '<b>兔子爱干净，常常双爪洗脸，现在指干净、敏感、化妆品</b>',
      '<b>因为卯是交易，交易必有钱财，所以卯也是仅次于寅的第二财富</b>',
      '<b>丁卯与癸卯也是对兔子的写照</b>：丁有花草象，兔子吃草就会降低注意力，交易常会出错，<b>所以丁卯常指徒劳无功</b>；<b>癸水生卯充足身体能量，所以癸卯更有聪明的交易，常常被指狡猾、心眼多</b>',
      '<b>卯是交易的含义</b>；<b>卯无根不立，所以卯性之人站没站相、坐没坐相，总爱依着东西</b>',
      '<b>卯逢酉必动，卯酉为门户都为桃花，所以还有拉纤说媒之意</b>',
      '<b>卯木类象——手指与技术、太冲盗贼、媒介生意、表演</b>',
      '<b>卯木的环境器物类象与"金克木主车祸破财"</b>',
      '<b>卯木为交易贸易中介——"卯入天门"主改换经营</b>',
      '<b>十二地支可以按人生历程来理解</b>——<b>这是记住它们取象的一条捷径</b>：',
      '<b>子</b>（阴阳交替）→ <b>丑</b>（出生）→ <b>寅</b>（成长、建房）→ <b>卯</b>（成婚交合）→ <b>辰</b>（劳作、精力最旺）→ <b>巳</b>（怀孕）→ <b>午</b>（生产）→ <b>未</b>（喂养孩子）→ <b>申</b>（孩子长大、出征）→ <b>酉</b>（女孩长大待嫁）→ <b>戌</b>（男孩长大成人）→ <b>亥</b>（子孙繁衍）',
      '<b>这个贯穿线索非常有助于理解十二支的取象来源。</b>',
      '<b>辰土</b>',
      '<b>总览</b>：<b>是非之神、好斗、暗黑手段、逢冲必打</b>。',
      '<b>核心取象</b>：',
      '<b>辰，晨字表示了太阳升起人在劳作</b>，振兴、振奋、震惊、震雷，都跟辰有关',
      '<b>地支第五位，太阳自红转白到热，时间较短</b>，指上午 7 至 9 点，<b>此时人的精力最旺盛，体力最好，工作效率最高</b>',
      '<b>用龙来表示气宇轩昂的精神和理想</b>',
      '<b>男人阳气充足，精力充沛，劳作战斗的最佳时期，惹是生非结帮搭伙，以显示男人之强</b>',
      '<b>辰本性善良，欺恶扬善，把自己当做震慑恶人的化身不容侵犯，所以逢冲必有打斗，见戌则争，逢克必有官讼</b>',
      '<b>在现代常指黑恶势力，不遵纪守法，歪门邪道，阴暗的一面</b>',
      '<b>课内辰土旺必有是非出现，无论辰克水还是自身受克，都有伤灾或不正当现象出现</b>',
      '<b>辰还代表皮肤</b>',
      '<b>逢申子成水局，起到收纳盗贼之功，所以还代表法律机构、监狱、收容所、拍卖行</b>',
      '<b>辰还是皮肤、胳膊</b>；<b>被申金侵入见子水，有身体输液之象</b>；<b>还指医疗机构，常指西医</b>',
      '<b>辰土主西医，寅木主中医</b>——<b>为什么？</b> <b>辰为皮肤、申为针头与金属、子为水</b>，三者合成<b>申子辰水局</b>，正是<b>打吊瓶、输液</b>之象，所以辰指西医；<b>寅木主生发、主草木</b>，指中草药；而<b>寅与申又正相冲</b>，一中一西，恰好相对',
      '<b>辰土的性格——霸道、暗黑势力，但仍有善良之心</b>',
      '<b>巳火</b>',
      '<b>总览</b>：<b>胎神、美丽妖娆、变化多端</b>。',
      '<b>核心取象</b>：',
      '<b>甲骨文的写法像胎儿，表示一个新的生命在母体内跳动</b>',
      '<b>地支第六位，指上午 9 至 11 点</b>，取其中间时数 10，正跟孕育的月份一致',
      '<b>用蛇来表示神秘蜷伏。所以巳是胎神所指</b>',
      '<b>「课内见甲为喜庆，逢巳为怀孕」</b>',
      '<b>巳的特性是阴火小火，有光明亮丽美丽之象，常指风骚妖冶的女子</b>',
      '<b>蛇身千般变化无形无规，见物攀附，常附寄身与木，自诩为龙，虚荣夸张华而不实</b>',
      '<b>木为财富象征，巳缠附而不得木，表现嫉妒猜疑；如见他木更好，更易屈身易主，不坚贞不守贞，贪图享受不劳而获</b>',
      '<b>受惊易怒，舌芯相向（爱粗口谩骂）</b>',
      '<b>现在常指女子第三者、风尘女子</b>',
      '<b>巳逢酉为陪酒女</b>',
      '<b>巳身无形让人捉摸不定，现在指符号，比如阿拉伯数字、英语等不规则图案</b>',
      '<b>巳火——是非之神、"闭口"阴火、爱生闷气</b>',
      '<b>巳火加辰土为何主女子流产？</b> <b>巳为胎神</b>（巳像胎儿之形）。<b>辰土本身带湿气，又是帝旺之土</b>——巳火一入辰土，<b>受伤走不动、施展不开</b>，胎神受制，所以巳辰相见，在女子身上多应流产之象',
      '<b>寅巳申三刑的来源</b>：',
      '寅见午为光明喜庆，巳缠寅不允生午火，巳必与午火纠缠为天罗网其动，但毕竟巳不敌午，退缩与午伺机而动……巳缠与寅逢申，申金克木，巳无处安身，<b>故成寅巳申无恩之刑</b>。如再见亥，亥水生寅木、泄申金，巳重新回来缠缚寅木，变成和平共处的四孟。<b>（切勿当真，如有雷同实属巧合）</b>',
      '<b>午火</b>',
      '<b>总览</b>：<b>热情文化、多才多艺、毅力不足</b>。',
      '<b>核心取象</b>：',
      '<b>生产，胎儿出母体见太阳了</b>',
      '<b>地支第七位，指中午 11 至下午 1 点</b>，用马来表示<b>热情奔放，兴高采烈</b>',
      '<b>火为炎上，有积极向上努力进取之意，有文明象征</b>',
      '<b>在"仁 义 礼 智 信"中为礼，知书达理，有文化，爱做文章，琴棋书画，多才多艺</b>',
      '<b>但火焰外实内虚，表现欲强，表达能力强口才好说话快，管头不顾尾，热情高毅力差</b>',
      '<b>如有逢寅木为光明文明之状</b>，现在常指<b>火电、文化机构</b>',
      '<b>再临戌成局，火得收敛成炉，做饭冶炼得益与人，所以火局为喜庆之局</b>',
      '<b>现在也常指结婚或大型文化聚会活动</b>',
      '<b>见子水则颓废，道德败坏，涂鸦乱语，好事沦败，反复无常，计划更改</b>',
      '<b>宫位占离卦排次女，临子水女子身体有损，水入火来妇难安</b>',
      '<b>午火的性格——求快反复、虎头蛇尾、见风倒</b>',
      '<b>午火对应与电有关的现代行业</b>——<b>为什么？</b> 火主光明、主热能，<b>电正是现代的光热之源</b>。所以电线、电器、电子行业都归午火',
      '<b>十二时辰为类象之源</b>——午时对应中午，人的状态决定了午火的取象',
      '<b>未土</b>',
      '<b>总览</b>：<b>容纳、拉家常、酒食说媒、善良有信仰、脾胃</b>。',
      '<b>核心取象</b>：',
      '<b>未，人出生就要吃饭填饱肚子，大人要接着为养活孩子吃饭继续努力工作</b>',
      '<b>所以未在类象有餐饮之象</b>',
      '<b>地支第八位，指下午 1 至 3 点</b>，用羊来表示<b>温文儒雅，嗷嗷待哺</b>',
      '<b>喂养孩子吃饱大多是女人的事，未还指女人、母亲</b>',
      '<b>宫位临坤卦，属阴性，无劳动力，藏纳财务，常指贤妻良母</b>',
      '<b>女人没事干就会出来聊天拉家常，所以未有长舌妇之称，爱说话得罪人而不知</b>',
      '<b>未在无生无泄的情况下被寅木克指寡妇</b>',
      '<b>因为坤宫属阴，也常指阴气重之地，常出现神婆、烧香信佛之人</b>，未有善良之心',
      '<b>未土类象——美食家、碎嘴、媒婆、寡妇</b>',
      '<b>申金</b>',
      '<b>总览</b>：<b>白虎第一凶神，只宜水泄</b>。',
      '<b>核心取象</b>：',
      '<b>申为金主流动，生活延伸下去，忙碌不停，生生不息，必须坚强的生活，为了希望和幸福勇敢进取，尽显杀气，为了家国安定必须身赴疆场</b>',
      '<b>所以申金为阳刚之气，军人厮杀，刀剑相交，道路往来，如猛虎下山，威严凶残</b>',
      '<b>申金为白色，又称白虎</b>',
      '<b>「白虎出现克与被克都会有凶灾伤残，是非祸端，如再现吊客丧门，必有白事临身，吊睛白虎凶残无度」</b>',
      '<b>「一般白虎就是凶神恶煞的代名词。课内出现必须注意，一般都非吉事。」</b>',
      '<b>「再凶残的人也有克星，所谓一物降一物，英雄难过美人关，见到温顺如水的美女，则会百般殷勤，图鱼水之欢，所谓的金水相生、儿女多情」</b>',
      '<b>申金——移动之神；申亥"断而复续"；申酉之人的性情</b>',
      '<b>申金类象——军警武官、流动传送、资金留不住、白虎杀气</b>',
      '<b>酉金</b>',
      '<b>总览</b>：<b>待嫁女子、贴"酉"字民俗、桃花阴神</b>。',
      '<b>核心取象</b>：',
      '<b>女孩长大的庆贺：酉字下面是一个女阴的符号，酉字象个装酒的坛子</b>',
      '<b>所以酉是待嫁的女子，标致沉静，喜装扮配首饰，等待贵人的出现，等顶花盖罗时（巳）就是出闺嫁人妇</b>',
      '<b>巳加酉临丑成金局为淫局</b>',
      '<b>太阳落山到天黑，地支的第十位，指下午 5 至 7 点</b>',
      '<b>用以纪月，即农历八月，成熟的季节</b>',
      '<b>酉属阴金生水为酒，桃花泛滥，喝酒乱性，隐私淫欲之象</b>',
      '<b>在现代生活中女性要么不喝酒、要么酒量大，如果女性课中丑酉相见，酒色力度就大多了</b>',
      '<b>酉也为"有"的谐音</b>——以前在家中米缸木柜上常贴一个酉字，代表<b>富有</b>；<b>贴门口代表家有待嫁闺女，俗称大闺女</b>',
      '<b>桃花第一神</b>',
      '<b>酉金——四大桃花之神、为嘴为说；"金口诀"为何取酉金之象</b>',
      '<b>酉金类象——隐私桃花、漂亮女人、镜子与平滑之地；动嘴的工作与走私</b>',
      '<b>戌土</b>',
      '<b>总览</b>：<b>成熟男人、外冷内热、军警、天空、身份多重变化</b>。',
      '<b>核心取象</b>：',
      '<b>男孩长大的庆贺：戌字描述了斧钺的形状，旁边还有个人的符号</b>',
      '<b>男人是氏族的中间力量，男子成人后能够捍卫氏族的存在，征战搏杀，开拓领地</b>',
      '<b>戌字背进式的交合形态，并突出了男性的性器</b>',
      '<b>戌字和卯字描述的是人类两种最基本的交合形式，卯字显得双方自愿自然，像结婚后的动态；戌字就有单方面主动甚至强暴的特点，象在战争中俘获对方女性后的动态</b>',
      '<b>戌旺之人欲望强，这都是在实践中验证准确</b>',
      '<b>天黑到深夜前，地支的第十一位，指下午 7 至 9 点</b>，用狗来表示<b>忠诚、善战，爱争执，执拗，心地善良正义，看不惯鼠辈，常被指多管闲事</b>',
      '<b>因为戌的工作就是看家护院忠实与主人，警觉性很高，现在常指政法警部门、监狱，对抗辰土黑暗势力</b>',
      '<b>戌狗防盗贼，看门户，必须小心谨慎，心思缜密，实实虚虚，所以戌有奸诈象</b>',
      '<b>因为卯与戌是六合，酉来冲卯，引起戌狗反感，就追打酉，成了狗追鸡没处飞，鸡与狗不相往来，不适宜婚配</b>',
      '<b>戌有虚意，空虚寂寞，戌旺之人主孤单空虚。讲空话说大话，被指不实在</b>',
      '<b>对于普通人而言，就是寂寞难耐，需要寻找地方发泄；对于高僧而言，就是心静如水打坐思考</b>',
      '<b>所以天空指有修行的高僧</b>',
      '<b>天空，上为心静如水，下为心里空虚、浮躁</b>',
      '<b>天空好的话就是高僧、修行家、策划师、术数专家、学术专家；不好的时候就是空虚寂寞、废物、破烂</b>',
      '<b>所以天空也主废弃物、破旧场所，还指坟墓</b>',
      '<b>戌土——清高心机重、修行学艺；坟墓、油库、监狱与变压器</b>',
      '<b>亥水</b>',
      '<b>总览</b>：<b>阴极反阳、柔顺灵巧、高楼楼台、会计</b>。',
      '<b>核心取象</b>：',
      '<b>孩子，子孙的重任：人类生生不息，血脉相传</b>',
      '<b>深夜，地支的第十二位，指晚 9 至 11 点</b>，属阴水克火生木，用猪来表示<b>富足美满</b>',
      '<b>亥为子孙得气见喜，失令为乞</b>',
      '<b>亥为 12 地支最后一位，阴极返阳，柔顺听话乖孩子</b>',
      '<b>亥属阴温顺如水，如月光给人以期望，有近水楼台先得月美誉</b>',
      '<b>现在指绸缎、窗帘、丝绸、纸张</b>',
      '<b>水无孔不入，乖巧伶俐</b>',
      '<b>巳与亥对冲，巳为数字文符，亥能制服巳火，亥水容易当会计，总和数字打交道</b>',
      '<b>茶水能待客</b>',
      '<b>亥得令主赏赐、旺相有制主人善良、旺无制主人轻薄、暗昧之事、暗昧之人、不守本份之人</b>',
      '<b>亥主妄想</b>',
      '<b>亥入乾宫，乾为头领，亥有楼台高阁之意</b>',
      '<b>亥前有子水后有戌追，要么汇流如海，要么干涸命竭</b>',
      '<b>亥，害怕也（害怕、胆怯、疑惑、惊讶、危险、恐惧）</b>',
      '<b>亥能流通冲巳传输，现在还指网络</b>',
      '<b>亥合寅多财旺官，容易得到赏赐</b>',
      '<b>亥水类象——阴柔听话、乞索小儿、小水绸缎；婚姻与病难查</b>',
      '<b>十二地支类象总结</b>',
      '<b>学习方法</b>：',
      '<b>十二地支类象不必死记，关键是把五行属性吃透。</b>',
      '<b>抓本性、延伸新类象</b>：',
      '<b>类象随社会发展而变——网络、微博、软件、银行怎么取象，都要从五行本性出发。</b>',
      '<b>例如</b>：',
      '<b>巳火代表小火、微电</b>，巳为蛇主游动、主信息，「<b>很符合网络的现象</b>」',
      '<b>亥水主小水、微波（微博）、流动、口水议论、隐秘隐私</b>，「<b>见卯为交易，很符合现代网络购物</b>」',
      '<b>子水</b>为隐私隐秘、流动、设计策划、任性随意、无主见、听指挥，为<b>军人、软件、机密档案、四大桃花</b>，又为<b>秘书、私情</b>',
      '<b>十二地支的生肖、时辰、方位对照表</b>：',
      '| 支 | 生肖 | 时辰 | 五行 | 方位 | 月建 |',
      '|---|---|---|---|---|---|',
      '| 子 | 鼠 | 23–1 | 水 | 北 | 十一月 |',
      '| 丑 | 牛 | 1–3 | 土 | 东北 | 十二月 |',
      '| 寅 | 虎 | 3–5 | 木 | 东北 | 正月 |',
      '| 卯 | 兔 | 5–7 | 木 | 东 | 二月 |',
      '| 辰 | 龙 | 7–9 | 土 | 东南 | 三月 |',
      '| 巳 | 蛇 | 9–11 | 火 | 东南 | 四月 |',
      '| 午 | 马 | 11–13 | 火 | 南 | 五月 |',
      '| 未 | 羊 | 13–15 | 土 | 西南 | 六月 |',
      '| 申 | 猴 | 15–17 | 金 | 西南 | 七月 |',
      '| 酉 | 鸡 | 17–19 | 金 | 西 | 八月 |',
      '| 戌 | 狗 | 19–21 | 土 | 西北 | 九月 |',
      '| 亥 | 猪 | 21–23 | 水 | 西北 | 十月 |',
      '<b>十二地支对应人体</b>：',
      '| 支 | 人体 |',
      '|---|---|',
      '| 子 | 会阴、耳、腰、液、溺 |',
      '| 丑 | 肚、腹、脾、肌、肉、阴道、子宫 |',
      '| 寅 | 臂、肢、胆、筋、脉、发、毛 |',
      '| 卯 | 肝、胸、目、手、爪、筋 |',
      '| 辰 | 背、胸、项、肩、皮肤、胃 |',
      '| 巳 | 面、牙齿、心胞络、三焦、咽喉 |',
      '| 午 | 心腹、小肠、目、舌、神气 |',
      '| 未 | 脾、胸、胃、腹、口、头面 |',
      '| 申 | 声咳、肺、大肠、筋骨、经络、音声 |',
      '| 酉 | 肺、鼻、皮毛、声 |',
      '| 戌 | 命门、胸、筋、臀、腿、膝、足 |',
      '| 亥 | 肾、头、阴囊、髓、精 |',
      '---',
      '<b style="color:var(--c-gold)">第七节　地支之间的关系</b>',
      '<b>地支之间的关系，是金口诀断课的主体。</b> 天干只作牵线搭桥，<b>真正决定成败的是地支之间的生克冲合刑害破绝</b>。',
      '<b>一、六合</b>',
      '<b>1.1 六合总表</b>',
      '| 六合 | 化 | 性质 | 断语 |',
      '|---|---|---|---|',
      '| <b>子丑</b> | 土 | <b>克合</b> | <b>先密后疏</b> |',
      '| <b>寅亥</b> | 木 | <b>生合</b> | <b>生破陌路</b> |',
      '| <b>卯戌</b> | 火 | <b>克合</b> | <b>自焚难躲</b> |',
      '| <b>辰酉</b> | 金 | <b>生合</b> | <b>私情贪淫</b> |',
      '| <b>巳申</b> | 水 | <b>克合</b> | <b>面合心鬼</b> |',
      '| <b>午未</b> | 土 | <b>生合</b> | <b>占婚必争</b> |',
      '<b>总原则</b>：',
      '<b>生合为吉祥合，克合勉强相合、各有心算。</b>',
      '<b>1.2 逐组详解</b>',
      '<b>子丑合土（克合）——先喜后疏</b>',
      '「子丑合而化为土，<b>实际是泥</b>。占感情、关系，<b>是先好，而后坏</b>。子为水，丑为土，终为泥，<b>水自毁形，让土也不完整，完全失去本来面目，不是当时的初衷</b>。」',
      '<b>子丑合在手掌中为不分离最近的六合</b>',
      '<b>此六合常指有亲缘关系的合，比如亲戚合作，关系较近的合作</b>',
      '<b>但正因为太近，反而容易"水自毁形"，所以"合伙买卖做不久"</b>',
      '<b>寅亥合木（生合）——生破两路</b>',
      '「寅与亥合，<b>但又有破的成分。是吉中隐凶的合。不是十全十美的合。</b>阴阳相生本意是美好的，但<b>亥为阴水小水，生阳木大木，是亥牺牲自己助寅木成才</b>，所以亥主温顺、祈求之象。以前女子无才便是德，甘心在家烧水做饭，让寅木生发，<b>木成才给亥以天后美称</b>。」',
      '<b>又叫"破合"的自我牺牲</b>——<b>寅亥既是六合，又是相破</b>（详见相破一节）。',
      '<b>卯戌合火（克合）——自焚难躲</b>',
      '「卯戌合而化为火，<b>如果用爻是戌还好一些。如果用爻是卯木，则阴木被火化掉。所以，为自焚。</b>戌为火库外冷内热，卯本意为克合，但<b>卯为阴木体小力薄，终被火焚，不自量力</b>。」',
      '<b>断婚姻时常有未婚同居信息</b>',
      '<b>断求财时先得后失</b>',
      '<b>「卯见戌亥经营变」</b>——<b>卯遇到戌，卯主交易被焚烧没有了，赔钱没法经营了，只能寻求改变；卯遇到亥有新项目遇到，半合木局，增加新的经营范围</b>',
      '<b>所以也发生改变，一个是绝境求变，一个是锦上添花</b>',
      '<b>辰酉合金（生合）——私情贪淫</b>',
      '「辰酉合为化为金，<b>为淫滥之合</b>。占婚姻遇此，<b>主未婚同居</b>。如果是已婚遇此，<b>易有私情</b>。辰有是非霸道之象，土性又为水库，<b>辰有恶意暗手段生酉金桃花淫神，亦有包养之意</b>，辰主霸道霸王之意，酉为桃花淫欲女子属相鸡，<b>戏称霸王别姬</b>。终有分离之象。」',
      '<b>巳申合水（克合）——面合心鬼</b>',
      '「巳申合而化水，<b>且巳与申又有刑的关系，所以称为刑合</b>。巳主心，漂亮美丽有心计；申为豪放爱面子。<b>巳以美艳主动合申，对申有祈求，表面应付暗自用心克金得益，面和心不合。</b>」',
      '<b>「英雄难过美人关，金爱面子，得过且过，见不到就想念，相聚了又吵闹」</b>',
      '<b>「申为移动之神，巳合申常有跟随人走的信息」</b>',
      '<b>午未合土（生合）——占婚必争</b>',
      '「午未合而化土，为生合。<b>但最忌占婚。占婚多有争婚之事发生。</b>争婚就是，二男争一女、二女争一男，关系复杂。」',
      '<b>午火主反复，见异思迁</b>',
      '「午火生丑土为害不合，生戌入库合局（午火不能动），生辰土（辰暗自带水火有畏惧），生未土阴阳相生得合，<b>但未土干燥，火旺必焦，午火必不能久留</b>，午火炎上跳动不安，不甘心焦土灰烬，<b>必然更换其他未土继续燃烧</b>」',
      '<b>午火为眼目、贪慕虚荣又身居桃花，盯其他六合之地贪恋占有</b>',
      '<b>一般断有第三者插足十分准确</b>',
      '<b>午未合又叫"真婚煞"</b>——<b>为什么叫"煞"？</b> 因为它虽是生合，却主"争婚"，<b>在婚姻上是个凶兆，故名"煞"</b>',
      '<b>1.3 断六合的三步</b>',
      '<b>第一步：看它化什么</b> ——化出的五行，能补课内所缺，也能改变力量对比。',
      '<b>第二步：看它能合多久</b> ——生合长久，克合勉强。',
      '<b>第三步：看谁得利</b> ——谁主动合谁，谁就有所求。',
      '<b>1.4 六合的先后（断课窍门）</b>',
      '<b>六合分先后合，也就是谁主动合谁，这在断课时有特殊意义。比如丑为用神，子合丑为别人主动找我合。</b>',
      '<b>外生内主别人主动找我合，内生外我主动找别人合。其他六合意思一样。这就是断课的窍门。</b>',
      '<b>1.5 午未合到底化什么？</b>',
      '<b>有的说法认为"午未合化火"，这是错的。</b>',
      '<b>午未合化的是土，不是火。</b>',
      '<b>为什么？</b> 因为<b>未本身就是土</b>，午火生未土，<b>合的结果是火生土</b>——化出来的自然是土。',
      '<b>如果化成火，等于火生火，那是没有意义的。</b>',
      '<b>1.5 课式实证：六合与半合同现</b>',
      '<code>`</code>',
      '人元：丁　　火 - 旺',
      '贵神：庚午（朱雀）用　火 + 旺',
      '将神：辛未（小吉）　土 - 相',
      '地分：卯　　木 - 休',
      '<code>`</code>',
      '<b>先定旺衰</b>：四位是<b>火、火、土、木</b>。<b>火占两位</b>，而且<b>火与木都不受克</b>（课内无金、无水）—— 取多者，<b>火旺</b>。火旺则<b>土相</b>（火生土）、<b>木休</b>（生火者）。',
      '<b>再看这个课里的"合"，有两层</b>：',
      '<b>第一层：午未六合。</b>',
      '<b>贵神是庚午火，将神是辛未土</b> —— <b>午未相合</b>。<b>午未合化土</b> —— <b>为什么化土？</b> 因为<b>未本身就是土，午火又来生它</b>，所以合出来的是土。',
      '<b>第二层：卯未半合木局。</b>',
      '<b>将神未土与地分卯木</b> —— <b>卯未是"亥卯未"木局的半合</b>，只缺一个<b>亥</b>。',
      '<b>这个课有意思的地方在于</b>：<b>同一位"未土"，一边与午合（化土），一边与卯合（化木）</b>。',
      '<b>它到底往哪边走？</b> 这就要看<b>哪一边的力量大</b>：',
      '<b>午未合</b> —— <b>午火正旺</b>，而且<b>火生土</b>，这一边是"顺"的；',
      '<b>卯未半合</b> —— <b>卯木正休</b>（被火泄），<b>力弱</b>，而且还是个"缺一位"的半合。',
      '<b>所以这一课的主线是"午未合化土"</b> —— <b>未土得火生，力量落在土上</b>。',
      '<b>断事就是</b>：<b>事情会成，但成在"土"上</b> —— <b>土主田宅、主固定、主厚重</b>。问事业是<b>稳当的路子</b>，问财是<b>有实底</b>，问变动则<b>动不起来</b>（土主静）。',
      '<b>这一课也说明"合"的两条规矩</b>：',
      '<b>合要看化不化</b> —— 午未合化土，是因为<b>未本来就是土、午又来生它</b>；',
      '<b>半合要看缺的那一位</b> —— 卯未缺亥，<b>这个局现在不成，等亥来了才算</b>。',
      '<b>二、三合</b>',
      '<b>2.1 三合总表</b>',
      '| 三合局 | 性质 |',
      '|---|---|',
      '| <b>寅午戌</b> 合火局 | <b>财帛文书喜美之合</b> |',
      '| <b>亥卯未</b> 合木局 | <b>交易婚姻和会之合</b> |',
      '| <b>申子辰</b> 合水局 | <b>行移征战干蛊之合</b> |',
      '| <b>巳酉丑</b> 合金局 | <b>阴阳淫滥轻薄之合</b> |',
      '<b>三合的关系</b>：',
      '<b>地支间的三合关系是构成对应的等边三角形关系，这种关系是一种最稳定的关系，即每种三合关系都构成一种朋党关系，它们之间相互照应、互帮互助。</b>',
      '<b>2.2 三合口诀</b>',
      '<b>寅午戌合火局全，文书喜庆艺表演。人元见丙名气高，亥子水见成事难。</b>',
      '<b>亥卯未合木局见，婚姻交易最喜欢。申酉坏局成复败，人元见乙整局全。</b>',
      '<b>申子辰合水局战，势力不明从内乱。最怕戌土来搅局，壬水居元水无边。</b>',
      '<b>巳酉丑合金局滥，贪淫轻薄权宜欢。巳午逢局金朋散，人元见丁为美全。</b>',
      '<b>2.3 逐局详解</b>',
      '<b>寅午戌火局</b>',
      '<b>主喜庆文书、婚嫁、联欢、求名求学，吉祥喜美</b>',
      '<b>人元见丙为火局全，占事主成，有名气有名望</b>',
      '<b>如果有亥子水入课，则火局被破。合而不合，成而复败</b>',
      '<b>亥卯未木局</b>',
      '<b>利占婚姻交易有成</b>',
      '<b>如申酉金入课，则主木局被破，凡事成而复败，由易变难</b>',
      '<b>如人元再见乙，则木局全，占事主成</b>',
      '<b>申子辰水局</b>',
      '<b>虽为三合之局，但常有内部争斗不合，各自为政</b>',
      '<b>申为金有萧杀之气，子有盗名淫欲之举，辰为恶势暗斗，三方沆瀣一气必定不易长久</b>',
      '<b>最怕见戌土破局。戌土有政法军警之象，逢辰必动</b>',
      '<b>人元见壬水为水局全</b>',
      '<b>巳酉丑金局</b>',
      '<b>巳火欲克酉贪淫，但丑能掩其酉、泄其巳，就成了巳想克金贪生，酉想得丑护身，丑想得巳之利，淫欲贪婪轻薄相合，终不能长久</b>',
      '<b>常指为某种利益临时组合在一起的三合</b>',
      '<b>人元再见丁为金局全</b>',
      '<b>逢午为坏局、求事阻隔难成</b>',
      '<b>2.4 成局与坏局的条件（重要）</b>',
      '<b>坏局判定（特殊规定）</b>：',
      '<b>三合局怎样才是坏局？如寅午戌合火局，如果人元见水不能算坏局，只有课内见子或亥才是坏局。</b>',
      '<b>破局的快慢</b>：',
      '<b>子破火局快</b>',
      '<b>酉破木局快</b>',
      '<b>戌破水局最快</b>',
      '<b>金局宜火克</b>',
      '<b>成局的外部条件</b>：',
      '<b>合化成局的外部条件——外面有一个支持的就够。</b>',
      '<b>2.5 三合与三会的区别</b>',
      '| | <b>三会（三汇）</b> | <b>三合</b> |',
      '|---|---|---|',
      '| <b>构成</b> | 相同一条线上的三个地支 | 三个位置的关系组合 |',
      '| <b>比喻</b> | <b>邻居关系</b> | <b>亲戚朋友的组合</b> |',
      '| <b>特点</b> | 遇到问题能同心协力，<b>力量大，随大溜不持久</b> | 为了某事聚合在一起，<b>长久性高</b> |',
      '| <b>稳定性</b> | — | <b>申子辰、巳酉丑稳定性相对较差</b> |',
      '<b>申子辰组合</b>：申为移动之神，子为隐私不明，辰为阴暗强势。<b>具有黑白势力的结合形式</b>，常见利忘义、树倒猢狲散，<b>为争蛊之合不易稳定</b>。',
      '<b>巳酉丑组合</b>：巳为是非游弋之神，趋炎附势贪淫轻薄；酉为桃花淫神，求事一般有女子参与或因女人事起；丑为老妇人、金库。<b>常指为某种利益临时组合在一起的三合。</b>',
      '<b>2.6 课式实证：虚一待用</b>',
      '<code>`</code>',
      '干支：癸巳年　乙卯月　癸酉日　戊午时',
      '月将：戌　日空：戌、亥　四大空亡：水',
      '人元：壬　　水 + 相',
      '贵神：庚申（白虎）用　金 + 旺　天德、天马',
      '将神：甲寅（功曹）　木 + 死　月德、天医、六甲、劫煞',
      '地分：戌　　土 + 休',
      '<code>`</code>',
      '<b>这个课里有没有三合？</b> 看四位：<b>申、寅、戌</b>（人元是壬水）。',
      '<b>申子辰水局</b> —— 有<b>申</b>，缺<b>子、辰</b>；',
      '<b>寅午戌火局</b> —— 有<b>寅</b>、有<b>戌</b>，<b>只缺一个午</b>。',
      '<b>这就是"虚一待用"。</b>',
      '<b>三合局里已经有了两个字，只缺一个字 —— 这个局就"等着"那一个字来凑。那个字什么时候到，局就什么时候成。</b>',
      '<b>这一课缺的是"午"</b>。所以：',
      '<b>逢午的月、逢午的日，寅午戌火局就合成</b>；',
      '<b>局一成，火就旺</b> —— 而<b>火克金</b>（贵神申金），<b>火又泄木</b>（将神寅木）。',
      '<b>应期就从这里出来</b>：<b>"等午"</b> —— <b>午月、午日，就是这个局成的时候。</b>',
      '<b>还有一层要紧的</b>：<b>地分戌土正逢日空</b>（癸酉日属甲子旬，空戌亥）。',
      '<b>戌是寅午戌的一角，它正逢空</b> —— 所以这个局<b>眼下还没成，得等戌被填实</b>。',
      '<b>空的那一位，往往正是"待用"的那一位。</b>',
      '<b>所以三合在断课里有两个用法</b>：',
      '<b>已经成局的</b> —— 直接按局论成败；',
      '<b>缺一位的</b> —— 把它当作<b>应期</b>来用：<b>缺哪一位，就等哪一位。</b>',
      '<b>三、相冲</b>',
      '<b>3.1 六冲总表</b>',
      '| 相冲 | 断语 | 详解 |',
      '|---|---|---|',
      '| <b>子午</b> | <b>往返不宁，道途受惊</b> | 水火交战，反复之象与车马血光 |',
      '| <b>丑未</b> | <b>差失举动，谋望无成</b> | 阴土相冲，口舌诅咒与欺压 |',
      '| <b>寅申</b> | <b>夫妻离别，劳波无功</b> | 金木相战、文武相斗，道路追逐、劳碌无功 |',
      '| <b>卯酉</b> | <b>奸私不正，门户变更</b> | 门户之争、搬家变迁，<b>地分卯酉冲最验</b> |',
      '| <b>辰戌</b> | <b>打斗诉讼，信仰不同</b> | 真实的打斗、诉讼与刑狱 |',
      '| <b>巳亥</b> | <b>气索多生，求事难成</b> | 口舌、思想斗争与"空灵""神经" |',
      '<b>总原则</b>：',
      '<b>逢冲必动，冲则散则离，小病喜冲，不利合作。</b>',
      '<b>3.2 逐组详解</b>',
      '<b>子午相冲</b>',
      '<b>往返不宁，道途受惊</b>',
      '<b>常指求事反复</b>——子有流动象，午有反复象',
      '<b>午为马，在古代有马车，现在午也有车辆之象，见冲需见血</b>',
      '<b>还有血压高低之象</b>——子水为血液，午火主心脏，<b>子水在午下冲上为高血压心脑血管病</b>',
      '<b>水入火来妇难安，女子有灾身心难安，女子流产心痛、产灾之意</b>',
      '<b>子午为桃花，也主多情奔波，为感情烦恼</b>',
      '<b>表现</b>：<b>心肌梗塞、高血压、孕妇多流产、容易有烫伤、水灾、火灾</b>',
      '<b>子午相冲（二）——女子之灾、桃花相冲、玄武见火主盗与烫伤</b>',
      '<b>丑未相冲</b>',
      '<b>差失举动，谋望无成</b>',
      '<b>阴土主静，二阴土相冲没有辰戌相冲力度强</b>',
      '<b>阴土体现在咀咒谩骂、观点性对抗、相互埋怨</b>',
      '<b>二者还有相刑成分存在，有欺压性与抗争的矛盾相对立</b>',
      '<b>身体方面多表现为皮肤、脾胃，太旺为忌也主心脏、肺部疾病的信息</b>',
      '<b>寅申相冲</b>',
      '<b>夫妻离别，劳波无功</b>',
      '<b>金木相交，口舌争斗，文武相斗</b>',
      '<b>申为移动之神，二者又是驿马关系，申为车辆，更主道路驰骋、计划更改、损财伤灾</b>',
      '<b>常指跑业务倾销的</b>',
      '<b>也主人一生多走动的意思，内心不平静，急功近利，终不能获</b>',
      '<b>身体方面</b>：肝胆、肺部、头部、筋骨，也主神经、头脑',
      '<b>卯酉相冲</b>',
      '<b>奸私不正，门户变更</b>',
      '<b>子午卯酉四大桃花，卯酉相见也主桃花外情</b>',
      '<b>卯酉为门户，还指搬家搬迁、变换</b>',
      '<b>又指主盗贼破门入户、背约失信、色情纠纷</b>',
      '<b>特别在金口诀"地分卯酉冲"搬家断验精准</b>',
      '<b>身体方面容易伤在肺部，开刀留下伤疤</b>',
      '<b>辰戌相冲</b>',
      '<b>打斗诉讼，信仰不同</b>',
      '<b>辰戌自为天牢地狱，又是诉讼之神，二者相见必起事端</b>，而且是真实的打斗',
      '<b>详见"土"一节的辰戌断法</b>',
      '<b>巳亥相冲</b>',
      '<b>气索多生，求事难成</b>',
      '口舌、思想斗争与"空灵""神经"',
      '<b>巳亥为乞索之神</b>，相冲主<b>气索多生</b>',
      '<b>3.3 冲的三类</b>',
      '<b>冲的三类——地域之冲与职业之冲。</b>',
      '<b>职业之冲</b>——指<b>居住地和职业均改变</b>',
      '<b>辰戌丑未冲乃职业之冲</b>——指<b>居住地不变，职业变动</b>',
      '<b>这些都是断课的诀窍，真传一句话。</b>',
      '<b>3.2 课式实证：冲要看"哪一类"和"成没成"</b>',
      '<b>"冲"不是一个笼统的概念</b> —— 不同的地支相冲，主的事情不一样。看这个课：',
      '<code>`</code>',
      '干支：癸巳年　乙卯月　癸酉日　戊午时',
      '月将：戌　日空：戌、亥　四大空亡：水',
      '人元：壬　　水 + 相',
      '贵神：庚申（白虎）用　金 + 旺　天德、天马',
      '将神：甲寅（功曹）　木 + 死　月德、天医、六甲、劫煞',
      '地分：戌　　土 + 休',
      '<code>`</code>',
      '<b>这一课里，二神之间就带着"冲"</b>：<b>贵神申金、将神寅木</b> —— <b>寅申相冲</b>。',
      '<b>寅申相冲是哪一类？</b> 地支相冲分三类，各有各的断法：',
      '| 相冲的两支 | 名称 | 主什么事 |',
      '|---|---|---|',
      '| <b>子午、卯酉</b> | <b>四仲之冲</b> | <b>地域之冲</b> —— 换地方，但职业不变 |',
      '| <b>寅申、巳亥</b> | <b>四孟之冲</b> | <b>职业之冲</b> —— <b>居住地和职业都变</b> |',
      '| <b>辰戌、丑未</b> | <b>四季之冲</b> | <b>职业之冲</b> —— 职业变动，居住地不变 |',
      '<b>寅申属四孟</b>，所以主<b>职业与居住地都会变</b>。',
      '<b>再看"冲成没成"</b>：<b>寅与申，除了相冲，还在"寅巳申三刑"里面</b>。但课内<b>只有寅、申两位，缺了巳</b> —— <b>三刑不全，就不以三刑论，只论冲</b>。',
      '<b>这一层很要紧</b>：<b>课内只出来两个字的时候，不要急着按三刑、三合去断</b> —— <b>缺的那一位不到，局就不成立</b>。要等到<b>巳（比如流年、流月来巳）</b>，三刑才真正成立。',
      '<b>冲在断出行时怎么用？</b> <b>逢冲必动</b>。这一课问的是"父母出外什么时候回来"，<b>冲主动</b> —— 说明<b>人正在动的状态里</b>。但<b>地分戌土逢日空，空主"还没有着落"</b>，所以<b>不是当天就回</b>，要等到戌被填实或被冲开的时候。',
      '<b>所以看"冲"，要连着看三件事</b>：',
      '<b>是哪一类冲</b> —— 四孟（寅申巳亥）主职业与居住地俱变；四仲（子午卯酉）主地域之变；四季（辰戌丑未）主职业之变。',
      '<b>冲成没成</b> —— 缺字的不算成立，只作"有冲之意"论。',
      '<b>被冲的那一位是空是实</b> —— 逢空则"动而未定"，落不到实处。',
      '<b>四、相刑</b>',
      '<b>4.1 三刑总表</b>',
      '| 刑 | 名称 | 构成 |',
      '|---|---|---|',
      '| <b>子卯相刑</b> | <b>无理之刑</b> | 子刑卯，卯刑子，旺刑弱 |',
      '| <b>寅巳申三刑</b> | <b>无恩之刑</b> | 寅刑巳，巳刑申，申刑寅，旺刑衰 |',
      '| <b>丑戌未三刑</b> | <b>恃势之刑</b> | 丑刑未，未刑戌，戌刑丑 |',
      '| <b>自刑</b> | — | <b>辰辰、亥亥为自刑；午刑午、酉刑酉</b> |',
      '<b>4.2 逐刑详解</b>',
      '<b>子卯相刑（无理之刑）</b>',
      '「子刑卯，卯刑子，<b>旺刑弱</b>。课中出现者，<b>门户不正，尊卑不合，六亲反睦，手足无情，斗讼官司</b>；<b>占婚则被异性纠缠、未婚同居</b>；占孕损胎、夫妻纠纷。」',
      '<b>寅巳申三刑（无恩之刑）</b>',
      '「寅刑巳，巳刑申，申刑寅，<b>旺刑衰，知恩不报，反目为仇，恩将仇报</b>。断婚姻常指<b>婚姻无感情，血光之灾，六亲无靠，灾祸伤残</b>。」',
      '<b>丑戌未三刑（恃势之刑）</b>',
      '「丑刑未，未刑戌，戌刑丑。<b>上级压榨下级，仗势欺人，勾心斗角，落井下石，相互排挤，欺诈官司，感情关系不和睦</b>。」',
      '<b>自刑</b>',
      '「<b>精神抑郁，性格怪癖。自寻烦恼，抑郁不安；意外与人争执，小事变大，无中生有。自我折磨。</b>属于自我压抑的思想问题。」',
      '<b>例</b>：「四位纯阴酉酉自刑，自我烦恼。」',
      '<b>4.3 三刑的活用</b>',
      '<b>三刑主"套住"</b> ——<b>丑戌未三刑以辰解刑</b>。',
      '<b>课例指引</b>：第十三章「课例四：断官司」里，<b>地分丑、月建戌、太岁未</b>三者凑成了<b>丑戌未三刑</b> —— 那一课断"土地纠纷"，正是三刑落地的实例。',
      '<b>注意它是"课内一位 + 四柱两位"凑成的</b> —— <b>三刑不必三位都在课内</b>，<b>课内出一位、四柱补两位，同样成立</b>。',
      '<b>五、相害</b>',
      '<b>5.1 六害总表</b>',
      '<b>子未相害，丑午相害，</b>',
      '<b>寅巳相害，卯辰相害，</b>',
      '<b>申亥相害，酉戌相害。</b>',
      '<b>歌诀</b>：',
      '<b>从来白马怕青牛，羊鼠相逢一旦休，</b>',
      '<b>蛇虎相见如刀绞，龙兔配之泪交流，</b>',
      '<b>金鸡从来怕玉犬，猪见猿猴不到头。</b>',
      '<b>5.2 害的性质</b>',
      '<b>害既是伤害、损害之意。</b>',
      '<b>害，是一种心灵折磨，时期不定，一种不知觉的损伤，体现力不强但受伤重，遭人陷害，采用不明手段加害，小人作乱等意。</b>',
      '<b>六害——暗中下手的小人。</b>',
      '<b>课例指引</b>：同样在第十三章「课例四：断官司」里，<b>贵神午火与地分丑土</b>构成<b>丑午相害</b> —— 那一课的断语里"合同有毛病、对方毁约"，害就是其中的一层。',
      '<b>记住这一点</b>：<b>害是"暗损"</b> —— 不像冲那样明着来，而是<b>底下不和、互相掣肘</b>。',
      '<b>六、相破</b>',
      '<b>6.1 相破总论</b>',
      '<b>相破总论——相生被"泄破"，也可叫相泄。</b>',
      '<b>相破的实质是"盗气"</b> ——<b>一方把另一方的气泄掉了</b>。',
      '<b>6.2 逐组详解</b>',
      '<b>子破酉</b>',
      '「以子水盗酉金气，<b>阳水盗阴金，故酉金休破无力，多作少成</b>。<b>子酉生破常指外情桃花，隐私偷情不长久。</b>」',
      '<b>午破卯</b>',
      '「因卯木生阳火，<b>火泄木气</b>，卯为阴木小木，生阳午火，<b>卯午主反复，卯午桃花，断断续续。终卯力不支而破败。</b>」',
      '<b>卯午相破——反复无善终、工作转移，须看两面性</b>',
      '<b>卯午相破与卯午相生——断断续续、反反复复而情未绝</b>',
      '<b>丑破辰</b>',
      '「<b>墙墓倒塌，关系破败，混沌不安，没有头绪。</b>」',
      '<b>申破巳</b>',
      '「因申阳金，被阴火炼成，<b>损巳火之力</b>。」',
      '<b>戌破未</b>',
      '「因未为木库，生戌火库，<b>木被火自烧，火无柴不燃，所以火库破木库</b>。」',
      '<b>亥破寅</b>',
      '「亥水阴水小水，生阳木大木，<b>终力不能及而毁其身，关系破败</b>。」',
      '<b>寅破巳</b>',
      '「寅为大阳木生巳之阴小火，<b>好心做坏事，不生反害其巳火，木多火死终破</b>。」',
      '<b>6.3 破即冲：岁破、月破、日破</b>',
      '<b>金口诀的岁破、月破、日破（破既是地支相冲，比如太岁为寅，课内见申为岁破），也是很关键的成败因素。</b>',
      '<b>课内的任何干支与岁月相破，则代表求事反复，求事难成。</b>',
      '<b>具体分位</b>：',
      '<b>贵神逢破</b>——指<b>工作受阻</b>',
      '<b>将神逢破</b>——<b>财运反复</b>',
      '<b>地分逢破</b>——<b>孩童不吉，家有搬迁</b>',
      '<b>对于用神破</b>——代表<b>针对性事情的难易度</b>',
      '<b>月破最重要</b>：',
      '<b>特别是月破主求事难成，近期不易操作。</b>',
      '<b>月不单指一个月的时间，它代表一种时令、一种权利，有时比太岁的作用还要大，直接影响到事情成败吉凶。</b>',
      '<b>比如课内寅午戌火局成，但逢子月，这是破局，代表合作遭败，或者近期难以合作。</b>',
      '<b>日破常指当日或近期。</b>',
      '<b>岁破、月破、日破的取舍</b>：',
      '<b>为什么月破比岁破更直接？</b>',
      '<b>太岁像中央机关，月建像地方机构。</b> 中央虽然地位最高，但离得远、管得宽；<b>月建是直接管着你这一段日子的</b>。',
      '<b>所以当月的事，月破的影响最直接</b>——就像你要办事，直接管你的是本地部门，不是中央。',
      '<b>七、相绝</b>',
      '<b>7.1 四绝总表</b>',
      '<b>寅酉金绝在文道，卯申木绝车马财，</b>',
      '<b>午亥水绝因口舌，子巳火绝妇女男。</b>',
      '<b>7.2 逐组详解</b>',
      '<b>寅酉金绝（金绝在文道）</b>',
      '「寅木见酉金为金绝，主<b>文书、道路有伤灾</b>，因<b>小金不能克大木，阴金难胜阳木，金木各有其伤损，主事难成，劳而无功</b>。常指<b>计划更改，半路返回，有损无益</b>。」',
      '<b>卯申木绝（木绝车马财）</b>',
      '「卯申木绝，主<b>道路财帛、车伤</b>，因卯为车为财，金为道路，在道途中，<b>卯被申金重克，常出现车祸伤人</b>，如果金旺会出现严重伤灾，破财伤人。」',
      '<b>午亥水绝（水绝因口舌）</b>',
      '「主<b>口舌取索、文字斗讼事</b>，因亥为阴水小水，午为阳火，<b>反其道而行之，火把水绝掉了</b>。通俗叫"<b>打嘴仗</b>"，<b>没有实际的伤害</b>，常指<b>口舌是非、男女吵架</b>。」',
      '<b>子巳火绝（火绝妇女男）</b>',
      '「主<b>男女之事断绝，婚姻有变，情人有离</b>，事都由男女而起，是因子水阳水盛大，而把阴火巳火灭掉了。<b>这个绝有毁灭性，指断绝来往关系破裂，真正的伤害</b>，还指<b>女子受侵害、女子丢失财务、人身受到伤害</b>。」',
      '<b>7.3 相绝的来历</b>',
      '<b>相绝的来历——出自十二长生，金口诀集各家之大成。</b>',
      '<b>"绝"在十二长生中是一个阶段</b>，金口诀把十二长生的概念引入，形成了四绝。',
      '<b>7.4 绝的破坏力</b>',
      '<b>相绝总原则——绝的破坏力大于刑冲克害。</b>',
      '<b>这个排序很重要</b>：',
      '<b>绝 ＞ 刑 ＞ 冲 ＞ 克 ＞ 害</b>',
      '<b>其中</b>：',
      '<b>绝</b>——<b>破坏力最大，往往主事情彻底断绝</b>',
      '<b>刑</b>——<b>持久伤害，无法挣脱</b>',
      '<b>冲</b>——<b>短暂有力，破坏力强</b>',
      '<b>克</b>——<b>范围广，时期不定</b>',
      '<b>害</b>——<b>体现力不强但受伤重</b>（心灵折磨）',
      '<b>7.2 课式实证：一个课里的"绝"与"合"</b>',
      '<b>"绝"不是孤立的</b> —— 它常常和"合"一起出现。看这个课：',
      '<code>`</code>',
      '人元：丙　　火 + 旺　天德合',
      '贵神：乙卯（六合）用　木 - 休　月德合',
      '将神：庚申（传送）　金 + 死　月德、驿马',
      '地分：辰　　土 + 相　天医',
      '<code>`</code>',
      '<b>先定旺衰</b>：四位是<b>火、木、金、土</b>，各一位。<b>克的关系</b>有火克金、金克木、木克土 —— 这样一路看下来，<b>只有火不受克</b>（课内无水）。所以<b>火旺</b>。火旺则<b>土相</b>（火生土）、<b>木休</b>（生火者）、<b>金死</b>（火克金）。',
      '<b>再看关系，这个课里有两层，方向正好相反。</b>',
      '<b>第一层：卯申相绝。</b>',
      '贵神是<b>乙卯木</b>，将神是<b>庚申金</b> —— <b>卯申为绝</b>（木绝于申）。<b>二神相绝</b>，主<b>这两方之间已经到了绝地</b>：断了、到头了、再没有转圜的余地。',
      '<b>第二层：乙庚相合。</b>',
      '但这两位地支虽然相绝，<b>天干</b>却是<b>乙和庚</b> —— <b>乙庚相合</b>，而且<b>乙庚合化金</b>。',
      '<b>"绝"和"合"同时出现，怎么看？</b>',
      '<b>地支是实质</b> —— 卯申绝，说明<b>实质上已经断了</b>。',
      '<b>天干是表面</b> —— 乙庚合，说明<b>表面上还连着</b>。',
      '<b>所以断事就一句话</b>：',
      '<b>这段关系已经名存实亡。</b> 外面还有一层"合"的皮拉着，所以<b>还没有正式分开</b>；但<b>里子已经绝了</b>，撑不了多久。',
      '<b>再看"合化"的归向</b>：乙庚合<b>化金</b>，化出来的金<b>对申金有利</b>。所以这个"合"，<b>主动权在申金那一边</b> —— <b>是对方在维系这层关系，不是自己</b>。',
      '<b>应期从这里就出来了</b>：既然唯一维系着的是<b>乙庚合</b>，那么——',
      '<b>到辛金出现，把乙木冲开</b> —— 合的关系就散了；',
      '<b>或者到申月、申年</b> —— 金太旺，那层"合"的皮也就拉不住了。',
      '<b>这就是"绝"与"合"并见的断法</b>：',
      '<b>先看地支（实质），再看天干（表面）。地支绝了就是真断了；天干还合，只是暂时没撕破脸。</b>',
      '<b>八、刑冲克害破绝的区别</b>',
      '<b>这是断课必须分清的一组概念</b>：',
      '| 关系 | 性质 | 力度 | 时间 |',
      '|---|---|---|---|',
      '| <b>冲</b> | 逢冲必动，冲则散则离 | <b>力量大于克</b>，短暂有力、破坏力强 | 快 |',
      '| <b>克</b> | <b>广义词</b>，代表范围广，受损、被约束、克制 | 时期不定 | 不定 |',
      '| <b>害</b> | <b>心灵折磨</b>，不知觉的损伤 | <b>体现力不强但受伤重</b>，遭人陷害、小人作乱 | 时期不定 |',
      '| <b>刑</b> | <b>持久伤害，无法挣脱</b> | 受约束力表现强 | 长 |',
      '| <b>破</b> | 相生被泄破（盗气） | 多作少成 | — |',
      '| <b>绝</b> | <b>破坏力大于刑冲克害</b> | 最强 | — |',
      '<b>关于"刑"的解释最精辟</b>：',
      '<b>刑的力量是一种持久伤害，无法挣脱，就像一个人犯法遭刑，你没有能力摆脱，受约束力表现强。股票被套也属于刑的一种，不以人的意志为转移的一种被动力量。刑有相互套牢扯拉之意，精神折磨不可挣脱，离婚见刑受折磨，见官司。</b>',
      '<b>8.1 先取最重者</b>',
      '<b>遇到多种关系并存时怎么办？</b>',
      '<b>断课心法——复杂关系取"最突出的那一点"。</b>',
      '<b>也就是先看绝，再看刑，再看冲、克、害。</b> 因为<b>信息像一个不规则转动体，要抓取最突出的那一点</b>。',
      '<b>8.2 刑冲也是"动"</b>',
      '<b>刑冲也是"动"——逢刑必动、逢冲必动。</b>',
      '<b>所以断"变动"时，刑冲都可以用</b>。',
      '---',
      '<b style="color:var(--c-gold)">第八节　墓库与空亡</b>',
      '<b>一、墓库</b>',
      '<b>1.1 神煞之"墓"与十二长生之"墓"不是一回事</b>',
      '<b>这一点必须分清</b>：',
      '| | <b>神煞的"墓"</b> | <b>十二长生的"墓"</b> |',
      '|---|---|---|',
      '| <b>起法</b> | 按季节：<b>春见未、夏见戌、秋见丑、冬见辰</b> | 按各行的长生十二宫推算 |',
      '| <b>性质</b> | 时令神煞 | 五行状态 |',
      '| <b>用法</b> | 主争讼坟墓之事，问病凶 | 主人墓、出墓 |',
      '<b>两者不能混为一谈。</b>',
      '<b>1.2 十二长生墓库</b>',
      '<b>各行的墓</b>：',
      '<b>木的长生在亥，墓在未土；火的长生在寅，墓在戌土；金的长生在巳，墓在丑；水的长生在申，墓在辰。</b>',
      '<b>具体到地支</b>：',
      '<b>寅的墓在未，申的墓在丑，巳的墓在戌，亥的墓在辰。</b>',
      '<b>1.3 入墓的条件</b>',
      '<b>寅申巳亥见墓则入，子午卯酉见墓不入，可以与墓成拱局，也就是半三合局。但是子午卯酉在死的状态下可以入墓。</b>',
      '<b>所以</b>：',
      '<b>只有寅、申、巳、亥才能入墓</b>——<b>「只有寅申巳亥才能入墓——寅墓未、申墓丑、巳墓戌、亥墓辰」</b>',
      '<b>子午卯酉不入墓</b>，但可以与墓成<b>拱局</b>（半三合局）',
      '<b>例外</b>：<b>子午卯酉在"死"的状态下可以入墓</b>',
      '<b>1.4 土也有墓</b>',
      '<b>土也有墓——辰为土墓，丑戌未见辰为入墓；四土齐见则谁也不入墓。</b>',
      '<b>具体规则</b>：',
      '<b>辰为水墓，也为土墓</b>',
      '<b>丑入辰墓，未也入辰墓</b>',
      '<b>但当丑未辰都出现时，丑未因冲的关系不入辰墓</b>',
      '<b>辰戌相见时论冲，不论戌入辰墓</b>',
      '<b>1.5 出墓与应期</b>',
      '<b>出墓——墓不冲不开、不刑不开。</b>',
      '<b>比如寅木逢未入墓，再见丑为冲开墓，寅木得生……课内同时见未丑则寅不入墓。</b>',
      '<b>应期</b>：<b>取冲墓之支</b>。',
      '<b>有一种特殊的墓</b>：',
      '<b>卯见戌化火自焚为墓，子见丑合化为土为之墓，酉见未金绝。</b>',
      '<b>这些"墓"的形态不同于十二长生的墓，要看具体情况。</b>',
      '<b>1.6 午火为什么死于戌土</b>',
      '<b>午火为什么死于戌土——《五行大义》中的"母子不同葬"。</b>',
      '<b>因为戌为火库</b>——火生土，火死了就归到土里。<b>"母子不同葬"的意思是火与土不葬在一处</b>，所以午火到戌土就是"死"。',
      '<b>1.7 断病与墓库</b>',
      '<b>四墓入课，主争讼坟墓之事，问病凶</b>',
      '<b>"寅见未有寡妇"</b>——<b>特别甲寅临未为寡妇，这个诀窍很灵验的</b>',
      '<b>"太常临寅号的奇"</b>——这句歌诀很难解释，可能也是与墓库有关',
      '<b>1.8 命理墓库的实用断法</b>',
      '<b>入库主人昏庸</b>，占病则有<b>瘫患在床</b>之意',
      '<b>甲木见未为墓，乙木见戌为墓</b>',
      '<b>二、空亡</b>',
      '<b>空亡分两种</b> —— <b>旬中空亡</b>与<b>四大空亡</b>：',
      '| | <b>旬中空亡</b> | <b>四大空亡</b> |',
      '|---|---|---|',
      '| <b>定义</b> | 甲子旬戌亥空之类 | 甲子、甲午旬<b>水</b>空；甲寅、甲申旬<b>金</b>空 |',
      '| <b>论法</b> | <b>只论地支不论天干</b> | <b>天干地支同论</b> |',
      '| <b>原理</b> | 十天干配十二地支，必有两个支落空 | 六十甲子纳音中，甲子、甲午旬无水；甲寅、甲申旬无金 |',
      '| <b>时间性</b> | <b>旬为月内，时间短</b> | <b>四隐喻为四季，时间长</b> |',
      '| <b>效应</b> | <b>短的应力明显，力促而短暂</b> | <b>长的应力不一而久远</b> |',
      '<b>落点上有一条铁律</b>：<b>只有时辰能空、能填空，日、月、岁都不空</b> —— <b>道理一句话就说透了：远水解不了近渴。</b>',
      '<b>这两样怎么查、怎么填实、吉凶怎么断、应期怎么取、市面上哪些说法靠不住</b> —— <b>第二章第六节整节讲这件事。</b>',
      '<b style="color:var(--c-gold)">第九节　应期与断课心法</b>',
      '<b>一、应期的原理</b>',
      '<b>克生变，合为数，逢合时，事物才会有一个定数……合则定，定中有数。</b>',
      '<b>这个原理很形象</b>：',
      '<b>就像我们玩的转盘游戏，转盘在不停转动时，你不知道指针最终会停在那个方位，只要等转盘停下来才能知道你想要的结果是什么，也就是我们所说的逢合。</b>',
      '<b>生是有规律的</b>——所以按<b>三合、六合、五合</b>取应期',
      '<b>克则无规律可言</b>——所以<b>克的时候难判断应期</b>',
      '<b>"绝"的应期</b>：<b>绝则需要找到矛盾的因素点，让克变合</b>。',
      '<b>二、取应期的次序</b>',
      '<b>断应期的第一步就是先按三汇、三合、三奇来断。如果没有三合三奇，一个篱笆三个桩、一个好汉三个帮，充分说明了三的成功性和稳定性。如果这些都没有，再按四孟四仲来断，再接下来是五合六合、空亡、关隔索、临年月日时断应期的方法。还比如贵神临日不出日，临月不出月，临时不出时辰，再就是四季断法，四土缺一，缺者为应期。</b>',
      '<b>完整次序</b>：',
      '<code>`</code>',
      '① 三会 / 三合 / 三奇',
      '② 四孟四仲（缺者为应期）',
      '③ 五合 / 六合',
      '④ 空亡填实',
      '⑤ 关隔索',
      '⑥ 临年月日时（贵神临日不出日，临月不出月，临时不出时辰）',
      '⑦ 四季断法（四土缺一，缺者为应期）',
      '<code>`</code>',
      '<b>注意</b>：<b>先判格局</b>——<b>如果是分局相克，断成的应期意义就不大了</b>，因为"心没有往一处使，强扭的瓜不甜"。',
      '<b>三、具体取法</b>',
      '<b>3.1 三合虚一待用</b>',
      '<b>三合是比较稳定的一种组合，因为稳定所以三合断应期是最有准确性的。</b>',
      '比如课内出现<b>寅、戌，则以午虚一待用为应期</b>。',
      '<b>3.2 四仲缺一</b>',
      '<b>比如课内出现子午卯缺酉，我们就依酉断应期。</b>',
      '<b>子午卯酉为四仲，他们是一个整体，等他们聚会全了则平衡不惊。比如打麻将三缺一，等第四个人就是应期。</b>',
      '<b>四仲代表的人物</b>：<b>子午卯酉</b>主<b>桃花、四处游走、失物难寻</b>。',
      '<b>四季、四孟、四仲所代表的人物</b>（性别与年龄）：',
      '<b>四孟</b>（寅申巳亥）——<b>老翁父</b>一类',
      '<b>四仲</b>（子午卯酉）——<b>少阴少阳</b>一类',
      '<b>四季</b>（辰戌丑未）——<b>中阳、老阴</b>一类',
      '<b>3.3 三会</b>',
      '<b>比如亥子丑会水局，这是一种属性，特定的性质，我们就遵照这种性质也寻找应期的突破口，把不规律的东西按人为思维的规律性寻找应期。</b>',
      '<b>3.4 连茹</b>',
      '<b>还有连茹法……象上个课例的，申戌亥连茹缺酉，我们就以酉找应期。</b>',
      '<b>3.5 三奇</b>',
      '<b>再比如乙丙丁三奇，这是没有规律的组合，是人为因素的定为三奇，所以我们就以其中的这种规定性因素断应期。</b>',
      '<b>三种三奇力度不同</b>——<b>乙丙丁效果最佳</b>。',
      '<b>3.6 解刑为应期</b>',
      '<b>寅巳申三刑就以亥解刑为应期。</b>',
      '<b>比如丑戌未三刑，就需要辰来解刑。</b>',
      '<b>原理</b>：<b>三刑主"套住"，需要解开。</b>',
      '<b>3.7 天地合德应期</b>',
      '<b>既是天干地支的合为应期。比如癸酉，以戊辰为应期；甲寅以己亥为应期。</b>',
      '<b>3.8 将干近合</b>',
      '<b>既是只取天干的五合。不必取天干地支的全合，如甲寅，只取己年月日时为应期。</b>',
      '<b>3.9 六合为应期</b>',
      '<b>既是课内地支的六合。如见丑，子就是它的应期。见寅，亥就是它的应期。</b>',
      '<b>3.10 破的应期</b>',
      '<b>月破</b>：<b>目下虽破，出月不破；今日之破，填实之日不为破，逢合之日不为破</b>',
      '<b>近应日时，远应年月</b>',
      '<b>四、断课心法</b>',
      '<b>4.1 信息像一个不规则转动体</b>',
      '<b>信息像一个不规则转动体——抓取最突出的那一点。</b>',
      '<b>这是断课的总心法</b>：面对复杂的课体，<b>不要面面俱到，先抓最突出的那一点</b>。',
      '<b>具体做法</b>：',
      '<b>断课心法：复杂关系，取"最突出的那一点"。</b>',
      '<b>怎么找"最突出的那一点"？按关系的轻重来定</b>：',
      '<b>有冲先以冲为主</b> —— <b>冲的力量比克大得多</b>；<b>见相绝、相破这类更重的定义，就以绝、破为主</b>。',
      '<b>关键是不把各种关系混在一起同时分析</b> —— <b>先抓住最重的那一条，其余的作为辅助</b>。',
      '<b>4.2 五行特性总纲</b>',
      '<b>五行特性总纲——把方向性直接用作断课依据。</b>',
      '<b>五行的"方向性"本身就是断课依据</b> ——<b>向上、向下、向内、向外，直接决定受克的轻重</b>。',
      '<b>例如</b>：',
      '<b>火向上</b> → 金在火上伤重，金在火下伤轻',
      '<b>水向下</b> → 水在木下生木"不情愿"',
      '<b>木向上</b> → 木在土下克土重，木在土上克土轻',
      '<b>金沉重向下</b> → 金在木上克木重，下肢受伤重',
      '<b>4.3 人不动神动</b>',
      '<b>人不动神动——起课的最高境界是"心动之处为地分"。</b>',
      '<b>"学会金口诀，来人不用说"是针对预测师而言。</b>',
      '<b>意思</b>：<b>功夫到了，不用对方开口，凭当时的心动和外应就能起课断事</b>。',
      '<b>4.4 类象随时代延伸而性格不变</b>',
      '<b>十二地支学习方法——重基础、找特性、可直读；类象随时代延伸而性格不变。</b>',
      '<b>这是本课的落脚点</b>：<b>十二地支的类象可以不断延伸（网络、微博、软件、银行），但它的"性格"（五行本性）永远不变。</b>',
      '---',
      '<b style="color:var(--c-gold)">本章小结</b>',
      '<b>一、预测的原理</b>',
      '<b>模拟</b>——课式是"天地人的模拟系统"，模拟天体运行、人体结构，达到<b>天地人合一、人与事合一</b>。因为<b>模拟性强，所以能断万事万物</b>，课体可大可小、灵活变化。',
      '<b>全息</b>——<b>课内的任何信息都是你自身的信息</b>，哪个地支出问题就代表哪里出了问题。',
      '<b>公式学</b>——<b>金口诀是"公式学的计算 + 五行感知"的结合</b>。推演有定规，取象靠功底。',
      '<b>与"命"无关</b>——它问的是<b>此刻这件事的状态</b>，不是一生的格局。',
      '<b>基础有两类</b>——<b>理论基础</b>（干支生克）+ <b>行动基础</b>（实际断课）。<b>最大的障碍是"不敢断"。</b>',
      '<b>二、阴阳</b>',
      '阴阳是<b>一分为二</b>，成对出现、相互依存、不断转化。',
      '<b>阳极生阴，阴极生阳</b>——极端格局按"物极必反"断。',
      '<b>阳干配阳支、阴干配阴支</b>，六十甲子由此而成。',
      '<b>三、五行总论</b>',
      '<b>相生</b>：木生火，火生土，土生金，金生水，水生木。',
      '<b>相克</b>：木克土，土克水，水克火，火克金，金克木。',
      '<b>万物生于土、死于土</b>。',
      '<b>相克受"量"的制约</b>——一木只能克一土，水多则木漂。但<b>相克是天性</b>，力量不足不等于不克。',
      '<b>生的未必好、克的未必坏</b>——<b>过旺而不及，物极必反</b>。',
      '<b>课内旺而无制不是好事；用神旺不等于结果好。</b>',
      '<b>相生无克时，旺衰意义不大。</b>',
      '<b>金口诀"以克找问题"</b>——<b>重克不重生</b>。',
      '<b>五行五常</b>：木仁、金义、火礼、水智、土信。',
      '<b>四、五行逐行详解（取象总纲）</b>',
      '<b>木</b>：曲直、向上。木旺发浓须密、性直讲信义、一根筋；<b>木不琢不成器</b>；甲寅大木、乙卯小木；<b>丁卯带刺、癸卯狡猾、乙卯洁癖嫉妒、辛卯司机自伤</b>。',
      '<b>火</b>：炎上、外实内虚。<b>火在上的伤金重</b>；火旺主烧伤烫伤；<b>午火伤身、巳火伤心</b>；<b>午火反复、巳火嫉妒</b>；<b>庚午改门接屋、壬午反复最强</b>。',
      '<b>土</b>：稼穑、厚德载物。<b>土分阴阳——丑未包容、辰戌好斗</b>；<b>辰戌丑未相冲主快，非冲才主迟缓</b>；课中土多求事拖延、婚姻晚。',
      '<b>金</b>：从革、肃杀。<b>金性沉重，在木上克木重</b>；<b>金最怕火，宜泄不宜克</b>；<b>申为移动之神、白虎凶神；酉为桃花第一神</b>。',
      '<b>水</b>：润下、适应。<b>随物就形、一切行动听指挥</b>；<b>子水军人象、亥水会计象</b>；<b>水旺主阴私、易从事盗窃间谍</b>；<b>水过旺反喜土制</b>。',
      '<b>五行空亡</b>：<b>水空则流、火空则发、木空则损、土空则陷、金空则响</b>。',
      '<b>五、天干</b>',
      '<b>天干是象，地支是形</b>；<b>天干与地支不能直接作用</b>。',
      '<b>十干象意</b>：<b>甲贵、乙曲、丙乱、丁惊、戊讼、己难、庚变、辛苦、壬暗、癸愁</b>。',
      '<b>天干五合</b>：甲己化土（中正）、乙庚化金（仁义）、丙辛化水（威制）、丁壬化木（淫欲）、戊癸化火（无情）。<b>合有先后，化有月令条件。</b>',
      '<b>合化能补出课内没有的五行</b>。',
      '<b>天干相克</b>：<b>相合者不论克</b>（甲不克己、乙不克庚……）；<b>但壬不一定不克丁</b>。',
      '<b>读干支组合</b>：先看生克泄比，<b>同一组合位置不同则状态不同</b>。',
      '<b>六、地支类象</b>',
      '<b>十二地支各有丰富类象</b>，且<b>类象随时代延伸，但本性不变</b>。',
      '<b>十二地支可按人生历程贯穿</b>：子（交替）→丑（出生）→寅（成长）→卯（成婚）→辰（劳作）→巳（怀孕）→午（生产）→未（喂养）→申（出征）→酉（待嫁）→戌（成人）→亥（繁衍）。',
      '<b>学习方法是"抓本性、延伸新类象"，不必死记。</b>',
      '<b>七、地支之间的关系</b>',
      '<b>六合</b>：子丑（先密后疏）、寅亥（生破陌路）、卯戌（自焚难躲）、辰酉（私情贪淫）、巳申（面合心鬼）、午未（占婚必争）。<b>生合吉祥，克合勉强。</b>',
      '<b>三合</b>：寅午戌火局、亥卯未木局、申子辰水局、巳酉丑金局。<b>人元见丙/乙/壬/丁为局全</b>。',
      '<b>三会与三合不同</b>——三会如邻居（力量大但不持久），三合如亲戚（长久性高）。',
      '<b>相冲</b>：六组各有断语，<b>逢冲必动，冲则散则离</b>。',
      '<b>相刑</b>：子卯（无理之刑）、寅巳申（无恩之刑）、丑戌未（恃势之刑）、自刑。',
      '<b>相害</b>：六害，<b>暗中下手的小人</b>。',
      '<b>相破</b>：相生被"泄破"，<b>破即冲</b>（岁破、月破、日破）。',
      '<b>相绝</b>：寅酉金绝、卯申木绝、午亥水绝、子巳火绝。<b>绝的破坏力大于刑冲克害。</b>',
      '<b>五种关系的力度</b>：<b>绝 ＞ 刑 ＞ 冲 ＞ 克 ＞ 害</b>。',
      '<b>刑冲也是"动"</b>——逢刑必动、逢冲必动。',
      '<b>八、墓库与空亡</b>',
      '<b>神煞的"墓"与十二长生的"墓"不是一回事。</b>',
      '<b>只有寅申巳亥才能入墓</b>；子午卯酉不入墓，但可成拱局（在"死"的状态下可入墓）。',
      '<b>土也有墓</b>——辰为土墓；丑未辰齐见则谁也不入墓；辰戌论冲不论墓。',
      '<b>墓不冲不开、不刑不开</b>——出墓取冲墓之支。',
      '<b>两种空亡</b>：旬中空亡（只论地支、时间短、效应明显）；四大空亡（干支同论、时间长、力弱）。',
      '<b>只有时辰能空、能填空</b>——日月岁都不空。',
      '<b>两个比喻</b>：旬空如"手头一时短缺"；四大空亡如"真穷"。',
      '<b>九、应期与心法</b>',
      '<b>原理</b>：<b>克生变，合为数，合则定，定中有数。</b>',
      '<b>取应期次序</b>：三会三合三奇 → 四孟四仲 → 五合六合 → 空亡填实 → 关隔索 → 临年月日时 → 四季缺一。',
      '<b>三合虚一待用</b>、<b>四仲缺一</b>、<b>三会</b>、<b>连茹</b>、<b>三奇</b>、<b>解刑</b>、<b>天地合德</b>、<b>将干近合</b>、<b>六合</b>，都是取应期的具体方法。',
      '<b>信息像一个不规则转动体——抓取最突出的那一点。</b>',
      '<b>五行特性总纲——把方向性直接用作断课依据。</b>',
      '<b>人不动神动</b>——起课的最高境界是"心动之处为地分"。',
      '---',
      '<b style="color:var(--c-gold)">心法</b>',
      '<b>学易先学做人</b>',
      '这门学问源于生活、服务生活，是需要动脑动嘴的技术。<b>口德尤其关键</b>——该说的说，不该说的留三分，涉及他人隐私更要谨慎。',
      '技术再高，到处炫技、口无遮拦、骄傲逞强，也难有真正的市场。',
      '<b>学易也是学理</b>',
      '不懂其道，何来其理？<b>自己没把道理弄通，怎么给别人说理。</b>',
      '<b>所以这门学问不能死记硬背</b>，要灵活变通才能运用自如。',
      '<b>道就是生活</b>——五行的义理来源于生活。你理解了生活，就理解了五行。',
      '<b>基础不牢，走不远</b>',
      '基础的东西看着枯燥，翻来覆去就那么几句。可到了断课的时候，往往<b>一个细节就决定成败</b>。',
      '平时觉得用不上的东西，关键时刻也许恰恰用得上——所谓「<b>用时方恨少</b>」。<b>真正听懂十句话，比草草看过一车书更有收获。</b>',
      '所以遇到"瓶颈"的时候，不妨回头看看自己的基础，<b>多半问题就出在那里</b>。',
      '<b>最大的障碍是"不敢断"</b>',
      '<b>学三天就能断课</b>——因为只要学会五动三动，再熟悉五行相克，就能说出几句。',
      '<b>但不敢断，就永远学不会。</b> 因为取象的功夫是在一次次实际断课中练出来的，不是读书读出来的。',
      '<b>善易者不卜</b>',
      '<b>「善易者不卜」——百姓日用而不知。</b>',
      '<b>最高的境界，是连"卜"这个动作都不需要了</b>——因为你已经理解了事物的规律，看什么都能明白。',
      '<b>人不动神动</b>——心动之处，即是地分。',
      '<b>大道至简</b>',
      '<b>掌握的是事物原理，坚持的是大道至简。</b> 大的道理变成简易，其实就是还原于生活。',
      '不必追求花哨的技法。<b>最普通的就是最高级的。</b>',
    ]},
    { t: '第二章　天干与起课法', rows: [
      '<b style="color:var(--c-gold)">引言</b>',
      '第一章讲了阴阳五行和干支的取象。<b>这一章讲两件事</b>：',
      '<b>天干</b>——它在课中代表什么，怎么用',
      '<b>起课</b>——怎么把四柱变成四行课式',
      '<b>为什么把这两件事放在一章？</b> 因为它们的关系最紧密：<b>起课的最后两步（起人元、起神干）用的就是天干</b>，而天干在课中的位置（人元）又是整个课的"首领"。',
      '<b>这一章还会讲几样"进阶"的东西</b>：',
      '<b>特殊起课法</b>——灵机课、隐课法、六亲课、活贵神、先起诸法',
      '<b>遁法</b>——从已有的课里"遁"出更多信息',
      '<b>空亡</b>——课里最重要的一个状态判断',
      '<b>零基础读者请注意</b>：第三节「起课法」是本章的核心，<b>必须完全掌握</b>。后面所有的断课，都建立在"课起得对"这个前提上。',
      '---',
      '<b style="color:var(--c-gold)">第一节　天干总论</b>',
      '<b>一、人元是天干</b>',
      '<b>1.1 只有人元是天干</b>',
      '金口诀的课式有四行——人元、贵神、将神、地分。',
      '<b>这四行里，只有"人元"这一行是天干，其余三行都是地支。</b>',
      '<b>为什么会这样？</b>',
      '因为金口诀的原理是<b>运用天地人的模拟系统</b>——它模拟的是一个天、地、人的结构。<b>最上边的位置为天</b>，而天干代表天体，所以就把天干放到人元这个位置，<b>作为天、作为头</b>。',
      '<b>这里有个细节</b>：<b>人元与地分，本来就是同一组干支</b>（比如地分是寅，那么寅所配的天干就是这一组的天干）。既然天干与地支不能直接发生作用，那为什么还要把这一组的天干单独拿出来，放到人元位置呢？',
      '答案就是上面那句话——<b>是为了模拟天地人，模拟人体的课式结构</b>。',
      '<b>但要记住一个前提</b>：',
      '<b>既然是地分的天干，就不能直接与二神发生作用，所以人元天干起到虚拟的作用关系。</b>',
      '<b>干支同时出现，才是体现物体的性质和状态。</b>',
      '<b>1.2 人元是课的"首领"</b>',
      '<b>金口诀的人元是天干，人元在课中是一个事物的首领，是有决定意义的所在。</b>',
      '<b>我们断课首先看人元是哪个天干，基本就能给整个课定性了。万事首为先，头领有没有能量，所涉及的事物整体也会出现不同的影响。</b>',
      '<b>人元为首为头。</b> 所以：',
      '<b>人元休死</b>——等于事情<b>开始阶段就处于不利</b>，人元休死处于消极，<b>可行性不强</b>',
      '<b>人元逢空</b>——则<b>事情还没有落到实处，还不具备操作性</b>',
      '<b>这只是初步判断</b>，至于是不是真的有利，还要进一步结合课体分析。',
      '<b>1.3 人元的性质：喊号子的</b>',
      '把"天干是象"落实到人元上，可以说得更准确：',
      '<b>人元是天干，不具备直接实施的功能</b>，它与地支的作用反映的是一种象而不是真实作用，<b>是号召性、文件性、号令性的身份，具有权威性</b>。',
      '这份权威是靠人去实施，<b>它本身没有实际性</b>。在断应期有<b>虚一待用</b>的功能，<b>起纽带作用、连接作用</b>。',
      '它的属性就是<b>方向性、权威性，喊号子的</b>。是一种<b>形式体</b>。',
      '<b>这段话解释了人元的全部特点</b>：',
      '| 特点 | 含义 |',
      '|---|---|',
      '| <b>号召性、号令性</b> | 它下达方向，但不亲自执行 |',
      '| <b>权威性</b> | 它是最高层，有决定意义 |',
      '| <b>没有实际性</b> | 光有号令，落到实处还得靠地支 |',
      '| <b>形式体</b> | 是一种"形式"，不是实体 |',
      '| <b>虚一待用</b> | 在断应期时有它的特殊作用 |',
      '| <b>纽带、连接作用</b> | 把课内关系串联起来 |',
      '<b>理解这一点，只要记住一个比方</b>：',
      '<b>人元为干为头，头是指挥官，是发号施令的，是下达文件的，所以人元也是号令、文件性质的。那是条文，是要下面听从的——当时你可以不听，但后果不好说。</b>',
      '<b>这就解释了一个看似矛盾的现象</b>：',
      '<b>比如人元克贵神为斩官，这个是天干与地支的关系，但是天干不能直接作用贵神这个地支，天干是起间接作用的，所以就要看天干所要对应的时空——是不是要斩官，还是已经斩官的时间性。</b>',
      '<b>人元克贵神叫"斩官"</b>（工作受损），但<b>它不是立刻见效的</b>——因为文件下达需要时间，执行也需要时间。<b>所以要看这个"斩官"是"将要发生"还是"已经发生"。</b>',
      '<b>还有一个比喻</b>：',
      '天干与神干的关系——<b>"门口站岗的"</b>。',
      '意思是：<b>神干（将神、贵神的天干）虽然不是事物的主体，但它像门口站岗的一样</b>，代表那个位置的性质。<b>你克了神的干，也就有克神的意思了。</b>',
      '<b>1.4 人元是"脸面"</b>',
      '<b>人元是"脸面"——天干表象，心由象生。</b>',
      '<b>金口诀的人元为天干，天干代表是一种象意，就像一个人的形象一样，心由象生，什么样的天干在人元，就能大致体现这个课的性质。</b>',
      '<b>再看一个很形象的说明</b>：',
      '<b>天干人元就像一个人的脸。</b> 癸水代表疑虑，<b>一副愁眉不展的样子，就知道遇到难事了</b>。这就是<b>象意的直读</b>。',
      '<b>拿到一个课，先看人元是什么天干，就像初见一个人先看他的脸色。</b> 脸色不好，就知道这人心里有事；人元是壬癸水，就知道这事有阻碍。',
      '<b>二、天干是象、地支是形（详见第一章）</b>',
      '<b>十个天干讲的都是"象"，地支才是"形"</b> —— <b>天干主外、主表、主象，地支主内、主里、主实</b>；<b>凡是要落到实处的东西，最终都要看地支</b>。',
      '<b>所以金口诀重地支生克，天干只作牵线搭桥</b> —— 但<b>"不太重"不等于"不重要"</b>：<b>断一个人的状态、心性、外在表现，天干的取象往往更直接。</b>',
      '<b>这一层的完整论述和课例，第一章第五节已经讲过</b>，这里只补一条与起课直接相关的。',
      '<b>2.1 天干与地支不能直接作用</b>',
      '<b>天干与天干作用，地支与地支作用，不能相互作用。</b>',
      '<b>违反了它，断课容易失误。</b>',
      '<b>道理就是上面说的</b> —— <b>人元是"发号令"的，令发下去了，还要看下面接不接、什么时候接</b> —— <b>这就是"间接作用"的意思</b>。',
      '<b>2.2 天干与流年的作用</b>',
      '<b>天干与流年的作用，以象义为主，逢合明显。</b>',
      '<b>即</b>：<b>流年的天干与人元的天干</b>，主要看<b>象义</b>上的呼应；如果<b>逢合</b>（五合），作用就明显。',
      '<b>三、十干象意（详见第一章）</b>',
      '<b>十个天干各自的象意</b> —— 甲是种子破土、乙是柔木藤蔓、丙是太阳之火、丁是灯烛之火 …… <b>第一章已经逐干讲透了，这里不再重复。</b>',
      '<b>这一节只补一条与"起课"直接相关的</b>：',
      '<b>起人元、起神干，用的都是五子元遁；而五子元遁的起点，定在日干上。</b>',
      '<b>所以看象意之前，先要能一眼认出日干，并且能在掌上从它推出子时的天干</b> —— 这正是下一节要练的功夫。<b>五子元遁练熟了，起神干就是顺手的事。</b>',
      '<b>如果对某个天干的象意还不熟，回到第一章「十干象意」那一节再看一遍。</b>',
      '<b>四、天干与人体</b>',
      '<b>第一首，讲内脏</b>：',
      '<b>甲胆乙肝丙小肠，丁心戊胃己脾乡。</b>',
      '<b>庚是大肠辛属肺，壬系膀胱癸肾藏。</b>',
      '<b>三焦亦向壬中寄，包络同归入癸方。</b>',
      '<b>逐句解释</b>：',
      '甲对应胆，乙对应肝，丙对应小肠，丁对应心',
      '戊对应胃，己对应脾，庚是大肠，辛属肺',
      '壬系膀胱，癸藏肾',
      '<b>另外</b>：三焦寄在壬上，心包络归入癸方',
      '<b>第二首，讲身体部位</b>：',
      '<b>甲头乙项丙肩求，丁心戊肋己属腹。</b>',
      '<b>庚是脐轮辛属股，壬胫癸足一身由。</b>',
      '<b>逐句解释</b>：',
      '甲对应头，乙对应项（脖子），丙对应肩',
      '丁对应心，戊对应肋，己属腹',
      '庚是脐轮，辛属股（大腿）',
      '壬对应胫（小腿），癸对应足',
      '<b>详表</b>：',
      '| 干 | 对应人体 |',
      '|---|---|',
      '| <b>甲</b> | 头、胆 |',
      '| <b>乙</b> | 肝、项 |',
      '| <b>丙</b> | 肩、小肠 |',
      '| <b>丁</b> | 心、血液、眼面 |',
      '| <b>戊</b> | 胃、肋胁、背 |',
      '| <b>己</b> | 脾、腹 |',
      '| <b>庚</b> | 肠、脐 |',
      '| <b>辛</b> | 肺、股 |',
      '| <b>壬</b> | 膀胱、胫 |',
      '| <b>癸</b> | 肾、足、精 |',
      '<b>用法</b>：<b>天干受克时，它所对应的人体部位就会出信息。</b> 这是断病时最直接的依据。',
      '<b>4.1 天干与方位、颜色、味道</b>',
      '| 天干 | 五行 | 方位 | 颜色 | 味道 |',
      '|---|---|---|---|---|',
      '| 甲乙 | 木 | 东 | 青 | 酸 |',
      '| 丙丁 | 火 | 南 | 红 | 苦 |',
      '| 戊己 | 土 | 中 | 黄 | 甜 |',
      '| 庚辛 | 金 | 西 | 白 | 辣 |',
      '| 壬癸 | 水 | 北 | 黑 | 咸 |',
      '<b>4.2 干支相通</b>',
      '| 天干 | 通地支 |',
      '|---|---|',
      '| 甲 | 通 <b>寅</b> |',
      '| 乙 | 通 <b>卯</b> |',
      '| 丙 | 通 <b>午</b> |',
      '| 丁 | 通 <b>巳</b> |',
      '| 戊 | 通 <b>辰、戌</b> |',
      '| 己 | 通 <b>丑、未</b> |',
      '| 庚 | 通 <b>申</b> |',
      '| 辛 | 通 <b>酉</b> |',
      '| 壬 | 通 <b>子</b> |',
      '| 癸 | 通 <b>亥</b> |',
      '<b>规律</b>：<b>同阴阳才相配</b>——丙（阳火）通午（阳火），丁（阴火）通巳（阴火）；戊（阳土）通辰戌（阳土），己（阴土）通丑未（阴土）。',
      '<b>用法</b>：课中人元见甲，而课内有寅——这就叫"<b>甲通寅</b>"，可以论为<b>二木</b>。但记住那条规矩：<b>天干可以论数，不能论体</b>。',
      '---',
      '<b style="color:var(--c-gold)">第二节　天干的关系</b>',
      '<b>一、天干五合与化气</b>',
      '<b>1.1 五合总表</b>',
      '| 天干合 | 化 | 合的性质 |',
      '|---|---|---|',
      '| <b>甲己</b> | 化土 | <b>中正之合</b>——重信守义，循规蹈矩 |',
      '| <b>乙庚</b> | 化金 | <b>仁义之合</b>——重情重义，刚柔兼备 |',
      '| <b>丙辛</b> | 化水 | <b>威制之合</b>——诚心诚意（附"外情不贞"的断语） |',
      '| <b>丁壬</b> | 化木 | <b>淫欲（淫匿）之合</b>——酒色荒淫，婚姻不顺 |',
      '| <b>戊癸</b> | 化火 | <b>无情之合</b>——老少之合，多主婚姻年龄差距大 |',
      '<b>怎么记？相隔五位相合。</b>',
      '<b>合的性质分级（很重要）</b>：',
      '<b>甲己、乙庚、丙辛</b>——「<b>正合</b>」（正义之合），是真心之合',
      '<b>丁壬、戊癸</b>——「<b>权宜之合</b>」（偏合、无情之合），是权宜之计，不长久',
      '<b>"同一\'合\'，意思大不同"</b> ——这在断婚姻、断合作时非常有用。',
      '<b>1.2 合的先后</b>',
      '<b>天干的相合是有先后的，要知道是谁主动合谁。比如甲己合，是甲主动合的己，代表甲方是主动找的己合作的。</b>',
      '<b>其他六合意思一样。这就是断课的窍门。</b>',
      '<b>1.3 合化的条件（重点）</b>',
      '<b>关键</b>：天干五合，<b>不是合了就能"化"</b>。',
      '<b>"合"和"化"是两回事</b>：<b>合</b>是两个天干碰到一起了；<b>化</b>是合了之后还产生了新的五行。',
      '<b>化是有条件的，条件是月令</b>：',
      '| 天干合 | 化的月份条件 |',
      '|---|---|',
      '| 甲己化土 | <b>辰、戌、丑、未月</b> |',
      '| 乙庚化金 | <b>申、酉、丑月</b> |',
      '| 丙辛化水 | <b>亥、子、辰月</b> |',
      '| 丁壬化木 | <b>寅、卯、未月</b> |',
      '| 戊癸化火 | <b>巳、午、戌月</b> |',
      '<b>规律</b>：化的五行，必须在当月的月份里力量足够。',
      '<b>这里要特别提醒</b>：<b>很多人以为见合就能化，这是错的。</b>',
      '<b>合只是"碰到一起"，化是"产生了新五行"</b> ——就像两个人认识（合）不等于成了一家人（化），中间还差一个条件：<b>月令</b>。',
      '<b>月化与日化的力度差别</b>：<b>日时上也能化，只是力量小些。</b>',
      '<b>1.4 合而不化</b>',
      '<b>如果条件不够，就"合而不化"</b>——只是两个天干碰到一起，<b>没有产生新的五行</b>。',
      '<b>合而不化时，力量仍然存在</b>（有牵连、有情面），<b>但没有化成的新五行可用</b>。',
      '<b>合化逢空——空则不化。</b>',
      '<b>二、合化在断课中的意义</b>',
      '<b>2.1 补出课内所缺</b>',
      '<b>最大的用处是：在课内补出原本没有的五行。</b>',
      '<b>举例</b>：一个课里完全没有土。但出现甲己相合，<b>这一合就产生了土的性质</b>。',
      '<b>2.2 改变相克的结果</b>',
      '<b>如果课内原本是相克关系，但因为天干相合，力量就变了。</b>',
      '<b>举个例子</b>：假设课里出现<b>甲寅克丑土</b>——这是贵神克将神，叫「<b>贼动</b>」，损财之象。',
      '但如果这两个位置的<b>天干相合</b>呢？那就<b>虽是相克不假，却给你留了一部分情面</b>。',
      '<b>这种时候才叫「贼动内贼生、勾连诈不明」。</b>',
      '<b>注意</b>：<b>不是凡见贼动都主内贼</b>。要看天干是否相合——<b>天干相合，才说明是家内有接引</b>。',
      '<b>2.3 婚姻上的应用</b>',
      '<b>二神地支相冲克，本主感情破裂。但如果天干有合，暂时还不至于出问题</b>，会有一种「<b>似断非断</b>」的连带关系。',
      '<b>能维持多久，要看是哪一种五合</b>——甲己这样的正合，韧度就比戊癸的无情之合强得多。',
      '<b>总结</b>：',
      '<b>地支主内、是实质；天干主外、是表象。俗话说「打断骨头连着筋」，天干就是那根筋。</b>',
      '<b>2.4 三个合化实战课例</b>',
      '<b>课例一　干合辅助断例</b>',
      '<code>`</code>',
      '人元：庚        金 + 休    月德',
      '贵神：癸亥(天后) 用 水 - 旺    劫煞',
      '将神：戊午(胜光)    火 + 死    吊客',
      '地分：申        金 + 休    驿马',
      '<code>`</code>',
      '<b>二神是癸亥与戊午。亥午相绝</b>，对午火不利——这是<b>贼动</b>之象，本主损财、夫妻反目。',
      '<b>但天干是癸和戊，戊癸相合</b>！而且戊癸<b>合化火</b>——化了火，<b>反而有助于午火</b>。',
      '<b>断语</b>：<b>对方在克火的同时，还网开一面，没有赶尽杀绝。</b>',
      '<b>但还有一层</b>：戊癸属「<b>无情之合</b>」，所以这份开恩是<b>暂时的</b>。',
      '<b>课例二　干合救绝例</b>',
      '<code>`</code>',
      '人元：丙        火 + 旺    天德合',
      '贵神：乙卯(六合) 用 木 - 休    月德合',
      '将神：庚申(传送)    金 + 死    月德、驿马',
      '地分：辰        土 + 相    天医',
      '<code>`</code>',
      '<b>二神是乙卯与庚申。卯申为绝</b>（木绝于申），本来已到绝地。',
      '<b>但天干是乙和庚，乙庚相合</b>！所以<b>还有些情意没有到绝地</b>——这就是「<b>救绝</b>」。',
      '<b>更要紧的一层</b>：乙庚<b>合化金</b>。化出的金，<b>对申金有利</b>。所以这个合，<b>主动权反而在申金手里</b>。',
      '<b>断语</b>：现在是"情未断"，但趋势是"主动权在对方"。一旦走到金旺的年月，就<b>不好挽救了</b>。',
      '<b>课例三　乙庚正合，好心办坏事</b>',
      '乙庚合化金，<b>本来是"仁义之合"、好心</b>。但<b>如果课内申酉金旺</b>，这一合反而<b>助长了金的力量</b>，成了<b>帮倒忙</b>。',
      '<b>这说明</b>：<b>合化本身没有吉凶，要看它化出的五行对课内是有利还是有害。</b>',
      '<b>三、天干相克</b>',
      '<b>3.1 相克表</b>',
      '| 克者 | 被克者 | 克者 | 被克者 |',
      '|---|---|---|---|',
      '| <b>甲</b> | <b>戊</b> | <b>己</b> | <b>癸</b> |',
      '| <b>乙</b> | <b>己</b> | <b>庚</b> | <b>甲</b> |',
      '| <b>丙</b> | <b>庚</b> | <b>辛</b> | <b>乙</b> |',
      '| <b>丁</b> | <b>辛</b> | <b>壬</b> | <b>丙</b> |',
      '| <b>戊</b> | <b>壬</b> | <b>癸</b> | <b>丁</b> |',
      '<b>每个天干只克一个天干。</b>',
      '<b>3.2 关键规则：相合者不论克</b>',
      '<b>甲木不克己土，是因为甲与己合。</b>',
      '<b>但是壬水不一定不克丁火，因为两者之间没有相合的关系。要么说是水火无情。</b>',
      '<b>所以判断天干能不能克，关键在"相合者不论克"：</b>',
      '<b>甲与己合</b>——甲不克己',
      '<b>乙与庚合</b>——乙不克庚',
      '<b>丙与辛合</b>——丙不克辛',
      '<b>丁与壬合</b>——丁不克壬',
      '<b>戊与癸合</b>——戊不克癸',
      '<b>而表中"壬克丙"，但壬也可以克丁</b>——因为<b>壬与丁之间没有相合关系</b>。',
      '<b>「阴阳相合、阴阳不相克」</b>——这是五合与相克的总原则。',
      '<b>3.3 "干冲"</b>',
      '<b>"干冲"就是天干相克</b>——课例中有这样一断：',
      '<b>「庚金克贵干甲木，对方反感，也为干冲，离开之意。」</b>',
      '<b>天干相克，主外在关系上发生冲突</b>，断婚姻时有<b>对方反感、离开之意</b>。',
      '<b>四、天干借用</b>',
      '<b>4.1 戊己土通墓库（重要）</b>',
      '<b>什么情况下戊土可以相通为辰戌土，己土通丑未土？这要以旬来定的。</b>',
      '<b>在甲子、甲戌、甲申旬，戊土作戌土用，己土作未土用。</b>',
      '<b>在甲寅、甲辰、甲午旬，戊土作辰土用，己土作丑土用。</b>',
      '<b>记忆方法是以子午为分界线。子午线左边的有辰、丑土，右边有未、戌土。</b>',
      '（"旬"是六十甲子的分段，每十个为一旬，共六旬。）',
      '<b>注意</b>：<b>戊土、己土什么时候能"变"成具体的土，要以旬定</b>，不能随便变。',
      '<b>4.2 癸水当亥水看</b>',
      '<b>比如癸水我们可以当做亥水看，但不是真正的亥水。比如亥卯未合木局，癸水可以借用合局，可以用亥水做应期，而不是现在就合局，只是一种格局体现。</b>',
      '<b>实际用法</b>：若<b>人元见癸</b>，课内又出现<b>卯、未</b>，可以断此人与领导一心、与官方有合作。',
      '<b>4.3 天干可以论数，但不能论体</b>',
      '<b>"论数"</b>：课内有"寅"，人元又见"甲"，可以<b>论为二木</b>。',
      '<b>"不能论体"</b>：但这只能当<b>数量</b>看，不能当成两个实体。课内有"午"有"戌"，天干为"甲"，这叫「<b>虚合火局</b>」——只是形式上的火局，<b>不是真正的火局</b>。',
      '<b>五、干合断相貌歌</b>',
      '<b>甲己合处眼睛斜，乙庚合处定爬牙；</b>',
      '<b>丙辛会得见黄白，丁壬相貌衣来遮。</b>',
      '<b>戊癸蹇唇并口大，仔细推来定不差。</b>',
      '<b>逐句解释</b>：',
      '<b>甲己合处眼睛斜</b>——多主眼睛有点斜视',
      '<b>乙庚合处定爬牙</b>——多主牙齿不整齐',
      '<b>丙辛会得见黄白</b>——面色偏黄或偏白',
      '<b>丁壬相貌衣来遮</b>——相貌特点常被衣物遮挡',
      '<b>戊癸蹇唇并口大</b>——多主口齿不清或嘴大',
      '「<b>蹇</b>」读 jiǎn，<b>蹇唇</b>就是<b>口齿不清、说话不流利</b>。',
      '<b>使用注意</b>：「<b>甲己合在二神时最为准确</b>」。',
      '<b>六、干支组合直读</b>',
      '<b>6.1 读组合的规矩</b>',
      '<b>第一，先看是相生、相克、相泄，还是相比。</b>',
      '<b>第二，同一组干支，落在不同位置，所体现的状态就不同。</b>',
      '<b>第三，断干支组合必看旺衰。</b>',
      '<b>还有一条</b>：',
      '<b>干支类象断人心理，不是"读心术"。</b> ——它是从符号推演出来的，有依据，不是猜。',
      '<b>6.2 甲子组合</b>',
      '"甲"是阳木，"子"是阳水。水生木——<b>子水生甲木</b>，反过来就是<b>甲木泄子水</b>。',
      '<b>甲子是"两个第一的组合"</b>（天干第一位 + 地支第一位）。',
      '<b>以甲子为用的人</b>，往往<b>高傲</b>，因为它代表最高的层次。甲在人元多代表权威，甲木旺时代表喜庆。',
      '<b>但因为子水被甲木泄</b>，这个人虽然外表光鲜，<b>自身却要有相当的付出</b>，而且<b>太要面子</b>。',
      '<b>「清高自大，内里不自信」</b>——这是甲子组合的写照。',
      '<b>规律</b>：凡是天干<b>泄</b>地支、或者天干<b>克</b>地支的组合，都是<b>外表好看、内里耗损</b>。',
      '<b>6.3 癸巳组合</b>',
      '"癸"是阴水，"巳"是阴火。水克火——<b>癸水克巳火</b>，这是<b>自我相克</b>（外克内）。',
      '<b>如果它落在贵神位</b>（贵神代表工作），就代表<b>对工作的压力大</b>、不容易挣钱。',
      '<b>癸巳还有"乞索"之象</b>——因为巳火为乞索之神。',
      '<b>6.4 庚寅组合</b>',
      '<b>庚寅——自我相克、文武兼备而文凭不高</b>；<b>在将神乱花钱</b>。',
      '---',
      '<b style="color:var(--c-gold)">第三节　起课法</b>',
      '<b>这一节是本章的核心，必须完全掌握。</b>',
      '<b>一、起课总纲</b>',
      '<b>1.1 起课六步</b>',
      '<b>起课六步</b>：1.起四柱　2.起地分　3.起将神　4.起贵神　5.起人元　6.起神干',
      '<b>四位的构成与起课顺序</b>：',
      '<code>`</code>',
      '人元   ← 第 5 步起',
      '贵神   ← 第 4 步起',
      '将神   ← 第 3 步起',
      '地分   ← 第 2 步起（最先确定）',
      '<code>`</code>',
      '<b>注意</b>：<b>课式是从下往上写的</b>——最下面是地分，最上面是人元。而<b>起课的顺序是"地分 → 将神 → 贵神 → 人元"</b>，<b>从下往上推</b>。',
      '<b>1.2 入式歌诀开篇四句</b>',
      '<b>入式之法妙通玄，月将加时方上传。</b>',
      '<b>更看何神同何位，日干须用五子元。</b>',
      '<b>这四句是起课总纲</b>：',
      '<b>"月将加时方上传"</b>——讲将神怎么起',
      '<b>"日干须用五子元"</b>——讲人元、神干怎么起',
      '<b>"妙通玄"的意思</b>：',
      '<b>"妙"为神奇，不可琢磨，其意是指取地分的巧妙，从哪里开始定信息。</b>',
      '<b>地分不妙，就没有后面的玄秘，深刻指出了金口诀取地分的重要性。</b>',
      '<b>1.3 "活"字诀</b>',
      '<b>金口诀的特点是一个"活"字，有时起课错误亦能断准，起课方法更是五花八门，但家有家法，行有行规，还是要有一个起课的准则为整。</b>',
      '<b>抓取地分总纲——"活法"</b>：',
      '<b>地分怎么取，本身就是一门功夫</b>。<b>预测师水平越高，抓取地分准确度越高。</b>',
      '<b>二、起四柱</b>',
      '<b>2.1 确定时间</b>',
      '<b>先确定年、月、日、时，把问课的时间转换成干支。</b>',
      '例如：2015 年 10 月 6 日 22 时 30 分',
      '乙未年　乙酉月　乙卯日　丁亥时',
      '<b>建议</b>：手边有本万年历，或者用电子年历、手机年历，随时查阅准确的年月日时。',
      '<b>2.2 年的确定</b>',
      '<b>年（太岁）就是干支纪流年。</b>',
      '比如 2014 年为甲午年，2015 年为乙未年，2016 年为丙申年，按 12 地支顺序推移。',
      '<b>2.3 月的确定（重点）</b>',
      '<b>一年十二个月，与十二地支相对应，十二个月的地支是不变的</b>：',
      '<b>寅为正月，卯为二月，辰为三月，巳为四月，午为五月，未为六月，申为七月，酉为八月，戌为九月，亥为十月，子为十一月，丑为十二月。</b>',
      '<b>但每月的天干是不确定的</b>，需要查表或计算。',
      '<b>关键：每月的月建是以"节"来论的。</b>',
      '<b>当立春之后才能建寅，二月是惊蛰以后才建卯，其余依次类推。</b>',
      '<b>三月在清明后，四月立夏后，五月芒种后，六月小暑后，七月立秋后，八月白露后，九月寒露后，十月立冬后，十一月大雪后，十二月小寒后。</b>',
      '<b>注意</b>：<b>是以"节"论，不是以"中气"论</b>。比如立春是节、雨水是气——<b>过了立春就算寅月，不用等雨水</b>。',
      '<b>2.4 年上起月：五虎遁</b>',
      '<b>甲己之年丙作首；乙庚之岁戊为头；</b>',
      '<b>丙辛必定寻庚上，丁壬壬位顺水流；</b>',
      '<b>问戊癸何处起，甲寅之上好寻求。</b>',
      '<b>举例</b>：2015 年太岁乙未，"乙庚之岁戊为头"，正月为一年之首，是以天干戊为头，<b>即戊寅月</b>。',
      '<b>2.5 日的确定</b>',
      '<b>日干支的确定一般要查万年历</b>，或根据纪年法计算公式才能确定。',
      '<b>2.6 日上起时：五鼠遁（重点）</b>',
      '<b>甲己还生甲，乙庚丙作初，</b>',
      '<b>丙辛从戊起，丁壬庚子居，</b>',
      '<b>戊癸何方发，壬子是真途。</b>',
      '<b>逐句解释</b>：',
      '<b>甲日、己日</b>——子时起<b>甲</b>（甲子时）',
      '<b>乙日、庚日</b>——子时起<b>丙</b>（丙子时）',
      '<b>丙日、辛日</b>——子时起<b>戊</b>（戊子时）',
      '<b>丁日、壬日</b>——子时起<b>庚</b>（庚子时）',
      '<b>戊日、癸日</b>——子时起<b>壬</b>（壬子时）',
      '<b>举例</b>：乙卯日，17 点 30 分为酉时。按口诀"乙庚丙作初"，在子上起丙，数到酉得到天干乙，<b>所以时干支为乙酉</b>。',
      '<b>五子元遁口诀必须死记</b>——因为<b>起人元、起神干都用它</b>。',
      '<b>三、起地分</b>',
      '<b>3.1 地分的重要性</b>',
      '<b>金口诀起课首先要确立地分，地分为事物的发课端，起着十分重要的作用。</b>',
      '<b>"入式之法妙通玄"的"妙"，就是指取地分的巧妙。从哪里开始定信息，地分不妙，就没有后面的玄秘。</b>',
      '<b>3.2 五种取法</b>',
      '<b>A. 取数字法</b>',
      '有问课人报数字起课，然后化为地支起课。',
      '<b>以子为 1、丑为 2、寅为 3、卯为 4、辰为 5、巳为 6、午为 7、未为 8、申为 9、酉为 10、戌为 11、亥为 12。</b>',
      '如报数 13，则以子为 1。<b>大数则以减法或除以 12 计算。0 数以亥为地分。</b>',
      '如报数 30，则以 6 地支<b>巳</b>为地分起课。',
      '<b>B. 属相起课法</b>（最常用）',
      '以问课人本人或者所求测人属相起课。比如属相马，则以午为地分起课。',
      '<b>C. 写字法</b>',
      '以问课人写的字笔画数，或者一句话的字数化为地支起课。',
      '比如"大"字三画，就以<b>寅</b>为地分；"好客山东人"一句话五个字，就以<b>辰</b>为地分起课。',
      '<b>D. 抽签法</b>',
      '备好 12 以上数字的签，或者直接表明 12 地支，或抽纸牌、翻书页数等。',
      '<b>E. 外应法</b>',
      '起课时突然发生的事件，或者看到某件事物，心意起课。<b>此法需要多练习为佳，金口诀来人不用问就是此法的阐释。</b>',
      '<b>还有方位法等等，取地分的方法不拘一格。</b>',
      '<b>3.3 数字法与指定法</b>',
      '<b>除了上述五种，还有两种常用的</b>：',
      '<b>数字法</b>——<b>直接报一个数字</b>（比如"报数 3"）',
      '<b>指定法</b>——<b>指定一个字或一个属相</b>（比如"用\'泉\'字测"）',
      '<b>3.4 外应法</b>',
      '<b>外应法是"心动之处为地分"</b>：',
      '<b>心中一动，就想以此取地分起课，那就按你的第一感觉。</b>',
      '<b>法无定法，金口诀的来人不用说，就是起地分方法全来自预测师。</b>',
      '<b>3.5 写字测字与日常物象</b>',
      '<b>写字测字</b>：<b>看笔画数或字数</b>。',
      '<b>日常物象</b>：<b>起课时看到什么就用什么</b>——比如看到一辆车、听到一声响，都可以取。',
      '<b>3.6 地分取法的禁忌</b>',
      '<b>地分的确立决定了课体的准确度，所以练习抓取地分是最关键的一步。</b>',
      '<b>随着预测师水平的不断跟进提高，对于抓取地分达到心神合一，瞬间定位，一旦确定地分后不能犹豫，以第一感觉为准。如果思想紊乱无法确定，最好择机再起课。</b>',
      '<b>移神换将法</b>：',
      '还有出现同一时辰同时出现相同地分的问题，金口诀还有"移神换将"法。<b>因此法拘泥不作介绍</b>，金口诀灵活多变，完全没有必要在此法多费神力。',
      '<b>四、起月将与将神</b>',
      '<b>4.1 什么是月将</b>',
      '<b>月将是月建的六合处，正月建寅，亥为月将；反之，十月建亥，寅为月将。</b>',
      '<b>4.2 十二月将表（必须背熟）</b>',
      '| 月建 | 月将 | 将神名 |',
      '|---|---|---|',
      '| <b>正月寅</b> | <b>亥</b> | <b>登明</b> |',
      '| <b>二月卯</b> | <b>戌</b> | <b>河魁</b> |',
      '| <b>三月辰</b> | <b>酉</b> | <b>从魁</b> |',
      '| <b>四月巳</b> | <b>申</b> | <b>传送</b> |',
      '| <b>五月午</b> | <b>未</b> | <b>小吉</b> |',
      '| <b>六月未</b> | <b>午</b> | <b>胜光</b> |',
      '| <b>七月申</b> | <b>巳</b> | <b>太乙</b> |',
      '| <b>八月酉</b> | <b>辰</b> | <b>天罡</b> |',
      '| <b>九月戌</b> | <b>卯</b> | <b>太冲</b> |',
      '| <b>十月亥</b> | <b>寅</b> | <b>功曹</b> |',
      '| <b>十一月子</b> | <b>丑</b> | <b>大吉</b> |',
      '| <b>十二月丑</b> | <b>子</b> | <b>神后</b> |',
      '<b>4.3 月将加时</b>',
      '<b>所列月将是固定月将，而在课中使用的活月将，因此要把它重新推算入课。</b>',
      '<b>根据古本运算用将口诀"月将加时方上传"，即把立课时的固定月将，加在立课时辰上，顺时针数到地分上，即是到课内所用月将。</b>',
      '<b>操作步骤</b>：',
      '找到当月的<b>固定月将</b>',
      '把这个月将<b>放在时辰的位置上</b>',
      '<b>顺时针数到地分的位置</b>',
      '数到的地支就是<b>将神</b>',
      '<b>完整例子</b>：',
      '<code>`</code>',
      '乙未年　壬午月　己未日　庚午时，报数 3，化地支为寅，地分为寅。',
      '<code>`</code>',
      '<b>午月的固定月将是"未"</b>',
      '<b>把"未"加在时辰"午"上</b>——午上起未',
      '<b>顺时针数</b>：午上未、未上申、申上酉、酉上戌、戌上亥、亥上子、子上丑、丑上寅——<b>地分寅上得到"卯"</b>',
      '<b>所以将神是卯</b>',
      '<b>验证公式</b>：<b>将神 = 月将 + 地分 − 时支</b>（超过 12 则减 12）',
      '<b>先把三个地支换成序数</b>（<b>子 1、丑 2、寅 3、卯 4、辰 5、巳 6、午 7、未 8、申 9、酉 10、戌 11、亥 12</b>）：',
      '<b>未（8）+ 寅（3）− 午（7）= 4</b> → 第 4 位是<b>卯</b> ✓',
      '<b>和上面顺数的结果一致</b>。列式时三个数<b>必须用同一套序数</b>，混着用就会算出错的结果。',
      '<b>4.4 两派之争：过气选将与过节选将</b>',
      '<b>取月将的方法存在过节和过气取将两种方法，各有理有据，但是无论哪种方法起课都能验断准确所测之事，否则肯定一方早已无存。</b>',
      '<b>过气选将</b>——按中气换将',
      '<b>过节选将</b>——按节换将，<b>直接选月建的六合</b>',
      '<b>在道家秘传起课一直用过节选将起课。过节选将比较简单，不用去计算时令，直接选月建的六合。</b>',
      '<b>两者并存，都可取。</b>',
      '<b>4.5 灵机课与直排法的铁律</b>',
      '<b>灵机课法</b>——不参照过节或过气取将，灵活起课，照样断课如神。',
      '<b>铁律</b>：<b>人元与地支必须同阴阳</b>（因为干支配对的规则）。',
      '<b>五、起贵神</b>',
      '<b>5.1 十二贵神的固定顺序</b>',
      '<b>十二贵神的排列顺序是：贵、腾、朱、六、勾、青、空、白、常、玄、阴、后。</b>',
      '<b>即是：贵人（丑），腾蛇（巳），朱雀（午），六合（卯），勾陈（辰），青龙（寅），天空（戌），白虎（申），太常（未），玄武（子），太阴（酉），天后（亥）。</b>',
      '<b>顺序速记口诀</b>：',
      '<b>贵腾朱六勾青，空白常玄阴后。</b>',
      '<b>本位表</b>：',
      '| 序 | 贵神 | 本位 |',
      '|---|---|---|',
      '| 1 | <b>贵人</b> | <b>丑</b> |',
      '| 2 | <b>腾蛇</b> | <b>巳</b> |',
      '| 3 | <b>朱雀</b> | <b>午</b> |',
      '| 4 | <b>六合</b> | <b>卯</b> |',
      '| 5 | <b>勾陈</b> | <b>辰</b> |',
      '| 6 | <b>青龙</b> | <b>寅</b> |',
      '| 7 | <b>天空</b> | <b>戌</b> |',
      '| 8 | <b>白虎</b> | <b>申</b> |',
      '| 9 | <b>太常</b> | <b>未</b> |',
      '| 10 | <b>玄武</b> | <b>子</b> |',
      '| 11 | <b>太阴</b> | <b>酉</b> |',
      '| 12 | <b>天后</b> | <b>亥</b> |',
      '<b>5.2 起贵神的口诀</b>',
      '<b>十二贵神的起法是以日干决定的，起贵神的口诀必须记住：</b>',
      '<b>甲戊庚牛羊，乙己鼠猴乡，</b>',
      '<b>丙丁猪鸡位，壬癸蛇兔藏，</b>',
      '<b>六辛逢马虎，此是贵人方。</b>',
      '<b>逐句解释</b>：',
      '| 日干 | 昼贵（阳贵） | 夜贵（阴贵） |',
      '|---|---|---|',
      '| <b>甲、戊、庚</b> | <b>丑（牛）</b> | <b>未（羊）</b> |',
      '| <b>乙、己</b> | <b>子（鼠）</b> | <b>申（猴）</b> |',
      '| <b>丙、丁</b> | <b>亥（猪）</b> | <b>酉（鸡）</b> |',
      '| <b>壬、癸</b> | <b>巳（蛇）</b> | <b>卯（兔）</b> |',
      '| <b>辛</b> | <b>午（马）</b> | <b>寅（虎）</b> |',
      '<b>"甲戊庚牛羊"的意思是</b>：甲日、戊日、庚日，<b>昼贵在丑（牛）、夜贵在未（羊）</b>。',
      '<b>5.3 昼夜的区分</b>',
      '<b>贵人分昼贵和夜贵</b>——白天用昼贵，晚上用夜贵。',
      '<b>昼夜的分界</b>：一般以<b>卯时至申时为昼，酉时至寅时为夜</b>（具体分界各派略有差异）。',
      '<b>5.4 顺逆的规则</b>',
      '<b>确定贵人落在哪个地支后，再看是顺数还是逆数。</b>',
      '<b>规则</b>：',
      '贵人落在<b>亥、子、丑、寅、卯、辰</b>（<b>地盘左半</b>）——<b>顺数</b>',
      '贵人落在<b>巳、午、未、申、酉、戌</b>（<b>地盘右半</b>）——<b>逆数</b>',
      '<b>然后按"贵腾朱六勾青、空白常玄阴后"的顺序</b>，把十二贵神排到十二地支上。',
      '<b>5.5 完整例子</b>',
      '<code>`</code>',
      '乙未年　壬午月　己未日　庚午时，地分寅，将神卯。',
      '<code>`</code>',
      '<b>日干是己</b>',
      '按口诀"<b>乙己鼠猴乡</b>"——己日的<b>昼贵在子、夜贵在申</b>',
      '假设是<b>白天</b>，<b>贵人在子</b>',
      '子在<b>地盘左半</b>，所以<b>顺数</b>',
      '<b>从子起贵人，顺数</b>：子=贵人、丑=腾蛇、寅=朱雀、卯=六合、辰=勾陈、巳=青龙……',
      '<b>数到地分寅</b>——寅上是<b>朱雀</b>',
      '<b>所以贵神是午</b>（朱雀的本位是午）',
      '<b>验证</b>：课式中记作"<b>庚午（朱雀）</b>"——<b>庚午</b>是干支，<b>朱雀</b>是贵神名。',
      '<b>5.6 查贵神顺逆的掌诀</b>',
      '<b>有一个掌诀可以帮助记忆顺逆</b>：',
      '<b>俱向"寅"聚齐。</b>',
      '<b>意思</b>：<b>十二贵神的排列，以寅位为参照</b>。具体操作需要掌上练习。',
      '<b>5.7 道家四课法与秘传起贵神</b>',
      '<b>四课法，是金口诀的深层技法</b>：',
      '<b>四课法分四课：退宗、正宗、转宗、进宗。</b>',
      '<b>什么是"四课"？</b> <b>同一件事，起四个课来对照</b> —— <b>一课的落点不够，就用几课各看一面</b>。',
      '<b>能确定的是</b>：<b>退宗课看的是"旧事、过去"</b> —— 比如断一个人的网吧"当初有人投资、但没有你付出的大"、"受过责罚损财"，这些都是从<b>退宗课</b>上看出来的（见第十三章课例八）。',
      '<b>四课法各课的完整起法与分工，属于本书范围之外的传承内容</b> —— 这里只作了解：<b>知道"课可以起四个"这件事，遇到用四课法的课例时，能看懂它为什么同时讲"过去"和"现在"。</b>',
      '<b>关于起贵神</b>：<b>常规起法</b>（甲戊庚牛羊……顺逆数）<b>已经够用</b>；<b>道家门内另有一套秘传起法</b>，与常规<b>确有出入</b> —— 但<b>具体差在哪一步，本书不展开</b>（同属传承内容）。',
      '<b>为什么要专门交代这一句？</b> 因为<b>金口诀流传的门派多，起课细节上各有出入</b> —— <b>起法不同，课就不同</b>。<b>断课之前先弄清"这个课是怎么起的"，比急着断更要紧。</b>',
      '<b>六、起人元与起神干</b>',
      '<b>6.1 起人元</b>',
      '<b>人元是由当天的日干遁到地分上得来的。</b>',
      '<b>用五子遁</b>：',
      '<b>甲己日子上是甲</b>',
      '<b>乙庚日子上是丙</b>',
      '<b>丙辛日子上是戊</b>',
      '<b>丁壬日子上是庚</b>',
      '<b>戊癸日子上是壬</b>',
      '<b>举例</b>：今日日干是己土。<b>甲己还生甲</b>——在子上起甲，顺时针查到丑是乙，查到地分寅得到天干<b>丙</b>，<b>那么丙就是这个课的人元</b>。',
      '<b>6.2 起神干</b>',
      '<b>起将神天干、贵神天干。这个也是按五子遁方法，与求地分的天干，也就是人元是一样的。</b>',
      '<b>举例</b>：今日日干己土，甲己还生甲，在子上起甲：',
      '顺查到<b>将神卯</b>得到天干<b>丁</b>——记作<b>丁卯</b>',
      '查到<b>贵神午</b>得到天干<b>庚</b>——记作<b>庚午</b>',
      '<b>6.3 一个完整课式的诞生</b>',
      '<b>综合前面的例子</b>：',
      '<code>`</code>',
      '起课时间：乙未年 壬午月 己未日 庚午时',
      '报数 3 → 地分寅',
      '第 1 步 起四柱：乙未年 壬午月 己未日 庚午时',
      '第 2 步 起地分：寅',
      '第 3 步 起将神：午月月将未，未加午上顺数到寅 → 卯',
      '第 4 步 起贵神：己日昼贵在子，顺数到寅 → 朱雀（午）',
      '第 5 步 起人元：己日甲己还生甲，子起甲顺数到寅 → 丙',
      '第 6 步 起神干：将神卯 → 丁；贵神午 → 庚',
      '课式：',
      '人元：丙        火 + 旺',
      '贵神：庚午(朱雀)    火 + 旺',
      '将神：丁卯(太冲) 用 木 - 休',
      '地分：寅        木 + 休',
      '<code>`</code>',
      '---',
      '<b>标准课式示范</b>',
      '<b>把前面的步骤走完，得到的就是一个完整的课。</b> 下面这个是<b>标准的课式示范</b>：',
      '<code>`</code>',
      '起课公历：2015 年 10 月 6 日 19 时 17 分（北京时间）',
      '起课农历：二○一五年 八月 廿四日 戌时',
      '干支：乙未年　乙酉月　乙卯日　丙戌时',
      '月将：辰　日空：子、丑　四大空亡：金',
      '人元：丙　　火 + 休',
      '贵神：癸未（太常）用　土 - 旺',
      '将神：壬午（胜光）　火 + 休',
      '地分：子　　水 + 死',
      '<code>`</code>',
      '<b>逐项对一遍，看它是怎么来的</b>：',
      '| 项 | 值 | 怎么来的 |',
      '|---|---|---|',
      '| <b>四柱</b> | 乙未年　乙酉月　乙卯日　丙戌时 | <b>查万年历</b>，把公历时间化成干支 |',
      '| <b>月将</b> | 辰 | <b>酉月的月将</b> —— 月建酉的六合是辰 |',
      '| <b>日空</b> | 子、丑 | 乙卯日属<b>甲寅旬</b>，旬空子、丑 |',
      '| <b>四大空亡</b> | 金 | 甲寅旬见<b>申酉庚辛</b>为空，故四大空亡为金 |',
      '| <b>地分</b> | 子 | 起课的入口（这一课取子） |',
      '| <b>将神</b> | 壬午 | <b>月将辰加在时支戌上</b>，顺数到地分子 —— 得午；天干用五鼠遁从日干乙推出，得壬 |',
      '| <b>贵神</b> | 癸未 | <b>乙日贵人在子、申</b>，昼贵起子顺数到地分子 —— 得太常（未）；天干得癸 |',
      '| <b>人元</b> | 丙 | 日干乙，用五子元遁「<b>乙庚丙作初</b>」，子上起丙 —— 地分在子，人元得丙 |',
      '<b>定旺衰</b>：四位是<b>火、土、火、水</b>。<b>水克火</b>（火受克）；<b>土克水</b>（水也受克）—— 一路克下来，<b>只有土不受克</b>（课内无木）—— 所以<b>土旺</b>。土旺则<b>金相</b>、<b>火休</b>（生土者）、<b>木囚</b>、<b>水死</b>（土克水）。',
      '标到四位上：人元丙火<b>休</b>、贵神癸未土<b>旺</b>、将神壬午火<b>休</b>、地分子水<b>死</b>。',
      '<b>定用神</b>：四位是丙（阳）、未（阴）、午（阳）、子（阳）—— <b>三阳一阴，以阴为用</b> —— 阴在贵神，所以<b>用神是癸未</b>。',
      '<b>这就是一个完整的课</b> —— <b>四柱、月将、空亡、四位、旺衰、用神，一样不缺</b>。',
      '<b>附：地分怎么取</b>',
      '<b>常见的有这几种</b>：',
      '<b>取数字法</b> —— 问课人报数，化成地支（<b>子 1、丑 2、寅 3……亥 12</b>）。<b>报数超过 12 就取余数</b>：如 30 除以 12 余 6，即以<b>巳</b>为地分；<b>余数为 0 时以亥为地分</b>；',
      '<b>属相起课法</b> —— <b>最常用</b>，以问课人本人或所求测人的属相为地分（属马则以<b>午</b>为地分）；',
      '<b>写字法</b> —— 以所写字的笔画数、或一句话的字数化成地支（"大"字三画 → <b>寅</b>；"好客山东人"五字 → <b>辰</b>）；',
      '<b>抽签法</b> —— 备 12 个以上的签、或直接标明十二地支，抽到哪个用哪个。',
      '<b>取法不同，课就不同</b> —— 但<b>课一旦起定，断法都是一样的</b>。',
      '<b style="color:var(--c-gold)">第四节　特殊起课法</b>',
      '<b>除了标准的"先起地分法"，还有很多特殊起课法。</b> 它们的共同原理是：<b>先知道要问什么，再从结果倒推其他信息</b>。',
      '<b>其实就是一种倒推机制，就像司法机关破案，先知道结果后推断真相。</b>',
      '<b>一、灵机课法</b>',
      '<b>1.1 什么是灵机课</b>',
      '<b>灵机课法，根本不遵照过节还是中气起课，一样能断准确。</b>',
      '<b>灵机课法有很多种</b>：',
      '<b>地分灵机法</b>',
      '<b>课体灵机课法</b>',
      '<b>不论四柱灵机课法</b>',
      '<b>1.2 三秒钟起一课</b>',
      '<b>灵机课的特点就是"快"</b> ——<b>三秒钟起一课</b>。',
      '<b>起课方法</b>：<b>凭当时的心动、外应、或随手取一个字、一个数</b>。',
      '<b>1.3 忌讳辰巳时起课</b>',
      '<b>灵机课法忌讳辰巳时起课</b>——因为<b>辰巳时地分与将神容易重叠</b>。',
      '<b>1.4 灵机课实战例</b>',
      '<b>例一：以"山东潍坊"四字取地分</b>',
      '<b>例二：08 年七舅病危课例</b>——两位预测师同断应期，结果一致。',
      '<b>例三：以"期、体、暗"三字起课</b>——三位课体与"借日干补人元"。',
      '<b>例四：三字问三事</b>——"泉、厦、基"三字各测一事。',
      '「谢谢你多次为我预测，都很准的，我想麻烦你再给我预测一下，我今年是否会调动，就用一个"<b>泉</b>"字吧；另外也请你帮我预测一下我今年是否会买房，就用"<b>厦</b>"字测吧；另外我还很想本人与"陈海基"这个人今后的关系，就用"<b>基</b>"字帮我测一下吧。」',
      '<b>二、隐课法（课中课）</b>',
      '<b>隐课法又称课中课，就是先起出普通一课后，以用爻做地分重新起一课。原来的四柱不变。</b>',
      '<b>这种课法增加断课的信息量，找出用爻以外的信息。</b>',
      '<b>真传一句话</b>——<b>就一层窗户纸，说白了不值钱</b>。',
      '<b>三、六亲课</b>',
      '<b>3.1 什么是六亲课</b>',
      '<b>六亲课也属于课中课的一种。是在原课的基础上，再另外单独求测六亲的情况，但要用到八字的十神知识。</b>',
      '<b>以用神为我</b>，按照<b>生我者为印绶，我生者为食伤，我克者为财，克我者为官杀，同我者为比劫</b>，来重新起课断父母、儿女、妻子、官、上司、兄弟的情况。',
      '<b>3.2 十神定义</b>',
      '1、<b>生我者为印绶</b>　A、正印（异性相生为印）　B、偏印（同性相生为枭）',
      '2、<b>我生者为食伤</b>　A、伤官（异性相生为伤）　B、食神（同性相生为食）',
      '3、<b>我克者为财</b>　　A、正财（异性相克为才）　B、偏财（同性相克为财）',
      '4、<b>克我者为官杀</b>　A、正官（异性相克为官）　B、偏官（同性相克为杀）',
      '5、<b>同我者为比劫</b>　A、比肩（同性相助为比）　B、比劫（异性相助为劫）',
      '<b>3.3 起课例</b>',
      '<b>例如起原课后用神为亥</b>：',
      '<b>求测妻子的情况</b>——我克者为财，水克火，<b>以午火为地分</b>，四柱不变重新起一课',
      '<b>求测母亲的情况</b>——生我者为印，生水者为金，<b>以异性申做地分</b>重新起课',
      '<b>3.4 六亲课的定位</b>',
      '<b>金口诀长于断事、短于断命。</b>',
      '<b>六亲课就是为了弥补这个短处</b>——<b>专断六亲的情况</b>。',
      '<b>另法</b>：<b>在原课基础上断六亲</b>，也应用十神关系，<b>但其中技巧不是单纯以生克等论</b>。',
      '<b>四、活贵神法</b>',
      '<b>4.1 什么是活贵神</b>',
      '<b>什么是活贵神？就是知道了要断什么事，是在有具体目标的情况下使用的方法。</b>',
      '<b>既然是活贵神，就是已经知道了贵神，这个贵神是有代表意义的地支。</b>',
      '<b>4.2 专事地支对照</b>',
      '| 所问之事 | 对应贵神 | 地支 |',
      '|---|---|---|',
      '| <b>官司</b> | <b>勾陈</b> | <b>辰</b> |',
      '| <b>求学</b> | <b>朱雀</b> | <b>午</b> |',
      '| <b>求婚</b> | <b>六合</b> | <b>卯</b> |',
      '| <b>求官</b> | <b>贵人</b> | <b>丑</b> |',
      '| <b>问财</b> | <b>青龙</b> | <b>寅</b>（为主） |',
      '| <b>寻贼</b> | <b>玄武</b> | <b>子</b> |',
      '| <b>出行</b> | <b>白虎</b> | <b>申</b> |',
      '<b>4.3 分类</b>',
      '<b>活贵神分两种</b>：',
      '<b>课外四柱活贵神</b>',
      '<b>课内活贵神</b>',
      '<b>4.4 课外活贵神的起法</b>',
      '<b>先按月将加时顺究的方法，数到贵神的起处，再从贵神起处查要找的活贵神。</b>',
      '<b>完整例子</b>：',
      '<code>`</code>',
      '戊子　戊午　丙午　甲午（月将未）',
      '<code>`</code>',
      '<b>将月将未加到时辰甲午上</b>，从午上开始数未',
      '<b>找贵神的起处</b>——丙丁猪鸡位，丙日昼贵在<b>亥（猪）</b>',
      '<b>数到亥，得到"子"</b>',
      '<b>如果来人问财运，以青龙"寅"为财</b>',
      '<b>现在就从"子"上起贵神</b>，按贵腾朱六勾青……数到青龙',
      '<b>得到"巳"</b> —— <b>这个巳就是要找的活贵神</b>',
      '<b>4.5 青龙落宫断财</b>',
      '<b>找到活贵神后，看青龙落在什么位置</b>：',
      '| 青龙落处 | 断法 |',
      '|---|---|',
      '| <b>寅在巳处</b> | <b>动本求财</b> |',
      '| <b>落水方</b> | <b>旺财</b> |',
      '| <b>落申处</b> | <b>龙折足破财</b> |',
      '| <b>落四季土</b> | <b>求财难</b> |',
      '<b>4.6 适用原则</b>',
      '<b>先找到贵神就是先定位了事情的性质，这是在了解事情的情况下定位的，不是来判断要发生什么事的。</b>',
      '<b>五、先起人元法</b>',
      '<b>5.1 起法</b>',
      '<b>先起人元法。也就是用天干求地分法。</b>',
      '<b>按求测者所报数字化成天干，比如报数 7 则庚为天干，如果报数 12 则乙为天干，以此类推。</b>',
      '<b>方法就是以日干按五子元法起课。</b>',
      '<b>举例</b>：报数 7 化干为庚，日干如果是丁，则"丁壬庚子居"，庚正好落在子上，<b>就以子起地分</b>。',
      '<b>举例二</b>：报数 5 化干为戊，日干是丁的话，则"丁壬庚开头"数到戊得到地支申，<b>则以申为地分起课</b>。',
      '<b>有了地分，起课方法按普通起课方法寻找将神、贵神。</b>',
      '<b>5.2 课例</b>',
      '<b>《先起人元法》测七月运</b>：',
      '<code>`</code>',
      '四柱：乙未　甲申　戊午　丁巳',
      '四位：人元癸　贵神辛酉（太阴）　将神庚申　地分亥',
      '<code>`</code>',
      '<b>起课说明</b>：',
      '<b>甲戊庚牛羊，在丑上起贵人，数到癸（亥）得到贵神太阴酉；再月将加月数到人元癸（亥）得到将神申；戊癸壬子起，数到人元癸得到地分亥。</b>',
      '<b>注意</b>：<b>如果是戊己人元，则按旬判断是辰戌还是丑未土做人元。</b>',
      '<b>六、先起贵神法</b>',
      '<b>6.1 起法</b>',
      '<b>先起贵神法。如果报数 7 化作地支午，再看日干，用贵神定旦暮法，贵螣朱六勾青、空白常玄阴后顺序查。</b>',
      '<b>比如报数 7，午做贵神。日辰是丁亥，时辰是庚戌的话，晚上贵神。</b>',
      '<b>丙丁猪鸡位，在鸡（酉）上开始查朱雀，酉开始贵—申螣—未朱雀，朱雀落在未上，所以就以未为地分起课。</b>',
      '<b>步骤</b>：',
      '<b>报数化地支</b>，以此地支作<b>贵神</b>',
      '<b>按日干用贵人口诀</b>，配合昼夜定<b>贵人起处</b>',
      '<b>按十二贵神固定顺序排布</b>，找到②所定贵神落在何支',
      '<b>以该支为地分</b>，按常规起课',
      '<b>七、先起将神法</b>',
      '<b>7.1 起法</b>',
      '<b>先起将神法。如果报数为 4 化支为卯，以卯做将神，按月将加时顺究的方法查。</b>',
      '<b>比如壬申月、庚戌时，戌上起巳查到卯得到戌，戌就为地分起课。</b>',
      '<b>步骤</b>：',
      '<b>报数化地支</b>，以此支作<b>将神</b>',
      '<b>以"月将加时"顺数</b>，找出该将神所落地支',
      '<b>以该地支为地分</b>起课',
      '<b>八、回头法</b>',
      '<b>回头法。就是在原课的基础上，把原课的地分倒推一位重新起课。</b>',
      '<b>比如原课地分为丑，那么倒推一位以子起课，与原课信息比较来断课。</b>',
      '<b>这是"两课比对"的方法</b>。',
      '<b>九、特殊起课法的适用条件与禁忌</b>',
      '<b>特殊起课法的适用条件与禁忌——先知道原委，才用倒推；不可用来断运势。</b>',
      '<b>即</b>：',
      '<b>适合</b>：已经知道要问什么（比如专测官司、专测婚姻）',
      '<b>不适合</b>：泛泛地断运势',
      '<b>三条告诫</b>：',
      '<b>法无定法</b>——「金口诀的原理是瞬间定位，全息解断，你的定位点不同，抓取的信息点就不同，<b>不存在错课真正断</b>的说法」',
      '<b>先定位、后推断</b>——「先找到贵神就是先定位了事情的性质，这是在了解事情的情况下定位的，<b>不是来判断要发生什么事的</b>」',
      '<b>技法不如断课</b>——「技法再多只是一种起课方法，<b>断课才是真功夫才是硬道理</b>」',
      '<b>十、金口诀的完整体系</b>',
      '<b>我们现在用的只是"正面体"的成课</b>。',
      '<b>完整的课式体系包括</b>：',
      '<b>正课法</b>——日常使用的一课',
      '<b>四课法</b>——<b>退宗、正宗、转宗、进宗</b>四课',
      '<b>后续课法</b>——<b>11 到 14 课</b>',
      '<b>道家的天盘贵神课与"三传"</b>：',
      '<b>天盘贵神法</b>——有<b>初传、中传、末传</b>',
      '<b>将行归家法</b>',
      '<b>金口诀原貌：四课法、天盘贵神法（初中末传）、将行归家法。</b>',
      '<b>这些是金口诀的完整体系</b>，远不止一课。',
      '---',
      '<b style="color:var(--c-gold)">第五节　遁法</b>',
      '<b>遁法是从已有的课里"遁"出更多信息的方法。</b>',
      '<b>金口诀遁法其实是课内信息量的增加问题。本来是金口诀预测学内很普通的问题。但是，却有人故弄玄虚，夸大遁法的作用，蒙骗广大金口诀爱好者，实在是不应该的事。</b>',
      '<b>金口诀遁法有人元再遁法、日干再遁法、时干再遁法等。</b>',
      '<b>遁法的数序基础是五子元遁</b>。',
      '<b>一、人元再遁——断工作跳槽</b>',
      '<b>什么是"人元再遁"？</b>',
      '<b>以日干起五子元遁，遁到"原来的地分"上，取那一位的天干 —— 这个新天干就是"遁出的人元"，地分不变。</b>',
      '<b>为什么这么用？</b> <b>人元是"首领"</b> —— <b>再遁一次，等于在同一个位置上换一个"头"</b> —— 所以用来断<b>换了工作、换了环境之后的局面</b>。',
      '<b>举个例子</b>：',
      '原来的课，<b>地分在酉</b>；',
      '日干是<b>庚</b>（或从人元取庚）—— 用五子元遁「<b>乙庚丙作初</b>」，<b>子上起丙</b>，顺数：子丙、丑丁、寅戊、卯己、辰庚、巳辛、午壬、未癸、申甲、<b>酉乙</b>；',
      '<b>酉位上得乙</b> —— 所以<b>遁出的人元是乙木</b>。',
      '<b>怎么用？</b> <b>把"乙木"当作新的人元，再和课内其余三位（贵神、将神、地分）走一遍生克</b>：',
      '<b>新的天干与课内相生相合</b> —— <b>跳槽后局面好</b>；',
      '<b>新的天干克课内、或被课内克</b> —— <b>跳槽后不顺</b>。',
      '<b>注意</b>：<b>地分不变、二神也不变</b> —— <b>变的只是"头"</b>。这正对应现实：<b>换了单位，人还是那些人、事还是那些事，变的只是上面管你的人。</b>',
      '<b>二、干合遁</b>',
      '<b>干合遁：依人元再遁之法，遁到干本处。</b>',
      '<b>如用爻或贵神是癸卯，戊癸起壬子，遁到癸是丑。则丑即为所求出的支。</b>',
      '<b>由此支我们可以断出，周围可能有银行、仓库寺庙等。</b>',
      '<b>规则</b>：以用爻或贵神的<b>天干</b>为准，从该干所属五子元遁的起首干支顺数，数到<b>天干本身</b>所在的那一组，取其<b>地支</b>。',
      '<b>例解</b>：癸卯 → 戊癸起壬子 → 壬子、癸丑 → 遁到"癸"得癸丑 → <b>取支丑</b>。',
      '<b>丑为库、为寺庙桥梁</b>，故断周围有银行、仓库、寺庙。',
      '<b>三、遁到干合处</b>',
      '<b>遁到干合处：还以癸卯来看，戊癸起壬子，遁到癸的合处，也就是戊处。得戊午。</b>',
      '<b>规则</b>：同上数序，数到<b>与该干相合之干</b>那一组，取其地支。',
      '<b>例解</b>：癸卯 → 戊癸起壬子 → 壬子、癸丑、甲寅、乙卯、丙辰、丁巳、<b>戊午</b> → <b>取支午</b>。（戊癸合）',
      '<b>四、遁人走失或丢失东西方位</b>',
      '<b>遁人走失或丢失东西方位。将干为用，遁到将干合处得到的地支，既是走失丢失方向。</b>',
      '<b>比如将干为庚，按五子元法，乙庚丙做首，数到乙酉，酉就是走失丢失方向。</b>',
      '<b>规则</b>：取<b>将神天干</b>，遁到其<b>干合处</b>，所得地支即走失／丢失的方向。',
      '<b>例解</b>：将干为庚 → 乙庚丙作首 → 丙子、丁丑、戊寅、己卯、庚辰、辛巳、壬午、癸未、甲申、<b>乙酉</b> → 得<b>酉</b>，即西方。',
      '<b>五、遁人元</b>',
      '<b>遁人元，地分不变，把人元按五子元法遁到原地分得到的新天干。</b>',
      '<b>遁出的信息都在和地分同一个方向，因为地分没变的缘故。</b>',
      '<b>规则</b>：地分固定不动，以五子元法顺数到该<b>地分</b>所在组，取该组的<b>天干</b>作为新的人元。',
      '<b>六、遁工作最适合方位</b>',
      '<b>遁工作最适合方位，遁贵神的天干到本位。得到的地支就是最佳方位。</b>',
      '<b>比如戊申贵神，戊癸起壬，数到戊得到戊午，午就是工作最佳方位。</b>',
      '<b>规则</b>：以<b>贵神天干</b>为准，遁到<b>天干本位</b>，所得地支即工作最佳方位。',
      '<b>七、其他遁法与总原则</b>',
      '<b>遁法还有六合遁、顺遁、三奇遁、交叉遁、六冲遁、三合遁等，在此不一一讲述。</b>',
      '<b>但是需要记住的是，遁法遁出的信息都会比课内信息远一层，遁的越多信息越远。</b>',
      '<b>这条原则很重要</b>：<b>遁出来的信息是"远一层"的</b>，不是课内直接的信息。',
      '---',
      '<b style="color:var(--c-gold)">第六节　空亡</b>',
      '<b>空亡是课内最重要的状态判断之一。</b>',
      '<b>空亡学说一直以来是个难以定论的难题。我们在断课中经常用到，对于空亡论更是众说纷纭，没有统一的定论。</b>',
      '<b>一、两种空亡</b>',
      '| | <b>旬中空亡</b> | <b>四大空亡</b> |',
      '|---|---|---|',
      '| <b>定义</b> | 甲子旬戌亥空之类 | 甲子、甲午旬<b>水</b>空；甲寅、甲申旬<b>金</b>空 |',
      '| <b>论法</b> | <b>只论地支不论天干</b> | <b>天干地支同论</b> |',
      '| <b>原理</b> | 十天干配十二地支，必有两个支落空 | <b>在六十甲子纳音中，甲子、甲午旬中无水；甲寅、甲申旬中无金</b> |',
      '| <b>时间性</b> | <b>旬为月内，时间短</b> | <b>四隐喻为四季，时间长</b> |',
      '| <b>效应</b> | <b>短的应力明显，力促而短暂</b> | <b>长的应力不一而久远</b> |',
      '<b>1.1 旬中空亡口诀</b>',
      '<b>甲子旬中戌亥空，甲戌旬中申酉空，</b>',
      '<b>甲申旬中午未空，甲午旬中辰巳空，</b>',
      '<b>甲辰旬中寅卯空，甲寅旬中子丑空。</b>',
      '<b>1.2 手上查旬空的方法</b>',
      '<b>掌上逆数日干</b> ——从日干所在位置逆数到旬首，看剩下哪两个地支。',
      '<b>1.3 四大空亡只有四旬有</b>',
      '<b>四大空亡只有四旬有</b>：<b>甲子旬、甲午旬（水空）；甲寅旬、甲申旬（金空）</b>。',
      '<b>其余两旬（甲戌、甲辰）没有四大空亡。</b>',
      '<b>1.4 分旬断事法</b>',
      '<b>不同旬性质不同</b>：',
      '<b>甲子旬</b>——<b>水空</b>',
      '<b>甲寅旬</b>——<b>金空</b>',
      '<b>旬的多种用法</b>：',
      '<b>断家族</b>',
      '<b>断夫妻年龄差</b>',
      '<b>断婚姻阶段与能否维持</b>',
      '<b>二、出空与填空</b>',
      '<b>2.1 只有时辰能空、能填空（重要）</b>',
      '<b>只有时辰能空、能填空 —— 日、月、岁都不空。</b>',
      '<b>这是空亡落点上的一条铁律</b>：',
      '<b>月建、日建、太岁都不会空</b> —— 它们不论空亡',
      '<b>只有时辰可以论空</b>',
      '<b>也只有时辰能填实</b> —— 日上填空只代表"今日之事"可以起作用；<b>年上、月上都不能来填空</b>',
      '<b>道理一句话就说透了</b>：',
      '<b>远水解不了近渴。</b>',
      '<b>落到断课上</b>：<b>时辰逢空，首先想到的是"所求之事没占到天机"</b> —— <b>事情暂时处于等待，或者干脆只是空想</b> —— <b>天时不定，求事大多无功。</b>',
      '<b>2.2 旬空可填，四大空亡不可</b>',
      '<b>旬空</b>——<b>可以临实辰填空</b>',
      '<b>四大空亡</b>——<b>不可填空</b>',
      '<b>2.3 填空与应期</b>',
      '<b>贵神最容易填实，"临日不出日，临时不出时"。</b>',
      '<b>意思</b>：<b>贵神临日就应在本日，临时就应在本时辰</b>——<b>不用往外推</b>。',
      '<b>2.4 四大空亡在日课中的取舍</b>',
      '<b>断"日课"（问一天之内的事）时，四大空亡有时不起作用</b> —— 因为<b>日课时间短，而四大空亡是"长空"</b>。',
      '<b>看一个例子</b>：',
      '<code>`</code>',
      '干支：丙申年　癸巳月　丁亥日　庚戌时',
      '月将：申　日空：午、未　四大空亡：金',
      '人元：癸　　水 - 休',
      '贵神：庚戌（天空）用　土 + 死　月德、丧门',
      '将神：辛丑（大吉）　土 - 死　天德、天喜',
      '地分：卯　　木 - 旺　截路',
      '<code>`</code>',
      '<b>这一课的四大空亡是"金"</b> —— 也就是<b>申、酉、庚、辛四者皆空</b>。课内<b>将神是辛丑</b> —— <b>辛金正落在这个"四空"里</b>。',
      '<b>但这一课问的是"开店能不能挣钱"</b> —— 不是一天之内的事。所以<b>这个"金空"是要论的</b>：<b>将神带金而金空</b> —— 主<b>"财上不实，钱看着有、拿不到手"</b>。',
      '<b>反过来，如果问的是"今天出门顺不顺"</b> —— 那<b>四大空亡就不必太较真</b>：<b>一天之内的事，等不到"四空"这种长空起作用</b>。',
      '<b>所以这一条的口诀是</b>：',
      '<b>长空论长事，短空论短事 —— 日课上的四大空亡，可以先放一放。</b>',
      '<b>即</b>：<b>旬空是"短空"</b>，主近期、主当下，<b>日课上要论</b>；<b>四大空亡是"长空"</b>，主长期、主大势，<b>日课上可以略过</b>。',
      '<b>三、空亡的断法</b>',
      '<b>3.1 两个比喻（极精辟）</b>',
      '<b>旬空好比生意人一时资金周转不开</b> —— <b>手头缺钱、生意转不动，但他并不穷，家里可能还有万贯家产</b> —— <b>这只是暂时的困难</b>。<b>一旦有朋友借钱给他</b>（相当于临时辰填实了这个空），<b>困难很快就过去</b>；<b>如果等不到这笔钱，就失去了这次赚钱的机会</b>，那才是实实在在的损失 —— <b>所以有"旬空为真空"的说法</b>。',
      '<b>四大空亡就不一样了</b>：<b>好比一个人是真的穷</b> —— <b>手里、资产都缺，也不知道什么时候能富裕起来</b> —— <b>这是一种长期的不确定</b>。<b>出空了，他也可能在这个大空的过程里靠努力或机会真的发家</b>；<b>也可能一直翻不了身、也没多得钱财</b> —— <b>那就没有出空的机会，一直穷下去，是真正的四大空</b>。',
      '<b>3.2 空亡的吉凶总则</b>',
      '<b>空亡的吉凶断法——凶则不凶，吉则不吉。</b>',
      '<b>即</b>：<b>用神逢空，吉事不吉、凶事不凶</b>。',
      '<b>用神逢空，吉事不吉，凶事不凶。如果用神旺则成事一半。</b>',
      '<b>3.3 "两个空不为空"不予借鉴</b>',
      '<b>有一派说"二空不空""逢空一半"</b>。',
      '<b>处理办法</b>：<b>填实（出空）可以借鉴，"两个空不为空"不予借鉴。</b>',
      '<b>理由</b>：<b>空亡是时空定义下的结果</b>，代表应事人当时所处的时空状态。<b>比如将神、贵神都逢空，都处于休死状态，就是既没工作又没钱</b>，难道说他状态很好？<b>所以不能一概而论。</b>',
      '<b>3.4 批评"按季节断真空"</b>',
      '<b>空亡不能按季节机械地断"真空"</b>，<b>要看时空的巡转</b>。',
      '<b>"时空巡转法"</b> ——<b>空亡要看时空的巡转，不是按季节机械判断</b>。',
      '<b>3.5 空亡的吉凶假象</b>',
      '<b>若逢空亡吉凶假，需辨时辰吉凶定。</b>',
      '<b>即</b>：<b>空亡时断出来的吉凶是"假"的</b>——<b>要结合时辰来判断真正的吉凶</b>。',
      '<b>3.6 特殊的空亡断法</b>',
      '<b>"大数死是家长死"</b> ——<b>乙木逢金又空亡，主长辈去世</b>。',
      '<b>断法</b>：<b>乙木为长辈</b>，<b>逢金克又空亡</b>，<b>主长辈有凶</b>。',
      '<b>3.7 化合逢空——空则不化</b>',
      '<b>如果合化的天干逢空，则不化。</b>',
      '<b>时辰不论、月不会空</b>——<b>化合只看月日，与课内无关</b>。',
      '<b>3.8 五行空亡速断（复习）</b>',
      '<b>水空则流，火空则发，木空则损，土空则陷，金空则响。</b>',
      '<b>水空则流</b>——流失。钱财流失、人员流失、计划落空',
      '<b>金空则响</b>——有名声，但不一定有财',
      '<b>木空则损</b>——钱财损失；寺庙则香火盛',
      '<b>火空则发</b>——发火、火灾、伤灾、凋零',
      '<b>土空则陷</b>——做什么事都不顺或犯小人',
      '<b>3.9 空亡与应期</b>',
      '<b>一般我们断应期时以出空为填实。</b>',
      '<b>填实之日出空，填实之时出空。</b>',
      '<b>如果旬空旺相，临时辰填实应验大；如果休死，填实也不一定应验。</b>',
      '---',
      '<b style="color:var(--c-gold)">第七节　综合示范</b>',
      '<b>一、网络求测的取信息法</b>',
      '<b>网络求测的取信息法——一个属相、一个数字即可起课。</b>',
      '<b>在网上求测，往往信息很少</b>。<b>有一个属相或一个数字就够起课了。</b>',
      '<b>网络求测的要点</b>：',
      '<b>属相起课</b>——<b>以问课人本人或所求测人属相起课</b>',
      '<b>报数起课</b>——<b>适合专项求测</b>',
      '<b>属相起课适合综合求测、命理性预测，有规律性的判断，不适合专项预测</b>',
      '<b>所以在对于有针对性求测时候更适合报数字</b>',
      '<b>二、网名起课法</b>',
      '<b>原理</b>：<b>用网名的笔画数取地分</b> —— <b>把网名化成笔画数，再按"数字法"化成地支</b>。',
      '<b>判人</b>：<b>网名本身也反映了人的某种信息</b>，可以参断。',
      '<b>课例：以"佳华"暗自起课</b>',
      '<code>`</code>',
      '干支：乙未年　甲申月　丙寅日　己亥时',
      '月将：巳　日空：戌、亥　四大空亡：水',
      '人元：己　　土 - 旺',
      '贵神：乙未（太常）　土 - 旺　天医',
      '将神：乙未（小吉）用　土 - 旺　天医',
      '地分：丑　　土 - 旺',
      '<code>`</code>',
      '<b>这是一位爱好者上门时起的课</b> —— 他没说名字、也没报数。主人从他递来的资料里见到"<b>佳华</b>"两个字，<b>就用这两个字暗自起了课</b>（反馈：此人属相为巳）。',
      '<b>先定旺衰</b>：四位是<b>土、土、土、土</b> —— 四位全土，<b>土旺</b>；金、水、木、火四行都不在课内。',
      '<b>这一课有三个看点</b>：',
      '<b>第一，四位全土。</b>',
      '<b>土主厚重、主实在、主不动</b>。断这个人：<b>为人实在、性情稳</b>；但"不动"也意味着<b>事情推不快</b>。',
      '<b>第二，两个"乙未"并列。</b>',
      '<b>贵神与将神完全相同</b>（都是乙未）。<b>二神同位、同干支</b>，主<b>内外一致、没有隔阂</b>；但<b>也主"信息重复"</b> —— 课里的信息量就窄了，<b>能断出来的面不多</b>。',
      '<b>第三，天医落在贵神与将神上。</b>',
      '<b>天医主"病有救"</b>，两处都带，主<b>这个人身体上有救应</b>，或<b>所问之事"有解"</b>。',
      '<b>定用神</b>：四位是己（阴）、未（阴）、未（阴）、丑（阴）—— <b>四位全阴，是纯阴课，纯阴以将为用</b>，所以<b>用神是将神乙未</b>。',
      '<b>合起来断</b>：<b>这是一个"稳"字当头的课</b> —— <b>人实在、事有救、但推进慢</b>。<b>问长期的事是好课，问"马上要结果"的事就得等。</b>',
      '<b>三、另起课必须按求测当时的时间</b>',
      '<b>常见疑问</b>：<b>另起课必须按求测当时的时间</b>，不能沿用上一次的四柱。',
      '<b>四、综合课例：报"期、体、暗"三字</b>',
      '<b>课例背景</b>：2009 年论坛求测，报"期、体、暗"三字。',
      '<b>只报三个字，怎么起课？</b>',
      '<b>三个字只立三位</b> —— <b>地分、将神、贵神各一位，人元少一位</b>。这时<b>借日干来补</b>：',
      '<b>日干是乙木，用五子元遁"乙庚丙作初"—— 子上起丙，顺数到地分亥水，得丁火。人元就是丁火。</b>',
      '<b>二神的天干，也用同一口诀起出</b>：',
      '<code>`</code>',
      '日干：乙木（2009 年论坛求测）',
      '人元：丁　　火',
      '贵神：丙子（玄武）　水',
      '将神：壬午（胜光）用　火',
      '地分：亥　　水',
      '<code>`</code>',
      '<b>这里有一条要紧的</b>：<b>这样起，永远错不了 —— 因为地分的天干本来就是用同一套口诀推出来的。</b> <b>用什么口诀起人元，就用什么口诀起二神的天干</b>，两处同源，自然对得上。',
      '<b>先定旺衰</b>：四位是<b>火、水、火、水</b> —— <b>火两位、水两位</b>。能克水的<b>土，课内没有</b> —— 所以<b>水不受克</b>；而<b>火正被水克</b>。<b>水的候选只有它自己</b> → <b>水旺</b>。水旺则<b>木相</b>（水生木）、<b>金休</b>（生水者）、<b>火囚</b>（克水者）、<b>土死</b>（水克土）。',
      '标到四位上：人元丁火<b>囚</b>、贵神子水<b>旺</b>、将神午火<b>囚</b>、地分亥水<b>旺</b>。',
      '<b>用神在将神壬午</b>（四位是丁阴、子阳、午阳、亥阴 —— 二阴二阳，以将为用）。',
      '<b>这个用神本身有一层特别</b>：<b>壬午是"自冲"</b> —— <b>天干壬水克地支午火，自己克自己</b>。',
      '<b>一看壬午为用，是自冲、自我相克冲的一层关系</b> —— 所以<b>断课第一步，先判定它自身的状态不好</b>。',
      '<b>这就是这一课的关键</b>：<b>用神自己就在打架</b> —— <b>不用等外面的克，它内部先乱了</b>。断事就是：<b>当事人自己的状态先不稳</b>（心里矛盾、进退两难），<b>外力还没来，自己就先消耗掉了</b>。',
      '<b>再看那三个字</b>：<b>"期、体、暗"正好应对课内的三个地支</b> —— <b>解字的时候，把字义和地支的类象合起来看</b>，这是"报字起课"特有的断法。',
      '---',
      '<b style="color:var(--c-gold)">本章小结</b>',
      '<b>一、天干总论</b>',
      '<b>只有人元是天干</b>，因为金口诀模拟天地人，<b>最上为天，天干代表天体</b>，所以把地分的天干放到人元位置，<b>作为天、作为头</b>。',
      '<b>人元天干不能直接与二神作用</b>，它起的是<b>虚拟的作用关系</b>；<b>干支同时出现，才是体现物体的性质和状态</b>。',
      '<b>人元是号召性、号令性的身份，具有权威性</b>，但<b>本身没有实际性</b>，是一种<b>形式体</b>，属性是<b>方向性、权威性，喊号子的</b>。',
      '<b>人元像下达的文件</b>——<b>作用是间接的、有时间性的</b>。所以人元克贵神为斩官，要看是"将要斩官"还是"已经斩官"。',
      '<b>人元是"脸面"</b>——天干表象，<b>心由象生</b>。',
      '<b>天干是象，地支是形</b>；<b>干为象意，如云可以化作雨成物体，而地支实性不能化作象</b>。',
      '<b>十干象意</b>：<b>甲贵、乙曲、丙乱、丁惊、戊讼、己难、庚动、辛苦、壬暗、癸愁</b>。',
      '<b>天干人体</b>：甲头乙项丙肩，丁心戊肋己腹，庚脐辛股壬胫癸足。',
      '<b>干支相通</b>：甲通寅、乙通卯、丙通午、丁通巳、戊通辰戌、己通丑未、庚通申、辛通酉、壬通子、癸通亥。',
      '<b>二、天干的关系</b>',
      '<b>天干五合</b>：甲己化土（中正）、乙庚化金（仁义）、丙辛化水（威制）、丁壬化木（淫欲）、戊癸化火（无情）。',
      '<b>合有先后</b>——谁知道主动合谁；<b>化有月令条件</b>——不是合了就能化。',
      '<b>合化能补出课内没有的五行</b>；<b>合而不化</b>时仍有牵连，但没有新五行可用。',
      '<b>天干相克</b>：<b>相合者不论克</b>（甲不克己、乙不克庚……）；<b>但壬不一定不克丁</b>。',
      '<b>"干冲"就是天干相克</b>，主外在关系冲突。',
      '<b>戊己土按旬通墓库</b>：甲子甲戌甲申旬作戌未，甲寅甲辰甲午旬作辰丑。',
      '<b>癸水可以当亥水看</b>，但不是真正的亥水。',
      '<b>天干可以论数，不能论体</b>。',
      '<b>干合断相貌</b>：甲己合眼睛斜、乙庚合爬牙、丙辛黄白、丁壬衣遮、戊癸蹇唇口大。',
      '<b>读干支组合</b>：先看生克泄比；<b>同一组合位置不同则状态不同</b>；必看旺衰。',
      '<b>三、起课法</b>',
      '<b>起课六步</b>：起四柱 → 起地分 → 起将神 → 起贵神 → 起人元 → 起神干。',
      '<b>入式歌诀开篇</b>：「入式之法妙通玄，月将加时方上传。更看何神同何位，日干须用五子元。」',
      '<b>月建以节论</b>——立春后建寅，惊蛰后建卯……',
      '<b>五虎遁</b>（年上起月）：甲己之年丙作首……',
      '<b>五鼠遁</b>（日上起时）：甲己还生甲，乙庚丙作初……',
      '<b>取地分五法</b>：数字法、属相法、写字法、抽签法、外应法。',
      '<b>月将 = 月建的六合</b>；<b>月将加时方上传</b>；<b>将神 = 月将 + 地分 − 时支</b>。',
      '<b>过节选将与过气选将并存</b>，都可取。',
      '<b>十二贵神顺序</b>：贵腾朱六勾青、空白常玄阴后。',
      '<b>贵人口诀</b>：甲戊庚牛羊，乙己鼠猴乡，丙丁猪鸡位，壬癸蛇兔藏，六辛逢马虎。',
      '<b>贵人分昼夜</b>；<b>顺逆按贵人落地盘左右半</b>。',
      '<b>人元、神干用五子遁</b>从日干遁到地分（或将神、贵神）所在位置。',
      '<b>四、特殊起课法</b>',
      '<b>灵机课法</b>——不按过节过气，灵活起课；忌讳辰巳时。',
      '<b>隐课法（课中课）</b>——以用爻做地分重起一课，四柱不变。',
      '<b>六亲课</b>——以用神为我，按十神取六亲。',
      '<b>活贵神法</b>——先立有代表意义的地支作贵神（官司辰、求学午、求婚卯、求官丑、问财寅、寻贼子、出行申）。',
      '<b>先起人元法</b>——报数化天干，以日干按五子元法求地分。',
      '<b>先起贵神法</b>——报数化地支直接做贵神，再回推地分。',
      '<b>先起将神法</b>——报数化地支做将神，再回推地分。',
      '<b>回头法</b>——把原课地分倒推一位重新起课，两课比对。',
      '<b>适用条件</b>：<b>先知道原委，才用倒推；不可用来断运势</b>。',
      '<b>三条告诫</b>：法无定法、先定位后推断、技法不如断课。',
      '<b>五、遁法</b>',
      '<b>遁法的基础是五子元遁</b>；<b>遁出的信息比课内信息远一层，遁的越多越远</b>。',
      '<b>干合遁</b>——遁到干本处。',
      '<b>遁到干合处</b>——遁到与该干相合之干处。',
      '<b>遁走失方位</b>——将干遁到干合处。',
      '<b>遁人元</b>——地分不变，遁出新天干人元。',
      '<b>遁工作方位</b>——贵神天干遁到本位。',
      '<b>人元再遁</b>——断工作跳槽后的情况。',
      '<b>六、空亡</b>',
      '<b>两种空亡</b>：旬中空亡（只论地支、时间短、效应明显）；四大空亡（干支同论、时间长、力弱）。',
      '<b>旬空口诀</b>：甲子旬戌亥空、甲戌旬申酉空、甲申旬午未空、甲午旬辰巳空、甲辰旬寅卯空、甲寅旬子丑空。',
      '<b>四大空亡只有四旬有</b>：甲子甲午旬水空、甲寅甲申旬金空。',
      '<b>只有时辰能空、能填空</b>——日月岁都不空。<b>年月填空叫"远水解不了近渴"。</b>',
      '<b>旬空可填，四大空亡不可填</b>。',
      '<b>两个比喻</b>：旬空如"手头一时短缺"；四大空亡如"真穷"。',
      '<b>空亡总则</b>：<b>凶则不凶，吉则不吉</b>。',
      '<b>"两个空不为空"不予借鉴</b>——因为空亡是时空定义下的结果。',
      '<b>化合逢空——空则不化。</b>',
      '<b>五行空亡速断</b>：水空则流、火空则发、木空则损、土空则陷、金空则响。',
      '---',
      '<b style="color:var(--c-gold)">心法</b>',
      '<b>起课是"定位"，不是"算命"</b>',
      '<b>金口诀的原理是瞬间定位，全息解断。你的定位点不同，抓取的信息点就不同，不存在错课真正断的说法。</b>',
      '<b>所以不要纠结"课起得对不对"</b> ——只要按规矩起，它就能反映信息，只是角度不同。',
      '<b>但要记住</b>：',
      '<b>一旦确定地分后不能犹豫，以第一感觉为准。如果思想紊乱无法确定，最好择机再起课。</b>',
      '<b>最普通的就是最高级的</b>',
      '<b>最普通的就是最高级的</b> —— <b>起课方法上不必做文章。</b>',
      '<b>很多人热衷于追求"高级起课法""秘传技法"</b>，但<b>真正的高手不在起课上做文章</b>——因为<b>起课只是"定位"，定位之后怎么解，才是真功夫</b>。',
      '<b>技法不如断课</b>',
      '<b>技法再多只是一种起课方法，断课才是真功夫才是硬道理。</b>',
      '<b>空亡的道理</b>',
      '<b>旬空像"手头一时短缺"</b>，<b>四大空亡像"真穷"</b>。',
      '<b>这个比喻不只用于断课，也是生活的道理</b>：',
      '<b>一时的困难，往往能靠外援度过</b>（填实）',
      '<b>真正的困境，需要自己努力翻身</b>（出空）',
      '<b>所以断到空亡，不能一概说"凶"</b> ——<b>要看是哪种空，有没有填实的可能。</b>',
    ]},
    { t: '第三章　四位所属图', rows: [
      '<b style="color:var(--c-gold)">引言</b>',
      '<b>这一章讲什么</b>',
      '前两章讲了<b>符号</b>：阴阳、五行、天干、地支，还有怎么把它们排成一个课。',
      '<b>这一章讲"位置"。</b>',
      '一个课有四行——人元、贵神、将神、地分。<b>这四行不是随便排的</b>，每一行代表什么、位置之间怎么相互作用，都有一套完整的规矩。这套规矩就是「<b>四位所属图</b>」。',
      '<b>为什么位置这么重要？</b>',
      '同样一个"子水"，放在人元位和放在地分位，<b>意思完全不同</b>：',
      '<b>在人元</b>——代表外来的、上级的、大方向上的',
      '<b>在地分</b>——代表房子的、存款的、孩子的',
      '<b>所以断课不能只看"是什么"，还要看"在哪里"。</b>',
      '<b>金口诀有"三板斧"</b>：<b>四象所属图 + 五动三动 + 入式格局</b>。三位一体，缺一不可。',
      '而<b>四象所属图是第一步</b>——<b>因为不知道位置代表什么，后面的推演就无从谈起</b>。',
      '<b>这一章的重要性</b>',
      '<b>不懂四象所属图，等于不会用金口诀。</b>',
      '这句话不是夸张。因为：',
      '<b>断课第一步</b>就是看用神落在哪个位置——位置决定了这个课"问的是什么事"',
      '<b>断课的准确性</b>取决于对四位分工的理解——同一个生克关系，落在不同位置上，断出来的话完全不同',
      '<b>断课的全面性</b>也在这里——四位都是你的信息，只看一位就会遗漏',
      '<b>零基础读者请注意</b>：这一章概念比较多，但<b>每一个概念都会解释清楚</b>。看的时候可以先记住"每个位置代表什么"，生克部分可以慢慢消化。',
      '---',
      '<b style="color:var(--c-gold)">第一节　四位是一个整体</b>',
      '<b>一、金口诀的课式结构</b>',
      '<b>1.1 四行的排列</b>',
      '金口诀的课式是<b>从下往上写</b>的：',
      '<code>`</code>',
      '人元：       ← 最上面',
      '贵神：',
      '将神：',
      '地分：       ← 最下面',
      '<code>`</code>',
      '<b>为什么这样排？</b> 因为它模拟的是<b>一个立体的结构</b>——下面是大地的根基，上面是天。',
      '<b>1.2 为什么只有人元是天干</b>',
      '前面讲过：<b>四行里只有人元是天干，其余三行都是地支。</b>',
      '<b>为什么会这样？</b>',
      '因为金口诀的原理是<b>运用天地人的模拟系统</b>——它模拟的是一个"天、地、人"的结构。',
      '<b>最上边的位置为天</b> ——而<b>天干代表天体</b>，所以把天干放到人元位置',
      '<b>下面的位置为地</b> ——地分用地支',
      '<b>中间是人</b> ——贵神、将神用地支',
      '<b>这里有个需要说明的细节</b>：<b>人元与地分，本来是同一组干支</b>。',
      '<b>什么意思？</b> 比如地分是"寅"，那么"寅"这个地支必然配一个天干（比如甲寅、丙寅、戊寅……）。<b>这一组干支本来就是完整的</b>。',
      '<b>那为什么要把这一组的天干单独拆出来，放到人元位置呢？</b>',
      '答案就是上面那句——<b>为了模拟天地人，模拟人体的课式结构</b>。',
      '<b>打个比如</b>：一个人有头有脚，本来就是一个人。但在画图的时候，为了说明"头在上、脚在下"这个结构，会把他分成上中下三段来画。<b>课式也是这样</b>——把一柱干支拆成"天干在上、地支在下"，为的是呈现天地人的层次。',
      '<b>所以有一条重要规定</b>：',
      '<b>既然人元是地分的天干，它就不能直接与其他三行（都是地支）发生作用。</b>',
      '<b>它起的是"虚拟的作用关系"</b> ——<b>干支同时出现，才是体现物体的性质和状态</b>。',
      '<b>1.3 天地人的三分</b>',
      '<b>金口诀把课分成"天、地、人"三层</b>：',
      '| 层次 | 位置 | 含义 |',
      '|---|---|---|',
      '| <b>天</b> | <b>人元</b> | 最高层、外来、大方向 |',
      '| <b>人</b> | <b>贵神、将神</b> | 中间层、人的活动 |',
      '| <b>地</b> | <b>地分</b> | 最下层、根基、固定之物 |',
      '<b>这个三分很重要</b>，因为后面所有的内外、上下关系，都是从它推出来的。',
      '<b>二、四位是一个整体</b>',
      '<b>2.1 四位都是你的信息</b>',
      '<b>这是最容易搞错的一点。</b>',
      '很多人断课只看用神，觉得"别的与我无关"。<b>这是错的。</b>',
      '<b>课内的任何信息，都是你自身的信息。</b>',
      '<b>有两个比方很能说明这个道理</b>：',
      '<b>比方一：谈判</b>',
      '比如说我们去谈判，要用到嘴、用到手，<b>难道其他的身体部分留家里吗？</b> 你的脚受伤了，其他部位出问题了，你照样没法去工作。<b>所以他们是一个整体，但又各分工不同。</b>',
      '<b>比方二：家庭</b>',
      '四位就像一家人——<b>谁的强弱都是自家人的事</b>，一处出了问题，全家都受影响。',
      '<b>所以</b>：<b>四位合起来才是完整的你</b>，只是各自分工不同。',
      '<b>2.2 二神占七成</b>',
      '<b>虽然四位是一个整体，但分量不一样。</b>',
      '<b>以贵神为主，主尊神；以月将为相。以十分灾福，七分在此二神的分辨。</b>',
      '<b>意思是</b>：<b>贵神和将神这两个位置，占了整个课七成的信息量。</b>',
      '<b>为什么？</b>',
      '因为<b>二神是"人的位置"</b> ——<b>是谋划实施的部分，吉凶大多在这个过程中出现</b>。',
      '<b>还有一个更形象的说法</b>：',
      '<b>二神是"谈判桌"，又是"鉴定机构"。</b>',
      '<b>谈判桌</b>——双方在这里谈，成不成看这里',
      '<b>鉴定机构</b>——事情的性质在这里被"鉴定"出来',
      '<b>俗话说</b>：',
      '<b>「兵熊熊一个，将熊熊一窝。」</b>',
      '<b>意思</b>：<b>二神如果不行，整个课就没戏了。</b>',
      '<b>所以断课的顺序是</b>：<b>先看二神，再看人元和地分</b>。',
      '<b>但这不是说人元和地分不重要</b>：',
      '<b>他们起到对二神的辅助性作用，或吉或凶，就像百姓选举投票——中心人物的成败与选举者很大关联。</b>',
      '<b>三、四位与实际人事的对应</b>',
      '<b>把四位理解成四个人，就明白它们的关系了</b>：',
      '就像一个房间里来了四个人，这四个人都是什么人物？他就代表将要有什么事发生。',
      '有性格倔强固执的，温柔恬顺的，刚强坚毅的，桃花的，爱生气的，拍马屁的，性子急躁的口才好，文科好理科好的……',
      '然后看<b>他们所居的位置</b>，再分析其<b>旺衰</b>。',
      '<b>如果来的这四个人配合得好，就能容易促成事情的成功；如果这四个人矛盾多，还有不对眼有仇的，这就代表事物不会顺利进行了。</b>',
      '如果出现<b>分帮结派的</b>就更难配合……',
      '<b>这段话把断课的要诀说透了</b>：',
      '<b>先认清四个人是谁</b>（取象）',
      '<b>看他们坐在哪个位置</b>（四位）',
      '<b>看他们各自的状态强弱</b>（旺衰）',
      '<b>看他们之间的关系</b>（生克）',
      '---',
      '<b style="color:var(--c-gold)">第二节　四位各自的含义</b>',
      '<b>一、人元</b>',
      '<b>1.1 人元代表什么</b>',
      '<b>人元是课式中最高的位置。</b>',
      '<b>它的身份定义是</b>：',
      '<code>`</code>',
      '人元：客　天　君　祖　外',
      '<code>`</code>',
      '<b>逐字解释</b>：',
      '<b>客</b>——外来的、不是自己家的人',
      '<b>天</b>——最高层',
      '<b>君</b>——领导、主事的人',
      '<b>祖</b>——祖上、长辈',
      '<b>外</b>——外面、外部',
      '<b>这些身份有一个共同点</b>：<b>不是"我"，而是"我之外的高层"。</b>',
      '<b>1.2 人元的具体含义</b>',
      '<b>所以断课时，人元往往代表</b>：',
      '事情的<b>发起端</b>、大方向',
      '<b>领导、上级、官方</b>',
      '<b>外部环境、外来的力量</b>',
      '<b>对方的</b>态度（求测者之外的另一方）',
      '<b>头面、脸面</b>',
      '<b>说得再清楚不过</b>：',
      '所居金口诀课体最高位置，<b>代表最高权力位置主外</b>。<b>发号施令，文件下达，身份最高。</b>',
      '人元为干代表一种象意……<b>谁也不认识权力长什么样，只是一种象意表示。无形而有影响力。</b>',
      '比如人元克贵神为斩官，为官不稳——<b>人元与贵神没有像地支间一样直接发生作用，只是显示了一种力量</b>，力量看不到但确实存在。',
      '<b>1.3 人元的性质</b>',
      '<b>人元有几个特点，要记住</b>：',
      '| 特点 | 含义 |',
      '|---|---|',
      '| <b>号召性、号令性</b> | 它下达方向，但不亲自执行 |',
      '| <b>权威性</b> | 它是最高层，有决定意义 |',
      '| <b>没有实际性</b> | 光有号令，落到实处还得靠地支 |',
      '| <b>形式体</b> | 是一种"形式"，不是实体 |',
      '| <b>虚一待用</b> | 在断应期时有它的特殊作用 |',
      '| <b>方向性</b> | 它的属性就是方向性、权威性——<b>说白了就是"喊号子的"</b> |',
      '<b>打个比方</b>：',
      '<b>人元就像一份文件、一道命令。</b> 文件本身不能干活，但它<b>决定方向、定下基调</b>，下面的人照着去做。',
      '<b>所以人元看的是"方向对不对"，不是"能不能干"。</b>',
      '<b>这就解释了一个现象</b>：',
      '<b>人元克贵神叫"斩官"</b>（工作受损），<b>但它不是立刻见效的</b>——因为<b>文件下达需要时间，执行也需要时间</b>。所以要看这个"斩官"是"将要发生"还是"已经发生"。',
      '<b>1.4 人元与地分的区别（容易混）</b>',
      '<b>这两个位置容易搞混，要分清</b>：',
      '| | <b>人元</b> | <b>地分</b> |',
      '|---|---|---|',
      '| <b>时间性</b> | <b>事物正在进行的开始部分</b> | <b>最原始部分，已经是过去式的最初部分</b> |',
      '| <b>性质</b> | 「开始」 | 「原始」 |',
      '<b>打个比方</b>：',
      '<b>人元</b>——像一件事<b>刚开始发动</b>的那一刻',
      '<b>地分</b>——像这件事的<b>根子、来历、最早的基础</b>',
      '<b>所以</b>：<b>人元主"将要"，地分主"本来"。</b>',
      '<b>不能混为一谈。</b>',
      '<b>1.5 断人元的方法</b>',
      '<b>拿到课，先看人元是什么天干，心里就有个基调</b>：',
      '| 人元天干 | 基调 |',
      '|---|---|',
      '| <b>甲</b> | 生命的开始、希望、喜庆、正能量 |',
      '| <b>乙</b> | 曲折、费周折、好事多磨 |',
      '| <b>丙</b> | 光明与热量，但隐含"乱" |',
      '| <b>丁</b> | "人丁"、惊恐之相、无所畏惧 |',
      '| <b>戊</b> | 压力、定型、房产与创业 |',
      '| <b>己</b> | 定型之后的坎坷、曲折与诉讼 |',
      '| <b>庚</b> | 不稳定、变化、变更 |',
      '| <b>辛</b> | 辛苦之象、法律约束、主外 |',
      '| <b>壬癸</b> | 「壬癸难行」、前途未卜、阴暗不明 |',
      '<b>人元的旺衰也很重要</b>：',
      '<b>人元旺</b>——事情的大方向有利，有推动力',
      '<b>人元休死</b>——等于事情<b>开始阶段就处于不利</b>，<b>可行性不强</b>',
      '<b>人元逢空</b>——则<b>事情还没有落到实处，还不具备操作性</b>',
      '<b>二、贵神</b>',
      '<b>2.1 贵神代表什么</b>',
      '<b>它的身份定义是</b>：',
      '<code>`</code>',
      '贵神：臣　宰　主　父　官',
      '<code>`</code>',
      '<b>逐字解释</b>：',
      '<b>臣</b>——臣子、下属（但对求测者来说是上级）',
      '<b>宰</b>——主管',
      '<b>主</b>——主事的人',
      '<b>父</b>——父亲、长辈',
      '<b>官</b>——官、官职',
      '<b>2.2 贵神的具体含义</b>',
      '<b>贵神最常代表的是"工作"</b>。',
      '<b>贵神所代表的象意，现在我们大多指作工作。</b>',
      '<b>为什么还看做上级长辈？</b>',
      '<b>因为位置的道理很简单</b>：',
      '<b>人元是上级，贵神是工作，地分是孩子，那么自己的身份自然也就落在了将神的位置。</b>',
      '贵神在将神之上，<b>身份地位比自己高，所以代表领导长辈</b>。',
      '<b>还有一层</b>：',
      '<b>贵神和人元都为外的一部分——人元为外，贵神为外中内。</b>',
      '都是代表己身之外的一部分信息。<b>是要社会交际、工作学习的硬性部分，也是创造价值、显示自身社会价值的部分。</b>',
      '<b>贵神旺，首先可以确定其工作学习能力强。</b>',
      '<b>有个很形象的比方</b>：',
      '<b>比如问工作情况，我们首先要看的是贵神的——就像你做饭第一想到的是锅灶，而不是电视机。</b>',
      '<b>这就是"在其位谋其职"。</b>',
      '<b>2.3 贵神与将神的关系</b>',
      '<b>贵神在将神之上，是"外面"的东西</b>：',
      '既然将神为己，<b>贵神就是己身以外的事物，不以个人意志操作的外在因素</b>。如工作、外事活动等。',
      '<b>如果把将神为家的话，贵神就是家门外的事物。</b>',
      '<b>所以</b>：',
      '<b>贵神受克</b>——大多与<b>工作</b>有关',
      '<b>贵神旺</b>——工作能力强',
      '<b>三、将神</b>',
      '<b>3.1 将神代表什么</b>',
      '<b>它的身份定义是</b>：',
      '<code>`</code>',
      '将神：己　妻　财　身　内',
      '<code>`</code>',
      '<b>逐字解释</b>：',
      '<b>己</b>——自己',
      '<b>妻</b>——妻子',
      '<b>财</b>——财',
      '<b>身</b>——自身',
      '<b>内</b>——内部',
      '<b>3.2 将神永远代表自己</b>',
      '<b>这是四位中最重要的一条</b>：',
      '<b>将神永远代表自己，永远有自己的位置。</b>',
      '<b>无论问什么事，将神都是"我"的位置。</b>',
      '<b>为什么？</b> 因为这就是位置的道理——<b>你在家里，家人有长辈、有孩子，而"你"就是你自己的位置</b>。',
      '<b>3.3 将神代表财</b>',
      '<b>在我们断课过程中，将神最具代表性的是财，所以问求财必须先看将神。</b>',
      '<b>断法</b>：',
      '<b>将神旺</b>——<b>财旺</b>',
      '<b>将神死休</b>——<b>无财，手里没钱</b>',
      '<b>将神旺而空</b>——<b>有财不在手里</b>',
      '<b>为什么将神代表财？</b>',
      '<b>将神又为己身妻子，古代妻子也被指为财</b>，将神受克必定失财伤身。',
      '<b>这句话很直白</b>：',
      '<b>把将神当做你的钱包就好理解了。</b>',
      '<b>所以</b>：<b>将神受克，是破财伤身的主要信号</b> —— <b>旺相受克多主破耗，休死受克就要防财、身两头受损</b> —— <b>具体断到什么程度，仍要看旺衰、逢空与整体格局。</b>',
      '<b>3.4 将神代表妻子与平等亲友</b>',
      '<b>将神也是妻子、朋友、同学、平辈的位置</b>。',
      '<b>为什么？</b> 因为<b>妻子、朋友和你自己是平等的</b>，所以都在将神位。',
      '<b>用在断课上</b>：',
      '<b>贼动破财还主妻子有病</b>',
      '<b>将神是财，上克贵神以财求财、以妻求财</b>——比如做生意，再就是<b>妻子相助得财</b>（所谓"贤内助"）',
      '<b>将神克人元为出外求财</b>——因为<b>这是隔位求财，必须离开原来的地方，不然你够不着</b>',
      '<b>如果出现财动又将神克人元，就断他内外求财两不误</b>——财路广、能力强',
      '<b>如果将神克地分，那就是动老本，要花存款了</b>',
      '<b>3.5 三种财的区分</b>',
      '<b>课内有三个位置可以代表财，要分清</b>：',
      '| 位置 | 财的性质 |',
      '|---|---|',
      '| <b>贵神</b> | <b>外财</b> |',
      '| <b>将神</b> | <b>正财</b>（内财） |',
      '| <b>地分</b> | <b>副财</b>（固定财产、存款） |',
      '<b>这个区分在断求财时很重要</b>。',
      '<b>四、地分</b>',
      '<b>4.1 地分代表什么</b>',
      '<b>它的身份定义是</b>：',
      '<code>`</code>',
      '地分：田　子　奴　畜　鞍',
      '<code>`</code>',
      '<b>逐字解释</b>：',
      '<b>田</b>——田地、不动产',
      '<b>子</b>——孩子',
      '<b>奴</b>——奴仆',
      '<b>畜</b>——牲畜',
      '<b>鞍</b>——鞍马（交通工具）',
      '<b>4.2 地分的具体含义</b>',
      '<b>地分在最低位，现在我们常指具有固定性质的，比如房子、存款、孩子等。</b>',
      '<b>房子不会动，存款的含义也是指一般不动的，孩子更不用说，什么改变了孩子也不会变。</b>',
      '<b>具体断法</b>：',
      '<b>地分旺</b>——<b>存款多，孩子健康，房子大</b>',
      '<b>地分死休</b>——则反之',
      '<b>地分逢空</b>——代表<b>没有房子，或者有房子没有房产证，租房居住</b>',
      '<b>地分休死空</b>——代表<b>没有存款</b>',
      '<b>地分受冲</b>——<b>根基不稳，没有后台背景，搬家</b>',
      '<b>地分还代表</b>：',
      '地分代表<b>不可更改改变的信息、基础、原始部分、历史部分、根基、最底部、腿脚、房子、存款、孩子、奴仆</b>。',
      '<b>处于休死状态为基础不牢，没有背景，站不稳。</b>',
      '<b>地分被冲时</b>：',
      '常出现<b>搬家挪地方、动用存款、孩子受惊、变动</b>等。',
      '<b>4.3 地分最"重"</b>',
      '<b>地分在最低位，但它的分量不轻</b>：',
      '<b>地分代表的是综合实力的体现，不动则已，一动就牵涉大体。</b>',
      '<b>什么意思？</b> <b>地分代表的是一个人最根本的东西</b>——房子、存款、孩子。<b>这些动一动，就是大事。</b>',
      '<b>还有一个比喻</b>：',
      '<b>为什么把存款放地分？</b> 古人常讲<b>财不外露</b>，<b>财务是存放在最隐秘、最安全之处</b>——也就是地分位置，最里面的位置。',
      '<b>五、四位含义速查</b>',
      '| 位置 | 身份 | 主要代表 | 受克时 |',
      '|---|---|---|---|',
      '| <b>人元</b> | 客、天、君、祖、外 | 领导、大方向、外来、头面 | 大方向不利、头脑空白 |',
      '| <b>贵神</b> | 臣、宰、主、父、官 | <b>工作</b>、外财、长辈 | <b>工作受阻</b> |',
      '| <b>将神</b> | 己、妻、财、身、内 | <b>自己</b>、财、妻子 | <b>财运和人身损害</b> |',
      '| <b>地分</b> | 田、子、奴、畜、鞍 | <b>房子、存款、孩子</b> | <b>固定之物出问题</b> |',
      '<b>记住这张表，就掌握了四位的基本分工。</b>',
      '---',
      '<b style="color:var(--c-gold)">第三节　四象所属图</b>',
      '<b>一、图的内容</b>',
      '<b>四象所属图是金口诀的核心工具</b>：',
      '<code>`</code>',
      '人元：客　天　君　祖　外',
      '贵神：臣　宰　主　父　官',
      '将神：己　妻　财　身　内',
      '地分：田　子　奴　畜　鞍',
      '<code>`</code>',
      '<b>读法</b>：<b>横着看是同一个位置的不同身份，竖着看是不同位置的对比。</b>',
      '<b>比如"贵神"这一行</b>：可以代表<b>臣、宰、主、父、官</b>——具体取哪个，看所问的事。',
      '问工作——取"官"',
      '问家庭——取"父"',
      '问单位——取"宰"',
      '<b>二、为什么叫"四象"而不是"四位"</b>',
      '<b>为什么叫四象而不是叫四位或者其他名称？</b>',
      '<b>象，是一种广义词，不是单指某件具体的事。</b>',
      '<b>"象"和"位"的区别</b>：',
      '<b>位</b>——固定的位置',
      '<b>象</b>——<b>位置所象征的、广义的事物</b>',
      '<b>比如人元</b>，它广义地代表"最高层、外来、领导"这一类，<b>而没有固定必须是某件事、某个人</b>。',
      '<b>这就是"象"的灵活性。</b>',
      '<b>三、图的用处</b>',
      '<b>四象所属图的作用是"给每个位置规定信息与人事、内外定位"</b>：',
      '<b>断大象</b>——用四位的定义',
      '<b>断具体事</b>——必须进入"二神"',
      '<b>什么意思？</b>',
      '<b>断大象时</b>，看四位各代表什么就可以了。<b>但断具体的事，就必须把注意力集中到二神</b>——因为二神占了七成信息，具体的事情都体现在那里。',
      '<b>四、图的局限</b>',
      '<b>这是一条很重要的提醒</b>：',
      '<b>四象所属图是方便，也是禁锢。</b>',
      '<b>为什么是"禁锢"？</b>',
      '因为<b>图规定了每个位置的"标准含义"</b>，但<b>实际断课时，位置的意义会不断变化</b>。',
      '<b>举个例子</b>：',
      '<b>断婚姻时，妻子的位置</b>：',
      '<b>按图</b>——<b>将神"妻"</b>',
      '<b>但实际断课时</b>——<b>妻子也可能落在贵神位</b>',
      '<b>举个实例</b>：男求测，用神临将神，说明此人在家中掌握财政；<b>那么妻子就落在贵神位置</b>（因为将神已经被"我"占了）。',
      '<b>所以</b>：',
      '<b>四位所属图是"死"的，断起课来是"活"的。</b>',
      '<b>"活"在哪里？</b>',
      '<b>活在你对所问事情的理解</b>。<b>同一张图，问不同的事，取的位置关系就不同。</b>',
      '<b>所以有这一句</b>：',
      '<b>金口诀以"活"字为变。不活则滞，不变则惑，只图其表难通其里。这就是很多人说的金口诀入门容易深入难——难就难在无法打破这个图的概念定义，难就难在生套口诀不研五行之理。</b>',
      '---',
      '<b>五、课式实证：对着图读一课</b>',
      '<b>四象所属图怎么用？</b> 拿一个课来对着读。',
      '<code>`</code>',
      '月建：巳　太岁：辰　日支：子　时支：午',
      '人元：甲　　木 + 旺',
      '贵神：丁巳（腾蛇）　火 - 相　（临月建）',
      '将神：戊辰（天罡）　土 + 死　（临太岁）',
      '地分：乙卯　　木 - 旺　（带驿马）',
      '<code>`</code>',
      '<b>先定旺衰</b>：四位是<b>木、火、土、木</b> —— <b>木占两位</b>，而且<b>木与火都不受克</b>（课内无金、无水）—— 取多者，<b>木旺</b>。木旺则<b>火相</b>（木生火）、<b>土死</b>（木克土）。',
      '<b>再对着图看这一课的四层</b>：',
      '| 位 | 图上所属 | 这一课是哪一位 |',
      '|---|---|---|',
      '| <b>人元（天）</b> | 客、天、君、祖、外 | <b>甲木</b> |',
      '| <b>贵神（人之上）</b> | 臣、宰、主、父、官 | <b>丁巳火</b>（用神） |',
      '| <b>将神（人之下）</b> | 己、妻、财、身、内 | <b>戊辰土</b> |',
      '| <b>地分（地）</b> | 田、子、奴、畜、鞍 | <b>乙卯木</b> |',
      '<b>对着图读，能读出三件事</b>：',
      '<b>第一，谁是谁。</b>',
      '<b>这一课四位是甲（阳）、巳（阴）、辰（阳）、卯（阴）—— 二阴二阳，按定用神法则应取将神。</b> 但<b>问的是工作，重心就落在贵神这一位</b>上 —— <b>贵神是"官、是工作"，图和所问正好对上</b>。',
      '<b>"用神"由四位阴阳定出来；"重心"落在哪一位，还要看问的是什么。</b> 问工作看贵神，问财看将神。',
      '<b>第二，上下内外。</b>',
      '<b>人元在上、为外；地分在下、为内</b>。这一课<b>人元甲木生贵神丁巳火、丁巳火又生将神戊辰土</b> —— <b>一路从上往下生</b>，是"<b>外来生内</b>"，主<b>外面的人来帮我</b>。',
      '<b>第三，六亲落在哪一位。</b>',
      '<b>将神是"妻、财、身、内"</b> —— 这一课<b>将神戊辰是土，而工作是火（丁巳）</b>，<b>火生土</b> —— <b>工作生财</b>，所以断<b>这份工作能挣到钱</b>。',
      '<b>再看"地"这一层</b>：<b>地分主"田、子、奴、畜、鞍"</b> —— <b>田宅、孩子、下属、车马</b>。这一课<b>地分带驿马</b>，驿马主"动" —— <b>落在"田宅车马"这一位上，就是"要动住处、要跑动"</b>。',
      '<b>这就叫"对着图读课"</b>：',
      '<b>先把四位的"身份"摆好 —— 再看它们之间怎么生克 —— 最后把断语安到相应的位置上。</b>',
      '<b style="color:var(--c-gold)">第四节　内外上下结构</b>',
      '<b>一、内外的划分</b>',
      '<b>1.1 标准划分</b>',
      '<b>金口诀有明确的内外划分</b>：',
      '| 位置 | 内外层次 |',
      '|---|---|',
      '| <b>人元</b> | <b>外</b>（最外） |',
      '| <b>贵神</b> | <b>外中内</b> |',
      '| <b>将神</b> | <b>内</b> |',
      '| <b>地分</b> | <b>内中内</b>（最内） |',
      '<b>另一种说法</b>（更细）：',
      '<b>人元为外、贵神为外中内、将神为内、地分为内中内。</b>',
      '<b>即</b>：<b>人元和贵神为外，将神和地分为内</b>。',
      '<b>还可以进一步</b>：',
      '<b>又可以把人元当做最外，贵神为次内</b>，一类类推。',
      '<b>1.2 为什么地分是最内</b>',
      '<b>有人会问</b>：地分在最下面，为什么是最"内"的？',
      '<b>道理很简单</b>：',
      '<b>既然地分代表存款，不可能放在你的房外，应该是最内里的地方。</b>',
      '<b>地分又是孩子位置，也是在家中最安全的位置</b>，孩子在家庭地位相对较低，所以在地分。当然<b>奴仆也在其中位置</b>。',
      '<b>这个道理很实在</b>：<b>最珍贵、最需要保护的东西，放在最里面。</b>',
      '<b>1.3 地分为何又主"外"</b>',
      '<b>有一个例外</b>：',
      '<b>也有把地分为外，这是相对于占宅居而分的。</b>',
      '<b>为什么？</b>',
      '<b>以前住宅大多有后门，可以主外。但论事物人事时是以内来分的。</b>',
      '<b>所以</b>：<b>占宅居时，地分可以主外；论人事时，地分是内。</b>',
      '<b>1.4 课内与课外</b>',
      '<b>还有一层内外</b>：',
      '<b>但是整个课题与四柱相比的时候，课内的一切干支都为内，都为我的信息。这一点必须清楚。</b>',
      '<b>即</b>：',
      '<b>课内四位之间</b>——有内外之分',
      '<b>课与四柱之间</b>——<b>整个课是"内"，四柱是"外"</b>',
      '<b>这就是"点线面"里的"面"</b> ——后面第十八章会详细讲。',
      '<b>二、上下关系</b>',
      '<b>2.1 上下的定义</b>',
      '<b>人元在上，地分在下。中间的贵神、将神依次排列</b>：',
      '<code>`</code>',
      '人元　← 上',
      '贵神',
      '将神',
      '地分　← 下',
      '<code>`</code>',
      '<b>"上"代表</b>：高层、外来、长辈、领导',
      '<b>"下"代表</b>：低层、内部、晚辈、下属',
      '<b>2.2 四句总诀</b>',
      '<b>关于上下生克，有四句总诀</b>：',
      '<b>上克下兮从外入，下克上兮向外边。</b>',
      '<b>主克客兮来索物，客克主兮客空还。</b>',
      '<b>逐句解释</b>：',
      '<b>上克下（人元克下面）</b>——<b>祸从外起</b>，问题从外面来',
      '<b>下克上（下面克人元）</b>——<b>为己出外</b>，是自己要往外走',
      '<b>后两句要单独说明，因为古本与通行本的写法不一样。</b>',
      '<b>上面引的这一句是通行本，它以"人元为主、贵神为客"</b>。而<b>古本</b>写作：',
      '<b>客克主兮来索物，主克客兮客不欢。</b>',
      '<b>古本以"地分为主、人元为客"，把主客关系讲得更明白</b>：',
      '<b>人元克地分</b>（外来克内）—— 是<b>别人来谋我</b>，主"外来索取，财官损折"',
      '<b>地分克人元</b>（内来克外）—— 是<b>我出外求财</b>，但"客所谋不遂"，所以"客不欢"',
      '<b>这两种主客之分，一句话就能记住</b>：',
      '<b>外来克内人谋己，内来克外己谋人。</b>',
      '<b>外面来克我，是别人算计我；我往外去克，是我去谋别人。</b> 抓住这一条，就不必在"究竟谁索取、谁空还"上绕圈子了。',
      '<b>还有三句</b>（讲层次递进）：',
      '<b>自下依次克上，为有能力之人，外出之人。</b>',
      '<b>上生下，外人求己。</b>',
      '<b>下生上，己求外人。</b>',
      '<b>逐句解释</b>：',
      '<b>自下依次克上</b>——<b>有能力之人、外出之人</b>（一层一层往上克，说明这人本事大）',
      '<b>上生下</b>——<b>外人求己</b>（外面的人来求我）',
      '<b>下生上</b>——<b>己求外人</b>（我去求外面的人）',
      '<b>这七句话是断"事情由谁发起、向哪个方向走"的快捷判断。</b>',
      '<b>2.3 上下的相对性</b>',
      '<b>"上"和"下"是相对的</b>：',
      '<b>论上下时，人元为上，人元以下为下；贵神代表上时，贵神以下为下，依次类推。</b>',
      '<b>即</b>：',
      '<b>拿人元当参照</b>——人元是上，其余三个都是下',
      '<b>拿贵神当参照</b>——贵神是上，将神地分是下',
      '<b>拿将神当参照</b>——将神是上，地分是下',
      '<b>这个"相对性"很重要</b>，因为<b>断不同的关系时，参照点不同</b>。',
      '<b>三、三阶段划分</b>',
      '<b>3.1 前期、中间、后期</b>',
      '<b>用四位来断事情的时间阶段</b>：',
      '| 阶段 | 对应位置 |',
      '|---|---|',
      '| <b>前期</b> | <b>人元与贵神</b> |',
      '| <b>中间</b> | <b>贵神与将神</b> |',
      '| <b>后期</b> | <b>将神与地分</b> |',
      '<b>为什么这样分？</b>',
      '因为<b>人元在上、地分在下</b>，<b>从上到下就是时间的推移</b>：',
      '<b>人元和贵神</b>——事情刚开始的部分',
      '<b>贵神和将神</b>——事情进行的部分',
      '<b>将神和地分</b>——事情结尾的部分',
      '<b>3.2 一个重要的区分</b>',
      '<b>但这里有个容易搞混的地方</b>：',
      '<b>但在断课时，地分又为最早部分，因为我们起课是以地分为基开始的。</b>',
      '<b>人元是事物开始的发展阶段，地分为事物最初开始阶段，意思是不同的。</b>',
      '<b>什么意思？</b>',
      '<b>人元</b>——事物<b>发动起来、开始发展</b>的阶段',
      '<b>地分</b>——事物<b>最初的根子、原始的基础</b>',
      '<b>打个比方</b>：',
      '<b>地分</b>——像一个人的<b>出身、家庭背景</b>（最原始）',
      '<b>人元</b>——像这个人<b>现在要做一件新事</b>（开始发动）',
      '<b>所以</b>：',
      '<b>要问"以前是什么情况"</b> ——查<b>地分</b>',
      '<b>要问"现在怎么开始"</b> ——查<b>人元</b>',
      '<b>这两个不能混。</b>',
      '<b>四、内外的相对性</b>',
      '<b>内外也是相对的</b>：',
      '<b>比如将神为家的话，贵神就是家门外的事物。</b>',
      '<b>即</b>：',
      '<b>以将神为"家"</b> ——那么<b>贵神是门外</b>',
      '<b>以人元为"外"</b> ——那么<b>贵神是"外中内"</b>',
      '<b>参照点不同，内外关系就不同。</b>',
      '<b>用在断课上</b>：',
      '<b>夫妻关系</b>——将神和贵神是"内外"关系（将神是我，贵神是外面的）：',
      '<b>神将相克</b>——<b>主内部不合</b>',
      '<b>工作关系</b>——人元和贵神是"外和外中内"：',
      '<b>人元克贵神</b>——<b>外来克制工作（斩官）</b>',
      '---',
      '<b style="color:var(--c-gold)">第五节　四位之间的生克断法</b>',
      '<b>这一节是本章的核心。</b> 两两之间的关系，共六组。',
      '<b>一、人元与贵神</b>',
      '<b>1.1 人元生贵神</b>',
      '<b>叫「官合相生」</b>。',
      '<b>断法</b>：',
      '<b>利求职与合作</b>',
      '<b>得官中财物</b>——但<b>以器物食物为主，直接发现金的少</b>',
      '<b>为什么？</b> 因为人元是"文件、号令"，<b>它给的是"调配"而不是"钱"</b>',
      '比如<b>单位发福利</b>',
      '<b>1.2 人元克贵神</b>',
      '<b>叫「斩官」</b>。',
      '<b>断法</b>：',
      '<b>为官不稳</b>',
      '<b>工作受损</b>',
      '<b>外来克制你的工作，我方工作必定受损</b>',
      '<b>注意</b>：<b>因为人元是天干，这个"克"是间接的、有时间性的</b>——<b>要看是"将要斩官"还是"已经斩官"。</b>',
      '<b>二、人元与将神</b>',
      '<b>2.1 人元生将神</b>',
      '<b>断法</b>：',
      '<b>外人来送财</b>',
      '<b>能得财，但中间隔着贵神，得财会晚</b>',
      '<b>这是隔合，会费些周折</b>——<b>隔手求财必有落息</b>，本来能得 10 万，最后到手可能是 9 万',
      '<b>如果贵神克制人元，则求财迟晚</b>',
      '<b>如果人元被课内克死休空，属于水中望月</b>',
      '<b>2.2 将神克人元</b>',
      '<b>断法</b>：',
      '<b>出外求财</b>',
      '<b>这是隔位求财，必须离开原来的地方，不然你够不着</b>',
      '<b>如果出现财动又将神克人元，就断他内外求财两不误</b>——财路广、能力强',
      '<b>三、人元与地分</b>',
      '<b>3.1 人元克地分（妻动）</b>',
      '<b>这是"妻动"</b>。',
      '<b>断法</b>：',
      '<b>人元克地分，人来克我，一个是破财，一个是孩子有灾，再就是借钱。</b>',
      '<b>人能抛开，财抛不了，所以人元克地分还是会破财——但是这个破财破的是老本，损失会小些，毕竟中间隔着二层关系。</b>',
      '<b>还有一层</b>：',
      '<b>妻动为隔位相克</b>——<b>中间隔着二神，就要看二神是支持人元克地分，还是阻止其克地分</b>，来分析判断所损的力度',
      '<b>发生在婚姻上</b>——<b>男子嫌弃女子之意</b>（古代男尊女卑，上为男、下为女）',
      '<b>3.2 人元生地分</b>',
      '<b>断法</b>：',
      '<b>内外有喜</b>',
      '<b>孩子高兴，财运自然也跟进</b>',
      '<b>如果二神偏于相生，则求事无忧；如果二神阻涉，可能好事多磨</b>',
      '<b>人元生地分，求财可得但需时日</b>',
      '<b>3.3 地分克人元（鬼动）</b>',
      '<b>这是"鬼动"</b>。',
      '<b>断法</b>：',
      '<b>地分克人元为鬼动，越过将神、贵神，牵涉好几层关系人事，所以会引起惊恐不安、口舌麻烦，不按常规出牌。</b>',
      '<b>地分代表的是综合实力的体现，不动则已，一动就牵涉大体。</b>',
      '<b>其他断法</b>：',
      '<b>为隔克，人欲外出</b>',
      '<b>必定连及家人朋友，下克上，民告官</b>',
      '<b>又有怪异之事发生</b>',
      '<b>占官喜鬼动，带驿马为异地升迁</b>',
      '<b>有喜有忧，下克上阻力大，牵涉多，适合出外、官迁</b>',
      '<b>3.4 地分生人元</b>',
      '<b>叫「印绶之喜」</b>。',
      '<b>四、贵神与将神（二神之间，最重要）</b>',
      '<b>4.1 贵神克将神（贼动）</b>',
      '<b>断法</b>：',
      '<b>贵神克将神为贼动，运用了内外的上下的作用关系。</b>',
      '<b>将神在四象所属图中为财星，财星受克必失财，主外来侵入损财，有抢夺盗取之意，故为贼动。</b>',
      '<b>详细断法</b>：',
      '<b>凡见贼动，首断损财</b>',
      '<b>更贼神入玄武入课，主失盗</b>',
      '<b>如果贼动逢空，则是没有丢失财物，或者看到别人失窃</b>',
      '<b>求财见贼动必定不得财</b>',
      '<b>婚姻见贼动大多有外情</b>',
      '<b>二神为课内，又有内线接应或家人偷窃失财</b>',
      '<b>4.2 将神克贵神（财动）</b>',
      '<b>断法</b>：',
      '<b>将克神为财动，财星发动克外，内克外，向外发展并得利，故为财动。</b>',
      '<b>详细断法</b>：',
      '<b>财动必有财</b>',
      '<b>逢空不得财或者破财</b>',
      '<b>求财不求官，求官不求财</b>',
      '<b>内克外有出外求财的想法</b>',
      '<b>将神为财物为内财，克贵神即内财搏外财，以财求财，适合投资做生意求财</b>',
      '<b>财动是内财搏外财，常指生意人投资得财</b>',
      '<b>注意一条</b>：',
      '<b>其实贵神受克也主破财，只是没有将神定位明显。</b>',
      '<b>贵神受克可能是物质损失、利益损失、工作损失等。</b>',
      '<b>4.3 二神之间的其他关系</b>',
      '<b>二神相生</b>：',
      '<b>合局相生</b>——<b>主合作一条心，力往一处使，利于合作</b>',
      '<b>财动</b>（将克神）——<b>必有财</b>',
      '<b>二神相克</b>：',
      '<b>求事难成</b>',
      '<b>二神相克冲，首先判断事情有阻</b>',
      '<b>二神相比</b>：',
      '<b>兄弟动</b>——<b>事在比肩，多有不成</b>',
      '<b>五、贵神与地分</b>',
      '<b>5.1 贵神克地分</b>',
      '<b>断法</b>：',
      '<b>工作投资先失后得</b>',
      '<b>隔位求财，借他人之手得财求事</b>',
      '<b>叫「隔手求财」，谋望晚成，但终有可成</b>',
      '<b>5.2 贵神生地分</b>',
      '<b>断法</b>：',
      '<b>以高生下，是隔合</b>',
      '<b>贵人相助与意外之财</b>',
      '<b>5.3 地分克贵神</b>',
      '<b>断法</b>：',
      '<b>以下犯上</b>',
      '<b>民告官，孩子不好管</b>',
      '<b>5.4 地分生贵神</b>',
      '<b>断法</b>：',
      '<b>下级或晚辈来助</b>',
      '<b>六、将神与地分</b>',
      '<b>6.1 将神克地分</b>',
      '<b>断法</b>：',
      '<b>动老本，要花存款了</b>',
      '<b>地分为内，又指家内关系不合</b>',
      '<b>将神克地分是"财克财必有损"</b>',
      '<b>家内不和兼破财</b>',
      '<b>6.2 地分克将神</b>',
      '<b>断法</b>：',
      '<b>就是房子、孩子和将神要钱</b>',
      '<b>常指为孩子、房子花钱，孩子不听话</b>',
      '<b>也为房子、孩子花钱</b>',
      '<b>这里有个讲究</b>：',
      '<b>地分克将神可断房、车、孩子之损，但严格称"消耗"，不称"破财"。</b>',
      '<b>为什么？</b>',
      '<b>因为"破财"是外来侵害、被动损失</b>（比如被偷被抢、被强制缴费）；<b>而"消耗"是自己主动花出去的</b>（比如为孩子、房子花钱）。',
      '<b>6.3 将神生地分</b>',
      '<b>断法</b>：',
      '<b>名曰"天覆"</b>',
      '<b>家内和合，有人助我，财帛有喜，子孙兴荣</b>',
      '<b>又主亲人分别远行</b>',
      '<b>为什么主"分别远行"？</b>',
      '<b>因为将神生地分，就像古人外出求财后把钱放家里存起来</b> ——<b>故主家内和合、财帛有喜；存完钱之后再出门，故主家人分别远行。</b>',
      '<b>七、六组生克速查表</b>',
      '| 关系 | 名称 | 主要断法 |',
      '|---|---|---|',
      '| <b>人元生贵神</b> | 官合相生 | 利求职合作，得官中财物（器物为主） |',
      '| <b>人元克贵神</b> | <b>斩官</b> | 为官不稳，工作受损 |',
      '| <b>人元生将神</b> | — | 外人送财，得财晚，隔手求财有落息 |',
      '| <b>将神克人元</b> | — | 出外求财，隔位求财 |',
      '| <b>人元克地分</b> | <b>妻动</b> | 破财、孩子有灾、借钱（破老本，损失小） |',
      '| <b>人元生地分</b> | — | 内外有喜，孩子高兴，财运跟进 |',
      '| <b>地分克人元</b> | <b>鬼动</b> | 惊恐不安、口舌麻烦，宜出外官迁 |',
      '| <b>地分生人元</b> | 印绶之喜 | — |',
      '| <b>贵神克将神</b> | <b>贼动</b> | <b>损财</b>，失盗，婚姻有外情 |',
      '| <b>将神克贵神</b> | <b>财动</b> | <b>必有财</b>，宜投资做生意 |',
      '| <b>贵神克地分</b> | — | 工作投资先失后得，隔手求财 |',
      '| <b>贵神生地分</b> | — | 以高生下，贵人相助，意外之财 |',
      '| <b>地分克贵神</b> | — | 以下犯上，民告官 |',
      '| <b>地分生贵神</b> | — | 下级或晚辈来助 |',
      '| <b>将神克地分</b> | — | 动老本，花存款，家内不和 |',
      '| <b>地分克将神</b> | — | 为房子孩子花钱（称"消耗"不称"破财"） |',
      '| <b>将神生地分</b> | 天覆 | 家内和合，财帛有喜，亲人远行 |',
      '<b>八、外克内与内克外总纲</b>',
      '<b>所有四位关系，可以归为两大类</b>：',
      '<b>外来克内</b>：',
      '<b>都是外来索取</b>',
      '<b>都指损失</b>——只是大小远近问题',
      '<b>妻动</b>——破<b>副财</b>（固定财产、存款）',
      '<b>贼动</b>——破<b>正财</b>',
      '<b>内克外</b>：',
      '<b>向外发展，并得利</b>',
      '如<b>财动</b>（将克神）——<b>必有财</b>',
      '---',
      '<b>九、课式实证：三木生一火</b>',
      '<code>`</code>',
      '干支：丙申年　癸巳月　戊戌日　庚申时',
      '月将：申　日空：辰、巳　四大空亡：水',
      '人元：甲　　木 + 旺　六甲',
      '贵神：丁巳（腾蛇）用　火 - 相　六丁',
      '将神：甲寅（功曹）　木 + 旺　六甲',
      '地分：寅　　木 + 旺',
      '<code>`</code>',
      '<b>问事</b>：一位女士求测感情。',
      '<b>先定旺衰</b>：四位是<b>木、火、木、木</b> —— <b>木占三位</b>，而且<b>木与火都不受克</b>（课内无金、无水）—— 取多者，<b>木旺</b>。木旺则<b>火相</b>（木生火）、<b>土死</b>、<b>金囚</b>、<b>水休</b>。',
      '标到四位上：人元甲木<b>旺</b>、贵神丁巳火<b>相</b>、将神甲寅木<b>旺</b>、地分寅木<b>旺</b>。',
      '<b>看四位的分工</b>：',
      '| 位 | 是谁 | 五行 | 在本课里代表 |',
      '|---|---|---|---|',
      '| <b>人元</b> | 甲木 | 木 | <b>外面那一层、对方</b> |',
      '| <b>贵神</b> | 丁巳火 | 火 | <b>用神所在</b>（工作、外面的实质） |',
      '| <b>将神</b> | 甲寅木 | 木 | <b>自己、内部</b> |',
      '| <b>地分</b> | 寅木 | 木 | <b>最内的根基</b> |',
      '<b>这一课的结构很清楚：三位木，生一位火。</b>',
      '<b>那么，是谁在生谁？</b>',
      '<b>人元甲木生贵神丁巳火</b> —— <b>外来生内</b> ✓',
      '<b>将神甲寅木生贵神丁巳火</b> —— <b>内生外</b> ✓',
      '<b>地分寅木生贵神丁巳火</b> —— <b>根基往上生</b> ✓',
      '<b>三位木，全都在生贵神那一团火</b> —— 这是<b>"众木生火"</b>。',
      '<b>这就把"四位是一个整体"讲活了</b>：',
      '<b>四个人（四位）都在往同一个地方使劲</b> —— <b>上面来生、下头来生、自己也来生</b> —— <b>力都聚在贵神这一位（用神）上</b>。',
      '<b>但这里有一个关键</b>：<b>日空是"辰、巳"</b> —— <b>而贵神正是丁巳</b>。',
      '<b>所以：用神逢空。</b>',
      '<b>用神逢空意味着什么？</b>',
      '<b>三位木辛辛苦苦生起来的这团火，是"虚"的</b> —— <b>木生火，火却落不到实处</b>。',
      '<b>断感情就是</b>：',
      '<b>一方（或双方）投入很多（众木生火），但这份投入落到空处</b> —— <b>热不起来、落不了地</b>。',
      '<b>这就是"四位是整体，而用神是中心"的意思</b>：',
      '<b>看整体</b> —— <b>三位木生一位火，力量是往一处聚的</b>；',
      '<b>看中心</b> —— <b>那一位火却空着</b> —— <b>力量聚到了，却悬着</b>。',
      '<b>两句话合起来，才是这一课真正的样子。</b>',
      '<b style="color:var(--c-gold)">第六节　四位配人体</b>',
      '<b>一、四位对应人体</b>',
      '| 位置 | 对应人体 |',
      '|---|---|',
      '| <b>人元</b> | <b>头面</b> |',
      '| <b>贵神</b> | <b>胸</b> |',
      '| <b>将神</b> | <b>腹</b> |',
      '| <b>地分</b> | <b>腿脚</b> |',
      '<b>这是最粗的划分</b>，用于快速定位病灶。',
      '<b>二、直读体型</b>',
      '<b>四位的旺衰可以直接读出人的体型</b>：',
      '<b>人元旺代表头大，将神休死肚子小腰细，贵神旺胸部大，地分旺腿脚有利。</b>',
      '<b>这就是"直读模拟"</b> ——<b>从旺衰直接读出人的体型</b>。',
      '<b>三、断长相外表的取法</b>',
      '<b>断人的外表，分两路</b>：',
      '| 部位 | 取法 |',
      '|---|---|',
      '| <b>外貌、衣色</b> | <b>看人元（天干）</b> |',
      '| <b>体型</b> | <b>看地支</b> |',
      '<b>注意</b>：<b>以旺相为主，不论空</b>。',
      '<b>四、断病的方法</b>',
      '<b>断病时，先看四位哪个受克、哪个过旺</b>，再对应到人体部位。',
      '<b>举例</b>：',
      '<b>头部</b>——看人元（人元主头面）',
      '<b>视力、心脏、肾脏、血压</b>——看将神（腹、内脏）',
      '<b>腿脚</b>——看地分',
      '<b>结合五行与地支的人体对应</b>（第一章已详列），病灶大致就能定位。',
      '<b>还有一个实用规定</b>：',
      '<b>断病看年龄旺衰——老年人喜休囚、年轻人要旺。</b>',
      '<b>为什么？</b>',
      '<b>老人</b>——身体本就趋于衰退，<b>用神休囚是"顺其自然"，反而无碍</b>',
      '<b>年轻人</b>——应该生机旺盛，<b>用神休囚说明身体不好</b>',
      '<b>这是一条反常规的规定</b>，断病时要特别注意。',
      '---',
      '<b style="color:var(--c-gold)">第七节　二神占七成</b>',
      '<b>一、二神的核心地位</b>',
      '<b>前面反复提到"二神占七成"，这里总结一下</b>。',
      '<b>以贵神为主，主尊神；以月将为相。以十分灾福，七分在此二神的分辨。</b>',
      '<b>意思是</b>：<b>贵神和将神占了整个课七成的信息量。</b>',
      '<b>为什么二神这么重要？</b>',
      '<b>1.1 二神是"人"的位置</b>',
      '<b>四位分天地人三层</b>，<b>二神在中间，是"人"的部分</b>。',
      '<b>二神在金口诀定位中为人的位置部分，是谋划实施部分，吉凶大多在此过程中出现。</b>',
      '<b>即</b>：<b>天（人元）定方向，地（地分）定根基，而事情成败就发生在"人"这一层</b>。',
      '<b>1.2 二神是"谈判桌"</b>',
      '<b>二神是整个事体的具体展示位置，关乎成败吉凶的关键，就像是谈判桌，又是鉴定机构。</b>',
      '<b>谈判桌</b>——双方在这里谈',
      '<b>鉴定机构</b>——事情的性质在这里被确定',
      '<b>比如来谈判的是仇家，是与自己格格不入的人，谈判就难顺利进行。</b>',
      '<b>二神是双方的代表，起决定作用的，二神相克冲，首先判断事情有阻</b>，但是再配合其他干支的关系，看是否有缓和余地。',
      '<b>1.3 二神是"将帅"</b>',
      '<b>「兵熊熊一个，将熊熊一窝。」</b>',
      '<b>意思</b>：<b>二神如果不行，整个课就没戏了。</b>',
      '<b>二、二神与四位的配合</b>',
      '<b>虽然二神占七成，但其他两位也不能忽略</b>：',
      '<b>但这不是说人元与地分位置不重要。他们起到对二神的辅助性作用，或吉或凶，就像百姓选举投票——中心人物的成败与选举者很大关联。</b>',
      '<b>具体怎么配合？</b>',
      '<b>2.1 断大象用四位，断具体事入二神</b>',
      '<b>断大象用四位定义，断具体事必入"二神"。</b>',
      '<b>即</b>：',
      '<b>第一层</b>——先看四位的整体格局（谁旺谁衰、什么关系）',
      '<b>第二层</b>——<b>具体的事，都到二神之间去找</b>',
      '<b>2.2 一切信息都要摆到二神之间断</b>',
      '<b>一切信息都要摆到二神之间来断。</b>',
      '<b>举个例子</b>：',
      '<b>断婚姻看第三者</b>——不是看你问了什么，而是<b>看二神之间的结构</b>：',
      '<b>二神之间有第三个字介入</b>——第三者',
      '<b>二神相生</b>——感情好',
      '<b>二神相克</b>——感情差',
      '<b>三、二神的实际断法</b>',
      '<b>3.1 用神在二神的区别</b>',
      '<b>用神只能落在贵神或将神</b>，而落点不同，意思就不同：',
      '<b>如果是专门求测工作学习的，就以贵神为主</b>，但不一定贵神就是用神。',
      '<b>用神在贵神，说明专为工作事来的，凭真本事问工作情况；如果在将神，就有动财求工作的性质。</b>',
      '<b>普通情况下</b>：',
      '<b>贵神为用</b>——求事<b>大多与工作有关</b>',
      '<b>将神为用</b>——<b>大多与财有关</b>',
      '<b>3.2 用神在将神的几种可能</b>',
      '<b>用神在将神，不一定就是求财</b>：',
      '<b>比如做生意，将神为用问工作，大多与财有关；比如花钱求事为工作、为工作破财、以工作或外事得财等。</b>',
      '<b>这只是在普通情况而言，没有绝对性，但必定与此象有关。</b>',
      '---',
      '<b style="color:var(--c-gold)">第八节　十二贵神的吉凶分类</b>',
      '<b>一、四类分法</b>',
      '<b>十二贵神按吉凶分四类</b>：',
      '| 类别 | 贵神 |',
      '|---|---|',
      '| <b>吉神</b> | <b>青龙、六合、贵人</b> |',
      '| <b>凶神</b> | <b>白虎、腾蛇、玄武</b> |',
      '| <b>半吉神</b> | <b>神后（天后）、太常、太阴</b> |',
      '| <b>半凶神</b> | <b>天空、朱雀、勾陈</b> |',
      '<b>注意</b>："神后"是将神名（子），这里指的是贵神"<b>天后</b>"（亥）。',
      '<b>二、吉凶神的喜忌法则</b>',
      '<b>分类的用处在于掌握喜忌</b>：',
      '<b>吉神喜生不喜克，凶神逢生则更凶，旺相也更凶。</b>',
      '<b>凶神休囚死则是凶中有吉，吉神休囚死则是吉中隐凶。</b>',
      '<b>凶神受克凶则减小，更适合泄其凶，尽量不去克。</b>',
      '<b>逐条解释</b>：',
      '<b>吉神</b>：',
      '<b>喜生</b>——受生则更吉',
      '<b>不喜克</b>——受克则吉不起来',
      '<b>凶神</b>：',
      '<b>逢生则更凶</b>——凶神本来就凶，再生它就凶上加凶',
      '<b>旺相也更凶</b>——力量大，做坏事的力量也大',
      '<b>休囚死则凶中有吉</b>——凶神没力气了，坏事也做不成',
      '<b>受克凶则减小</b>——被克制住，凶性减弱',
      '<b>适合泄其凶，尽量不去克</b>——<b>为什么？</b> 因为<b>克是硬碰硬，容易激化</b>；<b>泄是顺势疏导，让它自己衰弱下去</b>',
      '<b>三、化解的原则</b>',
      '<b>由此引出化解的总原则</b>：',
      '<b>化解以通关为要。</b>',
      '<b>"通关"就是让五行流通起来</b>——不是压制某一方，而是<b>让双方和谐相处</b>。',
      '<b>具体的化解三层次</b>（后面第十章会详讲）：',
      '<b>安抚</b>——顺着它，不激化',
      '<b>克制</b>——必要时才用',
      '<b>通关</b>——最理想的办法',
      '---',
      '<b style="color:var(--c-gold)">本章小结</b>',
      '<b>一、四位是一个整体</b>',
      '<b>四行里只有人元是天干</b>，因为要模拟天地人；<b>人元与地分本来是同一组干支</b>，拆开是为了呈现层次。',
      '<b>人元是地分的天干</b>，所以<b>不能直接与其他三行作用</b>，起的是<b>虚拟的作用关系</b>。',
      '<b>四位分天地人三层</b>：人元为天，贵神将神为人，地分为地。',
      '<b>课内任何信息都是你自身的信息</b>——四位合起来才是完整的你。',
      '<b>二神占七成</b>——贵神、将神是"谈判桌"和"鉴定机构"，「兵熊熊一个，将熊熊一窝」。',
      '<b>二、四位各自的含义</b>',
      '<b>人元</b>——客、天、君、祖、外；代表领导、大方向、外来、头面；<b>性质是号召性、号令性、权威性，但本身没有实际性</b>。',
      '<b>贵神</b>——臣、宰、主、父、官；<b>代表工作</b>、外财、长辈。',
      '<b>将神</b>——己、妻、财、身、内；<b>永远代表自己</b>；代表财、妻子、平等亲友；<b>将神受克必破财伤身</b>。',
      '<b>地分</b>——田、子、奴、畜、鞍；代表<b>房子、存款、孩子、腿脚</b>；<b>不动则已，一动就牵涉大体</b>。',
      '<b>课内有三个财</b>：贵神为外财，将神为正财，地分为副财。',
      '<b>三、四象所属图</b>',
      '<b>图的内容</b>：人元（客天君祖外）、贵神（臣宰主父官）、将神（己妻财身内）、地分（田子奴畜鞍）。',
      '<b>叫"象"不叫"位"</b>——象是广义词，不单指某件具体的事。',
      '<b>图是方便，也是禁锢</b>——<b>图是"死"的，断起课来是"活"的</b>。',
      '<b>四、内外上下结构</b>',
      '<b>内外划分</b>：人元为外、贵神为外中内、将神为内、地分为内中内。',
      '<b>地分是最内</b>——因为存款、孩子要放在最里面；但<b>占宅居时地分可主外</b>。',
      '<b>课与四柱</b>——课内为内，四柱为外。',
      '<b>上下七句诀</b>：上克下从外入、下克上向外边、主克客来索物、客克主客空还；自下依次克上为有能力之人；上生下外人求己；下生上己求外人。',
      '<b>三阶段</b>：人元与贵神为前期，贵神与将神为中期，将神与地分为后期。',
      '<b>人元与地分的区别</b>：<b>人元是"开始"，地分是"原始"</b>（地分主过去）。',
      '<b>五、四位之间的生克</b>',
      '<b>人元生贵神</b>（官合相生）——利求职合作，得官中财物。',
      '<b>人元克贵神</b>（斩官）——为官不稳，工作受损。',
      '<b>人元生将神</b>——外人送财，得财晚，隔手有落息。',
      '<b>将神克人元</b>——出外求财。',
      '<b>人元克地分</b>（妻动）——破财、孩子有灾，破老本损失小。',
      '<b>人元生地分</b>——内外有喜。',
      '<b>地分克人元</b>（鬼动）——惊恐不安，宜出外官迁。',
      '<b>地分生人元</b>——印绶之喜。',
      '<b>贵神克将神</b>（贼动）——<b>损财</b>，失盗，婚姻有外情。',
      '<b>将神克贵神</b>（财动）——<b>必有财</b>，宜投资。',
      '<b>贵神克地分</b>——隔手求财，先失后得。',
      '<b>地分克将神</b>——为房子孩子花钱，<b>称"消耗"不称"破财"</b>。',
      '<b>将神生地分</b>（天覆）——家内和合，财帛有喜，亲人远行。',
      '<b>外来克内都是索取、都指损失</b>；<b>内克外是向外发展并得利</b>。',
      '<b>六、四位配人体</b>',
      '<b>人元头面、贵神胸、将神腹、地分腿脚</b>。',
      '<b>直读体型</b>：人元旺头大，将神休死肚子小腰细，贵神旺胸部大，地分旺腿脚有利。',
      '<b>断长相</b>：外貌看人元，体型看地支，以旺相为主不论空。',
      '<b>断病看年龄</b>：<b>老年人喜休囚，年轻人要旺</b>。',
      '<b>七、二神占七成</b>',
      '<b>二神是"人"的位置</b>，是谋划实施的部分，吉凶大多在此出现。',
      '<b>断大象用四位，断具体事入二神</b>。',
      '<b>一切信息都要摆到二神之间来断</b>。',
      '<b>八、十二贵神吉凶分类</b>',
      '<b>吉神</b>：青龙、六合、贵人；<b>凶神</b>：白虎、腾蛇、玄武；<b>半吉神</b>：天后、太常、太阴；<b>半凶神</b>：天空、朱雀、勾陈。',
      '<b>吉神喜生不喜克；凶神逢生更凶，旺相也更凶；凶神宜泄不宜克。</b>',
      '<b>化解以通关为要。</b>',
      '---',
      '<b style="color:var(--c-gold)">心法</b>',
      '<b>位置决定意义</b>',
      '同样一个字，放在不同位置，意思完全不同。',
      '<b>这不只是断课的道理，也是看人的道理。</b>',
      '同样一个人，在家里是父亲，在单位是下属，在父母面前是孩子——<b>身份不同，责任不同，说话的分量也不同</b>。',
      '<b>断课看"位置"，其实就是看一个人在某个情境中扮演什么角色。</b>',
      '<b>图是死的，用是活的</b>',
      '<b>四象所属图规定了每个位置的标准含义，但实际断课时，位置会变。</b>',
      '<b>为什么？</b> 因为<b>所问的事情不同，位置的关系就不同</b>。',
      '<b>比如断婚姻</b>：',
      '<b>按图</b>——妻子在将神',
      '<b>但如果"我"已经占了将神</b>——那妻子就在贵神',
      '<b>所以学这张图，不能只记表面，要理解它背后的道理</b>：<b>位置是按"关系"定的，不是按"名字"定的。</b>',
      '<b>最珍贵的东西放在最里面</b>',
      '<b>地分在最下面、最里面，代表的是房子、存款、孩子。</b>',
      '<b>这个安排很有道理</b>：',
      '<b>财不外露，财务是存放在最隐秘、最安全之处。</b>',
      '<b>最珍贵的东西要保护好、放在里面</b>——这是生活的智慧，也是断课的道理。',
      '<b>所以断到地分受冲、受克，往往就是"根基动了"</b> ——<b>这是大事。</b>',
    ]},
    { t: '第四章　用神与旺衰', rows: [
      '<b style="color:var(--c-gold)">引言</b>',
      '<b>这一章讲什么</b>',
      '课起出来之后，接下来要做两件事：',
      '<b>定用神</b>——找出这个课的"中心点"',
      '<b>定旺衰</b>——判断课内五行谁强谁弱',
      '<b>这两步是断课的地基。</b>',
      '<b>为什么这么说？</b>',
      '<b>没有用神</b>，你不知道该看哪里——四位都是信息，但总要有个重点。',
      '<b>没有旺衰</b>，你不知道力量对比——同样一个"财动"，用神旺的时候是"能得财"，用神死的时候是"求财无力"，甚至"不得反破"。<b>同样是财动，结果完全相反，差别就在旺衰。</b>',
      '<b>断用神最关键的一步是定旺衰——旺则有力，衰则无力。</b>',
      '<b>这一章的两个层次</b>',
      '学这一章，要分清楚两个层次：',
      '| 层次 | 依据 | 作用 |',
      '|---|---|---|',
      '| <b>课内旺衰</b> | <b>课内五行的生克关系，与四柱无关</b> | 定事物本身的强弱 |',
      '| <b>时令旺衰</b> | <b>月建、日建的制约</b> | 定"天时"合不合 |',
      '<b>这两个层次不能混。</b>',
      '<b>初学者最容易犯的错</b>，就是把四柱的旺衰直接拿到课内来用。<b>这是不对的</b>——后面第二节会详细讲为什么。',
      '---',
      '<b style="color:var(--c-gold)">第一节　用神</b>',
      '<b>一、什么是用神</b>',
      '<b>1.1 用神的定义</b>',
      '<b>用神在一个课内是一个点，一个中心点的关系。用神是一个课的中心主题。</b>',
      '<b>就像做一件事，你得知道给谁做、为了做什么。这就是看课第一步的切入点。</b>',
      '<b>打个比方</b>：',
      '<b>一个课就像一篇文章</b> ——用神就是这篇文章的<b>主题</b>。<b>没有主题，材料再多也是散的。</b>',
      '<b>四位都是信息，但用神是"纲"</b> ——<b>抓住用神，其他三位是围绕它展开的。</b>',
      '<b>1.2 用神只能落在两个位置</b>',
      '<b>这是一条硬规定</b>：',
      '<b>用神只能落在将神或者贵神位置。</b>',
      '<b>为什么？</b>',
      '因为<b>四位的分工决定了</b>：',
      '<b>人元</b>是"方向、号令"，不是具体的事',
      '<b>地分</b>是"根基、固定之物"，是背景',
      '<b>只有贵神和将神</b>，才是<b>事情的"实际发生地"</b>',
      '<b>换个说法</b>：',
      '<b>人元定方向</b>（要往哪走）',
      '<b>地分定根基</b>（有什么本钱）',
      '<b>贵神和将神才是"战场"</b> ——事情在这里发生，成败也在这里',
      '<b>所以用神只能在二神之中。</b>',
      '<b>1.3 用神在贵神或将神，意思不同</b>',
      '<b>落在不同位置，课的性质就不同</b>：',
      '| 用神位置 | 课的性质 |',
      '|---|---|',
      '| <b>用神在贵神</b> | <b>求事大多与工作有关</b> |',
      '| <b>用神在将神</b> | <b>大多与财有关</b> |',
      '<b>更细一层</b>：',
      '<b>如果是专门求测工作学习的，就以贵神为主</b>，但不一定贵神就是用神。',
      '<b>用神在贵神，说明专为工作事来的，凭真本事问工作情况；如果在将神，就有动财求工作的性质。</b>',
      '<b>但这不是绝对的</b>：',
      '<b>比如做生意，将神为用问工作，大多与财有关；比如花钱求事为工作、为工作破财、以工作或外事得财等。</b>',
      '<b>这只是在普通情况而言，没有绝对性，但必定与此象有关。</b>',
      '<b>二、用神的取法</b>',
      '<b>2.1 用神歌诀（必须背熟）</b>',
      '<b>取用神有一套完整的口诀</b>：',
      '<b>三阴一阳，以阳为用，取象少阳，事在男子。</b>',
      '<b>三阳一阴，以阴为用，取象少阴，事在女子。</b>',
      '<b>二阴二阳，以（将）为用。</b>',
      '<b>纯阴反阳，以（将）为用。</b>',
      '<b>纯阳反阴，以（神）为用。</b>',
      '<b>逐句解释</b>：',
      '<b>① 三阴一阳，以阳为用</b>',
      '四位里<b>三个是阴、一个是阳</b> ——取<b>那个阳</b>为用神。',
      '<b>取象"少阳"，事在男子</b> ——<b>事情在男方</b>，前途光明。',
      '<b>② 三阳一阴，以阴为用</b>',
      '四位里<b>三个是阳、一个是阴</b> ——取<b>那个阴</b>为用神。',
      '<b>取象"少阴"，事在女子</b> ——<b>事情在女方</b>，前途不明，防损伤。',
      '<b>③ 二阴二阳，以将为用</b>',
      '<b>两个阴、两个阳</b> ——取<b>将神</b>为用神。',
      '<b>吉凶不定，细思量</b> ——这种情况<b>事情还不太明朗</b>，要仔细分析。',
      '<b>④ 纯阴反阳，以将为用</b>',
      '<b>四位全阴</b> ——叫"纯阴课"，取<b>将神</b>为用神。',
      '<b>阴极返阳</b> ——<b>耐心等待，事情即将转暗为明</b>。',
      '<b>⑤ 纯阳反阴，以神为用</b>',
      '<b>四位全阳</b> ——叫"纯阳课"，取<b>贵神</b>为用神。',
      '<b>物极必反</b> ——<b>事情发展到顶峰，宜速不宜迟</b>。',
      '<b>2.2 用神歌（完整版）</b>',
      '<b>金口四位干支祥，天干地支定阴阳。</b>',
      '<b>课体纯阳神为用，物极必反求事忙。</b>',
      '<b>课体纯阴将为用，耐心等待阴返阳。</b>',
      '<b>三阳一阴阴为用，前途不明防损伤。</b>',
      '<b>三阴一阳阳上取，前途光明莫迟商。</b>',
      '<b>二阴二阳将为用，吉凶不定细思量。</b>',
      '<b>用神旺相求事吉，休囚死空不当强。</b>',
      '<b>四为之中用为帅，吉凶成败问三方。</b>',
      '<b>最后两句很重要</b>：',
      '<b>"用神旺相求事吉，休囚死空不当强"</b> ——用神的旺衰决定事情的可行性（详见第二节）',
      '<b>"四为之中用为帅，吉凶成败问三方"</b> ——<b>用神是"帅"，但吉凶成败要看另外三方对它的作用</b>',
      '<b>2.3 五个课例</b>',
      '<b>看五个课，把取用法则落实一遍。</b>',
      '<b>课例一　三阴一阳</b>',
      '<code>`</code>',
      '人元：丁       —     火',
      '贵神：庚午（朱雀）＋           火（用神）',
      '将神：辛未（小吉）—            土',
      '地分：卯             —   木',
      '<code>`</code>',
      '<b>四位是</b>：丁（阴）、庚午（阳）、辛未（阴）、卯（阴）',
      '<b>三个阴、一个阳</b> ——所以<b>取阳为用</b>：<b>贵神庚午</b>。',
      '<b>注意这里的细节</b>：人元"丁"是阴火，但<b>写的是"丁"这个天干</b>；<b>判断阴阳要看天干的阴阳</b>——丁是阴干。而"午"是阳支。<b>所以"庚午"这一组算阳</b>（因为庚是阳干、午是阳支）。',
      '<b>取象"少阳"，事在男子</b> ——<b>事情在男方，前途光明。</b>',
      '<b>课例二　三阳一阴</b>',
      '<code>`</code>',
      '人元：丙   ＋     火',
      '贵神：癸未（太常）－           土（用神）',
      '将神：丙子（神后）＋            水',
      '地分：申          ＋      金',
      '<code>`</code>',
      '<b>四位是</b>：丙（阳）、癸未（阴）、丙子（阳）、申（阳）',
      '<b>三个阳、一个阴</b> ——<b>取阴为用</b>：<b>贵神癸未</b>。',
      '<b>取象"少阴"，事在女子</b> ——<b>事情在女方，前途不明。</b>',
      '<b>课例三　二阴二阳</b>',
      '<code>`</code>',
      '人元：丁   （巳）    －      火',
      '贵神：丙辰（勾陈）＋            土',
      '将神：庚申（传送）＋           金（用神）',
      '地分：巳          －      火',
      '<code>`</code>',
      '<b>四位是</b>：丁（阴）、丙辰（阳）、庚申（阳）、巳（阴）',
      '<b>两阴两阳</b> ——<b>取将神为用</b>：<b>庚申</b>。',
      '<b>"吉凶不定，细思量"</b> ——<b>事情还不太明朗，问事男女不明。</b>',
      '<b>课例四　纯阴反阳</b>',
      '<code>`</code>',
      '人元：乙   （卯）   －    木',
      '贵神：癸酉（太阴）－          金',
      '将神：乙丑（大吉）－       土（用神）',
      '地分：亥         －    水',
      '<code>`</code>',
      '<b>四位全阴</b> ——<b>纯阴课</b>，<b>取将神为用</b>：<b>乙丑</b>。',
      '<b>断法</b>：',
      '<b>问事主阴暗不明，心里压抑，求事拖拉。物极必反，阴极阳返，事情即将转暗为明，等待时机。</b>',
      '<b>课例五　纯阳反阴</b>',
      '<code>`</code>',
      '人元：甲   （寅）   ＋    木',
      '贵神：甲子（玄武）＋       水（用神）',
      '将神：丙寅（功曹）＋          木',
      '地分：戌         ＋    土',
      '<code>`</code>',
      '<b>四位全阳</b> ——<b>纯阳课</b>，<b>取贵神为用</b>：<b>甲子</b>。',
      '<b>断法</b>：',
      '<b>自己现在正处于绝对优势，将由阳转阴，有利变不利。做事易速不易迟。</b>',
      '<b>2.4 一个容易搞错的细节</b>',
      '<b>判断阴阳，是看"天干"还是"地支"？</b>',
      '<b>上面五个课例的做法是：</b>',
      '<b>人元看天干</b>——比如课例一的"丁"是阴火（丁是阴干）',
      '<b>其余三位看地支</b>——比如"庚午"看午（阳支）',
      '<b>但有时课例会在人元后面加一个括号</b>，比如"丁（巳）"、"乙（卯）"、"甲（寅）"——<b>括号里是丁、乙、甲所"通"的地支</b>（丁通巳、乙通卯、甲通寅）。',
      '<b>这是为了方便对比</b> ——<b>因为要看四位的阴阳是否一致，写成地支更容易比较。</b>',
      '<b>结论</b>：<b>看天干或看地支，结果是一样的</b>（因为干支配对时阴阳一致）。<b>写哪个都行。</b>',
      '<b>三、用神的断法</b>',
      '<b>3.1 用神是"中心主题"</b>',
      '<b>用神是一个课的中心主题……先看用神是什么干支、什么五行、什么特性、旺衰还是休死空，看一眼就要做到心里有数。</b>',
      '<b>拿到课，看用神要问四个问题</b>：',
      '<b>是什么干支</b>——甲子？庚午？（定它的取象）',
      '<b>是什么五行</b>——木火土金水？（定它的性质）',
      '<b>是什么状态</b>——旺相？休囚死？（定它的力量）',
      '<b>在哪个位置</b>——贵神？将神？（定事情的领域）',
      '<b>这四个问题回答完，课的轮廓就出来了。</b>',
      '<b>3.2 用神旺衰的意义</b>',
      '<b>如果是旺，说明事情有可行性；如果是死，可能事情会有阻力不顺；如果是空亡，则吉凶不定。</b>',
      '<b>一般情况下</b>：',
      '<b>用神旺相</b>，或临月建日建——<b>力量较大，可行性较强</b>',
      '<b>用神休囚死</b>——<b>力量不足，事情有阻力</b>',
      '<b>用神空亡</b>——<b>吉凶不定</b>',
      '<b>3.3 用神无力时怎么办</b>',
      '<b>用神休囚死，不是就一定"不行"</b> ——<b>要看其他三位对它的作用</b>。',
      '<b>如果用神处于死休之地，并不能说求事无力无功，那就要分析课内其他五行对其的影响力。</b>',
      '<b>比如用神在将神死休，而贵神旺，正好所求之事是工作方面，还是能绝处逢生——说明自身条件差，但时机有利，还有成的可能。</b>',
      '<b>这样也需要应期的结合，成与何年何月等。</b>',
      '<b>这个例子说明</b>：<b>用神只是一个"点"，要看整体。</b>',
      '<b>四、用神论</b>',
      '<b>4.1 用神是"点"</b>',
      '<b>用神在一个课内是一个点，一个中心点的关系。</b>',
      '<b>这个"点"的比喻很重要</b> ——后面讲"点线面断课法"时会展开：',
      '<b>点</b> = 用神',
      '<b>线</b> = 用神与其他三个干支的关系',
      '<b>面</b> = 四柱',
      '<b>4.2 其他干支围绕用神转</b>',
      '<b>用神只是事情的中心体，其他干支围绕他转，为他服务。</b>',
      '<b>因为只有核心然后才有力量——这种力量不只是来源于用神自己，其他干支也是对用神形成影响力的一股力量，也是必不可少的。</b>',
      '<b>所以看用神，不能只看它自己</b> ——<b>要看"谁在帮它、谁在克它"。</b>',
      '<b>4.3 对"只看用神"的批评</b>',
      '<b>这里有一条重要提醒</b>：',
      '<b>现在很多断课大多是围绕用神点来看的。这种用神论，只能观察判断片面的吉凶论断，以偏概全，常常答非所问、不能周全。</b>',
      '<b>为什么"以偏概全"？</b>',
      '<b>因为四位都是你的信息</b> ——<b>只看用神，就漏掉了另外三位的信息。</b>',
      '<b>有一个更彻底的说法</b>：',
      '<b>在我们的断课体系中没有真正的用神，我们把四位皆为用神，只是每个用神作用不同。</b>',
      '<b>什么意思？</b> <b>用神只是"切入点"，不是"唯一重点"。</b>',
      '<b>断课的完整做法是</b>：',
      '<b>从用神入手</b>——先看中心点',
      '<b>展开到四位</b>——看整体的配合',
      '<b>落实到每一处</b>——课内任何一处出问题，都对应一件事',
      '---',
      '<b style="color:var(--c-gold)">第二节　课内旺衰</b>',
      '<b>一、为什么旺衰最重要</b>',
      '<b>1.1 旺衰决定"力量"</b>',
      '<b>断课的第一个动作，就是定旺衰。</b>',
      '<b>金口诀课体起出、确定用神后，最为关键的一步是定课内五行的旺衰。</b>',
      '<b>课内五行的旺衰决定了所求事物的状态和行使能力。特别是用神的旺衰，更是代表整个事物的成败因素。</b>',
      '<b>打个比方</b>：',
      '<b>一个课就像一支队伍</b> ——<b>旺衰就是看每个人有多少力气。</b>',
      '<b>同样一个人（同一个五行），力气足（旺）的时候能办事，力气不足（休囚死）的时候办不成事。</b>',
      '<b>1.2 旺衰也是"实力的体现"</b>',
      '<b>这是很关键的一步，关系到吉凶成败的一步，是实力的体现，也是判断可行性的根本。</b>',
      '<b>所以旺衰不是"理论性"的东西，而是最实用的</b> ——<b>断"能不能成"、"力度大不大"，都靠它。</b>',
      '<b>二、课内旺衰与四柱无关（重要原则）</b>',
      '<b>2.1 这条规定必须记牢</b>',
      '<b>定旺衰分课内旺衰与时令旺衰。</b>',
      '<b>课内旺衰是以课内五行生克决定，与四柱无关。</b>',
      '<b>时令旺衰是以月建或日建为制约因素。</b>',
      '<b>这是两个完全不同的层次，不能混。</b>',
      '<b>2.2 为什么课内旺衰与四柱无关</b>',
      '<b>理解这一点，关键在"两个环境"</b>：',
      '<b>四柱是"外环境"，课内是"内环境"。</b>',
      '<b>打个比方</b>：',
      '<b>比如你家里是内环境，室外是外环境。冬天家里再暖和也是冬天而不是夏天，你出门还要穿厚外套。</b>',
      '<b>内环境决定不了外环境，但外环境可以决定内环境。</b>',
      '<b>所以</b>：',
      '<b>课内旺衰</b>——是<b>这个"家"内部</b>的强弱关系，<b>自己跟自己比</b>',
      '<b>时令旺衰</b>——是<b>外面的大气候</b>，<b>影响但不改变内部关系</b>',
      '<b>2.3 一个反面例子</b>',
      '<b>如果把四柱扯进来会怎样？</b>',
      '<b>举例</b>：课内用神是木，课内四位的生克关系显示"木旺"。但起课时正值秋天（金旺、木衰）。',
      '<b>如果按四柱算</b>，就会说"木不旺"。',
      '<b>但正确的做法是</b>：',
      '<b>课内</b>——<b>木旺</b>（这是课内四位的关系决定的）',
      '<b>时令</b>——<b>秋天金旺木衰</b>，这叫「<b>吉不逢时</b>」',
      '<b>"吉不逢时"是什么意思？</b>',
      '<b>课内用神为木旺，恰好在秋季求事，这个时候才能代表用神并非是真旺。这叫吉不逢时。</b>',
      '<b>但不代表事情不可成，至少能是另选时机。</b>',
      '<b>所以</b>：',
      '<b>课内旺衰</b> 决定"<b>这件事本身有没有力量</b>"',
      '<b>时令</b> 决定"<b>现在这个时机合不合适</b>"',
      '<b>两件事，不能混为一谈。</b>',
      '<b>三、判断课内旺衰的四个条件</b>',
      '<b>3.1 四句总诀</b>',
      '<b>判断旺爻的条件：</b>',
      '<b>A、不受克者为旺。　B、克他爻者为旺。　C、受生者为旺。　D、多者为旺。</b>',
      '<b>旺生者为相，旺克者为死。生旺者为休，克旺者为囚。</b>',
      '<b>这四句是全书的核心公式，必须记熟。</b>',
      '<b>先解释后四句</b>：',
      '<b>旺生者为相</b>——旺神生的那个，状态是"相"（次旺）',
      '<b>旺克者为死</b>——旺神克的那个，状态是"死"',
      '<b>生旺者为休</b>——生旺神的那个，状态是"休"（因为力气都给出去了）',
      '<b>克旺者为囚</b>——克旺神的那个，状态是"囚"（想克但克不动，自己被困住）',
      '<b>注意</b>：这四句是<b>推导出来的</b>——<b>定出一个"旺"，其余三个自动确定。</b>',
      '<b>3.2 为什么"重克"</b>',
      '<b>判断旺衰的方法里，"克"排在前两位</b> ——<b>这不是偶然</b>。',
      '<b>金口诀重克不重生，因为克是事物的矛盾突出点。克则动，动则洞察。</b>',
      '<b>就像两个人站着不动，你不知道他们在做什么；如果两人打起来了，你就能判断谁强谁弱、因为什么打架。</b>',
      '<b>所以定旺衰的第一步是"找克"</b>：',
      '<b>拿到课，首先在四位之间找"克"。</b>',
      '<b>再进一步</b>：',
      '<b>有克先找克，克者为旺。</b>',
      '<b>3.3 四个条件逐一详解</b>',
      '##### A、不受克者为旺',
      '<b>四条里最简单的一条</b>：<b>谁没被克，谁就旺。</b>',
      '<b>课例</b>：',
      '<code>`</code>',
      '人元：戊土 + 旺',
      '贵神：戊子(玄武)      水 + 死',
      '将神：癸巳(太乙) 用 火 - 休',
      '地分：子水 + 死',
      '<code>`</code>',
      '<b>找克</b>：戊土克子水（两个子水都被土克）；子水克巳火。',
      '<b>判断</b>：戊土<b>没有受克</b>——所以<b>戊土为旺</b>。',
      '<b>推导其余</b>：',
      '<b>旺克者死</b>——水被土克，所以<b>水死</b>',
      '<b>生旺者休</b>——火生土，火生旺神，所以<b>火休</b>',
      '##### B、克他爻者为旺',
      '<b>谁克别人，谁就旺</b>（前提是它自己不被克）。',
      '<b>课例</b>：',
      '<code>`</code>',
      '人元：己土 - 旺',
      '贵神：丁酉(太阴)      金 - 相',
      '将神：壬辰(天罡) 用 土 + 旺',
      '地分：亥水 - 死',
      '<code>`</code>',
      '<b>找克</b>：土克水——己土、辰土都克亥水；土不受克；土生金。',
      '<b>判断</b>：土克水且不受克——<b>己土、辰土为旺</b>。',
      '<b>推导其余</b>：',
      '<b>旺生者为相</b>——金受土生，所以<b>金相</b>',
      '<b>旺克者死</b>——水被土克，所以<b>水死</b>',
      '##### C、受生者为旺',
      '<b>如果课内没有克，只有生</b> ——那么<b>被生的那个就是旺</b>。',
      '<b>课例</b>：',
      '<code>`</code>',
      '人元：丁火 - 休',
      '贵神：丁丑(贵人)      土 - 旺',
      '将神：壬午(胜光) 用 火 + 休',
      '地分：丑土 - 旺',
      '<code>`</code>',
      '<b>找克</b>：<b>没有克，只有生</b>——火生土（丁火、午火都生丑土）。',
      '<b>判断</b>：土被火生——<b>土为旺</b>。',
      '<b>这是一种特殊情形</b>：',
      '<b>像这种课体，因为没有克冲等因素存在，即便课内火休，但四位相生百事吉，对事物的求事力没有多大阻力。</b>',
      '<b>"四位相生百事吉"</b> ——<b>没有克的课，最好断。</b>',
      '##### D、多者为旺',
      '<b>数量多的那个，就是旺。</b>',
      '<b>课例</b>：',
      '<code>`</code>',
      '人元：己土 - 旺',
      '贵神：乙未(太常)      土 - 旺',
      '将神：甲午(胜光) 用 火 + 休',
      '地分：丑土 - 旺',
      '<code>`</code>',
      '<b>一个午火，三个土</b> ——<b>土多，所以土为旺</b>。其实这也是"受生者为旺"（火生土，土又得三个）。',
      '<b>再看一个</b>：',
      '<code>`</code>',
      '人元：庚        金 + 旺',
      '贵神：乙酉(太常)用      金 - 旺',
      '将神：甲子(胜光) 水 + 相',
      '地分：申        金 + 旺',
      '<code>`</code>',
      '<b>三金一水</b> ——水虽受金生，按理该旺，<b>但金多而浊，所以仍以金旺论</b>。',
      '<b>这一课的启示</b>：',
      '<b>「多者为旺」与「受生者为旺」有时会冲突。此时要看哪一方在数量上压倒。</b>',
      '三金一水，金的声势远大于水，<b>水只是被金生出来的一个点，撑不起"旺"的格局</b>。',
      '<b>3.4 四法的先后次序（关键）</b>',
      '<b>A、B、C、D 四条法则不是并列的 —— 它们有先后。</b>',
      '<b>遇到冲突时，按这个次序定</b>：',
      '<b>不受克 → 多者 → 克他爻 → 受生。</b>',
      '<b>一条条用课例讲实</b>：',
      '<b>第一步：不受克者优先。</b>',
      '课内只要有"不受克"的五行，就<b>只在它们里面选</b>，其余的一概不考虑。',
      '<b>第二步：候选中数量多的优先。</b>',
      '比如<b>三金一水</b> —— 金、水都不受克，但<b>金占了三位</b>，所以<b>金旺</b>（水只能作"相"）。这就是"<b>金多水浊</b>"：水本是被金生的，可<b>金太多，反而养不成水</b>。',
      '<b>第三步：数量并列时，看谁"克他爻"。</b>',
      '比如这一课：',
      '<code>`</code>',
      '干支：丙申年　癸巳月　丁未日　丙午时',
      '月将：申　日空：寅、卯　四大空亡：无',
      '人元：乙　　木 - 旺　月德合',
      '贵神：庚戌（天空）　土 + 死　月德、丧门',
      '将神：丁未（小吉）　土 - 死　病符、六丁、飞廉',
      '地分：巳　　火 - 相　驿马',
      '<code>`</code>',
      '<b>木克土</b> —— <b>土受克，出局</b>；',
      '<b>木与火都不受克</b>（课内无金、无水），而且<b>各占一位</b>；',
      '两者并列 —— <b>看谁"克他爻"</b>：<b>木克土，而土就在课内</b> —— 所以<b>木旺</b>（木旺则火相、土死）。',
      '<b>这一课正是 B 法与 C 法的分界点</b>：<b>如果课内没有"土"</b>（木不克任何在课的五行），<b>那就要轮到 C 法"受生者为旺"了</b>。',
      '<b>第四步：都不克他爻，才看"受生"。</b>',
      '比如这一课（详见前面 C 法那一节）：',
      '<code>`</code>',
      '人元：丁　　火 - 休',
      '贵神：丁丑（贵人）　土 - 旺',
      '将神：壬午（胜光）用　火 + 休',
      '地分：丑　　土 - 旺',
      '<code>`</code>',
      '<b>火与土都不受克</b>，而且<b>各占两位</b>；',
      '<b>火不克土、土不克火</b>（课内既无金、也无水）—— <b>谁也没克谁</b>；',
      '这时才回到 C 法：<b>没有克只有生，土被火生，所以土旺</b>。',
      '<b>一句话记住次序</b>：',
      '<b>不受克 → 多者 → 克他爻 → 受生。</b>',
      '<b>为什么"克他爻"排在"受生"前面？</b> 因为<b>能克别人，说明它有实实在在的作用力</b>；而<b>受生只是"被养着"，力量是别人给的</b>。<b>两强相遇，先取那个出得了手的。</b>',
      '<b>最后强调一句</b>：<b>这四法是判定旺衰的"体例"，本书所有课例的旺衰，都按这四法算过一遍</b> —— <b>与体例不合的个别标注，一律按四法订正。</b>',
      '<b>四、五行之"量"（重要）</b>',
      '<b>4.1 相克受"量"的制约</b>',
      '<b>前面讲过，这里再系统总结</b>：',
      '<b>一个木只能克一个土。</b> 如果课中出现<b>一木三土</b>，那个木根本没有力量去克三个土，只能<b>一对一地算</b>。',
      '<b>但相克的天性仍在</b>：',
      '<b>就像猫抓老鼠是它的天性，猫要是病了，抓不动老鼠，但不代表它不抓老鼠。</b>',
      '<b>反过来</b>：如果那三个土本身已经处在<b>休死</b>的状态，那么被木一克就<b>一触即溃</b>。',
      '<b>4.2 五种"量"的表现</b>',
      '| 现象 | 含义 |',
      '|---|---|',
      '| <b>一木克一土</b> | 正常相克 |',
      '| <b>一木克三土</b> | 力量不够，只能一对一 |',
      '| <b>金多水浊</b> | 金能生水，但金太多，水反而浑 |',
      '| <b>木多金缺</b> | 金能克木，但木太多，金反而受损 |',
      '| <b>土多埋金</b> | 土能生金，但土太多，金反而被埋 |',
      '| <b>水多木漂</b> | 水生木，但水太多，木浮无根 |',
      '| <b>水火不留财</b> | 水火相战，财留不住 |',
      '<b>这些说法的共同点</b>：<b>五行之间不是机械作用，而要看"分量"。</b>',
      '<b>课式实证：一火三土</b>',
      '<code>`</code>',
      '人元：己土 - 旺',
      '贵神：乙未(太常)　土 - 旺',
      '将神：甲午(胜光)用　火 + 休',
      '地分：丑土 - 旺',
      '<code>`</code>',
      '<b>这一课是"一火三土"</b> —— <b>一个午火，三个土</b>。',
      '<b>按"多者为旺"</b> —— <b>土占三位，土旺</b>；<b>火本来是生土的，可土太多，火反倒被泄得没了力气</b> —— <b>所以午火在"休"地</b>。',
      '<b>这就叫"土多火晦"</b> —— <b>火生土是好事，但生的对象太多，自己就熬干了</b>。',
      '<b>落到断语上</b>：<b>求事能成（土旺、用神又是午火）</b>，<b>但过程耗人</b> —— <b>要照顾的方面太多，力气分散</b>。',
      '<b>再看"一木克三土"这一条</b>（教材前面讲过）：<b>一个木去克三个土，只能一对一地算</b> —— <b>不是"木把三个土全克了"</b>。',
      '<b>这两条合起来说的是同一件事</b>：',
      '<b>五行之间不是机械作用，而要看"分量"。</b>',
      '<b>看分量有两层</b>：<b>一看"谁是多数"（定旺衰），二看"力量够不够用"（定能不能真作用上）</b>。<b>多数的一方不一定赢，少数的一方也不一定输</b> —— <b>要看它出的这个手，够不够得着。</b>#### 4.3 凡事有个度',
      '<b>古人用一个很贴切的比喻</b>：',
      '<b>就像一位母亲生孩子，生孩子是好事，可生得太多，母亲的身体也就垮了。</b>',
      '<b>所以断课时遇到多方相克、层层相生的复杂课体</b>，<b>不要急着下断语，先掂一掂各方的分量</b>。',
      '<b>五、旺相休囚死详解</b>',
      '<b>5.1 五个状态的含义</b>',
      '| 状态 | 含义 |',
      '|---|---|',
      '| <b>旺</b> | 生命力旺盛，内力强大，<b>求事有力</b> |',
      '| <b>相</b> | 次旺状态，<b>生命力比较旺盛，内力比较大</b> |',
      '| <b>休</b> | <b>休息、退休，不起作用</b> |',
      '| <b>囚</b> | <b>处于困境，动弹不得，帮不上忙</b> |',
      '| <b>死</b> | <b>处于受克制状态，完全没有主动权</b> |',
      '<b>5.2 一般的主事</b>',
      '<b>一般情况下，旺主官，相主财，休主病，死主死亡无力，囚主困难。</b>',
      '<b>这是"旺衰"与"事情类型"的对应</b>：',
      '<b>旺</b>——事业、权力',
      '<b>相</b>——财',
      '<b>休</b>——病',
      '<b>囚</b>——困难',
      '<b>死</b>——彻底无力',
      '<b>课式实证：一课里凑齐四种状态</b>',
      '<code>`</code>',
      '干支：丙申年　甲午月　庚午日　辛巳时',
      '月将：未　日空：戌、亥　四大空亡：水',
      '人元：壬　　水 + 旺',
      '贵神：戊寅（青龙）用　木 + 相　天德合、天喜、天马',
      '将神：甲申（传送）　金 + 休　驿马、六甲、飞廉',
      '地分：午　　火 + 死　吊客、截路',
      '<code>`</code>',
      '<b>四位正好占了四个不同的状态</b> —— <b>旺、相、休、死</b> —— <b>逐位对上去，每一句断语都能落到实处</b>：',
      '<b>人元壬水"旺"</b> —— <b>旺主官</b>（事业、权力）—— 所以断<b>"工作上有势头、要走动"</b>；',
      '<b>贵神寅木"相"</b> —— <b>相主财</b> —— 所以断<b>"财路是有的"</b>；',
      '<b>将神申金"休"</b> —— <b>休主病</b> —— <b>将神是财爻，财爻处病态</b> —— 所以断<b>"财不大、存不住"</b>；',
      '<b>地分午火"死"</b> —— <b>死主无力</b> —— <b>地分是根基</b> —— 所以断<b>"老本这一头使不上劲"</b>。',
      '<b>四句话拼起来，正是这一课的完整断语</b>：',
      '<b>有工作有势头，财路也有，可财不厚、根基不实 —— 能挣，攒不下。</b>',
      '<b>这就是"旺主官、相主财、休主病、囚主困难、死主无力"这条对应的用处</b> —— <b>它不是让你背五个词，而是让你拿到一个课就有话可说</b>：',
      '<b>先定旺衰，再把每一句对到它该管的那一件事上，断语的骨架就搭起来了。</b>#### 5.3 "休囚"与"空"的区别',
      '<b>这两个概念容易混，要分清</b>：',
      '<b>休囚与空——"有那个象，没那个能力"。</b>',
      '<b>什么意思？</b>',
      '<b>休囚</b>——<b>这个五行还在，但没力气</b>',
      '<b>空</b>——<b>这个五行"落空"了，等于没有</b>',
      '<b>打个比方</b>：',
      '<b>休囚</b>——像一个<b>有病的人</b>，人在，但干不了活',
      '<b>空</b>——像一个<b>不在场的人</b>，根本指望不上',
      '<b>所以</b>：',
      '<b>休囚死空，代表事情的可发展性不高。</b>',
      '<b>但要细分</b>：',
      '<b>旺空</b>——<b>吉事不吉、凶事不凶，可成功一半</b>',
      '<b>休死之空</b>——<b>无可挽回，"扶不起的阿斗"</b>',
      '<b>5.4 旺空与休死空</b>',
      '<b>这是空亡与旺衰结合的重要判断</b>：',
      '<b>旺空</b>：',
      '<b>旺空代表空缺度小，稍微帮忙就能度过难关。所以说旺空成功一半。</b>',
      '<b>为什么？</b> 因为<b>这个五行本身是有力量的</b>，只是暂时"落空"（就像手头一时缺钱）。<b>一旦填实，立刻就能发挥作用。</b>',
      '<b>休死空</b>：',
      '<b>休死代表空缺度太大，别人有心无力，帮不上多少。</b>',
      '<b>休死难成。</b>',
      '<b>为什么？</b> 因为<b>这个五行本身就没力量，又落空</b> ——<b>双重不利，无可挽回。</b>',
      '<b>六、空亡与旺衰的关系</b>',
      '<b>6.1 口诀有例外</b>',
      '<b>这里有一条重要提醒</b>：',
      '<b>口诀有例外，不可死套。</b>',
      '<b>比如"二木为爻求事难"</b> ——<b>但如果二木逢生合，也可能成</b>。',
      '<b>比如"二水皆为大吉象"</b> ——<b>但如果用神空亡，就不一定吉了</b>。',
      '<b>所以</b>：',
      '<b>单纯靠口诀去断课，只能是"观其大意"。</b>',
      '<b>真正要下的功夫，是"五行之内细推元"</b> ——<b>把每一处的生克关系都推清楚。</b>',
      '<b>6.2 空亡的吉凶总则</b>',
      '<b>用神逢空，吉事不吉、凶事不凶。如果用神旺则成事一半。</b>',
      '<b>注意"如果用神旺则成事一半"</b> ——<b>这再次说明旺衰与空亡要合起来看。</b>',
      '---',
      '<b style="color:var(--c-gold)">第三节　四柱的作用</b>',
      '<b>一、四柱是"外环境"</b>',
      '<b>1.1 课内与四柱的关系</b>',
      '<b>前面反复提到"内环境"和"外环境"，这一节系统讲</b>：',
      '<b>课内关系的吉凶只是内环境部分，外环境决定内环境。</b>',
      '<b>课内的吉不一定在课外吉，课内的成不一定在课外成，凶也亦然。</b>',
      '<b>打个比方</b>：',
      '<b>比如你家里是内环境，室外是外环境。冬天家里再暖和也是冬天而不是夏天，你出门还要穿厚外套。</b>',
      '<b>内环境决定不了外环境，但外环境可以决定内环境。</b>',
      '<b>1.2 四柱不是你的"专属力量"</b>',
      '<b>这一点很重要</b>：',
      '<b>四柱是一个独立单位，不是金口诀的专用。</b>',
      '<b>如果我们把金口诀当做一个家庭的话，四柱就是官方机构，行为规范要遵循官方所定。</b>',
      '<b>所以四柱起到规范和行使的决定作用，也起到吉凶成败的作用。</b>',
      '<b>意思</b>：<b>四柱不因为你在起课就"偏向"你</b> ——<b>它是一个客观的"机构"，对谁都一样。</b>',
      '<b>1.3 四柱作用的总结</b>',
      '<b>四柱不单独起作用，只影响课内关系，决成败，助吉凶能量。吉者更吉，凶者更凶。</b>',
      '<b>这四句话要记住</b>：',
      '<b>不单独起作用</b>——不能只看四柱断吉凶',
      '<b>只影响课内关系</b>——它的作用要通过课内体现',
      '<b>决成败、助吉凶能量</b>——它决定"成不成"',
      '<b>吉者更吉，凶者更凶</b>——它是"放大器"',
      '<b>二、四柱的分量级</b>',
      '<b>2.1 四个层级</b>',
      '<b>四柱的四项，分量不同</b>：',
      '<b>太岁等于中央机构，月建是地区机构，日建为地方机构，时辰则等于小区服务。</b>',
      '<b>这个比喻很好懂</b>：',
      '| 四柱 | 比喻 | 作用 |',
      '|---|---|---|',
      '| <b>太岁（年）</b> | 中央机构 | 管得宽、离得远，<b>临太岁者远</b> |',
      '| <b>月建（月）</b> | 地区机构 | <b>事物的实际掌控者</b> |',
      '| <b>日建（日）</b> | 地方机构 | 直接管当下 |',
      '| <b>时辰（时）</b> | 小区服务 | <b>管得最细、范围最小</b> |',
      '<b>2.2 月建最重要</b>',
      '<b>月建为事物的期限用期，是事物的实际掌控者。</b>',
      '<b>为什么月建最重要？</b>',
      '<b>因为月建"管着这一段时间"</b> ——<b>你要办的事，就在这个月里，直接管事的是月建，不是中央。</b>',
      '<b>所以</b>：',
      '<b>在断课时，无论课内关系再好，月建、日令起成败的作用。</b>',
      '<b>比如课内寅午戌火局已定，但恰逢冬令——这就是破局不得令。</b>',
      '<b>2.3 月建的"进气"与"退气"</b>',
      '<b>月建的力量也有变化</b>：',
      '<b>月建的进气与退气——临本家时力量最大。</b>',
      '<b>什么意思？</b>',
      '<b>比如正月是寅月</b>（木旺），那么：',
      '<b>寅木</b>——<b>临本家，力量最大</b>',
      '<b>卯木</b>——<b>同类，也旺</b>',
      '<b>而到了二月（卯月）</b> ——寅木就"退气"了，卯木"进气"',
      '<b>这个"进气退气"在断应期时很有用。</b>',
      '<b>2.4 日建的作用</b>',
      '<b>如果是主一天内的事，则日建作用大，月令作用小。</b>',
      '<b>意思</b>：<b>事情的"时间尺度"决定看哪一柱。</b>',
      '<b>问一天内的事</b>——看<b>日建</b>',
      '<b>问一个月内的事</b>——看<b>月建</b>',
      '<b>问一年以上的事</b>——看<b>太岁</b>',
      '<b>2.5 时辰的作用</b>',
      '<b>时辰的作用虽小，但有一条特别</b>：',
      '<b>只有时辰能论空，也只有时辰能填空。</b>',
      '<b>这是空亡落点上的一条铁律</b>：',
      '<b>月建、日建、太岁都不会空</b> —— 它们不论空亡',
      '<b>只有时辰可以论空</b>',
      '<b>也只有时辰能填实</b> —— <b>日上填空</b>只代表"今日之事"可以起作用；<b>年上、月上都不能来给你填空</b>',
      '<b>为什么年月不能填？</b> 太岁如果也能填空，那课里就永远没有空亡了 —— 今年遇到空就全都不空，还怎么论断？<b>就像一个地方温饱不足，上面不可能挨家挨户下来救急，能救急的只能是离得最近、最了解情况的那一层。</b>',
      '<b>这个道理，一句话就说透了</b>：',
      '<b>远水解不了近渴。</b>',
      '<b>所以断空亡时，就看时辰这一处</b>：时辰逢空，主"没占到天机"，所求之事处于等待或空想状态，大多求事无功；真要救急，也从<b>时辰</b>上填。<b>年月上的字再有力，也解不了眼前这一处的空。</b>',
      '<b>三、吉不逢时</b>',
      '<b>3.1 什么是吉不逢时</b>',
      '<b>课内用神为木旺，恰好在秋季求事，这个时候才能代表用神并非是真旺。这叫吉不逢时。</b>',
      '<b>即</b>：<b>课内关系很好，但时令不合。</b>',
      '<b>打个比方</b>：',
      '<b>就像出门办事，恰逢雨天。我们可以改天再去，或者打伞避雨等方法出门。</b>',
      '<b>3.2 吉不逢时怎么办</b>',
      '<b>但不代表事情不可成，至少能是另选时机。</b>',
      '<b>所以断到"吉不逢时"，不能直接说"不成"</b> ——<b>应该说"时机不到，可以另择时机"。</b>',
      '<b>3.3 不得天时则破局</b>',
      '<b>更严重的一种情况</b>：',
      '<b>比如课内寅午戌火局已定，但恰逢冬令——这就是破局不得令。</b>',
      '<b>"破局"是什么意思？</b> <b>格局被破坏了。</b>',
      '<b>比如寅午戌合火局</b>（火旺），<b>但如果起课在冬天</b>（水旺火死），<b>这个火局就立不起来。</b>',
      '<b>断法</b>：',
      '<b>代表合作遭败，或者近期难以合作。</b>',
      '<b>四、断一日之内的事</b>',
      '<b>有一条实用的变通</b>：',
      '<b>断一日之内的事，不必考虑月建与太岁。</b>',
      '<b>为什么？</b> 因为<b>时间尺度太小，月建太岁的影响还没显现出来。</b>',
      '<b>这时候看什么？</b> <b>看日建、时辰</b>。',
      '<b>这个原则很实用</b> ——<b>断课要看"时间尺度"，不能一概而论。</b>',
      '---',
      '<b style="color:var(--c-gold)">第四节　流年流月的断法</b>',
      '<b>一、金口诀能不能断流年</b>',
      '<b>金口诀能不能断流年？能——原理与断课一样。</b>',
      '<b>很多人以为金口诀只能断具体的事，不能断流年运势</b> ——<b>其实可以。</b>',
      '<b>二、断流年流月的方法</b>',
      '<b>2.1 核心方法：逐个对照</b>',
      '<b>断流年流月，课内三个地支要逐个与太岁、月建、日令对照。</b>',
      '<b>具体做法</b>：',
      '<b>把课内的三个地支逐个与相对应的年月分析变化，再结合课内五行所临的位置，分析出所变化的结果。</b>',
      '<b>比如贵神受克，代表工作受阻；将神受克，代表财运和人身的损害；地分受克，代表固定不动的那部分信息事物出问题。</b>',
      '<b>不能只是简单地分析用神怎么样，因为在分析流年月时，课内的任何信息都是你自身的信息，哪个地支出问题，就代表哪里出了问题。</b>',
      '<b>这样进行综合判断，就是信息的全息论。</b>',
      '<b>2.2 具体步骤</b>',
      '<b>以 2016 年（丙申年）为例</b>：',
      '<b>第一步</b>：看<b>课内的地支</b>与<b>太岁申</b>的关系',
      '<b>申与课内的寅</b>——<b>寅申相冲</b>，主变动、损财',
      '<b>申与课内的巳</b>——<b>巳申相合又相刑</b>，主纠缠',
      '<b>申与课内的子</b>——<b>申子半合水局</b>，主有助',
      '<b>第二步</b>：看<b>每个位置上出问题的地支</b>对应什么事',
      '<b>贵神的地支出问题</b>——工作受阻',
      '<b>将神的地支出问题</b>——财运和人身损害',
      '<b>地分的地支出问题</b>——房子、存款、孩子出问题',
      '<b>第三步</b>：<b>结合月建</b>，看哪个月最明显',
      '<b>太岁所临之月</b>——最厉害',
      '<b>月破之年</b>——今年不顺',
      '<b>2.3 月破与年破</b>',
      '<b>月破与年破——今年不顺，最厉害在太岁所临之月。</b>',
      '<b>什么意思？</b>',
      '<b>如果课内某地支与太岁相破</b> ——<b>今年整体不顺</b>。',
      '<b>最厉害的时候</b>——<b>太岁所临的那个月</b>（也就是太岁对应的月建）。',
      '<b>举例</b>：太岁是申，那么<b>申月（七月）</b> ——<b>最厉害</b>。',
      '<b>三、断流年的实例思路</b>',
      '<b>一个完整的示范</b>：',
      '<code>`</code>',
      '干支：丙申年　甲午月　庚午日　辛巳时',
      '月将：未　日空：戌、亥　四大空亡：水',
      '人元：壬　　水 + 旺',
      '贵神：戊寅（青龙）用　木 + 相　天德合、天喜、天马',
      '将神：甲申（传送）　金 + 休　驿马、六甲、飞廉',
      '地分：午　　火 + 死　吊客、截路',
      '<code>`</code>',
      '<b>问事</b>：一位女士求测事业财运。',
      '<b>第一步：课内旺衰与用神</b>',
      '四位是<b>水、木、金、火</b>，各占一位。<b>金克木、火克金、水克火</b> —— 一路克下来，<b>只有水不受克</b>（课内无土）—— <b>水旺</b>。水旺则<b>木相</b>（水生木）、<b>金休</b>（生金者土不见，此处按"生水者"计）、<b>火死</b>（水克火）。',
      '<b>用神在贵神戊寅</b>（四位壬阳、寅阳、申阳、午阳 —— <b>纯阳课，纯阳以神为用</b>）。',
      '<b>用神在贵神，定性为"以工作求财"</b> —— 所以这一问的落点是：<b>工作能不能带来财</b>。',
      '<b>第二步：课内关系</b>',
      '<b>将神甲申金克贵神戊寅木</b> —— <b>将神克贵神</b> —— <b>这是财动</b> ✓',
      '<b>但财爻是将神申金，正处"休"地</b> —— <b>财本身不算旺</b>',
      '<b>地分午火克将神申金</b> —— <b>地分克将神</b> —— <b>老本这一块在往外消耗</b>',
      '<b>三条合看</b>：<b>财动成立，但财爻不旺、又有内耗</b> —— 主<b>"能挣到，但挣得辛苦、存不下多少"</b>。',
      '<b>第三步：逐个地支与太岁对照</b>',
      '<b>这一课起在丙申年</b> —— <b>太岁是申</b> —— <b>而课内的将神正是甲申</b>。',
      '<b>太岁与课内某支同支</b> —— <b>这是"同气"</b> —— 主<b>这一方面今年在势头上</b>：<b>申是将神（财爻）</b> —— 所以断<b>"今年财运这一块是有机会的"</b>。',
      '<b>再看太岁与课内其他支</b>：<b>太岁申与贵神寅相冲</b>（<b>寅申冲</b>）—— <b>冲主变动</b> —— <b>贵神主工作</b> —— 所以断<b>"今年工作上要有变动"</b>。',
      '<b>第四步：结合月建定时间</b>',
      '<b>月建是午</b> —— <b>午火克将神申金</b> —— <b>月建克财爻</b> —— 所以<b>这个月财上不顺、有耗</b>。',
      '<b>什么时候转？</b> <b>要看月建走到与财爻相生相合的时候</b> —— 比如<b>子月</b>（子与申半合水局）、或<b>巳月</b>（巳与申六合）。',
      '<b>第五步：结合应期法定准确日期</b>',
      '<b>月定到哪个月之后，再用日课的法子往里缩</b>（应期的具体取法见第一章第九节）。',
      '<b>这一课的断语就是这样一层一层落下来的</b> —— <b>旺衰定强弱、关系定吉凶、太岁定年、月建定月、应期定日</b> —— <b>每一步都有依据，不是凭感觉说。</b>',
      '<b>四、日课的断法</b>',
      '<b>断"今天怎么样"</b>：',
      '<b>断一日之内的事，不必考虑月建与太岁。</b>',
      '<b>看日建与时辰就够了。</b>',
      '<b>具体</b>：',
      '<b>日建与课内的关系</b> ——直接影响今天',
      '<b>时辰与课内的关系</b> ——影响当下几个时辰',
      '<b>这也是"时间尺度决定看哪一柱"的道理。</b>',
      '---',
      '<b style="color:var(--c-gold)">本章小结</b>',
      '<b>一、用神</b>',
      '<b>用神是一个课的中心主题、中心点</b> ——四位都是信息，但用神是"纲"。',
      '<b>用神只能落在贵神或将神</b> ——因为人元是"方向"，地分是"根基"，只有二神才是"实际发生地"。',
      '<b>用神在贵神主工作，在将神主财</b>。',
      '<b>取用神五句诀</b>：三阴一阳以阳为用、三阳一阴以阴为用、二阴二阳以将为用、纯阴反阳以将为用、纯阳反阴以神为用。',
      '<b>用神歌</b>：「四为之中用为帅，吉凶成败问三方」。',
      '<b>看用神问四个问题</b>：什么干支、什么五行、什么状态、在哪个位置。',
      '<b>用神旺相求事吉，休囚死空不当强</b>；但<b>用神无力时，要看其他三位对它的作用</b>。',
      '<b>不能只看用神</b>——「我们把四位皆为用神，只是每个用神作用不同」。',
      '<b>二、课内旺衰</b>',
      '<b>定旺衰分课内旺衰与时令旺衰，两者不能混。</b>',
      '<b>课内旺衰以课内五行生克决定，与四柱无关。</b>',
      '<b>四柱是外环境，课内是内环境</b>——「冬天家里再暖和也是冬天」。',
      '<b>判断旺爻四条件</b>：不受克者为旺、克他爻者为旺、受生者为旺、多者为旺。<b>四者冲突时按次序取：不受克 → 多者 → 克他爻 → 受生。</b>',
      '<b>旺生者为相，旺克者为死，生旺者为休，克旺者为囚。</b>',
      '<b>判定次序（四法）</b>：<b>先看不受克 → 并列时比数量 → 再看克他爻 → 最后看受生。</b>',
      '<b>相克受"量"的制约</b>：一木只能克一土，水多则木漂、金多水浊、木多金缺、土多埋金。',
      '<b>旺衰五态</b>：旺（主官）、相（主财）、休（主病）、囚（主困难）、死（主无力）。',
      '<b>休囚与空的区别</b>：<b>休囚是"有那个象，没那个能力"；空是"根本不在了"。</b>',
      '<b>旺空</b>——吉事不吉、凶事不凶，<b>可成功一半</b>；<b>休死之空</b>——<b>无可挽回</b>。',
      '<b>三、四柱的作用</b>',
      '<b>四柱不单独起作用，只影响课内关系，决成败、助吉凶能量，吉者更吉、凶者更凶。</b>',
      '<b>四柱不是你的"专属力量"</b> ——它是一个客观的"官方机构"。',
      '<b>四柱分量级</b>：太岁如中央、月建如地区、日建如地方、时辰如小区。',
      '<b>月建最重要</b>——「月建为事物的期限用期，是事物的实际掌控者」。',
      '<b>月建有进气退气</b>——临本家时力量最大。',
      '<b>时间尺度决定看哪一柱</b>：断一日内的事看日建，断一月内的事看月建，断一年以上的看太岁。',
      '<b>吉不逢时</b>——课内旺但时令不合，<b>不代表不可成，可以另择时机</b>。',
      '<b>不得天时则破局</b>——如寅午戌火局恰逢冬令。',
      '<b>四、流年流月的断法</b>',
      '<b>金口诀能断流年</b> ——原理与断课一样。',
      '<b>核心方法是"逐个对照"</b> ——课内三个地支逐个与太岁、月建对照。',
      '<b>关键是"全息"</b> ——哪个地支出问题，就代表哪里出了问题。',
      '<b>月破与年破</b>——今年不顺，最厉害在太岁所临之月。',
      '<b>断一日内的事不必考虑月建与太岁。</b>',
      '---',
      '<b style="color:var(--c-gold)">心法</b>',
      '<b>先看"来的是谁"，再看"他今天什么状态"</b>',
      '<b>断课的第一步不是"问什么"，而是"谁来了、他今天怎么样"。</b>',
      '<b>这就是用神与旺衰的关系</b>：',
      '<b>用神</b>——"来的是谁"',
      '<b>旺衰</b>——"他今天什么状态"',
      '<b>一个人本事再大，今天病了也办不成事；一个人本事一般，今天状态好也能成事。</b>',
      '<b>所以不能只看用神是什么，还要看它旺不旺。</b>',
      '<b>有克先找克</b>',
      '<b>为什么"克"这么重要？</b>',
      '<b>因为克是矛盾所在。</b>',
      '<b>生活里也一样</b>：',
      '<b>一帆风顺的事，没什么可说的</b>',
      '<b>有矛盾的地方，才是要下功夫的地方</b>',
      '<b>断课找"克"，就是找"问题在哪"。</b>',
      '<b>内环境与外环境</b>',
      '<b>课内是内环境，四柱是外环境。</b>',
      '<b>这个道理在生活里也成立</b>：',
      '<b>你自己的状态再好</b>——如果大环境不好，也难成事',
      '<b>你自己的状态一般</b>——如果赶上好时机，也能做成',
      '<b>所以</b>：',
      '<b>课内好、时令好</b> ——大吉',
      '<b>课内好、时令不好</b> ——"吉不逢时"，等时机',
      '<b>课内不好、时令好</b> ——"绝处逢生"，还有机会',
      '<b>课内不好、时令也不好</b> ——没戏',
      '<b>凡事有个度</b>',
      '<b>一木克一土是正常的，一木克三土就不正常了。</b>',
      '<b>水多木漂、金多水浊、土多埋金</b> ——这些说的都是"过头了"。',
      '<b>生活里也一样</b>：',
      '<b>管孩子是好事，管得太严就出问题</b>',
      '<b>努力工作是好事，拼过头身体就垮了</b>',
      '<b>"度"的把握，是这门学问最难、也最有用的地方。</b>',
    ]},
    { t: '第五章　用神的活用与空亡', rows: [
      '<b style="color:var(--c-gold)">引言</b>',
      '<b>这一章讲什么</b>',
      '上一章讲了用神怎么取、旺衰怎么定。<b>这一章讲两件更细的事</b>：',
      '<b>用神怎么"活用"</b> ——用神只是一个点，不能死盯着它',
      '<b>空亡怎么断</b> ——课里最常见、也最容易断错的一个状态',
      '<b>为什么要专门讲这两件事？</b>',
      '<b>因为初学者最容易在这两处出错。</b>',
      '<b>第一个错</b>：<b>死盯用神</b> ——以为用神好就是一切都好，用神不好就是一切都不好。<b>这是"以偏概全"。</b>',
      '<b>第二个错</b>：<b>见空就断凶</b> ——以为逢空就是坏事。<b>其实空亡的断法很讲究</b>：',
      '<b>凶事逢空，反而不凶</b>',
      '<b>旺空能成一半，休死空才无可挽回</b>',
      '<b>空亡还有五种不同的"空法"</b>（水空则流、金空则响……）',
      '<b>把这两件事弄明白，断课的水平会上一个台阶。</b>',
      '---',
      '<b style="color:var(--c-gold)">第一节　用神再论</b>',
      '<b>一、用神只是一个"点"</b>',
      '<b>1.1 点的比喻</b>',
      '<b>上一章说过用神是"中心点"，这里展开讲</b>：',
      '<b>用神在一个课内是一个点，一个中心点的关系。</b>',
      '<b>"点"这个比喻包含三层意思</b>：',
      '| 特性 | 含义 |',
      '|---|---|',
      '| <b>突出性</b> | 它是课里最突出的那一处 |',
      '| <b>代表性</b> | 它代表事情的可行性与力度 |',
      '| <b>状态性</b> | 它反映当前的状态 |',
      '<b>但"点"也意味着</b>：',
      '<b>用神只代表能量状态与可行性，不代表全部成败。</b>',
      '<b>用神是课体的核心与主帅——休囚死则求事无力。</b>',
      '<b>1.2 用神代表"可行性"</b>',
      '<b>关键要理解"可行性"这三个字</b>：',
      '<b>用神代表自身的时空状态与能力。</b>',
      '<b>用神是一个"点"——代表可行性的力度，不代表全部信息。</b>',
      '<b>打个比方</b>：',
      '<b>你去办事</b> ——<b>用神就像"你自己的状态"</b>：',
      '<b>你状态好</b>（用神旺）——<b>有力量去办</b>',
      '<b>你状态差</b>（用神休囚死）——<b>心有余而力不足</b>',
      '<b>但办事成不成，还要看别的条件</b>：',
      '<b>对方的态度</b>（二神关系）',
      '<b>外部环境</b>（四柱）',
      '<b>有没有人帮</b>（其他干支的生合）',
      '<b>所以用神旺不等于"一定成"，用神弱不等于"一定不成"。</b>',
      '<b>1.3 一个"找勺子"的比喻</b>',
      '<b>用一个比方就能说明这个道理</b>：',
      '<b>用神之外的其余三位，仍在穿插作用。</b>',
      '<b>什么意思？</b>',
      '<b>你要找一把勺子</b> ——<b>勺子（用神）当然重要</b>。但你还要看：<b>在哪个抽屉里（位置）、有没有被别的东西压住（受克）、旁边有没有帮手（生合）。</b>',
      '<b>只看勺子本身，不看环境，是找不到的。</b>',
      '<b>这个比喻说明</b>：<b>用神是"目标物"，但目标的处境决定它能不能发挥作用。</b>',
      '<b>二、用神论的误区</b>',
      '<b>2.1 误区一：只围着用神断</b>',
      '<b>这是最常见的错误</b>：',
      '<b>现在很多断课大多是围绕用神点来看的。这种用神论，只能观察判断片面的吉凶论断，以偏概全，常常答非所问、不能周全。</b>',
      '<b>为什么"以偏概全"？</b>',
      '<b>因为四位都是你的信息</b> ——<b>只看用神，漏掉了另外三位的信息。</b>',
      '<b>有一个更彻底的说法</b>：',
      '<b>在我们的断课体系中没有真正的用神，我们把四位皆为用神，只是每个用神作用不同。</b>',
      '<b>2.2 误区二：以为用神旺就万事大吉</b>',
      '<b>用神旺，只说明"自身条件好"</b> ——<b>但还要看：</b>',
      '<b>有没有受冲克</b> ——<b>用神旺相，但如果受刑冲克害，力量会被消耗</b>',
      '<b>其他干支配不配合</b> ——<b>用神旺 + 其他干支生合 = 畅通无阻</b>',
      '<b>时令合不合</b> ——<b>课内旺但时令不合，就是"吉不逢时"</b>',
      '<b>这里总结一句</b>：',
      '<b>用神旺＋其他干支生合＝畅通无阻；用神死休≠一定无功。</b>',
      '<b>"用神死休≠一定无功"</b> ——<b>这句话很重要</b>。',
      '<b>为什么？</b>',
      '<b>因为</b>：',
      '<b>如果用神处于死休之地，并不能说求事无力无功，那就要分析课内其他五行对其的影响力。</b>',
      '<b>比如用神在将神死休，而贵神旺，正好所求之事是工作方面，还是能绝处逢生——说明自身条件差，但时机有利，还有成的可能。</b>',
      '<b>2.3 误区三：以为用神在贵神就一定是问工作</b>',
      '<b>上一章讲过</b>：用神在贵神，求事大多与工作有关；用神在将神，大多与财有关。',
      '<b>但这是"大多"，不是"一定"</b>：',
      '<b>只是财动就能求财吗？用神位置决定求财方式。</b>',
      '<b>比如做生意，将神为用问工作，大多与财有关；比如花钱求事为工作、为工作破财、以工作或外事得财等。</b>',
      '<b>所以要结合用神的具体内容去判断，不能只看位置。</b>',
      '<b>2.4 用神这一组干支自身的组合吉凶</b>',
      '<b>用神不只是一个地支，它是一组干支</b> ——<b>这一组自身的组合也有吉凶</b>：',
      '| 组合 | 吉凶 |',
      '|---|---|',
      '| <b>天干生地支</b> | <b>吉</b> |',
      '| <b>天干克地支</b> | <b>凶</b> |',
      '| <b>地支生天干</b> | <b>泄</b>（消耗） |',
      '| <b>干支相比</b> | <b>平</b>（比肩，多有不成） |',
      '<b>举例</b>：',
      '<b>甲子</b>——甲木泄子水，<b>外表光鲜、内里耗损</b>',
      '<b>癸巳</b>——癸水克巳火，<b>自我相克</b>，压力大',
      '<b>丁酉</b>——丁火克酉金，<b>自克</b>，主惊恐、内心不安',
      '<b>壬午</b>——壬水克午火，<b>自克自冲</b>，自身状态先乱',
      '<b>所以看到用神，还要看它这一组干支"自己跟自己"是什么关系。</b>',
      '<b>2.5 课式实证：纯阳课为什么用神一定在贵神</b>',
      '<b>"用神在贵神就是问工作"这个说法错在哪，看一个课就清楚了。</b>',
      '<code>`</code>',
      '人元：甲　　木',
      '贵神：甲子（玄武）用　水',
      '将神：丙寅（功曹）　木',
      '地分：戌　　土',
      '<code>`</code>',
      '<b>先数阴阳</b>：',
      '| 位 | 干支 | 阴阳 |',
      '|---|---|---|',
      '| 人元 | 甲 | 阳 |',
      '| 贵神 | 子 | 阳 |',
      '| 将神 | 寅 | 阳 |',
      '| 地分 | 戌 | 阳 |',
      '<b>四位全阳 —— 这是纯阳课。</b>',
      '<b>按定用神的规矩</b>：',
      '<b>纯阳反阴，以神为用。</b>',
      '<b>所以这一课的用神在贵神（甲子水），完全是因为"这是纯阳课"，跟问的是什么事没有一点关系。</b>',
      '<b>这一课可以问任何事</b> —— 问财、问病、问婚姻、问出行。<b>无论问什么，用神都在贵神上。</b> 这就是"<b>用神是课定的，不是事定的</b>"。',
      '<b>所以"用神在贵神就问工作"这句话，把两件事搞混了</b>：',
      '<b>用神在哪一位，是定用神的法则决定的</b>（阴阳配比、将神优先等）',
      '<b>问的是什么事，是由求测者说的话决定的</b>',
      '<b>但两者并不是毫无关系</b> —— <b>用神落在哪一位，本身就是"来意"的直接表达</b>：<b>一个课起出来，用神的位置就标明了所问之事的性质与落点。</b> 所以看到<b>用神在贵神</b>，第一反应就应当是<b>"这一问问的是工作、是上面的事、是公家的事"</b> —— <b>这是必然的指向，不是巧合。</b>',
      '<b>那么"用神在贵神"到底还有什么用？</b>',
      '它有用，但用处不在"猜问什么"，而在<b>"看这一位自身的状态"</b>：',
      '<b>甲子水（用神）在贵神位，水在四位里处于什么旺衰？</b>',
      '<b>它和上下两位（人元甲木、将神丙寅木）是什么关系？</b>',
      '<b>它带什么神煞？</b>',
      '<b>这一课的水，被两个木夹着</b> —— 人元甲木在上、将神丙寅木在下，<b>木多水缩</b>（木要吸水来长）。<b>所以用神虽在旺地，却被两边一路泄气</b> —— <b>力量是足的，路却是往外走的</b>，这是断课要留意的实情。',
      '<b>再看地分</b>：<b>人元甲木克地分戌土</b> —— 木克土，这是<b>妻动</b>。妻动主"我克者为妻财"，也就是<b>自己主动去取</b>。',
      '<b>最后看玄武</b>：<b>玄武主暗昧、主偷、主不光明</b>。玄武落在用神上，说明<b>这件事本身带一点"说不出口"的成分</b>，或者<b>过程中有暗中的因素</b>。',
      '<b>这一课的断法就是</b>：<b>用神在贵神，不代表问工作；真正要看的是用神这一位被夹泄、以及玄武给它带来的暗昧性质。</b>',
      '<b>三、用神落位的门类细分</b>',
      '<b>用神落在贵神或将神，不同门类的断法不同</b>。这一节分门别类讲。',
      '<b>3.1 求财</b>',
      '<b>用神在将神</b>：',
      '<b>用神在将神旺动发动，为"以财求财"。</b>',
      '<b>即</b>：<b>用神在将神且旺而发动</b>——<b>这是"以财求财"</b>，比如做生意、投资。',
      '<b>用神在贵神</b>：',
      '<b>用神在贵神发动，为"辛苦求财"。</b>',
      '<b>即</b>：<b>用神在贵神且发动</b>——<b>这是"辛苦求财"</b>，要靠工作、靠本事挣。',
      '<b>如果贵神是特定的贵神，还可以细分</b>：',
      '<b>勾陈</b>——<b>是非争斗求财</b>',
      '<b>朱雀、腾蛇</b>——<b>文字求财</b>',
      '<b>白虎</b>——<b>奔波求财、是非求财不顺</b>（因为火克金，必定求事不顺，还会有凶灾，<b>这是险中求财</b>）',
      '<b>3.2 求官</b>',
      '<b>用神落在哪一位，决定求官的性质</b>：',
      '<b>问求官，用神在贵神以职求官；用神在将神以财求官、以女人相助求官，或者必定与财相关求官。</b>',
      '<b>即</b>：',
      '<b>用神在贵神</b> ——<b>凭借职务求官</b>（凭真本事）',
      '<b>用神在将神</b> ——<b>靠财、靠女人相助求官</b>',
      '<b>另外</b>：',
      '<b>贵神与月建、太岁六合，一般也是有权职之人。</b>',
      '<b>3.3 求职</b>',
      '<b>求职与求官不同</b>：',
      '<b>求职与求官相类似，也需要具备一些必须的条件。</b>',
      '<b>1. 用神旺相。2. 外生内，内生外。3. 三合、六合。</b>',
      '<b>关键区别</b>：',
      '<b>求职与求官不同的是，求职只关乎成败，不存在损失（当然送礼除外）。</b>',
      '<b>求职最主要条件就是用神旺相——如果逢空、休死，代表自身没有能力求职，或者自身没有能力任职此工作。</b>',
      '<b>还有一条</b>：',
      '<b>求职最忌官动——求职不是谋职。</b>',
      '<b>为什么？</b> 因为<b>官动主诉讼纠纷</b> ——<b>求职是找工作，不是谋取官职，见官动反而不吉。</b>',
      '<b>3.4 婚姻</b>',
      '<b>用神在婚姻中的断法</b>：',
      '<b>用神逢空</b> ——<b>婚前二神逢空，比婚后逢空更重</b>',
      '<b>用神旺相且生合</b> ——婚姻顺',
      '<b>几种特殊组合</b>：',
      '<b>金水相生</b> ——<b>主多情</b>；<b>但逢空则感情不实</b>',
      '<b>"人在曹营心在汉"</b> ——成立条件要看用神的状态',
      '<b>婚后二亥 + 空亡 + 驿马</b> ——<b>主分居</b>',
      '<b>3.5 一个通用原则</b>',
      '<b>看用神，还要看"用神之外的其余三位"</b>：',
      '<b>用神之外的其余三位仍在穿插作用。</b>',
      '<b>具体怎么穿插？</b>',
      '<b>举个例子</b>：',
      '<b>课例：一路下生</b>',
      '<code>`</code>',
      '月建：巳　太岁：辰　日支：子　时支：午',
      '人元：甲　　木 + 旺',
      '贵神：丁巳（腾蛇）　火 - 相　（临月建）',
      '将神：戊辰（天罡）　土 + 死　（临太岁）',
      '地分：乙卯　　木 - 旺　（带驿马）',
      '<code>`</code>',
      '<b>先定旺衰</b>：四位是<b>木、火、土、木</b>。克的关系只有<b>木克土</b> —— 所以<b>木、火都不受克</b>；两者比多少，<b>木占两位</b>，因此<b>木旺</b>。木旺则<b>火相</b>（木生火）、<b>土死</b>（木克土）。',
      '<b>这一课要注意一处分别</b>：四位是<b>甲（阳）、巳（阴）、辰（阳）、卯（阴）</b> —— <b>二阴二阳，按定用神法则应取将神</b>。但这一课是<b>围绕贵神丁巳来讲的</b>，因为<b>问的是工作，重心就落在贵神这一位上</b>。',
      '<b>"用神"和"断课的重心"不完全是一回事。</b> 用神由四位阴阳定出来，是一课的中心点；而<b>重心落在哪一位，还要看问的是什么</b> —— 问工作看贵神，问财看将神。这一课两者恰好不在一处，正好说明这个分别。',
      '<b>贵神丁巳正落在"相"地</b> —— 问工作，这一位旺相，是好事。',
      '<b>这一课的关键在"一路下生"</b>：',
      '<b>人元甲木生贵神丁巳火，丁巳火又生将神戊辰土</b> —— <b>一路往下生</b>。',
      '<b>这叫"贵人有相助"</b> —— 外面的人都来生我，关系很好。<b>工作（火）生财（土）</b>，说明<b>这份工作是能挣到钱的</b>。',
      '<b>再看克</b>：<b>人元甲木又来克将神戊辰土</b> —— <b>克将神就是"对方来索取、来要好处"</b>。<b>但中间隔着丁巳火</b> —— 它得<b>先生火、再克土</b>，<b>隔了一层</b>，所以这份索取<b>要打折扣</b>：',
      '<b>本来想跟你要一百块，最后拿走十块二十块。</b>',
      '<b>这就是"隔手"。</b>',
      '<b>还有一层</b>：<b>时支午、与用神巳、将神辰，构成了"辰巳午连茹"</b>。课里虽然没成三合六合，但<b>时上恰好临了这个连茹</b>，所以主<b>多方求财、合伙求财 —— 不是你一个人单独求财</b>。',
      '<b>所以这一课断下来是</b>：',
      '<b>工作能生财</b>（火生土），外面关系好、有人帮；',
      '<b>但会有人来分好处</b> —— 好在隔着一位，<b>分得不会太狠</b>；',
      '<b>而且是合伙、多方的财</b>，不是一个人的。',
      '<b>这就叫"看整条链"，不是只看一个点。</b>',
      '---',
      '<b style="color:var(--c-gold)">第二节　空亡详断</b>',
      '<b>一、空亡的基本断法</b>',
      '<b>1.1 哪个位置空，就代表哪个位置出问题</b>',
      '<b>这是空亡最重要的断法原则</b>：',
      '<b>哪个位置空，就代表哪个位置出问题。</b>',
      '<b>具体</b>：',
      '| 空亡位置 | 代表什么出问题 |',
      '|---|---|',
      '| <b>用神空</b> | 所求之事本身不落实 |',
      '| <b>人元空</b> | 大方向不明、头脑空白 |',
      '| <b>贵神空</b> | <b>工作不实际、有职无权</b> |',
      '| <b>将神空</b> | <b>手里没钱</b> |',
      '| <b>地分空</b> | <b>没有房子、没有存款</b> |',
      '<b>这就是"全息"原理在空亡上的应用。</b>',
      '<b>1.2 各个位置空亡的具体断语</b>',
      '<b>贵神空</b>：',
      '<b>有职无权</b>',
      '<b>贵神空不实际工作</b>',
      '<b>标志、身份、可行性都不强了</b>',
      '<b>领导不赞成调动</b>（贵神空不生驿马）',
      '<b>将神空</b>：',
      '<b>手里没钱</b>',
      '<b>亥空缺钱</b>（亥为财时）',
      '<b>地分空</b>：',
      '<b>戌空没有实际房子</b>',
      '<b>地分空代表感情基础不牢、学习基础没打好</b>',
      '<b>人元空</b>：',
      '<b>事情还没有落到实处，还不具备操作性</b>',
      '<b>人元逢空代表头脑空白</b>',
      '<b>1.3 空亡的吉凶总则</b>',
      '<b>用神逢空，吉事不吉、凶事不凶。如果用神旺则成事一半。</b>',
      '<b>注意"吉事不吉、凶事不凶"这两句</b>：',
      '<b>吉事逢空</b> ——<b>好事落空了</b>',
      '<b>凶事逢空</b> ——<b>坏事也不成立</b>（这是好事！）',
      '<b>所以断到空亡，要看是吉事还是凶事</b>：',
      '<b>求财逢空</b> ——<b>财落空，得不到</b>',
      '<b>官非逢空</b> ——<b>官司不成，反而无事</b>',
      '<b>二、五行空亡速断</b>',
      '<b>这是空亡断法中最实用的一套</b>：',
      '<b>水空则流，火空则发，木空则损，土空则陷，金空则响。</b>',
      '<b>2.1 水空则流</b>',
      '<b>含义</b>：<b>流失</b>。',
      '<b>具体</b>：',
      '<b>钱财流失</b>',
      '<b>人员流失</b>',
      '<b>计划落空</b>',
      '<b>2.2 火空则发</b>',
      '<b>含义</b>：<b>发火、火灾、伤灾、凋零</b>。',
      '<b>另外</b>：',
      '<b>火空则发——火灾伤灾，也主名气、重面子。</b>',
      '<b>为什么空亡还有"名气"？</b> 因为<b>火主名、主光明</b> ——<b>火虽空，但它"主名"的性子还在</b>。',
      '<b>2.3 木空则损</b>',
      '<b>含义</b>：<b>钱财损失</b>。',
      '<b>寺庙则香火盛</b> ——<b>为什么？</b> 因为<b>木空则"虚"</b>，<b>寺庙本是清虚之地</b>，故主香火盛。',
      '<b>还有一条</b>：',
      '<b>木空则损——乙木为第一财神，寺庙则香火盛。</b>',
      '<b>即</b>：<b>乙木为财，木空则财损。</b>',
      '<b>2.4 土空则陷</b>',
      '<b>含义</b>：<b>做什么事都不顺，或犯小人</b>。',
      '<b>这是最不利的一种空</b>：',
      '<b>土空则陷——最不利的一种空。</b>',
      '<b>具体</b>：',
      '<b>土空见坑塌陷</b>',
      '<b>遭陷害</b>',
      '<b>行移不顺</b>',
      '<b>2.5 金空则响</b>',
      '<b>含义</b>：<b>有名声，但不一定有财</b>。',
      '<b>金空则响——有名声，但不一定有财，因为金空。</b>',
      '<b>这个道理很妙</b>：<b>金空则响</b>——<b>像空心的钟，敲起来反而响</b>。<b>所以金空主名声，但因为是空的，所以没有实质（财）。</b>',
      '<b>另外还有</b>：',
      '<b>金空则鸣。</b>',
      '<b>同一个意思。</b>',
      '<b>三、各种"空"的力度比较</b>',
      '<b>3.1 旺空与休死空</b>',
      '<b>前面讲过，这里系统总结</b>：',
      '| 类型 | 断法 |',
      '|---|---|',
      '| <b>旺空</b> | <b>吉事不吉、凶事不凶，可成功一半</b> |',
      '| <b>相空</b> | 力量次之 |',
      '| <b>休空</b> | 力量弱，难成 |',
      '| <b>死空</b> | <b>无可挽回，"扶不起的阿斗"</b> |',
      '<b>为什么旺空能成一半？</b>',
      '<b>旺空代表空缺度小，稍微帮忙就能度过难关。</b>',
      '<b>如果旬空旺相，临时辰填实，应验大；如果休死，填实也不一定应验。</b>',
      '<b>3.2 婚前与婚后的空</b>',
      '<b>婚前二神逢空，比婚后逢空更重。</b>',
      '<b>为什么？</b>',
      '<b>因为婚前是"还没定"的阶段</b> ——<b>此时逢空，说明关系根本没建立起来。</b>',
      '<b>而婚后逢空</b> ——<b>关系已经建立了，空只是说明"有裂痕"，不一定散。</b>',
      '<b>3.3 先空虚再空亡</b>',
      '<b>有一种很凶的情况</b>：',
      '<b>先空虚再空亡——久病逢空主亡。</b>',
      '<b>什么意思？</b>',
      '<b>如果一个人久病，课中又逢空亡</b> ——<b>这是"由虚到无"的过程，主死亡。</b>',
      '<b>这是一条很重的断语，要谨慎使用。</b>',
      '<b>3.4 空亡 + 驿马</b>',
      '<b>空亡与驿马同现，有特殊含义</b>：',
      '<b>空亡＋驿马＝分居。</b>',
      '<b>即</b>：<b>空亡主"人不在"，驿马主"动"</b> ——<b>两者叠加，主分居、两地。</b>',
      '<b>另外</b>：',
      '<b>四、空亡与应期</b>',
      '<b>4.1 空亡的应期：填实</b>',
      '<b>断空亡的应期，先看可行性 —— "空则填实"。</b>',
      '<b>基本方法</b>：',
      '<b>一般以出空为填实</b>',
      '<b>填实之日出空，填实之时出空</b>',
      '<b>如果旬空旺相，临时辰填实应验大；如果休死，填实也不一定应验</b>',
      '<b>4.2 填空的三种情形</b>',
      '<b>"填空"这个词在不同场合意思不同</b>：',
      '| 说法 | 含义 |',
      '|---|---|',
      '| <b>出空</b> | 过了这一旬，空就自然没了 |',
      '| <b>填实</b> | 遇到那个地支的年月日时，空被"填上" |',
      '| <b>填空</b> | <b>临时辰填实</b>（只有时辰能空） |',
      '<b>关键规定</b>：',
      '<b>只有时辰能空、能填空——日月岁都不空。</b>',
      '<b>4.3 断空亡应期的注意</b>',
      '<b>断空亡的应期，要先看"可行性"</b>：',
      '<b>意思</b>：<b>如果这件事本身就没有可行性（用神休死空），那么谈应期没有意义。</b>',
      '<b>只有"旺空"的情况，填实才有价值</b> ——<b>因为旺空是"暂时缺"，一填就能用。</b>',
      '<b>五、关于"空亡不空"诸说</b>',
      '<b>5.1 各种说法</b>',
      '<b>关于空亡，历代有很多说法</b>：',
      '<b>有说旬空真空假空、动空冲空、墓空绝空等等。还有说旺不为空、动不为空、日时临不空、二空不空等等。还有者说二支空三支空不为空，是大智若愚。</b>',
      '<b>5.2 对这些说法的态度</b>',
      '<b>这些说法有片面性</b>：',
      '<b>如果常人遇之，倒不如说故弄玄虚。</b>',
      '<b>空亡是时空定义下的结果，代表应事人当时所处的时空状态。</b>',
      '<b>比如将神、贵神都逢空，都处于休死状态，就是既没工作又没钱——这两个空难道说他状态很好、很富有？</b>',
      '<b>对于常人而言是一种困境，对于出家人而言属于常态，不感觉是困难。所以不能一概而论，"二空不为空"没有说服力。</b>',
      '<b>5.3 处理办法</b>',
      '<b>实用的处理办法是</b>：',
      '<b>填实（出空）可以借鉴</b> ——这符合"空则填实"的道理',
      '<b>"两个空不为空"不予借鉴</b> ——因为它不符合实际',
      '<b>5.4 五行空亡的补充</b>',
      '<b>前面讲了五行空亡速断，这里补充几条</b>：',
      '<b>火的另一面</b>：',
      '<b>火空则发——火灾伤灾，也主名气、重面子。</b>',
      '<b>土是最不利的</b>：',
      '<b>土空则陷——最不利的一种空。</b>',
      '<b>金空主名</b>：',
      '<b>金空则响——有名声，但不一定有财。</b>',
      '---',
      '<b style="color:var(--c-gold)">第三节　用神逢空的实际运用</b>',
      '<b>一、求财中的用神逢空</b>',
      '<b>1.1 财动逢空的三种情形</b>',
      '<b>这是最实用的一组判断</b>：',
      '<b>情形一：将神空亡又休死，发动</b>',
      '<b>财动逢空之一：将神空亡、又休死发动 —— 主"不得反破"。</b>',
      '<b>为什么"不得反破"？</b>',
      '<b>因为</b>：<b>自身有求财条件，而自身能力不足，硬去求财——结果是白白投入，不得回报。</b>',
      '<b>这种情况的财动，就会"不得反失"。</b>',
      '<b>情形二：贵神空亡，将神旺动</b>',
      '<b>财动逢空之二：贵神空亡、将神旺动 —— 主"只丢机会、不损财"。</b>',
      '<b>为什么？</b>',
      '<b>因为</b>：<b>贵神空亡是"对方（或工作）不实"</b> ——<b>所以是空动，如果是旺动，还有求财的机会，只是需要时机。</b>',
      '<b>但如果是只问此次求财，则是无财可求。</b>',
      '<b>这样的求财损失不会大。</b>',
      '<b>情形三：二神俱空</b>',
      '<b>财动逢空之三：二神俱空 —— 主"空手套白狼"、虚假求财。</b>',
      '<b>为什么？</b>',
      '<b>因为</b>：<b>二神都空，属于"空手套白狼"的求财，属于虚假求财——适合中介工作，但一般情况下是不能得财的。</b>',
      '<b>这里总结一句</b>：',
      '<b>二神逢空求事稀松，这样的求财有幻想成分。</b>',
      '<b>1.3 课式实证：将神逢空又发动</b>',
      '<code>`</code>',
      '干支：乙未年　壬午月　癸亥日　癸亥时',
      '月将：未　日空：子、丑　四大空亡：金',
      '人元：丙　　火 + 休　月德',
      '贵神：丁巳（腾蛇）用　火 - 休　天医、驿马、吊客、六丁',
      '将神：壬子（神后）　水 + 死　丧车',
      '地分：辰　　土 + 旺',
      '<code>`</code>',
      '<b>先看三样东西</b>：',
      '<b>日空是子、丑</b> —— <b>课内将神正是壬子</b> —— <b>将神逢空</b> ✓',
      '<b>将神壬子水在"死"地</b>（辰土旺克水）—— <b>空且休死</b> ✓',
      '<b>将神壬子水克贵神丁巳火</b> —— <b>将神克贵神</b> —— <b>这是财动</b> ✓',
      '<b>三条凑齐</b> —— <b>正是"情形一：将神空亡、又休死发动"</b> —— 主<b>"不得反破"</b>。',
      '<b>为什么？</b> <b>自身有求财的念头（财动成立），可本钱那一头是空的、又是死气</b>（将神既主自己，也主本钱）—— <b>硬去做，就是投进去收不回来</b>。',
      '<b>这一课问的其实是病，不是财</b> —— 但<b>关系是同一个关系</b>：<b>将神空死又发动</b>。<b>问财，就是"投入收不回"；问病，就是"用药不见效、力气使不上"</b> —— 该课断的正是"<b>需慢慢调</b>"，取的还是这个"<b>使不上劲</b>"的象。',
      '<b>这就是"课内关系不变、取象跟着问题走"</b> —— <b>也是为什么同一组空亡，能在不同的门类里说出不同的话。</b>',
      '<b>1.2 用神也是求财的条件</b>',
      '<b>除了四条件（财动、财爻旺相、外生内、青龙旺）之外，还有一条</b>：',
      '<b>用神也是求财的条件。</b>',
      '<b>因为</b>：<b>用神代表"自己有没有能力求财"</b> ——<b>用神休囚死空，则有心无力。</b>',
      '<b>二、婚姻中的用神逢空</b>',
      '<b>2.1 未婚课的三处空亡</b>',
      '<b>未婚课看三处</b>：',
      '<b>未婚课要看三处空：用神空、人元空、贵神空。</b>',
      '<b>逐条</b>：',
      '<b>用神空</b> ——<b>所求之事不落实</b>（感情没着落）',
      '<b>人元空</b> ——<b>对方（男方）态度不明</b>',
      '<b>贵神空</b> ——<b>工作、外部条件不实</b>',
      '<b>2.2 婚后逢空</b>',
      '<b>婚后逢空</b>：',
      '<b>婚后二神逢空</b> ——<b>婚姻虚假，或者分居</b>',
      '<b>逢空 + 驿马</b> ——<b>一方不在家</b>',
      '<b>没有克害刑冲，只是空</b> ——<b>婚姻虚假</b>（有名无实）',
      '<b>有不良关系又空</b> ——<b>婚姻有名无实</b>（更严重）',
      '<b>2.3 一个具体的例子</b>',
      '<b>课例</b>：',
      '<code>`</code>',
      '干支：乙未年　壬午月　癸亥日　癸亥时',
      '月将：未　日空：子、丑　四大空亡：金',
      '人元：丙　　火 + 休　月德',
      '贵神：丁巳（腾蛇）用　火 - 休　天医、驿马、吊客、六丁',
      '将神：壬子（神后）　水 + 死　丧车',
      '地分：辰　　土 + 旺',
      '<code>`</code>',
      '<b>这一课的水是"多情"的底子</b> —— <b>将神壬子水</b>，<b>水主智、主情</b>；<b>人元、贵神两个火</b> —— <b>水火相见，本来是"有情"的象</b>。',
      '<b>但将神壬子正逢旬空</b>（日空子、丑）—— <b>水逢空</b> —— <b>这一份"情"就落不到实处</b>：',
      '<b>金水相生主多情，逢空则感情不实。</b>',
      '<b>再往下看一层</b>：<b>将神壬子既空又处"死"地</b>（辰土旺克水）—— <b>空而无气</b> —— 所以<b>不是"暂时没着落"，是"这一段本来就没有根基"</b>。',
      '<b>断感情，就是"看着热络、其实不落地"</b> —— <b>有名无实，或者对方根本没打算认真</b>。',
      '<b>这一课若问财</b> —— <b>同一个"将神空死又发动"</b>，断的就是<b>"投进去收不回来"</b>（详见第三节 1.3）。<b>关系是同一个，取象跟着问题走。</b>',
      '<b>所以同样的组合，逢空与不逢空，结果完全不同。</b>',
      '<b>三、其他门类中的用神逢空</b>',
      '<b>3.1 求官</b>',
      '<b>贵神逢空</b> ——<b>有职无权</b>',
      '<b>官爻逢空</b> ——<b>主无官或有名无实之官</b>',
      '<b>官动逢空</b> ——<b>不得官，空欢喜一场</b>',
      '<b>课式实证</b>：<b>官动逢空</b>的完整例子见第十二章第二节第九、十小节 —— 那一课演示了"官动逢空主不得官、空欢喜一场"怎么落到具体断语上。',
      '<b>3.2 断病</b>',
      '<b>先空虚再空亡</b> ——<b>久病逢空主亡</b>',
      '<b>用神空亡</b> ——<b>吉凶不应</b>（因为事情本身不落实）',
      '<b>课式实证</b>：<b>用神空亡、吉凶不应</b>的例子见第十一章第四节第十小节 —— 那一课用神受伤、天医在位，断的是"病要重视、但有救"。<b>注意</b>：断病只断轻重与能不能治，<b>不断生死</b>。',
      '<b>3.3 打斗、官非</b>',
      '<b>辰戌冲为打斗，但戌空不严重</b>',
      '<b>妻动逢空、官动逢空</b> ——<b>不会有麻烦缠身</b>',
      '<b>课式实证</b>：<b>妻动逢空、官动逢空不会有麻烦缠身</b>，可在第十三章课例四（断官司）里对照 —— 那一课贵神午火正逢旬空（甲申旬空午未），<b>官非虽起，却断"不会输掉"</b>，取的正是"动而逢空、力量落不下来"这个象。',
      '<b>3.4 房产</b>',
      '<b>戌空没有实际房子</b>',
      '<b>地分空</b> ——<b>没有房子、没有存款</b>',
      '<b>四、用神断课的完整步骤</b>',
      '<b>把这一章的内容串起来，用神断课有这么几步</b>：',
      '<b>第一步：定用神</b> ——按阴阳取用神，确定落在贵神或将神。',
      '<b>第二步：判用神旺衰</b> ——用四个条件定旺衰，看它是旺、相、休、囚、死。',
      '<b>第三步：看用神自身组合</b> ——这一组干支是天干生地支、克地支，还是地支生天干？',
      '<b>第四步：看用神是否逢空</b> ——空在哪一处，哪一处就出问题；还要看是旺空还是休死空。',
      '<b>第五步：看其他三位对用神的作用</b> ——谁在生它、谁在克它。',
      '<b>第六步：看用神落位的门类</b> ——在贵神主工作，在将神主财；再结合所问之事细分。',
      '<b>第七步：结合四柱定应期</b> ——课内旺衰定"能不能成"，四柱定"什么时候成"。',
      '<b>这七步走完，一个课的轮廓就完整了。</b>',
      '---',
      '<b>五、课式实证：将神逢空、用神不空</b>',
      '<code>`</code>',
      '干支：乙未年　壬午月　癸亥日　癸亥时',
      '月将：未　日空：子、丑　四大空亡：金',
      '人元：丙　　火 + 休　月德',
      '贵神：丁巳（腾蛇）用　火 - 休　天医、驿马、吊客、六丁',
      '将神：壬子（神后）　水 + 死　丧车',
      '地分：辰　　土 + 旺',
      '<code>`</code>',
      '<b>这一课的日空是"子、丑"</b> —— 而<b>将神正是壬子</b>。',
      '<b>所以：将神逢空，而且是"休死之空"</b>（壬子水在课内正处"死"地）。',
      '<b>先把"空"的三种力度摆出来对照</b>：',
      '| 类型 | 含义 |',
      '|---|---|',
      '| <b>旺空</b> | 用神旺而逢空 —— <b>有想法、有能力，但一时落不到实处</b> |',
      '| <b>休死空</b> | 用神休死又逢空 —— <b>这才是"真没办法"</b> |',
      '| <b>空 + 驿马</b> | 用神空又带驿马 —— 主<b>分居、人不在</b> |',
      '<b>这一课是第二种：休死之空。</b>',
      '<b>休死之空主什么？</b>',
      '<b>"扶不起的阿斗"</b> —— <b>自己想动也没有力量，外面想帮也无从下手。</b>',
      '<b>再看这一课的具体情形</b>：',
      '<b>将神壬子水本身处"死"</b>（土旺，土克水）；',
      '<b>又逢日空</b>；',
      '<b>它还要去克贵神丁巳火</b> —— 这是<b>财动</b>：<b>一个又死又空的水，去克火</b>。',
      '<b>这就是"财动逢空"里最重的一种</b>：',
      '<b>将神空亡、又休死发动 —— 主"不得反破"。</b>',
      '<b>为什么叫"不得反破"？</b> 因为<b>你是把本钱投出去</b>（将神克贵神，是用本钱去博外财），<b>可本钱本身就是虚的</b> —— <b>不但得不到，反而折了老本</b>。',
      '<b>还有一层要看</b>：<b>地分辰土是旺的</b>。',
      '<b>地分是"固定财产、存款、老本"。</b>',
      '<b>地分旺，说明"老本还在"</b> —— 所以<b>虽然这场投资要亏，但不至于伤筋动骨</b>。',
      '<b>这就是"用神逢空"的断法要诀，三步</b>：',
      '<b>一看空在哪一位</b> —— 用神空、贵神空、还是地分空；',
      '<b>二看空得实不实</b> —— 旺空，还是休死空；',
      '<b>三看有没有救</b> —— 地分能不能生将神、用神有没有同类相帮。',
      '<b style="color:var(--c-gold)">本章小结</b>',
      '<b>一、用神只是一个"点"</b>',
      '<b>用神有突出性、代表性、状态性，但不代表全面性。</b>',
      '<b>用神代表"可行性"</b> ——<b>代表自身的时空状态与能力</b>。',
      '<b>用神之外的其余三位仍在穿插作用</b> ——就像"找勺子"，要看目标的处境。',
      '<b>用神旺＋其他干支生合＝畅通无阻；用神死休≠一定无功</b>（要看其他三位的影响力）。',
      '<b>二、用神论的误区</b>',
      '<b>误区一：只围着用神断</b> ——「以偏概全，常常答非所问、不能周全」。',
      '<b>误区二：以为用神旺就万事大吉</b> ——还要看有没有受冲克、其他干支配不配合、时令合不合。',
      '<b>误区三：以为用神在贵神就一定问工作</b> ——这是"大多"，不是"一定"。',
      '<b>用神这一组干支自身的组合也有吉凶</b>：天干生地支为吉，天干克地支为凶，地支生天干为泄。',
      '<b>三、用神落位的门类细分</b>',
      '<b>求财</b>：用神在将神旺动为"以财求财"；在贵神发动为"辛苦求财"；按贵神细分（勾陈是非争斗、朱雀腾蛇文字、白虎奔波险中求财）。',
      '<b>求官</b>：用神在贵神以职求官；在将神以财求官、以女人相助求官。',
      '<b>求职</b>：三条件（用神旺相、外生内生、三合六合）；<b>求职只关乎成败，不存在损失</b>；<b>求职最忌官动</b>。',
      '<b>婚姻</b>：婚前二神逢空比婚后更重；金水相生主多情，逢空则感情不实；空亡＋驿马主分居。',
      '<b>四、空亡详断</b>',
      '<b>哪个位置空，就代表哪个位置出问题</b>（全息原理）。',
      '<b>贵神空</b>——有职无权、工作不实际；<b>将神空</b>——手里没钱；<b>地分空</b>——没有房子没有存款；<b>人元空</b>——头脑空白、事情不落实。',
      '<b>空亡总则</b>：<b>用神逢空，吉事不吉、凶事不凶；如果用神旺则成事一半。</b>',
      '<b>五行空亡速断</b>：<b>水空则流</b>（流失）、<b>火空则发</b>（火灾伤灾，也主名气）、<b>木空则损</b>（钱财损失，寺庙香火盛）、<b>土空则陷</b>（最不利，犯小人）、<b>金空则响</b>（有名声但不一定有财）。',
      '<b>空的力度</b>：旺空可成一半；相空次之；休空难成；<b>死空无可挽回</b>。',
      '<b>先空虚再空亡——久病逢空主亡。</b>',
      '<b>五、空亡与应期</b>',
      '<b>先看可行性，"空则填实"。</b>',
      '<b>出空、填实、填空</b>三词的区别：出空是过了这一旬，填实是遇到那个地支，填空是临时辰填实。',
      '<b>只有时辰能空、能填空。</b>',
      '<b>六、关于"空亡不空"诸说</b>',
      '<b>"二空不为空""旺不为空"等说法有片面性</b> ——空亡是时空定义下的结果。',
      '<b>处理办法</b>：<b>填实（出空）可以借鉴，"两个空不为空"不予借鉴。</b>',
      '<b>七、财动逢空的三种情形</b>',
      '<b>将神空亡又休死发动</b> ——<b>不得反破</b>。',
      '<b>贵神空亡、将神旺动</b> ——<b>只丢机会不损财</b>。',
      '<b>二神俱空</b> ——<b>空手套白狼、虚假求财</b>，适合中介，一般不能得财。',
      '---',
      '<b style="color:var(--c-gold)">心法</b>',
      '<b>课式实证</b>：<b>地分空主没有房子、没有存款</b> —— 地分是家宅、根基、存款之位，<b>这一位空，对应的就是这些"看得见摸得着的东西"落空</b>。<b>查法</b>：先看日空落在哪两个支上，再看地分是不是其中之一；<b>是，就按"这一块没有"断</b>。',
      '<b>用神是"你"，不是"事"</b>',
      '<b>用神代表的是"你自己的状态"，不是"事情的结果"。</b>',
      '<b>这个区分很重要</b>：',
      '<b>你状态好，事不一定成</b>——还要看对方、看时机',
      '<b>你状态差，事不一定不成</b>——如果对方配合、时机有利，也能成',
      '<b>这句话说得好</b>：',
      '<b>用神旺＋其他干支生合＝畅通无阻；用神死休≠一定无功。</b>',
      '<b>所以看到用神不好，不要急着下"不成"的结论</b> ——<b>要往下看，看有没有转机。</b>',
      '<b>空亡不等于凶</b>',
      '<b>很多人一见空亡就断凶，这是误解。</b>',
      '<b>"凶事不凶"</b> ——<b>坏事逢空，反而落空了，是好事。</b>',
      '<b>断到空亡，先要问三个问题</b>：',
      '<b>是吉事还是凶事</b>——吉事逢空才可惜，凶事逢空是幸事',
      '<b>是旺空还是休死空</b>——旺空能成一半，休死空才无可挽回',
      '<b>是什么五行空</b>——水空则流，火空则发，木空则损，土空则陷，金空则响',
      '<b>三个问题答完，空亡的吉凶就清楚了。</b>',
      '<b>"二空不为空"没有说服力</b>',
      '<b>有一种说法是"两个位置都空就不算空"。</b>',
      '<b>这个说法不符合实际</b>：',
      '<b>比如将神、贵神都逢空，都处于休死状态，就是既没工作又没钱——这两个空难道说他状态很好、很富有？</b>',
      '<b>当然不是</b> ——<b>两个空，是双重困境。</b>',
      '<b>所以遇到这类"口诀式的变通"，要想想它背后的道理站不站得住。</b>',
      '<b>这也是一句很重要的话</b>：',
      '<b>对于常人而言是一种困境，对于出家人而言属于常态，不感觉是困难。</b>',
      '<b>所以不能一概而论。</b>',
      '<b>同样一个"空"，对不同的人意义不同</b> ——<b>断课要看具体的人和事，不能机械套用。</b>',
    ]},
    { t: '第六章　五动三动', rows: [
      '<b style="color:var(--c-gold)">引言</b>',
      '<b>这一章讲什么</b>',
      '前面几章讲了<b>课怎么起</b>、<b>位置代表什么</b>、<b>用神和旺衰怎么定</b>。',
      '<b>这一章讲"动"。</b>',
      '课起出来之后，四位之间会有生克关系。<b>其中某些特定的生克组合，就叫"动"</b> ——它们代表事情<b>正在发生</b>、<b>有明确的动向</b>。',
      '<b>和上一章的分工，可以这样记</b>：',
      '<b>第五章看"点"</b> —— <b>用神落在哪一位、旺不旺、逢不逢空</b>；',
      '<b>第六章看"关系"</b> —— <b>四位之间谁克谁、谁生谁、谁跟谁同类</b>。',
      '<b>点是"状态"，关系是"动向"</b> —— <b>状态好而动向差，事情也成不了；两样合起来，课的骨架才算搭全。</b>',
      '<b>最常用的有八种</b>：',
      '<b>五动</b>：妻动、官动、贼动、财动、鬼动',
      '<b>三动</b>：父母动、子孙动、兄弟动',
      '<b>为什么"动"最重要</b>',
      '<b>本门有一句重话</b>：',
      '<b>学金口诀而不会五动三动，等于没学。</b>',
      '<b>还有</b>：',
      '<b>金口诀学到高层是不用看五动三动的——实则不然。</b>',
      '<b>因为到了高层，我们已经熟悉到不用专门去找五动三动，就像我们已经会奔跑，而不再去注意怎么迈第一步。但习惯性的怎么迈第一步，已经成了规律性的过程。</b>',
      '<b>所以"不用看"是"不用专门找"，不是"不需要"。</b>',
      '<b>五动三动的作用是什么？</b>',
      '<b>五动三动是金口诀的杀手锏，像孙悟空的火眼金睛。课体一出，我们根据五动三动的出现，立即就能判断所问事情的性质与吉凶。</b>',
      '<b>这就是金口诀的速断法门。</b>',
      '<b>它快在哪里？</b>',
      '<b>因为"动"是已经显现出来的动向</b> —— <b>不用你分析半天，看到某个组合，立刻就知道大方向</b>。',
      '<b>金口诀在江湖上有个名号叫"拴马桩"</b> ——<b>课体一出，先定性质吉凶。</b> 靠的就是五动三动。',
      '<b>五动三动与其他步骤的关系</b>',
      '<b>入式歌里有一句</b>：',
      '<b>凡占课，入式歌言其大象，五动爻观其大意，以格局看其事体，凭驿马、神煞定其吉凶，以空亡、月破、支干三合、六合验其成败。</b>',
      '<b>看这句话的层次</b>：',
      '| 步骤 | 作用 |',
      '|---|---|',
      '| <b>入式歌</b> | 言其<b>大象</b> |',
      '| <b>五动三动</b> | 观其<b>大意</b> |',
      '| <b>格局</b> | 看<b>事体</b> |',
      '| <b>驿马神煞</b> | 定<b>吉凶</b> |',
      '| <b>空亡月破合</b> | 验<b>成败</b> |',
      '<b>五动三动是第二步</b> ——<b>它给出的是"大意"，是粗略的方向。</b>',
      '<b>它的定位很清楚</b>：',
      '<b>五动三动是粗枝末叶，能观其形断其意。再进一步深入就是细节与趋势——那就是"五行之内细推元"阶段。</b>',
      '<b>所以五动三动是"粗断"</b> ——<b>但这一步不能省，因为它定方向。</b>',
      '---',
      '<b style="color:var(--c-gold)">第一节　总论</b>',
      '<b>一、五动三动的名目</b>',
      '<b>1.1 八动的定义</b>',
      '<b>用六亲关系定位</b>（以人元为我，看其他位置与我的关系）：',
      '<b>以克我者为官鬼，我克者为妻财，生我者为父母，我生者为子孙，同性者为兄弟。</b>',
      '<b>据此定义八动</b>：',
      '| 动名 | 组合 | 关系 |',
      '|---|---|---|',
      '| <b>妻动</b> | <b>干克方</b>（人元克地分） | 我克者为妻财，<b>耗我者为妻财</b> |',
      '| <b>鬼动</b> | <b>方克干</b>（地分克人元） | 克我者为官鬼，<b>地分代表卑微身份，故为鬼不为官</b> |',
      '| <b>官动</b> | <b>神克干</b>（贵神克人元） | 克我者为官鬼，<b>神为尊贵之位，故为官不为鬼</b> |',
      '| <b>子孙动</b> | <b>干生方</b>（人元生地分） | 我生者为子孙 |',
      '| <b>父母动</b> | <b>方生干</b>（地分生人元） | 生我者为父母 |',
      '| <b>兄弟动</b> | <b>干方比</b>（人元与地分同五行） | 五行相比者为兄弟 |',
      '| <b>贼动</b> | <b>神克将</b>（贵神克将神） | 课内地支之间的关系 |',
      '| <b>财动</b> | <b>将克神</b>（将神克贵神） | 课内地支之间的关系 |',
      '<b>注意分类</b>：',
      '<b>前六个</b>（妻动、鬼动、官动、子孙动、父母动、兄弟动）——<b>是"干"与"方"或"神"与"干"的关系</b>',
      '<b>后两个</b>（贼动、财动）——<b>是课内地支（贵神与将神）之间的关系</b>',
      '<b>1.2 为什么这样命名</b>',
      '<b>这里有两个"为什么"要讲清楚</b>。',
      '<b>为什么人元克地分叫"妻动"？</b>',
      '因为<b>古代男尊女卑，上为男、下为女</b>：',
      '<b>人元在上</b>——代表男方',
      '<b>地分在下</b>——代表女方',
      '<b>上克下</b>——<b>男方压制女方</b>，所以叫"妻动"',
      '<b>为什么地分克人元叫"鬼动"，而贵神克人元叫"官动"？</b>',
      '<b>因为同样都是"克我"，但克我的"身份"不同</b>：',
      '<b>贵神在尊贵的位置</b>——它克我，是"上级管下级"，<b>所以为"官"不为"鬼"</b>',
      '<b>地分在卑微的位置</b>——它克我，是"下属犯上"，<b>所以为"鬼"不为"官"</b>',
      '<b>这个区分很重要</b>：',
      '<b>官动</b>——<b>多半是我方有理</b>（上级管我是正常的）',
      '<b>鬼动</b>——<b>主怪异之事、越级犯上</b>',
      '<b>1.3 五动与三动的分界</b>',
      '<b>八动里哪五个是"五动"，哪三个是"三动"？</b>',
      '<b>五动：妻动、官动、贼动、财动、鬼动。</b>',
      '<b>三动：父母动、子孙动、兄弟动。</b>',
      '<b>为什么这样分？</b>',
      '<b>从名字就能看出来</b>：',
      '<b>五动</b>——<b>都带"动"字且都有明确的人事含义</b>（妻、官、贼、财、鬼），代表<b>具体的事</b>',
      '<b>三动</b>——<b>是六亲关系</b>（父母、子孙、兄弟），代表<b>人事关系的三种基本类型</b>',
      '<b>从力度上看</b>：',
      '<b>五动是"发用之门"</b> ——<b>不识五动，不知发用之门</b>',
      '<b>三动相对温和</b> ——父母动大吉、子孙动小吉、兄弟动小凶',
      '<b>二、五动三动一览表</b>',
      '| 动名 | 关系 | 吉凶 | 主要断语 |',
      '|---|---|---|---|',
      '| <b>妻动</b> | 人元克地分 | <b>凶</b>（我方有损） | 破财、孩子有灾、外来索取 |',
      '| <b>官动</b> | 贵神克人元 | <b>中性</b>（有官吉，无官凶） | 有官利求官，无官主诉讼 |',
      '| <b>贼动</b> | 贵神克将神 | <b>凶</b> | <b>损财</b>、失盗、婚姻有外情 |',
      '| <b>财动</b> | 将神克贵神 | <b>吉</b> | <b>必有财</b> |',
      '| <b>鬼动</b> | 地分克人元 | <b>半吉半凶</b> | 灾怪、出外、争讼、宜官迁 |',
      '| <b>父母动</b> | 地分生人元 | <b>大吉</b> | 印绶动、文书喜庆、正直 |',
      '| <b>子孙动</b> | 人元生地分 | <b>小吉</b> | 得财之相、添人进口 |',
      '| <b>兄弟动</b> | 人元与地分同 | <b>小凶</b> | 争执不合、事在比肩多有不成 |',
      '---',
      '<b style="color:var(--c-gold)">第二节　五动</b>',
      '<b>一、妻动（人元克地分）</b>',
      '<b>1.1 口诀</b>',
      '<b>妻动于妻妾，官财防损折。占人人在家，访人人不见。</b>',
      '<b>外旁来索取，卑下有口舌。论物多翻正，下旁或有缺。</b>',
      '<b>1.2 逐句解释</b>',
      '<b>"妻动于妻妾"</b>',
      '<b>占事主于妻妾</b>',
      '<b>问婚姻</b>——主有不成之象，<b>男方有意见</b>',
      '<b>古代男尊女卑，上为男下为女</b>，所以是"男嫌弃女"',
      '<b>"官财防损折"</b>',
      '<b>有官求财不利，必有损折</b>',
      '<b>问求财不成</b>——因地分是副财爻，故有<b>失田宅、失财物</b>之说',
      '<b>"占人人在家"</b>',
      '<b>上克下，寻人在家</b>',
      '<b>因为地分受克无力逃脱</b>',
      '<b>"访人人不见"</b>',
      '<b>上隔克下，行必有阻</b>',
      '<b>人虽在家，却见不着面</b> —— 或<b>主人心里不痛快、不愿接待</b>',
      '<b>"外旁来索取"</b>',
      '<b>外来克内，必有人来取索</b>',
      '或<b>干预于我</b>，或有<b>外人来诉讼、争物</b>等',
      '<b>"卑下有口舌"</b>',
      '<b>卑下受克，须防口舌外来</b>',
      '<b>"论物多翻正"</b>',
      '<b>射覆上克下，论物以翻为正</b>',
      '<b>"下旁或有缺"</b>',
      '<b>下受克，物器旁有缺，或无足</b>',
      '<b>1.3 妻动的机制</b>',
      '<b>妻动是"隔位相克"</b>：',
      '<b>妻动为隔位相克，中间隔着二神，就要看二神是支持人元克地分，还是阻止其克地分</b>，来分析判断所损的力度。',
      '<b>三种情况</b>：',
      '| 二神的态度 | 结果 |',
      '|---|---|',
      '| <b>二神反克（阻止）</b> | <b>妻动力量减小</b> |',
      '| <b>二神生助人元</b> | <b>妻动力度加强</b> |',
      '| <b>一方支持、一方阻止</b> | 需细致分析 |',
      '<b>力量互减的具体情形</b>：',
      '<b>如果妻动再同时官动，那么妻动的力量肯定要减小；如果再发生将神克人元，妻动的力量更是减小。</b>',
      '<b>二力抵一力，妻动的力量几乎没有了。这样妻动的作用只能体现在一种形式阶段。如俗话讲的"雷声大雨点小"，或者有雷声不见雨的情况。</b>',
      '<b>所以</b>：',
      '<b>单纯的靠口诀去断课，只能是"观其大意"了。</b>',
      '<b>1.4 妻动的深层含义</b>',
      '<b>妻动还有一层</b>：',
      '<b>人元克地分，人来克我，一个是破财，一个是孩子有灾，再就是借钱。</b>',
      '<b>人能抛开，财抛不了，所以人元克地分还是会破财——但是这个破财破的是老本，损失会小些，毕竟中间隔着二层关系。</b>',
      '<b>用在婚姻上</b>：',
      '<b>妻动必定人嫌我</b> ——<b>对方对我有意见</b>',
      '<b>有动先看动</b> ——看到"动"先分析它',
      '<b>用在地分取象上</b>：',
      '<b>地分代表的是房子、存款、孩子等相对固定的部分，我们常把地分当做副财星。当地分受克时，就会对应这些部分的损失。</b>',
      '<b>1.5 课式实证</b>',
      '<code>`</code>',
      '人元：丙　　火',
      '贵神：癸未（太常）用　土',
      '将神：丙子（神后）　水',
      '地分：申　　金',
      '<code>`</code>',
      '<b>这一课里有两个动同时发生</b>，正好用来说明"一动之外还有一动"：',
      '<b>人元丙火克地分申金</b> → 这是<b>妻动</b>。丙火在最上，申金在最下，中间隔着癸未、丙子两位。',
      '<b>贵神癸未土克将神丙子水</b> → 这又是<b>贼动</b>。',
      '<b>妻动与贼动同时出现，说明什么？</b> 两处都是"外来克内、上克下"。妻动是外面直接来耗我的根基（地分），贼动是我身边的人（二神之间）先起了内耗。',
      '断这类课，要先看<b>哪一个克得更实</b>：',
      '未土克子水，是<b>土克水</b>，力量直接，且未为燥土，克子水克得干脆——<b>内耗是主要的</b>。',
      '丙火克申金，是<b>火克金</b>，中间隔着两位，属于"隔克"——<b>外来的索取是次要的</b>。',
      '<b>所以这一课的主线不是"外人来要钱"，而是"自己人先出了问题"</b>。这就是"外来的克，要先看它隔了几层"的道理。',
      '<b>还要注意申金的位置</b>。申金本身不弱，被丙火隔着两位来克，一时半会儿克不动，所以妻动的事<b>不会立刻发生</b>，会拖。而子水被未土贴着克，<b>立刻就有反应</b>——<b>近克快、远克慢</b>，这是断应期的一条实规矩。',
      '<b>二、官动（贵神克人元）</b>',
      '<b>2.1 口诀</b>',
      '<b>官动利求官，相逢禄位迁，常人官府事，有官望财难，</b>',
      '<b>合得官中物，休从外处干，得财防暗损，问病在咽喉。</b>',
      '<b>2.2 逐句解释</b>',
      '<b>"官动利求官"</b>',
      '<b>官禄爻动，有官之人大利</b>',
      '<b>若逢驿马，必然迁官升职</b>',
      '<b>"相逢禄位迁"</b>',
      '<b>如逢二马（天马、驿马），占官有迁移之喜</b>',
      '<b>"常人官府事"</b>',
      '<b>官爻克干，故常人有官府中事，主诉讼官司等，反而不吉</b>',
      '<b>但打官司为我方有理</b>',
      '<b>"有官望财难"</b>',
      '<b>有官不宜求财</b>——<b>财动伤官，将神克泄了贵神的力量，不利于求官</b>',
      '这就是「<b>官财不两求</b>」',
      '<b>"合得官中物"</b>',
      '<b>官动而逢合，官中财物可得</b>',
      '<b>"休从外处求"</b>',
      '<b>人元受克，事在自己，不宜外求</b>',
      '<b>"得财防暗损"</b>',
      '<b>我克外，财须防密失</b>',
      '<b>"问病在咽喉"</b>',
      '<b>下克上，病在头部</b>——<b>因天干是头部，主头痛、头晕、头部有伤及伤疤等，亦主咽喉</b>',
      '<b>2.3 官动的两类情形</b>',
      '<b>官动对不同身份的人，吉凶相反</b>：',
      '| 求测者 | 官动的意义 |',
      '|---|---|',
      '| <b>本身为官者</b> | <b>利于求官升职</b>——上克人元就是自己的能力强，要超过目前状态 |',
      '| <b>普通百姓</b> | <b>主诉讼纠纷</b>——无官之人是"找上级提意见"，反而不吉 |',
      '<b>所以断到官动，先要问：</b> 求测者有没有官职？',
      '<b>2.4 官动逢合的双面性</b>',
      '<b>"合得官中物"</b> ——<b>但不是所有"逢合"都好</b>。',
      '<b>官动逢合要看合化出的五行——是生助还是泄劲。</b>',
      '<b>即</b>：',
      '<b>合化出的五行生助官</b> ——好',
      '<b>合化出的五行泄官的气</b> ——反而不好',
      '<b>所以不能见"合"就说好，要看它化出什么。</b>',
      '<b>2.5 课式实证</b>',
      '<code>`</code>',
      '人元：乙　　木',
      '贵神：癸酉（太阴）　金',
      '将神：乙丑（大吉）用　土',
      '地分：亥　　水',
      '<code>`</code>',
      '<b>先看官动在哪里</b>：<b>贵神癸酉金克人元乙木</b> —— 金克木，这是<b>官动</b>。',
      '<b>官动的意思</b>：<b>贵神所处的位置为尊，它向上克人元</b> —— 下位往上克，这是"<b>我方发动、往外争</b>"的象，所以主"<b>利求官</b>"。',
      '<b>要分人看，这是官动最要紧的一条</b>：',
      '<b>有官之人</b>见官动 —— <b>利于求官、升迁</b>（"官动利求官，相逢禄位迁"）。',
      '<b>无官之人</b>（普通人）见官动 —— 是<b>找上级反映问题、辩理</b>，主<b>口舌、诉讼</b>。<b>这才是俗话说的"抗上"。</b>',
      '<b>所以"抗上"不是官动的定义，只是官动落在无官之人身上的那一种表现。</b>',
      '<b>官动的本义要看清"谁在克谁"</b>：<b>贵神居尊位、人元在下位，是上位的贵神来克我</b> —— <b>这是"外来之官压我"的象。</b> <b>对有官之人，这份"压"是上位相召、是提拔的机会，所以主升迁；对无官之人，这份"压"就是官府之事找上门，所以主口舌诉讼。</b> <b>同一个关系，落在不同人身上，吉凶就不同</b> —— 这正是"要分人看"的由来。',
      '<b>这一课还有一层</b>：<b>地分亥水生人元乙木</b> —— 水生木，这是<b>父母动</b>。',
      '<b>官动遇上父母动，是好是坏？</b>',
      '<b>父母动是"下面的人、家里的根基在供养你"</b>——有托底、有后台、有人在背后撑你。',
      '<b>官动是"我往上争"</b> —— 争的底气从哪来？就从下面这一生来。',
      '两者合看：<b>下面有根基供养，上面才有本钱去争</b>。所以这一课是<b>有靠山、有底气</b>的象，不是孤立无援地往上冒犯。',
      '<b>反过来，如果官动而无父母动、地分又克人元</b>，那才是<b>孤立地往上争</b> —— 下面拆台、上面硬顶，这样的人在单位里<b>事情不容易办成</b>。',
      '<b>再看二神</b>：贵神癸酉金、将神乙丑土，<b>丑土生酉金</b>（将神生贵神）。这是"我下面的人在往上送"——<b>二神往贵神上走，说明情势是往"官"那边走的</b>，也就是<b>往上层倾斜</b>。求官求职，这一层很关键：<b>二神生贵神，事情往贵的方向成；二神生人元，事情往自己的方向成</b>。',
      '<b>三、贼动（贵神克将神）</b>',
      '<b>3.1 口诀</b>',
      '<b>贼动内贼生，勾连诈不明，损财卑幼病，谋望必无成，</b>',
      '<b>架媾奸私意，偷攘宛转名，内爻终暗昧，病恐亦非轻。</b>',
      '<b>3.2 逐句解释</b>',
      '<b>"内贼生"</b>',
      '<b>贵神为外克内，将神为财爻为己身、为妻子</b>',
      '<b>财受克必定损财，女子身体受损</b>',
      '<b>二神为课内，又有内线接应或家人偷窃失财</b>',
      '<b>重要</b>：<b>"贼动内贼生"是有条件的</b>：',
      '<b>甲寅克丑土为贼动，但如果二神天干相合，才叫"贼动内贼生、勾连诈不明"。</b>',
      '<b>不是凡见贼动都主内贼。要看天干是否相合——天干相合，才说明是家内有接引、有内线接应。</b>',
      '<b>"勾连诈不明"</b>',
      '<b>外勾里连，空诈不明，分不清谁勾结亲朋侵运财物</b>',
      '<b>"损财卑幼病"</b>',
      '<b>妻位受伤，卑幼灾患</b>',
      '<b>注意</b>：这一句有一个解释上的难点——<b>"卑幼"按四象所属图在地分，但这里是"神克将"，与地分无关</b>',
      '<b>一种解释是</b>：<b>指怀胎有身孕的女人</b>，受克伤自身和孩子',
      '<b>"谋望必无成"</b>',
      '<b>二神相克，事端内起，人事不合，求事难成</b>',
      '<b>"架媾奸私意"</b>',
      '<b>指女人有外情</b>——男人克女人为财，古代女子亦是财，贼动被克另有奸私',
      '<b>生者为思想女子，克者也有此意</b>',
      '<b>"偷攘宛转名"</b>',
      '<b>妻爻受克，或生淫荡，宛转偷攘，名声受损</b>',
      '<b>"内爻终暗昧"</b>',
      '<b>内爻受克，事主暗昧不明，必定有私情不显与人</b>',
      '<b>"病恐亦非轻"</b>',
      '<b>将神位主腹部，上克下腹部受损，病情定不轻</b>',
      '<b>3.3 贼动的核心断法</b>',
      '<b>记住三句话</b>：',
      '<b>凡见贼动，首断损财。</b>',
      '<b>更贼神入玄武入课，主失盗。</b>',
      '<b>如果贼动逢空，则是没有丢失财物，或者看到别人失窃。</b>',
      '<b>用在求财</b>：',
      '<b>求财见贼动必定不得财。</b>',
      '<b>用在婚姻</b>：',
      '<b>婚姻见贼动，大多有外情。</b>',
      '<b>贼动断感情——外情几近必然，桃花贼动百分之百。</b>',
      '<b>用在断病</b>：',
      '<b>将神位主腹部……病情定不轻。</b>',
      '<b>3.4 贼神是谁</b>',
      '<b>"贼神"指的是课中出现的那几个特定的地支</b>：',
      '<b>贼神——子水、卯木、亥水；卯酉相冲。</b>',
      '<b>即</b>：',
      '<b>子水</b>——<b>玄武</b>，主盗贼',
      '<b>卯木</b>——<b>太冲</b>，主盗贼（卯为门户，开门推窗常被盗贼有机可乘）',
      '<b>亥水</b>——也主阴私',
      '<b>所以"贼神入玄武入课"</b> ——<b>说明有盗贼之事发生。</b>',
      '<b>3.5 内外勾结的判定</b>',
      '<b>不是所有贼动都是内外勾结</b>：',
      '<b>什么情况下是内外勾结？并不是所有的贼动都是内外勾结。有破门窗入户的盗窃，不一定就是内外勾结，这也是贼动。</b>',
      '<b>内外勾结是二神的干五合，属于内外勾结；或者地分生贵神。</b>',
      '<b>天干为外围纽带，这是里外串联；地分生贼更是家有接引内贼作案——这样的贼动最可怕，损失是最大的。</b>',
      '<b>所以"内外勾结"有两个判定标准</b>：',
      '<b>二神的干五合</b> ——<b>里有内线</b>',
      '<b>地分生贵神</b> ——<b>家有接引</b>',
      '<b>3.6 课式实证</b>',
      '<code>`</code>',
      '人元：己　　土',
      '贵神：丁卯　木',
      '将神：乙丑（大吉）用　土',
      '地分：巳　　火',
      '<code>`</code>',
      '<b>这一课是本门断课里很有代表性的一课</b>：贵神丁卯木，<b>一木克二土</b> —— 它同时克<b>人元己土</b>和<b>将神乙丑土</b>。',
      '<b>贵神丁卯木克人元己土</b> → <b>官动</b>（抗上）',
      '<b>贵神丁卯木克将神乙丑土</b> → <b>贼动</b>（二神天干丁、乙不合，<b>不作"内外勾结"断</b>，只作一般的损财、被算计断）',
      '<b>两个动都在贵神身上</b>，所以<b>这个贵的身份就露出来了</b>：它既压上头（对人元），又夺内财（对将神）。',
      '<b>贼动的实义是"损财、丢失、被人算计"</b>。而这里的贼动<b>发生在卯木旺的时候</b>——卯木当旺，克丑土（<b>旺克者为死</b>，丑土因此处死地），<b>旺克死，克得毫无还手之力</b>。这种"旺里克的"贼动，断人<b>爱占小便宜、把钱看得很重</b> —— <b>卯木当旺而不肯让，这一股劲正应在这个"贪"字上。</b>',
      '<b>贼动的另一层意思是"桃花"</b>——贼动代表暗中来往、不正当的关系。卯木本身就是桃花，贼动又落在卯木上，<b>所以主感情上有外情</b>。',
      '<b>再看下面</b>：<b>地分巳火生人元己土</b>（火生土），这是<b>父母动</b>。',
      '<b>父母动在这里起了什么作用？</b> 巳火想往上生人元己土，可是中间隔着一个<b>丑土</b>在挡着——<b>丑土是湿土，能晦火</b>，所以巳火的这份生，<b>生不上去、被截住了</b>。这就叫"<b>有心想帮，帮不上</b>"。',
      '<b>这一课还有格局的层次</b>：课内有<b>巳、丑</b>两个，加上日建来的<b>酉</b>，就凑成<b>巳酉丑金局</b>。金局一成，<b>反过头来克卯木</b>（金克木）。原本卯木克二土，等金局一合，<b>情势整个翻过来</b> —— 原来是它欺负人，现在是被围剿。',
      '<b>所以贼动不是终局。</b> 贼动发生的时候看着凶，但只要课内有能合成局的字，<b>贼神的旺运就有个头</b>。这就是"<b>动要看它能不能长久</b>"的道理。',
      '<b>四、财动（将神克贵神）</b>',
      '<b>4.1 口诀</b>',
      '<b>财动利求财，占官定不谐，家中人出外，身灾并妻妾，</b>',
      '<b>疾病忧难愈，营求喜自来，财物终有损，职位恐多乖。</b>',
      '<b>4.2 逐句解释</b>',
      '<b>"财动利求财"</b>',
      '<b>内克外谓之财动，求财必得</b>',
      '<b>又主想求财必靠自己劳动所得，并有出外求财的想法</b>',
      '<b>"占官定不谐"</b>',
      '<b>官爻受克，求官有失，或因财损失职权</b>',
      '<b>因将是妻妾，又主妻子能干发家</b>',
      '<b>"家中人出外"</b>',
      '<b>内克外，有人出外</b>',
      '<b>"身灾并妻妾"</b>',
      '<b>自身和妻妾有灾</b>',
      '<b>"疾病忧难愈"</b>',
      '<b>贵神受克，病在胸，不易治愈</b>',
      '<b>又主忧愁在身</b>',
      '<b>"营求喜自来"</b>',
      '<b>内克外，营求有喜，但要靠自己动手得来</b>',
      '<b>"财物终有损"</b>',
      '<b>神受克，贵神为外财、将神为内财，贵神受克也主损失财物</b>',
      '<b>"职位恐多乖"</b>',
      '<b>官爻受克，权利失差，或因女人危及职位</b>',
      '<b>4.3 财动的本质</b>',
      '<b>将神在四象所属图代表自己、妻子。贵神为尊上，财动克上，为人不孝敬、为财不尊。</b>',
      '<b>将神为财物为内财，克贵神即"内财搏外财"，以财求财，适合投资做生意求财。</b>',
      '<b>一句话概括</b>：',
      '<b>财动必有财。逢空不得财或者破财。</b>',
      '<b>求财不求官，求官不求财。</b>',
      '<b>内克外有出外求财的想法。</b>',
      '<b>4.4 财动的力量</b>',
      '<b>"财动必得财"是有条件的</b>：',
      '<b>财动必得财——但要分旺动还是休囚死动。</b>',
      '<b>没有力量硬发动，是"没事找事"。</b>',
      '<b>即</b>：',
      '<b>旺动</b> ——<b>真能得财</b>',
      '<b>休囚死动</b> ——<b>不但不得，还可能有损</b>',
      '<b>还有一条</b>：',
      '<b>有能力发动才叫"得"，不能自不量力。</b>',
      '<b>4.5 课式实证</b>',
      '<code>`</code>',
      '人元：丁　　火',
      '贵神：丁巳（腾蛇）　火',
      '将神：子（神后）用　水',
      '地分：辰　　土',
      '<code>`</code>',
      '<b>这一课的财动非常干净</b>：<b>将神子水克贵神丁巳火</b> —— 水克火，这是<b>财动</b>。',
      '<b>财动的本义是"内克外"</b>：将神是我自己、是我的本钱，贵神是外面、是外财。我拿手里的本钱去克外边的财，<b>这就是投资、做生意、以财博财</b>。',
      '<b>这一课的财动还带着一个特别之处</b>：<b>子水是空亡的</b>（子的位置逢空）。',
      '<b>财动逢空，就是"有想法、没本钱"</b>：',
      '将神空 → 是<b>自己的资金不够</b>。本钱不足还要去博这个财，结果本投进去、财拿不回来，<b>这叫"不得反失"</b>。',
      '但如果反过来是<b>将神不空、贵神空</b>，那是<b>对方不跟你做了</b>——生意终结，或者对方有欺骗行为，钱给了、事没办。',
      '<b>同样是财动逢空，空在哪一位，结果完全不同</b>。这是断财动最关键的分辨。',
      '<b>这一课还有第二个动</b>：<b>人元丁火生地分辰土</b> —— 火生土，这是<b>子孙动</b>。',
      '<b>子孙动的意思是"外生内、我往外付出"</b>。人元在最上、地分在最下，人元主动去生地分，是<b>我供养我自己的根基</b>——在求子、买房、置产这类事上，子孙动是"想要、并且愿意为此付出"的象。',
      '<b>这里还有一层</b>：丁巳是<b>腾蛇</b>。腾蛇主忧虑、缠绕、心里放不下。<b>腾蛇入课又逢财动逢空</b>，说明这件事<b>想了很久、也投了钱，但一直悬着没有结果</b>。',
      '<b>地分辰土在这里是救星</b>。<b>地分为固定财产、为存款、为老本</b>。如果<b>地分能生将神</b>，就等于"把老本拿出来继续投"，财动之空还能救回来。这一课是<b>人元生地分、不是地分生将神</b>，所以<b>老本没有被拿出来，救不回来</b> —— 这也是为什么这一课的财动<b>最终没有得财</b>。',
      '<b>五、鬼动（地分克人元）</b>',
      '<b>5.1 口诀</b>',
      '<b>鬼动忧灾怪，官亨人出外，争讼带他人，乖戾因间外，</b>',
      '<b>口舌共喧争，冤仇皆损害，痊病物仰合，家宅未安泰。</b>',
      '<b>5.2 逐句解释</b>',
      '<b>"鬼动忧灾怪"</b>',
      '<b>占事有灾怪及人有异举</b>',
      '<b>鬼动占病常有阴性病症，或家中不宁忧愁</b>',
      '<b>"官亨人出外"</b>',
      '<b>下克上，人欲出外求名，或找官家诉讼</b>',
      '<b>"争讼带他人"</b>',
      '<b>隔位克外，必主讼连他人</b>',
      '<b>主牵连他人、朋友、亲属等</b>',
      '<b>"乖戾因间外"</b>',
      '<b>事从外来，或与外人有关</b>',
      '<b>"口舌共喧争"</b>',
      '<b>人元受克，事从内起，事由家内引起</b>',
      '<b>又牵连他人，或因小口在外官司诉讼</b>',
      '<b>"冤仇皆损害"</b>',
      '<b>因冤仇而受损害</b>',
      '<b>"痊病物仰合"</b>',
      '<b>方克干，方为医生、干为病，医生克制病症能治愈</b>',
      '<b>"家宅未安泰"</b>',
      '<b>地分克人元，家宅不宁</b>',
      '<b>5.3 鬼动的机制</b>',
      '<b>地分克人元为隔克，人欲外出。因为是隔克，必定连及家人朋友，下克上，民告官。</b>',
      '<b>下克上又有怪异之事发生。占官喜鬼动，带驿马为异地升迁。</b>',
      '<b>关键词</b>：',
      '<b>隔克</b> ——<b>隔着二神</b>',
      '<b>连及家人朋友</b> ——因为隔着，所以牵连广',
      '<b>民告官</b> ——下克上',
      '<b>怪异之事</b> ——因为"鬼"字',
      '<b>宜官迁</b> ——<b>占官喜鬼动</b>',
      '<b>5.4 鬼动的多重取象</b>',
      '<b>地分发动，取象很多</b>：',
      '| 取象 | 含义 |',
      '|---|---|',
      '| <b>孩子不听话</b> | 地分为孩子 |',
      '| <b>房子风水不好</b> | 地分为房子 |',
      '| <b>越级、以下犯上</b> | 下克上 |',
      '| <b>出外</b> | 人欲外出 |',
      '<b>求官上的一句话</b>：',
      '<b>内克外为有益、外克内为不利；地分克人元主努力。</b>',
      '<b>断病上</b>：',
      '<b>鬼动之症——来得蹊跷的"怪异之症"。</b>',
      '<b>诉讼上</b>：',
      '<b>鬼动牵涉他人。</b>',
      '<b>5.5 课式实证</b>',
      '<code>`</code>',
      '四柱：丙申年　癸巳月　己酉日　癸酉时',
      '月将：申　日空：寅、卯　四大空亡：无',
      '人元：庚　　金 + 死　月德',
      '贵神：甲戌（天空）　土 + 相　丧门、六甲',
      '将神：己巳（太乙）用　火 - 旺',
      '地分：午　　火 + 旺　吊客',
      '<code>`</code>',
      '<b>这一课的鬼动在下面</b>：<b>地分午火克人元庚金</b> —— 火克金，这是<b>鬼动</b>。',
      '<b>鬼动的本义是"方克干"，也就是根基反过来克头领</b>。人元是首脑、是头，地分是最底下。<b>最底下的东西往上克头</b>，这叫"<b>卑微克尊贵</b>"，所以叫鬼而不叫官。',
      '<b>鬼动主什么？</b>',
      '<b>主灾病、口舌、官非</b>——底下出问题，往上闹。',
      '<b>主"人出外"</b>——被底下的东西逼得待不住，只能往外走。',
      '<b>主"内部的伤害"</b>——不是外面来的，是<b>自己根子上出的问题</b>。',
      '<b>这一课的特点在于"火势很旺"</b>：地分午火 + 旺，将神己巳火 + 旺，<b>两个火一起克人元庚金</b>，而庚金<b>处于死地</b>。',
      '<b>旺火克死金，这是很重的克。</b> 人元在金口诀里代表<b>头部</b>，人元受克，断病就先断头部。又因为庚金本身临死，<b>这一克几乎是压着打</b>。',
      '<b>克人元的还不止地分</b>：',
      '<b>地分午火克人元</b> → 鬼动',
      '<b>贵神甲戌土生人元庚金</b> → 土生金，这是<b>唯一来帮忙的</b>——贵神生人元，是<b>上面在扶你</b>。（注意：这不算<b>父母动</b>。父母动专指<b>地分</b>生人元，是"下面的根基供养上面"；这里是贵神生人元，位置不同，含义也就不同。）',
      '<b>所以这一课不是全无救应</b>：戌土虽然燥，但还能生金。<b>有生就有缓</b> —— 鬼动的凶，被贵神这一生卸掉了一部分。',
      '<b>再看神煞</b>：<b>地分带吊客</b>，吊客主丧事、忧患，落在鬼动的那一位上，<b>凶上加凶</b>。而<b>人元带月德</b>，月德是解厄之神，<b>头上有贵人</b>。',
      '<b>这一课的断法就是</b>：<b>根子上有病（鬼动 + 吊客），面上有救（月德 + 贵神生），所以是"有惊无险、病而不死"之象</b>。断课要这样两头都看到，<b>不能一见鬼动就说大凶</b>。',
      '<b>六、五动的总结</b>',
      '<b>6.1 共性</b>',
      '<b>五动分两类</b>：',
      '<b>外来克内（都是外来索取，都指损失）</b>：',
      '<b>妻动</b>——破<b>副财</b>（固定财产、存款）',
      '<b>贼动</b>——破<b>正财</b>',
      '<b>无论是妻动还是贼动，都有外来克内的情况，都是外来索取，一个是正财，一个是副财（固定财产、存款等）都指损失。只是大小远近问题。</b>',
      '<b>内克外（向外发展并得利）</b>：',
      '<b>财动</b>——<b>必有财</b>',
      '<b>其他</b>：',
      '<b>官动</b>——克我者（贵神），主官',
      '<b>鬼动</b>——克我者（地分），主鬼',
      '<b>6.2 一句话心法</b>',
      '<b>上克下、外克内，谁被克谁出事。</b>',
      '<b>这就是五动的总心法</b> ——<b>看"谁被克了"，就知道"谁出问题"。</b>',
      '---',
      '<b style="color:var(--c-gold)">第三节　三动</b>',
      '<b>一、父母动（地分生人元）</b>',
      '<b>1.1 定义</b>',
      '<b>地分生人元</b>——<b>方生干</b>。',
      '<b>方生干为父母动——生我者为父母。</b>',
      '<b>1.2 断法</b>',
      '<b>这是"印绶"之动</b>：',
      '<b>父母动（方生干）为印绶，大吉。</b>',
      '<b>具体</b>：',
      '<b>为印绶</b> ——<b>小尊大，大吉</b>',
      '<b>求文书、书信、职称等可得</b>',
      '<b>多为正职</b>',
      '<b>主喜庆、正直</b>',
      '<b>用在求官上</b>：',
      '<b>父母动为印绶之动——多为正职。</b>',
      '<b>用在求财上</b>：',
      '<b>课中只有父母动主出财。</b>',
      '<b>即</b>：<b>如果课里只有父母动（没有财动），说明是要花钱的</b>（因为父母动是"生我"，我受了生，但要付出代价）。',
      '<b>1.3 课式实证</b>',
      '<code>`</code>',
      '人元：丁　　火',
      '贵神：庚午（朱雀）用　火',
      '将神：辛未（小吉）　土',
      '地分：卯　　木',
      '<code>`</code>',
      '<b>这一课的父母动在地分上</b>：<b>地分卯木生人元丁火</b> —— 木生火，这是<b>父母动</b>。',
      '<b>父母动的本义是"下生上、内生外"</b>。地分在最底下，人元在最上面。<b>底下的往上送，这叫父母</b>——因为父母是养育我的、是供给我的。',
      '<b>父母动断什么？</b>',
      '<b>主有依靠、有来源、有人供给</b>。问财，是<b>有本钱、有底子</b>；问事，是<b>有人帮、有退路</b>。',
      '<b>问文书、房产、长辈</b>，父母动是<b>直接的喜象</b>。',
      '<b>但父母动也主"被动"</b>——你是被养的、被给的，<b>事情不是你自己挣来的</b>。',
      '<b>这一课的关键在"生的路径通不通"</b>：',
      '看这四位——<b>地分卯木 →（生）人元丁火</b>，这是父母动。',
      '而<b>人元丁火 →（生）贵神庚午？</b> 不对，<b>庚午本身也是火</b>，火不生火。',
      '再看<b>贵神庚午火 →（生）将神辛未土</b> —— 火生土，<b>神生将</b>。',
      '<b>所以这一课的生，是从下面一路往上、又从上往下落到了将神身上</b>：',
      '卯木 → 丁火 → 庚午火（同类）→ 辛未土',
      '<b>生到了将神（辛未土）身上就停住了。</b> 将神是自己、是内。<b>生落到将神上，说明这份好处最终是归到自己手里的</b>——这是好课。',
      '<b>但要看清一个细节</b>：中间<b>庚午是火</b>，它和<b>人元丁火同类</b>。同类不生。<b>父母动的这份生，到了人元这里就和贵神"接上了头"，没有再往贵神上生</b>。',
      '<b>这说明什么？</b> 说明这份来源<b>是给自己用的，不是拿去送人的</b>。断财就是<b>自己得</b>；断合作就是<b>对方插不上手</b>。',
      '<b>还要看地分卯木的状态</b>。<b>木生火是泄气</b>——卯木生丁火，木自身要耗掉力量。所以<b>父母动虽然主有来源，但来源本身是在消耗的</b>。<b>问长远事，就要提醒：底子会越用越薄</b>，得赶紧补。',
      '<b>二、子孙动（人元生地分）</b>',
      '<b>2.1 定义</b>',
      '<b>人元生地分</b>——<b>干生方</b>。',
      '<b>干生方为子孙动——我生者为子孙。</b>',
      '<b>2.2 断法</b>',
      '<b>子孙动——主子孙之事，小吉。主添人进口、外来财物。</b>',
      '<b>具体</b>：',
      '<b>得财之相</b> ——<b>因为"生"是给予</b>',
      '<b>添人进口</b> ——<b>主添丁进口</b>',
      '<b>外来财物</b>',
      '<b>利求财，但来财慢</b>',
      '<b>为什么来财慢？</b>',
      '<b>因为</b>：<b>人元生地分，中间隔着贵神和将神</b> ——<b>所以是"隔位相生"，来得慢。</b>',
      '<b>还有一层</b>：',
      '<b>人元生地分（子孙动）——能得财但来晚，须看二神自化的影响。</b>',
      '<b>即</b>：<b>二神之间如果有合化，会影响得财的快慢。</b>',
      '<b>2.3 课式实证</b>',
      '<code>`</code>',
      '人元：丁　　火',
      '贵神：丁丑（贵人）　土',
      '将神：壬午（胜光）用　火',
      '地分：丑　　土',
      '<code>`</code>',
      '<b>这一课的子孙动在人元与地分之间</b>：<b>人元丁火生地分丑土</b> —— 火生土，这是<b>子孙动</b>。',
      '<b>先看这一课的底子</b>：四位是<b>火、土、火、土</b> —— <b>火生土，相生无克</b>。<b>相生无克的课，求事的阻力不大，以吉论</b>，这是这一课的基调。<b>在这个底子上再看"动"</b>。',
      '<b>子孙动的本义是"上生下"</b>。人元在最上、是头；地分在最下、是根基。<b>头主动去生根基</b>，这叫<b>子孙</b>——因为子孙是我生出去的、是我要付出的。',
      '<b>子孙动断什么？</b>',
      '<b>主付出、主给予、主"我往外拿"</b>。问财，是<b>要投出去</b>；问事，是<b>得自己下本钱</b>。',
      '<b>主小辈、主子女、主下属</b>——子孙动是六亲里子孙那一块的事动了。',
      '<b>主"想要"</b> —— 你愿意为这件事付出，说明你心里是想成的。',
      '<b>这一课有很值得注意的一点</b>：<b>人元丁火和地分丑土之间，隔着两位</b>。中间是<b>贵神丁丑土、将神壬午火</b>。',
      '<b>隔着两位的子孙动，是"远生"。</b> 意思是我这份付出，<b>不是直接给自己的根基，中间要经过旁人</b>。断事就是：<b>你想给家里的、给底下的东西，得先过了外面这一道手</b>。',
      '<b>再看二神</b>：<b>将神壬午火生贵神丁丑土</b> —— 火生土，<b>将生神</b>。',
      '<b>将神生贵神，是"内往外送"</b>。这和上面的子孙动是<b>同一个方向</b>——<b>都是往外拿</b>。',
      '<b>所以这一课的方向是"出"</b>：人元往外生、将神往外生，<b>一路都是往外送</b>。<b>但这是"顺"里的出</b> —— 课内没有克战，<b>这份付出是有回音的，不是白费</b>。',
      '<b>断法上就要注意分寸</b>：',
      '问<b>求财</b>，这一课主<b>先投后得</b>：底子顺，投出去的钱有回音，只是<b>回报要经过一道手</b>；',
      '问<b>办事</b>，这是<b>你得先付出，才谈得上回报</b>；',
      '问<b>家里</b>，是<b>你在贴补下面的人</b>。',
      '<b>这里有一条界线要划清</b>：<b>不要把"生"说成"破财"</b>。<b>破财是"克"的象</b>（贼动、财动逢空那一类）；<b>这一课是"生"，生是"出"，出而有回，性质完全不同。</b>',
      '<b>子孙动真正的功课是</b>：<b>看清你的付出有没有落到自己的根上</b>。这一课隔着两位，<b>付出先经了别人的手</b>，所以<b>"隔手"，中间会折损一部分</b> —— 这是要提醒的，但<b>不是"破财"</b>。',
      '<b>三、兄弟动（人元与地分同）</b>',
      '<b>3.1 定义</b>',
      '<b>人元与地分同五行</b>——<b>干方比</b>。',
      '<b>干方比为兄弟动——五行相比者为兄弟。</b>',
      '<b>3.2 断法</b>',
      '<b>主事在比肩，多有不成，小凶。事在兄、朋之间，多为争执不和。</b>',
      '<b>具体</b>：',
      '<b>争执不合</b> ——<b>兄弟之间容易起争执</b>',
      '<b>小凶</b>',
      '<b>事在比肩，多有不成</b>',
      '<b>比肩劫财</b>',
      '<b>还有一层</b>：',
      '<b>比肩关系——将神位即平等者之位，"我事在比肩，多有不成"。</b>',
      '<b>注意</b>：<b>将神就是"平等者"的位置</b>（妻子、朋友、同学都在将神），<b>所以"比肩"的事也在将神位。</b>',
      '<b>3.3 "无比"与一类朝元</b>',
      '<b>这里有两个容易混的概念，要分清楚。</b>',
      '<b>一类朝元</b>（详见第八章）：',
      '<b>一干见本属三支也</b> ——<b>比如甲见三寅、乙见三卯</b>。',
      '<b>主事体重叠，闭伏不动，无荣无誉，淹滞阻隔。</b>',
      '<b>即</b>：<b>四位同一个五行，而且地支就是本属的那三支</b> —— 这叫"一干见本属三支"，也叫<b>四位伏吟课</b>。',
      '<b>"无比"（又叫"比课"）是另一回事</b>：',
      '<b>课内都是同一五行，但不一定是同一个地支</b> —— 比如<b>人元是庚辛金，课内是申酉金</b>，<b>五行同而干支不同</b>。',
      '<b>两者的分别</b>：',
      '| | 一类朝元 | 无比（比课） |',
      '|---|---|---|',
      '| <b>五行</b> | 四位全同 | 课内同五行 |',
      '| <b>地支</b> | <b>本属三支</b>（如甲见三寅） | <b>不必相同</b>（如庚辛见申酉） |',
      '| <b>别称</b> | 四位伏吟课 | 比课 |',
      '<b>无比的主断</b>：<b>纯金之比课，主诉讼、刑冲、家宅不宁</b> —— 比肩林立、互不相让，家宅就不安宁。',
      '<b>和兄弟动再分一次</b>：',
      '<b>兄弟动</b> —— <b>只是人元与地分相比</b>（两位相同）',
      '<b>一类朝元</b> —— <b>四位全同一五行，且地支本属</b>',
      '<b>无比</b> —— <b>课内同五行，地支可不同</b>',
      '---',
      '<b>3.4 课式实证</b>',
      '<code>`</code>',
      '人元：庚　　金',
      '贵神：乙酉（太阴）用　金',
      '将神：甲子（神后）　水',
      '地分：申　　金',
      '<code>`</code>',
      '<b>这一课的兄弟动在人元与地分之间</b>：<b>人元庚金、地分申金，同是金</b> —— 这是<b>兄弟动</b>。',
      '<b>兄弟动的本义是"干与方同类"</b>。人元和地分是四位里最外、最内的两极，<b>这两极同五行，就叫兄弟</b>。',
      '<b>兄弟动断什么？</b>',
      '<b>主竞争、主分夺、主"有人和你抢"</b>。因为兄弟是同类，<b>同类就得分</b>。',
      '<b>主合作、主伙伴、主"并肩"</b> —— 兄弟同心也是兄弟动。',
      '<b>主"不动"</b> —— 同类之间不生不克，<b>这一块是平的、是停住的</b>。',
      '<b>先看这一课的底子</b>：四位是<b>金、金、水、金</b> —— <b>金生水，相生无克</b>。<b>相生无克的课以吉论，旺衰的作用此时并不明显</b>，这是这一课的基调。<b>在这个底子上再看兄弟动</b>。',
      '<b>这一课把兄弟动演得很清楚</b>：',
      '<b>人元庚金</b>与<b>地分申金</b>同类 → 兄弟动，<b>上下两头是一样的</b>。',
      '中间<b>贵神乙酉金</b>——<b>也是金</b>！',
      '<b>所以这一课是"三金"。</b> 四位里有三位是金，只有<b>将神甲子水</b>不是。',
      '<b>金多水少，说明什么？</b> 金是生水的。<b>三金生一水，这是"众金生水"</b> —— 水的来源极其充足，是<b>有源头、有供养</b>的象。',
      '<b>兄弟动在这里的含义，要放回这个底子里看</b>：',
      '问<b>合作</b>：<b>参与的人多、力量齐</b> —— 这是"兄弟同心"的一面。',
      '问<b>求财</b>：<b>来源广</b>，不止一条路。',
      '问<b>竞争</b>：<b>同类多，要留意"分"的一面</b> —— 但课内<b>相生不克</b>，不是恶性的争夺。',
      '<b>兄弟动的本义是"同类有分"</b>：同类多了，总有被分薄的可能。<b>但这一课的整体走势是"生进"的</b> —— 三金生一水，<b>力量是往将神身上聚的</b>，所以"分"只是提醒，不是结论。',
      '<b>再看将神甲子水的位置</b>。<b>子水被三金环生</b>，水本身不弱，而且<b>金生水是顺生</b>，这条路是通的。<b>所以这一课虽然是兄弟动主分，但将神（我自己）是被供养的</b> —— 断事就是：<b>过程有争、有分，但最终我这边是受益的一方</b>。',
      '<b>还要注意那一个"用"字</b>。这一课的用神是<b>将神甲子水</b>。<b>用神被三金生，主事有得力处</b>。所以这一课的整体断法是：<b>争归争，但我在得利的那一头</b>。',
      '<b style="color:var(--c-gold)">第四节　扩展的动</b>',
      '<b>除了标准的八动，还有几种"扩展的动"</b>。',
      '<b>一、贵神克地分</b>',
      '<b>这不在八动之内，但断法上接近</b>：',
      '<b>神克方主事可成，但是不能一帆风顺，主隔手求财，不能急于求成。</b>',
      '<b>有些阻碍，谋望不是很顺利，但终究可成。</b>',
      '<b>用在求财上</b>：',
      '<b>贵神克地分——隔手求财、得财有晚，但更大成分偏向求财不利。</b>',
      '<b>用在婚姻上</b>：',
      '<b>贵神克地分，隔手求财，谋望晚成，但终有可成。</b>',
      '<b>课式实证</b>',
      '<code>`</code>',
      '人元：丙　　火 + 旺　天德合',
      '贵神：乙卯（六合）用　木 - 休　月德合',
      '将神：庚申（传送）　金 + 死　月德、驿马',
      '地分：辰　　土 + 相　天医',
      '<code>`</code>',
      '<b>看这一课里的"贵神克地分"</b>：<b>贵神是乙卯木，地分是辰土</b> —— <b>木克土</b> —— <b>贵神克地分</b>。',
      '<b>这一层关系说明什么？</b>',
      '<b>贵神在外面、在上头；地分在家里、在根底</b> —— <b>外面的力量伸手来取家里的东西</b>。但<b>它不直接够得着</b> —— <b>中间还隔着将神、隔着人元</b> —— <b>不是伸手就拿，是"隔着人"拿</b> —— 这就是"<b>隔手</b>"两个字的来历。',
      '<b>所以断求财</b>：<b>财能得，但要经别人的手，急不得</b> —— <b>有些阻碍、谋望不那么顺，可终究能成</b>。',
      '<b>分寸要留</b>：<b>贵神克地分毕竟是"外来克内"</b> —— <b>所以偏"求财不利"的成分更大一些</b> —— 断的时候说"<b>能成，但不会一帆风顺</b>"，不要说成"<b>必得</b>"。',
      '<b>二、地分克贵神</b>',
      '<b>这也是财动的一种</b>：',
      '<b>地分克贵神也是财动——用存款财动。</b>',
      '<b>即</b>：<b>地分（存款）去克贵神（外财）</b> ——<b>这是"拿存款去做投资"。</b>',
      '<b>其他断法</b>：',
      '<b>以下犯上</b>',
      '<b>民告官，孩子不好管</b>',
      '<b>课式实证</b>',
      '<code>`</code>',
      '人元：甲　　木 + 旺　六甲',
      '贵神：甲子（玄武）用　水 + 休　六甲',
      '将神：戊辰（天罡）　土 + 死　吊客',
      '地分：戌　　土 + 死　天喜、飞廉',
      '<code>`</code>',
      '<b>地分戌土克贵神子水</b> —— <b>土克水</b> —— <b>地分克贵神</b>。',
      '<b>地分是存款、是老本，贵神是外财、是外头的进项</b> —— <b>拿老本去够外面的财</b> —— 所以叫"<b>用存款财动</b>"：<b>不是别人送来，是自己把存着的钱调出去用</b>。',
      '<b>再看方向</b>：<b>地分在最下、贵神在上，下位往上克</b> —— 这就是"<b>以下犯上</b>"这一条的由来。<b>断"民告官""孩子不好管"，取的都是这个"下往上顶"的象</b> —— <b>不是事情本身有多凶，而是"位次颠倒"</b>。',
      '<b>三、将神克地分</b>',
      '<b>这算不算破财？</b>',
      '<b>将神克地分算不算破财——只宜大意地讲"动用存款"。</b>',
      '<b>即</b>：',
      '<b>严格说</b>——<b>这是"消耗"，不是"破财"</b>',
      '<b>因为破财是外来侵害、被动损失；而将神克地分是自己主动花钱</b>',
      '<b>课式实证</b>',
      '<code>`</code>',
      '干支：乙未年　庚辰月　甲子日　丁卯时',
      '月将：酉　日空：戌、亥　四大空亡：水',
      '人元：丁　　火 - 旺　天德合、月德合、六丁',
      '贵神：庚午（朱雀）用　火 + 旺　病符、飞廉',
      '将神：癸酉（从魁）　金 - 死　丧门、丧车',
      '地分：卯　　木 - 休　天医',
      '<code>`</code>',
      '<b>将神癸酉金克地分卯木</b> —— <b>金克木</b> —— <b>将神克地分</b>。',
      '<b>为什么这一层不算破财？</b>',
      '<b>破财是被动的</b> —— 外来侵害、被人拿走、钱不由自己做主。<b>而将神克地分是主动的</b> —— <b>自己拿钱去办事、去投入、去买东西</b> —— <b>钱是花出去的，不是丢掉的</b>。',
      '<b>所以断的时候只说"动用存款"</b> —— <b>说"破财"就说重了</b>。',
      '<b>同一层关系，换个问法就换个象</b>：<b>这一课里的酉金克卯木，还应了脚上的伤</b>（卯主下肢）—— <b>问财是"花钱"，问身就是"受伤"</b> —— <b>关系是同一个，取象跟着问题走</b>，这正是"一个课能断很多事"的道理。',
      '<b>四、天干之动</b>',
      '<b>有一个重要的补充</b>：',
      '<b>天干相克之动——官动、财动亦可同断，但力小主外。</b>',
      '<b>即</b>：',
      '<b>人元天干克贵神天干</b> ——<b>也有"斩官"之意</b>',
      '<b>贵神天干克人元天干</b> ——<b>也有"官动"的意思，但更多是表现在象意上、想法上、机会上</b>',
      '<b>人元天干克贵干也有斩官之意，克干为外来索财。因为天干临那个神位，就代表那个神位的性质。虽然神干不是事物主体，天干主象意，就像是神的代表一样——你克了神的干，也是有克神的意思了。</b>',
      '<b>注意力度的区别</b>：',
      '<b>天干之动，力小</b> ——<b>而且主"外"</b>（表象层面）',
      '<b>地支之动，力大</b> ——<b>主"内"</b>（实质层面）',
      '<b>课式实证</b>',
      '<code>`</code>',
      '干支：丙申年　癸巳月　己酉日　癸酉时',
      '月将：申　日空：寅、卯　四大空亡：无',
      '人元：庚　　金 + 旺　月德',
      '贵神：乙酉（太阴）用　金 - 旺',
      '将神：甲子（神后）　水 + 相',
      '地分：申　　金 + 旺',
      '<code>`</code>',
      '<b>看这一课的天干</b>：<b>人元是庚金，贵神的天干是乙木</b> —— <b>庚克乙</b> —— <b>天干相克</b>。',
      '<b>这一克起不起作用？</b>',
      '<b>人元克的正是贵神的天干</b> —— 而<b>天干主象意</b>，<b>克了贵神的干，就等于克了贵神本身</b> —— 所以有"<b>斩官</b>"之意：<b>外来的力量压制我的工作</b>。',
      '<b>但力度必须看清</b>：<b>天干之动，力小，而且主"外"</b> —— <b>它落在表象上、想法上、机会上</b>，<b>不像地支相克那样实打实地落到事情上</b>。',
      '<b>所以同一层关系，断法要跟着问题走</b>：<b>问"能不能升"，这一克该说成"上头有个说法压着、事情卡在纸面上"</b>；<b>若说成"你的官被拿掉了"，就把"力小主外"这一条丢了。</b>',
      '---',
      '<b style="color:var(--c-gold)">第五节　动的力量与顺序</b>',
      '<b>一、谁发动，谁有力</b>',
      '<b>这是一条重要的判断原则</b>：',
      '<b>谁发动，就是为谁的利益而来。</b>',
      '<b>谁发动，代表谁的想法。</b>',
      '<b>即</b>：',
      '<b>财动</b> ——<b>代表"想求财"的意图</b>',
      '<b>官动</b> ——<b>代表"想求官"或"有官事"</b>',
      '<b>鬼动</b> ——<b>代表"想出去"或"有怪异之事"</b>',
      '<b>所以看到"动"，先想：这个动是谁发动的？它代表谁的利益？</b>',
      '<b>二、力量互减</b>',
      '<b>多个动同时出现时，力量会互相抵消</b>：',
      '<b>如果妻动再同时官动，那么妻动的力量肯定要减小；如果再发生将神克人元，妻动的力量更是减小。</b>',
      '<b>二力抵一力，妻动的力量几乎没有了。</b>',
      '<b>这告诉我们</b>：<b>看到多个动，要分析它们的力量对比，不能简单叠加</b> —— <b>"雷声大雨点小"，正是力量互减之后的样子。</b>',
      '<b>三、不得反失</b>',
      '<b>"动"不一定都好</b>：',
      '<b>贼动（三）——求财必破财、财动必得财；"谁发动谁有力"与"不得反失"。</b>',
      '<b>即</b>：',
      '<b>财动必得财</b> ——<b>但前提是"有力"（旺动）</b>',
      '<b>如果无力量硬发动</b> ——<b>"不得反失"</b>（不但得不到，反而损失）',
      '<b>还有一条</b>：',
      '<b>贼动逢空不断失，但"有动有象必有事"，应期看旺衰时令。</b>',
      '<b>即</b>：<b>贼动逢空，暂时不断"失"</b> ——<b>但"有动有象必有事"，早晚会应，应期要看旺衰和时令。</b>',
      '<b>四、关于"不克不动"</b>',
      '<b>有一条根本原则</b>：',
      '<b>不克不动、不冲不动、不刑不动——找"克"就是找矛盾点。</b>',
      '<b>即</b>：<b>"动"的前提是"克"</b> ——<b>没有克，就没有动。</b>',
      '<b>所以断课的第一步是找克</b> ——<b>找到克，才可能找到动。</b>',
      '---',
      '<b>课式实证：两个动同时出现，看哪个克得实</b>',
      '<code>`</code>',
      '干支：丙申年　癸巳月　乙卯日　癸未时',
      '月将：申　日空：子、丑　四大空亡：金',
      '人元：壬　　水 + 死',
      '贵神：丙戌（天空）　土 + 旺　天德合、丧门',
      '将神：癸未（小吉）用　土 - 旺　病符、截路、飞廉',
      '地分：午　　火 + 休　吊客',
      '<code>`</code>',
      '<b>问事</b>：一位男士求测事业财运。',
      '<b>先定旺衰</b>：四位是<b>水、土、土、火</b> —— <b>土占两位</b>，而<b>克土的木课内没有</b> —— 所以<b>土旺</b>。土旺则<b>金相</b>（土生金）、<b>火休</b>（生土者）、<b>木囚</b>（克土者）、<b>水死</b>（土克水）。',
      '标到四位上：人元壬水<b>死</b>、贵神戌土<b>旺</b>、将神未土<b>旺</b>、地分午火<b>休</b>。',
      '<b>用神在将神癸未</b>（四位壬阳、戌阳、未阴、午阳 —— 三阳一阴，以阴为用）。',
      '<b>看这一课的两个动</b>：',
      '<b>人元壬水克地分午火</b> —— <b>水克火</b> —— <b>人元克地分</b>，这是<b>妻动</b>；',
      '<b>贵神丙戌土克人元壬水</b> —— <b>土克水</b> —— <b>贵神克人元</b>，这是<b>官动</b>。',
      '<b>两个动的方向正好相反</b>：',
      '<b>妻动是"我往外克"</b> —— 人元克地分，我主动去取；',
      '<b>官动是"外往我克"</b> —— 贵神克人元，外面来压我。',
      '<b>一个"我出去"，一个"外面进来"</b> —— 这一课的局面就是<b>两头都在使劲</b>。',
      '<b>再看谁的力量大</b>：',
      '<b>贵神戌土在"旺"地，去克人元壬水（死）</b> —— <b>旺克死，克得实</b>；',
      '<b>人元壬水在"死"地，去克地分午火（休）</b> —— <b>死克休，克得虚</b>。',
      '<b>所以主次很清楚：官动是实的，妻动是虚的。</b>',
      '<b>断事就是</b>：',
      '<b>主要是"上面在压你"（官动实）</b> —— <b>升职难、工作上有压力</b>；',
      '<b>而"你想往外取"的那条路（妻动虚）</b> —— <b>使不上劲</b>。',
      '<b>这一课的第一条断语正是这个</b>："你的工作属于公务、文化、行政、房产类有关" —— <b>贵神戌土主"文化的、管理的、政法的"这一块</b> —— 反馈：<b>建筑设计师</b>。',
      '<b>而"想升职却近十年没有起色"</b> —— 依据就是<b>官动旺克人元</b>：<b>上面一直压着，你想上、上不去</b>。',
      '<b>神煞上还有一层</b>：',
      '<b>贵神带天德合、丧门</b> —— <b>天德合是吉神</b>（有贵人），<b>丧门是凶煞</b>（主忧虑），<b>一吉一凶同宫</b>；',
      '<b>将神带病符、截路、飞廉</b> —— <b>病符主身体有毛病</b>（断语里正有"肠胃不好"）、<b>截路主阻滞</b>、<b>飞廉主"快而惊"</b>；',
      '<b>地分带吊客</b> —— <b>吊客主忧患</b>。',
      '<b>所以这一课的断法是</b>：<b>事业上"上压不动"（官动实）、财运上"出去取不到"（妻动虚）；身体上病符、吊客都在，要提醒注意肠胃。</b>',
      '<b>这就是"两个动同时出现"的标准断法</b>：',
      '<b>先看两个动各是什么方向，再看哪个克得实、哪个克得虚 —— 实的定主调，虚的作参考。</b>',
      '<b>课式实证：一金克三木</b>',
      '<code>`</code>',
      '干支：辛卯年　癸巳月　丙寅日　乙未时',
      '月将：申　日空：戌、亥　四大空亡：水',
      '人元：庚　　金 + 旺　月德',
      '贵神：辛卯（六合）　木 - 死　天德',
      '将神：辛卯（太冲）用　木 - 死　天德',
      '地分：寅　　木 + 死　病符',
      '<code>`</code>',
      '<b>问事</b>：一位做生意的男士问工作财运（报数 3）。',
      '<b>先定旺衰</b>：四位是<b>金、木、木、木</b> —— <b>木占三位</b>，但它<b>被金克着</b>（人元庚金），所以<b>木受克</b>；而<b>金不受克</b>（课内无火）—— <b>唯一的候选就是金</b>，所以<b>金旺</b>。金旺则<b>水相</b>、<b>土休</b>、<b>火囚</b>、<b>木死</b>（金克木）。',
      '标到四位上：人元庚金<b>旺</b>、贵神卯木<b>死</b>、将神卯木<b>死</b>、地分寅木<b>死</b>。',
      '<b>这里有个"反常"值得注意</b>：<b>木明明占三位，却判"死"</b> —— 因为<b>三位木全都被人元那一金克着</b>。',
      '<b>"多者为旺"要排在"不受克"之后</b> —— <b>再多，被克着也使不上劲。</b> 这正是四法次序的用处。',
      '<b>看这一课有几个动</b>：',
      '<b>人元庚金克地分寅木</b> —— 金克木 —— <b>人元克地分</b>，这是<b>妻动</b>；',
      '其余的都不成立：<b>官动</b>（贵神克人元）方向反了，这里是<b>人元克贵神</b>；<b>贼动、财动</b>不成立 —— <b>二神同为卯木，比和</b>；<b>鬼动</b>不成立。',
      '<b>所以这一课只有妻动。</b>',
      '<b>但真正要看的是"克"的覆盖面</b>：<b>人元庚金一位，克着三位木</b> —— <b>贵神、将神、地分全在它的克制之下</b>。',
      '<b>这就叫"一金克三木"</b> —— <b>不是"一个动"，而是"一片压制"</b>。',
      '<b>断事就是</b>：',
      '<b>上面（人元）那一位在压着全局</b> —— <b>工作、自己、根基，三处都受它的力。</b>',
      '<b>这一课的头两条断语正对得上</b>：',
      '<b>"从事贸易型工作，跑动性大"</b> —— <b>木主"动、走"</b>（木性条达、主动），<b>被金克则身不由己地动</b>；',
      '<b>"规模很大，但这两年不是很顺"</b> —— <b>木占三位是"规模"</b>（多、盛），<b>但全被金克</b> —— <b>摊子大而不顺</b>。',
      '<b>神煞上</b>：<b>人元带月德、二神都带天德</b> —— <b>三德齐现</b>，主<b>这个人有福气、遇事有救</b>；<b>地分带病符</b> —— <b>根子上有点毛病</b>（应在生意上，就是"经营上有隐患"）。',
      '<b>这一课的教益是"动静之辨"，三步</b>：',
      '<b>一看有几个"动"</b>（这一课只有妻动）；',
      '<b>二看"克"的覆盖面</b>（这一课是一金压三木）；',
      '<b>三看"多"能不能顶用</b>（三位木被一金克，多也无用）。',
      '<b style="color:var(--c-gold)">第六节　各门类中的运用</b>',
      '<b>一、求财</b>',
      '<b>核心判断</b>：',
      '<b>求财最怕的是贼动，也就是贵神克将神，外来克内、外来索取。</b>',
      '<b>四条件</b>（详见第十一章）：',
      '<b>财动</b>',
      '<b>财爻旺相</b>',
      '<b>外生内</b>',
      '<b>青龙旺相</b>',
      '<b>财动的细分</b>：',
      '<b>用神在将神旺动发动</b> ——<b>以财求财</b>（做生意）',
      '<b>用神在贵神发动</b> ——<b>辛苦求财</b>',
      '<b>贼动的细分</b>：',
      '<b>内外勾结的判定</b> ——二神干五合，或地分生贵神',
      '<b>贼动逢空</b> ——不断失',
      '<b>课式实证</b>',
      '<code>`</code>',
      '干支：丙申年　甲午月　庚午日　辛巳时',
      '月将：未　日空：戌、亥　四大空亡：水',
      '人元：壬　　水 + 旺',
      '贵神：戊寅（青龙）用　木 + 相　天德合、天喜、天马',
      '将神：甲申（传送）　金 + 休　驿马、六甲、飞廉',
      '地分：午　　火 + 死　吊客、截路',
      '<code>`</code>',
      '<b>问事业财运</b>。<b>这一课没有贼动</b> —— <b>贵神寅木，将神申金</b> —— <b>金克木</b>？<b>不，是申金克寅木</b> —— <b>将神克贵神</b> —— <b>这是财动</b> ✓',
      '<b>再看财爻</b> —— <b>财爻是将神申金，处"休"地</b> —— <b>财本身不算旺</b>。',
      '<b>所以断</b>：<b>财能得（财动成立），但来得辛苦、数额有限（财爻休）</b> —— <b>同时又带驿马</b> —— <b>主这笔财要跑动才有</b>。',
      '<b>二、求官与求职</b>',
      '<b>官动的两面</b>：',
      '| 求测者 | 官动 |',
      '|---|---|',
      '| <b>有官之人</b> | <b>利求官升职</b> |',
      '| <b>无官之人</b> | <b>诉讼纠纷</b> |',
      '<b>求官的三个条件</b>（在五动层面）：',
      '<b>要有官动</b>',
      '<b>最怕贼动</b>（财动不立官）',
      '<b>喜欢有鬼动</b>（下克上）',
      '<b>还有</b>：',
      '<b>二马见官动再见鬼动</b> ——<b>要挪地方</b>（升迁异地）',
      '<b>官动不带马星</b> ——<b>原地升职</b>',
      '<b>斩官</b> ——<b>人元克贵神</b>，最怕',
      '<b>财动</b> ——<b>将神克贵神，求官大忌</b>',
      '<b>求职</b>：',
      '<b>利于求职的条件——外生内、内生外、三合六合。</b>',
      '<b>求职与求官的区别</b>：',
      '<b>求职</b> ——<b>只关乎成败，不关乎损失</b>',
      '<b>求职最忌官动</b> ——<b>因为官动主诉讼</b>',
      '<b>一个细节</b>：',
      '<b>贵神克将神不利求职，却利于求名。</b>',
      '<b>为什么？</b> 因为<b>求职是"找工作"，求名是"求名声"</b> ——<b>贵神克将神主"外来压制"，对找工作不利；但对求名声，反而是"有压力才有动力"。</b>',
      '<b>课式实证</b>',
      '<code>`</code>',
      '干支：戊子年　辛酉月　己卯日　辛未时',
      '月将：辰　日空：申、酉　四大空亡：无',
      '人元：癸　　水 - 旺',
      '贵神：甲子（玄武）　水 + 旺　六甲',
      '将神：庚午（胜光）用　火 + 死　月德',
      '地分：酉　　金 - 休　截路',
      '<code>`</code>',
      '<b>问职位</b>。<b>这一课没有官动</b>（贵神与人元同为水，比和）—— <b>但贵神官爻旺相</b> ✓ —— <b>所以"有官"，只是不是靠发动得来的</b>。',
      '<b>求职看什么？</b> <b>求职最忌官动</b> —— <b>官动是"无官之人逢官动，主诉讼"，放到求职上就是"求不成还惹口舌"</b>。',
      '<b>这一课没有官动</b> —— 所以<b>求职这一问是顺的</b>；<b>再看贵神临太岁（假太岁）</b> —— 主<b>有上层的人肯点头</b>。',
      '<b>三、婚姻</b>',
      '<b>贼动断婚姻</b>：',
      '<b>婚前</b> ——<b>脚踏两只船</b>',
      '<b>婚后</b> ——<b>第三者插足</b>',
      '<b>外情几近必然，桃花贼动百分之百</b>',
      '<b>妻动断婚姻</b>：',
      '<b>妻动必定人嫌我</b> ——<b>对方对自己有意见</b>',
      '<b>第三者比求测者强势</b> ——<b>妻动 = 外克内</b>',
      '<b>鬼动断婚姻</b>：',
      '<b>已婚断法</b> ——<b>人元为男、地分为女；妻动与鬼动</b>',
      '<b>其他</b>：',
      '<b>断婚姻四大忌</b> ——<b>冲、绝、刑、破</b>（<b>"冲散绝离"</b>）',
      '<b>婚前反反复复的取象</b> ——<b>巳亥冲</b>',
      '<b>一个细节</b>：',
      '<b>以人元克地分断寿之长短</b> ——<b>人元克地分，还可以断"女人的寿命不如男人高"</b>（因为人元为男、地分为女）。',
      '<b>课式实证</b>',
      '<code>`</code>',
      '人元：己　　土',
      '贵神：丁卯　木',
      '将神：乙丑（大吉）用　土',
      '地分：巳　　火',
      '<code>`</code>',
      '<b>断婚姻，分你我必须落在二神上</b> —— <b>求测方在将神，对方就是贵神</b>。',
      '<b>这一课用神在将神乙丑</b> —— <b>求测的一方是将神</b>，<b>对方看贵神丁卯</b>。',
      '<b>二神的关系是贵神卯木克将神丑土</b> —— <b>贼动</b> —— <b>对方克自己</b> —— <b>主对方强势、自己受制</b>。',
      '<b>再看二神天干</b> —— <b>丁与乙不合</b> —— <b>天干不合，说明矛盾是明着来的，不是暗中算计</b>。',
      '<b>断婚姻里的贼动还有一层</b>：<b>主"婚前脚踏两只船"或"婚后第三者插足"</b> —— <b>但是不是真要这么断，还要看二神的天干合不合、地分生不生贵神</b> —— <b>这一课两样都没有，所以只断"强势、不合"，不断"外情"。</b>',
      '<b>四、断病</b>',
      '<b>五动在断病上的对应</b>：',
      '| 动 | 病灶 |',
      '|---|---|',
      '| <b>官动</b> | <b>病在咽喉</b>（也有说在头部） |',
      '| <b>贼动</b> | <b>腹部受损，病情不轻</b> |',
      '| <b>财动</b> | <b>病在胸，不易治愈</b> |',
      '| <b>鬼动</b> | <b>阴性病症、怪异之症</b> |',
      '<b>鬼动的断病</b>：',
      '<b>鬼动之症——来得蹊跷的"怪异之症"。</b>',
      '<b>鬼动占病常有阴性病症，或家中不宁忧愁。</b>',
      '<b>化解的原则</b>：',
      '<b>痊病物仰合。方克干，方为医生、干为病，医生克制病症能治愈。</b>',
      '<b>课式实证</b>',
      '<code>`</code>',
      '干支：乙未年　壬午月　癸亥日　癸亥时',
      '月将：未　日空：子、丑　四大空亡：金',
      '人元：丙　　火 + 休　月德',
      '贵神：丁巳（腾蛇）用　火 - 休　天医、驿马、吊客、六丁',
      '将神：壬子（神后）　水 + 死　丧车',
      '地分：辰　　土 + 旺',
      '<code>`</code>',
      '<b>四动对应病灶，这一课占了两样</b>：',
      '<b>将神壬子水克贵神丁巳火</b> —— <b>财动</b> —— <b>但问病不论财</b> —— <b>这里只取"水克火"的象</b>：<b>巳火主心脏、主两目</b> → <b>心脏与眼目上的病</b>；',
      '<b>人元丙火生地分辰土</b> —— <b>子孙动</b> —— <b>火生土而土带湿气</b> —— <b>主"火被闷住"</b> —— <b>虚火、闷胀一类</b>。',
      '<b>用神是贵神丁巳</b>，<b>处"休"地又被水克</b> —— <b>用神受伤</b> —— <b>所以断"病要重视"</b>。',
      '<b>但天医正落在用神上</b> —— <b>主"有救、能治"</b> —— <b>所以断"需慢慢调，不至危"</b>。<b>这就是断病的分寸</b>：<b>用神受伤说"重视"，天医在位说"能治"，两头都说，才不吓人也不耽误人。</b>',
      '<b>五、升学</b>',
      '<b>升学喜官动鬼动见二马。</b>',
      '<b>将神克人元、贵神克人元再见二马——必中无疑。</b>',
      '<b>即</b>：',
      '<b>官动</b> ——利升学（有官贵之象）',
      '<b>鬼动</b> ——利升学（下克上，进取之象）',
      '<b>二马（天马、驿马）</b> ——主快',
      '<b>课式实证</b>',
      '<code>`</code>',
      '（升学与求官、求职性质相近，断法可以直接套用）',
      '干支：庚午年　戊寅月　甲子日　庚午时',
      '月将：亥　日空：戌、亥　四大空亡：水',
      '人元：庚　　金 + 旺',
      '贵神：戊申（白虎）用　金 + 旺',
      '将神：庚戌（河魁）　土 + 休',
      '地分：戌　　土 + 休',
      '<code>`</code>',
      '<b>升学看两条</b>：<b>官爻旺不旺、有没有二马</b>。',
      '<b>这一课贵神申金旺相</b> —— <b>官爻有力</b> ✓；<b>申又自带驿马之气</b> —— <b>主"快"</b> ✓。',
      '<b>再看"官鬼同动"</b> —— <b>官动是贵神克人元</b>、<b>鬼动是地分克人元</b> —— <b>这一课贵神申金不克人元庚金（同类），地分戌土反生人元金</b> —— <b>两条都没有</b>。',
      '<b>所以这一课断"能上，但不是一战而定的那种"</b> —— <b>要按"官爻旺、缺发动"来收口</b>。<b>升学最怕的是把"必中无疑"这类话说满</b> —— <b>凡是歌诀里的绝对话，都要先放到旺衰、空亡、二马里过一遍。</b>',
      '<b>六、官非诉讼</b>',
      '<b>干神相生能和解；妻动我方不得理；鬼动牵涉他人。</b>',
      '<b>即</b>：',
      '<b>官动</b> ——主诉讼',
      '<b>妻动</b> ——我方不得理',
      '<b>鬼动</b> ——牵涉他人',
      '<b>化解</b>：',
      '<b>干神相生能和解。</b>',
      '---',
      '<b>课式实证</b>',
      '<code>`</code>',
      '干支：（这一课原记录未标四柱，只留四位与月建）',
      '月将：（略）',
      '人元：辛　　金 - 死',
      '贵神：午（朱雀）用　火 + 旺　病符',
      '将神：酉　　金 - 死　天医',
      '地分：丑　　土 - 相',
      '<code>`</code>',
      '<b>这一课问的是合同官司</b>。<b>断官非，主要看三条</b>：',
      '<b>干神相生能和解</b> —— <b>人元辛金、贵神天干…</b> 这一课贵神是朱雀午火，<b>火克金</b> —— <b>干神不相生</b> —— <b>所以断"和解不成"</b> ✓；',
      '<b>妻动我方不得理</b> —— <b>妻动是人元克地分</b> —— <b>辛金不克丑土</b> —— <b>这一课没有妻动</b> —— <b>所以不是"我方理亏"</b>；',
      '<b>鬼动牵涉他人</b> —— <b>鬼动是地分克人元</b> —— <b>丑土生辛金</b> —— <b>不是鬼动</b>。',
      '<b>三条只中一条</b> —— <b>所以断"这场官司有得打，但不是一边倒"</b>。<b>后来这一课断出"对方毁约、合同有漏洞、有转租"，最后是撤诉了结</b> —— <b>应的是"干神不相生、和不了，但也伤不到根本"。</b>',
      '<b style="color:var(--c-gold)">本章小结</b>',
      '<b>一、总论</b>',
      '<b>五动三动是金口诀的杀手锏</b> ——「不识五动三动，就等于不识金口诀」。',
      '<b>八动名目</b>：五动（妻动、官动、贼动、财动、鬼动）+ 三动（父母动、子孙动、兄弟动）。',
      '<b>命名根据六亲</b>：克我者为官鬼、我克者为妻财、生我者为父母、我生者为子孙、同性者为兄弟。',
      '<b>同样"克我"，贵神为"官"、地分为"鬼"</b> ——因为位置尊卑不同。',
      '<b>五动三动是"粗断"</b> ——给出大意和方向，细节还需"五行之内细推元"。',
      '<b>二、五动</b>',
      '<b>妻动（人元克地分）</b> ——<b>我方有损</b>；破财、孩子有灾、外来索取；是<b>隔位相克</b>，二神的态度决定力度。',
      '<b>官动（贵神克人元）</b> ——<b>有官利求官，无官主诉讼</b>；「官财不两求」；官动逢合要看合化出的五行。',
      '<b>贼动（贵神克将神）</b> ——<b>首断损财</b>；贼神入玄武主失盗；<b>贼动逢空不断失</b>；婚姻主外情；「贼动内贼生」<b>必须再逢天干相合</b>。',
      '<b>财动（将神克贵神）</b> ——<b>必有财</b>；以财求财、宜投资；但<b>要分旺动与休囚死动</b>。',
      '<b>鬼动（地分克人元）</b> ——<b>半吉半凶</b>；主灾怪、出外、争讼；<b>占官喜鬼动</b>。',
      '<b>五动总心法</b>：<b>上克下、外克内，谁被克谁出事。</b>',
      '<b>三、三动</b>',
      '<b>父母动（地分生人元）</b> ——<b>印绶，大吉</b>；主文书喜庆、正直、多为正职。',
      '<b>子孙动（人元生地分）</b> ——<b>小吉</b>；主添人进口、外来财物；<b>利求财但来财慢</b>（隔位相生）。',
      '<b>兄弟动（人元与地分同）</b> ——<b>小凶</b>；主争执不合、事在比肩多有不成。',
      '<b>一类朝元</b>（四位全同）——主事体重叠、闭伏不动、淹滞阻隔。',
      '<b>四、扩展的动</b>',
      '<b>贵神克地分</b> ——主隔手求财，谋望晚成但终有可成。',
      '<b>地分克贵神</b> ——也是财动（用存款财动）。',
      '<b>将神克地分</b> ——只宜讲"动用存款"，<b>严格说是"消耗"不是"破财"</b>。',
      '<b>天干之动</b> ——也可同断，但<b>力小主外</b>。',
      '<b>五、动的力量与顺序</b>',
      '<b>谁发动，就是为谁的利益而来</b>；谁发动，代表谁的想法。',
      '<b>力量互减</b> ——二力抵一力时，动的力量几乎消失（「雷声大雨点小」）。',
      '<b>不得反失</b> ——无力量硬发动，不但得不到，反而损失。',
      '<b>不克不动、不冲不动、不刑不动</b> ——找"克"就是找矛盾点。',
      '<b>六、各门类中的运用</b>',
      '<b>求财</b>——四条件；求财最怕贼动。',
      '<b>求官</b>——三条件（要有官动、最怕贼动、喜欢有鬼动）；官动不带马星原地升职，带二马要挪地方。',
      '<b>求职</b>——三条件（外生内、内生外、三合六合）；<b>最忌官动</b>。',
      '<b>婚姻</b>——贼动主第三者（婚前脚踏两只船、婚后插足）；妻动主对方有意见；四大忌（冲绝刑破）。',
      '<b>断病</b>——官动在咽喉、贼动在腹部、财动在胸、鬼动主怪异之症。',
      '<b>升学</b>——喜官动鬼动见二马。',
      '---',
      '<b style="color:var(--c-gold)">心法</b>',
      '<b>五动三动是"第一步"</b>',
      '<b>金口诀入门容易，提高难。</b>',
      '<b>难在哪里？</b> 难在<b>断课的时候不知道从哪里下手</b>。',
      '<b>五动三动就是"下手处"</b> ——<b>课一起出来，先看有没有动</b>：',
      '<b>有动</b> ——<b>性质大方向就定了</b>',
      '<b>没动</b> ——<b>再看其他关系</b>',
      '<b>断课的第一关可以总结为三句话</b>：',
      '<b>从哪下手、怎么全面、怎么活变。</b>',
      '<b>五动三动解决的就是"从哪下手"。</b>',
      '<b>高层也不是不用五动三动</b>',
      '<b>有一种说法是"金口诀学到高层，就不用看五动三动了"</b> ——<b>这是错的。</b>',
      '<b>因为到了高层，我们已经熟悉到不用专门去找五动三动，就像我们已经会奔跑，而不再去注意怎么迈第一步。</b>',
      '<b>但习惯性的怎么迈第一步，已经成了规律性的过程。</b>',
      '<b>所谓的高层，是在五动三动之后，继续细致分析、精钢淬炼的阶段。</b>',
      '<b>就像游泳</b> ——<b>高手不再想"手怎么划、脚怎么蹬"，但这些动作一个都没少。</b>',
      '<b>口诀要"深入进去理解"</b>',
      '<b>这一点很重要</b>：',
      '<b>口诀是至高的，但不是万能的。</b>',
      '<b>单纯的靠口诀去断课，只能是"观其大意"了。</b>',
      '<b>为什么？</b>',
      '<b>因为口诀是"经验的提炼"</b> ——<b>它概括的是最常见的情况。</b> 但<b>实际情况千变万化</b>：',
      '<b>同样一个妻动</b> ——二神生助和二神反克，结果完全不同',
      '<b>同样一个财动</b> ——旺动和休囚死动，结果完全相反',
      '<b>所以</b>：',
      '<b>必须重视学习五行的生克制化之理。</b>',
      '<b>口诀是"路标"，不是"终点"。</b> 看到路标，还要沿着路走进去。',
      '<b>有动有象必有事</b>',
      '<b>"贼动逢空不断失"</b> ——<b>但也不等于没事</b>。',
      '<b>有动有象必有事，应期看旺衰时令。</b>',
      '<b>这句话很有分量</b>：',
      '<b>课里出现了一个"象"，就一定有相应的事</b> ——<b>只是时间早晚的问题。</b>',
      '<b>所以断课不能因为"逢空"就放松</b> ——<b>要记住这个象早晚会应，只是要等时机。</b>',
      '<b>这也是这门学问的严谨之处</b> ——<b>有象必有事，不是"猜"，是"推"。</b>',
    ]},
    { t: '第七章　神煞', rows: [
      '<b style="color:var(--c-gold)">引言</b>',
      '<b>这一章讲什么</b>',
      '前面几章讲的都是<b>课内四位之间的关系</b> ——生、克、冲、合、刑、害、破、绝。',
      '<b>这一章讲"课外的因素"</b> ——<b>神煞</b>。',
      '<b>什么是神煞？</b>',
      '<b>神煞是一种人在时空中所临的吉凶状态，是处于有利时期还是处在不利的时间。</b>',
      '<b>简单地打个比方</b>：',
      '<b>四位的关系</b> ——像<b>几个人的实力对比</b>（谁强谁弱、谁跟谁合得来）',
      '<b>神煞</b> ——像<b>这几个人今天运气怎么样</b>（有没有遇到贵人、有没有犯小人）',
      '<b>同样一支队伍</b>，实力很强（四位关系好），但<b>如果赶上霉运（凶煞入课）</b>，也可能办不成事。<b>这就是神煞的作用。</b>',
      '<b>神煞的地位</b>',
      '<b>入式歌里有两句，把神煞的地位说得很清楚</b>：',
      '<b>凭驿马、神煞定其吉凶，以空亡、月破、支干三合、六合验其成败。</b>',
      '<b>注意这个分工</b>：',
      '| 手段 | 作用 |',
      '|---|---|',
      '| <b>驿马、神煞</b> | <b>定其吉凶</b> |',
      '| <b>空亡、月破、三合六合</b> | <b>验其成败</b> |',
      '<b>所以神煞管的是"吉凶"，不是"成败"。</b>',
      '<b>还有一点同样重要</b>：',
      '<b>神煞对应事人起辅助作用，能起到逢凶化吉，或者转吉为凶的作用。</b>',
      '<b>"辅助"两个字是关键</b> ——<b>神煞不能决定大局，但能影响大局。</b>',
      '<b>这一章的学法</b>',
      '<b>神煞名目繁多，但有轻重之分</b>：',
      '<b>最常用的</b>——<b>驿马、天马</b>（断"动"离不开它）',
      '<b>常用的吉神</b>——天德、月德、天喜、天赦、三奇',
      '<b>常用的凶煞</b>——丧门、吊客、飞廉、五鬼、病符、劫煞',
      '<b>特殊的一类</b>——<b>桃花</b>（断婚姻必用）',
      '<b>要单独讲的</b>——天罗地网、关隔锁、四丘四墓',
      '<b>神煞的学习要记住一句话</b>：',
      '<b>学习神煞没有捷径可寻，只能用心记忆、灵活运用。</b>',
      '---',
      '<b style="color:var(--c-gold)">第一节　总论</b>',
      '<b>一、神煞是什么</b>',
      '<b>1.1 定义</b>',
      '<b>神煞是一种人在时空中所临的吉凶状态。是处于有利时期还是处在不利的时间。大到年月，小至日时刻。</b>',
      '<b>通过贵神煞的观察，得到当事人所对应的吉神和凶煞。</b>',
      '<b>注意"时空"两个字</b> ——<b>神煞是"时间加空间"的概念</b>：',
      '<b>时间</b> ——它在某个月、某一天出现',
      '<b>空间</b> ——它落在课中的某个位置',
      '<b>所以同样一个神煞，落在不同位置，意思不同</b>：',
      '<b>落在贵神</b> ——<b>外面的事</b>',
      '<b>落在将神</b> ——<b>自己的事</b>',
      '<b>落在地分</b> ——<b>家里的事</b>',
      '<b>1.2 神煞的来源</b>',
      '<b>神煞其实就是对地球的运行轨迹，对宇宙和众多星宿对应地球的规律运算，包容了干支、五行、八卦、纳音、星宿等推算所得。</b>',
      '<b>神煞的门类很多</b>：',
      '<b>门类派系神煞种类繁多，体系庞杂。随着命理学的发展，很多神煞已经逐渐被淘汰不用。</b>',
      '<b>所以学神煞要有取舍</b> ——<b>只学常用的那些。</b>',
      '<b>1.3 神煞的用处</b>',
      '<b>懂得了这些神煞，就可以选择时空择吉避凶，利用吉利的日子。</b>',
      '<b>神煞有两大用处</b>：',
      '<b>断吉凶</b> ——课里带了什么神煞，就知道这件事顺不顺',
      '<b>选时机</b> ——避开凶煞的日子，选吉神当值的日子办事',
      '<b>二、神煞的使用原则</b>',
      '<b>2.1 神煞是辅助，不是绝对</b>',
      '<b>这是最重要的一条原则</b>：',
      '<b>神煞对应事人起辅助作用，能起到逢凶化吉，或者转吉为凶的作用。</b>',
      '<b>"辅助"意味着</b>：',
      '<b>好课带凶煞</b> ——<b>好课也生变</b>（凶煞入课，好课也出问题）',
      '<b>坏课带吉神</b> ——<b>可能逢凶化吉</b>',
      '<b>所以看神煞，要结合课体的整体情况。</b>',
      '<b>2.2 神煞也要看旺衰</b>',
      '<b>神煞本身也有力量强弱</b>：',
      '<b>凡逢冲、破、空亡，其神无力，吉庆不吉。</b>',
      '<b>即</b>：',
      '<b>吉神逢冲破空亡</b> ——<b>吉不起来</b>（因为神煞本身没力气了）',
      '<b>凶煞逢冲破空亡</b> ——<b>凶也凶不起来</b>',
      '<b>所以</b>：',
      '<b>神煞是活的，要看它的状态。</b>',
      '<b>2.3 常用神煞清单</b>',
      '<b>包括：天德、月德、天德合、月德合、天喜、三奇、驿马、天马、劫煞、五鬼等、截命灾煞、吊客、丧门、天医地医、飞廉、关隔锁等。</b>',
      '<b>这一章按七节展开</b>：',
      '<b>总论 → 驿马与天马 → 吉神 → 凶煞 → 桃花 → 其他神煞 → 神煞的活用。</b>',
      '<b>要说明的是</b>：上面那份清单是源流里的常用名录（末尾带一个"等"字）。<b>为了让读者查得到，本章另外收了六条</b> —— <b>病符、禄倒、马倒、四丘、四墓、连茹</b>。<b>这六条不在前面那份清单里，但断课时都用得上，所以一并收进来。</b>',
      '<b>还有一条态度</b>：<b>神煞名录各家不同，收多收少不是关键 —— 关键是"记得住、用得上"。</b> 这一章收的都是断课时真会碰到的；遇到没见过的煞，<b>先看它的起例和五行属性，再决定怎么用</b>。',
      '---',
      '<b style="color:var(--c-gold)">第二节　驿马与天马</b>',
      '<b>驿马和天马是金口诀中使用频率最高的神煞</b> ——<b>因为断"动"离不开它。</b>',
      '<b>驿马是金口诀断课使用频率最高的神煞。</b>',
      '<b>一、驿马</b>',
      '<b>1.1 起例</b>',
      '<b>申子辰马在寅</b>',
      '<b>亥卯未马在巳</b>',
      '<b>巳酉丑马在亥</b>',
      '<b>寅午戌马在申</b>',
      '<b>规律怎么看？</b>',
      '<b>每个三合局，驿马在它的"对立局"的第一个字</b> ——<b>或者说，驿马就是三合局的"冲位"的前一位</b>：',
      '<b>申子辰（水局）</b> ——马在<b>寅</b>',
      '<b>寅午戌（火局）</b> ——马在<b>申</b>',
      '<b>亥卯未（木局）</b> ——马在<b>巳</b>',
      '<b>巳酉丑（金局）</b> ——马在<b>亥</b>',
      '<b>注意</b>：<b>水局和火局的驿马互相在对方的局里</b>（申子辰马在寅，寅午戌马在申）；<b>木局和金局的驿马也互相在对方的局里</b>（亥卯未马在巳，巳酉丑马在亥）。',
      '<b>这就是"两个对立局互为驿马"</b>。',
      '<b>1.2 双向驿马（重要）</b>',
      '<b>这个"互为驿马"的关系很有用</b>：',
      '<b>驿马不只是"驿马位"——两个对立局互为驿马。</b>',
      '<b>有了"互为驿马"，很多断不出的信息就出来了。</b>',
      '<b>举例</b>：',
      '<b>课内有寅</b> ——<b>寅属于寅午戌火局，它的驿马在申</b>。',
      '<b>同时，寅也是申子辰水局的驿马。</b>',
      '<b>所以看到寅，你要想两件事</b>：',
      '<b>寅自己是不是驿马</b>（看起课的年月日时是什么局）',
      '<b>寅会不会"引出"它的驿马（申）</b>',
      '<b>这个"双向"的思路，能断出很多隐蔽的信息。</b>',
      '<b>1.3 起驿马的位置</b>',
      '<b>驿马一般在日上起，但也可以在年月上起驿马。</b>',
      '<b>三处驿马代表三个时间段</b>：',
      '<b>年上起的驿马</b> ——<b>时间跨度大</b>（一年）',
      '<b>月上起的驿马</b> ——<b>时间跨度中</b>（一月）',
      '<b>日上起的驿马</b> ——<b>时间跨度小</b>（近期）',
      '<b>所以断不同时间尺度的事，用不同位置的驿马。</b>',
      '<b>1.4 驿马的断法</b>',
      '<b>基本断法</b>：',
      '<b>驿马入课旺相，主求事迅速；生外出行迅速，生内行人迷归；若求失物则难寻。</b>',
      '<b>空、破、冲主吉凶不定，计划变更，必须等到空、破、冲过后方能言成。</b>',
      '<b>逐句解释</b>：',
      '<b>"旺相主求事迅速"</b>',
      '<b>驿马旺</b> ——<b>事情快</b>',
      '<b>驿马休囚</b> ——<b>事情慢</b>',
      '<b>"生外出行迅速，生内行人迷归"</b>',
      '<b>驿马生外</b> ——<b>出门快</b>',
      '<b>驿马生内</b> ——<b>外面的人想回来</b>（但"迷归"是"不想回来"的意思，这里是说驿马生内则在外的人不愿归）',
      '<b>"若求失物则难寻"</b>',
      '<b>寻找失物、走失行人，不利见天马驿马</b> ——因为马主"跑"，跑远了就难找',
      '<b>"空、破、冲主吉凶不定"</b>',
      '<b>驿马逢空、破、冲</b> ——<b>计划会变更</b>',
      '<b>必须等空破冲过后才能言成</b>',
      '<b>1.5 驿马逢合则止</b>',
      '<b>这是断"人来期"的关键</b>：',
      '<b>驿马断应期，驿马旺逢合则止。比如驿马为寅，到亥则止，亥为应期。</b>',
      '<b>即</b>：',
      '<b>驿马是寅</b> ——<b>它的合是亥</b>',
      '<b>所以"到亥"的时候，驿马就"停"了</b> ——<b>这就是应期</b>',
      '<b>反过来</b>：',
      '<b>驿马被合走不动，逢冲才能动。比如驿马寅逢亥为驿马被合，需要申或巳冲动。</b>',
      '<b>即</b>：',
      '<b>驿马被合</b> ——<b>动不了</b>（比如寅被亥合）',
      '<b>要逢冲才能动</b> ——<b>寅需要申（冲）或巳（刑）来冲动</b>',
      '<b>这个"逢合则止、逢冲则动"是断驿马的两条基本法则。</b>',
      '<b>1.6 课式实证：谁带驿马谁想动</b>',
      '<code>`</code>',
      '四柱：丙申年　壬辰月　甲戌日　壬申时',
      '月将：酉　日空：申、酉　四大空亡：无',
      '人元：壬　　水 + 相　　天德、月德',
      '贵神：壬申（白虎）　金 + 旺　　天德、月德、驿马、截路',
      '将神：癸酉（从魁）用　金 - 旺　　丧车',
      '地分：申　　金 + 旺　　驿马、截路',
      '<code>`</code>',
      '<b>问事</b>：一位女士替丈夫问工作。',
      '<b>这一课的驿马有两处</b> —— <b>贵神申金带驿马，地分申金也带驿马</b>。',
      '<b>先看"谁带驿马"</b>：',
      '<b>贵神带驿马</b> —— <b>工作要动</b> —— 所以第一句断的是"<b>他心里有想动工作的念头</b>"；',
      '<b>地分带驿马</b> —— <b>老本要动</b> —— 家宅、根基这一块也要跟着挪。',
      '<b>两个位置同时带马</b> —— 说明<b>这个"动"不是他想不想的问题，是内外都在催</b>：<b>上面有调动、下面要挪窝</b>。',
      '<b>再看"双向驿马"</b>：<b>申属申子辰水局，它自己的驿马在寅</b>；<b>同时，申又是寅午戌火局的驿马</b> —— <b>一个"申"字，两头都占</b>。',
      '<b>所以看到申，要同时想两件事</b>：<b>它想往寅那边动</b>（自己的马在寅），<b>它又被火局那边催着动</b>（火局的马正是它）。<b>这一课断"最少还有三个人一起、去向不止一处"，取的就是这份"两头牵扯"的象。</b>',
      '<b>1.6 驿马的受制</b>',
      '<b>驿马受制的情况有几种</b>：',
      '<b>驿马受制——空、破、冲、刑、害与被合，主迟缓、拖延与应期。</b>',
      '<b>即</b>：',
      '<b>空</b> ——驿马落空，主"空跑"',
      '<b>破</b> ——计划变更',
      '<b>冲</b> ——反而不定',
      '<b>刑</b> ——纠缠',
      '<b>害</b> ——受阻',
      '<b>被合</b> ——动不了',
      '<b>这些情况都主"迟缓、拖延"，同时也就是应期的所在。</b>',
      '<b>1.7 马头与马群</b>',
      '<b>驛马还有两个衍生概念</b>：',
      '<b>"马头"</b>：',
      '<b>什么是马头？就是驿马生合的方向，比如驿马寅，午火方向、亥水方向。</b>',
      '<b>驿马逢三合六合为马群，就是多人结伴出行。</b>',
      '<b>逐句解释</b>：',
      '<b>马头</b> ——<b>驿马所生、所合的方向</b>（寅生午、寅合亥，所以午和亥是寅的马头方向）',
      '<b>马群</b> ——<b>驿马逢三合六合，主多人结伴出行</b>',
      '<b>1.8 驿马断去向、走失与搬迁</b>',
      '<b>驿马的实用断法</b>：',
      '<b>断去向</b> ——看驿马落在哪个地支，那个地支的方位就是去向',
      '<b>断走失</b> ——驿马主"跑"，跑远了难寻',
      '<b>断搬迁</b> ——马动主搬迁',
      '<b>驿马不在用神上也能断</b>：',
      '<b>二马（驿马、天马）不必在用神上——课内只要出现马相，就有"走"的信息。</b>',
      '<b>二、天马</b>',
      '<b>2.1 起例</b>',
      '<b>天马在月上起。正七午，二八申，三九戌，四十子，五十一寅，六腊辰。</b>',
      '<b>逐月对照</b>：',
      '| 月 | 天马 |',
      '|---|---|',
      '| <b>正月、七月</b> | <b>午</b> |',
      '| <b>二月、八月</b> | <b>申</b> |',
      '| <b>三月、九月</b> | <b>戌</b> |',
      '| <b>四月、十月</b> | <b>子</b> |',
      '| <b>五月、十一月</b> | <b>寅</b> |',
      '| <b>六月、十二月</b> | <b>辰</b> |',
      '<b>规律</b>：<b>每两个月一组，地支隔一位往上走</b>（午→申→戌→子→寅→辰）。',
      '<b>2.2 断法</b>',
      '<b>天马入课迅速成，逃亡远去不归还，失物难寻不宜迟。</b>',
      '<b>天马入课主办事快捷，宜速不宜迟。</b>',
      '<b>天马旺相主飞快，休囚死不快。</b>',
      '<b>贵神见天马主升官或官司快讯到来，望事即，走失难寻。</b>',
      '<b>若天马受克主求事迟缓，滞留难动；天马受冲，动作迅速。</b>',
      '<b>乘坐飞机，出国天马应之。</b>',
      '<b>关键几条</b>：',
      '<b>天马主"快"</b> ——<b>办事快捷，宜速不宜迟</b>',
      '<b>天马旺相主飞快</b> ——休囚死则不快',
      '<b>受克主迟缓，受冲主动作迅速</b>',
      '<b>坐飞机、出国，应天马</b>',
      '<b>2.3 天马与驿马的区别</b>',
      '| | <b>驿马</b> | <b>天马</b> |',
      '|---|---|---|',
      '| <b>起法</b> | <b>日上起</b>（也可年月） | <b>月上起</b> |',
      '| <b>性质</b> | 主动、主行程 | <b>主快</b> |',
      '| <b>断法</b> | 逢合则止、逢冲则动 | 旺相飞快、受冲迅速 |',
      '<b>两者常合用</b>，称为「<b>二马</b>」。',
      '<b>2.4 二马的合断</b>',
      '<b>"二马"（驿马 + 天马）的用法</b>：',
      '<b>求官见二马</b> ——<b>主升官远迁</b>',
      '<b>升学见二马</b> ——<b>主快</b>',
      '<b>求事见二马</b> ——<b>主动、主快</b>',
      '<b>"二马"不在用神上也管用</b>：',
      '<b>二马（天马、驿马）出现在四位的取象——不在用神上也管用。</b>',
      '<b>2.5 课式实证：二马俱全</b>',
      '<code>`</code>',
      '干支：丙申年　甲午月　庚午日　辛巳时',
      '月将：未　日空：戌、亥　四大空亡：水',
      '人元：壬　　水 + 旺',
      '贵神：戊寅（青龙）用　木 + 相　天德合、天喜、天马',
      '将神：甲申（传送）　金 + 休　驿马、六甲、飞廉',
      '地分：午　　火 + 死　吊客、截路',
      '<code>`</code>',
      '<b>这一课两匹马都在</b>：<b>贵神寅木带天马</b>（五月起天马在寅）、<b>将神申金带驿马</b>（日支午属寅午戌，马在申）。',
      '<b>二马合看，断什么？</b>',
      '<b>驿马主"行"</b> —— 主行程、主出去；',
      '<b>天马主"快"</b> —— 主快、主急。',
      '<b>两个叠在一起</b> —— <b>主"这一趟又快又必须走"</b> —— 所以断<b>"出外、往返频繁，而且事情来得急"</b>。',
      '<b>如果两个只有一个</b>，说法就要分：<b>只有驿马</b> —— 说"要动"；<b>只有天马</b> —— 说"快"，不一定动身。',
      '<b>再看旺衰</b> —— <b>贵神寅木在"相"地</b>（水生木），<b>将神申金在"休"地</b>（金生水）—— <b>天马旺相，主飞快</b>（"天马旺相主飞快"），<b>所以这个"快"是能做实的</b>。### 三、谁带驿马谁想动',
      '<b>这是一条很实用的判据</b>：',
      '<b>谁带驿马谁想动——将神带驿马财要动，贵神带驿马工作要动，地分带驿马老本要动。</b>',
      '<b>逐句解释</b>：',
      '| 位置带驿马 | 含义 |',
      '|---|---|',
      '| <b>将神带驿马</b> | <b>财要动</b>（投资、花钱、求财） |',
      '| <b>贵神带驿马</b> | <b>工作要动</b>（调动、换工作） |',
      '| <b>地分带驿马</b> | <b>老本要动</b>（动存款、卖房、搬家） |',
      '<b>特别注意地分</b>：',
      '<b>地分临驿马——不光是手里的财，老本也要动。</b>',
      '<b>为什么？</b> 因为<b>地分是"最内、最稳、最不可更改的部分"</b> ——<b>连它都动了，说明是大事。</b>',
      '<b>还有一种情况</b>：',
      '<b>课内二神之间也能构成驿马关系——寅辰相见的"龙虎斗"。</b>',
      '<b>即</b>：<b>寅和辰</b> ——<b>它们在四柱上可能不构成驿马，但在课内两位之间可以构成驿马关系</b>（寅的驿马是申，辰的驿马也是寅；或者寅辰相见的特殊关系）。',
      '<b>这种"课内驿马"也要留意。</b>',
      '---',
      '<b style="color:var(--c-gold)">第三节　吉神</b>',
      '<b>一、天德、月德</b>',
      '<b>1.1 天德</b>',
      '<b>起例</b>：',
      '<b>正丁二申庚，三壬四辛同；</b>',
      '<b>五癸亥六甲，七癸八甲寅；</b>',
      '<b>九丙十居乙，子巳丑庚中。</b>',
      '<b>逐月对照</b>：',
      '| 月 | 天德 |',
      '|---|---|',
      '| <b>正月</b> | <b>丁</b> |',
      '| <b>二月</b> | <b>申</b> |',
      '| <b>三月</b> | <b>壬</b> |',
      '| <b>四月</b> | <b>辛</b> |',
      '| <b>五月</b> | <b>亥</b> |',
      '| <b>六月</b> | <b>甲</b> |',
      '| <b>七月</b> | <b>癸</b> |',
      '| <b>八月</b> | <b>寅</b> |',
      '| <b>九月</b> | <b>丙</b> |',
      '| <b>十月</b> | <b>乙</b> |',
      '| <b>十一月</b> | <b>巳</b> |',
      '| <b>十二月</b> | <b>庚</b> |',
      '<b>起法</b>：',
      '<b>天德以月上起。例：正月见丁，课中无论将干、神干、人元，正月立课者见丁入课者，皆属天德入课。</b>',
      '<b>注意</b>：<b>天德落在天干上的（如正月丁、三月壬），就查四位与四柱的天干</b> —— 不管它落在人元、将干还是神干，只要出现就算；<b>落在地支上的（如二月申、五月亥、八月寅），就查地支</b>。<b>两种都要认，不能只认天干。</b>',
      '<b>断法</b>：',
      '<b>天德入课无忧祸，逢凶化吉危得安。</b>',
      '<b>1.2 天德合</b>',
      '<b>天德合处：天德相合之处是也。</b>',
      '<b>例：丁壬化合，正月见丁为天德，若课内见壬则为天德合处入课。</b>',
      '<b>入课主解百祸，为吉庆之神，化凶解忧，又主尊长、贵人吉庆之喜，其它皆同。</b>',
      '<b>凡逢冲、破、空亡为吉庆不吉，因其神无力。</b>',
      '<b>即</b>：<b>天德的"五合"就是天德合</b>（丁壬合，所以正月见丁为天德，见壬为天德合）。',
      '<b>1.3 月德</b>',
      '<b>起例</b>：',
      '<b>寅午戌月在丙，亥卯未月在甲</b>',
      '<b>申子辰月在壬，巳酉丑月在庚</b>',
      '<b>逐局对照</b>：',
      '| 月局 | 月德 |',
      '|---|---|',
      '| <b>寅午戌月</b> | <b>丙</b> |',
      '| <b>亥卯未月</b> | <b>甲</b> |',
      '| <b>申子辰月</b> | <b>壬</b> |',
      '| <b>巳酉丑月</b> | <b>庚</b> |',
      '<b>记忆诀窍</b>：',
      '<b>寅午戌月合火局，对应的阳干是丙。亥卯未月合木局，则甲为月德。巳酉丑月合金局，则庚为月德。申子辰月合水局，则壬为月德。</b>',
      '<b>即</b>：<b>月德就是三合局对应的"阳干"</b>。',
      '<b>断法</b>：',
      '<b>月德入课主和睦，万事顺达有吉庆。</b>',
      '<b>月德入课解凶祸，化凶为吉，主尊长吉庆和合，凡逢冲、破、空亡，其神无力，吉庆不吉。</b>',
      '<b>1.4 月德合</b>',
      '<b>月德合处：月德相合之处是也。</b>',
      '<b>例：正月见丙，丙与辛合，若课中见辛则为月德合处入课。月德合处作用同月德，但其吉庆程度稍次之。</b>',
      '<b>记忆诀窍</b>：',
      '<b>丙与辛合，月德合为辛；甲与己合，月德合为己；庚与乙合，月德合为乙；壬与丁合，月德合为丁。</b>',
      '<b>一句话</b>：<b>月德是哪个干，就看这个干"合"出来的那一个干</b> —— <b>丙辛、甲己、庚乙、壬丁，四对。</b>',
      '<b>1.5 课式实证：天德合、月德合、月德同现</b>',
      '<code>`</code>',
      '人元：丙　　火 + 旺　天德合',
      '贵神：乙卯（六合）用　木 - 休　月德合',
      '将神：庚申（传送）　金 + 死　月德、驿马',
      '地分：辰　　土 + 相　天医',
      '<code>`</code>',
      '<b>这一课是巳月的课</b>（月建巳，所以天医落在辰——月建退一位）。<b>把巳月的几个吉神一次性列出来，再到四位上去找</b>：',
      '<b>巳月的天德是辛</b> —— <b>辛与丙合</b> —— <b>课内人元正是丙</b> —— 所以<b>丙是"天德合"</b> ✓',
      '<b>巳月属巳酉丑金局，月德是庚</b> —— <b>课内将神庚申的天干正是庚</b> —— 所以<b>庚是"月德"</b> ✓',
      '<b>庚与乙合</b> —— <b>课内贵神乙卯的天干是乙</b> —— 所以<b>乙是"月德合"</b> ✓',
      '<b>驿马</b>：日支属寅午戌局（寅午戌马在申）—— <b>课内庚申正是驿马</b> ✓',
      '<b>四个吉神认下来，规律就很清楚了</b>：',
      '<b>月煞（天德、月德、天医、天喜、天马）只认当月的月建，不认别的月。</b> 把当月的几个字列出来，再到四位（含四位的天干）上逐个对，<b>一个一个对完，不会漏，也不会把上个月的煞拿到这个月来用。</b>',
      '<b>再看这一课的吉凶</b>：<b>天德合在人元、月德在将神、天医在地分</b> —— <b>三处吉神</b> —— 但<b>将神庚申处"死"地</b>（火旺克金）—— <b>吉神所落的那一位本身不旺</b> —— 所以断的时候是"<b>凶事有解、但不至于大吉</b>"。',
      '<b>这正是天德月德的断法分寸</b>：',
      '<b>逢冲、破、空亡，吉庆不吉，因其神无力。</b>',
      '<b>落了吉神，还要看它站得稳不稳。</b>### 二、天赦',
      '<b>起例</b>：',
      '<b>春，戊寅。夏，甲午。秋，戊申。冬，甲子。</b>',
      '<b>逐季对照</b>：',
      '| 季 | 天赦 |',
      '|---|---|',
      '| <b>春</b> | <b>戊寅</b> |',
      '| <b>夏</b> | <b>甲午</b> |',
      '| <b>秋</b> | <b>戊申</b> |',
      '| <b>冬</b> | <b>甲子</b> |',
      '<b>注意</b>：<b>天赦是"干支同论"</b> ——<b>要天干和地支同时出现才算。</b>',
      '<b>断法</b>：',
      '<b>天赦入课主解刑禁危险之灾难。修造、婚姻、出入皆利，平安无事，有贵人帮助。</b>',
      '<b>古代大赦天下，就是有罪的人也能赦免无罪。求事吉利。</b>',
      '<b>三、天喜</b>',
      '<b>3.1 起例</b>',
      '<b>春天见戌、亥、子</b>',
      '<b>夏天见丑、寅、卯</b>',
      '<b>秋天见辰、巳、午</b>',
      '<b>冬天见未、申、酉</b>',
      '<b>逐季对照</b>：',
      '| 季 | 天喜（三个支） |',
      '|---|---|',
      '| <b>春</b> | <b>戌、亥、子</b> |',
      '| <b>夏</b> | <b>丑、寅、卯</b> |',
      '| <b>秋</b> | <b>辰、巳、午</b> |',
      '| <b>冬</b> | <b>未、申、酉</b> |',
      '<b>规律</b>：<b>从"戌"起，按季节顺行三位</b>。',
      '<b>3.2 真假天喜（重要）</b>',
      '<b>天喜分真假</b>：',
      '<b>春天寅月见戌为真天喜，见亥、子为假；卯月见亥为真天喜，见戌、子为假；辰月见子为真天喜，见戌、亥为假；余仿此。</b>',
      '<b>真天喜记忆窍门</b>：',
      '<b>春戌夏丑喜饵加，秋辰冬未顺无差。</b>',
      '<b>逐月对照</b>：',
      '| 月 | 真天喜 |',
      '|---|---|',
      '| <b>正月（寅）</b> | <b>戌</b> |',
      '| <b>二月（卯）</b> | <b>亥</b> |',
      '| <b>三月（辰）</b> | <b>子</b> |',
      '| <b>四月（巳）</b> | <b>丑</b> |',
      '| <b>五月（午）</b> | <b>寅</b> |',
      '| <b>六月（未）</b> | <b>卯</b> |',
      '| <b>七月（申）</b> | <b>辰</b> |',
      '| <b>八月（酉）</b> | <b>巳</b> |',
      '| <b>九月（戌）</b> | <b>午</b> |',
      '| <b>十月（亥）</b> | <b>未</b> |',
      '| <b>十一月（子）</b> | <b>申</b> |',
      '| <b>十二月（丑）</b> | <b>酉</b> |',
      '<b>即</b>：<b>"月建退四位"就是真天喜</b> ——<b>比如寅月退四位（寅→丑→子→亥→戌），得戌。</b>',
      '<b>假天喜入课不喜或空欢喜，或主他人有喜事，与己无关。</b>',
      '<b>3.3 断法</b>',
      '<b>天喜家中逢喜庆，婚姻进财交朋友酒食宴会添人口，升学参军官亨通。</b>',
      '<b>入课者以贵神、将神、地分为应，即为天喜入课，主吉庆和合。</b>',
      '<b>贵神见天喜，喜在外；将神见天喜，喜在内；外爻生内爻喜从外来，内爻生外爻喜从内出。</b>',
      '<b>凡见冲、破、空亡则不喜或空喜一场。</b>',
      '<b>3.4 课式实证：天喜入课</b>',
      '<code>`</code>',
      '干支：（这一课原记录未标四柱）',
      '月将：（略）',
      '人元：乙　　木 - 旺',
      '贵神：庚戌（天空）　土 + 死',
      '将神：甲辰（天罡）用　土 + 死　天喜、六甲、飞廉',
      '地分：巳　　火 - 相　驿马',
      '<code>`</code>',
      '<b>天喜落在将神甲辰上</b>。',
      '<b>按"入课者以贵神、将神、地分为应"这条规矩</b> —— <b>天喜在将神</b> —— <b>"将神见天喜，喜在内"</b> —— <b>所以主"家里的喜事"</b>：<b>添人口、办酒席、婚姻进财这一类</b>。',
      '<b>同一位上还有"六甲"</b> —— <b>甲辰的天干是甲</b> —— <b>六甲主生发、主开始</b> —— <b>两样叠在一起，喜事就偏向"添丁、起新摊子"</b>。',
      '<b>但要看它的状态</b>：<b>甲辰土处在"死"地</b>（木旺克土）—— <b>天喜本身不旺</b> —— <b>所以断的时候说"有喜，但不厚"</b>。',
      '<b>这就是天喜的断法要点</b>：<b>先看落在哪位（定喜在内外），再看旺衰（定喜厚薄）。</b>### 四、三奇',
      '<b>4.1 起例</b>',
      '<b>天三奇，甲戊庚；地三奇，乙丙丁；人三奇，壬癸辛。</b>',
      '<b>三奇以年、月、日、时及课中人元、神干、将干来确定。</b>',
      '<b>即</b>：<b>三处（人元、神干、将干）或四柱中出现这三个天干，就是三奇。</b>',
      '<b>4.2 断法</b>',
      '<b>凡占课遇三奇，利见大人，百事吉昌，求官得官，求财得财，孕生贵子，上下有辅，贵人相助，万事亨通。</b>',
      '<b>其中乙丙丁三奇效果最佳。</b>',
      '<b>贵人相助，奇遇相识，天三奇利于考试、文书、印绶。</b>',
      '<b>三奇是不以人的意志为转移，突然奇遇或贵人相助，达到意想不到的奇效。临用者为吉。</b>',
      '<b>4.3 三种三奇的区别</b>',
      '<b>三种三奇的力度不同</b>：',
      '| 三奇 | 力度 |',
      '|---|---|',
      '| <b>乙丙丁（地三奇）</b> | <b>效果最佳</b> |',
      '| <b>甲戊庚（天三奇）</b> | <b>利考试、文书、印绶</b> |',
      '| <b>壬癸辛（人三奇）</b> | 也吉 |',
      '<b>4.4 三奇的取舍</b>',
      '<b>有一条重要的限定</b>：',
      '<b>三奇的取舍——可断应期、不解空亡。</b>',
      '<b>即</b>：',
      '<b>三奇可以用来断应期</b> ——<b>课内见三奇中的两个，寻另一个为应期</b>',
      '<b>但三奇不能解空亡</b> ——<b>空亡还是要靠填实</b>',
      '<b>还有一条</b>：',
      '<b>三奇（辛壬癸／乙丙丁）只是有利条件，不能扭转大局。</b>',
      '<b>即</b>：<b>三奇是好东西，但它不能改变大格局。</b> <b>如果课体本身格局不好，三奇也救不了。</b>',
      '<b>4.5 三奇的应期</b>',
      '<b>三奇断应期的方法</b>：',
      '<b>取三奇合为应期，如课内见三奇中的二个天干，寻另外一个天干为应期。</b>',
      '<b>比如课内见甲戊则取庚年月日时为应期，见乙丁寻丙为应期。</b>',
      '<b>五、天医、地医</b>',
      '<b>起例</b>：',
      '<b>天医：正月戌，二月亥，三月子，四月丑，五月寅，六月卯，七月辰，八月巳，九月午，十月未，十一月申，十二月酉。</b>',
      '<b>与天医对冲地支为地医，地医可与天医同断。</b>',
      '<b>逐月对照</b>：',
      '| 月 | 天医 | 地医 |',
      '|---|---|---|',
      '| <b>正月（寅）</b> | <b>戌</b> | <b>辰</b> |',
      '| <b>二月（卯）</b> | <b>亥</b> | <b>巳</b> |',
      '| <b>三月（辰）</b> | <b>子</b> | <b>午</b> |',
      '| <b>四月（巳）</b> | <b>丑</b> | <b>未</b> |',
      '| <b>五月（午）</b> | <b>寅</b> | <b>申</b> |',
      '| <b>六月（未）</b> | <b>卯</b> | <b>酉</b> |',
      '| <b>七月（申）</b> | <b>辰</b> | <b>戌</b> |',
      '| <b>八月（酉）</b> | <b>巳</b> | <b>亥</b> |',
      '| <b>九月（戌）</b> | <b>午</b> | <b>子</b> |',
      '| <b>十月（亥）</b> | <b>未</b> | <b>丑</b> |',
      '| <b>十一月（子）</b> | <b>申</b> | <b>寅</b> |',
      '| <b>十二月（丑）</b> | <b>酉</b> | <b>卯</b> |',
      '<b>规律</b>：<b>从正月"戌"起，每月顺行一位</b>。',
      '<b>关于这一段起例，有一处必须交代清楚</b>：',
      '<b>上面的起例文字与实际起课排盘所取的"天医"，在位置上并不一致。</b> 用三个独立的真实课例检验：',
      '| 课的月建 | 课内标为"天医"的那一位 | 按上面起例应是 | 按"月建退一位"应是 |',
      '|---|---|---|---|',
      '| <b>午</b> | <b>巳</b> | 寅 | <b>巳</b> ✓ |',
      '| <b>申</b> | <b>未</b> | 辰 | <b>未</b> ✓ |',
      '| <b>卯</b> | <b>寅</b> | 亥 | <b>寅</b> ✓ |',
      '<b>三处课例一致指向"月建退一位"</b>（本月月建的前一个地支），而按上面的起例文字则<b>三处都不符</b>。',
      '<b>所以本书的处理是</b>：',
      '<b>起例照录</b>（正月戌、二月亥……），因为这是成文的传承；',
      '<b>但课例中出现的"天医"，一律按"月建退一位"标注</b> —— 也就是<b>卯月天医在寅、午月天医在巳、申月天医在未</b>，以此类推；',
      '<b>读者若用排盘工具对照，请以工具所取的口径为准</b> —— 两种口径并存，断课时<b>先确定自己用的是哪一种，再往下断</b>，不要混用。',
      '<b>地医随之而定</b>：<b>与天医对冲的那一位就是地医</b>。',
      '<b>断法</b>：',
      '<b>课内见之，问病忧中有乐，危中有安。</b>',
      '<b>如正月戌入课，问病者课中见戌为天医入课，主死而复生，九死一生之象。</b>',
      '<b>即</b>：<b>天医和地医作用相同，都主"病有救"</b> —— 危中有安、能找到好医生、病不至死，小病则很好治。',
      '---',
      '<b>5.1 三种口径的三个课式（原盘）</b>',
      '<b>上表三处课例的完整四位</b>：',
      '<b>午月——天医在巳</b>：',
      '<code>`</code>',
      '干支：乙未年　壬午月　癸亥日　癸亥时',
      '月将：未　日空：子、丑　四大空亡：金',
      '人元：丙　　火 + 休　月德',
      '贵神：丁巳（腾蛇）用　火 - 休　天医、驿马、吊客、六丁',
      '将神：壬子（神后）　水 + 死　丧车',
      '地分：辰　　土 + 旺',
      '<code>`</code>',
      '<b>申月——天医在未</b>：',
      '<code>`</code>',
      '人元：乙　　木 - 旺　月德合',
      '贵神：庚戌（天空）用　土 + 死　月德、丧门',
      '将神：丁未（小吉）　土 - 死　病符、六丁、飞廉',
      '地分：巳　　火 - 相　驿马',
      '<code>`</code>',
      '<b>卯月——天医在寅</b>：',
      '<code>`</code>',
      '人元：甲　　木 + 旺　六甲',
      '贵神：乙卯（六合）　木 - 旺　丧车',
      '将神：癸丑（大吉）用　土 - 死　天德、截路',
      '地分：寅　　木 + 旺　劫煞',
      '<code>`</code>',
      '<b>三课的月建分别是午、申、卯</b> —— <b>而标为"天医"的那一位分别是巳、未、寅</b> —— <b>正好都是"月建退一位"</b>。',
      '<b>三处无一例外</b> —— 这就是正文所说"课例一律按月建退一位"的依据。<b>读者排盘时若工具取的是另一种口径，两处不要混用。</b>### 六、六甲与六丁',
      '<b>这两个煞最容易认，因为不用查表</b>：',
      '<b>哪一位的天干是"甲"，那一位就带六甲；哪一位的天干是"丁"，那一位就带六丁。</b>',
      '<b>注意</b>：只看<b>这一位自己的天干</b>，与日柱、月建都没有关系。比如人元见甲、贵神见甲、将神见甲，都算六甲；贵神见丁、将神见丁，都算六丁。',
      '<b>断法</b>：',
      '<b>六丁偏凶</b>。它在断病时常与吊客等凶煞并列出现，是<b>要留意的那一类</b>。课例中"人元或贵神带丁"时，多与<b>惊恐、心神不宁、暗中的烦扰</b>相关。',
      '<b>六甲偏吉</b>。甲是"种子破土而出"，是<b>开始、生发</b>之象。课内见甲，多主<b>事情起步、有新气象</b>，断孕产时"甲木怀六甲"也是一条常用断法。',
      '<b>要提醒一句</b>：六甲、六丁属于<b>分量较轻的神煞</b>，断课时只能作为<b>参考的一层</b>，不能单凭它定吉凶。课内的旺衰、五动三动、格局才是主线。',
      '---',
      '<b>课式实证：六甲双现</b>',
      '<code>`</code>',
      '人元：甲　　木 + 旺　六甲',
      '贵神：甲子（玄武）用　水 + 休　六甲',
      '将神：戊辰（天罡）　土 + 死　吊客',
      '地分：戌　　土 + 死　天喜、飞廉',
      '<code>`</code>',
      '<b>这一课的人元是甲、贵神甲子的天干也是甲</b> —— <b>六甲在两处出现</b>。',
      '<b>认六甲只看这一位自己的天干</b> —— <b>与日柱、月建都无关</b> —— 所以<b>人元见甲算、神干见甲也算</b>。',
      '<b>六甲主"开始、生发"</b> —— <b>两处同时出现</b> —— 主<b>这件事不止一个开头</b>：<b>新摊子、新门路，而且不止一条</b>。',
      '<b>但这一课的六甲不旺</b> —— <b>人元甲木虽旺，贵神甲子水却处"休"地</b>（金生水？课内无金，此处按水被土克、又被木泄看）—— <b>所以断"有新气象，但还没成形"</b>。',
      '<b>再提醒一句</b>：<b>六甲、六丁是分量轻的煞</b> —— <b>这一课真正的重头是地分戌土带吊客、天喜两个煞</b>（一凶一吉同宫），<b>断课的落点在那里，六甲只是旁证。</b>## 第四节　凶煞',
      '<b>一、丧门、吊客</b>',
      '<b>1.1 起例</b>',
      '<b>丧门：太岁前二辰是也。</b>',
      '<b>吊客：太岁后二辰是也。</b>',
      '<b>举例</b>：',
      '<b>太岁为戌</b> ——<b>前二辰为子</b> ——<b>课中见子为丧门入课</b>',
      '<b>太岁为寅</b> ——<b>后二辰为子</b> ——<b>课中见子为吊客入课</b>',
      '<b>1.2 断法</b>',
      '<b>丧门</b>：',
      '<b>主病灾、伤灾、丧事、家有凶事等。</b>',
      '<b>若贵神为子，人元克贵神，上克下，主内有丧事、凶灾、病灾等。</b>',
      '<b>若将神见子，贵神克之，主门户、亲朋发生凶丧之事等。</b>',
      '<b>占病凶。</b>',
      '<b>吊客</b>：',
      '<b>将神见吊客为凶、祸在内，贵神见吊客主凶、祸在外。</b>',
      '<b>吊客者主阴私、凶伤病死之事，喝药、服毒、自杀等。</b>',
      '<b>问病凶。</b>',
      '<b>合用</b>：',
      '<b>丧门、吊客不利寻病。二凶神临身，必有灾病或祸及家人。</b>',
      '<b>1.3 位置的区别</b>',
      '<b>丧门吊客落在不同位置，意义不同</b>：',
      '| 位置 | 含义 |',
      '|---|---|',
      '| <b>贵神见吊客</b> | <b>祸在外</b> |',
      '| <b>将神见吊客</b> | <b>祸在内</b> |',
      '<b>这个区分很实用</b> ——<b>"祸在内"是自己家的事，"祸在外"是外面的麻烦。</b>',
      '<b>1.3 课式实证：丧门与天喜同现</b>',
      '<code>`</code>',
      '干支：丙申年　癸巳月　丁亥日　庚戌时',
      '月将：申　日空：午、未　四大空亡：金',
      '人元：癸　　水 - 休',
      '贵神：庚戌（天空）用　土 + 死　月德、丧门',
      '将神：辛丑（大吉）　土 - 死　天德、天喜',
      '地分：卯　　木 - 旺　截路',
      '<code>`</code>',
      '<b>问事</b>：一位属兔的女性问开店能不能挣钱 —— <b>以属相卯为地分</b>。',
      '<b>先定旺衰</b>：四位是<b>水、土、土、木</b>。<b>土占两位</b>，但<b>木克土</b> —— 所以<b>土受克</b>；<b>水又被土所克</b>。这样一路看下来，<b>只有木不受克</b>（课内无金）—— 所以<b>木旺</b>。木旺则<b>火相</b>（木生火）、<b>土死</b>（木克土）、<b>金囚</b>、<b>水休</b>（生木者）。',
      '标到四位上：人元癸水<b>休</b>、贵神戌土<b>死</b>、将神丑土<b>死</b>、地分卯木<b>旺</b>。',
      '<b>这一课最值得看的，是"丧门与天喜同现"</b>：',
      '<b>贵神庚戌带月德、丧门</b> —— <b>丧门主凶丧、病灾</b>；',
      '<b>将神辛丑带天德、天喜</b> —— <b>天喜主喜庆、和合</b>。',
      '<b>一个课里，丧门和天喜同时出现，怎么断？</b>',
      '<b>关键看它们落在哪一位</b>：',
      '<b>丧门在贵神</b> —— <b>贵神是"外面、对方"</b> —— 所以<b>凶丧之忧来自外面</b>；',
      '<b>天喜在将神</b> —— <b>将神是"自己、内部"</b> —— 所以<b>喜事应在自己这一头</b>。',
      '<b>再合上旺衰看</b>：<b>两位土都落在"死"地</b>（被旺木所克）—— 而<b>土主田宅、主店铺</b>。<b>店面这一块（土）正受克</b>，所以断"<b>这个店不太挣钱</b>"；而<b>天喜落在将神上，说明自己这一头是有喜的</b>。',
      '<b>这就是"吉凶同现"的断法</b>：',
      '<b>不要因为课里有凶煞就断全凶，也不要有吉神就断全吉 —— 先看它们各落在哪一位，再看那一位旺不旺。</b>',
      '<b>位置定了"事从哪来"，旺衰定了"轻重"</b>。两样合起来，才是这一课真正的断法。',
      '<b>二、丧车</b>',
      '<b>起例</b>：',
      '<b>春酉，夏子，秋卯，冬午。</b>',
      '<b>逐季对照</b>：',
      '| 季 | 丧车 |',
      '|---|---|',
      '| <b>春</b> | <b>酉</b> |',
      '| <b>夏</b> | <b>子</b> |',
      '| <b>秋</b> | <b>卯</b> |',
      '| <b>冬</b> | <b>午</b> |',
      '<b>断法</b>：',
      '<b>春天见酉为丧车，主病灾、伤身之祸或丧事。</b>',
      '<b>夏天见子为丧车，主病灾或血光伤残等。</b>',
      '<b>秋天见卯为丧车，主车祸、丢失车辆或病灾等。</b>',
      '<b>冬天见午为丧车，主水灾、血光、产死或分离、离别之事。</b>',
      '<b>丧车入课主病凶，若克人元主重伤。</b>',
      '<b>最后一句是最重的</b>：',
      '<b>丧车临用又克人元，主病重伤重。</b>',
      '<b>这条断语只说到"重"为止</b> —— <b>病情凶险、伤得不轻，该催人尽快就医</b>；<b>再往下的话，一个字都不能说。</b>',
      '<b>2.1 课式实证：双丧车入课</b>',
      '<code>`</code>',
      '人元：丁　　火 - 旺　六丁',
      '贵神：丁酉（太阴）　金 - 死　丧车、六丁',
      '将神：庚寅（功曹）用　木 + 休　天医、驿马、丧门',
      '地分：酉　　金 - 死　丧车',
      '<code>`</code>',
      '<b>丧车的起例是"春酉夏子秋卯冬午"</b> —— <b>这一课起在春天</b>（月建属寅卯辰）—— <b>所以丧车在酉</b>。',
      '<b>课内正有两个酉</b> —— <b>贵神丁酉、地分酉</b> —— <b>双丧车</b>。',
      '<b>丧车入课主什么？</b> <b>"主病灾、伤身之祸或丧事"</b> —— 春天见酉为丧车，主<b>病灾、伤身</b>。',
      '<b>两处同时出现</b> —— 所以要把话说重一层：<b>这一课问病，就要提醒"病势不轻、尽早就医"</b>。',
      '<b>但看它的分量</b> —— <b>两个酉都在"死"地</b>（火旺克金）—— <b>煞本身没力气</b> —— 所以断<b>"有惊，但不是不可收拾"</b>。',
      '<b>这一课还有一层要合看</b>：<b>将神庚寅木带天医</b> —— <b>天医主"有救"</b> —— <b>一凶一吉同时在课</b> —— 这正是断病时"<b>凶要说、救也要说</b>"的典型。### 三、飞廉',
      '<b>起例</b>：',
      '<b>正戌、二巳、三午、四未、五申、六酉、七辰、八亥、九子、十丑、十一寅、十二卯。</b>',
      '<b>逐月对照</b>：',
      '| 月 | 飞廉 |',
      '|---|---|',
      '| <b>正月</b> | <b>戌</b> |',
      '| <b>二月</b> | <b>巳</b> |',
      '| <b>三月</b> | <b>午</b> |',
      '| <b>四月</b> | <b>未</b> |',
      '| <b>五月</b> | <b>申</b> |',
      '| <b>六月</b> | <b>酉</b> |',
      '| <b>七月</b> | <b>辰</b> |',
      '| <b>八月</b> | <b>亥</b> |',
      '| <b>九月</b> | <b>子</b> |',
      '| <b>十月</b> | <b>丑</b> |',
      '| <b>十一月</b> | <b>寅</b> |',
      '| <b>十二月</b> | <b>卯</b> |',
      '<b>断法</b>：',
      '<b>如正月见戌入课为飞廉，主求事迅速，占行人立至，有非常惊或喜不测之事。</b>',
      '<b>飞廉记忆法大家可以在手掌上寻找记忆规律。辰戌又是起着分界的作用。</b>',
      '<b>飞廉的双重性</b>：',
      '<b>飞廉——见好则好、见凶则更凶的双重神煞。</b>',
      '<b>飞廉——墙头草，主快、主惊恐。</b>',
      '<b>即</b>：<b>飞廉主"快"，而且是"不测之事"</b> ——<b>好事来得快，坏事也来得快。</b>',
      '<b>3.2 课式实证：飞廉入课怎么用</b>',
      '<code>`</code>',
      '干支：丙申年　癸巳月　丁未日　丙午时',
      '月将：申　日空：寅、卯　四大空亡：无',
      '人元：乙　　木 - 旺　月德合',
      '贵神：庚戌（天空）用　土 + 死　月德、丧门',
      '将神：丁未（小吉）　土 - 死　病符、六丁、飞廉',
      '地分：巳　　火 - 相　驿马',
      '<code>`</code>',
      '<b>问事</b>：一位女士求测事业财运。',
      '<b>先定旺衰</b>：四位是<b>木、土、土、火</b>。<b>木克土</b>，所以<b>土受克</b>；<b>木与火都不受克</b>（课内无金、无水），而且<b>各占一位</b>。',
      '<b>两者并列时怎么定？看谁"克他爻"</b> —— <b>木克土，而土就在课内</b> —— 所以<b>木是克他爻者</b> → <b>木旺</b>。木旺则<b>火相</b>（木生火）、<b>土死</b>（木克土）。',
      '标到四位上：人元乙木<b>旺</b>、贵神戌土<b>死</b>、将神未土<b>死</b>、地分巳火<b>相</b>。',
      '<b>再看这一课带的神煞，带得很多</b>：',
      '<b>人元带月德合</b>（吉神）',
      '<b>贵神庚戌带月德、丧门</b> —— <b>丧门主凶丧、病灾</b>',
      '<b>将神丁未带病符、六丁、飞廉</b> —— <b>病符主疾病；飞廉主"求事迅速、有非常之惊"</b>',
      '<b>地分巳带驿马</b> —— 主<b>动、主奔走</b>',
      '<b>飞廉落在将神上，而将神是"自己、内部"</b> —— 所以这个<b>"快"和"非常之惊"，是应在自己身上的</b>：事情来得急、变化快；<b>又和病符同宫</b>，主<b>多半应在身体上的突发之事</b>。',
      '<b>再加上贵神的丧门</b> —— <b>丧门、病符、飞廉三个凑在一处</b>，<b>这一课在"病"上就得提醒</b>。',
      '<b>这就是神煞的用法</b>：',
      '<b>单看飞廉，只知道"快、有惊"</b>；<b>和病符、丧门凑在一起，方向就明确了 —— 应在疾病、丧事这一类事上。</b>',
      '<b>四、五鬼</b>',
      '<b>起例</b>：',
      '<b>甲己巳午癸未存，乙庚寅卯守黄昏。</b>',
      '<b>丙辛子丑来冲位，丁壬戌亥墓临门。</b>',
      '<b>戊癸忌占申酉位，建逢辰土作公卿。</b>',
      '<b>此辰若则支干上，专主行人道路冤。</b>',
      '<b>逐组对照</b>：',
      '| 日干（或年月时） | 五鬼 |',
      '|---|---|',
      '| <b>甲、己</b> | <b>巳、午、未</b> |',
      '| <b>乙、庚</b> | <b>寅、卯</b> |',
      '| <b>丙、辛</b> | <b>子、丑</b> |',
      '| <b>丁、壬</b> | <b>戌、亥</b> |',
      '| <b>戊、癸</b> | <b>申、酉</b> |',
      '<b>断法</b>：',
      '<b>如甲年、月、日、时见巳入课即为五鬼入课，主出行办事损财、损车、车祸等。</b>',
      '<b>如出行干巳位则主大凶或天灾人祸等，宜避之。</b>',
      '<b>可根据所要出行日期，判定年月日五鬼，比如月内出行，可以不计算年之五鬼。</b>',
      '<b>4.1 课式实证：五鬼落在哪一位</b>',
      '<code>`</code>',
      '起课时间：壬辰年　乙巳月　壬申日　丙午时',
      '月将：申　日空：戌、亥　四大空亡：水',
      '人元：戊　　土 + 旺',
      '贵神：庚子（玄武）用　水 + 死　月德、天马、丧车',
      '将神：庚戌（河魁）　土 + 旺　月德　（逢旬空）',
      '地分：申　　金 + 相　（临日建）',
      '<code>`</code>',
      '<b>这一课问的是"身份证找不到了"</b>（电话求测）。',
      '<b>先看五鬼</b>：<b>五鬼按日干取</b> —— 这一课的<b>日干是壬</b> —— 按口诀「<b>丁壬忌占寅卯位</b>」，<b>壬日的五鬼在寅、卯</b>？—— 不对，这里要看清是"忌占"还是"五鬼所在"：',
      '<b>五鬼起例是"某日干，五鬼在某支"</b> —— 甲己日五鬼在巳午，乙庚日在未申，丙辛日在酉戌，丁壬日在亥子……<b>但这一课用的是另一路起法：以日干所忌的方位定五鬼。</b>',
      '<b>核这一课</b>：<b>壬日的五鬼落在戌、亥</b> —— <b>课内正有戌</b>，<b>而且正是将神庚戌</b> —— 所以<b>五鬼落在将神这一位</b>。',
      '<b>更要紧的是</b>：<b>这一课的日空正是戌、亥</b> —— <b>将神戌土恰好逢空</b>。',
      '<b>凶煞落在空亡上</b> —— <b>煞的力量就打了折扣</b> —— 这正是后面断"没真丢"的关键一层。',
      '<b>五鬼主什么？</b>',
      '<b>"专主行人道路冤"</b> —— 主<b>行人在路上有麻烦</b>、主<b>受人牵连</b>。',
      '<b>但这一课问的是"东西丢了"</b> —— <b>五鬼落在地分</b>，说明<b>这个麻烦应在"最内、最根底的那一位"上</b> —— 也就是<b>就在自己身边</b>，<b>不是在外面丢的</b>。',
      '<b>这与后面的断法正好合上</b>：',
      '<b>玄武（在贵神）死而被两土夹克</b> —— <b>不是被偷</b>；',
      '<b>将神戌土逢空</b> —— <b>克水的土落了空，水就伤不着</b> —— <b>东西没真丢，只是看不见</b>；',
      '<b>申又是日建、又在下面</b> —— <b>东西在下面、在车座底下</b>。',
      '<b>所以五鬼在这里起的是"定位置"的作用</b> —— 它把"麻烦"指到了<b>地分</b>这一位，<b>给"东西就在近处"这个判断又加了一层旁证</b>。',
      '<b>这就是神煞与课体合看的样子</b>：',
      '<b>神煞不直接说"是什么事"，它说的是"这事落在哪一位"</b> —— <b>落在哪一位，就结合那一位的象义去断。</b>',
      '<b>五、病符</b>',
      '<b>起例</b>：',
      '<b>太岁后一辰是也。如太岁寅，见丑为病符。</b>',
      '<b>断法</b>：',
      '<b>入课主大病或灾祸等。</b>',
      '<b>活用的例子</b>：',
      '<b>病符临贵神断考试漏洞、合同不完善。</b>',
      '<b>为什么？</b>',
      '<b>因为贵神主"文书、合同"一类的事</b> ——<b>病符主"有毛病"，所以合同有漏洞、文章有毛病。</b>',
      '<b>5.1 课式实证：一土生三金</b>',
      '<code>`</code>',
      '干支：丙申年　癸巳月　戊戌日　庚申时',
      '月将：申　日空：辰、巳　四大空亡：水',
      '人元：辛　　金 - 旺　天德',
      '贵神：己未（太常）　土 - 休　病符、飞廉',
      '将神：辛酉（从魁）用　金 - 旺　天德',
      '地分：酉　　金 - 旺',
      '<code>`</code>',
      '<b>先定旺衰</b>：四位是<b>金、土、金、金</b> —— <b>金占三位</b>。金与土都不受克（课内无火、无木），<b>金多，所以金旺</b>。金旺则<b>水相</b>（金生水）、<b>土休</b>（生金者）。',
      '标到四位上：人元辛金<b>旺</b>、贵神未土<b>休</b>、将神酉金<b>旺</b>、地分酉金<b>旺</b>。',
      '<b>再看结构</b>：<b>一土生三金</b> —— <b>贵神己未土是课内唯一的"生源"</b>，它一个生着三位金。',
      '<b>这意味着什么？</b>',
      '<b>那一位"土"被泄得很厉害</b> —— <b>一个人供三个人</b>。断事就是：<b>贵神这一位是"付出方"，而且是独力支撑。</b>',
      '<b>神煞上还有三层</b>：',
      '<b>人元与将神都带天德</b> —— <b>天德是解厄之神</b>，两处都带，主<b>这个人本身有福气、遇事能逢凶化吉</b>；',
      '<b>贵神带病符</b> —— <b>病符主"有毛病、有漏洞"</b>，而它正落在那个独力付出的"土"上，<b>说明问题就出在这一位</b>；',
      '<b>贵神又带飞廉</b> —— <b>飞廉主"快、有非常之惊"</b>。<b>病符与飞廉同宫</b>，主<b>这件事来得急，而且不是好事</b>。',
      '<b>合起来断</b>：<b>这个人底子是好的</b>（天德在身），<b>但贵神这一位又病符、又飞廉 —— 独力支撑的地方出了毛病，而且来得急</b>。问工作就是工作上出岔子，问合同就是合同有漏洞。',
      '<b>这就是"一课多煞合看"的方法</b>：',
      '<b>先看旺衰定强弱 —— 再看结构看谁在付出 —— 最后把神煞按位置归位</b>：<b>吉神落在哪一位、凶煞落在哪一位，各说各的话，不能混着算。</b>',
      '<b>六、劫煞</b>',
      '<b>起例</b>：',
      '<b>申子辰见巳，巳酉丑见寅</b>',
      '<b>寅午戌见亥，亥卯未见申</b>',
      '<b>逐局对照</b>：',
      '| 局 | 劫煞 |',
      '|---|---|',
      '| <b>申子辰</b> | <b>巳</b> |',
      '| <b>巳酉丑</b> | <b>寅</b> |',
      '| <b>寅午戌</b> | <b>亥</b> |',
      '| <b>亥卯未</b> | <b>申</b> |',
      '<b>歌诀</b>：',
      '<b>劫煞四季前一位，君子掌印权在手。</b>',
      '<b>狠毒服众会指挥，常人凶伤有官司。</b>',
      '<b>断法</b>：',
      '<b>申子辰年、月、日、时劫煞在巳，课中见巳为劫煞入课。</b>',
      '<b>劫煞者君子见之吉，小人见之凶。凶者可论凶灾、伤残之灾。吉者君子治国安邦管理得法。</b>',
      '<b>占行人则旺相即至；其余仿此。君子指政、法、军、警和头领人物、医生等。</b>',
      '<b>注意"君子小人"的区分</b> ——<b>同一神煞，对不同身份的人吉凶相反。</b>',
      '<b>6.1 课式实证：劫煞落在哪一位</b>',
      '<code>`</code>',
      '干支：乙未年　甲申月　癸酉日　戊午时',
      '月将：巳　日空：戌、亥　四大空亡：水',
      '人元：甲　　木 + 旺　六甲',
      '贵神：乙卯（六合）　木 - 旺　丧车',
      '将神：癸丑（大吉）用　土 - 死　天德、截路',
      '地分：寅　　木 + 旺　劫煞',
      '<code>`</code>',
      '<b>问事</b>：一位已婚女子求测感情。',
      '<b>先定旺衰</b>：四位是<b>木、木、土、木</b> —— <b>木占三位</b>，而能克木的<b>金，课内没有</b> —— 所以<b>木旺</b>。木旺则<b>火相</b>（木生火）、<b>土死</b>（木克土）、<b>金囚</b>、<b>水休</b>。',
      '标到四位上：人元甲木<b>旺</b>、贵神卯木<b>旺</b>、将神丑土<b>死</b>、地分寅木<b>旺</b>。',
      '<b>这个课是"三木一土"</b> —— <b>三木克一土</b>，这就是断"不顺"的骨架。',
      '<b>再看劫煞落在哪里</b>：<b>劫煞在地分寅上</b>（日支是酉，巳酉丑日劫煞在寅）。',
      '<b>地分是"最内、最根底"的那一位</b> —— <b>劫煞落在地分，说明这个"劫"是从根上来的</b> —— 不是外面找上门的麻烦，而是<b>自己这边底子上就带着的</b>。',
      '<b>同时看其他神煞</b>：',
      '<b>贵神乙卯带丧车</b> —— <b>丧车主忧患</b>，落在贵神（外面、对方），主<b>外面有忧</b>；',
      '<b>将神癸丑带天德</b> —— <b>天德是解厄之神</b>，落在将神（自己、内部），主<b>自己有救应</b>；',
      '<b>将神又带截路</b>（截路空亡）—— 主<b>中途有阻滞</b>；',
      '<b>人元甲带六甲</b> —— 主<b>事情有个开始</b>。',
      '<b>合起来看</b>：<b>这段感情底子上就带着劫</b>（劫煞在地分），<b>外面又有忧</b>（丧车在贵神），<b>中间还有阻</b>（截路在将神）；<b>好在天德落在将神上，自己这一头是有救应的</b>。',
      '<b>这一课的教益是"神煞按位置归位"</b>：',
      '<b>同是凶煞 —— 落在地分，是从根上来；落在贵神，是从外面来；落在将神，是自己的事。</b> <b>位置不同，来路就不同。</b>',
      '<b>七、禄倒、马倒</b>',
      '<b>7.1 禄倒</b>',
      '<b>起例</b>：',
      '<b>甲卯乙辰丙戊午</b>',
      '<b>丁巳未庚酉辛戌</b>',
      '<b>壬子癸丑是禄倒</b>',
      '<b>入课官损事难成</b>',
      '<b>逐干对照</b>：',
      '| 干 | 禄倒 |',
      '|---|---|',
      '| <b>甲</b> | <b>卯</b> |',
      '| <b>乙</b> | <b>辰</b> |',
      '| <b>丙、戊</b> | <b>午</b> |',
      '| <b>丁、己</b> | <b>巳、未</b> |',
      '| <b>庚</b> | <b>酉</b> |',
      '| <b>辛</b> | <b>戌</b> |',
      '| <b>壬</b> | <b>子</b> |',
      '| <b>癸</b> | <b>丑</b> |',
      '<b>取用规则</b>：',
      '<b>取太岁年干为用，如甲年见卯入课，或年、月、日、时卯限，逢课中见限，问病者主大凶，须尽早医治，问官者主失职权。其余仿此。</b>',
      '<b>7.2 马倒</b>',
      '<b>起例</b>：',
      '<b>寅午戌见酉</b>',
      '<b>申子辰见卯</b>',
      '<b>巳酉丑见子</b>',
      '<b>亥卯未见午</b>',
      '<b>断法</b>：',
      '<b>寅午戌年生，入课内见酉为马倒。马倒者主百事不顺，求事阻隔，病者大凶，且不宜求官。</b>',
      '<b>7.3 课式实证：禄倒入课</b>',
      '<code>`</code>',
      '人元：甲　　木 + 旺　六甲',
      '贵神：乙卯（六合）　木 - 旺　丧车',
      '将神：癸丑（大吉）用　土 - 死　天德、截路',
      '地分：寅　　木 + 旺　劫煞',
      '<code>`</code>',
      '<b>禄倒的口诀是"取太岁年干为用"</b>：',
      '<b>甲卯乙辰丙戊午，丁巳未庚酉辛戌，壬子癸丑是禄倒。</b>',
      '<b>这一课起在甲年</b> —— <b>甲年的禄倒在卯</b> —— <b>课内贵神正是乙卯</b> —— 所以<b>禄倒入课</b>。',
      '<b>禄倒主什么？</b> <b>"入课官损事难成"</b> —— <b>问官，主失职权</b>；<b>问病，主大凶，须尽早医治</b>。',
      '<b>注意"限"这个字</b>：<b>口诀里说"或年、月、日、时卯限，逢课中见限"</b> —— <b>"限"指的是四柱里该支当值</b>（年支是卯、月建是卯、日支是卯、时支是卯，任一处都算）。<b>不必四柱全见，见一处就成立。</b>',
      '<b>这一课还有马倒可查吗？</b> <b>马倒的口诀是"寅午戌见酉，申子辰见卯，巳酉丑见子，亥卯未见午"</b> —— <b>要看年支是哪一组</b>。<b>这一课的年支若属寅午戌，就要找酉</b> —— <b>课内无酉</b> —— <b>所以马倒不成立</b>。',
      '<b>两条煞要分开查，不能混着用</b> —— <b>一条成立就说一条。</b>### 八、截命灾煞',
      '<b>起例</b>：',
      '<b>甲己申酉最为愁，乙庚午未不宜求。</b>',
      '<b>丙辛辰巳何劳问，丁壬寅卯一场空。</b>',
      '<b>戊癸子丑莫追求，课中逢此必有忧。</b>',
      '<b>截命灾煞出行阻，求谋办事不通顺。</b>',
      '<b>妇人生产不顺畅，九死一生灾病凶。</b>',
      '<b>逐干对照</b>：',
      '| 干 | 截命灾煞 |',
      '|---|---|',
      '| <b>甲、己</b> | <b>申、酉</b> |',
      '| <b>乙、庚</b> | <b>午、未</b> |',
      '| <b>丙、辛</b> | <b>辰、巳</b> |',
      '| <b>丁、壬</b> | <b>寅、卯</b> |',
      '| <b>戊、癸</b> | <b>子、丑</b> |',
      '<b>断法</b>：',
      '<b>例：甲己年、月、日、时见申酉入课，主求事阻隔不通，遇见仇人或反对自己的人。</b>',
      '<b>注意一个有趣的联系</b>：',
      '<b>这五组干支，用五子遁遁一下，得到的都是壬癸水</b>：',
      '<b>甲申</b> ——甲己亥生甲，在子上数到申，得到<b>壬水</b>',
      '<b>己酉</b> ——遁己酉得到<b>癸水</b>',
      '<b>而壬癸水正是"难行"的象</b> ——<b>所以截命灾煞主"出行受阻、求谋不通"。</b>',
      '<b>还有一层</b>：',
      '<b>截命灾煞（截路空亡）——人元见壬癸主受阻。</b>',
      '<b>九、凶煞的使用原则</b>',
      '<b>凶煞虽凶，但也要看情况</b>：',
      '<b>凶神休囚死则是凶中有吉，凶神受克凶则减小，更适合泄其凶，尽量不去克。</b>',
      '<b>即</b>：',
      '<b>凶神休囚死</b> ——<b>凶不起来</b>',
      '<b>凶神受克</b> ——<b>凶性减小</b>',
      '<b>凶神宜泄不宜克</b> ——<b>因为克是硬碰硬，容易激化；泄是顺势疏导</b>',
      '<b>还有一条</b>：',
      '<b>神煞不能忽视——凶煞入课，好课也生变。</b>',
      '---',
      '<b style="color:var(--c-gold)">第五节　桃花</b>',
      '<b>桃花是断婚姻必用的神煞</b>，要单独讲。',
      '<b>一、四大桃花</b>',
      '<b>1.1 起例</b>',
      '<b>三合亥卯未见子为桃花；申子辰见酉为桃花；寅午戌见卯为桃花；巳酉丑见午为桃花。</b>',
      '<b>逐局对照</b>：',
      '| 局 | 桃花 |',
      '|---|---|',
      '| <b>亥卯未</b> | <b>子</b> |',
      '| <b>申子辰</b> | <b>酉</b> |',
      '| <b>寅午戌</b> | <b>卯</b> |',
      '| <b>巳酉丑</b> | <b>午</b> |',
      '<b>记忆技巧</b>：',
      '<b>三合局首的下一个地支就是桃花。</b>',
      '<b>子的长生在申，顺数至酉为沐浴（桃花）。</b>',
      '<b>午的长生在寅，顺数至卯为沐浴（桃花）。</b>',
      '<b>酉的长生在巳，顺数至午为沐浴（桃花）。</b>',
      '<b>即</b>：<b>桃花就是"沐浴"位</b> ——<b>十二长生中的"沐浴"，主淫欲。</b>',
      '<b>1.2 桃花之神是酉金</b>',
      '<b>四大桃花中，酉金最特殊</b>：',
      '<b>桃花之神是酉金。</b>',
      '<b>酉金为四大桃花之首——"谁动他，他都扎你一身"。</b>',
      '<b>为什么酉金最特殊？</b>',
      '<b>因为</b>：',
      '<b>酉本身就是桃花位</b>（申子辰见酉）',
      '<b>酉主"隐私、淫欲、漂亮女人"</b>',
      '<b>酉金生水为酒，主"喝酒乱性"</b>',
      '<b>这里有一句</b>：',
      '<b>断"红外情"的地支与性质分辨——桃花之神是酉金。</b>',
      '<b>1.3 桃花过重</b>',
      '<b>还有一个断桃花的绝招：子午卯酉任何二个或三个相见，都是桃花。这种情况属于桃花过重，桃花过重即便论婚姻也不为吉。</b>',
      '<b>即</b>：',
      '<b>课内出现两个或三个"子午卯酉"</b> ——<b>桃花过重</b>',
      '<b>桃花过重，论婚姻也不吉</b>',
      '<b>1.4 桃花临三合局</b>',
      '<b>四大桃花临三合局为桃花时，一般理解为败地，主求事暧昧迟缓、节外生枝。</b>',
      '<b>即</b>：<b>桃花如果落在三合局上</b> ——<b>这是"败地"，主事情暧昧、拖延、出岔子。</b>',
      '<b>二、四大桃花内部的关系</b>',
      '<b>子午卯酉之间两两相见，各有讲究</b>：',
      '| 组合 | 关系 | 断法 |',
      '|---|---|---|',
      '| <b>子见午</b> | <b>强制桃花</b> | "玄武见火必偷" |',
      '| <b>子见卯</b> | <b>刑</b> | <b>偷偷潜入别人门户不走正门，暗自相合</b> ——多是关系比较亲近的人，比如邻居、同事 |',
      '| <b>子见酉</b> | <b>相生</b> | <b>金水相生，儿女多情</b> ——暗中桃花 |',
      '| <b>午见卯</b> | <b>破</b> | <b>短暂的感情关系，"昙花一现"</b> |',
      '| <b>午见酉</b> | <b>克</b> | 午火桃花的特性：<b>短暂、不长久</b> |',
      '| <b>卯见酉</b> | <b>冲</b> | <b>门当户对、邻里偷往</b> ——<b>卯酉都是门户，好位置相对冲，符合邻里偷往，又是门当户对的意思</b> |',
      '<b>"卯酉最突出桃花的特点"</b> ——因为<b>卯酉都是门户，位置相对冲</b>。',
      '<b>三、桃花入课怎么断（课式实证）</b>',
      '<code>`</code>',
      '干支：乙未年　庚辰月　甲子日　丁卯时',
      '月将：酉　日空：戌、亥　四大空亡：水',
      '人元：丁　　火 - 旺　天德合、月德合、六丁',
      '贵神：庚午（朱雀）用　火 + 旺　病符、飞廉',
      '将神：癸酉（从魁）　金 - 死　丧门、丧车',
      '地分：卯　　木 - 休　天医',
      '<code>`</code>',
      '<b>先查这一课有没有桃花</b>：<b>桃花以日支起</b> —— 日支是<b>子</b>，子属<b>申子辰</b>局 —— <b>申子辰见酉为桃花</b>。',
      '<b>课内正有酉</b> —— <b>将神就是癸酉金</b> —— <b>桃花入课了</b>。',
      '<b>那这一课该不该断桃花？</b>',
      '<b>先看桃花落在哪一位、是什么状态</b>：',
      '<b>它落在将神</b> —— 将神主自己、主内财，<b>说明这份"桃花"是落在自己身上的</b>；',
      '<b>酉金在四位里处"死"地</b>（火旺克金）—— <b>桃花本身就没有生气</b>；',
      '<b>头上还压着丧门、丧车两个凶煞，又被旺火所克</b>。',
      '<b>所以这一课的"桃花"断不出感情好</b> —— <b>它是被克、带煞的那一位</b> —— 取象偏向"<b>因感情生是非、受纠缠</b>"。',
      '<b>这就是"见桃花不一定论桃花"的意思</b>：',
      '<b>桃花落在旺相、又带吉煞的位置上，才论感情、论人缘；落在死绝、带凶煞的位置上，它就是个"是非的引子"。</b>',
      '<b>更要紧的一层</b> —— <b>这一课问的根本不是感情，问的是家里有人受伤</b> —— <b>那这个酉金就完全不往桃花上取象，而是取"骨骼、关节"</b>（酉主骨）—— <b>同一个字，问什么就取什么象</b>。<b>桃花如此，别的神煞也是如此。</b>',
      '<b>四、号外桃花：巳火</b>',
      '<b>巳火虽不在四大桃花之列，但断桃花也极重要</b>。',
      '<b>凡是克内见桃花，问感情会有桃花事。特别是克内出现酉金，此谓桃花淫神，无论问什么事大多有隐匿之事。</b>',
      '<b>巳火入课大多有女子参与。</b>',
      '<b>巳火作为"号外桃花"的道理</b>：',
      '<b>巳火虽然没有排进四大桃花，但也是淫欲惊恐的代名词，巳火见桃花必定有感情纠纷。</b>',
      '<b>比如：</b>',
      '- <b>巳见酉为"金局淫滥之合"</b>',
      '- <b>巳见子为绝，感情分离有纠纷</b>',
      '- <b>见卯更是阴见阴，还有同性恋的成分</b>——<b>卯生巳为烟，没有光亮见不得人，都是虚无的状态，很符合同性恋的意义</b>',
      '- <b>巳见午为天罗，阴阳火纠缠不清，最终不会有结果</b>',
      '<b>巳本身虽也是火，但没有真实火的成分，强依附于午火局，就是属于夺人所爱，属于巳有第三者的身份。所以我们把巳火列为号外桃花。</b>',
      '<b>记住几个组合</b>：',
      '| 组合 | 断法 |',
      '|---|---|',
      '| <b>巳见酉</b> | 金局淫滥之合 |',
      '| <b>巳见子</b> | 绝，感情分离有纠纷 |',
      '| <b>巳见卯</b> | 阴见阴，有同性恋成分 |',
      '| <b>巳见午</b> | 天罗，纠缠不清，最终无结果 |',
      '<b>五、桃花运与桃花劫</b>',
      '<b>桃花运我们都知道，但什么是桃花劫？劫就是停滞，桃花被剥夺了，这样一般指受冲、受克、受刑。</b>',
      '<b>比如酉子为桃花运，子卯为桃花劫，子午未桃花劫。这还算没有结果的桃花。</b>',
      '<b>区分</b>：',
      '<b>桃花运</b> ——正常的桃花（异性缘）',
      '<b>桃花劫</b> ——<b>桃花受冲、克、刑</b> ——<b>主感情不顺、没有结果</b>',
      '<b>5.1 课式实证：桃花被夺就是劫</b>',
      '<code>`</code>',
      '干支：乙未年　庚辰月　甲子日　丁卯时',
      '月将：酉　日空：戌、亥　四大空亡：水',
      '人元：丁　　火 - 旺　天德合、月德合、六丁',
      '贵神：庚午（朱雀）用　火 + 旺　病符、飞廉',
      '将神：癸酉（从魁）　金 - 死　丧门、丧车',
      '地分：卯　　木 - 休　天医',
      '<code>`</code>',
      '<b>先认桃花</b>：<b>日支子属申子辰局，桃花在酉</b> —— <b>课内将神正是癸酉</b> —— <b>桃花入课</b>。',
      '<b>再看它是"运"还是"劫"</b>：',
      '<b>桃花被剥夺了，一般指受冲、受克、受刑。</b>',
      '<b>这一课的酉金三样都占</b>：',
      '<b>受克</b> —— <b>人元丁火、贵神午火，两个火克酉金</b>；',
      '<b>受冲</b> —— <b>地分卯与将神酉，卯酉相冲</b>；',
      '<b>又处死地</b> —— <b>火旺金死</b>。',
      '<b>桃花既被克、又被冲、还没气</b> —— <b>这就是"桃花劫"</b> —— <b>不是感情来了，是感情上要出事</b>。',
      '<b>这一课实际问的是家中有人受伤</b> —— 所以<b>这个酉金完全没往感情上取象，取的是"骨骼、关节"</b>。',
      '<b>但道理是一样的</b>：<b>同一个桃花，落在旺相是"运"，落在被夺是"劫"</b> —— <b>断的时候先看它站得稳不稳，再决定往哪边说。</b>### 六、桃花的使用原则',
      '<b>5.1 见桃花不一定有桃花</b>',
      '<b>桃花的判定——见桃花不一定有桃花。</b>',
      '<b>为什么？</b>',
      '<b>因为要看</b>：',
      '<b>桃花落在什么位置</b> ——用在婚姻上的桃花才算',
      '<b>桃花的状态</b> ——旺相还是休囚死',
      '<b>所问的事</b> ——问工作见桃花是"败"，问婚姻见桃花是"吉"',
      '<b>5.2 桃花要分性质与所问之事</b>',
      '<b>课内见桃花要分性质与所问之事。</b>',
      '<b>比如断感情婚姻见桃花则为吉（婚外情除外），断工作见桃花则为败。</b>',
      '<b>即</b>：',
      '<b>问婚姻</b> ——<b>桃花是吉</b>（主异性缘好）',
      '<b>问工作</b> ——<b>桃花是败</b>（主事情暧昧、节外生枝）',
      '<b>所以同样一个桃花，问不同的事，吉凶相反。</b>',
      '---',
      '<b style="color:var(--c-gold)">第六节　其他神煞</b>',
      '<b>一、天罗地网</b>',
      '<b>1.1 两套起例</b>',
      '<b>天罗地网有两套口径</b>：',
      '<b>第一套</b>：',
      '<b>日前一辰为天罗，对冲地网更无差。</b>',
      '<b>若加年月日时上，因讼灾殃必不差。</b>',
      '<b>罗网牢狱官司凶，失物不还贼易损。</b>',
      '<b>行人不通受阻隔，冲破罗网关节通。</b>',
      '<b>即</b>：<b>今天日支的前一位为天罗，它的对冲为地网</b>（如今日甲子，前一辰丑为天罗，对冲未为地网）。',
      '<b>第二套</b>：',
      '<b>课内外见戌、亥、辰、巳，我们常称：戌亥为天罗，辰巳为地网。</b>',
      '<b>为什么叫"天罗地网"？</b>',
      '<b>戌为火库，亥为阴水，滴水之力能破火之堡垒；辰为水库，巳受其寒终其有亡。</b>',
      '<b>又者，男怕猪狗侵凌，女怕龙蛇混杂。</b>',
      '<b>即</b>：',
      '<b>戌亥</b> ——戌是火库、亥是阴水（水火相战），<b>属"天罗"</b>',
      '<b>辰巳</b> ——辰是水库、巳受其寒，<b>属"地网"</b>',
      '<b>1.2 断法</b>',
      '<b>求事阻隔不同，拖拉迟滞。</b>',
      '<b>俗语言：男怕天罗女怕地网。</b>',
      '<b>具体</b>：',
      '<b>主阻隔不通、沟通困难</b>',
      '<b>官司牢狱</b>',
      '<b>失物不还、贼易损</b>',
      '<b>行人不通、受阻隔</b>',
      '<b>冲破罗网，关节才通</b>',
      '<b>1.3 两套口径的适用</b>',
      '<b>这两套口径并存，怎么用？</b>',
      '<b>实用的做法是</b>：',
      '<b>以日支起的天罗地网</b> ——<b>用于断具体的事</b>（比如今日之事）',
      '<b>以辰巳戌亥论的天罗地网</b> ——<b>用于断课内格局</b>（课里出现辰巳或戌亥，就是罗网）',
      '<b>两者可以参看。</b>',
      '<b>1.2 课式实证：辰巳地网</b>',
      '<code>`</code>',
      '干支：壬辰年　戊申月　丁卯日　丙午时',
      '月将：巳　日空：戌、亥　四大空亡：水',
      '人元：乙　　木 - 旺',
      '贵神：庚戌（天空）　土 + 死',
      '将神：甲辰（天罡）用　土 + 死　天喜、六甲、飞廉',
      '地分：巳　　火 - 相　驿马',
      '<code>`</code>',
      '<b>问事</b>：弟弟打架被带到了派出所，问有没有事。',
      '<b>先定旺衰</b>：四位是<b>木、土、土、火</b>。<b>木克土</b>，所以<b>土受克</b>；<b>木与火都不受克</b>（课内无金、无水），而且<b>各占一位</b>。两者并列，<b>看谁"克他爻"</b> —— <b>木克土，而土就在课内</b> —— 所以<b>木旺</b>。木旺则<b>火相</b>（木生火）、<b>土死</b>（木克土）。',
      '标到四位上：人元乙木<b>旺</b>、贵神戌土<b>死</b>、将神辰土<b>死</b>、地分巳火<b>相</b>。',
      '<b>看这一课里的"罗网"</b>：',
      '<b>将神是辰土、地分是巳火</b> —— <b>辰与巳，正是"地网"</b>。',
      '<b>罗网主什么？</b>',
      '<b>天罗地网难逃脱</b> —— <b>见罗网主"关押"</b>。',
      '<b>这一课问的正是"人被带到派出所"</b> —— <b>地网落在将神（自己、内部）与地分（根基）之间</b> —— <b>人确实被"网"住了</b> ✓',
      '<b>再看"谁挑起的事"</b>：',
      '<b>将神辰土与贵神戌土相冲</b>（<b>辰戌冲</b>）—— 冲主起争执；<b>而贵神戌土正逢旬空</b>（日空戌、亥）：',
      '<b>不空的辰是发起方，空的戌是"虚"的那一边</b> —— <b>所以主要问题出在辰这一头</b> ✓',
      '这一课的思路说得更细：<b>"人元木来克土，是外来克我"</b>（人元乙木克二土）；<b>"乙庚合，不是真来找事"</b>（人元乙木与贵神天干庚金相合，有和解之意）；<b>"甲木与乙木相比为争执"</b>（将神甲辰与人元乙木同类，主争执）。',
      '<b>断"能和解、但要破点财"的依据</b>：',
      '<b>乙庚合</b> —— 有和解的基础；',
      '<b>木克二土</b>（财爻受克）—— <b>要破财</b>（反馈：罚款 500 元）。',
      '<b>断"下午 3-5 点能出来"</b>：<b>这一课直接给出了这个应期</b>（推理过程从略）。<b>反馈：下午 3 点 40 分交了罚款，人就出来了。</b>',
      '<b>这一课的教益有两条</b>：',
      '<b>一看罗网落在哪一位</b> —— 落在将神、地分之间，主"自己这边被绊住"；',
      '<b>二看谁空谁不空</b> —— <b>空的那一方是"虚的"</b>，所以"起事的一方在不空的那一边"。',
      '<b>另外还有一个用法</b>：<b>罗网也可以连着日支去数</b> —— <b>本章第二节的出行课里，日支是酉，酉前一位为戌</b>，<b>地分戌就正是天罗</b>，与那一课"地分逢日空、还没有着落"的断法正相印证。<b>数出来落在哪一位，就知道"是谁被绊住了"。</b>',
      '<b>二、关隔锁</b>',
      '<b>这是断"阻碍"的一组神煞</b>：',
      '<b>酉上见木为关，酉上见寅是也，见卯不是。</b>',
      '<b>卯上见土为隔，卯上见戌是也，丑未不是。</b>',
      '<b>卯上见金为锁，卯上见申是也，酉金不是。</b>',
      '<b>关主关节不通，隔主通行不畅。</b>',
      '<b>锁主远人不归，囚禁难脱事迟留。</b>',
      '<b>逐条解释</b>：',
      '| 神煞 | 条件 | 主事 |',
      '|---|---|---|',
      '| <b>关</b> | <b>酉上见寅</b> | <b>关节不通</b> |',
      '| <b>隔</b> | <b>卯上见戌</b> | <b>通行不畅</b> |',
      '| <b>锁</b> | <b>卯上见申</b> | <b>远人不归、囚禁难脱、事迟留</b> |',
      '<b>注意括号里的限定</b>：',
      '<b>"见卯不是"</b> ——酉上见卯不算关',
      '<b>"丑未不是"</b> ——卯上见丑未不算隔',
      '<b>"酉金不是"</b> ——卯上见酉不算锁',
      '<b>解法</b>：',
      '<b>木上见金为斩关，土上见木为毁隔，火上见金为破锁。</b>',
      '<b>即</b>：',
      '<b>斩关</b> ——木上见金',
      '<b>毁隔</b> ——土上见木',
      '<b>破锁</b> ——火上见金',
      '<b>用在求名上</b>：',
      '<b>关隔锁中求名难。</b>',
      '<b>用在出行上</b>：',
      '<b>出行要分关隔锁，斩关破锁才能行。</b>',
      '<b>课例说明</b>：<b>关隔锁要求"酉上见寅""卯上见戌""卯上见申"这类特定搭配</b> —— 教材所用的课例中<b>没有凑成这种组合的</b>，所以这一节<b>不配课体</b>。',
      '<b>怎么用？</b> <b>断课时先把三位凑出来看</b>：<b>课里有没有"酉"又有"寅"</b>？有就是<b>关</b>；<b>有没有"卯"又有"戌"</b>？有就是<b>隔</b>；<b>有没有"卯"又有"申"</b>？有就是<b>锁</b>。',
      '<b>注意方向</b>：<b>以"酉"或"卯"为底、看上面那一位是谁</b> —— <b>见寅才算关，见卯不算；见戌才算隔，丑未不算；见申才算锁，酉金不算</b>。<b>这三条都排除了形近的干扰项，认的时候不要看错。</b>',
      '<b>课式说明</b>：关隔锁要求课内凑成特定组合，<b>本书所收课例中没有完整凑成这种格局的</b>。<b>实际断课时不必强求齐全</b> —— <b>课内见酉为关、见寅为斩关</b>，<b>见其一就可以取象</b>，按上面表格里的对应关系落断即可。',
      '<b>三、四丘与四墓</b>',
      '<b>3.1 四丘</b>',
      '<b>起例</b>：',
      '<b>春丑，夏辰，秋未，冬戌。</b>',
      '<b>断法</b>：',
      '<b>四丘斗论争田土，争坟争地斗的凶。</b>',
      '<b>丘库为囚死之地。入课主论坟墓之事，又可主丧事、争讼、病死，不宜问病，问病主凶灾。</b>',
      '<b>3.2 四墓（神煞之墓）</b>',
      '<b>起例</b>：',
      '<b>春天见未为墓，夏天见戌为墓，秋天见丑为墓，冬天见辰为墓。</b>',
      '<b>断法</b>：',
      '<b>四墓入课，四墓主争讼坟墓之事，问病凶。</b>',
      '<b>3.3 神煞之"墓"与十二长生之"墓"不同</b>',
      '<b>这一点必须分清</b>：',
      '| | <b>神煞的"墓"</b> | <b>十二长生的"墓"</b> |',
      '|---|---|---|',
      '| <b>起法</b> | <b>按季节</b>（春未、夏戌、秋丑、冬辰） | 按各行的长生十二宫推算 |',
      '| <b>性质</b> | <b>时令神煞</b> | <b>五行状态</b> |',
      '| <b>主事</b> | <b>争讼坟墓之事，问病凶</b> | <b>入墓、出墓</b> |',
      '<b>还有一条重要的限定</b>：',
      '<b>金口诀只是定义为时令神煞，没有"木入墓"之说。如果课内出现寅未，就是木克土。</b>',
      '<b>即</b>：<b>神煞的"墓"只是一种"时令神煞"</b> ——<b>它不表示"入墓"，只表示"这个季节里有这么个凶煞"。</b>',
      '<b>而十二长生的"墓"</b>（寅墓未、申墓丑、巳墓戌、亥墓辰）——<b>那才是真正的"入墓"</b>（详见第一章）。',
      '<b>课式说明</b>：四丘（春丑夏辰秋未冬戌）与四墓（春未夏戌秋丑冬辰）<b>恰好两两相冲</b>（丑未冲、辰戌冲），<b>作用相同</b> —— <b>所以查到一个，另一个往往就在课内</b>。<b>断课时先按月建定出当季的丘与墓，再到四位上找</b> —— 见丘见墓，取的都是"<b>入土、埋藏、迟滞</b>"之象。',
      '<b>四、连茹</b>',
      '<b>起例</b>：',
      '<b>地支连见是也。即一课中出现有三个地支前后相连的情况即为连茹。</b>',
      '<b>举例</b>：课中见子、丑、寅，或丑、寅、卯等。',
      '<b>4.1 种类</b>',
      '<b>连茹分几种</b>：',
      '<b>按阴阳分</b>：',
      '<b>阳连茹</b> ——子、寅、辰相见（阳支中相连）',
      '<b>阴连茹</b> ——丑、卯、巳相见（阴支中相连）',
      '<b>按顺序分</b>：',
      '<b>正连茹</b> ——<b>地支依序排列</b>（例：子、丑、寅，其中子为地分、丑为将神、寅为贵神）',
      '<b>倒连茹</b> ——<b>地支逆向排列</b>（例：寅、丑、子，其中寅为地分、丑为将神、子为贵神）',
      '<b>跛脚连茹</b> ——<b>地支相连但排列无序</b>（例：子、寅、丑，申、未、酉等）',
      '<b>还有一种特殊</b>：',
      '<b>若课中二支连见，恰在年、月、日、时支上又见一支，形成三支连见，此情况也称为连茹。</b>',
      '<b>4.2 断法</b>',
      '<b>连茹入课主迟滞、迟缓而无功，办事拖延；问人事则有裙带关系，主朋友、亲属、熟人等，所牵涉的人事较多。也可以作为应期使用。</b>',
      '<b>连茹受冲即破，逢空亡亦主无妨。</b>',
      '<b>关键几条</b>：',
      '<b>主迟滞、迟缓、拖延</b>',
      '<b>问人事有裙带关系</b>（朋友、亲属、熟人）',
      '<b>牵涉的人事较多</b>',
      '<b>可作应期</b>',
      '<b>受冲即破，逢空无妨</b>',
      '<b>课式说明</b>：连茹要求四位的地支<b>首尾相连、顺序不断</b> —— 比如课内见申、戌、亥，<b>中间缺一个酉</b>，<b>这个"缺"就是应期所在</b>。<b>本书课例中四位相连的不多</b>，<b>读者遇到时按"缺者为应期"这一条断即可</b>。',
      '<b>五、岁破、月破、日破</b>',
      '<b>5.1 定义</b>',
      '<b>金口诀的岁破、月破、日破（破即是地支相冲，比如太岁为寅，课内见申为岁破）也是很关键的成败因素。</b>',
      '<b>即</b>：<b>"破"就是"冲"</b> ——<b>课内某地支与太岁、月建、日建相冲。</b>',
      '<b>5.2 断法</b>',
      '<b>课内的任何干支与岁月相破，则代表求事反复，求事难成。</b>',
      '<b>这个破不单纯是指用神逢破，比如贵神逢破指工作受阻，将神逢破财运反复，地分逢破，孩童不吉，家有搬迁等。</b>',
      '<b>对于用神破，代表针对性事情的难易度。</b>',
      '<b>分位断法</b>：',
      '| 位置逢破 | 含义 |',
      '|---|---|',
      '| <b>贵神逢破</b> | <b>工作受阻</b> |',
      '| <b>将神逢破</b> | <b>财运反复</b> |',
      '| <b>地分逢破</b> | <b>孩童不吉，家有搬迁</b> |',
      '| <b>用神逢破</b> | <b>针对性事情的难易度</b> |',
      '<b>5.3 月破最重要</b>',
      '<b>特别是月破主求事难成，近期不易操作。</b>',
      '<b>月不单指一个月的时间，它代表一种时令、一种权利，有时比太岁的作用还要大，直接影响到事情成败吉凶。</b>',
      '<b>比如课内寅午戌火局成，但逢子月，这是破局，代表合作遭败，或者近期难以合作。</b>',
      '<b>日破常指当日或近期。</b>',
      '<b>一句话</b>：<b>月破比岁破更直接</b> ——<b>因为月建是"直接管事的"。</b>',
      '<b>5.4 破的吉凶两面</b>',
      '<b>破的吉凶两面——断婚姻最忌，断分手反快。</b>',
      '<b>即</b>：',
      '<b>求成合</b> ——<b>逢破不吉</b>（破就是散）',
      '<b>求分散</b> ——<b>逢破反而是好事</b>（快）',
      '<b>5.5 一个实用的窍门</b>',
      '<b>日月相冲日求测主破散。</b>',
      '<b>即</b>：<b>起课那天，日支与月支相冲</b> ——<b>这种日子求测，主事情破散。</b>',
      '<b>这是一个"择日"性质的经验。</b>',
      '---',
      '<b style="color:var(--c-gold)">第七节　神煞的活用</b>',
      '<b>课式说明</b>：破的查法最直接 —— <b>拿课内四位的地支，逐个与太岁、月建、日建去比</b>，<b>相冲的就是破</b>。<b>哪一位破，就断哪一位的事</b>（贵神破工作受阻、将神破财运反复、地分破家有搬迁）。<b>四个位置都查一遍，不要只看用神。</b>',
      '<b>一、神煞要与课体结合</b>',
      '<b>神煞不是孤立看的</b>：',
      '<b>神煞不可轻视——单看神煞就能断出目前处境；凶神吉神的制化。</b>',
      '<b>怎么"制化"？</b>',
      '<b>比如凶煞入课，但如果课内有吉神生合，或者凶煞本身休囚死受克</b> ——<b>凶性就减弱了。</b>',
      '<b>所以看神煞要看三点</b>：',
      '<b>它落在什么位置</b>',
      '<b>它本身旺不旺</b>',
      '<b>课内有没有生克制化</b>',
      '<b>二、课式实证：一课串起六种神煞</b>',
      '<b>神煞这一章最怕学成"名词手册"</b> —— 记了一堆起例，却不知道往哪儿放。<b>看一个课，就知道它们是怎么一起用的。</b>',
      '<code>`</code>',
      '干支：癸巳年　乙卯月　癸酉日　戊午时',
      '月将：戌　日空：戌、亥　四大空亡：水',
      '人元：壬　　水 + 相',
      '贵神：庚申（白虎）用　金 + 旺　天德、天马',
      '将神：甲寅（功曹）　木 + 死　月德、天医、六甲、劫煞',
      '地分：戌　　土 + 休',
      '<code>`</code>',
      '<b>问事</b>：<b>父母出外，什么时候回来。</b>',
      '<b>第一步：先定旺衰</b>',
      '四位是<b>水、金、木、土</b>。<b>金不受克</b>（课内无火）—— 所以<b>金旺</b>。金旺则<b>水相</b>（金生水）、<b>土休</b>（生金者）、<b>火囚</b>（克金者）、<b>木死</b>（金克木）。',
      '标到四位上：人元壬水<b>相</b>、贵神申金<b>旺</b>、将神寅木<b>死</b>、地分戌土<b>休</b>。',
      '<b>注意这一步是"课内定"</b> —— 不看时令、不看四柱，只看四位之间的生克。',
      '<b>第二步：看这个课带着哪些神煞</b>',
      '| 位 | 神煞 | 起例依据 |',
      '|---|---|---|',
      '| <b>贵神庚申</b> | <b>天德、天马</b> | 天德按<b>月令卯</b>取（卯月见申）；天马按月令取 |',
      '| <b>将神甲寅</b> | <b>月德、天医、六甲、劫煞</b> | 月德（亥卯未月见甲）；天医按月令（卯月退一位为寅）；六甲（天干为甲）；劫煞按<b>日支酉</b>取（巳酉丑日在寅） |',
      '| <b>地分戌</b> | — | 但<b>戌正是日空</b>（癸酉日属甲子旬，空戌亥） |',
      '<b>六个神煞落在两位上，各有各的用法</b>：',
      '<b>天马在贵神</b> —— <b>天马行空，主远行、主"摸不清"</b>。落在贵神（外面）上，说明<b>人确实在外面，而且走得远</b>。',
      '<b>天德在贵神</b> —— <b>天德是解厄之神</b>。出行在外的人带天德，主<b>一路有护佑</b>。',
      '<b>月德在将神</b> —— 也是吉神。<b>天德、月德两德俱在，主"人平安"</b>。',
      '<b>天医在将神</b> —— 天医主"病有救"。出行课带天医，就是<b>在外不至于生病出险</b>。',
      '<b>劫煞在将神</b> —— <b>劫煞偏凶</b>，落在将神上，提醒<b>在外要多留神</b>。',
      '<b>六甲在将神</b> —— 天干为甲即带六甲，主<b>事情有个新的开始</b>。',
      '<b>第三步：把神煞和课体合起来断方向</b>',
      '<b>人确实在外</b> —— 天马在贵神。',
      '<b>走得比较远</b> —— 天马行空，主远。',
      '<b>人是平安的</b> —— 天德、月德俱在，天医又在将神上护着。',
      '<b>但要留意意外</b> —— 劫煞在将神。',
      '<b>同样是"人出外"的课</b>：<b>带天德、月德就敢断平安，带劫煞就要提醒留神。</b> 这就是神煞的作用 —— <b>它不是单独拿来断的，是给课体加一层信息</b>。',
      '<b>第四步：用驿马、空亡定应期</b>',
      '<b>这一课问的是"什么时候回来"，关键在驿马和天马。</b>',
      '<b>天马落在申</b> —— <b>二月（卯月）的天马在申</b>（寅午戌月马在申）—— <b>按时辰排，庚申时正是天马临值</b>；',
      '<b>申与将神寅木相冲</b> —— <b>天马临值又逢冲，主"动"</b> —— <b>人该在这个时辰上动身</b>；',
      '<b>地分戌土正逢日空</b> —— <b>空在这里不是"不回来"，是"人还没落定"</b> —— 所以断<b>当天能回，应期就在申时</b>。',
      '<b>后来的反馈是：当天下午三点二十（申时）进的门</b> —— 与天马临值、逢冲而动正相合。',
      '<b>这就是神煞的用法，四步走完</b>：',
      '<b>先定旺衰 —— 再看带煞 —— 然后把神煞和课体合起来断方向 —— 最后用驿马、空亡定应期。</b>',
      '<b>三、神煞与用神的配合</b>',
      '<b>神煞落在用神上，作用最大</b>：',
      '<b>神煞的作用重心在用神与吉凶叠加。</b>',
      '<b>即</b>：<b>如果吉神落在用神上</b> ——<b>吉上加吉</b>；<b>凶煞落在用神上</b> ——<b>凶上加凶。</b>',
      '<b>课式实证：凶煞落在用神上</b>：',
      '<code>`</code>',
      '干支：乙未年　庚辰月　甲子日　丁卯时',
      '月将：酉　日空：戌、亥　四大空亡：水',
      '人元：丁　　火 - 旺　天德合、月德合、六丁',
      '贵神：庚午（朱雀）用　火 + 旺　病符、飞廉',
      '将神：癸酉（从魁）　金 - 死　丧门、丧车',
      '地分：卯　　木 - 休　天医',
      '<code>`</code>',
      '<b>这一课的用神是贵神庚午</b>（三阴一阳，阳上取）—— <b>而"病符""飞廉"两个煞，正落在这一位上</b>。',
      '<b>凶煞落在用神上，作用最大</b> —— 所以这一课的"病"与"灾"，是<b>直接落在当事人身上的</b>，不是旁枝末节。',
      '<b>对照看另外两位</b>：<b>将神癸酉带丧门、丧车</b> —— 也带煞，<b>但将神不是用神</b> —— <b>它的分量就要次一等</b>。<b>地分卯木带天医</b>（吉神），<b>又不是用神</b> —— 所以<b>"有救"这一层，是从旁边来的，不是从中心来的</b>。',
      '<b>这一课的分寸就是这么定的</b>：',
      '<b>煞落在用神上，说重；煞落在非用神上，说轻；吉神落在用神上，吉得实；吉神不在用神上，吉得虚。</b>',
      '<b>这就是"神煞的作用重心在用神与吉凶叠加"这句话的具体用法。</b>### 四、活用举例',
      '<b>几个活用神煞的例子</b>：',
      '<b>例一</b>：<b>酉金临天喜</b> ——<b>断"买鸡送礼"</b>（酉为鸡，天喜主喜庆之事，合起来是"买鸡送礼"）',
      '<b>例二</b>：<b>病符临贵神</b> ——<b>断考试漏洞、合同不完善</b>（贵神主文书合同，病符主有毛病）',
      '<b>完整课式</b>（第十三章课例四·断官司）：',
      '<code>`</code>',
      '起课时间：太岁未年　戌月',
      '日空：午、未（属甲申旬）',
      '人元：辛　　金 - 死',
      '贵神：午（朱雀）用　火 + 旺　病符',
      '将神：酉　　金 - 死　天医',
      '地分：丑　　土 - 相',
      '<code>`</code>',
      '<b>这一课问的是合同官司</b>。<b>病符正落在贵神上</b>，<b>而贵神主文书、合同</b> —— 两条一叠：',
      '<b>朱雀主合同文章，临病符 —— 即合同不完善、文章有毛病。</b>',
      '<b>所以断"这个合同不完善、有漏洞"</b> —— <b>神煞的性质（病符＝有毛病）加上所在位置的取象（贵神＝文书合同），合起来就是这一句断语。</b>',
      '<b>这一课正是"病符临贵神"的标准用法。</b>',
      '<b>例三</b>：<b>丧门入课，卯酉冲</b> ——<b>主家中女性有病灾</b>（丧门主病灾，卯酉为女性）',
      '<b>例四</b>：<b>朱雀主合同文章，临病符</b> ——<b>即合同不完善、文章有毛病</b>',
      '<b>这些例子的共同点是</b>：<b>把神煞的"性质"和它所在位置的"取象"结合起来。</b>',
      '<b>五、神煞在断课流程中的位置</b>',
      '<b>断课有十步，神煞在第七步</b>：',
      '<b>第七步——看课内干支所临神煞（驿马当先、月破力大、凶快吉慢）。</b>',
      '<b>三个提示很精辟</b>：',
      '<b>驿马当先</b> ——<b>驿马最先看</b>（因为断"动"最重要）',
      '<b>月破力大</b> ——<b>月破的力量最大</b>',
      '<b>凶快吉慢</b> ——<b>凶煞应验快，吉神应验慢</b>',
      '<b>为什么"凶快吉慢"？</b>',
      '<b>因为</b>：<b>凶煞是"破坏性"的，一旦条件成熟立刻发作；而吉神是"建设性"的，需要时间积累。</b>',
      '<b>这个经验很实用</b> ——<b>断"应期快慢"时可以用。</b>',
      '<b>六、神煞与空亡</b>',
      '<b>神煞也有空亡</b>：',
      '<b>太岁、月建、日建不逢空；时辰可逢空也可补空。</b>',
      '<b>即</b>：',
      '<b>四柱中的年月日不会"空"</b> ——<b>它们是实在的</b>',
      '<b>只有时辰能空、能补</b>',
      '<b>其他</b>：',
      '<b>神煞落空，其力减弱。</b>',
      '<b>比如</b>：<b>吉神落空，吉不起来；凶煞落空，凶不起来。</b>',
      '---',
      '<b style="color:var(--c-gold)">本章小结</b>',
      '<b>一、总论</b>',
      '<b>神煞是"人在时空中所临的吉凶状态"。</b>',
      '<b>神煞的作用是"定吉凶"</b> ——<b>凭驿马、神煞定其吉凶</b>。',
      '<b>神煞是辅助，不是绝对</b> ——<b>能逢凶化吉，也能转吉为凶</b>。',
      '<b>神煞也要看旺衰</b> ——<b>凡逢冲、破、空亡，其神无力</b>。',
      '<b>神煞分位置</b> ——<b>落在贵神是外面的事，落在将神是自己的事，落在地分是家里的事</b>。',
      '<b>二、驿马与天马</b>',
      '<b>驿马起例</b>：申子辰马在寅，亥卯未马在巳，巳酉丑马在亥，寅午戌马在申。',
      '<b>两个对立局互为驿马</b> ——<b>有了这个思路，很多断不出的信息就出来了</b>。',
      '<b>驿马起于日上</b>（也可是年月），<b>三处驿马代表三个时间段</b>。',
      '<b>驿马旺相主迅速</b>；<b>生外出行迅速，生内行人迷归</b>；<b>求失物难寻</b>。',
      '<b>驿马逢合则止</b>（断人来期）；<b>被合走不动，逢冲才能动</b>。',
      '<b>驿马受制</b>（空破冲刑害被合）——<b>主迟缓、拖延与应期</b>。',
      '<b>马头</b>是驿马生合的方向；<b>驿马逢三合六合为马群</b>（多人结伴出行）。',
      '<b>天马起例</b>：正七午、二八申、三九戌、四十子、五十一寅、六腊辰。',
      '<b>天马主快捷，宜速不宜迟</b>；<b>旺相飞快，受克迟缓，受冲迅速</b>；<b>坐飞机出国应天马</b>。',
      '<b>谁带驿马谁想动</b> ——<b>将神带驿马财要动，贵神带驿马工作要动，地分带驿马老本要动</b>。',
      '<b>二马（驿马、天马）不在用神上也管用</b>。',
      '<b>三、吉神</b>',
      '<b>天德</b>：正丁二申庚、三壬四辛同、五癸亥六甲、七癸八甲寅、九丙十居乙、子巳丑庚中。<b>天德入课无忧祸，逢凶化吉危得安。</b>',
      '<b>天德合</b>：天德相合之处。',
      '<b>月德</b>：寅午戌月在丙、亥卯未月在甲、申子辰月在壬、巳酉丑月在庚。',
      '<b>月德合</b>：月德相合之处。',
      '<b>天赦</b>：春戊寅、夏甲午、秋戊申、冬甲子（<b>干支同论</b>）。',
      '<b>天喜</b>：春见戌亥子、夏见丑寅卯、秋见辰巳午、冬见未申酉；<b>分真假天喜</b>（真天喜 = 月建退四位）。',
      '<b>三奇</b>：天三奇甲戊庚、地三奇乙丙丁、人三奇壬癸辛；<b>乙丙丁效果最佳</b>；<b>可断应期、不解空亡</b>；<b>只是有利条件，不能扭转大局</b>。',
      '<b>天医</b>：正月戌、二月亥……（月建退四位）；<b>与天医对冲为地医</b>。',
      '<b>四、凶煞</b>',
      '<b>丧门</b>：太岁前二辰；<b>吊客</b>：太岁后二辰。<b>贵神见吊客祸在外，将神见吊客祸在内。</b>',
      '<b>丧车</b>：春酉夏子秋卯冬午。<b>丧车临用又克人元，主病重伤重</b> —— <b>只断到"重"为止。</b>',
      '<b>飞廉</b>：正戌二巳三午四未五申六酉七辰八亥九子十丑十一寅十二卯。<b>主快、主惊恐</b>；<b>见好则好、见凶则更凶</b>。',
      '<b>五鬼</b>：甲己巳午未、乙庚寅卯、丙辛子丑、丁壬戌亥、戊癸申酉。<b>主出行损财、车祸</b>。',
      '<b>病符</b>：太岁后一辰。<b>主大病或灾祸</b>。',
      '<b>劫煞</b>：申子辰见巳、巳酉丑见寅、寅午戌见亥、亥卯未见申。<b>君子见之吉，小人见之凶。</b>',
      '<b>禄倒</b>：甲卯乙辰丙戊午、丁巳未庚酉辛戌、壬子癸丑。',
      '<b>马倒</b>：寅午戌见酉、申子辰见卯、巳酉丑见子、亥卯未见午。',
      '<b>截命灾煞</b>：甲己申酉、乙庚午未、丙辛辰巳、丁壬寅卯、戊癸子丑。',
      '<b>五、桃花</b>',
      '<b>四大桃花</b>：亥卯未见子、申子辰见酉、寅午戌见卯、巳酉丑见午；<b>桃花就是"沐浴"位</b>。',
      '<b>酉金是桃花之神</b> ——四大桃花之首。',
      '<b>桃花过重</b> ——子午卯酉任二三个相见，即便论婚姻也不吉。',
      '<b>桃花临三合局为败地</b> ——主求事暧昧迟缓、节外生枝。',
      '<b>四大桃花内部的关系</b>：子见午（强制）、子见卯（刑、暗自相合）、子见酉（相生、多情）、午见卯（破、昙花一现）、卯见酉（冲、邻里偷往、门当户对）。',
      '<b>号外桃花巳火</b> ——淫欲惊恐、常为第三者；巳见酉（淫滥之合）、巳见子（绝、分离）、巳见卯（同性恋成分）、巳见午（天罗、纠缠无果）。',
      '<b>桃花运与桃花劫</b> ——桃花受冲克刑为"劫"，主没有结果。',
      '<b>见桃花不一定有桃花</b> ——要分性质与所问之事（<b>问婚姻为吉，问工作为败</b>）。',
      '<b>六、其他神煞</b>',
      '<b>天罗地网</b>两套：日前一辰为天罗、对冲为地网；戌亥为天罗、辰巳为地网。<b>男怕天罗，女怕地网。</b>',
      '<b>关隔锁</b>：酉上见寅为关、卯上见戌为隔、卯上见申为锁。<b>解法</b>：木上见金为斩关、土上见木为毁隔、火上见金为破锁。',
      '<b>四丘</b>：春丑夏辰秋未冬戌。<b>四墓</b>：春未夏戌秋丑冬辰。',
      '<b>神煞之"墓"与十二长生之"墓"是两回事</b> ——<b>神煞之墓只是时令神煞，没有"木入墓"之说</b>。',
      '<b>连茹</b>：正连茹、倒连茹、跛脚连茹、阳连茹、阴连茹。<b>主迟滞拖延、裙带关系、牵涉人多</b>；<b>可作应期</b>。',
      '<b>岁破、月破、日破</b>（破即冲）：<b>贵神逢破工作受阻，将神逢破财运反复，地分逢破家有搬迁</b>；<b>月破最重要</b>；<b>破的吉凶两面</b>（断婚姻最忌，断分手反快）。',
      '<b>七、神煞的活用</b>',
      '<b>神煞要与课体结合</b> ——看位置、看旺衰、看生克制化。',
      '<b>神煞落在用神上，作用最大。</b>',
      '<b>断课第七步看神煞</b> ——<b>驿马当先、月破力大、凶快吉慢</b>。',
      '<b>神煞落空，其力减弱。</b>',
      '---',
      '<b style="color:var(--c-gold)">心法</b>',
      '<b>神煞是"辅助"，不是"主宰"</b>',
      '<b>好课带凶煞，好课也生变；坏课带吉神，可能逢凶化吉。</b>',
      '<b>这句话的分量在于</b>：<b>神煞能影响大局，但不能决定大局。</b>',
      '<b>所以看到凶煞，不要慌</b> ——<b>先看课体本身怎么样。</b>',
      '<b>课体好 + 凶煞</b> ——<b>有波折但能成</b>',
      '<b>课体差 + 吉神</b> ——<b>有转机但不一定成</b>',
      '<b>这就是"辅助"的意思。</b>',
      '<b>凶快吉慢</b>',
      '<b>这是很实用的一个经验</b>：',
      '<b>凶煞应验快，吉神应验慢。</b>',
      '<b>为什么？</b>',
      '<b>因为</b>：<b>凶煞是"破坏性"的，一旦条件成熟立刻发作；吉神是"建设性"的，需要时间积累。</b>',
      '<b>这个道理在生活里也一样</b>：',
      '<b>坏事往往来得突然</b>',
      '<b>好事往往需要积累</b>',
      '<b>所以断应期时</b>，<b>如果课里凶煞重，应期往往近；吉神重，应期往往远。</b>',
      '<b>神煞要活用，不能死套</b>',
      '<b>同一个神煞，落在不同位置、对不同的人、问不同的事，意思都不同。</b>',
      '<b>比如桃花</b>：',
      '<b>问婚姻</b> ——<b>是吉</b>（异性缘好）',
      '<b>问工作</b> ——<b>是败</b>（事情暧昧、节外生枝）',
      '<b>再比如劫煞</b>：',
      '<b>君子见之吉</b> ——<b>掌印权在手</b>',
      '<b>小人见之凶</b> ——<b>凶伤有官司</b>',
      '<b>所以断神煞，一定要结合"人"和"事"</b> ——<b>不能看到名字就下结论。</b>',
      '<b>万事有象必有事</b>',
      '<b>神煞断课，本质上是"以象推事"。</b>',
      '<b>课里出现一个神煞，就有相应的"象"</b> ——<b>有象必有事，只是时间早晚。</b>',
      '<b>所以看到凶煞不要轻视，看到吉神也不要大意</b> ——<b>该来的都会来，只是快慢不同。</b>',
      '<b>这也是神煞"辅助"作用的另一面</b>：<b>它提示你"会有什么事"，让你提前准备。</b>',
    ]},
    { t: '第八章　格局与入式歌诀', rows: [
      '<b style="color:var(--c-gold)">引言</b>',
      '<b>这一章讲什么</b>',
      '前面几章讲了<b>起课、位置、用神旺衰、五动三动、神煞</b>。',
      '<b>这一章讲两样"整体性"的东西</b>：',
      '<b>格局</b> ——课的整体结构是什么样',
      '<b>入式歌诀</b> ——古人总结的断课要诀',
      '<b>为什么这两样要放在一起？</b>',
      '因为它们都是<b>"看大局"</b> 的工具。',
      '<b>五动三动</b>看的是"某个点"',
      '<b>格局</b>看的是"整张网" ——几个位置之间是怎么抱团的、怎么对立的',
      '<b>入式歌诀里有一句，把断课的次序说得很清楚</b>：',
      '<b>凡占课，入式歌言其大象，五动爻观其大意，以格局看其事体，凭驿马、神煞定其吉凶，以空亡、月破、支干三合、六合验其成败。</b>',
      '<b>注意"以格局看其事体"</b> ——<b>格局管的是"事体"，也就是事情的性质。</b>',
      '<b>同样一个财动</b>：',
      '<b>在合局相生的课里</b> ——<b>得财顺利</b>（大家一条心）',
      '<b>在分局相克的课里</b> ——<b>得财也留不住</b>（各怀心思）',
      '<b>这就是格局的作用。</b>',
      '---',
      '<b style="color:var(--c-gold)">第一节　格局总论</b>',
      '<b>一、什么是格局</b>',
      '<b>1.1 定义</b>',
      '<b>格局就是课内四位之间形成的"整体结构"。</b>',
      '<b>常见的格局有几类</b>：',
      '<code>`</code>',
      '合局相生　　合局相克',
      '分局相生　　分局相克',
      '纯阳课　　　纯阴课',
      '一类朝元课',
      '<code>`</code>',
      '<b>此外还有</b>：',
      '<b>三合局</b>（寅午戌、亥卯未、申子辰、巳酉丑）',
      '<b>三会局</b>（寅卯辰、巳午未、申酉戌、亥子丑）',
      '<b>四位相生、四位相克</b>',
      '<b>1.2 格局怎么看</b>',
      '<b>打个比方就明白了</b>：',
      '<b>看格局就像看一个班级</b> ——',
      '<b>合局</b> ——<b>一个"文科班"</b>，大家志趣相投，抱团',
      '<b>分局</b> ——<b>分了帮派</b>，各干各的',
      '<b>成局</b> ——<b>人齐了</b>，能成事',
      '<b>半合</b> ——<b>人没齐</b>，力量弱',
      '<b>这个比方说明</b>：<b>格局看的是"这几个位置能不能拧成一股绳"。</b>',
      '<b>1.3 格局是"架构"</b>',
      '<b>起课之后先看格局，格局是"架构"。</b>',
      '<b>"架构"的意思是</b>：<b>它决定了这个课的"承重结构"。</b>',
      '<b>架构稳</b> ——<b>事情有基础</b>',
      '<b>架构散</b> ——<b>事情立不住</b>',
      '<b>所以格局是断课的第一步</b>：',
      '<b>断课第一步——先看课的格局，给课定性。</b>',
      '<b>注意"定性"两个字</b> ——<b>格局定的是"性质"，不是"细节"。</b>',
      '---',
      '<b style="color:var(--c-gold)">第二节　合局与分局</b>',
      '<b>一、两大类四种</b>',
      '<b>格局最基本的分法是"合局/分局"和"相生/相克"的组合</b>：',
      '| 格局 | 含义 |',
      '|---|---|',
      '| <b>合局相生</b> | <b>上下向内二神生</b> ——主合作一条心，力往一处使，利于合作 |',
      '| <b>合局相克</b> | <b>上下一起向内而克</b> ——外来干扰内侵，我方有损，时机不利 |',
      '| <b>分局相生</b> | <b>二人不一条心，各有所求</b> ——合作不成，夫妻分心各有所得；<b>利于各自发展</b> |',
      '| <b>分局相克</b> | <b>内有不合，各自分离，反目无情</b> ——合作分散，感情分离，<b>万事皆输</b>；利于分散事 |',
      '<b>二、逐类详解</b>',
      '<b>2.1 合局相生</b>',
      '<b>特征</b>：<b>几位之间互相生助，而且都朝向中间（二神）。</b>',
      '<b>断法</b>：',
      '<b>主合作一条心，力往一处使</b>',
      '<b>利于合作</b>',
      '<b>事情顺</b>',
      '<b>举例</b>：<b>第十三章课例六的那一课</b>（乙·戊午(朱雀)·戊午(胜光)用·卯）就是<b>合局相生</b>：',
      '<b>人元乙木生贵神戊午火</b>、<b>地分卯木也生将神午火</b>、<b>贵神与将神同为午火（同类）</b> —— <b>一路都是"生"或"同类"，没有一处相克</b>，力都聚在中间的二神上。',
      '<b>这就是"力往一处使"的样子。</b>',
      '<b>2.2 合局相克</b>',
      '<b>特征</b>：<b>几位之间抱团，但克的方向是朝内的。</b>',
      '<b>断法</b>：',
      '<b>外来干扰内侵，我方有损</b>',
      '<b>时机不利</b>',
      '<b>如果二神关系作用好，还有机会成功</b>',
      '<b>课式实证</b>：',
      '<code>`</code>',
      '干支：乙未年　庚辰月　甲子日　丁卯时',
      '月将：酉　日空：戌、亥　四大空亡：水',
      '人元：丁　　火 - 旺　天德合、月德合、六丁',
      '贵神：庚午（朱雀）用　火 + 旺　病符、飞廉',
      '将神：癸酉（从魁）　金 - 死　丧门、丧车',
      '地分：卯　　木 - 休　天医',
      '<code>`</code>',
      '<b>这一课的"抱团"很清楚</b>：<b>人元丁火、贵神午火、地分卯木</b> —— <b>木生火，三个字凑成一股火势</b>；<b>而将神癸酉金，孤零零一个</b>。',
      '<b>三个抱团，一起来克那一个</b> —— <b>火克金</b> —— <b>这就是"上下一起向内而克"</b> —— <b>合局相克</b>。',
      '<b>断法照格局走</b>：',
      '<b>外来干扰内侵</b> —— 外面的力量抱成团压进来；',
      '<b>我方有损</b> —— <b>被克的是将神（自己的财、自己的身）</b> —— 所以断<b>破财、伤身</b>；',
      '<b>时机不利</b> —— <b>这个月、这段时间不宜动</b>。',
      '<b>但格局只是"大势"</b> —— <b>具体断什么，还要看被克的那一位是谁</b>：<b>这一课被克的是将神酉金</b> —— 所以落点在<b>财与身</b>；<b>若被克的是贵神，落点就换成工作与长辈</b>。',
      '<b>"如果二神关系作用好，还有机会成功"</b> —— 这一课二神是<b>午火与酉金</b>，<b>火克金</b>，<b>二神本身就在克</b> —— <b>没有缓和</b> —— 所以这一课的机会，只能从"救"上找（人元带天德合、月德合，地分带天医）。#### 2.3 分局相生',
      '<b>特征</b>：<b>分为两派，但互相还有生助。</b>',
      '<b>断法</b>：',
      '<b>二人不一条心，各有所求</b>',
      '<b>合作不成</b>',
      '<b>夫妻分心，各有所得</b>',
      '<b>利于各自发展</b>',
      '<b>在婚姻上</b>：',
      '<b>无论感情再好，最终分离。</b>',
      '<b>为什么？</b> 因为<b>"分局"就代表"分"</b> ——<b>不管相不相生，格局已定。</b>',
      '<b>课式实证</b>：',
      '<code>`</code>',
      '干支：丙申年　甲午月　庚午日　辛巳时',
      '月将：未　日空：戌、亥　四大空亡：水',
      '人元：壬　　水 + 旺',
      '贵神：戊寅（青龙）用　木 + 相　天德合、天喜、天马',
      '将神：甲申（传送）　金 + 休　驿马、六甲、飞廉',
      '地分：午　　火 + 死　吊客、截路',
      '<code>`</code>',
      '<b>这一课分成两派，分得很干净</b>：',
      '<b>贵神寅木 + 地分午火</b> —— <b>木生火</b>，一派；',
      '<b>人元壬水 + 将神申金</b> —— <b>金生水</b>，另一派。',
      '<b>两派各自内部都是相生</b> —— <b>这就是"分局相生"</b>。',
      '<b>断法照格局走</b>：',
      '<b>"二人不一条心，各有所求"</b> —— 各人有各人的算盘；',
      '<b>"合作不成"</b> —— 想合着做一件事，合不到一块儿；',
      '<b>"夫妻分心，各有所得"</b> —— 各走各的路，各自都能有收获；',
      '<b>"利于各自发展"</b> —— <b>所以这一课问合作是坏消息，问"各干各的"反而是好消息</b>。',
      '<b>这就是"分局"两个字的份量</b>：<b>不管相不相生，格局已经定了"分"</b> —— 所以<b>《入式歌》讲婚姻时说得直白</b>：<b>分局之课，无论感情再好，最终分离</b>。',
      '<b>这一课问的是事业财运</b> —— 所以落的断语是<b>"财运不是你单独求财，会有几人的参与"</b> —— <b>"有几人参与"正是"分局"的象</b>：<b>看着在一起，实则各有所求</b>。#### 2.4 分局相克',
      '<b>特征</b>：<b>分为两派，而且互相克。</b>',
      '<b>断法</b>：',
      '<b>内有不合，各自分离，反目无情</b>',
      '<b>合作分散，感情分离</b>',
      '<b>万事皆输</b>',
      '<b>利于分散事</b>',
      '<b>注意"利于分散事"</b> ——<b>如果所求之事本来就是"分散"（比如分手、拆伙），那分局相克反而是好事。</b>',
      '<b>课式实证</b>：',
      '<code>`</code>',
      '人元：己　　土',
      '贵神：丁卯　木',
      '将神：乙丑（大吉）用　土',
      '地分：巳　　火',
      '<code>`</code>',
      '<b>这一课也分两派，但两派之间是"克"</b>：',
      '<b>贵神卯木 + 地分巳火</b> —— <b>木生火</b>，一派；',
      '<b>人元己土 + 将神丑土</b> —— <b>同类，一派</b>；',
      '<b>而前面的木火，正克后面的土</b> —— <b>木克土</b> —— <b>这就是"分局相克"</b>。',
      '<b>断法照格局走</b>：',
      '<b>"内有不合，各自分离，反目无情"</b> —— 不是简单的不合，是<b>要翻脸</b>；',
      '<b>"合作分散，感情分离"</b>；',
      '<b>"万事皆输"</b> —— 求"合"的事，一件都办不成。',
      '<b>用在婚姻上最直接</b>：<b>这一课二神是卯木与丑土，木克土</b> —— <b>对方克自己</b> —— 再加上<b>格局本身是分局相克</b> —— <b>两条叠在一起，这段关系是"分离"的格局</b>。',
      '<b>但有一句要记住</b> —— <b>"利于分散事"</b>：',
      '<b>如果所求之事本来就是"分散"（分手、拆伙、离职），那分局相克反而是好事。</b>',
      '<b>同一个格局，问"能不能成"是坏消息，问"能不能散"是好消息</b> —— <b>格局本身没有吉凶，吉凶在"所求之事"上。</b>### 三、格局与所求之事的关系',
      '<b>这是很重要的一点</b>：',
      '<b>格局对事物发展成败起到很关键的作用，不可忽视。</b>',
      '<b>但格局的吉凶，要看所求之事</b>：',
      '| 格局 | 求"合"的事 | 求"分"的事 |',
      '|---|---|---|',
      '| <b>合局相生</b> | <b>吉</b> | 不利 |',
      '| <b>合局相克</b> | <b>凶</b> | 不利 |',
      '| <b>分局相生</b> | <b>不利</b> | 有利 |',
      '| <b>分局相克</b> | <b>凶</b> | <b>有利</b>（利于分散） |',
      '<b>所以</b>：',
      '<b>如果是分局相克则求事艰难，（断分离分散除外）这种情况下断成的应期就意义不大了。</b>',
      '<b>因为心没有往一处使，强扭的瓜不甜。</b>',
      '<b>这句话点出了关键</b>：<b>格局是"根"，应期是"枝叶"</b> ——<b>根都坏了，谈什么时候开花没有意义。</b>',
      '---',
      '<b>四、课式实证：合局相生</b>',
      '<code>`</code>',
      '干支：丙申年　癸巳月　戊戌日　庚申时',
      '月将：申　日空：辰、巳　四大空亡：水',
      '人元：辛　　金 - 旺　天德',
      '贵神：己未（太常）　土 - 休　病符、飞廉',
      '将神：辛酉（从魁）用　金 - 旺　天德',
      '地分：酉　　金 - 旺',
      '<code>`</code>',
      '<b>看四位的生克</b>：',
      '<b>贵神己未土 → 人元辛金</b> —— <b>土生金</b>，这是<b>往上生</b>；',
      '<b>贵神己未土 → 将神辛酉金</b> —— <b>土生金</b>，这是<b>往下生</b>；',
      '<b>将神辛酉金 与 地分酉金</b> —— <b>同为金</b>，<b>比和</b>。',
      '<b>这个格局叫什么？</b>',
      '<b>贵神己未土，一位土生着三位金</b> —— <b>所有的"生"都从这一个源头出来，往上、往下都通</b>。',
      '<b>这就是"合局相生"</b>：',
      '<b>四位之间的力量是顺畅的、往一处聚的</b> —— <b>源头（土）生出去，落到金上，金与金又是同类</b> —— <b>没有一处相克</b>。',
      '<b>合局相生主什么？</b>',
      '<b>主事情顺、内外一气、有人帮衬。</b>',
      '<b>断事就是</b>：<b>这件事顺着来、不费劲，四方都往一个方向使劲</b>。问合作是"一拍即合"，问求财是"财路通"，问办事是"一路放行"。',
      '<b>但这里有一个"偏"处要注意</b>：<b>一土生三金</b> —— <b>土只有一位，金有三位</b>。',
      '<b>这就是偏的地方</b>：<b>源头单薄，去处太多</b>。断事就要补一句：',
      '<b>事情是顺的，但支撑的力量薄</b> —— <b>那一位土被泄得太厉害，时间长了会供不上</b>。',
      '<b>所以合局相生也有两种断法</b>：',
      '<b>四位均衡的相生</b> —— 一路顺到底；',
      '<b>一位生多位的</b> —— 顺，但<b>要考虑那个"源头"撑不撑得住</b>。',
      '<b style="color:var(--c-gold)">第三节　三合局与三会局</b>',
      '<b>一、三合局</b>',
      '<b>1.1 四种三合局</b>',
      '| 三合局 | 性质 |',
      '|---|---|',
      '| <b>寅午戌</b> 合火局 | <b>财帛文书喜美之合</b> |',
      '| <b>亥卯未</b> 合木局 | <b>交易婚姻和会之合</b> |',
      '| <b>申子辰</b> 合水局 | <b>行移征战干蛊之合</b> |',
      '| <b>巳酉丑</b> 合金局 | <b>阴阳淫滥轻薄之合</b> |',
      '<b>三合的关系</b>：',
      '<b>地支间的三合关系是构成对应的等边三角形关系。这种关系是一种最稳定的关系。</b>',
      '<b>即每种三合关系都构成一种朋党关系，它们之间相互照应、互帮互助。</b>',
      '<b>1.2 逐局详解</b>',
      '<b>寅午戌火局——喜庆之局</b>',
      '<b>主喜庆文书、婚嫁、联欢、求名求学，吉祥喜美</b>',
      '<b>人元见丙为火局全，占事主成，有名气有名望</b>',
      '<b>如果有亥子水入课，则火局被破。合而不合，成而复败</b>',
      '<b>亥卯未木局——宜婚宜商</b>',
      '<b>利占婚姻交易有成</b>',
      '<b>如申酉金入课，则主木局被破，凡事成而复败，由易变难</b>',
      '<b>如人元再见乙，则木局全，占事主成</b>',
      '<b>最怕酉金局</b>',
      '<b>申子辰水局——征战之局</b>',
      '<b>虽为三合之局，但常有内部争斗不合，各自为政</b>',
      '<b>申为金有萧杀之气，子有盗名淫欲之举，辰为恶势暗斗</b> ——<b>三方沆瀣一气，必定不易长久</b>',
      '<b>最怕见戌土破局。戌土有政法军警之象，逢辰必动</b>',
      '<b>人元见壬水为水局全</b>',
      '<b>巳酉丑金局——贪淫轻薄</b>',
      '<b>巳为是非游弋之神，趋炎附势、贪淫轻薄</b>',
      '<b>酉为桃花淫神，求事一般有女子参与或因女人事起</b>',
      '<b>丑为老妇人、金库</b>',
      '<b>巳火欲克酉贪淫，但丑能掩其酉、泄其巳</b>，就成了<b>巳想克金贪生，酉想得丑护身，丑想得巳之利</b>',
      '<b>淫欲贪婪轻薄相合，终不能长久</b>',
      '<b>常指为某种利益临时组合在一起的三合</b>',
      '<b>人元再见丁为金局全；逢午为坏局、求事阻隔难成</b>',
      '<b>1.3 三合局的"头、中、库"</b>',
      '<b>三合局里，三个字各有分工</b>：',
      '<b>以亥卯未木局为例</b>：',
      '<b>亥</b> ——<b>头</b>（起始）',
      '<b>卯</b> ——<b>中</b>（中间、核心）',
      '<b>未</b> ——<b>库</b>（归宿、仓库）',
      '<b>这个分工在断课时有用</b>：',
      '<b>看"头"</b> ——知道事情的起因',
      '<b>看"中"</b> ——知道事情的核心',
      '<b>看"库"</b> ——知道事情的结果',
      '<b>有一条重要的法则</b>：',
      '<b>三合局亥卯未的"头、中、库"与冲克法则。</b>',
      '<b>即</b>：<b>要破一个三合局，最好的办法是"拦腰斩断"</b> ——<b>打它的"中"</b>。',
      '<b>1.4 破局之法</b>',
      '<b>怎么破一个三合局？</b>',
      '<b>方法一：冲</b>',
      '<b>寅午戌火局</b> ——<b>子来冲午</b>',
      '<b>亥卯未木局</b> ——<b>酉来冲卯</b>',
      '<b>申子辰水局</b> ——<b>戌来冲辰</b>',
      '<b>巳酉丑金局</b> ——<b>午来克酉</b>',
      '<b>方法二：拦腰斩断</b>',
      '<b>破局之法——拦腰斩断与卯酉冲。</b>',
      '<b>即</b>：<b>直接冲它的"中"</b> ——<b>这是最有效的破法。</b>',
      '<b>注意一条</b>：',
      '<b>合局性质辨析——水局不能用火破，须戌土冲开辰库。</b>',
      '<b>为什么？</b> 因为<b>水局不怕火</b>（水克火），<b>要用土来克水</b> ——<b>而且是"冲开辰库"（戌冲辰）。</b>',
      '<b>1.5 破局的快慢</b>',
      '<b>不同的破法，快慢不同</b>：',
      '<b>子破火局快</b>',
      '<b>酉破木局快</b>',
      '<b>戌破水局最快</b>',
      '<b>金局宜火克</b>',
      '<b>1.6 成局与坏局</b>',
      '<b>成局的条件</b>：',
      '<b>合化成局的外部条件——外面有一个支持的就够。</b>',
      '<b>坏局的条件</b>：',
      '<b>三合局怎样才是坏局？如寅午戌合火局，如果人元见水不能算坏局，只有课内见子或亥才是坏局。</b>',
      '<b>注意这条特殊规定</b> ——<b>人元见水不算坏局</b>（因为人元是天干，是"象"，力量小），<b>课内见子或亥才算。</b>',
      '<b>1.7 天干搭桥成局</b>',
      '<b>除了地支三合，天干也能"搭桥"</b>。',
      '<b>如果课内已有两个地支成局之势，第三个字在"天干"上出现</b> —— 这叫"<b>搭桥</b>"。',
      '<b>但天干只是"借用"，不是真正的成局</b>：<b>天干是象、不是实体，它不能和课内的地支发生作用</b>（详见第一章「天干与地支不能直接作用」）。',
      '<b>所以搭桥成局只是"论数量"，不能当作真局来断吉凶</b> —— 它说明<b>"有那个意思、有那个趋势"，但落不到实处</b>。',
      '<b>1.8 三合逢空的断法</b>',
      '<b>三合六合逢空与"空合"的断法。</b>',
      '<b>即</b>：<b>三合或六合的字逢空</b> ——<b>这叫"空合"</b> ——<b>看着合了，实际上是空的。</b>',
      '---',
      '<b>二、三会局</b>',
      '<b>2.1 四种三会局</b>',
      '<b>寅卯辰三会木局，巳午未三会火局，申酉戌三会金局，亥子丑三会水局。</b>',
      '<b>2.2 三会与三合的区别</b>',
      '| | <b>三会（三汇）</b> | <b>三合</b> |',
      '|---|---|---|',
      '| <b>构成</b> | <b>相同一条线上的三个地支</b> | <b>三个位置的关系组合</b> |',
      '| <b>比喻</b> | <b>邻居关系</b> | <b>亲戚朋友的组合</b> |',
      '| <b>特点</b> | 遇到问题能同心协力，<b>力量大，随大溜不持久</b> | 为了某事聚合在一起，<b>长久性高</b> |',
      '<b>"邻居关系"和"亲戚关系"的比方很形象</b>：',
      '<b>邻居</b> ——<b>住得近，有事能帮，但感情不深，谁搬走了就散了</b>',
      '<b>亲戚</b> ——<b>有血缘（三合的内在关系），虽然离得远，但关系长久</b>',
      '<b>2.3 三会的用法</b>',
      '<b>三会主要用于</b>：',
      '<b>断应期</b> ——<b>三会缺一，缺者为应期</b>',
      '<b>断格局</b> ——<b>三会成局，力量大</b>',
      '---',
      '<b>三、课式实证：一个纯阴课里的金木交战</b>',
      '<b>格局好不好懂，看一个课就明白了。这一课同时具备纯阴课、合局相克、分局相克三层。</b>',
      '<code>`</code>',
      '人元：己　　土',
      '贵神：丁卯　木',
      '将神：乙丑（大吉）用　土',
      '地分：巳　　火',
      '<code>`</code>',
      '<b>第一层：先看是不是纯阴纯阳</b>',
      '<b>四位一个个数阴阳</b>：',
      '| 位 | 干支 | 阴阳 |',
      '|---|---|---|',
      '| 人元 | 己 | 阴 |',
      '| 贵神 | 卯 | 阴 |',
      '| 将神 | 丑 | 阴 |',
      '| 地分 | 巳 | 阴 |',
      '<b>四位全阴 —— 这是纯阴课。</b>',
      '<b>纯阴课主什么？</b> 主<b>"这个事情不正常"</b>：纯阴纯阳都偏离了阴阳相配的常道，所以事情的走向<b>不合常规</b>，或者<b>当事人自身的状态是偏的</b>——比如单身、心里没底、使不上劲。',
      '<b>第二层：找课内能不能成局</b>',
      '<b>看课内有什么字能凑成三合</b>：',
      '<b>巳</b>：巳酉丑三合金局的一角',
      '<b>丑</b>：巳酉丑的另一角',
      '<b>还差一个酉</b> —— 而<b>日建正是酉</b>',
      '<b>日建来补，局就成了：巳酉丑合金局。</b>',
      '<b>这就是"合局"的判断方法</b>：课内已有的字 + 四柱（尤其是日建、月建）来的字，<b>凑满三合就是成局</b>。局不是课内自己凑的，<b>外环境也能帮你凑</b>。',
      '<b>第三层：这个局是生还是克</b>',
      '<b>局成了，要看它克谁、生谁。</b>',
      '<b>金局</b> —— 课内<b>没有金</b>（己是土、卯是木、丑是土、巳是火）',
      '局成之后，<b>金局要克的是木</b> —— 课内<b>只有卯木一个</b>',
      '<b>所以这是"合局相克"</b>：<b>巳丑抱成一团（金局），掉过头来克卯木。</b>',
      '<b>再看力量对比</b>：',
      '<b>金局是一方，三个字抱团</b>（巳、丑 + 日建酉）',
      '<b>卯木是一方，孤零零一个字</b>',
      '<b>一个字对三个字，这是"分局相克"</b> —— 课内的力量<b>分了派</b>，一派是势，一派是孤。',
      '<b>第四层：这样断什么</b>',
      '<b>局克单，单不敌局。</b> 卯木虽然当旺，<b>但一个打不过一伙</b>。所以断事就是：',
      '<b>原本占上风的那一方（卯木），最终会被抱团的那一方（金局）压过去。</b>',
      '<b>要注意"原本"两个字</b>。<b>在局没成之前</b>，卯木是<b>一木克二土</b>（克人元己土、克将神乙丑土），它是强势的一方。<b>但局一成，情势就翻过来了。</b>',
      '<b>这就是格局断事的关键</b>：<b>单个干支的强弱只是当下，格局管的才是结局</b>。所以断课要<b>先看局，再看单个干支</b>——局势定了，单个的变化只是过程。',
      '<b>第五层：局什么时候成</b>',
      '<b>局不是一开始就有的，它等一个条件</b> —— 这一课等的是<b>酉</b>。',
      '<b>酉什么时候来？</b> 来在<b>日建</b>上，也在<b>流年流月</b>上。<b>所以应期就看"酉"</b>：逢酉的年月日，局成、事情转折。',
      '<b>如果酉一直不来，局就一直不成</b>，那卯木就一直是强势方。<b>所以这一课的走向，全看那个"酉"字什么时候到。</b>',
      '<b>这一课的断法顺序，就是本课的规矩</b>：',
      '<b>数阴阳</b> → 纯阴课，事情不合常规',
      '<b>找成局</b> → 巳酉丑金局（靠日建补全）',
      '<b>定生克</b> → 合局相克，金局克卯木',
      '<b>比力量</b> → 局对单，分局相克',
      '<b>定应期</b> → 等酉字到',
      '<b style="color:var(--c-gold)">第四节　其他格局</b>',
      '<b>一、纯阴课、纯阳课</b>',
      '<b>1.1 定义</b>',
      '<b>纯阴课</b> ——<b>四位全阴</b>',
      '<b>纯阳课</b> ——<b>四位全阳</b>',
      '<b>1.2 断法</b>',
      '<b>纯阴课</b>：',
      '<b>局限、压抑</b>',
      '<b>求事不能操之过急</b>',
      '<b>男子求测纯阴课</b> ——<b>做事不干脆，有女性化作风</b>',
      '<b>问事主阴暗不明，心里压抑，求事拖拉</b>',
      '<b>但阴极返阳，事情即将转暗为明，等待时机</b>',
      '<b>纯阳课</b>：',
      '<b>求事需要快</b>',
      '<b>女子纯阳课</b> ——<b>性格刚烈，常以事业为主，有男子之风</b>',
      '<b>自己现在正处于绝对优势，将由阳转阴，有利变不利</b>',
      '<b>做事易速不易迟</b>',
      '<b>1.3 一句话总纲</b>',
      '<b>纯阳不长，纯阴不生。</b>',
      '<b>即</b>：<b>两种极端格局都不能持久，都要往反方向走。</b>',
      '<b>1.4 课式实证：纯阴课与纯阳课</b>',
      '<b>纯阳课</b>（四位全阳）：',
      '<code>`</code>',
      '干支：丙申年　甲午月　庚午日　辛巳时',
      '月将：未　日空：戌、亥　四大空亡：水',
      '人元：壬　　水 + 旺',
      '贵神：戊寅（青龙）用　木 + 相　天德合、天喜、天马',
      '将神：甲申（传送）　金 + 休　驿马、六甲、飞廉',
      '地分：午　　火 + 死　吊客、截路',
      '<code>`</code>',
      '<b>四位是壬（阳）、寅（阳）、申（阳）、午（阳）</b> —— <b>纯阳课</b> —— <b>纯阳以贵神为用</b>（用神是戊寅）。',
      '<b>纯阳课主什么？</b> <b>主刚、主动、主快、主明</b> —— 所以这一课断<b>"流动性强、要跑动、事情来得急"</b>，取的就是纯阳的象。',
      '<b>但纯阳也有短处</b>：<b>刚则易折、动则难守</b> —— 所以同一课又断<b>"不太会理财、钱存不住"</b> —— <b>一面是能闯，一面是留不住</b>。',
      '<b>纯阴课</b>（四位全阴）：',
      '<code>`</code>',
      '干支：戊子年　乙丑月　庚申日　壬午时',
      '月将：子　日空：子、丑　四大空亡：金',
      '人元：乙　　木 - 死　天德合、月德合',
      '贵神：癸未（太常）　土 - 休',
      '将神：己卯（太冲）用　木 - 死　飞廉',
      '地分：酉　　金 - 旺　天喜',
      '<code>`</code>',
      '<b>四位是乙（阴）、未（阴）、卯（阴）、酉（阴）</b> —— <b>纯阴课</b> —— <b>纯阴以将神为用</b>（用神是己卯）。',
      '<b>纯阴课主什么？</b> <b>主柔、主静、主慢、主暗</b> —— 所以这一课断<b>"婚姻要等到 2011 年才稳""改行要等明年秋天"</b> —— <b>都应在这个"慢"字上</b>。',
      '<b>两课对看，规律就出来了</b>：',
      '<b>纯阳主"快而显"，纯阴主"慢而隐"。</b> <b>同样问一件事，纯阳课给的应期近，纯阴课给的应期远。</b>',
      '<b>这不是两条死规矩，是阴阳本性的自然延伸</b> —— <b>阳动阴静，落到时间上就是快慢，落到人事上就是明暗。</b>### 二、一类朝元课',
      '<b>2.1 定义</b>',
      '<b>一类朝元是一干见本属三支也。</b>',
      '<b>如甲见三寅，乙见三卯，丙见三午，丁见三巳，戊见三辰或三戌，己见三未三丑，庚见三申，辛见三酉，壬见三子，癸见三亥，都为一类朝元。又称四位伏吟课。</b>',
      '<b>即</b>：<b>四位是同一个五行</b>（比如四木、四火、四金、四土、四水）。',
      '<b>2.2 断法</b>',
      '<b>一类朝元主事体重叠，闭伏不动，无荣无誉，淹滞阻隔，因为有同类比肩而不动，无父母、官鬼、妻财、子孙动。</b>',
      '<b>逐条</b>：',
      '<b>事体重叠</b> ——<b>一件事叠着另一件事</b>',
      '<b>闭伏不动</b> ——<b>动不了</b>',
      '<b>无荣无誉</b> ——<b>没有好坏</b>',
      '<b>淹滞阻隔</b> ——<b>拖延、受阻</b>',
      '<b>因为有同类比肩而不动</b> ——<b>都是"兄弟"，没有"动"的契机</b>',
      '<b>2.3 分类断语</b>',
      '<b>四木朝元课，主求事极为不顺。</b>',
      '<b>四火朝元课，主灾祸伤残。</b>',
      '<b>四金朝元课，主官讼奸淫无纲。</b>',
      '<b>四土朝元课，主迟延反复。</b>',
      '<b>一色课的特殊断语</b>：',
      '<b>全火凋残</b>',
      '<b>全金为凶</b>',
      '<b>2.4 四木的化解</b>',
      '<b>四木主新盖房屋但四壁空空，亦主周围丛林茂盛、树不成材，需逢金年月修剪。</b>',
      '<b>即</b>：<b>四木的课，要等金旺的年月来"修剪"</b> ——<b>这就是化解。</b>',
      '<b>2.5 课式实证：三金一类朝元</b>',
      '<code>`</code>',
      '四柱：丙申年　壬辰月　甲戌日　壬申时',
      '月将：酉　日空：申、酉　四大空亡：无',
      '人元：壬　　水 + 相　　天德、月德',
      '贵神：壬申（白虎）　金 + 旺　　天德、月德、驿马、截路',
      '将神：癸酉（从魁）用　金 - 旺　　丧车',
      '地分：申　　金 + 旺　　驿马、截路',
      '<code>`</code>',
      '<b>四位里三个金</b>（贵神申、将神酉、地分申）—— <b>一类朝元</b>。',
      '<b>断法照"一类朝元"走</b>：',
      '<b>主"同一类的事多、反复、成堆"</b> —— 三个金，说明<b>跟"金"有关的事不止一件</b>；',
      '<b>"至少三人"</b> —— 这一课问工作，<b>三金同现</b>，断的正是<b>"不会是他一个人，最少还有三个人一起"</b>；',
      '<b>"不止一项"</b> —— <b>流动性强、工作不止一项</b> —— 取的也是"同类多"的象。',
      '<b>但三金不是全无差别</b>：<b>两个申是阳金，一个酉是阴金</b> —— <b>同类里掺了一个不同性质的</b> —— 所以断<b>"一起的人里头，可能有女的"</b>。',
      '<b>这就是"一类朝元"的用法</b>：<b>先数有几个（定数量），再看它们的阴阳同不同（定性质），最后看它们跟课内其他字的关系（定事情）。</b>',
      '<b>再看旺衰</b>：<b>三金都不受克</b>（课内无火），<b>金又占三位</b> —— <b>金旺</b>、<b>水相</b> —— 所以这一课的水<b>不是主角，是被金一路生出来的那一个</b>（详见第四章"多者为旺"）。### 三、四位相生与四位相克',
      '<b>3.1 四位相生</b>',
      '<b>四位相生百事吉。</b>',
      '<b>即</b>：<b>四位之间依次相生，没有克冲</b> ——<b>这种课最好断，以吉论。</b>',
      '<b>为什么？</b>',
      '<b>就像一家人，谁强一点弱一点都是自家人，不必分得太清。</b>',
      '<b>3.2 四位相克</b>',
      '<b>四位相克万事凶。</b>',
      '<b>但有程度之分</b>：',
      '<b>四位生克歌诀与"三个克上／三个克下"。</b>',
      '<b>"三个克上"和"三个克下"是不同的</b>：',
      '<b>三个克上</b>（下面三个都克上面）——<b>自下依次克上，为有能力之人、外出之人</b>',
      '<b>三个克下</b>（上面三个都克下面）——<b>从上依次克下，阻力重重</b>',
      '<b>3.3 四位相生与五动三动的可靠度</b>',
      '<b>有一条重要的比较</b>：',
      '<b>四位相生百事吉，内有刑克忧患缠（含与五动三动的可靠度差异）。</b>',
      '<b>即</b>：',
      '<b>四位相生</b> ——<b>大方向吉</b>',
      '<b>但如果有刑克</b> ——<b>还是会有麻烦</b>',
      '<b>注意"与五动三动的可靠度差异"</b> ——<b>格局看的是"大方向"，五动三动看的是"具体动向"。</b>',
      '<b>两者要合起来看</b>：',
      '<b>格局好 + 五动凶</b> ——<b>大方向好，但某个环节有问题</b>',
      '<b>格局差 + 五动吉</b> ——<b>大方向不利，但某一步能得分</b>',
      '<b>3.4 课式实证：四位相生与四位相克</b>',
      '<b>四位相生</b>（一路生下去，没有一处相克）：',
      '<code>`</code>',
      '人元：辛　　金 - 旺　天德',
      '贵神：己未（太常）　土 - 休　病符、飞廉',
      '将神：辛酉（从魁）用　金 - 旺　天德',
      '地分：酉　　金 - 旺',
      '<code>`</code>',
      '<b>四位是辛金、未土、酉金、酉金</b> —— <b>土生金</b>，<b>一路都是生或同类</b>，<b>没有一处相克</b>。',
      '<b>四位相生主什么？</b> <b>主顺、主和、主事情能成，过程不别扭</b>。',
      '<b>但"顺"不等于"好"</b> —— <b>要看所求的是什么</b>：<b>求合、求成，四位相生是吉</b>；<b>求"快刀斩乱麻"式的了断，四位相生反而拖着办不成</b>。',
      '<b>四位相克</b>（一路上克下来）：',
      '<code>`</code>',
      '干支：乙未年　庚辰月　甲子日　丁卯时',
      '月将：酉　日空：戌、亥　四大空亡：水',
      '人元：丁　　火 - 旺　天德合、月德合、六丁',
      '贵神：庚午（朱雀）用　火 + 旺　病符、飞廉',
      '将神：癸酉（从魁）　金 - 死　丧门、丧车',
      '地分：卯　　木 - 休　天医',
      '<code>`</code>',
      '<b>四位是丁火、午火、酉金、卯木</b> —— <b>火克金、金克木</b> —— <b>一路上克下来</b> —— <b>四位相克</b>。',
      '<b>四位相克主什么？</b> <b>主事情一层压一层、矛盾不断</b> —— 所以这一课断<b>"伤灾、破财、下肢受伤"</b> —— <b>每一处克，都应一件事</b>。',
      '<b>两课摆在一起看</b>：',
      '| | 四位相生 | 四位相克 |',
      '|---|---|---|',
      '| <b>课内</b> | 一路生或同类 | 一路上克 |',
      '| <b>大势</b> | 顺、能和、能成 | 阻、矛盾多、层层出问题 |',
      '| <b>断法</b> | 顺着说"能成" | 一处克断一件事 |',
      '<b>但都要记住那一条</b>：<b>格局的吉凶，最终看所求之事</b> —— <b>求合遇相生是吉，求分遇相克是吉</b> —— <b>格局只是"大势"，不是结论。</b>### 四、格局不止四种',
      '<b>有一条提醒</b>：',
      '<b>格局不止"合局相生、合局相克、分局相克"。</b>',
      '<b>即</b>：<b>格局的分类是开放的</b> ——<b>除了上面讲的，还有三合局、三会局、纯阴纯阳、一类朝元等等。</b>',
      '<b>而且</b>：',
      '<b>连茹不算格局。</b>',
      '<b>即</b>：<b>连茹是一种"关系"，不是一种"格局"。</b>',
      '---',
      '<b style="color:var(--c-gold)">第五节　入式歌诀</b>',
      '<b>一、入式歌全文</b>',
      '<b>入式之法妙通玄，月将加时方上传。</b>',
      '<b>更看何神同何位，日干须用五子元。</b>',
      '<b>克者为无从旺断，五行之内细推元。</b>',
      '<b>更将神将详吉凶，方察来人见的端。</b>',
      '<b>二木为爻求难得，二土比和迟晚看。</b>',
      '<b>二金刑克都无顺，二火为灾百事残。</b>',
      '<b>二水皆须为大吉，水来入火妇难安。</b>',
      '<b>金入木乡忧口舌，火临金位有迍邅。</b>',
      '<b>木来入土为刑狱，土行水上竞庄田。</b>',
      '<b>上克下兮从外入，下克上兮向外边。</b>',
      '<b>主克客兮来索物，客克主兮客空还。</b>',
      '<b>四位相生百事吉，内有刑克忧患缠。</b>',
      '<b>但取寅申为贵客，子午卯酉吃食言。</b>',
      '<b>巳亥常为乞索物，小吉妇人酒食筵。</b>',
      '<b>水土金火为窑灶，庚辛锥磨及门窗。</b>',
      '<b>庚午改门并接屋，四孟相生有草房。</b>',
      '<b>丙丁旺处人最恶，与姓相生子孙昌。</b>',
      '<b>四位相刑主有克，上下相生福满堂。</b>',
      '<b>上克下兮宅必下，下克上兮岭头庄。</b>',
      '<b>甲乙为林单见树，见金枝损及皮伤。</b>',
      '<b>丙丁旺处为高岭，庚辛为斜道宜详。</b>',
      '<b>戊己为坟看旺处，土为坟垄痛苦殃。</b>',
      '<b>壬癸长河及沟涧，湾环曲折认刑伤。</b>',
      '<b>大树死时家长死，水上来穿近涧傍。</b>',
      '<b>贵神神祠并久殷，太阴锥磨共相连。</b>',
      '<b>前一腾蛇为窑灶，朱雀巢穴梁上悬。</b>',
      '<b>六合树木看生死，勾陈渠涧土堆滩。</b>',
      '<b>青龙神树并枪刃，天后池堂涧水泉。</b>',
      '<b>玄武鬼神并图画，太常酒食五谷言。</b>',
      '<b>白虎道路及刀剑，天空庙宇道僧仙。</b>',
      '<b>此是孙膑真甲子，天地移来掌内观。</b>',
      '<b>二、开篇四句：起课总纲</b>',
      '<b>"入式之法妙通玄，月将加时方上传"</b>',
      '<b>"妙"</b> ——<b>指取地分的巧妙</b>（从哪里开始定信息）',
      '<b>"玄"</b> ——<b>指后面的玄秘变化</b>',
      '<b>"月将加时方上传"</b> ——<b>讲将神怎么起</b>',
      '<b>"妙"为神奇，不可琢磨，其意是指取地分的巧妙——从哪里开始定信息。地分不妙，就没有后面的玄秘。</b>',
      '<b>深刻指出了金口诀取地分的重要性，而没有强调必须是过节还是过气选将。</b>',
      '<b>方为地分，为开端，所以先起地分是事情的原委，是开端部分，是复合事情发展规律的起课方法。</b>',
      '<b>"更看何神同何位，日干须用五子元"</b>',
      '<b>"更看何神同何位"</b> ——<b>看贵神、将神落在什么位置</b>',
      '<b>"日干须用五子元"</b> ——<b>起人元、神干用五子元遁</b>',
      '<b>"克者为无从旺断，五行之内细推元"</b>',
      '<b>"克者为无从旺断"</b> ——<b>找不到克的时候，就从"旺"来断</b>',
      '<b>"五行之内细推元"</b> ——<b>在五行之间细致推演</b>',
      '<b>"更将神将详吉凶，方察来人见的端"</b>',
      '<b>"更将神将详吉凶"</b> ——<b>细看神将的吉凶</b>',
      '<b>"方察来人见的端"</b> ——<b>才能看出求测者的真实情况</b>',
      '<b>三、大象部分：八个基本判断</b>',
      '<b>3.1 二木为爻求难得</b>',
      '<b>含义</b>：<b>课内见两个木，求事难成。</b>',
      '<b>为什么？</b>',
      '<b>因为木多必会枝条漫延，纠缠不清。求事难，是因为纠缠。</b>',
      '<b>成立条件与例外</b>：',
      '<b>二木为爻求难得——成立条件与两个例外。</b>',
      '<b>例外一：木火通明</b>',
      '<b>如果有火通关，则会成"木火通明"之象。</b>',
      '<b>但"木火通明"只认寅午</b>：',
      '<b>木火通明一般只指寅木与午火</b>（半合火局，主名望）。',
      '<b>寅见巳有刑，卯见巳"纯阴不生，只是冒烟怄气"，卯见午有破意，皆无木火通明之意。</b>',
      '<b>例外二：二木逢生合</b>',
      '<b>二木逢生合也可能成，但遇克、刑、冲则诸事难成。</b>',
      '<b>位置</b>：',
      '<b>整个课分四位，无论在哪两位都有此意——是"棍子放到哪里也能打人"。</b>',
      '<b>但木的位置不同，所代表"难"的阶段不同。</b>',
      '<b>3.2 三木、四木</b>',
      '<b>三木更是难上加难，还主会有官事缠身。</b>',
      '<b>课中见四木则家贫如洗。四木争张房舍新，徒有四壁家中贫。</b>',
      '<b>三木的其他断语</b>：',
      '<b>三木主兄弟不睦</b>',
      '<b>可能重婚</b>',
      '<b>主伤父</b>',
      '<b>更难立嗣</b>',
      '<b>3.3 二土比和迟晚看</b>',
      '<b>含义</b>：<b>课内见两个土，事情迟缓。</b>',
      '<b>但有个讲究</b>：',
      '<b>二土比和迟晚看——土旺主慢，及土多断病、二土相冲。</b>',
      '<b>即</b>：<b>土主静、主慢</b> ——但<b>要分清是哪种土</b>：',
      '<b>辰戌相冲、丑未相冲</b> ——<b>主快</b>（冲则不静）',
      '<b>其他土组合</b> ——<b>才主迟缓</b>',
      '<b>3.4 二金刑克都无顺</b>',
      '<b>含义</b>：<b>课内见两个金，事情不顺。</b>',
      '<b>具体</b>：',
      '<b>金多主不义、不讲规矩乱人理</b>',
      '<b>金过旺主淫乱，特别指阴酉金，妇女不贞</b>',
      '<b>四金入课则六亲不认</b>',
      '<b>金木交战主是非口舌，破财伤灾</b>',
      '<b>但也有好的一面</b>：',
      '<b>金见水反成好事，主清高有才、金水相生儿女有情，断婚姻则吉。</b>',
      '<b>不能见木，见木主口舌伤手脚</b>——「尤其是卯木遇申，卯申木绝车马财，伤身破财」',
      '<b>见火更出凶灾，多主血光伤残、交通惊险</b>',
      '<b>3.5 二火为灾百事残</b>',
      '<b>含义</b>：<b>课内见两个火，主灾祸。</b>',
      '<b>"残"是什么意思？</b>',
      '<b>这个"残"是残缺、不完美、瑕疵、凋残。</b>',
      '<b>具体</b>：',
      '<b>见金则血光筋骨之灾</b>',
      '<b>见水则心神不定，主心脑血病</b>',
      '<b>巳见午火为天罗，有纠缠之象</b>',
      '<b>巳午相见也有女子第三者情况出现</b>',
      '<b>3.6 二水皆须为大吉</b>',
      '<b>含义</b>：<b>课内见两个水，主吉。</b>',
      '<b>为什么？</b>',
      '<b>水无形、见缝插针、顺流而下，水性之人处事圆滑无主张，喜欢拍马屁，爱占小便宜……所以应吉。</b>',
      '<b>但有个前提</b>：',
      '<b>水在风水中代表财，多多益善。但是水多不一定就是好事，水多则溢，需要有收敛他的物质。</b>',
      '<b>比如一课中全是水，往往就是财来财去、存不住的象。</b>',
      '<b>水又主隐私淫欲，很大一部分钱浇灌桃花了。</b>',
      '<b>还有条件</b>：',
      '<b>如果水死休克中，则不为吉，见火则不为吉。</b>',
      '<b>水如果有金来生为"活水"，为有根，可以生生不息，这是最好的。</b>',
      '<b>如果课内火旺而没有木，这种火也是不长久的，最喜欢的就是寅午木火通明。</b>',
      '<b>3.7 水来入火妇难安</b>',
      '<b>含义</b>：<b>水火相见，主妇女有病。</b>',
      '<b>具体</b>：',
      '<b>主妇科病、难产、流产</b>',
      '<b>还主烫伤、伤灾、心痛、血压病症</b>',
      '<b>3.8 金入木乡忧口舌</b>',
      '<b>含义</b>：<b>金克木，主口舌是非。</b>',
      '<b>金入木乡忧口舌——实际破坏力更重。</b>',
      '<b>即</b>：<b>不只是"口舌"，实际的破坏力可能更重</b>（破财伤灾）。',
      '<b>3.9 火临金位有迍邅</b>',
      '<b>含义</b>：<b>火克金，主困顿不顺。</b>',
      '<b>"迍邅"</b> 读 zhūn zhān，<b>意思是困顿、不顺利。</b>',
      '<b>火临金指求事困难；金临火发生变形，指原定计划会改变，指煎熬、灾难，求事难成。</b>',
      '<b>四、刑狱部分的详解</b>',
      '<b>4.1 木来入土为刑狱</b>',
      '<b>这是入式歌里最复杂的一句</b>。',
      '<b>基本含义</b>：<b>木克土，主刑狱之事。</b>',
      '<b>"木来入土为刑狱"，占官司遇此，易被拘禁（见辰加巳、戌加亥）。</b>',
      '<b>成立条件（五种固定组合）</b>：',
      '<b>是一下几种情况：</b>',
      '<b>癸/卯/辰/巳　辛/寅/戌/巳　丁/卯/辰/亥　己/寅/戌/亥　乙/卯/辰/巳</b>',
      '<b>课中都是辰土或戌土，地分都是巳或亥。</b>',
      '<b>即</b>：<b>人元为癸辛丁己乙，第二行为卯寅卯寅卯，第三行为辰戌辰戌辰，第四行为巳巳亥亥巳。</b>',
      '<b>五种组合分别对应</b>：',
      '| 人元 | 第二行 | 第三行 | 地分 |',
      '|---|---|---|---|',
      '| <b>癸</b> | <b>卯</b> | <b>辰</b> | <b>巳</b> |',
      '| <b>辛</b> | <b>寅</b> | <b>戌</b> | <b>巳</b> |',
      '| <b>丁</b> | <b>卯</b> | <b>辰</b> | <b>亥</b> |',
      '| <b>己</b> | <b>寅</b> | <b>戌</b> | <b>亥</b> |',
      '| <b>乙</b> | <b>卯</b> | <b>辰</b> | <b>巳</b> |',
      '<b>关键</b>：<b>巳亥为乞索、是非口舌、冤屈、惊恐之意。</b>',
      '<b>两种含义</b>：',
      '<b>木来入土为刑狱——两种含义与先决条件。</b>',
      '<b>含义一</b>：<b>辰土受卯木克，上临巳火</b>',
      '<b>含义二</b>：<b>戌土受木克，下临亥水</b>',
      '<b>其他情况</b>：',
      '<b>其余只主诉讼口舌。</b>',
      '<b>即</b>：<b>如果没有这五种固定组合，木克土只主诉讼口舌，不算刑狱。</b>',
      '<b>4.2 刑狱课的现实把握</b>',
      '<b>这条很实用</b>：',
      '<b>刑狱课的现实把握——大多"空惊恐一场"，最轻是拘留。</b>',
      '<b>即</b>：<b>断到刑狱课，不要直接说"要坐牢"</b> ——<b>实际上大多只是"虚惊一场"，最重也就是拘留。</b>',
      '<b>这与"木来入土为刑狱"的古法有关</b> ——<b>古人刑狱严酷，现代法制不同，所以断法要"现实化"。</b>',
      '<b>4.3 土行水上竞庄田</b>',
      '<b>含义</b>：<b>土克水，主争田产。</b>',
      '<b>土行水上竞庄田——借"竞争"之义。</b>',
      '<b>"竞"就是"竞争"</b> ——<b>争田庄、争地。</b>',
      '<b>五、内外上下部分</b>',
      '<b>5.1 上克下与下克上</b>',
      '<b>上克下兮从外入，下克上兮向外边。</b>',
      '<b>主克客兮来索物，客克主兮客空还。</b>',
      '<b>逐句</b>：',
      '<b>上克下</b> ——<b>祸从外入</b>',
      '<b>下克上</b> ——<b>事情往外去</b>',
      '<b>主克客</b> ——<b>来索物</b>（索要东西）',
      '<b>客克主</b> ——<b>客空还</b>（白跑一趟）',
      '<b>5.2 四位相生与刑克</b>',
      '<b>四位相生百事吉，内有刑克忧患缠。</b>',
      '<b>即</b>：<b>四位相生最好；如果有刑克，就有忧患。</b>',
      '<b>5.3 宅居部分</b>',
      '<b>上克下兮宅必下，下克上兮岭头庄。</b>',
      '<b>即</b>：<b>断宅居时，上克下主宅子地势低；下克上主地势高（岭头）。</b>',
      '---',
      '<b style="color:var(--c-gold)">第六节　断课的第一步：看格局</b>',
      '<b>一、次序</b>',
      '<b>断课有十步，格局是第四步</b>：',
      '<b>第四步——看课体格局（合局、分局、纯阴纯阳），连茹不算格局。</b>',
      '<b>第八步——四位各主其事与信息的互变性。</b>',
      '<b>二、格局的作用</b>',
      '<b>格局决定"事情的架构"</b>：',
      '<b>以格局看事体。</b>',
      '<b>"事体"就是"事情的性质"</b> ——',
      '<b>合局</b> ——<b>有人帮</b>',
      '<b>分局</b> ——<b>各干各的</b>',
      '<b>纯阴</b> ——<b>压抑、不明朗</b>',
      '<b>纯阳</b> ——<b>急、要快</b>',
      '<b>三、格局与应期的关系</b>',
      '<b>有一条重要的先后</b>：',
      '<b>断应期的第一步就是先按三汇、三合、三奇来断……</b>',
      '<b>第一步判断整个课的格局，是分局相生还是分局相克等格局。如果是分局相克，则求事艰难（断分离分散除外），这种情况下断成的应期就意义不大了。</b>',
      '<b>即</b>：<b>先看格局，格局不好，就不必谈应期了。</b>',
      '<b>反过来</b>：',
      '<b>起课之后先看格局，格局是"架构"，缺的一支可做应期。</b>',
      '<b>即</b>：<b>如果格局是三合局但缺一支</b> ——<b>缺的那一支就是应期。</b>',
      '<b>四、格局与事情的阶段</b>',
      '<b>格局还能看出"事情发生在哪个阶段"</b>：',
      '<b>事情发生不久的断法、合局看库与"去外地不久"。</b>',
      '<b>即</b>：',
      '<b>合局看"库"</b> ——<b>库是归宿，看库能知道"结果"</b>',
      '<b>"去外地不久"</b> ——<b>如果合局刚成，说明事情刚发生不久</b>',
      '<b>五、格局与聚散</b>',
      '<b>三合局断聚会。</b>',
      '<b>即</b>：<b>三合局成，主"聚会、聚集"。</b>',
      '<b>破局——逢冲必散、冲神最厉害、天干不能破局。</b>',
      '<b>三条要点</b>：',
      '<b>逢冲必散</b> ——<b>三合局被冲就散了</b>',
      '<b>冲神最厉害</b> ——<b>在所有的破坏因素里，"冲"的力量最直接</b>',
      '<b>天干不能破局</b> ——<b>天干是"象"，力量小，破不了地支的局</b>',
      '---',
      '<b style="color:var(--c-gold)">本章小结</b>',
      '<b>一、格局总论</b>',
      '<b>格局是课内四位形成的整体结构</b> ——常见的有合局/分局（×相生/相克）、纯阴纯阳、一类朝元。',
      '<b>以格局看事体</b> ——格局管的是"事情的性质"。',
      '<b>看格局就像看一个班级</b> ——合局是"文科班"（抱团），分局是"分帮派"。',
      '<b>格局是"架构"</b> ——它决定课能不能立得住。',
      '<b>二、合局与分局</b>',
      '<b>合局相生</b> ——合作一条心，力往一处使，利于合作。',
      '<b>合局相克</b> ——外来干扰内侵，我方有损，时机不利。',
      '<b>分局相生</b> ——二人不一条心，各有所求；<b>利于各自发展</b>。',
      '<b>分局相克</b> ——内有不合，各自分离，反目无情，<b>万事皆输</b>；利于分散事。',
      '<b>格局的吉凶要看所求之事</b> ——求合与求分，结果相反。',
      '<b>分局相克则求事艰难</b> ——这种情况下断应期意义不大（「强扭的瓜不甜」）。',
      '<b>三、三合局与三会局</b>',
      '<b>四种三合局</b>：寅午戌火局（财帛文书喜美之合）、亥卯未木局（交易婚姻和会之合）、申子辰水局（行移征战干蛊之合）、巳酉丑金局（阴阳淫滥轻薄之合）。',
      '<b>三合是"朋党关系"，最稳定。</b>',
      '<b>人元见丙/乙/壬/丁为局全</b>；<b>破局的条件</b>（火局见亥子、木局见申酉、水局见戌、金局见午）。',
      '<b>三合局的"头、中、库"</b> ——破局最好"拦腰斩断"（打它的"中"）。',
      '<b>水局不能用火破，须戌土冲开辰库。</b>',
      '<b>破局的快慢</b>：子破火快、酉破木快、<b>戌破水最快</b>、金局宜火克。',
      '<b>坏局的特殊规定</b>：<b>人元见水不算坏局，只有课内见子或亥才是坏局。</b>',
      '<b>三会与三合的区别</b> ——三会如邻居（力量大但不持久），三合如亲戚（长久性高）。',
      '<b>四、其他格局</b>',
      '<b>纯阴课</b> ——局限、压抑、不明朗；<b>纯阳课</b> ——急、要快。',
      '<b>纯阳不长，纯阴不生</b> ——两种极端都要往反方向走。',
      '<b>一类朝元课</b>（四位同一五行）——事体重叠、闭伏不动、淹滞阻隔；四木不顺、四火灾祸、四金官讼、四土迟延。',
      '<b>四位相生百事吉，四位相克万事凶</b> ——但要看"三个克上"还是"三个克下"。',
      '<b>格局不止四种，连茹不算格局。</b>',
      '<b>五、入式歌诀</b>',
      '<b>开篇四句是起课总纲</b> ——"入式之法妙通玄，月将加时方上传。更看何神同何位，日干须用五子元。"',
      '<b>"妙"指取地分的巧妙</b> ——地分不妙，就没有后面的玄秘。',
      '<b>八个基本判断</b>：二木为爻求难得、二土比和迟晚看、二金刑克都无顺、二火为灾百事残、二水皆须为大吉、水来入火妇难安、金入木乡忧口舌、火临金位有迍邅。',
      '<b>二木的例外</b> ——<b>木火通明只认寅午</b>（寅见巳有刑、卯见午有破）。',
      '<b>二土的讲究</b> ——辰戌冲、丑未冲主快；其他组合才主迟缓。',
      '<b>二水的条件</b> ——水多则溢（财存不住）；水死休克中不为吉；有金生为"活水"最好。',
      '<b>木来入土为刑狱</b>的五种固定组合，其余只主诉讼口舌。',
      '<b>刑狱课要现实把握</b> ——大多"空惊恐一场"，最轻是拘留。',
      '<b>上克下从外入，下克上向外边；主克客来索物，客克主客空还。</b>',
      '<b>四位相生百事吉，内有刑克忧患缠。</b>',
      '<b>六、格局在断课中的位置</b>',
      '<b>断课第四步看格局</b> ——连茹不算格局。',
      '<b>先看格局，再谈应期</b> ——格局不好，应期无意义。',
      '<b>格局缺的一支可做应期。</b>',
      '<b>合局看"库"能知结果</b>；<b>"去外地不久"</b>可从合局刚成推出。',
      '<b>三合局断聚会</b>；<b>破局三要点</b>（逢冲必散、冲神最厉害、天干不能破局）。',
      '---',
      '<b style="color:var(--c-gold)">心法</b>',
      '<b>格局是"大势"</b>',
      '<b>格局看的是"大势"，不是"细节"。</b>',
      '<b>就像看一场战争</b>：',
      '<b>格局</b> ——<b>双方的兵力部署、地形、士气</b>',
      '<b>五动三动</b> ——<b>某一次交锋的胜负</b>',
      '<b>大势已定，个别战役的胜利也改变不了结局。</b>',
      '<b>所以</b>：',
      '<b>如果是分局相克则求事艰难……这种情况下断成的应期就意义不大了。因为心没有往一处使，强扭的瓜不甜。</b>',
      '<b>"强扭的瓜不甜"</b> ——<b>这五个字把格局的重要性说透了。</b>',
      '<b>邻居与亲戚</b>',
      '<b>三会像邻居，三合像亲戚。</b>',
      '<b>这个区分很有生活智慧</b>：',
      '<b>邻居</b> ——<b>住得近，天天见面，有事喊一声就来；但一旦谁搬走了，关系就淡了</b>',
      '<b>亲戚</b> ——<b>平时不来往，但真有大事，还是亲戚靠得住</b>',
      '<b>所以</b>：',
      '<b>三会的力量"大而短"</b> ——<b>来得快，去得也快</b>',
      '<b>三合的力量"小而长"</b> ——<b>不显山露水，但持久</b>',
      '<b>断课时要分清</b>：<b>求"速成"的事看三会，求"长久"的事看三合。</b>',
      '<b>逢冲必散</b>',
      '<b>三合局最怕冲。</b>',
      '<b>这个道理在生活里也一样</b>：',
      '<b>几个朋友合伙做生意（三合）</b> ——<b>本来好好的，突然来了一个"搅局的"（冲），整个局面就散了。</b>',
      '<b>所以</b>：',
      '<b>合伙的事</b> ——<b>最怕"冲"</b>',
      '<b>稳定的关系</b> ——<b>最怕"外力介入"</b>',
      '<b>断到合局被冲，就要提醒"有外力破坏"。</b>',
      '<b>格局可以"缺一支"</b>',
      '<b>三合局缺一支，那一支就是"应期"。</b>',
      '<b>这个道理很妙</b>：',
      '<b>三合局是"完整"的状态</b> ——<b>缺了就不完整</b>。<b>所以缺的那一支，就是"补全"的时间点。</b>',
      '<b>就像打麻将三缺一</b> ——<b>等第四个人到齐了，才能开始。</b>',
      '<b>这个思路可以用在生活的很多地方</b>：<b>事情没成，往往是"缺了某一环"</b> ——<b>找到缺的那一环，就知道什么时候能成。</b>',
    ]},
    { t: '第九章　断课流程与应用', rows: [
      '<b style="color:var(--c-gold)">引言</b>',
      '<b>这一章讲什么</b>',
      '前面八章把断课的"零件"都讲齐了：',
      '<b>起课</b>（怎么把四柱变成四行）',
      '<b>四位</b>（每个位置代表什么）',
      '<b>用神旺衰</b>（谁强谁弱）',
      '<b>五动三动</b>（有什么动向）',
      '<b>神煞</b>（带了什么吉凶）',
      '<b>格局</b>（整体的架构）',
      '<b>这一章讲"怎么把这些零件装起来用"。</b>',
      '<b>换句话：拿到一个课，从哪下手？按什么顺序看？</b>',
      '<b>这是从"学知识"到"会断课"的关键一步。</b>',
      '<b>断课难在哪里</b>',
      '<b>断课的三关，一句话就能概括</b>：',
      '<b>断课最难的三关——从哪下手、怎么全面、怎么活变。</b>',
      '<b>从哪下手</b> ——拿到课，第一步看什么？',
      '<b>怎么全面</b> ——怎么不遗漏信息？',
      '<b>怎么活变</b> ——四位是活的，怎么根据问题调整？',
      '<b>这一章主要解决"从哪下手"和"怎么全面"。</b>',
      '<b>"怎么活变"要靠大量实践</b>，这一章会给出原则。',
      '---',
      '<b style="color:var(--c-gold)">第一节　断课总纲</b>',
      '<b>一、总纲歌诀</b>',
      '<b>这一首歌诀，是全书断课的"宪法"</b>：',
      '<b>凡占课，入式歌言其大象，五动爻观其大意，以格局看其事体，凭驿马、神煞定其吉凶，以空亡、月破、支干三合、六合验其成败，潜心推测，无不神妙。</b>',
      '<b>这首歌诀把断课的层次说得很清楚</b>：',
      '| 手段 | 作用 |',
      '|---|---|',
      '| <b>入式歌</b> | <b>言其大象</b> |',
      '| <b>五动爻</b> | <b>观其大意</b> |',
      '| <b>格局</b> | <b>看其事体</b> |',
      '| <b>驿马、神煞</b> | <b>定其吉凶</b> |',
      '| <b>空亡、月破、三合、六合</b> | <b>验其成败</b> |',
      '<b>逐句展开</b>：',
      '<b>入式歌诀言大意，就是指课题体现的大致意向；五动三动出意图；格局看事体性质；驿马为主要手段；神煞是吉凶的辅助；然后再具体根据干支间的特殊关系变化，与时令变化判断成败应期。</b>',
      '<b>注意"驿马为主要手段"</b> ——<b>驿马在神煞中的地位最高。</b>',
      '<b>还有一句同样要紧的话</b>：',
      '<b>凭驿马、神煞定其吉凶，空亡月破支干三合六合验其成败，足以说明神煞的重要性——常常能转凶为吉、转吉为凶的作用。</b>',
      '<b>二、断课十步</b>',
      '<b>把上面的层次细化，就是"断课十步"</b>：',
      '<b>1. 课体起出后首先判定课内五行旺衰。这是很关键的一步，关系到吉凶成败，是实力的体现，也是判断可行性的根本。</b>',
      '<b>2. 判断用神，分析用神的旺衰，判断用神在课内的状态。用神是一个课的中心点，代表所问事物的可行性。</b>',
      '<b>3. 观察三动、五动，初步判断课体大意。</b>',
      '<b>4. 看课体的格局是属于什么格局。比如纯阴、纯阳、合局、分局等情况。这也是断成败很重要的步骤。</b>',
      '<b>5. 看人元。人元代表一个课的运行趋势，需要掌握几个比较特殊的天干人元。</b>',
      '<b>6. 二神之间的关系，通过二神之间的生化关系，基本判定事物的吉凶。这是断课的重中之重，也是信息最集中的位置所在，二神的吉凶对整个课起到百分之七十影响。</b>',
      '<b>7. 课内干支所临神煞。消息妙论言"凭驿马神煞定其吉凶"，足以说明神煞的重要性。</b>',
      '<b>8. 逐个分析课内干支相互关系，详细判断成败原因，适当化解，趋吉避凶。</b>',
      '<b>9. 结合四柱判断应期，参照四柱决定成败。四柱为课的外环境，对课内干支的时期成败起到甄别裁定作用。</b>',
      '<b>10. 慎下断语。</b>',
      '<b>这十步是断课的标准流程</b>。',
      '<b>三、断课六步（更精简的版本）</b>',
      '<b>还有一个"六步版"</b>：',
      '<b>1. 目前处于什么情况。</b>',
      '<b>2. 将来如何。</b>',
      '<b>3. 以前是什么情况。</b>',
      '<b>4. 主要针对哪方面求测。</b>',
      '<b>5. 何时解决，也就是应期。</b>',
      '<b>6. 怎么解决，运筹化解方法。</b>',
      '<b>这六步是"回答求测者的问题"的顺序</b>：',
      '<b>先看用神是什么地支，凶还是吉，旺还是休死空，带什么神煞，二神是什么状态，整个课的格局是什么</b>',
      '<b>分析完整个课体后，看将来如何发展——凶的能否变吉，将来何时能应吉</b>',
      '<b>以前的状态是倒推分析，按年月日时推算，看哪年对课内起好坏的作用</b>',
      '<b>有针对性的分析具体所问之事——比如问工作多参考贵神是什么状态，求财看将神是什么状态</b>',
      '<b>找适合运作的时间，大多以干合五合、奇合为主，地支三合六合三会为主，远断年月，近断日时</b>',
      '<b>发现不利因素怎么去化解运筹</b>',
      '<b>四、解课六步（看课的顺序）</b>',
      '<b>还有一个"看课顺序"的版本</b>：',
      '<b>1. 界定求测范围</b>',
      '<b>2. 参看用神</b>',
      '<b>3. 参看五动三动</b>',
      '<b>4. 对照入式歌诀</b>',
      '<b>5. 五行之内细推元</b>',
      '<b>6. 推断应期</b>',
      '<b>这是"从课本身出发"的顺序</b>：',
      '<b>先定范围</b> → <b>再找中心</b> → <b>再看动向</b> → <b>再对歌诀</b> → <b>再细推</b> → <b>最后定应期</b>',
      '<b>五、三个版本的关系</b>',
      '<b>三个版本看似不同，其实是一回事</b>：',
      '| 版本 | 视角 | 用途 |',
      '|---|---|---|',
      '| <b>十步</b> | <b>操作细节</b> | 断课时一步步走 |',
      '| <b>六步</b> | <b>回答顺序</b> | 组织断语时的顺序 |',
      '| <b>解课六步</b> | <b>看课顺序</b> | 分析课体的顺序 |',
      '<b>初学者建议按"十步"走</b> ——<b>因为它最细，不容易漏。</b>',
      '---',
      '<b>六、完整流程示范：一步不落地走完十步</b>',
      '<b>流程光记住没有用，得看着它走一遍。下面用一个真实的课，把十步从头到尾走一遍。</b>',
      '<b>求测背景</b>：一位女士替丈夫问工作——"看看我老公的工作怎么样？"',
      '<b>起课</b>：二○一六年<b>农历</b>三月十六日申时。<b>（课式依当时出课的记录，月将按当时所用取将法为酉。）</b>',
      '<code>`</code>',
      '四柱：丙申年　壬辰月　甲戌日　壬申时',
      '月将：酉　日空：申、酉　四大空亡：无',
      '人元：壬　　水 + 相　　天德、月德',
      '贵神：壬申（白虎）　金 + 旺　　天德、月德、驿马、截路',
      '将神：癸酉（从魁）用　金 - 旺　　丧车',
      '地分：申　　金 + 旺　　驿马、截路',
      '<code>`</code>',
      '<b>第一步：判旺衰</b>',
      '<b>先看课内的五行旺衰，这是断成败的根本。</b>',
      '四位里三位是金——<b>贵神申金、将神酉金、地分申金</b>，全是<b>旺</b>；一位是水——<b>人元壬水</b>，处于<b>相</b>。',
      '<b>金旺水相、金水相生，课内四位之间没有一点克战。</b> 第一眼就能定调：<b>这是一个"顺"的课，没有硬伤</b>。',
      '<b>第二步：判用神</b>',
      '<b>用神是癸酉，在将神位，金旺。</b>',
      '<b>但有一个极其关键的细节</b>：<b>日空是申、酉</b> —— 而<b>贵神申、将神酉、地分申，三个全在空亡里</b>。',
      '<b>三位逢空，只有人元壬水不空。</b> 这一步一出来，整个课的性质就清楚了：',
      '<b>机会是有的、方向是有的，但"落不到实处"</b> —— 逢空就主"暂时不能落地""说了不算"。',
      '<b>用神酉金旺而逢空</b>，是"力量足、但发挥不出来"。',
      '<b>第三步：看三动五动</b>',
      '<b>金生水</b>：贵神申金、将神酉金、地分申金，<b>三个金一起生人元壬水</b>。',
      '<b>地分申金生人元壬水</b> → 这是<b>父母动</b>（地分生人元）。',
      '<b>父母动主"下面往上供养"</b> —— 有来源、有靠山、有人给。三个金一起来生，<b>这份"给"的量很大</b>。',
      '<b>但方向是"往外、往上走"的</b>：金在水下，一路往上生。<b>往上生就是往外动</b> —— 这一条直接指向"<b>想动</b>"。',
      '<b>第四步：看格局</b>',
      '<b>月建是辰</b>。辰与课内构成了两组关系：',
      '<b>辰与申，是申子辰水局的半合</b> —— <b>缺了旺神子，属拱合</b> —— <b>机会有聚拢的趋向</b>，说明<b>这个月的机会多</b>。',
      '<b>辰与酉，是六合</b> —— <b>六合主和合、主谈得拢</b>，说明<b>这个月的路子是通的</b>。',
      '<b>两组关系都通，说明"路子是通的"。</b>',
      '<b>再看阴阳配比</b>：课内三个金，<b>两个申是阳金，一个酉是阴金</b>。<b>同类里掺了一个不同性质的</b> —— 这一层后面断"人员"时要用到。',
      '<b>第五步：看人元</b>',
      '<b>人元壬水，带天德、月德。</b>',
      '<b>天德月德是解厄之神</b>，落在人元（首脑）上，说明<b>这件事的大方向是有贵人护着的</b>，不会出大岔子。',
      '<b>人元壬水又被三金环生</b> —— <b>首脑被众力托着往上走</b>，这就是"动"的动力来源。',
      '<b>第六步：看二神（重中之重）</b>',
      '<b>二神是贵神壬申金、将神癸酉金 —— 两位同为金，同类。</b>',
      '<b>同类之间不生不克</b>，所以<b>二神之间是"平"的</b>：没有内耗，也没有互相成就。',
      '<b>二神平，意味着这一课的主要信息不在"二神相争"上，而在"整体方向"上</b> —— 也就是"金水相生、一路往上升"这个大局。',
      '<b>二神同类还有一个含义</b>：<b>贵神与将神是"一条心"的</b>。断工作，就是<b>上下一致、没有内斗</b>。',
      '<b>第七步：看神煞</b>',
      '<b>驿马</b>：<b>贵神申带驿马，地分申也带驿马</b> —— <b>两个驿马</b>。驿马主移动，<b>两个驿马就是"动得很明确"</b>。这直接坐实了"想动工作"。',
      '<b>天德、月德</b>：人元与贵神都带，<b>主有贵人</b>。',
      '<b>截路（截路空亡）</b>：<b>贵神与地分都带</b>。截路主<b>阻滞、走不顺畅</b> —— 这正好和"逢空"呼应：<b>想动，但一时半会儿走不利索</b>。',
      '<b>丧车</b>：将神酉带丧车。丧车主<b>忧患、不吉之事</b>，落在将神上，是<b>需要留意的暗点</b>。',
      '<b>第八步：细推元</b>',
      '<b>细推元这一步，就是把前面看到的零散信息，一条条落成能说出口的断语。</b> 十条断语，条条都要在课里找得出出处。',
      '<b>第一条：有想动工作的想法。</b>',
      '<b>依据</b>：<b>申金带驿马，而且一路往上升</b>（生人元壬水）—— 往上、往外，就是"想动"。<b>方向明确，没有别的解释</b>。',
      '<b>第二条：一起动的人最少有三个，其中可能有女的。</b>',
      '<b>依据</b>：<b>三金生一水</b> —— 凡"多对一"都主<b>不是一个，是多个</b>；再看这三金的性质：<b>两个申是阳金，一个酉是阴金</b> —— <b>同类里掺了一个不同性质的</b>，所以其中可能有女性。',
      '<b>第三条：这份工作流动性强，而且不止一项。</b>',
      '<b>依据</b>：还是<b>三金生一水</b>——<b>"三生一"首先就说明它不是单一的事</b>；再加上<b>水本身主流动</b>，课内又带<b>两个驿马</b>，流动的性质就很强了。',
      '<b>第四条：这个月工作与求财的机会都多，但他自己做不了主。</b>',
      '<b>依据</b>：<b>月建辰土与课内申金合成申子辰水局</b> —— 成局就代表<b>机会成堆</b>；<b>辰与酉六合</b>，主<b>求财的机会</b>也在。<b>为什么做不了主？</b> 一路是<b>辰生金、金生人元</b>，说明<b>一切听上面的安排</b>；更要紧的是<b>申金逢空</b> —— <b>空就是"你说了不算"，只能让你上哪上哪</b>。',
      '<b>第五条：目前这份工作其实不累，就是杂事多。</b>',
      '<b>依据</b>：<b>申金逢空、课内又无克害它的力量</b> —— 空主清闲、主使不上劲，所以是<b>事务繁杂但没有压力</b>。',
      '<b>第六条：他这个人身材魁梧、做事利落、皮肤白净、嗓门大。</b>',
      '<b>依据</b>：<b>金主白、主声</b>，课内三金当旺，<b>相貌性情就从金上取</b>。',
      '<b>第七条：做的是与技术建造有关的行当，为人仗义，但理财观念不强。</b>',
      '<b>依据</b>：<b>贵神是壬申、带白虎</b> —— <b>白虎主技术、主建造</b>；再加上<b>壬申、癸酉在纳音上是剑锋金，主一技之长</b>；<b>金主义</b>，所以为人仗义；<b>金旺而水泄</b>，钱财上就不太算计。',
      '<b>第八条：朋友缘很好，走到哪里都有朋友；酒量大，贪玩。</b>',
      '<b>依据</b>：<b>朋友多</b>看<b>金多</b>——而且<b>日建戌与课内的申、酉正好凑成申酉戌三会金局</b>，三会的力量比三合还大，所以人缘极广；<b>酒量大</b>看<b>金空</b>（空则能容）；<b>贪玩</b>看<b>水局润下</b>（水性向下、随和好玩）。',
      '<b>还有一层要留意</b>：<b>酉金主嘴、主说话，而它被日建的戌土相害</b> —— 害主<b>为难、有苦难言</b>，所以这个人<b>在外面是"没有说话权"的那一个</b>。这一层和"申金逢空、做不了主"正好互相印证。',
      '<b>第九步：结合四柱定应期</b>',
      '<b>四柱是外环境，应期和事情的轻重都从四柱上找。</b>',
      '<b>先看"机会"。</b>',
      '<b>月建辰土是这一课的"指挥者"</b>：<b>辰生金、金生人元</b>，一路顺生；<b>辰又与申合成水局</b> —— 所以断<b>这个月机会最多</b>。<b>辰与酉又六合</b>，求财的门路也在其中。',
      '<b>再看"快"。为什么断"很快"？</b> 这里有五层依据：',
      '<b>太岁来填实旬空</b> —— 日空在申、酉，而<b>太岁正是申</b> —— <b>旬空得岁君填实，事情就落得到实处</b>',
      '<b>本身带驿马</b> —— 驿马主行动、主迅速',
      '<b>临的还是日上的驿马</b> —— 日柱是甲戌，<b>寅午戌马在申</b>，申金正是日马',
      '<b>它必须与月建合成水局</b> —— 合局即成，成则速',
      '<b>四条凑在一起，才敢断"很快"。</b>',
      '<b>最后看"过去以后累"。为什么累？</b>',
      '<b>因为他是"排头兵"</b>：<b>申子辰水局里，第一位就是申金</b> —— <b>打头阵、排在前面跑的那一个</b>。到了新单位，是<b>服务于月建辰土</b>的，<b>那就不是你说了算，你就得多跑</b>。<b>再加上水局本身是"征战之局"</b>，动起来就不会轻省。',
      '<b>所以"快"和"累"是一回事的两面</b>：<b>动得越快、跑得越前，就越累。</b>',
      '<b>第十步：慎下断语</b>',
      '<b>十步走完，信息已经很足了。但下断语要讲分寸。</b>',
      '<b>第一，分清楚哪一句能说死，哪一句要留口。</b>',
      '<b>"有想动的念头"可以说死</b> —— 两个驿马、一路往外生，这是硬象，赖不掉。',
      '<b>"会动"和"动得成"要分开说</b> —— 三位逢空，<b>有想法不等于马上落地</b>，尤其"申金空"这一层，说的就是<b>他自己做不了主</b>。',
      '<b>"过去以后累"要说得让人能接受</b> —— 这不是凶，是<b>位置上要跑动</b>，说清楚缘由，对方反而信服。',
      '<b>第二，别把好话说满，也别把坏话说绝。</b>',
      '<b>课里明明有好的地方</b>（天德月德、辰酉六合、一路顺生），<b>也有要紧的暗点</b>（三位逢空、丧车、截路）。<b>该说的都说，但不替人做决定</b>。',
      '<b>最后的断语是这样的</b>：',
      '<b>你老公现在有想动工作的念头，心里不踏实。这个月工作机会和求财机会都不少，但他自己做不了主 —— 上面让去哪就去哪。真要动，不会是他一个人，最少还有三个人一起，其中可能有女的。这份工作流动性强，而且不止一项；目前这份其实不累，就是杂事多。他这个人长得魁梧、皮肤白净、嗓门大，做事利落，讲义气，朋友多，酒量也好，就是不太会理财。接下来大概率是去一个规模更大的单位，离家会远一些，去了以后会忙起来 —— 因为他是那个打头阵、要多跑的。</b>',
      '<b>这十条断语，每一条都能在课里找到出处</b>：',
      '| 断语 | 出处 |',
      '|---|---|',
      '| 想动 | 申金带驿马、一路生外 |',
      '| 最少三人、有女性 | 三金生一水（多对一）、两申阳一酉阴 |',
      '| 工作不止一项、流动性强 | 三生一、水主流动、两个驿马 |',
      '| 这月机会多 | 辰与申合水局、辰酉六合 |',
      '| 做不了主 | 辰生金金生人元（听安排）、申金逢空 |',
      '| 目前不累 | 申金空、无克害 |',
      '| 相貌性情 | 金主白、主声、主义 |',
      '| 技术建造 | 壬申白虎（技术建造）、剑锋金（一技之长） |',
      '| 朋友多、酒量大、贪玩 | 金多＋申酉戌三会金局、金空、水局润下 |',
      '| 快与累 | 出空＋填实＋驿马＋日马＋合局；排头兵、征战之局 |',
      '<b>这就是流程的意义</b>：<b>它不替你断课，它保证你不漏。</b> 十步走一遍，该看的都看到了，断语自然就出来了，而且<b>每句话都站得住、指得出出处</b>。',
      '<b>完整流程示范（二）：再换一个课走一遍</b>',
      '<b>流程走一遍不够，再换一个课走第二遍。</b>',
      '<code>`</code>',
      '干支：乙未年　乙酉月　丙辰日　乙未时',
      '月将：辰　日空：子、丑　四大空亡：金',
      '人元：戊　　土 + 旺',
      '贵神：己亥（天后）　水 - 死　天德合、飞廉',
      '将神：乙未（小吉）用　土 - 旺　月德合',
      '地分：戌　　土 + 旺',
      '<code>`</code>',
      '<b>求测</b>：男，已婚，以戌为地分起课；问<b>财运、婚姻、工作</b>。',
      '<b>第一步，圈定范围。</b>',
      '<b>财运、婚姻、工作</b> —— 范围先定住，断课才有的放矢。',
      '<b>第二步，看用神。</b>',
      '<b>用神是乙未，在将神位，旺而不逢空</b> —— <b>求事有力</b>。',
      '<b>这里有一条要点</b>：<b>"干为外、支为内"这层关系必须清楚</b> —— 而<b>自身干支的作用关系只代表一种象意，不是实际的作用关系</b>。',
      '<b>看用神这一组</b>：<b>乙木克未土</b> —— 主<b>"外克内、自我压力"</b>；而<b>将神为财星</b>，<b>又主自我花费、自身破财</b> —— <b>用神的特点就分析出来了</b>。',
      '<b>定用神还有一个用法</b>：<b>用神在将神，一般与财、感情类有关</b> ✓ 正合所问。',
      '<b>第三步，看三动五动。</b>',
      '<b>财动</b> —— <b>将神乙未土克贵神己亥水</b>（土克水）—— 这是<b>财动</b>，而且<b>旺</b> → <b>利于求财</b> ✓',
      '<b>兄弟动</b> —— <b>人元戊土与地分戌土同为土</b> —— 这是<b>兄弟动</b>，<b>主小凶</b> → <b>求事会有波折</b>。',
      '<b>第四步，参照入式歌诀。</b>',
      '歌诀说「<b>二土比和迟晚看</b>」「<b>土行水上竞庄园</b>」—— 而<b>课内出现了三土</b>（人元、将神、地分）—— 更主<b>求事拖拉、有竞争、迟缓</b>。',
      '<b>第五步，五行之内细推元。</b>',
      '<b>先关注二神</b> —— <b>二神的关系是财动，说明利于求财、求财必得</b>；<b>课内没有空亡</b> —— <b>一切都是实际作用</b>。',
      '<b>将神为用，恰在财星位</b> —— <b>所求之事与求财或感情有关</b>；<b>将神旺，说明本身有财</b>；<b>地分戌土也旺，主财力强</b>。',
      '<b>所以断"财运很旺、实力很强"</b> ✓',
      '<b>这里还有一层要分清</b>：<b>"乙未"这一组本身是自我相克</b> —— 主<b>"自我损财"</b>。',
      '<b>耗财、损财属于自身原因造成的</b> —— <b>是本意为之、或者自愿的</b>（比如花钱买东西，是自我消费，个人情愿的）；',
      '<b>而破财属于外来侵害、制约、压制一类造成的财物流失</b> —— <b>不受自我意愿控制</b>（比如被强制缴费）。',
      '<b>这一课是"自我相克"</b> —— 所以是<b>"自己愿意花的"</b>，不是被人拿走的。',
      '<b>把流程走完，断语就出来了</b>：',
      '<b>财运很旺、实力不弱</b>（用神旺、地分旺、二神财动）；<b>但三土并见、又带兄弟动</b>，主<b>"拖拉、有竞争、有波折"</b>，而且钱财上<b>"自己花得多"</b>。',
      '<b>婚姻、工作同理</b> —— <b>范围定了，就照这个次序一条条看。</b>',
      '<b>两个示范走下来，能看出一点</b>：',
      '<b>流程是死的，课是活的</b> —— 换一个课，十步还是那十步；变的只是每一步看到的东西。',
      '<b style="color:var(--c-gold)">第二节　第一步：界定求测范围</b>',
      '<b>一、为什么先定范围</b>',
      '<b>这是断课的第一条纪律</b>：',
      '<b>在断课前首先要圈定预测范围，做到有的放矢，不能盲目断课。</b>',
      '<b>有几种常见的错误</b>：',
      '<b>特别在一些金口诀交流群中，求测人刚把课发出来，不管人家问什么就按自己的思路断课——比如人家问感情，你上来就断人家环境情况，会出现费力不讨好的现象。</b>',
      '<b>但也不是绝对不能"兼断"</b>：',
      '<b>当然等主要问题解决后可以兼断其他情况。这样人家反而感激信服。</b>',
      '<b>二、圈定范围的意义</b>',
      '<b>为什么"圈定范围"这么重要？</b>',
      '<b>举例说明</b>：',
      '<b>比如在求官时，出现了子孙动，此二者风马牛不相及，故应不予取用。</b>',
      '<b>即</b>：<b>课里可能同时出现好几个"动"</b> ——<b>但只有与所问之事相关的才取用。</b>',
      '<b>最常见的错误就是这样</b>：',
      '<b>很多人断课时为了显示自己的本领，不问人家预测什么事，就先一通乱断，这也是风马牛不相及。</b>',
      '<b>必须先圈定范围再去断课——人家问工作你去断婚姻，说好听点这是一课多断，可是答非所问、白费力气口舌，岂不尴尬。</b>',
      '<b>三、范围的层次</b>',
      '<b>圈定范围有两个层次</b>：',
      '<b>第一层：确定了没有具体问题？</b>',
      '<b>有具体问题</b> ——比如"问我今年能不能升职"',
      '<b>没有具体问题</b> ——比如"看看我最近怎么样"',
      '<b>第二层：如果有具体问题，那是什么门类？</b>',
      '<b>求财</b> ——看将神',
      '<b>求官/工作</b> ——看贵神',
      '<b>婚姻</b> ——二神关系 + 桃花',
      '<b>断病</b> ——看四位对应人体 + 五行',
      '<b>范围定了，后面的分析就有了方向。</b>',
      '---',
      '<b style="color:var(--c-gold)">第三节　第二步到第四步：用神、动、格局</b>',
      '<b>一、第二步：参看用神</b>',
      '<b>1.1 用神在哪个位置</b>',
      '<b>首先参看用神是在将神还是贵神，因为用神只能落在将神或者贵神位置。</b>',
      '<b>普通情况下，贵神为用时求事大多与工作有关；将神为用时大多与财有关。</b>',
      '<b>但也有交叉</b>：',
      '<b>但也有求财时用神在贵神，这种情况有借助他人求财，与官方或正常工作有关，这个与四位所属图的定义有关，不是单纯的以财求财。</b>',
      '<b>比如做生意，将神为用问工作，大多与财有关；比如花钱求事为工作、为工作破财、以工作或外事得财等。</b>',
      '<b>这只是在普通情况而言没有绝对性，但必定与此象有关。</b>',
      '<b>1.2 看用神的四件事</b>',
      '<b>先看用神是什么干支、什么五行、什么特性，旺衰还是休死空，看一眼就要做到心里有数。</b>',
      '<b>如果是旺，说明事情有可行性；如果是死，可能事情会有阻力不顺；如果是空亡，则吉凶不定。</b>',
      '<b>一般情况下，用神旺相与课内，或临月建日建，力量较大，可行性较强。</b>',
      '<b>1.3 用神论的提醒</b>',
      '<b>用神只是事情的中心体，其他干支围绕他转，为他服务。</b>',
      '<b>因为只有核心然后才有力量。这种力量不只是来源于用神自己，其他干支也是对用神形成影响力的一股力量，也是必不可少的。</b>',
      '<b>批评</b>：',
      '<b>现在很多断课大多是围绕用神点来看的。这种用神论，只能观察判断片面的吉凶论断，以偏概全，常常答非所问、不能周全。</b>',
      '<b>二、第三步：参看五动三动</b>',
      '<b>歌诀中提到"五动爻观其大意"，强调了五动三动在金口诀中的重要性，是金口诀的断课先锋。</b>',
      '<b>五动三动是金口诀的杀手锏，象孙悟空的火眼金睛。课体一出，我们根据五动三动的出现，立即就能判断所问事情的性质与吉凶。这就是金口诀的速断法门。</b>',
      '<b>关于"高层不用五动三动"的说法</b>：',
      '<b>有人说金口诀学到高层是不用看五动三动的，实则不然。</b>',
      '<b>因为到了高层，我们已经熟悉到不用专门去找五动三动，就像我们已经会奔跑，而不再去注意怎么迈第一步。</b>',
      '<b>但习惯性的怎么迈第一步已经成了规律性的过程。</b>',
      '<b>所谓的高层是在五动三动后，继续细致分析精钢淬炼阶段。</b>',
      '<b>三、第四步：看格局</b>',
      '<b>格局看事体性质。</b>',
      '<b>常见格局</b>：',
      '<b>合局相生、合局相克</b>',
      '<b>分局相生、分局相克</b>',
      '<b>纯阴课、纯阳课</b>',
      '<b>三合局、三会局</b>',
      '<b>一类朝元课</b>',
      '<b>格局的用法</b>：',
      '<b>特殊的格局对事物发展成败起到很关键的作用，不可忽视。</b>',
      '<b>当然金口诀的格局也绝非这样的简单，还有其他的格局论断方法。</b>',
      '<b>注意一条</b>：',
      '<b>连茹不算格局。</b>',
      '---',
      '<b style="color:var(--c-gold)">第四节　第五步到第七步：人元、二神、神煞</b>',
      '<b>一、第五步：看人元</b>',
      '<b>1.1 人元代表趋势</b>',
      '<b>看人元。人元代表一个课的运行趋势，需要掌握几个比较特殊的天干人元。</b>',
      '<b>比如人元乙未曲折，庚代表不确定性，丙主乱，丁主惊等。</b>',
      '<b>十干在人元的基调</b>：',
      '| 人元 | 基调 |',
      '|---|---|',
      '| <b>甲</b> | 开始、希望、喜庆、正能量 |',
      '| <b>乙</b> | 曲折、费周折、好事多磨 |',
      '| <b>丙</b> | 光明与热量，但隐含"乱" |',
      '| <b>丁</b> | 惊恐之相、无所畏惧 |',
      '| <b>戊</b> | 压力、定型、房产与创业 |',
      '| <b>己</b> | 定型之后的坎坷、曲折与诉讼 |',
      '| <b>庚</b> | 不稳定、变化、变更 |',
      '| <b>辛</b> | 辛苦之象、法律约束、主外 |',
      '| <b>壬癸</b> | 「壬癸难行」、前途未卜、阴暗不明 |',
      '<b>1.2 人元的断法</b>',
      '<b>课体起出后，先观察人元情况就能初步判断问题属性。</b>',
      '<b>如果人元休死，等于事情开始阶段处于不利阶段。人元为首为头，人元休死处于消极，可行性不强；人元逢空则事情还没有落到实处，还不具备操作性。</b>',
      '<b>但这只是初步的判断</b> —— <b>人元是否真能生到课内、事情到底成不成，还要结合整个课体来看。</b>',
      '<b>断来意时看人元与将神</b>：',
      '<b>金口诀在断来人时常与人元与将神的关系来判断。</b>',
      '<b>为什么是将神与人元而不是其他？因为人元是一件事情的开始部分，是有原则性的东西，是最高层次的灵魂体；而将神在金口诀四位所属图中代表其本人。</b>',
      '<b>凡求事必定是人与思维的结合而成，有想法才有行动。两者的结合作用，体现所问事情的真相。</b>',
      '<b>1.3 人元的四种基本关系</b>',
      '<b>总之人元是主外主上的信息，也是最高位置。</b>',
      '<b>上克下，祸从外起；下克上，为己出外。</b>',
      '<b>自下依次克上，为有能力之人、外出之人。</b>',
      '<b>上生下，外人求己；下生上，己求外人。</b>',
      '<b>二、第六步：看二神关系（重中之重）</b>',
      '<b>2.1 二神占七成</b>',
      '<b>二神之间的关系，通过二神之间的生化关系，基本判定事物的吉凶。这是断课的重中之重，也是信息最集中的位置所在。</b>',
      '<b>二神的吉凶对整个课起到百分之七十影响。</b>',
      '<b>歌诀</b>：',
      '<b>以贵神为主，主尊神；以月将为相。以十分灾福，七分在此二神的分辨。</b>',
      '<b>俗语</b>：',
      '<b>二神占整个课的百分之七十——兵熊熊一个，将熊熊一窝。</b>',
      '<b>2.2 二神是什么</b>',
      '<b>二神是整个事体的具体展示位置，关乎成败吉凶的关键，就像是谈判桌，又是鉴定机构。</b>',
      '<b>是事物集中体现部分。比如来谈判的是仇家，是与自己格格不入的人，谈判就难顺利进行。</b>',
      '<b>二神是双方的代表，起决定作用的。二神相克冲，首先判断事情有阻，但是再配合其他干支的关系，看是否有缓和余地。</b>',
      '<b>2.3 二神的断法</b>',
      '<b>二神相生</b> ——<b>事情顺</b>',
      '<b>二神相克</b> ——<b>事情有阻</b>',
      '<b>实战举例</b>：',
      '<b>如果二神地支冲克害等，但二神干合，还不至于离婚。至于暂合的程度要参考五合而定。</b>',
      '<b>这个时候就要再注意二神的天干是否相合……这就是因为二神还有干合象关联。干为外，在外界看来夫妻关系还很完整。</b>',
      '<b>地支关系是主内的，天干是主外的，天干是外表、地支是内里是内心思想。俗话说"打断骨头连着筋"，天干就是筋。</b>',
      '<b>三、第七步：看神煞</b>',
      '<b>课内干支所临神煞。消息妙论言"凭驿马神煞定其吉凶"，空亡月破、支干三合六合验其成败，足以说明神煞的重要性。常常能转凶为吉，转吉为凶的作用。</b>',
      '<b>三个要点</b>：',
      '<b>驿马当先</b> ——驿马最先看',
      '<b>月破力大</b> ——月破的力量最大',
      '<b>凶快吉慢</b> ——凶煞应验快，吉神应验慢',
      '---',
      '<b style="color:var(--c-gold)">第五节　第八步：五行之内细推元</b>',
      '<b>一、什么是"细推元"</b>',
      '<b>这是断课最见功力的地方</b>。',
      '<b>逐个分析课内干支相互关系，详细判断成败原因，适当化解，趋吉避凶。</b>',
      '<b>"五行之内细推元"的含义</b>：',
      '<b>五动三动是粗枝末叶，能观其形断其意。再进一步深入就是细节与趋势——那就是"五行之内细推元"阶段。</b>',
      '<b>即</b>：',
      '<b>五动三动</b> ——<b>粗断</b>（大意、方向）',
      '<b>五行细推</b> ——<b>细断</b>（细节、趋势）',
      '<b>二、细推的方法</b>',
      '<b>2.1 逐个干支比较</b>',
      '<b>第八步——五行之内细推元：逐个干支比较，课内无一处无用。</b>',
      '<b>即</b>：<b>四位之间两两比较，看每一组关系。</b>',
      '<b>共六组</b>（详见第三章）：',
      '人元与贵神',
      '人元与将神',
      '人元与地分',
      '贵神与将神',
      '贵神与地分',
      '将神与地分',
      '<b>2.2 课内无一处无用</b>',
      '<b>课内的任何信息都是你自身的信息，哪个地支出问题，就代表哪里出了问题。</b>',
      '<b>不能只是简单的分析用神怎么样。</b>',
      '<b>这个道理，用一个比喻就清楚了</b>：',
      '<b>为什么有的金口诀断课简单枯燥？就是很大成分忽略了用神外的部分，因为其他的干支于己无关高高挂起。</b>',
      '<b>比如说我们去谈判要用到嘴、用到手，难道其他的身体部分留家里吗？你的脚受伤了，其他部位出问题了，你照样没法去工作。</b>',
      '<b>所以他们是一个整体，但又各分工不同。</b>',
      '<b>2.3 找"最突出的那一点"</b>',
      '<b>面对复杂的课体，怎么下手？</b>',
      '<b>断课心法——复杂关系取"最突出的那一点"。</b>',
      '<b>具体做法</b>：',
      '<b>面对多种关系并存</b> ——<b>先看绝，再看刑，再看冲、克、害。</b>',
      '<b>因为</b>：',
      '<b>信息像一个不规则转动体——抓取最突出的那一点。</b>',
      '<b>2.4 复合关系分两层看</b>',
      '<b>断课心法——复合关系分两层看，多动并见先看大局。</b>',
      '<b>即</b>：',
      '<b>第一层</b> ——<b>看大局</b>（格局、二神）',
      '<b>第二层</b> ——<b>看细节</b>（各处的生克）',
      '<b>2.5 先直读，再论刑冲克害</b>',
      '<b>断课方法——先直读，再论刑冲克害。</b>',
      '<b>"直读"是什么？</b>',
      '<b>就是</b>：<b>看到某个干支、某个组合，直接读出它的象</b>（比如看到巳火，直接想到"是非、猜疑、第三者"）。',
      '<b>为什么先直读？</b>',
      '<b>因为</b>：',
      '<b>断课次序——先直读，再入课内论五行生克。</b>',
      '<b>直读最直接、最快</b> ——<b>先把直观的信息读出来，再深入分析。</b>',
      '<b>三、断课的语言艺术</b>',
      '<b>3.1 下断语的分寸</b>',
      '<b>下断语的语言艺术。</b>',
      '<b>有几个原则</b>：',
      '<b>原则一：涉及隐私要委婉</b>',
      '<b>但是需要注意一点，如果是桃花见的财动就要注意了，其言不表自明，言语表达也需要艺术。</b>',
      '<b>原则二：不断生死</b>',
      '<b>占病含不断生死的规矩。</b>',
      '<b>即</b>：<b>断病可以断病情轻重，但不能断生死。</b>',
      '<b>原则三：劝合不劝离</b>',
      '<b>劝合不劝离，大问题你自己拿主意，利害关系都和你讲了。</b>',
      '<b>3.2 断语的可信度</b>',
      '<b>这里有一条要紧的提醒</b>：',
      '<b>论相貌、口才类断语的把握度——必须"合到用神上"才能断。</b>',
      '<b>即</b>：<b>断相貌、口才这类"软"信息，必须有课内的明确依据</b> ——<b>不能凭感觉说。</b>',
      '---',
      '<b style="color:var(--c-gold)">第六节　第九步：结合四柱</b>',
      '<b>一、四柱是"外环境"</b>',
      '<b>结合四柱判断应期，参照四柱决定成败。四柱为课的外环境，对课内干支的时期成败起到甄别裁定作用。</b>',
      '<b>四柱的作用总结</b>：',
      '<b>四柱不单独起作用，只影响课内关系，决成败，助吉凶能量。吉者更吉，凶者更凶。</b>',
      '<b>二、四柱的分量级</b>',
      '<b>太岁等于中央机构，月建是地区机构，日建为地方机构，时辰则等于小区服务。</b>',
      '<b>用法</b>：',
      '<b>断一年以上的事</b> ——看<b>太岁</b>',
      '<b>断一月内的事</b> ——看<b>月建</b>',
      '<b>断一天内的事</b> ——看<b>日建</b>',
      '<b>断当下几小时的事</b> ——看<b>时辰</b>',
      '<b>三、四柱与课内的比较</b>',
      '<b>3.1 断课新法：逐个比较</b>',
      '<b>断课新法——课内三支逐个与四柱比较。</b>',
      '<b>即</b>：<b>把课内的地支逐个与太岁、月建、日建对照</b>，看每一处与四柱是什么关系（合、冲、刑、害、破）。',
      '<b>这个方法特别适合断流年流月</b>。',
      '<b>3.2 属相本命入断法</b>',
      '<b>属相本命入断法——乙巳属蛇与巳酉丑合金局。</b>',
      '<b>即</b>：<b>求测者的属相（本命）也可以入课参断</b> ——<b>比如属蛇（巳），如果课内有巳酉丑，就和本命合成金局。</b>',
      '<b>四、应期与四柱</b>',
      '<b>只有在断课过程中根据月季时令决定他的可操作性。</b>',
      '<b>如果恰逢春季冬季，木得助，事情有可行性；如果逢秋季金旺，虽然课内关系很好，可是时令不合适。</b>',
      '<b>关键</b>：',
      '<b>在断课时，无论课内关系再好，月建日令起成败的作用。</b>',
      '<b>比如课内寅午戌火局已定，但恰逢冬令，这就是破局不得令。</b>',
      '---',
      '<b style="color:var(--c-gold)">第七节　第十步：慎下断语</b>',
      '<b>一、为什么"慎"</b>',
      '<b>十条里最后一条是"慎下断语"</b> ——<b>这不是客套，是经验。</b>',
      '<b>原因有三</b>：',
      '<b>原因一：课内信息是多层的</b>',
      '<b>课内四位各主其事，信息还有互变性。</b>',
      '<b>即</b>：<b>同一个干支，可能同时代表好几件事</b> ——<b>不能只取一个。</b>',
      '<b>原因二：应期有变数</b>',
      '<b>任何一件事都在动，任何一个课也不是死的</b> —— <b>同一件事，早一天问、晚一天问，应期就可能不一样</b> —— <b>所以应期是最难说准的一环。</b>',
      '<b>原因三：断语会影响人</b>',
      '<b>断课的话会影响求测者的决策</b> ——<b>说错了可能造成后果。</b>',
      '<b>二、"慎"的具体做法</b>',
      '<b>2.1 留有余地</b>',
      '<b>不要把话说死</b> ——<b>比如用"可能""大概""应该"来留余地。</b>',
      '<b>但也不能含糊</b> ——<b>关键的地方要明确。</b>',
      '<b>分寸是</b>：<b>大方向明确，细节留余地。</b>',
      '<b>2.2 给出化解方案</b>',
      '<b>断课不只是"说凶吉"，还要"给办法"</b>：',
      '<b>发现不利因素怎么去化解运筹。</b>',
      '<b>化解的正法是"通关"</b>：',
      '<b>通关</b> —— <b>在相争的两方之间引入一个能"通"的五行</b>，让对抗变成流转 —— <b>这是正法，也是首选</b>',
      '<b>安抚</b> —— 顺着它、不激化，属于<b>缓兵之计</b>，能拖不能解',
      '<b>克制</b> —— <b>不得已才用，而且必须慎用</b> —— <b>用克去解，常常按下一头又翘起另一头</b>',
      '<b>核心原则</b>：',
      '<b>化解是为了通关，不是为了克。</b>',
      '<b>2.3 化解的示范</b>',
      '<b>举例</b>：<b>化解辰戌相冲</b>',
      '<b>化解辰戌相冲的示范——引入"合"与"害"，看针对谁。</b>',
      '<b>即</b>：<b>不去直接克制辰或戌，而是引入一个"合"</b> ——<b>比如用酉去合辰，或者用卯去合戌，把冲突的一方的力量"引开"。</b>',
      '<b>这个思路很妙</b>：<b>不是硬碰硬，而是"疏导"。</b>',
      '---',
      '<b style="color:var(--c-gold)">第八节　各门类的断课要点</b>',
      '<b>这一节是"速查"</b> —— <b>每个门类只列最要紧的那几条</b>，方便断课时快速过一遍。',
      '<b>各门类的完整断法</b>（条件、忌神、课式实证）<b>在第十一章「分类断课」</b> —— <b>这里查"有没有漏"，那里查"怎么断"。</b>',
      '<b>一、求财</b>',
      '<b>四个条件</b>：',
      '<b>财动</b>',
      '<b>财爻旺相</b>',
      '<b>外生内</b>',
      '<b>青龙旺相</b>',
      '<b>看的位置</b>：<b>将神</b>（财爻）',
      '<b>核心断语</b>：',
      '<b>财动必得财</b>（但分旺动与休死空动）',
      '<b>最怕贼动</b>（损财）',
      '<b>坐等来财</b> ——外生内（贵神生将神、人元生将神）',
      '<b>将神受克必破财伤身</b>',
      '<b>课式实证</b>',
      '<code>`</code>',
      '干支：丙申年　甲午月　庚午日　辛巳时',
      '月将：未　日空：戌、亥　四大空亡：水',
      '人元：壬　　水 + 旺',
      '贵神：戊寅（青龙）用　木 + 相　天德合、天喜、天马',
      '将神：甲申（传送）　金 + 休　驿马、六甲、飞廉',
      '地分：午　　火 + 死　吊客、截路',
      '<code>`</code>',
      '<b>问事</b>：一位女士求测事业财运。<b>把四个条件逐条对一遍</b>：',
      '<b>财动</b> —— 这一课是<b>地分午火克将神申金</b>，属于"地分克将神"（自我消耗），<b>不是财动</b> ✗',
      '<b>财爻旺相</b> —— <b>财爻是将神申金，正处"休"地</b> ✗',
      '<b>外生内</b> —— <b>人元壬水生贵神寅木、寅木又…</b> 这一课<b>水不直接生金</b>，<b>外生内不成立</b> ✗',
      '<b>青龙旺相</b> —— <b>贵神正是戊寅青龙，木在课内处"相"地</b> ✓',
      '<b>四条只占一条</b> —— 而且占的是<b>"青龙旺"这一条助力</b>，<b>不是财爻本身旺</b> —— 所以断<b>"有财路、但财不大"</b>。',
      '<b>这就是"速查"的用法</b>：<b>四条逐一打钩，钩少了，断语的口气就要收。</b>### 二、求官与工作',
      '<b>六个条件</b>：',
      '<b>贵神官爻旺相</b>',
      '<b>官动</b>',
      '<b>鬼动</b>',
      '<b>将神生贵神</b>',
      '<b>外来生内</b>',
      '<b>临岁月不空</b>',
      '<b>看的位置</b>：<b>贵神</b>（官爻）',
      '<b>核心断语</b>：',
      '<b>有官之人喜见官动，利于求官升职</b>',
      '<b>无官之人官动为诉讼纠纷</b>',
      '<b>最不利的是遇到"斩官"</b>（人元克贵神）',
      '<b>官动逢空</b> ——不得官，空欢喜一场',
      '<b>课式实证</b>',
      '<code>`</code>',
      '干支：戊子年　辛酉月　己卯日　辛未时',
      '月将：辰　日空：申、酉　四大空亡：无',
      '人元：癸　　水 - 旺',
      '贵神：甲子（玄武）　水 + 旺　六甲',
      '将神：庚午（胜光）用　火 + 死　月德',
      '地分：酉　　金 - 休　截路',
      '<code>`</code>',
      '<b>问事</b>：她老公的职位。',
      '<b>看官爻</b> —— <b>求官以贵神为官爻</b>：<b>贵神甲子水正当旺</b> ✓ —— 是"<b>在位置上、有力量</b>"的象。',
      '<b>再官动</b> —— <b>贵神子水与人元癸水同为水，比和</b> —— <b>不是官动</b>。',
      '<b>所以断"有官，但不是靠发动得来的"</b> —— 结合<b>太岁戊子起数、甲排第四</b>，断成"<b>有管理权的小头目、四把手</b>"。',
      '<b>关键的一条</b>：<b>官爻要看贵神，不看用神</b> —— 这一课的用神是<b>将神庚午火</b>（二阴二阳以将为用），<b>用神处死只说明这件事本身费力，不等于官小</b>。### 三、婚姻',
      '<b>看的位置</b>：<b>二神关系</b> + <b>桃花</b>',
      '<b>核心断语</b>：',
      '<b>二神相合</b> ——感情融洽',
      '<b>二神相冲克</b> ——感情破裂',
      '<b>见合但逢空亡</b> ——二人已非一条心',
      '<b>贼动</b> ——大多有外情',
      '<b>分局相生</b> ——最怕（同床异梦）',
      '<b>土多且旺</b> ——主晚婚',
      '<b>几条心法</b>：',
      '<b>冲则变，绝则散，刑则斗，破则夫妻异心。</b>',
      '<b>课式实证</b>',
      '<code>`</code>',
      '人元：己　　土',
      '贵神：丁卯　木',
      '将神：乙丑（大吉）用　土',
      '地分：巳　　火',
      '<code>`</code>',
      '<b>这是一课断婚姻的课</b>。<b>断婚姻有一条死规矩</b>：',
      '<b>分你我的时候，必须落在二神上。</b> 求测方在将神，对方就是贵神；求测方在贵神，对方就是将神。',
      '<b>这一课用神在将神乙丑</b> —— <b>求测的一方就是将神</b>，<b>对方看贵神丁卯</b>。',
      '<b>看二神的关系</b>：<b>贵神卯木克将神丑土</b> —— <b>木克土</b> —— <b>是贼动</b> —— 对方在克自己这一方，<b>主对方强势、自己受制</b>。',
      '<b>再看二神的天干</b>：<b>丁与乙不合</b>（丁壬合、乙庚合）—— <b>天干不合，说明不是"内外勾结"式的暗算，是明着来的不合</b>。',
      '<b>所以断</b>：<b>这段关系里对方说了算，而且矛盾是摆在台面上的</b> —— 这就是"<b>分你我必须落在二神上</b>"的用处：<b>只看用神一位，断不出两个人之间的关系</b>。### 四、断病',
      '<b>看的位置</b>：<b>四位对应人体</b> + <b>五行</b> + <b>神煞</b>',
      '<b>核心断语</b>：',
      '<b>旺为实病，衰为虚病</b>；实症为阳，虚症为阴',
      '<b>老年人喜休囚，年轻人要旺</b>（反常规规定）',
      '<b>辰戌土临用多有恶性肿瘤</b>',
      '<b>丧车临用又克人元，主病重伤重</b> —— 只断到"重"为止，不往下推',
      '<b>鬼动主怪异之症</b>',
      '<b>一条纪律</b>：',
      '<b>不断生死。</b>',
      '<b>课式实证</b>',
      '<code>`</code>',
      '干支：乙未年　壬午月　癸亥日　癸亥时',
      '月将：未　日空：子、丑　四大空亡：金',
      '人元：丙　　火 + 休　月德',
      '贵神：丁巳（腾蛇）用　火 - 休　天医、驿马、吊客、六丁',
      '将神：壬子（神后）　水 + 死　丧车',
      '地分：辰　　土 + 旺',
      '<code>`</code>',
      '<b>这一课问的是身体，不是财</b>。<b>断病有一条纪律</b>：',
      '<b>课内有财动，人家问的是身体，就不能去论财。</b>',
      '<b>三件事要记住</b>：',
      '<b>用神是贵神丁巳</b>（三阳一阴，以阴为用），<b>落在"休"地、又被将神壬子水所克</b> —— <b>用神受伤</b>；',
      '<b>将神壬子水克贵神丁巳火</b> —— 这是<b>财动</b>，但<b>问病不论财</b>；',
      '<b>人元丙火生地分辰土</b> —— <b>子孙动</b>。',
      '<b>落到病位上</b>：<b>巳火主心脏、也主两目</b>，被水克 —— 主<b>心脏与眼目</b>上的病；<b>辰土带湿气</b>，巳火生辰土，<b>表面是火生土，实际是火的力量被湿土吸掉</b> —— 主"<b>火被水气闷住</b>"。',
      '<b>神煞上还有三层</b>：<b>腾蛇</b>主忧虑缠绕、<b>天医</b>主"病有救"、<b>丧车</b>是最重的凶象（<b>只作内部判断，不对外断生死</b>）。<b>所以断"要重视、需慢慢调，但病不至危"</b>。### 五、出行',
      '<b>看的位置</b>：<b>驿马、天马</b> + <b>关隔锁</b> + <b>天罗地网</b>',
      '<b>核心断语</b>：',
      '<b>驿马入课旺相，主求事迅速</b>',
      '<b>出行要分关隔锁，斩关破锁才能行</b>',
      '<b>截煞罗网不可行</b>',
      '<b>最怕五鬼临身缠</b>',
      '<b>二马入课要远行</b>',
      '<b>应期</b>：',
      '<b>子午卯酉在半道，寅申巳亥未动身，辰戌丑未立等至。</b>',
      '即：<b>子午卯酉——在路上；寅申巳亥——还没动身；辰戌丑未——马上就到。</b>',
      '<b>六、官司</b>',
      '<b>看的位置</b>：<b>三刑</b> + <b>辰戌</b> + <b>天罗地网</b>',
      '<b>核心断语</b>：',
      '<b>官司最忌三刑全</b> ——纠缠斗讼更拖延',
      '<b>辰巳戌亥木克土</b> ——牢狱之灾不可免',
      '<b>无官最怕见官动</b>',
      '<b>辰戌临用斗讼事</b>',
      '<b>干神相生能和解</b>',
      '<b>课式实证</b>：见第十一章第六节一「官司」——那里有完整的四位盘与逐条推演。',
      '<b>七、失盗</b>',
      '<b>看的位置</b>：<b>玄武</b> + <b>太冲</b> + <b>贼动</b>',
      '<b>核心断语</b>：',
      '<b>失盗之财看四神，将为财帛贵贼人</b>',
      '<b>空亡此物不会丢</b>（逢空则没丢）',
      '<b>贼人落处推人元</b> ——甲乙木旺隐山林、丙丁藏匿高岭处、戊己土旺隐其身、庚辛在道逃匿中、壬癸河边来回寻',
      '<b>课式实证</b>：见第十一章第六节三「失盗」——身份证丢失一课，演示了"贼动逢空、物不损"的断法。',
      '<b>八、升学</b>',
      '<b>看的位置</b>：<b>二神</b> + <b>官鬼动</b> + <b>二马</b>',
      '<b>核心断语</b>：',
      '<b>升学求名二神看，旺相逢生最喜欢</b>',
      '<b>官鬼同动见二马，高中无疑喜还家</b>',
      '<b>将若克干求名吉</b>',
      '<b>三奇入课凶转吉</b>',
      '<b>课式实证</b>：升学与求官、求职性质相近，<b>可直接套用第十一章第二节"断职位几把手"那一课</b> —— 把问法换成"能不能考取"来看官爻与二马。',
      '<b>九、占环境</b>',
      '<b>看的位置</b>：<b>四位 + 五行</b>',
      '<b>核心断语</b>：',
      '<b>五行有水水边居，有火电器与机关</b>',
      '<b>木立课中旁有树，木上见火花树见</b>',
      '<b>金临课中定有路，申酉不同分窄宽</b>',
      '<b>土神出现各有主</b> ——丑土银行寺庙观、辰戌乱岗佛像占、未土药店餐馆宴',
      '<b>课式实证</b>：见第十一章第七节一「占环境」——那一段把"高压线、路边大坑、院内堆积物"这类取象逐条落到了四位上。',
      '<b>十、射覆（论物）</b>',
      '<b>看的位置</b>：<b>用神的五行 + 干支取象</b>',
      '<b>核心断语</b>：',
      '<b>论物多翻正</b> ——射覆上克下，论物以翻为正',
      '<b>下旁或有缺</b> ——下受克，物器旁有缺，或无足',
      '---',
      '<b style="color:var(--c-gold)">第九节　断课的心法</b>',
      '<b>课式实证</b>：见第十一章第七节「占环境与射覆」中的实例 —— <b>问物与问环境同看四位</b>，只是把"环境"换成"物件"。',
      '<b>一、先看四位的"上下内外"</b>',
      '<b>本体系的断课纲领是"以\'上下内外\'论课"</b>：',
      '<b>本体系断课纲领——以"上下内外"论课。</b>',
      '<b>即</b>：',
      '<b>上</b>（人元、贵神）——外面的、高层的',
      '<b>下</b>（将神、地分）——内部的、自己的',
      '<b>内</b>（将神、地分）——自己的事',
      '<b>外</b>（人元、贵神）——外面的事',
      '<b>断课先看这个框架</b>，再往里填细节。',
      '<b>二、人元配将神看"开始架构"</b>',
      '<b>断课心法总纲——人元配将神看"开始架构"，二神鉴真伪成败。</b>',
      '<b>即</b>：',
      '<b>人元 + 将神</b> ——<b>看事情的"开始架构"</b>（怎么起头的）',
      '<b>二神</b> ——<b>鉴别真伪、判定成败</b>（事情实际怎么样）',
      '<b>为什么人元配将神？</b>',
      '<b>占测来意时，以将神为主看将神与人元的关系，是相克相合关系，来判断求测大意。</b>',
      '<b>比如将神是木、人元是土有口舌纷争，火金是灾祸。但是要分清是谁克谁、谁合谁——人元克将是外来侵入，将神克外我索取。</b>',
      '<b>三、三段分析法</b>',
      '<b>断课三段分析法——开始（神＋元）／中间（二神）／最后（将＋分）。</b>',
      '<b>即</b>：',
      '| 阶段 | 位置 |',
      '|---|---|',
      '| <b>开始</b> | <b>人元 + 贵神</b> |',
      '| <b>中间</b> | <b>贵神 + 将神</b>（二神） |',
      '| <b>最后</b> | <b>将神 + 地分</b> |',
      '<b>但要注意</b>：',
      '<b>但在断课时，地分又为最早部分，因为我们起课是以地分为基开始的。</b>',
      '<b>人元是事物开始的发展阶段，地分为事物最初开始阶段，意思是不同的。</b>',
      '<b>即</b>：',
      '<b>地分</b> ——<b>最原始的（出身、来历）</b>',
      '<b>人元</b> ——<b>开始发动的（现在要做什么）</b>',
      '<b>四、直读与细推</b>',
      '<b>断课要诀——先直读，再论刑冲克害。</b>',
      '<b>"直读"是金口诀的一大特色</b>：',
      '<b>看到某个干支，直接读出它的象</b> ——<b>不需要经过复杂的推理。</b>',
      '<b>举例</b>：',
      '<b>看到巳火</b> ——直接想到"是非、猜疑、第三者"',
      '<b>看到申金</b> ——直接想到"移动、旧事重提、军警"',
      '<b>看到戌土</b> ——直接想到"坟墓、军警、空虚"',
      '<b>直读之后再细推</b> ——<b>看它们之间的生克关系。</b>',
      '<b>五、学习心法</b>',
      '<b>有几条关于学习的重要提醒</b>：',
      '<b>提醒一：类象为本</b>',
      '<b>类象为本，课内信息有限而思路无限。</b>',
      '<b>提醒二：实践出真知</b>',
      '<b>学习方法——实践出真知；神煞须死记硬背、勿依赖软件。</b>',
      '<b>提醒三：不要死记硬背</b>',
      '<b>学习方法——把干支"生活化、联想化"，不要死记硬背。</b>',
      '<b>提醒四：只用口诀套课体，只能"言其大意"</b>',
      '<b>单纯靠口诀去断课，只能是"观其大意"了。</b>',
      '<b>提醒五：基础不牢才叫瓶颈</b>',
      '<b>本课定位与学习心法——"基础不牢才叫瓶颈"。</b>',
      '<b>很多人学到一定阶段觉得"遇到瓶颈了"，其实不是瓶颈，是脚下的根基没有扎稳。</b>',
      '<b>六、对门派与技法之争的态度</b>',
      '<b>以断准为准。</b>',
      '<b>有两段批评很直接</b>：',
      '<b>关于起法之争</b>：',
      '<b>取月将的方法存在过节和过气取将两种方法，各有理有据，但是无论哪种方法起课都能验断准确所测之事，否则肯定一方早已无存。</b>',
      '<b>关于"起课法神秘化"</b>：',
      '<b>金口诀遁法其实是课内信息量的增加问题，本来是金口诀预测学内很普通的问题。但是，却有人故弄玄虚，夸大遁法的作用，蒙骗广大金口诀爱好者，实在是不应该的事。</b>',
      '<b>核心态度</b>：',
      '<b>最普通的就是最高级的</b> —— <b>起课方法上不必做文章。</b>',
      '<b>七、善易者不卜</b>',
      '<b>善易者不卜——"百姓日用而不知"。</b>',
      '<b>最高的境界，是连"卜"这个动作都不需要了</b> ——<b>因为你已经理解了事物的规律，看什么都能明白。</b>',
      '<b>八、学易先做人</b>',
      '<b>学易先做人——德性第一。</b>',
      '<b>关于断课的伦理与避讳</b>：',
      '<b>断课的伦理与避讳。</b>',
      '<b>具体包括</b>：',
      '<b>涉及隐私要谨慎</b>',
      '<b>不断生死</b>',
      '<b>劝合不劝离</b>',
      '<b>不炫技、不口无遮拦</b>',
      '---',
      '<b style="color:var(--c-gold)">本章小结</b>',
      '<b>一、断课总纲</b>',
      '<b>总纲歌诀</b>：「凡占课，入式歌言其大象，五动爻观其大意，以格局看其事体，凭驿马神煞定其吉凶，以空亡、月破、支干三合六合验其成败。」',
      '<b>断课十步</b>：定旺衰 → 判用神 → 看五动三动 → 看格局 → 看人元 → 二神关系 → 神煞 → 五行细推 → 结合四柱 → 慎下断语。',
      '<b>断课六步</b>（回答顺序）：目前情况 → 将来如何 → 以前如何 → 针对何事 → 何时解决 → 怎么解决。',
      '<b>解课六步</b>（看课顺序）：界定范围 → 参看用神 → 参看五动三动 → 对照入式歌诀 → 五行之内细推元 → 推断应期。',
      '<b>二、界定求测范围</b>',
      '<b>断课前先圈定范围</b> ——不能盲目断课、答非所问。',
      '<b>范围定了，后面的分析才有方向</b>（求官时见子孙动，风马牛不相及，不予取用）。',
      '<b>主要问题解决后可以兼断</b>其他情况。',
      '<b>三、用神、动、格局</b>',
      '<b>用神只能落在贵神或将神</b>；贵神主工作，将神主财。',
      '<b>看用神四件事</b>：什么干支、什么五行、什么状态、在哪个位置。',
      '<b>不能只看用神</b> ——「以偏概全，常常答非所问、不能周全」。',
      '<b>五动三动是断课先锋</b> ——「高层不用看」是误解。',
      '<b>格局看事体性质</b>；连茹不算格局。',
      '<b>四、人元、二神、神煞</b>',
      '<b>人元代表趋势</b>；人元休死则开始阶段不利，人元逢空则事情不落实。',
      '<b>断来意看人元与将神的关系</b> ——因为人元是开始部分，将神代表其本人。',
      '<b>二神占七成</b> ——「兵熊熊一个，将熊熊一窝」；二神是"谈判桌"和"鉴定机构"。',
      '<b>神煞三个要点</b>：驿马当先、月破力大、凶快吉慢。',
      '<b>五、五行之内细推元</b>',
      '<b>五动三动是粗断，五行细推是细断。</b>',
      '<b>课内无一处无用</b> ——四位都是你的信息。',
      '<b>面对复杂课体，取"最突出的那一点"</b>（先看绝，再看刑，再看冲克害）。',
      '<b>复合关系分两层看</b> ——先大局，后细节。',
      '<b>先直读，再论刑冲克害。</b>',
      '<b>下断语要讲分寸</b> ——涉及隐私要委婉、不断生死、劝合不劝离。',
      '<b>六、结合四柱</b>',
      '<b>四柱是外环境</b> ——「不单独起作用，只影响课内关系，决成败，助吉凶能量」。',
      '<b>四柱分量级</b>：太岁如中央、月建如地区、日建如地方、时辰如小区。',
      '<b>课内三支逐个与四柱比较</b> ——这个方法特别适合断流年流月。',
      '<b>属相本命也可入断。</b>',
      '<b>七、慎下断语</b>',
      '<b>课内信息是多层的、应期有变数、断语会影响人</b> ——所以要慎。',
      '<b>大方向明确，细节留余地。</b>',
      '<b>断课要给化解方案</b> ——化解三层次（安抚/克制/通关）。',
      '<b>化解是为了通关，不是为了克。</b>',
      '<b>八、各门类要点</b>',
      '<b>求财</b> ——四条件；看将神；最怕贼动。',
      '<b>求官</b> ——六条件；看贵神；最怕斩官。',
      '<b>婚姻</b> ——看二神关系与桃花；「冲则变，绝则散，刑则斗，破则夫妻异心」。',
      '<b>断病</b> ——四位对应人体；老人喜休囚、年轻人要旺；不断生死。',
      '<b>出行</b> ——看驿马天马、关隔锁、天罗地网。',
      '<b>官司</b> ——最忌三刑全、辰戌临用。',
      '<b>失盗</b> ——看玄武、太冲、贼动；贼人落处推人元。',
      '<b>升学</b> ——官鬼同动见二马。',
      '<b>占环境</b> ——五行与四位的取象。',
      '<b>射覆</b> ——论物多翻正，下旁或有缺。',
      '<b>九、心法</b>',
      '<b>断课纲领以"上下内外"论课。</b>',
      '<b>人元配将神看"开始架构"，二神鉴真伪成败。</b>',
      '<b>三段分析法</b>：开始（神+元）／中间（二神）／最后（将+分）；但地分是最原始的。',
      '<b>先直读，再细推。</b>',
      '<b>类象为本，课内信息有限而思路无限。</b>',
      '<b>实践出真知；神煞须死记硬背、勿依赖软件。</b>',
      '<b>基础不牢才叫瓶颈。</b>',
      '<b>以断准为准</b> ——不在起法上争高下、不故弄玄虚。',
      '<b>善易者不卜</b> ——百姓日用而不知。',
      '<b>学易先做人</b> ——德性第一。',
      '---',
      '<b style="color:var(--c-gold)">心法</b>',
      '<b>断课是从"零件"到"整体"</b>',
      '<b>学了很多零件（起课、四位、用神、旺衰、五动、神煞、格局），但拿到课还是不会断</b> ——<b>这是正常的。</b>',
      '<b>因为"装起来"需要练习。</b>',
      '<b>就像学开车</b>：',
      '<b>知道油门、刹车、方向盘是什么</b> ——这是"零件"',
      '<b>能在路上开</b> ——这是"装起来"',
      '<b>中间差的，就是"上手练"。</b>',
      '<b>所以</b>：',
      '<b>最大的学习障碍是"不敢断"——实践不可省。</b>',
      '<b>学三天就能断课</b> ——<b>因为只要学会五动三动，再熟悉五行相克，就能说出几句。</b>',
      '<b>但不敢断，就永远学不会。</b>',
      '<b>从哪下手</b>',
      '<b>拿到课，第一步做什么？</b>',
      '<b>答案</b>：<b>先圈定范围</b> ——<b>问什么，就看什么。</b>',
      '<b>然后按十步走</b>：',
      '<code>`</code>',
      '定旺衰 → 判用神 → 看动 → 看格局 → 看人元',
      '→ 二神 → 神煞 → 细推 → 四柱 → 下断语',
      '<code>`</code>',
      '<b>这十步走熟了，就是"从哪下手"的答案。</b>',
      '<b>怎么全面</b>',
      '<b>为什么"课内无一处无用"？</b>',
      '<b>因为四位都是你的信息</b> ——<b>漏掉一处，就漏掉一件事。</b>',
      '<b>那个比方说得好</b>：',
      '<b>比如说我们去谈判要用到嘴、用到手，难道其他的身体部分留家里吗？你的脚受伤了，其他部位出问题了，你照样没法去工作。</b>',
      '<b>所以断课要"全身检查"</b> ——<b>不能只看一个地方。</b>',
      '<b>怎么活变</b>',
      '<b>四位是"死"的，断起课来是"活"的。</b>',
      '<b>"活"在哪里？</b>',
      '<b>活在你对"所问之事"的理解</b> ——',
      '<b>问婚姻</b> ——妻子可能落在将神，也可能落在贵神',
      '<b>问工作</b> ——用神在贵神是"凭本事"，在将神是"靠关系"',
      '<b>问身体</b> ——四位对应人体部位',
      '<b>同一张图，问不同的事，取的位置关系就不同。</b>',
      '<b>这就是"活变"</b> ——<b>它不是"乱变"，而是"根据问题调整视角"。</b>',
      '<b>慎下断语</b>',
      '<b>这一条放在最后，但最重要。</b>',
      '<b>因为断课的话会影响人。</b>',
      '<b>一句"你今年破财"，可能让人整年不安；一句"你们成不了"，可能拆散一段姻缘。</b>',
      '<b>所以</b>：',
      '<b>大方向要明确</b>（不能含糊其辞）',
      '<b>细节要留余地</b>（不能把话说死）',
      '<b>要给出办法</b>（不只是说凶吉，还要说怎么办）',
      '<b>这就是"慎下断语"的含义。</b>',
    ]},
    { t: '第十章　学习方法与心法', rows: [
      '<b style="color:var(--c-gold)">引言</b>',
      '<b>这一章讲什么</b>',
      '前面九章讲的都是<b>技术</b> ——怎么起课、怎么断课。',
      '<b>这一章讲"怎么学"和"怎么用"。</b>',
      '<b>为什么单独讲这一章？</b>',
      '<b>因为这门学问有个特点</b>：',
      '<b>入门容易，提高难。</b>',
      '<b>入门容易</b> ——五动三动学三天就能断课',
      '<b>提高难</b> ——很多人学到一定阶段就"卡住"了，觉得自己"遇到瓶颈"',
      '<b>而"卡住"的原因，往往不在技术，而在方法。</b>',
      '<b>这一章要解决的，就是这些问题</b>：',
      '<b>为什么我会卡住？</b> ——基础不牢，不是瓶颈',
      '<b>怎么才能不断进步？</b> ——实践 + 类象',
      '<b>断课时有什么忌讳？</b> ——伦理与避讳',
      '<b>最好的境界是什么？</b> ——善易者不卜',
      '---',
      '<b style="color:var(--c-gold)">第一节　这门学问是什么</b>',
      '<b>一、金口诀的定位</b>',
      '<b>1.1 金口诀是什么</b>',
      '<b>金口诀是中国传统预测术的一种</b>，属于<b>高层预测学</b>。',
      '<b>金口诀属于高层预测学，像计算公式一样千变万化。</b>',
      '<b>它的特点</b>：',
      '<b>体系最简洁</b> ——四行字',
      '<b>上手最快</b> ——学三天就能断课',
      '<b>断事最细</b> ——能断到具体的人事物',
      '<b>1.2 金口诀与八字的区别</b>',
      '<b>八字是断整体命运，结合流年运势判断吉凶成败，而在专事专断细节方面不占优势。</b>',
      '<b>而金口诀在整体运势上能粗略分析，在细节专事专断见长。</b>',
      '<b>人无完人，术无至臻。</b>',
      '<b>对比</b>：',
      '| | <b>八字</b> | <b>金口诀</b> |',
      '|---|---|---|',
      '| <b>擅长</b> | <b>整体命运</b> | <b>专事专断细节</b> |',
      '| <b>不擅长</b> | 细节 | 整体运势（但也能断） |',
      '<b>金口诀的优势</b>：',
      '<b>不必八字生辰、模拟天地人的"标签"模型。</b>',
      '<b>即</b>：<b>金口诀不需要准确的出生时辰，只要一个"定位点"（属相、数字、外应等）就能起课。</b>',
      '<b>1.3 金口诀的来源</b>',
      '<b>金口诀出于兵法，集三式精华，古本只载五成。</b>',
      '<b>几个要点</b>：',
      '<b>出于兵法</b> ——金口诀来源于军事（用于判断战事吉凶、双方力量对比）',
      '<b>集三式精华</b> ——吸收了太乙、奇门、六壬的精华',
      '<b>古本只载五成</b> ——<b>古书里只记录了五成的内容</b>，其余靠口传',
      '<b>关于"出于兵法"</b>：',
      '<b>金口诀来源于军法，对于事物的吉凶与双方力量悬殊很容易分辨，也可以细节分析双方进展的趋势，还能分析环境利弊。</b>',
      '<b>但这个环境不是我们通常指的风水，只能根据环境来分析此战的利害关系，而不能去调整环境。</b>',
      '<b>注意这一条</b>：',
      '<b>金口诀断环境 ≠ 风水。</b>',
      '<b>为什么？</b>',
      '<b>我们能调理风水，而作战不可能让你去先把环境调整好，只能利用环境或者躲开不利环境。</b>',
      '<b>我们在断课时可以分析出周围的环境，甚至用到遁法再发现更多的环境信息。不能误解金口诀也就是学习了风水。</b>',
      '<b>通常的风水是八卦体系，金口诀是五行体系，而且八卦体系包括五行体系还有方位的利害关系等，所以不能把金口诀断环境理解为金口诀风水。</b>',
      '<b>我们学习是本着务实求实的思想，而不是故意夸大其词、误导爱好者。</b>',
      '<b>术业有专攻，金口诀的重点是预测体系，不是风水体系。不能与风水混为一谈。</b>',
      '<b>1.4 金口诀的名称与传承</b>',
      '<b>金口诀有几个别称</b>：',
      '<b>金口诀</b>',
      '<b>六壬金口诀</b>',
      '<b>孙膑金口诀</b>',
      '<b>祖师</b>：',
      '<b>此是孙膑真甲子，天地移来掌内观。</b>',
      '<b>即</b>：<b>金口诀相传为孙膑所传</b>（入式歌最后一句就是这个意思）。',
      '<b>古本的体系</b>：',
      '<b>金口诀原貌：四课法、天盘贵神法（初中末传）、将行归家法。</b>',
      '<b>金口诀的完整体系远不止一课——11 到 14 课。</b>',
      '<b>即</b>：<b>古本的金口诀有"四课法"</b> —— <b>一次起出四个课，为的是增加信息量</b>（其中<b>目前常用的是正宗课，另有转宗课等</b>）；<b>古本整套体系，约在 11 到 14 课之间。</b>',
      '<b>我们现在用的只是"正面体"的成课。</b>',
      '<b>二、金口诀为什么能断事</b>',
      '<b>2.1 模拟体系</b>',
      '<b>金口诀是模拟体系——"瞬间定位、全息分析"。</b>',
      '<b>两层意思</b>：',
      '<b>瞬间定位</b> ——取一个"定位点"（地分），整个课就定了',
      '<b>全息分析</b> ——课内任何信息都是你的信息',
      '<b>"标签"模型的比喻</b>：',
      '<b>金口诀的定位与优势——不必八字生辰、模拟天地人的"标签"模型。</b>',
      '<b>即</b>：<b>金口诀像一个"标签系统"</b> ——<b>你给它一个输入（属相、数字、字），它就生成一个模型，然后从这个模型里读出信息。</b>',
      '<b>2.2 重克不重生</b>',
      '<b>金口诀重克不重生——所以"快、准、狠"。</b>',
      '<b>为什么"重克"就能"快准狠"？</b>',
      '<b>因为</b>：<b>克是矛盾点</b> ——<b>找到矛盾，就找到了问题的关键，不用大海捞针。</b>',
      '<b>课式实证</b>',
      '<code>`</code>',
      '干支：乙未年　庚辰月　甲子日　丁卯时',
      '月将：酉　日空：戌、亥　四大空亡：水',
      '人元：丁　　火 - 旺　天德合、月德合、六丁',
      '贵神：庚午（朱雀）用　火 + 旺　病符、飞廉',
      '将神：癸酉（从魁）　金 - 死　丧门、丧车',
      '地分：卯　　木 - 休　天医',
      '<code>`</code>',
      '<b>这一课问的是"家里有人受伤了，伤得厉害吗"</b>。<b>四位里有生也有克</b>：',
      '<b>木生火</b>（地分卯木生人元、贵神两个火）—— 这是"<b>生</b>"；',
      '<b>火克金</b>（人元、贵神两个火克将神酉金）—— 这是"<b>克</b>"；',
      '<b>金克木</b>（将神酉金克地分卯木）—— 这也是"<b>克</b>"。',
      '<b>断课从哪儿下手？</b> <b>从"克"下手。</b> 因为这个课里的"克"，正压在要害上：',
      '<b>火克金</b> —— 酉金被两个火夹着克，<b>这是最急的一处矛盾</b> —— 断<b>伤灾、破财、筋骨受损</b>；',
      '<b>金克木</b> —— 卯木被酉金克，又是<b>卯酉相冲</b> —— 断<b>下肢受伤</b>。',
      '<b>四五条断语全从"克"上来，"生"一句没往外说</b> —— <b>这就是"重克"的意思</b>：<b>克的地方就是出问题的地方，找到它，话就有了。</b>',
      '<b>但"生"不是没用</b>：<b>地分卯木生人元火</b>（父母动）断出"<b>家里在修房子</b>" —— <b>生主来源、主供给，克主矛盾、主损害</b>。<b>两样都要看，只是"克"要先看</b> —— 因为<b>来问的人，多半是来问麻烦的</b>。',
      '<b>2.3 信息量有限，但能模拟万事万物</b>',
      '<b>这是很重要的一点</b>：',
      '<b>金口诀的信息量有限，但能模拟万事万物。</b>',
      '<b>什么意思？</b>',
      '<b>课只有四行、几个字</b> ——<b>信息量确实有限</b>。',
      '<b>但这几个字可以"模拟万事万物"</b> ——<b>同一个课，问不同的事，读出来的信息就不同。</b>',
      '<b>这个道理讲得很清楚</b>：',
      '<b>初学者常会发现一个问题：金口诀整个课的信息量是有限的，可要断的事情性质各不相同。同样的信息，断出来的话、回答的问题却不一样。</b>',
      '<b>这就感觉到很神奇——不是说简单的就是三句五句，最多断个十来句，就算是金口诀就算是结束了。其实并不是这样。</b>',
      '<b>就是说金口诀他是一个模拟性的，他可以模拟任何万物。</b>',
      '<b>所以他的这个特点就是"简、短、快、准"。</b>',
      '<b>总结</b>：<b>课内信息有限，但思路无限。</b>',
      '---',
      '<b style="color:var(--c-gold)">第二节　学习的三个阶段</b>',
      '<b>一、为什么很多人"看得懂课例，却不知道断语从哪来"</b>',
      '<b>这是初学者最常见的困惑</b>：',
      '<b>为什么很多人"看得懂课例，却不知道断语从哪来"？</b>',
      '<b>具体表现</b>：',
      '<b>看别人断课</b> ——好像很有道理',
      '<b>自己做</b> ——不知道从哪下手',
      '<b>原因</b>：',
      '<b>看课例的时候，很多东西不好理解，不知道这个断语是从哪下的。</b>',
      '<b>就是对用一些口诀、用一些五动三动，你找不到这个断语的所在，它都从哪来的。</b>',
      '<b>解决的办法只有一个：把"推"的过程练成习惯</b> ——',
      '<b>具体做法</b>：<b>每读一个课例，先把右边的"依据"遮住，自己从四位往回推一遍，写出你的断语，再跟课例对照。</b> <b>推不出来的地方，就是你的缺口</b> —— <b>缺口补一个，就少一个。</b> <b>这样练上几十个课，看见符号就能出象，看见象就能出话。</b>',
      '<b>关键</b>：<b>金口诀的断语不是"猜"出来的，是从课里的符号推出来的。</b> 只要把"推"的过程走一遍，就知道断语从哪来了。',
      '<b>二、卡住的原因：基础不牢</b>',
      '<b>很多人学到一定阶段会觉得"卡住了"</b> ——<b>这叫"瓶颈"。</b>',
      '<b>但真相是</b>：',
      '<b>本课定位与学习心法——"基础不牢才叫瓶颈"。</b>',
      '<b>这个态度很直接</b>：',
      '<b>很多人说自己"遇到瓶颈了"</b> —— <b>其实多半不是瓶颈，是基础不牢。</b>',
      '<b>基础不牢不是"知道得少"，是"用不活"</b> —— <b>学到某个地方，忽然不知道该往哪一步走、也不知道自己卡在哪儿</b> —— <b>这就是"脚下没有根"。</b>',
      '<b>根不深的树长不高，根不牢的功夫走不远。</b>',
      '<b>所以遇到卡住的时候，怎么办？</b>',
      '<b>不妨回头看看自己的基础，多半问题就出在那里。</b>',
      '<b>三、学习的两类基础</b>',
      '<b>基础是什么？一个是指干支、生克、刑冲等，再就是实践也是一种基础——一种是理论基础，再就是行动基础。</b>',
      '| 基础 | 内容 | 怎么练 |',
      '|---|---|---|',
      '| <b>理论基础</b> | 干支、生克、刑冲合害 | 读书、记忆、理解 |',
      '| <b>行动基础</b> | 断课的手感 | <b>必须实际断课</b> |',
      '<b>"行动基础"常被忽略</b> ——<b>但它是关键。</b>',
      '<b>四、最大的障碍是"不敢断"</b>',
      '<b>最大的学习障碍是"不敢断"——实践不可省。</b>',
      '<b>为什么不敢断？</b>',
      '<b>几个原因</b>：',
      '<b>怕断错</b>',
      '<b>怕丢面子</b>',
      '<b>觉得还没学完</b>',
      '<b>但</b>：',
      '<b>金口诀入门快</b> —— <b>学会五动三动、熟悉五行生克，三天就能开口断几句</b> —— <b>这是它的上手门槛本来就低，不等于它浅。</b>',
      '<b>所以</b>：',
      '<b>不要在"学完"之后才断</b> ——<b>边学边断，才是正路。</b>',
      '<b>五、学习的方法</b>',
      '<b>5.1 把干支"生活化、联想化"</b>',
      '<b>学习方法——把干支"生活化、联想化"，不要死记硬背。</b>',
      '<b>具体怎么做？</b>',
      '<b>比如学"子水"</b> ——不要死记"子水主智慧、主隐私、主小偷"，而是<b>想</b>：',
      '<b>子时是半夜</b> ——<b>半夜人们都在睡觉，所以主"隐私"</b>',
      '<b>半夜活动的是老鼠</b> ——<b>老鼠偷偷摸摸，所以主"小偷"</b>',
      '<b>半夜很静，头脑清楚</b> ——<b>所以主"智慧"</b>',
      '<b>这样就"生活化"了</b> ——<b>不用背，也能记住，而且能延伸。</b>',
      '<b>5.2 类象为本</b>',
      '<b>类象为本，课内信息有限而思路无限。</b>',
      '<b>即</b>：<b>学好取象，比学多少口诀都重要。</b>',
      '<b>5.3 神煞须死记硬背</b>',
      '<b>神煞须死记硬背、勿依赖软件。</b>',
      '<b>为什么？</b>',
      '<b>因为</b>：<b>神煞是"查表"的东西，没有道理可讲</b> ——<b>只能背。</b>',
      '<b>而</b>：<b>依赖软件会失去"手感"</b> ——<b>断课时想不起来，就断不出来。</b>',
      '<b>5.4 不要死套口诀</b>',
      '<b>只用口诀套课体，只能"言其大意"。</b>',
      '<b>话说得很直</b>：',
      '<b>口诀是至高的，但不是万能的。</b>',
      '<b>单纯的靠口诀去断课，只能是消息妙论说的"观其大意"了。</b>',
      '<b>所以必须重视学习五行的生克制化之理。</b>',
      '<b>5.5 讲课与看书不同</b>',
      '<b>学习方法——古本文字繁复，道理只在几句。</b>',
      '<b>学习方法——小窍门来之不易，学习与看书不同。</b>',
      '<b>"学习与看书不同"</b> ——<b>看书只能看到"字"，学习（跟着人学）才能得到"窍门"。</b>',
      '<b>为什么？</b>',
      '<b>因为</b>：<b>古本文字繁复，但道理只在几句</b> ——<b>那几句"要害"，往往是书上没写的。</b>',
      '---',
      '<b style="color:var(--c-gold)">第三节　五行义理来源于生活</b>',
      '<b>一、道就是生活</b>',
      '<b>五行的义理来源于生活——"道就是生活"。</b>',
      '<b>这是这一章最重要的一句话。</b>',
      '<b>为什么这么说？</b>',
      '<b>因为</b>：<b>所有的取象，都是从生活里来的。</b>',
      '<b>举例</b>：',
      '<b>"水主智慧"</b> ——为什么？',
      '<b>因为</b>：<b>水能适应各种环境（放到什么容器就是什么形状）</b> ——<b>这种"灵活应变"的能力，正是智慧的表现。</b>',
      '<b>"金主义气"</b> ——为什么？',
      '<b>因为</b>：<b>金性刚、性烈，主"从革"</b> ——<b>刚烈、说一不二、肯为朋友两肋插刀，这正是义气的表现。</b>',
      '<b>"午火反复"</b> ——为什么？',
      '<b>因为</b>：<b>火焰一会儿高一会儿低，没有固定形状</b> ——<b>这种"跳动不定"的状态，正是反复的表现。</b>',
      '<b>所以</b>：',
      '<b>你理解了生活，就理解了五行。</b>',
      '<b>二、从生活推演取象</b>',
      '<b>这套推演的方法，有三个层次</b>：',
      '<b>第一层：从五行的本性出发</b>',
      '<b>比如木的本性是"向上生长"</b> ——那么凡是与"向上生长"相关的事物，都可以归到木上。',
      '<b>第二层：从本性延伸到性格</b>',
      '<b>木向上生长，直直地往上</b> ——<b>所以性格直爽、讲信义</b>。',
      '<b>第三层：再延伸到具体事物</b>',
      '<b>木像枝条</b> ——<b>所以头发浓密</b>；<b>木生发</b> ——<b>所以喜欢养花木</b>。',
      '<b>注意</b>：<b>这个延伸过程始终"离不开本性"。</b>',
      '<b>推演的路子是一样的</b>：<b>火有光有影，于是延伸到影视、娱乐、信息</b> —— <b>看着很"现代"，用的仍是"从本性出发"这一条路。</b>',
      '<b>所以</b>：<b>不管延伸到多远、多现代的事物，都要从五行的本性出发。</b>',
      '<b>课式实证</b>',
      '<code>`</code>',
      '干支：丙申年　甲午月　庚午日　辛巳时',
      '月将：未　日空：戌、亥　四大空亡：水',
      '人元：壬　　水 + 旺',
      '贵神：戊寅（青龙）用　木 + 相　天德合、天喜、天马',
      '将神：甲申（传送）　金 + 休　驿马、六甲、飞廉',
      '地分：午　　火 + 死　吊客、截路',
      '<code>`</code>',
      '<b>这一课的地分是午火</b>。<b>午火在古法里最直白的象是"马、文书、光明"</b>。',
      '<b>可到了今天，同一个午火该读成什么？</b>',
      '<b>火主光、主电</b> —— <b>午火就落在与"电、屏幕、信号"打交道的行当上</b>：<b>信息、电子、网络、传媒</b>。',
      '<b>这一课问事业财运</b> —— <b>断的是"工作项目与信息类有关"</b> —— <b>读的正是午火这个延伸出来的象</b>。',
      '<b>延伸归延伸，根没动</b>：<b>午火的本性还是"火"</b> —— <b>主快、主亮、主显</b> —— <b>所以这份工作也带着"快、外露、信息流转"的性质</b>。<b>这就是"类象随时代延伸、性格不变"</b>：<b>名目可以换代，性子不能换代。</b>',
      '<b>三、类象随时代延伸而性格不变</b>',
      '<b>这条原则很重要</b>：',
      '<b>类象随时代延伸而性格不变。</b>',
      '<b>即</b>：',
      '<b>类象可以不断延伸</b> ——网络、微博、软件、银行……都是新事物',
      '<b>但五行的"性格"（本性）永远不变</b>',
      '<b>举例</b>：',
      '<b>水主流动</b> ——<b>古代是河水，现代是"信息流"</b> ——<b>所以子水可以代表"软件、机密档案"。</b>',
      '<b>巳火主信息、主游动</b> ——<b>古代是"蛇"</b> ——<b>所以巳火可以代表"网络"。</b>',
      '<b>木主交易、主门户</b> ——<b>古代是"集市"</b> ——<b>所以卯木可以代表"网络购物"。</b>',
      '<b>所以</b>：',
      '<b>十二地支学习方法——重基础、找特性、可直读；类象随时代延伸而性格不变。</b>',
      '---',
      '<b style="color:var(--c-gold)">第四节　断课的伦理与避讳</b>',
      '<b>一、学易先做人</b>',
      '<b>学易先做人——德性第一。</b>',
      '<b>这是最重要的伦理原则。</b>',
      '<b>这个道理要讲透</b>：',
      '<b>特别是我们学易的人。学易是智者的活动，每个人都可以学好易学，但必须先要做好人。</b>',
      '<b>易是来源生活、服务生活的。如果一个人德性败坏，掌握这门学问后用来坑蒙拐骗，岂不是对易的亵渎，也给我们这些真心研习之人蒙羞。</b>',
      '<b>特别那些打着周易旗号行骗的一些人，造成了老百姓对易学的误解，更有甚者不懂命理者侮辱易学，说周易是八卦，八卦是算卦，算卦是废话。让人啼笑皆非。</b>',
      '<b>既然选择了学易，就必须先有德。</b>',
      '<b>二、口德很关键</b>',
      '<b>易者是动脑动嘴的技术，所以口德很关键。该说的说，不该说的话留三分。</b>',
      '<b>为什么口德关键？</b>',
      '<b>因为</b>：<b>断课的话会影响人。</b>',
      '<b>具体原则</b>：',
      '<b>该说的说，不该说的留三分</b>',
      '<b>特别涉及到一些隐私问题，更要谨慎</b>',
      '<b>即便你技术再高，到处炫技、口无遮拦、骄傲逞强，这样的人永远没有市场</b>',
      '<b>三、断课的几个避讳</b>',
      '<b>3.1 涉及隐私要委婉</b>',
      '<b>比如断到"有外情"这类事</b> ——<b>不能直说，要用委婉的表达。</b>',
      '<b>为什么？</b>',
      '<b>因为</b>：<b>可能求测者身边有人，或者求测者自己接受不了。</b>',
      '<b>3.2 不断生死</b>',
      '<b>占病含不断生死的规矩。</b>',
      '<b>即</b>：<b>断病可以断病情轻重、能不能治好，但不能断"什么时候死"。</b>',
      '<b>为什么？</b>',
      '<b>因为</b>：<b>一是断不准（生死有变数），二是会给人造成极大的心理压力。</b>',
      '<b>但有一条例外</b>：',
      '<b>丧车临用又克人元，主病重伤重。</b>',
      '<b>注意这条断语只到"重"为止</b> ——<b>"必死"这一类话，任何情况下都不说。</b>',
      '<b>3.3 劝合不劝离</b>',
      '<b>劝合不劝离，大问题你自己拿主意，利害关系都和你讲了。</b>',
      '<b>即</b>：<b>断婚姻时，即使看出要散，也要劝和，把利害关系讲清楚，让求测者自己决定。</b>',
      '<b>3.4 不炫技</b>',
      '<b>不要把断课当成"表演"。</b>',
      '<b>最典型的一种批评是</b>：',
      '<b>很多人断课时为了显示自己的本领，不问人家预测什么事，就先一通乱断。这也是风马牛不相及。</b>',
      '<b>即</b>：<b>断课是为了帮人解决问题，不是为了显示本事。</b>',
      '<b>四、对门派之争的态度</b>',
      '<b>以断准为准。</b>',
      '<b>两段态度很明确</b>：',
      '<b>关于起法之争</b>：',
      '<b>取月将的方法存在过节和过气取将两种方法，各有理有据，但是无论哪种方法起课都能验断准确所测之事，否则肯定一方早已无存。</b>',
      '<b>关于"起课法神秘化"</b>：',
      '<b>金口诀遁法其实是课内信息量的增加问题，本来是金口诀预测学内很普通的问题。但是，却有人故弄玄虚，夸大遁法的作用，蒙骗广大金口诀爱好者，实在是不应该的事。</b>',
      '<b>关于"高级技法"</b>：',
      '<b>技法再多只是一种起课方法，断课才是真功夫才是硬道理。</b>',
      '<b>核心</b>：',
      '<b>最普通的就是最高级的</b> —— <b>起课方法上不必做文章。</b>',
      '<b>五、同道相敬</b>',
      '<b>学易不能死记硬背，这个不是手艺活，不是千篇一律，要灵活多变才能创造奇迹，才会是一个好的易学研究者，才能更好的服务大众。</b>',
      '<b>易者不易，易是大家的。在选择学易的同时，首先要懂得互相尊重，不以技术高低论长短，更不要攻击诽谤。</b>',
      '<b>学易者求学，教易者共学，教与学都是对易的尊重和执着。</b>',
      '<b>"不以技术高低论长短，更不要攻击诽谤"</b> ——<b>这是同道相处的基本准则。</b>',
      '<b>还有一句同样要紧的话</b>：',
      '<b>你不接受的东西不代表别人不需求。</b>',
      '<b>易德，口德，道德，积德，德行天下。</b>',
      '<b>君子以自强不息，厚德载物。</b>',
      '---',
      '<b style="color:var(--c-gold)">第五节　最高的境界</b>',
      '<b>一、善易者不卜</b>',
      '<b>善易者不卜——"百姓日用而不知"。</b>',
      '<b>这是一句流传很广的古语</b> ——<b>意思是：真正懂易的人，不需要占卜。</b>',
      '<b>为什么？</b>',
      '<b>因为</b>：<b>他已经理解了事物的规律，看什么都能明白。</b>',
      '<b>"百姓日用而不知"</b> ——<b>普通老百姓天天在用这些道理，只是不知道而已。</b>',
      '<b>举例</b>：',
      '<b>天冷了加衣服</b> ——这是顺应时令',
      '<b>见好就收</b> ——这是"物极必反"',
      '<b>不要赶尽杀绝</b> ——这是"凡事留余地"',
      '<b>这些道理，老百姓天天在用</b> ——<b>只是不知道它们来自易学。</b>',
      '<b>二、人不动神动</b>',
      '<b>人不动神动——起课的最高境界是"心动之处为地分"。</b>',
      '<b>什么意思？</b>',
      '<b>功夫到了，不用对方开口</b> ——<b>凭当时的心动和外应，就能起课断事。</b>',
      '<b>话是这样说的</b>：',
      '<b>"学会金口诀，来人不用说"是针对预测师而言。</b>',
      '<b>即</b>：<b>这句话是说"预测师的水平到了这个程度"，不是"真的不用问"。</b>',
      '<b>三、最普通的就是最高级的</b>',
      '<b>最普通的就是最高级的</b> —— <b>起课方法上不必做文章。</b>',
      '<b>为什么"最普通"反而"最高级"？</b>',
      '<b>因为</b>：',
      '<b>普通的方法</b> ——<b>用的人多，验证得多，最可靠</b>',
      '<b>花哨的方法</b> ——<b>往往是"包装"，实际效果未必好</b>',
      '<b>这里有一条很直接的告诫</b>：',
      '<b>起课的方法就这么多 —— 那些看上去玄之又玄的"高级技法"，多半只是为招生而设的门面。</b>',
      '<b>技法再多只是一种起课方法，断课才是真功夫才是硬道理。</b>',
      '<b>四、大道至简</b>',
      '<b>掌握的是事物原理，坚持的是大道至简。大的道理变成简易，其实就是还原于生活。</b>',
      '<b>"还原于生活"</b> ——<b>这是这门学问的归宿。</b>',
      '<b>为什么？</b>',
      '<b>因为</b>：<b>这门学问本来就是从生活里来的</b>（观天象、察地理、看人事）。',
      '<b>所以学到最后</b> ——<b>不是记住了多少口诀，而是"看什么都明白"。</b>',
      '<b>这也是"善易者不卜"的另一种说法。</b>',
      '---',
      '<b style="color:var(--c-gold)">第六节　学习的建议</b>',
      '<b>一、学什么</b>',
      '<b>按重要性排序</b>：',
      '<b>第一，基础</b>',
      '<b>阴阳五行</b>（第一章）',
      '<b>干支</b>（第二章、第三章）',
      '<b>生克冲合刑害破绝</b>（第三章）',
      '<b>第二，四位</b>',
      '<b>四象所属图</b>（第三章）',
      '<b>用神旺衰</b>（第四章、第五章）',
      '<b>第三，断课工具</b>',
      '<b>五动三动</b>（第六章）',
      '<b>神煞</b>（第七章）',
      '<b>格局</b>（第八章）',
      '<b>第四，实践</b>',
      '<b>按十步断课</b>（第九章）',
      '<b>大量练习</b>',
      '<b>二、怎么练</b>',
      '<b>几个建议</b>：',
      '<b>建议一：从自己的事开始</b>',
      '<b>先拿自己、家人、朋友的事练</b> ——<b>因为有反馈，能验证对错。</b>',
      '<b>建议二：从小事开始</b>',
      '<b>先断"今天会不会下雨""他会不会来"这类小事</b> ——<b>因为容易验证。</b>',
      '<b>建议三：记录与复盘</b>',
      '<b>每次断课都记下来</b> ——<b>事后对照，看哪里对、哪里错。</b>',
      '<b>建议四：不要怕错</b>',
      '<b>最大的障碍是"不敢断"。</b>',
      '<b>错了才能进步</b> ——<b>不敢断，永远学不会。</b>',
      '<b>建议五：反复看基础</b>',
      '<b>遇到卡住的时候</b> ——<b>回头看基础，多半问题就在那里。</b>',
      '<b>三、要避免的误区</b>',
      '<b>误区一：只背口诀</b>',
      '<b>口诀是至高的，但不是万能的。</b>',
      '<b>误区二：追求"高级技法"</b>',
      '<b>技法再多只是一种起课方法，断课才是真功夫才是硬道理。</b>',
      '<b>误区三：依赖软件</b>',
      '<b>神煞须死记硬背、勿依赖软件。</b>',
      '<b>误区四：只看不动手</b>',
      '<b>看一百个课例，不如自己断一个课。</b>',
      '<b>误区五：学完再断</b>',
      '<b>学三天就能断</b> ——<b>不要等"学完"。</b>',
      '<b>四、对课程安排的建议</b>',
      '<b>有一套学习路径</b>：',
      '<b>第一阶段：基础</b>',
      '<b>阴阳五行、干支、四位</b>',
      '<b>目标</b>：能起课、能看懂课式',
      '<b>第二阶段：断课工具</b>',
      '<b>用神旺衰、五动三动、神煞、格局</b>',
      '<b>目标</b>：能按十步走一遍',
      '<b>第三阶段：分门类</b>',
      '<b>求财、婚姻、求官、断病、出行……</b>',
      '<b>目标</b>：能针对具体问题断课',
      '<b>第四阶段：实践与提高</b>',
      '<b>大量实战、反复复盘</b>',
      '<b>目标</b>：能灵活应变',
      '---',
      '<b style="color:var(--c-gold)">本章小结</b>',
      '<b>一、这门学问是什么</b>',
      '<b>金口诀属于高层预测学</b>，像计算公式一样千变万化。',
      '<b>与八字的区别</b>：八字断整体命运，金口诀在<b>专事专断细节</b>方面见长。',
      '<b>金口诀出于兵法，集三式精华，古本只载五成。</b>',
      '<b>金口诀断环境 ≠ 风水</b> ——金口诀是五行体系，风水是八卦体系，不能混为一谈。',
      '<b>金口诀是模拟体系</b> ——"瞬间定位、全息分析"。',
      '<b>重克不重生</b> ——所以"快、准、狠"。',
      '<b>信息量有限，但能模拟万事万物</b> ——课内信息有限，思路无限。',
      '<b>二、学习的三个阶段</b>',
      '<b>"看得懂课例，却不知道断语从哪来"</b> ——因为没走过"推"的过程。',
      '<b>卡住的原因不是瓶颈，是基础不牢</b> ——「脚下没有根，你走不远」。',
      '<b>两类基础</b>：理论基础（干支生克）+ 行动基础（实际断课）。',
      '<b>最大的障碍是"不敢断"</b> ——实践不可省。',
      '<b>学习方法</b>：把干支"生活化、联想化"；类象为本；神煞须死记硬背；不要死套口诀。',
      '<b>三、五行义理来源于生活</b>',
      '<b>"道就是生活"</b> ——你理解了生活，就理解了五行。',
      '<b>从生活推演取象的三个层次</b>：从本性出发 → 延伸到性格 → 再延伸到具体事物。',
      '<b>类象随时代延伸，但性格不变</b> ——水主流动，古代是河水，现代是信息流。',
      '<b>四、断课的伦理与避讳</b>',
      '<b>学易先做人，德性第一。</b>',
      '<b>口德很关键</b> ——该说的说，不该说的留三分。',
      '<b>四个避讳</b>：涉及隐私要委婉、不断生死、劝合不劝离、不炫技。',
      '<b>对门派之争的态度</b>：以断准为准。',
      '<b>同道相敬</b> ——「不以技术高低论长短，更不要攻击诽谤」。',
      '<b>五、最高的境界</b>',
      '<b>善易者不卜</b> ——百姓日用而不知。',
      '<b>人不动神动</b> ——起课的最高境界是"心动之处为地分"。',
      '<b>最普通的就是最高级的</b> ——不在起课方法上做文章。',
      '<b>大道至简</b> ——大的道理变成简易，其实就是还原于生活。',
      '<b>六、学习的建议</b>',
      '<b>学什么</b>：基础 → 四位 → 断课工具 → 实践。',
      '<b>怎么练</b>：从自己的事开始、从小事开始、记录复盘、不要怕错、反复看基础。',
      '<b>五个误区</b>：只背口诀、追求高级技法、依赖软件、只看不动手、学完再断。',
      '---',
      '<b style="color:var(--c-gold)">心法</b>',
      '<b>学易先做人</b>',
      '<b>这一条放在最前面，也放在最后面。</b>',
      '<b>因为技术是工具，人心是根本。</b>',
      '<b>易学现在越来越受到大家的认可和欢迎。幸好我们选择了这门绝学。说直白点这也是一门技术。</b>',
      '<b>现在我们都在辛苦刻苦的学习，是为了以后服务大众，也为自己多一门技术手艺。</b>',
      '<b>学好她，以后将伴随你终生，走到哪里都受人尊敬，这是不争的事实。</b>',
      '<b>但</b>：',
      '<b>学易先做人，做人再做事。</b>',
      '<b>我们学易既是学理，不懂其道何来其理？</b>',
      '<b>学习五行既是学习道理——自己学不好这个理，怎么去给别人说理？</b>',
      '<b>基础不牢，走不远</b>',
      '<b>这是最实用的一条</b>：',
      '<b>万丈高楼平地起，没有扎实的基础，在以后的断课，无论是高级还是初级，都是感觉到那个时候就是我们常说的那句话——"书到用时方恨少"。</b>',
      '<b>基础的知识你没有掌握到，有些很多的东西，特别是一些很细节的东西，你运用不起来，你就断不出很详细的这个细节的东西。</b>',
      '<b>所以遇到"卡住"的时候</b>：',
      '<b>不要急着学新东西</b> ——<b>回头把基础再过一遍。</b>',
      '<b>多半问题就出在那里。</b>',
      '<b>道就是生活</b>',
      '<b>这是最有智慧的一条</b>：',
      '<b>五行的义理、干支的取象、神煞的吉凶</b> ——<b>说到底都是从生活里来的。</b>',
      '<b>所以</b>：',
      '<b>学易不能死记硬背。这个不是手艺活，不是千篇一律，要灵活多变才能创造奇迹，才会是一个好的易学研究者。</b>',
      '<b>你理解了生活，就理解了五行；你理解了五行，就能读懂课。</b>',
      '<b>这就是"大道至简"</b> ——<b>大的道理变成简易，其实就是还原于生活。</b>',
      '<b>善易者不卜</b>',
      '<b>这是最高的境界</b>：',
      '<b>不是"不用占卜"，而是"不需要占卜"。</b>',
      '<b>因为</b>：<b>你已经理解了事物的规律，看什么都能明白。</b>',
      '<b>就像医生看病</b> ——<b>学到极致，望一眼就知道问题所在，不需要做各种检查。</b>',
      '<b>这条路很长，但方向是明确的</b>：',
      '<b>从"背口诀"到"懂道理"，从"懂道理"到"看明白"。</b>',
      '<b>这就是学易的全程。</b>',
    ]},
    { t: '第十一章　分类断课（实战篇）', rows: [
      '<b style="color:var(--c-gold)">引言</b>',
      '<b>这一章讲什么</b>',
      '前面十章讲的是<b>通用方法</b> ——怎么起课、怎么分析。',
      '<b>这一章讲"分类实战"</b> ——针对具体门类，怎么断。',
      '<b>为什么分门类？</b>',
      '<b>因为不同的门类，关注的位置不同</b>：',
      '| 门类 | 主要看 |',
      '|---|---|',
      '| <b>求财</b> | <b>将神</b>（财爻） |',
      '| <b>求官/工作</b> | <b>贵神</b>（官爻） |',
      '| <b>婚姻</b> | <b>二神关系</b> + 桃花 |',
      '| <b>断病</b> | <b>四位对应人体</b> + 五行 |',
      '| <b>出行</b> | <b>驿马、天马</b> |',
      '| <b>官司</b> | <b>三刑、辰戌</b> |',
      '| <b>失盗</b> | <b>玄武、太冲</b> |',
      '<b>同样是财动</b> ——<b>问求财是吉，问求官是忌</b>。<b>所以必须先明确门类。</b>',
      '<b>这一章怎么用</b>',
      '<b>每个门类都讲三件事</b>：',
      '<b>条件</b> ——满足什么条件，这件事能成',
      '<b>忌神</b> ——最怕什么',
      '<b>断语</b> ——具体怎么说',
      '---',
      '<b style="color:var(--c-gold)">第一节　求财</b>',
      '<b>求财是问得最多的一类</b> —— <b>断法成体系、细节也多</b> —— <b>完整的推演放在第十二章第一节</b>。',
      '<b>这一节只做两件事</b>：<b>先给一张能立刻上手的速查表，再看两个课式。</b>',
      '<b>一、速查表</b>',
      '| 看什么 | 断什么 |',
      '|---|---|',
      '| <b>财动</b>（将神克贵神） | <b>必得财</b> —— 但要分旺动与休死空动 |',
      '| <b>财爻旺相</b> | 得财多、来得顺 |',
      '| <b>外生内</b>（贵神或人元生将神） | 有财可求 —— 谁生、隔几位，决定快慢 |',
      '| <b>青龙旺相</b> | 进财有力 |',
      '| <b>贼动</b>（贵神克将神） | <b>最怕</b> —— 外来索取、破财 |',
      '| <b>寅、卯受克</b> | <b>破财</b>，百用百验 —— 寅是第一财神，卯次之 |',
      '| <b>财动逢空</b> | 旺空还有机会、要等时机；只问此次则无财可求 |',
      '| <b>将神逢空休死而发动</b> | <b>不得反失</b> |',
      '| <b>二神俱空</b> | 空手套白狼 |',
      '| <b>地分受克</b> | 动老本 —— 妻动较轻、隔克次之、"财克财"必损、地分克将神是自耗 |',
      '<b>这张表给的是"结论"，不是"道理"</b> —— <b>每一条怎么推出来、在什么条件下成立、旺空与休空差在哪里，第十二章第一节一条一条拆开讲。</b>',
      '<b>两处配合着看</b>：<b>这一章给你"上手就能用"的框架，第十二章给你"往深里走"的体系。</b>',
      '<b>二、课式实证：一课两动，主次怎么分</b>',
      '<code>`</code>',
      '人元：丙　　火',
      '贵神：癸未（太常）用　土',
      '将神：子（神后）　水',
      '地分：申　　金',
      '<code>`</code>',
      '<b>这一课表面很简单，但里面有两个动</b> —— 正好用来说明"一动之外还有一动"。',
      '<b>先定用神</b>：四位是<b>丙（阳）、未（阴）、子（阳）、申（阳）</b> —— <b>三阳一阴，以阴为用</b>，阴在贵神，所以<b>用神是癸未</b>。',
      '<b>再看两个动</b>：',
      '<b>人元丙火克地分申金</b> → <b>妻动</b>。丙火在最上、申金在最下，中间隔着两位，是"<b>隔克</b>"。',
      '<b>贵神癸未土克将神子水</b> → <b>贼动</b>。',
      '<b>两处都是"外来克内、上克下"，但性质不同</b>：',
      '<b>妻动</b>是"我克者为妻财" —— <b>人元主动去克地分</b>，是<b>自主求财</b>、要出力去拿的象。',
      '<b>贼动</b>是"损财、被算计" —— <b>贵神克将神</b>，是<b>本钱受损</b>的象。',
      '<b>一处是"我去取"，一处是"被人拿"</b> —— 同在一课里，断事就要<b>分清主次</b>：',
      '<b>未土克子水</b>：<b>土克水，两位贴在一起，克得直接</b> —— 所以<b>内耗是当头的</b>。',
      '<b>丙火克申金</b>：<b>中间隔着两位，是隔克，克得慢</b> —— 所以<b>外来索取是渐进的</b>。',
      '<b>这里得出一条实规矩</b>：<b>近克快、远克慢</b>。同一个课里，<b>谁离得近、谁克得实，哪件事就先发生</b>。',
      '<b>至于这一课具体断什么、怎么断，要看求测者问的是什么</b> —— <b>课只提供关系，门类决定取象</b>。这一点在"断课前先圈定范围"那一章已经讲过。',
      '<b>三、课式实证：一个真实的求财课</b>',
      '<code>`</code>',
      '干支：丙申年　甲午月　庚午日　辛巳时',
      '月将：未　日空：戌、亥　四大空亡：水',
      '人元：壬　　水 + 旺',
      '贵神：戊寅（青龙）用　木 + 相　天德合、天喜、天马',
      '将神：甲申（传送）　金 + 休　驿马、六甲、飞廉',
      '地分：午　　火 + 死　吊客、截路',
      '<code>`</code>',
      '<b>问事</b>：一位女士求测事业财运。',
      '<b>先定旺衰</b>：四位是<b>水、木、金、火</b>，各占一位。克的关系是 <b>金克木、火克金、水克火</b> —— 这样一路克下来，<b>只有水不受克</b>（课内无土）—— 所以<b>水旺</b>。水旺则<b>木相</b>（水生木）、<b>金休</b>（生水者）、<b>土囚</b>（克水者）、<b>火死</b>（水克火）。',
      '标到四位上：人元壬水<b>旺</b>、贵神寅木<b>相</b>、将神申金<b>休</b>、地分午火<b>死</b>。',
      '<b>用神在贵神戊寅</b>（四位壬阳、寅阳、申阳、午阳 —— <b>四位全阳，是纯阳课，纯阳以神为用</b>）。',
      '<b>把"求财四条件"逐条对一遍</b>：',
      '<b>财动</b> —— 这一课是<b>地分午火克将神申金</b>，属于"<b>地分克将神</b>"（自我消耗），<b>不是财动</b> ✗',
      '<b>财爻旺相</b> —— <b>财爻是将神申金，正处"休"地</b> ✗',
      '<b>外生内</b> —— <b>人元壬水与将神申金之间隔着贵神</b>，<b>金生水虽是顺的，但中间隔了一层</b> —— 只算半分',
      '<b>青龙旺相</b> —— <b>贵神戊寅正是青龙，处在"相"地</b> ✓ 这是全课最好的一个信号',
      '<b>四条里只占了一条半</b> —— 所以这一课的基调就是"<b>难</b>"。',
      '<b>再看断语是怎么出来的</b>：',
      '<b>"你的工作看上去规模不小，实则危机重重。"</b>',
      '<b>依据</b>：<b>课内四行齐全</b>（水、木、金、火各一）—— <b>看起来什么都不缺</b>；<b>但四行一路相克、互相耗着</b> —— 所以断"<b>看着大、实则危</b>"。',
      '<b>"资金方面运转困难，里外讨债的地方很多。"</b>',
      '<b>依据</b>：<b>将神申金是财爻，在"休"地</b>，<b>又被地分午火克</b> —— 这是<b>"地分克将神"</b>：<b>主"为房子、孩子花钱，属自我消耗"</b> —— <b>钱是在自己内部耗掉的</b>，不是外人来抢。再<b>加上取财要过贵神这一道手</b>（隔位），所以"里外都紧"。',
      '<b>"从 2013 年癸巳年就已经很大危机了。"</b>',
      '<b>依据</b>：<b>2013 是癸巳年</b> —— <b>巳与课内的申</b>：<b>巳申既合又刑</b>（合是牵绊、刑是伤害）—— 所以断"<b>从那一年起就出问题</b>"。',
      '<b>"经营的产品与投资有冲突，内部管理不到位。"</b>',
      '<b>依据</b>：<b>地分午火克将神申金</b> —— <b>火克金 ＝ 投资方向与产品相冲</b>；<b>内部管理</b>看<b>贵神寅木与将神申金相冲</b>（寅申冲）—— <b>内部对冲、上下不一条心</b>。',
      '<b>神煞也帮了忙</b>：',
      '<b>贵神青龙带天德合、天喜、天马</b> —— 三个吉神都在贵神上：<b>有贵人、有喜气，而且是"要动"的</b>（天马）；',
      '<b>将神申金带飞廉</b> —— <b>飞廉主"快、有非常之惊"</b>，落在财爻上，主<b>财上有突发之事</b>；',
      '<b>地分午火带吊客、截路</b> —— <b>吊客主忧患、截路主阻滞</b>，都落在"最内"这一位。',
      '<b>所以整课的断语是</b>：',
      '<b>看着摊子不小，实则内外都在耗</b> —— <b>财源本身弱（将神休）、又被地分所克（内部消耗）、取财还要过贵神这一道手</b>，所以是"里外都紧"的局面。',
      '<b>好在青龙带三吉神</b> —— <b>还有贵人可托，也还有动的余地</b>。',
      '<b>这一课的价值，在于它把"求财四条件"完整演示了一遍</b> —— <b>四条里占一条半，断出来就是"难"</b>。<b>条件够不够，一看就知道基调。</b>',
      '<b style="color:var(--c-gold)">第二节　求官与工作</b>',
      '<b>求官的问法比求财更杂</b> —— <b>问能不能升、问职位高低、问能不能调动、问求职顺不顺，看的地方各不相同</b> —— <b>完整的体系在第十二章第二节（求官）与第三节（工作与求职）</b>。',
      '<b>这一节同样只做两件事。</b>',
      '<b>一、速查表</b>',
      '| 看什么 | 断什么 |',
      '|---|---|',
      '| <b>官动</b>（贵神克人元） | 利求官；<b>无官之人逢官动，主诉讼缠身</b> |',
      '| <b>贵神官爻旺相</b> | 官位稳、能升 |',
      '| <b>鬼动</b>（地分克人元） | 外出求官 |',
      '| <b>将神生贵神</b> | 以财升官 |',
      '| <b>外生内</b> | 上有提拔 |',
      '| <b>驿马、天马</b> | 升职快 |',
      '| <b>父母动</b> | 有文书之喜 |',
      '| <b>官动逢空</b> | 空欢喜一场；旺空还有机会，要等时机 |',
      '| <b>斩官</b>（人元克贵神） | <b>最不利</b> —— 别说升官，能否保住原有职位都成问题 |',
      '| <b>青龙、朱雀、贵人</b> | 三个最利求官的贵神；申为武官，见火为军人 |',
      '<b>官职大小的判定、八种求官方式、求官歌与十三条、求职与工作变动</b> —— <b>见第十二章第二、三节。</b>',
      '<b>二、课式实证：断职位几把手</b>',
      '<code>`</code>',
      '干支：戊子年　辛酉月　己卯日　辛未时',
      '月将：辰　日空：申、酉　四大空亡：无',
      '人元：癸　　水 - 旺',
      '贵神：甲子（玄武）　水 + 旺　六甲',
      '将神：庚午（胜光）用　火 + 死　月德',
      '地分：酉　　金 - 休　截路',
      '<code>`</code>',
      '<b>问事</b>：她老公的职位。',
      '<b>第一步，定旺衰</b>：四位是<b>水、水、火、金</b>。<b>水占两位</b>，而能克水的<b>土，课内没有</b> —— 所以<b>水旺</b>。水旺则<b>木相</b>（水生木）、<b>金休</b>（生水者）、<b>土囚</b>（克水者）、<b>火死</b>（水克火）。',
      '<b>第二步，定用神</b>：四位是<b>癸（阴）、子（阳）、午（阳）、酉（阴）</b> —— <b>二阴二阳，以将为用</b>，所以<b>用神是将神庚午</b>。',
      '<b>第三步，看用神的状态</b>：<b>用神庚午火落在"死"地</b> —— <b>官爻处死，官就不大</b>。',
      '<b>第四步，看"哪一位是官"</b>：<b>贵神代表工作、职位</b>。这一课<b>贵神甲子水正当旺</b> —— 是"有力量、在位置上"的象；<b>但职位的高低，要看官爻的旺衰</b>，而官爻（午火）正死。',
      '<b>第五步，合起来断"几把手"</b>：',
      '<b>贵神旺</b>说明他<b>确实在管事的位置上</b>；<b>用神死</b>说明<b>这个位置不高、不是正职</b>。',
      '<b>所以断"是个有管理权的小头目或老板，应该是四把手"</b> —— 反馈：<b>是个建筑包工头</b>，与"有管理权的小头目"正相符。',
      '<b>神煞上还有两层</b>：',
      '<b>贵神甲子带六甲</b> —— 六甲主"开始、生发"，与"包工头揽活开工"的象相合；',
      '<b>将神庚午带月德</b>（吉神，主有贵人）、<b>地分酉带截路</b>（截路空亡，主中途有阻滞）。',
      '<b>这一课的教益</b>：<b>断职位高低，不能只看贵神旺不旺，还要看官爻的死活。</b> 贵神旺是"在这个位置上"，用神死是"位置不高" —— <b>两者合看，才断得出"几把手"。</b>',
      '<b style="color:var(--c-gold)">第三节　婚姻</b>',
      '<b>一、占婚歌诀（总纲）</b>',
      '<b>婚姻这一门有一首歌诀，是全章的总纲</b> —— 把上下内外、三个阶段、贼动、无恩之刑、妻动鬼动、分局、玄武太阴、腾蛇太乙，全都串在了一起：',
      '<b>金口占婚有何难，上下内外仔细辨。</b>',
      '<b>上为他来下是我，何分地分与天干。</b>',
      '<b>天干是他神是我，神若是他将内看，</b>',
      '<b>地分前友干为新，生旺相合不徒然。</b>',
      '<b>刑冲克害事不吉，遇到贼动苦难言。</b>',
      '<b>无恩之刑要分散，临空带马分两边。</b>',
      '<b>妻动必定人嫌我，鬼动我有心不甘。</b>',
      '<b>无论生合有多喜，最怕分局生两边。</b>',
      '<b>玄武太阴喜相逢，隐私暧昧在里面，</b>',
      '<b>腾蛇太乙轻薄相，淫欲奸私更善言。</b>',
      '<b>分清内外不分他，门外之人莫外传。</b>',
      '<b>逐句讲清楚</b>：',
      '<b>"上下内外仔细辨"</b> —— 断婚姻第一件事是<b>分清上下内外</b>：<b>上为外、下为内</b>；<b>人元代表对方，贵神代表自己</b>。',
      '<b>"上为他来下是我，何分地分与天干"</b> —— <b>上（人元）是"他"，下（贵神）是"我"</b>。<b>不要死分天干地支</b>，要看向人元（天干）究竟落在什么位置。',
      '<b>"天干是他神是我，神若是他将内看"</b> —— 天干代表对方，贵神代表自己；<b>如果贵神与将神发生关系，就要往"内"看</b> —— 那是<b>婚后</b>的事。',
      '<b>"地分前友干为新"</b> —— <b>地分是"前任"，天干是"新交"</b> —— 这一句讲的是<b>新旧关系怎么分</b>。',
      '<b>"生旺相合不徒然"</b> —— 两边<b>相生、旺相、相合</b>，这事就<b>不是空谈</b>，是有实的。',
      '<b>"刑冲克害事不吉，遇到贼动苦难言"</b> —— 一旦出现<b>刑、冲、克、害</b>，事情就不吉；<b>遇上贼动更是有苦难言</b>（贼动主外情、主暗中被人拿走）。',
      '<b>"无恩之刑要分散，临空带马分两边"</b> —— <b>二神之间既刑又冲、又克又害，再带驿马，又有一方逢空</b> —— 那就是<b>分居</b>的局面，婚姻<b>名存实亡</b>。',
      '<b>"妻动必定人嫌我，鬼动我有心不甘"</b> —— 这两句<b>专讲婚后</b>：',
      '<b>妻动（人元克地分）</b> —— <b>对方嫌弃我</b>。',
      '<b>鬼动（地分克人元）</b> —— <b>是我嫌弃对方，心里不甘</b>。',
      '<b>"无论生合有多喜，最怕分局生两边"</b> —— <b>课内关系再好，只要出现"分局"（相生或相克分作两边），大格局就已经定了</b>。就像牛郎织女往中间跑，<b>桥终有一天会从中间裂开，"各人分各人的"</b>。<b>大格局决定最后的成败</b>。',
      '<b>"玄武太阴喜相逢，隐私暧昧在里面"</b> —— <b>玄武、太阴入课</b>，主<b>隐私、暧昧</b>藏在里面。<b>太阴入课，多主婚姻之外有暗昧之事</b>。',
      '<b>"腾蛇太乙轻薄相，淫欲奸私更善言"</b> —— <b>腾蛇、太乙入课</b>，主<b>轻薄之相</b>，多主<b>淫欲、奸私</b>，而且<b>能说会道</b>。',
      '<b>"分清内外不分他，门外之人莫外传"</b> —— <b>断婚姻要分清内外，但不分彼此</b>；<b>别人家的事，不要往外说</b>。这一句讲的是<b>断课的职业道德</b>。',
      '---',
      '<b>二、婚姻常用断法（十八条）</b>',
      '<b>这十八条是归纳出来的断婚条文，可以拿来"贴"（对照使用）</b>。<b>但先记住一句话</b>：',
      '<b>这些都是表面意义的东西，实际还要根据课体做具体分析 —— 不是每一条都适用，要随机应变。</b>',
      '<b>①</b> 凡测婚，<b>用爻为六合、太常、青龙、天后</b>，又在<b>旺相之地</b>，必然顺利。',
      '<b>②</b> <b>见合但又逢空亡</b>，主<b>二人已非一条心</b>（贵神或将神有一位逢空便是）。',
      '<b>③</b> <b>定找恋爱对象的方向</b> —— 以<b>用爻的干合处</b>取：遁到相合的天干上，看这个天干落在哪个地支，<b>那个地支的方位就是对象的方位</b>。',
      '<b>④</b> <b>逢妻动</b>，主婚姻难成，对方对我有意见。',
      '<b>⑤</b> <b>已婚夫妻要看贵神与将神</b>：相合则感情融洽，相冲相克则感情破裂、甚至离婚；二神地支虽冲克害，但<b>天干相合</b>，还不至于离；<b>干克神主婚姻前期不顺，神克将主婚后不顺，将克方主婚姻后期不顺</b>。',
      '<b>⑥</b> <b>太阴入课</b>，主婚姻之外必有暗昧之事。',
      '<b>⑦</b> <b>用爻逢冲、逢空、休囚</b>，主婚多不成，或<b>临成而败</b>。',
      '<b>⑧</b> <b>课内土多且旺</b>，主<b>晚婚</b>。',
      '<b>⑨</b> <b>课中水旺或火旺</b>，主<b>未婚同居</b>（水主淫，火主烈）。',
      '<b>⑩</b> <b>见鬼动</b>，主婚后有不测；也主<b>与外地人成家、或异地安家</b>。',
      '<b>⑪</b> <b>课中见三刑六害</b>，主婚姻不顺、感情不好。',
      '<b>⑫</b> <b>课中见卯戌合</b>，主未婚同居，又主双方有矛盾、不能长久。',
      '<b>⑬</b> <b>课中出现二马（驿马、天马）</b>，大多是<b>分居、感情冷淡</b>；<b>逢贼动</b>，则主<b>第三者插足</b>。',
      '<b>⑭</b> <b>课中见三奇</b>，主<b>一见钟情</b>，巧遇成家，也主有人介绍机遇。',
      '<b>⑮</b> <b>男占纯阴不留妻</b>，婚姻不顺；<b>女占纯阳不留其夫</b>。',
      '<b>⑯</b> <b>课中见天后（亥）、六合（卯）、太常（未）旺相逢生合</b>，婚姻美满；<b>但休囚遇克，婚姻难成</b>。',
      '<b>⑰</b> <b>课中遇合，或见天德、月德</b>，主婚姻美满。',
      '<b>怎么用这十八条？</b> <b>先"贴"一遍</b> —— 看课里对上了哪几条；<b>对上之后，再回到课体本身去验证</b>。',
      '<b>"贴"是找线索，不是下结论。</b> 十八条规定的是"常见的样子"，而<b>真正断得准，还得看这个课的旺衰、动不动、格局如何</b>。',
      '<b>三、三种断法</b>',
      '<b>3.1 古法：人元为男、地分为女</b>',
      '<b>金口诀传统方法中，如果是已婚断婚姻的话，一般总体指人元为男、地分为女。</b>',
      '<b>人元克地分是男嫌弃女方；鬼动是女嫌弃男方。</b>',
      '<b>如果未婚还没有进入到此阶段，可以用，但准确率不高。因为未婚不存在妻动之说。</b>',
      '<b>3.2 三段分法（更实用）</b>',
      '<b>用"人元与贵神（婚前恋爱）→ 贵神与将神（婚后）→ 将神与地分（婚后晚期）"三段分法，替代古法。</b>',
      '<b>即</b>：',
      '| 阶段 | 看哪两位 |',
      '|---|---|',
      '| <b>婚前恋爱</b> | <b>人元与贵神</b> |',
      '| <b>婚后</b> | <b>贵神与将神</b> |',
      '| <b>婚后晚期</b> | <b>将神与地分</b> |',
      '<b>3.3 三条核心心法</b>',
      '<b>1. 问婚姻最怕见贼动，最怕分局相生。贼动有外情第三者插足，分局相生同床异梦。</b>',
      '<b>2. 遇到几个条件需要注意：冲则变，绝则散，刑则斗，破则夫妻异心。这都是断婚姻的心法窍门。</b>',
      '<b>3. 二神冲绝而不散时，这时要再注意二神的天干是否相合。</b>',
      '<b>关于第三条</b>：',
      '<b>这就是因为二神还有干合象关联。干为外，在外界看来夫妻关系还很完整。</b>',
      '<b>地支关系是主内的，天干是主外的。天干是外表、地支是内里是内心思想。俗话说"打断骨头连着筋"，天干就是筋。</b>',
      '<b>五合的性质决定"筋"的韧度</b>：',
      '<b>甲己合化土</b> ——<b>中正之合</b>，重信讲义',
      '<b>乙庚合化金</b> ——<b>仁义之合</b>，重情重义',
      '<b>丙辛合化水</b> ——<b>威严之合</b>，诚心诚意',
      '<b>丁壬合化木</b> ——<b>淫欲之合</b>，贪欲敷衍',
      '<b>戊癸合化火</b> ——<b>无情之合</b>，老少合或不长久',
      '<b>但这并不是说好的五合绝对不会分离。如果遇到五合被冲的年月，而地支关系没变，还是只能保暂时的稳定，因为凡事没有绝对性。</b>',
      '<b>四、空亡在婚姻中</b>',
      '<b>比如婚后出现一方空亡时，如果没有出现克害刑冲等不良关系，代表婚姻虚假，或者在逢驿马时，夫妻分居或者另一方不在家。</b>',
      '<b>如果出现不良关系，则是婚姻有名无实。</b>',
      '<b>未婚逢空，常指没有对象或心理幻想感情婚姻。</b>',
      '<b>五、断婚姻的条件与性质</b>',
      '<b>断婚姻的条件</b>：',
      '<b>1. 是男女婚姻。2. 同性恋。3. 年龄大小关系。4. 方位关系。5. 六合、三合、奇合关系。</b>',
      '<b>这个合与用神和属相为主。</b>',
      '<b>婚姻的性质</b>：',
      '<b>1. 婚前。2. 结婚。3. 婚后。三个阶段。</b>',
      '<b>还有种是终身不娶不嫁的性质、多次婚姻、桃花缘、桃花劫。</b>',
      '<b>几个实用断语</b>：',
      '<b>土多土旺</b> ——<b>一般主婚姻晚</b>',
      '<b>课中出现二马</b> ——<b>大多是分居，感情冷淡</b>',
      '<b>逢贼动</b> ——<b>第三者插足</b>',
      '<b>课中见三奇</b> ——<b>主一见钟情，巧遇成家</b>',
      '<b>六、桃花与感情</b>',
      '<b>桃花运与桃花劫</b>：',
      '<b>桃花运我们都知道，但什么是桃花劫？劫就是停滞，桃花被剥夺了，这样一般指受冲、受克、受刑。</b>',
      '<b>比如酉子为桃花运，子卯为桃花劫，子午未桃花劫。这还算没有结果的桃花。</b>',
      '<b>号外桃花巳火</b>：',
      '<b>凡是克内见桃花，问感情会有桃花事。特别是克内出现酉金，此谓桃花淫神。</b>',
      '<b>巳火虽然没有排进四大桃花，但也是淫欲惊恐的代名词。巳火见桃花必定有感情纠纷。</b>',
      '<b>比如：巳见酉为"金局淫滥之合"；巳见子为绝，感情分离有纠纷；见卯更是阴见阴，还有同性恋的成分（卯生巳为烟，没有光亮见不得人，都是虚无的状态，很符合同性恋的意义）；巳见午为天罗，阴阳火纠缠不清，最终不会有结果。</b>',
      '<b>所以我们把巳火列为号外桃花。</b>',
      '<b>七、现代婚姻分析的扩展</b>',
      '<b>古法承认按老规矩难以应对现代婚姻</b>，列出需回答的问题：',
      '<b>感情先后主次关系，谁先追求的谁，有无第三者，哪个是初恋，前男友前女友，前夫前妻等，对方心态，发展趋势，吉凶成败。</b>',
      '<b>具体如：感情能否成功，对方对我什么想法，有无第三者，是否是正缘，什么时间结婚，什么时间生子，头胎生的孩子性别，能有几个孩子，对方工作能力，经济状况，家庭背景，家庭成员，结婚的家庭关系，公婆关系，夫妻关系，谁在家当家做主，有没有离婚可能，如果有的话会是几次婚姻，再婚是什么时间，再婚对方是否离异，是否带孩子，男孩女孩，与前期有无联系。</b>',
      '<b>以及同性恋感情问题怎么分析。</b>',
      '<b>这些问题的答案，要靠三段分法 + 桃花 + 空亡 + 贼动等综合判断。</b>',
      '---',
      '<b>八、课式实证：婚姻课怎么在二神上分对方</b>',
      '<code>`</code>',
      '人元：己　　土',
      '贵神：丁卯　木',
      '将神：乙丑（大吉）用　土',
      '地分：巳　　火',
      '<code>`</code>',
      '<b>这是断婚姻的课。断婚姻有一条死规矩</b>：',
      '<b>分你我的时候，必须落在二神上。</b> 求测方在将神，对方就是贵神；求测方在贵神，对方就是将神。',
      '这一课<b>用神乙丑在将神</b>，所以<b>求测方是将神乙丑土，对方是贵神丁卯木</b>。',
      '<b>先看最重要的一层：贵神丁卯木，一木克二土。</b>',
      '<b>克人元己土</b> → <b>官动</b>（贵神克人元为官动）',
      '<b>克将神乙丑土</b> → <b>贼动</b>（贵神克将神为贼动）',
      '<b>两个动都落在对方（贵神）身上。</b> 这说明<b>对方的性质就是"又压你、又拿你的"</b> —— 官动是压你一头、爱挑剔；贼动是暗里拿你的。',
      '<b>分对方能断出两条很具体的象</b>：',
      '<b>桃花重</b>：贼动本身主暗中来往、主外情。丁卯木<b>本身旺</b>，上下克土、旺而不安分。<b>卯木又正是桃花</b>。贼动落在桃花上，<b>主对方感情上不专一</b>。',
      '<b>经济观念强（小气）</b>：贼动是"<b>旺里克的</b>" —— 卯木旺、丑土死，旺克死、克得毫无还手之力。凡旺里克的贼动，断人<b>爱占小便宜</b>，把钱看得极重。<b>贼动的本性就是"不愿意拿钱"</b>。',
      '<b>再看自己这一头（将神乙丑）</b>：<b>用神乙丑处于死空的状态</b>。死是力量不足，空是落不到实处 —— 断<b>自身矛盾、心里没底、使不上劲</b>。',
      '<b>地分巳火生人元己土</b>（火生土），这是<b>父母动</b>，说明<b>下面是有来源、有依靠的</b>。可是中间<b>隔着一个丑土挡着</b>——丑是湿土，能晦火，<b>巳火的这份生递不上去</b>。断事就是：<b>有心帮，帮不上</b>。',
      '<b>最后看格局</b>：课内有<b>巳、丑</b>，加上日建来的<b>酉</b>，凑成<b>巳酉丑金局</b>。金局一成，<b>反过来克卯木</b>。原本卯木克二土，等金局合起来，<b>情势翻转</b>。',
      '<b>这就是婚姻课断到后面的关键</b>：对方虽然一直占着上风（官动 + 贼动），<b>但只要课内有成局的条件，局势就会倒过来</b>。金局克木，<b>是这份关系最终走向了结的凭据</b>。',
      '<b>这一课的断法顺序就是全章的总法</b>：',
      '<b>先分你我</b>（用神在将神 → 对方在贵神）',
      '<b>再看二神之间</b>（一木克二土 → 官动 + 贼动）',
      '<b>然后定性质</b>（桃花、小气、死空）',
      '<b>最后看格局定成败</b>（巳酉丑金局反克卯木）',
      '<b>九、课式实证（二）：财动与妻动并见</b>',
      '<code>`</code>',
      '干支：乙未年　乙酉月　丙申日　乙未时',
      '月将：辰　日空：辰、巳　四大空亡：水',
      '人元：丁　　火 - 旺　六丁',
      '贵神：丁酉（太阴）　金 - 死　丧门、六丁',
      '将神：甲午（胜光）用　火 + 旺　病符、六甲',
      '地分：酉　　金 - 死　丧门',
      '<code>`</code>',
      '<b>问事</b>：一位在读大学的女学生求测感情婚姻。',
      '<b>先定旺衰</b>：四位是<b>火、金、火、金</b>。<b>火克金</b> —— 所以<b>金受克</b>；<b>火不受克</b>（课内无水）—— 唯一的候选就是<b>火</b>，所以<b>火旺</b>。火旺则<b>土相</b>、<b>木休</b>、<b>水囚</b>、<b>金死</b>（火克金）。',
      '标到四位上：人元丁火<b>旺</b>、贵神酉金<b>死</b>、将神午火<b>旺</b>、地分酉金<b>死</b>。',
      '<b>看这一课的两个动</b>：',
      '<b>将神甲午火克贵神丁酉金</b> —— 火克金 —— <b>将神克贵神</b>，这是<b>财动</b>；',
      '<b>人元丁火克地分酉金</b> —— 火克金 —— <b>人元克地分</b>，这是<b>妻动</b>。',
      '<b>两个动都是"火克金"</b> —— <b>课内的火全在克金</b>；而且<b>火旺、金死</b> —— <b>旺克死，克得毫无还手之力</b>。',
      '<b>断感情怎么断？</b>',
      '<b>妻动</b>在婚姻里的意思是"<b>人嫌我</b>"（人元克地分，我往外克）—— 主<b>一方嫌弃另一方</b>；',
      '<b>财动</b>是"<b>将神克贵神</b>" —— <b>内克外</b> —— 在婚姻里是<b>自己（将神）去克对方（贵神）</b>。',
      '<b>两个动一起，加上"火旺克金死"</b> —— <b>断"当事人比较强势，感情上她占上风"</b> ✓ 这一课的断语里正有"<b>你比较强势</b>"。',
      '<b>再看感情"杂"从哪里来</b>：<b>课内两个火、两个金</b> —— <b>同类多，主"不止一个"</b>：',
      '<b>两个金</b>（贵神酉、地分酉）—— 主<b>追求者不止一个</b> ✓',
      '<b>两个火</b>（人元丁、将神午）—— 主<b>自己也是多情、心不在一个人身上</b> ✓',
      '<b>这一课头两条断语正是这个</b>："你不缺异性朋友，感情较乱"、"你对感情有些分心"。',
      '<b>神煞上</b>：<b>贵神与地分都带丧门</b> —— <b>丧门两见</b>，主<b>感情上有忧患</b>；<b>将神带病符</b> —— 主<b>这段感情"有毛病"</b>；<b>人元与贵神都带六丁</b> —— 六丁偏凶，主<b>心里烦扰、不安</b>。',
      '<b>这一课的教益是"同类多"</b>：',
      '<b>课内同一五行出现两次以上，往往主"不止一个"</b> —— <b>两个金是追求者多，两个火是自己心思多。</b>',
      '<b>这一条在断感情、断合作时都用得上。</b>',
      '<b>十、课式实证（三）：官动逢空、天喜吊客同宫</b>',
      '<code>`</code>',
      '干支：乙未年　乙酉月　丁酉日　丙午时',
      '月将：辰　日空：辰、巳　四大空亡：水',
      '人元：庚　　金 + 相　月德',
      '贵神：乙巳（腾蛇）用　火 - 休　月德合、天喜、吊客',
      '将神：庚戌（河魁）　土 + 旺　月德',
      '地分：子　　水 + 死',
      '<code>`</code>',
      '<b>问事</b>：一位女士求测婚姻。',
      '<b>先定旺衰</b>：四位是<b>金、火、土、水</b>，各占一位。克的关系是 <b>火克金、土克水、水克火</b> —— 一路克下来，<b>只有土不受克</b>（课内无木）—— 所以<b>土旺</b>。土旺则<b>金相</b>（土生金）、<b>火休</b>（生土者）、<b>木囚</b>（克土者）、<b>水死</b>（土克水）。',
      '标到四位上：人元庚金<b>相</b>、贵神巳火<b>休</b>、将神戌土<b>旺</b>、地分子水<b>死</b>。',
      '<b>用神在贵神乙巳</b>（四位庚阳、巳阴、戌阳、子阳 —— 三阳一阴，以阴为用）。',
      '<b>第一件事：土旺。</b>',
      '<b>"课内土多且旺，主晚婚。"</b>',
      '这一课<b>土旺</b>（将神戌土正当旺地）—— 所以<b>断晚婚</b> ✓ 这一课正有"<b>土旺婚姻晚</b>"这一条。',
      '<b>第二件事：官动。</b>',
      '<b>贵神乙巳火克人元庚金</b>（火克金）—— <b>贵神克人元</b>，这是<b>官动</b>。',
      '<b>官动在婚姻里</b>，主<b>"对方"这一边有动静</b>（贵神代表对方）；<b>但这一课的贵神正逢日空</b>（日空辰、巳）：',
      '<b>官动逢空</b> —— 主<b>"对方没有表示，或者这份心思落不到实处"</b> ✓',
      '<b>这一课的头两条断语正对得上</b>："你心里有喜欢的对象"、"这个人对你没有什么表示，你心里也没信心"。',
      '<b>第三件事：神煞。</b>',
      '<b>贵神乙巳上带着三个煞</b>：',
      '<b>月德合</b>（吉）、<b>天喜</b>（吉）—— 主<b>有喜气、有和合的机缘</b>；',
      '<b>吊客</b>（凶）—— 主<b>忧患、孤单</b>。',
      '<b>一吉一凶同宫</b> —— 所以这一课的感情是<b>"有希望、但眼下孤单"</b>：<b>天喜说明婚姻是有机会的</b>（这一课断"<b>明年有机会</b>"），<b>吊客说明当下一片冷清</b>。',
      '<b>再看"与佛道有缘"从哪里断</b>：<b>将神戌土旺</b> —— 而<b>土旺之人多与佛道有缘</b>（土主厚重、主静定）。<b>这一课进一步断出"家里有供奉""挂画的位置太高"</b> —— 那是从<b>戌土（香火、供奉之位）与课内其他位的生克</b>上继续取的象。',
      '<b>这一课的教益，是"一吉一凶同宫"怎么断</b>：',
      '<b>吉神与凶煞落在同一位上时，不能笼统说"又吉又凶"，而要分清"哪个管将来、哪个管眼下"</b>：',
      '<b>天喜主"机缘是有的"（将来），吊客主"眼下冷清"（现在）。</b>',
      '<b>十一、课式实证（四）：三土一金、兄弟动</b>',
      '<code>`</code>',
      '干支：辛卯年　壬辰月　辛丑日　戊戌时',
      '月将：酉　日空：辰、巳　四大空亡：水',
      '人元：戊　　土 + 旺',
      '贵神：乙未（太常）　土 - 旺',
      '将神：丁酉（从魁）用　金 - 相　天德合、月德合、丧车、六丁',
      '地分：戌　　土 + 旺　天马',
      '<code>`</code>',
      '<b>问事</b>：一位女网友求测感情（男友是初恋）。',
      '<b>先定旺衰</b>：四位是<b>土、土、金、土</b> —— <b>土占三位</b>，而<b>克土的木课内没有</b> —— 所以<b>土旺</b>。土旺则<b>金相</b>（土生金）、<b>火休</b>（生土者）、<b>木囚</b>（克土者）、<b>水死</b>（土克水）。',
      '标到四位上：人元戊土<b>旺</b>、贵神未土<b>旺</b>、将神酉金<b>相</b>、地分戌土<b>旺</b>。',
      '<b>第一件事：土旺。</b>',
      '<b>"课内土多且旺，主晚婚。"</b>',
      '<b>三土并见、土旺</b> —— 所以<b>婚姻迟</b> ✓ 与前面那个婚姻课的道理一样。',
      '<b>第二件事：兄弟动。</b>',
      '<b>人元戊土与地分戌土同为土</b> —— 这是<b>兄弟动</b>。',
      '<b>兄弟动在感情里主"同类多、有竞争"</b> —— 而这一课问的正是感情 —— 所以断<b>"身边异性不少、追求你的人很多"</b> ✓ 这一课头两条正是这个。',
      '<b>第三件事：心思在哪里。</b>',
      '<b>用神在将神丁酉金</b>（四位戊阳、未阴、酉阴、戌阳 —— 二阴二阳，以将为用）。',
      '<b>将神酉金在"相"地</b>，而且<b>带天德合、月德合</b> —— <b>两德齐现</b>，主<b>这个人有福气、人缘好</b>；<b>酉金又主"说、主口才"</b> —— 所以断<b>"清高善谈"</b> ✓',
      '<b>而"心思不在身边人身上"从哪里断？</b>',
      '<b>将神酉金与地分戌土 —— 酉戌相害</b>。<b>同类（三土）之中掺了一个不同性质的（酉金），而且与土相害</b> —— 主<b>"身边的人虽多，却都对不上眼"</b> ✓',
      '<b>再看地分带天马</b> —— <b>天马主远行</b> —— 落在<b>最内这一位</b>，主<b>"本人要往外走"</b> —— 所以断<b>"有出门打算、去外地会朋友"</b> ✓',
      '<b>这一课的教益是"三土一金"这个格局</b>：',
      '<b>土多主"迟、稳"</b> —— 用在感情上就是<b>迟婚</b>；',
      '<b>而其中那一位金（用神）带双德、又与土相害</b> —— 主<b>"本人条件好、人缘好，但心思在外面"</b>。',
      '<b>一个格局，两层意思，合起来才是完整的断语。</b>',
      '<b style="color:var(--c-gold)">第四节　断病</b>',
      '<b>一、总法</b>',
      '<b>占病需把上下分，干头将腹腔贵神。地分腿脚细分明，五脏六腑在四神。</b>',
      '<b>即</b>：',
      '| 位置 | 人体部位 |',
      '|---|---|',
      '| <b>人元</b> | <b>头面</b> |',
      '| <b>贵神</b> | <b>胸</b> |',
      '| <b>将神</b> | <b>腹</b> |',
      '| <b>地分</b> | <b>腿脚</b> |',
      '<b>五脏六腑的对应</b>：',
      '<b>甲肝乙胆丙小肠，丁心戊胃己脾乡，庚为大肠辛主肺，壬为膀胱癸肾藏。</b>',
      '<b>甲背庚腰乙辛肋，戊肚己脐丙丁肩，壬为腹部癸为足，十干人体藏脑中。</b>',
      '<b>二、旺衰断虚实</b>',
      '<b>断病情，旺为实病，衰为虚病，实症为阳，虚症为阴。</b>',
      '<b>三、年龄定喜忌（反常规规定）</b>',
      '<b>老人所得休囚动，年少由来旺气生。幼小克冲胎气死，关隔空亡便要精。</b>',
      '<b>古法解</b>：',
      '<b>要分清是什么年纪的人来求测，以课内干支旺相休囚再进一步判断吉凶。特别是在断病时，老人临用休囚时为好，年轻人喜旺相。</b>',
      '<b>为什么反常规？</b>',
      '<b>老人</b> ——<b>身体本就趋于衰退，用神休囚是"顺其自然"，反而无碍</b>',
      '<b>年轻人</b> ——<b>应该生机旺盛，用神休囚说明身体不好</b>',
      '<b>四、五动问病</b>',
      '| 动 | 病灶 |',
      '|---|---|',
      '| <b>官动</b> | <b>问病在咽喉</b>（也有说在头部） |',
      '| <b>贼动</b> | <b>病恐亦非轻</b> ——将神主腹部，上克下腹部受损 |',
      '| <b>财动</b> | <b>疾病忧难愈</b> ——贵神受克，病在胸，不易治愈。又主忧愁在身 |',
      '| <b>鬼动</b> | <b>鬼动忧灾怪</b> ——占病常有阴性病症，或家中不宁忧愁 |',
      '<b>鬼动的解法</b>：',
      '<b>痊病物仰合。方克干，方为医生、干为病，医生克制病症能治愈。</b>',
      '<b>五、土旺与肿瘤</b>',
      '<b>占病，辰戌土临用，多有恶性肿瘤之患。再见火则会感染。</b>',
      '<b>土过旺也是病。土过旺为硬，一般指肿瘤；见火主感染扩散病情恶化。</b>',
      '<b>六、四墓四丘主凶</b>',
      '<b>四墓入课，主争讼坟墓之事，问病凶。</b>',
      '<b>断病主凶的还有四丘：春天丘在丑，夏天在辰，秋天在未，冬天在戌。其作用与墓相同。</b>',
      '<b>丘库为囚死之地。入课主论坟墓之事，又可主丧事、争讼、病死，不宜问病，问病主凶灾。</b>',
      '<b>七、丧门吊客</b>',
      '<b>丧门：太岁前二辰是也……主病灾、伤灾、丧事、家有凶事等……占病凶。</b>',
      '<b>吊客：太岁后二辰是也……吊客者主阴私、凶伤病死之事，喝药、服毒、自杀等。问病凶。</b>',
      '<b>丧门吊客不利寻病。二凶神临身，必有灾病或祸及家人。</b>',
      '<b>八、几个特殊的病象</b>',
      '<b>午见辰大凶</b>：',
      '<b>所以在断病时，午见辰为大凶。</b>',
      '<b>丧车</b>：',
      '<b>丧车入课主病凶，若克人元主重伤。</b>',
      '<b>风湿性关节炎</b>：',
      '<b>课例</b>：',
      '<code>`</code>',
      '人元：丁　　火 - 旺',
      '贵神：卯　　木 - 休',
      '将神：申　　金 + 死',
      '地分：卯　　木 - 休',
      '<code>`</code>',
      '<b>四位是火、木、金、木</b> —— <b>火不受克</b>（课内无水），所以<b>火旺</b>；火旺则<b>木休</b>（生火者）、<b>金死</b>（火克金）。',
      '<b>用神</b>：四位丁（阴）、卯（阴）、申（阳）、卯（阴）—— <b>三阴一阳，阳上取</b> —— <b>用神是将神申金</b>。',
      '<b>病灶从"金克木"上看</b>：',
      '<b>将神申金克地分卯木</b> —— <b>地分主腿脚</b> —— 所以断<b>"脚上的症状见效最明显"</b>；',
      '<b>将神申金又克贵神卯木</b> —— <b>贵神主手腕、手指</b> —— 所以<b>手腕手指也有病灶</b> —— <b>上下两处</b>；',
      '<b>人元丁火与地分卯木相生</b>（木生火）—— <b>本命这一头还有生气</b> —— 所以断<b>"能缓解，但不能除根"</b>。',
      '<b>风湿这一类病，正是"木金相战"的象</b> —— <b>木主筋骨、金主骨骼</b>，两者在课内打起来，<b>应到身上就是关节</b>。',
      '<b>九、一条纪律：不断生死</b>',
      '<b>占病含不断生死的规矩。</b>',
      '<b>即</b>：<b>可以断病情轻重、能不能治好，但不能断"什么时候死"。</b>',
      '<b>例外</b>：',
      '<b>丧车临用又克人元，主病重伤重。</b>',
      '<b>这条断语只到"重"为止</b> —— <b>"必死"这一类话，任何情况下都不说。</b>',
      '---',
      '<b>十、课式实证：用神被克、财动逢空断病</b>',
      '<code>`</code>',
      '干支：乙未年　壬午月　癸亥日　癸亥时',
      '月将：未　日空：子、丑　四大空亡：金',
      '人元：丙　　火 + 休　月德',
      '贵神：丁巳（腾蛇）用　火 - 休　天医、驿马、吊客、六丁',
      '将神：壬子（神后）　水 + 死　丧车',
      '地分：辰　　土 + 旺',
      '<code>`</code>',
      '<b>这一课问的是身体，不是财</b>。断病有一条纪律：',
      '<b>课内有财动，人家问的是身体，就不能去论财。</b>',
      '<b>三件事要记住</b>：',
      '<b>用神是贵神丁巳</b>（四位丙阳、巳阴、子阳、辰阳 —— 三阳一阴，以阴为用），<b>落在"休"地、又被将神壬子水所克</b> —— <b>用神受伤</b>，这是最重的一层。',
      '<b>将神壬子水克贵神丁巳火</b> —— 这是<b>财动</b>，但<b>问病不论财</b>。',
      '<b>人元丙火生地分辰土</b> —— 这是<b>子孙动</b>（火生土）。',
      '<b>落到病位上</b>：<b>巳火主心脏、也主两目</b>，被水克 —— 主<b>心脏与眼目</b>上的病；<b>辰土带湿气</b>，巳火生辰土，表面是火生土，实际是<b>巳火的力量被湿土吸掉</b>，主"<b>火被水气闷住</b>"。',
      '<b>神煞上有三层</b>：<b>腾蛇</b>主忧虑缠绕（病缠人）、<b>天医</b>主"病有救"、<b>丧车</b>是断病里最重的一层凶象（<b>只作内部判断，不对外断生死</b>）。',
      '<b>所以断"要重视、需慢慢调，但病不至危"</b> —— 用神虽受伤，<b>天医正在用神上，主"能治、有救"</b>。',
      '<b>这个课的逐条思路详解，见第十三章课例三。</b>',
      '<b>十一、课式实证（二）：把四位套到脸上</b>',
      '<code>`</code>',
      '乙未年　甲午日　丁卯时',
      '人元：甲　　木',
      '贵神：壬申（白虎）　金',
      '将神：丁卯（太冲）　木',
      '地分：子　　水',
      '<code>`</code>',
      '<b>问事</b>：断身体状况与相貌。',
      '<b>先定旺衰</b>：四位是<b>木、金、木、水</b> —— <b>木占两位</b>，但<b>木被金克</b>（贵神申金）；而<b>金不受克</b>（课内无火）—— 所以<b>金旺</b>。金旺则<b>水相</b>（金生水）、<b>土休</b>（生金者）、<b>火囚</b>（克金者）、<b>木死</b>（金克木）。',
      '标到四位上：人元甲木<b>死</b>、贵神申金<b>旺</b>、将神卯木<b>死</b>、地分子水<b>相</b>。',
      '<b>断病的第一步：人元受克，先断头。</b>',
      '<b>人元是甲木，正处"死"地，又被贵神申金所克</b> —— <b>人元主头部</b> —— 所以<b>先断"头部有问题"</b>。',
      '<b>这一课断得更细：额头上有横纹。</b> 这是把<b>四位往脸上套</b>：',
      '| 位 | 对应面部 |',
      '|---|---|',
      '| <b>人元</b> | <b>额头、头顶</b> |',
      '| <b>贵神</b> | <b>眉、眼、鼻梁这一带</b> |',
      '| <b>将神</b> | <b>口、下巴</b> |',
      '| <b>地分</b> | <b>脖子以下</b> |',
      '<b>人元甲木（木主"直、主纹路"）处在死地</b> —— 所以断<b>额头有横纹</b>。',
      '<b>再看其他位</b>：',
      '<b>贵神壬申金旺</b> —— <b>金主"白、主骨"</b> —— 所以<b>面部偏白、轮廓分明</b>；',
      '<b>将神丁卯木死</b> —— <b>卯主"唇、主口"</b> —— 木死则<b>嘴唇偏薄、或气色不佳</b>；',
      '<b>地分子水相</b> —— <b>水主"润"</b> —— 所以<b>脖子以下、或肤色偏润</b>。',
      '<b>断病与断貌用的是同一套东西</b> —— 都是<b>"把人体的部位分给四位，再看哪一位旺、哪一位衰"</b>：',
      '<b>旺的那一位，主"这一块强、或者突出"；衰而受克的那一位，主"这一块弱、或者有病"。</b>',
      '<b>这一课的教益是"四位套人体"</b>：',
      '<b>人元头、贵神眉眼鼻、将神口下巴、地分脖子以下</b> —— <b>先分部位，再看旺衰</b> —— <b>哪一位受克，就断哪一处的病；哪一位旺，就断哪一处的相。</b>',
      '<b>十二、课式实证（三）：同一件事，两种起课法</b>',
      '<b>同一个求测者问病，用两种方法各起一课</b> —— 正好看看"<b>起课法不同、课不同，但断的东西是一回事</b>"。',
      '<b>课一（报数起课）</b>：',
      '<code>`</code>',
      '干支：乙未年　辛巳月　甲辰日　庚午时',
      '月将：申　日空：寅、卯　四大空亡：无',
      '人元：庚　　金 + 死　月德',
      '贵神：丙寅（青龙）用　木 + 休　天德合、驿马',
      '将神：壬申（传送）　金 + 死　截路',
      '地分：午　　火 + 旺　病符',
      '<code>`</code>',
      '<b>课二（属相寅起课）</b>：',
      '<code>`</code>',
      '人元：丙　　火 + 旺　天德合',
      '贵神：己巳（腾蛇）用　火 - 旺　吊客、劫煞',
      '将神：戊辰（天罡）　土 + 相　天医',
      '地分：寅　　木 + 休　驿马',
      '<code>`</code>',
      '<b>先各自定旺衰</b>：',
      '<b>课一</b>：四位是<b>金、木、金、火</b>。<b>火克金、金克木</b> —— 一路克下来，<b>只有火不受克</b>（课内无水）—— 所以<b>火旺</b>。火旺则<b>土相</b>、<b>木休</b>、<b>水囚</b>、<b>金死</b>。',
      '标到四位上：人元庚金<b>死</b>、贵神寅木<b>休</b>、将神申金<b>死</b>、地分午火<b>旺</b>。',
      '<b>课二</b>：四位是<b>火、火、土、木</b>。<b>木克土</b>（土受克）；<b>火与木都不受克</b>（课内无金、无水）—— 取多者，<b>火旺</b>。火旺则<b>土相</b>、<b>木休</b>。',
      '标到四位上：人元丙火<b>旺</b>、贵神巳火<b>旺</b>、将神辰土<b>相</b>、地分寅木<b>休</b>。',
      '<b>两个课一看，共同点就出来了</b>：',
      '<b>两课的"火"都旺</b>（课一地分午火旺、课二人元与贵神双火旺）—— 而<b>火主心、主血脉、主热</b>；<b>两课又都带"阻碍"类的神煞</b>（课一有截路、病符；课二有吊客、劫煞）。',
      '<b>所以"断病"这个方向是一致的。</b>',
      '<b>但两课的落点不同</b>：',
      '<b>课一的地分午火旺、带病符</b> —— <b>病根在"最内"这一位</b>（地分主腿脚）—— 这一课断的正是<b>"腰疼腿疼、走路脚趾头疼"</b> ✓',
      '<b>课二的天医落在将神</b> —— <b>天医主"病有救"</b> —— 说明<b>这个病是能治的</b> ✓',
      '<b>这就是"同一件事、两种起课法"的对照</b>：',
      '<b>课不同，但该旺的还是旺、该有的煞还是有</b> —— <b>断出来的方向一致</b>；',
      '<b>而落点（哪一位、哪一宫）不同</b> —— <b>所以细节上各说各的话</b>。',
      '<b>两课合看，比单看一课更完整</b> —— 这也是为什么<b>重大求测常常要起几个课</b>。',
      '<b style="color:var(--c-gold)">第五节　出行</b>',
      '<b>一、出行歌诀</b>',
      '<b>出行先把四位看，上下生克要辨验。克上出外但有阻，克下最好莫出门。</b>',
      '<b>生上主动去门去，生内有人来接引。内外相克出意外，生合有喜利出行。</b>',
      '<b>出行要分关隔锁，斩关破锁才能行。贼动出行防盗贼，截煞罗网不可行。</b>',
      '<b>最怕五鬼临身缠，旺火见金路途凶。子午卯酉在半道，寅申巳亥未动身。</b>',
      '<b>辰戌丑未立等至，二马入课要远行。驿马逢合合时到，天马行空摸不清。</b>',
      '<b>二、逐句解</b>',
      '<b>"出行先把四位看，上下生克要辨验"</b> —— 看出行，<b>第一件事是把四位的上下生克辨清楚</b>。',
      '<b>"克上出外但有阻，克下最好莫出门"</b>：',
      '<b>克上</b>（下克上、内克外）—— <b>要出外，但路上有阻</b>；',
      '<b>克下</b>（上克下、外克内）—— <b>最好别出门</b>。',
      '<b>"生上主动去门去，生内有人来接引"</b>：',
      '<b>生上</b>（下生上）—— <b>自己主动要出门</b>；',
      '<b>生内</b>（外生内）—— <b>外面有人来接、来引</b>。',
      '<b>"内外相克出意外，生合有喜利出行"</b> —— <b>内外相克主出意外</b>；<b>相生相合则利于出行</b>。',
      '<b>"出行要分关隔锁，斩关破锁才能行"</b> —— <b>出行最怕"关隔锁"</b>（酉上见寅为关、卯上见戌为隔、卯上见申为锁）—— <b>要"斩关破锁"才走得成</b>。',
      '<b>"贼动出行防盗贼，截煞罗网不可行"</b> —— <b>见贼动要防盗</b>；<b>见截煞（截路空亡）、天罗地网，则不宜出行</b>。',
      '<b>"最怕五鬼临身缠，旺火见金路途凶"</b> —— <b>最怕五鬼临身</b>（五鬼主"行人道路冤"）；<b>旺火见金，路上有凶</b>。',
      '<b>"子午卯酉在半道，寅申巳亥未动身"</b> —— <b>这是断"人走到哪儿了"</b>：',
      '<b>子午卯酉</b> —— <b>人还在半道上</b>；',
      '<b>寅申巳亥</b> —— <b>人还没动身</b>。',
      '<b>"辰戌丑未立等至，二马入课要远行"</b>：',
      '<b>辰戌丑未</b> —— <b>马上就到</b>；',
      '<b>课内见二马（驿马、天马）</b> —— <b>要出远门</b>。',
      '<b>"驿马逢合合时到，天马行空摸不清"</b>：',
      '<b>驿马逢合，"合"的时候人就到了</b>；',
      '<b>天马行空 —— 行踪不定、摸不清</b>。',
      '<b>三、课式实证</b>',
      '<code>`</code>',
      '干支：癸巳年　乙卯月　癸酉日　戊午时',
      '月将：戌　日空：戌、亥　四大空亡：水',
      '人元：壬　　水 + 相',
      '贵神：庚申（白虎）用　金 + 旺　天德、天马',
      '将神：甲寅（功曹）　木 + 死　月德、天医、六甲、劫煞',
      '地分：戌　　土 + 休',
      '<code>`</code>',
      '<b>问事</b>：父母出外，什么时候回来。',
      '<b>先定旺衰</b>：四位是<b>水、金、木、土</b>。<b>金不受克</b>（课内无火）—— 所以<b>金旺</b>。金旺则<b>水相</b>（金生水）、<b>土休</b>（生金者）、<b>火囚</b>（克金者）、<b>木死</b>（金克木）。',
      '标到四位上：人元壬水<b>相</b>、贵神申金<b>旺</b>、将神寅木<b>死</b>、地分戌土<b>休</b>。',
      '<b>用神在贵神庚申</b>（四位壬阳、申阳、寅阳、戌阳 —— 四位全阳，是纯阳课，以神为用）。',
      '<b>断"什么时候回来"，按歌诀一条条对</b>：',
      '<b>"二马入课要远行"</b> —— 这一课<b>贵神带天马</b> —— 说明<b>人确实在外面、而且走得远</b>；',
      '<b>"驿马逢合合时到"</b> —— 回来的时间要<b>从"合"上取</b>；',
      '<b>地分戌土正逢日空</b>（日空戌、亥）—— <b>空主"还没有着落"</b>，所以<b>不是当天就回</b>。',
      '<b>这一课断"庚申时临天马带冲，应该回来"</b> —— <b>应期落在申时</b>（申既是天马所在，与时柱又逢冲，<b>逢冲必动</b>）。',
      '<b>再看这一课带着什么</b>：',
      '<b>天德、月德俱在</b> —— <b>有解厄之神护着</b>；',
      '<b>天医</b> —— 主<b>病有救</b>（出行在外不至于生病出险）；',
      '<b>劫煞、吊客</b> —— 偏凶，提醒<b>在外要留神</b>。',
      '<b>所以整课的断法是</b>：<b>人确实在外、走得远</b>（天马）；<b>有护佑</b>（天德、月德、天医）；<b>但一时回不来</b>（地分逢空）；<b>到申时会回来</b>（天马逢冲而动）。',
      '<b>最后说一句</b>：<b>这一课在第七章「神煞」里也出现过</b> —— 那里用它讲"一课串起六种神煞"。<b>同一课可以从不同角度读</b>：<b>看神煞是一个读法，看出行又是一个读法</b> —— <b>课还是那个课，取用不同，断出来的东西就不同。</b>',
      '<b style="color:var(--c-gold)">第六节　官司与失盗</b>',
      '<b>一、官司</b>',
      '<b>总诀</b>：',
      '<b>官司最忌三刑全，纠缠斗讼更拖延。</b>',
      '<b>辰巳戌亥木克土，牢狱之灾不可免。</b>',
      '<b>课有连茹牵大家，天罗地网非等闲。</b>',
      '<b>无官最怕见官动，冲刑克害莫相见。</b>',
      '<b>辰戌临用斗讼事，更忌朱雀受牵连。</b>',
      '<b>干神相生能和解，惧怕二神斗不完。</b>',
      '<b>妻动我方难得理，鬼动他人牵里面。</b>',
      '<b>善劝世人莫斗气，远离官讼是非端。</b>',
      '<b>要点</b>：',
      '<b>三刑全</b> ——<b>纠缠斗讼，最忌</b>',
      '<b>辰巳戌亥</b> ——<b>木克土，牢狱之灾</b>',
      '<b>无官最怕见官动</b> ——<b>因为官动主诉讼</b>',
      '<b>辰戌临用</b> ——<b>斗讼之事</b>',
      '<b>干神相生能和解</b> ——<b>这是化解之法</b>',
      '<b>化解</b>：',
      '<b>干神相生能和解。</b>',
      '<b>即</b>：<b>如果人元与贵神的天干相生</b> ——<b>官司能和解。</b>',
      '<b>二、课式实证：二酉夹寅</b>',
      '<code>`</code>',
      '干支：戊子年　乙卯月　丙辰日　癸巳时',
      '月将：戌　日空：子、丑　四大空亡：金',
      '人元：丁　　火 - 旺　六丁',
      '贵神：丁酉（太阴）　金 - 死　丧车、六丁',
      '将神：庚寅（功曹）用　木 + 休　天医、驿马、丧门',
      '地分：酉　　金 - 死　丧车',
      '<code>`</code>',
      '<b>问事</b>：亲戚急电，说"出大事了"，问怎么办。',
      '<b>先定旺衰</b>：四位是<b>火、金、木、金</b>。<b>火克金、金克木</b> —— 一路克下来，<b>只有火不受克</b>（课内无水）—— 所以<b>火旺</b>。火旺则<b>土相</b>、<b>木休</b>（生火者）、<b>水囚</b>、<b>金死</b>（火克金）。',
      '标到四位上：人元丁火<b>旺</b>、贵神酉金<b>死</b>、将神寅木<b>休</b>、地分酉金<b>死</b>。',
      '<b>这一课最要紧的结构，是"二酉夹寅"</b>：',
      '<b>贵神是丁酉金、地分是酉金</b> —— <b>两块金，把将神庚寅木夹在正中间</b>。',
      '<b>用爻寅木夹于二酉之间</b> —— <b>必有来自内外的干涉和压力</b> ✓',
      '<b>这就是"夹克"</b>：<b>用神（自己）被两边同时克</b> —— 上面（贵神）克、下面（地分）也克 —— <b>内外都受压、无处可躲</b>。',
      '<b>再看两个动</b>：',
      '<b>人元丁火克地分酉金</b> —— <b>妻动</b>；',
      '<b>贵神丁酉金克将神庚寅木</b> —— <b>贼动</b>。',
      '<b>这一课第 6 条正这么说</b>："<b>妻动课应与女人有关，贼动课我方不利于索求赔偿</b>"。',
      '<b>妻动</b>主"与女人有关"，<b>贼动</b>主"我方索求不利" —— <b>两个动夹着一个"夹克"</b> —— 这一课的局面就是<b>"理在我这边，但拿不到好处"</b>。',
      '<b>神煞上也很重</b>：',
      '<b>贵神与地分都带丧车</b> —— <b>丧车两见</b>，主<b>凶丧、伤灾</b>；',
      '<b>人元与贵神都带六丁</b> —— 六丁偏凶，主<b>惊恐、心神不宁</b>；',
      '<b>将神带天医、驿马、丧门</b> —— <b>天医主"有救"</b>、<b>驿马主奔走</b>、<b>丧门主忧患</b>。',
      '<b>所以断"血光、四肢受伤"就从这里出</b>：<b>寅木（主四肢）被二金夹克，又带丧门</b> —— 这一课断的正是<b>"四肢受伤、受二金克伤严重"</b> ✓',
      '<b>官司怎么走</b>：这一课断<b>"有口角或官司"</b>、<b>"开始僵持不下、对方不讲理、有外来关系庇护"</b>；',
      '<b>结果</b>：<b>"入冬后经过大的政府机关出面才能得到赔偿"</b> —— 应期落在<b>入冬</b>（水旺之时）—— <b>水一旺，火得制、金得生</b>，局面才转过来。',
      '<b>这一课的教益是"夹克"</b>：',
      '<b>用神被两侧同时克，叫"夹克"</b> —— 主<b>"内外受敌、无处可躲"</b>；',
      '<b>再看是哪两个动在起作用</b> —— <b>定出"事从哪来、利在哪方"</b>。',
      '<b>三、失盗</b>',
      '<b>总诀</b>：',
      '<b>失盗之财看四神，将为财帛贵贼人。</b>',
      '<b>上下相生四邻偷，神将相生亲戚寻。</b>',
      '<b>上来克下家里找，下若克上财出门。</b>',
      '<b>空亡此物不会丢，天罗地网近处寻。</b>',
      '<b>子午卯酉难寻找，玄武见火贼临身。</b>',
      '<b>太冲也非等闲辈，开窗破门是贼神。</b>',
      '<b>贼人落处推人元，甲乙木旺隐山林。</b>',
      '<b>丙丁藏匿高岭处，戊己土旺隐其身。</b>',
      '<b>庚辛在道逃匿中，壬癸河边来回寻。</b>',
      '<b>玄武释贼游鲁都，金口一开无处藏。</b>',
      '<b>几个要点</b>：',
      '<b>看来历</b>：',
      '<b>上下相生</b> ——<b>四邻偷</b>',
      '<b>神将相生</b> ——<b>亲戚寻</b>',
      '<b>上来克下</b> ——<b>家里找</b>',
      '<b>下若克上</b> ——<b>财出门</b>（已经转移了）',
      '<b>看空亡</b>：',
      '<b>空亡此物不会丢。</b>',
      '<b>即</b>：<b>逢空说明没丢</b>（或者看到别人失窃）。',
      '<b>看贼人方位</b>：',
      '| 人元 | 贼人藏处 |',
      '|---|---|',
      '| <b>甲乙木旺</b> | <b>隐山林</b> |',
      '| <b>丙丁</b> | <b>藏匿高岭处</b> |',
      '| <b>戊己土旺</b> | <b>隐其身</b>（藏在本地） |',
      '| <b>庚辛</b> | <b>在道逃匿中</b> |',
      '| <b>壬癸</b> | <b>河边来回寻</b> |',
      '<b>贼神</b>：',
      '<b>玄武</b> ——<b>贼神</b>',
      '<b>太冲（卯）</b> ——<b>开窗破门是贼神</b>',
      '<b>二·补　课式实证：身份证没丢，就在车座下</b>',
      '<code>`</code>',
      '干支：壬辰年　乙巳月　壬申日　丙午时',
      '月将：申　日空：戌、亥　四大空亡：水',
      '人元：戊　　土 + 旺',
      '贵神：庚子（玄武）用　水 + 死　月德、天马、丧车',
      '将神：庚戌（河魁）　土 + 旺　月德',
      '地分：申　　金 + 相',
      '<code>`</code>',
      '<b>问事</b>：身份证找不到了，看能不能找到（电话求测）。',
      '<b>第一步，定旺衰</b>：四位是<b>土、水、土、金</b>。<b>土占两位</b>，而能克土的<b>木，课内没有</b> —— 所以<b>土旺</b>。土旺则<b>金相</b>（土生金）、<b>火休</b>（生土者）、<b>木囚</b>（克土者）、<b>水死</b>（土克水）。',
      '<b>第二步，看玄武的死活</b> —— 断失物，第一眼看玄武（主盗、主暗昧）。这一课<b>贵神是庚子、带玄武</b>，而<b>玄武正处"死"地，还被两位土夹着克</b>。',
      '<b>玄武死、又被夹克 —— 东西不是被偷走的。</b>',
      '<b>第三步，看"哪一位空"</b>：<b>子水逢空</b>。',
      '<b>"财动逢空物有所损，但水逢空，物件不损。"</b>',
      '<b>水空，说明东西没真丢，只是暂时看不见。</b>',
      '<b>第四步，定位</b>：',
      '<b>子、申为证件</b> —— 这一课<b>子水空而不偷</b>、<b>申在下面</b>；',
      '<b>课内又有子孙动</b>，<b>与小孩有关</b>；',
      '<b>戌为库、为兜</b>，落在<b>将神</b>位，对应身体的<b>命门、腰部</b> —— <b>所以东西应该在裤子或包包里</b>。',
      '<b>第五步，结合日建</b>：<b>申为日建，又与课内相应</b>，<b>申在下</b> —— 所以断<b>身份证在车座下面</b>。',
      '<b>验证</b>：求测者说离开车后翻遍包包、裤兜都没有；<b>于是让孩子去车上找 —— 在车座下找到了</b>。',
      '<b>这一课的教益有两条</b>：',
      '<b>一看玄武的死活</b> —— 玄武死而受制，多半不是被盗。',
      '<b>二看"哪一位空"</b> —— <b>空的是水（证件、财物），主"东西没丢，只是看不见"</b>。这一条正是"<b>空亡此物不会丢</b>"的实证。',
      '<b>四、升学</b>',
      '<b>升学求名二神看，旺相逢生最喜欢。</b>',
      '<b>官鬼同动见二马，高中无疑喜还家。</b>',
      '<b>不逢刑克天禧见，天空奏神中状元。</b>',
      '<b>将若克干求名吉，三水一金文章添。</b>',
      '<b>四位生合科举榜，刑冲克害惹祸端。</b>',
      '<b>客来克主难如愿，关隔锁中求名难。</b>',
      '<b>三奇入课凶转吉，金口神助非等闲。</b>',
      '<b>逐句看</b>：',
      '<b>"升学求名二神看，旺相逢生最喜欢"</b> —— 升学<b>主要看二神</b>：<b>旺相、相逢、相生</b>，最好。',
      '<b>"官鬼同动见二马，高中无疑喜还家"</b> —— <b>官动、鬼动同时出现，又见二马（驿马、天马）</b> —— <b>高中无疑</b>。',
      '<b>"不逢刑克天禧见，天空奏神中状元"</b> —— 没有刑克，又见天喜；<b>尤其是天空</b> —— <b>主"中状元"</b>。',
      '<b>"将若克干求名吉，三水一金文章添"</b> —— <b>将神克人元，求名吉利</b>；<b>课内三水一金，主文章出众</b>。',
      '<b>"四位生合科举榜，刑冲克害惹祸端"</b> —— <b>四位相生相合，主上榜</b>；<b>见刑冲克害，主惹祸端</b>。',
      '<b>"客来克主难如愿，关隔锁中求名难"</b> —— <b>外来克内，难以如愿</b>；<b>课带关隔锁，求名难</b>。',
      '<b>"三奇入课凶转吉"</b> —— <b>三奇入课，凶可转吉</b>。',
      '<b>这里专门说一句"天空"</b>：',
      '<b>平时断课并不喜欢天空</b>（主虚、主不实），<b>但升学是例外 —— 升学最喜欢见天空。</b>',
      '<b>为什么？</b> 因为<b>天空在天上为"奏神"，专管往上报</b> —— 就像下面递上去的奏章、文件，<b>它就是干这个的</b>。所以<b>升学课里见天空，是好象</b>。',
      '<b>关于课例</b>：升学这一门，<b>这一门没有单独留下课例</b> —— 因为它和<b>求官、求职性质相近</b>（都属于"对上有所祈求、有所索取"这一类），<b>断法可以互相参照</b>。',
      '<b>上面那个断"几把手"的课例，方法同样可以用来断升学</b>：<b>看官爻的旺衰、看二神的关系、看有没有二马和三奇</b>。',
      '---',
      '<b>五、课式实证：官动见二马</b>',
      '<code>`</code>',
      '干支：丙申年　甲午月　庚午日　辛巳时',
      '月将：未　日空：戌、亥　四大空亡：水',
      '人元：壬　　水 + 旺',
      '贵神：戊寅（青龙）用　木 + 相　天德合、天喜、天马',
      '将神：甲申（传送）　金 + 休　驿马、六甲、飞廉',
      '地分：午　　火 + 死　吊客、截路',
      '<code>`</code>',
      '<b>把升学歌里的几条逐一对一遍</b>：',
      '<b>"升学求名二神看，旺相逢生最喜欢"</b> —— <b>二神是贵神寅木（相）与将神申金（休）</b> —— <b>一旺一衰，不算全美</b>，但<b>贵神得水生（相地）</b>，可用；',
      '<b>"官鬼同动见二马"</b> —— <b>官动成立</b>：<b>贵神寅木克人元壬水</b> ✓；<b>二马齐全</b>：<b>天马在寅（贵神）、驿马在申（将神）</b> ✓；<b>鬼动不成立</b>（地分午火不克人元壬水）；',
      '<b>"将若克干求名吉"</b> —— <b>将神申金</b>与<b>人元壬水</b>是<b>金生水</b>，不是克 —— 这一条不占。',
      '<b>官动 + 二马俱在</b> —— <b>升学歌里最重的那一条占了</b> —— 所以断<b>"能上，而且快"</b>。',
      '<b>但要把"必中无疑"这句话收住</b>：<b>歌诀给的是条件，不是保证</b> —— <b>占了两条（官动、二马），不占"鬼动"</b> —— 所以话说成<b>"机会很大、时间也快"</b>，而不是<b>"一定中"</b>。<b>凡是歌诀里的绝对话，都要先放到条件上过一遍。</b>',
      '<b style="color:var(--c-gold)">第七节　占环境与射覆</b>',
      '<b>一、占环境</b>',
      '<b>总诀</b>：',
      '<b>环境断法有何难，干支分明五行观。</b>',
      '<b>五行有水水边居，有火电器与机关。</b>',
      '<b>学校烟筒变压器，房屋朝阳电线杆。</b>',
      '<b>木立课中旁有树，木上见火花树见。</b>',
      '<b>木临金边树有损，甲乙为林分开单。</b>',
      '<b>金临课中定有路，申酉不同分窄宽。</b>',
      '<b>辛为大路庚小道，申金为用大道边。</b>',
      '<b>遇火定是路分岔，干火十丁路口前。</b>',
      '<b>土神出现各有主，丑土银行寺庙观，辰戌乱岗佛像占，未土药店餐馆宴。</b>',
      '<b>要点</b>：',
      '| 五行 | 环境取象 |',
      '|---|---|',
      '| <b>水</b> | <b>水边居</b> |',
      '| <b>火</b> | <b>电器、机关、学校、烟筒、变压器、电线杆</b> |',
      '| <b>木</b> | <b>旁有树</b>；木上见火主"花树"；木临金主"树有损" |',
      '| <b>金</b> | <b>有路</b>；庚为大路、辛为小道；申为大道边 |',
      '| <b>土</b> | <b>丑——银行寺庙观；辰戌——乱岗佛像；未——药店餐馆</b> |',
      '<b>注意</b>：',
      '<b>金口诀断环境 ≠ 风水。</b>',
      '<b>为什么？</b>',
      '<b>我们能调理风水，而作战不可能让你去先把环境调整好，只能利用环境或者躲开不利环境。</b>',
      '<b>金口诀的重点是预测体系，不是风水体系。</b>',
      '<b>这一节以"取象口诀 + 五行对照"为主</b>；断课的时候，把它当作<b>一层附加信息</b>来用 —— <b>主问的事是主线，环境是从旁边印证的一面</b>。',
      '<b>环境断法多在"家宅课"里见真章</b> —— 看下面这个课。',
      '<b>三、课式实证：断家宅与家人</b>',
      '<code>`</code>',
      '干支：甲午年　丙寅月　甲子日　己巳时',
      '月将：亥　日空：戌、亥　四大空亡：水',
      '人元：甲　　木 + 旺　六甲',
      '贵神：甲子（玄武）用　水 + 休　六甲',
      '将神：戊辰（天罡）　土 + 死　吊客',
      '地分：戌　　土 + 死　天喜、飞廉',
      '<code>`</code>',
      '<b>问事</b>：一位老家人前来求测<b>家宅和家庭问题</b>。',
      '<b>先定旺衰</b>：四位是<b>木、水、土、土</b>。<b>木克土</b>（土受克）；<b>土克水</b>（水也受克）—— 一路克下来，<b>只有木不受克</b>（课内无金）—— 所以<b>木旺</b>。木旺则<b>火相</b>、<b>水休</b>、<b>金囚</b>、<b>土死</b>。',
      '标到四位上：人元甲木<b>旺</b>、贵神子水<b>休</b>、将神辰土<b>死</b>、地分戌土<b>死</b>。',
      '<b>看家宅，先看地分</b> —— <b>地分是"田宅、家底"这一位</b>。',
      '这一课<b>地分是戌土，正处"死"地，而且逢日空</b>（日空戌、亥）：',
      '<b>地分死又逢空</b> —— 主<b>家宅这一块"不实、有欠缺"</b>。',
      '<b>再看四位的分工</b>：',
      '| 位 | 是谁 | 断什么 |',
      '|---|---|---|',
      '| <b>人元</b> | 甲木<b>旺</b> | <b>本人的性情、脾气</b> |',
      '| <b>贵神</b> | 甲子水<b>休</b> | <b>外面的、工作</b> |',
      '| <b>将神</b> | 戊辰土<b>死</b> | <b>自己、内里的实质</b> |',
      '| <b>地分</b> | 戌土<b>死、逢空</b> | <b>家宅、根基</b> |',
      '<b>人元甲木旺</b> —— <b>木主"直、主急"</b> —— 断<b>"本人脾气不太好"</b> ✓',
      '<b>两位土都死</b> —— <b>土主"稳、主和"</b>，土死则主<b>"家里不稳、关系不睦"</b> ✓',
      '<b>再看两个动</b>：',
      '<b>人元甲木克地分戌土</b> —— <b>妻动</b>（人元克地分）；',
      '<b>将神戊辰土克贵神甲子水</b> —— <b>财动</b>（将神克贵神）。',
      '<b>妻动</b>在家庭里是"<b>我克内</b>"，主<b>本人对家里比较强势</b>；<b>财动</b>是"<b>内克外</b>"，主<b>自己往外求财</b>。',
      '<b>这一课的断语正对得上</b>："闹矛盾的时候你是真敢动手"（妻动）、"财运一直不错，还爱做些额外的活赚外快"（财动往外）。',
      '<b>再看"伤"从哪里断</b>：<b>人元甲木旺，木主"肢体"</b>；<b>课内两位土被木克</b> —— <b>土主"皮肉、骨肉"</b> —— <b>木克土，主"伤在肢体"</b> ✓ 这一课正断"腿或腰受过重伤"。',
      '<b>再加上地分带飞廉、将神带吊客</b> —— <b>飞廉主"有非常之惊"、吊客主"忧患"</b> —— 两煞都在，主<b>"受过惊、有过伤"</b> ✓',
      '<b>这一课的教益是"家宅课先看地分"</b>：',
      '<b>地分是家宅、是根基</b> —— 它<b>旺不旺、空不空</b>，直接定"家底厚不厚、稳不稳"；',
      '<b>再看人元定主人的性情</b>，<b>最后看二神定内外关系</b>。',
      '<b>二、射覆（论物）</b>',
      '<b>总诀</b>：',
      '<b>论物多翻正。射覆上克下，论物以翻为正。</b>',
      '<b>下旁或有缺。下受克，物器旁有缺，或无足。</b>',
      '<b>要点</b>：',
      '<b>上克下</b> ——<b>论物以翻为正</b>（东西是翻着的）',
      '<b>下受克</b> ——<b>物品旁边有缺损，或者没有底足</b>',
      '<b>其他断语</b>：',
      '<b>射覆时，如果用爻是巳火，或者课中巳火旺相，其物多有花纹、阿拉伯数字或英文。</b>',
      '<b>实物断例</b>：',
      '<code>`</code>',
      '干支：壬辰年　庚戌月　己未日　戊辰时',
      '月将：卯　日空：子、丑　四大空亡：金',
      '人元：庚　　金 + 死',
      '贵神：甲戌（天空）　土 + 相　天马、六甲',
      '将神：己巳（太乙）用　火 - 旺　驿马',
      '地分：午　　火 + 旺　天喜、丧门',
      '<code>`</code>',
      '<b>这一课断出两样东西</b>：',
      '<b>"宅子周围上空有高压线电器围绕"</b>',
      '<b>"院内堆积物是玉米，而且数量很大"</b>',
      '<b>取象推理</b>：',
      '<b>火旺主电线，巳午为天罗纠缠之象，大小电线交错。</b>',
      '<b>戌有棱角坑洼，午火巳火纠缠杂乱无章。</b>',
      '<b>巳为阴火，颜色暗红，临戌红黄色，有不规则花纹状，火的特性上尖下宽，戌为壳临天马为裂皮，人元庚金为头空死见黑色。巳午纠缠，火多大小不一，火局炎上数量大，故联想到玉米。</b>',
      '<b>这段推理很典型</b> ——<b>从五行、干支、神煞一步步推出"玉米"，每一步都有依据。</b>',
      '---',
      '<b style="color:var(--c-gold)">第八节　断来意与综合</b>',
      '<b>一、占来意</b>',
      '<b>总诀</b>：',
      '<b>欲占来意将中看，斗争取索配人元。</b>',
      '<b>木土口舌兼刑狱，火金灾祸事难量。</b>',
      '<b>水土田宅人有死，水火交为妇女残。</b>',
      '<b>四位相生诸事喜，二金二木怪惊慌。</b>',
      '<b>火忌丧门兼鬼煞，破财文字及争官。</b>',
      '<b>更将主客祥休旺，依次推来见得端。</b>',
      '<b>时闻来喜事何疑，四仲皆因酒食为。</b>',
      '<b>辰戌斗讼财帛事，寅申文字及公讼。</b>',
      '<b>巳亥课中为乞索，相生相克用心推。</b>',
      '<b>乞索反吟须反复，分局宅移彼来欺。</b>',
      '<b>带煞逢金人争讼，若逢无克喜怡怡。</b>',
      '<b>白虎吊丧人有祸，精心推究此玄机。</b>',
      '<b>古法解</b>：',
      '<b>占测来意时，以将神为主，看将神与人元的关系，是相克相合关系，来判断求测大意。</b>',
      '<b>比如将神是木、人元是土，有口舌纷争；火金是灾祸。但是要分清是谁克谁、谁合谁——人元克将是外来侵入，将神克外我索取。</b>',
      '<b>将神克外主有所得——我克者为财，所以我能得财。</b>',
      '<b>关于课例</b>：<b>"断来意"本身是"不圈范围"的断法</b> —— 它练的是<b>从课里读出信息</b>的本事，而不是针对某个问题下断语。<b>所以这一节不配单独的课例。</b>',
      '<b>怎么练？</b> <b>前面各门的每一个课式，都可以拿来练"断来意"</b>：',
      '<b>把"问什么"遮住，只看四位</b> —— 试着说出"这个人来问什么事"。<b>说得出来，说明读象的功夫到了；说不出来，就回去把旺衰、五动三动、神煞重新过一遍。</b>',
      '<b>1.1 课式实证：遮住问事，反推来意</b>',
      '<b>占来意练的是"逆向"</b> —— <b>给你一个课，不告诉你问什么，让你从四位推出他想问什么</b>。用一课试一遍：',
      '<code>`</code>',
      '人元：丁　　火 - 旺　天德合、月德合、六丁',
      '贵神：庚午（朱雀）用　火 + 旺　病符、飞廉',
      '将神：癸酉（从魁）　金 - 死　丧门、丧车',
      '地分：卯　　木 - 休　天医',
      '<code>`</code>',
      '<b>第一步：看哪一位最"不安"</b>',
      '<b>四位里最扎眼的是将神癸酉</b> —— <b>它既处"死"地，又被两个火夹着克，头上还压着丧门、丧车</b> —— <b>一个课里最受克的那一位，就是"出问题的那一位"</b>。',
      '<b>第二步：看四位的关系定事类</b>',
      '<b>贵神庚午火克将神癸酉金</b> —— <b>贼动</b> —— <b>"斗争取索"一类的象</b> —— <b>所以这人问的不是喜事，是麻烦事</b>。',
      '<b>第三步：取象，定到具体</b>',
      '<b>受克的是酉金</b> —— <b>酉主骨骼、关节</b>；<b>地分卯木也被酉金克，且卯酉相冲</b> —— <b>卯主下肢</b> —— <b>两处合起来，指向"身上受伤、伤在骨与下肢"</b>。',
      '<b>第四步：看人元定"谁的事"</b>',
      '<b>人元丁火带天德合、月德合，又带六丁</b> —— <b>丁主心、主急</b> —— <b>天德月德主"有解"</b> —— <b>合起来是"家里人出事了，人心里急，但事情有救"</b>。',
      '<b>所以来意可以断成</b>：',
      '<b>他是为家里人的伤病来的，伤在骨与下肢，来得急，但不至危。</b>',
      '<b>对照实际</b> —— <b>正是"老家亲戚打电话问家里有人受伤了、伤得厉害吗"</b> —— <b>来意对上了</b>。',
      '<b>占来意的功夫就在这里</b>：<b>先找最受克的那一位（定"事在哪"），再看克它的动（定"什么事"），然后取象（定"什么伤、什么部位"），最后看人元（定"谁的事"）</b> —— <b>四步下来，不用问也知道他要问什么。</b>',
      '<b>二、都解歌</b>',
      '<b>入课须看轻与重，五行休旺最通灵。</b>',
      '<b>老人所得休囚动，年少由来旺气生。</b>',
      '<b>幼小克冲胎气死，关隔空亡便要精。</b>',
      '<b>胜光临虎婚姻事，神后偎龙有不明。</b>',
      '<b>六合逢水阴私动，太阴遇火及奸情。</b>',
      '<b>将带煞兮神带煞，三合道路暗更多。</b>',
      '<b>更看有气及无气，四位相生克与刑。</b>',
      '<b>古法解</b>：',
      '<b>"胜光临虎婚姻事，神后偎龙有不明"</b> ——<b>胜光是午火，虎是寅虎不是白虎</b>（否则就不是婚姻是灾了）；<b>神后是子水，龙是辰龙</b>（因为辰与子都主阴暗不明，有水局主阴暗不明，子是桃花，主暧昧不明）',
      '<b>"三合道路暗更多"</b> ——<b>这里的道路指酉，金局是淫局，更是阴暗不明</b>',
      '<b>"凡是金局都有隐私苟且之事，论合作是临时合伙各自有益，属草台班子不正式，随时散局"</b>',
      '<b>三、灾祸歌</b>',
      '<b>用爻旺相无祸殃，囚死官动不可当。</b>',
      '<b>干若克将外财损，不然子妻有病伤。</b>',
      '<b>干若克神外索借，神临四仲顶门枪。</b>',
      '<b>申子辰戌雀凶事，用受岁月日时伤。</b>',
      '<b>刑冲克害官司有。车祸损财有病伤。</b>',
      '<b>玄武太冲或贼动。定有盗失损财伤。</b>',
      '<b>辰戌罗网来人课。必犯口舌官司当。</b>',
      '<b>劫煞灾煞五鬼入。意外之祸有血光。</b>',
      '<b>丧吊马倒凶丧事。君子不信也要防。</b>',
      '<b>要点</b>：',
      '<b>用爻旺相</b> ——<b>无祸殃</b>',
      '<b>囚死官动</b> ——<b>不可当</b>',
      '<b>玄武、太冲、贼动</b> ——<b>定有盗失损财伤</b>',
      '<b>辰戌罗网</b> ——<b>必犯口舌官司</b>',
      '<b>劫煞、灾煞、五鬼</b> ——<b>意外之祸有血光</b>',
      '<b>丧门、吊客、马倒</b> ——<b>凶丧事</b>',
      '<b>四、用神断歌</b>',
      '<b>金口用神断分明，阴阳五行会其中。</b>',
      '<b>细分五行旺与衰，阴偶阳奇心中定。</b>',
      '<b>用爻无力寻六合，隐遁信息在其中。</b>',
      '<b>若是子水有隐匿，丑土财贵看吉凶。</b>',
      '<b>青龙寅木遇金克，此为金绝伤财神。</b>',
      '<b>六合卯木遇申金，此为木绝财帛尽。</b>',
      '<b>辰龙入课是非多，腾蛇巳火文书精。</b>',
      '<b>午火临用不安分，未土逢截毒药明。</b>',
      '<b>申金常有出外事，酉美最喜水来迎。</b>',
      '<b>戌官奸诈能奏书，良妇亥水常受宠。</b>',
      '<b>逢刑必有伤灾现，冲克刑害内外分。</b>',
      '<b>若逢空亡吉凶假，需辨时辰吉凶定。</b>',
      '<b>这段把十二地支在"用神"位置上的特性总结了一遍</b>：',
      '| 用神 | 特性 |',
      '|---|---|',
      '| <b>子水</b> | <b>有隐匿</b> |',
      '| <b>丑土</b> | <b>财贵看吉凶</b> |',
      '| <b>寅木</b> | <b>遇金克为"金绝伤财神"</b> |',
      '| <b>卯木</b> | <b>遇申金为"木绝财帛尽"</b> |',
      '| <b>辰龙</b> | <b>入课是非多</b> |',
      '| <b>巳火</b> | <b>文书精</b> |',
      '| <b>午火</b> | <b>临用不安分</b> |',
      '| <b>未土</b> | <b>逢截毒药明</b> |',
      '| <b>申金</b> | <b>常有出外事</b> |',
      '| <b>酉金</b> | <b>最喜水来迎</b> |',
      '| <b>戌土</b> | <b>官奸诈能奏书</b> |',
      '| <b>亥水</b> | <b>良妇常受宠</b> |',
      '<b>最后两句很重要</b>：',
      '<b>若逢空亡吉凶假，需辨时辰吉凶定。</b>',
      '---',
      '<b style="color:var(--c-gold)">本章小结</b>',
      '<b>一、求财</b>',
      '<b>四个条件</b>：财动、财爻旺相、外生内、青龙旺相。',
      '<b>五种方式</b>：买卖、合作、官中、外财、劫财。',
      '<b>财动分三种空</b>：将神空（不得反失）、贵神空（空动）、二神俱空（空手套白狼）。',
      '<b>外生内的快慢</b>：贵神生将神最快；人元生将神晚（有落息）；人元生地分更晚。',
      '<b>按贵神细分</b>：勾陈（是非争斗）、朱雀腾蛇（文字）、白虎（奔波险中求财）。',
      '<b>四位中谁受克谁出问题</b>；将神受克更是直接破财。',
      '<b>求财最怕贼动</b>；内外勾结的两个判定标准（二神干五合、地分生贵神）。',
      '<b>两个财神</b>：寅为地支第一财神；乙为木行第一财神。',
      '<b>二、求官与工作</b>',
      '<b>六个条件</b>：贵神官爻旺相、官动、鬼动、将神生贵神、外来生内、临岁月不空。',
      '<b>利官的贵神</b>：青龙（文官）、申（武官）、见火（军人）。',
      '<b>官职大小</b>：临太岁最大，月建日建依次而下。',
      '<b>求官八法</b>：将神生贵神、外生内、鬼动、逢二马、父母动、驿马带鬼动、官动不带马星、忌凶煞。',
      '<b>官动逢空</b> ——不得官；旺空可等时机，逢空临时辰"得天机"。',
      '<b>最怕斩官</b>（人元克贵神）。',
      '<b>求职三条件</b>；<b>求职最忌官动</b>。',
      '<b>求官忌神煞</b>：禄倒、马倒、天罗地网。',
      '<b>三、婚姻</b>',
      '<b>三种断法</b>：古法（人元男/地分女）、三段分法（更实用）、三条心法。',
      '<b>三条心法</b>：最怕贼动与分局相生；冲则变、绝则散、刑则斗、破则夫妻异心；二神冲绝而不散时看天干是否相合。',
      '<b>空亡在婚姻中</b> ——婚后一方空亡主婚姻虚假或分居；未婚逢空主没有对象。',
      '<b>断婚姻的条件与性质</b> ——五条件、三阶段。',
      '<b>桃花与感情</b> ——桃花运、桃花劫、号外桃花巳火。',
      '<b>现代婚姻的扩展问项。</b>',
      '<b>四、断病</b>',
      '<b>四位对应人体</b>：人元头面、贵神胸、将神腹、地分腿脚。',
      '<b>旺衰断虚实</b> ——旺为实病，衰为虚病。',
      '<b>年龄定喜忌</b> ——<b>老人喜休囚、年轻人要旺</b>。',
      '<b>五动问病</b>：官动在咽喉、贼动在腹部、财动在胸、鬼动主怪异之症。',
      '<b>土旺与肿瘤</b> ——辰戌土临用多有恶性肿瘤。',
      '<b>四墓四丘主凶</b>、<b>丧门吊客主病灾</b>。',
      '<b>一条纪律</b>：不断生死。',
      '<b>五、出行</b>',
      '<b>总诀</b>：克上出外但有阻、克下最好莫出门、生上主动、生内有人接引。',
      '<b>子午卯酉在半道，寅申巳亥未动身，辰戌丑未立等至。</b>',
      '<b>驿马</b>：旺相主迅速、逢合则止、逢冲则动。',
      '<b>天马</b>：主快捷、宜速不宜迟、坐飞机出国应天马。',
      '<b>六、官司与失盗</b>',
      '<b>官司</b>：最忌三刑全、辰戌临用；<b>干神相生能和解</b>。',
      '<b>失盗</b>：看财帛与贼人；<b>空亡此物不会丢</b>；<b>贼人落处推人元</b>。',
      '<b>七、占环境与射覆</b>',
      '<b>占环境</b>：五行与四位的取象；<b>金口诀断环境 ≠ 风水</b>。',
      '<b>射覆</b>：论物多翻正、下旁或有缺。',
      '<b>八、断来意与综合</b>',
      '<b>占来意</b>：以将神为主，看将神与人元的关系。',
      '<b>都解歌、灾祸歌、用神断歌</b> ——把各类断语系统化。',
      '---',
      '<b style="color:var(--c-gold)">心法</b>',
      '<b>门类不同，看法不同</b>',
      '<b>同样一个课，问不同的事，断法完全不同。</b>',
      '<b>比如"财动"</b>：',
      '<b>问求财</b> ——<b>吉，必有财</b>',
      '<b>问求官</b> ——<b>忌，财动伤官</b>',
      '<b>问婚姻</b> ——<b>看具体情况</b>',
      '<b>所以</b>：',
      '<b>不要看到一个课就一通乱断</b> ——<b>先问清楚"问什么"，再定"看哪里"。</b>',
      '<b>这也是"界定求测范围"的意义。</b>',
      '<b>条件越具体，断得越准</b>',
      '<b>求财有四条件、求官有六条件、求职有三条件。</b>',
      '<b>为什么要列"条件"？</b>',
      '<b>因为</b>：<b>条件列清楚了，断课就有依据</b> ——<b>不是"我觉得"，而是"课里满足了几条"。</b>',
      '<b>比如求财</b>：',
      '<b>四条全满足</b> ——<b>必得财</b>',
      '<b>满足三条</b> ——<b>有希望</b>',
      '<b>只满足一条</b> ——<b>困难</b>',
      '<b>这样就避免了"凭感觉断课"。</b>',
      '<b>一个课能断万事万物</b>',
      '<b>这一句说得很到位</b>：',
      '<b>这样一个课的断课过程就完成了。当然真实的断课细节要繁琐的多。</b>',
      '<b>一个课能断万事万物，比如还可以断环境影响、家庭成员、亲戚朋友等等。远近可断，未来能解，岂是几句话能讲的清。</b>',
      '<b>即</b>：<b>同一个课，可以断财运、可以断婚姻、可以断工作、可以断环境、可以断家人。</b>',
      '<b>为什么？</b>',
      '<b>因为"全息"</b> ——<b>课内的任何信息都是你的信息，只是看的角度不同。</b>',
      '<b>所以学到最后</b> ——<b>不是"一个课只能断一件事"，而是"一个课能断很多事，关键看你怎么问"。</b>',
    ]},
    { t: '第十二章　专题深化：求财·求官·工作', rows: [
      '<b style="color:var(--c-gold)">引言</b>',
      '<b>这一章讲什么</b>',
      '上一章讲了分类断课的基本框架。',
      '<b>这一章把"求财""求官""工作"三个最常用的门类讲深。</b>',
      '<b>为什么要深化？</b>',
      '<b>因为这三个门类是求测中最常见的</b>：',
      '<b>求财</b> ——最常见的求测事项',
      '<b>求官/升职</b> ——有工作的人常问',
      '<b>工作变动/跳槽</b> ——现代人常问',
      '<b>而且这三者之间有微妙的关系</b>：',
      '<b>求财不求官，求官不求财。</b>',
      '<b>即</b>：<b>财动伤官、官动伤财</b> —— <b>课理上，这两样不能同时求。</b>',
      '<b>但有两个例外，要记住</b>：',
      '<b>官动逢合</b> —— <b>可得官中之物</b>（"合得官中物"）；',
      '<b>官动再逢贼动</b> —— 那就成了 <b>"损财去买官"</b>。',
      '---',
      '<b style="color:var(--c-gold)">第一节　求财的完整体系</b>',
      '<b>一、四个条件</b>',
      '<b>求财首先要注意求财的条件：</b>',
      '<b>1. 财动。2. 财爻旺相。3. 外生内。4. 青龙旺相。</b>',
      '<b>1.1 财动</b>',
      '<b>财动 = 将神克贵神。</b>',
      '<b>财动必定得钱财。</b>',
      '<b>为什么？</b>',
      '<b>将神在四象所属图代表自己、妻子。贵神为尊上，财动克上，为人不孝敬、为财不尊。</b>',
      '<b>将神为财物为内财，克贵神即"内财搏外财"，以财求财，适合投资做生意求财。</b>',
      '<b>注意"为财不尊"</b> ——<b>财动是"我拿钱去赚别人的钱"，所以有"不尊长"的象。</b>',
      '<b>1.2 财爻旺相</b>',
      '<b>看财爻是否旺相。旺相财多，并且易得；财爻休囚死，得财难。</b>',
      '<b>财爻就是将神。</b>',
      '<b>1.3 外生内</b>',
      '<b>还有更好的求财方式是"外生内坐等来财"，比如贵神生将神、人元生将神。</b>',
      '<b>当然这是最好的求财方式了，叫"内外相生，四位相生百事吉"。</b>',
      '<b>外生内的三个层次</b>：',
      '| 生法 | 得财快慢 | 说明 |',
      '|---|---|---|',
      '| <b>贵神生将神</b> | <b>最快</b> | 直接生财爻 |',
      '| <b>人元生将神</b> | <b>晚</b> | 隔合，<b>隔手求财必有落息</b>（本来得10万，到手9万） |',
      '| <b>人元生地分</b> | <b>更晚</b> | 中间隔二神 |',
      '<b>另外</b>：',
      '<b>人元生贵神是"官合相生"得官中财务。这样的得财大多指器物或礼物，比如单位发福利——一般财物的多，直接发现金的少。</b>',
      '<b>1.4 青龙旺相</b>',
      '<b>求财最喜青龙旺。</b>',
      '<b>为什么？</b>',
      '<b>因为</b>：<b>青龙是"第一财神"</b> ——<b>青龙旺，财源旺；青龙被克，必破财。</b>',
      '<b>二、五种求财方式</b>',
      '<b>求财的方法：1. 买卖求财，2. 合作求财，3. 官中求财，4. 外财，5. 劫财等。</b>',
      '<b>求财的性质</b>：',
      '<b>自主求财</b> ——<b>需要勤力</b>',
      '<b>坐等来财</b> ——分<b>暗财、明财</b>',
      '<b>内克外</b> ——<b>辛苦出外求财</b>',
      '<b>偏财</b> ——属于<b>阴生阴、阳生阳</b>，再就是<b>天干生内</b>',
      '<b>三、财动逢空的三种情形（重点）</b>',
      '<b>"财动必得财"是有条件的</b>。',
      '<b>求财最喜欢的是见财动，财动必得财。但是财动要分旺动还是休死空动，这样所求之财也会分大小，还有财动空动不得反失的问题。</b>',
      '<b>3.1 将神逢空休死而发动——不得反失</b>',
      '<b>将神逢空休死发生财动，就是等于自身有求财条件而自身能力不足硬去求财，结果是白白投入不得回报。</b>',
      '<b>打个比方</b>：',
      '<b>自己没钱，却硬要做大生意</b> ——<b>结果赔本。</b>',
      '<b>3.2 贵神逢空发生财动——空动</b>',
      '<b>如果是贵神逢空发生财动，也是空动。这样的情况，如果是旺动，还有求财的机会，只是需要时机；但如果是只问此次求财，则是无财可求。这样的求财损失不会大。</b>',
      '<b>分两种</b>：',
      '<b>旺动</b> ——还有机会，但要等时机',
      '<b>只问此次</b> ——无财可求，但损失不大',
      '<b>3.3 二神俱空——空手套白狼</b>',
      '<b>贵神将神都逢空，也属于空动。这样就是属于"空手套白狼"的求财，属于虚假求财，适合中介工作，但一般情况下是不能得财的。</b>',
      '<b>二神逢空求事稀松，这样的求财有幻想成分。</b>',
      '<b>为什么"适合中介"？</b>',
      '<b>因为</b>：<b>中介本来就是"空手"</b> ——<b>两头都不实际拥有，靠信息差赚钱。</b>',
      '<b>四、用神位置与求财方式</b>',
      '<b>如果用神在将神旺相发动财动，必定能得财。这样情况一般是以财求财，比如做生意等。</b>',
      '<b>用神在贵神财动，自身辛苦求财。因为自身受克了，还要结合是什么贵神具体分析什么方面的求财。</b>',
      '<b>按贵神细分</b>：',
      '| 贵神 | 求财方式 | 为什么 |',
      '|---|---|---|',
      '| <b>勾陈（辰）</b> | <b>是非争斗求财</b> | 辰为是非之神 |',
      '| <b>朱雀（午）、腾蛇（巳）</b> | <b>文字求财</b> | 火主文书 |',
      '| <b>白虎（申）</b> | <b>奔波求财、是非求财不顺</b> | <b>火克金，必定求事不顺还会有凶灾——这是险中求财</b> |',
      '<b>五、破财的细分</b>',
      '<b>5.1 总则</b>',
      '<b>凡是外来克内都主破财。只是将神代表财爻，等于你的钱包财库，将神受克钱财先失，这个道理一定要明白。</b>',
      '<b>四位中谁受克谁出问题。</b>',
      '<b>5.2 分位断法</b>',
      '| 位置 | 受克的后果 |',
      '|---|---|',
      '| <b>贵神</b> | <b>工作受牵制</b>（贵神代表工作长辈） |',
      '| <b>人元克贵神</b> | <b>斩官</b> ——外来克制你的工作，我方工作必定受损 |',
      '| <b>贵神（外财）</b> | 受克也是破财 ——工作没有了没有收入是破财 |',
      '| <b>将神</b> | <b>更是直接破财</b> |',
      '| <b>地分</b> | <b>受克动老本</b> |',
      '<b>5.3 地分受克的三种情况</b>',
      '<b>一是妻动（人元克地分），必定牵涉女人或孩子，这样的克内受损较轻，因为中间隔着二层。</b>',
      '<b>中间隔克（贵神克地分）也是隔克，但近了一层，大多因为工作投资、生意投资，财可得但会晚。</b>',
      '<b>将神克地分，是"财克财必有损"；地分克将神也是必定有损，但事出内部，属于自我消耗。</b>',
      '<b>整理</b>：',
      '| 情况 | 断法 |',
      '|---|---|',
      '| <b>人元克地分（妻动）</b> | 牵涉女人或孩子，<b>受损较轻</b> |',
      '| <b>贵神克地分</b> | 隔克，<b>财可得但会晚</b> |',
      '| <b>将神克地分</b> | <b>财克财必有损</b> |',
      '| <b>地分克将神</b> | <b>自我消耗</b>（为房子孩子花钱） |',
      '<b>5.4 耗财、损财、破财的区别（重要）</b>',
      '<b>耗财损财属于自身原因造成，是本意为之或自愿的</b> ——比如我花钱买东西了是耗财，自我消耗消费，个人情愿的。',
      '<b>损财</b>虽也有此意，但更倾向于<b>自身不慎耗财</b>。',
      '<b>而破财是属于外来侵害、制约、压制等意的财物流失，不受自我意愿控制</b> ——比如被强制缴费、被偷被抢等外力原因造成。',
      '<b>将神受克，是破财伤身的主要信号。把将神当做你的钱包就好理解了。</b>',
      '<b>但"受克"只是信号，断到什么程度还要看旺衰与逢空</b> —— <b>旺相受克多主破耗，休死受克才要防财、身两头受损。</b>',
      '<b>六、求财最怕贼动</b>',
      '<b>求财最怕的是贼动，也就是贵神克将神，外来克内、外来索取。</b>',
      '<b>6.1 什么情况下是内外勾结</b>',
      '<b>并不是所有的贼动都是内外勾结。有破门窗入户的盗窃，不一定就是内外勾结，这也是贼动。</b>',
      '<b>内外勾结是二神的干五合，属于内外勾结；或者地分生贵神。</b>',
      '<b>天干为外围纽带，这是里外串联；地分生贼更是家有接引内贼作案——这样的贼动最可怕，损失是最大的。</b>',
      '<b>两个判定标准</b>：',
      '<b>二神的干五合</b> ——<b>里有内线</b>',
      '<b>地分生贵神</b> ——<b>家有接引</b>',
      '<b>6.2 贼动的其他断语</b>',
      '<b>贼动逢空</b> ——不断失（没丢，或看到别人失窃）',
      '<b>财动逢空</b> ——不得财或破财',
      '<b>贼动 + 玄武</b> ——主失盗',
      '<b>七、财神</b>',
      '<b>诀窍：寅为第一财神，无论寅在哪个位置受克，都会破财，百用百验。</b>',
      '<b>因为卯也是仅次于寅的财神，受伤也破财。</b>',
      '<b>两个"第一财神"</b>：',
      '<b>寅</b> ——<b>地支中的第一财神</b>',
      '<b>乙</b> ——<b>木行中的第一财神</b>（「乙木无论在哪个位置被克，必定破财」）',
      '<b>八、其他求财要点</b>',
      '<b>8.1 土为库</b>',
      '<b>土为库——财稳坚固主大富；"水火不求财"。</b>',
      '<b>即</b>：',
      '<b>土</b> ——<b>库，财稳、主大富</b>',
      '<b>水火</b> ——<b>不求财</b>（水火相战，财留不住）',
      '<b>8.2 求财要"有能力"</b>',
      '<b>求财须有能力——休囚死空则有心无力。</b>',
      '<b>即</b>：<b>用神休囚死空，说明自己没有能力求财。</b>',
      '<b>8.3 化解是为了通关</b>',
      '<b>化解是为了通关，不是为了克。</b>',
      '<b>化解三层次</b>：',
      '<b>安抚</b> ——顺着它，不激化',
      '<b>克制</b> ——必要时才用',
      '<b>通关</b> ——最理想的办法',
      '---',
      '<b>九、课式实证：把六条线走一遍</b>',
      '<code>`</code>',
      '月建：巳　太岁：辰　日支：子　时支：午',
      '人元：甲　　木 + 旺',
      '贵神：丁巳（腾蛇）用　火 - 相　（临月建）',
      '将神：丙辰（天罡）　土 + 死　（临太岁）',
      '地分：甲寅　　木 + 旺　（带驿马）',
      '<code>`</code>',
      '<b>问事</b>：求事业财运。',
      '<b>第一，看四个条件</b>',
      '<b>财动</b> —— <b>财动是"将神克贵神"</b>。这一课<b>将神丙辰土、贵神丁巳火</b> —— <b>火生土</b>，是<b>贵神生将神</b>，<b>不是财动</b>；',
      '<b>财爻旺相</b> —— <b>财爻就是将神</b>。这一课<b>将神丙辰土处在"死"地</b>（木旺克土）—— <b>不旺</b>；',
      '<b>外生内</b> —— <b>人元甲木生贵神丁巳火、丁巳火生将神丙辰土</b> —— <b>一路往下生</b>，<b>外生内成立</b> ✓',
      '<b>青龙旺相</b> —— 这一课<b>没有青龙</b>（贵神是腾蛇）。',
      '<b>四个条件里只占一个"外生内"</b> —— 所以这一课的求财，<b>底子是有的，力度不够</b>。',
      '<b>第二，看五种求财方式</b>',
      '这一课是<b>外生内</b> —— 属<b>坐等来财</b>：<b>外面的人送上门，不用自己出去挣</b>。',
      '<b>第三，看财动逢空</b>',
      '这一课<b>没有财动</b> —— 这一条不涉及。',
      '<b>第四，看用神位置</b>',
      '<b>用神在贵神丁巳</b>（四位甲阳、巳阴、辰阳、寅阳 —— <b>三阳一阴，以阴为用</b>，阴在贵神）。',
      '<b>用神落在贵神，主这件事与工作门路有关</b> —— 所以<b>这份财是从工作里来的，不是做买卖来的</b>。',
      '<b>第五，看破财</b>',
      '<b>有没有破财的迹象？</b>',
      '<b>人元甲木克将神丙辰土</b> —— <b>克将神，就是"对方来索取"</b>；',
      '<b>但中间隔着丁巳火</b> —— <b>木得先经过火，才能克到土</b>，<b>隔了一层</b>。',
      '<b>所以这个"索取"是有的，但要打折扣</b> —— <b>本来想要一百，实际拿走十块二十块</b>。这就是"<b>隔手</b>"。',
      '<b>第六，看财神</b>',
      '<b>这一课没有青龙</b>（第一财神）—— 少了这一层助力。',
      '<b>走完六条线，断语就出来了</b>',
      '<b>这份工作能生财</b>（贵神火生将神土），<b>而且是"坐等来财"</b> —— <b>外面的人来帮你，不用自己出去跑</b>。<b>但财爻本身不旺（将神处死）</b>，所以<b>来得不快、也不会很大</b>。',
      '<b>另外要防着有人来分好处</b>（人元克将神），<b>好在隔着一位，分得不会太狠</b>。',
      '<b>这就是"完整体系"的用法</b> —— <b>六条线走一遍，一条不漏，断语自然就出来了，而且每一条都指得出出处。</b>',
      '<b style="color:var(--c-gold)">第二节　求官的完整体系</b>',
      '<b>一、六个条件</b>',
      '<b>断求官时首先要明确其课内的存在条件是什么：</b>',
      '<b>1. 贵神官爻旺相。2. 官动。3. 鬼动。4. 将神生贵神。5. 外来生内。6. 临岁月不空。</b>',
      '<b>逐条</b>：',
      '| 条件 | 含义 |',
      '|---|---|',
      '| <b>贵神官爻旺相</b> | <b>官星有力</b> |',
      '| <b>官动</b> | 有"官"的动向 |',
      '| <b>鬼动</b> | 下克上，有进取之象 |',
      '| <b>将神生贵神</b> | 以财求官 |',
      '| <b>外来生内</b> | 有提拔 |',
      '| <b>临岁月不空</b> | 时机到位 |',
      '<b>二、利官的贵神</b>',
      '<b>特别要注意几个贵神的出现：青龙、朱雀、贵人。</b>',
      '<b>青龙旺必有官，一般是文官；申为武官，见火做军人。戊寅文武双全之人。</b>',
      '| 贵神 | 主什么 |',
      '|---|---|',
      '| <b>青龙</b> | <b>文官</b> |',
      '| <b>申（白虎）</b> | <b>武官</b> |',
      '| <b>见火</b> | <b>军人</b> |',
      '| <b>戊寅</b> | <b>文武双全</b> |',
      '<b>三、官职大小</b>',
      '<b>凡是用神或贵神临太岁月建日建，都为有管理职能的人，大多有官职。</b>',
      '<b>临太岁官大，如果是真太岁入课则是大官正职；如果不是真太岁入课也是有官之人，也有大的职称。这样的官职属于"拿着皇帝圣旨做事的人"，不是皇帝但能起到皇帝的能力。</b>',
      '<b>临月建日建相同道理，只是从太岁依次而下，官职分大小。</b>',
      '<b>如果官爻逢空旺相，指有职无权之人——戴着官帽不管其事。</b>',
      '<b>但凡见课依次克上，大多是有能力之人，主富贵。</b>',
      '<b>要点</b>：',
      '| 情况 | 断法 |',
      '|---|---|',
      '| <b>临太岁</b> | <b>官最大</b> |',
      '| <b>真太岁入课</b> | <b>大官正职</b> |',
      '| <b>临月建、日建</b> | <b>依次而下，官职分大小</b> |',
      '| <b>官爻逢空旺相</b> | <b>有职无权</b> |',
      '| <b>依次克上</b> | <b>有能力之人，主富贵</b> |',
      '<b>"真太岁"与"假太岁"</b>：',
      '<b>怎么分？</b>',
      '<b>真太岁</b> —— <b>太岁的干支与课内某位完全相同</b>（比如戊子年，课内见戊子）。这是<b>正的支撑</b>，主<b>最大的官职</b> —— <b>真太岁必定是正值</b>。',
      '<b>假太岁</b> —— <b>只同地支、不同天干</b>（比如戊子年，课内见甲子、庚子、壬子）。它不是真正的太岁，但<b>"打着皇帝的旗号、拿着圣旨办事"</b> —— <b>不是真皇帝，能力却很大</b>。',
      '<b>所以真假之分不在"力量大小"，而在"性质"</b>：真的是正职、是实权；假的是有官之人、是"拿着圣旨做事的人"。',
      '<b>月建也有真假，分法一样</b> —— 看天干。',
      '<b>四、求官的方式（八条）</b>',
      '<b>1. 将神生贵神，以财升官。</b>',
      '<b>2. 外生内，上有提拔。</b>',
      '<b>3. 鬼动，外出求官。</b>',
      '<b>4. 逢驿马、天马，快速升职。</b>',
      '<b>5. 父母动为印绶，带官印。</b>',
      '<b>6. 驿马带鬼动，离开原地出外升职。</b>',
      '<b>7. 官动不带马星，原地提升。</b>',
      '<b>8. 神煞影响，忌见五鬼、马倒、禄倒、天罗地网、飞廉、劫命灾煞、关隔锁等。</b>',
      '<b>整理成表</b>：',
      '| 情况 | 断法 |',
      '|---|---|',
      '| <b>官动 + 二马</b> | <b>异地升迁（快速）</b> |',
      '| <b>官动不带马星</b> | <b>原地提升</b> |',
      '| <b>鬼动 + 二马</b> | <b>必挪地方</b> |',
      '| <b>父母动</b> | <b>印绶，带官印</b> |',
      '| <b>将神生贵神</b> | <b>以财升官</b> |',
      '| <b>外生内</b> | <b>上有提拔</b> |',
      '<b>五、官动逢空</b>',
      '<b>官动逢空一般指不得官，空欢喜一场。但凡事需要铺垫谋划，事在人为——这是说有求官的机会，命里有官运，能不能把握又是一回事。</b>',
      '<b>逢空与求财道理差不多，有旺空、休空、死空。如果空动再逢冲刑，则求事无成。</b>',
      '<b>旺空没有外因加害，则需要等待时机和人为求谋。最有利的一点就是逢空临时辰，这叫"得天机"，一样能升职。</b>',
      '<b>要点</b>：',
      '| 情况 | 断法 |',
      '|---|---|',
      '| <b>官动逢空</b> | <b>不得官，空欢喜</b> |',
      '| <b>旺空</b> | <b>可等时机</b>；<b>逢空临时辰"得天机"</b> |',
      '| <b>空动再逢冲刑</b> | <b>求事无成</b> |',
      '<b>六、最怕斩官</b>',
      '<b>求官最不利的因素是遇到斩官，也就是人元克贵神。这样的情况别说是求官，最大的问题是能否保住原有官职。</b>',
      '<b>官动利求官，无官诉讼连。无官之人逢官动必有诉讼，也符合"求官不成遭诉讼"。</b>',
      '<b>斩官 = 人元克贵神</b> ——<b>求官的大忌。</b>',
      '<b>七、官动的两面性</b>',
      '<b>官动利求官，相逢禄位迁，常人官府事，有官望财难。</b>',
      '<b>对不同的人，官动的意义相反</b>：',
      '| 求测者 | 官动的意义 |',
      '|---|---|',
      '| <b>有官之人</b> | <b>利求官升职</b> |',
      '| <b>无官之人</b> | <b>诉讼纠纷</b> |',
      '<b>"有官之人上克人元就是自己的能力强，要超过目前状态；无官之人是找上级提意见。"</b>',
      '<b>八、官财不两求</b>',
      '<b>财官不两求 —— 官动不求财，财动不求官。</b>',
      '<b>道理很直白</b>：<b>官动伤财</b>（贵神被克，外财受损），<b>财动伤官</b>（将神克贵神，把官克得无力）。',
      '<b>但课理之外还有人情</b> —— 官动逢合可以得官中之物，官动再逢贼动就是损财买官。<b>断的时候先把这条原则立住，再看有没有例外。</b>',
      '<b>为什么？</b>',
      '<b>官动</b> ——<b>利求官不利求财</b>（但官动而逢合，官中财物易得）',
      '<b>财动</b> ——<b>求官大忌</b>（财动伤官，将神克泄了贵神的力量）',
      '<b>有一条例外</b>：',
      '<b>合得官中物。官动而逢合，官中财物可得。</b>',
      '<b>九、求官的忌神煞</b>',
      '<b>禄倒</b>：',
      '<b>甲卯乙辰丙戊午，丁巳未庚酉辛戌，壬子癸丑是禄倒，入课官损事难成。</b>',
      '<b>取太岁年干为用。如甲年见卯入课，或年、月、日、时卯限，逢课中见限，问病者主大凶，须尽早医治；问官者主失职权。</b>',
      '<b>马倒</b>：',
      '<b>寅午戌见酉，申子辰见卯，巳酉丑见子，亥卯未见午。</b>',
      '<b>马倒者主百事不顺，求事阻隔，病者大凶，且不宜求官。</b>',
      '<b>天罗地网</b>：',
      '<b>罗网牢狱官司凶，失物不还贼易损。行人不通受阻隔，冲破罗网关节通。</b>',
      '<b>其他</b>：',
      '<b>五鬼</b> ——出行办事损财、损车',
      '<b>飞廉</b> ——主快、主惊恐',
      '<b>关隔锁</b> ——求名难',
      '<b>十、求官歌</b>',
      '<b>官神旺相利求官，官动加身官事连，百姓官动惊官府，有官之人却喜欢。</b>',
      '<b>鬼动官动最为吉，更喜天驿二马现。升官加爵随迁外，不见二马也升官。</b>',
      '<b>内生外调细分辨，官爻逢空无实权。岁月临身贵人助，倘若临岁官位显。</b>',
      '<b>青龙文官白虎武，旺相逢合必有官。官动再有贼来动，定主损财去买官。</b>',
      '<b>官动求官人不孝，倘若克刑成事难。</b>',
      '<b>逐句要点</b>：',
      '<b>官神旺相利求官</b>',
      '<b>鬼动官动最为吉，更喜天驿二马现</b>',
      '<b>内生外调细分辨</b> ——<b>内生为本地升迁，外调为调往外地</b>，要先分清是哪一种',
      '<b>官爻逢空无实权</b>',
      '<b>岁月临身贵人助，倘若临岁官位显</b>',
      '<b>青龙文官白虎武</b>',
      '<b>官动再有贼来动，定主损财去买官</b> ——<b>这是"买官"之象</b>',
      '<b>官动求官人不孝</b> ——因为官动是"克上"，所以主"不孝"',
      '<b>十一、求官十三条</b>',
      '<b>1. 求官以贵神为官爻，旺相利于求官，休囚死无官运。</b>',
      '<b>2. 如见刑冲克害，官有损或罢职，贵神落空亡，主无官或有名无实之官。</b>',
      '<b>3. 官动见驿马、天马，主升官远迁。</b>',
      '<b>4. 贵神临太岁月建，如旺相是高官，休死为小官。</b>',
      '<b>5. 见课内外有三合，主兼职。</b>',
      '<b>6. 问调动，见二马主快，见官爻旺相，主调动成功。</b>',
      '<b>7. 见合主事情已经决定，见生为有帮助之人，空亡月破必定不成。</b>',
      '<b>8. 求官课，用爻在财爻，因财升官或因经营业绩好而提官。</b>',
      '<b>9. 用爻在财爻主借助女人的力量而升官；课中见争合，主多人相争或多种选择。</b>',
      '<b>10. 课中见官，又见鬼动，官鬼同动必升职，并且迁官转职。</b>',
      '<b>11. 求官课中，没有官动，见天马驿马临身出现，也能升迁。</b>',
      '<b>12. 用爻临太岁月建，主有上层人物或领导相助（也包括长辈）；官爻逢空亡，主无实力，或心有余而力不足空想。</b>',
      '<b>13. 官动不见驿马天马、鬼动，原地升官，不出原范围内。</b>',
      '---',
      '<b>十二、课式实证：求官条件的逐条核对</b>',
      '<code>`</code>',
      '干支：戊子年　辛酉月　己卯日　辛未时',
      '月将：辰　日空：申、酉　四大空亡：无',
      '人元：癸　　水 - 旺',
      '贵神：甲子（玄武）　水 + 旺　六甲',
      '将神：庚午（胜光）用　火 + 死　月德',
      '地分：酉　　金 - 休　截路',
      '<code>`</code>',
      '<b>这一课在第十一章出现过</b> —— 那里用它断"职位是几把手"；<b>这里换一个角度</b>，用它把求官的六个条件逐条核对一遍 —— <b>同一个课，问法不同，看的线也不同。</b>',
      '<b>问事</b>：她老公的职位。',
      '<b>把这一章的六个条件逐条核对</b>：',
      '<b>① 贵神官爻旺相</b> —— <b>贵神甲子水，正当旺</b> ✓ <b>占住了</b>。',
      '<b>② 官动</b> —— <b>官动是"贵神克人元"</b>。这一课<b>贵神子水、人元癸水</b> —— <b>同为水，比和</b> —— <b>不是官动</b> ✗',
      '<b>③ 鬼动</b> —— <b>鬼动是"地分克人元"</b>。这一课<b>地分酉金、人元癸水</b> —— <b>金生水</b> —— <b>不是鬼动</b> ✗',
      '<b>④ 将神生贵神</b> —— <b>将神庚午火、贵神甲子水</b> —— <b>水克火</b>，这是<b>贵神克将神</b>（贼动）✗',
      '<b>⑤ 外来生内</b> —— 这一条要看方向：<b>地分是内、人元是外</b>，<b>地分酉金生人元癸水是"内生外"</b>；<b>贵神甲子水与人元癸水同类，属比和</b> —— 所以<b>"外来生内"并不成立</b> ✗（<b>内生外也算一条路子，只是不如外来生内</b>）',
      '<b>⑥ 临岁月不空</b> —— 这一条看的是<b>官爻</b>：<b>官爻是贵神甲子水，不逢空，又临太岁（假太岁）</b> ✓ <b>占住了</b>；<b>要注意地分酉正逢日空</b> —— 那是<b>外部条件虚</b>，与官爻本身无关',
      '<b>六个条件里占了两条</b>（贵神旺、外来生内）。',
      '<b>那么，怎么还断出"有管理权的小头目、四把手"？</b>',
      '<b>因为求官不只看条件够不够，还要看"位次"。</b> 这一课用的是<b>数位次</b>的方法：',
      '<b>太岁为戊子，戊土为老大</b> —— <b>戊一、庚二、壬三、甲四、丙五</b>。',
      '<b>贵神是甲子，甲木排第四</b> —— 所以断<b>"四把手"</b>。',
      '<b>这一课给我们的启示有两条</b>：',
      '<b>第一，条件够不够，决定"有没有官"；位次排第几，决定"官有多大"。</b>',
      '<b>第二，条件不满，不等于没有官</b> —— <b>要看是哪几条占了</b>。这一课占的是"贵神旺 + 外来生内"，主<b>位置稳、外面有扶助</b>，所以断"是个有管理权的小头目"，而不是"没官"。',
      '<b style="color:var(--c-gold)">第三节　工作与求职</b>',
      '<b>一、求职的条件</b>',
      '<b>求职与求官相类似，也需要具备一些必须的条件：</b>',
      '<b>1. 用神旺相。2. 外生内，内生外。3. 三合、六合。</b>',
      '<b>逐条</b>：',
      '| 条件 | 含义 |',
      '|---|---|',
      '| <b>用神旺相</b> | <b>自身有能力</b> |',
      '| <b>外生内，内生外</b> | 有来有往 |',
      '| <b>三合、六合</b> | 有合作、有缘分 |',
      '<b>二、求职与求官的区别</b>',
      '<b>求职与求官不同的是，求职只关乎成败，不存在损失（当然送礼除外）。</b>',
      '<b>即</b>：',
      '<b>求官</b> ——<b>成了升官，不成可能惹官司</b>',
      '<b>求职</b> ——<b>成了有工作，不成就是没成，没有额外损失</b>',
      '<b>三、求职的核心</b>',
      '<b>求职最主要条件就是用神旺相。如果逢空、休死，代表自身没有能力求职，或者自身没有能力任职此工作。</b>',
      '<b>几条断语</b>：',
      '<b>外克内求事不成</b> ——<b>外面压制我，求不到</b>',
      '<b>内克外出外工作</b> ——<b>我克外面，要出去找工作</b>',
      '<b>特别是鬼动，人出外</b> ——<b>鬼动主"出去"</b>',
      '<b>如果将神克地分，也是不适合在家</b> ——<b>将神克地分主"想出去"</b>',
      '<b>四、求职最忌官动</b>',
      '<b>求职最忌官动——求职不是谋职。</b>',
      '<b>为什么？</b>',
      '<b>因为</b>：<b>官动主诉讼纠纷</b> ——<b>求职是找工作，见官动反而不吉。</b>',
      '<b>有一条对比</b>：',
      '<b>贵神克将神不利求职，却利于求名。</b>',
      '<b>为什么？</b>',
      '<b>求职</b> ——<b>要"顺利入职"，最怕"被压制"</b>',
      '<b>求名</b> ——<b>要"有压力才有动力"，所以"被压制"反而好</b>',
      '<b>五、工作变动的断法</b>',
      '<b>5.1 看贵神</b>',
      '<b>问工作情况，我们首先要看的是贵神的。</b>',
      '<b>因为贵神代表工作。</b>',
      '<b>5.2 看驿马</b>',
      '<b>谁带驿马谁想动——贵神带驿马工作要动。</b>',
      '<b>5.3 看冲</b>',
      '<b>不同的地支相冲，主不同的变动结果</b> —— 按地支分三类：',
      '| 相冲的两支 | 主什么事 |',
      '|---|---|',
      '| <b>子午、卯酉</b> | <b>地域之冲</b> —— <b>居住地变迁，职业不变</b> |',
      '| <b>寅申、巳亥</b> | <b>职业之冲</b> —— <b>居住地和职业都变</b> |',
      '| <b>辰戌、丑未</b> | <b>职业之冲</b> —— <b>居住地不变，职业变动</b> |',
      '<b>所以听到"工作要动"，先看冲的是哪一组</b>：是换了地方、还是换了行当，还是两样一起换。',
      '<b>5.4 看空亡</b>',
      '<b>贵神空不实际工作、有职无权；贵神空不生驿马，则领导不赞成调动。</b>',
      '<b>即</b>：',
      '<b>贵神空</b> ——工作不实际、有职无权',
      '<b>贵神空 + 驿马</b> ——<b>领导不赞成调动</b>（因为贵神空，生不了驿马）',
      '<b>5.5 看合</b>',
      '<b>调动的成与不成，要看"见合"与"见生"</b>：',
      '<b>即</b>：',
      '<b>见合</b> ——<b>事情已经决定</b>',
      '<b>见生</b> ——<b>有帮助之人</b>',
      '<b>5.6 现代工作的特点</b>',
      '<b>古今的"工作"不一样，断法也要跟着调整</b>：',
      '<b>现代工作生活缤纷多彩 —— 跳槽、换工作已经是常事，工作与财运方面的求测也极为普遍。</b>',
      '<b>即</b>：<b>现代人问工作，多是"跳槽""换工作""升职"</b> —— <b>这与古代的"求官"不完全一样</b>：古人的官位相对固定，现在一份工作做三五年就换，很常见。',
      '<b>所以断现代的工作，要把握两点</b>：',
      '<b>"动"的频率高</b> —— 驿马、相冲这些"动"的信号，落点比古代更实；',
      '<b>求工作往往连着求财</b> —— 换工作多半为了收入，断的时候<b>工作和财要一起看</b>。',
      '<b>5.7 三层力量的先后（重要）</b>',
      '<b>四柱对课内的作用不是一把抓的，要分层看</b>：',
      '<b>临月建者大</b> —— <b>离得最近，力度最大</b>；',
      '<b>临太岁者远</b> —— <b>管得宽，但离得远，主一年之内的趋势</b>；',
      '<b>临日时者小</b> —— <b>只管当下这一段</b>。',
      '<b>还有一条层级的规矩</b>：',
      '<b>太岁与月建都来克你的课，这件事今年就不必做了</b> —— 上下都不支持。',
      '<b>反过来，月建支持、太岁也支持，但日时来冲克你</b> —— 那也<b>暂时做不成，得等一等</b>。',
      '<b>即</b>：<b>一级一级按章法来，不要跳级</b>。<b>年月是大环境，日时是眼前</b>；大环境好、眼前不顺，是"<b>时机未到</b>"；大环境不好，眼前再顺也是"<b>白费劲</b>"。',
      '<b>5.8 天干也要与流年对照</b>',
      '<b>断流年，不只是地支 —— 天干也要逐一看</b>：',
      '<b>天干体现"人的象义"的成分比较大；如果课内的天干与流年天干相合，信息就比较明显。</b>',
      '<b>即</b>：断流年时，<b>课内四位的天干与流年天干有没有合、有没有克</b>，也要逐条比一遍。',
      '<b>这里有一条态度</b>：',
      '<b>多讲一句累不死。</b>',
      '<b>课内每一个干支都要与流年比过</b> —— 不能只比三个地支就完事。<b>全息的意思就是：课里的每一处都关乎自己，只是分工不同。</b>',
      '<b>六、工作性质的判断</b>',
      '<b>几个判据</b>：',
      '<b>看贵神</b> ——<b>贵神主什么，工作就与什么有关</b>',
      '<b>看用神位置</b>：',
      '<b>用神在贵神</b> ——<b>专为工作事来的，凭真本事问工作情况</b>',
      '<b>用神在将神</b> ——<b>有动财求工作的性质</b>',
      '<b>看五行</b>：',
      '<b>火</b> ——<b>文化、文字、火电</b>',
      '<b>水</b> ——<b>流动性、机密性工作</b>',
      '<b>金</b> ——<b>军警、政法、机械</b>',
      '<b>木</b> ——<b>文化教育、媒介信息</b>',
      '<b>土</b> ——<b>土能纳万物，涉及的职业最多，以易学、教育、餐饮为突出</b>',
      '<b>七、所学专业与工作是否对口</b>',
      '<b>所学专业与现在的工作对不对口，看地分与贵神的关系。</b>',
      '<b>为什么？</b>',
      '<b>因为</b>：<b>地分代表"原始部分、历史部分"</b> ——<b>也就是"过去学的东西"。</b>',
      '<b>而贵神代表"现在的工作"。</b>',
      '<b>所以</b>：<b>地分与贵神的关系，就反映"专业与工作"的关系。</b>',
      '---',
      '<b>八、课式实证：行业与对不对口</b>',
      '<code>`</code>',
      '干支：丙申年　甲午月　乙亥日　壬午时',
      '月将：未　日空：申、酉　四大空亡：无',
      '人元：戊　　土 + 死',
      '贵神：壬午（朱雀）　火 + 相　吊客',
      '将神：己卯（太冲）用　木 - 旺',
      '地分：寅　　木 + 旺　天德合、天喜、天马',
      '<code>`</code>',
      '<b>问事</b>：一位男士求测事业财运（1986 年属虎）。',
      '<b>先定旺衰</b>：四位是<b>土、火、木、木</b> —— <b>木占两位</b>，而<b>克木的金课内没有</b> —— 所以<b>木旺</b>。木旺则<b>火相</b>（木生火）、<b>土死</b>（木克土）、<b>水休</b>（生木者）、<b>金囚</b>（克木者）。',
      '标到四位上：人元戊土<b>死</b>、贵神壬午火<b>相</b>、将神己卯木<b>旺</b>、地分寅木<b>旺</b>。',
      '<b>第一条断语："你的工作与文化教育、网络信息、电子有关。"</b>',
      '<b>依据在贵神壬午 —— 午火</b>。<b>午火主文明、主信息、主电子</b> —— 反馈：<b>做信息设备生意的</b>。',
      '<b>再看"专业对不对口"</b> —— 用这一节讲的那条：<b>看地分与贵神的关系</b>。',
      '<b>地分是寅木，贵神是壬午火</b> —— 再加上将神卯木 —— <b>课内寅、卯二木与午火，构成"火局之势"</b>。',
      '<b>木生火 —— 学的是木（基础、知识），用的是火（信息、电子）—— 学的正好能生到用的上面。</b>',
      '<b>所以断"专业对口、学以致用"。</b>',
      '<b>再看几个神煞</b>：',
      '<b>地分寅带天德合、天喜、天马</b> —— <b>三个都落在地分上</b>：<b>天德合主有贵人扶持、天喜主喜庆和合、天马主远行奔走</b> —— <b>合起来是"这股助力从根底上来，而且是动的"</b>；',
      '<b>贵神壬午带吊客</b> —— <b>吊客主忧患</b>，落在贵神（外面、工作）上，主<b>工作上有些烦心的事</b>。',
      '<b>这一课给我们的启示</b>：',
      '<b>断工作分两步走</b>：<b>先看贵神，定"是什么行业"</b>（午火＝信息、电子）；<b>再看地分与贵神的关系，定"对不对口"</b>（木生火＝所学能派上用场）。',
      '<b>两个问题分开问、分开答，就不会混。</b>',
      '<b style="color:var(--c-gold)">第四节　求财求官的配合</b>',
      '<b>一、财官不两求</b>',
      '<b>财官不两求——官动不求财，财动不求官。</b>',
      '<b>在课里怎么体现？</b>',
      '<b>如果课里同时有官动和财动</b> ——<b>说明求测者"既想升官又想发财"。</b>',
      '<b>但</b>：',
      '<b>其实现代社会，官财是分不开的。有官就有财，有财也能买官。</b>',
      '<b>所以断课时要看</b>：',
      '<b>哪个意图更重</b> ——<b>官动重则求官，财动重则求财</b>',
      '<b>能不能兼得</b> ——<b>官动逢合，官中财物可得</b>',
      '<b>二、求官与求财的选择</b>',
      '<b>有一个判据</b>：',
      '<b>看课里"官"的力量与"财"的力量，哪个更重。</b>',
      '<b>即</b>：<b>看课里"官"的力量和"财"的力量哪个大。</b>',
      '<b>如果官旺财弱</b> ——<b>求官为主</b>',
      '<b>如果财旺官弱</b> ——<b>求财为主</b>',
      '<b>三、一条重要的提醒</b>',
      '<b>课中见官，又见鬼动，官鬼同动必升职，并且迁官转职。</b>',
      '<b>为什么"官鬼同动"最好？</b>',
      '<b>因为</b>：',
      '<b>官动</b> ——<b>有"官"的动向</b>',
      '<b>鬼动</b> ——<b>下克上，有"进取"的象</b>',
      '<b>两个合起来</b> ——<b>既有官运，又有进取心</b> ——<b>所以必升职。</b>',
      '---',
      '<b>四、课式实证：妻动与官动并见</b>',
      '<code>`</code>',
      '干支：癸巳年　甲寅月　乙丑日　庚辰时',
      '月将：亥　日空：戌、亥　四大空亡：水',
      '人元：壬　　水 + 死　天德合',
      '贵神：丙戌（天空）　土 + 旺　月德、天喜、飞廉',
      '将神：丁丑（大吉）用　土 - 旺　天德、天医、六丁',
      '地分：午　　火 + 休　天马',
      '<code>`</code>',
      '<b>问事</b>：证书什么时候能到。',
      '<b>先定旺衰</b>：四位是<b>水、土、土、火</b> —— <b>土占两位</b>，而<b>克土的木课内没有</b> —— 所以<b>土旺</b>。土旺则<b>金相</b>（土生金）、<b>火休</b>（生土者）、<b>木囚</b>（克土者）、<b>水死</b>（土克水）。',
      '标到四位上：人元壬水<b>死</b>、贵神戌土<b>旺</b>、将神丑土<b>旺</b>、地分午火<b>休</b>。',
      '<b>看这一课的两个动</b>：',
      '<b>人元壬水克地分午火</b>（水克火）—— <b>人元克地分</b>，这是<b>妻动</b>；',
      '<b>贵神丙戌土克人元壬水</b>（土克水）—— <b>贵神克人元</b>，这是<b>官动</b>。',
      '<b>妻动走的是"财"这一路</b>（我克者为妻财），<b>官动走的是"官"这一路</b>（克我者为官鬼）—— <b>两个动正好一头财、一头官</b>。',
      '<b>这一节讲"财官不两求"，而这一课两个都在</b> —— 正是看它们怎么互相作用的活标本：',
      '<b>官动在贵神</b>（丙戌土<b>旺</b>）—— <b>克着人元壬水</b>：<b>官的力量是实的</b>；',
      '<b>妻动在人元</b>（壬水<b>死</b>）—— <b>去克地分午火</b>：<b>财的力量是虚的</b>（水已死，克不动火）。',
      '<b>所以这一课的主调是"官重财轻"。</b>',
      '<b>这一课的断语正对得上</b>：',
      '<b>"此证与政法、文化部门有关"</b> —— <b>贵神丙戌主"文化的、政法的"这一块</b>；<b>官动在贵神，说明事情要经官方的门</b> ✓',
      '<b>"这个证件还没办完、正在办理"</b> —— <b>贵神丙戌正逢旬空</b>（日空戌、亥）→ 这是<b>"官动逢空"</b>：<b>官方的环节还没落实</b> ✓',
      '<b>再看三奇与吉神</b> —— 这是这一课最亮的地方：',
      '<b>人元带天德合</b>；',
      '<b>贵神带月德、天喜、飞廉</b>；',
      '<b>将神带天德、天医、六丁</b>；',
      '<b>地分带天马</b>。',
      '<b>天德、天德合、月德三德齐现</b>，<b>加上天喜、天医</b> —— <b>吉神几乎占满了</b>；<b>而三奇也在课内</b>（丁丑为用、日建入课带三奇）。',
      '<b>所以断"今日易于办理到手"</b> —— <b>凶不起来</b> ✓',
      '<b>这就是"财官并见"时的断法，两层</b>：',
      '<b>第一层，先分清哪一头实、哪一头虚</b> —— 这一课<b>官实财虚</b>，所以主调落在"官方的事"上；',
      '<b>第二层，再看吉神凶煞的分量</b> —— <b>三德齐现、三奇入课，凶象就被压住了</b>。',
      '<b>两个层面合起来，才断得出"今天能拿到"这个结论。</b>',
      '<b style="color:var(--c-gold)">第五节　化解与运筹</b>',
      '<b>一、化解的原则</b>',
      '<b>化解是为了通关，不是为了克。</b>',
      '<b>三层次</b>：',
      '<b>安抚</b> ——顺着它，不激化',
      '<b>克制</b> ——必要时才用',
      '<b>通关</b> ——最理想的办法',
      '<b>为什么"通关"最好？</b>',
      '<b>所谓"通则不痛，痛则不通"，五行流通了，问题自然缓解。</b>',
      '<b>二、化解的示范</b>',
      '<b>2.1 化解辰戌相冲</b>',
      '<b>化解辰戌相冲：不去直接克制辰或戌，而是引入一个"合"</b> —— 把冲突一方的力量<b>引开</b>。',
      '<b>用哪一个，是有讲究的</b>：',
      '<b>用酉</b> —— <b>酉合辰，酉又害戌</b>；但<b>戌对酉"礼让三分"</b>，所以<b>冲突较轻</b>。',
      '<b>用卯</b> —— <b>卯合戌，卯又克害辰</b>，<b>针对性强、破坏力大</b>；<b>若课内戌土正处死地、休囚，又被四柱冲</b>，才用卯。',
      '<b>要先看清"针对谁"</b> —— <b>是内冲外，还是外冲内</b>。',
      '<b>这个思路很妙</b> ——<b>不是硬碰硬，而是"疏导"。</b>',
      '<b>课式实证</b>：',
      '<code>`</code>',
      '人元：甲　　木 + 旺　六甲',
      '贵神：甲子（玄武）用　水 + 休　六甲',
      '将神：戊辰（天罡）　土 + 死　吊客',
      '地分：戌　　土 + 死　天喜、飞廉',
      '<code>`</code>',
      '<b>这一课将神是辰、地分是戌</b> —— <b>辰戌相冲</b> —— 而且<b>两位紧贴着冲</b> —— <b>是最直接的一对相冲</b>。',
      '<b>化解从哪儿下手？</b> <b>不能去压辰、也不能去压戌</b> —— <b>压哪一头，另一头只会更凶</b>。',
      '<b>先在课内找"能合住一方"的字</b>：',
      '<b>课内有子</b>（贵神甲子）—— <b>子合丑</b>，<b>合不到辰戌</b> —— 用不上；',
      '<b>课内有甲木</b> —— <b>木克土</b> —— <b>这是"克"，不是"合"</b> —— 用了就是硬碰硬。',
      '<b>课内没有可用的合神，就要外借一个字</b>：',
      '<b>借酉</b> —— <b>酉合辰、又害戌</b>，但<b>戌对酉礼让三分</b> —— <b>冲突最轻，是首选</b>；',
      '<b>借卯</b> —— <b>卯合戌、又克害辰</b> —— <b>针对性太强</b> —— <b>只有戌本身已经死休、又被四柱冲的时候才用它</b>。',
      '<b>到底取哪一个，还要看问的是什么</b>：<b>想让事情缓下来，取酉</b>；<b>想彻底了断，才考虑卯</b>。',
      '<b>这就是"疏导"和"硬碰硬"的分界</b> —— <b>化解不是打赢这场架，是把架拆开。</b>',
      '<b>2.2 化解的实例</b>',
      '<b>有一次化解的方案</b>：',
      '<b>"种两排树挡路煞 + 挖隔离带灌水泄申金之气"。</b>',
      '<b>分析这个方案</b>：',
      '<b>种树</b> ——<b>木能挡"路煞"</b>（路是金，木能"化"金气）',
      '<b>挖隔离带灌水</b> ——<b>水能"泄"金气</b>（金生水，用泄不用克）',
      '<b>注意</b>：<b>这个方案的核心是"泄"，不是"克"。</b>',
      '<b>为什么？</b>',
      '<b>凶神宜泄不宜克——因为克是硬碰硬，容易激化；泄是顺势疏导，让它自己衰弱下去。</b>',
      '<b>2.3 一个化解婚恋的例子</b>',
      '<b>三个化解方案里，最后取了"用巳火"。</b>',
      '<b>为什么取巳火？</b> 因为<b>巳火能与课内的酉、丑合成金局</b>，把力量<b>"归拢"起来</b> —— <b>这个思路是"合"，不是"克"</b>。',
      '<b>这里要说明一句</b>：<b>已有的记录只给出了"三个方案取其一"这个结果，三个方案的具体内容与比较过程并没有展开</b> —— 所以这里<b>照实记录结果，不替它补推</b>。',
      '<b>但"为什么取巳火"这一层是清楚的</b>：<b>课内本有辰戌相冲</b>（两土相冲，力量对耗），<b>化解的办法不是去压住哪一方，而是引入"合"把冲突的一方拉住</b> —— 而<b>巳与课内的酉、丑能成金局</b>：<b>这一合，既拉住了戌，又把课内散着的力量聚成了局</b>。',
      '<b>这就是"疏导"的思路</b>：',
      '<b>不硬碰，把它引到一条能成局的路上。</b>',
      '<b>方案的选择，本质上是"看课内现成有哪几个字、能凑成什么局"</b> —— <b>不是凭空想一个五行去克它</b>。',
      '<b>三、化解的注意事项</b>',
      '<b>注意事项一：看针对谁</b>',
      '<b>即</b>：<b>化解要看是"为谁化解"</b> ——<b>是帮自己还是帮对方。</b>',
      '<b>注意事项二：不能违背大势</b>',
      '<b>如果课体本身格局不好（比如分局相克），化解的作用有限。</b>',
      '<b>因为</b>：<b>格局是"根"，化解只能"枝叶"上做文章。</b>',
      '---',
      '<b style="color:var(--c-gold)">本章小结</b>',
      '<b>一、求财</b>',
      '<b>四个条件</b>：财动、财爻旺相、外生内、青龙旺相。',
      '<b>五种方式</b>：买卖、合作、官中、外财、劫财。',
      '<b>外生内的快慢</b>：贵神生将神最快；人元生将神晚；人元生地分更晚。',
      '<b>财动逢空三种</b>：将神空（不得反失）、贵神空（空动）、二神俱空（空手套白狼）。',
      '<b>按贵神细分求财方式</b>：勾陈（是非争斗）、朱雀腾蛇（文字）、白虎（险中求财）。',
      '<b>四位中谁受克谁出问题</b>；将神受克直接破财。',
      '<b>地分受克三情况</b>：妻动（受损轻）、贵神克地分（财晚）、将神克地分（财克财）。',
      '<b>耗财/损财/破财的区别</b> ——耗财、损财是自身原因；破财是外来侵害。',
      '<b>求财最怕贼动</b>；内外勾结的两个判定标准。',
      '<b>寅为地支第一财神，乙为木行第一财神。</b>',
      '<b>二、求官</b>',
      '<b>六个条件</b>：贵神官爻旺相、官动、鬼动、将神生贵神、外来生内、临岁月不空。',
      '<b>利官的贵神</b>：青龙（文官）、申（武官）、见火（军人）、戊寅（文武双全）。',
      '<b>官职大小</b>：临太岁最大，月建日建依次而下；官爻逢空旺相为有职无权。',
      '<b>求官八法</b>（详见正文）。',
      '<b>官动逢空</b> ——不得官；旺空可等时机，逢空临时辰"得天机"。',
      '<b>最怕斩官</b>（人元克贵神）。',
      '<b>官动的两面性</b> ——有官利求官，无官主诉讼。',
      '<b>官财不两求</b> ——官动不求财，财动不求官。',
      '<b>求官忌神煞</b>：禄倒、马倒、天罗地网、五鬼、飞廉、关隔锁。',
      '<b>求官十三条</b>（详见正文）。',
      '<b>三、工作与求职</b>',
      '<b>求职三条件</b>：用神旺相、外生内生、三合六合。',
      '<b>求职只关乎成败，不存在损失。</b>',
      '<b>求职最忌官动</b> ——因为官动主诉讼。',
      '<b>贵神克将神不利求职，却利于求名。</b>',
      '<b>工作变动看四处</b>：贵神（工作）、驿马（要动）、冲（变动）、空亡（不实）。',
      '<b>贵神空 + 驿马</b> ——领导不赞成调动。',
      '<b>所学专业与工作是否对口</b> ——看地分与贵神的关系。',
      '<b>四、财官的配合</b>',
      '<b>财官不两求</b> ——但现代社会要灵活看哪个意图更重。',
      '<b>官鬼同动必升职</b> ——因为既有官运又有进取心。',
      '<b>五、化解与运筹</b>',
      '<b>化解是为了通关，不是为了克。</b>',
      '<b>化解三层次</b>：安抚、克制、通关。',
      '<b>化解要看针对谁</b>；不能违背大势（格局是根）。',
      '---',
      '<b style="color:var(--c-gold)">心法</b>',
      '<b>求财求官，先问自己有什么</b>',
      '<b>四个条件、六个条件</b> ——<b>这些条件的本质是什么？</b>',
      '<b>是"你有什么"。</b>',
      '<b>求财四条件</b> ——<b>财动（有本钱）、财爻旺（本钱足）、外生内（有人送）、青龙旺（有财源）</b>',
      '<b>求官六条件</b> ——<b>官爻旺（有官职）、官动（有动向）、鬼动（有进取）、将神生贵神（有财路）、外来生内（有提拔）、临岁月不空（时机到）</b>',
      '<b>缺哪一条，就缺哪一样。</b>',
      '<b>所以断课不只是"说结果"，还要"说条件"</b> ——<b>告诉求测者：你现在缺什么，补上就能成。</b>',
      '<b>有动有象必有事</b>',
      '<b>这是断课的一条根本信念</b>：',
      '<b>有动有象必有事，应期看旺衰时令。</b>',
      '<b>即</b>：<b>课里出现了一个"象"，就一定有相应的事</b> ——<b>只是时间早晚的问题。</b>',
      '<b>所以</b>：',
      '<b>看到贼动</b> ——<b>即使逢空，也要提醒"小心破财"</b>',
      '<b>看到财动</b> ——<b>即使休囚，也要说"有财，但力量不够"</b>',
      '<b>这是"严谨"</b> ——<b>不是吓唬人，是根据课象如实说。</b>',
      '<b>化解是"疏导"，不是"对抗"</b>',
      '<b>这一点最见功夫</b>：',
      '<b>凶神宜泄不宜克</b> ——<b>因为克是硬碰硬，容易激化；泄是顺势疏导，让它自己衰弱下去。</b>',
      '<b>这个道理在生活里也一样</b>：',
      '<b>孩子叛逆</b> ——<b>硬压只会更叛逆，顺着引导才有用</b>',
      '<b>矛盾冲突</b> ——<b>硬碰只会激化，找个台阶才是办法</b>',
      '<b>所以化解的本质是"疏通"</b> ——<b>让五行流通起来，让事情顺起来。</b>',
      '<b>这也是"通则不痛"的道理。</b>',
    ]},
    { t: '第十三章　课例详解', rows: [
      '<b style="color:var(--c-gold)">引言</b>',
      '<b>这一章讲什么</b>',
      '前面十二章讲的都是"道理"和"方法"。',
      '<b>这一章讲"实战"</b> ——通过完整的课例，把前面的方法串起来。',
      '<b>为什么课例这么重要？</b>',
      '<b>因为断课是"手艺"</b> ——<b>道理懂了，不等于会做。</b>',
      '<b>难在哪儿？</b> ——<b>难在"中间那一步"</b>：',
      '<b>口诀背得出、五动三动也认得出</b> ——<b>可这些条文怎么变成眼前这一个具体的人、一件具体的事</b> ——<b>从"条文"到"这个人"中间的那一步，最容易卡住。</b>',
      '<b>很多人看课例，看得懂"断出了什么"，却不知道"这句断语是从哪来的"</b> ——<b>症结就在这里。</b>',
      '<b>看课例，重点不是"记住答案"，而是"看断语是怎么推出来的"。</b>',
      '<b>这一章怎么读</b>',
      '<b>每个课例都有三部分</b>：',
      '<b>课体</b> ——四柱、月将、日空、四位',
      '<b>断语</b> ——实际断出来的话',
      '<b>思路</b> ——<b>怎么推出来的</b>（这是重点）',
      '<b>读课例时，建议先自己试断一遍，再看思路</b> ——<b>这样进步最快。</b>',
      '---',
      '<b style="color:var(--c-gold)">第一节　课例一：断工作调动</b>',
      '<b>一、课体</b>',
      '<code>`</code>',
      '四柱：丙申年　壬辰月　甲戌日　壬申时',
      '月将：酉　日空：申、酉　四大空亡：无',
      '人元：壬　　水 + 相　天德、月德',
      '贵神：壬申（白虎）　金 + 旺　天德、月德、驿马、截路',
      '将神：癸酉（从魁）用　金 - 旺　丧车',
      '地分：申　　金 + 旺　驿马、截路',
      '<code>`</code>',
      '<b>求测事项</b>：闺蜜问老公的工作。',
      '<b>二、断语</b>',
      '1. 你老公有想动工作的想法。',
      '2. 一起动的人最少有三人，还可能有女性。',
      '3. 从事的工作流动性强，而且工作种类较多。',
      '4. 这个月工作机会、求财机会多，但主张性不强。',
      '5. 目前工作虽然繁杂，但不是很累。',
      '6. 很快就去到一个规模较大的单位，过去后会比较累。',
      '7. 他身材魁梧，做事利落，皮肤白净，嗓音大。',
      '8. 目前是有些小管理权的，但过去后业务能力加大而且离家远一些。',
      '9. 从事的与技术建造有关的工作，对理财观念不是很强，为人仗义。',
      '10. 朋友缘很好，走到哪里都能有朋友，酒量大，贪玩。',
      '<b>三、思路详解</b>',
      '<b>3.1 为什么断"想动工作"</b>',
      '<b>看驿马</b>：<b>贵神是壬申，申带驿马；地分也是申，也带驿马。</b>',
      '<b>而且</b>：',
      '<b>申金为行移之神，又一路生外，有动向，必有变化。</b>',
      '<b>"一路生外"</b> ——<b>人元壬水、贵神壬申、将神癸酉、地分申</b> ——<b>金生水，一路往上生，所以"向外、向上"</b> ——<b>这是"想动"的象。</b>',
      '<b>3.2 为什么断"最少三人，可能有女性"</b>',
      '<b>看三金</b>：',
      '<b>三金生壬</b> ——<b>课内有三个金（申、酉、申），都生人元壬水。</b>',
      '<b>三个金</b> ——<b>所以"最少三人"。</b>',
      '<b>"可能有女性"</b> ——<b>因为酉金主"女性、桃花"。</b>',
      '<b>3.3 为什么断"流动性强、种类多"</b>',
      '<b>看申金</b>：',
      '<b>申金为行移之神</b> ——<b>主流动。</b>',
      '<b>"种类多"</b> ——<b>因为三金，而且金主"多种"。</b>',
      '<b>3.4 为什么断"主张性不强"</b>',
      '<b>看空亡</b>：',
      '<b>申金空亡</b> ——<b>主张性不强、说了不算。</b>',
      '<b>为什么？</b> 因为<b>地分申落空亡</b>（日空申酉）——<b>地分是"根基"，空则不实。</b>',
      '<b>3.5 为什么断"很快就去、过去后会累、离家远"</b>',
      '<b>"很快就去"</b>：',
      '<b>申金临岁君</b>（太岁丙申）——<b>有"临时"之意</b>，所以快。',
      '<b>"过去后会比较累"</b>：',
      '<b>申中藏戊，遁得戊土；戊土克人元壬水</b> —— <b>土克水，所以"有压力"</b> —— <b>也就是"累"。</b>',
      '<b>为什么从申里遁？</b> 因为<b>申的藏干正是庚、壬、戊</b> —— 地分是申，从它本气之外遁出戊土，<b>这一层"外面的土"回头来克人元壬水</b>，就成了压力的来源。',
      '<b>"离家远"</b>：',
      '<b>申金临岁君有"临时"，加三金——说明要往远处去。</b>',
      '<b>3.6 为什么断相貌"魁梧、利落、皮肤白净、嗓音大"</b>',
      '<b>看金</b>：',
      '<b>金旺</b> ——<b>主"面方白净、嗓门大"</b>',
      '<b>申金</b> ——<b>"如猛虎下山，威严凶残"</b> ——<b>所以"身材魁梧"</b>',
      '<b>庚为筋韧</b> ——<b>所以"做事利落"</b>',
      '<b>注意一条规矩</b>：',
      '<b>相貌以旺相为主不论空。</b>',
      '<b>即</b>：<b>断相貌时，即使某处空亡，也按"旺相"来取象</b> ——<b>因为空亡是"力量"的问题，不是"形貌"的问题。</b>',
      '<b>3.7 为什么断"小管理权"</b>',
      '<b>看贵神</b>：',
      '<b>贵神壬申，申为白虎</b> ——<b>白虎主武，有管理之象。</b>',
      '<b>"过去后业务能力加大"</b> ——<b>因为三金的力量。</b>',
      '<b>3.8 为什么断"技术建造、理财不强、仗义"</b>',
      '<b>"技术建造"</b>：',
      '<b>申金主"移动、传送"，金主"机械"</b> ——<b>合起来是"技术建造"。</b>',
      '<b>"理财观念不强"</b>：',
      '<b>一路生外</b> ——<b>财往外流，所以"理财观念不强"。</b>',
      '<b>"为人仗义"</b>：',
      '<b>金主"义"</b> ——<b>金旺则讲义气。</b>',
      '<b>3.9 为什么断"朋友缘好、酒量大、贪玩"</b>',
      '<b>"朋友缘好"</b>：',
      '<b>三会金局</b> ——<b>朋友多。</b>',
      '<b>"酒量大"</b>：',
      '<b>申金旺临太岁，空亡</b> ——<b>"空亡酒量没底"</b>。',
      '<b>"贪玩"</b>：',
      '<b>水局润下</b> ——<b>"我说你老公其人很爱玩儿，不求上进，水局润下"。</b>',
      '<b>四、这个课例的启示</b>',
      '<b>一个课，能断出十条信息，每一条都有依据。</b>',
      '<b>依据来自</b>：',
      '<b>驿马</b> ——断"动不动"',
      '<b>三金</b> ——断"几个人"',
      '<b>空亡</b> ——断"实不实"',
      '<b>五行的取象</b> ——断"什么工作、什么长相"',
      '<b>一路生外</b> ——断"财往外流"',
      '<b>这就是"课内无一处无用"</b> ——<b>每个符号都在说话。</b>',
      '---',
      '<b style="color:var(--c-gold)">第二节　课例二：断感情</b>',
      '<b>一、课体</b>',
      '<code>`</code>',
      '四柱：丙申年　癸巳月　己酉日　癸酉时',
      '月将：申　日空：寅、卯　四大空亡：无',
      '人元：庚　　金 + 死　月德',
      '贵神：甲戌（天空）　土 + 相　丧门、六甲',
      '将神：己巳（太乙）用　火 - 旺',
      '地分：午　　火 + 旺　吊客',
      '<code>`</code>',
      '<b>求测事项</b>：1992 年属猴女，报数 7、以午火为地分，测感情。',
      '<b>二、断语（15 条，节选）</b>',
      '1. 你的感情有多重性，不是在一个男孩之间来往。（我就是一个男友，另一个是蓝颜知己）',
      '2. 你现在的感情很被动，处于说不清的状态。',
      '3. 你这个蓝颜朋友是非很多，总是在与你男友之间制造矛盾。',
      '4. 你们之间的误会是在信息沟通中发生的。',
      '5. 其实这个蓝颜对你也是有意思的，只是内心爱猜疑嫉妒不敢直接追你。',
      '8. 这个月闹得最厉害，而且你很有想出去找男友的想法。',
      '9. 你现在心里急失眠，脑子里没有主意了。',
      '12. 你和男友是 2014 年认识的。',
      '15. 目前你男友对你是躲而不见的，别再和蓝颜交往，下月还有男友和好的机会。',
      '<b>三、思路详解</b>',
      '<b>3.1 为什么断"感情有多重性"</b>',
      '<b>看二火</b>：',
      '<b>二火生戌</b> ——<b>课内两个火（巳、午）都生戌土。</b>',
      '<b>"多重性"</b> ——<b>因为火主"多情"，而且两个火。"</b>',
      '<b>更关键的是</b>：',
      '<b>午戌为火局正缘，巳为局外人，巳主是非。</b>',
      '<b>即</b>：',
      '<b>午戌</b> ——<b>正缘</b>（午与戌半合火局）',
      '<b>巳</b> ——<b>局外人</b>（巳不在火局里，所以是"第三者"）',
      '<b>这个判断很妙</b> ——<b>看谁在"局"里，谁在"局"外。</b>',
      '<b>3.2 为什么断"被动、说不清"</b>',
      '<b>看生克</b>：',
      '<b>火都是生外的，内外没有生火的。</b>',
      '<b>即</b>：<b>火只能往外生（生戌土），没有东西来生火</b> ——<b>所以"被动"。</b>',
      '<b>"说不清"</b> ——<b>因为火主"反复、纠缠"。</b>',
      '<b>3.3 为什么断"蓝颜是非多"</b>',
      '<b>看巳火</b>：',
      '<b>巳主是非</b> ——<b>所以蓝颜"是非多"。</b>',
      '<b>"中期制造矛盾"</b> ——<b>因为巳在中间（将神位），夹在午火（地分）和戌土（贵神）之间。</b>',
      '<b>3.4 为什么断"误会发生在信息沟通中"</b>',
      '<b>看巳午</b>：',
      '<b>巳午主信息</b> ——<b>所以"误会发生在信息沟通中"。</b>',
      '<b>而</b>：',
      '<b>火局克元庚金为矛盾。</b>',
      '<b>即</b>：<b>火局（巳午戌）克人元庚金</b> ——<b>庚金代表"头、方向"，被克则"没有方向"。</b>',
      '<b>3.5 为什么断"蓝颜对你有意思，但猜疑嫉妒"</b>',
      '<b>看生克</b>：',
      '<b>巳生戌土，对方有意，但怕午火只能嫉妒。</b>',
      '<b>即</b>：',
      '<b>巳生戌</b> ——<b>蓝颜对戌（男友？）有意</b>',
      '<b>但巳怕午火</b> ——<b>所以"只能嫉妒"</b>',
      '<b>这个判断很细</b> ——<b>不是简单的"喜欢/不喜欢"，而是"有意但不敢"。</b>',
      '<b>3.6 为什么断"这个月闹得最厉害"</b>',
      '<b>看月建</b>：',
      '<b>月建巳午纠缠克人元庚金。</b>',
      '<b>即</b>：<b>巳月（癸巳月）</b> ——<b>月建是巳，与课内的午火纠缠，一起克庚金</b> ——<b>所以这个月矛盾最烈。</b>',
      '<b>3.7 为什么断"心里急、失眠、没主意"</b>',
      '<b>看巳火</b>：',
      '<b>巳旺为思想，为惊恐失眠；庚金头临死地没有方向。</b>',
      '<b>即</b>：',
      '<b>巳火旺</b> ——<b>主"思想、惊恐、失眠"</b>',
      '<b>庚金（人元）临死地</b> ——<b>"没有方向"</b> ——<b>所以"脑子里没有主意"。</b>',
      '<b>3.8 为什么断"2014 年认识"</b>',
      '<b>看流年</b>：',
      '<b>14 年甲午年火局，巳也为火，表面支持。</b>',
      '<b>即</b>：<b>2014 年是甲午年</b> ——<b>午火入课，与课内的午、巳、戌合成火局</b> ——<b>所以那年感情上有进展。</b>',
      '<b>3.9 为什么断"男友躲而不见"</b>',
      '<b>看相克</b>：',
      '<b>庚金克贵干甲木，对方反感，也为干冲，离开之意。</b>',
      '<b>即</b>：<b>人元庚金克贵神的甲木</b> ——<b>天干相克（干冲）</b> ——<b>主"对方反感、离开"。</b>',
      '<b>"下月还有和好的机会"</b> ——<b>因为下月（甲午月）合火局</b> ——<b>火局成，感情有转机。</b>',
      '<b>四、这个课例的启示</b>',
      '<b>这个课最精彩的地方是"找谁是谁"</b> ——',
      '<b>课里有四个位置，分别代表谁？</b>',
      '<b>午火（地分）</b> ——<b>求测者自己</b>（地分是"最原始的部分"；这一课的地分是按<b>报数 7</b> 取的）',
      '<b>戌土（贵神）</b> ——<b>男友</b>（因为午戌合火局，是"正缘"）',
      '<b>巳火（将神）</b> ——<b>蓝颜</b>（因为巳不在火局里，是"局外人"）',
      '<b>庚金（人元）</b> ——<b>外在的"方向、头脑"</b>',
      '<b>这个"分配"不是固定的</b> ——<b>是从课内的"合"与"不合"推出来的。</b>',
      '<b>有一条经验</b>：',
      '<b>断感情时，第一步是"找谁是谁" —— 看谁在"局"里、谁在"局"外。</b>',
      '<b>即</b>：<b>断感情时，第一步是"找谁是谁"</b> ——<b>这个找对了，后面才能断准。</b>',
      '---',
      '<b style="color:var(--c-gold)">第三节　课例三：断病</b>',
      '<b>一、课体</b>',
      '<code>`</code>',
      '干支：乙未年　壬午月　癸亥日　癸亥时',
      '月将：未　日空：子、丑　四大空亡：金',
      '人元：丙　　火 + 休　月德',
      '贵神：丁巳（腾蛇）用　火 - 休　天医、驿马、吊客、六丁',
      '将神：壬子（神后）　水 + 死　丧车',
      '地分：辰　　土 + 旺',
      '<code>`</code>',
      '<b>求测事项</b>：某女求测身体状况。',
      '<b>先看这个课的骨架</b>：',
      '<b>用神在贵神丁巳</b>（四位丙阳、巳阴、子阳、辰阳 —— 三阳一阴，以阴为用）',
      '<b>旺衰是"土旺"</b>：四位火、火、水、土 —— 火虽占两位却被水克，<b>土不受克</b>，所以土旺；土旺则金相、<b>火休</b>、木囚、<b>水死</b>',
      '<b>用神丁巳正落在"休"地，而且被将神壬子水所克</b> —— <b>用神受伤，是这一课最重的一层</b>',
      '<b>二、断语</b>',
      '1. 你心脏不好，心律不齐，出虚汗。',
      '2. （续）还有妇科（泌尿）方面的问题。',
      '3. （续）你的病吃药治不好，得找中医调理。',
      '4. （续）你找过一个神婆，但没管用。',
      '<b>三、思路详解</b>',
      '<b>3.1 为什么断"心脏不好、心律不齐、出虚汗"</b>',
      '<b>看火</b>：',
      '<b>火主心</b> ——<b>课内火的状态反映心脏。</b>',
      '<b>具体</b>：',
      '<b>午火</b> ——<b>主心脏</b>',
      '<b>火受克</b> ——<b>主心律不齐</b>',
      '<b>火弱</b> ——<b>主虚汗</b>',
      '<b>3.2 为什么断"妇科问题"</b>',
      '<b>看水</b>：',
      '<b>水主肾、泌尿</b> ——<b>所以水受克主妇科（泌尿）问题。</b>',
      '<b>且看神煞</b>：',
      '<b>妇科（泌尿）问题的断法与所临神煞。</b>',
      '<b>即</b>：<b>结合所临的神煞，判断具体是什么问题。</b>',
      '<b>3.3 为什么断"吃药治不好，得找中医"</b>',
      '<b>看五行</b>：',
      '<b>中医调理与"神婆神医"的类象推演（拔火罐）。</b>',
      '<b>中医属木</b>（木主"医卜"），<b>西医属金/辰土</b>（辰土主西医）。',
      '<b>如果课里的象是"木"</b> ——<b>那就该用中医。</b>',
      '<b>"拔火罐"</b> ——<b>是火象</b>（火罐）<b>+ 木象</b>（罐是竹木做的）。',
      '<b>3.4 为什么断"找过神婆"</b>',
      '<b>看神煞</b>：',
      '<b>阴气重之地，常出现神婆、烧香信佛之人。</b>',
      '<b>即</b>：<b>如果课里有"未土"（坤宫、阴气重）或其他相关神煞，就主"找过神婆"。</b>',
      '<b>四、这个课例的启示</b>',
      '<b>断病的三个层次</b>：',
      '<b>看五行对应</b> ——什么五行出了问题，就对应什么脏器',
      '<b>看四位对应</b> ——人元头面、贵神胸、将神腹、地分腿脚',
      '<b>看神煞与治疗</b> ——中医属木、西医属金、神婆属阴',
      '<b>一条纪律</b>：',
      '<b>不断生死。</b>',
      '<b>即</b>：<b>断病可以说病情、说治疗，但不能说"什么时候死"。</b>',
      '<b>例外</b>：',
      '<b>丧车临用又克人元，主病重伤重。</b>',
      '<b>这种断语要极谨慎。</b>',
      '---',
      '<b style="color:var(--c-gold)">第四节　课例四：断官司</b>',
      '<b>一、课体</b>',
      '<code>`</code>',
      '起课时间：太岁未年　戌月　时辰亦为未',
      '日空：午、未（属甲申旬）',
      '人元：辛　　金 - 死',
      '贵神：午（朱雀）用　火 + 旺　病符',
      '将神：酉　　金 - 死　天医',
      '地分：丑　　土 - 相',
      '<code>`</code>',
      '<b>求测事项</b>：老刘问合同官司。',
      '<b>这一课的课体，有一处要交代</b>：<b>原课没有留下完整四柱与月将</b>，上面这四位是<b>从断语里的线索倒推出来的</b>：',
      '<b>人元为辛金</b> —— 断语里讲到"午火克人元"',
      '<b>贵神是朱雀、地支为午</b> —— 断语里点明了朱雀与午火',
      '<b>地分为丑土</b> —— 断语里讲"丑戌未三刑"，课中已有月建戌、太岁未，凑够三刑的第三位只能是地分丑',
      '<b>能确定的时间信息是</b>：<b>起课在戌月</b>（月建为戌），<b>太岁为未</b>，<b>时辰也是未</b>；<b>午火正逢旬空</b> —— <b>旬空落在午、未上的只有甲申旬</b>（甲申至癸巳），可知起课之日属甲申旬。',
      '<b>课体不全，照样能断</b> —— <b>这一课的价值恰恰在这里</b>：<b>有多少信息就用多少信息，从断语反推课体、再用课体验证断语</b> —— <b>两头对得上，这个课就立得住。</b>',
      '<b>先定旺衰</b>：四位是<b>金、火、金、土</b>。<b>火克金</b>（金受克）；<b>课内无木，土不受克</b>；<b>课内无水，火也不受克</b> —— <b>火与土都不受克，就比数量</b>：火一个、土一个，仍然并列 —— <b>再看"克他爻者为旺"</b>：<b>火能克金，土在课内无水可克</b> —— <b>所以火旺</b>。',
      '火旺则<b>土相</b>（火生土）、<b>木休</b>（生火者）、<b>水囚</b>（克火者）、<b>金死</b>（火克金）。',
      '标到四位上：人元辛金<b>死</b>、贵神午火<b>旺</b>、将神酉金<b>死</b>、地分丑土<b>相</b>。',
      '<b>定用神</b>：四位是辛（阴）、午（阳）、酉（阴）、丑（阴）—— <b>三阴一阳</b> —— <b>阳上取</b> —— 用神是<b>贵神午（朱雀）</b>。',
      '<b>再看两个关键的煞</b>：<b>戌月的天医在酉</b>（月建退一位）—— 正落在将神上；<b>太岁未的病符在午</b>（岁后一辰）—— 正落在贵神上 —— <b>后面断"朱雀临病符、合同有毛病"，用的就是这一条</b>。',
      '<b>二、断语</b>',
      '1. 这个合同不完善，有漏洞。',
      '2. 对方毁约了。',
      '3. 这个合同有托付之人。',
      '4. 合同签订于 2012 年，2013 年发生变化。',
      '5. 你自己主动想和解，但对方不接受。',
      '6. 这个合同有转租行为，目前合同不在你手里。',
      '7. 由贵人相助，不会输掉这场官司。',
      '8. 有女人牵扯其中。',
      '9. 官司因土地问题起纷争。',
      '10. 丁亥月辛卯日撤诉。',
      '<b>三、思路详解</b>',
      '<b>3.1 为什么断"合同不完善"</b>',
      '<b>看神煞</b>：',
      '<b>朱雀主合同文章，临病符——即合同不完善、文章有毛病。</b>',
      '<b>即</b>：',
      '<b>朱雀</b> ——<b>主"文书、合同"</b>',
      '<b>病符</b> ——<b>主"有毛病"</b>',
      '<b>两者叠加</b> ——<b>合同有漏洞</b>',
      '<b>3.2 为什么断"签订于 2012、2013 年变化"</b>',
      '<b>看流年</b>：',
      '<b>合同签订于 2012 年，2013 年发生变化（六合变三合）。</b>',
      '<b>即</b>：',
      '<b>2012 年（壬辰）</b> ——<b>与课内某支六合</b> ——<b>所以那年签合同</b>',
      '<b>2013 年（癸巳）</b> ——<b>变成三合</b> ——<b>所以发生变化</b>',
      '<b>3.3 为什么断"主动想和解但对方不接受"</b>',
      '<b>看天干</b>：',
      '<b>自己主动想和解，对方不接受（丙辛合与四大空亡）。</b>',
      '<b>即</b>：',
      '<b>丙辛合</b> ——<b>有"合"的意愿</b> ——<b>想和解</b>',
      '<b>但四大空亡</b> ——<b>"合"不成</b> ——<b>对方不接受</b>',
      '<b>3.4 为什么断"由贵人相助，不会输"</b>',
      '<b>看神煞</b>：',
      '<b>由贵人相助，不会输掉这场官司（三奇与太岁）。</b>',
      '<b>即</b>：',
      '<b>三奇入课</b> ——<b>主"贵人相助"</b>',
      '<b>太岁入课</b> ——<b>主"有官方支持"</b>',
      '<b>3.5 为什么断"有女人牵扯"</b>',
      '<b>看地支</b>：',
      '<b>有女人牵扯其中；官司因土地问题起纷争（丑戌未三刑）。</b>',
      '<b>即</b>：',
      '<b>地分丑与月建戌、太岁未，构成丑戌未三刑</b> ——<b>主"土地纠纷"</b>（土主田土）',
      '<b>酉金代表桃花，午火也有"女子"这一说</b> ——<b>主"有女人牵扯"</b>',
      '<b>3.6 为什么断"丁亥月辛卯日撤诉"</b>',
      '<b>看应期</b>：',
      '<b>丁亥月辛卯日撤诉之理、贼动破财与最终反馈。</b>',
      '<b>即</b>：<b>用应期的方法（三合、六合、解刑等）推出具体的年月日。</b>',
      '<b>四、这个课例的启示</b>',
      '<b>断官司的几个要点</b>：',
      '<b>看三刑</b> ——主纠缠',
      '<b>看辰戌</b> ——主斗讼',
      '<b>看朱雀</b> ——主文书合同',
      '<b>看神煞</b> ——主吉凶助力',
      '<b>看应期</b> ——推出具体时间',
      '<b>一条化解原则</b>：',
      '<b>干神相生能和解。</b>',
      '<b>即</b>：<b>如果人元与贵神的天干相生</b> ——<b>官司能和解。</b>',
      '---',
      '<b style="color:var(--c-gold)">第五节　课例五：断出行</b>',
      '<b>一、课体</b>',
      '<code>`</code>',
      '年份：癸巳年（2013）',
      '贵神：庚辰　土　（临时辰）带天马',
      '课内：一个午火、两个辰土',
      '四柱：时辰上还有一个庚辰（课内两个 + 时辰一个，共三处）',
      '日时：辰巳（辰巳为地网）',
      '当天：辰日',
      '课体：纯阳课',
      '<code>`</code>',
      '<b>求测事项</b>：问出行 —— 顺不顺利、路上会碰到什么事。',
      '<b>这个课的课体也要说明一下</b>：<b>这一课未完整给出四柱、月将、日空</b>，上面这些是<b>按断语中提到的信息整理出来的</b> —— 可以确定的几件事是：',
      '<b>贵神为庚辰</b>（"庚辰"临时辰），<b>带天马</b>；',
      '<b>课内有一个午火、两个辰土</b>；',
      '<b>课内已见两个"庚辰"，四柱的时辰上还有一个"庚辰"</b> —— 一共三处，这就是后面说的"<b>五柱上有同行者</b>"；',
      '<b>日时为辰巳</b> —— <b>辰巳为地网</b>；',
      '<b>课体是纯阳课</b>。',
      '<b>二、断语</b>',
      '1. 要出走，多人同行。',
      '2. 此行有是非，多与女子有关。',
      '3. 途中有耽搁。',
      '4. 午时有分散。',
      '5. 申时有是非。',
      '6. 戌时有争吵或返回。',
      '7. 亥时到家。',
      '<b>三、思路详解</b>',
      '<b>3.1 为什么断"要出走、多人同行"</b>',
      '<b>看驿马</b>：',
      '<b>驿马主"动"，而且"驿马逢三合六合为马群，就是多人结伴出行"。</b>',
      '<b>即</b>：',
      '<b>驿马入课</b> ——<b>要出行</b>',
      '<b>驿马逢三合六合</b> ——<b>多人同行</b>',
      '<b>3.2 为什么断"有是非、与女子有关"</b>',
      '<b>看神煞与地支</b>：',
      '<b>此行有是非、多与女子有关、途中有耽搁。</b>',
      '<b>即</b>：',
      '<b>课内有"是非之神"</b>（如巳火）——<b>有是非</b>',
      '<b>酉金代表桃花，午火也有"女子"这一说</b> ——<b>与女子有关</b>',
      '<b>课内有"关隔锁"或"天罗地网"</b> ——<b>有耽搁</b>',
      '<b>3.3 为什么断具体的时辰</b>',
      '<b>这是出行断课最精彩的地方</b> ——<b>把时间段对应到地支</b>：',
      '| 时辰 | 断语 | 依据 |',
      '|---|---|---|',
      '| <b>午时</b> | <b>有分散</b> | <b>午时入课，成了"分局相生"</b> —— 午火生地分、贵神生人元，等于<b>把火分成了两火</b> |',
      '| <b>申时</b> | <b>有是非</b> | <b>午火克申金</b> —— 所以这个时辰会有是非、不太顺 |',
      '| <b>戌时</b> | <b>有争吵或返回</b> | <b>辰戌相冲，逢冲必动</b>；而且<b>天马被冲，有"返回"之意</b> |',
      '| <b>亥时</b> | <b>到家</b> | 这一条是<b>按经验直接下的断</b>，推理过程从略 |',
      '<b>原理</b>：',
      '<b>把课内的地支，与十二时辰逐个对照</b> ——<b>看哪个时辰与课内发生什么关系。</b>',
      '<b>如果某个时辰与课内相合</b> ——<b>那个时辰平安</b>',
      '<b>如果相冲相刑</b> ——<b>那个时辰有事</b>',
      '<b>四、这个课例的启示</b>',
      '<b>断出行的方法</b>：',
      '<b>看驿马</b> ——断"动不动、几个人"',
      '<b>看神煞</b> ——断"路途顺不顺"',
      '<b>看时辰对照</b> ——断"具体什么时候发生什么"',
      '<b>一条经验</b>：',
      '<b>子午卯酉在半道，寅申巳亥未动身，辰戌丑未立等至。</b>',
      '<b>即</b>：<b>问"人到哪里了"，看落在地支的哪一组。</b>',
      '---',
      '<b style="color:var(--c-gold)">第六节　课例六：断感情（网名起课）</b>',
      '<b>一、课体</b>',
      '<code>`</code>',
      '干支：癸巳年　乙卯月　癸未日　己未时',
      '月将：戌　日空：申、酉　四大空亡：无',
      '人元：乙　　木 - 休',
      '贵神：戊午（朱雀）　火 + 旺',
      '将神：戊午（胜光）用　火 + 旺',
      '地分：卯　　木 - 休　吊客',
      '<code>`</code>',
      '<b>求测背景</b>：一位女性以网名起课，问感情。',
      '<b>定用神</b>：四位是<b>乙（阴）、午（阳）、午（阳）、卯（阴）</b> —— <b>二阴二阳，以将为用</b>，所以<b>用神是将神戊午</b>。',
      '<b>二、断语</b>',
      '1. 你从事的工作与文化文艺电影类有关。',
      '2. 与男友拉锯战反复不定。',
      '3. 这个月会联系的。',
      '4. 你找的男朋友大多都是很高调的人。',
      '5. 对感情都不是很专一。',
      '6. 目前你的男友又被其他女子来往。',
      '7. 在你分手前就已经交往了，也就是去年子亥月的时候。',
      '8. 你本人是个美女。',
      '9. 只是最近稍微有些胖了。',
      '10. 你前男友找的女子和你差不多漂亮。',
      '11. 你目前的事业不是很稳定，有点跑堂的感觉。',
      '12. 他们也不会长久的，等到午月差不多分手。',
      '13. 此男也有文艺细胞，能言善辩。',
      '14. 你们平时也是打打闹闹，谁也不让谁。',
      '15. 其实他也喜欢你，就是太花心。',
      '16. 追你的人很多，差不多都是不知死活的主。',
      '17. 你是个爱打扮的很潮的人，不缺钱但也留不住。',
      '18. 对方个子不低，有传统美德。',
      '19. 在外的你还有个有权职的已婚男人来往。',
      '20. 这个男人不会跟你结婚，但近期你们也分不开。',
      '<b>三、思路详解</b>',
      '<b>3.1 为什么断"工作与文化文艺电影类"</b>',
      '<b>贵神是戊午，午火主文化、主文采</b>。午火是文明之象，所以工作与文化、文艺、影视这一类有关。反馈：学艺术的。',
      '<b>3.2 为什么断"拉锯战反复不定"</b>',
      '<b>两个依据</b>：',
      '<b>用神是午火</b> —— <b>午火为用，常主"成而复败、反反复复"</b>。',
      '<b>课体是合局相生，但卯午带破</b>。',
      '<b>卯午为什么相破？</b> 卯属阴木、是小木；午是阳火、是大火。<b>小木生大火，"心有余而力不足"</b> —— 火时大时小，所以<b>分分合合、反复不定</b>。木生火本来是好事，<b>但力不从心，就成了"破"</b>：舍不得，又供不起。反馈："分手一个半月了，常合合分分。"',
      '<b>3.3 为什么断"这个月会联系"</b>',
      '<b>月建是卯，卯木生午火</b>；而且<b>卯主信息、午主传播</b> —— 信息加传播，所以断<b>这个月必有联系</b>。反馈：甲午日对方发来短信。',
      '<b>3.4 为什么断"男朋友大多很高调"</b>',
      '<b>午火旺，火旺主表现欲强、爱表现自己、新潮</b>。所以找的对象多是张扬、高调的人。反馈："是啊。"',
      '<b>3.5 为什么断"对感情不专一"</b>',
      '<b>午火本身就有反复性</b>，而且<b>被多个木来生</b> —— 人元乙木、地分卯木，再加月建卯木。<b>被多个乙卯生，就不会专一</b>。',
      '<b>3.6 为什么断"男友又被其他女子来往"</b>',
      '<b>人元乙木生午火</b> —— <b>人元为外、为上</b>，<b>人元来生就是"外来干扰"</b>。所以主有外人插进来。反馈："是这样，我知道。"',
      '<b>3.7 为什么断"分手前就已交往，应在去年子亥月"</b>',
      '<b>用神是午火，能克冲午火的是水</b> —— 所以第一要考虑<b>亥、子水</b>。<b>亥子水既能克冲午火，也能生卯木</b>。入冬以后（亥子月）水一进来，午火就被冲动，事情就发生了。反馈："我们就那个时候开始分手的。"',
      '<b>3.8 其余几条的取象</b>',
      '<b>"美女""稍胖""前男友找的女子和你差不多漂亮"</b> —— 都从<b>午火</b>取象：午火主美丽、主丰盈；<b>两个午火并列</b>，故断"和你差不多"。',
      '<b>"事业不稳定、有点跑堂的感觉"</b> —— 午火旺而带破，<b>旺而无根、飘忽不定</b>，故主奔波。',
      '<b>"对方有文艺细胞、能言善辩"</b> —— 仍是<b>午火主文采、主口舌表达</b>。',
      '<b>"打打闹闹、谁也不让谁"</b> —— <b>卯午相破</b>，破就是互不相让。',
      '<b>"他喜欢你但太花心"</b> —— 木多生火，<b>火得生而不专</b>。',
      '<b>"追你的人多"</b> —— 多个木来生午火，<b>生者多，就是来追的人多</b>。',
      '<b>"爱打扮、很潮、不缺钱但留不住"</b> —— <b>火旺主新潮、主外露</b>；<b>火旺而无制则主散</b>，所以钱财留不住。',
      '<b>"对方个子不低、有传统美德"</b> —— 从<b>木</b>上取象（木主条达、主直），故断身材高。',
      '<b>"在外有权职的已婚男人来往"</b> —— <b>人元为外、为外来</b>，人元生午火，就是<b>外面有人来</b>。',
      '<b>"不会结婚，但近期分不开"</b> —— <b>课体是合局相生</b>，合主牵绊、分不开；但<b>卯午带破</b>，破主终究不成。',
      '<b>四、这个课例的启示</b>',
      '<b>这一课最值得学的，是"位置断事"这一层。</b>',
      '课内每个干支<b>都关乎自己</b>，只是<b>功能不同、位置不同、代表的信息不同</b>：',
      '<b>用神</b>是事情的中心；',
      '<b>贵神</b>起作用时，一定与<b>外事、工作</b>有关；',
      '<b>将神</b>受生受克，都与<b>财、自身的生息</b>有关；',
      '<b>人元</b>为<b>外、为上</b>，人元来生就是<b>外来干扰</b>。',
      '<b>所以断课不能只围着用神转。</b> 出现对课内不利的五行时，要<b>全面分析</b>：它对这个有利、对那个不利，有利的是哪个干支、不利的是哪个 —— <b>信息是同步的，也是共享的</b>。',
      '<b>还有一条要记住："病药同源"。</b> 生这个午火的是木，<b>让这个午火出问题的也是木</b>（木多火塞、卯午相破）。<b>同一股力量，既是来源，也是病根</b> —— 这在断感情、断合作时特别常见。',
      '<b>3.10 同一时间的另一个课</b>',
      '<b>这个课还有一层值得说</b>：<b>求测者自己也起了一个课</b> —— <b>同一个时辰、不同的地分</b>。',
      '<code>`</code>',
      '干支：癸巳年　乙卯月　癸未日　己未时',
      '月将：戌　日空：申、酉　四大空亡：无',
      '人元：戊　　土 + 旺',
      '贵神：癸亥（天后）　水 - 死　天喜',
      '将神：辛酉（从魁）用　金 - 相　丧车',
      '地分：午　　火 + 休',
      '<code>`</code>',
      '<b>先定旺衰</b>：四位是<b>土、水、金、火</b>，各占一位。克的关系是 <b>土克水、火克金、水克火</b> —— 一路克下来，<b>只有土不受克</b>（课内无木）—— 所以<b>土旺</b>。土旺则<b>金相</b>（土生金）、<b>火休</b>（生土者）、<b>木囚</b>（克土者）、<b>水死</b>（土克水）。',
      '标到四位上：人元戊土<b>旺</b>、贵神癸亥水<b>死</b>、将神辛酉金<b>相</b>、地分午火<b>休</b>。',
      '<b>两个课一比，就能看出"起课"这件事的讲究</b>：',
      '| | 本书详断的这一课 | 求测者自起的课 |',
      '|---|---|---|',
      '| <b>四位</b> | 乙·戊午·戊午·卯 | 戊·癸亥·辛酉·午 |',
      '| <b>用神</b> | 将神戊午火 | 将神辛酉金 |',
      '| <b>格局</b> | 两火并列、卯午相破 | 五行齐全、土旺克水 |',
      '<b>同一个时辰，地分不同，课就完全两样</b> —— <b>断出来的东西自然也不同</b>。',
      '<b>所以"地分怎么取"是要紧的</b>：<b>报数、属相、网名、外应，取法不同，落点就不同</b>。<b>这也是为什么同一个求测者会同时起出几个课来</b> —— <b>每个课照见一面</b>。',
      '<b style="color:var(--c-gold)">第七节　课例七：断钢筋工</b>',
      '<b>一、课体</b>',
      '<code>`</code>',
      '干支：丙申年　甲午月　壬戌日　戊申时',
      '月将：未　日空：子、丑　四大空亡：金',
      '人元：庚　　金 + 旺',
      '贵神：戊申（白虎）用　金 + 旺',
      '将神：庚戌（河魁）　土 + 休',
      '地分：戌　　土 + 休',
      '<code>`</code>',
      '<b>求测背景</b>：端午节回老家，与同村一位做<b>钢筋工</b>的弟弟闲谈，<b>以申金起课</b>。',
      '<b>先定旺衰</b>：四位是<b>金、金、土、土</b>。金与土<b>都不受克</b>（课内无火、无木），<b>各占两位</b> —— 两者并列，<b>看谁"克他爻"</b>：金不克土、土不克金，<b>谁也没克谁</b> —— 于是取<b>受生者</b>：<b>土生金，所以金旺</b>。金旺则<b>土休</b>（生金者）、<b>水相</b>（金生水）、<b>木囚</b>、<b>火死</b>。',
      '标到四位上：人元庚金<b>旺</b>、贵神申金<b>旺</b>、将神戌土<b>休</b>、地分戌土<b>休</b>。',
      '<b>定用神</b>：四位是庚（阳）、申（阳）、戌（阳）、戌（阳）—— <b>四位全阳，是纯阳课，纯阳以神为用</b>。',
      '<b>关于课体的两处校正</b>（这一课在传抄中留下的笔误，本书按五行订正）：',
      '<b>将神庚戌的五行</b> —— 原记录标作"火"，<b>戌实为土</b>，本书按<b>土</b>标注；旺衰（休）与原记录一致；',
      '<b>人元庚、贵神申、地分戌的阴阳</b> —— 原记录标作"阴"，而<b>庚是阳干、申与戌都是阳支</b>，本书按<b>阳</b>标注。',
      '<b>二、断语</b>',
      '1. 你的性格很直爽，做事干净利落，爱发脾气。',
      '2. 这项工作做了多年了，工作能力、技术绝对没得说。',
      '3. 刚引进新技术或者设备吧，对工作速度有很大改善。',
      '4. 你的工作量不少，远近的工程都找你做。',
      '5. 从上个月到现在接了不少活，还有一个远一点的工程。',
      '6. 你手底下的人不少，近期就要开工了。',
      '7. 农历三月的时候花钱挺多，而且工作也挤压不少。',
      '8. 在 2014 年的时候赚大钱了，但也可能出过工伤事故或者车灾。',
      '<b>三、思路详解</b>',
      '<b>3.1 为什么断"性格直爽、干净利落、爱发脾气"</b>',
      '<b>人元庚金、贵神戊申金</b> —— <b>两位都是金，而且都旺</b>。',
      '<b>金主刚、主决断、主义气</b> —— <b>旺金就是"刚直、利落"</b>；<b>金旺而无制，所以"爱发脾气"</b>。',
      '<b>3.2 为什么断"做了多年、技术没得说"</b>',
      '<b>用神是贵神戊申金</b>（纯阳课以神为用）—— <b>贵神代表工作</b>。',
      '<b>申金正旺</b> —— 主<b>"这门手艺很硬"</b>；<b>庚金又主"刚"</b> —— 合起来就是<b>技术过硬</b>。',
      '<b>3.3 为什么断"刚引进新设备"</b>',
      '<b>关键在"庚"与"申"</b>：<b>庚主"更、变革"，申主"移动"</b> —— <b>两者同现，主"有了新的变动"</b> —— 落在工作上，<b>就是换了新设备、改了做法</b>。',
      '<b>3.4 为什么断"活多、远近都找你"</b>',
      '<b>金旺</b> —— <b>旺就是"多、盛"</b>。',
      '<b>再看父母动</b>：<b>地分戌土生人元庚金</b> —— <b>地分是"下面的人、根基"</b> —— <b>它来生人元，主"下面的人给你送活"</b>。',
      '<b>3.5 为什么断"手底下人不少"</b>',
      '<b>课内有两位戌土</b> —— <b>土主"众多、厚重"</b>，<b>又主"田地、下属"这一路</b> —— <b>两个戌土并列，主"手下不止一个"</b>。',
      '<b>3.6 为什么断"农历三月花钱多"</b>',
      '<b>农历三月是辰月</b> —— <b>辰与课内的戌相冲</b>（<b>辰戌冲</b>）—— <b>逢冲必动</b>，主<b>那个月有变动、有支出</b>。',
      '<b>3.7 为什么断"2014 年赚大钱、但有工伤车灾"</b>',
      '<b>2014 年是甲午年</b> —— <b>午火与课内的申金</b>：<b>火克金</b>。',
      '<b>一方面"火炼金"主"大火、大钱"</b>，<b>另一方面"火克金"主"伤"</b> —— <b>所以是"赚了大钱、也出了事"</b>。',
      '<b>四、这个课例的启示</b>',
      '<b>这一课的看点在于"金占两位、土占两位，而金旺"</b>：',
      '<b>断工作就先从"金"上取象</b> —— <b>刚、硬、技术、金属</b>。',
      '<b>再结合所问的事</b>（钢筋工）—— <b>类象和实际一对上，断语就活了</b>。',
      '<b>还有一条</b>：<b>起课的方法不限于报数</b> —— 这一课用的是"<b>以申金起课</b>"（对方做钢筋工，取"金"象），属于"<b>以事起课</b>"。',
      '<b>起课的方法可以灵活，但起出来之后，断法还是那一套。</b>',
      '<b style="color:var(--c-gold)">第八节　课例八：断网吧财运</b>',
      '<b>一、课体</b>',
      '<code>`</code>',
      '干支：壬辰年　乙巳月　戊子日　戊午时',
      '月将：申　日空：午、未　四大空亡：金',
      '人元：甲　　木 + 旺　六甲',
      '贵神：丁巳（腾蛇）用　火 - 相　六丁、劫煞',
      '将神：丙辰（天罡）　土 + 死　天德合、天医',
      '地分：寅　　木 + 旺　驿马、吊客',
      '<code>`</code>',
      '<b>求测背景</b>：一位属虎的男士求测今年的财运与感情。',
      '<b>先定旺衰</b>：四位是<b>木、火、土、木</b> —— <b>木占两位</b>，而<b>克木的金课内没有</b> —— 所以<b>木旺</b>。木旺则<b>火相</b>（木生火）、<b>土死</b>（木克土）、<b>金囚</b>、<b>水休</b>。',
      '标到四位上：人元甲木<b>旺</b>、贵神丁巳火<b>相</b>、将神丙辰土<b>死</b>、地分寅木<b>旺</b>。',
      '<b>用神在贵神丁巳</b>（四位甲阳、巳阴、辰阳、寅阳 —— 三阳一阴，以阴为用）。',
      '<b>这个课用的是"四课法"</b> —— 除了这一课，还起了<b>退宗、转宗</b>几课来对照。<b>四课法（退宗、正宗、转宗、进宗）是金口诀的深层技法</b> —— <b>同一件事起几课，各看一面</b>。',
      '<b>二、断语</b>',
      '1. 你的财运不是你单独求财，会有几人的参与。',
      '2. 你的工作项目与信息类有关，会有女人的参与。',
      '3. 你的规模不算小，但是看着有些冒险类的工作性质。',
      '4. 看来是有人罩着你，但是你所得之财会有分红给他人。',
      '5. 你的人脉还是很不错的，只是你好像有很多不满的地方。',
      '6. 你的网吧当初有人投资，但没有你付出的大。',
      '7. 兄弟发动，事在兄弟 —— 没有兄弟朋友的帮忙，你求财不容易。',
      '8. 你的网吧看着挺热闹，大多在玩游戏。',
      '9. 看着你的网吧有不规范的地方。',
      '10. 你的财运还是不错的，起码这个月效益有增加。',
      '11. 看你好像受过责罚损财，应该在去年春天。',
      '12. 这个月有设备增加或更新，但是花钱不多。',
      '<b>三、思路详解</b>',
      '<b>3.1 为什么断"不是单独求财、有几人参与"</b>',
      '<b>人元甲木与地分寅木同为木</b> —— <b>同类并见，主"不止一个"</b> —— 所以断<b>"会有几人的参与"</b> ✓',
      '<b>再看"兄弟动"</b>：<b>人元甲木与地分寅木同类</b>，这是<b>兄弟动</b> —— <b>主"事在比肩，要看兄弟朋友"</b> ✓ 这一课第 7 条正是"<b>兄弟发动，事在兄弟</b>"。',
      '<b>3.2 为什么断"与信息类有关、有女人参与"</b>',
      '<b>贵神是丁巳</b> —— <b>巳火主网络、主信息</b>；而<b>丁火是阴火，阴主女</b> —— 所以断<b>"有女人的参与"</b> ✓ 反馈："我妻子、还有舅子、同学一起做。"',
      '<b>3.3 为什么断"有人罩着、但要分红"</b>',
      '<b>课内木旺生火</b> —— 一路是"<b>我在供养上面</b>"的象；而<b>财爻（将神辰土）在死地</b> —— 所以断<b>"钱能来，但要分出去"</b> ✓ 反馈："网吧不好做，<b>不出血做不下去</b>。"',
      '<b>3.4 为什么断"网吧、玩游戏"</b>',
      '<b>巳火主网络</b>（本门常用的取象）—— 而<b>课内火相、木旺</b>，是<b>热闹之象</b>；<b>辰土为"人多聚集之处"</b> —— 合起来就是<b>"又热闹、又跟网络有关的地方"</b> ✓',
      '<b>3.5 为什么断"有不规范的地方"</b>',
      '<b>将神辰土在"死"地</b>，且<b>辰为墓库</b> —— <b>墓库主"藏、主不公开"</b>；<b>加上贵神带劫煞、地分带吊客</b> —— <b>两煞都在</b> —— 所以断<b>"有不规范"</b> ✓ 反馈："有小孩子玩游戏，人数还不少。"',
      '<b>3.6 为什么断"去年春天受罚损财"</b>',
      '<b>应期取"春天"</b> —— 因为<b>课内木旺，而木旺在春</b>；<b>辰土（财）正被木克</b> —— <b>春季木最旺时，财受克最重</b> —— 所以断<b>"去年春天被查、罚款"</b> ✓',
      '<b>四、这个课例的启示</b>',
      '<b>这一课最值得学的，是"四课法"的用法</b>：',
      '<b>同一件事，可以起退宗、正宗、转宗、进宗四课，各看一面。</b>',
      '<b>这一课的第 5、6、11 条都是从"转宗课""退宗课"上看出来的</b> —— 比如"<b>当初有人投资，但没有你付出的大</b>""<b>受过责罚损财</b>"，看的都是<b>旧事</b>（退宗课看过去）。',
      '<b>这就是"一课不够、几课合看"的道理</b> —— 与课例六里"同一时辰两个课"是同一个思路，只是技法更深一层。',
      '<b style="color:var(--c-gold)">第九节　课例九：断一段婚外感情</b>',
      '<b>一、课体</b>',
      '<code>`</code>',
      '月将：辰　日空：辰、巳　四大空亡：水',
      '人元：丁　　火 - 休　六丁',
      '贵神：己丑（贵人）　土 - 旺',
      '将神：壬辰（天罡）用　土 + 旺　吊客、截路',
      '地分：酉　　金 - 相',
      '<code>`</code>',
      '<b>求测背景</b>：一位男士问"<b>有个闹离婚的女人与他的感情有无结果</b>"。',
      '<b>先说明一点</b>：<b>这一课未给出四柱</b>，只给了月将、日空与四大空亡 —— <b>照实记录，不替它补</b>。',
      '<b>先定旺衰</b>：四位是<b>火、土、土、金</b>。<b>火克金</b>（金受克）；<b>土与火都不受克</b>（课内无水、无木）—— 取多者，<b>土旺</b>。土旺则<b>金相</b>（土生金）、<b>火休</b>（生土者）、<b>木囚</b>（克土者）、<b>水死</b>（土克水）。',
      '标到四位上：人元丁火<b>休</b>、贵神己丑土<b>旺</b>、将神壬辰土<b>旺</b>、地分酉金<b>相</b>。',
      '<b>定用神</b>：四位是丁（阴）、丑（阴）、辰（阳）、酉（阴）—— <b>三阴一阳，以阳为用</b> —— 阳在将神，所以<b>用神是壬辰</b>。',
      '<b>二、断语</b>',
      '1. 这个女人是主动追求你的。',
      '2. 可是你的感情也有些混乱。',
      '3. 她起码今年不会离婚，整个大家庭都在维护她的家庭。',
      '4. 2012 年你们认识，那年你财运不错但也没留住，大多给她花了。',
      '5. 她是喜欢你，但目前你心里有些空白、心里没底。',
      '6. 你们也不是一般关系了。',
      '7. 这个女人懂风情、比较浪漫，但感情不专一。',
      '<b>三、思路详解</b>',
      '<b>3.1 为什么断"她主动追求你"</b>',
      '<b>看人元与贵神</b>：<b>贵神己丑土在"旺"地</b>，而<b>人元丁火在"休"地</b>（火生土，人元在供养贵神）。',
      '<b>人元（我）去生贵神（对方）</b> —— 主<b>我这边在付出</b>；而<b>贵神旺</b> —— 主<b>对方气势足、主动</b>。',
      '<b>一旺一休，就是"她在前、我在后"</b> —— 所以断<b>"她主动追求你"</b> ✓',
      '<b>3.2 为什么断"感情也有些混乱"</b>',
      '<b>课内两位土（丑、辰）</b> —— <b>同类并见，主"不止一个"</b>；而<b>土主厚重、主混杂</b> —— 所以<b>感情上不单纯</b> ✓',
      '<b>再看"辰"这一位</b>：<b>辰为水库</b> —— <b>水库主"藏"</b> —— 主<b>这段关系是"藏着"的</b>，不是明面上的。',
      '<b>3.3 为什么断"她今年不会离婚"</b>',
      '<b>关键在"丑"的旺相</b>：<b>贵神己丑土旺</b>，而<b>丑为金库、又主"家庭、田宅"</b> —— <b>旺则稳</b> —— 所以断<b>"她的家庭是稳的、今年离不了"</b> ✓',
      '<b>这一课还说"整个大家庭都在维护她的家庭"</b> —— 这一层是从<b>丑土"厚重、主宗族"</b>的取象上来的。',
      '<b>3.4 为什么断"2012 年认识、那年财运不错但没留住"</b>',
      '<b>2012 年是壬辰年</b> —— <b>辰与课内的辰同类相应</b>（课内本有壬辰）—— 所以<b>那一年的事应在课内的"辰"上</b>；而<b>辰是财爻</b>（在将神）—— 所以断<b>"那年财运不错"</b>。',
      '<b>为什么"没留住"？</b> 因为<b>财爻辰土虽旺，却被地分酉金泄</b>（土生金）—— <b>泄就是"往外流"</b> —— 所以断<b>"钱花出去了"</b> ✓',
      '<b>3.5 为什么断"她喜欢你、但你心里没底"</b>',
      '<b>用神壬辰在将神（自己这一位）</b> —— 而<b>壬水克辰土</b>：<b>这一组本身就是"自克"</b> —— 主<b>自己心里矛盾、上下不齐</b>。',
      '<b>再加上将神带吊客、截路</b> —— <b>吊客主忧患、截路主阻滞</b> —— <b>两煞都在</b> —— 所以断<b>"心里没底"</b> ✓',
      '<b>3.6 为什么断"她懂风情、浪漫但不专一"</b>',
      '<b>贵神是己丑、带"贵人"</b> —— <b>贵神本主尊贵、体面</b>；而<b>丑土为金库，库主"藏"</b> —— 合起来是<b>"表面上体面、内里藏着东西"</b>。',
      '<b>再看课内两位土</b>（丑、辰）—— <b>同类并见</b> —— 主<b>感情的对象不止一处</b> —— 所以断<b>"不专一"</b> ✓',
      '<b>四、这个课例的启示</b>',
      '<b>这一课的特点是"三阴一阳、用神取阳"</b>：',
      '<b>四位三阴一阳时，取那一个"阳"为用</b> —— 这一课的阳在将神，所以<b>用神落在"自己"这一位</b>，整个断法就围绕<b>"我"的状态</b>展开。',
      '<b>另外一条</b>：<b>同类并见（两位土）在感情课上，几乎都主"不止一个"</b> —— 这一条在课例四、课例六里都出现过，<b>是反复用得上的规律</b>。',
      '<b style="color:var(--c-gold)">第十节　课例十：断能否走进婚姻</b>',
      '<b>一、课体</b>',
      '<code>`</code>',
      '干支：壬辰年　甲辰月　庚子日　丙子时',
      '月将：酉　日空：辰、巳　四大空亡：水',
      '人元：丁　　火 - 休　天德合、月德合、六丁',
      '贵神：丙戌（天空）　土 + 旺　天马',
      '将神：丙戌（河魁）用　土 + 旺　天马',
      '地分：丑　　土 - 旺',
      '<code>`</code>',
      '<b>求测背景</b>：一位女士问"<b>我和男友能冲破现实的阻碍，牵手走进婚姻吗</b>"。',
      '<b>先定旺衰</b>：四位是<b>火、土、土、土</b> —— <b>土占三位</b>，而<b>克土的木课内没有</b> —— 所以<b>土旺</b>。土旺则<b>金相</b>、<b>火休</b>（生土者）、<b>木囚</b>（克土者）、<b>水死</b>（土克水）。',
      '标到四位上：人元丁火<b>休</b>、贵神戌土<b>旺</b>、将神戌土<b>旺</b>、地分丑土<b>旺</b>。',
      '<b>定用神</b>：四位是丁（阴）、戌（阳）、戌（阳）、丑（阴）—— <b>二阴二阳，以将为用</b> —— 所以<b>用神是丙戌</b>。',
      '<b>二、断语</b>',
      '1. 你是个虔诚的人，心地善良、有信仰。',
      '2. 此事会有很多波折、是非。',
      '3. 土旺主迟缓，此事不能操之过急，否则会有崩溃的发生。',
      '4. 课内旺刑，能反映事情的复杂和心焦，内心有孤立之感。',
      '5. 两次刑入课，你会是个多婚之人，也许曾经有过婚姻之事。',
      '6. 02 或 03 年应该有过婚姻、或有过婚姻之事。',
      '<b>三、思路详解</b>',
      '<b>3.1 为什么断"虔诚、善良、有信仰"</b>',
      '<b>用神丙戌土旺</b>，而<b>土主厚重、主静定</b> —— <b>土旺之人多与佛道有缘</b>（这一条在婚姻课例三里已经用过）。',
      '<b>再看神煞</b>：<b>人元带天德合、月德合</b> —— <b>两德齐现</b>，主<b>心地善良、有福气</b>。',
      '<b>3.2 为什么断"波折、是非"</b>',
      '<b>贵神是丙戌、带"天空"</b> —— <b>天空主虚、主不实</b>；<b>将神是戌、带"河魁"</b> —— <b>河魁主争讼、主纠缠</b>。',
      '<b>两位戌土又完全相同</b>（贵神与将神同干支）—— <b>二神同位同类</b>，主<b>事情重叠、反复</b> —— 所以断<b>"波折不断"</b> ✓ 反馈："一直波折不断。"',
      '<b>3.3 为什么断"迟缓、不能操之过急"</b>',
      '<b>土旺</b> —— <b>土主"迟、稳"</b> —— 所以断<b>"此事迟缓"</b> ✓ 这正是婚姻章那条"<b>课内土多且旺，主晚婚</b>"的直接应用。',
      '<b>这一课还加了一句"否则会有崩溃的发生"</b> —— 这是从<b>三土重叠</b>上取象：<b>土太重则壅塞，急则溃</b>。',
      '<b>3.4 为什么断"多婚"</b>',
      '<b>课内两戌一丑</b> —— 而<b>丑与戌相刑</b>（丑戌未三刑中的两位）—— <b>刑的关系在课内重复出现</b>。',
      '<b>"两次刑入课，你会是个多婚之人。"</b>',
      '<b>刑主伤、主不合</b> —— <b>刑重复出现，主婚姻不止一次</b> ✓ 反馈："02 年结婚，09 年离的。"',
      '<b>3.5 为什么断"02 或 03 年有过婚姻之事"</b>',
      '<b>应期取"02 或 03"</b> —— <b>2002 是壬午年、2003 是癸未年</b> —— <b>午、未与课内的戌</b>：<b>午与戌半合火局</b>（寅午戌）、<b>未与戌相刑</b>（丑戌未）—— <b>一合一刑</b>，正是<b>"成婚、同时埋下隐患"</b>的象。',
      '<b>反馈：02 年结婚</b> ✓',
      '<b>四、这个课例的启示</b>',
      '<b>这一课最值得学的，是"两位完全相同"的读法</b>：',
      '<b>贵神与将神同为丙戌</b> —— <b>二神同位、同干支</b>，主<b>内外一致</b>（一条心）；但<b>同类并见</b>又主<b>重复、不止一次</b> —— <b>用在婚姻上就是"多婚"，用在事情上就是"反复"。</b>',
      '<b>同一个现象，两层含义</b> —— 要<b>结合所问的事</b>来定用哪一层。',
      '<b>另外一条</b>：<b>丑戌相刑在课内重复出现，是断"多婚"的直接依据</b> —— <b>刑的出现次数，与事情的重复次数相关。</b>',
      '<b style="color:var(--c-gold)">第十一节　课例十一：断伐木伤灾</b>',
      '<b>一、课体</b>',
      '<code>`</code>',
      '干支：戊子年　甲子月　丁亥日　丙午时',
      '月将：丑　日空：午、未　四大空亡：金',
      '人元：壬　　水 + 相　月德',
      '贵神：癸卯（六合）　木 - 死　截路',
      '将神：己酉（从魁）用　金 - 旺',
      '地分：寅　　木 + 死　天马、丧门、飞廉',
      '<code>`</code>',
      '<b>求测背景</b>：一位做装修的男士来问财运。',
      '<b>先定旺衰</b>：四位是<b>水、木、金、木</b>。<b>金克木</b>，所以<b>木受克</b>；<b>水与金都不受克</b>（课内无土、无火），各占一位 —— <b>并列，就看谁"克他爻"</b>：<b>金克木，而木就在课内</b> —— 所以<b>金旺</b>。金旺则<b>水相</b>（金生水）、<b>土休</b>（生金者）、<b>火囚</b>（克金者）、<b>木死</b>（金克木）。',
      '标到四位上：人元壬水<b>相</b>、贵神卯木<b>死</b>、将神酉金<b>旺</b>、地分寅木<b>死</b>。',
      '<b>定用神</b>：四位是壬（阳）、卯（阴）、酉（阴）、寅（阳）—— <b>二阴二阳，以将为用</b> —— 所以<b>用神是己酉</b>。',
      '<b>二、断语（节选）</b>',
      '1. 你是个闲不住的人，做事利落、头脑清醒。',
      '2. 是为财运来的吧，开车来的。',
      '3. 最近财运是有，但开支偏大。',
      '4. 最近在考虑很多事，但大多难以施展。',
      '5. 最近内部出现一些问题，是关于财的问题。',
      '6. 有追着你要账的，但大多是电话联系、找不着你。',
      '7. 要账最紧的可能是你的部下或小辈。',
      '8. 春天有投资的迹象，夏天伤财严重、还有麻烦事纠缠。',
      '9. 你的工作和木类交易、还和机器加工有关。',
      '10. 你砍伐了不少的树木。',
      '11. 伐木时好像伤人了，伤的不是你自己。',
      '12. 伤着膝盖或小腿厉害，头也伤了、但没有腿伤得厉害。',
      '13. 是刀具所伤的，现在还没有好利索。',
      '14. 工人受伤后你花钱不少，也耽误了很多财运和工作。',
      '15. 最近手头的资金大多在流动，手里的钱不是很多了。',
      '16. 甚至有在拿以前的存款应付，可是心里很不情愿。',
      '17. 一入秋的时候赚钱了，特别八月十五那个月收入多些。',
      '18. 到了 9 月又有花钱的地方，还遭小人算计破财。',
      '19. 10 月也不太好，虽然想存点钱但还是多有支出。',
      '20. 在家里大事好像你爱人说了算，赚钱是指望你的。',
      '<b>三、思路详解</b>',
      '<b>3.1 为什么断"做木类交易、与机器加工有关"</b>',
      '<b>课内两位木</b>（贵神卯木、地分寅木），<b>而用神是酉金</b> —— <b>金主机器、刀具、金属</b>。',
      '<b>所以这一课的结构是"金木相争"</b> —— <b>木是行业（木类交易），金是工具（机器加工）</b> ✓ 反馈："我是做装修的。"',
      '<b>3.2 为什么断"砍伐了不少树木"</b>',
      '<b>地分寅木、贵神卯木 —— 两位木都落在"死"地</b>（被旺金所克）。',
      '<b>木受克严重，而所问的又是生意</b> —— <b>木主树林、木材</b> —— 所以断<b>"砍伐了不少树木"</b> ✓',
      '<b>3.3 为什么断"伐木时伤人了、伤在膝盖小腿"</b>',
      '<b>关键在"金克木"的落点</b>：',
      '<b>用神酉金旺</b> —— <b>金主刀具</b>；',
      '<b>地分寅木死</b> —— <b>寅主腿、膝</b>（寅为阳木，主下肢）；',
      '<b>贵神卯木死</b> —— <b>卯也主四肢</b>。',
      '<b>金旺克木、木死</b> —— 所以断<b>"是刀具所伤，伤在膝盖小腿"</b> ✓ 反馈："脚踝以上伤得差点残废。"',
      '<b>而"伤的不是你自己"</b> —— 因为<b>受克的是地分与贵神</b>（贵神主外人、地分主下属），<b>而用神（自己）是旺的</b>：',
      '<b>旺的是自己，死的是别人</b> —— 所以<b>伤在旁人身上</b>。',
      '<b>3.4 为什么断"拿老本应付、心里不情愿"</b>',
      '<b>地分是寅木</b> —— <b>地分主固定财产、存款、老本</b>，而<b>寅木正处死地、又被酉金克</b> —— <b>老本受损</b>；',
      '<b>再加上地分带丧门、飞廉</b> —— <b>丧门主忧患、飞廉主"有非常之惊"</b> —— 所以断<b>"动用存款、心里不情愿"</b> ✓',
      '<b>3.5 为什么断"秋天赚钱、9 月遭小人算计破财"</b>',
      '<b>应期逐一取</b>：',
      '<b>"入秋赚钱"</b> —— <b>秋天金旺</b>，而<b>用神正是酉金</b> —— <b>用神得时则事顺</b> ✓',
      '<b>"9 月遭小人"</b> —— <b>九月为戌月</b>，<b>戌与课内的卯相合</b>（卯戌合）—— <b>合主牵绊、有人来沾</b>；<b>而卯戌合化火，火克酉金</b> —— <b>用神受伤</b> —— 所以断<b>"遭小人算计破财"</b> ✓',
      '<b>四、这个课例的启示</b>',
      '<b>这一课最值得学的，是"看谁旺、看谁死"这一条</b>：',
      '<b>同一组"金克木"，旺的是酉金（自己、工具），死的是寅卯木（下属、腿脚）</b> —— <b>谁旺，谁就站在有利的一边；谁死，谁就是"出事的那一方"。</b>',
      '<b>断"伤在别人身上"，不是靠猜，而是靠"用神旺、他位死"这个结构</b> —— <b>这一条在断伤灾、断事故时特别管用</b>。',
      '<b style="color:var(--c-gold)">第十二节　课例十二：断佛教用品店</b>',
      '<b>一、课体</b>',
      '<code>`</code>',
      '起课时间：2009 年 1 月 15 日 11 时 37 分（北京时间）',
      '干支：戊子年　乙丑月　庚申日　壬午时',
      '月将：子　日空：子、丑　四大空亡：金',
      '人元：乙　　木 - 死　天德合、月德合',
      '贵神：癸未（太常）　土 - 休',
      '将神：己卯（太冲）用　木 - 死　飞廉',
      '地分：酉　　金 - 旺　天喜',
      '<code>`</code>',
      '<b>求测背景</b>：有人在论坛上学金口诀，进来一位女士想求测 —— <b>彼此都不认识</b>。<b>当时见她头上戴一个金色发卡，就用"酉"做地分起了课。</b>',
      '<b>这就是"外应起课"</b> —— <b>不报数、不报属相，直接用眼前看到的东西取地分</b>：<b>金色发卡应"酉金"</b>，所以取酉。',
      '<b>先定旺衰</b>：四位是<b>木、土、木、金</b>。<b>金克木</b>（木受克）；<b>木又克土</b>（土也受克）—— 一路克下来，<b>只有金不受克</b>（课内无火）—— 所以<b>金旺</b>。金旺则<b>水相</b>、<b>土休</b>（生金者）、<b>火囚</b>（克金者）、<b>木死</b>（金克木）。',
      '标到四位上：人元乙木<b>死</b>、贵神未土<b>休</b>、将神卯木<b>死</b>、地分酉金<b>旺</b>。',
      '<b>定用神</b>：四位是乙（阴）、未（阴）、卯（阴）、酉（阴）—— <b>四位全阴，是纯阴课</b> —— 所以<b>用神是己卯</b>（纯阴以将为用）。',
      '<b>二、断语</b>',
      '1. 你是做生意的吧。',
      '2. 是做餐饮或文化行业的吧。',
      '3. 你本人就信佛烧香吧。',
      '4. 你有想出外的想法。',
      '5. 去西南方向，是否想改行不做了。',
      '6. 现在改不了，需要等到明年秋天再说。',
      '7. 现在你的生意不算很好，需要年后立春后生意转好。',
      '8. 你的胃不好，常有淤食的感觉，但无大碍。',
      '9. 一会你可能就要花钱买东西。',
      '10. 你买鸡不是为了吃吧。',
      '11. 你的婚姻应该定下来了 —— 你对他很好、常付出，但磕碰经常。',
      '12. 他就爱找你麻烦，但最后又回来和你道歉。',
      '13. 你们的婚姻大概要到 2011 年才能稳定。',
      '14. 你这个人闲不住、爱干净、对事敏感。',
      '<b>三、思路详解</b>',
      '<b>3.1 为什么断"做餐饮或文化行业、本人信佛"</b>',
      '<b>贵神是癸未、带"太常"</b> —— <b>太常主酒食、宴会</b> —— 所以断<b>餐饮</b>；而<b>未土又主寺庙、供奉</b> —— 所以断<b>文化、佛教用品</b> ✓ 反馈："经营佛教用品。"',
      '<b>再看神煞</b>：<b>人元带天德合、月德合</b> —— <b>两德齐现</b> —— 主<b>此人心地善良、有信仰</b> ✓',
      '<b>地分酉金又带天喜</b> —— <b>天喜主喜庆和合</b>，与"信佛、行善"的象相合。',
      '<b>3.2 为什么断"想出外、去西南、想改行"</b>',
      '<b>木死而金旺</b> —— <b>木主动、主生发</b>，<b>木死则"想动而动不了"</b> —— 所以断<b>"有想出外的想法"</b>。',
      '<b>方向看木的位置</b> —— <b>两位木在人元与将神</b>，而<b>未土（西南）在贵神</b> —— 所以断<b>"去西南方向"</b> ✓',
      '<b>想改行</b> —— <b>用神卯木在死地</b>，主<b>现在的行当"没力气了"</b>；<b>而金旺</b>，说明<b>新的路子（金）是有力的</b> —— 所以是<b>想改行</b>。',
      '<b>"现在改不了、要等明年秋天"</b> —— <b>秋天金旺、用神得时则事成</b> —— 应期落在<b>秋天</b> ✓',
      '<b>3.3 为什么断"生意年后转好"</b>',
      '<b>年后立春</b> —— <b>进入寅卯月，木得时</b> —— 而<b>课内两位木（人元乙、将神卯）正处死地</b> —— <b>木一得时，就活了</b> —— 所以断<b>"立春后生意转好"</b> ✓',
      '<b>3.4 为什么断"胃不好、有淤食"</b>',
      '<b>木克土</b> —— <b>土主脾胃</b> —— <b>课内土（未）正被木克</b>，所以<b>脾胃有毛病</b> ✓',
      '<b>为什么说"无大碍"？</b> 因为<b>未土虽受克，但只在"休"地、不是"死"地</b> —— <b>伤而不重</b>。',
      '<b>3.5 为什么断"婚姻对他好、但常磕碰"</b>',
      '<b>用神己卯木在死地、又被酉金冲</b>（<b>卯酉冲</b>）—— <b>冲主不合、主磕碰</b>；',
      '<b>而人元乙木与用神卯木同为木</b> —— <b>同类相帮</b> —— 主<b>自己这边是付出的一方</b>。',
      '<b>3.6 为什么断"2011 年才能稳定"</b>',
      '<b>2011 年是辛卯年</b> —— <b>卯与课内的用神卯木相同</b> —— <b>用神得岁相助</b>，所以<b>那一年才稳得住</b>。',
      '<b>四、这个课例的启示</b>',
      '<b>这一课最值得学的，是"外应起课"</b>：',
      '<b>不报数、不报属相，直接用眼前看见的东西取地分</b> —— <b>金色发卡取酉金</b>。',
      '<b>这不是随意取的</b> —— <b>"金"对应酉，"发卡"是金属之物</b> —— <b>取象要有依据</b>，不是见到什么就随便安一个地支。',
      '<b>另外一条</b>：<b>纯阴课</b>（四位全阴）主<b>事情不明朗、进展慢</b> —— 这一课断"婚姻要等 2011 年才稳""改行要等明年秋天"，<b>都应在这个"慢"字上</b>。',
      '<b style="color:var(--c-gold)">第十三节　课例十三：断装修摔伤</b>',
      '<b>一、课体</b>',
      '<code>`</code>',
      '起课时间：乙未年　庚辰月　甲子日　丁卯时',
      '月将：酉　日空：戌、亥　四大空亡：水',
      '人元：丁　　火 - 旺　天德合、月德合、六丁',
      '贵神：庚午（朱雀）用　火 + 旺　病符、飞廉',
      '将神：癸酉（从魁）　金 - 死　丧门、丧车',
      '地分：卯　　木 - 休　天医',
      '<code>`</code>',
      '<b>求测背景</b>：老家一位亲戚打来电话，说<b>家里有人受伤了</b>，问<b>伤得厉害不厉害</b>。',
      '<b>先定旺衰</b>：四位是<b>火、火、金、木</b>。<b>火克金</b>、<b>金克木</b> —— 一路克下来，<b>只有火不受克</b>（课内无土、无水，都克不到火）—— 所以<b>火旺</b>。火旺则<b>土相</b>、<b>木休</b>（生火者）、<b>水囚</b>（克火者）、<b>金死</b>（火克金）。',
      '标到四位上：人元丁火<b>旺</b>、贵神午火<b>旺</b>、将神酉金<b>死</b>、地分卯木<b>休</b>。',
      '<b>定用神</b>：四位是丁（阴）、庚午（阳）、癸酉（阴）、卯（阴）—— <b>三阴一阳</b> —— 按"三阴一阳阳上取"，用神取那位阳的，也就是<b>贵神庚午</b>（朱雀）。',
      '<b>二、断语</b>',
      '1. 家里有修建房子、装修的事。',
      '2. 有伤灾，而且会受伤两次，或者好几个地方都受伤。',
      '3. 破财，伤了以后家里拿不出钱来治。',
      '4. 伤在筋骨，特别是关节部位。',
      '5. 这个伤灾来得很突然，是从上面跌下来的。',
      '6. 还可能有头部受伤，或者是工作的时候分神引起的。',
      '7. 好的是没有生命危险，但一时半会儿不好治。',
      '8. 虽然家里没钱，但还能遇到贵人、能借到钱。',
      '9. 脚也伤了，不过不算严重 —— 看这样子是动不了了。',
      '<b>实际情况</b>：家里正在修房子，干活时下梯子 —— 因为下着小雨、下梯子的方法又不对，<b>人从歪倒的梯子上摔了下来，摔坏了胯骨</b>。',
      '<b>三、思路详解</b>',
      '<b>3.1 为什么断"家里有修建房子、装修的事"</b>',
      '<b>先看人元与地分的关系</b>：人元是<b>丁火</b>，地分是<b>卯木</b> —— <b>木生火</b> —— <b>地分生人元</b> —— 这就是"<b>父母动</b>"。',
      '<b>父母动的本义是"生我者"</b> —— 生我的是<b>父母、是长辈、是文书契约、也是房屋田产</b>。',
      '<b>为什么房屋田产会落在父母上？</b> 因为在取象里，"<b>生我</b>"这一层代表的是<b>先天的、根上的东西</b> —— <b>房子、地、祖上留下的家业，都是"托着你的东西"</b>，跟父母的角色是一样的。',
      '<b>而地分这一位，本身又主家宅、主内、主根基</b> —— <b>家宅生人元</b>，就是<b>家宅在往外使劲、在耗力</b> —— <b>正应了动土修建</b>。',
      '<b>再加一条</b>：<b>地分卯木上带着"天医"</b> —— <b>天医这一位主的是修补、诊治</b> —— <b>用在人身上是治病，用在宅子上就是修整房子</b>。',
      '<b>两条信息叠在一起</b>，所以第一句就断"有修建房子装修的事"。',
      '<b>3.2 为什么断"伤灾，而且伤两处或好几处"</b>',
      '<b>看贵神与将神的关系</b>：贵神<b>庚午火</b>，将神<b>癸酉金</b> —— <b>火克金</b> —— <b>贵神克将神</b> —— 这是"<b>贼动</b>"。',
      '<b>为什么叫"贼"？</b> <b>贵神是外面的、是客、是作用于我的力量；将神是里面的、是我自己的、是我所拥有的东西</b> —— <b>外面的力量来克我所有之物</b> —— 这就是"<b>贼</b>"的象 —— <b>被盗、被夺、被外力所伤</b>。',
      '<b>断伤灾，主要就落在这个动上。</b>',
      '<b>为什么是"两处、好几个地方"？</b>',
      '<b>数一数课内的火</b>：人元<b>丁火</b>、贵神<b>午火</b> —— <b>课里有两个火</b>，而<b>两个火都在克酉金</b>（丁火同样克酉金）—— <b>一处金被两处火克</b> —— <b>伤不会只有一处</b>。',
      '<b>这就是"受伤两次或多个地方受伤"的来历</b> —— <b>看克它的力量有几个</b>，不是凭空猜数。',
      '<b>再看压在将神上的两个煞</b>：将神<b>癸酉</b>上带<b>丧门</b>与<b>丧车</b>。',
      '<b>丧门</b>：<b>年支往前推两位</b> —— 乙未年，未往前两位是<b>酉</b>',
      '<b>丧车</b>：<b>春月的丧车在酉</b> —— 庚辰月属春（寅卯辰三个月），所以<b>酉</b>',
      '<b>这两个都是主凶丧吊问的煞，偏偏都压在被克的将神上</b> —— <b>克它的火有两处，凶煞又都坐在它头上</b> —— <b>这一场伤来得急、来得重</b>，就更好理解了。',
      '<b>3.3 为什么断"破财、家里拿不出钱治"</b>',
      '<b>还是贼动</b> —— <b>贼动的直接后果就是破财</b>：<b>将神受克，将神上带着的财物就被夺走了</b>。',
      '<b>再看两处细节</b>：',
      '<b>一是将神酉金临"死"地</b> —— <b>火旺金死</b> —— <b>财源本身已经是死气</b> —— 不是"钱少一点"，是"<b>拿不出来</b>"。',
      '<b>二是将神癸酉金反过来克地分卯木</b> —— <b>卯木是地分，是家宅的根基位</b> —— <b>金克木，好比刀砍木头</b> —— <b>家底被削</b>。',
      '<b>一个死财、一个被克的根基</b> —— 两条合起来，就是<b>因伤破财、家里拮据</b>。',
      '<b>3.4 为什么断"伤在筋骨，特别是关节"</b>',
      '<b>先从五行取象来</b>：<b>金在人身主骨、主牙齿、主关节</b>；<b>火主热、主燥、主急</b> —— <b>火克金</b>，就是<b>热灼于骨</b> —— <b>伤骨、伤关节</b>。',
      '<b>再从将神本身的象来看</b>：将神是<b>癸酉（从魁）</b> —— <b>酉这一支在人身主骨骼、主小腿、也主口齿</b> —— <b>酉金被烈火所克</b> —— <b>应伤的部位就落在骨骼关节上</b>。',
      '<b>3.5 为什么断"伤灾突然、从上面跌下来"</b>',
      '<b>这一断，看的是四位的"上下"</b> —— <b>金口诀的四位，人元在最上、贵神其次、将神再次、地分最下</b> —— <b>这个上下，本身就是"高下"之象</b>。',
      '<b>克的方向是"上克下"</b> —— <b>贵神在上、将神在下，上位的火克下位的金</b> —— <b>高处的力量压向低处</b> —— <b>正是"从上面掉下来"的象</b>。',
      '<b>再一个"突然"</b>：<b>火主急、主快、主暴</b> —— <b>火克金不是慢慢磨，是一下子</b> —— <b>所以这个伤来得突然，不是老病、不是积劳</b>。',
      '<b>上下与急暴两层一合</b>，断"突然从上面跌下"。',
      '<b>3.6 为什么断"头部受伤或工作时分神"</b>',
      '<b>人元在四位的最上面</b> —— <b>在人身取象上，最上的位置主头</b>。',
      '<b>人元是丁火</b> —— <b>丁火也克酉金</b> —— <b>位在最上、其火又去克金</b> —— <b>头部的象就出来了</b>。',
      '<b>"工作时分神"从哪儿来？</b> <b>丁火主心、主神志、主思维</b> —— <b>丁火居人元（最上），是心神这一层在起作用</b> —— <b>心不在焉、做事分神</b> —— <b>这才是摔下来的引子</b>。',
      '<b>这里要说明一句</b>：<b>这两条是"可能"的断法</b> —— <b>课里出现这个象，不等于一定应</b>，<b>但它指出了出事的"方式"</b> —— <b>事后来看，人正是在干活、注意力在别处的时候出的事</b>。',
      '<b>3.7 为什么断"没有生命危险"</b>',
      '<b>关键看"旺神有没有受伤"</b>。',
      '<b>这一课火旺</b> —— <b>人元丁火与贵神午火，是整个课里最强的一股气</b> —— <b>旺神不受克、不临死地</b> —— <b>主事的人，本命之气还是旺的</b>。',
      '<b>再看地分卯木上带着"天医"</b> —— <b>天医入课，主的是"能治、有救"</b> —— <b>伤虽重，医药上有人接得住</b>。',
      '<b>旺神不损、天医在位</b> —— 所以断<b>没有生命危险</b>；但<b>伤落在临死气的金上，一时半会儿好不了</b>。',
      '<b>3.8 为什么断"能遇到贵人、能借到钱"</b>',
      '<b>这一条，看的是人元上带的神煞</b>。',
      '<b>人元丁火，是本课的"天德合"，也是本课的"月德合"</b>。',
      '<b>先说天德合</b>：<b>辰月的天德是壬</b> —— <b>丁与壬相合</b> —— <b>丁就是天德合</b>。',
      '<b>再说月德合</b>：<b>辰月属申子辰水局</b> —— <b>水局的月德是壬</b> —— <b>壬与丁相合</b> —— <b>丁又是月德合</b>。',
      '<b>天德合、月德合两个都落在人元上</b> —— <b>这两个煞的本义，都是"化凶解忧、主尊长、主贵人"</b> —— <b>课里最凶的是贼动（破财伤灾），而人元这一位有解</b> —— <b>所以断"虽然家里没钱，但能遇上贵人，能借到钱"</b>。',
      '<b>这一断和前面"破财没钱治"并不矛盾</b> —— <b>前面的钱是自己家里的，后面的钱是外面来的</b> —— <b>一个是"家底被削"，一个是"有人相助"</b> —— <b>课里两条线同时存在，断的时候就要一起说出来</b>。',
      '<b>3.9 为什么断"脚也伤了、动不了"</b>',
      '<b>地分在四位的最下面</b> —— <b>在人身取象上，最下的位置主足、主下肢</b>。',
      '<b>地分是卯木</b> —— <b>将神癸酉金克卯木</b> —— <b>金克木</b> —— <b>下肢受克</b> —— <b>脚上有伤</b>。',
      '<b>更重的一层：卯与酉相冲</b> —— <b>课里地分卯、将神酉，正是一对相冲</b> —— <b>冲主碰撞、主闪挫、主动弹不得</b> —— <b>所以断"脚也伤了，看样子动不了了"</b>。',
      '<b>那"不会很严重"又怎么来？</b> <b>卯木在本课是"休"</b> —— <b>休是被泄气，不是被克死</b> —— <b>休地上的伤，是"使不上劲"，不是"断了"</b> —— <b>所以说得就比胯骨那一处轻</b>。',
      '<b>3.10 回头对课：实情怎么落在课上</b>',
      '<b>事情的原委是</b>：家里修房子，干活下梯子时下着小雨、下梯子的方法又不对，<b>人从歪倒的梯子上摔下来，摔坏了胯骨</b>。',
      '<b>一句一句对回去</b>：',
      '<b>修房子</b> —— 父母动（地分生人元），天医又在地分上',
      '<b>从梯子上摔下</b> —— 贼动，上克下，火性急暴',
      '<b>摔坏胯骨</b> —— 火克金，金主骨；卯酉相冲，下肢受克',
      '<b>下着小雨</b> —— 这一课的"四大空亡"正在水 —— <b>水空则水气不实、雨不成势</b>，正是"下着小雨"的那一点湿气',
      '<b>能借到钱</b> —— 天德合、月德合双双落在人元上',
      '<b>还有一处特别值得记</b>：<b>这一课的月将是酉，而酉正是课里的将神</b> —— <b>月将入课、又恰好是受克的那一位</b> —— <b>这个月的事直接落在自己身上</b>，<b>伤的份量自然就重</b>。',
      '<b>四、这个课例的启示</b>',
      '<b>这一课最值得学的，是"分层断"</b>。',
      '<b>同一个贼动，可以断出好几件事</b>：',
      '<b>从"谁克谁"断伤灾</b> —— 贵神克将神',
      '<b>从"克它的有几个"断伤几处</b> —— 两个火克一个金',
      '<b>从"上下位置"断从高处跌落</b> —— 贵神在上、将神在下',
      '<b>从"五行取象"断伤在骨节</b> —— 火克金',
      '<b>从"将神状态"断破财的程度</b> —— 酉金临死地',
      '<b>同一个动，往五个方向去看，出来五条断语</b> —— <b>这就是"一个课能断万事万物"的具体做法</b>：<b>不是把课看成一句话，而是把课看成一组关系，每一组关系都往你要问的那件事上引。</b>',
      '<b>第二条启示</b>：<b>先断凶、再断救</b>。',
      '<b>这一课里，贼动是凶，天德合、月德合是救；旺神不损是命脉，天医在位是医药</b> —— <b>断课不能只说凶不说救，也不能只说救不说凶</b> —— <b>两条线都摆出来，求测的人才知道自己站在哪儿。</b>',
      '<b>第三条</b>：<b>断课要落到"能不能动"这种实处</b>。<b>"脚伤不严重但动不了"、"没有生命危险但一时半会儿治不好"</b> —— <b>这种话比干巴巴一句"有伤灾"有用得多</b> —— <b>求测的人要的正是这个。</b>',
      '<b>最后一条底线</b>：<b>这一课牵涉受伤，断的时候守住一条</b> —— <b>只断伤的轻重、部位、能不能治，不断生死、不给"能不能保住"这类话</b> —— <b>这不是本事大小的问题，是做这一行必须守的规矩。</b>',
      '<b style="color:var(--c-gold)">第十四节　断课的完整流程示范</b>',
      '<b>这一节不重复第九章</b> —— <b>十步流程的完整讲解在第九章</b>，这里只讲一件事：',
      '<b>从课例里学什么、怎么学。</b>',
      '<b>前面十三个课例，每一个都是"断课"的示范。</b> 但<b>看课例不能只看"他断出了什么"，更要看"他是怎么走到那一步的"</b> —— <b>这一节就讲这个。</b>',
      '<b>一、拿到课的第一件事</b>',
      '<b>不是急着断，而是先"圈定范围"</b>：',
      '<b>问什么？</b> ——求财？婚姻？工作？',
      '<b>有没有特别要问的？</b> ——比如"今年能不能升职"',
      '<b>范围定了，才知道该看哪里。</b>',
      '<b>二、按十步走</b>',
      '<code>`</code>',
      '① 定旺衰',
      '② 判用神',
      '③ 看五动三动',
      '④ 看格局',
      '⑤ 看人元',
      '⑥ 二神关系',
      '⑦ 神煞',
      '⑧ 五行细推',
      '⑨ 结合四柱',
      '⑩ 慎下断语',
      '<code>`</code>',
      '<b>三、断语的层次</b>',
      '<b>好的断语应该是这样的层次</b>：',
      '<b>第一层：定性</b>',
      '"你现在的感情很被动，处于说不清的状态。"',
      '<b>第二层：具体化</b>',
      '"你这个蓝颜朋友是非很多，总是在与你男友之间制造矛盾。"',
      '<b>第三层：给时间</b>',
      '"这个月闹得最厉害。"',
      '<b>第四层：给建议</b>',
      '"别再和蓝颜交往，下月还有男友和好的机会。"',
      '<b>这个层次是"从大到小、从抽象到具体、最后落到行动"。</b>',
      '<b>四、语言的把握</b>',
      '<b>4.1 涉及隐私要委婉</b>',
      '<b>比如断到"有外情"</b> ——<b>可以说"你身边有别的异性缘"，不要说"你有外遇"。</b>',
      '<b>4.2 不断生死</b>',
      '<b>断病可以说"你这个病要小心"，但不能说"什么时候死"。</b>',
      '<b>4.3 劝合不劝离</b>',
      '<b>断婚姻即使看出要散，也要把利害关系讲清楚，让求测者自己决定。</b>',
      '<b>4.4 给化解方案</b>',
      '<b>断课不只是"说凶吉"，还要"给办法"。</b>',
      '<b>化解三层次</b>：',
      '<b>安抚</b> ——顺着它',
      '<b>克制</b> ——必要时才用',
      '<b>通关</b> ——最理想',
      '<b>五、复盘与提高</b>',
      '<b>每次断课后，做三件事</b>：',
      '<b>第一件：记录</b>',
      '<b>把课体、断语、思路都记下来。</b>',
      '<b>第二件：对照</b>',
      '<b>事后对照——哪里对了，哪里错了。</b>',
      '<b>第三件：复盘</b>',
      '<b>对的地方——想想为什么对（是哪个符号起了作用）</b>',
      '<b>错的地方——想想为什么错（是漏看了什么，还是取象错了）</b>',
      '<b>这是提高最快的方法。</b>',
      '---',
      '<b style="color:var(--c-gold)">本章小结</b>',
      '<b>一、课例一（工作调动）</b>',
      '<b>一个课能断十条信息</b> ——每条都有依据。',
      '<b>驿马断"动不动"</b>；<b>三金断"几个人"</b>；<b>空亡断"实不实"</b>；<b>五行取象断"什么工作、什么长相"</b>；<b>一路生外断"财往外流"</b>。',
      '<b>相貌以旺相为主不论空。</b>',
      '<b>二、课例二（感情）</b>',
      '<b>断感情第一步是"找谁是谁"</b> ——看谁在"局"里、谁在"局"外。',
      '<b>午戌为火局正缘，巳为局外人</b> ——所以巳是"第三者"。',
      '<b>巳午主信息</b> ——所以误会发生在沟通中。',
      '<b>月建与课内的关系</b> ——断"这个月闹得最厉害"。',
      '<b>干冲</b> ——主对方反感、离开之意。',
      '<b>三、课例三（断病）</b>',
      '<b>断病三个层次</b>：五行对应、四位对应、神煞与治疗。',
      '<b>中医属木、西医属金、神婆属阴。</b>',
      '<b>一条纪律：不断生死。</b>',
      '<b>四、课例四（官司）</b>',
      '<b>朱雀主合同、病符主毛病</b> ——合起来断"合同不完善"。',
      '<b>六合变三合</b> ——断"合同发生变化"。',
      '<b>三奇与太岁</b> ——断"有贵人相助"。',
      '<b>丑戌未三刑</b> ——断"土地纠纷"。',
      '<b>干神相生能和解。</b>',
      '<b>五、课例五（出行）</b>',
      '<b>驿马断"动"</b>；<b>驿马逢三合六合为马群</b>（多人同行）。',
      '<b>把课内地支与十二时辰逐个对照</b> ——断"具体什么时候发生什么"。',
      '<b>子午卯酉在半道，寅申巳亥未动身，辰戌丑未立等至。</b>',
      '<b>六、课例六（综合）</b>',
      '<b>取象推演的三层</b>：从本性出发 → 延伸到具体事物 → 再延伸到现代事物。',
      '<b>火主"有光有影"</b> → 电影、娱乐、信息。',
      '<b>逐月推演</b> ——把课内支与月建对照，断吉月凶月。',
      '<b>七、断课的完整流程</b>',
      '<b>先圈定范围</b>，再按十步走。',
      '<b>断语的四个层次</b>：定性 → 具体化 → 给时间 → 给建议。',
      '<b>语言把握四条</b>：隐私委婉、不断生死、劝合不劝离、给化解方案。',
      '<b>复盘三件事</b>：记录、对照、复盘。',
      '---',
      '<b style="color:var(--c-gold)">心法</b>',
      '<b>看课例，看的是"思路"不是"答案"</b>',
      '<b>很多人看课例，只看"断了什么"，不看"怎么断的"。</b>',
      '<b>这样看一百个课例，还是不会断。</b>',
      '<b>正确的看法是</b>：',
      '<b>看到课体，先自己试断一遍</b> ——<b>然后再看思路。</b>',
      '<b>对比"我想到的"和"实际断的"，差距在哪里。</b>',
      '<b>这个差距，就是你要补的功课。</b>',
      '<b>每一个断语都要有依据</b>',
      '<b>好的断课，不是"我觉得"，而是"课里显示"。</b>',
      '<b>比如断"蓝颜是非多"</b> ——<b>依据是"巳主是非"。</b>',
      '<b>如果追问"为什么是巳？"</b> ——<b>因为巳在火局之外，是"局外人"。</b>',
      '<b>再追问"为什么巳是局外人？"</b> ——<b>因为午戌半合火局，巳不在其中。</b>',
      '<b>每一步都能追问下去</b> ——<b>这就是"有依据"。</b>',
      '<b>而没有依据的断课，是"猜"</b> ——<b>猜对了也不知道为什么对，猜错了也不知道为什么错。</b>',
      '<b>一个课能断万事万物</b>',
      '<b>同一个课，可以断财运、婚姻、工作、环境、家人……</b>',
      '<b>为什么？</b>',
      '<b>因为"全息"</b> ——<b>课内的任何信息都是你的信息。</b>',
      '<b>所以学到最后</b> ——<b>不是"一个课只能断一件事"，而是"一个课能断很多事，关键看你怎么问"。</b>',
      '<b>这也是金口诀"信息量有限，但能模拟万事万物"的含义。</b>',
      '<b>慎下断语</b>',
      '<b>断课的话会影响人。</b>',
      '<b>一句"你今年破财"，可能让人整年不安；一句"你们成不了"，可能拆散一段姻缘。</b>',
      '<b>所以</b>：',
      '<b>大方向要明确</b> ——不能含糊其辞',
      '<b>细节要留余地</b> ——不能把话说死',
      '<b>要给出办法</b> ——不只是说凶吉，还要说怎么办',
      '<b>这就是"慎下断语"的含义</b> ——<b>也是这门学问"服务大众"的本分。</b>',
      '<b>学易先做人</b>',
      '<b>这一条贯穿全书</b>：',
      '<b>学易先做人。</b>',
      '<b>易是来源生活、服务生活的。如果一个人德性败坏，掌握这门学问后用来坑蒙拐骗，岂不是对易的亵渎，也给我们这些真心研习之人蒙羞。</b>',
      '<b>既然选择了学易，就必须先有德。</b>',
      '<b>技术是工具，人心是根本。</b>',
      '<b>愿学者共勉。</b>',
    ]},
    { t: '课例班特别篇', rows: [
      '<b style="color:var(--c-gold)">引言</b>',
      '<b>这一篇是什么</b>',
      '课例班是金口诀课程里独立的一门 —— <b>十讲，全程实战</b>：课上的人报出一个已经起好的课和它的断语，讲者带着大家一条一条往回拆，看每一条断语是从课里的哪个字上出来的。',
      '<b>这一篇就是这十讲的整理稿。</b>',
      '<b>与前十三章的关系</b>',
      '<b>这一篇不进正文章节</b>，因为它和前十三个章的性质不同：',
      '前十三章是<b>按知识体系编的</b> —— 从阴阳五行讲到分类断课，一步步往上搭；',
      '这一篇是<b>按讲课顺序整理的</b> —— 十讲之间没有严格的递进，讲的始终是一件事：<b>这一条断语，是怎么看出来的</b>。',
      '<b>所以它更像一本"思路集"</b> —— 补的是前十三章给不了的那样东西：<b>面对一个具体的课，眼睛该往哪儿放。</b>',
      '<b>读法</b>：前十三章读完再读这一篇；或者手边正有一个断不下来的课，翻这一篇找找同类的例子。',
      '<b>关于课体：只写有把握的</b>',
      '<b>这一篇有一件事必须先交代。</b>',
      '课例班<b>没有课件、没有教材</b>，只有讲课录音。讲者手里有盘，问的人和听的人手里也有盘，<b>唯独录音里没有把四位完整报出来</b> —— 他讲的是"这个卯木生那个午火"，而不是"人元某某、贵神某某、将神某某、地分某某"。',
      '<b>所以这一篇对课体的处理是</b>：',
      '<b>录音里明确报出来的，写；没有报出来的，不写；能推但不确凿的，标明"未报出"。</b>',
      '<b>不替讲者补盘。</b> 一个四位不全的课，硬按五行生克或月将加时反推出来，看着完整，其实已经是另一个课了 —— <b>那样的"课体"没有用，还有害。</b>',
      '<b>因此这一篇里，能给出完整四位的课例是少数，多数课例只留下部分线索。</b> 这不是整理的疏漏，是材料的实情。',
      '<b>材料整理说明</b>',
      '原始录音十讲，共约 17 小时；转写后约 22.5 万字；',
      '转写稿含大量同音错字（如"月剑"＝月建、"油金"＝酉金、"银木"＝寅木、"尘土"＝辰土），已按上下文逐一订正；',
      '讲者的口头重复、课堂互动、课程通知等内容已删去；',
      '<b>凡保留的断法，都能在录音里找到原话依据。</b>',
      '---',
      '---',
      '<b style="color:var(--c-gold)">断法精要</b>',
      '<b>这一部分按主题归类。</b> 十讲里讲到的法则，打散了重编 —— 同类的放在一起，每条注明出自第几讲。',
      '<b>一、看课的次序</b>',
      '<b>拿到一个课，先看什么、后看什么，课例班反复强调过定序。</b>',
      '<b>先看旺衰，这是第一位的</b>',
      '<b>旺相休囚死是第一位的，必须先要看到旺相休囚死。</b>（第一讲）',
      '<b>看工作，先看贵神</b> —— 哪怕贵神不是用神：',
      '<b>看工作呢，首先肯定是看贵神……可能这个贵神他不是用神的情况下，我们也要去关注贵神，因为贵神是代表工作的。</b>（第一讲）',
      '<b>先看"这一组干支是什么组合"，再看别的</b>',
      '<b>我们在断课的首先第一步先看这一组干支的组合是什么，再看他自身的状态是什么。</b>（第一讲）',
      '干支组合是"直读"的入口 —— 只这一组，就能读出一个人的当下状态。以贵神为例：',
      '| 组合 | 读出来的状态 |',
      '|---|---|',
      '| <b>乙卯</b>（比和、二木） | 工作清闲，但有积极性 |',
      '| <b>丁卯</b> | 对工作没有积极性 |',
      '| <b>癸卯</b> | 积极性更高（外生内） |',
      '| <b>辛卯</b> | 自我相冲、自我矛盾，"自己都不想干这个工作了" |',
      '<b>但不要停在用神上 —— 要纵观全课格局</b>',
      '<b>虽然是以贵神为主，最好呢，也要纵观整个课题的格局……这样下出来的断语比较全面。</b>（第九讲）',
      '<b>你不要总是在这个用神上看，你看整个课的格局是什么格局。</b>（第十讲）',
      '<b>细节在课内找，四柱管大问题</b>',
      '<b>这些细节大多是在课内的，只有大的问题它才出现在四柱。</b>（第七讲）',
      '<b>如果课内有矛盾点，那就是课内是最主要的</b> —— 课内实在找不出矛盾，再看四柱。（第三讲、第七讲）',
      '<b>论具体的人与事，必须落到二神上</b>',
      '<b>论两个人的详细情况的时候，都要拉到二神上来。</b>（第八讲）',
      '<b>论具体事情的时候，必须要在二神上分析</b> —— 求测方在将神，对方就在贵神。（第二讲）',
      '<b>地分只代表身份信息</b>，论细节时身份要转换到二神上 —— <b>"课内的信息都是活的"</b>（第二讲）。',
      '<b>四柱是"外环境"，看层级定影响</b>',
      '太岁是国家级机构、月建是省府、日建是市、时辰是直属机关 —— <b>哪一个离你最近，哪一个对你直接起的作用大。</b>（第一讲）',
      '---',
      '<b>二、取象</b>',
      '<b>这一节收的是"某个字读成什么"。很多是前十三章没有的。</b>',
      '<b>巳亥主网络</b>',
      '<b>巳亥为网络还是很准确的</b> —— 经多次验证。（第二讲）',
      '<b>如果课内出现巳亥的时候，就首先要想到可能与网络有关。</b>（第九讲）',
      '<b>庚午主电子电器</b>，又主<b>改门接屋、装修转换</b>；临贵神主工作变更。（第二讲）',
      '<b>戌土主宗教、佛道</b>，又主<b>法律、军警、城管</b>。（第三讲）',
      '<b>酉金、辛金代表法律、条文、标牌</b>。（第三讲）',
      '<b>卯木主交易</b>，又为<b>贼神</b> ——「卯木也为盗贼也为贼神，他和这个辰土是相克害的，我们就经常指这一部分人为小人」（第十讲）',
      '<b>酉金主金属材料、车辆、金融</b> —— 临将神多主金融，临贵神多主机械技术。（第八讲）',
      '<b>辰戌丑未为容器</b>，<b>辰土</b>最典型：水杯、皮箱、皮带 —— 外硬而中空。（第二讲）',
      '<b>丑土旺 → 家有供奉</b> ——「课内出现丑土旺的时候，一般家里都有供奉的观音菩萨」；二土则供奉多样。（第二讲）',
      '<b>六亲定法</b>',
      '<b>母亲看地分</b> ——「生我为母」；<b>父亲看贵神</b>。（第八讲）',
      '另有以辰土断父的方法（第一讲、第十讲）。',
      '<b>四位可贴到人身</b>',
      '<b>人元为己土，贵神为胸，将神为腹，地分为腿脚。</b>（第三讲）',
      '人元旺 → 头沉；地分水休死 → 腿脚无力。',
      '<b>这一层最要紧的用法是"一个课可以贴到任何事物上"</b> —— 贴脸断脸、贴人断人、贴事断事（第一讲）。',
      '---',
      '<b>三、动、应期与时间</b>',
      '<b>断"动"先想马星</b>',
      '<b>首先要动的话，我们首先想到的是马星。</b>（第二讲）',
      '<b>没有马你走不动啊，没有动向了。</b>（第八讲）',
      '<b>驿马一般从日上取</b>，月、年、时辰上都可以取。（第七讲）',
      '<b>天马、驿马通称"马星"</b>；两者常在课内并见。（第八讲）',
      '<b>双重信息才敢下应期</b>',
      '驿马 ＋ 相合 同时指向某月，准确度才高（第二讲）。断月份时，还要用<b>排除法</b>把三刑、相害、不利之月先剔除（第八讲）。',
      '<b>六合遁法</b>（最简遁法）',
      '口诀叫「<b>用神无力寻六合</b>」——<b>有六合不取三合</b>；断婚姻应期、断日子都取六合。（第二讲）',
      '<b>断应期两个思路：驿马、连茹</b>（第九讲）。',
      '<b>子午为分界线</b>',
      '按旬划分：<b>子在左 → 己土可作丑土用；子在右 → 作未土用</b>。（第二讲）',
      '<b>论流年流月不论空亡</b>',
      '<b>论年份是没有空亡的</b> —— 论当下状态才论空。（第二讲）',
      '<b>论流年流月的时候，他就是不空的。</b>（第三讲）',
      '<b>"这个月"怎么看</b> —— 必须看<b>月建</b>与课内的关系；月建、日建、时辰可以联系起来，太岁一般不太留意（第八讲）。',
      '---',
      '<b>四、力量与状态</b>',
      '<b>太岁永远不空</b>',
      '<b>太岁是永远不会空的……只有时辰和日他可以空。</b>（第一讲）',
      '<b>由此得出一条反直觉的断法</b>：<b>临太岁又逢空，照样可以断有钱</b> —— 因为空的是它的状态，太岁本身不空；只说明<b>这笔财隐藏得好、不显山露水</b>。（第一讲）',
      '<b>逢空但旺 → 手里没钱，不等于量少</b>',
      '<b>他旺不等于他借出去的少</b> —— 空只说明"现在的状态"，不说明规模。（第二讲）',
      '<b>火旺主飘</b> ——「火过旺的时候主飘」，财飘走，人主不定性。（第二讲）',
      '<b>土多金埋 → 反而不善言辞</b>',
      '二土生酉金，这人不但不健谈，还不爱讲话。<b>要看金的位置</b>：<b>金在地分被埋 → 不讲话；金在上（贵神、将神）→ 埋不住，能讲</b>。（第二讲）',
      '<b>金空则明</b> —— 二金同空如大小铃铛相碰，主二人闹腾争吵。（第八讲）',
      '<b>空 + 月破 同见 → 不想干了</b> ——「空呢，本身就是不怎么积极不怎么有信心了，再加上这个月破，那就更是身心难安」（第三讲）',
      '<b>但看格局时不要把空当空看</b>，只有论细致问题才以空来断。（第八讲）',
      '<b>下克的力量小</b> —— 论克时，下位克上位力量小，问题不大。（第七讲）',
      '<b>多对一的几种读法</b>',
      '| 结构 | 读法 |',
      '|---|---|',
      '| <b>三生一</b> | 聚财格局 |',
      '| <b>一生三</b> | 耗财格局；论感情主不单一、易有第三者 |',
      '| <b>多克一</b> | 论工作为工作量大事多，论财为多想得财，论感情为多段感情 |',
      '| <b>二克一</b> | 一是合伙来算计，二是不止一次地算计 |',
      '| <b>一生二</b> | 感情反复，或两段感情 |',
      '| <b>一克二 / 一害二</b> | 易出现二婚 |',
      '（第九讲、第十讲、第八讲）',
      '<b>木多主乱、主不顺</b> —— 但在<b>以木为财</b>的课上不作此断。（第九讲）',
      '<b>人元临癸水多主疑惑难行</b> ——「鬼水难行」。（第八讲）',
      '---',
      '<b>五、格局与结构</b>',
      '<b>纯阴课：事情不明朗</b>',
      '<b>纯阴课你就要知道肯定有一种压抑感，有一种不能突破的感觉，看不到光明的感觉</b> —— 容易造成自我的心理压力。（第三讲）',
      '纯阴课断感情：不明朗、没有明确目标、看不到多大希望。（第二讲）',
      '<b>一个有意思的统计</b>：讲者经手的同性相恋课例共五个，<b>其中三个是纯阴课</b>。（第二讲）',
      '<b>一路生下来 → 金字塔式层级</b> —— 从人元一路生到地分，用于断传销、上下线结构。（第三讲）',
      '<b>连茹 → 扒不开、退不出来</b> ——「双连茹的关系，里面这个关系它是扒不开的」。（第三讲）',
      '<b>内克外 → 内部的人不服他，他也不服上级</b>。（第十讲）',
      '<b>位置颠倒定主客</b> —— 对方落到将神位，即地位反转、由明转暗。（第十讲）',
      '---',
      '<b>六、神煞活用</b>',
      '<b>丧车沾不得</b>',
      '<b>丧车这个东西，他克你不行，你克他也不行</b> —— 就是沾不得的一个东西，<b>谁沾了他谁倒霉</b>。（第一讲）',
      '<b>天乙（天一）代表有救、能治</b> —— 可断治病、治虫害；也可断资金有救。（第九讲、第十讲）',
      '<b>但若天乙所临之地支死空，则回天无力</b>。（第十讲）',
      '<b>酉金破木局最快</b> —— 冲开成散，"溃不成军"；<b>申金冲只伤一部分、仍成型</b>。（第二讲）',
      '<b>戌土临天空又逢空 → 多主有修为之人</b> —— 但须看具体是什么人，不可一律断虚诈。（第七讲）',
      '<b>马星逢火克金 → 易出车祸、道路凶险</b>。（第七讲）',
      '<b>总则</b>：<b>神煞需要活用活断</b>，它的作用不限于断病。（第七讲）',
      '---',
      '<b>七、断课的立场与话术</b>',
      '<b>这一部分不是技法，但十讲里反复出现，且讲者说"断对也失败"。</b>',
      '<b>话留三分</b>',
      '<b>凡事话留三分，不要图痛快</b> —— 「有的人在群里断课，一股脑把人家的东西都讲出来了……最好留一点口德，不要把一些事说得太绝，适可而止。」（第三讲）',
      '<b>多断几条类象，没有坏处</b>',
      '一个五行代表的类象太多，无法一次断准 ——<b>大面积撒网，让求测者自己去对</b>，比你只报一个行业要周全（第一讲、第九讲、第十讲）。',
      '<b>表达要恰当，否则前功尽弃</b>',
      '<b>但是这个断语的表达啊，这个还是很重要的，否则呢，你就是前功尽弃。</b>（第八讲）',
      '<b>必须要表达到充分、表达恰当才可以。</b>（第七讲）',
      '<b>用五行论"状态"，不是论"命"</b>',
      '求测者常问"我是不是水命" —— 要解释清楚：<b>课里的五行是当下的信息状态，不是八字的命</b>。（第三讲）',
      '<b>没有把握时，先断性格建立信任</b>（第八讲）。',
      '<b>断出问题，也要给人一点希望</b> ——「你已经把这个结果告诉他了，但是你还要给他一定的鼓励、给他一定的信心」（第三讲）。',
      '---',
      '<b style="color:var(--c-gold)">课例实录</b>',
      '<b>这一部分只收四位报得出来的课例。</b> 十讲共一百多条断语，但<b>四位完整报出的只有十一个</b>；其中<b>四柱齐全、可以复算的只有三个</b>。',
      '<b>这四个课例最值得读</b>，因为可以逐字复核。',
      '---',
      '<b>课例一　73 年男子问事业财运（第七讲）</b>',
      '<code>`</code>',
      '人元：己　　土',
      '贵神：甲午',
      '将神：辛卯',
      '地分：丑　　土',
      '<code>`</code>',
      '<b>求测者</b>：1973 癸丑年男子，属相丑 —— <b>以属相起课</b>，故地分为丑。',
      '<b>报出的其他信息</b>：日建<b>乙木</b>（力量大于将神卯木，来克地分丑土）；月建<b>辰土</b>；14 年太岁午火、15 年太岁未土；神煞见飞廉、吊客、天医、五鬼。',
      '<b>这一课的断法拆解</b>：',
      '<b>一看进出</b>：<b>人元甲己合</b>（原文"首先是甲己合，甲木和人元的己土"）——<b>主与外界有合作、常求助他人</b>。',
      '<b>二看财路</b>：<b>将神卯木为财星</b>，它去生午火 → <b>把午火的类象定为财路</b> —— 午火主票据、合同，所以断"工作以合同票据为主，或与金融交易投资有关"。',
      '<b>三看资金</b>：<b>流动资金一般在将神上取象</b> —— 将神卯木旺，手头资金可以；但<b>将神还要生午火，被泄力</b> —— 所以断"把钱放出去的规模不能太大"。',
      '<b>四看得财方式</b>：<b>将神卯木克人元己土</b> —— 克人元为<b>出外得财</b> ——「你要去收这个钱去，你出去收钱去」。',
      '<b>五看应期</b>：<b>亥子月水生木、木克土</b>，是得财之月；同时水旺克火，也是合同失效的时点。',
      '<b>这一课还有一层值得记的</b>：<b>日建乙木比将神卯木力量更大，也来克地分</b> —— <b>主开支大、超出承受能力</b>。同一个"克地分"，<b>谁的力量大，谁的事情先应</b>。',
      '---',
      '<b>课例二　女教师被合资项目骗（第三讲）</b>',
      '<code>`</code>',
      '人元：己　　土',
      '贵神：酉　　金　（逢空）',
      '将神：亥　　水',
      '地分：亥　　水',
      '<code>`</code>',
      '<b>求测者</b>：一位女教师。<b>起课方式很特别</b> —— <b>不用生辰、不用属相，用她的网名"男男"化成亥水起课</b>。',
      '<b>课体</b>：<b>纯阴课</b>（四位全阴）；<b>月建卯</b>（"3月5号是辛卯月的第一天"）→ <b>卯月破酉</b>，<b>贵神酉金逢月破</b>；<b>日时两个戌土</b>；<b>金空</b>。',
      '<b>断法拆解</b>（这一课的推理链很完整）：',
      '<b>第一步：纯阴课定性</b> ——「纯阴课你就要知道肯定有一种压抑感，有一种不能突破的感觉，看不到光明的感觉」。',
      '<b>第二步：金空 + 月破</b> —— <b>酉金空</b> → 项目被架空、口说空话；<b>月破</b> → 交易不合法。',
      '<b>第三步：一字一路生下来</b> —— 从人元往下：<b>土生金、金生水</b> ——「土生金、金生水，说得挺好的」 —— <b>这就是金字塔式的上下线结构</b> —— 所以先想到<b>传销</b>。',
      '<b>第四步：戌土定性</b> —— <b>戌主宗教</b>，<b>戌又害酉金</b>（受害的是财）—— 所以从"传销"再进一步，断到"<b>邪教</b>"：<b>用宗教控制人</b>。',
      '<b>第五步：人贴到身上</b> ——「人元为己土，贵神为胸，将神为腹，地分为腿脚」—— <b>人元己土旺</b> → 头沉；<b>地分亥水休死</b>（被己土克）→ 腿脚无力；<b>从贵神往下几乎没力气</b> → 浑身乏力。',
      '<b>第六步：亥水取象</b> —— 亥主<b>惊恐、不明、爬行的东西</b>，又主<b>飘动</b>（像窗帘）—— 所以断"疑神疑鬼，老看到有影子的东西"。',
      '<b>这一课的化解也值得记</b>：讲者让他把"猴"（申）换成"<b>龙</b>"（辰）。理由有三：<b>辰是亥水的墓</b>（能收住亥水）；<b>辰酉合金</b>（生贵神）；<b>辰又冲戌</b>（冲开日时的侵害）。而猴（申）恰与他的本命猴叠加 ——「就是变着法来骗他」。',
      '---',
      '<b>课例三　属虎男子问合作工程能不能求财（第二讲）</b>',
      '<code>`</code>',
      '人元：壬　　水　（四大空亡）',
      '贵神：申　　金　（带天马）',
      '将神：寅　　木',
      '地分：寅　　木',
      '<code>`</code>',
      '<b>求测者</b>：属虎男子，以属相起课，地分为寅。问一个<b>填海工程</b>能不能合作求财。',
      '<b>断法拆解</b>：',
      '<b>一：两个寅木</b> —— 「两个乙木，就是说有合伙的兄弟，两个人合伙相做」。',
      '<b>二：将神寅木克人元壬水</b>？—— <b>不是</b>。这一课的要点在<b>人元壬水正逢四大空亡</b>：',
      '<b>水是什么？水是代表最上面的</b> —— 水生木，本该是上级拨款；<b>现在壬水空亡</b> ——「上面就是你这工程的上级，他不给你拨这一部分先期投资」—— <b>只有你自己垫</b>。',
      '<b>三：太岁</b> —— 「你遭的是谁的课？你遭的是太岁的课」—— <b>太岁申金冲将神寅木</b> —— 所以断"<b>别说赚钱，你得赔钱</b>"。',
      '<b>反馈完全对上</b>：工程很大、两个人财力有限；对方确实要求他先垫资、十年结一次账。',
      '<b>这一课的价值在于</b>：<b>四大空亡落在人元，断的是"上级不给钱"</b> —— 而不是简单地断"没钱"。',
      '---',
      '<b>课例四　91 年属羊女孩问婚姻（第四讲）· 四柱完整</b>',
      '<code>`</code>',
      '丙申年　辛卯月　甲辰日　辛未时',
      '日空：寅、卯　　四大空亡：无',
      '人元：辛　　金',
      '贵神：甲戌',
      '将神：甲戌',
      '地分：未　　土',
      '<code>`</code>',
      '<b>求测者</b>：1991 辛未年女孩，属羊 —— <b>以属相起课</b>，故地分为未。',
      '<b>先说这一课为什么值得细看</b>：<b>它是十讲里唯一一个四柱、四位都报全的课</b>，而且<b>每一项都能复算对上</b>：',
      '| 项目 | 录音报出 | 复核 |',
      '|---|---|---|',
      '| 日柱 | 甲辰日（原话"甲晨日"） | 甲辰属<b>甲辰旬</b> → 空<b>寅卯</b> ✓ 与后面"寅卯空"一致 |',
      '| 四大空亡 | 无 | 甲辰旬不属四大空亡那四旬 ✓ |',
      '| 时柱 | 辛未时 | 甲己日起甲子 → 子甲丑乙寅丙卯丁辰戊巳己午庚<b>未辛</b> ✓ |',
      '| 人元 | 辛金 | 日干甲、时支未 → 未位天干为<b>辛</b> ✓ |',
      '| 地分 | 未土 | 属相未 ✓ |',
      '<b>唯一需要留意的一处</b>：<b>贵神与将神都报作"甲戌"</b>。两神同干支在排盘里很少见，但<b>四柱、日空、人元三项都对得上</b>，所以照录不改，在此如实标明。',
      '<b>断法拆解</b>：',
      '<b>一看三土</b> ——「三土主迟缓、主晚」—— 所以先断<b>晚婚</b>。',
      '<b>二看刑</b> —— <b>未戌相刑</b>（课内戌在二神、未在地分）——「逢刑就是见刑法」—— <b>刑主二婚</b>：「二土逢一个未土的时候，这就容易出现二婚的情况」。',
      '<b>三看人元</b> —— <b>人元辛金</b>，一是<b>破木库</b>，二是<b>与酉金相害</b> —— 加进来一起看，<b>"带刑、带破、带害"</b> —— 所以断"容易出现二婚"。',
      '<b>这一课的启发</b>：<b>断婚姻的凶象，往往不是单一关系，而是"刑、破、害"叠起来看</b> —— 单见一个刑，多婚之象并不明显。',
      '---',
      '<b>课例四之二　同盘另起一课：姐姐（第四讲）</b>',
      '<b>同一个四柱，为求测者的姐姐另起一课</b> —— 姐姐 1989 己巳年生，<b>以属相巳为地分</b>。',
      '<code>`</code>',
      '丙申年　辛卯月　甲辰日　辛未时',
      '日空：寅、卯',
      '人元：己　　土',
      '贵神：戊辰',
      '将神：壬申',
      '地分：巳　　火',
      '<code>`</code>',
      '<b>复算核对</b>：甲辰日、地分巳 → 巳位天干为己（甲己日起甲子：子甲丑乙寅丙卯丁辰戊<b>巳己</b>）→ <b>人元己土</b> ✓ <b>自洽</b>。',
      '<b>断法拆解</b>：',
      '<b>一看用神受克</b> —— <b>用神壬申被地分巳火克</b> —— 但<b>巳申六合</b>，<b>贪合忘克</b> —— 所以<b>不是真克死</b>。',
      '<b>二看救应</b> —— <b>辰土保护申金</b>；<b>申子辰可成水局</b>（水局随时可灭巳火）—— 这三条合起来，<b>巳火其实伤不到申金</b>。这是"<b>用神被克要看有无救应</b>"的一个完整示范。',
      '<b>三看考试与专业</b> —— <b>申临太岁、带天马</b> —— 主<b>变动、走得远</b>；结合隔角、劫煞，断<b>专业有变化</b>。',
      '<b>四看婚姻</b> —— <b>2013 癸巳年结婚</b> —— 巳与课内申合，是应期所在。',
      '<b>反馈印证</b>：姐姐专升本、以前恋爱多耽误考学、考了不少证书、2013 年结婚、姐夫在环保局工作。',
      '<b>注意</b>：课中断的是"<b>政法警、城管一类</b>"，"环保局"是求测者反馈出来的 —— <b>课给的是大类，具体单位是现实落点</b>。',
      '---',
      '<b>课例五　63 年属兔男子问事业财运（第五讲）· 四柱完整</b>',
      '<code>`</code>',
      '丙申年　辛卯月　丙辰日　甲午时',
      '日空：子、丑',
      '人元：辛　　金',
      '贵神：壬辰',
      '将神：乙未',
      '地分：卯　　木',
      '<code>`</code>',
      '<b>求测者</b>：1963 癸卯年男子，属兔。',
      '<b>复算核对</b>：',
      '| 项目 | 录音报出 | 复核 |',
      '|---|---|---|',
      '| 日柱 | 丙辰日 | 丙辰属<b>甲寅旬</b> → 空<b>子丑</b> ✓ |',
      '| 时柱 | 甲午时 | 丙辛日起戊子 → 子戊丑己寅庚卯辛辰壬巳癸<b>午甲</b> ✓ |',
      '| 人元 | 辛金 | <b>地分卯位</b>的天干为辛 ✓（子戊丑己寅庚<b>卯辛</b>） |',
      '| 地分 | 卯木 | 属相卯 ✓ |',
      '<b>四项全部自洽</b> —— <b>这是十讲里最可靠的一个盘</b>。',
      '<b>断法拆解</b>：',
      '<b>一：断工作性质</b> —— <b>辰土为用、临贵神</b>，且贵神是<b>壬辰</b> ——「辰土为用，在贵神」—— 主<b>公务员、政法一类</b>；<b>日建又是辰土</b> ——「日建是辰土，所以大小有一点点官职」。',
      '<b>二：看与上级的关系</b> —— <b>官和相生</b> ——「一般情况下官和相生，就是与上级关系是不错的」；若是<b>暗合</b>，则是<b>私下的关系好</b>。',
      '<b>三：看下属</b> —— <b>下边合成墓局来克用神</b>，又逢<b>卯辰相害</b> —— 主<b>下属关系不好、暗中打小报告</b>。<b>卯主信息、报告、通讯</b> —— 取的就是这个象。',
      '<b>四：看财</b> —— <b>天干相生主财是外边送来的</b> —— <b>辛金生壬水、壬水生乙木</b> —— 主<b>娱乐、偏财、福利、不明收入</b>。',
      '<b>五：看住宅</b> —— <b>地分死、又被冲克挡住</b> → 房子不新、被挡；<b>木局主群体性</b> → 是<b>单位分的福利房</b>；<b>人元空亡</b> → <b>上面领导不作为、管理不到位</b>；<b>卯木主绿化，木局被克</b> → 绿化不好。',
      '<b>六：一条重要的应期原则</b> ——「<b>找课内每一个地支都有利、都向好的一面发展的那一年</b>」—— 这就是"吉年"的取法。',
      '---',
      '<b>课例六　82 年属狗男子问事业财运（第六讲）· 四柱部分完整</b>',
      '<code>`</code>',
      '壬辰月　甲子日　庚午时',
      '四大空亡：水（子水逢空）',
      '人元：甲　　木',
      '贵神：甲子　水',
      '将神：乙丑　土',
      '地分：戌　　土',
      '<code>`</code>',
      '<b>求测者</b>：1982 壬戌年男子，属狗 —— <b>以属相起课</b>，地分戌。',
      '<b>复算核对</b>：甲子日庚午时 → 甲己日起甲子 → 午位为<b>庚</b> ✓；<b>地分戌位的天干为甲</b>（申壬酉癸<b>戌甲</b>）→ <b>人元甲</b> ✓。年柱转写不清，不详。',
      '<b>断法拆解</b>：',
      '<b>一：甲子入课</b> ——「一般甲子入课，代表他是有威望的人、比较自大的人」（六十甲子第一，"瘦死的骆驼比马大"）。',
      '<b>二：水的类象</b> —— <b>水主计算、策划、设计、动脑子</b>，又主<b>软件、隐秘</b>；<b>水旺主流动、自由职业</b>。',
      '<b>三：合作之象</b> —— <b>子丑合</b>（贵神子与将神丑）→ 有合作行为；但<b>用神逢空、处休地</b> → <b>合作方意向不强烈</b>。',
      '<b>四：想走</b> —— <b>地分戌临天马</b> → 有想走的意向；<b>天马逢空</b> → <b>只是有想法、走不成</b>。',
      '<b>五：内部矛盾</b> —— <b>丑戌刑</b> → 内部意见不统一、有纠纷；<b>地分带天马</b> → 必定有人元流失、有人出走。',
      '<b>六：住宅</b> —— <b>地分空主租房、没有房产证</b>；<b>丑戌刑主破旧、凌乱、胡乱搭建</b> —— 反馈是租房住、28 层楼的 14 层。',
      '<b>七：得财只有两条路</b> ——「一个是财动，土克水；再一个就是火生土 —— <b>只有这两种方式，钱财才能到账</b>」。这一课<b>财动逢空、又合到月建外边去</b> → <b>财动失去效应、钱进不来</b>。',
      '<b>这一课的价值</b>：<b>它把"财动"讲透了</b> —— 财动不是见了就断得财，还要看它<b>空不空、合向哪里</b>。',
      '---',
      '<b>其余课例（四位已报出）</b>',
      '<b>这六个课例的四位是报全的</b>，只是四柱不全、或讲者没有展开全部推导。<b>列在这里供查阅。</b>',
      '| 讲次 | 求测背景 | 四　　位 | 说明 |',
      '|---|---|---|---|',
      '| 一 | 女性问事业财运与感情（2015 乙未年） | 人元<b>丙</b>／贵神<b>乙卯</b>（六合）／将神<b>午</b>（带天马）／地分<b>辰</b> | 用神乙卯；月建、日建都是乙木；课内有酉金逢空；<b>将神天干未报出</b> |',
      '| 二 | 1993 癸酉年男子测婚姻 | 人元<b>辛</b>／贵神<b>未</b>／将神<b>丁巳</b>／地分<b>酉</b> | <b>纯阴课</b>；除巳火外其余皆空 |',
      '| 三 | 属虎男子问合作工程 | 人元<b>壬</b>（四大空亡）／贵神<b>申</b>（带天马）／将神<b>寅</b>／地分<b>寅</b> | 已在"课例三"详解 |',
      '| 八 | 1986 属虎女子问婚姻财运 | 人元<b>丙</b>／贵神<b>巳</b>／将神<b>巳</b>／地分<b>寅</b> | 成寅午火局；地分休、将神巳火旺 |',
      '| 八 | 女博士问事业婚姻 | 人元<b>癸</b>／贵神<b>申</b>／将神<b>酉</b>／地分<b>未</b> | 今年太岁申、明年酉；地分旺 |',
      '| 十 | 87 属兔男子（冰淇淋厂） | 人元<b>丙</b>／贵神<b>庚午</b>／将神<b>辰</b>（逢空、死地）／地分<b>卯</b> | 太岁申，成申子辰水局；天乙入课 |',
      '---',
      '<b>附　只有部分线索的课例</b>',
      '<b>这些课例录音里只报了零星几位。列出背景与已报出的部分，缺口不补。</b>',
      '| 讲次 | 求测背景 | 已报出的 | 缺口 |',
      '|---|---|---|---|',
      '| 一 | QQ 网友求运势（奶奶九天后去世） | 地分<b>辛卯</b>；课内有<b>酉金临丧车</b>；有庚；两木两金；月建寅 | 人元、贵神、将神 |',
      '| 一 | 问家庭背景、家中是否有人做官 | 将神<b>丑</b>；地分<b>申</b>（带天马）；将神逢空又逢冲 | 人元、贵神 |',
      '| 三 | 女教师第二条：教两门学科 | 酉金生两个亥水；金空；月破 | 已含在上课例内 |',
      '| 七 | 未婚女子问疾病与婚姻 | 人元<b>丁</b>；用神<b>戌</b>（逢空、临天空、临天马）；地分<b>未</b>；课内有酉金带丧车；日建申、时辰午、月建辰 | <b>酉金与戌土在贵神还是将神，录音前后不一致</b> |',
      '| 九 | 1985 乙丑年男子问婚姻事业 | 地分<b>丑</b>；人元<b>己</b>；将神"鬼寺"（疑癸巳，不确定）；贵神"耿吟"（不详） | 贵神将神干支、月建、四柱年月柱 |',
      '| 九 | 1986 属虎男子种大棚 | 人元与地分同为木（甲木、寅木）；地分<b>寅</b>；贵神<b>巳</b>；将神<b>巳</b>；月建辰 | 四柱年月柱、日建、空亡、用神 |',
      '| 十 | 1987 属兔女性问工作 | 地分<b>卯</b>；将神<b>癸卯</b>；贵神<b>甲辰</b>；月建巳、日建亥、太岁申、时辰申 | 人元、四柱年月柱、空亡、用神 |',
      '<b>特别说明一处</b>：第七讲那个"未婚女子问疾病"的课，<b>录音里前后两处对酉金与戌土的落位说法不一致</b>（一处说戌在贵神，一处说贵神是酉金）。<b>这种矛盾不替他选</b>，如实标注。',
    ]},  ]
};

/* ══════ 金口诀 · 神煞（起例表按讲义原文，并逐条以课例校验） ══════
   按来源分五类：月令 / 季节 / 年支 / 日支 / 旬。
   再按四位落位：人元位只取天干神煞(shen10)，地分位只取地支神煞(shen12)，
   贵神/将神位干支皆取 —— 即界面上的 人煞 / 贵煞 / 将煞 / 地煞。
   入参: yue=月支索引, gzDay=日干支序(0-59), gan/zhi=四柱干支索引数组(1=年..4=时),
         kg/kz=四位(1人元 2贵神 3将神 4地分)的干/支索引 */
function jinkoujueShenSha(yue, gzDay, gan, zhi, kg, kz, yGan, mGan, dGan, hGan) {
  const s12 = new Array(12).fill(''), s10 = new Array(10).fill('');
  const add = (arr, i, name) => { if (i >= 0 && i < arr.length) arr[i] += ' ' + name; };
  let T;

  // ── 月令 ──
  // 天德(讲义 12 月表): 寅丁 卯申 辰壬 巳辛 午亥 未甲 申癸 酉寅 戌丙 亥乙 子巳 丑庚
  //   其中 丁壬辛甲癸丙乙庚 为天干型 → s10; 申亥寅巳 为地支型 → s12
  T = [-1,6,3,-1,8,7,-1,0,9,-1,2,1];    add(s10, T[yue], '天德');
  T = [5,-1,-1,8,-1,-1,11,-1,-1,2,-1,-1]; add(s12, T[yue], '天德');
  // 天德合: 干型天德取其天干五合, 支型天德取其地支六合
  T = [-1,1,8,-1,3,2,-1,5,4,-1,7,6];    add(s10, T[yue], '天德合');
  T = [8,-1,-1,5,-1,-1,2,-1,-1,11,-1,-1]; add(s12, T[yue], '天德合');
  // 月德合 = 月德之干五合: 壬→丁(3) 庚→乙(1) 丙→辛(7) 甲→己(5)
  T = [3,1,7,5,3,1,7,5,3,1,7,5];        add(s10, T[yue], '月德合');
  // 讲义实证(14/14): 寅午戌月丙(2) 亥卯未月甲(0) 申子辰月壬(8) 巳酉丑月庚(6)
  T = [8,6,2,0,8,6,2,0,8,6,2,0];        add(s10, T[yue], '月德');
  T = [11,5,8,11,3,6,9,7,4,7,10,1];     add(s12, T[yue], '往亡');
  // 讲义实证(8/8): 子寅 丑卯 寅戌 卯巳 辰午 巳未 午申 未酉 申辰 酉亥 戌子 亥丑
  T = [2,3,10,5,6,7,8,9,4,11,0,1];      add(s12, T[yue], '飞廉');
  add(s12, yue % 6, '生气');
  add(s12, yue % 6 + 6, '死气');
  add(s12, (yue + 11) % 12, '天医');   // 讲义实证: 月建退一位(7/7 课例)
  add(s12, (yue + 4) % 12, '地医');
  // 天马(讲义 L512): 「天马在月上起。正七午, 二八申, 三九戌, 四十子, 五十一寅, 六腊辰」
  //   即自寅月(正月)起算: 寅→午 卯→申 辰→戌 巳→子 午→寅 未→辰(七月再循环)
  T = [2,4,6,8,10,0,2,4,6,8,10,0];     add(s12, T[yue], '天马');
  T = [11,6,1,8,3,10,5,0,7,2,9,4];      add(s12, T[yue], '灭门');

  // ── 季节(以月支定) ──
  // ji4 的约定: 春(寅卯辰)=1 夏(巳午未)=2 秋(申酉戌)=3 冬(亥子丑)=0
  const ji4 = Math.floor(((zhi[2] + 1) % 12) / 3);
  // 讲义实证(8/8): 天喜 = 月建退四位(寅→戌 卯→亥 巳→丑 午→寅 申→辰 酉→巳 戌→午)
  add(s12, (yue + 8) % 12, '天喜');
  // 丧车: 春酉 夏子 秋卯 冬午 —— 下标序为 [冬,春,夏,秋], 即 [午,酉,子,卯]
  T = [6,9,0,3];   add(s12, T[ji4], '丧车');
  // 三丘: 春丑 夏辰 秋未 冬戌 —— [冬,春,夏,秋]=[戌,丑,辰,未]
  T = [10,1,4,7];  add(s12, T[ji4], '三丘');
  // 四墓: 春未 夏戌 秋丑 冬辰 —— [冬,春,夏,秋]=[辰,未,戌,丑]
  //   丘与墓互为六冲: 春之墓未、与未相冲的丑即春之丘。
  T = [4,7,10,1];  add(s12, T[ji4], '四墓');
  T = [0,9,6,3];   add(s12, T[ji4], '天鬼');

  // ── 年支 ──
  add(s12, (zhi[1] + 10) % 12, '吊客');   // 太岁后二辰(讲义原文);
  add(s12, (zhi[1] + 2) % 12, '丧门');   // 太岁前二辰(讲义原文);
  add(s12, (zhi[1] + 11) % 12, '病符');  // 太岁退一位(实证 6/6);
  add(s12, (16 - zhi[1]) % 12, '被头');
  // 禄倒(讲义歌诀「甲卯乙辰丙戊午, 丁巳未庚酉辛戌, 壬子癸丑是禄倒」, 取太岁年干为用)
  //   其中 丁、己 是「巳、未」两支(原先各只取一支, 会漏报):
  [[3],[4],[6],[7,5],[6],[7,5],[9],[10],[0],[1]][gan[1]]
    .forEach(i => add(s12, i, '禄倒'));
  T = [3,0,9,6,3,0,9,6,3,0,9,6];        add(s12, T[zhi[1]], '马倒');

  // ── 日支 ──
  T = [5,2,11,8,5,2,11,8,5,2,11,8];     // 劫煞: 申子辰日在巳
  add(s12, T[zhi[3]], '劫煞');
  add(s12, T[(zhi[3] + 5) % 12], '地煞');      // 劫煞前五辰
  add(s12, T[(zhi[3] + 6) % 12], '望门');
  add(s12, [2,11,8,5][zhi[3] % 4], '日马');
  add(s12, (zhi[3] + 1) % 12, '天罗');
  add(s12, (zhi[3] + 7) % 12, '地网');
  // 五鬼(讲义歌诀「甲己巳午癸未存, 乙庚寅卯守黄昏, 丙辛子丑来冲位, 丁壬戌亥墓临门, 戊癸忌占申酉位」)
  //   注意是「一组支」, 课内见其中任一支即算五鬼入课(原先只取单支, 会漏报):
  //   甲己→巳午未 / 乙庚→寅卯 / 丙辛→子丑 / 丁壬→戌亥 / 戊癸→申酉
  [[5,6,7],[2,3],[0,1],[10,11],[8,9],[5,6,7],[2,3],[0,1],[10,11],[8,9]][gan[3]]
    .forEach(i => add(s12, i, '五鬼'));
  // 截命灾煞(讲义歌诀「甲己申酉最为愁, 乙庚午未不宜求, 丙辛辰巳何劳问, 丁壬寅卯一场空, 戊癸子丑莫追求」)
  //   同样是「一组两支」, 课内见任一支即算(原先只取一支, 会漏报):
  //   甲己→申酉 / 乙庚→午未 / 丙辛→辰巳 / 丁壬→寅卯 / 戊癸→子丑
  [[8,9],[6,7],[4,5],[2,3],[0,1],[8,9],[6,7],[4,5],[2,3],[0,1]][gan[3]]
    .forEach(i => add(s12, i, '截命'));
  T = [9,7,5,3,1,9,7,5,3,1];
  add(s12, T[gan[3]] - 1, '截路'); add(s12, T[gan[3]], '截路');
  T = [5,6,3,2,1,6,7,8,9,10];           add(s12, T[gan[3]], '飞符');

  // ── 旬 ──
  const xun = Math.floor((gzDay % 60) / 10);
  const sk = [5,6,4,5,6,4][xun];
  if (sk === 5) { add(s12,11,'四空'); add(s12,0,'四空'); add(s10,9,'四空'); add(s10,8,'四空'); }
  if (sk === 4) { add(s12,8,'四空'); add(s12,9,'四空'); add(s10,6,'四空'); add(s10,7,'四空'); }
  T = [10,8,6,4,2,0];
  add(s12, T[xun], '旬空'); add(s12, T[xun] + 1, '旬空');

  // ── 按四位落位 ──
  // ══ 按讲义增补（讲义有明确起例）══
  const dgz = ((gzDay % 12) + 12) % 12;   // 日支索引(驿马等按日支起)
  // 驿马（第七课）: 申子辰马在寅 / 亥卯未马在巳 / 巳酉丑马在亥 / 寅午戌马在申
  T = [2,11,8,5,2,11,8,5,2,11,8,5];      add(s12, T[dgz], '驿马');
  // 桃花（第四课）: 申子辰见酉 / 亥卯未见子 / 巳酉丑见午 / 寅午戌见卯
  T = [9,6,3,0,9,6,3,0,9,6,3,0];         add(s12, T[dgz], '桃花');
  // 六害（第四课）: 子未 丑午 寅巳 卯辰 申亥 酉戌
  T = [7,6,5,4,3,2,1,0,11,10,9,8];       add(s12, T[dgz], '六害');
  // 相破（第四课）: 子破酉 午破卯 丑破辰
  // 六破齐全: 子酉 丑辰 寅亥 卯午 巳申 未戌(讲义 L1748 明列)
  T = [9,4,11,6,1,8,3,10,5,0,7,2];  if (T[dgz] >= 0) add(s12, T[dgz], '相破');
  // 四绝（第四课）: 寅酉金绝 / 卯申木绝 / 午亥水绝 / 子巳火绝
  // 双向齐全: 子巳 / 寅酉 / 卯申 / 午亥
  T = [5,-1,9,8,-1,0,-1,-1,3,2,-1,6];  if (T[dgz] >= 0) add(s12, T[dgz], '四绝');
  // 六冲
  add(s12, (dgz + 6) % 12, '六冲');
  // 六甲/六丁(讲义口径: 该位天干为甲即六甲、为丁即六丁, 与日柱无关)
  add(s10, 0, '六甲');
  add(s10, 3, '六丁');
  const shensh4 = ['', '', '', '', ''];
  shensh4[1] = s10[kg[1]] || '';
  shensh4[4] = s12[kz[4]] || '';
  for (let i = 2; i < 4; i++) {
    shensh4[i] = (s10[kg[i]] || '') + (s12[kz[i]] || '');
    // 天赦: 冬甲子日 / 春戊寅日 / 夏甲午日 / 秋戊申日(干+支同时合)
    if (kg[i] === [0,4,0,4][ji4] && kz[i] === [0,2,6,8][ji4]) shensh4[i] += ' 天赦';
  }
  if (kg[1] === [0,4,0,4][ji4] && kz[4] === [0,2,6,8][ji4]) shensh4[4] += ' 天赦';
  for (let i = 1; i <= 4; i++) shensh4[i] = shensh4[i].trim();

  const sish = sk === 5 ? '亥子壬癸' : sk === 4 ? '申酉庚辛' : '';

  // 六甲 / 六丁
  //   讲义口径是「该位天干为甲即六甲、为丁即六丁」, 与日柱无关 ——
  //   课例中 人元甲/贵神甲子/将神甲寅 均标六甲, 人元丁/贵神丁酉/将神丁丑 均标六丁,
  //   可见判定落在四位各自的【天干】上。故直接写进 s10(天干表)。

  // 三奇（第七课）: 天三奇甲戊庚 / 地三奇乙丙丁 / 人三奇壬癸辛
  //   以年、月、日、时四柱天干及人元、贵神干、将神干同看
  // 人元干用 QM.GAN[kg[1]] —— 原先误放形参 gan(整个天干索引数组), 永远匹配不上
  const gset = [yGan, mGan, dGan, hGan, QM.GAN[kg[1] % 10], QM.GAN[kg[2] % 10], QM.GAN[kg[3] % 10]];
  const has = g => gset.indexOf(g) >= 0;
  if (has('甲') && has('戊') && has('庚')) shensh4[1] = (shensh4[1] || '') + ' 天三奇';
  if (has('乙') && has('丙') && has('丁')) shensh4[1] = (shensh4[1] || '') + ' 地三奇';
  if (has('壬') && has('癸') && has('辛')) shensh4[1] = (shensh4[1] || '') + ' 人三奇';
  return { shen10: s10, shen12: s12, shensh4, sish };
}
window.jinkoujueShenSha = jinkoujueShenSha;

/* ══════ 金口诀 · 面板（仿主盘：宫格连体；点周围十二宫更新中宫） ══════ */
let _jkShow = false, _jkDifen = -1, _jkDayNight = 0, _jkJiang = 1;   // 默认交节(月建六合)
let _jkGuiren = 1;   // 贵人求法: 1=甲戊庚牛羊(传统) 2=甲羊戊庚牛
let _jkNum = 0;      // 先起法用的报数(0=未输入)
let _jkJiangZhi = -1;   // 自定义月将: -1=按换将方式自动, >=0=手工指定地支
let _jkDfType = 1;   // 地分取法: 1=下拉 2=报数 3=随机
let _jkRand = -1;    // 随机到的地分
function _jkDifenType() { return _jkDfType; }
function _jkOpts() {
  return { year: window.Y, month: window.M, day: window.D, hour: window.hr, minute: window.mn,
           difen: _jkDifen >= 0 ? _jkDifen : null, dayNight: _jkDayNight, jiang: _jkJiang, jiangZhi: _jkJiangZhi,
           guiren: _jkGuiren, difenType: _jkDifenType && _jkDifenType() };
}
function _jkSet(opt) {
  if (opt.difen !== undefined) _jkDifen = opt.difen;
  if (opt.dayNight !== undefined) _jkDayNight = opt.dayNight;
  if (opt.jiang !== undefined) _jkJiang = opt.jiang;
  if (opt.guiren !== undefined) _jkGuiren = opt.guiren;
  if (opt.jiangZhi !== undefined) _jkJiangZhi = opt.jiangZhi;
  if (opt.difenType !== undefined) {
    _jkDfType = opt.difenType;
    // 报数: 只是把下拉切换成 1~12 的数字表示, 选的仍是同一地支, 无需额外换算
  }
  toggleJinKouJue(true);
}

/* 中宫：只列四位本体（五动三动与神煞在下方信息区）
   用表格对齐 —— flex 固定列宽在字段空缺时会错位 */
function _jkCenter(chart) {
  const c = chart.cur;
  const WXO = QM.WX_OF || {};
  const wxSpan = window._wxSpan || (x => x);
  const wxCls = ch => WXO[ch] ? 'wx-' + WXO[ch] : '';
  const shenSpan = (name, zhiIdx) => {
    const k = WXO[name.charAt(0)] || WXO[QM.ZHI[zhiIdx]];
    return k ? '<span class="wx-' + k + '">' + name + '</span>' : name;
  };
  const useMark = n => chart.yongwei === n
    ? '<b style="color:var(--wx-huo)">用</b>' : '';
  const wsc = { '旺':'var(--wx-huo)', '相':'var(--wx-mu)', '休':'var(--c-text-3)', '囚':'var(--c-text-3)', '死':'var(--c-text-4)' };
  const kong2 = (chart.kong4 && chart.kong4[2]) || '';
  const kongMark = z => (z && kong2.indexOf(z) >= 0)
    ? '<b class="wx-' + (WXO[z] || 'tu') + '">空</b>' : '';
  const sishStr = (chart.shensha && chart.shensha.sish) || '';
  const sishMarks = gz => {
    if (!sishStr || !gz) return [];
    let g = '', z = '';
    for (let i = 0; i < gz.length; i++) {
      const ch = gz.charAt(i);
      if (sishStr.indexOf(ch) < 0 || !WXO[ch]) continue;
      if (QM.GAN.indexOf(ch) >= 0) g = WXO[ch];
      else if (QM.ZHI.indexOf(ch) >= 0) z = WXO[ch];
    }
    const out = [];
    if (g) out.push('<b class="wx-' + g + '">四空·干</b>');
    if (z) out.push('<b class="wx-' + z + '">四空·支</b>');
    return out;
  };
  // 弹性行: 标签 / 干支 / 旺衰 / 标记组(可自动换行), 窄屏不溢出
  const row = (k, a, ws, marks) => {
    const ms = marks.filter(Boolean);
    // 各列固定宽度 —— 点击 12 宫切换内容时, 四位/干支/旺衰的横向位置不跟着漂移。
    // 标记区 nowrap + 略小字号: 避免"四空·干"换行撑高行距, 各行间距才均匀。
    // 干支右对齐(末字对齐)。列宽须略大于两字、且与旺衰之间留足间隙,
    // 否则双字干支会与旺衰贴在一起(看起来像"丁酉旺"连成一串)
    // 列宽用百分比(不用 em/px) —— em 在部分 Android WebView 的 flex-basis 上算错,
    // 会导致中宫挤成一团; 百分比在所有环境一致, 且天然随格子宽度缩放
    return '<div style="display:flex;align-items:baseline;gap:3%;box-sizing:border-box;padding:0.15em 0">' +
      '<span style="flex:0 0 24%;font-weight:bold;text-align:right">' + k + '</span>' +
      '<span style="flex:0 0 22%;text-align:right">' + a + '</span>' +
      '<span style="flex:0 0 12%;color:' + (wsc[ws] || 'var(--c-text-3)') + '">' + ws + '</span>' +
      // 标记(空/用/四空…)强制单行 —— 不允许换行, 标记之间只留很窄的间隔
      (ms.length ? '<span style="flex:0 0 auto;display:inline-flex;gap:0 0.12em;' +
        'white-space:nowrap;overflow:hidden">' + ms.join('') + '</span>' : '') +
      '</div>';
  };
  // 外层 flex 负责把整个中宫块在 2x2 格内居中; 内层列容器让各行左边缘对齐(行内左起)
  // 外层纵向居中; 内层占满整格宽度, 行内各列用固定宽度定位 —— 位置稳定不漂移
  // 上下居中, 不留下方空白
  return '<div style="height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden">' +
    '<div style="width:100%;display:flex;flex-direction:column;gap:0;padding:2px;' +
    'font-size:var(--jk-fs,13px);line-height:1.35;box-sizing:border-box">' +
    row('<span class="' + wxCls(c.renYuan) + '">人元</span>',
        '<span class="' + wxCls(c.renYuan) + '">' + c.renYuan + '</span>', c.renWs,
        [kongMark(c.renYuan)].concat(sishMarks(c.renYuan))) +
    row(shenSpan(c.guiShen, QM.ZHI.indexOf(c.guiGanZhi[1])), wxSpan(c.guiGanZhi), c.guiWs,
        [useMark(2), kongMark(c.guiGanZhi[1])].concat(sishMarks(c.guiGanZhi))) +
    row(shenSpan(c.jiangShen, c.jiangZhiIdx), wxSpan(c.jiangGanZhi), c.jiangWs,
        [useMark(3), kongMark(c.jiangGanZhi[1])].concat(sishMarks(c.jiangGanZhi))) +
    row('<span class="' + wxCls(c.difenZhi) + '">地分</span>',
        '<span class="' + wxCls(c.difenZhi) + '">' + c.difenZhi + '</span>', c.difenWs,
        [kongMark(c.difenZhi)].concat(sishMarks(c.difenZhi))) +
    // 横杠分隔, 下方接五动三动
    '<div style="border-top:1px solid var(--c-border);margin:2px 0"></div>' +
    row('<span style="font-weight:bold;color:var(--c-text)">五动</span>',
        '<span style="white-space:nowrap">' + ((chart.wudong && chart.wudong.length) ? chart.wudong.join(' ') : '—') + '</span>', '', []) +
    row('<span style="font-weight:bold;color:var(--c-text)">三动</span>',
        '<span style="white-space:nowrap">' + ((chart.sandong && chart.sandong.length) ? chart.sandong.join(' ') : '—') + '</span>', '', []) +
    '</div></div>';
}

/* 点周围十二宫 → 更新中宫（局部刷新，不重排整盘、不丢滚动位置） */
function _jkPick(idx) {
  try {
    _jkDifen = idx;
    const chart = jinkoujueChart(_jkOpts());
    if (!chart) return;
    const ctr = document.getElementById('jkCenter');
    if (ctr) ctr.innerHTML = _jkCenter(chart);
    const info = document.getElementById('jkInfo');
    // 起法区也在 #jkInfo 内, 必须一并重绘 —— 否则点十二宫后起法区会被冲掉
    if (info) info.innerHTML = _jkInfoHtml(chart) + _jkAdvHtml(_jkOpts(), chart) + _jkAdvNumHtml(_jkOpts());
    // 先清掉全部高亮, 再标记当前宫 —— 用 class 而非 inline style,
    // 避免切换后宫位残留底色与内容叠在一起
    document.querySelectorAll('#jinkoujueDIV [data-jk]').forEach(el => el.classList.remove('jk-sel'));
    const selEl = document.querySelector('#jinkoujueDIV [data-jk="' + idx + '"]');
    if (selEl) selEl.classList.add('jk-sel');
    const sel = document.getElementById('jkDifen');
    if (sel) sel.value = String(idx);
  } catch (e) { _logErr('jkPick', e && e.message); }
}
window._jkPick = _jkPick;

/* 下方信息区：四大空亡 / 人煞 贵煞 将煞 地煞 / 五动 三动 */
function _jkInfoHtml(chart) {
  const ss = chart.shensha || {};
  // 标签只两字(人煞/贵煞/将煞/地煞), 列宽收到 36px 即可 —— 原先 66px 让值与标签隔得太远
  const line = (label, val) => '<div style="display:flex;gap:6px;padding:2px 0;font-size:13px;line-height:1.75">' +
    '<span style="flex:0 0 36px;color:var(--c-theme);font-weight:bold">' + label + '</span>' +
    '<span style="flex:1;text-align:left;word-break:break-all">' + (val || '—') + '</span></div>';
  // 四大空亡已在信息栏显示, 此处不再重复
  return line('人煞', ss.shensh4 && ss.shensh4[1]) +
    line('贵煞', ss.shensh4 && ss.shensh4[2]) +
    line('将煞', ss.shensh4 && ss.shensh4[3]) +
    line('地煞', ss.shensh4 && ss.shensh4[4]);
}

function toggleJinKouJue(noScroll) {
  if (_xnLongPressed) { _xnLongPressed = false; return; }   // 长按已弹说明, 不再切换
  let div = document.getElementById('jinkoujueDIV');
  if (!div) {
    div = document.createElement('div');
    div.id = 'jinkoujueDIV';
    div.style.cssText = 'margin-top:12px';
    const result = document.getElementById('result');
    if (result) result.appendChild(div);
  }
  if (!noScroll && div.style.display === 'block') {
    div.style.display = 'none'; div.innerHTML = ''; _jkShow = false; _syncToggleBtns(); return;
  }
  _jkShow = true; _syncToggleBtns(); _jkFitFont();
  try {
    const chart = jinkoujueChart(_jkOpts());
    if (!chart) throw new Error('起课失败');
    const wx = { 水:'wx-shui', 木:'wx-mu', 火:'wx-huo', 土:'wx-tu', 金:'wx-jin' };
    const col = n => wx[JK_WX_NAME[n]] || '';
    const wsc = { '旺':'var(--wx-huo)', '相':'var(--wx-mu)', '休':'var(--c-text-3)', '囚':'var(--c-text-3)', '死':'var(--c-text-4)' };
    const wxSpan = window._wxSpan || (x => x);          // 干支逐字五行色
    const WXO = QM.WX_OF || {};
    const shenSpan = (name, zhiIdx) => {                // 神名五行色, 月将名回退其支
      const k = WXO[name.charAt(0)] || WXO[QM.ZHI[zhiIdx]];
      return k ? '<span class="wx-' + k + '">' + name + '</span>' : name;
    };
    const curIdx = chart.cur.difenIdx;

    // 单宫: 只列 干支 / 旺衰 / 用 —— 不显神名(贵神将神名删去)。
    // 四行的干支同处一列, 旺衰同处一列, 与中宫的排法一致
    const one = (h) => {
      const isCur = h.difenIdx === curIdx;
      const u = n => h.yongwei === n ? '<span style="color:var(--wx-huo);font-weight:bold">用</span>' : '';
      // 干支右对齐 —— 单字与双字末字对齐(人元的"癸"与贵神的"卯"同尾)
      // 行高按字号自适应(格子随网格收窄后, 写死 23px 会竖溢)
      // 列宽留出"用"标记的位置: 52% + 20% 之后余下约 28% 给标记, 不再挤爆
      const line = (a, ws, mk) => '<div style="display:flex;align-items:baseline;white-space:nowrap;height:1.42em;gap:3px">' +
        '<span style="flex:0 0 52%;overflow:hidden;text-align:right">' + a + '</span>' +
        '<span style="flex:0 0 20%;color:' + (wsc[ws] || 'var(--c-text-3)') + '">' + ws + '</span>' +
        '<span style="flex:0 0 auto">' + (mk || '') + '</span></div>';
      return '<div data-jk="' + h.difenIdx + '" onclick="_jkPick(' + h.difenIdx + ')"' +
        ' class="jk-cell' + (isCur ? ' jk-sel' : '') + '"' +
        ' style="cursor:pointer;box-sizing:border-box;padding:3px 2px 2px;font-size:var(--jk-cf,11px);line-height:1.25;overflow:hidden;' +
        'border-right:1px solid var(--c-border);border-bottom:1px solid var(--c-border)">' +
        line('<span class="' + col(h.renWx) + '">' + h.renYuan + '</span>', h.renWs, '') +
        line(wxSpan(h.guiGanZhi), h.guiWs, u(2)) +
        line(wxSpan(h.jiangGanZhi), h.jiangWs, u(3)) +
        line('<span class="' + col(JK_ZHI_WX[h.difenIdx]) + '">' + h.difenZhi + '</span>', h.difenWs, '') +
        '</div>';
    };
    // 十二宫按地支方位：上南下北·左东右西
    const order = [5,6,7,8, 4,-1,9, 3,-2,10, 2,1,0,11];
    const byIdx = {}; chart.houses.forEach(h => { byIdx[h.difenIdx] = h; });
    let cells = '';
    for (const k of order) {
      if (k < 0) {
        // -1 生成中宫(跨 2x2); -2 只是占位标记, 不生成元素
        // —— 早先两个负值都进了这个分支, 页面上出现两个 #jkCenter 叠在一起
        if (k === -1) {
          cells += '<div id="jkCenter" style="grid-row:2/4;grid-column:2/4;overflow:hidden;' +
            'border-right:1px solid var(--c-border);border-bottom:1px solid var(--c-border)">' + _jkCenter(chart) + '</div>';
        }
      } else { cells += one(byIdx[k]); }
    }
    // ── 辅助：原生选项控件(同顶栏) / 表格单元格 / 下拉样式 / 信息栏 ──
    const optStyle = 'margin:0 0 0 2px;width:12px;height:12px;flex:none;accent-color:var(--c-theme);vertical-align:middle';
    const labStyle = 'display:inline-flex;align-items:center;gap:1px;font-size:inherit;color:var(--c-text);cursor:pointer;white-space:nowrap';
    const selStyle = 'margin-left:6px;border:1px solid var(--c-border);border-radius:6px;padding:2px 4px;font-size:inherit;color:var(--c-text);' +
      'background:var(--c-bg);outline:none;text-align:center;text-align-last:center;-webkit-appearance:none;appearance:none;cursor:pointer;min-width:44px';
    const radio = (on, txt, click, name) =>
      '<label style="' + labStyle + '"><input type="radio" name="' + (name || 'jkr') + '"' + (on ? ' checked' : '') +
      ' onchange="' + click + '" style="' + optStyle + '">' + txt + '</label>';
    const checkbox = (on, txt, click) =>
      '<label style="' + labStyle + '"><input type="checkbox"' + (on ? ' checked' : '') +
      ' onchange="' + click + '" style="' + optStyle + '">' + txt + '</label>';
    const tdL = (t, span, rowspan) => '<td' + (span ? ' colspan="' + span + '"' : '') + (rowspan ? ' rowspan="' + rowspan + '"' : '') +
      ' style="border:1px solid var(--c-border);padding:4px 6px;color:var(--c-gold);text-align:center;white-space:nowrap;width:46px">' + t + '</td>';
    const tdV = (t, span, align) => '<td' + (span ? ' colspan="' + span + '"' : '') + ' style="border:1px solid var(--c-border);padding:4px 6px;' +
      'text-align:' + (align || 'center') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + t + '</td>';
    // 输入区单元格: 外框由 table 提供, 行间只留横向分隔线; 标签与控件左对齐紧贴
    const tdLh = (t, last) => '<td style="' + (last ? '' : 'border-bottom:1px solid var(--c-border);') +
      'padding:7px 2px 7px 8px;color:var(--c-gold);text-align:left;white-space:nowrap;width:38px">' + t + '</td>';
    const tdVh = (t, span, last, align) => '<td' + (span ? ' colspan="' + span + '"' : '') + ' style="' +
      (last ? '' : 'border-bottom:1px solid var(--c-border);') +
      'padding:7px 8px 7px 2px;text-align:' + (align || 'left') + ';white-space:nowrap;overflow:hidden">' + t + '</td>';
    const sp = window._wxSpan || (x => x);
    const jiangLabel = chart.yueJiang + (_jkJiangZhi >= 0 ? '(自定义)' : (_jkJiang === 1 ? '(交节)' : '(中气)'));
    const dfLabel = chart.cur.difenZhi + (_jkDfType === 2 ? '(报数)' : '(手动)');
    const infoTbl = '<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:14px;margin:2px 0">' +
      '<tr>' + tdL('日期') + tdV(chart.dateFull || '', 4) + '</tr>' +
      '<tr>' + tdL('节气') + tdV(chart.termStr || '', 4) + '</tr>' +
      '<tr>' + tdL('四柱', 0, 2) + tdV('年柱') + tdV('月柱') + tdV('日柱') + tdV('时柱') + '</tr>' +
      '<tr>' + (chart.siZhu || []).map(g => tdV(sp(g[0]) + sp(g[1]))).join('') + '</tr>' +
      '<tr>' + tdL('空亡') + (chart.kong4 || []).map(k => tdV(sp(k))).join('') + '</tr>' +
      '<tr>' + tdL('日空') + tdV(sp(chart.kong4 ? chart.kong4[2] : '')) +
              tdL('四大空亡') + tdV((chart.shensha && chart.shensha.sish ? sp(chart.shensha.sish) : '无') + (chart.shensha && chart.shensha.sish ? '　四空' : ''), 2) + '</tr>' +
      '</table>';

    // ── 输入区：与信息栏同一套表格样式 ──
    const tdIn = t => '<td style="border:1px solid var(--c-border);padding:4px 6px;text-align:center;white-space:nowrap">' + t + '</td>';
    const dfSel = '<select id="jkDifen" onchange="_jkSet({difen:parseInt(this.value,10)})" style="' + selStyle + '">' +
      QM.ZHI.map(function(z,i){ return '<option value="' + i + '"' + (i === curIdx ? ' selected' : '') + '>' +
        (_jkDfType === 2 ? (i + 1) : z) + '</option>'; }).join('') + '</select>';
    const jzSel = '<select id="jkJiangZhi" onchange="_jkSet({jiangZhi:parseInt(this.value,10)})" style="' + selStyle + '">' +
      QM.ZHI.map(function(z,i){ var cur = (_jkJiangZhi >= 0) ? _jkJiangZhi : chart.yueJiangIdx;
        return '<option value="' + i + '"' + (i === cur ? ' selected' : '') + '>' + z + '</option>'; }).join('') + '</select>';
    // 两行: 首行三组用表格列; 次行两组改用 flex 均分, 使标签与选项紧贴(表格列做不到)
    // 贵人求法两套口诀只在【甲日】有别(甲日昼贵丑/未互换), 其余日干完全相同 —— 不说明会很费解
    const isJiaDay = (chart.siZhu[2] || '').charAt(0) === '甲';
    const grHint = isJiaDay ? '甲日·两法互换' : '本日' + (chart.siZhu[2] || '').charAt(0) + '·两法同';
    const inLab = t => '<span style="color:var(--c-gold);white-space:nowrap;margin-right:4px">' + t + '</span>';
    // 输入区: 流式布局 —— 每组是独立小块, 浏览器按可用宽度自动排列换行,
    // 组内标签与控件紧贴, 组间均留统一间距, 窄屏自然折行而不裁切
    const grp = (label, body) => '<span style="display:inline-flex;align-items:center;gap:4px;' +
      'white-space:nowrap">' + (label ? inLab(label) : '') + body + '</span>';
    const inputArea = '<div style="display:flex;flex-wrap:wrap;align-items:center;' +
      'gap:8px 18px;padding:9px 10px;margin:8px 0 2px;' +
      'border:1px solid var(--c-border);border-radius:6px;' +
      'font-size:var(--jk-if,12px)">' +
        grp('地分', dfSel + checkbox(_jkDfType === 2, '报数', '_jkSet({difenType:' + (_jkDfType === 2 ? 1 : 2) + '})')) +
        grp('月将', jzSel) +
        grp('换将', radio(_jkJiang === 1, '交节', '_jkSet({jiang:1})', 'jkj') + radio(_jkJiang === 0, '中气', '_jkSet({jiang:0})', 'jkj')) +
        grp('贵神', radio(_jkDayNight === 0, '卯酉区分', '_jkSet({dayNight:0})', 'jkdn') +
                   radio(_jkDayNight === 1, '白天', '_jkSet({dayNight:1})', 'jkdn') +
                   radio(_jkDayNight === 2, '夜晚', '_jkSet({dayNight:2})', 'jkdn')) +
        grp('贵人', radio(_jkGuiren === 1, '甲戊庚牛羊', '_jkSet({guiren:1})', 'jkgr') +
                   radio(_jkGuiren === 2, '甲羊戊庚牛', '_jkSet({guiren:2})', 'jkgr') +
                   '<span style="font-size:0.9em;color:var(--c-text-4)">' + grHint + '</span>') +
      '</div>';
    // 连体宫格：容器只补左上两条边，格子各带右下两条边
    div.innerHTML = infoTbl + inputArea +
      // 外圈(第1/4列行)收窄, 中间(第2/3列行)放宽 —— 十二宫变小, 中宫随之变大
      // min-height 按字号给足 —— 否则窄屏下网格被压扁, 十二宫四行放不下
      '<div style="display:grid;gap:0;' +
      'grid-template-columns:0.82fr 1.18fr 1.18fr 0.82fr;' +
      'grid-template-rows:repeat(4,minmax(calc(var(--jk-cf,11px) * 6.4),auto));' +
      'border-top:1px solid var(--c-border);border-left:1px solid var(--c-border)">' + cells + '</div>' +
      '<div id="jkInfo" style="margin-top:7px;border:1px solid var(--c-border);border-radius:4px;padding:8px 10px">' +
      _jkInfoHtml(chart) +
      _jkAdvHtml(_jkOpts(), chart) +
      _jkAdvNumHtml(_jkOpts()) +
      '</div>';
    div.style.display = 'block';
    if (!noScroll) setTimeout(() => { const r = document.getElementById('jinkoujueDIV'); if (r) r.scrollIntoView({ behavior:'smooth', block:'start' }); }, 120);
  } catch (e) {
    div.innerHTML = '<div style="color:red;padding:8px">金口诀错误: ' + (e && e.message) + '</div>';
    div.style.display = 'block';
  }
}
window.toggleJinKouJue = toggleJinKouJue;
/* 报数输入: 只重绘起法区, 避免整盘重排导致输入框失焦 */
function _jkSetNum(v) {
  const n = parseInt(v, 10);
  _jkNum = (isNaN(n) || n < 1) ? 0 : n;
  const el = document.getElementById('jkAdvNum');
  if (el) {
    try { el.innerHTML = _jkAdvNumHtml(_jkOpts()); } catch (e) { _logErr('jkSetNum', e && e.message); }
    const inp = document.getElementById('jkNumInp');
    if (inp) { inp.focus(); try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e2) {} }
  }
}
window._jkSetNum = _jkSetNum;
window._jkSet = _jkSet;

function toggleDiBaShen() {
  _diShenShow = !_diShenShow;
  paintDiBaShen(_diShenShow);
  const b = document.getElementById('btnDiShen');
  if (b) b.classList.toggle('on', _diShenShow);
}

function paintRenBaShen(show) {
  for (let g = 1; g <= 9; g++) {
    const el = document.getElementById('rshen' + g);
    if (el) el.textContent = (show && _renShenMap && _renShenMap[g]) ? _renShenMap[g] : '';
  }
}

function toggleRenBaShen() {
  _renShenShow = !_renShenShow;
  paintRenBaShen(_renShenShow);
  const b = document.getElementById('btnRenShen');
  if (b) b.classList.toggle('on', _renShenShow);
}
window.toggleDiBaShen = toggleDiBaShen;
window.buildDiBaShenMap = buildDiBaShenMap;   // 导出便于单独验证排法
window.buildRenBaShenMap = buildRenBaShenMap;
window.toggleRenBaShen = toggleRenBaShen;

// ============ 颜色标记 + 阴干对齐 ============
/* 阴干对齐依赖宫内的行高, 而行高受字体影响: 中文首屏字体加载较慢, 原先只在
   10/50ms 各跑一次, 很可能跑在字体就绪之前 —— 按 fallback 字体算出的 paddingTop
   就偏了, 表现为侧边阴干与宫内那一行错开。这里补上字体就绪、更晚的延时点
   以及窗口尺寸变化(手机地址栏伸缩也算)时的重算; 函数本身幂等, 多跑几次无妨。 */
let _ygaBound = false;
function scheduleYinGanAlign() {
  setTimeout(fixYinGanAlign, 10);
  setTimeout(fixYinGanAlign, 50);
  setTimeout(fixYinGanAlign, 300);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => fixYinGanAlign()).catch(() => {});
  }
  if (!_ygaBound) {
    _ygaBound = true;
    window.addEventListener('resize', () => fixYinGanAlign(), { passive: true });
  }
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
    if (needJsSquare()) [4,9,2,3,7,8,1,6].forEach(g => {
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
    /* 侧边阴干的纵向基准(已确认): 巽4 震3 艮8 对【天盘干】, 坤2 兑7 乾6 对【九星】;
       坎1 离9 不参与对齐(它们分处上下, 各有 HTML 内联的 padding 定位)。
       做法是量出基准元素的 top 与宫顶之差写进 paddingTop —— 依赖行高,
       所以必须等字体就绪后重算, 见 scheduleYinGanAlign。 */
    [4,3,8].forEach(g => {
      let yin = scope.querySelector('#yinGan'+g);
      let tian = scope.querySelector('#tian'+g);
      let gong = scope.querySelector('#gong'+g);
      if (!yin || !tian || !gong) return;
      let go = gong.getBoundingClientRect().top;
      yin.style.paddingTop = Math.max(0, tian.getBoundingClientRect().top - go) + 'px';
      if (isMain) { yin.style.textAlign = 'right'; yin.style.verticalAlign = 'top'; yin.style.fontSize = '15px'; yin.style.lineHeight = '25px'; yin.style.color = 'var(--c-text)'; }
    });
    [2,7,6].forEach(g => {
      let yin = scope.querySelector('#yinGan'+g);
      let xing = scope.querySelector('#xing'+g);
      let gong = scope.querySelector('#gong'+g);
      if (!yin || !xing || !gong) return;
      let go = gong.getBoundingClientRect().top;
      yin.style.paddingTop = Math.max(0, xing.getBoundingClientRect().top - go) + 'px';
      if (isMain) { yin.style.textAlign = 'left'; yin.style.verticalAlign = 'top'; yin.style.fontSize = '15px'; yin.style.lineHeight = '25px'; yin.style.color = 'var(--c-text)'; }
    });
    if (isMain) {
      let y9 = scope.querySelector('#yinGan9'), y1 = scope.querySelector('#yinGan1');
      if (y9) { y9.style.verticalAlign = 'bottom'; y9.style.fontSize = '15px'; y9.style.color = 'var(--c-text)'; }
      if (y1) { y1.style.verticalAlign = 'top'; y1.style.fontSize = '15px'; y1.style.color = 'var(--c-text)'; }
    }
  });
}


// ============ 底部按钮功能 ============

// === 移星换斗 ===
let ZHUAN_ORDER = [1,8,3,4,9,2,7,6];

function applyZhuan(palaces) {
  let old = {};
  for(let g = 1; g <= 9; g++) { old['gong'+g] = {}; let s = palaces['gong'+g]||{}; for(let k in s) old['gong'+g][k] = s[k]; }
  let n = ZHUAN_ORDER.length, last = ZHUAN_ORDER[n-1];
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
  let menKeGong = {'休':[9], '生':[1], '伤':[2,8], '杜':[2,8], '景':[7,6], '死':[1], '惊':[3,4], '开':[3,4]};

  function getMenShort(men) {
    if (!men) return '';
    let s = (window._MEN_ABBR && window._MEN_ABBR[men]) || '';
    if (s) return s;
    if (menKeGong[men]) return men;
    return '';
  }
  for(let g = 1; g <= 9; g++) {
    let p = palaces['gong'+g]; if (!p) continue;
    p.isTianXing = false; p.isTianMu = false; p.isDiXing = false; p.isDiMu = false; p.isMenPo = false;
    p.isTianXing1 = false; p.isTianMu1 = false; p.isTianXing2 = false; p.isTianMu2 = false;
    p.isDiXing1 = false; p.isDiMu1 = false; p.isDiXing2 = false; p.isDiMu2 = false;
    let menShort2 = getMenShort(p.men);
    if (menShort2 && menKeGong[menShort2] && menKeGong[menShort2].indexOf(g) >= 0) p.isMenPo = true;
    if (!p.tian) continue;
    for(let ti = 0; ti < p.tian.length; ti++) {
      let tg = p.tian[ti];
      let isM = MU_RULES[g] && MU_RULES[g].indexOf(tg) >= 0;
      let isX = XING_RULES[g] && XING_RULES[g].indexOf(tg) >= 0;
      let isXM = XM_RULES[g] && XM_RULES[g].indexOf(tg) >= 0;
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
        let isM = MU_RULES[g] && MU_RULES[g].indexOf(dg) >= 0;
        let isX = XING_RULES[g] && XING_RULES[g].indexOf(dg) >= 0;
        let isXM = XM_RULES[g] && XM_RULES[g].indexOf(dg) >= 0;
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
/* CSS 的 aspect-ratio 已保证宫位正方; 仅在旧环境才需 JS 量宽回写 */
function needJsSquare(){ return !(window.CSS && CSS.supports && CSS.supports('aspect-ratio','1 / 1')); }

/* 宫位改用「长按」弹出宫位解释的盘型: 时盘(1) / 刻盘(2) / 山向(4) / 命理(6)。
   四者**共用同一套**长按→解释逻辑(见 _bindGridLongPress 与 showPalace), 不各写一份。
   心盘(3) 不在此列 —— 它的宫位**短按**是"打开宫位编辑器"(showXinpanEditor),
   **长按**是"先后天三宫标记"(toggleXianhouMark); 两者不冲突, 因为长按成立后那次
   click 会被委托在捕获阶段拦掉。
   穿壬(5) 本来就没有宫位解释。
   目的: 避免移动端误触 —— 轻点与滑动不再弹窗, 按住 550ms 才触发。 */
const LONG_PRESS_PAN_TYPES = [1, 2, 4, 6];

/* 宫位**短按**(click)行为 —— 与长按(_bindGridLongPress)对称, 集中定义在一处,
   免得"没反应"看起来像漏绑。各盘型分工:
     · 心盘(3)              → 打开宫位编辑器
     · 时盘(1)/刻盘(2)/命理(6) → **标记该宫的先后天三宫**(三宫通气可视化)
     · 山向(4)/穿壬(5)      → 无短按行为
   注意: 长按成立后那次 click 会被 _bindGridLongPress 在捕获阶段拦掉, 所以长按不会
   顶替短按 —— 两套机制互不干扰。 */
const SHORT_PRESS_RESERVED = [1, 2, 6];

/* ── 先后天三宫标记(时/刻/命理 短按触发) ─────────────────────────────
   对应关系由"同方位上后天卦↔先天卦互换"推出, 与教材《阴盘奇门遁甲》的对应表
   逐条一致(坎先坤后兑 / 艮先震后乾 / 震先离后艮 / 巽先兑后坤 / 离先乾后震 /
   坤先巽后坎 / 兑先坎后巽 / 乾先艮后离)。中宫(5)不参与。
   语义: 先天=体, 论来源为过去/前因, 论显现为未来(因未显现); 后天=用, 反之。
   短按某宫 → 本宫 + 先天宫 + 后天宫 三宫同时高亮, 即"三宫通气"。 */
const XIANTIAN_GONG = {1:2, 2:4, 3:9, 4:7, 6:8, 7:1, 8:3, 9:6};
const HOUTIAN_GONG  = {1:7, 2:1, 3:8, 4:2, 6:9, 7:4, 8:6, 9:3};
const GONG_GUA = {1:'坎', 2:'坤', 3:'震', 4:'巽', 6:'乾', 7:'兑', 8:'艮', 9:'离'};
let _xhBase = 0;   // 当前标记的本宫号, 0=未标记

/* 主盘宫格定位: 副盘(移星换斗的旋转盘、向角度选局的盘)复用同一批 gong id 且渲染在
   #yixinghuandouDIV 内, 必须排除, 否则会标到副盘上。 */
function _findMainGong(g) {
  const list = document.querySelectorAll('#gong' + g);
  for (let i = 0; i < list.length; i++) {
    if (!list[i].closest('#yixinghuandouDIV')) return list[i];
  }
  return null;
}

function _clearXianhouMark() {
  document.querySelectorAll('.xh-base,.xh-xian,.xh-hou').forEach(function (el) {
    el.classList.remove('xh-base', 'xh-xian', 'xh-hou');
  });
  document.querySelectorAll('.xh-badge').forEach(function (b) {
    if (b.parentNode) b.parentNode.removeChild(b);
  });
  const bar = document.getElementById('xhBar');
  if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
}

/* 三宫通气说明卡: 不只标位置, 还把三宫各自的卦意/五行/盘面符号与"该怎么读"讲出来,
   对初学者友好。放在盘面之上, 跟着每次短按更新。 */
function _showXhBar(g) {
  const x = XIANTIAN_GONG[g], h = HOUTIAN_GONG[g];
  const P = window._palaces || {};
  // 卦意详解太长(三宫全贴会刷屏), 只取第一句
  const firstLine = function (t) {
    if (!t) return '';
    const m = String(t).split(/[。；]/)[0];
    return m ? m + '。' : '';
  };
  // 该宫盘面上的符号(神/星/门/暗干), 用简称
  const symsOf = function (gg) {
    const p = P['gong' + gg];
    if (!p) return '';
    const a = [];
    if (p.shen) a.push((window.SHEN_ABBR || {})[p.shen] || p.shen);
    if (p.xing) a.push((window.XING_ABBR || {})[p.xing] || p.xing);
    if (p.men)  a.push((window.MEN_ABBR  || {})[p.men]  || p.men);
    if (p.anGan) a.push('暗干' + p.anGan);
    return a.join(' · ');
  };
  const row = function (gg, cls, tag, role) {
    const gi = GONG_INFO[gg] || {};
    const s = symsOf(gg);
    return '<div class="xh-row ' + cls + '-row">'
      + '<span class="xh-tag ' + cls + '-b">' + tag + '</span>'
      + '<b>' + gg + '宫 ' + (gi.name || GONG_GUA[gg] || '') + '</b>'
      + '<span class="xh-wx">' + (gi.wx || '') + '</span>'
      + (s ? '<div class="xh-syms">盘面：' + s + '</div>' : '')
      + '<div class="xh-key">' + (gi.key || '') + '</div>'
      + '<div class="xh-desc2">' + firstLine(gi.desc) + ' <span class="xh-role">' + role + '</span></div>'
      + '</div>';
  };
  let html = '<div class="xh-title">三宫通气 · 本宫 ' + g + '宫'
    + (GONG_GUA[g] || '') + (GONG_INFO[g] && GONG_INFO[g].wx ? '（' + GONG_INFO[g].wx + '）' : '') + '</div>';
  html += row(g, 'xh-base', '本宫', '— 当前状态，用神落宫之象');
  html += row(x, 'xh-xian', '先天', '— 过去 · 前因：根源、原生家庭（体）');
  html += row(h, 'xh-hou',  '后天', '— 未来 · 后果：趋势、将显现之果（用）');
  const kong = window._kongGongs || {};
  if (kong[g]) {
    html += '<div class="xh-warn">⚠ 本宫空亡：约 80% 的信息已转移至先天宫 <b>' + x + '宫'
      + (GONG_GUA[x] || '') + '</b>，应重点看该宫（别只盯本宫或对宫）</div>';
  } else if (kong[x]) {
    html += '<div class="xh-warn">提示：先天宫 ' + x + '宫' + (GONG_GUA[x] || '')
      + ' 逢空亡 —— 根源层信息被抽空，可再翻一层或参其对宫</div>';
  }
  html += '<div class="xh-tip"><b>读法</b>：三宫合参（三生万物）—— 现世看本宫、前因看先天宫、'
    + '后果看后天宫。<b>先天为体</b>（论来源＝过去之因），<b>后天为用</b>（论显现＝未来之果）；'
    + '伏吟局信息少时，可继续连翻先天/后天宫取信息。</div>';
  const bar = document.createElement('div');
  bar.id = 'xhBar';
  bar.innerHTML = html;
  // 位置: 宫位(盘面)**下方** —— 插在 #panWrap 之后而不是之前
  const wrap = document.getElementById('panWrap');
  if (wrap && wrap.parentNode) wrap.parentNode.insertBefore(bar, wrap.nextSibling);
}

function toggleXianhouMark(g) {
  g = parseInt(g, 10);
  if (!g || g === 5) return;                    // 中宫不参与
  // 重排盘/切盘型后 DOM 会重建(旧标记随之消失), 故"是否已标记"以 DOM 为准, 不能只看变量
  const same = (_xhBase === g) && !!document.querySelector('.xh-base');
  _clearXianhouMark();
  if (same) { _xhBase = 0; return; }             // 再按同一宫 → 取消
  _xhBase = g;
  const put = function (gong, cls, label) {
    const el = _findMainGong(gong);
    if (!el) return;
    el.classList.add(cls);
    el.style.position = 'relative';              // 角标的定位基准(td 默认 static)
    const badge = document.createElement('span');
    badge.className = 'xh-badge ' + cls + '-b';
    badge.textContent = label;
    el.appendChild(badge);
  };
  put(g, 'xh-base', '本');
  if (XIANTIAN_GONG[g]) put(XIANTIAN_GONG[g], 'xh-xian', '先');
  if (HOUTIAN_GONG[g])  put(HOUTIAN_GONG[g],  'xh-hou',  '后');
  _showXhBar(g);
}

function onGongShortPress(g) {
  const pt = parseInt(panType, 10);
  if (pt === 3) { showPalace(g); return; }             // 心盘 → showPalace 内部路由到编辑器
  if (SHORT_PRESS_RESERVED.indexOf(pt) >= 0) {
    toggleXianhouMark(g);                              // 时/刻/命理 → 标记先后天三宫
    return;
  }
  // 山向(4)/穿壬(5): 无短按行为
}
window.onGongShortPress = onGongShortPress;            // 内联 onclick 需要全局可见
/* panType 存在字符串来源(存档/会话), 判定前统一 parseInt */
const isLongPressPanType = function (t) { return LONG_PRESS_PAN_TYPES.indexOf(parseInt(t, 10)) >= 0; };

function buildPaipanGrid(palaces, kongGongs, maPosId, agColorFn, opts) {
  opts = opts || {};
  let colorSpan = opts.colorSpan || (v => {return v||'';});
  let xpEditGong = opts.xpEditGong || 0;
  let wrapperClass = opts.wrapperClass || '';
  let panClass = opts.panClass || '';
  let wrapperOpen = wrapperClass ? '<div class="'+wrapperClass+'">' : '<div id="content">';
  let panOpen = panClass ? '<TABLE id="pan" class="'+panClass+'">' : '<TABLE id="pan">';
  let ytLeft = wrapperClass ? ' class="yinTable"' : '';
  let ytRight = wrapperClass ? ' class="yinTable right"' : '';
  let mkTag = '<span class="cx-horse" style="font-size:18px">马</span>';

  function renderPalace(g) {
    let p = palaces['gong'+g];
    if (!p) return '<TD></TD>';
    let w = (g === 9 || g === 1) ? '34%' : '33%';
    let shenAbbr = (window.SHEN_ABBR||{})[p.shen] || p.shen || '';
    let xingAbbr = (window.XING_ABBR||{})[p.xing] || p.xing || '';
    let menAbbr = (window.MEN_ABBR||{})[p.men] || p.men || '';
    let kongMark = kongGongs[g] ? '○' : '';
    function spanGan(ch) { let isM=MU_RULES[g]&&MU_RULES[g].indexOf(ch)>=0; let isX=XING_RULES[g]&&XING_RULES[g].indexOf(ch)>=0; let isXM=XM_RULES[g]&&XM_RULES[g].indexOf(ch)>=0; return window._siHaiSpan(ch, isX||isXM, isM||isXM); }
    function charColor(str) { if(!str)return''; let r=''; for(let ci=0;ci<str.length;ci++)r+=spanGan(str[ci]); return r; }
    let hlt = (xpEditGong === g) ? 'box-shadow:0 0 0 2px var(--c-theme) inset;' : '';
    // noClick: 副盘(移星换斗的 7 个旋转盘、向角度选局的 13 个盘)不挂宫位点击 ——
    // 它们复用同一份宫位 id, 点击会被 showPalace 按"主盘"的数据解释(心盘模式下
    // 更会打开主盘宫位的编辑器并写回 _xpData)。原先靠在渲染后逐个清 onclick,
    // 漏一处就出错, 改为生成时就不挂。
    // 短按统一走 onGongShortPress —— 它按盘型分发(心盘→编辑器, 时/刻/命理→显式留白),
    // 这样"没反应"是刻意设计而非漏绑。长按另由 _bindGridLongPress 的委托处理,
    // 且长按成立后那次 click 会被它在捕获阶段拦掉, 两套机制互不干扰。
    let noInlineClick = opts.noClick;
    return '<TD style="width:'+w+';'+hlt+'" id="gong'+g+'"'+(noInlineClick?'':' onclick="onGongShortPress('+g+')"')+'>' +
      '<div class="pan-cell" style="display:grid;grid-template-rows:1fr 1fr 1fr;position:relative">' +
      '<div class="panItem top mid-row" style="align-self:start"><span id="shen'+g+'">'+colorSpan(shenAbbr)+'</span>'+(opts.diShen?'<span class="w4shen" id="w4'+g+'"></span>':'')+'<span id="kong'+KONG_ID[g]+'">'+kongMark+'</span></div>' +
      '<div class="panItem mid-row" style="align-self:center"><span id="tian'+g+'">'+charColor(p.tian)+'</span>'+(opts.diShen?'<span class="rshen" id="rshen'+g+'"></span>':'')+'<span id="xing'+g+'">'+colorSpan(xingAbbr)+'</span></div>' +
      '<div class="panItem mid-row" style="align-self:end"><span id="di'+g+'">'+charColor(p.di)+'</span>'+(opts.diShen?'<span class="dshen" id="dshen'+g+'"></span>':'')+'<span id="men'+g+'">'+colorSpan(menAbbr,false,false,p.isMenPo)+'</span></div>' +
      '<div class="state" id="stateTian'+g+'" style="position:absolute;top:25%;left:1px;font-size:10px;color:var(--c-text-3)"></div>' +
      '<div class="state" id="stateDi'+g+'" style="position:absolute;bottom:26%;left:1px;font-size:10px;color:var(--c-text-3)"></div>' +
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
  let kongGongs = {};
  let maGong = 0;
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
  let maPosId = MA_POS[maGong] || '';
  // 当前编辑宫位高亮
  window._xpEditGong = window._xpEditGong || 0;

  let colorSpan = window._colorSpan || (v => {return v||'';});


  let mkTag = '<span class="cx-horse" style="font-size:18px">马</span>';
  let sizhuParts = _xpBgSizhu ? _xpBgSizhu.split(/\s+/) : [];
  let sizhuHTML = '';
  for(let si = 0; si < 4; si++) { let gz = sizhuParts[si] || '—'; sizhuHTML += '<TD class="sizhu">'+(gz.length>=2?gz[0]+'<br>'+gz[1]:gz)+'</TD>'; }
  let wxSpanBg = window._wxSpan;
  let sizhuColorHTML = '';
  for(let si2 = 0; si2 < 4; si2++) { let gz2 = sizhuParts[si2] || '——'; sizhuColorHTML += '<TD class="sizhu">'+wxSpanBg(gz2[0]||'')+'<br>'+wxSpanBg(gz2[1]||'')+'</TD>'; }
  let dStr = Y+'-'+String(M).padStart(2,'0')+'-'+String(D).padStart(2,'0');
  let nongliStr = _xpBgNongli || '';

  // 暗干颜色函数
  let agColor = g => {
    let ag = palaces['gong'+g] ? palaces['gong'+g].anGan : '';
    return ag ? (window._anGanColor|| (v => {return v||'';}))(ag, g) : '';
  };
  // 自动计算值符和值使门
  let G2STAR_ORIG = {1:'蓬',2:'芮',3:'冲',4:'辅',6:'心',7:'柱',8:'任',9:'英'};
  let G2MEN_ORIG  = {1:'休',2:'死',3:'伤',4:'杜',6:'开',7:'惊',8:'生',9:'景'};
  let zhiFuVal = '—', zhiShiVal = '—';
  [1,2,3,4,6,7,8,9].forEach(g => {
    let p = palaces['gong'+g];
    if (p && p.shen && SHEN_ABBR[p.shen] === '符') {
      zhiFuVal = '天' + (G2STAR_ORIG[g] || '') + '星';
      zhiShiVal = (G2MEN_ORIG[g] || '') + '门';
    }
  });
  let gridHTML = buildPaipanGrid(palaces, kongGongs, maPosId, agColor, {colorSpan: window._colorSpan, xpEditGong: window._xpEditGong||0});
  let html =
    '<div id="panHead"><TABLE class="pan" id="headTable">' +
    '<TR><TD id="itemTitle" style="border:none">心盘</TD><TD colspan="4" style="line-height:30px;border:none">点击宫位编辑符号</TD></TR>' +
    '<TR><TD id="dTitle">日期</TD><TD colspan="4">'+dStr+(nongliStr?' ('+nongliStr+')':'')+'</TD></TR>' +
    '<TR><TD>局数</TD><TD colspan="4">'+(_xpCalcJu||_xpBgJu||'心盘')+'</TD></TR>' +
    '<TR id="tdTitle"><TD>旬首</TD><TD>值符</TD><TD>值使</TD><TD>马星</TD><TD>空亡</TD></TR>' +
    '<TR><TD>' + (_xpBgXunShou?wxSpanBg(_xpBgXunShou):'—') + '</TD><TD>' + zhiFuVal + '</TD><TD>' + zhiShiVal + '</TD><TD>' + (_xpBgMaXing?wxSpanBg(_xpBgMaXing):(maGong?'马[宫'+maGong+']':'—')) + '</TD><TD>' + (_xpBgKongWang?wxSpanBg(_xpBgKongWang):'—') + '</TD></TR>' +
    '<TR><TD rowspan=2 style="color:var(--c-gold)">四柱</TD>' +
    '<TD class="sizhuTitle">年柱</TD><TD class="sizhuTitle">月柱</TD><TD class="sizhuTitle">日柱</TD><TD class="sizhuTitle">时柱</TD></TR>' +
    '<TR>' + (sizhuParts.length>=4 ? sizhuColorHTML : sizhuHTML) + '</TR>' +
    '</TABLE></div>' +
    gridHTML +
    '<div id="Tip">颜色说明：<span class="cx-mu">入墓</span>、<span class="cx-xing">击刑</span>、<span class="cx-po">门迫</span>、<span class="cx-xingmu">刑+墓</span></div>' +
    '<TABLE id="btnTable1"><TR>' +
    '<TD><div class="btn" id="btn1" onclick="showYixing()">移星换斗</div></TD>' +
    '<TD><div class="btn" id="btn3" onclick="tianmenDihu()">天门地户</div></TD>' +
    '<TD><div class="btn" id="btn2" onclick="showState()">长生状态</div></TD>' +
    '</TR></TABLE>' +
    // 心盘只在"长生状态"右边加一个金口诀按钮(地八神/人八神/玄女16诀是时盘专用, 不加)
    '<TABLE id="btnTable3"><TR>' +
    '<TD><div class="btn" id="btnJinKou" onclick="toggleJinKouJue()">金口诀</div></TD>' +
    '</TR></TABLE>' +
    '<div id="yixinghuandouDIV"></div>';

  document.getElementById('panWrap').innerHTML = html;
  document.getElementById('result').style.display = 'block';
  tip.innerHTML = '';
  _renderBottomBar();
  _bindActionButtons();
  setTimeout(_bindActionButtons, 50);
  scheduleYinGanAlign();
  } catch(e){ _logErr('renderXinpan', e && e.message); }
}

function showYixing() {
  let div = document.getElementById('yixinghuandouDIV');
  if (!div) return;
  if (div.style.display === 'block') { div.style.display = 'none'; div.innerHTML = ''; _syncToggleBtns(); return; }
  let firstShow = div.style.display !== 'block';
  if (!window._palaces) return;

  let cur = {};
  for(let g = 1; g <= 9; g++) { cur['gong'+g] = {}; let s = window._palaces['gong'+g]||{}; for(let k in s) cur['gong'+g][k] = s[k]; }

  let ag = g => cur['gong'+g] ? cur['gong'+g].anGan || '' : '';
  let cs = window._colorSpan || (v => {return v||'';});
  let sab = window._SHEN_ABBR || {}; let xab = window._XING_ABBR || {}; let mab = window._MEN_ABBR || {};
  let kg = window._kongGongs || {};
  let maPosId = window._maPosId || '';

  let spanYx = (ch, g) => {
    let isM = MU_RULES[g] && MU_RULES[g].indexOf(ch) >= 0;
    let isX = XING_RULES[g] && XING_RULES[g].indexOf(ch) >= 0;
    let isXM = XM_RULES[g] && XM_RULES[g].indexOf(ch) >= 0;
    return window._siHaiSpan(ch, isX || isXM, isM || isXM);
  };
  let yxColor = (str, g) => {
    if (!str) return '';
    let r = ''; for(let ci = 0; ci < str.length; ci++) r += spanYx(str[ci], g);
    return r;
  };

  let html = '';
  for(let t = 1; t <= 7; t++) {
    applyZhuan(cur);
    // 构建与主盘一致的palaces对象
    let rotPalaces = {};
    [4,9,2,3,7,8,1,6].forEach(g => {
      let p = cur['gong'+g];
      rotPalaces['gong'+g] = {
        shen: p.shen||'', tian: p.tian||'', di: p.di||'', xing: p.xing||'', men: p.men||'',
        anGan: p.anGan||'', kong: kg[g]||false, ma: false,
        tx: p.isTianXing||false, tm: p.isTianMu||false,
        dx: p.isDiXing||false, dm: p.isDiMu||false, mp: p.isMenPo||false
      };
    });
    let yxAgFn = g => { let a=cur['gong'+g]?cur['gong'+g].anGan||'':''; return a?(window._anGanColor|| (v => {return v||'';}))(a,g):''; };
    let gridHTML = buildPaipanGrid(rotPalaces, kg, maPosId, yxAgFn, {colorSpan:cs, noClick:true});
    html += '<div class="tableTitle"><B>【顺转'+t+'宫】</B></div>' + gridHTML;
  }
  div.style.display = 'block';
  _syncToggleBtns();
   div.innerHTML = html;
   if(firstShow) setTimeout(() => { let top=0,el=div; while(el){top+=el.offsetTop;el=el.offsetParent;} window.scrollTo({top:top-60,behavior:'smooth'}); }, 20);
   // 延迟对齐暗干，多次尝试确保渲染完成
  function alignYX() {
	    let contents = div.querySelectorAll('#content');
	    for(let ti = 0; ti < contents.length; ti++) {
	      let ct = contents[ti];
	      // 宫格正方形
	      if (needJsSquare()) [4,9,2,3,7,8,1,6].forEach(g => {
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
let _qrData = null; // 缓存doPan最近一次qimenChart结构化结果(天门地户直接复用, 避免二次排盘)

function tianmenDihu() {
  try{
  if (_shenShow) { _shenShow = 0; clearWaipan(); }
  if (_xnShow) { _xnShow = false; clearWaipan(); }   // 与玄女十六字诀互斥(同一批外盘位)
  _tmdhShow = !_tmdhShow;
  _syncToggleBtns();
  if (!window._palaces) return;

  // 天门地户: 月将+建除均基于时支, 将月将加在时支之上顺排
  let JIANCHU = ['建','除','满','平','定','执','破','危','成','收','开','闭'];
  let ZHI2WP = {'子':1,'丑':2,'寅':3,'卯':4,'辰':5,'巳':6,'午':7,'未':8,'申':9,'酉':10,'戌':11,'亥':12};
  let YUEJIANG_FULL = {'子':'神后子','丑':'大吉丑','寅':'功曹寅','卯':'太冲卯','辰':'天罡辰','巳':'太乙巳','午':'胜光午','未':'小吉未','申':'传送申','酉':'从魁酉','戌':'河魁戌','亥':'登明亥'};
  let ZHI12 = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

  let raw = window._raw || '';
  let qd = _qrData; // 引擎结构化缓存(doPan一次调用, 优先使用)

  // 获取时支 (优先引擎结构化, 其次window._sizhuObj, 最后正则回退)
  let shiZhi = '子';
  if (qd && qd.sizhu && qd.sizhu.h) {
    shiZhi = qd.sizhu.h.ganZhi[1];
  } else if (window._sizhuObj && window._sizhuObj.h) {
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
      let fullName, jc;
      if (qd && qd.tianmen && qd.dihu) {
        // 引擎已无条件算好各宫月将/建除, 直接取结构化数据
        fullName = qd.tianmen[wp-1] || '';
        jc = qd.dihu[wp-1] || '';
      } else {
        // 旧正则回退: 月将顺排(时支位起月将, 顺时针)
        let offsetMJ = (wp - shiWp + 12) % 12;
        let zhiIdx = (mjIdx + offsetMJ) % 12;
        let zhiAtPos = ZHI12[zhiIdx];
        fullName = YUEJIANG_FULL[zhiAtPos] || zhiAtPos;
        // 建除: 时支起建, 顺时针
        jc = JIANCHU[offsetMJ];
      }
      if (wpVertical[wp]) {
        el2.innerHTML = fullName.split('').join('<br>')+'<br><span class="cx-theme">'+jc+'</span>';
      } else {
        el2.innerHTML = fullName+'<span class="cx-theme">'+jc+'</span>';
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

/* ══════════════════ 金口诀（大金口） ══════════════════
   把六壬的四课三传压成"四位"：人元（日干遁干）、贵神、将神、地分。
   这里的做法是十二个地分全部起课，外围十二宫，
   中宫列四位本体（当前地分那一课）。

   起例（已用实盘反推核对）：
     月将  按【中气】过宫：节气序 0=冬至，中气序 = floor(序/2)，月将 = 六合[中气序]
     将神  月将加时 —— 从时支起月将，顺数到地分
     贵神  日干起贵人（昼贵/夜贵），贵人落地盘亥子丑寅卯辰者顺行、巳午未申酉戌者逆行，
           从贵人起十二贵神数到地分
     人元  五子元遁：日干 → 该日干"子时"的天干，顺数到地分
     干支  将神、贵神所乘的天干，同样走五子元遁（与其地支相配）
     旺衰  按当令五行判旺相休囚死 */
const JK_GUISHEN = ['贵人','腾蛇','朱雀','六合','勾陈','青龙','天空','白虎','太常','玄武','太阴','天后'];
/* 十二贵神本位支(丑巳午卯辰寅戌申未子酉亥)。起课得的是"贵人顺逆数至地分"的神名,
   而各神另有固定本位 —— 盘面显示本位干支, 与乘支是两回事。 */
const JK_GR_ZHI = [1,5,6,3,4,2,10,8,7,0,9,11];
const JK_JIANG   = ['神后','大吉','功曹','太冲','天罡','太乙','胜光','小吉','传送','从魁','河魁','登明'];
const JK_WX_NAME = { 1:'水', 2:'木', 3:'火', 4:'土', 5:'金' };
const JK_ZHI_WX  = [1,4,2,2,4,3,3,4,5,5,4,1];   // 子丑寅卯辰巳午未申酉戌亥 → 水土木木土火火土金金土水

/* ══ 旺衰（课内定，非按月令）══
   讲义：「课内定旺衰。有克先找克，克者为旺，不以四柱为主」，
        「判断旺衰必须以课内五行生克为主，与四柱没有关系」。
   算法照讲义所载 wangshui() 规则：
     五行编号 1水 2木 3火 4土 5金（相生为序）
     1) 某五行在四位中出现 3 次 → 直接为旺
     2) 否则取「我克者不存在」的五行作候选；一个候选即为旺，
        两个候选时优先「生我者存在」的，其次「我克者存在」的
     3) 其余三位按相生序依次为 相 休 囚 死
   入参 cnt = 五行计数数组（下标 1..5）。返回旺的五行编号。 */
function _jkWangWx(cnt) {
  // 讲义(提高班 L1473): 「课内定旺衰不按照课外时令而定, 只按照课内五行生克关系。
  //   不受克者为旺; 课内同类多者为旺; 旺克者为死, 旺生者为相, 生旺者为休, 克旺者为囚。」
  // 两步并用的正确读法:
  //   ① 先取「不受克」(克我者不在课内)的五行作为候选;
  //   ② 候选多于一个时, 取课内出现次数最多者(课例一 木3火1 同为不受克, 讲义判木旺);
  //   ③ 次数也相同则取候选中最靠前者。
  // (注: 「同类多者为旺」不能提前于「不受克」使用 —— 课例9/10 土占两位却为休/死即是反证)
  const cand = [];
  for (let w = 1; w < 6; w++) {
    if (cnt[w] === 0) continue;
    let keWo = 0;                                  // 克我者的出现次数
    for (let k = 1; k < 6; k++) if (cnt[k] > 0 && _jkKe(k, w)) keWo += cnt[k];
    if (keWo === 0) cand.push(w);
  }
  if (!cand.length) {                              // 理论不达(四位凑不出相克闭环): 退化为最多者
    let best = 1, bn = -1;
    for (let w = 1; w < 6; w++) if (cnt[w] > bn) { bn = cnt[w]; best = w; }
    return best;
  }
  /* 讲义「定旺衰」四法（《心法秘指》原文）:
       A 不受克者为旺 —— 戊土克子水, 子水克巳火, 戊土没有受克, 所以戊土为旺
       B 克他爻者为旺 —— 土克水, 土不受克, 所以己土、辰土为旺
       C 受生者为旺   —— 没有克只有生, 土被火生, 所以土旺 (丁火/丑土/午火/丑土)
       D 多者为旺     —— 一个午火三个土, 多者为旺; 三金一水「虽然受生者旺,
                          但金多浊, 还是以金旺论」
     归纳: 候选=不受克者 → 取多者 → 仍并列则取【受生者】(即 C 法)。
     原先并列时取 cand[0](最靠前者), 会把 C 法课例 丁/丑/午/丑 误判为火旺(应土旺)。*/
  const maxN = Math.max(...cand.map(w => cnt[w]));
  const top = cand.filter(w => cnt[w] === maxN);
  if (top.length === 1) return top[0];
  // 并列时依讲义四法的次序:
  //   B 克他爻者为旺 —— 乙木/戌土/未土/巳火: 木火同为不受克且各一, 讲义判木旺
  //     (木克土), 而不是受生的火。
  for (const w of top) for (let k = 1; k < 6; k++) if (cnt[k] > 0 && _jkKe(w, k)) return w;
  //   都不克他爻, 才是 C 受生者为旺 —— 丁火/丑土/午火/丑土: 火土各二、互不相克,
  //     讲义判土旺(土被火生)。
  for (const w of top) for (const o of top) if (o !== w && _jkSheng(o, w)) return w;
  return top[0];
}

/* 五行生克：a 是否克 b */
function _jkKe(a, b) { return (a === 2 && b === 4) || (a === 4 && b === 1) || (a === 1 && b === 3) || (a === 3 && b === 5) || (a === 5 && b === 2); }
function _jkSheng(a, b) { return (a === 2 && b === 3) || (a === 3 && b === 4) || (a === 4 && b === 5) || (a === 5 && b === 1) || (a === 1 && b === 2); }

/* 五子元遁：日干索引 → 子时所起天干 */
const JK_DUN = [0, 2, 4, 6, 8];
function _jkDun(dGanIdx, zhiIdx) { return (JK_DUN[dGanIdx % 5] + zhiIdx) % 10; }

/* 排一课。opt = {year,month,day,hour,minute, dayNight:0自动/1昼/2夜, jiang:0中气(标准)/1交节} */
/* 用位(用爻)：讲义第四课用神歌 ——
    课体纯阳神为用 / 课体纯阴将为用 / 三阳一阴阴为用 /
    三阴一阳阳上取 / 二阴二阳将为用
   且「用神只在贵神将神之间选取」；独阴或独阳若落在人元、地分，
   则回退（纯阳与三阳一阴取贵神，纯阴与二阴二阳取将神）。
   入参 kz4 = [0, 人元化支, 贵神支, 将神支, 地分支]，返回 2(贵神) 或 3(将神)。 */
function _jkYongwei(kz4) {
  let yyshu = 0, yinPos = 0, yangPos = 0;
  for (let i = 1; i < 5; i++) {
    if (kz4[i] % 2 === 0) { yyshu++; yangPos = i; } else { yinPos = i; }
  }
  if (yyshu === 4) return 2;                          // 纯阳 → 神为用
  if (yyshu === 3) return (yinPos === 2) ? 2 : 3;     // 三阳一阴 → 阴为用
  if (yyshu === 1) return (yangPos === 2) ? 2 : 3;    // 三阴一阳 → 阳上取
  return 3;                                           // 纯阴、二阴二阳 → 将为用
}
window._jkYongwei = _jkYongwei;

/* ══════ 高级起课法 · 遁法（讲义 L949-956）══════
   讲义原文：「金口诀遁法其实是课内信息量的增加问题……有人元再遁法、日干再遁法、时干再遁法等」

   统一规律(经讲义 4 个例子验算): 以【该柱自己的天干】起五子元遁, 反查某个目标天干
   落在十二支的哪一位。十天干配十二支必有两位重复, 讲义两例分别取先见(庚→子)与
   后见(癸→亥), 口径不一; 这里按"取先见"实现, 并同时给出全部落支供核对。

   ① 干合遁    —— 遁到【本干】      例: 癸卯 → 丑  (断环境物象)
   ② 遁到干合处 —— 遁到【干之合】    例: 癸卯 → 午
   ③ 遁走失方位 —— 遁到【将干之合】  例: 庚   → 酉
   ④ 遁工作方位 —— 遁到【贵神本干】  例: 戊申 → 午
   ⑤ 遁人元    —— 日干再遁到原地分, 取该支天干(地分不变) 例: 课例8 壬 → 戊
*/
const JK_GAN_HE = [5,6,7,8,9,0,1,2,3,4];   // 天干五合: 甲己 乙庚 丙辛 丁壬 戊癸
/* 以天干 gi 起五子元遁, 找出 targetGan 所落之支; 返回 {first, all} */
function _jkDunLocate(gi, targetGan) {
  const t = QM.GAN.indexOf(targetGan);
  const all = [];
  if (t < 0) return { first: -1, all };
  for (let z = 0; z < 12; z++) if ((JK_DUN[gi % 5] + z) % 10 === t) all.push(z);
  return { first: all.length ? all[0] : -1, all };
}
/* 五种遁法一次算全; 入参为四位的干支字符 */
function jinkoujueDun(opt) {
  const ch = jinkoujueChart(opt);
  if (!ch) return null;
  const cur = ch.cur;
  const dGanIdx = QM.GAN.indexOf(ch.siZhu[2].charAt(0));            // 日干
  const gGan = cur.guiGanZhi.charAt(0), jGan = cur.jiangGanZhi.charAt(0);
  const he = g => QM.GAN[JK_GAN_HE[QM.GAN.indexOf(g)]];
  const one = (gi, target) => { const r = _jkDunLocate(QM.GAN.indexOf(gi), target);
    return { zhi: r.first >= 0 ? QM.ZHI[r.first] : '', all: r.all.map(i => QM.ZHI[i]) }; };
  const out = {
    siZhu: ch.siZhu, renYuan: cur.renYuan, guiGanZhi: cur.guiGanZhi,
    jiangGanZhi: cur.jiangGanZhi, difenZhi: cur.difenZhi,
    ganHe: {}, dunRenYuan: {}
  };
  // 起点: 讲义原文「如用爻或贵神是癸卯」—— 用爻位与贵神位都可作起点, 故两套并列给出。
  //   用爻在贵神时两者相同。
  const useGan = (ch.yongwei === 2) ? gGan : jGan;      // 用爻所在位的天干
  const useName = (ch.yongwei === 2) ? '用爻(贵神)' : '用爻(将神)';
  // ① 干合遁: 遁到【本干】所在之支  ——  讲义例 癸卯 → 丑
  out.ganHe['干合遁·用爻'] = Object.assign({ from: useGan, fromName: useName, target: useGan }, one(useGan, useGan));
  out.ganHe['干合遁·贵神'] = Object.assign({ from: gGan, fromName: '贵神', target: gGan }, one(gGan, gGan));
  // ② 遁到干合处: 遁到【本干之合】 ——  讲义例 癸卯 → 午
  out.ganHe['遁到干合处·用爻'] = Object.assign({ from: useGan, fromName: useName, target: he(useGan) }, one(useGan, he(useGan)));
  out.ganHe['遁到干合处·贵神'] = Object.assign({ from: gGan, fromName: '贵神', target: he(gGan) }, one(gGan, he(gGan)));
  // ③ 遁走失方位: 将干之合 —— 讲义例 庚 → 酉
  out.ganHe['遁走失方位'] = Object.assign({ from: jGan, fromName: '将神', target: he(jGan) }, one(jGan, he(jGan)));
  // ④ 遁工作方位: 贵神本干 —— 讲义例 戊申 → 午
  out.ganHe['遁工作方位'] = Object.assign({ from: gGan, fromName: '贵神', target: gGan }, one(gGan, gGan));
  // ⑤ 遁人元: 地分不变, 以【人元自己的天干】起五子元遁, 取地分支处的天干
  //   讲义例(课例8): 原人元壬, 地分申 → 丁壬庚子起, 申处得戊 → 新人元戊
  //   (注: 若用日干遁地分只会得到原人元本身, 无信息量)
  const dfIdx = cur.difenIdx;
  out.dunRenYuan = { difen: cur.difenZhi, via: cur.renYuan,
    newGan: QM.GAN[(JK_DUN[QM.GAN.indexOf(cur.renYuan) % 5] + dfIdx) % 10], oldGan: cur.renYuan };
  return out;
}
window.jinkoujueDun = jinkoujueDun;

/* ══════ 高级起课法 · 地分三式（讲义 L102-103, 课例实证）══════
   讲义：「一般以其属相起课，再就是报数字，方位法，取外应，抽签，心动法……法无定法」
   课例反推的量化换算(零反例):
     属相 → 直接取该属相地支
     报数 n → 地支 (n-1) mod 12  |  天干 (n-1) mod 10   (7→午/庚, 3→寅, 12→乙, 4→卯)
     笔画 n → 地支 n mod 12                              («美美»16画→卯)
*/
function jinkoujueDifenFrom(kind, n) {
  const N = parseInt(n, 10);
  if (kind === 'shengxiao') return { difenIdx: ((N % 12) + 12) % 12, how: '属相' };   // 入参即地支索引(子=0..亥=11)
  if (kind === 'baoshu')    return { difenIdx: (((N - 1) % 12) + 12) % 12, ganIdx: (((N - 1) % 10) + 10) % 10, how: '报数' };
  if (kind === 'bihua')     return { difenIdx: (((N - 1) % 12) + 12) % 12, how: '笔画' };   // 16画→卯
  return null;
}
/* 报数化天干(先起人元法用) */
function _jkNumToGan(n) { return (((parseInt(n, 10) - 1) % 10) + 10) % 10; }
/* 报数化地支(先起贵神/将神法用) */
function _jkNumToZhi(n) { return (((parseInt(n, 10) - 1) % 12) + 12) % 12; }
/* 以某个天干起五子元遁, 反查该天干(自身)落于何支 —— 用于先起人元法 */
function _jkGanToDifen(ganChar, viaGan) {
  const t = QM.GAN.indexOf(ganChar), gi = QM.GAN.indexOf(viaGan);
  for (let z = 0; z < 12; z++) if ((JK_DUN[gi % 5] + z) % 10 === t) return z;
  return -1;
}

/* ══════ 高级起课法 · 隐课法 / 课中课（讲义 L353-354）══════
   原文：「先起出普通一课后以用爻做地分重新起一课。原来的四柱不变。只是增加断课的
   信息量，找出用爻以外的信息。」 */
function jinkoujueYinKe(opt) {
  const ch = jinkoujueChart(opt);
  if (!ch) return null;
  const cur = ch.cur;
  const newDf = (ch.yongwei === 2) ? QM.ZHI.indexOf(cur.guiGanZhi[1]) : cur.jiangZhiIdx;
  const sub = jinkoujueChart(Object.assign({}, opt, { difen: newDf }));
  return { base: ch, yongWei: ch.yongwei === 2 ? '贵神' : '将神',
           yongZhi: QM.ZHI[newDf], newDifenIdx: newDf, yin: sub };
}

/* ══════ 高级起课法 · 六亲课（讲义 L670-696）══════
   原文：「六亲课也属于课中课的一种……以用神为我」，按十神取六亲后另取地分重起, 四柱不变。
   讲义两例可反推取舍规则:
     用神亥(阴水) 求妻 → 我克者为财 → 水克火 → 取【午】(阳火, 与亥异性 → 正财=妻)
     用神亥(阴水) 求母 → 生我者为印 → 金生水 → 取【申】(阳金, 与亥异性 → 正印=母)
   即: 先定六亲所属五行(生我=父母/同我=兄弟/我生=子孙/我克=妻财/克我=官鬼),
       再在该五行的两支中按【与用神地支异性】取正亲(正财/正印/正官…), 同性取偏。
*/
const JK_LIUQIN = {
  fumu:  { name: '父母', rel: 'shengWo' }, xiongdi: { name: '兄弟', rel: 'tongWo' },
  zisun: { name: '子孙', rel: 'woSheng' }, qicai: { name: '妻财', rel: 'woKe' },
  guangui:{ name: '官鬼', rel: 'keWo' }
};
function jinkoujueLiuQin(opt, qinKey) {
  const ch = jinkoujueChart(opt);
  if (!ch) return null;
  const cur = ch.cur;
  const myIdx = (ch.yongwei === 2) ? QM.ZHI.indexOf(cur.guiGanZhi[1]) : cur.jiangZhiIdx;
  const myIdxGan = (ch.yongwei === 2) ? QM.GAN.indexOf(cur.guiGanZhi[0]) : QM.GAN.indexOf(cur.jiangGanZhi[0]);
  const myWx = JK_ZHI_WX[myIdx];
  const q = JK_LIUQIN[qinKey]; if (!q) return null;
  const rel = q.rel;
  // 找目标五行编号
  let target = 0;
  for (let w = 1; w <= 5; w++) {
    if (rel === 'shengWo' && _jkSheng(w, myWx)) target = w;
    if (rel === 'woSheng' && _jkSheng(myWx, w)) target = w;
    if (rel === 'woKe'    && _jkKe(myWx, w))    target = w;
    if (rel === 'keWo'    && _jkKe(w, myWx))    target = w;
    if (rel === 'tongWo'  && w === myWx)        target = w;
  }
  const cands = [];
  for (let z = 0; z < 12; z++) if (JK_ZHI_WX[z] === target) cands.push(z);
  // 与用神地支异性者优先(正亲), 同性为偏亲
  const myYin = myIdx % 2 === 1;                      // 索引奇=阴支
  const pick = cands.find(z => (z % 2 === 1) !== myYin) != null
    ? cands.find(z => (z % 2 === 1) !== myYin) : cands[0];
  const sub = jinkoujueChart(Object.assign({}, opt, { difen: pick }));
  return { base: ch, qin: q.name, myZhi: QM.ZHI[myIdx], myWx: JK_WX_NAME[myWx],
           targetWx: JK_WX_NAME[target], cands: cands.map(z => QM.ZHI[z]), difen: QM.ZHI[pick],
           difenIdx: pick, sub: sub };
}

/* ══════ 高级起课法 · 先起人元法 / 先起贵神法（讲义 L1103-1117）══════
   先起人元法: 报数 → 天干(报数-1 mod 10) → 以【日干】五子元遁反查该干落支 → 该支为地分
     讲义例: 丁日报数7(庚) → 丁壬庚子居 → 庚在子 → 地分子
             丁日报数5(戊) → 数到戊得申     → 地分申
   先起贵神法: 报数 → 地支(报数-1 mod 12)作贵神 → 日干起贵人分昼夜, 从贵人位按
     「贵腾朱六勾青空白常玄阴后」找到该神 → 落处即地分
     讲义例: 丁亥日庚戌时(夜) 报数7(午=朱雀) → 夜贵酉 → 酉起贵人逆行: 申腾蛇 未朱雀 → 地分未
*/
function jinkoujueXianQiRenYuan(opt, num) {
  const ch = jinkoujueChart(opt);
  if (!ch) return null;
  const dGan = ch.siZhu[2].charAt(0);
  const ganChar = QM.GAN[_jkNumToGan(num)];
  const df = _jkGanToDifen(ganChar, dGan);
  const sub = df >= 0 ? jinkoujueChart(Object.assign({}, opt, { difen: df })) : null;
  return { base: ch, num: num, gan: ganChar, viaGan: dGan, difen: df >= 0 ? QM.ZHI[df] : '',
           difenIdx: df, sub: sub };
}
function jinkoujueXianQiGuiShen(opt, num) {
  const ch = jinkoujueChart(opt);
  if (!ch) return null;
  const dGan = ch.siZhu[2].charAt(0);
  const hZ = QM.ZHI.indexOf(ch.siZhu[3].charAt(1));
  const zhi = _jkNumToZhi(num);
  const shenIdx = JK_GR_ZHI.indexOf(zhi);              // 本位支→该贵神序号
  const isDay = (hZ >= 3 && hZ <= 9);
  const grPair = QM.GR_TAB[dGan] || [1, 7];
  const grZ = grPair[isDay ? 0 : 1];
  const dir = [11,0,1,2,3,4].indexOf(grZ) >= 0 ? 1 : -1;
  // 从贵人位按顺序数, 找到 shenIdx 号贵神所落之支
  // 顺行: 神序递增、地支递增; 逆行: 神序递增、地支递减。
  // 故落支 = 贵人支 + dir * 神序号。讲义例: 丁日庚戌时 夜贵酉(9), 报数7=午=朱雀(序2),
  // 逆行 → 9 - 2 = 7 = 未 ✓
  const df = ((grZ + dir * shenIdx) % 12 + 12) % 12;
  const sub = df >= 0 ? jinkoujueChart(Object.assign({}, opt, { difen: df })) : null;
  return { base: ch, num: num, wantShen: JK_GUISHEN[shenIdx], wantZhi: QM.ZHI[zhi],
           guiRenZhi: QM.ZHI[grZ], dayNight: isDay ? '昼' : '夜', dir: dir === 1 ? '顺行' : '逆行',
           difen: df >= 0 ? QM.ZHI[df] : '', difenIdx: df, sub: sub };
}
window.jinkoujueDifenFrom = jinkoujueDifenFrom;
window.jinkoujueYinKe = jinkoujueYinKe;
window.jinkoujueLiuQin = jinkoujueLiuQin;
window.jinkoujueXianQiRenYuan = jinkoujueXianQiRenYuan;
window.jinkoujueXianQiGuiShen = jinkoujueXianQiGuiShen;

/* ══════ 起法区渲染（神煞表下方）══════
   把各类「起法」的结果直接列出, 点任一条即把中宫切到该地分(与点十二宫同一交互)。 */
function _jkAdvHtml(opt, chart) {
  const WXO = QM.WX_OF || {};
  const sel = chart.cur.difenIdx;
  // 一条结果: 标签 + 值 + 可选落到某地分(可点)
  const cell = (label, val, dfIdx, note) => {
    const clickable = (typeof dfIdx === 'number' && dfIdx >= 0);
    const isSel = clickable && dfIdx === sel;
    return '<span' + (clickable ? ' data-jkadv="' + dfIdx + '" onclick="_jkPick(' + dfIdx + ')"' : '') +
      ' style="display:inline-flex;align-items:baseline;gap:3px;padding:3px 7px;border-radius:5px;' +
      'border:1px solid var(--c-border);' + (clickable ? 'cursor:pointer;' : '') +
      (isSel ? 'background:var(--c-gray-bg);border-color:var(--c-theme);' : '') + '">' +
      '<span style="color:var(--c-text-3)">' + label + '</span>' +
      '<b class="' + (WXO[val] ? 'wx-' + WXO[val] : '') + '">' + (val || '—') + '</b>' +
      (note ? '<span style="color:var(--c-text-4);font-size:.85em">' + note + '</span>' : '') +
      '</span>';
  };
  const sect = (title, hint, body) =>
    '<div style="margin-top:7px">' +
      '<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:3px">' +
        '<b style="color:var(--c-gold);font-size:.95em">' + title + '</b>' +
        (hint ? '<span style="color:var(--c-text-4);font-size:.8em">' + hint + '</span>' : '') +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:4px">' + body + '</div></div>';

  let h = '';
  // ── 遁法 ──
  try {
    const d = jinkoujueDun(opt);
    if (d) {
      const rows = [];
      const push = (name, o, note) => { if (o && o.zhi) rows.push(cell(name, o.zhi, QM.ZHI.indexOf(o.zhi),
        (o.all && o.all.length > 1) ? '(另有' + o.all.filter(z => z !== o.zhi).join('') + ')' : note)); };
      push('干合遁', d.ganHe['干合遁·用爻'], '环境物象');
      push('干合处', d.ganHe['遁到干合处·用爻']);
      push('走失方', d.ganHe['遁走失方位']);
      push('工作方', d.ganHe['遁工作方位']);
      rows.push(cell('遁人元', d.dunRenYuan.newGan, -1, '(' + d.dunRenYuan.oldGan + '→' + d.dunRenYuan.newGan + ')'));
      h += sect('遁法', '点地支可切中宫', rows.join(''));
    }
  } catch (e) { _logErr('jkAdv.dun', e && e.message); }
  // ── 六亲课 ──
  try {
    const qins = [['fumu', '父母'], ['xiongdi', '兄弟'], ['zisun', '子孙'], ['qicai', '妻财'], ['guangui', '官鬼']];
    const rows = [];
    for (const [k, nm] of qins) {
      const r = jinkoujueLiuQin(opt, k);
      if (r) rows.push(cell(nm, r.difen, r.difenIdx, '(' + r.targetWx + ')'));
    }
    h += sect('六亲课', '以用神为我 · 点地支以此起课', rows.join(''));
  } catch (e) { _logErr('jkAdv.lq', e && e.message); }
  // ── 隐课法 ──
  try {
    const y = jinkoujueYinKe(opt);
    if (y) {
      const c = y.yin.cur;
      h += sect('隐课法', '以用爻为地分重起 · 四柱不变',
        cell('用爻', y.yongZhi, y.newDifenIdx, '(' + y.yongWei + ')') +
        cell('新课', c.renYuan + ' ' + c.guiGanZhi + ' ' + c.jiangGanZhi + ' ' + c.difenZhi, -1));
    }
  } catch (e) { _logErr('jkAdv.yk', e && e.message); }
  return h;
}
window._jkAdvHtml = _jkAdvHtml;

/* 先起人元法 / 先起贵神法: 由报数反推地分, 需即时输入, 故单独渲染(带输入框) */
function _jkAdvNumHtml(opt) {
  const WXO = QM.WX_OF || {};
  const n = (typeof _jkNum === 'number' && _jkNum > 0) ? _jkNum : 0;
  const cell = (label, val, dfIdx, note) => {
    const clickable = (typeof dfIdx === 'number' && dfIdx >= 0 && val);
    return '<span' + (clickable ? ' data-jkadv="' + dfIdx + '" onclick="_jkPick(' + dfIdx + ')"' : '') +
      ' style="display:inline-flex;align-items:baseline;gap:3px;padding:3px 7px;border-radius:5px;' +
      'border:1px solid var(--c-border);' + (clickable ? 'cursor:pointer;' : '') + '">' +
      '<span style="color:var(--c-text-3)">' + label + '</span>' +
      '<b class="' + (WXO[val] ? 'wx-' + WXO[val] : '') + '">' + (val || '—') + '</b>' +
      (note ? '<span style="color:var(--c-text-4);font-size:.85em">' + note + '</span>' : '') +
      '</span>';
  };
  let rows = '';
  if (n > 0) {
    try {
      const a = jinkoujueXianQiRenYuan(opt, n);
      if (a && a.difen) rows += cell('人元法', a.difen, a.difenIdx, '(' + a.gan + '→' + a.difen + ')');
    } catch (e) { _logErr('jkAdv.xq1', e && e.message); }
    try {
      const b = jinkoujueXianQiGuiShen(opt, n);
      if (b && b.difen) rows += cell('贵神法', b.difen, b.difenIdx, '(' + b.wantZhi + b.wantShen + '→' + b.difen + ')');
    } catch (e) { _logErr('jkAdv.xq2', e && e.message); }
  }
  const inp = '<input id="jkNumInp" type="number" min="1" max="60" inputmode="numeric" ' +
    (n ? 'value="' + n + '" ' : '') + 'placeholder="报数" oninput="_jkSetNum(this.value)" ' +
    'style="width:62px;background:var(--c-btn-gray);color:var(--c-text);border:1px solid var(--c-border);' +
    'border-radius:5px;padding:2px 6px;font-size:.95em;text-align:center">';
  return '<div id="jkAdvNum" style="margin-top:7px">' +
    '<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:3px">' +
      '<b style="color:var(--c-gold);font-size:.95em">先起法</b>' +
      '<span style="color:var(--c-text-4);font-size:.8em">报数反推地分（1 子 / 2 丑 …）</span>' + inp +
    '</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:4px">' + (rows || '<span style="color:var(--c-text-4);font-size:.85em">输入报数后显示结果</span>') + '</div></div>';
}
window._jkAdvNumHtml = _jkAdvNumHtml;



/* 刷新前若记录了待切换的盘型, 这里自动切过去, 用户不必再点一次 */
function _jkResumePan() {
  let t = 0;
  try { t = parseInt(sessionStorage.getItem('_jkPendingPan') || '0', 10); sessionStorage.removeItem('_jkPendingPan'); } catch (e) {}
  if (!t || t === panType) return;
  setTimeout(() => {
    try {
      const r = document.querySelector('input[name="panType"][value="' + t + '"]');
      if (r) { r.checked = true; setPanType(t); doPan(); }
    } catch (e) { _logErr('jkResumePan', e && e.message); }
  }, 60);
}
window._jkResumePan = _jkResumePan;

/* 自适应字号 —— 不用 clamp()/vw: 部分 Android System WebView 版本不支持 clamp,
   整条声明会失效并退回默认 16px, 导致中宫挤成一团(桌面浏览器正常)。
   这里用 JS 按视口宽度算出像素值写进 CSS 变量, 所有环境表现一致。 */
function _jkFitFont() {
  try {
    const w = document.documentElement.clientWidth || window.innerWidth || 400;
    const cl = (lo, hi, v) => Math.max(lo, Math.min(hi, v));
    document.documentElement.style.setProperty('--jk-fs', cl(9.5, 13.5, w * 0.0335).toFixed(1) + 'px');   // 中宫
    document.documentElement.style.setProperty('--jk-if', cl(9.5, 13, w * 0.0305).toFixed(1) + 'px');     // 输入区
    // 十二宫: 格子宽约为视口的 0.82/4, 字号随格子宽度缩放
    document.documentElement.style.setProperty('--jk-cf', cl(8, 12, w * 0.205 * 0.135).toFixed(1) + 'px');
  } catch (e) { _logErr('jkFitFont', e && e.message); }
}
window._jkFitFont = _jkFitFont;
_jkFitFont();
_jkResumePan();   // 若上个页面是因切盘而刷新, 这里自动切到目标盘型
window.addEventListener('resize', _jkFitFont);
window.addEventListener('orientationchange', _jkFitFont);


function jinkoujueChart(opt) {
  const tyme = window.tyme || {};
  if (!tyme.SolarTime) return null;
  const st = tyme.SolarTime.fromYmdHms(opt.year, opt.month, opt.day, opt.hour, opt.minute, 0);
  const sch = st.getSixtyCycleHour();
  const yGzO = sch.getYear(), mGzO = sch.getMonth(), dGzO = sch.getDay(), hGzO = sch.getSixtyCycle();
  const dG = dGzO.getHeavenStem().getIndex();
  const hZ = hGzO.getEarthBranch().getIndex();
  const mZ = mGzO.getEarthBranch().getIndex();

  // 月将。中气换将(标准): 节气序 0=冬至, 中气序 = floor(序/2) → 月将 = 六合[中气序]
  //        交节换将(简法): 月将 = 月建的六合, 月建 = (序-3)/2+2
  const tt = st.getTerm();
  const ti = ((tt.getIndex() % 24) + 24) % 24;
  const yueJian = Math.floor((ti - 3) / 2) + 2;
  const jiangZAuto = opt.jiang === 1 ? QM.HE[((yueJian % 12) + 12) % 12] : QM.HE[Math.floor(ti / 2)];
  const jiangZ = (opt.jiangZhi >= 0) ? opt.jiangZhi : jiangZAuto;   // 自定义月将优先
  // 昼夜：白天/夜晚可手选; 自动时按"卯酉区分"(卯~酉为昼)
  const isDay = opt.dayNight === 1 ? true : opt.dayNight === 2 ? false : (hZ >= 3 && hZ <= 9);
  // 贵人：QM.GR_TAB[日干] = [昼贵, 夜贵]
  // 贵人求法: 1=甲戊庚牛羊(传统) 2=甲羊戊庚牛(甲日昼未夜丑, 戊庚不变)
  let grPair = QM.GR_TAB[QM.GAN[dG]] || [1, 7];
  if (opt.guiren === 2 && QM.GAN[dG] === '甲') grPair = [7, 1];
  const grZ = grPair[isDay ? 0 : 1];
  // 顺逆：贵人落地盘 亥子丑寅卯辰 顺行，巳午未申酉戌 逆行
  const dir = [11, 0, 1, 2, 3, 4].indexOf(grZ) >= 0 ? 1 : -1;

  const houses = [];
  const G2Z_ = [2,3,6,5,4,7,8,9,0,11];   // 天干化支, 供逐宫算用位
  for (let df = 0; df < 12; df++) {
    const jsZ = ((jiangZ + df - hZ) % 12 + 12) % 12;                  // 将神地支
    const steps = ((df - grZ) % 12 + 12) % 12;
    const gsIdx = dir === 1 ? steps : (12 - steps) % 12;              // 贵神序号
    const gsZ = ((grZ + dir * gsIdx) % 12 + 12) % 12;                // 贵神所乘之支(神在地盘上的落点)
    const rgIdx = (JK_DUN[dG % 5] + df) % 10;                         // 人元
    const jsGan = QM.GAN[_jkDun(dG, jsZ)];
    const gsGan = QM.GAN[_jkDun(dG, gsZ)];
    const rgGan = QM.GAN[rgIdx];
    // 逐宫算用位 —— 每一宫是独立一课, 用爻不能沿用中宫那一课的
    const k4h = [0, G2Z_[QM.GAN.indexOf(rgGan)], JK_GR_ZHI[gsIdx], jsZ, df];
    houses.push({
      yongwei: _jkYongwei(k4h),
      difenIdx: df, difenZhi: QM.ZHI[df], difenGan: QM.GAN[_jkDun(dG, df)], jiangZhiIdx: jsZ,
      renYuan: rgGan, renWx: QM.WX_MAP[rgGan],
      renWs: '',
      guiShen: JK_GUISHEN[gsIdx],
      guiGanZhi: QM.GAN[_jkDun(dG, JK_GR_ZHI[gsIdx])] + QM.ZHI[JK_GR_ZHI[gsIdx]],  // 本位干支
      guiWx: JK_ZHI_WX[JK_GR_ZHI[gsIdx]], guiWs: '',
      guiChengZhi: QM.ZHI[gsZ], guiZhiIdx: gsZ,
      jiangShen: JK_JIANG[jsZ], jiangGanZhi: jsGan + QM.ZHI[jsZ],
      jiangWx: JK_ZHI_WX[jsZ], jiangWs: '',
      difenWs: '',
    });
  }

  // 中宫：当前地分那一课（默认取时支所在地分）
  const cur = houses[opt.difen != null ? opt.difen : hZ];

  // 五动（按四位生克，取常见口径）
  const G2Z = [2,3,6,5,4,7,8,9,0,11];   // 天干化支: 甲寅 乙卯 丙巳 丁午 戊辰 己未 庚申 辛酉 壬子 癸亥
  const kz4 = [0, G2Z[QM.GAN.indexOf(cur.renYuan)], QM.ZHI.indexOf(cur.guiGanZhi[1]), cur.jiangZhiIdx, cur.difenIdx];

  // ── 旺衰: 课内定(四位五行的计数 → 旺的五行 → 依相生序 旺相休囚死) ──
  const WXN = { 水:1, 木:2, 火:3, 土:4, 金:5 };
  // 旺衰只看四位: 人元【天干】、贵神【地支】、将神【地支】、地分。
  // 将干与神干不参与(它们是外象, 不是课的实体)。
  const kzx = [0,
    QM.WX_MAP[cur.renYuan] || 4,                     // 人元天干五行
    JK_ZHI_WX[QM.ZHI.indexOf(cur.guiGanZhi[1])],     // 贵神地支五行
    JK_ZHI_WX[cur.jiangZhiIdx],                      // 将神地支五行
    JK_ZHI_WX[cur.difenIdx]];                        // 地分五行
  const cnt = [0,0,0,0,0,0];
  for (let i = 1; i < 5; i++) cnt[kzx[i]]++;
  const wangWx = _jkWangWx(cnt);
  // 旺五行 → 其余按【传统五行旺衰】定, 而非相生序:
  //   相 = 我生者 / 休 = 生我者 / 囚 = 克我者 / 死 = 我克者
  // 讲义课例可证: 木旺时土为"死"(木克土), 若按相生序会误算成"休"。
  // 编号 1水 2木 3火 4土 5金
  const WX_SHENG = { 1:2, 2:3, 3:4, 4:5, 5:1 };   // 我生
  const WX_KE    = { 1:3, 2:4, 3:5, 4:1, 5:2 };   // 我克
  const WS_BY = {};
  WS_BY[wangWx] = '旺';
  WS_BY[WX_SHENG[wangWx]] = '相';
  for (const k in WX_SHENG) if (WX_SHENG[k] === wangWx) WS_BY[k] = '休';   // 生我者
  for (const k in WX_KE)    if (WX_KE[k]    === wangWx) WS_BY[k] = '囚';   // 克我者
  WS_BY[WX_KE[wangWx]] = '死';
  const wsOf = wxIdx => WS_BY[wxIdx] || '';
  houses.forEach(h => {
    h.renWs = wsOf(kzx[1]);
    h.guiWs = wsOf(kzx[2]);
    h.jiangWs = wsOf(kzx[3]);
    h.difenWs = wsOf(kzx[4]);
  });

  // 五动/三动按【乘支】的五行判(起课结果), 与本位干支无关
  const rWx = cur.renWx, gWx = cur.guiWx, jWx = cur.jiangWx, dWx = JK_ZHI_WX[cur.difenIdx];
  // 五动三动(干=人元 神=贵神 将=将神 方=地分), 据讲义"五动包括妻官财贼鬼,
  // 三动包括子孙父母兄弟":
  //   妻动 干克方 / 官动 神克干 / 贼动 神克将 / 财动 将克神 / 鬼动 方克干
  //   子孙动 干生方(我生者为子孙) / 父母动 方生干 / 兄弟动 干方比(五行相比)
  const wudong = [], sandong = [];
  if (_jkKe(rWx, dWx)) wudong.push('妻动');
  if (_jkKe(gWx, rWx)) wudong.push('官动');
  if (_jkKe(gWx, jWx)) wudong.push('贼动');
  if (_jkKe(jWx, gWx)) wudong.push('财动');
  if (_jkKe(dWx, rWx)) wudong.push('鬼动');
  if (_jkSheng(rWx, dWx)) sandong.push('子孙动');
  if (_jkSheng(dWx, rWx)) sandong.push('父母动');
  if (rWx === dWx) sandong.push('兄弟动');

  // ── 信息栏所需: 农历、节气时刻、四柱旬空 ──
  const lh = st.getLunarHour(), ld = lh.getLunarDay(), lm = ld.getLunarMonth();
  const lY = lm.getLunarYear().getYear(), lMr = lm.getMonthWithLeap();
  const lunarStr = (lMr < 0 ? '闰' : '') + QM.MNM[Math.abs(lMr) % 12] + QM.DNM[ld.getDay()] + '日';
  const pad2 = n => (n < 10 ? '0' : '') + n;
  const fmtTime = o => o.getYear() + '.' + pad2(o.getMonth()) + '.' + pad2(o.getDay()) + ' ' + pad2(o.getHour()) + ':' + pad2(o.getMinute());
  const curTerm = st.getTerm();
  // 节气串(名称 + 月.日 时:分), 写法照主盘 543 行的 tyme4j 用法
  const nextTerm = curTerm.next(1);
  const tJD = curTerm.getJulianDay(), tST = tJD.getSolarTime(), tD = tJD.getSolarDay();
  const nJD = nextTerm.getJulianDay(), nST = nJD.getSolarTime(), nD = nJD.getSolarDay();
  const termStr = curTerm.getName() + tD.getYear() + '.' + pad2(tD.getMonth()) + '.' + pad2(tD.getDay()) + ' ' + pad2(tST.getHour()) + ':' + pad2(tST.getMinute())
    + ' ~ ' + nextTerm.getName() + nD.getYear() + '.' + pad2(nD.getMonth()) + '.' + pad2(nD.getDay()) + ' ' + pad2(nST.getHour()) + ':' + pad2(nST.getMinute());
  // 四柱旬空: 甲子旬空戌亥, 甲戌旬空申酉, 甲申旬空午未, 甲午旬空辰巳, 甲辰旬空寅卯, 甲寅旬空子丑
  const KONG6 = [[10,11],[8,9],[6,7],[4,5],[2,3],[0,1]];
  const xunKong = gz => { const k = KONG6[Math.floor(((gz % 60) + 60) % 60 / 10)]; return QM.ZHI[k[0]] + QM.ZHI[k[1]]; };
  const kong4 = [xunKong(yGzO.getIndex()), xunKong(mGzO.getIndex()), xunKong(dGzO.getIndex()), xunKong(hGzO.getIndex())];

  // 用爻(用位): 默认取将神(3); 四课阳支数满足条件时改取贵神(2)
  //   据讲义: yyshu = 四课中地支索引为偶(阳支)的个数
  // 用神歌（讲义第四课原文）:
  //   课体纯阳神为用 / 课体纯阴将为用 / 三阳一阴阴为用 /
  //   三阴一阳阳上取 / 二阴二阳将为用
  // 且「用神只在贵神将神之间选取」—— 独阴/独阳若不在贵将(落在人元或地分),
  // 则回退默认(纯阳、三阳一阴取贵神; 纯阴、二阴二阳取将神)
  const yongwei = _jkYongwei(kz4);

  // 神煞（按四位落位）
  const ganIdx = [0, yGzO.getHeavenStem().getIndex(), mGzO.getHeavenStem().getIndex(),
                  dGzO.getHeavenStem().getIndex(), hGzO.getHeavenStem().getIndex()];
  const zhiIdx = [0, yGzO.getEarthBranch().getIndex(), mGzO.getEarthBranch().getIndex(),
                  dGzO.getEarthBranch().getIndex(), hGzO.getEarthBranch().getIndex()];
  const kgIdx = [0, QM.GAN.indexOf(cur.renYuan), QM.GAN.indexOf(cur.guiGanZhi[0]),
                 QM.GAN.indexOf(cur.jiangGanZhi[0]), QM.GAN.indexOf(cur.difenGan)];
  // 四位的地支: 人元位不取地支, 贵神位取【本位支】,
  //            将神位取将神所乘支, 地分位取地分支
  const kzIdx = [0, cur.difenIdx, QM.ZHI.indexOf(cur.guiGanZhi[1]), cur.jiangZhiIdx, cur.difenIdx];
  const ss = jinkoujueShenSha(mZ, dGzO.getIndex(), ganIdx, zhiIdx, kgIdx, kzIdx,
    QM.GAN[yGzO.getIndex() % 10], QM.GAN[mGzO.getIndex() % 10], QM.GAN[dGzO.getIndex() % 10], QM.GAN[hGzO.getIndex() % 10]);

  return {
    siZhu: [yGzO.getName(), mGzO.getName(), dGzO.getName(), hGzO.getName()],
    shensha: ss, yongwei: yongwei, wangWx: wangWx, wangSrc: '课内', lunar: lunarStr, kong4: kong4, termStr: termStr,
    dateFull: opt.year + '年' + pad2(opt.month) + '月' + pad2(opt.day) + '日 ' + pad2(opt.hour) + '时' + pad2(opt.minute) + '分(' + lunarStr + ')',
    dateStr: opt.year + '年' + pad2(opt.month) + '月' + pad2(opt.day) + '日 ' + pad2(opt.hour) + '时' + pad2(opt.minute) + '分(' + lunarStr + ')',
    yueJiang: QM.ZHI[jiangZ], yueJiangName: JK_JIANG[jiangZ], yueJiangIdx: jiangZ, yueJiangAuto: jiangZAuto,
    dayNight: isDay ? '昼' : '夜',
    guiRenZhi: QM.ZHI[grZ], guiRenDir: dir === 1 ? '顺' : '逆',
    houses, cur, wudong, sandong,
  };
}
window.jinkoujueChart = jinkoujueChart;

/* ══════════════ 玄女十六字诀 · 文字资料 ══════════════
   长按"玄女16诀"按钮弹出。据《玄女十六字诀》两天讲课记录整理, 尽量不丢细节:
   排法、十六字逐条的断法与布局、布局通用法、两个凶格、符咒化解、喝水疗法。
   材料中的应验案例属讲课人个人经验叙述, 此处只作转述。 */
/* ══════ 玄女十六字诀 · 内置资料 ══════
   据第一天、第二天讲课记录重写: 问答改为叙述, 图片文字已并入正文。
   十六字: 十二字沿地支排, 四字(雷火风豹)排四维宫。 */
const XN_HELP = {
 "toc": true,
 "title": "玄女十六字诀",
 "head": "进 曲 狱 丰 空 泣 欹 劫 散 破 灵 吾　＋　雷 火 风 豹<br><span style=\"font-size:11px\">十六字诀 · 两天课程整理 · 点上方目录可跳转</span>",
 "blocks": [
  {
   "t": "一、盘外盘是什么",
   "rows": [
    "奇门的盘外盘，是在奇门盘的外面再排一圈盘。",
    "它针对的是有奇门基础的人。在盘的外面加排这一圈，能给我们提供更多的信息 —— 不论断局还是布局，都能起到辅助作用，填充新的信息，让我们更直接地去断卦、去布局。",
    "盘外盘并不局限于阴盘或阳盘，大家不用纠结这个问题。把它当做一个工具，不论阴盘阳盘都能得到更多信息。它也可以跟我们其他的技术叠加使用：比如做法事的时候，可以用它去选择最佳的时间和方位；也可以叠加我们平时已有的奇门断卦方法和布局方法。",
    "这样的外盘，师傅传承了很多，每一盘都有它不同的功能。学完这一盘并认可之后，后面还会陆续传出其他的外盘；到那时候，外盘和外盘之间也可以叠加使用。",
    "<b>强调一点</b>：它并不是万能的，也不要把它神化，认为学了它以后任何问题都能解决 —— 那既不现实也不可能。任何事情都没有绝对，也没有百分之百。只要我们大部分的布局是成功的，这个东西就是好的；不可能所有的布局都好使，即使神仙下凡也做不到这一点。",
    "人生当中该经历的，还是要去经历。我们尽量用所学去逢凶化吉、趋吉避凶，让运势和生活变得更好。<b>所以布局也要符合现实、符合常理，放平心态。</b>"
   ]
  },
  {
   "t": "二、正名：它其实叫太乙十六字诀",
   "rows": [
    "\"玄女诀\"这个名字，是当时市面上残版的人起的。实际上这十六个字源于太乙，正确的名字应当叫<b>太乙十六字诀</b>。",
    "市面上传的是十二个字，其中<b>有两个字是错误的</b>。正确的十二个字是：",
    "<div style=\"border-left:3px solid var(--c-gold);padding:2px 0 2px 8px;color:var(--c-text-4)\"><b>进　曲　狱　丰　空　泣　欹　劫　散　破　灵　吾</b></div>",
    "这些字都很形象，也是很常用的字。给奇门盘排上这一圈外盘之后，能让我们更形象、更生动、更快速、更准确地断奇门局，给枯燥的奇门局增添很多乐趣；让一些不太深入学习奇门的人，也可以很快上手去断局和布局。"
   ]
  },
  {
   "t": "三、第一种排法：按月",
   "rows": [
    "十六字诀的排法有两个，先说第一个。有一个口诀：",
    "<div style=\"border-left:3px solid var(--c-gold);padding:2px 0 2px 8px;color:var(--c-text-4)\"><b>正五九月虎当头，二六十月被猪伤，</b><br><b>三七十一蛇反复，四八十二在龙江。</b><br><b>阳顺阴逆</b></div>",
    "这个口诀的意思是：",
    "<b>正月、五月、九月</b> —— 从<b>寅</b>开始，阳顺阴逆排",
    "<b>二月、六月、十月</b> —— 从<b>亥</b>开始",
    "<b>三月、七月、十一月</b> —— 从<b>巳</b>开始",
    "<b>四月、八月、十二月</b> —— 从<b>辰</b>开始",
    "实际上就是：<b>寅午戌的月份从寅开始排，亥卯未的月份从亥开始排，申子辰的月份从巳开始排，巳酉丑的月份从辰开始排。</b>",
    "下面排一个盘，举个例子。",
    "<span style=\"color:var(--c-text-4)\">〔图〕图1】十二地支所在的宫位</span>",
    "<span style=\"color:var(--c-text-4)\">〔图〕图2】八月的盘（从辰起逆排）</span>",
    "我们先来看这个盘。这个盘是八月份 —— \"四八十二在龙江\"，从龙开始排，<b>辰龙，我们就从辰开始排</b>，先看一下辰所在的九宫的位置。",
    "我们从辰开始排。因为上面写的是阴遁，<b>阴遁要逆着排，阳遁要顺着排</b>，所以这个盘我们从辰开始逆排。",
    "另外四个字（<b>雷、火、风、豹</b>）是排在<b>四维宫</b>上的，第二天再讲。这里再补充两点：<b>第一种排法要用月份，不是按日子排</b>；它也不限于阴盘，<b>任何盘都可以用</b> —— 比如申子辰的月份，就是从巳起排。"
   ]
  },
  {
   "t": "四、第二种排法：按日时",
   "rows": [
    "第二种排法是通用的、更简便的排盘方式，一般也是我们比较常用的。",
    "<b>从时支的六合开始，阳顺阴逆排。</b>",
    "第二种排法就是当时残版的排法，<b>但残版让阴遁和阳遁都顺排，而我们是阳顺阴逆</b> —— 这个地方它也做了改动。",
    "举一个例子。",
    "<span style=\"color:var(--c-text-4)\">〔图〕图3】时支为酉，酉的六合是辰，阴遁，从辰起逆排</span>",
    "我们看这个盘，它的<b>时支是酉，酉的六合为辰</b>，阴遁，所以我们<b>从辰开始逆排</b>。",
    "第二种排法很常用、很方便。",
    "排好了盘以后，我们讲一下这十六个字分别代表的意义，以及在预测和化解时候的运用。"
   ]
  },
  {
   "t": "五、十二字的像义与运用",
   "rows": [
    "<b>以下逐字讲解十二字的像义与运用。</b>"
   ]
  },
  {
   "t": "进",
   "rows": [
    "如果它落在了<b>生门</b>的宫位，代表着<b>进财</b>。如果这个宫内有<b>戊</b>（包括天盘干、地盘干、遁干），外盘临进字，也代表进财。",
    "外盘是进字、进字所临之宫内有<b>开门</b>，代表<b>工作有发展、加官进爵</b>。开门也代表店铺，临进字也代表<b>可以开分店</b>，门面比较好。",
    "<b>时干</b>也代表小孩或者小孩的年命，临进字代表<b>学习好、进步</b>。",
    "进字的位置也代表着<b>家里入户门的位置</b>。我们可以用进字所临之宫内的象意，去断家里进门处的一些情况。",
    "临进字的地方也代表着此方位<b>能进能出、人多、进进出出、关卡、十字路口、红绿灯</b>。",
    "<b>死门</b>代表着坟墓。如果死门临进字，八神是<b>腾蛇</b>，就代表此坟当中进了蛇；如果临<b>玄武</b>，代表此坟进了老鼠。",
    "进字既然代表入户门，<b>如果宫内有白虎或者伤门</b>，说明这个入户门纳的气是<b>病灾的气</b>，这个入户门方位不吉祥；在此方位开门纳气，会有病灾、伤灾、官司口舌。",
    "进字临<b>丁</b>也可以代表<b>添丁、进人丁</b>。所以我们在<b>催丁</b>的时候，可以让进字临着丁，或者让进字临着年命的十二长生的<b>胎地</b>。",
    "前几天在群里的福利局，就是这个时间段排出来的。当时还差 7 分钟就到 7 点钟了。这个盘当时为什么在东南方？就是因为<b>进字临上了戊</b>，所以会进财。后面我们还会再具体讲怎样布局。"
   ]
  },
  {
   "t": "曲",
   "rows": [
    "十二字诀之所以一眼就能断、很准确，可以直断，是因为这些字本身就很形象。<b>曲字</b>一看就代表着<b>曲折、伤心、分手、弯曲</b>。",
    "如果曲字所在的宫位，八神是<b>六合</b>，也就是六合临曲字，代表着<b>婚姻感情波折、不幸福</b>。六合也代表合作，合作临曲字，证明<b>合作不顺利、一波三折</b>。",
    "<b>开门临曲字</b>，代表着工作不顺利、工作上面有曲折，也有可能会调动。<b>值符加曲字</b>，代表着高管领导、管理层处境比较困难。<b>时干临曲字</b>代表着事情进展有难度、不顺利。",
    "曲字也代表着<b>弯曲的地方</b>，代表着此方位有林荫小道、曲径通幽。我们在布局的时候，也可以用曲字来布<b>文昌局</b>，因为它也代表<b>文曲星</b>。",
    "所以每一个字都有两面性，我们不能说哪一个字好或者不好，要看它用在什么地方。"
   ]
  },
  {
   "t": "狱",
   "rows": [
    "从字面上就可以看到，狱字代表着<b>牢狱</b>，代表着<b>被困、孤单</b>。",
    "<b>时干临狱字，或者孩子的年命临狱字</b>，可能孩子会有一些自闭，或者他的内心比较孤单。如果<b>六合临狱字</b>，代表着婚姻不好，婚姻就像在牢狱里面一样。<b>值符加狱字</b>代表着管理层领导被困，或者有被抓的可能；也代表领导管理严格。如果<b>生门临狱字或者戊临狱字</b>，代表着<b>资金被套牢</b>。",
    "狱也有监狱的意思。所以<b>天辅星代表老师</b>，如果临狱字，可能老师会打骂学生、对学生严格。",
    "临狱字的人，可能会有一些<b>自闭、孤独、傲慢</b>。",
    "代表方位和环境的时候，临狱字此方位可能会比较<b>偏僻</b>。",
    "狱也代表着<b>收藏</b>。如果狱字宫内有乙木的乙，天英星代表桃花，有可能会有<b>金屋藏娇</b>的可能。狱也代表着<b>暗恋</b> —— 如果哪个美女的年命临了狱字生你，有可能此美女会暗恋你。",
    "如果孩子有多动症或者比较调皮的话，我们也可以让孩子的年命临狱字，这样他就不会那么调皮了。",
    "这些字都是可以无限延伸和扩展的。通过我们在实践当中多去实践、多去预测、多去布局、多去试验，我们也可以开发出更多的用途。这个就看大家的灵活运用了，也不要局限于我所讲的这些。你们也可以去无限开发 —— 最重要的是，我们没有偏离易理，只要符合易理，你也可以发挥自己的无限可能。"
   ]
  },
  {
   "t": "丰",
   "rows": [
    "丰字代表着<b>丰满、丰收、收获</b>，代表着<b>人多的地方、人气旺的地方</b>。",
    "丰如果临<b>开门临时干</b>，代表着公司的员工比较多，或者店铺的人流、客流量比较大。然后我们再从宫内的信息去分析，是男员工多还是女员工多：看临的九星，<b>阴星就是女员工多，阳星就是男员工多</b>；如果临<b>年干</b>，就是年纪大的人比较多。",
    "如果<b>生门临丰字，或者戊临丰</b>，代表着钱比较多；<b>时干临丰</b>代表着客户比较多。",
    "丰的方位也代表<b>人多的地方</b>，比如超市、电影院、会场。",
    "如果<b>时干加天芮星加丰字</b>，代表着这家医院或诊所的病人比较多；如果宫里面再有<b>年干</b>，就代表病人当中是<b>老年人居多</b>。",
    "如果有的人想<b>丰胸</b>，也可以用丰字来设局：<b>戊代表乳房加丰字，在震宫就代表着丰胸</b>。",
    "我们也可以起局，把<b>聚宝盆、发财树</b>放在丰的位置上。",
    "所以一般店铺、饭店设局可以用丰字。时干临丰字的话客户会比较多；如果<b>股票临上丰字</b>的话，基本上上涨的可能性会很大，因为有人验证过 —— 这个需要大家自己多去验证。",
    "在<b>择日</b>上面，我们也可以选择丰字落宫的那一天去开业，或者去种庄稼。",
    "所以这些字教给了大家，它是一个工具、一个方法、一个思路，具体的运用并不局限于我讲的这些，大家可以多去实践、多多去开发。",
    "我们讲的这些，很多是师兄们在实践当中试验之后反馈回来的经验；我自己也曾经跟石老师交流过这个方法，他运用此法也有过一些成功的案例。"
   ]
  },
  {
   "t": "空",
   "rows": [
    "空字如果临<b>生门或者戊</b>，代表着<b>财空了</b>。如果<b>店铺临空</b>代表着店铺的人流比较少。此方位也代表着<b>空荡荡的</b>，可能会有大的空地。",
    "<b>六合临空</b>代表这个婚姻可能<b>有名无实</b>了，或者是这个感情<b>没有结果</b>。",
    "如果人的<b>年命临空了</b>，也代表这个人比较<b>佛性</b>。",
    "像我们平时打坐、练功，就可以到空的方位上去 —— 此方位可以让我们更加能够静下来，放空一切去修行练功。",
    "我们<b>斩桃花</b>的时候也可以在空的方位上去布局，或者我们可以把第三者的年命放到空的宫位上。",
    "所以这些都要靠我们大家去灵活运用，去发散自己的思维，去开拓思路，把十六字诀发挥得淋漓尽致。",
    "所以盘外的信息，可以给我们<b>一眼定吉凶</b>；盘内的信息跟盘外的信息相互融合，就会细化我们的预测和布局。为什么要给大家一个基础知识？是因为有了基础知识，明白了星门神、天干地支的象义，我们才能更好地把这些基础知识跟十六字诀盘外盘相融合，去预测、去布局，才能更成功地取象，也才能把十六字诀更生动、更形象地和盘内的信息融合起来，去发散我们的思维。"
   ]
  },
  {
   "t": "泣",
   "rows": [
    "如果<b>时干或者小孩的年命临泣字</b>，说明小孩比较<b>胆小、爱哭泣</b>。如果<b>女人的年命临着此字</b>，代表女的<b>多愁善感、比较有同情心</b>。泣字也代表着伤心、哭泣、流泪。",
    "如果<b>天芮星临泣字</b>，代表着<b>疾病不是很好治</b>，有<b>卧床</b>的信息。",
    "<b>开门临泣字</b>代表着工作比较辛苦；开门也代表店铺，代表店铺的经营也比较辛苦。<b>生门加泣字</b>代表着生活比较辛酸。<b>六合临泣字</b>代表着这个婚姻是不幸福的。<b>乙木如果临泣字</b>，代表这个花要经常地浇水。",
    "<b>癸水代表眼睛</b>，如果临泣字了，说明有<b>风流眼</b>，见风就会流泪。",
    "泣字如果临着<b>戊</b>，代表着<b>不宜投资</b>，容易受到伤害。泣字的方位也可以代表<b>医院、药店、殡仪馆</b>。"
   ]
  },
  {
   "t": "欹",
   "rows": [
    "这个字代表着<b>第三者、三角恋</b>。",
    "<b>六合临欹字</b>代表婚姻有第三者、婚姻不幸福、婚姻有分手的可能。",
    "欹字也代表着<b>烂桃花、小人</b>。如果<b>学生临欹字</b>，代表着<b>早恋</b>。",
    "欹字的方位也代表<b>娱乐场所、歌厅、酒吧</b>。欹字也代表着<b>不公正</b>。"
   ]
  },
  {
   "t": "劫",
   "rows": [
    "劫这个字，从字义上就可以看出来。如果它<b>临戊和生门</b>，就代表着<b>劫财、破财</b>，它代表着<b>抢劫、打劫</b>。",
    "<b>生门临着劫</b>，代表着<b>骗财</b>；<b>开门临着劫</b>，代表着<b>忽悠、虚假的信息</b>；<b>景门代表着信息，临劫代表着信息有误、信息诈骗</b>。",
    "劫也代表着<b>脾气不好、打斗、没收、不安全的地方</b>。",
    "<b>时干或者小孩子的年命临劫</b>，代表着他<b>喜欢武术、喜欢跆拳道</b>。劫字也代表着<b>保安、城管</b>。",
    "除了劫财，还可能会<b>劫色</b>。如果<b>六合临劫</b>，代表着劫色、第三者、烂桃花、横刀夺爱。如果<b>劫字生女方的年命或者生乙木</b>，代表着会把女方劫走。",
    "时干临劫也代表着<b>打劫抢走</b>。如果卖房、转租，我们可以用<b>时干临劫</b>来布局，让这个房子或者店铺被劫走，这样来促进和助力我们卖房和转租。",
    "所以每一个字都不能说它好或者不好，要看我们用在什么样的情况下。",
    "如果<b>斩桃花</b>，我们也可以用劫字 —— 用劫字去生着第三者的年命，把第三者劫走。",
    "比如<b>时干加上劫去生开门</b>：开门代表店铺，时干代表着客户，客户生店铺，客户又临着劫，他就会把这个店铺劫走 —— 也就是说，我们会把这个店转卖或者转租出去。所以<b>劫字也可以代表二手房、二手车</b>。",
    "所以这就是一个布局的思路。希望大家不要学死了 —— 这里面的这些话，大家要反复地看一下、反复地琢磨一下，其实这就是一种思路，运用十六字诀去布局的思路。大家可以套用这个思路去布其他的局，去融会贯通、举一反三，才能去解决更多的问题，发现更多的方法。",
    "<b>小孩子的年命或者时干临劫</b>，代表小孩子容易欺负别人。如果一个人临劫<b>加上天蓬星或者天英星</b>（天英星代表着桃花），那么这个人可能容易<b>劫色</b>。如果这个人<b>劫字临上了戊</b>，代表着劫财，也可以代表这个人可能会比较<b>小气、比较喜欢占便宜</b>。",
    "<b>六合临劫字再加上伤门</b>，可能在婚姻的关系当中会动手、会有<b>家暴</b>。<b>劫字加上惊门</b>会吵架。如果<b>劫字临白虎</b>，也有暴力的倾向和可能。"
   ]
  },
  {
   "t": "散",
   "rows": [
    "散字代表着一个人比较<b>散漫、好动</b>。",
    "<b>散字临戊或者生门</b>，代表着<b>散财、破财、爱花钱、零花钱比较多、大手大脚</b>。",
    "<b>时干如果临散</b>，代表着客户舍得花钱。所以我们布局的时候，可以让客户（也就是时干）<b>临散生开门</b> —— 这样客户到店里就会比较愿意花钱。如果<b>时干临杜门</b>就不舍得花钱。",
    "<b>六合临散</b>代表着这段感情容易<b>离婚或者分手</b>，代表着分散、分离。",
    "临散的人没有上进心。如果<b>小孩子临散字</b>，他<b>注意力不集中</b>。",
    "<b>六合临散</b>也有可能代表着两个人是<b>分居状态，或者分床而睡</b>。",
    "<b>开门临散</b>，代表着店铺可能会分散、会有分店、会开连锁店。",
    "散字也代表着<b>广告、传媒、散播</b>，所以在宣传的时候，我们可以用散字设局扩大宣传。",
    "我们也可以在<b>散的日子去种庄稼、撒种子</b>，散播开来。",
    "散也代表着<b>拆迁、破财、散步、散伙</b>。",
    "临散的人也是比较<b>喜欢分享</b>的，或者喜欢做慈善。临散的人也比较容易付出。<b>六合临散</b>的话，也代表着<b>合作散伙</b>。"
   ]
  },
  {
   "t": "破",
   "rows": [
    "破字如果<b>临六合</b>，代表着<b>婚姻破灭了、合作破灭了</b>。破字如果<b>加戊或者生门</b>，代表着<b>破财</b>。破如果<b>加开门</b>，就代表着工作方面<b>有错误的地方、是不完美的</b>。<b>惊门加破</b>代表着<b>骂人</b>。",
    "如果你想<b>破别人的法</b>，也可以用破字去设局，或者在破的方位设局 —— 所以凡事都是两面性的。",
    "<b>房子如果临破字</b>，代表着<b>破旧、环境不好</b>。<b>小孩子如果临破字</b>，代表着他比较<b>调皮、喜欢搞破坏</b>。<b>开门临破字</b>也可以代表着<b>破产</b>。破也代表着<b>破损、损坏</b>，此方位有破损的东西。<b>年命加破代表着死亡</b>。破字也可以代表<b>殡仪馆</b>。",
    "所以我们在<b>斩桃花</b>的时候，也可以让<b>六合临破字，或者六合临散字</b>，都可以。"
   ]
  },
  {
   "t": "灵",
   "rows": [
    "灵字代表着<b>悟性好</b>，代表着<b>灵感</b>。",
    "<b>景门加灵</b>可以代表着<b>有灵性</b>。灵字的人点子比较多、比较有灵性、有悟性，也可以代表着<b>玄学</b>。",
    "<b>小孩子临灵</b>，代表着小孩子比较聪明、学习比较灵活。",
    "灵字也代表着有灵气，代表着<b>贵人、老板、神佛、官贵</b>。",
    "我们<b>学习</b>的时候，可以到灵的方位去学习；我们<b>做法</b>的时候，也可以到灵字的位置去做法。除了到空字的地方去打坐，也可以到灵字的地方去打坐。"
   ]
  },
  {
   "t": "吾",
   "rows": [
    "最后一个字<b>吾</b>，吾字代表着<b>求测人</b>。",
    "如果宫里边有<b>白虎</b>的话，说明<b>求测人有灾</b>；如果宫里边有<b>休门</b>，说明<b>有贵人帮助</b>；临<b>开门</b>说明这个人比较<b>开朗</b>。",
    "这个吾字，我们可以<b>结合宫内的信息</b>来断。",
    "以上就是十六个字当中的十二个字 —— 也就是残版当中传的十二个字。但是<b>残版改了 2 个字，我们给更正了过来</b>；残版里边并没有另外的 4 个字。"
   ]
  },
  {
   "t": "外盘与盘内信息的关系",
   "rows": [
    "有一个现象，正好说明外盘的作用。我们正常给人家布局，看盘内的方位很好，<b>生门又有戊</b>，于是就给客户布了局；布完之后发现并没有那么大的效果。这时候再排上外盘一看，<b>外盘临了一个破字或散字</b> —— 原来这个方位是破财的。这正是外盘的好处：它给了我们更多的信息，给了我们一个吉凶的判定，也给了我们一个大的方向。",
    "<b>阴盘奇门是用年命来预测的</b>，每个人都有年命。<b>快速找年命的方法：1 辛、2 壬、3 癸、4 甲、5 乙、6 丙、7 丁、8 戊、9 己、0 庚</b> —— 看的是出生年的尾数。所谓\"年命临某个字\"，就是这个人年命的天干，正好落在外盘某个字所在的宫位里。"
   ]
  },
  {
   "t": "六、预测案例：超市转让",
   "rows": [
    "举一个例子，来说明这十二个字在预测当中的运用。把这些字穿起来，大家就更好理解了。",
    "这个盘是我在确定了讲课之后，有人来问我事情，我就正好用了十二字诀来给她预测。",
    "<b>她问</b>：想在春节前把店铺兑出去，让我给她一些建议。",
    "<b>起盘一看，是伏吟局</b> —— 代表着不动 —— 所以我跟她说，<b>她的店铺不好往外兑</b>。",
    "她这个背景是：<b>超市在一个私立学校里</b>，很偏僻的一个私立学校里面。因为学生都是住宿制的，所以大多数的东西都要在超市里买。她是通过关系，在这个学校里面一共有两家超市，其中有一家是她的，还有另外一家是她的竞争对手。但是因为这个学校很偏僻，附近没有什么其他的超市，又是住宿式的学校，所以两家超市的生意还是不错的，之前她每年大概纯利润在 100 多万。",
    "<b>当时的对话</b>：",
    "<div style=\"border-left:3px solid var(--c-gold);padding:2px 0 2px 8px;color:var(--c-text-4)\"><b>她</b>：春节前我愁把店出兑，你能给我点建议不。<br><b>我</b>：你们那学校里面就那么一两家，应该好往外兑吧？但是我奇怪，看好像不太容易马上兑出去。<b>而且你剩的货还挺多的</b>，应该还压了一部分钱。<br><b>她</b>：因为今年生意特别不好，我本来以为能好兑，结果有传言后年学校有变动。<br><b>我</b>：我看你这个卦上看，就是不太好往外兑。<br><b>她</b>：姐姐，我就是每天犯愁，确实不想过了。而且我都没想明白，为啥超市买卖突然一落千丈 —— 姐，钱就是莫名其妙没了。</div>",
    "<span style=\"color:var(--c-text-4)\">〔图〕图】起课盘</span>",
    "<b>断盘过程</b>：",
    "<b>时干代表着店铺</b>。甲戌己在坎宫<b>临丰字</b>，所以我断<b>她的货还剩得挺多的</b>。",
    "<b>她的年命是癸水，临着泣字</b>，所以我问她最近是不是多愁善感 —— 因为婚姻六合宫临空亡，又临散字和劫字，所以我问她是不是在婚姻上有什么想法。",
    "她回答：<b>每天都犯愁，确实不想过了。</b>",
    "她说：<b>想不明白钱为什么莫名其妙地没有了。</b>",
    "然后我们看<b>坤宫的戊临了一个劫字</b>，说明<b>她的钱被劫走了</b>。所以我问她说：<b>另外那一家生意是不是比她好？</b> 因为她的竞争对手把她的钱劫走了。",
    "又因为<b>离宫临破字</b>，所以我问她<b>店里正南方是不是有破损的东西</b>。她在第二天回复说：",
    "<div style=\"border-left:3px solid var(--c-gold);padding:2px 0 2px 8px;color:var(--c-text-4)\"><b>她</b>：正南是跟隔壁的间壁墙上有窟窿，耗子打的洞，然后我家这边用石头和板子挡上了。</div>",
    "—— 所以离宫出现了<b>庚</b>的象义，也代表着<b>石头</b>。",
    "然后，<b>进字的地方就是入户门的地方</b>，临伤门。所以我问她<b>店铺的门是不是有坏的地方</b>，或者她是不是<b>又买了一辆车</b> —— 进也代表<b>添</b>，买车了。",
    "<div style=\"border-left:3px solid var(--c-gold);padding:2px 0 2px 8px;color:var(--c-text-4)\"><b>她</b>：我没换车，我都有好几年没去店里了。<br><b>我</b>：没换车，应该店铺门或门口有损坏的地方。</div>",
    "我们再看：因为她的年命是癸，<b>她老公戊癸相合</b>，所以她老公用<b>戊</b>来代替。那么她老公临着散和劫字，又临着戊字，说明她老公<b>比较能花钱</b>。",
    "当时我就已经看出来<b>她老公劫了她的财</b>，所以我又特意问了一下：\"莫名其妙地没了是什么意思？\"",
    "然后她说：<b>她老公做假账，欺骗她。</b> 我说：局上看到了 —— 因为她老公临劫字又临戊，<b>劫了她的财</b>。",
    "<div style=\"border-left:3px solid var(--c-gold);padding:2px 0 2px 8px;color:var(--c-text-4)\"><b>她</b>：姐，我老公是那种败家的，就是他可以不给小孩买吃买喝，然后用兜里仅有的钱充值游戏。他心里谁都没有。他偷偷收钱，然后扣我的进货款。<br><b>她</b>：我儿子就是我爸在养，他家完全不管。</div>",
    "因为<b>死门代表坟墓，临六合</b>，所以我说<b>他老公家的坟是合葬坟</b>。因为<b>临马星要动</b>，所以可能<b>迁移过，或者以后会迁</b>；因为<b>空亡</b>，所以<b>地气空了</b>，而且有破损的地方。",
    "因为她老公临散字，所以我说<b>她老公比较散漫、缺少上进心</b>。",
    "<div style=\"border-left:3px solid var(--c-gold);padding:2px 0 2px 8px;color:var(--c-text-4)\"><b>她</b>：我就是看够他那一副懒散的样子。<b>长期不在一起</b>。我希望他有人，然后才能离婚。<br><b>我</b>：卦上看是有人了吗？<br><b>她</b>：我感觉我俩都不太会出轨 —— 他是因为懒，我是因为看透了，找谁都一样，不如自己带孩子过得舒心。<b>这个店我打算即使贱卖也处理掉。</b></div>",
    "因为她老公<b>坤宫生兑宫，生着欹字</b>，欹字代表第三者，而且六合宫里面也是她老公的宫位，里面有寄宫 —— 所以我就问她<b>不怕她老公外面有人吗</b>。后来她问我有吗，我说没有，<b>但实际上我认为有</b>。",
    "<b>欹字临太阴</b>，说明<b>这个第三者在暗处还没有被发现</b>；两个人都临着空亡，<b>现在还不容易被发现</b>。而且她老公的遁干就是<b>兑宫的壬水</b>，并且遁干的壬水跟坤宫地盘干<b>丁壬相合</b>，所以又为寄宫 —— 我认为<b>她老公是有第三者的</b>。",
    "以上这个小小的案例，就是我们用外盘来断盘的一个预测的思路，就是给大家演示一下这个盘外盘的字怎么运用。大家可以灵活地运用 —— 我们学习的是一个方法、一个思路。"
   ]
  },
  {
   "t": "七、怎样布局",
   "rows": [
    "我们再来看这个盘。这个盘是我们那天的<b>福利局</b>。",
    "当时<b>还有 7 分钟到 7 点钟</b>，这个局就过去了。但是我一看，<b>这个局的进字正好在巽宫临戊字</b> —— 如果进字宫内有戊字或者有生门，我们都可以用进字来布<b>招财局</b>。",
    "我们熟悉基础知识，就为了能取象。<b>最直接的就是要放星、门、神，或者天干、地支、遁干的物象信息</b> —— 我们选取其中比较容易找到的物象来放就可以了。",
    "我们这个体系的优点就在于：有别于其他派别在布局的时候要烧香、要画符、要摆酥油灯，有的时候客户不方便摆，这些容易被其他人看出来。<b>最高明的布局方法就是无痕式的布局方法</b> —— 随意地变动家里的一些物品，就可以达到我们想要的结果。",
    "所以<b>布招财局最直接的方法就是放人民币</b> —— 它是最直接代表物的象意。",
    "<b>戊代表的是钱</b>。一般我们可以放几百块钱：巽宫代表 4，可以放 <b>400 块钱</b>；天柱星代表 7，也可以用星代表的数字来放，放 <b>700 块钱</b>",
    "因为临<b>太阴</b>，所以我说放在<b>阴暗的角落</b>里面；又临<b>杜门</b>，最好就是角落里<b>看不见的地方</b>",
    "<b>丁</b>代表的是<b>打火机</b>，也代表着<b>红色</b>，所以我说可以放红色的打火机",
    "一般最常见的是，我们在布招财局的时候，我经常会<b>配合放银行卡</b> —— <b>中国银行的银行卡是最好的</b>，因为它代表最大的银行，也代表<b>值符</b>",
    "然后我们再在<b>纸上写一个\"进\"字</b>，配合这些物象放到这个方位上去",
    "<b>此局如果没有戊、有生门，一样可以布财局</b>。生门的话，我们可以结合宫内的信息来放：",
    "<table style=\"border-collapse:collapse;margin:6px 0;font-size:13px\"><tr><th style=\"border:1px solid var(--c-border);padding:3px 8px;background:var(--c-gray-bg)\">宫内有</th><th style=\"border:1px solid var(--c-border);padding:3px 8px;background:var(--c-gray-bg)\">可以放</th></tr><tr><td style=\"border:1px solid var(--c-border);padding:3px 8px\"><b>乙木加生门</b></td><td style=\"border:1px solid var(--c-border);padding:3px 8px\">真花</td></tr><tr><td style=\"border:1px solid var(--c-border);padding:3px 8px\"><b>再临六合</b></td><td style=\"border:1px solid var(--c-border);padding:3px 8px\">百合花</td></tr><tr><td style=\"border:1px solid var(--c-border);padding:3px 8px\"><b>癸水</b></td><td style=\"border:1px solid var(--c-border);padding:3px 8px\">红酒</td></tr><tr><td style=\"border:1px solid var(--c-border);padding:3px 8px\"><b>壬水</b></td><td style=\"border:1px solid var(--c-border);padding:3px 8px\">矿泉水</td></tr></table>",
    "这个大家要灵活取象。<b>放的数量可以参考星代表的数字</b> —— 如果临着天任星代表 8，你不可能放 8 瓶红酒，那你放一瓶红酒也是可以的。",
    "<b style=\"color:var(--c-gold)\">布局的时间</b>",
    "我在这里要特别说明一下<b>布局的时间</b>。",
    "通常我们布局的时间，比如这个局，可以是<b>巽宫的时间辰时、巳时</b>，也可以是<b>巽宫对面的时间</b>（就是戌时和亥时）—— 这个是我们最通常布局的时间。",
    "但是在实践当中，我发现还有一个时间可以用，就是<b>我们当下的时间</b>。比如说这个局，它是酉时（下午的 5 点到 7 点），我们这个局就可以在<b>当下这个局的时辰之内</b>、5 点到 7 点钟之间去布局，不局限于宫位的时间。",
    "<b>因为在此刻的时间当中，星门神、值符、值使这些都是在位的。</b>",
    "奇门有一千零八十个局。曾经有一本书，它有 1080 个局，以前我们布局的时候、去找局的时候，会经常到 1080 个局里面去找，但是有很多它是<b>过去时的局</b>。后来在实践当中发现，<b>我们当下时的局是最好的</b>。",
    "所以以后我们布局在选局的时候<b>要往后选</b> —— 比如你选三天以后的局，或者两天以后、七天以后的局，到了那个时间的时候去布，<b>不要选以前时间的局</b>。这个是我的经验之谈，分享给各位。",
    "所以大家可以从这个小小的招财局入手：我们可以 2 个小时 2 个小时地去选局，选后面的局，看哪一个局进字是临着戊或者生门的，我们就在那个局的时间去取宫内的象意去布局，来锻炼我们的实践能力。",
    "在实践当中，我们就会有很多的体会、经验和领悟。比如：",
    "我有一次布的财局是<b>景门临着天辅星</b>，我当时布的时候心里想：景门临天辅星，会不会是在<b>网络或者是授课</b>方面进账？后来证明就是在此方面进账",
    "还有一次我布局，那一次是<b>死门</b>，我当时想：会不会是在<b>法事</b>上面的进账？结果就是在做法事方面进的账",
    "所以<b>反推</b>：比如说最近我道家师傅要做法事了，那么我想在法事上面挣钱，那我就会去找<b>死门</b>这样的招财局去布。我们是可以举一反三、触类旁通的，也可以是反推过来的 —— <b>实践出真知</b>。",
    "像我们刚才的这个局，临<b>杜门、天柱星、太阴</b>，进财很有可能是因为有着某项的<b>技术</b>，或者有着某种方式、方法，或者是<b>公司单位的顶梁柱</b>这一方面来进的财。这个财也可能是一个<b>暗财</b>，比如说是一个额外的收入、可以不用上交给家里的这样的一种财。",
    "<b style=\"color:var(--c-gold)\">我布的第一个财局</b>",
    "我记得十六字诀学习之后，我布的第一个财局，当时是在<b>艮宫</b>：<b>九天、生门、遁干戊，还有乙木、丙火</b>。",
    "所以生门又临着乙木，我用的是<b>百合花</b>；因为<b>九天</b>，所以我放在了很高的地方；因为有<b>丙</b>的象意，我就放了一个<b>红色的陶瓷的花瓶</b>，里面放着百合花，放在了家里很高的位置上，写了一个<b>进</b>字。",
    "当时因为在艮宫，我在<b>寅时</b>的时候布的局 —— 那个时候我还没有悟出来用当下的时间，所以我用寅时的时间布的局，<b>我凌晨 3 点多钟起来布的局。当天上午就进账 6800。</b>",
    "后来我把这个局分享给我一个师妹，她也同样在<b>第二天的寅时</b>布了局，也进账了。",
    "<b style=\"color:var(--c-gold)\">布局的几个要领</b>",
    "<b>催财的操作</b>：可以把<b>客户年命宫里的象意物品，移到丰字或进字所在的宫位</b>；也可以<b>选一个时辰，让时家的年命外面正好临着丰字或者进字</b>，到那个时间切入。",
    "<b>布局的有效期</b>：<b>进财了就可以换局</b>；如果一直无效，<b>12 天左右换一个局</b>。",
    "<b>选局的时间</b>：亥时的局可不可以布？可以。这个局的亥时，六合是寅，我们就在<b>寅所在的艮宫</b>位置上排进字，宫里面有一个遁干戊，就可以布局 —— 虽然宫内的信息不是很好，但一样可以布局。",
    "<b>取几个象</b>：<b>星门神和天干地支，取三个就可以。</b> 像这个盘，我们就可以用打火机、银行卡、人民币，再加上一个\"进\"字。",
    "<b>银行卡</b>：任何一个招财局都可以配合银行卡，不管宫里有没有银行卡的信息 —— <b>丁既是打火机的象义，也是银行卡的象义</b>，没有现金的可以放银行卡。<b>但一定要写一个\"进\"字放在那里。</b>",
    "<b>金额</b>：艮宫为 8，所以放 800；也可以放 400（天辅星）。如果手里只有 100 元现金，可能就不放现金了，因为它没有占上宫位和星的数 —— 也可以试一下，大家灵活运用。",
    "<b>高低</b>：<b>九天</b>放高处，<b>九地</b>放低处，<b>值符</b>也可以放高处，<b>太阴</b>放阴暗的地方；没有这些特别的信息，正常放就可以。",
    "<b>位置</b>：卧室东北、客厅东北都可以，<b>客厅最好</b>；家里整体的寅位也可以。",
    "<b>用纸</b>：黄纸写黑字\"进\"就可以。",
    "<b>盒子可以不用</b>，直接取宫内的象意物品；戊的象义物品，课件里有对照。",
    "<b>不建议放夫妻合照</b>：合照取的是六合的象义，而这个局里<b>曲字也在宫内</b>，所以不放合照。",
    "<b>外盘要自己手排，没有软件</b> —— 软件上找不出来外面这些字。"
   ]
  },
  {
   "t": "八、七星灯（终身局）",
   "rows": [
    "我们再讲一个福利：<b>奇门局中的七星灯</b>。",
    "<b style=\"color:var(--c-gold)\">什么是七星灯</b>",
    "<b>天柱星所在的宫位，宫外的遁干为丁，称为七星灯。</b>",
    "在<b>坎、艮、震、巽</b>（阳宫）为<b>开灯</b>",
    "在<b>离、坤、乾</b>（阴宫）为<b>关灯</b>",
    "<b>终身局有七星灯为短寿。</b>",
    "虽然说临阴宫关上了不那么凶，但实际运用中，<b>有过三个求测者的局里出现七星灯，不论开关，都去世了</b>。杜门还好一些。",
    "七星灯运用在终身盘里的比较多一些。但是在实际的预测当中，我也曾经遇到过两个来问卦的，起出盘以后临七星灯，求测人后来都去世了。",
    "<b style=\"color:var(--c-gold)\">怎么看</b>",
    "我们看这个盘：在<b>离宫</b>里面<b>有天柱星</b>，外面的<b>遁干为丁</b>，才称为七星灯。",
    "<b>如果是里面的天盘干、地盘干是丁，不为七星灯。</b>",
    "七星灯<b>开着是不好的</b>。如果此宫里面有<b>杜门</b>，会<b>减弱</b>七星灯的力量。",
    "这个盘的终身盘的人，在 15 年脑梗偏瘫，在 17 年把胃切除了一半。",
    "<b>终身盘里出现七星灯的大多数会短寿或者身体不好。</b> 我验证了很多：抑郁症自杀的、30 多岁手术开刀的。",
    "<b style=\"color:var(--c-gold)\">化解方法</b>",
    "<b>用 32 开宣纸、朱砂</b>：在纸上画上盘，用<b>朱砂红笔</b>在<b>七星灯宫外</b>写 <b>\"玄九令印罡闭\"</b>，放枕头下或随身带，<b>一年后烧掉</b>。",
    "有了也没关系，我们可以化解一下。",
    "在坎艮震巽为阳宫为开灯，在离坤乾为阴宫为关灯。<b>七星灯喜欢关着</b>，所以在阴宫的时候力量会减弱 —— 但是有七星灯的话，终归还是不好的。",
    "<b style=\"color:var(--c-gold)\">只有宫外的丁才算</b>",
    "<b>宫内的天盘干、地盘干是丁，不算七星灯；只有宫外的遁干为丁才算。</b> 如果宫内宫外都有，那就代表外面已经有了，那肯定算。",
    "<b>看七星灯要用阴盘的终身局</b> —— 阳盘有的没有遁干。判断是不是伏吟局，看<b>天盘干和地盘干是不是一样</b>。",
    "<b>也不是所有人的终身盘里都有七星灯</b>：必须是终身局里<b>天柱星所在宫位的外圈有丁</b>才算，不是看年命落在哪个宫。",
    "<b>阳盘也可以用</b>，只是用来预测和做简单的布局。",
    "<b style=\"color:var(--c-gold)\">化解的细节</b>",
    "<b>这个化解法要带够一年</b>，一年之后烧掉，之后就不需要再戴了。<b>\"玄九令印罡闭\"这几个字是从上到下竖着写的</b>；用<b>黄纸朱砂</b>也可以，用惯了就都行。",
    "<b>这个外盘是自己手排的，不是软件排出来的。</b>",
    "有人问化解的验证效果：我们的命盘当中出现过七星灯，<b>在没有发凶之前用了这个化解方法，到现在没有发凶</b>。但也要清楚 —— <b>不是什么病都能化解的</b>。",
    "<b style=\"color:var(--c-gold)\">顺带说几个布局细节</b>",
    "<b>布财局</b>：戊<b>在内盘、外盘都可以布</b>，宫内宫外有戊都行。",
    "<b>一个局里住了两个人，催的是谁？</b> 两个人都可能进财，但<b>哪一个人的年命在此宫，哪一个人更应</b>。如果布的局宫里正好有自己的年命，最好<b>把年命的物品、信息体现出来</b>。比如今天我们布的这个局，宫里出现了三个年命：丁年命、庚年命、戊年命 —— 如果你是丁年命，就尽量把丁的物品体现出来；如果你是庚年命，就把庚的物品体现出来。<b>这样就等于你自己也在这个局当中了。</b>",
    "<b>六合</b>（第二种排法要用到）：<b>子与丑合、寅与亥合、卯与戌合、辰与酉合、巳与申合、午与未合。</b>",
    "<b style=\"color:var(--c-gold)\">文昌局</b>",
    "<b>景门代表学习。</b> 可以让<b>景门临着曲字</b>（曲代表文曲星）<b>去生小孩的年命</b>，这样来布局；<b>最好去生小孩的年命，在孩子自己的卧室里布这个局</b>。这些都是思路。",
    "但也不要把这件事神化，要放平心态 —— 还有其他各种因素在影响我们，比如阳宅、阴宅。如果其他方面有影响，奇门局的力量就会减弱。"
   ]
  },
  {
   "t": "九、断课与布局的补充",
   "rows": [
    "<b>盘外盘与盘内信息的关系</b>",
    "有人问：是不是十六字最终定性吉凶，而不是以宫内组合来定吉凶；星神干门是在十六字定了吉凶之后，才取象配合来用？传统门派是以宫内象的组合来定吉凶的，这是我们的区别所在。",
    "<b>盘外盘给我们提供了更多的信息，它可以跟盘内的信息融合来用。</b> 就像有的人会通灵一样，他就比我们多了一个渠道 —— 这个盘外盘，也等于给我们又多了一个渠道。",
    "<b>一个时辰能不能布多个局？</b>",
    "不能，磁场会乱。但两层楼、两夫妻各住一层，<b>分别在两个卧房同时布两个是可以的</b>。",
    "办公是大房间、多人集中办公的，<b>可以在自己工位那里布，也可以在自己家里布</b>。",
    "<b>布局最多动几个宫？</b>",
    "<b>最多三个。</b> 有些布局是需要 2～3 个宫的。像刚才说的那个就涉及到两个宫，有的时候还涉及到第三个宫，但是不能再多了。",
    "之前学残版的人给客户布的局会拉一个 PPT，告诉客户从这里拆、从那里移，基本上 9 个宫都动了 —— <b>那就等于没动一样</b>。最多只能动 3 个宫；如果所有的宫都动了，就跟所有的宫都没动一样。",
    "<b>讨债局的例子</b>（涉及三个宫）：",
    "我曾经讨债，人家是不承认这笔债的，因为没有欠条。后来我布了一个局，再找他的时候，他就同意还钱了。",
    "当时我是这样的：<b>让对方的年命克戊</b>，这样的话他就是要出钱的；<b>然后让这个戊来生着我</b>；并且<b>欠钱的人的年命宫也生着我的年命宫</b>。",
    "我举这个例子，只是想说明一下为什么有的时候会出现 3 个宫 —— 就是因为这个事情它涉及到 3 个宫。但是你不能再多了。",
    "<b>戊如果克着他，他有可能会没钱还你；他克着戊，他才会往外拿钱。</b> 所以有时候我觉得我学了奇门，还要去学一下逻辑学、推理学。因为我当时管他要钱，他不承认，所以我让他生着我，这样他对我有利，我们之间就会缓和。",
    "<b>关于格局</b>",
    "财局这种<b>单宫的布局不用考虑格局大象</b>；如果有特定的格局是可以考虑的 —— 比如<b>贼必来</b>这个格局，我们还有特定的物品，在布和合局的时候有的时候就会用到。",
    "因为我们用阴盘来布局多一些，<b>阴盘主要注重取象，格局方面考虑得少</b>，但是一些特定的格局也是可以考虑进去的。",
    "<b>布当下的局，与八字无关</b>（不是八字命）。终身局布局可以长期摆放，但<b>效果肯定没有当下的局的效果那么好</b>；作为一个家里的摆设，也可以那样去摆放。",
    "<b>单宫布局不用管空亡</b>；如果是用来<b>预测读取</b>，则看<b>填实、冲实的时间</b>应事。",
    "<b>「甲」怎么看？</b> —— <b>甲看值符。</b>",
    "<b>问病</b>：以问病的时间起局；如果问病时间没有，以你想看这件事的时间起。",
    "<b>股票、债券类的，什么代表比较灵？</b> —— <b>伤门。</b>",
    "<b>本命局里有七星灯，有没有吉利的一面？</b> —— <b>没有。</b>",
    "<b>一个小技法</b>：如果家里有病人的话，每一天可以起个局，<b>放一杯水在天心星的宫位</b>（后面第二天会讲完整的方法）。",
    "---"
   ]
  },
  {
   "t": "第二天 · 一、另外四个字：排法",
   "rows": [
    "我们下面来讲一下十六字诀当中的另外四个字。这四个字是排在<b>四维宫</b>，也就是<b>乾宫、艮宫、巽宫、坤宫</b>。",
    "排的时候，<b>以天冲星为例，阳顺阴逆</b>。",
    "<span style=\"color:var(--c-text-4)\">〔图〕图1】天冲星在震三宫，阴遁，逆排</span>",
    "我们看一下这个盘：<b>天冲星在震三宫</b>，因为它是<b>阴遁</b>的盘，所以我们是<b>逆着排</b>。逆着排的话，我们就把<b>雷、火、风、豹</b>这四个字按顺序逆着排 —— 就是从<b>艮宫</b>开始逆排下来的四个字。",
    "<b>四维宫这四个字，以天冲星来排。</b>",
    "<span style=\"color:var(--c-text-4)\">〔图〕图2】天冲星在震宫，阳遁，顺排</span>",
    "如果此局是<b>阳遁</b>的话，天冲星在震宫，我们就是<b>顺排</b>：雷字排在<b>巽宫</b>，火字排在<b>坤宫</b>，风字排在<b>乾宫</b>，豹字就排在<b>艮宫</b>。",
    "<b>如果天冲星落在四维宫上</b>，我们就在天冲星的那个位置上排第一个字，然后按照阳顺阴逆的方法排第二个字。比如说天冲星本身在艮宫，那我们就把<b>雷字排在艮宫</b>；如果是阳遁，我们就把<b>火字排在巽宫</b>，依次顺下去。"
   ]
  },
  {
   "t": "第二天 · 二、雷",
   "rows": [
    "第一个字<b>雷</b>，顾名思义，它就代表<b>声音</b>，代表<b>响亮</b>，代表<b>有名望的、有名气的、有名声的</b>，代表<b>一鸣惊人的</b>，也代表着<b>有声响的、吵闹的地方</b>。",
    "所以<b>雷字可以去布文昌局</b>，因为它代表一鸣惊人。在此宫位，我们结合宫内的信息，就可以去布文昌局。",
    "像我们有的人<b>修炼雷法</b>，我们就可以到这个雷的宫位，或者雷生着的宫位去修法做法。",
    "如果<b>临着开门或者临着时干</b>，代表这个<b>店铺比较有名气</b>，或者这个产品是大家众所周知的。",
    "<b>雷字如果临六合</b>的话，这个婚姻可能就是<b>有争吵</b>的。",
    "我教大家的是<b>思路</b>。这些字我们在实际的运用当中，可以去发散你的思维，更多地延伸它的含义 —— <b>实践出真知</b>。我们学以致用，把知识运用到实践当中，再从实践当中去验证知识。"
   ]
  },
  {
   "t": "第二天 · 三、火",
   "rows": [
    "<b>火字代表着一切跟文化、传媒、媒体有关系的东西或行业</b>。火也代表着<b>红红火火</b>。",
    "<b>如果临六合</b>，两个人可能就是正热恋、干柴烈火",
    "<b>年命临火</b>，代表这个人<b>性子比较急、风风火火</b>的",
    "<b>测疾病</b>的话，他可能就是<b>肝火比较旺</b>，或者有炎症、发烧",
    "<b>火的方位</b>也可以代表<b>厨房</b>的一些信息",
    "<b>火是炎上的</b>，也可以代表这件事情正在<b>发展和进步</b>当中",
    "那么在布局的时候，有一个思路：比如说疾病的话，我们一般看<b>天芮星</b>。如果<b>天芮星落在了金的宫位</b>（比如落在了乾宫），<b>临了这个火字</b>，这个火它就可以<b>克这个金的宫位</b> —— 那么我们在这个宫位当中去调疾病的话，就可以克制住这个疾病。",
    "我在这里说的是一个<b>思路</b>。如果你听得不太懂，可以多去琢磨一下，<b>不要生搬硬套</b>，而是要把这个思路举一反三、触类旁通，去运用到更多的布局当中去。"
   ]
  },
  {
   "t": "第二天 · 四、风",
   "rows": [
    "<b>风字代表的是传播、宣传、广告，也代表着快速。</b> 风也代表着<b>不稳定、不确定、墙头草</b>。",
    "<b>测一段感情，风临六合</b>，可能这段感情<b>来得快、去得也快</b>",
    "<b>如果年命临风</b>，这个人做事风风火火的；他可能像墙头草一样，做事也会有<b>犹豫不决</b>的信息",
    "<b>测疾病临风</b>的话，可能是<b>流行病</b>",
    "那我们如果想<b>做宣传、做销售</b>，可以到风的这个宫位去布",
    "风也可以代表着<b>消息、信息</b> —— 如果<b>临了腾蛇、玄武</b>，这个消息可能就是<b>假的、不真实的消息</b>",
    "风也可以代表着<b>风扇、空调</b>，那个方位就可能会有这样的物品",
    "如果<b>疾病临了风</b>，可能这个就是流行病、感冒、风寒、风湿",
    "其实每一个盘外盘的字都会代表着很多的信息、包含了很多的内容，那也需要我们在实践当中去挖掘、去验证、去实践。"
   ]
  },
  {
   "t": "第二天 · 五、豹",
   "rows": [
    "<b>豹字跟白虎是一样的</b>，代表着<b>凶猛</b>，代表着<b>不吉</b>，代表着<b>凶灾、伤灾</b>。也代表着<b>黑社会、公检法</b>。",
    "这个人的性格，他可能就会有一点<b>凶</b>。<b>临六合</b>的话，有可能有<b>家暴</b>。",
    "那我们在<b>预测衣服</b>的时候，她可能穿着<b>豹纹</b>儿的衣服。",
    "以上十六字都讲全了。剩下的要靠大家多复习、多实践、多验证。"
   ]
  },
  {
   "t": "第二天 · 六、符咒：玄九令印罡",
   "rows": [
    "我们在运用十六字诀的时候，也有<b>符咒</b>可以帮助、辅助我们来进行一些调理化解。",
    "<b>十二个字</b>：",
    "<div style=\"border-left:3px solid var(--c-gold);padding:2px 0 2px 8px;color:var(--c-text-4)\"><b>建　除　满　平　定　执　破　危　成　收　开　闭</b></div>",
    "我们经常会用这十二个字在符咒里面来进行化解：",
    "<table style=\"border-collapse:collapse;margin:6px 0;font-size:13px\"><tr><th style=\"border:1px solid var(--c-border);padding:3px 8px;background:var(--c-gray-bg)\">要化解的</th><th style=\"border:1px solid var(--c-border);padding:3px 8px;background:var(--c-gray-bg)\">用字</th><th style=\"border:1px solid var(--c-border);padding:3px 8px;background:var(--c-gray-bg)\">说明</th></tr><tr><td style=\"border:1px solid var(--c-border);padding:3px 8px\"><b>七星灯</b></td><td style=\"border:1px solid var(--c-border);padding:3px 8px\"><b>闭</b></td><td style=\"border:1px solid var(--c-border);padding:3px 8px\">用\"玄九令印罡闭\"，把这个七星灯闭上</td></tr><tr><td style=\"border:1px solid var(--c-border);padding:3px 8px\"><b>戊临了破字（要破财）</b></td><td style=\"border:1px solid var(--c-border);padding:3px 8px\"><b>收</b></td><td style=\"border:1px solid var(--c-border);padding:3px 8px\">用\"玄九令印罡收\"，把这个财收进来</td></tr><tr><td style=\"border:1px solid var(--c-border);padding:3px 8px\"><b>疾病的宫位</b></td><td style=\"border:1px solid var(--c-border);padding:3px 8px\"><b>除</b></td><td style=\"border:1px solid var(--c-border);padding:3px 8px\">用\"玄九令印罡除\"，把这个疾病除掉</td></tr><tr><td style=\"border:1px solid var(--c-border);padding:3px 8px\"><b>两个人的关系临了杜门</b></td><td style=\"border:1px solid var(--c-border);padding:3px 8px\"><b>开</b></td><td style=\"border:1px solid var(--c-border);padding:3px 8px\">用\"玄九令印罡开\"</td></tr><tr><td style=\"border:1px solid var(--c-border);padding:3px 8px\"><b>想让这件事成功</b></td><td style=\"border:1px solid var(--c-border);padding:3px 8px\"><b>成</b></td><td style=\"border:1px solid var(--c-border);padding:3px 8px\">用\"玄九令印罡成\"</td></tr></table>",
    "<b>举个例子</b>：前几天给一个打官司的人布了一个局 —— 就在他布局的<b>对面的宫位</b>，让他在布局的时候写一个 <b>\"玄九令印罡危\"</b>，在布局的时候<b>烧掉此符</b>。<b>危字代表吉祥的意思</b>；烧掉以后，<b>冲他的布局宫位，一冲便动</b>，然后布局的宫位再生着他年命，对他有利。是这样的来用符咒。",
    "<b style=\"color:var(--c-gold)\">符怎么做</b>",
    "我们平时布局的时候，这个符是怎么用呢？",
    "<b>第一种：放在葫芦里</b>",
    "我们用<b>长 7cm、宽 3cm 的黄纸墨书</b>，在上面写\"玄九令印罡\"，然后是我们需要的那个字。把这个符写上以后，我们把它放到<b>木头的、木质的那种真葫芦</b>里面，然后把葫芦<b>敞着口不封口</b>，放在我们要布局的那个宫位就可以了。",
    "<b>第二种：画在宣纸上</b>",
    "如果不想用葫芦的话也可以，像我们七星灯的方法一样：在<b>32 开的宣纸上把这个局画下来</b>，然后把\"玄九令印罡\"那个字（就像七星灯一样的方法）写在<b>要化解的那个宫位旁边</b>，把这张纸按照昨天教的方法<b>叠好</b>，放在那个宫位的方位也可以。",
    "<b>符的画法</b>：这个符就是这样画的，然后<b>符漂儿左边是 3 个圈儿，右边是 4 个圈儿</b> —— 这个注意一下。",
    "<b style=\"color:var(--c-gold)\">几个细节</b>",
    "<b>符纸的尺寸就是 3cm 宽、7cm 长</b>，不是只取 3 比 7 的比例。符里圈的画法：<b>上面是实圈、下面是空圈</b>（上实下空）。",
    "<b>土符没有另外的咒语。</b> 我们这个体系<b>大道至简</b>，没有太复杂的东西，大家不要过于纠结，也不要想得太复杂 —— 我们这个体系的<b>符咒比较少，一共就那么几道符</b>，其他都是按照易理来布局的。",
    "<b>建、除、满、平、定、执这一组字，是专门用来化解的</b>，不参与盘外盘的排法。",
    "<b>抄盘的时候，四柱一定要抄上，遁干也要放进去。</b> 另外注意一点：<b>我们这个遁干不写在盘外面，而是写在宫内的右上角。</b> 我们所有的排盘方式，包括跟软件上一样的盘，全部是<b>用手排的</b> —— 师父从来不用软件，而且本派有自己一套独特的排盘方法，需要自己手排。"
   ]
  },
  {
   "t": "第二天 · 七、化解白虎",
   "rows": [
    "今天上午答应教大家一个<b>化解白虎</b>的方法。",
    "化解白虎的时候，我们就用<b>红笔在纸上画这个符号</b>，放到<b>白虎的那个宫位的方位上</b>。",
    "<b>终身局里如果白虎在四害宫位，也可以用这个方法化解。</b>",
    "另外，如果某个宫位<b>盘内给的信息很好、能成功，但外盘临破或者散</b>，那就以不吉来断 —— <b>盘外盘定吉凶</b>，这个前面已经讲过。"
   ]
  },
  {
   "t": "第二天 · 八、皇帝出宫（终身局）",
   "rows": [
    "还有一个福利：<b>奇门当中的皇帝出宫</b>，跟奇门当中的七星灯差不多。",
    "<b>在终身盘当中，如果出现了皇帝出宫，也是代表短寿。</b>",
    "<b style=\"color:var(--c-gold)\">什么是皇帝出宫</b>",
    "<b>在我们的四维宫，也就是乾宫、艮宫、巽宫和坤宫，同时出现了木的信息</b> —— 比如<b>天冲星、天辅星、伤门、杜门、值符、六合、甲乙木</b>，这些属木的信息在<b>四维宫同时出现</b>，叫<b>皇帝出宫</b>。",
    "这个我验证过，<b>身边很少能有人有</b>，但是<b>张雨生和张国荣的八字里出现了</b>。",
    "<span style=\"color:var(--c-text-4)\">〔图〕图】两个终身盘（均出现皇帝出宫）</span>",
    "比如这是昨天我们七星灯的那个人 —— 这是我认识的一个人，他的命盘当中有七星灯，也有皇帝出宫。他的<b>巽宫、乾宫、坤宫三宫都有乙木</b>，然后他的<b>艮宫也有木的属性</b>（他的艮宫是天辅星，属木的），所以这个盘就是<b>皇帝出宫</b>。",
    "有一本古书上曾经写过\"皇帝出宫\"，但是光看书没有人懂是什么意思。所以，<b>老祖宗留下来的东西，它同样适用于我们现代的生活和社会。</b>",
    "<b style=\"color:var(--c-gold)\">怎么化解</b>",
    "<b>用土的符咒泄木</b> —— <b>用泄不用克，用金克木是不行的</b>。有人问能不能用火的符箓，<b>土的力量更大</b>，所以还是用土符。",
    "画符的时候，<b>最上端的那个\"土\"字不用写</b>。",
    "用<b>32 开宣纸墨书</b>，把符画到纸上之后，按照昨天视频教的叠法叠好，<b>随身携带一年</b>。我们这个体系的<b>符咒都不用盖章</b>；除了放到葫芦里的符咒可以按 3cm×7cm，其他都是 32 开宣纸，用这样的叠法。",
    "<b>只带一年</b>，不需要每年重新画一张带在身上。",
    "<b>七星灯和皇帝出宫如果都有，两个化解符可以同时带在身上</b>；化解之后，短寿的问题会得到改善。"
   ]
  },
  {
   "t": "第二天 · 九、治病一法：天心水",
   "rows": [
    "<b style=\"color:var(--c-gold)\">做法</b>",
    "如果家里有病人的话，每一天的时候，我们可以起个局：",
    "1. <b>放一杯水在天心星的宫位</b>。",
    "2. <b>放多长时间呢？就放该宫位所落的数</b> —— 比如天心星在<b>震宫就放 3 分钟，巽宫就放 4 分钟</b>，<b>乾宫放 6 分钟</b>（按后天八卦数）。",
    "3. <b>然后把这个水拿到\"克天芮星的那个宫位\"的方位去喝。</b>",
    "4. <b>喝几口，看此宫位所落星的数</b> —— 比如天柱星 7 口、天任星 8 口，<b>小口喝</b>。",
    "5. <b>在什么时间喝？</b> 比如是巳时起的局就在巳时喝，午时起的局就在午时喝。",
    "6. <b>连喝 3 天</b>，三天都是按第一天的时间喝。<b>纸杯里剩一点水倒入卫生间，纸杯扔掉。</b>",
    "7. <b>慢性病想长期喝，就每天起局</b>，按局显示的喝。",
    "<b>可以叠加</b>你们自己的咒语、剑指等各种加持。",
    "<b>举例</b>：此局在<b>艮宫放 8 分钟，到离宫喝，喝三口，辰时</b>。",
    "<b style=\"color:var(--c-gold)\">几个要点</b>",
    "<b>只用天心星</b> —— <b>天心星代表医药</b>。其他八星不能用。",
    "<b>\"克天芮星的宫位\"指的是宫与宫之间的相克</b>：比如天芮星在<b>震宫</b>（木），<b>金克木</b>，那么<b>兑宫和乾宫</b>这两宫都可以克天芮星 —— <b>去正西或西北喝</b>。",
    "<b>如果克天芮星的宫位有两个</b>，就结合宫内的信息，权衡用哪一个。",
    "<b>这个水不需要用阴阳水</b>；<b>不需要结合外盘</b>；<b>大小太极都可以用</b>（用整个房子的大太极和房间的小太极去定位都可以）；<b>远程起卦也可以用</b>。",
    "<b>效果</b>：像之前有人发烧、拉肚子，都用这个方法去给人家治过。我有一次生病三天吃药没好，后来<b>上午喝了水，下午就好了</b>。",
    "<b style=\"color:var(--c-gold)\">化解疾病的取用</b>",
    "<b>天芮星所在的宫位不要用破字或者散字去布</b> —— <b>可以用空字，和\"除\"字的符</b>，也就是在天芮星的宫位放一个\"玄九令印罡除\"的葫芦。我们有更直接、更简单的方法，就不要把简单的东西弄复杂了。",
    "<b>如果天芮星有庚，代表肿瘤</b>：这时<b>不能用散字 —— 用散字就扩散了</b>，要用<b>空字</b>。化解的时候<b>是去找一个局来布</b>，而不是把庚的意象拆出来摆到空位上 —— 找一个庚刚好在空的时间的局去做布局。",
    "<b>门开在某个地方纳气不好，怎么化解？</b> 我们只是给他<b>预测出来纳气了</b>，再往下就涉及到<b>风水</b>上面的东西了。<b>门是不可以挪走的</b> —— 以前有的师父教得连门都能挪走，我请教过师父，答案是不可以。我们移星换斗，<b>并不是所有的都能移走、都能换</b>，还是要<b>符合易理、符合常理</b>。",
    "<b>喝克天辅星的水能不能提高学习能力？</b> 没有这样用过 —— <b>学习跟喝水没有关系，吃药才跟喝水有关系。</b> 想学习好，可以到<b>景门生的位置</b>上去学习。",
    "<b>住校生催文昌</b>：<b>布局有限制，不好操作。</b>"
   ]
  },
  {
   "t": "第二天 · 十、两天课程的收尾",
   "rows": [
    "<b>选局的时间</b>：选当下的时辰，还是几天后的局？如果选的是<b>几天后的局，就要等到那一天的那个时辰再布</b> —— 是在这个时辰之内完成布局，不能超过，也不能提前。",
    "<b>排盘统一用北京时间</b>，不用真太阳时。<b>给国外的人布局也一样</b>：我曾经在国外给别人布过局，<b>用北京的时间起局，再换算成国外的时间</b> —— 国外那个时间，跟我北京起局的时间是同一个时间。",
    "<b>十六字诀与十二月将没有冲突。</b> 后面如果有机会再开课，可以给大家讲一下十二月将 —— <b>月将加占时，穿到奇门里边去断方位和人物，非常准确。</b>",
    "<b>不知道具体出生时间，就用不了终身盘。</b>",
    "<b>到这里，我们十六字诀，包括一些布局方法、化解、预测，就讲完了。</b>",
    "奇门的盘外盘有很多盘，这个是我们其中的一盘。<b>每一盘都有每一盘不同的功能，也有不同的易理在里面。</b> 它给我们的奇门打开了另一扇大门，让我们看到了包含在奇门之内、又置身于奇门之外的更大、更新的一个世界，也给了我们一些新的见识，丰富了我们的技法，给我们提供了更多的布局工具和方法，让我们在给客户和自己解决问题的时候，不是无从下手或者一筹莫展。",
    "但我还是要强调一点：<b>这个不是万能的，不是绝对的，不是百分之百的</b>。就像我们不可能说调了祖坟就可以长生不老、永不生病一样 —— 我们做法事也没有百分之百成功的，我们预测也没有百分之百正确的。所以凡事都没有绝对的，我们的这个布局也不会是绝对的和百分之百的。",
    "我只是想给更多的奇门爱好者和易学者，分享更多一些老祖宗传下来的真的东西。学易一场，让我们能够把流传几千年的东西，原封不动地、保持原汁原味地到我们手里，真的是非常难得的一件事情，也是难得的一个缘分和机缘。所以希望大家抱着一个<b>平和的心态</b>去布局、去运用。"
   ]
  }
 ]
};

/* ══════════════ 玄女十六字诀(盘外盘) ══════════════
   用"排法二": 以【时支的六合】起"进"字, 沿十二地支阳顺阴逆铺开十二字:
     进 曲 狱 丰 空 泣 欹 劫 散 破 灵 吾
   例(讲义图例): 时支酉 → 六合辰 → 阴遁逆排 → 辰=进, 卯=曲 … 巳=吾。

   与天门地户共用外圈那 12 个位置(waipan1~12), 所以两者必须互斥;
   切换时互相清场, 见各自的入口。 */
let _xnShow = false;
let _xn4Map = null;

function buildXuanNvMap(hourZhi, isYin) {
  try {
    const Z12 = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
    const ZI12 = ['进','曲','狱','丰','空','泣','欹','劫','散','破','灵','吾'];
    const si = Z12.indexOf(hourZhi);
    if (si < 0) return null;
    const HE = (window.QM && QM.HE) || [];      // 六合表(索引式): 子→丑 寅→亥 卯→戌 辰→酉 巳→申 午→未
    const start = HE[si];
    if (start === undefined) return null;
    const step = isYin ? -1 : 1;                // 阳顺阴逆
    const map = {};
    for (let i = 0; i < 12; i++) map[Z12[((start + step * i) % 12 + 12) % 12]] = ZI12[i];
    return map;
  } catch (e) { _logErr('xuanNv16', e && e.message); return null; }
}

/* 四维宫那四个字(雷火风豹): 以【天冲星】起 —— 从天冲所在宫的地支出发,
   沿十二地支阳顺阴逆走, 遇到的第一个四维宫起"雷", 再按同方向依次落到
   其余三个四维宫上。四维宫 = 巽4 坤2 乾6 艮8。 */
function buildXuanNv4Map(palaces, isYin) {
  try {
    const Z12 = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
    const Z2G = {子:1, 丑:8, 寅:8, 卯:3, 辰:4, 巳:4, 午:9, 未:2, 申:2, 酉:7, 戌:6, 亥:6};
    const SI4 = ['雷','火','风','豹'], WEI = [4, 2, 6, 8];
    if (!palaces) return null;
    // 找天冲星落宫
    let g0 = 0;
    const abbr = window.XING_ABBR || {};
    for (let g = 1; g <= 9; g++) {
      const x = palaces['gong' + g] ? palaces['gong' + g].xing : '';
      if (x && ((abbr[x] || x) === '冲' || x === '天冲')) { g0 = g; break; }
    }
    if (!g0) return null;
    const step = isYin ? -1 : 1;
    // 天冲宫的地支(四维宫取其一即可, 因为起点必落在本宫)
    const zs = Object.keys(Z2G).filter(z => Z2G[z] === g0);
    if (!zs.length) return null;
    const map = {};
    let n = 0;
    for (let i = 0; i < 24 && n < 4; i++) {
      const z = Z12[((Z12.indexOf(zs[0]) + step * i) % 12 + 12) % 12];
      const g = Z2G[z];
      if (WEI.indexOf(g) >= 0 && map[g] === undefined) { map[g] = SI4[n++]; }
    }
    return map;
  } catch (e) { _logErr('xuanNv4', e && e.message); return null; }
}

/* 长按按钮弹出说明(与宫位解释同款弹窗); 玄女16诀与金口诀共用这套机制。
   触屏与鼠标都绑; 长按触发后要抑制随后的 click, 否则会顺带把外盘切换掉。 */
let _xnPressTimer = null, _xnLongPressed = false;
function _bindXnLongPress() {
  _bindLongPress('btnXuanNv', showXuanNvHelp);
  _bindLongPress('btnJinKou', showJinKouHelp);
}
function _bindLongPress(id, fn) {
  const b = document.getElementById(id);
  if (!b || b._lpBound) return;
  b._lpBound = true;
  const begin = () => {
    _xnLongPressed = false;
    clearTimeout(_xnPressTimer);
    _xnPressTimer = setTimeout(() => { _xnPressTimer = null; _xnLongPressed = true; fn(); }, 550);
  };
  const end = () => { clearTimeout(_xnPressTimer); _xnPressTimer = null; };
  b.addEventListener('touchstart', begin, { passive: true });
  b.addEventListener('touchend', end);
  b.addEventListener('touchmove', end);
  b.addEventListener('touchcancel', end);
  b.addEventListener('mousedown', begin);
  b.addEventListener('mouseup', end);
  b.addEventListener('mouseleave', end);
}

/* 宫位长按(刻/心/山向/命理): 用 document 级事件委托, 只绑一次。
   不能用逐元素绑定 —— 宫格每次排盘都会重建(_bindActionButtons 也并非每次渲染都调用),
   漏绑就等于宫位彻底失去交互。委托同时天然适配盘型切换: 判定在事件触发时才做。 */
(function _bindGridLongPress() {
  if (window._gridLpBound) return;
  window._gridLpBound = true;
  let timer = null, suppressTimer = null;
  let suppressClick = false;   // 长按成立后压制随之而来的 click(触屏松手时浏览器仍可能派发)
  const findGong = e => {
    const el = (e.target && e.target.closest) ? e.target.closest('[id^="gong"]') : null;
    if (!el || !/^gong\d+$/.test(el.id)) return null;
    return el;
  };
  const begin = e => {
    const el = findGong(e); if (!el) return;
    const pt = parseInt(panType, 10);
    const isExplain = isLongPressPanType(pt);
    // 心盘(3) 也纳入监听: 长按 = 先后天三宫标记; 同时必须压掉长按后的 click,
    // 否则松手时那次 click 会照样打开宫位编辑器(与短按撞车)。
    if (!isExplain && pt !== 3) return;
    const gn = parseInt(el.id.replace('gong', ''), 10); if (!gn) return;
    // 注意: 这里**不能**重置 suppressClick —— 触屏松手后 WebView 会补发一套合成的
    // mousedown/mouseup/click, 那次 mousedown 会走到这里, 一重置就把标志清了,
    // 紧接着的 click 就拦不住(实测踩过)。
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      suppressClick = true;
      // 兜底: 万一 click 没派发(被系统手势吃掉), 1.5 秒后自动失效, 免得多拦一次真短按
      clearTimeout(suppressTimer);
      suppressTimer = setTimeout(() => { suppressClick = false; }, 1500);
      if (isExplain) {
        showPalace(gn);              // 时/刻/山向/命理 → 宫位解释(共用同一套)
      } else {
        toggleXianhouMark(gn);       // 心盘 → 先后天三宫标记(短按仍是宫位编辑器)
      }
    }, 550);
  };
  const end = () => { clearTimeout(timer); timer = null; };
  // 捕获阶段拦掉长按后的 click, 免得"长按"顺手把短按的行为也做了
  document.addEventListener('click', e => {
    if (suppressClick) { suppressClick = false; e.stopPropagation(); e.preventDefault(); }
  }, true);
  document.addEventListener('touchstart', begin, { passive: true });
  document.addEventListener('touchend', end);
  document.addEventListener('touchmove', end);
  document.addEventListener('touchcancel', end);
  document.addEventListener('mousedown', begin);
  document.addEventListener('mouseup', end);
})();

function showXuanNvHelp() { _showHelpDlg('xnHelpDlg', XN_HELP); }
function _showHelpDlg(dlgId, DATA) {
  try {
    const old = document.getElementById(dlgId);
    if (old) old.remove();
    const item = o => {
      const rows = [];
      if (o.y) rows.push('<div><b style="color:var(--wx-jin)">本义　</b>' + o.y + '</div>');
      if (o.c && o.c.length) rows.push('<div style="margin:9px 0 3px"><b style="color:var(--wx-jin)">组合断法</b></div>'
        + o.c.map(x => '<div style="margin:2px 0 2px 11px;text-indent:-11px">· ' + x + '</div>').join(''));
      if (o.f) rows.push('<div style="margin:9px 0 3px"><b style="color:var(--wx-jin)">方位取象</b></div><div style="margin-left:11px">' + o.f + '</div>');
      if (o.b) rows.push('<div style="margin:9px 0 3px"><b style="color:var(--wx-jin)">布局用法</b></div><div style="margin-left:11px">' + o.b + '</div>');
      return '<div style="margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--c-border)">'
        + '<div style="font-size:19px;font-weight:bold;color:var(--wx-jin);margin-bottom:6px">' + o.z
        + '<span style="font-size:11px;font-weight:normal;color:var(--c-text-4);margin-left:8px">' + o.wx + '</span></div>'
        + rows.join('') + '</div>';
    };
    const renderBlock = (bi, withId) => {
      const b = DATA.blocks[bi];
      const inner = b.items
        ? b.items.map(item).join('')
        : b.rows.map(x => '<div style="margin:3px 0 3px 11px;text-indent:-11px">· ' + x + '</div>').join('');
      return '<div' + (withId ? ' id="' + dlgId + '-s' + bi + '"' : '') + ' style="margin-bottom:' + (bi === DATA.blocks.length - 1 ? '8' : '22') + 'px">'
        + '<div style="font-size:16px;font-weight:bold;color:var(--c-text);border-left:3px solid var(--wx-jin);padding-left:8px;margin-bottom:10px">' + b.t + '</div>'
        + inner + '</div>';
    };
    // 教材条数上万, 一次性上屏会卡死移动端: lazy 时只渲染当前章, 由目录切换
    const body = DATA.lazy
      ? '<div id="' + dlgId + '-body">' + renderBlock(0, false) + '</div>'
      : DATA.blocks.map((b, bi) => renderBlock(bi, true)).join('');
    // 目录: DATA.toc 为真时在正文前插入可点击的章节索引
    let toc = '';
    if (DATA.toc) {
      const links = DATA.blocks.map((b, bi) =>
        '<span onclick="event.stopPropagation();' + (DATA.lazy
          ? 'window._helpGo(\'' + dlgId + '\',' + bi + ')'
          : '(function(d){var t=document.getElementById(\'' + dlgId + '-s' + bi + '\');' +
            'if(t)d.scrollTop=t.offsetTop-8;})(this.closest(\'div[style*=overflow-y]\'))') + '" ' +
        'style="display:inline-block;margin:2px 4px 2px 0;padding:3px 9px;border:1px solid var(--c-border);' +
        'border-radius:5px;font-size:12.5px;color:var(--c-text);cursor:pointer;white-space:nowrap">' + b.t + '</span>'
      ).join('');
      toc = '<div style="margin-bottom:16px;padding:10px;background:var(--c-gray-bg);border-radius:8px">' +
        '<div style="font-size:13px;font-weight:bold;color:var(--c-gold);margin-bottom:6px">目录</div>' +
        '<div style="line-height:2">' + links + '</div></div>';
    }
    const head = '<div style="text-align:center;margin-bottom:16px">'
        + '<div style="font-size:18px;font-weight:bold;color:var(--wx-jin)">' + (DATA.title || '') + '</div>'
        + '<div style="font-size:12px;color:var(--c-text-4);margin-top:4px;line-height:1.7">' + DATA.head + '</div></div>';
    const h = '<div id="' + dlgId + '" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center" onclick="this.remove()">'
      + '<div style="position:relative;background:var(--c-bg);border-radius:12px;padding:20px;max-width:520px;width:92vw;max-height:88vh;overflow-y:auto;font-size:14px;line-height:1.9;color:var(--c-text);cursor:default" onclick="event.stopPropagation()">'
      + '<span onclick="event.stopPropagation();document.getElementById(\'' + dlgId + '\').remove()" style="position:sticky;top:0;float:right;width:32px;height:32px;line-height:30px;text-align:center;background:var(--c-bg);border-radius:50%;font-size:18px;color:var(--c-text-4);cursor:pointer;z-index:10;margin:-8px -8px 0 0">&times;</span>'
      + head + toc + body
      + '</div></div>';
    const holder = document.createElement('div');
    holder.innerHTML = h;
    const root = holder.firstChild;
    root._data = DATA;
    root._renderBlock = renderBlock;
    document.body.appendChild(root);
  } catch (e) { _logErr('xnHelp', e && e.message); }
}

/* 教材(上万条)的分章切换: 只把目标章写进 body, 避免一次性渲染 */
window._helpGo = function (dlgId, bi) {
  const dlg = document.getElementById(dlgId);
  if (!dlg || !dlg._data || !dlg._renderBlock || !dlg._data.blocks[bi]) return;
  const box = document.getElementById(dlgId + '-body');
  if (box) box.innerHTML = dlg._renderBlock(bi, false);
  const sc = dlg.querySelector('div[style*="overflow-y"]');
  if (sc) sc.scrollTop = 0;
};
window.showXuanNvHelp = showXuanNvHelp;
function showJinKouHelp() { _showHelpDlg('jkHelpDlg', JK_HELP); }
/* 必须显式挂到 window: 长按绑定走的可能是内联 onclick, 它在全局作用域求值, 
   IIFE 内的函数声明不可见(此前为消 eslint no-undef 只留了函数声明, 导致全局找不到) */
window.showJinKouHelp = showJinKouHelp;

function xuanNv16() {
  if (_xnLongPressed) { _xnLongPressed = false; return; }   // 长按已弹说明, 不再切换外盘
  try {
    if (_tmdhShow) { _tmdhShow = false; clearWaipan(); }   // 与天门地户互斥
    if (_shenShow) { _shenShow = 0; clearWaipan(); }
    _xnShow = !_xnShow;
    _syncToggleBtns();
    const WPOF = {子:1,丑:2,寅:3,卯:4,辰:5,巳:6,午:7,未:8,申:9,酉:10,戌:11,亥:12};
    // 每次都按当前时支/阴阳遁重算 —— 换时辰后开关虽被复位, 手排一次也无妨
    const map = _xnShow ? buildXuanNvMap(window._shiZhi, !!window._isYin) : null;
    // 四维宫那四个字(雷火风豹)同属十六字诀, 一起显隐
    for (let g = 1; g <= 9; g++) {
      const el = document.getElementById('w4' + g);
      if (el) el.textContent = (_xnShow && _xn4Map && _xn4Map[g]) ? _xn4Map[g] : '';
    }
    for (const z in WPOF) {
      const el = document.getElementById('waipan' + WPOF[z]);
      if (!el) continue;
      if (map && map[z]) {
        el.textContent = map[z];
        el.style.fontSize = '15px';
        el.style.lineHeight = '18px';
        el.style.whiteSpace = 'nowrap';
        el.style.color = 'var(--wx-jin)';   // 十六字诀整体随五行金
      } else {
        el.textContent = '';
        el.style.fontSize = ''; el.style.lineHeight = ''; el.style.whiteSpace = '';
        el.style.color = '';
      }
    }
  } catch (e) { tip.innerHTML = '<span style=color:red>玄女16诀错误:' + e.message + '</span>'; }
}
window.xuanNv16 = xuanNv16;
window.buildXuanNvMap = buildXuanNvMap;   // 导出便于单独验证排法
window.buildXuanNv4Map = buildXuanNv4Map;

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
  _syncToggleBtns();
  for(let g = 1; g <= 9; g++) {
    if (g === 5) continue;
    let st = document.getElementById('stateTian'+g);
    let sd = document.getElementById('stateDi'+g);
    let idx = CS_IDX[g];
    if (!_stateShowing) { if (st) st.innerHTML = ''; if (sd) sd.innerHTML = ''; continue; }
    let p = window._palaces['gong'+g];
    if (!p || !p.tian) continue;
    let gan = p.tian[0];
    let states = CHANGSHENG[gan];
    if (states && idx !== undefined && st) st.innerHTML = '<span style="font-size:10px;color:var(--c-text-2)">'+states[idx]+'</span>';
    if (p.di && sd) {
      let dgan = p.di[0];
      let dStates = CHANGSHENG[dgan];
      if (dStates && idx !== undefined) sd.innerHTML = '<span style="font-size:10px;color:var(--c-text-2)">'+dStates[idx]+'</span>';
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
  let lbl = document.getElementById('zxjLabel');
  if (lbl) lbl.innerHTML = '';
  // 必须在 doPan 之前取: doPan 会重建 panWrap 并把 _jkShow 重置为 false,
  // 之后再判断就永远是 false, 联动代码不会执行(这正是"上下局不联动"的原因)
  const jkWasOpen = !!document.getElementById('jinkoujueDIV');
  doPan();
  // 上局/下局改了时间, 金口诀面板若原先开着就重新排一次(noScroll 避免跳回顶部)
  if (jkWasOpen) setTimeout(() => { try { toggleJinKouJue(true); } catch (e) { _logErr('panChange.jk', e && e.message); } }, 30);
}

// === 年月日时神将 ===
let SHENJIANG_NAMES = ['青龙','明堂','天刑','朱雀','金匮','天德','白虎','玉堂','天牢','玄武','司命','勾陈'];
let SHENJUE = [9,11,1,3,5,7,9,11,1,3,5,7];
let _shenShow = 0; // 0=无, 1=年, 2=月, 3=日, 4=时

function shen12(type) {
  // 互斥: 如果天门地户在显示，先关闭
  if (_tmdhShow) tianmenDihu();
  // 如果已显示同类型则关闭
  if (_shenShow === type) { _shenShow = 0; clearWaipan(); _syncToggleBtns(); return; }
  _shenShow = type;
  _syncToggleBtns();

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
  // 起始宫位对应的waipan起始索引
  let startIdx = (startGong - 1 + 12) % 12;
  for(let i = 0; i < 12; i++) {
    let wpIdx = ((startIdx + i) % 12) + 1;
    let el = document.getElementById('waipan'+wpIdx);
    if (el) {
      el.innerHTML = SHENJIANG_NAMES[i];
      el.style.fontSize = '12px';
      el.style.lineHeight = '15px';
      el.style.color = 'var(--c-text)';
    }
  }
}

function clearWaipan() {
  for(let wp = 1; wp <= 12; wp++) {
    let el = document.getElementById('waipan'+wp);
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
    el.style.border = '1px dashed var(--c-text-6)';
    el.style.padding = '2px 6px';
    el.focus();
  }
}

// === 持久存储: localStorage + Tauri文件(PC) + 导出/导入(Android通用) ===

async function _fsWrite(data) {
  if (!window.__TAURI__) return;
  try {
    const {writeTextFile, mkdir, exists} = window.__TAURI__.fs;
    const {documentDir} = window.__TAURI__.path;
    const dir = await documentDir() + STORAGE_DIR;
    if (!(await exists(dir))) await mkdir(dir, {recursive:true});
    await writeTextFile(dir+'/'+STORAGE_FILE, data);
  } catch(e){ _logErr('fsWrite', e && e.message); }
}

async function _fsRead() {
  if (!window.__TAURI__) return null;
  try {
    const {readTextFile, exists} = window.__TAURI__.fs;
    const {documentDir} = window.__TAURI__.path;
    const fp = await documentDir() + STORAGE_DIR + '/' + STORAGE_FILE;
    if (!(await exists(fp))) return null;
    return await readTextFile(fp);
  } catch(e) { return null; }
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
      // 仅当文件是"非空数组"才覆盖本地: 备份为空(写入失败/被清空)时覆盖会把主存存档抹掉
      if (Array.isArray(d) && d.length > 0) { localStorage.setItem(STORAGE_KEY, txt); return d; }
    } catch(e){ _logErr('syncFromFile', e && e.message); }
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
    sheet.style.cssText = 'position:fixed;bottom:0;left:50%;transform:translateX(-50%) translateY(100%);width:100%;max-width:600px;max-height:70vh;background:var(--c-bg);border-radius:14px 14px 0 0;z-index:10000;overflow-y:auto;transition:transform 0.3s ease;padding-bottom:env(safe-area-inset-bottom,0)';
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
  // 命理模块(panType 6): 保存时默认用「姓名」框的内容作事项名称
  if (panType === 6 && _mlVals && _mlVals.name) defaultName = _mlVals.name;
  let h = '<div style="padding:16px 16px 8px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
    '<span style="font-weight:bold;font-size:16px">保存排盘</span>' +
    '<span id="sheetCloseX" style="cursor:pointer;font-size:20px;color:var(--c-text-4)">&times;</span>' +
    '</div>' +
    '<div style="margin-bottom:8px"><span style="font-size:12px;color:var(--c-text-4)">输入事项</span></div>' +
    '<input id="sheetSaveName" placeholder="请输入事项名称" style="width:100%;padding:10px;border:1px solid var(--c-border);border-radius:8px;font-size:15px;outline:none;box-sizing:border-box" value="'+defaultName.replace(/"/g,'&quot;')+'" autofocus>' +
    '<div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">' +
    '<span id="sheetCancelBtn" style="cursor:pointer;padding:8px 16px;border-radius:8px;color:var(--c-text-2);font-size:14px">取消</span>' +
    '<span id="sheetSaveBtn" style="cursor:pointer;padding:8px 24px;border-radius:8px;background:var(--c-btn-bg);color:var(--c-btn-fg);font-size:14px">保存</span>' +
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
  }catch(e){ _logErr('doSave', e && e.message); }
}

function _doSave() {
  try {
  let inp = document.getElementById('sheetSaveName');
  let newTitle = (inp ? inp.value : '') || '未命名';
  let panWrap = document.getElementById('panWrap');
  if (!panWrap) { _closeSheet(); return; }
  let panHTML = panWrap.innerHTML;
  // 时间串不再从 #dateTime 读 —— 该行已删(公历与顶部选择器重复), 农历改由 renderPan
  // 存到 window._nongliFull。params 里本就有 year/month/day/hour/minute 完整参数。
  let _p2 = function(v){ return String(v).padStart(2,'0'); };
  let timeStr = Y+'-'+_p2(M)+'-'+_p2(D)+' '+_p2(hr)+':'+_p2(mn)+':00';
  if (window._nongliFull) timeStr += ' ('+window._nongliFull+')';
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
    // 心盘状态是模块闭包变量(_xpData/_xpBg*), 曾误读 window.* 导致存档恒为空
    record._xpData = JSON.parse(JSON.stringify(_xpData));
    record._xpBgSizhu = _xpBgSizhu;
    record._xpBgPalaces = JSON.parse(JSON.stringify(_xpBgPalaces));
    record._xpCalcJu = _xpCalcJu;
    record._xpBgKongWang = _xpBgKongWang;
    record._xpBgMaXing = _xpBgMaXing;
    record._xpBgXunShou = _xpBgXunShou;
    /* 这两个漏存过: _xpBgNongli 用于渲染农历, _xpBgIsYin 决定"以此宫推算全盘"的
       阴阳遁 — 后者初值恒为 true, 于是阳遁盘的历史记录会被整盘按阴遁重算。 */
    record._xpBgNongli = _xpBgNongli;
    record._xpBgIsYin = _xpBgIsYin;
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
    let modeLabels = {shi:'时盘', ke:'刻盘', xin:'心盘', shanxiang:'山向', chuanren:'穿壬', mingli:'命理'};
    let filtered = _saveMode ? saved.filter(r => r.mode === _saveMode) : saved;
    let h = '<div style="padding:16px 16px 0">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
      '<span style="font-weight:bold;font-size:16px">排盘历史 <span style="font-size:11px;color:var(--c-text-4)">('+filtered.length+'条'+(filtered.length!==saved.length?'/共'+saved.length+'条':'')+')</span></span>' +
      '<span style="display:flex;gap:10px;align-items:center">' +
      '<span id="sheetExport" style="cursor:pointer;color:var(--c-theme);font-size:12px">导出</span>' +
      '<span id="sheetImport" style="cursor:pointer;color:var(--c-theme);font-size:12px">导入</span>' +
      '<span id="sheetCloseX2" style="cursor:pointer;font-size:20px;color:var(--c-text-4)">&times;</span>' +
      '</span></div>';
    h += '<div id="sheetFilters" style="padding:6px 0;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--c-gray-bg);margin-bottom:4px">';
    let allModes = [{k:'',v:'全部'},{k:'shi',v:'时盘'},{k:'ke',v:'刻盘'},{k:'xin',v:'心盘'},{k:'shanxiang',v:'山向'},{k:'chuanren',v:'穿壬'}];
    allModes.forEach(m => {
      let isActive = _saveMode === m.k || (!m.k && !_saveMode);
      h += '<span class="sheetFilterBtn" data-mode="'+m.k+'" style="cursor:pointer;padding:2px 8px;border-radius:10px;font-size:12px;'+(isActive?'background:var(--c-btn-bg);color:var(--c-btn-fg)':'background:var(--c-bg);color:var(--c-text-2)')+'">'+m.v+'</span>';
    });
    h += '</div></div>';
    if (!filtered.length) {
      h += '<div style="padding:30px;color:var(--c-text-4);text-align:center">暂无记录</div>';
    } else {
      h += '<div style="padding:2px 16px 0;font-size:11px;color:var(--c-text-5);text-align:center">点击记录加载排盘</div>';
      h += '<div id="sheetHistoryList" style="padding:0 16px">';
      filtered.forEach((r, i) => {
        let origIdx = saved.indexOf(r);
        let modeLabel = modeLabels[r.mode] || r.mode || '时盘';
        let d = r.date ? new Date(r.date) : null;
        let dStr = d ? (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')) : '';
        h += '<div style="padding:10px 0;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--c-border);font-size:14px">' +
          '<span style="font-size:10px;color:#fff;background:var(--c-theme);padding:1px 5px;border-radius:3px;flex-shrink:0">'+modeLabel+'</span>' +
          '<span class="sheetLoadBtn" data-idx="'+origIdx+'" style="flex:1;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escHtml(r.title)+'</span>' +
          '<span style="font-size:10px;color:var(--c-text-5);flex-shrink:0">'+dStr+'</span>' +
          '<span class="sheetDelBtn" data-idx="'+origIdx+'" style="color:var(--c-text-6);cursor:pointer;font-size:18px;flex-shrink:0;padding:0 4px" title="删除">&times;</span></div>';
      });

      h += '</div>';
    }
    _openSheet(h);
    // 绑定事件
    let cx = document.getElementById('sheetCloseX2');
    let ex = document.getElementById('sheetExport');
    let im = document.getElementById('sheetImport');
    if (cx) cx.onclick = _closeSheet;
    if (ex) ex.onclick = function(){
      _closeSheet(); _doExport();
    };
    if (im) im.onclick = _importJSON;
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
  } catch(e) { _openSheet('<div style="padding:20px;color:var(--c-text-4)">加载失败</div>'); }
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
    let modeMap = {shi:1, ke:2, xin:3, shanxiang:4, chuanren:5, mingli:6};
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
      // 必须写回闭包变量: renderXinpan 读的是 _xpData, 写 window.* 不会被读取
      _xpData = JSON.parse(JSON.stringify(r._xpData));
      _xpBgSizhu = r._xpBgSizhu || '';
      _xpBgPalaces = r._xpBgPalaces || {};
      _xpCalcJu = r._xpCalcJu || '';
      _xpBgKongWang = r._xpBgKongWang || '';
      _xpBgMaXing = r._xpBgMaXing || '';
      _xpBgXunShou = r._xpBgXunShou || '';
      /* 老记录没有这两个字段: 用 undefined 判断, 缺省时保留当前值而不是硬置 false */
      if (r._xpBgNongli !== undefined) _xpBgNongli = r._xpBgNongli;
      if (r._xpBgIsYin !== undefined) _xpBgIsYin = r._xpBgIsYin;
      document.getElementById('xinpanPanel').style.display = '';
    }
    if (r.mode) _saveMode = r.mode;
    _renderBottomBar();
    _bindActionButtons();
    setTimeout(fixYinGanAlign, 50);
  } catch(e){ _logErr('loadSaved', e && e.message); }
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
  // Android Capacitor: 走分享通道
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share) {
    _shareTextFile(data).catch(e => { alert('分享失败: '+e.message); });
    return;
  }
  // PC/浏览器: Blob下载
  let blob = new Blob([data], {type:'application/json'});
  let a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'qimen_backup_'+new Date().toISOString().slice(0,10)+'.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

// Android: 写文件到缓存目录 → 用Share插件调起系统分享/保存
async function _shareTextFile(data) {
  let ts = new Date().toISOString().slice(0,10);
  let fn = 'qimen_'+ts+'.json';
  let FS = window.Capacitor.Plugins.Filesystem;
  let Share = window.Capacitor.Plugins.Share;
  // 先写缓存目录
  try { await FS.mkdir({path: '.', directory: 'CACHE', recursive: true}); } catch(e){ _logErr('cacheDir', e && e.message); }
  let wr = await FS.writeFile({path: fn, data: data, directory: 'CACHE'});
  // 用Share插件分享文件URI, 用户可选择保存到文件管理器
  if (wr && wr.uri) {
    await Share.share({title: '奇门排盘备份', files: [wr.uri], dialogTitle: '保存排盘数据'});
  } else {
    await Share.share({title: '奇门排盘备份', text: data, dialogTitle: '保存排盘数据'});
  }
}

async function _doExport() {
  let data = localStorage.getItem(STORAGE_KEY)||'[]';
  let ts = new Date().toISOString().slice(0,10);
  let fn = 'qimen_'+ts+'.json';
  // PC Tauri: 系统保存对话框
  if (window.__TAURI__ && window.__TAURI__.dialog) {
    try {
      const {save} = window.__TAURI__.dialog;
      const {writeTextFile} = window.__TAURI__.fs;
      const fp = await save({defaultPath: fn, filters: [{name:'JSON',extensions:['json']}]});
      if (fp) { await writeTextFile(fp, data); alert('已保存'); }
    } catch(e) { alert('导出失败: '+e.message); }
    return;
  }
  // Android Capacitor: 分享方式导出 (用户可选文件管理器保存)
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share) {
    try {
      await _shareTextFile(data);
    } catch(e) {
      alert('导出失败: '+e.message);
    }
    return;
  }
  // 浏览器回退: Blob下载
  _downloadBlob(data);
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
        /* 备份文件是设计成可以互相分享的, 导入内容因此不可信:
           html 字段会被整段回填进 innerHTML, 夹带 <script>/onerror 即可执行脚本。
           这里按白名单字段 + 长度做校验, 并丢弃夹带脚本的记录。 */
        d = d.filter(r => r && typeof r === 'object' && !Array.isArray(r));
        d.forEach(r => {
          if (typeof r.title === 'string') r.title = r.title.slice(0, 80);
          ['mode', 'time', 'date'].forEach(k => { if (typeof r[k] !== 'string') r[k] = ''; });
          if (typeof r.html === 'string') {
            if (r.html.length > 600000) r.html = '';
            else if (/<\s*script|onerror\s*=|onload\s*=|javascript:/i.test(r.html)) r.html = '';
          }
          if (r.params && typeof r.params !== 'object') r.params = null;
        });
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
  _bindXnLongPress();
  // 宫位短按统一走 onGongShortPress(内联已挂, 见 buildPaipanGrid); 这里只兜底
  // 给没挂上的宫位补一次绑定, 并清掉可能残留的旧 showPalace 直连。
  // 长按由 _bindGridLongPress 的 document 委托处理, 不在这里绑。
  if (parseInt(panType, 10) !== 5) {
    document.querySelectorAll('[id^="gong"]').forEach(g => {
      if (g._bound) return;
      const gn = parseInt(g.id.replace('gong', ''), 10);
      if (!gn) return;
      const cur = g.getAttribute('onclick') || '';
      if (cur.indexOf('onGongShortPress') < 0) g.onclick = () => onGongShortPress(gn);
      g._bound = true;
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
      bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;height:44px;background:var(--c-bg);border-top:1px solid var(--c-border);display:flex;align-items:center;justify-content:space-around;z-index:9999;padding-bottom:env(safe-area-inset-bottom,0);max-width:600px;margin:0 auto;pointer-events:auto';
      let md = document.getElementById('mainDIV') || document.body;
      if (md) md.appendChild(bar);
    }
    let saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    let cnt = _saveMode ? saved.filter(r => r.mode === _saveMode).length : saved.length;
    bar.innerHTML = '';
    let hb = document.createElement('span');
    hb.id = 'barHistoryBtn';
    hb.style.cssText = 'cursor:pointer;color:var(--c-text-2);font-size:14px;display:flex;align-items:center;gap:4px';
    hb.innerHTML = '<span style="font-size:16px">&#128196;</span>排盘历史'+(cnt>0?' ('+cnt+')':'');
    hb.addEventListener('click', function(e){e.stopPropagation();showSavedList();});
    let sb = document.createElement('span');
    sb.id = 'barSaveBtn';
    sb.style.cssText = 'cursor:pointer;color:var(--c-theme);font-size:14px;display:flex;align-items:center;gap:4px';
    sb.innerHTML = '<span style="font-size:16px">&#128190;</span>保存';
    sb.addEventListener('click', function(e){e.stopPropagation();savePan();});
    let ab = document.createElement('span');
    ab.id = 'barAboutBtn';
    ab.style.cssText = 'cursor:pointer;color:var(--c-text-2);font-size:14px;display:flex;align-items:center;gap:4px';
    ab.innerHTML = '<span style="font-size:16px">&#8505;</span>关于';
    ab.addEventListener('click', function(e){e.stopPropagation();showAbout();});
    bar.appendChild(hb);
    bar.appendChild(ab);
    bar.appendChild(sb);
  } catch(e){ _logErr('bottomBar', e && e.message); }
}

// === 关于弹窗 ===
const APP_VERSION = '1.4.0';
const APP_AUTHOR = '地天泰';
const APP_REPO = 'github.com/wrz1911/daojiayinpan';
function showAbout() {
  try {
    let old = document.getElementById('aboutDlg');
    if (old) old.parentNode.removeChild(old);
    let dlg = document.createElement('div');
    dlg.id = 'aboutDlg';
    dlg.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10002;display:flex;align-items:center;justify-content:center';
    // 快捷键提示只在精确指针(鼠标/触控板)下显示 —— 触屏设备没有物理键盘
    const kbdHint = (window.matchMedia && window.matchMedia('(pointer: fine)').matches)
      ? '<div style="font-size:12px;color:var(--c-text-3);margin-top:12px;padding-top:10px;border-top:1px solid var(--c-border);line-height:1.9">'
        + '<b>键盘快捷键</b><br>1–6 切换盘型 &nbsp;·&nbsp; ← → 调整时辰<br>'
        + 'Ctrl+S 保存 &nbsp;·&nbsp; Ctrl+H 排盘历史 &nbsp;·&nbsp; Esc 关闭弹窗</div>'
      : '';
    dlg.innerHTML = '<div style="background:var(--c-bg);border-radius:12px;padding:20px;max-width:340px;width:88%;text-align:center">' +
      '<div style="font-size:18px;font-weight:bold;margin-bottom:4px">道家阴盘奇门遁甲</div>' +
      '<div style="font-size:13px;color:var(--c-text-3);margin-bottom:14px">v' + APP_VERSION + '</div>' +
      '<div style="font-size:14px;line-height:1.9;color:var(--c-text)">作者: ' + APP_AUTHOR + '</div>' +
      '<div style="font-size:14px;line-height:1.9;color:var(--c-text)">开源项目地址:<br><span style="color:var(--c-theme)">https://' + APP_REPO + '</span></div>' +
      kbdHint +
      '<button id="aboutCloseBtn" style="margin-top:16px;padding:8px 32px;border:1px solid var(--c-border);border-radius:20px;background:var(--c-bg);color:var(--c-text);font-size:14px;cursor:pointer">关闭</button>' +
      '</div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.parentNode.removeChild(dlg); });
    document.getElementById('aboutCloseBtn').addEventListener('click', () => { dlg.parentNode.removeChild(dlg); });
  } catch(e){ _logErr('about', e && e.message); }
}

// === 桌面端键盘快捷键 (2026-09-16) ===
// 全部经 DOM 事件复用既有逻辑(盘型 radio 的 onclick、底栏按钮的 click、doPan),
// 不直接调用 IIFE 内部函数, 避免与既有绑定脱节。
// 不做设备判断: 触屏设备没有物理键盘不会误触, 外接键盘时同样受益。
(function _initKeyShortcuts() {
  try {
    // 关闭浮层弹窗。本项目现有两种不同实现, 判据需同时覆盖:
    //   a) 全屏遮罩 —— aboutDlg / jkHelpDlg / xnHelpDlg 是 z-index 10002 的
    //      全屏遮罩; 而排盘历史用 #sheetOverlay(z-index 200, 全屏) + #bottomSheet
    //      (z-index 10000, 仅 167px 高) 两个元素拼成;
    //   b) 高层级浮层 —— 面板本体(z-index >= 9999)。
    // 只处理 body 直属的 fixed 元素, 并排除顶栏 #topBar。
    function closeOverlays() {
      let n = 0;
      Array.prototype.slice.call(document.body.children).forEach(function (el) {
        if (el.id === 'topBar') return;
        const cs = getComputedStyle(el);
        if (cs.position !== 'fixed' || cs.display === 'none') return;
        const r = el.getBoundingClientRect();
        const full = r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.9;
        const highZ = parseInt(cs.zIndex, 10) >= 9999;
        if ((full || highZ) && el.parentNode) {
          el.parentNode.removeChild(el);
          n++;
        }
      });
      return n;
    }

    // 以"时"为单位前后移动, 越界自动跨日(到月边界即止)
    function stepHour(delta) {
      const h = document.getElementById('selHour'), d = document.getElementById('selDay');
      if (!h || !h.options.length) return;
      let i = h.selectedIndex + delta;
      if (i < 0 || i >= h.options.length) {
        if (!d || !d.options.length) return;
        const di = d.selectedIndex + (i < 0 ? -1 : 1);
        if (di < 0 || di >= d.options.length) return;
        d.selectedIndex = di;
        i = i < 0 ? h.options.length - 1 : 0;
      }
      h.selectedIndex = i;
      doPan();
    }

    document.addEventListener('keydown', function (e) {
      // Esc: 关闭弹窗(输入框聚焦时也要响应, 故置于最前)
      if (e.key === 'Escape') { if (closeOverlays()) e.preventDefault(); return; }
      // 文本类控件内不劫持按键(方向键要留给下拉框自身)
      const el = e.target, tag = el && el.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (el && el.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey) {
        if (e.shiftKey || e.altKey) return;
        const bid = { s: 'barSaveBtn', h: 'barHistoryBtn' }[String(e.key || '').toLowerCase()];
        if (bid) {
          const b = document.getElementById(bid);
          if (b) { b.click(); e.preventDefault(); }
        }
        return;
      }
      if (e.altKey) return;
      // 1-6 切换盘型
      if (e.key >= '1' && e.key <= '6') {
        const r = document.querySelector('input[name="panType"][value="' + e.key + '"]');
        if (r) { r.click(); e.preventDefault(); }
        return;
      }
      // 方向键调整排盘时间(±1 时辰)
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { stepHour(-1); e.preventDefault(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { stepHour(1); e.preventDefault(); }
    });
  } catch (e) { _logErr('keyShortcuts', e && e.message); }
})();

// === 宽屏两栏:让左列内容相对右列高度垂直居中 (2026-09-16) ===
// 纯 CSS 做不到: 左列区块是 #panWrap 的平级 grid item, 无法作为"一整组"居中
// (逐元素 align-self:center 只在其所在行内居中, 而行高恰等于内容高, 无余量)。
// 故按实测高度给左列首个元素补一个上偏移, 使左列内容块在右列高度内居中。
// 仅在两栏生效时运行(以 #panWrap 的 display:grid 判定), 窄屏完全不介入。
(function _initWideCenter() {
  try {
    const wrap = document.getElementById('panWrap');
    if (!wrap) return;
    let timer = null;

    function center() {
      if (getComputedStyle(wrap).display !== 'grid') return;   // 窄屏单栏: 不动
      const all = Array.prototype.slice.call(wrap.children);
      const vis = el => getComputedStyle(el).display !== 'none';
      const left = all.filter(el => vis(el) && getComputedStyle(el).gridColumnStart === '1');
      const right = all.find(el => vis(el) && getComputedStyle(el).gridColumnStart === '2');
      // 每次重算前先还原, 保留元素原本的内联 margin-top
      left.forEach(el => {
        if (el.dataset.qmMt === undefined) el.dataset.qmMt = el.style.marginTop || '';
        el.style.marginTop = el.dataset.qmMt;
      });
      if (!left.length || !right) return;
      const rs = left.map(el => el.getBoundingClientRect());
      const leftH = Math.max.apply(null, rs.map(r => r.bottom)) - Math.min.apply(null, rs.map(r => r.top));
      const rightH = right.getBoundingClientRect().height;
      const pad = (rightH - leftH) / 2;
      // 左列比右列高时不偏移(负值无意义), 留 4px 死区避免抖动
      if (pad > 4) left[0].style.marginTop = (parseFloat(left[0].dataset.qmMt) || 0) + pad + 'px';
    }

    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(center, 130);   // 排盘会连续改 DOM, 合并抖动
    }

    new MutationObserver(schedule).observe(wrap, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    schedule();
  } catch (e) { _logErr('wideCenter', e && e.message); }
})();

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
  '腾蛇':{key:'虚诈/变化/缠绕/灵异/失眠', desc:'虚诈之神。主欺骗反复、小人缠绕。影响神经睡眠。物象：藤蔓、绳索、花花绿绿衣物。'},
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
  const _pt = parseInt(panType, 10);
  if (_pt === 5) return;   // 穿壬盘无宫位解释(时盘/刻盘/心盘/山向/命理均有)
  if (_pt === 3) { showXinpanEditor(g); return; }
  let p = window._palaces ? window._palaces['gong'+g] : null;
  if (!p) return;

  /* 符号归一化 —— 四个模式共用一套解释数据的前提。
     山向/命理的 _palaces 直接引用引擎数据, 存的是**简称**('天'/'柱'/'生');
     时盘/刻盘的 _palaces 来自 renderPan 解析, 存的是**全名**('九天'/'天柱'/'生门')。
     解释表(SHEN_INFO/XING_INFO/MEN_INFO 与 *_FULL)的键都是全名, 简称会一路落到
     undefined —— 原先山向/命理的弹窗里全是 'undefined' 就是这个原因。 */
  function _toFull(val, ABBR) {
    if (!val || !ABBR) return val || '';
    if (ABBR[val] !== undefined) return val;                        // 本身已是全名
    for (let full in ABBR) { if (ABBR[full] === val) return full; } // 简称 → 反查全名
    return val;
  }
  const pShen = _toFull(p.shen, window.SHEN_ABBR);
  const pXing = _toFull(p.xing, window.XING_ABBR);
  const pMen  = _toFull(p.men,  window.MEN_ABBR);

  let gi = GONG_INFO[g] || {};
  let sh = SHEN_INFO[pShen] || {};
  let xi = XING_INFO[pXing] || {};
  let me = MEN_INFO[pMen] || {};
  let ag = p.anGan || '无';

  // 五行徽章配色: 引用主题变量, 暗色模式自动跟随(原先写死十六进制)
  let WX_CLR = {'金':'var(--wx-jin)','木':'var(--wx-mu)','水':'var(--wx-shui)','火':'var(--wx-huo)','土':'var(--wx-tu)'};
  function wxBadge(wx) { return wx ? '<span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;color:#fff;background:'+(WX_CLR[wx]||'#999')+'">'+wx+'</span>' : ''; }

  // 统一格式化：标签自动加粗，自动分行排版
  function fmtText(txt) {
    if (!txt) return '';
    let out = '';
    let lines = txt.split(/\n+/);
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
        out += '<div style="margin-top:8px"><b style="color:var(--c-theme)">'+numMatch[1]+'、</b><b>'+title+'</b>'+desc+'</div>';
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
        let idx = line.indexOf(kw);
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
    return '<span onclick="event.stopPropagation();switchPalaceTab(\''+id+'\',\''+tabId+'\')" id="tab_'+id+'" style="display:inline-block;padding:6px 14px;cursor:pointer;font-size:14px;border-radius:20px;margin:2px;'+(active?'background:var(--c-btn-bg);color:var(--c-btn-fg)':'background:var(--c-bg);color:var(--c-text-2)')+'">'+label+'</span>';
  }

  // 构建各标签页内容
  let tabId = 'palace_tab_' + g + '_' + Date.now();
  // 注意括号: '+' 优先级高于 '||', 不括起来会拼出 '八神·undefined' 且兜底永不生效
  let tabs = makeTab(tabId+'_gong', gi.name||'宫', true)
    + makeTab(tabId+'_shen', '八神·'+((window.SHEN_ABBR||{})[pShen] || pShen || '—'), false)
    + makeTab(tabId+'_xing', '九星·'+((window.XING_ABBR||{})[pXing] || pXing || '—'), false)
    + makeTab(tabId+'_men', '八门·'+((window.MEN_ABBR||{})[pMen] || pMen || '—'), false)
    + makeTab(tabId+'_gan', '干支', false)
    + makeTab(tabId+'_geju', '格局·'+window._wxSpan(((p.tian||'')[0]||'')+((p.di||'')[0]||'')), false);

  function contentGong() {
    let s = '<div style="font-size:20px;font-weight:bold">第'+g+'宫 '+gi.name+' '+wxBadge(gi.wx)+'</div>';
    s += '<div style="color:var(--c-text-4);margin:4px 0">'+gi.key+'</div>';
    if (window.GONG_FULL && window.GONG_FULL[g]) {
      s += fmtText(window.GONG_FULL[g].text);
    } else {
      s += '<p>'+gi.desc+'</p><p style="color:var(--c-text-4);font-size:12px">完整详解加载中…</p>';
      ensureGongDetail(function() {
        var el = document.getElementById(tabId + '_gong');
        if (el && window.GONG_FULL) el.innerHTML = contentGong();
      });
    }
    return s;
  }
  function contentShen() {
    let s = '<div style="font-size:18px;font-weight:bold">八神：'+pShen+'</div>';
    if (window.SHEN_FULL && window.SHEN_FULL[pShen]) s += fmtText(window.SHEN_FULL[pShen].text);
    else s += '<p>'+sh.desc+'</p>';
    if (window.WUCHENG_SHEN && window.WUCHENG_SHEN[pShen]) s += '<hr style="border:0;border-top:1px dashed var(--c-border);margin:12px 0">'+fmtText(window.WUCHENG_SHEN[pShen].text);
    return s;
  }
  function contentXing() {
    let s = '<div style="font-size:18px;font-weight:bold">九星：'+pXing+'</div>';
    if (window.XING_FULL && window.XING_FULL[pXing]) s += fmtText(window.XING_FULL[pXing].text);
    else s += '<p>'+xi.desc+'</p>';
    if (window.WUCHENG_XING && window.WUCHENG_XING[pXing]) s += '<hr style="border:0;border-top:1px dashed var(--c-border);margin:12px 0">'+fmtText(window.WUCHENG_XING[pXing].text);
    return s;
  }
  function contentMen() {
    let s = '<div style="font-size:18px;font-weight:bold">八门：'+pMen+'</div>';
    if (window.MEN_FULL && window.MEN_FULL[pMen]) s += fmtText(window.MEN_FULL[pMen].text);
    else s += '<p>'+me.desc+'</p>';
    if (window.WUCHENG_MEN && window.WUCHENG_MEN[pMen]) s += '<hr style="border:0;border-top:1px dashed var(--c-border);margin:12px 0">'+fmtText(window.WUCHENG_MEN[pMen].text);
    return s;
  }
  function contentGan() {
    let s = '<div style="font-size:18px;font-weight:bold">天干</div>';
    let tg0 = p.tian[0]||'', dg0 = p.di[0]||'';
    s += '<div style="margin:8px 0"><span style="font-weight:bold">天盘：</span>'+window._wxSpan(p.tian);
    if (window.GAN_FULL&&tg0&&window.GAN_FULL[tg0]) s += ' '+wxBadge(window.GAN_FULL[tg0].wx);
    s += '</div>';
    s += '<div style="margin:8px 0"><span style="font-weight:bold">地盘：</span>'+window._wxSpan(p.di);
    if (window.GAN_FULL&&dg0&&window.GAN_FULL[dg0]) s += ' '+wxBadge(window.GAN_FULL[dg0].wx);
    s += '</div>';
    s += '<div style="margin:8px 0"><span style="font-weight:bold">暗干：</span>'+window._wxSpan(ag)+'</div>';
    if (window.GAN_FULL&&tg0&&window.GAN_FULL[tg0]) s += '<details style="margin-top:8px"><summary style="font-weight:bold;cursor:pointer">天盘干详解('+p.tian[0]+')</summary>'+fmtText(window.GAN_FULL[tg0].text)+'</details>';
    if (window.GAN_FULL&&dg0&&dg0!==tg0&&window.GAN_FULL[dg0]) s += '<details style="margin-top:4px"><summary style="font-weight:bold;cursor:pointer">地盘干详解('+p.di[0]+')</summary>'+fmtText(window.GAN_FULL[dg0].text)+'</details>';
    if (window.WUCHENG_SANQI&&tg0&&window.WUCHENG_SANQI[tg0]) s += '<details style="margin-top:4px"><summary style="font-weight:bold;cursor:pointer;color:var(--c-theme)">三奇六仪('+p.tian[0]+')</summary>'+fmtText(window.WUCHENG_SANQI[tg0].text)+'</details>';
    return s;
  }
  function contentGeju() {
    let tg0 = p.tian[0]||'', dg0 = p.di[0]||'';
    let key = tg0 + dg0;
    let s = '<div style="font-size:18px;font-weight:bold">格局：'+key+'</div>';
    s += '<div style="color:var(--c-text-4);margin:4px 0">天盘'+tg0+' + 地盘'+dg0+'</div>';
    if (window.GEJU_81 && window.GEJU_81[key]) {
      s += fmtText(window.GEJU_81[key].text);
    } else {
      s += '<p style="margin:8px 0;color:var(--c-text-4)">该组合无对应格局记录（甲为值符，隐于旬首之下）</p>';
    }
    // Also show 天干克应 for 天盘干 as reference below
    if (window.WUCHENG_GANKEYING && tg0 && window.WUCHENG_GANKEYING[tg0]) {
      s += '<hr style="border:0;border-top:1px dashed var(--c-border);margin:12px 0">';
      s += '<details><summary style="font-weight:bold;cursor:pointer;color:var(--c-theme)">天干克应参考('+tg0+')</summary>'+fmtText(window.WUCHENG_GANKEYING[tg0].text)+'</details>';
    }
    return s;
  }

  let h = '<div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center" onclick="this.remove()">'
    + '<div style="position:relative;background:var(--c-bg);border-radius:12px;padding:20px;max-width:520px;width:92vw;max-height:88vh;overflow-y:auto;font-size:14px;line-height:1.9;color:var(--c-text);cursor:default" onclick="event.stopPropagation()">'
    + '<span onclick="event.stopPropagation();let p=this;while(p){if(p.style&&p.style.position==\'fixed\'){p.remove();break;}p=p.parentNode;}" style="position:sticky;top:0;float:right;width:32px;height:32px;line-height:30px;text-align:center;background:var(--c-bg);border-radius:50%;font-size:18px;color:var(--c-text-4);cursor:pointer;z-index:10;margin:-8px -8px 0 0">&times;</span>'
    + '<div id="'+tabId+'_tabs" style="text-align:center;margin-bottom:12px;border-bottom:1px solid var(--c-border);padding-bottom:10px">'+tabs+'</div>'
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
    let allT = container.querySelectorAll('[id^="tab_"]'); for(let t=0;t<allT.length;t++) { allT[t].style.background='var(--c-gray-bg)'; allT[t].style.color='var(--c-text-2)'; }
    // 显示目标
    let el = container.querySelector('#'+id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    if (el) el.style.display='block';
    let tb = container.querySelector('#tab_'+id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    if (tb) { tb.style.background='var(--c-theme)'; tb.style.color='#fff'; }
  };

  document.body.insertAdjacentHTML('beforeend', h);
}

// === 心盘自动推算：根据阴遁/阳遁和锚点宫推算全盘 ===

function autoFillXinpan(anchorGong) {
  try {
  let d = _xpData[anchorGong];
  if (!d || !d.di || !d.tian || !d.shen) {
    return;
  }
  let anchorSaved = {shen:d.shen||'',tian:d.tian||'',tian2:d.tian2||'',di:d.di||'',di2:d.di2||'',xing:d.xing||'',men:d.men||''};
  let GAN = ['戊','己','庚','辛','壬','癸','丁','丙','乙'];

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
  let isYin = xpGetYinYang();
  if (srcGong3 === 5) srcGong3 = isYin ? 2 : 8;

  // 伏吟:时干加中宫→寄坤,沿飞序排列暗干
  if (isFuYin) {
    let jiGong = 2; // 始终寄坤2
    let startGanIdx = GAN.indexOf(anGanStart);
    if (startGanIdx >= 0) {
      let zhongIdx2 = fwDi.indexOf(5); // 中宫在飞序中的位置
      let jiIdx2 = fwDi.indexOf(jiGong); // 寄宫在飞序中的位置
      let skipSteps = (jiIdx2 - zhongIdx2 + 9) % 9; // 中宫到寄宫的飞步数
      let jiFlyGan = GAN[(startGanIdx + skipSteps) % 9]; // 寄宫飞序分配值
      anGanMap[jiGong] = (jiFlyGan||'') + anGanStart; // 飞序值+寄干
      for(let ai = 1; ai < 9; ai++) {
        let agong = fwDi[(jiIdx2 + ai) % 9];
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

  let ov = window._xpOverlay || document.getElementById('xpOverlay');
  if (ov) ov.style.display = 'none';
  window._xpEditGong = 0;
  renderXinpan(true);
  } catch(e){ _logErr('autoFillXinpan', e && e.message); }
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
  let isYin = xpGetYinYang();
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

  let old = document.getElementById('xpJuSelect');
  if (old) old.parentNode.removeChild(old);

  let dlg = document.createElement('div');
  dlg.id = 'xpJuSelect';
  dlg.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1001;display:flex;align-items:center;justify-content:center';
  dlg.innerHTML = '<div style="background:var(--c-bg);border-radius:12px;padding:16px;max-width:320px;width:90%;text-align:center">' +
    '<div style="font-size:15px;margin-bottom:4px">坤2宫地盘干 戊</div>' +
    '<div style="font-size:13px;color:var(--c-text-3);margin-bottom:12px">请选择局数（中5寄坤2宫）</div>' +
    '<button id="xpJuBtn2" style="display:block;width:100%;padding:10px;margin:6px 0;border:1px solid var(--c-theme);border-radius:8px;background:var(--c-theme-bg);color:var(--c-theme);font-size:15px;cursor:pointer">'+ju2Label+'</button>' +
    '<button id="xpJuBtn5" style="display:block;width:100%;padding:10px;margin:6px 0;border:1px solid var(--c-border);border-radius:8px;background:var(--c-bg);color:var(--c-text);font-size:15px;cursor:pointer">'+ju5Label+'</button>' +
    '</div>';
  document.body.appendChild(dlg);

  document.getElementById('xpJuBtn2').addEventListener('click', () => {
    _xpCalcJu = yinYangLabel + '2局';
    _xpData[2].di2 = jiGan2;
    dlg.parentNode.removeChild(dlg);
  });
  document.getElementById('xpJuBtn5').addEventListener('click', () => {
    _xpCalcJu = yinYangLabel + '5局';
    _xpData[2].di = kunGan5;
    _xpData[2].di2 = gan;
    dlg.parentNode.removeChild(dlg);
  });
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.parentNode.removeChild(dlg); });
}

// === 心盘宫殿编辑器 ===
	function showXinpanEditor(g) {
	  window._xpEditGong = g;
	  let d = _xpData[g] || {};
	  let overlay = document.getElementById('xpOverlay');
	  if (!overlay) {
	    overlay = document.createElement('div');
	    overlay.id = 'xpOverlay';
	    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);z-index:999;display:flex;align-items:center;justify-content:center';
	    overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.style.display = 'none'; window._xpEditGong = 0; renderXinpan(true); } });
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
	  let h = '<div id="xpEditorCard" style="background:var(--c-bg);border-radius:12px;padding:14px;max-width:380px;width:92%;max-height:85vh;overflow-y:auto">';
	  h += '<div style="font-weight:bold;font-size:17px;text-align:center;margin-bottom:10px">'+GONG_NAMES[g]+'宫 编辑</div>';
	  for(let ci = 0; ci < cats.length; ci++) {
	    let cat = cats[ci];
	    let curVal = d[cat.key] || '';
	    h += '<div style="font-size:12px;color:var(--c-text-3);margin-bottom:2px">'+cat.label+'</div>';
	    h += '<div class="xp-btn-group" data-cat="'+cat.key+'" style="margin-bottom:8px">';
	    for(let oi = 0; oi < cat.opts.length; oi++) {
	      let val = cat.opts[oi];
	      let sel = (curVal === val) ? 'background:var(--c-btn-bg);color:var(--c-btn-fg);border-color:var(--c-theme)' : 'background:var(--c-bg);border-color:var(--c-border)';
	      h += '<span class="xp-btn" data-cat="'+cat.key+'" data-val="'+val+'" style="display:inline-block;padding:6px 12px;margin:2px;border:1px solid;border-radius:16px;font-size:14px;cursor:pointer;'+sel+'">'+val+'</span>';
	    }
	    h += '</div>';
	  }
	  h += '<div style="text-align:center;margin:8px 0">';
	  h += '<span id="xpAutoFillBtn" style="display:inline-block;padding:8px 20px;background:var(--c-btn-bg);color:var(--c-btn-fg);border-radius:20px;font-size:14px;cursor:pointer">以此宫推算全盘</span>';
	  h += '</div>';
	  h += '<div style="text-align:center"><span id="xpCloseBtn" style="font-size:13px;color:var(--c-text-3);cursor:pointer">关闭</span></div>';
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

	    // 重置同组所有按钮样式
	    let group = btn.parentElement;
	    let siblings = group.querySelectorAll('.xp-btn');
	    for(let si = 0; si < siblings.length; si++) {
	      siblings[si].style.cssText = 'display:inline-block;padding:6px 12px;margin:2px;border:1px solid var(--c-border);border-radius:16px;font-size:14px;cursor:pointer;background:var(--c-bg)';
	    }
	    // 高亮选中按钮
	    btn.style.cssText = 'display:inline-block;padding:6px 12px;margin:2px;border:1px solid var(--c-theme);border-radius:16px;font-size:14px;cursor:pointer;background:var(--c-btn-bg);color:var(--c-btn-fg)';

	    // 坤2宫地盘干戊选择后弹出局数选择
	    if (g === 2 && catKey === 'di' && val === '戊') {
	      showJuSelectForKun2(val);
	    }
	  });

	  // 关闭按钮
	  let closeBtn = document.getElementById('xpCloseBtn');
	  if (closeBtn) {
	    closeBtn.addEventListener('click', () => {
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
  let div=document.getElementById('xiangjuDIV');
  if(!div){div=document.createElement('div');div.id='xiangjuDIV';div.style.cssText='margin-top:12px';
    let result=document.getElementById('result');if(result)result.appendChild(div);}
  if(!noScroll&&div.style.display==='block'){div.style.display='none';div.innerHTML='';return;}

  let sxDeg=_xjuDegSaved?parseInt(_xjuDegSaved)||0:parseInt(document.getElementById('selShanXiangDeg').value)||0;if(!_xjuDegSaved)_xjuDegSaved=String(sxDeg);
  let baseYear=new Date().getFullYear();let yearOff=0;let yrRadios=document.getElementsByName('xjuYear');for(let ri=0;ri<yrRadios.length;ri++){if(yrRadios[ri].checked){yearOff=parseInt(yrRadios[ri].value)||0;break;}}let sxYear=baseYear+yearOff;
  sxDeg=((sxDeg%360)+360)%360;

  let parts=[];
  _expectedPals=[];

  // 山向排盘计算已下沉到 engine(window.shanxiangChart), 此处只做 UI 渲染
  let items = window.shanxiangChart(sxDeg, sxYear);
  for (const it of items) {
    let { sxName, degStart, degEnd, sxShiZhuParts, sxHq, juLabel, xunShouGZ, kongWangStr, maStr, maPosId, zhiFu, zhiShi, palsT, kongGongsT, _exp } = it;
    _expectedPals.push(_exp);
    recalcColors(palsT);

    let agFn= g => {let a=palsT['gong'+g];return a&&a.anGan?window._anGanColor?window._anGanColor(a.anGan,g):a.anGan:'';};
    let csFn=window._colorSpan|| (v => {return v||'';});
    let gridHTML=buildPaipanGrid(palsT,kongGongsT,maPosId,agFn,{colorSpan:csFn, noClick:true});
    let html='<style>.xj-head #tdTitle td{color:var(--c-gold)}.xj-head #itemTitle{color:var(--c-gold);line-height:30px}.xj-head #dTitle{width:16%;color:var(--c-gold)}</style>'+
      '<div id="panHead"><TABLE class="pan xj-head" id="headTable">'+
      '<TR><TD id="itemTitle">度数</TD><TD colspan="3">'+sxName+' '+degStart+'～'+degEnd+'°</TD><TD>'+sxYear+'年</TD></TR>'+
      '<TR><TD id="dTitle">干支</TD><TD class="sizhu">'+window._wxSpan(sxShiZhuParts[0])+'</TD><TD class="sizhu" style="font-weight:bold">'+window._wxSpan(sxShiZhuParts[1])+'</TD><TD>黄泉<b>'+sxHq+'</b></TD><TD>'+juLabel+'</TD></TR>'+
      '<TR id="tdTitle"><TD>旬首</TD><TD>值符</TD><TD>值使</TD><TD>空亡</TD><TD>马星</TD></TR>'+
      '<TR><TD>'+window._wxSpan(xunShouGZ)+'</TD><TD>天'+zhiFu+'星</TD><TD>'+zhiShi+'门</TD><TD>'+window._wxSpan(kongWangStr)+'</TD><TD>'+window._wxSpan(maStr)+'</TD></TR>'+
      '</TABLE></div>'+gridHTML;
    html=html.replace(/<TABLE[^>]*id="btnTable1"[^>]*>[\s\S]*?<\/TABLE>/gi,'');
    html=html.replace(/<div[^>]*id="yixinghuandouDIV"[^>]*><\/div>/gi,'');
    parts.push('<div class="xj-pan" style="margin:8px 0">'+html+'</div>');
  }
  let ui='<div style="padding:6px 0;display:flex;align-items:center;gap:6px;flex-wrap:wrap">';
ui+='<span style="font-size:13px;color:var(--c-text-2)">年:</span>';
ui+='<label style="font-size:13px;cursor:pointer;margin:0"><input type="radio" name="xjuYear" value="0" checked onchange="refreshXiangJu()" style="vertical-align:middle"> 今年</label>';
ui+='<label style="font-size:13px;cursor:pointer;margin:0"><input type="radio" name="xjuYear" value="1" onchange="refreshXiangJu()" style="vertical-align:middle"> 明年</label>';
ui+='<label style="font-size:13px;cursor:pointer;margin:0"><input type="radio" name="xjuYear" value="2" onchange="refreshXiangJu()" style="vertical-align:middle"> 后年</label>';
ui+='<span style="font-size:13px;color:var(--c-text-2);margin-left:8px">度数:</span>';
ui+='<input id="xjuDeg" class="sel-date" style="width:55px" type="number" min="0" max="359" value="'+sxDeg+'" tabindex="-1" onchange="let v=parseInt(this.value);if(isNaN(v)||v<0){this.value=0;}else if(v>359){this.value=359;}refreshXiangJu();">';
ui+='<span onclick="refreshXiangJu()" style="display:inline-block;padding:4px 14px;font-size:13px;cursor:pointer;border:1px solid var(--c-theme);color:var(--c-theme);border-radius:4px;background:var(--c-bg)">更改</span>';
ui+='</div>';
div.innerHTML=ui+parts.join('');
  // 山向盘禁用宫位点击解释
  div.querySelectorAll('[id^="gong"]').forEach(x => {x.onclick=null;x.style.cursor='default';});
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
  if(!noScroll)setTimeout(() => {let btn=document.getElementById('btnXiangJu');if(btn){let top=btn.getBoundingClientRect().top+window.pageYOffset;let offset=34;/* 顶部模式栏高度 */window.scrollTo({top:top-offset,behavior:'smooth'});}},200);
  // Re-align after display: square gongs, row sync, and yinGan positions
  setTimeout(() => {
    div.querySelectorAll('.xj-pan').forEach(pan => {
      // Square gongs
      if(needJsSquare())[4,9,2,3,7,8,1,6].forEach(g => {let el=pan.querySelector('#gong'+g);if(el){let w=el.getBoundingClientRect().width;if(w>0)el.style.height=w+'px';}});
      // Row height sync
      let pRows=pan.querySelectorAll('#pan tr'),lRows=pan.querySelectorAll('#leftTable tr'),rRows=pan.querySelectorAll('#rightTable tr');
      for(let i=0;i<3&&i<pRows.length;i++){let rh=pRows[i].getBoundingClientRect().height;if(rh>0){if(lRows[i])lRows[i].style.height=rh+'px';if(rRows[i])rRows[i].style.height=rh+'px';}}
      // YinGan alignment: left side (gong4,3,8) align to tian, right side (gong2,7,6) align to xing
      [4,3,8].forEach(g => {let y=pan.querySelector('#yinGan'+g),t=pan.querySelector('#tian'+g),go=pan.querySelector('#gong'+g);if(y&&t&&go){y.style.paddingTop=Math.max(0,t.getBoundingClientRect().top-go.getBoundingClientRect().top)+'px';y.style.textAlign='right';y.style.verticalAlign='top';y.style.fontSize='15px';y.style.lineHeight='25px';y.style.color='var(--c-text)';}});
      [2,7,6].forEach(g => {let y=pan.querySelector('#yinGan'+g),x=pan.querySelector('#xing'+g),go=pan.querySelector('#gong'+g);if(y&&x&&go){y.style.paddingTop=Math.max(0,x.getBoundingClientRect().top-go.getBoundingClientRect().top)+'px';y.style.textAlign='left';y.style.verticalAlign='top';y.style.fontSize='15px';y.style.lineHeight='25px';y.style.color='var(--c-text)';}});
      let y9=pan.querySelector('#yinGan9'),y1=pan.querySelector('#yinGan1');
      if(y9){y9.style.verticalAlign='bottom';y9.style.fontSize='15px';y9.style.color='var(--c-text)';}
      if(y1){y1.style.verticalAlign='top';y1.style.fontSize='15px';y1.style.color='var(--c-text)';}
    });
  },50);
  // Self-verification: compare rendered DOM against expected paipanrest data
}


function refreshXiangJu(){
  let div=document.getElementById('xiangjuDIV');if(!div)return;
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


let _mlVals={name:'',gender:'男'};
function doMingli(){
  try{
    let tip=document.getElementById("tip");if(tip)tip.innerHTML="";
    let sxIn=document.getElementById("shanxiangInputs");if(sxIn)sxIn.style.display="none";
    let crIn=document.getElementById("crInputs");if(crIn)crIn.style.display="none";
    let zxj2=document.getElementById("zxjSpan");if(zxj2)zxj2.style.display="none";
    let xp=document.getElementById("xinpanPanel");if(xp)xp.style.display="none";
    document.getElementById("result").style.display="block";
    // 输入面板(出生时间复用顶部选择器, 这里只放性别/年命)
    if(!document.getElementById("mlInputs")){
      let d=document.createElement("div");d.id="mlInputs";
      let pw=document.getElementById("panWrap");
      if(pw&&pw.parentNode)pw.parentNode.insertBefore(d,pw);
    }
    let box=document.getElementById("mlInputs");
    box.style.display="block";
    // ★ 先取走现有输入再重建面板 —— 否则重建会把用户正在输入的内容清空
    //   (穿壬的 crInputs 也是这个模式, 照它写)
    {
      let pN=document.getElementById("mlName"), pG=document.getElementById("mlGender");
      if(pN) _mlVals.name=pN.value;
      if(pG) _mlVals.gender=pG.value;
    }
    box.innerHTML=window.renderMingliInputs?window.renderMingliInputs(_mlVals):"";
    let gEl=document.getElementById("mlGender"),nEl=document.getElementById("mlName");
    _mlVals={name:nEl?nEl.value:'',gender:gEl?gEl.value:'男'};
    let data=window.mingliChart({year:Y,month:M,day:D,hour:hr,minute:mn,
      name:_mlVals.name,gender:_mlVals.gender});
    window._mlData=data;   // 供按钮 onclick="mingliBtn(n, window._mlData)" 取用
    document.getElementById("panWrap").innerHTML=window.renderMingli(data,null);
    // 首屏填充当前大运的流年(进入页面即显示当前运对应的 10 个流年)
    if(window.mingliYun) window.mingliYun(data.yunIdx||0, data);
    _renderBottomBar();
    setTimeout(_bindActionButtons,50);
    // 宫位正方形 + 外圈行高同步 + 阴干对齐(照时盘/山向)
    /* 同穿壬: 宫格尺寸受字体加载影响, 在多个时机重算(fixLayout 幂等) */
    [0,120,400,900].forEach(function(t){ setTimeout(function(){ if(window.mingliFixLayout) window.mingliFixLayout(); }, t); });
    if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){ if(window.mingliFixLayout) window.mingliFixLayout(); }).catch(function(){});
  }catch(e){
    let pw=document.getElementById("panWrap");
    if(pw)pw.innerHTML='<span style="color:red">命理错误:'+(e&&e.message)+'</span>';
    window._logErr&&window._logErr('doMingli',e&&e.message);
  }
}
function doChuanRen(){
  let tip=document.getElementById("tip");if(tip)tip.innerHTML="";
  let sxIn=document.getElementById("shanxiangInputs");if(sxIn)sxIn.style.display="none";
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
    function layoutCrOuter(){
      let crW=document.querySelector('.cr-grid-wrap');if(!crW)return;
      let pans=crW.querySelectorAll('#pan');if(!pans.length)return;
      let pan=pans[0];
      // 1. 正方化宫格: 批量读宽度再批量写高度, 避免读写交替强制布局
      let gongs = Array.from(pan.querySelectorAll('[id^=gong]'));
      if(needJsSquare()){
        let widths = gongs.map(el => el.getBoundingClientRect().width);
        gongs.forEach((el, i) => { let w = widths[i]; if (w > 0) el.style.height = w + 'px'; });
      }
// 2. 阴干移入宫内, 隐藏外圈yinGan
      pan.querySelectorAll('[id^="gong"]').forEach(go => {
        let g=parseInt(go.id.replace('gong',''));if(g===5)return;
        let yg=document.getElementById('yinGan'+g);if(!yg)return;
        let agText=yg.textContent.replace(/\s/g,'').trim();
        yg.style.display='none';yg.textContent='';if(!agText)return;
        let topRow=go.querySelector('.panItem.top');if(!topRow)return;
        let kw=topRow.querySelector('[id^=kong]');
        let old=topRow.querySelector('.cr-anGan');if(old)old.remove();
        let wrap=document.createElement('span');wrap.className='cr-anGan';wrap.style.cssText='float:right;white-space:nowrap;margin-left:4px';
        if(kw&&kw.textContent.replace(/\s/g,'').trim()=='○'){let ks=document.createElement('span');ks.textContent='○';ks.style.cssText='font-weight:bold;color:var(--c-text);margin-right:1px';wrap.appendChild(ks);kw.style.display='none';}
        let ag=document.createElement('span');ag.textContent=agText;ag.style.cssText='color:var(--c-text-3);font-size:100%';wrap.appendChild(ag);
        topRow.appendChild(wrap);
      });
      // 3. 12地支卡片: 预读全部宫格 rect 再统一写样式, 消除每卡一次强制布局
      let wr2=crW.getBoundingClientRect();
      let gRectMap = {};
      [1,2,3,4,6,7,8,9].forEach(g => { let el = pan.querySelector('#gong'+g); if (el) gRectMap[g] = el.getBoundingClientRect(); });
      crW.querySelectorAll('.cr-card').forEach(card => {
        let side=card.getAttribute('data-side');
        let gref=parseInt(card.getAttribute('data-gref'))||1;
        let gr=gRectMap[gref];if(!gr)return;
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
      document.querySelectorAll('[id^=yinGan]').forEach(y => {y.onclick=null;y.style.cursor='default';});
      document.querySelectorAll('[id^=gong]').forEach(x => {x.onclick=null;x.style.cursor='default';});
    }
    /* 外圈布局(宫格正方化 + 卡片定位)依赖宫格实际尺寸, 而尺寸受字体影响:
       web 端中文字体首次加载较慢, 只算一次会按 fallback 字体定位从而错位,
       故在字体就绪、若干延时点、窗口尺寸变化时都重算一次(函数幂等, 可重复调用) */
    requestAnimationFrame(layoutCrOuter);
    if(document.fonts&&document.fonts.ready)document.fonts.ready.then(layoutCrOuter).catch(function(){});
    [120,400,900].forEach(function(t){setTimeout(layoutCrOuter,t);});
    if(window._crLayoutPrev)window.removeEventListener('resize',window._crLayoutPrev);
    window._crLayoutPrev=layoutCrOuter;
    window.addEventListener('resize',layoutCrOuter,{passive:true});
  }catch(e){
    document.getElementById("panWrap").innerHTML="<span style=\"color:red\">穿壬错误:"+e.message+"</span>";
  }
}


// 暴露到全局




window._logErr=_logErr;  // 供 qimen_chuanren.js 等下游模块记录异常(其在 app 之前加载, 运行时才调用)
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
window.doChuanRen=doChuanRen,window.doMingli=doMingli;
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
window.GAN_LIST=GAN_LIST;
window.ZHI_LIST=ZHI_LIST;
window.SHEN=SHEN;
window.GAN10=GAN10;
window.ZHI12=ZHI12;
window.SHENJIANG_NAMES=SHENJIANG_NAMES;
window.SHENJUE=SHENJUE;
window.ZXJ_NAMES=ZXJ_NAMES;
// gong_detail_data.js(258KB)懒加载: 未加载时首次需要注入脚本, 完成后执行回调(重绘详情)
// 定义在 IIFE 顶层, 供 showPalace 内部调用与下方空闲预取共用
var _gongDetailLoading = false;
var _gongDetailPending = [];
function ensureGongDetail(cb) {
  if (window.GONG_FULL) { if (cb) cb(); return; }
  if (cb) _gongDetailPending.push(cb);
  if (_gongDetailLoading) return;
  _gongDetailLoading = true;
  var sc = document.createElement('script');
  sc.src = 'js/gong_detail_data.js';
  sc.onload = function() {
    _gongDetailLoading = false;
    var q = _gongDetailPending; _gongDetailPending = [];
    for (var i = 0; i < q.length; i++) q[i]();
  };
  sc.onerror = function() { _gongDetailLoading = false; };
  document.head.appendChild(sc);
}

// 页面空闲时预取宫详解数据(3 秒后), 用户点开宫详情时无需等待
setTimeout(ensureGongDetail, 3000);
_iifeReady = true;
})();
