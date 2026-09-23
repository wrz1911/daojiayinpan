#!/bin/bash
# 阴盘奇门遁甲 · 构建统一入口
# ------------------------------------------------------------------
# 把原先散着的 build-bundle / build-tauri / build-appimage 合并为一个入口,
# 并转调 build-android.sh(Android 那套 9 项 CI 补丁逻辑独立成文件, 与桌面链路无关)。
#
# 用法:
#   npm run build                 # 默认 = bundle + linux
#   scripts/build.sh bundle       # 前端 bundle + CSS 压缩(esbuild)
#   scripts/build.sh linux [目标]  # Tauri 桌面; 目标默认 "deb,rpm"
#   scripts/build.sh appimage     # AppImage(含 WebKit 辅助进程路径补丁)
#   scripts/build.sh appimage --patch-only   # 跳过 linuxdeploy, 只补丁+重打包(CI 用)
#   scripts/build.sh android [参数]  # 转 build-android.sh(见 npm run build:android -- --help)
#   scripts/build.sh all          # bundle + linux + android
#
# ⚠️ bundle / linux / all 构建完成后会**自动把网页版同步到内网 192.168.1.3**
#    (见 scripts/deploy-web.py; 凭据取环境变量 QIMEN_WEB_PASS 或项目根 .qimen-web-pass)。
#    加 --no-deploy 可跳过; 改代码后想在手机上立刻看效果, 用 npm run dev(watch 自动重建+同步)。
#
# 产物:
#   bundle   → qimen_app/js/qimen_bundle.min.js + qimen_app/css/yinpan_app.min.css
#   linux    → src-tauri/target/release/bundle/{deb,rpm}/
#   appimage → src-tauri/*.AppImage
#   android  → android/app/build/outputs/apk/{debug,release}/app-*.apk
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ============================ 公共 ============================
if [ -t 1 ]; then
  C_CYAN=$'\033[36m'; C_GREEN=$'\033[32m'; C_GRAY=$'\033[90m'
  C_RED=$'\033[31m'; C_YELLOW=$'\033[33m'; C_WHITE=$'\033[97m'; C_RST=$'\033[0m'
else
  C_CYAN=; C_GREEN=; C_GRAY=; C_RED=; C_YELLOW=; C_WHITE=; C_RST=
fi
Step() { echo; echo "${C_CYAN}=== $* ===${C_RST}"; }
Ok()   { echo "   ${C_GREEN}[完成] $*${C_RST}"; }
Info() { echo "   ${C_GRAY}$*${C_RST}"; }
Bad()  { echo "   ${C_RED}[失败] $*${C_RST}"; }
Warn() { echo "   ${C_YELLOW}$*${C_RST}"; }
Die()  { Bad "$*"; exit 1; }

PY="$(command -v python3 || command -v python || true)"

# 同步 web 资源到 --frontendDist 指向的 web/(tauri.conf.json 写的是 ../web)
# 原先 build-tauri.sh 与 build-windows.sh 各抄了一份, 这里统一。
prepare_web() {
  Step '同步 web 资源'
  rm -rf "$ROOT/web" || Die '无法清理 web/'
  mkdir -p "$ROOT/web/qimen_app/css" "$ROOT/web/qimen_app/js"
  cp "$ROOT/qimen_app/yinpan.html" "$ROOT/web/qimen_app/"
  cmd_bundle                       # bundle 必须在拷贝之前生成
  # CSS 拷压缩产物, 但沿用 HTML 里的引用名 yinpan_app.css(见 cmd_bundle)
  cp "$ROOT/qimen_app/css/yinpan_app.min.css" "$ROOT/web/qimen_app/css/yinpan_app.css"
  cp "$ROOT/qimen_app/js/qimen_bundle.min.js" "$ROOT/web/qimen_app/js/"
  cp "$ROOT/qimen_app/js/tyme4j-browser.js"   "$ROOT/web/qimen_app/js/"
  cp "$ROOT/qimen_app/js/gong_detail_data.js" "$ROOT/web/qimen_app/js/"

  # 兼容入口页: 桌面端窗口已由 tauri.conf.json 的 windows[0].url 直达
  # qimen_app/yinpan.html, 不再经过本页(消除一次跳转白屏)。
  # 保留此文件仅为万一直接用浏览器/静态服务器打开 web/ 目录时的兜底入口。
  cat > "$ROOT/web/index.html" << 'HTMLEOF'
<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="refresh" content="0;url=qimen_app/yinpan.html"><script>window.location.replace('qimen_app/yinpan.html');</script></head><body></body></html>
HTMLEOF
  Ok "web/ 就绪 ($(find "$ROOT/web" -type f | wc -l) 个文件)"
}

