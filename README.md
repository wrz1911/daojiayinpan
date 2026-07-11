# 道家阴盘奇门遁甲

道家阴盘奇门遁甲排盘系统，支持时盘、刻盘、心盘、山向、穿壬五种模式。

## 功能

- **时盘** — 按时辰排盘，支持自选局数
- **刻盘** — 分柱干支排盘
- **心盘** — 手动编辑宫位符号，自动推算全盘
- **山向奇门** — 24山360度向角度排盘，13副盘同屏
- **穿壬** — 奇门穿大六壬，九宫外圈天盘/天将/天干/建除，四课三传，时运命；支持自选局、时家刻家、八字四柱、大运流年

## 安装

从 [最新 Release](https://github.com/wrz1911/daojiayinpan/releases/latest) 下载对应平台安装包：

| 平台 | 文件 |
|------|------|
| Linux | `.deb` / `.rpm` |
| macOS | `.dmg` |
| Windows | `.exe` |
| Android | `.apk` |

推送 tag 后 GitHub Actions 自动构建全平台包并发布。

> **Windows 用户注意**：exe 文件未签名，首次运行时可能出现以下提示：
> - **Microsoft Defender SmartScreen** — 点击「更多信息」→「仍要运行」
> - **Edge 浏览器** — 下载后提示「已阻止不安全的文件」，点击「...」→「保留」→「仍然保留」

## 构建

### 桌面 (Tauri)

依赖 Rust / Cargo 和系统 WebKit：

```bash
# Linux
cargo tauri build

# Windows (需 MSVC 工具链)
cargo tauri build --target x86_64-pc-windows-msvc
```

或通过 GitHub Actions 自动构建（推送 tag）。

### Android

```bash
bash setup-apk.sh release
adb install android/app/build/outputs/apk/release/app-release.apk
```

## 开源声明

本项目基于以下开源项目：

| 项目 | 协议 | 用途 | 地址 |
|---|---|---|---|
| tyme4ts | MIT | 农历/节气/干支计算 | https://github.com/6tail/tyme4ts |
| Tauri | MIT | 跨平台桌面框架 | https://github.com/tauri-apps/tauri |

## 协议

MIT License
