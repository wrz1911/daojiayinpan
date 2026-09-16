#!/bin/bash
# Tauri PC 构建脚本 (含资源同步)
set -e
cd "$(dirname "$0")"

echo "=== 同步 web 资源 ==="
rm -rf web
mkdir -p web/qimen_app/css web/qimen_app/js

# qimen_app 文件
cp qimen_app/yinpan.html web/qimen_app/
# 打包 4 个自有 JS 为单一 bundle + 压缩 CSS(与 CI Setup frontend 一致, HTML 只引用 bundle)
npm run build:bundle
# CSS 拷压缩产物, 但沿用 HTML 里的引用名 yinpan_app.css(见 scripts/build_bundle.sh)
cp qimen_app/css/yinpan_app.min.css web/qimen_app/css/yinpan_app.css
cp qimen_app/js/qimen_bundle.min.js web/qimen_app/js/
cp qimen_app/js/tyme4j-browser.js web/qimen_app/js/
cp qimen_app/js/gong_detail_data.js web/qimen_app/js/


# 兼容入口页:桌面端窗口已由 tauri.conf.json 的 windows[0].url 直达
# qimen_app/yinpan.html,不再经过本页(消除一次跳转白屏)。
# 保留此文件仅为万一直接用浏览器/静态服务器打开 web/ 目录时的兜底入口。
cat > web/index.html << 'HTMLEOF'
<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="refresh" content="0;url=qimen_app/yinpan.html"><script>window.location.replace('qimen_app/yinpan.html');</script></head><body></body></html>
HTMLEOF

echo "=== Tauri 编译 ==="
cd src-tauri
# 用项目内安装的 tauri-cli (npm devDependency), 避免依赖全局 cargo install
# 打包目标默认 deb,rpm; 需要 AppImage 时传参:
#   bash build-tauri.sh deb,rpm,appimage
# 注意 AppImage 依赖系统工具 patchelf / mksquashfs / zsyncmake, 缺失会失败,
# 故不放进默认值(tauri.conf.json 的 bundle.targets 仍含 appimage, 供 CI 使用)
BUNDLES="${1:-deb,rpm}"
npx tauri build --bundles "$BUNDLES" 2>&1 || { echo "ERROR: Tauri build failed"; exit 1; }

echo ""
echo "=== 完成 ==="
echo "二进制: src-tauri/target/release/app"
ls -lh target/release/app 2>/dev/null || true
ls -lh target/release/bundle/deb/*.deb 2>/dev/null || true
ls -lh target/release/bundle/rpm/*.rpm 2>/dev/null || true
ls -lh target/release/bundle/appimage/*.AppImage 2>/dev/null || true