# ============================ bundle ============================
# 6 个自有 JS 合并压缩为单一 bundle + CSS 压缩(顺序: constants → engine → chuanren → mingli → bazi → app)
# 各文件均为 IIFE 包裹, 顺序拼接无作用域冲突, engine 的 'use strict' 指令随 IIFE 保留。
cmd_bundle() {
  Step '前端 bundle'
  cd "$ROOT/qimen_app/js" || Die '找不到 qimen_app/js'

  local VER BANNER
  VER=$(sed -n "s/.*const APP_VERSION = '\([^']*\)'.*/\1/p" yinpan_app.js | head -1)
  BANNER=$(mktemp)
  cat > "$BANNER" <<EOF
/*!
 * 道家阴盘奇门遁甲 v${VER:-unknown} | MIT License
 * https://github.com/wrz1911/daojiayinpan
 * Copyright (c) 2026 地天泰
 *
 * 本产物含第三方开源组件:
 *   tyme4ts v1.5.2 — Copyright (c) 2024 6tail — MIT License
 *   https://github.com/6tail/tyme4ts
 * 完整许可文本见仓库根目录 LICENSE 与 licenses/tyme4ts-LICENSE。
 */
EOF
  # 注意: esbuild 的 stdin 管道模式走 transform API(不支持 --outfile 构建 flag), 结果须重定向 stdout
  # 顺序: boot(引导) → constants → engine → chuanren → mingli → bazi → app
  { cat qimen_boot.js qimen_constants.js qimen_engine_min.js qimen_chuanren.js qimen_mingli.js qimen_bazi.js yinpan_app.js; } \
    | npx esbuild --minify --target=es2017 --loader=js > "$BANNER.body" || Die 'esbuild 打包 JS 失败'
  # banner 在压缩**之后**前置: esbuild 会把 legal comment 挪到文件末尾, 且 stdin 模式
  # 不支持 --banner:js, 所以自行拼接以保证版权声明稳定出现在产物开头。
  cat "$BANNER" "$BANNER.body" > qimen_bundle.min.js
  rm -f "$BANNER" "$BANNER.body"
  printf '   bundle 生成: qimen_app/js/qimen_bundle.min.js (%s bytes)\n' "$(wc -c < qimen_bundle.min.js)"

  # ---- CSS 压缩 ----
  # 实测 37345 → 23572 字节(-37%), 且与未压缩版做过逐元素 computed style 比对
  # (六大盘型共 4000+ 元素 × 41 属性, 0 差异), 可安全替换。
  # 源文件 yinpan_app.css 保持可读不覆盖; 压缩产物另存 .min.css, 由各构建脚本
  # 拷贝为产物目录下的 yinpan_app.css —— HTML 里的引用名保持不变。
  npx esbuild --minify --loader=css < ../css/yinpan_app.css > ../css/yinpan_app.min.css \
    || Die 'esbuild 压缩 CSS 失败'
  printf '   CSS 生成: qimen_app/css/yinpan_app.min.css (%s bytes)\n' "$(wc -c < ../css/yinpan_app.min.css)"
  cd "$ROOT"
}

