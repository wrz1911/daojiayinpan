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
# 打包 4 个自有 JS 为单一 bundle(与 CI Setup frontend 一致, HTML 只引用 bundle)
npm run build:bundle
cp qimen_app/js/qimen_bundle.min.js web/qimen_app/js/
cp qimen_app/js/tyme4j-browser.js web/qimen_app/js/
cp qimen_app/js/gong_detail_data.js web/qimen_app/js/


# 入口页
cat > web/index.html << 'HTMLEOF'
<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="refresh" content="0;url=qimen_app/yinpan_standalone.html"><script>window.location.replace('qimen_app/yinpan_standalone.html');</script></head><body></body></html>
HTMLEOF

echo "=== Tauri 编译 ==="
cd src-tauri
# 用项目内安装的 tauri-cli (npm devDependency), 避免依赖全局 cargo install
npx tauri build 2>&1 || { echo "ERROR: Tauri build failed"; exit 1; }

echo ""
echo "=== 完成 ==="
echo "二进制: src-tauri/target/release/app"
ls -lh target/release/app 2>/dev/null || true
ls -lh target/release/bundle/deb/*.deb 2>/dev/null || true
ls -lh target/release/bundle/rpm/*.rpm 2>/dev/null || true
