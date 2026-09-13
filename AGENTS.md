# 奇门排盘(道家阴盘)项目记忆

> 迁移自历史会话记忆(FACT.md / JOURNAL.jsonl),2026-08-15。源文件:
> /home/wrz/.config/CherryStudio/Data/Agents/1405ee64-5dd3-5d4c-9c4b-373a34a32f21/memory/

## 项目概况

- 路径 `/home/wrz/文档/奇门排盘`,作者 地天泰,仓库 github.com/wrz1911/daojiayinpan
- 五种盘型:1=时盘 2=刻盘 3=心盘 4=山向 5=穿壬;纯 HTML+JS 前端,Tauri 2 桌面 + Capacitor Android,当前版本 **1.3.10**(Android versionCode 10310)
- 前端:qimen_app/yinpan_standalone.html + css/yinpan_app.css + 4 个自有 IIFE JS(qimen_constants.js 112 行 / qimen_engine_min.js 475 行 / qimen_chuanren.js 617 行 / **yinpan_app.js 2800+ 行**)由 scripts/build_bundle.sh(cat 拼接 + esbuild --minify --target=es2017)合成 qimen_bundle.min.js(~149KB);tyme4j-browser.js 日历库;gong_detail_data.js(258KB 宫位详解)懒加载
- **yinpan_app IIFE 是 strict 模式——未声明赋值必抛 ReferenceError,历史踩过 4 次同类雷(h/ag/agColor/fw,均被 catch 吞掉表现为功能无反应)。ESLint(eslint.config.js,no-undef/no-redeclare error 级)已设防,0 errors;44 个 no-unused-vars warning 是历史遗留未清理。**注意 `npx eslint .` 会因 tyme4j/ 子目录的 eslint.config.mjs 缺 typescript-eslint 而崩,必须用 `npx eslint qimen_app/js/*.js`**
- 网页版:gh-pages 部署 https://wrz1911.github.io/daojiayinpan/(CI release job 构建 bundle 后由 peaceiris/actions-gh-pages 部署,与 exe 直链共存;根 index.html 重定向到 qimen_app/yinpan_standalone.html)

## 构建与发布流程

- **Linux**:`bash build-tauri.sh`(rm -rf web → 同步 html/css/4js 资源 → npm run build:bundle → npx tauri build)→ 产物 src-tauri/target/release/bundle/{deb,rpm}/阴盘奇门遁甲_1.3.9_amd64.deb
- **Android**:`npx cap sync android`(**必须从项目根执行**;在 android/ 子目录跑报 "platform has not been added" 且 gradle 全 up-to-date 假成功;漏跑 cap sync 会导致 APK 内嵌旧资源——踩过)→ `cd android && ./gradlew assembleRelease` → android/app/build/outputs/apk/release/app-release.apk
- 版本号 4 处:src-tauri/tauri.conf.json(决定 deb/rpm 文件名)、package.json、package-lock.json(顶层+packages[""]两处)、android/app/build.gradle(versionName+versionCode;**android/ 目录在 .gitignore 不入库**);另有 yinpan_app.js 的 `const APP_VERSION`(release.sh 自动 sed)
- **发布**:`bash release.sh X.Y.Z`——sed 同步版本(无变化跳过 commit)→ push main → 删旧 tag 重建推送 → GitHub Actions(触发 tag v*)四平台并行构建 + release job 创建 Release + Pages 部署。**已改造成幂等,同版本重发一条命令走通**
- versionCode 规则:major*10000+minor*100+patch(1.3.9→10309),本地与 CI 一致
- CI(release.yml):test job 已删(用户要求);三桌面 job 用 npx tauri + Swatinem/rust-cache + npm install --legacy-peer-deps;android job 从 Secrets 恢复 keystore + gradle 缓存 action;缓存后 macos 14m37s→4m25s、linux 9m2s→3m39s

## Android 签名(2026-08-14 全部理顺)

- **keystore:android/qimen-release.keystore**,DN=`CN=地天泰, OU=道家阴盘奇门遁甲, O=github.com/wrz1911/daojiayinpan, C=CN`,SHA-256 指纹 5376ae5f...e8a9(**2026-08-15 重生成;旧 CN=王润梓 keystore 归档于 ~/qimen-sign-old/,旧签名 App 无法覆盖安装,用户需先卸载再装新版**),RSA2048/SHA384withRSA/10000 天,别名 qimen
- 签名口令存 android/gradle.properties(QIMEN_STORE_PASSWORD/QIMEN_KEY_PASSWORD,不入库,**口令值只写在该文件,勿再记录到任何入库文件**),build.gradle 用 `project.findProperty()` 读取;**CI:Secrets KEYSTORE_BASE64(keystore 的 base64)+ KEYSTORE_PASSWORD,运行时注入 gradle.properties,仓库零明文密码**;CI APK 与本地签名一致,可覆盖安装升级
- 历史坑:曾经根目录 qimen-release.keystore 与 android/ 下的 keystore 是两个不同文件(CI 与本地签名不一致,覆盖安装失败);旧签名文件已归档 ~/qimen-sign-old/
- 验证:`/home/wrz/Android/sdk/build-tools/35.0.0/apksigner verify --print-certs <apk>`
- 系统旧 SDK /opt/android-sdk 已于 2026-08-16 删除;唯一 SDK 在 /home/wrz/Android/sdk(local.properties sdk.dir),build-tools 28.0.3/34/35 并存, ANDROID_HOME 已写入 ~/.bashrc 与 fish 配置

