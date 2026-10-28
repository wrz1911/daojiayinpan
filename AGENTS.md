# 奇门排盘(道家阴盘)项目记忆

> 项目: 道家阴盘奇门遁甲(六盘: 时/刻/心/山向/穿壬/命理) · 作者 地天泰 · 仓库 github.com/wrz1911/daojiayinpan
>
> **本文件只保留现行规范、铁律、结论级坑与待办。** 详细过程记录已归档到 `docs/memory/`，日常开工不必读，排查历史问题时再查阅：
> - [构建/环境/发布](docs/memory/build-env.md) — 构建链、CI、签名、部署、Android 工具链、Windows 历史(已废弃)
> - [UI/交互/CSP](docs/memory/ui-ux.md) — 信息表压缩、长按短按、CSP 内联失效、验证手法、持久化
> - [历史大事记](docs/memory/journal.md) — 按时间的演进流水账

## 项目概况

- **唯一开发机: Linux `~/src/daojiayinpan`**(原 `~/文档/奇门排盘`)。**2026-10-28 用户决定: 只在本机开发, Windows 副本停用, 不再做 Windows 适配与回归**(CI 的 windows job 保留 —— 那是给最终用户发 exe, 与本地无关)
- 六种盘型: 1=时盘 2=刻盘 3=心盘 4=山向 5=穿壬 6=命理; 纯 HTML+JS(无框架) → Tauri 2 桌面 + Capacitor 8 Android + gh-pages 网页版
- 当前版本 **1.5.0**(Android versionCode 10500 = major*10000+minor*100+patch; versionName 用完整三段, 2026-09-28 起不再截断)
- 前端: `qimen_app/yinpan.html` + `css/yinpan_app.css` + 11 个自有 JS, 由 `scripts/build.sh bundle` 合成 `qimen_bundle.min.js`(~1.4MB, tyme4j 已并入); `gong_detail_data.js`(258KB 宫位详解)懒加载
- 模块: engine(排盘) / chuanren(穿壬) / mingli(命理) / bazi(八字) / boot(引导 + rebind) / constants(共享常量) / click_tips + shensha_tips + term_tips(术语释义)
- 命理盘(`qimen_mingli.js`): 出生时间起盘 —— 九宫 + 大运/流年/流月/流日/流时逐级下钻; 神煞/十神/长生/纳音走点击委托弹释义(`qimen_click_tips.js` 接管, overlay, Esc/点背景/关闭三种关法)
- 网页版: https://wrz1911.github.io/daojiayinpan/ (CI 部署 gh-pages, 根 index 重定向到 `qimen_app/yinpan.html`)

## 铁律(必读, 违反即线上事故)

1. **strict IIFE 下未声明赋值必炸**: `yinpan_app` 是 IIFE + strict, 未声明变量抛 ReferenceError, 且常被 catch 吞掉 —— 表现为"点了没反应"。历史踩过 4 次(h/ag/agColor/fw)。ESLint 的 no-undef/no-redeclare 是 error 级, 改完必跑; **必须**用 `npx eslint qimen_app/js/*.js`(`npx eslint .` 会因 tyme4j 子目录的配置崩)。
2. **不写内联 `<script>`, 也不新增内联 `onclick/onchange/onkeydown`**: Tauri 2 运行时注入 nonce, CSP 一旦有 nonce 就忽略 `'unsafe-inline'` —— 内联事件在桌面版全部失效, 而网页/Android 正常, 所以最难发现。存量内联属性由 `qimen_boot.js` 的 rebind 在启动与动态渲染时接管为程序化绑定; 新代码直接用 `addEventListener` / `el.onclick = fn`。
3. **入库产物必须重建**: `qimen_bundle.min.js`、`yinpan_app.min.css` 是提交进仓库的构建产物, CI 会 `npm run build:bundle` 后 `git diff --exit-code` 校验。改任何 JS/CSS 后必须重建并一起提交。
4. **`cap sync` 必须从项目根跑**: `npx cap sync`(不是进 `android/` 跑), 否则报假成功 + APK 内嵌旧资源。
5. **签名材料不入库**: `qimen-release.keystore`、`qimen-signing.properties`、`.qimen-web-pass` 均在 .gitignore。keystore 指纹 `5376ae5f…e8a9`, 换 key = 老用户必须卸载重装。
6. **`.gitattributes` 的 `* text=auto eol=lf` 不能删**: 保证入库产物在任何检出环境逐字节一致(与"是否支持 Windows"无关)。
7. **发布前真机实测六盘型**, 用户确认"正常"后才 push tag。
8. **不主动推送**: 除非用户明确指示 push/release; 提交信息**不加** `Co-Authored-By`。
9. **用户偏好**: README 只放面向用户的内容(开发细节写一次被删一次); 优化建议逐项拍板; 明确不做: SignPath、macOS 公证(README 提示代替)、暗色跟随系统、桌面自动更新、结构拆分、Android 文件化持久化(2026-08-15 终止)。
10. **改 JS 必跑回归**: `npx eslint qimen_app/js/*.js`(0 errors) + `node scripts/snapshot.js`(27 个盘面快照零漂移); 改交互再跑 `node scripts/verify_rebind_behavior.js`。改完 JS/CSS 必须重建 bundle 并提交。
11. **`git commit` 勿接管道**: `git commit | tail` 的退出码是 `tail` 的 0, `&&` 链会继续跑 —— 曾导致 tag 指向旧提交。要用 `git commit; echo $?` 或直接看输出。

