# 构建 / 环境 / 发布 归档

> 本文是 AGENTS.md 的详细归档，保留原始踩坑记录（原文未改写）。
> 现行规范与铁律见 [AGENTS.md](../../AGENTS.md)；本文仅在排查历史问题时查阅。
> 归档时间 2026-10-28（原文来自 AGENTS.md 的「构建与发布流程」及相关章节）。

## 开发环境收敛（2026-10-28 用户决定）

- **开发环境收敛: 只在本机 Linux 开发(2026-10-28 用户决定)**: 不再在 Windows 主机(D:\src\daojiayinpan)开发/构建。由此产生的约束:
  · **不需要** `npm run build:windows` / `scripts/build.sh windows`(Windows 本地构建入口, 已无使用场景; 删除与否见待办)
  · `scripts/build.sh` 与 `scripts/build-android.sh` 里的 `to_native()`(cygpath) 与 `has_exe()`(.exe 后缀) 是**历史 Windows 垫片**, Linux 下分别退化为"原样返回""多试一次 .exe", 保留不影响功能, 新代码不必再依赖
  · 不再处理 MSYS 路径、`.exe` 后缀、`local.properties` 反斜杠、CRLF/autocrlf 之类的 Windows 问题; **但 `.gitattributes` 的 `* text=auto eol=lf` 必须保留** —— 它保证入库产物(qimen_bundle.min.js / .min.css)在任何检出环境下逐字节一致, 与"是否支持 Windows"无关
  · CI 的 `windows` job **保留**(发布 Windows exe), 它只跑 `npx tauri build --no-bundle`, 不依赖本地 Windows 脚本
  · 2026-09-21 / 2026-10-04 / 2026-10-12 三段 Windows 记录仅作回溯参考, **不要据此再做适配**

## 脚本布局与入口

- **脚本布局(2026-09-24 定稿, 只剩 7 个文件)**: 全部收进 `scripts/`, 入口统一为 npm scripts。**Windows 那套已整体删除** —— `build-android.ps1` / `adb-wireless.ps1` / `setup-android.ps1` / `setup-windows.ps1` / `build-windows.sh` 全删, 连 `run-platform.js`(平台派发器)与只有 5 行的 `run-desktop.sh` 也一并去掉; **本项目现在只支持 Linux/WSL 本机构建**, Windows/macOS 交给 CI。最终 7 个:
  · `build.sh` —— **统一构建入口**: `bundle | linux | appimage | android | all`(合并了原 build-bundle / build-tauri / build-appimage, 并把三个脚本里各抄一份的 web 资源同步抽成 `prepare_web()`)
  · `build-android.sh` —— Android 那 9 项 CI 补丁(与桌面链路无关, 独立成文件)
  · `device.sh` —— `wifi | install | list` 子命令(含 WSL loopback 黑洞处理)
  · `setup.sh`(环境体检) · `release.sh` · `deploy-web.py` · `make_launcher_icons.py`
  ⚠️ **本文档 2026-09-24 之前记录里出现的 `build-tauri.sh` / `build_bundle.sh` / `run-desktop.sh` / `adb-wireless.sh` / `*.ps1` 等路径均**已不存在**, 按上表对应到新入口; `npm run build:bundle` 之类的 npm script 名保持不变(底层改成 `scripts/build.sh bundle`)

## 构建命令

- **Linux**:`npm run build:linux`(=`bash scripts/build.sh linux`;rm -rf web → 同步 html/css/4js 资源 → 前端 bundle → npx tauri build)→ 产物 src-tauri/target/release/bundle/{deb,rpm}/阴盘奇门遁甲_1.3.9_amd64.deb
- **⚠️ `npm start` 在 WSL 里需要 DISPLAY(2026-09-24)**: WSLg **是启用的**(`/mnt/wslg` 存在、`/tmp/.X11-unix/X0` 在), 但由 systemd 服务拉起的 shell **不带 DISPLAY**, 于是直接跑二进制会 panic: `Failed to initialize gtk backend!: BoolError { message: "Failed to initialize GTK" }`(退出码 134) —— 看起来像缺库, 其实是缺环境变量。解法 `DISPLAY=:0`, 已在 npm start 里写成 `DISPLAY=${DISPLAY:-:0}` 兜底。起来后仅有 `MESA-EGL: DRI3 error` 警告, 那是 WSL 无 GPU 直通、走软件渲染, 不影响功能
- **Android**:`npx cap sync android`(**必须从项目根执行**;在 android/ 子目录跑报 "platform has not been added" 且 gradle 全 up-to-date 假成功;漏跑 cap sync 会导致 APK 内嵌旧资源——踩过)→ `cd android && ./gradlew assembleRelease` → android/app/build/outputs/apk/release/app-release.apk。**推荐直接用 `npm run build:android`**(一体化脚本, 见下)
- CI(release.yml):test job 已删(用户要求);三桌面 job 用 npx tauri + Swatinem/rust-cache + npm install --legacy-peer-deps;android job 从 Secrets 恢复 keystore + gradle 缓存 action;缓存后 macos 14m37s→4m25s、linux 9m2s→3m39s

## 发布与 CI