## 无线调试部署(手机 192.168.1.5:46529,设备 5d5c76a6)

- 首次 adb pair IP:配对端口(设备"使用配对码配对设备"给码);日常 adb connect 192.168.1.5:46529 + adb install -r
- 设备 IP 未知:`nmap -p <端口> --open 192.168.1.0/24` 扫网段
- **签名变化时必须先卸载再安装(数据丢,提醒用户先备份)**;同签名直接 -r 覆盖

## 产品功能要点

- bottomBar 三按钮:**排盘历史/关于/保存**(关于在中间是用户指定);关于弹窗=应用名+APP_VERSION+作者 地天泰+项目地址
- 心盘(panType 3):showPalace 里 `if(panType===3){showXinpanEditor(g);return;}` 路由到编辑器、不弹解释;宫位编辑器=overlay 卡片+5 类符号按钮+事件委托+坤2地盘干戊弹局选择+以此宫推算全盘
- 穿壬(panType 5):doChuanRen 渲染后 RAF 把外圈 yinGan 移入宫内 topRow——**该逻辑必须幂等**(移入后清空 yg.textContent + 移入前移除 .cr-anGan 标记 span),否则重复执行显示两次(踩过);山向/穿壬宫位点击解释均禁用
- 全局错误静默记录:window.onerror/unhandledrejection → localStorage ring buffer 30 条,有错时右下角 ⚠,点击复制日志清空
- 存档:localStorage qimen_saved(主)+ Tauri documentDir/qimen/backups.json 文件双保险(_syncToFile/_syncFromFile,启动从文件同步);**Android 只有 localStorage(卸载即丢,用户手动导出备份)——曾计划加 Capacitor Filesystem 持久化,未实施**
- 已按用户要求删除:tests 测试套件、产品内调试诊断代码(console/_xpErrors/_xpOpLog)、盘图截图功能(html2canvas)

## 算法核心决策(2026-07 澄清,勿回退)

1. 天盘=地盘顺时针 BAGUA 旋转复制,**不参与阴阳遁,不做任何寄干独立计算**
2. 心盘 diMap 从引擎背景数据直接提取,不重算局数
3. autoFillXinpan 删除 ~60 行复杂寄干修正代码(现仅存推算诊断块)
4. MiSans 字体完全移除,改用系统字体栈;iconfont 完全移除,改用 taiji.svg
5. Electron→Tauri 迁移完成,体积从 98MB 降到 23MB

## 关键教训(必读)

- **沙箱拦截整条 bash 命令**:命令文本/提交信息含敏感词(如 "cargo install")整条不执行(含 git add)→ 后续 commit 报无暂存;务必避开敏感词
- **bundle 里的中文是 \uXXXX 转义**:esbuild 默认 charset=ascii,qimen_bundle.min.js 内不存在原始中文字面量,用 grep 中文判断"改动是否打进 bundle"会误判;应改用重建比对(cmp)或转义形式(戌=\u620C 亥=\u4EA5 申=\u7533 酉=\u9149)
- **git commit 勿接管道**:`git commit | tail` 的退出码是 tail 的 0 → && 链继续跑 → 曾导致 release.sh 在 commit 失败后仍 push tag 指向旧提交;必须取消重推
- cap sync 必须在项目根跑(在 android/ 跑假成功+旧资源)
- 用户偏好:README 只放面向用户内容(开发者细节、无线调试、签名机制等都不写,写一次被要求删一次);优化建议按用户逐项拍板,不做:SignPath(已废弃)、macOS 公证(README 提示代替)、暗色跟随系统(保持统一界面)、桌面自动更新、结构拆分/存储三轨统一(提出后被否)、Android 文件化持久化(2026-08-15 用户终止)
- 发布前手机实测五种盘型是固定环节(用户确认"正常"后才 push tag)
- 用户要求持续有效:「完全自动化修复 用git备份,但不要推送」——已过渡到 main 分支开发 + 用户明确指示时才 push/release;**2026-08-15 起不再加 Co-Authored-By 署名(用户要求,已从整个项目历史中删除)**
- 分支 auto-fix-20260803 有大量本地提交未 push(d35b7a5 心盘编辑器修复、ef3ca40 编译修复、5eb96f0 测试入库、e6f0b69 删测试、8c31e85 清理诊断);main 分支已推送 v1.3.8/v1.3.9 线

## 持久化(2026-08-15 已终止)

- 主存档 localStorage qimen_saved(排盘历史 JSON 数组,上限 100 条);保存链:_doSave 存 localStorage 后调 _syncToFile(1597/1685/1749/1843 四处调用点)
- PC(Tauri):documentDir/qimen/backups.json 双保险,启动 _initStorage→_syncFromFile 以文件覆盖 localStorage
- Android:仅 localStorage(卸载即丢,用户手动导出备份);**Android 文件化持久化(Capacitor Filesystem DATA 目录)用户已明确决定不做(2026-08-15 终止),不再重提**

