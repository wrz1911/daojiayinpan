#!/bin/bash
# 发布脚本: 同步版本号 + 创建tag
# 用法: bash release.sh 1.3.1
# 版本号无变化时可重发: 自动跳过版本提交, 删除旧 tag 重建
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
# 同步关于弹窗中的 APP_VERSION 常量
sed -i "s/const APP_VERSION = '[^']*'/const APP_VERSION = '${VER}'/" qimen_app/js/yinpan_app.js
git add src-tauri/tauri.conf.json package.json qimen_app/js/yinpan_app.js
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
