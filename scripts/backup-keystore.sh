#!/bin/bash
# keystore 加密备份 —— 防"签名材料随迁移/换机丢失"(2026-09-24 实际发生过一次,
# 从原开发机 ~/文档/奇门排盘/android/ 抢救回来的; 下一次未必有这么幸运)。
#
# 后果意识: keystore 丢失 = 新 APK 签名对不上 = **所有老用户必须先卸载再安装**
# (排盘记录全丢)。本脚本用 gpg AES256 对称加密, 口令自定 —— 口令请存密码管理器,
# 口令丢失 = 备份作废。
#
# 用法:   bash scripts/backup-keystore.sh [输出目录]   # 默认 ~/qimen-sign-backup
# 恢复:   gpg -d <备份文件>.asc > android/qimen-release.keystore
#         再在 android/gradle.properties 尾部补两行口令(值见密码管理器, 勿入库)
set -e
cd "$(dirname "$0")/.."

SRC=android/qimen-release.keystore
[ -f "$SRC" ] || { echo "找不到 $SRC —— 签名材料不在本机, 无可备份"; exit 1; }

OUT_DIR="${1:-$HOME/qimen-sign-backup}"
mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/qimen-release.keystore.$(date +%Y%m%d).asc"

# --yes 覆盖同名; 对称加密, 交互输两次口令
gpg --yes --symmetric --cipher-algo AES256 --armor --output "$OUT" "$SRC"

echo ""
echo "已加密备份: $OUT ($(wc -c < "$OUT") 字节)"
echo "指纹核对: $(keytool -list -keystore "$SRC" -storepass "$(grep QIMEN_STORE_PASSWORD android/gradle.properties | cut -d= -f2)" 2>/dev/null | grep SHA256 | head -1 | tr -d ' ')"
echo "⚠️  请立刻把 gpg 口令存入密码管理器 —— 口令丢失 = 此备份作废。"
echo "   建议再把 .asc 文件抄送一份到离线介质(U盘/网盘加密区)。"
