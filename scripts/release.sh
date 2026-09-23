#!/bin/bash
# 发布脚本: 同步版本号 + 创建tag
# 用法: bash scripts/release.sh 1.3.1
# 版本号无变化时可重发: 自动跳过版本提交, 删除旧 tag 重建
set -e
cd "$(dirname "$0")/.."   # 脚本在 scripts/ 下, 仓库根是上一级

VER="$1"
if [ -z "$VER" ]; then
  echo "用法: bash scripts/release.sh <版本号>"
  echo "例如: bash scripts/release.sh 1.3.1"
  exit 1
fi

echo "=== 同步版本号到 v${VER} ==="
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${VER}\"/" src-tauri/tauri.conf.json package.json
# package-lock.json 的两处 version(顶层 2 空格缩进、packages[""] 6 空格缩进)需分别定位
sed -i "0,/^  \"version\": \"[^\"]*\"/s//  \"version\": \"${VER}\"/" package-lock.json
sed -i "0,/^      \"version\": \"[^\"]*\"/s//      \"version\": \"${VER}\"/" package-lock.json
# 同步关于弹窗中的 APP_VERSION 常量
sed -i "s/const APP_VERSION = '[^']*'/const APP_VERSION = '${VER}'/" qimen_app/js/yinpan_app.js
# 重建 bundle, 让新的 APP_VERSION 真正进包。
# (原脚本只 sed 源码不重建: CI 会重建所以线上没问题, 但仓库里提交的
#  qimen_bundle.min.js 会停留在旧版本号, 直接用仓库产物时会显示旧版本。)
if [ -f scripts/build.sh ] && command -v npx >/dev/null 2>&1; then
  if bash scripts/build.sh bundle >/dev/null 2>&1; then
    echo "  (已重建 qimen_bundle.min.js)"
  else
    echo "  ⚠️ bundle 重建失败, 请手动执行 scripts/build.sh bundle"
  fi
fi
# 同步 Tauri 的 Rust 包版本(与 tauri.conf.json 保持一致)及 Cargo.lock 中的 app 条目
sed -i "s/^version = \"[^\"]*\"/version = \"${VER}\"/" src-tauri/Cargo.toml
perl -0pi -e "s/(\[\[package\]\]\nname = \"app\"\nversion = \")[^\"]*/\${1}${VER}/" src-tauri/Cargo.lock
# Android 版本(android/ 不入库, 存在时才同步); versionCode = major*10000+minor*100+patch
VCODE=$(echo "$VER" | awk -F. '{printf "%d%02d%02d", $1, $2, $3}')
if [ -f android/app/build.gradle ]; then
  sed -i "s/versionCode [0-9]\+/versionCode ${VCODE}/" android/app/build.gradle
  sed -i "s/versionName \"[^\"]*\"/versionName \"${VER}\"/" android/app/build.gradle
  echo "  (已同步 android/app/build.gradle → ${VER} / ${VCODE})"
fi
git add src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock package.json package-lock.json qimen_app/js/yinpan_app.js qimen_app/js/qimen_bundle.min.js
if git diff --cached --quiet; then
  echo "版本号已是 v${VER}, 跳过同步提交"
else
  git commit -m "chore: 版本号同步到 v${VER}"
fi
git push origin main

echo "=== 创建并推送 tag v${VER} ==="
if git rev-parse -q --verify "refs/tags/v${VER}" >/dev/null 2>&1; then
  echo "本地 tag v${VER} 已存在, 删除重建"
  git tag -d "v${VER}"
fi
if git ls-remote --exit-code origin "refs/tags/v${VER}" >/dev/null 2>&1; then
  echo "远程 tag v${VER} 已存在, 删除重建(GitHub Release 会被更新)"
  git push origin --delete "v${VER}"
fi
git tag "v${VER}"
git push origin "v${VER}"

echo ""
echo "=== 完成 ==="
echo "v${VER} 已推送，GitHub Actions 开始构建"
echo "提示: 本地 Android 构建的 versionCode 需与 CI 公式一致"
echo "      (major*10000+minor*100+patch): v${VER} → $(echo "$VER" | awk -F. '{printf "%d%02d%02d", $1, $2, $3}')"
