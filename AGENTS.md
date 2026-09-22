# 奇门排盘(道家阴盘)项目记忆

> 迁移自历史会话记忆(FACT.md / JOURNAL.jsonl),2026-08-15。源文件:
> /home/wrz/.config/CherryStudio/Data/Agents/1405ee64-5dd3-5d4c-9c4b-373a34a32f21/memory/

## 项目概况

- 路径 `/home/wrz/文档/奇门排盘`,作者 地天泰,仓库 github.com/wrz1911/daojiayinpan
- 五种盘型:1=时盘 2=刻盘 3=心盘 4=山向 5=穿壬;纯 HTML+JS 前端,Tauri 2 桌面 + Capacitor Android,当前版本 **1.3.10**(Android versionCode 10310)
- 前端:qimen_app/yinpan.html + css/yinpan_app.css + 4 个自有 IIFE JS(qimen_constants.js 112 行 / qimen_engine_min.js 475 行 / qimen_chuanren.js 617 行 / **yinpan_app.js 2800+ 行**)由 scripts/build_bundle.sh(cat 拼接 + esbuild --minify --target=es2017)合成 qimen_bundle.min.js(~149KB);tyme4j-browser.js 日历库;gong_detail_data.js(258KB 宫位详解)懒加载
- **yinpan_app IIFE 是 strict 模式——未声明赋值必抛 ReferenceError,历史踩过 4 次同类雷(h/ag/agColor/fw,均被 catch 吞掉表现为功能无反应)。ESLint(eslint.config.js,no-undef/no-redeclare error 级)已设防,0 errors;44 个 no-unused-vars warning 是历史遗留未清理。**注意 `npx eslint .` 会因 tyme4j/ 子目录的 eslint.config.mjs 缺 typescript-eslint 而崩,必须用 `npx eslint qimen_app/js/*.js`**
- 网页版:gh-pages 部署 https://wrz1911.github.io/daojiayinpan/(CI release job 构建 bundle 后由 peaceiris/actions-gh-pages 部署,与 exe 直链共存;根 index.html 重定向到 qimen_app/yinpan.html)

## 构建与发布流程

- **信息表压缩与系统字体缩放(2026-09-22)**: 实测 `#panHead`(信息表)占视口 **33.5%**(270px/805px), 挤压九宫格空间。两条修复: ①**CSS** —— 手机断点(`max-width:500px`)把 `--pan-lh` 22→19px、`--pan-pad` 3→2px(宫格内的 `--pan-lh-sm` 不动, 保符号可读性); ②**根因是 Android 系统字体缩放** —— `adb shell settings get system font_scale` = **1.25**, WebView 继承后 `html`=20px(16×1.25)、`body`=16.25px(CSS 明写 13px), 信息表每行被撑到 35px。Capacitor 无对应配置项, 只能改 Java: `build-android.ps1` 的 **5h 补丁**重写 `MainActivity.java` 加 `getBridge().getWebView().getSettings().setTextZoom(100)`。**实测 270→194px(−28%)**, td 字号回归 13px/行高 19px; ③**标头行独立行高** —— 用户提议"字号本来就小的表格本身也压缩": 旬首/值符/值使/马星/空亡 表头、年柱/月柱/日柱/时柱、各类侧标的字号本就是 `calc(--pan-fs − 4px)`(**只有 9px**), 却沿用正文 19px 行高。新增 `--pan-lh-xs` 变量(手机 13px/默认 16px/宽屏 20px), 对 `#tdTitle td`、`.sizhuTitle`、`.hd-side` 单独设行高与 1px 内边距。**累计 270→178px(−34%)**, 标头行 24→16px。⚠️ 该规则**必须带 `!important`** —— CSS 里另有 `#panHead #headTable td{...line-height:var(--pan-lh)!important}` 统一压了所有 td 行高, 不带就被它盖掉(实测第一次没生效就是这个原因)
- **上面这条踩了三个坑(都写进补丁注释了)**: a) Capacitor 7 生成的 `MainActivity.java` 是**空类**(只有 `extends BridgeActivity`, **没有 onCreate**), "替换 super.onCreate 再插一行"的补丁**找不到目标却不报错**; b) 用 **here-string 嵌 Java 源码会丢换行**, 导致 `setTextZoom` 被上一行 `//` 注释整个吃掉(编译通过但补丁无效) —— 改用数组 `-join "`n"`; c) **`.NET File.ReadAllText` 的相对路径基准是进程目录, 不是 PowerShell 的 `cd` 目录**, 验证文件内容时必须用绝对路径(否则报 DirectoryNotFound 让人误判)。结论: **补丁写完必须回读校验**(`-match 'setTextZoom\(100\)'`), 不能只看"已加入"
- **UI 空间排查结论(2026-09-22)**: 全盘扫过"有高度无文本"的元素共 46 个, **全部是功能性占位**, 无纯垃圾: 中宫 TD(阴盘规则"中宫不写、寄坤二")、`#ma1~#ma4`(四角马星位)、`#waipan1~12`(外圈隐干位)。**唯一误判记录**: 上下外圈各 48px 一度被我判为"54px 只放一个字", 实际**上/下外圈各是两行** —— 第一行 `waipan6/7/8`(隐干位) + 第二行 `yinGan9`(**中宫暗干, 寄坤二**); 下外圈同理(`yinGan1` 坎宫暗干 + `waipan2/1/12`)。48 = 24×2, **是功能内容不是浪费**, 只把 waipan 格 30→24px 挤出 12px。`#content` 结构: `center > TABLE(394×377) > [上外圈48 | 左外圈50+…+右外圈50 (281) | 下外圈48]`
- **信息表累计压缩(270→156px, −42%)**: ①Java 固定字体缩放 270→234; ②CSS 手机断点行高/内边距 234→194(实为同批); ③标头行独立行高(`--pan-lh-xs`) 194→178; ④**四柱横排**(去掉干支之间的 `<br>`, 49→27px) 178→156。四柱横排只改 `renderPan`(时盘/刻盘), **命理盘走 `qimen_mingli.js` 的 renderMingli, 不受影响**——而命理盘的节气行本就是合并式(`白露～秋分 月将巳 阴遁3局`), 可作时盘"类型并入节气"的设计参考。**⑤ 类型并入节气行**(照命理盘样式) 156→132px; **⑥ 自选局并入时间行** 表单卡 70→46px。两项均实测**未换行**。**节气的精确时刻完整保留**(`白露 9.7 22:41~秋分 9.23 08:05 · 阴遁2局【月将巳】` 一行放得下, 未牺牲择时信息); 同时去掉"时盘·/刻盘·"前缀(顶部模式栏已标明)与"排盘时间/自选局"两个标签。`#zxjRow` **保留为空容器**(`setPanType` 仍会写它的 display, 删掉会报错), 且 `setPanType` 里**必须同时管 `#zxjSpan` 的显隐** —— 自选局挪进 timeRow 后, 原来"只在显示分支处理"的写法会让心盘/山向/穿壬/命理下残留一个无用 select(已修)。**最终: 信息表 270→132px(−51%), 滚动高 962→758px, 视口 805px 内一屏放下**。**⑦ 日期行去重复(2026-09-22, 用户提问"时间选择器到日期之间有无优化空间")**: 顶部时间选择器(`2026/9/22 23:06`)与信息表日期行(`2026-09-22 23:06:00 (2026年八月十三日)`)的**公历部分 100% 重复**, 已把该行改为只显示农历(`农历 | 八月十三日`), 标签也从"日期"改"农历"。**⚠️ 试验记录: 曾试图把农历并入节气行以省掉整行, 实测会换行**(节气区间+农历+遁局+月将一行放不下, 节气行 24→43px), 净省仅 5px, 得不偿失, 故仍分两行 —— **此处高度上已无优化空间, 只是去掉了视觉冗余**。附带修一处隐患: `_doSave` 原依赖 `document.getElementById('dateTime').innerText` 取记录时间串, 改为直接用 `params` 里的 `year/month/day/hour/minute` + `window._nongliFull` 生成(**不再依赖 DOM 文本**, 该行内容变成农历后原写法会静默产生错误记录)
- **⑧ 空 `#zxjRow` 容器占位(2026-09-22, 用户指出"时间选择器到日期之间那段空白")**: 自选局搬进 `timeRow` 后, 原容器 `<div class="form-row" id="zxjRow" style="display:none">` 成了空盒子, **却仍占 9px**(`.form-row` 的 padding 4+4 + 1px 下边框) —— 实测"时间行底 69 → 信息表顶 80"之间的 **11px 空隙里, 有 9px 就是它**。**⚠️ 关键坑: HTML 上写的 `style="display:none"` 无效** —— `setPanType` 里 `zxjRow.style.display = hide ? 'none' : ''`, 那个 **`''`(空串) 表示"移除行内样式"**, 于是回落到 CSS 的 `.form-row{display:flex}`, 空盒子照样撑高。**凡是"靠行内 display 藏起来、但别处会用 `''` 重置它"的元素都会这样复活**。修法: 直接删掉该容器(JS 取值处有 `if(zxjRow)` 保护) → 空隙 11→2px, 表单卡 46→37px。**⑨ 日期行加回公历(2026-09-22 用户反馈"只留农历太单调")**: ⑦ 那次"去重复"压过头了 —— 信息密度与可读性要平衡, 公历已恢复显示: `日期 | 2026-09-22 23:16:00 (八月十三日)`。**农历仍然去掉"2026年"前缀**(公历与顶部选择器都有年份, 三处重复没必要)。**实测行高 24px 未换行, 信息表仍 132px、滚动高仍 749px, 没有多占空间** —— 当初那行本来就是"一行放得下"的, 去掉公历省不到高度, 只是视觉上少了信息。**教训: 压缩时别把"一行内能容纳的信息"当成冗余删掉**; 真正的冗余是没有信息量的空白(如 ⑧ 那个空容器), 而不是重复出现但各有用途的内容
- **⑩ 时间选择器与信息表融合(2026-09-22 用户要求, 山向/穿壬/命理同样)**: 原先是 `#timeRow` 的 `border-bottom` + `#headTable` 的 `border-top` **两条线相邻**再加 2px 空隙, 看着像两层。改法(全盘型通用的 CSS): `.form-card` 下内边距归零 + `#panHead #headTable{border-top:none}` —— 只留 `.form-row` 那**一条线**作为表格行分隔。**⚠️ 坑: `.form-card` 有两条规则, 手机断点那条 `.form-card{padding:2px 0!important}` 带 `!important`**, 只改默认规则(第 164 行)不生效 —— 又一次 `!important` 覆盖, 两处都要改。**实测六盘型空隙全为 0**。另注: 穿壬/命理的输入区(`#crInputs` 72px / `#mlInputs` 24px)是 JS 动态插在 `#panWrap` 之前的, **它们与信息表之间本就 0 空隙**(别把"输入区高度"误判成"空隙" —— 我的验证脚本第一版就这么错了)
- **⑪ 框线"粗"的真相: 两条线叠加(2026-09-22 用户反馈"时盘刻盘 时间选择 和下面日期 中间框线还是明显粗")**: ⑩ 只去掉了 `<TABLE id="headTable">` 的上边框, **但 `#panHead #headTable td{border:1px solid}` 给每个单元格都加了四边框** —— 首行 td 自己的 `border-top` 又是一条线, 与 `.form-row` 的下边框叠在一起, 视觉上就是 2px 的粗线。修法: **`#panHead #headTable tr:first-child td{border-top:none!important}`**, 同时把 `.form-row:last-child` 从 `border-bottom:none` **改回保留**(融合后这条线正是两个区域之间唯一的分隔线, 去掉会粘在一起)。**顺带对齐**: 实测 `#headTable` 有 1px 左右边框而 `.form-card` 是 0 → 时间选择器比信息表宽、"浮"在外面, 与"融合"的意图相反, 已给 form-card 补上同样的左右边框。验证结果: 首行 cell 上边框 0 / 表格上边框 0 / 时间行下边框 1px / 两侧边框均 1px
- **⚠️ "改了没生效"的第三次元凶: 同一元素多条规则, 其中带 `!important` 的那条在媒体查询里**。本会话已撞三次: ①标头行行高(被 `#panHead #headTable td{...!important}` 盖) ②form-card 下内边距(被 `@media(max-width:500px)` 里 `.form-card{padding:2px 0!important}` 盖) ③本次首行边框。**排查套路**: 先 `grep` 该选择器的**所有**出现(尤其媒体查询内), 再决定是改那条还是加 `!important`; 改完**必须实测 computed 值**, 不能只看源码改了
- **⑫ 节气行内分两行: 必须在同一个单元格内(2026-09-22)**: 用户要求"自选局数、月将还是在第二行中间显示"(因为选了自选局后会多出"自选"两字, 挤一行容易换行)。**⚠️ 第一版做错了**: 拆成两个 `<TR>` 且第二行 `colspan` 跨满全宽 —— 那一行的边框**自成一块**, 用户反馈"像突兀地又加了一个表格"。**正确做法**: 同一个 `<TD>` 内放两个 `<div>` —— 第一行节气靠左(跟着"节气"标签), 第二行局数+月将 `text-align:center` 居中。**凡是"在一个表格里加视觉分组"的需求, 优先在同一单元格内用块级元素分行, 而不是新增 `<tr>`** —— 后者会带来自成一体的边框。实测: 表格仍 6 行, 节气行 24→43px, 信息表 132→150px, 滚动高 765px(视口 805 仍一屏); 自选局场景 `自选 阴遁9局【月将巳】` 未换行
- **⑬ 月将挪到农历后、农历去括号去"日"(2026-09-22)**: 用户指出**月将变化慢**(一个月一换, 比局数稳定得多), 不该占着局数行的位置 → 移到日期行、跟农历并排: `日期 | 2026-09-22 23:31:00 八月十三【月将巳】`; 局数行随之只剩 `【自选】阴遁X局`。农历格式也按要求改为"八月十三"式: **去括号、去末尾"日"字**(`nongliShort = nongli.replace(/^\d+年/,'').replace(/日$/,'')`)。**注意 `window._nongliFull` 仍保留完整农历**(含"日"), 保存的排盘记录里时间串依旧是完整格式, 只有界面显示精简。实测: 表高 150px、滚动高 765px **均未变**(只是把月将从下一行挪上来, 不占额外空间)(改前需滚动 157px)
- **⚠️ CDP 测量必须 `am force-stop` 后再 `am start`**: 应用已在运行时, 单独 `am start` 只是**带到前台、不会重新加载页面**, 于是测到的仍是**旧 CSS/旧 JS** —— 这个坑让我一度以为"CSS 改了没生效"(实际是页面没重载), 白查一轮。另: 应用会**恢复上次盘型**(localStorage), 测某个盘型前要先 `click()` 对应 radio 并**回读确认** `input[name=panType]:checked`
- **内网网页版(2026-09-22)**: `npm run deploy:web` 把构建产物同步到 **192.168.1.3** 的 nginx, 手机浏览器直接开 **http://192.168.1.3/qimen_app/yinpan.html** 验证, 比装 APK 快得多。**已挂在 `npm run build:android` 之后自动执行**(失败只提示不影响 APK; 加 `-NoDeploy` 可跳过)。细节: 文档根 `/srv/http/qimen`(**属主 wrz, 可直接写, 不需要 sudo**); 推送 5 个文件(yinpan.html / yinpan_app.min.css→重命名为 yinpan_app.css / qimen_bundle.min.js / tyme4j-browser.js / gong_detail_data.js); `--with-apk` 可顺带推 `app-release.apk` 与下载页 `apk.html`。**口令不入库**: 读环境变量 `QIMEN_WEB_PASS` 或项目根的 `.qimen-web-pass`(已 gitignore)。注意另有一份独立拷贝在 `/home/wrz/qimen-web`(与文档根**不是**软链, 本脚本不更新它)
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