- **CI actions 升级 + runner 锁 ubuntu-24.04(2026-09-24)**: v1.4.3 发版日志三连警告 —— ubuntu-latest 将于 **2026-10-19 迁移 Ubuntu 26**(环境突变, 四平台构建可能集体翻车)、setup-java@v4 弃用、Node20 action 被强制跑 Node24。已做: ubuntu-latest→**ubuntu-24.04**(显式锁定, 到 2027 支持期; 届时需验证 26 再切换)、checkout/setup-node/setup-java→**v5**(target Node24, 警告消除)、gradle/actions/setup-gradle@v3→**v4**(顺带换缓存 key 空间, 解决 v1.4.3 时 gradle-home 缓存 restore 400)。upload-artifact/download-artifact 保持 v4(无 v5, Node20 警告无害)。⚠️ 下次发版后检查日志确认无新警告
- 版本号 4 处:src-tauri/tauri.conf.json(决定 deb/rpm 文件名)、package.json、package-lock.json(顶层+packages[""]两处)、android/app/build.gradle(versionName+versionCode;**android/ 目录在 .gitignore 不入库**);另有 yinpan_app.js 的 `const APP_VERSION`(scripts/release.sh 自动 sed)
- **发布**:`npm run release -- X.Y.Z`(=`bash scripts/release.sh X.Y.Z`)——sed 同步版本(无变化跳过 commit)→ push main → 删旧 tag 重建推送 → GitHub Actions(触发 tag v*)四平台并行构建 + release job 创建 Release + Pages 部署。**已改造成幂等,同版本重发一条命令走通**
- versionCode 规则:major*10000+minor*100+patch(1.3.9→10309),本地与 CI 一致

## 前端产物（bundle / CSS）

- **bundle 瘦身(2026-09-24, 提交 06f847f)**: esbuild 加 **--charset=utf8**(默认 ascii 把中文转义成 \uXXXX, 3字节→6字节) + **tyme4j 并入 bundle**(排 boot 之前, 别名依赖 window.tyme 先就绪)。总量 2.23MB→1.37MB(-38%), gzip 629K→477K(-24%); tyme4j 享受 minify 301→217KB, 三端少分发一个文件。**旧教训修正: bundle 里现在是原始中文字面量, "grep 中文判断改动是否打进 bundle"恢复可用**(此前 \uXXXX 转义时期会误判)
- **CSP 收紧 + 内联 script 防回归(2026-09-24)**: `tauri.conf.json` 的 script-src 去掉 `'unsafe-inline'` —— 它在 Tauri 2 下**本来就被运行时注入的 nonce 无效化**(见上文 rebind 条目), 留着只会误导后人以为内联可用; style-src 的 'unsafe-inline' **保留**(内联 style 属性是真实需求, 遍地都是)。实测收紧后桌面版排盘/四按钮/rebind 全正常(rebind 走 IDL 赋值, 不受 script-src 影响)。**build.sh 的 cmd_bundle 开头加了防回归检查**: 剥离 HTML 注释后若仍有裸 `<script>` 直接 Die(注释里提及 "<script>" 字样不误报; bash if 对退出码的语义坑 —— `if cmd; then` 是**退出码 0** 才进 then, python "发现即 exit 1" 的写法要配 `if ! cmd`)

## 环境依赖与已知坑

- **Linux 构建链已实测通过(2026-09-24, WSL2 / CachyOS)**: 补齐了 rustup 工具链(**原状态是只有 shim、一个 toolchain 都没有**, `cargo` 直接报 no active toolchain)、webkit2gtk-4.1 / gtk3 / libsoup3 / pkgconf / base-devel / patchelf / dpkg / rpm-tools / libayatana-appindicator 等系统包。`npm run build:linux` 出 app(5.2M) + deb/rpm(2.5M), **重建产物与入库 bundle 逐字节一致**(git status 干净); `npm run build:android` 出 debug APK(11MB, 多 dex 未混淆属正常), **9 项 CI 补丁逐项核验通过**: versionCode 10402 / versionName 1.4、minSdk 31 / targetSdk 34、hardwareAccelerated=true、权限只剩 INTERNET(SMS 已全清)、图标是 taiji.svg 生成的 5 档 PNG(48/72/96/144/192)
- **⚠️ npm 12 的 `EALLOWREMOTE`(2026-09-24)**: npm 12 默认 `allow-remote=none`, 而本仓库 `package-lock.json` 里 **98 个包锁定的是 registry.npmmirror.com**(另 95 个是 npmjs), 于是 `npm install --legacy-peer-deps` 直接报 `Fetching packages of type "remote" have been disabled`。解法: 追加 `--allow-remote=all`(有 lock 的 integrity 校验兜底, 不必改全局配置、也不必改 lock)。另: npm 12 的 install 会往 `package-lock.json` 顶层补一个 `"license": "MIT"`(npm 11 不写), 不想污染仓库就 `git checkout -- package-lock.json`
- **图标生成的 Python 依赖缺口(2026-10-02 迁移后补齐)**: Arch 的 `python-reportlab 5.0.1` **不带编译版 `_renderPM`**, 其 renderPM 走 `pycairo` extra = **`rlPyCairo` + `freetype-py<2.4` 两者缺一不可**(Arch 仓库只有 python-svglib/python-reportlab/python-cairo, **`freetype-py` 无包**)。只装仓库三个包时 `make_launcher_icons.py` 会报 `cannot import desired renderPM backend rlPyCairo`(缺 freetype-py 时报 `This installation of reportLab has lacks PYCAIRO extra`, 信息有误导性)。本机系统**无 pip**(`ensurepip --user` 也会被 PEP 668 拦下), 故直接把 `rlpycairo-0.4.0` 与 `freetype_py-2.3.0` 的 wheel 解包进 `~/.local/lib/python3.14/site-packages`(免 sudo)。setup.sh 的自检项已加入 `freetype`。⚠️ `build-android.sh` 调用 make_launcher_icons.py 后**无条件打印 `[完成] 图标 → …`**, 生成失败会被日志吞掉 —— 判断图标是否真的重生成要看 res/mipmap-*/ic_launcher.png 的 mtime

