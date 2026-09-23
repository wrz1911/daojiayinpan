# 道家阴盘奇门遁甲

道家阴盘奇门遁甲排盘系统，支持时盘、刻盘、心盘、山向、穿壬、命理六种模式。

## 功能

- **时盘** — 按时辰排盘，支持自选局数
- **刻盘** — 分柱干支排盘
- **心盘** — 手动编辑宫位符号，自动推算全盘
- **山向奇门** — 24山360度向角度排盘，13副盘同屏
- **穿壬** — 奇门穿大六壬，九宫外圈天盘/天将/天干/建除，四课三传，时运命；支持自选局、时家刻家、八字四柱、大运流年
- **命理奇门** — 以出生时间起盘：主盘列四柱、十神、藏干、纳音、地势、自坐、空亡、神煞、胎元命宫身宫与旺相休囚死，下接九宫；再附交运、大运、流年，并可切换移星换斗、天门地户、长生状态
- **关于** — 底部条「关于」按钮显示作者与项目信息

## 在线体验

无需安装，浏览器直接打开：

**https://wrz1911.github.io/daojiayinpan/**

网页版与桌面版共用同一份排盘内核（`qimen_app/js/qimen_bundle.min.js`），六种盘型、断局与调理功能一致，适合快速试用；需要离线使用或把记录导出到本地文件，请下载对应平台的安装包。

> 该页面由 GitHub Actions 在每次发布 tag 时自动构建部署（`gh-pages` 分支），与 Release 产物同源同版本。

## 安装

从 [最新 Release](https://github.com/wrz1911/daojiayinpan/releases/latest) 下载对应平台安装包：

| 平台 | 文件 |
|------|------|
| Linux | `.deb` / `.rpm` / `.AppImage` |
| macOS | `.dmg` |
| Windows | `.exe` |
| Android | `.apk` |

推送 tag 后 GitHub Actions 自动构建全平台包并发布。

> **Windows 用户注意**：exe 文件未签名，首次运行时可能出现以下提示：
> - **Microsoft Defender SmartScreen** — 点击「更多信息」→「仍要运行」
> - **Edge 浏览器** — 下载后提示「已阻止不安全的文件」，点击「...」→「保留」→「仍然保留」
>
> **macOS 用户注意**：dmg 未签名且未公证，首次打开可能被 Gatekeeper 拦截：
> - 在「访达」中右键点击应用 →「打开」→ 再点「打开」
> - 或前往「系统设置 → 隐私与安全性」→ 点击「仍要打开」
>
> **Linux 用户注意**：`.deb` 适用于 Debian / Ubuntu 系，`.rpm` 适用于 Fedora / openSUSE 系。
> 其它发行版（如 Arch）请用 **`.AppImage`** —— 免安装、免 root，下载后赋予执行权限即可运行：
> ```bash
> chmod +x yinpan_*_linux_x86_64.AppImage && ./yinpan_*_linux_x86_64.AppImage
> ```

## 本地构建

所有构建走同一个入口 `scripts/build.sh`（子命令 `bundle` / `linux` / `appimage` / `android`）：

```bash
npm install --legacy-peer-deps   # 安装依赖（npm 12 的注意事项见下）
npm run dev                      # 监听源码改动 → 自动重建 bundle + 同步内网服务器
npm run build                    # 默认 = bundle + linux
npm run build:bundle             # 仅前端：qimen_bundle.min.js + yinpan_app.min.css
npm run build:linux              # 桌面 deb / rpm
npm run build:appimage           # AppImage（含 WebKit 路径补丁，真正零安装）
npm run build:android            # Android APK
npm run setup                    # 构建环境体检 / 补齐（缺什么提示什么）
```

> npm 12 起默认 `allow-remote=none`，而本仓库 `package-lock.json` 里部分包锁定的是镜像地址，
> 直接装会报 `EALLOWREMOTE`。此时改用：
> ```bash
> npm install --legacy-peer-deps --allow-remote=all
> ```

### 桌面 (Linux / Tauri)

```bash
npm run build:linux         # 同步 web 资源 → tauri build → deb/rpm
# 产物: src-tauri/target/release/bundle/deb|rpm/
```

Windows / macOS 需对应平台工具链，由 CI 构建（推送 tag 自动触发）。

### Android

```bash
npm run build:android                  # debug 包（无需签名）
npm run build:android -- --release     # release 包（需签名密钥，见下）
npm run build:android -- --skip-web    # 跳过 www 资源准备，仅重编译
npm run adb:wifi                       # 手机无线调试连接（固定 5555 端口）
npm run adb:install                    # 装 debug 包到已连接设备
npm run adb:install -- --release       # 装 release 包
```


这些脚本会把 CI 的 android job **整套复现到本地**（minSdk/targetSdk、状态栏、R8、ProGuard、
图标、WebView 字体缩放等 9 项定制），并自动处理国内网络必需的两处镜像
（Gradle → 腾讯云、Maven → 阿里云）。

release 包需要两样**不入库**的签名材料：`qimen-release.keystore`（放仓库根或 `android/` 下）
与 `qimen-signing.properties` 里的 `QIMEN_STORE_PASSWORD` / `QIMEN_KEY_PASSWORD`。
缺任一项脚本会明确拒绝，而不是产出一个签名不对的包。

等价的纯手工步骤（脚本做的就是这些）：

```bash
npx cap sync android                          # 同步 www 资源到 android assets（必须从项目根执行）
cd android && ./gradlew assembleRelease       # 产物: android/app/build/outputs/apk/release/app-release.apk
```

## 开源声明

本项目基于以下开源项目：

| 项目 | 协议 | 用途 | 地址 |
|---|---|---|---|
| tyme4ts | MIT | 农历/节气/干支计算 | https://github.com/6tail/tyme4ts |
| Tauri | MIT | 跨平台桌面框架 | https://github.com/tauri-apps/tauri |

各开源项目的完整许可文本见 [`licenses/`](licenses/) 目录。

本项目分发的 JS 产物顶部均保留版权与许可声明：

- `qimen_app/js/tyme4j-browser.js` —— tyme4ts 的浏览器构建，版权归
  Copyright (c) 2024 6tail 所有
- `qimen_app/js/qimen_bundle.min.js` —— 本项目 bundle，含上述第三方组件声明

## 协议

MIT License
