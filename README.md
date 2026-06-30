# 道家阴盘奇门遁甲

道家阴盘奇门遁甲排盘系统，支持时盘、刻盘、心盘三种模式。

## 功能

- **时盘** — 按时辰排盘，支持自选局数
- **刻盘** — 分柱干支排盘
- **心盘** — 手动编辑宫位符号，自动推算全盘
- **移星换斗** — 顺转 1-7 宫
- **天门地户** — 月将加时支环绕
- **神将十二** — 年月日时四柱神将
- **81格局** — 宫位天地盘干组合解读
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
| MiSans | SIL OFL | 桌面/移动端字体 | https://github.com/xiaomi/MiSans |
| Tauri | MIT | 跨平台桌面框架 | https://github.com/tauri-apps/tauri |

## 协议

MIT License