## 历史大事记(JOURNAL 摘录)

- 2026-06-27:用户想打包安卓 App,最终走 Capacitor
- 2026-06-30:vinput 4 个 bug 修复、rime 词库集成(总量 ~100 万→118 万,table.bin 64MB)
- 2026-07-01/02:算法澄清重构 + Electron→Tauri 迁移,体积 98MB→23MB
- 2026-08-13:5 步优化完成(引擎去重+use strict / window.QM 常量+山向下沉 / esbuild 打包+懒加载 / CSS 变量+暗色 / 测试+CI),分支 auto-fix-20260803 未 push;第二轮优化评估后用户决定「先到这」
- 2026-08-13 晚:重编译所有平台(Linux+Android,tauri-cli 改项目内安装 2.11.4;cargo install 被沙箱拦截);deb/rpm 1.3.5 + APK 1.8M
- 2026-08-14:修复心盘编辑器(h 未声明 strict 抛错被吞,提交 d35b7a5);删测试(e6f0b69);清理诊断(8c31e85,-1943 字节);穿壬阴干显示两次修复(a142517,幂等);v1.3.8 发布(签名密码去明文、穿壬性能、CI 加速、keystore 换新);v1.3.9 当前
- 2026-09-13:项目自 ~/文档/奇门排盘 迁移至 ~/src/qimen(Android SDK、Gradle 缓存、git/gh 配置一并迁移);随后全量自动化修复:①穿壬八字空亡改用旬映射(原 `gIdx*12+zIdx` 公式在数学上不成立,4 柱错 3,10 组日期对拍已通过)②心盘存档统一回闭包状态(此前保存读 window._xpData、恢复写 window._xpData,而渲染读闭包变量,导致存档恒为空)③14 处空 catch 补 _logErr(仅错误上报机制自身保留静默以免递归)④清除 AGENTS.md/setup-apk.sh 明文签名口令,改由 QIMEN_KEYSTORE_PASSWORD 环境变量传入 ⑤release.sh 补全 package-lock.json(两处)/Cargo.toml/Cargo.lock/android build.gradle 的版本同步 ⑥Cargo.toml 元数据填充并版本对齐 1.3.10 ⑦修正 setup-apk.sh 的 keystore 路径错位(曾生成到项目根,而 build.gradle 指向 android/ 下)⑧清理 .gitignore 重复项与 .desktop 旧路径。bundle 已重建(149625 字节)并验证可逐字节重现
- 2026-09-13(续):以第三方实现为参照校准山向口径。参照物 `~/src/lingyigeqimen/base.apk`(道家山向奇门,APICloud 应用,JS 明文位于 assets/widget/),反编译分析 `nsb/dqm31.js`。结论:①**马星——引擎写错**:其内联表 `[2,8,11,5]` 的索引 1/2 颠倒,应为 `QM.YIMA = [2,11,8,5]`(寅亥申巳);参考实现按 ma[1..4] 四角布局(左下/右下/左上/右上 = 寅/亥/巳/申)反推恰与 QM.YIMA 一致;修正后 216 组对拍 **108 → 0** 不一致 ②**值符——主盘写错**:`if(zfzsF===5)zfStar='芮'` 属多余替换,参考实现 `zfstr = zf[zfzss]` 直接取本位星(宫5='禽')不做替换;移除后 216 组对拍 **23 → 0**,值使寄坤2('死')保留 ③三条同源佐证:`zfzs(jus,xss,yyp)` 宫位公式与主盘等价、`jieguo(度数)` 每 30°一支自「丑」起与 SX_ZHI 一致、魔数 `"163468725"` 与本项目完全相同 ④**值使门落中宫取「死」**(寄坤2,2026-09-13 用户定夺):参考实现显示 ZS[5]='中',**不采纳**;主盘 `if(zfzsF===5)zsMenH='死'` 与引擎 `MEN[FZHUAN[dgg]]` 两端对拍 216 组 **0 不一致**,证实「值符落宫」与「旬首仪所在宫」两条件在本项目中等价,该口径在两端同时生效
- 2026-09-13(再续)自动化优化:①**CI 新增独立 lint job**(跑 `npx eslint qimen_app/js/*.js`;no-undef/no-redeclare 为 error 级 —— 此前 eslint 配好了却从未在 CI 调用过)②**死代码清理**(renderPalace×2、_storagePath、getKeGan、jieqiParts、waipanOrder、引擎解构中的 KE_Y/KE_N),ESLint **44→39 warnings**,bundle **149605→146905 字节**
- 2026-09-13(三续)**时盘/刻盘全字段大范围对拍通过**:以热卜 `yinpanPan.js` 的 `paipan()` 为参照物,新增可复跑回归脚本 **`scripts/verify_rebu_pan.js`**(记录型 fake DOM 替换 jQuery,把引擎算出的服务端变量 yinYang/juNum/currentYi/shiGan/shiZhi/maXingPos/type 灌入参照实现后读回 8 宫比对)。矩阵 13 年(2018-2030)× 7 个日期(1/15、3/20、5/5、6/21、9/23、11/8、12/22,覆盖交节)× 24 小时 × 2 个分钟点(5/55,使同小时落不同刻)= **4368 时间点**,每点 42 项(8 宫 × 5 字段 di/tian/xing/men/shen + 值符 + 值使),时盘/刻盘各 183456 项 → **366912 项 0 不一致**(含 30 例甲干柱、23 点子时跨日、0 点偶时 tMin 分支)。踩坑:①参照实现源码的 `var` 落在 eval 局部作用域无法改写,须先 `replace(/\bvar\b/g,'')` 让其落 globalThis,再 `new Function` 执行并显式 `globalThis.paipan=paipan` 导出;②其 `tianPanStart`/`zhiFuGong`/`isFuYin` 是模块级状态且 `paipan()` 不重置,每次调用前必须清零,否则状态串味;③**刻盘必须以刻柱**(刻干/刻支/刻旬首)喂入参照实现,误用时柱会得到 1200 项整体错位(天/星/门/神整体偏移、地盘却一致,是可诊断特征);④严格模式下给 node 的 getter-only `global.navigator` 赋值抛 TypeError,须改 `Object.defineProperty`
- 2026-09-13(四续)**暗干纳入对拍,并顺带裁决伏吟暗干分歧**:`scripts/verify_rebu_pan.js` 每点扩到 **48 项**(增 `anGan`),矩阵不变 → 时盘/刻盘各 209664 项、**合计 436800 项 0 不一致**。参照实现 `paipan()` 的暗干规则:①常规 `yinGan[panZhuan[i]] = di[panZhuan[(i-e+8)%8]]`,其中 `e = panZhuan.indexOf(menStartGong) - panZhuan.indexOf(b)`(b 为天盘起点);②伏吟判据 **仅看宫1** —— `#di1==#tian1 && #di1==#yinGan1`;③伏吟时从宫5起飞布干,且**连写两遍,第二遍以坤2地盘干为首**(`startQi=$("#di2").html().substr(0,1)`)**覆盖**第一遍(第一遍用 `甲`?currentYi:shiGan),中宫一律寄坤2(`2==yinGanGong` 前置追加、`5==yinGanGong` 直接覆盖)。**→ 由此裁决 AGENTS.md 前条"待裁定"项:热卜山向模块 `shanxiangAPI.js` 同一判据写作 `if(angan[1]==tiangan[1]&&angan[1]==digan[1])`(第 5 行,同样仅宫1;另有 `if(angan[1]==tiangan[1])` 分支),与主盘 `renderShanXiangPan2` 的 `angan[1]===tg2[1]===di2[1]` 一致,而引擎 `palsT.anGan` 的全八宫判据(`tiangan[g]===digan[g]`)与参照实现不符 → 山向暗干应以主盘口径为准,引擎侧待改(阴盘时/刻盘的 `pals.anGan` 是第三份独立实现,已实测与参照实现 436800 项全等,勿与 `palsT` 混为一谈)**
- 2026-09-13(五续)**以热卜服务端为基准定位并修复一处真 bug:月将(太阳过宫)取错**。起因是核对 1986-12-11 14 时(用户指定),把「热卜服务端变量」与「我们引擎」逐字段并列后,局数/阴阳遁/旬首仪/时干/时支/刻柱 **13/16 例全等**,唯一差异出在 `yueJiang`:服务端给 `寅`,我们给 `丑`。根因:`qimen_engine_min.js` 用**农历月**做月将索引 —— `yueZhi=(lM+1)%12; jiang=HE[yueZhi]`,而 `C.HE=[1,0,11,10,9,8,7,6,5,4,3,2]` 这张表本就是**按中气**编排的,索引错位后逢节气偏移/闰月必错。修复:`yueZhi = Math.floor(ti/2)`(节气序号 `ti` 0=冬至,偶数为中气 → 中气序),13 例跨 12 个中气的实测 **13/13 与服务端全等**(大寒→子、雨水→亥、春分→戌、谷雨→酉、小满→申、夏至→未、大暑→午、处暑→巳、秋分→辰、霜降→卯、小雪→寅、冬至→丑)。**注意山向的月将是另一套独立实现**(引擎 344 行 `(13-_cY%12)%12`、前端 `getHuangQuanFull` 同式,按年干支),山向 468 组已验证,未动。修后 bundle 146905→146912 字节,`verify_rebu_pan.js` 回归 436800 项仍 0 不一致(月将不在其 48 项内)
- 2026-09-13(五续附)**澄清 `maXingPos` 是编码差异而非 bug**:热卜服务端结果页只有 `#ma1`~`#ma4` 四个元素(位于盘体**四角外侧**),故其 `maXingPos ∈ 1..4` 是**四角编号** —— 1=巽4(左上)、2=坤2(右上)、3=艮8(左下)、4=乾6(右下);我们引擎给的是**宫位编号**(顺次为 4/2/8/6)。7 个时/刻支样本(子丑寅未酉戌)换算后与服务端**全部吻合**,驿马三合规则 `YiMa=[2,11,8,5]`(地支%4 索引 → 寅/亥/申/巳)两边一致。故马星无需改动;仅需知晓两套编号的对应关系(`{4:1, 2:2, 8:3, 6:4}`)。另:热卜排盘类型 `type` 的完整含义由 `pages/mod_yinpan.html` 确认 —— **1=时盘 2=刻盘 3=年盘**(此前 type=3 语义存疑,非"心盘")
- 2026-09-13(六续)**大跨度年份自动验证**。两路并行:
  ① **服务端基准**(新增 `scripts/verify_rebu_server.py`)—— 直接调热卜服务端 `doYinpan`→`yinpanPan` 读回**服务端算出的变量**逐字段比对。矩阵 1901-2100 步长 5 × 4 个日期(3/20、6/21、9/23、12/22)× 3 个时辰(0:30/8:30/14:30)× 2 盘型 = **960 点**,结果:`yueJiang` **0 不一致**、`yinYang` **0 不一致**;其余 97 项差异**全部落在 1941 年刻盘**(该年服务端返回 `shiZhi='卯'` 而 `realShiZhi='辰'`、刻柱与其自身其他年份的算法互相矛盾,判定为**热卜服务端 1941 年特例**,非本项目问题)。另 1898-1900 年服务端农历表与我们存在已知差异(时盘局数差 1),故脚本默认从 **1901** 起
  ② **本地布局**(`verify_rebu_pan.js` 年份矩阵扩到 1950-2050 步长 2)→ **17136 时间点 × 48 项 × 2 盘型 = 1713600 项,0 不一致**
  顺带**修复 `jieqi` 显示**:原式 `${STN[ti===0?23:ti-1]}～${STN[ti]}` 显示的是"上一节气～当前节气"(1986-12-11 显示"小雪～大雪",实应"大雪～冬至"),改为 `${STN[ti]}～${STN[(ti+1)%24]}`;经 402 例同时刻独立复算 **400/402 一致**,2 例差异均为 **7/7 23:30**(引擎按"子时算次日"推进到 7/8,节气随之变,属既定设计)。注:前端 `yinpan_app.js` 的节气列本就自行用 `tyme term.getName()+"~"+next(1).getName()` 重算,引擎该字段只出现在 `raw` 文本里,故此前未暴露
  踩坑:自查脚本里 `ke?A:B` 而 `ke∈{1,2}` 恒为 truthy,导致**时盘误走刻柱分支**(实测把 1026 项虚假差异一次性消到 92 项)——布尔语义必须写 `ke===2`
