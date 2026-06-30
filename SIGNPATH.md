# SignPath 代码签名策略

## 项目信息
- 项目：道家阴盘奇门遁甲
- 仓库：https://github.com/wrz1911/daojiayinpan
- 协议：MIT License
- 平台：Windows (x64)

## 签名策略
- 仅签名本项目构建产物（Windows 可执行文件）
- 每次 release 需手动批准签名
- 产物通过 GitHub Actions 从源码构建，完全可验证
- 使用 SignPath Foundation 颁发的证书

## 签名产物
- `app.exe` — 阴盘奇门遁甲 Windows 桌面应用
- `app-signed.exe` — 签名后输出
