#!/bin/bash
# 构建 Linux AppImage —— 含「WebKit 辅助进程路径」补丁，使产物真正零安装。
#
# ── 为什么需要这个脚本 ────────────────────────────────────────────────
# Tauri 的 AppImage 打包在 CI(ubuntu-latest) 上开箱即用，但在本机(Arch)有两道坎：
#   1) 缺 patchelf / mksquashfs / zsyncmake —— linuxdeploy 会以 exit 127 失败；
#   2) linuxdeploy 自带的 strip 过旧，不识别 Arch 新库的 `.relr.dyn` 段。
# 更关键的是第三点，与平台无关：
#   3) WebKitGTK 把辅助进程目录**编译期硬编码**为 /usr/lib/webkit2gtk-4.1，
#      且不提供任何覆盖用环境变量（2.52.6 实测 `WEBKIT_EXEC_PATH` 在 .so 中
#      出现 0 次）。于是即便 AppImage 打包了 libwebkit2gtk 与 WebKitNetworkProcess，
#      在未安装 webkit2gtk-4.1 的机器上仍会启动失败：
#        ERROR **: Unable to spawn a new child process:
#        生成子进程"/usr/lib/webkit2gtk-4.1/WebKitNetworkProcess"失败
#
# ── 补丁原理 ──────────────────────────────────────────────────────────
#   a) 把库中该路径**等长**改写为 /tmp/qimen-wk/webkit41（短的用 \0 补齐），
#      长度不变 ⇒ ELF 段偏移/符号表全部不受影响；
#   b) 在 AppRun 钩子里把 AppImage 自带的辅助进程目录软链到该路径。
#      该路径同时也是 injected-bundle 的前缀，一并解决。
#
# ── 用法 ──────────────────────────────────────────────────────────────
#   bash scripts/build-appimage.sh              # 全流程
#   bash scripts/build-appimage.sh --patch-only # 跳过 Tauri/linuxdeploy，只补丁+打包
#
# 若打包工具不在 PATH，可先用 QIMEN_TOOLS_DIR 指向解包目录（免 root 从镜像解包）：
#   QIMEN_TOOLS_DIR=/tmp/tools bash scripts/build-appimage.sh
# 例：mirrors.tuna.tsinghua.edu.cn/archlinux/extra/os/x86_64/
#     {patchelf,squashfs-tools,zsync}-<ver>-x86_64.pkg.tar.zst  → tar --zstd -xf
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
PATCH_ONLY=0
[ "${1:-}" = "--patch-only" ] && PATCH_ONLY=1

PATCH_OLD='/usr/lib/webkit2gtk-4.1'
PATCH_NEW='/tmp/qimen-wk/webkit41'          # 必须不长于 PATCH_OLD
HOOK_MARK='qimen-wk'
BUNDLE_DIR="src-tauri/target/release/bundle/appimage"
TAURI_CACHE="$HOME/.cache/tauri"
LD_EXTRACT=/tmp/ld-extract                  # linuxdeploy 解压目录（两个分支都要用）

[ -n "${QIMEN_TOOLS_DIR:-}" ] && export PATH="$QIMEN_TOOLS_DIR/usr/bin:$PATH"

# ── 1. 工具检查 ──
missing=0
for t in patchelf mksquashfs zsyncmake; do
  command -v "$t" >/dev/null 2>&1 || { echo "❌ 缺少 $t"; missing=1; }
done
if [ "$missing" = 1 ]; then
  cat <<'TIP'
   这三个工具 AppImage 打包必需。免 root 获取方式（Arch 例）：
     mkdir -p /tmp/pkgs /tmp/tools && cd /tmp/pkgs
     for p in patchelf squashfs-tools zsync; do
       url=$(pacman -Sp $p | awk '{print $1"x86_64/"$2}')   # 或用镜像直链
       curl -sLO "$url" && tar --zstd -xf "$(basename "$url")" -C /tmp/tools
     done
     QIMEN_TOOLS_DIR=/tmp/tools bash scripts/build-appimage.sh
