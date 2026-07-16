#!/bin/bash
# Tauri PC 构建脚本 (含资源同步)
set -e
cd "$(dirname "$0")"

echo "=== 同步 web 资源 ==="
rm -rf web
mkdir -p web/qimen_app/css web/qimen_app/js

# qimen_app 文件
cp qimen_app/yinpan_standalone.html web/qimen_app/
cp qimen_app/css/yinpan_app.css web/qimen_app/css/
cp qimen_app/js/yinpan_app.js web/qimen_app/js/
cp qimen_app/js/qimen_engine_min.js web/qimen_app/js/
cp qimen_app/js/qimen_chuanren.js web/qimen_app/js/
cp qimen_app/js/tyme4j-browser.js web/qimen_app/js/
cp qimen_app/js/gong_detail_data.js web/qimen_app/js/


# 入口页
cat > web/index.html << 'HTMLEOF'
<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="refresh" content="0;url=qimen_app/yinpan_standalone.html"><script>window.location.replace('qimen_app/yinpan_standalone.html');</script></head><body></body></html>
HTMLEOF

echo "=== Tauri 编译 ==="
cd src-tauri
cargo tauri build 2>&1 || { echo "ERROR: Tauri build failed"; exit 1; }

echo ""
echo "=== 完成 ==="
echo "二进制: src-tauri/target/release/app"
ls -lh src-tauri/target/release/app 2>/dev/null || true
ls -lh src-tauri/target/release/bundle/deb/*.deb 2>/dev/null || true
