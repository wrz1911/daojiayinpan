<div align="center">

# 阴盘奇门遁甲

**道家阴盘 · 六盘同参 · 三端一核**

时盘、刻盘、心盘、山向、穿壬、命理——六种盘型各臻其用；<br>
桌面、手机、网页——三个平台共用同一份排盘内核。

![version](https://img.shields.io/badge/version-1.4.3-0dc2b3?style=flat-square)
![license](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
![platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows%20%7C%20Android%20%7C%20Web-lightgrey?style=flat-square)
![calendar](https://img.shields.io/badge/%E5%8E%86%E6%B3%95-tyme4ts-orange?style=flat-square)

[在线体验](https://wrz1911.github.io/daojiayinpan/) · [下载安装包](https://github.com/wrz1911/daojiayinpan/releases/latest) · [六盘详说](#六盘) · [何以立信](#何以立信)

</div>

---

<p align="center">
  <img src="https://raw.githubusercontent.com/wrz1911/daojiayinpan/main/docs/screenshot-android.png" height="680" alt="Android 版 · 时盘完整页面">
</p>

<p align="center"><sub>Android 版 · 时盘 · 滚屏完整截图（信息表、九宫、断局按钮一屏尽览）</sub></p>

---

## 六盘

> 每一盘，都为实战而来。

### 时盘

按时辰起局。阴阳遁、局数、旬首、值符值使、驿马空亡，一眼俱全；支持自选局数。宫位**长按**即得详解——神、星、门、干层层拆解；**短按**点亮「三宫通气」：本宫、先天（过去）、后天（未来）三宫同辉，前因后果一目了然。

### 刻盘

一刻一盘，分柱干支起局。择时而动，细入毫芒。

### 心盘

以心意起局：亲手布置宫位符号，自动推演全盘。盘中既有格局，皆可反推。

### 山向奇门

24 山 360°，按向角度逐度排盘，**13 副盘同屏纵览**；亦可选定山向，细看一局。


### 穿壬

奇门穿大六壬，两式合参：九宫之外，天盘、天将、月将加时、建除列于外圈，四课三传、时运命一应俱全。

### 命理奇门

以出生时间起盘：主盘列四柱、十神、藏干、纳音、地势、空亡、神煞、胎元命宫身宫与旺相休囚死，下接九宫；再附交运、大运、流年，可切换移星换斗、天门地户、长生状态。

---

## 何以立信

排盘工具，算错一字，误人一时。所以本项目把「对拍」当作第一等大事——

- **五千万项对拍，零不一致。** 排盘算法与两个独立的第三方实现逐项比对：时盘/刻盘 171 万项、山向 5054 万项（200 年 × 360 度 × 13 副盘，无一采样缺口）、穿壬 1.7 万项，含局数、值符、值使、马星、空亡与八宫的天地星门神暗干全部字段。对拍还揪出并修复了马星索引、月将取法、伏吟暗干等多处真 bug。
- **纯原生，轻若鸿毛。** 无框架、无虚拟 DOM、无运行时依赖——纯 HTML + JS，esbuild 压缩后桌面安装包仅 2.5 MB。
- **历法有据。** 农历、节气、干支由开源历法库 [tyme4ts](https://github.com/6tail/tyme4ts) 计算，覆盖年份宽、边界处理稳。

---

## 立即体验

### 在线使用

无需安装，浏览器直接打开：

**https://wrz1911.github.io/daojiayinpan/**

网页版与桌面版共用同一份排盘内核，六盘、断局与调理功能完全一致；需要离线使用或把记录导出到本地文件，请下载安装包。

### 下载安装

从 [最新 Release](https://github.com/wrz1911/daojiayinpan/releases/latest) 获取对应平台安装包：

| 平台 | 文件 |
|------|------|
| Linux | `.deb` / `.rpm` / `.AppImage` |
| macOS | `.dmg` |
| Windows | `.exe` |
| Android | `.apk` |

> **Windows 用户**：exe 未签名，首次运行遇 SmartScreen 提示，点「更多信息」→「仍要运行」即可。
>
> **macOS 用户**：dmg 未公证，右键应用 →「打开」→ 再点「打开」，或到「系统设置 → 隐私与安全性」点「仍要打开」。
>
> **Linux 用户**：Arch 等发行版请用 `.AppImage`——免安装、免 root，赋予执行权限即可运行：
> ```bash
> chmod +x yinpan_*_linux_x86_64.AppImage && ./yinpan_*_linux_x86_64.AppImage
> ```

---

## 自行构建

```bash
npm install --legacy-peer-deps   # 安装依赖
npm run build:bundle             # 仅前端
npm run build:linux              # 桌面 deb / rpm
npm run build:appimage           # AppImage
npm run build:android            # Android APK
npm run setup                    # 构建环境体检
```

推送 tag 后 GitHub Actions 自动构建全平台安装包并发布 Release 与网页版。

---

## 开源声明

| 项目 | 协议 | 用途 |
|---|---|---|
| [tyme4ts](https://github.com/6tail/tyme4ts) | MIT | 农历 / 节气 / 干支计算 |
| [Tauri](https://github.com/tauri-apps/tauri) | MIT | 跨平台桌面框架 |

完整许可文本见 [`licenses/`](licenses/) 目录；JS 产物顶部均保留版权与许可声明。

## 协议

MIT License · 作者：地天泰