## 无线调试部署(固定端口 5555, 2026-09-22 重做)

- **手机无 root**(`id` = uid=2000(shell), 无 su), 故 Android 11+ 设置里的「无线调试」端口随机、**无法固定**, 且 `persist.adb.tcp.port` 也改不了 → 改用经典 TCP/IP 模式, 把 adbd 固定在 **5555**
- 一条命令: `npm run adb:wifi`(`scripts/adb-wireless.ps1`) —— 自动从 USB 设备读出手机 wlan0 地址并 `adb connect <ip>:5555`, 再回读属性确认通道可用
- **手机重启后 TCP 模式失效**: 用 USB 连一次并跑 `npm run adb:wifi -- -Setup` 重设(脚本内 `adb tcpip 5555`)
- 当前环境: 电脑 **192.168.1.2** / 手机 **192.168.1.4**(SSID "Wrz"), 序列号 **5d5c76a6**, 型号 25102RKBEC, Android 16 (API 36)。手机开着 VPN(tun0) 不影响 adb
- 所有命令需加 `-s 192.168.1.4:5555`, 例如无线安装:
  `D:\devtools\android-sdk\platform-tools\adb.exe -s 192.168.1.4:5555 install -r android\app\build\outputs\apk\release\app-release.apk`
  (实测传 2.08MB 包 **0.7 秒**, 约 2.9MB/s)
- **签名变化时必须先卸载再安装(数据丢, 提醒用户先备份)**;同签名直接 `-r` 覆盖
- 旧记录已废弃: 曾用「无线调试」的随机端口 `192.168.1.5:46529`(IP 与端口都会变, 故弃用)

## 产品功能要点

