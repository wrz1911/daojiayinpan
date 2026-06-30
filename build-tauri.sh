#!/bin/bash
# Tauri 构建脚本
set -e
cd "$(dirname "$0")"

echo "=== 构建 web 资源 ==="
rm -rf web
mkdir -p web/css/fonts web/css/yinpan web/js web/qimen_app/js
cp css/tool.css web/css/
cp css/yinpan/yinpan.css web/css/yinpan/
cp css/fonts/MiSans-VF.ttf web/css/fonts/
cp js/tyme4ts-browser.js web/js/
cp js/gong_detail_data.js web/js/
cp qimen_app/yinpan_standalone.html web/qimen_app/
cp qimen_app/js/qimen_engine_min.js web/qimen_app/js/

echo "=== Tauri 编译 ==="
/usr/bin/cargo-tauri build -b deb -b rpm -b appimage 2>&1 || true

echo ""
echo "=== 完成 ==="
echo "二进制: src-tauri/target/release/app"
ls -lh src-tauri/target/release/app 2>/dev/null
