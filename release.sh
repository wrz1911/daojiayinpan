#!/bin/bash
# 发布脚本: 同步版本号 + 创建tag
# 用法: bash release.sh 1.3.1
set -e
cd "$(dirname "$0")"

VER="$1"
if [ -z "$VER" ]; then
  echo "用法: bash release.sh <版本号>"
  echo "例如: bash release.sh 1.3.1"
  exit 1
fi

echo "=== 同步版本号到 v${VER} ==="
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${VER}\"/" src-tauri/tauri.conf.json package.json
git add src-tauri/tauri.conf.json package.json
git commit -m "chore: 版本号同步到 v${VER}"
git push origin main

echo "=== 创建并推送 tag v${VER} ==="
git tag "v${VER}"
git push origin "v${VER}"

echo "=== 完成 ==="
echo "v${VER} 已推送，GitHub Actions 开始构建"