- **宫位长按(2026-09-22 用户要求, 同日修订)**: **时盘(1)/刻盘(2)/山向(4)/命理(6)** 四种盘型的宫位改为**长按 550ms 弹出宫位解释**, 四者**共用同一套逻辑**(`_bindGridLongPress` 事件委托 + `showPalace` 同一个解释渲染), 不各写一份 —— 区分盘型只靠一个数组常量。**心盘(3) 不在其列**: 宫位点击仍是打开宫位编辑器(`showXinpanEditor`); 穿壬(5) 无宫位解释。目的: 移动端防误触。实现三处: ①`LONG_PRESS_PAN_TYPES=[2,3,4,6]` 常量(yinpan_app.js:13622); ②`buildPaipanGrid` 对这四型**生成时就不挂内联 onclick**(`noInlineClick`, 与既有的 noClick 同思路 —— 靠渲染后清理容易漏); ③`_bindActionButtons` 改用 `_bindLongPress` 绑定。**同时静默启用了山向/命理的宫位解释**(原先 `showPalace` 开头 `panType===4||5||6` 直接 return) —— 数据本就齐备: 引擎 `pals[g]` 直接带 `shen/tian/di/xing/men/anGan`, 山向的 `_palaces` 是规范格式, 命理的 `_palaces` 引用 `qr.pals[g]`, 故**未改 qimen_mingli.js**。⚠️ **踩坑(已修): 山向/命理的符号是"简称", 与主盘格式不一致** —— 山向/命理的 `window._palaces` **直接引用引擎数据**, `shen/xing/men` 存的是**简称**('天'/'柱'/'生'); 而时盘/刻盘的来自 `renderPan` 解析, 存的是**全名**('九天'/'天柱'/'生门')。解释表(`SHEN_INFO`/`XING_INFO`/`MEN_INFO` 及 `*_FULL`/`WUCHENG_*`)的键全是全名 → 简称一路落空, 山向/命理弹窗里**满屏 undefined**。修法: `showPalace` 开头加 `_toFull(val, ABBR)`(简称经 ABBR 反查全名)归一化, 之后全程用 `pShen/pXing/pMen`, 四个模式这才真正共用同一套解释数据。**同时修掉一个运算符优先级 bug**: `'八神·'+(SHEN_ABBR||{})[x]||x` 因 `+` 优先于 `||`, 等价于 `('八神·'+…)||x` —— 查不到时得到的是**非空字符串 `'八神·undefined'`**, 兜底永不生效, 必须写 `'八神·'+((…)[x]||x)`
- **心盘长按"留白"与触屏合成鼠标事件(2026-09-22)**: 用户要求 **心盘短按=宫位编辑器, 长按暂不定义(预留后续功能)**。仅把心盘排除出 `LONG_PRESS_PAN_TYPES` **不够** —— Android WebView 在 `touchend` 后还会**补发一套合成的 `mousedown`/`mouseup`/`click`**, 于是"长按"松手时那次 click 照样走了短按的 onclick, 把编辑器打开了。三个要点: ①`begin` 里**绝不能重置**"抑制标志"(合成 mousedown 也会进 begin, 一重置就把标志清掉, 实测正是这里失效); ②长按成立时置位, 并在 document 的 **capture 阶段**用 `stopPropagation()+preventDefault()` 拦掉紧随的 click; ③加 **1.5 秒兜底超时**, 万一 click 没派发(被系统手势吃掉)标志不会残留、误拦下一次真短按。心盘长按的后续功能直接加在 `_bindGridLongPress` 里 `if (isExplain)` 的 else 支即可
- **宫位短按行为集中定义(2026-09-22)**: 与长按对称, 短按收敛到 `onGongShortPress(g)` —— 由 `buildPaipanGrid` 内联挂载(`onclick="onGongShortPress(N)"`, 仅 `opts.noClick` 的副盘除外), `_bindActionButtons` 只做兜底补绑。各盘型分工: **心盘(3) → 宫位编辑器**; **时盘(1)/刻盘(2)/命理(6) → 显式留白**(`SHORT_PRESS_RESERVED`, 用户要求预留、后续有别的用途, 写在那三个分支里即可); **山向(4)/穿壬(5) → 无短按行为**(山向的宫格本就以 `noClick:true` 渲染, 所以它的 `#gongN` 没有 onclick 属性, 是刻意的而非漏绑)。要点: **"留白"是显式占位, 不是碰巧没绑** —— 这样以后看到"点了没反应"不会误判成 bug; 长按成立后那次 click 由 `_bindGridLongPress` 在捕获阶段拦掉, 短按/长按互不干扰。真机手动测试五种盘型的短按/长按矩阵全部正常
- **先后天三宫标记(2026-09-22, 时/刻/命理 短按)**: 短按宫位 → 高亮「三宫通气」的三宫 —— 本宫(主题青 `--c-theme`) + **先天宫**(蓝 #5b8ff9, 过去/前因) + **后天宫**(橙 #f6903d, 未来/后果), 各带角标(本/先/后), 并在盘上方插入 `#xhBar` 说明条(含卦名与语义: `1宫坎 本宫 · 2宫坤 先天(过去/前因) · 7宫兑 后天(未来/后果)`)。再按同一宫取消; 换宫则切换; 重排盘后自动消失(判"是否已标记"以 DOM 为准而非只看变量)。数据 `XIANTIAN_GONG`/`HOUTIAN_GONG`/`GONG_GUA` 放在 `onGongShortPress` 旁, 由"同方位后天↔先天互换"推出并已与教材八宫对应表逐条对拍(见上条)。**⚠️ 两个坑**: ①**副盘复用同一批 gong id, 且就渲染在 `#panWrap > #yixinghuandouDIV` 里** —— 标记必须用 `_findMainGong()` 排除副盘, 否则标错宫; ②角标绝对定位需要给 td 补 `position:relative`(td 默认 static)。样式用 `box-shadow: inset 0 0 0 3px`(不撑表格布局)而非 border。**说明卡(2026-09-22 追加)**: `#xhBar` 不只是标位置, 而是把三宫各自的**卦名/五行/盘面符号(神·星·门·暗干)/关键词/卦意首句/角色说明**逐行列出, 末尾附"读法"(三宫合参、先天为体后天为用、伏吟可连翻)。数据全部复用现成来源: `GONG_INFO[g]`(name/wx/key/desc)、`window._palaces['gong'+g]`(盘面符号)、`window._kongGongs[g]`(空亡)。**空亡提示是动态的**: 本宫空亡 → 提示"约80%信息已转至先天宫X, 重点看该宫"; 先天宫空亡 → 提示"根源层信息被抽空, 可再翻一层或参对宫"。卦意 desc 太长(三宫全贴会刷屏), 只取第一句(`split(/[。；]/)[0]`)。**心盘(3) 的长按也是这个标记**(2026-09-22 用户定案, **取代原先的"留白"**): 心盘短按=宫位编辑器、长按=三宫标记, 两者靠"长按后那次 click 被捕获阶段拦掉"分离。实测三连: 心盘短按 `{"ovl":"flex","marks":""}`(开编辑器不标记) / 心盘长按 `{"ovl":"none","bar":true,"marks":"1本 2先 7后"}`(标记且不开编辑器) / 时盘长按 `文本1374→4927, 标记=[]`(弹解释不标记)。实现: `_bindGridLongPress` 的 `if (isExplain) showPalace(gn); else toggleXianhouMark(gn);`, 短按与长按共用同一个 `toggleXianhouMark`
- **CDP 自动化测点击时的一个反复踩的坑**: 用 `getBoundingClientRect()` 取宫位坐标后**不能在测量与触摸之间插入等待**, 否则页面延迟滚动/重排会让坐标失效 —— 表现为"触摸送达了(ts/te/click 计数正常)但 click 落在别的元素上"(实测落到了命理信息表的 `<p>`)。可靠做法: ①`scrollIntoView({behavior:'instant'})` 强制瞬间滚动; ②用 `document.elementFromPoint(x,y)` **反查该坐标是否真的命中目标宫位**(`hit.id==='gong1'`), 不命中就重试; ③测量后立即 `Input.dispatchTouchEvent`
- **验证触屏交互的可靠姿势**: 光看"弹窗有没有出现"容易被脚本自身缺陷骗(如复用旧坐标 —— overlay 开合会改变布局, 旧坐标已不在宫位上, 实测导致一次误判)。可靠做法是**注入事件探针**: 在宫位上挂 click 监听、在 document 挂 capture 监听, 长按后比较 `probe.gong` 与 `probe.doc` —— `doc>0 且 gong=0` 即"click 被派发但被捕获阶段拦下", 这才是因果链的直接证据; 配合读 `window._xpOverlay.style.display` 判断结果。⚠️ **首版实现有两个坑, 已修**: ①长按原先逐元素绑在 `_bindActionButtons` 里 —— 但该函数只在"心盘渲染"和"历史恢复"时调用, 主排盘流程根本不走它, 等于没绑; 现改为 **document 级事件委托 `_bindGridLongPress`**(只绑一次, 不受宫格重建影响, 且判定延迟到事件触发时才看 panType, 天然适配盘型切换)。②`panType` 存在**字符串来源**(存档/会话恢复路径), 而 `LONG_PRESS_PAN_TYPES.indexOf(panType)` 与 `panType === N` 都是严格比较 → 类型不符会静默失效; 现在 `setPanType` 开头统一 `parseInt` 归一化, 并新增 `isLongPressPanType()` 做防御。**验证方式(可复跑)**: 应用开了 `webContentsDebuggingEnabled`, 可用 CDP 直连 WebView 断言 —— `adb forward tcp:9230 localabstract:webview_devtools_remote_<pid>`(注意 **9222 常被本地 Chrome 占用**, 换端口), HTTP 拿 `/json` 里的 webSocketDebuggerUrl, Python `websocket-client` 需 `suppress_origin=True`(否则 403); 实测结果: 四型 `#gong1` 的 onclick 全为 null、时盘为 `showPalace(1)`、`window._gridLpBound=true`、山向长按后 divs 85→135/text 1282→4859/overlay 2→3 即弹窗出现。注意 **WebView 在后台会挂起 JS**, 跑 CDP 前必须先 `am start` 把应用拉回前台
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
- 2026-09-13(续):以第三方实现为参照校准山向口径。参照物 `参照应用①(base.apk)`(某山向排盘应用(APICloud 应用),JS 明文位于 assets/widget/),反编译分析 `nsb/dqm31.js`。结论:①**马星——引擎写错**:其内联表 `[2,8,11,5]` 的索引 1/2 颠倒,应为 `QM.YIMA = [2,11,8,5]`(寅亥申巳);参考实现按 ma[1..4] 四角布局(左下/右下/左上/右上 = 寅/亥/巳/申)反推恰与 QM.YIMA 一致;修正后 216 组对拍 **108 → 0** 不一致 ②**值符——主盘写错**:`if(zfzsF===5)zfStar='芮'` 属多余替换,参考实现 `zfstr = zf[zfzss]` 直接取本位星(宫5='禽')不做替换;移除后 216 组对拍 **23 → 0**,值使寄坤2('死')保留 ③三条同源佐证:`zfzs(jus,xss,yyp)` 宫位公式与主盘等价、`jieguo(度数)` 每 30°一支自「丑」起与 SX_ZHI 一致、魔数 `"163468725"` 与本项目完全相同 ④**值使门落中宫取「死」**(寄坤2,2026-09-13 用户定夺):参考实现显示 ZS[5]='中',**不采纳**;主盘 `if(zfzsF===5)zsMenH='死'` 与引擎 `MEN[FZHUAN[dgg]]` 两端对拍 216 组 **0 不一致**,证实「值符落宫」与「旬首仪所在宫」两条件在本项目中等价,该口径在两端同时生效
- 2026-09-13(再续)自动化优化:①**CI 新增独立 lint job**(跑 `npx eslint qimen_app/js/*.js`;no-undef/no-redeclare 为 error 级 —— 此前 eslint 配好了却从未在 CI 调用过)②**死代码清理**(renderPalace×2、_storagePath、getKeGan、jieqiParts、waipanOrder、引擎解构中的 KE_Y/KE_N),ESLint **44→39 warnings**,bundle **149605→146905 字节**
- 2026-09-13(三续)**时盘/刻盘全字段大范围对拍通过**:以参照应用② `yinpanPan.js` 的 `paipan()` 为参照物,新增可复跑回归脚本 **`scripts/verify_refimpl_pan.js`**(记录型 fake DOM 替换 jQuery,把引擎算出的服务端变量 yinYang/juNum/currentYi/shiGan/shiZhi/maXingPos/type 灌入参照实现后读回 8 宫比对)。矩阵 13 年(2018-2030)× 7 个日期(1/15、3/20、5/5、6/21、9/23、11/8、12/22,覆盖交节)× 24 小时 × 2 个分钟点(5/55,使同小时落不同刻)= **4368 时间点**,每点 42 项(8 宫 × 5 字段 di/tian/xing/men/shen + 值符 + 值使),时盘/刻盘各 183456 项 → **366912 项 0 不一致**(含 30 例甲干柱、23 点子时跨日、0 点偶时 tMin 分支)。踩坑:①参照实现源码的 `var` 落在 eval 局部作用域无法改写,须先 `replace(/\bvar\b/g,'')` 让其落 globalThis,再 `new Function` 执行并显式 `globalThis.paipan=paipan` 导出;②其 `tianPanStart`/`zhiFuGong`/`isFuYin` 是模块级状态且 `paipan()` 不重置,每次调用前必须清零,否则状态串味;③**刻盘必须以刻柱**(刻干/刻支/刻旬首)喂入参照实现,误用时柱会得到 1200 项整体错位(天/星/门/神整体偏移、地盘却一致,是可诊断特征);④严格模式下给 node 的 getter-only `global.navigator` 赋值抛 TypeError,须改 `Object.defineProperty`
- 2026-09-13(四续)**暗干纳入对拍,并顺带裁决伏吟暗干分歧**:`scripts/verify_refimpl_pan.js` 每点扩到 **48 项**(增 `anGan`),矩阵不变 → 时盘/刻盘各 209664 项、**合计 436800 项 0 不一致**。参照实现 `paipan()` 的暗干规则:①常规 `yinGan[panZhuan[i]] = di[panZhuan[(i-e+8)%8]]`,其中 `e = panZhuan.indexOf(menStartGong) - panZhuan.indexOf(b)`(b 为天盘起点);②伏吟判据 **仅看宫1** —— `#di1==#tian1 && #di1==#yinGan1`;③伏吟时从宫5起飞布干,且**连写两遍,第二遍以坤2地盘干为首**(`startQi=$("#di2").html().substr(0,1)`)**覆盖**第一遍(第一遍用 `甲`?currentYi:shiGan),中宫一律寄坤2(`2==yinGanGong` 前置追加、`5==yinGanGong` 直接覆盖)。**→ 由此裁决 AGENTS.md 前条"待裁定"项:参照应用②山向模块 `shanxiangAPI.js` 同一判据写作 `if(angan[1]==tiangan[1]&&angan[1]==digan[1])`(第 5 行,同样仅宫1;另有 `if(angan[1]==tiangan[1])` 分支),与主盘 `renderShanXiangPan2` 的 `angan[1]===tg2[1]===di2[1]` 一致,而引擎 `palsT.anGan` 的全八宫判据(`tiangan[g]===digan[g]`)与参照实现不符 → 山向暗干应以主盘口径为准,引擎侧待改(阴盘时/刻盘的 `pals.anGan` 是第三份独立实现,已实测与参照实现 436800 项全等,勿与 `palsT` 混为一谈)**
- 2026-09-13(五续)**以参照应用②服务端为基准定位并修复一处真 bug:月将(太阳过宫)取错**。起因是核对 1986-12-11 14 时(用户指定),把「参照应用②服务端变量」与「我们引擎」逐字段并列后,局数/阴阳遁/旬首仪/时干/时支/刻柱 **13/16 例全等**,唯一差异出在 `yueJiang`:服务端给 `寅`,我们给 `丑`。根因:`qimen_engine_min.js` 用**农历月**做月将索引 —— `yueZhi=(lM+1)%12; jiang=HE[yueZhi]`,而 `C.HE=[1,0,11,10,9,8,7,6,5,4,3,2]` 这张表本就是**按中气**编排的,索引错位后逢节气偏移/闰月必错。修复:`yueZhi = Math.floor(ti/2)`(节气序号 `ti` 0=冬至,偶数为中气 → 中气序),13 例跨 12 个中气的实测 **13/13 与服务端全等**(大寒→子、雨水→亥、春分→戌、谷雨→酉、小满→申、夏至→未、大暑→午、处暑→巳、秋分→辰、霜降→卯、小雪→寅、冬至→丑)。**注意山向的月将是另一套独立实现**(引擎 344 行 `(13-_cY%12)%12`、前端 `getHuangQuanFull` 同式,按年干支),山向 468 组已验证,未动。修后 bundle 146905→146912 字节,`verify_refimpl_pan.js` 回归 436800 项仍 0 不一致(月将不在其 48 项内)
- 2026-09-13(五续附)**澄清 `maXingPos` 是编码差异而非 bug**:参照应用②服务端结果页只有 `#ma1`~`#ma4` 四个元素(位于盘体**四角外侧**),故其 `maXingPos ∈ 1..4` 是**四角编号** —— 1=巽4(左上)、2=坤2(右上)、3=艮8(左下)、4=乾6(右下);我们引擎给的是**宫位编号**(顺次为 4/2/8/6)。7 个时/刻支样本(子丑寅未酉戌)换算后与服务端**全部吻合**,驿马三合规则 `YiMa=[2,11,8,5]`(地支%4 索引 → 寅/亥/申/巳)两边一致。故马星无需改动;仅需知晓两套编号的对应关系(`{4:1, 2:2, 8:3, 6:4}`)。另:参照应用②排盘类型 `type` 的完整含义由 `pages/mod_yinpan.html` 确认 —— **1=时盘 2=刻盘 3=年盘**(此前 type=3 语义存疑,非"心盘")
- 2026-09-13(六续)**大跨度年份自动验证**。两路并行:
  ① **服务端基准**(新增 `scripts/verify_refimpl_server.py`)—— 直接调参照应用②服务端 `doYinpan`→`yinpanPan` 读回**服务端算出的变量**逐字段比对。矩阵 1901-2100 步长 5 × 4 个日期(3/20、6/21、9/23、12/22)× 3 个时辰(0:30/8:30/14:30)× 2 盘型 = **960 点**,结果:`yueJiang` **0 不一致**、`yinYang` **0 不一致**;其余 97 项差异**全部落在 1941 年刻盘**(该年服务端返回 `shiZhi='卯'` 而 `realShiZhi='辰'`、刻柱与其自身其他年份的算法互相矛盾,判定为**参照应用②服务端 1941 年特例**,非本项目问题)。另 1898-1900 年服务端农历表与我们存在已知差异(时盘局数差 1),故脚本默认从 **1901** 起
  ② **本地布局**(`verify_refimpl_pan.js` 年份矩阵扩到 1950-2050 步长 2)→ **17136 时间点 × 48 项 × 2 盘型 = 1713600 项,0 不一致**
  顺带**修复 `jieqi` 显示**:原式 `${STN[ti===0?23:ti-1]}～${STN[ti]}` 显示的是"上一节气～当前节气"(1986-12-11 显示"小雪～大雪",实应"大雪～冬至"),改为 `${STN[ti]}～${STN[(ti+1)%24]}`;经 402 例同时刻独立复算 **400/402 一致**,2 例差异均为 **7/7 23:30**(引擎按"子时算次日"推进到 7/8,节气随之变,属既定设计)。注:前端 `yinpan_app.js` 的节气列本就自行用 `tyme term.getName()+"~"+next(1).getName()` 重算,引擎该字段只出现在 `raw` 文本里,故此前未暴露
  踩坑:自查脚本里 `ke?A:B` 而 `ke∈{1,2}` 恒为 truthy,导致**时盘误走刻柱分支**(实测把 1026 项虚假差异一次性消到 92 项)——布尔语义必须写 `ke===2`
- 2026-09-13(七续)**五种盘型的对拍覆盖状态定案**(参照物=参照应用②(APK))。实测参照应用② `js/Mobile/tools/` 下只有 **bazi / jinkoujue / liuyao / meihua / qimen / shanxiang / yinpan / ziwei** 八个模块:
  | 本项目盘型 | 参照物 | 状态 |
  |---|---|---|
  | 1 时盘 | 参照应用② yinpan + 服务端 | ✅ 布局 1713600 项 + 服务端 960 点 |
  | 2 刻盘 | 同上 | ✅ 同上 |
  | 3 心盘 | **无** | ⛔ **参照应用②没有心盘功能**(其 `type=3` 是「年盘」,与本项目心盘无关),**用户明确指示跳过,不再尝试对拍** |
  | 4 山向 | 参照应用② shanxiang + 参照应用① APK | ✅ 主盘 468/468 + 13 副盘 1456/1456 |
  | 5 穿壬 | **无** | ⛔ **参照应用②无大六壬模块** —— `pages/mod_daliuren.html` 与 `mod_xiaoliuren.html` 均为 58 字节的 `Failed opening file on this server` 报错页,`tools/` 下无对应目录;金口诀 `jinkoujue.js` 也不含月将表(仅 6 处同名 `jiang` 变量),无法作交叉校验。**穿壬无参照物,不能对拍** |
  → **凡有参照物的盘型已 100% 收口**;心盘与穿壬属"无参照"范畴,后续只能靠术数口径自洽或人工核对,不再列为对拍待办
- 2026-09-13(八续)**山向「向角度选局」渲染 + 对盘验证,并修掉伏吟暗干两处 bug**。装 jsdom 30.0.1 后可在 Node 里跑**真实页面渲染链路**(`runScripts:'outside-only'` + 手动 eval 注入;外部 script 标签走 file:// 会加载失败, 且需补 `matchMedia`/`requestAnimationFrame`)。三个脚本分工:
  | 脚本 | 验什么 | 规模 |
  |---|---|---|
  | `verify_refimpl_pan.js` | 布局算法(时/刻盘), 我们算的变量喂参照应用②前端 | 1713600 项 ✓ |
  | `verify_shanxiang_render.js` | **渲染忠实性**: 我们的 DOM vs 我们的数据层 | 32760 项 ✓ |
  | `verify_shanxiang_vs_refimpl.js` | **端到端对盘**: 我们的 DOM vs 参照应用②算法 | 69498 项 ✓ |
  修复(均由对盘暴露, 全部集中在**伏吟局暗干**, 其余局数/值符/值使/马星/空亡/旬首/地盘/天盘/星/门/神 全程一致):
  ① **伏吟判据写错** —— 原为"全部天盘==地盘"(遍历八宫), 参照实现 `shanxiangAPI.paipanrest` 是 `if(angan[1]==tiangan[1] && angan[1]==digan[1])`, 即**仅宫1**、且拿**已排好的常规暗干宫1**去比。改为逐字一致后 134 项差异归零。
  ② **`_vj` 少一次归一化** —— 伏吟分支要先把值归一到六仪下标(1..9); 原实现只在 `hCyl%10==0` 分支做了查找, 其余情况**直接拿天干索引当六艺下标**。参照实现是无条件归一化 `for(j=1;10>j && v!=liuyi[j];j++)`, 其 `liuyi` 存**天干索引**(戊=4…), 我们的 `LIUYI` 存**干字符**, 故须先取干字符 `GAN[hCyl%10]` 再回查下标 —— 二者等价。此 bug 使伏吟局暗干整盘错位。
  **至此 AGENTS.md 里的"待裁定:伏吟局暗干排列"已闭环**: 参照实现给出明确裁断, 无需术数裁定。
  另记两处**非 bug 的对照结论**: ⓐ 参照应用② `maXingPos`(仅 `#ma1`~`#ma4` 四个元素)是**四角编号**(1=巽4左上/2=坤2右上/3=艮8左下/4=乾6右下), 我们给宫位编号, 换算表 `{4:1,2:2,8:3,6:4}`; ⓑ 「向角度选局」面板的年是 **`今年 + xjuYear` radio 偏移(今年/明年/后年)**, **不读** `selShanXiangYear` 下拉框, 故该面板只能测这三个年份。参照应用②对应的 `adjustJu(year,degree)` 同样是 ±30° 每 5° 共 13 盘、同样用当前年(但它用 `Math.abs(a)` 处理原始度数, 对负数度数与我们的 `((d%360)+360)%360` 不同)
  踩坑: 本机自查脚本又出两次假警报 —— `>([^<]*)<` 正则读渲染值遇 `<span>` 只能得空串(读 DOM 一律用 `textContent`); `'use strict'` 下直接 `eval` 参照实现, 其脚本级 `function`/`var` 不落全局, 须用**间接 eval** `(0,eval)(src)`
- **📌 约定(2026-09-13 用户明确要求):验证/测试脚本一律只做本地调试, 不入库、不进 CI。** 现有 4 个脚本(`scripts/verify_refimpl_pan.js`、`scripts/verify_refimpl_server.py`、`scripts/verify_shanxiang_render.js`、`scripts/verify_shanxiang_vs_refimpl.js`)已 `git rm --cached` 撤出跟踪(文件保留在本地 `scripts/`), 并由 `.gitignore` 的 `scripts/verify_*.{js,py}` 兜住;`.github/workflows/` 中确认未引用任何一个, CI 只跑 `npx eslint qimen_app/js/*.js` + 各平台构建。**今后新增任何验证脚本请沿用 `scripts/verify_*` 命名以自动被忽略, 不要再提交、也不要在 CI 里调用。** 本地复跑前置: `npm install --no-save jsdom`(jsdom 不在 package.json 里), 参照物在 `~/src/refimpl`(可用 `REBU=` 覆盖)。
- 2026-09-13(九续)**澄清一次"疑似度数起点差 5°"的误报,并修掉对拍脚本的循环论证**。用户报「山向 2026 年 45° 向角度选局, 我们第一句 15~19 阴遁2, 参照应用② 20~24 阴遁5」。实测: 直接调参照应用② `adjustJu(2026,45)` 得到 `#0 未山丑向 15~19 阴遁2局 / #1 20~24 阴遁5局`, 与用 jsdom 跑我们 App 真实渲染的结果 **13/13 逐字一致**(度数区间+山向名+局数), 扩到 33 个基础度数 × 13 盘 × 54 项 = **23595 项 0 不一致** → **两边完全一致, 无 bug**。根因是**参照应用②的交互陷阱**: 其结果页按钮写死 `onclick="$('#content2').toggle();$(document).scrollTop(500)"`, 而第一个盘高约 500px, 点开后首盘正好被滚出视野, 用户看到的"第一句"实为第二盘(同理, 输入 50° 时首句才是 20~24)。我们的实现是滚到 `#btnXiangJu` 按钮位置(面板在其下方, 首盘始终可见), 无此问题。
  **同时修掉 `verify_shanxiang_vs_refimpl.js` 的循环论证**(本次争议恰好命中该盲区): 原实现用**我们的 `degStart`** 反推 `degIdx`(`Math.floor(o.degStart/5)`) 去调参照应用②, 等于把"两边起点是否一致"这一最该验的点**假设掉了**, 故根本测不出起点类问题。现改为**照抄参照应用② `adjustJu` 的公式**独立生成序列 `b=floor((abs(deg)+360)%360); for(a=-30;a<=30;a+=5) idx=floor((b+a+360)%360/5)`, 并把**度数区间**纳入比对项。改后起点 15/20/25/30… 逐个吻合, 证实起点本就一致。
  附: 度数分隔符两边同为 **U+FF5E**(参照应用②源码写 `\uff5e`, 我们 `degStart+'～'+degEnd` 也是该码位), 首次比对报的 ✗ 是提取脚本的假警报。
- 2026-09-13(十续)**山向「向角度选局」大范围年×角度对拍 —— 全部通过, 山向测试结束**。为支撑大矩阵, 对拍脚本做了两处改造: ①jsdom **启动一次复用**(原每次渲染新建, 大矩阵下慢到不可用); ②**数据层脱离 DOM**, 直接在 Node global 上 `eval` 我们的引擎(参照应用②的 `loadRebu()` 已把 `window/document` 指向 global 并铺好 shim), 因为复用 jsdom 到 1080 次渲染时会 **OOM**(`Ineffective mark-compacts near heap limit`), 而数据层根本不需要 DOM。
  | 层次 | 矩阵 | 结果 |
  |---|---|---|
  | **数据层** | **200 年(1901-2100 逐年) × 360 度数(0-359 逐度) × 13 副盘** | **50544000 项 0 不一致** ✓ |
  | 渲染层 | 3 年(今年/明年/后年) × 72 度数(步长 5) × 13 副盘 | 154440 项 0 不一致 ✓ |
  | 渲染忠实性 | 3 年 × 14 度数 × 13 副盘(DOM vs 数据层) | 32760 项 0 不一致 ✓ |
  | 时盘/刻盘布局(回归) | 17136 时间点 × 48 项 × 2 盘型 | 1713600 项 0 不一致 ✓ |
  数据层的"年"是逐年全覆盖、"角度"是逐度全覆盖, **两者均无采样缺口**; 渲染层受 jsdom 内存限制用 72 个角度(步长 5, 覆盖全部 5° 区间)。比对项含度数区间/局数/值符/值使/马星/空亡 + 8 宫 × (di/tian/xing/men/shen/暗干)。
  **→ 山向奇门测试到此结束**(主盘 468 组、13 副盘 1456 组、渲染忠实性与端到端对拍均已收口), 本轮**未改动任何产品代码**, bundle 无需重建。
  新增参数(仅本地): `SPAN_FROM`/`SPAN_TO`/`SPAN_STEP` 控制数据层年份序列, `SPAN_DEGS` 控制数据层角度矩阵, `DEGS` 控制渲染层角度, `YEAROFFS` 控制渲染层年份(仅 0/1/2)。
- 2026-09-13(十一)**历法库对照结论:tyme4ts vs 参照应用②的 Lunar —— "更精确"要分层次说, 不能笼统下结论**。
  | 维度 | 结论 |
  |---|---|
  | 出身 | **同为 6tail 出品**, `tyme4ts` README 自述「可以看作 [Lunar] 的**升级版**, 拥有**更优的设计和扩展性**」—— 注意官方强调的词是"设计/扩展性", 不是"精度" |
  | **年份覆盖** | **tyme 明显更宽**: 实测 1000 / 1500 / 1800 / 2200 / 3000 年均可正常排出农历与节气; Lunar 系(lunar-javascript)通常只覆盖 **1900-2100** |
  | **边界正确性** | **tyme 更可靠**: 1900-01-31 = 庚子年**正月初一**、1900-02-28 = 正月廿九、1900-03-01 = 二月初一(即正月 29 天), 完全自洽且与公认历表一致。而参照应用②服务端在 1900 年附近与我们的局数差 1(局数公式含农历月/日), 说明其 Lunar 在此边界有偏差 —— 这正好是 lunar-javascript 覆盖范围的起点, 边界处理易错 |
  | 算法层修正 | tyme CHANGELOG 收录了若干 Lunar 时代的错误修复, 如「**修复:农历闰月干支错误(应随上月)**」「优化:优化节气推移」「修复:法定假日和农历传统节日的错误」 |
  | **主流范围内精度** | **无高下可言**: 1901-2100 逐年 × 逐度 × 13 副盘共 **50544000 项对拍完全一致**, 时盘/刻盘 1713600 项亦一致 —— 在本项目实际使用的年份范围内, 两者农历与节气结果**没有可观测差异** |
  **→ 准确表述**: tyme 的优势在于**覆盖年份宽得多、边界更稳、且修掉了 Lunar 的若干已知错误**, 设计与扩展性也更好; 但**没有证据表明其天文计算在本项目使用的范围内"更准"** —— 两者同源, 一致才是常态。对外(如 README/宣传)不要写"算法更精确"这类无依据的表述。
- 2026-09-13(十二)**纠正此前误判: 参照应用②【有】穿壬模块, 并完成对拍 + 修掉一个真 bug**。前一条(七续)曾断言"参照应用②无大六壬模块", 那是**只看了 `js/Mobile/tools/` 的目录名**得出的错误结论 —— 实际入口在 `pages/app_p1.html` 的模块清单里, 有一个 **`mod=chuanren`「奇门穿壬」**。教训: **判断参照物有无某功能, 要查模块入口清单, 不能只看资源目录**。该模块结构:
  - `pages/mod_chuanren.html` + `js/Mobile/tools/chuanren/chuanren.js`(提交页; 参数 `shenType`/`shen`/`guiren`/`nian`/`realTime`, 用神可选日柱/月柱/自选)
  - `chuanrenPan.js`(渲染: 地盘/天盘/八神/九星/八门/暗干 + 十二天干/天将/月将加时/建除/十二命 + 值符值使)
  - `sksc.js`(四课三传; 函数 `lrstr`/`sgzx`/`zfs`)
  - API: `?mod=chuanren&act=doChuanren` → `{id}` → `?mod=chuanren&act=chuanrenPan&id=N&ruid=`; 结果页内联服务端变量 `riGan/yueGan/riZhi/yueZhi/shiGan/shiZhi/yueJiang/yinYang/juNum/currenYi/xunZhiPos/timestr`
  **对拍**(新增本地脚本 `scripts/verify_chuanren_vs_refimpl.js`): 144 个时间点 × (十二天干/十二天将/月将加时/建除 各 12 + 值符/值使) = **7200 项 0 不一致** ✓
  **修掉一个真 bug(值符/值使中宫口径)**: `qimen_chuanren.js` 里 `juMap` 构造漏了 `if(g!==5)` 的反面 —— 原文是**主动排除宫5**(`if(g!==5)juMap[g]=...`)且旬首仪落宫循环**又 `continue` 跳过 g2===5**, 导致六仪在中宫时 `dgGong` 恒为 0, 下面 `if(dgGong===5)` 分支成死代码, 退化为 `FZ2[1]` → 值符"蓬"/值使"休"。参照实现的口径是 `jiuXing[5]='禽'`(值符取本位星不替换) + `baMen[宫5→2]='死'`(值使寄坤2)。已修为允许宫5 参与匹配、且中宫时 `zfVal='天禽星'`/`zsVal='死门'`。**这与山向早先修过的口径完全一致** —— 中宫处理在本项目里是反复出错的点。
  **参照应用②自身的缺陷(非我们问题)**: `chuanrenPan.js` 里 `var y,m,r,t,f,nm,ys,gr,nn,moshi;` **声明了 `nm`(年命)却从未赋值**, 使其 `lrstr(...,nm,...)` 收到的年命恒为 `undefined`、渲染串里出现字面量 "undefined"。对拍时把它补成 `nian` 才公平。
  **我们尚无的功能**: 参照应用②的**十二命**(`命兄妻子财疾移役禄田德母`, 按 `ming12` + 时支/月将推宫位)在我们项目里**不存在**(全代码 grep 无此表), 对拍单列不计。
  **待办**: 四课三传(`sksc` 串)尚未对齐 —— 我们有 `tgsz`/`dzsz`(四课干支)但格式与参照应用②的 `sksc` 渲染串不同, 且参照应用②侧含上述 undefined 缺陷, 需要一个专门的解析对比。
- 2026-09-13(十三)**穿壬四课三传对拍完成 —— 穿壬全项收口**。在上一轮 7200 项基础上补齐四课三传, 并把**用神维度**(日柱/月柱)纳入矩阵: 144 个时间点 × 2 种用神 × (十二天干/十二天将/月将加时/建除 各12 + 值符 + 值使 + 天干四课×4 + 地支四课×4 + 三传×3)= **17568 项 0 不一致** ✓
  **四课三传的对齐方式**: 参照应用②的 `lrstr(a,b,h,g,e,c,d,m)` 返回 4 行字符串(`　　` 分隔、`<br>` 换行), 行序为 `b[4] f[4]` / `b[3] f[3] d[1]` / `b[2] f[2] d[2]` / `b[1] f[1] d[3]`, 其中 `b`=天干四课、`f`=地支四课、`d[1..3]`=时/运/命。我们的对应物是 `tgsz[1..4]`/`dzsz[1..4]`, 而"时运命"就是 时支/月将/年命。(`sm` 在 `chuanRenChart` 里是局部量、未导出, 但其语义即此三项, 不必改产品代码。)
  **两处曾导致误判的对齐陷阱**: ①**必须保留 `<br>` 再解析** —— 用 `clean()` 把标签去掉会让 4 行边界消失, 字段错位(我因此一度以为四课全错); ②**`lrstr` 的年命参数期望"生肖"而非地支** —— 函数内 `mstr()` 是 生肖→地支 的映射, 传地支会落进它的缺省分支(`...:"亥"`), 得到恒为"亥"的假值。
  **参照应用② chuanren 模块自身有三处缺陷**(均非我们问题, 对拍时需绕开或补齐):
  ⓐ `chuanrenPan.js` 里 `var y,m,r,t,f,nm,...` 声明后 **`t` 从未赋值**, 致 `sgzx(Math.floor(t))`→`sz=undefined`→`e[]`(月将加时盘)整盘算错;
  ⓑ 同处 **`nm`(年命)也从未赋值**, 表面症状是渲染串里出现字面量 `"undefined"`;
  ⓒ `sksc.js` 的 `mstr()` 生肖表**漏了"猪"**, 落到缺省分支返回"亥"(恰与猪同支, 故仅"猪"以外的非法输入才会显形)。
  → 因此**四课三传必须直接调 `lrstr()` 并自行喂正确参数**, 不能经由 `chuanrenPan.js`(它对 a/b 两个入参都是坏的)。
  **十二命**按用户要求**不做**(参照应用②有「命兄妻子财疾移役禄田德母」十二宫, 我们项目无此功能)。
  本轮**未改动产品代码**, bundle 无需重建。
- 2026-09-13(十四)**解析参照应用②「命理奇门」模块, 并据此修掉本项目一处错别字(司令→司命)**。
  **⚠ 首先纠正一个抓取错误**: 参照应用②模块清单里有两个名字相近的入口, 排在同一行 ——
  `mod=qimenmingli` 的入口名是「**阳盘命理**」, `mod=mingli` 的入口名才是「**命理奇门**」(其 `<title>` 为「阴盘命理奇门」)。
  **教训: 判定"某入口对应哪个 mod"必须读 `pages/app_p1.html` 里 `iconTitle` 与 `uniGo(actionFile+'?mod=...')` 的配对, 不能凭 mod 名猜。** 我第一轮把 `qimenmingli` 当成了命理奇门, 解析错了模块(该份解析本身无误, 已另存 `阳盘命理-完全解析.md`)。
  **「命理奇门」= 阴盘奇门 + 命理层**, 与本项目**同流派**。关键事实:
  - **参数比阳盘命理精简**: 只有 `name/gender/birthday/gongli/nongli/address/xiaLing/realTimeType/ziType/isExist` 十个字段, **没有** `way/jiGong/anGan/mode/flyMode` 那些排盘算法选项 —— 阴盘排法固定, 无需选。
  - **内联数据表与本项目逐字相同**: `qiyi`/`jiuXing`/`jiuXing2`/`baMen`/`baMen2`/`baShen`/`shenJue`/`ZhiGan`/`ShishengYang`/`ShishengYin`/`gongGua` 全一致(阳盘命理用的是"天蓬/休门"式**全名**表, 与本项目**不同**; 阴盘命理用的是与本项目相同的**单字**表)。
  - **命理层**: `shen12(1..4)` 按**年/月/日/时四柱分别起十二神将**(占卜盘只用时柱); `tianmenDihu()` 月将加时排十二月将全名 + 建除十二神; `state()` 十二长生(以日干查表按宫取"胎养/死墓/旺衰"等双字标签); `sihai()` 四害着色; `yun()`+`liunianShen()`+`year2jiazi()` 大运/流年/十神。
  - **与本项目结构对应**: `tianmenDihu` 的 `tianShen`+`shiJian` ≡ 我们引擎的 `TMS`+`DHS`(且 `jiang` ≡ `yuejiangPos`); `shen12`+`shenJiang`+`shenJue` ≡ 我们的 `SHENJIANG_NAMES`+`SHENJUE`; 外圈同样渲染到 `#waipan1..12`。DOM 差异: 它只有 `#kong1`/`#kong2` **两个**空亡位, 而阳盘命理有 `nianKong`/`yueKong`/`riKong`/`shiKong` 四个。
  - **★ 修掉的真错别字**: 本项目 `SHENJIANG_NAMES` 第 11 位写作「**司令**」, 参照实现是「**司命**」(十二神将标准名 青龙·明堂·天刑·朱雀·金匮·天德·白虎·玉堂·天牢·玄武·**司命**·勾陈, 司命主寿夭)。已改 `qimen_constants.js:69` 与 `yinpan_app.js:1336` **两处**, bundle 重建并校验(含「司命」、不含「司令」)。因两字等长, bundle 字节数不变(146868)。
  - API: `doMingli` → `{id}` → `mingliPan`; **有重名检测**(status "2" = 该客户姓名已存在, 弹「前往查看/重新排盘」)—— 命理模块以"客户"为单位建档, 这是占卜类模块没有的。
  - 回归: 时盘/刻盘 1713600 项、穿壬 17568 项均仍 0 不一致(该表只影响外圈十二神将显示, 不进排盘算法)。
- 2026-09-13(十五)**发布 v1.3.11 + 轮换 keystore 口令(安全事件处置)**。
  **① 发布**: `bash release.sh 1.3.11` —— 版本号 7 处同步(`tauri.conf.json`/`package.json`/`package-lock.json` 两处/`Cargo.toml`/`Cargo.lock`/`yinpan_app.js` 的 `APP_VERSION`/`android build.gradle` → versionName 1.3.11 + versionCode **10311**), 推送 `c7ab20c..346cd9a`(18 个提交)+ tag `v1.3.11`。**注意 release.sh 只 sed 源码不重建 bundle, 所以 `APP_VERSION` 要本地先重建进包**(本次已做), 否则直接用仓库内 bundle 的场景会显示旧版本号。lint job 14s 通过; android job 2m58s 成功。
  **② 安全事件**: 发布前扫描待推送内容, 发现 **keystore 明文口令曾进公开仓库历史** —— 引入于 `1eb8509`("更新项目记忆"), 清除于 `75d88d7`。仓库为 **PUBLIC**, 故该口令已泄露。本次推送**清除了最新版中的它**(`origin/main:AGENTS.md` 已无), 但**历史提交仍可被翻出**。
  **③ 处置: 轮换口令**(keystore 为 **PKCS12** 类型 ⇒ store 口令与 key 口令**必须相同**, 只需改一次):
  ```bash
  keytool -storepasswd -keystore android/qimen-release.keystore -storepass '<旧>' -new '<新>'
  ```
  ⚠️ 选项是 `-new` **不是** `-newpass`(JDK 26 的 keytool 会报"非法选项")。改后用 `keytool -list -v` 验证 **SHA-256 指纹不变**(`53:76:AE:5F:…:E8:A9`), 因此**老用户可覆盖安装, 无需卸载**。
  **④ 配套更新**(缺一不可):
  - `android/gradle.properties` 的 `QIMEN_STORE_PASSWORD`/`QIMEN_KEY_PASSWORD`(该文件被 `.gitignore` 的 `android/` 覆盖, 不入库)
  - GitHub Secrets **两个都要改**: `KEYSTORE_PASSWORD`(新口令) **和 `KEYSTORE_BASE64`** —— 因为 `keytool -storepasswd` 会**重新写入 keystore 文件**, base64 内容随之变化, 只改口令会让 CI 拿到"新口令 + 旧文件"而必然失败。
  - 改 Secrets 时遇到 GitHub API 连续返回 502/500, 属临时故障, **重试即成功**(务必检查 `gh secret set` 的退出码, 别用无条件的 `echo done` 掩盖失败)。
  **⑤ 纪律**: 口令**只**写在 `android/gradle.properties` 与 GitHub Secrets, **绝不进任何入库文件** —— 包括 AGENTS.md 这类"记忆文件"(本次泄露正是记进 AGENTS.md 造成的)。AGENTS.md 只记录"已轮换"这一事实, 不记录口令值。
- 2026-09-13(十六)**补全 MIT 许可声明**(用户要求"补充 mit 许可 tyme 补全")。核查出**三处缺失**:
  ① **`tyme4j/` 被 `.gitignore` 忽略 ⇒ `tyme4j/LICENSE` 从未入库** —— 也就是分发产物里**没有任何 tyme4ts 的许可文本**。而上游 tyme4ts 虽在 `package.json` 标了 `"license": "MIT"`,其 **dist 产物自身不含版权头**(`tyme4j/dist/index.js` 以 `"use strict";` 开头),所以不能指望它自带。→ 复制为 **`licenses/tyme4ts-LICENSE`** 入库(该路径不被忽略)。
  ② `qimen_app/js/tyme4j-browser.js`(tyme4ts 的浏览器构建产物,300749 字节)顶部无任何版权声明 → 补 **390 字节 MIT banner**(含库名/版本/仓库地址/`Copyright (c) 2024 6tail`/许可指引)。
  ③ `qimen_app/js/qimen_bundle.min.js` 无版权头 → `scripts/build_bundle.sh` 增加 banner 拼接,**同时含本项目与 tyme4ts 双方声明**。踩坑: **esbuild 会把 legal comment 挪到文件末尾**, 且 **stdin 管道模式不支持 `--banner:js`**, 故改为**压缩完成后再把 banner 前置拼接**;banner 里的版本号从 `yinpan_app.js` 的 `APP_VERSION` 自动抽取。
  另补 `package.json` 的 `"license": "MIT"`;README「开源声明」段补充 `licenses/` 目录指引与产物版权说明。
  ⚠️ **注意**: 本次补全是在 v1.3.11 的 CI 构建**已触发之后**推送的, 所以 **v1.3.11 的构建产物里不含这些 banner**, 下次发布(v1.3.12 起)才会带上。bundle 146868 → 147225 字节, 功能与版本号验证正常。
- 2026-09-13(九续附)**与参照应用②对照时的通用注意事项**(踩过多次, 汇总):
  ⓐ 结果页元素 id 与列含义**错位** —— 山向页 `id="nianzhu"` 实为月柱、`yuezhu`→日柱、`rizhu`→时柱(刻盘时 `shizhu` 为刻柱); 勿按字面理解。
  ⓑ 阴盘页只有 `#ma1`~`#ma4` 四个马星位, 其 `maXingPos∈1..4` 是**四角编号**(1=巽4左上 2=坤2右上 3=艮8左下 4=乾6右下), 我们给宫位编号, 换算表 `{4:1,2:2,8:3,6:4}`。
  ⓒ 「向角度选局」面板年份 = **今年 + `xjuYear` radio 偏移**(今年/明年/后年), **不读** `selShanXiangYear` 下拉框; 参照应用②侧 `adjustJu` 更是**恒用 `(new Date).getFullYear()`**, 故该面板只能在今年对比。
  ⓓ **首句滚动陷阱**(见上条): 参照应用②写死 `scrollTop(500)`, 首盘滚出视野。
  ⓔ 读渲染值一律用 `textContent` —— 渲染会在干支外包 `<span class="cx-xingmu">` 等着色标签, 用正则 `>([^<]*)<` 只能得到空串。
  ⓕ 参照实现是脚本级 `function`/`var`, 在 `'use strict'` 下**必须用间接 eval** `(0,eval)(src)` 加载, 否则裸名找不到。主盘 `renderShanXiangPan2` 内 42 行"重算暗干"与引擎 `palsT.anGan` 在 1728 组(年×角度×宫)对拍中**170 组不一致**;已确认案例 2024年90° 为伏吟局,**地盘与天盘两边逐宫完全一致,仅暗干不同**。且两边伏吟判据不同:主盘仅判断宫1(`angan[1]===tg2[1]===di2[1]`),引擎判断全部八宫(`tiangan[g]===digan[g]`)。**因需术数裁定,山向双实现统一(P0 优化)暂缓**,待用户定夺后推进
- 2026-09-21 **Windows 开发环境固化**(项目自 Linux `~/src/qimen` 迁至 Windows `D:\src\daojiayinpan` 后, 构建链的几处 Linux 假设逐项收口并落库):
  - **`sh`/`bash` 必须在 PATH** —— 所有构建脚本都是 bash 脚本, 而 Git for Windows 默认只把 `Git\cmd`(仅 git.exe)放进 PATH, 于是 `npm run build:bundle` 直接报 `'sh' is not recognized`。修法: 把 `C:\Program Files\Git\bin` 追加到**用户级** PATH(**不要**加 `Git\usr\bin`: 其 POSIX `find`/`sort` 会遮蔽系统同名命令)。验证 `sh -c 'sed --version|head -1'` 与 `echo abc|wc -c` 均可用(build_bundle.sh 依赖 sed/wc/mktemp)
  - **新增入口**: `npm run build:windows`(=`scripts/build-windows.sh`: 同步 web 资源 → `npx tauri build --no-bundle`, 与 CI windows job 一致)、`npm run setup:windows`(环境自检, `-Install` 自动补 Git PATH 与 Rust)。**`npm run build:linux` 与 `npm start` 在 Windows 上不适用** —— 前者打 deb/rpm; 后者的 `run-desktop.sh` exec 的是无扩展名的 `app`, 而 Windows 产物是 `app.exe`; 开发请用 `npx tauri dev`
  - **实测基线**: Rust 1.98.1(`stable-x86_64-pc-windows-msvc`) + MSVC 14.51.36231 + Windows SDK 10.0.26100 + WebView2 153 → `build:windows` 耗时 **3.0 分钟**, 产物 `src-tauri/target/release/app.exe` **4.33MB**; 启动后拉起 `msedgewebview2.exe` 子进程, 运行时正常
  - ⚠️ **VS 2026 陷阱**: VS 2026 的内部版本号是 **18**, 目录为 `C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools` —— **`vswhere` 必须带 `-prerelease` 才能识别它**(不带时 `-requires ...VC.Tools.x86.x64` 返回空, 会把已装好的 MSVC 误判为"未安装")。好消息: rustc 自身的工具链探测不受影响, **无需** vcvarsall 环境(最小链接测试 `rustc main.rs` → 运行即通过)
  - **行尾策略已固化**: 新增 `.gitattributes`(`* text=auto eol=lf`)。此前全局 `core.autocrlf=true` 让 Windows 工作区变 CRLF, 导致每次本地重建产物后 `git status` 出现 2 个**假修改**(`git diff` 内容实为空, 须手动 `git checkout` 才干净)。**这条是硬需求**: `qimen_bundle.min.js` 是入库产物, CI 有"重建后 `git diff --exit-code`"校验, 行尾不稳定会让该 job 误报; 固化后不再依赖任何本地 git 配置
  - **新机器/新克隆的顺序**: `npm run setup:windows`(先体检) → `npm install --legacy-peer-deps` → `npm run build:windows`
  - **git 身份**: Windows 上原本未配置, 首次 `git commit` 会以 `fatal: unable to auto-detect email address` 直接失败(机器名回退成 `user@host.(none)`); 已按 263 次历史提交的身份配好全局 `user.name`/`user.email`。换机器遇到同样报错时补这两项即可(`setup:windows` 会检出此项)。另: 远端是 SSH, 私钥带口令且 `ssh-agent` 服务默认停止 —— 推送前需在**管理员**终端 `Set-Service ssh-agent -StartupType Automatic; Start-Service ssh-agent; ssh-add`
  - **Android 构建链(可选)**: `npm run setup:android` 一键装 JDK 21(默认微软 OpenJDK 21 CDN, 失败自动回退 Adoptium) + Android SDK(commandline-tools / platform-tools / platforms;android-35 / build-tools;35.0.0)。**全程免管理员、无 UAC**: zip 解压到 `D:\devtools\jdk-21` 与 `D:\devtools\android-sdk`, 环境变量只写用户级(JAVA_HOME / ANDROID_HOME / ANDROID_SDK_ROOT / PATH), 不碰系统目录。`sdkmanager` 的许可与组件安装由脚本喂 `y` 完成; ⚠️ **新版 sdkmanager 会打印 "sdkmanager is deprecated", 且组件装好后退出码仍可能非 0 —— 成败必须以产物(aapt2 / android.jar / adb)核实, 只看退出码会误报失败**
  - **工具链已统一到 `D:\devtools\`**: `jdk-21` / `android-sdk` / `rustup` / `cargo` / `npm-cache` / `pnpm-store`(Gradle 缓存将落到 `gradle`)。用户级环境变量: `JAVA_HOME` / `ANDROID_HOME` / `ANDROID_SDK_ROOT` / `RUSTUP_HOME=D:\devtools\rustup` / `CARGO_HOME=D:\devtools\cargo` / `GRADLE_USER_HOME=D:\devtools\gradle`。迁移后实测 `cargo init+build`(输出 Hello, world!) / `javac 21.0.12.1` / `adb 1.0.41` / `sdkmanager` 全部正常; 跨盘用 `robocopy /MOVE /E`(退出码 0-7 均成功, 可中断重跑)
  - ⚠️ **改 npm 配置别用 `npm config set`**: 本机上它会以 `EPERM: operation not permitted, open 'C:\Users\strip\.npmrc'` 失败(文件被其他进程以共享模式持有), 而同一条路径用 PowerShell `Set-Content` 能写成功 —— 诊断: `[IO.File]::Open($p,'Open','Write','FileShare.ReadWrite')` 可打开, 而 `File.WriteAllText` 报 Access denied(它用的共享模式更严)。**结论: 直接改 `.npmrc` 用 `Set-Content`, 且保持无 BOM**(PS 5.1 的 `-Encoding UTF8` 会加 BOM; npm 能容忍, pnpm 的 rc 最好也写无 BOM)
  - ⚠️ **pnpm 命令当前不可用**(与本项目无关, 本项目用 npm): `pnpm store path` 报 `the global target of the pnpm shim points back at the shim` —— PATH 里优先命中 `%LOCALAPPDATA%\pnpm\bin\pnpm.exe`(自指 shim), 而 npm 全局那份可用的 `pnpm.cmd`(`%APPDATA%\npm`)排在后面。要修需处理 shim, 注意**同一 bin 目录里还有 `dsh` 的 shim, 别误删**
  - **Windows 本地打 debug APK(2026-09-22 实测通过)**: `npx cap add android` → `npx cap sync` → `cd android; .\gradlew.bat assembleDebug`, 首次 2m49s, 产物 `android/app/build/outputs/apk/debug/app-debug.apk` **4.81MB**, 打包内容已核验(bundle/tyme4j/gong_detail/css/html 全部进了 `assets/public/`)。**两处网络坑必须先处理**, 且 `android/` 是生成目录(不入库), 每次 `cap add android` 都会重建、改动会丢:
    ① `android/gradle/wrapper/gradle-wrapper.properties`: 官方 `services.gradle.org` 下载 Gradle 8.11.1 会失败(跟随重定向后连接被拒), 且 wrapper 默认 `networkTimeout=10000`(10 秒)对国内拉 200MB 太短 → 换成腾讯镜像 `https://mirrors.cloud.tencent.com/gradle/gradle-8.11.1-all.zip` + `networkTimeout=120000`
    ② `android/build.gradle`: 在 `google()` / `mavenCentral()` 之前插入阿里云镜像(`https://maven.aliyun.com/repository/google` 与 `/public`) —— 实测响应 11ms vs `google()` 1198ms
    ⚠️ **改 wrapper 配置时别用 `-replace 'distributionUrl=.*'`**: PowerShell 的 `-replace` 默认**不区分大小写**, 会连 `validateDistributionUrl=true` 一起改坏(实测踩到, 已重写该文件修正)
  - **本地包已与 CI 完全对齐(2026-09-22)**: `scripts/build-android.ps1` 复现了 release.yml 里 android job 的**全部 9 项定制** —— minSdk 31 / targetSdk 34、不透明状态栏(含 values-night 暗色定义)、R8 混淆 + shrinkResources + optimize 规则、ProGuard 保留 Capacitor 与 JavascriptInterface、硬件加速、移除 5 个 SMS 权限、versionName 取两段(1.4.0 → "1.4")/versionCode = major*10000+minor*100+patch、taiji.svg 生成的 5 档图标(Windows 上无 ImageMagick, 用 `scripts/make_launcher_icons.py` 的 svglib + Pillow 复现"#f5f5f5 底 + 等比缩放 + 居中 + extent")。**实测从零重建**(先删掉整个 android/)产物 **2.08MB**, 与 CI 的 2.03MB 基本一致, 配置逐项核对相同; 覆盖安装后 R8 版真机运行正常无崩溃
  - **签名材料放仓库根**: `qimen-release.keystore` + `qimen-signing.properties`(口令, 两者都已 gitignore)。放根目录是因为 **android/ 是生成目录, `cap add android` 会把密钥连同口令一起重建掉**; 脚本会自动把根目录的材料搬进工程, 所以"删掉 android/ 重新构建"不会丢签名能力
  - **本地 debug 包与 release 包的差别**: debug 用 Android Debug 证书、无 R8(4.81MB), 且**无法覆盖安装**到已有正式签名版的手机上(报 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`)
  - **本地 release 构建已实测(2026-09-22)**: 从原开发机(192.168.1.3, Arch, 用户 wrz)取回 `android/qimen-release.keystore` 与其 gradle.properties 口令后, `npm run build:android -- -Release` 出包 **3.75MB**, `adb install -r` **覆盖安装成功且数据保留**(判据: `firstInstallTime` 未变, 仍是 2026-08-15), 启动后时盘排盘/五行着色/九宫格渲染均正常。**签名核验**: `apksigner verify --print-certs <apk>` 的 SHA-256 必须等于 `5376ae5f026f504654380feeee5f4d656536ee6f27a359d74acd0e9d8bfae8a9`(也可 `adb pull` 手机上已装的 APK 反查该值); 远端三处副本(文档/奇门排盘、文档/奇门研究、src/qimen-flutter)指纹完全相同, 是同一密钥的多份拷贝。⚠️ **本地 debug 包无法覆盖安装**: 签名不同会报 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`
  - ⚠️ **keystore 路径的两种约定别混**: 本地把密钥放 `android/qimen-release.keystore`, 故 Gradle 里写 `rootProject.file('qimen-release.keystore')`(rootProject 即 android/); 而 **CI 把密钥放在仓库根**, 其注入的是 `file('../qimen-release.keystore')`。写错会报 `Keystore file '…\qimen-release.keystore' not found`(本次踩到, 已修正脚本)
  - **Windows 本地不产出** deb/rpm/AppImage(Linux 链路), 一律由 CI 构建; APK 本地可构建, 但 **release 签名需要 `android/qimen-release.keystore` + `android/gradle.properties` 的口令**(`android/` 不入库, 需从原开发机拷入), 缺密钥时只能打 debug 包
  - npm 11 的 allowScripts 会拦截 esbuild 的 postinstall, **实测无影响**(`@esbuild/win32-x64` 二进制随依赖装好, `npx esbuild --version` 正常), 不必批准