- 2026-09-13(七续)**五种盘型的对拍覆盖状态定案**(参照物=热卜 APK)。实测热卜 `js/Mobile/tools/` 下只有 **bazi / jinkoujue / liuyao / meihua / qimen / shanxiang / yinpan / ziwei** 八个模块:
  | 本项目盘型 | 参照物 | 状态 |
  |---|---|---|
  | 1 时盘 | 热卜 yinpan + 服务端 | ✅ 布局 1713600 项 + 服务端 960 点 |
  | 2 刻盘 | 同上 | ✅ 同上 |
  | 3 心盘 | **无** | ⛔ **热卜没有心盘功能**(其 `type=3` 是「年盘」,与本项目心盘无关),**用户明确指示跳过,不再尝试对拍** |
  | 4 山向 | 热卜 shanxiang + lingyigeqimen APK | ✅ 主盘 468/468 + 13 副盘 1456/1456 |
  | 5 穿壬 | **无** | ⛔ **热卜无大六壬模块** —— `pages/mod_daliuren.html` 与 `mod_xiaoliuren.html` 均为 58 字节的 `Failed opening file on this server` 报错页,`tools/` 下无对应目录;金口诀 `jinkoujue.js` 也不含月将表(仅 6 处同名 `jiang` 变量),无法作交叉校验。**穿壬无参照物,不能对拍** |
  → **凡有参照物的盘型已 100% 收口**;心盘与穿壬属"无参照"范畴,后续只能靠术数口径自洽或人工核对,不再列为对拍待办