# ============================ linux (Tauri 桌面) ============================
cmd_linux() {
  local bundles="${1:-deb,rpm}"
  prepare_web
  Step "Tauri 编译 (--bundles $bundles)"
  ( cd "$ROOT/src-tauri" && npx tauri build --bundles "$bundles" ) || Die 'Tauri 构建失败'

  Step '完成'
  ls -lh "$ROOT/src-tauri/target/release/app" 2>/dev/null
  ls -lh "$ROOT"/src-tauri/target/release/bundle/deb/*.deb 2>/dev/null
  ls -lh "$ROOT"/src-tauri/target/release/bundle/rpm/*.rpm 2>/dev/null
  ls -lh "$ROOT"/src-tauri/target/release/bundle/appimage/*.AppImage 2>/dev/null
  Info "运行: npm start    (或 $ROOT/src-tauri/target/release/app)"
}

# ============================ appimage ============================
# 构建 Linux AppImage —— 含「WebKit 辅助进程路径」补丁，使产物真正零安装。
#
# ── 为什么需要这个补丁 ────────────────────────────────────────────────
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
cmd_appimage() {
  local PATCH_ONLY=0
  [ "${1:-}" = "--patch-only" ] && PATCH_ONLY=1

  local PATCH_OLD='/usr/lib/webkit2gtk-4.1'
  local PATCH_NEW='/tmp/qimen-wk/webkit41'          # 必须不长于 PATCH_OLD
  local HOOK_MARK='qimen-wk'
  local BUNDLE_DIR="$ROOT/src-tauri/target/release/bundle/appimage"
  local TAURI_CACHE="$HOME/.cache/tauri"
  local LD_EXTRACT=/tmp/ld-extract                  # linuxdeploy 解压目录（两个分支都要用）

  # 若打包工具不在 PATH，可先用 QIMEN_TOOLS_DIR 指向解包目录（免 root 从镜像解包）：
  #   QIMEN_TOOLS_DIR=/tmp/tools bash scripts/build.sh appimage
  # 例：mirrors.tuna.tsinghua.edu.cn/archlinux/extra/os/x86_64/
  #     {patchelf,squashfs-tools,zsync}-<ver>-x86_64.pkg.tar.zst  → tar --zstd -xf
  [ -n "${QIMEN_TOOLS_DIR:-}" ] && export PATH="$QIMEN_TOOLS_DIR/usr/bin:$PATH"

  # ── 1. 工具检查 ──
  local missing=0 t
  for t in patchelf mksquashfs zsyncmake; do
    command -v "$t" >/dev/null 2>&1 || { echo "❌ 缺少 $t"; missing=1; }
  done
  if [ "$missing" = 1 ]; then
    cat <<'TIP'
   这三个工具 AppImage 打包必需。Arch 安装方式：
     sudo pacman -S patchelf squashfs-tools zsync
   免 root 获取方式：
     mkdir -p /tmp/pkgs /tmp/tools && cd /tmp/pkgs
     for p in patchelf squashfs-tools zsync; do
       url=$(pacman -Sp $p | awk '{print $1"x86_64/"$2}')   # 或用镜像直链
       curl -sLO "$url" && tar --zstd -xf "$(basename "$url")" -C /tmp/tools
     done
     QIMEN_TOOLS_DIR=/tmp/tools bash scripts/build.sh appimage
TIP
    exit 1
  fi

  # ── 2. 生成 AppDir 并部署依赖 ──
  if [ "$PATCH_ONLY" = 0 ]; then
    echo "=== 2/4 生成 AppDir（Tauri 调用 linuxdeploy 时会失败，属预期）==="
    prepare_web
    ( cd "$ROOT/src-tauri" && APPIMAGE_EXTRACT_AND_RUN=1 npx tauri build --bundles appimage >/dev/null 2>&1 || true )

    local APPDIR
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
    APPIMAGE_EXTRACT_AND_RUN=1 VERSION="${VERSION:-$(grep -m1 '"version"' "$ROOT/src-tauri/tauri.conf.json" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')}" \
      PATH="/tmp/ld-plugins:$PATH" \
      "$LD_EXTRACT/squashfs-root/AppRun" --appdir "$APPDIR" >/tmp/qimen-linuxdeploy.log 2>&1 || {
        echo "⚠️  linuxdeploy 返回非 0（日志 /tmp/qimen-linuxdeploy.log），继续尝试打包"; }
  else
    local APPDIR
    APPDIR=$(find "$BUNDLE_DIR" -maxdepth 1 -name '*.AppDir' -print -quit)
    [ -n "$APPDIR" ] || { echo "❌ 未找到 AppDir（先跑一次不带 --patch-only）"; exit 1; }
  fi

  # ── 3. WebKit 辅助进程路径补丁 ──
  echo "=== 3/4 WebKit 路径补丁 ==="
  local WKLIB="$APPDIR/usr/lib/libwebkit2gtk-4.1.so.0"
  [ -f "$WKLIB" ] || { echo "❌ 未找到 $WKLIB"; exit 1; }

  PATCH_OLD="$PATCH_OLD" PATCH_NEW="$PATCH_NEW" WKLIB="$WKLIB" "$PY" - <<'PY' || Die 'WebKit 路径补丁失败(需要 python3)'
import io, os, re
lib, new = os.environ['WKLIB'], os.environ['PATCH_NEW'].encode()
data = io.open(lib, 'rb').read()
# 自动探测库中的辅助进程目录 —— 各发行版编译期取值差异极大，写死必翻车：
#   Arch:            /usr/lib/webkit2gtk-4.1
#   Ubuntu(实测):    /.//lib/x86_64-linux-gnu/webkit2gtk-4.1   ← Debian 的 DESTDIR 风格，连 /usr 都没有
# 首版正则按 Arch 的形状写成 `^/usr/lib`，结果在 CI 上 0 命中、静默跳过补丁
# （产物依旧无法在无 webkit 的机器上启动），靠回读 CI 产物才发现。
# 判据改为「路径中必须含 /lib/」，既能覆盖上述两种，又能排除库里那数百处
# /usr/src/debug/webkit2gtk-4.1 编译期调试路径。
pat = rb'/[A-Za-z0-9_./+-]*/lib/[A-Za-z0-9_./+-]*webkit2gtk-4\.1'
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

  local HOOK_DIR="$APPDIR/apprun-hooks"
  local HOOK="$HOOK_DIR/linuxdeploy-plugin-gtk.sh"

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
# 由 scripts/build.sh appimage 生成：把 Tauri 的二进制 AppRun 包一层，
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

# --- WebKit 辅助进程路径补丁（见 scripts/build.sh 的 appimage 子命令）---
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
  local PLUGIN="$LD_EXTRACT/squashfs-root/plugins/linuxdeploy-plugin-appimage/AppRun"
  [ -x "$PLUGIN" ] || PLUGIN="$TAURI_CACHE/linuxdeploy-plugin-appimage.AppImage"
  local VER OUT
  VER="${VERSION:-$(grep -m1 '"version"' "$ROOT/src-tauri/tauri.conf.json" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')}"
  rm -f "$ROOT"/src-tauri/*.AppImage
  ( cd "$ROOT/src-tauri" && APPIMAGE_EXTRACT_AND_RUN=1 VERSION="$VER" "$PLUGIN" --appdir "$ROOT/$APPDIR" >/tmp/qimen-appimage.log 2>&1 ) || {
    echo "❌ 打包失败，日志尾部："; tail -15 /tmp/qimen-appimage.log; exit 1; }

  OUT=$(find "$ROOT/src-tauri" -maxdepth 1 -name '*.AppImage' -print -quit)
  [ -n "$OUT" ] || { echo "❌ 未产出 AppImage，日志尾部："; tail -15 /tmp/qimen-appimage.log; exit 1; }

  # 自检：确认补丁确实进了产物
  # ⚠️ 别写成 `grep -c ... || echo 0` —— grep -c 无匹配时会**输出 "0" 且返回 1**，
  # 于是 `||` 又追加一个 0，得到两行的 "0\n0"，后面 `[ "$ok" -gt 0 ]` 直接报
  # "integer expression expected"（CI 上就这么翻过一次）。用 `| head -1` 取单行。
  local tmp; tmp=$(mktemp -d); trap 'rm -rf "$tmp"' RETURN
  ( cd "$tmp" && "$OUT" --appimage-extract >/dev/null 2>&1 )
  local TMP_WKLIB TMP_HOOK ok_lib ok_hook
  TMP_WKLIB=$(find "$tmp/squashfs-root" -name 'libwebkit2gtk-4.1.so.0' -print -quit 2>/dev/null)
  TMP_HOOK=$(find "$tmp/squashfs-root" -path '*apprun-hooks*' -name '*.sh' -print -quit 2>/dev/null)
  ok_lib=$(grep -ac "$PATCH_NEW" "$TMP_WKLIB" 2>/dev/null | head -1); ok_lib=${ok_lib:-0}
  ok_hook=$(grep -ac "$HOOK_MARK" "$TMP_HOOK" 2>/dev/null | head -1); ok_hook=${ok_hook:-0}

  echo ""
  echo "✅ 产物: $OUT  ($(du -h "$OUT" | cut -f1))"
  echo "   自检: 库内新路径 $ok_lib 处，hook 命中 $ok_hook 处 $([ "$ok_lib" -gt 0 ] && [ "$ok_hook" -gt 0 ] && echo '→ 补丁已生效' || echo '❌ 补丁异常')"
  echo "   提示: 目标机无需安装 webkit2gtk-4.1；仍建议装 libfuse2 以便直接双击。"
}

# ============================ android ============================
# Android 那套逻辑(资源准备 + cap sync + 9 项 CI 对齐补丁 + 版本签名 + gradle)
# 与桌面链路无关, 独立在 build-android.sh, 这里只做转调, 保证 npm run build:android 与
# scripts/build.sh android 等价。
cmd_android() {
  local script="$ROOT/scripts/build-android.sh"
  [ -f "$script" ] || Die "找不到 $script"
  exec bash "$script" "$@"
}

# ============================ 内网部署 ============================
# 构建完成后自动把网页版同步到内网 nginx(192.168.1.3, 见 deploy-web.py), 手机浏览器
# 直接开 http://192.168.1.3/qimen_app/yinpan.html 就能验证 —— 比装 APK 快得多。
# 凭据走环境变量 QIMEN_WEB_PASS 或项目根 .qimen-web-pass(已 gitignore)。
# **同步失败只提示, 不影响构建产物**; 加 --no-deploy 可整体跳过。
deploy_web() {
  Step '同步网页版到内网服务器'
  [ -f "$ROOT/scripts/deploy-web.py" ] || { Info '跳过(缺 deploy-web.py)'; return 0; }
  [ -n "$PY" ] || { Info '跳过(缺 python3)'; return 0; }
  if "$PY" "$ROOT/scripts/deploy-web.py"; then
    Ok '网页版已同步'
  else
    Warn '同步未成功(不影响构建产物); 单独重试: npm run deploy:web'
  fi
  return 0
}

# ============================ 派发 ============================
usage() { awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"; exit 0; }

# 全局开关 --no-deploy: 先摘出来, 不往下传给子命令
NO_DEPLOY=0
_args=()
for _a in "$@"; do
  case "$_a" in
    -NoDeploy|--no-deploy|no-deploy) NO_DEPLOY=1 ;;
    *) _args+=("$_a") ;;
  esac
done
if [ "${#_args[@]}" -eq 0 ]; then set --; else set -- "${_args[@]}"; fi

case "${1:-all}" in
  bundle)   shift; cmd_bundle "$@"; [ "$NO_DEPLOY" = 1 ] || deploy_web ;;
  linux)    shift; cmd_linux "$@";  [ "$NO_DEPLOY" = 1 ] || deploy_web ;;
  appimage) shift; cmd_appimage "$@" ;;   # 纯打包, 与网页版无关, 不部署
  android)  shift; cmd_android "$@" ;;    # build-android.sh 内部自带部署
  all)
    shift || true
    cmd_bundle
    cmd_linux "${1:-deb,rpm}"
    [ "$NO_DEPLOY" = 1 ] || deploy_web
    Info '如需 Android APK: npm run build:android'
    ;;
  -h|--help|help) usage ;;
  *) echo "未知子命令: $1"; echo "可用: bundle | linux | appimage | android | all"; exit 2 ;;
esac
