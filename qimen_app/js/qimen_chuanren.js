// 奇门遁甲排盘引擎  作者: 地天泰  微信/手机: 18626256203
// 项目地址: https://github.com/wrz1911/daojiayinpan
// 开源依赖: tyme4ts (MIT) https://github.com/6tail/tyme4ts
// 开源依赖: Tauri (MIT) https://github.com/tauri-apps/tauri
(function(){
let T=typeof tyme4j!=='undefined'?tyme4j:(typeof tyme!=='undefined'?tyme:{});
let G='甲乙丙丁戊己庚辛壬癸',Z='子丑寅卯辰巳午未申酉戌亥';
let Z12=['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
let DUTY=['建','除','满','平','定','执','破','危','成','收','开','闭'];

// === 节气→月将 ===
let YJ_TERM=[1,1,0,0,11,11,10,10,9,9,8,8,7,7,6,6,5,5,4,4,3,3,2,2];
let YJ_FULL=['神后子','大吉丑','功曹寅','太冲卯','天罡辰','太乙巳','胜光午','小吉未','传送申','从魁酉','河魁戌','登明亥'];

// === 贵人表 [日干][0=阳贵,1=阴贵] ===
let GR_TAB={甲:[1,7],戊:[1,7],庚:[1,7],乙:[0,8],己:[0,8],丙:[11,9],丁:[11,9],辛:[6,2],壬:[5,3],癸:[5,3]};

// === 十二天将 ===
let TJ=['贵人','腾蛇','朱雀','六合','勾陈','青龙','天空','白虎','太常','玄武','太阴','天后'];
let TJ1=['贵','腾','朱','六','勾','青','空','白','常','玄','阴','后'];

// === 天干寄宫 ===
let TGJG={甲:3,乙:5,丙:6,戊:6,丁:8,己:8,庚:9,辛:11,壬:12,癸:2};

// === 地支相刑/冲 ===
let XING={子:'卯',丑:'戌',寅:'巳',卯:'子',巳:'申',申:'寅',午:'午',未:'丑',酉:'酉',戌:'未',亥:'亥',辰:'辰'};
let CHONG={子:'午',丑:'未',寅:'申',卯:'酉',辰:'戌',巳:'亥',午:'子',未:'丑',申:'寅',酉:'卯',戌:'辰',亥:'巳'};

function zi(s){return Z.indexOf(s);}
function gn(s){return G.indexOf(s);}

// === chuanRenChart: 穿壬核心计算, 输出天盘/神将/三传/建除等 ===
window.chuanRenChart= opts => {
  opts=opts||{};
  let yr=opts.year,mo=opts.month,dy=opts.day,hr=opts.hour,mi=opts.minute||0;
  let st=T.SolarTime.fromYmdHms(yr,mo,dy,hr,mi,0);
  let sch=st.getSixtyCycleHour();
  let yGz=sch.getYear(),mGz=sch.getMonth(),dGz=sch.getDay(),hGz=sch.getSixtyCycle();
  let yI=yGz.getIndex(),mI=mGz.getIndex(),dI=dGz.getIndex(),hI=hGz.getIndex();
  let riGan=dGz.getHeavenStem(),riZhi=dGz.getEarthBranch();
  let riG=riGan.getIndex(),riZ=riZhi.getIndex();
  let shiZhi=hGz.getEarthBranch(),shiZ=shiZhi.getIndex();
  let lh=st.getLunarHour(),ld=lh.getLunarDay();
  let solarDay=T.SolarDay.fromYmd(yr,mo,dy);

  // 刻家: 对齐主引擎刻盘算法(时柱天干推刻柱, 偶数小时分钟+60)
  let shiKe=opts.shiKe||'时家';
  let keGzStr='',keG=0,keZ=0;
  if(shiKe==='刻家'){
    // 刻盘: 偶数小时分钟+60(阳刻), 奇数小时不变(阴刻)
    let tMin = (hr % 2 === 0) ? 60 + mi : mi;
    // 刻柱 = 时柱天干*12 + floor(tMin/10)
    let keG2 = hI % 10;
    if (keG2 > 4) keG2 -= 5;
    let kz = Math.floor(tMin / 10);
    let cMin = (keG2 * 12 + kz) % 60;
    keG = cMin % 10;
    keZ = cMin % 12;
    keGzStr = G[keG] + Z[keZ];
    shiZ = keZ; hI = cMin;
  }

  // 自选局
  let ziJu=opts.ziJu||'自动';
  let customJu=null;
  if(ziJu!=='自动'){
    let zjYY=ziJu[0], zjNum=parseInt(ziJu.substring(1));
    customJu={yinYang:zjYY, number:zjNum};
  }

  // 1. 月将: 节气→月将地支索引→月将全名
  let term=solarDay.getTerm(),ti=term.getIndex()%24;
  let yjIdx=YJ_TERM[ti],yjName=YJ_FULL[yjIdx],yjZhi=Z[yjIdx];

  // 2. 天盘十二地支: 月将加时支顺排, tp[1]=时支位天盘支
  let yjPos=zi(yjZhi),offset=yjPos-shiZ;
  let tp=[]; for(let i=0;i<12;i++){let pos=offset+i+1;if(pos<1)pos+=12;if(pos>12)pos-=12;tp[i+1]=Z[pos-1];}

  // 3. 贵人: 用神天干查贵人表
  let ysGan=opts.yongShen?opts.yongShen[0]:riGan.getName();
  let rgChar=ysGan;
  let gr=opts.guiRen||'阳贵';
  let grPair=GR_TAB[rgChar]||[2,8];
  let grZhiIdx=gr==='阴贵'?grPair[1]:grPair[0];
  let grZhi=Z[grZhiIdx];
  let grTpPos=-1;for(let i=1;i<=12;i++){if(tp[i]===grZhi){grTpPos=i;break;}}

  // 4. 十二天将: 贵人起, 阳贵顺排/阴贵逆排
  let sun=(grTpPos>=1&&grTpPos<=5)||grTpPos===12;
  let tjs=[],tjs2={},tjsChar={};
  for(let i=1;i<=12;i++){let di=i-grTpPos;if(!sun)di=-di;if(di<0)di+=12;tjs[i]=TJ1[di];tjs2[tp[i]]=TJ1[di];tjsChar[tp[i]]=TJ1[di];}

  // 5. 天干分布: 用神天干→地支偏移, 查14字天干表按12位置clamp
  let ysGanChar=opts.yongShen?opts.yongShen[0]:riGan.getName();
  let ysZhiChar=opts.yongShen?opts.yongShen[1]:riZhi.getName();
  let gzCha=G.indexOf(ysGanChar)-Z.indexOf(ysZhiChar);
  let tgstr='甲乙丙丁戊己庚辛壬癸甲乙';
  let tgs=[],tgs2={};
  for(let i=1;i<=12;i++){
    let gi=gzCha+zi(tp[i])+1; // +1: 地支索引从1开始(子=1)
    if(gi>12)gi-=12; else if(gi<1)gi+=12;
    tgs[i]=tgstr[gi-1]; tgs2[tp[i]]=tgstr[gi-1];
  }

  // 6. 空亡: 用神地支减天干之差→查表(0戌亥,2子丑,4寅卯,6辰巳,8午未,10申酉)
  let kwDiff=(zi(ysZhiChar)-G.indexOf(ysGanChar)+12)%12;
  let kwMap={0:['戌','亥'],2:['子','丑'],4:['寅','卯'],6:['辰','巳'],8:['午','未'],10:['申','酉']};
  let kwPair=kwMap[kwDiff]||['子','丑'];
  let kw={};kw[kwPair[0]]=true;kw[kwPair[1]]=true;

  // 7. 建除: 时支起建顺排十二神
  let dutyMap={};
  for(let i=0;i<12;i++){let dp=(shiZ+i)%12;dutyMap[Z[dp]]=DUTY[i];}

  // 8. 天干寄宫 + 三传: 用神起四课推三传
  let yrg=ysGanChar;
  let jg=TGJG[yrg]||3;
  let tgsz=['','','','',''];
  tgsz[1]=yrg;tgsz[2]=tp[jg];let zt1=zi(tgsz[2])+1;tgsz[3]=tp[zt1];let zt2=zi(tgsz[3])+1;tgsz[4]=tp[zt2];

  // 9. 地支三传: 用神地支→天盘→初/中/末传
  let dzsz=['','','','',''];
  let yrz=ysZhiChar;dzsz[1]=yrz;let a1=zi(dzsz[1])+1;dzsz[2]=tp[a1];let a2=zi(dzsz[2])+1;dzsz[3]=tp[a2];let a3=zi(dzsz[3])+1;dzsz[4]=tp[a3];

  // 10. 伏吟刑冲: 月将=时支时触发, 中末传取刑(亥刑巳,非自刑)
  let isFuYin=(yjZhi===Z[shiZ]);
  let XING_VF={子:'卯',丑:'戌',寅:'巳',卯:'子',辰:'戌',巳:'申',午:'子',未:'丑',申:'寅',酉:'卯',戌:'未',亥:'巳'};
  if(isFuYin){
    let _v3=XING_VF[tgsz[2]]||tgsz[2],_v4=XING_VF[_v3]||_v3;
    tgsz[3]=_v3;tgsz[4]=_v4;
    let _d3=XING_VF[dzsz[2]]||dzsz[2],_d4=XING_VF[_d3]||_d3;
    dzsz[3]=_d3;dzsz[4]=_d4;
  }

  // 11. 时运命: 时支(shí)/月将(yùn)/年命(mìng)
  let sm={shi:Z[shiZ],yun:yjZhi,ming:opts.nianMing||Z[shiZ]};

  // 12. 排盘表头: 局数/值符/值使/旬首/空亡/马星
  let xsIdxH=Math.floor(hI/10)*10; // 时柱旬首(旬首/空亡/值符一致)
  let _kongWang=Z[(xsIdxH+10)%12]+Z[(xsIdxH+11)%12];
  let _maXing=Z[[2,11,8,5][hI%4]];
  let jieqiStr='';
  try{let t2=solarDay.getTerm(),nt=t2.next(1);jieqiStr=t2.getName()+'~'+nt.getName();}catch(e){jieqiStr='节气';}
  let juNum=0,juLabel='',zfVal='',zsVal='',_xunShou='';
  try{
    let isY2=ti>=12;let lM2=Math.abs(ld.getLunarMonth().getMonthWithLeap());if(lM2===0)lM2=12;
    juNum=((yI%12+1)+lM2+ld.getDay()+(hI%12+1))%9;if(juNum===0)juNum=9;
    juLabel=(isY2?'阴遁':'阳遁')+juNum+'局';
    let GAN9='戊己庚辛壬癸丁丙乙';
    let juMap={};for(let i=0;i<9;i++){let g=isY2?juNum-i:juNum+i;if(g>9)g-=9;if(g<1)g+=9;if(g!==5)juMap[g]=GAN9[i];}
    // 值符/值使用已计算的时柱旬首(六甲遁于六仪)
    let hiddenGan=['戊','己','庚','辛','壬','癸'][xsIdxH/10%6]; // 六甲所遁之干
    _xunShou='甲'+Z[xsIdxH%12]+hiddenGan; // 格式: 甲申庚
    let dgGong=0;for(let g2=1;g2<=9;g2++){if(g2===5)continue;if(juMap[g2]===hiddenGan){dgGong=g2;break;}}
    let XN2=' 蓬任冲辅英芮柱心',MN2=' 休生伤杜景死惊开',FZ2=[0,1,6,3,4,6,8,7,2,5];
    if(dgGong===5){zfVal='天禽星';zsVal=MN2[5]+'门';}
    else{let zfI=dgGong===0?1:FZ2[dgGong];zfVal='天'+XN2[zfI]+'星';zsVal=MN2[zfI]+'门';}
  }catch(e){juLabel=''}

  let nongliStr='';
  try{nongliStr=ld.getLunarMonth().getLunarYear().getYear()+'年'+ld.getLunarMonth().getName()+ld.getName();}catch(e){}



  return {
    gongli:yr+'年'+mo+'月'+dy+'日 '+hr+':'+(mi<10?'0':'')+mi,
    nongli:nongliStr,
    sizhu:yGz.getName()+' '+mGz.getName()+' '+dGz.getName()+' '+hGz.getName()+(keGzStr?' '+keGzStr:''),
    jieqi:jieqiStr,juLabel:juLabel,
    zhiFu:zfVal,zhiShi:zsVal,
    xunShou:_xunShou,kongWang:_kongWang,maXing:_maXing,
    riGz:dGz.getName(),
    yueJiang:{idx:yjIdx,name:yjName,zhi:yjZhi},
    tianPan:tp,tianGans:tgs,tianGansMap:tgs2,
    guiRen:{zhi:grZhi,pos:grTpPos,sun:sun},
    tianJiangs:tjs,tianJiangsMap:tjs2,tianJiangsChar:tjsChar,
    kongWangMap:kw,dutyMap:dutyMap,
    shiZhi:shiZ,shiZhiName:Z[shiZ],shiKe:shiKe,keGzStr:keGzStr,
    tgsz:tgsz,dzsz:dzsz,isFuYin:isFuYin,
    shiYunMing:sm,opts:opts,customJu:customJu
  };
};

// === 八字大运计算 (基于tyme4j) ===
window.computeBaZiDaYun= opts => {
  opts=opts||{};
  let yr=opts.year,mo=opts.month,dy=opts.day,hr=opts.hour;
  let gender=opts.gender||'男';
  let st=T.SolarTime.fromYmdHms(yr,mo,dy,hr,0,0);
  let sch=st.getSixtyCycleHour();
  let yGz=sch.getYear(),mGz=sch.getMonth(),dGz=sch.getDay(),hGz=sch.getSixtyCycle();

  // 四柱
  let bz=[yGz,mGz,dGz,hGz].map(gz => {
    return {gz:gz.getName(),g:gz.getHeavenStem().getName(),z:gz.getEarthBranch().getName(),
      gIdx:gz.getHeavenStem().getIndex(),zIdx:gz.getEarthBranch().getIndex()};
  });

  // 年干顺逆
  let nianGan=bz[0].gIdx; // 0=甲...9=癸
  let isYangNian=nianGan%2===0; // 甲丙戊庚壬为阳年
  let isMale=gender==='男';
  let shun=(isYangNian&&isMale)||(!isYangNian&&!isMale)?'顺':'逆';

  // 起运岁数: 计算到下一个/上一个节气的时间差
  let solarDay=T.SolarDay.fromYmd(yr,mo,dy);
  let term=solarDay.getTerm();
  let jqTime=term.getJulianDay(); // 上一节气儒略日
  let birthJD=solarDay.getJulianDay();
  let jqDiff;
  if(shun==='顺'){
    let nextTerm=term.next(1);
    jqDiff=Math.abs(nextTerm.getJulianDay()-birthJD);
  } else {
    jqDiff=Math.abs(birthJD-jqTime);
  }
  let qiYunSui=Math.floor(jqDiff/3); // 3天=1岁
  let qiYunMonth=Math.floor((jqDiff%3)*4); // 余数*4=月数
  let qiYunYear=yr+qiYunSui;
  let yueGan=bz[1].g, yueZhi=bz[1].z;

  // 大运排列 (8步)
  let G2='甲乙丙丁戊己庚辛壬癸',Z2='子丑寅卯辰巳午未申酉戌亥';
  let dayun=[];
  for(let i=1;i<=10;i++){
    let gIdx=G2.indexOf(yueGan);
    let zIdx=Z2.indexOf(yueZhi);
    if(shun==='顺'){
      gIdx=(gIdx+i)%10; zIdx=(zIdx+i)%12;
    } else {
      gIdx=(gIdx-i+10)%10; zIdx=(zIdx-i+12)%12;
    }
    let dyAge=qiYunSui+(i-1)*10, dyYear=qiYunYear+(i-1)*10;
    dayun.push({
      gz:G2[gIdx]+Z2[zIdx], g:G2[gIdx], z:Z2[zIdx],
      age:dyAge, year:dyYear
    });
  }

  // 纳音
  let nayin=bz.map(b => {return T.SixtyCycle.fromName(b.gz).getSound().getName();});

  // 藏干
  let cangGanMap={子:'癸',丑:'癸辛己',寅:'甲丙戊',卯:'乙',辰:'乙戊癸',巳:'丙庚戊',午:'丁己',未:'乙己丁',申:'庚壬戊',酉:'辛',戌:'辛丁戊',亥:'壬甲'};
  let cangGan=bz.map(b => {return cangGanMap[b.z]||'';});

  // 十神 (以日干为基准)
  let wxMap={甲:2,乙:2,丙:3,丁:3,戊:4,己:4,庚:5,辛:5,壬:1,癸:1};
  let rgWx=wxMap[bz[2].g], rgYin=bz[2].gIdx%2===0?1:0;
  let shishen=bz.map(b => {
    let twx=wxMap[b.g], tyin=b.gIdx%2===0?1:0;
    if(twx===rgWx)return tyin===rgYin?'比':'劫';
    let d=(rgWx-twx+5)%5;
    if(d===4)return tyin===rgYin?'袅':'印';
    if(d===1)return tyin===rgYin?'食':'伤';
    if(d===2)return tyin===rgYin?'才':'财';
    if(d===3)return tyin===rgYin?'杀':'官';
    return '';
  });

  // 十二长生 helper
  let CS=['长生','淋浴','冠带','临官','帝旺','衰','病','死','库','绝','胎','养'];
  let CS_YANG={甲:0,丙:2,戊:2,庚:6,壬:8}; // 阳干长生地支index(0=亥)
  let CS_YIN={乙:6,丁:8,己:8,辛:0,癸:4};  // 阴干长生地支index(0=亥, reverse)
  function getCS(gan, zhi){
    let gIdx2=G2.indexOf(gan), zIdx2=Z2.indexOf(zhi);
    let isYang=gIdx2%2===0;
    let csStart=isYang?CS_YANG[gan]:CS_YIN[gan];
    if(csStart===undefined)return '';
    let offset=(zIdx2-csStart+12)%12;
    if(!isYang)offset=(12-offset)%12;
    return CS[offset];
  }

  // 地势: 各柱地支对日干的长生状态
  let dishi=bz.map(b => {return getCS(bz[2].g, b.z);});

  // 自坐: 各柱地支对自己天干的长生状态
  let zizuo=bz.map(b => {return getCS(b.g, b.z);});

  // 空亡: 各柱旬空
  let xunKong=bz.map(b => {
    let xs=Math.floor((b.gIdx*12+b.zIdx)/10)*10;
    return Z2[(xs+10)%12]+Z2[(xs+11)%12];
  });

  // 五行色
  let wxColor={甲:'#30b030',乙:'#30b030',丙:'#d82828',丁:'#d82828',戊:'#805020',己:'#805020',庚:'#f2b820',辛:'#f2b820',壬:'#2080d0',癸:'#2080d0',
    寅:'#30b030',卯:'#30b030',巳:'#d82828',午:'#d82828',辰:'#805020',戌:'#805020',丑:'#805020',未:'#805020',申:'#f2b820',酉:'#f2b820',亥:'#2080d0',子:'#2080d0'};
  function wxSpanBZ(ch){let c=wxColor[ch]||'#333';return '<span style="color:'+c+'">'+ch+'</span>';}
  function wxClass(ch){let m={甲:'绿',乙:'绿',丙:'红',丁:'红',戊:'褐',己:'褐',庚:'金',辛:'金',壬:'蓝',癸:'蓝',
    寅:'绿',卯:'绿',巳:'红',午:'红',辰:'褐',戌:'褐',丑:'褐',未:'褐',申:'金',酉:'金',亥:'蓝',子:'蓝'};return m[ch]||'';}

  // 大运十神
  let dayunSS=dayun.map(dy => {
    let twx=wxMap[dy.g], tyin=(G2.indexOf(dy.g)%2===0)?1:0;
    if(twx===rgWx)return (tyin===rgYin?'比':'劫');
    let d=(rgWx-twx+5)%5;
    if(d===4)return tyin===rgYin?'袅':'印';
    if(d===1)return tyin===rgYin?'食':'伤';
    if(d===2)return tyin===rgYin?'才':'财';
    if(d===3)return tyin===rgYin?'杀':'官';
    return '';
  });

  // 流年: 从起运年开始80年 (年干支= (year-4)%60)
  let liuNian=[];
  for(let ln=0;ln<100;ln++){
    let lnYear=qiYunYear+ln;
    let idx=(lnYear-4)%60;
    let lnGz=T.SixtyCycle.fromIndex(idx).getName();
    liuNian.push({year:lnYear, gz:lnGz, g:lnGz[0], z:lnGz[1]});
  }

  // 当前大运index (0-based)
  let curYear=new Date().getFullYear();
  let curDY=0;
  for(let di=0;di<dayun.length;di++){if(curYear>=dayun[di].year){curDY=di;}}

  // 交运信息: 起运年的天干
  let jiaoYunGan=G2[(qiYunYear-4)%10]; // 起运年的年干
  let jyGanColor=wxColor[jiaoYunGan]||'#333';
  let qiYunDesc='出生后'+qiYunMonth+'个月起大运，每逢<span style="color:'+jyGanColor+'">'+jiaoYunGan+'</span>年交运';

  // 藏干十神
  let cgSS=[];
  bz.forEach((b, i) => {
    let cs=cangGan[i]||'';
    for(let j=0;j<cs.length;j++){
      let ch=cs[j]; if(ch===' '||!ch)continue;
      let chIdx=G2.indexOf(ch);
      let twx2=wxMap[ch]||0, tyin2=(chIdx>=0&&chIdx%2===0)?1:0;
      if(twx2===rgWx)cgSS.push(tyin2===rgYin?'比':'劫');
      else{let d2=(rgWx-twx2+5)%5;
        if(d2===4)cgSS.push(tyin2===rgYin?'袅':'印');
        else if(d2===1)cgSS.push(tyin2===rgYin?'食':'伤');
        else if(d2===2)cgSS.push(tyin2===rgYin?'才':'财');
        else if(d2===3)cgSS.push(tyin2===rgYin?'杀':'官');
      }
    }
    while(cgSS.length<(i+1)*3)cgSS.push('');
  });

  return {
    bz:bz, shun:shun, nayin:nayin, cangGan:cangGan, shishen:shishen, cgSS:cgSS,
    dishi:dishi, zizuo:zizuo, xunKong:xunKong,
    qiYunSui:qiYunSui, qiYunMonth:qiYunMonth, qiYunYear:qiYunYear,
    dayun:dayun, dayunSS:dayunSS, liuNian:liuNian, curDY:curDY, curYear:curYear,
    qiYunDesc:qiYunDesc, wxSpanBZ:wxSpanBZ, wxClass:wxClass, wxColor:wxColor
  };
};

// === 穿壬渲染 (完整信息栏+排盘区) ===
window.renderChuanRen=(data,containerId) => {
  let d=data;
  let szParts=d.sizhu.split(' ');
  let nianGz=szParts[0]||'',yueGz=szParts[1]||'',riGz=szParts[2]||'',shiGz=szParts[3]||'';
  function wxSpan(s){let c='#333';if('甲乙寅卯'.indexOf(s)>=0)c='#2e7d32';else if('丙丁巳午'.indexOf(s)>=0)c='#d50000';else if('戊己辰戌丑未'.indexOf(s)>=0)c='#795548';else if('庚辛申酉'.indexOf(s)>=0)c='#f9a825';else if('壬癸亥子'.indexOf(s)>=0)c='#0d47a1';return '<font color="'+c+'">'+(s||'')+'</font>';}

  let h='';

  // ====== 信息栏 ======
  let isKe=d.shiKe==='刻家';
  let keGan=d.keGzStr?d.keGzStr[0]:'',keZhi=d.keGzStr?d.keGzStr[1]:'';
  let cols=isKe?5:4;
  h+='<div id="panHead"><TABLE class="pan" id="headTable">';
  h+='<TR><TD id="dTitle">日期</TD><TD colspan="'+cols+'" id="dateTime">'+d.gongli+' ('+d.nongli+')</TD></TR>';
  let juTitle=d.juLabel+(d.customJu?'<b>自选</b>':'')+(isKe?' <b>刻家</b>':'');
  h+='<TR><TD style="color:#dead68">节气</TD><TD colspan="'+Math.floor(cols/2)+'">'+d.jieqi+(d.isFuYin?' <b style=color:#c00>伏吟</b>':'')+'</TD><TD colspan="'+Math.ceil(cols/2)+'">'+juTitle+'</TD></TR>';
  h+='<TR id="tdTitle"><TD>值符</TD><TD>值使</TD><TD>旬首</TD><TD>空亡</TD><TD>马星</TD>'+(isKe?'<TD></TD>':'')+'</TR>';
  h+='<TR><TD>'+d.zhiFu+'</TD><TD>'+d.zhiShi+'</TD><TD>'+d.xunShou+'</TD><TD>'+d.kongWang+'</TD><TD>'+d.maXing+'</TD>'+(isKe?'<TD></TD>':'')+'</TR>';
  h+='<TR id="tdTitle"><TD>月将</TD><TD>年命</TD><TD>用神</TD><TD colspan="'+(isKe?3:2)+'">贵人</TD></TR>';
  h+='<TR><TD>'+d.yueJiang.name+'</TD><TD>'+(d.opts.nianMing||'子')+'</TD><TD>'+(d.opts.yongShen||d.riGz||'')+'</TD><TD colspan="'+(isKe?3:2)+'">'+(d.opts.guiRen||'阳贵')+' ('+(d.opts.gender||'男')+') '+(d.guiRen.sun?'顺':'逆')+'</TD></TR>';
  // 四柱标题+数据
  h+='<TR id="tdTitle"><TD>'+(isKe?'五柱':'四柱')+'</TD><TD class="sizhuTitle">年柱</TD><TD class="sizhuTitle">月柱</TD><TD class="sizhuTitle">日柱</TD><TD class="sizhuTitle">时柱</TD>'+(isKe?'<TD class="sizhuTitle">刻柱</TD>':'')+'</TR>';
  h+='<TR><TD></TD>';
  h+='<TD class="sizhu" id="nianzhu">'+wxSpan(nianGz[0]||'')+'<br>'+wxSpan(nianGz[1]||'')+'</TD>';
  h+='<TD class="sizhu" id="yuezhu">'+wxSpan(yueGz[0]||'')+'<br>'+wxSpan(yueGz[1]||'')+'</TD>';
  h+='<TD class="sizhu" id="rizhu">'+wxSpan(riGz[0]||'')+'<br>'+wxSpan(riGz[1]||'')+'</TD>';
  h+='<TD class="sizhu" id="shizhu">'+wxSpan(shiGz[0]||'')+'<br>'+wxSpan(shiGz[1]||'')+'</TD>';
  if(isKe)h+='<TD class="sizhu" id="kezhu">'+wxSpan(keGan)+'<br>'+wxSpan(keZhi)+'</TD>';
  h+='</TR>';
  // 颜色
  h+='<TR><TD style="color:#dead68;font-size:12px">颜色</TD><TD colspan="'+cols+'" style="font-size:12px;line-height:20px">'+
    '<font color=#ca610e>入墓</font> <font color=#b745ce>击刑</font> <font color=red>门破</font> <font color=#009cef>刑墓</font></TD></TR>';
  h+='</TABLE></div><div style="height:40px"></div>';

  // ====== 穿壬外圈 + 奇门九宫 (时盘风格, 无额外框线) ======
  // 使用 buildPaipanGrid 生成标准奇门九宫 (含外圈yinGan位置)
  let qimenGridHTML='';
  try{
    if(window.qimenChart&&window.buildPaipanGrid){
      let qopts={year:d.opts.year||2026,month:d.opts.month||7,day:d.opts.day||5,hour:d.opts.hour||12,minute:d.opts.minute||0,panType:d.shiKe==='刻家'?2:1};
      if(d.customJu)qopts.customJu=d.customJu;
      let qr=window.qimenChart(qopts);
      if(qr&&qr.pals){
        let qimenPalaces={};
        for(let g=1;g<=9;g++){if(g===5)continue;
          let pp=qr.pals[g];
          qimenPalaces['gong'+g]={shen:pp.shen||'',tian:pp.tian||'',di:pp.di||'',xing:pp.xing||'',men:pp.men||'',anGan:pp.anGan||'',kong:pp.kong||false,isMenPo:!!pp.mp,isTianXing:!!pp.tx,isTianMu:!!pp.tm,isDiXing:!!pp.dx,isDiMu:!!pp.dm};
        }
        // 与时盘一致: 重新计算四害颜色
        if(window.recalcColors)window.recalcColors(qimenPalaces);
        let kongG={};for(let g=1;g<=9;g++){if(qr.pals[g]&&qr.pals[g].kong)kongG[g]=true;}
        let maPosId=qr.ma?qr.ma.p:'ma2';
        // 穿壬外圈: 绝对定位标签 (left/right/top/bottom)
        let csFn=window._colorSpan|| (v => v||'');
        qimenGridHTML='<div class="cr-grid-wrap"><div class="cr-content">'+
          window.buildPaipanGrid(qimenPalaces,kongG,maPosId,function(g){return g===5?'':(qr.pals[g]?(qr.pals[g].anGan||''):'');},{colorSpan:csFn,wrapperClass:'cr-inner',panClass:'cr-pan'})+
          '</div>';
        // 穿壬12地支外圈卡片
        let ringOrder=['巳','午','未','辰','卯','寅','申','酉','戌','亥','子','丑'];
        let ringSides=['top','top','top','left','left','left','right','right','right','bot','bot','bot'];
        let gongRef={巳:4,午:9,未:2,辰:4,卯:3,寅:8,申:2,酉:7,戌:6,亥:6,子:1,丑:8};
        let ringLabels=[];
        for(let i=0;i<12;i++){
          let zhi=ringOrder[i],side=ringSides[i],gRef=gongRef[zhi]||1;
          let pos=zi(zhi)+1; // 地盘位置 1-based
          let tg=d.tianGans[pos]||''; // 天干按地盘位置
          let tj=d.tianJiangs[pos]||''; // 天将单字(按地盘位置)
          let tpZhi=d.tianPan[pos]||zhi; // 天盘支
          let du=d.dutyMap[zhi]||'';
          let label='<div class="cr-card" data-zhi="'+zhi+'" data-side="'+side+'" data-gref="'+gRef+'" data-ri="'+i+'">';
          // 排版: 建除(近宫)→天盘支→神→干(远宫)
          if(side==='top'){
            label+='<span class=cr-ctg>'+tg+'</span><span class=cr-ctj>'+tj+'</span><span class=cr-czhi>'+tpZhi+'</span><span class=cr-cdu>'+du+'</span>';
          } else if(side==='left'){
            label+='<span class=cr-hrow><span class=cr-ctg>'+tg+'</span><span class=cr-ctj>'+tj+'</span><span class=cr-czhi>'+tpZhi+'</span><span class=cr-cdu>'+du+'</span></span>';
          } else if(side==='right'){
            label+='<span class=cr-hrow><span class=cr-cdu>'+du+'</span><span class=cr-czhi>'+tpZhi+'</span><span class=cr-ctj>'+tj+'</span><span class=cr-ctg>'+tg+'</span></span>';
          } else {
            label+='<span class=cr-cdu>'+du+'</span><span class=cr-czhi>'+tpZhi+'</span><span class=cr-ctj>'+tj+'</span><span class=cr-ctg>'+tg+'</span>';
          }
          label+='</div>';
          ringLabels.push(label);
        }
        qimenGridHTML+=ringLabels.join('');
        // 四课(时/运/命/末)
        // 三传表格: 天干/地支/时运命(时支/月将/年命)
        let scLabels=['','初传','中传','末传','四课'];
        let scExtra=['','','时','运','命'];
        let scExtraVal=['','','','',''];
        scExtraVal[3]=d.shiZhiName; // i=3 时支
        scExtraVal[2]=d.yueJiang.zhi; // i=2 月将
        scExtraVal[1]=d.opts.nianMing||'子'; // i=1 年命
        qimenGridHTML+='<div class="cr-sanchuan"><table class="cr-sc-tbl">';
        for(let i=4;i>=1;i--){
          let lb=scLabels[i]||'', ex=scExtra[i]||'', exv=scExtraVal[i]||'';
          qimenGridHTML+='<tr><td class="cr-sc-lb">'+lb+'</td><td class="cr-sc-tg">'+d.tgsz[i]+'</td><td class="cr-sc-dz">'+d.dzsz[i]+'</td><td class="cr-sc-ex">'+exv+'</td></tr>';
        }
        qimenGridHTML+='</table></div>';
        qimenGridHTML+='</div></div>';
      }
    }
  }catch(e){qimenGridHTML='<div style=color:red;text-align:center;padding:20px>九宫错误:'+e.message+'</div>';}
  if(!qimenGridHTML){
    let reason='';
    if(!window.qimenChart) reason='qimenChart未定义';
    else if(!window.buildPaipanGrid) reason='buildPaipanGrid未定义';
    else{let qr2=window.qimenChart({year:2026,month:7,day:11,hour:14,minute:0,panType:1}); reason='qr.pals='+(qr2&&qr2.pals?'有':'无');}
    qimenGridHTML='<div style=color:red;text-align:center;padding:20px>九宫:'+reason+'</div>';
  }

  h+=qimenGridHTML;

  // ====== 八字大运区 ======
  try{
    let bzdy=window.computeBaZiDaYun({
      year:d.opts.year||2026, month:d.opts.month||7, day:d.opts.day||5,
      hour:d.opts.hour||12, gender:d.opts.gender||'男'
    });

    // 四柱表格
    let ssg=bzdy.shishen||[], cg=bzdy.cangGan||[], cgS=bzdy.cgSS||[];
    let dishi=bzdy.dishi||[], zizuo=bzdy.zizuo||[], xk=bzdy.xunKong||[];
    let ws=bzdy.wxSpanBZ|| (c => c);

    h+='<table class="cr-bz-tbl"><tr><td>四柱</td><td>年柱</td><td>月柱</td><td>日柱</td><td>时柱</td></tr>';
    h+='<tr><td>十神</td>';
    bzdy.bz.forEach((b, i) => {h+='<td>'+(i===2?'日元':ssg[i])+'</td>';});
    h+='</tr>';
    h+='<tr class="cr-bz-zao"><td>'+(d.opts.gender==='女'?'坤造':'乾造')+'</td>';
    bzdy.bz.forEach(b => {h+='<td>'+ws(b.g)+'<br>'+ws(b.z)+'</td>';});
    h+='</tr>';
    h+='<tr class="cr-bz-cg"><td>藏干</td>';
    bzdy.bz.forEach((b, i) => {
      let c0=cg[i][0]||'',c1=cg[i][1]||'',c2=cg[i][2]||'';
      h+='<td>'+ws(c2)+ws(c0)+ws(c1)+'<br><span class="cr-bz-cgss">'+cgS[i*3]+' '+cgS[i*3+1]+' '+cgS[i*3+2]+'</span></td>';
    });
    h+='</tr>';
    h+='<tr><td>纳音</td>';
    bzdy.nayin.forEach(n => {h+='<td>'+n+'</td>';});
    h+='</tr>';
    h+='<tr><td>地势</td>';
    dishi.forEach(d => {h+='<td>'+d+'</td>';});
    h+='</tr>';
    h+='<tr><td>自坐</td>';
    zizuo.forEach(d => {h+='<td>'+d+'</td>';});
    h+='</tr>';
    h+='<tr><td>空亡</td>';
    xk.forEach(k => {h+='<td>'+k+'</td>';});
    h+='</tr></table>';

    // 大运流年 (独立表格, 无边距)
    h+='<table class="cr-dy-tbl">';
    // 交运信息行
    h+='<tr class="cr-dy-info-row"><td class="cr-dy-lbl" colspan="'+(Math.min(bzdy.dayun.length,10)+1)+'">'+bzdy.qiYunDesc+'</td></tr>';
    // 年份表头
    h+='<tr class="cr-dy-hdr"><td class="cr-dy-lbl cr-dy-lbl-v" rowspan="2">大运</td>';
    for(let di=0;di<Math.min(bzdy.dayun.length,10);di++){let isCurYr=di===bzdy.curDY; h+='<td'+(isCurYr?' class="cr-dy-cur"':'')+'>'+(bzdy.qiYunYear+di*10)+'</td>';}
    h+='</tr>';
    // 大运干支+十神 (与年份同行标签)
    h+='<tr>';
    let curY=new Date().getFullYear();
    for(let di=0;di<Math.min(bzdy.dayun.length,10);di++){
      let dy=bzdy.dayun[di], dss=(bzdy.dayunSS||[])[di]||'';
      let isCur=(curY>=dy.year&&curY<dy.year+10);
      h+='<td><span class="cr-dy-gz'+(isCur?' cr-dy-cur':'')+'">'+wxSpan(dy.g)+'<br>'+wxSpan(dy.z)+'</span><br><span class="cr-dy-ss">'+dss+'</span></td>';
    }
    h+='</tr>';
    // 流年: 每行显示最多年份的流年
    let dyCount=Math.min(bzdy.dayun.length,10);
    let lns=bzdy.liuNian||[];
    h+='<tr class="cr-dy-liu"><td class="cr-dy-lbl cr-dy-lbl-v" rowspan="10">流年</td>';
    for(let di=0;di<dyCount;di++){let ln0=lns[di*10]; let isCL0=ln0&&ln0.year===curY; h+='<td>'+(isCL0?'<span class="cr-dy-cur">':'')+wxSpan(ln0?ln0.g:'')+wxSpan(ln0?ln0.z:'')+(isCL0?'</span>':'')+'</td>';}
    h+='</tr>';
    for(let r=1;r<10;r++){
      h+='<tr class="cr-dy-liu">';
      for(let di=0;di<dyCount;di++){
        let ln=lns[di*10+r]; let isCurLn=ln&&ln.year===curY;
        h+='<td>'+(isCurLn?'<span class="cr-dy-cur">':'')+wxSpan(ln?ln.g:'')+wxSpan(ln?ln.z:'')+(isCurLn?'</span>':'')+'</td>';
      }
      h+='</tr>';
    }
    h+='</table>';
  }catch(e){console.log('大运:',e);}

  // ====== CSS ======
  h+='<style>'+
  '.cr-grid-wrap{position:relative;max-width:340px;margin:0 auto}'+
  '.cr-content table{width:100%;border-collapse:collapse}'+
  '.cr-pan{border:solid 1px #ddd;width:100%;border-collapse:collapse;table-layout:fixed!important}'+
  '.cr-pan td{vertical-align:top!important;padding-left:14px!important;padding-right:14px!important;padding-top:8px!important}'+
  '.cr-pan .panItem{line-height:24px!important;font-size:15px!important}'+
  // 穿壬外圈标签
  '.cr-card{position:absolute;display:flex;flex-direction:column;align-items:center;border:1px solid #e0e0e0;border-radius:6px;background:#fff;padding:4px 6px;text-align:center;white-space:nowrap;font-size:12px}'+
  '.cr-ctg{color:#333;font-size:13px;font-weight:bold}'+
  '.cr-ctj{color:#C8A666;font-size:11px}'+
  '.cr-czhi{color:#333;font-size:12px}'+
  '.cr-ckw{color:#f00;font-size:10px}'+
  '.cr-cdu{color:#226ACC;font-size:11px;display:flex;flex-direction:column;line-height:1.1}'+
  '.cr-hrow{display:flex;flex-direction:row;align-items:center;gap:3px;white-space:nowrap}'+
  '.cr-sanchuan{display:flex;justify-content:center;margin-top:40px}'+
  '.cr-sc-tbl{border-collapse:collapse;font-size:14px}'+
  '.cr-sc-tbl td{padding:2px 10px;text-align:center}'+
  '.cr-sc-lb{color:#0dc2b3;font-size:12px;text-align:right!important}'+
  '.cr-sc-tg{color:#c00;font-size:14px;font-weight:bold}'+
  '.cr-sc-dz{color:#333;font-size:14px;font-weight:bold}'+
  '.cr-sc-ex{color:#333;font-size:14px;font-weight:bold}'+
  '.cr-bz-tbl{width:100%;max-width:500px;margin:0 auto;border-collapse:collapse;font-size:12px}'+
  '.cr-bz-tbl td{border:1px solid #e6e6e6;text-align:center;vertical-align:middle;padding:4px 2px;line-height:1.3}'+
  '.cr-bz-tbl tr td:first-child{background:#f9f6ef;color:#c8a878;font-weight:500;font-size:11px}'+
  '.cr-bz-zao td{font-size:18px;font-weight:bold;padding:2px 1px!important}'+
  '.cr-bz-cg td{font-size:13px;padding:2px 1px!important}'+
  '.cr-bz-cgss{font-size:10px;color:#999}'+
  '.cr-dy-tbl{width:100%;max-width:500px;margin:0 auto;border-collapse:collapse;border:1px solid #e5e5e5;border-top:none}'+
  '.cr-dy-tbl td{border:1px solid #e5e5e5;text-align:center;vertical-align:middle;padding:4px 2px;font-size:14px;line-height:1.35}'+
  '.cr-dy-lbl{background:#f9f6ef;color:#c8a878;font-weight:500;font-size:14px!important}'+
  '.cr-dy-lbl-v{width:24px;writing-mode:vertical-rl;letter-spacing:4px}'+
  '.cr-dy-hdr td:not(.cr-dy-lbl-v){background:#f9f6ef;color:#c8a878;font-size:10px!important}'+
  '.cr-dy-gz{font-size:14px}'+
  '.cr-dy-ss{font-size:11px;color:#999;display:block;margin-top:0}'+
  '.cr-dy-cur{color:#d82828;font-weight:bold}'+
  '.cr-dy-liu td{font-size:12px}'+
  '.cr-dy-info-row td{font-size:14px;padding:6px;text-align:center;color:#333}'+
  '.cr-dy-info-row td{background:#f3f3f3}'+
  '@media(max-width:340px){.cr-pan td{padding-left:8px!important;padding-right:8px!important}.cr-pan .panItem{font-size:15px!important;line-height:30px!important}.cr-card{font-size:11px;padding:4px 6px}.cr-bz-zao td{font-size:15px!important}.cr-dy-gz{font-size:14px!important}}'+
  '</style>';

  if(containerId){let el=document.getElementById(containerId);if(el)el.innerHTML=h;else return h;}
  return h;
};

// === 穿壬输入面板 ===
window.renderChuanRenInputs= d => {
  d=d||{};
  let GZ=[];for(let i=0;i<60;i++)GZ.push(G[i%10]+Z[i%12]);
  let selYS=d.yongShen||'',selGR=d.guiRen||'阳贵',selNM=d.nianMing||'子',selGD=d.gender||'男';
  let selZJ=d.ziJu||'自动',selSK=d.shiKe||'时家';
  let ZJ_OPTS=['自动','阳1','阳2','阳3','阳4','阳5','阳6','阳7','阳8','阳9','阴1','阴2','阴3','阴4','阴5','阴6','阴7','阴8','阴9'];
  let h='<div class="cr-input-panel">';
  h+='<table style="width:100%;border-collapse:collapse"><tr>';
  h+='<td style="width:40px;font-size:13px;color:#666;text-align:right;padding-right:4px">用神</td>';
  h+='<td><select id="crYongShen" class="sel-date" style="width:100%" onchange="doChuanRen()">';
  GZ.forEach(gz => {h+='<option value="'+gz+'"'+(gz===selYS?' selected':'')+'>'+gz+'</option>';});
  h+='</select></td>';
  h+='<td style="width:40px;font-size:13px;color:#666;text-align:right;padding-right:4px">贵人</td>';
  h+='<td><select id="crGuiRen" class="sel-date" style="width:100%" onchange="doChuanRen()"><option value="阳贵"'+(selGR==='阳贵'?' selected':'')+'>阳贵</option><option value="阴贵"'+(selGR==='阴贵'?' selected':'')+'>阴贵</option></select></td>';
  h+='</tr><tr>';
  h+='<td style="font-size:13px;color:#666;text-align:right;padding-right:4px">年命</td>';
  h+='<td><select id="crNianMing" class="sel-date" style="width:100%" onchange="doChuanRen()">';
  Z12.forEach((z, i) => {h+='<option value="'+z+'"'+(z===selNM?' selected':'')+'>'+z+'</option>';});
  h+='</select></td>';
  h+='<td style="font-size:13px;color:#666;text-align:right;padding-right:4px">性别</td>';
  h+='<td><select id="crGender" class="sel-date" style="width:100%" onchange="doChuanRen()"><option value="男"'+(selGD==='男'?' selected':'')+'>男</option><option value="女"'+(selGD==='女'?' selected':'')+'>女</option></select></td>';
  h+='</tr><tr>';
  h+='<td style="font-size:13px;color:#666;text-align:right;padding-right:4px">自选</td>';
  h+='<td><select id="crZiJu" class="sel-date" style="width:100%" onchange="doChuanRen()">';
  ZJ_OPTS.forEach(z => {h+='<option value="'+z+'"'+(z===selZJ?' selected':'')+'>'+z+'</option>';});
  h+='</select></td>';
  h+='<td style="font-size:13px;color:#666;text-align:right;padding-right:4px">时刻</td>';
  h+='<td><select id="crShiKe" class="sel-date" style="width:100%" onchange="doChuanRen()"><option value="时家"'+(selSK==='时家'?' selected':'')+'>时家</option><option value="刻家"'+(selSK==='刻家'?' selected':'')+'>刻家</option></select></td>';
  h+='</tr></table>';
  h+='</div>';
  return h;
};
})();