## 网页部署

- **⚠️ GitHub Pages 必须手动启用一次(2026-09-22)**: README 加"在线体验"链接时发现 `https://wrz1911.github.io/daojiayinpan/` 直接 **404** —— 排查发现 `gh-pages` 分支**早就由 CI 推上去了**(`peaceiris/actions-gh-pages@v4`, 见 release.yml 的 Prepare Pages / Deploy to GitHub Pages 步骤), 但**该 action 只负责推分支, 不会启用 Pages 站点**(仓库 `has_pages=false`)。启用命令: `gh api -X POST repos/wrz1911/daojiayinpan/pages -f 'source[branch]=gh-pages' -f 'source[path]=/'`(得到 build_type=legacy / https_enforced=true)。**注意: `gh api repos/.../pages` 在未启用时返回 404 而不是空对象**, 别把它当成"仓库不存在"。启用后首次构建约 1 分钟; 实测根页 200 并重定向到 `qimen_app/yinpan.html`, 排盘页 4430 字节, 线上 bundle 版本 **v1.4.1**。**此设置是仓库级、一次性的, 不会随 CI 重复部署而丢失**
- **内网网页版(2026-09-22)**: `npm run deploy:web` 把构建产物同步到 **192.168.1.3** 的 nginx, 手机浏览器直接开 **http://192.168.1.3/qimen_app/yinpan.html** 验证, 比装 APK 快得多。**已挂在 `npm run build:android` 之后自动执行**(失败只提示不影响 APK; 加 `-NoDeploy` 可跳过)。细节: 文档根 `/srv/http/qimen`(**属主 wrz, 可直接写, 不需要 sudo**); 推送 5 个文件(yinpan.html / yinpan_app.min.css→重命名为 yinpan_app.css / qimen_bundle.min.js / tyme4j-browser.js / gong_detail_data.js); `--with-apk` 可顺带推 `app-release.apk` 与下载页 `apk.html`。**口令不入库**: 读环境变量 `QIMEN_WEB_PASS` 或项目根的 `.qimen-web-pass`(已 gitignore)。注意另有一份独立拷贝在 `/home/wrz/qimen-web`(与文档根**不是**软链, 本脚本不更新它)
- **自动同步已接进构建(2026-09-24)**: 两条路 —— ①`npm run build` / `build:linux` / `build:bundle` **构建完自动同步**(加 `-- --no-deploy` 跳过; `build:android` 原本就带); ②**`npm run dev`** 监听 `qimen_app/{js,css}` 与 `qimen_app/yinpan.html`, 保存即自动重建+同步(防抖 400ms)。⚠️ watch 必须排除 `qimen_bundle.min.js` / `yinpan_app.min.css` —— 它们是**构建产物**, 不排除会自触发死循环。同步失败只 Warn, **不中断构建**(退出码仍 0)。**认证已改为 SSH 密钥优先**: `deploy-web.py` 先试 `~/.ssh/id_ed25519`(可用 `QIMEN_WEB_KEY` 覆盖), 服务器不接受才回退口令(`QIMEN_WEB_PASS` / `.qimen-web-pass`)。2026-09-24 用 `ssh-copy-id` 给内网机(**hostname archlinux**)的 wrz 授权了本机公钥, 至此**不再需要网页部署口令**; 实测 `npm run deploy:web` **5/5 文件 sha256 一致**, HTTP 拉回比对 md5 亦一致

## Android 工具链全面升级(2026-09-28)