TIP
  exit 1
fi

# ── 2. 生成 AppDir 并部署依赖 ──
if [ "$PATCH_ONLY" = 0 ]; then
  echo "=== 2/4 生成 AppDir（Tauri 调用 linuxdeploy 时会失败，属预期）==="
  ( cd src-tauri && APPIMAGE_EXTRACT_AND_RUN=1 npx tauri build --bundles appimage >/dev/null 2>&1 || true )

  APPDIR=$(find "$BUNDLE_DIR" -maxdepth 1 -name '*.AppDir' -print -quit)
  [ -n "$APPDIR" ] || { echo "❌ AppDir 未生成，请检查 tauri build 输出"; exit 1; }

  # linuxdeploy 自带 strip 过旧 → 换成系统 strip（binutils）

  if [ ! -x "$LD_EXTRACT/squashfs-root/AppRun" ]; then
    echo "   解压 linuxdeploy 以替换其内置 strip…"
    rm -rf "$LD_EXTRACT" && mkdir -p "$LD_EXTRACT"
    ( cd "$LD_EXTRACT" && "$TAURI_CACHE/linuxdeploy-x86_64.AppImage" --appimage-extract >/dev/null )
  fi
  if [ -x "$LD_EXTRACT/squashfs-root/usr/bin/strip.orig" ]; then
    :   # 已替换过
  elif [ -x "$LD_EXTRACT/squashfs-root/usr/bin/strip" ]; then
    mv "$LD_EXTRACT/squashfs-root/usr/bin/strip" "$LD_EXTRACT/squashfs-root/usr/bin/strip.orig"
    cp "$(command -v strip)" "$LD_EXTRACT/squashfs-root/usr/bin/strip"
  fi

  # linuxdeploy 按 `linuxdeploy-plugin-<name>` 正则查 PATH
  mkdir -p /tmp/ld-plugins
  [ -f /tmp/ld-plugins/linuxdeploy-plugin-gtk ] || {
    cp "$TAURI_CACHE/linuxdeploy-plugin-gtk.sh" /tmp/ld-plugins/linuxdeploy-plugin-gtk
    chmod +x /tmp/ld-plugins/linuxdeploy-plugin-gtk
  }

  echo "   部署依赖（跳过 gtk 插件：本机 gdk-pixbuf loaders 目录常缺失，且目标机已有 GTK3）…"
  APPIMAGE_EXTRACT_AND_RUN=1 VERSION="${VERSION:-$(grep -m1 '"version"' src-tauri/tauri.conf.json | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')}" \
    PATH="/tmp/ld-plugins:$PATH" \
    "$LD_EXTRACT/squashfs-root/AppRun" --appdir "$APPDIR" >/tmp/qimen-linuxdeploy.log 2>&1 || {
      echo "⚠️  linuxdeploy 返回非 0（日志 /tmp/qimen-linuxdeploy.log），继续尝试打包"; }
else
  APPDIR=$(find "$BUNDLE_DIR" -maxdepth 1 -name '*.AppDir' -print -quit)
  [ -n "$APPDIR" ] || { echo "❌ 未找到 AppDir（先跑一次不带 --patch-only）"; exit 1; }
fi

# ── 3. WebKit 辅助进程路径补丁 ──
echo "=== 3/4 WebKit 路径补丁 ==="
WKLIB="$APPDIR/usr/lib/libwebkit2gtk-4.1.so.0"
[ -f "$WKLIB" ] || { echo "❌ 未找到 $WKLIB"; exit 1; }

