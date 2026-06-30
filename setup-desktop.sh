#!/bin/bash
# 创建 Linux 桌面快捷方式
# 用法: bash setup-desktop.sh [安装路径]

DIR="${1:-$(cd "$(dirname "$0")" && pwd)}"
DESKTOP="$DIR/qimen-yinpan.desktop"
LOCAL="$HOME/.local/share/applications/qimen-yinpan.desktop"

cat > "$DESKTOP" << EOF
[Desktop Entry]
Name=阴盘奇门遁甲
Comment=道家阴盘奇门排盘工具
Exec=$DIR/run-desktop.sh
Icon=$DIR/icon.png
Terminal=false
Type=Application
Categories=Utility;
EOF

echo "已生成: $DESKTOP"

if [ -d "$HOME/.local/share/applications" ]; then
  cp "$DESKTOP" "$LOCAL"
  echo "已安装到: $LOCAL"
  echo "现在可以从应用菜单启动「阴盘奇门遁甲」"
fi