## 构建与发布(现行命令)

```bash
npm install --legacy-peer-deps --allow-remote=all    # npm 12 默认禁远程包, 必须加 allow-remote
npm run build:bundle          # 前端 bundle + 压缩 CSS(改 JS/CSS 后必跑)
npm run build:linux           # 桌面 deb/rpm
npm run build:appimage        # AppImage
npm run build:android -- --release --no-deploy       # APK(需 keystore + 口令)
npm run dev                   # 监听源码 → 自动重建 → 推内网(手机浏览器验证)
npm run deploy:web            # 单独推送网页版到 192.168.1.3
npm run release -- X.Y.Z      # 版本同步 + commit + tag + 触发 CI
```

- 本机 Android 工具链(2026-10-28 实测): JDK 27(`/usr/lib/jvm/java-27-openjdk`) + SDK `~/.devtool/Android/Sdk`(含 android-37.0 / build-tools 37.0.0) + Gradle 9.8.0 + AGP 9.4.1 + Capacitor 8.5.2。`android/` 不入库, 由 `build-android.sh` 从模板重建并重打 9 项 CI 对齐补丁。
- 构建细节、CI 矩阵、签名流程、内网部署、Android 补丁清单: 见 [docs/memory/build-env.md](docs/memory/build-env.md)。

## 算法核心决策(2026-07 澄清, 勿回退)

1. 天盘 = 地盘顺时针 BAGUA 旋转复制, **不参与阴阳遁, 不做寄干独立计算**
2. 心盘 diMap 直接从引擎背景数据提取, 不重算局数
3. autoFillXinpan 的复杂寄干修正已删(现仅存推算诊断块)
4. MiSans 字体、iconfont 全部移除 → 系统字体栈 + taiji.svg
5. Electron→Tauri 迁移完成(98MB → 23MB)

## 结论级坑清单(都踩过, 别再踩)

| 坑 | 结论 |
|---|---|
| 幂等守卫拿"模板可能自带"的特征当判据 | 守卫恒真/恒假 → 补丁静默不生效(ProGuard keep 规则曾因此从未落地, Android 分享静默失效)。判据必须是本补丁特有的, 改完**回读产物**核实 |
| CSS 改了不生效 | 同一选择器在媒体查询里另有带 `!important` 的规则。先 grep 该选择器**所有**出现, 再实测 computed 值 |
| 行内 `display:none` 被 `''` 重置 | `el.style.display=''` 是"移除行内样式", 会回落到 CSS 显示 —— 被别处 `''` 重置的元素会重新出现 |
| 删元素导致整块逻辑变死代码 | 被 `if(el)` 守卫的逻辑静默失效(自选局曾因此"平白丢失")。删前 grep 引用 |
| CDP 测点击坐标失效 | 测量与触摸之间**不能**插入等待(滚动/重排让坐标失效); 用 `elementFromPoint` 反查是否命中 |
| CDP 测 Android 必须先 force-stop | 只 `am start` 只带到前台、不重载页面, 测到的是旧 CSS/JS |
| var→let 机械替换 | "try 内 var + try 外使用"会变 TDZ, 且被 catch 吞掉; 必须 eslint 0 errors + snapshot 回归 |
| 改 JS 不重建 bundle | CI 红 + 线上旧代码; 发布后浏览器还会缓存旧文件(bundle URL 带 `-g<hash>` 版本戳) |
| `pkill -f 'target/release/app'` | 会匹配到自己这条命令行并自杀; 用 `pkill -x app` |

## 当前状态与待办(2026-10-28)

- 版本 **1.5.0**; 本机已产出 v1.5.0 APK(1.9MB, 签名指纹一致, 太极图标), 归档在 `dist/yinpan_1.5.0_android.apk`
- **待修**: `build-android.sh` 的图标生成依赖缺失(svglib / reportlab / rlPyCairo / freetype-py), 失败仍打印 "[完成] 图标 → …" —— 重建 `android/` 时图标会退回 Capacitor 默认。本次已用 `rsvg-convert` + PIL 按 CI 口径(5 档 48/72/96/144/192, #f5f5f5 底)临时补过; 彻底修需装 Python 依赖或把脚本图标步骤改成 rsvg 方案
- **待清理**: `npm run build:windows` 与 `scripts/build.sh windows` 已无使用场景(只在本机开发), 可删
- **维护约定**: 新踩的坑先写进 `docs/memory/` 的对应归档; 只有"结论级、会影响以后写代码"的才上提到本文件, 且每条控制在 1-3 行