PATCH_OLD="$PATCH_OLD" PATCH_NEW="$PATCH_NEW" WKLIB="$WKLIB" python3 - <<'PY'
import io, os, re
lib, new = os.environ['WKLIB'], os.environ['PATCH_NEW'].encode()
data = io.open(lib, 'rb').read()
# 自动探测库中的辅助进程目录 —— 各发行版编译期取值不同（Arch 为
# /usr/lib/webkit2gtk-4.1，Debian/Ubuntu 为 /usr/lib/x86_64-linux-gnu/webkit2gtk-4.1），
# 写死单一假设会让 CI 静默失效。
# 注意必须限定在 /usr/lib 下：库里还有大量 /usr/src/debug/webkit2gtk-4.1 这类
# 编译期调试路径，用宽泛正则会把它们一并改掉（无害但没必要，且掩盖真实命中）。
pat = rb'/usr/lib(?:/[A-Za-z0-9_.+-]+)?/webkit2gtk-4\.1'
cands = {c for c in re.findall(pat, data) if len(c) >= len(new)}
if not cands:
    print('   未找到可替换的旧路径（已是补丁状态，跳过）')
else:
    total = 0
    for old in sorted(cands, key=len, reverse=True):
        n = data.count(old)
        if n:
            data = data.replace(old, new + b'\x00' * (len(old) - len(new)))
            total += n
            print(f'   {old.decode()} × {n}  →  {new.decode()}')
    io.open(lib, 'wb').write(data)
    print(f'   共 {total} 处（等长改写，未改动 ELF 结构）')
PY

HOOK_DIR="$APPDIR/apprun-hooks"
HOOK="$HOOK_DIR/linuxdeploy-plugin-gtk.sh"

# ── 先确保 AppRun 是「会 source hooks 的 shell 包装」──
# 这一步才是关键，极易漏掉：AppDir 里的 AppRun 有两种形态 ——
#   a) linuxdeploy 生成的 shell 包装（274B）：source apprun-hooks/* 后 exec AppRun.wrapped；
#   b) Tauri 自带的 AppRun（31KB ELF）：自己扫描 .desktop 找 Exec= 并设置环境，
#      **完全不认 apprun-hooks/**。
# 只有 linuxdeploy 完整跑完才会产出 a)。本脚本跳过了 gtk 插件（本机 gdk-pixbuf
# loaders 常缺失），linuxdeploy 中途失败 → 留下 b) → 我们写进 hook 的软链逻辑
# 永远不会执行。实测症状：库内路径已改写成功，却仍报
# "/tmp/qimen-wk/webkit41/WebKitNetworkProcess 没有那个文件或目录"。
if head -c 4 "$APPDIR/AppRun" 2>/dev/null | grep -q ELF; then
  [ -f "$APPDIR/AppRun.wrapped" ] || mv "$APPDIR/AppRun" "$APPDIR/AppRun.wrapped"
  cat > "$APPDIR/AppRun" <<'WRAPRUN'
#! /usr/bin/env bash
# 由 scripts/build-appimage.sh 生成：把 Tauri 的二进制 AppRun 包一层，
# 以便执行 apprun-hooks/ 下的钩子（Tauri 原生 AppRun 不认 hooks）。
set -e
this_dir="$(readlink -f "$(dirname "$0")")"
hook="$this_dir/apprun-hooks/linuxdeploy-plugin-gtk.sh"
[ -f "$hook" ] && { source "$hook" || true; }
exec "$this_dir/AppRun.wrapped" "$@"
WRAPRUN
  chmod +x "$APPDIR/AppRun"
  echo "   已把 Tauri 的二进制 AppRun 包装为 shell 版（否则 hooks 不会执行）"
fi

# 写 hook（linuxdeploy 生成的 AppRun 只 source 这一个固定文件名，新增独立
# hook 不会被执行）。文件可能不存在，必须补上 —— AppRun 是 `set -e` + source，
# 缺文件会让应用**直接启动失败**（与是否装 webkit 无关）。
mkdir -p "$HOOK_DIR"
if [ ! -f "$HOOK" ]; then
  printf '#!/bin/bash\n' > "$HOOK"
  echo "   已补建缺失的 AppRun 钩子文件"
