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
mkdir -p www/css/fonts www/css/yinpan www/js www/qimen_app/js

# Capacitor 入口页
cat > www/index.html << 'HTMLEOF'
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="refresh" content="0;url=qimen_app/yinpan_standalone.html">
<script>window.location.replace('qimen_app/yinpan_standalone.html');</script>
</head>
<body></body>
</html>
HTMLEOF

# 复制所有必需文件
cp css/tool.css www/css/
cp css/yinpan/yinpan.css www/css/yinpan/
cp js/tyme4ts-browser.js www/js/
cp js/gong_detail_data.js www/js/
cp qimen_app/yinpan_standalone.html www/qimen_app/
cp qimen_app/js/qimen_engine_min.js www/qimen_app/js/

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

# 5. 生成签名密钥（首次 release）
if [ "$BUILD_TYPE" = "release" ] && [ ! -f "qimen-release.keystore" ]; then
  echo "[5/6] 生成签名密钥..."
  keytool -genkey -v -keystore qimen-release.keystore -alias qimen \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass qimen123 -keypass qimen123 \
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
