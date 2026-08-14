# 道家阴盘奇门遁甲

道家阴盘奇门遁甲排盘系统，支持时盘、刻盘、心盘、山向、穿壬五种模式。

## 功能

- **时盘** — 按时辰排盘，支持自选局数
- **刻盘** — 分柱干支排盘
- **心盘** — 手动编辑宫位符号，自动推算全盘
- **山向奇门** — 24山360度向角度排盘，13副盘同屏
- **穿壬** — 奇门穿大六壬，九宫外圈天盘/天将/天干/建除，四课三传，时运命；支持自选局、时家刻家、八字四柱、大运流年
- **关于** — 底部条「关于」按钮显示作者与项目信息

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

## 本地构建

前端打包（4 个 IIFE JS 合并压缩为单一 bundle）：

```bash
npm install --legacy-peer-deps
npm run build:bundle        # 生成 qimen_app/js/qimen_bundle.min.js
```

### 桌面 (Linux / Tauri)

```bash
bash build-tauri.sh         # 同步 web 资源 → tauri build → deb/rpm
# 产物: src-tauri/target/release/bundle/deb|rpm/
```

Windows / macOS 需对应平台工具链，由 CI 构建（推送 tag 自动触发）。

### Android

```bash
npx cap sync android                          # 同步 www 资源到 android assets（必须从项目根执行）
cd android && ./gradlew assembleRelease       # 产物: android/app/build/outputs/apk/release/app-release.apk
```

## Android 无线调试部署

手机与电脑同一局域网，手机开启「开发者选项 → 无线调试」：

1. 首次使用需配对（手机点「使用配对码配对设备」，获得配对端口与 6 位配对码）：

   ```bash
   adb pair 192.168.x.x:<配对端口>   # 输入配对码
   ```

2. 连接（端口见无线调试主界面「IP 地址和端口」）：

   ```bash
   adb connect 192.168.x.x:<连接端口>
   adb install -r android/app/build/outputs/apk/release/app-release.apk
   ```

设备 IP 未知时可用 `nmap -p <端口> --open 192.168.1.0/24` 扫描网段定位。

## Android 签名

- keystore：`android/qimen-release.keystore`（**不入库**，`.gitignore` 排除）
- 签名密码：`android/gradle.properties` 的 `QIMEN_STORE_PASSWORD` / `QIMEN_KEY_PASSWORD`（不入库），build.gradle 通过 `findProperty` 读取，不硬编码明文
- CI 签名：keystore 与密码存于 GitHub Secrets（`KEYSTORE_BASE64` / `KEYSTORE_PASSWORD`），CI 运行时恢复，保证 **Release APK 与本地构建签名一致**（可覆盖安装升级）
- versionCode 规则：`major*10000 + minor*100 + patch`（如 1.3.7 → 10307），本地与 CI 保持一致

## 发布

```bash
bash release.sh 1.3.7
```

自动完成：版本号同步（tauri.conf.json / package.json / APP_VERSION 常量，无变化自动跳过）→ push main → 创建/重建 tag v1.3.7 → 触发 GitHub Actions 四平台构建并发布 Release。

## 开发

```bash
npx eslint qimen_app/js/*.js   # 静态检查（no-undef 等，防止 IIFE strict 下未声明变量运行时错误）
```

运行时错误静默记录：应用内发生异常时右下角出现 ⚠，点击可复制错误日志（localStorage ring buffer，30 条）便于报障排查。

## 开源声明

本项目基于以下开源项目：

| 项目 | 协议 | 用途 | 地址 |
|---|---|---|---|
| tyme4ts | MIT | 农历/节气/干支计算 | https://github.com/6tail/tyme4ts |
| Tauri | MIT | 跨平台桌面框架 | https://github.com/tauri-apps/tauri |

## 协议

MIT License