fi
if ! grep -q "$HOOK_MARK" "$HOOK"; then
  cat >> "$HOOK" <<EOF

# --- WebKit 辅助进程路径补丁（见 scripts/build-appimage.sh）---
# WebKitGTK 硬编码 /usr/lib/webkit2gtk-4.1 且无环境变量可覆盖，故把库中该
# 路径等长改写到 $PATCH_NEW，再在此处软链 AppImage 自带的辅助进程目录。
#
# ⚠️ 不要直接用 \$APPDIR：那是 **linuxdeploy 的 gtk 插件**设置的，而本脚本
# 会跳过该插件（本机 gdk-pixbuf loaders 常缺失），此时变量为空 —— 实测表现
# 为库已改写、软链却没建，启动仍报 "Unable to spawn a new child process"。
# 这里自行推断：AppRun 已算好 this_dir 且 source 与它同一 shell，可直接取用；
# 再退一步用本 hook 相对路径回溯（hook 位于 <AppDir>/apprun-hooks/ 下）。
_qm_appdir="\${APPDIR:-\${this_dir:-\$(cd "\$(dirname "\$0")/.." 2>/dev/null && pwd)}}"
if [ -n "\$_qm_appdir" ] && [ -d "\$_qm_appdir/usr/lib/webkit2gtk-4.1" ]; then
  mkdir -p "$(dirname "$PATCH_NEW")"
  ln -sfn "\$_qm_appdir/usr/lib/webkit2gtk-4.1" "$PATCH_NEW"
fi
EOF
  echo "   AppRun 钩子已注入软链逻辑"
else
  echo "   软链逻辑已存在（幂等跳过）"
fi

# ── 4. 打包 ──
echo "=== 4/4 打包 AppImage ==="
PLUGIN="$LD_EXTRACT/squashfs-root/plugins/linuxdeploy-plugin-appimage/AppRun"
[ -x "$PLUGIN" ] || PLUGIN="$TAURI_CACHE/linuxdeploy-plugin-appimage.AppImage"
VER="${VERSION:-$(grep -m1 '"version"' src-tauri/tauri.conf.json | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')}"
rm -f src-tauri/*.AppImage
( cd src-tauri && APPIMAGE_EXTRACT_AND_RUN=1 VERSION="$VER" "$PLUGIN" --appdir "$ROOT/$APPDIR" >/tmp/qimen-appimage.log 2>&1 ) || {
  echo "❌ 打包失败，日志尾部："; tail -15 /tmp/qimen-appimage.log; exit 1; }

OUT=$(find "$ROOT/src-tauri" -maxdepth 1 -name '*.AppImage' -print -quit)
[ -n "$OUT" ] || { echo "❌ 未产出 AppImage，日志尾部："; tail -15 /tmp/qimen-appimage.log; exit 1; }

# 自检：确认补丁确实进了产物
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
( cd "$tmp" && "$OUT" --appimage-extract >/dev/null 2>&1 )
ok_lib=$(grep -c "$PATCH_NEW" "$tmp/squashfs-root/usr/lib/libwebkit2gtk-4.1.so.0" 2>/dev/null || echo 0)
ok_hook=$(grep -c "$HOOK_MARK" "$tmp/squashfs-root/apprun-hooks/linuxdeploy-plugin-gtk.sh" 2>/dev/null || echo 0)

echo ""
echo "✅ 产物: $OUT  ($(du -h "$OUT" | cut -f1))"
echo "   自检: 库内新路径 $ok_lib 处，hook 命中 $ok_hook 处 $([ "$ok_lib" -gt 0 ] && [ "$ok_hook" -gt 0 ] && echo '→ 补丁已生效' || echo '❌ 补丁异常')"
echo "   提示: 目标机无需安装 webkit2gtk-4.1；仍建议装 libfuse2 以便直接双击。"