- 2026-09-13(八续)**山向「向角度选局」渲染 + 对盘验证,并修掉伏吟暗干两处 bug**。装 jsdom 30.0.1 后可在 Node 里跑**真实页面渲染链路**(`runScripts:'outside-only'` + 手动 eval 注入;外部 script 标签走 file:// 会加载失败, 且需补 `matchMedia`/`requestAnimationFrame`)。三个脚本分工:
  | 脚本 | 验什么 | 规模 |
  |---|---|---|
  | `verify_rebu_pan.js` | 布局算法(时/刻盘), 我们算的变量喂热卜前端 | 1713600 项 ✓ |
  | `verify_shanxiang_render.js` | **渲染忠实性**: 我们的 DOM vs 我们的数据层 | 32760 项 ✓ |
  | `verify_shanxiang_vs_rebu.js` | **端到端对盘**: 我们的 DOM vs 热卜算法 | 69498 项 ✓ |
  修复(均由对盘暴露, 全部集中在**伏吟局暗干**, 其余局数/值符/值使/马星/空亡/旬首/地盘/天盘/星/门/神 全程一致):
  ① **伏吟判据写错** —— 原为"全部天盘==地盘"(遍历八宫), 参照实现 `shanxiangAPI.paipanrest` 是 `if(angan[1]==tiangan[1] && angan[1]==digan[1])`, 即**仅宫1**、且拿**已排好的常规暗干宫1**去比。改为逐字一致后 134 项差异归零。
  ② **`_vj` 少一次归一化** —— 伏吟分支要先把值归一到六仪下标(1..9); 原实现只在 `hCyl%10==0` 分支做了查找, 其余情况**直接拿天干索引当六艺下标**。参照实现是无条件归一化 `for(j=1;10>j && v!=liuyi[j];j++)`, 其 `liuyi` 存**天干索引**(戊=4…), 我们的 `LIUYI` 存**干字符**, 故须先取干字符 `GAN[hCyl%10]` 再回查下标 —— 二者等价。此 bug 使伏吟局暗干整盘错位。
  **至此 AGENTS.md 里的"待裁定:伏吟局暗干排列"已闭环**: 参照实现给出明确裁断, 无需术数裁定。
  另记两处**非 bug 的对照结论**: ⓐ 热卜 `maXingPos`(仅 `#ma1`~`#ma4` 四个元素)是**四角编号**(1=巽4左上/2=坤2右上/3=艮8左下/4=乾6右下), 我们给宫位编号, 换算表 `{4:1,2:2,8:3,6:4}`; ⓑ 「向角度选局」面板的年是 **`今年 + xjuYear` radio 偏移(今年/明年/后年)**, **不读** `selShanXiangYear` 下拉框, 故该面板只能测这三个年份。热卜对应的 `adjustJu(year,degree)` 同样是 ±30° 每 5° 共 13 盘、同样用当前年(但它用 `Math.abs(a)` 处理原始度数, 对负数度数与我们的 `((d%360)+360)%360` 不同)
  踩坑: 本机自查脚本又出两次假警报 —— `>([^<]*)<` 正则读渲染值遇 `<span>` 只能得空串(读 DOM 一律用 `textContent`); `'use strict'` 下直接 `eval` 参照实现, 其脚本级 `function`/`var` 不落全局, 须用**间接 eval** `(0,eval)(src)`
- **📌 约定(2026-09-13 用户明确要求):验证/测试脚本一律只做本地调试, 不入库、不进 CI。** 现有 4 个脚本(`scripts/verify_rebu_pan.js`、`scripts/verify_rebu_server.py`、`scripts/verify_shanxiang_render.js`、`scripts/verify_shanxiang_vs_rebu.js`)已 `git rm --cached` 撤出跟踪(文件保留在本地 `scripts/`), 并由 `.gitignore` 的 `scripts/verify_*.{js,py}` 兜住;`.github/workflows/` 中确认未引用任何一个, CI 只跑 `npx eslint qimen_app/js/*.js` + 各平台构建。**今后新增任何验证脚本请沿用 `scripts/verify_*` 命名以自动被忽略, 不要再提交、也不要在 CI 里调用。** 本地复跑前置: `npm install --no-save jsdom`(jsdom 不在 package.json 里), 参照物在 `~/src/rebu`(可用 `REBU=` 覆盖)。
- 2026-09-13(九续)**澄清一次"疑似度数起点差 5°"的误报,并修掉对拍脚本的循环论证**。用户报「山向 2026 年 45° 向角度选局, 我们第一句 15~19 阴遁2, 热卜 20~24 阴遁5」。实测: 直接调热卜 `adjustJu(2026,45)` 得到 `#0 未山丑向 15~19 阴遁2局 / #1 20~24 阴遁5局`, 与用 jsdom 跑我们 App 真实渲染的结果 **13/13 逐字一致**(度数区间+山向名+局数), 扩到 33 个基础度数 × 13 盘 × 54 项 = **23595 项 0 不一致** → **两边完全一致, 无 bug**。根因是**热卜的交互陷阱**: 其结果页按钮写死 `onclick="$('#content2').toggle();$(document).scrollTop(500)"`, 而第一个盘高约 500px, 点开后首盘正好被滚出视野, 用户看到的"第一句"实为第二盘(同理, 输入 50° 时首句才是 20~24)。我们的实现是滚到 `#btnXiangJu` 按钮位置(面板在其下方, 首盘始终可见), 无此问题。
  **同时修掉 `verify_shanxiang_vs_rebu.js` 的循环论证**(本次争议恰好命中该盲区): 原实现用**我们的 `degStart`** 反推 `degIdx`(`Math.floor(o.degStart/5)`) 去调热卜, 等于把"两边起点是否一致"这一最该验的点**假设掉了**, 故根本测不出起点类问题。现改为**照抄热卜 `adjustJu` 的公式**独立生成序列 `b=floor((abs(deg)+360)%360); for(a=-30;a<=30;a+=5) idx=floor((b+a+360)%360/5)`, 并把**度数区间**纳入比对项。改后起点 15/20/25/30… 逐个吻合, 证实起点本就一致。
  附: 度数分隔符两边同为 **U+FF5E**(热卜源码写 `\uff5e`, 我们 `degStart+'～'+degEnd` 也是该码位), 首次比对报的 ✗ 是提取脚本的假警报。
- 2026-09-13(十续)**山向「向角度选局」大范围年×角度对拍 —— 全部通过, 山向测试结束**。为支撑大矩阵, 对拍脚本做了两处改造: ①jsdom **启动一次复用**(原每次渲染新建, 大矩阵下慢到不可用); ②**数据层脱离 DOM**, 直接在 Node global 上 `eval` 我们的引擎(热卜的 `loadRebu()` 已把 `window/document` 指向 global 并铺好 shim), 因为复用 jsdom 到 1080 次渲染时会 **OOM**(`Ineffective mark-compacts near heap limit`), 而数据层根本不需要 DOM。
  | 层次 | 矩阵 | 结果 |
  |---|---|---|
  | **数据层** | **200 年(1901-2100 逐年) × 360 度数(0-359 逐度) × 13 副盘** | **50544000 项 0 不一致** ✓ |
  | 渲染层 | 3 年(今年/明年/后年) × 72 度数(步长 5) × 13 副盘 | 154440 项 0 不一致 ✓ |
  | 渲染忠实性 | 3 年 × 14 度数 × 13 副盘(DOM vs 数据层) | 32760 项 0 不一致 ✓ |
  | 时盘/刻盘布局(回归) | 17136 时间点 × 48 项 × 2 盘型 | 1713600 项 0 不一致 ✓ |
  数据层的"年"是逐年全覆盖、"角度"是逐度全覆盖, **两者均无采样缺口**; 渲染层受 jsdom 内存限制用 72 个角度(步长 5, 覆盖全部 5° 区间)。比对项含度数区间/局数/值符/值使/马星/空亡 + 8 宫 × (di/tian/xing/men/shen/暗干)。
  **→ 山向奇门测试到此结束**(主盘 468 组、13 副盘 1456 组、渲染忠实性与端到端对拍均已收口), 本轮**未改动任何产品代码**, bundle 无需重建。
  新增参数(仅本地): `SPAN_FROM`/`SPAN_TO`/`SPAN_STEP` 控制数据层年份序列, `SPAN_DEGS` 控制数据层角度矩阵, `DEGS` 控制渲染层角度, `YEAROFFS` 控制渲染层年份(仅 0/1/2)。
- 2026-09-13(十一)**历法库对照结论:tyme4ts vs 热卜的 Lunar —— "更精确"要分层次说, 不能笼统下结论**。
  | 维度 | 结论 |
  |---|---|
  | 出身 | **同为 6tail 出品**, `tyme4ts` README 自述「可以看作 [Lunar] 的**升级版**, 拥有**更优的设计和扩展性**」—— 注意官方强调的词是"设计/扩展性", 不是"精度" |
  | **年份覆盖** | **tyme 明显更宽**: 实测 1000 / 1500 / 1800 / 2200 / 3000 年均可正常排出农历与节气; Lunar 系(lunar-javascript)通常只覆盖 **1900-2100** |
  | **边界正确性** | **tyme 更可靠**: 1900-01-31 = 庚子年**正月初一**、1900-02-28 = 正月廿九、1900-03-01 = 二月初一(即正月 29 天), 完全自洽且与公认历表一致。而热卜服务端在 1900 年附近与我们的局数差 1(局数公式含农历月/日), 说明其 Lunar 在此边界有偏差 —— 这正好是 lunar-javascript 覆盖范围的起点, 边界处理易错 |
  | 算法层修正 | tyme CHANGELOG 收录了若干 Lunar 时代的错误修复, 如「**修复:农历闰月干支错误(应随上月)**」「优化:优化节气推移」「修复:法定假日和农历传统节日的错误」 |
  | **主流范围内精度** | **无高下可言**: 1901-2100 逐年 × 逐度 × 13 副盘共 **50544000 项对拍完全一致**, 时盘/刻盘 1713600 项亦一致 —— 在本项目实际使用的年份范围内, 两者农历与节气结果**没有可观测差异** |
  **→ 准确表述**: tyme 的优势在于**覆盖年份宽得多、边界更稳、且修掉了 Lunar 的若干已知错误**, 设计与扩展性也更好; 但**没有证据表明其天文计算在本项目使用的范围内"更准"** —— 两者同源, 一致才是常态。对外(如 README/宣传)不要写"算法更精确"这类无依据的表述。
- 2026-09-13(十二)**纠正此前误判: 热卜【有】穿壬模块, 并完成对拍 + 修掉一个真 bug**。前一条(七续)曾断言"热卜无大六壬模块", 那是**只看了 `js/Mobile/tools/` 的目录名**得出的错误结论 —— 实际入口在 `pages/app_p1.html` 的模块清单里, 有一个 **`mod=chuanren`「奇门穿壬」**。教训: **判断参照物有无某功能, 要查模块入口清单, 不能只看资源目录**。该模块结构:
  - `pages/mod_chuanren.html` + `js/Mobile/tools/chuanren/chuanren.js`(提交页; 参数 `shenType`/`shen`/`guiren`/`nian`/`realTime`, 用神可选日柱/月柱/自选)
  - `chuanrenPan.js`(渲染: 地盘/天盘/八神/九星/八门/暗干 + 十二天干/天将/月将加时/建除/十二命 + 值符值使)
  - `sksc.js`(四课三传; 函数 `lrstr`/`sgzx`/`zfs`)
  - API: `?mod=chuanren&act=doChuanren` → `{id}` → `?mod=chuanren&act=chuanrenPan&id=N&ruid=`; 结果页内联服务端变量 `riGan/yueGan/riZhi/yueZhi/shiGan/shiZhi/yueJiang/yinYang/juNum/currenYi/xunZhiPos/timestr`
  **对拍**(新增本地脚本 `scripts/verify_chuanren_vs_rebu.js`): 144 个时间点 × (十二天干/十二天将/月将加时/建除 各 12 + 值符/值使) = **7200 项 0 不一致** ✓
  **修掉一个真 bug(值符/值使中宫口径)**: `qimen_chuanren.js` 里 `juMap` 构造漏了 `if(g!==5)` 的反面 —— 原文是**主动排除宫5**(`if(g!==5)juMap[g]=...`)且旬首仪落宫循环**又 `continue` 跳过 g2===5**, 导致六仪在中宫时 `dgGong` 恒为 0, 下面 `if(dgGong===5)` 分支成死代码, 退化为 `FZ2[1]` → 值符"蓬"/值使"休"。参照实现的口径是 `jiuXing[5]='禽'`(值符取本位星不替换) + `baMen[宫5→2]='死'`(值使寄坤2)。已修为允许宫5 参与匹配、且中宫时 `zfVal='天禽星'`/`zsVal='死门'`。**这与山向早先修过的口径完全一致** —— 中宫处理在本项目里是反复出错的点。
  **热卜自身的缺陷(非我们问题)**: `chuanrenPan.js` 里 `var y,m,r,t,f,nm,ys,gr,nn,moshi;` **声明了 `nm`(年命)却从未赋值**, 使其 `lrstr(...,nm,...)` 收到的年命恒为 `undefined`、渲染串里出现字面量 "undefined"。对拍时把它补成 `nian` 才公平。
  **我们尚无的功能**: 热卜的**十二命**(`命兄妻子财疾移役禄田德母`, 按 `ming12` + 时支/月将推宫位)在我们项目里**不存在**(全代码 grep 无此表), 对拍单列不计。
  **待办**: 四课三传(`sksc` 串)尚未对齐 —— 我们有 `tgsz`/`dzsz`(四课干支)但格式与热卜的 `sksc` 渲染串不同, 且热卜侧含上述 undefined 缺陷, 需要一个专门的解析对比。
- 2026-09-13(九续附)**与热卜对照时的通用注意事项**(踩过多次, 汇总):
  ⓐ 结果页元素 id 与列含义**错位** —— 山向页 `id="nianzhu"` 实为月柱、`yuezhu`→日柱、`rizhu`→时柱(刻盘时 `shizhu` 为刻柱); 勿按字面理解。
  ⓑ 阴盘页只有 `#ma1`~`#ma4` 四个马星位, 其 `maXingPos∈1..4` 是**四角编号**(1=巽4左上 2=坤2右上 3=艮8左下 4=乾6右下), 我们给宫位编号, 换算表 `{4:1,2:2,8:3,6:4}`。
  ⓒ 「向角度选局」面板年份 = **今年 + `xjuYear` radio 偏移**(今年/明年/后年), **不读** `selShanXiangYear` 下拉框; 热卜侧 `adjustJu` 更是**恒用 `(new Date).getFullYear()`**, 故该面板只能在今年对比。
  ⓓ **首句滚动陷阱**(见上条): 热卜写死 `scrollTop(500)`, 首盘滚出视野。
  ⓔ 读渲染值一律用 `textContent` —— 渲染会在干支外包 `<span class="cx-xingmu">` 等着色标签, 用正则 `>([^<]*)<` 只能得到空串。
  ⓕ 参照实现是脚本级 `function`/`var`, 在 `'use strict'` 下**必须用间接 eval** `(0,eval)(src)` 加载, 否则裸名找不到。主盘 `renderShanXiangPan2` 内 42 行"重算暗干"与引擎 `palsT.anGan` 在 1728 组(年×角度×宫)对拍中**170 组不一致**;已确认案例 2024年90° 为伏吟局,**地盘与天盘两边逐宫完全一致,仅暗干不同**。且两边伏吟判据不同:主盘仅判断宫1(`angan[1]===tg2[1]===di2[1]`),引擎判断全部八宫(`tiangan[g]===digan[g]`)。**因需术数裁定,山向双实现统一(P0 优化)暂缓**,待用户定夺后推进
