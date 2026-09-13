#!/bin/bash
# 奇门阴盘 - Android APK 一键构建脚本
# 用法: bash setup-apk.sh [debug|release]
set -e

BUILD_TYPE="${1:-release}"
cd "$(dirname "$0")"

echo "=== 奇门阴盘 APK 构建 ==="

# 1. 安装依赖
if [ ! -d "node_modules/@capacitor" ]; then
  echo "[1/6] 安装 npm 依赖..."
  npm install
else
  echo "[1/6] npm 依赖已存在，跳过"
fi

# 2. 构建 www/ 目录
echo "[2/6] 构建 www/ 目录..."
rm -rf www
mkdir -p www/qimen_app/js www/qimen_app/css

# Capacitor 入口页
cat > www/index.html << 'HTMLEOF'
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="refresh" content="0;url=qimen_app/yinpan.html">
<script>window.location.replace('qimen_app/yinpan.html');</script>
</head>
<body></body>
</html>
HTMLEOF

# 复制所有必需文件 (CSS已合并到yinpan_app.css; html 只引用 bundle + tyme4j + 懒加载 gong_detail)
cp qimen_app/css/yinpan_app.css www/qimen_app/css/
cp qimen_app/js/tyme4j-browser.js www/qimen_app/js/
cp qimen_app/js/gong_detail_data.js www/qimen_app/js/
cp qimen_app/js/qimen_bundle.min.js www/qimen_app/js/
cp qimen_app/yinpan.html www/qimen_app/

# 3. 初始化 Android 平台（首次）
if [ ! -d "android" ]; then
  echo "[3/6] 初始化 Android 平台..."
  npx cap add android
else
  echo "[3/6] Android 平台已存在，跳过"
fi

# 4. 同步 web 资源
echo "[4/6] 同步 web 资源到 Android..."
npx cap sync

# 5. 生成签名密钥（仅首次 release 且 keystore 缺失时）
#    路径须与 android/app/build.gradle 的 storeFile('../qimen-release.keystore') 一致,
#    否则会重演"根目录与 android/ 下各一份 keystore、CI 与本地签名不一致"的历史坑
#    口令从环境变量读取,不得硬编码入库
if [ "$BUILD_TYPE" = "release" ] && [ ! -f "android/qimen-release.keystore" ]; then
  if [ -z "$QIMEN_KEYSTORE_PASSWORD" ]; then
    echo "[5/6] 错误: 需生成新签名密钥, 但未设置 QIMEN_KEYSTORE_PASSWORD" >&2
    echo "      签名口令不得写入仓库, 请先: export QIMEN_KEYSTORE_PASSWORD=<口令>" >&2
    echo "      若密钥已存在, 请放置于 android/qimen-release.keystore" >&2
    exit 1
  fi
  echo "[5/6] 生成签名密钥..."
  keytool -genkey -v -keystore android/qimen-release.keystore -alias qimen \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$QIMEN_KEYSTORE_PASSWORD" -keypass "$QIMEN_KEYSTORE_PASSWORD" \
    -dname "CN=qimen, OU=qimen, O=qimen, L=Unknown, ST=Unknown, C=CN"
else
  echo "[5/6] 签名密钥已存在或非 release 构建，跳过"
fi

# 6. 编译 APK
echo "[6/6] 编译 APK..."
if [ "$BUILD_TYPE" = "release" ]; then
  cd android && ./gradlew assembleRelease
  echo ""
  echo "=== 完成 ==="
  echo "APK: android/app/build/outputs/apk/release/app-release.apk"
else
  cd android && ./gradlew assembleDebug
  echo ""
  echo "=== 完成 ==="
  echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"
fi
