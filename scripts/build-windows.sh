#!/bin/sh
# Windows 桌面构建: 同步 web 资源 → 编译 app.exe
#
# 与 CI 的 windows job 完全一致(--no-bundle):
#   Windows 上无法打 deb/rpm/AppImage(那是 Linux 的活), 也不打 MSI/NSIS
#   (tauri.conf.json 的 bundle.targets 未含这些目标), 只出裸 exe。
#   需要 Windows 安装包时, 先在 tauri.conf.json 的 targets 里加 nsis/msi。
#
# 用法: npm run build:windows  或  sh scripts/build-windows.sh
# 前置: Node ≥ 20、Rust(stable-msvc)、MSVC C++ 生成工具 + Windows SDK、WebView2 运行时
#       —— 用 npm run setup:windows 自检
set -e
cd "$(dirname "$0")/.."

echo "=== 同步 web 资源 ==="
rm -rf web
mkdir -p web/qimen_app/css web/qimen_app/js

npm run build:bundle
# CSS 用压缩产物, 但沿用 HTML 里的引用名(见 scripts/build_bundle.sh)
cp qimen_app/css/yinpan_app.min.css web/qimen_app/css/yinpan_app.css
cp qimen_app/js/qimen_bundle.min.js web/qimen_app/js/
cp qimen_app/js/tyme4j-browser.js web/qimen_app/js/
cp qimen_app/js/gong_detail_data.js web/qimen_app/js/
cp qimen_app/yinpan.html web/qimen_app/

# 兼容入口: 桌面端窗口由 tauri.conf.json 的 windows[0].url 直达 yinpan.html,
# 本文件仅为直接用静态服务器打开 web/ 时兜底(与 CI 的 Setup frontend 一致)。
cat > web/index.html << 'HTMLEOF'
<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="refresh" content="0;url=qimen_app/yinpan.html">
<script>window.location.replace('qimen_app/yinpan.html');</script></head><body></body></html>
HTMLEOF

echo ""
echo "=== Tauri 编译(--no-bundle) ==="
npx tauri build --no-bundle

echo ""
echo "=== 完成 ==="
ls -lh src-tauri/target/release/app.exe 2>/dev/null || true
echo "启动: src-tauri/target/release/app.exe (或开发模式 npx tauri dev)"