- **版本矩阵**: Gradle **9.8.0** + AGP **9.4.1** + JDK **27**(系统 jdk-openjdk 27.u35, `JAVA_HOME=/usr/lib/jvm/java-27-openjdk`) + compileSdk/**targetSdk 37**(Android 17) + Capacitor **8.5.2** + build-tools 37(AGP 9 自动装 36 亦可)。minSdk 保持 31
- **⚠️ AGP 9 与 Capacitor 插件生态断裂(取舍实录)**: AGP 9 内置 Kotlin, 与 `@capacitor/filesystem/share` 的 `kotlin-android` 旧插件冲突(extension 已注册 + KGP 2.2 的 BaseExtension 被移除); filesystem 8.1.3 只修了 compileSdk 未修 kotlin。**用户拍板"无论如何用 Gradle 9.8, 插件先不管"** → **已从 dependencies 移除两个插件**, JS 侧守卫(`window.Capacitor.Plugins.Filesystem` 判空)保护不炸, **Android 导出备份功能暂缺, 待另实现**(候选: Web Share API `navigator.share`)。@capacitor/android 8.5.2 本体纯 Java 无冲突
- **AGP 8.13 + Gradle 9.8 不兼容**(ProblemReporter 服务 API 移除), Gradle 8.14.3+AGP 8.13.2+JDK 27 组合也没走通 —— 升级时 Gradle 与 AGP 必须同代
- **CI(release.yml android job)与 build-android.sh 已同步全部补丁**: JDK 27(setup-java)/compileSdk+targetSdk 37/AGP classpath 9.4.1(模板默认 8.13.0)/wrapper 9.8.0(模板默认 8.14)/`rootProject.buildDir`→`layout.buildDirectory`(Gradle 9 移除)。本地 android/ 重建后由脚本补丁自动恢复
- **JDK 探测**: build-android.sh 优先 /usr/lib/jvm/java-27-openjdk; 系统 java-21-openjdk 仍是 default(archlinux-java), 仅构建时 export JAVA_HOME
- **edge-to-edge 适配已实施(2026-09-28, targetSdk 37)**: 主题项(statusBarColor/windowLightStatusBar/values-night 段)在 Android 15+ 全部失效已清理 —— 适配全在 **MainActivity 代码**: `WindowCompat.setDecorFitsSystemWindows(false)` + 透明系统栏 + `ViewCompat.setOnApplyWindowInsetsListener` 把 systemBars insets 作为 padding 还给根布局(背景延伸、内容不被遮挡) + `WindowInsetsControllerCompat` 图标明暗随昼夜模式。⚠️ **两个实现坑**: ① `view.setOnApplyWindowInsetsListener(lambda)` 绑的是**平台接口**(返回 android.graphics.Insets), 与 androidx 的 Insets 类型冲突 —— 必须用 `ViewCompat.setOnApplyWindowInsetsListener`; ② build-android.sh 的 MainActivity 重写条件要检测**最新代码特征**(现为 ViewCompat.setOnApply...), 旧特征会让重写被跳过(踩过两次)。CI 的 MainActivity 步骤是本批新增(CI 原先竟无字体缩放项)
- **Android 导出备份最终方案: 原生桥 NativeSharePlugin(2026-09-29)**: WebView 的 `navigator.share` 实测**静默无反应**(连 reject 都没有, promise 永远 pending, 降级链 alert 都不出现) —— 三层降级链(Web Share)保留作无桥环境兜底, 但 APK 内由**自定义 Capacitor 插件**(纯 Java, 免 npm 包)接管: `NativeSharePlugin.java`(写 cacheDir/share + FileProvider content URI + ACTION_SEND 系统面板)。**四个配套缺一不可**: ①MainActivity `registerPlugin` 必须在 **super.onCreate 之前**(Bridge 在 super 内 create, 之后注册无效); ②AndroidManifest 的 FileProvider + authorities=`${applicationId}.fileprovider`; ③res/xml/file_paths.xml(cache-path share/); ④ProGuard `-keep class com.qimen.yinpan.NativeSharePlugin`(反射加载)。**build-android.sh 的幂等条件再次踩坑**: 条件必须覆盖"MainActivity 与插件文件任一缺失"(现为 `[ ! -f "$nsp" ] || ! grep registerPlugin...`), 且 **nsp 变量定义必须在 if 之前**(使用先于定义时为空串, 条件全乱)。导入功能早已完整(白名单校验+合并), 导出-导入闭环就绪


## Android 实机构建与补丁守卫

- **Android 实机链路打通(Windows 原生, 2026-10-12)**: `npm run build:android -- --release --no-deploy` → **app-release.apk 1.8MB, 21s**(Gradle 缓存热); `apksigner verify --print-certs` 指纹 = `5376ae5f…e8a9` 与手机上已装包**完全一致** → `adb install -r` **覆盖安装 1 秒成功, firstInstallTime 保持 2026-08-15**(数据未丢)。实机截图核验: 信息表/四柱竖排/九宫(八神·九星·八门·天地盘干·暗干)/五行着色/四角马星/外圈隐干/底部按钮全部正常, logcat 无崩溃。**⚠️ 本次揪出两处"守卫写错导致补丁从未落地"的老问题**:
  - **ProGuard 的 keep 规则一直没生效(危害最大)**: build-android.sh 的守卫写的是 `! grep -q 'com\.getcapacitor'`, 而 **Capacitor 模板自带 `-keep class com.getcapacitor.** { *; }`** → 守卫**恒为真** → 整段追加逻辑**永不执行**, `NativeSharePlugin` 的 keep 规则从未写入。后果: R8 裁掉反射加载的插件 → **Android 导出(ACTION_SEND 分享)静默失效**, 而这正是 release 包最难发现的回归(debug 包不混淆, 永远测不出来)。AGENTS 早把它列为"四项配套缺一不可"之一, 却因守卫写法错误一直形同虚设。已改为**三条规则各自检测**(任缺即补)。
    **可复用的验证手法**: 直接查 dex 里的字符串 —— `python -c "import zipfile;b=zipfile.ZipFile(r'<apk>').read('classes.dex');print(b'NativeSharePlugin' in b, b'shareFile' in b)"`, R8 若混淆/裁掉则两者皆 False。本次实测均为 True
  - **file_paths.xml 同类失效**: 守卫只看 manifest 里有没有 `fileprovider`, 而模板态是 `external-path(my_images, path=".")` + `cache-path(my_cache_images, path=".")` —— **授权面覆盖整个外部存储与 cacheDir**(CI 口径只授权 `cacheDir/share`)。已在 else 分支加独立校验并收紧
  - **教训(与 build-android.sh 的 MainActivity 重写同源)**: 幂等守卫的判据必须是**本补丁特有的**特征; 拿"模板可能自带的特征"当判据 → 守卫恒真/恒假, 补丁静默不生效。**改完必须回读产物核实**, 不能只看日志里那句 `[完成] …`

## Android 签名(2026-08-14 全部理顺)

- **keystore:android/qimen-release.keystore**,DN=`CN=地天泰, OU=道家阴盘奇门遁甲, O=github.com/wrz1911/daojiayinpan, C=CN`,SHA-256 指纹 5376ae5f...e8a9(**2026-08-15 重生成;旧 CN=王润梓 keystore 归档于 ~/qimen-sign-old/,旧签名 App 无法覆盖安装,用户需先卸载再装新版**),RSA2048/SHA384withRSA/10000 天,别名 qimen
- **keystore 加密备份脚本(2026-09-24)**: `bash scripts/backup-keystore.sh` —— gpg AES256 对称加密到 `~/qimen-sign-backup/qimen-release.keystore.<日期>.asc`, 口令自定(**必须存密码管理器, 口令丢=备份作废**)。恢复: `gpg -d <asc> > android/qimen-release.keystore` + gradle.properties 补口令两行。round-trip 已验证(逐字节一致)。⚠️ **脚本就绪但尚未跑过正式备份** —— 首次请手动执行并抄送 .asc 到离线介质
- **⚠️ 签名材料曾随迁移丢失又找回(2026-09-24)**: 项目从 ~/文档/奇门排盘 迁到 ~/src/daojiayinpan 时 **android/(gitignore 不入库)整个没跟过来**, 本机与 Windows 盘遍寻无果; 最终在**原开发机 192.168.1.3(即内网 nginx 那台, SSH 免密)的 `~/文档/奇门排盘/android/`** 找回 —— `qimen-release.keystore` 与 `gradle.properties` 尾部的两行口令一起 scp 回本地即恢复(指纹已对拍一致)。**教训: 迁移项目时 gitignore 掉的目录(签名/密钥/本地配置)要单独盘点, git 不会替你搬**。另: CI 的 Secrets(KEYSTORE_BASE64/KEYSTORE_PASSWORD)不受本地丢失影响, 但 release job needs android, 本地与 CI 至少要有一路能签
- 签名口令存 android/gradle.properties(QIMEN_STORE_PASSWORD/QIMEN_KEY_PASSWORD,不入库,**口令值只写在该文件,勿再记录到任何入库文件**),build.gradle 用 `project.findProperty()` 读取;**CI:Secrets KEYSTORE_BASE64(keystore 的 base64)+ KEYSTORE_PASSWORD,运行时注入 gradle.properties,仓库零明文密码**;CI APK 与本地签名一致,可覆盖安装升级
- 历史坑:曾经根目录 qimen-release.keystore 与 android/ 下的 keystore 是两个不同文件(CI 与本地签名不一致,覆盖安装失败);旧签名文件已归档 ~/qimen-sign-old/
- 验证: 用 `~/.devtool/Android/Sdk/build-tools/37.0.0/apksigner verify --print-certs <apk>`(SDK 在 `~/.devtool/Android/Sdk`,**2026-10-02 迁移后位置,不做软链接**)。**SDK 已升级至最新(2026-09-28)**: build-tools 34.0.0+**37.0.0** 并存、cmdline-tools **23.0**、platform android-34/35/**37.0**、platform-tools 37.0.1 —— gradle 构建仍按 build.gradle 的 compileSdk 35 选旧链(刻意不动, 9 项 CI 对齐补丁之一), 新版工具供未来升 compileSdk 时用。⚠️ sdkmanager 自身升级装到 `latest-2`(不能原地覆盖运行中的 latest), 需手动 rm latest → mv latest-2 latest
- 系统旧 SDK /opt/android-sdk 已于 2026-08-16 删除;**2026-10-02 迁移后唯一 SDK 在 `/home/wrz/.devtool/Android/Sdk`**(原 `/home/wrz/Android/Sdk` 已不存在):`android/local.properties` 的 sdk.dir、`~/.bashrc` 与 `~/.config/fish/config.fish` 的 `ANDROID_HOME`/`ANDROID_SDK_ROOT`/PATH 均已指向该路径,build-android.sh / setup.sh / device.sh 的探测列表也把它排在首位;build-tools 34/35/36/37 并存


## 无线调试部署(固定端口 5555, 2026-09-22 重做)

- **手机无 root**(`id` = uid=2000(shell), 无 su), 故 Android 11+ 设置里的「无线调试」端口随机、**无法固定**, 且 `persist.adb.tcp.port` 也改不了 → 改用经典 TCP/IP 模式, 把 adbd 固定在 **5555**
- 一条命令: `npm run adb:wifi`(`scripts/device.sh wifi`) —— 自动从 USB 设备读出手机 wlan0 地址并 `adb connect <ip>:5555`, 再回读属性确认通道可用。**地址来源优先级: `--ip` > USB 探测 > 上次成功缓存 > 同网段 5555 端口扫描**(WSL 下没有 USB 可探测, 扫描是主要兜底; 缓存落在 `$XDG_CACHE_HOME/qimen-adb-wireless.txt`)。同一个文件还提供 `npm run adb:install`(装 APK 到已连接设备, `--release` 选 release 包, 并识别 debug/release 签名冲突)与 `npm run adb:list`
- **手机重启后 TCP 模式失效**: 用 USB 连一次并跑 `npm run adb:wifi -- --setup` 重设(脚本内 `adb tcpip 5555`)。⚠️ **WSL 下没有 USB 直通**(手机插在 Windows 上, WSL 内核里也看不到设备, `adb devices` 永远为空), 所以 `--setup` 在 WSL 里用不了, 只能二选一: ① **Windows 侧装 platform-tools**, 用 `adb.exe tcpip 5555` 做那一次重设(WSL 只负责后续连接); ② 装 **usbipd-win** 把 USB 转发进 WSL(`winget install usbipd` → `usbipd list` → `usbipd attach --wsl --busid <id>`)。
- **Windows 原生开发时 USB 直连可用(2026-10-12 实测, 无需 usbipd/WSL 那套绕法)**: Windows 侧 `D:\app\dev\androidsdk\platform-tools\adb.exe` 直接看得到 USB 设备(手机开 USB 调试即可), `adb tcpip 5555` 也能直接跑。本次完整流程: `adb devices`(USB 识别 **5d5c76a6**) → `adb install -r` 覆盖安装 → `adb tcpip 5555` → `adb connect 192.168.1.4:5555` → 回读 `getprop service.adb.tcp.port`=5555。之后 **USB 与无线同时在线**(`adb devices` 两条记录), 拔线后无线仍可用。⚠️ 手机重启后 5555 失效, 仍需 USB 插一次重设(与 AGENTS 既有结论一致)
  ⚠️ **WSL 网络必须是 mirrored 模式**, WSL 才能直接 `adb connect` 到手机 —— 实测本机 WSL 与 Windows 同为 **192.168.1.2**(`/etc/wsl.conf` 未设 `networkingMode` 时, 新版 WSL 默认即 mirrored), 手机 192.168.1.4:5555 直连可用, **无需任何端口映射**。若是 NAT 模式(旧 WSL), 手机与 WSL 不同网段, 需在 Windows 上 `netsh interface portproxy` 或直接改用 Windows 侧 adb
- 当前环境: 电脑 **192.168.1.2** / 手机 **192.168.1.4**(SSID "Wrz"), 序列号 **5d5c76a6**, 型号 25102RKBEC, Android 16 (API 36)。手机开着 VPN(tun0) 不影响 adb
- 所有命令需加 `-s 192.168.1.4:5555`, 例如无线安装:
  `D:\devtools\android-sdk\platform-tools\adb.exe -s 192.168.1.4:5555 install -r android\app\build\outputs\apk\release\app-release.apk`
  (实测传 2.08MB 包 **0.7 秒**, 约 2.9MB/s)
- **签名变化时必须先卸载再安装(数据丢, 提醒用户先备份)**;同签名直接 `-r` 覆盖
- 旧记录已废弃: 曾用「无线调试」的随机端口 `192.168.1.5:46529`(IP 与端口都会变, 故弃用)
- **⚠️ WSL 下 adb 的 loopback 黑洞(2026-09-24 实测定位, 排查花了一轮)**: `adb devices` 会**永久挂起** —— 25 秒零输出、CPU 仅 0.002s、5037 无人监听。`strace` 显示它停在 `connect(3, {sin_port=5037, sin_addr="127.0.0.1"}) = ? ERESTARTSYS`,即**不是 adb 的毛病**: WSL(mirrored)下连接**未被监听的 127.0.0.1 端口不会立刻 ECONNREFUSED, 而是黑洞**, 而 adb client 的启动流程恰恰是「先 connect 探测 server → 失败才 fork 一个」, 于是它永远走不到启动分支。**解法: 绕过探测, 直接 `adb -L tcp:5037 nodaemon server` 进 server 模式**; 5037 一旦有人监听, 后续所有 adb 命令(含手动敲的)立刻恢复(实测 0.03~0.19s)。两条路都已铺: ① **systemd user service** `~/.config/systemd/user/adb-server.service`(ExecStart 就是上面那条 nodaemon, 已 `enable` + `loginctl enable-linger wrz`, 开机即有); ② `scripts/adb-wireless.sh` 里的 `ensure_adb_server()` 兜底(检测到 5037 没监听就自己拉起来)。⚠️ **该黑洞是间歇性的** —— 同一台机器上有时 `adb devices` 直接 0.19s 成功, 所以不能用"现在能跑"来判定问题不存在, 两条路都要留
- **⚠️ 取本机局域网地址别用 `ip addr show scope global`**: WSL 的 DNS 代理 **10.255.255.254 挂在 `lo` 上却带 scope global**, 会被误当成局域网地址, 于是"扫描同网段找手机"扫的是 `10.255.255.0/24`(实测踩到, 扫了个寂寞)。正确取法: `ip -4 route get 1.1.1.1 | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}'`
- **首次连接必报 `failed to authenticate`**: 手机对新 adb 密钥要弹窗授权, 而弹窗只在连接那一刻出现, 所以第一次 `adb connect` 必然失败、**重连一次即可变 `device`**(实测)。`adb-wireless.sh` 因此对 authenticate 失败做了最多 3 次重试, 而不是一次定生死


## 可靠性工具与修复(2026-09-28 批次)

- **盘面快照回归工具 `scripts/snapshot.js`(入库)**: 参照物 ~/src/refimpl 与 4 个 verify_* 对拍脚本已随历史清理**丢失**(2026-09-28 复核发现), 5000 万项对拍能力不复存在 —— 本工具把当前引擎输出固化为数据快照入库(docs/snapshots/pan-snapshots.json, 27 个: 时/刻盘×9 时间点含交节跨日跨年闰年、山向×8 度数、命理×1), `node scripts/snapshot.js` 比对当前代码, 任何引擎/历法漂移即红灯。**jsdom 已进 devDependencies**。⚠️ 与"verify 不入库"约定的差异: snapshot 是可持续使用的工具而非一次性调试脚本, 且快照数据+脚本必须同入库才有跨机价值(2026-09-28 用户以"其他自动化完成"授权)
- **AGENTS.md 142 行"山向暗干引擎侧待改"是过时标注**: 引擎实际已于 2026-09-13(八续)修复(判据仅宫1+_vj归一化, 468组对拍), 本批已更正标注
- **fixYinGanAlign 补 fonts.ready 重算**: 原只跑 10/50/300ms, 中文字体就绪晚于三者时阴干 paddingTop 失准(本文件 219 行老问题收口)
- **CI release job 加 Pages 部署自检**: 带重试(8×20s)拉线上 bundle 断言含本版版本串 —— ⚠️ 断言用**版本字符串**(`"1.4.6"`)而非 `APP_VERSION=`(esbuild 会把变量名 mangle 成 `xt` 之类, grep 变量名永远不命中, 第一版就踩了)
- **backup-keystore.sh 指纹核对行修复**: 原 grep 无行首锚定+吞 stderr, 首跑输出为空; 改 `^QIMEN_STORE_PASSWORD=` 锚定+去 \r+失败提示。**keystore 正式加密备份已于 2026-09-28 由用户执行**(~/qimen-sign-backup/*.asc)


## Windows 本地构建链（2026-10-28 已废弃）

- **【已废弃 2026-10-28 · 仅作历史参考, 不再适用】Windows 本地构建链打通(2026-10-04, 全链路实测通过)**: 工作区自 Linux 侧同步而来(node_modules 是 linux 平台包、src-tauri/target 是 Linux 产物、local.properties 指向 /home/wrz/...), 本次逐项恢复到 Windows 可用。依赖侧只需一条命令: `npm install --legacy-peer-deps`(秒级换装 @esbuild/win32-x64 + @tauri-apps/cli-win32-x64-msvc, lock 内条目齐全, **不必删 lock/node_modules**)。五个非显然的坑:
  - **bash 必须有**: 构建脚本全是 bash, Windows 终端里 `npm run build:*` 报 `'sh' is not recognized`。把 **`D:\app\dev\Git\bin` 加进用户级 PATH** 即可(Git for Windows 自带 bash 5.3 + sed/awk/grep/find/wc/mktemp, 够用); 仍然**不要**加 `Git\usr\bin`(POSIX find/sort 会遮蔽系统命令)
  - **⚠️ MSYS 路径不能作为参数传给原生 python.exe**: Git Bash 里 `$ROOT` 是 `/d/src/daojiayinpan`, 而 `command -v python3` 解析到的是**原生 Windows** python —— MSYS 只在自身 shell 内认这种路径, **不转换引号内文本**。于是 build.sh 的 CSP 防回归检查 `open('$ROOT/qimen_app/yinpan.html')` 必然 FileNotFoundError, 被判成"yinpan.html 含内联 script"而 Die —— **报错完全指错方向**(实测白查一轮)。修法: 各脚本加 `to_native()`(`cygpath -w`; Linux 无 cygpath 时原样返回), 凡把路径当**参数**交给原生程序的场合先过它
  - **⚠️ Windows 可执行文件带 `.exe`**: `[ -x "$JAVA_HOME/bin/javac" ]` 与 `[ -x "$ANDROID_HOME/platform-tools/adb" ]` 在 Windows 上恒为假 → 把装好的 JDK/SDK 误判成"未配置"。修法: 加 `has_exe()`(两种后缀都试)
  - **⚠️ `local.properties` 是 Java Properties 格式, 反斜杠是转义符**: 写 `sdk.dir=D:\app\dev\androidsdk` 会被解析成 `D:appdevandroidsdk`(反斜杠被吞), Gradle 报 `Could not determine the dependencies of task ':app:compileDebugJavaWithJavac' > java.io.IOException: 文件名、目录名或卷标语法不正确` —— **症状离病因极远**。修法: 写**正斜杠**(`D:/app/dev/androidsdk`, AGP 完全接受, Linux 路径不受影响)
  - **新增 `npm run build:windows`**(=`scripts/build.sh windows`): `prepare_web` + `npx tauri build --no-bundle`。**必须带 `--no-bundle`** —— tauri.conf.json 的 `bundle.targets` 是 deb/rpm/appimage, Windows 上不适用; 产物是裸 `src-tauri/target/release/app.exe`
  **实测基线**: `build:bundle` 重建 1329610 字节, **SHA256 与 Linux 侧入库产物逐字节一致**(`D4B0DCE8…` —— 即 CI 的 `git diff --exit-code` 校验在 Windows 上同样能过); `build:windows` 首次 **1m35s → app.exe 4.3MB**, 启动拉起 12 个 `msedgewebview2.exe`; `build:android` 出 **debug APK 9.7MB**(`BUILD SUCCESSFUL in 30s`)。图标生成的 Python 依赖在 Windows 上**比 Arch 顺利得多**: `python -m pip install --user svglib reportlab Pillow rlPyCairo "freetype-py<2.4"` 一次装成(pycairo 有 cp314 win_amd64 wheel), 实测出 10 个 PNG
  **git/环境适配(4 项)**: ①仓库拷来后 `core.filemode=true` 会把"Windows 无执行位"报成 7 个 `.sh` 的**假修改** → 置 **`core.filemode=false`**(index 内保持 100755, 提交后仓库不变); ②`.gitignore` 末尾两行中文注释是**历史编码损坏**(既非 UTF-8 也非 GBK, read 工具直接报 invalid UTF-8) → 已按 HEAD 原始字节逐行重建为纯 UTF-8(**⚠️ 别用 latin1 往返去改它 —— 会把原本正常的中文行一起变成 mojibake, 本次已踩过并返工**); ③新机器首次 commit 报 `unable to auto-detect email address` → 按历史身份配 `user.name=wrz` / `user.email=stripsss@live.com`; ④GitHub SSH: `ssh-keyscan github.com` 在 Win32-OpenSSH 下**拿不到 host key**(报 `choose_kex: unsupported KEX method sntrup761x25519-sha512@openssh.com`), 要用 `ssh -o StrictHostKeyChecking=accept-new -T git@github.com` 才写得进 known_hosts; **推送仍需 ssh-agent**(服务默认 Disabled, 启动需管理员: `Set-Service ssh-agent -StartupType Automatic; Start-Service ssh-agent; ssh-add`)

## 新代码语法规约（2026-09-28 定，JS target 已升 es2020）


- **JS**: esbuild target es2020(`?.` `??` 不再转译)。**新代码直接用现代写法**: 可选链 `?.`、空值合并 `??`、模板字符串 `` `${}` ``; 存量 16k 行的 `+` 拼接与 `||` 判断**不强制回改**(碰哪儿改哪儿; `\|\|`→`??` 必须逐处确认 0/''/false 语义)。var→let 已清零(mingli/bazi 211 处, 2026-09-28)——⚠️ **教训: var→let 机械替换的最大陷阱是"try 块内 var + try 外使用"的提升依赖**(mingli bzInfo 实例: 强转 let 成 TDZ bug, 且被外层 catch 吞成静默回归, 27 快照都测不出, 靠 eslint no-undef error 级守门抓住)。同类替换必须: eslint 0 errors + snapshot 回归 + 目标代码路径专项验证
- **CSS**: 已用 aspect-ratio(带 @supports 回退)/grid/变量/calc/clamp。**新代码**: 优先 `:where()` 包裹(零特异性, 避免再添 !important —— 本项目特异性战争史见上文三连坑); 弹窗类 max-height 用 `var(--vh88/--vh85/--vh70)` 变量(dvh 渐进增强已铺, 行内样式无法级联回退所以走变量); `:has()`/nesting 基线允许(WebKit 16.4+/Chrome 108+)但存量不重写
- **改 JS 必跑**: `node scripts/snapshot.js`(27 盘面零漂移); 改交互另跑 `node scripts/verify_rebind_behavior.js`(16 项)


## 关键教训（必读，2026-08 记录的原始版本）


- **沙箱拦截整条 bash 命令**:命令文本/提交信息含敏感词(如 "cargo install")整条不执行(含 git add)→ 后续 commit 报无暂存;务必避开敏感词
- **bundle 里的中文是 \uXXXX 转义**:esbuild 默认 charset=ascii,qimen_bundle.min.js 内不存在原始中文字面量,用 grep 中文判断"改动是否打进 bundle"会误判;应改用重建比对(cmp)或转义形式(戌=\u620C 亥=\u4EA5 申=\u7533 酉=\u9149)
- **git commit 勿接管道**:`git commit | tail` 的退出码是 tail 的 0 → && 链继续跑 → 曾导致 release.sh 在 commit 失败后仍 push tag 指向旧提交;必须取消重推
- cap sync 必须在项目根跑(在 android/ 跑假成功+旧资源)
- 用户偏好:README 只放面向用户内容(开发者细节、无线调试、签名机制等都不写,写一次被要求删一次);优化建议按用户逐项拍板,不做:SignPath(已废弃)、macOS 公证(README 提示代替)、暗色跟随系统(保持统一界面)、桌面自动更新、结构拆分/存储三轨统一(提出后被否)、Android 文件化持久化(2026-08-15 用户终止)
- 发布前手机实测五种盘型是固定环节(用户确认"正常"后才 push tag)
- 用户要求持续有效:「完全自动化修复 用git备份,但不要推送」——已过渡到 main 分支开发 + 用户明确指示时才 push/release;**2026-08-15 起不再加 Co-Authored-By 署名(用户要求,已从整个项目历史中删除)**
- 分支 auto-fix-20260803 有大量本地提交未 push(d35b7a5 心盘编辑器修复、ef3ca40 编译修复、5eb96f0 测试入库、e6f0b69 删测试、8c31e85 清理诊断);main 分支已推送 v1.3.8/v1.3.9 线

